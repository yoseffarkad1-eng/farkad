# Handoff — the compact daily screen (v93)

- Branch: `cd-work` → published as `claude/farkad-mobile-design-review-odl8ue`
- Feature commit: `10a40a5c6d5d27e5c919d01799ea29ebb0d9d3c6` (v93; the mobile suite alone on it: 671/671)
- Gate SHA: `503101488595ff8e3f8d595ede5db3311a5975d8` (the branch head the release gate below ran on; it carries this
  commit plus the two repair rounds of features/core-repairs, stamped v95)
- Base (contract): `c744d49af8a169df807575a81c5fdc0d08c3b37d` (Opus core repair, v91)
- Build stamps at the feature commit: `farkad-build` v93 · `APP_VERSION` v93 · `VERSION` farkad-v93

## Files changed by the feature commit (`git diff --stat c744d49..10a40a5`)

```
 css/app.css                      | 298 ++++++++++++++++++++++++++++++++-------
 features/compact-day/contract.md |  66 +++++++++
 index.html                       |   6 +-
 js/app.js                        |  57 +++++++-
 js/ui/day.js                     | 174 ++++++++++++++++++-----
 sw.js                            |   2 +-
 tests/mobile.test.mjs            |  70 ++++++++-
 tests/smoke.mjs                  |  82 ++++++++++-
 8 files changed, 655 insertions(+), 100 deletions(-)
```

- `css/app.css` — the phone top strip at 52px; the folded account warning (`.banner-fold`,
  `.banner-sum`, `.banner-full`); the progress on the header's tools row with the track
  as the header's bottom edge; the 48px switcher row carrying the bulk button; the
  full-bleed header and list (-12px, .app's own phone padding undone); the ≤360px rules
  (three-line summary, icon-only undo/redo only while «היום» is on the row); the sync chip.
- `js/ui/day.js` — `renderAccountBanner` folds (summary line + full text + לדוחות +
  שמור קובץ גיבוי, `accountOpen` posture); `renderProgress` makes the count the continue
  control and drops the separate «המשך (N)» button; `renderBulkRow` is chips-only;
  `bulkToggle`/`bulkIcon` put the fold's control on the switcher row; `renderModeToggle`
  builds the row; the step buttons' words are in `.step-word` spans.
- `js/app.js` — `APP_VERSION` v93; `renderSyncChip` (a mirror of `#storageNotice`'s own
  words) called after `updateSyncNotice` in `render()` and by a MutationObserver
  (`watchSyncNotice`) whenever sync.js rewrites the line.
- `index.html` — v93 stamp; `#syncChip` (aria-hidden; the line is the live region).
- `sw.js` — `VERSION` farkad-v93.
- `tests/mobile.test.mjs` — new suite «the list starts high» (row-count floors and the
  chrome bands at 430/390/320, measured with the warning folded); the folded bulk row is
  measured at 0px and its control by aria-label.
- `tests/smoke.mjs` — the two «המשך (N)» taps tap the count; new checks: the warning
  folds/unfolds and keeps its posture across a render, the fold offers report + backup,
  the chip mirrors five status-line states.
- `features/compact-day/contract.md`, `features/compact-day/handoff.md` — this feature's
  contract and this report.

## Migrations
None. No storage key added or changed. Tested from an empty record (the mobile/smoke
suites seed from nothing) and from the populated `scheduleData:v2` the smoke suite writes.

## Tests added (negative tests included)
- mobile «the list starts high» ×4 viewports (430×932, 390×844, 320×667, and the SE's
  320×568 at its own floor of one whole row): FAILS if the warning is not on screen folded
  (given), if any band is exceeded (topbar > 52, warning outside 56–64, header outside
  96–112, switcher outside 44–48, any row outside 64–72), or if fewer than 6/5/3/1 whole
  rows sit above the dock. Proven to fail: see «Negative proof» below.
- mobile folded-bulk suite: FAILS if the folded row takes any height, if the control is
  under 44×44, or if its aria-label lacks «פעולות מרוכזות» and the count.
- smoke: FAILS if the warning opens expanded, if the full text or the two doors are
  missing when opened, if a render resets the posture, if the chip shows on a local-only
  line, or if any of the four cloud states maps to the wrong chip.

## Negative proof (a guard removed, the test fails, the guard restored)
In a throwaway worktree at the same commit, `css/app.css` had two guards removed - the header's
4px top padding back to the old 10px, and `.bulk-row.bulk-closed { display: none }` deleted - and
`node tests/mobile.test.mjs` was run (623/665; the run is `gate-neg.log` beside this file's session):
```
**FAIL**  320px: the list starts high: at least 3 whole names above the dock, unscrolled  — 1 whole rows
**FAIL**  and the folded row itself costs the list nothing  — {"top":227,"bottom":229,"h":2,"w":296}
```
Both guards restored; the release gate below is on the restored tree.

## Measured before → after (headless Chromium, 30-man crew, warning up)
| | 430×932 | 390×844 | 320×667 |
|---|---|---|---|
| whole rows above the dock, unscrolled — before (v91) | 3 | 1 | 0 |
| whole rows above the dock, unscrolled — after (v93) | 6 | 5 | 3 |
| first row's top — before → after | 550 → 288 | 606 → 288 | 577 → 284 |
| top strip | 56 → 52 | | |
| account warning (folded) | 160 → 60 | 216 → 60 | 192 → 61 |
| day header (incl. progress) | 193 → 103 | 193 → 103 | 188 → 103 |
| switcher + bulk | 44 + 46 → 48 | | |
| worker row | 67 → 69 | | |
| 320×568 (iPhone SE), whole rows above the dock — before → after | | | 0 → 1 |

## Test output (verbatim)
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
None of the ten success criteria is open. Not done, and not claimed: a physical iPhone run (docs/iphone-acceptance.md, all rows NOT RUN).

## Known risks
- Every measurement above is headless Chromium. Nothing here has run on an iPhone; the
  physical acceptance list in `docs/iphone-acceptance.md` is still NOT RUN.
- The ≤360px rule uses `:has()`; on a browser without it the step words simply stay, and
  the count ellipsises at the narrowest width when «היום» is on the row (the aria-label
  keeps the full count). iOS 15.4+ and current Chromium have `:has()`.
- The sync chip recognises the status line's pinned words; a new sentence in
  `updateSyncNotice` that none of the patterns match shows no chip (never a wrong one).
