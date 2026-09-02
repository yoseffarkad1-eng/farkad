# The suites

Fifty-nine suites, forty-three of which need no browser at all. (Counted off
package.json, which is the only place a suite count is true: `npm test` names the node
suites, `test:all` adds the nine browser suites, `test:release` adds sendclaim and the
six emulator suites.) From a clean clone:

    npm ci
    npm test                # the DEVELOPMENT gate: node suites, no browser, run before every commit
    npm run test:all        # adds smoke, print, mobile, update, forms, recovery-browser,
                            #   handover, swrestart, swidentity
    npm run test:release    # the RELEASE gate: test:all plus sendclaim and the emulator suites
    npm run test:emulator   # rules, the adapter's CAS, the rollout, the cutover, and two
                            #   phones writing money at once (needs Java)

`npm test` and `npm run test:all` are DEVELOPMENT gates. Neither one is permission to
ship, and a green run of either must never be reported as a release gate.

`npm run test:release` is the release gate. It adds `test:sendclaim` and the six
emulator suites, and at the commit this line was written it is GREEN.

It was not. This paragraph used to say the gate was red on purpose: `test:sendclaim`
stood at 41 of 66, and the 25 failures were committed reproductions of the ordering
defects — a backgrounded owner losing the send claim while its request was still open,
another tab sending while the first request might still land, the cloud keeping the
value that was corrected, a whole-document restore leaving after ownership moved. They
were evidence, and the note said they would stay red until the ordering protocol that
fixes them existed.

That protocol exists — `protocol`/`revision`/`lastOpId`, immutable receipts,
conflict-carries-the-document, rebase-if-uncontested and hold-if-contested; see
`docs/sync-protocol.md`. The suite was rewritten around it rather than weakened, and
none of the reproductions was closed by softening what it asserts. It is 43 checks and
all 43 pass. `npm run test:sendclaim` still runs it directly and still exits non-zero on
any failure; nothing anywhere may catch that exit code and print success.

A green sendclaim is not the same as a green protocol. The client half is measured in
`tests/cas.test.mjs` against the harness, and a harness-only green would prove only that
the harness and the client agree with each other — so the PRODUCTION adapter is measured
against the real Firestore emulator in `tests/cas.emulator.test.mjs`, and the rollout
that has to publish it in `tests/rollout.test.mjs`. Both are in `test:release`. A manual
emulator run on the side is not the gate.

Any single suite runs on its own: `npm run test:build`, `node tests/data.test.mjs`,
and so on — each file's header says exactly how to invoke it and why it exists.
Node 20 or 22 (`engines` in package.json).

Green means EVERY check passes. The runner prints `N/N checks passed` and exits
non-zero on any failure; a `SETUP FAILED` from `given()` means a precondition of the
test broke, not the app — fix the setup before reading anything into the run.

MEASURED, and each number names the commit it was measured on, because a count that
does not is a count from some other tree:

    At V100_SHA (v100: the holds nobody disagreed about - one arithmetic for a closure's
    writer and its judge, a clock that is behind refusing rather than moving money
    quietly, the same-fact rule asked at every gate that can hold a write, every name in
    the day message isolated, and the week strip showing where it is cut off), a clean
    detached worktree at that commit, Node v22.22.2, git diff --check clean, copied from
    no other run - BOTH GATES, run separately, on the tree that carries v99 as well:
