const dbMod = require('./db');

const BASE_URL = 'https://xn--42cah7d0cxcvbbb9x.com';
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

/**
 * Parse daily gold announcement tables from ราคาทองคำวันนี้.com HTML and keep
 * the closing (latest sequence) announcement per calendar date.
 * Note: The second historical table omits closing </tr> and </td> tags, so we
 * split on opening tags rather than matching <tr...>...</tr> pairs.
 */
function parseGoldHistoryHtml(html) {
  const byDate = new Map();
  const trParts = String(html || '').split(/<tr\b[^>]*>/i);

  const parseNum = (s) => {
    const n = Number(String(s || '').replace(/,/g, '').trim());
    return Number.isFinite(n) ? n : 0;
  };

  for (let i = 1; i < trParts.length; i++) {
    let chunk = trParts[i];
    const endIdx = chunk.search(/<\/tr>|<\/table>/i);
    if (endIdx >= 0) chunk = chunk.slice(0, endIdx);

    const tdParts = chunk
      .split(/<t[dh]\b[^>]*>/i)
      .slice(1)
      .map((cell) =>
        cell
          .replace(/<\/t[dh]>[\s\S]*/i, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/&nbsp;/gi, ' ')
          .replace(/\s+/g, ' ')
          .trim()
      );

    if (tdParts.length < 6) continue;

    const mDate = tdParts[0].match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}:\d{2}))?/);
    if (!mDate) continue;

    const dd = mDate[1].padStart(2, '0');
    const mm = mDate[2].padStart(2, '0');
    const yrRaw = Number(mDate[3]);
    const yyyy = yrRaw > 2400 ? yrRaw - 543 : yrRaw;
    const dateIso = `${yyyy}-${mm}-${dd}`;
    const timeStr = mDate[4] || '';
    const seq = Number(String(tdParts[1]).replace(/[^\d]/g, '')) || 0;

    const barBuy = parseNum(tdParts[2]);
    if (barBuy <= 0) continue;

    const rec = {
      date_iso: dateIso,
      bar_buy: barBuy,
      bar_sell: parseNum(tdParts[3]),
      orn_tax_base: parseNum(tdParts[4]),
      orn_sell: parseNum(tdParts[5]),
      seq,
      time_str: timeStr,
      source: 'ราคาทองคำวันนี้.com',
    };

    const existing = byDate.get(dateIso);
    if (!existing || rec.seq > existing.seq || (rec.seq === existing.seq && rec.time_str > existing.time_str)) {
      byDate.set(dateIso, rec);
    }
  }

  return [...byDate.values()].sort((a, b) => a.date_iso.localeCompare(b.date_iso));
}

async function fetchPagePrices(url) {
  const resp = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) PetcharatGoldShop/1.0',
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!resp.ok) {
    return { ok: false, status: resp.status, rows: [] };
  }
  const html = await resp.text();
  return { ok: true, status: resp.status, rows: parseGoldHistoryHtml(html) };
}

function buildArchiveMonthUrl(yearBe, monthNum) {
  const thaiMonth = THAI_MONTHS_FULL[monthNum - 1];
  return `${BASE_URL}/${encodeURI(`ราคาทองย้อนหลัง-เดือน-${thaiMonth}-${yearBe}`)}/`;
}

