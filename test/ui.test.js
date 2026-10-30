// Tests the real Index.html in Chromium at phone size.
// google.script.run is replaced by a bridge to the real Code.gs running on the fake Sheet.
// Run: node --test test/
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { chromium } = require('playwright');
const { makeEnv, realItems, realArchive } = require('./mock-gas');

const FILE = 'file://' + path.join(__dirname, '..', 'apps-script', 'Index.html');
const NOW = '2026-10-30T16:00:00Z';

async function open({ page: startPage = '', failOn = null, colorScheme = 'dark' } = {}) {
  const env = makeEnv({ items: realItems(), archive: realArchive(), now: NOW });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, colorScheme });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_|net::/.test(m.text())) errors.push(m.text()); });
  await page.route(/^https?:/, r => r.abort()); // no network: sounds fail quietly
  const state = { failOn };
  await page.exposeFunction('__backend', async (name, args) => {
    await new Promise(r => setTimeout(r, 30));
    if (state.failOn === name) return { error: 'Simulated failure.' };
    try { return { ok: JSON.parse(JSON.stringify(env.ctx[name](...args) ?? null)) }; }
    catch (e) { return { error: e.message }; }
  });
  await page.addInitScript(startParam => {
    const runner = (ok, fail) => new Proxy({}, { get: (_, prop) => {
      if (prop === 'withSuccessHandler') return f => runner(f, fail);
      if (prop === 'withFailureHandler') return f => runner(ok, f);
      return (...args) => window.__backend(prop, args).then(r => r.error ? fail && fail(new Error(r.error)) : ok && ok(r.ok));
    }});
    window.google = { script: { run: runner(null, null), url: { getLocation: cb => setTimeout(() => cb({ parameter: startParam ? { page: startParam } : {} }), 0) } } };
  }, startPage);
  await page.goto(FILE);
  return { env, browser, page, errors, state };
}
const row = (env, id) => env.sheets.Items.grid.find(r => r[0] === id);
const toastText = page => page.locator('#toast').textContent();

