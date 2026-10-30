/* =====================================================================
   SETTINGS: SAFE TO EDIT
   Each line says what it changes. Keep the quote marks.
   ===================================================================== */
var SHEET_ID      = '1udKX4U4bTLWhZzTDnHFOJtWs2OunMLS7iKNQR415jB8'; // The "Master Task List" spreadsheet. Change only if you move the list.
var ITEMS_TAB     = 'Items';            // Tab name that holds the tasks.
var ARCHIVE_TAB   = 'Archive';          // Tab name that holds archived tasks (read only; used to find the next ID).
var TIME_ZONE     = 'America/New_York'; // Time zone for "today" dates.
var REVIEW_HEADER = 'Last review';      // Header text of the column the swipe deck writes to (column L).
var APP_TITLE     = 'Master To-Do';     // Browser tab title.
var HIGH_WORDS    = ['urgent', 'priority', 'high', 'important']; // Words that make a new task "High" (same rule as the nightly job).
var SWIPE_LABELS  = { L: 'Not done', R: 'Done', U: 'Escalated', D: 'In process' }; // Text written in the review column for each swipe.
/* =====================================================================
   END OF SETTINGS. Everything below: leave alone.
   ===================================================================== */

// Columns A-I must stay in this order. The nightly Daily Notes job uses the same layout.
var EXPECTED_HEADERS = ['ID', 'Item', 'Priority', 'Status', 'First seen', 'Last mentioned', 'Mentions', 'Done date', 'Possible dupe of'];

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle(APP_TITLE)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no');
}

/* ---------- Called from the page ---------- */

// Returns all tasks whose Status is not "Done".
function getOpenItems() {
  var sheet = itemsSheet_();
  var rows = readRows_(sheet, columns_(sheet));
  return {
    today: today_(),
    items: rows.filter(function (r) { return r.status.toLowerCase() !== 'done'; })
  };
}

// Adds one task. Returns the new task.
function addItem(text, high) {
  var clean = String(text == null ? '' : text)
    .replace(/^\s*track\s*:\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean) throw new Error('The task text is empty.');
  if (clean.length > 1000) throw new Error('The task text is longer than 1000 characters.');

  return withLock_(function () {
    var sheet = itemsSheet_();
    var c = columns_(sheet);
    checkLayout_(c.head);
    var rows = readRows_(sheet, c);

    var id = 'T-' + pad3_(highestNumber_(rows) + 1);
    var lastRow = rows.reduce(function (m, r) { return Math.max(m, r.row); }, 1);
    var n = lastRow + 1;
    var date = today_();
    var priority = (high === true || hasHighWord_(clean)) ? 'High' : '';

    // Text format first, so dates and IDs stay text (no "46319" numbers).
    sheet.getRange(n, 1, 1, 6).setNumberFormat('@');
    sheet.getRange(n, 8, 1, 2).setNumberFormat('@');
    sheet.getRange(n, 1, 1, 9).setValues([[id, clean, priority, 'Open', date, date, 1, '', '']]);

    return { row: n, id: id, text: clean, priority: priority, status: 'Open', firstSeen: date, lastMentioned: date, mentions: 1, doneDate: '', dupe: '', stale: '', outcome: '', review: '' };
  });
}

// Records one swipe. dir is L, R, U or D. Returns the old values so the page can undo.
function swipe(id, dir) {
  if (!SWIPE_LABELS.hasOwnProperty(dir)) throw new Error('Unknown swipe direction: ' + dir);
  return withLock_(function () {
    var sheet = itemsSheet_();
    var c = columns_(sheet);
    checkLayout_(c.head);
    var r = findRow_(sheet, c, id);
    if (r.status.toLowerCase() === 'done') throw new Error(id + ' is already Done.');
    var reviewCol = ensureReviewColumn_(sheet, c);
    var prev = { priority: r.priority, status: r.status, doneDate: r.doneDate, review: r.review };
    var date = today_();

    if (dir === 'R') {
      sheet.getRange(r.row, c.status).setValue('Done');
      setText_(sheet, r.row, c.done, date);
    }
    if (dir === 'U') sheet.getRange(r.row, c.pri).setValue('High');
    setText_(sheet, r.row, reviewCol, SWIPE_LABELS[dir] + ' ' + date);
    return { id: id, prev: prev };
  });
}

// Puts back the values that swipe() returned.
function undoSwipe(id, prev) {
  if (!prev || typeof prev !== 'object') throw new Error('Nothing to undo.');
  return withLock_(function () {
    var sheet = itemsSheet_();
    var c = columns_(sheet);
    checkLayout_(c.head);
    var r = findRow_(sheet, c, id);
    var reviewCol = ensureReviewColumn_(sheet, c);
    sheet.getRange(r.row, c.pri).setValue(String(prev.priority || ''));
    sheet.getRange(r.row, c.status).setValue(String(prev.status || 'Open'));
    setText_(sheet, r.row, c.done, String(prev.doneDate || ''));
    setText_(sheet, r.row, reviewCol, String(prev.review || ''));
    return { id: id };
  });
}

