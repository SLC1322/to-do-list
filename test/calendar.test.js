// Tests the real Calendar.gs against a fake Sheet and a fake Google Calendar.
const test = require('node:test');
const assert = require('node:assert');
const { makeEnv, realItems, realArchive, BUY_HEAD } = require('./mock-gas');

const NOW = '2026-11-01T17:00:00Z';
const env = (extra = {}) => makeEnv({ items: realItems(), archive: realArchive(), now: NOW, ...extra });
const plain = x => JSON.parse(JSON.stringify(x));
const row = (e, id) => e.sheets.Items.grid.find(r => r[0] === id);

test('scheduleTask creates an event at the right instant, after the clock change, with a 10-minute reminder', () => {
  const e = env();
  const r = plain(e.ctx.scheduleTask('T-026', '2026-11-08T16:30', 30));
  assert.deepEqual(r, { id: 'T-026', scheduled: '2026-11-08 16:30', moved: false });
  const [ev] = e.calendar.live();
  assert.equal(ev.title, 'Take off Monday November 16th');
  assert.equal(ev.start.toISOString(), '2026-11-08T21:30:00.000Z', '4:30 PM EST = 21:30 UTC');
  assert.equal(ev.end.toISOString(), '2026-11-08T22:00:00.000Z');
  assert.deepEqual(ev.reminders, [{ popup: 10 }], 'default reminders replaced by one 10-minute popup');
  assert.match(ev.description, /Task T-026/);
});

test('summer time is handled too (EDT)', () => {
  const e = env();
  e.ctx.scheduleTask('T-001', '2027-06-06T09:00', 60);
  assert.equal(e.calendar.live()[0].start.toISOString(), '2027-06-06T13:00:00.000Z');
});

test('the Sheet gets Last review (L), Scheduled (M) and Event ID (N), in order, as text', () => {
  const e = env();
  e.ctx.scheduleTask('T-026', '2026-11-08T16:30', 30);
  const head = e.sheets.Items.grid[0];
  assert.deepEqual(head.slice(11, 14), ['Last review', 'Scheduled', 'Event ID']);
  const r = row(e, 'T-026');
  assert.equal(r[12], '2026-11-08 16:30'); assert.equal(r[13], 'ev1@google.com');
  const n = e.sheets.Items.grid.indexOf(r) + 1;
  assert.equal(e.sheets.Items.formats[n + ',13'], '@');
  assert.ok(!e.sheets.Items.writes.some(([, c]) => c === 10 || c === 11), 'never writes J or K');
  const open = plain(e.ctx.getOpenItems()).items.find(i => i.id === 'T-026');
  assert.equal(open.scheduled, '2026-11-08 16:30');
});

test('scheduling again moves the same event instead of making a second one', () => {
  const e = env();
  e.ctx.scheduleTask('T-026', '2026-11-08T16:30', 30);
  const r = plain(e.ctx.scheduleTask('T-026', '2026-11-09T07:15', 120));
  assert.equal(r.moved, true);
  assert.equal(e.calendar.live().length, 1);
  assert.equal(e.calendar.live()[0].start.toISOString(), '2026-11-09T12:15:00.000Z');
  assert.equal(e.calendar.live()[0].end.toISOString(), '2026-11-09T14:15:00.000Z');
  assert.equal(row(e, 'T-026')[12], '2026-11-09 07:15');
});

test('if you deleted the event in Calendar, scheduling makes a new one', () => {
  const e = env();
  e.ctx.scheduleTask('T-026', '2026-11-08T16:30', 30);
  e.calendar.events[0].deleted = true;
  const r = plain(e.ctx.scheduleTask('T-026', '2026-11-08T17:00', 30));
  assert.equal(r.moved, false);
  assert.equal(e.calendar.live().length, 1);
  assert.equal(row(e, 'T-026')[13], 'ev2@google.com');
});

test('unscheduleTask deletes the event and clears M and N', () => {
  const e = env();
  e.ctx.scheduleTask('T-026', '2026-11-08T16:30', 30);
  e.ctx.unscheduleTask('T-026');
  assert.equal(e.calendar.live().length, 0);
  assert.equal(row(e, 'T-026')[12], ''); assert.equal(row(e, 'T-026')[13], '');
  e.ctx.unscheduleTask('T-026'); // twice is harmless
});

