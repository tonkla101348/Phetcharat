const fs = require('fs');
const zlib = require('zlib');

/**
 * Zero-dependency ZIP reader for .xlsx files using Node's built-in zlib.
 */
function readZip(filePath) {
  const buf = fs.readFileSync(filePath);
  const entries = {};
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) {
    eocd--;
  }
  if (eocd < 0) {
    throw new Error(`Invalid ZIP/XLSX file: ${filePath}`);
  }
  const cdCount = buf.readUInt16LE(eocd + 10);
  let ptr = buf.readUInt32LE(eocd + 16);

  for (let i = 0; i < cdCount; i++) {
    const method = buf.readUInt16LE(ptr + 10);
    const compSize = buf.readUInt32LE(ptr + 20);
    const nameLen = buf.readUInt16LE(ptr + 28);
    const extraLen = buf.readUInt16LE(ptr + 30);
    const commentLen = buf.readUInt16LE(ptr + 32);
    const localOffset = buf.readUInt32LE(ptr + 42);
    const name = buf.toString('utf8', ptr + 46, ptr + 46 + nameLen);
    const lNameLen = buf.readUInt16LE(localOffset + 26);
    const lExtraLen = buf.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + lNameLen + lExtraLen;
    const raw = buf.subarray(dataStart, dataStart + compSize);
    entries[name] = () => (method === 0 ? raw : zlib.inflateRawSync(raw));
    ptr += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

function decodeXml(str) {
  if (!str) return '';
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

/**
 * Parses an .xlsx file into [{ name, rows: [{ r, cells: { [col]: { v, f } } }] }].
 * Properly handles both self-closing <c .../> and <c ...>...</c> XML elements.
 */
function parseXlsx(filePath) {
  const z = readZip(filePath);
  const ss = [];
  if (z['xl/sharedStrings.xml']) {
    const ssXml = z['xl/sharedStrings.xml']().toString('utf8');
    const siMatches = ssXml.match(/<si\b[^>]*>[\s\S]*?<\/si>/g) || [];
    for (const si of siMatches) {
      const tMatches = [...si.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)];
      ss.push(decodeXml(tMatches.map((m) => m[1]).join('')));
    }
  }

  const wbXml = z['xl/workbook.xml']().toString('utf8');
  const relsXml = z['xl/_rels/workbook.xml.rels']().toString('utf8');
  const rels = {};
  for (const m of relsXml.matchAll(/<Relationship\s+[^>]*?Id="([^"]+)"[^>]*?Target="([^"]+)"/g)) {
    rels[m[1]] = m[2];
  }

  const sheets = [];
  for (const m of wbXml.matchAll(/<sheet\s+[^>]*?name="([^"]+)"[^>]*?r:id="([^"]+)"/g)) {
    const name = decodeXml(m[1]);
    const target = rels[m[2]].startsWith('xl/') ? rels[m[2]] : `xl/${rels[m[2]]}`;
    if (!z[target]) continue;
    const xml = z[target]().toString('utf8');
    const rows = [];

    for (const rm of xml.matchAll(/<row\s+[^>]*?r="(\d+)"[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g)) {
      const rNum = Number(rm[1]);
      const rowBody = rm[2] || '';
      if (!rowBody) continue;
      const cells = {};

      for (const cm of rowBody.matchAll(/<c\s+([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attrs = cm[1];
        const body = cm[2] || '';
        const rMatch = attrs.match(/r="([A-Z]+)\d+"/);
        if (!rMatch) continue;
        const col = rMatch[1];
        const tMatch = attrs.match(/t="([^"]+)"/);
        const t = tMatch ? tMatch[1] : '';
        const vMatch = body.match(/<v>([\s\S]*?)<\/v>/);
        const fMatch = body.match(/<f(?:\s[^>]*)?>([\s\S]*?)<\/f>/);
        let val = vMatch ? decodeXml(vMatch[1]) : null;

        if (t === 's' && val !== null) {
          val = ss[Number(val)] ?? '';
        } else if (t === 'inlineStr') {
          const isMatch = body.match(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/);
          val = isMatch ? decodeXml(isMatch[1]) : '';
        } else if (t === 'b' && val !== null) {
          val = val === '1';
        } else if (val !== null && t !== 'str' && t !== 'e' && !isNaN(Number(val)) && val.trim() !== '') {
          val = Number(val);
        }

        cells[col] = {
          v: val,
          f: fMatch ? decodeXml(fMatch[1]) : null,
        };
      }
      rows.push({ r: rNum, cells });
    }
    sheets.push({ name, rows });
  }
  return sheets;
}

/**
 * Normalizes spreadsheet dates:
 * - Excel serial numbers ~25000..26000 (1969, caused by entering d/m/69 for พ.ศ. 2569) -> 2026-MM-DD
 * - Excel serial numbers ~45000..50000 (2023..2036) -> YYYY-MM-DD
 * - Strings like "10/4/69", "16/4/2569", "26/9/2026", "2026-11-15" -> YYYY-MM-DD
 */
function normalizeSheetDate(val, fallbackYear = 2026) {
  if (val === null || val === undefined || val === '') return '';

  if (typeof val === 'number' && isFinite(val)) {
    if (val < 20000 || val > 70000) return '';
    const utcMs = Math.round((val - 25569) * 86400 * 1000);
    const d = new Date(utcMs);
    if (isNaN(d.getTime())) return '';
    let y = d.getUTCFullYear();
    const m = d.getUTCMonth() + 1;
    const day = d.getUTCDate();
    if (y >= 1968 && y <= 1975) {
      y = 1957 + (y - 1900); // 1969 (69 BE) -> 2026 CE
    }
    return `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  const s = String(val).replace(/\*/g, '').trim();
  if (!s) return '';

  // Already ISO YYYY-MM-DD
  const isoMatch = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    let y = Number(isoMatch[1]);
    if (y > 2400) y -= 543;
    return `${y}-${String(Number(isoMatch[2])).padStart(2, '0')}-${String(Number(isoMatch[3])).padStart(2, '0')}`;
  }

  // d/m/y or d-m-y
  const dmyMatch = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (dmyMatch) {
    const day = Number(dmyMatch[1]);
    const month = Number(dmyMatch[2]);
    let year = Number(dmyMatch[3]);
    if (year < 100) {
      // Thai 2-digit BE year like 69 -> 2569 -> 2026
      year = year >= 50 ? 2500 + year - 543 : 2000 + year;
    } else if (year > 2400) {
      year -= 543;
    } else if (year >= 1968 && year <= 1975) {
      year = 1957 + (year - 1900);
    }
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year || fallbackYear}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  // d/m without year (e.g. "22/4", "23/4")
  const dmMatch = s.match(/^(\d{1,2})[\/\-.](\d{1,2})$/);
  if (dmMatch) {
    const day = Number(dmMatch[1]);
    const month = Number(dmMatch[2]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${fallbackYear}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }
  return '';
}

const THAI_MONTHS_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

function formatThaiDateShort(isoDate) {
  if (!isoDate) return '';
  const m = String(isoDate).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return isoDate;
  const beShort = String((Number(m[1]) + 543) % 100).padStart(2, '0');
  return `${Number(m[3])}/${Number(m[2])}/${beShort}`;
}

function formatThaiDateLong(isoDate) {
  if (!isoDate) return '';
  const m = String(isoDate).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return isoDate;
  const beYear = Number(m[1]) + 543;
  return `${Number(m[3])} ${THAI_MONTHS_SHORT[Number(m[2]) - 1]} ${beYear}`;
}

function getTodayIsoBangkok() {
  const now = new Date();
  const bkk = new Date(now.getTime() + 7 * 3600 * 1000);
  return bkk.toISOString().slice(0, 10);
}

module.exports = {
  parseXlsx,
  normalizeSheetDate,
  formatThaiDateShort,
  formatThaiDateLong,
  getTodayIsoBangkok,
  THAI_MONTHS_SHORT,
};
