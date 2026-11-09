# פרקד — design pass: handover for a session that sees only GitHub

Written 2026-11-09 by the farkad-design session (Fable 5.1) at the owner's request. Everything below
was produced from the real app, read-only, with fixture data; nothing in it changed the app, the live
site, or any data. The owner (Yosef) reads Arabic (Levantine), uses an iPhone 16 Pro Max in dark mode,
installed as a home-screen app, mostly over Remote Control: write to him in short Arabic, put what he
must decide in a single `> ⚠️` box, and send images as files (1x JPEG ≈ 150–300 KB each; 2x PNGs timed
out on his phone).

## 0. Where the code is, and what this handover assumes

- GitHub `yoseffarkad1-eng/farkad`, branch `main`. When I fetched on 2026-11-09, `origin/main` was
  `ac9c013` = the v167 merge (PR #54, squash `a25566f`). v166 (the Rima count on the site cards, no Rima
  in the WhatsApp message) and v167 (per-worker seder message, stuck-bars fix, day-screen declutter, the
  «בלי עובדי רימא» grid) ARE on GitHub main. Verify with `git log --oneline -5 origin/main`.
- Still local on the owner's PC, NOT on GitHub: **v168** (the sync fixes: `js/sync/*`, tests, stamps,
  `docs/releases.md` only - no UI files) and the pay-day design (a markdown + mock-ups in a scratchpad).
  A mock-up made from GitHub main therefore lacks nothing visual; it lacks the sync behaviour of v168.
  The design release must be built ON TOP of v168 once it is on main (release order agreed with the
  parent session: v168 sync → v169 design → v170 pay-day).
- The rest of this file is the complete state of the design work. The uncommitted start of the
  implementation (about 2 hours in) is in `design-v169-wip.patch` beside this file and inlined in §12.

Read `CLAUDE.md` first. The constraints that bound every decision here:
- Visual only: `css/`, markup and render code in `js/ui/*`, markup in `index.html`. Never `js/sync/*`,
  `js/model/*`, `js/state.js`, `js/store.js`, `js/recovery.js`, `firestore.rules`, `.github/`.
- Nothing recorded, priced, synced or printed for the client changes. The paper and the picture (print
  stylesheet, `js/ui/printout.js`) are what the client receives: every design rule is `@media screen`.
- Law 6: Hebrew strings are owner decisions; many are pinned verbatim by tests. A changed string moves
  its pinned test in the same commit, with the owner's yes.
- Law 8: safe-area via `env()`, bar heights MEASURED by `js/ui/bars.js` and published as custom
  properties (`--nav-h`, `--day-actions-h`, `--undo-h`, `--topbar-h`); never a number in the stylesheet.
- Law 9: 44px touch targets in both dimensions; 16px inputs (iOS zooms below). The mobile suite
  (`tests/mobile.test.mjs`) measures both at four widths.
- Law 5: the three build stamps move together (`index.html` meta `farkad-build`, `APP_VERSION` in
  `js/app.js`, `VERSION` in `sw.js`) with any cached-file change; `sw.js` `SHELL` lists every file the
  page loads (`tests/build.test.mjs` checks).
- Classic scripts, one global scope, no build step; new UI files are `<script src>` tags in
  `index.html` in dependency order (after `js/ui/dom.js`, before the files that call them).
- No `prompt/confirm/alert`; dialogs via `js/ui/ask.js`; `.modal` elements are owned by `js/ui/modal.js`.
- Tests: `npm ci`; `npm test` (node suites); `npm run test:all` adds the browser suites (Playwright
  Chromium: `npm run browsers`); `npm run test:release` is the gate. Anything red is a stop.
- Publishing is the owner's: only with his explicit yes for that release, after the full gate on the
  exact commit; procedure in his notes (`gh auth switch --user yoseffarkad1-eng`, PR, merge, switch back).

## 1. The audit (Phase 1, 2026-11-07) — what was inconsistent

Method: every screen and dialog (38) screenshotted with fixture data at 440x956 (his phone) dark and
light, and at 375x667, from v167. Findings:

- **Buttons: ~12 looks, weak hierarchy.** Default filled accent; `btn-secondary` outlined; `btn-success`
  green; `btn-add` soft; `btn-icon` ghost; `chip-on/off`; `layer-on/off` (segmented, raised);
  `site-head-btn` (dark scrim); `place-btn`; `seder-go`; `settings-nav` (paper fill); `report-output-actions
  summary`; `banner-go`; `backup-primary`. In the dark scheme the primary fill is the PALE accent
  (`#a9cdf7`, dark text) and WhatsApp is pale green: primary and secondary carry the same visual weight.