/* ---------- Helpers ---------- */

function itemsSheet_() {
  var sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(ITEMS_TAB);
  if (!sheet) throw new Error('Tab "' + ITEMS_TAB + '" not found.');
  return sheet;
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try { return fn(); } finally { lock.releaseLock(); }
}

function columns_(sheet) {
  var lastCol = Math.max(sheet.getLastColumn(), 1);
  var head = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h).trim(); });
  function at(name) { var i = head.indexOf(name); return i < 0 ? 0 : i + 1; }
  return {
    head: head, id: at('ID'), item: at('Item'), pri: at('Priority'), status: at('Status'),
    first: at('First seen'), last: at('Last mentioned'), mentions: at('Mentions'), done: at('Done date'),
    dupe: at('Possible dupe of'), stale: at('Stale'), outcome: at('Outcome'), review: at(REVIEW_HEADER)
  };
}

function checkLayout_(head) {
  for (var i = 0; i < EXPECTED_HEADERS.length; i++) {
    if (head[i] !== EXPECTED_HEADERS[i]) {
      throw new Error('Sheet layout changed: column ' + String.fromCharCode(65 + i) + ' should be "' +
        EXPECTED_HEADERS[i] + '" but is "' + (head[i] || '') + '". Nothing was written.');
    }
  }
}

function readRows_(sheet, c) {
  var values = sheet.getDataRange().getValues();
  function cell(row, col) { return col ? row[col - 1] : ''; }
  var out = [];
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    var id = String(cell(row, c.id) == null ? '' : cell(row, c.id)).trim();
    if (!id) continue;
    out.push({
      row: i + 1, id: id,
      text: str_(cell(row, c.item)), priority: str_(cell(row, c.pri)), status: str_(cell(row, c.status)),
      firstSeen: dateText_(cell(row, c.first)), lastMentioned: dateText_(cell(row, c.last)),
      mentions: str_(cell(row, c.mentions)), doneDate: dateText_(cell(row, c.done)),
      dupe: str_(cell(row, c.dupe)), stale: str_(cell(row, c.stale)),
      outcome: str_(cell(row, c.outcome)), review: str_(cell(row, c.review))
    });
  }
  return out;
}

function findRow_(sheet, c, id) {
  var want = String(id || '').trim();
  var rows = readRows_(sheet, c);
  for (var i = 0; i < rows.length; i++) if (rows[i].id === want) return rows[i];
  throw new Error('Task ' + want + ' was not found. The nightly job may have archived it. Reload the page.');
}

// Finds the review column, or creates its header in column L (or the first free column after L).
function ensureReviewColumn_(sheet, c) {
  if (c.review) return c.review;
  var col = Math.max(sheet.getLastColumn() + 1, 12);
  sheet.getRange(1, col).setValue(REVIEW_HEADER);
  c.review = col;
  return col;
}

function highestNumber_(rows) {
  var ids = rows.map(function (r) { return r.id; });
  var archive = SpreadsheetApp.openById(SHEET_ID).getSheetByName(ARCHIVE_TAB);
  if (archive) {
    archive.getDataRange().getValues().forEach(function (row) { ids.push(String(row[0])); });
  }
  var max = 0;
  ids.forEach(function (id) {
    var m = /^T-(\d+)$/.exec(String(id).trim());
    if (m) max = Math.max(max, parseInt(m[1], 10));
  });
  return max;
}

function hasHighWord_(text) {
  return HIGH_WORDS.some(function (w) { return new RegExp('\\b' + w + '\\b', 'i').test(text); });
}

function setText_(sheet, row, col, value) {
  var cell = sheet.getRange(row, col);
  cell.setNumberFormat('@');
  cell.setValue(value);
}

function today_() { return Utilities.formatDate(new Date(), TIME_ZONE, 'yyyy-MM-dd'); }
function pad3_(n) { var s = String(n); while (s.length < 3) s = '0' + s; return s; }
function str_(v) { return v == null ? '' : String(v).trim(); }

// Turns a cell value into yyyy-mm-dd text. Handles real dates and raw serial numbers like 46319.
function dateText_(v) {
  if (Object.prototype.toString.call(v) === '[object Date]') return Utilities.formatDate(v, TIME_ZONE, 'yyyy-MM-dd');
  if (typeof v === 'number' || /^\d{5}$/.test(String(v).trim())) {
    var n = Number(v);
    if (n > 30000 && n < 80000) return Utilities.formatDate(new Date(Math.round((n - 25569) * 86400000)), 'UTC', 'yyyy-MM-dd');
  }
  return str_(v);
}
