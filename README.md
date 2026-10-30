# Master To-Do

A phone web app for the "Master Task List" Google Sheet. It has three tabs:

| Tab | What it does | What it writes to the Sheet (Items tab) |
|---|---|---|
| **Add** | Type or dictate a task, optionally mark it High, then save. | A new row: next T-number, Status "Open", today's date as text. |
| **Swipe** | The Sunday review deck. It loads open tasks live from the Sheet. | → Done: Status "Done" + Done date. ↑ Escalate: Priority "High". ↓ In process and ← Not done: only column L, "Last review". Every swipe also writes column L (for example "In process 2026-11-01"). |
| **List** | A read-only list of open tasks. High first, then oldest. | Nothing. |

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
8. Press **Ctrl+S** to save.
9. Click **Deploy → New deployment**.
10. Click the gear icon next to **Select type**. Click **Web app**.
11. Set **Description** to `v1`. Set **Execute as** to **Me**. Set **Who has access** to **Only myself**.
12. Click **Deploy**. Click **Authorize access**. Choose your Google account.
13. Google shows "Google hasn't verified this app." This is normal for a script you made. Click **Advanced**, then **Go to Master To-Do (unsafe)**, then **Allow**.
14. Copy the **Web app URL**. It ends in `/exec`. Email it to yourself.

### Part 2: Add it to the phone home screen

1. On the phone, open the URL in Chrome. Use the same Google account.
2. Add `?page=add` to the end of the URL. Example: `https://script.google.com/macros/s/.../exec?page=add`. Load it.
3. Tap Chrome's **⋮** menu → **Add to Home screen**. Name it `Add task`.
4. Repeat with `?page=swipe`. Name it `Sunday review`.

If the page says "Sorry, unable to open the file," Chrome is signed in to more than one Google account. Open the link in an Incognito tab signed in to this account only, or sign out of the other accounts.

### Part 3: First-run check (5 minutes)

Do each step and confirm the result in the Sheet.

1. **Add** tab: type `test task`. Tap **Save task**. Expect "Saved as T-0xx". Expect a new row at the bottom of the Items tab.
2. **Swipe** tab: find the test card. Swipe it right. Expect Status "Done" and today's date in "Done date". Expect a new column L, "Last review".
3. Open the drawer (**▲ buttons**). Tap **↶ Go back**. Expect the row to return to "Open".
4. Delete the test row from the Sheet by hand.

### Updating the code later

Paste the new code, save, then click **Deploy → Manage deployments → pencil icon → Version: New version → Deploy**. This keeps the same URL, so the home-screen icons keep working. Do **not** use "New deployment" again; that makes a new URL.

## Optional: email bridge (share button and, maybe, the watch)

Gmail delivers mail sent to `scampbell1322+track@gmail.com` to your normal inbox. With `Mail.gs` installed, the app checks for those emails every 5 minutes and adds each one as a task.

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

`npm test` runs 20 tests:

- **Server (15):** the real `Code.gs` and `Mail.gs` run against a copy of the real Items and Archive rows (as of 2026-10-30). They check IDs, text-format dates, the High word rule, column J never written, layout protection, every swipe direction, undo, lookup by ID after rows move, and the email sender filter.
- **Page (5):** the real `Index.html` in Chromium at phone size (390 × 844), connected to the same server code. They check all three tabs, drag and button swipes, Go back, failure handling, draft saving, no sideways scroll, and dark and light mode.

Not tested: the live Google deployment, your phone's Chrome, and the watch.
