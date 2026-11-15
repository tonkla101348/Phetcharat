/**
 * Phetcharat Gold Shop — Google Apps Script Real-Time Sync Bridge
 *
 * วิธีติดตั้ง (ใช้เวลา ~2 นาที ทำครั้งเดียว):
 * 1. เปิด Google Sheet ใดก็ได้ใน 3 ไฟล์นี้ (แนะนำเปิดไฟล์ จำนำทอง เริ่ม 4818)
 * 2. เมนู ส่วนขยาย (Extensions) -> Apps Script
 * 3. วางโค้ดนี้ทั้งหมดแทนที่ไฟล์ Code.gs แล้วกดบันทึก (Ctrl+S)
 * 4. กดปุ่ม ทำให้ใช้งานได้ (Deploy) -> การทำให้ใช้งานได้รายการใหม่ (New deployment)
 * 5. เลือกประเภท: เว็บแอป (Web app)
 *    - ดำเนินการในชื่อ (Execute as): ฉัน (Me)
 *    - ผู้ที่มีสิทธิ์เข้าถึง (Who has access): ทุกคน (Anyone)
 * 6. กด Deploy และอนุญาตสิทธิ์เข้าถึง Google Sheets
 * 7. คัดลอก Web app URL ไปวางในหน้า "เชื่อมต่อ Google Sheets" ของโปรแกรม Phetcharat
 */

var SHEET_IDS = {
  pawn: '1_ReGE-qfsq8WYvUoFvLlssuiAVBjiTwrMAuOsdyJjbw',
  account: '1-D5KyzBWZ6a9mt6Ns1iwuUuYgaTidihKPmBw-BMJb8Y',
  stock: '1-sm5_U2B7lUdARPFQJmK_-CjtwZnI3cVZpEIsQnK3I8',
};

// Optional: ตั้งค่ารหัสลับให้ตรงกับในโปรแกรม (เว้นว่างไว้ได้ถ้าใช้งานในร้านเอง)
var SYNC_SECRET = '';

function doGet() {
  return jsonOut({
    ok: true,
    service: 'Phetcharat Gold Shop Real-Time Sync Bridge',
    timestamp: new Date().toISOString(),
  });
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    var body = JSON.parse(e.postData.contents || '{}');
    if (SYNC_SECRET && body.secret !== SYNC_SECRET) {
      return jsonOut({ ok: false, error: 'Invalid secret' });
    }
    var target = body.targetSheet;
    var action = body.action;
    var payload = body.payload || {};
    var result = null;

    if (target === 'pawn') {
      result = handlePawnSync(action, payload);
    } else if (target === 'account') {
      result = handleAccountSync(action, payload);
    } else if (target === 'stock') {
      result = handleStockSync(action, payload);
    } else if (target === 'export') {
      result = handleExportSync(action, payload);
    } else {
      return jsonOut({ ok: false, error: 'Unknown targetSheet: ' + target });
    }

    return jsonOut({ ok: true, result: result });
  } catch (err) {
    return jsonOut({ ok: false, error: err && err.message ? err.message : String(err) });
  } finally {
    lock.releaseLock();
  }
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function toThaiDateShort(isoDate) {
  if (!isoDate) return '';
  var m = String(isoDate).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return String(isoDate);
  var beShort = String((Number(m[1]) + 543) % 100);
  if (beShort.length < 2) beShort = '0' + beShort;
  return Number(m[3]) + '/' + Number(m[2]) + '/' + beShort;
}

