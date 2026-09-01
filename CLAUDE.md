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
- **Script order is load-bearing.** `store.js` and `recovery.js` must precede
  `sync/sync.js`, which reads its outbox the moment it loads; `model/schema.js` must
  precede `state.js`, which calls `emptySchedule()` at definition time; the UI files
  come after the data layer. The order in `index.html` is the order.
- **Nothing off this origin sits between a person and their data.** The Firebase SDK is
  fetched after boot, never before the first render, and fails soft. SheetJS is not
  fetched at all any more: `vendor/xlsx-0.18.5.min.js` is in the service worker's shell,
  so the export works in a tunnel. Reaching the CSV fallback now means the build on that
  phone is incomplete, not that the signal is weak, and it says so.
- **The service worker (`sw.js`) serves everything cache-first**, the page included:
  a session runs one build, end to end. Data lives in `localStorage`, always through
  `Store`; sync is optional and off until `js/sync/firebase-config.js` is filled in.

## The iron laws

1. **The ledger is append-only and its writer gate stays closed.** `LEDGER_WRITES` in
   `js/model/ledger.js` is `false` and only a person who knows all three phones are
   past v79 may flip it. The boot-time mirror in `state.js` is the ONE sanctioned
   write; ledger entries are never edited, never deleted, and merged by union.
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

## Running it, and what green means

No build, no install: `python3 -m http.server` serves the app. For the tests:

    npm ci
    npm test                # the forty-two node suites; no browser, runs in a few minutes
    npm run test:all        # adds smoke, print, mobile, update, forms, recovery-browser,
                            #   handover, swrestart, swidentity
    npm run test:release    # the gate: test:all plus sendclaim and the emulator suites
    npm run test:emulator   # rules, the bootstrap's own rules, the production adapter's
                            #   CAS, the rollout, the cutover and two phones writing
                            #   money at once (needs Java)

Node 20 or 22 (`engines` says `>=20.11 <23`). The counts here are RE-MEASURED on this
branch and are not the core branch's: this build runs the same suites with both money
gates open, so several of them assert more.

**THIS BRANCH IS NOT MAIN.** `claude/farkad-ledger-enable-ready` is the build with
`LEDGER_WRITES` and `carryAdvances` both OPEN, so that what somebody eventually ships can
be run end to end before anybody commits to it. Merging it is the decision iron law 1
reserves for a person, and it is only theirs to make once all three phones are known to
be past v79 AND they have read every row of `planAdvanceCarry`. It carries its own build
stamp, because it is not the same bytes as the core branch's and two builds sharing a
cache name serve a mixture. It has always moved UP rather than sideways when the core
branch took a number, because it is built from that line and supersedes it.

Anything less than every check passing is a stop, not a warning. `npm test`
and `npm run test:release` are different gates and are reported separately; neither is
wrapped in anything that turns a nonzero exit into a success. A count carried over from
another commit is worse than no count: re-measure, or say you did not.

The browser suites need Playwright's Chromium once (`npm run browsers`), or point
`CHROME_PATH` at a browser that is already installed — see `tests/README.md` before
downloading anything. The emulator suites need Java and run through
`firebase emulators:exec`; they never touch the real project.

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
    js/model/schema.js         the v2 model, validators, field paths, payroll and invoice arithmetic; pure functions
    js/model/migrate.js        v1→v2; never guesses; ambiguous cells become decisions, not data
    js/model/ledger.js         the v80 advances ledger: entries, fold, closed gate, mirror migration, parity check;
                               the repayment and period-closure kinds, both behind the writer gate
    js/sync/sync.js            outbox/journal, flush, snapshot adoption, provenance, the restore transaction, the status line
    js/sync/firebase-adapter.js  the only file that knows Firebase exists; the one ES module
    js/sync/firebase-config.js   project config; empty means local-only
    js/ui/dom.js               el()/clear()/button(); textContent only — names are never markup; todayStr
    js/ui/bars.js              measures the fixed bars and the keyboard; publishes --nav-h, --day-actions-h, --topbar-h, --kb-h
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
    js/ui/share.js             the WhatsApp message, backups, snapshots, the four restore doors, exports
    js/ui/migration.js         the cells the migration refused to guess, put to a person
    js/ui/offline.js           SW registration, the update banner, midEdit(), checkForUpdate(); the other window's catch-up
    js/ui/install.js           the add-to-home-screen warning (iOS evicts browser-tab storage)
    js/ui/settings.js          the ⋯ panel: sync, backup, restores, version, device state, ledger parity
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
    tests/ledger.ingress.test.mjs malformed ledger data through every door: held aside, never coerced
    tests/money.concurrency.test.mjs two phones writing MONEY at once, through the production adapter
    tests/poison.test.mjs      a ledger id that would land on a prototype, through every writer
    tests/merge.test.mjs       what adopting somebody else's document takes off this one
    tests/contested.test.mjs   the write that lost a race, and every trigger that must not send it
    tests/receipt.test.mjs     a receipt names the operation, not just the revision it reached
    tests/bootstrap.rules.test.mjs the server's own answer to a bootstrap carrying business data
    tests/serve.mjs, serve.py  static servers for the suites (?slow=N on the python one)
    tests/shot.mjs             a screenshot; asserts nothing
    tests/embedded.html        the app inside a sandboxed iframe
