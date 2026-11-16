/* =====================================================================
   SHOPPING LISTS: SETTINGS, SAFE TO EDIT
   ===================================================================== */
var BUY_TAB  = 'Buy';       // Tab name for the short-term buy list.
var WISH_TAB = 'Wishlist';  // Tab name for the long-term wishlist.
var STORES   = ["Brinkley's Hardware", 'Amazon', "Lowe's", 'Food Lion', 'Walmart']; // Store picker, in this order.
// Buy-list groups, in screen order. Keep 'Other' last: it catches anything not matched below.
var CATEGORIES = ['Groceries', 'Household', 'Hardware', 'Hunting & outdoors', 'Health & personal', 'Other'];
// Words that pick a category when you leave it on "Auto". Lower case. Add your own words inside the brackets.
var CATEGORY_WORDS = {
  'Groceries':          ['egg', 'milk', 'bread', 'half and half', 'cream', 'cheese', 'butter', 'coffee', 'tea', 'soup', 'treat', 'drink', 'soda',
                         'water', 'meat', 'chicken', 'beef', 'pork', 'fish', 'fruit', 'apple', 'banana', 'vegetable', 'potato', 'onion', 'snack',
                         'chip', 'cereal', 'sugar', 'flour', 'rice', 'pasta', 'sauce', 'pickle', 'vinegar', 'spice', 'salt', 'pepper', 'jerky'],
  'Household':          ['paper towel', 'toilet paper', 'napkin', 'soap', 'detergent', 'bleach', 'trash bag', 'cleaner', 'sponge', 'battery',
                         'batteries', 'light bulb', 'bulb', 'foil', 'plastic wrap', 'zip bag', 'filter', 'dog food', 'cat food', 'litter'],
  'Hardware':           ['screw', 'nail', 'bolt', 'nut', 'washer', 'paint', 'primer', 'polycoat', 'poly', 'stain', 'glue', 'tape', 'wire', 'pipe',
                         'lumber', 'board', 'plywood', 'handle', 'hinge', 'caulk', 'sandpaper', 'drill', 'saw', 'chain', 'rope', 'tarp', 'brush'],
  'Hunting & outdoors': ['shell', 'shot', 'shotgun', 'ammo', '.22', '22 lr', 'gun', 'hunter orange', 'warmer', 'camo', 'boot', 'knife', 'fatwood', 'kettle',
                         'trail cam', 'scope', 'decoy', 'waterproof', 'headlamp', 'flashlight', 'gloves', 'seed', 'feed', 'corn'],
  'Health & personal':  ['medicine', 'vitamin', 'toothpaste', 'toothbrush', 'shampoo', 'razor', 'deodorant', 'bandage', 'floss', 'lotion', 'sunscreen']
};
/* =====================================================================
   END OF SETTINGS. Everything below: leave alone.
   ===================================================================== */

var BUY_HEADERS  = ['ID', 'Item', 'Qty', 'Store', 'Status', 'Added', 'Got date', 'Usual', 'Notes', 'Category'];
var BUY_ADDED_LATER = ['Category']; // Headers the app creates itself if the cell is blank (added after the tab was made).
var WISH_HEADERS = ['ID', 'Item', 'Est. price', 'Target price', 'Watch for', 'Why', 'Link', 'Status', 'Added', 'Closed date'];
var BUY_STATUSES  = ['Need', 'Got', 'Removed'];
var WISH_STATUSES = ['Want', 'Moved to Buy', 'Bought', 'Dropped'];

/* ---------- Called from the page ---------- */

function getShopping() {
  var buy = readBuy_().rows.map(function (b) {
    if (!b.category) { b.category = guessCategory_(b.item); b.categoryGuessed = true; }
    return b;
  });
  return { today: today_(), stores: STORES, categories: CATEGORIES, buy: buy, wish: readTab_(WISH_TAB, WISH_HEADERS).rows };
}

// Adds an item to the Buy list. If the same item is already there (any status), it is set back to Need.
// category: one of CATEGORIES, or '' for automatic.
function addBuy(item, qty, store, usual, category) {
  return withLock_(function () { return addBuy_(item, qty, store, usual, '', category); });
}

// Changes an item's category.
function setBuyCategory(id, category) {
  if (CATEGORIES.indexOf(category) < 0) throw new Error('Unknown category: ' + category);
  return withLock_(function () {
    var t = readBuy_(), r = findIn_(t, id);
    write_(t, r.row, 'Category', category);
    return rowObj_(t, r.row);
  });
}

// status: Need, Got or Removed.
function setBuyStatus(id, status) {
  if (BUY_STATUSES.indexOf(status) < 0) throw new Error('Unknown status: ' + status);
  return withLock_(function () {
    var t = readBuy_(), r = findIn_(t, id);
    write_(t, r.row, 'Status', status);
    write_(t, r.row, 'Got date', status === 'Got' ? today_() : '');
    return rowObj_(t, r.row);
  });
}

