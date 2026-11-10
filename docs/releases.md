## v185 — הסעות, one shared plan: the code, shipped SHUT (candidate, not served)

**Not served until the merge and the Pages deployment are recorded here by the next release.**
Built on `990f5b4` (v184). **Nothing a person can see or do changes in this build.** The shared
plan is here to be merged, tested and reviewed; its gate is shut (`TRANSPORT_SHARE = false`,
`js/ui/transport-share.js`) and the rules that allow its documents are NOT published. Nothing in
`js/sync/sync.js`, `send.js`, `receive.js`, `restore.js`, `status.js`, `boot.js`, `js/model`,
`js/state.js`, `js/store.js` or `js/recovery.js`.

### What the owner chose

2026-11-10, having tried the screen on his own phone: "add the feature to the other accounts."
Offered two meanings - (a) each phone its own plans, (b) one shared plan - he answered «ب»:
ONE SHARED PLAN. He seats the men; the other two phones see the same cars and the same riders,
and may change them.

### The design, in short (`docs/transport-spec.md`, "Phase 3: shared", 3.1-3.13)

- **Documents of their own, beside the record and never in it:**
  `schedules/<doc>/transport/settings` (the list of vehicles, a vehicle's lasting `off` with it)
  and `schedules/<doc>/transport/day_<YYYY-MM-DD>` (who sits where, which vehicles stay, who gets
  there another way). Not a byte in the schedule document; none of the record's outbox, journal,
  receipts, fingerprints or status sentence. A transport write that is refused, lost or late is
  not an error of the record and holds none of its writes.
- **The day is the unit, and the server is the judge.** A write is a whole document that says
  which revision it was built on; the adapter checks it in a transaction and the rules check it
  again. Of two phones that built on the same revision one lands. Not a merge of seats: "a man is
  in one seat" is a rule about the whole day, and a merge of fields cannot see it.
- **The loser is shown the plan that won and told in one sentence**, his own copy put aside on
  his own disk first, with «להשתמש בשיבוץ שלי» (an ordinary change through the same check - there
  is no force-write) and «להשאיר את המשותף».
- **Offline first.** A change is on the phone at once, as today; one line under the head says
  whether what is drawn is shared and current, not up yet, could not be checked, or not shared.
- **The first meeting:** the cloud's wins if there is one; a phone that held something different
  keeps its copy aside and is told once. An untouched list of seven is not uploaded.
- **The switch stays per phone.** Off: nothing is read, heard or written. On with no cloud
  account: exactly today.
- **A driver's «נפתח בוואטסאפ» mark is not shared**: it is that phone's own tap.
- **The backup, the restore points and the rescue file carry none of it**, as before. With
  sharing ON a lost phone no longer loses the plans or the list; with it off (this build) it
  still does.
- **The seder's journey** (v184) reads the rides at its third and fourth stations; a plan
  adopted from another phone redraws its bar and its last look.

### The rules addition - NOT PUBLISHED

One block, nested in `match /schedules/{docId}` after the receipts. No existing line of
`firestore.rules` changes: with the block removed the file is `origin/main`'s byte for byte
(`tests/transport.emulator.test.mjs`).

```
      function transportStamped() {
        return request.resource.data.v == 1
          && request.resource.data.revision is int
          && request.resource.data.updatedAt is string
          && request.resource.data.updatedAt.size() < 64
          && request.resource.data.updatedBy is string
          && request.resource.data.updatedBy.size() < 128;
      }

      function transportSettingsOk() {
        return request.resource.data.keys().hasOnly(['v', 'revision', 'updatedAt', 'updatedBy', 'vehicles'])
          && request.resource.data.vehicles is list
          && request.resource.data.vehicles.size() <= 60;
      }

      function transportDayOk(name) {
        return name.matches('^day_[0-9]{4}-[0-9]{2}-[0-9]{2}$')
          && request.resource.data.keys().hasOnly(
               ['v', 'revision', 'updatedAt', 'updatedBy', 'date', 'unavailable', 'status', 'trips'])
          && request.resource.data.date is string
          && name == 'day_' + request.resource.data.date
          && request.resource.data.unavailable is map
          && request.resource.data.unavailable.size() <= 60
          && request.resource.data.status is map
          && request.resource.data.status.size() <= 300
          && request.resource.data.trips is map
          && request.resource.data.trips.size() <= 60;
      }

      function transportOk(name) {
        return transportStamped()
          && (name == 'settings' ? transportSettingsOk() : transportDayOk(name));
      }

      match /transport/{name} {
        allow read: if allowed();
        allow create: if allowed()
          && transportOk(name)
          && request.resource.data.revision == 1;
        allow update: if allowed()
          && transportOk(name)
          && request.resource.data.revision == resource.data.revision + 1;
        allow delete: if false;
      }
```

The three addresses of `allowed()` may read; create at revision 1; update at exactly the next
revision; never delete. Rules cannot walk the inside of a trip or a vehicle, nor tell a real
calendar date from `day_2026-13-45`; every client does both as it reads.

### THE ROLLOUT ORDER, measured

`tests/transport.emulator.test.mjs` on the Firestore emulator: the rules as they would be pasted
and the rules in the field today (`origin/main:firestore.rules`); this build's client and the
production adapter; v180 and v182 with their own files and their own adapter, out of Git; and
every emulator suite that existed before, unchanged, under the new file.

| client | rules | records a day | the shared plans | what הסעות says |
|---|---|---|---|---|
| older (v180, v182) | new | yes, synced | never touched: its adapter has no call to them | nothing - its own plans, on its own phone |
| this build, gate shut (v185 as shipped) | either | yes | never called (counted, in Node and in Chromium) | today's screen |
| gate open | today's | yes, at its own revision, no error on the record's line | cannot be created: `permission-denied`, nothing under the path | «השיבוץ עדיין לא משותף: הענן אינו מאפשר זאת כרגע. הוא שמור במכשיר הזה בלבד.» |
| gate open | new | yes; the schedule document, its revision and its receipts do not move | shared | «השיבוץ משותף עם הטלפונים האחרים ומעודכן.» |

Every cell is safe in any order. The order, for the one thing that is not symmetric (step 5):

1. **Save what is live**: Firebase console → Firestore Database → Rules; compare with
   `origin/main:firestore.rules`. If they differ, stop.
2. **Publish the new rules.** No phone needs to update first and none is refused anything.
3. **Serve this build** (gate shut). Steps 2 and 3 can be done in either order.
4. **Update all three phones**, and check each in ⋯.
5. **Only then open the gate**, in a later build - and **the owner's phone takes that build
   first**, opened, signed in, with a signal. Sharing begins when the app opens signed in with
   the switch on, not when the הסעות screen is opened, and the first phone with an edited list or
   a planned day becomes the author of the shared one. If another phone gets there first nothing
   is lost - he is told once and «להשתמש ברשימה שלי» puts his back.

AND ONE RULE FOR THE DAY THE GATE OPENS, because of v184's `off` field: **no window of v183 or
older may run on a phone that shares.** Such a build drops `off` from the list at its next change
to it; this build cannot tell that from a person turning the vehicle on, sends it as this
phone's change, and the vehicle is on again on all three phones (measured with v180's real
bytes, `tests/transport.share.test.mjs`). Nothing else is lost by it.

Gate opened before the rules are published: every phone says «עדיין לא משותף», keeps its plans,
and finds out by itself when the rules arrive. Rules rolled back: the shared documents stay,
unreachable; phones go on from their own copies; the record is not affected.

### Hebrew - PROPOSED, not read by the owner, and shown nowhere in this build

Eighteen strings in the transport words block, pinned word for word in
`tests/transport.test.mjs`: `switchLeadShared`, the six lines of the status (`shareChecking`,
`shareShared`, `shareWaiting`, `shareUnchecked`, `shareNotShared`, `shareNoRoom`), the four
notices (`shareChangedDay`, `shareChangedList`, `shareFirstDay`, `shareFirstList`) and the seven
words of their buttons and question. None says «נשלח», «מסונכרן» or «ממתין». No existing string
changed.

### Moved expectations

`tests/transport.test.mjs`: the block that said none of it leaves the phone - "no cloud" - now
says never the RECORD's cloud, and, the gate shut, not the transport documents either (counted);
the words block gains the eighteen keys; every block runs with the share file loaded and shut.

### Known not covered

Not tried on a real phone. The Firebase SDK was never run in a page: the adapter's `transportOps`
is run by Node against the emulator, and the browser suite bridges pages to a fake cloud. The
real project was never touched and the live rules were not re-read. The `storage` event between
two real windows is tested by its handler only. One copy aside per document: a second loss
before the first notice is answered replaces the first copy. A write whose answer was lost,
followed by another phone's change, is told as a loss though it may be inside the plan that won.
Three phones with three edited lists: the last «להשתמש ברשימה שלי» wins. A later build that adds
a field to a shared vehicle or day needs every sharing phone updated first (the rule above, in
general).

## v184 — «בניית סידור»: the seder as one journey; «כרטיס עובד»; a vehicle turned off and on again (candidate, not served)

**Not served until the merge and the Pages deployment are recorded here by the next release.**
Built on `1af6729` (v183). Nothing in `js/sync`, `js/model`, `js/state.js`, `js/store.js`,
`js/recovery.js` or the rules. Nothing here writes the record by any new code.

### «בניית סידור» — the seder as one journey (`js/ui/journey.js`)

The owner, 2026-11-10: one complete loop from distributing the workers to the cars, "nothing left
to chance"; he builds in the evening for tomorrow and chooses what is sent, mostly only the
drivers. The journey is a frame around the screens that exist and builds no second editor:
(1) the day screen on tomorrow's date, with the journey's row inside the day's own dock - a
counter of who is placed and who is not; (2) a check that never blocks - the day's check (v182) drawn by `renderDayCheckInto`, and above
it the journey's own lines for what that check cannot know (a man not recorded who did not work
the previous working day; a man on an archived site), each man named once; a name tapped there
goes back to the day screen, where it opens the sheet it always opens; (3) the הסעות screen with the journey's bar
inside its panel, SKIPPED with one sentence on a phone that did not turn הסעות on, and never
turned on by the journey; (4) a read-only last look drawn by `dayMessage` and
`transportSummaryBlocks`; (5) sending - a door per driver first, then the seder to each worker,
the day's message and the rides' summary, each by his own tap, nothing preselected, and «סיום»
whether or not anything went. Where he is (date, station) is this phone's preference under
`farkadSederJourney`: never in the record, the outbox, the cloud, a backup or the rescue file; a
value that will not read is no journey. A journey left is continued for three hours and then
forgotten; what was built is kept by the screens that built it. A man moved or taken off his site
after he was seated is counted, marked and named, never repaired. ONE entry, a row in the
WhatsApp dialog: the day's dock and header are measured by `tests/mobile.test.mjs` and
`tests/design.browser.mjs` and have no free place; a place on the day screen is the owner's call.
Hooks: `render()` and `bootOnce()` in `js/app.js`, the last line of `renderTransport` and of
`closeTransport`. On Friday evening "tomorrow" is Sunday, as the day's arrows step.

### «כרטיס עובד» — one man on one screen (`js/ui/workercard.js`)

One worded button on every crew row. Who he is; his open period in his own cycle EXACTLY as the
pay sheet has it (the card reads the cells `payrollGroupTable` builds for his row - it computes
no money of its own); what he owes and his credit (`openAdvanceBalance`, `workerAccountFor`); his
last five advance movements; the last fourteen days site by site; this month's days per site. Two
buttons leave it, to his sheet and to his advances. It writes no key. Each figure carries its own
`carryReportingEnabled` gate, so an unapproved record reads the old way here as everywhere.
THE GATE IS ASKED ONCE PER READING: `carryReportingEnabled` re-walks up to 4000 fortnights per
call for a man whose balance never clears (100-1000 ms), so for the length of one synchronous
reading the card answers repeat questions about `State.schedule` from the first answer and puts
the function back in a `finally`; `tests/workercard.test.mjs` pins that it is asked exactly once,
asked again next time, restored after a throw, and never answers for another schedule. The cost
itself is in `js/model` and is not changed here.

### הסעות — a vehicle turned off, and on again

The owner, having tried the screen: "sometimes cars break down... like workers whom I turn off and
turn back on in the צוות page - because sometimes the car sits for more than a day." In «רכבים»
every vehicle has the roster's own switch («פעיל» / «כבוי»). Off, it is not one of the day's
vehicles FROM THE DAY THAT WAS ON THE SCREEN ONWARD: not drawn, not in the day's summary, no
driver's message, not counted by the report; a day before it reads as stored. One field,
`off: '<date>'`, in `farkadTransport:settings` - this phone's own. TURNING IT OFF OR ON WRITES
THE LIST AND NO DAY: the men a stored plan seats in it are waiting by a reading, he is told how
many, and turned on again a day nobody changed shows them in their seats byte for byte. ROLLOUT:
v183 and older do not know the field; an older window shows the vehicle on and drops the field at
its next change to the list - the off state is forgotten, nothing else.

### Hebrew - PROPOSED, not read by the owner

Pinned word for word in `tests/journey.test.mjs`, `tests/workercard.test.mjs` and
`tests/transport.test.mjs`. The switch's four words are the roster's own. No existing string
changed. Nothing says «נשלח».

### Known not covered

Not tried on a real phone - emulated touch in Chromium only; real drags inside the journey, iOS
standalone and the stuck-frame path with the journey's row in the dock are unmeasured. On a
375x667 phone the first station's dock takes about 198px. A driver is also on the
seder-to-each-worker list and can get two messages if both groups are used. On an unapproved
record the card («מקדמות רשומות», gated) and the advances screen («נשאר להחזיר», ungated) can show
different figures for one man. The card's month count gives a day at two sites to each. There is
no history of a vehicle's off periods; the day it is off from is the day on screen, not today.

## v183 — עובדי יוסף גבס: a second count per site, in no account at all (served 2026-11-10, on the owner's approval)

**Served.** Merged as `1af6729` (PR #65) on 2026-11-10 after both gates exited 0 on `ab364ae`. What follows is the entry as written before it was served.

**Not served yet: the merge and the Pages deployment are recorded here by whoever
publishes it.** A change to what the record holds ships alone: one commit of shipped files
on `4ad33cb` (v182), nothing else in it. No gate result is written here: validation is recorded
against the exact clean commit, and no count is carried over from another commit. It was
written on v180, then carried onto v181 and onto v182 as each was merged; the gate belongs
to the commit it was last run on.

**The owner's words** (2026-11-10, Arabic, translated): "Add for me, next to the Rima
workers, workers who are OUTSIDE ANY ACCOUNT. I want a list of their own that has nothing
to do with any account, but I want them recorded with me. The list's name is «עובדי יוסף
גבס», at every project like the Rima workers - but these workers have nothing to do with
the accounts or with anything anywhere; they have a list of their own without touching any
other list. I just write their NUMBER and that's it."

**And his two answers, the same day**, to what the first candidate asked him:

- Shown that the list was on the screen and in the workbook but not printed, he said:
  "I want it in print too, but as a separate list that does not enter any other list's
  account." So it is on the paper and in the picture now - see below - and still in
  nobody's arithmetic.
- He approved publishing, having been told THE ROLLOUT RULE: every phone updated to v183
  before the first count is typed.

**What it is.** Each site card on the day screen gains a second small number field, on
the same line as `רימא` and after it, labelled `יוסף גבס`: how many of that list's men
were on that site that day. A number only, 1-99; 0 or empty clears it. A day may carry
this count and nothing else. On the reports page, at the END of «לפי אתר» - after the
invoice, after «בלי עובדי רימא», after «רישום לרימא» - a table titled «עובדי יוסף גבס»:
its own dates (only the days that had a count), its own columns (only the sites that had
one), its own total line, and one line under it saying what it is not in. The same table
is printed on the paper and drawn in the shared picture of that page - LAST, under its own
heading, with its note, the way Rima's own table is printed - and only when the range in
scope has a count: with none there is no heading, on the screen, on paper or in the
picture. In the workbook of the full export, a last sheet named `עובדי יוסף גבס`.

**The path.** `days.<date>.yosefGeves.<placeId>`, one field path per edit (law 4), and a
clear is a field deletion - `rima`'s shape exactly, on a layer of its own. The key is
`yosefGeves` because it is ASCII letters only (one Firestore field-path segment, no
quoting, passes `isSafeSegment`), camelCase like the day's other extra keys (`vehiclesOff`,
`vehicleRuns`), the LIST'S OWN NAME rather than a description of what the list means (the
meaning is the owner's to change; the name is his), and shares no substring with `rima`,
so no search for one layer finds the other.

**What it is in.** The record (journal first, then the schedule, both verified - law 3);
the queue, the cloud, the daily cloud copy, a backup file, a restore point and the rescue
file's comparison of captures, because all of those carry the whole day; the day screen's
field; ⋯ when a count is held (a row titled `<day> · יוסף גבס · <site>`, both sides, both
buttons, the day's other counts OF THIS LIST under it); the arrows (a Saturday holding only
this count is landed on); its own table on the reports page; its own last sheet in the
full workbook, and its own file `farkad-yosef-geves_<from>_<to>.csv` in the CSV fallback.

**What it is NOT in.** This is the whole point of it, and it is measured, not asserted
(`tests/yosefgeves.test.mjs`, «IN NO ARITHMETIC AT ALL»; `tests/oracle.test.mjs`, 3b):

- **Not in pay.** No pay sheet row, worker-day, rate, hour, advance, repayment, deduction,
  correction, closure, payslip, carried balance or credit reads it. `js/model/money.js`
  and `js/model/ledger.js` do not name the layer or any function that reads it - a check
  reads the two files and fails if either ever does.
- **Not on the client's invoice** - the difference from Rima. `invoiceReport` adds
  `rima` to a site's day by name and adds nothing else. A day with only this list's men
  is NOT a billed day; a site with only this list's men is NOT on the invoice or in its
  site picker; the grid, the bars, the totals, the `חיוב` sheet and the client's file are
  cell for cell what they are without the counts.
- **Not in «בלי עובדי רימא»** and **not in «רישום לרימא»**, on the screen, in the picture,
  on paper or in their sheets. Neither list reads, writes, clears or holds the other: two
  counts on one site are two fields, and a held count of one list does not hold the other
  list's count of that day (the day's-counts-held-together rule is per list).
- **Not in the names or numbers of sites.** A site the roster has not got is numbered on
  the invoice («אתר שאינו ברשימה N») by the days and Rima counts that name it;
  this list is deliberately not read there, so a count cannot renumber anybody's invoice.
  In its own table such a site is «אתר שאינו ברשימה», unnumbered.
