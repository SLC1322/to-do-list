# Master To-Do

A phone web app for the "Master Task List" Google Sheet. It has five tabs:

| Tab | What it does | What it writes to the Sheet (Items tab) |
|---|---|---|
| **Add** | Type or dictate a task, optionally mark it High, then save. | A new row: next T-number, Status "Open", today's date as text. |
| **Swipe** | The Sunday review deck. It loads open tasks live from the Sheet. The drawer has a **📅 Schedule** button for the top card. | → Done: Status "Done" + Done date. ↑ Escalate: Priority "High". ↓ In process and ← Not done: only column L, "Last review". Every swipe also writes column L (for example "In process 2026-11-01"). |
| **List** | Open tasks, High first, then oldest. Tap 📅 on a task to put it on your calendar. | Only when you schedule: column M "Scheduled" and column N "Event ID". |
| **Buy** | Short-term buy list, grouped by store. Tap an item when you get it. ★ marks a "usual" item; ✕ removes an item. **📅 Plan trip** beside a store name puts a store run on your calendar. | **Buy** tab: B-001 and up. Got items stay for 7 days under "Got in the last 7 days" (tap to put back). Usual items become one-tap "add again" chips. |
| **Want** | Long-term wishlist. Tap a card to show the reason, the link, and the buttons: **Buy list**, **Bought**, **Drop**. | **Wishlist** tab: W-001 and up. Prices are numbers. Closed items show under "show closed". |

The nightly "Daily Notes" job keeps working as before. The app follows the job's rules:

- It writes columns A–I in the same order and format. It never writes column J (the Stale formula) or K (Outcome).
- "In process" does **not** change Status. Status stays "Open", so the nightly job can still merge new `track:` mentions into that task.
- Done tasks still go to the Archive tab through the nightly job, 7 days after the Done date.
- If someone moves columns A–I, the app refuses to write and shows an error.

## Files

| File | What it is |
|---|---|
| `apps-script/Code.gs` | Server code. It reads and writes the Sheet. Settings block at the top. |
| `apps-script/Index.html` | The page. Colors, text, and sounds are in the settings block at the top. |
| `apps-script/Shop.gs` | Server code for the Buy and Wishlist tabs. The store list is in its settings block. |
| `apps-script/Calendar.gs` | Server code for scheduling. The reminder time and the ✓ mark are in its settings block. |
| `apps-script/Mail.gs` | Optional. Turns emails to `scampbell1322+track@gmail.com` into tasks. Add it only after the app works. |
| `test/` | Tests that run the real code against a copy of the Sheet. |

## Setup (one time, about 15 minutes, on a computer)

The Apps Script editor does not work well on a phone. Do Part 1 on a computer.

### Part 1: Install the app (computer)

1. Open the **Master Task List** Google Sheet.
2. Click **Extensions → Apps Script**. A new tab opens.
3. Click **Untitled project** at the top left. Type `Master To-Do`. Click **Rename**.
4. Click the file **Code.gs** in the left panel. Delete all its text.
5. Open `apps-script/Code.gs` in this repo. Click **Raw**. Copy all the text. Paste it into the editor.
6. In the left panel, click **+** next to **Files**. Click **HTML**. Type `Index` (no ".html"). Press Enter.
7. Delete all the text in the new file. Paste all the text of `apps-script/Index.html` from this repo.
8. Click **+** next to **Files** again. Click **Script**. Type `Shop`. Press Enter. Delete its text and paste `apps-script/Shop.gs`.
9. Do the same for a script named `Calendar`. Paste `apps-script/Calendar.gs`.
10. Press **Ctrl+S** to save.
11. Click **Deploy → New deployment**.
12. Click the gear icon next to **Select type**. Click **Web app**.
13. Set **Description** to `v1`. Set **Execute as** to **Me**. Set **Who has access** to **Only myself**.
14. Click **Deploy**. Click **Authorize access**. Choose your Google account.
15. Google shows "Google hasn't verified this app." This is normal for a script you made. Click **Advanced**, then **Go to Master To-Do (unsafe)**. Google lists two permissions: your spreadsheets and your calendars. Click **Allow**.
16. Copy the **Web app URL**. It ends in `/exec`. Email it to yourself.

### Part 2: Add it to the phone home screen

1. On the phone, open the URL in Chrome. Use the same Google account.
2. Add `?page=add` to the end of the URL. Example: `https://script.google.com/macros/s/.../exec?page=add`. Load it.
3. Tap Chrome's **⋮** menu → **Add to Home screen**. Name it `Add task`.
4. Repeat with `?page=swipe`. Name it `Sunday review`.
5. Optional: repeat with `?page=buy` (name it `Buy list`) and `?page=want` (name it `Wishlist`).

If the page says "Sorry, unable to open the file," Chrome is signed in to more than one Google account. Open the link in an Incognito tab signed in to this account only, or sign out of the other accounts.

### Part 3: First-run check (5 minutes)

Do each step and confirm the result in the Sheet.

