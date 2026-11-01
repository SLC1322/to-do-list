/* =====================================================================
   CALENDAR: SETTINGS, SAFE TO EDIT
   ===================================================================== */
var CALENDAR_ID     = '';      // Leave '' to use your main Google Calendar.
var REMINDER_MIN    = 10;      // Popup reminder, minutes before the event (your watch buzzes). 0 = no reminder.
var DONE_MARK       = '✓ ';    // Put in front of the event title when the task is Done.
var TRIP_ICON       = '🛒 ';   // Put in front of shopping trip titles.
var SCHEDULED_HEADER = 'Scheduled'; // Items column M: when the task is scheduled.
var EVENT_HEADER     = 'Event ID';  // Items column N: the calendar event's ID (do not edit by hand).
/* =====================================================================
   END OF SETTINGS. Everything below: leave alone.
   ===================================================================== */

/* ---------- Called from the page ---------- */

// Puts a task on the calendar, or moves it if it is already there.
// when = 'yyyy-MM-ddTHH:mm' (Eastern time). minutes = length.
function scheduleTask(id, when, minutes) {
  var start = parseWhen_(when), mins = checkMinutes_(minutes);
  var end = new Date(start.getTime() + mins * 60000);
  return withLock_(function () {
    var sheet = itemsSheet_(), c = columns_(sheet);
    checkLayout_(c.head);
    var r = findRow_(sheet, c, id);
    var cols = ensureCalendarColumns_(sheet, c);
    var cal = calendar_();
    var oldId = str_(sheet.getRange(r.row, cols.event).getValue());
    var ev = oldId ? cal.getEventById(oldId) : null;
    var title = (r.status.toLowerCase() === 'done' ? DONE_MARK : '') + r.text.slice(0, 200);
    if (ev) {
      ev.setTime(start, end);
      ev.setTitle(title);
    } else {
      ev = cal.createEvent(title, start, end, { description: 'Task ' + r.id + ' from Master To-Do.' });
      setReminder_(ev);
    }
    var label = Utilities.formatDate(start, TIME_ZONE, 'yyyy-MM-dd HH:mm');
    setText_(sheet, r.row, cols.scheduled, label);
    setText_(sheet, r.row, cols.event, ev.getId());
    return { id: r.id, scheduled: label, moved: !!(oldId && ev.getId() === oldId) };
  });
}

// Removes a task's event from the calendar and clears columns M and N.
function unscheduleTask(id) {
  return withLock_(function () {
    var sheet = itemsSheet_(), c = columns_(sheet);
    checkLayout_(c.head);
    var r = findRow_(sheet, c, id);
    var cols = ensureCalendarColumns_(sheet, c);
    var evId = str_(sheet.getRange(r.row, cols.event).getValue());
    if (evId) {
      var ev = calendar_().getEventById(evId);
      if (ev) ev.deleteEvent();
    }
    setText_(sheet, r.row, cols.scheduled, '');
    setText_(sheet, r.row, cols.event, '');
    return { id: r.id };
  });
}

// Puts a shopping trip on the calendar. The event notes list that store's items (and items with no store).
function scheduleTrip(store, when, minutes) {
  var start = parseWhen_(when), mins = checkMinutes_(minutes);
  var end = new Date(start.getTime() + mins * 60000);
  var st = String(store || '').trim();
  var buy = readTab_(BUY_TAB, BUY_HEADERS).rows.filter(function (b) { return b.status === 'Need'; });
  var line = function (b) { return '- ' + b.item + (b.qty ? ' (' + b.qty + ')' : ''); };
  var here = buy.filter(function (b) { return b.store === st; }).map(line);
  var any = st ? buy.filter(function (b) { return !b.store; }).map(line) : [];
  var notes = (here.length ? here.join('\n') : '(nothing listed yet)') +
    (any.length ? '\n\nNo store set:\n' + any.join('\n') : '') +
    '\n\nList as of ' + Utilities.formatDate(new Date(), TIME_ZONE, 'yyyy-MM-dd HH:mm') + '. Open the app for the current list.';
  var title = TRIP_ICON + (st ? st + ' run' : 'Shopping run');
  var ev = calendar_().createEvent(title, start, end, { description: notes });
  setReminder_(ev);
  return { title: title, when: Utilities.formatDate(start, TIME_ZONE, 'yyyy-MM-dd HH:mm'), items: here.length + any.length };
}

/* ---------- Used by Code.gs ---------- */

// Adds or removes the check mark on a task's event. Never throws: a calendar problem must not block a swipe.
function markEventDone_(sheet, c, row, done) {
  try {
    var cols = ensureCalendarColumns_(sheet, c);
    var evId = str_(sheet.getRange(row, cols.event).getValue());
    if (!evId) return '';
    var ev = calendar_().getEventById(evId);
    if (!ev) return 'The calendar event was not found (deleted?).';
    var t = String(ev.getTitle());
    var has = t.indexOf(DONE_MARK) === 0;
    if (done && !has) ev.setTitle(DONE_MARK + t);
    if (!done && has) ev.setTitle(t.slice(DONE_MARK.length));
    return '';
  } catch (e) {
    return 'Calendar not updated: ' + e.message;
  }
}

/* ---------- Helpers ---------- */

function calendar_() {
  var cal = CALENDAR_ID ? CalendarApp.getCalendarById(CALENDAR_ID) : CalendarApp.getDefaultCalendar();
  if (!cal) throw new Error('Calendar not found. Check CALENDAR_ID in Calendar.gs.');
  return cal;
}

function setReminder_(ev) {
  if (!(REMINDER_MIN > 0)) return;
  ev.removeAllReminders();
  ev.addPopupReminder(REMINDER_MIN);
}

// Columns L (Last review), M (Scheduled), N (Event ID), created in that order when missing.
function ensureCalendarColumns_(sheet, c) {
  ensureReviewColumn_(sheet, c);
  function ensure(header, minCol, key) {
    if (c[key]) return c[key];
    var col = Math.max(sheet.getLastColumn() + 1, minCol);
    sheet.getRange(1, col).setValue(header);
    c[key] = col;
    return col;
  }
  return { scheduled: ensure(SCHEDULED_HEADER, 13, 'scheduled'), event: ensure(EVENT_HEADER, 14, 'event') };
}

function parseWhen_(when) {
  var s = String(when || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) throw new Error('Pick a date and a time.');
  var d = Utilities.parseDate(s, TIME_ZONE, "yyyy-MM-dd'T'HH:mm");
  if (!d || isNaN(d.getTime())) throw new Error('That date or time is not valid.');
  if (Utilities.formatDate(d, TIME_ZONE, "yyyy-MM-dd'T'HH:mm") !== s) throw new Error('That date or time is not valid.');
  return d;
}

function checkMinutes_(m) {
  var n = Number(m);
  if (!(n >= 5 && n <= 720)) throw new Error('Pick a length.');
  return Math.round(n);
}
