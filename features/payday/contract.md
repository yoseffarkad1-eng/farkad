# Contract — «יום תשלום»: the payday desk (track `payday`)

Base `6ab193d68c960e4a56d947673c282b867acd258f` (origin/main, stamps v204). Branch `feat-payday`,
worktree `/home/user/farkad/.claude/worktrees/feat-payday`. One of four tracks of the 2026-11-19
program; the integrator ships them together as v206.

The owner's money pain is the one this app keeps answering piece by piece: periods nobody closed,
deductions not taken, advances forgotten («מי חייב כסף», «שים לב», «סגירת שבוע», the close
reminder). What does not exist is the moment before he pays: on Wednesday night or Thursday
morning, with cash to fetch, he has to open «דוחות», find each group's band at the bottom of its
cards, and discover what will stop the close only when he presses it. This track is ONE dialog for
that moment - a frame around the existing tools, not a payroll of its own. It writes nothing and
closes nothing.

## Goal

After this ships the owner taps «יום תשלום» on top of «מקדמות» and reads:

1. for each pay group (one period: the weekly men's week, the fortnightly men's fortnight, a man a
   boundary cut short alone) the next payday's date, and the three figures «דוחות» prints for that
   group - «נצבר», the deduction column, «לתשלום» - as recorded so far, with each man's own figure
   one tap away;
2. what will stop or distort the close, while there is still time to fix it, each with one button
   that only navigates;
3. how many accounts «סגירת שבוע» would close now, who is held and why it says so, and the door to it;
4. the two doors he uses after closing: «תלוש לכל עובד» and «סגירות שנרשמו».

## Out of scope

- Any figure not printed by «דוחות» for the same group: no total across the two groups (the sheet
  refuses to add a weekly payday to a fortnightly one, js/ui/reports.js:1121-1124), no forecast of
  days not recorded, no banknote breakdown, no «שולם» mark, no employer cost.
- Closing, choosing a deduction, pre-filling «סגירת שבוע», opening it or the payslips by itself.
- Rima and «עובדי יוסף גבס» (they are not pay).
- «דוחות»'s own draw and its speed (the 21 s on a heavy record is pre-existing; a separate repair).
- The blank working days of the account: `renderAccountBanner` (js/ui/day.js:592) already says them
  on the day screen; repeating its inline rule here would be a second implementation.