- **Not in the day's WhatsApp message**, any template, the whole day or one site; **not in
  the seder to each worker**, the list or any man's message; **not in הסעות** or its
  summary (which read the day through the seder's own list); **not in the week grid**; **not in «לפי עובד»**; **not copied by copy-a-day**
  (which has never copied a Rima count either).
- **Not in any other table on the paper or in the picture.** It is printed - his word -
  and as a table of its own: the invoice grid, its totals, the Rima table and every note
  above it are, on a real PDF and in the picture, word for word what they are without the
  counts (`tests/yosefgeves.browser.mjs` prints the page with the list's section hidden and
  compares it with the paper of a record that never had a count; and takes the list's group
  and note out of the picture and compares that).
- **Not in the one-client workbook** or a chosen-workers export. With one site chosen the
  FILE is the client's and does not carry the list's sheet; the screen and the paper of
  that page do carry the list, narrowed to that site. That the file stays so was confirmed
  with the paper decision.
- **Not in «בדיקת היום»** (v182): its Rima rule reads `rima` by name, and there is no
  rule for a missing count of this list. A day holding only this count is not a worked day
  to it, as a day holding only a Rima count is not.

How it was measured: a fortnight with every kind of day in it - a double at two sites,
extra hours, an absence, a weekly man and a fortnightly one, an advance, a closed week,
and Rima counts - is read off every surface (the pay sheet and its rows, each man's days
and account, the advances and the ledger, the invoice whole and per site, «בלי עובדי
רימא», the Rima table, every sheet of `reportSheets()` in five scopes, the REAL workbook
written by the shipped SheetJS in each of those scopes with every cell as the library holds
it, every WhatsApp message in every template for every site, every man's seder); eight
counts are typed over it, 140 men in all; everything is read again and compared byte for
byte. With the count billed like Rima's by a one-line change, eighteen of those checks
fail. And the second calculator (`tests/oracle.mjs`), which has never heard of the layer,
is run on 240 generated records that now carry these counts - laid on from a random stream
of their own, so every record is otherwise the record it was - and agrees with the app on
every figure; then the counts are stripped off a copy of each record and both calculators
are asked again over every range: not one figure differs.

**Rules.** `firestore.rules` does not restrict nested field paths, so an ordinary protocol
write admits the new path, as it admitted `rima`. NO rules change and no rules-first step;
`tests/cas.emulator.test.mjs` writes the path, beside a Rima count and a worker-day,
through the production adapter against the real rules, clears it, and reads the field gone.

**THE ROLLOUT RULE: every phone on v183 before the first «עובדי יוסף גבס» count is
typed.** The phones update separately. Until every one of them shows v183 (⋯ names the
version), nobody types a count, and:

- no rescue file, backup file, restore point or cloud copy is restored across builds -
  not an older phone opening what a v183 phone wrote, not a v183 phone opening what an
  older one wrote;
- no window of an older build stays open beside a v183 window on the same phone.

v166's third line - invoices only from an updated phone - is NOT needed for this count:
nothing an older phone prints is wrong for lacking it, because it is in nothing an older
phone prints. Every item under WHAT THE RULE IS FOR needs a phone or a window on an older
build while counts exist, so the rule closes all of them.

WHAT THE RULE IS FOR - the phones that have not updated. "Older" here is EVERY build before
v183, the ones that know Rima included: v180 and v179 on their real bytes out of Git, and
v165 from before Rima, each run beside this build on one cloud in
`tests/yosefgeves.test.mjs`. All three do the same things:

- **It adopts a document carrying the layer and says synced.** It is not held and not
  blocked. It rebuilds each day from the layers it knows (`normaliseSchedule`), so it does
  NOT keep `yosefGeves` in its own copy and does not show it. (`normaliseSchedule` in
  v179 and v180 names `plan`, `actual`, `vehicleRuns`, `vehiclesOff` and `rima`, and keeps
  nothing else: an unknown day layer is DROPPED, not preserved. Measured on both.)
- **Its ordinary edits do not take the counts off the cloud** - work recorded on a day
  that holds a count, on a day that holds only a count, and the deletion of an unused
  worker with his empty placeholder on such a day: one field path each, and the cloud
  still holds every count afterwards. A v183 phone adopting those writes still has them.
- **Handed a v183 record to restore, it refuses it out loud**: «ליום … יש שכבה שאינה
  מוכרת: yosefGeves.» - not restored with the counts silently stripped.
- **A whole-document RESTORE run on it erases every count for every phone.** Its own
  restore point is its own copy, which has none; restored, the cloud lost both counts and
  so did the v183 phone that never restored anything, and the older phone said only
  «שוחזר.». The worker-days all survived: only the layer it never kept is gone.
- **The same erasure from a v183 phone**: a restore point (or daily cloud copy, undo entry
  or backup file) WRITTEN by an older phone carries no counts, and v183 restores it without
  a word - a missing layer is not a problem to its restore gate - so every count on every
  date is gone from the cloud, and the person is told only «שוחזר.». The way back is the
  restoring phone's own state from before the restore, which is on its undo stack with the
  counts in it (measured).
- **A window of an older build opened on a phone where v183 has typed a count is held out
  loud**: «הרישום השמור במכשיר לא נקרא: ליום … יש שכבה שאינה מוכרת: yosefGeves.», and a
  count still queued is «קבוצת עריכות בתור השליחה לא נקראה». It writes nothing; the record
  and every queued edit on the disk are byte for byte what v183 wrote; opened again on
  v183 the phone has everything and is not held.
- **A phone that wrote last on an older build and then updates** shows the cloud's counts
  at its first snapshot, before anybody writes again, and its daily cloud copy carries
  them: the own-echo rule compares this layer's counts too.

Not measured for this layer, and assumed to be as v166 documents them for `rima` because
the code is the same code: the RESCUE-file exception (a phone that still carries the v1
`scheduleData` bytes offers the v1 reading, and confirming it replaces the record on every
phone); and an older window that adopts a snapshot AFTER a count was collected, writing the
shared disk without it until the v183 window's next snapshot.

**The Hebrew.** The list's name is the OWNER'S, verbatim. Every other string is PROPOSED:
its Rima neighbour's wording with the name changed, sitting beside it in the source, and
pinned word for word in `tests/yosefgeves.test.mjs` (and the screen's in
`tests/yosefgeves.browser.mjs`). No existing string changed.

| Where | The string | Its Rima neighbour |
| --- | --- | --- |
| the table's title; the sheet's name | `עובדי יוסף גבס` (the owner's) | `רישום לרימא`; `רימא` |
| the box on a site card; the word in a held row's title | `יוסף גבס` | `רימא` |
| the box's name for a screen reader | `יוסף גבס ב<site>` | `רימא ב<site>` |
| the total line | `סה״כ עובדי יוסף גבס` | `סה״כ עובדי רימא` |
| the line under the table, and under the sheet | `עובדי יוסף גבס בלבד. אינם נכללים בשכר ואינם נכללים בחיוב.` | `עובדי רימא בלבד. אינם נכללים בשכר. בחיוב שלמעלה כל אחד מהם נספר כיום עובד־אתר אחד.` |
| a count refused | `אפשר לרשום ליוסף גבס רק מספר שלם בין 0 ל-99.` | `אפשר לרשום לרימא רק מספר שלם בין 0 ל-99.` |
| a stored record that will not read (four) | `ליום <date> יש רישום יוסף גבס שאינו תקין.` · `ביום <date> יש רישום יוסף גבס תחת מזהה שאינו תקין.` · `ביום <date> יש מספר עובדי יוסף גבס שאינו תקין באתר <id>.` · `ביום <date> יש רישום יוסף גבס באתר <id> שאינו ברשימה.` | the same four with `רימא` |
| the refusal on the wire (never shown) | `רישום יוסף גבס אינו תקין.` | `רישום רימא אינו תקין.` |

**Pinned expectations moved, deliberately** (three in other suites, each with its reason
beside it; and, when the owner asked for the list in print, five of this build's own first
candidate, listed after them):

- `tests/rima.test.mjs` - the field-deletion rule's layers, read off the adapter, the sync
  layer and the fake cloud, were `actual, plan, rima` and are `actual, plan, rima,
  yosefGeves`: a cleared count of the second list is a deleted field too.
- `tests/declutter.browser.mjs` - «every site card keeps its רימא box, as v166 drew it»
  asked that the card's LAST child be `.rima-field`. The last child is now the line of
  counts (`.site-counts`) and the רימא box is the first thing on it. Still one box of hers
  on every card, at its foot; the line is as tall as hers alone was (44px, 45 with the
  rule above it), so no card grew and no name left any screen.
- `tests/harness.mjs` - the fake cloud deletes a cleared `yosefGeves` field, as the
  production adapter does (the check above holds the three copies of that rule together).

Nothing else moved: `tests/rima.browser.mjs`, `tests/scroll.browser.mjs`,
`tests/design.browser.mjs`, `tests/print.test.mjs` and `tests/mobile.test.mjs` pass as they
were.

And in `tests/yosefgeves.browser.mjs`, what the first candidate pinned as "never on paper,
never in the picture", moved on his word:

- the picture's groups were `['', רישום לרימא]` and are `['', רישום לרימא, עובדי יוסף גבס]`,
  the list's group carrying its own header, rows and total line and nothing of the others';
- "no title, total or note of the list is in the picture" is now "its note is the last line
  of the picture";
- the print stylesheet's `display` for the list was `none` and is now shown, with its note
  («בלי עובדי רימא» is still `none`);
- "a real printout carries not one word of the list, nor the sites only the list was on" is
  now "a real printout carries its heading, its total line with its numbers, its note and
  those sites - after the Rima total line and the Rima note, in that order";
- a range holding only the list's counts: the picture was no group and the sentence «אין
  רישומים בטווח הזה.», and is now the list's one group with its note (the picture draws that
  sentence only when it has no table; the screen and the paper still say it above the list).

`js/ui/printout.js` no longer leaves the list out by name, and `css/app.css` no longer hides
it in print: it takes the Rima table's paper rules (12pt heading kept with its table, 10pt
note).

**What it does NOT cover.**

- **The paper was read as a PDF out of Chromium**, never off a phone's print sheet, and the
  picture as the object the drawing code is handed, not as pixels.
- **Never on a real phone.** Chromium with touch emulation at 320, 375, 390 and 440 wide,
  both schemes, and 320 with the text doubled (where the line of counts wraps to two rather
  than run off the side - a card is then one box taller). Not an iPhone, not its keyboard.
- **Everything v166 lists under WHAT STAYS OPEN is open for this count too**, by the same
  code: half-typed digits dropped by a redraw; the same men recorded at two sites by two
  phones both kept; a count held against an empty cloud when nobody cleared it; an
  unrelated count of the same list typed the same day held with a held one; a row decided
  before the other phone's snapshot arrived; ↶ after a count decided in ⋯.
- **A malformed count in the cloud** (only a hand edit or a future build could write one)
  is refused at the door Rima's is, and the person is shown the EXISTING sentence, which
  calls the record financial («…בגלל רישום כספי שאינו תקין…»). This one is not. A sentence
  of its own is the owner's to word and is not in this build.
- **A range holding only this list's counts** shows the invoice's «אין רישומים בטווח הזה.»
  and then the list under it, on the screen and on paper. True of the invoice; it reads
  oddly above a table of records. The picture of that page is the list alone.
- **Two sites off the roster with a count each** are two columns both headed «אתר שאינו
  ברשימה». Numbering them would have to share the invoice's numbering or contradict it.
- `firestore.rules` does not type-check `days.*.yosefGeves.*`, as it does not `rima`.
- The restore gate still restores a copy that lacks the layer without a word (inherited
  from v166; the rollout rule is what stands in front of it).
- No reminder, and no rule in «בדיקת היום», for a count nobody typed.

**What is still the owner's to say.**

1. **On paper and in the picture: ANSWERED** (2026-11-10) - printed, as a separate list.
   It is printed on the same page as the invoice, after everything else on it. A page of
   its own, if he wants the client's paper without it, is one page-break rule.
2. **The one-client file** stays without the list's sheet.
3. **The words.** The label on the box («יוסף גבס»), the total line, the note and the
   refusal are proposed. The note is the one that says the thing he asked for.
4. **The rollout.** Every phone on v183 before the first count. v182, a candidate, is
   ahead of this one in the queue. Which builds are published, in what order, is his.

## v182 — «בדיקת היום», and the vehicles' report of a period (served 2026-11-10)

**Served.** Merged as `4ad33cb` (PR #64) on 2026-11-10 after both gates exited 0 on `61d9416`.
Built on `90ac0e8` (v181). Two readings; neither writes a key anywhere. Nothing in `js/sync`,
`js/model`, `js/state.js`, `js/store.js`, `js/recovery.js` or the rules. The owner asked
(2026-11-10) to be surprised with things that ease the evening, and for the seder to become one
journey "with nothing left to chance"; the check is a station of that journey, built first.

### «בדיקת היום» — the day's check (`js/ui/daycheck.js`)

One button at the foot of the day's list opens the app's own dialog with what the day on screen
may be missing, compared with the previous working day THE RECORD holds (the latest earlier date
on which a man has a site; none if that is more than 14 days back). Under «כדאי לבדוק»: men who
had a site that day and have no record now; a site left empty because of them; a Rima count that
was there and is not (never for a date after today); «שעות נוספות» with no hours; a day with no
daily rate; extra hours with no hourly rate - the last two read as the pay report reads them.
Under «לידיעה»: active men with no site for 5-12 working days, and days that are not regular. A
repeat of last week's same-weekday pattern is not reported. A name opens the assign sheet it
already opens; a site is scrolled to (by-site view only). When nothing is found:
«✓ לא נמצא דבר שנראה שנשכח.»

**It writes nothing** - no commit, no Store key, no mark that a day was checked. Two globals for
other screens: `dayCheckFindings(date)`, `renderDayCheckInto(container, date)`.

**Measured on a seeded model, not on the owner's record** (`DAYCHECK_NOISE=1 node
tests/daycheck.test.mjs` prints it): a forgotten man is caught on about 96% of evenings; for an
owner who never marks «נעדר», the not-recorded line asks about roughly one man on more than half
the evenings - a man off today and a man forgotten today are the same bytes; «לא יום רגיל» shows
on most evenings, under «לידיעה». The rules were tightened against that noise and the suite holds
ceilings and floors on it.

### הסעות — the report of a period (`js/ui/transport.js`)

One worded button under the last car, «דוח הסעות לתקופה», opens a dialog: four ranges - «השבוע»,
«שבוע קודם» (Friday to Thursday), «החודש», «חודש שעבר» - and per vehicle the days it went out,
who drove it and on how many days, days with nobody at the wheel, seats filled in total and on
average; then the vehicles that carried nobody; then each driver with his days and vehicles. It
counts what THIS phone kept and says what it did not: a day with no stored plan is counted and
said, never shown as a vehicle that stayed home. **The store keeps 35 days** and prunes when the
screen is opened, so «חודש שעבר» is whole only in the first days of a month; after that the
report names the date before which nothing is kept. The horizon was not changed. It leaves by
the summary's three doors (`shareTextOut`, `copyTextOut`, `sharePrintout('transport')`). The app
sends nothing, marks nothing, and nothing says «נשלח».

### Hebrew - PROPOSED, not read by the owner

The check's strings are one block, `DAY_CHECK_TEXT`, pinned word for word in
`tests/daycheck.test.mjs`; the report's twenty-five are in transport's own block, pinned in
`tests/transport.test.mjs` (the four range words are the pay report's). No existing string changed.

### Known not covered

Not tried on a real phone. The check cannot see a man recorded at the wrong site or a regular day
that should have been double; a forgotten Rima count is not seen on the first day of a stint. In
the report: a vehicle taken off the list drops out with its past days; days are read against the
vehicle list and the day record as they are now; future days count as days with no plan; how the
text reads inside WhatsApp was not seen; the picture's pixels are compared with nothing.

## v181 — polish: a quiet zero, emptier empty screens, a letter in the week, the backup's age (served 2026-11-10)

**Served.** Merged as `90ac0e8` (PR #63) on 2026-11-10 after both gates exited 0 on `98648d9`.
Built on `d3103d6` (v180). No number and no data path moved; nothing in `js/sync`, `js/model`,
`js/state.js`, `js/store.js`, `js/recovery.js` or the rules. The owner asked (2026-11-10) for
more features, faster, and to be surprised; this is the first of them.

- **Advances:** a man who owes nothing reads quieter than one who owes - weaker ink, ordinary
  weight, no accent on his own page. Same words, same order, nobody hidden; an account that
  asks to be checked is never quiet.
- **Empty screens:** advances with no crew shows the roster's sentence and «+ הוסף עובד»
  instead of a search over nobody; the week with no crew shows its sentence and the same button
  and no header; a crew of archived men with nothing this week keeps the three week steps and
  loses print/share; the crew screen hides search and reorder (and the two shortcuts when there
  is no site) until the first man. A week with a crew and no record keeps its whole header and
  grid under one sentence, on screen only. Reports are unchanged - `tests/wording.test.mjs`
  says their sentence is a fact about a range, not a setup problem.
- **Week on a phone:** each colour block carries the site's first letter (`siteInitial`,
  `js/ui/sitecolor.js`); the block is 20px, and the doubled-day dot, the extra-hours plus and
  the second-lap diamond stand beside the letter instead of through it. Site colours untouched;
  nothing changes on paper, in the picture, or on a desktop. The letter is an attribute drawn by
  the stylesheet, so the cell's text and accessible name are what they were.
- **Backup row in ⋯:** shut, the row itself repeats the existing age sentence; after 14 days
  without a file from this phone, one quiet line on the row. No new key - it reads
  `scheduleData:lastBackup`, which the export already wrote.

**New Hebrew, PROPOSED, not read by the owner** (pinned in `tests/polish.test.mjs` and
`tests/polish.browser.mjs`): «אין רישומים בשבוע הזה.» · «שבועיים ויותר בלי קובץ גיבוי חדש מהמכשיר הזה.»
No existing string changed; «אין עובדים. הוסף עובד כדי להתחיל.» and «+ הוסף עובד» are reused.

**Known not covered.** Not tried on a real phone. Two sites can share a first letter (colour and
diamond still tell them apart). The 13px letter was not checked at doubled text beyond what the
mobile suite measures. The reminder is not shown on a phone that never made a file (the existing
sentence says so) and knows nothing of files made on other phones. A week whose only record is on
the hidden Saturday shows an empty grid with no sentence. The rescue file was not checked for the
pre-existing `scheduleData:lastBackup` key.

## v180 — the credit, and the wage rounded once (served 2026-11-10, on the owner's explicit approval)

**Served.** The owner was shown the worked examples and answered «انشر v180» on 2026-11-10; he also ruled
that an over-settled advance keeps reading «דורש בדיקה» until a person looks. Merged as `d3103d6`
(PR #62); the Pages deployment for that commit succeeded at 13:45 UTC. Both gates exited 0 on
`ac684f8`, the commit that was merged. He reported both phones updated the same day. What follows
is the entry as it was written BEFORE it was served.

**Not served, and not to be served until the owner has seen it.** On 2026-11-10 he approved
repairing both faults below ON A SEPARATE BRANCH, to be shown to him before anything is
published. This is that branch: one commit of shipped files on top of `622d80a`. Its gate
results belong to that commit and no count is carried here. Every phone is on v179 or older.

**Who found it.** Not a person on a site: the second calculator (`tests/oracle.mjs`, merged
as tests only in `622d80a`), which works every figure out a second way from the written
rules. It disagreed with the app on two things, and both were left red and unrepaired in
`tests/oracle.findings.mjs` until the owner was asked. In its words:

> «A CLOSED PERIOD CAN CARRY FORWARD LESS THAN NOTHING, and what happens to that credit
> depends on which fortnight the man's next advance falls in. [...] The same cash, handed
> over to the same man, is a different debt depending on the week.»

> «A CLOSE CAN TAKE HALF AN AGORA MORE THAN THE MAN EARNED, AND THE APP THEN CALLS ITS OWN
> CLOSURE IMPOSSIBLE AND STOPS WRITING.»

### 1. The credit

**What was wrong.** A man takes 2,000, his fortnight is closed and 2,000 comes off his
wage; a repayment of 500 he made to the foreman, whose phone was offline, arrives
afterwards dated inside that fortnight. He has paid 2,500 against 2,000. v179 handed the
next fortnight a balance of **minus 500** and kept it for exactly one boundary: 1,500 taken
in the very next fortnight read as 1,000 owed, the same 1,500 taken a fortnight later read
as 1,500. The account and the sum of his advances disagreed (1,000 against 1,500), the
sheet's note read «חוב פתוח -500 ₪», and a fortnight closed in between froze
`carriedIn: -500` onto a payslip.

**The ruling this is built to** - recommended to the owner on 2026-11-10; he has NOT yet
confirmed it word for word, which is why the other ruling is one line away:

> Money a man gave back beyond what he owed stays his credit until it is used. It comes
> off whatever advance he takes next, however many periods later, and is never dropped at
> a boundary.

**What changes on a phone.**

- The same 1,500 is 1,000 owed whichever fortnight it is taken in, on the sheet, on the
  man's statement, in the sum at the top of his advances and in the sentence shown before
  he is put away.
- The credit is its own figure, zero or more, beside a debt that is zero or more. No
  balance is printed below zero anywhere. **It is never wages**: a credit with nothing to
  come off changes no wage and no «לתשלום»; paying it back to him in cash is still a
  conversation the app does not have.
- Where there is a credit it is NAMED - on the statement («יתרת זכות מחשבון קודם: 500»,
  «יתרת זכות: 500») and in the sheet's note, which is also the screen's, the paper's, the
  CSV's and the workbook's («500 ₪ יתרת זכות מחשבון קודם», «יתרת זכות 500 ₪»). A man with
  no credit sees neither phrase.
- A fortnight closed on a credit records it: `carriedIn: 0` and `creditIn: 500`, so the
  payslip adds up - 1,500 handed over, 500 of it already his, 1,000 off the wage. A
  payslip with no credit is byte for byte what v179 wrote.
- **IT ALSO APPLIES TO AN OPEN FORTNIGHT, and this is the widest change.** v179 dropped an
  excess at the end of an OPEN period in silence (it only ever carried one out of a closed
  period). Under the ruling it is carried from either. The case to know about: the pay
  sheet takes a past fortnight that was never closed to have deducted what it could, while
  the advances screen counts only deductions a close wrote down and so still shows that
  advance as open and offers «העובד החזיר כסף». Money recorded there is, to the sheet,
  money beyond what he owed - and from v180 it becomes a credit that comes off his next
  advance, with the note saying so, where v179 let it vanish. If the wage really was
  docked that fortnight, that is right. If the sheet's deduction was only ever a preview,
  the fortnight should be closed with the amount that really came off.

**What it does NOT change, and what the owner has to decide.** While one of a man's
advances has had more settled against it than was handed over (the offline-phone case
above is one), the account says «החשבון דורש בדיקה», the automatic deduction stops on every
open fortnight and a close is refused - the older rule, pinned in `tests/wording.test.mjs`,
and left exactly as it is. So in that case v180 shows the right DEBT (1,000) in every fortnight
alike, and takes none of it off his wage until a person has looked. The ruling says the
credit «comes off whatever advance he takes next»; the older rule says an over-settled
advance is «a conversation, not an arithmetic result». Both cannot be finished by
arithmetic alone. **Not decided, and not built:** whether a credit that has been used up
against a later advance should lift «דורש בדיקה» by itself. Until it is decided the way out
is the one that exists: «תיקון טעות» on that advance, if the repayment was entered twice.

**The other ruling** - no credit at all; the excess is dropped at the end of the period it
arrived in and that period is marked for review - is `OVERPAYMENT_STAYS_CREDIT = false` in
`js/model/schema.js`, one line. `tests/overpayment.test.mjs` runs the app that way through
the test seam: 1,500 owed in whichever fortnight, by the account and by the advances. The
two phrases and the note lines then never appear, and the second calculator's rule
(`tests/oracle.mjs`: `walked`, `openBalance`) and its fixtures move back with it.

### 2. The wage rounded once

**What was wrong.** 610 a day and half an extra hour at 41.25 is a wage of 630.625. Every
sheet prints 630.63. Closed against a debt at least that large, v179 took 630.63 off and
recorded it beside a wage of 630.625 - and its own check («a closure deducting more than
the wage it came off») then refused the closure it had just written: at the next open the
deduction was held aside as unreadable and the phone stopped writing, over a fortnight
nobody disagreed about. It needs an hourly rate with an odd number of agorot, a half hour,
and a debt at least as large as the wage.

**The repair, and why there.** The wage of an ACCOUNT is rounded to the agora once, where
the account reads it (`advanceWalk`), by the same rounding every surface prints with. That
one figure is what the deduction is measured against, what a closure records, and the most
a person may choose to take off: 630.63 earned, 630.63 off, 0 to pay, 4,369.37 carried, on
the sheet and on the statement, open, closed and reopened. Flooring the deduction to
630.62 instead would have left the closure recording a wage no payslip prints, a net of
half an agora and one agora of debt carried for ever. `payrollReport` is not touched: days
and their sum are unrounded as before, and are printed as before.

**A phone that already holds such a closure.** Nothing is rewritten. The judge now reads a
closure's recorded wage to the agora, which accepts a deduction EQUAL to the wage as
printed and nothing above it: 630.64 off 630.625, and 630.63 off a wage of 630.62, are
refused as before. A copy the phone had already put under `ledger.unreadable` is taken
back - that exact shape only, only if this build reads it whole, only if the record does
not hold different bytes under the same id, and only if taking it back makes no OTHER
closure impossible. Measured on v179's own bytes in three states (closed and never
reopened; held aside, acknowledged and saved; held aside with the held copy the only
copy): v180 opens unblocked, the entry is exactly as v179 wrote it, 630.63 counts as
deducted and 4,369.37 is carried.

### What existing records will show

- **A payslip v179 froze with `carriedIn: -500`** opens, is not held aside, and is not
  changed by one byte. It is read as what it was: «יתרת זכות מחשבון קודם: 500», 1,500 given,
  1,000 off, the money columns as they were closed. Nothing prints «-500».
- **A closed fortnight that v179 carried forward as minus 500** now hands on 0 owed and 500
  in credit. Its own payslip - what it opened on, what came off, what it closed on - is the
  record and does not move; its note reads «חוב פתוח 0 ₪ · יתרת זכות 500 ₪» where v179
  printed «חוב פתוח -500 ₪».
- **The figure that moves:** an advance taken TWO OR MORE periods after such a credit
  arose. v179 showed the whole advance as owed; v180 shows it less the credit. An advance
  taken in the very next period shows what it showed. And an excess from an OPEN period,
  which v179 dropped, is now a credit (above).
- **A closure of 630.63 against a recorded 630.625** counts, and the phone holding it
  writes again.

### The rollout rule

**Every phone on v180 before the next account is closed.** A closure's id is its period, so
two phones closing the same account write the same field - and where the man is in credit
or his wage is finer than an agora, a v179 phone and a v180 phone write DIFFERENT bytes
there (`carriedIn: -500` against `carriedIn: 0, creditIn: 500`; `gross: 630.625` against
`630.63`), which is two bodies under one id - measured for the half agora, v179's own
bytes against this build's - and that is a disagreement the app holds and asks a person
about. An ordinary account closed by the two builds is the same bytes, entry for entry. A
v179 phone that only READS what v180 wrote is not blocked by it and keeps the new field to
the byte (measured, both cases). Until every phone is updated the two builds also SHOW
different debts in exactly the cases above.

### Hebrew - PROPOSED, the owner has not read them

Two phrases, in one place (`ADVANCE_CREDIT_LABEL`, `js/ui/reports.js`), pinned in
`tests/overpayment.test.mjs`. No existing string was changed.

| where | proposed Hebrew |
|---|---|
| statement, opening | יתרת זכות מחשבון קודם: 500 |
| statement, closing | יתרת זכות: 500 |
| sheet note (screen, paper, CSV, workbook), opening | 500 ₪ יתרת זכות מחשבון קודם |
| sheet note, closing | יתרת זכות 500 ₪ |

### What it touches

`js/model/schema.js` (`advanceWalk`, `advanceAccount`, `advanceCarryInto` and the two new
readers beside it, `openAdvanceBalance`, `planAdvanceCarry`'s stop, the closure validator's
list of figures), `js/model/ledger.js` (`closureProblems`, `closureWithinRoundedWage`,
`closureFacts`, the two closure writers, `closedPeriods`), `js/state.js` (the one re-admission
in `normaliseSchedule`), `js/ui/reports.js` (the two phrases, the statement, the note, the
summary over a man's advances), and the three stamps. Nothing in `js/sync`, the rules, the
functions, the service worker's logic or any stylesheet. No migration, no entry edited or
deleted, no stamped day restated.

### Tests

`tests/overpayment.test.mjs` is new and in `npm test`. `tests/oracle.findings.mjs` is gone:
its fixtures are in the new suite, green. `tests/oracle.mjs` was changed to the ruling and
`tests/oracle.test.mjs` no longer excludes anything - the `KNOWN` list and `floorBit` are
removed, and the accounts and closes that used to be left out are compared and counted; two
mutants were added (the credit dropped at a boundary; a debt below zero carried forward).
No pinned expectation in any other suite moved.

### Known not covered

- **Not tried on a phone.** Node, real Chromium for the suites named in the commit, and the
  emulator for the two named there.
- **The second calculator is not independent evidence for the credit.** It was changed to
  the new rule in the same commit, by the same hand. What a person can check is the
  fixtures.
- **The account and the advances screen can still differ** where a past fortnight was never
  closed (the sheet assumes its deduction, the advances count only recorded ones). Older
  than v180, not changed by it, and the reason for the open-fortnight paragraph above.
- **Each advance's own card** still shows what THAT advance has left and what it was
  over-settled by; only the sum at the top is net of the credit.
- **A correction dated into a closed fortnight** reaches the credit by the same arithmetic
  as a late repayment; only the repayment is on a hand fixture (the generated records have
  both).
- **A half the app cannot hold exactly.** Half an hour at 33.33 is 16.665 on paper and
  16.66499... in binary; the app prints, pays and deducts 16.66, consistently. Not new.
- **A held closure that has been built on** - the phone carried on without it and closed a
  later fortnight - stays held, and the phone stays blocked until a person looks.
- **What the cloud holds under `ledger.unreadable`**, and a v179 and a v180 phone on one
  cloud, were not run.
- `corrected` and `cancelled` entries, as before (`tests/README.md`).

## v179 — הסעות: the summary of the day (served 2026-11-10)

**Served.** Merged to `main` as `17788f8` (PR #60) on 2026-11-10; the Pages deployment for that
commit succeeded at 09:54 UTC. As with the builds before it, "served" means Pages reported the
deployment of that commit; the served page itself was not read from the container that built
it. Built on `e4070e5` (v178). One commit of shipped files; its gate results belong to that
commit and no count is carried here. `622d80a` (PR #61), merged after it, is tests only - the
second calculator, `tests/oracle.mjs`, its suite and its two findings - changes no shipped
file, moved no stamp, and serves the same v179.

**The owner asked** (2026-11-10, in Arabic): *"is there a report for the cars?"* There was
none. The הסעות screen offered a message to each driver, one car at a time, and nothing that
showed the whole day.

**What it is.** One worded button on the הסעות screen, «סיכום הסעות ליום», under the tray and
above the first car. It opens one of the app's own dialogs with the summary of that day's
plan in a field nobody types in:

```
סיכום הסעות ליום שלישי 10/11/2026:

רכב: טויוטה קורולה 2013 – 3 מתוך 5
נהג: אחמד – הרצליה
- מוחמד – חיפה
- עלי – הרצליה

רכב: פולקסווגן 2018 – 1 מתוך 9
בלי נהג
- סמיר – נתניה

ממתינים לשיבוץ (2):
- יוסי – פרדסיה
- ראמי – פרדסיה

רכבים ריקים: סוואנה 2010, ליפמוטור C10 2026

רכבים שלא זמינים היום: טויוטה קורולה 2016, BYD סיל U 2025
```

- **Every vehicle that goes out with somebody in it**, in the order of the list: its name and
  how full it is, its driver (whoever is in seat 1) with his site, then the men in the order
  of their SEATS, each with his site. Nobody at the wheel: «בלי נהג». A driver alone:
  «בלי נוסעים.».
- **Then the men still waiting**, in roster order - only if there are any.
- **Then the vehicles that go out with nobody in them**, on one line, and **the vehicles kept
  home**, on one line - each only if there are any.
- Nobody seated at all: «אף עובד לא שובץ לרכב.», the men waiting, and NOT a line of seven
  empty vehicles. Nobody on a site that day: «אין ביום הזה עובדים עם אתר עבודה.» and nothing
  more.
- A seated man who has no site in today's record is named in his seat with no site made up,
  as in his driver's message.

**Three ways out, none of them new.**

- **«שליחה בוואטסאפ»** - the day message's own door (`shareTextOut`, `js/ui/share.js`): the
  phone's share sheet, or where there is none `https://wa.me/?text=…` with NO number. The
  person picks the chat and presses send.
- **«העתקה»** - the day message's own copy (`copyTextOut`), which says whether the copy
  happened.
- **«שיתוף כתמונה»** - the printout's own door (`sharePrintout('transport')`,
  `js/ui/printout.js`): a PNG, `farkad-הסעות-<date>.png`, to the share sheet or a download.
  The picture is READ OFF THE DIALOG'S FIELD, so it carries the words that are on the glass
  and cannot disagree with them; with the dialog shut there is nothing to draw. Black on
  white whatever the scheme, like the other printouts; plain lines of text, the first line of
  each block as its heading - it is not a drawing of the cars.

**The app sends nothing and marks nothing.** It cannot see whether send was pressed, so
nothing says «נשלח», and no car's «נפתח בוואטסאפ» mark is made or moved by the summary.

**What it does not touch.** Nothing in `js/sync`, `js/model`, `js/state.js`, `js/store.js`,
`js/recovery.js`, the rules or the functions. **It writes nothing**: no new Store key, nothing
to a transport key, the record, the outbox, the cloud, a backup or the rescue file - the
builder (`transportSummaryBlocks`, `js/ui/transport.js`) is a pure reading of the same picture
the screen draws (`TransportEngine.layout`), and a day written by v171 is read and not
rewritten. `tests/transport.test.mjs` compares every key on the disk before and after;
`tests/transport.browser.mjs` does the same through the real buttons. It exists only on a
phone that turned הסעות on, and only on that screen: no entry on the day screen, in ⋯ or in
the WhatsApp dialog.

**What changed outside `js/ui/transport.js`, and why it changes nothing for anybody else.**

- `js/ui/share.js`: `sendDayMessage` and `copyDayMessage` were each split in two - the same
  lines, now taking the text, the status line and the dialog to close as arguments
  (`shareTextOut`, `copyTextOut`) - so the summary goes out by the very code the day's message
  does. The day's message calls them with what it used before; its sentences are unchanged.
- `js/ui/printout.js`: `printoutImage` knows a third kind, `'transport'`, read and planned by
  `js/ui/transport.js`. `'week'` is the week and anything else is the report, as before.
- `js/ui/modal.js`: one row in the table of closers.
- `index.html`: the dialog's frame (`#transportSummaryModal`, no words in it), and the build
  meta. `css/design.css`: the dialog's look, under `@media screen` - and its tier: the panel
  it opens over is on the settings sheet's z-index, an ordinary dialog is under that.

**Every new Hebrew string - PROPOSED, the owner corrects on sight.** All in the one block at
the top of `js/ui/transport.js`, pinned word for word in `tests/transport.test.mjs`. No
existing string was changed. The summary also reuses, unchanged, `driver` («נהג: אחמד», for a
driver with no site today), `driverNone`, `mPassenger`, `mPassengerOnly`, `mAlone` and
`nobody`; and the three status sentences of the day's message (`js/ui/share.js`: «✔️ הועתק»,
«⚠️ ההעתקה נחסמה - סמן את הטקסט והעתק ידנית», «⚠️ השיתוף לא נפתח - השתמש בהעתק ושלח ידנית»,
«פותח וואטסאפ…») and the printout's two (`js/ui/printout.js`) appear as they are.

