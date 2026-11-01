// Tests the scheduler panel in the real Index.html (List tab, Swipe drawer, Buy tab).
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { open } = require('./browser');
const { BUY_HEAD } = require('./mock-gas');

const NOW = '2026-11-01T17:00:00Z';   // server: Sunday Nov 1, 12:00 PM Eastern
const CLOCK = '2026-11-01T17:00:00Z'; // phone clock: the same moment
const waitToast = (page, re) => page.waitForFunction(r => new RegExp(r).test(document.querySelector('#toast').textContent), re.source);
const row = (env, id) => env.sheets.Items.grid.find(r => r[0] === id);

test('List tab: schedule with a quick pick, see it, move it, remove it', async () => {
  const { env, browser, page, errors } = await open({ page: 'list', now: NOW, clock: CLOCK });
  page.on('dialog', d => d.accept());
  try {
    await page.waitForSelector('.row');
    await page.click('[data-cal="T-026"]');
    await page.waitForSelector('#sch:not([hidden])');
    assert.equal(await page.locator('#schTitle').textContent(), 'Take off Monday November 16th');
    assert.match(await page.locator('#schNow').textContent(), /not scheduled yet/);
    assert.equal(await page.locator('#schRemove').isVisible(), false);

    // Sunday at noon: today 7 PM, tomorrow 7 PM, next Sat 9 AM, TODAY 4:30 PM (not past yet).
    const quick = await page.locator('#schQuick .chip').allTextContents();
    assert.deepEqual(quick, ['Today · 7 PM', 'Tomorrow · 7 PM', 'Sat Nov 7 · 9 AM', 'Sun Nov 1 · 4:30 PM']);
    const lens = await page.locator('#schLen .chip').allTextContents();
    assert.deepEqual(lens, ['15 min', '30 min', '1 hr', '2 hr', '3 hr']);

    // Schedule stays off until both a time and a length are picked (length: pick each time).
    assert.equal(await page.isDisabled('#schGo'), true);
    await page.click('#schQuick .chip >> text=Sun Nov 1');
    assert.equal(await page.inputValue('#schDate'), '2026-11-01');
    assert.equal(await page.inputValue('#schTime'), '16:30');
    assert.equal(await page.isDisabled('#schGo'), true, 'still no length');
    await page.click('#schLen .chip >> text=30 min');
    assert.equal(await page.isDisabled('#schGo'), false);
    await page.screenshot({ path: path.join(__dirname, 'shots', 'schedule.png') });
    await page.click('#schGo');
    await waitToast(page, /On your calendar: Sun Nov 1, 4:30 PM/);
    assert.equal(await page.locator('#sch').isVisible(), false);
    assert.equal(row(env, 'T-026')[12], '2026-11-01 16:30');
    assert.equal(env.calendar.live()[0].start.toISOString(), '2026-11-01T21:30:00.000Z');
    assert.match(await page.locator('.row', { hasText: 'T-026' }).textContent(), /📅 Sun Nov 1, 4:30 PM/);

    // Move it with the date and time fields.
    await page.click('[data-cal="T-026"]');
    assert.match(await page.locator('#schNow').textContent(), /On your calendar: Sun Nov 1, 4:30 PM/);
    assert.equal(await page.locator('#schRemove').isVisible(), true);
    await page.fill('#schDate', '2026-11-14'); await page.fill('#schTime', '08:15');
    await page.click('#schLen .chip >> text=2 hr');
    await page.click('#schGo');
    await waitToast(page, /Moved: Sat Nov 14, 8:15 AM/);
    assert.equal(env.calendar.live().length, 1);
    assert.equal(env.calendar.live()[0].end.toISOString(), '2026-11-14T15:15:00.000Z');

    // Cancel and the backdrop close without saving.
    await page.click('[data-cal="T-026"]'); await page.click('#schCancel');
    assert.equal(await page.locator('#sch').isVisible(), false);
    await page.click('[data-cal="T-026"]'); await page.mouse.click(195, 40);
    assert.equal(await page.locator('#sch').isVisible(), false);

    // Remove.
    await page.click('[data-cal="T-026"]'); await page.click('#schRemove');
    await waitToast(page, /Removed from your calendar/);
    assert.equal(env.calendar.live().length, 0);
    assert.doesNotMatch(await page.locator('.row', { hasText: 'T-026' }).textContent(), /📅 Sat/);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth) <= 390);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('Quick picks skip times already past (Sunday 6 PM)', async () => {
  const { browser, page, errors } = await open({ page: 'list', now: NOW, clock: '2026-11-01T23:00:00Z' });
  try {
    await page.waitForSelector('.row');
    await page.click('[data-cal="T-001"]');
    const quick = await page.locator('#schQuick .chip').allTextContents();
    assert.deepEqual(quick, ['Today · 7 PM', 'Tomorrow · 7 PM', 'Sat Nov 7 · 9 AM', 'Sun Nov 8 · 4:30 PM'], 'Sunday 4:30 PM already past, so next Sunday');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('Swipe drawer: Schedule the top card, then swipe Done puts ✓ on the event', async () => {
  const { env, browser, page, errors } = await open({ page: 'swipe', now: NOW, clock: CLOCK });
  try {
    await page.waitForSelector('.card:not(.under)');
    await page.click('#handle');
    assert.equal(await page.locator('#sched').textContent(), '📅 Schedule');
    await page.click('#sched');
    assert.equal(await page.locator('#schTitle').textContent(), 'Clean the shed this weekend');
    await page.click('#schQuick .chip >> text=Sat Nov 7');
    await page.click('#schLen .chip >> text=3 hr');
    await page.click('#schGo');
    await waitToast(page, /On your calendar: Sat Nov 7, 9:00 AM/);
    assert.match(await page.locator('.card:not(.under)').textContent(), /📅 Sat Nov 7, 9:00 AM/);
    assert.equal(await page.locator('#count').textContent(), '8 left', 'scheduling does not use up the card');
    await page.click('#btns button[data-d="R"]');
    await page.waitForTimeout(600);
    assert.equal(row(env, 'T-001')[3], 'Done');
    assert.equal(env.calendar.live()[0].title, '✓ Clean the shed this weekend');
    await page.click('#back');
    await page.waitForFunction(() => document.querySelector('#count').textContent === '8 left');
    await page.waitForTimeout(100);
    assert.equal(env.calendar.live()[0].title, 'Clean the shed this weekend');
    await page.screenshot({ path: path.join(__dirname, 'shots', 'swipe-drawer.png') });
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('Buy tab: Plan trip makes a store run with the items in the notes', async () => {
  const seed = { buy: [BUY_HEAD,
    ['B-001', 'Eggs', '2 dozen', 'Food Lion', 'Need', '2026-11-01', '', 'yes', ''],
    ['B-002', 'Duct tape', '', '', 'Need', '2026-11-01', '', '', '']] };
  const { env, browser, page, errors } = await open({ page: 'buy', now: NOW, clock: CLOCK, seed });
  try {
    await page.waitForSelector('.bi');
    assert.equal(await page.locator('[data-trip]').count(), 2);
    await page.click('[data-trip="Food Lion"]');
    assert.equal(await page.locator('#schTitle').textContent(), '🛒 Food Lion run');
    assert.equal(await page.locator('#schRemove').isVisible(), false);
    await page.click('#schQuick .chip >> text=Tomorrow');
    await page.click('#schLen .chip >> text=1 hr');
    await page.click('#schGo');
    await waitToast(page, /Food Lion run on your calendar: Mon Nov 2, 7:00 PM \(2 items\)/);
    const ev = env.calendar.live()[0];
    assert.equal(ev.title, '🛒 Food Lion run');
    assert.match(ev.description, /- Eggs \(2 dozen\)[\s\S]*No store set:\n- Duct tape/);
    await page.click('[data-trip=""]');
    assert.equal(await page.locator('#schTitle').textContent(), '🛒 Shopping run');
    await page.click('#schCancel');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('A failed schedule keeps the panel open with the error', async () => {
  const { env, browser, page, errors, state } = await open({ page: 'list', now: NOW, clock: CLOCK });
  try {
    await page.waitForSelector('.row');
    state.failOn = 'scheduleTask';
    await page.click('[data-cal="T-001"]');
    await page.click('#schQuick .chip >> text=Tomorrow'); await page.click('#schLen .chip >> text=15 min');
    await page.click('#schGo');
    await waitToast(page, /Not scheduled: Simulated failure/);
    assert.equal(await page.locator('#sch').isVisible(), true);
    assert.equal(await page.isDisabled('#schGo'), false, 'can try again');
    assert.equal(env.calendar.events.length, 0);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
