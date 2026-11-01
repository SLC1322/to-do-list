/* =====================================================================
   OPTIONAL EMAIL BRIDGE. Add this file only after the app works.
   It checks Gmail every 5 minutes. Each email from an allowed sender:
   - to TRACK_ADDRESS becomes a task,
   - to BUY_ADDRESS goes on the Buy list,
   - to WANT_ADDRESS goes on the Wishlist.
   Text that starts with "buy:" or "want:" goes to that list, whatever the address.
   Adding this file makes Google ask for Gmail access.

   SETTINGS: SAFE TO EDIT
   ===================================================================== */
var TRACK_ADDRESS   = 'scampbell1322+track@gmail.com'; // Send tasks to this address.
var BUY_ADDRESS     = 'scampbell1322+buy@gmail.com';   // Send buy-list items to this address.
var WANT_ADDRESS    = 'scampbell1322+want@gmail.com';  // Send wishlist items to this address.
var ALLOWED_SENDERS = ['scampbell1322@gmail.com'];      // Only mail FROM these addresses is accepted. Add your watch or phone sender here after the test.
var DONE_LABEL      = 'track-added';                    // Gmail label put on emails that were added to a list.
/* =====================================================================
   END OF SETTINGS. Everything below: leave alone.
   ===================================================================== */

// Run this once from the editor to start the 5-minute check.
function installMailCheck() {
  removeMailCheck();
  ScriptApp.newTrigger('checkTrackMail').timeBased().everyMinutes(5).create();
}

// Run this from the editor to stop the 5-minute check.
function removeMailCheck() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'checkTrackMail') ScriptApp.deleteTrigger(t);
  });
}

function checkTrackMail() {
  var props = PropertiesService.getScriptProperties();
  var seen = JSON.parse(props.getProperty('trackSeen') || '[]');
  var allowed = ALLOWED_SENDERS.map(function (a) { return a.toLowerCase().trim(); });
  var label = GmailApp.getUserLabelByName(DONE_LABEL) || GmailApp.createLabel(DONE_LABEL);
  var threads = GmailApp.search('{to:' + TRACK_ADDRESS + ' to:' + BUY_ADDRESS + ' to:' + WANT_ADDRESS + '} newer_than:3d', 0, 30);
  var added = 0;

  threads.forEach(function (thread) {
    var touched = false;
    thread.getMessages().forEach(function (m) {
      var mid = m.getId();
      if (seen.indexOf(mid) >= 0 || m.isInTrash()) return;
      var from = senderAddress_(m.getFrom());
      var text = mailText_(m.getSubject(), m.getPlainBody());
      if (allowed.indexOf(from) >= 0 && text) { // Mail not from you is ignored.
        route_(text, String(m.getTo()) + ',' + String(m.getCc ? m.getCc() : '')); // If this fails, the email stays unseen and is tried again in 5 minutes.
        added++;
        touched = true;
      }
      seen.push(mid);
      props.setProperty('trackSeen', JSON.stringify(seen.slice(-300))); // Save at once, so a later error cannot cause a duplicate.
    });
    if (touched) thread.addLabel(label);
  });

  props.setProperty('trackSeen', JSON.stringify(seen.slice(-300)));
  return added;
}

// Sends the text to the right list. The label in the text wins; otherwise the address decides.
function route_(text, recipients) {
  var to = recipients.toLowerCase();
  if (/^\s*buy\s*:/i.test(text)) return addBuy(text, '', '', false);
  if (/^\s*want\s*:/i.test(text)) return addWant({ item: text });
  if (to.indexOf(BUY_ADDRESS.toLowerCase()) >= 0) return addBuy(text, '', '', false);
  if (to.indexOf(WANT_ADDRESS.toLowerCase()) >= 0) return addWant({ item: text });
  return addItem(text, false);
}

function senderAddress_(from) {
  var m = /<([^>]+)>/.exec(String(from));
  return (m ? m[1] : String(from)).toLowerCase().trim();
}

// Uses the first paragraph of the body. If the body is empty, uses the subject.
function mailText_(subject, body) {
  var first = String(body || '').replace(/\r/g, '').split(/\n\s*\n/)[0].replace(/\s+/g, ' ').trim();
  var text = first || String(subject || '').trim();
  text = text.replace(/^\s*(re|fwd?)\s*:\s*/i, '').replace(/^\s*track\s*:\s*/i, '').trim();
  return text.slice(0, 1000);
}