function setUsual(id, usual) {
  return withLock_(function () {
    var t = readBuy_(), r = findIn_(t, id);
    write_(t, r.row, 'Usual', usual ? 'yes' : '');
    return rowObj_(t, r.row);
  });
}

// w: {item, est, target, watch, why, link}. Returns the row, with duplicate:true if it was already on the list.
function addWant(w) {
  return withLock_(function () { return addWant_(w || {}); });
}

// status: Want, Bought or Dropped.
function setWantStatus(id, status) {
  if (WISH_STATUSES.indexOf(status) < 0) throw new Error('Unknown status: ' + status);
  return withLock_(function () {
    var t = readTab_(WISH_TAB, WISH_HEADERS), r = findIn_(t, id);
    write_(t, r.row, 'Status', status);
    write_(t, r.row, 'Closed date', status === 'Want' ? '' : today_());
    return rowObj_(t, r.row);
  });
}

// Puts a wishlist item on the Buy list and marks it "Moved to Buy".
function wantToBuy(id) {
  return withLock_(function () {
    var t = readTab_(WISH_TAB, WISH_HEADERS), r = findIn_(t, id);
    if (r.status !== 'Want') throw new Error(id + ' is not an open wishlist item.');
    var b = addBuy_(r.item, '', '', false, 'From wishlist ' + id, '');
    write_(t, r.row, 'Status', 'Moved to Buy');
    write_(t, r.row, 'Closed date', today_());
    return { want: rowObj_(t, r.row), buy: b };
  });
}

/* ---------- Internal (no lock; callers hold it) ---------- */

function addBuy_(item, qty, store, usual, notes, category) {
  var text = cleanText_(item, 'buy');
  var st = String(store || '').trim();
  if (!st) { var found = findStore_(text); st = found.store; text = found.rest; }
  if (!text) throw new Error('The item name is empty.');
  if (text.length > 300) throw new Error('The item name is longer than 300 characters.');
  var q = String(qty == null ? '' : qty).trim().slice(0, 50);
  var picked = CATEGORIES.indexOf(String(category || '')) >= 0 ? String(category) : '';

  var t = readBuy_();
  var same = t.rows.filter(function (r) { return r.item.toLowerCase() === text.toLowerCase(); })[0];
  if (same) {
    write_(t, same.row, 'Status', 'Need');
    write_(t, same.row, 'Got date', '');
    if (q) write_(t, same.row, 'Qty', q);
    if (st) write_(t, same.row, 'Store', st);
    if (usual === true) write_(t, same.row, 'Usual', 'yes');
    if (picked) write_(t, same.row, 'Category', picked);
    else if (!same.category) write_(t, same.row, 'Category', guessCategory_(text));
    var back = rowObj_(t, same.row); back.reused = true;
    return back;
  }
  var n = nextRow_(t);
  var id = 'B-' + pad3_(maxId_(t, 'B') + 1);
  t.sheet.getRange(n, 1, 1, 10).setNumberFormat('@');
  t.sheet.getRange(n, 1, 1, 10).setValues([[id, text, q, st, 'Need', today_(), '', usual === true ? 'yes' : '', String(notes || ''), picked || guessCategory_(text)]]);
  return rowObj_(t, n);
}

