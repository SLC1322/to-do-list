// Tests the real Shop.gs (and the shopping part of Mail.gs) against fake Buy and Wishlist tabs.
const test = require('node:test');
const assert = require('node:assert');
const { makeEnv, realItems, realArchive, BUY_HEAD, WISH_HEAD } = require('./mock-gas');

const NOW = '2026-11-01T17:00:00Z'; // 12:00 PM ET on 2026-11-01
const env = (extra = {}) => makeEnv({ items: realItems(), archive: realArchive(), now: NOW, ...extra });
const plain = x => JSON.parse(JSON.stringify(x));
const grid = (e, tab) => e.sheets[tab].grid;

test('getShopping returns stores and empty lists from header-only tabs', () => {
  const e = env();
  const s = plain(e.ctx.getShopping());
  assert.equal(s.today, '2026-11-01');
  assert.deepEqual(s.stores, ["Brinkley's Hardware", 'Amazon', "Lowe's", 'Food Lion', 'Walmart']);
  assert.deepEqual(s.buy, []); assert.deepEqual(s.wish, []);
});

test('addBuy writes a text row B-001, B-002 with store, qty and usual', () => {
  const e = env();
  const a = plain(e.ctx.addBuy('buy: Eggs', '2 dozen', 'Food Lion', true));
  assert.equal(a.id, 'B-001');
  assert.deepEqual(grid(e, 'Buy')[1], ['B-001', 'Eggs', '2 dozen', 'Food Lion', 'Need', '2026-11-01', '', 'yes', '']);
  assert.equal(e.sheets.Buy.formats['2,6'], '@', 'Added date is text');
  assert.equal(plain(e.ctx.addBuy('Deck screws', '', '', false)).id, 'B-002');
});

test('addBuy finds the store in the text when no store is picked', () => {
  const e = env();
  const cases = [
    ['3 boxes of deck screws at Lowes', "Lowe's", '3 boxes of deck screws'],
    ['eggs from food lion', 'Food Lion', 'eggs'],
    ["Brinkley's hardware: 10 ft chain", "Brinkley's Hardware", '10 ft chain'],
    ['Brinkleys Hardware - wire nuts', "Brinkley's Hardware", 'wire nuts'],
    ['trail cam batteries @ Walmart', 'Walmart', 'trail cam batteries'],
    ['AMAZON hunting gloves', 'Amazon', 'hunting gloves'],
    ['Amazonian frog poster', '', 'Amazonian frog poster']
  ];
  for (const [input, store, item] of cases) {
    const r = plain(e.ctx.addBuy(input, '', '', false));
    assert.equal(r.store, store, input); assert.equal(r.item, item, input);
  }
});

test('addBuy reuses an existing row: Got usual item goes back to Need', () => {
  const e = env();
  const a = plain(e.ctx.addBuy('Milk', '1 gal', 'Walmart', true));
  e.ctx.setBuyStatus(a.id, 'Got');
  assert.equal(grid(e, 'Buy')[1][4], 'Got'); assert.equal(grid(e, 'Buy')[1][6], '2026-11-01');
  const b = plain(e.ctx.addBuy('milk', '', '', false));
  assert.equal(b.id, a.id); assert.equal(b.reused, true);
  assert.equal(grid(e, 'Buy').length, 2, 'no new row');
  assert.deepEqual(grid(e, 'Buy')[1].slice(0, 8), ['B-001', 'Milk', '1 gal', 'Walmart', 'Need', '2026-11-01', '', 'yes'], 'qty, store and usual kept');
});

test('setBuyStatus Need / Got / Removed and setUsual', () => {
  const e = env();
  const a = plain(e.ctx.addBuy('Shells', '', '', false));
  e.ctx.setBuyStatus(a.id, 'Removed'); assert.equal(grid(e, 'Buy')[1][4], 'Removed');
  e.ctx.setBuyStatus(a.id, 'Need'); assert.equal(grid(e, 'Buy')[1][6], '');
  e.ctx.setUsual(a.id, true); assert.equal(grid(e, 'Buy')[1][7], 'yes');
  e.ctx.setUsual(a.id, false); assert.equal(grid(e, 'Buy')[1][7], '');
  assert.throws(() => e.ctx.setBuyStatus(a.id, 'Lost'), /Unknown status/);
  assert.throws(() => e.ctx.setBuyStatus('B-999', 'Got'), /not found/);
  assert.equal(e.isLocked(), false);
});

test('addBuy rejects empty and over-long names', () => {
  const e = env();
  assert.throws(() => e.ctx.addBuy('  ', '', '', false), /empty/);
  assert.throws(() => e.ctx.addBuy('buy:', '', '', false), /empty/);
  assert.throws(() => e.ctx.addBuy('at Walmart', '', '', false), /empty/);
  assert.throws(() => e.ctx.addBuy('x'.repeat(301), '', '', false), /longer/);
  assert.equal(e.isLocked(), false);
});

