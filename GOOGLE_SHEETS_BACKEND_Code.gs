/**
 * Placement LMS - Google Sheets backend starter
 * Deploy as Web app only after reviewing access/security requirements.
 * Do not store student passwords in this spreadsheet.
 */
const SHEET_NAMES = {
  students: 'Students',
  companies: 'Companies',
  results: 'Test Results',
  attempts: 'Test Attempts'
};

function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || 'health';
  let payload;
  try {
    if (action === 'health') payload = { ok: true, message: 'Placement LMS API is running' };
    else if (action === 'list') payload = listRows_(e.parameter.sheet);
    else throw new Error('Unknown action');
  } catch (err) {
    payload = { ok: false, error: String(err.message || err) };
  }
  const callback = e && e.parameter && e.parameter.callback;
  const body = callback ? `${callback}(${JSON.stringify(payload)});` : JSON.stringify(payload);
  return ContentService.createTextOutput(body).setMimeType(callback ? ContentService.MimeType.JAVASCRIPT : ContentService.MimeType.JSON);
}

function doPost(e) {
  let payload;
  try {
    const input = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const sheetKey = input.sheet;
    const row = input.row;
    if (!SHEET_NAMES[sheetKey]) throw new Error('Invalid sheet key');
    if (!row || typeof row !== 'object') throw new Error('Missing row data');
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES[sheetKey]);
    if (!sheet) throw new Error('Sheet tab not found: ' + SHEET_NAMES[sheetKey]);
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    sheet.appendRow(headers.map(h => row[h] === undefined ? '' : row[h]));
    payload = { ok: true, message: 'Record saved' };
  } catch (err) {
    payload = { ok: false, error: String(err.message || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}

function listRows_(sheetKey) {
  if (!SHEET_NAMES[sheetKey]) throw new Error('Invalid sheet key');
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES[sheetKey]);
  if (!sheet) throw new Error('Sheet tab not found');
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return { ok: true, rows: [] };
  const headers = values.shift();
  return { ok: true, rows: values.filter(r => r.some(v => v !== '')).map(r => Object.fromEntries(headers.map((h, i) => [h, r[i]]))) };
}

function setupDatabase() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const schemas = {
    'Students': ['Student_ID','Name','Roll_Number','Email','Course','Batch','Phone','Created_At'],
    'Companies': ['Company_ID','Company_Name','Programs_Included','Pay_Package','Selections','Remarks','Created_At'],
    'Test Results': ['Result_ID','Student_ID','Student_Name','Email','Roll_Number','Test_Name','Score','Total_Marks','Percentage','Submitted_At'],
    'Test Attempts': ['Attempt_ID','Student_ID','Test_Name','Start_Time','End_Time','Status']
  };
  Object.entries(schemas).forEach(([name, headers]) => {
    let sh = ss.getSheetByName(name) || ss.insertSheet(name);
    if (sh.getLastRow() === 0 || sh.getLastColumn() === 0) {
      sh.appendRow(headers);
    } else {
      const existing = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
      const missing = headers.filter(header => !existing.includes(header));
      if (missing.length) sh.getRange(1, sh.getLastColumn() + 1, 1, missing.length).setValues([missing]);
    }
  });
}