function addWant_(w) {
  var text = cleanText_(w.item, 'want');
  if (!text) throw new Error('The item name is empty.');
  if (text.length > 300) throw new Error('The item name is longer than 300 characters.');
  var link = String(w.link || '').trim();
  if (link && !/^https?:\/\//i.test(link)) throw new Error('The link must start with http:// or https://');

  var t = readTab_(WISH_TAB, WISH_HEADERS);
  var same = t.rows.filter(function (r) { return r.status === 'Want' && r.item.toLowerCase() === text.toLowerCase(); })[0];
  if (same) { var d = rowObj_(t, same.row); d.duplicate = true; return d; }

  var n = nextRow_(t);
  var id = 'W-' + pad3_(maxId_(t, 'W') + 1);
  t.sheet.getRange(n, 1, 1, 2).setNumberFormat('@');
  t.sheet.getRange(n, 5, 1, 6).setNumberFormat('@');
  t.sheet.getRange(n, 1, 1, 10).setValues([[id, text, price_(w.est), price_(w.target),
    String(w.watch || '').trim().slice(0, 100), String(w.why || '').trim().slice(0, 500), link.slice(0, 500), 'Want', today_(), '']]);
  return rowObj_(t, n);
}

function readBuy_() { return readTab_(BUY_TAB, BUY_HEADERS, BUY_ADDED_LATER); }

// The first category with a word (or its plural) in the item name. 'Other' if none.
function guessCategory_(item) {
  var text = ' ' + String(item || '').toLowerCase() + ' ';
  for (var i = 0; i < CATEGORIES.length; i++) {
    var words = CATEGORY_WORDS[CATEGORIES[i]] || [];
    for (var j = 0; j < words.length; j++) {
      var w = String(words[j]).toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (new RegExp('[^a-z0-9]' + w + '(e?s)?(?![a-z0-9])').test(text)) return CATEGORIES[i]; // whole word, plural allowed
    }
  }
  return CATEGORIES.indexOf('Other') >= 0 ? 'Other' : CATEGORIES[CATEGORIES.length - 1];
}

// Reads a tab. Checks the header row. Each row becomes {row, id, item, ...} with camelCase keys.
// addedLater: trailing headers that are created if their cell is still blank.
function readTab_(name, headers, addedLater) {
  var sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(name);
  if (!sheet) throw new Error('Tab "' + name + '" not found.');
  var values = sheet.getDataRange().getValues();
  var head = (values[0] || []).map(function (h) { return String(h).trim(); });
  for (var i = 0; i < headers.length; i++) {
    if (!head[i] && (addedLater || []).indexOf(headers[i]) >= 0) {
      sheet.getRange(1, i + 1).setValue(headers[i]);
      head[i] = headers[i];
    }
    if (head[i] !== headers[i]) throw new Error('Tab "' + name + '" layout changed: column ' + String.fromCharCode(65 + i) +
      ' should be "' + headers[i] + '" but is "' + (head[i] || '') + '". Nothing was written.');
  }
  var t = { sheet: sheet, headers: headers, rows: [] };
  for (var r = 1; r < values.length; r++) {
    var id = str_(values[r][0]);
    if (!id) continue;
    t.rows.push(toObj_(headers, values[r], r + 1));
  }
  return t;
}

function toObj_(headers, row, n) {
  var o = { row: n };
  headers.forEach(function (h, i) {
    var v = row[i];
    var key = key_(h);
    o[key] = /date|Added/.test(h) ? dateText_(v) : (typeof v === 'number' ? v : str_(v));
  });
  return o;
}

function key_(h) {
  var k = { 'ID': 'id', 'Item': 'item', 'Qty': 'qty', 'Store': 'store', 'Status': 'status', 'Added': 'added', 'Got date': 'gotDate',
    'Usual': 'usual', 'Notes': 'notes', 'Est. price': 'est', 'Target price': 'target', 'Watch for': 'watch', 'Why': 'why',
    'Link': 'link', 'Closed date': 'closedDate', 'Category': 'category' }[h];
  if (!k) throw new Error('No key for header ' + h);
  return k;
}

function rowObj_(t, n) {
  return toObj_(t.headers, t.sheet.getRange(n, 1, 1, t.headers.length).getValues()[0], n);
}

function write_(t, row, header, value) {
  var col = t.headers.indexOf(header) + 1;
  if (!col) throw new Error('Unknown column ' + header);
  var cell = t.sheet.getRange(row, col);
  if (typeof value === 'string') cell.setNumberFormat('@');
  cell.setValue(value);
}

function findIn_(t, id) {
  var want = String(id || '').trim();
  for (var i = 0; i < t.rows.length; i++) if (t.rows[i].id === want) return t.rows[i];
  throw new Error(want + ' was not found. Reload the page.');
}

function nextRow_(t) { return t.rows.reduce(function (m, r) { return Math.max(m, r.row); }, 1) + 1; }

function maxId_(t, prefix) {
  var re = new RegExp('^' + prefix + '-(\\d+)$'), max = 0;
  t.rows.forEach(function (r) { var m = re.exec(r.id); if (m) max = Math.max(max, parseInt(m[1], 10)); });
  return max;
}

function cleanText_(v, label) {
  return String(v == null ? '' : v).replace(new RegExp('^\\s*' + label + '\\s*:\\s*', 'i'), '').replace(/\s+/g, ' ').trim();
}

// "$1,250.50" -> 1250.5. Blank or not a number -> ''.
function price_(v) {
  var s = String(v == null ? '' : v).replace(/[$,\s]/g, '');
  if (!s) return '';
  var n = Number(s);
  if (!isFinite(n) || n < 0) throw new Error('Price "' + v + '" is not a number.');
  return Math.round(n * 100) / 100;
}

// Finds a store name in the text ("eggs at food lion"). Returns the store and the text without it.
function findStore_(text) {
  for (var i = 0; i < STORES.length; i++) {
    var name = STORES[i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/'/g, "['’]?");
    var re = new RegExp('\\s*(?:(?:\\bat|\\bfrom|@)\\s+)?\\b' + name + '(?![\\w])', 'i');
    if (re.test(text)) {
      var rest = text.replace(re, ' ').replace(/\s+/g, ' ').replace(/^[\s,;:-]+|[\s,;:-]+$/g, '').trim();
      return { store: STORES[i], rest: rest };
    }
  }
  return { store: '', rest: text };
}
