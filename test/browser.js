// Opens the real Index.html in Chromium at phone size.
// google.script.run is replaced by a bridge to the real server code running on the fake Sheet.
const path = require('path');
const { chromium } = require('playwright');
const { makeEnv, realItems, realArchive } = require('./mock-gas');

const FILE = 'file://' + path.join(__dirname, '..', 'apps-script', 'Index.html');
const NOW = '2026-10-30T16:00:00Z';

async function open({ page: startPage = '', failOn = null, colorScheme = 'dark', now = NOW, seed = {}, clock = null } = {}) {
  const env = makeEnv({ items: realItems(), archive: realArchive(), now, ...seed });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, colorScheme, timezoneId: 'America/New_York' });
  const page = await ctx.newPage();
  if (clock) await page.clock.setFixedTime(new Date(clock)); // the phone's clock, for quick picks
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
module.exports = { open };
