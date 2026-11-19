const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const {
  parseXlsx,
  normalizeSheetDate,
  formatThaiDateShort,
  formatThaiDateLong,
  getTodayIsoBangkok,
  THAI_MONTHS_SHORT,
} = require('./xlsxParser');

const DATA_DIR = path.join(__dirname, '..', 'data');
const SNAPSHOTS_DIR = path.join(DATA_DIR, 'snapshots');
const DB_PATH = path.join(DATA_DIR, 'petcharat.db');

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(SNAPSHOTS_DIR, { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

const SHEET_IDS = {
  pawn: '1_ReGE-qfsq8WYvUoFvLlssuiAVBjiTwrMAuOsdyJjbw',
  account: '1-D5KyzBWZ6a9mt6Ns1iwuUuYgaTidihKPmBw-BMJb8Y',
  stock: '1-sm5_U2B7lUdARPFQJmK_-CjtwZnI3cVZpEIsQnK3I8',
};

const STOCK_COLUMNS = [
  { col: 'C', group: 'ทองเก่า นน.รวม', item: 'ทอง 90', unitWeight: 1, isWeight: true },
  { col: 'D', group: 'ทองเก่า นน.รวม', item: 'ทอง 96.5', unitWeight: 1, isWeight: true },

  { col: 'E', group: '1 กรัม', item: 'แหวน', unitWeight: 1.0, isWeight: false },
  { col: 'F', group: '1 กรัม', item: 'จี้', unitWeight: 1.0, isWeight: false },
  { col: 'G', group: '1 กรัม', item: 'แขน', unitWeight: 1.0, isWeight: false },
  { col: 'H', group: '1 กรัม', item: 'แท่ง', unitWeight: 1.0, isWeight: false },

  { col: 'I', group: 'ครึ่งสลึง (1.9 g)', item: 'คอ', unitWeight: 1.9, isWeight: false },
  { col: 'J', group: 'ครึ่งสลึง (1.9 g)', item: 'แขน', unitWeight: 1.9, isWeight: false },
  { col: 'K', group: 'ครึ่งสลึง (1.9 g)', item: 'แหวน', unitWeight: 1.9, isWeight: false },
  { col: 'L', group: 'ครึ่งสลึง (1.9 g)', item: 'จี้', unitWeight: 1.9, isWeight: false },
  { col: 'M', group: 'ครึ่งสลึง (1.9 g)', item: 'ต่างหู', unitWeight: 1.9, isWeight: false },
  { col: 'N', group: 'ครึ่งสลึง (1.9 g)', item: 'แท่ง', unitWeight: 1.9, isWeight: false },

  { col: 'O', group: '1 สลึง (3.8)', item: 'คอ', unitWeight: 3.8, isWeight: false },
  { col: 'P', group: '1 สลึง (3.8)', item: 'แขน', unitWeight: 3.8, isWeight: false },
  { col: 'Q', group: '1 สลึง (3.8)', item: 'แหวน', unitWeight: 3.8, isWeight: false },
  { col: 'R', group: '1 สลึง (3.8)', item: 'จี้', unitWeight: 3.8, isWeight: false },
  { col: 'S', group: '1 สลึง (3.8)', item: 'ต่างหู', unitWeight: 3.8, isWeight: false },
  { col: 'T', group: '1 สลึง (3.8)', item: 'แท่ง', unitWeight: 3.8, isWeight: false },

  { col: 'U', group: '2 สลึง (7.6)', item: 'คอ', unitWeight: 7.6, isWeight: false },
  { col: 'V', group: '2 สลึง (7.6)', item: 'แขน', unitWeight: 7.6, isWeight: false },
  { col: 'W', group: '2 สลึง (7.6)', item: 'แหวน', unitWeight: 7.6, isWeight: false },
  { col: 'X', group: '2 สลึง (7.6)', item: 'จี้', unitWeight: 7.6, isWeight: false },
  { col: 'Y', group: '2 สลึง (7.6)', item: 'ต่างหู', unitWeight: 7.6, isWeight: false },
  { col: 'Z', group: '2 สลึง (7.6)', item: 'แท่ง', unitWeight: 7.6, isWeight: false },

  { col: 'AA', group: '3 สลึง (11.4)', item: 'คอ', unitWeight: 11.4, isWeight: false },

  { col: 'AB', group: '1 บาท (15.2)', item: 'คอ', unitWeight: 15.2, isWeight: false },
  { col: 'AC', group: '1 บาท (15.2)', item: 'แขน', unitWeight: 15.2, isWeight: false },
  { col: 'AD', group: '1 บาท (15.2)', item: 'แหวน', unitWeight: 15.2, isWeight: false },
  { col: 'AE', group: '1 บาท (15.2)', item: 'จี้', unitWeight: 15.2, isWeight: false },
  { col: 'AF', group: '1 บาท (15.2)', item: 'ต่างหู', unitWeight: 15.2, isWeight: false },
  { col: 'AG', group: '1 บาท (15.2)', item: 'แท่ง', unitWeight: 15.2, isWeight: false },

  { col: 'AH', group: '2 บาท (30.4)', item: 'คอ', unitWeight: 30.4, isWeight: false },
  { col: 'AI', group: '2 บาท (30.4)', item: 'แขน', unitWeight: 30.4, isWeight: false },
  { col: 'AJ', group: '2 บาท (30.4)', item: 'แท่ง', unitWeight: 30.4, isWeight: false },

  { col: 'AK', group: '3 บาท (45.6)', item: 'คอ', unitWeight: 45.6, isWeight: false },
  { col: 'AL', group: '3 บาท (45.6)', item: 'แขน', unitWeight: 45.6, isWeight: false },
  { col: 'AM', group: '3 บาท (45.6)', item: 'แท่ง', unitWeight: 45.6, isWeight: false },

  { col: 'AN', group: 'ทอง 90%', item: 'หู', unitWeight: 0, isWeight: false },
  { col: 'AO', group: 'ทอง 90%', item: 'พระ', unitWeight: 0, isWeight: false },
  { col: 'AP', group: 'ทอง 90%', item: 'ห่วง', unitWeight: 0, isWeight: false },

  { col: 'AQ', group: '18 K', item: 'คอ', unitWeight: 0, isWeight: false },

  { col: 'AR', group: 'เพชร', item: 'แหวน', unitWeight: 0, isWeight: false },
  { col: 'AS', group: 'เพชร', item: 'แขน', unitWeight: 0, isWeight: false },

  { col: 'AT', group: 'ทอง 99.99 %', item: 'จี้', unitWeight: 0, isWeight: false },
  { col: 'AU', group: 'ทอง 99.99 %', item: 'แขน', unitWeight: 0, isWeight: false },
  { col: 'AV', group: 'ทอง 99.99 %', item: 'กิ๊บ', unitWeight: 0, isWeight: false },
  { col: 'AW', group: 'ทอง 99.99 %', item: 'คอ', unitWeight: 0, isWeight: false },

  { col: 'AX', group: 'ต่างๆ', item: 'ต่างๆ', unitWeight: 0, isWeight: false },
];

const STOCK_COLUMN_MAP = Object.fromEntries(STOCK_COLUMNS.map((c) => [c.col, c]));

const ACCOUNT_SHEET_ORDER = {
  'เริ่ม 16 เม.ย 69': 256904,
  'พ.ค. 69': 256905,
  'มิ.ย. 69': 256906,
  'ก.ค.69': 256907,
  'ส.ค. 69': 256908,
  'ก.ย. 69': 256909,
  'ต.ค. 69': 256910,
  'พ.ย. 69': 256911,
  'ธ.ค. 69': 256912,
};

const ISO_MONTH_TO_SHEET = {
  '2026-04': 'เริ่ม 16 เม.ย 69',
  '2026-05': 'พ.ค. 69',
  '2026-06': 'มิ.ย. 69',
  '2026-07': 'ก.ค.69',
  '2026-08': 'ส.ค. 69',
  '2026-09': 'ก.ย. 69',
  '2026-10': 'ต.ค. 69',
  '2026-11': 'พ.ย. 69',
  '2026-12': 'ธ.ค. 69',
};

function getMonthKeyForIsoDate(isoDate) {
  const ym = String(isoDate || getTodayIsoBangkok()).slice(0, 7);
  if (ISO_MONTH_TO_SHEET[ym]) return ISO_MONTH_TO_SHEET[ym];
  const [y, m] = ym.split('-').map(Number);
  const beShort = String((y + 543) % 100).padStart(2, '0');
  return `${THAI_MONTHS_SHORT[m - 1]} ${beShort}`;
}

function getMonthOrderForKey(monthKey, isoDate) {
  if (ACCOUNT_SHEET_ORDER[monthKey]) return ACCOUNT_SHEET_ORDER[monthKey];
  const s = String(monthKey || '').trim();
  for (let i = 0; i < THAI_MONTHS_SHORT.length; i++) {
    const mName = THAI_MONTHS_SHORT[i];
    const mNoDot = mName.replace(/\.$/, '');
    if (s.includes(mName) || s.includes(mNoDot)) {
      const ym = s.match(/(\d{2,4})\s*$/);
      if (ym) {
        let beYear = Number(ym[1]);
        if (beYear < 100) beYear += 2500;
        return beYear * 100 + (i + 1);
      }
    }
  }
  if (isoDate) {
    const [y, m] = isoDate.split('-').map(Number);
    return (y + 543) * 100 + m;
  }
  return 999999;
}

function getBeYearForMonthOrder(monthOrder) {
  if (!monthOrder || monthOrder >= 999999) return 2569;
  return Math.floor(Number(monthOrder) / 100);
}

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS pawn_tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_no TEXT NOT NULL,
      sheet_name TEXT NOT NULL DEFAULT 'เริ่ม 6001',
      sheet_row INTEGER,
      customer_name TEXT DEFAULT '',
      item_desc TEXT DEFAULT '',
      item_qty TEXT DEFAULT '',
      note TEXT DEFAULT '',
      weight_g REAL DEFAULT 0,
      principal REAL DEFAULT 0,
      interest_rate REAL DEFAULT 0.02,
      interest_amount REAL DEFAULT 0,
      term_months INTEGER DEFAULT 3,
      term_raw TEXT DEFAULT '3',
      pawn_date TEXT DEFAULT '',
      status TEXT DEFAULT '',
      redeem_date TEXT DEFAULT '',
      paid_dates_json TEXT DEFAULT '[]',
      updated_at TEXT DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_pawn_ticket_no ON pawn_tickets(ticket_no);
    CREATE INDEX IF NOT EXISTS idx_pawn_sheet ON pawn_tickets(sheet_name, sheet_row);

    CREATE TABLE IF NOT EXISTS account_months (
      month_key TEXT PRIMARY KEY,
      month_order INTEGER NOT NULL,
      carry_cash REAL DEFAULT 0,
      carry_pawn REAL DEFAULT 0,
      carry_new_gold_g REAL DEFAULT 0,
      carry_old_gold_g REAL DEFAULT 0,
      carry_inc_sell REAL DEFAULT 0,
      carry_inc_redeem REAL DEFAULT 0,
      carry_inc_interest REAL DEFAULT 0,
      carry_inc_other REAL DEFAULT 0,
      carry_exp_buy REAL DEFAULT 0,
      carry_exp_pawn REAL DEFAULT 0,
      carry_exp_other REAL DEFAULT 0,
      carry_exp_transfer REAL DEFAULT 0,
      carry_exp_home REAL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS account_days (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      month_key TEXT NOT NULL,
      date_iso TEXT NOT NULL,
      actual_cash REAL,
      summary_row INTEGER,
      note TEXT DEFAULT '',
      UNIQUE(month_key, date_iso)
    );
    CREATE INDEX IF NOT EXISTS idx_acc_days_month ON account_days(month_key, date_iso);

    CREATE TABLE IF NOT EXISTS account_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      month_key TEXT NOT NULL,
      date_iso TEXT NOT NULL,
      sheet_row INTEGER,
      description TEXT DEFAULT '',
      new_gold_g REAL DEFAULT 0,
      inc_sell REAL DEFAULT 0,
      inc_redeem REAL DEFAULT 0,
      inc_interest REAL DEFAULT 0,
      inc_other REAL DEFAULT 0,
      old_gold_g REAL DEFAULT 0,
      exp_buy REAL DEFAULT 0,
      exp_pawn REAL DEFAULT 0,
      exp_other REAL DEFAULT 0,
      exp_transfer REAL DEFAULT 0,
      exp_home REAL DEFAULT 0,
      linked_ticket_no TEXT DEFAULT '',
      created_at TEXT DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_acc_entries_date ON account_entries(month_key, date_iso, id);

    CREATE TABLE IF NOT EXISTS stock_opening (
      col_key TEXT PRIMARY KEY,
      qty REAL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS stock_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date_iso TEXT NOT NULL,
      move_type TEXT NOT NULL,
      col_key TEXT NOT NULL,
      qty REAL DEFAULT 0,
      sheet_row INTEGER,
      UNIQUE(date_iso, move_type, col_key)
    );
    CREATE INDEX IF NOT EXISTS idx_stock_date ON stock_movements(date_iso, move_type);

    CREATE TABLE IF NOT EXISTS sync_config (
      key TEXT PRIMARY KEY,
      value TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS sync_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      target_sheet TEXT NOT NULL,
      action TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      error_msg TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      synced_at TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS vat_sales_rows (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      month_key TEXT NOT NULL,
      row_order INTEGER NOT NULL DEFAULT 0,
      date_iso TEXT NOT NULL,
      invoice_no TEXT DEFAULT '',
      buyer_name TEXT DEFAULT '',
      gold_bar_price REAL DEFAULT 0,
      weight_g REAL DEFAULT 0,
      item_desc TEXT DEFAULT '',
      sale_amount REAL DEFAULT 0,
      exempt_base REAL DEFAULT 0,
      taxable_base REAL DEFAULT 0,
      vat_amount REAL DEFAULT 0,
      linked_entry_id INTEGER,
      updated_at TEXT DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_vat_sales_month ON vat_sales_rows(month_key, row_order, id);

    CREATE TABLE IF NOT EXISTS gold_daily_prices (
      date_iso TEXT PRIMARY KEY,
      bar_buy REAL NOT NULL,
      bar_sell REAL DEFAULT 0,
      orn_tax_base REAL DEFAULT 0,
      orn_sell REAL DEFAULT 0,
      seq INTEGER DEFAULT 0,
      time_str TEXT DEFAULT '',
      source TEXT DEFAULT 'ราคาทองคำวันนี้.com',
      updated_at TEXT NOT NULL
    );
  `);

  const defaults = {
    pawn_sheet_id: SHEET_IDS.pawn,
    account_sheet_id: SHEET_IDS.account,
    account_sheets_by_year_json: JSON.stringify({ '2569': SHEET_IDS.account }),
    stock_sheet_id: SHEET_IDS.stock,
    apps_script_url: '',
    apps_script_secret: '',
    service_account_json: '',
    auto_sync_enabled: '1',
    last_pull_at: '',
    last_push_at: '',
  };
  const insCfg = db.prepare('INSERT OR IGNORE INTO sync_config (key, value) VALUES (?, ?)');
  for (const [k, v] of Object.entries(defaults)) {
    insCfg.run(k, v);
  }
  seedDefaultNov69VatRowsIfEmpty();
  db.prepare("DELETE FROM sync_queue WHERE action = 'syncSalesTaxReport' AND status IN ('pending', 'failed')").run();
}

function numVal(cell) {
  if (!cell || cell.v === null || cell.v === undefined || cell.v === '') return 0;
  const n = Number(cell.v);
  return Number.isFinite(n) ? n : 0;
}

function strVal(cell) {
  if (!cell || cell.v === null || cell.v === undefined) return '';
  return String(cell.v).trim();
}

function parseTermMonths(rawVal) {
  const s = String(rawVal ?? '').trim();
  if (!s) return 3;
  if (s.includes('ปี')) {
    const yrs = parseFloat(s.replace(/[^0-9.]/g, '')) || 1;
    return Math.round(yrs * 12);
  }
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0) return 3;
  return Math.round(n);
}

function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function seedPawnFromXlsx(filePath) {
  const sheets = parseXlsx(filePath);
  const insertPawn = db.prepare(`
    INSERT INTO pawn_tickets (
      ticket_no, sheet_name, sheet_row, customer_name, item_desc, item_qty, note,
      weight_g, principal, interest_rate, interest_amount, term_months, term_raw,
      pawn_date, status, redeem_date, paid_dates_json, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const payCols = ['M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U'];
  const nowIso = new Date().toISOString();
  let totalInserted = 0;

  for (const sheetName of ['เริ่ม 4844', 'เริ่ม 6001']) {
    const sheet = sheets.find((s) => s.name === sheetName);
    if (!sheet) continue;
    let lastPawnDate = '';

    for (const row of sheet.rows) {
      if (row.r <= 1) continue;
      const c = row.cells;
      const ticketRaw = c.A?.v;
      const customerName = strVal(c.B);
      const itemDesc = strVal(c.C);
      const principal = numVal(c.G);

      // Update forward-fill date even if J is on a row with minimal data
      const parsedJ = normalizeSheetDate(c.J?.v);
      if (parsedJ) {
        lastPawnDate = parsedJ;
      }

      if (
        ((ticketRaw === null || ticketRaw === undefined || ticketRaw === '') && !customerName && principal === 0) ||
        (!customerName && !itemDesc && principal === 0)
      ) {
        continue;
      }

      const ticketNo = typeof ticketRaw === 'number' ? String(Math.round(ticketRaw)) : String(ticketRaw ?? '').trim();
      if (!ticketNo) continue;

      const itemQty = strVal(c.D);
      const note = strVal(c.E);
      const weightG = round2(numVal(c.F));
      const interestAmt = round2(numVal(c.H) || principal * 0.02);
      const termRaw = c.I?.v !== null && c.I?.v !== undefined ? String(c.I.v).trim() : '';
      const termMonths = parseTermMonths(termRaw);
      const pawnDate = parsedJ || lastPawnDate;
      const status = strVal(c.K);
      const redeemDate = normalizeSheetDate(c.L?.v);

      const paidDates = [];
      for (const pc of payCols) {
        if (c[pc] && c[pc].v !== null && c[pc].v !== undefined && c[pc].v !== '') {
          const pd = normalizeSheetDate(c[pc].v);
          if (pd) paidDates.push(pd);
        }
      }

      insertPawn.run(
        ticketNo,
        sheetName,
        row.r,
        customerName,
        itemDesc,
        itemQty,
        note,
        weightG,
        principal,
        0.02,
        interestAmt,
        termMonths,
        termRaw || String(termMonths),
        pawnDate,
        status,
        redeemDate,
        JSON.stringify(paidDates),
        nowIso
      );
      totalInserted++;
    }
  }
  return totalInserted;
}

function seedAccountFromXlsx(filePath) {
  const sheets = parseXlsx(filePath);
  const insMonth = db.prepare(`
    INSERT OR REPLACE INTO account_months (
      month_key, month_order, carry_cash, carry_pawn,
      carry_new_gold_g, carry_old_gold_g,
      carry_inc_sell, carry_inc_redeem, carry_inc_interest, carry_inc_other,
      carry_exp_buy, carry_exp_pawn, carry_exp_other, carry_exp_transfer, carry_exp_home
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insDay = db.prepare(`
    INSERT OR REPLACE INTO account_days (month_key, date_iso, actual_cash, summary_row, note)
    VALUES (?, ?, ?, ?, ?)
  `);
  const insEntry = db.prepare(`
    INSERT INTO account_entries (
      month_key, date_iso, sheet_row, description,
      new_gold_g, inc_sell, inc_redeem, inc_interest, inc_other,
      old_gold_g, exp_buy, exp_pawn, exp_other, exp_transfer, exp_home,
      linked_ticket_no, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const nowIso = new Date().toISOString();
  let totalEntries = 0;

  for (const sheet of sheets) {
    if (sheet.name === 'Template' || sheet.name.includes('ภาพรวม')) continue;
    const monthKey = sheet.name;
    const monthOrder = getMonthOrderForKey(monthKey);

    const row3 = sheet.rows.find((r) => r.r === 3)?.cells || {};
    const carryCash = numVal(row3.O);
    const carryPawn = numVal(row3.P);

    // Note: เริ่ม 16 เม.ย 69 has carried-forward sums in Row 3 (D3..M3, H3)
    const isApr = monthKey === 'เริ่ม 16 เม.ย 69';
    insMonth.run(
      monthKey,
      monthOrder,
      carryCash,
      carryPawn,
      isApr ? numVal(row3.C) : 0,
      isApr ? numVal(row3.H) : 0,
      isApr ? numVal(row3.D) : 0,
      isApr ? numVal(row3.E) : 0,
      isApr ? numVal(row3.F) : 0,
      isApr ? numVal(row3.G) : 0,
      isApr ? numVal(row3.I) : 0,
      isApr ? numVal(row3.J) : 0,
      isApr ? numVal(row3.K) : 0,
      isApr ? numVal(row3.L) : 0,
      isApr ? numVal(row3.M) : 0
    );

    let currentDateIso = '';
    let pendingEntries = [];

    for (const row of sheet.rows) {
      if (row.r <= 3) continue;
      const c = row.cells;
      const bVal = strVal(c.B);

      if (c.A && c.A.v !== null && c.A.v !== undefined && c.A.v !== '') {
        const parsedA = normalizeSheetDate(c.A.v);
        if (parsedA) currentDateIso = parsedA;
      }

      if (bVal === 'สรุปวัน') {
        const hasCash = c.O && c.O.v !== null && c.O.v !== undefined && c.O.v !== '';
        const actualCash = hasCash ? numVal(c.O) : null;
        if (currentDateIso && (pendingEntries.length > 0 || actualCash !== null)) {
          insDay.run(monthKey, currentDateIso, actualCash, row.r, '');
          for (const ent of pendingEntries) {
            insEntry.run(
              monthKey,
              currentDateIso,
              ent.sheetRow,
              ent.description,
              ent.new_gold_g,
              ent.inc_sell,
              ent.inc_redeem,
              ent.inc_interest,
              ent.inc_other,
              ent.old_gold_g,
              ent.exp_buy,
              ent.exp_pawn,
              ent.exp_other,
              ent.exp_transfer,
              ent.exp_home,
              ent.linked_ticket_no,
              nowIso
            );
            totalEntries++;
          }
        }
        pendingEntries = [];
        currentDateIso = '';
        continue;
      }

      if (bVal === 'รวม' || bVal === 'สะสม') {
        continue;
      }

      const entry = {
        sheetRow: row.r,
        description: bVal,
        new_gold_g: round2(numVal(c.C)),
        inc_sell: round2(numVal(c.D)),
        inc_redeem: round2(numVal(c.E)),
        inc_interest: round2(numVal(c.F)),
        inc_other: round2(numVal(c.G)),
        old_gold_g: round2(numVal(c.H)),
        exp_buy: round2(numVal(c.I)),
        exp_pawn: round2(numVal(c.J)),
        exp_other: round2(numVal(c.K)),
        exp_transfer: round2(numVal(c.L)),
        exp_home: round2(numVal(c.M)),
        linked_ticket_no: '',
      };

      // Extract ticket number if description starts with digits (e.g. "5178", "5302เพิ่มยอดจำ", "5480ลดต้น")
      const tkMatch = bVal.match(/^(\d{4,5})/);
      if (tkMatch) {
        entry.linked_ticket_no = tkMatch[1];
      }

      const hasAnyValue =
        entry.description ||
        entry.new_gold_g ||
        entry.inc_sell ||
        entry.inc_redeem ||
        entry.inc_interest ||
        entry.inc_other ||
        entry.old_gold_g ||
        entry.exp_buy ||
        entry.exp_pawn ||
        entry.exp_other ||
        entry.exp_transfer ||
        entry.exp_home;

      if (hasAnyValue) {
        pendingEntries.push(entry);
      }
    }
  }
  return totalEntries;
}

function seedStockFromXlsx(filePath) {
  const sheets = parseXlsx(filePath);
  const sheet = sheets[0];
  if (!sheet) return 0;

  const rowMap = new Map();
  for (const row of sheet.rows) {
    rowMap.set(row.r, row.cells);
  }

  // Row 3: ยอดยกมา
  const r3 = rowMap.get(3) || {};
  const insOpen = db.prepare('INSERT OR REPLACE INTO stock_opening (col_key, qty) VALUES (?, ?)');
  for (const colDef of STOCK_COLUMNS) {
    insOpen.run(colDef.col, round2(numVal(r3[colDef.col])));
  }

  // Daily blocks start at Row 4, 9, 14, ... (5 rows per day: รับใหม่, ขาย, ชำรุด, คงเหลือ, น้ำหนักรวม)
  const insMove = db.prepare(`
    INSERT INTO stock_movements (date_iso, move_type, col_key, qty, sheet_row)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(date_iso, move_type, col_key)
    DO UPDATE SET qty = stock_movements.qty + excluded.qty
  `);

  let movementCount = 0;
  let lastDateIso = '';
  const seenStockDates = new Set();
  const maxRow = Math.max(...sheet.rows.map((r) => r.r));
  for (let baseRow = 4; baseRow <= maxRow; baseRow += 5) {
    const rIn = rowMap.get(baseRow) || {};
    const rOut = rowMap.get(baseRow + 1) || {};
    const rDmg = rowMap.get(baseRow + 2) || {};

    const hasAnyMovement = [rIn, rOut, rDmg].some((cells) =>
      STOCK_COLUMNS.some((colDef) => round2(numVal(cells[colDef.col])) !== 0)
    );

    let dateIso = normalizeSheetDate(rIn.A?.v);
    if ((!dateIso || seenStockDates.has(dateIso)) && (hasAnyMovement || (rIn.A?.v !== null && rIn.A?.v !== undefined && rIn.A?.v !== '')) && lastDateIso) {
      const prevD = new Date(`${lastDateIso}T00:00:00Z`);
      prevD.setUTCDate(prevD.getUTCDate() + 1);
      dateIso = prevD.toISOString().slice(0, 10);
    }
    if (!dateIso) continue;
    seenStockDates.add(dateIso);
    lastDateIso = dateIso;

    const types = [
      { moveType: 'in', cells: rIn, sheetRow: baseRow },
      { moveType: 'out', cells: rOut, sheetRow: baseRow + 1 },
      { moveType: 'damaged', cells: rDmg, sheetRow: baseRow + 2 },
    ];

    for (const t of types) {
      for (const colDef of STOCK_COLUMNS) {
        const qty = round2(numVal(t.cells[colDef.col]));
        if (qty !== 0) {
          insMove.run(dateIso, t.moveType, colDef.col, qty, t.sheetRow);
          movementCount++;
        }
      }
    }
  }
  return movementCount;
}

function reseedFromSnapshots() {
  initSchema();
  const pawnFile = path.join(SNAPSHOTS_DIR, 'pawn.xlsx');
  const legacyAccountFile = path.join(SNAPSHOTS_DIR, 'account.xlsx');
  const stockFile = path.join(SNAPSHOTS_DIR, 'stock.xlsx');

  const sheetsByYear = getAccountSheetsByYear();
  const yearsSorted = Object.keys(sheetsByYear).sort((a, b) => Number(a) - Number(b));
  const accountFiles = [];
  for (const yr of yearsSorted) {
    const yrFile = path.join(SNAPSHOTS_DIR, `account_${yr}.xlsx`);
    if (fs.existsSync(yrFile)) {
      accountFiles.push(yrFile);
    } else if (yr === '2569' && fs.existsSync(legacyAccountFile)) {
      accountFiles.push(legacyAccountFile);
    }
  }
  if (accountFiles.length === 0 && fs.existsSync(legacyAccountFile)) {
    accountFiles.push(legacyAccountFile);
  }

  db.exec('BEGIN');
  try {
    db.exec(`
      DELETE FROM pawn_tickets;
      DELETE FROM account_entries;
      DELETE FROM account_days;
      DELETE FROM account_months;
      DELETE FROM stock_movements;
      DELETE FROM stock_opening;
    `);
    const pawnCount = fs.existsSync(pawnFile) ? seedPawnFromXlsx(pawnFile) : 0;
    let accountCount = 0;
    for (const accFile of accountFiles) {
      accountCount += seedAccountFromXlsx(accFile);
    }

    // Link cross-month / cross-year carry-forward balances when a new month starts at 0
    const allMonthsAsc = db.prepare('SELECT * FROM account_months ORDER BY month_order ASC').all();
    const updCarry = db.prepare('UPDATE account_months SET carry_cash = ?, carry_pawn = ? WHERE month_key = ?');
    for (let i = 1; i < allMonthsAsc.length; i++) {
      const prevM = allMonthsAsc[i - 1];
      const curM = allMonthsAsc[i];
      if (Number(curM.carry_cash) === 0 && Number(curM.carry_pawn) === 0) {
        const prevComputed = computeMonthData(prevM);
        const carryCash = round2(prevComputed.totals.actual_cash);
        const carryPawn = round2(prevComputed.totals.cumulative_pawn);
        updCarry.run(carryCash, carryPawn, curM.month_key);
        curM.carry_cash = carryCash;
        curM.carry_pawn = carryPawn;
      }
    }

    const stockCount = fs.existsSync(stockFile) ? seedStockFromXlsx(stockFile) : 0;
    db.exec('COMMIT');
    return { pawnCount, accountCount, stockCount };
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

function seedFromSnapshotsIfEmpty() {
  initSchema();
  const pawnCount = db.prepare('SELECT COUNT(*) AS cnt FROM pawn_tickets').get().cnt;
  const accCount = db.prepare('SELECT COUNT(*) AS cnt FROM account_months').get().cnt;
  const stockCount = db.prepare('SELECT COUNT(*) AS cnt FROM stock_opening').get().cnt;
  if (pawnCount === 0 && accCount === 0 && stockCount === 0) {
    return reseedFromSnapshots();
  }
  return { skipped: true, pawnCount, accCount, stockCount };
}

function addMonthsIso(isoDate, months) {
  if (!isoDate) return '';
  const [y, m, d] = isoDate.split('-').map(Number);
  // Match Excel EDATE(date, months)
  const targetMonthIndex = (m - 1) + months;
  const targetYear = y + Math.floor(targetMonthIndex / 12);
  const targetMonth = ((targetMonthIndex % 12) + 12) % 12;
  const lastDayOfTargetMonth = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const clampedDay = Math.min(d, lastDayOfTargetMonth);
  return `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}-${String(clampedDay).padStart(2, '0')}`;
}

function diffDaysIso(laterIso, earlierIso) {
  if (!laterIso || !earlierIso) return 0;
  const [y1, m1, d1] = laterIso.split('-').map(Number);
  const [y2, m2, d2] = earlierIso.split('-').map(Number);
  const t1 = Date.UTC(y1, m1 - 1, d1);
  const t2 = Date.UTC(y2, m2 - 1, d2);
  return Math.floor((t1 - t2) / 86400000);
}

function enrichPawnTicket(row, refTodayIso) {
  let paidDates = [];
  try {
    paidDates = JSON.parse(row.paid_dates_json || '[]').filter(Boolean).sort();
  } catch {
    paidDates = [];
  }
  const maxPaid = paidDates.length ? paidDates[paidDates.length - 1] : '';
  const refDate = maxPaid || row.pawn_date || '';
  const term = row.term_months > 0 ? row.term_months : 3;
  const dueDate = refDate
    ? (maxPaid ? addMonthsIso(maxPaid, 1) : addMonthsIso(row.pawn_date, term))
    : '';

  const st = row.status || '';
  const isBadCard = (row.customer_name || '').includes('บัตรเสีย');
  const isRedeemed = st.includes('ไถ่') || Boolean(row.redeem_date);
  const isForfeited = st.includes('หลุด');
  const isActive = row.principal > 0 && !isBadCard && !isRedeemed && !isForfeited;

  const overdueDays = isActive && dueDate ? diffDaysIso(refTodayIso, dueDate) : 0;
  const isOverdue = isActive && overdueDays > 0;

  let computedStatus = 'จำนำอยู่';
  let statusCategory = 'active';
  if (isBadCard) {
    computedStatus = 'บัตรเสีย';
    statusCategory = 'bad';
  } else if (isRedeemed) {
    computedStatus = st || 'ไถ่แล้ว';
    statusCategory = 'redeemed';
  } else if (isForfeited) {
    computedStatus = st || 'หลุดจำ';
    statusCategory = 'forfeited';
  } else if (isOverdue) {
    computedStatus = `เกินกำหนด ${overdueDays} วัน`;
    statusCategory = 'overdue';
  }

  return {
    ...row,
    paid_dates: paidDates,
    last_paid_date: maxPaid,
    ref_date: refDate,
    due_date: dueDate,
    overdue_days: overdueDays > 0 ? overdueDays : 0,
    is_active: isActive,
    is_overdue: isOverdue,
    computed_status: computedStatus,
    status_category: statusCategory,
    monthly_interest: round2(row.principal * 0.02),
  };
}

function getPawnTicketsWithOverdue(filters = {}, refTodayIso = getTodayIsoBangkok()) {
  const rows = db.prepare('SELECT * FROM pawn_tickets ORDER BY id DESC').all();
  const enriched = rows.map((r) => enrichPawnTicket(r, refTodayIso));

  // Global KPIs across all tickets
  const summary = {
    totalCount: enriched.length,
    activeCount: 0,
    activePrincipal: 0,
    activeWeightG: 0,
    activeMonthlyInterest: 0,
    overdueCount: 0,
    overduePrincipal: 0,
    overdueMonthlyInterest: 0,
    redeemedCount: 0,
    forfeitedCount: 0,
    refTodayIso,
  };

  for (const t of enriched) {
    if (t.is_active) {
      summary.activeCount++;
      summary.activePrincipal += t.principal;
      summary.activeWeightG += t.weight_g;
      summary.activeMonthlyInterest += t.monthly_interest;
      if (t.is_overdue) {
        summary.overdueCount++;
        summary.overduePrincipal += t.principal;
        summary.overdueMonthlyInterest += t.monthly_interest;
      }
    } else if (t.status_category === 'redeemed') {
      summary.redeemedCount++;
    } else if (t.status_category === 'forfeited') {
      summary.forfeitedCount++;
    }
  }
  summary.activeWeightG = round2(summary.activeWeightG);
  summary.activeMonthlyInterest = round2(summary.activeMonthlyInterest);
  summary.overdueMonthlyInterest = round2(summary.overdueMonthlyInterest);

  const search = String(filters.search || '').trim().toLowerCase();
  const statusFilter = filters.status || 'all';
  const sheetFilter = filters.sheet || 'all';
  const overdueOnly = Boolean(filters.overdueOnly);

  let filtered = enriched.filter((t) => {
    if (sheetFilter !== 'all' && t.sheet_name !== sheetFilter) return false;
    if (overdueOnly && !t.is_overdue) return false;
    if (statusFilter === 'active' && !t.is_active) return false;
    if (statusFilter === 'overdue' && !t.is_overdue) return false;
    if (statusFilter === 'redeemed' && t.status_category !== 'redeemed') return false;
    if (statusFilter === 'forfeited' && t.status_category !== 'forfeited') return false;
    if (statusFilter === 'ontime' && (!t.is_active || t.is_overdue)) return false;
    if (search) {
      const hay = `${t.ticket_no} ${t.customer_name} ${t.item_desc} ${t.note}`.toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });

  if (overdueOnly || statusFilter === 'overdue') {
    filtered.sort((a, b) => b.overdue_days - a.overdue_days);
  }

  const totalFiltered = filtered.length;
  const limit = Number(filters.limit) > 0 ? Number(filters.limit) : 200;
  const offset = Number(filters.offset) >= 0 ? Number(filters.offset) : 0;

  return {
    summary,
    totalFiltered,
    tickets: filtered.slice(offset, offset + limit),
  };
}

function getNextTicketNo() {
  const row = db
    .prepare(
      `SELECT MAX(CAST(ticket_no AS INTEGER)) AS max_no
       FROM pawn_tickets
       WHERE ticket_no GLOB '[0-9]*' AND CAST(ticket_no AS INTEGER) < 10000`
    )
    .get();
  return String((row?.max_no || 6325) + 1);
}

function ensureAccountMonthExists(monthKey, dateIso) {
  const existing = db.prepare('SELECT * FROM account_months WHERE month_key = ?').get(monthKey);
  if (existing) return existing;

  // Carry forward ending cash and cumulative pawn from the immediately preceding month
  const allMonths = getAccountMonthsSummaryList();
  const order = getMonthOrderForKey(monthKey, dateIso);
  const prevMonths = allMonths.filter((m) => m.month_order < order);
  const prev = prevMonths.length ? prevMonths[prevMonths.length - 1] : null;
  const carryCash = prev ? prev.endingCash : 0;
  const carryPawn = prev ? prev.endingPawn : 0;

  db.prepare(
    `INSERT INTO account_months (month_key, month_order, carry_cash, carry_pawn) VALUES (?, ?, ?, ?)`
  ).run(monthKey, order, carryCash, carryPawn);
  return db.prepare('SELECT * FROM account_months WHERE month_key = ?').get(monthKey);
}

function insertAccountEntryInternal(input) {
  const dateIso = input.date_iso || getTodayIsoBangkok();
  const monthKey = input.month_key || getMonthKeyForIsoDate(dateIso);
  ensureAccountMonthExists(monthKey, dateIso);

  const dayRow = db.prepare('SELECT id FROM account_days WHERE month_key = ? AND date_iso = ?').get(monthKey, dateIso);
  if (!dayRow) {
    db.prepare('INSERT INTO account_days (month_key, date_iso, actual_cash, note) VALUES (?, ?, NULL, ?)').run(
      monthKey,
      dateIso,
      ''
    );
  }

  const nowIso = new Date().toISOString();
  const res = db
    .prepare(
      `INSERT INTO account_entries (
        month_key, date_iso, sheet_row, description,
        new_gold_g, inc_sell, inc_redeem, inc_interest, inc_other,
        old_gold_g, exp_buy, exp_pawn, exp_other, exp_transfer, exp_home,
        linked_ticket_no, created_at
      ) VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      monthKey,
      dateIso,
      String(input.description || '').trim(),
      round2(Number(input.new_gold_g) || 0),
      round2(Number(input.inc_sell) || 0),
      round2(Number(input.inc_redeem) || 0),
      round2(Number(input.inc_interest) || 0),
      round2(Number(input.inc_other) || 0),
      round2(Number(input.old_gold_g) || 0),
      round2(Number(input.exp_buy) || 0),
      round2(Number(input.exp_pawn) || 0),
      round2(Number(input.exp_other) || 0),
      round2(Number(input.exp_transfer) || 0),
      round2(Number(input.exp_home) || 0),
      String(input.linked_ticket_no || ''),
      nowIso
    );

  return db.prepare('SELECT * FROM account_entries WHERE id = ?').get(res.lastInsertRowid);
}

function createPawnTicket(input) {
  const ticketNo = String(input.ticket_no || getNextTicketNo()).trim();
  const sheetName = input.sheet_name || (Number(ticketNo) >= 6001 ? 'เริ่ม 6001' : 'เริ่ม 4844');
  const maxRowObj = db
    .prepare('SELECT COALESCE(MAX(sheet_row), 1) AS max_row FROM pawn_tickets WHERE sheet_name = ?')
    .get(sheetName);
  const nextSheetRow = (maxRowObj?.max_row || 1) + 1;

  const principal = round2(Number(input.principal) || 0);
  const interestAmt = round2(Number(input.interest_amount) || principal * 0.02);
  const weightG = round2(Number(input.weight_g) || 0);
  const termMonths = parseTermMonths(input.term_months || input.term_raw || 3);
  const termRaw = String(input.term_raw || termMonths);
  const pawnDate = normalizeSheetDate(input.pawn_date) || getTodayIsoBangkok();
  const nowIso = new Date().toISOString();

  let createdAccountEntry = null;
  db.exec('BEGIN');
  try {
    const res = db
      .prepare(
        `INSERT INTO pawn_tickets (
          ticket_no, sheet_name, sheet_row, customer_name, item_desc, item_qty, note,
          weight_g, principal, interest_rate, interest_amount, term_months, term_raw,
          pawn_date, status, redeem_date, paid_dates_json, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', '', '[]', ?)`
      )
      .run(
        ticketNo,
        sheetName,
        nextSheetRow,
        String(input.customer_name || '').trim(),
        String(input.item_desc || '').trim(),
        String(input.item_qty || '').trim(),
        String(input.note || '').trim(),
        weightG,
        principal,
        0.02,
        interestAmt,
        termMonths,
        termRaw,
        pawnDate,
        nowIso
      );

    const ticket = db.prepare('SELECT * FROM pawn_tickets WHERE id = ?').get(res.lastInsertRowid);

    if (input.record_account !== false && principal > 0) {
      createdAccountEntry = insertAccountEntryInternal({
        date_iso: pawnDate,
        description: ticketNo,
        exp_pawn: principal,
        exp_transfer: Number(input.transfer_amount) || 0,
        linked_ticket_no: ticketNo,
      });
    }

    db.exec('COMMIT');
    return {
      ticket: enrichPawnTicket(ticket, getTodayIsoBangkok()),
      accountEntry: createdAccountEntry,
    };
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

function performPawnAction(idOrTicketNo, input) {
  let row = null;
  if (Number.isFinite(Number(idOrTicketNo)) && Number(idOrTicketNo) > 0) {
    row = db.prepare('SELECT * FROM pawn_tickets WHERE id = ?').get(Number(idOrTicketNo));
  }
  if (!row) {
    row = db
      .prepare('SELECT * FROM pawn_tickets WHERE ticket_no = ? ORDER BY id DESC LIMIT 1')
      .get(String(idOrTicketNo));
  }
  if (!row) {
    throw new Error(`ไม่พบเลขที่จำนำ ${idOrTicketNo}`);
  }

  const action = input.action;
  const actionDate = normalizeSheetDate(input.date_iso) || getTodayIsoBangkok();
  const nowIso = new Date().toISOString();
  let paidDates = [];
  try {
    paidDates = JSON.parse(row.paid_dates_json || '[]');
  } catch {
    paidDates = [];
  }

  let newPrincipal = row.principal;
  let newInterestAmt = row.interest_amount;
  let newStatus = row.status;
  let newRedeemDate = row.redeem_date;
  let accountDesc = row.ticket_no;
  let incRedeem = 0;
  let incInterest = 0;
  let expPawn = 0;
  const transferAmt = round2(Number(input.transfer_amount) || 0);

  db.exec('BEGIN');
  try {
    if (action === 'pay_interest') {
      paidDates.push(actionDate);
      incInterest = round2(Number(input.interest_paid ?? row.principal * 0.02));
      accountDesc = row.ticket_no;
    } else if (action === 'redeem') {
      newStatus = input.status_text || 'ไถ่แล้ว';
      newRedeemDate = actionDate;
      incRedeem = row.principal;
      incInterest = round2(Number(input.interest_paid ?? 0));
      accountDesc = row.ticket_no;
    } else if (action === 'reduce_principal') {
      const reduceAmt = round2(Number(input.amount) || 0);
      if (reduceAmt <= 0 || reduceAmt >= row.principal) {
        throw new Error('ยอดลดต้นต้องมากกว่า 0 และน้อยกว่าเงินต้นปัจจุบัน');
      }
      newPrincipal = round2(row.principal - reduceAmt);
      newInterestAmt = round2(newPrincipal * 0.02);
      if (input.interest_paid && Number(input.interest_paid) > 0) {
        paidDates.push(actionDate);
      }
      incRedeem = reduceAmt;
      incInterest = round2(Number(input.interest_paid) || 0);
      accountDesc = `${row.ticket_no}ลดต้น`;
    } else if (action === 'increase_principal') {
      const addAmt = round2(Number(input.amount) || 0);
      if (addAmt <= 0) {
        throw new Error('ยอดเพิ่มจำนำต้องมากกว่า 0');
      }
      newPrincipal = round2(row.principal + addAmt);
      newInterestAmt = round2(newPrincipal * 0.02);
      if (input.interest_paid && Number(input.interest_paid) > 0) {
        paidDates.push(actionDate);
      }
      expPawn = addAmt;
      incInterest = round2(Number(input.interest_paid) || 0);
      accountDesc = `${row.ticket_no}เพิ่มยอดจำ`;
    } else if (action === 'forfeit') {
      newStatus = 'หลุดจำ';
    } else if (action === 'reactivate') {
      newStatus = '';
      newRedeemDate = '';
    } else if (action === 'edit') {
      newPrincipal = round2(Number(input.principal ?? row.principal));
      newInterestAmt = round2(newPrincipal * 0.02);
      newStatus = input.status ?? row.status;
      newRedeemDate = input.redeem_date !== undefined ? normalizeSheetDate(input.redeem_date) : row.redeem_date;
      if (Array.isArray(input.paid_dates)) {
        paidDates = input.paid_dates.map((d) => normalizeSheetDate(d)).filter(Boolean);
      }
    } else {
      throw new Error(`Unknown pawn action: ${action}`);
    }

    const updatedCustomer = input.customer_name !== undefined ? String(input.customer_name).trim() : row.customer_name;
    const updatedItem = input.item_desc !== undefined ? String(input.item_desc).trim() : row.item_desc;
    const updatedQty = input.item_qty !== undefined ? String(input.item_qty).trim() : row.item_qty;
    const updatedNote = input.note !== undefined ? String(input.note).trim() : row.note;
    const updatedWeight = input.weight_g !== undefined ? round2(Number(input.weight_g) || 0) : row.weight_g;
    const updatedTerm = input.term_months !== undefined ? parseTermMonths(input.term_months) : row.term_months;
    const updatedTermRaw = input.term_raw !== undefined ? String(input.term_raw) : (input.term_months !== undefined ? String(updatedTerm) : row.term_raw);
    const updatedPawnDate = input.pawn_date !== undefined ? normalizeSheetDate(input.pawn_date) : row.pawn_date;

    db.prepare(
      `UPDATE pawn_tickets
       SET customer_name = ?, item_desc = ?, item_qty = ?, note = ?, weight_g = ?,
           principal = ?, interest_amount = ?, term_months = ?, term_raw = ?,
           pawn_date = ?, status = ?, redeem_date = ?, paid_dates_json = ?, updated_at = ?
       WHERE id = ?`
    ).run(
      updatedCustomer,
      updatedItem,
      updatedQty,
      updatedNote,
      updatedWeight,
      newPrincipal,
      newInterestAmt,
      updatedTerm,
      updatedTermRaw,
      updatedPawnDate,
      newStatus,
      newRedeemDate,
      JSON.stringify(paidDates),
      nowIso,
      row.id
    );

    let createdAccountEntry = null;
    if (
      input.record_account !== false &&
      action !== 'forfeit' &&
      action !== 'edit' &&
      action !== 'reactivate' &&
      (incRedeem > 0 || incInterest > 0 || expPawn > 0 || transferAmt > 0)
    ) {
      createdAccountEntry = insertAccountEntryInternal({
        date_iso: actionDate,
        description: accountDesc,
        inc_redeem: incRedeem,
        inc_interest: incInterest,
        exp_pawn: expPawn,
        exp_transfer: transferAmt,
        linked_ticket_no: row.ticket_no,
      });
    }

    db.exec('COMMIT');
    const updatedRow = db.prepare('SELECT * FROM pawn_tickets WHERE id = ?').get(row.id);
    return {
      ticket: enrichPawnTicket(updatedRow, getTodayIsoBangkok()),
      accountEntry: createdAccountEntry,
    };
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

function deletePawnTicket(idOrTicket, options = {}) {
  const row =
    db.prepare('SELECT * FROM pawn_tickets WHERE id = ?').get(Number(idOrTicket) || -1) ||
    db.prepare('SELECT * FROM pawn_tickets WHERE ticket_no = ? ORDER BY id DESC LIMIT 1').get(String(idOrTicket));
  if (!row) {
    throw new Error(`ไม่พบรายการจำนำ: ${idOrTicket}`);
  }
  db.exec('BEGIN');
  try {
    const deletedAccountEntries =
      options.delete_linked_account !== false && row.ticket_no
        ? db.prepare('SELECT * FROM account_entries WHERE linked_ticket_no = ?').all(String(row.ticket_no))
        : [];
    db.prepare('DELETE FROM pawn_tickets WHERE id = ?').run(row.id);
    if (options.delete_linked_account !== false && row.ticket_no) {
      db.prepare('DELETE FROM account_entries WHERE linked_ticket_no = ?').run(String(row.ticket_no));
    }
    db.exec('COMMIT');
    return { deleted: row, deletedAccountEntries };
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

function computeMonthData(monthRow) {
  const days = db
    .prepare('SELECT * FROM account_days WHERE month_key = ? ORDER BY COALESCE(summary_row, 999999) ASC, date_iso ASC')
    .all(monthRow.month_key);
  const entries = db
    .prepare('SELECT * FROM account_entries WHERE month_key = ? ORDER BY id ASC')
    .all(monthRow.month_key);

  const entriesByDate = new Map();
  for (const e of entries) {
    if (!entriesByDate.has(e.date_iso)) entriesByDate.set(e.date_iso, []);
    entriesByDate.get(e.date_iso).push(e);
  }

  let runningCash = monthRow.carry_cash;
  let runningPawn = monthRow.carry_pawn;

  let cumNewGoldG = monthRow.carry_new_gold_g || 0;
  let cumOldGoldG = monthRow.carry_old_gold_g || 0;
  let cumIncSell = monthRow.carry_inc_sell || 0;
  let cumIncRedeem = monthRow.carry_inc_redeem || 0;
  let cumIncInterest = monthRow.carry_inc_interest || 0;
  let cumIncOther = monthRow.carry_inc_other || 0;
  let cumExpBuy = monthRow.carry_exp_buy || 0;
  let cumExpPawn = monthRow.carry_exp_pawn || 0;
  let cumExpOther = monthRow.carry_exp_other || 0;
  let cumExpTransfer = monthRow.carry_exp_transfer || 0;
  let cumExpHome = monthRow.carry_exp_home || 0;

  let lastActualCash = monthRow.carry_cash;

  const computedDays = days.map((d) => {
    const dayEntries = entriesByDate.get(d.date_iso) || [];
    const sum = {
      new_gold_g: 0,
      inc_sell: 0,
      inc_redeem: 0,
      inc_interest: 0,
      inc_other: 0,
      old_gold_g: 0,
      exp_buy: 0,
      exp_pawn: 0,
      exp_other: 0,
      exp_transfer: 0,
      exp_home: 0,
    };

    for (const e of dayEntries) {
      sum.new_gold_g += e.new_gold_g;
      sum.inc_sell += e.inc_sell;
      sum.inc_redeem += e.inc_redeem;
      sum.inc_interest += e.inc_interest;
      sum.inc_other += e.inc_other;
      sum.old_gold_g += e.old_gold_g;
      sum.exp_buy += e.exp_buy;
      sum.exp_pawn += e.exp_pawn;
      sum.exp_other += e.exp_other;
      sum.exp_transfer += e.exp_transfer;
      sum.exp_home += e.exp_home;
    }

    for (const k of Object.keys(sum)) {
      sum[k] = round2(sum[k]);
    }

    const totalIncome = round2(sum.inc_sell + sum.inc_redeem + sum.inc_interest + sum.inc_other);
    const totalExpense = round2(sum.exp_buy + sum.exp_pawn + sum.exp_other + sum.exp_transfer + sum.exp_home);
    const openingCash = runningCash;
    const expectedCash = round2(openingCash + totalIncome - totalExpense);
    const hasActualCash = d.actual_cash !== null && d.actual_cash !== undefined;
    const actualCash = hasActualCash ? round2(d.actual_cash) : null;
    const cashDiff = hasActualCash ? round2(actualCash - expectedCash) : null;

    runningCash = hasActualCash ? actualCash : expectedCash;
    if (hasActualCash) lastActualCash = actualCash;

    runningPawn = round2(runningPawn - sum.inc_redeem + sum.exp_pawn);

    cumNewGoldG = round2(cumNewGoldG + sum.new_gold_g);
    cumOldGoldG = round2(cumOldGoldG + sum.old_gold_g);
    cumIncSell = round2(cumIncSell + sum.inc_sell);
    cumIncRedeem = round2(cumIncRedeem + sum.inc_redeem);
    cumIncInterest = round2(cumIncInterest + sum.inc_interest);
    cumIncOther = round2(cumIncOther + sum.inc_other);
    cumExpBuy = round2(cumExpBuy + sum.exp_buy);
    cumExpPawn = round2(cumExpPawn + sum.exp_pawn);
    cumExpOther = round2(cumExpOther + sum.exp_other);
    cumExpTransfer = round2(cumExpTransfer + sum.exp_transfer);
    cumExpHome = round2(cumExpHome + sum.exp_home);

    return {
      ...d,
      date_short: formatThaiDateShort(d.date_iso),
      date_long: formatThaiDateLong(d.date_iso),
      opening_cash: openingCash,
      entries: dayEntries,
      summary: {
        ...sum,
        total_income: totalIncome,
        total_expense: totalExpense,
        expected_cash: expectedCash,
        actual_cash: actualCash,
        cash_diff: cashDiff,
        cumulative_pawn: runningPawn,
      },
      cumulative: {
        new_gold_g: cumNewGoldG,
        inc_sell: cumIncSell,
        inc_redeem: cumIncRedeem,
        inc_interest: cumIncInterest,
        inc_other: cumIncOther,
        old_gold_g: cumOldGoldG,
        exp_buy: cumExpBuy,
        exp_pawn: cumExpPawn,
        exp_other: cumExpOther,
        exp_transfer: cumExpTransfer,
        exp_home: cumExpHome,
        cumulative_pawn: runningPawn,
      },
    };
  });

  const lastDay = computedDays.length ? computedDays[computedDays.length - 1] : null;
  const totalMonthIncome = round2(cumIncSell + cumIncRedeem + cumIncInterest + cumIncOther);
  const totalMonthExpense = round2(cumExpBuy + cumExpPawn + cumExpOther + cumExpTransfer + cumExpHome);

  return {
    month: monthRow,
    days: computedDays,
    totals: {
      new_gold_g: cumNewGoldG,
      inc_sell: cumIncSell,
      inc_redeem: cumIncRedeem,
      inc_interest: cumIncInterest,
      inc_other: cumIncOther,
      total_income: totalMonthIncome,
      old_gold_g: cumOldGoldG,
      exp_buy: cumExpBuy,
      exp_pawn: cumExpPawn,
      exp_other: cumExpOther,
      exp_transfer: cumExpTransfer,
      exp_home: cumExpHome,
      total_expense: totalMonthExpense,
      expected_cash: lastDay ? lastDay.summary.expected_cash : monthRow.carry_cash,
      actual_cash: lastDay && lastDay.summary.actual_cash !== null ? lastDay.summary.actual_cash : lastActualCash,
      cumulative_pawn: runningPawn,
    },
  };
}

function getAccountMonthsSummaryList() {
  const months = db.prepare('SELECT * FROM account_months ORDER BY month_order ASC').all();
  return months.map((m) => {
    const computed = computeMonthData(m);
    return {
      month_key: m.month_key,
      month_order: m.month_order,
      be_year: getBeYearForMonthOrder(m.month_order),
      carry_cash: m.carry_cash,
      carry_pawn: m.carry_pawn,
      dayCount: computed.days.length,
      endingCash: computed.totals.actual_cash,
      endingExpectedCash: computed.totals.expected_cash,
      endingPawn: computed.totals.cumulative_pawn,
      totals: computed.totals,
    };
  });
}

function getAccountMonthView(monthKey, yearBe) {
  const allMonths = getAccountMonthsSummaryList();
  const dataYears = [...new Set(allMonths.map((m) => m.be_year))].sort((a, b) => a - b);
  const cfgYears = Object.keys(getAccountSheetsByYear()).map((y) => Number(y)).filter(Boolean);
  const availableYears = [...new Set([...dataYears, ...cfgYears])].sort((a, b) => a - b);

  let targetYear = Number(yearBe) || 0;
  let targetKey = monthKey || '';

  if (targetKey) {
    const matched = allMonths.find((m) => m.month_key === targetKey);
    if (matched) {
      if (!targetYear) targetYear = matched.be_year;
      else if (matched.be_year !== targetYear) targetKey = '';
    } else if (targetYear) {
      targetKey = '';
    }
  }

  if (!targetYear) {
    targetYear = dataYears.length ? dataYears[dataYears.length - 1] : 2569;
  }

  const yearMonths = allMonths.filter((m) => m.be_year === targetYear);
  if (!targetKey) {
    targetKey = yearMonths.length ? yearMonths[yearMonths.length - 1].month_key : '';
  }

  const monthRow = targetKey ? db.prepare('SELECT * FROM account_months WHERE month_key = ?').get(targetKey) : null;
  if (!monthRow) {
    return { availableYears, activeYear: targetYear, months: yearMonths, activeMonth: null };
  }
  const computed = computeMonthData(monthRow);
  return {
    availableYears,
    activeYear: targetYear,
    months: yearMonths,
    activeMonth: computed,
  };
}

function getAnnualOverview(yearBe) {
  const allMonths = getAccountMonthsSummaryList();
  const dataYears = [...new Set(allMonths.map((m) => m.be_year))].sort((a, b) => a - b);
  const cfgYears = Object.keys(getAccountSheetsByYear()).map((y) => Number(y)).filter(Boolean);
  const availableYears = [...new Set([...dataYears, ...cfgYears])].sort((a, b) => a - b);
  const activeYear = Number(yearBe) || (dataYears.length ? dataYears[dataYears.length - 1] : 2569);
  const months = allMonths.filter((m) => m.be_year === activeYear);

  const yearTotals = {
    new_gold_g: 0,
    inc_sell: 0,
    inc_redeem: 0,
    inc_interest: 0,
    inc_other: 0,
    total_income: 0,
    old_gold_g: 0,
    exp_buy: 0,
    exp_pawn: 0,
    exp_other: 0,
    exp_transfer: 0,
    exp_home: 0,
    total_expense: 0,
  };
  for (const m of months) {
    for (const k of Object.keys(yearTotals)) {
      yearTotals[k] = round2(yearTotals[k] + m.totals[k]);
    }
  }
  return { availableYears, activeYear, months, yearTotals };
}

const DEFAULT_NOV_69_VAT_ROWS = [
  { date_iso: '2026-11-02', invoice_no: '321 150', buyer_name: '', gold_bar_price: 62250, weight_g: 3.8, item_desc: 'คอ 3.8g', sale_amount: 16600, exempt_base: 15250.96, taxable_base: 1349.04, vat_amount: 94.43 },
  { date_iso: '2026-11-03', invoice_no: '', buyer_name: '', gold_bar_price: 62800, weight_g: 3.8, item_desc: 'คอ 3.8g', sale_amount: 16800, exempt_base: 15387.40, taxable_base: 1412.60, vat_amount: 98.88 },
  { date_iso: '2026-11-04', invoice_no: '', buyer_name: '', gold_bar_price: 62600, weight_g: 15.2, item_desc: 'คอ 15.2g', sale_amount: 65400, exempt_base: 61352.52, taxable_base: 4047.48, vat_amount: 283.32 },
  { date_iso: '2026-11-05', invoice_no: '', buyer_name: '', gold_bar_price: 67350, weight_g: 1.9, item_desc: 'แขน 1.9g', sale_amount: 9000, exempt_base: 8248.79, taxable_base: 751.20, vat_amount: 52.58 },
  { date_iso: '2026-11-07', invoice_no: '', buyer_name: '', gold_bar_price: 64600, weight_g: 7.6, item_desc: 'คอ 7.6g', sale_amount: 34400, exempt_base: 31654.08, taxable_base: 2745.92, vat_amount: 192.21 },
  { date_iso: '2026-11-09', invoice_no: '', buyer_name: '', gold_bar_price: 65200, weight_g: 1.9, item_desc: 'แหวน 1.9g', sale_amount: 8900, exempt_base: 7987.42, taxable_base: 912.57, vat_amount: 63.88 },
  { date_iso: '2026-11-09', invoice_no: '', buyer_name: '', gold_bar_price: 65200, weight_g: 1.9, item_desc: 'แหวน 1.9g', sale_amount: 9100, exempt_base: 7987.42, taxable_base: 1112.58, vat_amount: 77.88 },
  { date_iso: '2026-11-11', invoice_no: '', buyer_name: '', gold_bar_price: 64150, weight_g: 3.8, item_desc: 'แหวน 3.8g', sale_amount: 17500, exempt_base: 15717.13, taxable_base: 1782.87, vat_amount: 124.80 },
  { date_iso: '2026-11-11', invoice_no: '', buyer_name: '', gold_bar_price: 64150, weight_g: 3.8, item_desc: 'แหวน 3.8g', sale_amount: 17500, exempt_base: 15717.13, taxable_base: 1782.87, vat_amount: 124.80 },
  { date_iso: '2026-11-12', invoice_no: '', buyer_name: '', gold_bar_price: 63500, weight_g: 3.8, item_desc: 'คอ 3.8g', sale_amount: 16400, exempt_base: 15557.95, taxable_base: 842.05, vat_amount: 58.94 },
  { date_iso: '2026-11-13', invoice_no: '', buyer_name: '', gold_bar_price: 62600, weight_g: 15.2, item_desc: 'แขน 15.2g', sale_amount: 64550, exempt_base: 61352.52, taxable_base: 3197.48, vat_amount: 223.82 },
  { date_iso: '2026-11-13', invoice_no: '', buyer_name: '', gold_bar_price: 61950, weight_g: 3.8, item_desc: 'แหวน 3.8g', sale_amount: 17080, exempt_base: 15178.95, taxable_base: 1901.05, vat_amount: 133.07 },
  { date_iso: '2026-11-18', invoice_no: '', buyer_name: '', gold_bar_price: 60900, weight_g: 3.8, item_desc: 'แหวน 3.8g', sale_amount: 16200, exempt_base: 14921.23, taxable_base: 1278.77, vat_amount: 89.51 },
];

function seedDefaultNov69VatRowsIfEmpty() {
  const existing = db.prepare("SELECT COUNT(*) AS cnt FROM vat_sales_rows WHERE month_key = 'พ.ย. 69'").get();
  if ((existing?.cnt || 0) > 0) return;
  const nowIso = new Date().toISOString();
  const ins = db.prepare(`
    INSERT INTO vat_sales_rows (
      month_key, row_order, date_iso, invoice_no, buyer_name,
      gold_bar_price, weight_g, item_desc, sale_amount, exempt_base,
      taxable_base, vat_amount, linked_entry_id, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)
  `);
  DEFAULT_NOV_69_VAT_ROWS.forEach((r, idx) => {
    ins.run(
      'พ.ย. 69',
      idx + 1,
      r.date_iso,
      r.invoice_no,
      r.buyer_name,
      r.gold_bar_price,
      r.weight_g,
      r.item_desc,
      r.sale_amount,
      r.exempt_base,
      r.taxable_base,
      r.vat_amount,
      nowIso
    );
  });
}

function calcGoldExemptBase(goldBarPrice, weightG) {
  const bar = Number(goldBarPrice) || 0;
  const w = Number(weightG) || 0;
  if (bar <= 0 || w <= 0) return 0;
  const perGram = Math.round((bar * 0.98) / 15.16);
  const perBaht = round2(perGram * 15.16);
  return round2(perBaht * (w / 15.2));
}

function parseMonthShortAndYearShort(monthKey, activeYear) {
  const s = String(monthKey || '').trim();
  let monthShort = '';
  for (let i = 0; i < THAI_MONTHS_SHORT.length; i++) {
    const mName = THAI_MONTHS_SHORT[i];
    const mNoDot = mName.replace(/\.$/, '');
    if (s.includes(mName) || s.includes(mNoDot)) {
      monthShort = mName;
      break;
    }
  }
  const beYear = getBeYearForMonthOrder(getMonthOrderForKey(s)) || Number(activeYear) || 2569;
  const yearShort = String(beYear).slice(-2);
  return { monthShort: monthShort || s, yearShort };
}

function getVatSalesReport(monthKey, yearBe) {
  initSchema();
  const accView = getAccountMonthView(monthKey, yearBe);
  const targetMonthKey =
    monthKey && db.prepare('SELECT month_key FROM account_months WHERE month_key = ?').get(monthKey)
      ? monthKey
      : accView.activeMonth?.month?.month_key || monthKey || (accView.months.length ? accView.months[accView.months.length - 1].month_key : 'พ.ย. 69');

  const rows = db
    .prepare('SELECT * FROM vat_sales_rows WHERE month_key = ? ORDER BY row_order ASC, date_iso ASC, id ASC')
    .all(targetMonthKey);

  const candidateSales = db
    .prepare('SELECT * FROM account_entries WHERE month_key = ? AND inc_sell > 0 ORDER BY date_iso ASC, id ASC')
    .all(targetMonthKey)
    .map((e) => ({
      ...e,
      date_long: formatThaiDateLong(e.date_iso),
      is_likely_jewelry: e.new_gold_g > 0 && !/(แท่ง|ออมทอง|หุ้ม|หุ้|เงิน|ครุตุ้ม)/.test(e.description || ''),
    }));

  const totals = {
    sale_amount: 0,
    exempt_base: 0,
    taxable_base: 0,
    vat_amount: 0,
  };
  for (const r of rows) {
    totals.sale_amount = round2(totals.sale_amount + (Number(r.sale_amount) || 0));
    totals.exempt_base = round2(totals.exempt_base + (Number(r.exempt_base) || 0));
    totals.taxable_base = round2(totals.taxable_base + (Number(r.taxable_base) || 0));
    totals.vat_amount = round2(totals.vat_amount + (Number(r.vat_amount) || 0));
  }

  const { monthShort, yearShort } = parseMonthShortAndYearShort(targetMonthKey, accView.activeYear);

  return {
    availableYears: accView.availableYears,
    activeYear: accView.activeYear,
    months: accView.months,
    monthKey: targetMonthKey,
    monthShort,
    yearShort,
    rows,
    totals,
    candidateSales,
  };
}

function saveVatSalesReport(monthKey, rowsInput) {
  initSchema();
  const targetMonthKey = String(monthKey || '').trim() || getMonthKeyForIsoDate(getTodayIsoBangkok());
  const rowsArr = Array.isArray(rowsInput) ? rowsInput : [];
  const nowIso = new Date().toISOString();

  const normalizedRows = [];
  rowsArr.forEach((r, idx) => {
    const saleAmt = round2(Number(r.sale_amount) || 0);
    const goldBarPrice = round2(Number(r.gold_bar_price) || 0);
    const weightG = round2(Number(r.weight_g) || 0);
    const hasExplicitExempt = r.exempt_base !== undefined && r.exempt_base !== null && r.exempt_base !== '';
    const exemptBase = hasExplicitExempt
      ? round2(Number(r.exempt_base) || 0)
      : calcGoldExemptBase(goldBarPrice, weightG);
    const taxableBase = goldBarPrice > 0 || exemptBase > 0 ? round2(saleAmt - exemptBase) : 0;
    const vatAmt = round2(taxableBase * 0.07);
    normalizedRows.push({
      row_order: idx + 1,
      date_iso: normalizeSheetDate(r.date_iso) || String(r.date_iso || '').trim() || getTodayIsoBangkok(),
      invoice_no: String(r.invoice_no || '').trim(),
      buyer_name: String(r.buyer_name || '').trim(),
      gold_bar_price: goldBarPrice,
      weight_g: weightG,
      item_desc: String(r.item_desc || '').trim(),
      sale_amount: saleAmt,
      exempt_base: exemptBase,
      taxable_base: taxableBase,
      vat_amount: vatAmt,
      linked_entry_id: r.linked_entry_id ? Number(r.linked_entry_id) : null,
    });
  });

  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM vat_sales_rows WHERE month_key = ?').run(targetMonthKey);
    const ins = db.prepare(`
      INSERT INTO vat_sales_rows (
        month_key, row_order, date_iso, invoice_no, buyer_name,
        gold_bar_price, weight_g, item_desc, sale_amount, exempt_base,
        taxable_base, vat_amount, linked_entry_id, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const r of normalizedRows) {
      ins.run(
        targetMonthKey,
        r.row_order,
        r.date_iso,
        r.invoice_no,
        r.buyer_name,
        r.gold_bar_price,
        r.weight_g,
        r.item_desc,
        r.sale_amount,
        r.exempt_base,
        r.taxable_base,
        r.vat_amount,
        r.linked_entry_id,
        nowIso
      );
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  const savedRows = db
    .prepare('SELECT * FROM vat_sales_rows WHERE month_key = ? ORDER BY row_order ASC, id ASC')
    .all(targetMonthKey);
  const totals = {
    sale_amount: 0,
    exempt_base: 0,
    taxable_base: 0,
    vat_amount: 0,
  };
  for (const r of savedRows) {
    totals.sale_amount = round2(totals.sale_amount + (Number(r.sale_amount) || 0));
    totals.exempt_base = round2(totals.exempt_base + (Number(r.exempt_base) || 0));
    totals.taxable_base = round2(totals.taxable_base + (Number(r.taxable_base) || 0));
    totals.vat_amount = round2(totals.vat_amount + (Number(r.vat_amount) || 0));
  }

  return { monthKey: targetMonthKey, rows: savedRows, totals };
}

function upsertGoldDailyPrices(records) {
  initSchema();
  const list = Array.isArray(records) ? records : [];
  if (!list.length) return 0;
  const nowIso = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO gold_daily_prices (
      date_iso, bar_buy, bar_sell, orn_tax_base, orn_sell, seq, time_str, source, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(date_iso) DO UPDATE SET
      bar_buy = excluded.bar_buy,
      bar_sell = excluded.bar_sell,
      orn_tax_base = excluded.orn_tax_base,
      orn_sell = excluded.orn_sell,
      seq = excluded.seq,
      time_str = excluded.time_str,
      source = excluded.source,
      updated_at = excluded.updated_at
  `);

  let count = 0;
  db.exec('BEGIN');
  try {
    for (const r of list) {
      const dateIso = String(r.date_iso || '').trim();
      const barBuy = Number(r.bar_buy) || 0;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso) || barBuy <= 0) continue;
      stmt.run(
        dateIso,
        barBuy,
        Number(r.bar_sell) || 0,
        Number(r.orn_tax_base) || 0,
        Number(r.orn_sell) || 0,
        Number(r.seq) || 0,
        String(r.time_str || ''),
        String(r.source || 'ราคาทองคำวันนี้.com'),
        nowIso
      );
      count++;
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  return count;
}

function getGoldDailyPricesForMonth(yearCe, monthNum) {
  initSchema();
  const ym = `${Number(yearCe)}-${String(Number(monthNum)).padStart(2, '0')}`;
  const rows = db
    .prepare('SELECT * FROM gold_daily_prices WHERE date_iso >= ? AND date_iso <= ? ORDER BY date_iso ASC')
    .all(`${ym}-01`, `${ym}-31`);
  const prevFallback =
    db
      .prepare('SELECT * FROM gold_daily_prices WHERE date_iso < ? ORDER BY date_iso DESC LIMIT 1')
      .get(`${ym}-01`) || null;

  const prices = {};
  for (const r of rows) {
    prices[r.date_iso] = r;
  }
  return { prices, prevFallback, daysCount: rows.length };
}

function addAccountEntry(input) {
  return insertAccountEntryInternal(input);
}

function updateAccountEntry(id, input) {
  const existing = db.prepare('SELECT * FROM account_entries WHERE id = ?').get(Number(id));
  if (!existing) throw new Error('ไม่พบรายการบัญชี');
  const dateIso = input.date_iso ? normalizeSheetDate(input.date_iso) : existing.date_iso;
  const monthKey = getMonthKeyForIsoDate(dateIso);
  ensureAccountMonthExists(monthKey, dateIso);

  db.prepare(
    `UPDATE account_entries
     SET month_key = ?, date_iso = ?, description = ?,
         new_gold_g = ?, inc_sell = ?, inc_redeem = ?, inc_interest = ?, inc_other = ?,
         old_gold_g = ?, exp_buy = ?, exp_pawn = ?, exp_other = ?, exp_transfer = ?, exp_home = ?
     WHERE id = ?`
  ).run(
    monthKey,
    dateIso,
    input.description !== undefined ? String(input.description).trim() : existing.description,
    round2(input.new_gold_g !== undefined ? Number(input.new_gold_g) : existing.new_gold_g),
    round2(input.inc_sell !== undefined ? Number(input.inc_sell) : existing.inc_sell),
    round2(input.inc_redeem !== undefined ? Number(input.inc_redeem) : existing.inc_redeem),
    round2(input.inc_interest !== undefined ? Number(input.inc_interest) : existing.inc_interest),
    round2(input.inc_other !== undefined ? Number(input.inc_other) : existing.inc_other),
    round2(input.old_gold_g !== undefined ? Number(input.old_gold_g) : existing.old_gold_g),
    round2(input.exp_buy !== undefined ? Number(input.exp_buy) : existing.exp_buy),
    round2(input.exp_pawn !== undefined ? Number(input.exp_pawn) : existing.exp_pawn),
    round2(input.exp_other !== undefined ? Number(input.exp_other) : existing.exp_other),
    round2(input.exp_transfer !== undefined ? Number(input.exp_transfer) : existing.exp_transfer),
    round2(input.exp_home !== undefined ? Number(input.exp_home) : existing.exp_home),
    existing.id
  );
  return db.prepare('SELECT * FROM account_entries WHERE id = ?').get(existing.id);
}

function deleteAccountEntry(id) {
  const existing = db.prepare('SELECT * FROM account_entries WHERE id = ?').get(Number(id));
  if (!existing) throw new Error('ไม่พบรายการบัญชี');
  db.prepare('DELETE FROM account_entries WHERE id = ?').run(existing.id);
  return existing;
}

function updateAccountDailyCash(dateIsoRaw, actualCash, note) {
  const dateIso = normalizeSheetDate(dateIsoRaw) || getTodayIsoBangkok();
  const monthKey = getMonthKeyForIsoDate(dateIso);
  ensureAccountMonthExists(monthKey, dateIso);

  const cashVal = actualCash === null || actualCash === '' || actualCash === undefined ? null : round2(Number(actualCash));
  const existing = db.prepare('SELECT * FROM account_days WHERE month_key = ? AND date_iso = ?').get(monthKey, dateIso);
  if (existing) {
    db.prepare('UPDATE account_days SET actual_cash = ?, note = COALESCE(?, note) WHERE id = ?').run(
      cashVal,
      note !== undefined ? String(note) : null,
      existing.id
    );
  } else {
    db.prepare('INSERT INTO account_days (month_key, date_iso, actual_cash, note) VALUES (?, ?, ?, ?)').run(
      monthKey,
      dateIso,
      cashVal,
      note || ''
    );
  }
  return db.prepare('SELECT * FROM account_days WHERE month_key = ? AND date_iso = ?').get(monthKey, dateIso);
}

function getStockSummaryAndHistory(selectedDateIso) {
  const openRows = db.prepare('SELECT col_key, qty FROM stock_opening').all();
  const openingMap = {};
  for (const r of openRows) openingMap[r.col_key] = r.qty;

  const moveRows = db.prepare('SELECT * FROM stock_movements ORDER BY date_iso ASC, move_type ASC').all();

  const currentMap = {};
  for (const colDef of STOCK_COLUMNS) {
    currentMap[colDef.col] = openingMap[colDef.col] || 0;
  }

  const datesSet = new Set();
  const dayMovements = {};
  for (const m of moveRows) {
    datesSet.add(m.date_iso);
    if (!dayMovements[m.date_iso]) {
      dayMovements[m.date_iso] = { in: {}, out: {}, damaged: {} };
    }
    dayMovements[m.date_iso][m.move_type][m.col_key] = round2(m.qty);

    if (m.move_type === 'in') {
      currentMap[m.col_key] = round2((currentMap[m.col_key] || 0) + m.qty);
    } else if (m.move_type === 'out' || m.move_type === 'damaged') {
      currentMap[m.col_key] = round2((currentMap[m.col_key] || 0) - m.qty);
    }
  }

  const targetDate = selectedDateIso || getTodayIsoBangkok();
  const targetMoves = dayMovements[targetDate] || { in: {}, out: {}, damaged: {} };

  // Group current balances matching the sheet's weight-tier summary row
  const groupsMap = new Map();
  let totalStandardGoldWeightG = 0;
  let totalOldGoldWeightG = 0;
  let totalStandardPieces = 0;
  let totalSpecialPieces = 0;

  const columnsDetail = STOCK_COLUMNS.map((colDef) => {
    const qty = round2(currentMap[colDef.col] || 0);
    const weightG = colDef.isWeight ? qty : round2(qty * colDef.unitWeight);

    if (colDef.isWeight) {
      totalOldGoldWeightG = round2(totalOldGoldWeightG + qty);
    } else if (colDef.unitWeight > 0) {
      totalStandardGoldWeightG = round2(totalStandardGoldWeightG + weightG);
      totalStandardPieces += qty;
    } else {
      totalSpecialPieces += qty;
    }

    if (!groupsMap.has(colDef.group)) {
      groupsMap.set(colDef.group, {
        group: colDef.group,
        unitWeight: colDef.unitWeight,
        isWeight: colDef.isWeight,
        totalQty: 0,
        totalWeightG: 0,
        items: [],
      });
    }
    const gObj = groupsMap.get(colDef.group);
    gObj.totalQty = round2(gObj.totalQty + qty);
    gObj.totalWeightG = round2(gObj.totalWeightG + weightG);
    gObj.items.push({
      ...colDef,
      qty,
      weightG,
      todayIn: targetMoves.in[colDef.col] || 0,
      todayOut: targetMoves.out[colDef.col] || 0,
      todayDamaged: targetMoves.damaged[colDef.col] || 0,
    });

    return {
      ...colDef,
      qty,
      weightG,
    };
  });

  // Build chronological daily balance history (latest 30 days)
  const sortedDates = [...datesSet].sort();
  const running = { ...openingMap };
  const history = [];
  for (const dIso of sortedDates) {
    const dm = dayMovements[dIso];
    for (const colDef of STOCK_COLUMNS) {
      const c = colDef.col;
      const qIn = dm.in[c] || 0;
      const qOut = dm.out[c] || 0;
      const qDmg = dm.damaged[c] || 0;
      running[c] = round2((running[c] || 0) + qIn - qOut - qDmg);
    }
    let oldGoldG = round2((running.C || 0) + (running.D || 0));
    let newGoldG = 0;
    let totalInPieces = 0;
    let totalOutPieces = 0;
    let totalDmgPieces = 0;
    for (const colDef of STOCK_COLUMNS) {
      if (!colDef.isWeight && colDef.unitWeight > 0) {
        newGoldG = round2(newGoldG + (running[colDef.col] || 0) * colDef.unitWeight);
      }
      if (!colDef.isWeight) {
        totalInPieces += dm.in[colDef.col] || 0;
        totalOutPieces += dm.out[colDef.col] || 0;
        totalDmgPieces += dm.damaged[colDef.col] || 0;
      }
    }
    history.push({
      date_iso: dIso,
      date_short: formatThaiDateShort(dIso),
      date_long: formatThaiDateLong(dIso),
      inOld90: dm.in.C || 0,
      inOld965: dm.in.D || 0,
      totalInPieces: round2(totalInPieces),
      totalOutPieces: round2(totalOutPieces),
      totalDmgPieces: round2(totalDmgPieces),
      endOldGoldG: oldGoldG,
      endNewGoldG: newGoldG,
      movements: dm,
    });
  }

  return {
    selectedDate: targetDate,
    totals: {
      totalOldGoldWeightG,
      old90WeightG: round2(currentMap.C || 0),
      old965WeightG: round2(currentMap.D || 0),
      totalStandardGoldWeightG,
      totalStandardPieces: round2(totalStandardPieces),
      totalSpecialPieces: round2(totalSpecialPieces),
      totalTrackedDays: sortedDates.length,
    },
    groups: [...groupsMap.values()],
    columns: columnsDetail,
    historyDesc: history.reverse(),
  };
}

function upsertStockMovements(dateIsoRaw, moveType, updates) {
  const dateIso = normalizeSheetDate(dateIsoRaw) || getTodayIsoBangkok();
  if (!['in', 'out', 'damaged'].includes(moveType)) {
    throw new Error(`Invalid stock moveType: ${moveType}`);
  }
  const stmt = db.prepare(`
    INSERT INTO stock_movements (date_iso, move_type, col_key, qty)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(date_iso, move_type, col_key)
    DO UPDATE SET qty = CASE WHEN ? = 'add' THEN stock_movements.qty + excluded.qty ELSE excluded.qty END
  `);
  const delStmt = db.prepare('DELETE FROM stock_movements WHERE date_iso = ? AND move_type = ? AND col_key = ?');

  const mode = updates.__mode === 'add' ? 'add' : 'set';
  const changed = [];

  db.exec('BEGIN');
  try {
    for (const [colKey, rawQty] of Object.entries(updates)) {
      if (colKey === '__mode' || !STOCK_COLUMN_MAP[colKey]) continue;
      const qty = round2(Number(rawQty) || 0);
      if (qty === 0 && mode === 'set') {
        delStmt.run(dateIso, moveType, colKey);
      } else if (qty !== 0) {
        stmt.run(dateIso, moveType, colKey, qty, mode);
      }
      changed.push({ col_key: colKey, qty });
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  return { dateIso, moveType, mode, changed };
}

function getSyncConfig() {
  const rows = db.prepare('SELECT key, value FROM sync_config').all();
  const cfg = {};
  for (const r of rows) cfg[r.key] = r.value;
  return cfg;
}

function setSyncConfig(updates) {
  const stmt = db.prepare('INSERT OR REPLACE INTO sync_config (key, value) VALUES (?, ?)');
  for (const [k, v] of Object.entries(updates)) {
    stmt.run(k, v === null || v === undefined ? '' : String(v));
  }
  return getSyncConfig();
}

function extractSheetId(input) {
  const s = String(input || '').trim();
  const m = s.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return m ? m[1] : s;
}

function getAccountSheetsByYear() {
  const cfg = getSyncConfig();
  let map = {};
  try {
    map = JSON.parse(cfg.account_sheets_by_year_json || '{}') || {};
  } catch {
    map = {};
  }
  const cleaned = {};
  for (const [yr, val] of Object.entries(map)) {
    const id = extractSheetId(val);
    if (/^\d{4}$/.test(String(yr).trim()) && id) {
      cleaned[String(yr).trim()] = id;
    }
  }
  if (!cleaned['2569']) {
    cleaned['2569'] = extractSheetId(cfg.account_sheet_id || SHEET_IDS.account);
  }
  return cleaned;
}

function getAccountSheetIdForDate(isoDate, monthKey) {
  const sheetsByYear = getAccountSheetsByYear();
  let beYear = '';
  if (isoDate && /^\d{4}/.test(String(isoDate))) {
    beYear = String(Number(String(isoDate).slice(0, 4)) + 543);
  } else if (monthKey) {
    beYear = String(getBeYearForMonthOrder(getMonthOrderForKey(monthKey)));
  }
  return sheetsByYear[beYear] || getSyncConfig().account_sheet_id || SHEET_IDS.account;
}

function enqueueSync(targetSheet, action, payload) {
  let finalPayload = payload;
  if (targetSheet === 'account' && payload && typeof payload === 'object') {
    const monthKey = payload.month_key || (payload.date_iso ? getMonthKeyForIsoDate(payload.date_iso) : '');
    const monthRow = monthKey
      ? db.prepare('SELECT carry_cash, carry_pawn FROM account_months WHERE month_key = ?').get(monthKey)
      : null;
    finalPayload = {
      ...payload,
      sheet_id: payload.sheet_id || getAccountSheetIdForDate(payload.date_iso, monthKey),
    };
    if (monthRow) {
      finalPayload.carry_cash = monthRow.carry_cash;
      finalPayload.carry_pawn = monthRow.carry_pawn;
    }
  }
  const nowIso = new Date().toISOString();
  const res = db
    .prepare(
      `INSERT INTO sync_queue (target_sheet, action, payload_json, status, created_at)
       VALUES (?, ?, ?, 'pending', ?)`
    )
    .run(targetSheet, action, JSON.stringify(finalPayload), nowIso);
  return db.prepare('SELECT * FROM sync_queue WHERE id = ?').get(res.lastInsertRowid);
}

function getSyncQueue(limit = 50) {
  const items = db.prepare('SELECT * FROM sync_queue ORDER BY id DESC LIMIT ?').all(limit);
  const counts = db
    .prepare(`SELECT status, COUNT(*) AS cnt FROM sync_queue GROUP BY status`)
    .all();
  const countMap = { pending: 0, synced: 0, failed: 0 };
  for (const c of counts) countMap[c.status] = c.cnt;
  return { counts: countMap, items };
}

function updateSyncQueueItem(id, status, errorMsg = '') {
  const syncedAt = status === 'synced' ? new Date().toISOString() : '';
  db.prepare('UPDATE sync_queue SET status = ?, error_msg = ?, synced_at = ? WHERE id = ?').run(
    status,
    errorMsg || '',
    syncedAt,
    id
  );
}

function getDashboardSummary(yearBe) {
  const todayIso = getTodayIsoBangkok();
  const pawnData = getPawnTicketsWithOverdue({ limit: 8, overdueOnly: true }, todayIso);
  const annual = getAnnualOverview(yearBe);
  const allMonths = getAccountMonthsSummaryList();
  const latestMonthSummary = allMonths.length ? allMonths[allMonths.length - 1] : null;
  const activeMonthView = latestMonthSummary ? getAccountMonthView(latestMonthSummary.month_key) : null;
  const latestDays = activeMonthView?.activeMonth?.days || [];
  const latestDay = latestDays.length ? latestDays[latestDays.length - 1] : null;
  const stock = getStockSummaryAndHistory(todayIso);
  const syncQueue = getSyncQueue(10);
  const syncConfig = getSyncConfig();

  return {
    todayIso,
    todayLong: formatThaiDateLong(todayIso),
    pawnSummary: pawnData.summary,
    topOverdue: pawnData.tickets,
    latestDay,
    latestMonth: latestMonthSummary,
    annualOverview: annual,
    stockTotals: stock.totals,
    stockGroups: stock.groups,
    syncSummary: {
      counts: syncQueue.counts,
      hasAppsScript: Boolean(syncConfig.apps_script_url),
      hasServiceAccount: Boolean(syncConfig.service_account_json),
      lastPullAt: syncConfig.last_pull_at,
      lastPushAt: syncConfig.last_push_at,
      sheetIds: SHEET_IDS,
      accountSheetsByYear: getAccountSheetsByYear(),
    },
  };
}

module.exports = {
  db,
  SHEET_IDS,
  STOCK_COLUMNS,
  STOCK_COLUMN_MAP,
  initSchema,
  seedFromSnapshotsIfEmpty,
  reseedFromSnapshots,
  getPawnTicketsWithOverdue,
  getNextTicketNo,
  createPawnTicket,
  performPawnAction,
  deletePawnTicket,
  getAccountMonthView,
  getAccountMonthsSummaryList,
  getAnnualOverview,
  calcGoldExemptBase,
  getVatSalesReport,
  saveVatSalesReport,
  upsertGoldDailyPrices,
  getGoldDailyPricesForMonth,
  getMonthOrderForKey,
  getBeYearForMonthOrder,
  addAccountEntry,
  updateAccountEntry,
  deleteAccountEntry,
  updateAccountDailyCash,
  getStockSummaryAndHistory,
  upsertStockMovements,
  getSyncConfig,
  setSyncConfig,
  extractSheetId,
  getAccountSheetsByYear,
  getAccountSheetIdForDate,
  enqueueSync,
  getSyncQueue,
  updateSyncQueueItem,
  getDashboardSummary,
  getMonthKeyForIsoDate,
  formatThaiDateShort,
  formatThaiDateLong,
  getTodayIsoBangkok,
};
