# The suites

One hundred and twenty-three suite files, eighty-one of which need neither a browser nor the
emulator. (Counted off package.json, which is the only place a suite count is true:
`npm test` runs those eighty-one, `test:all` adds thirty-three more - the browser suites -
and `test:release` adds sendclaim and the eight emulator suites. The count in this
paragraph is re-counted whenever a suite is added and is true of nothing but the commit
it was written on - the one that added `polish.test.mjs` and `polish.browser.mjs`. The command summaries below it
were not re-counted then, and name fewer suites than the scripts run.) From a clean clone:

    npm ci
    npm test                # the DEVELOPMENT gate: node suites, no browser, run before every commit
    npm run test:all        # adds smoke, print, mobile, update, forms, reorder, boot,
                            #   recovery-browser, handover, swrestart, swidentity
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

`tests/rollout-matrix.test.mjs` is in `test:release` too, and it is the one suite here whose
output a DOCUMENT depends on. It measures eight cells — old and new client, against old and
new rules, on a legacy document and one that has entered the protocol — plus the two
rollback rows. `docs/rollout-checklist.md`, `docs/firebase-setup.md` and
`features/gate-flip/contract.md` state the order those cells produce; before this suite
existed the three of them disagreed, and one of them asked the operator for a state its own
rules forbid. Nothing fails today if somebody weakens `legacyWrite()` or
`bootstrapTouchesOnlyProtocol()` in `firestore.rules` — except this. It loads both rulesets
itself through `@firebase/rules-unit-testing`, so it does not care which one `firebase.json`
points at, and it runs on the repo's own config with no extra file.

Any single suite runs on its own: `npm run test:build`, `node tests/data.test.mjs`,
and so on — each file's header says exactly how to invoke it and why it exists.
Node 20 or 22 (`engines` in package.json).

Green means EVERY check passes. The runner prints `N/N checks passed` and exits
non-zero on any failure; a `SETUP FAILED` from `given()` means a precondition of the
test broke, not the app — fix the setup before reading anything into the run.

