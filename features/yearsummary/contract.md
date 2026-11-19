# Contract — «סיכום שנה»: the year as it was worked, and the accountant's workbook (track `yearsummary`)

Base `6ab193d68c960e4a56d947673c282b867acd258f` (origin/main, stamps v204). Branch
`feat-yearsummary`, worktree `/home/user/farkad/.claude/worktrees/feat-yearsummary`. One of four
tracks of the 2026-11-19 program; the integrator ships them together as v206.

The year ends in six weeks, and in January the accountant asks for it. Today the owner can give him
a custom-range export over 01/01-31/12, whose «לתשלום» is «נצבר» minus the advances handed over -
honest only beside its range note, and easy to read as "paid". This track gives him the year in its
own screen and its own file: the months as rows, the men, the sites - every figure the answer of a
function «סיכום חודש» and «דוחות» already ask, pointed at the year - framed as what it is: what was
WORKED in the year as recorded, never what was paid.

## Is a year honest? (the question the program asked - answered from the code)

- A calendar year is never anybody's pay period (`wholeAccountRange`, js/ui/reports.js:911), so
  the sheet reads it the plain way under either gate: no carry, no walk, no deduction, no balance.
  That is what makes it cheap (12 months in one scope: 84-135 ms, scout-api §4.3) and what limits
  what it may say.
- HONEST over a year: attendance, pay units, double days, extra hours; worker-site days per site;
  Rima and «עובדי יוסף גבס» counts (the latter apart, in no sum); the advances HANDED OVER dated in
  the year; repayments and corrections dated in the year (gate open); «נצבר» as the sum of every day
  worked in the calendar year at the rate stamped on that day.
- NOT honest, and never said: «לתשלום», «שולם», a deduction, a carried balance, a balance at 31/12.
  A pay period that crosses 1 January is split by day - right for "worked", wrong if read as "paid":
  a fortnight Fri 2026-12-25..Thu 2027-01-07 puts its first week in 2026 and its second in 2027. A
  CLOSED period's frozen gross is not used (`frozenPeriodFor` matches only the exact period,
  js/model/schema.js:2324), so where days were corrected after a close the year reads the live record.
- One trap: `payrollReport` gives a man `amount: null` for a WHOLE range when one worked day of it
  has no daily rate (js/model/money.js:290-291), and the band counts him as 0. Over a year he drops
  out of the year's «נצבר» entirely, but out of only one month's. So the year line is read over the
  year and NEVER added up from the months, the men without a rate are named in the sheet's own
  sentence, and when the two differ one sentence says why.

## Goal

After this ships the owner, inside «סיכום חודש», taps «סיכום שנת 2026» and reads: the frame
sentence; the year in figures; the twelve months as rows (each exactly what «סיכום חודש» says for
that month, a tap away from it); every man's year; every site's year, with «עובדי יוסף גבס» in its
own table, last; and «📊 יצוא השנה», which hands the accountant a workbook of the same.

## Out of scope

- «לתשלום», deductions, balances, closed payslips added up, anything "paid".
- A comparison with the year before (2026 is the first year on the record; when one exists, a
  later round).
- A picture or paper of the dialog (a dialog never prints, app.css:4147-4180); the workbook is the
  document.
- A text door to WhatsApp (the workbook is for the accountant; «סיכום חודש» keeps its text).
- A new row in «הפקת דוח» (it would move four pinned lists and add a node to «דוחות»; the door is
  inside «סיכום חודש», where the year is one step out from the month).
