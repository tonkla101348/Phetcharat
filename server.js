const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { exec } = require('child_process');
const { URL } = require('url');
const dbMod = require('./src/db');
const syncMod = require('./src/googleSync');

const PORT = Number(process.env.PORT) || 3456;
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > 5 * 1024 * 1024) {
        reject(new Error('Request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8').trim();
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function serveStatic(reqPath, res) {
  let cleanPath = reqPath === '/' ? '/index.html' : reqPath;
  cleanPath = path.normalize(cleanPath).replace(/^(\.\.[\/\\])+/, '');
  const fullPath = path.join(PUBLIC_DIR, cleanPath);
  if (!fullPath.startsWith(PUBLIC_DIR) || !fs.existsSync(fullPath) || fs.statSync(fullPath).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
    return;
  }
  const ext = path.extname(fullPath).toLowerCase();
  res.writeHead(200, {
    'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
    'Cache-Control': 'no-store',
  });
  fs.createReadStream(fullPath).pipe(res);
}

async function handleApi(req, res, parsedUrl) {
  const pathname = parsedUrl.pathname;
  const method = req.method;

  if (method === 'GET' && pathname === '/api/dashboard') {
    return sendJson(res, 200, { ok: true, data: dbMod.getDashboardSummary() });
  }

  if (method === 'GET' && pathname === '/api/pawn/next-no') {
    return sendJson(res, 200, { ok: true, nextTicketNo: dbMod.getNextTicketNo() });
  }

  if (method === 'GET' && pathname === '/api/pawn') {
    const q = parsedUrl.searchParams;
    const data = dbMod.getPawnTicketsWithOverdue({
      search: q.get('search') || '',
      status: q.get('status') || 'all',
      sheet: q.get('sheet') || 'all',
      overdueOnly: q.get('overdueOnly') === '1' || q.get('overdueOnly') === 'true',
      limit: Number(q.get('limit')) || 150,
      offset: Number(q.get('offset')) || 0,
    });
    return sendJson(res, 200, { ok: true, data });
  }

  if (method === 'POST' && pathname === '/api/pawn') {
    const body = await parseJsonBody(req);
    const result = dbMod.createPawnTicket(body);
    syncMod.enqueueAndSync('pawn', 'upsertPawnTicket', result.ticket);
    if (result.accountEntry) {
      syncMod.enqueueAndSync('account', 'addAccountEntry', result.accountEntry);
    }
    return sendJson(res, 201, { ok: true, data: result });
  }

  const pawnActionMatch = pathname.match(/^\/api\/pawn\/([^/]+)\/action$/);
  if (method === 'POST' && pawnActionMatch) {
    const idOrTicket = decodeURIComponent(pawnActionMatch[1]);
    const body = await parseJsonBody(req);
    const result = dbMod.performPawnAction(idOrTicket, body);
    syncMod.enqueueAndSync('pawn', 'upsertPawnTicket', result.ticket);
    if (result.accountEntry) {
      syncMod.enqueueAndSync('account', 'addAccountEntry', result.accountEntry);
    }
    return sendJson(res, 200, { ok: true, data: result });
  }

  const pawnDeleteMatch = pathname.match(/^\/api\/pawn\/([^/]+)$/);
  if (method === 'DELETE' && pawnDeleteMatch) {
    const idOrTicket = decodeURIComponent(pawnDeleteMatch[1]);
    const result = dbMod.deletePawnTicket(idOrTicket, { delete_linked_account: true });
    syncMod.enqueueAndSync('pawn', 'deletePawnTicket', {
      ticket_no: result.deleted.ticket_no,
      sheet_name: result.deleted.sheet_name,
      sheet_row: result.deleted.sheet_row,
    });
    for (const acc of result.deletedAccountEntries || []) {
      syncMod.enqueueAndSync('account', 'deleteAccountEntry', acc);
    }
    return sendJson(res, 200, { ok: true, data: result });
  }

  if (method === 'GET' && pathname === '/api/account') {
    const monthKey = parsedUrl.searchParams.get('month') || '';
    return sendJson(res, 200, { ok: true, data: dbMod.getAccountMonthView(monthKey) });
  }

  if (method === 'GET' && pathname === '/api/account/overview') {
    return sendJson(res, 200, { ok: true, data: dbMod.getAnnualOverview() });
  }

  if (method === 'POST' && pathname === '/api/account/entry') {
    const body = await parseJsonBody(req);
    const entry = dbMod.addAccountEntry(body);
    syncMod.enqueueAndSync('account', 'addAccountEntry', entry);

    // Optional automatic stock deduction/addition when selling/buying gold from the ledger
    let stockResult = null;
    if (body.stock_col && Number(body.stock_qty) > 0 && (body.stock_move_type === 'out' || body.stock_move_type === 'in')) {
      stockResult = dbMod.upsertStockMovements(entry.date_iso, body.stock_move_type, {
        __mode: 'add',
        [body.stock_col]: Number(body.stock_qty),
      });
      syncMod.enqueueAndSync('stock', 'updateStockMovement', {
        date_iso: stockResult.dateIso,
        move_type: stockResult.moveType,
        mode: 'add',
        updates: { [body.stock_col]: Number(body.stock_qty) },
      });
    }
    return sendJson(res, 201, { ok: true, data: { entry, stockResult } });
  }

  const accEntryMatch = pathname.match(/^\/api\/account\/entry\/(\d+)$/);
  if (accEntryMatch && method === 'PUT') {
    const body = await parseJsonBody(req);
    const entry = dbMod.updateAccountEntry(accEntryMatch[1], body);
    return sendJson(res, 200, { ok: true, data: entry });
  }
  if (accEntryMatch && method === 'DELETE') {
    const deleted = dbMod.deleteAccountEntry(accEntryMatch[1]);
    syncMod.enqueueAndSync('account', 'deleteAccountEntry', deleted);
    return sendJson(res, 200, { ok: true, data: deleted });
  }

  if (method === 'POST' && pathname === '/api/account/daily-cash') {
    const body = await parseJsonBody(req);
    const day = dbMod.updateAccountDailyCash(body.date_iso, body.actual_cash, body.note);
    syncMod.enqueueAndSync('account', 'updateDailyCash', day);
    return sendJson(res, 200, { ok: true, data: day });
  }

  if (method === 'GET' && pathname === '/api/stock') {
    const dateIso = parsedUrl.searchParams.get('date') || dbMod.getTodayIsoBangkok();
    return sendJson(res, 200, { ok: true, data: dbMod.getStockSummaryAndHistory(dateIso) });
  }

  if (method === 'POST' && pathname === '/api/stock/movement') {
    const body = await parseJsonBody(req);
    const dateIso = body.date_iso || dbMod.getTodayIsoBangkok();
    const moveType = body.move_type || 'in';
    const updates = { ...(body.updates || {}) };
    if (body.mode === 'add') updates.__mode = 'add';

    const stockRes = dbMod.upsertStockMovements(dateIso, moveType, updates);
    syncMod.enqueueAndSync('stock', 'updateStockMovement', {
      date_iso: stockRes.dateIso,
      move_type: stockRes.moveType,
      mode: stockRes.mode,
      updates: body.updates || {},
    });

    // Optional cross-posting to daily account ledger (e.g. ขายทอง / รับซื้อทองเก่า)
    let accountEntry = null;
    if (body.record_account && Number(body.account_amount) > 0) {
      let totalWeightG = 0;
      for (const ch of stockRes.changed) {
        const colDef = dbMod.STOCK_COLUMN_MAP[ch.col_key];
        if (colDef) {
          totalWeightG += colDef.isWeight ? ch.qty : ch.qty * colDef.unitWeight;
        }
      }
      totalWeightG = Math.round(totalWeightG * 100) / 100;

      if (moveType === 'out') {
        accountEntry = dbMod.addAccountEntry({
          date_iso: stockRes.dateIso,
          description: body.account_desc || 'ขายทอง',
          new_gold_g: totalWeightG,
          inc_sell: Number(body.account_amount),
          exp_transfer: Number(body.transfer_amount) || 0,
        });
      } else if (moveType === 'in') {
        accountEntry = dbMod.addAccountEntry({
          date_iso: stockRes.dateIso,
          description: body.account_desc || 'รับซื้อทองเก่า',
          old_gold_g: totalWeightG,
          exp_buy: Number(body.account_amount),
          exp_transfer: Number(body.transfer_amount) || 0,
        });
      }
      if (accountEntry) {
        syncMod.enqueueAndSync('account', 'addAccountEntry', accountEntry);
      }
    }

    return sendJson(res, 200, { ok: true, data: { stockRes, accountEntry } });
  }

  if (method === 'GET' && pathname === '/api/sync/status') {
    const cfg = dbMod.getSyncConfig();
    const queue = dbMod.getSyncQueue(60);
    return sendJson(res, 200, {
      ok: true,
      data: {
        config: {
          ...cfg,
          service_account_json: cfg.service_account_json ? '***configured***' : '',
          has_service_account: Boolean(cfg.service_account_json),
        },
        queue,
        codeGs: syncMod.getCodeGsSource(),
      },
    });
  }

  if (method === 'POST' && pathname === '/api/sync/config') {
    const body = await parseJsonBody(req);
    const allowedKeys = [
      'apps_script_url',
      'apps_script_secret',
      'service_account_json',
      'auto_sync_enabled',
      'pawn_sheet_id',
      'account_sheet_id',
      'stock_sheet_id',
    ];
    const updates = {};
    for (const k of allowedKeys) {
      if (body[k] !== undefined && body[k] !== '***configured***') {
        updates[k] = body[k];
      }
    }
    const cfg = dbMod.setSyncConfig(updates);
    return sendJson(res, 200, {
      ok: true,
      data: {
        ...cfg,
        service_account_json: cfg.service_account_json ? '***configured***' : '',
        has_service_account: Boolean(cfg.service_account_json),
      },
    });
  }

  if (method === 'POST' && pathname === '/api/sync/test') {
    const body = await parseJsonBody(req);
    const cfg = dbMod.getSyncConfig();
    const url = (body.apps_script_url || cfg.apps_script_url || '').trim();
    if (!url) {
      return sendJson(res, 400, { ok: false, error: 'กรุณากรอก Apps Script Web App URL ก่อนทดสอบ' });
    }
    const resp = await fetch(url, { method: 'GET', redirect: 'follow' });
    const text = await resp.text();
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      return sendJson(res, 400, { ok: false, error: `ตอบกลับไม่ใช่ JSON (HTTP ${resp.status}): ${text.slice(0, 150)}` });
    }
    return sendJson(res, 200, { ok: true, data: parsed });
  }

  if (method === 'POST' && pathname === '/api/sync/push') {
    const result = await syncMod.processSyncQueue();
    return sendJson(res, 200, { ok: true, data: result });
  }

  if (method === 'POST' && pathname === '/api/sync/pull') {
    const result = await syncMod.pullFromGoogleSheets();
    return sendJson(res, 200, { ok: true, data: result });
  }

  if (method === 'POST' && pathname === '/api/sync/reseed') {
    const result = dbMod.reseedFromSnapshots();
    return sendJson(res, 200, { ok: true, data: result });
  }

  return sendJson(res, 404, { ok: false, error: `Unknown API route: ${method} ${pathname}` });
}

dbMod.seedFromSnapshotsIfEmpty();

const server = http.createServer(async (req, res) => {
  try {
    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (parsedUrl.pathname.startsWith('/api/')) {
      await handleApi(req, res, parsedUrl);
    } else {
      serveStatic(parsedUrl.pathname, res);
    }
  } catch (err) {
    console.error('Server error:', err);
    sendJson(res, 500, { ok: false, error: err.message || 'Internal server error' });
  }
});

const HOST = process.env.HOST || '0.0.0.0';
server.listen(PORT, HOST, () => {
  console.log(`Phetcharat Gold Shop System running at:`);
  console.log(`  - PC (Local):      http://localhost:${PORT}`);
  const nets = os.networkInterfaces();
  for (const [name, addrs] of Object.entries(nets)) {
    for (const a of addrs || []) {
      if (a.family === 'IPv4' && !a.internal) {
        console.log(`  - ${name.padEnd(15)} http://${a.address}:${PORT}`);
      }
    }
  }
  if (process.argv.includes('--open') && process.platform === 'win32') {
    exec(`start "" "http://localhost:${PORT}"`);
  }
});
