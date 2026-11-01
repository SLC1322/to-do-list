// A small fake of the Google Apps Script services that Code.gs and Mail.gs use.
// It lets the real server code run in Node against an in-memory copy of the Sheet.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

class FakeSheet {
  constructor(name, rows) { this.name = name; this.grid = rows.map(r => r.slice()); this.formats = {}; this.writes = []; }
  cell(r, c) { return (this.grid[r - 1] || [])[c - 1]; }
  put(r, c, v) {
    while (this.grid.length < r) this.grid.push([]);
    const row = this.grid[r - 1];
    while (row.length < c) row.push('');
    row[c - 1] = v; this.writes.push([r, c]);
  }
  getLastColumn() { return this.grid.reduce((m, r) => { let n = r.length; while (n && (r[n - 1] === '' || r[n - 1] == null)) n--; return Math.max(m, n); }, 0); }
  getLastRow() { let n = this.grid.length; while (n && !this.grid[n - 1].some(v => v !== '' && v != null)) n--; return n; }
  getDataRange() { return this.getRange(1, 1, Math.max(this.getLastRow(), 1), Math.max(this.getLastColumn(), 1)); }
  getRange(r, c, nr = 1, nc = 1) {
    const s = this;
    return {
      getValues() { const out = []; for (let i = 0; i < nr; i++) { const row = []; for (let j = 0; j < nc; j++) { const v = s.cell(r + i, c + j); row.push(v == null ? '' : v); } out.push(row); } return out; },
      getValue() { const v = s.cell(r, c); return v == null ? '' : v; },
      setValues(vals) {
        if (vals.length !== nr || vals.some(x => x.length !== nc)) throw new Error('setValues size mismatch');
        vals.forEach((row, i) => row.forEach((v, j) => s.put(r + i, c + j, v))); return this;
      },
      setValue(v) { s.put(r, c, v); return this; },
      setNumberFormat(f) { for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) s.formats[`${r + i},${c + j}`] = f; return this; }
    };
  }
}

function formatDate(d, tz, fmt) {
  if (fmt !== 'yyyy-MM-dd') throw new Error('fake formatDate only knows yyyy-MM-dd');
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

// Wall-clock time in a time zone -> real instant (like Utilities.parseDate).
function parseDate(str, tz, fmt) {
  if (fmt !== "yyyy-MM-dd'T'HH:mm") throw new Error('fake parseDate only knows yyyy-MM-ddTHH:mm');
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(str);
  if (!m) return null;
  const wall = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  const offsetAt = t => {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(t)).map(x => [x.type, x.value]));
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - t;
  };
  let t = wall - offsetAt(wall);
  t = wall - offsetAt(t);
  return new Date(t);
}
function formatDateFull(d, tz, fmt) {
  if (fmt === 'yyyy-MM-dd') return formatDate(d, tz, fmt);
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(d).map(x => [x.type, x.value]));
  if (fmt === 'yyyy-MM-dd HH:mm') return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
  if (fmt === "yyyy-MM-dd'T'HH:mm") return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
  throw new Error('fake formatDate does not know ' + fmt);
}

class FakeCalendar {
  constructor() { this.events = []; this.n = 0; }
  createEvent(title, start, end, opts = {}) {
    const ev = { id: 'ev' + (++this.n) + '@google.com', title, start: new Date(start), end: new Date(end), description: opts.description || '', reminders: [{ popup: 30 }], deleted: false };
    const api = {
      getId: () => ev.id, getTitle: () => ev.title, setTitle: t => { ev.title = t; return api; },
      setTime: (a, b) => { ev.start = new Date(a); ev.end = new Date(b); return api; },
      removeAllReminders: () => { ev.reminders = []; return api; },
      addPopupReminder: m => { ev.reminders.push({ popup: m }); return api; },
      deleteEvent: () => { ev.deleted = true; }
    };
    ev.api = api; this.events.push(ev); return api;
  }
  getEventById(id) { const ev = this.events.find(e => e.id === id && !e.deleted); return ev ? ev.api : null; }
  live() { return this.events.filter(e => !e.deleted); }
}

