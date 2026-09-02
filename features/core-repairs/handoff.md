# Handoff — the core repairs after review (v94, and v95 after the second review)

- Branch: `cd-work` → published as `claude/farkad-mobile-design-review-odl8ue`
- SHA: `503101488595ff8e3f8d595ede5db3311a5975d8`
- Base (contract): `10a40a5c6d5d27e5c919d01799ea29ebb0d9d3c6` (v93 compact day on the v91 core)
- Build stamps at the SHA above: `farkad-build` v95 · `APP_VERSION` v95 · `VERSION` farkad-v95
  (v94 was stamped at `9f11abf` after round one; round two changed cached files again, so the stamps moved again)

## What was fixed, and by which pair
The fifteen findings of `features/core-repairs/findings.md`, four branches, each finding a
fail-first test commit followed by its fix (the verifier ran every new test against the
base with only the test file copied and saw it fail there):

| # | sev | pair | pinned by |
|---|---|---|---|
| 1 | P1 | ef5b62d → d9ea323 | tests/contested.test.mjs «an edit made before the session has heard the cloud» |
| 2 | P2 | (same pair) | tests/contested.test.mjs «the document's last writer is not the path's» |
| 3 | P2 | d8b70f4 → 63b7776 | tests/contested.test.mjs «a hold decided before the send is reported as itself» |
| 4 | P2 | (ef5b62d → d9ea323) | tests/cas.test.mjs «two phones adding to the same worker's day, the second coming back later» |
| 5 | P2 | 467a55d → 7f4d038 | tests/receipt.test.mjs «a retry answered from its receipt still takes the correction made meanwhile» |
| 6 | P2 | 30eb51c → 39dcb3f | tests/merge.test.mjs «a reopened phone carries the evidence on the schedule itself» |
| 7 | P2 | bffbc4f → 2969f69 | tests/snapshot.poison.test.mjs «…still released after many opens» |
| 8 | P3 | 47d7b27 → e1f7135 | tests/snapshot.poison.test.mjs (two new rows in the case table: the days map) |
| 9 | P3 | ee44e9f → 03dfc09 | tests/snapshot.poison.test.mjs «after an acknowledgement, the same poison arriving again reparents nothing…» |
| 10 | P3 | f610847 → ddb3151 | tests/status.test.mjs «a record it could not read, acknowledged, is not an error on every snapshot» |
| 11 | P3 | a0ffc78 → 11bfb04, then fe9875c → bfd4631 (the rescue door opens a held phone's file), e3af22c → 288af5b (evidence waits for the boot render) | tests/restore.test.mjs R8, plus the rescue-file test named in the re-gate commit |
| 12 | P3 | 065db51 → e2d9d39 | tests/receipt.test.mjs «a replay that empties the queue leaves the line saying synced» |
| 13 | P3 | ecaff5b → d669a5a | tests/cas.test.mjs «the loser of a create race whose snapshot is late merges without an error» |
| 14 | P3 | f58490a | tests/README.md (documentation; no pair) |
| 15 | P3 | 221d534 | docs/releases.md (documentation; no pair) |

## The design that closes 1–4 (sync.js, the send path)
Every `days.`/`ledger.` operation now carries `seen` in the same verified write as the
operation: the durable disk value at the path (`VALUE_ABSENT` for nothing — a word
canonicalJson cannot produce), the last snapshot's value when one was heard, and the chain
of this device's own superseded values. `base` is kept beside it unchanged for an older tab
during a handover. At send time a path is held iff the server's value there is neither
absent, nor the operation's own value, nor in `seen`; the hold is routed through `fail()`
with `error.contested`, so the status says 'contested' and its line. The document's author
is consulted only for a queue an older build wrote (no `seen`), read as that build read
it, except that its bare null is read as "unheard" and held when somebody else now holds a
value there.

## Round two — the merged tree reviewed again, seven findings, closed the same way
The merged v94 tree (`9f11abf`) went through a second adversarial review (three lenses,
every finding independently verified; `features/core-repairs/findings-round2.md`), which
found one P1 the first round had not reached — the create-race loser's learn→update path
bypassing the hold — and six more. Each was closed as a fail-first pair on a branch off
`9f11abf` and verified again before merging:

| # | sev | pair | pinned by |
|---|---|---|---|
| R1 | P1 | b240147 → 384c40e | tests/cas.test.mjs «two phones adding to the same worker's day on a project with no document yet» (a prompt listener; a listener 150 ms behind the transaction) |
| R2 | P2 | 1e3e496 → c49be89 | tests/status.test.mjs «a phone whose listener has died is not finished when its own write lands» |
| R5 | P3 | cc267af → 4ea27d6 | tests/snapshot.poison.test.mjs «a poisoned snapshot acknowledged mid-session is adopted without waiting for the cloud» |
| R3 | P2 | b16dae0 → 350547d | tests/snapshot.poison.test.mjs «after an acknowledgement, a sibling edit on the poisoned map is the same sighting» (+ the days map, + two names are two sightings) |
| R4 | P2 | af4c138 → 3438272 | tests/recovery.test.mjs «E8: the rescue door holds the phone once the rescue is loaded, and not for a preview» |
| R6 | P2 | 501f65c → f9ab62d | tests/smoke.mjs — three chip reads beside the five: a held edit is «דורש הכרעה», a suspended sync is «הסנכרון מושהה», a blocked queue |
| R7 | P3 | 3e3c6cb | docs/releases.md v94 entry; tests/README.md (documentation; no pair) |

What R1 does: `createDocument`'s already-exists branch hands the document it read on, and after
`noteRevision(fresh)` asks `movedUnder` of every `days.`/`ledger.` path in the patch against
`fresh` — the pre-send question, the same hold (`holdContested`, `_heldNow` fallback), the same
`error.contested` route into `fail()` — so the loser's half never leaves its phone and the status
says 'contested'; the rest of the batch goes out on the send ladder.

What R2 does: the subscription lives in `listen()`; the adapter's onError goes to
`listenerFailed()`, which sets `_listenerDead`, fails, and schedules `relisten()` on its own
ladder (not the send ladder, which a landing send clears); `honestStatusFor` answers 'error'
while the flag stands; only a snapshot delivered by a listener clears it. No new Hebrew string.

What R3/R4 do: a sighting is `{ at: <map>.<name>, json: JSON.stringify(map[name]) }`, so a
sibling edit is the same sighting answered from the first copy (older copies under the map's
key stay on disk until one acknowledgement clears both); `Recovery.collect()`/`deliver()` let the
rescue door READ a file without reporting, and the reports are delivered only after the person
confirms and the local replace stage has landed — on cancel nothing touches the disk.

Expectations moved deliberately in round two: three pinned quarantine keys in
tests/recovery.test.mjs read `…poison:ledger.unreadable.__proto__` (the per-name identity);
E8's first suite now asserts the evidence rides on the read result and the reading phone is
not held. The persist gate's refusal for a hold is an internal English message ('held until a
person has looked'), no longer the 'no room' wording, pinned nowhere.


## Expectations moved deliberately
- tests/cas.test.mjs «same moment»: the setup withholds the snapshot instead of nulling
  `_revision`/`_baseDoc` on a phone whose disk had adopted the day; every check unchanged.
- tests/probes.test.mjs Q3: the newer tab's value lands by rebase on one disk (the disk is
  the device). Q2 and Q3 pin the two timings of finding 4 and cannot both keep their old
  expectations under one consistent rule; a per-operation device id was prototyped and
  rejected because it breaks Q2.