function toSheetDateObj(isoDate) {
  if (!isoDate) return '';
  var m = String(isoDate).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return String(isoDate);
  // Write real Date object matching the spreadsheet's date handling
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function normalizeCellDateToIso(val) {
  if (!val) return '';
  if (Object.prototype.toString.call(val) === '[object Date]' && !isNaN(val.getTime())) {
    var y = val.getFullYear();
    if (y >= 1968 && y <= 1975) y = 1957 + (y - 1900);
    var m = ('0' + (val.getMonth() + 1)).slice(-2);
    var d = ('0' + val.getDate()).slice(-2);
    return y + '-' + m + '-' + d;
  }
  var s = String(val).replace(/\*/g, '').trim();
  var dm = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (dm) {
    var yr = Number(dm[3]);
    if (yr < 100) yr = yr >= 50 ? 2500 + yr - 543 : 2000 + yr;
    else if (yr > 2400) yr -= 543;
    else if (yr >= 1968 && yr <= 1975) yr = 1957 + (yr - 1900);
    return yr + '-' + ('0' + Number(dm[2])).slice(-2) + '-' + ('0' + Number(dm[1])).slice(-2);
  }
  return '';
}

/* ==================== 1. PAWN SHEET SYNC ==================== */
function handlePawnSync(action, p) {
  var ss = SpreadsheetApp.openById(SHEET_IDS.pawn);
  var sheetName = p.sheet_name || (Number(p.ticket_no) >= 6001 ? 'เริ่ม 6001' : 'เริ่ม 4844');
  var sheet = ss.getSheetByName(sheetName) || ss.getSheetByName('เริ่ม 6001');

  var ticketNoStr = String(p.ticket_no || '').trim();
  var targetRow = p.sheet_row ? Number(p.sheet_row) : 0;

  var lastRow = sheet.getLastRow();
  var aValues = lastRow >= 2 ? sheet.getRange(2, 1, lastRow - 1, 1).getValues() : [];

  if (targetRow >= 2 && targetRow <= lastRow) {
    var checkVal = String(sheet.getRange(targetRow, 1).getValue() || '').trim();
    if (checkVal !== ticketNoStr) {
      targetRow = 0;
    }
  }

  if (!targetRow) {
    for (var i = aValues.length - 1; i >= 0; i--) {
      if (String(aValues[i][0] || '').trim() === ticketNoStr) {
        targetRow = i + 2;
        break;
      }
    }
  }

  if (action === 'deletePawnTicket') {
    if (targetRow >= 2 && targetRow <= lastRow) {
      sheet.getRange(targetRow, 1, 1, 18).clearContent();
    }
    return { deleted: true, sheetName: sheetName, row: targetRow, ticket_no: ticketNoStr };
  }

  if (!targetRow) {
    // Find first empty row in Col A after last non-empty ticket
    var lastDataRow = 1;
    for (var j = aValues.length - 1; j >= 0; j--) {
      if (String(aValues[j][0] || '').trim() !== '') {
        lastDataRow = j + 2;
        break;
      }
    }
    targetRow = lastDataRow + 1;
  }

  sheet.getRange(targetRow, 1).setValue(Number(ticketNoStr) || ticketNoStr); // A: เลขที่จำนำ
  sheet.getRange(targetRow, 2).setValue(p.customer_name || ''); // B: ชื่อ-สกุล
  sheet.getRange(targetRow, 3).setValue(p.item_desc || ''); // C: รายการ
  sheet.getRange(targetRow, 4).setValue(p.item_qty || ''); // D: จำนวน
  sheet.getRange(targetRow, 5).setValue(p.note || ''); // E: หมายเหตุ
  sheet.getRange(targetRow, 6).setValue(Number(p.weight_g) || ''); // F: น้ำหนักรวม
  sheet.getRange(targetRow, 7).setValue(Number(p.principal) || 0); // G: ยอดเงิน
  sheet.getRange(targetRow, 8).setFormula('=G' + targetRow + '*2%'); // H: ดอกเบี้ย 2%
  sheet.getRange(targetRow, 9).setValue(p.term_raw || p.term_months || 3); // I: กำหนดตัดดอก
  if (p.pawn_date) {
    sheet.getRange(targetRow, 10).setValue(toThaiDateShort(p.pawn_date)); // J: วันที่จำ
  }
  sheet.getRange(targetRow, 11).setValue(p.status || ''); // K: สถานะ
  sheet.getRange(targetRow, 12).setValue(p.redeem_date ? toSheetDateObj(p.redeem_date) : ''); // L: วันที่ไถ่

  var paidDates = Array.isArray(p.paid_dates) ? p.paid_dates : [];
  for (var k = 0; k < Math.max(paidDates.length, 6); k++) {
    var colIdx = 13 + k; // M is col 13
    if (k < paidDates.length && paidDates[k]) {
      sheet.getRange(targetRow, colIdx).setValue(toSheetDateObj(paidDates[k]));
    } else if (colIdx <= 17) {
      sheet.getRange(targetRow, colIdx).clearContent();
    }
  }

  return { sheetName: sheetName, row: targetRow, ticket_no: ticketNoStr };
}

/* ==================== 2. ACCOUNT SHEET SYNC ==================== */
function handleAccountSync(action, p) {
  var ss = SpreadsheetApp.openById(SHEET_IDS.account);
  var monthKey = p.month_key;
  var sheet = ss.getSheetByName(monthKey);
  if (!sheet) {
    var tpl = ss.getSheetByName('Template') || ss.getSheets()[ss.getSheets().length - 1];
    sheet = tpl.copyTo(ss).setName(monthKey);
  }

  var dateIso = p.date_iso;
  var summaryRow = findAccountDaySummaryRow(sheet, dateIso);

  if (!summaryRow) {
    summaryRow = createNewAccountDayBlock(sheet, dateIso);
  }

  if (action === 'updateDailyCash') {
    if (p.actual_cash === null || p.actual_cash === undefined || p.actual_cash === '') {
      sheet.getRange(summaryRow, 15).clearContent(); // Col O
    } else {
      sheet.getRange(summaryRow, 15).setValue(Number(p.actual_cash));
    }
    return { monthKey: monthKey, summaryRow: summaryRow, dateIso: dateIso };
  }

  if (action === 'deleteAccountEntry') {
    var delRow = p.sheet_row ? Number(p.sheet_row) : 0;
    var descStr = String(p.description || p.linked_ticket_no || '').trim();
    if (delRow >= 4 && delRow <= sheet.getLastRow()) {
      var curDesc = String(sheet.getRange(delRow, 2).getValue() || '').trim();
      if (descStr && curDesc !== descStr) delRow = 0;
    }
    if (!delRow && summaryRow && descStr) {
      var blkStart = findDayBlockStartRow(sheet, summaryRow);
      var bCol = sheet.getRange(blkStart, 2, summaryRow - blkStart, 1).getValues();
      for (var dIdx = bCol.length - 1; dIdx >= 0; dIdx--) {
        if (String(bCol[dIdx][0] || '').trim() === descStr) {
          delRow = blkStart + dIdx;
          break;
        }
      }
    }
    if (delRow >= 4) {
      sheet.getRange(delRow, 2, 1, 12).clearContent();
    }
    return { deleted: true, monthKey: monthKey, deletedRow: delRow };
  }

  if (action === 'addAccountEntry') {
    // Find first empty row inside the day block before summaryRow, or insert row above summaryRow
    var blockStart = findDayBlockStartRow(sheet, summaryRow);
    var insertRow = -1;
    var bRange = sheet.getRange(blockStart, 2, summaryRow - blockStart, 13).getValues();
    for (var i = 0; i < bRange.length; i++) {
      var hasContent = bRange[i].some(function (cell) {
        return cell !== '' && cell !== null && cell !== 0;
      });
      if (!hasContent) {
        insertRow = blockStart + i;
        break;
      }
    }
    if (insertRow === -1) {
      sheet.insertRowBefore(summaryRow);
      insertRow = summaryRow;
      summaryRow += 1;
    }

    sheet.getRange(insertRow, 2).setValue(p.description || '');
    if (p.new_gold_g) sheet.getRange(insertRow, 3).setValue(Number(p.new_gold_g));
    if (p.inc_sell) sheet.getRange(insertRow, 4).setValue(Number(p.inc_sell));
    if (p.inc_redeem) sheet.getRange(insertRow, 5).setValue(Number(p.inc_redeem));
    if (p.inc_interest) sheet.getRange(insertRow, 6).setValue(Number(p.inc_interest));
    if (p.inc_other) sheet.getRange(insertRow, 7).setValue(Number(p.inc_other));
    if (p.old_gold_g) sheet.getRange(insertRow, 8).setValue(Number(p.old_gold_g));
    if (p.exp_buy) sheet.getRange(insertRow, 9).setValue(Number(p.exp_buy));
    if (p.exp_pawn) sheet.getRange(insertRow, 10).setValue(Number(p.exp_pawn));
    if (p.exp_other) sheet.getRange(insertRow, 11).setValue(Number(p.exp_other));
    if (p.exp_transfer) sheet.getRange(insertRow, 12).setValue(Number(p.exp_transfer));
    if (p.exp_home) sheet.getRange(insertRow, 13).setValue(Number(p.exp_home));

    return { monthKey: monthKey, insertedRow: insertRow, summaryRow: summaryRow };
  }

  return { monthKey: monthKey, dateIso: dateIso };
}

function findAccountDaySummaryRow(sheet, targetDateIso) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 4) return 0;
  var ab = sheet.getRange(4, 1, lastRow - 3, 2).getValues();
  var currentDateIso = '';
  for (var i = 0; i < ab.length; i++) {
    var aVal = ab[i][0];
    var bVal = String(ab[i][1] || '').trim();
    if (aVal !== '' && aVal !== null) {
      var norm = normalizeCellDateToIso(aVal);
      if (norm) currentDateIso = norm;
    }
    if (bVal === 'สรุปวัน') {
      if (currentDateIso === targetDateIso) {
        return i + 4;
      }
      currentDateIso = '';
    }
  }
  return 0;
}

