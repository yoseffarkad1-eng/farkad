# פרקד — the working brief

Read this before changing anything. Every comment in this codebase names the failure
the code below it prevents; this file is the same habit at repository scale. The deeper
walk is in `docs/architecture.md`; the test suites are described in `tests/README.md`;
what has actually been served, and what each build is known NOT to cover, is in
`docs/releases.md`.

## What this is

A Hebrew, RTL, offline-first PWA that records who worked at which construction site,
and produces the pay sheet and the client invoice from that record. Three people share
one record across three phones, on building sites with unreliable signal, and the
phones do not update together. It is not a shift planner — the seder goes out on
WhatsApp; the app records what HAPPENED. Every number in it is somebody's pay, so the
failure that matters is never a crash: it is a record that quietly says something
different from what was done.

## The architecture, one screen

- **Classic scripts, one global scope, no build step.** `index.html` loads every script
  with a plain `<script src>` tag and every button is an inline `onclick` resolved on
  the global scope. Turning any of them into `type="module"` breaks every button
  silently — no error, the taps just stop working. The one exception is
  `js/sync/firebase-adapter.js` (the SDK ships only as modules); it is imported at
  runtime by `app.js` AFTER local boot and reaches the app through `window.FarkadSync`.
- **Script order is load-bearing.** `store.js` and `recovery.js` must precede the sync
  group; that group ends with `sync/boot.js`, which reads the outbox the moment it loads,
  so every file the read reaches has to be above it; `model/schema.js` must
  precede `state.js`, which calls `emptySchedule()` at definition time; the UI files
  come after the data layer. The order in `index.html` is the order.
- **Nothing off this origin sits between a person and their data.** The Firebase SDK is
  fetched after boot, never before the first render, and fails soft. SheetJS is not
  fetched at all any more: `vendor/xlsx-0.18.5.min.js` is in the service worker's shell,
  so the export works in a tunnel. Reaching the CSV fallback now means the build on that
  phone is incomplete, not that the signal is weak, and it says so.
- **Three stylesheets, and the order is the mechanism.** `css/app.css`, then
  `css/readability.css` (the owner's reading sizes, v140), then `css/design.css` (v169: the
  palette, the four button looks, rows instead of boxes). The last is a layer over the first
  two and every rule in it is `@media screen` - paper is not its business. A new look goes in
  the layer; a new mechanism goes where the mechanism lives.
- **The service worker (`sw.js`) serves everything cache-first**, the page included:
  a session runs one build, end to end. Data lives in `localStorage`, always through
  `Store`; sync is optional and off until `js/sync/firebase-config.js` is filled in.

## The iron laws

1. **The ledger is append-only.** Yosef authorized enabling repayment and correction
   on 2026-10-02. v116 was published on 2026-10-02 after owner-supplied rules/protocol evidence.
   The owner currently has two active phones. Both must update before new financial use. The boot-time mirror in `state.js` is the ONE sanctioned
   write; ledger entries are never edited, never deleted, and merged by union.
   `carryAdvances` in `js/model/schema.js` moves with it, in the same commit and the
   same direction - one gate open without the other ships a lie - and
   `tests/data.test.mjs` pins the pair.
   **And so is the pay book (v187, dormant until a record is turned on).** `schedule.pay`
   is one entry per id, created once, never rewritten, never removed, merged by union;
   two different bodies under one id are BOTH kept - the cloud's standing, the other
   under `payConflicted` - never chosen between. A pay entry is written by ONE door,
   `FarkadSync.transactPaybook`, never by the ordinary queue.
2. **Days keep the rate they were worked at.** Rates are stamped onto the day record
   at first write and survive every later edit; reports price each day at its stamp.
   Never restate a stamped day, and never stamp old days retroactively —
   `planRateStamping` reports what that would do and deliberately does not do it.
3. **Never claim saved before a durable commit.** Every edit goes journal-first, then
   schedule, both written through `Store.setVerified` (write, read back, believe).
   A commit with nowhere durable to live rolls memory back and says so out loud.
4. **No ordinary edit sends the whole document.** One field path per edit
   (`days.<date>.<layer>.<worker>`); the server document is adopted, never
   timestamp-compared; whole-document writes exist only for the explicit restore
   transaction. Bulk edits go through `State.commitMany`, never a bare `save()`.
5. **The three build stamps move together**, in the same commit as any change to a
   cached file: the `farkad-build` meta in `index.html`, `APP_VERSION` in `js/app.js`,
   and `VERSION` in `sw.js`. `tests/build.test.mjs` fails if they disagree.
6. **Hebrew strings are product decisions, not copy.** Many are pinned verbatim by
   tests; all of them were argued over. Changing one is a behavior change and the
   pinned string moves with it, deliberately, in the same commit.
7. **A session runs one build, end to end — and so does every OTHER window.**
   `clients.claim()` takes over every window of the origin, so `sw.js` serves a window
   it did not itself hand a page to from THAT window's build, keeps that build's cache
   while it is open, and the page reloads itself at the first moment nobody is typing.
   A build already on somebody's phone cannot be given new code, so the catch-up half
   only holds from v87 forward; `tests/handover.test.mjs` measures the rest against two
   real trees.
8. **Safe-area via `env()`, never a hardcoded inset** — and the bar heights are
   MEASURED (`js/ui/bars.js`) and published as custom properties, never written into
   the stylesheet as numbers.