| key | proposed Hebrew | note |
|---|---|---|
| `summaryButton` | סיכום הסעות ליום | the button on the screen |
| `summaryTitle` | סיכום הסעות | the dialog's title |
| `summaryLabel` | תצוגה מקדימה של הסיכום | above the field |
| `summarySend` | שליחה בוואטסאפ |  |
| `summaryCopy` | העתקה |  |
| `summaryPicture` | שיתוף כתמונה |  |
| `summaryClose` | סגירה |  |
| `summaryFile` | farkad-הסעות-2026-11-10.png | the picture's file name; template; sample values |
| `sHeading` | סיכום הסעות ליום שלישי 10/11/2026: | template; sample values |
| `sVehicle` | רכב: קורולה 2016 – 3 מתוך 5 | template; sample values |
| `sDriver` | נהג: אחמד – חדרה | template; sample values |
| `sNoneSeated` | אף עובד לא שובץ לרכב. |  |
| `sWaiting` | ממתינים לשיבוץ (2): | template; sample values |
| `sEmpty` | רכבים ריקים: סוואנה 2010, קורולה 2016 | template; sample values |
| `sHome` | רכבים שלא זמינים היום: סוואנה 2010, קורולה 2016 | template; sample values |

**Bidi.** A vehicle is always named after a Hebrew word and inside the same right-to-left
isolate the driver's message uses (`transportRli`): «BYD סיל U 2025» begins with a Latin
letter and would otherwise turn its line left-to-right. That is why the empty and kept-home
vehicles are one Hebrew-led line each and not a bulleted list. A man's name and a site are
isolated as everywhere else.

**Known not covered.**

- **NOT TRIED ON A REAL PHONE.** Everything was measured in desktop Chromium with emulated
  touch, at 440x956 and 375x667, in both schemes. In the browser suite the share sheet,
  `window.open` and the clipboard are replaced by recorders: what is proved is what the app
  hands them, not what WhatsApp, iOS or Android then do with it.
- **How the text reads inside WhatsApp was not seen** - its line direction and its handling
  of the isolates around a vehicle's name are WhatsApp's. The lines follow the pattern of the
  driver's message, which is in use.
- **On a home-screen iPhone the share sheet for a FILE** is the same call the week's and the
  reports' pictures make; it was not tried from this dialog on a phone.
- **The men marked «לא בהסעה שלנו» are not in the summary.** They are in no car and wait for
  none; the owner asked about the cars. If he wants them listed, that is a line and a string.
- **No destinations line per car and no totals line.** Every man has his site beside his
  name; a count of cars and men is not written.
- **A man on two sites** is named with the first his day holds, as on the screen.
- **A very long day** scrolls inside the field; the picture grows downward and is not paged.
  A line too long for the picture wraps and is not cut; a wrapped line of vehicle names can
  break between two words of one name.
- The picture's pixels were not compared with anything: the suite checks the words drawn, in
  order, the file's name and type, and one box per block.
- Text at 200%, a 320px phone, landscape and a screen reader were not measured for this
  dialog. The dialog is not on paper (dialogs never are).
- An update that reloads the page while the dialog is open closes it; nothing is lost,
  because nothing was kept.

## v178 — one sub-title in ⋯ says what its section holds (served 2026-11-10)

**Served.** Merged to `main` as `e4070e5` (PR #59) on 2026-11-10; the Pages deployment for that
commit succeeded at 08:16 UTC. As with the builds before it, "served" means Pages reported the
deployment of that commit; the served page itself was not read from the container that built
it. Built on `893def8` (v174). v175 and v176 are numbers of an unpublished development branch.
v177 was never served: `tests/mobile.test.mjs` proves the diagnostic block carries no amount
out of the record by looking for the seeded rates as digits, one of them 77, and the build
stamp `v177` in that block reads as a leak. The check is right to be that blunt, so the
number was skipped and the check was left alone.

**What changed: two words.** In ⋯ the first section, «כללי», carried the sub-title
«חיבור ועדכונים». Since v172 the update card lives in «מכשיר ועזרה», and «כללי» holds the cloud
connection, the advances carry and the phone reminders. The sub-title is now
«חיבור ותזכורות». The owner asked for the sheet to be put in strict order (2026-11-09) and
approved professional wording in general; this string is PROPOSED, not approved word by word,
and he corrects it on sight. It is pinned in `tests/settings-order.browser.mjs`.

**What did not change.** No control, handler, order, stored key or data path. Nothing in
`js/sync`, `js/model`, `js/state.js`, `js/store.js`, `js/recovery.js` or the rules. The three
stamps moved because `index.html` is a cached file.

**Known not covered.** Not looked at on a real phone.

## v174 — הסעות as a picture: the cars drawn from above, men dragged to their seats (served 2026-11-10)

**Served.** Merged to `main` as `893def8` (PR #58) on 2026-11-10; the Pages deployment for that
commit succeeded at 04:44 UTC. Built on `8c943fa` (v172). Both gates exited 0 on the exact
commit that was merged; no count is carried here. v173 is the number of another branch that
has not been published. THE DRAG HAS STILL NOT BEEN CONFIRMED ON A REAL PHONE.

**The owner tried v171 on his phone and sent the screen back** (2026-11-10, his words,
translated): *"Very hard and complicated and it will take us a lot of time. I want the CAR
DRAWN, as if photographed from above, and on every seat written 'add worker', and I take the
worker, drag him with my finger and distribute them over the cars. The way it is now is very
hard."* He also said that on v171 «הצעת שיבוץ» "did nothing": nobody had been marked as
allowed to drive, so no vehicle could be opened, and the screen did not say so.

So the four-tab planner is gone and there is ONE screen, which is a picture.

**What the screen is now.**

- **The head**: «הסעות», the day and date, «חזרה».
- **The tray**, which stays at the top while the cars scroll under it: «ממתינים לשיבוץ (7)»
  and a chip for every man who works that day and is in no seat yet - his name, and a dot in
  his site's own fixed colour. It scrolls sideways when the men do not fit. When nobody is
  waiting it is one line: «כל העובדים משובצים».
- **One card for each vehicle that goes out today**, the car DRAWN FROM ABOVE with its front at
  the top: a rounded outline, a windscreen, four wheels, and the seats as big tiles in their
  real rows - five-seaters two and three, the Volkswagen 2-2-2-3, any other count two in front
  and rows of up to three. The driver's seat is on the LEFT (Israel drives on the right) with
  a drawn steering wheel; the drawing has its own left-to-right direction so the page's
  right-to-left does not mirror the car. An empty seat says «הוספת עובד», the driver's «נהג»;
  a taken one shows the man's name (two lines at most) over an edge in his site's colour. No
  image, no emoji: shapes and two inline SVG glyphs.
- **A man is put in a seat three ways.** Dragged there by a finger; touched in the tray and
  then the seat touched; or the empty seat touched and the man chosen from the app's own list
  of those still waiting. Dropped on a taken seat he changes places with the man in it - or,
  if he came from the tray, the man who sat there goes back to it. Dropped on the tray he is
  out of his car. Released anywhere else, nothing changes. A touch on a taken seat offers
  «הוצאה מהרכב» and nothing else.
- **WHOEVER IS IN THE DRIVER'S SEAT IS THE DRIVER.** Nobody is "allowed" or "not allowed".
- **Every change is kept at once.** There is nothing to accept.
- **A vehicle that does not go out today**: its «זמין היום» button; the card folds to one line
  («לא זמין היום») and its men are waiting again.
- **A man who does not ride with us**: the quiet «לא בהסעה שלנו» at the end of the tray's
  head - after touching a man, or with a man dropped on it, it asks «רכב פרטי / נוסע עם קבלן
  אחר / אחר»; touched alone it asks who first. Such men leave the tray and are one folded
  line at the bottom, «לא בהסעה שלנו (2)», from which each is brought back.
- **The driver's message**: on a card whose driver's seat is taken, one WhatsApp-green
  «פתיחה בוואטסאפ» - a real `<a href="https://wa.me/<number>?text=…" target="_blank"
  rel="noopener noreferrer">`, the seder's own rule for what is a usable number. After the tap
  the card says «נפתח בוואטסאפ» until that car's message changes. A driver with no usable
  number: «אין מספר טלפון תקין», and no link.
- **«רכבים»**, one folded row at the very bottom: the list the owner keeps (add, rename, seats,
  retire). Setup, not daily work.
- **At most one calm line on a card**: a seated man who no longer has a site in today's record
  (he stays drawn, marked, and can be taken out), or else passengers with nobody at the wheel
  («בלי נהג»).
- **No tap does nothing.** The one tap that cannot change anything - an empty seat when nobody
  is waiting - answers «כל העובדים משובצים».

**How a finger carries a man** (`js/ui/transport.js`, "carrying a man"). Pointer Events with
pointer capture; never the HTML5 drag-and-drop API. A copy of the name floats above the
finger, the seat under it is lit, and a finger resting near the bottom of the list (or just
under the tray) for a quarter of a second scrolls it, so a man can be taken to a car that was
off the screen. `pointercancel` puts everything back. Two things were decided against the
letter of the request, and are said here so they can be argued with:

- **A man in a SEAT is lifted by holding him for 300 ms, not at once.** A filled car is mostly
  seats, and the swipe that scrolls the list starts on a seat more often than not. Lifted at
  once, that swipe would carry a man off and drop him on whatever seat the finger left the
  glass over - a plan changed by scrolling, with nothing said. So a seat scrolls like the rest
  of the page (`touch-action: manipulation`) and only a resting finger lifts; from then on a
  non-passive `touchmove` listener on that one tile cancels the browser's scroll. A man in the
  TRAY is lifted the moment the finger moves 8 px (`touch-action: none` on the chip, and on
  nothing else). A mouse lifts either at once.
- **A level swipe on the waiting men slides the tray.** `touch-action: none` on the chips means
  the browser will not scroll a tray that is full of chips, so when the first 8 px are nearly
  level (across at least 2.5 times down) and the tray overflows, the app slides it itself.

**What was REMOVED from the feature, and why.** The owner's verdict was on the whole planner,
not on a tab:

| removed | why |
|---|---|
| the four tabs (שיבוץ / רכבים / עובדים / הודעות) | one screen |
| pickup areas - the list, a man's area, a trip's area, the «איסוף:» line of the message | he asked to place men himself; an area was only an input to the suggestion |
| "may drive" and which vehicles | the driver is whoever he puts in the driver's seat. This is also what made «הצעת שיבוץ» do nothing on his phone |
| «הצעת שיבוץ» and the whole suggestion engine | he distributes the men by hand |
| locks, on a vehicle and on a man | they existed to protect a hand edit from the next suggestion |
| «אישור התוכנית», the typed reason for a partial plan, versions and their history, «עדכון מספר N» | every change is the plan; the message is composed from the picture as it is |
| «סימנתי שנשלח» | he asked for less; the card says «נפתח בוואטסאפ» after the tap and the link stays |
| the list of what is wrong, with its count | one line on the card it is about |
| "also on site X" on a man's card | the card it was on is gone - see what is not covered |

`js/model/transport.js` is now the geometry and the three rules of a seat (`seatRows`,
`layout`, `tripsOf`, `waiting`, `place`, `remove`, `validate`); `suggest`, `mayDrive`,
`planSignature`, `movedBetween` and `seatPlan` are deleted, with their tests.

**What happens to data written by v171 or v172.** It opens as it is.

- A day (`farkadTransport:day:<date>`): the vehicles marked unavailable, the statuses, each
  trip's driver, passengers and seat numbers are read, and an «opened» mark (which will not be
  believed - the message is composed differently now, so the link is simply offered again).
  A passenger v171 gave no seat is drawn on the first free one. A man v171 left in a locked
  car that was marked unavailable is waiting again. A rear seat v171 called «אחורי ימין» is
  drawn on the right.
- **Reading rewrites nothing.** The bytes stay exactly as v171 wrote them until somebody
  changes that day. **The first change to a day drops from it**: its accepted versions
  (`accepted`), worker locks (`workerLocks`), each trip's `locked` and `area`, each mark's
  `sentAt`, and any trip for a vehicle that stays home or has left the list. They are not
  kept anywhere else.
- The list (`farkadTransport:settings`): the vehicles are read. The pickup areas and each
  worker's area and driving rights are NOT read, and ARE carried through every save untouched.
- A day v174 writes still has `version: 1` and the same trip fields, so v171 or v172 opening
  it again (an older window, a rolled-back build) reads it as a draft with no version.

**What it reads and writes is otherwise what v171 did**: who works where through `sederCrew`
and never the record; the per-phone switch in ⋯ and the one entry in the WhatsApp dialog,
unchanged; the same three kinds of key through `Store`, optional and verified, with the same
sentence when a write is refused; nothing in the schedule, the outbox, the cloud, a backup, a
restore point or the rescue file; 35 days kept. Nothing in `js/sync`, `js/model/schema.js`,
`js/model/money.js`, `js/model/ledger.js`, `js/state.js`, `js/store.js`, `js/recovery.js` or
`firestore.rules` changed.

**What this build is known NOT to cover.**

- **THE DRAG HAS NEVER BEEN TRIED ON A REAL iPhone OR GALAXY.** Every drag in
  `tests/transport.browser.mjs` is a real touch sequence through Chromium's input pipeline
  (`Input.dispatchTouchEvent`, with `hasTouch` and `isMobile`), at 440x956 and 375x667 - and
  that is desktop Chromium with emulated touch, nothing else. Not measured, and for the owner's
  phone to say: whether iOS Safari in a home-screen app honours `touch-action: none` on the
  chips and lets a `touchmove` be cancelled after a 300 ms hold (both are documented behaviour;
  neither was seen); whether its long-press callout or text selection appears over a held name
  despite `-webkit-touch-callout: none` and `user-select: none`; whether Android's long-press
  vibration or context menu interferes (`contextmenu` is prevented on a man); rubber-band
  scrolling at the ends of the list while carrying; and how the hold FEELS - 300 ms was chosen,
  not tried. If a held man does not lift on a phone, nothing is changed by trying, and the
  other two ways of seating a man, and «הוצאה מהרכב», need no drag at all.
- **A seated man is lifted only after a hold**, and the screen says so once, in the hint that
  is shown while nobody is seated. After that nothing on the screen says it.
- **Dragging is not reachable from a keyboard or a screen reader**; touching a man and then a
  seat is (every chip and seat is a button), and each move is announced in a live region. A
  man already seated cannot be moved to another seat without a pointer except by taking him
  out and seating him again.
- **Which vehicles go out is asked every day.** All seven are drawn on a new day; the ones that
  stay are folded by hand each time.
- **A man on two sites that day** rides to the first his day holds, and nothing on this screen
  says he has a second.
- **The first man in the app's list is the filled button** (it is `askChoice`'s look), which
  can read as a suggestion. It is the first man waiting, in roster order, and nothing more.
- The message has no pickup line and no seat numbers; passengers are listed in the order of
  their seats.
- Local to one phone, in no backup, a lost phone loses the plans and the list of vehicles - as
  v171.
- An update that reloads the page while the panel is open closes it; the plan is on the disk.
- Text at 200%, a 320px phone, landscape, a screen reader and paper were not measured for this
  panel. A vehicle with more than nine seats is drawn (rows of three) and was measured only at
  seven and twelve seats' row counts, not on the glass beyond seven.

**Every Hebrew string - PROPOSED, the owner corrects on sight.** He gave standing approval of
professional wording on 2026-11-09. All of them are in one block at the top of
`js/ui/transport.js` and pinned word for word in `tests/transport.test.mjs`; a correction
moves both, in one commit. Ninety-odd strings of v171's planner were removed from both. The
message a driver receives:

```
שלום סמיר,
הסעה ליום שלישי 10/11/2026:
רכב: BYD סיל U 2025
נוסעים (2):
- אחמד – הרצליה
- יוסי – חיפה
יעדים: הרצליה, חיפה
```

| key | proposed Hebrew | note |
|---|---|---|
| `switchTitle` | הסעות |  |
| `switchSub` | שיבוץ עובדים לרכבים |  |
| `switchLead` | שיבוץ העובדים לרכבים והודעה לכל נהג. פועל במכשיר הזה בלבד: לא מסונכרן, לא משותף עם הטלפונים האחרים, ולא נכלל בגיבוי. |  |
| `switchStateOn` | מופעל במכשיר הזה |  |
| `switchStateOff` | כבוי |  |
| `switchOn` | הפעלת הסעות במכשיר הזה |  |
| `switchOff` | כיבוי הסעות במכשיר הזה |  |
| `entry` | הסעות – שיבוץ לרכבים |  |
| `title` | הסעות |  |
| `back` | חזרה |  |
| `notKept` | השינוי לא נשמר במכשיר. אם האפליקציה תיסגר, הוא יאבד. |  |
| `unreadable` | נתוני הסעות שנשמרו במכשיר לא נקראו. מתחילים מרשימה ריקה, והעותק שלא נקרא נשמר בצד. |  |
| `nobody` | אין ביום הזה עובדים עם אתר עבודה. |  |
| `waiting` | ממתינים לשיבוץ (7) | new in v174; template; sample values |
| `allSeated` | כל העובדים משובצים | new in v174 |
| `hint` | גוררים עובד אל מושב, או נוגעים בעובד ואז במושב. עובד שכבר יושב מזיזים בלחיצה ארוכה וגרירה. | new in v174 |
| `picked` | אחמד נבחר. נוגעים במושב. | new in v174; template; sample values |
| `seatedIn` | אחמד שובץ בקורולה 2016 | new in v174; template; sample values |
| `returned` | אחמד חזר לממתינים | new in v174; template; sample values |
| `addWorker` | הוספת עובד | new in v174 |
| `driverSeat` | נהג | new in v174 |
| `driver` | נהג: אחמד | template; sample values |
| `chooseTitle` | מי יושב כאן? | new in v174 |
| `driverDialogTitle` | מי נוהג בקורולה 2016? | template; sample values |
| `removeFromVehicle` | הוצאה מהרכב |  |
| `cancel` | ביטול |  |
| `occupancy` | 3 מתוך 5 | template; sample values |
| `available` | זמין היום |  |
| `unavailable` | לא זמין היום |  |
| `driverNone` | בלי נהג |  |
| `notWorking` | אחמד משובץ ברכב אבל אין לו אתר ברישום היום | template; sample values |
| `deletedWorker` | עובד שנמחק |  |
| `notRiding` | לא בהסעה שלנו | new in v174 |
| `notRidingCount` | לא בהסעה שלנו (2) | new in v174; template; sample values |
| `notRidingTitle` | מי לא נוסע בהסעה שלנו? | new in v174 |
| `statusLabel` | איך אחמד מגיע | template; sample values |
| `statusPrivate` | רכב פרטי |  |
| `statusContractor` | נוסע עם קבלן אחר |  |
| `statusOther` | אחר |  |
| `bringBack` | החזרה להסעה | new in v174 |
| `vehiclesRow` | רכבים | changed |
| `seats` | 5 מושבים | template; sample values |
| `noVehicles` | אין רכבים ברשימה. |  |
| `editVehicle` | עריכת הרכב |  |
| `addVehicle` | הוספת רכב |  |
| `renameVehicle` | שינוי שם |  |
| `changeSeats` | שינוי מושבים |  |
| `retireVehicle` | הוצאה מהרשימה |  |
| `vehicleNameTitle` | שם הרכב |  |
| `nameNeeded` | צריך לכתוב שם |  |
| `vehicleNameTaken` | כבר יש רכב בשם הזה |  |
| `seatsTitle` | כמה מושבים יש בקורולה 2016? כולל הנהג. | template; sample values |
| `seatsBad` | מספר בין 2 ל-20 |  |
| `retireTitle` | להוציא את קורולה 2016 מהרשימה? | template; sample values |
| `retireLead` | הרכב לא יופיע עוד בשיבוץ. | changed |
| `save` | שמירה |  |
| `openWhatsapp` | פתיחה בוואטסאפ |  |
| `opened` | נפתח בוואטסאפ |  |
| `noPhone` | אין מספר טלפון תקין |  |
| `mHello` | שלום אחמד, | template; sample values |
| `mHeading` | הסעה ליום שלישי 10/11/2026: | template; sample values |
| `mVehicle` | רכב: קורולה 2016 | template; sample values |
| `mPassengers` | נוסעים (2): | template; sample values |
| `mPassenger` | - אחמד – חדרה | template; sample values |
| `mPassengerOnly` | - אחמד | new in v174; template; sample values |
| `mAlone` | בלי נוסעים. |  |
| `mDestinations` | יעדים: חיפה, חדרה | template; sample values |

`new in v174` marks a string the picture needed; `changed` one whose words moved
(`retireLead` spoke of accepted versions; `vehiclesRow` is v171's `tabVehicles`, the same
word on a row instead of a tab). Everything else is v171's, unchanged.

The seven vehicle names are data, seeded once and then the owner's to edit: טויוטה קורולה 2013,
טויוטה קורולה 2016, BYD סיל U 2025, BYD אטו 3 2025, פולקסווגן 2018, סוואנה 2010, ליפמוטור C10 2026.

## v172 — the settings sheet in strict order (served 2026-11-10)