1. **Add** tab: type `test task`. Tap **Save task**. Expect "Saved as T-0xx". Expect a new row at the bottom of the Items tab.
2. **Swipe** tab: find the test card. Swipe it right. Expect Status "Done" and today's date in "Done date". Expect a new column L, "Last review".
3. Open the drawer (**▲ buttons**). Tap **↶ Go back**. Expect the row to return to "Open".
4. Delete the test row from the Sheet by hand.
5. **Buy** tab: add `test item` with store Walmart. Expect a row B-001 in the Buy tab. Tap it. Expect Status "Got".
6. **Want** tab: add `test want` with price 10. Expect a row W-001 in the Wishlist tab. Tap the card, tap **Drop**.
7. Delete the two test rows by hand.
8. **List** tab: tap 📅 on any task. Tap a quick pick and a length. Tap **Schedule**. Expect the event in Google Calendar with a 10-minute reminder.
9. Tap 📅 on the same task again. Tap **Remove from calendar**. Expect the event to disappear.

### Updating the code later

Paste the new code, save, then click **Deploy → Manage deployments → pencil icon → Version: New version → Deploy**. This keeps the same URL, so the home-screen icons keep working. Do **not** use "New deployment" again; that makes a new URL.

## Scheduling

- **Tasks:** tap 📅 (List tab) or **📅 Schedule** (Swipe drawer). Pick a quick time or set the date and time, then pick a length. The length is not preset: you choose it each time.
- **Moving:** schedule the same task again. The app moves the existing event; it does not make a second one.
- **Done:** when you swipe a scheduled task Done, its event title gets a ✓ in front. **Go back** removes the ✓. A calendar problem never blocks the swipe; you get a message instead.
- **Shopping trips:** **📅 Plan trip** beside a store name on the Buy tab. The event is "🛒 Food Lion run" (for example). Its notes list that store's items plus items with no store, **as of the moment you schedule it**. Items added later are not added to the event; open the app at the store.
- **Calendar:** your main Google Calendar. A popup reminder fires 10 minutes before, and your watch buzzes if it shows phone notifications.
- **Limits:** a task finished by voice (`~~track: ...~~`) gets no ✓; only the app adds the ✓. The quick picks use your phone's clock.

## Voice through Claude

The nightly "Daily Notes" job (11:45 PM) handles three labels:

| You say | Where it goes | Example |
|---|---|---|
| `track: ...` | Items (a task) | `track: call the farrier` |
| `buy: ...` | Buy tab. A store name and a quantity in the sentence are picked out. | `buy: 2 dozen eggs at Food Lion` |
| `want: ...` | Wishlist tab. A price, a target price, a sale to wait for, and a reason are picked out. | `want: cellular trail cam, about $120, target $80, wait for Black Friday, to watch the feed bins` |

`~~buy: eggs~~` (struck through) marks eggs as Got. Voice items reach the Sheet after the nightly run, not at once. For instant adds, use the app.

What changed in the job's instructions is in `docs/nightly-job-changes.md`.

## Optional: email bridge (share button and, maybe, the watch)

Gmail delivers mail sent to `scampbell1322+track@gmail.com`, `+buy@`, and `+want@` to your normal inbox. With `Mail.gs` installed, the app checks for those emails every 5 minutes. A `+track` email becomes a task, a `+buy` email goes on the Buy list, and a `+want` email goes on the Wishlist. Text that starts with `buy:` or `want:` goes to that list, whatever the address.

- From any phone app: **Share → Gmail** → send to that address.
- From the watch: only if the watch can send an email (see the test below).
- Only mail **from** an address in `ALLOWED_SENDERS` is accepted. Mail from anyone else is ignored.

Watch test (do this first):

1. On the watch, try to send a dictated message to `scampbell1322+track@gmail.com` with the text `track: test from watch`.
2. Check Gmail on the phone. Note the **From** address of the message that arrived.
3. If the From address is not `scampbell1322@gmail.com`, add it to `ALLOWED_SENDERS` in `Mail.gs`.

Install:

1. In the Apps Script editor, click **+ → Script**. Name it `Mail`. Paste `apps-script/Mail.gs`. Save.
2. At the top, choose the function **installMailCheck** in the drop-down. Click **Run**.
3. Approve the Gmail permission (same "unverified app" steps as above).
4. To stop it later, run **removeMailCheck**.

## Tests

`npm test` runs 54 tests:

- **Tasks, server (15):** the real `Code.gs` and `Mail.gs` run against a copy of the real Items and Archive rows (as of 2026-10-30). They check IDs, text-format dates, the High word rule, column J never written, layout protection, every swipe direction, undo, lookup by ID after rows move, and the email sender filter.
- **Shopping, server (13):** the real `Shop.gs` on fake Buy and Wishlist tabs. They check IDs, store detection in text ("eggs at food lion"), re-use of an existing row, usual items, every status change, price parsing, refusing unsafe links, duplicate wishlist items, layout protection, rows written by the nightly job, and email routing by address and label.
- **Calendar, server (11):** the real `Calendar.gs` on a fake Google Calendar. They check the event time across the 2026-11-01 clock change and in summer time, the 10-minute reminder, columns L, M and N, moving instead of duplicating, a deleted event, removing, the ✓ on Done and its removal on Go back, a calendar error never blocking a swipe, bad dates and lengths, and shopping trip notes.
- **Page (15):** the real `Index.html` in Chromium at phone size (390 × 844), connected to the same server code. They check all five tabs, drag and button swipes, Go back, the Buy and Want flows from start to end, the scheduler from the List tab, the Swipe drawer and the Buy tab, quick picks on a fixed phone clock, failure handling, draft saving, HTML in item names shown as plain text, no sideways scroll, and dark and light mode.

Not tested: the live Google deployment, your phone's Chrome, and the watch.