function makeEnv({ items, archive, buy = [BUY_HEAD], wish = [WISH_HEAD], mail = [], now } = {}) {
  const sheets = { Items: new FakeSheet('Items', items), Archive: new FakeSheet('Archive', archive), Buy: new FakeSheet('Buy', buy), Wishlist: new FakeSheet('Wishlist', wish) };
  const props = {};
  const calendar = new FakeCalendar();
  const triggers = [];
  const labels = {};
  let lockHeld = false;
  const RealDate = Date;
  const ctx = {
    console,
    Date: now ? class extends RealDate { constructor(...a) { if (a.length) super(...a); else super(now); } static now() { return new RealDate(now).getTime(); } } : RealDate,
    SpreadsheetApp: { openById: () => ({ getSheetByName: n => sheets[n] || null }) },
    LockService: { getScriptLock: () => ({ waitLock() { if (lockHeld) throw new Error('lock busy'); lockHeld = true; }, releaseLock() { lockHeld = false; } }) },
    Utilities: { formatDate: formatDateFull, parseDate },
    CalendarApp: { getDefaultCalendar: () => calendar, getCalendarById: () => null },
    HtmlService: { createHtmlOutputFromFile: f => ({ file: f, setTitle(t) { this.title = t; return this; }, addMetaTag(n, c) { this.meta = [n, c]; return this; } }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] ?? null, setProperty: (k, v) => { props[k] = v; } }) },
    ScriptApp: {
      getProjectTriggers: () => triggers.slice(),
      deleteTrigger: t => triggers.splice(triggers.indexOf(t), 1),
      newTrigger: fn => ({ timeBased: () => ({ everyMinutes: m => ({ create: () => { const t = { fn, m, getHandlerFunction: () => fn }; triggers.push(t); return t; } }) }) })
    },
    GmailApp: {
      getUserLabelByName: n => labels[n] || null,
      createLabel: n => (labels[n] = { name: n }),
      search: () => {
        const byThread = {};
        mail.forEach(m => (byThread[m.thread] = byThread[m.thread] || []).push(m));
        return Object.values(byThread).map(ms => ({
          labels: [],
          addLabel(l) { this.labels.push(l.name); },
          getMessages: () => ms.map(m => ({ getId: () => m.id, isInTrash: () => !!m.trash, getFrom: () => m.from, getTo: () => m.to || 'scampbell1322+track@gmail.com', getCc: () => '', getSubject: () => m.subject || '', getPlainBody: () => m.body || '' }))
        }));
      }
    }
  };
  vm.createContext(ctx);
  const dir = path.join(__dirname, '..', 'apps-script');
  vm.runInContext(fs.readFileSync(path.join(dir, 'Code.gs'), 'utf8'), ctx, { filename: 'Code.gs' });
  for (const f of ['Shop.gs', 'Calendar.gs', 'Mail.gs']) vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), ctx, { filename: f });
  return { ctx, sheets, props, triggers, calendar, isLocked: () => lockHeld };
}

// Copy of the real Items and Archive tabs as read on 2026-10-30 (after the date fix),
// plus the raw 46319 serial on one row to test the date repair.
const BUY_HEAD = ['ID', 'Item', 'Qty', 'Store', 'Status', 'Added', 'Got date', 'Usual', 'Notes'];
const WISH_HEAD = ['ID', 'Item', 'Est. price', 'Target price', 'Watch for', 'Why', 'Link', 'Status', 'Added', 'Closed date'];
const HEAD = ['ID', 'Item', 'Priority', 'Status', 'First seen', 'Last mentioned', 'Mentions', 'Done date', 'Possible dupe of', 'Stale', 'Outcome'];
function realItems() {
  return [
    HEAD,
    ['T-001', 'Clean the shed this weekend', '', 'Open', '2026-09-19', '2026-09-19', '1', '', '', 'Stale'],
    ['T-015', 'Look into NRCS soil conservation grants', '', 'Open', '2026-10-10', '2026-10-10', '1', '', '', 'Stale'],
    ['T-016', 'Look into and enroll George and Zelda into Trump child accounts', '', 'Open', '2026-10-10', '2026-10-10', '1', '', '', 'Stale'],
    ['T-021', 'Mull over the idea of a GitHub Action ...', '', 'Done', '2026-10-18', '2026-10-18', '1', '2026-10-28', '', '', 'Built; needs revisions after testing.'],
    ['T-022', 'Cancel Lime subscription', '', 'Done', '2026-10-23', '2026-10-23', '1', '2026-10-28', '', '', 'Complete; canceled 2026-10-24.'],
    ['T-023', 'During TEVV testing, test agents with prompt injections.', '', 'Open', '2026-10-23', '2026-10-23', '1'],
    ['T-024', 'Present the three initiatives from the Tuesday conference', '', 'Open', 46319, 46319, '1'],
    ['T-025', 'Do a trip report for the Washington, DC government conference', '', 'Done', '2026-10-24', '2026-10-24', '1', '2026-10-28', '', '', 'Completed; sent to supervisor Monday 2026-10-26.'],
    ['T-026', 'Take off Monday November 16th', '', 'Open', '2026-10-25', '2026-10-25', '1'],
    ['T-027', 'Revise the hunting gameplan page after testing.', '', 'Open', '2026-10-28', '2026-10-28', '1'],
    ['T-028', 'Get Gail certification.', '', 'Open', '2026-10-29', '2026-10-29', '1']
  ];
}
function realArchive() {
  const rows = [HEAD.slice(0, 9)];
  for (const n of [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 17, 18, 19, 20]) rows.push(['T-' + String(n).padStart(3, '0'), 'archived ' + n, '', 'Done', '2026-09-20', '2026-09-20', '1', '2026-10-16', '']);
  return rows;
}

module.exports = { makeEnv, realItems, realArchive, HEAD, BUY_HEAD, WISH_HEAD };