- Paper, the picture, a file: it is a dialog (app.css:4147-4180).
- `js/ui/offline.js` (v205), `js/ui/whatsnew.js` (the integrator's).

## Data — reads only

Nothing in this track writes the record, the outbox, the cloud, a backup, the rescue file or any
Store key; it keeps no preference. Its only state is memory (`PAYDAY_KEPT`, the open flag).

**The reading** - `paydayFacts(today, at)`, ONE synchronous call, the house nesting (scout-api 7.4):

```
function paydayFacts(today, at) {
    if (typeof reportReadOnce === 'function' && !reportReading()) return reportReadOnce(paydayFacts, this, arguments);
    const read = () => paydayScope(() => paydayRead(State.schedule, today, at));
    return typeof weeklyCloseOnce === 'function' ? weeklyCloseOnce(read) : read();
}
```
`paydayScope` is `monthSummaryScope`'s twin (js/ui/monthsummary.js:139-164): it holds
`REPORT_WORKERS`, sets it to `null` (everybody), and puts it back in a `finally`. It never touches
`REPORT_RANGE` (every call below takes its range) and never `REPORT_DEDUCTIONS` (a deduction chosen on
the sheet this session is the sheet's and is read as the sheet reads it). Nothing awaits, writes or
renders inside. Rows handed back by the memo are never mutated (`payrollRowsOver` copies them,
reports.js:999).

| what | read from (file:line at the base) |
|---|---|
| the groups | every man in the roster: `periodRangeFor(worker, today)` (js/dates.js:213) → key `cycle|from|to`; the groups ordered as `payrollAccountGroups` orders them (reports.js:1158-1187: weekly first, then by date) |
| a group's rows | `payrollRowsOver(from, to, carryReportingEnabled(State.schedule), id => group.has(id))` (reports.js:987) - the rows «דוחות» draws for that group on its default (`payrollRows` → `reportSpanFor` → `payrollRowsOver`, reports.js:918-985, 471) |
| «נצבר», the deduction, «לתשלום» | `band = payrollBandTotals(rows)` (reports.js:1112): `band.gross`, `band.taken`, `band.net` - the expression `renderReconcileBand` (reports.js:1786) and the work table's footer (reports.js:2058-2070) print under the group |
| the deduction column's name | `deductionColumnName(rows)` (reports.js:3857) |
| the count line | `` `סה״כ לתשלום · ${countedIn(paid, 'עובד אחד', 'עובדים')}` `` with `paid` = rows with `amount !== null` (reports.js:1790-1794, 4483) |
| a man's figure | `moneyOf(row).net` (reports.js:4769), said by `moneyText` (:4705); «—» when it is null |
| the transition sentence | reports.js:1314, verbatim, when `row.periodIsTransition` |
| figures as text | `moneyText`, `bidiAmount`, `minusAmount` (js/ui/dom.js:104/93) - nothing formatted here |
| check a | `weeklyCloseReadyWord()` (js/ui/weeklyclose.js:612), its own sentence, only with the gate open and something to close |
| check b | `owesWarnings(owesReadNow())` (js/ui/owes.js:389/663) kind `'unclosed'`, worded by `owesWarningWords(warning, today)` (owes.js:521) |
| check c | rows with `amount === null && attendanceDays > 0` |
| check d | for a group whose `to === today`: its men with a row and `!weeklyCloseTodayRecorded(State.schedule, id, today, memo)` (weeklyclose.js:333) |
| check e | `overpaymentWarning(row.carry)` non-null (reports.js:4723) |
| check f | rows with `hoursUnpriced` |
| «לסגירה» | `closeReminderCount(read)` (js/ui/closereminder.js:102) with `read = weeklyCloseRead(State.schedule, today, at)` (weeklyclose.js:542) - or `CLOSE_REMINDER_KEPT.count` when `CLOSE_REMINDER_KEPT.key === closeReminderKey(State.schedule, today)` (closereminder.js:182/190); held men = `read.men` with `held !== null` (only when the list was read here) |
| the gate | inside the scopes `carryReportingEnabled` is answered once (`reportGateAnswer`, reports.js:90: no plan on an approved record) |

**Opening** paints the frame with `WEEKLY_CLOSE_TEXT.reading` «מחשב את החשבונות…» first and reads
after the paint (`owesAfterPaint`, owes.js:780), then keeps
`PAYDAY_KEPT = { key: owesKey(State.schedule, today), facts }` (owes.js:644). A second opening on an
unmoved record reads nothing. `renderPaydayIfOpen`: an unmoved key draws nothing new; a moved key
puts the placeholder over the figures (never the old figures as current) and reads again once the
draws have stopped for 1.5 s (closereminder.js:263's rule); `.modal-content.scrollTop` is kept; a
new calendar day is a moved key.

**Gate shut or record unapproved**: section 2 shows the plain bands - exactly what the sheet shows
then; checks a, b and e are not asked (they are the new arithmetic); sections 4 and 5 are replaced by
`OWES_REUSED.checkFirst` (owes.js:149-160, BORROWED).

## Permissions and privacy

Every phone reads its own copy. The desk shows wages and debts by name on the phone only; nothing
leaves it from here. Its doors open screens that keep their own rules («סגירת שבוע» refuses a phone
that is not «מסונכרן בין המכשירים»). Synthetic names in the suites.

## Entry and navigation

- **The host is «מקדמות»**, the money tab, where «סגירת שבוע» already is. `renderOwesInto`
  (owes.js:674-710) draws, instead of the bare `weekly` button (owes.js:682-684), ONE row
  `div.owes-actions` holding `paydayEntryButton()` (this file; `button#paydayEntry.btn-secondary.payday-entry`,
  words `PAYDAY_TEXT.entry`) and then «סגירת שבוע» - half the width each. Where
  `weeklyCloseEntryButton()` answers null the payday button stands alone at full width. Both are
  asked through `typeof`: a build without `js/ui/payday.js` draws «מקדמות» exactly as before
  (criterion 14 compares pixels with `paydayEntryButton` set to `undefined`). Measured cost of the
  row (proposal-money §1.2): 0 px at 320, 375 and 440 with the mode off and at 375 and 440 with it
  on; +18 px at 320 with it on, both buttons two-line, ≥ 52 px, no word past an edge.
- Not on «דוחות» (its draw is the heavy one and its toolbar wraps at 320), not in the close
  reminder's line (its words are the owner's).
- The frame: a static `.modal#paydayModal > .modal-content.modal-wide` in index.html directly after
  the `#advanceResetModal` frame: `h3#paydayTitle[tabindex=-1]` first, `#paydayBody`, then
  `.modal-actions` with `button#paydayClose`. `MODAL_CLOSERS.paydayModal: () => closePayday()`
  after the `advanceResetModal` row (js/ui/modal.js:31); `if (typeof renderPaydayIfOpen ===
  'function') renderPaydayIfOpen();` in `render()` after the `renderAdvanceResetIfOpen` line
  (js/app.js:172).
- `js/ui/payday.js`: `<script>` directly after `js/ui/advancereset.js` (index.html:1212), with a
  comment: after owes.js, weeklyclose.js and closereminder.js's readers are called only when it is
  opened; runs nothing at load. `'./js/ui/payday.js'` in sw.js SHELL after `'./js/ui/advancereset.js'`.
- **Every door closes the desk first, then calls the target's own opener**, focusing a newly opened
  dialog's title by hand (sitecard.js:507-519's rule). None writes; the two that open a screen which
  keeps its own place (the payslips) write only what that screen's own opener writes, measured equal
  to opening it from its own entry (criterion 12):

| door | words | action |
|---|---|---|
| check b | `` `${OTHER_ACCOUNT_SHOW} ${owesSpanText(span)}` `` (BORROWED, reports.js:1239, owes.js:479) | `owesShowAccount(id, span)` (owes.js:838) |
| checks c and f | «עובדים ואתרים» (BORROWED, the tab's word) | `showView('roster')` |
| check d | **«לרישום היום»** (PROPOSED) | `State.date = today; dayChosenByHand(); showView('day')` (js/app.js:367) |
| check e | `OWES_TEXT.advancesOf(name)` (BORROWED) | `showWorkerAdvances(id)` (reports.js:277) |
| check h | «מקדמות» (BORROWED, the tab's word) | `OWES_PAGE = null; ADVANCE_WORKER = null; showView('advances')` |
| «לסגירה» | `CLOSE_REMINDER_TEXT.open` «לסגירת שבוע» (BORROWED) | `openWeeklyClose()` (weeklyclose.js:787) |
| «אחרי הסגירה» | `PAYSLIPS_TEXT.entry` «💬 תלוש לכל עובד» (BORROWED) | `openPayslips(which)` (js/ui/payslips.js:468), `'current'` when a group's period ends today, else `'previous'` |
| «אחרי הסגירה» | `OWES_TEXT.closures` «סגירות שנרשמו» (BORROWED) | `owesOpenPage('closures')` (owes.js:856) |

## The screen, section by section, in this order

PROPOSED words live in ONE frozen block `PAYDAY_TEXT` at the top of `js/ui/payday.js`, pinned word
for word in tests/payday.test.mjs; BORROWED words in `PAYDAY_REUSED` (or read from their owner's
constant), each found in its owner's source by the suite. Names through `isolate()`, ranges through
`dateRange()`, amounts through `bidiAmount(moneyText(x))`. Never «נשלח», «שולם», «נמסר», «שילמת».

0. **Title** `PAYDAY_TEXT.title` = **«יום תשלום»** (PROPOSED; also `PAYDAY_TEXT.entry`, the button).
1. **The lead**: **«כמה לשלם ביום התשלום הבא לפי מה שנרשם עד עכשיו, ומה כדאי לסדר לפני שסוגרים. המסך הזה רק מראה - שום דבר לא נרשם ממנו.»** (PROPOSED).
2. **«יום התשלום הבא»** (PROPOSED) - one card per group that has rows; none:
   **«עוד אין רישומים בתקופה הנוכחית.»** (PROPOSED).
   - Heading `PAYDAY_TEXT.heading(day, date, cycle)` = **`` `${day} ${date} · ${cycle}` ``**
     (PROPOSED template; `day` = `hebrewDayName`, `date` = `formatShortDate`, `cycle` =
     `PAY_CYCLE_LABELS[cycle]` BORROWED), prefixed by **«היום, »** (PROPOSED) when `to === today`;
     the period `dateRange(...)`; the transition sentence (BORROWED) when it applies.
   - Three figures, label over value: «נצבר» (BORROWED) `moneyText(band.gross)`; the deduction
     column's name (BORROWED) `minusAmount(band.taken)` (or 0); «לתשלום» (BORROWED)
     `bidiAmount(moneyText(band.net))` - the largest figure on the card. Then the count line (BORROWED).
   - Honesty lines, each only when it applies, all PROPOSED:
     - always: **«לפי מה שנרשם עד עכשיו. ימים ומקדמות שעוד לא נרשמו - לא נכללים.»**
     - gate open and `band.taken > 0`: **«הסכום לתשלום הוא אחרי כל הניכוי שהדוח מציע. ניכוי קטן יותר בסגירה - יותר לתשלום, עד הנצבר.»**
     - a date after today inside the period holds a record of one of the group's men (`entriesFor`,
       schema.js:2847): **`` `כולל ימים שכבר נרשמו מראש: ${dates}.` ``** (dates `formatShortDate`, joined by ', ')
     - `REPORT_DEDUCTIONS.has(reportDeductionKey(id, from, to))` for a man of the group (reports.js:24/487):
       **«לחלק מהעובדים נבחר בדוח ניכוי אחר, והוא כלול כאן. «סגירת שבוע» מתחילה מהניכוי המלא.»**
     - two cards end on the same date: under the second, **«ביום הזה משלמים לשתי הקבוצות. לכל קבוצה הסכום שלה - הם לא מחוברים כאן.»**
   - The fold: a toggle BUTTON (aria-expanded; not `<details>`, which modal.js's Tab trap does not
     know - monthsummary.js's reason) labelled «לפי עובד» (BORROWED, reports.js:663); opened, each
     man in roster order: `isolate(name)` and his figure, or «—». No sum.
3. **«לפני שסוגרים»** (PROPOSED) - one sentence each, at most one door each, in this order:
   a. the phone cannot close now: `weeklyCloseReadyWord()` (BORROWED, verbatim), no door - only
      when there is something to close (the «לסגירה» count > 0, or a group's period ends today);
   b. an earlier period left open: `owesWarningWords` title and lines (BORROWED) + its door;
   c. a wage the sheet cannot price: `MONTH_SUMMARY_TEXT.unpriced(count, names)` (BORROWED,
      monthsummary.js:62) + door;
   d. a period ends today and today is not recorded: **`` `החשבון של ${name} נגמר היום, והיום עוד לא נרשם לו.` ``**
      / **`` `החשבון של ${n} עובדים נגמר היום, והיום עוד לא נרשם להם: ${names}.` ``** (PROPOSED) + door;
   e. an advance that needs a look: `overpaymentWarning(row.carry)` (BORROWED) + door;
   f. extra hours with no hourly rate: `HOURS_UNPRICED_NOTE` (BORROWED, reports.js:13) and the names + door;
   - when a-f are all empty: **«אין מה לסדר לפני הסגירה.»** (PROPOSED);
   h. always last, quiet, not counted as a problem: **«מקדמה שניתנה ולא נרשמה לא תנוכה. רושמים אותה לפני שסוגרים.»** (PROPOSED) + door.
4. **«לסגירה»** (PROPOSED): `CLOSE_REMINDER_TEXT.line(count)` (BORROWED, the owner's sentence) and
   its door; the held men under `WEEKLY_CLOSE_TEXT.stateHeld` «לא ייסגר» (BORROWED); with 0:
   `WEEKLY_CLOSE_TEXT.nobody` «אין עכשיו חשבונות לסגור.» (BORROWED).
5. **«אחרי הסגירה»** (PROPOSED): the two doors.
6. «סגור» (BORROWED) in the frame.

## Floors and looks

- 320x568, 375x667, 440x956; both schemes; «תצוגה גדולה» on and off; doubled text
  (`doubleEveryFontSize`, tests/mobile.test.mjs:755-842). No sideways scroll; the last door reachable.
- App floors: 44 × 44 targets, ≥ 14 px, 4.5:1 on the painted ground. Large: ≥ 18 px, ≥ 500, 7:1,
  52 × 52. At 320 with the mode the three figures stack label over value.
- The look: css/design.css inside `@media screen`, ONE commented block placed directly after the
  `.weekly-close-entry` rule (design.css:1639) - the half-width row first
  (`.owes-actions { display:flex; gap }` and each button `flex: 1 1 0`, `white-space: normal`),
  then the dialog. Every size, weight and line-height restated in css/large.css block 3 directly
  after the `.weekly-close-entry` restatement (large.css:972), one for one, with the original's
  importance. No colour of its own: the money ink and the warn/danger hints are the sheet's.

## Performance budget

| what | budget | how measured |
|---|---|---|
| `paydayFacts` on a season whose periods are closed in order (40 men, 300 days, advances in the last 70 days; scout-api 7.2 "D", measured 223 ms) | ≤ 600 ms | Node, tests/payday.test.mjs, median of 3, printed |
| `paydayFacts` on a season nobody closes (637 advances; "B", measured 3.2 s) | ≤ 8,000 ms - held so that a regression is seen; the dialog says «מחשב את החשבונות…» meanwhile | Node, same suite |
| a draw of «מקדמות» | reads NOTHING of this file: 0 calls to `paydayFacts`, `payrollRowsOver` from the entry, over 10 draws | spies |
| a second opening on an unmoved record | 0 calls to `payrollRowsOver`, `weeklyCloseRead`, `owesRead` | spies |
| tap → the frame painted with the placeholder | the next frame (no reading before it) | browser, `requestAnimationFrame` after the tap |
| the screens.mjs seed: tap → figures | ≤ 1,500 ms | browser |

## Success criteria

New suites: `tests/payday.test.mjs` (`test:payday`, appended to `npm test`) and
`tests/payday.browser.mjs` (`test:payday-browser`, appended to `test:all`); rows in tests/README.md.

Node (harness devices + `tests/moneydom.mjs`; seeded records: both cycles, a shared Thursday, a
transition period, a man with no rate, unpriced hours, a deduction chosen on the sheet, an earlier
period left open with a debt, an over-settled advance; under BOTH gate readings):
1. Each card's three figures equal, as text, the band «דוחות» draws for that group on its default
   (`renderReports()` in the Node DOM with `REPORT_PRESET = 'fortnight'` and the default range:
   the «לתשלום», «נצבר» and deduction cells of that group's band - the work table's footer, or
   «סיכום התקופה» when the group has men with money and no days).
2. Each man's figure equals `moneyOf` of the sheet's row; on a Thursday whose period ends today
   (today recorded), it equals `weeklyCloseFigures(man, man.max).net` for every man «סגירת שבוע»
   offers in that period.
3. The «לסגירה» count equals `closeReminderCount(weeklyCloseRead(...))`; the held men equal those
   with `held !== null`.
4. Every check fires on the fixture made for it and is silent on one that is not; each one's words
   pinned; every door calls only navigation (recording stubs: no `State.commit*`, no
   `closePeriodChanges`, no `saveFinancialAction`, no `recordAdvanceRepaid`).
5. A week walked day by day (Friday to Thursday) and a fortnight's Thursday: the groups, the
   «היום, » prefix on the last day, the ahead line when tomorrow is recorded, the both-groups line.
6. The reading inside `weeklyCloseOnce` equals the bare reading (JSON, both gate readings);
   `REPORT_WORKERS`, `REPORT_RANGE` and `REPORT_DEDUCTIONS` are back after a throw inside the scope.
7. The gate is asked at most once per reading and never planned on an approved record.
8. The cost rows of the budget.
9. Gate shut / unapproved: the plain bands (equal to the sheet's then), checks a, b, e absent,
   sections 4-5 replaced by `OWES_REUSED.checkFirst`.
10. The whole disk byte for byte (`device.dump()`) across the reading, the open, every door, the close.
11. Every PROPOSED word pinned; every BORROWED word found in its owner; no word mixing Hebrew and
    Arabic letters (tests/reportnames.test.mjs green).

Browser (tests/payday.browser.mjs):
12. The row on «מקדמות» at 320/375/440 × dark/light × mode off/on: the board under it moves 0 px
    (≤ 18 px at 320 with the mode), both buttons ≥ 48 px (52) with their words inside; «סגירת שבוע»
    still opens from it; census: opening the payslips from the desk writes exactly the bytes its own
    entry writes, and nothing else writes anything.
13. The tap paints «מחשב את החשבונות…» before any figure; the figures then equal, as text, the
    band «דוחות» draws for the same group on the same page state.
14. With `paydayEntryButton` set to `undefined` «מקדמות» is drawn as on the base (the same
    rectangles of the board, and «סגירת שבוע» full width).
15. Every door lands where the table says; a newly opened dialog is entered at its title.
16. Escape, the backdrop and «סגור» close the desk and give the focus back to `#paydayEntry`; Tab
    stays inside; the fold's button toggles with the keyboard.
17. A commit under the open desk: the placeholder over the figures, then the new figures once the
    draws stop; the scroll kept.
18. Floors at every phone, scheme and mode and at doubled text (the ruler, `measureInPage`); no
    sideways scroll; nothing cut.
19. No uncaught error.

Existing suites touched, deliberately and only as said:
- `tests/reports.speed.test.mjs`: the row `div.owes-actions` on `#advancesView` is taken out of the
  comparison as one node and COUNTED (`device.paydayRows`, required where the board is drawn and
  nowhere else) - and the «סגירת שבוע» button inside it is still counted as `WEEKLY_ENTRY`
  (`device.weeklyEntries` unchanged per draw), so suite 1's "where it was drawn" holds;
  `WAYS_IN` gains `['«יום תשלום»', 'paydayFacts(todayStr(), "<TODAY>T15:00:00.000Z");']`, the gate
  counted at most once like every other way in.
- `tests/screens.mjs`: `{ name: 'advances - «יום תשלום», read', scope: ['#paydayModal'] }` and
  `{ name: 'advances - «יום תשלום», the fold opened', scope: ['#paydayModal'] }`, after the
  'advances - one closure' entry, opened through the row on «מקדמות» on the owes record
  (`owesRecord`/`owesRecordBack`, screens.mjs:199-229), waited until read.
- Stay green with no expectation moved: owes + owes-browser, weeklyclose + weeklyclose-browser
  (the button's floors still hold at half width), closereminder + browser, payslips + browser,
  approval, reports.speed (but the two additions), smoke, mobile, design-browser, largetext +
  largetext-browser, whatsnew + whatsnew-browser, nonassertions, gate-integrity (but its stamp
  section), isolation, build (but its stamp checks).

## Base

- `origin/main` = `6ab193d68c960e4a56d947673c282b867acd258f`; branch `feat-payday`; worktree
  `/home/user/farkad/.claude/worktrees/feat-payday`; `npm ci` there.
- MUST NOT be touched: `js/model/**`, `js/sync/**`, `js/state.js`, `js/store.js`,
  `js/recovery.js`, `firestore.rules`, `functions/**`, `firebase.json`, `.github/**`; the three
  stamps (index.html:108, js/app.js:7, sw.js:24); `docs/releases.md`, `CLAUDE.md`,
  `js/ui/whatsnew.js`, `js/ui/offline.js`; `js/ui/reports.js` and `js/ui/weeklyclose.js` (read,
  never changed); the other tracks' files (`js/ui/status.js`, `js/ui/monthboard.js`,
  `js/ui/yearsummary.js`, `js/ui/week.js`, `js/ui/printout.js`, `js/ui/monthsummary.js`,
  `js/ui/backup.js`). In `js/ui/owes.js` only `renderOwesInto`'s three lines around the weekly button.
- Expected red on this branch, and only this: tests/build.test.mjs «the stamps were moved by the
  commit that moved the bytes» (and its sw.js line) and tests/gate.integrity.test.mjs §4.
- Browsers: `export PLAYWRIGHT_BROWSERS_PATH=/tmp/claude-0/-home-user-farkad/d6a64352-db1a-5c3b-b54d-5c09103f2419/scratchpad/pw1194`;
  never `playwright install`; no emulator suites. Commit after every step; never `--amend`; every
  commit ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and
  `Claude-Session: https://claude.ai/code/session_01AczE1SUjJY47GFH8eTREya`. No push, no PR.

## «מה חדש» (for the integrator; PROPOSED)

`{ title: 'יום תשלום', text: 'בעמוד המקדמות: כמה לשלם בכל קבוצה ביום התשלום הבא לפי מה שנרשם, ומה כדאי לסדר לפני שסוגרים.', where: 'מקדמות ← יום תשלום', go: 'payday' }`
- `go: 'payday'` only navigates: `OWES_PAGE = null; ADVANCE_WORKER = null; showView('advances')`,
  then focus `#paydayEntry` without pressing it (it is a reading of money: «הראה לי» never opens one).

## Interfaces

Provided (globals of `js/ui/payday.js`):
- `openPayday()` → `boolean` (true when the frame was shown); `closePayday()`; `paydayIsOpen()` →
  `boolean`; `renderPaydayIfOpen()`; `paydayEntryButton()` → the button node or null;
  `PAYDAY_TEXT` (with `.entry`); the node `#paydayEntry` while «מקדמות» is drawn.
- `paydayFacts(today, at)` → `{ gate, today, groups: [{ cycle, from, to, transition, today: boolean,
  rows: [{ workerId, name, net|null }], gross, taken, net, label, paid, lines: [string] }],
  checks: [{ kind: 'notReady'|'unclosed'|'unpriced'|'endsToday'|'review'|'hoursUnpriced'|'forgotten',
  say, door: { words, go } | null }], close: { count, held: [{ id, name }] } | null }`.
- Track `status` calls `openPayday()` and reads `PAYDAY_TEXT.entry`, both behind `typeof`, after
  closing its own dialog. Nothing here depends on `status`.

## The report

Branch and final commit; every hook in an existing file; the source of every figure; every new
string; the two deliberate changes to tests/reports.speed.test.mjs; every suite's exit code and
counts, one by one on the final commit from a clean tree; the release-entry text and the CLAUDE.md
file-list line for the integrator; screenshots (synthetic names, 440x956 dark, 320x568 with the
mode, JPEG) in `/tmp/claude-0/-home-user-farkad/d6a64352-db1a-5c3b-b54d-5c09103f2419/scratchpad/feat-payday/`;
what was not verified (not tried on a real phone); open questions with a default.
