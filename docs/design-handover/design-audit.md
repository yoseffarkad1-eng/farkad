# פרקד design pass — Phase 1 audit (farkad-design session, Fable 5.1)

Date: 2026-11-07. Tree audited: `~/farkad-design` = clone of `~/farkad-v167-E` @ 6efdc2e (v167 candidate),
served with `tests/serve.mjs`, Playwright 1.56.1 / Chromium 1194, fixture data only (12 workers + 1 archived,
4 sites, a fortnight of days, Rima counts, 3 advances; today pinned to 2026-11-05).

Screenshots (38 screens × 440x956 dark/light × 375x667 dark/light): `~/farkad-design-shots/before/<size>-<scheme>/`.
Scripts: `~/farkad-design-tools/shots.mjs` (MOCK=<css> injects an "after" stylesheet), `compose.mjs` (قبل/بعد pairs).
Nothing in the clone is modified; mockups are injected at screenshot time.

## What is inconsistent or cluttered

### Buttons — too many looks, weak hierarchy
- ~12 distinct button treatments share one screen set: default filled (accent), `btn-secondary` outlined,
  `btn-success` (green), `btn-add` (soft), `btn-icon` ghost, `chip-on/off`, `layer-on/off` (segmented, raised),
  `site-head-btn` (dark scrim), `place-btn/place-on`, `seder-go`, `link-cell`, `settings-nav` (paper fill),
  `report-output-actions summary`, `banner-go` (currentColor border), `backup-primary`.
