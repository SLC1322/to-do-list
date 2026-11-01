# Changes to the nightly "Daily Notes compile and send" job

Changed on 2026-11-01 so that `buy:` and `want:` messages reach the Buy and Wishlist tabs.

The task steps (2b, 2c, 2d rules, 2e, 2f) are unchanged. What changed:

| Step | Before | After |
|---|---|---|
| Overview | "merge tracked tasks" | "merge tracked tasks and shopping items" |
| Step 1 | log of "note:" / "track:" messages | adds "buy:" / "want:" |
| Tabs | Items, Archive, Run log | adds Buy (A–I) and Wishlist (A–J); adds "never write Items columns K and later" (the app's "Last review" column L) |
| 2a | only "track:" entries are processed | "track:", "buy:" and "want:" entries are processed; buy/want never become tasks |
| 2d | "For each remaining entry" | "For each remaining "track:" entry" |
| 2e2 | (new) | buy: → Buy tab (store and qty picked out, existing row re-used, struck-through = Got). want: → Wishlist (prices, target, watch-for, reason, link picked out; open duplicate skipped). Tab missing or header changed → skip and note it. |
| 2g | counts of new, merged, completed, archived | also buy and want counts |
| 2h | read back Items | also read back Buy and Wishlist when written |
| Final line | summary | also buy and want items |

To undo: ask Claude to remove step 2e2 and restore 2a to "Only entries whose content begins with "track:" become tasks."