MEASURED, and each number names the commit it was measured on, because a count that
does not is a count from some other tree:

    At 1e20111 (v105: the held records shown with both sides in ⋯, and released by a person
    one row at a time), /home/user/v105-gate, a detached worktree clean at that commit, Node
    v22.22.2, .gate-release.log there, copied from no other run - the WHOLE release gate:
    npm test           44 suites   4457/4457   (held 73 is new; smoke gains 13)
    npm run test:all   + 9 suites  + 2204      (smoke 1142, print 78, mobile 807, update 30, forms-browser 10, recovery-browser 25, handover 26, swrestart 31, swidentity 55)
    test:release       + 7 suites  + 244      (sendclaim 43; rules 59, cas.emulator 24, rollout 17, bootstrap.emulator 23, bootstrap.rules 28, money.concurrency 50)
    the whole gate     60 suites   6905/6905   exit 0
    Per suite and verbatim: features/held/handoff.md.

    At 976a88b (v104: the production adapter hands the sync layer its bootstrap and its
    read - the cutover reaches the phone), the cd-work worktree, clean at that commit, Node
    v22.22.2, .gate-release.log there, copied from no other run - the WHOLE release gate:
    npm test           43 suites   4384/4384   (build 32: one suite added, three checks red on the base)
    npm run test:all   + 9 suites  + 2192      (smoke 1130, print 78, mobile 807, update 30, forms-browser 10, recovery-browser 25, handover 26, swrestart 31, swidentity 55)
    test:release       + 7 suites  + 244      (sendclaim 43; rules 59, cas.emulator 24, rollout 17, bootstrap.emulator 23, bootstrap.rules 28, money.concurrency 50)
    the whole gate     59 suites   6820/6820   exit 0
    Per suite and verbatim: features/cutover/handoff.md.

    At 6011430 (v103: the app put in order - the week's empty screen naming the next
    move, three button classes that meant nothing, the rules review, and the documents),
    a clean detached worktree at that commit, Node v22.22.2, git diff --check clean:
    npm test           43 suites   4381/4381   exit 0
    npm run test:release
                       59 suites   6817/6817   exit 0
                       (wording 37: one pin added - the week's empty state)
    Exactly ONE check more than v102 in each gate, and it is that pin. Everything else in
    the wave is a rename, a document, or a class that matched no rule - none of which the
    gate can see, which is the point of the wave rather than a gap in it.
    Per suite and verbatim: features/organization/handoff.md.

    At 21bd9ba (v102: the code put in order and NOTHING else - js/sync/sync.js split
    into six by concern, js/ui/share.js into two, js/model/schema.js into two, a table of
    contents on css/app.css, three dead functions removed), a clean detached worktree at
    that commit, Node v22.22.2, git diff --check clean, copied from no other run - BOTH
    GATES, run separately:
    npm test           43 suites   4380/4380   exit 0
    npm run test:release
                       59 suites   6816/6816   exit 0
                       (smoke 1130, print 78, mobile 807, update 30, forms-browser 10,
                       recovery-browser 25, handover 26, swrestart 31, swidentity 55,
                       sendclaim 43; rules 59, cas.emulator 24, rollout 17,
                       bootstrap.emulator 23, bootstrap.rules 28, money.concurrency 50)
    IDENTICAL to v101, check for check, and that is the point rather than a coincidence:
    not one check was added, removed or moved by a split. A refactor that changes what the
    gate says is a refactor that changed something.
    Two gates that did NOT finish, named so nobody reads a partial run as a result: one on
    the sync split at 3767569 came back EXIT=2 at 50 suites - a race in stopWorker, which
    read two sources of truth for one fact and waited on only one of them, since fixed -
    and three attempts across that session were killed by container restarts.
    Per suite and verbatim: features/code-order/handoff.md.

    At 991ced4 (v101: room on the day screen - the header compacts to one row past a
    scroll threshold and returns at the top, the switcher moves into it, and the site
    card's two footer buttons become icon buttons on its coloured head), a clean detached
    worktree at that commit, Node v22.22.2, git diff --check clean, copied from no other
    run - BOTH GATES, run separately:
    npm test           43 suites   4380/4380   exit 0
                       (unchanged from v100: this round touches no node suite)
    npm run test:release
                       59 suites   6816/6816   exit 0
                       (smoke 1130, print 78, mobile 807, update 30, forms-browser 10,
                       recovery-browser 25, handover 26, swrestart 31, swidentity 55,
                       sendclaim 43; rules 59, cas.emulator 24, rollout 17,
                       bootstrap.emulator 23, bootstrap.rules 28, money.concurrency 50)
    No suite was added or removed; the 55 checks over v100 are 21 new ones in
    tests/mobile.test.mjs plus that suite's existing per-width checks now running against
    a by-site view with one more button on every card.
    THREE earlier attempts at this gate were killed by container restarts, at 45, 11 and 5
    suites. None of their partial counts is recorded anywhere - a killed run is not a
    result, and a number carried out of one is exactly the borrowed count this file forbids.
    Per suite and verbatim: features/day-room/handoff.md.

    At 14eeb8d (v100: the holds nobody disagreed about - one arithmetic for a closure's
    writer and its judge, a clock that is behind refusing rather than moving money
    quietly, the same-fact rule asked at every gate that can hold a write, every name in
    the day message isolated, the week strip showing where it is cut off - plus the
    data-safety re-audit's five pairs: a closure frozen for its own period and no other, a
    deaf phone that stopped saying synced, a refused edit taken off the screen with nothing
    durable behind it, and the undo stack quarantined rather than written over), a clean
    detached worktree at that commit, Node v22.22.2, git diff --check clean, copied from
    no other run - BOTH GATES, run separately, on the tree that carries v99 as well:
    npm test           43 suites   4380/4380   exit 0
                       (closure 122, data 1949, status 37, samefact 37, exports 73,
                       smoke's node half unchanged)
    npm run test:release
                       59 suites   6761/6761   exit 0
                       (smoke 1130, print 78, mobile 752, update 30, forms-browser 10,
                       recovery-browser 25, handover 26, swrestart 31, swidentity 55,
                       sendclaim 43; rules 59, cas.emulator 24, rollout 17,
                       bootstrap.emulator 23, bootstrap.rules 28, money.concurrency 50)
    No suite was added or removed by either round, so the counts stay 43 and 59; the
    fourteen extra checks are the re-audit's pairs. An earlier pair of runs at 847560c -
    the same round before the re-audit - was 43/4366 and 59/6747, and is superseded.
    The storm suite beside it: ten serial runs against the real emulator on an idle
    machine, 50/50 every one, measured at 847560c; once more at 14eeb8d inside the release
    gate, 50/50. Two earlier attempts came back 43/50 and 46/50 and were
    self-inflicted - two loops running the suite at once share the emulator that
    `firebase emulators:exec` binds from firebase.json, and reseed() wipes the shared
    document, so each run was deleting the other's record.

    The sentence that used to stand here said passing --config with a private port "does
    NOT fix it: the websocket port is not read from that config and still collides". THAT
    REASON WAS WRONG, and a wrong reason is worse than none - it sends the next person to
    read firebase-tools instead of the six lines that were the whole problem. The websocket
    port IS read from a private config, as long as the config names it:

        firebase emulators:exec --only firestore --config firebase.alt.json "..."
          with { "firestore": { "port": 8099, "websocketPort": 9199 } }
        firestore: Firestore Emulator UI websocket is running on 9199.
        FIRESTORE_EMULATOR_HOST=127.0.0.1:8099

    measured while another emulator held 8080 and 9150. What actually collided was the
    hard-coded `host: '127.0.0.1', port: 8080` in all six emulator suites: each reached
    past the emulator started for it and found the other one, or nothing at all
    (`connect ECONNREFUSED 127.0.0.1:8080`).

    They now read it from tests/emulator-host.mjs, which answers out of
    FIRESTORE_EMULATOR_HOST - set by `firebase emulators:exec` for the script it runs - and
    falls back to 127.0.0.1:8080 when nothing says otherwise, so the plain
    `npm run test:emulator` is byte-for-byte the run it always was.

    SO THEY CAN NOW RUN IN PARALLEL, on private ports. Copy firebase.json, give it another
    `port` AND another `websocketPort`, and pass it with --config; the file name is
    gitignored as `firebase.*.json`. Proved on this commit, all six against a 8099/9199
    emulator while port 8080 was busy: rules 59, cas.emulator 24, rollout 17,
    bootstrap.emulator 23, bootstrap.rules 28, money.concurrency 50 - every count identical
    to the serial numbers recorded above, every one EXIT=0. And on the default path with no
    --config, rules 59/59 on 8080 with the websocket on 9150, unchanged.

    Two runs still must not share ONE emulator: reseed() wipes the document and the
    argument above stands unaltered. Different emulators on different ports do not share
    anything.
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
| queuecost | `queuecost.test.mjs` | What ASKING the queue a question costs, and what it must still answer. Counted, never timed: `decodeQueue` is wrapped on the device's own global scope and its calls are counted, so one commit decoding the queue once - at thirty operations and at three hundred and one - is a fact about the code rather than a stopwatch on a shared container. The other half is the hazard that comes with any cache over a shared disk: the second tab writes an operation, acknowledges one and removes one, and this tab's very NEXT answer has to move each time. And the three that hold the line the performance contract draws - six hundred edits leave six hundred pending paths, the collector takes none of them, and a journal write the disk refuses still comes back false with nothing left behind. |
| exports | `exports.test.mjs` | The three files that leave the phone, read back off the browser: the pay sheet, the invoice sheet, the detail sheet, and the message a worker himself receives. With Rima in a client's range, the CSV fallback writes the billing file, the billing file without Rima's men and the Rima file (its note last, after an empty line), and says "the files". |
| fence | `fence.test.mjs` | The write counter that lets a rescue file claim its readings were one moment - what moves it, what must not, and what it costs per edit. |
| method | `method.test.mjs` | How an advance was handed over, through all four doors and the ledger mirror, the fold and the overlay. |
| money | `money.test.mjs` | The same literal shekels on the far side of four real doors: a reopen, a second phone, an export, and a restore. |
| nonassertions | `nonassertions.test.mjs` | A test that fails when a test stops testing: every assertion in `tests/` is scanned for the shapes that cannot fail, and the scanner is itself proved against written offenders and written near-misses. |
| restore | `restore.test.mjs` | A device holding only part of a restore is caught, subtree by subtree, and a frozen v71 companion is bound to the primary it belongs to. |
| upgrade | `upgrade.test.mjs` | A v86 disk opened by this build: the retired identity scheme's marks, a restore over an older queue, a v71 companion, and an undo entry that cannot speak for the questions it left. |
| vehicles | `vehicles.test.mjs` | The retired feature, from both sides: nothing writes a vehicle record while the flag is off, and with the gate open the arithmetic that was argued over is still there. |
| xlsx | `xlsx.test.mjs` | The same arithmetic proved through a real `.xlsx`, read back out of the zip. Needs the `xlsx` devDependency, pinned at the version the app loads from the CDN. With Rima: the `בלי עובדי רימא` sheet right after `חיוב`, numbers, and with the `רימא` sheet the `חיוב` sheet cell by cell; the `רימא` sheet's note one empty row under its total, read by row number out of the file. |
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
| reorder | `reorder.browser.mjs` | The reorder mode, driven by real pointer events in real Chromium. The node harness loads `js/ui/roster.js` against a document of nulls, so the drag, its three document listeners and its 16ms autoscroll interval had never been executed by a suite at all. Two claims: the mode's exits leave nothing armed - the interval's ticks are counted, and a drag left standing is what disabled the save button on the NEXT open of the panel - and the list scrolls the way the finger went, not the way it first went, which is the direction the interval used to capture in its closure and never revise. |
| boot | `boot.browser.mjs` | What the boot SAYS, in order, on a disk it had to make two decisions about. Asserts the SEQUENCE and not the final state, for the reason `status.test.mjs` was written: the app's dialogs displace one another, so a false sentence raised over a true one leaves no trace. It wraps `askTell` from a DOMContentLoaded listener registered before `js/app.js`'s own, and stages the disk in an init script. Two boots: the one that migrates BECAUSE the v2 record will not parse - where the migration is deliberately not written down, so the app may not say it was - and the ordinary migration, which must still say so and still ask its questions. |
| status | `status.test.mjs` | What the line is ALLOWED to say. Asserts transitions rather than final states, because a claim made and withdrawn is invisible to a final-state check and that claim is the defect: it wraps setStatus and records what was asked for, what was said, and what was owed at that moment. A queue larger than one write, a restore the cloud will not take, a record Recovery could not read, and a close-and-reopen. |
| rollout | `rollout.test.mjs` | Publishing the rules, from a GENUINE legacy document — roster, days and an advance, no `protocol`, no `revision`, no receipt. The first protocol write preserves every legacy byte; a bootstrap without its receipt is refused; two phones racing produce exactly one bootstrap and the loser rebases; the exception is one write wide; an un-updated phone works before cutover and is refused after; and a missing document is a different road from a legacy one. |
| ledger-ingress | `ledger.ingress.test.mjs` | Thirteen shapes of malformed ledger data through every door — boot, load, cloud snapshot, restore, JSON import, raw recovery, migration, full replacement. Each is named by the check that catches it, held aside rather than folded, never normalised or coerced to zero; the record still opens, the bytes are kept, the person is told, writes are blocked, and the rescue export still carries the bytes. |
| repayment | `repayment.test.mjs` | The advance that outlives its fortnight: the carry, dated cash repayments, the two labels that never swap, the reversal that compensates instead of deleting, the surplus that is named rather than clamped, and the closure that is identified by the period it closes. |
| poison | `poison.test.mjs` | A ledger id that would land on a prototype — `__proto__`, `prototype`, `constructor` — through every door and every writer. The fixtures are built with `JSON.parse` so the key is a real own property and not a setter; the entry is refused before memory, disk or outbox move; a raw entry is judged before it is normalised; an entry whose `id` disagrees with its map key is not silently re-pointed; and nothing reparents the map it was aimed at. |
| merge | `merge.test.mjs` | What adopting somebody else's document takes off this one. All four append-only families survive a snapshot that has never heard of them, so do parts of the container this build does not name; existence is asked with an own-key check, so an entry legitimately named `toString` is not dropped; and one immutable id arriving with two different bodies is a disagreement a person is told about, not a winner picked at random. Driven through `Sync.receive()`, a commit and a reopen — not through the helper. |
| contested | `contested.test.mjs` | The write that lost a race, and every trigger that must not resend it: the winner's snapshot, the retry timer, `scheduleFlush()`, `flush()`, coming back online, a recreated adapter, and a close-and-reopen. The losing bytes stay durable and still owed, the cloud keeps the winner's value, the line never says synced, an unrelated edit in its own batch still leaves the phone, and the way out is a fresh explicit edit by a person. |
| held | `held.test.mjs` | The held records, on the phone: every operation that lost a race while the phone was away is listed in ⋯ with both sides - this device's value and the cloud's last-heard value at the path, in the day screen's words - and released by a person, one row at a time, through the same fresh explicit edit that has always been the way out. A phone that has heard nothing lists the record and offers no decision. |
| receipt | `receipt.test.mjs` | A receipt names the OPERATION, not just the revision it reached. The schedule and its receipt carry the same fingerprint; an honest replay of identical bytes is still answered from the receipt; a request wearing a landed operation's name while doing something else is refused as `receipt-mismatch`, never acknowledged and never pruned; and a batch's own name changes when its value changes. |
| rima | `rima.test.mjs` | The Rima count (v166), on devices: one field path per site and day, a whole number from 1 to 99; no shekel of pay, advances or closure moves; the client's invoice counts each of Rima's men as one worker-site day; the Rima table and the workbook's `רימא` sheet; no Rima in the WhatsApp message; held counts; and v145/v165 (their real bytes, out of Git) not wiping it off the cloud. v167: the `רימא` sheet ends with an empty row and the note «…בגיליון החיוב…», pinned word for word; and «בלי עובדי רימא» - the invoice's own dates and sites, the owner's men only - which with the Rima table IS the invoice, every site, every day and every total, and is a sheet right after `חיוב` only when the range in scope has Rima, narrowed to one client's site with it. |
| rima-browser | `rima.browser.mjs` | The same in a real Chromium: the field on every site card, the `רישום לרימא` section on the screen, on paper (a real PDF) and in the picture, one client's site, ten sites on a 320px phone. v167: «בלי עובדי רימא» between the invoice and `רישום לרימא` on the screen, adding up with the Rima table to the invoice cell by cell; hidden by the print stylesheet and absent from a real printout and from the picture; following the client's site; absent without Rima; and the workbook written by the shipped SheetJS and read back - its sheet right after `חיוב`, and the `רימא` sheet's note after an empty row. |
| yosefgeves | `yosefgeves.test.mjs` | «עובדי יוסף גבס» (v183), on devices: the second count per site, `days.<date>.yosefGeves.<placeId>`. `rima.test.mjs` section by section on the other layer - one field path, a whole number from 1 to 99, the queue, two phones, every hold and its row in ⋯, the kept ring, the phone that updates - and what Rima's suite cannot say: IN NO ARITHMETIC AT ALL. A fortnight with every kind of day and Rima counts in it is read off every surface (pay sheet, accounts, ledger, the invoice whole and per site, «בלי עובדי רימא», the Rima table, `reportSheets()` in five scopes, the real workbook written by the shipped SheetJS cell for cell, every WhatsApp message, every man's seder), counts are typed over it, and everything is read again: byte for byte. The two lists do not touch (neither count clears, reads or holds the other). Its own table, sheet and CSV file, in the full export only. And v165, v179 and v180 on their real bytes out of Git: each adopts the layer without keeping it, never writes it off the cloud by an ordinary edit, refuses this build's record at a restore, ERASES every count by restoring its own, and is held out loud on a disk this build wrote. Every new Hebrew string, pinned. |
| yosefgeves-browser | `yosefgeves.browser.mjs` | The same in a real Chromium: the `יוסף גבס` box on every site card, on ONE line with `רימא` and after it, the line no taller than Rima's alone was, 44px and 16px, the two boxes a finger apart, at 320, 375, 390 and 440 in both schemes and at 320 with the text doubled; typed, refused, cleared, reloaded; ↶ forgotten after a count; a Saturday holding only this count landed on; the focus carried from one box to another across both lists; a redraw committing nothing; copy-a-day copying neither count. On the reports page: the list last under «לפי אתר», and the page above it - every table, bar, heading and hint, for the whole range and for each client, in «לפי עובד», and the week grid - byte for byte the page without the counts; ON paper (a real PDF) and IN the picture as a table of its own, last, under its own heading with its note (the owner, 2026-11-10: "in print too, but as a separate list") - and the paper printed with the list hidden, and the picture with its group taken out, word for word those of a record that never had a count; no heading of it anywhere when there is none; not in the one-client file; a range with only the list's counts; the real workbook read back. |
| scroll-browser | `scroll.browser.mjs` | The day screen keeps its place. At 440x894, 390x844 and 375x667, dark, 3x, touch: ✕ under the sticky header and deep in the list, «בטל», ↶ and ↷, a site's picker, a site chosen in the tray, a rate chosen in the sheet a man's name opens, a Rima count saved mid-page and typed from one site's box into the next, three shapes of snapshot from the other phone, and a dialog closed after ⚙ each leave the rows on the screen where they were - and renderDay's own scroll read never sees a clamped page - while every site's number on screen is checked against the record and the disk. What must still move is measured too: a new date opens at its top, the header compacts and comes back. A double tap - on a row's ✕, on the ✕ of a «נעדרים» chip, on a man's row in a site's picker or on a site in the tray's «לאן הלך», 120 ms or 400 ms apart - is one tap: exactly one man off (or one absence cancelled) and the undo bar naming him, or the man left added or placed, in memory and on the disk; 900 ms apart it is two taps - each pair judged by the gap the page itself saw, the clock the guard reads. Back from the week tab, the window stays where it was. A render arriving while a Rima box or the hours box in a man's assign sheet has the focus - a commit elsewhere, an adopted snapshot, the assign sheet closing (the Rima box only: closing the sheet that holds the hours box is leaving that box) - throws nothing, logs no console error, commits nothing but what was committed and changes exactly what it brought. At the end of the page, the last man in the tray placed on a site above moves the screen by less than a row. `WITH_WEBKIT=1` adds Playwright's WebKit, which is not an iPhone. |
| seder | `seder.test.mjs` | The seder to each worker (v167), on devices: the list is exactly the men the day's group message puts under a site - nobody נעדר, nobody on a הכל חופש day, nobody with no site, never Rima, a man on two sites once with both; each man's Hebrew message and every word of the list, pinned word for word as the owner approved them on 2026-11-07 (no «איתך» line under a site where he is the only one of the owner's men); a phone number becomes a wa.me number only when it is plainly an Israeli mobile; two men on the list with one number each told so, neither dropped, and only men on the list compared; and the progress - who was opened, who was left out - kept per date through Store, surviving a reopen, never shown on another date, disbelieved once the seder it was opened for changes, and never in the schedule, the outbox, the cloud, a backup, the rescue file or the write fence. |
| seder-browser | `seder.browser.mjs` | The same in a real Chromium: the one entry inside the WhatsApp dialog (and none on the day), a man left out, the run's tap going to `wa.me/<number>?text=` with the address on the link before the finger lands, the next man ready on the way back, a reload mid-run bringing the list back on the evening it was sending, 44px targets, 16px inputs, right to left, thirty men on a 320px phone with the run still under the thumb; and on a touched phone, two taps 120 ms apart (and two clicks, a double click, the run and a row's door together) opening one man and marking one, the run's button keeping him until the moment is over, and the shared-number note on both rows. wa.me is answered by a route on the test's own context; nothing leaves the machine. |
| bars-stale | `bars.stale.test.mjs` | The frame iOS pushed up (v167), decided in Node: `js/ui/bars.js` in a V8 context whose window, visual viewport, `navigator.standalone`, clock and rectangles are a stuck home-screen iPhone's (the owner's 2 November report and screenshot, checked first). The rule one frame of readings at a time - stuck, a real keyboard, a picker wheel, a pinch, Safari in a tab, an Android install, v116's raised rectangle, both raises at once never added; the page's own writes through a stuck evening - nothing moved at the top or while settling, the bars and a top-anchored dialog on the glass once scrolled, a field tapped inside an armed frame keeping it while the keys hide the bars, off the frame the viewport is whole; and a whole stuck scroll down, up and down again under BOTH readings of where WebKit measures a rectangle from, with the tab bar and the date header 0px off the glass and the ⋯ report's `rectGap` saying which. Never run on an iPhone. |
| payroll | `payroll.test.mjs` | Worker accounts, closure and payment - the pure model in `js/model/payroll.js`, shipped SHUT since v173: every device here is built with the writer on through the test seam (`flags: { paybook: true }`), and the one-rule-flipped devices are built from this build's load order with that one file's one line changed. PHASE 0 pins present behaviour so that changing it is deliberate: the fortnight pay report shows 3,800 for a weekly man whose week 1 is closed; the existing planner would close a fortnight over that closed week; one chosen total is split oldest first; an advance from a fortnight nobody closed is "500 left" to `advanceOutstanding` and "nothing carried" to the account walk, and cannot be deducted later; a partial deduction on a record with no carry approval shuts the financial gate. PHASE 1, each of the owner's cases by name: the weekly man's running account is his open week (2,000, never 3,800) with earlier unclosed weeks listed apart; the biweekly man's is his fortnight (2,100 + 2,300 = 4,400); the person's per-advance split (500/400/300, 700 as 100/300/300, 500 carries) written as the existing `deducted` entries and accepted by today's journal and a reopen; over-deduction, a second deduction and an unanswered advance refused; a new advance never a payment; extra deductions apart from advances and capped with the wage; net 3,000, paid 2,000, 1,000 owed, 600 later, 400 left, overpayment refused, the statement never edited, debt and wage owed never netted; group closure one independent plan per man, resumed, with one refusing and a retry skipping the done; two devices minting one id for one fact and a disagreement kept beside the entry that stands; a double tap one payment; a stale plan refused by `stillValid`; no input mutated (JSON before and after, and a deep-frozen schedule), the same output twice, every refusal code produced by name, each of the eight defaults shown to be one line by loading the file with it flipped, no float drift over 37 x 33.33; the migration report writing nothing; and, with no `pay` records at all, agreement shekel for shekel with `payrollReport`, `advanceAccount`, `advanceOutstanding` and `openAdvanceBalance`. Synthetic data only. |
| paybook-store | `paybook.store.test.mjs` | The pay book on ONE phone (v173). THE GATE: with the shipped flags every planner and `State.commitPaybook` answer `gate` and nothing moves, while the same build opens, folds, saves and reopens a record that holds a pay book byte for byte. THE COMMIT: a closure is one journal record of six operations; a reopen reads back the same bytes and the same fold. JOURNAL FIRST: a death between the journal and the record is rebuilt from the journal; a journal the disk refuses rolls memory back and says «הרישום לא נשמר» once. APPEND-ONLY: a null, a rewrite, a stray path, one id twice and an empty batch refused at the commit, at the queue's one minting path and by the queue's reader; the same closure twice, and under another signer, writes nothing. A DISAGREEMENT: `paybookUnion` keeps both bodies, whoever is named standing stands, a second union adds nothing; across a reopen the phone is not blocked, a day is recorded, the man reads `review` and his planners refuse. UNREADABLE: a kind nobody wrote, a sum that is text and a null stay at `pay.<id>`, are quarantined under `scheduleData:v2:pay`, block writing until acknowledged and survive the save that follows; a payment before its statement is not unreadable; a `pay` that is a string. POISON through every writer and the read. BACKUPS: the backup file, a restore point, the way back and the rescue file carry `pay` and `payConflicted`; an old backup with no `pay` restores without erasing one entry, and the confirmation says so. CAPACITY: a year of closures weighed by Firestore's own count for 14 and 30 men - REPORTED on every run, and pinned as facts (the document does not last a year). |
| paybook-sync | `paybook.sync.test.mjs` | The pay book between phones, on the fake cloud. P1 two phones, different entries, three phones agree - one of them with the writer off. P2 the same closure twice is one of everything and nobody is held (and the stale «שולח» line, pinned as TODAY). P3 a different PAID amount: the cloud is never rewritten, the cloud's copy stands on the loser, its own is beside it, its write is held and listed in ⋯, and the phone is NOT stopped. P4 different DEDUCTIONS: the ledger's rule, the loser stopped by Recovery, no double deduction. P5 a phone away for weeks. P6 a snapshot with no `pay` removes nothing - and TODAY the cloud is not healed. P7 pending entries survive an adopted snapshot. P8 a lost answer, with and without the snapshot. P9 a reload mid-flush. P10 IS A CLOSURE ALL-OR-NOTHING ON THE WIRE - one write when it fits, held whole when contested (before sending and after a refusal), and CUT IN TWO by the 296-path limit. P11 a restore from a file with no pay book, with a payment landing in its window, and from a file with an older body. |
| paybook-oldbuilds | `paybook.oldbuilds.test.mjs` | v167, v169 and v171 out of Git (`git show <commit>:<file>`), each beside a phone of this build: keeps working, drops `pay` from its own copy, never removes it with an ordinary write, carries none in its files, takes the whole book at its first snapshot when it updates - and ERASES it from the cloud with a restore, and from a shared disk with a second window. The answers are printed side by side and pinned; THE ROLLOUT RULE in `docs/payroll-closure.md` is derived from them. Needs the three commits in the repository (a shallow clone stops the run). |
| debt-ruling | `debt.ruling.test.mjs` | The one-debt ruling (v175; the owner, 2026-11-10), on two builds side by side: one as shipped (the gate shut - the old walk, asserted as HISTORY) and one with `paybook` open. One answer - the carry into every account equals what `advanceOutstanding` says was left the day before it opens - on 60 seeded random records; the existing dialog deducting an old advance at a later closure; an account closed OUT OF ORDER taking only what is still on its advances; a closure made before the ruling reading the same frozen figures under it; `planDebtRuling` pinned on a fixture, the same on either build, and writing nothing; the carry plan stopping where the record does. |
| paybook-transact | `paybook.transact.test.mjs` | The pay book's server-first door (v175, `js/sync/transact.js`) on the fake cloud, which models the adapter's `transact`. T1 one write with its closed document, read back and adopted, nothing near the queue. T2 offline refused, nothing kept. T3 unsent work first. T4 two phones, one account. T5 re-aimed after an unrelated move; a day inside the account is stale. T6 a double tap. T7/T8 a lost answer, settled by the receipt. T9 a reload mid-flight, three ways. T10 a payment and a void. T11 the queue never carries a pay path. T12 an unreadable intent. T13 `carry-approval-needed`. |
| paybook-split | `paybook.split.test.mjs` | The split as a model (v175). S1 the operation and the closed document's reader. S2 lossless. S3 the index is enough: its folds equal the full folds on 30 seeded random records. S4 `planHistoryMove` writes nothing and adds up. S5 detail on this phone or not. S6 CAPACITY for 20 men over 5 years, weighed Firestore's way, in the live document and with the split - REPORTED, with the facts pinned, including that the split does not bound the document. Takes about forty seconds. |
| accounts | `accounts.test.mjs` | The pay book's screens, shipped shut (v176). Every string of `js/ui/accounts.js` pinned word for word against a second copy (the owner's labels verbatim, the rest proposed) and found in `docs/payroll-closure.md`; no Hebrew outside the block; every refusal code read out of `js/model/payroll.js` and every word of `js/sync/transact.js` has a sentence; the gate shut: the shipped flag false, `js/ui/reports.js` minus its four hooks is `git show 893def8:js/ui/reports.js` byte for byte, no other script calls in, the tab bar is main's; the source computes no money, writes by one door, keeps nothing in storage; `accParse`, the list's order; `paybookSuggestAllocations`. |
| accounts-browser | `accounts.browser.mjs` | BROWSER (in `test:all`). The gate opened through `FARKAD_FLAG_OVERRIDES`; the cloud is `tests/harness.mjs`'s fake Firestore in the suite's process, reached through the one module the app imports after boot (`accounts.cloud.mjs`); the crew is `accounts.world.mjs`. First run; the list (2,000 for the weekly man, 4,400 for the fortnight, two balances apart, the order, filter, search); the review page (500/400/300 answered 300/200/200, a blank refused on its row, over an advance, over the wage, extras, net 3,000 paid 2,000 leaves 1,000); offline writes nothing - disk byte for byte; two taps one closure; a later 600 leaves 400; too early; another phone changed the account / closed it first; an answer lost and settled by looking; history by worker, cycle, status, work period, closure date; the statement, the absent detail; void and adjustment with and without a reason; the older closures; the old dialog routed; the group walk (close, skip, return) and a prepared batch of three with one refused and a retry; the carry approval on the spot; and the build as shipped, whose tab is today's. 44px, 16px, no sideways scroll, one filled button, nothing clipped at 200% text, at 440x956 and 375x667. `ACCOUNTS_SHOTS=<dir>` writes the owner's screenshots. |
| paybook-archive | `paybook.archive.test.mjs` | Phase 5 on the fake cloud, which here runs with `payRules: true` and refuses what `firestore.rules` refuse of a whole-document write. R1 the model: what may move and why not, the stored row (a map, not a list of lists), whole <-> stripped byte for byte, an unreadable row carried as it lies. R2 the move on three phones: the server's document smaller, the money of each phone ONE unchanged string, idempotent, nothing queued. R3 never before the copy is confirmed: a forged copy, a copy changed between the look and the drop, no copy at all, a body the server holds differently. R4 a phone installed afterwards, one that cannot fetch (adopts nothing, says so, refuses a closure), one that was away for both, one that goes on working while it waits, a broken copy. R5 a lost answer, an interrupted move after a reopen, two phones at once, a lost revision. R7 refusals. R8 a void, a later payment and a later move after archiving. R9 a restore from three files and from a new phone erases nothing; a document from a build that does not know `pay` is refused. R10 the backup, the rescue file and the daily copy say what they carry. |
| archive-browser | `archive.browser.mjs` | BROWSER (in `test:all`). Phase 5 through the screens, the pay book opened by the seam, the cloud played: a draft across a reload and the three ways it is not put back; «ארכיון סגירות» read (writes nothing) and run, no signal, the list and every fold unchanged after, a second phone, a phone installed afterwards; a phone that lacks the detail; «מה לבדוק?»; «נסגר» on the weekly breakdown; and the shipped build with none of it. |
| paybook-archive-emulator | `paybook.archive.emulator.test.mjs` | EMULATOR. X1 the rules for what leaves, by hand-written transactions. X2 the production adapter's `archiveClosed`, asked directly to drop on a document that does not hold the entries. X3 two phones at one instant. X4 a new phone and its restore under the real rules. X5 v167, v171, v172 once an index exists. |
| months | `months.test.mjs` | Phase 6 on the fake cloud (`payRules: true`). M1 the model and the words. M2 the move on three phones. M3 never before the copy is confirmed; a day edited between copy and drop. M4 a phone that lacks the month. M5 resumable; two phones at once. M6 an edit of an archived day: refused, held, retired. M7 what the server refuses. M8 a restore never changes an archived month. M9 the files. M10 the gates. M11 both orders with Phase 5. |
| months-capacity | `months.capacity.test.mjs` | C1 the server's document for 20 men with months leaving, and what still grows. C2 a phone's storage under each choice, and on a device with a 5 MiB edge. C3 (Phase 7) the phone's localStorage with the cold store, before and after, fortnightly and weekly. Slow (several minutes): it builds ten years, week by week. |
| cold | `cold.test.mjs` | Phase 7, the phone's cold store, on a fake IndexedDB (`fake-indexeddb.mjs`). K0 the flag shut: no database opened, the bytes today's. K1 the move and a reopen: every figure unmoved. K2 killed at each of the 30 steps and inside each of the 15 cold-store commits; a mark is not proof. K3 evicted, wrong, refusing, slow: said, refused, made whole from the server. K4 the files and the restore doors; the rescue file with the record quarantined. K5 two tabs. K6 the reclaim ladder. K7 no IndexedDB. |
| cold-browser | `cold.browser.mjs` | The same on the REAL IndexedDB in Chromium: B0 no database with the flag shut, B1 the move and a reload, B2 the page closed mid-move, B3 `deleteDatabase` under an open page and between sessions with the sentence on the screens, B4 two tabs, B5 no IndexedDB. In `test:all`. |
| activation | `activation.test.mjs` | Phase 8, on the build AS IT SHIPS (no flag through the seam). V1 an unactivated record: every gate shut. V2 the dry run (`planActivation`) and that reading it writes nothing. V3 the rules published today: refused by a read, and refused whole if sent. V4 turning it on: the carry approval, the opening, every phone on at once. V5 the point of no return, field for field. V6 the way back (`paybookActivation: false`). V7 two phones at once; V7b a disputed opening from a file. V8 a phone that had not heard closing the old way. V9 protocol 1 refused afterwards. V10 Phases 5 to 7 end to end with every flag false. V11 the one reader of the three flags, read from the source. V12 `firestore.rules` is the published file with lines added. |
| activation-browser | `activation.browser.mjs` | The same in Chromium on a played cloud, as shipped: the row in ⋯, the screen at 440 and 375, the confirmation declined, older rules, the opening on the server and the other phone's tab changing by itself, «יתרת זכות» on the row and the review page, the months page and the refusal of an edit afterwards. `ACTIVATION_SHOTS=<folder>` writes a picture of each screen. In `test:all`. |
| activation-emulator | `activation.emulator.test.mjs` | The real rules and the production adapter: the probe under both sets of rules; the build as it ships under the published rules; turning it on; two phones at once; v180, v183 and v184 out of Git before and after the record is on; the way back. In `test:emulator`. Needs those commits in the repository. |
| months-emulator | `months.emulator.test.mjs` | EMULATOR. Y1 the production adapter. Y2 the rules by hand. Y3 the adapter's own confirmation of values. Y4 two phones at once. Y5 the published rules. Y6 the rollout table: three older builds x the new rules x a document with and without a month out. |
| paybook-split-emulator | `paybook.split.emulator.test.mjs` | EMULATOR. The NEW `firestore.rules` and the production adapter. R: a closed document is created once, with its schedule write and never alone; the pay map only grows, only at protocol 2, only with its closed copy; each half failing takes the other. A: one closure is one commit of three documents; two phones closing one account in the same instant - one closed document, the loser told. O: v167, v171 and v172 out of Git (their own adapter too) under the new rules and under `docs/firestore.rules.before-paybook`, with and without a pay book; the last section derives THE ROLLOUT ORDER from the cells. Several minutes. |
| paybook-emulator | `paybook.emulator.test.mjs` | EMULATOR. (Since v175 this loads `docs/firestore.rules.before-paybook` - the PUBLISHED rules - by name; the new rules refuse the path it measures.) The UNCHANGED `firestore.rules`: an allowlisted protocol update adding `pay.<id>` paths is accepted; an unlisted account, nobody, a write with no protocol and a stale revision are refused; and TODAY the rules also accept a rewrite, a deletion and a whole document with no `pay`. The PRODUCTION adapter: a closure is one revision and one receipt; two phones closing one account at once with the same choices leave exactly one statement and one payment; with a different paid amount the server's copy is never overwritten and the loser is held, not stopped; with different deductions the loser is stopped by Recovery and nothing is deducted twice; disjoint writes at one revision are rebased. And Firestore's 1 MiB document limit, asked of the emulator: refused. |
| bars-stale-browser | `bars.stale.browser.mjs` | The same in a real Chromium, with the visual viewport and `navigator.standalone` faked before the app loads and the glass computed by WebKit's rule: the bars, the undo bar and the room the page keeps through a stuck scroll, the window-scroll failsafe with no visualViewport event, a real keyboard and the settling after it, the ⋯ lines; the assign sheet, a dialog, the seder list, the worker picker with its search box tapped, the reminder banner and the pinned date header on the glass; and every element whose computed position is fixed - found by walking the page, by reading every stylesheet rule that makes one fixed at that width, and by scanning the scripts for an inline one - moved by offsetTop exactly once, so a fixed layer added later and left off the list fails by name. |
| declutter-browser | `declutter.browser.mjs` | The day screen decluttered (v167), in Chromium with touch, dark, at 3x. No select, rate control or hours box on any row of any site: a row is the man's name and the ✕, and a tag only for a day that is not regular, worded with the rate's own label (`RATE_LABELS`) word for word and per site, with «2 אתרים» kept and each row's place key (`row:<site>:<man>`) kept. The name - a target of at least 44px each way, named for a screen reader with the man, the site and the rate - opens the assign sheet for that man; «יום כפול» chosen there commits once, appears on his row, and is the same on the screen, in memory and on the disk, through ↶ and ↷; his overtime hours box is in that sheet. Opened from a row the sheet stays on him through «נעדר» and a re-place, with no forward button; opened from «נרשמו X מתוך Y» or the by-worker list it still walks the evening, and the tray still opens the place picker. Two taps 120 ms apart on a name change nothing, whether the second lands on a site's tile or on the backdrop above the sheet. Scrolled, the compact header is one row (B1) at 440, 390 and 320. 44px targets, the ✕ on its man's line and nothing over the edge at 320, the longest name with its tag included. |
| design-browser | `design.browser.mjs` | The one look (v169), in Chromium. At 440x956 dark with a fourteen-man crew: eleven whole worker rows between the header and the dock, every one 56px; the strip above the day 52px or less with its settings button still saying «הגדרות», 44px both ways, opening the panel and taking the focus back. A button's words are unchanged beside its drawn glyph: the emoji is still in `textContent` and in the accessible name, clipped to a pixel; a relabelled button is dressed again, once; a button with no emoji is left alone; the WhatsApp message textarea keeps its own emoji and gains no child. At 375 and 320 the date is not cut and the page does not scroll sideways. In both schemes: ten colour pairs at or above their stated ratios, the ten site colours byte for byte what v140 set, and on all five screens no target under 44px in either dimension and no field under 16px. |
| transport | `transport.test.mjs` | הסעות in Node; since v174 the plan is a picture. The engine (`js/model/transport.js`): the rows of a vehicle as they are drawn - a five-seater `[[1,2],[5,4,3]]`, the 9-seater 2-2-2-3, any other count two in front and rows of up to three, every seat once, rows that do not add up not believed, rear rows numbered from the right as v171 named them; a stored plan read as a picture - a seat number kept, a passenger without one on the first free seat, nobody squeezed in, a man named twice seated once, two men on one number, a vehicle that stays home or left the list having no car, a status winning over a seat, a seated man with no site today staying drawn and named, the input never mutated, two readings the same bytes; putting a man on a seat - empty, the driver's (whoever sits there drives), a taken one from the tray (the other displaced) and from a seat (a swap, in a car and between cars), every refusal changing nothing, taking a man out; every code `validate` names, and none of v171's planner left on the engine. On devices: the seven vehicles and the list the owner keeps; who works where read through `sederCrew`; place, displace, swap, unseat, a vehicle kept home (its men waiting on the disk too), statuses, the plan surviving a reopen, a man marked נעדר after he was seated; **a day and a list in v171's own bytes** drawn correctly, byte for byte unread until changed, the first change dropping versions, locks, areas and the «sent» mark, a list save carrying v171's areas and driving rights untouched; the driver's message line for line in seat order with the vehicle's name held right-to-left, a passenger with no site named without one; the mark un-believed when the message, the driver or the number changes; the store's isolation - schedule bytes, outbox, write fence, cloud, backup file, restore point and rescue file all without a byte of it; an unreadable transport record copied aside, the day still committing, and nothing written over bytes that could not be copied; a full disk spending no restore point; pruning at 35 days; the switch (off: every change refused, no transport key but the switch read, none written, no entry drawn); the retired vehicles flag untouched; pointer events and no HTML5 drag-and-drop in the screen's code; and every Hebrew string of `TRANSPORT_TEXT` word for word, with nothing of the removed planner in them and no Hebrew anywhere else in the screen's code. **v179, the summary of the day:** composed line for line - the vehicles in the order of the list, the driver first with his site, the men by their seats, a car with no driver, a driver alone, nobody seated, the men waiting, the empty and the kept-home vehicles each on one Hebrew-led line, a seated man with no site, a man marked «לא בהסעה שלנו» absent from it, a day nobody works, a day written by v171 read and not rewritten; the builder pure; every key on the disk, the fence and the queue unmoved by it; nothing with the switch off; and its code calling nothing that writes. |
| transport-browser | `transport.browser.mjs` | The picture in a real Chromium **with a touch screen** (`hasTouch`, `isMobile`), four times (440x956 and 375x667, dark and light). Every drag is a real touch sequence sent through `Input.dispatchTouchEvent` - Chromium's own gesture detection, `touch-action`, scrolling and touch-type pointer events - and a counter proves no mouse and no native drag was involved. No entry until the switch in ⋯ is on; then one row in the WhatsApp dialog; the panel entered at its heading, still the `settings-panel` layer, and opening it writing nothing. The picture: no tabs; the tray's count and chips in roster order with each site's own colour; seven cards with their rows (2-3, and 2-2-2-3); «הוספת עובד» on every seat and «נהג» on the driver's; **the driver in the LEFT half of the car in a right-to-left page**, under the windscreen, with the drawn steering wheel; no image; the nine-seater's nine tiles inside its outline on the screen; the outline and seat borders 3:1, a name 7:1. Carrying: a man stopped in the air (the floating copy is not a fixed layer, the seat under the finger lit, nothing selected, nothing changed), dropped on an empty seat, on the driver's seat (the WhatsApp link appears with its exact `href`, `target` and `rel`), on a taken seat from the tray (the other back in the tray), a held man from one car to the next, a swap, back to the tray, released outside (nothing), `touchCancel` in mid-air (nothing, and nothing left on the page). A swipe from a card's background AND a quick swipe that starts on a seated man both scroll and move nobody; a level swipe on the chips slides the tray. A man held at the bottom edge scrolls the list to the sixth car and is dropped there, and back under the tray to the first. A mouse carrying a man with no hold, and its release not opening the seat it landed on. Tap-then-tap; Escape; the chooser over the panel with its exact rows; the driver's-seat title; «הוצאה מהרכב»; the link tapped (navigation prevented here) marking «נפתח בוואטסאפ» and a changed message un-believing it; a vehicle kept home folding and returning its men; three men marked not riding three ways (touched, chosen, dropped on the control) and one brought back; the nine-seater full with every name inside its seat; an empty seat with nobody waiting SAYING so; the vehicles list (add, a seven-seater drawn 2-3-2, rename, retire). On every state 44px both ways, **56px seats at 375**, 16px fields, no sideways page scroll, no filled button; `scheduleData:v2` and the queue byte for byte at the end; no request off loopback; a reload; the switch off again. `TRANSPORT_SHOTS=<dir>` also writes five JPEGs. **Chromium with emulated touch only - nothing here is an iPhone or a Galaxy.** **v179, the summary:** its one button and no other way to it, the dialog over the open panel, its words equal to the cars as they are DRAWN (worked out from the tiles and chips on the glass), the share sheet, wa.me with no number and the clipboard through recorders, the picture (file name, type, one box per block, the words drawn equal to the words shown), Escape closing the dialog and not the panel, an open dialog following a plan that changes, and no key written. |
| journey | `journey.test.mjs` | בניית סידור - the seder's journey (`js/ui/journey.js`) - in Node. What it READS, on a seeded record: who is placed (the seder's own list), who is not recorded (the day screen's «לא נרשמו», for any date), who is away, the man recorded only on an archived site; its own check when `js/ui/daycheck.js` is not there, as `{kind, text}`; the rides - no seat, a car with nobody at the wheel, a man still drawn in his seat after he was taken off his site (counted, the plan on the disk untouched), a man moved to another site read at the new one by the summary's own builder; the strip's five states read from the record now, and the step past הסעות where it is off. Tomorrow by the local calendar across month, year, leap and both clock-change days, and past an empty Saturday by the day screen's own rule. The walk: start, onward, back, leave (the place kept, a reload not bringing it back, the entry continuing it), finish (nothing kept, the day screen back on today), a resume at every station and across midnight, a station that is no longer there. The preference: three hours, a clock put back, twelve damaged and poisoned shapes each starting fresh with the record untouched; never the schedule, the outbox or the fence; walking every station moving no other key on the disk; no cloud write, nothing in a backup or the rescue file; a full disk costing only the place and no restore point. Every Hebrew string pinned, no «נשלח», none of the three forbidden dialogs, no markup from a name, no writer of the record called. |
| journey-browser | `journey.browser.mjs` | The same in a real Chromium **with a touch screen**, on Playwright's clock in Asia/Jerusalem (the app's own `todayStr()`, so a reload boots on the same evening). The whole journey four times (440x956 and 375x667, dark and light): one entry in the WhatsApp dialog after the seder's and הסעות's and nothing on the day screen before it; station 1 the day screen on tomorrow with the journey's row INSIDE `.day-actions`, the dock's own two buttons whole, `--day-actions-h` equal to the dock as it stands, the last row scrolling clear of it, a man placed by the day's own picker moving the counter and landing in the record as one ordinary edit, the day's own arrows moving the journey's date; station 2 the REAL day check (`js/ui/daycheck.js`) drawn by its own door for the journey's date with the journey's line above it for the men it does not name; then the contract with the real pair put aside by assignment (both are function declarations and cannot be deleted): neither door (the journey's own reading), findings only (its sentences, only the `check` tier counted), a drawing (a man it names not said twice), both throwing - and the way onward open through all of them; station 3 the הסעות panel with the bar inside it, two real touch drags and a tap-then-tap, the bar following the picture, the screen's own «חזרה» one station back; station 4 the sites and the cars worked out BY HAND from what was built and drawn and equal to `dayMessage` and `transportSummaryText` block for block, nothing to tap, no key moved; station 5 three groups with the drivers first and nothing ticked, a driver's door with its exact `href` going to `wa.me` (a route here) and then «נפתח בוואטסאפ» in the הסעות screen's own key, the seder's list and the day's message opening OVER the panel, the summary through recorders, «סיום» with two drivers never opened. A reload at every station; the seder's list coming back over the last one; Escape and «יציאה»; three hours; a damaged preference. **Against the real day check**, on a day with a working day before it (two phones): a forgotten man under «כדאי לבדוק» in the check's words, the other men not recorded named by the journey, every one of them on the station exactly once, the count of what there is to look at; his name tapped going one station back to the day screen with HIS sheet open in front and nothing written; the day put right, the calm line, nothing counted, and onward to the rides. A phone with הסעות off: skipped, the one sentence, never turned on, no key of it written. A man moved and a man taken off after seating: the bar, the card, the last look, the strip, and an «opened» mark no longer believed. Tomorrow two minutes before midnight and after it, on both of Israel's clock-change nights, on a Friday and a Saturday evening. On every station 44px both ways, no field under 16px, no sideways scroll, exactly one filled button and it on the glass under nothing - and again with the cascade's text doubled. `JOURNEY_SHOTS=<dir>` writes a JPEG per station. **Chromium with emulated touch only - nothing here is an iPhone.** |
| transport-share | `transport.share.test.mjs` | הסעות shared between the phones (`js/ui/transport-share.js`), in Node against the fake transport cloud of `harness.mjs` (`makeCloud().transport`, written to what the emulator suite measured). The gate ships OPEN (v186); shut again through the test seam, every transport key on the disk is byte for byte what a build without the file writes, with the transport cloud never called; as shipped, a phone whose switch is off reads, hears and writes nothing; a phone with no cloud works as before. A change goes up and the other phone draws it while the schedule document, the outbox, the write fence and the record's status sentence do not move - also when the transport adapter throws, refuses everything or never answers. Two phones at once (the same seat, the same man in two cars, a vehicle kept home against a man seated in it, a day offline): one write lands, the loser holds the winner's plan, its own copy aside and one notice, and «use mine» goes up as the next revision. The first meeting with the cloud in its four cases; the rules of today (`rules: 'old'`): «עדיין לא משותף» and nothing tried; the app stopped mid-write, mid-adoption, and with no room for the copy aside; two windows on one disk; a driver's «נפתח» mark staying on its phone; v171 bytes not rewritten by a shared day that says the same; pruning; a document of an unknown version; the backup, restore points and rescue file; the size of a shared day; the words; and the REAL v179-v182 trees out of Git beside a cloud that holds shared plans, making no call to them. |
| transport-share-browser | `transport.share.browser.mjs` | The same on the glass, in Chromium with a touch screen, the fake transport cloud living in the test process and bridged into each page (two pages are two phones). The gate shut (the test seam, defined before the app loads): the share node hidden and empty, the cloud never called, the switch's old sentence. As shipped (open, v186), at 440x956 and 375x667, dark and light: the line under the head, a man seated by taps on one phone drawn in his seat on the other, the loser of a same-seat race shown the plan that won with one sentence and two buttons (44px both ways, 16px, inside the phone, 4.5:1), «להשתמש בשיבוץ שלי» through the app's own question (cancel changes nothing), «להשאיר את המשותף», a signal lost and back; and the rules of today in one line on a 375px phone. No native dialog, no page error. **Not a real phone and not the Firebase SDK in a page.** |
| transport-emulator | `transport.emulator.test.mjs` | The shared rides against a real Firestore (emulator; needs Java). The new `firestore.rules` is main's file plus one block (byte comparison with the block removed). The rules for `schedules/<doc>/transport/<name>`: the three addresses and nobody else; create at revision 1 only, update at exactly the next revision, never delete; the exact keys, the kinds, a day's name agreeing with its date, the caps - and no other path opened. The schedule document, its revision and its receipts unmoved by transport writes, and the reverse. The PRODUCTION adapter's `transportOps` (the shipped module, four import specifiers rewritten): the compare-and-set, a refusal carrying the document that won, two simultaneous writes of which one lands, what a listener hears and its `live: false` when the network is off. Two devices running the shipped client through that adapter: the same seat, the same man in two cars, a vehicle kept home against a man seated in it, a day offline and back, the first meeting. v180 and v182 - their own files and their own adapter, out of Git - under the NEW rules: they record a day and the shared plans do not move. And this build under the rules of TODAY (read out of Git): transport says «עדיין לא משותף», a direct write is refused, nothing exists under the path, and the record syncs at its own revision with no error. |
| settings-order-browser | `settings-order.browser.mjs` | The ⋯ sheet in strict order (v172), in a real Chromium. The three sections and their nine cards by their own titles, in order; the sync card a plain `<section>` with nothing in it inside anything that shuts, the advances review directly under it; every other card a `<details>` whose `<summary>` is the card head. On opening: גיבוי open, the rest shut, the filled button on the glass at 440x956; after Escape and after «חזרה» focus is back on `#settingsBtn` and the next opening is the default again, with nothing about the rows in storage. A person's open and shut rows survive `render()`, a settings redraw, a snapshot adopted through `FarkadSync.receive`, the connection changing and a reminder check. Each self-opening reason through the state that causes it: a record that will not read (truncated `scheduleData:v2`, reloaded - and the banner's own export button), a problem arriving under the open sheet, a restore outstanding, a pending restore that cannot be read, a restore's answer, an empty crew beside a restore point, and beside a cloud copy that arrives after the sheet is drawn (and a full crew beside a restore point NOT opening it), a subscribed phone the server does not know and one that blocks notifications (and a registered one, and an arrival from a reminder, NOT opening it), a waiting build, one arriving, a check asked with the sheet shut, a storage warning; with every reason standing הסעות and מידע טכני still shut; a row shut by a person staying shut through a redraw while its reason stands. The inventory: every control (tag, id, words, inline handler) and every sentence of the v171 sheet, captured from `b640c5a`, found with every row open; the three script-built controls pressed; one filled button. Enter on a row, Tab from the last row wrapping to the first control and never into a shut row. Rows 56px and every target 44px both ways, fields 16px, no sideways scroll, the drawn corner and no browser triangle, at 440x956, 375x667 and 320x568 in both schemes, as opened and with every row open; the jump buttons moving focus to headings that clear the fixed navigation; doubled text clipping no title. Folding writes nothing: the schedule and every `localStorage` key byte for byte. Chromium only - nothing here is an iPhone. |
| polish | `polish.test.mjs` | The polish pack, decided in Node. Who is drawn quieter on the advances page: nothing left and nothing over-settled - an over-settled account has nothing «left» either and is never quiet; the row's and the page's words built on the lines they always were, nobody filtered by a balance. The empty screens' sentences word for word: the roster's «אין עובדים. הוסף עובד כדי להתחיל.» and its button «+ הוסף עובד» reused on advances, the week's own kept, the reports' empty range kept three times over, and one PROPOSED sentence for a week nobody is on - which counts all seven days and archived men, so a record on the Saturday the grid hides keeps the sentence away. `siteInitial`: Hebrew, Latin, a digit, leading punctuation, no letter at all; every colour and cycle mark still what the id gives; the letter an attribute and never a child. The backup row: `backupReminderDue` at 0, 13, 14 days, never, garbage and a future date; `renderBackupAge` drawing the age it always drew, the same on the row, and the PROPOSED reminder at sixteen days while writing no key; a new file taking it away; the stamp in no backup file, record or cloud document; both lines inside the row's `<summary>`. |
| polish-browser | `polish.browser.mjs` | The same on the glass, in a real Chromium with touch. **Advances** (440x956, dark and light): seven men in the page's order with the page's words, the five who owe nothing quieter - weaker ink, lighter weight, less contrast than the two who owe, and still 7:1 on their ground; his own page with the same words, no accent and no tint, and both actions kept. **Empty screens**: an app with no crew and no site shows one sentence and «+ הוסף עובד» on advances and the week (no search, no week header) while the reports keep their range, their output menu and the sentence they always said, the crew screen keeps add / paste / add-site and hides search, reorder and the two shortcuts, every button 44px, the button lands on the crew screen with the form open, and the first man brings every tool back; a crew with nothing recorded keeps the whole week header and grid under one sentence that is not on paper, and the reports keep every control over «אין רישומים בטווח הזה.»; an all-archived crew keeps the three week steps and loses print and share. **The week's letter** (440 dark and light, 390 dark, 320 light): twelve sites on a palette of ten, every block carrying the first letter of its own site in white at 12px or more, 4.5:1 or better on all ten colours, 20px blocks inside 44px cells, the block's text and the cell's accessible name unchanged, the dot, the plus and the diamond beside the letter, the legend untouched, no letter on paper or at 1100px. **The backup row** (dark and light): never, today, 13, 14 and 40 days, shut and open, an unreadable date - the age sentences as they were, the row repeating the age only while shut, the reminder word for word on one line with no box, no dialog and no write, gone after the real button hands a file over; and wrapped inside the row at 320. NOT a real phone. |
| bootstrap-rules | `bootstrap.rules.test.mjs` | The SERVER's answer to a bootstrap that carries business data. Nineteen smuggling attempts — days, advances, ledger entries, workers, places, roster, `schemaVersion`, unknown fields, each alone and in combination — against the local emulator, plus the acceptance list of what a bootstrap may legitimately touch. Every row reports: the helper returns a verdict rather than throwing, so one refusal does not hide the eighteen behind it. |
| oracle | `oracle.test.mjs` | TWO CALCULATORS, ONE RECORD. `oracle.mjs` is a second calculator, written from the documented rules, handed the raw record and importing nothing from `js/`: dates are day numbers worked out by integer arithmetic (no `Date`, so no zone and no DST hour), money is whole agorot. The suite generates 240 records from a seeded generator (no `Math.random`, no clock, every `at` counted) and puts the shipped app's answer beside the second calculator's on every one: a pay sheet row over every fortnight, week, month, odd window and single day (dates on site, pay units, double days, hours, site visits, absences, the wage at the rate STAMPED on each day, advances, net, the two flags); one man day by day and the summary of it; the client's invoice with Rima's men, and the three tables that must add up (the invoice, `בלי עובדי רימא`, the Rima table); what is left on every advance and what each man still owes; every man's account period by period in his own cycle (in, given, back, corrected, the wage, covered, carried out, carried forward, late movement, over-settled, review, net, closed), with closed periods reporting their record; what a close WRITES, through `closePeriodChanges` (the payslip, the deductions oldest advance first, the reasons a close is refused); and the days and stamps the app's own writers leave, against a writer that only knows iron law 2. The calendar on its own - week, account, each man's period, the period after it - in Asia/Jerusalem, UTC, America/Los_Angeles and Pacific/Auckland. Figures worked out by hand, to which BOTH calculators are held. Thirteen mutants: the app loaded again with one line of `js/model/money.js` (or of the account walk in `js/model/schema.js`, or of the fold in `js/model/ledger.js`) changed in memory, each of which must turn the comparison red - two of them the credit dropped at a boundary and a debt of less than nothing carried forward. A census of what the generator actually produced. NOTHING is left out since v180: the accounts downstream of a closed period that used to carry forward less than nothing are compared like any other, and counted (periods opening on a credit, periods where it comes off new money, closed periods handing one on). |
| overpayment | `overpayment.test.mjs` | The two faults the second calculator found, repaired in v180, on fixtures a person can check on paper - and what a phone ALREADY holds, written by v179 on its own bytes out of Git. THE CREDIT: a repayment from an offline phone dated into a closed fortnight leaves no debt and a credit of 500, two figures and neither below zero; 1,500 taken in the next account, one account later or four accounts later is 1,000 owed each time, by both calculators, and the advances add up to the same; a credit raises no wage; an over-settled advance still stops the automatic deduction and refuses a close, as `wording.test.mjs` pins. With nobody over-settled the credit is used at the close and written on the payslip as `creditIn` beside `carriedIn: 0`; a payslip with no credit carries no such field; the statement and the sheet's note name it in the two proposed phrases, a man with none sees neither, no balance is printed below zero. A payslip v179 froze with `carriedIn: -500` opens, unchanged to the byte, and is read as an opening credit of 500. The other ruling (`overpaymentCredit: false` through the flag seam): nothing carried, the excess named and the open period marked for review. THE HALF AGORA: 610 a day and half an hour at 41.25, through the buttons' own doors - the account's wage is 630.63, 630.63 comes off, the judge accepts it, the phone reopens unblocked, and the sheet and the statement show one figure open, closed and reopened. A phone holding v179's closure (630.63 off a recorded 630.625) in each of three states - never reopened, held aside and saved, held aside with the held copy the only copy - opens unblocked with the entry exactly as written and counted; one agora above the printed wage, an agora above a whole-agorot wage and a shekel more are refused at the door and stay held; a held closure a later close was built without stays held. |
| daycheck | `daycheck.test.mjs` | «בדיקת היום» in Node: every rule is a pure function of (schedule, date, layer, today), asked on records written by hand. The previous working day read from the record - an empty record, the first day ever, an empty Friday, a Saturday, a «הכל חופש» day, a Rima-only day, a day worked only by a man since archived, the other layer, a key that is not a date, fourteen days back and fifteen. Not recorded: named only with no site and no «נעדר» after a site on the previous working day - never an archived man, a deleted one or a man archived today. A site left empty said only when one of its men of the day before still has no record, its men named once. The same-as-last-week exception, for the men and for Rima. Rima: a count on the previous working day and none today, never on a date after today, never for an archived site. A day that will not price, equal name for name to what `payrollReport` could not price and to its `hoursUnpriced`, a stamped day read at its stamp. For information: five to twelve working days with no site, and the days that are not regular on one line with each chip's words. A past date and a future one; a holed roster; the input never mutated, two readings the same bytes; the rules half of the file naming no storage, state, DOM or clock and the whole file no writer. Every Hebrew string of `DAY_CHECK_TEXT` word for word and no Hebrew in the code outside it. **Writes nothing:** every key of the disk byte for byte, the record in memory, the queue, the write fence, the cloud, a backup and the rescue file - each with a control that an ordinary edit does move. **Quiet:** twenty seeded seasons (five seeds, two ways of closing an evening, Rima on Fridays or not) read day by day with nothing forgotten and with one thing forgotten, the share of evenings each line speaks on held under a ceiling and the share of real slips it catches held over a floor; `DAYCHECK_NOISE=1` prints the table. The seasons are a model, and the shares are true of the model. **The two doors** another screen embeds it through, pinned by name and arity: `dayCheckFindings(date)` (a flat array, `[]` when nothing) and `renderDayCheckInto(container, date)` (the count), the dialog drawn through them and through nothing else. |
| daycheck-browser | `daycheck.browser.mjs` | The same in a real Chromium: one button at the foot of the day's list - under both trays, whole above the dock, the dock's two buttons and the header's controls as they were, nothing in the WhatsApp dialog - and none on an app with no workers. The dialog entered at its heading, its words on a seeded evening line for line (two sites left empty, a man not recorded, Rima, hours with no number, no daily rate, and a double day for information), the archived man and the men who never worked absent from it, a name written as an image tag drawn as letters. Tab held inside, Escape, «סגור» and the backdrop closing it, the focus back on the button - also after the day was drawn again under the open dialog. A name opening the assign sheet that stays on him and recording nothing; a site scrolled to between the pinned header and the dock with the keyboard on its first control; in the by-worker view a site a name and not a button, and the view not changed for it. An open dialog following a record that changes. The calm line with nothing found, and over «לידיעה» alone. Then the whole of `localStorage` byte for byte, the record and the queue. At 375x667 and 440x956, dark and light, with touch: 44px both ways, 16px, nothing outside the dialog, no sideways scroll, every text 4.5:1, «סגור» under the thumb at the end of a long list, and the same at doubled text. `renderDayCheckInto` into a container of the test: node for node the dialog's list, the count, a name navigating, another date drawn as names only, the calm line and 0. `DAYCHECK_SHOTS=<dir>` writes three JPEGs. **Chromium only - not a real phone.** |
| workercard | `workercard.test.mjs` | כרטיס עובד (`js/ui/workercard.js`), on devices. The card is a fifth surface for a fortnight's money, so what is held is that it cannot differ from the other four: over seeded records under both readings of the money gates - two cycles and a cycle that changes inside the open fortnight, men with no rate, double days, extra hours with and without an hourly rate, advances, cash handed back on approved and unapproved records, a closed fortnight, men with money and no day, men with nothing - every cell on every man's card is the cell the pay sheet prints for him once the card's own button has pointed the report at him (or the sheet's financial line, or its empty sentence), the row's notes are the sheet's, the same figures are found as numbers in the exported sheet and in the message he is sent, what he owes is `openAdvanceBalance` under the words its gate allows and the advances screen's figure once the record is approved, no credit shows on an unapproved record, the fourteen-day strip and the month's count per site match what the suite itself recorded, and the report is left on the range and the men it was on; non-vacuity counted for each case. The gate on `approval.test.mjs`'s own fixture: 3,050 / -5,000 / -1,950 and «מקדמות רשומות» before a durable approval, through a repayment arriving from another phone, 3,050 / -3,050 / 0 with the 950 that carries and «נשאר להחזיר» after it, and the old reading again on a phone opened from the disk as it was. One reading asks the real gate once, a later reading asks again, the function on the page afterwards is the one that was there, and a throw puts the range, the filter and the gate back. The credit in v180's two phrases. Every key on the disk, the record in memory and the queue unmoved by opening, redrawing and leaving the card for every man - with a recorder that then notices a real commit - and its code calling nothing that writes and building no field. The drawn card holding every figure of the reading and no control; a day recorded under an open card on it at the next render; a card whose man left the record closing. One worded control on the crew row with the two that were there in their order. The six new strings word for word, every borrowed one found in its owner's source, no Hebrew outside the two blocks. The file on the page in order and in the service worker's shell. |
| workercard-browser | `workercard.browser.mjs` | The same in a real Chromium, emulated touch: one «כרטיס עובד» on every crew row with the switch and «עוד ⋯» on the pixels they are on without it and the row no taller, the «עוד ⋯» menu unchanged; the card opened from the keyboard, entered at its heading, Tab and Shift+Tab kept inside its three buttons, closed by Escape with the focus back on its opener, by the backdrop and by its own button; no control, field, link or fold in its body; the period's cells for a seeded fortnight as literals, what he owes, the movements newest first, fourteen days today first with an absence, a dash and a two-site day, the month site by site, each site in the colour `siteColorVar` gives it; «שכר - לפי עובד» landing on the reports with the sheet on his period and on him alone and its row equal to the card cell for cell, «מקדמות» landing on his advances with the figure the card showed; a record changed under an open card redrawing it with the focus kept; the disk byte for byte and the record unchanged after every man's card; an archived man and a man with no rate or phone. Then 375x667 light, 440x956 dark, 375x667 dark at doubled text and 320x568: no sideways scroll on the crew screen or in the card, every control 44px both ways, the card wholly on the glass, nothing past its edge, no text under 14px, the three buttons on the glass at its foot, no field on it. NOT a real phone. |