test('addWant writes prices as numbers and text as text', () => {
  const e = env();
  const w = plain(e.ctx.addWant({ item: 'want: Cellular trail cam', est: '$120', target: '80', watch: 'Black Friday (Nov 27)', why: 'Watch the feed bins', link: 'https://example.com/cam' }));
  assert.equal(w.id, 'W-001');
  assert.deepEqual(grid(e, 'Wishlist')[1], ['W-001', 'Cellular trail cam', 120, 80, 'Black Friday (Nov 27)', 'Watch the feed bins', 'https://example.com/cam', 'Want', '2026-11-01', '']);
  assert.equal(e.sheets.Wishlist.formats['2,3'], undefined, 'price stays a number');
  assert.equal(e.sheets.Wishlist.formats['2,9'], '@', 'Added is text');
  const g = plain(e.ctx.addWant({ item: '20 gauge shotgun', est: '1,250.50' }));
  assert.equal(g.id, 'W-002'); assert.equal(g.est, 1250.5); assert.equal(g.target, '');
});

test('addWant: duplicate open item is reported, not added; bad price and link are refused', () => {
  const e = env();
  e.ctx.addWant({ item: 'Trail cam' });
  const d = plain(e.ctx.addWant({ item: 'trail cam' }));
  assert.equal(d.duplicate, true); assert.equal(grid(e, 'Wishlist').length, 2);
  assert.throws(() => e.ctx.addWant({ item: 'x', est: 'cheap' }), /not a number/);
  assert.throws(() => e.ctx.addWant({ item: 'x', link: 'javascript:alert(1)' }), /must start with http/);
  assert.throws(() => e.ctx.addWant({ item: '' }), /empty/);
  assert.equal(e.isLocked(), false);
});

test('setWantStatus sets and clears Closed date', () => {
  const e = env();
  const w = plain(e.ctx.addWant({ item: 'Tree stand' }));
  e.ctx.setWantStatus(w.id, 'Dropped');
  assert.equal(grid(e, 'Wishlist')[1][7], 'Dropped'); assert.equal(grid(e, 'Wishlist')[1][9], '2026-11-01');
  e.ctx.setWantStatus(w.id, 'Want');
  assert.equal(grid(e, 'Wishlist')[1][9], '');
  assert.throws(() => e.ctx.setWantStatus(w.id, 'Maybe'), /Unknown status/);
});

test('wantToBuy copies the item to Buy and closes it on the Wishlist', () => {
  const e = env();
  const w = plain(e.ctx.addWant({ item: 'Hunter orange vest' }));
  const r = plain(e.ctx.wantToBuy(w.id));
  assert.equal(r.buy.id, 'B-001'); assert.equal(r.buy.notes, 'From wishlist W-001');
  assert.equal(grid(e, 'Wishlist')[1][7], 'Moved to Buy');
  assert.throws(() => e.ctx.wantToBuy(w.id), /not an open wishlist item/);
  assert.equal(e.isLocked(), false);
});

test('Layout protection: a moved column stops all writes', () => {
  const buy = [BUY_HEAD.slice()]; buy[0][3] = 'Shop';
  const e = env({ buy });
  assert.throws(() => e.ctx.addBuy('Eggs', '', '', false), /layout changed: column D/);
  assert.equal(grid(e, 'Buy').length, 1);
  const wish = [WISH_HEAD.slice(0, 5)];
  const e2 = env({ wish });
  assert.throws(() => e2.ctx.getShopping(), /layout changed: column F/);
});

test('Rows written by the nightly job (with apostrophe text and real numbers) read back correctly', () => {
  const buy = [BUY_HEAD, ['B-007', 'Bread', '', 'Food Lion', 'Need', '2026-10-31', '', '', '']];
  const wish = [WISH_HEAD, ['W-003', 'Climbing stand', 300, '', 'Christmas', '', '', 'Want', 46326, '']];
  const e = env({ buy, wish });
  const s = plain(e.ctx.getShopping());
  assert.equal(s.wish[0].added, '2026-10-31', 'serial date repaired');
  assert.equal(plain(e.ctx.addBuy('Coffee', '', '', false)).id, 'B-008');
  assert.equal(plain(e.ctx.addWant({ item: 'Rangefinder' })).id, 'W-004');
});

test('Mail bridge routes by address and by label; tasks still work', () => {
  const me = 'scampbell1322@gmail.com';
  const mail = [
    { id: 'm1', thread: 'a', from: me, to: 'scampbell1322+buy@gmail.com', body: 'Eggs at Food Lion' },
    { id: 'm2', thread: 'b', from: me, to: 'Me <scampbell1322+want@gmail.com>', body: '20 gauge shotgun' },
    { id: 'm3', thread: 'c', from: me, to: 'scampbell1322+track@gmail.com', body: 'buy: duct tape' },
    { id: 'm4', thread: 'd', from: me, to: 'scampbell1322+track@gmail.com', body: 'Call the farrier' },
    { id: 'm5', thread: 'e', from: 'stranger@x.com', to: 'scampbell1322+buy@gmail.com', body: 'gift cards' },
    { id: 'm6', thread: 'f', from: me, to: 'scampbell1322+want@gmail.com', body: '20 gauge shotgun' }
  ];
  const e = env({ mail });
  assert.equal(e.ctx.checkTrackMail(), 5);
  assert.deepEqual(grid(e, 'Buy').slice(1).map(r => [r[1], r[3]]), [['Eggs', 'Food Lion'], ['duct tape', '']]);
  assert.deepEqual(grid(e, 'Wishlist').slice(1).map(r => r[1]), ['20 gauge shotgun'], 'duplicate want not added twice');
  assert.equal(grid(e, 'Items').find(r => r[1] === 'Call the farrier')[0], 'T-029');
  assert.ok(!grid(e, 'Buy').some(r => r[1] === 'gift cards'));
  assert.equal(e.ctx.checkTrackMail(), 0);
});
