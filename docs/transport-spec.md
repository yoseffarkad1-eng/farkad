# פרקד — vehicle dispatch (הסעות): what exists, the architecture, the plan

**Status, 2026-11-10: the screen was rebuilt as a picture (v174 candidate).** v171 was served
on 2026-11-09 with the four-tab planner this document designed; the owner tried it on his
phone the next day and sent the screen back. What is built now is described in "The screen
as built" directly below, and in `docs/releases.md` (v174). §0 onward is the v171 design and
its reasoning, kept because the storage decisions in it still hold - **but §4 (the
suggestion), §5 (most of validation), §6 (the UI flow) and §7 (the strings) describe a
planner that no longer exists.**

## The screen as built (v174)

The owner, 2026-11-10: *"Very hard and complicated and it will take us a lot of time. I want
the car drawn, as if photographed from above, and on every seat written 'add worker', and I
take the worker, drag him with my finger and distribute them over the cars."*

**One scrolling screen** (`js/ui/transport.js`, `renderTransport` → `transportView`):

| part | what it is | where |
|---|---|---|
| head | «הסעות», the day, «חזרה» | `index.html`, `#transportPanel` (still `.settings-panel`) |
| tray | sticky at the top of the panel's own scroller; a chip per man with a site today and no seat; «ממתינים לשיבוץ (n)» / «כל העובדים משובצים»; the quiet «לא בהסעה שלנו» | `transportTray`, `transportChip` |
| a car | one card per active vehicle: name, «3 מתוך 5», «זמין היום» toggle; the drawing; at most one calm line; the WhatsApp door when the driver's seat is taken | `transportCard`, `transportCar`, `transportSeat` |
| folded lines | «לא בהסעה שלנו (n)» (bring a man back), and «רכבים» (the list editor) | `transportAway`, `transportFleet` |

**The drawing.** `TransportEngine.seatRows(vehicle)` returns the rows front to back, each
from the LEFT of the car to its right: `[[1,2],[5,4,3]]` for a five-seater,
`[[1,2],[4,3],[6,5],[9,8,7]]` for the Volkswagen (`rows: [2,2,2,3]`), two in front and rows of
up to three for anything else. Seat 1 is the driver's, on the left. Rear rows are numbered
from the right because v171 called seat 3 «אחורי ימין». The car element has `dir="ltr"` so the
page's direction cannot mirror it. CSS shapes for the body, windscreen and wheels; two inline
SVG glyphs (steering wheel, plus); the design tokens of `css/design.css`.

**The rules of a seat** are the engine's, pure, and the same for a drag, a tap and a test:

- `layout(ctx, day)` is the ONE reading of a stored plan: a vehicle that stays home or left
  the list has no car; a man with a status is in no seat; a man named twice sits where the
  list reaches him first; a passenger with a good seat number keeps it and any other gets the
  first free seat; nobody is squeezed in. A seated man with no site today stays drawn.
- `place(ctx, day, worker, vehicle, n)` → `{trips, displaced}` or `null`: an empty seat is
  taken; on a taken seat a seated man changes places and a waiting man displaces; seat 1 is
  the driver. Refused: a vehicle that stays home, a seat it does not have, a man who is not
  riding with us, his own seat.
- `remove`, `waiting`, `tripsOf` (the picture written down), `validate`.

**Three ways to seat a man** (all in `js/ui/transport.js`):

1. **Drag** - "carrying a man": Pointer Events with capture, a floating copy positioned
   inside the panel (not a new fixed layer), the seat under the finger lit, the list scrolled
   by a finger resting 250 ms within 64 px of its top or bottom, `pointercancel` restoring. A
   man in the tray lifts after 8 px (`touch-action: none` on the chip only; a level swipe
   slides the tray instead). A man in a seat lifts after a 300 ms hold, so that a swipe that
   starts on a seat scrolls the list and moves nobody.