**Served.** Merged into `main` as `8c943fa` (PR #57) on 2026-11-10 and deployed by GitHub
Pages run 42739198406, which concluded `success` at 01:57 UTC. As with v169 and v171, the
served page itself could not be read from the container that built it: "served" means Pages
reported the deployment of that commit. It was built as one commit of shipped files on
`b640c5a` (v171 on v169); its gate results are recorded on the PR, against that commit, and
no count is carried over here.

The owner's request of 2026-11-09, in his words: the settings page is a mess, not only in
looks but in ORDER - strict, firm, serious order; shake it out and re-arrange it. He liked the
v169 look and gave standing approval for structure decisions. So this is a STRUCTURE release:
the same controls, the same words, the same handlers, in a fixed order and one shape.

**What it was.** A head, three jump buttons, and one scroll of nine open cards: sync, the
version, the reminders (two screens on their own), the backup, the restore doors with their
lists of dates, the device, the rescue export, the transport switch, the technical report.
«שמור קובץ גיבוי» - the one filled button on the sheet - was three screens down.

**What moved where.** Three sections, three cards each, under the same three headings, ids and
jump buttons as before:

| section | card | was | now |
|---|---|---|---|
| «כללי» | ענן וסנכרון | 1st, open card | 1st, **still a plain open card** - not a row, cannot be shut |
| | (העברת מקדמות, when there is one) | under it | under it, unchanged |
| | תזכורות בטלפון | 3rd, open | 2nd, a row, shut |
| | הסעות | 8th, under «מכשיר ועזרה» | 3rd, a row, shut - **moved here** |
| «גיבוי ושחזור» | גיבוי | 4th, open | 1st, a row, **open each time the sheet opens** |
| | ייבוא ושחזור | 5th, open | 2nd, a row, shut |
| | שחזור חירום | 7th, under «מכשיר ועזרה» | 3rd, a row, shut - **moved here**: it is a way to get a record back |
| «מכשיר ועזרה» | עדכון וגרסה | 2nd, under «כללי» | 1st, a row, shut - **moved here** |
| | מצב המכשיר | 6th, open | 2nd, a row, shut |
| | מידע טכני | 9th, open | 3rd, a row, shut |

**The shape.** Every card but the first is the same thing: a native `<details>` whose
`<summary>` is the card's old head - picture, title, its existing one line, and a drawn corner -
56px at least, the whole row the target, opening in place. The contents sit one box in
(`.settings-fold-body`). The two cards a script builds (הסעות, מידע טכני) got a picture; מידע
טכני has a title and no line under it, because its sentence is two lines long and a shorter one
would have been a new Hebrew string. The look is `css/design.css`: tonal rows, no outlines, one
filled button on the whole sheet.

**What is open, and why.** Not remembered: the sheet opens the same way every time, so a thing
is where it was yesterday.

- **ענן וסנכרון is not a row.** The sync sentence, a refused sync's reason, the records held
  for a decision, the sign-in button and the advances review under it are never behind anything
  that shuts. A row that pretended it could close and did not would be a control that lies.
- **גיבוי is open** - the filled button and the age of the last copy.
- **Everything else is shut**, and opens by itself for exactly these reasons
  (`settingsFoldReasons`, `js/ui/settings.js`):

| row | opens by itself when |
|---|---|
| שחזור חירום | `Recovery` holds a problem, or writing is blocked. The banner over every screen keeps its own export button, as before. |
| ייבוא ושחזור | a whole-document restore is unfinished, held or unreadable (`replacementOutstanding`, `replaceDamaged` - the sentence for that one ends «טען קובץ גיבוי דרך ⋯ ← שחזור»); a record would not read (the boot dialog says «בדוק… מול נקודות השחזור»); a restore has just answered (`tellRestoreResult`); **the crew is empty and the row holds a date to go back to**, on this phone or in the cloud (the cloud's arrive on a promise and are asked about when they do) - a restore point is never taken of an empty crew, so that is a phone that lost its record. |
| תזכורות בטלפון | this phone holds a subscription and the server answers that it is not registered, or the phone now blocks notifications (`FarkadReminders.needsAttention`). |
| עדכון וגרסה | a new build is installed and waiting (`updateWaiting`, `js/ui/offline.js`), also when it arrives under the open sheet; and once after `checkForUpdate` is called with the sheet shut. |
| מצב המכשיר | the storage line or the ledger-parity line is a warning. |
| הסעות, מידע טכני | never. |

  A reason opens its row **once**, when it becomes true. The sheet is redrawn on every
  `render()` while it is open - a snapshot from another phone, a save, the connection changing -
  and a redraw neither opens nor shuts anything: a row a person shut stays shut while the reason
  stands, until the sheet is next opened.

**Two things found on the way, both fixed here.**

- **A button inside a shut `<details>` still has an `offsetParent` and a box in Chromium**
  (measured: 374x44, `checkVisibility()` false - the browser skips painting it, not laying it
  out). The sheet's Tab trap decided what was focusable by `offsetParent`, so it took an
  unreachable button for the last control and Tab from the last row left the sheet for the page
  behind it. The trap now asks the tree (`shutBySettingsFold`) and counts `<summary>`.
- **The smoke suite already held that a restore point is visible "without anybody opening a
  fold first"** to somebody who has just lost the record, and reaches for the cloud's copy the
  same way. A shut ייבוא ושחזור would have broken both. That scenario - the crew gone, a date to
  go back to in the row - is now a reason the row opens, and both of the suite's scenarios pass
  unchanged.

**Decided differently from the request, and why.** The request listed "opened from a reminder"
as a reason to open תזכורות בטלפון. It is not one. The reminder is tapped every evening and
sends a person to the day; the next thing they come to this sheet for is the backup, and an open
reminders row above it would put the backup button two screens down - the mess this release
removes. `tests/settings-order.browser.mjs` pins that it does not open.

**What did not change.** Every control, every sentence and every inline handler that was on the
v171 sheet is on this one - `tests/settings-order.browser.mjs` holds the list, captured from
`b640c5a` and compared. No Hebrew string was added, removed or altered, aria-labels included.
Nothing here reads or writes the record, a data key in `Store`, the outbox or the cloud; which
row is open is not stored anywhere. Paper is untouched (`css/design.css` is `@media screen`).
Nothing in `js/sync`, `js/model`, `js/state.js`, `js/store.js`, `js/recovery.js` or
`firestore.rules` changed.

**What this build is known NOT to cover.**

- **It is on no phone, and has never run on an iPhone.** Every measurement is Chromium, at
  440x956, 375x667 and 320x568, dark and light, and at doubled text. A `<details>` row in a
  home-screen WebKit - the tap, the drawn corner, the scroll after a tall row opens above the
  finger - is for the owner's phone to say.
- **A screen reader was not listened to.** The title is still an `<h3>`, now inside a
  `<summary>`; some readers announce a summary as a button and drop the heading inside it from
  heading navigation. The three section headings are untouched and are where the jump buttons
  land.
- **A loss that leaves the crew standing does not open ייבוא ושחזור.** Days deleted, a wrong
  restore: the app cannot tell that from an ordinary day. The way back is one tap on a row that
  says «פתיחת גיבוי או חזרה למצב קודם», with the dates open inside it - one tap more than v171.
- **«כללי» still says «חיבור ועדכונים» beside it**, and עדכון וגרסה is no longer in that
  section. The words are the owner's to change (law 6); nothing was reworded to fit the move.
- **The reminder rule waits for an answer.** With no account, no signal, or a check still
  running, the row stays shut whatever state the reminders are in: the app does not know.
- **Old builds.** A phone still on v171 or earlier shows the old sheet until it updates; nothing
  in the record or the store differs between them, so the three phones need not move together.

## v171 — הסעות, on one phone (served 2026-11-09)

**Served.** Merged into `main` as `0acaceb` (PR #56, the tree of `b640c5a`) on 2026-11-09 and
deployed by GitHub Pages run 42716182858, which concluded `success` at 22:56 UTC. The gates
were run on `b640c5a` from a clean detached worktree with the pinned Chromium and are recorded
on the PR. As with v169, the served page itself could not be read from the container that
published it: "served" means Pages reported the deployment of that commit. It is off on every
phone until somebody turns it on in ⋯ on that phone. v170 stays reserved for another feature
being built elsewhere.

The owner's request, and his answers of 2026-11-09: a planner for the morning ride - which of
his seven vehicles go out, who drives, who sits where - and a message to each driver. Seven
vehicles as he names them, the 9-seater a Volkswagen laid out 2-2-2-3 with the driver one of
the front two. He decides per worker who may drive, and which vehicles. Each worker has one
fixed pickup area; a driver is a worker and leaves from his own home, so a trip's pickup area
starts as its driver's. The morning ride only. No «ממתין» status. And **first on his phone
only, with no cloud**; the other two phones are a later step with its own approval.

**What it is.** A panel over the whole screen with four parts:

- **שיבוץ** - the plan. «הצעת שיבוץ» proposes one (deterministic: the same day gives the same
  plan; pickup area first, then destination site, then who may drive, then seats - it does not
  try to use fewer vehicles). A man is moved by tapping him and then «העברה לכאן» on a car. A
  driver is chosen from a list that offers ONLY the men who may drive that car and are riding
  that day. A vehicle or a man can be locked, and a suggestion leaves a locked vehicle byte for
  byte. What is wrong with the plan is listed live. «אישור התוכנית» makes a numbered version; a
  plan with anything open is accepted only with a typed reason. Versions are never edited.
- **רכבים** - which vehicles go out today, one tap each; and the list itself: add, rename,
  change seats, retire. Seeded once with the seven.
- **עובדים** - the men with a site that day: how each gets there (בהסעה שלנו / רכב פרטי / נוסע
  עם קבלן אחר / אחר), his pickup area, whether he may drive and which vehicles; and the list of
  pickup areas, which starts EMPTY - the owner types his own.
- **הודעות** - one card per driver of the last ACCEPTED version, never of a draft: the message,
  a real `<a href="https://wa.me/<number>?text=…" target="_blank">` tapped by the person (the
  seder's own rule for what is a usable number), «נפתח בוואטסאפ» on the tap, and a manual
  «סימנתי שנשלח». A mark is tied to the message's fingerprint: a later version, a corrected
  number or a renamed passenger and it is no longer believed.

**The switch.** Off on every phone until that phone turns it on: a card in ⋯ under «מכשיר
ועזרה», saying it is this phone only. One preference, `farkadTransport:enabled`. While it is
off no entry is drawn, nothing is computed, and no transport key but that one is read. On, there
is ONE entry: a row in the WhatsApp dialog under the seder's. Nothing new on the day screen.
There is no `FARKAD_FLAGS` entry - a flag is the same on all three phones, and this gate must
not be.

**What it reads.** Who works where on the day being viewed, through `sederCrew`
(`js/ui/seder.js`) in the layer the day's group message reads - so a man is in a plan exactly
when he is under a site in that message. A man on two sites rides to the FIRST site his day
holds; the other is said on his card and not routed.

**What it writes, and where.** Three kinds of key, through `Store`, optional and verified:

| key | holds |
|---|---|
| `farkadTransport:enabled` | the switch |
| `farkadTransport:settings` | the vehicles, the pickup areas, and per worker (by roster id, nothing copied) his area and what he may drive |
| `farkadTransport:day:<date>` | that day's draft, its accepted versions, and the marks on the drivers' messages |

Day records older than 35 days are removed when the panel is opened. A record that will not
read is copied to `<key>:unreadable` before anything is saved over it, the screen says so, and
the day goes on being recorded: `Recovery` is not involved and writes are never blocked from
here. If the copy cannot be kept, nothing is written over the unreadable bytes.

**What it does NOT write.** Nothing in the schedule document, the journal, the outbox or the
cloud; nothing in a backup file, a restore point or the rescue file; the write fence does not
move. `tests/transport.test.mjs` measures each. Nothing in `js/sync`, `js/model/schema.js`,
`js/model/money.js`, `js/model/ledger.js`, `js/state.js`, `js/store.js`, `js/recovery.js` or
`firestore.rules` changed. The retired «רכבים» feature (vehicle-owner pay, the `vehicles`
flag) is not touched and shares no name, id or panel with this: transport vehicles are `tv_…`.

**What this build is known NOT to cover.**

- **It is on no phone, and has never run on an iPhone.** Every measurement is Chromium at
  440x956 and 375x667. The hand-off from the home-screen app to WhatsApp, the keyboard over the
  reason field, and the panel on a stuck iPhone frame (it carries the settings sheet's class,
  so it takes that fix - untested on glass) are for the owner's phone to say.
- **Local to one phone.** The other two phones do not have the plan, the vehicles, the areas
  or who may drive. A phone that turns the switch on starts with the seven vehicles and
  nothing else.
- **Not in any backup.** A lost, replaced or wiped phone loses every plan and every per-worker
  transport setting. There is no export. Restoring the schedule does not touch them, in either
  direction.
- No return ride. No distances: areas have no order of closeness, and the suggestion is
  greedy, not optimal. A locked vehicle with empty seats is not filled by a suggestion.
- Only a man who is working that day can be chosen to drive.
- Per-worker settings are edited from the card of a man who has a site that day; a man who is
  off is set the first evening he works.
- An update that reloads the page while the panel is open closes it; the draft is on the disk,
  the man being moved is not. Unlike the seder's list, the panel does not reopen by itself
  after iOS kills the app behind WhatsApp - the tap's «נפתח בוואטסאפ» mark is kept.
- The driver's message has no emoji (the seder's has two). The seat a passenger was given is
  shown on the plan and is not in the message.
- Deleting a worker or a site is never blocked by a plan that names him; an old version then
  shows «עובד שנמחק».
- Text at 200%, a 320px phone, a screen reader and paper were not measured for this panel.

**Every Hebrew string - PROPOSED, the owner corrects on sight.** He gave blanket approval of
professional wording on 2026-11-09 and asked not to be consulted string by string. All of
them are in one block at the top of `js/ui/transport.js` and pinned word for word in
`tests/transport.test.mjs`; a correction moves both, in one commit. The message a driver
receives:

```
שלום סמיר,
הסעה ליום שלישי 10/11/2026:
רכב: BYD סיל U 2025
איסוף: כפר קרע
נוסעים (2):
- אחמד – הרצליה
- יוסי – חיפה
יעדים: הרצליה, חיפה
```

From the second accepted version on, «עדכון מספר N לתוכנית.» follows the heading.

| key | proposed Hebrew | note |
|---|---|---|
| `switchTitle` | הסעות | |
| `switchSub` | שיבוץ עובדים לרכבים | |
| `switchLead` | שיבוץ העובדים לרכבים והודעה לכל נהג. פועל במכשיר הזה בלבד: לא מסונכרן, לא משותף עם הטלפונים האחרים, ולא נכלל בגיבוי. | |
| `switchStateOn` | מופעל במכשיר הזה | |
| `switchStateOff` | כבוי | |
| `switchOn` | הפעלת הסעות במכשיר הזה | |
| `switchOff` | כיבוי הסעות במכשיר הזה | |
| `entry` | הסעות – שיבוץ לרכבים | |
| `title` | הסעות | |
| `back` | חזרה | |
| `tabPlan` | שיבוץ | |
| `tabVehicles` | רכבים | |
| `tabWorkers` | עובדים | |
| `tabMessages` | הודעות | |
| `notKept` | השינוי לא נשמר במכשיר. אם האפליקציה תיסגר, הוא יאבד. | |
| `unreadable` | נתוני הסעות שנשמרו במכשיר לא נקראו. מתחילים מרשימה ריקה, והעותק שלא נקרא נשמר בצד. | |
| `nobody` | אין ביום הזה עובדים עם אתר עבודה. | |
| `vehiclesLead` | אילו רכבים יוצאים היום? | |
| `vehiclesSummary` | זמינים 2 מתוך 7 · 34 מושבים | template; sample values |
| `seats` | 2 מושבים | template; sample values |
| `available` | זמין היום | |
| `unavailable` | לא זמין היום | |
| `noVehicles` | אין רכבים ברשימה. | |
| `editVehicle` | עריכת הרכב | |
| `addVehicle` | הוספת רכב | |
| `renameVehicle` | שינוי שם | |
| `changeSeats` | שינוי מושבים | |
| `retireVehicle` | הוצאה מהרשימה | |
| `vehicleNameTitle` | שם הרכב | |
| `nameNeeded` | צריך לכתוב שם | |
| `vehicleNameTaken` | כבר יש רכב בשם הזה | |
| `seatsTitle` | כמה מושבים יש באחמד? כולל הנהג. | template; sample values |
| `seatsBad` | מספר בין 2 ל-20 | |
| `retireTitle` | להוציא את אחמד מהרשימה? | template; sample values |
| `retireLead` | הרכב לא יוצע עוד לשיבוץ. גרסאות שכבר אושרו אינן משתנות. | |
| `save` | שמירה | |
| `workersLead` | מי צריך הסעה היום? הרשימה נקראת מרישום היום ואינה משנה אותו. | |
| `statusLabel` | איך אחמד מגיע | template; sample values |
| `statusRide` | בהסעה שלנו | |
| `statusPrivate` | רכב פרטי | |
| `statusContractor` | נוסע עם קבלן אחר | |
| `statusOther` | אחר | |
| `areaLabel` | אזור האיסוף של אחמד | template; sample values |
| `noArea` | בלי אזור | |
| `alsoAt` | רשום היום גם בחיפה, חדרה. ההסעה לאתר הראשון. | template; sample values |
| `canDrive` | רשאי לנהוג | |
| `cannotDrive` | לא נוהג | |
| `drivesAll` | כל הרכבים | |
| `drivesSome` | 2 רכבים | template; sample values |
| `drivesNone` | לא נבחר רכב | |
| `drivesLabel` | באילו רכבים אחמד רשאי לנהוג | template; sample values |
| `notWorkingToday` | 2 עובדים בלי אתר היום – אינם בהסעות | template; sample values |
| `areasTitle` | אזורי איסוף (2) | template; sample values |
| `areasLead` | האזורים שמהם אוספים עובדים. לכל עובד אזור אחד קבוע. | |
| `noAreas` | עדיין אין אזורים. מוסיפים אזור, ואז בוחרים אזור לכל עובד. | |
| `addArea` | הוספת אזור | |
| `renameArea` | שינוי שם | |
| `removeArea` | מחיקה | |
| `areaNameTitle` | שם האזור | |
| `areaNameTaken` | כבר יש אזור בשם הזה | |
| `removeAreaTitle` | למחוק את האזור אחמד? | template; sample values |
| `removeAreaLead` | עובדים ששויכו לאזור הזה יישארו בלי אזור. | |
| `suggest` | הצעת שיבוץ | |
| `accept` | אישור התוכנית | |
| `draft` | טיוטה – עדיין לא אושרה | |
| `acceptedVersion` | גרסה 2 מאושרת | template; sample values |
| `changedSince` | יש שינויים שלא אושרו מאז גרסה 2 | template; sample values |
| `recordChanged` | רישום היום השתנה מאז שאושרה הגרסה | |
| `seatedCount` | משובצים 3 מתוך 5 | template; sample values |
| `planOk` | התוכנית מלאה | |
| `errorsTitle` | 2 דברים לתיקון | template; sample values |
| `warnTitle` | לתשומת לב | |
| `unseatedTitle` | בלי מקום ברכב (2) | template; sample values |
| `suggestDone` | הוצע שיבוץ. 2 נשארו בלי מקום | template; sample values |
| `noDriver` | קורולה 2016: אין נהג | template; sample values |
| `driverNotEligible` | קורולה 2016: אחמד אינו רשאי לנהוג ברכב הזה | template; sample values |
| `overCapacity` | קורולה 2016: 2 יותר ממספר המושבים | template; sample values |
| `twice` | אחמד משובץ בשני רכבים | template; sample values |
| `hasStatus` | אחמד משובץ ברכב אבל מסומן «רכב פרטי» | template; sample values |
| `notWorking` | אחמד משובץ ברכב אבל אין לו אתר ברישום היום | template; sample values |
| `vehicleUnavailable` | קורולה 2016 מסומן לא זמין היום ויש בו נוסעים | template; sample values |
| `unknownVehicle` | רכב שהוצא מהרשימה ויש בו נוסעים | |
| `noSeat` | אחמד בלי מקום ברכב | template; sample values |
| `badSeat` | קורולה 2016: המושב של אחמד אינו תקין | template; sample values |
| `otherArea` | אחמד נאסף מאזור אחר מזה של קורולה 2016 | template; sample values |
| `deletedWorker` | עובד שנמחק | |
| `deletedVehicle` | רכב שהוצא מהרשימה | |
| `occupancy` | 3 מתוך 5 | template; sample values |
| `notUsed` | לא בשימוש | |
| `lockVehicle` | נעילת הרכב | |
| `unlockVehicle` | שחרור הרכב | |
| `vehicleLocked` | הרכב נעול | |
| `pickup` | אזור איסוף | |
| `destinations` | יעדים | |
| `driver` | נהג: אחמד | template; sample values |
| `chooseDriver` | בחירת נהג | |
| `driverDialogTitle` | מי נוהג בקורולה 2016? | template; sample values |
| `driverDialogLead` | מוצגים רק עובדים שרשאים לנהוג ברכב הזה. | |
| `driverNone` | בלי נהג | |
| `noEligible` | אין היום עובד שרשאי לנהוג ברכב הזה | |
| `lockWorker` | נעילת השיבוץ של אחמד | template; sample values |
| `unlockWorker` | שחרור השיבוץ של אחמד | template; sample values |
| `lock` | נעילה | |
| `locked` | נעול | |
| `moveHere` | העברה לכאן | |
| `full` | הרכב מלא | |
| `moving` | מעבירים את אחמד – בוחרים רכב | template; sample values |
| `workerLockedNote` | אחמד נעול – משחררים כדי להעביר | template; sample values |
| `cancel` | ביטול | |
| `removeFromVehicle` | הוצאה מהרכב | |
| `seat` | מושב | |
| `seatNone` | בלי מושב קבוע | |
| `seatFront` | קדמי, ליד הנהג | |
| `seatRearRight` | אחורי ימין | |
| `seatRearMiddle` | אחורי אמצע | |
| `seatRearLeft` | אחורי שמאל | |
| `seatRow` | שורה 4, מושב 3 | template; sample values |
| `seatNumber` | מושב 2 | template; sample values |
| `acceptTitle` | אישור התוכנית | |
| `acceptComplete` | התוכנית מלאה. לאשר אותה? | |
| `acceptIncomplete` | התוכנית חלקית: 2 דברים לא סגורים. אפשר לאשר רק עם סיבה. | template; sample values |
| `reasonLabel` | למה מאשרים תוכנית חלקית? | |
| `reasonNeeded` | צריך לכתוב סיבה | |
| `acceptYes` | אישור | |
| `acceptPartial` | אישור כתוכנית חלקית | |
| `nothingToAccept` | אין שינויים לאשר | |
| `historyTitle` | היסטוריית גרסאות | |
| `noVersions` | עדיין אין גרסה מאושרת | |
| `versionLine` | גרסה 2 · 21:40 | template; sample values |
| `complete` | מלאה | |
| `partial` | חלקית – חסר נהג | template; sample values |
| `moved` | 2 עובדים שונו לעומת גרסה 1 | template; sample values |
| `tripLine` | קורולה 2016: אחמד + 2 נוסעים | template; sample values |
| `messagesLead` | הודעה לכל נהג. וואטסאפ נפתח עם ההודעה מוכנה, ושם לוחצים על שליחה. | |
| `noAccepted` | אין תוכנית מאושרת. מאשרים את השיבוץ, ואז שולחים לנהגים. | |
| `draftDiffers` | ההודעות לפי גרסה 2. יש שינויים שלא אושרו. | template; sample values |
| `openWhatsapp` | פתיחה בוואטסאפ | |
| `notOpened` | עדיין לא נפתח | |
| `opened` | נפתח בוואטסאפ | |
| `confirmSent` | סימנתי שנשלח | |
| `sentMarked` | סומן כנשלח ב-21:40 | template; sample values |
| `unmarkSent` | ביטול הסימון | |
| `changedSinceMark` | ההודעה השתנתה מאז שסומנה – כדאי לשלוח שוב | |
| `noPhone` | אין מספר טלפון תקין | |
| `mHello` | שלום אחמד, | template; sample values |
| `mHeading` | הסעה ליום שלישי 10/11/2026: | template; sample values |
| `mUpdate` | עדכון מספר 1 לתוכנית. | template; sample values |
| `mVehicle` | רכב: קורולה 2016 | template; sample values |
| `mPickup` | איסוף: 3 | template; sample values |
| `mPassengers` | נוסעים (2): | template; sample values |
| `mPassenger` | - אחמד – חדרה | template; sample values |
| `mAlone` | בלי נוסעים. | |
| `mDestinations` | יעדים: חיפה, חדרה | template; sample values |

The seven vehicle names are data, seeded once and then the owner's to edit: טויוטה קורולה 2013,
טויוטה קורולה 2016, BYD סיל U 2025, BYD אטו 3 2025, פולקסווגן 2018, סוואנה 2010, ליפמוטור C10 2026.

## v169 — one look for every screen (served 2026-11-09)

**Served.** Merged into `main` as `bd59a68` (PR #55, the tree of `e87fc62`) on 2026-11-09 and
deployed by GitHub Pages run 42709326296, which concluded `success` at 22:10 UTC. The owner
asked the same day for each safe change to be published on its own, and this one touches no
data path. The gates were run on `e87fc62` from a clean detached worktree with Playwright
1.56.1's own pinned Chromium and are recorded on the PR, where a count belongs. **What was
NOT verified:** the served page itself - the container that published it cannot reach
`github.io` - so "served" here means Pages reported the deployment of that commit, not that
anybody read the stamp off a phone. v168 was reserved for a sync fix built elsewhere and had
not landed; whatever it becomes is built on this.

The owner's request (2026-11-09): the app made professional and calm, readable in the sun,
nothing surplus on the screen, with authority to choose the look. What was measured first, on
v167 at 440x956 with a fourteen-man crew: the day spent 212px of chrome above the first name
and 148px under the last, eight names of fourteen in view; fourteen different button looks and
thirty-three outlined boxes on that one screen; emoji and stroke icons side by side. Nothing
was under a floor - every target 44px, every field 16px, every text pair 4.5:1. It was
crowded, not broken.

**What changed, and it is two files.**

- `css/design.css`, loaded last. One palette for both schemes, chosen well above the contrast
  floor (dark: ink 21:1 on paper, 18:1 on a surface, the quietest text 7.2:1; light: 17.5,
  10.2, 7.7 - every ink at 7:1 or better on every ground, which `tests/navigation.browser.mjs`
  holds it to). Four button looks - filled, tonal, ghost, and WhatsApp's green, which is now the
  only green button in the app (print was green only because `.btn-success` was the one filled
  class there was). Outlines stop carrying the layout: a card is a surface, a list is rows with
  a hairline between them. The crew is rows instead of 116px cards, advances are one list
  instead of fourteen boxes. Every rule is inside `@media screen`.
- `js/ui/icons.js`. A button whose label begins with an emoji keeps that emoji in its text -
  clipped to a pixel, still in `textContent`, still in the accessible name - and is given a
  drawn stroke glyph beside it. **No label changed**: every string is character for character
  what it was, which is why not one pinned expectation about a button's words moved. A
  textarea is never touched, so the WhatsApp message and the seder's messages show every emoji
  they will arrive with.

**The day: eleven names where there were eight** (440x956). The worker row is 56px (it was
69): the same 44px target, six above and six below. The tab bar and the dock lose fifteen
pixels of padding between them. `tests/mobile.test.mjs`'s band for the row moved from 64-72
to 52-60, deliberately, with the reason beside it.

**What did NOT change, on purpose.** No control moved, no handler changed, nothing went behind
a menu: three people use this from memory. The settings button keeps its word (v122 put
«הגדרות» beside the cog because a bare icon was unexplained). The strip above the day keeps
its place - folding it into the day's header buys a twelfth name, but only by positioning
something against the top edge of an installed iPhone app, and that was built, measured and
taken back out. The site colours are exactly as v140 left them. The header's internals
(day-tight, day-compact, the measured bars) are untouched. Paper and the shared picture are
untouched. Nothing in `js/sync`, `js/model`, `js/state.js`, `js/store.js`, `js/recovery.js` or
`firestore.rules` - no data model change, no rules change, nothing to coordinate between
phones beyond the ordinary update.

**What this build is known NOT to cover.**

- **Nothing here has run on an iPhone or a Galaxy.** Every measurement is Chromium. The
  palette's contrast is arithmetic; whether pure black reads better in the sun than v140's
  navy is a thing only the three phones can say.
- A man on a site with a long name still takes a taller row: the row gives the name half its
  width and wraps the badge under it when the badge needs more («תל אביב - רוטשילד 12» at
  440). That is v167's rule and is not changed here; the eleven-row figure is for rows of one
  line.
- The week's colour squares on the dark ground measure 2.1-2.9:1 against it. They carry no
  text, and the site colours are not this release's to move; a letter inside each square is
  the fix, and it is a product decision that has not been taken.
- The emoji inside banners and warnings that are not buttons (⚠️ in a sentence) are still
  emoji. Only buttons, `<summary>` rows and the handset on the crew page are dressed.
- Zero balances on the advances list are as strong as real ones. Quietening them needs the
  renderer to say which rows are zero; this release did not touch a renderer.
- Empty screens still show their tools above their one sentence.
- In the container this was built in, `tests/seder.browser.mjs` stops at «the tap went to
  wa.me» on untouched v167 as well: the installed Chromium is newer than the one Playwright
  1.56.1 pins and reports an empty URL for the refused popup. It is an environment fault, not
  this build's - and it is also why no run from that container can be called the release gate.

## v167 — the seder to each worker, the bars on a stuck iPhone, the day screen decluttered, and two Rima additions (candidate, not served)

**Not served. Not merged. On no phone.** Four commits on v166 (`71d918c`, served on
2026-11-07 and merged into main as `2931841`), on a local branch with no remote: the seder (the owner's request of 2026-11-02),
on it the bar fix, then the day screen's declutter, then two Rima additions on the billing
page - the last three at the end of this entry. The first two were written on `81ecb2d`, the v166 before its review (as
`38c34ce` and `b9ed104`), and cherry-picked. No gate result is
written here: validation is recorded against the exact clean commit in the release PR, and
no count is carried over from another commit.

**THE HEBREW WORDS ARE THE OWNER'S.** Every string the feature shows or sends - the message
template, the list's title, the button labels, the marks, the no-number note, the
shared-number note - is in one block, `SEDER_TEXT` at the top of `js/ui/seder.js`. The
owner approved them on 2026-11-07, shown the list and a man's message, and in the same
answer took out one line: a man who is the only one of the owner's men on a site used to
be told «👷 איתך: אין עובדים נוספים», and Rima's men can be on that site, so that site now
has its line and nothing under it. Every string is pinned word for word in
`tests/seder.test.mjs`, and the block's keys with them; changing one moves its pinned line
in the same commit.

What it is: in the WhatsApp dialog, under its green button, one more entry - nothing new
on the day screen. It opens a list of the men with a site on the day being viewed, in the
layer the group message reads: nobody marked נעדר, nobody on a הכל חופש day, nobody with
no site, never Rima, and a man on two sites once with both. Everyone starts ticked; any
man can be left out. One button walks the run: each tap opens `wa.me/<number>?text=` for
the next ticked man with his own message - the day and date, his site or sites, and who
else of the owner's men is on each by name (no line under a site where nobody is) - and the
person presses send inside WhatsApp. Each row also has
its own door to WhatsApp. A man is marked «נפתח בוואטסאפ», never "sent": the app cannot
see the send. A mark stops being believed once the seder it was opened for changes (he
was moved, a man joined his site, his number was corrected), and he is back in the run.

One tap, one man (found by review, measured in Chromium and WebKit before the fix): a
second tap while the phone is still on its way to WhatsApp used to land on the run's button
already redrawn for the next man, opening two chats and marking both, so the man whose
chat ended up behind the other got nothing while his row said ✓. Now, for 1.5 s after any
door on the list is used, every door does nothing - no navigation, no mark - and the run's
button keeps the man it just opened, whatever redraws the list meanwhile; it names the next
man once that moment is over. Two men on the list with one number (052-884-1930 and
+972 52 884 1930 are one) are each told so on their rows, «⚠️ מספר משותף עם …», naming the
other; both stay ticked, because two men really can share a phone and who is sent is the
owner's call. A number shared with a man who is not working that night gets no note: one
message goes to it, and the roster already badges it «מספר משותף».

Numbers: digits only; `05XXXXXXXX` becomes `9725XXXXXXXX`; `+972`, `972` and `00972`,
with or without the trunk zero, are kept as `9725XXXXXXXX`. Anything else - a landline,
`+970`, another country, two numbers in one field - is «אין מספר טלפון תקין» on the row
and cannot be sent to.

Kept: who was opened and who was left out, per date, on this phone only, in Store under
`farkadSederProgress` - fourteen evenings at most, written as an optional write so a full
disk never spends a restore point on it. Not in the record, not in the outbox, not in the
cloud, not in a backup, not in the rescue file, and it does not move the write fence. If
iOS kills the home-screen app while WhatsApp is in front, the next open within twenty
minutes brings the list back on the evening it was sending, with the next man ready.

No data model change, no rules change, nothing to coordinate between phones: an older
phone simply does not have the entry, and the progress is each phone's own.

What it does NOT cover: the hand-off from an installed iPhone app to the WhatsApp app is
the platform's (a real `<a target="_blank">` tapped by a person) and was measured in
Chromium only, never on a phone. A man taken OFF the seder after his message was opened
leaves the list, and nothing tells him. The entry always opens the whole day, even when
the WhatsApp dialog was opened for one site. The 1.5 s after a tap is a judgement of how
long a phone takes to leave for WhatsApp, not a measurement on one: a phone slower than
that can still take a second tap for the next man. A tap that marks a man while opening
nothing (the platform refusing the link) still marks him; his own door on the row opens
him again.

### The bottom bars on a stuck iPhone (the second commit)

What it fixes. The owner's iPhone 16 Pro Max, home-screen app, 2 November 2026, 20:37: the
tab bar and the copy/WhatsApp dock drawn about a third of the way up the screen with the day
list running on underneath them, the date header missing from the top, until the app was
closed. The ⋯ report read `visual=440x549` against `window=440x894` with nothing focused and
both bars' rectangles at the bottom (y 894), so v116's correction never fired: it looked for
the raise in the bars' rectangles, and it is not there. The reading this build acts on: iOS
keeps the visual viewport keyboard-short after the keyboard, WebKit draws every fixed layer
at its rectangle minus `visualViewport.offsetTop`, and offsetTop climbs to the shortfall over
the first 345px of every scroll down - which is why the report, copied at the top of the
page, shows the bars where they belong. While the frame is stuck the page now moves them
back: the bars by offsetTop (or by their own rectangle's gap, if that says more - never both,
never more than the shortfall), and by the same offsetTop every other fixed layer - every
dialog and sheet (the seder list among them), the ⋯ panel, the days drawer, the reorder
panel, the reminder banner - and the pinned date header by as much as it is pinned. "Stuck"
is narrow: `navigator.standalone === true` (an iPhone's home screen only), no pinch zoom, the
visual viewport between 150px and 70% of the screen short, nothing focused that raises keys
or a picker when it arms, and the frame still for 600 ms. It comes off in the same frame the
viewport is whole again. A field tapped inside a dialog the drop is holding (the picker's
search box) does not take it away: the keys hide the bars as they always have, and the dialog
stays where it is under the finger. No data, no rules, nothing to coordinate between phones;
no Hebrew string is new or changed. Android, a Safari tab and a wide screen are untouched.

What it does NOT cover. **It has never run on a real iPhone.** Everything above is measured
in Node (`tests/bars.stale.test.mjs`) and in Chromium with the visual viewport faked before
the app loads (`tests/bars.stale.browser.mjs`); no engine here can be made to push a layout
viewport, so where a layer lands on the glass is WebKit's rule written into the tests, taken
from public WebKit sources and one screenshot. **The trigger is unknown** - what leaves the
visual viewport short - and nothing here prevents it; whether it also happens at the very top
of the page was never answered. If offsetTop does not move on his phone while the bars are
up, the drop has nothing to follow and the bars stay where v165 left them: the new ⋯ lines are
there to say which. Sticky layers that are not fixed and not the date header (the week grid's
header row and name column) are not moved. A field tapped while the frame is already being
held keeps it where a whole viewport would put it, which may leave a field low in a dialog
under the keys. Landscape on that phone is wider than 700px and is not covered.

How to read the new ⋯ lines. Copy the report after the bars have been up, before closing the
app; it is opened at the top of the page, where the drop is 0 even when it has been working,
so most of what matters is what it did this session.
- `body.bars-lowered` - whether a drop stands right now.
- `bar.drop=now=… max=… stale=… times=… why=… frame=… header=…` - the drop now, the most it
  moved the bars this session, whether the frame counts as stuck right now, how many times it
  was found stuck, why the rule is off (`-` when on; `whole`, `settling`, `input-view`,
  `not-home-screen`, `zoomed`, `implausible`, `no-floating-bar`), and the overlay and header
  drops now. The `bar.*` rectangles above it include the drop: subtract `now`.
- `bar.trigger=<what stirred the viewport> after <the last field that raised keys>` - frozen
  each time the frame is found stuck, by the field's shape (tag, type, id, class), never its
  value. The trigger question.
- `bar.seen=short=… offsetTop=… pageTop=… rectGap=…` - the largest shortfall, offsetTop,
  scroll and rectangle gap seen while the frame stood short and still, whether or not the rule
  acted. `short≈345 offsetTop≈345`: the model holds and the drop had something to follow.
  `short≈345 offsetTop=0` with a large `pageTop`: the model is wrong for this phone and the fix
  did nothing - say so. `rectGap=0`: rectangles are measured from the layout viewport;
  `rectGap≈offsetTop`: from the visual one (both are handled; it says which this phone is).
- `ios.standalone` - the raw flag the rule reads; it must be `true` on the home-screen app.
  (`standalone` above it is `isStandalone()`, which an installed Android app also says yes to.)

The stamps stay v167 for all three commits; none has been served. The build-stamp checks
(`tests/build.test.mjs`, `tests/gate.integrity.test.mjs`) ask that no cached file change after
the commit that wrote the stamps, so before release the three land as one build commit or the
stamps move. The v116 block of `tests/mobile.test.mjs` moved deliberately: its four claims are
unchanged, the phone they are asked of is now a home-screen one with a whole visual viewport
reading that has stood still.

### The day screen, decluttered (the third commit)

The owner approved the mockup on 2026-11-04 («إيه، هيك منيح»): the v167 judge's option 1, A
and B1, with A amended so the sheet stays on the man it was opened for.

What moved where.
- **The rate select left every row of every site card**, and the overtime hours box beside it
  with it. A row is now the man's name, the ✕, and a tag only when his day on that site is
  not regular - «יום כפול» or «שעות נוספות», the rate's own label (`RATE_LABELS`) word for
  word, in the colours a double day already had. «2 אתרים» stays, a little larger (14px).
- **The man's name is the way in.** It is a target at least 44px each way and opens the
  assign sheet for him, whose rate chips «רגיל» / «שעות נוספות» / «יום כפול» and hours box
  were already there, each step undoable. That is where the kind, and the overtime hours, are
  chosen now.
- **Opened from a row, the sheet stays on him.** «נעדר», or taking him off his site and
  putting him on another, leaves the sheet on him, and it has no forward button. Opened from
  «נרשמו X מתוך Y» or from a row of the by-worker list, it walks the evening exactly as
  before. (A name in the tray opens the place picker, as it always did, not the sheet.)
- **B1: scrolled, the compact header is one row again.** v116 had put «הכל חופש» on the
  switch's line, and the compact header hid the switch but left the line: a header 104px tall
  around a 44px row at 440, 390 and 320 wide. Now 57.
- **One thing the mockup did not show: a double tap on a name is one tap.** The sheet opens
  over the row at once, and a second tap 120 ms later landed on whatever the sheet put under
  the finger - a site's tile (a second site for him) or, where the sheet opens below the
  finger, the backdrop (closing it). For 700 ms after a row opens it - the ✕'s own
  `DOUBLE_TAP_GUARD_MS` - a finger on the sheet does nothing; a keyboard still acts at once.

What did not change. No Hebrew string is new or changed. The record, the rates, the money
arithmetic and every report are untouched: a rate chosen in the sheet is the same one-path
`setRate` commit the select made, now through the sheet's undo. The by-worker list is its own
row and is unchanged. The Rima box stays on each site card exactly as v166 drew it (whether it
moves to the site's header line is the owner's open question, not part of this). Each row
keeps its place key (`row:<site>:<man>`, the v166 scroll fix) and the ✕ its double-tap guard.
The name button's screen-reader name is built from the pieces already in use - the man, ב and
the site, the rate's label («מוחמד עודה ברחובות - הדר · יום כפול») - and takes the place of
the select's «תעריף של … ב…».

What it does NOT cover. Measured in Chromium with touch emulation at 3x
(`tests/declutter.browser.mjs`), never on an iPhone. The row no longer says how many overtime
hours a man has, only «שעות נוספות»: the number is in his sheet (and on the by-worker list's
tag). Choosing a rate is now a tap on the name, a chip and «סגור» where it was one select. The
700 ms is a judgement, as the ✕'s is: a tap on the sheet sooner than that after opening it from
a row does nothing and has to be made again.

Tests moved with it, deliberately, each for the same reason - the control it drove left the
row: `tests/smoke.mjs` chooses the per-site rate with the sheet's chips (its arithmetic
unchanged) and asks the man's name, not the select, to say whose day at which site it opens;
`tests/scroll.browser.mjs` chooses «יום כפול» in the sheet and closes it, and asks its
focused-box question of the hours box in the sheet (the focused select case is gone with the
select); `tests/rima.browser.mjs` asks its half-typed-hours question of the sheet's box;
`tests/mobile.test.mjs` measures the name's target at 200% text where it measured the select,
and its comment no longer says the day has a select; `tests/bars.stale.browser.mjs` names its
probe select for what it is.

### Two Rima additions on the billing page (the fourth commit)

Both approved by the owner on 2026-11-07. Nothing a man is paid from moves: pay, advances,
pay cycles, closures and «לפי עובד» read only `plan`/`actual` by worker, as before
(`tests/rima.test.mjs` compares every money surface byte for byte).

**The workbook's `רימא` sheet carries the paper's note** («ممكن تضيفها نعم»). Under the total
line, one empty row, then in the first column alone: «עובדי רימא בלבד. אינם נכללים בשכר. בגיליון
החיוב כל אחד מהם נספר כיום עובד־אתר אחד.» - the paper's line with «בחיוב שלמעלה» made «בגיליון
החיוב», because in a workbook the billing grid is another sheet. Every count above it stays a
number a SUM reads. The CSV fallback's Rima file is written from the same rows, so it carries
the line too. Pinned word for word.

**«בלי עובדי רימא»: the invoice without Rima's men, on the same page** ("a list without
Rima's men on the same page"). The invoice's own grid - its dates and its sites, in its order -
with each cell counting only his men (`workersAtPlace`) and no Rima count added; its total line
is the invoice's own «סה״כ ימי עובד־אתר». One function builds it (`invoiceWithoutRima`,
js/model/money.js, read off the invoice itself), for the screen and the sheet alike, and with
the Rima table it IS the invoice: every site, every day, every day's total, every site's total
and the grand total, measured. A day billed only for Rima's men is a row of it at nothing.
- On the page: the invoice, then «בלי עובדי רימא», then «רישום לרימא».
- Only when the range in scope has a Rima count (otherwise it would be the invoice again), with
  the Rima table's scope rules: one client's site chosen, it narrows to that site and the
  dates it was billed; a client whose site had no Rima gets neither table.
- **Screen and workbook only** («شاشة وإكسل بس»): the print stylesheet hides it and
  `readReportPrintout` (js/ui/printout.js) leaves it out by name, so the paper and the picture
  are what they were. In the workbook it is a sheet named `בלי עובדי רימא`, right after `חיוב`,
  under the same condition - in the bookkeeper's file and in the client's alike, since the
  workbook is his to hand over or not. The CSV fallback writes it as one more file,
  `farkad-invoice-without-rima_<from>_<to>.csv`, beside the billing and Rima files, and says
  "the files" as it already did for two.
- No new Hebrew words but the title.

What it does NOT cover: the client's workbook (one site chosen) carries the new sheet too,
under the Rima sheet's own condition; if the owner wants a client's file to stay the billing
grid and Rima alone, that is one condition to change. The picture and the paper were checked
in Chromium, not on a phone's print sheet.

Tests moved with it, deliberately: the sheet lists in `tests/rima.test.mjs`,
`tests/xlsx.test.mjs` and `tests/rima.browser.mjs` gain «בלי עובדי רימא» right after `חיוב`;
the `רימא` sheet's "last row is the total line" became "the last row of numbers is the total
line", with the empty row and the note after it, and its column sums read the date rows only;
the client's CSV fallback in `tests/exports.test.mjs` is three files, and its Rima file ends
with the empty line and the note. Their arithmetic checks are unchanged.

## v166 — רישום לרימא: the other company's men, counted per site (served 2026-11-07)

**Served on 2026-11-07.** PR yoseffarkad1-eng/farkad#53: commit `71d918c`, merged into main
as `2931841` (the same tree). One commit on v165 (`e34fb66`), which is what a phone that has
not updated still runs. Owner-approved spec, 2026-11-01. No gate result is written here:
validation is recorded against the exact clean commit in the release PR, and no count is
carried over from another commit.

Workers from another company, Rima (רימא), work on the owner's sites. Each site card on
the day screen gains a small number field labelled `רימא`: how many of Rima's men were on
that site that day. A number only, 1-99 (sized for 1-10; 0 or empty clears it). A day may
carry Rima and none of the owner's men.

It is stored as one field path per edit, `days.<date>.rima.<placeId>`, and a clear is a
field deletion. No rate, no name, no worker id: payroll, advances, pay cycles and
closures read only `plan`/`actual`, so no shekel moves (`tests/rima.test.mjs` measures it).

The client's invoice DOES count them - the owner's ruling, 2026-11-01: for the client a
Rima worker is one worker-site day exactly like one of his own, so three of his and two
of Rima's on a site is five, and a day with only Rima's men is a billed day. That is in
`invoiceReport`, so the grid, the bars, the paper, the picture and the `חיוב` sheet all
carry it.

How many of those were Rima's is shown as its own table, never as a column of an
existing one, on three surfaces built from one function (`rimaReport`): under «לפי אתר»
on screen and on paper as `רישום לרימא` with its own dates, only the sites that had
Rima, `סה״כ עובדי רימא`, and the line
`עובדי רימא בלבד. אינם נכללים בשכר. בחיוב שלמעלה כל אחד מהם נספר כיום עובד־אתר אחד.`;
and in the workbook as a last sheet `רימא` of real numbers. With one client's site chosen
for printing, the table and the sheet narrow to that site. «לפי עובד» is unchanged.

The day's WhatsApp message carries NO Rima - the owner's decision, 2026-11-02: the
message is the seder, in Hebrew, for his own crew, and Rima's men are for the client's
bill and nothing else. No heading, no site line, no total, in any template, for the whole
day or for one site; a day with only Rima's men reads exactly as v165 reads a day with no
assignments (`אין שיבוצים ליום הזה.`, or its one-site form). `tests/rima.test.mjs`
measures every template, the whole day and each site, against what the same phone wrote
before a count was typed and against v165's own `share.js`, out of Git.

Rules: `firestore.rules` does not restrict nested field paths, so an ordinary protocol
write admits the new path. NO rules change and no rules-first step.

**THE ROLLOUT RULE: every phone on v166 before the first Rima count is typed.** The owner
has two active phones and they update separately. Until both show v166 (⋯ names the
version), nobody types a count, and:

- no rescue file, backup file, restore point or cloud copy is restored across builds -
  not an older phone opening what a v166 phone wrote, not a v166 phone opening what an
  older one wrote;
- no window of an older build stays open beside a v166 window on the same phone;
- client invoices are printed and exported only from an updated phone.

Every item under WHAT THE RULE IS FOR below needs a phone or a window still on v145/v165
while counts exist, so the rule closes all of them. WHAT STAYS OPEN stays open whatever
is done.

Before anything was served, the first review's findings were fixed in this same commit
(2026-11-02), each measured in `tests/rima.test.mjs` or `tests/rima.browser.mjs`:

- a count another phone cleared no longer comes back at an offline open, and correcting
  it is no longer refused;
- a stale offline count no longer beats another phone's clear or move - it is held;
- a held count is drawn in ⋯ with both sides and both buttons, so it can be decided;
- a phone that last wrote on v145/v165 shows the cloud's counts as soon as it updates,
  and its daily cloud copy carries them;
- ↶ no longer takes back a man's day after a count is typed;
- the day arrows land on a Saturday that holds only a Rima count;
- tapping from one site's box to the next moves the focus into the next box (measured in
  Chromium; whether the iPhone keeps its keyboard up was not checked on a phone).

And the second review's (2026-11-07), in the same commit:

- the stale count is held on the roads the first fix missed too: the phone's own first
  write of it landed and its answer was lost, or was answered while its echo had not yet
  arrived. A count handed to the cloud is written down as possibly there (a try mark),
  sent again alone under its own name so the receipt can answer for it, and its own
  earlier 'nothing' is no longer read as the cloud's. An attempt that never left the
  phone is not written down: the adapter says so (no signal), or the edit was never
  handed to it - a phone never told a revision (a new install, storage the browser
  evicted) sends first through a cutover that carries no edit, and its correction is no
  longer held at the next signal against a cloud that never saw it;
- one attempt carrying two days' counts, its answer lost: a hold on one day that takes in
  that attempt's own count no longer sends the other day's count alone, over the other
  phone's clear of it - the attempt is no longer a replay, and the other day's count is
  asked again as one that may already be there;
- a count moved offline while the other phone corrected the old site holds the day's
  counts together, so the other phone no longer bills both sites while the hold stands; a
  count the cloud already holds exactly as this phone does is not held with them;
- a held count's row in ⋯ draws the day's other sites, both sides, so a move is seen as a
  move before it is kept or taken;
- while a count is held, the phone's own saves are heard as its own echo again and
  redraw nothing - and a copy that has lost the held count gets it back at the first
  snapshot;
- a redraw (another phone's write, a late echo) no longer commits half-typed digits in a
  Rima box or an extra-hours box on Chromium (the Galaxy): the 1 of a 12, or a clear while
  deleting to retype. They are dropped there, as they are in Playwright's WebKit (not
  checked on a phone);
- ↶ is forgotten after a count, or a worker's edit - one man's, or a bulk one: every
  unrecorded man into one site, a day copied in, a site emptied - that the disk guard
  kept in the journal because another window of the app wrote first;
- ↶ is forgotten by every restore door, so it can no longer put a man's day from before
  the restore over the restored record (inherited from v165);
- a client's CSV fallback that hands over the billing file AND the Rima table says
  "the files", not "the billing file";
- an export of chosen workers no longer fails: the workbook ended in «היצוא נכשל», and
  the CSV fallback stopped after the pay sheet without a word (inherited from v117).

WHAT THE RULE IS FOR - the phones that have not updated:

- v145 and v165 rebuild a day from the layers they know, so they do not keep `rima` in
  their OWN copy and do not show it. They never remove it from the cloud through an
  ordinary edit (one field path each; worker deletion removes worker paths only) -
  measured against their real code in `tests/rima.test.mjs`.
- Because the client's invoice now counts Rima's men, an invoice printed or exported on
  a v145/v165 phone is SHORT by every Rima count.
- A whole-document RESTORE run on a phone still on v145/v165 (a backup file, a restore
  point, a cloud copy) writes a document with no Rima counts and erases them for all
  phones.
- The same erasure from a v166 phone: a daily cloud copy, restore point, undo entry or
  backup file WRITTEN by a v145/v165 phone carries no counts, and v166 restores it
  without a word - a missing layer is not a problem to its restore gate - so every Rima
  count on every date is gone from the cloud and from every phone, and the person is told
  only that it was restored («שוחזר מהענן.», «שוחזר.» or «הגיבוי נטען.», by door). The
  daily cloud copy is written by whichever phone opens first
  that day, and the list shows dates, not builds. The way back is the restoring phone's
  own state from before the restore, which undoes the restore with it.
- A v166 backup or cloud copy opened on a v145/v165 phone is refused there with
  "שכבה שאינה מוכרת: rima" - refused out loud, not restored without the counts.
- A v166 RESCUE file is the exception. When the exporting phone still carries the legacy
  v1 record (`scheduleData`, kept for ever on a phone that started on v1), the older
  rescue door skips the v2 record it cannot read and offers the v1 reading instead, with
  whatever edits were still queued in the file, naming only `scheduleData` in its
  «לטעון קובץ חילוץ?» dialog. Confirming replaces the record on every phone: every Rima
  count, and everything recorded since the v1 migration, is gone. Without those v1 bytes
  the file is refused out loud, as above.
- A v145/v165 window still open on a phone where a v166 window writes a count is held
  out loud there (the shared disk now holds a layer it cannot read); a v166 reopen has
  everything. If that older window instead adopts a snapshot after the count was
  collected, it writes the shared disk without the count, and the v166 window can show
  it missing until its next snapshot; the cloud keeps it.

WHAT STAYS OPEN, rule or no rule:

- Digits typed into a Rima box or an extra-hours box and not yet committed (the box not
  yet left) are dropped when a render arrives first - another phone's write, a late echo
  of this phone's own - and the focus leaves the box with them. The box then shows what is
  stored, so nothing is claimed as saved. Until the second review Chromium (the Galaxy)
  COMMITTED them instead; it no longer does. A count of 1-9 is complete at its first key
  and is dropped the same way: look at each box once the keyboard is gone.
- The same Rima men recorded at two different sites by two phones - typed fresh on each,
  or each phone moving one count to a different site - are both kept and both billed. A
  count has no identity beyond its site, so nothing collides: nothing is held and every
  phone says synced. Both counts are on the day screen and in רישום לרימא. The rule for
  the owner: a count, and the site it sits on, is entered or corrected from one phone.
- A count whose own earlier attempt may have reached the cloud (its answer lost) and
  that is then corrected can be held against an empty cloud even when nobody cleared it -
  once another phone has written anything since - because this phone cannot tell its own
  landed count cleared by somebody from one that never landed. ⋯ keeps it in one tap.
- A count held at the moment a hold is decided holds every other count still owed for
  that day with it - a move is two counts, and nothing tells it from two new ones - so an
  unrelated new count typed the same day offline is held too, and is sent by keeping it
  in ⋯.
- A held count decided in ⋯ before the snapshot carrying the other phone's change has
  arrived is decided on what this phone has heard: the row can show no move and an older
  cloud side, and a count kept there is not held again. Narrow: the count's first answer
  lost, the flush refused by the server, and the decision made inside that window.
- The workbook and the CSV carry the רימא sheet with no sentence saying its men are
  already counted inside חיוב; the screen, the paper and the picture carry the note. A
  wording for the file is the owner's to choose (law 6) and is not in this build.
- One malformed count in the cloud (only a hand edit or a future build could write one)
  is refused like a malformed vehicle run: the snapshot is kept whole as evidence under
  the existing sentence about an invalid financial record, and nothing on the device is
  replaced - on EVERY phone, and every further snapshot spends one more quarantine slot.
  Once the ladder is full the phone can no longer commit, and every reopen is held again
  until acknowledged, even after the cloud is corrected (measured by the first review on
  `cc23b58`: twenty snapshots).
- `firestore.rules` does not type-check `days.*.rima.*`: any value is admitted at that
  path, so the refusal above is the client's alone.
- ↶ after the rate select, the extra-hours box, נעדר, הכל חופש, the 'לא נרשמו' tray's
  site picker, or a held record decided in ⋯ still takes back the step before them: those
  commit without offering or forgetting an undo. Inherited from v165 (a Rima count decided
  in ⋯ goes the same way); a count typed on the day screen no longer adds one.
- The price of keeping counts out of the kept ring: a count wiped from this disk by an
  OLDER build's window is no longer put back offline at boot. The cloud keeps it, and the
  next snapshot brings it back - one that carries this phone's own stamps included, and a
  count this phone holds for a person included.
- Focus moving from one Rima box to the next was measured in Chromium and probed in
  Playwright's WebKit. It was not checked on a real iPhone.
- The 13:00 Rima reminder (Cloud Functions) is not in this build.

THE DAY SCREEN NO LONGER JUMPS TO THE TOP (same build; not a Rima change). Every tap that
recorded something on the day screen threw the page back to its top: a ✕, «בטל» on the
undo bar, ↶ and ↷, a man added from a site's ＋, a site chosen for a man in «לא נרשמו», a
rate, a Rima count - and every snapshot adopted from the other phone, with no tap at all.
renderDay emptied the day, put the header back alone and then read `window.scrollY`
(readDayScroll); that read laid out a page one header tall, the browser clamped the
scroll to 0 there, and the compact header was dropped with it. Closing a dialog did the
same through the focus it gives back: on an iPhone a tap focuses nothing, so that focus
could be ⚙ in the top bar, and `focus()` scrolled up to it.

The day is now built off the page into a fragment and swapped in whole
(`replaceChildren`, with a two-step fallback for a browser without it - every phone here
has it, iOS 14 and later); the rows that were on the screen, keyed by `data-anchor` (a
site's head, a man's row on it, its רימא box, the two trays, a by-worker row), are put
back where they were - so the page moves only when something ABOVE the screen grew or
shrank, and then by exactly that much; and the scroll is read last, on the page the
person will see. The keys are matched through a map, so no id is ever escaped into a CSS
selector. A dialog gives the focus back with `preventScroll`. What must still move does:
a new date opens at its top, and the header still compacts and comes back.
`tests/scroll.browser.mjs` measures all of it at 440x894, 390x844 and 375x667, dark, 3x,
touch, with every site's number on screen checked against the record and the disk after
each operation: 174/286 on the commit before this fix, 286/286 with it.

A DOUBLE TAP IS ONE TAP. With the page held still, the man below a ✕ slides up under the
finger, and a double tap - 120 ms or 400 ms apart, measured at all three sizes - took off
two men of one site. The site's picker had the same trap without any sliding: «+ הוסף»
turns into «✓ נמצא» in place, and the second tap took the man straight off again, the
undo bar saying he was removed - the owner's "I added him twice and he was deleted". Two
more of the same, measured at all three sizes: the ✕ on a chip in «נעדרים», where the next
man's chip slides into its place (a double tap cancelled two absences), and a site in the
tray's place picker «לאן הלך», which also turns into its own opposite in place (a double
tap put the man on the site and took him off again, leaving him unplaced). Now a row's ✕
(by site or by worker) less than 700 ms after the previous one (`DOUBLE_TAP_GUARD_MS`,
js/ui/day.js), a «נעדרים» ✕ less than 700 ms after the previous one, the same man's row in
the same site's picker tapped again within 700 ms, and the same site in «לאן הלך» tapped
again for the same man within 700 ms, do nothing at all: no commit, no undo bar, no
redraw. The 700 ms run from the previous tap whether or not that one was let through, so a
burst of taps is one tap. A second tap 900 ms later does what its button says - the next
man off, the next man's absence cancelled, or the site taken away again. Each pair in the
suite is judged by the gap the PAGE saw between its two taps - the clock the guard reads -
because a loaded machine delivers them further apart than they were sent: 400 ms arrived
as up to 608 ms on a quiet run, and a busy machine can push a pair past 700 - the likely
reason seven checks of an earlier draft, which judged by the gap sent, failed on one heavily
loaded run. A pair that lands on the wrong side of 700 ms is tried again in a fresh page,
and a third such pair fails. `tests/scroll.browser.mjs` with this commit's
checks: 602/646 before it, 646/646 with it;
`tests/move.browser.mjs` 57/58 before it, 58/58 with it - its pair of fast taps on one
picker row used to pin add-then-remove, and now pins one add. No Hebrew string and no
record path changes.

A RENDER UNDER A FOCUSED BOX, measured and not changed. The swap takes a focused Rima box,
hours box or rate select out of the page, and Chromium fires its blur - and, for a box
that was typed in, its `change` - right there, inside renderDay. A `change` that committed
would render inside the render (a first draft of this fix, on a tree without v166's
dayTearingDown, threw NotFoundError from replaceChildren that way) and would record
digits nobody finished typing. Measured for each of the three boxes under a commit
elsewhere, an adopted snapshot, and the assign sheet closing, at all three sizes: nothing
throws, no console error, no commit but the one made, exactly the change the render
brought, in memory and on the disk. It already held before
this commit - dayTearingDown keeps the two boxes from committing as the swap takes them
away, and a select fires no `change` when removed - so no re-entrancy guard is added.

COMING BACK FROM THE WEEK. Back on the day from the week tab, the window now stays where it
was instead of landing at the top - measured at 703 px after the week at 440x894 and 800 at
375x667, with the day scrolled to 800. The top it used to land on was the clamp's doing,
not anybody's decision; it is pinned now, in `tests/scroll.browser.mjs`. A new date still
opens at its top.

What the fix does NOT cover:

- It was never measured on a real iPhone. Chromium with touch emulation, and Playwright's
  WebKit by hand, which is not iOS Safari: no on-screen keyboard, no visual viewport that
  shrinks under it, no rubber band.
- The end of the page. The browser cannot scroll past the bottom, so nothing there can be
  held: when the undo bar times out with the list scrolled to its very end, the page gets
  shorter by the bar and what is on the screen comes down with it (not measured here); and
  when a site is chosen for the last man in «לא נרשמו» with the page at its end, the card
  above grows by his row while the tray shrinks by as much. The bottom bars, measured a
  frame after the render, give 22 px of it back, and settleDayAnchor (called from
  js/ui/bars.js once they are measured) takes them: the rows on the screen move down by the
  remaining 36 px, less than a row (54 px), measured at 440x894 and at 390x844 - 58 px
  before that settle. Pinned in `tests/scroll.browser.mjs` as less than one row.
- A rate select or a Rima box that has the focus is still a new element after any render,
  another phone's snapshot included: the focus goes, and digits not yet saved go with it,
  exactly as before.
- The double-tap guard is a window of time, not a test of where the finger landed: a
  second ✕ the person MEANS, inside 700 ms of the first - on a row or on a «נעדרים» chip -
  is ignored too, and so is a picker row or a «לאן הלך» site tapped again that fast.
- The header's ↶ and ↷ sit on the row the compact header hides, as in v165. Scrolled down,
  «בטל» on the undo bar is the way back for its twelve seconds; after that, the header,
  scrolled up to.

## v142 — Galaxy reminder setup (2026-10-05)

Reminder settings now support the owner's father's Galaxy phone as well as iPhone.
Android opens a short Samsung/Google Calendar setup guide with the chosen weekdays,
18:00 Israel time, event-time alerts and series editing/cancellation. Device selection
is automatic on Android and can be changed manually. iPhone subscriptions are preserved.
The screen does not claim the user's Calendar or notifications have been enabled.
No worker, financial or synchronization records change.

## v141 — a clear daily reminder through iPhone Calendar

Settings adds a readable 18:00 Israel-time reminder card with workday choices,
native Calendar handoff, a selectable subscription address and an ICS fallback.
The owner chose Calendar rather than a new push backend. Enabling and cancelling
happen in Calendar; opening a link is never labelled as an active reminder.
The public recurrence contains no employee data and remains at 18:00 across
daylight-saving transitions. Existing work records, sync and pay calculations
are unchanged. See `docs/calendar-reminders.md` for activation and validation limits.

## v140 — the owner's reading preferences across the app

The screen theme follows the phone, with stronger text and site-name contrast,
larger essential type, modest corners and visible card boundaries. Navigation has
labelled icons; the existing compact fallback preserves room at extreme text sizes.
Measured bar spacing reserves the room it actually occupies. Worker and site secondary actions move into named More menus,
retaining the existing edit, archive and guarded deletion handlers. Worker report
details use the full phone screen with a persistent return action. Optional wage
help opens from an information control. Entrance motion respects reduced motion.
Enlarged text can expand cards into one column. Paper, exports, stamped wages,
ledger entries, sync rules and the disabled vehicle feature retain their behavior.
Opening panels fades without resizing touch targets. Early stylesheet failures are
remembered by their links and reported when the boot diagnostic is ready; one
successfully loaded stylesheet cannot hide the failure of the other.

## v139 — owner's plain-language pay cards

Compact worker cards show ימי עבודה (the existing payable day units) and חופש
(recorded absence, never inferred from missing dates). Double days still count as
two payable units. Attendance dates and advance deductions remain in worker details
and the full report rather than on the outer tile. The compact footer shows only
its worker count and payable total; detailed tables, paper and exports are unchanged.
The card still opens the full dated worker record through the existing action.

## v138 — consistent primary navigation

The phone bar uses one outline-icon family and a small active-icon pill while
retaining its labelled targets and measured safe-area spacing. Advances gains an
outline wallet icon instead of a differently sized text glyph. The tablist has a
name and one keyboard entry point. RTL arrows, Home and End move focus; Enter or
Space activates through the original guarded navigation path. No view-switch
guard, day record, ledger, vehicle flag or financial calculation changes.

## v137 — quieter report controls and readable payroll cards

Reports group type, period and worker scope in one filter panel. Worker search gains
a clear action and a live result count without changing the selected report scope.
Pay-cycle navigation and display choice share one wrapping row. Compact cards lead
with worker identity and the existing prepared payable amount, label its currency,
and separate attendance from pay units. Unknown amounts remain unknown. The grid
uses one column when enlarged text needs it. Empty footer rate cells no longer
appear as a zero in the compact screen view. Canonical tables, output boundaries,
stored records and all financial calculations are unchanged.

## v136 — a consistent daily task-dialog package

Task dialogs share wrapping headings and phone spacing. Worker search offers an
explicit clear action, result counts and recovery from no matches. Worker actions
name both person and site and expose their selected state. Place choices carry the
existing site colour and selected check. The assignment sheet names the current
recording state. Message preview identifies its date and site scope, keeps the
original message text, and separates the primary send action from copy and close.
Optional worker fields have persistent labels and validation messages are distinct.
Cars remain disabled. No assignment, pay, ledger or synchronization rules change.

## v135 — clearer daily recording and worker selection

Worker selection gains a name search that keeps the open list order, preserves the
filter while adding/removing people, and resets for the next site. Missing records,
absence and other-site assignments are labelled explicitly. The selected day appears
in both pickers, and opening worker selection focuses the heading without opening the
keyboard. Place choices form a wrapping grid. Phone rate controls are grouped under
each site name; the worker list distinguishes missing work from absence.
The underlying assignment, pay and sync operations are unchanged.

## v134 — compact daily site headings

Phone site cards use slimmer headings and tighter spacing around worker rows.
An empty site keeps its name, empty-state text, count and add button in one heading.
Completed recording and empty absence sections fit on a compact wrapping line.
Site actions use drawn icons with their existing accessible labels and 44px targets.
No payroll, stored record, site order or vehicle setting changes.

## v133 — clearer daily site records

Daily site cards use tighter heading spacing, bold worker names and row dividers.
Rate controls are visually distinct from names; long names can wrap without losing
split-site badges. Missing records, completed recording and confirmed absences have
separate labelled visual treatments. The site count has a spoken label. No record,
calculation, site order, vehicle gate or default week view changes.

## v132 — compact worker card grid

Phone reports default to compact cards that share a row when space permits. Cards
show the worker name, the prepared net amount, attendance/pay units and deductions,
and open the existing worker detail sheet. Full detail remains available with a
view toggle. Larger text and narrow screens naturally use one column. Cards read
the same prepared table cells; print, image and spreadsheet keep their original data.

## v131 — clearer payroll groups and cards

Mixed-cycle reports offer quick navigation to either payroll group with worker
counts. Group headings, worker amounts and group totals are easier to distinguish.
The repeated explanation of attendance versus pay units expands on demand. Printed
tables, monetary warnings and all calculations remain unchanged.

## v130 — a quieter reports workspace

One report heading and an expandable output menu replace the repeated headings and
large action row. Filters use a flat compact layout. Open-account guidance expands
on demand; payment-period warnings remain visible. Print layouts and amounts remain
unchanged.

## v129 — compact report controls

The date range is a single expandable row; presets appear only when changing it,
and collapse after selection. Custom dates remain open for editing. Worker selection
has a shorter summary. All financial explanations and output boundaries are retained.

## v128 — organised reports page

Report type now comes first, followed by one panel for dates and worker selection,
then a separate row for printing, sharing an image and exporting. Worker selection
has a name search, retains its open state and keyboard focus after selection, and
keeps selected workers when the search changes. Mobile payroll cards and site totals
have clearer surfaces and headings. Printed reports retain their existing layout.

The controls do not write to the shared schedule or change payroll calculations,
payment cycles, client export boundaries or either payroll group. Verification and
publication evidence is recorded against the exact candidate commit in the PR.

## v127 — weekly table first, without Saturday

Opening the week always shows the table immediately. Saturday is omitted from the
weekly table, day picker, paper and image, without removing or changing saved records.
Calendar navigation still advances a full seven days. On a phone, tapping a date heading
opens its full-text detail with a back button. Reopening the week resets to the table.
Landscape printing is retained.

## v126 — landscape weekly printout

Weekly paper uses a named A4 landscape page with 10mm margins, a visible date-range
heading, full site/rate text and wrapping worker names. Headers repeat across pages;
rows are not squeezed into one sheet. Payroll/invoice paper stays portrait. The iPhone
PNG fallback is landscape too and draws site/rate words beside each color marker.
The weekly screen is unchanged.

A real-PDF browser suite checks page dimensions, all 30 workers and seven sites,
pagination, overtime, bounds, portrait report isolation and landscape image text.
Exact release-gate and deployed-tree evidence is recorded in the PR.

## v125 — readable phone week

On screens up to 700px, the week opens on a selected day with full worker/site names,
explicit double-day and overtime labels, and separate absence/no-record groups. The
seven date buttons browse without changing the day being edited or writing work.
The original weekly grid remains available from “טבלת שבוע”; desktop and print still
use that grid. Phone navigation groups previous/current/next week together.

The new week browser suite covers dates, two-site counting, inactive historical
workers/sites, redraw, empty days, editing the selected day, narrow screens, dark mode,
doubled text, desktop and print. Existing grid geometry regressions explicitly select
the retained grid. Exact release-gate counts and deployed tree are recorded in the PR.

## v124 — compact crew page

The crew heading occupies one row on ordinary phone text sizes. Search comes before
paste/reorder tools and keeps its accessible label. Reduced panel/card spacing brings
names closer to the top without reducing 44px controls or 16px inputs. Worker activity,
pay cycles, financial records, and synchronization behavior are unchanged.

Validation is recorded against the exact candidate commit in the release PR; browser
coverage measures the lead-in, ordinary card height, and collapsed inactive rows in
addition to the existing small-screen, large-text, search and edit checks.

## v121 — include both payroll cycles in shared report images

A mixed payroll report contains one table for weekly workers and another for fortnightly
workers. The image export read only the first table, silently omitting the second group.
It now reads every table in the visible report section and draws each group with its own
payment-frequency heading, columns, rows and totals. The common report title/date appears
once. Selected-worker filters still apply; client exports still exclude payroll. All
numbers come from displayed cells, with no change to payroll, advances, sync or data.

A browser regression reproduces the omission before the fix and checks both names,
different column sets, both totals, real PNG ink and bounds, DOM-only values, and a
fortnightly-only selection. The existing print/image suite and full release gate validate
the exact candidate commit; final results are recorded in the release PR.

## v120 — delete accidental names with empty day placeholders

The reported inactive duplicate had three `{entries: []}` rows and no work or absence.
v119 counted these as history and hid deletion. The worker card now shows an explicit
permanent-delete button, disabled with the reason when protected history exists, and
counts empty placeholders separately. Only exact empty placeholders can be removed;
work, absence, rate stamps, advances, ledger history and vehicle ownership still block.

Typed confirmation deletes by worker ID, preserving a different worker with the same
name. Empty row removals and the roster tombstone share one durable journal batch and
one protocol transaction. The production adapter uses Firestore `deleteField()` only for
worker-day removals; roster tombstones remain literal nulls. Cloud documents therefore
contain no new nullable day shape for older readers. Replays and creation seeds use the
same semantics. A concurrent real work entry contests the deletion instead of being erased.

Validation covers duplicate names, two phones, reopen, storage refusal, racing work,
mobile-dialog button visibility and the real Firestore adapter against the local emulator.
The full release result belongs to the exact tested commit in the release PR. Updating
the app alone removes no worker or business record. No live rules or data are changed.

## v119 — remove accidental unused workers

Owner requested permanent removal of old names entered by mistake. The worker card now
has `מחק עובד לצמיתות` for active or inactive workers with no day/absence records,
advances, immutable financial history, or vehicle ownership. Confirmation requires typing
the exact name. Shared names require completed protocol sync; local-only typos can be
removed offline. Recovery holds, unreadable queues, pending restores and unavailable
storage prevent deletion. Confirmation rechecks current history and the captured name.

Deletion uses the existing atomic roster journal/tombstone operation. Old roster arrays
cannot revive an unused name. Work arriving later from an offline phone restores the
identity as inactive and retains the work, wage and pay-cycle history. Ledger-only history
also restores the identity before weekly closures are validated. No live worker is deleted
by installing this release, and no Firebase rule or financial gate changes.

Validation is recorded against the exact clean commit in the release PR; counts are not
inherited here. Added worker-deletion scenarios and updated the browser's shipped-default
expectations. Existing disabled-client behavior remains an explicit fixture.

# What has actually been served

One line per build that reached `main`, newest first. `main` is what the live site
deploys, so a build is not released until it is here — a branch full of verified work is
not a release, it is a cost.

Each entry says what changed, what was checked before it went, and anything the build is
known NOT to cover. The last of those is the point of the file: a release note that lists
only what works is a sales page.

Every count below names the commit it was measured on. A count carried over from another
commit is worse than no count at all, so a build whose run was not written down at the
time says so rather than borrowing a neighbour's.

**Published baseline: main at v105 (`0d5160f`).** CANDIDATE entries below are
unserved branch history. v91, v93 and v94 below were
never served on their own: each was the base the next was repaired from, and v95 is the
first of the line to reach `main`.

---

## CANDIDATE — v105 — what two phones do to each other, and the crew nobody could see

**Not served. Not merged. On no phone.** On `claude/farkad-closeout-blockers`, built on
`main` as served (`21c8e08`, v103). Both money gates are still `false`: `LEDGER_WRITES` in
`js/model/ledger.js` and `carryAdvances` in `js/model/schema.js`. Code being ready is not
permission to open them, and this build adds a reason to wait — see below.

Measured on `b02ab36`, which is the last commit that changes any shipped or test byte;
this entry is the only thing after it.

**Seven defects, each with the failure that found it**

- **A refused retirement let a beaten wage come back.** `collectQueueGarbage` owed its
  winners only against RETIRED losers, so a loser whose retirement the disk had just
  refused left its winner collectable — in the same pass that failed to write the one
  record keeping that loser defeated. The loser then became current and went to the cloud
  over the value it had lost to. `tests/races.tabs.test.mjs` R14.
- **A phantom conflict that never cleared.** «הנתונים השתנו במכשיר אחר» stayed up all
  evening on a phone where cloud, disk and screen agreed and nothing was pending. R2b.
- **A restore erased money recorded while it was on the wire** — the ledger half (O6, O7,
  O9, O10) and, on the build a person actually has with both gates shut, the legacy
  `advances` half: 800 shekels gone from all three phones, every one saying synced. O8b.
- **A stale wage written backwards after one refused write.** The stale-roster hold
  remembered the tombstones and forgot the refresh, so the retry hit its own "nothing to
  do" return. `tests/refute.roster.mjs` R2.2.
- **An index that answered out of `Object.prototype`** — six ids resolved to methods, and
  an operation recorded a mark for a worker nobody hired. R1.1.
- **The export said files had left when they had not**, and stamped «גיבוי אחרון» over a
  backup that was never written.
- **At 200% text there was no crew on the screen** — 469px of chrome above and 263px of
  bars below on a 667px screen: zero whole worker rows at every width.

**And two instruments that were lying**

`tests/build.test.mjs` compared the three stamps with each other and was structurally
blind to whether they still described the BYTES — the half iron law 5 exists for. It asks
git now. Its first answer was that eleven commits had changed thirteen cached files with
the stamps still reading v104, which is a fix that ships green and never reaches the
phone. That is what v105 is.

`tests/gate.integrity.test.mjs` then gave a FALSE GREEN over the same question, because it
took "the last commit touching index.html, js/app.js or sw.js" as its baseline and a
commit to `js/app.js` moved it. Two instruments answering one question is the only reason
anybody looked.

**What was run, and on what**

| gate | commit | result |
|---|---|---|
| `npm test` | `d77589b` | 54 suites, **5160/5160**, exit 0, 5m55s |
| `npm run test:release` run 1 | `b02ab36` | 74 reporting blocks, **8318/8318**, exit 0, zero FAIL lines, 23m54s |
| `npm run test:release` run 2 | `b02ab36` | 74 reporting blocks, **8318/8318**, exit 0, zero FAIL lines, 23m46s |
| seeds 1 / 42 / 2026 | `d77589b` | `data` 1951/1951, `concurrency` 46/46, `probes` 35/35, `races.tabs` 109/109 — identical on all three |

Both release runs from their own clean detached worktree at the exact commit, Node
v22.22.2, tree clean, `git diff --check` silent, every tracked `.js`/`.mjs` parsing.

**What this build is known NOT to cover**

- **Nothing was checked on an iPhone.** Twenty-two rows in `docs/iphone-acceptance.md` are
  marked NOT RUN. Eleven of them exist because Chromium anchors `position: fixed` to the
  LAYOUT viewport and iOS to the VISUAL one — a measured limit, not an untried idea. The
  200% pass is a uniform multiplier and is **not** Dynamic Type.
- **`page-break-inside: avoid` on a payroll row is unfalsifiable here.** Headless Chromium
  keeps a table row atomic by itself — five fixtures, identical PDFs — so no PDF in this
  repository can tell the rule from its absence. WebKit is the only place it is a real
  question.
- **The download-refusal path has never met a real refusing browser.** It is proved in the
  harness and against doubles.
- **The service worker's ordering was not proved against a real iOS resume.**
  `bringToFront()` produces zero `visibilitychange` events in headless Chromium, so that
  event is dispatched rather than caused.
- **`tests/smoke.mjs` does not neutralise `js/sync/firebase-config.js`.** On a machine with
  a network it initialises the Firebase SDK against the live `farkad-schedule` project. It
  reaches no business data — `connect` runs only for a signed-in user — but it is worth
  knowing before running the browser gate on a networked machine.

**And what it means for the two money gates — a NEW blocker**

`firestore.rules` names `ledger` nowhere. Measured on the emulator against the real rules:
on a LEGACY document (no `revision` yet) a whole-document write with no ledger is
**accepted and the cloud ledger is gone**, and a null at a ledger field path lands. After
cutover both are refused. So "no older client can overwrite ledger fields" is proven
**after** cutover and **false before it**, and the flip must not happen while the shared
document is still legacy — read the `revision`, do not assume somebody has written since
the update. Recorded with two more findings in `features/gate-flip/contract.md`.

Firestore protocol: **CODE COMPLETE — LIVE CUTOVER NOT PERFORMED.**
Ledger: **LEDGER CANDIDATE READY — ACTIVATION BLOCKED BY ROLLOUT.**

---

## CANDIDATE — v104 — the two open blockers, closed

**Not served. Not merged. On no phone.** On `claude/farkad-closeout-blockers`, built on
`main` as served (`21c8e08`, v103). Both money gates are still `false`: `LEDGER_WRITES` in
`js/model/ledger.js` and `carryAdvances` in `js/model/schema.js`. Code being ready is not
permission to open them.

**The two findings `docs/data-safety-audit.md` left OPEN are closed, with the contract each
was waiting for**

- **O1 — a restore took a repayment off two devices out of three.** A takes a backup, B
  records 500 handed back, A restores. A and the cloud held 5000, B held 4500, both said
  «מסונכרן», and reopening B kept it. `features/restore-ledger/contract.md` decides it: a
  restore replaces the WORK record and never erases a financial event anywhere. The union
  goes in at `prepareReplace`, so the document that is stored, sent and compared against is
  one already-correct document and a retry re-sends the same bytes.
- **O2 — a roster edit put another phone's rate change back.** Three mechanisms, not the
  one the audit established. The memory baseline is empty at every app start; the legacy
  whole array IS the carrier the audit said it was not, and its guard only fires for the
  same list, so renaming a SITE reverted a WORKER; and the write unit was the whole person,
  so editing a phone number carried a stale wage with it. A roster edit now writes
  `roster.<kind>.<id>.<field>` — what the person touched, and nothing else.

**Two defects on the phone, found by asking for a tap instead of a width**

- A third fixed bar (`#undoBar`) that nothing had ever measured. At 320×667 with a long
  name it covered 107px the page did not know about, and the last worker was not
  hit-testable. At 200% text it missed at every width.
- `.wrow-main { flex: 1 }` with the default `min-width: auto` let an unbreakable name grow a
  button to 1008px inside a 320px row, putting the delete ✕ at x = −732 — off screen, and
  invisible to every check because the list clips.

**Five defects in what leaves the phone**, each proved by reading the produced file: a
mid-period raise made a row uncheckable and only the screen said why; a closed payslip
printed TODAY's daily rate beside a frozen wage that did not multiply out; «מקדמות חדשות»
was missing from the workbook and the CSV; a correction carried four of its seven fields;
and a range that is not a whole account changed the arithmetic without saying so.

**A diagnostic that answers the question that has been asked twice** — ⋯ → מידע טכני prints
the page build, the app build and the service worker's own build census, the visual viewport
with its scale, both bars as measured rects, the pending count and the sync reason. It
carries no name, no amount and no device id, and a Latin worker name is seeded to prove it.

**The rollout order is now derived from measurement.** Eight cells on the emulator — old and
new client × old and new rules × legacy and protocol document — plus two rollback rows.
`docs/rollout-checklist.md`, `docs/firebase-setup.md` and `features/gate-flip/contract.md`
disagreed; one of them asked the operator for a state its own rules forbid.

**What this build is known NOT to cover**

- **No physical iPhone has run any of it.** `docs/iphone-acceptance.md` holds 73 rows and
  every one is NOT RUN. The floating-bars geometry from the September screenshot cannot be
  reproduced by any suite here: Chromium anchors `position: fixed` to the layout viewport,
  iOS to the visual one. Row P11 — send back the diagnostic block from that phone — is the
  only thing that ends the guessing, and only the owner can run it.
- **One screen stays broken and it is written down**: 320×667 at 200% text with the undo bar
  up has 469px of chrome on a 667px screen, so the last worker cannot be reached. Acceptance
  row P12. It is a geometric impossibility, not a defect that was skipped.
- **One roster race survives**: a whole-entity write and a per-field write for one man,
  serialised so they never race a revision, can still lose the field. Every actual race is
  caught. The window exists only while some phone still sends whole records — a new entity,
  and the seed path.
- **`firestore.rules` is unchanged and unpublished.** Nothing in this repository proves which
  rules are live on the project; reading the console is step zero of the runbook.
- **The advances feature is not on.** Everything measured about it in this build was measured
  with the gates opened through the test seam and closed again.


## v105 — 11 September 2026 — `be4e610` (PR #20, the tree at `1477c79`)

The held records, shown. Built on v104 as served (`67405c6`). On `main` since 11 September
2026; the Pages deployment for `be4e610` completed at 05:51 UTC. **Being on `main` is not
being on a phone**: the owner's phone takes it at its next open. **No number moved** — not a
shekel on a report, not a day on a record, not a byte on the wire.

**What it gives the crew that v104 does not**

- **A held record is named on the phone, with both sides.** A write that lost a race
  while the phone was away has been kept on the disk and sent by nothing since v91, and
  counted in «(N ממתינים לשליחה)»; the line under the count said refresh, look at the
  screen, confirm again. But the screen shows THIS phone's value laid over the snapshot,
  so nothing on the phone said which records were held or what the cloud held there —
  and re-recording the cells as advised would have sent this phone's value over the other
  phone's record, blind. The owner's phone held six cells of one Thursday for a day
  before a rescue export, read on a laptop, named them. The ⋯ panel now lists every held
  record under «ענן וסנכרון»: the weekday, the date and the person; «במכשיר הזה:» and
  «בענן:», each in the day screen's own words (site names, «נעדר», «טרם נרשם»); and two
  buttons, «להשאיר את שלי» and «לקחת מהענן». Both are a fresh explicit edit of the same
  path through `State.commit` — the way out a hold has always had — so nothing new
  touches the wire. Taking the cloud's asks first and names both sides in the question.
- A phone that has heard nothing this session lists the record and offers no decision
  until the cloud answers. A held record that is not a worker's day is listed and says
  where its way out is.
- `FarkadSync.heldRecords()` is the one accessor, read off the projection: a path a
  fresh edit has already superseded is not listed, because the fresh edit is the answer.
- The rescue export («ייצא נתונים גולמיים») carries the same list, raw — both sides,
  bytes and all — so the next file read on a laptop can say what the cloud held, which
  this round's file could not.
- Two corrections in the sync layer, from the round's adversarial review, both pinned:
  a hold whose marker the disk refused to write is released by the fresh edit in the
  same session rather than at the next reopen (a day-screen edit had the same
  session-long block), and the status line answers from the same set the panel reads,
  so it no longer says «contested» over an empty panel. And a cloud that moves while
  «לקחת מהענן?» is open is not answered: the row is re-read at the moment of the
  decision and the person is told to look again.

**What this build is NOT known to do**

- **Being on `main` is not being on a phone.** The owner's phone holds six records for
  Thursday 3 September; this is the build that shows them — and it did: «בענן: אילון» on
  all six rows. The hunt (`features/held/findings.md`) reproduced the one mechanism that
  survives refutation: a second window of the same person, still on the cached v86
  build, wrote 3 September at אילון and the v86 rules accepted it while this app's
  newer writes were refused. The hold was right. The decision is the owner's, per row.
- **Open for v106**: the hold cannot say who wrote the cloud's value (the bootstrap signs
  the document before the base is read) — capture the pre-cutover stamp in the bootstrap
  transaction and carry it to the panel and the export; and the panel's lead sentence
  names «מכשיר אחר» where the writer can be another window of the same person.
- It does not resolve a held roster record, advance or ledger entry from the panel: those
  rows are listed and point at their own screens.
- Everything v104 lists, unchanged: the P1 for a v86-written queue after this phone's own
  cutover; the two Codex notes on the rules workflow; the other two phones on v86.

**Checked before it was stamped**: the release gate on the stamped commit is in
`features/held/handoff.md`. No number is copied here.

---

## v104 — 10 September 2026 — `67405c6` (PR #18, the tree at `671843c`)

Two lines in `js/sync/firebase-adapter.js`, found from the owner's phone
(`features/cutover/findings.md`). Served from `main` since 10 September 2026; the owner's
phone is the first to take it.

**What it gives the crew that v103 does not**

- **A phone can join the protocol.** The browser branch's `connect({...})` never handed
  the sync layer `bootstrap` or `read`, so no phone ever ran the cutover: over the v86
  document its first batch went out at revision 1 carrying days, and the new rules
  refused it on every branch, for ever, with the same sentence the old rules had
  produced. With the two operations forwarded, the first flush bootstraps the document
  (revision 1, protocol fields only) and the queued work lands at revision 2 — measured
  on the emulator with a v86 document and a v86-queued disk: refused six times out of six
  before, synced in 1.3 s after.
- `tests/build.test.mjs` reads that literal against `firestoreOps` so an operation the
  adapter defines can never again fail to reach a phone.

**What this build is NOT known to do**

- **Being on `main` is not being on a phone.** The owner's phone holds 194 queued
  operations that land on its first flush after taking this update.
- From that flush on, a phone still on v86 is refused until it updates — and, measured
  this round, a v86 phone still SAYS «מסונכרן» while refused (it has no honest-status
  gate); its queue and screen are safe, the sentence is not. The other two phones are
  not in use and update before they are.
- **Open, P1, for the next build**: the v86-written part of a queue can be sent over a
  value another phone changed while this one was away, right after this phone's own
  cutover signs the document, with both saying synced (`features/cutover/handoff.md`).
  It needs another phone's write during the gap; none happened here.
- The Codex review's two notes on `.github/workflows/rules.yml` (the site deploys before
  the rules job; two runs can finish out of order) are open; the workflow publishes
  nothing until the repository holds a key.
