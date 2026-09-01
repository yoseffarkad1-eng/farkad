# Contract — the compact daily screen (v93)

## Goal
On a phone the day screen's worker list starts high enough that, on first open — with
the account warning showing in its collapsed state and both bottom bars in place — the
manager sees at least six complete worker rows at 430×932, five at 390×844 and three at
320×667, and can still reach and tap the last worker. Nothing the screen could do before
is gone: day navigation, undo/redo, the day drawer, the progress count and "continue to
the next unrecorded man", the by-worker/by-site switch, bulk actions, the account
warning with its full text and its report/backup doors, the dock, the tabs.

## Out of scope
- No change to what is recorded, how it is stored, synced, priced or exported.
- No change to the by-site view's cards, trays or the assign sheet.
- No vehicle features (retired; stays retired).
- No ledger changes; `LEDGER_WRITES` stays `false`.
- No new dependency, no build step, no `type="module"`.
- No physical-iPhone claim: every measurement below is headless Chromium.

## Data
No tables, no migrations, no storage keys added or changed. The only storage touched is
the existing `farkadAccountNotice` (dismiss-for-today key, unchanged) and
`farkadDayMode` (unchanged). Rollback is a plain revert of the commit.

## Permissions
Unchanged. Nothing here reads or writes anything the previous build did not.

## Privacy
Unchanged. Worker names reach the DOM through `textContent` only (dom.js), as before.
The app bar's sync chip mirrors the text the status line already shows; it adds no data.

## Success criteria
1. `tests/mobile.test.mjs` (new suite "the list starts high"): at 430/390/320 with the
   account banner present and collapsed, the count of `.wrow` rows whose bottom edge is
   above the dock's top edge is ≥ 6 / ≥ 5 / ≥ 3, and the last row is tappable after a
   scroll to the bottom (existing checks).
2. Measured on the same pages: `.topbar` ≤ 52px; `#accountBanner` collapsed 56–64px;
   `.day-header` 96–112px; `.day-mode-row` 44–48px; every `.wrow` 64–72px; the dock
   sits directly on the tab bar (existing check).
3. Every button on the day screen is ≥ 44×44 (existing `undersized` check), including
   the warning's summary/report/dismiss buttons and the bulk-actions button.
4. The warning's full sentences are still in the DOM (existing smoke checks read
   `#accountBanner` text for the missing dates and «נסגר מחר»); tapping the summary
   toggles `aria-expanded` and shows the full text with לדוחות and שמור קובץ גיבוי;
   ✕ still hides for today only (existing smoke check).
5. The count «נרשמו X מתוך Y» is the "continue" control: tapping it opens the assign
   sheet for the first unrecorded worker (smoke, replacing the old «המשך (N)» clicks).
   A finished day shows «✓ הכל נרשם» and no button.
6. The bulk-actions button sits in the switcher row, is 44×44, is labelled
   «פעולות מרוכזות (N)» for assistive tech, and toggles the same `.bulk-row` chips the
   existing mobile and smoke suites drive.
7. Landscape: header height ≤ 80 with the date on it (existing check).
8. 200% text: the existing suite (rebuilt cascade) stays green — no sideways scroll,
   dock and tabs present, sheet foot on screen.
9. The three build stamps read v93 (`tests/build.test.mjs`).
10. `npm test` and `npm run test:all` green on the final SHA, counts recorded verbatim
    in `features/compact-day/handoff.md`.

## Base
- Branch: `cd-work`, to be published as `claude/farkad-mobile-design-review-odl8ue`.
- BASE SHA: `c744d49af8a169df807575a81c5fdc0d08c3b37d` (Opus core repair candidate, v91).
- Files that must not be touched: `js/model/ledger.js`, `js/model/schema.js`,
  `js/model/migrate.js`, `js/sync/sync.js`, `js/sync/firebase-adapter.js`,
  `js/store.js`, `js/recovery.js`, `js/state.js`, `firestore.rules`, anything under
  `vendor/`.
- Design reference: the Farkad artifact, page «היום הקומפקטי» (CDHandoff, CDMeasure).
