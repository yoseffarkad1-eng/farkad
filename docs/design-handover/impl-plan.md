# v169 — the design release: implementation plan (farkad-design session, 2026-11-09)

Owner approved the full set on 2026-11-09 («ايه»). Visual only: css/, js/ui/*, index.html markup,
sw.js SHELL list + the three stamps, docs/releases.md, CLAUDE.md file list, tests. NOT js/sync, js/model,
state.js, store.js, recovery.js, firestore.rules, .github. Paper and picture untouched (all new CSS is
`@media screen`). Number v169 proposed to the parent session (v168 = sync fix first; v170 = pay-day).

Where: Windows worktree `C:\Users\abo_f\ניהול עובדים\.claude\worktrees\infallible-noether-b9a4b8`
(branch claude/infallible-noether-b9a4b8, reset to origin/main = ac9c013 = v167). Tests run in WSL
`~/farkad-design-impl` (branch design-v169 at ac9c013, node_modules copied) after
`rsync -a --delete --exclude .git --exclude node_modules <worktree>/ ~/farkad-design-impl/`.
Node: `export PATH="$HOME/.local/node-v22.23.3-linux-x64/bin:$PATH"`. Never GIT_DIR. Full gate at the end
from a clean detached clone of the exact commit.

## Files
- css/design.css (NEW, loaded after readability.css; in SHELL): tokens (--band, --band-ink, --band-soft,
  --accent-fill, --on-fill, --wa-fill, --wa-ink, --line-ctl, radii), the four button looks, the band,
  the ⋯ sheet, the day screen (2 rows, FAB box, copy strip), crew/week/reports/advances/settings/dialogs/
  banners/empty states — ported from the mocks mock-g1/g2/g3.css in ~/farkad-design-tools.
- js/ui/band.js (NEW): renderBand({title, sub, start, back:{label,onTap}, tools:[nodes], row2:[nodes], more:[rows]})
  → div.view-band; moreButton(rows) → the ⋯ with the sync dot (amber = chip-warn, red = chip-danger);
  bandIcon(name) → stroke SVGs (gear, holiday, bulk, copy, paste, sort, print, image, list, back).
- js/ui/more.js (NEW): openMoreSheet(rows) / closeMoreSheet(); #moreSheet is a .modal.sheet in index.html
  (modal.js then owns Escape/focus/backdrop). First line = the sync sentence (#storageNotice text, class from
  #syncChip). rows: {icon, label, extra, onTap, className}. Close button «סגור».
- index.html: <link design.css>, #moreSheet markup, <script> band.js + more.js after sitecolor.js and before
  day.js. Brand strip + #settingsBtn stay in the DOM (hidden by CSS; settings reached from every ⋯).
- js/ui/day.js: renderDayHeader adds moreButton (rows: הגדרות, הכל חופש, פעולות מרוכזות (n), the copy label);
  nav words hidden by CSS; undo/redo hidden while disabled (CSS); buildDay adds .day-copy-strip on a day with
  nothing recorded («עוד אין רישום ליום הזה» + the copy button's own label); readDayScroll toggles
  .fab-hidden on .day-actions (down → hide, up → show).
- js/ui/week.js: renderWeekHeader → band (‹ «שבוע» + range ›; row 2 = segmented «טבלה»/«ימים» + «השבוע»;
  ⋯ = הגדרות, הדפסה, שיתוף כתמונה). week-phone-back removed (the switch replaces it). Print/share buttons
  keep their classes inside the ⋯ rows.
- js/ui/reports.js: renderReports → band «דוחות» with the details.report-output-actions in row 1 and the
  section toggle in row 2; renderAdvances → band «מקדמות» (⋯ = הגדרות, סידור) / worker: back + name + «מקדמות».
- js/ui/roster.js + index.html #rosterView: band «צוות» + jump chips; crew-tools behind ⋯ (הדבק רשימה, סדר מחדש).
- js/ui/settings.js: nothing structural; CSS paints head+nav as the band.
- sw.js SHELL + VERSION; js/app.js APP_VERSION; index.html farkad-build → v169 (confirm number first).
- docs/releases.md v169 entry (what is covered / not); CLAUDE.md files list; tests/README.md.

## Tests (first, in the repo's culture)
- tests/design.browser.mjs (NEW): at 440x956 dark with a 12-man crew: day band ≤ 120px and 12 .wrow visible;
  FAB box measured (--day-actions-h ≥ 78) and last row scrollable clear; scroll down hides the FAB, scroll up
  shows it; ⋯ opens #moreSheet with rows [הגדרות, הכל חופש, פעולות מרוכזות, מיום …] (exact strings) and
  הגדרות opens the settings panel; empty day shows .day-copy-strip with the pinned sentence; week band has
  «טבלה»/«ימים» and switching works; every new control ≥ 44x44; band text contrast ≥ 4.5; light scheme same.
- Existing suites that will move (same commit, reason in message): mobile.test.mjs (header boxes, dock height,
  switcher position), declutter.browser.mjs, settings.browser.mjs (open settings via ⋯), smoke.mjs,
  seder/roster/reports/scroll browser suites where they click .week-print-action / #settingsBtn / crew-tools,
  bars.stale.*, print.test (must stay green: paper unchanged), startup.blank.test.

## Order of work
1. design.css + band.js + more.js + index.html + sw.js (shell complete) → `npm test` green except intended.
2. day.js (⋯, copy strip, FAB scroll) → mobile + declutter + scroll suites.
3. week/reports/advances/roster bands → their browser suites.
4. design.browser.mjs; fix pinned suites; docs; stamps.
5. rsync → WSL, `npm test`, `npm run test:all`; then the gate from a clean detached clone; owner's yes; publish.