`oracle.mjs` is not a suite: it is the second calculator, and it asserts nothing.

`shot.mjs` is not a suite: it takes one screenshot and asserts nothing, for the
question the suites cannot answer — whether the screen is worth looking at.
`embedded.html` hosts the app in a sandboxed iframe; `serve.py` is a threaded server
whose `?slow=N` holds a response N seconds, for testing stuck-network behavior.

## The second calculator (`oracle.mjs`, `oracle.test.mjs`)

    npm run test:oracle             # the comparison; in `npm test`
    npm run test:overpayment        # what it found, repaired; in `npm test`

**Why it exists.** Every other money suite holds the app to literals somebody typed for
one crew. That proves those cases; it cannot find the one nobody thought to type, and a
silent arithmetic disagreement is by definition one nobody thought of.

**What makes it independent.** `oracle.mjs` imports nothing from `js/`, is handed the raw
record and nothing else, and was written from the rules where they are written down:
iron laws 1 and 2 in `CLAUDE.md`, `docs/architecture.md` («The shape of the record»,
«Money»), `docs/weekly-cycle.md`, `docs/releases.md` (v166) and the comment blocks that
state a rule in words. It does its sums differently on purpose - integer day numbers
instead of local `Date`s, integer agorot instead of floats - so a shared habit cannot
make two answers agree.