2. **Tap then tap** - `transportChip` sets `transportPicked`; `transportSeatTap` places him.
3. **Tap the seat** - `transportSeatTap` → `transportChoose` (the app's `askChoice`).

A tap on a taken seat offers «הוצאה מהרכב». A tap on an empty seat with nobody waiting says
«כל העובדים משובצים» - no tap does nothing.

**Storage** is §3's, narrowed. `farkadTransport:day:<date>` is
`{version: 1, unavailable, status, trips: {<vehicle>: {driver, passengers, seats}}, marks:
{<vehicle>: {sig, openedAt}}}`. Reading a day written by v171 writes nothing; the first change
writes it in this shape, dropping `accepted`, `workerLocks`, a trip's `locked` and `area` and
a mark's `sentAt`. `farkadTransport:settings` keeps the vehicles; v171's `areas` and
`workers` are carried through a save, unread.

**The driver's message** is composed from the picture as it is (no accepted version): hello,
the day, the vehicle, the passengers in seat order with their sites, the destinations.

**The summary of the day (v179).** The owner asked whether there is a report for the cars.
One button under the tray, «סיכום הסעות ליום», opens a dialog (`#transportSummaryModal`) with
the day on one page: each vehicle that goes out with somebody in it - name, occupancy, driver,
the men in seat order with their sites - then the men waiting, the empty vehicles, the ones
kept home. `transportSummaryBlocks(ctx, day, date)` is pure and reads `TransportEngine.layout`,
the screen's own reading; nothing is written, marked or sent by it. The text leaves through
`shareTextOut` / `copyTextOut` (`js/ui/share.js`), the picture through
`sharePrintout('transport')` (`js/ui/printout.js`), read off the dialog's field. The men marked
«לא בהסעה שלנו» are not in it. `docs/releases.md`, v179.

**Tests**: `tests/transport.test.mjs` (the engine's geometry and seat rules, a v171 day and
list opening cleanly, the message, the words, the store's isolation) and
`tests/transport.browser.mjs` (real touch sequences through Chromium's input pipeline at
440x956 and 375x667, both schemes). **Not tested on any real phone.**

---

## Phase 3: shared (designed 2026-11-10; shipped shut in v185; THE GATE OPENS IN v186 - `docs/releases.md`)

The owner, 2026-11-10, having tried the picture on his own phone: *"add the feature to the
other accounts."* Offered two meanings, he chose **one shared plan**: he seats the men, the
other two phones see the same cars and the same riders, and may change them.

This section is the design, written before the code. Where the code ended up differing, the
difference is said at the end ("As built"). The v171 sketch of phase 3 in §2.4 (create-only
accepted versions) is void: there are no accepted versions since v174.

### 3.1 Where it lives: documents of its own, beside the record and never in it

    schedules/{docId}/transport/settings              the list of vehicles
    schedules/{docId}/transport/day_<YYYY-MM-DD>      one day: who sits where, which vehicles
                                                      stay, who gets there another way

`{docId}` is the schedule's own (`current`), so the people are the schedule's allow-list and
there is one place in `firestore.rules` where they are named. A subcollection document is a
document of its own: it adds **no byte** to `schedules/current` (the 1 MiB ceiling is per
document), it has no field in it, and nothing the record's protocol reads - `revision`,
`lastOpId`, receipts, fingerprints - is touched by a transport write.

    settings   { v: 1, revision, updatedAt, updatedBy, vehicles: [ {id, name, seats, active, rows?, …} ] }
    day_<date> { v: 1, revision, updatedAt, updatedBy, date, unavailable: {vehicle: true},
                 status: {worker: 'private'|'contractor'|'other'}, trips: {vehicle: {driver, passengers, seats}} }

- **What is NOT shared:** a day's `marks` («נפתח בוואטסאפ»). It says that THIS phone opened
  THIS driver's chat; on another phone it would be a claim about a tap nobody there made.
  It stays in the local day record, beside the shared part, and survives an adoption.
  v171's `areas` and `workers` in the settings are not shared either: nothing reads them.
- **A vehicle travels as the phone's own reader keeps it** (`transportReadVehicle`), field
  for field, so a field another change adds to a vehicle (a lasting on/off, say) is shared
  the day the reader keeps it, with no change here and none in the rules.
- **Privacy:** worker ids and vehicle names, as stored today. No name of a man, no phone, no
  site, no rate. Nothing new.

### 3.2 The separation from the record's sync, by construction

| the record | transport sharing |
|---|---|
| `js/sync/*`, the outbox, the journal, the send claim, receipts | none of them. One new file, `js/ui/transport-share.js`, which never names `FarkadSync`, `State.commit`, `State.save` or `Recovery` (pinned by a test that reads the file) |
| reaches Firebase through `FarkadSync.connect(adapter)` | reaches it through `window.FarkadTransportShare.connect(…)`, a second and separate object the adapter hands over AFTER the record's, inside a `try` - a throw there cannot stop the record connecting |
| its status sentence (`FarkadSync.status`, the chip, the ⋯ line) | its own line, on the transport screen only. Nothing in the share file calls `setStatus`, `fail` or `refreshStatus`; a refused or failed transport write is not an error of the record |

So a transport failure cannot block, delay or dirty the record's sync: there is no shared
queue to be stuck behind, no shared status to be demoted, and no shared document to be
refused. Measured in Node (the fake cloud refusing every transport call while the record
syncs and says «מסונכרן») and on the emulator (the OLD rules refusing the transport paths).

### 3.3 Offline first

A change is written to the phone at once, exactly as today (`Store.setVerified`, optional) -
the share file is told AFTER the local write and never before, and the screen never waits
for it. What the phone knows about each shared document is one small record of its own:

    farkadTransport:shared:<settings | day_YYYY-MM-DD>   { rev, base, sent? }

`rev` is the cloud revision this phone's copy was last equal to; `base` is the shared part
at that revision, as canonical text. **There is no "dirty" flag to forget to set:** a
document is owed to the cloud exactly when the shared part of the local copy differs from
`base`. A crash between the two writes therefore cannot hide a change.

The screen says which of these is true, in one line under the head (proposed Hebrew, in the
transport words block, pinned):

| state | when | sentence |
|---|---|---|
| (nothing) | the gate is shut; or the phone has no cloud account and never shared | - exactly today's screen |
| checking | connected, the first answer has not come | «בודק את השיבוץ המשותף…» |
| shared | heard from the cloud, nothing owed | «השיבוץ משותף עם הטלפונים האחרים ומעודכן.» |
| waiting | something is owed | «השינוי שמור במכשיר הזה ומחכה לחיבור כדי להתעדכן בענן.» |
| unchecked | no answer, or the answer is from before the signal went | «אין חיבור: לא ניתן לבדוק אם השיבוץ מעודכן. מוצג מה ששמור במכשיר הזה.» |
| not shared | the cloud refuses the transport paths (rules not published yet, or this address is not on the list) | «השיבוץ עדיין לא משותף: הענן אינו מאפשר זאת כרגע. הוא שמור במכשיר הזה בלבד.» |

Never «נשלח», never «מסונכרן» (that word is the record's).

### 3.4 Two people at once: the day is the unit, and the server is the judge

**The unit of conflict is the whole document, with a revision compare-and-set.** A write
says "I was built on revision N and I am N+1"; the adapter checks it inside a transaction
and the rules check it again (`revision == resource.data.revision + 1`; a create must be 1).
Two phones that both built on N: one lands, the other is refused and handed the document
that won.

Why not one field per seat, merged by the server so that two people seating different cars
both land: **the rule "a man is in one seat" is a rule about the whole day**, and a
field-merge cannot see it. Moving a man is two fields (out of one seat, into another); two
phones moving the same man to two cars would both land and he would be in both; a phone
keeping a vehicle home while another seats a man in it would both land and the man would be
in a car that is not going. `TransportEngine.layout` would draw something for each of these,
but it would be a plan NOBODY made. A day is about 1 KB and is edited by one person for a
minute in the evening; the price of the coarse unit is that the loser of a same-second race
redoes one drag. That is the cheaper mistake.

**What the loser sees.** His copy of that day is put aside, the plan that won is drawn, and
one sentence says so, with two buttons:

    «השיבוץ של היום הזה שונה בטלפון אחר. מוצג השיבוץ המשותף, והשיבוץ שלך נשמר בצד.»
    [ להשתמש בשיבוץ שלי ]   [ להשאיר את המשותף ]

«להשתמש בשיבוץ שלי» asks once (the app's own question) and then makes his copy the local
plan again, which is an ordinary change: it goes up as revision N+1 through the same
compare-and-set, and if the day moved again meanwhile he is the loser again and is told
again. There is no force-write. The copy aside is one per document, the newest; it is
removed by either button and pruned with the day.

The same for the list of vehicles, with its own two sentences.

**Same fact twice is not a conflict:** if the document that won says exactly what this phone
has, the phone just takes its revision.

**Its own echo is recognised across a restart:** what is being sent is written into the
share record (`sent: {rev, text}`) before the request leaves, so a request that landed
while the app was being closed is not mistaken, at the next opening, for another phone's
change.

To be proved on the emulator with the production adapter: two phones on the same seat; the
same man into two cars; a phone offline for a day and back; a vehicle kept home on one
phone while the other seats a man in it. In each: exactly one write lands, the man is in at
most one seat on the server and on both phones, and the loser holds the winner's plan, his
own aside, and the sentence.

### 3.5 v174's rule survives

A stored day is rewritten only by its own change. Adopting a newer shared day writes THAT
day's key and no other (and its share record); it keeps that day's own `marks`. A shared
day that says what the local day already says writes the share record only - the local
day's bytes, v171 leftovers included, stay as they are.

### 3.6 The switch stays per phone, and the gate is in the build

- `farkadTransport:enabled` is unchanged. Off: the share file reads nothing, writes nothing,
  listens to nothing and sends nothing - checked by counting every Store read and every
  call the fake cloud receives.
- On, with no cloud account (empty config, or signed out): nothing connects, and the phone
  works exactly as today.
- **The gate:** `TRANSPORT_SHARE = false` in `js/ui/transport-share.js`, read through
  `transportShareOn()`, with the suites opening it through the existing test-only seam
  (`FARKAD_FLAG_OVERRIDES.transportShare`) - the way `LEDGER_WRITES` is gated in
  `js/model/ledger.js`. It is NOT an entry in `FARKAD_SHIPPED_FLAGS`: that object is in
  `js/model/schema.js`, which this work was told not to touch. Shut, every hook in
  `js/ui/transport.js` returns before doing anything: no key, no listener, no line on the
  screen, the old sentence on the switch.

### 3.7 The first time a phone meets the cloud

Nothing is sent for a document this phone has never shared until the cloud has been HEARD
(the first answer of the listener, from the server and not from a cache). Then, document by
document:

| the cloud | this phone | what happens |
|---|---|---|
| has none | has a plan / a list ON ITS DISK | created at revision 1 (the transaction refuses if somebody got there first, and then the next row applies) |
| has none | has nothing on its disk (an unopened day; the seven vehicles never edited) | nothing. An untouched list is not uploaded: it is the seed every phone already has, and uploading it would make the first phone to connect - not the owner's - the author of the shared list |
| has one | has nothing, or exactly the same | adopted silently |
| has one | has something DIFFERENT, never shared | **the cloud's wins; this phone's copy is put aside and said once**, with «להשתמש בשלי» |

Why the cloud wins rather than asking first: a question that must be answered before the
screen can draw is a screen waiting on the network (3.3), and "mine or theirs" is only
answerable looking at theirs. Why it is safe: the copy aside is on the disk before the
adoption is (verified write; if the copy cannot be kept, nothing is adopted and the screen
stays on the local plan and says it is not shared), so no order of crashes loses it.

What is NOT solved: three phones with three different edited lists. The first to connect
makes the shared one; the other two are each told once and each can put theirs back - and
the last to do so wins. The owner's phone should be the first to run the build that opens
the gate; the release note must say so (3.13, step 5).

### 3.8 Older builds, pruning, growth

- A build without sharing (v171-v182) never names `transport/` in its adapter: it cannot
  read, write or listen to these documents, and they are not in the document it does read.
  To be measured with the real older files out of Git on the fake cloud, and by the rules
  matrix on the emulator. Such a phone shows its own local plans, as today, and is simply
  not in the shared plan. Its screen does not say so (it cannot - it is already shipped);
  the release note has to.
- **Local pruning is unchanged** (35 days). The share records and the copies aside are
  pruned on the same date.
- **Shared day documents are never deleted.** The rules forbid delete, as they do for the
  schedule; a client that could delete could delete by a bug. Growth: at most one document
  per calendar day with a plan (about 1 KB) and one for the list - **at most 366 a year**,
  each its own document, so the 1 MiB ceiling is not in play. A phone listens only from
  35 days back (`documentId() >= 'day_<today-35>'`, which also takes `settings`, since
  `s` sorts after `d`), so what a phone reads does not grow with the years.

### 3.9 Rules, and the rollout

One nested `match /transport/{name}` under `match /schedules/{docId}`: read for the
allow-list; create only at revision 1; update only at exactly the next revision; never
delete; and the shape checked as far as rules can (the exact top-level keys, types, the
day's name agreeing with its `date`, sizes of the maps and the list capped). An independent,
minimal addition to main's file: no existing line changes.

To be measured, in the style of `docs/payroll-closure.md`: (a) every existing emulator
suite under the new file; (b) the new rules with only current builds in the field - nothing
changes for them; (c) this build under the OLD rules - transport says «עדיין לא משותף», the
record syncs untouched. From (b) and (c): rules first, then the build with the gate shut,
then the gate. **Measured: 3.13.**

### 3.10 Backup and the rescue file

Unchanged: transport is in neither, nor in a restore point, nor in the daily cloud copy.
What changes is the price: with sharing on, a lost phone no longer loses the plans or the
list - they are in the cloud and on the other phones. With sharing off (or on a phone with
no cloud account) it still does.

### 3.11 As built (2026-11-10) - where the code differs from 3.1-3.10, and what was found

**Files.** `js/ui/transport-share.js` (new: the whole client half, and the gate);
`js/ui/transport.js` (five marked hooks through `transportShareTell`, eighteen strings in the
one block, a paragraph in the header); `js/sync/firebase-adapter.js` (`transportOps`, and its
hand-over to `window.FarkadTransportShare` after the record's, in a `try`); `firestore.rules`
(one block); `index.html` (the `#transportShare` node, one script tag after transport.js);
`sw.js` (the file in the shell); `css/design.css` (the line and the notice);
`tests/harness.mjs` (`makeTransportCloud`, on `makeCloud().transport`). Not touched:
`js/sync/sync.js`, `send.js`, `receive.js`, `restore.js`, `status.js`, `boot.js`,
`js/state.js`, `js/store.js`, `js/recovery.js`, `js/model/*`.

**Differences from the design above.**

- 3.3, the «waiting» sentence is «השינוי שמור במכשיר הזה ועדיין לא התעדכן בענן.» and not
  «…ומחכה לחיבור…»: the state is also true for the third of a second a write takes with a
  good signal, and "waiting for a connection" would be false then.
- 3.3, one more state, **noRoom**: this phone's copy could not be put aside (the disk
  refused it), so the shared plan was NOT drawn over it - «אין מקום במכשיר לשמור בצד את
  השיבוץ שלך, ולכן השיבוץ המשותף לא הוצג. מוצג מה ששמור במכשיר הזה.» Nothing is sent from
  that document until the copy can be kept.
- 3.1, a document of another version (`v` not 1), with no revision, or whose `date` is not
  its name is neither drawn nor written over; the line says «לא ניתן לבדוק».
- 3.6, the switch's sentence in ⋯: with the gate open it is `switchLeadShared`, set by
  `transportRenderSwitch` - the card is built when transport.js loads, BEFORE the share file
  exists, and the browser suite caught the card still saying «לא משותף» with the gate open.
- **Both sides of every comparison go through the same reader.** What the phone holds is
  passed through `transportReadSettings` / `transportReadDay` exactly as a cloud document
  is, so "the same plan" is decided on what the reader keeps. A field added to a vehicle or
  a day is therefore shared from the moment the reader keeps it, and never before.
- **Two windows of the app on one phone** (not in the design; found while writing it up).
  `Store.get` answers from what THIS window last wrote before it asks the disk, so a window
  that did not adopt a shared day went on holding the older copy, and its next change would
  have been written over the adopted plan and sent as this phone's change to the winner.
  With the gate open the share file listens for the browser's `storage` event on the
  transport keys, drops that window's copy (`Store.forget`, safe because every transport
  write is optional and a refused optional write is never left in the cache) and redraws.
  With the gate shut two windows behave as they always did.

**Known limits, said rather than hidden.**

- One copy aside per document, the newest. A second loss on the same day before the first
  notice was answered replaces the first copy. The sentence is said each time.
- A phone whose list lacks a vehicle another phone added sees that vehicle's men as waiting
  until the shared list arrives (the list is taken before the days in every delivery), and
  if it changes the day in that window it writes the day without that car - as a normal
  change through the compare-and-set, visible to the other phone as its plan being
  replaced, with no notice there (the other phone had nothing unsent).
- **A later build that adds a field to a shared vehicle or day**: a phone on THIS build
  drops it when it next changes that document (its reader does not keep it). That is the
  v166 Rima situation in small. Every sharing phone must be on the newer build before the
  field is first used, or the document version `v` moves and the rules with it.
- **A lost answer and another phone's write in between.** This phone's write landed but
  its answer did not arrive, and before it asked again another phone changed the same day.
  The server keeps no history, so the phone cannot tell "they built on mine" from "mine
  never landed": it treats it as a loss - its copy aside, the sentence said - though its
  change may be inside the plan that won. It errs towards telling.
- **What the server says to the loser of a race** is `permission-denied`, the same word as
  an address off the list (measured on the emulator). `transportOps.write` reads the
  document again on that word and says `conflict` when it has moved. If that second read
  also fails, the line says «עדיין לא משותף» until the listener next answers.
- **A vehicle's lasting `off` (v184) is shared with the list**, as 3.1 said a new field
  would be: the list's reader keeps it and both sides compare through that reader. Turning a
  vehicle off writes the list and no day, locally and in the cloud (measured in Node and on
  the emulator). The other edge of the same fact: a build that does not know the field
  (v183 and older) drops it at its next write of the list, and on a phone that shares, this
  build then sends that as the phone's own change - the vehicle is on again for everybody.
  No window of an older build may run on a sharing phone (`docs/releases.md`, v185).
- Not tried on a real phone, and not against the real Firebase SDK in a real page: the
  adapter's `transportOps` is run by Node against the emulator, and the page-level suite
  bridges to a fake cloud. **The real project was never touched.**

### 3.12 The rules addition, and what was measured

The whole addition, nested in `match /schedules/{docId}` after the `receipts` block
(`tests/transport.emulator.test.mjs` checks that with this block removed the file is
`origin/main`'s byte for byte):

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

| what changes | for whom |
|---|---|
| `schedules/{docId}/transport/{name}` becomes readable and writable (create at revision 1, update at exactly the next revision, never delete) | the three addresses of `allowed()`, and nobody else |
| every other path, every existing rule, every existing function | nothing - no existing line is edited |

What rules cannot check and the client does: what is INSIDE a trip, a vehicle or a status
(no loops in rules), and that a day's name is a real calendar date (the pattern takes
`day_2026-13-45`; every client refuses it by `isRealDate`).

**Growth, measured** (`tests/transport.share.test.mjs`, on the documents the shipped client
writes for a roster of twenty with ids of the roster's own length): a full evening - twenty
men seated in six vehicles, the seventh kept home - is 971 bytes of JSON; the list of seven
vehicles 603 bytes. One document per calendar day that has a plan, plus one: at most 367
documents and about 0.34 MB a year in all, each document a thousandth of the 1 MiB ceiling
- and none of it in the schedule document. A phone listens from 35 days back, so what it
reads when it opens does not grow with the years.

### 3.13 The rollout order, measured

`tests/transport.emulator.test.mjs`, on the Firestore emulator: the rules as they would be
pasted and the rules in the field today (read out of Git: `origin/main:firestore.rules`,
which the owner verified is what is live); this build's client and adapter; and v180 and
v182 - their own files and their own adapter, out of Git. Plus every emulator suite that
existed before this work (rules, cas-emulator, rollout, bootstrap, bootstrap-rules,
money-concurrency, rollout-matrix, reminders-emulator), run UNCHANGED under the new file.

| client | rules | records a day | the shared plans | what transport says |
|---|---|---|---|---|
| older (v180, v182) | today's | yes | none can exist: no rule matches the path | nothing - its own plans, on its own phone |
| older (v180, v182) | **new** | **yes**, at the record's next revision, synced | **never touched**: its adapter has no call to them; two documents put there beforehand are byte for byte the same afterwards | nothing - its own plans, on its own phone |
| this build, gate SHUT (as merged) | either | yes | **never touched**: the transport cloud is not called at all (Node, counted; Chromium, counted) | nothing: today's screen, today's sentence on the switch |
| this build, gate OPEN | today's | **yes**, at its own revision, no error on the record's line | cannot be created: a direct write is `permission-denied`, nothing exists under the path afterwards | «השיבוץ עדיין לא משותף: הענן אינו מאפשר זאת כרגע. הוא שמור במכשיר הזה בלבד.» - and the plan works on the phone as before |
| this build, gate OPEN | **new** | yes; the schedule document, its revision and its receipts do not move for any transport write, and the reverse | shared: created at revision 1, changed by compare-and-set, never deleted | «השיבוץ משותף עם הטלפונים האחרים ומעודכן.» |

Every cell is safe, in every order - which is what a pure addition to the rules, behind a
gate, with a client that fails soft, was built to give. So the order is chosen for the
owner's convenience and for one thing that is NOT symmetric (step 5):

1. **Save what is live.** Firebase console → Firestore Database → Rules: copy what is
   there to a file and compare it with `git show origin/main:firestore.rules`. If they
   differ, stop: the block was written against a file that is not the live one.
2. **Publish the new rules** (paste this branch's `firestore.rules` → Publish). No phone
   needs to update first and none is refused anything: the first two rows of the table.
3. **Ship this build with the gate shut** (as merged). Nothing about הסעות changes on any
   phone. This step and step 2 can be done in either order.
4. **Update all three phones**, and check each in ⋯ - not assumed.
5. **Only then open the gate** (`TRANSPORT_SHARE = true`, a later build, stamps moved), and
   **the owner's phone takes that build first**: opened, signed in, with a signal, before
   the other two are updated. Sharing does not wait for the הסעות screen - a phone whose
   switch is on starts when the app opens signed in - and the first phone to connect with
   an edited list or a planned day becomes the author of the shared one; the others meet
   it, and a phone that had its own is told once and can put its own back (3.7). If
   another phone gets there first nothing is lost - the owner is the one told, and
   «להשתמש בשלי» puts his back - but it is a needless conversation.

**If the gate is opened before step 2**, nothing breaks and nothing is lost: every phone
says «עדיין לא משותף» and keeps its plans on itself, and the day the rules are pasted each
phone finds out by itself (it asks again on a ladder that tops out at five minutes, when
the screen is opened, and when the signal returns) - the fourth row, measured.

**A phone still on an older build after step 5** keeps its own local plans and is simply
not in the shared plan. It cannot say so (it is already shipped). Its plans are not lost
when it updates: they meet the shared ones by 3.7.

**Rolling back the rules** (republishing `origin/main`'s file): the shared documents stay
where they are, unreadable and unwritable; every phone with the gate open says «עדיין לא
משותף» and goes on from its own copy; nothing of the record is affected. Republishing the
new rules brings them back, and changes made meanwhile meet them by the ordinary rule
(the loser's copy aside, said).

**Rolling back the build** (shutting the gate again): each phone keeps the plans it holds;
the share records and copies aside stay on the disk, unread; the documents stay in the
cloud.

### 3.14 A disk with no room - corrected after the review of v189 (c3, c4)

Every transport write is optional (it never spends a restore point), so on a full disk it is
refused, and the session's copy can be AHEAD of the disk. Two things followed in v186-v189,
both measured by the review and both red in `tests/transport.share.test.mjs` on v189's file:

- **c3.** An adopted plan was put in memory and then saved; refused, it stayed drawn and
  held over the older plan on the disk. The next answer from the cloud found memory equal to
  itself ('same') and recorded the cloud's revision; after a reopen the disk's older plan
  read as this phone's change and went up over the other phone's - a seat, or a vehicle
  turned off, gone on every phone, nothing aside, nobody told. «להשתמש בשלי» the same way.
- **c4.** An answer to a conflict that recorded nothing counted as progress, and the next
  write went at once: a phone whose disk refused the share record sent transactions in a
  tight loop (some 1,400 in two seconds) for as long as the app was open.

The rules now, in `js/ui/transport-share.js`:

1. **Memory never runs ahead of the disk for a shared document.** An adopted plan, and
   «להשתמש בשלי», are built beside the session's copy and put in its place only once the disk
   has them. A refused adoption leaves the screen on what the disk holds and the line says
   **noRoom** (the existing sentence; its first clause, «לשמור בצד את השיבוץ שלך», was written
   for the copy aside, and for a plain adoption nothing of this phone's needed putting aside -
   the rest of it is exact); a copy aside it had just written goes back as it was; the next
   word from the cloud asks the disk again. A refused «להשתמש בשלי» leaves the shared plan
   drawn, the copy aside with its two buttons, and the screen's «השינוי לא נשמר במכשיר».
2. **A share record moves only to what the disk holds**, read past Store's session cache
   (`Store.durableGet`): 'same' gives the disk the plan first.
3. **Nothing is sent that the disk does not hold.** A change of the person's that the disk
   refused stays on this phone's screen with «השינוי לא נשמר במכשיר» and is owed; it goes up
   once a write of that day or list lands (the person's next change of it, made with room).
   A plan from the cloud meanwhile is drawn only if the disk takes this phone's copy aside
   AND the plan - then it is said as any loss is; otherwise the line says noRoom and the
   screen stays as it is. Lost if the app is closed first, as that sentence says. (v186-v189
   sent it from memory; after a reopen it was reversed on every phone.)
4. **Progress is the record moving.** A write is followed at once only when this phone's
   record of the document moved past the revision it was built on; anything else - a refused
   record, a plan the disk would not take, a document this build cannot read - waits for the
   ladder (5 s, doubling, never slower than 5 min). Measured at a thousandth of its time: 15
   writes in what is fifty minutes on a phone, where v189 wrote 2,146.

The exception: a session with no disk at all (`js/store.js` holds everything in memory for
the rest of the session) takes Store's memory as its storage - nothing of it outlives the
session to come back - and draws the shared plan as before.

Not covered: a disk that v186-v189 already left with a record ahead of its plan (the review's
state, before this build) still reads, at its first opening on this build, as this phone's
change - there is nothing on it to tell the two apart. And not tried on a real phone.

---

**The v171 design follows.** Its status line at the time: phase 1 built as the v171 candidate
(`js/model/transport.js`, `js/ui/transport.js`, `tests/transport.test.mjs`,
`tests/transport.browser.mjs`; `docs/releases.md`, v171). Where that build differed from the
first proposal, §0 says how.

## 0. The owner's decisions (2026-11-09), and what the build did with them

| question (§9) | his answer | in the build |
|---|---|---|
| The seven vehicles | Right. The 9-seater is a Volkswagen: 9 seats, 2 in front (the driver one of them), then rows of 2, 2 and 3. Five-seaters: 2 front, 3 rear | Seeded once as `tv_01`…`tv_07`; the Volkswagen carries `rows: [2,2,2,3]`. He maintains the list himself: add, rename, seats, retire |
| Who may drive | He decides per worker, and which vehicles | Per-worker `canDrive` and `drives` in this phone's transport settings - not roster fields |
| Pickup areas | Each worker has ONE fixed area; the list is his | The list starts EMPTY; a man with no area yet is planned for all the same (the engine treats "no area" as one more group) |
| Drivers | A driver is a worker on the roster and leaves from his own home | A trip's pickup area starts as its driver's. Only a man working that day is offered as a driver |
| Which ride | Morning only. No return | No return trip anywhere in the model |
| «ממתין» | Removed | Statuses are רכב פרטי / נוסע עם קבלן אחר / אחר, plus the default (rides with us). A stored `waiting` is dropped on read |
| Who sees the plan | First on his phone only, local, no cloud. The other phones later, in a separate approved step | Architecture B, phases 1 and 2 only. No sync, no rules change, nothing in the schedule document, outbox, journal, backup, restore point or rescue file |
| Wording | Blanket approval of professional wording; not to be asked string by string | All strings in one block, pinned in a node test, listed in `docs/releases.md` as proposed |

Where the build differs from the proposal that follows:

- **No `FARKAD_FLAGS.transport`.** The proposal had a code flag plus a per-device switch. The
  build has only the switch (`farkadTransport:enabled`): a flag is the same on all three
  phones, and the requirement is that it is not. Nothing unfinished is reachable either way -
  the switch is off by default.
- **Keys.** `farkadTransport:settings` (not `:config`), vehicles and areas as ordered arrays;
  the marks live in the day record (`marks`), not in a separate progress key.
- **Unreadable records** are copied to `<key>:unreadable` (not `farkadTransport:damaged:<n>`),
  and the screen starts empty and says so rather than going read-only - unless the copy could
  not be kept, in which case nothing is written over the bytes.
- **Retention** is by date: day records older than 35 days are removed when the panel opens.
- **The driver list and the message are on the page, not in dialogs**: the list opens inside
  the vehicle's card, the message is on the driver's card with its link. Accepting and the
  list editing use the app's own questions (`js/ui/ask.js`).
- **A man on two sites that day** rides to the first site his day holds; the second is said on
  his card («רשום היום גם ב… ההסעה לאתר הראשון.») and not routed.
- **Tests** are two files, not five: `tests/transport.test.mjs` (engine, words, message,
  store isolation, the switch) and `tests/transport.browser.mjs`.

What follows was written before the build ("Everything in this folder is a proposal") and
is kept as the reasoning; read it with the table above.

---

## 1. What exists today

### 1.1 The dormant feature is vehicle-owner PAY, not dispatch

The repo's "vehicles" is not a transport planner. It pays the OWNER of a vehicle a flat amount for
each day the vehicle went out, and it is wired into payroll.

| fact | where |
|---|---|
| The gate: `vehicles: false` in `FARKAD_SHIPPED_FLAGS`; frozen; the only seam is the test-only `FARKAD_FLAG_OVERRIDES` | `js/model/schema.js:33-42`, `:76-81`; `vehiclesEnabled()` `:2453-2455`; `tests/build.test.mjs:342-362` refuses a shipped file that defines the override |
| Roster of vehicles: top-level array `vehicles: [{id, name, ownerId, active, rates:[{from, amount}], …unknown fields kept}]` in the one schedule document (`scheduleData:v2` / `schedules/current`) | `js/model/schema.js:116-120`; rebuilt at load `js/state.js:1309-1331`; ids `v_01…` `js/model/schema.js:2622-2627` |
| Per-day record (v110/v111 redesign): `days.<date>.vehicleRuns.<vehicleId> = {out, name, ownerId, amount, siteIds[]}` — one field path per vehicle per day, price and owner stamped | `setVehicleOut` `js/model/schema.js:2601-2619`; validator `vehicleRunProblems` `:2550-2560`; contract `docs/ledger-vehicles-preparation.md:21-37` |
| Legacy per-day record (v83): `days.<date>.vehiclesOff = [vehicleId]` (three segments), kept and never converted | `js/model/schema.js:814-841`, `:1166-1183`; `js/state.js:1346-1353`; `js/sync/receive.js:1610-1617` |
| It is money: `vehiclePayFor` → `payrollReport` adds `vehicleDays`/`vehicleAmount` to a man's row and to `amount` | `js/model/schema.js:2573-2586`; `js/model/money.js:311-324`; report columns «ימי רכב», «שכר רכב» `js/ui/reports.js:1385-1404`, `:3436-3453` |
| It is tied to closed pay periods and to worker deletion | `vehicleDateClosed` `js/model/schema.js:2588-2597`; `workerFootprint` counts owned vehicles and runs `:1408-1416`; deletion blocked `js/ui/roster.js:1353` |
| UI that exists (all behind the flag): the «רכבים» panel on the crew page with «+ הוסף רכב», rename, rate, archive; a tray on the day screen «רכבים — נרשמים בנפרד» and a departure dialog (out / stayed, which sites) | `index.html:128-137` (`#vehiclesHeading`, `#vehicleList`); `js/ui/roster.js:770-960` (panel hidden when off `:774-785`); `js/ui/day.js:1314-1410`; `css/app.css:4761-4762`; held-record rows in ⋯ `js/ui/settings.js:435-451` |
| What the flag gates when off: nothing drawn (`roster.js:774`, `day.js:1315`), nothing computed (`vehiclesOutOn` returns `[]`, `schema.js:2563`), nothing written (`setVehicleOut` `:2602`, `roster.js:856/907/926/953`, `day.js:1342`), no report column (`reports.js:750/786/1390/3444`) — and every stored byte still survives load, save, sync, backup, recovery, restore | `tests/vehicles.test.mjs:1-20`; merge that never removes `js/model/schema.js:2468-2504`, called at `js/sync/receive.js:1002-1007`; wire document `js/sync/sync.js:1089`; backup `js/ui/backup.js:1174-1190` |

It has NO passengers, no seats, no driver, no eligibility, no pickup area. `docs/ledger-vehicles-preparation.md:29-30`
says so: "this does not assign individual passengers or enforce seat capacity".

### 1.2 Why it was retired

- v83 (`7bf6860`, 28 Aug 2026) shipped it with a default: an evening with nothing said meant every
  vehicle went out (`docs/releases.md:1795-1812`).
- v86's notes: "Vehicles are live and their default moves money… a silent Tuesday adds three hundred
  shekels to an owner's pay by itself. The owner has since cancelled the feature"
  (`docs/releases.md:1741-1744`).
- v91 candidate retired it behind the flag: "nothing is drawn, nothing is computed, nothing is
  written, and every stored vehicle byte survives every door" (`docs/releases.md:1649-1652`).
- v110/v111 rebuilt it as explicit departures (`vehicleRuns`), still off: "Source flags remain false.
  This is deliberate preparation, not a released feature" (`docs/ledger-vehicles-preparation.md:39-45`).
  It reached this branch in `e5b70f2` (v116 staging, 2026-10-02); `0197a64` (v119) added "vehicle
  ownership blocks deletion".
- Stale note: the header of `tests/vehicles.test.mjs:22-30` still lists four deliberately red checks
  (R1–R4). The suite passes 86/86 on the current tree; the comment was not updated.

### 1.3 What a phone does with vehicle data it does not use — measured

| build | behaviour | evidence |
|---|---|---|
| before v110 | "an old normaliser may drop or refuse that new day field" (`vehicleRuns`) | `docs/ledger-vehicles-preparation.md:42-43` |
| current tree, flag off | keeps `vehicles`, `vehicleRuns`, `vehiclesOff` byte for byte; a snapshot without them does not remove them; a malformed run in a snapshot refuses the whole snapshot as an invalid financial record | `js/state.js:1319-1353`; `js/model/schema.js:2468-2504`; `js/sync/receive.js:704-707`; `tests/vehicles.test.mjs` |
| current tree, a layer it has NEVER heard of (`transport`) | probe `probe-unknown-paths.mjs`: `storedScheduleProblems`/`fullScheduleProblems` refuse `days.<date>.transport` («שכבה שאינה מוכרת: transport»), accept an unknown TOP-LEVEL key but `normaliseSchedule` drops it; `journalEntryProblems` refuses both `transport.*` ("a path root nobody wrote") and `days.<date>.transport.*` ("a layer nobody wrote") | this folder |
| current tree adopting a cloud document that carries transport data | probe `probe-snapshot.mjs` (simulated cloud): the snapshot is adopted, writes are not blocked, the transport data is on neither the phone's memory nor its disk, and the cloud still has it | this folder |

That last row is exactly the v166 Rima situation (`docs/releases.md:343-375`): an old phone never
removes the new layer through an ordinary edit, but it does not keep it either, so a whole-document
restore run on it — or a restore of a backup, restore point or daily cloud copy it wrote — erases
the layer for everyone, with no word said.

---

## 2. Architecture

### 2.1 The two options

**(A) Inside the schedule document** — revive or extend the dormant model: an inventory in the
top-level `vehicles` array (or a new `transport` map), plans under `days.<date>.transport.*`,
travelling through the existing outbox, journal, CAS protocol, backups and restore.

**(B) A separate store** — its own `localStorage` keys through `Store`, later its own Firestore
documents under `transport/…`, never the schedule document, never the outbox.

| question | (A) in the document | (B) separate |
|---|---|---|
| Isolation from payroll and attendance (the owner's requirement) | Broken by construction. The existing model IS payroll (`money.js:311-324`), blocks worker deletion, and answers to closed periods. A new layer on the day record shares the day's validation: one malformed transport record refuses the whole day or the whole snapshot, the way a malformed vehicle run or Rima count does (`receive.js:704-720`; `releases.md:403-409`) — and that holds every write, attendance included. | Holds by construction: a different key, a different document. A damaged transport record cannot stop attendance from being recorded, and no transport byte can reach a pay sheet. |
| Phones on older builds (the three do not update together) | Every validator, the normaliser, the journal, the wire and `receive` need the new paths (probe: all refuse or drop today). Until EVERY phone has the build, the v166 rollout rule applies in full (`releases.md:279-289`): no restore of any kind across builds, no older window open beside a new one, and an older phone silently drops the layer from its copy. For Rima that was one integer per site. Here it is the whole plan. | An older phone has never heard of the keys or the documents and touches neither. No rollout rule. It simply does not have the screen. |
| Restore / backup | Travels with backups — which is the risk: a restore point or daily cloud copy written by an older phone restores a document with no transport data (`releases.md:353-361`). The daily copy is written by whichever phone opens first. | Not in the backup file, the restore points, the rescue file or the cloud copy (they carry named records only, `js/recovery.js:482-552`). A schedule restore leaves transport untouched, and the reverse. Cost: transport needs its own export if it must survive a lost phone before phase 3. |
| Document size | Plans WITH version history in the one Firestore document (1 MiB limit). A day's attendance for 14 men is roughly 1.3 KB; one accepted plan version is roughly 1–2 KB, and a day has several versions. The document's growth would more than double, with no pruning allowed inside a pay record. | Per-date records, pruned by date (proposal: 35 days). The schedule document does not grow by a byte. |
| Sync machinery | Reuses the hardest code in the repo (send claim, pre-send hold, receipts, contested writes, held rows in ⋯) — and every one of those needs a transport case and a test, as Rima's did through two reviews (`releases.md:291-341`). | Phase 1–2 need none. Phase 3 needs a small one of its own (§2.4) and a `firestore.rules` change. |
| `firestore.rules` | No change needed: nested paths are not restricted (`releases.md:274-275`). The rules also do not type-check them (`releases.md:410-411`). | Phase 3 needs a new `match` block: today everything outside `schedules` and `history` is denied (`firestore.rules:325-327`). Publishing is a MANUAL owner operation — the CI publish reports failure without the `FIREBASE_SERVICE_ACCOUNT` secret (`.github/workflows/rules.yml:93-103`). Rules go first, then the client. |
| Iron law 3 (never claim saved before a durable commit) | Inherited from `State.commit`. | Must be honoured by hand: `Store.setVerified`, and the screen says «לא נשמר» when it fails. |
| Iron law 4 (one field path per edit; whole-document writes only for restore) | Each move of a man is a path; a "suggest" rewrites many paths at once → `State.commitMany`, one journal batch, and the contested-write rules for each. | Law 4 is about the schedule document and is untouched. Drafts never leave the phone; phase 3 sends only ACCEPTED versions, each a create-only document (§2.4) — nothing is ever overwritten, so there is no whole-document overwrite to forbid. This reading of law 4 needs to be approved, not assumed. |
| Iron law 5 (three stamps) | Same for both: any phase adds files to `index.html` and `sw.js` SHELL, so the three stamps move in that commit. | same |
| Iron law 10 (nothing unreadable deleted, overwritten or treated as empty) | Inherited — at the price above: quarantine blocks ALL writes. | Own quarantine: copy to `farkadTransport:damaged:<n>`, read back, original kept, the transport screen read-only until the person is told — and `farkadWritesBlocked()` is NOT raised, so recording the day goes on. |
| Iron law 11 (no prompt/confirm/alert) | Same for both: `askText`/`askConfirm`/`askChoice`. | same |
| What goes wrong if it is wrong | A pay record. | A ride plan for one morning. |

### 2.2 Recommendation: (B), and leave the dormant vehicle-pay model exactly as it is

1. The owner's requirement is isolation, and (A) cannot give it: the existing model is payroll, and
   any day-record layer shares the day's validation and the document's restore.
2. The phones do not update together. (A) repeats the v166 rollout rule with a far larger payload.
   (B) has no cross-build hazard at all.
3. (B) lets phase 1 be local-only with zero sync risk, which is what is asked for.
4. A wrong transport plan must never be able to hold a pay record. Only (B) guarantees that.

Do not reuse the `vehicles` flag, the `vehicles` array, the `v_NN` ids or the «רכבים» crew panel.
The transport inventory is a separate list with its own ids (`tv_…`). If vehicle-owner pay is ever
revived, linking the two lists is a decision for then.

### 2.3 What needs the owner's explicit approval

| # | decision | why it is his |
|---|---|---|
| 1 | Every Hebrew string in §7 | law 6 |
| 2 | Separate store; transport is not in the backup file, restore points, rescue file or cloud copy | it is the trade for isolation |
| 3 | A per-phone switch in ⋯ that shows the transport entry on that phone only (phase 1) | today no setting reaches a feature gate (`schema.js:30-32`). The code gate `FARKAD_FLAGS.transport` stays a constant in a commit; the switch is a second, per-device condition on top of it |
| 4 | Where the entry sits (recommended: in the WhatsApp dialog, under «לכל עובד בנפרד» — no new button on the day screen, which he said has too many) | he decided the same for the seder (`js/ui/seder.js:36-37`) |
| 5 | A manual «סימנתי שנשלח» mark | the seder deliberately never says "sent" (`releases.md:27-28`). Here it would be a person's own statement, never the app's claim, and it stops being believed when the message changes |
| 6 | Keeping 35 days of plans and dropping older ones | pruning is deletion |
| 7 | Phase 3 at all (rules change, manual publish, rules first), and the reading of law 4 in §2.1 | cloud work |
| 8 | That deleting a worker or a site is never blocked by a transport plan naming him | isolation, in the other direction |

### 2.4 Phased build plan

**Phase 0 — judge the planner (now).** `transport-prototype.html`: synthetic data, in memory, no
storage. The owner answers the questions in §9 and corrects the wording in §7.

**Phase 1 — local-only, one phone, behind the flag. Zero sync risk.**
- `FARKAD_FLAGS.transport: false` in `FARKAD_SHIPPED_FLAGS`. While the work is unfinished the shipped
  value is false and only the suites turn it on (`FARKAD_FLAG_OVERRIDES`). Nothing unfinished is
  ever reachable in production.
- New files (classic scripts, global scope): `js/model/transport.js` (pure: the model, `suggest`,
  `validate`, signatures — the content of `transport-core.js` here), `js/ui/transport.js` (the
  screen, its words in one `TRANSPORT_TEXT` block). Loaded after `js/model/schema.js` and with the UI
  group; not part of the sync group, so nothing goes near `sync/boot.js`. Added to `index.html`,
  to `sw.js` SHELL and to the load order in `tests/harness.mjs`; the three stamps move.
- Storage: §3. No outbox entry, no `State.commit`, no change to `scheduleData:v2`, no write-fence
  tick (the keys are not in `FARKAD_SNAPSHOT_KEYS`, `js/recovery.js:546-553`).
- Reads the day record through the functions the seder reads it with (`workersAtPlace`,
  `entriesFor`, `State.layer`); writes nothing to it.
- Release, when complete: flag true, entry shown only on a phone where the switch of §2.3 #3 is on.

**Phase 2 — the drivers' messages.** The seder's pattern, reused: a real `<a href="https://wa.me/…">`
whose address is set before the finger lands, the 1.5 s one-tap-one-man guard, «נפתח בוואטסאפ» with
the message's fingerprint, resume after iOS kills the app, phone normalisation by `sederWaNumber`
(`js/ui/seder.js:172-185`, `:515-560`). Plus the manual mark of §2.3 #5.

**Phase 3 — other phones see the plan (only if question 8 says they must).**
- `firestore.rules`, published by hand BEFORE the client:
  `match /transport/{docId}` and `match /transport/{day}/versions/{n}` — `allowed()`; versions are
  create-only (`allow update, delete: if false`, the rule `history/{day}` already uses,
  `firestore.rules:319-322`); the config document is small and takes a `revision == resource.revision + 1` check.
- Drafts never sync. Accepting version n creates `transport/<date>/versions/<n>`. If another phone
  already created n, the create is refused; this phone is told, shows the other version, and its own
  becomes n+1 only when a person accepts it again. No merge, no timestamp comparison, no overwrite.
- A few methods in `js/sync/firebase-adapter.js` (still the only file that knows Firebase), reached
  after boot, failing soft. The schedule's listener, queue and receipts are not touched.
- Old phones: denied nothing, shown nothing.

**Phase 4 — by the answers:** the return ride, a drawn seat layout, each passenger's ride in his
seder message.

---

## 3. Data model (option B)

Ids are random (`newEntityId`), never contain `.` (`isSafeId`), and never reuse `v_NN`.

```
farkadTransport:enabled           "1" while the switch is on; absent = off

farkadTransport:settings          one record, through Store.setVerified (optional)
{
  version: 1, seeded: true,
  vehicles: [ { id: "tv_05", name, seats: 9, rows: [2,2,2,3], active: true } ],   // list order
  areas:    [ { id: "ta_9x…", name } ],                          // pickup areas, list order
  workers:  { "w_01": { area: "ta_9x…" | null,                   // keyed by the ROSTER's worker id
                        canDrive: true, drives: "all" | ["tv_02"] } }
}

farkadTransport:day:2026-11-10    one record per date
{
  version: 1,
  unavailable: { "tv_k3": true },                 // absent = available
  status:      { "w_07": "private" | "contractor" | "other" },
  trips:       { "tv_k3": { driver: "w_01" | null, passengers: ["w_02"],
                            area: "ta_9x" | null,           // pickup area; destinations are DERIVED
                            seats: { "w_02": 2 },           // optional; seat 1 is the driver
                            locked: false } },
  workerLocks: { "w_02": true },
  accepted: [ { n: 1, at: <ms>, complete: false, reason: "…", errors: 1, moved: null,
                sig: "<plan fingerprint>", attendance: { "w_02": "p_01" },
                trips: {…}, status: {…}, unavailable: {…} } ],     // append-only on this phone
  marks:    { "tv_k3": { sig, openedAt, sentAt } }                // the drivers' messages
}
```

Rules of the model:

- **Destination sites are never stored.** They are read from the day record at the moment of
  drawing: the sites of the trip's occupants. A man on two sites that day rides to the first one his
  day holds (the order `sederCrew` uses); the second is shown, not routed.
- **A worker and a site are referenced by the roster's id and nothing else is copied** — no name, no
  rate, no phone. A name is read from the roster when drawn. An id the roster no longer has is drawn
  as «עובד שנמחק» and is a validation error; it never blocks the deletion and never reinstates him.
- **An accepted version is a frozen copy** and is never edited. `attendanceSig` lets the screen say
  that the day record changed after the plan was accepted.
- **Writes**: `Store.setVerified(key, json, { optional: true })` — verified, and optional so a full
  disk can never spend a payroll restore point to make room (`js/store.js:161-163`). A refused
  write leaves the change in memory for the session and the screen says it was not kept.
- **Reads**: a record that will not parse is copied to `farkadTransport:damaged:<n>`, read back, the
  original left in place, and the transport screen is read-only until the person has been told.
  `farkadWritesBlocked()` is not raised.
- **Retention**: the 35 most recent dates; older day records are removed when a new date is first
  written (approval #6).

---

## 4. The suggestion algorithm

No AI, no randomness, no clock. The same input gives the same plan, byte for byte. It is
`suggest(ctx, day)` in `transport-core.js`, and the prototype runs that file's text verbatim.

Priorities, in the owner's order: pickup area → destination site → driver eligibility → capacity →
convenience → less unnecessary travel. It does NOT minimise the number of vehicles.

**Inputs.** Riders = workers with a site in the day record and no status. Vehicles = those not
marked unavailable. All lists are processed in their stored order (roster order, inventory order,
area order, site order); those orders are the only tie-breakers.

**Every choice is a comparison of tuples, left to right, and the last element is always a unique
index** — so two candidates never tie.

| step | what it does | choice rule (tuple, smaller wins) |
|---|---|---|
| 0 Keep | A locked vehicle is kept exactly as it is — driver, passengers, their order, seats — even if it is wrong (validation says so; suggest does not repair what a person froze). A locked worker keeps his vehicle and his role. Everything else is cleared. | — |
| 1 Drivers for kept vehicles | A kept vehicle with no driver (a locked passenger sits in it) gets an unplaced rider who may drive it. If nobody may, it stays without a driver. An ineligible man is never chosen. | `[other area?, other site?, roster index]` |
| 2 Open vehicles per pickup area | Area by area: while the area's unplaced riders exceed the free seats already open for it, open one more vehicle with a driver from that area. Stops when the area is covered or no (vehicle, driver) pair exists. | `[fit, driver's flexibility, −group size, roster index, inventory index]` where **fit** = the vehicle's seats if it seats everyone still uncovered, else `1000 − seats` (the smallest that fits, else the largest there is); **flexibility** = how many free vehicles this man may drive (the man who can drive only one car gets it); **group size** = riders of this area going to his site |
| 3 Passengers in their own area | Per area, by destination group, largest group first (then site order): seat the group in that area's vehicles, as many as fit, the rest into the next vehicle. | `[not already going to this site?, group does not fit whole?, number of destinations, −free seats, inventory index]` |
| 4 Leftovers | A man whose area had no driver or no seat takes a free seat in any vehicle that has a driver. Order: area, site, roster. | `[not going to his site?, 0, number of destinations, −free seats, inventory index]` |
| 5 A driver from a passenger seat | If men are still unseated and a vehicle stands free: an eligible man riding as an unlocked passenger is moved to drive it, and step 4 runs again. One vehicle per round, so it ends. | `[shares no site with the men left?, fit, roster index, inventory index]` |
| last | Passengers of every vehicle suggest filled are listed in roster order. | — |

Output: `{ trips, unseated[], log[] }`. `log` records each decision (step, vehicle, driver, how many
seated), so "why is he in that car" has an answer.

How the priorities map: pickup area = steps 2–3 work area by area. Destination = step 3's groups and
the first element of steps 3–4. Eligibility = a driver is only ever taken from the men who may drive
that vehicle. Capacity = seats are counted in every step and never exceeded. Convenience = whole
groups, fewer destinations per vehicle. Less travel = a vehicle is opened only when an area still
has uncovered riders; leftovers go to a car already going to their site.

Known limits, stated rather than hidden: it is greedy, not optimal; it knows no distances (areas
have no order of closeness — an answer to question 4 could add one); a locked vehicle with empty
seats is not filled (scenario 2c below); a man alone in his area who may drive opens a car for
himself.

### 4.1 Unit results (`node suggest.test.cjs`, 30/30)

Sample day: 14 workers, 13 with a site, one «רכב פרטי», one «נוסע עם קבלן אחר» → 11 riders.
`w1`,`w6`,`w11` may drive everything; `w4`,`w9` only `v1`,`v2`,`v6`. Notation: `vehicle=driver+[passengers]`.

| scenario | result |
|---|---|
| 0 Sample day | `v1=w4+[w1,w2,w3,w5] v2=w6+[w7,w8] v6=w9+[w10,w12]`. Nobody unseated; one warning (w12 rides from another area). Two runs byte-identical; input not mutated; suggest on its own output gives the same plan. |
| 1 Not enough seats — only `v1` (5 seats) goes out | `v1=w1+[w2,w3,w4,w5]`. Unseated, in roster order: `w6,w7,w8,w9,w10,w12`. Six `noSeat` errors; plan incomplete; capacity not exceeded. (Both area-1 drivers have one option, so the one whose site has more riders drives.) |
| 2 A locked vehicle — `v5=w1+[w3,w2,w12]` locked, seat 2 fixed for w3 | `v5` byte-identical, order and seat included. Around it: `v1=w4+[w5] v2=w6+[w7,w8] v6=w9+[w10]`. Nobody twice, nobody unseated. |
| 2b A locked worker — w10 locked as a passenger of `v7` | w10 still a passenger of `v7`; `v7` given an eligible driver (`v7=w1+[w9,w10]`). |
| 2c A lock that strands men — `v5=w6+[w1,w12,w9]` locked (the only area-2 and area-3 drivers frozen in it, 5 seats empty) | `v5` untouched; `w7,w10` reported unseated. Suggest does not fill a locked vehicle. |
| 3a No eligible driver — w12 locked into the 9-seater and nobody may drive it | `v5=?+[w12]`: no driver, never an ineligible one; nobody else put into it; validation `noDriver:v5`; plan incomplete. |
| 3b Nobody on the day may drive anything | No vehicle opened; all 11 riders reported unseated. |
| 3c A manual plan with a man driving a car not on his list | `driverNotEligible` error. |
| 4 Step 5 — only `v1` and `v3` go out | Both used, both with eligible drivers; 10 seats, 11 riders, exactly one unseated. |

---

## 5. Validation

Run live on every change (`validate(ctx, day)`). An error makes the plan incomplete; a warning never
does. An incomplete plan can be accepted only with a typed reason.

| code | level | rule |
|---|---|---|
| `noDriver` | error | a vehicle with anyone in it has exactly one driver — none is an error (two is impossible: one field) |
| `driverNotEligible` | error | the driver may drive this vehicle (`canDrive` and `drives`) |
| `overCapacity` | error | driver + passengers ≤ seats |
| `twice` | error | a worker is in at most one vehicle |
| `hasStatus` | error | a worker with a status (private / contractor / other) is not seated |
| `notWorking` | error | everyone seated has a site in the day record for that date — READ from the day record, never written |
| `vehicleUnavailable` | error | a vehicle marked unavailable carries nobody |
| `noSeat` | error | every rider has a seat |
| `badSeat` | error | a seat number is 2…seats, unique in the vehicle, and belongs to a passenger |
| `unknownWorker` / `unknownVehicle` | error | an id the roster or the inventory no longer has |
| `otherArea` | warning | a man rides in a vehicle whose pickup area is not his - only when both have an area |

Structural guards before any of that, as the app does everywhere: ids through `isSafeId` (no dots,
no `__proto__`), dates through `isRealDate`, maps without a prototype.

---

## 6. UI flow on a phone

Entry (approval #4): the WhatsApp dialog, under «לכל עובד בנפרד», opens the transport screen for the
date being viewed. Nothing new on the day screen.

One screen, four tabs, one filled button at most per screen:

1. **רכבים** — the inventory, one row each, one toggle «זמין היום / לא זמין היום». One tap per vehicle.
2. **עובדים** — the men with a site that day (read from the record). Per man: his site, his pickup
   area, a select «בהסעה שלנו / רכב פרטי / נוסע עם קבלן אחר / ממתין / אחר», and «רשאי לנהוג». In the
   app, eligibility and the pickup area are roster-like settings kept in `farkadTransport:config`;
   they are edited here, not on the crew page.
3. **שיבוץ** — the plan.
   - A status card: «טיוטה» / «גרסה N מאושרת» / «יש שינויים שלא אושרו מאז גרסה N», and seated/total.
   - «הצעת שיבוץ» (filled while the plan is empty) and «אישור התוכנית» (filled once there is a plan).
   - Errors and warnings, live.
   - «בלי מקום ברכב» — the men with no seat.
   - A card per available vehicle: occupancy, a lock, the pickup area, the destinations as site
     chips, the driver button (opens a list of ONLY the men who may drive that vehicle), the passengers.
   - Moving: tap a man → a bar at the bottom names him → tap «העברה לכאן» on the target vehicle.
     Two taps. The bar also carries his lock, «הוצאה מהרכב», and the optional seat.
   - Locks: a locked vehicle refuses every edit until unlocked; a locked man cannot be moved; suggest
     respects both.
   - «היסטוריית גרסאות» — every accepted version: time, complete or partial with its reason, how
     many men changed since the previous one, one line per vehicle.
4. **הודעות** — one card per driver of the LAST ACCEPTED version (never of a draft; a draft that
   differs is said on top). «הצגת ההודעה» shows the text; the green button opens WhatsApp; «סימנתי
   שנשלח» is the person's own mark. A mark is tied to the message text: when a later version changes
   that driver's message, the card says so and the mark is no longer believed.

Accepting: a complete plan asks once. An incomplete plan lists what is open and requires a typed
reason; without one nothing is accepted. Any edit after acceptance is a draft again; accepting it
makes version N+1. Versions are never edited or removed.

Floors, measured in the prototype and to be measured by the app's mobile suite: every target ≥ 44px
both ways, every field ≥ 16px, no horizontal scroll at 375px, bar heights from `js/ui/bars.js`,
safe area from `env()`.

One finding for the build: `isolate()` in `js/ui/dom.js:20-23` wraps a name in FSI…PDI (first-strong).
A vehicle name that begins with a Latin letter («BYD סיל U») then takes a left-to-right base and
comes out scrambled inside a Hebrew sentence. The prototype uses RLI…PDI for names. The app needs
the same for vehicle names, or names stored Hebrew-first.

---

## 7. Every Hebrew string — proposed, the owner corrects on sight

The owner gave blanket approval of professional wording on 2026-11-09. The strings as built,
with «ממתין» and the prototype's own lines removed and the list-editing, switch and store
lines added, are in one block at the top of `js/ui/transport.js`, pinned word for word in
`tests/transport.test.mjs`, and listed in full in `docs/releases.md` under v171. That table is
the one to correct; this document does not keep a second copy to go stale.

---

## 8. Test plan

Node suites, with `tests/harness.mjs` (flag turned on through `flags: { transport: true }`):

| suite | what it pins |
|---|---|
| `tests/transport.model.test.mjs` | The nine scenarios of §4.1 with their exact plans; determinism (two runs, same bytes); idempotence; input never mutated; a generated sweep (fixed seeds: random availability, statuses, eligibility, locks) asserting on every result — nobody twice, capacity never exceeded, every driver eligible, locked vehicles byte-identical, locked workers in place, `unseated` equals the `noSeat` errors. Every validation code, one at a time. |
| `tests/transport.isolation.test.mjs` | After every transport action: `scheduleData:v2` bytes, the outbox, `cloud.writes`, the write tick and `payrollReport`/`invoiceReport` are unchanged. The backup file, restore points, the rescue file and the daily cloud copy contain no transport key. Every restore door leaves the transport keys as they were. Deleting a worker or a site is not blocked by a plan naming him, and nothing reinstates him. Flag off: no entry drawn, no key written, no function reachable. The retired `vehicles` suite still passes unchanged. |
| `tests/transport.store.test.mjs` | A write the disk refused is not called saved. A full disk: the optional write never deletes a restore point. A record that will not parse: copied, original kept, transport read-only, `farkadWritesBlocked()` false and a day edit still commits. Retention drops only dates beyond the limit. Poisoned ids (`__proto__`) through every reader. |
| `tests/transport.text.test.mjs` | Every string of §7 word for word, and the block's keys. Each driver's message for a pinned plan. Phone numbers through `sederWaNumber`. The mark's fingerprint: a changed message is no longer "opened" or "sent". |
| `tests/build.test.mjs` (existing) | The new files in the shell; the three stamps. |

One browser suite, `tests/transport.browser.mjs` (Chromium, self-served, in `npm run test:all`): the
flow of `verify-prototype.cjs` against the real app — availability, statuses, suggest, move, driver
list offering only eligible men, locks respected, accept refused without a reason, version 2 after
an edit, the message, the green link being a real `<a href="https://wa.me/…">` that a tap follows
(route intercepted, as `tests/seder.browser.mjs` does), one tap one driver, a reload mid-run, the
manual mark; at 320/375/440, both schemes, 2x text: 44px both ways, 16px fields, no overflow, the
bars measured.

Phase 3 adds: cases in `tests/rules.test.mjs` (create-only versions, no update, no delete, not
readable by a stranger, the schedule rules unchanged) and one emulator suite for two phones accepting
the same version number.

Not coverable by any suite here, and to be said in the release notes: the hand-off from the
home-screen app to WhatsApp on a real iPhone.

---

## 9. The questions that were open — answered 2026-11-09

All eight are answered; the answers and what the build did with each are the table in §0.
Still open, for the step that brings the other phones in (phase 3): whether the vehicle list,
the areas and who may drive become one shared record, and what a phone that already has its
own does when it first sees the shared one.

---

## 10. The prototype, and what was verified

`transport-prototype.html`: one file, no external request, no storage, synthetic data, the banner
«אב-טיפוס · נתוני דוגמה». It starts with `<title>`, then `<style>`, markup, `<script>` — no
doctype/html/head/body. Colours are custom properties on `:root` (dark), with the light set under
`@media (prefers-color-scheme: light){:root:not([data-theme="dark"])}` and `:root[data-theme="light"]`.
Built by `build.mjs` from `prototype.template.html` + `transport-core.js` + `transport-sample.js` +
`transport-text.js`.

`node verify-prototype.cjs` — Chromium, the file wrapped in a minimal skeleton, 440×956 and 375×667,
dark and light, touch taps: **420/420** (log: `verify-prototype.log`). Per combination it drives
availability → statuses → suggest (the pinned plan) → move a man → seat → driver dialog (only the
eligible offered; Escape returns focus) → set driver → lock a vehicle and a man → suggest respects
both → make it incomplete → accept refused without a reason → version 1 partial → edit → version 2 →
driver message → the green button does not navigate → «סימנתי שנשלח» → version 3 changes that
message and the mark is no longer believed. On every screen and dialog it asserts: no horizontal
overflow, every target ≥ 44px in both dimensions, fields ≥ 16px, at most one filled button, no emoji,
text contrast ≥ 7:1 in dark (measured minimum 7.13) and ≥ 4.5:1 in light (measured minimum 6.7 — the
white-on-#1d4ed8 button, as specified). And: no console error, no request other than the file, no
native dialog.

Not verified: any real phone (iOS Safari, the home-screen app, a Galaxy); a screen reader; text
scaled to 200%; 320px width; the real WhatsApp hand-off (the prototype deliberately has none); the
real roster, sites, areas and vehicles; anything in §2–§3, which is design and not code.
