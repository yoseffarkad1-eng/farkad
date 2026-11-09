# The suites

Sixty-three suites, forty-five of which need no browser at all. (Counted off
package.json, which is the only place a suite count is true: `npm test` names the node
suites, `test:all` adds the eleven browser suites, `test:release` adds sendclaim and the
six emulator suites. The count in this paragraph is re-counted whenever a suite is added
and is true of nothing but the commit it was written on.) From a clean clone:

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
| scroll-browser | `scroll.browser.mjs` | The day screen keeps its place. At 440x894, 390x844 and 375x667, dark, 3x, touch: ✕ under the sticky header and deep in the list, «בטל», ↶ and ↷, a site's picker, a site chosen in the tray, a rate chosen in the sheet a man's name opens, a Rima count saved mid-page and typed from one site's box into the next, three shapes of snapshot from the other phone, and a dialog closed after ⚙ each leave the rows on the screen where they were - and renderDay's own scroll read never sees a clamped page - while every site's number on screen is checked against the record and the disk. What must still move is measured too: a new date opens at its top, the header compacts and comes back. A double tap - on a row's ✕, on the ✕ of a «נעדרים» chip, on a man's row in a site's picker or on a site in the tray's «לאן הלך», 120 ms or 400 ms apart - is one tap: exactly one man off (or one absence cancelled) and the undo bar naming him, or the man left added or placed, in memory and on the disk; 900 ms apart it is two taps - each pair judged by the gap the page itself saw, the clock the guard reads. Back from the week tab, the window stays where it was. A render arriving while a Rima box or the hours box in a man's assign sheet has the focus - a commit elsewhere, an adopted snapshot, the assign sheet closing (the Rima box only: closing the sheet that holds the hours box is leaving that box) - throws nothing, logs no console error, commits nothing but what was committed and changes exactly what it brought. At the end of the page, the last man in the tray placed on a site above moves the screen by less than a row. `WITH_WEBKIT=1` adds Playwright's WebKit, which is not an iPhone. |
| seder | `seder.test.mjs` | The seder to each worker (v167), on devices: the list is exactly the men the day's group message puts under a site - nobody נעדר, nobody on a הכל חופש day, nobody with no site, never Rima, a man on two sites once with both; each man's Hebrew message and every word of the list, pinned word for word as the owner approved them on 2026-11-07 (no «איתך» line under a site where he is the only one of the owner's men); a phone number becomes a wa.me number only when it is plainly an Israeli mobile; two men on the list with one number each told so, neither dropped, and only men on the list compared; and the progress - who was opened, who was left out - kept per date through Store, surviving a reopen, never shown on another date, disbelieved once the seder it was opened for changes, and never in the schedule, the outbox, the cloud, a backup, the rescue file or the write fence. |
| seder-browser | `seder.browser.mjs` | The same in a real Chromium: the one entry inside the WhatsApp dialog (and none on the day), a man left out, the run's tap going to `wa.me/<number>?text=` with the address on the link before the finger lands, the next man ready on the way back, a reload mid-run bringing the list back on the evening it was sending, 44px targets, 16px inputs, right to left, thirty men on a 320px phone with the run still under the thumb; and on a touched phone, two taps 120 ms apart (and two clicks, a double click, the run and a row's door together) opening one man and marking one, the run's button keeping him until the moment is over, and the shared-number note on both rows. wa.me is answered by a route on the test's own context; nothing leaves the machine. |
| bars-stale | `bars.stale.test.mjs` | The frame iOS pushed up (v167), decided in Node: `js/ui/bars.js` in a V8 context whose window, visual viewport, `navigator.standalone`, clock and rectangles are a stuck home-screen iPhone's (the owner's 2 November report and screenshot, checked first). The rule one frame of readings at a time - stuck, a real keyboard, a picker wheel, a pinch, Safari in a tab, an Android install, v116's raised rectangle, both raises at once never added; the page's own writes through a stuck evening - nothing moved at the top or while settling, the bars and a top-anchored dialog on the glass once scrolled, a field tapped inside an armed frame keeping it while the keys hide the bars, off the frame the viewport is whole; and a whole stuck scroll down, up and down again under BOTH readings of where WebKit measures a rectangle from, with the tab bar and the date header 0px off the glass and the ⋯ report's `rectGap` saying which. Never run on an iPhone. |
| bars-stale-browser | `bars.stale.browser.mjs` | The same in a real Chromium, with the visual viewport and `navigator.standalone` faked before the app loads and the glass computed by WebKit's rule: the bars, the undo bar and the room the page keeps through a stuck scroll, the window-scroll failsafe with no visualViewport event, a real keyboard and the settling after it, the ⋯ lines; the assign sheet, a dialog, the seder list, the worker picker with its search box tapped, the reminder banner and the pinned date header on the glass; and every element whose computed position is fixed - found by walking the page, by reading every stylesheet rule that makes one fixed at that width, and by scanning the scripts for an inline one - moved by offsetTop exactly once, so a fixed layer added later and left off the list fails by name. |
| declutter-browser | `declutter.browser.mjs` | The day screen decluttered (v167), in Chromium with touch, dark, at 3x. No select, rate control or hours box on any row of any site: a row is the man's name and the ✕, and a tag only for a day that is not regular, worded with the rate's own label (`RATE_LABELS`) word for word and per site, with «2 אתרים» kept and each row's place key (`row:<site>:<man>`) kept. The name - a target of at least 44px each way, named for a screen reader with the man, the site and the rate - opens the assign sheet for that man; «יום כפול» chosen there commits once, appears on his row, and is the same on the screen, in memory and on the disk, through ↶ and ↷; his overtime hours box is in that sheet. Opened from a row the sheet stays on him through «נעדר» and a re-place, with no forward button; opened from «נרשמו X מתוך Y» or the by-worker list it still walks the evening, and the tray still opens the place picker. Two taps 120 ms apart on a name change nothing, whether the second lands on a site's tile or on the backdrop above the sheet. Scrolled, the compact header is one row (B1) at 440, 390 and 320. 44px targets, the ✕ on its man's line and nothing over the edge at 320, the longest name with its tag included. |
| design-browser | `design.browser.mjs` | The one look (v169), in Chromium. At 440x956 dark with a fourteen-man crew: eleven whole worker rows between the header and the dock, every one 56px; the strip above the day 52px or less with its settings button still saying «הגדרות», 44px both ways, opening the panel and taking the focus back. A button's words are unchanged beside its drawn glyph: the emoji is still in `textContent` and in the accessible name, clipped to a pixel; a relabelled button is dressed again, once; a button with no emoji is left alone; the WhatsApp message textarea keeps its own emoji and gains no child. At 375 and 320 the date is not cut and the page does not scroll sideways. In both schemes: ten colour pairs at or above their stated ratios, the ten site colours byte for byte what v140 set, and on all five screens no target under 44px in either dimension and no field under 16px. |
| transport | `transport.test.mjs` | הסעות (v171), in Node. The engine (`js/model/transport.js`) on a synthetic fourteen-man day: the pinned plan, two runs the same bytes, suggest idempotent on its own output, the input never mutated; not enough seats said and never squeezed; a locked vehicle byte for byte and a locked worker in place; a vehicle nobody may drive flagged and never given an ineligible driver; a driver moved out of a passenger seat to a car standing free; a man with no pickup area (and a day with no areas at all) still planned for; the 9-seater's 2-2-2-3 layout, the five-seater's, and no «ממתין». On devices: the seven vehicles and the list the owner keeps; who works where read through `sederCrew` and a man on two sites riding to the first; moves, drivers refused unless eligible, locks; a partial plan accepted only with a typed reason, versions append-only across a reopen; the driver's message line for line with the vehicle's name held right-to-left; marks un-believed when the message or the number changes; the store's isolation - schedule bytes, outbox, write fence, cloud, backup file, restore point and rescue file all without a byte of it; an unreadable transport record copied aside, the day still committing, and nothing written over bytes that could not be copied; a full disk spending no restore point; pruning at 35 days; the switch (off: every change refused, no transport key but the switch read, none written, no entry drawn); the retired vehicles flag untouched; and every Hebrew string of `TRANSPORT_TEXT` word for word, with no Hebrew anywhere else in the screen's code. |
| transport-browser | `transport.browser.mjs` | The same in a real Chromium, the whole evening four times (440x956 and 375x667, dark and light): no entry until the switch in ⋯ is turned on; then one row in the WhatsApp dialog under the seder's and nothing on the day; the panel entered at its heading and the app's own questions opening over it; areas added, two men's areas and driving rights set through the controls; five vehicles marked as staying, one added, renamed and retired; suggest, a man moved by tap-then-tap, the driver list offering only eligible men, a lock a suggestion respects; accept refused without a reason, versions 1, 2 and 3; the driver's link's exact `href` and `target=_blank` read off the link and NOT followed, «נפתח בוואטסאפ», «סימנתי שנשלח», a changed message un-believing the mark; on every view 44px both ways, 16px fields, no sideways scroll, at most one filled button; `scheduleData:v2` and the queue byte for byte at the end; Escape and focus back; a reload; the switch off again. `TRANSPORT_SHOTS=<dir>` also writes four JPEGs. Chromium only. |
| settings-order-browser | `settings-order.browser.mjs` | The ⋯ sheet in strict order (v172), in a real Chromium. The three sections and their nine cards by their own titles, in order; the sync card a plain `<section>` with nothing in it inside anything that shuts, the advances review directly under it; every other card a `<details>` whose `<summary>` is the card head. On opening: גיבוי open, the rest shut, the filled button on the glass at 440x956; after Escape and after «חזרה» focus is back on `#settingsBtn` and the next opening is the default again, with nothing about the rows in storage. A person's open and shut rows survive `render()`, a settings redraw, a snapshot adopted through `FarkadSync.receive`, the connection changing and a reminder check. Each self-opening reason through the state that causes it: a record that will not read (truncated `scheduleData:v2`, reloaded - and the banner's own export button), a problem arriving under the open sheet, a restore outstanding, a pending restore that cannot be read, a restore's answer, an empty crew beside a restore point, and beside a cloud copy that arrives after the sheet is drawn (and a full crew beside a restore point NOT opening it), a subscribed phone the server does not know and one that blocks notifications (and a registered one, and an arrival from a reminder, NOT opening it), a waiting build, one arriving, a check asked with the sheet shut, a storage warning; with every reason standing הסעות and מידע טכני still shut; a row shut by a person staying shut through a redraw while its reason stands. The inventory: every control (tag, id, words, inline handler) and every sentence of the v171 sheet, captured from `b640c5a`, found with every row open; the three script-built controls pressed; one filled button. Enter on a row, Tab from the last row wrapping to the first control and never into a shut row. Rows 56px and every target 44px both ways, fields 16px, no sideways scroll, the drawn corner and no browser triangle, at 440x956, 375x667 and 320x568 in both schemes, as opened and with every row open; the jump buttons moving focus to headings that clear the fixed navigation; doubled text clipping no title. Folding writes nothing: the schedule and every `localStorage` key byte for byte. Chromium only - nothing here is an iPhone. |
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