**Where it is NOT independent** - rules written down nowhere, where it does what the code
does and says «FOLLOWS THE CODE» at the line. Agreement on these proves nothing:

- `hoursUnpriced` is raised only on a day that HAS a daily rate; a day with neither rate
  does not raise it.
- `mixedRates` counts a day with no daily rate as a day «at a rate» of nothing.
- An `extra` day is a normal day with hours; hours count on whatever band they sit on.
- A man put back because the record still names him comes back with no rate and no pay
  cycle when nobody remembers him (`reinstateReferenced` with nothing remembered).
- The over-settled state stops the automatic deduction on EVERY open period of the man,
  past ones included, as soon as it exists; it is read as of today, not as of the period.
- An account's `given` is read from the old `advances` field, while whose repayment it is
  comes from the fold (they differ only after a `corrected` entry, which nothing writes).
- A close may write a deduction against an advance dated AFTER the period it closes, once
  the older ones are used up; what an advance has left is read as of the period's last
  day (`outstandingWithout`).
- The most a person may choose to deduct is the smaller of what is owed and the wage.
- The shape of a closure's entries, their ids, and the approval record `cm_carry`.
- The legacy pair `payCycle`/`payCycleFrom` is read only when `payCycles` is empty.

**What it does not cover.**

- Anything in `js/ui/`: the sheet's own columns (`moneyOf`, `moneyCells`, `payrollRows`,
  which rows stay on the sheet), the worker's statement, the exported files and every
  Hebrew word. The comparison stops at the model functions those surfaces read.
