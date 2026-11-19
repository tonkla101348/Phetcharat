const state = {
  activeTab: 'dashboard',
  dashboardYear: '',
  pawnStatus: 'all',
  pawnPage: 0,
  pawnLimit: 100,
  pawnTicketsMap: {},
  accountActiveYear: '',
  accountActiveMonth: '',
  accountShowAllDays: false,
  accountCache: null,
  vatActiveYear: '',
  vatActiveMonth: '',
  vatCache: null,
  vatRows: [],
  stockCache: null,
  syncCache: null,
};

const THAI_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const THAI_MONTHS_FULL = [
  'มกราคม',
  'กุมภาพันธ์',
  'มีนาคม',
  'เมษายน',
  'พฤษภาคม',
  'มิถุนายน',
  'กรกฎาคม',
  'สิงหาคม',
  'กันยายน',
  'ตุลาคม',
  'พฤศจิกายน',
  'ธันวาคม',
];

function formatMonthKeyFull(monthKey, fallbackYear) {
  const s = String(monthKey || '').trim();
  if (!s) return '';
  let monthFull = '';
  for (let i = 0; i < THAI_MONTHS.length; i++) {
    const mShort = THAI_MONTHS[i];
    const mNoDot = mShort.replace(/\.$/, '');
    if (s.includes(THAI_MONTHS_FULL[i]) || s.includes(mShort) || s.includes(mNoDot)) {
      monthFull = THAI_MONTHS_FULL[i];
      break;
    }
  }
  const ym = s.match(/(\d{2,4})\s*$/);
  let yearFull = ym ? String(Number(ym[1]) < 100 ? Number(ym[1]) + 2500 : Number(ym[1])) : '';
  if (!yearFull && fallbackYear) yearFull = String(fallbackYear);
  if (monthFull && yearFull) return `${monthFull} ${yearFull}`;
  return monthFull || s;
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fmtMoney(n) {
  const num = Number(n || 0);
  return num.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function fmtWeight(n) {
  const num = Number(n || 0);
  if (num === 0) return '-';
  return num.toLocaleString('th-TH', { minimumFractionDigits: 1, maximumFractionDigits: 2 });
}

function fmtThaiShort(iso) {
  if (!iso) return '-';
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  const beShort = String((Number(m[1]) + 543) % 100).padStart(2, '0');
  return `${Number(m[3])}/${Number(m[2])}/${beShort}`;
}

function fmtThaiLong(iso) {
  if (!iso) return '-';
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return `${Number(m[3])} ${THAI_MONTHS[Number(m[2]) - 1]} ${Number(m[1]) + 543}`;
}

function fmtDmy(iso) {
  if (!iso) return 'วว/ดด/ปปปป';
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function syncDateInputDisplay(input) {
  if (!input) return;
  const wrap = input.closest('.date-dmy-wrap');
  const disp = wrap ? wrap.querySelector('.date-dmy-display') : null;
  if (!disp) return;
  const val = input.value;
  disp.textContent = fmtDmy(val);
  disp.classList.toggle('empty', !val);
}

function initDateInputs(root = document) {
  root.querySelectorAll('input[type="date"]').forEach((input) => {
    if (!input.parentElement?.classList.contains('date-dmy-wrap')) {
      const wrap = document.createElement('div');
      wrap.className = 'date-dmy-wrap';
      input.parentNode.insertBefore(wrap, input);
      wrap.appendChild(input);
      const disp = document.createElement('span');
      disp.className = 'date-dmy-display';
      wrap.appendChild(disp);
      input.classList.add('dmy-enhanced');
      input.addEventListener('input', () => syncDateInputDisplay(input));
      input.addEventListener('change', () => syncDateInputDisplay(input));
      input.addEventListener('click', () => {
        if (typeof input.showPicker === 'function') {
          try {
            input.showPicker();
          } catch {
            // ignore
          }
        }
      });
    }
    syncDateInputDisplay(input);
  });
}

function getTodayIso() {
  const now = new Date();
  const bkk = new Date(now.getTime() + 7 * 3600 * 1000);
  return bkk.toISOString().slice(0, 10);
}

function toast(msg, type = 'success') {
  const wrap = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(() => {
    el.remove();
  }, 4200);
}

async function api(url, opts = {}) {
  const resp = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  const data = await resp.json();
  if (!resp.ok || !data.ok) {
    throw new Error(data.error || `HTTP ${resp.status}`);
  }
  return data.data !== undefined ? data.data : data;
}

let debounceTimer = null;
function debounce(fn, ms = 220) {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(fn, ms);
}

function switchTab(tabName) {
  state.activeTab = tabName;
  document.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });
  document.querySelectorAll('.tab-panel').forEach((sec) => {
    sec.classList.toggle('active', sec.id === `tab-${tabName}`);
  });
  if (tabName === 'dashboard') loadDashboard();
  else if (tabName === 'pawn') loadPawnTable();
  else if (tabName === 'overdue') loadOverdueTable();
  else if (tabName === 'account') loadAccountView();
  else if (tabName === 'vat') loadVatView();
  else if (tabName === 'stock') loadStockView();
  else if (tabName === 'sync') loadSyncView();
}

function updateSyncPill(syncSummary) {
  const pill = document.getElementById('sync-pill');
  const txt = document.getElementById('sync-pill-text');
  const pending = (syncSummary.counts?.pending || 0) + (syncSummary.counts?.failed || 0);
  if (syncSummary.hasAppsScript || syncSummary.hasServiceAccount) {
    pill.classList.add('connected');
    txt.textContent = pending > 0 ? `กำลังซิงค์ (${pending} รอส่ง)` : 'เชื่อมต่อ Google Sheets แล้ว';
  } else {
    pill.classList.remove('connected');
    txt.textContent = pending > 0 ? `รอตั้งค่าซิงค์ (${pending} รายการ)` : 'ตั้งค่าซิงค์ Google Sheets';
  }
}

/* ==================== DASHBOARD ==================== */
function changeDashboardYear(yr) {
  state.dashboardYear = yr;
  loadDashboard();
}

async function loadDashboard() {
  try {
    const qYear = state.dashboardYear ? `?year=${encodeURIComponent(state.dashboardYear)}` : '';
    const d = await api(`/api/dashboard${qYear}`);
    document.getElementById('header-date-label').textContent = `วันนี้ ${d.todayLong} • ระบบจัดการร้านทองเพชรรัตน์ (ซิงค์ Google Sheets Real-Time)`;
    document.getElementById('nav-badge-pawn').textContent = d.pawnSummary.activeCount.toLocaleString('th-TH');
    document.getElementById('nav-badge-overdue').textContent = d.pawnSummary.overdueCount.toLocaleString('th-TH');
    updateSyncPill(d.syncSummary);

    const latestCash = d.latestDay?.summary?.actual_cash ?? d.latestDay?.summary?.expected_cash ?? 0;
    const latestPawnAccum = d.latestDay?.summary?.cumulative_pawn ?? d.pawnSummary.activePrincipal;

    document.getElementById('dashboard-kpis').innerHTML = `
      <div class="kpi-card">
        <div class="kpi-label">ยอดจำนำอยู่ทั้งหมด</div>
        <div class="kpi-value">${fmtMoney(d.pawnSummary.activePrincipal)} ฿</div>
        <div class="kpi-sub">${d.pawnSummary.activeCount} ใบ • น้ำหนักรวม ${fmtWeight(d.pawnSummary.activeWeightG)} กรัม</div>
      </div>
      <div class="kpi-card danger">
        <div class="kpi-label">รายการเกินกำหนด (คนหลุดจำ)</div>
        <div class="kpi-value">${d.pawnSummary.overdueCount} รายการ</div>
        <div class="kpi-sub">เงินต้น ${fmtMoney(d.pawnSummary.overduePrincipal)} ฿ • ดอก/ด. ${fmtMoney(d.pawnSummary.overdueMonthlyInterest)} ฿</div>
      </div>
      <div class="kpi-card emerald">
        <div class="kpi-label">เงินสดคงเหลือล่าสุด</div>
        <div class="kpi-value">${fmtMoney(latestCash)} ฿</div>
        <div class="kpi-sub">ณ วันที่ ${d.latestDay ? d.latestDay.date_long : '-'} • ยอดจำสะสมบัญชี ${fmtMoney(latestPawnAccum)} ฿</div>
      </div>
      <div class="kpi-card primary">
        <div class="kpi-label">สต๊อกทองรวมในร้าน</div>
        <div class="kpi-value">${fmtWeight(d.stockTotals.totalStandardGoldWeightG)} g</div>
        <div class="kpi-sub">${d.stockTotals.totalStandardPieces} ชิ้น + ทองเก่า ${fmtWeight(d.stockTotals.totalOldGoldWeightG)} g</div>
      </div>
    `;

    // Latest day summary
    const ld = d.latestDay;
    document.getElementById('dash-latest-date').textContent = ld ? ld.date_long : '-';
    if (ld) {
      const s = ld.summary;
      document.getElementById('dash-latest-day-body').innerHTML = `
        <div class="account-month-kpis" style="padding:0;">
          <div class="mini-stat"><span>รายรับรวมวันล่าสุด</span><strong class="text-inc">+${fmtMoney(s.total_income)} ฿</strong></div>
          <div class="mini-stat"><span>รายจ่ายรวมวันล่าสุด</span><strong class="text-exp">-${fmtMoney(s.total_expense)} ฿</strong></div>
          <div class="mini-stat"><span>คงเหลือตามบัญชี</span><strong>${fmtMoney(s.expected_cash)} ฿</strong></div>
          <div class="mini-stat"><span>เงินสดจริง</span><strong>${s.actual_cash !== null ? fmtMoney(s.actual_cash) + ' ฿' : 'ยังไม่นับ'}</strong></div>
          <div class="mini-stat"><span>ขายทองใหม่</span><strong>${fmtMoney(s.inc_sell)} ฿ (${fmtWeight(s.new_gold_g)}g)</strong></div>
          <div class="mini-stat"><span>รับไถ่ / รับดอก</span><strong>${fmtMoney(s.inc_redeem)} / ${fmtMoney(s.inc_interest)} ฿</strong></div>
          <div class="mini-stat"><span>รับซื้อทองเก่า</span><strong>${fmtMoney(s.exp_buy)} ฿ (${fmtWeight(s.old_gold_g)}g)</strong></div>
          <div class="mini-stat"><span>จ่ายจำนำใหม่</span><strong>${fmtMoney(s.exp_pawn)} ฿</strong></div>
        </div>
      `;
    } else {
      document.getElementById('dash-latest-day-body').innerHTML = '<p class="muted">ยังไม่มีข้อมูลบัญชี</p>';
    }

    // Top overdue
    const ovRows = (d.topOverdue || []).slice(0, 6).map((t) => `
      <tr>
        <td><strong>${esc(t.ticket_no)}</strong></td>
        <td>${esc(t.customer_name)}</td>
        <td>${esc(t.item_desc)}</td>
        <td class="num"><strong>${fmtMoney(t.principal)}</strong></td>
        <td class="num"><span class="badge badge-overdue">${t.overdue_days} วัน</span></td>
        <td class="center">
          <button class="btn btn-sm btn-primary" onclick="openPawnActionModal(${t.id}, 'pay_interest')">ต่อดอก</button>
        </td>
      </tr>
    `).join('');
    document.getElementById('dash-overdue-body').innerHTML = `
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr><th>เลขที่</th><th>ชื่อลูกค้า</th><th>รายการ</th><th class="num">เงินต้น</th><th class="num">เกินกำหนด</th><th class="center">จัดการ</th></tr>
          </thead>
          <tbody>${ovRows || '<tr><td colspan="6" class="center">ไม่มีรายการเกินกำหนด</td></tr>'}</tbody>
        </table>
      </div>
    `;

    // Stock tier strip
    document.getElementById('dash-stock-summary').innerHTML = d.stockGroups.map((g) => `
      <div class="tier-chip">
        <div class="tier-name">${esc(g.group)}</div>
        <div class="tier-main">${g.isWeight ? fmtWeight(g.totalWeightG) + ' g' : g.totalQty + ' ชิ้น'}</div>
        <div class="tier-sub">${g.unitWeight > 0 && !g.isWeight ? 'น้ำหนักรวม ' + fmtWeight(g.totalWeightG) + ' กรัม' : g.items.map((x) => x.item + ':' + x.qty).join(', ')}</div>
      </div>
    `).join('');

    // Annual overview table (ภาพรวมประจำปี)
    const ann = d.annualOverview;
    const activeYr = ann.activeYear || 2569;
    state.dashboardYear = String(activeYr);
    const dashYearLabel = document.getElementById('dash-year-label');
    if (dashYearLabel) dashYearLabel.textContent = activeYr;
    const dashYearSel = document.getElementById('dash-year-select');
    if (dashYearSel) {
      const years = ann.availableYears && ann.availableYears.length ? ann.availableYears : [activeYr];
      dashYearSel.innerHTML = years
        .map((y) => `<option value="${y}" ${Number(y) === Number(activeYr) ? 'selected' : ''}>พ.ศ. ${y}</option>`)
        .join('');
    }
    const annRows = ann.months.map((m) => `
      <tr style="cursor:pointer" onclick="openAccountMonth('${esc(m.month_key)}')">
        <td><strong>${esc(m.month_key)}</strong></td>
        <td class="num">${fmtWeight(m.totals.new_gold_g)}</td>
        <td class="num text-inc">${fmtMoney(m.totals.inc_sell)}</td>
        <td class="num text-inc">${fmtMoney(m.totals.inc_redeem)}</td>
        <td class="num text-inc">${fmtMoney(m.totals.inc_interest)}</td>
        <td class="num">${fmtMoney(m.totals.inc_other)}</td>
        <td class="num"><strong>${fmtMoney(m.totals.total_income)}</strong></td>
        <td class="num">${fmtWeight(m.totals.old_gold_g)}</td>
        <td class="num text-exp">${fmtMoney(m.totals.exp_buy)}</td>
        <td class="num text-exp">${fmtMoney(m.totals.exp_pawn)}</td>
        <td class="num">${fmtMoney(m.totals.exp_other + m.totals.exp_transfer + m.totals.exp_home)}</td>
        <td class="num"><strong>${fmtMoney(m.totals.total_expense)}</strong></td>
        <td class="num"><strong>${fmtMoney(m.endingCash)}</strong></td>
        <td class="num"><strong>${fmtMoney(m.endingPawn)}</strong></td>
      </tr>
    `).join('');
    const yt = ann.yearTotals;
    document.getElementById('dash-annual-table').innerHTML = `
      <table class="data-table">
        <thead>
          <tr>
            <th>เดือน</th>
            <th class="num">ทองใหม่ (g)</th>
            <th class="num">ขาย</th>
            <th class="num">ไถ่</th>
            <th class="num">ดอก</th>
            <th class="num">รับอื่นๆ</th>
            <th class="num">รวมรายรับ</th>
            <th class="num">ทองเก่า (g)</th>
            <th class="num">รับซื้อ</th>
            <th class="num">จำ</th>
            <th class="num">จ่ายอื่น/โอน/บ้าน</th>
            <th class="num">รวมรายจ่าย</th>
            <th class="num">เงินสดจริงสิ้นเดือน</th>
            <th class="num">ยอดจำสะสม</th>
          </tr>
        </thead>
        <tbody>${annRows || `<tr><td colspan="14" class="center muted">ยังไม่มีข้อมูลบัญชีปี พ.ศ. ${esc(activeYr)}</td></tr>`}</tbody>
        <tfoot>
          <tr class="summary-row">
            <td>รวมทั้งปี</td>
            <td class="num">${fmtWeight(yt.new_gold_g)}</td>
            <td class="num text-inc">${fmtMoney(yt.inc_sell)}</td>
            <td class="num text-inc">${fmtMoney(yt.inc_redeem)}</td>
            <td class="num text-inc">${fmtMoney(yt.inc_interest)}</td>
            <td class="num">${fmtMoney(yt.inc_other)}</td>
            <td class="num">${fmtMoney(yt.total_income)}</td>
            <td class="num">${fmtWeight(yt.old_gold_g)}</td>
            <td class="num text-exp">${fmtMoney(yt.exp_buy)}</td>
            <td class="num text-exp">${fmtMoney(yt.exp_pawn)}</td>
            <td class="num">${fmtMoney(yt.exp_other + yt.exp_transfer + yt.exp_home)}</td>
            <td class="num">${fmtMoney(yt.total_expense)}</td>
            <td colspan="2"></td>
          </tr>
        </tfoot>
      </table>
    `;
  } catch (err) {
    toast('โหลดภาพรวมไม่สำเร็จ: ' + err.message, 'error');
  }
}

/* ==================== PAWN TICKETS ==================== */
function debouncedLoadPawn() {
  state.pawnPage = 0;
  debounce(loadPawnTable);
}

function setPawnStatusFilter(status, btn) {
  state.pawnStatus = status;
  state.pawnPage = 0;
  document.querySelectorAll('[data-pawn-status]').forEach((b) => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  loadPawnTable();
}

function changePawnPage(delta) {
  state.pawnPage = Math.max(0, state.pawnPage + delta);
  loadPawnTable();
}

async function loadPawnTable() {
  try {
    const search = document.getElementById('pawn-search').value.trim();
    const sheet = document.getElementById('pawn-sheet-filter').value;
    const offset = state.pawnPage * state.pawnLimit;
    const url = `/api/pawn?search=${encodeURIComponent(search)}&status=${encodeURIComponent(state.pawnStatus)}&sheet=${encodeURIComponent(sheet)}&limit=${state.pawnLimit}&offset=${offset}`;
    const res = await api(url);

    const s = res.summary;
    document.getElementById('nav-badge-pawn').textContent = s.activeCount.toLocaleString('th-TH');
    document.getElementById('nav-badge-overdue').textContent = s.overdueCount.toLocaleString('th-TH');

    document.getElementById('pawn-kpis').innerHTML = `
      <div class="kpi-card">
        <div class="kpi-label">จำนำอยู่ (Active)</div>
        <div class="kpi-value">${s.activeCount} ใบ</div>
        <div class="kpi-sub">ยอดเงินต้นรวม ${fmtMoney(s.activePrincipal)} ฿</div>
      </div>
      <div class="kpi-card primary">
        <div class="kpi-label">ดอกเบี้ยรับคาดการณ์ / เดือน</div>
        <div class="kpi-value">${fmtMoney(s.activeMonthlyInterest)} ฿</div>
        <div class="kpi-sub">น้ำหนักทองรับจำนำ ${fmtWeight(s.activeWeightG)} กรัม</div>
      </div>
      <div class="kpi-card danger">
        <div class="kpi-label">เกินกำหนดตัดดอก</div>
        <div class="kpi-value">${s.overdueCount} ใบ</div>
        <div class="kpi-sub">เงินต้น ${fmtMoney(s.overduePrincipal)} ฿</div>
      </div>
      <div class="kpi-card emerald">
        <div class="kpi-label">ไถ่ถอนแล้วทั้งหมด</div>
        <div class="kpi-value">${s.redeemedCount} ใบ</div>
        <div class="kpi-sub">หลุดจำนำ ${s.forfeitedCount} ใบ • ทั้งหมด ${s.totalCount} ใบ</div>
      </div>
    `;

    const totalPages = Math.max(1, Math.ceil(res.totalFiltered / state.pawnLimit));
    document.getElementById('pawn-result-count').textContent = `พบทั้งหมด ${res.totalFiltered.toLocaleString('th-TH')} รายการ`;
    document.getElementById('pawn-page-info').textContent = `หน้า ${state.pawnPage + 1} / ${totalPages}`;
    document.getElementById('pawn-prev-btn').disabled = state.pawnPage === 0;
    document.getElementById('pawn-next-btn').disabled = state.pawnPage + 1 >= totalPages;

    const tbody = document.getElementById('pawn-tbody');
    tbody.innerHTML = res.tickets
      .map((t) => {
        state.pawnTicketsMap[t.id] = t;
        const badgeCls =
          t.status_category === 'overdue'
            ? 'badge-overdue'
            : t.status_category === 'redeemed'
            ? 'badge-redeemed'
            : t.status_category === 'forfeited'
            ? 'badge-forfeited'
            : t.status_category === 'bad'
            ? 'badge-bad'
            : 'badge-active';

        const actionsHtml = t.is_active
          ? `
            <button class="btn btn-sm btn-primary" onclick="openPawnActionModal(${t.id}, 'pay_interest')">ต่อดอก</button>
            <button class="btn btn-sm btn-emerald" onclick="openPawnActionModal(${t.id}, 'redeem')">ไถ่ถอน</button>
            <button class="btn btn-sm btn-outline" onclick="openPawnActionModal(${t.id}, 'edit')">จัดการ</button>
            <button class="btn btn-sm btn-danger-outline" onclick="deletePawnTicketConfirm(${t.id}, '${esc(t.ticket_no)}', '${esc(t.customer_name || '')}')">ลบ</button>
          `
          : `
            <button class="btn btn-sm btn-outline" onclick="openPawnActionModal(${t.id}, 'edit')">ดู / แก้ไข</button>
            <button class="btn btn-sm btn-danger-outline" onclick="deletePawnTicketConfirm(${t.id}, '${esc(t.ticket_no)}', '${esc(t.customer_name || '')}')">ลบ</button>
          `;

        return `
          <tr>
            <td><strong>${esc(t.ticket_no)}</strong><div class="muted" style="font-size:10.5px;">${esc(t.sheet_name)}</div></td>
            <td>
              <strong>${esc(t.customer_name || '-')}</strong>
              ${t.note ? `<div class="muted" style="font-size:11px;">${esc(t.note)}</div>` : ''}
            </td>
            <td>${esc(t.item_desc)} ${t.item_qty ? `<span class="muted">(${esc(t.item_qty)})</span>` : ''}</td>
            <td class="num">${fmtWeight(t.weight_g)}</td>
            <td class="num"><strong>${fmtMoney(t.principal)}</strong></td>
            <td class="num">${fmtMoney(t.monthly_interest)}</td>
            <td class="center">${esc(t.term_raw || t.term_months)}</td>
            <td>${fmtThaiShort(t.pawn_date)}</td>
            <td>${t.last_paid_date ? fmtThaiShort(t.last_paid_date) : '-'}</td>
            <td>${t.due_date ? fmtThaiShort(t.due_date) : '-'}</td>
            <td><span class="badge ${badgeCls}">${esc(t.computed_status)}</span></td>
            <td class="center"><div class="action-btn-group">${actionsHtml}</div></td>
          </tr>
        `;
      })
      .join('');
  } catch (err) {
    toast('โหลดข้อมูลจำนำทองไม่สำเร็จ: ' + err.message, 'error');
  }
}

/* ==================== OVERDUE (คนหลุดจำ) ==================== */
function debouncedLoadOverdue() {
  debounce(loadOverdueTable);
}

async function loadOverdueTable() {
  try {
    const search = document.getElementById('overdue-search').value.trim();
    const res = await api(`/api/pawn?overdueOnly=1&search=${encodeURIComponent(search)}&limit=500`);
    const s = res.summary;
    document.getElementById('overdue-asof').textContent = `อัปเดต ณ วันที่ ${fmtThaiLong(s.refTodayIso)} • คัดกรองเฉพาะรายการที่ยังไม่ไถ่และเกินกำหนดตัดดอก`;

    document.getElementById('overdue-kpis').innerHTML = `
      <div class="kpi-card danger">
        <div class="kpi-label">รายการเกินกำหนดทั้งหมด</div>
        <div class="kpi-value">${s.overdueCount} รายการ</div>
        <div class="kpi-sub">เรียงจากเกินกำหนดมากที่สุด</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">ยอดเงินต้นค้างชำระรวม</div>
        <div class="kpi-value">${fmtMoney(s.overduePrincipal)} ฿</div>
        <div class="kpi-sub">เฉพาะรายการที่เกินกำหนด</div>
      </div>
      <div class="kpi-card primary">
        <div class="kpi-label">ดอกเบี้ยค้างรับรวม (ต่อเดือน)</div>
        <div class="kpi-value">${fmtMoney(s.overdueMonthlyInterest)} ฿ / เดือน</div>
        <div class="kpi-sub">อัตรา 2% ต่อเดือน</div>
      </div>
    `;

    document.getElementById('overdue-tbody').innerHTML = res.tickets
      .map((t) => {
        state.pawnTicketsMap[t.id] = t;
        return `
          <tr>
            <td><strong>${esc(t.ticket_no)}</strong></td>
            <td><strong>${esc(t.customer_name)}</strong></td>
            <td>${esc(t.item_desc)}</td>
            <td class="num">${fmtWeight(t.weight_g)}</td>
            <td class="num"><strong>${fmtMoney(t.principal)}</strong></td>
            <td class="num">${fmtMoney(t.monthly_interest)}</td>
            <td class="center">${t.term_months}</td>
            <td>${fmtThaiShort(t.ref_date)}</td>
            <td>${fmtThaiShort(t.due_date)}</td>
            <td class="num"><span class="badge badge-overdue">เกิน ${t.overdue_days} วัน</span></td>
            <td class="center">
              <div class="action-btn-group">
                <button class="btn btn-sm btn-primary" onclick="openPawnActionModal(${t.id}, 'pay_interest')">ต่อดอก</button>
                <button class="btn btn-sm btn-emerald" onclick="openPawnActionModal(${t.id}, 'redeem')">ไถ่ถอน</button>
                <button class="btn btn-sm btn-danger-outline" onclick="markTicketForfeited(${t.id}, '${esc(t.ticket_no)}')">หลุดจำนำ</button>
              </div>
            </td>
          </tr>
        `;
      })
      .join('');
  } catch (err) {
    toast('โหลดรายการคนหลุดจำไม่สำเร็จ: ' + err.message, 'error');
  }
}

async function markTicketForfeited(id, ticketNo) {
  if (!confirm(`ยืนยันเปลี่ยนสถานะเลขที่ ${ticketNo} เป็น "หลุดจำ" ใช่หรือไม่?`)) return;
  try {
    await api(`/api/pawn/${id}/action`, {
      method: 'POST',
      body: JSON.stringify({ action: 'forfeit' }),
    });
    toast(`อัปเดตเลขที่ ${ticketNo} เป็น "หลุดจำ" แล้ว`);
    loadOverdueTable();
    loadDashboard();
  } catch (err) {
    toast(err.message, 'error');
  }
}

/* ==================== ACCOUNT LEDGER ==================== */
function openAccountMonth(monthKey) {
  state.accountActiveYear = '';
  state.accountActiveMonth = monthKey;
  switchTab('account');
}

function toggleShowAllDays() {
  state.accountShowAllDays = !state.accountShowAllDays;
  document.getElementById('toggle-all-days-btn').textContent = state.accountShowAllDays ? 'แสดงเฉพาะ 7 วันล่าสุด' : 'แสดงทุกวันในเดือน';
  renderAccountDays();
}

function scrollToAccountDay(dateIso) {
  if (!dateIso) return;
  if (!state.accountShowAllDays) {
    state.accountShowAllDays = true;
    document.getElementById('toggle-all-days-btn').textContent = 'แสดงเฉพาะ 7 วันล่าสุด';
    renderAccountDays();
  }
  const el = document.getElementById(`acc-day-${dateIso}`);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function selectAccountYear(yr) {
  state.accountActiveYear = yr;
  state.accountActiveMonth = '';
  loadAccountView();
}

async function loadAccountView() {
  try {
    const params = new URLSearchParams();
    if (state.accountActiveMonth) params.set('month', state.accountActiveMonth);
    if (state.accountActiveYear) params.set('year', state.accountActiveYear);
    const qs = params.toString();
    const data = await api(`/api/account${qs ? '?' + qs : ''}`);
    state.accountCache = data;

    const activeYear = data.activeYear || 2569;
    state.accountActiveYear = String(activeYear);
    if (data.activeMonth) {
      state.accountActiveMonth = data.activeMonth.month.month_key;
    } else {
      state.accountActiveMonth = '';
    }

    const yearSel = document.getElementById('account-year-select');
    if (yearSel) {
      const years = data.availableYears && data.availableYears.length ? data.availableYears : [activeYear];
      yearSel.innerHTML = years
        .map((y) => `<option value="${y}" ${Number(y) === Number(activeYear) ? 'selected' : ''}>ปี พ.ศ. ${y}</option>`)
        .join('');
    }

    document.getElementById('account-month-tabs').innerHTML = data.months
      .map(
        (m) => `
      <button class="month-tab ${m.month_key === state.accountActiveMonth ? 'active' : ''}" onclick="selectAccountMonth('${esc(m.month_key)}')">
        ${esc(m.month_key)}
      </button>
    `
      )
      .join('');

    const am = data.activeMonth;
    if (!am) {
      document.getElementById('account-month-summary').innerHTML = '';
      document.getElementById('account-month-carry-info').textContent = '';
      document.getElementById('account-day-select').innerHTML = '';
      document.getElementById('account-days-container').innerHTML = `<div class="card card-body"><p class="muted">ยังไม่มีรายการบัญชีในปี พ.ศ. ${esc(activeYear)} (กดปุ่ม "+ เพิ่มรายการรายรับ-รายจ่าย" เพื่อเริ่มบันทึกรายการแรกของปี)</p></div>`;
      return;
    }

    const t = am.totals;
    document.getElementById('account-month-summary').innerHTML = `
      <div class="mini-stat"><span>รวมรายรับทั้งเดือน</span><strong class="text-inc">+${fmtMoney(t.total_income)} ฿</strong></div>
      <div class="mini-stat"><span>รวมรายจ่ายทั้งเดือน</span><strong class="text-exp">-${fmtMoney(t.total_expense)} ฿</strong></div>
      <div class="mini-stat"><span>ขายทอง (${fmtWeight(t.new_gold_g)} g)</span><strong>${fmtMoney(t.inc_sell)} ฿</strong></div>
      <div class="mini-stat"><span>รับไถ่ / รับดอก</span><strong>${fmtMoney(t.inc_redeem)} / ${fmtMoney(t.inc_interest)} ฿</strong></div>
      <div class="mini-stat"><span>รับซื้อ (${fmtWeight(t.old_gold_g)} g)</span><strong>${fmtMoney(t.exp_buy)} ฿</strong></div>
      <div class="mini-stat"><span>จ่ายจำนำใหม่</span><strong>${fmtMoney(t.exp_pawn)} ฿</strong></div>
      <div class="mini-stat"><span>เงินสดสิ้นเดือน</span><strong>${fmtMoney(t.actual_cash)} ฿</strong></div>
      <div class="mini-stat"><span>ยอดจำสะสมล่าสุด</span><strong>${fmtMoney(t.cumulative_pawn)} ฿</strong></div>
    `;

    document.getElementById('account-month-carry-info').textContent =
      `ยอดยกมาจากเดือนก่อน: เงินสด ${fmtMoney(am.month.carry_cash)} ฿ | ยอดจำสะสม ${fmtMoney(am.month.carry_pawn)} ฿`;

    const daySelect = document.getElementById('account-day-select');
    const daysDesc = [...am.days].reverse();
    daySelect.innerHTML = daysDesc
      .map((d) => `<option value="${esc(d.date_iso)}">${esc(d.date_long)} (${d.entries.length} รายการ)</option>`)
      .join('');

    renderAccountDays();
  } catch (err) {
    toast('โหลดสมุดบัญชีไม่สำเร็จ: ' + err.message, 'error');
  }
}

function selectAccountMonth(monthKey) {
  state.accountActiveMonth = monthKey;
  loadAccountView();
}

function renderAccountDays() {
  const am = state.accountCache?.activeMonth;
  if (!am) return;
  const daysDesc = [...am.days].reverse();
  const visibleDays = state.accountShowAllDays ? daysDesc : daysDesc.slice(0, 7);

  document.getElementById('account-days-container').innerHTML = visibleDays
    .map((day) => {
      const s = day.summary;
      const diffBadge =
        s.cash_diff === null
          ? '<span class="badge badge-bad">ยังไม่นับเงินสด</span>'
          : s.cash_diff === 0
          ? '<span class="badge badge-redeemed">เงินตรงเป๊ะ (0)</span>'
          : s.cash_diff > 0
          ? `<span class="badge badge-redeemed">เกิน +${fmtMoney(s.cash_diff)} ฿</span>`
          : `<span class="badge badge-overdue">ขาด ${fmtMoney(s.cash_diff)} ฿</span>`;

      const entryRows = day.entries
        .map(
          (e) => `
        <tr>
          <td><strong>${esc(e.description || '-')}</strong></td>
          <td class="num">${e.new_gold_g ? fmtWeight(e.new_gold_g) : ''}</td>
          <td class="num text-inc">${e.inc_sell ? fmtMoney(e.inc_sell) : ''}</td>
          <td class="num text-inc">${e.inc_redeem ? fmtMoney(e.inc_redeem) : ''}</td>
          <td class="num text-inc">${e.inc_interest ? fmtMoney(e.inc_interest) : ''}</td>
          <td class="num text-inc">${e.inc_other ? fmtMoney(e.inc_other) : ''}</td>
          <td class="num">${e.old_gold_g ? fmtWeight(e.old_gold_g) : ''}</td>
          <td class="num text-exp">${e.exp_buy ? fmtMoney(e.exp_buy) : ''}</td>
          <td class="num text-exp">${e.exp_pawn ? fmtMoney(e.exp_pawn) : ''}</td>
          <td class="num">${e.exp_other ? fmtMoney(e.exp_other) : ''}</td>
          <td class="num">${e.exp_transfer ? fmtMoney(e.exp_transfer) : ''}</td>
          <td class="num">${e.exp_home ? fmtMoney(e.exp_home) : ''}</td>
          <td class="center">
            <button class="btn btn-sm btn-outline" onclick="deleteAccEntry(${e.id})" title="ลบรายการนี้">ลบ</button>
          </td>
        </tr>
      `
        )
        .join('');

      return `
        <div class="day-ledger-card" id="acc-day-${esc(day.date_iso)}">
          <div class="day-ledger-header">
            <div>
              <div class="day-ledger-title">${esc(day.date_long)} <span class="muted">(${day.entries.length} รายการ)</span></div>
              <div class="muted">ยอดยกมา ${fmtMoney(day.opening_cash)} ฿ &rarr; คงเหลือตามบัญชี <strong>${fmtMoney(s.expected_cash)} ฿</strong> | ยอดจำสะสม <strong>${fmtMoney(s.cumulative_pawn)} ฿</strong></div>
            </div>
            <div class="day-cash-box">
              <span>เงินสดจริง:</span>
              <input type="number" step="0.01" class="day-cash-input" id="cash-input-${esc(day.date_iso)}" value="${s.actual_cash !== null ? s.actual_cash : ''}" placeholder="กรอกยอดนับจริง" />
              <button class="btn btn-sm btn-primary" onclick="saveDailyCash('${esc(day.date_iso)}')">บันทึกเงินสด</button>
              ${diffBadge}
              <button class="btn btn-sm btn-emerald" onclick="openAccountEntryModal('${esc(day.date_iso)}')">+ เพิ่มรายการวันนี้</button>
            </div>
          </div>
          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>รายการ</th>
                  <th class="num">ทองใหม่ (g)</th>
                  <th class="num">ขาย</th>
                  <th class="num">ไถ่</th>
                  <th class="num">ดอก</th>
                  <th class="num">รับอื่นๆ</th>
                  <th class="num">ทองเก่า (g)</th>
                  <th class="num">รับซื้อ</th>
                  <th class="num">จำ</th>
                  <th class="num">จ่ายอื่นๆ</th>
                  <th class="num">โอน</th>
                  <th class="num">บ้าน</th>
                  <th class="center">จัดการ</th>
                </tr>
              </thead>
              <tbody>
                ${entryRows || '<tr><td colspan="13" class="center muted">ยังไม่มีรายการวันนี้</td></tr>'}
              </tbody>
              <tfoot>
                <tr class="summary-row">
                  <td>สรุปวัน (รับ ${fmtMoney(s.total_income)} / จ่าย ${fmtMoney(s.total_expense)})</td>
                  <td class="num">${fmtWeight(s.new_gold_g)}</td>
                  <td class="num text-inc">${fmtMoney(s.inc_sell)}</td>
                  <td class="num text-inc">${fmtMoney(s.inc_redeem)}</td>
                  <td class="num text-inc">${fmtMoney(s.inc_interest)}</td>
                  <td class="num text-inc">${fmtMoney(s.inc_other)}</td>
                  <td class="num">${fmtWeight(s.old_gold_g)}</td>
                  <td class="num text-exp">${fmtMoney(s.exp_buy)}</td>
                  <td class="num text-exp">${fmtMoney(s.exp_pawn)}</td>
                  <td class="num">${fmtMoney(s.exp_other)}</td>
                  <td class="num">${fmtMoney(s.exp_transfer)}</td>
                  <td class="num">${fmtMoney(s.exp_home)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      `;
    })
    .join('');
}

async function saveDailyCash(dateIso) {
  const input = document.getElementById(`cash-input-${dateIso}`);
  const val = input.value === '' ? null : Number(input.value);
  try {
    await api('/api/account/daily-cash', {
      method: 'POST',
      body: JSON.stringify({ date_iso: dateIso, actual_cash: val }),
    });
    toast(`บันทึกเงินสดจริงวันที่ ${fmtThaiShort(dateIso)} เรียบร้อย`);
    loadAccountView();
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function deleteAccEntry(id) {
  if (!confirm('ยืนยันลบรายการบัญชีนี้หรือไม่?')) return;
  try {
    await api(`/api/account/entry/${id}`, { method: 'DELETE' });
    toast('ลบรายการบัญชีแล้ว');
    loadAccountView();
  } catch (err) {
    toast(err.message, 'error');
  }
}

/* ==================== SALES TAX REPORT (รายงานภาษีขาย) ==================== */
function round2Client(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function calcGoldExemptBaseClient(ornamentPrice, weightG) {
  const price = Number(ornamentPrice) || 0;
  const w = Number(weightG) || 0;
  if (price <= 0 || w <= 0) return 0;
  return round2Client(price * (w / 15.2));
}

function extractWeightFromDesc(desc) {
  const s = String(desc || '').trim();
  const mUnit = s.match(/(\d+(?:\.\d+)?)\s*(?:g|กรัม)/i);
  if (mUnit) return round2Client(Number(mUnit[1]) || 0);
  const mEnd = s.match(/(\d+(?:\.\d+)?)\s*$/);
  if (mEnd) return round2Client(Number(mEnd[1]) || 0);
  return 0;
}

function fmtVatDate(iso) {
  if (!iso) return '';
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  const beShort = String((Number(m[1]) + 543) % 100).padStart(2, '0');
  return `${Number(m[3])} ${THAI_MONTHS[Number(m[2]) - 1]} ${beShort}`;
}

function fmtVatDec(n) {
  const num = Number(n || 0);
  return num.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function openVatReportForCurrentMonth() {
  state.vatActiveYear = state.accountActiveYear;
  state.vatActiveMonth = state.accountActiveMonth;
  switchTab('vat');
}

function selectVatYear(yr) {
  state.vatActiveYear = yr;
  state.vatActiveMonth = '';
  loadVatView();
}

function selectVatMonth(monthKey) {
  state.vatActiveMonth = monthKey;
  loadVatView();
}

async function loadVatView() {
  try {
    const params = new URLSearchParams();
    if (state.vatActiveMonth) params.set('month', state.vatActiveMonth);
    if (state.vatActiveYear) params.set('year', state.vatActiveYear);
    const qs = params.toString();
    const d = await api(`/api/account/vat-report${qs ? '?' + qs : ''}`);
    state.vatCache = d;
    state.vatActiveYear = String(d.activeYear || 2569);
    state.vatActiveMonth = d.monthKey || '';
    state.vatRows = (d.rows || []).map((r) => ({ ...r }));

    const yrSel = document.getElementById('vat-year-select');
    if (yrSel) {
      const years = d.availableYears && d.availableYears.length ? d.availableYears : [state.vatActiveYear];
      yrSel.innerHTML = years
        .map((y) => `<option value="${y}" ${Number(y) === Number(state.vatActiveYear) ? 'selected' : ''}>ปี พ.ศ. ${y}</option>`)
        .join('');
    }
    const mSel = document.getElementById('vat-month-select');
    if (mSel) {
      mSel.innerHTML = (d.months || [])
        .map(
          (m) =>
            `<option value="${esc(m.month_key)}" ${m.month_key === state.vatActiveMonth ? 'selected' : ''}>${esc(
              formatMonthKeyFull(m.month_key, state.vatActiveYear)
            )}</option>`
        )
        .join('');
    }
    document.getElementById('vat-print-month').textContent = d.monthFull || d.monthShort || '';
    document.getElementById('vat-print-year').textContent = d.yearFull || d.yearShort || '';
    renderVatTable();
  } catch (err) {
    toast('โหลดรายงานภาษีขายไม่สำเร็จ: ' + err.message, 'error');
  }
}

function computeVatTotalsClient() {
  const totals = { sale_amount: 0, exempt_base: 0, taxable_base: 0, vat_amount: 0 };
  for (const r of state.vatRows) {
    totals.sale_amount = round2Client(totals.sale_amount + (Number(r.sale_amount) || 0));
    totals.exempt_base = round2Client(totals.exempt_base + (Number(r.exempt_base) || 0));
    totals.taxable_base = round2Client(totals.taxable_base + (Number(r.taxable_base) || 0));
    totals.vat_amount = round2Client(totals.vat_amount + (Number(r.vat_amount) || 0));
  }
  return totals;
}

function renderVatFooter() {
  const tfoot = document.getElementById('vat-tfoot');
  if (!tfoot) return;
  const showTotal = document.getElementById('vat-show-total-row')?.checked;
  if (!showTotal) {
    tfoot.innerHTML = '';
    return;
  }
  const t = computeVatTotalsClient();
  tfoot.innerHTML = `
    <tr>
      <td colspan="4" class="center">รวมทั้งสิ้น (${state.vatRows.length} รายการ)</td>
      <td class="num">${fmtMoney(t.sale_amount)}</td>
      <td class="num">${fmtVatDec(t.exempt_base)}</td>
      <td class="num">${fmtVatDec(t.taxable_base)}</td>
      <td class="num">${fmtVatDec(t.vat_amount)}</td>
      <td class="no-print"></td>
    </tr>
  `;
}

function renderVatTable() {
  const tbody = document.getElementById('vat-tbody');
  if (!tbody) return;
  const hideRepeatDate = document.getElementById('vat-hide-repeat-date')?.checked;
  let prevDate = '';

  const rowsHtml = state.vatRows
    .map((r, idx) => {
      const dateStr = fmtVatDate(r.date_iso);
      const printDateStr = hideRepeatDate && r.date_iso === prevDate ? '' : dateStr;
      prevDate = r.date_iso;
      const barPrint = Number(r.gold_bar_price) ? fmtVatDec(r.gold_bar_price) : '';
      const salePrint = Number(r.sale_amount) ? fmtMoney(r.sale_amount) : '';
      const hasTaxCalc = Number(r.gold_bar_price) > 0 || Number(r.exempt_base) > 0;
      const exemptPrint = hasTaxCalc ? fmtVatDec(r.exempt_base) : '';
      const taxablePrint = hasTaxCalc ? fmtVatDec(r.taxable_base) : '';
      const vatPrint = hasTaxCalc ? fmtVatDec(r.vat_amount) : '';

      return `
        <tr>
          <td>
            <div class="screen-only">
              <input type="date" value="${esc(r.date_iso || '')}" onchange="onVatRowChange(${idx}, 'date_iso', this.value)" />
            </div>
            <span class="print-only">${esc(printDateStr)}</span>
          </td>
          <td>
            <div class="screen-only">
              <input type="text" value="${esc(r.invoice_no || '')}" placeholder="เล่มที่/เลขที่" onchange="onVatRowChange(${idx}, 'invoice_no', this.value)" />
            </div>
            <span class="print-only" id="vat-p-inv-${idx}">${esc(r.invoice_no || '')}</span>
          </td>
          <td class="num">
            <div class="screen-only">
              <input type="number" step="0.01" class="num" value="${r.gold_bar_price || ''}" placeholder="ราคาทองรูปพรรณ" onchange="onVatRowChange(${idx}, 'gold_bar_price', this.value)" />
            </div>
            <span class="print-only" id="vat-p-bar-${idx}">${esc(barPrint)}</span>
          </td>
          <td>
            <div class="screen-only">
              <input type="text" value="${esc(r.item_desc || '')}" placeholder="เช่น คอ 3.8g" onchange="onVatRowChange(${idx}, 'item_desc', this.value)" />
            </div>
            <span class="print-only" id="vat-p-item-${idx}">${esc(r.item_desc || '')}</span>
          </td>
          <td class="num">
            <div class="screen-only">
              <input type="number" step="0.01" class="num" value="${r.sale_amount ?? ''}" onchange="onVatRowChange(${idx}, 'sale_amount', this.value)" />
            </div>
            <span class="print-only" id="vat-p-sale-${idx}">${esc(salePrint)}</span>
          </td>
          <td class="num">
            <div class="screen-only">
              <input type="number" step="0.01" class="num" id="vat-in-exempt-${idx}" value="${hasTaxCalc ? (r.exempt_base ?? '') : ''}" onchange="onVatRowChange(${idx}, 'exempt_base', this.value)" />
            </div>
            <span class="print-only" id="vat-p-exempt-${idx}">${esc(exemptPrint)}</span>
          </td>
          <td class="num" id="vat-cell-taxable-${idx}">${esc(taxablePrint)}</td>
          <td class="num" id="vat-cell-vat-${idx}">${esc(vatPrint)}</td>
          <td class="center no-print">
            <button type="button" class="btn btn-sm btn-danger-outline" onclick="removeVatReportRow(${idx})">ลบ</button>
          </td>
        </tr>
      `;
    })
    .join('');

  tbody.innerHTML = rowsHtml;
  initDateInputs(tbody);
  renderVatFooter();
  renderVatPrintPages();
}

function renderVatPrintPages() {
  const container = document.getElementById('vat-print-pages');
  if (!container) return;

  const ROWS_PER_PAGE = 34;
  const monthShort = document.getElementById('vat-print-month')?.textContent || '';
  const yearShort = document.getElementById('vat-print-year')?.textContent || '';
  const hideRepeatDate = document.getElementById('vat-hide-repeat-date')?.checked;
  const showTotal = document.getElementById('vat-show-total-row')?.checked;
  const totals = computeVatTotalsClient();

  const chunks = [];
  for (let i = 0; i < state.vatRows.length; i += ROWS_PER_PAGE) {
    chunks.push(state.vatRows.slice(i, i + ROWS_PER_PAGE));
  }
  if (chunks.length === 0) chunks.push([]);

  container.innerHTML = chunks
    .map((chunk, pageIdx) => {
      const isLastPage = pageIdx === chunks.length - 1;
      let prevDate = '';
      const dataRowsHtml = chunk
        .map((r) => {
          const dateStr = fmtVatDate(r.date_iso);
          const printDateStr = hideRepeatDate && r.date_iso === prevDate ? '' : dateStr;
          prevDate = r.date_iso;
          const barStr = Number(r.gold_bar_price) ? fmtVatDec(r.gold_bar_price) : '';
          const saleStr = Number(r.sale_amount) ? fmtMoney(r.sale_amount) : '';
          const hasTaxCalc = Number(r.gold_bar_price) > 0 || Number(r.exempt_base) > 0;
          const exemptStr = hasTaxCalc ? fmtVatDec(r.exempt_base) : '';
          const taxableStr = hasTaxCalc ? fmtVatDec(r.taxable_base) : '';
          const vatStr = hasTaxCalc ? fmtVatDec(r.vat_amount) : '';

          return `
            <tr>
              <td>${esc(printDateStr)}</td>
              <td>${esc(r.invoice_no || '')}</td>
              <td class="num">${esc(barStr)}</td>
              <td>${esc(r.item_desc || '')}</td>
              <td class="num">${esc(saleStr)}</td>
              <td class="num">${esc(exemptStr)}</td>
              <td class="num">${esc(taxableStr)}</td>
              <td class="num">${esc(vatStr)}</td>
            </tr>
          `;
        })
        .join('');

      const totalHtml =
        isLastPage && showTotal
          ? `
          <tr class="vat-total-row">
            <td colspan="4" class="center">รวมทั้งสิ้น (${state.vatRows.length} รายการ)</td>
            <td class="num">${fmtMoney(totals.sale_amount)}</td>
            <td class="num">${fmtVatDec(totals.exempt_base)}</td>
            <td class="num">${fmtVatDec(totals.taxable_base)}</td>
            <td class="num">${fmtVatDec(totals.vat_amount)}</td>
          </tr>`
          : '';

      return `
        <div class="vat-print-page">
          <div class="vat-doc-header">
            <div class="vat-doc-title">รายงานภาษีขาย</div>
            <div class="vat-doc-period">
              เดือนภาษี <span class="vat-period-blank">${esc(monthShort)}</span>
              ปี <span class="vat-period-blank">${esc(yearShort)}</span>
            </div>
            <div class="vat-company-line">
              <span>ชื่อผู้ประกอบการ : <strong>บริษัท เพชรรัตน์ (บ้านกรวด) จำกัด</strong></span>
              <span>เลขประจำตัวผู้เสียภาษีอากร <strong>0315559001675</strong></span>
            </div>
            <div class="vat-company-line">
              <span>ชื่อสถานประกอบการ : <strong>ห้างทองเพชรรัตน์บ้านกรวด &nbsp; สำนักงานใหญ่</strong></span>
            </div>
          </div>

          <table class="vat-table">
            <thead>
              <tr>
                <th colspan="2">ใบกำกับภาษีขาย</th>
                <th rowspan="2" style="width:12%;">ราคาทองรูปพรรณ<br />ต่อบาท</th>
                <th rowspan="2" style="width:14%;">รายการสินค้า</th>
                <th rowspan="2" style="width:13%;">รายการขายทอง<br />รูปพรรณ</th>
                <th rowspan="2" style="width:16%;">มูลค่าของฐานภาษี<br />ที่ไม่ต้องนำมารวม<br />คำนวณ</th>
                <th rowspan="2" style="width:14%;">มูลค่าของฐานภาษี<br />ที่ต้องเสียภาษี</th>
                <th rowspan="2" style="width:11%;">ภาษีมูลค่าเพิ่ม</th>
              </tr>
              <tr>
                <th style="width:10%;">วันที่</th>
                <th style="width:10%;">เล่มที่/เลขที่</th>
              </tr>
            </thead>
            <tbody>${dataRowsHtml}${totalHtml}</tbody>
          </table>
        </div>
      `;
    })
    .join('');
}

function printVatReport() {
  renderVatPrintPages();
  window.print();
}

function onVatRowChange(idx, field, val) {
  const row = state.vatRows[idx];
  if (!row) return;

  if (field === 'date_iso') {
    row.date_iso = val;
    renderVatTable();
    return;
  }

  if (field === 'invoice_no' || field === 'buyer_name') {
    row[field] = String(val || '').trim();
    const mapId = field === 'invoice_no' ? `vat-p-inv-${idx}` : `vat-p-buyer-${idx}`;
    const el = document.getElementById(mapId);
    if (el) el.textContent = row[field];
    renderVatPrintPages();
    return;
  }

  if (field === 'item_desc') {
    row.item_desc = String(val || '').trim();
    const el = document.getElementById(`vat-p-item-${idx}`);
    if (el) el.textContent = row.item_desc;
    const parsedW = extractWeightFromDesc(row.item_desc);
    if (parsedW > 0) {
      row.weight_g = parsedW;
    }
    if ((Number(row.gold_bar_price) || 0) > 0 && (Number(row.weight_g) || 0) > 0) {
      row.exempt_base = calcGoldExemptBaseClient(row.gold_bar_price, row.weight_g);
      const exIn = document.getElementById(`vat-in-exempt-${idx}`);
      if (exIn) exIn.value = row.exempt_base;
    }
  } else {
    const numVal = round2Client(Number(val) || 0);
    row[field] = numVal;

    if (field === 'gold_bar_price') {
      if (!(Number(row.weight_g) > 0)) {
        row.weight_g = extractWeightFromDesc(row.item_desc);
      }
      if (numVal > 0 && (Number(row.weight_g) || 0) > 0) {
        row.exempt_base = calcGoldExemptBaseClient(row.gold_bar_price, row.weight_g);
        const exIn = document.getElementById(`vat-in-exempt-${idx}`);
        if (exIn) exIn.value = row.exempt_base;
      } else if (numVal <= 0) {
        row.exempt_base = 0;
        const exIn = document.getElementById(`vat-in-exempt-${idx}`);
        if (exIn) exIn.value = '';
      }
    }
  }

  const hasTaxCalc = Number(row.gold_bar_price) > 0 || Number(row.exempt_base) > 0;
  row.taxable_base = hasTaxCalc ? round2Client((Number(row.sale_amount) || 0) - (Number(row.exempt_base) || 0)) : 0;
  row.vat_amount = hasTaxCalc ? round2Client(row.taxable_base * 0.07) : 0;

  const pBar = document.getElementById(`vat-p-bar-${idx}`);
  const pSale = document.getElementById(`vat-p-sale-${idx}`);
  const pEx = document.getElementById(`vat-p-exempt-${idx}`);
  const cTax = document.getElementById(`vat-cell-taxable-${idx}`);
  const cVat = document.getElementById(`vat-cell-vat-${idx}`);
  if (pBar) pBar.textContent = Number(row.gold_bar_price) ? fmtVatDec(row.gold_bar_price) : '';
  if (pSale) pSale.textContent = Number(row.sale_amount) ? fmtMoney(row.sale_amount) : '';
  if (pEx) pEx.textContent = hasTaxCalc ? fmtVatDec(row.exempt_base) : '';
  if (cTax) cTax.textContent = hasTaxCalc ? fmtVatDec(row.taxable_base) : '';
  if (cVat) cVat.textContent = hasTaxCalc ? fmtVatDec(row.vat_amount) : '';

  renderVatFooter();
  renderVatPrintPages();
}

function applyDefaultGoldBarPrice() {
  const barVal = Number(document.getElementById('vat-default-bar-price')?.value || 0);
  if (barVal <= 0) {
    toast('กรุณากรอกราคาทองรูปพรรณต่อบาทก่อน (เช่น 61352.52)', 'error');
    return;
  }
  const hasEmpty = state.vatRows.some((r) => !(Number(r.gold_bar_price) > 0));
  if (!hasEmpty && state.vatRows.length > 0) {
    if (!confirm(`ทุกแถวมีราคาทองรูปพรรณอยู่แล้ว ต้องการเปลี่ยนเป็น ${fmtVatDec(barVal)} บาท ทั้งหมดและคำนวณใหม่ใช่หรือไม่?`)) {
      return;
    }
  }
  state.vatRows.forEach((r) => {
    if (!hasEmpty || !(Number(r.gold_bar_price) > 0)) {
      r.gold_bar_price = barVal;
    }
    if (!(Number(r.weight_g) > 0)) {
      r.weight_g = extractWeightFromDesc(r.item_desc);
    }
    if (Number(r.gold_bar_price) > 0 && Number(r.weight_g) > 0) {
      r.exempt_base = calcGoldExemptBaseClient(r.gold_bar_price, r.weight_g);
      r.taxable_base = round2Client((Number(r.sale_amount) || 0) - r.exempt_base);
      r.vat_amount = round2Client(r.taxable_base * 0.07);
    }
  });
  renderVatTable();
  toast('คำนวณฐานภาษีที่ไม่ต้องนำมารวมคำนวณเรียบร้อย');
}

function addVatReportRow() {
  const lastDate = state.vatRows.length ? state.vatRows[state.vatRows.length - 1].date_iso : getTodayIso();
  const defBar = Number(document.getElementById('vat-default-bar-price')?.value || 0);
  state.vatRows.push({
    date_iso: lastDate,
    invoice_no: '',
    buyer_name: '',
    gold_bar_price: defBar,
    weight_g: 0,
    item_desc: '',
    sale_amount: 0,
    exempt_base: 0,
    taxable_base: 0,
    vat_amount: 0,
  });
  renderVatTable();
}

function removeVatReportRow(idx) {
  state.vatRows.splice(idx, 1);
  renderVatTable();
}

function openImportVatSalesModal() {
  const cands = state.vatCache?.candidateSales || [];
  const defBar = document.getElementById('vat-default-bar-price')?.value.trim() || '';
  const rowsHtml = cands
    .map(
      (c, i) => `
      <tr>
        <td class="center"><input type="checkbox" class="vat-imp-chk" data-cand-idx="${i}" ${c.is_likely_jewelry ? 'checked' : ''} /></td>
        <td>${esc(c.date_long)}</td>
        <td><strong>${esc(c.description || '-')}</strong></td>
        <td class="num">${c.new_gold_g ? fmtWeight(c.new_gold_g) : '-'}</td>
        <td class="num"><strong>${fmtMoney(c.inc_sell)}</strong></td>
      </tr>
    `
    )
    .join('');

  openModal(
    `ดึงรายการขายทองจากสมุดบัญชี (${formatMonthKeyFull(state.vatActiveMonth, state.vatActiveYear)})`,
    `
    <div class="info-banner">
      เลือกรายการขายทองรูปพรรณที่จะนำเข้าในรายงานภาษีขาย (ระบบติ๊กเลือกเฉพาะรายการทองรูปพรรณให้อัตโนมัติ ไม่รวมแท่ง/ออมทอง/เครื่องเงิน)
    </div>
    <div class="form-group">
      <label>ราคาทองรูปพรรณต่อบาทที่ใช้คำนวณเริ่มต้น (ปรับแก้รายแถวทีหลังได้)</label>
      <input type="number" step="0.01" id="vat-imp-bar-price" value="${esc(defBar)}" placeholder="เว้นว่างไว้เพื่อดึงราคาปิดวันตามวันที่อัตโนมัติ" />
      <label style="display:inline-flex;align-items:center;gap:6px;margin-top:8px;font-weight:400;cursor:pointer;">
        <input type="checkbox" id="vat-imp-auto-fetch" checked />
        ดึงราคาทองรูปพรรณ (ฐานภาษี) ปิดวันตามวันที่อัตโนมัติ (จาก ราคาทองคำวันนี้.com เมื่อเว้นว่างด้านบน)
      </label>
    </div>
    <div class="table-wrap" style="max-height:360px;overflow-y:auto;">
      <table class="data-table">
        <thead>
          <tr><th class="center">เลือก</th><th>วันที่</th><th>รายการ</th><th class="num">น้ำหนัก (g)</th><th class="num">ยอดขาย (฿)</th></tr>
        </thead>
        <tbody>${rowsHtml || '<tr><td colspan="5" class="center muted">ไม่พบรายการขาย (ช่อง "ขาย") ในเดือนนี้</td></tr>'}</tbody>
      </table>
    </div>
    <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:14px;flex-wrap:wrap;">
      <button type="button" class="btn btn-outline" onclick="closeModal()">ยกเลิก</button>
      <button type="button" class="btn btn-outline" onclick="confirmImportVatSales('append')">เพิ่มต่อท้ายรายการเดิม</button>
      <button type="button" class="btn btn-primary" onclick="confirmImportVatSales('replace')">นำเข้าแทนที่ตารางเดิม</button>
    </div>
  `
  );
}

function extractOrnamentTaxBase(rec) {
  if (!rec) return 0;
  if (Number(rec.orn_tax_base) > 0) return round2Client(Number(rec.orn_tax_base));
  if (Number(rec.bar_buy) > 0) {
    return round2Client(Math.round((Number(rec.bar_buy) * 0.98) / 15.16) * 15.16);
  }
  return 0;
}

function resolveDailyClosingPrice(dateIso, pricesMap, prevFallback) {
  if (!dateIso) return null;
  const exactPrice = pricesMap ? extractOrnamentTaxBase(pricesMap[dateIso]) : 0;
  if (exactPrice > 0) {
    return { price: exactPrice, exact: true, refDate: dateIso };
  }
  const keys = Object.keys(pricesMap || {})
    .filter((k) => k < dateIso && extractOrnamentTaxBase(pricesMap[k]) > 0)
    .sort();
  if (keys.length > 0) {
    const lastKey = keys[keys.length - 1];
    return { price: extractOrnamentTaxBase(pricesMap[lastKey]), exact: false, refDate: lastKey };
  }
  const fallbackPrice = extractOrnamentTaxBase(prevFallback);
  if (prevFallback && prevFallback.date_iso <= dateIso && fallbackPrice > 0) {
    return { price: fallbackPrice, exact: false, refDate: prevFallback.date_iso };
  }
  return null;
}

async function fetchDailyGoldPricesForVat() {
  if (!state.vatRows.length) {
    toast('ยังไม่มีรายการในตารางรายงานภาษีขาย', 'error');
    return;
  }
  const hasEmpty = state.vatRows.some((r) => !(Number(r.gold_bar_price) > 0));
  if (!hasEmpty) {
    if (!confirm('ทุกแถวมีราคาทองรูปพรรณอยู่แล้ว ต้องการดึงราคาทองรูปพรรณปิดวันตามวันที่จาก ราคาทองคำวันนี้.com มาแทนที่ทั้งหมดใช่หรือไม่?')) {
      return;
    }
  }

  const btn = document.getElementById('vat-fetch-prices-btn');
  const origText = btn ? btn.textContent : '';
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'กำลังดึงราคาทอง...';
  }

  try {
    const params = new URLSearchParams();
    if (state.vatActiveMonth) params.set('month', state.vatActiveMonth);
    if (state.vatActiveYear) params.set('year', state.vatActiveYear);
    params.set('refresh', '1');
    const data = await api(`/api/gold-prices?${params.toString()}`);
    const pricesMap = data.prices || {};
    const prevFallback = data.prevFallback || null;

    let updatedCount = 0;
    let missingCount = 0;
    state.vatRows.forEach((r) => {
      if (hasEmpty && Number(r.gold_bar_price) > 0) return;
      const resolved = resolveDailyClosingPrice(r.date_iso, pricesMap, prevFallback);
      if (resolved && resolved.price > 0) {
        r.gold_bar_price = resolved.price;
        if (!(Number(r.weight_g) > 0)) {
          r.weight_g = extractWeightFromDesc(r.item_desc);
        }
        if (Number(r.weight_g) > 0) {
          r.exempt_base = calcGoldExemptBaseClient(r.gold_bar_price, r.weight_g);
          r.taxable_base = round2Client((Number(r.sale_amount) || 0) - r.exempt_base);
          r.vat_amount = round2Client(r.taxable_base * 0.07);
        } else {
          r.exempt_base = 0;
          r.taxable_base = 0;
          r.vat_amount = 0;
        }
        updatedCount++;
      } else {
        missingCount++;
      }
    });

    renderVatTable();
    const parts = [`ดึงราคาทองรูปพรรณปิดวันอัปเดตแล้ว ${updatedCount} รายการ`];
    if (missingCount > 0) parts.push(`ไม่พบราคา ${missingCount} รายการ`);
    if (data.warning) parts.push(`(${data.warning})`);
    parts.push('— อย่าลืมกด "บันทึกรายงานภาษีขาย"');
    toast(parts.join(' '), updatedCount > 0 ? 'success' : 'error');
  } catch (err) {
    toast('ดึงราคาทองรูปพรรณไม่สำเร็จ: ' + err.message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = origText || 'ดึงราคาทองรูปพรรณปิดวันตามวันที่';
    }
  }
}

async function confirmImportVatSales(mode) {
  const cands = state.vatCache?.candidateSales || [];
  const manualBarPrice = Number(document.getElementById('vat-imp-bar-price')?.value || 0);
  const autoFetch = Boolean(document.getElementById('vat-imp-auto-fetch')?.checked);
  const checkedChks = [...document.querySelectorAll('.vat-imp-chk:checked')];

  let pricesMap = null;
  let prevFallback = null;
  let autoFetchNote = '';
  if (manualBarPrice <= 0 && autoFetch && checkedChks.length > 0) {
    try {
      const params = new URLSearchParams();
      if (state.vatActiveMonth) params.set('month', state.vatActiveMonth);
      if (state.vatActiveYear) params.set('year', state.vatActiveYear);
      const gp = await api(`/api/gold-prices?${params.toString()}`);
      pricesMap = gp.prices || {};
      prevFallback = gp.prevFallback || null;
      if (gp.warning) autoFetchNote = ` (${gp.warning})`;
    } catch {
      autoFetchNote = ' (เชื่อมต่อเว็บราคาทองไม่ได้ — ราคาทองรูปพรรณเว้นว่างไว้)';
    }
  }

  const selected = [];
  checkedChks.forEach((chk) => {
    const c = cands[Number(chk.dataset.candIdx)];
    if (!c) return;
    const descBase = String(c.description || '').trim();
    const wG = Number(c.new_gold_g || 0) || extractWeightFromDesc(descBase);
    const saleAmt = Number(c.inc_sell || 0);
    let rowBarPrice = manualBarPrice;
    if (rowBarPrice <= 0 && pricesMap) {
      const resolved = resolveDailyClosingPrice(c.date_iso, pricesMap, prevFallback);
      if (resolved && resolved.price > 0) rowBarPrice = resolved.price;
    }
    const exemptBase = rowBarPrice > 0 && wG > 0 ? calcGoldExemptBaseClient(rowBarPrice, wG) : 0;
    const taxableBase = rowBarPrice > 0 && exemptBase > 0 ? round2Client(saleAmt - exemptBase) : 0;
    const vatAmt = taxableBase !== 0 ? round2Client(taxableBase * 0.07) : 0;
    const hasUnit = /\d/.test(descBase);
    const itemDesc = Number(c.new_gold_g || 0) > 0 && !hasUnit ? `${descBase} ${c.new_gold_g}g`.trim() : descBase;
    selected.push({
      date_iso: c.date_iso,
      invoice_no: '',
      buyer_name: '',
      gold_bar_price: rowBarPrice,
      weight_g: wG,
      item_desc: itemDesc,
      sale_amount: saleAmt,
      exempt_base: exemptBase,
      taxable_base: taxableBase,
      vat_amount: vatAmt,
      linked_entry_id: c.id,
    });
  });

  if (mode === 'replace') {
    state.vatRows = selected;
  } else {
    state.vatRows = [...state.vatRows, ...selected];
  }
  closeModal();
  renderVatTable();
  toast(`นำเข้า ${selected.length} รายการลงตารางรายงานภาษีขายแล้ว${autoFetchNote} (อย่าลืมกด "บันทึกรายงานภาษีขาย")`);
}

async function saveVatReport() {
  try {
    const saved = await api('/api/account/vat-report', {
      method: 'POST',
      body: JSON.stringify({
        month_key: state.vatActiveMonth,
        date_iso: state.vatRows[0]?.date_iso || getTodayIso(),
        rows: state.vatRows,
      }),
    });
    state.vatRows = (saved.rows || []).map((r) => ({ ...r }));
    renderVatTable();
    toast('บันทึกรายงานภาษีขายเรียบร้อยแล้ว');
  } catch (err) {
    toast(err.message, 'error');
  }
}

/* ==================== STOCK (Stock ทอง) ==================== */
async function loadStockView() {
  try {
    const picker = document.getElementById('stock-date-picker');
    if (!picker.value) picker.value = getTodayIso();
    initDateInputs();
    const d = await api(`/api/stock?date=${encodeURIComponent(picker.value)}`);
    state.stockCache = d;

    document.getElementById('stock-kpis').innerHTML = `
      <div class="kpi-card">
        <div class="kpi-label">น้ำหนักทองรูปพรรณ/แท่งคงเหลือ</div>
        <div class="kpi-value">${fmtWeight(d.totals.totalStandardGoldWeightG)} กรัม</div>
        <div class="kpi-sub">รวม ${d.totals.totalStandardPieces} ชิ้น (1 กรัม - 3 บาท)</div>
      </div>
      <div class="kpi-card primary">
        <div class="kpi-label">ทองเก่า 96.5% สะสม</div>
        <div class="kpi-value">${fmtWeight(d.totals.old965WeightG)} กรัม</div>
        <div class="kpi-sub">ทองเก่า 90% สะสม ${fmtWeight(d.totals.old90WeightG)} กรัม</div>
      </div>
      <div class="kpi-card emerald">
        <div class="kpi-label">ทอง 90% / 18K / เพชร / 99.99% / ต่างๆ</div>
        <div class="kpi-value">${d.totals.totalSpecialPieces} ชิ้น</div>
        <div class="kpi-sub">นับตามจำนวนชิ้น</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">ประวัติการบันทึกสต๊อก</div>
        <div class="kpi-value">${d.totals.totalTrackedDays} วัน</div>
        <div class="kpi-sub">กำลังดูความเคลื่อนไหววันที่ ${fmtThaiLong(d.selectedDate)}</div>
      </div>
    `;

    document.getElementById('stock-matrix-grid').innerHTML = d.groups
      .map(
        (g) => `
      <div class="stock-group-card">
        <div class="stock-group-head">
          <span>${esc(g.group)}</span>
          <span>${g.isWeight ? fmtWeight(g.totalWeightG) + ' g' : g.totalQty + ' ชิ้น' + (g.unitWeight > 0 ? ' (' + fmtWeight(g.totalWeightG) + ' g)' : '')}</span>
        </div>
        <div>
          ${g.items
            .map(
              (item) => `
            <div class="stock-item-row">
              <div>
                <strong>${esc(item.item)}</strong> <span class="muted">(${item.col})</span>
                <div class="stock-item-moves">
                  วันนี้: +${item.todayIn} / ขาย -${item.todayOut} / ชำรุด -${item.todayDamaged}
                </div>
              </div>
              <div class="muted">${!item.isWeight && item.unitWeight > 0 ? fmtWeight(item.weightG) + ' g' : ''}</div>
              <div class="stock-qty-badge" onclick="openStockModal('${item.col}')" title="คลิกเพื่อบันทึก รับใหม่ / ขาย / ชำรุด">
                ${item.isWeight ? fmtWeight(item.qty) + ' g' : item.qty}
              </div>
            </div>
          `
            )
            .join('')}
        </div>
      </div>
    `
      )
      .join('');

    document.getElementById('stock-history-tbody').innerHTML = d.historyDesc
      .slice(0, 60)
      .map(
        (h) => `
      <tr>
        <td><strong>${esc(h.date_long)}</strong></td>
        <td class="num">${h.inOld90 ? '+' + fmtWeight(h.inOld90) : '-'}</td>
        <td class="num">${h.inOld965 ? '+' + fmtWeight(h.inOld965) : '-'}</td>
        <td class="num text-inc">${h.totalInPieces ? '+' + h.totalInPieces : '-'}</td>
        <td class="num text-exp">${h.totalOutPieces ? '-' + h.totalOutPieces : '-'}</td>
        <td class="num">${h.totalDmgPieces ? '-' + h.totalDmgPieces : '-'}</td>
        <td class="num"><strong>${fmtWeight(h.endOldGoldG)}</strong></td>
        <td class="num"><strong>${fmtWeight(h.endNewGoldG)}</strong></td>
        <td class="center">
          <button class="btn btn-sm btn-outline" onclick="jumpStockDate('${esc(h.date_iso)}')">เลือกวันนี้</button>
        </td>
      </tr>
    `
      )
      .join('');
  } catch (err) {
    toast('โหลดสต๊อกทองไม่สำเร็จ: ' + err.message, 'error');
  }
}

function jumpStockDate(dateIso) {
  const picker = document.getElementById('stock-date-picker');
  picker.value = dateIso;
  syncDateInputDisplay(picker);
  loadStockView();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ==================== GOOGLE SHEETS SYNC VIEW ==================== */
function renderSyncSheetLinks(cfg, accountSheetsByYear) {
  const box = document.getElementById('sync-sheet-links-box');
  if (!box) return;
  const pawnId = cfg.pawn_sheet_id || '1_ReGE-qfsq8WYvUoFvLlssuiAVBjiTwrMAuOsdyJjbw';
  const stockId = cfg.stock_sheet_id || '1-sm5_U2B7lUdARPFQJmK_-CjtwZnI3cVZpEIsQnK3I8';
  const years = Object.keys(accountSheetsByYear || {}).sort((a, b) => Number(a) - Number(b));
  const accLinks = years
    .map(
      (yr, idx) => `
      <a class="sheet-link-item" href="https://docs.google.com/spreadsheets/d/${esc(accountSheetsByYear[yr])}/edit" target="_blank">
        <strong>${idx + 2}. รายรับรายจ่าย ${esc(yr)}</strong>
        <span>เปิดไฟล์ Google Sheets ↗</span>
      </a>`
    )
    .join('');

  box.innerHTML = `
    <a class="sheet-link-item" href="https://docs.google.com/spreadsheets/d/${esc(pawnId)}/edit" target="_blank">
      <strong>1. จำนำทอง เริ่ม 4818</strong>
      <span>เปิดไฟล์ Google Sheets ↗</span>
    </a>
    ${accLinks}
    <a class="sheet-link-item" href="https://docs.google.com/spreadsheets/d/${esc(stockId)}/edit" target="_blank">
      <strong>${years.length + 2}. Stock ทอง เริ่ม 20/4/69</strong>
      <span>เปิดไฟล์ Google Sheets ↗</span>
    </a>
  `;
}

function collectAccountYearEntries() {
  const rows = [...document.querySelectorAll('#sync-account-years-list .acc-year-row')];
  return rows.map((row) => ({
    year: row.querySelector('.acc-year-num')?.value.trim() || '',
    sheet: row.querySelector('.acc-year-sheet')?.value.trim() || '',
  }));
}

function renderAccountYearRows(entries) {
  const wrap = document.getElementById('sync-account-years-list');
  if (!wrap) return;
  wrap.innerHTML = entries
    .map(
      (ent) => `
      <div class="acc-year-row" style="display:grid;grid-template-columns:100px 1fr auto;gap:8px;align-items:center;">
        <input type="text" class="acc-year-num" value="${esc(ent.year)}" placeholder="2570" ${ent.year === '2569' ? 'readonly' : ''} style="padding:7px 10px;border:1px solid #d5ccb9;border-radius:8px;font-family:inherit;font-size:13px;" />
        <input type="text" class="acc-year-sheet" value="${esc(ent.sheet)}" placeholder="วางลิงก์ Google Sheet หรือ Sheet ID ของปี ${esc(ent.year || '2570')}" style="padding:7px 10px;border:1px solid #d5ccb9;border-radius:8px;font-family:inherit;font-size:13px;" />
        ${
          ent.year === '2569'
            ? '<span class="muted" style="font-size:11.5px;padding:0 6px;">ปีหลัก</span>'
            : '<button type="button" class="btn btn-sm btn-danger-outline" onclick="this.closest(\'.acc-year-row\').remove()">ลบ</button>'
        }
      </div>
    `
    )
    .join('');
}

function addAccountYearSheetRow() {
  const entries = collectAccountYearEntries();
  const maxYr = entries.reduce((mx, e) => Math.max(mx, Number(e.year) || 0), 2569);
  entries.push({ year: String(maxYr + 1), sheet: '' });
  renderAccountYearRows(entries);
}

async function loadSyncView() {
  try {
    const d = await api('/api/sync/status');
    state.syncCache = d;
    document.getElementById('sync-apps-script-url').value = d.config.apps_script_url || '';
    document.getElementById('sync-apps-script-secret').value = d.config.apps_script_secret || '';
    document.getElementById('sync-auto-enabled').value = d.config.auto_sync_enabled || '1';
    document.getElementById('sync-code-gs').value = d.codeGs || '';

    const accountSheets = d.accountSheetsByYear || { '2569': d.config.account_sheet_id || '' };
    const yearEntries = Object.keys(accountSheets)
      .sort((a, b) => Number(a) - Number(b))
      .map((yr) => ({ year: yr, sheet: accountSheets[yr] }));
    renderAccountYearRows(yearEntries);
    renderSyncSheetLinks(d.config, accountSheets);

    const c = d.queue.counts;
    document.getElementById('sync-queue-stats').textContent =
      `รอส่ง: ${c.pending || 0} | ซิงค์สำเร็จ: ${c.synced || 0} | ล้มเหลว: ${c.failed || 0} | ดึงข้อมูลล่าสุด: ${d.config.last_pull_at ? new Date(d.config.last_pull_at).toLocaleString('th-TH') : 'ใช้ข้อมูล Snapshot ตั้งต้น'}`;

    updateSyncPill({
      counts: c,
      hasAppsScript: Boolean(d.config.apps_script_url),
      hasServiceAccount: Boolean(d.config.has_service_account),
    });

    document.getElementById('sync-queue-tbody').innerHTML =
      d.queue.items
        .map((q) => {
          const badge =
            q.status === 'synced'
              ? '<span class="badge badge-redeemed">ซิงค์สำเร็จ</span>'
              : q.status === 'failed'
              ? '<span class="badge badge-overdue">ล้มเหลว</span>'
              : '<span class="badge badge-bad">รอส่ง</span>';
          return `
        <tr>
          <td>#${q.id}</td>
          <td><strong>${esc(q.target_sheet)}</strong></td>
          <td>${esc(q.action)}</td>
          <td>${badge}</td>
          <td>${new Date(q.created_at).toLocaleString('th-TH')}</td>
          <td>${q.synced_at ? new Date(q.synced_at).toLocaleString('th-TH') : '-'}</td>
          <td class="muted">${esc(q.error_msg || q.payload_json.slice(0, 90))}</td>
        </tr>
      `;
        })
        .join('') || '<tr><td colspan="7" class="center muted">ยังไม่มีรายการในคิวซิงค์</td></tr>';
  } catch (err) {
    toast('โหลดสถานะการซิงค์ไม่สำเร็จ: ' + err.message, 'error');
  }
}

async function saveSyncConfig() {
  try {
    const accountSheetsByYear = {};
    for (const ent of collectAccountYearEntries()) {
      if (/^\d{4}$/.test(ent.year) && ent.sheet) {
        accountSheetsByYear[ent.year] = ent.sheet;
      }
    }
    await api('/api/sync/config', {
      method: 'POST',
      body: JSON.stringify({
        apps_script_url: document.getElementById('sync-apps-script-url').value.trim(),
        apps_script_secret: document.getElementById('sync-apps-script-secret').value.trim(),
        auto_sync_enabled: document.getElementById('sync-auto-enabled').value,
        account_sheets_by_year: accountSheetsByYear,
      }),
    });
    toast('บันทึกการตั้งค่า Google Sheets แล้ว');
    loadSyncView();
    loadDashboard();
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function testSyncConnection() {
  const feedback = document.getElementById('sync-feedback-msg');
  feedback.innerHTML = '<div class="info-banner">กำลังทดสอบการเชื่อมต่อกับ Google Apps Script...</div>';
  try {
    const url = document.getElementById('sync-apps-script-url').value.trim();
    const res = await api('/api/sync/test', {
      method: 'POST',
      body: JSON.stringify({ apps_script_url: url }),
    });
    feedback.innerHTML = `<div class="info-banner" style="background:#ecfdf5;border-color:#6ee7b7;color:#065f46;">เชื่อมต่อสำเร็จ! (${esc(res.service || 'OK')})</div>`;
    toast('เชื่อมต่อ Google Apps Script สำเร็จ!');
  } catch (err) {
    feedback.innerHTML = `<div class="info-banner" style="background:#fef2f2;border-color:#fca5a5;color:#991b1b;">เชื่อมต่อไม่สำเร็จ: ${esc(err.message)}</div>`;
  }
}

async function pushSyncQueueNow() {
  try {
    const res = await api('/api/sync/push', { method: 'POST', body: '{}' });
    toast(`ส่งข้อมูลแล้ว ${res.processed || 0} รายการ (ล้มเหลว ${res.failed || 0})`);
    loadSyncView();
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function pullFromGoogleSheetsNow() {
  const feedback = document.getElementById('sync-feedback-msg');
  feedback.innerHTML = '<div class="info-banner">กำลังดาวน์โหลดข้อมูลล่าสุดจาก Google Sheets ทั้ง 3 ไฟล์...</div>';
  try {
    const res = await api('/api/sync/pull', { method: 'POST', body: '{}' });
    feedback.innerHTML = `<div class="info-banner" style="background:#ecfdf5;border-color:#6ee7b7;color:#065f46;">ดึงข้อมูลสำเร็จ: จำนำ ${res.seeded.pawnCount} ใบ, บัญชี ${res.seeded.accountCount} รายการ, สต๊อก ${res.seeded.stockCount} รายการ</div>`;
    toast('ดึงข้อมูลล่าสุดจาก Google Sheets เรียบร้อย!');
    loadSyncView();
    loadDashboard();
  } catch (err) {
    feedback.innerHTML = `<div class="info-banner" style="background:#fef2f2;border-color:#fca5a5;color:#991b1b;">ดึงข้อมูลไม่สำเร็จ: ${esc(err.message)}</div>`;
  }
}

function copyCodeGs() {
  const ta = document.getElementById('sync-code-gs');
  ta.select();
  navigator.clipboard?.writeText(ta.value);
  toast('คัดลอกโค้ด Code.gs แล้ว! นำไปวางใน Google Apps Script ได้เลย');
}

/* ==================== MODALS ==================== */
function openModal(title, html) {
  const modalBody = document.getElementById('modal-body');
  document.getElementById('modal-title').textContent = title;
  modalBody.innerHTML = html;
  initDateInputs(modalBody);
  document.getElementById('modal-backdrop').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('modal-backdrop').classList.add('hidden');
}

function closeModalIfBackdrop(e) {
  if (e.target.id === 'modal-backdrop') closeModal();
}

const PAWN_NOTE_OPTIONS = [
  'ชำรุด / ไม่สมบูรณ์ / ไม่มีตะขอ',
  'สกปรกมาก / เปียก / มีวัสดุอื่น',
  'ลงยา / มีอัญมณี',
  'ทอง 90',
  'ทอง 99',
];

function renderPawnNoteOptions(selectedNote = '') {
  const val = String(selectedNote || '').trim();
  const extra = val && !PAWN_NOTE_OPTIONS.includes(val) ? `<option value="${esc(val)}" selected>${esc(val)}</option>` : '';
  return [
    `<option value="" ${!val ? 'selected' : ''}>-- ไม่มีหมายเหตุ --</option>`,
    ...PAWN_NOTE_OPTIONS.map((opt) => `<option value="${esc(opt)}" ${val === opt ? 'selected' : ''}>${esc(opt)}</option>`),
    extra,
  ].join('');
}

async function openNewPawnModal() {
  let nextNo = '6326';
  try {
    const res = await api('/api/pawn/next-no');
    nextNo = res.nextTicketNo;
  } catch {
    // ignore
  }
  const today = getTodayIso();
  openModal(
    'รับจำนำทองใหม่ (+ ลงบัญชีอัตโนมัติ)',
    `
    <form onsubmit="submitNewPawn(event)">
      <div class="form-row">
        <div class="form-group">
          <label>เลขที่จำนำ *</label>
          <input type="text" id="np-ticket-no" value="${esc(nextNo)}" required />
        </div>
        <div class="form-group">
          <label>วันที่จำนำ</label>
          <input type="date" id="np-date" value="${today}" required />
        </div>
      </div>
      <div class="form-group">
        <label>ชื่อ-สกุล ลูกค้า *</label>
        <input type="text" id="np-customer" placeholder="ระบุชื่อ-นามสกุลลูกค้า" required autofocus />
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>รายการทอง *</label>
          <input type="text" id="np-item" placeholder="เช่น คอ, ข้อมือ, แหวน, กรอบพระเลี่ยมทอง" required />
          <div class="chip-row">
            ${['คอ', 'ข้อมือ', 'แหวน', 'จี้ทอง', 'ต่างหู', 'กรอบพระเลี่ยมทอง', 'ทองแท่ง']
              .map((it) => `<button type="button" class="quick-chip" onclick="appendChip('np-item','${it}')">+ ${it}</button>`)
              .join('')}
          </div>
        </div>
        <div class="form-group">
          <label>จำนวน (ชิ้น)</label>
          <input type="text" id="np-qty" placeholder="เช่น 1, 2 (ถ้า 1 ชิ้นเว้นว่างได้)" />
        </div>
      </div>
      <div class="form-row-3">
        <div class="form-group">
          <label>น้ำหนักรวม (กรัม)</label>
          <input type="number" step="0.01" id="np-weight" placeholder="เช่น 7.6" />
          <div class="chip-row">
            ${[1.9, 3.8, 7.6, 15.2, 30.4]
              .map((w) => `<button type="button" class="quick-chip" onclick="document.getElementById('np-weight').value='${w}'">${w}g</button>`)
              .join('')}
          </div>
        </div>
        <div class="form-group">
          <label>หมายเหตุ</label>
          <select id="np-note">
            ${renderPawnNoteOptions('')}
          </select>
        </div>
        <div class="form-group">
          <label>กำหนดตัดดอก (เดือน)</label>
          <select id="np-term">
            <option value="1">1 เดือน</option>
            <option value="2">2 เดือน</option>
            <option value="3" selected>3 เดือน</option>
            <option value="4">4 เดือน</option>
            <option value="5">5 เดือน</option>
            <option value="8">8 เดือน</option>
            <option value="1ปี">1 ปี (12 เดือน)</option>
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>ยอดเงินจำนำ (บาท) *</label>
          <input type="number" step="1" id="np-principal" required oninput="document.getElementById('np-interest-preview').textContent = fmtMoney(Number(this.value||0)*0.02) + ' บาท/เดือน'" />
        </div>
        <div class="form-group">
          <label>ดอกเบี้ย 2% ต่อเดือน (คำนวณอัตโนมัติ)</label>
          <div class="info-banner" style="margin:0;padding:8px 12px;"><strong id="np-interest-preview">0 บาท/เดือน</strong></div>
        </div>
      </div>
      <label class="checkbox-line">
        <input type="checkbox" id="np-record-account" checked />
        ลงรายจ่ายช่อง "จำ" ในบัญชีรายรับ-รายจ่ายวันนี้อัตโนมัติ
      </label>
      <div class="form-group">
        <label>ถ้าโอนให้ลูกค้า (ระบุยอดโอนในบัญชี ฿ - ถ้าจ่ายเงินสดให้เว้นว่าง)</label>
        <input type="number" step="0.01" id="np-transfer" placeholder="0" />
      </div>
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:14px;">
        <button type="button" class="btn btn-outline" onclick="closeModal()">ยกเลิก</button>
        <button type="submit" class="btn btn-gold">บันทึกรับจำนำ</button>
      </div>
    </form>
  `
  );
}

function appendChip(inputId, text) {
  const el = document.getElementById(inputId);
  el.value = el.value.trim() ? `${el.value.trim()}, ${text}` : text;
}

async function submitNewPawn(e) {
  e.preventDefault();
  try {
    const payload = {
      ticket_no: document.getElementById('np-ticket-no').value.trim(),
      pawn_date: document.getElementById('np-date').value,
      customer_name: document.getElementById('np-customer').value.trim(),
      item_desc: document.getElementById('np-item').value.trim(),
      item_qty: document.getElementById('np-qty')?.value.trim() || '',
      weight_g: Number(document.getElementById('np-weight').value || 0),
      note: document.getElementById('np-note').value.trim(),
      term_raw: document.getElementById('np-term').value,
      principal: Number(document.getElementById('np-principal').value || 0),
      record_account: document.getElementById('np-record-account').checked,
      transfer_amount: Number(document.getElementById('np-transfer').value || 0),
    };
    const res = await api('/api/pawn', { method: 'POST', body: JSON.stringify(payload) });
    closeModal();
    toast(`บันทึกรับจำนำเลขที่ ${res.ticket.ticket_no} เรียบร้อยแล้ว`);
    if (state.activeTab === 'pawn') loadPawnTable();
    else if (state.activeTab === 'dashboard') loadDashboard();
  } catch (err) {
    toast(err.message, 'error');
  }
}

function openQuickPawnLookup() {
  openModal(
    'ค้นหาตั๋วจำนำเพื่อ ต่อดอก / ไถ่ถอน / ลดต้น',
    `
    <div class="form-group">
      <label>พิมพ์เลขที่จำนำ หรือ ชื่อลูกค้า</label>
      <input type="text" id="ql-input" placeholder="เช่น 6008, 6320, ชื่อลูกค้า..." oninput="runQuickLookup(this.value)" autofocus />
    </div>
    <div id="ql-results" class="table-wrap" style="max-height:360px;overflow-y:auto;"></div>
  `
  );
  runQuickLookup('');
}

async function runQuickLookup(q) {
  try {
    const res = await api(`/api/pawn?status=active&search=${encodeURIComponent(q)}&limit=12`);
    document.getElementById('ql-results').innerHTML = `
      <table class="data-table">
        <thead><tr><th>เลขที่</th><th>ชื่อลูกค้า</th><th>รายการ</th><th class="num">เงินต้น</th><th class="center">ดำเนินการ</th></tr></thead>
        <tbody>
          ${res.tickets
            .map((t) => {
              state.pawnTicketsMap[t.id] = t;
              return `
              <tr>
                <td><strong>${esc(t.ticket_no)}</strong></td>
                <td>${esc(t.customer_name)}</td>
                <td>${esc(t.item_desc)}</td>
                <td class="num"><strong>${fmtMoney(t.principal)}</strong></td>
                <td class="center">
                  <button class="btn btn-sm btn-primary" onclick="openPawnActionModal(${t.id}, 'pay_interest')">ต่อดอก</button>
                  <button class="btn btn-sm btn-emerald" onclick="openPawnActionModal(${t.id}, 'redeem')">ไถ่ถอน</button>
                </td>
              </tr>
            `;
            })
            .join('')}
        </tbody>
      </table>
    `;
  } catch {
    // ignore
  }
}

function openPawnActionModal(id, defaultAction = 'pay_interest') {
  const t = state.pawnTicketsMap[id];
  if (!t) return;
  const today = getTodayIso();

  openModal(
    `จัดการตั๋วจำนำเลขที่ ${t.ticket_no} — ${t.customer_name}`,
    `
    <div class="info-banner">
      <strong>รายการ:</strong> ${esc(t.item_desc)} (${fmtWeight(t.weight_g)} g) |
      <strong>ยอดจำนำปัจจุบัน:</strong> ${fmtMoney(t.principal)} ฿ |
      <strong>ดอกเบี้ย 2%:</strong> ${fmtMoney(t.monthly_interest)} ฿/ด. |
      <strong>สถานะ:</strong> ${esc(t.computed_status)}
      ${t.paid_dates?.length ? `<div class="muted">ประวัติจ่ายดอก: ${t.paid_dates.map(fmtThaiShort).join(', ')}</div>` : ''}
    </div>

    <div class="form-group">
      <label>เลือกการดำเนินการ</label>
      <select id="pa-action" onchange="renderPawnActionFields(${t.id})">
        <option value="pay_interest" ${defaultAction === 'pay_interest' ? 'selected' : ''}>ต่อดอก (บันทึกวันที่จ่ายดอก + ลงบัญชีดอกเบี้ย)</option>
        <option value="redeem" ${defaultAction === 'redeem' ? 'selected' : ''}>ไถ่ถอน (ปิดตั๋วเป็น ไถ่แล้ว + ลงบัญชีไถ่/ดอก)</option>
        <option value="reduce_principal">ลดต้น (รับเงินลดเงินต้น + ปรับดอกเบี้ย 2% ใหม่)</option>
        <option value="increase_principal">เพิ่มยอดจำนำ (จ่ายเงินเพิ่ม + ปรับดอกเบี้ย 2% ใหม่)</option>
        <option value="forfeit">เปลี่ยนเป็นหลุดจำ</option>
        <option value="edit">แก้ไขข้อมูลตั๋วจำนำ</option>
      </select>
    </div>

    <form onsubmit="submitPawnAction(event, ${t.id})">
      <div id="pa-dynamic-fields"></div>
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:14px;">
        <button type="button" class="btn btn-danger-outline" onclick="deletePawnTicketConfirm(${t.id}, '${esc(t.ticket_no)}', '${esc(t.customer_name || '')}')">ลบรายการจำนำ</button>
        <div style="display:flex;gap:8px;">
          <button type="button" class="btn btn-outline" onclick="closeModal()">ยกเลิก</button>
          <button type="submit" class="btn btn-primary">ยืนยันบันทึก</button>
        </div>
      </div>
    </form>
  `
  );
  renderPawnActionFields(t.id, today);
}

function renderPawnActionFields(id, defaultDate = getTodayIso()) {
  const t = state.pawnTicketsMap[id];
  const action = document.getElementById('pa-action').value;
  const box = document.getElementById('pa-dynamic-fields');

  if (action === 'pay_interest') {
    box.innerHTML = `
      <div class="form-row">
        <div class="form-group"><label>วันที่จ่ายดอก</label><input type="date" id="pa-date" value="${defaultDate}" required /></div>
        <div class="form-group"><label>จำนวนดอกเบี้ยที่รับ (บาท)</label><input type="number" step="0.01" id="pa-interest" value="${t.monthly_interest}" required /></div>
      </div>
      <label class="checkbox-line"><input type="checkbox" id="pa-acc" checked /> ลงรายรับช่อง "ดอก" ในบัญชีวันนี้อัตโนมัติ</label>
      <div class="form-group"><label>ถ้าลูกค้าโอนเงิน (ระบุยอดโอนในช่องโอน ฿ ถ้าเงินสดเว้น 0)</label><input type="number" step="0.01" id="pa-transfer" value="0" /></div>
    `;
  } else if (action === 'redeem') {
    box.innerHTML = `
      <div class="form-row">
        <div class="form-group"><label>วันที่ไถ่ถอน</label><input type="date" id="pa-date" value="${defaultDate}" required /></div>
        <div class="form-group"><label>ดอกเบี้ยที่เก็บเพิ่มวันไถ่ (บาท)</label><input type="number" step="0.01" id="pa-interest" value="${t.monthly_interest}" /></div>
      </div>
      <div class="form-group"><label>ข้อความสถานะ</label><input type="text" id="pa-status-text" value="ไถ่แล้ว" /></div>
      <label class="checkbox-line"><input type="checkbox" id="pa-acc" checked /> ลงรายรับ "ไถ่ (${fmtMoney(t.principal)}) + ดอก" ในบัญชีวันนี้อัตโนมัติ</label>
      <div class="form-group"><label>ถ้าลูกค้าโอนเงิน (ระบุยอดโอนในช่องโอน ฿)</label><input type="number" step="0.01" id="pa-transfer" value="0" /></div>
    `;
  } else if (action === 'reduce_principal' || action === 'increase_principal') {
    const isRed = action === 'reduce_principal';
    box.innerHTML = `
      <div class="form-row">
        <div class="form-group"><label>วันที่ทำรายการ</label><input type="date" id="pa-date" value="${defaultDate}" required /></div>
        <div class="form-group"><label>${isRed ? 'ยอดเงินต้นที่นำมาลด (บาท)' : 'ยอดเงินต้นที่เพิ่ม (บาท)'}</label><input type="number" step="1" id="pa-amount" required /></div>
      </div>
      <div class="form-group"><label>ดอกเบี้ยที่จ่ายพร้อมกัน (ถ้ามี)</label><input type="number" step="0.01" id="pa-interest" value="0" /></div>
      <label class="checkbox-line"><input type="checkbox" id="pa-acc" checked /> ลงบัญชีรายรับ-รายจ่ายวันนี้อัตโนมัติ</label>
      <div class="form-group"><label>ยอดโอน (ถ้ามี)</label><input type="number" step="0.01" id="pa-transfer" value="0" /></div>
    `;
  } else if (action === 'forfeit') {
    box.innerHTML = `<p class="muted">ยืนยันเปลี่ยนสถานะตั๋วจำนำเลขที่ <strong>${esc(t.ticket_no)}</strong> เป็น "หลุดจำ" และนำออกจากรายการรอตัดดอก</p>`;
  } else {
    box.innerHTML = `
      <div class="form-row">
        <div class="form-group"><label>ชื่อ-สกุล</label><input type="text" id="pa-cust" value="${esc(t.customer_name)}" /></div>
        <div class="form-group"><label>รายการทอง</label><input type="text" id="pa-item" value="${esc(t.item_desc)}" /></div>
      </div>
      <div class="form-row-3">
        <div class="form-group"><label>น้ำหนัก (กรัม)</label><input type="number" step="0.01" id="pa-weight" value="${t.weight_g}" /></div>
        <div class="form-group"><label>ยอดเงินต้น (บาท)</label><input type="number" step="1" id="pa-principal" value="${t.principal}" /></div>
        <div class="form-group"><label>กำหนดตัดดอก (เดือน)</label><input type="text" id="pa-term" value="${esc(t.term_raw || t.term_months)}" /></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>สถานะ (เว้นว่าง = จำนำอยู่)</label><input type="text" id="pa-status" value="${esc(t.status)}" /></div>
        <div class="form-group"><label>วันที่ไถ่ (ถ้ามี)</label><input type="date" id="pa-redeem-date" value="${esc(t.redeem_date)}" /></div>
      </div>
      <div class="form-group">
        <label>หมายเหตุ</label>
        <select id="pa-note">
          ${renderPawnNoteOptions(t.note)}
        </select>
      </div>
    `;
  }
  initDateInputs(box);
}

async function submitPawnAction(e, id) {
  e.preventDefault();
  const action = document.getElementById('pa-action').value;
  const payload = { action };

  if (action === 'pay_interest') {
    payload.date_iso = document.getElementById('pa-date').value;
    payload.interest_paid = Number(document.getElementById('pa-interest').value || 0);
    payload.record_account = document.getElementById('pa-acc').checked;
    payload.transfer_amount = Number(document.getElementById('pa-transfer').value || 0);
  } else if (action === 'redeem') {
    payload.date_iso = document.getElementById('pa-date').value;
    payload.interest_paid = Number(document.getElementById('pa-interest').value || 0);
    payload.status_text = document.getElementById('pa-status-text').value;
    payload.record_account = document.getElementById('pa-acc').checked;
    payload.transfer_amount = Number(document.getElementById('pa-transfer').value || 0);
  } else if (action === 'reduce_principal' || action === 'increase_principal') {
    payload.date_iso = document.getElementById('pa-date').value;
    payload.amount = Number(document.getElementById('pa-amount').value || 0);
    payload.interest_paid = Number(document.getElementById('pa-interest').value || 0);
    payload.record_account = document.getElementById('pa-acc').checked;
    payload.transfer_amount = Number(document.getElementById('pa-transfer').value || 0);
  } else if (action === 'edit') {
    payload.customer_name = document.getElementById('pa-cust').value;
    payload.item_desc = document.getElementById('pa-item').value;
    payload.weight_g = Number(document.getElementById('pa-weight').value || 0);
    payload.principal = Number(document.getElementById('pa-principal').value || 0);
    payload.term_months = document.getElementById('pa-term').value;
    payload.term_raw = document.getElementById('pa-term').value;
    payload.status = document.getElementById('pa-status').value;
    payload.redeem_date = document.getElementById('pa-redeem-date').value;
    payload.note = document.getElementById('pa-note').value;
  }

  try {
    const res = await api(`/api/pawn/${id}/action`, { method: 'POST', body: JSON.stringify(payload) });
    closeModal();
    toast(`อัปเดตตั๋วเลขที่ ${res.ticket.ticket_no} เรียบร้อย`);
    if (state.activeTab === 'pawn') loadPawnTable();
    else if (state.activeTab === 'overdue') loadOverdueTable();
    else if (state.activeTab === 'dashboard') loadDashboard();
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function deletePawnTicketConfirm(id, ticketNo, customerName) {
  if (!confirm(`ยืนยันลบรายการจำนำเลขที่ ${ticketNo} (${customerName || '-'}) ใช่หรือไม่?\n(รายการบัญชีที่ผูกกับเลขที่จำนำนี้จะถูกลบออกด้วย)`)) {
    return;
  }
  try {
    await api(`/api/pawn/${id}`, { method: 'DELETE' });
    closeModal();
    toast(`ลบรายการจำนำเลขที่ ${ticketNo} เรียบร้อยแล้ว`);
    if (state.activeTab === 'pawn') loadPawnTable();
    else if (state.activeTab === 'overdue') loadOverdueTable();
    else if (state.activeTab === 'dashboard') loadDashboard();
    else if (state.activeTab === 'account') loadAccountView();
  } catch (err) {
    toast(err.message, 'error');
  }
}

/* ==================== ACCOUNT ENTRY MODAL ==================== */
async function openAccountEntryModal(defaultDate = getTodayIso()) {
  if (!state.stockCache) {
    try {
      state.stockCache = await api('/api/stock');
    } catch {
      // ignore
    }
  }
  const stockColsOptions = (state.stockCache?.columns || [])
    .map((c) => `<option value="${c.col}">${esc(c.group)} - ${esc(c.item)} (${c.col})</option>`)
    .join('');

  openModal(
    'ลงบัญชีรายรับ-รายจ่าย (+ ตัดสต๊อกอัตโนมัติ)',
    `
    <form onsubmit="submitAccountEntry(event)">
      <div class="form-row">
        <div class="form-group"><label>วันที่</label><input type="date" id="ae-date" value="${defaultDate}" required /></div>
        <div class="form-group"><label>รายการ *</label><input type="text" id="ae-desc" placeholder="เช่น คอ 1 สลึง, เงินเข้า, ค่าน้ำ..." required autofocus /></div>
      </div>

      <div class="info-banner" style="padding:8px 12px;">
        <strong>ฝั่งรายรับ (บาท)</strong>
        <div class="form-row-3" style="margin-top:6px;">
          <div class="form-group"><label>ทองใหม่ (กรัม)</label><input type="number" step="0.01" id="ae-new-g" value="0" /></div>
          <div class="form-group"><label>ขาย</label><input type="number" step="0.01" id="ae-inc-sell" value="0" /></div>
          <div class="form-group"><label>ไถ่</label><input type="number" step="0.01" id="ae-inc-redeem" value="0" /></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>ดอก</label><input type="number" step="0.01" id="ae-inc-int" value="0" /></div>
          <div class="form-group"><label>รายรับอื่นๆ (เช่น เงินเข้า)</label><input type="number" step="0.01" id="ae-inc-other" value="0" /></div>
        </div>
      </div>

      <div class="info-banner" style="background:#fef2f2;border-color:#fecaca;padding:8px 12px;">
        <strong>ฝั่งรายจ่าย (บาท)</strong>
        <div class="form-row-3" style="margin-top:6px;">
          <div class="form-group"><label>ทองเก่า (กรัม)</label><input type="number" step="0.01" id="ae-old-g" value="0" /></div>
          <div class="form-group"><label>รับซื้อ</label><input type="number" step="0.01" id="ae-exp-buy" value="0" /></div>
          <div class="form-group"><label>จำ</label><input type="number" step="0.01" id="ae-exp-pawn" value="0" /></div>
        </div>
        <div class="form-row-3">
          <div class="form-group"><label>รายจ่ายอื่นๆ</label><input type="number" step="0.01" id="ae-exp-other" value="0" /></div>
          <div class="form-group"><label>โอน</label><input type="number" step="0.01" id="ae-exp-transfer" value="0" /></div>
          <div class="form-group"><label>บ้าน</label><input type="number" step="0.01" id="ae-exp-home" value="0" /></div>
        </div>
      </div>

      <div class="form-row-3">
        <div class="form-group">
          <label>เชื่อมสต๊อกอัตโนมัติ (ถ้าขาย/รับซื้อ)</label>
          <select id="ae-stock-move">
            <option value="">ไม่ปรับสต๊อก</option>
            <option value="out">ตัดสต๊อก "ขาย"</option>
            <option value="in">เพิ่มสต๊อก "รับใหม่ / ทองเก่า"</option>
          </select>
        </div>
        <div class="form-group">
          <label>ช่องสต๊อก</label>
          <select id="ae-stock-col"><option value="">-- เลือก --</option>${stockColsOptions}</select>
        </div>
        <div class="form-group">
          <label>จำนวนชิ้น / กรัม</label>
          <input type="number" step="0.01" id="ae-stock-qty" value="0" />
        </div>
      </div>

      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:12px;">
        <button type="button" class="btn btn-outline" onclick="closeModal()">ยกเลิก</button>
        <button type="submit" class="btn btn-emerald">บันทึกรายการบัญชี</button>
      </div>
    </form>
  `
  );
}

async function submitAccountEntry(e) {
  e.preventDefault();
  try {
    const payload = {
      date_iso: document.getElementById('ae-date').value,
      description: document.getElementById('ae-desc').value.trim(),
      new_gold_g: Number(document.getElementById('ae-new-g').value || 0),
      inc_sell: Number(document.getElementById('ae-inc-sell').value || 0),
      inc_redeem: Number(document.getElementById('ae-inc-redeem').value || 0),
      inc_interest: Number(document.getElementById('ae-inc-int').value || 0),
      inc_other: Number(document.getElementById('ae-inc-other').value || 0),
      old_gold_g: Number(document.getElementById('ae-old-g').value || 0),
      exp_buy: Number(document.getElementById('ae-exp-buy').value || 0),
      exp_pawn: Number(document.getElementById('ae-exp-pawn').value || 0),
      exp_other: Number(document.getElementById('ae-exp-other').value || 0),
      exp_transfer: Number(document.getElementById('ae-exp-transfer').value || 0),
      exp_home: Number(document.getElementById('ae-exp-home').value || 0),
      stock_move_type: document.getElementById('ae-stock-move').value,
      stock_col: document.getElementById('ae-stock-col').value,
      stock_qty: Number(document.getElementById('ae-stock-qty').value || 0),
    };
    await api('/api/account/entry', { method: 'POST', body: JSON.stringify(payload) });
    closeModal();
    toast('บันทึกรายการบัญชีเรียบร้อย');
    if (state.activeTab === 'account') loadAccountView();
    else if (state.activeTab === 'dashboard') loadDashboard();
  } catch (err) {
    toast(err.message, 'error');
  }
}

/* ==================== STOCK MODAL ==================== */
async function openStockModal(preselectCol = 'O') {
  if (!state.stockCache) {
    state.stockCache = await api('/api/stock');
  }
  const dateVal = document.getElementById('stock-date-picker')?.value || getTodayIso();
  const options = state.stockCache.columns
    .map(
      (c) =>
        `<option value="${c.col}" ${c.col === preselectCol ? 'selected' : ''}>${esc(c.group)} — ${esc(c.item)} (${c.col}) [เหลือ ${c.qty}]</option>`
    )
    .join('');

  openModal(
    'บันทึกความเคลื่อนไหวสต๊อกทอง',
    `
    <form onsubmit="submitStockModal(event)">
      <div class="form-row">
        <div class="form-group"><label>วันที่</label><input type="date" id="sm-date" value="${dateVal}" required /></div>
        <div class="form-group">
          <label>ประเภทความเคลื่อนไหว</label>
          <select id="sm-type">
            <option value="out">ขาย (-)</option>
            <option value="in">รับใหม่ / รับซื้อทองเก่า (+)</option>
            <option value="damaged">ชำรุด (-)</option>
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>ช่องรายการทอง (คอลัมน์ C–AX)</label>
          <select id="sm-col">${options}</select>
        </div>
        <div class="form-group">
          <label>จำนวน (ชิ้น หรือ กรัมสำหรับทองเก่า)</label>
          <input type="number" step="0.01" id="sm-qty" value="1" required />
        </div>
      </div>
      <label class="checkbox-line">
        <input type="checkbox" id="sm-acc" onchange="document.getElementById('sm-acc-box').style.display=this.checked?'block':'none'" />
        ลงบัญชีรายรับ-รายจ่าย (ขาย / รับซื้อ) ไปพร้อมกันเลย
      </label>
      <div id="sm-acc-box" style="display:none;" class="info-banner">
        <div class="form-row-3">
          <div class="form-group"><label>รายละเอียดในบัญชี</label><input type="text" id="sm-acc-desc" placeholder="เช่น คอ 1 สลึง" /></div>
          <div class="form-group"><label>จำนวนเงิน (บาท)</label><input type="number" step="0.01" id="sm-acc-amt" value="0" /></div>
          <div class="form-group"><label>โอน (ถ้ามี)</label><input type="number" step="0.01" id="sm-acc-transfer" value="0" /></div>
        </div>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:12px;">
        <button type="button" class="btn btn-outline" onclick="closeModal()">ยกเลิก</button>
        <button type="submit" class="btn btn-gold">บันทึกสต๊อก</button>
      </div>
    </form>
  `
  );
}

async function submitStockModal(e) {
  e.preventDefault();
  try {
    const col = document.getElementById('sm-col').value;
    const qty = Number(document.getElementById('sm-qty').value || 0);
    const payload = {
      date_iso: document.getElementById('sm-date').value,
      move_type: document.getElementById('sm-type').value,
      mode: 'add',
      updates: { [col]: qty },
      record_account: document.getElementById('sm-acc').checked,
      account_desc: document.getElementById('sm-acc-desc').value,
      account_amount: Number(document.getElementById('sm-acc-amt').value || 0),
      transfer_amount: Number(document.getElementById('sm-acc-transfer').value || 0),
    };
    await api('/api/stock/movement', { method: 'POST', body: JSON.stringify(payload) });
    closeModal();
    toast('บันทึกความเคลื่อนไหวสต๊อกเรียบร้อย');
    if (state.activeTab === 'stock') loadStockView();
    else if (state.activeTab === 'dashboard') loadDashboard();
  } catch (err) {
    toast(err.message, 'error');
  }
}

window.addEventListener('beforeprint', renderVatPrintPages);

window.addEventListener('DOMContentLoaded', () => {
  initDateInputs();
  loadDashboard();
});
