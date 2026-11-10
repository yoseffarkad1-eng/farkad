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
   **And so is the pay book (v173).** `schedule.pay` is one entry per id, created once,
   never rewritten, never removed, merged by union; a null or a changed body at
   `pay.<id>` is refused by the commit, by the queue and by the queue's reader, and two
   different bodies under one id are BOTH kept - the cloud's standing, the other under
   `payConflicted` - never chosen between. Since v175 a pay entry is written by ONE
   door, `FarkadSync.transactPaybook` (js/sync/transact.js): a server transaction of its
   own that also creates a create-once document under `closed/`, and «closed» means it
   committed and was read back. The ordinary queue never carries a pay path
   (`paybookQueue: false`; `State.commitPaybook` answers `server-first`). All of it is
   shut: `paybook: false` in `js/model/schema.js` opens on the owner's word, after the
   rules of this branch are published and every phone is on v175 or later
   (docs/payroll-closure.md, «The rollout order, measured») and after closed history
   has actually LEFT the one document. Since Phase 5 a SETTLED closure does: its entries
   leave the server's document for their closed copy and one row of `payIndex` stays
   (js/sync/closed.js) - never before the copy is confirmed by the server, inside the
   transaction that drops them. A PHONE'S RECORD KEEPS EVERY ENTRY: no fold reads the
   index, a server document that cannot be made whole is not adopted, and a
   whole-document write leaves out what a row stands for.
   **And the one-debt ruling moves with that gate (v175).** An advance from a period
   nobody closed stays a full debt until a person deducts it (the owner, 2026-11-10):
   `advanceDebtStays()` in `js/model/schema.js` is `FARKAD_FLAGS.paybook`, read in one
   place. With the gate shut the account walk is byte for byte what it was. A closed
   account's frozen figures are never recomputed under either rule.
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
are verified. Vehicles stay off. v119 enables owner-requested deletion of unused workers: shared names require completed protocol sync, work and financial history block deletion, and late work reinstates the identity as inactive. v120 permits canonical empty day placeholders to be removed in the same journal and cloud transaction as an unused worker. v166 adds the Rima count, `days.<date>.rima.<placeId>`: another company's men, counted per site, never named and never in pay, but billed to the client as one worker-site day each (owner's ruling, 2026-11-01); v145/v165 phones drop it from their own copy, so a whole-document restore must not be run from one of them (docs/releases.md, v166). THE ROLLOUT RULE there: every phone on v166 before the first Rima count is typed; until then no rescue file, backup, restore point or cloud copy is restored across builds, in either direction, no window of an older build stays open beside a v166 one, and client invoices come only from an updated phone. v167 adds the seder to each worker (js/ui/seder.js), entered from the WhatsApp dialog and from nowhere on the day screen: the men with a site that day, each opened in WhatsApp with his own message by the person's own tap - never sent by the app, and never marked "sent". It writes nothing to the record; its progress is a per-date preference in Store. Its Hebrew words are the owner's, approved 2026-11-07 and pinned word for word in tests/seder.test.mjs (docs/releases.md, v167). v169 is the one look (css/design.css, js/ui/icons.js): a restyle that moves no control, changes no label and touches no data path (docs/releases.md, v169). v171 adds הסעות (js/model/transport.js, js/ui/transport.js): who rides to work in which vehicle and a message to each driver, on a phone that turned it on in ⋯ and on no other - its own Store keys (farkadTransport:…), never the record, the outbox, the cloud, a backup or the rescue file, so a lost phone loses the plans; it reads the day through the seder's own list and never writes it; its Hebrew is proposed, not approved word by word, and pinned in tests/transport.test.mjs (docs/releases.md, v171; docs/transport-spec.md). It is not the retired vehicles feature and shares nothing with it. v174 rebuilds the הסעות screen as a picture, because the owner tried v171's four-tab planner and sent it back (2026-11-10: draw the car from above, write "add worker" on every seat, let him drag the men): ONE screen - a sticky tray of the men with a site and no seat, each vehicle drawn from above with the driver's seat on the LEFT (its own `dir="ltr"`; RTL must not mirror a car), seats as tiles in their real rows; a man is seated by a finger's drag (Pointer Events, never the HTML5 drag API; a waiting man lifts at once, a SEATED man only after a 300ms hold so that a swipe on a filled car scrolls and moves nobody), by touching him and then the seat, or by touching the seat and choosing; whoever is in seat 1 is the driver; every change is kept at once. Pickup areas, "may drive", suggest, locks, accept, versions and «סימנתי שנשלח» are REMOVED. A day written by v171/v172 opens as it is and is rewritten only by its first change, which drops its versions, locks, areas and «sent» marks; the store, the switch, the one entry and the isolation from the record are v171's, unchanged. Its Hebrew is proposed and pinned in tests/transport.test.mjs. THE DRAG HAS NEVER BEEN TRIED ON A REAL PHONE - only with emulated touch in Chromium (docs/releases.md, v174). v172 puts the ⋯ sheet in strict order: three sections of three cards, every card but ענן וסנכרון a row (`<details>`) that opens in place, גיבוי open and the rest shut at every opening, a row opening by itself only for the reasons listed in settingsFoldReasons (js/ui/settings.js) and never shut or opened by a redraw; no control, word or handler changed, and nothing about it is stored (docs/releases.md, v172). v173 (development branch, not served) stores and syncs the pay book - `schedule.pay`, js/model/payroll.js - and ships its writer shut (`paybook: false`): a phone keeps, merges, backs up and re-sends a pay entry it is handed and creates none; the gate stays shut until every phone is on v173, the server-first closure exists and closed history has left the one document, which a year of closures does not fit in (docs/releases.md, v173; docs/payroll-closure.md). v175 (development branch, not served; v174 is another branch's number) is Phase 3 of the same work, still shut: the owner's one-debt ruling behind the gate with `planDebtRuling` to read first; the server-first door (js/sync/transact.js) and the durable intent; protocol 2; and `firestore.rules` changed ON THE BRANCH ONLY - the pay map append-only on the server and `closed/` create-once, with docs/firestore.rules.before-paybook as the rollback artifact and nothing published. What is NOT built, and so why the gate still may not open: nothing leaves the live document yet, the days are still in it, and backups do not carry closed documents (docs/releases.md, v175; docs/payroll-closure.md). v176 (development branch, not served) is Phase 4, the pay book's SCREENS, still shut: js/ui/accounts.js draws the accounts home, the review page, the later payment, the group walk, the history and the first run inside the «מקדמות» tab's own page, computes no money (every figure is a plan's or a fold's), writes only through `FarkadSync.transactPaybook`, and is reached by nothing while `paybook` is false - js/ui/reports.js without its four guarded lines is main's file at v174 byte for byte, and tests/accounts.test.mjs holds it to that. The owner's own labels are verbatim (`ACC_OWNER`); every other string is proposed, in one block at the top of the file and pinned word for word. The gate has never been open outside a test, and it still may not be opened: everything Phase 3 left unbuilt still stands (docs/releases.md, v176; docs/payroll-closure.md). Test-only overrides are
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
    js/model/payroll.js        the pay book (v173), SHIPPED SHUT - loaded after model/ledger.js and above the
                               sync group; its writer is FARKAD_FLAGS.paybook, false. Worker accounts as a pure
                               model: the `pay.<id>` records (statement, extra deduction, payment, void,
                               adjustment, opening, legacy), their folds, the dry-run planners, and what the
                               storage calls - paybookUnion (who stands when two documents disagree),
                               layPaybookEntry, paybookCommitPlan. No DOM, no Store, no clock. v175: the
                               operation the server-first door sends and its closed document, the carry
                               approval as a code and a plan, and the split as a model - planHistoryMove (a
                               dry run), the index and its folds. What it still needs before the gate may
                               open, and the owner's open decisions, are in docs/payroll-closure.md
    js/sync/sync.js            the durable queue: outbox, journal, replay, receipts, provenance; the one accessor pair
    js/sync/restore.js         the whole-document restore, the ONE place allowed to write the whole document
    js/sync/receive.js         snapshot adoption, merge, the ordering protocol's client half, the poison doors
    js/sync/send.js            the flush, the send claim, the pre-send hold, the create race, the retry ladder
    js/sync/status.js          connect and listen; the one sentence the person reads; the banner
    js/sync/transact.js        v175, SHIPPED SHUT with the pay book: a closure, a payment or a void as ONE
                               server transaction with its create-once closed document - never the queue;
                               the durable intent (farkad:payIntent); a lost answer settled by reading the
                               receipt, never by sending again
    js/sync/closed.js          Phase 5, SHIPPED SHUT with the pay book: what has left the live document. The
                               gate at the top of receive() that lays an archived closure's entries back
                               (from this phone's record or its closed documents) or does NOT adopt; the
                               wrapper that strips them from a whole-document write; archiveClosed - copy,
                               read back, compare, drop - which keeps no state and continues from the server's
    js/sync/closed.js          Phase 5, SHIPPED SHUT with the pay book: what has left the live document. The
                               gate at the top of receive() that lays an archived closure's entries back
                               (from this phone's record or its closed documents) or does NOT adopt; the
                               wrapper that strips them from a whole-document write; archiveClosed - copy,
                               read back, compare, drop - which keeps no state and continues from the server's
    js/sync/closed.js          Phase 5, SHIPPED SHUT with the pay book: what has left the live document. The
                               gate at the top of receive() that lays an archived closure's entries back
                               (from this phone's record or its closed documents) or does NOT adopt; the
                               wrapper that strips them from a whole-document write; archiveClosed - copy,
                               read back, compare, drop - which keeps no state and continues from the server's
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
    js/ui/accounts.js          v176, SHIPPED SHUT with the pay book: the accounts home on the «מקדמות» tab, the
                               review page, the later payment, the group walk and its summary, the history
                               and statements, the first run. No money is computed here and nothing is
                               written but through FarkadSync.transactPaybook; every word in one block
                               (the owner's labels verbatim, the rest proposed); reached only through the
                               four guarded hooks in reports.js
    js/ui/share.js             the WhatsApp message and the CSV
    js/ui/seder.js             the seder to each worker (v167): the men with a site that day, each one's own
                               message, opened in WhatsApp one tap at a time; what was opened is kept per
                               date in Store (farkadSederProgress) - never the record, never synced, never in
                               a backup; every Hebrew word of it in one block, approved by the owner
                               on 2026-11-07 and pinned word for word in tests/seder.test.mjs
    js/ui/transport.js         הסעות, the screen and its store: off until this phone turns it on in ⋯; one
                               entry in the WhatsApp dialog; reads the day through sederCrew and never
                               writes it; keeps its plans and vehicles under farkadTransport:* through
                               Store - never the record, never synced, never in a backup. v174: ONE screen,
                               the cars drawn from above; "carrying a man" is the drag (pointer events, the
                               hold on a seated man, the tray slid by hand, the edge scroll); every Hebrew
                               word of it in one block (proposed, the owner corrects)
    js/ui/backup.js            snapshots, the backup file, the four restore doors, the rescue file
    js/ui/printout.js          the table as a PNG, read off the DOM, for the phone where window.print()
                               opens nothing: the 1.5s heuristic, the share sheet, the download
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
                               record not blocking the day, pruning, and the switch
    tests/transport.browser.mjs v174 in Chromium with a touch screen: REAL touch drags (chip to seat, to the
                               driver's seat, onto a taken seat, car to car, back to the tray, released
                               outside, cancelled, past the edge to a car off the screen), a swipe scrolling
                               and moving nobody, tap-then-tap, the chooser, a vehicle kept home, a man not
                               riding, the driver on the LEFT in an RTL page, 2-2-2-3, 56px seats at 375,
                               the link read and not followed, the record byte for byte. NOT a real phone
    tests/settings-order.browser.mjs v172 in Chromium: the three sections and nine cards by title, what is
                               open on opening and after reopening, a redraw and an adopted snapshot leaving
                               the rows alone, every self-opening reason, the v171 sheet's controls and
                               sentences found again one by one, the Tab trap, 56px rows on three phones,
                               doubled text
    tests/paybook.world.mjs    not a suite: the one crew the four pay book suites share
    tests/paybook.store.test.mjs v173, one phone: the shut gate (no writer, the reader whole), one journal batch
                               per closure and the same bytes after a reopen, journal-first both ways, a null
                               and a rewrite refused at three doors, a disagreement kept without stopping the
                               phone, an unreadable entry kept in place and held (law 10), poison, the backup
                               file / restore point / rescue file, and a year of closures weighed against
                               Firestore's 1 MiB
    tests/paybook.sync.test.mjs v173, two and three phones on the fake cloud: union, one fact from two phones,
                               the cloud's copy standing in a disagreement, the ledger's rule unweakened, lost
                               answers, a reload mid-flush, a restore that erases nothing - and a closure
                               measured NOT all-or-nothing on the wire
    tests/paybook.oldbuilds.test.mjs v167, v169 and v171 out of Git beside this build: what each does with `pay`,
                               and the rollout rule those measurements give
    tests/paybook.emulator.test.mjs the PUBLISHED rules (docs/firestore.rules.before-paybook, by name since
                               v175) against pay writes through the old queue door, and what they do not refuse
    tests/debt.ruling.test.mjs v175: the one-debt ruling on a build with the gate open beside one as shipped -
                               history, one answer on random records, an account closed out of order, frozen
                               closures untouched, and planDebtRuling writing nothing
    tests/paybook.transact.test.mjs v175, the server-first door on the fake cloud: one write with its closed
                               document, offline refused, stale, a double tap, a lost answer, a reload
                               mid-flight three ways, the queue never carrying a pay path, the carry approval
    tests/accounts.test.mjs    v176: every word of the screens pinned, every refusal code a sentence, no
                               money arithmetic and one door in the source, the suggestion the review page
                               pre-fills, and - gate shut - reports.js minus its hooks is main's at v174
    tests/accounts.browser.mjs v176 in Chromium, the gate opened through the test seam and the cloud played
                               (tests/accounts.cloud.mjs, tests/accounts.world.mjs): the owner's examples to
                               the shekel on the glass, a blank field refused on its row, offline writing
                               nothing, two taps one closure, a second phone's conflict, the walk and the
                               batch, history five ways, corrections, the first run, 44px/16px/200% text
    tests/paybook.archive.test.mjs Phase 5 on the fake cloud (which refuses what the rules refuse of a whole
                               document): the move, and the same money on five kinds of phone; never before
                               the copy is confirmed; a phone that cannot fetch adopts nothing; resumable;
                               a restore never erases a closure; what the backup and the rescue file say
    tests/paybook.archive.emulator.test.mjs the rules for what leaves, the production adapter's drop, and
                               v167/v171/v172 once an index exists (they may not write; their restore is refused)
    tests/archive.browser.mjs  Phase 5 in Chromium: «ארכיון סגירות» read and run, a phone that lacks the
                               detail, «מה לבדוק?», a draft across a reload, «נסגר» on the weekly breakdown
    tests/gate-open.preload.mjs an instrument, run by no gate: any existing browser suite with the pay book
                               open on every page (node --import ./tests/gate-open.preload.mjs tests/<suite>)
    tests/paybook.archive.test.mjs Phase 5 on the fake cloud (which refuses what the rules refuse of a whole
                               document): the move, and the same money on five kinds of phone; never before
                               the copy is confirmed; a phone that cannot fetch adopts nothing; resumable;
                               a restore never erases a closure; what the backup and the rescue file say
    tests/paybook.archive.emulator.test.mjs the rules for what leaves, the production adapter's drop, and
                               v167/v171/v172 once an index exists (they may not write; their restore is refused)
    tests/archive.browser.mjs  Phase 5 in Chromium: «ארכיון סגירות» read and run, a phone that lacks the
                               detail, «מה לבדוק?», a draft across a reload, «נסגר» on the weekly breakdown
    tests/gate-open.preload.mjs an instrument, run by no gate: any existing browser suite with the pay book
                               open on every page (node --import ./tests/gate-open.preload.mjs tests/<suite>)
    tests/paybook.archive.test.mjs Phase 5 on the fake cloud (which refuses what the rules refuse of a whole
                               document): the move, and the same money on five kinds of phone; never before
                               the copy is confirmed; a phone that cannot fetch adopts nothing; resumable;
                               a restore never erases a closure; what the backup and the rescue file say
    tests/paybook.archive.emulator.test.mjs the rules for what leaves, the production adapter's drop, and
                               v167/v171/v172 once an index exists (they may not write; their restore is refused)
    tests/archive.browser.mjs  Phase 5 in Chromium: «ארכיון סגירות» read and run, a phone that lacks the
                               detail, «מה לבדוק?», a draft across a reload, «נסגר» on the weekly breakdown
    tests/gate-open.preload.mjs an instrument, run by no gate: any existing browser suite with the pay book
                               open on every page (node --import ./tests/gate-open.preload.mjs tests/<suite>)
    tests/paybook.split.test.mjs v175, the split as a model: the closed document, lossless, the index folds
                               equal to the full folds on random records, planHistoryMove, and capacity for
                               20 men over 5 years with and without it
    tests/paybook.split.emulator.test.mjs the NEW rules and the production adapter: create-once, the pay map
                               that only grows, each half of the pair failing, two phones closing one account
                               at once, and v167/v171/v172 out of Git - the rollout order, derived
    tests/payroll.test.mjs     the accounts model, writer on through the test seam: Phase 0 pins what the app does TODAY (3,800 on the
                               fortnight row for a weekly man whose week 1 is closed; the same-Friday closure
                               hole; an advance from a never-closed period read two ways; a partial deduction
                               shutting the gate on an unapproved record); then the weekly and biweekly
                               accounts, the per-advance split, extra deductions, payment, group closure, two
                               devices, purity, every refusal code, each of the eight defaults flipped, the
                               migration report that writes nothing, and agreement with the old model on old data
    tests/serve.mjs, serve.py  static servers for the suites (?slow=N on the python one)
    tests/shot.mjs             a screenshot; asserts nothing
    tests/embedded.html        the app inside a sandboxed iframe