- A wage finer than an agora (an hourly rate with an odd number of agorot times a half
  hour) is not GENERATED. The rounding is a rule since v180 (docs/architecture.md: the
  wage of an account, to the agora, once, half up) and both calculators are held to it
  in `overpayment.test.mjs`, on 630.625. What is not covered is a sum binary floating
  point cannot hold at the half: half an hour at 33.33 is 16.665 on paper and
  16.66499... in the app, which prints, pays and deducts 16.66 on every surface alike,
  where the second calculator's whole agorot would say 16.67. A rate held finer than an
  agora on the record is still refused by the second calculator outright.
- `corrected` and `cancelled` ledger entries. No screen of this build writes either; the
  generator makes none. A probe by hand says the account walk ignores both (it reads the
  old field), so a `corrected` amount gives one figure on the pay sheet and another on
  the advance, and a `cancelled` advance goes on being deducted - latent, reported, and
  not asserted anywhere.
- Vehicles (the flag is off; the suite only checks that nothing is paid for one), the
  retired `plan` layer, negative legacy advances, an advance that exists only in the
  ledger, a closure written before closures carried `periodTo`/`gross`/`basis`, a clock
  that is behind (`clock`), a chosen deduction that is not allowed, and anything a
  second phone, the wire or a restore does to a record. Other suites own those.