- Everything v103 lists, unchanged.

**Checked before it was stamped**: the release gate on the stamped commit is in
`features/cutover/handoff.md`. No number is copied here.

---

## v103 — 3 September 2026 — `21c8e08` (PR #15, the tree at `86053d2`)

On `main` since 3 September 2026; **being on `main` is not being on a phone**, and no phone
is known to have taken it. Built on v102 as served (`2bae97f`). **No number moved** — not a shekel on a report, not a day on a record, not a
byte on the wire.

**What it gives the crew that v102 does not**

- **The week screen tells an empty app what to do.** It said only «אין עובדים להצגה»; it now
  says «אין עובדים להצגה. הוסף עובד במסך עובדים ואתרים.» An empty week is the one moment a
  person cannot tell a fresh install from a broken app, and it is a screen a phone may open
  first.

That is the whole of what a person can see. Everything else in this build is for the people
who USE the documents and read the code.

**What it gives whoever runs the phones**

- **The Arabic guide caught up** with the site-card icons, the header that compacts on
  scroll, the Saturday arrows, the print that offers a picture when nothing opens, the export
  file names and the save dialog — each with the one tap that shows it working. And a new
  section on telling whether a phone is well in two lines, with the three reasons a sync
  error gives and their three different answers.
- **`docs/iphone-acceptance.md` has thirteen new rows** for v99–v103 and an Arabic block
  saying which order to run them in. **58 rows, none of them run**, and the count is at the
  top rather than left to be counted.
