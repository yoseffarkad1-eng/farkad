# Handoff — v96: the advances ledger onto v95, both gates shut, and the week grid at its pitch

- Branch: `cd-work` → published as `claude/farkad-mobile-design-review-odl8ue`
- SHA: `40d50041586612a65a391d99a278d92c64afc646`
- Base: `021254f` (v95, served from `main` as `109502c`)
- Build stamps at the SHA above: `farkad-build` v96 · `APP_VERSION` v96 · `VERSION` farkad-v96
- Gates at the SHA above: `LEDGER_WRITES` false (`js/model/ledger.js`), `carryAdvances` false
  (`js/model/schema.js`). Neither moved. Flipping either is a person's decision, taken only
  once all three phones show v95 or later — the v95 send path is what makes a ledger write safe.

## What was taken, and how it was checked
Two branches, each built by one agent in its own worktree off v95 and each verified by a
second agent that tried to refute it before the merge:

| merge | branch | what | verified |
|---|---|---|---|
| `d11ef3c` | `v96/ledger` (`d9fcdb1` → `f0cca08` → `3513856`) | Opus's ledger branch (`claude/farkad-ledger-enable-ready` @ `dea4ee1`, v92, "must not be merged yet" because it flipped the gate) three-way merged over the repaired send path; both gates closed again at `f0cca08`; the suites that measure the open build open it through the harness seam (`FARKAD_FLAG_OVERRIDES`) | a faithful merge, nothing found that loses a recorded day, prices a day differently on a shipped build, or opens a gate; `npm test` 42 suites 4225/4225 and all nine browser suites green at `3513856`; two P3 notes, both folded below |
| `ed9bede` | `v96/weekpitch` (`f00d5ed` → `42097f8`) | the week grid at a 48px pitch in both directions, edge to edge inside its own strip; the mobile suite moved from the 44px floor to the pitch, deliberately, and pins where the week fits (430) and where it scrolls (320/375/390) | fail-first proven (the test alone on v95: 667/675, the eight reds all the pitch); 675/675 on the fix; the sticky name column and the RTL scroll probed independently; two optional P3 notes, both folded below |

The merge itself: git reported thirteen conflicting files because the ledger branch had
re-applied cd-work's core commits under new SHAs; every core file was three-way merged
against `c744d49` and the thirteen collapsed to one real disagreement, the `moved` filter in
sync.js's conflict branch, written as the union of both sides (a path is moved if the
frozen record is present and is either this device's own or somebody else's value). Full
file-by-file account: the `d9fcdb1` commit message.

## The four notes, folded at `4535a7b`
- js/state.js: the "every other part of the container" loop existed twice after the merge
  (the ledger's four-key copy without the poison guard, then cd-work's two-key guarded
  copy). One loop now: skips `advances`, `unreadable`, `migrations`, `unreadableMigrations`
  and every poison name. Verified harmless before the fold; folded so the function that
  decides what a saved record keeps says one thing.
- js/model/schema.js: `closedPeriods` is read by `payrollReport`, `workerDaysReport` and
  `advanceWalk` with no gate in front of it, so a closure on the record freezes a
  gate-closed phone's row too. Decided: kept, and PINNED — tests/closure.test.mjs «a
  fortnight closed on one phone is frozen on a phone whose gate is shut» (a shipped-flags
  device loading the closed record, removing a day, still printing 3,050 and five days,
  across a reopen). The reason is on the read: two phones must not print different money
  for one payday. No shipped build can write a closure, so today this is unreachable.
- tests/mobile.test.mjs: the 430 fit check now asks the narrowest shown day for the pitch
  in the same assertion as the count, so it goes red on the 45px case by itself; the
  comment says which check pins which half.
- css/app.css: the phone page padding is `--page-pad` on `.app` and the week strip gives it
  back through `calc(-1 * var(--page-pad, 12px))` — one number, not two copies.

## Expectations moved deliberately
- tests/mobile.test.mjs: «a cell … is at the 48px pitch in both directions» and the
  per-cell count, 44 → 48 (`f00d5ed`; the reason is in the test and in the css comment).
- tests/data.test.mjs: two pins moved at `f0cca08` when the gates were closed again (the
  open-build expectations now run through the seam); count unchanged.
- tests/closure.test.mjs gains one suite (92 → 95): a pin, not a fail-first pair — the
  behaviour it pins existed on the merge; the test makes gating it later a decision.

