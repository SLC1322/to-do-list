// Tests the real Code.gs and Mail.gs against a fake copy of the Sheet.
// Run: node --test test/
const test = require('node:test');
const assert = require('node:assert');
const { makeEnv, realItems, realArchive } = require('./mock-gas');

const NOW = '2026-10-30T16:00:00Z'; // 12:00 PM ET on 2026-10-30
const env = (extra = {}) => makeEnv({ items: realItems(), archive: realArchive(), now: NOW, ...extra });
const plain = x => JSON.parse(JSON.stringify(x));
const rowOf = (sheet, id) => sheet.grid.findIndex(r => r[0] === id) + 1;

test('doGet serves Index with title and viewport', () => {
  const { ctx } = env();
  const out = ctx.doGet();
  assert.equal(out.file, 'Index');
  assert.equal(out.title, 'Master To-Do');
  assert.equal(out.meta[0], 'viewport');
});

test('getOpenItems returns only non-Done items, with repaired dates', () => {
  const { ctx } = env();
  const res = plain(ctx.getOpenItems());
  assert.equal(res.today, '2026-10-30');
  assert.deepEqual(res.items.map(i => i.id), ['T-001', 'T-015', 'T-016', 'T-023', 'T-024', 'T-026', 'T-027', 'T-028']);
  const t24 = res.items.find(i => i.id === 'T-024');
  assert.equal(t24.firstSeen, '2026-10-24', 'serial 46319 must read as 2026-10-24');
  assert.equal(res.items[0].stale, 'Stale');
});

test('addItem appends the next ID after the last row, as text, without touching column J', () => {
  const { ctx, sheets } = env();
  const it = plain(ctx.addItem('  track:  Buy   deer corn  ', false));
  assert.equal(it.id, 'T-029');
  assert.equal(it.text, 'Buy deer corn');
  assert.equal(it.priority, '');
  const r = rowOf(sheets.Items, 'T-029');
  assert.equal(r, 13, 'new row goes right after T-028 (row 12)');
  assert.deepEqual(sheets.Items.grid[r - 1].slice(0, 9), ['T-029', 'Buy deer corn', '', 'Open', '2026-10-30', '2026-10-30', 1, '', '']);
  assert.ok(!sheets.Items.writes.some(([, c]) => c === 10), 'never writes column J (Stale formula)');
  assert.equal(sheets.Items.formats['13,5'], '@', 'First seen is text format');
  assert.equal(sheets.Items.formats['13,1'], '@', 'ID is text format');
  assert.equal(sheets.Items.formats['13,7'], undefined, 'Mentions stays a number');
});

test('addItem: High from the switch or from a priority word, same as the nightly job', () => {
  const { ctx } = env();
  assert.equal(ctx.addItem('Call the bank', true).priority, 'High');
  assert.equal(ctx.addItem('URGENT renew tags', false).priority, 'High');
  assert.equal(ctx.addItem('Fix the highway sign idea', false).priority, '', '"highway" is not the word "high"');
  assert.equal(ctx.addItem('Another one', false).id, 'T-032', 'IDs keep counting up');
});

test('addItem uses the highest ID across Items and Archive', () => {
  const archive = realArchive(); archive.push(['T-040', 'x', '', 'Done', '', '', '1', '', '']);
  const { ctx } = makeEnv({ items: realItems(), archive, now: NOW });
  assert.equal(ctx.addItem('x', false).id, 'T-041');
});

test('addItem rejects empty and too-long text, and releases the lock', () => {
  const e = env();
  assert.throws(() => e.ctx.addItem('   ', false), /empty/);
  assert.throws(() => e.ctx.addItem('track:', false), /empty/);
  assert.throws(() => e.ctx.addItem('x'.repeat(1001), false), /longer than 1000/);
  assert.equal(e.isLocked(), false);
});

test('addItem refuses to write if the columns were moved', () => {
  const items = realItems(); items[0] = items[0].slice(); items[0][2] = 'Status'; items[0][3] = 'Priority';
  const e = makeEnv({ items, archive: realArchive(), now: NOW });
  const before = JSON.stringify(e.sheets.Items.grid);
  assert.throws(() => e.ctx.addItem('x', false), /layout changed/);
  assert.equal(JSON.stringify(e.sheets.Items.grid), before);
  assert.equal(e.isLocked(), false, 'lock released after error');
});

test('swipe Done sets Status, Done date, and creates the "Last review" column in L', () => {
  const { ctx, sheets } = env();
  const res = plain(ctx.swipe('T-026', 'R'));
  assert.deepEqual(res.prev, { priority: '', status: 'Open', doneDate: '', review: '' });
  assert.equal(sheets.Items.grid[0][11], 'Last review', 'header in L1');
  const row = sheets.Items.grid[rowOf(sheets.Items, 'T-026') - 1];
  assert.equal(row[3], 'Done'); assert.equal(row[7], '2026-10-30'); assert.equal(row[11], 'Done 2026-10-30');
  assert.ok(!sheets.Items.writes.some(([, c]) => c === 10 || c === 11), 'never writes J or K');
});