function findDayBlockStartRow(sheet, summaryRow) {
  var bVals = sheet.getRange(1, 2, summaryRow - 1, 1).getValues();
  for (var r = summaryRow - 1; r >= 4; r--) {
    if (String(bVals[r - 1][0] || '').trim() === 'สะสม') {
      return r + 1;
    }
  }
  return 4;
}

function createNewAccountDayBlock(sheet, dateIso) {
  var lastRow = sheet.getLastRow();
  var bVals = lastRow >= 4 ? sheet.getRange(1, 2, lastRow, 1).getValues() : [];
  var prevAccRow = 3;
  var prevSummaryRow = 3;
  var lastUsedSummaryRow = 3;

  // Find last active day block, or an empty pre-allocated block without date
  for (var r = 4; r <= lastRow; r++) {
    var b = String(bVals[r - 1][0] || '').trim();
    if (b === 'สรุปวัน') {
      var aCell = sheet.getRange(findDayBlockStartRow(sheet, r), 1).getValue();
      var hasEntries = Number(sheet.getRange(r, 4).getValue() || 0) !== 0 || sheet.getRange(r, 15).getValue() !== '';
      if (!aCell && !hasEntries) {
        var blockStart = findDayBlockStartRow(sheet, r);
        sheet.getRange(blockStart, 1).setValue(toSheetDateObj(dateIso));
        return r;
      }
      lastUsedSummaryRow = r;
    } else if (b === 'สะสม') {
      prevAccRow = r;
    }
  }

  var startRow = prevAccRow + 1;
  if (startRow < 4) startRow = 4;
  var endDataRow = startRow + 25;
  var sumRow = endDataRow + 1;
  var totalRow = sumRow + 1;
  var accRow = totalRow + 1;

  sheet.getRange(startRow, 1).setValue(toSheetDateObj(dateIso));
  sheet.getRange(sumRow, 2).setValue('สรุปวัน');
  sheet.getRange(totalRow, 2).setValue('รวม');
  sheet.getRange(accRow, 2).setValue('สะสม');

  var cols = ['D', 'E', 'F', 'G', 'I', 'J', 'K', 'L', 'M'];
  cols.forEach(function (col) {
    sheet.getRange(col + sumRow).setFormula('=SUM(' + col + startRow + ':' + col + endDataRow + ')');
    sheet.getRange(col + accRow).setFormula('=' + col + prevAccRow + '+' + col + sumRow);
  });
  sheet.getRange('C' + totalRow).setFormula('=SUM(C' + startRow + ':C' + endDataRow + ')');
  sheet.getRange('H' + totalRow).setFormula('=SUM(H' + startRow + ':H' + endDataRow + ')');
  sheet.getRange('C' + accRow).setFormula('=C' + prevAccRow + '+C' + totalRow);
  sheet.getRange('H' + accRow).setFormula('=H' + prevAccRow + '+H' + totalRow);
  sheet.getRange('D' + totalRow).setFormula('=SUM(D' + sumRow + ':G' + sumRow + ')');
  sheet.getRange('I' + totalRow).setFormula('=SUM(I' + sumRow + ':M' + sumRow + ')');

  var prevCashRef = lastUsedSummaryRow === 3 ? 'O3' : 'O' + lastUsedSummaryRow;
  sheet.getRange('N' + sumRow).setFormula('=' + prevCashRef + '+SUM(D' + sumRow + ':G' + sumRow + ')-SUM(I' + sumRow + ':M' + sumRow + ')');
  sheet.getRange('N' + totalRow).setValue('ส่วนต่าง');
  sheet.getRange('O' + totalRow).setFormula('=O' + sumRow + '-N' + sumRow);
  sheet.getRange('P' + accRow).setFormula('=P' + prevAccRow + '-E' + sumRow + '+J' + sumRow);

  return sumRow;
}

