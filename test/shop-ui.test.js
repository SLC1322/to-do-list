// Tests the Buy and Want tabs of the real Index.html in Chromium at phone size.
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { open } = require('./browser');
const { BUY_HEAD, WISH_HEAD } = require('./mock-gas');

const NOW = '2026-11-01T17:00:00Z';
const buyRows = env => env.sheets.Buy.grid.slice(1);
const wishRows = env => env.sheets.Wishlist.grid.slice(1);
const waitToast = (page, re) => page.waitForFunction(r => new RegExp(r).test(document.querySelector('#toast').textContent), re.source);
const noSideScroll = async page => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth) <= 390, 'no horizontal scroll');

test('Buy tab: add with store, group by store, auto-store, got, usual re-add, put back, remove', async () => {
  const { env, browser, page, errors } = await open({ page: 'buy', now: NOW });
  page.on('dialog', d => d.accept());
  try {
    await page.waitForSelector('#pBuy.on');
    assert.equal(await page.locator('#tabs button.on').textContent(), 'Buy');
    assert.match(await page.locator('#buyList').textContent(), /Nothing to buy/);
    const opts = await page.locator('#bStore option').allTextContents();
    assert.deepEqual(opts, ['Any store', "Brinkley's Hardware", 'Amazon', "Lowe's", 'Food Lion', 'Walmart']);

    await page.click('#bAdd');
    await waitToast(page, /Type or say an item first/);

    await page.fill('#bItem', 'Eggs'); await page.fill('#bQty', '2 dozen');
    await page.selectOption('#bStore', 'Food Lion'); await page.check('#bUsual');
    await page.click('#bAdd');
    await waitToast(page, /Added Eggs · Food Lion/);
    assert.deepEqual(buyRows(env)[0].slice(0, 8), ['B-001', 'Eggs', '2 dozen', 'Food Lion', 'Need', '2026-11-01', '', 'yes']);
    assert.equal(await page.inputValue('#bItem'), ''); assert.equal(await page.isChecked('#bUsual'), false);
    assert.equal(await page.inputValue('#bStore'), 'Food Lion', 'store choice stays for the next item');

    await page.selectOption('#bStore', '');
    await page.fill('#bItem', 'deck screws at Lowes'); await page.press('#bItem', 'Enter');
    await waitToast(page, /Added deck screws · Lowe's/);
    await page.fill('#bItem', 'Duct tape'); await page.click('#bAdd');
    await waitToast(page, /Added Duct tape/);
    const groups = (await page.locator('#buyList .grp').allTextContents()).map(t => t.replace('📅 Plan trip', ''));
    assert.deepEqual(groups, ["Lowe's · 1", 'Food Lion · 1', 'No store · 1']);
    await page.screenshot({ path: path.join(__dirname, 'shots', 'buy.png') });

    // Tap Eggs: Got. It is a usual, so it shows as a re-add chip.
    await page.click('[data-got="B-001"]');
    await page.waitForSelector('[data-again="B-001"]');
    assert.equal(buyRows(env)[0][4], 'Got'); assert.equal(buyRows(env)[0][6], '2026-11-01');
    assert.match(await page.locator('details.got summary').textContent(), /Got in the last 7 days · 1/);
    await page.click('[data-again="B-001"]');
    await page.waitForSelector('[data-got="B-001"]');
    assert.equal(buyRows(env)[0][4], 'Need');

    // Got and put back from the "Got" drawer.
    await page.click('[data-got="B-003"]');
    await page.waitForSelector('details.got');
    await page.click('details.got summary');
    await page.click('[data-back="B-003"]');
    await page.waitForSelector('[data-got="B-003"]');
    assert.equal(buyRows(env)[2][4], 'Need');

    // Star toggles Usual; X removes after confirm.
    await page.click('[data-usual="B-002"]');
    await page.waitForSelector('[data-usual="B-002"].on');
    assert.equal(buyRows(env)[1][7], 'yes');
    await page.click('[data-rm="B-003"]');
    await waitToast(page, /Removed/);
    assert.equal(buyRows(env)[2][4], 'Removed');
    assert.equal(await page.locator('[data-got="B-003"]').count(), 0);

    // Adding an existing item reuses its row.
    await page.fill('#bItem', 'eggs'); await page.click('#bAdd');
    await waitToast(page, /already listed/);
    assert.equal(buyRows(env).length, 3);

    await noSideScroll(page);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('Buy tab: a failed save keeps the text and shows the error', async () => {
  const { env, browser, page, errors, state } = await open({ page: 'buy', now: NOW });
  try {
    await page.waitForSelector('#pBuy.on');
    state.failOn = 'addBuy';
    await page.fill('#bItem', 'Coffee'); await page.click('#bAdd');
    await waitToast(page, /Not saved: Simulated failure/);
    assert.equal(await page.inputValue('#bItem'), 'Coffee');
    assert.equal(buyRows(env).length, 0);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('Want tab: add form, price checks, duplicate warning, details reveal, move to Buy, bought, drop, reopen', async () => {
  const seed = { wish: [WISH_HEAD, ['W-001', 'Tree stand', 250, '', '', 'Second sit by the swamp', '', 'Want', '2026-10-20', '']] };
  const { env, browser, page, errors } = await open({ page: 'want', now: NOW, seed });
  page.on('dialog', d => d.accept());
  try {
    await page.waitForSelector('#pWant.on .wc');
    assert.equal(await page.locator('#wForm').isVisible(), false, 'form starts hidden');
    await page.click('#wNew');
    assert.equal(await page.locator('#wForm').isVisible(), true);
    assert.equal(await page.locator('#wNew').isVisible(), false);

    await page.fill('#wItem', 'Cellular trail cam'); await page.fill('#wEst', 'cheap');
    await page.click('#wSave');
    await waitToast(page, /not a number/);
    await page.fill('#wEst', '$120'); await page.fill('#wTarget', '80');
    await page.fill('#wWatch', 'Black Friday'); await page.fill('#wWhy', 'Watch the feed bins');
    await page.fill('#wLink', 'https://example.com/cam');
    await page.click('#wSave');
    await waitToast(page, /Added Cellular trail cam \(W-002\)/);
    assert.deepEqual(wishRows(env)[1], ['W-002', 'Cellular trail cam', 120, 80, 'Black Friday', 'Watch the feed bins', 'https://example.com/cam', 'Want', '2026-11-01', '']);
    assert.equal(await page.locator('#wForm').isVisible(), false, 'form closes after save');

    // Watch-for items sort first.
    const titles = await page.locator('.wc .t').allTextContents();
    assert.deepEqual(titles, ['Black FridayCellular trail cam', 'Tree stand']);
    assert.match(await page.locator('.wc').first().locator('.meta').textContent(), /\$120 est\. · target \$80 · added today/);
    assert.match(await page.locator('.wc').nth(1).locator('.meta').textContent(), /\$250 est\. · added 12 days ago/);

    // Details are hidden until tapped.
    const first = page.locator('.wc').first();
    assert.equal(await first.locator('.wd').isVisible(), false);
    await first.locator('.wh').click();
    assert.equal(await first.locator('.wd').isVisible(), true);
    assert.equal(await first.locator('a').getAttribute('href'), 'https://example.com/cam');
    assert.equal(await first.locator('a').getAttribute('target'), '_blank');
    await page.screenshot({ path: path.join(__dirname, 'shots', 'want.png') });

    // Duplicate.
    await page.click('#wNew'); await page.fill('#wItem', 'tree stand'); await page.click('#wSave');
    await waitToast(page, /already on the wishlist \(W-001\)/);
    assert.equal(wishRows(env).length, 2);
    await page.click('#wCancel');

    // Move the trail cam to the Buy list.
    await page.locator('.wc').first().locator('.wh').click();
    await page.click('[data-move="W-002"]');
    await waitToast(page, /Moved to the Buy list/);
    assert.equal(wishRows(env)[1][7], 'Moved to Buy');
    assert.deepEqual(env.sheets.Buy.grid[1].slice(0, 5), ['B-001', 'Cellular trail cam', '', '', 'Need']);
    assert.equal(await page.locator('.wc').count(), 1);

    // Drop the stand, see it under "show closed", reopen it.
    await page.locator('.wc').first().locator('.wh').click();
    await page.click('[data-drop="W-001"]');
    await waitToast(page, /Dropped/);
    assert.match(await page.locator('#wantList').textContent(), /wishlist is empty/);
    await page.click('#wClosed');
    assert.equal(await page.locator('.wc.closed').count(), 2);
    await page.locator('.wc', { hasText: 'Tree stand' }).locator('.wh').click();
    await page.click('[data-reopen="W-001"]');
    await waitToast(page, /Back on the wishlist/);
    assert.equal(wishRows(env)[0][7], 'Want'); assert.equal(wishRows(env)[0][9], '');

    // Bought.
    await page.click('#wClosed');
    await page.locator('.wc').first().locator('.wh').click();
    await page.click('[data-bought="W-001"]');
    await waitToast(page, /Marked bought/);
    assert.equal(wishRows(env)[0][7], 'Bought');

    await noSideScroll(page);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('Want tab: unsafe link from the Sheet is not rendered as a link; HTML in text is shown as text', async () => {
  const seed = { wish: [WISH_HEAD, ['W-001', '<img src=x onerror=alert(1)>', '', '', '', '', 'javascript:alert(1)', 'Want', '2026-11-01', '']] };
  const { browser, page, errors } = await open({ page: 'want', now: NOW, seed });
  let dialogs = 0; page.on('dialog', d => { dialogs++; d.dismiss(); });
  try {
    await page.waitForSelector('.wc');
    await page.locator('.wc .wh').click();
    assert.equal(await page.locator('.wc a').count(), 0);
    assert.equal(await page.locator('.wc img').count(), 0);
    assert.match(await page.locator('.wc .t').textContent(), /<img src=x/);
    assert.equal(dialogs, 0);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('All five tabs fit at phone width in light mode', async () => {
  const seed = { buy: [BUY_HEAD, ['B-001', 'Bread', '1 loaf', 'Food Lion', 'Need', '2026-11-01', '', 'yes', '']] };
  const { browser, page, errors } = await open({ page: 'buy', now: NOW, seed, colorScheme: 'light' });
  try {
    await page.waitForSelector('.bi');
    const labels = await page.locator('#tabs button').allTextContents();
    assert.deepEqual(labels, ['Add', 'Swipe', 'List', 'Buy', 'Want']);
    for (const b of await page.locator('#tabs button').all()) {
      const fits = await b.evaluate(el => el.scrollWidth <= el.clientWidth);
      assert.ok(fits, 'tab label fits');
    }
    await page.screenshot({ path: path.join(__dirname, 'shots', 'buy-light.png') });
    for (const t of ['tAdd', 'tSwipe', 'tList', 'tWant', 'tBuy']) { await page.click('#' + t); await page.waitForTimeout(150); await noSideScroll(page); }
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