- **`docs/firebase-setup.md` states the rules deploy properly**: the exact command, the order
  (rules before any phone writes the new protocol), and why — measured by
  `tests/rollout.test.mjs` against a real legacy document, not asserted.

**What it fixes in the code that nobody can see**

`.btn-primary` matched no rule in the stylesheet at all: three money-form save buttons looked
right only because the base `button` rule already paints the primary style, and the name was
a lie to the next reader. `.btn-info` was byte-for-byte `.btn-secondary`. Both fixed as
removals or renames — a button that looks different after this build would be a bug in it.

**What was checked and deliberately NOT changed**

- **The ⋯ panel's order was already right** — cloud and sync, backup, restore, update and
  version, device state, the carry migration last behind its flag. Verified, not assumed, and
  not touched.
- **The rules review found no gap.** All three claims `docs/sync-protocol.md` says the rules
  enforce have checks in `tests/rules.test.mjs`, and the protocol now names which check
  answers which claim.

**What it is known NOT to cover**

- **No phone has run any of it**, and this build is largely FOR a phone: it extends an
  acceptance list that is 58 rows long and entirely NOT RUN. Nothing since v86 has been on a
  device.
- **`firestore.rules` is still not deployed.** This build documented the deploy; it did not
  perform it and cannot.
- The two findings v100's re-audit left OPEN are still open and untouched.
- Both money gates are shut.

