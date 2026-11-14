const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const dbMod = require('./db');

let isSyncing = false;
let cachedAccessToken = null;
let cachedTokenExpiry = 0;

function base64Url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

/**
 * Generates an OAuth2 access token from a Google Service Account JSON
 * using built-in node:crypto RS256 signing (zero external dependencies).
 */
async function getServiceAccountAccessToken(saJsonStr) {
  if (cachedAccessToken && Date.now() < cachedTokenExpiry - 60000) {
    return cachedAccessToken;
  }
  const sa = typeof saJsonStr === 'string' ? JSON.parse(saJsonStr) : saJsonStr;
  if (!sa.client_email || !sa.private_key) {
    throw new Error('Service Account JSON ต้องมี client_email และ private_key');
  }
  const nowSec = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = base64Url(
    JSON.stringify({
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/spreadsheets',
      aud: 'https://oauth2.googleapis.com/token',
      exp: nowSec + 3600,
      iat: nowSec,
    })
  );
  const signInput = `${header}.${claim}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(signInput);
  const sig = base64Url(signer.sign(sa.private_key));
  const jwt = `${signInput}.${sig}`;

  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  const data = await resp.json();
  if (!resp.ok || !data.access_token) {
    throw new Error(`OAuth2 token error: ${data.error_description || data.error || resp.status}`);
  }
  cachedAccessToken = data.access_token;
  cachedTokenExpiry = Date.now() + (data.expires_in || 3600) * 1000;
  return cachedAccessToken;
}

async function sendViaAppsScript(url, secret, item) {
  const payload = JSON.parse(item.payload_json || '{}');
  const resp = await fetch(url, {
    method: 'POST',
    redirect: 'follow',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      secret: secret || '',
      targetSheet: item.target_sheet,
      action: item.action,
      payload,
    }),
  });
  const text = await resp.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`Apps Script returned non-JSON (status ${resp.status}): ${text.slice(0, 180)}`);
  }
  if (!parsed.ok) {
    throw new Error(parsed.error || 'Apps Script sync failed');
  }
  return parsed.result;
}

async function sheetsApiRequest(token, url, method = 'GET', bodyObj = null) {
  const opts = {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  };
  if (bodyObj) opts.body = JSON.stringify(bodyObj);
  const resp = await fetch(url, opts);
  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(data.error?.message || `Google Sheets API HTTP ${resp.status}`);
  }
  return data;
}

/**
 * Fallback direct Google Sheets v4 API writer when Service Account JSON is configured
 * instead of the Apps Script Web App bridge.
 */
async function sendViaSheetsApiV4(cfg, item) {
  const token = await getServiceAccountAccessToken(cfg.service_account_json);
  const payload = JSON.parse(item.payload_json || '{}');

  if (item.target_sheet === 'pawn') {
    const ssId = cfg.pawn_sheet_id || dbMod.SHEET_IDS.pawn;
    const sheetName = payload.sheet_name || (Number(payload.ticket_no) >= 6001 ? 'เริ่ม 6001' : 'เริ่ม 4844');
    const colA = await sheetsApiRequest(
      token,
      `https://sheets.googleapis.com/v4/spreadsheets/${ssId}/values/${encodeURIComponent(`'${sheetName}'!A2:A`)}`
    );
    const rows = colA.values || [];
    let targetRow = 0;
    const tkStr = String(payload.ticket_no || '').trim();
    for (let i = rows.length - 1; i >= 0; i--) {
      if (String(rows[i]?.[0] || '').trim() === tkStr) {
        targetRow = i + 2;
        break;
      }
    }
    if (!targetRow) {
      let lastNonEmpty = 1;
      for (let i = rows.length - 1; i >= 0; i--) {
        if (String(rows[i]?.[0] || '').trim() !== '') {
          lastNonEmpty = i + 2;
          break;
        }
      }
      targetRow = lastNonEmpty + 1;
    }

    const paidDates = Array.isArray(payload.paid_dates) ? payload.paid_dates : [];
    const rowValues = [
      Number(tkStr) || tkStr,
      payload.customer_name || '',
      payload.item_desc || '',
      payload.item_qty || '',
      payload.note || '',
      payload.weight_g ? Number(payload.weight_g) : '',
      Number(payload.principal) || 0,
      `=G${targetRow}*2%`,
      payload.term_raw || payload.term_months || 3,
      payload.pawn_date ? dbMod.formatThaiDateShort(payload.pawn_date) : '',
      payload.status || '',
      payload.redeem_date ? dbMod.formatThaiDateShort(payload.redeem_date) : '',
      ...paidDates.map((d) => dbMod.formatThaiDateShort(d)),
    ];

    const range = `'${sheetName}'!A${targetRow}`;
    await sheetsApiRequest(
      token,
      `https://sheets.googleapis.com/v4/spreadsheets/${ssId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`,
      'PUT',
      { range, majorDimension: 'ROWS', values: [rowValues] }
    );
    return { sheetName, row: targetRow };
  }

  throw new Error('สำหรับการซิงค์บัญชีและสต๊อกแบบรักษาสูตรอัตโนมัติ กรุณาติดตั้ง Apps Script Web App URL (Code.gs)');
}