/* ==================== 3. STOCK SHEET SYNC ==================== */
function colLetterToIndex(col) {
  var idx = 0;
  for (var i = 0; i < col.length; i++) {
    idx = idx * 26 + (col.charCodeAt(i) - 64);
  }
  return idx;
}

function handleStockSync(action, p) {
  var ss = SpreadsheetApp.openById(SHEET_IDS.stock);
  var sheet = ss.getSheetByName('ชีต2') || ss.getSheets()[0];
  var dateIso = p.date_iso;
  var moveType = p.move_type || 'in';
  var updates = p.updates || {};
  var mode = p.mode || 'set';

  var lastRow = sheet.getLastRow();
  var aVals = lastRow >= 4 ? sheet.getRange(4, 1, lastRow - 3, 2).getValues() : [];

  var baseRow = 0;
  var firstEmptyBlockRow = 0;

  for (var i = 0; i < aVals.length; i += 5) {
    var rNum = 4 + i;
    var aVal = aVals[i][0];
    var norm = normalizeCellDateToIso(aVal);
    if (norm === dateIso) {
      baseRow = rNum;
      break;
    }
    if (!aVal && !firstEmptyBlockRow) {
      firstEmptyBlockRow = rNum;
    }
  }

  if (!baseRow) {
    if (firstEmptyBlockRow) {
      baseRow = firstEmptyBlockRow;
      sheet.getRange(baseRow, 1).setValue(toSheetDateObj(dateIso));
    } else {
      baseRow = Math.max(4, lastRow + 1);
      sheet.getRange(baseRow, 1).setValue(toSheetDateObj(dateIso));
      sheet.getRange(baseRow, 2).setValue('รับใหม่');
      sheet.getRange(baseRow + 1, 2).setValue('ขาย');
      sheet.getRange(baseRow + 2, 2).setValue('ชำรุด');
      sheet.getRange(baseRow + 3, 2).setValue('คงเหลือ (ชิ้น)');
      sheet.getRange(baseRow + 4, 2).setValue('น้ำหนักรวม');
    }
  }

  var rowOffset = moveType === 'in' ? 0 : moveType === 'out' ? 1 : 2;
  var targetRow = baseRow + rowOffset;

  Object.keys(updates).forEach(function (colKey) {
    if (colKey === '__mode') return;
    var colIdx = colLetterToIndex(colKey);
    if (colIdx < 3 || colIdx > 50) return;
    var val = Number(updates[colKey]) || 0;
    var cell = sheet.getRange(targetRow, colIdx);
    if (mode === 'add') {
      var prev = Number(cell.getValue()) || 0;
      cell.setValue(prev + val);
    } else if (val === 0) {
      cell.clearContent();
    } else {
      cell.setValue(val);
    }
  });

  return { baseRow: baseRow, targetRow: targetRow, dateIso: dateIso, moveType: moveType };
}

/* ==================== 4. XLSX EXPORT BRIDGE ==================== */
function handleExportSync(action, p) {
  var sheetId = p.sheetId || SHEET_IDS[p.key] || '';
  if (!sheetId) throw new Error('Missing sheetId');
  var url = 'https://docs.google.com/spreadsheets/d/' + encodeURIComponent(sheetId) + '/export?format=xlsx';
  var resp = UrlFetchApp.fetch(url, {
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true,
  });
  if (resp.getResponseCode() !== 200) {
    throw new Error('Export HTTP ' + resp.getResponseCode());
  }
  return { base64: Utilities.base64Encode(resp.getContent()) };
}