**Checked before it was stamped**: both gates on `6011430` from one clean detached worktree,
run separately — `npm test` 43 suites 4381/4381, `npm run test:release` 59 suites 6817/6817,
both exit 0. Exactly one check more than v102, and it is the empty-state pin. Per suite and
verbatim in `features/organization/handoff.md`.

---

## v102 — 3 September 2026 — `2bae97f` (PR #14, the tree at `1e0aeb0`)

On `main` since 3 September 2026; whether any phone has taken the update is not known from
here. Built on v101 as served (`ee50ae4`).

**This build changes nothing a person can see or use.** Not a pixel, not a shekel, not a
byte on a disk or on the wire. It is the code moved into rooms it can be found in, and the
proof that it is only that is the gate: **43 suites 4380/4380 and 59 suites 6816/6816 —
the same numbers, check for check, as v101.** A refactor that changes what the gate says is
a refactor that changed something.

**What it gives whoever works on this next**

- `js/sync/sync.js` was 6,194 lines. It is 2,523, and the rest is in five files named for
  what they own: the restore transaction, the receive path, the send path, the connection
  and status line, and a two-line bootstrap that exists to be loaded last.
- `js/ui/share.js` was 2,093 and is 290 — the WhatsApp message and the CSV, which is what
  its name always meant. The snapshots, the backup file, the four restore doors and the
  rescue file are in `js/ui/backup.js`.
- `js/model/schema.js` was 2,928 and is 2,430; the arithmetic every paid and billed number
  comes out of is in `js/model/money.js`.
- `css/app.css` has a table of contents.
- Three functions that nothing called are gone, each named with the reason.

**What it deliberately did NOT do, with the numbers**

- **`js/ui/reports.js` is not split.** It was, and it was put back: 25 places in 13 suites
  read that file off the disk by name, and three of them are meta-tests — one pins the read
  itself as a string, two iterate hard-coded file lists. A split that missed any of the
  three would leave a suite quietly covering less than it claims.
- **`css/app.css` is not reordered.** That file documents four places where cascade order
  IS the mechanism, including a print rule that had been losing to a later block for months,
  silently — and what it lost was a warning about hours somebody was not paid for.

**What it is known NOT to cover**

- **Being on `main` is not being on a phone.** No phone is known to have taken it.
- **No phone has run any of it.** For a behaviour-neutral build that matters less than it
  did for v101, but "behaviour-neutral" is a claim held by 59 suites, not by a person using
  the app. Every row of `docs/iphone-acceptance.md` is still NOT RUN.
- The two findings v100's re-audit left OPEN are still open and untouched.
- `firestore.rules` has changed since v86 and is still not deployed — the owner's to run;
  `docs/rollout-checklist.md` has the steps.
- Both money gates are shut and nothing in this build goes near them.

**Checked before it was stamped**: both gates on `21bd9ba` from one clean detached worktree,
run separately. Per suite and verbatim in `features/code-order/handoff.md`, which also names
the one gate that came back EXIT=2 (a race in `tests/swrestart.test.mjs`, root-caused and
fixed) and the three killed by container restarts — none of whose counts is recorded as a
result anywhere.

---

## v101 — 2 September 2026 — `ee50ae4` (PR #13, the tree at `718ee6e`)

On `main` since 2 September 2026; whether any phone has taken the update is not known from
here. Built on v100 as served
(`e4aa66b`). One screen's chrome, three changes, nothing behind either money gate and
nothing touching the record, sync or the arithmetic. Both gates stay shut.

**What it gives the crew that v100 does not have**

- **The day header shrinks to one row as soon as the list is scrolled.** The day name, its
  date and the two arrows stay — halfway down a list of names, nothing else on screen says
  what day this is, and a day recorded against the wrong date is the one input error that
  actually costs money. Undo, redo, «היום», the switcher and the progress line's words go;
  the thin progress track stays. Scrolled, the chrome above the first name goes from 157
  pixels to about 57. **No bar moves** — that decision is v99's and this build does not
  reopen it.
- **The two buttons under every site card move onto its coloured heading**, as a ＋ and a
  💬. Five sites on a screen is five rows back for the names.
- **The «לפי עובדים / לפי אתרים» switcher no longer has a row of its own.** It is on the
  header now, which means it goes away with the header once the list is moving — something
  a row below the header could never do.

**What it does NOT give them, and this is measured, not estimated**

- **Moving the switcher into the header gives back three pixels, not a row.** A 44px
  segmented pair costs a 44px line wherever it is put; moving a line from below the header
  to inside it moves the line, it does not remove it. The chrome above the first name goes
  from 157px to 154px. The room in this build comes from the scroll behaviour and from the
  site cards — not from that move. `features/day-room/handoff.md` has the table.

**What it is known NOT to cover**

- **Being on `main` is not being on a phone.** No phone is known to have taken it.
- **No phone has run any of it, and this is the round where that matters most.** It is a
  round about how a screen feels under a thumb, and every measurement in it is headless
  Chromium. The scroll threshold's behaviour under iOS rubber-band scrolling and momentum
  is NOT covered — Chromium emulates neither, and a bounce past the top on a real iPhone is
  the first thing to look at. Every row of `docs/iphone-acceptance.md` is still NOT RUN.
- **The header's «בטל» is a flick away while the list is scrolled.** The undo BAR still
  appears at the moment of the edit and is untouched; the header's pair is for the mistake
  noticed a name or two later, and reaching it now costs a scroll back to the top. That is
  the trade this build makes on purpose.
- The two findings v100's re-audit left OPEN are still open and untouched here.
- `firestore.rules` has changed since v86 and is still not deployed. Unchanged by this
  build, still the owner's to run; `docs/rollout-checklist.md` has the steps.
- The mobile suite is Chromium, not Safari, and its 2× text pass is not Dynamic Type.

**Checked before it was stamped**: both gates on `991ced4` from one clean detached worktree,
run separately — `npm test` 43 suites 4380/4380 exit 0, `npm run test:release` 59 suites
6816/6816 exit 0. Per suite and verbatim in `features/day-room/handoff.md`, which also
records that three earlier attempts at the release gate were killed by container restarts
and that none of their partial counts is written down anywhere.

---

## v100 — 2 September 2026 — `e4aa66b` (PR #12, the tree at `a3d784b`)

On `main` since 2 September 2026; whether any phone has taken the update is not known from
here. Built on v98 as served
(`4a4d277`) and merged with the v99 that was served from this same branch while it was
being built (`5650235`). The four items v98 left open, closed, plus the two pins and the one product
change the same list asked for — and then a re-audit of the whole data-safety path, which
found five more and closed them. It carries v99 whole - the bottom bars and the reason
line - and adds to it. Both money gates stay shut.

**What it gives the crew that v99 does not have**

- **On the phone, today:** the WhatsApp message no longer turns a line round when a
  worker or a site has a Latin name. «📍 Rothschild 12» used to paint its pin on the left
  while every other line kept it on the right, and «• Dan Levi (‎+2 ש׳)» laid its Hebrew
  out on the wrong side of the name. Every name in the message is isolated now, the way
  the worker's own statement has always isolated its heading. The words are unchanged and
  the marks are invisible.
- **On the phone, today:** the week strip shows where it is cut off. At 390 and below the
  week is wider than the screen and Thursday sits off the left edge at rest; there is now
  a fade at that edge. The 48px pitch is unchanged — the week still has to be pushed, it
  just says so. At 430, where it fits, there is no fade.
- **Behind the carry gate, so nothing a phone can reach until somebody opens it:** a
  fortnight closed after the man has already repaid no longer puts the phone into
  recovery. This one needed no race and no clock skew — a repayment on the 24th and a
  close of the 07–20 fortnight on the 26th was enough — and it is the reason this build
  exists.
- **Behind the gate:** a phone whose clock is behind another's is told it cannot close
  yet, instead of quietly moving a payment into the next fortnight.
- **Behind the gate:** two phones that each approved the same carry plan and reach a
  project with no document both end synced. One of them used to hold the other's approval
  for ever and report a conflict about money that nobody was having.
- **On the phone, today — and this is the one that was costing money:** a closed
  fortnight was being applied to any report range that merely STARTED on its opening
  Friday, whatever it ended on. In any month whose first day is an account start, the
  ordinary «החודש» preset showed ten days and 5,000 where the crew had worked twenty for
  10,000 — while the invoice in the same workbook still billed all twenty. Read as two
  ranges that do not overlap, one day was priced in both. A closure now freezes the
  fortnight it names and no other range.
- **On the phone, today:** a phone whose pending restore will not parse no longer says
  «מסונכרן». It had stopped adopting anything the other two sent, permanently, while its
  own writes still went out — so all three screens looked healthy and only one of them
  was. It says «שגיאת סנכרון» now and names the one thing that clears it.
- **On the phone, today:** an edit the app refuses comes off the screen even when nothing
  durable stands behind it — which is exactly the session that opened onto a damaged
  record, and exactly when somebody re-types the week they can see is missing. Those
  re-typed days used to reach the disk with no journal behind them and the next snapshot
  deleted them.
- **On the phone, today:** the undo stack is quarantined rather than written over when it
  will not parse. It holds up to three whole schedules; it was the one record family
  exempt from law 10, by accident. And a restore no longer reports a way back that the
  next snapshot from another phone erases.

**What it is known NOT to cover**

- **Being on `main` is not being on a phone.** No phone is known to have taken it, and no
  phone has run any of it: nothing since v86 has, and every row of
  `docs/iphone-acceptance.md` is still NOT RUN.
- The two gates are still shut, so four of the six items above cannot be reached by any
  phone in the field. `features/gate-flip/contract.md` is what opening them requires; it
  is a checklist, not a decision, and the decision is the owner's.
- `firestore.rules` has changed since v86 and is still not deployed. That is unchanged by
  this build and is still the owner's to run.
- The emulator's own 1-in-28 flake is not proven gone by a deterministic reproduction.
  What was measured here is a defect with exactly that end state — one operation held at
  `ledger.migrations.<id>`, status `contested` — reproduced every time on the fake cloud
  and closed. Whether the emulator run that failed once took this path cannot be known
  from its log; `features/false-holds/handoff.md` records how many times the storm suite
  was run against the real emulator after the fix and what each run returned.
- **The re-audit left two findings OPEN, and this build does not fix them.** A restore is
  undone on the phone that did NOT ask for it, in the ledger only, with both phones
  reporting synced; and a roster edit made before the first snapshot arrives reverts
  another phone's rate change on all three devices, silently. Both have runnable
  reproductions in `docs/data-safety-audit.md`. Neither is a regression of this build —
  they predate it — and neither was fixed here, because each needs a rule about what a
  restore and a rosterless phone may do to somebody's pay, and that is not a rule to pick
  quietly inside a round. The first is behind the money gates; the second is not.

**Checked before it was stamped**: `features/false-holds/handoff.md`, with both gates'
output verbatim on the commit they ran on.

---

## v99 — 2 September 2026 — `cab12de` (PR #10, the tree at `f809c56`)

The second round answered from the iPhone: one screenshot on v98, the bottom bars gone
and the chip red. Served from `main` since 2 September 2026; whether any phone has taken
the update is not known from here.

**What it would give the crew that v98 does not have**

- The bottom bars come back. The app took a viewport measurement alone as "a keyboard is
  up" and hid both bars under it; on the home-screen app iOS can leave the two viewports
  disagreeing with no resize event — the share sheet, the print sheet, a keyboard
  dismissed while scrolled, backgrounding, rotation — and the bars stayed gone until the
  app was killed. A keyboard needs a focused editable now: nothing focused, no keyboard,
  whatever the viewport says; re-measured on focus, blur, return to the app, and on the
  first touch while the class stands (`js/ui/bars.js`).
- The ⋯ panel says WHY the cloud refused, under the line that says it did: «הענן מסרב
  לקבל רישומים מהמכשיר הזה. אם האפליקציה עודכנה זה עתה, כללי הענן עדיין לא פורסמו.» for
  a refusal, «הענן אינו מזהה את המכשיר הזה - התחבר שוב.» for a lost sign-in, «אין כרגע
  גישה לענן - הניסיון יחזור מעצמו.» for no reach, else the error's own message, with the
  code readable left to right. A dead listener's refusal is kept until a listener
  delivers again, so the reason survives the next write.

**Checked before it was stamped**: the release gate on the stamped commit is in
`features/bars-reason/handoff.md`. No number is copied here.

**What this build is NOT known to do**

- **Being on `main` is not being on a phone.** No phone is known to have taken it.
- No iPhone has run it: the bars fix is measured in Chromium with a stubbed viewport; the
  share-sheet and stale-viewport paths on a real home-screen iPhone are the acceptance the
  person's phone gives.
- Everything v98 lists, unchanged; the open items are `features/next/opus-closeout.md`.

---

## v98 — 2 September 2026 — `5dd5a83` (PR #8, the tree at `7603b45`)

The storm explained and closed (`features/storm/findings.md`). v97's release note said one
emulator suite had gone red once on its commit and nobody had explained the interleaving;
this build is the explanation and the fix. Served from `main` since 2 September 2026;
whether any phone has taken the update is not known from here.

**What it would give the crew that v97 does not have**

- Nothing they can see today: both money gates are shut, and the defect lives behind the
  carry gate. The day the gates open, a phone that closes a fortnight will no longer be
  held by its own closure when its write happens to land first — `closureFacts` no longer
  mints keys holding `undefined`, an appended entry is its own JSON round-trip, and the
  two comparators compare a record as it travels and rests.
- A closed fortnight's frozen day list carries the extra hours it was priced with.
- The by-site grid's date rows read «ראשון 23/08» — the weekday and dd/mm, no year — on
  paper and in the shared picture (the phone screen shows the section as bars); the year
  stays on the period line above and in the exported sheets, where a row is read out of
  context. Asked for from the phone, with a screenshot.

**Checked before it was stamped**: the release gate on the stamped commit is in
`features/storm/handoff.md`, with the storm suite run repeatedly under load beside it.
No number is copied here.

**What this build is NOT known to do**

- **Being on `main` is not being on a phone.** No phone is known to have taken it.
- Two things found on the way to the cause are written down and not fixed: a closure
  judged impossible under clock skew, and a refused approval write leaving a phone
  'contested' once in twenty-eight runs. Both behind the shut gates; each its own round.
- Everything v97 lists, unchanged: no iPhone has run any of it.

---

## v97 — 2 September 2026 — `4fe7c9a` (PR #6, the tree at `1853a03`)

The first round answered from an iPhone: one phone on v96, two screenshots, four
sentences (`features/iphone/findings.md`). Served from `main` since 2 September 2026;
whether any phone has taken the update is not known from here.

**What it would give the crew that v96 does not have**

- A print button that does something on the home-screen app. `window.print()` there has
  for years either opened nothing or an empty sheet; the button now prints where the
  sheet opens and, where nothing opened within a second and a half, offers the table as a
  picture through the share sheet. Beside it, always: «🖼️ שיתוף כתמונה» — the week grid
  or the report drawn exactly as the screen shows it, right to left in every viewer the
  phone has, which no spreadsheet flag can promise (`js/ui/printout.js`; law 12).
- The arrows step over an empty Saturday and land on one with a record.
- Two taps do not zoom the page; pinch still does.
- The chip beside the app's name says «שגיאת סנכרון» when the cloud refuses the queue,
  and «השליחה תקועה» when the claim is stuck, instead of counting the queue as if it
  were on its way.
- The export dialog tells the truth: the sheet is flagged right-to-left for Excel, the
  phone's own previews may lay it out from the left, and the picture is the door that
  reads right everywhere; a backdrop tap no longer writes a second file; the files are
  named ASCII-first so an RTL list does not swap their dates.
- A date range reads from→to left to right on every surface; the worker modal opens at
  its top; a by-site print no longer begins with a blank page.

**Checked before it was stamped**: the release gate on the stamped commit is in
`features/iphone/handoff.md` beside the commit it ran on. No number is copied here.
The gate was run twice on that commit: the first run was red in one emulator suite
(the money-concurrency storm, a path no shipped phone can take with the gates shut),
the second was green, and nine isolated runs of that suite were green; the handoff
says so in full.

**What this build is NOT known to do**

- **Being on `main` is not being on a phone.** No phone is known to have taken it.
- **One emulator suite went red once on this commit**; it exercises two phones writing
  money with the gates OPEN through the test seam. Explained and closed in v98
  (`features/storm/findings.md`): a phone held by its own closure.
- **No iPhone has run it.** The print heuristic (does Safari fire `beforeprint` or the
  print-media change when its sheet opens?), the share sheet inside the offer, and the
  touch-action rule are argued from the platform and measured in Chromium with
  `window.print()` stubbed both ways. If Safari opens the sheet and fires neither event,
  the person gets one harmless offer behind it.
- **"Reversed" was not found in Chromium on any surface**, and every surface is identical
  to v86. What was found and fixed is the export path above. If the person's reversed
  table is the .xlsx in the Files preview or Numbers, that is those viewers ignoring the
  sheet's own flag — v86 did the same — and the picture is the answer.
- The 38 queued records on the reporting phone are a rollout fact, not a code one: the
  rules deploy (`firebase deploy --only firestore:rules`) is by hand, and the chip now
  says whether the cloud is refusing.
- Everything v96 lists, unchanged: both money gates shut; the create-race hold; the
  week strip at 390 shows five days and scrolls, by design.

---

## v96 — 2 September 2026 — `366e5ad` (PR #4, the tree at `dbbaa6e`)

v95 with the advances ledger merged onto it and the week grid at its pitch. Two branches,
each reviewed before it was taken: `d11ef3c` takes the ledger branch (`v96/ledger`, the
v92 branch Opus left with the note "must not be merged yet", brought onto the repaired
send path with BOTH money gates closed again at the merge - `LEDGER_WRITES` in
`js/model/ledger.js` and `carryAdvances` in `js/model/schema.js` are `false`, and the
suites that measure the open build open it through the harness seam); `ed9bede` takes
the week grid (`v96/weekpitch`). Served from `main` since 2 September 2026; whether any
phone has taken the update is not known from here.

**What it would give the crew that v95 does not have**

- The advances ledger as code, shut: entries, the fold, the approval boundary (a
  financial migration nobody has approved on THIS record is not read the new way), the
  frozen fortnight (a closed payslip reports the wage, the counts and the days it was
  closed on, whatever the live schedule does afterwards), a repayment or a correction
  dated into a closed period moving the live debt and not the payslip, and one fact
  written by two phones at once landing once. All of it behind the two gates: this
  build's phones still read and write advances exactly as v95 does. Flipping either gate
  is a person's decision, taken only once all three phones show v95 or later.
- A fortnight closed on a phone whose gate is open is frozen on a phone whose gate is
  still shut, so the two never print different money for one payday - pinned this round,
  not changed.
- The week grid at a 48px pitch in both directions, edge to edge inside its own
  scrolling strip: a 430 phone shows the names and all seven days with nothing to push,
  and the narrower phones keep the names pinned and scroll the days under them. Before
  this the columns came out 45px at 430 because the strip sat inside the page padding,
  and the test asked for the 44px floor rather than the pitch.
- A part of the ledger container this build does not name is carried through a load
  once, by one guarded loop, instead of twice by two - the two merges had each brought
  their own copy.