- `openAdvanceBalance` on a record where somebody still owes at the end. NOT for the
  arithmetic: behind it `carryReportingEnabled` re-plans the carry migration on every
  call (`planAdvanceCarry`), in fixed fortnights, and while any man's balance has not
  cleared - no rate, archived, over-settled, or simply not yet earned back - that plan
  walks four thousand fortnights looking for the one where it does. Measured in Node on
  a 26-man record: about 0.4 s per call, on a function the pay sheet asks on every draw.
  It is a cost, not a wrong number, and it is why this suite asks that one question only
  on records where everybody's account has run down to nothing.

**What it found, and what became of it.** Two things, both repaired in v180
(docs/releases.md) and both green in `overpayment.test.mjs`; up to v179 they were kept
out of the comparison by name and proved red in `oracle.findings.mjs`, a file no gate
ran. That file is gone and nothing is excluded.

1. A closed period could carry forward LESS THAN NOTHING (`advanceWalk`,
   `js/model/schema.js`), and the credit lived for exactly one period boundary. The
   ruling v180 is built to: money a man gave back beyond what he owed stays his credit
   until it is used. The second calculator was changed to that rule - it used to carry
   zero - so the comparison of those accounts is two implementations of the NEW rule,
   written the same week by the same hand; the fixtures in `overpayment.test.mjs` are
   the part a person can check on paper.