V100_COUNTS
    No suite was added by either round, so the counts stay 43 and 59.
    The storm suite beside it: ten serial runs against the real emulator on an idle
    machine, 50/50 every one. Two earlier attempts came back 43/50 and 46/50 and were
    self-inflicted - two loops running the suite at once share the emulator that
    `firebase emulators:exec` binds from firebase.json, and reseed() wipes the shared
    document, so each run was deleting the other's record. Passing --config with a private
    port does NOT fix it: the websocket port is not read from that config and still
    collides. Run them serially.
    Per suite and verbatim: features/false-holds/handoff.md.

    At 55bfa00 (v99: the bottom bars come back - a keyboard needs a focused editable - and
    the ⋯ panel names the sync failure's reason), the cd-work worktree, clean at that commit,
    Node v22.22.2, .gate-release.log there, copied from no other run - the WHOLE release gate:
    npm test           43 suites   4336/4336   (status 33: four pins added)
    npm run test:all   + 9 suites  + 2106      (smoke 1130, print 78, mobile 721, update 30, forms-browser 10, recovery-browser 25, handover 26, swrestart 31, swidentity 55)
    test:release       + 7 suites  + 244      (sendclaim 43; rules 59, cas.emulator 24, rollout 17, bootstrap.emulator 23, bootstrap.rules 28, money.concurrency 50)
    the whole gate     59 suites   6686/6686   exit 0
    Per suite and verbatim: features/bars-reason/handoff.md.

    At 1e3f092 (v98: the storm closed - a ledger entry is its own JSON round-trip - the
    frozen hours, and the by-site grid's short dates), the cd-work worktree, clean at that
    commit, Node v22.22.2, .gate-release.log there, copied from no other run - the WHOLE
    release gate:
    npm test           43 suites   4332/4332   (closure-echo 79 is new; closure 103)
    npm run test:all   + 9 suites  + 2088      (smoke 1124, print 78, mobile 709, update 30, forms-browser 10, recovery-browser 25, handover 26, swrestart 31, swidentity 55)
    test:release       + 7 suites  + 244      (sendclaim 43; rules 59, cas.emulator 24, rollout 17, bootstrap.emulator 23, bootstrap.rules 28, money.concurrency 50)
    the whole gate     59 suites   6664/6664   exit 0
    The storm suite beside it, on the fix commit b306931: twelve shipped runs and three
    forced-order runs, all 50/50 (features/storm/handoff.md).
    Per suite and verbatim: features/storm/handoff.md.

    At f718367 (v97: the first iPhone round - the print fallback and the picture, the
    Saturday step, touch-action, the chip, the export path told the truth, ranges from
    left to right, the worker modal, the by-site print), the cd-work worktree, clean at
    that commit, Node v22.22.2, .gate-release-2.log there, copied from no other run - the
    WHOLE release gate, SECOND run:
    npm test           42 suites   4243/4243
    npm run test:all   + 9 suites  + 2083      (smoke 1121, print 76, mobile 709, update 30, forms-browser 10, recovery-browser 25, handover 26, swrestart 31, swidentity 55)
    test:release       + 7 suites  + 244      (sendclaim 43; rules 59, cas.emulator 24, rollout 17, bootstrap.emulator 23, bootstrap.rules 28, money.concurrency 50)
    the whole gate     58 suites   6570/6570   exit 0
    The FIRST run of the same gate on the same commit (.gate-release.log, kept as
    gate-v97-run1 beside the handoff's evidence) was 6563/6570: money.concurrency 43/50,
    all seven in «an interleaved storm»; nine isolated runs of that suite (six on this
    commit, three on 71ed815) were 50/50. Named in features/iphone/handoff.md; the hunt
    for the interleaving is the first follow-up.
    Per suite and verbatim: features/iphone/handoff.md.

    At 40d5004 (v96: the ledger merge, the week grid at its pitch, the four review notes
    folded, the stamps), the cd-work worktree, clean at that commit, Node v22.22.2,
    .gate-release.log there, copied from no other run - the WHOLE release gate:
    npm test           42 suites   4228/4228   (closure 95: one suite added, a pin;
                                                every other suite the f0cca08 number)
    npm run test:all   + 9 suites  + 1969      (smoke 1047, print 70, mobile 675, update 30,
                                                forms 10, recovery-browser 25, handover 26,
                                                swrestart 31, swidentity 55)
    test:release       + 7 suites  + 244       (sendclaim 43; rules 59, cas-emulator 24,
                                                rollout 17, bootstrap-emulator 23,
                                                bootstrap-rules 28, money-concurrency 50)
    the whole gate     58 suites   6441/6441   exit 0
    Per suite and verbatim: features/ledger/handoff.md.

    At f0cca08 (the ledger merge onto v95, both money gates CLOSED), from the v96-gate
    worktree, detached, Node v22.22.2, .gate.log in that worktree, copied from no other run:
    npm test           42 suites   4225/4225
      isolation 18, blobs 11, build 29, poison 37, merge 28, contested 73, receipt 28,
      data 1944, recovery 75, adversarial 116, probes 35, capacity 44, concurrency 46,
      exports 68, fence 35, fence-ingress 43, fence-legacy 21, money-history 9,
      money-units 21, money-cloud 17, money-display 4, snapshot-poison 82, samefact 24,
      wording 36, closure 92, correction 33, quarantine 82, approval 72, repayment 240,
      ledger-ingress 151, cas 88, status 29, money 40, money-ingress 206, method 51,
      restore 51, upgrade 48, vehicles 61, xlsx 59, nonassertions 23, labels 23,
      labelcache 32
    browser, four of nine:        smoke 1047, mobile 671, print 70, forms 10 - all green
    NOT run on this tree: update, recovery-browser, handover, swrestart, swidentity,
      sendclaim, and the six emulator suites (money-concurrency among them). Until they
      are, this tree's release gate is unmeasured, not green.
    At d9fcdb1, the merge commit itself with both gates still OPEN as the ledger branch
      left them: npm test 42 suites 4225/4225, the same number in every suite - the
      gate close that followed moved two pins in data and changed no count.

    At 10a40a5 (v93), from the fix/docs worktree, Node v22.22.2, copied from no other run:
    npm test           36 suites   3493/3493
      isolation 18, blobs 11, build 29, poison 37, merge 22, contested 54, receipt 18,
      data 1943, recovery 47, adversarial 116, probes 35, capacity 44, concurrency 46,
      exports 42, fence 35, fence-ingress 43, fence-legacy 21, money-history 9,
      money-units 21, money-cloud 17, money-display 4, snapshot-poison 33, repayment 45,
      ledger-ingress 151, cas 58, status 14, money 40, money-ingress 206, method 51,
      restore 42, upgrade 48, vehicles 61, xlsx 54, nonassertions 23, labels 23,
      labelcache 32
    test:sendclaim      1 suite     43/43
    data.test.mjs at seeds 1, 42 and 2026: 1943/1943 every time

    At 9f11abf (v94), the whole release gate from the farkad-work worktree, Node v22.22.2,
    .gate-release.log in that worktree, exit 0 - the only run of all fifty on one tree
    since cf8b9e5:
    npm test           36 suites   3602/3602
      isolation 18, blobs 11, build 29, poison 37, merge 28, contested 73, receipt 28,
      data 1943, recovery 64, adversarial 116, probes 35, capacity 44, concurrency 46,
      exports 42, fence 35, fence-ingress 43, fence-legacy 21, money-history 9,
      money-units 21, money-cloud 17, money-display 4, snapshot-poison 64, repayment 45,
      ledger-ingress 151, cas 68, status 21, money 40, money-ingress 206, method 51,
      restore 51, upgrade 48, vehicles 61, xlsx 54, nonassertions 23, labels 23,
      labelcache 32
    npm run test:all   + 8 suites  + 1944   (smoke 1041, print 65, mobile 671,
                                             update 30, recovery-browser 25,
                                             handover 26, swrestart 31, swidentity 55)
    test:release       + 6 suites  + 194    (sendclaim 43, rules 59, cas-emulator 24,
                                             rollout 17, bootstrap 23,
                                             bootstrap-rules 28)
    ------------------------------------------------------------------
    the whole gate     50 suites   5740/5740
    The seven round-two findings (features/core-repairs/findings-round2.md) are live in
    this count; their fixes are measured where they land.

    At c744d49, from a clean detached worktree, Node v22.22.2:
    npm test           36 suites   3493/3493
    test:emulator       5 suites    151/151   (rules, cas-emulator, rollout, bootstrap,
                                               bootstrap-rules)

    At cf8b9e5 (v91), from a clean detached worktree - written down in 2f6b6dc; v93
    re-pinned smoke and mobile between this run and the one at 9f11abf, so these are
    neither v93's nor v94's numbers:
    npm test           35 suites   3429/3429
    npm run test:all   + 8 suites  + 1893   (smoke 1030, print 65, mobile 631,
                                             update 30, recovery-browser 25,
                                             handover 26, swrestart 31, swidentity 55)
    test:release       + 6 suites  + 194    (sendclaim 43, rules 59, cas-emulator 24,
                                             rollout 17, bootstrap 23,
                                             bootstrap-rules 28)
    ------------------------------------------------------------------
    the whole gate     49 suites   5516/5516

The 36th node suite, `tests/snapshot.poison.test.mjs`, arrived after cf8b9e5 with the
poisoned-name repair; the gate at 10a40a5 is 50 suites, and its browser and emulator
halves have not been run on that tree - the first tree they ran on after cf8b9e5 is
9f11abf, above.

The ledger merge adds eight more: six node suites (`approval`, `quarantine`,
`correction`, `closure`, `wording`, `samefact`), one browser suite (`forms`) and one
emulator suite (`money-concurrency`). Seven of them are in the f0cca08 block above;
`money-concurrency` needs the emulator and has not been run on this tree.

The counts grow with every guarantee, and a count taken from a different commit is
worse than no count at all — trust a run, not a prose number. The release-time numbers
per build are recorded in `docs/releases.md`. (The count in the root README predates
several waves of tests and is stale.)

## What each suite proves

| suite | file | proves |
|---|---|---|
| build | `build.test.mjs` | The build agrees with itself: the three version stamps (index.html meta, `APP_VERSION`, sw cache name) are one build; every asset the page or the runtime loads is in the service-worker shell; every shell entry exists; no cache is ever opened or searched across versions; a half-fetched install throws instead of activating. Pure file reads — no browser, no server. |
| data | `data.test.mjs` | Storage, sync, and the arithmetic that turns days into money. Every "device" is a V8 context with its own localStorage running the real app files; two devices side by side are two phones, and a close-and-reopen is carrying one device's storage into a fresh context. This is where the multi-device, multi-session failures live — offline edits, snapshot adoption, the restore transaction, provenance, the ledger mirror — none of which a browser test can reach deterministically. |
| smoke | `smoke.mjs` | The app in a real Chromium: boot, every screen, the dialogs, the service worker, the things only a real DOM can betray. Serves the app itself (`serve.mjs`) because a service worker does not register over `file://`. |
| print | `print.test.mjs` | What lands on paper. Half of it opens every overlay and inspects PRINT-media boxes; the other half prints a real multi-page PDF and READS it back (`pdf.mjs`) — page by page, fill by fill — because "the modal's computed display is none" is a claim about a stylesheet, not a page. |
| mobile | `mobile.test.mjs` | The phone, measured: facts about rectangles at four widths, portrait and landscape, both color schemes, with and without a home indicator, at doubled text size. 44px targets in both dimensions, bars cleared, no sideways scroll. Headless Chromium is the right tool for layout arithmetic and it is NOT an iPhone — nothing here is coverage of a real device, and the suite's header says so. |
| update | `update.test.mjs` | The road every fix travels: a served copy of the app has its three version stamps rewritten while a browser sits on the old build — which is what a deploy is — and the suite walks the banner, the handover, the re-offer after a restart, the mid-typing wait, and the manual check. Nothing stubbed. |
| recovery | `recovery.test.mjs` | What the app does with a record it cannot read: quarantine, the raw snapshot, and the export that is the only thing left when a phone will not open. Nothing unreadable is deleted, overwritten, or treated as empty. |
| adversarial | `adversarial.test.mjs` | The twenty-item matrix a correctness pass was written against: a hidden loser that must never resurrect, legacy operations converging, restore fencing, the mutation fence under an export, and the vehicle feature's future contract. |
| probes | `probes.test.mjs` | Two tabs of one app on one disk, interleaved at the write. Whoever loses a race loses it durably, and neither tab ever reports work it did not do. |
| capacity | `capacity.test.mjs` | A season of days on a disk that fills up, and a restore over the queue an older build left behind. |
| concurrency | `concurrency.test.mjs` | The cross-tab hazards named C1-C5: retirement by operation and not by path, an acknowledgement one tab wrote and the other reads, the right to send against a restore, the ABA fence, and a removal the disk refused. |
| exports | `exports.test.mjs` | The three files that leave the phone, read back off the browser: the pay sheet, the invoice sheet, the detail sheet, and the message a worker himself receives. |
| fence | `fence.test.mjs` | The write counter that lets a rescue file claim its readings were one moment - what moves it, what must not, and what it costs per edit. |
| method | `method.test.mjs` | How an advance was handed over, through all four doors and the ledger mirror, the fold and the overlay. |
| money | `money.test.mjs` | The same literal shekels on the far side of four real doors: a reopen, a second phone, an export, and a restore. |
| nonassertions | `nonassertions.test.mjs` | A test that fails when a test stops testing: every assertion in `tests/` is scanned for the shapes that cannot fail, and the scanner is itself proved against written offenders and written near-misses. |
| restore | `restore.test.mjs` | A device holding only part of a restore is caught, subtree by subtree, and a frozen v71 companion is bound to the primary it belongs to. |
| upgrade | `upgrade.test.mjs` | A v86 disk opened by this build: the retired identity scheme's marks, a restore over an older queue, a v71 companion, and an undo entry that cannot speak for the questions it left. |
| vehicles | `vehicles.test.mjs` | The retired feature, from both sides: nothing writes a vehicle record while the flag is off, and with the gate open the arithmetic that was argued over is still there. |
| xlsx | `xlsx.test.mjs` | The same arithmetic proved through a real `.xlsx`, read back out of the zip. Needs the `xlsx` devDependency, pinned at the version the app loads from the CDN. |
| recovery-browser | `recovery.browser.mjs` | The rescue export driven through the real button in a real Chromium, with the actual Blob captured off `URL.createObjectURL`. |
| handover | `handover.test.mjs` | The v86 -> v87 handover between two REAL trees - a released commit and the working tree - one origin serving whichever it is pointed at. Every assertion is a SHA-256 of bytes a browser actually holds or an answer from a production function. It does not run while both trees carry the same build, and says so rather than pretending. |
| rules | `rules.test.mjs` | The real `firestore.rules` against the Firestore emulator. The web config is public by design, so these rules are the only thing between the schedule and anyone with the URL. Never touches the real project. |
| cas-emulator | `cas.emulator.test.mjs` | The PRODUCTION adapter's write path against the real emulator, not the harness: a conflict carries the authoritative document, disjoint field edits still merge, a receipt makes a retry idempotent, and the harness and the adapter refuse in the same shape. The client half alone is `cas.test.mjs`; a green harness-only run would prove only that the harness and the client agree with each other. |
| bootstrap | `bootstrap.emulator.test.mjs` | THE CUTOVER, through the production write path. The real js/sync/sync.js against the real js/sync/firebase-adapter.js against the emulator, asking what `rollout` and `cas.emulator` fall between: the live document is legacy and holds a day another phone corrected, and this phone has an older value for that same day in its outbox. Before it, the queued value won at revision 1 with nothing refused and nothing said. Five scenarios: the reproduction, the bootstrap touching five fields and no other, a disjoint edit still merging, two phones racing to exactly one revision-1 receipt, and process death mid-flight. |
| money-concurrency | `money.concurrency.test.mjs` | TWO PHONES WRITING MONEY AT ONCE, through the production write path. Two devices, each with the real js/sync/sync.js talking to the real js/sync/firebase-adapter.js against the emulator, both recording against one man's advance at the same moment. tests/concurrency.test.mjs races two tabs over one disk and tests/repayment.test.mjs merges two in-memory copies by hand; neither is two phones. Seven races - two repayments, two that over-settle, a repayment against the closure, two closures, two corrections, the migration approval against a day, and a close-and-reopen on the phone that lost - each asking the same three things: every immutable event survives, an over-settled advance is surfaced rather than clamped, and both phones end up holding the same record. It found the dropped migration approval, the sync layer's blindness to `ledger.migrations.<id>`, and the honest closure a late repayment turned into a lie. |
| approval | `approval.test.mjs` | No surface may read the new arithmetic before somebody approves the migration. With both gates opened by the test seam and a record whose migration is needed and unapproved, the sheet, the statement, the message and the archive warning keep the legacy answer - 3,050 earned, 5,000 handed over, -1,950 on the sheet - and one durable approval moves every one of them at once, arriving at the other phones through the record, never through a preference. |
| quarantine | `quarantine.test.mjs` | A damaged APPROVAL, through every door a record arrives by. Held aside under its own map, never coerced into "nobody approved" or "approved", the gate shut while it stands, the person told, the bytes kept - and the rescue file carrying them rather than the empty object it used to. |
| correction | `correction.test.mjs` | A correction undoes a transaction - all of it, or none of it - and is dated on the transaction it corrects. A partial correction stranded the rest for ever under an id nothing could reach, and it is the writer, not the form, that refuses it. |
| closure | `closure.test.mjs` | The frozen fortnight: what a closure records (the wage it closed on, the opening balance, the counts and the days it was paid for), what it refuses (a closure that cannot be true against the record), and who may have one (every man, debt or no debt). A payslip somebody was handed prints the same numbers after a historical day moves. |
| closure-echo | `closure.echo.test.mjs` | A ledger entry is the same fact as its own wire copy, and the phone that closed a fortnight is not held when its own closure comes back to it beside another phone's write. Found by the emulator storm going red once inside a release gate: closureFacts built day entries with own keys holding `undefined`, the top-level strip in appendLedgerEntry never reached them, and sameLedgerBytes rendered `"rate":undefined` - so the closer held one id with "two bodies", its own, and was blocked by Recovery until a reopen that never ran the mirror. Every writer's entry against its JSON round-trip through both comparators; the storm with the closure landing FIRST, against the fake cloud so the order is told rather than raced; and the usual order still converging. |
| wording | `wording.test.mjs` | Every figure called what it is: the third money column is headed by what it holds - מקדמות until the migration is approved, נוכה מהשכר after - on the screen, in the CSV and in the workbook alike; the statement's opening balance is יתרת פתיחה, not an advance; and an overpaid account stops the automatic deduction and says so instead of printing a quiet zero. |
| samefact | `samefact.test.mjs` | One fact written by two phones - the same approval, the same closure, the same correction, under one deterministic id with two names on it - is one fact: dropped from the second write as already done, kept by the merge as one body, never a conflict held for ever. |
| forms | `forms.browser.mjs` | The advance and correction forms, driven by real clicks in real Chromium: open the history, press תיקון, type a reason, press שמור, read the record. A ReferenceError in a save handler is invisible to every node suite, and this is where one shipped from. |
| status | `status.test.mjs` | What the line is ALLOWED to say. Asserts transitions rather than final states, because a claim made and withdrawn is invisible to a final-state check and that claim is the defect: it wraps setStatus and records what was asked for, what was said, and what was owed at that moment. A queue larger than one write, a restore the cloud will not take, a record Recovery could not read, and a close-and-reopen. |
| rollout | `rollout.test.mjs` | Publishing the rules, from a GENUINE legacy document — roster, days and an advance, no `protocol`, no `revision`, no receipt. The first protocol write preserves every legacy byte; a bootstrap without its receipt is refused; two phones racing produce exactly one bootstrap and the loser rebases; the exception is one write wide; an un-updated phone works before cutover and is refused after; and a missing document is a different road from a legacy one. |
| ledger-ingress | `ledger.ingress.test.mjs` | Thirteen shapes of malformed ledger data through every door — boot, load, cloud snapshot, restore, JSON import, raw recovery, migration, full replacement. Each is named by the check that catches it, held aside rather than folded, never normalised or coerced to zero; the record still opens, the bytes are kept, the person is told, writes are blocked, and the rescue export still carries the bytes. |
| repayment | `repayment.test.mjs` | The advance that outlives its fortnight: the carry, dated cash repayments, the two labels that never swap, the reversal that compensates instead of deleting, the surplus that is named rather than clamped, and the closure that is identified by the period it closes. |
| poison | `poison.test.mjs` | A ledger id that would land on a prototype — `__proto__`, `prototype`, `constructor` — through every door and every writer. The fixtures are built with `JSON.parse` so the key is a real own property and not a setter; the entry is refused before memory, disk or outbox move; a raw entry is judged before it is normalised; an entry whose `id` disagrees with its map key is not silently re-pointed; and nothing reparents the map it was aimed at. |
| merge | `merge.test.mjs` | What adopting somebody else's document takes off this one. All four append-only families survive a snapshot that has never heard of them, so do parts of the container this build does not name; existence is asked with an own-key check, so an entry legitimately named `toString` is not dropped; and one immutable id arriving with two different bodies is a disagreement a person is told about, not a winner picked at random. Driven through `Sync.receive()`, a commit and a reopen — not through the helper. |
| contested | `contested.test.mjs` | The write that lost a race, and every trigger that must not resend it: the winner's snapshot, the retry timer, `scheduleFlush()`, `flush()`, coming back online, a recreated adapter, and a close-and-reopen. The losing bytes stay durable and still owed, the cloud keeps the winner's value, the line never says synced, an unrelated edit in its own batch still leaves the phone, and the way out is a fresh explicit edit by a person. |
| receipt | `receipt.test.mjs` | A receipt names the OPERATION, not just the revision it reached. The schedule and its receipt carry the same fingerprint; an honest replay of identical bytes is still answered from the receipt; a request wearing a landed operation's name while doing something else is refused as `receipt-mismatch`, never acknowledged and never pruned; and a batch's own name changes when its value changes. |
| bootstrap-rules | `bootstrap.rules.test.mjs` | The SERVER's answer to a bootstrap that carries business data. Nineteen smuggling attempts — days, advances, ledger entries, workers, places, roster, `schemaVersion`, unknown fields, each alone and in combination — against the local emulator, plus the acceptance list of what a bootstrap may legitimately touch. Every row reports: the helper returns a verdict rather than throwing, so one refusal does not hide the eighteen behind it. |

`shot.mjs` is not a suite: it takes one screenshot and asserts nothing, for the
question the suites cannot answer — whether the screen is worth looking at.
`embedded.html` hosts the app in a sandboxed iframe; `serve.py` is a threaded server
whose `?slow=N` holds a response N seconds, for testing stuck-network behavior.

## The harness idiom (`harness.mjs`)

The app is classic scripts sharing one global scope, so the data suite gives it the
scope it expects instead of importing anything:

    import { makeDevice, makeCloud, settle, deferred } from './harness.mjs';

    const phone = makeDevice();                      // a fresh V8 context + localStorage
    phone.State.load();
    phone.call('assignPlace', phone.State.schedule, '2026-08-12', 'w_01', 'actual', 'p_01');

    const reopened = makeDevice({ storage: phone.dump() });   // "close the app, open it again"

`dump()` is the storage a session leaves behind; handing it to a new `makeDevice` IS
the reopen — three page lifetimes and two devices become something a test can simply
say. Reach globals through `device.call(name, ...)` / `device.global(name)`: top-level
`const` in a classic script creates a binding, not a `window` property, so the sandbox
object does not carry them. (The harness's own file-list comment says it mirrors
index.html's order; it actually loads `dates.js`/`dom.js` first and `state.js` before
`sync/sync.js` — both orders satisfy the real definition-time dependencies, and the
code is the one to trust.)

The rest of the kit, each modelled on a measured failure:

- `makeCloud()` — a fake Firestore that is faithful where it hurts: `update` rejects
  `not-found`, a null written by field path is STORED, not deleted (a kinder fake once
  reported a live resurrection bug as fixed), snapshots arrive asynchronously, and
  `hold`/`reject` let a test keep a write open or refuse it.
- Fault switches on the device: `setQuota` (a full disk), `corruptOnWrite` (a disk
  that stores something else), `blockRemoval`/`throwOnRemove`, `putRaw` (stage a
  damaged record), `setToday` (pin the calendar).
- `settle()` waits out the sync debounce (tests set `FarkadSync.pushDelayMs` low);
  `deferred()` is a promise somebody else decides — how "an older write still open"
  is spelled.
- `FARKAD_SEED=42 npm run test:data` makes every random id reproducible, so a failure
  that took nine hundred writes to produce can be produced again. Without it the ids
  are genuinely random, on purpose.

## A passing test is the spec

The suites pin exact user-facing Hebrew strings (`'ברוך הבא'`, `'גרסה חדשה'`,
`'רענן עכשיו'`, dialog titles, the status line's every state), exact arithmetic, and
exact rectangles. Those strings are product decisions — argued over, not
placeholder copy — so a pinned string is a guarantee that the person on the phone
still sees the words that were decided on. When your change breaks such a check,
first ask whether you have broken the guarantee; change the pinned expectation only
when the new behavior is the point, in the same commit as the code, with the reason
in the message. A test loosened to make a run green is a guarantee deleted.

## Playwright notes

Read the header of `smoke.mjs` before fighting the browser suites. The short version:

- `playwright` is pinned to an EXACT version in package.json, not a range: the browser
  build it downloads is tied to the package version, and a range downloads a build
  other than the one on the machine — "Executable doesn't exist".
- On your own machine, `npm run browsers` (once) downloads the matching Chromium.
- On a machine that already ships a Chromium — a CI image, an agent sandbox — do NOT
  run `playwright install`; it is a large download that the environment may block or
  already have. Point the suites at what is there instead:

      CHROME_PATH=/usr/bin/chromium node tests/smoke.mjs
      PLAYWRIGHT_MODULE=/path/to/playwright node tests/smoke.mjs

- The browser suites serve the app themselves. To reuse a server you already have
  running: `SMOKE_URL=http://127.0.0.1:8802 node tests/smoke.mjs` (also honored by
  the print and mobile suites; `update.test.mjs` always serves its own deployable
  copy, because rewriting the deploy is the test).
