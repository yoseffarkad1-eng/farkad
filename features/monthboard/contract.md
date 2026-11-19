# Contract — «לוח חודשי»: the whole crew's month on one board, on paper and as a picture (track `monthboard`)

Base `6ab193d68c960e4a56d947673c282b867acd258f` (origin/main, stamps v204). Branch
`feat-monthboard`, worktree `/home/user/farkad/.claude/worktrees/feat-monthboard`. One of four
tracks of the 2026-11-19 program; the integrator ships them together as v206.

The week tab shows one week of the crew; a man's card shows one man's month; «סיכום חודש» counts a
month. Nothing shows THE CREW'S MONTH: who worked where on every day of it. That board is the
owner's and the accountant's attendance sheet - the one he reads at month end, and the one he
settles a man's dispute about his days with. Filtered to one site it is who worked at that site,
day by day, with the site's counts at its foot - the same numbers «לפי אתר» counts. This track
draws it as a third mode of the week tab, prints it on A4 landscape and shares it as a picture. It
counts people; it prices nothing and writes nothing. It is NOT presented as paper for a client:
the app's client paper deliberately names no man (css/app.css:4768-4772, body.client-scoped), this
board names every man, and whether a client is shown the crew's names is the owner's to decide -
nobody has asked him (an open question in the report, default: the board is the owner's).

## Revision 2 - after the critic (2026-11-19). A builder who started from revision 1 reconciles THIS

Each point was checked against the code at the base; the text below is already changed in place.
1. **«בלי עובדי רימא» is SCREEN ONLY on this board, too.** The owner ruled that figure screen and
   workbook only, because the paper and the picture are what gets handed on (js/ui/reports.js:2444,
   css/app.css:2483, js/ui/printout.js:374; pinned by tests/rima.browser.mjs:911/919; CLAUDE.md
   v167). So the filtered board's 'own' foot row is hidden by the board's `@media print` rule and
   left out of `readMonthPrintout()`; paper and picture keep «רישום לרימא» and «סה״כ ימי עובד־אתר».
   A PDF check and a picture-spec check hold it.
2. **No "client's appendix" framing** anywhere (goal, words, «מה חדש», report): see above.
3. **One map of site names per draw**: `placeLabelsIn(State.schedule)` with NO range, the map
   `renderWeekCell` uses (js/ui/week.js:346), built ONCE per board draw; `renderWeekCell` is NOT
   called per cell (it builds that map again for every filled cell - about 1,000 whole-record scans
   on a season's month).
4. **Criterion 2 no longer contradicts criterion 6**: a cell is compared with `renderWeekCell`'s on
   everything except `data-initial` where the board's two-letter rule applies; criterion 6 pins
   those values.
5. **The payrollReport identity (criterion 3) has a named exception**: a closure recorded with no
   `periodTo` that starts on the month's first day is matched by a month range (schema.js:2319-2321),
   so payrollReport answers its frozen counts there; the board follows the live record, and a
   fixture holds the difference.
6. **The redraw keeps the reader's place**: `render()` rebuilds `#weekView` on every commit and
   adopted snapshot (week.js:48-52, app.js:126), so the grid's `scrollLeft` and the page's `scrollY`
   are kept across a redraw (tested with an adopted snapshot).
7. **The paper's page count is stated honestly**: one A4 landscape page holds a small crew; a crew
   of 40 runs to more than one page, the dates' header repeated on each - measured and printed, not
   promised as one page.
8. **openMonthBoard is called one task after a caller's dialog shut** (js/ui/modal.js:145-161 would
   otherwise give the focus back to that dialog's opener after the board focused its title).
9. An automatic update's reload (v205) under the board returns to the week GRID: the month and the
   filter are memory only and v205's updateReturnKeep keeps only the view. Stated in the report; the
   integrator decides whether updateReturnKeep (which keeps the screen, the day and the chosen
   deductions - not this board's month or filter) should carry the board's mode.

## Goal

After this ships the owner, on the week tab, taps «לוח חודשי» in the grid's corner and sees the
month: one row per man (archived men who worked in it marked «לא פעיל»), one column per date
(a Saturday only when something was recorded on it), each cell in the colour of the site with its
first letter, his month's attendance at the row's end and the men per day at the foot - and «רישום
לרימא» and «עובדי יוסף גבס» apart, each in no total. He steps months, narrows the board to one
site (then the foot is, on the screen, his own men, Rima and the worker-site days, cell for cell
what «לפי אתר» counts; on paper and in the picture Rima and the worker-site days only, because «בלי
עובדי רימא» is screen and workbook only, by the owner's ruling), taps a cell to open that day or a
name to open the man's card, prints the board on A4 landscape (one page for a small crew; a larger
one continues on the next page with the dates repeated), or shares it as a picture on WhatsApp.

## Out of scope

- Any shekel; any pay period mark (closed / not closed - «שים לב» and track `payday` say it).
- Editing anything from the board (a cell only opens its day, as the week's does).
- A season view of thirteen weeks (rejected for this program; it would be a fourth mode in the
  same files).
- Changing the week grid's look, its header, its print or its picture (all held unchanged, below).
- Remembering the month or the filter: memory only, lost on leaving the tab (`showView('week')`
  resets the mode to the grid, js/app.js:88-92 - kept).
- `js/ui/offline.js` (v205), `js/ui/whatsnew.js` (the integrator's).

## Data — reads only

Nothing in this track writes the record, the outbox, the cloud, a backup, the rescue file or any
Store key. Its state is memory: `MONTH_BOARD_KEY` ('YYYY-MM') and `MONTH_BOARD_PLACE` (null = every site).

`monthBoardFacts(key, placeId)` - PURE (a schedule-reading function with no DOM, no clock but the
`today` it is handed through `todayStr()` at the call, no storage):

| what | read from (file:line at the base) |
|---|---|
| the month's dates | `monthSummaryRange(key)` (js/ui/monthsummary.js:113) - the same calendar month «סיכום חודש» and «החודש» read |
| a Saturday column | unfiltered: `anyRecordOnRestDay(date)` (js/ui/day.js:1343 - any record in any layer, Rima and יוסף גבס counts included; the rule the day's arrows use, and since revision 2 the status screen's pulse uses it too, so the two screens agree about Saturdays); filtered: an entry of a man at that site, or `rimaCount`/`yosefGevesCount` at that site, that Saturday (js/model/schema.js:3028/3298) |
| the rows | `weekWorkers(dates)`'s rule over the month's dates (js/ui/week.js:290-299: every active man, plus an archived man with an entry or an absence in the month), in roster order; filtered: the men with an entry at that site in the month |
| a cell | `isAbsent` / `entriesFor(State.schedule, date, id, State.layer)` (schema.js:2852/2847) - the record as the week's `renderWeekCell` reads it (week.js:320-410): `entryRate` / `entryExtraHours` for ● and +, `placeLabelFrom(labels, placeId)` (schema.js:1799) for the name, `siteInitial` (js/ui/sitecolor.js:72) for the letter (or the board's two letters, below); filtered: only that site's line. `labels` = `placeLabelsIn(State.schedule)` with NO range - the very map `renderWeekCell` builds (week.js:346), so «אתר שאינו ברשימה N» has the week's number - built ONCE per draw of the board and handed to every cell, the legend, the filter's options and the title. `renderWeekCell` itself is NOT called per cell: it rebuilds that whole-record map for every filled cell. |
| a man's total «נוכחות» | the dates with an entry and no absence (the count `payrollReport(schedule, from, to)` returns as `attendanceDays`, js/model/money.js:210 - pinned equal, not used to draw, with ONE exception: a man with a closure recorded with no `periodTo` whose period starts on the month's first day, which `frozenPeriodFor` matches to any range starting that day (schema.js:2319-2321), so payrollReport answers its frozen counts for the whole month there - the board shows the live record); filtered: the dates with an entry at that site |
| the foot, unfiltered | «סה"כ עובדים» per date: the week's tfoot rule (`renderWeekTotals`, week.js:302-318); then `RIMA_TITLE` with `rimaReport(schedule, from, to).dayTotal(date)` (schema.js:3077) and `YOSEF_GEVES_TITLE` with `yosefGevesReport(schedule, from, to).dayTotal(date)` (schema.js:3338), each a row of its own, each only when its month total > 0, each with its note, each in no total |
| the foot, filtered | `NO_RIMA_TITLE` «בלי עובדי רימא» = `invoiceWithoutRima(schedule, from, to, placeId).countAt(placeId, date)` (money.js:531) - **SCREEN ONLY** (kind `'own'`: hidden by the board's `@media print` rule, left out of `readMonthPrintout()`, exactly as `.report-norima` is kept off the reports' paper and picture, css/app.css:2483, printout.js:374 - the owner's ruling for this figure); `RIMA_TITLE` = `rimaReport(schedule, from, to, placeId).countAt(placeId, date)`; `NO_RIMA_TOTAL` «סה״כ ימי עובד־אתר» = `invoiceByDate(schedule, from, to).countAt(placeId, date)` (money.js:563) - the invoice's own count, equal to the first two added, cell by cell (pinned); then `YOSEF_GEVES_TITLE` = `yosefGevesReport(schedule, from, to, placeId).countAt(placeId, date)` with `YOSEF_GEVES_NOTE`, in no total. On paper and in the picture: Rima, the worker-site days and יוסף גבס - never the 'own' row |
| the filter's sites | the sites with a billed day in the month: the ids of `invoiceByDate(schedule, from, to).places` (money.js:563), in its order - each NAMED from the board's one `labels` map, never from the invoice's own names (which are numbered over the month's range, so an unlisted site could carry another number there) |
| the legend | the sites drawn on the board, each with `paintSite` (sitecolor.js:46), its letter and its name; when two of them share a letter, BOTH show their first two letters on this board, its paper and its picture (a board-local rule; `siteInitial` is untouched) |

## Permissions and privacy

The board shows names and the days they worked, on the phone; it leaves only through the two doors
the person presses: paper and the picture. The picture is drawn off the board's own DOM
(js/ui/printout.js:12-20). Synthetic names in the suites.

## Entry and navigation

- **The door is the week grid's corner cell** (week.js:91-94, «עובדים / ימים»): on the screen it
  holds `button#monthBoardDoor.btn-secondary.month-board-door` with the words
  `MONTH_BOARD_TEXT.door` («לוח חודשי»), asked through
  `typeof monthBoardDoor === 'function' ? monthBoardDoor() : null` - a build without the file draws
  the corner as before. The span «עובדים / ימים» stays in the corner for paper (the button is
  `display:none` in print; on screen the span is not drawn where the door is). The corner is
  67-136 px wide and ≥ 54 px tall on the measured phones (proposal-field §1.2), so a ≥ 44 × 44 px
  (52 × 52 with the mode) button costs 0 px: the header row is no taller (criterion 14). The week's
  header (`renderWeekHeader`, week.js:412-446) is not touched, so tests/polish.browser.mjs:276/325
  hold as they are. No suite pins the corner's words; js/ui/printout.js:601 draws the picture's
  corner by itself, so the week's picture does not move (criterion 15).
- A tap: `setWeekPhoneMode('month')`, with `MONTH_BOARD_KEY` = this month when the week on screen
  holds today, else the month of the week's Friday; `MONTH_BOARD_PLACE = null`.
- **`setWeekPhoneMode`** (week.js:14-18) learns a third value: `'month'` stays `'month'`; `'grid'`
  stays; anything else is `'days'` as now. **`renderWeek`** (week.js:48) draws, when the mode is
  `'month'` and there is a crew, the board INSTEAD of the week header, the phone panel and the week
  table, on every width, and returns; every other mode is drawn exactly as now. The board's own
  hint and notes are inside its container, never a `.hint` that is a direct child of `#weekView`
  (app.css:2974-2977 hides those in any non-grid mode on a phone).
- The board's header (all in the board's container):
  - «חזרה לטבלת השבוע» (BORROWED, week.js:188) → `setWeekPhoneMode('grid')`;
  - «חודש קודם» / the month («נובמבר 2026», `MONTH_SUMMARY_TEXT.months`) / «חודש הבא» (BORROWED,
    monthsummary.js:42-75), and «החודש» (BORROWED, the reports' chip, js/ui/reports.js:724) only
    when the board is not on this month;
  - the filter: a native `<select>` labelled **«אתר»** (PROPOSED), first option «כל האתרים»
    (BORROWED, reports.js:2549), then each site of the month; ≥ 16 px (20 with the mode), ≥ 44 px tall;
  - «🖨️ הדפסה» → `printWithFallback('month')` and «🖼️ שיתוף כתמונה» → `sharePrintout('month')`
    (BORROWED words, week.js:439/443; js/ui/printout.js:72/125).
- In the grid: a date's header is a button (its day letter, `HEBREW_DAY_LETTERS`, and dd) →
  `State.date = date; dayChosenByHand(); showView('day')` (js/app.js:367); a cell (`role="button"`,
  `tabindex="-1"`, the week cell's own label rule, week.js:342-394) does the same on a tap; a name
  is a button → `openWorkerCard(id)` (js/ui/workercard.js:851). None of them writes.
- `openMonthBoard(key, placeId)` (for track `status` and for «מה חדש»): `showView('week')`, then
  sets the key (null = this month) and the filter, `setWeekPhoneMode('month')`, focuses the board's
  title; answers `true`. The board is not a `.modal`: a caller that has just shut a dialog calls this
  ONE TASK LATER (`setTimeout(go, 0)`, whatsNewGo's rule, js/ui/whatsnew.js:594-606), or js/ui/modal.js
  gives the focus back to that dialog's opener at the microtask checkpoint and the title loses it
  (modal.js:145-161). The function says so in its comment; it does not defer by itself (a direct
  call from the corner's door must focus at once).
- `js/ui/monthboard.js`: `<script>` directly after `js/ui/find.js` (index.html:1197) - after
  week.js, sitecolor.js, workercard.js and monthsummary.js, whose functions it calls only when
  drawn - with a comment that it runs nothing at load. `'./js/ui/monthboard.js'` in sw.js SHELL
  after `'./js/ui/find.js'`.
- **The picture**: `printoutImage` (printout.js:182-221) learns `kind === 'month'` →
  `readMonthPrintout()` and `planMonthPrintout(spec, probe, family)`, both in `js/ui/monthboard.js`
  (the 'transport' precedent, transport.js:2573/2606). The reader reads the BOARD'S DOM - the
  title, the dates, each row's name, each cell's `data-place` / `data-initial` / mark, the totals,
  the foot rows and the legend - and the planner draws it on `PRINTOUT_PAPER` (printout.js:52-60)
  right to left, within `PRINTOUT_MAX_SIDE` (4,096 px, printout.js:38). The reader leaves out the
  'own' foot row («בלי עובדי רימא») BY ITS KIND (`data-kind="own"` on its row), as
  `readReportPrintout` leaves `.report-norima` out by name (printout.js:372-375): the picture goes
  where paper goes. Two lines in printout.js and nothing else there.
- **Paper**: `body.week-print-layout` already gives the week tab its A4 landscape page
  (app.css:4929-4934). New `@media print` rules in css/app.css, directly after the week's
  (app.css:4956), for the board only: its header controls and the door hidden; `h1.month-print-title`
  shown (`MONTH_BOARD_TEXT.title(...)`, hidden on screen); the table full width, `table-layout:
  fixed`, the name column 16%, sticky positions undone, `print-color-adjust: exact` on the cells,
  the site letter written in each cell (the screen draws it by design.css, which paper does not
  read), the legend printed, and the 'own' foot row hidden
  (`.month-board tr[data-kind="own"] { display: none !important; }`, the same `!important` as
  `.report-norima`'s rule, app.css:2483). PAGES, said and not promised: one A4 landscape page holds
  the header, the foot and a small crew; a larger crew continues on further pages with the dates'
  header row repeated (`thead { display: table-header-group }`), no row split across a page
  (`tr { break-inside: avoid }`), the foot rows and the legend after the last man. The PDF test
  counts the pages at 12, 25 and 40 men and the report prints the three numbers. The grid mode's
  paper is untouched (tests/week-print.browser.mjs).

## The screen, section by section

PROPOSED words live in ONE frozen block `MONTH_BOARD_TEXT` at the top of `js/ui/monthboard.js`,
pinned word for word in tests/monthboard.test.mjs; BORROWED words are read from their owner at
call time (never at load) or repeated in `MONTH_BOARD_REUSED` and found in the owner's source by the
suite. Names through `isolate()` inside sentences.

- `MONTH_BOARD_TEXT.door` = **«לוח חודשי»** (PROPOSED).
- `MONTH_BOARD_TEXT.title(month, year, site)` = **`` site ? `לוח חודשי · ${month} ${year} · ${site}` : `לוח חודשי · ${month} ${year}` ``**
  (PROPOSED) - the board's heading, the paper's h1 and the picture's title.
- `MONTH_BOARD_TEXT.filter` = **«אתר»** (PROPOSED).
- `MONTH_BOARD_TEXT.rowName(name, total)` = **`` total === 1 ? `${name} · יום נוכחות אחד` : `${name} · ${total} ימי נוכחות` ``**
  (PROPOSED template; «ימי נוכחות» BORROWED, reports.js) - the name button's accessible name.
- The grid's corner on the board: «עובדים / ימים» (BORROWED, week.js:93); the total column's head
  «נוכחות» (BORROWED: the pay sheet's column, reports.js:1979-2012); «לא פעיל» (BORROWED, week.js:137);
  «סה"כ עובדים» (BORROWED, week.js:306); `RIMA_TITLE`, `NO_RIMA_TITLE`, `NO_RIMA_TOTAL`,
  `YOSEF_GEVES_TITLE`, `YOSEF_GEVES_NOTE` (BORROWED constants, reports.js:2319/2451/2452/2394/2396);
  the Rima row's note `MONTH_SUMMARY_TEXT.rimaNote` (BORROWED - the variant without «שלמעלה»).
- Under the grid: the legend; «● = יום כפול · + = שעות נוספות · — = נעדר» and «לחיצה על תא פותחת את
  היום לעריכה.» (BORROWED, week.js:164-166).
- A month with nobody on it: `MONTH_SUMMARY_TEXT.empty` «אין רישומים בחודש הזה.» (BORROWED), the
  header still drawn.
- The total column is the LAST column (paper and picture have it there too); the name column is
  sticky (`position: sticky; inset-inline-start: 0`, the week's own rule, app.css:2809-2816); the grid
  scrolls sideways inside its own box only, and opens scrolled so that today's column is in view
  when the board is on this month.
- THE PLACE IS KEPT ACROSS A REDRAW. `render()` rebuilds `#weekView` on every commit and every
  adopted snapshot (week.js:48-52, app.js:126). A redraw of the SAME month and filter keeps the
  grid box's `scrollLeft` and the page's `scrollY` as they were (read before the board is cleared,
  put back after it is drawn); only a new month, a new filter or the door's tap opens at today's
  column. The keyboard's focus on a date button, a cell or a name is put back on the same date/man
  when it is still drawn.

## Floors and looks

- 320x568, 375x667, 440x956; both schemes; «תצוגה גדולה» on and off; doubled text
  (`doubleEveryFontSize`, tests/mobile.test.mjs:755-842: the board redraws). No sideways PAGE
  scroll; the grid's own box scrolls.
- Cells and date buttons ≥ 44 × 44 (52 × 52 with the mode) - so at 320 the phone shows about four
  days at a time (two with the mode), which is said here, not hidden: on a phone the board is a
  scroller, and the paper and the picture are the whole month.
- The cell is the week cell's look: the site colour with a WHITE letter (7.1-9.9:1 on every one of
  the ten colours, scout-ui §g), ● for a double day, + for extra hours, «נעדר» for an absence - never
  a colour alone (the letter, the legend and the cell's name carry the site). The board's cells carry
  the week cell's own classes (`week-cell`, `cell-filled` / `cell-absent`, `cell-line tag tag-place`,
  `cell-double`, `cell-extra`, `data-initial`, `site-mark`), so design.css:749-772 and large.css:698
  apply to them on a phone exactly as they do to the week; the board's own block makes the same
  look hold on wider screens (no site name written in a cell on screen - the legend names it), and
  every selector in it starts with `.month-board` so the week grid is not touched.
- App floors: ≥ 14 px for every letter or digit (the cell letter 14 px as design.css:749-772 draws
  it; 18 px with the mode as large.css:698 does), 4.5:1 on the painted ground (7:1 with the mode),
  the select ≥ 16 px.
- The look: css/design.css inside `@media screen`, ONE commented block directly after the week
  cell's letter block (design.css:749-772); every size, weight and line-height restated in
  css/large.css block 3 directly after large.css:698, one for one, with the original's importance.
  Paper rules in css/app.css (the paper is not design.css's business). No `--site-N` in large.css.

## Performance budget

| what | budget | how measured |
|---|---|---|
| `monthBoardFacts(key, null)` and `(key, placeId)` on a season month (40 men × 31 days) | ≤ 25 ms each (measured 0.7-0.9 ms, proposal-field §1.4) | Node, tests/monthboard.test.mjs, median of 5, printed |
| the board drawn (`renderWeek` in month mode) on a season | ≤ 250 ms unthrottled, ≤ 1,000 ms at 4x CPU (`Emulation.setCPUThrottlingRate`) | browser, `performance.now()` around `render()` |
| the grid mode | one node more than the base (the door); its draw otherwise unchanged | browser, node count of `#weekView` with and without `monthBoardDoor` |
| `printoutImage('month')` for 40 men | ≤ 2,000 ms at 4x CPU; ≤ 4,096 px a side | browser |

## Success criteria

New suites: `tests/monthboard.test.mjs` (`test:monthboard`, appended to `npm test`) and
`tests/monthboard.browser.mjs` (`test:monthboard-browser`, appended to `test:all`); rows in
tests/README.md.

Node (harness devices; seeded months with both cycles, two sites in one day, doubles, extra hours,
absences, an archived man who worked, an archived site, Rima on two sites, יוסף גבס on one, a
Saturday with work, a Saturday with only a Rima count, two sites sharing a first letter):
1. The rows: active men plus archived men with a record in the month, in roster order; filtered,
   the men with an entry at that site.
2. Every cell, unfiltered, carries the same classes, site lines, marks, words and `aria-label` as
   `renderWeekCell(worker, date)` for the same man and date (one look, not two) - compared on
   everything EXCEPT `data-initial` on a line whose site shares its first letter with another site
   of the month (there the board's two-letter rule applies, criterion 6) and except `tabindex` (the
   board's cells are `-1`); filtered, only that site's line. The suite calls `renderWeekCell` for
   the comparison; the board never does (a spy: 0 calls from a draw), and `placeLabelsIn` is called
   once per draw (a spy).
3. Every man's total equals the number of his filled cells and `payrollReport(schedule, from,
   to)`'s `attendanceDays` - except a man with a closure recorded with no `periodTo` whose period
   starts on the month's first day (a FIXTURE: a Friday-first month, a weekly man closed by an old
   closure carrying no `periodTo`, then a day of that week corrected - payrollReport answers the
   closure's frozen counts for the month, the board the live record, and they differ by exactly the
   correction); filtered, his dates at that site.
4. The foot, unfiltered: «סה"כ עובדים» equals the week's tfoot rule on every date, and on the
   month's busiest date `monthSummaryRead(key).busiest.men` (the busiest date itself agreeing with
   `monthSummaryRead(key).busiest.date`); the Rima and יוסף גבס rows equal their reports' `dayTotal` and appear in
   no total. Filtered: own + Rima = billed on every date and = `invoiceByDate(...).countAt`, and the
   three rows' month totals equal «לפי אתר»'s for that site (`invoiceWithoutRima`, `rimaReport`,
   `invoiceByDate` totals); יוסף גבס in no total.
5. A Saturday column exactly when the rule above says; a date with nothing recorded is a column
   with empty cells (not dropped), a Saturday with nothing is not drawn.
6. The two-letter rule only where two sites of the month share a letter; `siteInitial` unchanged.
7. The whole disk byte for byte across the facts, the draw, the arrows, the filter, the picture's
   reading, a cell's and a name's navigation.
8. Every PROPOSED word pinned; every BORROWED word found in its owner; the Hebrew/Arabic scan green.
9. The facts' cost row.
10. `readMonthPrintout()`'s spec (names, cells, totals, foot rows, legend, title) equals the facts
    it was drawn from, LESS the 'own' foot row: on a filtered board with Rima the spec holds
    «רישום לרימא» and «סה״כ ימי עובד־אתר» and no row titled «בלי עובדי רימא» (and no second
    worker-site-day total line), unfiltered it holds no 'own' row at all.

Browser (tests/monthboard.browser.mjs):
11. The door at 320x568, 375x667, 440x956 × dark/light × mode off/on: ≥ 44 × 44 (52), its words
    whole inside it, the week table's header row no taller than with `monthBoardDoor = undefined`.
12. A tap opens the board on the month, today's column on the glass, the name column pinned while
    the grid scrolls inside itself, no sideways page scroll; the arrows, «החודש», the filter and
    «חזרה לטבלת השבוע» do what they say; leaving the tab and coming back shows the grid
    (tests/week.browser.mjs:35/88 unchanged). The board scrolled sideways and the page scrolled
    down, then a commit and an ADOPTED SNAPSHOT (the harness's fake cloud) redraw it: `scrollLeft`
    and `scrollY` within 1 px of where they were, the same month and filter; a new month opens at
    today's column (this month) or the first date (another month). With the status screen present
    (the merged tree, or a stub caller that shuts a dialog then calls `openMonthBoard` a task
    later), the focus ends on the board's title.
13. A cell and a date header open that day (`currentView === 'day'`, `State.date` that date); a
    name opens his card at its title.
14. The week grid with the door: its node count is the base's plus one, and every other node is
    the same (`monthBoardDoor` set to `undefined` for the base reading on the same page).
15. The week's picture: `readWeekPrintout()`'s spec is the same JSON with the door as without it.
16. Paper: a real PDF (tests/pdf.mjs) of the board - A4 landscape, every name exactly once, the
    title with and without a site, a Saturday column only where recorded; on a filtered board with
    Rima the text «רישום לרימא» and «סה״כ ימי עובד־אתר» present and «בלי עובדי רימא» ABSENT; the
    page count at 12, 25 and 40 men printed, the dates' header row on every page and no row split;
    and the grid mode's PDF still what tests/week-print.browser.mjs holds (that suite green,
    untouched).
17. The picture: `printoutImage('month')` within 4,096 px, every name and every site letter at the
    place its layout claims (sampled from the PNG as tests/week-print.browser.mjs samples the week);
    filtered with Rima, the plan holds no «בלי עובדי רימא» row.
18. Floors at every phone, scheme and mode and at doubled text (the ruler, `measureInPage`;
    every target - cells, date buttons, names, the select - ≥ 44 / 52).
19. The draw and picture budget rows.
20. Nothing written (`censusOnly`) across opening, the arrows, the filter, print (stubbed
    `window.print`) and the picture (stubbed `navigator.share`); no uncaught error.

Existing suites touched, deliberately and only as said:
- `tests/largetext.browser.mjs` (the shared picture, :798-840): `'month'` joins the kinds drawn
  with the mode off and on - the same width, height, length and SHA-256 (the board opened through
  `openMonthBoard(null, null)`).
- `tests/screens.mjs`: `{ name: 'week - the month board', scope: APP }` and
  `{ name: 'week - the month board, one site', scope: APP }` (opened through `openMonthBoard`,
  closed by `setWeekPhoneMode('grid')`), after the 'week - days' entry.
- Stay green with no expectation moved: week-browser, week-print-browser, polish + polish-browser,
  mobile (the grid floors and the corner), print, smoke, design-browser, largetext (Node),
  monthsummary + browser, sitecard + browser, workercard + browser, whatsnew + browser, nonassertions,
  gate-integrity (but its stamp section), isolation, build (but its stamp checks).

## Base

- `origin/main` = `6ab193d68c960e4a56d947673c282b867acd258f`; branch `feat-monthboard`; worktree
  `/home/user/farkad/.claude/worktrees/feat-monthboard`; `npm ci` there.
- MUST NOT be touched: `js/model/**`, `js/sync/**`, `js/state.js`, `js/store.js`,
  `js/recovery.js`, `firestore.rules`, `functions/**`, `firebase.json`, `.github/**`; the three
  stamps (index.html:108, js/app.js:7, sw.js:24); `docs/releases.md`, `CLAUDE.md`,
  `js/ui/whatsnew.js`, `js/ui/offline.js`; the other tracks' files (`js/ui/status.js`,
  `js/ui/payday.js`, `js/ui/yearsummary.js`, `js/ui/monthsummary.js`, `js/ui/owes.js`,
  `js/ui/backup.js`, `js/app.js`, `js/ui/modal.js`). In `js/ui/week.js` only `setWeekPhoneMode`,
  the branch at the top of `renderWeek` and the corner's three lines; in `js/ui/printout.js` only
  the two dispatch lines of `printoutImage`.
- Expected red on this branch, and only this: tests/build.test.mjs «the stamps were moved by the
  commit that moved the bytes» (and its sw.js line) and tests/gate.integrity.test.mjs §4.
- Browsers: `export PLAYWRIGHT_BROWSERS_PATH=/tmp/claude-0/-home-user-farkad/d6a64352-db1a-5c3b-b54d-5c09103f2419/scratchpad/pw1194`;
  never `playwright install`; no emulator suites. Commit after every step; never `--amend`; every
  commit ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and
  `Claude-Session: https://claude.ai/code/session_01AczE1SUjJY47GFH8eTREya`. No push, no PR.

## «מה חדש» (for the integrator; PROPOSED)

`{ title: 'לוח חודשי', text: 'כל החודש בטבלה אחת: כל עובד, כל יום והאתר שלו בצבע, עם סינון לפי אתר, הדפסה ותמונה לשיתוף.', where: 'שבוע ← לוח חודשי, בפינת הטבלה', go: 'monthBoard' }`
- `go: 'monthBoard'` only navigates: `showView('week')` (the grid), then focus `#monthBoardDoor`
  without pressing it.

## Interfaces

Provided (globals of `js/ui/monthboard.js`):
- `openMonthBoard(key, placeId)` → `boolean` - `key` 'YYYY-MM' or null for this month, `placeId`
  a site id or null for every site; shows the week tab in month mode and focuses the board's title.
  The caller closes its own dialog first and then calls this ONE TASK LATER (`setTimeout(go, 0)`):
  the board is not a `.modal`, and js/ui/modal.js gives the focus back to the shut dialog's opener
  at the microtask checkpoint after the block that shut it (modal.js:145-161).
- `monthBoardDoor()` → the corner button (asked by week.js through `typeof`); the node `#monthBoardDoor`.
- `monthBoardFacts(key, placeId)` → `{ key, from, to, place: {id, name}|null, dates: [{date, saturday}],
  rows: [{ workerId, name, active, cells: [{ date, absent, lines: [{placeId, initial, double, extra}] }], total }],
  foot: [{ kind: 'men'|'own'|'rima'|'billed'|'yosef', label, byDate: {date: n}, total|null, paper: boolean }],
  (`paper` false for 'own' only: the screen shows it, the paper and the picture never),
  legend: [{ placeId, name, letters }], empty }`.
- `readMonthPrintout()` / `planMonthPrintout(spec, probe, family)` - for `printoutImage('month')`.
- `MONTH_BOARD_TEXT` (with `.door`).
- Track `status` calls `openMonthBoard(null, null)` and reads `MONTH_BOARD_TEXT.door`, both behind
  `typeof`. Nothing here depends on any other track.

## The report

Branch and final commit; every hook in an existing file; the source of every count; every new
string; the deliberate change to tests/largetext.browser.mjs and the screens entries; every
suite's exit code and counts, one by one on the final commit from a clean tree; the release-entry
text and the CLAUDE.md file-list line for the integrator; screenshots (synthetic names, 440x956
dark, 320x568 with the mode, the PDF's first page and the picture, JPEG/PNG) in
`/tmp/claude-0/-home-user-farkad/d6a64352-db1a-5c3b-b54d-5c09103f2419/scratchpad/feat-monthboard/`;
what was not verified (not tried on a real phone; real paper not printed); the page counts at 12,
25 and 40 men; that an automatic update's reload (v205) under the board lands on the week grid,
its month and filter lost; open questions with a default - at least: (1) is the filtered board
something the owner hands a client, given that it names his men (default: no - it is his and the
accountant's; the app's client paper names nobody); (2) does he want «בלי עובדי רימא» on THIS
board's paper (default: no - his ruling for that figure is screen and workbook only); (3) should
updateReturnKeep carry the board's month and filter across an update (default: the integrator's
call, not this branch's).