2. A wage finer than an agora, closed against a debt at least as large, had the wage
   rounded up taken off it and was then refused by the app's own judge. The wage of an
   account is now rounded once.

**Where the account and the advances can still differ**, by design and older than
either finding: the account walk takes an OPEN past period to have deducted what it
could, and what an advance has left counts only deductions a close wrote down. The two
agree where every earlier period was closed, and `overpayment.test.mjs` asserts it
there and nowhere else.

**A new finding** goes where these went: a fixture a person can check on paper in
`tests/<suite>.findings.mjs`, its name in `FINDINGS` in `gate.integrity.test.mjs` (empty
today), and an exclusion BY NAME, counted, in the suite that found it.

**The mutants, and doing one by hand.** The suite loads the app again thirteen times with one
line changed in memory and requires red each time. To see it on a real file: copy the
tree somewhere outside the repository, change one thing in the copy's
`js/model/money.js` - `(doubled ? 2 : 1)` to `(doubled ? 3 : 1)` in `payrollReport` - and
run `node tests/oracle.test.mjs` in the copy. Never in the checkout: a cached file
changed without the three stamps is a different failure.

**Reading a failure.** Every line names the seed, the man, the range, the field, what the
app said and what the rule gives. The record is `makeRecord(seed, APP)` in the suite. A
disagreement is settled by the documented rule, not by making either side match: if the
rule supports the app, the second calculator is wrong and is fixed; if it supports the
second calculator, the case goes to a findings file as described above; if no rule
says, it is listed above.

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
the sync group — both orders satisfy the real definition-time dependencies, and the
code is the one to trust.)