- **Borders carry the layout.** `css/readability.css` (v140, the owner's reading preferences) raised
  `--line` to `#768aa0` dark / `#8a98aa` light; every outlined button and card edge glows, so the roster
  and settings read as a lattice of light boxes. Two token sets are layered (app.css then readability.css).
- **Amber means three things:** pending rows (טרם נרשם), a non-regular rate (יום כפול / שעות נוספות tags on
  by-site rows), and the sync-waiting chip. Accent is used for zero: «0 ₪ נשארו» in large accent on 9 of 12
  advance cards.
- **Radii:** 3, 4, 6, 7, 8, 9, 10, 12, 13, 14, 16, 18, 22, 999 (tokens say 14/10; readability says 12/8;
  many hard-coded). **Spacing:** gaps/paddings 2…28 with no rhythm. **Type:** ~27 font sizes (11→36),
  weights 500/600/650/700/750/800; titles crew 26, reports 26, settings 28, modal h3 20/23, sheet 30.
- **Icons:** inline SVG (tabs, settings, site head, chevrons) mixed with emoji in button labels
  (💬 ↧ 🖨️ 🖼️ 📊 💾 📂 ↩️ 🔄 ☁️ 📋 ↕ 🧹 🚀 👷 🏗️ ⚠️ ✔️ ⓘ) - platform-painted, different on each phone,
  and part of pinned `textContent`.
- **Day screen chrome:** top strip (brand + sync chip + הגדרות) 52px + a 3-row header (nav / segmented +
  הכל חופש + bulk / undo + redo + count) ≈ 155px; bottom: the dock (WhatsApp + copy-a-day) 64–69px on
  top of the tab bar ≈ 78px. At 440x956 about **8 worker rows** were visible; at 375x667 four.
- **RTL/density:** by-worker row: name right, tag centre-left, ✕ far left (the tag floats away from the
  name); by-site row ~70% empty; roster = 12 cards each with name + cycle chip («תשלום כל שבועיים» repeated)
  + a meta line that wraps mid-phrase + a green «פעיל» block + «עוד ···»; reports controls = 3 nested boxes.
- **Defects:** the update banner «גרסה חדשה זמינה» wraps - «אחר כך» drops to its own line
  (`.banner span { min-width: 200px }` beside two buttons at 440px); the sheet foot «המשך אל <שם>» wraps to
  two lines and its three buttons have equal weight; empty states show full chrome (search, five buttons,
  filters) above one sentence; the advances empty state reads «לא נמצא עובד.» (sounds like a failed search).

## 2. The direction (one): «هادئ ومرتّب» / «שקט ומסודר»

Quiet surfaces, ONE strong primary per screen, fewer boxes. Tokens: radii 6/8/12 (+20 for sheets and
dialogs); 4px rhythm; weights 500/700 (+800 for hero numbers); FOUR button looks - filled primary with a
real fill in dark (`--accent-fill`), tonal secondary (surface-2, no outline), ghost (glyph/word alone),
and the WhatsApp green as the only green button; borders stop carrying layout; amber = "needs you"
only; no text size reduced anywhere (v140 holds).

## 3. G1 (foundations only) and the owner's verdict

G1 = tokens + the four buttons + radii + softer lines + weights, applied everywhere, nothing moved.
Owner, 2026-11-08: «مش حاسسها قوية أولاً» (doesn't feel strong) and «شايف البار كيف طالع لفوق… بدي تغيير
جذري» (see how the bar rises up the screen; I want a radical change). **G1 alone was rejected.** Its
rules survive inside G2/G3 (they are the base layer of `design.css`).

## 4. G2 — the day screen, as mocked and APPROVED («إيه، كمّل هيك», 2026-11-08)

Measured at 440x956 on the v167 tree, fixture: 12 workers, 4 sites, today Thursday 2026-11-05.

**Top: two rows on a blue band** (dark `#1b4476`, light `#1e4e8a`; white text ≥ 8.4:1). The band is the
existing `.day-header` (sticky, full-bleed by `--page-pad`, carries `env(safe-area-inset-top)`), so the
sticky/compact logic of v101/v167 is untouched.
- Row 1 (44px): ☰ (day drawer, start corner) · ‹ · **יום חמישי** over 05/11/2026 (the date IS the picker
  button) · › · ⋯ (end corner). The arrows are chevrons only; «קודם»/«הבא» stay as aria-labels (and in
  `.nav-word`, hidden) - the same thing `body.day-tight` already does.
- Row 2 (50px): segmented **לפי עובדים | לפי אתרים** (track `rgb(255 255 255 / 16%)`, chosen half white
  with band-blue text, 16px/700, 40px tall inside a 3px track) … «נרשמו 10 מתוך 12» (white, 16px/700, the
  existing continue button). «היום» (when the date is not today) stays on this row as a white-outlined
  pill. The 4px progress track is the band's bottom edge (white fill, `#4ade80` when complete).
- Band total ≈ 114px (4 + 44 + 6 + 50 + 6 + 4). Before: 52 + 155 ≈ 207px.
- The brand strip («פרקד», sync chip, הגדרות) is not drawn (the `.tabs` are a child of `.topbar`, fixed to
  the bottom - hide the brand and the actions, NEVER `.topbar` itself).

**Behind ⋯ (a bottom sheet, `.modal.sheet`):** first line = the sync sentence (`#storageNotice`'s text,
tinted by the chip's state); rows under their own names: **הגדרות**, **הכל חופש**, **פעולות מרוכזות (n)**
(n = unrecorded count, amber badge), **מיום רביעי 04/11** (the copy button's own label), then «סגור».
The sync chip becomes a **dot on the ⋯**: amber `#fbbf24` while something waits to be sent, red `#f87171`
when something is wrong, nothing when all is well.

**Undo/redo** (בטל/שוב): hidden while disabled, i.e. shown only after an edit (the undo BAR that appears at
the moment of a deletion is unchanged).

**List:** rows 58px (`.wrow-main { padding: 7px 14px; min-height: 58px }`, name 19px/700 per v140), ghost ✕
44px, soft dividers → **12 of 12 rows visible** at 440x956 (was 8). By-site cards: padding 6, rows keep
44px, the רימא field 44px.

**Bottom: the tab bar alone.** The dock is gone as a bar; **WhatsApp is a round 62px green button** floating
16px above the tab bar at the START corner (right in RTL, the dock's own "under the thumb" reasoning).
Dark: `#22c55e` with a dark glyph `#052e16` (≈9:1); light: `#15803d` with a white glyph (5.0:1). Glyph =
a stroke chat-bubble SVG (data URI). **It hides while the list scrolls down and comes back on a small scroll
up** - the owner's choice («يختفي وقت التمرير») among: hide-on-scroll (chosen), end-corner placement (over
the ✕ column instead of the names), or always visible with the list padded (what the first mock did).
The list keeps ≥ 84px of room at its end so the last row, its ✕ and the last card's רימא box scroll clear.

**Copy-a-day** («↧ מיום רביעי 04/11»): on a day with nothing recorded at all (nobody placed, nobody absent)
it shows as a strip under the band - `עוד אין רישום ליום הזה` + the button; on any other day it is a row
of the ⋯. **This strip's sentence is the one NEW Hebrew string of the day screen.**

**Compact (scrolled) state:** the band collapses to row 1 (the existing `body.day-compact` rules); the
count is drawn inside it.

**Why no swipe-to-change-day:** the list scrolls vertically and a horizontal swipe on it mis-fires (and the
RTL direction of "next" is itself a decision); the chevrons stay. Recommended against for v1; told to the
owner, not objected to.

**Iron-law checks made on the mock:** every band control ≥ 44×44 (segment buttons 40px inside a 3px
track = 46); inputs stay 16px; no text size reduced; the dock stays a fixed element bars.js measures -
in the mock it measured 0 and the lists carried the 84px pad; the implementation (§12) instead makes the
dock the FAB's own 62×78 box so `--day-actions-h` = 78 and the page pads itself; the band is exactly
`--page-pad` wider than the page (a 448px band on a 440px screen zoomed the whole page out - measured);
`env(safe-area-inset-top)` stays on the header; sticky/compact unchanged.

## 5. G3 — every other screen in the same language (sent 2026-11-09, approved with the whole set)

Owner's brief: «ركّز على الشكل العملي والمريح للعين، بدي تطبيق احترافي لا يقل عن التطبيقات العالمية»;
dark first, light must stay correct; «كمّل الكل وفرجيني» (design everything, show once). He answered
«ايه» to the full set on 2026-11-09 after a simplified explanation; the Hebrew-string list (§7) should be
re-confirmed explicitly because the detailed message that carried it he answered «مش فاهم».

- **Every screen opens with the same band** (`.view-band`): title (+ optional subtitle), one or two tools,
  ⋯ at the end; `start` variant = title at the start edge, 22px. Row 2 for a segmented switch or chips.
- **Crew (צוות):** band «צוות» + the two jump chips (עובדים ↓ / אתרים ↓) as tonal-on-band chips in row 2;
  ⋯ = הגדרות, הדבק רשימה, סדר מחדש (the `.crew-tools` row hidden). Panels lose their box: a quiet heading
  («עובדים פעילים (12)», 17px ink-2) + the one filled «+ הוסף עובד»; tonal search; the lists are ROWS in
  one soft-bordered box (60px), name 19px, one meta line in ink-3 («תשלום כל שבועיים · 051-… · יומי: 450 ·
  שעה: 50»), «פעיל» as a green dot + word (no block), «עוד ···» as a ghost ••• (accessible name unchanged).
  Reorder panel: head painted as the band, rows soft, «שמירה ויציאה» filled.
- **Week:** band ‹ **שבוע** + range (one LTR run, `dateRange`) ›; row 2 = segmented **טבלה | ימים**
  (replaces the «חזרה לטבלת השבוע» button; `setWeekPhoneMode`) + «השבוע» chip; ⋯ = הגדרות, הדפסה,
  שיתוף כתמונה (rows keep `.week-print-action` / `.week-share-action` for the print tests). Date chips 52px
  tonal, chosen filled; «פתיחת היום לעריכה» filled; table header surface-2, totals row 800.
- **Reports:** band «דוחות» with «הפקת דוח» as a WHITE chip (the same `details` menu) and ⋯; row 2 = the
  existing section toggle **לפי עובד | לפי אתר** moved into the band. The controls card becomes two quiet
  rows (period, workers) as bordered `details`; chips tonal/filled; worker picker rows 48px with 22px
  checkboxes; tiles soft border, hero value 800; invoice total on accent-soft.
- **Advances (מקדמות):** band «מקדמות» (⋯ = הגדרות, סידור); the helper sentence stays, quiet; tonal search;
  the 12 cards become rows (60px) in one box; zero balances quiet (`.is-zero`: ink-3, 16px/600), open
  balances accent 19px/750. Worker page: band with back chevron + name + «מקדמות» subtitle; hero balance
  36px/800; «+ מקדמה חדשה» filled, «קיזוז מהשכר» tonal.
- **Pay-day (the parent session's planned feature, drawn in this language):** entry card on מקדמות with a
  44px icon tile, «יום תשלום · היום» / «4 עובדים שבועיים · 13/11–19/11» and a filled «לתשלום» (the duplicate
  amber banner dropped); the screen = band «יום תשלום» + «חמישי 19/11/2026», period line, lead sentence,
  one quiet card per man (name 19px + «6 ימים · 3,000 ₪»; «חוב מקדמה 2,000 ₪» + «1500 מקודם · 500 בתקופה»;
  deduction «לקזז» as a 48px tonal centred input; result row «לתשלום 2,500 ₪» 800 + «נשאר חוב 1,500 ₪»
  ink-3), total card accent-soft with 38px/800, the filled blue «שילמתי · סגור חשבון ל־4 עובדים», the app's
  `askConfirm` with footer for the confirmation, and a paid state (ok-soft hero «שולם ונסגר · חמישי 19/11»,
  «✓ שולם 19/11» chips, «תיקון טעות» tonal). Its strings are the parent session's design, not the
  designer's. CSS classes `payday-*` are in §11 (mock-g3.css) - the feature itself does not exist in code.
- **Settings:** head + nav painted as the band (nav chips tonal-on-band); cards soft; icon tiles
  accent-soft; one filled primary per card (הפעלת התראות, שמור קובץ גיבוי); status box → plain text.
- **Dialogs:** 20px corners, no border, 21px title, fields tonal 48px/16px, filled primary + tonal cancel,
  stacked choices with the first filled; assign sheet: 24px name, site buttons 56px with a white ring on
  the chosen one, rate segmented, «המשך אל …» the filled primary, «נעדר» tonal, «סגור» ghost; pickers:
  tonal search, «+ הוסף» filled small, «✓ נמצא» ok-soft; day drawer: band head, filled «חזרה להיום».
- **WhatsApp dialog:** template chips segmented, warning soft amber, preview tonal, «שלח בוואטסאפ» the only
  green (full width, 52px), «לכל עובד בנפרד» tonal, העתק/סגור ghost; seder list: same green.
- **Banners:** one line (`flex-wrap: nowrap`, the sentence wraps inside its own box, a leading dot), update
  banner on accent-soft with filled «רענן עכשיו» and ghost «אחר כך» - fixes the §1 wrap bug; offline banner
  amber above the band. Undo bar: 14px radius, filled «בטל».
- **Empty states:** no search/tools/filters when there are no active workers; one sentence and the one
  button that fixes it (crew: «+ הוסף עובד» / «+ הוסף אתר»; day: the setup card).
- Light scheme verified on crew, week, reports, advances, pay-day, settings, sheet, WhatsApp, worker form.

## 6. Behaviour changes the design implies (the owner approved the set; name each when implementing)

1. הגדרות, הכל חופש, the bulk fold's button and the copy button leave the day's rows → ⋯ sheet.
2. The copy button is not shown on a non-empty day (⋯ only); on an empty day it is the strip under the band.
3. בטל/שוב appear only after an edit.
4. The sync chip's words leave the top strip → a dot on ⋯ + the sentence inside the sheet (and, as before,
   in ⋯ → הגדרות and at the foot of the screen).
5. Nav words קודם/הבא, שבוע קודם/שבוע הבא are not drawn (aria-labels keep them).
6. Week: «חזרה לטבלת השבוע» replaced by the טבלה|ימים switch; הדפסה/שיתוף behind ⋯.
7. Crew: הדבק רשימה / סדר מחדש behind ⋯. Advances: סידור behind ⋯; back buttons become the band's chevron.
8. The WhatsApp button hides on scroll-down, returns on scroll-up.

## 7. Hebrew strings NEW or CHANGED on screen (law 6 - pin in tests, with his explicit yes)

- NEW «עוד אין רישום ליום הזה» (empty-day copy strip)
- NEW «טבלה» / «ימים» (week switch)
- NEW «שבוע» as the week band's visible title (was the print title only)
- NEW «עוד» (aria-label of every ⋯; not visible)
- HIDDEN from view, kept for screen readers: «קודם», «הבא», «שבוע קודם», «שבוע הבא», «חזרה לטבלת השבוע»
  (removed; replaced by the switch), «חזרה לכל העובדים», «חזרה לדוח» (band back chevron, aria-label)
- Rows of the ⋯ sheets use the buttons' words WITHOUT their emoji: הדבק רשימה (📋), סדר מחדש (↕),
  הדפסה (🖨️), שיתוף כתמונה (🖼️), מיום … (↧)
- «עוד ···» (crew row) drawn as a ••• glyph; accessible name unchanged
- Pay-day strings (parent session's): יום תשלום · היום, לתשלום, לקזז, לתשלום X ₪, נשאר חוב X ₪, אין חוב
  מקדמה, סה״כ לתשלום עכשיו, שילמתי · סגור חשבון ל־N עובדים, לסגור ולשלם ל־N עובדים?, שילמתי, סגור,
  שולם ונסגר · …, ✓ שולם dd/mm, תיקון טעות

## 8. Tests the implementation must add and move (same commit, reason in the message)

- NEW `tests/design.browser.mjs` (Playwright, 440x956 dark, 12-man fixture): band ≤ 120px; 12 `.wrow`
  visible; `--day-actions-h` ≥ 78 and the last row scrollable clear of the FAB; scroll down adds
  `.fab-hidden`, scroll up removes it; ⋯ opens `#moreSheet` with rows [הגדרות, הכל חופש, פעולות מרוכזות,
  מיום …] and הגדרות opens the settings panel; an empty day shows `.day-copy-strip` with the pinned
  sentence; week band has «טבלה»/«ימים» and switching works; every new control ≥ 44×44; band text ≥ 4.5:1;
  the same in the light scheme; paper (print) unchanged (`tests/print.test.mjs` must stay green).
- Suites that will move: `tests/mobile.test.mjs` (header boxes, dock height, switcher position),
  `tests/declutter.browser.mjs`, `tests/settings.browser.mjs` (open settings via ⋯), `tests/smoke.mjs`,
  `tests/seder.browser.mjs`, `tests/roster.browser.mjs`, `tests/reports.browser.mjs`,
  `tests/scroll.browser.mjs`, `tests/bars.stale.*`, `tests/startup.blank.test.mjs` - wherever they click
  `#settingsBtn`, `.week-print-action`, `.crew-tools button`, «חזרה לטבלת השבוע» or measure the dock.

## 9. How the mock-ups were made (so the cloud can redo them)

A Playwright script serves the clone with `tests/serve.mjs` (`serve(root)` → `{url, close}`), opens
`index.html` at 440x956 (`deviceScaleFactor: 2, isMobile, hasTouch, colorScheme, locale 'he-IL',
timezoneId 'Asia/Jerusalem'`), seeds a fixture IN the page with the app's own functions
(`State.schedule.workers/places`, `assignPlace`, `markAbsent`, `setRate`, `setRimaCount`, `addAdvance`,
`State.save()`), reloads so boot runs, pins `todayStr = () => '2026-11-05'`, then per screen calls the
app's own openers (`showView`, `setDayMode`, `render`, `openAssignSheet`, `openWorkerPicker`,
`openPlacePicker`, `openDayDrawer`, `openSettings`, `showDayMessage`, `openSederList`, `askConfirm`,
`editWorker`, `showAddWorkerModal`, `openReorder`, `showWorkerAdvances`, `openWorkerDays`,
`showUpdateBanner({postMessage(){}})`, `setWeekPhoneMode`) and screenshots. The "after" = the same run with
`page.addStyleTag({path: mock.css})` and `page.addScriptTag({path: mock.js})` after boot; the mock JS
wraps `window.render` so its DOM moves survive every re-render. Pairs = an HTML page with both PNGs as
data URIs (before on the RIGHT, labelled قبل; after on the left, بعد), screenshotted; 1x JPEG q86 for the
phone. Fixture: 12 workers (מוחמד, ח׳אלד, יוסי, עלי, אברהים, סאמר, ראמי, דוד, פאדי, נאסר, אמיר, ווליד)
+ archived שאדי; sites הרצליה, פרדסיה, כפר סבא, נתניה; a fortnight of days to 04/11; today 05/11 with 10 of
12 recorded (w_07 absent, w_05/w_06 unrecorded), Rima 3 on הרצליה and 2 on כפר סבא; 3 advances.

## 10. The approved day-screen mock, verbatim: mock-g2.css + mock-g2.js

(Applied on top of mock-g1.css, whose rules are all contained in `design.css` §12. The mock hid the
brand strip with `body.view-day`; the implementation hides it on every screen.)

### mock-g2.css
```css
/* ================================================================ G2 — the day screen, radical
   A CSS-only MOCKUP (with mock-g2.js moving a few nodes), injected after css/app.css,
   css/readability.css and mock-g1.css. Screen only: nothing printed changes.

   What the owner asked for on 2026-11-08: the chrome at the top goes from four rows to two,
   the bottom from two bars to one, the colour becomes unmistakable, and about twelve men fit
   on the first screen instead of eight.

     TOP, row 1:  ☰  ‹  יום חמישי 05/11/2026  ›  ⋯        (the date band, in colour)
     TOP, row 2:  [לפי עובדים | לפי אתרים]  …  נרשמו 10 מתוך 12
     behind ⋯:    הגדרות · הכל חופש · פעולות מרוכזות · מהיום הקודם · the sync sentence
     BOTTOM:      the tab bar alone; WhatsApp is a round green button floating above it
     undo/redo:   only after an edit (the undo BAR still appears at the moment of the edit)

   Nothing is removed. 44px targets and 16px inputs hold. Bar heights are still measured:
   the dock collapses to 0 and the tab bar is measured as before. */
@media screen and (max-width: 700px) {

/* ---------------------------------------------------------------- the colour */
:root {
    --band: #1e4e8a;            /* white on it 8.4:1 */
    --band-ink: #ffffff;
    --band-soft: rgb(255 255 255 / 16%);
    --band-line: rgb(255 255 255 / 28%);
    --wa-fill: #15803d;         /* white on it 5.0:1 */
    --wa-ink: #ffffff;
}
:root[data-theme="dark"] {
    --band: #1b4476;
    --wa-fill: #22c55e;         /* dark glyph on it 9:1, and it is the brightest thing on the page */
    --wa-ink: #052e16;
}
@media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
        --band: #1b4476;
        --wa-fill: #22c55e;
        --wa-ink: #052e16;
    }
}

/* ---------------------------------------------------------------- the strip above the day goes */
/* The brand line and the settings button: settings moves behind ⋯ (mock-g2.js), the sync
   state becomes a dot on the ⋯ and its sentence stays in הגדרות where it already is. */
/* NOT display:none on the strip itself: the tab bar is a child of .topbar (fixed to the
   bottom by the phone block), and hiding its parent takes the tab bar with it. */
body.view-day .topbar .brand,
body.view-day .topbar .topbar-actions,
body.view-day .topbar .sync-chip { display: none; }
body.view-day .topbar { padding: 0; margin: 0; gap: 0; border: 0; }

/* ---------------------------------------------------------------- the band: two rows */
.day-header {
    background: var(--band);
    color: var(--band-ink);
    border: 0;
    /* Full-bleed by exactly the page's own side padding (--page-pad, 12px on a phone):
       one pixel more and the page scrolls sideways - measured, the first cut of this
       mock-up was 448px wide on a 440px screen and the whole page zoomed out to fit. */
    margin: 0 calc(-1 * var(--page-pad, 12px)) 8px;
    padding: 4px 10px 8px;
    padding-top: max(4px, env(safe-area-inset-top));
    box-shadow: 0 2px 10px rgb(0 0 0 / 25%);
}
body.day-tight .day-header { padding: 2px 8px 6px; }

/* Row 1: the day. Chevrons alone (the words live in the aria-labels, as on the tight day). */
.day-nav { gap: 2px; }
.day-nav .btn-nav .nav-word { display: none; }
.day-nav .btn-nav,
.day-nav .drawer-btn,
.day-nav .day-more {
    min-width: 44px;
    min-height: 44px;
    padding: 0;
    justify-content: center;
    background: transparent;
    border-color: transparent;
    color: var(--band-ink);
    box-shadow: none;
    border-radius: 12px;
}
.day-nav .btn-nav svg { width: 16px; height: 16px; }
.day-nav .btn-nav:hover, .day-nav .drawer-btn:hover, .day-nav .day-more:hover { background: var(--band-soft); color: var(--band-ink); }
.day-nav .drawer-btn { font-size: 22px; }
.day-nav .day-more { position: relative; display: inline-flex; align-items: center; justify-content: center; }
.day-nav .day-more svg { width: 26px; height: 26px; display: block; }
/* The sync state, as a dot on the ⋯: amber while something waits to be sent, red when
   something is wrong, nothing when all is well. The sentence itself is one tap away. */
.day-nav .day-more::after {
    content: '';
    position: absolute;
    top: 5px; inset-inline-end: 5px;
    width: 11px; height: 11px;
    border-radius: 50%;
    border: 2px solid var(--band);
    display: none;
}
.day-nav .day-more.sync-warn::after { display: block; background: #fbbf24; }
.day-nav .day-more.sync-danger::after { display: block; background: #f87171; }
.day-label { color: var(--band-ink); padding: 0 4px; }
.day-label:hover { background: var(--band-soft); }
.day-label strong { font-size: 19px; line-height: 1.15; color: var(--band-ink); }
.day-label .day-date { color: rgb(255 255 255 / 82%); font-size: 14px; line-height: 1.15; }

/* Row 2: the two ways of looking at the day, and the count. One line, never two. */
.day-tools { margin-top: 6px; flex-wrap: nowrap; gap: 8px; align-items: center; }
.day-tools .day-steps #undoBtn,
.day-tools .day-steps #redoBtn,
.day-tools .day-steps .bar-div { display: none; }
.day-tools .day-steps:empty { display: none; }
.day-tools .btn-today {
    min-height: 44px; padding: 0 12px;
    background: transparent; color: var(--band-ink);
    border: 1px solid var(--band-line); border-radius: 12px; font-size: 15px; font-weight: 700;
}
.day-tools .day-switch { flex: 0 1 auto; order: 0; gap: 0; min-width: 0; }
.day-tools .day-switch .day-holiday-action,
.day-tools .day-switch .bulk-toggle { display: none; }
.day-tools .mode-toggle,
.day-tools .mode-toggle.mode-quiet {
    flex: 0 1 auto;
    margin: 0;
    padding: 3px;
    gap: 2px;
    background: var(--band-soft);
    border-radius: 12px;
}
.day-tools .mode-toggle button,
.day-tools .mode-quiet .layer-off,
.day-tools .mode-quiet .layer-on {
    min-height: 40px;
    padding: 0 14px;
    font-size: 16px;
    font-weight: 700;
    border-radius: 9px;
    white-space: nowrap;
    box-shadow: none;
}
.day-tools .mode-quiet .layer-off { background: transparent; color: rgb(255 255 255 / 88%); }
.day-tools .mode-quiet .layer-off:hover { background: rgb(255 255 255 / 10%); }
.day-tools .mode-quiet .layer-on { background: #fff; color: var(--band); }
.day-header .progress { flex: 1 1 auto; justify-content: flex-end; }
.day-header .progress .progress-line { justify-content: flex-end; }
.day-header .progress button.now-count,
.day-header .progress .now-count {
    color: var(--band-ink);
    font-size: 16px;
    font-weight: 700;
    padding: 0 8px;
}
.day-header .progress button.now-count:hover { background: var(--band-soft); }
.day-header .progress-done .now-count { color: #86efac; }
/* The track is the band's bottom edge. */
.day-header .progress-bar { background: rgb(255 255 255 / 18%); height: 4px; }
.day-header .progress-fill { background: #fff; }
.day-header .progress-done .progress-fill { background: #4ade80; }

/* The scrolled header (body.day-compact) keeps the band and its one row. */
body.day-compact .day-header .progress-line .now-count { color: var(--band-ink); }

/* ---------------------------------------------------------------- the list: twelve rows */
.worker-list { margin-top: 0; border-color: var(--line-soft); margin-bottom: 84px; }
.wrow-main { padding: 7px 14px; min-height: 58px; gap: 10px; }
.wrow .btn-icon { min-width: 44px; color: var(--ink-3); }
.wrow-empty .wrow-main { min-height: 58px; }

/* The by-site cards: the card loses its outer box, the rows keep their 44px. */
.site-grid { gap: 8px; margin-bottom: 84px; }
.site-card { border-color: var(--line-soft); padding: 6px; gap: 2px; }
.site-list .assign-row { padding: 2px 6px; }
.rima-field { min-height: 44px; }
.tray { margin-bottom: 84px; }

/* ---------------------------------------------------------------- the bottom: one bar */
/* The dock collapses to nothing - measured as 0, so the page reserves room for the tab
   bar alone - and the WhatsApp button inside it floats as a round green button at the
   start corner, under the thumb. The copy button lives behind ⋯ (and on an empty day,
   under the band - see .day-copy-strip). */
.day-actions {
    height: 0;
    min-height: 0;
    padding: 0;
    background: transparent;
    border: 0;
    box-shadow: none;
    pointer-events: none;
    overflow: visible;
    display: block;
}
.day-actions #copyDayBtn { display: none; }
.day-actions .btn-success {
    pointer-events: auto;
    position: absolute;
    bottom: 16px;
    inset-inline-start: 16px;
    width: 62px;
    height: 62px;
    min-height: 62px;
    max-width: none;
    padding: 0;
    border-radius: 50%;
    border: 0;
    font-size: 0;
    color: var(--wa-ink);
    background-color: var(--wa-fill);
    background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23052e16' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M12 3a9 9 0 0 0-7.8 13.5L3 21l4.6-1.2A9 9 0 1 0 12 3Z'/><path d='M8.7 9.2c.2-.6.5-.6.8-.6h.6c.2 0 .4.1.5.4l.7 1.6c.1.2 0 .4-.1.6l-.5.6c-.1.1-.2.3 0 .5a7 7 0 0 0 3.3 3c.2.1.4.1.5-.1l.7-.8c.2-.2.4-.2.6-.1l1.6.8c.3.1.4.3.4.5 0 .8-.5 1.6-1.3 1.9-1 .4-2.3.1-4.2-1.1a10 10 0 0 1-3.3-3.6c-.6-1.2-.6-2.3-.3-3.1Z'/></svg>");
    background-repeat: no-repeat;
    background-position: center;
    background-size: 34px 34px;
    box-shadow: 0 8px 22px rgb(0 0 0 / 35%), 0 0 0 4px rgb(255 255 255 / 10%);
}
:root[data-theme="light"] .day-actions .btn-success,
.day-actions .btn-success.light {
    background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M12 3a9 9 0 0 0-7.8 13.5L3 21l4.6-1.2A9 9 0 1 0 12 3Z'/><path d='M8.7 9.2c.2-.6.5-.6.8-.6h.6c.2 0 .4.1.5.4l.7 1.6c.1.2 0 .4-.1.6l-.5.6c-.1.1-.2.3 0 .5a7 7 0 0 0 3.3 3c.2.1.4.1.5-.1l.7-.8c.2-.2.4-.2.6-.1l1.6.8c.3.1.4.3.4.5 0 .8-.5 1.6-1.3 1.9-1 .4-2.3.1-4.2-1.1a10 10 0 0 1-3.3-3.6c-.6-1.2-.6-2.3-.3-3.1Z'/></svg>");
}
@media (prefers-color-scheme: light) {
    :root:not([data-theme="dark"]) .day-actions .btn-success {
        background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M12 3a9 9 0 0 0-7.8 13.5L3 21l4.6-1.2A9 9 0 1 0 12 3Z'/><path d='M8.7 9.2c.2-.6.5-.6.8-.6h.6c.2 0 .4.1.5.4l.7 1.6c.1.2 0 .4-.1.6l-.5.6c-.1.1-.2.3 0 .5a7 7 0 0 0 3.3 3c.2.1.4.1.5-.1l.7-.8c.2-.2.4-.2.6-.1l1.6.8c.3.1.4.3.4.5 0 .8-.5 1.6-1.3 1.9-1 .4-2.3.1-4.2-1.1a10 10 0 0 1-3.3-3.6c-.6-1.2-.6-2.3-.3-3.1Z'/></svg>");
    }
}
.day-actions .btn-success:active { filter: brightness(.9); }
/* Hidden while the list scrolls down (mock-g2.js adds the class), back on a scroll up. */
.day-actions .btn-success { transition: transform .22s ease, opacity .22s ease; }
.day-actions.fab-hidden .btn-success { transform: translateY(120px) scale(.8); opacity: 0; pointer-events: none; }
/* The undo bar floats above the tab bar, not above a dock that is no longer there. */
.undo-bar { bottom: calc(var(--nav-h) + 92px); }

/* The tab bar: the chosen tab is unmistakable. */
.tabs { border-top-color: var(--line-soft); box-shadow: 0 -6px 24px -18px rgb(0 0 0 / 50%); }
.tabs .tab { color: var(--ink-2); font-weight: 600; }
.tabs .tab-on { color: var(--accent); }
.tabs .tab-on .tab-icon { color: #fff; }
.tabs .tab-on .tab-icon::before { background: var(--accent-fill); inset: -3px -10px; }

/* ---------------------------------------------------------------- the empty day */
/* With nothing on the day yet, the copy button is the first thing under the band:
   one tonal line naming the day it would copy from. mock-g2.js builds it from the dock's
   own button, so the words are the app's own. */
.day-copy-strip {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin: 0 0 8px;
    padding: 6px 8px 6px 12px;
    background: var(--accent-soft);
    border-radius: 12px;
}
.day-copy-strip span { color: var(--ink-2); font-size: 15px; font-weight: 600; }
.day-copy-strip button {
    min-height: 44px;
    padding: 0 16px;
    border-radius: 10px;
    background: var(--accent-fill);
    color: #fff;
    border: 0;
    font-size: 16px;
    font-weight: 700;
    white-space: nowrap;
}

/* ---------------------------------------------------------------- the ⋯ sheet */
/* Where the four things went. A sheet from the bottom, under the thumb, with the app's
   own words on each row: הגדרות, הכל חופש, פעולות מרוכזות (n), מהיום הקודם (date), and
   the sync sentence as its first line. */
.day-more-backdrop {
    position: fixed; inset: 0; z-index: 60;
    background: rgb(0 0 0 / 45%);
}
.day-more-sheet {
    position: fixed;
    inset-inline: 0;
    bottom: 0;
    z-index: 61;
    background: var(--surface);
    border-radius: 20px 20px 0 0;
    padding: 8px 12px calc(12px + var(--safe-bottom));
    box-shadow: 0 -10px 40px rgb(0 0 0 / 40%);
}
.day-more-sheet .grip { width: 40px; height: 5px; border-radius: 3px; background: var(--line); margin: 2px auto 10px; }
.day-more-sheet .sync-line {
    display: flex; align-items: center; gap: 10px;
    padding: 10px 12px; margin-bottom: 6px;
    border-radius: 12px; font-size: 16px; font-weight: 700;
}
.day-more-sheet .sync-line.chip-warn { background: var(--warn-bg); color: var(--warn); }
.day-more-sheet .sync-line.chip-ok { background: var(--ok-bg); color: var(--ok); }
.day-more-sheet .sync-line .dot { width: 10px; height: 10px; border-radius: 50%; background: currentColor; flex: 0 0 auto; }
.day-more-sheet button.row {
    display: flex; align-items: center; gap: 14px;
    width: 100%; min-height: 56px; padding: 0 12px;
    background: transparent; border: 0; border-radius: 12px;
    color: var(--ink); font-size: 18px; font-weight: 700; text-align: start;
}
.day-more-sheet button.row + button.row { border-top: 1px solid var(--line-soft); border-radius: 0; }
.day-more-sheet button.row:hover { background: var(--surface-2); }
.day-more-sheet button.row svg { width: 24px; height: 24px; flex: 0 0 auto; color: var(--ink-2); }
.day-more-sheet button.row .sub { margin-inline-start: auto; color: var(--ink-3); font-size: 15px; font-weight: 600; }
.day-more-sheet button.row .count {
    margin-inline-start: auto; min-width: 28px; height: 28px; padding: 0 9px;
    border-radius: 14px; background: var(--warn-bg); color: var(--warn);
    display: inline-flex; align-items: center; justify-content: center; font-size: 15px;
}
.day-more-sheet .cancel {
    width: 100%; min-height: 48px; margin-top: 8px;
    background: var(--surface-2); color: var(--ink); border: 0; border-radius: 12px;
    font-size: 17px; font-weight: 700;
}

}
```

### mock-g2.js
```js
// G2 mock-up: the few DOM moves the CSS cannot make. Injected at screenshot time only
// (shots.mjs MOCKJS=...), never part of the app. Re-applied after every render.
//
//   - a ⋯ at the end of the date row (settings, הכל חופש, the bulk fold and the copy
//     button go behind it; the sync state is a dot on it)
//   - on a day with nothing recorded yet, the copy button as a strip under the band
//   - the WhatsApp button hides while the list scrolls down and returns on a scroll up
//   - mockSheet / mockMoreButton, shared with mock-g3.js for the other screens
(function () {
    function iconSvg(path) {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('fill', 'none');
        svg.setAttribute('stroke', 'currentColor');
        svg.setAttribute('stroke-width', '1.8');
        svg.setAttribute('stroke-linecap', 'round');
        svg.setAttribute('stroke-linejoin', 'round');
        svg.setAttribute('aria-hidden', 'true');
        const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        p.setAttribute('d', path);
        svg.appendChild(p);
        return svg;
    }
    const ICONS = {
        gear: 'm9 3-.6 2.2-2 .9-2-.6-2 3.4 1.5 1.7v2.3L2.4 15l2 3.4 2-.6 2 .9L9 21h4l.6-2.3 2-.9 2 .6 2-3.4-1.5-1.8V11l1.5-1.7-2-3.4-2 .6-2-.9L13 3Z M14 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
        holiday: 'M3 12h18M12 3v18M5.6 5.6l12.8 12.8M18.4 5.6 5.6 18.4',
        bulk: 'M4 6l1.5 1.5L8 5M11 6.5h9M4 12l1.5 1.5L8 11M11 12.5h9M4 18l1.5 1.5L8 17M11 18.5h9',
        copy: 'M12 4v12m0 0 4-4m-4 4-4-4M4 20h16'
    };

    function closeSheet() {
        document.querySelectorAll('.day-more-backdrop, .day-more-sheet').forEach(n => n.remove());
    }

    // rows: [{ icon: <svg>, label, extra: <node>|null, onTap }]
    function mockSheet(rows, opts = {}) {
        closeSheet();
        const backdrop = document.createElement('div');
        backdrop.className = 'day-more-backdrop';
        backdrop.addEventListener('click', closeSheet);
        const sheet = document.createElement('div');
        sheet.className = 'day-more-sheet';
        sheet.setAttribute('role', 'dialog');
        sheet.appendChild(Object.assign(document.createElement('div'), { className: 'grip' }));

        if (opts.syncLine !== false) {
            const chip = document.getElementById('syncChip');
            const notice = document.getElementById('storageNotice');
            const line = document.createElement('div');
            const kind = chip && !chip.hidden ? (chip.className.match(/chip-(ok|warn|danger)/) || [])[1] : null;
            line.className = 'sync-line ' + (kind ? 'chip-' + kind : 'chip-ok');
            line.appendChild(Object.assign(document.createElement('span'), { className: 'dot' }));
            line.appendChild(document.createTextNode((notice && notice.textContent.trim()) || (chip && chip.textContent) || ''));
            sheet.appendChild(line);
        }
        rows.filter(Boolean).forEach(row => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'row';
            if (row.icon) b.appendChild(row.icon);
            b.appendChild(document.createTextNode(row.label));
            if (row.extra) b.appendChild(row.extra);
            b.addEventListener('click', () => { closeSheet(); row.onTap(); });
            sheet.appendChild(b);
        });
        const cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.className = 'cancel';
        cancel.textContent = 'סגור';
        cancel.addEventListener('click', closeSheet);
        sheet.appendChild(cancel);
        document.body.appendChild(backdrop);
        document.body.appendChild(sheet);
    }

    // The ⋯ button, drawn: three circles, like every other glyph on the header. The sync
    // state rides on it as a dot (amber: waiting to send, red: something is wrong).
    function mockMoreButton(onTap) {
        const more = document.createElement('button');
        more.type = 'button';
        more.className = 'btn-icon day-more';
        more.setAttribute('aria-label', 'עוד');
        more.setAttribute('aria-haspopup', 'dialog');
        const dots = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        dots.setAttribute('viewBox', '0 0 24 24');
        dots.setAttribute('fill', 'currentColor');
        dots.setAttribute('aria-hidden', 'true');
        [5, 12, 19].forEach(cx => {
            const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            c.setAttribute('cx', String(cx)); c.setAttribute('cy', '12'); c.setAttribute('r', '2.4');
            dots.appendChild(c);
        });
        more.appendChild(dots);
        const chip = document.getElementById('syncChip');
        if (chip && !chip.hidden) {
            if (/chip-warn/.test(chip.className)) more.classList.add('sync-warn');
            if (/chip-danger/.test(chip.className)) more.classList.add('sync-danger');
        }
        more.addEventListener('click', onTap);
        return more;
    }
    window.mockSheet = mockSheet;
    window.mockMoreButton = mockMoreButton;
    window.mockIcon = iconSvg;
    window.closeDayMore = closeSheet;

    function openDayMore() {
        const bulkCount = document.querySelector('.bulk-toggle .bulk-count');
        const count = document.createElement('span');
        count.className = 'count';
        count.textContent = bulkCount ? bulkCount.textContent : String(State.unrecorded().length);
        const copyBtn = document.getElementById('copyDayBtn');
        const copyLabel = copyBtn ? copyBtn.textContent.replace(/^[^\p{L}]+/u, '') : 'מהיום הקודם';
        mockSheet([
            { icon: iconSvg(ICONS.gear), label: 'הגדרות', onTap: () => openSettings() },
            { icon: iconSvg(ICONS.holiday), label: 'הכל חופש', onTap: () => markAllHoliday() },
            { icon: iconSvg(ICONS.bulk), label: 'פעולות מרוכזות', extra: count, onTap: () => { bulkOpen = true; render(); } },
            { icon: iconSvg(ICONS.copy), label: copyLabel, onTap: () => copyPreviousDay() }
        ]);
    }
    window.openDayMore = openDayMore;

    function apply() {
        const onDay = typeof currentView === 'undefined' || currentView === 'day';
        document.body.classList.toggle('view-day', onDay);
        const root = document.getElementById('dayView');
        const nav = root && root.querySelector('.day-nav');
        if (!nav || nav.querySelector('.day-more')) return;
        nav.appendChild(mockMoreButton(openDayMore));

        // The empty day: nothing recorded, nobody absent - the copy strip under the band.
        const header = root.querySelector('.day-header');
        const workers = State.workersForDay(State.date, State.layer);
        const emptyDay = workers.length > 0 && State.unrecorded().length === workers.length;
        const copyBtn = document.getElementById('copyDayBtn');
        if (emptyDay && header && copyBtn && !copyBtn.disabled && copyBtn.style.display !== 'none') {
            const strip = document.createElement('div');
            strip.className = 'day-copy-strip';
            const text = document.createElement('span');
            text.textContent = 'עוד אין רישום ליום הזה';
            strip.appendChild(text);
            const b = document.createElement('button');
            b.type = 'button';
            b.textContent = copyBtn.textContent;
            b.addEventListener('click', () => copyPreviousDay());
            strip.appendChild(b);
            header.insertAdjacentElement('afterend', strip);
        }
    }

    // The floating WhatsApp button hides on the way down and comes back on a small scroll
    // up (the owner's choice, 2026-11-08). The dock element carries the class; the
    // stylesheet slides it out of the way.
    let lastY = window.scrollY;
    window.addEventListener('scroll', () => {
        const y = window.scrollY;
        const dock = document.querySelector('.day-actions');
        if (!dock) return;
        if (y > lastY + 6 && y > 40) dock.classList.add('fab-hidden');
        else if (y < lastY - 6 || y <= 40) dock.classList.remove('fab-hidden');
        lastY = y;
    }, { passive: true });

    const origRender = window.render;
    window.render = function () {
        const result = origRender.apply(this, arguments);
        try { apply(); } catch (error) { console.error('mock-g2', error); }
        return result;
    };
    const origRenderDay = window.renderDay;
    if (typeof origRenderDay === 'function') {
        window.renderDay = function () {
            const result = origRenderDay.apply(this, arguments);
            try { apply(); } catch (error) { console.error('mock-g2', error); }
            return result;
        };
    }
    try { apply(); } catch (error) { console.error('mock-g2', error); }
})();
```

## 11. The other screens, verbatim: mock-g3.css + mock-g3.js (includes the payday-* classes)

```css
/* ================================================================ G3 — every other screen
   CSS-only MOCKUP (mock-g3.js moves a few nodes and builds the bands), injected after
   app.css, readability.css, mock-g1.css and mock-g2.css. Screen only.

   The language, carried from the day screen the owner approved (2026-11-08):
     - every screen opens with the same blue band: its title, its one or two tools, and ⋯
     - one filled primary per screen; secondaries tonal; glyph buttons ghost
     - lists are rows with dividers, not twelve boxes; cards keep a soft edge only
     - the WhatsApp green is the only green button, everywhere
     - dialogs: 20px corners, 21px title, filled primary + tonal cancel, stacked choices
   No text size is reduced. 44px targets and 16px inputs hold. */
@media screen {

/* ---------------------------------------------------------------- the strip above every screen */
@media (max-width: 700px) {
    .topbar .brand, .topbar .topbar-actions, .topbar .sync-chip { display: none; }
    .topbar { padding: 0; margin: 0; gap: 0; border: 0; }
}

/* ---------------------------------------------------------------- the band (built by mock-g3.js) */
.view-band {
    background: var(--band);
    color: var(--band-ink);
    margin: 0 calc(-1 * var(--page-pad, 12px)) 10px;
    padding: 4px 10px 8px;
    padding-top: max(4px, env(safe-area-inset-top));
    box-shadow: 0 2px 10px rgb(0 0 0 / 25%);
}
@media (min-width: 701px) { .view-band { margin: 0 0 12px; border-radius: 12px; } }
.band-row { display: flex; align-items: center; gap: 6px; min-height: 44px; }
.band-row + .band-row { margin-top: 6px; gap: 8px; }
.band-title { flex: 1 1 auto; min-width: 0; text-align: center; line-height: 1.15; }
.band-title strong { display: block; font-size: 19px; color: var(--band-ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.band-title .band-sub { display: block; color: rgb(255 255 255 / 82%); font-size: 14px; font-variant-numeric: tabular-nums; }
.band-row-1.band-start .band-title { text-align: start; padding-inline-start: 6px; }
.band-row-1.band-start .band-title strong { font-size: 22px; }
.view-band .btn-icon, .view-band .btn-nav, .view-band .band-back {
    min-width: 44px; min-height: 44px; padding: 0;
    display: inline-flex; align-items: center; justify-content: center;
    background: transparent; border-color: transparent; color: var(--band-ink); box-shadow: none; border-radius: 12px;
}
.view-band .btn-icon:hover, .view-band .btn-nav:hover, .view-band .band-back:hover { background: var(--band-soft); color: var(--band-ink); }
.view-band .btn-nav .nav-word { display: none; }
.view-band .btn-nav svg { width: 16px; height: 16px; }
.view-band .band-back svg { width: 22px; height: 22px; }
.view-band .day-more svg { width: 26px; height: 26px; display: block; }
.view-band .day-more { position: relative; }
.view-band .day-more::after {
    content: ''; position: absolute; top: 5px; inset-inline-end: 5px; width: 11px; height: 11px;
    border-radius: 50%; border: 2px solid var(--band); display: none;
}
.view-band .day-more.sync-warn::after { display: block; background: #fbbf24; }
.view-band .day-more.sync-danger::after { display: block; background: #f87171; }
/* Tonal-on-band: the chips and secondary buttons that live inside the band. */
.view-band .band-chip, .view-band .crew-shortcuts button, .view-band .week-today-action {
    min-height: 44px; padding: 0 14px;
    background: var(--band-soft); color: var(--band-ink); border: 0; border-radius: 12px;
    font-size: 15px; font-weight: 700; white-space: nowrap; box-shadow: none;
}
.view-band .crew-shortcuts { display: flex; gap: 8px; }
/* The segmented switch inside a band: white half = chosen. */
.view-band .layer-toggle, .view-band .mode-toggle, .view-band .mode-toggle.mode-quiet, .view-band .band-seg {
    display: flex; flex: 0 1 auto; margin: 0; padding: 3px; gap: 2px;
    background: var(--band-soft); border-radius: 12px;
}
.view-band .layer-toggle button, .view-band .mode-quiet .layer-off, .view-band .mode-quiet .layer-on, .view-band .band-seg button {
    min-height: 40px; padding: 0 14px; font-size: 16px; font-weight: 700; border-radius: 9px; white-space: nowrap; box-shadow: none; border: 0;
}
.view-band .layer-off, .view-band .mode-quiet .layer-off, .view-band .band-seg button { background: transparent; color: rgb(255 255 255 / 88%); }
.view-band .layer-on, .view-band .mode-quiet .layer-on, .view-band .band-seg button[aria-pressed="true"] { background: #fff; color: var(--band); }
/* «הפקת דוח» in the reports band: the white primary chip, its menu unchanged. */
.view-band .report-output-actions > summary { background: #fff; color: var(--band); border-radius: 12px; min-height: 44px; font-size: 16px; }

/* ---------------------------------------------------------------- crew (צוות) */
#rosterView .crew-header { display: none; }
#rosterView .roster-panel { padding: 0; border: 0; background: transparent; margin-bottom: 18px; }
#rosterView .panel-head { margin: 0 0 8px; padding: 0 4px 0 0; border: 0; min-height: 44px; }
#rosterView .panel-head h2 { font-size: 17px; color: var(--ink-2); font-weight: 700; }
#rosterView .panel-head .btn-add { background: var(--accent-fill); color: #fff; border: 0; border-radius: 12px; min-height: 44px; padding: 0 16px; font-size: 16px; font-weight: 700; }
#rosterView .crew-search { margin-bottom: 8px; }
#rosterView .crew-search > label { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
#rosterView .crew-search-field input { background: var(--surface-2); border: 0; border-radius: 12px; min-height: 48px; font-size: 16px; }
#rosterView .crew-tools { display: none; }                 /* behind ⋯ */
#rosterView #workerList, #rosterView #placeList, #rosterView #vehicleList {
    background: var(--surface); border: 1px solid var(--line-soft); border-radius: 12px; overflow: hidden;
}
#rosterView .roster-row { padding: 8px 6px 8px 2px; margin: 0; border-bottom: 1px solid var(--line-soft); border-radius: 0; background: transparent; gap: 6px; min-height: 60px; }
#rosterView .roster-row:last-child { border-bottom: 0; }
#rosterView .roster-details { padding-inline-start: 10px; }
#rosterView .roster-details > strong { font-size: 19px; display: block; line-height: 1.3; }
#rosterView .roster-details > .tag, #rosterView .crew-cycle { display: inline; background: transparent; padding: 0; color: var(--ink-3); font-size: 14px; font-weight: 600; margin: 0; }
#rosterView .roster-details > .tag::after { content: ' · '; }
#rosterView .roster-details p, #rosterView .roster-details .roster-meta, #rosterView .roster-details > span:not(.tag) { display: inline; color: var(--ink-3); font-size: 14px; margin: 0; }
/* The status: a word with a dot, not a green block. */
#rosterView .worker-active-toggle, .worker-active-toggle.is-active, .worker-active-toggle {
    background: transparent !important; border: 0 !important; color: var(--ink-3) !important;
    font-size: 14px; font-weight: 700; min-height: 44px; min-width: 44px; padding: 0 8px; box-shadow: none !important;
}
#rosterView .worker-active-toggle.is-active { color: var(--ok) !important; }
#rosterView .worker-active-toggle::before { content: ''; display: inline-block; width: 9px; height: 9px; border-radius: 50%; background: currentColor; margin-inline-end: 6px; vertical-align: 1px; }
/* «עוד ···» → a ghost ⋯ */
#rosterView .crew-edit { background: transparent; border: 0; color: var(--ink-2); font-size: 0; min-width: 44px; min-height: 44px; border-radius: 12px; }
#rosterView .crew-edit::before { content: '•••'; font-size: 14px; letter-spacing: 1px; font-weight: 800; }
#rosterView .roster-row .tag-place { border-radius: 8px; }

/* The empty crew: no search, no tools, one sentence and the one button that fixes it. */
body.mock-empty .crew-search, body.mock-empty .crew-tools { display: none !important; }
body.mock-empty #rosterView #workerList, body.mock-empty #rosterView #placeList { border: 0; background: transparent; }
body.mock-empty #rosterView #workerList .hint, body.mock-empty #rosterView #placeList .hint { text-align: center; padding: 18px 12px; font-size: 16px; color: var(--ink-2); }

/* ---------------------------------------------------------------- the reorder panel */
.reorder-head { background: var(--band); color: #fff; border: 0; padding-top: max(6px, env(safe-area-inset-top)); }
.reorder-head h2, .reorder-head .reorder-sub { color: #fff; }
.reorder-head .reorder-sub { color: rgb(255 255 255 / 80%); }
.reorder-head .btn-icon { color: #fff; }
.reorder-row { border-radius: 12px; border-color: var(--line-soft); }
.reorder-row button { background: transparent; border: 0; color: var(--ink-2); }
.reorder-row .btn-secondary { background: var(--surface-2); color: var(--ink); border-radius: 10px; }
.reorder-foot .btn-add { background: var(--accent-fill); color: #fff; }

/* ---------------------------------------------------------------- week */
#weekView .week-header { display: none; }
#weekView .week-print-title { display: none; }
#weekView .week-phone-back { display: none; }                /* the band's switch does this */
#weekView .week-phone-dates { gap: 6px; }
#weekView .week-phone-date { background: var(--surface-2); border: 0; border-radius: 12px; min-height: 52px; color: var(--ink); }
#weekView .week-phone-date[aria-pressed="true"] { background: var(--accent-fill); color: #fff; }
#weekView .week-phone-panel { border: 1px solid var(--line-soft); border-radius: 12px; }
#weekView .week-phone-panel h2 { font-size: 19px; }
#weekView .week-phone-open { background: var(--accent-fill); color: #fff; border: 0; border-radius: 12px; min-height: 48px; font-size: 16px; font-weight: 700; }
#weekView .week-phone-worker { border-bottom: 1px solid var(--line-soft); min-height: 52px; }
#weekView .week-table th { background: var(--surface-2); color: var(--ink-2); font-weight: 700; border-color: var(--line-soft); }
#weekView .week-table td { border-color: var(--line-soft); }
#weekView .week-table tfoot td { background: var(--surface-2); font-weight: 800; }
#weekView .week-strip, #weekView .table-scroll { border-radius: 12px; }
#weekView .week-legend { margin-top: 10px; }
#weekView .week-grid-hint, #weekView .week-phone-grid-hint { color: var(--ink-3); }

/* ---------------------------------------------------------------- reports */
#reportsView .reports-toolbar { display: none; }
#reportsView .reports-controls { background: transparent; border: 0; padding: 0; margin-bottom: 8px; }
#reportsView .reports-controls > details { background: var(--surface); border: 1px solid var(--line-soft); border-radius: 12px; margin-bottom: 8px; }
#reportsView .reports-controls > details > summary { min-height: 52px; padding: 0 14px; font-size: 16px; font-weight: 700; display: flex; align-items: center; justify-content: space-between; }
#reportsView .report-range-heading span { color: var(--ink-3); font-weight: 600; font-size: 15px; }
#reportsView .range-chips { padding: 4px 12px 12px; }
#reportsView .range-chips .chip-off { background: var(--surface-2); color: var(--ink); border: 0; border-radius: 10px; }
#reportsView .range-chips .chip-on { background: var(--accent-fill); color: #fff; border: 0; border-radius: 10px; }
#reportsView .range-bar { margin: 0 12px 12px; background: transparent; border: 0; padding: 0; }
#reportsView .report-search-tools, #reportsView .finance-actions, #reportsView .report-search-count, #reportsView .report-worker-list { margin-inline: 12px; }
#reportsView .report-worker-list { margin-bottom: 12px; }
#reportsView .report-worker-choice { min-height: 48px; border-radius: 10px; }
#reportsView .report-worker-choice input[type="checkbox"] { width: 22px; height: 22px; accent-color: var(--accent-fill); }
#reportsView .report h2 { font-size: 20px; }
#reportsView .report-period { color: var(--ink-3); }
#reportsView .report-browse-tools .btn-secondary { background: var(--surface-2); border: 0; border-radius: 10px; }
#reportsView .report-group { font-size: 17px; color: var(--ink-2); }
#reportsView .report-worker-tile { border: 1px solid var(--line-soft); border-radius: 12px; background: var(--surface); }
#reportsView .report-tile-value { font-weight: 800; }
#reportsView .report-tile-open { color: var(--accent); }
#reportsView .report-table th { background: var(--surface-2); border-color: var(--line-soft); }
#reportsView .report-table td { border-color: var(--line-soft); }
#reportsView .table-scroll { border-radius: 12px; }
#reportsView .invoice-picker .chip-on { background: var(--accent-fill); color: #fff; border: 0; }
#reportsView .invoice-picker .chip-off { background: var(--surface-2); border-width: 0 0 0 4px; border-radius: 10px; }
#reportsView .invoice-bars { border: 1px solid var(--line-soft); border-radius: 12px; }
#reportsView .invoice-bars-total { background: var(--accent-soft); border-radius: 10px; }
#reportsView .report-explanation summary { color: var(--accent); }
body.mock-empty #reportsView .reports-controls { display: none; }
body.mock-empty #reportsView .report .hint { text-align: center; padding: 24px 12px; font-size: 16px; color: var(--ink-2); }

/* the worker's days (the modal) */
#workerDaysModal .worker-detail-back { background: transparent; border: 0; color: var(--accent); padding-inline: 0; }
#workerDaysModal .wday { border-color: var(--line-soft); min-height: 52px; }
#workerDaysModal .wday-chip { background: var(--surface-2); border-radius: 8px; }
#workerDaysModal .wday-total { background: var(--surface-2); border-radius: 10px; }
#workerDaysModal .wday-actions .btn-success { background: var(--wa-fill); color: var(--wa-ink); }

/* ---------------------------------------------------------------- advances (מקדמות) */
#advancesView > h2 { display: none; }
#advancesView > .btn-secondary:first-child, #advancesView > h2 + .btn-secondary { display: none; }   /* back / סידור live in the band */
#advancesView > p.hint { color: var(--ink-3); font-size: 15px; margin: 0 2px 8px; }
#advancesView > input { background: var(--surface-2); border: 0; border-radius: 12px; min-height: 48px; font-size: 16px; margin-bottom: 8px; }
#advancesView .advance-workers { background: var(--surface); border: 1px solid var(--line-soft); border-radius: 12px; overflow: hidden; display: block; }
#advancesView .advance-worker-card { background: transparent; border: 0; border-bottom: 1px solid var(--line-soft); border-radius: 0; padding: 0 14px; min-height: 60px; align-items: center; width: 100%; }
#advancesView .advance-worker-card:last-child { border-bottom: 0; }
#advancesView .advance-worker-card strong { font-size: 19px; }
#advancesView .advance-worker-card span { font-size: 19px; font-weight: 750; color: var(--accent); }
#advancesView .advance-worker-card.is-zero span, #advancesView .advance-worker-card span.is-zero { color: var(--ink-3); font-weight: 600; font-size: 16px; }
#advancesView .advance-balance { border-radius: 16px; padding: 18px 20px; }
#advancesView .advance-balance > span { color: var(--ink-2); font-size: 15px; font-weight: 700; }
#advancesView .advance-balance > strong { font-size: 36px; font-weight: 800; color: var(--accent); }
#advancesView .finance-actions button:first-child:not(.btn-secondary) { background: var(--accent-fill); color: #fff; border: 0; }
#advancesView .finance-actions .btn-secondary { background: var(--surface-2); color: var(--ink); border: 0; }
#advancesView > .btn-secondary { background: var(--surface-2); border: 0; }
#advancesView h3 { font-size: 17px; color: var(--ink-2); margin: 16px 2px 8px; }
#advancesView .advance-card { border-color: var(--line-soft); border-radius: 12px; }
#advancesView .wday-ledger summary { color: var(--accent); }

/* ---------------------------------------------------------------- pay day (the main session's feature, in this language) */
.payday-door {
    display: flex; align-items: center; gap: 12px;
    background: var(--accent-soft); border: 0; border-radius: 16px; padding: 14px 16px; margin: 0 0 12px;
}
.payday-door-icon { width: 44px; height: 44px; border-radius: 12px; background: var(--accent-fill); color: #fff; display: grid; place-items: center; flex: 0 0 auto; }
.payday-door-icon svg { width: 26px; height: 26px; }
.payday-door-text { flex: 1 1 auto; min-width: 0; }
.payday-door-text strong { display: block; font-size: 18px; }
.payday-door-text span { color: var(--ink-2); font-size: 15px; }
.payday-door-go { min-height: 44px; min-width: 104px; flex-shrink: 0; background: var(--accent-fill); color: #fff; border: 0; border-radius: 12px; font-size: 16px; font-weight: 700; }
.payday-period { color: var(--ink-3); font-size: 15px; margin: 0 2px 4px; }
.payday-lead { color: var(--ink-2); margin: 0 2px 12px; font-size: 15px; }
.payday-row { background: var(--surface); border: 1px solid var(--line-soft); border-radius: 12px; padding: 12px 14px; margin: 0 0 10px; }
.payday-row-error { border-color: var(--danger); }
.payday-paid { border-color: var(--line-soft); }
.payday-row-top { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
.payday-row-top strong { font-size: 19px; overflow-wrap: anywhere; }
.payday-earned { color: var(--ink-2); font-size: 15px; flex-shrink: 0; font-variant-numeric: tabular-nums; }
.payday-mid { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: 8px; min-height: 44px; }
.payday-owed { font-size: 15px; line-height: 1.4; color: var(--ink-2); }
.payday-owed strong { color: var(--ink); font-size: 17px; }
.payday-owed small { display: block; color: var(--ink-3); font-size: 14px; }
.payday-none { color: var(--ink-3); }
.payday-ded { display: flex; align-items: center; gap: 8px; font-size: 15px; color: var(--ink-2); font-weight: 700; }
.payday-ded input { font: inherit; font-size: 18px; font-weight: 700; width: 104px; min-height: 48px; padding: 8px 10px; border: 1px solid var(--line-ctl); border-radius: 10px; background: var(--surface-2); color: var(--ink); text-align: center; font-variant-numeric: tabular-nums; }
.payday-row-error .payday-ded input { border-color: var(--danger); }
.payday-result { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; flex-wrap: wrap; margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--line-soft); font-size: 16px; }
.payday-net { font-weight: 800; font-size: 18px; }
.payday-after { color: var(--ink-3); }
.payday-total { background: var(--accent-soft); border-radius: 16px; padding: 18px 20px; margin: 14px 0 12px; }
.payday-total > span { color: var(--ink-2); font-size: 15px; font-weight: 700; }
.payday-total > strong { display: block; font-size: 38px; font-weight: 800; color: var(--accent); margin: 6px 0; }
.payday-total p { margin: 0; color: var(--ink-2); }
.payday-go { width: 100%; min-height: 54px; font-size: 17px; font-weight: 700; background: var(--accent-fill); color: #fff; border: 0; border-radius: 14px; margin-top: 4px; }
.payday-chip { padding: 4px 10px; border-radius: 999px; font-size: 14px; font-weight: 700; flex-shrink: 0; background: var(--ok-bg); color: var(--ok); }
.payday-paid-line { margin: 6px 0 0; font-size: 17px; font-weight: 700; }
.payday-left { margin-top: 2px; color: var(--ink-3); }
.payday-fix { margin: 8px 0 0; }
.payday-fix .btn-secondary { background: var(--surface-2); border: 0; }
.payday-done { background: var(--ok-bg); border-radius: 16px; padding: 18px 20px; margin: 0 0 12px; }
.payday-done > span { color: var(--ok); font-weight: 700; }
.payday-done > strong { display: block; font-size: 38px; font-weight: 800; color: var(--ink); margin: 6px 0; }
.payday-done p { margin: 0; color: var(--ink-2); }
.payday-hint { color: var(--ink-3); font-size: 14px; margin: 8px 2px 0; }

/* ---------------------------------------------------------------- settings (behind ⋯) */
.settings-head { background: var(--band); color: #fff; border: 0; padding-top: max(8px, env(safe-area-inset-top)); }
.settings-head .settings-eyebrow { color: rgb(255 255 255 / 80%); }
.settings-head h2 { color: #fff; font-size: 26px; }
.settings-head .settings-close { background: transparent; border: 0; color: #fff; }
.settings-nav { background: var(--band); border: 0; padding: 0 12px 10px; gap: 8px; box-shadow: 0 2px 10px rgb(0 0 0 / 25%); }
.settings-nav button { background: var(--band-soft); color: #fff; border: 0; border-radius: 12px; font-weight: 700; }
.settings-nav button:hover { background: rgb(255 255 255 / 24%); color: #fff; }
.settings-section-title h3 { font-size: 20px; }
.settings-group { border-color: var(--line-soft); border-radius: 12px; }
.settings-card-icon { background: var(--accent-soft); color: var(--accent); border-radius: 12px; }
.settings-group .btn-secondary { background: var(--surface-2); border: 0; border-radius: 12px; color: var(--ink); }
.settings-group .settings-status { background: transparent; border: 0; padding: 0; }
.settings-group .push-reminder-enable { background: var(--accent-fill) !important; color: #fff !important; border: 0 !important; }
.settings-group .backup-primary { background: var(--accent-fill); color: #fff; border: 0; border-radius: 12px; }
.settings-group-backup { border-color: var(--line-soft); }
.settings-panel .app-version span { background: var(--surface-2); }
.push-reminder-times > div { background: var(--accent-soft); border-radius: 12px; }

/* ---------------------------------------------------------------- dialogs */
.modal-content { border-radius: 20px; border: 0; padding: 20px 18px 18px; box-shadow: 0 20px 60px rgb(0 0 0 / 45%); }
.modal-content h3 { font-size: 21px; margin: 0 0 6px; }
.modal-content .picker-context, .modal-content > .hint:first-of-type { color: var(--ink-3); }
.modal-content input[type="text"], .modal-content input[type="email"], .modal-content input[type="password"],
.modal-content input[type="tel"], .modal-content input[type="number"], .modal-content input[type="date"],
.modal-content textarea, .modal-content select, #askInput {
    background: var(--surface-2); border: 1px solid transparent; border-radius: 12px; min-height: 48px; font-size: 16px;
}
.modal-content input:focus-visible, .modal-content textarea:focus-visible, .modal-content select:focus-visible { border-color: var(--accent-fill); }
.modal-actions { gap: 8px; margin-top: 14px; }
.modal-actions button { min-height: 48px; border-radius: 12px; font-size: 16px; font-weight: 700; flex: 1 1 0; }
.modal-actions button:not(.btn-secondary):not(.btn-icon):not(.btn-success):not(.btn-danger) { background: var(--accent-fill); color: #fff; border: 0; }
.modal-actions .btn-secondary { background: var(--surface-2); color: var(--ink); border: 0; }
.modal-actions .btn-success { background: var(--wa-fill); color: var(--wa-ink); border: 0; }
.ask-choices button { background: var(--surface-2) !important; color: var(--ink) !important; border: 0 !important; }
.ask-choices button:first-child { background: var(--accent-fill) !important; color: #fff !important; }
.form-more { background: transparent; border: 0; padding: 0; }
.form-more > summary { color: var(--accent); font-weight: 700; min-height: 44px; display: flex; align-items: center; }
.worker-info { border-color: var(--line-soft); }
.worker-history { background: var(--surface-2); border-radius: 12px; padding: 12px 14px; }
.worker-danger { border-top-color: var(--line-soft); }
.worker-danger .btn-danger { background: var(--danger-bg); color: var(--danger); border: 0; }

/* pickers */
.picker-search, .picker-search-tools input { background: var(--surface-2); border: 0; border-radius: 12px; min-height: 48px; }
.picker-row { min-height: 56px; border-color: var(--line-soft); padding: 4px 2px; }
.picker-row .btn-add { background: var(--accent-fill); color: #fff; border: 0; border-radius: 10px; min-height: 44px; padding: 0 14px; font-weight: 700; }
.picker-row .btn-on { background: var(--ok-bg); color: var(--ok); border: 0; border-radius: 10px; min-height: 44px; font-weight: 700; }
.picker-row-on { background: transparent; }
.picker-name { font-size: 18px; font-weight: 700; }
.picker-actions .btn-secondary { background: var(--surface-2); border: 0; border-radius: 12px; min-height: 48px; }
.place-choice { gap: 8px; }
.place-btn { background: var(--surface-2); border: 0; border-radius: 12px; min-height: 56px; font-size: 17px; font-weight: 700; }
.place-choice-dot { width: 14px; height: 14px; border-radius: 50%; }

/* the assign sheet */
.sheet-content { border-radius: 20px 20px 0 0; border: 0; box-shadow: 0 -10px 40px rgb(0 0 0 / 45%); }
.sheet-head { border-bottom: 1px solid var(--line-soft); }
.sheet-head h3 { font-size: 24px; }
.sheet-meta { color: var(--ink-3); }
.sheet-status { border-radius: 8px; background: var(--surface-2); color: var(--ink-2); }
.sheet-status-recorded { background: var(--ok-bg); color: var(--ok); }
.sheet-place { border-radius: 12px; min-height: 56px; border: 2px solid transparent; }
.sheet-place-on { box-shadow: 0 0 0 3px var(--surface), 0 0 0 5px #fff; }
.sheet-note { color: var(--ink-3); }
.sheet-rates .layer-toggle, .sheet-rate-row .layer-toggle { background: var(--surface-2); border-radius: 12px; padding: 3px; }
.sheet-rate-row .layer-on { background: var(--accent-fill); color: #fff; }
.sheet-rate-row .layer-off { color: var(--ink-2); }
.rate-hours { background: var(--surface-2); border: 1px solid var(--line-ctl); border-radius: 10px; min-height: 44px; }
.sheet-actions { gap: 8px; }
.sheet-actions button { min-height: 48px; border-radius: 12px; font-weight: 700; font-size: 16px; }
.sheet-actions .btn-secondary { background: var(--surface-2); color: var(--ink); border: 0; }
.sheet-actions .sheet-fwd { background: var(--accent-fill); color: #fff; border: 0; flex: 1 1 auto; white-space: nowrap; }
.sheet-actions .btn-secondary:last-child { background: transparent; color: var(--ink-2); }

/* the day drawer */
.day-drawer { border-radius: 0 20px 20px 0; }
@media (max-width: 700px) { .day-drawer { border-radius: 20px 0 0 20px; } }
.drawer-head { background: var(--band); color: #fff; border: 0; }
.drawer-head h3 { color: #fff; }
.drawer-head .btn-icon { color: #fff; }
.drawer-today { background: var(--accent-fill); color: #fff; border: 0; border-radius: 12px; min-height: 48px; font-weight: 700; }
.drawer-week-title { color: var(--ink-3); }
.drawer-day { border-radius: 10px; min-height: 48px; }
.drawer-day.dd-on { background: var(--accent-soft); }
.dd-today { background: var(--accent-fill); color: #fff; border-radius: 6px; }

/* WhatsApp and the seder */
#shareModal .share-styles .chip-on { background: var(--accent-fill); color: #fff; border: 0; border-radius: 10px; }
#shareModal .share-styles .chip-off { background: var(--surface-2); color: var(--ink); border: 0; border-radius: 10px; }
#shareModal .share-warning { background: var(--warn-bg); color: var(--warn); border: 0; border-radius: 12px; }
#shareModal textarea { background: var(--surface-2); border: 0; border-radius: 12px; font-size: 16px; }
#shareModal .modal-actions { flex-wrap: wrap; }
#shareModal .modal-actions .btn-success { flex: 1 1 100%; min-height: 52px; font-size: 17px; }
#shareModal .modal-actions .seder-entry { flex: 1 1 100%; }
#shareModal .modal-actions .btn-secondary:not(.seder-entry) { background: transparent; color: var(--ink-2); flex: 1 1 40%; }
#sederModal .seder-row { border-color: var(--line-soft); min-height: 56px; }
#sederModal .seder-go { background: var(--wa-fill); color: var(--wa-ink); border: 0; border-radius: 12px; min-height: 52px; font-size: 17px; font-weight: 700; }
#sederModal .seder-note { background: var(--warn-bg); color: var(--warn); border: 0; border-radius: 12px; }
#sederModal .seder-foot .btn-secondary { background: transparent; color: var(--ink-2); border: 0; }

/* ---------------------------------------------------------------- banners and the undo bar */
/* One line: the sentence wraps inside its own box, the buttons never drop under it. */
.banner { border-radius: 12px; border-inline-start: 0; padding: 8px 10px 8px 12px; gap: 10px; align-items: center; flex-wrap: nowrap; }
.banner span { flex: 1 1 0; min-width: 0; white-space: normal; }
.banner::before { content: ''; width: 10px; height: 10px; border-radius: 50%; background: currentColor; flex: 0 0 auto; }
.banner-warn { background: var(--warn-bg); }
.banner-danger { background: var(--danger-bg); }
.banner-info { background: var(--accent-soft); }
.banner span { min-width: 0; flex: 1 1 160px; font-weight: 600; }
.banner .btn-secondary { background: var(--accent-fill); color: #fff; border: 0; border-radius: 10px; min-height: 44px; font-weight: 700; }
.banner-warn .btn-secondary, .banner-danger .btn-secondary { background: rgb(255 255 255 / 14%); color: inherit; }
.banner .btn-icon { min-width: 44px; min-height: 44px; }
.banner-fold .banner-sum { min-height: 44px; }
.banner-fold .banner-go { border: 0; background: rgb(255 255 255 / 14%); border-radius: 10px; }
.undo-bar { border-radius: 14px; padding: 8px 10px 8px 14px; font-size: 15px; }
.undo-bar .btn-secondary { background: var(--accent-fill); color: #fff; border: 0; border-radius: 10px; min-height: 44px; }

/* A heading that takes focus when its dialog opens keeps a ring a keyboard user can see,
   drawn off the text rather than as a box around it. */
h2:focus-visible, h3:focus-visible, .settings-head h2:focus-visible, .modal-content h3:focus-visible, .reorder-head h2:focus-visible {
    outline: 2px solid var(--accent-fill); outline-offset: 6px; border-radius: 8px;
}
.settings-head h2:focus-visible, .reorder-head h2:focus-visible { outline-color: rgb(255 255 255 / 55%); }
/* A node the mock moved into a band, or replaced by one. */
.band-moved { display: none !important; }
#rosterView .crew-cycle::after { content: ' · '; }
body.mock-empty #advancesView > input { display: none; }
body.mock-empty #advancesView .advance-workers { background: transparent; border: 0; text-align: center; color: var(--ink-2); padding: 18px 12px; }

/* ---------------------------------------------------------------- the first evening (setup card) */
.setup-card { border: 0; background: var(--surface); border-radius: 16px; padding: 24px 18px; text-align: center; }
.setup-card button:not(.btn-secondary) { background: var(--accent-fill); color: #fff; border: 0; border-radius: 12px; min-height: 48px; font-size: 16px; font-weight: 700; }
.setup-card .btn-secondary, .setup-alt { background: var(--surface-2); color: var(--ink); border: 0; border-radius: 12px; }

}
```

```js
// G3 mock-up: the bands on every other screen, their ⋯ sheets, the empty-state flag and
// the pay-day screens. Injected at screenshot time only, after mock-g2.js (which provides
// mockSheet, mockMoreButton, mockIcon and the render hook pattern).
(function () {
    const ICON = {
        gear: 'm9 3-.6 2.2-2 .9-2-.6-2 3.4 1.5 1.7v2.3L2.4 15l2 3.4 2-.6 2 .9L9 21h4l.6-2.3 2-.9 2 .6 2-3.4-1.5-1.8V11l1.5-1.7-2-3.4-2 .6-2-.9L13 3Z M14 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
        paste: 'M9 4h6a1 1 0 0 1 1 1v1h2a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2V5a1 1 0 0 1 1-1Zm0 7h6m-6 4h4',
        sort: 'M8 5v14m0 0-3-3m3 3 3-3M16 19V5m0 0-3 3m3-3 3 3',
        print: 'M6 9V4h12v5M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v6H6z',
        image: 'M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm4 5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm-5 8 5-5 4 4 3-3 5 5',
        list: 'M4 6h16M4 12h16M4 18h10',
        money: 'M3 7h18v10H3zM12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM6 12h.01M18 12h.01',
        back: 'm9 6 6 6-6 6'
    };
    const svg = (path, stroke) => {
        const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('fill', 'none');
        s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', stroke || '1.8');
        s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round'); s.setAttribute('aria-hidden', 'true');
        const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', path); s.appendChild(p);
        return s;
    };
    const el2 = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };

    // ---------------------------------------------------------------- the band
    function band(view, { title, sub, start, back, row1 = [], row2 = [], more = [] }) {
        if (!view || view.querySelector(':scope > .view-band')) return null;
        const wrap = el2('div', 'view-band');
        const r1 = el2('div', 'band-row band-row-1' + (start ? ' band-start' : ''));
        if (back) {
            const b = el2('button', 'band-back'); b.type = 'button'; b.setAttribute('aria-label', back.label || 'חזרה');
            b.appendChild(svg(ICON.back, '2')); b.addEventListener('click', back.onTap); r1.appendChild(b);
        }
        row1.filter(n => n && n.dataset && n.dataset.bandSide === 'start').forEach(n => r1.appendChild(n));
        const t = el2('div', 'band-title');
        t.appendChild(el2('strong', null, title));
        if (sub) t.appendChild(el2('span', 'band-sub', sub));
        r1.appendChild(t);
        row1.filter(n => n && !(n.dataset && n.dataset.bandSide === 'start')).forEach(n => r1.appendChild(n));
        const moreBtn = window.mockMoreButton ? window.mockMoreButton(() => window.mockSheet(more, { syncLine: true })) : null;
        if (moreBtn) r1.appendChild(moreBtn);
        wrap.appendChild(r1);
        if (row2.length) { const r2 = el2('div', 'band-row band-row-2'); row2.forEach(n => n && r2.appendChild(n)); wrap.appendChild(r2); }
        view.prepend(wrap);
        return wrap;
    }
    const settingsRow = () => ({ icon: svg(ICON.gear), label: 'הגדרות', onTap: () => openSettings() });
    const clickRow = (icon, label, selector, root) => {
        const target = (root || document).querySelector(selector);
        return target ? { icon: svg(ICON[icon]), label: (label || target.textContent).replace(/^[^\p{L}\d]+/u, '').trim(), onTap: () => target.click() } : null;
    };

    // ---------------------------------------------------------------- per view
    function roster() {
        const view = document.getElementById('rosterView');
        if (!view) return;
        const h1 = view.querySelector('.crew-header h1');
        const shortcuts = view.querySelector('.crew-shortcuts');
        band(view, {
            title: h1 ? h1.textContent : 'צוות', start: true,
            row2: shortcuts ? [shortcuts] : [],
            more: [settingsRow(), clickRow('paste', null, '.crew-tools button:first-child', view), clickRow('sort', null, '#reorderOpenBtn', view)].filter(Boolean)
        });
    }
    function week() {
        const view = document.getElementById('weekView');
        if (!view) return;
        const range = view.querySelector('.week-range');
        const back = view.querySelector('.week-header .nav-back');
        const fwd = view.querySelector('.week-header .nav-fwd');
        const today = view.querySelector('.week-today-action');
        const seg = el2('div', 'band-seg');
        const mode = typeof weekPhoneMode !== 'undefined' ? weekPhoneMode : 'grid';
        [['grid', 'טבלה'], ['days', 'ימים']].forEach(([m, label]) => {
            const b = el2('button', null, label); b.type = 'button';
            b.setAttribute('aria-pressed', String(mode === m));
            b.addEventListener('click', () => { setWeekPhoneMode(m); });
            seg.appendChild(b);
        });
        if (back) back.dataset.bandSide = 'start';
        // The week's arrows carry their words as bare text; the band shows the chevron
        // alone, so the words move into a span the stylesheet hides (aria-label keeps them).
        [back, fwd].filter(Boolean).forEach(b => {
            if (!b.getAttribute('aria-label')) b.setAttribute('aria-label', b.textContent.trim());
            Array.from(b.childNodes).forEach(n => {
                if (n.nodeType === 3 && n.textContent.trim()) { const s = el2('span', 'nav-word', n.textContent); b.replaceChild(s, n); }
            });
        });
        band(view, {
            title: 'שבוע', sub: range ? range.textContent : '',
            row1: [back, fwd].filter(Boolean),
            row2: [seg, today].filter(Boolean),
            more: [settingsRow(), clickRow('print', 'הדפסה', '.week-print-action', view), clickRow('image', 'שיתוף כתמונה', '.week-share-action', view)].filter(Boolean)
        });
    }
    function reports() {
        const view = document.getElementById('reportsView');
        if (!view) return;
        const out = view.querySelector('.report-output-actions');
        const toggle = view.querySelector('.report-section-toggle');
        band(view, { title: 'דוחות', start: true, row1: out ? [out] : [], row2: toggle ? [toggle] : [], more: [settingsRow()] });
    }
    function advances() {
        const view = document.getElementById('advancesView');
        if (!view) return;
        const h2 = view.querySelector(':scope > h2');
        const text = h2 ? h2.textContent : 'מקדמות';
        if (/·/.test(text)) {
            const name = text.split('·').pop().trim();
            const backBtn = view.querySelector(':scope > .btn-secondary');
            if (backBtn) backBtn.classList.add('band-moved');
            band(view, { title: name, sub: 'מקדמות', back: { label: backBtn ? backBtn.textContent : 'חזרה', onTap: () => backBtn && backBtn.click() }, more: [settingsRow()] });
        } else {
            const seder = view.querySelector(':scope > h2 + .btn-secondary');
            if (seder) seder.classList.add('band-moved');
            band(view, { title: 'מקדמות', start: true, more: [settingsRow(), seder ? { icon: svg(ICON.list), label: seder.textContent.trim(), onTap: () => seder.click() } : null].filter(Boolean) });
            view.querySelectorAll('.advance-worker-card span').forEach(s => { if (/^\s*0\s*₪/.test(s.textContent)) s.classList.add('is-zero'); });
        }
    }

    // ---------------------------------------------------------------- pay day (visual mock of the planned feature)
    const ROWS = [
        { name: 'עומר סעד', days: 6, gross: 3000, owes: 2000, parts: '1500 מקודם · 500 בתקופה', ded: 500 },
        { name: 'ראמי ח׳ורי', days: 5, gross: 2250, owes: 0 },
        { name: 'סלים נסאר', days: 6, gross: 2520, owes: 1000, ded: 1000 },
        { name: 'וסים עודה', days: 4, gross: 1600, owes: 2000, ded: 300 }
    ];
    const money = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    window.mockPayday = function (mode) {
        const view = document.getElementById('advancesView');
        if (!view) return;
        const bandEl = view.querySelector(':scope > .view-band');
        if (mode === 'entry') {
            const door = el2('div', 'payday-door');
            const icon = el2('div', 'payday-door-icon'); icon.appendChild(svg(ICON.money, '1.9')); door.appendChild(icon);
            const t = el2('div', 'payday-door-text');
            t.appendChild(el2('strong', null, 'יום תשלום · היום'));
            t.appendChild(el2('span', null, '4 עובדים שבועיים · 13/11–19/11'));
            door.appendChild(t);
            const go = el2('button', 'payday-door-go', 'לתשלום'); go.type = 'button'; door.appendChild(go);
            (bandEl || view.firstChild).insertAdjacentElement(bandEl ? 'afterend' : 'beforebegin', door);
            return;
        }
        Array.from(view.children).forEach(c => { if (c !== bandEl) c.remove(); });
        if (bandEl) bandEl.remove();
        band(view, { title: 'יום תשלום', sub: 'חמישי 19/11/2026', back: { label: 'חזרה למקדמות', onTap: () => {} }, more: [settingsRow()] });
        view.appendChild(el2('p', 'payday-period', 'שבועי · 4 עובדים · 13/11–19/11'));
        let pay = 0, ded = 0, left = 0;
        if (mode === 'paid') {
            const done = el2('div', 'payday-done');
            done.appendChild(el2('span', null, 'שולם ונסגר · חמישי 19/11'));
            const big = el2('strong'); done.appendChild(big);
            const line = el2('p'); done.appendChild(line);
            view.appendChild(done);
            ROWS.forEach(r => {
                const off = r.ded || 0, net = r.gross - off, after = r.owes - off;
                pay += net; ded += off; left += after;
                const card = el2('section', 'payday-row payday-paid');
                const top = el2('div', 'payday-row-top');
                top.appendChild(el2('strong', null, r.name));
                top.appendChild(el2('span', 'payday-chip', '✓ שולם 19/11'));
                card.appendChild(top);
                card.appendChild(el2('p', 'payday-paid-line', off > 0 ? `שולם ${money(net)} ₪ · קוזז ${money(off)} ₪` : `שולם ${money(net)} ₪`));
                card.appendChild(el2('p', 'payday-left', after > 0 ? `נשאר חוב מקדמה: ${money(after)} ₪` : 'אין חוב מקדמה'));
                if (off > 0) { const acts = el2('div', 'finance-actions payday-fix'); const b = el2('button', 'btn-secondary', 'תיקון טעות'); b.type = 'button'; acts.appendChild(b); card.appendChild(acts); }
                view.appendChild(card);
            });
            big.textContent = `${money(pay)} ₪`;
            line.textContent = `קוזז ממקדמות: ${money(ded)} ₪ · נשאר חוב: ${money(left)} ₪`;
            view.appendChild(el2('p', 'payday-hint', 'טעות בסכום? «תיקון טעות» רושם תיקון ליד הסגירה. הסגירה עצמה לא נמחקת.'));
            return;
        }
        view.appendChild(el2('p', 'payday-lead', 'כתוב כמה לקזז מכל עובד שיש לו חוב. 0 = לא מקזזים הפעם.'));
        ROWS.forEach(r => {
            const off = r.ded || 0, net = r.gross - off, after = r.owes - off;
            const card = el2('section', 'payday-row');
            const top = el2('div', 'payday-row-top');
            top.appendChild(el2('strong', null, r.name));
            top.appendChild(el2('span', 'payday-earned', `${r.days} ימים · ${money(r.gross)} ₪`));
            card.appendChild(top);
            if (r.owes > 0) {
                const mid = el2('div', 'payday-mid');
                const owed = el2('div', 'payday-owed');
                owed.appendChild(document.createTextNode('חוב מקדמה '));
                owed.appendChild(el2('strong', null, `${money(r.owes)} ₪`));
                if (r.parts) owed.appendChild(el2('small', null, r.parts));
                mid.appendChild(owed);
                const lab = el2('label', 'payday-ded');
                lab.appendChild(el2('span', null, 'לקזז'));
                const input = document.createElement('input'); input.type = 'text'; input.inputMode = 'numeric'; input.dir = 'ltr'; input.value = String(off); input.setAttribute('aria-label', `כמה לקזז מ${r.name}`);
                lab.appendChild(input); mid.appendChild(lab);
                card.appendChild(mid);
            }
            const res = el2('div', 'payday-result');
            res.appendChild(el2('span', 'payday-net', `לתשלום ${money(net)} ₪`));
            res.appendChild(el2('span', r.owes > 0 ? 'payday-after' : 'payday-none', r.owes > 0 ? `נשאר חוב ${money(after)} ₪` : 'אין חוב מקדמה'));
            card.appendChild(res);
            view.appendChild(card);
            pay += net; ded += off; left += after;
        });
        const total = el2('div', 'payday-total');
        total.appendChild(el2('span', null, 'סה״כ לתשלום עכשיו'));
        total.appendChild(el2('strong', null, `${money(pay)} ₪`));
        total.appendChild(el2('p', null, `קיזוז מקדמות: ${money(ded)} ₪ · נשאר חוב: ${money(left)} ₪`));
        view.appendChild(total);
        const go = el2('button', 'payday-go', 'שילמתי · סגור חשבון ל־4 עובדים'); go.type = 'button'; view.appendChild(go);
        view.appendChild(el2('p', 'payday-hint', 'הסגירה סופית. אחריה התקופה לא משתנה, והחוב שנשאר עובר לתקופה הבאה.'));
    };

    // ---------------------------------------------------------------- apply after every render
    function apply() {
        const view = typeof currentView !== 'undefined' ? currentView : 'day';
        document.body.classList.toggle('mock-empty', State.activeWorkers().length === 0);
        if (view === 'roster') roster();
        if (view === 'week') week();
        if (view === 'reports') reports();
        if (view === 'advances') advances();
    }
    const origRender = window.render;
    window.render = function () { const r = origRender.apply(this, arguments); try { apply(); } catch (e) { console.error('mock-g3', e); } return r; };
    const origWeek = window.setWeekPhoneMode;
    if (typeof origWeek === 'function') window.setWeekPhoneMode = function () { const r = origWeek.apply(this, arguments); try { apply(); } catch (e) { console.error('mock-g3', e); } return r; };
    const origAdv = window.showWorkerAdvances;
    if (typeof origAdv === 'function') window.showWorkerAdvances = function () { const r = origAdv.apply(this, arguments); try { apply(); } catch (e) { console.error('mock-g3', e); } return r; };
    try { apply(); } catch (e) { console.error('mock-g3', e); }
})();
```

## 12. The started implementation (uncommitted, in the design worktree on the PC; also design-v169-wip.patch beside this file)

Architecture chosen: a NEW layer `css/design.css` (loaded after readability.css, in SHELL) rather than
rewriting app.css; `js/ui/band.js` (renderBand/moreButton/moreRow/settingsMoreRow/bandIcon) and
`js/ui/more.js` (openMoreSheet/closeMoreSheet over a `#moreSheet` .modal.sheet in index.html, closer
registered in js/ui/modal.js MODAL_CLOSERS); day.js gets the ⋯ (dayMoreRows), the copy strip
(renderCopyStrip/copySourceLabel) and the FAB scroll class in readDayScroll; week.js renderWeekHeader
returns a band with the טבלה|ימים switch; reports.js renderReports/renderAdvances return bands;
roster.js renderRosterBand builds the crew band once over the static markup; stamps set to v169
(PROVISIONAL - agree the number with the parent session first). NOT yet done: tests, docs/releases.md,
CLAUDE.md file list, the suites that will move, any test run. Nothing of this was committed or pushed.

```diff
diff --git a/index.html b/index.html
index c0608b5..67571f0 100644
--- a/index.html
+++ b/index.html
@@ -9,6 +9,7 @@
 <title>פרקד - רישום עבודה</title>
 <link rel="stylesheet" href="css/app.css" onerror="this.dataset.loadFailed='true'">
 <link rel="stylesheet" href="css/readability.css" onerror="this.dataset.loadFailed='true'">
+<link rel="stylesheet" href="css/design.css" onerror="this.dataset.loadFailed='true'">
 <link rel="manifest" href="manifest.webmanifest">
 <meta name="theme-color" content="#1f4b7a">
 <!-- Which build this PAGE belongs to. app.js carries the same string, and the two are
@@ -17,7 +18,7 @@
      does not read. The service worker is what stops that happening; this is what
      notices if it ever does. Bumped with sw.js and js/app.js, and the suite checks all
      three agree. -->
-<meta name="farkad-build" content="v167">
+<meta name="farkad-build" content="v169">
 <link rel="icon" href="icons/icon-192.png">
 <link rel="apple-touch-icon" href="icons/icon-192.png">
 </head>
@@ -341,6 +342,18 @@
     </div>
 </div>
 
+<!-- The ⋯ sheet (v169): where the buttons the bands no longer show went. Filled by
+     openMoreSheet (js/ui/more.js) from the screen's own rows; the first line is the
+     sync sentence. A .modal.sheet like the one above, so modal.js owns its keys. -->
+<div class="modal sheet" id="moreSheet" role="dialog" aria-modal="true" aria-label="עוד">
+    <div class="modal-content sheet-content more-content">
+        <div class="more-grip" aria-hidden="true"></div>
+        <p class="more-sync" id="moreSync" role="status"></p>
+        <div class="more-rows" id="moreRows"></div>
+        <button type="button" class="more-close" id="moreClose" onclick="closeMoreSheet()">סגור</button>
+    </div>
+</div>
+
 <!-- Sign-in. Email and password because it is the only route that stays INSIDE an
      installed app on an iPhone: a home-screen web app has its own storage, and any
      Google flow completes over in Safari, in a different store, leaving this one exactly
@@ -657,6 +670,8 @@
 <script src="js/ui/undo.js"></script>
 <script src="js/ui/modal.js"></script>
 <script src="js/ui/sitecolor.js"></script>
+<script src="js/ui/band.js"></script>
+<script src="js/ui/more.js"></script>
 <script src="js/ui/day.js"></script>
 <script src="js/ui/sheet.js"></script>
 <script src="js/ui/quickstart.js"></script>
diff --git a/js/app.js b/js/app.js
index 86b604e..2b379a8 100644
--- a/js/app.js
+++ b/js/app.js
@@ -4,7 +4,7 @@
 // the version actually RUNNING on this phone - which is the question that cannot
 // otherwise be answered from inside an installed app, and the one that matters when a
 // fix is not showing up.
-const APP_VERSION = 'v167';
+const APP_VERSION = 'v169';
 
 // Is the page in front of us from the same build as these scripts?
 //
diff --git a/js/ui/day.js b/js/ui/day.js
index aa54d04..61af1c9 100644
--- a/js/ui/day.js
+++ b/js/ui/day.js
@@ -58,6 +58,57 @@ function readDayScroll() {
     // frame is style work the list does not need. Only a crossing changes anything.
     if (!compact && y > COMPACT_ON) body.classList.add('day-compact');
     else if (compact && y < COMPACT_OFF) body.classList.remove('day-compact');
+    // The floating WhatsApp button (v169) hides on the way down and comes back on a small
+    // scroll up - the owner's choice («يختفي وقت التمرير»). A class on the dock, from
+    // scrollY alone, like the compact header above; the dock's box does not move, so
+    // what bars.js measures does not change.
+    const dock = document.querySelector('.day-actions');
+    if (dock) {
+        if (y > fabLastY + 6 && y > 40) dock.classList.add('fab-hidden');
+        else if (y < fabLastY - 6 || y <= 40) dock.classList.remove('fab-hidden');
+    }
+    fabLastY = y;
+}
+let fabLastY = 0;
+
+// The rows of the day's ⋯ sheet. Built when the sheet opens, so the bulk count and the
+// copy label are the moment's, not the render's.
+function dayMoreRows() {
+    const rows = [settingsMoreRow()];
+    rows.push(moreRow(bandIcon('holiday'), 'הכל חופש', markAllHoliday, null, 'day-holiday-action'));
+    const remaining = State.unrecorded().length;
+    const count = el('span', 'more-count', String(remaining));
+    rows.push(moreRow(bandIcon('bulk'), 'פעולות מרוכזות', () => {
+        bulkOpen = true;
+        render();
+    }, count, 'bulk-toggle'));
+    const source = copySourceLabel();
+    if (source) rows.push(moreRow(bandIcon('copy'), source, copyPreviousDay, null, 'copy-day-action'));
+    return rows;
+}
+
+// The copy button's own words - «מיום רביעי 04/11» - computed the way renderCopyButton
+// (js/ui/sheet.js) computes them, or null when there is nothing to copy from or the
+// record is held.
+function copySourceLabel() {
+    if (typeof farkadWritesBlocked === 'function' && farkadWritesBlocked()) return null;
+    if (State.schedule.workers.length === 0) return null;
+    const from = lastRecordedDayBefore(State.schedule, State.date, State.layer);
+    if (!from) return null;
+    const parsed = parseLocalDate(from);
+    return `${'מ' + hebrewDayName(parsed)} ${formatShortDate(parsed)}`;
+}
+
+// The strip under the band on a day with no record at all: nobody placed, nobody absent.
+function renderCopyStrip() {
+    const workers = State.workersForDay(State.date, State.layer);
+    if (workers.length === 0 || State.unrecorded().length !== workers.length) return null;
+    const label = copySourceLabel();
+    if (!label) return null;
+    const strip = el('div', 'day-copy-strip');
+    strip.appendChild(el('span', null, 'עוד אין רישום ליום הזה'));
+    strip.appendChild(button(`↧ ${label}`, 'copy-day-action', copyPreviousDay));
+    return strip;
 }
 
 let dayScrollWatched = false;
@@ -294,6 +345,11 @@ function buildDay(root) {
     if (typeof appendModeSwitch === 'function') appendModeSwitch(tools, bulk);
     tools.appendChild(renderProgress());
     root.appendChild(bulk);
+    // A day with nothing on it yet (v169): the copy button's own words, under the band,
+    // where the dock used to show them on every day. On any other day they are a row of
+    // the ⋯. The sentence is the one new string of this screen.
+    const copyStrip = renderCopyStrip();
+    if (copyStrip) root.appendChild(copyStrip);
 
     if (dayMode === 'workers') {
         root.appendChild(renderDayWorkerList());
@@ -894,6 +950,11 @@ function renderDayHeader() {
     fwd.appendChild(el('span', 'nav-word', 'הבא'));
     fwd.appendChild(chevronIcon('fwd'));
     nav.appendChild(fwd);
+    // The ⋯ (v169): הגדרות, הכל חופש, the bulk fold and the copy button, under their own
+    // names, in a sheet. They were four controls on two rows above the list; the owner's
+    // words were «شايف البار كيف طالع لفوق». End of the row, so it holds the end corner on
+    // every screen (the week's and the crew's ⋯ sit in the same place).
+    nav.appendChild(moreButton(dayMoreRows));
     header.appendChild(nav);
 
     const picker = document.createElement('input');
diff --git a/js/ui/modal.js b/js/ui/modal.js
index 354c40a..f879fd5 100644
--- a/js/ui/modal.js
+++ b/js/ui/modal.js
@@ -16,6 +16,7 @@ const MODAL_CLOSERS = {
     askModal: () => askCancel(),
     quickModal: () => closeQuickStart(),
     assignSheet: () => closeAssignSheet(),
+    moreSheet: () => closeMoreSheet(),
     workerPickerModal: () => closeWorkerPicker(),
     placePickerModal: () => closePlacePicker(),
     workerFormModal: () => closeWorkerForm(),
diff --git a/js/ui/reports.js b/js/ui/reports.js
index 42f24ff..f5ae4b4 100644
--- a/js/ui/reports.js
+++ b/js/ui/reports.js
@@ -159,8 +159,13 @@ function renderAdvances() {
     if (ADVANCE_ORDER_DRAFT) { renderAdvanceOrder(root); return; }
     const worker = ADVANCE_WORKER && State.worker(ADVANCE_WORKER);
     if (worker) {
-        root.appendChild(button('חזרה לכל העובדים', 'btn-secondary', () => showWorkerAdvances(null)));
-        root.appendChild(el('h2', null, `מקדמות · ${worker.name}`));
+        // The band (v169): the way back is its chevron, the man's name is its title.
+        root.appendChild(renderBand({
+            title: worker.name,
+            sub: 'מקדמות',
+            back: { label: 'חזרה לכל העובדים', onTap: () => showWorkerAdvances(null) },
+            more: [settingsMoreRow()]
+        }));
         const summary = workerAdvanceSummary(worker.id);
         const balance = el('div', 'advance-balance');
         balance.appendChild(el('span', null, summary.overpaid > 0 ? 'החשבון דורש בדיקה' : 'נשאר להחזיר'));
@@ -200,10 +205,17 @@ function renderAdvances() {
         if (history) root.appendChild(history);
         return;
     }
-    root.appendChild(el('h2', null, 'מקדמות'));
-    if (State.schedule.workers.length > 1) {
-        root.appendChild(button('סידור', 'btn-secondary', openAdvanceOrder, 'סידור עמוד המקדמות'));
-    }
+    // The band (v169); «סידור» is a row of its ⋯ when there is more than one man to order.
+    root.appendChild(renderBand({
+        title: 'מקדמות',
+        start: true,
+        more: [
+            settingsMoreRow(),
+            State.schedule.workers.length > 1
+                ? moreRow(bandIcon('list'), 'סידור', openAdvanceOrder, null, 'advance-order-action')
+                : null
+        ]
+    }));
     root.appendChild(el('p', 'hint', 'בחר עובד כדי להוסיף מקדמה, לרשום החזר או לבדוק כמה נשאר.'));
     const search = document.createElement('input');
     search.type = 'search'; search.placeholder = 'חיפוש עובד'; search.value = ADVANCE_SEARCH;
@@ -216,7 +228,10 @@ function renderAdvances() {
             const summary = workerAdvanceSummary(w.id);
             const card = button('', 'advance-worker-card btn-secondary', () => showWorkerAdvances(w.id));
             card.appendChild(el('strong', null, w.name + (w.active === false ? ' · כבוי' : '')));
-            card.appendChild(el('span', null, summary.overpaid > 0 ? 'דורש בדיקה'
+            // A settled account is quiet (v169): the figure that matters on this list is
+            // the one that is not zero, and nine of twelve usually are.
+            const settled = summary.overpaid === 0 && summary.left === 0;
+            card.appendChild(el('span', settled ? 'is-zero' : null, summary.overpaid > 0 ? 'דורש בדיקה'
                 : `${moneyText(summary.left)} ₪ נשארו`));
             list.appendChild(card);
         });
@@ -367,12 +382,16 @@ function renderReports() {
     const oldWorkerList = root.querySelector('.report-worker-list');
     const workerScroll = oldWorkerList ? oldWorkerList.scrollTop : 0;
     clear(root);
-    const head = el('div', 'reports-toolbar');
-    head.appendChild(el('h2', 'reports-heading', 'דוחות'));
-    head.appendChild(renderReportActions());
-    root.appendChild(head);
+    // The band (v169): the name, «הפקת דוח» as its white chip, the ⋯, and the section
+    // switch on its second row - it was the first row of the controls card below.
+    root.appendChild(renderBand({
+        title: 'דוחות',
+        start: true,
+        tools: [renderReportActions()],
+        row2: [renderSectionToggle()],
+        more: [settingsMoreRow()]
+    }));
     const controls = el('div', 'reports-controls');
-    controls.appendChild(renderSectionToggle());
     controls.appendChild(renderRangePicker());
     if (REPORT_SECTION === 'workers') controls.appendChild(renderReportWorkerPicker());
     root.appendChild(controls);
diff --git a/js/ui/roster.js b/js/ui/roster.js
index fc2cf9a..d64ae39 100644
--- a/js/ui/roster.js
+++ b/js/ui/roster.js
@@ -26,6 +26,7 @@
 // flow as the button inside the form, clashes asked and all.
 
 function renderRoster() {
+    renderRosterBand();
     renderWorkerList();
     renderPlaceList();
     renderVehicleList();
@@ -39,6 +40,28 @@ function renderRoster() {
     renderReorderPanel();
 }
 
+// The crew's band (v169, js/ui/band.js). The screen's header is static markup in
+// index.html - a title and two jump buttons - so the band is built once and the jump
+// buttons move into its second row; הדבק רשימה and סדר מחדש keep their buttons (hidden
+// by the stylesheet, found by their tests) and are reached from the ⋯ under their own
+// names. Idempotent: renderRoster runs on every render and the markup persists.
+function renderRosterBand() {
+    const view = document.getElementById('rosterView');
+    if (!view || view.querySelector(':scope > .view-band')) return;
+    const shortcuts = view.querySelector('.crew-shortcuts');
+    const band = renderBand({
+        title: 'צוות',
+        start: true,
+        row2: shortcuts ? [shortcuts] : [],
+        more: () => [
+            settingsMoreRow(),
+            moreRow(bandIcon('paste'), 'הדבק רשימה', () => openQuickStart(), null, 'crew-paste-action'),
+            moreRow(bandIcon('sort'), 'סדר מחדש', () => openReorder(), null, 'crew-reorder-action')
+        ]
+    });
+    view.prepend(band);
+}
+
 function renderAppVersion() {
     const node = document.getElementById('appVersion');
     if (node) node.textContent = `גרסה ${APP_VERSION}`;
diff --git a/js/ui/week.js b/js/ui/week.js
index d3812b7..70b6fab 100644
--- a/js/ui/week.js
+++ b/js/ui/week.js
@@ -156,9 +156,7 @@ function renderWeek() {
 function renderWeekPhone(dates, workers) {
     const phone = el('div', 'week-phone');
     if (weekPhoneMode === 'grid') return phone;
-    const back = button('חזרה לטבלת השבוע', 'btn-secondary week-phone-back', () => setWeekPhoneMode('grid'));
-    back.dataset.weekMode = 'grid';
-    phone.appendChild(back);
+    // The way back to the table is the band's switch (renderWeekHeader) since v169.
     if (!dates.includes(weekPhoneDate)) weekPhoneDate = dates.includes(State.date) ? State.date : dates[0];
     const chosen = weekPhoneDate;
     const picker = el('div', 'week-phone-dates');
@@ -361,12 +359,16 @@ function renderWeekCell(worker, date) {
     return cell;
 }
 
+// The week's band (v169, js/ui/band.js). Six buttons in two rows became: the two arrows
+// beside the name and the range, a switch between the table and the day-by-day view, the
+// «השבוע» chip, and a ⋯ holding הדפסה and שיתוף כתמונה under their own names.
 function renderWeekHeader() {
-    const header = el('div', 'week-header');
-
-    const back = button('שבוע קודם', 'btn-secondary btn-nav nav-back', () => stepWeek(-7));
-    back.insertBefore(chevronIcon('back'), back.firstChild);
-    header.appendChild(back);
+    // Back points RIGHT and forward LEFT: time flows right-to-left here (the day screen's
+    // comment on chevronIcon). The words move into a span the band hides; the aria-label
+    // is the full sentence either way.
+    const back = button('', 'btn-secondary btn-nav nav-back', () => stepWeek(-7), 'שבוע קודם');
+    back.appendChild(chevronIcon('back'));
+    back.appendChild(el('span', 'nav-word', 'שבוע קודם'));
 
     const dates = weekDates();
     const first = parseLocalDate(dates[0]);
@@ -376,24 +378,41 @@ function renderWeekHeader() {
     // its end first. Isolating EACH date (FSI/PDI around each, which is what this did)
     // does not change that - two isolates are still two runs, ordered by the paragraph.
     // dateRange (js/ui/dom.js) wraps the pair as ONE left-to-right run.
-    header.appendChild(el('strong', 'week-range',
-        dateRange(formatFullDate(first), formatFullDate(last))));
+    const range = dateRange(formatFullDate(first), formatFullDate(last));
 
-    const fwd = button('שבוע הבא', 'btn-secondary btn-nav nav-fwd', () => stepWeek(7));
+    const fwd = button('', 'btn-secondary btn-nav nav-fwd', () => stepWeek(7), 'שבוע הבא');
+    fwd.appendChild(el('span', 'nav-word', 'שבוע הבא'));
     fwd.appendChild(chevronIcon('fwd'));
-    header.appendChild(fwd);
-    header.appendChild(button('השבוע', 'btn-secondary week-today-action', () => { weekPhoneDate = todayStr(); setWeekFromDate(todayStr()); render(); }));
-
-    // Not window.print() bare. On the home-screen app on an iPhone that call opens
-    // nothing and says nothing; printWithFallback (js/ui/printout.js) still makes it,
-    // listens for the sheet, and offers the grid as a picture when no sheet came.
-    header.appendChild(button('🖨️ הדפסה', 'btn-success week-print-action', () => printWithFallback('week')));
-    // And the picture on its own button, always. The person on a site sends pictures on
-    // WhatsApp, not PDFs, and the print button's offer arrives a second and a half after
-    // a tap that did nothing - this is the door for somebody who already knows that.
-    header.appendChild(button('🖼️ שיתוף כתמונה', 'btn-secondary week-share-action', () => sharePrintout('week')));
-
-    return header;
+
+    // The table or the day-by-day view. This pair replaces the «חזרה לטבלת השבוע» button
+    // that stood above the day view: a way of looking is a switch, not a way back.
+    const seg = el('div', 'band-seg week-mode-switch');
+    [['grid', 'טבלה'], ['days', 'ימים']].forEach(([mode, text]) => {
+        const option = button(text, 'week-mode-option', () => setWeekPhoneMode(mode));
+        option.setAttribute('aria-pressed', weekPhoneMode === mode ? 'true' : 'false');
+        option.dataset.weekMode = mode;
+        seg.appendChild(option);
+    });
+    const today = button('השבוע', 'btn-secondary week-today-action', () => { weekPhoneDate = todayStr(); setWeekFromDate(todayStr()); render(); });
+
+    return renderBand({
+        title: 'שבוע',
+        sub: range,
+        lead: [back],
+        tools: [fwd],
+        row2: [seg, today],
+        more: [
+            settingsMoreRow(),
+            // Not window.print() bare. On the home-screen app on an iPhone that call opens
+            // nothing and says nothing; printWithFallback (js/ui/printout.js) still makes
+            // it, listens for the sheet, and offers the grid as a picture when no sheet came.
+            moreRow(bandIcon('print'), 'הדפסה', () => printWithFallback('week'), null, 'week-print-action'),
+            // And the picture on its own row, always. The person on a site sends pictures
+            // on WhatsApp, not PDFs, and the print row's offer arrives a second and a half
+            // after a tap that did nothing - this is the door for somebody who knows that.
+            moreRow(bandIcon('image'), 'שיתוף כתמונה', () => sharePrintout('week'), null, 'week-share-action')
+        ]
+    });
 }
 
 function stepWeek(days) {
diff --git a/sw.js b/sw.js
index f0a8124..3721e62 100644
--- a/sw.js
+++ b/sw.js
@@ -21,7 +21,7 @@
 // The version string below is the whole update mechanism. Bump it in the same commit as
 // any change to a cached file, or returning visitors keep running the old build.
 
-const VERSION = 'farkad-v167';
+const VERSION = 'farkad-v169';
 
 // A scheduled server push wakes this worker even with every app window closed.
 // Always display a visible notification; neither iOS nor Android needs a page timer.
@@ -65,6 +65,7 @@ const SHELL = [
     './index.html',
     './css/app.css',
     './css/readability.css',
+    './css/design.css',
     './calendars/daily-workdays-1800.ics',
     './calendars/daily-friday-1800.ics',
     './calendars/daily-everyday-1800.ics',
@@ -97,6 +98,8 @@ const SHELL = [
     './js/ui/share.js',
     './js/ui/seder.js',
     './js/ui/backup.js',
+    './js/ui/band.js',
+    './js/ui/more.js',
     './js/ui/printout.js',
     './js/ui/migration.js',
     './js/ui/offline.js',
diff --git a/css/design.css b/css/design.css
new file mode 100644
index 0000000..8dce759
--- /dev/null
+++ b/css/design.css
@@ -0,0 +1,565 @@
+/* ================================================================ design.css (v169)
+   The visual language the owner approved on 2026-11-08/09, on top of app.css and
+   readability.css. Loaded after both and, like readability.css (v140), written as a
+   layer: it does not restate the layout rules, it corrects what they paint.
+
+   One direction, from the day screen outward:
+     - every screen opens with the same blue BAND: its name, one or two tools, and a ⋯
+       (js/ui/band.js, js/ui/more.js); the brand strip above every screen is gone
+     - ONE filled primary per screen; secondaries tonal; glyph buttons ghost; the
+       WhatsApp green is the only green button anywhere
+     - lists are rows with dividers, not a box per man; cards keep a soft edge only
+     - the day: two rows above the list, the tab bar alone below it, the WhatsApp
+       button a round green one floating at the start corner - and twelve names on a
+       440x956 screen where there were eight
+   NOTHING on paper or in the picture changes: every rule here is `@media screen`.
+   No text size is reduced anywhere (v140's reading preferences hold). 44px targets and
+   16px inputs hold (CLAUDE.md, law 9); the bars stay measured (law 8): the dock is
+   still a fixed box bars.js reads, it is simply the size of the one button in it. */
+@media screen {
+
+/* ---------------------------------------------------------------- tokens */
+:root {
+    --r-xs: 6px;
+    --r-sm: 8px;
+    --r-md: 12px;
+    --r-lg: 20px;
+    --radius: var(--r-md);
+    --radius-sm: var(--r-sm);
+    /* The fill a primary button is painted with - apart from --accent, which is also the
+       colour of accent TEXT and has to stay pale in the dark scheme to be readable. */
+    --accent-fill: #1f4b7a;
+    --on-fill: #ffffff;
+    /* The band and what sits on it. White on #1e4e8a is 8.4:1. */
+    --band: #1e4e8a;
+    --band-ink: #ffffff;
+    --band-soft: rgb(255 255 255 / 16%);
+    --band-line: rgb(255 255 255 / 28%);
+    /* WhatsApp's own green, white on it 5.0:1 - the one green button in the app. */
+    --wa-fill: #15803d;
+    --wa-ink: #ffffff;
+    /* The one border that still has a job: around a field somebody types into. */
+    --line-ctl: #8a98aa;
+    --line: #c1ccd8;
+    --line-soft: #dde4ec;
+    --shadow: 0 1px 2px rgb(20 32 46 / 6%);
+}
+:root[data-theme="dark"] {
+    --line: #2a3746;
+    --line-soft: #223040;
+    --line-ctl: #5b6f85;
+    --accent-fill: #2f6fc9;
+    --accent-soft: #223a56;
+    --band: #1b4476;
+    /* The brightest thing on a dark page, with a dark glyph on it (9:1). */
+    --wa-fill: #22c55e;
+    --wa-ink: #052e16;
+}
+@media (prefers-color-scheme: dark) {
+    :root:not([data-theme="light"]) {
+        --line: #2a3746;
+        --line-soft: #223040;
+        --line-ctl: #5b6f85;
+        --accent-fill: #2f6fc9;
+        --accent-soft: #223a56;
+        --band: #1b4476;
+        --wa-fill: #22c55e;
+        --wa-ink: #052e16;
+    }
+}
+
+/* ---------------------------------------------------------------- type */
+button, h1, h2, h3, strong, .field-label, .wrow-name, .report-tile-name, .seder-name,
+.advance-worker-card strong, #rosterView .roster-details > strong { font-weight: 700; }
+.report-tile-value, .advance-balance > strong, .invoice-bars-total strong,
+#reportsView .report-payroll tfoot td:last-child,
+.report-payroll .report-table tbody td.cell-net { font-weight: 800; }
+.modal-content h3 { font-size: 21px; }
+/* A heading that takes focus when its dialog opens keeps a ring a keyboard user can
+   see, drawn off the text rather than as a box around it. */
+h2:focus-visible, h3:focus-visible, .modal-content h3:focus-visible, .reorder-head h2:focus-visible {
+    outline: 2px solid var(--accent-fill); outline-offset: 6px; border-radius: 8px;
+}
+.settings-head h2:focus-visible, .reorder-head h2:focus-visible { outline-color: rgb(255 255 255 / 55%); }
+
+/* ---------------------------------------------------------------- the four buttons */
+button {
+    border-radius: var(--r-md);
+    border: 1px solid transparent;
+    background: var(--accent-fill);
+    color: var(--on-fill);
+    font-weight: 700;
+}
+button:hover { filter: none; }
+button:active { filter: brightness(.92); }
+/* Tonal: a soft fill two steps up, no outline. */
+.btn-secondary, .place-btn, .settings-nav button, .chip-off, .report-browse-tools .report-cycle-nav button {
+    background: var(--surface-2);
+    color: var(--ink);
+    border-color: transparent;
+    box-shadow: none;
+}
+.chip-off { color: var(--ink-2); }
+/* Ghost: a glyph or a word alone. */
+.btn-icon, .topbar .settings-open, #settingsBtn, .day-steps .step-btn, .banner .btn-icon {
+    background: transparent;
+    border-color: transparent;
+    color: var(--ink-2);
+    box-shadow: none;
+}
+.btn-icon:hover, .day-steps .step-btn:hover { background: var(--surface-2); color: var(--ink); }
+/* The WhatsApp green, and only it. */
+.btn-success, .seder-go { background: var(--wa-fill); color: var(--wa-ink); border-color: transparent; }
+.btn-add { background: var(--accent-fill); color: var(--on-fill); border-color: transparent; }
+.btn-danger { background: var(--danger-bg); color: var(--danger); border-color: transparent; }
+.chip-on { background: var(--accent-fill); color: var(--on-fill); border-color: transparent; }
+.week-phone-date[aria-pressed="true"], .dd-today { background: var(--accent-fill); color: var(--on-fill); border-color: transparent; }
+/* The segmented switch: one tonal track, the chosen half filled. */
+.layer-toggle, .reports-controls .report-section-toggle {
+    background: var(--surface-2);
+    border-radius: var(--r-md);
+    padding: 3px;
+    gap: 3px;
+}
+.layer-toggle button { border-radius: 9px; }
+.layer-on, .mode-quiet .layer-on { background: var(--accent-fill); color: var(--on-fill); box-shadow: none; }
+.layer-off, .mode-quiet .layer-off { background: transparent; color: var(--ink-2); }
+.layer-off:hover { background: transparent; }
+
+/* ---------------------------------------------------------------- surfaces */
+.site-card, .tray, .worker-list, .roster-panel, .settings-group, .range-bar, .advance-card, .advance-balance,
+#reportsView .report-worker-tile, .report-worker-picker, .invoice-bars, .week-phone-panel, .bulk-row,
+.held-row, .issue, .setup-card, .reorder-row, .progress,
+#reportsView .report-payroll tbody tr, #reportsView .report-payroll tfoot tr, .report-table tr,
+.undo-bar, .banner, .drawer-day {
+    border-radius: var(--r-md);
+    border-color: var(--line-soft);
+}
+.modal-content { border-radius: var(--r-lg); border: 0; padding: 20px 18px 18px; box-shadow: 0 20px 60px rgb(0 0 0 / 45%); }
+.sheet-content { border-radius: var(--r-lg) var(--r-lg) 0 0; border: 0; box-shadow: 0 -10px 40px rgb(0 0 0 / 45%); }
+@media (min-width: 641px) { .sheet-content { border-radius: var(--r-lg); } }
+.settings-card-icon { border-radius: var(--r-md); }
+.site-head-color, .site-head-btn, .tag-place, .sheet-status, .site-count, .wday-chip { border-radius: var(--r-sm); }
+.badge, .assign-rate, .tag-rate, .tag, .crew-cycle { border-radius: var(--r-xs); }
+.tabs { border-top-color: var(--line-soft); box-shadow: 0 -6px 24px -18px rgb(0 0 0 / 50%); }
+.wrow { border-bottom-color: var(--line-soft); }
+.site-head, .picker-row, .seder-row, .roster-row, .report-table th, .report-table td { border-color: var(--line-soft); }
+/* Fields keep a border a finger can find; everything else lets go of its outline. */
+.modal-content input, .modal-content textarea, .modal-content select, select,
+.crew-search-field input, .picker-search, .rima-input, .rate-hours, .advance-form input,
+.range-bar input, #advancesView > input, .period-closure input, #reportWorkerSearch,
+.day-tools input[type="date"], .diagnostic-text, #askInput {
+    border: 1px solid var(--line-ctl);
+    border-radius: var(--r-sm);
+    background: var(--surface);
+}
+.modal-content input[type="text"], .modal-content input[type="email"], .modal-content input[type="password"],
+.modal-content input[type="tel"], .modal-content input[type="number"], .modal-content input[type="date"],
+.modal-content textarea, .modal-content select, #askInput {
+    background: var(--surface-2); border-color: transparent; border-radius: var(--r-md); min-height: 48px; font-size: 16px;
+}
+.modal-content input:focus-visible, .modal-content textarea:focus-visible, .modal-content select:focus-visible { border-color: var(--accent-fill); }
+.picker-search, .crew-search-field input, #reportWorkerSearch, #advancesView > input {
+    background: var(--surface-2); border-color: transparent; border-radius: var(--r-md); min-height: 48px; font-size: 16px;
+}
+
+/* ---------------------------------------------------------------- the strip above every screen */
+/* The app's own name and the named settings button come off the top of every screen:
+   the person knows which app they opened, and הגדרות is the first row of every ⋯. The
+   strip itself stays - the tab bar is its child, fixed to the bottom by app.css, and
+   hiding the parent would take the tab bar with it. The elements stay in the document
+   (a screen reader and the tests still find #settingsBtn); they are not drawn. */
+.topbar .brand, .topbar .topbar-actions, .topbar .sync-chip { display: none; }
+.topbar { padding: 0; margin: 0; gap: 0; border: 0; background: transparent; }
+
+/* ---------------------------------------------------------------- the band */
+.view-band, .day-header {
+    background: var(--band);
+    color: var(--band-ink);
+    border: 0;
+    /* Full-bleed by exactly the page's own side padding (--page-pad, 12px on a phone):
+       one pixel more and the page scrolls sideways - measured, a 448px band on a 440px
+       screen zoomed the whole page out to fit. */
+    margin: 0 calc(-1 * var(--page-pad, 16px)) 10px;
+    padding: 4px 10px 8px;
+    padding-top: max(4px, env(safe-area-inset-top));
+    border-radius: 0;
+    box-shadow: 0 2px 10px rgb(0 0 0 / 25%);
+}
+@media (min-width: 701px) { .view-band, .day-header { margin: 0 0 12px; border-radius: var(--r-md); } }
+.band-row { display: flex; align-items: center; gap: 6px; min-height: 44px; }
+.band-row + .band-row { margin-top: 6px; gap: 8px; }
+.band-title { flex: 1 1 auto; min-width: 0; text-align: center; line-height: 1.15; }
+.band-title strong { display: block; font-size: 19px; color: var(--band-ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
+.band-title .band-sub { display: block; color: rgb(255 255 255 / 82%); font-size: 14px; font-variant-numeric: tabular-nums; }
+.band-start .band-title { text-align: start; padding-inline-start: 6px; }
+.band-start .band-title strong { font-size: 22px; }
+/* Everything that is a glyph on the band: 44px, ghost, white. */
+.view-band .btn-icon, .view-band .btn-nav, .view-band .band-back, .view-band .band-more,
+.day-nav .btn-nav, .day-nav .drawer-btn, .day-nav .band-more {
+    min-width: 44px; min-height: 44px; padding: 0;
+    display: inline-flex; align-items: center; justify-content: center;
+    background: transparent; border-color: transparent; color: var(--band-ink); box-shadow: none; border-radius: var(--r-md);
+}
+.view-band .btn-icon:hover, .view-band .btn-nav:hover, .view-band .band-back:hover, .view-band .band-more:hover,
+.day-nav .btn-nav:hover, .day-nav .drawer-btn:hover, .day-nav .band-more:hover { background: var(--band-soft); color: var(--band-ink); }
+/* The arrows alone. Their words stay in the aria-labels (and in .nav-word, hidden). */
+.view-band .btn-nav .nav-word, .day-nav .btn-nav .nav-word { display: none; }
+.view-band .btn-nav svg, .day-nav .btn-nav svg { width: 16px; height: 16px; }
+.view-band .band-back svg { width: 22px; height: 22px; }
+.band-more svg { width: 26px; height: 26px; display: block; }
+.band-more { position: relative; }
+/* The sync state, as a dot on the ⋯. */
+.band-more::after {
+    content: ''; position: absolute; top: 5px; inset-inline-end: 5px; width: 11px; height: 11px;
+    border-radius: 50%; border: 2px solid var(--band); display: none;
+}
+.band-more.sync-warn::after { display: block; background: #fbbf24; }
+.band-more.sync-danger::after { display: block; background: #f87171; }
+/* Tonal-on-band: the chips and secondary buttons that live inside a band. */
+.view-band .band-chip, .view-band .crew-shortcuts button, .view-band .week-today-action, .day-tools .btn-today {
+    min-height: 44px; padding: 0 14px;
+    background: var(--band-soft); color: var(--band-ink); border: 0; border-radius: var(--r-md);
+    font-size: 15px; font-weight: 700; white-space: nowrap; box-shadow: none;
+}
+.view-band .crew-shortcuts { display: flex; gap: 8px; }
+/* The segmented switch inside a band: the chosen half is white. */
+.view-band .layer-toggle, .view-band .mode-toggle, .view-band .mode-toggle.mode-quiet, .view-band .band-seg,
+.day-tools .mode-toggle, .day-tools .mode-toggle.mode-quiet {
+    display: flex; flex: 0 1 auto; margin: 0; padding: 3px; gap: 2px;
+    background: var(--band-soft); border-radius: var(--r-md);
+}
+.view-band .layer-toggle button, .view-band .mode-quiet .layer-off, .view-band .mode-quiet .layer-on, .view-band .band-seg button,
+.day-tools .mode-toggle button, .day-tools .mode-quiet .layer-off, .day-tools .mode-quiet .layer-on {
+    min-height: 40px; padding: 0 14px; font-size: 16px; font-weight: 700; border-radius: 9px; white-space: nowrap; box-shadow: none; border: 0;
+}
+.view-band .layer-off, .view-band .mode-quiet .layer-off, .view-band .band-seg button,
+.day-tools .mode-quiet .layer-off { background: transparent; color: rgb(255 255 255 / 88%); }
+.view-band .layer-on, .view-band .mode-quiet .layer-on, .view-band .band-seg button[aria-pressed="true"],
+.day-tools .mode-quiet .layer-on { background: #fff; color: var(--band); }
+/* «הפקת דוח» in the reports band: the white primary chip, its menu unchanged. */
+.view-band .report-output-actions > summary { background: #fff; color: var(--band); border-radius: var(--r-md); min-height: 44px; font-size: 16px; }
+
+/* ---------------------------------------------------------------- the ⋯ sheet */
+.more-content { padding: 8px 12px calc(12px + var(--safe-bottom)); }
+.more-grip { width: 40px; height: 5px; border-radius: 3px; background: var(--line); margin: 2px auto 10px; }
+.more-sync {
+    display: flex; align-items: center; gap: 10px;
+    padding: 10px 12px; margin-bottom: 6px;
+    border-radius: var(--r-md); font-size: 16px; font-weight: 700;
+    background: var(--surface-2); color: var(--ink-2);
+}
+.more-sync::before { content: ''; width: 10px; height: 10px; border-radius: 50%; background: currentColor; flex: 0 0 auto; }
+.more-sync.chip-ok { background: var(--ok-bg); color: var(--ok); }
+.more-sync.chip-warn { background: var(--warn-bg); color: var(--warn); }
+.more-sync.chip-danger { background: var(--danger-bg); color: var(--danger); }
+.more-rows { display: flex; flex-direction: column; }
+.more-row {
+    display: flex; align-items: center; gap: 14px;
+    width: 100%; min-height: 56px; padding: 0 12px;
+    background: transparent; border: 0; border-radius: var(--r-md);
+    color: var(--ink); font-size: 18px; font-weight: 700; text-align: start;
+}
+.more-row + .more-row { border-top: 1px solid var(--line-soft); border-radius: 0; }
+.more-row:hover { background: var(--surface-2); }
+.more-row svg { width: 24px; height: 24px; flex: 0 0 auto; color: var(--ink-2); }
+.more-row .more-label { flex: 1 1 auto; }
+.more-row .more-count {
+    min-width: 28px; height: 28px; padding: 0 9px;
+    border-radius: 14px; background: var(--warn-bg); color: var(--warn);
+    display: inline-flex; align-items: center; justify-content: center; font-size: 15px;
+}
+.more-close {
+    width: 100%; min-height: 48px; margin-top: 8px;
+    background: var(--surface-2); color: var(--ink); border: 0; border-radius: var(--r-md);
+    font-size: 17px; font-weight: 700;
+}
+
+/* ---------------------------------------------------------------- the day: two rows */
+body.day-tight .day-header { padding: 2px 8px 6px; }
+.day-nav { gap: 2px; }
+.day-nav .drawer-btn { font-size: 22px; }
+.day-label { color: var(--band-ink); padding: 0 4px; }
+.day-label:hover { background: var(--band-soft); }
+.day-label strong { font-size: 19px; line-height: 1.15; color: var(--band-ink); }
+.day-label .day-date { color: rgb(255 255 255 / 82%); font-size: 14px; line-height: 1.15; }
+.day-tools { margin-top: 6px; flex-wrap: nowrap; gap: 8px; align-items: center; }
+/* Undo and redo show only once there is something to undo: a disabled pair is two
+   empty boxes on every evening's first screen. */
+.day-tools .day-steps .step-btn:disabled, .day-tools .day-steps .bar-div { display: none; }
+.day-tools .day-steps:empty { display: none; }
+.day-tools .day-steps .step-btn { color: var(--band-ink); border: 1px solid var(--band-line); border-radius: var(--r-md); min-height: 44px; padding: 0 12px; opacity: 1; }
+.day-tools .day-switch { flex: 0 1 auto; order: 0; gap: 0; min-width: 0; }
+/* הכל חופש and the bulk fold's button live behind the ⋯ (renderDayHeader). */
+.day-tools .day-switch .day-holiday-action, .day-tools .day-switch .bulk-toggle { display: none; }
+.day-header .progress { flex: 1 1 auto; justify-content: flex-end; }
+.day-header .progress .progress-line { justify-content: flex-end; }
+.day-header .progress button.now-count, .day-header .progress .now-count { color: var(--band-ink); font-size: 16px; font-weight: 700; padding: 0 8px; }
+.day-header .progress button.now-count:hover { background: var(--band-soft); }
+.day-header .progress-done .now-count { color: #86efac; }
+.day-header .progress-bar { background: rgb(255 255 255 / 18%); height: 4px; }
+.day-header .progress-fill { background: #fff; }
+.day-header .progress-done .progress-fill { background: #4ade80; }
+body.day-compact .day-header .progress-line .now-count { color: var(--band-ink); }
+
+/* the list: twelve rows on a 956px screen */
+.worker-list { margin-top: 0; }
+.wrow-main { padding: 7px 14px; min-height: 58px; gap: 10px; }
+.wrow .btn-icon { min-width: 44px; color: var(--ink-3); }
+.site-grid { gap: 8px; }
+.site-card { padding: 6px; gap: 2px; }
+.site-list .assign-row { padding: 2px 6px; }
+
+/* A day with nothing on it yet: the copy button's words, under the band (buildDay). */
+.day-copy-strip {
+    display: flex; align-items: center; justify-content: space-between; gap: 10px;
+    margin: 0 0 8px; padding: 6px 8px 6px 12px;
+    background: var(--accent-soft); border-radius: var(--r-md);
+}
+.day-copy-strip span { color: var(--ink-2); font-size: 15px; font-weight: 600; }
+.day-copy-strip button { min-height: 44px; padding: 0 16px; border-radius: 10px; font-size: 16px; white-space: nowrap; }
+
+/* ---------------------------------------------------------------- the bottom: one bar and a floating button */
+/* The dock is now the size of the one button left in it: a fixed 62px box at the start
+   corner, 16px above the tab bar - bars.js measures it as before (78px of coverage) and
+   the page reserves that much, so the last row and its × scroll clear of the button. The
+   copy button stays in the document for its handler and its tests, hidden; its words are
+   a row of the ⋯ and, on an empty day, the strip under the band. */
+.day-actions {
+    inset-inline: auto;
+    inset-inline-start: 16px;
+    width: 62px;
+    height: 78px;
+    min-height: 0;
+    padding: 0 0 16px;
+    background: transparent;
+    border: 0;
+    box-shadow: none;
+    display: block;
+    overflow: visible;
+}
+.day-actions #copyDayBtn { display: none; }
+.day-actions .btn-success {
+    position: absolute;
+    inset: 0 0 16px 0;
+    width: 62px;
+    height: 62px;
+    min-height: 62px;
+    max-width: none;
+    padding: 0;
+    border-radius: 50%;
+    border: 0;
+    font-size: 0;
+    color: var(--wa-ink);
+    background-color: var(--wa-fill);
+    background-repeat: no-repeat;
+    background-position: center;
+    background-size: 34px 34px;
+    background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M12 3a9 9 0 0 0-7.8 13.5L3 21l4.6-1.2A9 9 0 1 0 12 3Z'/><path d='M8.7 9.2c.2-.6.5-.6.8-.6h.6c.2 0 .4.1.5.4l.7 1.6c.1.2 0 .4-.1.6l-.5.6c-.1.1-.2.3 0 .5a7 7 0 0 0 3.3 3c.2.1.4.1.5-.1l.7-.8c.2-.2.4-.2.6-.1l1.6.8c.3.1.4.3.4.5 0 .8-.5 1.6-1.3 1.9-1 .4-2.3.1-4.2-1.1a10 10 0 0 1-3.3-3.6c-.6-1.2-.6-2.3-.3-3.1Z'/></svg>");
+    box-shadow: 0 8px 22px rgb(0 0 0 / 35%), 0 0 0 4px rgb(255 255 255 / 10%);
+    transition: transform .22s ease, opacity .22s ease;
+}
+:root[data-theme="dark"] .day-actions .btn-success {
+    background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23052e16' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M12 3a9 9 0 0 0-7.8 13.5L3 21l4.6-1.2A9 9 0 1 0 12 3Z'/><path d='M8.7 9.2c.2-.6.5-.6.8-.6h.6c.2 0 .4.1.5.4l.7 1.6c.1.2 0 .4-.1.6l-.5.6c-.1.1-.2.3 0 .5a7 7 0 0 0 3.3 3c.2.1.4.1.5-.1l.7-.8c.2-.2.4-.2.6-.1l1.6.8c.3.1.4.3.4.5 0 .8-.5 1.6-1.3 1.9-1 .4-2.3.1-4.2-1.1a10 10 0 0 1-3.3-3.6c-.6-1.2-.6-2.3-.3-3.1Z'/></svg>");
+}
+@media (prefers-color-scheme: dark) {
+    :root:not([data-theme="light"]) .day-actions .btn-success {
+        background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23052e16' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M12 3a9 9 0 0 0-7.8 13.5L3 21l4.6-1.2A9 9 0 1 0 12 3Z'/><path d='M8.7 9.2c.2-.6.5-.6.8-.6h.6c.2 0 .4.1.5.4l.7 1.6c.1.2 0 .4-.1.6l-.5.6c-.1.1-.2.3 0 .5a7 7 0 0 0 3.3 3c.2.1.4.1.5-.1l.7-.8c.2-.2.4-.2.6-.1l1.6.8c.3.1.4.3.4.5 0 .8-.5 1.6-1.3 1.9-1 .4-2.3.1-4.2-1.1a10 10 0 0 1-3.3-3.6c-.6-1.2-.6-2.3-.3-3.1Z'/></svg>");
+    }
+}
+.day-actions .btn-success:active { filter: brightness(.9); }
+/* Hidden while the list scrolls down (readDayScroll, js/ui/day.js), back on a scroll up.
+   The box stays where it is, so what bars.js measures does not move. */
+.day-actions.fab-hidden .btn-success { transform: translateY(120px) scale(.8); opacity: 0; pointer-events: none; }
+/* The tab bar: the chosen tab is unmistakable. */
+.tabs .tab { color: var(--ink-2); font-weight: 600; }
+.tabs .tab-on { color: var(--accent); }
+.tabs .tab-on .tab-icon { color: #fff; }
+.tabs .tab-on .tab-icon::before { background: var(--accent-fill); inset: -3px -10px; }
+
+/* ---------------------------------------------------------------- crew (צוות) */
+#rosterView .crew-header { display: none; }
+#rosterView .roster-panel { padding: 0; border: 0; background: transparent; margin-bottom: 18px; }
+#rosterView .panel-head { margin: 0 0 8px; padding: 0 4px 0 0; border: 0; min-height: 44px; }
+#rosterView .panel-head h2 { font-size: 17px; color: var(--ink-2); font-weight: 700; }
+#rosterView .panel-head .btn-add { min-height: 44px; padding: 0 16px; font-size: 16px; }
+#rosterView .crew-search { margin-bottom: 8px; }
+#rosterView .crew-tools { display: none; }                 /* behind the ⋯ */
+#rosterView #workerList, #rosterView #placeList, #rosterView #vehicleList {
+    background: var(--surface); border: 1px solid var(--line-soft); border-radius: var(--r-md); overflow: hidden;
+}
+#rosterView .roster-row { padding: 8px 6px 8px 2px; margin: 0; border-bottom: 1px solid var(--line-soft); border-radius: 0; background: transparent; gap: 6px; min-height: 60px; }
+#rosterView .roster-row:last-child { border-bottom: 0; }
+#rosterView .roster-details { padding-inline-start: 10px; }
+#rosterView .roster-details > strong { font-size: 19px; display: block; line-height: 1.3; }
+#rosterView .roster-details > .tag, #rosterView .crew-cycle { display: inline; background: transparent; padding: 0; color: var(--ink-3); font-size: 14px; font-weight: 600; margin: 0; }
+#rosterView .roster-details > .tag::after, #rosterView .crew-cycle::after { content: ' · '; }
+#rosterView .roster-details p, #rosterView .roster-details > span:not(.tag) { display: inline; color: var(--ink-3); font-size: 14px; margin: 0; }
+/* The status: a word with a dot, not a green block. */
+#rosterView .worker-active-toggle {
+    background: transparent; border: 0; color: var(--ink-3);
+    font-size: 14px; font-weight: 700; min-height: 44px; min-width: 44px; padding: 0 8px; box-shadow: none;
+}
+#rosterView .worker-active-toggle.is-active { color: var(--ok); }
+#rosterView .worker-active-toggle::before { content: ''; display: inline-block; width: 9px; height: 9px; border-radius: 50%; background: currentColor; margin-inline-end: 6px; vertical-align: 1px; }
+/* «עוד ···» → a ghost ⋯ (the words stay the button's accessible name). */
+#rosterView .crew-edit { background: transparent; border: 0; color: var(--ink-2); font-size: 0; min-width: 44px; min-height: 44px; border-radius: var(--r-md); }
+#rosterView .crew-edit::before { content: '•••'; font-size: 14px; letter-spacing: 1px; font-weight: 800; }
+/* The reorder panel */
+.reorder-head { background: var(--band); color: #fff; border: 0; padding-top: max(6px, env(safe-area-inset-top)); }
+.reorder-head h2, .reorder-head .reorder-sub { color: #fff; }
+.reorder-head .reorder-sub { color: rgb(255 255 255 / 80%); }
+.reorder-head .btn-icon { color: #fff; }
+.reorder-row button { background: transparent; border: 0; color: var(--ink-2); }
+.reorder-row .btn-secondary { background: var(--surface-2); color: var(--ink); border-radius: 10px; }
+
+/* ---------------------------------------------------------------- week */
+#weekView .week-print-title { display: none; }
+#weekView .week-phone-dates { gap: 6px; }
+#weekView .week-phone-date { background: var(--surface-2); border: 0; border-radius: var(--r-md); min-height: 52px; color: var(--ink); }
+#weekView .week-phone-date[aria-pressed="true"] { background: var(--accent-fill); color: #fff; }
+#weekView .week-phone-panel { border: 1px solid var(--line-soft); border-radius: var(--r-md); }
+#weekView .week-phone-panel h2 { font-size: 19px; }
+#weekView .week-phone-open { min-height: 48px; font-size: 16px; }
+#weekView .week-phone-worker { border-bottom: 1px solid var(--line-soft); min-height: 52px; }
+#weekView .week-table th { background: var(--surface-2); color: var(--ink-2); font-weight: 700; border-color: var(--line-soft); }
+#weekView .week-table td { border-color: var(--line-soft); }
+#weekView .week-table tfoot td { background: var(--surface-2); font-weight: 800; }
+#weekView .week-strip, #weekView .table-scroll { border-radius: var(--r-md); }
+#weekView .week-grid-hint, #weekView .week-phone-grid-hint { color: var(--ink-3); }
+
+/* ---------------------------------------------------------------- reports */
+#reportsView .reports-controls { background: transparent; border: 0; padding: 0; margin-bottom: 8px; }
+#reportsView .reports-controls > details { background: var(--surface); border: 1px solid var(--line-soft); border-radius: var(--r-md); margin-bottom: 8px; }
+#reportsView .reports-controls > details > summary { min-height: 52px; padding: 0 14px; font-size: 16px; font-weight: 700; display: flex; align-items: center; justify-content: space-between; }
+#reportsView .report-range-heading span { color: var(--ink-3); font-weight: 600; font-size: 15px; }
+#reportsView .range-chips { padding: 4px 12px 12px; }
+#reportsView .range-chips .chip-off, #reportsView .range-chips .chip-on { border-radius: 10px; }
+#reportsView .range-bar { margin: 0 12px 12px; background: transparent; border: 0; padding: 0; }
+#reportsView .report-search-tools, #reportsView .finance-actions, #reportsView .report-search-count, #reportsView .report-worker-list { margin-inline: 12px; }
+#reportsView .report-worker-list { margin-bottom: 12px; }
+#reportsView .report-worker-choice { min-height: 48px; border-radius: 10px; }
+#reportsView .report-worker-choice input[type="checkbox"] { width: 22px; height: 22px; accent-color: var(--accent-fill); }
+#reportsView .report h2 { font-size: 20px; }
+#reportsView .report-period { color: var(--ink-3); }
+#reportsView .report-group { font-size: 17px; color: var(--ink-2); }
+#reportsView .report-tile-open { color: var(--accent); }
+#reportsView .report-table th { background: var(--surface-2); }
+#reportsView .table-scroll { border-radius: var(--r-md); }
+#reportsView .invoice-picker .chip-off { border-width: 0 0 0 4px; border-radius: 10px; }
+#reportsView .invoice-bars-total { background: var(--accent-soft); border-radius: 10px; }
+#reportsView .report-explanation summary { color: var(--accent); }
+#workerDaysModal .worker-detail-back { background: transparent; border: 0; color: var(--accent); padding-inline: 0; }
+#workerDaysModal .wday { border-color: var(--line-soft); min-height: 52px; }
+#workerDaysModal .wday-chip { background: var(--surface-2); }
+#workerDaysModal .wday-total { background: var(--surface-2); border-radius: 10px; }
+
+/* ---------------------------------------------------------------- advances (מקדמות) */
+#advancesView > p.hint { color: var(--ink-3); font-size: 15px; margin: 0 2px 8px; }
+#advancesView > input { margin-bottom: 8px; }
+#advancesView .advance-workers { background: var(--surface); border: 1px solid var(--line-soft); border-radius: var(--r-md); overflow: hidden; display: block; }
+#advancesView .advance-worker-card { background: transparent; border: 0; border-bottom: 1px solid var(--line-soft); border-radius: 0; padding: 0 14px; min-height: 60px; align-items: center; width: 100%; }
+#advancesView .advance-worker-card:last-child { border-bottom: 0; }
+#advancesView .advance-worker-card strong { font-size: 19px; }
+#advancesView .advance-worker-card span { font-size: 19px; font-weight: 750; color: var(--accent); }
+#advancesView .advance-worker-card span.is-zero { color: var(--ink-3); font-weight: 600; font-size: 16px; }
+#advancesView .advance-balance { border-radius: 16px; padding: 18px 20px; }
+#advancesView .advance-balance > span { color: var(--ink-2); font-size: 15px; font-weight: 700; }
+#advancesView .advance-balance > strong { font-size: 36px; font-weight: 800; color: var(--accent); }
+#advancesView h3 { font-size: 17px; color: var(--ink-2); margin: 16px 2px 8px; }
+#advancesView .wday-ledger summary { color: var(--accent); }
+
+/* ---------------------------------------------------------------- settings (behind the ⋯) */
+.settings-head { background: var(--band); color: #fff; border: 0; padding-top: max(8px, env(safe-area-inset-top)); }
+.settings-head .settings-eyebrow { color: rgb(255 255 255 / 80%); }
+.settings-head h2 { color: #fff; font-size: 26px; }
+.settings-head .settings-close { background: transparent; border: 0; color: #fff; }
+.settings-nav { background: var(--band); border: 0; padding: 0 12px 10px; gap: 8px; box-shadow: 0 2px 10px rgb(0 0 0 / 25%); }
+.settings-nav button { background: var(--band-soft); color: #fff; border: 0; border-radius: var(--r-md); font-weight: 700; }
+.settings-nav button:hover { background: rgb(255 255 255 / 24%); color: #fff; }
+.settings-section-title h3 { font-size: 20px; }
+.settings-card-icon { background: var(--accent-soft); color: var(--accent); }
+.settings-group .btn-secondary { background: var(--surface-2); border: 0; border-radius: var(--r-md); color: var(--ink); }
+.settings-group .settings-status { background: transparent; border: 0; padding: 0; }
+.settings-group .push-reminder-enable { background: var(--accent-fill); color: #fff; border: 0; }
+.settings-group .backup-primary { background: var(--accent-fill); color: #fff; border: 0; border-radius: var(--r-md); }
+.settings-group-backup { border-color: var(--line-soft); }
+.settings-panel .app-version span { background: var(--surface-2); }
+.push-reminder-times > div { background: var(--accent-soft); border-radius: var(--r-md); }
+
+/* ---------------------------------------------------------------- dialogs */
+.modal-content .picker-context { color: var(--ink-3); }
+.modal-actions { gap: 8px; margin-top: 14px; }
+.modal-actions button { min-height: 48px; border-radius: var(--r-md); font-size: 16px; font-weight: 700; flex: 1 1 0; }
+.modal-actions .btn-secondary { background: var(--surface-2); color: var(--ink); border: 0; }
+.ask-choices button { background: var(--surface-2); color: var(--ink); border: 0; }
+.ask-choices button:first-child { background: var(--accent-fill); color: #fff; }
+.form-more { background: transparent; border: 0; padding: 0; }
+.form-more > summary { color: var(--accent); font-weight: 700; min-height: 44px; display: flex; align-items: center; }
+.worker-history { background: var(--surface-2); border-radius: var(--r-md); padding: 12px 14px; }
+.worker-danger .btn-danger { background: var(--danger-bg); color: var(--danger); border: 0; }
+/* pickers */
+.picker-row { min-height: 56px; padding: 4px 2px; }
+.picker-row .btn-add { min-height: 44px; padding: 0 14px; border-radius: 10px; }
+.picker-row .btn-on { background: var(--ok-bg); color: var(--ok); border: 0; border-radius: 10px; min-height: 44px; font-weight: 700; }
+.picker-row-on { background: transparent; }
+.picker-name { font-size: 18px; font-weight: 700; }
+.picker-actions .btn-secondary { min-height: 48px; }
+.place-choice { gap: 8px; }
+.place-btn { min-height: 56px; font-size: 17px; font-weight: 700; border-radius: var(--r-md); }
+.place-choice-dot { width: 14px; height: 14px; border-radius: 50%; }
+/* the assign sheet */
+.sheet-head { border-bottom: 1px solid var(--line-soft); }
+.sheet-head h3 { font-size: 24px; }
+.sheet-meta { color: var(--ink-3); }
+.sheet-status { background: var(--surface-2); color: var(--ink-2); }
+.sheet-status-recorded { background: var(--ok-bg); color: var(--ok); }
+.sheet-place { border-radius: var(--r-md); min-height: 56px; border: 2px solid transparent; }
+.sheet-place-on { box-shadow: 0 0 0 3px var(--surface), 0 0 0 5px #fff; }
+.sheet-rate-row .layer-on { background: var(--accent-fill); color: #fff; }
+.sheet-rate-row .layer-off { color: var(--ink-2); }
+.rate-hours { background: var(--surface-2); border-radius: 10px; min-height: 44px; }
+.sheet-actions { gap: 8px; }
+.sheet-actions button { min-height: 48px; border-radius: var(--r-md); font-weight: 700; font-size: 16px; }
+.sheet-actions .btn-secondary { background: var(--surface-2); color: var(--ink); border: 0; }
+.sheet-actions .sheet-fwd { background: var(--accent-fill); color: #fff; border: 0; flex: 1 1 auto; white-space: nowrap; }
+.sheet-actions .btn-secondary:last-child { background: transparent; color: var(--ink-2); }
+/* the day drawer */
+.drawer-head { background: var(--band); color: #fff; border: 0; }
+.drawer-head h3, .drawer-head .btn-icon { color: #fff; }
+.drawer-today { background: var(--accent-fill); color: #fff; border: 0; border-radius: var(--r-md); min-height: 48px; font-weight: 700; }
+.drawer-week-title { color: var(--ink-3); }
+.drawer-day { min-height: 48px; }
+.drawer-day.dd-on { background: var(--accent-soft); }
+/* WhatsApp and the seder */
+#shareModal .share-styles .chip-on, #shareModal .share-styles .chip-off { border-radius: 10px; }
+#shareModal .share-warning { background: var(--warn-bg); color: var(--warn); border: 0; border-radius: var(--r-md); }
+#shareModal textarea { background: var(--surface-2); border-color: transparent; border-radius: var(--r-md); font-size: 16px; }
+#shareModal .modal-actions { flex-wrap: wrap; }
+#shareModal .modal-actions .btn-success { flex: 1 1 100%; min-height: 52px; font-size: 17px; }
+#shareModal .modal-actions .seder-entry { flex: 1 1 100%; }
+#shareModal .modal-actions .btn-secondary:not(.seder-entry) { background: transparent; color: var(--ink-2); flex: 1 1 40%; }
+#sederModal .seder-row { border-color: var(--line-soft); min-height: 56px; }
+#sederModal .seder-go { border: 0; border-radius: var(--r-md); min-height: 52px; font-size: 17px; font-weight: 700; }
+#sederModal .seder-note { background: var(--warn-bg); color: var(--warn); border: 0; border-radius: var(--r-md); }
+#sederModal .seder-foot .btn-secondary { background: transparent; color: var(--ink-2); border: 0; }
+
+/* ---------------------------------------------------------------- banners and the undo bar */
+/* One line: the sentence wraps inside its own box, the buttons never drop under it. */
+.banner { border-radius: var(--r-md); border-inline-start: 0; padding: 8px 10px 8px 12px; gap: 10px; align-items: center; flex-wrap: nowrap; }
+.banner::before { content: ''; width: 10px; height: 10px; border-radius: 50%; background: currentColor; flex: 0 0 auto; }
+.banner span { min-width: 0; flex: 1 1 0; white-space: normal; font-weight: 600; }
+.banner .btn-secondary { background: var(--accent-fill); color: #fff; border: 0; border-radius: 10px; min-height: 44px; font-weight: 700; }
+.banner-warn .btn-secondary, .banner-danger .btn-secondary { background: rgb(255 255 255 / 14%); color: inherit; }
+.banner .btn-icon { min-width: 44px; min-height: 44px; }
+.banner-fold .banner-sum { min-height: 44px; }
+.banner-fold .banner-go { border: 0; background: rgb(255 255 255 / 14%); border-radius: 10px; }
+.banner-fold { flex-wrap: wrap; }
+.undo-bar { border-radius: 14px; padding: 8px 10px 8px 14px; font-size: 15px; }
+.undo-bar .btn-secondary { background: var(--accent-fill); color: #fff; border: 0; border-radius: 10px; min-height: 44px; }
+
+/* ---------------------------------------------------------------- the first evening */
+.setup-card { border: 0; background: var(--surface); border-radius: 16px; padding: 24px 18px; text-align: center; }
+.setup-card .btn-secondary, .setup-alt { background: var(--surface-2); color: var(--ink); border: 0; }
+
+}
diff --git a/js/ui/band.js b/js/ui/band.js
new file mode 100644
index 0000000..de3b1d3
--- /dev/null
+++ b/js/ui/band.js
@@ -0,0 +1,119 @@
+// ---------------------------------------------------------------- the band (v169)
+//
+// Every screen opens the same way: one blue strip at the top carrying the screen's name,
+// its one or two tools, and a ⋯ that holds everything else. Before v169 each screen had a
+// header of its own shape - the day's three rows, the crew's title and two jump buttons,
+// the week's six buttons in two rows, the reports' toolbar and a card of controls - and
+// the owner's words on the result were «شايف البار كيف طالع لفوق»: the chrome ate a third
+// of the screen. The band is the one shape, built here, so the five screens cannot drift
+// apart again.
+//
+// Drawn with el()/button() from js/ui/dom.js: textContent only, names are never markup.
+// Everything a band holds already existed somewhere on its screen; this file moves, it
+// does not invent. The handlers behind the ⋯ rows are the screens' own functions.
+
+// The stroke glyphs the bands and the ⋯ sheet use. Drawn, not emoji: an emoji is painted
+// by the platform in its own colours, and three phones in one crew showed three glyphs.
+const BAND_ICONS = {
+    gear: 'm9 3-.6 2.2-2 .9-2-.6-2 3.4 1.5 1.7v2.3L2.4 15l2 3.4 2-.6 2 .9L9 21h4l.6-2.3 2-.9 2 .6 2-3.4-1.5-1.8V11l1.5-1.7-2-3.4-2 .6-2-.9L13 3Z M14 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
+    holiday: 'M3 12h18M12 3v18M5.6 5.6l12.8 12.8M18.4 5.6 5.6 18.4',
+    bulk: 'M4 6l1.5 1.5L8 5M11 6.5h9M4 12l1.5 1.5L8 11M11 12.5h9M4 18l1.5 1.5L8 17M11 18.5h9',
+    copy: 'M12 4v12m0 0 4-4m-4 4-4-4M4 20h16',
+    paste: 'M9 4h6a1 1 0 0 1 1 1v1h2a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2V5a1 1 0 0 1 1-1Zm0 7h6m-6 4h4',
+    sort: 'M8 5v14m0 0-3-3m3 3 3-3M16 19V5m0 0-3 3m3-3 3 3',
+    print: 'M6 9V4h12v5M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v6H6z',
+    image: 'M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm4 5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm-5 8 5-5 4 4 3-3 5 5',
+    list: 'M4 6h16M4 12h16M4 18h10',
+    back: 'm9 6 6 6-6 6'
+};
+
+function bandIcon(name, strokeWidth) {
+    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
+    svg.setAttribute('viewBox', '0 0 24 24');
+    svg.setAttribute('fill', 'none');
+    svg.setAttribute('stroke', 'currentColor');
+    svg.setAttribute('stroke-width', strokeWidth || '1.8');
+    svg.setAttribute('stroke-linecap', 'round');
+    svg.setAttribute('stroke-linejoin', 'round');
+    svg.setAttribute('aria-hidden', 'true');
+    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
+    path.setAttribute('d', BAND_ICONS[name] || '');
+    svg.appendChild(path);
+    return svg;
+}
+
+// The ⋯: three drawn circles (the character sits on the baseline in this font and reads
+// as three specks). The sync state rides on it as a dot - amber while something waits to
+// be sent, red when something is wrong, nothing when all is well - mirroring the chip
+// renderSyncChip (js/app.js) keeps up to date; the sentence itself is the sheet's first
+// line, one tap away. aria-label «עוד» and aria-haspopup: a glyph alone is a guess.
+function moreButton(rows) {
+    const more = document.createElement('button');
+    more.type = 'button';
+    more.className = 'btn-icon band-more';
+    more.setAttribute('aria-label', 'עוד');
+    more.setAttribute('aria-haspopup', 'dialog');
+    const dots = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
+    dots.setAttribute('viewBox', '0 0 24 24');
+    dots.setAttribute('fill', 'currentColor');
+    dots.setAttribute('aria-hidden', 'true');
+    [5, 12, 19].forEach(cx => {
+        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
+        circle.setAttribute('cx', String(cx));
+        circle.setAttribute('cy', '12');
+        circle.setAttribute('r', '2.4');
+        dots.appendChild(circle);
+    });
+    more.appendChild(dots);
+    const chip = document.getElementById('syncChip');
+    if (chip && !chip.hidden) {
+        if (/\bchip-warn\b/.test(chip.className)) more.classList.add('sync-warn');
+        if (/\bchip-danger\b/.test(chip.className)) more.classList.add('sync-danger');
+    }
+    more.addEventListener('click', () => openMoreSheet(typeof rows === 'function' ? rows() : rows));
+    return more;
+}
+
+// A row of the ⋯ sheet: { icon, label, onTap, extra?, className? }. The label is the
+// button's own words - the sheet lists the buttons it replaced, under their own names.
+function moreRow(icon, label, onTap, extra, className) {
+    return { icon, label, onTap, extra: extra || null, className: className || '' };
+}
+
+// The band itself.
+//   title   the screen's name (or the day's name); sub an optional second, smaller line
+//   start   title at the start edge (screens) rather than centred (the day, the week)
+//   back    { label, onTap } - a chevron at the start corner
+//   tools   nodes for row 1, after the title (before the ⋯)
+//   row2    nodes for a second row (a segmented switch, chips)
+//   more    rows for the ⋯ sheet; no ⋯ when empty
+function renderBand(spec) {
+    const band = el('div', 'view-band');
+    const row1 = el('div', 'band-row band-row-1' + (spec.start ? ' band-start' : ''));
+    if (spec.back) {
+        const back = button('', 'btn-icon band-back', spec.back.onTap, spec.back.label || 'חזרה');
+        back.appendChild(bandIcon('back', '2'));
+        row1.appendChild(back);
+    }
+    (spec.lead || []).forEach(node => { if (node) row1.appendChild(node); });
+    const title = el('div', 'band-title');
+    title.appendChild(el('strong', null, spec.title || ''));
+    if (spec.sub) title.appendChild(el('span', 'band-sub', spec.sub));
+    row1.appendChild(title);
+    (spec.tools || []).forEach(node => { if (node) row1.appendChild(node); });
+    if (spec.more && (typeof spec.more === 'function' || spec.more.length)) row1.appendChild(moreButton(spec.more));
+    band.appendChild(row1);
+    if (spec.row2 && spec.row2.some(Boolean)) {
+        const row2 = el('div', 'band-row band-row-2');
+        spec.row2.forEach(node => { if (node) row2.appendChild(node); });
+        band.appendChild(row2);
+    }
+    return band;
+}
+
+// The row every ⋯ sheet starts with: settings. The named button in the top strip was the
+// door until v169; it is still in the document (tests and screen readers find it), and
+// this row calls the same function.
+function settingsMoreRow() {
+    return moreRow(bandIcon('gear'), 'הגדרות', () => openSettings());
+}
diff --git a/js/ui/more.js b/js/ui/more.js
new file mode 100644
index 0000000..53b6139
--- /dev/null
+++ b/js/ui/more.js
@@ -0,0 +1,57 @@
+// ---------------------------------------------------------------- the ⋯ sheet (v169)
+//
+// Where the buttons went. Every screen's band ends in a ⋯, and this is what it opens: a
+// sheet from the bottom, under the thumb, listing under their own names the controls the
+// band no longer shows - הגדרות on every screen, and the screen's own extras (הכל חופש
+// and the bulk fold on the day, הדבק רשימה and סדר מחדש on the crew, הדפסה and שיתוף on
+// the week, סידור on the advances). Its first line is the sync sentence, the full one
+// from #storageNotice: the chip that abbreviated it in the top strip is now a dot on the
+// ⋯, and the words have to live somewhere a person can read them.
+//
+// It is a .modal.sheet like the assign sheet, so js/ui/modal.js owns Escape, the focus
+// trap, the backdrop tap and the focus return. Nothing here is a new dialog family.
+
+function moreSheetParts() {
+    return {
+        modal: document.getElementById('moreSheet'),
+        sync: document.getElementById('moreSync'),
+        rows: document.getElementById('moreRows'),
+        close: document.getElementById('moreClose')
+    };
+}
+
+function openMoreSheet(rows) {
+    const parts = moreSheetParts();
+    if (!parts.modal || !parts.rows) return;
+
+    // The sentence the top strip used to abbreviate: the live region's own words, so the
+    // sheet never says something different from the foot of the screen.
+    if (parts.sync) {
+        const notice = document.getElementById('storageNotice');
+        const chip = document.getElementById('syncChip');
+        const kind = chip && !chip.hidden ? (chip.className.match(/\bchip-(ok|warn|danger)\b/) || [])[1] : null;
+        parts.sync.className = 'more-sync' + (kind ? ' chip-' + kind : '');
+        parts.sync.textContent = notice ? notice.textContent.trim() : '';
+        parts.sync.style.display = parts.sync.textContent ? '' : 'none';
+    }
+
+    clear(parts.rows);
+    (rows || []).filter(Boolean).forEach(row => {
+        const btn = button('', 'more-row' + (row.className ? ' ' + row.className : ''), () => {
+            closeMoreSheet();
+            row.onTap();
+        });
+        if (row.icon) btn.appendChild(row.icon);
+        btn.appendChild(el('span', 'more-label', row.label));
+        if (row.extra) btn.appendChild(row.extra);
+        parts.rows.appendChild(btn);
+    });
+
+    parts.modal.style.display = 'flex';
+    if (typeof focusFirst === 'function') focusFirst(parts.modal);
+}
+
+function closeMoreSheet() {
+    const parts = moreSheetParts();
+    if (parts.modal) parts.modal.style.display = 'none';
+}
```