async function processSyncQueue() {
  if (isSyncing) return { skipped: true };
  const cfg = dbMod.getSyncConfig();
  if (cfg.auto_sync_enabled === '0') {
    return { skipped: true, reason: 'auto_sync_disabled' };
  }
  const hasAppsScript = Boolean((cfg.apps_script_url || '').trim());
  const hasServiceAcc = Boolean((cfg.service_account_json || '').trim());
  if (!hasAppsScript && !hasServiceAcc) {
    return { skipped: true, reason: 'no_endpoint_configured' };
  }

  isSyncing = true;
  let processed = 0;
  let failed = 0;
  try {
    const pending = dbMod.db
      .prepare("SELECT * FROM sync_queue WHERE status IN ('pending', 'failed') ORDER BY id ASC LIMIT 50")
      .all();

    for (const item of pending) {
      try {
        if (hasAppsScript) {
          await sendViaAppsScript(cfg.apps_script_url.trim(), cfg.apps_script_secret, item);
        } else {
          await sendViaSheetsApiV4(cfg, item);
        }
        dbMod.updateSyncQueueItem(item.id, 'synced', '');
        processed++;
      } catch (err) {
        dbMod.updateSyncQueueItem(item.id, 'failed', err.message || String(err));
        failed++;
      }
    }
    if (processed > 0) {
      dbMod.setSyncConfig({ last_push_at: new Date().toISOString() });
    }
    return { processed, failed };
  } finally {
    isSyncing = false;
  }
}

function enqueueAndSync(targetSheet, action, payload) {
  const item = dbMod.enqueueSync(targetSheet, action, payload);
  // Trigger async real-time push without blocking the UI response
  setImmediate(() => {
    processSyncQueue().catch(() => {});
  });
  return item;
}

function findGdriveExecutable() {
  if (process.env.GDRIVE_BIN && fs.existsSync(process.env.GDRIVE_BIN)) {
    return process.env.GDRIVE_BIN;
  }
  const tempRoot = process.env.TEMP || process.env.TMP || '';
  if (tempRoot && fs.existsSync(tempRoot)) {
    try {
      const dirs = fs.readdirSync(tempRoot).filter((d) => d.startsWith('agy-plugin-cli-'));
      for (const d of dirs) {
        const candidate = path.join(tempRoot, d, 'gdrive.cmd');
        if (fs.existsSync(candidate)) return candidate;
      }
    } catch {
      // ignore
    }
  }
  const builtin = path.join(
    process.env.USERPROFILE || '',
    '.gemini',
    'config',
    'plugins',
    'gdrive',
    'skills',
    'gdrive',
    'scripts',
    'gdrive.cmd'
  );
  if (fs.existsSync(builtin)) return builtin;
  return 'gdrive';
}

function runGdriveExport(gdriveBin, fileId, outPath) {
  return new Promise((resolve, reject) => {
    execFile(
      gdriveBin,
      ['readonly', 'export', fileId, outPath, '--format', 'xlsx'],
      { shell: process.platform === 'win32', timeout: 60000 },
      (err, stdout, stderr) => {
        if (err) {
          reject(new Error(stderr || stdout || err.message));
        } else {
          resolve(stdout);
        }
      }
    );
  });
}

async function pullFromGoogleSheets() {
  const cfg = dbMod.getSyncConfig();
  const snapDir = path.join(__dirname, '..', 'data', 'snapshots');
  fs.mkdirSync(snapDir, { recursive: true });
  const gdriveBin = findGdriveExecutable();

  const targets = [
    { id: cfg.pawn_sheet_id || dbMod.SHEET_IDS.pawn, file: path.join(snapDir, 'pawn.xlsx') },
    { id: cfg.account_sheet_id || dbMod.SHEET_IDS.account, file: path.join(snapDir, 'account.xlsx') },
    { id: cfg.stock_sheet_id || dbMod.SHEET_IDS.stock, file: path.join(snapDir, 'stock.xlsx') },
  ];

  const logs = [];
  for (const t of targets) {
    const tmpFile = `${t.file}.tmp`;
    await runGdriveExport(gdriveBin, t.id, tmpFile);
    fs.renameSync(tmpFile, t.file);
    logs.push(`${path.basename(t.file)} updated`);
  }

  const seeded = dbMod.reseedFromSnapshots();
  const nowIso = new Date().toISOString();
  dbMod.setSyncConfig({ last_pull_at: nowIso });
  return { ok: true, logs, seeded, pulledAt: nowIso };
}

function getCodeGsSource() {
  const gsPath = path.join(__dirname, '..', 'google-apps-script', 'Code.gs');
  return fs.existsSync(gsPath) ? fs.readFileSync(gsPath, 'utf8') : '';
}

module.exports = {
  processSyncQueue,
  enqueueAndSync,
  pullFromGoogleSheets,
  getCodeGsSource,
};
