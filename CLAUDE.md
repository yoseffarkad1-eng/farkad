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
  come after the data layer. The order in `index.html` is the order. Two scripts load in
  the HEAD, after the four stylesheets (v191): `store.js`, then `ui/display.js`, so that a
  phone's «תצוגה גדולה» is on `<html>` before one element of the body exists; the boot
  sentinel is installed before every other script, and before these two a smaller
  listener, the ear, keeps their failures for it (`tests/build.test.mjs`).
- **Nothing off this origin sits between a person and their data.** The Firebase SDK is
  fetched after boot, never before the first render, and fails soft. SheetJS is not
  fetched at all any more: `vendor/xlsx-0.18.5.min.js` is in the service worker's shell,
  so the export works in a tunnel. Reaching the CSV fallback now means the build on that
  phone is incomplete, not that the signal is weak, and it says so.
- **Three stylesheets, and the order is the mechanism.** `css/app.css`, then
  `css/readability.css` (the owner's reading sizes, v140), then `css/design.css` (v169: the
  palette, the four button looks, rows instead of boxes). The last is a layer over the first
  two and every rule in it is `@media screen` - paper is not its business. A new look goes in
  the layer; a new mechanism goes where the mechanism lives. A fourth, `css/large.css`
  (v191), is loaded last and is NOT a layer everybody gets: every rule in it is written
  under `:root.display-large`, a class `js/ui/display.js` puts on `<html>` only on a phone
  that turned «תצוגה גדולה» on, so without the class it matches nothing. A size added to
  one of the three is said again there in the same commit, and a screen added to the app
  is added to `tests/screens.mjs` - `tests/largetext.browser.mjs`
  fails on the screen where it was not.
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
are verified. Vehicles stay off. v119 enables owner-requested deletion of unused workers: shared names require completed protocol sync, work and financial history block deletion, and late work reinstates the identity as inactive. v120 permits canonical empty day placeholders to be removed in the same journal and cloud transaction as an unused worker. v166 adds the Rima count, `days.<date>.rima.<placeId>`: another company's men, counted per site, never named and never in pay, but billed to the client as one worker-site day each (owner's ruling, 2026-11-01); v145/v165 phones drop it from their own copy, so a whole-document restore must not be run from one of them (docs/releases.md, v166). THE ROLLOUT RULE there: every phone on v166 before the first Rima count is typed; until then no rescue file, backup, restore point or cloud copy is restored across builds, in either direction, no window of an older build stays open beside a v166 one, and client invoices come only from an updated phone. v167 adds the seder to each worker (js/ui/seder.js), entered from the WhatsApp dialog and from nowhere on the day screen: the men with a site that day, each opened in WhatsApp with his own message by the person's own tap - never sent by the app, and never marked "sent". It writes nothing to the record; its progress is a per-date preference in Store. Its Hebrew words are the owner's, approved 2026-11-07 and pinned word for word in tests/seder.test.mjs (docs/releases.md, v167). v169 is the one look (css/design.css, js/ui/icons.js): a restyle that moves no control, changes no label and touches no data path (docs/releases.md, v169). v171 adds הסעות (js/model/transport.js, js/ui/transport.js): who rides to work in which vehicle and a message to each driver, on a phone that turned it on in ⋯ and on no other - its own Store keys (farkadTransport:…), never the record, the outbox, the cloud, a backup or the rescue file, so a lost phone loses the plans; it reads the day through the seder's own list and never writes it; its Hebrew is proposed, not approved word by word, and pinned in tests/transport.test.mjs (docs/releases.md, v171; docs/transport-spec.md). It is not the retired vehicles feature and shares nothing with it. v174 rebuilds the הסעות screen as a picture, because the owner tried v171's four-tab planner and sent it back (2026-11-10: draw the car from above, write "add worker" on every seat, let him drag the men): ONE screen - a sticky tray of the men with a site and no seat, each vehicle drawn from above with the driver's seat on the LEFT (its own `dir="ltr"`; RTL must not mirror a car), seats as tiles in their real rows; a man is seated by a finger's drag (Pointer Events, never the HTML5 drag API; a waiting man lifts at once, a SEATED man only after a 300ms hold so that a swipe on a filled car scrolls and moves nobody), by touching him and then the seat, or by touching the seat and choosing; whoever is in seat 1 is the driver; every change is kept at once. Pickup areas, "may drive", suggest, locks, accept, versions and «סימנתי שנשלח» are REMOVED. A day written by v171/v172 opens as it is and is rewritten only by its first change, which drops its versions, locks, areas and «sent» marks; the store, the switch, the one entry and the isolation from the record are v171's, unchanged. Its Hebrew is proposed and pinned in tests/transport.test.mjs. THE DRAG HAS NEVER BEEN TRIED ON A REAL PHONE - only with emulated touch in Chromium (docs/releases.md, v174). v179 adds the summary of the day to that screen, because the owner asked whether there is a report for the cars (2026-11-10): ONE button, «סיכום הסעות ליום», opens the app's own dialog with every vehicle that goes out, its driver (seat 1) and its men in the order of their seats, then the men still waiting, the empty vehicles and the ones kept home; it leaves as text by the day message's own two doors (shareTextOut/copyTextOut in js/ui/share.js - the share sheet or wa.me with no number, and the copy) or as a picture by the printout's (sharePrintout('transport'), read off the dialog's field). It is a READING: it writes no key anywhere, marks nothing, and never says «נשלח»; a vehicle is always named after a Hebrew word, inside its right-to-left isolate. Its Hebrew is proposed and pinned in tests/transport.test.mjs; not tried on a real phone (docs/releases.md, v179). v184 adds «בניית סידור» (js/ui/journey.js): the seder as ONE journey of five stations - the day screen on tomorrow's date with the journey's row inside the day's own dock, the day's check, the הסעות screen (skipped, never turned on, on a phone that has it off), a read-only last look, and sending where HE chooses and the drivers come first - a frame around the existing screens that builds no second editor and writes the record by no new code; its place is a per-phone preference (farkadSederJourney), forgotten after three hours; one entry, in the WhatsApp dialog. It adds «כרטיס עובד» (js/ui/workercard.js): one man on one screen from his crew row, every figure the pay sheet's own cell or the ledger's own fold, nothing written, the carry gate asked once per reading. And a lasting switch per vehicle in «רכבים» (`off: '<date>'` in farkadTransport:settings; turning it writes the list and no day). All Hebrew proposed and pinned; none of it tried on a real phone (docs/releases.md, v184). v182 adds two readings that write nothing: «בדיקת היום» (js/ui/daycheck.js) - one button at the foot of the day's list, what the day may be missing against the previous working day the record holds, names that open the sheet they already open, and two globals for other screens (dayCheckFindings, renderDayCheckInto); and the vehicles' report of a period on the הסעות screen («דוח הסעות לתקופה»: four ranges, per vehicle and per driver, what this phone did not keep SAID - the store keeps 35 days). Both sets of Hebrew are proposed and pinned (tests/daycheck.test.mjs, tests/transport.test.mjs; docs/releases.md, v182). v181 is polish with no number and no data path moved: a man who owes nothing reads quieter on the advances page, empty screens show one sentence and the existing button instead of tools over nothing, each colour block of the week carries the site's first letter on a phone (an attribute drawn by css/design.css - never on paper), and the backup row in ⋯ says its age while shut and, after 14 days without a file, one quiet line (it reads scheduleData:lastBackup, no new key); two proposed sentences, pinned in tests/polish.test.mjs (docs/releases.md, v181). v172 puts the ⋯ sheet in strict order: three sections of three cards, every card but ענן וסנכרון a row (`<details>`) that opens in place, גיבוי open and the rest shut at every opening, a row opening by itself only for the reasons listed in settingsFoldReasons (js/ui/settings.js) and never shut or opened by a redraw; no control, word or handler changed, and nothing about it is stored (docs/releases.md, v172). v180 repairs the two faults the second calculator found (tests/oracle.test.mjs), on a separate branch and NOT SERVED until the owner has seen it: (1) money a man gave back beyond what he owed STAYS HIS CREDIT until it is used - it comes off whatever advance he takes next, however many periods later, as its own figure (`creditIn`/`creditForward` beside a debt that is zero or more; never a negative balance, never wages, never dropped at a boundary), where v179 carried a negative balance across exactly one boundary and froze `carriedIn: -500` onto a payslip; the other ruling (no credit, the excess only flagged) is the one line OVERPAYMENT_STAYS_CREDIT in js/model/schema.js; an over-settled advance still stops the automatic deduction and refuses a close exactly as before (tests/wording.test.mjs), and whether a used-up credit should lift that is the owner's and undecided; (2) the wage of an account is rounded to the agora ONCE, in advanceWalk, so a close can no longer take 630.63 off a recorded 630.625 and be refused by its own judge - and a closure v179 already wrote that way is never rewritten: the judge reads its wage to the agora, and a copy a phone already held aside is taken back if, and only if, it is exactly that shape and taking it back condemns nothing. Two phrases are new and PROPOSED, «יתרת זכות» and «יתרת זכות מחשבון קודם», pinned in tests/overpayment.test.mjs. THE ROLLOUT RULE: every phone on v180 before the next account is closed - a v179 phone and a v180 phone closing the same account write different bytes under one id (docs/releases.md, v180). v183 adds «עובדי יוסף גבס», `days.<date>.yosefGeves.<placeId>`: a SECOND count per site, typed beside רימא on every site card, stored, journalled, synced, held and cleared exactly as the Rima count is - and IN NO ARITHMETIC AT ALL: not in pay, and not on the client's invoice either (the difference from Rima; the owner, 2026-11-10: "outside any account ... a list of their own without touching any other list"). js/model/money.js and js/model/ledger.js must never name the layer; its own table at the end of «לפי אתר» and its own last sheet of the full workbook, never a column in anybody else's. It IS printed and it IS in the shared picture - the owner again, 2026-11-10: "in print too, but as a separate list that does not enter any other list's account" - as a table of its own, last, with its note, and no figure of any other table moves on paper or in the picture for it; it is not in the one-client file. Every build before v183 - v166 to v180 included - drops the layer from its own copy and erases it by a whole-document restore, so THE ROLLOUT RULE is v166's, for this count: every phone on v183 before the first one is typed (the owner approved publishing on 2026-11-10, told this rule); until then nothing is restored across builds, in either direction, and no window of an older build stays open beside a v183 one. The list's name is the owner's; every other word of it is proposed and pinned in tests/yosefgeves.test.mjs (docs/releases.md, v183). v185 carries the SHARED rides and shipped them SHUT; v186 OPENS the gate (js/ui/transport-share.js, TRANSPORT_SHARE = true - the one line of the app v186 changes; the shut path stays measured through the test seam): the owner asked for הסעות on the other accounts and chose one shared plan (2026-11-10). With the gate open the list of vehicles and each day's plan are documents OF THEIR OWN, schedules/<doc>/transport/settings and …/day_<date> - never a byte of the schedule document, never its outbox, journal, receipts or status sentence - written whole at exactly the next revision (adapter transaction + rules), so of two phones one lands and the loser is shown the plan that won, told in one sentence, its own copy put aside first; the switch stays per phone; a driver's «נפתח» mark, the backup and the rescue file are as before. js/ui/transport.js reaches it only through transportShareTell, at five marked places. A phone shares only with this build, its switch on AND a cloud account; a phone with the switch off makes no call to those documents. THE RULES ARE PASTED BY THE OWNER BY HAND (.github/workflows/rules.yml would publish firestore.rules from main, but its secret is not set and v186 does not touch the file): under the rules of before a phone says «עדיין לא משותף», keeps its plans, asks again by itself and starts sharing with no reload when they appear. The owner's phone takes v186 first - the first phone with an edited list or a planned day is the author, a phone that had its own is told once with «להשתמש בשלי», an untouched list of seven is never uploaded - and no v183-or-older window may run on a sharing phone (docs/releases.md, v186 and v185; docs/transport-spec.md, Phase 3). Its Hebrew is proposed and pinned in tests/transport.test.mjs. v187 adds «סיכום חודש» (js/ui/monthsummary.js): one calendar month on one screen from one row of the reports' «הפקת דוח» menu - attendance and working days, worker-site days per site as a bar in the site's colour, the Rima and יוסף גבס counts each apart with its note, the men, the money in the sheet's own words, each headline with its step from the month before in words - a READING that writes no key and prices nothing itself (every figure is an existing report function pointed at the month, with its gate), leaving as text only; the Rima count IS in that text, because it is the owner's reading and not the crew's day message. Its Hebrew is proposed and pinned in tests/monthsummary.test.mjs (docs/releases.md, v187). v188 is five things, none writing the record by new code: «מה חדש» (js/ui/whatsnew.js) - after a start on a build newer than the last one whose news this phone saw (farkadWhatsNewSeen, a per-phone preference), ONE quiet line in the banner area, never put up mid-edit, opening a card of what was added and where, newest first; closing it or the line is seen; a first install is told nothing; ⋯ ← עדכון וגרסה ← «מה חדש» lists it all; «הראה לי» only navigates and never turns a per-phone switch on or opens a reading of money by itself; AND THE RULE: every release adds its items at the top of WHATSNEW_BUILDS in the commit that moves the stamps - tests/whatsnew.test.mjs fails when the running build has a heading in docs/releases.md and no entry there. The journey's second pass (js/ui/journey.js): one button at the FOOT of the day's list, in a row of its own above «חיפוש עובד» and «בדיקת היום», naming the day it opens on or where he is in a journey he left - not shown under 580px of height, where one more row costs the last man his place on the screen (tests/mobile.test.mjs); at station 1 the dock is two lines, «שליחה לוואטסאפ» put away and «מהיום הקודם» between «יציאה» and the way onward, nothing moved in the document; an opened driver named again among the workers at station 5 and never skipped; the rides' summary read in its own dialog first (openTransportSummary(date)); the rides' bar silent when nothing is left. «תלוש לכל עובד» (js/ui/payslips.js): a row of «הפקת דוח» on «לפי עובד» only - each man's own statement for his own period, one WhatsApp door per man; the text is workerStatementText byte for byte and the figure the pay sheet's own cell, a row whose two figures differ has no door, the marks are farkadPayslipsProgress and say «נפתח בוואטסאפ» and nothing stronger. The worker card's second part (js/ui/workercard.js): the month as a calendar read the way the week screen reads a day, a day that only navigates, and «התקשר» / «וואטסאפ» by the seder's phone rule. «חיפוש עובד» (js/ui/find.js): one button FIRST in the row of «בדיקת היום» at the foot of the day; a dialog that finds a man by name, phone or identity and offers his card, the day's sheet for the date on screen and his advances; it writes nothing. All Hebrew proposed and pinned; none of it tried on a real phone (docs/releases.md, v188). v189 makes the pay sheet's DEFAULT an account per man, because the owner opened «דוחות» and asked why the weekly men show a two-week account (2026-11-11): while the chip «תקופת החשבון» is lit and the range is still the fortnight containing today, every reader that has a man in hand - his row, his card, his days, his statement, the deduction chosen for him, his closing button, his rows of the workbook - asks reportSpanFor (js/ui/reports.js) and reads him over HIS period containing today (periodRangeFor), so the weekly group is the current week and the fortnightly group the fortnight, each under a heading with its own dates and with no amber sentence; it is DERIVED, never stored - any other REPORT_RANGE or chip is an explicit range read exactly as before, amber sentence included - and no figure of any (man, period) is worked out a new way (tests/account-view.test.mjs holds every weekly cell equal to v186's week picked by hand and every fortnightly cell equal to v186's default, on v186's bytes out of Git); a recorded, unclosed period of a man inside the fortnight that the default does not show is NAMED under his group, on paper, in the picture and in the file, with one button that points the page at it; «לפי אתר», the client's invoice, explicit ranges and the worker's card are untouched; two phrases are new and PROPOSED; the owner saw the pictures and said to publish (2026-11-11). The card, the month's summary and the payslips still read what they read: each points the sheet at a range that is explicit or is the man's own period, and tests/account-view.test.mjs holds their whole answers equal over this sheet and v186's - and a man's payslip figure equal to his card on the default. v189 also adds «האתר הקבוע» (js/ui/usual.js): ONE dashed chip beside a man in «לא נרשמו», the site he worked on last and is settled at (a pure rule over his latest working days, never a guess, nothing learned or kept), and a tap is the sheet's own pick by sheetPickPlace (js/ui/sheet.js) - a regular day, one field path, ↶ - the disk byte for byte what a pick in his sheet leaves (tests/usual.test.mjs); there is no «all of them» button, on purpose. And «כרטיס אתר» (js/ui/sitecard.js): one site on one screen from its row on the crew screen - a month's calendar, the counts «לפי אתר» has for that month and site, who worked there, and the client's text - counts and not a shekel, nothing written, the reports' range never touched, «עובדי יוסף גבס» on the card and not in the client's text. All Hebrew of both proposed and pinned; none of it tried on a real phone (docs/releases.md, v189). In v189 the reports' phone card also tells the whole account top to bottom - work days, double days, EXTRA HOURS, days off; daily rate, «נצבר», the deduction; his notes; «נותר לתשלום» last and largest - every figure the full table's own cell, no string new, and the days dialog says a day's hours in words and ends in the card's summary (the owner, 2026-11-11: the extra hours did not show); what the hours are WORTH is not a line of its own because the model keeps no such figure (tests/reportsclarity.test.mjs; docs/releases.md, v189). v190 repairs five faults the review of v189 found, with no new screen, key, field path, writer or Hebrew in the app: every control of «לא נרשמו» and «נעדרים» reads ONE tap clock (trayTapTooSoon, js/ui/day.js), so a double tap on a usual-site chip places one man and touches nobody else, and «נעדר» in the tray and a pick in «לאן הלך» go through editWithUndo; while anything midEdit() counts is open the date never moves under it at midnight - the follow is made when the last dialog closes or at the next return (watchDayRollover, js/app.js) - and «🧹 רוקן אתר» empties the day it asked about, only the men still there; in the shared rides (js/ui/transport-share.js) memory never runs ahead of the disk, a record moves only to what the disk holds, nothing is sent that the disk does not hold, and only a moved record is progress, so a disk that refuses no longer loses the other phone's plan or spins the cloud (tests/midnight.browser.mjs, tests/usual.*, tests/transport.share.test.mjs; docs/releases.md, v190). v191 adds «תצוגה גדולה» (js/ui/display.js, css/large.css), because the owner said one of the three people who use this is 62 and far-sighted (2026-11-11): ONE switch, a row of «כללי» in ⋯ straight before «הסעות», per phone and off until turned on - its own Store key (farkadDisplay:large, exactly '1' is on, anything else is off), never the record, the outbox, the cloud, a backup or the rescue file. It puts one class on <html> from the head, where it and js/store.js load after the four sheets, before one element of the body is drawn (a window of the same phone follows a change made in another at the first moment nobody is typing in it), and everything it changes is css/large.css under that class: nothing under 18px, what is read first 20px and up, money and counts larger and heavier, no text lighter than 500, every word at 7:1 in both schemes, targets 52px (a floor that never lowers what a sheet already asks; the month's days on the two cards keep their share of the card, 45px wide at 320, the one exception), fields 20px, rows further apart - each size raised where it is set, never zoom, never transform: scale, never a root font-size, and no bar height written (the bars are taller and js/ui/bars.js measures them). Fewer names on a screen is the price, paid ONLY in the mode: with it off the app is rule for rule what it was, and the eleven names stand. Paper, the shared picture and every exported file are untouched. Block 3 of css/large.css restates every rule of the three sheets that sets a size, a weight or a line-height, one for one and WITH ITS OWN IMPORTANCE, so the copies compete as their originals do; a size added to one of the three is said again there in the same commit. «מה חדש» has its item, and its «הראה לי» opens the row and never turns the mode on. Three faults were repaired for everybody, by the app's own floors: the chosen day of the week's «ימים» was white on a light blue in the dark scheme (2.2:1), the ✕ that puts the undo bar away was the bar's own colour give or take (1.6:1 and 1.9:1), and «עוד פרטים» in a man's form was 39px tall on the wide phone. Its own review, before it was served, found ten faults - most on a 320x568 phone the walk did not have - and every one is repaired in it with its check; with the mode on the migration's questions open at their title, and the same dialog's older habit with the mode off (a second opening begins where the last was read to) is reported, not changed. Its Hebrew is proposed and pinned in tests/largetext.test.mjs and tests/whatsnew.test.mjs; nobody far-sighted has looked at it and it has not been tried on a real phone (docs/releases.md, v191). v192 is the owner's own change to «דוחות» ← «לפי עובד» (2026-11-11: the names clearer, in a colour, and the weekly men without dates - «שבוע» or «דו שבועי» is enough, told apart by colours): each man's name is the first thing on his card, 26px/900 in his group's colour and never cut (the amount to pay stays the largest); weekly is orange and fortnightly blue (--group-{weekly,biweekly}-{ink,mark}, css/design.css), keyed by ONE attribute, data-cycle, that js/ui/reports.js writes on a group's heading, on the group and on its button above; each heading shows its cycle's word only on the screen, and its dates stay in its text (.report-group-when, hidden by `@media screen`) so the paper, the shared picture and the file say every period's dates as v190 did; every card and «תצוגה מפורטת» row of the group carries an 8px edge in its colour; and the closing preview says «יישאר חוב פתוח» where since v117 it said a Hebrew word ending in two Arabic letters - tests/reportnames.test.mjs scans js/ for any such word. No figure moved (tests/account-view.test.mjs and tests/reportsclarity.test.mjs, against v190 out of Git). Its sizes are restated in css/large.css, and the buttons to the groups keep their words beside the edge, with two groups and with three. The one new string and the news item are proposed and pinned (tests/reportnames.*, tests/whatsnew.test.mjs); not tried on a real phone, and colour blindness only simulated (docs/releases.md, v192). v192 also carries two repairs: every surface of the day screen writes the day it NAMED whatever the calendar did meanwhile, the midnight follow is held only by an open dialog or a box being typed into, and a guard ignores only the same finger again in the same place under 300ms (tests/midnight.browser.mjs, tests/doubletap.browser.mjs); and in sw.js a window that arrives between the enrollment and the claim on a FIRST INSTALL is written down as this build the first time anything asks about it (buildOfClaimed) instead of being refused everything until a reload - on an upgrade it is still refused, because nothing can know which build's page it was handed (tests/firstvisit.browser.mjs; docs/releases.md, v192). v193 is repairs from a read-only audit of v192, with no screen and no data path added: the worker's install asks the origin for every shell file (`cache: 'reload'`) and refuses to call a shelf complete unless its page and js/app.js name this build, because GitHub Pages' max-age let a new shelf be filled with the build before (tests/swfresh.test.mjs, on a server that answers max-age as no other test server does); the way back from «לשחזר את המצב שלפני הטעינה האחרונה» is dropped only when nothing was replaced; the daily pruning steps over a restore point it cannot read; a backup file, which carries no migration questions, no longer empties the phone's; «תוקן» is dated on the local calendar; the page covers itself and boots nothing when framed by ANOTHER origin (same-origin and the sandboxed frame as before); a paste of more than 500 lines and a backup file past generous bounds are refused whole, never cut; its Hebrew is proposed and pinned in tests/auditfix.test.mjs and tests/auditfix.browser.mjs (docs/releases.md, v193). v194 is four repairs on the day screen, with no key, field path or writer added and nothing in js/sync, js/model or the stores: (1) the page's own rule (js/ui/sheet.js) spends a finger's or a pen's press that comes down on the same spot as the press before it, less than WALK_BOUNCE_MS after it, on a control that is NOT the one that press hit - so a double tap no longer falls through a sheet or dialog that just shut onto the ✕, the dock or the row under it; it asks no surface anything, leaves the same control still there or drawn again as it was (the day's arrows), and DOES NOT COVER A MOUSE, nor a control that stays the same node and means something else, which is still each surface's own guard's (tests/doubletap.browser.mjs; suites that walk screens and are not about double taps tap at a person's pace through tests/pace.mjs); (2) «הכל חופש» is on no screen (the owner, 2026-11-11: the place is dangerous, ask whether he is sure): the foot of the day ends with «עוד ⋯» (dayMoreEntry, js/ui/day.js), which writes nothing and opens the day's menu, and the menu's «הכל חופש» asks «בטוח שכולם בחופש?» with the day, the count and every man BY NAME (askConfirm's `names`, #askList, js/ui/ask.js), the confirming button the destructive kind with no fade, the focus on «ביטול», nothing answering for DOUBLE_TAP_GUARD_MS; the menu and the question name the day the door was drawn on and the holiday is written THERE; confirmed, the record is v190's to the byte, and ↶ takes the whole holiday back as one step of its own (tests/holiday.test.mjs, tests/holiday.browser.mjs); (3) ↶ and ↷ write only over what this phone's own step left (undoStands, js/ui/undo.js): when the day changed since - another phone's correction adopted - nothing is written, both arrows are forgotten and the person is told, and a step over several men goes back man by man, leaving and counting the ones changed (tests/undo-stale.test.mjs); (4) men taken off a site one after another (the owner, from his phone: "one of the two removals does not happen and things get mixed up"): a row's ✕ is no longer held by 700ms of time alone that began again at every tap it dropped (v166's clock - a steady pace under it took off ONE man however many taps) but ignores exactly a press made less than WALK_BOUNCE_MS after the press of the removal before it, measured from the last press LET THROUGH, and a press made before that removal was drawn (rowRemoveTooSoon, js/ui/day.js) - a double tap is still one man, and two taps 300-700ms apart are now TWO; the first row under the header, taken off, leaves its place to the man below instead of pulling the page back a row (keepDayAnchor); the undo bar is not left standing where the finger that took a man off came down, the step staying on the header's ↶ by name (undoBarAwayFromPress, js/ui/undo.js); and on the two trays the SAME ACT AGAIN on the next man - the ✕ of «נעדרים», «נעדר», the usual-site chip - is judged as a row's ✕ is, while a control of ANOTHER kind and a man's name are held for the whole DOUBLE_TAP_GUARD_MS after any tap there, exactly as since v190 (trayTapTooSoon). NOT repaired, and said in docs/releases.md: the cost of one commit on a large record (js/state.js, js/store.js, js/sync - untouched), the page moving at its very end, the list closing up under a finger that aims at where a man was, a press dropped silently because the write before it was not drawn. tests/removepace.browser.mjs holds it, on a season of days with the processor slowed. «מה חדש» has three items. Its Hebrew is proposed and pinned in tests/holiday.test.mjs, tests/undo-stale.test.mjs and tests/whatsnew.test.mjs; none of it tried on a real phone - the owner's iPhone least of all (docs/releases.md, v194). v195 adds «מי חייב כסף», «שים לב» and «סגירות שנרשמו» (js/ui/owes.js) - three readings of the advances that write no key anywhere. The owner said he loses money to a deduction that was not made and an advance that is forgotten (2026-11-13), and the probe behind it found why: a period nobody closed is read by the pay sheet, from the next period on, as if the full deduction had come off that wage, while the ledger - which only a close writes to - still shows the debt. The board, on top of «מקדמות», shows the LEDGER's figure per man (openAdvanceBalance; the list under it says the same), since when, the last deduction, his periods ended with nothing taken (flagged from two, the owner's number), whether he stopped working or is switched off, and each earlier period nobody closed; «שים לב» says the same in sentences there and as one shut row at the head of «דוחות» ← «לפי עובד» (outside the report's section: never on paper, in the picture or the file), with one button that only NAVIGATES to the pay sheet narrowed to that man and pointed at that period - old periods are closed by hand, man by man, oldest first (the owner again), and nothing here closes one; «סגירות שנרשמו» reads the closes already in the ledger, grouped by `at` and `by`, each account through advanceAccount on its closed period, leaving as text. With the carry shut or the migration unapproved it is the sum handed over under «מקדמות רשומות» and nothing of the new arithmetic (tests/approval.test.mjs). ITS COST IS COUNTED, because the gate's question re-plans the migration and the plan walks a man with a debt and no daily rate through four thousand fortnights (seconds): a reading plans not at all on a record that carries the approval and once on any other (owesGateAnswer), asks the pay sheet once per range and a man's closed periods once per man (owesOnce), is kept under a key that IS the record - the write tick, today, both gates and the record as text - so a draw of a record that did not move reads nothing and a kept figure is never another record's, and at the head of «דוחות» is read after the page has painted; a reader added to that file is added inside owesOnce and counted in tests/owes.test.mjs. «דוחות» itself still asks the gate 18 times a draw, as before v195, and that is not repaired. Its Hebrew is proposed and pinned in tests/owes.test.mjs and tests/whatsnew.test.mjs; not tried on a real phone (docs/releases.md, v195). v196 makes «דוחות» fast without moving a figure: every way into js/ui/reports.js that reads money, and the worker card, the payslips and the month's summary, run inside ONE reading (reportReadOnce) that answers the carry gate once - by v195's rule, without planning at all on a record that carries the approval - and works out each range's pay sheet and each man's closed periods once; between draws only the gate's answer on a record that must be planned is kept, under the record itself (reportGateKey); tests/reports.speed.test.mjs holds 3,276 readings byte-equal to v195's bytes out of Git, the gate counted for eleven ways in and freshness after every kind of write; no key, writer or Hebrew in the app but the news item (docs/releases.md, v196). Test-only overrides are
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
    js/ui/display.js           v191: «תצוגה גדולה» - one per-phone preference (farkadDisplay:large), the class it
                               puts on <html>, and its row in ⋯; loaded in the head straight after store.js, so
                               nothing of the body is drawn small first; another window of the phone follows
                               a change when nobody is typing there; the switch stays under the finger; every
                               size it stands for is css/large.css, under that class
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
    js/ui/reports.js           pay and invoice reports; the advance form; v189: the account view - on the default
                               range each man is read over his own period (reportAccountView, reportSpanFor);
                               v192: data-cycle on each group's heading, group and button, the colour's one key;
                               v196: every way in that reads money reads inside ONE reading (reportReadOnce) -
                               the gate answered once and, on an approved record, not planned (reportGateAnswer),
                               each range's pay sheet and each man's closed periods once; the one answer kept
                               between draws is the gate's on a record that has to be planned, under the record
                               itself (reportGateKey)
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
    js/ui/usual.js             v189: «האתר הקבוע» - the pure rule (usualSiteFor), the chip and the one sentence in
                               the tray of «לא נרשמו»; the tap calls sheetPickPlace and no writer of its own
    js/ui/sitecard.js          v189: «כרטיס אתר» - a reading of one site and one month through the reports' own
                               count functions; the client's text; no money, no key written
    js/ui/monthsummary.js      v187: «סיכום חודש» - one month read through the reports' own functions; no money of its
                               own, no key written; one row in the «הפקת דוח» menu
    js/ui/payslips.js          v188: «תלוש לכל עובד» - the men with a row in the pay sheet for their own period, each
                               with the sheet's own figure and workerStatementText as his message; one door per
                               man; a row whose figures differ is held; one Store preference (farkadPayslipsProgress)
    js/ui/find.js              v188: «חיפוש עובד» - a finder over the day: name, phone or identity; three doors to
                               screens that exist; writes nothing; its button is first in the day's foot row
    js/ui/owes.js              v195: «מי חייב כסף» on top of «מקדמות», «שים לב» there and at the head
                               of «דוחות» ← «לפי עובד», «סגירות שנרשמו» - three readings of the money record:
                               the LEDGER's balance per man beside the periods nobody closed (which the pay
                               sheet presumes deducted), one button that only navigates, the closes on record
                               as text; every figure an existing function's answer; no key written; the cost
                               counted - the plan at most once a reading and never on an approved record,
                               each reader once (owesOnce), the reading kept under the record itself
                               (owesKey), the row on «דוחות» read after paint; every Hebrew word in one
                               block (proposed)
    js/ui/whatsnew.js          v188: «מה חדש» - the news per build in ONE data block, the rule of what a phone is
                               owed, the quiet line, the card, «הראה לי» (navigation only), the row in ⋯; one Store
                               preference (farkadWhatsNewSeen); whatsNewGuard, the next release's reminder
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
    tests/swfresh.test.mjs     a deploy inside the host's ten minutes of max-age: the new shelf holds the new
                               build's bytes, file by file, and an origin that is itself behind fails the install
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
                               a double tap on a ✕ or a picker row is one tap (a row's ✕ and the ✕ of
                               «נעדרים»: inside 300ms; man after man is tests/removepace.browser.mjs)
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
                               sentence and two buttons, the journey's bar and last look, the floors; v191:
                               the first meeting on a 320x568 phone with «תצוגה גדולה» on - room for a seat
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
    tests/monthsummary.test.mjs v187: every figure of the month equal to the report it is read from, on seeded months
                               (both cycles, Rima, יוסף גבס, a rate change, an empty month, a month in progress), the
                               gates, no rate multiplied in the file, every word, no key written
    tests/monthsummary.browser.mjs v187 in Chromium: the row in the «הפקת דוח» menu with the measured rows unmoved, the
                               month on two phones in both schemes and at doubled text, the text's two doors
    tests/payslips.test.mjs    v188: a man listed exactly when the sheet has his row for HIS period, his text the
                               statement byte for byte, his figure the sheet's cell, his link his own number; both
                               gate readings; a held row; the marks' isolation; every word
    tests/payslips.browser.mjs v188 in Chromium: the row of «הפקת דוח» on «לפי עובד» only, each figure against the
                               tile the sheet draws, the preview, a real tap to a stood-in wa.me, a reload mid-run
    tests/find.test.mjs        v188: who is found and who is not, the three doors, the whole disk byte for byte
    tests/find.browser.mjs     v188 in Chromium: the button beside «בדיקת היום», the foot no taller for it, the
                               keyboard's lift through applyKeyboardInset, each door landing where it says
    tests/whatsnew.test.mjs    v188: what a phone is owed across builds (seen v181 -> v182 onward), a first install,
                               a damaged note, the note's isolation, every item and word pinned, each text one
                               sentence, and THE GUARD: the running build must have its entry once docs/releases.md
                               has written it up (SKIP, printed, while the block is ahead of the stamps)
    tests/whatsnew.browser.mjs v188 in Chromium: no line on a first install, one line for a phone with a crew,
                               never under a dialog or a typed field, the card, seen by close / Escape / ✕, the row
                               in ⋯ over the sheet, EVERY «הראה לי» landing where it says with the disk unmoved
    tests/settings-order.browser.mjs v172 in Chromium: the three sections and nine cards by title, what is
                               open on opening and after reopening, a redraw and an adopted snapshot leaving
                               the rows alone, every self-opening reason, the v171 sheet's controls and
                               sentences found again one by one, the Tab trap, 56px rows on three phones,
                               doubled text
    tests/usual.test.mjs       v189: the rule case by case, how often it is right on seeded months (floors), the
                               tap and a pick in the sheet leaving the same bytes, a regular day, one man a
                               tap, nothing kept by drawing, every word
    tests/usual.browser.mjs    v189 in Chromium: the chip 48px and 18px in the site's colour, beside the name or
                               under it, a real tap, a double tap one man (v194: the next man's own chip 400ms
                               later is a tap), ↶, the journey's first station
    tests/midnight.browser.mjs v190 in Chromium: each writer open across midnight - the sheet, «לאן הלך», a
                               site's picker, «🧹 רוקן אתר», «הכל חופש», a typed count - writes the day it named
    tests/firstvisit.browser.mjs v192 in Chromium: the window that arrives while the service worker takes over,
                               the race held open - served on a first install, refused on an upgrade in both
                               orders, a disk that refuses the record, a restart
    tests/doubletap.browser.mjs v192 in Chromium: a double tap on every writer a tap opens is one tap, and a
                               deliberate tap 350ms or later is never swallowed
    tests/removepace.browser.mjs man after man off a site in Chromium, on a season of days, the processor slowed
                               4x: a tap every 400ms takes off every man tapped, each inside a stated bound, no
                               tap dropped; a double tap is one man; a press made before the last removal was
                               drawn is nobody; the first row under the header taken off moves nothing above it;
                               the undo bar not put up under the finger that took a man off low on the screen;
                               the trays: absences cancelled and men marked absent one after another, a double
                               tap one man, another kind of control under the finger held for 700ms as before
    tests/sitecard.test.mjs    v189: every count of every site and month equal to the reports' sheets and the
                               one-client file, a month on paper, the client's text, nothing written, the words
    tests/sitecard.browser.mjs v189 in Chromium: the button on each site's row, the dialog, a day and a man
                               leaving it, the text's three doors, 375 and 440, doubled text, the disk
    tests/account-view.test.mjs v189: the default reads each man over his own period - every weekly cell is
                               v186's week picked by hand and every fortnightly cell v186's default (v186's
                               bytes out of Git, both gate readings), a man's periods inside the fortnight
                               each shown, named or closed and never twice, the sheets against the cards, the
                               amber sentence word for word on an explicit range, a close closing the period
                               shown, the first morning of a week, a man a boundary cut short, every word
    tests/account-view.browser.mjs v189 in Chromium: the page as it opens, the one new button (44px, 16px, on
                               the glass at 320 and at doubled text), a tap on a weekly card and a real close
                               of exactly that week, the paper (a real PDF), the picture and the file
    tests/screens.mjs          v191, a helper: EVERY screen and dialog of the app as one list, each opened by
                               the app's own functions on a seeded record, on three phones (320x568 since the
                               review), and the ruler - every visible text node's computed size, weight,
                               line-height and contrast against the ground really painted under it, every
                               target's rectangle, what is off the side or cut, controls lying over each
                               other and words drawn past their control's edge
    tests/readability.audit.mjs v191, not a suite: walks that list and writes the audit down
                               (node tests/readability.audit.mjs out.md [--large] [--tree <dir>])
    tests/largetext.test.mjs   v191 in Node: the row's words, exactly '1' is on and everything else is off, the
                               class at load, one key and no other byte of the disk, not the record, the fence,
                               the cloud, a backup or the rescue file, and the stylesheet's promise read as
                               text (every selector under the class, screen only, no zoom, no scale, every
                               font-size: 0 of the three sheets said again; both scripts in the head)
    tests/largetext.browser.mjs v191 in Chromium, the same list of screens on three phones in both schemes: with
                               the mode ON nothing under 18px, nothing lighter than 500, 7:1, 52px targets (the
                               month's days 44x62), no two controls over each other, no words past their
                               control, no control smaller than without the mode, every dialog opening with
                               its title on the glass, no sideways scroll, nothing cut, the bars measured,
                               the seder's first station; with it OFF every screen read twice (css/large.css
                               served, and answered empty) and the same, the base's own sizes pinned, and the
                               app's own floors (4.5:1, 44px, 16px) on every screen in both schemes; the
                               switch, a reload, the class in the first frame painted, the switch under the
                               finger, two windows, the migration's questions opened twice; the text doubled
                               on top; the week on paper and the shared picture unmoved
    tests/reportnames.test.mjs v192: the closing preview word for word, js/ scanned for a word mixing Hebrew and
                               Arabic letters, every man in the group his cycle says and keyed for its colour, the
                               headings' text v190's, an explicit range, a cycle changed inside the period
    tests/reportnames.browser.mjs v192 in Chromium at 320, 375 and 440, both schemes and doubled text: the heading the
                               cycle's word in its colour and its dates on paper, in the picture and the file; the
                               name first, heaviest, 7:1, wrapped and never cut; the two colours told apart by every
                               eye and by no site's; the edges, «תצוגה מפורטת», each button's words inside it with
                               two groups and with three; the preview typed into
    tests/holiday.test.mjs     v194: «הכל חופש» behind «עוד ⋯» on devices - every word, the question naming each
                               man it will mark and nobody else, the menu and the question holding the day they
                               named, the record confirmed equal to v190's bytes out of Git, ↶ as one step
    tests/holiday.browser.mjs  v194 in Chromium with touch: no control outside a dialog says «הכל חופש» on 2,560
                               swept days, the menu's and the question's rectangles, holds and focus, a double
                               tap never confirming, twice the text size, nothing leaking to another screen
    tests/undo-stale.test.mjs  v194: two phones and the harness's cloud - ↶ and ↷ refused over a record another
                               phone changed since, this phone's own step still going both ways, steps over
                               several men man by man, the three sentences word for word
    tests/pace.mjs             v194, a helper: a person's pace (330 ms between taps) for browser suites that
                               walk screens and are not about double taps; asserts nothing
    tests/owes.test.mjs        v195: the root cause pinned (the board says 2,000 while the next
                               sheet presumes 0), every figure of every row equal to its source function on
                               fixtures and seeded records (both cycles, closes with all, part and nothing,
                               a man who stopped, credit), both gate readings, the closures against the
                               closed period's own readers, the disk byte for byte, every word; the cost:
                               the plan counted in every state of the gate, the gate's short answer against
                               the gate, no reader asked twice, a draw of an unmoved record reading nothing,
                               fresh after six ways a record moves, «דוחות» with the board within 1.5x
    tests/owes.browser.mjs     v195 in Chromium at 320, 375 and 440, both schemes, doubled text and the large
                               display: the board on top of «מקדמות», «שים לב» on both pages, the button
                               landing on the man and the period with the disk unmoved, the closures and
                               the text's doors through recorders, the floors measured; «דוחות» not waiting
                               for the row: read once after a frame, its place empty meanwhile, the sheet
                               not moving, the figures after a real write the record's
    tests/owes.seed.mjs        a helper: the crew with money on it that the suite above opens on
    tests/reports.speed.test.mjs v196: one draw of the pay sheet asks the gate at most once (none on an
                               approved record) and no figure moved - every node of «דוחות» over seven ranges,
                               the workbook, the statements, the days and closing dialogs, «מקדמות», the cards,
                               the payslips and the month equal to v195's pay sheet (b48ac44, out of Git) on
                               seeded records under three readings of the gate; the questions counted per way
                               in; fresh after every kind of write; a draw under one question of the gate
    tests/oracle.test.mjs      the money worked out twice: tests/oracle.mjs, a second calculator written from
                               the documented rules and importing nothing from js/, against the app on 240
                               seeded records - pay at the stamped rate, both pay cycles, the invoice with
                               Rima, advances, carry, corrections, closed periods - plus hand-computed
                               fixtures and thirteen in-memory mutants that must each go red; nothing is
                               left out of the comparison since v180 (the two findings: tests/overpayment.test.mjs)
    tests/serve.mjs, serve.py  static servers for the suites (?slow=N on the python one)
    tests/shot.mjs             a screenshot; asserts nothing
    tests/embedded.html        the app inside a sandboxed iframe