## Migrations and the record on disk
No data migration runs. Two shape notes:
- A phone on this build writes `ledger.migrations` and `ledger.unreadableMigrations` as
  empty maps into its record. v94 and later carry unnamed ledger parts through a load; v86
  and earlier drop them on save. Empty, that loses nothing. It becomes a rollout condition
  the day a migration is APPROVED on a record: every phone must be past v94 by then, which
  the gate rule above already requires.
- Nothing this build can write reaches `closedPeriods`; a closure on a record comes only
  from a gates-open phone or the test seam.
Rollback: revert `40d5004`, `4535a7b`, `ed9bede`, `d11ef3c` (four commits, no data change).

## Test output (verbatim, release gate on the final SHA)
```
=== npm run test:release on 40d50041586612a65a391d99a278d92c64afc646 at 09:36:24 v22.22.2
node tests/isolation.test.mjs: 18/18 checks passed
node tests/blobs.test.mjs: 11/11 checks passed
node tests/build.test.mjs: 29/29 checks passed
node tests/poison.test.mjs: 37/37 checks passed
node tests/merge.test.mjs: 28/28 checks passed
node tests/contested.test.mjs: 73/73 checks passed
node tests/receipt.test.mjs: 28/28 checks passed
node tests/data.test.mjs: 1944/1944 checks passed
node tests/recovery.test.mjs: 75/75 checks passed
node tests/adversarial.test.mjs: 116/116 checks passed
node tests/probes.test.mjs: 35/35 checks passed
node tests/capacity.test.mjs: 44/44 checks passed
node tests/concurrency.test.mjs: 46/46 checks passed
node tests/exports.test.mjs: 68/68 checks passed
node tests/fence.test.mjs: 35/35 checks passed
node tests/fence.ingress.test.mjs: 43/43 checks passed
node tests/fence.legacy.test.mjs: 21/21 checks passed
node tests/money.history.test.mjs: 9/9 checks passed
node tests/money.units.test.mjs: 21/21 checks passed
node tests/money.cloud.test.mjs: 17/17 checks passed
node tests/money.display.test.mjs: 4/4 checks passed
node tests/snapshot.poison.test.mjs: 82/82 checks passed
node tests/samefact.test.mjs: 24/24 checks passed
node tests/wording.test.mjs: 36/36 checks passed
node tests/closure.test.mjs: 95/95 checks passed
node tests/correction.test.mjs: 33/33 checks passed
node tests/quarantine.test.mjs: 82/82 checks passed
node tests/approval.test.mjs: 72/72 checks passed
node tests/repayment.test.mjs: 240/240 checks passed
node tests/ledger.ingress.test.mjs: 151/151 checks passed
node tests/cas.test.mjs: 88/88 checks passed
node tests/status.test.mjs: 29/29 checks passed
node tests/money.test.mjs: 40/40 checks passed
node tests/money.ingress.test.mjs: 206/206 checks passed
node tests/method.test.mjs: 51/51 checks passed
node tests/restore.test.mjs: 51/51 checks passed
node tests/upgrade.test.mjs: 48/48 checks passed
node tests/vehicles.test.mjs: 61/61 checks passed
node tests/xlsx.test.mjs: 59/59 checks passed
node tests/nonassertions.test.mjs: 23/23 checks passed
node tests/labels.test.mjs: 23/23 checks passed
node tests/labelcache.test.mjs: 32/32 checks passed
node tests/smoke.mjs: 1047/1047 checks passed
node tests/print.test.mjs: 70/70 checks passed
node tests/mobile.test.mjs: 675/675 checks passed
node tests/update.test.mjs: 30/30 checks passed
node tests/forms.browser.mjs: 10/10 checks passed
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
firebase emulators:exec --only firestore "node tests/money.concurrency.test.mjs": 50/50 checks passed
EXIT=0
58 suites · 6441/6441 checks
```

## Known gaps, measured and named
- The create-race hold (v95 R1) holds the loser's contested paths without asking the
  same-fact rule of them: two phones writing the identical fact into a project with no
  document yet end in a hold a person clears, not a silent merge. Safe direction; one tap.
- Everything the v95 handoffs list. Above all: no physical iPhone has run any build since
  v86 (`docs/iphone-acceptance.md`, every row NOT RUN). `firestore.rules` is deployed by
  hand before any phone updates (`tests/rollout.test.mjs` says why: rules first).

## Contract items NOT completed
Nothing of this round is open. Not claimed: physical-device coverage; the money gates stay shut.