async function fetchAndCacheMonthGoldPrices({ monthKey = '', yearBe = 0, monthNum = 0, forceRefresh = false } = {}) {
  dbMod.initSchema();

  const todayIso = dbMod.getTodayIsoBangkok();
  const [nowYearCe, nowMonth] = todayIso.split('-').map(Number);

  let targetYearBe = Number(yearBe) || 0;
  let targetMonthNum = Number(monthNum) || 0;

  if (monthKey) {
    const order = dbMod.getMonthOrderForKey(monthKey);
    if (order && order < 999999) {
      targetYearBe = dbMod.getBeYearForMonthOrder(order);
      targetMonthNum = order % 100;
    }
  }

  if (!targetYearBe) targetYearBe = nowYearCe + 543;
  if (!targetMonthNum || targetMonthNum < 1 || targetMonthNum > 12) targetMonthNum = nowMonth;

  const targetYearCe = targetYearBe - 543;
  const targetYm = `${targetYearCe}-${String(targetMonthNum).padStart(2, '0')}`;
  const monthDiff = (nowYearCe * 12 + nowMonth) - (targetYearCe * 12 + targetMonthNum);

  let cached = dbMod.getGoldDailyPricesForMonth(targetYearCe, targetMonthNum);
  if (!forceRefresh && monthDiff >= 1 && cached.daysCount >= 15) {
    return {
      monthKey,
      yearBe: targetYearBe,
      yearCe: targetYearCe,
      monthNum: targetMonthNum,
      source: `${BASE_URL}/`,
      fromCache: true,
      warning: '',
      fetchedCount: 0,
      prices: cached.prices,
      prevFallback: cached.prevFallback,
      daysCount: cached.daysCount,
    };
  }

  const recentUrl = `${BASE_URL}/${encodeURI('ราคาทองย้อนหลัง')}/`;
  const archiveUrl = buildArchiveMonthUrl(targetYearBe, targetMonthNum);
  const candidateUrls = monthDiff <= 2 ? [recentUrl, archiveUrl] : [archiveUrl, recentUrl];

  let fetchedCount = 0;
  let networkError = null;
  let hasTargetMonthRows = false;

  for (const url of candidateUrls) {
    try {
      const page = await fetchPagePrices(url);
      if (page.ok && page.rows.length > 0) {
        fetchedCount += dbMod.upsertGoldDailyPrices(page.rows);
        if (page.rows.some((r) => r.date_iso.startsWith(targetYm))) {
          hasTargetMonthRows = true;
          break;
        }
      }
    } catch (err) {
      networkError = err;
    }
  }

  cached = dbMod.getGoldDailyPricesForMonth(targetYearCe, targetMonthNum);

  // Best-effort: fetch prior month if needed so day-1 holidays/Sundays have a fallback closing price
  if (!cached.prevFallback && !cached.prices[`${targetYm}-01`]) {
    const prevMonthNum = targetMonthNum === 1 ? 12 : targetMonthNum - 1;
    const prevYearBe = targetMonthNum === 1 ? targetYearBe - 1 : targetYearBe;
    try {
      const prevPage = await fetchPagePrices(buildArchiveMonthUrl(prevYearBe, prevMonthNum));
      if (prevPage.ok && prevPage.rows.length > 0) {
        fetchedCount += dbMod.upsertGoldDailyPrices(prevPage.rows);
        cached = dbMod.getGoldDailyPricesForMonth(targetYearCe, targetMonthNum);
      }
    } catch {
      // Ignore fallback fetch errors
    }
  }

  let warning = '';
  let fromCache = false;
  if (!hasTargetMonthRows && fetchedCount === 0) {
    if (cached.daysCount > 0) {
      fromCache = true;
      warning = networkError
        ? 'ไม่สามารถเชื่อมต่อ ราคาทองคำวันนี้.com ได้ ใช้ราคาที่แคชไว้แทน'
        : 'ไม่พบข้อมูลเดือนนี้เพิ่มเติมบนเว็บ ใช้ราคาที่แคชไว้แทน';
    } else if (networkError) {
      throw new Error(`ไม่สามารถดึงราคาทองจาก ราคาทองคำวันนี้.com (${networkError.message || 'เชื่อมต่อไม่สำเร็จ'})`);
    }
  }

  return {
    monthKey,
    yearBe: targetYearBe,
    yearCe: targetYearCe,
    monthNum: targetMonthNum,
    source: `${BASE_URL}/`,
    fromCache,
    warning,
    fetchedCount,
    prices: cached.prices,
    prevFallback: cached.prevFallback,
    daysCount: cached.daysCount,
  };
}

module.exports = {
  parseGoldHistoryHtml,
  fetchAndCacheMonthGoldPrices,
};