Since v102 the sync group is six files, not one — `sync.js`, `restore.js`, `receive.js`,
`send.js`, `status.js`, `boot.js` — and their ORDER is load-bearing in this list exactly
as it is in `index.html` and in `sw.js`'s SHELL. `boot.js` runs two lines at load time
and must stay last; anything it reaches has to be above it. A suite that builds a device
from an OLDER commit must use that commit's file list rather than this one's — see
`tests/fence.legacy.test.mjs`, which was written against `loadOrder()` and went red the
first time a file was split, because reading today's file names out of a commit from
before they existed is a demand that the past contain the present.

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

### An existing browser suite with the pay book open

`tests/gate-open.preload.mjs` is an instrument, not a suite, and no chain runs it:

    node --import ./tests/gate-open.preload.mjs tests/forms.browser.mjs

Every page the suite opens gets `FARKAD_FLAG_OVERRIDES` with `paybook: true` before the
app's scripts load; a suite that sets the seam itself keeps what it set. What fails under
it is what moves in the commit that opens the pay book - `docs/payroll-closure.md`, «The
existing suites with the gate open», is the list as measured.

## The gate-open matrix (`npm run test:gate-open`) - an instrument, in no gate

`tests/gate-open.matrix.mjs` runs every suite of `npm test` and of `test:all` through
`tests/gate-open.preload.mjs` - `paybook`, `months` and `cold` opened through the test seam
on every harness device and every browser page whose suite named no gate - and compares
what differs with a list a person keeps, `tests/gate-open.expected.mjs`, BOTH ways: a
difference not on the list fails it, and so does an entry that no longer differs. The
seventeen suites whose subject is the gate are named there and not run. `--node`,
`--browser`, `--only=test:a,test:b`, `--jobs=N`, `--print`, `--logs=<folder>`. The browser
half takes about as long as the browser suites themselves. No gate runs it: the gates run
the build as it ships. Run it on the commit that is to be served, before the owner turns
the pay book on (docs/payroll-activation.md, A2).