9. **44px touch targets and 16px inputs are floors, not tastes.** Below 16px iOS zooms
   the page on focus; below 44px in EITHER dimension a finger misses. The mobile suite
   measures both.
10. **Nothing unreadable is ever deleted, overwritten, or treated as empty.**
    `Recovery` quarantines a copy, keeps the original, and blocks writes until the
    person is told. A record that will not parse is still the only record of work.
11. **No `prompt`/`confirm`/`alert`, ever** — they are silently ignored in embedded
    frames. Use `askText`/`askConfirm`/`askTell` from `js/ui/ask.js`.
12. **`window.print()` is never called bare.** On the home-screen app on an iPhone it
    opens nothing and says nothing. `printWithFallback` in `js/ui/printout.js` makes
    the call, listens for the sheet, and offers the table as a picture when none came;
    the picture is drawn off the DOM, never off the schedule, so it shows what the
    screen shows.

## Running it, and what green means

No build, no install: `python3 -m http.server` serves the app. For the tests:

    npm ci
    npm test                # the node suites; no browser, runs in a few minutes
    npm run test:all        # adds smoke, print, mobile, update, forms, recovery-browser,
                            #   handover, swrestart, swidentity
    npm run test:release    # the gate: test:all plus sendclaim and the emulator suites
    npm run test:emulator   # rules, the bootstrap's own rules, the production adapter's
                            #   CAS, the rollout, the cutover and two phones writing
                            #   money at once (needs Java)

Node 20 or 22 (`engines` says `>=20.11 <23`). NO COUNT IS WRITTEN HERE, deliberately. A
count belongs to a commit and to nothing else, and one left in a file goes stale the
moment the next suite lands - at which point it is worse than no count, because it reads
as a fact, and the paragraph below already says so about counts carried between commits.
Run the gate on the commit you are asking about, from one clean detached worktree, and
say which commit you ran it on. Anything less than every check passing is a stop, not a
warning. `npm test`
and `npm run test:release` are different gates and are reported separately; neither is
wrapped in anything that turns a nonzero exit into a success. A count carried over from
another commit is worse than no count: re-measure, or say you did not.

The browser suites need Playwright's Chromium once (`npm run browsers`), or point
`CHROME_PATH` at a browser that is already installed — see `tests/README.md` before
downloading anything. The emulator suites need Java and run through
`firebase emulators:exec`; they never touch the real project.