- tests/harness.mjs: `landing()` now passes `apply`'s answer through (it had been swallowing
  the bootstrap's document in the un-held case); the fake adapter mirrors the production
  adapter's replay answer `{ replayed: true, revision }`.

## Verifier caveats accepted as-is (none blocking; named so nobody is surprised)
- #12: a terminal listener error followed by a successful write read 'synced' after round
  one — the second review made it R2 and round two closed it (a dead listener is 'error'
  until a listener delivers again).
- #5: an ordinary write's echo is received twice (harmless, one persist).
- #13: if the already-exists branch's `read()` rejects, the loser's identical roster paths
  end in a 'contested' hold (the day still lands) where the base gave a transient error.
- #9: `Recovery.evidence` clears `acknowledged` when genuinely new bytes arrive under an
  already-acknowledged poison key — the phone re-blocks until acknowledged again; scoped to
  the poison family only.
- Two adjacent pre-existing gaps named in ddb3151 and left untouched: the ledger-clash
  block's identical `fail()`+return shape, and the constant-key dedup that hides a new
  unreadable entry after acknowledgement.

## Migrations
None. The outbox record gains `seen` (optional; absent on old records, which are read as
before with null meaning "unheard"). Old records: tested by the older-build-queue checks
in tests/contested.test.mjs. Rollback: revert the merge commits.