test('swipe Done puts a check mark on the event; Go back removes it', () => {
  const e = env();
  e.ctx.scheduleTask('T-026', '2026-11-08T16:30', 30);
  const s = plain(e.ctx.swipe('T-026', 'R'));
  assert.equal(s.warning, '');
  assert.equal(e.calendar.live()[0].title, '✓ Take off Monday November 16th');
  e.ctx.undoSwipe('T-026', s.prev);
  assert.equal(e.calendar.live()[0].title, 'Take off Monday November 16th');
  // Other swipes do not touch the title.
  e.ctx.swipe('T-026', 'U');
  assert.equal(e.calendar.live()[0].title, 'Take off Monday November 16th');
});

test('a calendar problem never blocks the swipe', () => {
  const e = env();
  e.ctx.scheduleTask('T-026', '2026-11-08T16:30', 30);
  e.calendar.events[0].deleted = true;
  const s = plain(e.ctx.swipe('T-026', 'R'));
  assert.equal(row(e, 'T-026')[3], 'Done');
  assert.match(s.warning, /not found/);
  const e2 = env();
  e2.ctx.scheduleTask('T-001', '2026-11-08T16:30', 30);
  e2.calendar.getEventById = () => { throw new Error('Calendar is down'); };
  const s2 = plain(e2.ctx.swipe('T-001', 'R'));
  assert.equal(row(e2, 'T-001')[3], 'Done');
  assert.match(s2.warning, /Calendar not updated: Calendar is down/);
  assert.equal(e2.isLocked(), false);
});

test('unscheduled tasks swipe exactly as before (no calendar columns created)', () => {
  const e = env();
  e.ctx.swipe('T-001', 'R');
  assert.equal(e.sheets.Items.grid[0].length, 12, 'only L was added');
  assert.equal(e.calendar.events.length, 0);
});

test('bad input is refused before anything is written', () => {
  const e = env();
  for (const [when, mins, re] of [['', 30, /Pick a date/], ['2026-11-08', 30, /Pick a date/], ['2026-02-30T10:00', 30, /not valid/],
    ['2026-11-08T25:00', 30, /not valid|Pick a date/], ['2026-11-08T16:30', 0, /Pick a length/], ['2026-11-08T16:30', '', /Pick a length/], ['2026-11-08T16:30', 9999, /Pick a length/]]) {
    assert.throws(() => e.ctx.scheduleTask('T-026', when, mins), re, when + ' ' + mins);
  }
  assert.throws(() => e.ctx.scheduleTask('T-999', '2026-11-08T16:30', 30), /not found/);
  assert.equal(e.calendar.events.length, 0);
  assert.equal(e.sheets.Items.grid[0].length, 11, 'no columns added');
  assert.equal(e.isLocked(), false);
});

test('scheduleTrip makes a store run with that store\'s items (and no-store items) in the notes', () => {
  const buy = [BUY_HEAD,
    ['B-001', 'Eggs', '2 dozen', 'Food Lion', 'Need', '2026-11-01', '', 'yes', ''],
    ['B-002', 'Milk', '', 'Food Lion', 'Got', '2026-11-01', '2026-11-01', 'yes', ''],
    ['B-003', 'Deck screws', '', "Lowe's", 'Need', '2026-11-01', '', '', ''],
    ['B-004', 'Duct tape', '', '', 'Need', '2026-11-01', '', '', '']];
  const e = env({ buy });
  const r = plain(e.ctx.scheduleTrip('Food Lion', '2026-11-07T10:00', 45));
  assert.deepEqual(r, { title: '🛒 Food Lion run', when: '2026-11-07 10:00', items: 2 });
  const ev = e.calendar.live()[0];
  assert.equal(ev.start.toISOString(), '2026-11-07T15:00:00.000Z');
  assert.match(ev.description, /^- Eggs \(2 dozen\)\n\nNo store set:\n- Duct tape\n\nList as of 2026-11-01 12:00/);
  assert.doesNotMatch(ev.description, /Milk|Deck screws/);
  assert.deepEqual(ev.reminders, [{ popup: 10 }]);
  const any = plain(e.ctx.scheduleTrip('', '2026-11-07T12:00', 60));
  assert.equal(any.title, '🛒 Shopping run');
  assert.match(e.calendar.live()[1].description, /^- Duct tape\n\nList as of/);
  const none = plain(e.ctx.scheduleTrip('Amazon', '2026-11-07T12:00', 15));
  assert.match(e.calendar.live()[2].description, /^\(nothing listed yet\)/);
  assert.equal(none.items, 1);
});