test('swipe Escalate sets High; In process and Not done only write the review column', () => {
  const { ctx, sheets } = env();
  ctx.swipe('T-001', 'U'); ctx.swipe('T-015', 'D'); ctx.swipe('T-016', 'L');
  const g = id => sheets.Items.grid[rowOf(sheets.Items, id) - 1];
  assert.equal(g('T-001')[2], 'High'); assert.equal(g('T-001')[3], 'Open'); assert.equal(g('T-001')[11], 'Escalated 2026-10-30');
  assert.equal(g('T-015')[3], 'Open', 'In process keeps Status Open so the nightly merge still works');
  assert.equal(g('T-015')[11], 'In process 2026-10-30');
  assert.equal(g('T-016')[2], ''); assert.equal(g('T-016')[11], 'Not done 2026-10-30');
  assert.equal(sheets.Items.grid[0].filter(h => h === 'Last review').length, 1, 'only one review header');
  const open = plain(ctx.getOpenItems()).items;
  assert.equal(open.find(i => i.id === 'T-015').review, 'In process 2026-10-30');
});

test('undoSwipe puts every changed cell back', () => {
  const { ctx, sheets } = env();
  const before = Array.from({ length: 9 }, (_, i) => sheets.Items.grid[rowOf(sheets.Items, 'T-027') - 1][i] ?? '');
  const { prev } = plain(ctx.swipe('T-027', 'R'));
  ctx.undoSwipe('T-027', prev);
  const after = sheets.Items.grid[rowOf(sheets.Items, 'T-027') - 1];
  assert.deepEqual(after.slice(0, 9), before);
  assert.equal(after[11], '');
  const u = plain(ctx.swipe('T-001', 'U')); ctx.undoSwipe('T-001', u.prev);
  assert.equal(sheets.Items.grid[1][2], '');
});

test('swipe finds the row by ID even after rows move (nightly archive)', () => {
  const { ctx, sheets } = env();
  sheets.Items.grid.splice(4, 2); // the nightly job deleted T-021 and T-022
  ctx.swipe('T-028', 'R');
  assert.equal(sheets.Items.grid.find(r => r[0] === 'T-028')[3], 'Done');
});

test('swipe errors: unknown ID, already Done, bad direction', () => {
  const e = env();
  assert.throws(() => e.ctx.swipe('T-999', 'R'), /not found/);
  assert.throws(() => e.ctx.swipe('T-021', 'R'), /already Done/);
  assert.throws(() => e.ctx.swipe('T-001', 'X'), /Unknown swipe/);
  assert.equal(e.isLocked(), false);
});

test('Mail bridge: adds mail from allowed senders only, once, and labels it', () => {
  const mail = [
    { id: 'm1', thread: 'a', from: 'Stephen <scampbell1322@gmail.com>', subject: '', body: 'track: Order hunter orange vest\n\n--\nSent from my watch' },
    { id: 'm2', thread: 'b', from: 'stranger@evil.example', subject: 'track: wire money', body: 'track: wire money' },
    { id: 'm3', thread: 'c', from: 'scampbell1322@gmail.com', subject: 'Check tire pressure', body: '' },
    { id: 'm4', thread: 'c', from: 'scampbell1322@gmail.com', subject: 'x', body: 'deleted one', trash: true }
  ];
  const { ctx, sheets } = makeEnv({ items: realItems(), archive: realArchive(), mail, now: NOW });
  assert.equal(ctx.checkTrackMail(), 2);
  const texts = sheets.Items.grid.slice(12).map(r => r[1]);
  assert.deepEqual(texts, ['Order hunter orange vest', 'Check tire pressure']);
  assert.equal(ctx.checkTrackMail(), 0, 'second run adds nothing');
  assert.ok(!sheets.Items.grid.some(r => /wire money/.test(r[1])));
});

test('Mail bridge: a failed add is retried next run, earlier adds are not repeated', () => {
  const mail = [
    { id: 'm1', thread: 'a', from: 'scampbell1322@gmail.com', body: 'first task' },
    { id: 'm2', thread: 'b', from: 'scampbell1322@gmail.com', body: 'second task' }
  ];
  const e = makeEnv({ items: realItems(), archive: realArchive(), mail, now: NOW });
  const realAdd = e.ctx.addItem; let calls = 0;
  e.ctx.addItem = (t, h) => { calls++; if (calls === 2) throw new Error('Sheets down'); return realAdd(t, h); };
  assert.throws(() => e.ctx.checkTrackMail(), /Sheets down/);
  e.ctx.addItem = realAdd;
  assert.equal(e.ctx.checkTrackMail(), 1);
  const texts = e.sheets.Items.grid.slice(12).map(r => r[1]);
  assert.deepEqual(texts, ['first task', 'second task']);
});

test('Mail bridge: install creates one 5-minute check; remove deletes it', () => {
  const { ctx, triggers } = env();
  ctx.installMailCheck(); ctx.installMailCheck();
  assert.equal(triggers.length, 1); assert.equal(triggers[0].m, 5);
  ctx.removeMailCheck(); assert.equal(triggers.length, 0);
});