**Checked before it was stamped**: the ledger merge was measured at `f0cca08` and
reviewed; the week grid at `42097f8`; the release gate on the stamped commit is in
`features/ledger/handoff.md` beside the commit it ran on. No number is copied here.

**What this build is NOT known to do**

- **Being on `main` is not being on a phone.** No phone is known to have taken it.
- **Both money gates are shut**, so nothing above the first bullet is exercised on a
  phone: no entry is appended, no migration approved, no fortnight closed. The suites
  that prove those open the gates through the harness seam; a phone cannot.
- The create-race hold (v95, finding R1) holds the loser's contested paths but does not
  ask the same-fact rule of them, so two phones writing the identical fact into a
  project with no document yet end in a hold that a person clears, not a silent merge -
  the safe direction, and still a tap somebody has to make.
- Everything v95 lists, unchanged: no iPhone has run it; `firestore.rules` is deployed
  by hand before any phone updates.

---

## v95 — 2 September 2026 — `109502c` (PR #3, the tree at `021254f`)

v94 reviewed a second time and repaired a second time: the seven findings of
`features/core-repairs/findings-round2.md` (one P1 - the create race's loser replacing the
winner's day on a project with no document yet - four P2, two P3), each a fail-first test
followed by its fix and each verified again before merging (`27549c5` the send path,
`6303660` the poison doors, `cabcb27` the chip and this file). Served from `main` since
2 September 2026; whether any phone has taken the update is not known from here, and
the rules file this build needs (`firestore.rules`) is deployed by hand, not by the merge -
see the rollout note under v91.

**What it would give the crew that v94 does not have**

- Two phones' first-ever evening on a new project, same worker, same day: the second
  phone's half is held and said, not written over the first's.
- A phone whose cloud listener has died never says «מסונכרן» on the strength of its own
  writes; it says so, resubscribes on its own ladder, and is synced only when a listener
  delivers again.
- A poisoned map in the cloud document is one sighting, not a new one at every sibling
  edit: the phone that acknowledged it keeps adopting the crew's work on that day.
- The rescue door reads a file without holding the phone for it; the hold is raised only
  once the person has confirmed and the rescue is on the disk.
- A poisoned snapshot acknowledged mid-session is adopted then and there, not at the next
  change in the cloud.
- The chip beside the app's name says «דורש הכרעה» for a held edit and «הסנכרון מושהה»
  for a suspended sync, instead of «ממתין לשליחה» for both.

**Checked before it was stamped**: the release gate ran on this commit; the counts, per
suite and verbatim, are in `features/core-repairs/handoff.md` beside the commit they were
measured on. No number is copied here.

**What this build is NOT known to do**: everything v94 lists below, unchanged - above all,
no iPhone has run it, and being on `main` does not change that.

---

## v94 — CANDIDATE, not served — `9f11abf`

The compact day of v93 with the core repaired underneath it: two review rounds, the
first fixed, the second found. Nothing on a phone runs it.

**What it would give the crew that v93 does not have**

The fifteen findings of `features/core-repairs/findings.md`, reviewed at `c744d49` and
each fixed as a fail-first test followed by the fix (`120c8a8` the send path, `6979fcf`
the receipt path, `958a21d` the poison doors, `e25cbcb` the documentation):

- An edit queued before the session heard the cloud - a phone opened offline - is no
  longer sent over another phone's newer value with both phones saying synced. Every
  `days.`/`ledger.` operation now carries what the device had seen at that path in the
  same verified write as the operation, and the pre-send question is asked per path,
  not of the whole document's last writer. Two phones recording the same worker on the
  same day offline, the second coming back later, end in a hold, not a silent replace.
- A hold decided before the send says so: status `contested` and its line, instead of
  «מחובר. יש רישומים שעדיין נשלחים.» for ever with nothing sending.
- A retry answered from its receipt re-adopts the snapshot, so a correction made
  meanwhile by another phone is taken; a replay that empties the queue says synced
  instead of keeping the last error; the loser of a create race whose snapshot arrived
  late merges without a sync error.
- Evidence of an unreadable record is kept under its own key: `__proto__` evidence
  survives a reopen, one quarantine copy is made rather than one per open (the device
  no longer becomes unwritable after twenty opens with a false "no room"), a non-date
  key in the `days` map is held and reported instead of dropped, a poisoned layer
  arriving again is not reparented, an acknowledged record is not an error on every
  snapshot, and a restore file carrying a poisoned map is refused at the door with its
  own sentence instead of putting the DEVICE into recovery hold. The rescue door still
  opens a held phone's own file; only a replacement is refused for it.

**Checked**, at `9f11abf`, the whole release gate from the `farkad-work` worktree on
Node v22.22.2 (`.gate-release.log` in that worktree, 00:06:59-00:22:19, exit 0):

| suite | |
|---|---|
| `npm test`, the 36 node suites | 3602/3602 |
| the 8 browser suites (smoke 1041, print 65, mobile 671, update 30, recovery-browser 25, handover 26, swrestart 31, swidentity 55) | 1944/1944 |
| sendclaim | 43/43 |
| the 5 emulator suites (rules 59, cas-emulator 24, rollout 17, bootstrap 23, bootstrap-rules 28) | 151/151 |
| the whole gate, 50 suites | 5740/5740 |

This is the first time the browser and emulator halves were run on the compact day; the
v93 entry below still says its browser half is unmeasured, and that is still true of
`10a40a5` itself.

**What this build is NOT known to do**

- **It is not on `main`.** No phone has it, and none of the above is a release.
- **The second review, at `9f11abf`, found seven things**
  (`features/core-repairs/findings-round2.md`), none refuted, and they are live at that
  commit - the 5740 above were measured WITH them: the loser of a create race whose
  document already exists sends its queued patch as an ordinary update without asking
  the pre-send question of the document it just read, so the winner's day is replaced
  on every phone with both synced (P1); a phone whose snapshot listener has died says
  «מסונכרן» after its next successful send (P2); a poison sighting's identity is the
  bytes of the whole map, so every sibling edit by any phone is a new sighting and the
  phone never adopts the other phones' work on that day (P2); the rescue door holds the
  READING phone for a file it only previewed, and on cancel it stays held (P2); a
  poisoned snapshot acknowledged mid-session is not re-adopted until the cloud changes
  again (P3); the chip beside the app's name reads the queue count before the sentence,
  so a contested hold is labelled «ממתין לשליחה», never «דורש הכרעה» (P2); and this
  file had no v94 entry (P3). The round-two fixes are NOT in the count above; each
  ships as its own fail-first pair and is measured where it lands.
- Everything in the v93 and v91 entries below that the fixes above do not name still
  holds - the vehicles gate, the ledger gate, the iPhone that has never run it.

## v93 — CANDIDATE, not served — `10a40a5`

The v91 core repair with the compact day on top of it; the base v94 was repaired from.
Nothing on a phone runs it.

**What it would give the crew that v91 does not have**

- The day screen stops spending the top third of a phone on chrome. On first open, with
  the account warning showing and both bottom bars in place, seven whole names fit at
  430×932, five at 390×844, three at 320×667; before, four names were what was left of a
  30-man crew at 430px and at 320px the first name started under the dock.
- The account warning folds to one strong line; the full sentences with the dates are one
  tap down and still in the DOM. The progress count "נרשמו X מתוך Y" is itself the way to
  the next unrecorded man, so the separate המשך row is gone. The bulk fold's button sits at
  the end of the switcher row. A sync chip beside the name repeats the status line's own
  words and never composes its own.
- The mobile suite "the list starts high" holds every piece of chrome to the height it was
  given, so the count of visible names cannot drift back down a pixel at a time.

No data, sync, ledger or pricing code is touched by the compact day; everything under it
is v91's.

**Checked**, at `10a40a5`, from the `fix/docs` worktree on Node v22.22.2:

| suite | |
|---|---|
| `npm test`, the 36 node suites | 3493/3493 |
| data, at seeds 1, 42 and 2026 | 1943/1943 every time |
| sendclaim | 43/43 |

The browser suites were re-pinned by the compact-day commit itself (two smoke taps on
"המשך (N)" now tap the count; the folded bulk row is measured at 0px) and their counts at
`10a40a5` were not written down in any commit. Until they are, treat the browser half of
this build as unmeasured, not as green.

**What this build is NOT known to do**

- Everything in the v91 entry below still holds; the compact day changes none of it.
- **It has never run on an iPhone.** The seven/five/three names were counted in headless
  Chromium at those viewports.

## v91 — CANDIDATE, not served — `cf8b9e5`, core repaired through `c744d49`

The core-repair line, built on v86. Between v86 and this stamp the branch carried v87
(`aca2abe`), v88 (`1ce31d5`) and v89 (`5fd4d1e`), none of which was served either; v90 and
v92 are the ledger-enable branch's numbers, skipped here deliberately so one number never
names two trees.

**What it would give the crew that v86 does not have**

- An update no longer mixes two builds in one window. `clients.claim()` used to take every
  window of the origin and hand a page still running the old scripts the new build's
  bytes for everything it asked for next - new sync layer, old page, one session. The
  worker now knows which windows it handed a page to, serves each its own build's cache,
  and reaps the old cache only when nothing is running it (v87).
- The workbook comes off this origin. SheetJS was fetched from a CDN at export time, and
  in the van at the end of a fortnight - offline all day - the bookkeeper got three CSVs
  under different names instead of one workbook. `vendor/xlsx-0.18.5.min.js` is in the
  service-worker shell now, 860K paid once per build (v88).
- A part of the ledger container this build has never heard of is carried, not written
  over by the next ordinary save (v89). The next build adds `ledger.migrations` - a
  person's approval of a financial migration - and a v86 phone sharing the record would
  have deleted that approval on every save.
- The sync protocol: `protocol`/`revision`/`lastOpId`, immutable receipts, a conflict that
  carries the authoritative document, rebase-if-uncontested and hold-if-contested. A write
  that lost a race is held on the disk until a person decides, and no trigger resends it.
  A receipt names the operation, not just the revision it reached. The bootstrap may not
  carry business data, and `firestore.rules` now says so. See `docs/sync-protocol.md`.
- A name that would land on a prototype - `__proto__`, `constructor`, `prototype` - is not
  a legal id through any door; the whole ledger container survives a snapshot; one
  immutable id arriving with two bodies is a disagreement a person is told about.
- The twelve suites written against v86 before any fix (`a63bc48`, 51 red checks) are
  green: the restore over an older build's queue, retirement by operation across two tabs,
  statements that say how the money moved, the write counter that only moves for keys the
  rescue file carries, לתשלום reconciling with נצבר less מקדמות, the advance's method
  recorded through the mirror, a restore stamped with another schema version caught, the
  retired identity scheme's orphans, and three assertions that could not fail.
- The way out of the assign sheet stays on the screen at 200% text, and the 200% pass now
  actually doubles the text it measures.
- Four gates shut: `permanentDeletion`, `vehicles`, `carryAdvances` and `LEDGER_WRITES`
  are all false. The vehicles feature of v83 is retired behind its flag because the owner
  cancelled it: nothing is drawn, nothing is computed, nothing is written, and every stored
  vehicle byte survives every door.

**Checked**

At `cf8b9e5`, from one clean detached worktree (`2f6b6dc` is the commit that wrote it
down): `npm test` 35 suites 3429/3429; `npm run test:release` 49 suites 5516/5516, zero
skipped; `data.test.mjs` at seeds 1, 42, 2026 and 42 again, 1943/1943 every time.

At `c744d49`, from a clean detached worktree on Node v22.22.2: `npm test` 36 suites
3493/3493; `npm run test:emulator` 5 suites 151/151. The 36th suite is
`tests/snapshot.poison.test.mjs`, which arrived with the poisoned-name repair.

**What this build is NOT known to do**

- **It is not on `main`.** No phone has it, and none of the above is a release.
- **The core review at `c744d49` found fifteen things, thirteen of them in code**, and
  they are live at that commit: an edit queued before the session's first snapshot
  records `base: null`, which the pre-send hold exempts, so a stale value can be accepted
  over another phone's newer one and both phones say synced (P1); "someone else wrote it"
  is decided on the whole document's `updatedBy`, not per path; a pre-send hold sets no
  status, so the line says «יש רישומים שעדיין נשלחים» indefinitely; a replayed write
  never re-adopts the snapshot it missed; evidence held under `__proto__` is dropped at
  reopen; twenty reopens of a device holding an unreadable record exhaust the quarantine
  slots and leave it unwritable with a false "no room". They are being fixed as pairs of
  commits, fail-first then fix, on top of this stamp.
- **It has never run on an iPhone.** The handover was proved between two real trees in
  Chromium; on iOS an installed app is resumed rather than reopened, which is where the
  handover is at its most awkward.
- **The catch-up runs in the window, and the window runs the OLD build.** No v91 can make
  a v86 page reload itself. A v86 window stays a coherent v86 session for the whole of
  its life and crosses on its next open; `tests/handover.test.mjs` says so instead of
  pretending.
- **The vendored SheetJS 0.18.5 carries CVE-2023-30533 in its parsing path.** The app
  never parses a workbook - `book_new`, `aoa_to_sheet`, `book_append_sheet`, `write` and
  nothing else - so the path is unreachable from anything a person can do here; it is
  written down so whoever raises the version knows which half the tests cover.
- **The device still fills up**, and CSV still cannot carry a direction.

---

## v86 — 28 August 2026 — `880d7bb`

One commit on `main`, on top of v85. The last build served.

**What the crew gets that v85 did not have**

- **A client's report leaves the crew out of it.** Both reports live in the document at
  once and the one not being looked at carried `.report-offscreen`, which was hidden under
  `@media screen` ONLY. So selecting a client's report and pressing print produced a
  two-page PDF: the client's page, and behind it the entire payroll - every name, every
  daily rate, the gross, the advances and the net - in a file that goes to the client.
  Measured, not reasoned about: a PDF built through the app's own route came back carrying
  both names and the daily rate 777. The rule is unconditional now, and the print block
  restates it by name.
- The privacy test that existed to catch exactly this had searched only the pages already
  classified as invoice pages, and the leaked page was a payroll page. The new one reads
  every page of the document and fails on a worker's name, the payroll's title, a daily
  rate, an advance, the totals wording, or the detail dialog that was open when print was
  pressed - in both directions.

**Checked before it went**, at `880d7bb`: build 18/18, data 1883/1883, smoke 1021/1021,
mobile 389/389, print 63/63, update 25/25. Putting the screen-only rule back turns five of
the print checks red.

**What this build is NOT known to do**

- **Firestore rules were not re-run for v80 through v86.** `firestore.rules` is byte-for-byte
  what v79 shipped with, and the 34/34 at `94d5a84` is the last run written down for a
  served build.
- **It has never run on an iPhone**, though one iPhone has been at it: the reorder scroll
  in v81 was found on a real phone, and every fix since was measured in Chromium.
- **What twelve suites written against it found**, at `a63bc48` on the repair branch,
  51 red checks before any fix: a restore leaves an older build's legacy item in the slot
  record; a restore goes out while another tab holds the right to send; statements and
  exports do not say how the money moved; a day at a site the roster has lost is not
  billed; the write counter moves for keys the recovery file does not carry, so a second
  tab makes every snapshot read unstable; the לתשלום column does not reconcile with נצבר
  less מקדמות, and a sub-shekel advance breaks the row it is on; the ledger mirror does not
  record how an advance was handed over; a restore stamped with another schema version is
  not caught; a v71 companion outlives its replacement; and renaming, archiving or marking
  a vehicle as stayed-in is not inert while the feature is off.
- **An update mixes two builds in one window.** Found at `aca2abe`: after the handover a
  window still executing the old scripts is served the new build's bytes for everything it
  asks for next. It has been so for every build in this file; the first fix is v87, not
  served.
- **The export needs a signal.** SheetJS is fetched from cdnjs at export time; offline,
  the bookkeeper gets three CSVs instead of one workbook. The first fix is v88, not served.
- **A part of the ledger container this build does not name is dropped on save**
  (`5fd4d1e`). Nothing writes such a part yet, so nothing has been lost yet.
- **Vehicles are live and their default moves money.** An evening with nothing said about
  vehicles means they all went out, so a silent Tuesday adds three hundred shekels to an
  owner's pay by itself. The owner has since cancelled the feature; the retirement is on
  the branch, not here.
- **The device still fills up**, and CSV still cannot carry a direction.

## v85 — 28 August 2026 — `03bf814`

Thirty-one commits from the design pass's third wave, merged onto `main`. Four conflicts,
none a disagreement: three were the build markers and the fourth was the data suite where
each side had appended its own block, needing the first block's closing brace written back.

**What the crew gets that v84 did not have**

- The site report answers the screen's question in bars, and paper keeps the grid.
- The v80 record - היסטוריה מלאה - is readable, and can be closed by hand.
- The worker's own screen says what the record holds against his name; an archived row says
  what he left with and one tap puts him back; the phone field says who already has that
  number while it is typed; the detail modal shows WHICH dates the count is made of; the pay
  card leads with נותר לתשלום on a phone.
- Reorder mode has a screen of its own, and an Escape that answered the question does not
  re-ask it.
- `docs/architecture.md` and `tests/README.md` arrive: the deeper walk, and what each suite
  proves.

**Checked before it went**, at `03bf814`: build 18/18, data 1883/1883, mobile 389/389,
smoke 1021/1021, print 54/54, update 25/25.

**What this build is NOT known to do**

- **Printing a client's report prints the payroll behind it.** Found and measured at
  `880d7bb`, the next build: the client's PDF carries every worker's name and rate on page
  two. This is true of v80 through v85.
- Everything listed under v86, apart from the print leak, which v86 fixes.

## v84 — 28 August 2026 — `9ef68fd`

One commit on `main`.

**What the crew gets that v83 did not have**

- The seder goes to the man driving to one site, not to everybody. The message went out as
  the whole evening - five sites, everybody - to a man who can act on one gate; sending him
  all of them is how somebody reads the wrong line and turns up at the wrong place. Each
  site card carries its own send button once there is somebody to name. Who is away is left
  out of a one-site message: an absence is a fact about the crew, not about a gate.
- The site the message is about is remembered while the dialog is open, so changing the
  wording cannot quietly widen a one-site message back out to five.

**Checked before it went**, at `9ef68fd`: build 18/18, data 1878/1878, smoke 969/969,
mobile 358/358, print 54/54, update 25/25.

**What this build is NOT known to do**: everything listed under v85 and v86.

## v83 — 28 August 2026 — `7bf6860`

One commit on `main`.

**What the crew gets that v82 did not have**

- The crew's vehicles, and what they are owed for. A vehicle earns a flat three hundred for
  a day it went out, paid to whoever OWNS it, whether or not he was on a site himself. An
  ordinary evening writes nothing: the default is that they all went out, and only the
  exception is stored. The rate lives in a short history on the vehicle, each entry what it
  was worth from that date onward, so a raise does not repay last month, and a vehicle added
  today does not earn for months already closed.
- A day nobody worked is not a day five vehicles earned; the count follows real work.
- A man who worked nowhere but whose vehicle went out now has a row on the pay sheet.

**Checked before it went**, at `7bf6860`: build 18/18, data 1878/1878, smoke 963/963,
mobile 358/358, print 54/54, update 25/25. Firestore needed nothing: the rules ask `hasAll`,
not `hasOnly`, so the new field travels as it is - and they were not re-run.

**What this build is NOT known to do**

- **The silent default moves money.** The three-hundred-a-day default is the reason the
  feature was later retired rather than left running: a day nobody said anything about is a
  day somebody was paid. Known from the retirement on the branch, not at release.
- Everything listed under v85 and v86.

## v82 — 28 August 2026 — `c942723`

Three commits from the design pass, merged onto `main`. One conflict, not a disagreement.

**What the crew gets that v81 did not have**

- The week cell says its day once instead of twice.
- The ask dialog is held to the same 44px target floor as the rest.
- The day screen's header is one box rather than three stacked ones.

**Checked before it went**, at `c942723`: build 18/18, data 1852/1852, mobile 358/358,
print 54/54, smoke 948/948, update 25/25.

**What this build is NOT known to do**: everything listed under v85 and v86.

## v81 — 28 August 2026 — `3560444`

One commit on `main`, from the first report off a real phone.

**What the crew gets that v80 did not have**

- A finger can scroll the list it is looking at. Reorder mode could not be scrolled past
  the fifth man of twenty-one on an iPhone: `touch-action: none` was on the whole row, and
  in this mode the rows ARE the screen. The handle carries the rule, the row never needed
  it. Invisible to every assertion in the repository and to a mouse, which is why it took a
  phone to find; there is now a check at every width that no row blocks panning, that the
  handle still does, and that the last man and the save button can be reached.

**Checked before it went**, at `3560444`: mobile 356/356, smoke 947/947, print 54/54,
build 18/18, update 25/25.

**What this build is NOT known to do**: everything listed under v85 and v86.

## v80 — 28 August 2026 — `f645751`

Eleven commits from `claude/farkad-mobile-design-review-odl8ue` merged onto `main`, on top
of the ledger groundwork (`ee3e9ed`) and the adversarial round (`c6fc85d`). Three conflicts,
one of them a real disagreement: the design pass set the bottom bar's labels to 11px, under
the 12px floor that had gone in the day before. The bolder weight is kept; the size is not,
and the assertion that holds it is in the mobile suite at every width.

**What the crew gets that v79 did not have**

- **The advances ledger, read-only.** An advance used to be a record that every change
  MUTATED: corrected from 500 to 300 on the 12th, nothing anywhere said 500 was ever written
  down, or by whom, or when. Now there are entries - given, corrected, cancelled - never
  rewritten and never removed, and what the screens read is a fold over them. This build
  ships the READER and the MIGRATION and writes nothing new: `LEDGER_WRITES` is false
  because a v79 phone has never heard of an entry, and a v80 phone that stopped writing the
  old field would record money the other two cannot see. The boot mirrors every existing
  advance into the ledger once, with a deterministic id, and leaves `schedule.advances`
  byte-identical. Settings answers whether the ledger agrees with the field it was built
  from, in three registers: agreement, merely behind, genuine disagreement.
- The advance form validates to the wire's own standard. `Infinity` and a typed
  `2026-13-45` used to pass commit and quarantine the entire record on the next launch;
  amounts are whole shekels with Arabic-Indic digits normalised, and the date is clamped to
  the account containing TODAY - the viewed-range clamp filed live cash into a fortnight
  printed weeks ago.
- The copy-undo was dead code - the snapshot ran after the mutation - and now works.
- The totals stop asserting what they do not know: no equation over unpriced overtime, the
  money cell answers from the days' own stamps.
- The client's file carries the client's numbers and the pay sheet shows its working;
  הגדרות וכלים grows into six rooms; every state banner tells the truth in its own colour;
  one solid dock; a displaced ask dialog resolves as a dismissal instead of hanging its
  caller; the WhatsApp button is no longer the thing a quarantined phone had disabled.

**Checked before it went**, at `f645751`: build 18/18, data 1852/1852, mobile 350/350,
print 54/54, smoke 947/947, update 25/25.

**What this build is NOT known to do**

- **The ledger has been proved against no real data.** Whether the fold agrees with the
  old field on a live record after a few weeks is the question the parity line exists to
  answer, and it had not been asked when this went out.
- **Reorder mode cannot be scrolled past the fifth man** on a real iPhone. Found the same
  day; fixed in v81.
- Everything listed under v85 and v86.

---


## v79 — 28 August 2026 — `94d5a84`

Sixteen commits, fast-forwarded from `claude/farkad-mobile-workers-v79`, so what is on
`main` is exactly the tree that was verified. The previous build on `main` was v78
(`1dec586`).

**What the crew gets that v78 did not have**

- The phone screen rebuilt around the hand holding it: the day's work reachable with a
  thumb, 44px targets, the home indicator cleared, the sticky headers dropped on a short
  landscape screen where they used to cover the last man in the list.
- Printing that prints the report and nothing else. An open dialog used to print over the
  pay sheet and produce grey pages; now every overlay, bar and dock is excluded by
  default, without the person having to close anything first.
- A worker's history is proved before he can be deleted, and his lifecycle is safe across
  two phones editing at once.
- Nothing off this origin sits between a person and their own data: the export library is
  fetched after the app is running, never before it draws.
- The device says it is filling up while there is still room to act, instead of at the
  moment a tap is refused.
- The bookkeeper's file: a name opening with `=` or `-` is a name and not a formula, and
  the workbook opens right to left the way it reads.
- Zoom, which the app used to refuse, is the reader's to use.

**Checked before it went**, from a clean clone at `94d5a84` on Node v22.22.2:

| suite | |
|---|---|
| build | 18/18 |
| data | 1794/1794, and the same at seeds 1, 42, 2026 and 42 again |
| print / PDF | 54/54 |
| mobile layouts | 278/278 |
| smoke | 902/902, twice |
| update path | 25/25 |
| Firestore rules | 34/34, against a local emulator |

`git diff --check` clean, all 40 tracked JS/MJS files syntax-checked.

**What this build is NOT known to do**

- **It has never run on an iPhone.** Every layout, print and update assertion was measured
  in headless Chromium. That is the right tool for layout arithmetic and it is not a
  phone: an installed app on iOS is resumed rather than reopened, and the update handover
  is at its most awkward exactly there.
- **The update banner was proved against a real deploy, in Chromium.** If a phone sits on
  v78 without offering the banner, Settings has a manual check that asks the server
  directly.
- **The device still fills up.** It now warns first - at about two years of records for a
  crew of thirty - but the ceiling itself is not gone.
- **CSV cannot carry a direction.** The xlsx export opens right to left; the CSV fallback,
  used when the export library cannot be reached, is at the mercy of whatever opens it.


## v122 — settings with a visible name and clear sections

The header now says הגדרות beside a gear icon. The settings sheet groups connection
and updates, backup and restore, and device/help into three labelled sections with
always-visible jump buttons. Status and held records remain first; any carry review
is beside them. Backup remains the sole primary action, and restore keeps its separate
warning and existing confirmation flow. The technical report lives under help.

This release changes layout and in-sheet navigation only. Every existing action and
data path remains in place. The settings browser suite checks section focus/scroll,
reopening, redraws, phone and desktop widths, dark mode, double text size and unchanged
worker data after navigation. The release proof belongs to the tested commit/PR.


## v123 — a clearer crew page

The crew page now has a named header, worker/site shortcuts, distinct add and reorder
controls, and worker search by name, phone or ID. Search includes disabled workers and
never changes roster order or shared data. Worker cards show the currently effective
pay cycle beside readable details, the existing activity switch, and a named edit
button. Disabled workers retain full text contrast. Site cards share the same layout.
Empty-list headings reset their counts. Existing edit, activity and deletion guards
remain unchanged. A dedicated browser suite checks filtering, redraws, current/future
pay-cycle labels, navigation, editing and phone/desktop layouts.
