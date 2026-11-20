# Handoff — «סיכום שנה» (track `yearsummary`)

- **Branch** `feat-yearsummary`, worktree `/home/user/farkad/.claude/worktrees/feat-yearsummary`.
- **Base** `6ab193d68c960e4a56d947673c282b867acd258f` (origin/main, stamps v204).
- **This is the handoff of FIX ROUND 1** - the adversarial review of `eef8c88` (seventeen findings),
  triaged and repaired. The app's code is final at `64429b1` (its fixes are `69df05b` and
  `64429b1`), the tests at `5430b0f` (their own words only, since `64429b1`); the two commits after
  it change this file only.
- **Where each run ran.** The `npm test` chain, suite by suite, and 9 browser suites ran
  on `64429b1` from a clean tree (`git status --short` empty when each began); on `5430b0f` the
  suites that read every test file or the tree, and the year's Node suite, ran again. The year's
  BROWSER suite has NOT run on `5430b0f`: queued twice through the wrapper, it got no slot in 115
  minutes and was stopped unrun. Its last run is `64429b1`'s, 223/223; its file has changed since
  in a header comment and one `suite()` title, nothing a check reads. See «Test output».
- **Contract** `features/yearsummary/contract.md`, revision 2 (re-read from disk for this round;
  identical to the program's copy). Where fix round 1 departs from it is listed under «done
  differently», items 6-9.
- Not pushed, no PR. The three build stamps are NOT moved (index.html:108, js/app.js:7, sw.js:24).

Commits on the branch, oldest first:

- `859ea87` features/yearsummary: the contract «סיכום שנה» is built against
- `e3e196c` «סיכום שנה»: the year as it was worked, and the accountant's workbook
- `b862dc9` tests/yearsummary.test.mjs: the year on devices, criteria 1-11
- `bb39262` tests/yearsummary.browser.mjs, the screens list, and the month's Tab order moved
- `7625a89` tests/yearsummary.browser.mjs: the season is timed on the real clock
- `5f0615f` tests/README.md: the two «סיכום שנה» suites, what each proves
- `08c3aca` «סיכום שנה»: contract revision 2 reconciled
- `da86cd3` tests/README.md: the two «סיכום שנה» rows say what revision 2 holds
- `ee26ec0` tests/yearsummary.test.mjs: on 31 December the year reads whole, as December does
- `a27383b` «סיכום שנה»: a switched-off man's cell in «עובדים» isolates his name
- `acc1159` tests/README.md: the year's row names its last day and the switched-off man's cell
- `fc70a26` «סיכום שנה»: the workbook's sentences are set right to left by their own marks
- `432f771` tests/yearsummary.browser.mjs: two expectations that had never run
- `eef8c88` features/yearsummary/handoff.md: what was built, where every figure comes from, and the runs
- `69df05b` «סיכום שנה» fix round 1: what the review found, each with the check that holds it
- `d6fe21e` tests/yearsummary.browser.mjs, tests/README.md: the glass holds fix round 1
- `64429b1` «סיכום שנה»: a tile is one column, and a figure's room is the dialog's
- `5430b0f` tests/yearsummary.*: the suites' own words about a moved record, as fix round 1 made it
- `376911b` features/yearsummary/handoff.md: fix round 1
- (next) features/yearsummary/handoff.md: the year's browser suite got no slot on 5430b0f, and says so


## Fix round 1 - the review of `eef8c88`, finding by finding

The adversarial review of `eef8c88` reported seventeen findings (six P2, eleven P3, no P1). Each was
opened at its file and line and reproduced on `eef8c88` before anything was changed - the review's
own Node probes run again against this worktree (`reversed-probe`, `unmoved-probe`,
`notsummed-probe`, `edges-probe` case 4, `edges2-probe`, `monthmark-probe`: every one printed what
the review printed), and its glass probes read against the code. **All seventeen are CONFIRMED;
none was discarded.** Every P2 is fixed; every P3 is fixed or fixed in part, and what is left of a
P3 is said in its row, with why.

The code is in `69df05b` and `64429b1` (a tile one column of label and value, and the money held to
what fits at 375 doubled), the browser suite and the README rows in `d6fe21e` and `64429b1` (the
digit check measuring the dialog's room), the suites' own words in `5430b0f`. Each fix has a check
that fails on `eef8c88`'s code and passes here:
- **Node:** the new `tests/yearsummary.test.mjs` run against `eef8c88`'s tree (a copy in the
  scratchpad, its suite reading v204's monthsummary.js out of this repository): **163/239** - the
  76 that fail are each a new or moved check, named in the table. And eight mutations of the NEW
  code, each run alone against the new suite in a scratch copy and each turned red (list below).
- **Browser:** `probes/fixcheck.mjs` measures, on `eef8c88`'s tree and on this one in one run, the
  very conditions the new browser checks hold (output under «Test output»), and the new browser
  suite holds them on this tree.

| # | finding (severity) | verdict | what was done | the check that holds it |
|---|---|---|---|---|
| 1 | «מקדמות שניתנו» counts an advance «תיקון טעות» corrected as handed over (P2) | CONFIRMED - his row, February's row and «עובדים» said 1,500 while the ledger folds the advance to 150 | Beside a man's «מקדמות שניתנו» (what was RECORDED - the sheet's own «מקדמות», advancesTotal), «מתוכן בוטלו בתיקון-היפוך»: `advanceReversalsFor(schedule, id, from, to, 'given')`, the model's own sum by the kind the correction corrects, on the glass where non-zero and as a column of «עובדים» where any man has one. Each month row carries the month's own «תיקון-היפוך» (`monthSummaryRead`'s `reversed`, «סיכום חודש»'s own line), on the glass and as a column of «חודשים». Both gated exactly as the «תיקון-היפוך» tile (shut or unapproved: nothing). No shekel is taken off anything: the man's 'given' figure is subtractable by the reader, the month's is «סיכום חודש»'s. | Node: the «תיקון טעות» fixture (`handPhone({ typo: true })`, `recordAdvanceReversed` 1,350 on a 1,500): his facts, his row's pairs, February's row, the gate shut on the same disk; «a correction of a REPAYMENT takes nothing back from what he was handed»; the same fixture held cell for cell through the vendored workbook. Mutation M6 (every kind instead of 'given') red. |
| 2 | no test fails when the unmoved-record guard is removed (P2) | CONFIRMED - the review's mutation passed 199/199 | The check asked right after twenty draws of an unmoved record, before any clock moves: nothing read, nothing marked, nothing painted, no reading owed (`YEAR_SUMMARY_WAIT === null`), the figures on it; and again after a re-read. Browser: `render()` twice over an unmoved record - nothing marked or read. | Mutation M1 (the guard taken out) red: 236/239. |
| 3 | the «worked» half of the not-summed rule held by no test (P3) | CONFIRMED - the review's mutation passed | The fixture the review proposed: the man whose only WORKED month is the unpriced one, handed 200 in May (a May row with no day, priced 0). | Mutation M2 (`row.attendanceDays > 0 &&` taken out) red: 237/239. |
| 4 | the not-summed sentence says «smaller» under a «—» (P3) | CONFIRMED | The sentence is said only under a «נצבר» that is a number (screen and «סיכום»); `facts.notSummed` keeps the rule itself. | «under a «נצבר» of «—» the screen says only why it is «—»» and the «סיכום» rows; mutation M3 red. |
| 5 | a future year with records reads as finished (P3) | CONFIRMED - 2027 on 31/12/2026 had no «השנה עוד לא נגמרה» | `inProgress: !line.empty && today < range.to` - the 31 December rule kept. | «on 31 December, 2027 - which has records already - is a year still being recorded» and its frame line; mutation M4 red. |
| 6 | a month row whose «נצבר» leaves an unpriced man out carries no mark (P3) | CONFIRMED | The row carries «סיכום חודש»'s own sentence beside the same figure (`MONTH_SUMMARY_TEXT.unpriced`, built as the month builds it); «חודשים» ends with one row per such month, the month's name beside its sentence. | Corpus: «the month's own caveats on its row», every month of every seeded year against `monthSummaryFacts`; by hand: March's row; the workbook cell for cell. Mutation M7 (the tag dropped) red. |
| 7 | a snapshot from another phone wipes the open year and throws the reader to the top (P2) | CONFIRMED - `yearSummaryPaintReading` cleared the body | A moved record is MARKED, not covered: the drawn year stays where it is - dimmed, `aria-busy`, the export shut, «מחשב את השנה…» in the frame's own status line in the sticky foot - and is read again ONCE when the draws stop for 1.5 s (unchanged), drawn where the reader is. Opening and the arrows still paint the placeholder (there is nothing of that year to keep). The key stays the whole record (owesKey): a narrower key could show a figure of a moved record as current; a write outside the year now costs a 1.5 s dim and no jump. | Node: «the figures are marked at once - kept where they are...» and the redraw suite (marked once, painted over never); browser: the reader's place sampled every 40 ms from the first commit to the re-read, and a snapshot adopted. Mutation M8 (painted over again) red. |
| 8 | «יצוא השנה» and «סגור» 9-16 screens away, a 12px strip of backdrop the only way out (P2) | CONFIRMED - `#yearSummaryModal .modal-actions` was static | The foot sticks to the dialog's bottom edge, the payslips' way (`position: sticky; bottom: 0`, its own ground and padding, the content's bottom padding dropped); the sizes said again in large.css. | Browser, on 3 phones x 2 schemes x the large display on and off: both buttons on the glass at the first screen, the middle and the last. |
| 9 | the not-summed sentence says, in natural Hebrew, the opposite of what it means (P2) | CONFIRMED - «אין לו ... אפילו ביום אחד» reads «never had a rate» | The review's words, PROPOSED: «עובד שיש לו אפילו יום עבודה אחד בלי שכר יומי לא נכלל בנצבר של כל השנה, ולכן הנצבר של השנה קטן מחיבור החודשים.» | Pinned word for word in both suites (moved on purpose). |
| 10 | at doubled text the headline figures break inside their digits (P2) | CONFIRMED - on `eef8c88`, 440 doubled: «10373», «4788515 ₪» and «446700 ₪» broken though the dialog's line holds each (194, 271 and 232px against 346px of room); five such with the large display | The days' grid floor is `min(100%, 9em)` (1x and the large display keep their columns, measured; doubled text halves them); a tile's value breaks only where it alone is wider than its line (`overflow-wrap: break-word`, the band's own rule since v189), and so do a row's figures. The money tiles are one column. A tile is one column of label and value (`flex-wrap: nowrap`): a column that may wrap sized its line to its widest word and pushed the tile past the dialog's edge (found by the suite's first run of `d6fe21e`, fixed in `64429b1`). LEFT: on the 320px phone at doubled text a seven-figure «נצבר» (280px) is wider than any line the dialog has (230px), and with «תצוגה גדולה» on the 375px phone too (325 against 285) - it is broken or it leaves the glass, and it is broken; the check names it. The same flaw in «סיכום חודש» (its own tiles) is the month summary's, outside this track's block - reported for the integrator. | Browser: a season (40 men) at doubled text on 320, 375 and 440, with and without «תצוגה גדולה»: no run of digits broken where it fits a line of its own; nothing sideways. |
| 11 | the year's only door is at the bottom of «סיכום חודש» (P3) | CONFIRMED - 2-5.5 screens down | The door is under the month's arrows, on its first screen. The frame's Tab order does not change (the month's body has nothing to focus), so tests/monthsummary.browser.mjs does not move. | Node: its place in index.html; browser: on «סיכום חודש»'s first screen at every phone, scheme and mode. |
| 12 | nothing on the year is larger than the rest; repeats and zeros (P3) | CONFIRMED | Fixed in part: «נצבר» and «מקדמות שניתנו» lead, the dialog's width and larger (31px against the days' 30; 36 against 33 with the mode - held to what a seven-figure year at doubled text still fits on the 375px phone), «נצבר»'s sentences straight under them, the days after; «עובדי יוסף גבס» is no tile (its own table, last, holds it, once; «סיכום» no longer repeats it - its own last sheet does); a man's «כפולים» and «שעות נוספות» only where he has one; his own and Rima's share only on a site Rima has a count on; a man's name the heaviest thing on his row (21px/900 against 19px/800; 25/900 against 22/800 with the mode). LEFT: the frame stays three sentences before any figure (contract §1, «always first»; one line with the rest a tap away adds a control and words the owner has not seen - his to decide), so at 320x568 with the mode the first figure is still below the first screen; the year is said twice (title and the arrows' row) as «סיכום חודש» says its month. | By hand: the tiles' order, the two grids, «עובדי יוסף גבס» said once, the men's pairs and labels, the sites' pairs; browser: the name's weight and size on every phone. |
| 13 | a month's row drops its caveats, sends him one way out, explains the tap after the twelfth row (P3) | CONFIRMED | Fixed in part: the row says «החודש עוד לא נגמר.» and the unpriced sentence where «סיכום חודש» says them (row 6); the hint stands before the first row; a month's row keeps where he was, and that month's door brings him back to the same place and the same row (opened any other way, the top). LEFT: Escape or «סגור» in that month still lands on «דוחות» - that is `closeMonthSummary` (js/ui/monthsummary.js, where this track may change only the extraction and the hook). | Node: the hint's place, the caveats, the kept place given and spent; browser: the way back, place and row, and the top when opened another way. |
| 14 | on the screen a man's «נצבר —» has no reason near it (P3) | CONFIRMED | After the last man, the sheet's own sentence naming every man whose «נצבר» is «—» - the «עובדים» sheet's note row, on the glass. | By hand: «after the last man, the reason for his «—»». |
| 15 | the workbook's month count has no unit; the switched-off man's name cell is changed (P3) | CONFIRMED | «חודשים» heads its count «ימי עובד־אתר בלי עובדי רימא» where Rima has a count (and the month rows' bar says the same words: one name for one figure), «ימי עובד־אתר» where not; «עובדים» keeps the name cell the bare name and says «פעיל» / «לא פעיל» in a column of its own, «מצב», where somebody is switched off. | The workbook cell for cell (expectedBook) on five readings. |
| 16 | a first export tapped twice hands over two files (P3) | CONFIRMED - no guard before `await loadXlsx()` | From the press until the file is handed over (or refused, or failed) the button is shut and the foot's line says «מכין את הקובץ…» (PROPOSED); a press meanwhile is nothing. | Node: two presses while the library is held, one file (on `eef8c88`: 2); browser: a finger on the shut button and the function itself, one file. Mutation M5 red. |
| 17 | «תקופת תשלום» is no word of the app; one Rima count has two labels (P3) | CONFIRMED | «תקופת חשבון שעוברת את 1 בינואר...» (PROPOSED); Rima's count on the site rows and in «אתרים» is «עובדי רימא» (`SUMMARY_TEXT.rimaCount`, the workbook overview's own word) - `RIMA_TITLE`, the Rima TABLE's title, is no longer borrowed. | Pinned in both suites; by hand: the sites' labels; the workbook. |

**The mutations** (each applied alone to a scratch copy of the new code, the new suite run, the
copy restored; the unmutated copy 239/239 first):

```
M1 the unmoved guard taken out                          236/239  twenty draws of a record that did not move ...
M2 the «worked» half of the not-summed rule taken out   237/239  a man who only WORKED in the unpriced month ...
M3 the not-summed sentence said under a «—»             237/239  under a «נצבר» of «—» the screen says only why ...
M4 a future year read as finished                       235/239  on 31 December, 2027 - which has records already ...
M5 the export's in-flight guard taken out               238/239  pressed twice while the library is on its way ...
M6 every kind of correction beside the advances         238/239  a correction of a REPAYMENT takes nothing back ...
M7 the month's unpriced caveat dropped                  230/239  seed 62/64/66: the month's own caveats on its row ...
M8 a moved record painted over again                    233/239  the figures are marked at once ...
```

**What moved on purpose in the track's own suites** (every new word PROPOSED and pinned): the
split and not-summed sentences; the tiles' order and «עובדי יוסף גבס» out of them; the hand
fixture's men, sites and month rows; the redraw checks (marked, not taken off); the workbook as
`expectedBook` writes it; the door's place in index.html; the borrowed words. No existing suite
outside the track moves in this round.

**The interface grows, compatibly:** `yearSummaryFacts(year).men[i].handedOverReversed` (a number
where the record may be read the new way, else null); `openYearSummary(year, place)` - `place`
optional, `{ top, month }`, used by the month's door; the memories `YEAR_SUMMARY_BACK` and
`YEAR_SUMMARY_EXPORTING` (memory only, nothing written).

## What it is (as of fix round 1)

Inside «סיכום חודש», straight under its arrows, a button «סיכום שנת 2026» (the year of the month on
screen) opens one dialog: the frame (what was WORKED in the year as recorded, never what was paid; a
pay period across 1 January split by its days; «השנה עוד לא נגמרה» on a year that has not ended),
«השנה במספרים» - «נצבר» and «מקדמות שניתנו» first and larger, «נצבר»'s own sentences under them, then
the days - the twelve months as rows (each a button into «סיכום חודש» on that month, saying what
that month says beside its figures), every man's year, every site's year, «עובדי יוסף גבס» last in a
table of its own, and, in a foot that stays under the thumb, «📊 יצוא השנה» - the accountant's
workbook of the same - and «סגור». A READING: no key, no record, no outbox, no cloud, no backup, no
rescue file is written.

## Files changed (against the base), one line each

| file | what |
|---|---|
| `js/ui/yearsummary.js` | NEW. The words (one frozen block, PROPOSED), the borrowed words, the reading, the drawing, the redraw rule (a moved record marked, read again once), the way back from a month, the workbook and its CSV fallback, the export's in-flight guard. |
| `js/ui/monthsummary.js` | The extraction `monthSummaryRead(key)` → `monthSummaryReadRange(key, range)` (body unchanged) and ONE hook line in `drawMonthSummary`, before any `return`. Nothing else (fix round 1 did not touch it). |
| `index.html` | The door `div.msum-year > button#monthSummaryYear[hidden]` between «סיכום חודש»'s arrows and `#monthSummaryBody` (fix round 1: it was between the body and the fold); the frame `#yearSummaryModal` after `#monthSummaryModal`; `<script src="js/ui/yearsummary.js">` after `monthsummary.js`. |
| `js/app.js` | One line in `render()` after `renderMonthSummaryIfOpen`: `renderYearSummaryIfOpen()` through `typeof`. |
| `js/ui/modal.js` | `MODAL_CLOSERS.yearSummaryModal: () => closeYearSummary()` after the month's row. |
| `sw.js` | `'./js/ui/yearsummary.js'` in SHELL after `monthsummary.js`. |
| `css/design.css` | One commented block straight after the month summary's, inside `@media screen` (fix round 1: the sticky foot, the money first, the em grid floor, the stale mark, the month rows' caveats, the name's weight). |
| `css/large.css` | Block 3: every size, weight and line-height of that block said again under `:root.display-large`, straight after the msum restatements. |
| `package.json` | `test:yearsummary` (appended to `test`), `test:yearsummary-browser` (appended to `test:all`). |
| `tests/yearsummary.test.mjs` | NEW. Node suite, criteria 1-11, revision 2 and fix round 1. |
| `tests/yearsummary.browser.mjs` | NEW. Chromium suite, criteria 12-18 and fix round 1. |
| `tests/screens.mjs` | `'reports - the year on one screen'` (scope `#yearSummaryModal`) after the month's entry, opened through the door, measured once read. |
| `tests/monthsummary.browser.mjs` | MOVED ON PURPOSE (the first build): the frame's Tab walk gains `monthSummaryYear` (8 steps), and its 48px count of the frame's buttons is 7. Nothing else; fix round 1 moved nothing here. |
| `tests/README.md` | Rows `yearsummary` and `yearsummary-browser`. |
| `features/yearsummary/contract.md`, `handoff.md` | The contract as built against, and this. |

`git diff --stat 6ab193d..5430b0f`:

```
 css/design.css                   |   72 ++
 css/large.css                    |   20 +
 features/yearsummary/contract.md |  399 +++++++++
 features/yearsummary/handoff.md  |  588 ++++++++++++++
 index.html                       |   35 +
 js/app.js                        |    3 +
 js/ui/modal.js                   |    2 +
 js/ui/monthsummary.js            |   11 +-
 js/ui/yearsummary.js             | 1111 +++++++++++++++++++++++++
 package.json                     |    6 +-
 sw.js                            |    1 +
 tests/README.md                  |    2 +
 tests/monthsummary.browser.mjs   |   16 +-
 tests/screens.mjs                |   12 +
 tests/yearsummary.browser.mjs    |  900 ++++++++++++++++++++
 tests/yearsummary.test.mjs       | 1667 ++++++++++++++++++++++++++++++++++++++
 16 files changed, 4836 insertions(+), 9 deletions(-)
```

## Every hook in an existing file

1. `js/ui/monthsummary.js` `drawMonthSummary`, right after `const facts = monthSummaryFacts(MONTH_SUMMARY_KEY);`:
   `if (typeof yearSummaryEntryLabel === 'function') yearSummaryEntryLabel(MONTH_SUMMARY_KEY);` -
   before the early return of an empty month, so the door is worded on an empty month too.
2. `js/app.js` `render()`: `if (typeof renderYearSummaryIfOpen === 'function') renderYearSummaryIfOpen();`.
3. `js/ui/modal.js` `MODAL_CLOSERS.yearSummaryModal`.
4. `index.html`: the door, under «סיכום חודש»'s arrows (its `onclick` through `typeof
   openYearSummaryFromMonth === 'function'`; a build without the file leaves it hidden), the frame,
   the script tag.
5. `sw.js` SHELL.
No other track's file is touched; nothing in `js/model`, `js/sync`, `js/state.js`, `js/store.js`,
`js/recovery.js`, `firestore.rules`, `functions`, `firebase.json`, `.github`, `js/ui/reports.js`,
`js/ui/offline.js`, `js/ui/whatsnew.js`, `docs/releases.md` or `CLAUDE.md`.

## Where every figure comes from

All inside `yearSummaryFacts(year)` = `reportReadOnce` around `monthSummaryScope(() => yearSummaryRead(year))`:
the gate answered at most once, `REPORT_RANGE`/`REPORT_WORKERS` put back in a `finally`; nothing
awaits, writes or renders inside; `REPORT_DEDUCTIONS` is never read. No shekel is added, multiplied
or rounded by this file.

| on the screen and in the file | read from |
|---|---|
| a month's row: his own men's worker-site days (`ownSiteDays`, or `siteDays` in a year with no Rima), «עובדים שעבדו», «נצבר», «מקדמות שניתנו», «—» when empty | `monthSummaryRead('YYYY-MM')` for each of the twelve months, in the same scope - «סיכום חודש»'s own numbers |
| a month's row: «תיקון-היפוך» (gate open, non-zero) | the same reading's `reversed` - «סיכום חודש»'s own line |
| a month's row: «החודש עוד לא נגמר.», the unpriced sentence | «סיכום חודש»'s own rule (today inside the month) and its own sentence over the month's `unpriced` |
| «השנה במספרים»: נצבר, מקדמות שניתנו, הוחזר במזומן / תיקון-היפוך (gate open, non-zero), then ימי עבודה, ימי נוכחות, עובדים שעבדו, סה״כ ימי עובד־אתר, בלי עובדי רימא (only with Rima), סה״כ עובדי רימא | `monthSummaryReadRange(String(year), {from: 'YYYY-01-01', to: 'YYYY-12-31'})` - the same functions over the year, NEVER the twelve rows added |
| the unpriced sentence | the year line's `unpriced` through `MONTH_SUMMARY_TEXT.unpriced(count, names)` |
| the not-summed sentence (only under a «נצבר» that is a number) | decided from the unpriced lists: ids with `amount === null` in `payrollRows()` over the year, against each month's `payrollRows()` (`attendanceDays > 0 && amount !== null`) - no month's «נצבר» is read |
| the hours sentence | the year line's `hoursUnpriced` through `MONTH_SUMMARY_REUSED.hoursUnpriced` |
| every man's year: ימי נוכחות, ימי שכר, כפולים and שעות נוספות (where he has one), נצבר («—» when null), מקדמות שניתנו, «לא פעיל» | `payrollRows()` over the year (a year is never anybody's period: `payrollRowsOver` with no carry); `moneyOf(row).gross`, `-moneyOf(row).netted`; hours through `monthSummaryRound`; active from the roster |
| a man's «מתוכן בוטלו בתיקון-היפוך» (gate open, non-zero) | `advanceReversalsFor(schedule, workerId, from, to, 'given')` - js/model/schema.js, the model's own sum by the kind of the entry corrected |
| the reason for a man's «—», after the last man | `MONTH_SUMMARY_TEXT.unpriced` over the men whose `gross` is null |
| every site's year: סה״כ ימי עובד־אתר; בלי עובדי רימא and עובדי רימא on a site Rima has a count on; its months | `invoiceByDate` (billed, and the first and last month of its `byDate`), `invoiceWithoutRima`, `rimaReport`, over the year |
| «עובדי יוסף גבס» table | `yosefGevesReport(schedule, from, to)`, drawn by `monthSummaryCountBlock` |
| money as text | `monthSummaryMoney` (`bidiAmount(moneyText(x))`) |
| the range line | `dateRange(formatFullDate(...))` |

## Every new string (PROPOSED, `YEAR_SUMMARY_TEXT`, pinned word for word in tests/yearsummary.test.mjs)

| key | words |
|---|---|
| title, entry | `` `סיכום שנת ${year}` `` |
| prev / next | «שנה קודמת» / «שנה הבאה» |
| reading | «מחשב את השנה…» - the placeholder of a first reading, and the foot's line while a moved record is read again |
| empty | «אין רישומים בשנה הזאת.» |
| worked | «נצבר לפי הרישום: כל יום עבודה בשנה, לפי השכר שנרשם ליום הזה. זה לא מה ששולם בפועל.» |
| split | «תקופת חשבון שעוברת את 1 בינואר מתחלקת כאן לפי הימים: כל יום נספר בשנה שבה עבדו בו.» (fix round 1: was «תקופת תשלום») |
| inProgress | «השנה עוד לא נגמרה. המספרים הם של מה שנרשם עד עכשיו.» |
| figures | «השנה במספרים» |
| handedOver | «מקדמות שניתנו» |
| handedOverReversed | «מתוכן בוטלו בתיקון-היפוך» (fix round 1, new) |
| notSummed | «עובד שיש לו אפילו יום עבודה אחד בלי שכר יומי לא נכלל בנצבר של כל השנה, ולכן הנצבר של השנה קטן מחיבור החודשים.» (fix round 1: the review's words) |
| months / monthsHint | «חודש אחר חודש» / «לחיצה על חודש פותחת את סיכום החודש.» |
| ownDays | «ימי עובד־אתר בלי עובדי רימא» (fix round 1, new: a month row's bar and the «חודשים» column, in a year Rima has a count in) |
| men / sites | «העובדים בשנה» / «האתרים בשנה» |
| span | `` first === last ? first : `${first}–${last}` `` (month names borrowed) |
| export | «📊 יצוא השנה» |
| exporting | «מכין את הקובץ…» (fix round 1, new) |
| monthsSheet / menSheet / sitesSheet | «חודשים» / «עובדים» / «אתרים» |
| monthColumn | «חודש» - the head of the «חודשים» sheet's first column. |
| stateColumn | «מצב» (fix round 1, new: the «עובדים» column that says who is switched off) |

BORROWED and found in their owners by the suite: `YEAR_SUMMARY_REUSED` (ימי שכר, עובד - reports.js;
לא פעיל - day.js; פעיל - roster.js; «החודש עוד לא נגמר.» - monthsummary.js; the hand-over title and
its four fragments, the CSV sentence, the refusal's fragments and the failure - reports.js), and
read from their owners at run time: `MONTH_SUMMARY_TEXT` / `MONTH_SUMMARY_REUSED` (the month's words,
«סגור»), `NO_RIMA_TITLE`, `RIMA_TOTAL`, `YOSEF_GEVES_TITLE/TOTAL/NOTE/SHEET`,
`LEDGER_KIND_LABELS.repaid/reversed`, `SUMMARY_SHEET`, `SUMMARY_TEXT.made/site/siteDays/rimaCount`,
`EXPORT_CHOICE_DONE/AGAIN`. `RIMA_TITLE` is no longer borrowed (fix round 1). The Hebrew/Arabic
scan (tests/reportnames.test.mjs) is green.

## The deliberate Tab-order change

«סיכום חודש»'s frame: `monthSummaryPrev, monthSummaryNext, monthSummaryYear, monthSummaryFoldLabel,
monthSummarySend, monthSummaryCopy, monthSummaryClose`. tests/monthsummary.browser.mjs moved with it
in the first build (the walk 8 steps; the 48px count 7), each marked «MOVED ON PURPOSE». Fix round 1
moved the door above the month's body - and the order is the same, because the body has nothing
that takes the focus - so nothing there moves again.

## Migrations

None. No key, field path, writer or stored shape is added. Tested instead: the whole disk byte for
byte across the reading, the open, the arrows, a month's row, the door, the export and every way
out (Node and Chromium), on seeded records and on an empty year.

## Tests added (negative ones marked NEG)

`tests/yearsummary.test.mjs` - 239/239 checks: eight seeded records x both gate readings (both
cycles, a cycle change, a raise, Rima, יוסף גבס, a man switched off, ONE unpriced day in March,
advances with agorot, repayments, two fortnights across 1 January closed and corrected after the
close) and an empty year. Among them:
- NEG the year line is not the sum of the rows: the March man out of the year's «נצבר» and only out
  of March's; NEG with his day priced, no sentence.
- NEG the not-summed sentence absent where his only month is the unpriced one - and (fix round 1)
  absent where he was also handed an advance in another month (the «worked» half), and absent under
  a «נצבר» of «—»; absent on a year whose rounded months miss its rounded year by an agora - with a
  spy holding that no month's «נצבר» is read (`no 'agora(' in the source`).
- Every month row: `monthSummaryRead`'s own fields, «סיכום חודש»'s own strings, and (fix round 1)
  its own caveats exactly where the month says them; the corpus holds months in progress and months
  whose «נצבר» leaves a man out.
- NEG no payslip figure (5,760) and no payslip word in either year around a closed fortnight across
  1 January; on 31 December the year reads whole (the month summary's rule), on the 30th not; (fix
  round 1) on 31 December a year after today with records in it is in progress.
- NEG gate shut / unapproved: no «הוחזר במזומן», no «תיקון-היפוך», no man's correction, every other
  figure the same; (fix round 1) a correction of a REPAYMENT never put beside what a man was handed;
  «תיקון טעות» on an advance typed as 1,500 for 150 - the man's 2,000 recorded and 1,350 beside it,
  February's own «תיקון-היפוך», on the glass and in the file, NEG none of it with the gate shut.
- The extraction: `monthSummaryRead` equal to v204's out of Git, byte for byte, every month, both gates.
- The workbook built by the vendored SheetJS and read back cell for cell on five readings (the hand
  record, a seeded year across 1 January and the year after it, a seeded year with the gates shut,
  and the «תיקון טעות» record); NEG nobody unpriced, no such sentence anywhere in the file; NEG the look
  broken, the same cells plain; NEG an empty year writes nothing; the CSV fallback and its sentence;
  NEG a refused download; «שמירה חוזרת» writes again and NEG «הבנתי» writes nothing more; NEG (fix
  round 1) a first export pressed twice while the library is held writes ONE file; every sentence
  cell set right to left by a U+200F at each end and NEG no other cell carrying one.
- NEG a redraw never reads (fake timers): shut, 20 renders ask nothing; (fix round 1) open over an
  unmoved record, 20 renders read, mark and paint nothing and owe no reading, asked before the clock
  moves; three commits 500 ms apart, nothing inside a draw, the figures marked once and painted over
  never, and ONE reading 1.5 s after the last; shut while waiting, nothing read.
- The words: every new one pinned, every borrowed one found in its owner; NEG no Hebrew outside the
  two blocks, no Arabic letter, no writer named, no rate read, no layer named.
- The cost: a season year (40 men) median under 500 ms, the gate never asked on an approved record.

`tests/yearsummary.browser.mjs` - 223/223 checks in Chromium (criteria 12-18 and fix round 1):
the door (worded on an empty month and across December/January, 48px, and on «סיכום חודש»'s first
screen at every phone), «מחשב את השנה…» painted before any figure, the sections in order, the arrows
and the focus, a month's row into «סיכום חודש» and its door back to the same place and row, the
export through recorders (no «שיתוף כתמונה» in the hand-over; «שמירה חוזרת» = `yearSummaryExport` and
never `exportReports`; NEG Escape and the backdrop export nothing; the CSV path; NEG a first export
pressed twice while the library takes 600 ms hands over one file), Escape/backdrop/«סגור», Tab kept
inside, `midEdit()` true while open and false once shut, the disk byte for byte; NEG `render()` over
an unmoved record marks nothing; three commits and an adopted snapshot with NEG nothing read inside
`render()`, the figures kept and marked, ONE reading after 1.5 s, and NEG the reader's place never
moving in 40 ms samples through the wait; the floors on 3 phones x 2 schemes x the large display
on/off through `measureInPage`; the foot on the glass at the first screen, the middle and the last;
a man's name the heaviest thing on his row; doubled text; NEG a season at doubled text on 3 phones
with and without the mode: no run of digits broken where the dialog's line would hold it, nothing
sideways; a season at 4x CPU inside 3 s and its workbook inside 1.5 s.

## Test output (pasted)

### `npm test` chain, suite by suite, on 64429b1

Run one suite at a time (the chain itself stops at its first red, and `test:build` is red on a
feature branch by design). Each line: script, exit code, the suite's own last count line, seconds;
under a red one, its FAIL lines as the suite printed them.

```
chain of 109 suites at 2026-11-19T18:09:51.022Z
test:isolation	exit 0	18/18 checks passed	0s
test:blobs	exit 0	11/11 checks passed	1s
test:build	exit 1	67/69 checks passed	1s
    **FAIL**  and nothing in the shell has changed since  — 7 changed since 6ab193d6: css/design.css, css/large.css, index.html, js/app.js, js/ui/modal.js, js/ui/monthsummary.js, js/ui/yearsummary.js
    **FAIL**  and neither has the worker that names the shelf  — sw.js
test:poison	exit 0	37/37 checks passed	0s
test:merge	exit 0	28/28 checks passed	0s
test:contested	exit 0	73/73 checks passed	16s
test:held	exit 0	83/83 checks passed	4s
test:snapshot-stale	exit 0	16/16 checks passed	2s
test:reports-rules	exit 0	26/26 checks passed	3s
test:finance	exit 0	57/57 checks passed	9s
test:weekly-range	exit 0	21/21 checks passed	0s
test:finance-wording	exit 0	12/12 checks passed	3s
test:weekly-unpriced	exit 0	23/23 checks passed	0s
test:receipt	exit 0	28/28 checks passed	2s
test:data	exit 0	1970/1970 checks passed	46s
test:recovery	exit 0	82/82 checks passed	1s
test:adversarial	exit 0	116/116 checks passed	5s
test:probes	exit 0	35/35 checks passed	7s
test:capacity	exit 0	48/48 checks passed	11s
test:concurrency	exit 0	46/46 checks passed	3s
test:exports	exit 0	112/112 checks passed	1s
test:fence	exit 0	35/35 checks passed	3s
test:fence-ingress	exit 0	43/43 checks passed	0s
test:fence-legacy	exit 0	21/21 checks passed	0s
test:money-history	exit 0	9/9 checks passed	0s
test:money-units	exit 0	21/21 checks passed	0s
test:money-cloud	exit 0	17/17 checks passed	2s
test:money-display	exit 0	4/4 checks passed	0s
test:snapshot-poison	exit 0	82/82 checks passed	2s
test:samefact	exit 0	37/37 checks passed	5s
test:wording	exit 0	37/37 checks passed	0s
test:closure	exit 0	122/122 checks passed	20s
test:closure-echo	exit 0	79/79 checks passed	1s
test:correction	exit 0	33/33 checks passed	0s
test:quarantine	exit 0	82/82 checks passed	2s
test:approval	exit 0	72/72 checks passed	7s
test:repayment	exit 0	240/240 checks passed	4s
test:ledger-ingress	exit 0	167/167 checks passed	0s
test:cas	exit 0	88/88 checks passed	13s
test:status	exit 0	37/37 checks passed	6s
test:money	exit 0	40/40 checks passed	2s
test:money-ingress	exit 0	206/206 checks passed	9s
test:method	exit 0	51/51 checks passed	3s
test:restore	exit 0	51/51 checks passed	0s
test:upgrade	exit 0	48/48 checks passed	2s
test:vehicles	exit 0	86/86 checks passed	2s
test:xlsx	exit 0	104/104 checks passed	1s
test:nonassertions	exit 0	23/23 checks passed	1s
test:labels	exit 0	23/23 checks passed	0s
test:labelcache	exit 0	32/32 checks passed	0s
test:restore-ledger	exit 0	26/26 checks passed	2s
test:roster-upgrade	exit 0	55/55 checks passed	6s
test:roster-race	exit 0	63/63 checks passed	6s
test:exports-proof	exit 0	92/92 checks passed	1s
test:ledger-truth	exit 0	148/148 checks passed	4s
test:races	exit 0	109/109 checks passed	5s
test:overlap-restore	exit 0	117/117 checks passed	20s
test:refute-roster	exit 0	24/24 checks passed	9s
test:refute-restore	exit 0	25/25 checks passed	43s
test:gate-integrity	exit 1	19/20 checks passed	0s
    **FAIL**  no cached file has changed since the three stamps last moved  — 64429b19 «סיכום שנה»: a tile is one column, and a figure's room is th | 69df05b4 «סיכום שנה» fix round 1: what the review found, each with th | fc
test:queuecost	exit 0	18/18 checks passed	6s
test:paycycle	exit 0	43/43 checks passed	0s
test:paycycle-blockers	exit 0	17/17 checks passed	2s
test:paycycle-completion	exit 0	31/31 checks passed	5s
test:crew-controls	exit 0	46/46 checks passed	1s
test:simple-advances	exit 0	66/66 checks passed	1s
test:worker-deletion	exit 0	86/86 checks passed	10s
test:calendar	exit 0	58/58 checks passed	0s
test:reminders	exit 0	48/48 checks passed	0s
test:move-late	exit 0	48/48 checks passed	5s
test:codex-probes	exit 0	17/17 checks passed	0s
test:codex2-probes	exit 0	36/36 checks passed	1s
test:codex3-probes	exit 0	59/59 checks passed	3s
test:rima	exit 0	496/496 checks passed	93s
test:yosefgeves	exit 0	562/562 checks passed	94s
test:seder	exit 0	135/135 checks passed	0s
test:bars-stale	exit 0	60/60 checks passed	0s
test:transport	exit 0	566/566 checks passed	1s
test:transport-share	exit 0	304/304 checks passed	12s
test:oracle	exit 0	121/121 checks passed	43s
test:overpayment	exit 0	105/105 checks passed	5s
test:polish	exit 0	73/73 checks passed	0s
test:daycheck	exit 0	169/169 checks passed	5s
test:journey	exit 0	233/233 checks passed	1s
test:workercard	exit 0	180/180 checks passed	23s
test:monthsummary	exit 0	98/98 checks passed	78s
test:payslips	exit 0	202/202 checks passed	31s
test:find	exit 0	91/91 checks passed	1s
test:whatsnew	exit 0	160/160 checks passed	0s
test:account-view	exit 0	456/456 checks passed	23s
test:usual	exit 0	150/150 checks passed	1s
test:sitecard	exit 0	119/119 checks passed	2s
test:reportsclarity	exit 0	1119/1119 checks passed	3s
test:largetext	exit 0	107/107 checks passed	0s
test:reportnames	exit 0	36/36 checks passed	11s
test:holiday	exit 0	109/109 checks passed	0s
test:undo-stale	exit 0	32/32 checks passed	2s
test:auditfix	exit 0	34/34 checks passed	1s
test:owes	exit 0	190/190 checks passed	70s
test:weeklyclose	exit 0	146/146 checks passed	121s
test:reports-speed	exit 0	159/159 checks passed	262s
test:closeorder	exit 0	22/22 checks passed	0s
test:closuresize	exit 0	13/13 checks passed	20s
test:closerace	exit 0	29/29 checks passed	39s
test:advancereset	exit 0	77/77 checks passed	74s
test:overpaidfix	exit 0	85/85 checks passed	1s
test:xlsxlook	exit 0	293/293 checks passed	16s
test:closereminder	exit 0	107/107 checks passed	18s
test:yearsummary	exit 0	239/239 checks passed	39s
done at 2026-11-19T18:33:35.679Z
```

Expected red, and only these (the contract's "Base"): `test:build` 2 checks - «nothing in the shell
has changed since» and its sw.js line, the stamps not moved on a feature branch - and
`test:gate-integrity` §4 «no cached file has changed since the three stamps last moved».

### Browser suites, one at a time through the two-slot wrapper, on 64429b1

```
browser suites at 2026-11-19T18:09:51Z on 64429b19debaba185519af25685d64e491f8e8d8 (status: '')
tests/yearsummary.browser.mjs	exit 0	223/223 checks passed	52s
tests/monthsummary.browser.mjs	exit 0	88/88 checks passed	20s
tests/largetext.browser.mjs	exit 0	8218/8218 checks passed	747s
tests/design.browser.mjs	exit 0	72/72 checks passed	1359s
tests/smoke.mjs	exit 0	1186/1186 checks passed	371s
tests/mobile.test.mjs	exit 0	1397/1397 checks passed	417s
tests/whatsnew.browser.mjs	exit 0	251/251 checks passed	71s
tests/reports.browser.mjs	exit 0	109/109 checks passed	6s
tests/print.test.mjs	exit 0	94/94 checks passed	29s
done at 2026-11-19T19:01:03Z
```

### On 5430b0f (the test files' own words corrected; no app file changed since 64429b1), run again - all but the year's browser suite

The year's browser suite on `5430b0f`: the first attempt waited forty minutes for one of the machine's two browser slots (four tracks building at once) and its timeout stopped it before the suite began - exit 124, not one line of output, so it is no result. Queued again with room to wait, it had still not got a slot after seventy-five more minutes (one slot held by another track's release gate, the other by another track's verification queue, eleven runs waiting) and was stopped unrun, so this round returns WITHOUT a run of the year's browser suite on `5430b0f`. What stands for it: its run on `64429b1`, 223/223, pasted below under «tests/yearsummary.browser.mjs on 64429b1»; the app bytes are the same on both, and `5430b0f` changed in that file only its header comment and the title of suite 16 - no selector, no expectation, no timing (in `tests/yearsummary.test.mjs` only its header comment, and that suite ran again here, 239/239). The integrator runs it on the merged tree; it takes about a minute once it has a slot.

```
on 5430b0fadb1d1b65157774922f144cdd225c069c status ''
test:isolation	exit 0	18/18 checks passed	0s
test:blobs	exit 0	11/11 checks passed	1s
test:build	exit 1	67/69 checks passed	1s
    **FAIL**  and nothing in the shell has changed since  — 7 changed since 6ab193d6: css/design.css, css/large.css, index.html, js/app.js, js/ui/modal.js, js/ui/monthsummary.js, js/ui/yearsummary.js
    **FAIL**  and neither has the worker that names the shelf  — sw.js
test:nonassertions	exit 0	23/23 checks passed	1s
test:gate.integrity	exit 1	19/20 checks passed	0s
    **FAIL**  no cached file has changed since the three stamps last moved  — 64429b19 «סיכום שנה»: a tile is one column, and a figure's room is th | 69df05b4 «סיכום שנה» fix round 1: what the review found, each with th | fc70a269 
test:yearsummary	exit 0	239/239 checks passed	28s
```

### tests/yearsummary.test.mjs on 5430b0f, its own output (every line but the PASS lines)

```
every month is «סיכום חודש»'s own, and the year's line is the year's - the money gates open
every month is «סיכום חודש»'s own, and the year's line is the year's - the money gates shut
the corpus really held what it claims to
by hand: the year is read over the year, and the man with one unpriced day is out of it
why the year is smaller than its months: decided from the unpriced lists, never from a sum
gates open: a fortnight across 1 January is split by its days, and neither year is its payslip
gates shut: a fortnight across 1 January is split by its days, and neither year is its payslip
the extraction moved nothing: monthSummaryRead is the base's, byte for byte
the gate: no cash handed back and no correction before an approval, and every other figure the same
the workbook: every cell the reading's, «עובדי יוסף גבס» last, right to left
the library missing: the same rows as CSV files, and the export's own sentence
a reading: not one key on the disk moves
a redraw never reads the year: shut it asks nothing, moved it waits for the draws to stop
the words: each new one pinned, each borrowed one found where its owner keeps it
the cost: a season year under the budget, the gate asked at most once and never planned on an approved record
  the season year read in 310, 220, 220 ms (median 220; budget 500)
239/239 checks passed
```

### tests/yearsummary.browser.mjs on 64429b1, its own output (every line but the PASS lines)

```
the door: in «סיכום חודש», worded for the month on screen
the year on the glass, in its order
Escape, the backdrop, «סגור», Tab and the focus
the arrows walk the years and keep the focus; a month's row opens that month
the export: the workbook handed to the browser, or the CSV files, in the export's own words
a reading: the disk is byte for byte what it was
a change under it: nothing read inside render(), the figures gone at once, ONE reading after the draws stop
the glass - 320x568 dark
the glass - 320x568 dark, «תצוגה גדולה»
the glass - 320x568 light
the glass - 320x568 light, «תצוגה גדולה»
the glass - 375x667 dark
the glass - 375x667 dark, «תצוגה גדולה»
the glass - 375x667 light
the glass - 375x667 light, «תצוגה גדולה»
the glass - 440x956 dark
the glass - 440x956 dark, «תצוגה גדולה»
the glass - 440x956 light
the glass - 440x956 light, «תצוגה גדולה»
the glass - 375x667 at doubled text
the glass - 320x568 at doubled text
the figures whole - 320x568, a season at doubled text
the figures whole - 320x568, a season at doubled text, «תצוגה גדולה»
the figures whole - 375x667, a season at doubled text
the figures whole - 375x667, a season at doubled text, «תצוגה גדולה»
the figures whole - 440x956, a season at doubled text
the figures whole - 440x956, a season at doubled text, «תצוגה גדולה»
the budget: a season read at 4x CPU, the frame first, and the workbook handed over
  the season's year on the glass 626 ms after the tap, at 4x CPU (the reading itself 421 ms; 737 ms seen from outside the page; 40 men drawn; budget 3000)
  the season's workbook built and handed over in 22 ms (36941 bytes; budget 1500)
the browser
223/223 checks passed
```

### Before and after, on the glass: `probes/fixcheck.mjs` and `probes/digits.mjs`

Each runs the same page on `eef8c88`'s tree (`[before]`) and on this one (`[feat-yearsummary]`) in
one process (`fixcheck` ran on `d6fe21e`, whose app code differs from the final only in the two
lines of `64429b1`; `digits` ran on `d6fe21e` with `64429b1`'s nowrap and the money at 32px - the
reason the money is now 31px: 375 doubled, «4788515 ₪ 289/285» - and the final run of the suite
holds 375 doubled whole). The last line of `fixcheck` measured a broken figure against the box it
happened to be in - the browser check's FIRST rule - and that rule passed on `eef8c88`'s two tiles to
a row: the very fault. That is why `64429b1` measures against the dialog's room; `digits` is that
rule, before and after.

```
[before] door on the month's first screen: {"top":2295,"visibleBottom":655,"on":false}
[before] export and close on the glass - at the top: [false,false] midway: [false,false]
[before] a man's name heavier than his figures: {"name":["18px","700"],"value":["19px","800"]}
[before] one commit under the reader at 600 - samples: 65 lowest top: 0 samples with no figure: 38 last: {"top":600,"tiles":10}
[before] export pressed twice while the library loads: {"during":{"shut":false,"line":""},"written":["farkad-year_2026.xlsx","farkad-year_2026.xlsx"]}
[before] 440 season doubled - digit runs broken that fit a line of their own: []
[feat-yearsummary] door on the month's first screen: {"top":187,"visibleBottom":655,"on":true}
[feat-yearsummary] export and close on the glass - at the top: [true,true] midway: [true,true]
[feat-yearsummary] a man's name heavier than his figures: {"name":["21px","900"],"value":["19px","800"]}
[feat-yearsummary] one commit under the reader at 600 - samples: 65 lowest top: 600 samples with no figure: 0 last: {"top":600,"tiles":9}
[feat-yearsummary] export pressed twice while the library loads: {"during":{"shut":true,"line":"מכין את הקובץ…"},"written":["farkad-year_2026.xlsx"]}
[feat-yearsummary] 440 season doubled - digit runs broken that fit a line of their own: []
```

```
[before] 320x568 doubled season: measured 277, broken where they fit [], wider than any line ["4788515 ₪ 271/226","446700 ₪ 232/226"], sideways false
[before] 320x568 large doubled season: measured 277, broken where they fit [], wider than any line ["4788515 ₪ 298/226","446700 ₪ 256/226"], sideways false
[before] 375x667 doubled season: measured 277, broken where they fit [], wider than any line [], sideways false
[before] 375x667 large doubled season: measured 277, broken where they fit [], wider than any line ["4788515 ₪ 298/281"], sideways false
[before] 440x956 doubled season: measured 277, broken where they fit ["10373 194/346","4788515 ₪ 271/346","446700 ₪ 232/346"], wider than any line [], sideways false
[before] 440x956 large doubled season: measured 277, broken where they fit ["9450 170/346","10373 213/346","9898 170/346","4788515 ₪ 298/346","446700 ₪ 256/346"], wider than any line [], sideways false
[feat-yearsummary] 320x568 doubled season: measured 272, broken where they fit [], wider than any line ["4788515 ₪ 289/230","446700 ₪ 248/230"], sideways false
[feat-yearsummary] 320x568 large doubled season: measured 272, broken where they fit [], wider than any line ["4788515 ₪ 325/230","446700 ₪ 279/230"], sideways false
[feat-yearsummary] 375x667 doubled season: measured 272, broken where they fit [], wider than any line ["4788515 ₪ 289/285"], sideways false
[feat-yearsummary] 375x667 large doubled season: measured 272, broken where they fit [], wider than any line ["4788515 ₪ 325/285"], sideways false
[feat-yearsummary] 440x956 doubled season: measured 272, broken where they fit [], wider than any line [], sideways false
[feat-yearsummary] 440x956 large doubled season: measured 272, broken where they fit [], wider than any line [], sideways false
```

### The new Node suite on eef8c88's code, and the mutations

On `eef8c88`'s tree (a copy, its suite reading v204's monthsummary.js out of this repository):
**163/239**, the 76 failures each a new or moved check. The mutations (each alone, in a scratch
copy of the new code; the unmutated copy 239/239 first):

```
unmutated copy                                          239/239
M1 the unmoved guard taken out                          236/239  twenty draws of a record that did not move: nothing read, nothing marked ... [0,0,1,0,true,9,false]
M2 the «worked» half of the not-summed rule taken out   237/239  a man who only WORKED in the unpriced month, and was handed an advance in another: no sentence
M3 the not-summed sentence said under a «—»             237/239  under a «נצבר» of «—» the screen says only why it is «—»; and so does «סיכום»
M4 a future year read as finished                       235/239  on 31 December, 2027 - which has records already - is a year still being recorded
M5 the export's in-flight guard taken out               238/239  pressed twice while the library is on its way: ... [2,2,...]
M6 every kind of correction beside the advances         238/239  a correction of a REPAYMENT takes nothing back from what he was handed: [["w_a",100],...]
M7 the month's unpriced caveat dropped                  230/239  seed 62/64/66: the month's own caveats on its row; March's row says ...
M8 a moved record painted over again                    233/239  the figures are marked at once ...; not one reading inside the three draws ...; marked once, painted over never
```

## Pictures, the workbook, the probes

In `/tmp/claude-0/-home-user-farkad/d6a64352-db1a-5c3b-b54d-5c09103f2419/scratchpad/yearsummary-fix1/`
(synthetic names):
- `shots/*.jpg` - from the browser suite on 64429b1: 01-month-door-440-dark.jpg (the door under the
  month's arrows), 02-year-top-440-dark.jpg, 03-year-months-440-dark.jpg, 04-year-men-sites-440-dark.jpg,
  05-year-end-440-dark.jpg, 06-export-handed-440-dark.jpg, 07-year-440-dark.jpg,
  08-year-320-dark-large-top.jpg, 08-year-320-light-large-top.jpg, 09-year-320-dark-large-months.jpg,
  09-year-320-light-large-months.jpg, 10-year-375-dark-doubled-text.jpg,
  11-year-440-season-doubled-text.jpg (the season at doubled text, as it opens; the money below
  it stands whole, held by the suite's digit check).
- `workbook/farkad-year_2026.xlsx` - the year's workbook of a synthetic record with an advance
  corrected by «תיקון טעות», written by the shipped SheetJS from the final code;
  `workbook/farkad-year_2026.as-table.txt` - each sheet read back by SheetJS, laid out as a table.
- `probes/` - `fixcheck.mjs`, `digits.mjs` (above), `sideways.mjs` (what reached past the dialog at
  doubled text: the finding behind `64429b1`), `grid.mjs` (the tiles' columns at 1x, large and
  doubled), with their logs beside them; `before/` is `eef8c88`'s tree and `before-node.log` the new
  Node suite run on it; `mutate.sh` and `mut/` the mutation runs.

## Contract items NOT completed, or done differently - each with the default taken

1. **The refused-download notice is `downloadRefusedNotice`'s words less its last clause**, not the
   function itself. Its last clause sends him to «🖼️ שיתוף כתמונה», which this dialog does not have -
   revision 2's own reason for cutting the hand-over's last sentence. Default: keep the fragments
   (in `YEAR_SUMMARY_REUSED`, each found in reports.js by the suite). To follow the contract to the
   letter instead: `askTell(downloadRefusedNotice(refused, handed))` in `yearSummaryExport`.
2. **«מה חדש»'s `go: 'yearSummary'` is not a key of `WHATSNEW_GO`** at the base, and whatsnew.js draws
   «הראה לי» only for a key it has (whatsnew.js:470). Default for the integrator: `go: 'reportsMenu'`,
   which is exactly `whatsNewReportsMenu(false)` (the v187 «סיכום חודש» item's own) - or add
   `yearSummary: () => whatsNewReportsMenu(false)` to `WHATSNEW_GO`.
3. **«חודש»** is a new header word (the «חודשים» sheet's first column), proposed and pinned.
4. **The workbook's sentences carry U+200F at each end** - not in the contract. Found by opening the
   file in LibreOffice: without them the unpriced sentence printed as «...במסך "עובדים ואתרים". 1 ⚠️».
   Excel shows the marks as nothing. v202's own «סיכום» sentences have the same LibreOffice habit (the
   stop on the wrong side); js/ui/reports.js is read-only here, so they are untouched. Default: keep.
5. **The year's last day reads whole** («השנה עוד לא נגמרה» not said on 31 December) - «סיכום חודש»'s
   pinned rule for a month's last day, kept so December and the year agree. Default: keep. Since fix
   round 1 a year AFTER today with records in it is in progress (it had read as finished).
6. **(fix round 1) The door is under «סיכום חודש»'s arrows**, not between its body and its fold
   (contract «Entry and navigation»): the review measured it 2 to 5.5 screens down. Default: keep.
7. **(fix round 1) «השנה במספרים» leads with the money** («נצבר», «מקדמות שניתנו», then «הוחזר
   במזומן» / «תיקון-היפוך», then the days) where contract §2 lists the days first, and
   **«עובדי יוסף גבס» is no tile** where §2 had it «apart with its note» - it was said twice, and its
   own table (§5) and its own last sheet hold it. «סיכום» follows the same list (and so no longer
   carries the יוסף גבס rows). Default: keep.
8. **(fix round 1) A moved record is MARKED, not covered** - contract «Data» and criterion 16 said
   the placeholder goes «over the figures at once». The figures stay where they are, dimmed, busy,
   the export shut and «מחשב את השנה…» in the foot: none is shown as current and the reader is not
   thrown to the top. The reading rule is the contract's (once, 1.5 s after the last draw). Default:
   keep.
9. **(fix round 1) The foot sticks**, the export's in-flight guard, the way back from a month, the
   month rows' caveats, the men's note row on the glass, the «מצב» column, the man's «מתוכן בוטלו
   בתיקון-היפוך» and the months' «תיקון-היפוך»: additions, each in the fix-round table. The interface
   grows compatibly (`men[i].handedOverReversed`, `openYearSummary(year, place)`).

Everything else in the contract is built and tested as written.

## Known risks

- NOT tried on a real phone. The workbook was NOT opened in a real Excel: it was read back by SheetJS
  (and, in the first build, opened in LibreOffice 24.2 headless, to CSV and PDF).
- The Node season budget (500 ms, the median of three) has little room on this shared machine
  (medians of 268-469 ms over the day, under other agents' load). A red there is the machine first;
  run the suite alone.
- **While a moved record is read again the year is dimmed** (opacity .5) - below 4.5:1 for those
  1.5 s, and for as long as another phone keeps writing (each draw starts the wait again: a run of
  writes keeps it dimmed, not blank, and readable as before for the length of the run). The key is
  the whole record, so a write outside the year dims it too (1.5 s, no jump).
- **At doubled text on the 320px phone** (and the 375px with «תצוגה גדולה») a seven-figure «נצבר» is
  wider than any line the dialog has (280px against 230px at 320; 325 against 285 at 375 with the mode) and is broken, inside its tile;
  the check names it rather than passing it. «סיכום חודש»'s own tiles break a six-figure month's
  «נצבר» the same way at doubled text (`.msum-value`, `overflow-wrap: anywhere`) - that block is the
  month summary's and was not touched.
- **Escape or «סגור» in a month opened from the year lands on «דוחות»**, not back on the year
  (`closeMonthSummary`, js/ui/monthsummary.js). The way back is the month's own door, which now
  returns him to his place.
- **At 320x568 with «תצוגה גדולה» the year's first screen still holds no figure** - the title, the
  arrows, the range and the frame's three sentences fill it. The frame is the contract's, «always
  first»; shortening it is the owner's call.
- Shutting the dialog while the library loads still hands the file over (and asks the hand-over
  question over the screen behind it) - as before.
- LibreOffice's PRINT of «סיכום» cuts the long sentences at column B's edge (on its screen they run
  on into the empty cells): SheetJS CE writes no wrapped text - the same as v202's «סיכום».
- The year is about six month-readings: a record far larger than the 40-man season is read in
  proportion (only ever after a paint, never inside `render()`).
- A sentence copied out of the workbook carries two invisible marks.

## For the integrator

**First, a run this branch owes:** `tests/yearsummary.browser.mjs` has not run on the branch's final
test files (`5430b0f`) - no browser slot in 115 minutes; its last run is `64429b1`'s, 223/223, on
the same app bytes. Run it on the merged tree, through the wrapper (about a minute once it has a slot).

**«מה חדש» (PROPOSED):**
`{ title: 'סיכום שנה', text: 'השנה חודש אחר חודש, לפי עובד ולפי אתר, וקובץ Excel לרואה החשבון - לפי מה שנרשם, לא מה ששולם.', where: 'דוחות ← הפקת דוח ← סיכום חודש ← סיכום שנת …', go: 'reportsMenu' }`
(see item 2 above for `go`; the door is now on «סיכום חודש»'s first screen, so «איפה» holds as written).

**docs/releases.md, the track's part of the v206 entry (proposed text):**

> **«סיכום שנה»** (js/ui/yearsummary.js) - the year as it was WORKED, and the accountant's workbook.
> The year ends in six weeks and in January the accountant asks for it; until now the only way was a
> custom-range export over 01/01-31/12, whose «לתשלום» reads easily as "paid".
>
> Nothing in `js/sync`, `js/model`, `js/state.js`, `js/store.js`, `js/recovery.js`, `firestore.rules`
> or `functions`, and nothing in `js/ui/reports.js`. No key, field path or writer. In
> `js/ui/monthsummary.js` one extraction (`monthSummaryReadRange`, the month's body moved unchanged;
> tests/yearsummary.test.mjs holds `monthSummaryRead` equal to v204's out of Git, byte for byte) and
> one hook line.
>
> **What he sees.** In «סיכום חודש», under its arrows, one button: «סיכום שנת 2026» - the year of the
> month on screen, on an empty month too. It shuts the month and opens the year at its heading,
> «מחשב את השנה…» painted before anything is read. Then, in this order: two sentences that say what
> the figures are - «נצבר לפי הרישום: כל יום עבודה בשנה, לפי השכר שנרשם ליום הזה. זה לא מה ששולם
> בפועל.» and how an account period across 1 January is split, by its days - and on a year that has
> not ended «השנה עוד לא נגמרה»; «השנה במספרים»: «נצבר» and «מקדמות שניתנו» first and larger (and,
> with the gate open, the cash handed back and the corrections), «נצבר»'s own sentences under them,
> then the days (working days, attendance, men, worker-site days, his own and Rima's); «חודש אחר
> חודש» - twelve rows, each one button into «סיכום חודש» on that month, each exactly what that
> month's summary says, its caveats included («החודש עוד לא נגמר.», the men its «נצבר» leaves out), a
> bar in the accent for his own men's worker-site days with the number beside it; «העובדים בשנה» -
> a man's name the heaviest thing on his row, and beside «מקדמות שניתנו» what a «תיקון טעות» of an
> advance took back; «האתרים בשנה» with the months each was billed in; «עובדי יוסף גבס» in its own
> table, last. The arrows walk the years. The export and «סגור» stay under the thumb wherever he is;
> a month's row and that month's door bring him back to where he was.
>
> **What it never says.** «לתשלום», «שולם», a deduction, a balance carried or left at 31/12. A year is
> never anybody's pay period, so the sheet reads it the plain way under either gate. The year's own
> line is read over the year and NEVER added up from the months: a man with ONE worked day that has
> no daily rate has no wage for the whole range (money.js), so he is out of the year's «נצבר» and
> only out of that one month's. He is named by the sheet's own sentence, on the screen and in the
> file, and where such a man was priced in some month one more sentence says why the year is
> smaller than its months - decided from the unpriced lists, never from a sum of shekels.
>
> **The workbook.** «📊 יצוא השנה» hands `farkad-year_2026.xlsx` to the browser (the vendored SheetJS,
> same origin): «סיכום» (the frame first, the money first, «נצבר»'s sentences in the rows right under
> it), «חודשים» (its count headed with what it counts; the months whose «נצבר» leaves a man out named
> under it), «עובדים» (the name cell the bare name; «—» for a wage the year cannot price, and one row
> after the last man naming them; «מצב» where somebody is switched off), «אתרים», and «עובדי יוסף
> גבס» last; right to left, money in v202's format, counts as counts, the look never costing the
> file, the CSV files when the library is missing. Every sentence in it is set right to left by its
> own marks (U+200F at each end). The hand-over is exportReports' own title and words, less the
> sentence that sends him to «🖼️ שיתוף כתמונה» - this dialog has no picture - and «שמירה חוזרת»
> exports the year again; a second press while the first file is being made is nothing.
>
> **The cost.** A season year of 40 men is read only after a paint has shown «מחשב את השנה…»: in Node
> a season year read in 310, 220, 220 ms (median 220; budget 500), and in Chromium at 4x CPU on the glass 626 ms after the tap (budget 3,000),
> its workbook handed over in 22 ms (budget 1,500). A redraw under the open dialog never
> reads: a moved record is marked at once - dimmed, the export shut, «מחשב את השנה…» in the foot -
> and read again ONCE, when the draws have stopped for 1.5 s, where the reader is.
>
> **Tests moved, deliberately:** tests/monthsummary.browser.mjs - the frame's Tab walk gains the door,
> and its 48px count of the frame's buttons is 7. New: tests/yearsummary.test.mjs and
> tests/yearsummary.browser.mjs; tests/screens.mjs gains the screen.
>
> Every word proposed and pinned (tests/yearsummary.test.mjs). Not tried on a real phone; the
> workbook not opened in a real Excel (read back by SheetJS, and opened in LibreOffice 24.2).

**CLAUDE.md, the file list (proposed lines):**

```
    js/ui/yearsummary.js       v206: «סיכום שנה» - one calendar year from «סיכום חודש»'s own door (under its
                               arrows): the twelve months as «סיכום חודש» reads them, caveats included, the
                               year's line over the year (monthSummaryReadRange - never the months added),
                               every man (payrollRows over the year; beside his advances what a תיקון-היפוך
                               of an advance took back, advanceReversalsFor 'given') and every site
                               (invoiceByDate, invoiceWithoutRima, rimaReport), יוסף גבס in its own table, last;
                               a READING that writes no key; a redraw never reads (a moved record is marked
                               and read again once the draws stop for 1.5 s); a foot that sticks; «📊 יצוא
                               השנה», the accountant's workbook, every sentence in it set right to left by its
                               marks, one file a press; every Hebrew word in one block (proposed)
    tests/yearsummary.test.mjs v206: every month row «סיכום חודש»'s own, the year's line not the rows' sum (the
                               man with one unpriced day), the men, the sites, a fortnight across 1 January
                               and neither year its payslip, monthSummaryRead equal to v204's out of Git, the
                               gates, an advance corrected by «תיקון טעות», the workbook read back cell for
                               cell, the disk byte for byte, a redraw that never reads and marks, every word,
                               the cost
    tests/yearsummary.browser.mjs v206 in Chromium: the door on the month's first screen, the paint before the
                               reading, the arrows and the focus, a month's row and the way back, the export
                               through recorders and pressed twice, midEdit(), a commit and an adopted snapshot
                               under it with the reader's place sampled, the foot on the glass, the floors on
                               three phones in both schemes with and without «תצוגה גדולה», doubled text, a
                               season at doubled text with no figure broken where it fits, a season at 4x CPU.
                               NOT a real phone
```