test('Add tab: default tab, save with High, error cases, draft kept', async () => {
  const { env, browser, page, errors, state } = await open();
  try {
    await page.waitForSelector('#pAdd.on');
    assert.equal(await page.locator('#tabs button.on').textContent(), 'Add');
    assert.equal(await page.locator('#save').textContent(), 'Save task');

    await page.click('#save');
    assert.match(await toastText(page), /Type or say a task first/);

    await page.fill('#txt', 'Sharpen the hatchet before Saturday');
    await page.check('#hi');
    await page.click('#save');
    await page.waitForFunction(() => /Saved as T-029/.test(document.querySelector('#toast').textContent));
    assert.equal(await page.inputValue('#txt'), '');
    assert.equal(await page.isChecked('#hi'), false);
    assert.match(await page.locator('#recent').textContent(), /T-029 · High · Sharpen the hatchet/);
    assert.deepEqual(row(env, 'T-029').slice(0, 4), ['T-029', 'Sharpen the hatchet before Saturday', 'High', 'Open']);

    state.failOn = 'addItem';
    await page.fill('#txt', 'This one fails');
    await page.click('#save');
    await page.waitForFunction(() => /Not saved/.test(document.querySelector('#toast').textContent));
    assert.equal(await page.inputValue('#txt'), 'This one fails', 'text stays in the box on failure');
    assert.equal(await page.isEnabled('#save'), true);

    await page.reload();
    await page.waitForSelector('#pAdd.on');
    assert.equal(await page.inputValue('#txt'), 'This one fails', 'draft survives a reload');

    const sw = await page.evaluate(() => document.documentElement.scrollWidth);
    assert.ok(sw <= 390, 'no horizontal scroll, got ' + sw);
    await page.screenshot({ path: path.join(__dirname, 'shots', 'add.png') });
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('List tab: open items, High first, stale badges, repaired date', async () => {
  const { env, browser, page, errors } = await open({ page: 'list' });
  try {
    env.ctx.addItem('Urgent: renew truck tags', false);
    await page.click('#listReload');
    await page.waitForSelector('.row');
    assert.equal(await page.locator('#listCount').textContent(), '9 open');
    const first = await page.locator('.row').first().textContent();
    assert.match(first, /High.*T-029/);
    assert.equal(await page.locator('.badge.stale').count(), 3);
    assert.match(await page.locator('.row', { hasText: 'T-024' }).textContent(), /6 days/);
    assert.match(await page.locator('.row', { hasText: 'T-028' }).textContent(), /1 day$|1 day[^s]/);
    await page.screenshot({ path: path.join(__dirname, 'shots', 'list.png') });
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('Swipe tab: drag, buttons, go back, reviewed cards hidden, show all', async () => {
  const { env, browser, page, errors } = await open({ page: 'swipe' });
  try {
    await page.waitForSelector('.card:not(.under)');
    assert.equal(await page.locator('#count').textContent(), '8 left');
    assert.match(await page.locator('.card:not(.under) h2').textContent(), /Clean the shed/, 'oldest first when no High');
    await page.screenshot({ path: path.join(__dirname, 'shots', 'swipe.png') });

    // Drag the top card right with a pointer: Done.
    const box = await page.locator('.card:not(.under)').boundingBox();
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy); await page.mouse.down();
    await page.mouse.move(cx + 80, cy, { steps: 5 });
    const stampOpacity = await page.locator('.card:not(.under) .sYes').evaluate(e => +e.style.opacity);
    assert.ok(stampOpacity > 0.5, 'DONE stamp shows while dragging');
    await page.mouse.move(cx + 200, cy, { steps: 5 }); await page.mouse.up();
    await page.waitForFunction(() => document.querySelector('#count').textContent === '7 left');
    await page.waitForTimeout(150);
    assert.equal(row(env, 'T-001')[3], 'Done');
    assert.equal(row(env, 'T-001')[11], 'Done 2026-10-30');

    // Small drag snaps back and writes nothing.
    const writes = env.sheets.Items.writes.length;
    await page.waitForSelector('.card:not(.under)');
    await page.mouse.move(cx, cy); await page.mouse.down(); await page.mouse.move(cx + 40, cy + 20, { steps: 3 }); await page.mouse.up();
    await page.waitForTimeout(300);
    assert.equal(env.sheets.Items.writes.length, writes);
    assert.equal(await page.locator('#count').textContent(), '7 left');

    // Drawer buttons.
    await page.click('#handle');
    await page.waitForFunction(() => document.querySelector('#drawer').classList.contains('open'));
    await page.click('#btns button[data-d="U"]');
    await page.waitForTimeout(500);
    assert.equal(row(env, 'T-015')[2], 'High');
    await page.click('#btns button[data-d="D"]');
    await page.waitForTimeout(500);
    assert.equal(row(env, 'T-016')[3], 'Open');
    assert.equal(row(env, 'T-016')[11], 'In process 2026-10-30');
    assert.equal(await page.locator('#count').textContent(), '5 left');

    // Go back undoes the last swipe in the Sheet and returns the card.
    await page.click('#back');
    await page.waitForFunction(() => document.querySelector('#count').textContent === '6 left');
    await page.waitForTimeout(100);
    assert.equal(row(env, 'T-016')[11], '');
    assert.match(await page.locator('.card:not(.under) h2').textContent(), /George and Zelda/);

    // Keyboard arrows work on the swipe tab.
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(500);
    assert.equal(row(env, 'T-016')[11], 'Not done 2026-10-30');

    // Reload hides cards reviewed today; show all brings them back.
    await page.click('#dclose');
    await page.waitForFunction(() => !document.querySelector('#drawer').classList.contains('open'));
    assert.equal(await page.locator('#handle').textContent(), '▲ buttons');
    await page.click('#reload');
    await page.waitForFunction(() => /left/.test(document.querySelector('#count').textContent));
    assert.equal(await page.locator('#count').textContent(), '5 left', '7 open minus T-015 and T-016 reviewed today');
    await page.click('#all');
    await page.waitForFunction(() => document.querySelector('#count').textContent === '7 left');

    // Swipe every card: the empty message shows.
    await page.click('#all'); await page.waitForFunction(() => document.querySelector('#count').textContent === '5 left');
    for (let i = 0; i < 5; i++) { await page.keyboard.press('ArrowLeft'); await page.waitForTimeout(480); }
    assert.equal(await page.locator('#count').textContent(), '0 left');
    assert.equal(await page.locator('#empty').isVisible(), true);

    const sw = await page.evaluate(() => document.documentElement.scrollWidth);
    assert.ok(sw <= 390, 'no horizontal scroll');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('Swipe failure puts the card back and shows the error', async () => {
  const { env, browser, page, errors, state } = await open({ page: 'swipe' });
  try {
    await page.waitForSelector('.card:not(.under)');
    state.failOn = 'swipe';
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(() => /Not saved/.test(document.querySelector('#toast').textContent));
    await page.waitForTimeout(500);
    assert.equal(await page.locator('#count').textContent(), '8 left');
    assert.match(await page.locator('.card:not(.under) h2').textContent(), /Clean the shed/);
    assert.equal(row(env, 'T-001')[3], 'Open');
    // Go back after a failed swipe does nothing harmful.
    await page.click('#handle'); await page.click('#back'); await page.waitForTimeout(200);
    assert.equal(await page.locator('#count').textContent(), '8 left');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('Tabs switch, sound toggle saves, light mode renders', async () => {
  const { browser, page, errors } = await open({ colorScheme: 'light' });
  try {
    await page.waitForSelector('#pAdd.on');
    await page.click('#tSwipe'); await page.waitForSelector('#pSwipe.on');
    assert.equal(await page.locator('#pAdd').isVisible(), false);
    await page.click('#snd');
    assert.equal(await page.locator('#snd').textContent(), 'sound off');
    assert.equal(await page.evaluate(() => localStorage['swipe-mute']), '1');
    await page.click('#handle');
    await page.click('#tList'); await page.waitForSelector('#pList.on');
    assert.equal(await page.evaluate(() => document.querySelector('#drawer').classList.contains('open')), false, 'drawer closes when leaving Swipe');
    await page.waitForSelector('.row');
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    assert.equal(bg, 'rgb(243, 244, 247)');
    await page.screenshot({ path: path.join(__dirname, 'shots', 'list-light.png') });
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