Financial suites cover both enabled operation and explicit legacy-client fixtures
with both financial gates closed. The v116 release candidate enables the financial
pair by owner request; deployment remains held until cloud rules and device readiness
are verified. Vehicles stay off. v119 enables owner-requested deletion of unused workers: shared names require completed protocol sync, work and financial history block deletion, and late work reinstates the identity as inactive. v120 permits canonical empty day placeholders to be removed in the same journal and cloud transaction as an unused worker. v166 adds the Rima count, `days.<date>.rima.<placeId>`: another company's men, counted per site, never named and never in pay, but billed to the client as one worker-site day each (owner's ruling, 2026-11-01); v145/v165 phones drop it from their own copy, so a whole-document restore must not be run from one of them (docs/releases.md, v166). THE ROLLOUT RULE there: every phone on v166 before the first Rima count is typed; until then no rescue file, backup, restore point or cloud copy is restored across builds, in either direction, no window of an older build stays open beside a v166 one, and client invoices come only from an updated phone. v167 adds the seder to each worker (js/ui/seder.js), entered from the WhatsApp dialog and from nowhere on the day screen: the men with a site that day, each opened in WhatsApp with his own message by the person's own tap - never sent by the app, and never marked "sent". It writes nothing to the record; its progress is a per-date preference in Store. Its Hebrew words are the owner's, approved 2026-11-07 and pinned word for word in tests/seder.test.mjs (docs/releases.md, v167). v169 is the one look (css/design.css, js/ui/icons.js): a restyle that moves no control, changes no label and touches no data path (docs/releases.md, v169). v171 adds הסעות (js/model/transport.js, js/ui/transport.js): who rides to work in which vehicle and a message to each driver, on a phone that turned it on in ⋯ and on no other - its own Store keys (farkadTransport:…), never the record, the outbox, the cloud, a backup or the rescue file, so a lost phone loses the plans; it reads the day through the seder's own list and never writes it; its Hebrew is proposed, not approved word by word, and pinned in tests/transport.test.mjs (docs/releases.md, v171; docs/transport-spec.md). It is not the retired vehicles feature and shares nothing with it. v174 rebuilds the הסעות screen as a picture, because the owner tried v171's four-tab planner and sent it back (2026-11-10: draw the car from above, write "add worker" on every seat, let him drag the men): ONE screen - a sticky tray of the men with a site and no seat, each vehicle drawn from above with the driver's seat on the LEFT (its own `dir="ltr"`; RTL must not mirror a car), seats as tiles in their real rows; a man is seated by a finger's drag (Pointer Events, never the HTML5 drag API; a waiting man lifts at once, a SEATED man only after a 300ms hold so that a swipe on a filled car scrolls and moves nobody), by touching him and then the seat, or by touching the seat and choosing; whoever is in seat 1 is the driver; every change is kept at once. Pickup areas, "may drive", suggest, locks, accept, versions and «סימנתי שנשלח» are REMOVED. A day written by v171/v172 opens as it is and is rewritten only by its first change, which drops its versions, locks, areas and «sent» marks; the store, the switch, the one entry and the isolation from the record are v171's, unchanged. Its Hebrew is proposed and pinned in tests/transport.test.mjs. THE DRAG HAS NEVER BEEN TRIED ON A REAL PHONE - only with emulated touch in Chromium (docs/releases.md, v174). v179 adds the summary of the day to that screen, because the owner asked whether there is a report for the cars (2026-11-10): ONE button, «סיכום הסעות ליום», opens the app's own dialog with every vehicle that goes out, its driver (seat 1) and its men in the order of their seats, then the men still waiting, the empty vehicles and the ones kept home; it leaves as text by the day message's own two doors (shareTextOut/copyTextOut in js/ui/share.js - the share sheet or wa.me with no number, and the copy) or as a picture by the printout's (sharePrintout('transport'), read off the dialog's field). It is a READING: it writes no key anywhere, marks nothing, and never says «נשלח»; a vehicle is always named after a Hebrew word, inside its right-to-left isolate. Its Hebrew is proposed and pinned in tests/transport.test.mjs; not tried on a real phone (docs/releases.md, v179). v184 adds «בניית סידור» (js/ui/journey.js): the seder as ONE journey of five stations - the day screen on tomorrow's date with the journey's row inside the day's own dock, the day's check, the הסעות screen (skipped, never turned on, on a phone that has it off), a read-only last look, and sending where HE chooses and the drivers come first - a frame around the existing screens that builds no second editor and writes the record by no new code; its place is a per-phone preference (farkadSederJourney), forgotten after three hours; one entry, in the WhatsApp dialog. It adds «כרטיס עובד» (js/ui/workercard.js): one man on one screen from his crew row, every figure the pay sheet's own cell or the ledger's own fold, nothing written, the carry gate asked once per reading. And a lasting switch per vehicle in «רכבים» (`off: '<date>'` in farkadTransport:settings; turning it writes the list and no day). All Hebrew proposed and pinned; none of it tried on a real phone (docs/releases.md, v184). v182 adds two readings that write nothing: «בדיקת היום» (js/ui/daycheck.js) - one button at the foot of the day's list, what the day may be missing against the previous working day the record holds, names that open the sheet they already open, and two globals for other screens (dayCheckFindings, renderDayCheckInto); and the vehicles' report of a period on the הסעות screen («דוח הסעות לתקופה»: four ranges, per vehicle and per driver, what this phone did not keep SAID - the store keeps 35 days). Both sets of Hebrew are proposed and pinned (tests/daycheck.test.mjs, tests/transport.test.mjs; docs/releases.md, v182). v181 is polish with no number and no data path moved: a man who owes nothing reads quieter on the advances page, empty screens show one sentence and the existing button instead of tools over nothing, each colour block of the week carries the site's first letter on a phone (an attribute drawn by css/design.css - never on paper), and the backup row in ⋯ says its age while shut and, after 14 days without a file, one quiet line (it reads scheduleData:lastBackup, no new key); two proposed sentences, pinned in tests/polish.test.mjs (docs/releases.md, v181). v172 puts the ⋯ sheet in strict order: three sections of three cards, every card but ענן וסנכרון a row (`<details>`) that opens in place, גיבוי open and the rest shut at every opening, a row opening by itself only for the reasons listed in settingsFoldReasons (js/ui/settings.js) and never shut or opened by a redraw; no control, word or handler changed, and nothing about it is stored (docs/releases.md, v172). v180 repairs the two faults the second calculator found (tests/oracle.test.mjs), on a separate branch and NOT SERVED until the owner has seen it: (1) money a man gave back beyond what he owed STAYS HIS CREDIT until it is used - it comes off whatever advance he takes next, however many periods later, as its own figure (`creditIn`/`creditForward` beside a debt that is zero or more; never a negative balance, never wages, never dropped at a boundary), where v179 carried a negative balance across exactly one boundary and froze `carriedIn: -500` onto a payslip; the other ruling (no credit, the excess only flagged) is the one line OVERPAYMENT_STAYS_CREDIT in js/model/schema.js; an over-settled advance still stops the automatic deduction and refuses a close exactly as before (tests/wording.test.mjs), and whether a used-up credit should lift that is the owner's and undecided; (2) the wage of an account is rounded to the agora ONCE, in advanceWalk, so a close can no longer take 630.63 off a recorded 630.625 and be refused by its own judge - and a closure v179 already wrote that way is never rewritten: the judge reads its wage to the agora, and a copy a phone already held aside is taken back if, and only if, it is exactly that shape and taking it back condemns nothing. Two phrases are new and PROPOSED, «יתרת זכות» and «יתרת זכות מחשבון קודם», pinned in tests/overpayment.test.mjs. THE ROLLOUT RULE: every phone on v180 before the next account is closed - a v179 phone and a v180 phone closing the same account write different bytes under one id (docs/releases.md, v180). v183 adds «עובדי יוסף גבס», `days.<date>.yosefGeves.<placeId>`: a SECOND count per site, typed beside רימא on every site card, stored, journalled, synced, held and cleared exactly as the Rima count is - and IN NO ARITHMETIC AT ALL: not in pay, and not on the client's invoice either (the difference from Rima; the owner, 2026-11-10: "outside any account ... a list of their own without touching any other list"). js/model/money.js and js/model/ledger.js must never name the layer; its own table at the end of «לפי אתר» and its own last sheet of the full workbook, never a column in anybody else's. It IS printed and it IS in the shared picture - the owner again, 2026-11-10: "in print too, but as a separate list that does not enter any other list's account" - as a table of its own, last, with its note, and no figure of any other table moves on paper or in the picture for it; it is not in the one-client file. Every build before v183 - v166 to v180 included - drops the layer from its own copy and erases it by a whole-document restore, so THE ROLLOUT RULE is v166's, for this count: every phone on v183 before the first one is typed (the owner approved publishing on 2026-11-10, told this rule); until then nothing is restored across builds, in either direction, and no window of an older build stays open beside a v183 one. The list's name is the owner's; every other word of it is proposed and pinned in tests/yosefgeves.test.mjs (docs/releases.md, v183). v185 carries the SHARED rides and shipped them SHUT; v186 OPENS the gate (js/ui/transport-share.js, TRANSPORT_SHARE = true - the one line of the app v186 changes; the shut path stays measured through the test seam): the owner asked for הסעות on the other accounts and chose one shared plan (2026-11-10). With the gate open the list of vehicles and each day's plan are documents OF THEIR OWN, schedules/<doc>/transport/settings and …/day_<date> - never a byte of the schedule document, never its outbox, journal, receipts or status sentence - written whole at exactly the next revision (adapter transaction + rules), so of two phones one lands and the loser is shown the plan that won, told in one sentence, its own copy put aside first; the switch stays per phone; a driver's «נפתח» mark, the backup and the rescue file are as before. js/ui/transport.js reaches it only through transportShareTell, at five marked places. A phone shares only with this build, its switch on AND a cloud account; a phone with the switch off makes no call to those documents. THE RULES ARE PASTED BY THE OWNER BY HAND (.github/workflows/rules.yml would publish firestore.rules from main, but its secret is not set and v186 does not touch the file): under the rules of before a phone says «עדיין לא משותף», keeps its plans, asks again by itself and starts sharing with no reload when they appear. The owner's phone takes v186 first - the first phone with an edited list or a planned day is the author, a phone that had its own is told once with «להשתמש בשלי», an untouched list of seven is never uploaded - and no v183-or-older window may run on a sharing phone (docs/releases.md, v186 and v185; docs/transport-spec.md, Phase 3). Its Hebrew is proposed and pinned in tests/transport.test.mjs. v187 (CANDIDATE - NOT SERVED: it waits for the owner's decisions 71, 75 and 76 and his explicit approval) carries the PAY BOOK, dormant: worker accounts, closure and payment as append-only entries under `schedule.pay` (js/model/payroll.js), each written by one server transaction that also creates a create-once document under `closed/` (js/sync/transact.js) - «closed» means it committed and was read back. `paybook`, `months` and `cold` ship FALSE and are not how it is turned on. It is turned on for ONE RECORD, by a person, from ⋯ → «פנקס שכר - הכנה והפעלה»: a screen of dry runs that writes nothing, one button, and the opening `pay.po_open`, which only the new rules accept (the app asks which rules are live by reading probe/paybook-8); `paybookOn(schedule)` in js/model/schema.js is the one reader of the three flags and every gate hands it the record. `paybookActivation: true` offers that step and honours that entry - false is the way back, safe only until the first closure, payment or answer about an old closure (the point of no return). UNTIL SOMEBODY PRESSES IT THE BUILD IS v186 PLUS THAT ONE ROW IN ⋯. On a record that is on: the «מקדמות» tab is the accounts home (js/ui/accounts.js, which computes no money); an advance from a period nobody closed stays a full debt until a person deducts it (the owner's one-debt ruling, 2026-11-10; `advanceDebtStays(schedule)`); a closure or payment needs signal; a settled closure leaves the server's document for its closed copy 14 days on (js/sync/closed.js); a month closed and paid for everybody may be moved out six months on, by a person, and its days can then no longer be edited (js/model/months.js, js/sync/months.js); the phone keeps what left in IndexedDB (js/cold.js); and THE RULES REFUSE EVERY WRITE BELOW PROTOCOL 2, so a phone that has not updated can record nothing - it keeps its work and shows a sync error - while its shared ride plans, documents of their own, still go through (measured, tests/activation.emulator.test.mjs, R). firestore.rules is main's file at v186 plus 380 lines, none removed or changed; docs/firestore.rules.before-paybook is the file believed live today (the owner reported pasting it on 2026-11-10; not read off the console). THE ORDER IS docs/payroll-activation.md AND NOTHING IN IT HAS BEEN DONE: merging this commit starts .github/workflows/rules.yml, which is red and publishes nothing while its secret is unset - then the owner pastes the file by hand; the new rules may go live before or after this build reaches a phone (measured both ways) and MUST be live before the button, which asks and is refused otherwise; every phone updates before the button; the new rules are never rolled back once a record is on. `npm run test:gate-open` (in no gate) runs every suite with the three flags open against a hand-kept list. Its Hebrew is proposed, in one block, pinned in tests/accounts.test.mjs. Never tried on a real phone or a real record; settling a pay-book disagreement (decision 49) is designed and not built (docs/releases.md, v187; docs/payroll-closure.md). Test-only overrides are
provided before scripts load, never defined by the production shell.

## The culture

A behavior with a passing test IS the spec. The suites pin exact strings, exact
arithmetic, and exact rectangles; when your change makes a test fail, the first
question is whether the test is describing a guarantee you are about to break. Update
a pinned expectation only when the behavior change is the point, in the same commit,
with the reason in the message. New invariants ship with the test that would have
caught their absence — most of `tests/data.test.mjs` is a bug that happened once,
written down so it cannot happen twice.

## The files

    js/app.js                  boot, view switching, one render(); APP_VERSION; crash banner; imports the adapter after boot
    js/dates.js                local calendar; never toISOString for a day; the Friday-anchored 14-day account
    js/store.js                every localStorage touch; setVerified reads back; full ≠ blocked; the reclaim ladder; the write tick
    js/recovery.js             quarantine for unreadable records; never deletes; blocks writes until acknowledged; what the rescue file carries
    js/state.js                the one live schedule; journal-first commits; save vs persist; the ledger mirror at boot
    js/model/schema.js         the v2 model, validators, field paths; pure functions
    js/model/money.js          what a day was worth: payroll, invoice, the advances walk, the closed period
    js/model/migrate.js        v1→v2; never guesses; ambiguous cells become decisions, not data
    js/model/transport.js      הסעות, the pure half (v174: the picture): the rows of a vehicle with the driver on
                               the left, the one reading of a stored plan (layout), and the rules of a seat -
                               first free seat, swap, seat 1 is the driver; no DOM, no storage, no clock.
                               v171's suggest/areas/may-drive/locks are gone. NOT the retired vehicles model
    js/model/ledger.js         the v80 advances ledger: entries, fold, closed gate, mirror migration, parity check;
                               the repayment and period-closure kinds, both behind the writer gate
    js/sync/sync.js            the durable queue: outbox, journal, replay, receipts, provenance; the one accessor pair
    js/sync/restore.js         the whole-document restore, the ONE place allowed to write the whole document
    js/sync/receive.js         snapshot adoption, merge, the ordering protocol's client half, the poison doors
    js/sync/send.js            the flush, the send claim, the pre-send hold, the create race, the retry ladder
    js/sync/status.js          connect and listen; the one sentence the person reads; the banner
    js/sync/boot.js            two lines that RUN at load; loaded last, and every later split goes above it
    js/sync/firebase-adapter.js  the only file that knows Firebase exists; the one ES module
    js/sync/firebase-config.js   project config; empty means local-only
    js/ui/dom.js               el()/clear()/button(); textContent only — names are never markup; todayStr
    js/ui/icons.js             v169: the stroke glyph beside a button whose label starts with an emoji; the emoji
                               stays in the label and in the accessible name, clipped - no string changes
    js/ui/bars.js              measures the fixed bars and the keyboard; publishes --nav-h, --day-actions-h, --topbar-h, --kb-h;
                               the stuck iPhone frame (v167): --bar-drop, --frame-drop, --header-drop
    js/ui/ask.js               askText/askConfirm/askTell/askChoice — the app's own dialogs
    js/ui/undo.js              one step back; the undo button holds the last step until the day is left
    js/ui/modal.js             keyboard behavior for every dialog: Escape, focus trap, focus return
    js/ui/sitecolor.js         a fixed color per site, never reassigned
    js/ui/day.js               draws the day screen — the read half
    js/ui/sheet.js             the assign sheet, the pickers, copy-a-day — the write half
    js/ui/quickstart.js        paste a list, get a roster
    js/ui/week.js              the read-only week grid and its print layout
    js/ui/roster.js            workers and sites; archive vs delete; the reorder mode
    js/ui/reports.js           pay and invoice reports; the advance form
    js/ui/share.js             the WhatsApp message and the CSV; shareTextOut/copyTextOut, the two doors any
                               composed text leaves by (the day's message, and since v179 the rides' summary)
    js/ui/seder.js             the seder to each worker (v167): the men with a site that day, each one's own
                               message, opened in WhatsApp one tap at a time; what was opened is kept per
                               date in Store (farkadSederProgress) - never the record, never synced, never in
                               a backup; every Hebrew word of it in one block, approved by the owner
                               on 2026-11-07 and pinned word for word in tests/seder.test.mjs
    js/ui/journey.js           v184: «בניית סידור» - five stations framed around the day screen, the check, הסעות,
                               a last look and the sending; hooks in app.js render()/bootOnce() and at the end of
                               renderTransport/closeTransport; one Store preference, nothing else written
    js/ui/workercard.js        v184: «כרטיס עובד» - a reading of one man through the pay sheet's and the ledger's own
                               functions; no money of its own, no key written
    js/ui/daycheck.js          v182: «בדיקת היום» - pure rules over the record (dayCheckRead), the two globals other
                               screens embed, the dialog; reads only, writes no key; every Hebrew word in one block
    js/ui/transport.js         הסעות, the screen and its store: off until this phone turns it on in ⋯; one
                               entry in the WhatsApp dialog; reads the day through sederCrew and never
                               writes it; keeps its plans and vehicles under farkadTransport:* through
                               Store - never the record, never synced, never in a backup. v174: ONE screen,
                               the cars drawn from above; "carrying a man" is the drag (pointer events, the
                               hold on a seated man, the tray slid by hand, the edge scroll); every Hebrew
                               word of it in one block (proposed, the owner corrects). v179: the summary
                               of the day - a pure builder, a dialog, and the reader and planner of its
                               picture; it writes nothing
    js/ui/transport-share.js   v185, OPEN since v186: הסעות shared - the gate (TRANSPORT_SHARE), what this phone knows of each
                               shared document (farkadTransport:shared:*), the copy that lost (…:aside:*),
                               take/adopt/flush, the one line and the notices; never names the record's sync
    js/model/payroll.js        v187, DORMANT: the pay book as a pure model - the `pay.<id>` records, their folds,
                               the dry-run planners (planClosure, planOpening, planActivation, planArchive),
                               paybookUnion (who stands when two documents disagree); no DOM, no Store, no clock
    js/model/months.js         v187, DORMANT: closed months of days leaving the live document - eligibility and
                               the dry run (planMonths), the month document and its digest, what a restore keeps
    js/sync/transact.js        v187, DORMANT: a closure, a payment or the opening as ONE server transaction with
                               its create-once closed document - never the queue; the durable intent; a lost
                               answer settled by reading the receipt, never by sending again; activationRefusal
    js/sync/closed.js          v187, DORMANT: a settled closure leaving the live document - copy, read back,
                               compare, drop; the gate in receive() that lays archived entries back or does
                               NOT adopt; the strip on a whole-document write
    js/sync/months.js          v187, DORMANT: the move of one month, and retiring a held edit of an archived day
    js/cold.js                 v187, DORMANT: the phone's cold store - what left the live document moves from
                               localStorage to IndexedDB (copy, read back, compare, mark, then drop); a unit
                               that cannot be produced is MISSING, never empty; no database opened while shut
    js/ui/accounts.js          v187: the row in ⋯ and the activation screen (all a person sees until a record is
                               on); then the accounts home on the «מקדמות» tab, the review page, payments,
                               history, the two archive pages. Computes no money; writes only through
                               FarkadSync.transactPaybook; every word in one block (ACC_TEXT, proposed)
    js/ui/backup.js            snapshots, the backup file, the four restore doors, the rescue file
    js/ui/printout.js          the table as a PNG, read off the DOM, for the phone where window.print()
                               opens nothing: the 1.5s heuristic, the share sheet, the download; v179: a
                               third kind, 'transport', read and planned by js/ui/transport.js
    js/ui/migration.js         the cells the migration refused to guess, put to a person
    js/ui/offline.js           SW registration, the update banner, midEdit(), checkForUpdate(); the other window's catch-up
    js/ui/install.js           the add-to-home-screen warning (iOS evicts browser-tab storage)
    js/ui/settings.js          the ⋯ panel: sync, backup, restores, version, device state, ledger parity;
                               v172: the rows - what is open when the sheet opens (the same every time),
                               every reason a row opens by itself, and the Tab trap that asks the tree
    tests/runner.mjs           suite/check/same/given/report; given prints its detail too
    tests/harness.mjs          devices in Node: V8 contexts, a faithful fake localStorage and Firestore
    tests/build.test.mjs       the three stamps agree; the shell is complete; caches never cross builds
    tests/data.test.mjs        storage, sync, and the money arithmetic — the big one
    tests/smoke.mjs            the app in real Chromium, self-served
    tests/mobile.test.mjs      layout facts at four widths, both orientations, both schemes, 2x text
    tests/print.test.mjs       print isolation, proved against a real PDF (tests/pdf.mjs reads it)
    tests/update.test.mjs      a real deploy against a real service worker
    tests/recovery.test.mjs    quarantine, the raw snapshot, and the export of last resort
    tests/adversarial.test.mjs the twenty-item correctness matrix
    tests/probes.test.mjs      two tabs of one app on one disk, interleaved at the write
    tests/capacity.test.mjs    a season of days on a disk that fills up
    tests/concurrency.test.mjs C1-C5: the cross-tab hazards, one at a time
    tests/exports.test.mjs     the three files that leave the phone, read back
    tests/fence.test.mjs       the write counter: what moves it, and what it costs
    tests/method.test.mjs      how an advance was handed over, through all four doors
    tests/money.test.mjs       the same shekels on the far side of four real doors
    tests/nonassertions.test.mjs a test that fails when a test stops testing
    tests/restore.test.mjs     a device holding only part of a restore is caught
    tests/upgrade.test.mjs     a v86 disk opened by this build
    tests/vehicles.test.mjs    the retired feature, from both sides of its flag
    tests/xlsx.test.mjs        the arithmetic proved through a real .xlsx, built by the shipped library
    tests/money.display.test.mjs one day has one price on every surface: screen, WhatsApp, sheet
    tests/cas.test.mjs         the client half of the ordering protocol: revision, receipt, rebase, hold
    tests/repayment.test.mjs   the advance that outlives its fortnight: carry, repayment, closure, the two labels
    tests/approval.test.mjs    no surface may read the new arithmetic before somebody approves it
    tests/quarantine.test.mjs  a damaged APPROVAL, through every door a record arrives by
    tests/correction.test.mjs  a correction is all of a transaction, dated on the transaction
    tests/closure.test.mjs     the frozen fortnight: what it records, what it refuses, who may have one
    tests/closure.echo.test.mjs an entry is its own wire copy; the closer is not held by its own closure landing first
    tests/wording.test.mjs     every figure called what it is, and an overpaid account stopped
    tests/overpayment.test.mjs v180: the credit (a late repayment into a closed fortnight; the same 1,500 owed
                               the same in any fortnight; used and written on the payslip; never below zero,
                               never wages), the other ruling through the flag seam, the wage rounded once,
                               and what v179 already wrote - on v179's own bytes out of Git: a payslip with
                               carriedIn -500, and a phone blocked over its own half-agora closure
    tests/samefact.test.mjs    one fact written by two phones is one fact, not a conflict
    tests/snapshot.poison.test.mjs a poisoned name arriving from the cloud, from every family
    vendor/                    SheetJS, pinned by filename and precached; the only third-party code shipped
    tests/recovery.browser.mjs the rescue export through the real button
    tests/forms.browser.mjs    the advance and correction forms, driven in real Chromium
    tests/handover.test.mjs    v86 -> v87 between two real trees, one origin
    tests/rules.test.mjs       firestore.rules against the local emulator
    tests/cas.emulator.test.mjs the PRODUCTION adapter's write path against the real emulator
    tests/rollout.test.mjs     publishing the rules over a genuine legacy document, and the cutover
    tests/rollout-matrix.test.mjs old and new client x old and new rules x legacy and protocol
                               document: the eight cells the rollout order is DERIVED from, not argued
    tests/ledger.ingress.test.mjs malformed ledger data through every door: held aside, never coerced
    tests/money.concurrency.test.mjs two phones writing MONEY at once, through the production adapter
    tests/poison.test.mjs      a ledger id that would land on a prototype, through every writer
    tests/merge.test.mjs       what adopting somebody else's document takes off this one
    tests/contested.test.mjs   the write that lost a race, and every trigger that must not send it
    tests/held.test.mjs        the held records shown with both sides in ⋯, and released by a person one at a time
    tests/receipt.test.mjs     a receipt names the operation, not just the revision it reached
    tests/bootstrap.rules.test.mjs the server's own answer to a bootstrap carrying business data
    tests/rima.test.mjs        v166 Rima count: one path, no shekel of pay moves, the client invoice counts
                               each one, the Rima table and sheet, no Rima in the WhatsApp message, held rows,
                               and v145/v165 (their real bytes, out of Git) not wiping it off the cloud;
                               v167: the sheet's note, and «בלי עובדי רימא» plus Rima = the invoice, cell by cell
    tests/rima.browser.mjs     the רימא field on every site card, the רישום לרימא section on screen,
                               on paper and in the picture, ten sites on a 320px phone; v167: «בלי עובדי רימא»
                               on the screen and in the workbook, never on paper or in the picture
    tests/yosefgeves.test.mjs  v183 «עובדי יוסף גבס»: tests/rima.test.mjs section by section on the other layer
                               (one path, the queue, every hold, the ring, ⋯) - and IN NO ARITHMETIC: every pay
                               figure, the invoice, the Rima table, every cell of every existing sheet of the
                               real workbook, every WhatsApp message and every man's seder byte for byte with
                               and without the counts; the two lists not touching; and v165, v179 and v180
                               (their real bytes, out of Git) dropping it, refusing it, and erasing it by a restore
    tests/yosefgeves.browser.mjs the יוסף גבס box beside רימא on every site card, one line and no taller, 44px
                               and 16px at 320-440 in both schemes; the list last under «לפי אתר» with the page
                               above it byte for byte what it was; ON paper (a real PDF) and IN the picture as
                               a table of its own, last, and both without it word for word what they were; no
                               heading of it anywhere with no count; not in the one-client file; the week grid
                               and copy-a-day unmoved
    tests/scroll.browser.mjs   the day keeps its place: every commit and every adopted snapshot leaves the
                               rows on screen where they were; a new date still opens at its top;
                               a double tap on a ✕ or a picker row is one tap
    tests/seder.test.mjs       v167: who is on the list and who is not, each man's message, the phone numbers,
                               and the progress - per date, and never in the record, the outbox, the cloud,
                               a backup or the rescue file
    tests/seder.browser.mjs    v167 in Chromium: the entry in the WhatsApp dialog, a man left out, the run
                               through wa.me one tap at a time, the marks, a reload mid-run, the rectangles
    tests/bars.stale.test.mjs  v167: the stuck iPhone frame decided in Node - the rule, the page's writes,
                               a whole stuck scroll under both readings of WebKit's rectangles
    tests/bars.stale.browser.mjs v167 in Chromium, visual viewport faked: bars, sheets, dialogs, the date
                               header on the glass, and every fixed layer of the page counted
    tests/declutter.browser.mjs v167 in Chromium: a site's row is the name, the ✕ and a tag only for a day
                               that is not regular; the name opens his sheet, which stays on him; a double
                               tap on a name is one tap; the compact header is one row
    tests/design.browser.mjs   v169 in Chromium: eleven names on the big phone, the strip and its worded button,
                               every button's words unchanged beside its glyph, a relabel dressed again, the
                               message textarea untouched, both palettes' contrast, no site colour moved,
                               44px and 16px on five screens in both schemes
    tests/transport.test.mjs   v174: the engine (the rows, first free seat, swap, seat 1 is the driver, what
                               is refused), a day and a list written by v171 opening cleanly and not rewritten
                               until changed, every word, the driver's message, the store's isolation from the
                               record, the fence, the cloud, a backup and the rescue file, a damaged transport
                               record not blocking the day, pruning, and the switch; v179: the summary of the
                               day line for line (order, driver first, a car with no driver, a driver alone,
                               nobody seated, the men waiting, empty and kept-home vehicles, a v171 day), a
                               pure builder, and every key on the disk unmoved by it
    tests/transport.browser.mjs v174 in Chromium with a touch screen: REAL touch drags (chip to seat, to the
                               driver's seat, onto a taken seat, car to car, back to the tray, released
                               outside, cancelled, past the edge to a car off the screen), a swipe scrolling
                               and moving nobody, tap-then-tap, the chooser, a vehicle kept home, a man not
                               riding, the driver on the LEFT in an RTL page, 2-2-2-3, 56px seats at 375,
                               the link read and not followed, the record byte for byte. v179: the summary's
                               one button, its dialog over the panel, its words against the cars AS DRAWN,
                               the share sheet / wa.me / clipboard / picture through recorders, Escape, and
                               no key written. NOT a real phone
    tests/transport.share.test.mjs v185/v186: the gate shut (the seam) is the app of before byte for byte; as shipped - the switch, a change
                               going up, two phones at once, the first meeting, today's rules, the app stopped
                               mid-step, two windows, a vehicle's off with the list, v179-v182 out of Git
    tests/transport.share.browser.mjs v185 in Chromium, two pages on one fake cloud: the line, the loser's
                               sentence and two buttons, the journey's bar and last look, the floors
    tests/transport.emulator.test.mjs v185 on the emulator: the rules block, the production adapter's
                               compare-and-set, two phones through it, older builds under the new rules,
                               this build under today's
    tests/journey.test.mjs     v184: the journey's status functions on seeded records, tomorrow across midnight and
                               Friday, the preference's isolation and a damaged one starting fresh, every word
    tests/journey.browser.mjs  v184 in Chromium with touch: the five stations end to end, a reload at each, הסעות off,
                               a man moved after seating, sending through recorders
    tests/workercard.test.mjs  v184: the card equals the pay sheet cell for cell on seeded records under both gate
                               readings, the gate asked once, the whole disk unmoved
    tests/workercard.browser.mjs v184 in Chromium: the one button on a crew row, the card on four screens, both exits
    tests/daycheck.test.mjs    v182: the day's check - the previous working day, each rule on seeded records, who is
                               never reported, the measured noise held under ceilings, every word, no key written
    tests/daycheck.browser.mjs v182 in Chromium: the entry at the list's foot, the dialog with findings and with none,
                               a name opening its sheet, rectangles on two phones in both schemes
    tests/polish.test.mjs      v181 in Node: who reads quiet and who never does, siteInitial, the two new sentences,
                               the backup reminder's rule, and no key written by drawing any of it
    tests/polish.browser.mjs   v181 in Chromium: the quiet zero's contrast, each empty screen, the letter in the
                               week block on a phone and its absence on paper, the backup row shut and at 16 days
    tests/settings-order.browser.mjs v172 in Chromium: the three sections and nine cards by title, what is
                               open on opening and after reopening, a redraw and an adopted snapshot leaving
                               the rows alone, every self-opening reason, the v171 sheet's controls and
                               sentences found again one by one, the Tab trap, 56px rows on three phones,
                               doubled text
    tests/oracle.test.mjs      the money worked out twice: tests/oracle.mjs, a second calculator written from
                               the documented rules and importing nothing from js/, against the app on 240
                               seeded records - pay at the stamped rate, both pay cycles, the invoice with
                               Rima, advances, carry, corrections, closed periods - plus hand-computed
                               fixtures and thirteen in-memory mutants that must each go red; nothing is
                               left out of the comparison since v180 (the two findings: tests/overpayment.test.mjs)
    tests/payroll.test.mjs, paybook.store / .sync / .transact / .split / .archive / .oldbuilds.test.mjs,
    tests/debt.ruling.test.mjs, months.test.mjs, months.capacity.test.mjs, cold.test.mjs, accounts.test.mjs
                               v187, the pay book in Node, each with the flags it names through the test seam:
                               the model and every refusal, one phone and its disk, two and three phones on
                               the fake cloud, the server-first door, what leaves the live document and what
                               a phone keeps, the one-debt ruling, capacity, older builds out of Git, and
                               every word of the screens (tests/paybook.world.mjs, cold.world.mjs,
                               fake-indexeddb.mjs, accounts.world.mjs and accounts.cloud.mjs are not suites)
    tests/activation.test.mjs  v187, on the build AS IT SHIPS: the dry run writing nothing, older rules refused
                               by a read, every phone on at once, the way back, the point of no return field
                               for field, v180/v183/v184/v186 out of Git, the rules as additions to the live file
    tests/accounts.browser.mjs, archive.browser.mjs, cold.browser.mjs, activation.browser.mjs
                               v187 in Chromium: the screens through the seam; and, as shipped, the row in ⋯,
                               the activation screen, refused and on, the months page, a real IndexedDB
    tests/paybook.emulator / paybook.split.emulator / paybook.archive.emulator / months.emulator /
    tests/activation.emulator.test.mjs
                               v187 on the emulator: the real rules and the production adapter - create-once,
                               the pay map that only grows, two phones at once, the probe, the rollout table
                               (older builds x the live rules and the new x a record on and not), and the
                               shared rides' documents beside a record that is on
    tests/gate-open.matrix.mjs every suite with the three flags open, against tests/gate-open.expected.mjs -
                               an instrument in NO gate (`npm run test:gate-open`); gate-open.preload.mjs is its seam
    tests/serve.mjs, serve.py  static servers for the suites (?slow=N on the python one)
    tests/shot.mjs             a screenshot; asserts nothing
    tests/embedded.html        the app inside a sandboxed iframe