- In the dark scheme the primary fill is the pale accent (#a9cdf7, dark text) and WhatsApp is pale green:
  "primary" reads as a light block, "secondary" as a dark outlined box — both at the same visual weight.
- Day header: 3 rows of controls (nav / segmented+הכל חופש+bulk / undo+redo+count). Undo/redo are outlined
  boxes even when disabled. On 375x667 only 4 worker rows are visible under header + dock + tab bar.

### Borders and colour
- readability.css (v140) raised `--line` to #768aa0 (dark) / #8a98aa (light): every outlined button and card
  edge glows → the roster and settings read as a lattice of light boxes. Borders carry the layout everywhere.
- Two token sets layered (app.css then readability.css) with different paper/surface/line/accent values.
- Amber (`--warn`) carries three meanings: pending (טרם נרשם rows), non-regular rate (יום כפול / שעות נוספות
  tags on by-site rows), and sync waiting (chip). The by-worker list already solves it (rate rides inside the
  site badge); the by-site rows don't.
- Accent used for zero: advances list shows «0 ₪ נשארו» in big accent on 9 of 12 cards.

### Radii, spacing, type
- Radii in use: 3, 4, 6, 7, 8, 9, 10, 12, 13, 14, 16, 18, 22, 999 (tokens say 14/10; readability says 12/8;
  many hard-coded). Card 12 vs inner tile 16 vs modal 18 vs sheet 22.
- Gaps/paddings: 2…28 with no rhythm. Card padding 8/10/12/14/16/18/20/22.
- Font sizes: ~27 distinct values (11 → 36). Weights: 500, 600, 650, 700, 750, 800.
- Titles: crew h1 26, reports 26, settings 28, modal h3 20/23, sheet 30, day label 18.

### Icons
- Mixed inline SVG (tabs, settings cards, site head, chevrons) and emoji in buttons (💬 ↧ 🖨️ 🖼️ 📊 💾 📂 ↩️
  🔄 ☁️ 📋 ↕ 🧹 🚀 👷 🏗️ ⚠️ ✔️ ⓘ). Emoji render differently on iPhone vs Galaxy and in colours that fight the palette.
  (Emoji are part of button textContent → pinned tests; changing them is a label change → owner's yes.)

### RTL alignment / density
- By-worker row: name (right) … tag (centre-left) … ✕ (far left): the tag floats away from the name.
- By-site assignment row: name right, ✕ far left, ~70% empty; Rima field on every card (label + box).
- Roster: each of 12 cards = name + cycle chip («תשלום כל שבועיים» repeated) + meta line that wraps mid-phrase
  («שעה: 50» alone) + green «פעיל» block + «עוד ···» button. Sites: colour pill + «עוד ···» each.
- Reports controls: 3 nested boxes (controls card → toggle track → rows). Pay tiles fine.
- Settings: good card structure; many full-width outlined buttons, status box inside card (box in box).
- Week header: 5 buttons in 2 rows above the grid.

### Defects visible in the pictures
- Update banner: «אחר כך» wraps to its own line (`.banner span {min-width:200px}` + two buttons at 440).
- Sheet foot: «המשך אל <שם>» wraps to 2 lines; three foot buttons at equal weight (no primary).
- Empty states: roster/week/advances/reports show chrome (search, 5 buttons, filters) above one sentence;
  advances-empty reads «לא נמצא עובד.» (sounds like a failed search).

## Direction (one)
«שקט ומסודר» — quiet surfaces, one strong primary per screen, fewer boxes.
Tokens: radii 6/8/12 (+20 sheets/dialogs); 4px spacing rhythm; weights 500/700 (+800 hero numbers);
four button looks (filled primary with a real `--accent-fill` in dark, tonal secondary, ghost, WhatsApp green);
borders stop carrying layout (soft dividers, tonal fills); SVG icons only; amber = "needs you" only.
No text size is reduced (v140 reading preferences hold).

## Change groups, in priority order
1. **Foundations** — tokens, the four buttons, radii, lines, weights (CSS only; every screen). Mockup: mock-g1.css.
2. **Day screen** — header to 2 rows, by-worker row (tag beside name, ghost ✕), by-site rows, Rima field quieter,
   dock (WhatsApp filled, copy tonal). Proposal to the owner: «הכל חופש» + bulk behind one ⋯ on the day.
3. **Crew** — worker card: name + one meta line, status as text/dot not a green block, one ··· action; sites row.
4. **Reports & advances** — one controls card, tiles, hero numbers, zero balances quiet, invoice bars.
5. **Dialogs, sheet, banners, empty states** — unified modal frame and button row, update-banner fix, sheet foot
   primary, empty states without chrome above them.
6. **Icons** — replace emoji with the stroke-SVG family (labels change → pinned tests + owner's yes).

Hard limits respected: visual only; css/, js/ui/* render markup, index.html markup. No sync/model/state/store/
recovery/rules. Paper and picture untouched (all mock rules are `@media screen`).

## 2026-11-08 — G1 rejected as too weak; G2 (day screen, radical) mocked

Owner (via the Rima session): «مش حاسسها قوية» and «شايف البار كيف طالع لفوق… بدي تغيير جذري». G1 is NOT approved.
Direction taken for G2, measured at 440x956 on the v167 clone with fixture data:
- Top chrome 4 rows → 2, as a coloured band (dark #1b4476 / light #1e4e8a, white on it ≥ 8:1):
  row 1 = ☰ ‹ date › ⋯ (chevrons only; nav words stay in aria-labels), row 2 = segmented
  לפי עובדים/לפי אתרים (chosen half white) + «נרשמו n מתוך m»; the progress track is the band's edge.
- Behind ⋯ (bottom sheet): the sync sentence, הגדרות, הכל חופש, פעולות מרוכזות (n), מהיום הקודם.
  The sync chip becomes an amber/red dot on ⋯.
- Bottom: tab bar only. WhatsApp = round green FAB (dark #22c55e w/ dark glyph, light #15803d w/ white)
  at the start corner. Dock measured as 0, so bars.js arithmetic holds. Undo bar lifted above the FAB.
- Copy-a-day: behind ⋯, and as a strip under the band on a day with no record at all
  (new sentence «עוד אין רישום ליום הזה» → law 6, needs the owner's yes).
- Undo/redo hidden until an edit (the undo BAR unchanged). Rows 58px → 12 of 12 names on one screen (was 8).
- Swipe-to-change-day: not mocked, recommended against for v1.
Files: ~/farkad-design-tools/mock-g2.css + mock-g2.js (render hook; mock only), shots.mjs gains MOCKJS=
and screens day-empty/day-more, compose.mjs renders after-only when no before exists.
Pairs: ~/farkad-design-shots/pairs/g2-{dark,light}-day-{workers,sites,compact,sites-complete,empty,more}.png,
copied to the design session's scratchpad pairs/. Nothing in any clone changed.
Phase 2 notes for whoever implements: the band carries env(safe-area-inset-top) like today's header;
the FAB must stay measured (it is the dock's own button restyled, or bars.js learns the FAB);
the ⋯ sheet should be the app's own sheet/askChoice, not a new dialog family; the tabs stay inside
.topbar (hiding the brand strip must not hide its fixed child).

## 2026-11-08 (later) — G2 approved; G3 = every other screen, sent as one set

Owner (through the parent session): «إيه، كمّل هيك» on the day screen; the WhatsApp FAB hides while
scrolling down and returns on a scroll up; dark first, light must stay correct; «كمّل الكل وفرجيني»
(design everything, send once, stop asking screen by screen); professional, easy on the eyes.

G3 mock (mock-g3.css + mock-g3.js, on top of g1+g2), 45 screens dark + 9 light, 440x956:
- Every screen opens with the same blue band: title (+ subtitle), its one or two tools, and ⋯.
  roster: «צוות» + the עובדים/אתרים jump chips; ⋯ = הגדרות, הדבק רשימה, סדר מחדש.
  week: ‹ «שבוע» + range › ; row 2 = segmented טבלה|ימים (new labels; replaces «חזרה לטבלת השבוע») + השבוע;
  ⋯ = הגדרות, הדפסה, שיתוף כתמונה. Arrows are chevrons only (words stay in aria-labels).
  reports: «דוחות» + «הפקת דוח» as the white chip (same menu) ; row 2 = לפי עובד|לפי אתר moved into the band;
  the controls card becomes two quiet rows (period, workers).
  advances: «מקדמות» + ⋯ (הגדרות, סידור); rows instead of 12 boxes; zero balances quiet (ink-3, 16px).
  advances-worker: band with back chevron, name + «מקדמות» subtitle; hero balance 36px.
  settings: head + nav painted as the band; cards quiet; the one primary filled.
- Pay-day (main session's feature) redrawn in this language: entry card with icon + filled «לתשלום»
  (the duplicate amber banner dropped), band «יום תשלום» + date, period line, quiet cards with the
  deduction field as a tonal 48px input, result row, accent-soft total 38px, filled blue «שילמתי · סגור…»,
  confirm = the app's askConfirm with footer, paid state = ok-soft hero + «✓ שולם 19/11» chips.
  Figures are the ones in the main session's own mock; the strings are theirs.
- Dialogs: 20px corners, 21px title, filled primary + tonal cancel, stacked choices (first = primary).
  Assign sheet: site buttons 56px with a white ring on the chosen one; rate segmented; «המשך אל …» is the
  filled primary, «נעדר» tonal, «סגור» ghost. Pickers: tonal search, «+ הוסף» filled small, «✓ נמצא» ok-soft.
  Day drawer: band head, filled «חזרה להיום». WhatsApp dialog: template chips segmented, preview quiet,
  «שלח בוואטסאפ» the only green (full width), «לכל עובד בנפרד» tonal, העתק/סגור ghost. Seder: same green.
- Banners one line (sentence wraps inside its box, buttons stay); undo bar 14px radius, filled «בטל».
- Empty states: body.mock-empty (no active workers) hides search/tools/filters; one sentence + one primary.
- Light scheme checked on roster, week, reports, advances, pay-day, settings, sheet, WhatsApp, worker form.

Hebrew strings that are NEW or CHANGED on screen (law 6 — all need the owner's yes):
  NEW  «עוד אין רישום ליום הזה» (empty-day copy strip)         NEW «טבלה» / «ימים» (week switch)
  NEW  «שבוע» as the week band title (was only the print title)   NEW «עוד» (aria-label of ⋯, not visible)
  HIDDEN from view, kept for screen readers: «קודם» «הבא» (day), «שבוע קודם» «שבוע הבא» (week),
        «חזרה לטבלת השבוע» (replaced by the switch), «חזרה לכל העובדים» / «חזרה לדוח» (become the band's back chevron)
  LABELS without their emoji inside the ⋯ sheets: הדבק רשימה (📋), סדר מחדש (↕), הדפסה (🖨️), שיתוף כתמונה (🖼️)
  «עוד ···» (crew row) drawn as ••• glyph; accessible name unchanged
  Pay-day strings are the main session's design, not mine: יום תשלום · היום, לתשלום, לקזז, לתשלום X ₪,
        נשאר חוב X ₪, אין חוב מקדמה, סה״כ לתשלום עכשיו, שילמתי · סגור חשבון ל־N עובדים, לסגור ולשלם ל־N עובדים?,
        שילמתי, סגור, שולם ונסגר · …, ✓ שולם dd/mm, תיקון טעות.

Files: ~/farkad-design-tools/{mock-g1.css,mock-g2.css,mock-g2.js,mock-g3.css,mock-g3.js,shots.mjs,compose.mjs,sheet.mjs,dom.mjs}
Pairs: ~/farkad-design-shots/pairs/g3-{dark,light}-*.png, copied to the design session's scratchpad pairs/
  (C:\Users\abo_f\AppData\Local\Temp\claude\C--Users-abo-f---------------claude-worktrees-infallible-noether-b9a4b8\0120659d-2905-49bf-8dc8-4613f52cd0c4\scratchpad\pairs\).
Known mock artefacts: the sync sentence in the ⋯ sheet shows whatever state the fixture phone is in at that
moment (amber «ממתינים לשליחה» or red «שגיאת סנכרון»); the FAB covers the last row at scroll 0 by design.
Nothing in any clone changed. No branch cut (v167 not on main at the time of writing; v168 to follow).
Implementation notes for Phase 2: bands = one shared renderer (title, sub, back, tools, ⋯) used by five views;
⋯ sheet = the app's own sheet family; hide the brand strip, never .topbar itself (tabs live inside it);
FAB = the dock's own button restyled + a scroll listener (hide down / show up), bottom pad ≥ 84px on lists;
keep bars measured; the week switch needs setWeekPhoneMode; the ⋯ rows call the existing handlers.