- `js/ui/offline.js` (v205), `js/ui/whatsnew.js` (the integrator's).

## Data — reads only

Nothing in this track writes the record, the outbox, the cloud, a backup, the rescue file or any
Store key. The export hands a file to the browser; that is not a Store write. State is memory only:
`YEAR_SUMMARY_YEAR` (a number, null when shut).

**One extraction, behaviour-preserving**: `monthSummaryRead(key)` (js/ui/monthsummary.js:172-270)
becomes `monthSummaryReadRange(key, range)` with the same body, and `monthSummaryRead(key)` returns
`monthSummaryReadRange(key, monthSummaryRange(key))`. Nothing else in monthsummary.js changes but
one hook line at the end of `drawMonthSummary` (:472):
`if (typeof yearSummaryEntryLabel === 'function') yearSummaryEntryLabel(MONTH_SUMMARY_KEY);` - which
words the year button for the month on screen. tests/monthsummary.test.mjs and
tests/monthsummary.browser.mjs stay green (but the one Tab-order pin below).

**The reading** - `yearSummaryFacts(year)`:
```
function yearSummaryFacts(year) {
    if (typeof reportReadOnce === 'function' && !reportReading()) return reportReadOnce(yearSummaryFacts, this, arguments);
    return monthSummaryScope(() => yearSummaryRead(year));   // monthsummary.js:139-164
}
```
`monthSummaryScope` holds and restores `REPORT_RANGE` and `REPORT_WORKERS` (null = everybody) and
answers the gate once; nothing awaits, writes or renders inside; `REPORT_DEDUCTIONS` is never read
(a year has no account to deduct in).

| what | read from (file:line at the base) |
|---|---|
| each month's row | `monthSummaryRead('YYYY-MM')` for the twelve months, in the same scope - the very numbers «סיכום חודש» shows (`workingDays`, `attendance`, `men`, `siteDays`, `ownSiteDays`, `rima.total`, `yosef.total`, `gross`, `advances`, `repaid`, `reversed`, `unpriced`, `empty`) |
| the year line | `monthSummaryReadRange(String(year), { from: \`${year}-01-01\`, to: \`${year}-12-31\` })` - the same functions over the year; never the sum of the rows |
| the men | `payrollRows()` (reports.js:918) with `REPORT_RANGE` pointed at the year inside the scope (a year is never the default account, so it is `payrollRowsOver(from, to, gate, null)`, reports.js:987): `attendanceDays`, `payUnits`, `doubleDays`, `extraHours`; «נצבר» = `moneyOf(row).gross` (reports.js:4769; «—» when null) and «מקדמות שניתנו» = `−moneyOf(row).netted` - the very terms `payrollBandTotals` sums, so the two columns add up to the year's tiles (within the sheet's own agora rounding; «נצבר» only when nobody is unpriced - pinned); archived men «לא פעיל» |
| the sites | `invoiceByDate(schedule, from, to)` (money.js:563: the billing count, Rima included, per site with its `byDate`), `invoiceWithoutRima(schedule, from, to)` (money.js:531: his own men), `rimaReport(schedule, from, to)` (schema.js:3077); a site's first and last month = the first and last date in its `byDate` |
| «עובדי יוסף גבס» | `yosefGevesReport(schedule, from, to)` (schema.js:3338), its own table with `YOSEF_GEVES_TOTAL` and `YOSEF_GEVES_NOTE` (reports.js:2395/2396), last, in no other figure |
| the men without a rate | the year line's `unpriced`, said by `MONTH_SUMMARY_TEXT.unpriced(count, names)` (monthsummary.js:62) |
| money as text | `monthSummaryMoney` (monthsummary.js:282) → `bidiAmount(moneyText(x))` - the month summary's own formatting |

**Opening** paints the frame with `YEAR_SUMMARY_TEXT.reading` first and reads after the paint
(`requestAnimationFrame(() => setTimeout(read, 0))`, the weekly close's own step,
js/ui/weeklyclose.js:796-798). `renderYearSummaryIfOpen` re-reads on a moved record (key
`owesKey(State.schedule, todayStr())`, js/ui/owes.js:644) and keeps `.modal-content.scrollTop`.

## Permissions and privacy

The dialog shows wages by name on the phone. It leaves only through «📊 יצוא השנה», which the
person presses: a workbook handed to the browser, named in Latin (`farkad-year_<YYYY>.xlsx`), whose
hand-over sentence is the existing export's. Synthetic names in the suites.

## Entry and navigation

- **The door is inside «סיכום חודש»**: index.html's `#monthSummaryModal` frame (:965-985) gains,
  between `#monthSummaryBody` and `.msum-fold`, `<div class="msum-year"><button type="button"
  class="btn-secondary" id="monthSummaryYear" onclick="typeof openYearSummaryFromMonth === 'function'
  && openYearSummaryFromMonth()" hidden></button></div>`; `yearSummaryEntryLabel(key)` (this file)
  shows it with the words `YEAR_SUMMARY_TEXT.entry(year)` («סיכום שנת 2026»). A build without the
  file leaves it hidden.