## Test output (verbatim, release gate on the final SHA)
```
=== npm run test:release on 503101488595ff8e3f8d595ede5db3311a5975d8 at 01:34:38
node tests/isolation.test.mjs: 18/18 checks passed
node tests/blobs.test.mjs: 11/11 checks passed
node tests/build.test.mjs: 29/29 checks passed
node tests/poison.test.mjs: 37/37 checks passed
node tests/merge.test.mjs: 28/28 checks passed
node tests/contested.test.mjs: 73/73 checks passed
node tests/receipt.test.mjs: 28/28 checks passed
node tests/data.test.mjs: 1943/1943 checks passed
node tests/recovery.test.mjs: 75/75 checks passed
node tests/adversarial.test.mjs: 116/116 checks passed
node tests/probes.test.mjs: 35/35 checks passed
node tests/capacity.test.mjs: 44/44 checks passed
node tests/concurrency.test.mjs: 46/46 checks passed
node tests/exports.test.mjs: 42/42 checks passed
node tests/fence.test.mjs: 35/35 checks passed
node tests/fence.ingress.test.mjs: 43/43 checks passed
node tests/fence.legacy.test.mjs: 21/21 checks passed
node tests/money.history.test.mjs: 9/9 checks passed
node tests/money.units.test.mjs: 21/21 checks passed
node tests/money.cloud.test.mjs: 17/17 checks passed
node tests/money.display.test.mjs: 4/4 checks passed
node tests/snapshot.poison.test.mjs: 82/82 checks passed
node tests/repayment.test.mjs: 45/45 checks passed
node tests/ledger.ingress.test.mjs: 151/151 checks passed
node tests/cas.test.mjs: 88/88 checks passed
node tests/status.test.mjs: 29/29 checks passed
node tests/money.test.mjs: 40/40 checks passed
node tests/money.ingress.test.mjs: 206/206 checks passed
node tests/method.test.mjs: 51/51 checks passed
node tests/restore.test.mjs: 51/51 checks passed
node tests/upgrade.test.mjs: 48/48 checks passed
node tests/vehicles.test.mjs: 61/61 checks passed
node tests/xlsx.test.mjs: 54/54 checks passed
node tests/nonassertions.test.mjs: 23/23 checks passed
node tests/labels.test.mjs: 23/23 checks passed
node tests/labelcache.test.mjs: 32/32 checks passed
node tests/smoke.mjs: 1044/1044 checks passed
node tests/print.test.mjs: 65/65 checks passed
node tests/mobile.test.mjs: 671/671 checks passed
node tests/update.test.mjs: 30/30 checks passed
node tests/recovery.browser.mjs: 25/25 checks passed
node tests/handover.test.mjs: 26/26 checks passed
node tests/swrestart.test.mjs: 31/31 checks passed
node tests/swidentity.test.mjs: 55/55 checks passed
node tests/sendclaim.test.mjs: 43/43 checks passed
firebase emulators:exec --only firestore "node tests/rules.test.mjs": 59/59 checks passed
firebase emulators:exec --only firestore "node tests/cas.emulator.test.mjs": 24/24 checks passed
firebase emulators:exec --only firestore "node tests/rollout.test.mjs": 17/17 checks passed
firebase emulators:exec --only firestore "node tests/bootstrap.emulator.test.mjs": 23/23 checks passed
firebase emulators:exec --only firestore "node tests/bootstrap.rules.test.mjs": 28/28 checks passed
EXIT=0 at 01:50:07
50 suites · 5800/5800 checks
```

## Contract items NOT completed
None of the fifteen success criteria is open. Not claimed: physical-device coverage.

## Known gaps left open, measured and named
- A poisoned worker key inside a day LAYER of a phone's OWN stored record (not the
  snapshot road) is still refused by `storedScheduleProblems`/`dayProblems` at boot, so
  such a record is held whole as damaged and its rescue file's `scheduleData:v2` is refused
  on that ground — pre-existing on the base, not introduced here; relaxing State.load's
  own gate for poison names was judged outside this round.
- (Closed in round two by R4: the first import of a rescue file carrying a poisoned map
  used to hold the phone before the replace and then fail it with the «אין מקום» wording;
  the rescue now lands first and the hold is raised after, with the right sentence.)

## Known risks
- The emulator suites ran in the release gate below; the production adapter's only change
  (the replay answer) was reasoned about by the receipt agent and is covered by that run.
- No physical iPhone has run any of this (docs/iphone-acceptance.md, all rows NOT RUN).
