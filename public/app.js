const state = {
  activeTab: 'dashboard',
  pawnStatus: 'all',
  pawnPage: 0,
  pawnLimit: 100,
  pawnTicketsMap: {},
  accountActiveMonth: '',
  accountShowAllDays: false,
  accountCache: null,
  stockCache: null,
  syncCache: null,
};

const THAI_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

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
async function loadDashboard() {
  try {
    const d = await api('/api/dashboard');
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

    // Annual overview table (ภาพรวม 2569)
    const ann = d.annualOverview;
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
        <tbody>${annRows}</tbody>
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

async function loadAccountView() {
  try {
    const q = state.accountActiveMonth ? `?month=${encodeURIComponent(state.accountActiveMonth)}` : '';
    const data = await api(`/api/account${q}`);
    state.accountCache = data;
    if (!state.accountActiveMonth && data.activeMonth) {
      state.accountActiveMonth = data.activeMonth.month.month_key;
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
      document.getElementById('account-days-container').innerHTML = '<p class="muted">ยังไม่มีข้อมูลเดือนนี้</p>';
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

/* ==================== STOCK (Stock ทอง) ==================== */
async function loadStockView() {
  try {
    const picker = document.getElementById('stock-date-picker');
    if (!picker.value) picker.value = getTodayIso();
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
  document.getElementById('stock-date-picker').value = dateIso;
  loadStockView();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ==================== GOOGLE SHEETS SYNC VIEW ==================== */
async function loadSyncView() {
  try {
    const d = await api('/api/sync/status');
    state.syncCache = d;
    document.getElementById('sync-apps-script-url').value = d.config.apps_script_url || '';
    document.getElementById('sync-apps-script-secret').value = d.config.apps_script_secret || '';
    document.getElementById('sync-auto-enabled').value = d.config.auto_sync_enabled || '1';
    document.getElementById('sync-code-gs').value = d.codeGs || '';

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
    await api('/api/sync/config', {
      method: 'POST',
      body: JSON.stringify({
        apps_script_url: document.getElementById('sync-apps-script-url').value.trim(),
        apps_script_secret: document.getElementById('sync-apps-script-secret').value.trim(),
        auto_sync_enabled: document.getElementById('sync-auto-enabled').value,
      }),
    });
    toast('บันทึกการตั้งค่า Google Sheets แล้ว');
    loadSyncView();
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
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = html;
  document.getElementById('modal-backdrop').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('modal-backdrop').classList.add('hidden');
}

function closeModalIfBackdrop(e) {
  if (e.target.id === 'modal-backdrop') closeModal();
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
      <div class="form-group">
        <label>รายการทอง *</label>
        <input type="text" id="np-item" placeholder="เช่น คอ, ข้อมือ, แหวน, กรอบพระเลี่ยมทอง" required />
        <div class="chip-row">
          ${['คอ', 'ข้อมือ', 'แหวน', 'จี้ทอง', 'ต่างหู', 'กรอบพระเลี่ยมทอง', 'ทองแท่ง']
            .map((it) => `<button type="button" class="quick-chip" onclick="appendChip('np-item','${it}')">+ ${it}</button>`)
            .join('')}
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
          <label>จำนวนชิ้น / หมายเหตุ</label>
          <input type="text" id="np-note" placeholder="เช่น 2 เส้น / ชำรุด" />
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
      <div class="form-group"><label>หมายเหตุ</label><input type="text" id="pa-note" value="${esc(t.note)}" /></div>
    `;
  }
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

window.addEventListener('DOMContentLoaded', () => {
  loadDashboard();
});