- `openYearSummaryFromMonth()`: `closeMonthSummary()`, then `openYearSummary(year of the month on
  screen)`, its title focused by hand (sitecard.js:507-519's rule: two dialogs in one step).
- The frame: a static `.modal#yearSummaryModal > .modal-content.modal-wide` in index.html directly
  after the `#monthSummaryModal` frame (:985): `h3#yearSummaryTitle[tabindex=-1]` first, a nav row
  `button#yearSummaryPrev` / `strong#yearSummaryYear[role=status]` / `button#yearSummaryNext`, then
  `#yearSummaryBody`, then `.modal-actions` with `button#yearSummaryExport` and
  `button#yearSummaryClose` and `span#yearSummaryStatus[role=status]`. Words set by JS.
  `MODAL_CLOSERS.yearSummaryModal: () => closeYearSummary()` after the `monthSummaryModal` row
  (js/ui/modal.js:41); `if (typeof renderYearSummaryIfOpen === 'function') renderYearSummaryIfOpen();`
  after the `renderMonthSummaryIfOpen` line in `render()` (js/app.js:162).
- A month's row is ONE button → `closeYearSummary(); openMonthSummary('YYYY-MM')`
  (monthsummary.js:605), its title focused by hand.
- `js/ui/yearsummary.js`: `<script>` directly after `js/ui/monthsummary.js` (index.html:1189), with
  a comment that it runs nothing at load; `'./js/ui/yearsummary.js'` in sw.js SHELL after
  `'./js/ui/monthsummary.js'`.
- **The workbook**: `loadXlsx()` (reports.js:5174: the vendored SheetJS, same origin, in the shell),
  then `XLSX.utils.aoa_to_sheet` per sheet, dressed by `dressSheet(ws, rows, look)` (reports.js:5321)
  with its money and count looks, `wb.Workbook = { Views: [{ RTL: true }] }` (reports.js:5487's
  flag), `XLSX.writeFile(wb, \`farkad-year_${year}.xlsx\`)`. THE LOOK NEVER COSTS THE FILE
  (v202's rule): if dressing throws, the same rows are written plain. With the library not loaded,
  the same rows leave as CSV files through `downloadCsv` (js/ui/share.js:350) with
  `exportReports`' own sentence for that case (reports.js:5577-5580, BORROWED). After the hand-over,
  the existing export's hand-over sentence (BORROWED, the `askChoice` text exportReports shows after
  `XLSX.writeFile`) - never «נשמר».

## The screen, section by section, in this order

PROPOSED words live in ONE frozen block `YEAR_SUMMARY_TEXT` at the top of `js/ui/yearsummary.js`,
pinned word for word in tests/yearsummary.test.mjs; BORROWED words are read from their owner or
repeated in `YEAR_SUMMARY_REUSED` and found in the owner's source. Names through `isolate()`.

0. **Title** `YEAR_SUMMARY_TEXT.title(year)` = **`` `סיכום שנת ${year}` ``** (PROPOSED; the same
   words are the door's, `entry(year)`). Arrows **«שנה קודמת»** / **«שנה הבאה»** (PROPOSED); the
   next is hidden on the current year.
1. **The frame**, always first, on the screen and on the workbook's first sheet:
   **«נצבר לפי הרישום: כל יום עבודה בשנה, לפי השכר שנרשם ליום הזה. זה לא מה ששולם בפועל.»**
   (PROPOSED) and **«תקופת תשלום שעוברת את 1 בינואר מתחלקת כאן לפי הימים: כל יום נספר בשנה שבה עבדו בו.»**
   (PROPOSED). On the current year also **«השנה עוד לא נגמרה. המספרים הם של מה שנרשם עד עכשיו.»**
   (PROPOSED). Meanwhile, before the reading: **«מחשב את השנה…»** (PROPOSED). A year with nothing:
   **«אין רישומים בשנה הזאת.»** (PROPOSED).
2. **«השנה במספרים»** (PROPOSED) - tiles, label over value: «ימי עבודה», «ימי נוכחות», «עובדים
   שעבדו», «סה״כ ימי עובד־אתר», «בלי עובדי רימא» (only when Rima has a count), `RIMA_TOTAL`,
   «נצבר», **«מקדמות שניתנו»** (PROPOSED: the year's «מקדמות» - handed over), and, gate open,
   «הוחזר במזומן» and «תיקון-היפוך» (BORROWED: `LEDGER_KIND_LABELS`, reports.js:3911) when non-zero;
   then apart `YOSEF_GEVES_TOTAL` with its note. The unpriced sentence (BORROWED) when the year has
   men without a rate. When Σ of the twelve rows' «נצבר» differs from the year's:
   **«הנצבר של השנה מחושב על כל השנה ולא מחיבור החודשים, ולכן הוא שונה כאן מחיבור החודשים.»**
   (PROPOSED).
3. **«חודש אחר חודש»** (PROPOSED) - twelve rows, January first; each ONE button named and showing:
   the month (`MONTH_SUMMARY_TEXT.months`, BORROWED), own worker-site days with a bar in `--accent`
   (one hue: magnitude of one series, never a site colour; the number written beside it), «עובדים
   שעבדו», «נצבר», «מקדמות שניתנו»; an empty month «—». Under them
   **«לחיצה על חודש פותחת את סיכום החודש.»** (PROPOSED).
4. **«העובדים בשנה»** (PROPOSED) - one row per man in roster order: the name (`isolate`, «לא פעיל»
   when archived), «ימי נוכחות», «ימי שכר», «כפולים», «שעות נוספות», «נצבר» (or «—»), «מקדמות
   שניתנו» (BORROWED column words, reports.js's sheet). Label-over-value on a phone, never a wide table.
5. **«האתרים בשנה»** (PROPOSED) - one row per site with a billed day: a swatch and the name, «סה״כ
   ימי עובד־אתר», «בלי עובדי רימא», «רישום לרימא» (BORROWED), and its months
   `YEAR_SUMMARY_TEXT.span(first, last)` = **`` first === last ? first : `${first}–${last}` ``**
   (PROPOSED template, month names BORROWED). Then `YOSEF_GEVES_TITLE`'s own table, last, with
   `YOSEF_GEVES_NOTE` - its numbers in no other figure.
6. **«📊 יצוא השנה»** (PROPOSED) and «סגור» (BORROWED) in the frame.

**The workbook's sheets**, in this order: «סיכום» (BORROWED: v202's first sheet's name - the frame
sentences and the tiles), **«חודשים»**, **«עובדים»**, **«אתרים»** (PROPOSED), and
`YOSEF_GEVES_TITLE` last (BORROWED) with its note row. Columns as on the screen; numbers as numbers
(money with the v202 money format, counts as counts); Hebrew headers.

## Floors and looks

- 320x568, 375x667, 440x956; both schemes; «תצוגה גדולה» on and off; doubled text (per-node
  doubling is enough: the dialog does not redraw under the test; `doubleEveryFontSize` if it does).
  No sideways scroll; the last button reachable.
- App floors: 44 × 44 targets (48 as the month summary's own suite holds its frame), ≥ 14 px,
  4.5:1. Large: ≥ 18 px, ≥ 500, 7:1, 52 × 52.
- The look: css/design.css inside `@media screen`, ONE commented block directly after the month
  summary's (`.msum-*`, design.css:1047-1089), reusing the month summary's tile and bar look where
  it fits; every size, weight and line-height restated in css/large.css block 3 directly after the
  msum restatements (large.css:768-784), one for one, with the original's importance. No colour of
  its own: `--accent` for the bars, site colours only as swatches beside written names.

## Performance budget

| what | budget | how measured |
|---|---|---|
| `yearSummaryFacts(year)` on a season year (40 men, 6 sites, 2026-01-01..2026-11-19, ~277 day keys; 12 months measured 84-135 ms + the year line 20-31 ms + sites 9-14 ms) | ≤ 500 ms median of 3 | Node, tests/yearsummary.test.mjs, printed |
| the gate | asked at most once per reading, never planned on an approved record | counted, as tests/reports.speed.test.mjs counts |
| tap → the frame painted with «מחשב את השנה…» | the next frame; nothing read before it | browser |
| tap → figures, on a season seeded in the page at 4x CPU | ≤ 3,000 ms | browser, `Emulation.setCPUThrottlingRate` |
| the workbook built and handed over (library loaded) | ≤ 1,500 ms on the season | browser, `XLSX.writeFile` recorded |
| «סיכום חודש» | its reading unchanged in cost (the extraction adds a call, nothing else) | tests/monthsummary.test.mjs green |

## Success criteria

New suites: `tests/yearsummary.test.mjs` (`test:yearsummary`, appended to `npm test`) and
`tests/yearsummary.browser.mjs` (`test:yearsummary-browser`, appended to `test:all`); rows in
tests/README.md.

Node (harness devices + `tests/moneydom.mjs`; seeded years with both cycles, a cycle change, a rate
change mid-year, Rima, יוסף גבס, an archived man, a man with ONE unpriced day in March, advances,
repayments, a closed period corrected after its close, a fortnight crossing 1 January; both gate
readings):
1. Every month row equals `monthSummaryRead('YYYY-MM')` field by field, in one scope, and each of
   its figure strings equals what «סיכום חודש» draws for that month (`monthSummaryFacts(key)`).
2. The year line equals `monthSummaryReadRange(year, …)` and is NOT the sum of the rows: on the
   March fixture the man is out of the year's «נצבר» and only out of March's, he is named by the
   unpriced sentence, and the not-summed sentence appears exactly when the two differ.
3. The men equal `payrollRows()` over the year field by field; «—» exactly for `amount === null`;
   Σ «מקדמות שניתנו» = the tile's advances, and Σ «נצבר» = the tile's «נצבר» on every seeded year
   with no unpriced man - within one agora per man, because each row is rounded to the agora and the
   band once (`moneyOf` and `payrollBandTotals`, the sheet's own two roundings).
4. The sites equal `invoiceByDate`, `invoiceWithoutRima` and `rimaReport` over the year, own +
   Rima = billed per site; first and last months; יוסף גבס equal to `yosefGevesReport` and in no
   other figure.
5. The fortnight crossing 1 January: its days in 2026 counted in 2026 and the rest in 2027, and no
   figure on either year's screen is a payslip.
6. The extraction: `monthSummaryRead(key)` on this branch equals the base's (v204's
   monthsummary.js read out of Git at `6ab193d`, as tests/account-view.test.mjs reads older bytes)
   for every month of the seeded years, byte for byte, under both gate readings.
7. Gate shut / unapproved: «הוחזר במזומן» and «תיקון-היפוך» absent (tests/approval.test.mjs's
   rule), every other figure unchanged (a year has no carry either way).
8. The workbook, built with the shipped `vendor/xlsx-0.18.5.min.js` in Node and read back
   (tests/xlsx.test.mjs's way): every cell equals the facts; the sheets in order with
   `YOSEF_GEVES_TITLE` last; the RTL view; the frame sentence on «סיכום»; the name `farkad-year_<YYYY>.xlsx`.
9. The whole disk byte for byte across the reading, the open, the arrows, a month row's
   navigation and the export.
10. Every PROPOSED word pinned; every BORROWED word found in its owner; the Hebrew/Arabic scan green.
11. The cost rows of the budget.

Browser (tests/yearsummary.browser.mjs):
12. «סיכום חודש» shows the year button worded for the month on screen (and re-worded across a
    January/December step); the button ≥ 48 × 48 with its words inside; a tap closes the month and
    opens the year entered at its title, «מחשב את השנה…» painted before any figure.
13. The arrows step years and keep the focus; a month row opens «סיכום חודש» on that month at its title.
14. The export through recorders (`XLSX.writeFile` and `downloadCsv` stubbed): the file's name and
    sheets; with the library unavailable, the CSV path and its sentence.
15. Escape, the backdrop and «סגור» close it with the focus given back; Tab stays inside.
16. A commit under the open dialog re-reads with the scroll kept.
17. Floors at every phone, scheme and mode and at doubled text (the ruler, `measureInPage`); no
    sideways scroll; nothing cut.
18. The browser budget rows; nothing written (`censusOnly`); no uncaught error.

Existing suites touched, deliberately and only as said:
- `tests/monthsummary.browser.mjs:247-249` - the frame's Tab order gains `monthSummaryYear` in
  its document place, between the body and the fold:
  `['monthSummaryPrev', 'monthSummaryNext', 'monthSummaryYear', 'monthSummaryFoldLabel',
  'monthSummarySend', 'monthSummaryCopy', 'monthSummaryClose', 'monthSummaryPrev']`; and its 48 px
  check of the frame's buttons (:393) includes the new one. Nothing else in that file moves.
- `tests/screens.mjs`: `{ name: 'reports - the year on one screen', scope: ['#yearSummaryModal'] }`
  after 'reports - the month on one screen', opened through «סיכום חודש»'s button and waited until read.
- Stay green with no other expectation moved: monthsummary (Node), reports + reports-browser
  (the «הפקת דוח» menu is NOT touched), reports-speed, payslips + browser, approval, xlsx, exports,
  smoke, mobile, design-browser, largetext + largetext-browser, whatsnew + browser, nonassertions,
  gate-integrity (but its stamp section), isolation, build (but its stamp checks).

## Base

- `origin/main` = `6ab193d68c960e4a56d947673c282b867acd258f`; branch `feat-yearsummary`; worktree
  `/home/user/farkad/.claude/worktrees/feat-yearsummary`; `npm ci` there.
- MUST NOT be touched: `js/model/**`, `js/sync/**`, `js/state.js`, `js/store.js`,
  `js/recovery.js`, `firestore.rules`, `functions/**`, `firebase.json`, `.github/**`; the three
  stamps (index.html:108, js/app.js:7, sw.js:24); `docs/releases.md`, `CLAUDE.md`,
  `js/ui/whatsnew.js`, `js/ui/offline.js`; `js/ui/reports.js` (read, never changed); the other
  tracks' files (`js/ui/status.js`, `js/ui/payday.js`, `js/ui/monthboard.js`, `js/ui/week.js`,
  `js/ui/printout.js`, `js/ui/owes.js`, `js/ui/backup.js`). In `js/ui/monthsummary.js` only the
  extraction and the one hook line.
- Expected red on this branch, and only this: tests/build.test.mjs «the stamps were moved by the
  commit that moved the bytes» (and its sw.js line) and tests/gate.integrity.test.mjs §4.
- Browsers: `export PLAYWRIGHT_BROWSERS_PATH=/tmp/claude-0/-home-user-farkad/d6a64352-db1a-5c3b-b54d-5c09103f2419/scratchpad/pw1194`;
  never `playwright install`; no emulator suites. Commit after every step; never `--amend`; every
  commit ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and
  `Claude-Session: https://claude.ai/code/session_01AczE1SUjJY47GFH8eTREya`. No push, no PR.

## «מה חדש» (for the integrator; PROPOSED)

`{ title: 'סיכום שנה', text: 'השנה חודש אחר חודש, לפי עובד ולפי אתר, וקובץ Excel לרואה החשבון - לפי מה שנרשם, לא מה ששולם.', where: 'דוחות ← הפקת דוח ← סיכום חודש ← סיכום שנה', go: 'yearSummary' }`
- `go: 'yearSummary'` only navigates: `whatsNewReportsMenu(...)` (whatsnew.js:523) opens «הפקת דוח»
  and focuses the «סיכום חודש» row without pressing it - «הראה לי» never opens a reading of money.

## Interfaces

Provided (globals of `js/ui/yearsummary.js`, and one of `js/ui/monthsummary.js`):
- `openYearSummary(year)` → `boolean`; `closeYearSummary()`; `yearSummaryIsOpen()` → `boolean`;
  `renderYearSummaryIfOpen()`; `yearSummaryStep(n)`; `openYearSummaryFromMonth()`;
  `yearSummaryEntryLabel(monthKey)`; `yearSummaryExport()`.
- `yearSummaryFacts(year)` → `{ year, range: {from, to}, inProgress, empty, line: <monthSummaryReadRange
  fields>, months: [<monthSummaryRead fields> × 12], men: [{ workerId, name, active, attendanceDays,
  payUnits, doubleDays, extraHours, gross|null, handedOver }], sites: [{ placeId, name, billed, own,
  rima, first, last }], yosef: [{ placeId, name, total }], notSummed: boolean }`.
- `monthSummaryReadRange(key, range)` (monthsummary.js) - `monthSummaryRead(key)` is it with the
  month's range.
- `YEAR_SUMMARY_TEXT`. No other track calls into this one; it calls none of theirs.

## The report

Branch and final commit; every hook in an existing file; the source of every figure; every new
string; the deliberate Tab-order change; every suite's exit code and counts, one by one on the final
commit from a clean tree; the release-entry text and the CLAUDE.md file-list line for the
integrator; screenshots (synthetic names, 440x956 dark, 320x568 with the mode, JPEG) and the
workbook opened as a table in
`/tmp/claude-0/-home-user-farkad/d6a64352-db1a-5c3b-b54d-5c09103f2419/scratchpad/feat-yearsummary/`;
what was not verified (not tried on a real phone; not opened in a real Excel); open questions with
a default.
