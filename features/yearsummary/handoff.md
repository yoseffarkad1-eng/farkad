# Handoff — «סיכום שנה» (track `yearsummary`)

- **Branch** `feat-yearsummary`, worktree `/home/user/farkad/.claude/worktrees/feat-yearsummary`.
- **Base** `6ab193d68c960e4a56d947673c282b867acd258f` (origin/main, stamps v204).
- **The app's code is final at** `fc70a26`, and **the tests at** `432f771`; the commit after that
  adds this file only. `432f771` differs from `fc70a26` in `tests/yearsummary.browser.mjs` alone.
- **Where each run ran.** The `npm test` chain and nine browser suites ran on `fc70a26`, from a clean
  tree (`git status --short` empty when each run began). `tests/yearsummary.browser.mjs` ran on
  `fc70a26` and went RED in two checks - both the suite's own expectations, never run before
  (revision 1's words for the not-summed sentence; a spy counted wrongly) - fixed in `432f771` and run
  again there: see the browser section. On `432f771` the suites that read every test file
  (`test:nonassertions`, `test:isolation`) and the ones that read the tree (`test:blobs`, `test:build`,
  `test:gate-integrity`) were run again, and on the final commit once more.
- **Contract** `features/yearsummary/contract.md`, revision 2 (re-read from disk after the build;
  identical to the program's copy).
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

## What it is

Inside «סיכום חודש» a button «סיכום שנת 2026» (the year of the month on screen) opens one dialog:
the frame (what was WORKED in the year as recorded, never what was paid; a pay period across
1 January split by its days; «השנה עוד לא נגמרה» on the current year), «השנה במספרים», the twelve
months as rows (each a button into «סיכום חודש» on that month), every man's year, every site's
year, «עובדי יוסף גבס» last in a table of its own, and «📊 יצוא השנה» - the accountant's workbook
of the same. A READING: no key, no record, no outbox, no cloud, no backup, no rescue file is written.

## Files changed (against the base), one line each

| file | what |
|---|---|
| `js/ui/yearsummary.js` | NEW. The words (one frozen block, PROPOSED), the borrowed words, the reading, the drawing, the redraw rule, the workbook and its CSV fallback. |
| `js/ui/monthsummary.js` | The extraction `monthSummaryRead(key)` → `monthSummaryReadRange(key, range)` (body unchanged) and ONE hook line in `drawMonthSummary`, before any `return`. Nothing else. |
| `index.html` | The door `div.msum-year > button#monthSummaryYear[hidden]` between `#monthSummaryBody` and `.msum-fold`; the frame `#yearSummaryModal` after `#monthSummaryModal`; `<script src="js/ui/yearsummary.js">` after `monthsummary.js`. |
| `js/app.js` | One line in `render()` after `renderMonthSummaryIfOpen`: `renderYearSummaryIfOpen()` through `typeof`. |
| `js/ui/modal.js` | `MODAL_CLOSERS.yearSummaryModal: () => closeYearSummary()` after the month's row. |
| `sw.js` | `'./js/ui/yearsummary.js'` in SHELL after `monthsummary.js`. |
| `css/design.css` | One commented block straight after the month summary's, inside `@media screen`. |
| `css/large.css` | Block 3: every size, weight and line-height of that block said again under `:root.display-large`, straight after the msum restatements. |
| `package.json` | `test:yearsummary` (appended to `test`), `test:yearsummary-browser` (appended to `test:all`). |
| `tests/yearsummary.test.mjs` | NEW. Node suite, criteria 1-11 and revision 2. |
| `tests/yearsummary.browser.mjs` | NEW. Chromium suite, criteria 12-18. |
| `tests/screens.mjs` | `'reports - the year on one screen'` (scope `#yearSummaryModal`) after the month's entry, opened through the door, measured once read. |
| `tests/monthsummary.browser.mjs` | MOVED ON PURPOSE: the frame's Tab walk gains `monthSummaryYear` (8 steps), and its 48px count of the frame's buttons is 7. Nothing else. |
| `tests/README.md` | Rows `yearsummary` and `yearsummary-browser`. |
| `features/yearsummary/contract.md`, `handoff.md` | The contract as built against, and this. |

`git diff --stat 6ab193d..432f771`:

```
 css/design.css                   |   46 ++
 css/large.css                    |   17 +
 features/yearsummary/contract.md |  399 +++++++++++
 index.html                       |   33 +
 js/app.js                        |    3 +
 js/ui/modal.js                   |    2 +
 js/ui/monthsummary.js            |   11 +-
 js/ui/yearsummary.js             |  959 +++++++++++++++++++++++++
 package.json                     |    6 +-
 sw.js                            |    1 +
 tests/README.md                  |    2 +
 tests/monthsummary.browser.mjs   |   16 +-
 tests/screens.mjs                |   12 +
 tests/yearsummary.browser.mjs    |  707 +++++++++++++++++++
 tests/yearsummary.test.mjs       | 1437 ++++++++++++++++++++++++++++++++++++++
 15 files changed, 3642 insertions(+), 9 deletions(-)
```

## Every hook in an existing file

1. `js/ui/monthsummary.js` `drawMonthSummary`, right after `const facts = monthSummaryFacts(MONTH_SUMMARY_KEY);`:
   `if (typeof yearSummaryEntryLabel === 'function') yearSummaryEntryLabel(MONTH_SUMMARY_KEY);` -
   before the early return of an empty month, so the door is worded on an empty month too.
2. `js/app.js` `render()`: `if (typeof renderYearSummaryIfOpen === 'function') renderYearSummaryIfOpen();`.
3. `js/ui/modal.js` `MODAL_CLOSERS.yearSummaryModal`.
4. `index.html`: the door (its `onclick` through `typeof openYearSummaryFromMonth === 'function'`; a build
   without the file leaves it hidden), the frame, the script tag.
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
| «השנה במספרים»: ימי עבודה, ימי נוכחות, עובדים שעבדו, סה״כ ימי עובד־אתר, בלי עובדי רימא (only with Rima), סה״כ עובדי רימא, נצבר, מקדמות שניתנו, הוחזר במזומן / תיקון-היפוך (gate open, non-zero) | `monthSummaryReadRange(String(year), {from: 'YYYY-01-01', to: 'YYYY-12-31'})` - the same functions over the year, NEVER the twelve rows added |
| «סה״כ עובדי יוסף גבס» (apart, with its note) | the year line's `yosef.total` (`yosefGevesReport`) |
| the unpriced sentence | the year line's `unpriced` through `MONTH_SUMMARY_TEXT.unpriced(count, names)` |
| the not-summed sentence | decided from the unpriced lists: ids with `amount === null` in `payrollRows()` over the year, against each month's `payrollRows()` (`attendanceDays > 0 && amount !== null`) - no month's «נצבר» is read |
| the hours sentence | the year line's `hoursUnpriced` through `MONTH_SUMMARY_REUSED.hoursUnpriced` |
| every man's year: ימי נוכחות, ימי שכר, כפולים, שעות נוספות, נצבר («—» when null), מקדמות שניתנו, «לא פעיל» | `payrollRows()` over the year (a year is never anybody's period: `payrollRowsOver` with no carry); `moneyOf(row).gross`, `-moneyOf(row).netted`; hours through `monthSummaryRound`; active from the roster |
| every site's year: סה״כ ימי עובד־אתר, בלי עובדי רימא, רישום לרימא, its months | `invoiceByDate` (billed, and the first and last month of its `byDate`), `invoiceWithoutRima`, `rimaReport`, over the year |
| «עובדי יוסף גבס» table | `yosefGevesReport(schedule, from, to)`, drawn by `monthSummaryCountBlock` |
| money as text | `monthSummaryMoney` (`bidiAmount(moneyText(x))`) |
| the range line | `dateRange(formatFullDate(...))` |

## Every new string (PROPOSED, `YEAR_SUMMARY_TEXT`, pinned word for word in tests/yearsummary.test.mjs)

| key | words |
|---|---|
| title, entry | `` `סיכום שנת ${year}` `` |
| prev / next | «שנה קודמת» / «שנה הבאה» |
| reading | «מחשב את השנה…» |
| empty | «אין רישומים בשנה הזאת.» |
| worked | «נצבר לפי הרישום: כל יום עבודה בשנה, לפי השכר שנרשם ליום הזה. זה לא מה ששולם בפועל.» |
| split | «תקופת תשלום שעוברת את 1 בינואר מתחלקת כאן לפי הימים: כל יום נספר בשנה שבה עבדו בו.» |
| inProgress | «השנה עוד לא נגמרה. המספרים הם של מה שנרשם עד עכשיו.» |
| figures | «השנה במספרים» |
| handedOver | «מקדמות שניתנו» |
| notSummed | «עובד שאין לו שכר יומי אפילו ביום אחד לא נכלל בנצבר של כל השנה, ולכן הנצבר של השנה קטן מחיבור החודשים.» |
| months / monthsHint | «חודש אחר חודש» / «לחיצה על חודש פותחת את סיכום החודש.» |
| men / sites | «העובדים בשנה» / «האתרים בשנה» |
| span | `` first === last ? first : `${first}–${last}` `` (month names borrowed) |
| export | «📊 יצוא השנה» |
| monthsSheet / menSheet / sitesSheet | «חודשים» / «עובדים» / «אתרים» |
| monthColumn | «חודש» - the head of the «חודשים» sheet's first column. NOT in the contract's list: new, proposed, pinned. |

BORROWED and found in their owners by the suite: `YEAR_SUMMARY_REUSED` (ימי שכר, עובד - reports.js;
לא פעיל - day.js; the hand-over title and its four fragments, the CSV sentence, the refusal's
fragments and the failure - reports.js), and read from their owners at run time: `MONTH_SUMMARY_TEXT`
/ `MONTH_SUMMARY_REUSED` (the month's words, «סגור»), `NO_RIMA_TITLE`, `RIMA_TOTAL`, `RIMA_TITLE`,
`YOSEF_GEVES_TITLE/TOTAL/NOTE/SHEET`, `LEDGER_KIND_LABELS.repaid/reversed`, `SUMMARY_SHEET`,
`SUMMARY_TEXT.made/site/siteDays`, `EXPORT_CHOICE_DONE/AGAIN`. The Hebrew/Arabic scan
(tests/reportnames.test.mjs) is green.

## The deliberate Tab-order change

«סיכום חודש»'s frame: `monthSummaryPrev, monthSummaryNext, monthSummaryYear, monthSummaryFoldLabel,
monthSummarySend, monthSummaryCopy, monthSummaryClose` - the door in its document place between the
body and the fold. tests/monthsummary.browser.mjs moves with it (the walk 8 steps; the 48px count 7),
each marked «MOVED ON PURPOSE». No other existing expectation moved.

## Migrations

None. No key, field path, writer or stored shape is added. Tested instead: the whole disk byte for
byte across the reading, the open, the arrows, a month's row, the door, the export and every way
out (Node and Chromium), on seeded records and on an empty year.

## Tests added (negative ones marked NEG)

`tests/yearsummary.test.mjs` - 199/199 checks: eight seeded records x both gate readings (both
cycles, a cycle change, a raise, Rima, יוסף גבס, a man switched off, ONE unpriced day in March,
advances with agorot, repayments, two fortnights across 1 January closed and corrected after the
close) and an empty year. Among them:
- NEG the year line is not the sum of the rows: the March man out of the year's «נצבר» and only out
  of March's; NEG with his day priced, no sentence.
- NEG the not-summed sentence absent where his only month is the unpriced one, and absent on a year
  whose rounded months miss its rounded year by an agora - with a spy holding that no month's «נצבר»
  is read (`no 'agora(' in the source`).
- NEG no payslip figure (5,760) and no payslip word in either year around a closed fortnight across
  1 January; on 31 December the year reads whole (the month summary's rule), on the 30th not.
- NEG gate shut / unapproved: no «הוחזר במזומן», no «תיקון-היפוך», every other figure the same.
- The extraction: `monthSummaryRead` equal to v204's out of Git, byte for byte, every month, both gates.
- The workbook built by the vendored SheetJS and read back cell for cell; NEG nobody unpriced, no such
  sentence anywhere in the file; NEG the look broken, the same cells plain; NEG an empty year writes
  nothing; the CSV fallback and its sentence; NEG a refused download; «שמירה חוזרת» writes again and
  NEG «הבנתי» writes nothing more; every sentence cell set right to left by a U+200F at each end and
  NEG no other cell carrying one, no unmarked cell opening with ⚠️/* or closing on a stop.
- NEG a redraw never reads (fake timers): shut, 20 renders ask nothing; three commits 500 ms apart,
  nothing inside a draw and ONE reading 1.5 s after the last; shut while waiting, nothing read.
- The cost: a season year (40 men) median under 500 ms, the gate never asked on an approved record.

Mutations run against the suite (each restored; the code was never committed mutated). Earlier, on
the suite as it then stood: a synchronous read inside the redraw (185/191), notSummed decided from
summed shekels (188/191), the notes moved away from «נצבר» (186/191). On the final suite, in a scratch
copy of `432f771` whose suite reads v204's monthsummary.js from a file (the copy has no Git), the
unmutated copy 199/199 first: the sentence marks taken out 172/199, the switched-off man's name not
isolated 195/199, the year's last day read as in progress 197/199.

`tests/yearsummary.browser.mjs` - 169/169 checks in Chromium (criteria 12-18): the door
(worded on an empty month and across December/January, 48px), «מחשב את השנה…» painted before any
figure, the sections in order, the arrows and the focus, a month's row into «סיכום חודש», the export
through recorders (no «שיתוף כתמונה» in the hand-over; «שמירה חוזרת» = `yearSummaryExport` and never
`exportReports`; NEG Escape and the backdrop export nothing; the CSV path), Escape/backdrop/«סגור»,
Tab kept inside, `midEdit()` true while open and false once shut, the disk byte for byte, three
commits and an adopted snapshot with NEG nothing read inside `render()` and ONE reading after 1.5 s,
the place kept; the floors on 3 phones x 2 schemes x the large display on/off through `measureInPage`,
doubled text; a season at 4x CPU inside 3 s and its workbook inside 1.5 s.

## Test output (pasted)

### `npm test` chain, suite by suite, on fc70a26

Run one suite at a time (the chain itself stops at its first red, and `test:build` is red on a
feature branch by design). Each line: script, exit code, the suite's own last count line, seconds;
under a red one, its FAIL lines as the suite printed them.

```
chain of 109 suites at 2026-11-19T15:39:53.754Z
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
test:finance	exit 0	57/57 checks passed	8s
test:weekly-range	exit 0	21/21 checks passed	0s
test:finance-wording	exit 0	12/12 checks passed	2s
test:weekly-unpriced	exit 0	23/23 checks passed	0s
test:receipt	exit 0	28/28 checks passed	2s
test:data	exit 0	1970/1970 checks passed	46s
test:recovery	exit 0	82/82 checks passed	1s
test:adversarial	exit 0	116/116 checks passed	5s
test:probes	exit 0	35/35 checks passed	7s
test:capacity	exit 0	48/48 checks passed	13s
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
test:wording	exit 0	37/37 checks passed	1s
test:closure	exit 0	122/122 checks passed	22s
test:closure-echo	exit 0	79/79 checks passed	1s
test:correction	exit 0	33/33 checks passed	0s
test:quarantine	exit 0	82/82 checks passed	2s
test:approval	exit 0	72/72 checks passed	7s
test:repayment	exit 0	240/240 checks passed	5s
test:ledger-ingress	exit 0	167/167 checks passed	0s
test:cas	exit 0	88/88 checks passed	13s
test:status	exit 0	37/37 checks passed	6s
test:money	exit 0	40/40 checks passed	2s
test:money-ingress	exit 0	206/206 checks passed	10s
test:method	exit 0	51/51 checks passed	3s
test:restore	exit 0	51/51 checks passed	0s
test:upgrade	exit 0	48/48 checks passed	2s
test:vehicles	exit 0	86/86 checks passed	2s
test:xlsx	exit 0	104/104 checks passed	2s
test:nonassertions	exit 0	23/23 checks passed	1s
test:labels	exit 0	23/23 checks passed	0s
test:labelcache	exit 0	32/32 checks passed	0s
test:restore-ledger	exit 0	26/26 checks passed	2s
test:roster-upgrade	exit 0	55/55 checks passed	7s
test:roster-race	exit 0	63/63 checks passed	6s
test:exports-proof	exit 0	92/92 checks passed	2s
test:ledger-truth	exit 0	148/148 checks passed	6s
test:races	exit 0	109/109 checks passed	5s
test:overlap-restore	exit 0	117/117 checks passed	20s
test:refute-roster	exit 0	24/24 checks passed	9s
test:refute-restore	exit 0	25/25 checks passed	43s
test:gate-integrity	exit 1	19/20 checks passed	0s
    **FAIL**  no cached file has changed since the three stamps last moved  — fc70a269 «סיכום שנה»: the workbook's sentences are set right to left  | a27383ba «סיכום שנה»: a switched-off man's cell in «עובדים» isolates  | 08
test:queuecost	exit 0	18/18 checks passed	7s
test:paycycle	exit 0	43/43 checks passed	0s
test:paycycle-blockers	exit 0	17/17 checks passed	2s
test:paycycle-completion	exit 0	31/31 checks passed	5s
test:crew-controls	exit 0	46/46 checks passed	1s
test:simple-advances	exit 0	66/66 checks passed	1s
test:worker-deletion	exit 0	86/86 checks passed	10s
test:calendar	exit 0	58/58 checks passed	0s
test:reminders	exit 0	48/48 checks passed	0s
test:move-late	exit 0	48/48 checks passed	5s
test:codex-probes	exit 0	17/17 checks passed	1s
test:codex2-probes	exit 0	36/36 checks passed	1s
test:codex3-probes	exit 0	59/59 checks passed	3s
test:rima	exit 0	496/496 checks passed	92s
test:yosefgeves	exit 0	562/562 checks passed	95s
test:seder	exit 0	135/135 checks passed	0s
test:bars-stale	exit 0	60/60 checks passed	0s
test:transport	exit 0	566/566 checks passed	1s
test:transport-share	exit 0	304/304 checks passed	13s
test:oracle	exit 0	121/121 checks passed	78s
test:overpayment	exit 0	105/105 checks passed	9s
test:polish	exit 0	73/73 checks passed	0s
test:daycheck	exit 0	169/169 checks passed	9s
test:journey	exit 0	233/233 checks passed	1s
test:workercard	exit 0	180/180 checks passed	34s
test:monthsummary	exit 0	98/98 checks passed	133s
test:payslips	exit 0	202/202 checks passed	32s
test:find	exit 0	91/91 checks passed	1s
test:whatsnew	exit 0	160/160 checks passed	1s
test:account-view	exit 0	456/456 checks passed	26s
test:usual	exit 0	150/150 checks passed	2s
test:sitecard	exit 0	119/119 checks passed	4s
test:reportsclarity	exit 0	1119/1119 checks passed	4s
test:largetext	exit 0	107/107 checks passed	0s
test:reportnames	exit 0	36/36 checks passed	14s
test:holiday	exit 0	109/109 checks passed	0s
test:undo-stale	exit 0	32/32 checks passed	1s
test:auditfix	exit 0	34/34 checks passed	1s
test:owes	exit 0	190/190 checks passed	68s
test:weeklyclose	exit 0	146/146 checks passed	124s
test:reports-speed	exit 0	159/159 checks passed	206s
test:closeorder	exit 0	22/22 checks passed	0s
test:closuresize	exit 0	13/13 checks passed	16s
test:closerace	exit 0	29/29 checks passed	38s
test:advancereset	exit 0	77/77 checks passed	62s
test:overpaidfix	exit 0	85/85 checks passed	1s
test:xlsxlook	exit 0	293/293 checks passed	13s
test:closereminder	exit 0	107/107 checks passed	17s
test:yearsummary	exit 0	199/199 checks passed	33s
done at 2026-11-19T16:04:29.536Z
```

Expected red, and only these (the contract's "Base"): `test:build` 2 checks - «nothing in the shell
has changed since» and its sw.js line, the stamps not moved on a feature branch - and
`test:gate-integrity` §4 «no cached file has changed since the three stamps last moved».

### On 432f771, the suites that read every test file or the tree, run again

```
on 432f771, status ''
test:isolation	exit 0	18/18 checks passed
test:blobs	exit 0	11/11 checks passed
test:build	exit 1	67/69 checks passed
    **FAIL**  and nothing in the shell has changed since  — 7 changed since 6ab193d6: css/design.css, css/large.css, index.html, js/app.js, js/ui/modal.js, js/ui/monthsummary.js, js/ui/yearsummary.js
    **FAIL**  and neither has the worker that names the shelf  — sw.js
test:nonassertions	exit 0	23/23 checks passed
test:gate-integrity	exit 1	19/20 checks passed
    **FAIL**  no cached file has changed since the three stamps last moved  — fc70a269 «סיכום שנה»: the workbook's sentences are set right to left  | a27383ba «סיכום שנה»: a switched-off man's cell in …
```

### Browser suites, one at a time through the two-slot wrapper, on fc70a26

```
browser suites at 2026-11-19T15:39:53Z on fc70a26959b0c5afe3f2cd1009580f05b009b2c1 (status: '')
tests/yearsummary.browser.mjs	exit 1	167/169 checks passed	782s
    **FAIL**  the man with one day without a rate is named, and the year says why its rows do not add up  — ["⚠️ 1 עובדים בלי שכר יומי, ולכן הסכום חסר אותם: דוגמה דלת. הוסף להם שכר במסך \"עובדים ו…
    **FAIL**  «הבנתי» shuts the question, the year still open, the focus back on the export, and nothing more written  — [false,true,"yearSummaryExport",[4,{"year":3,"reports":0}]] !== [false,true,"yearSummaryExport",[4,{"year":1,"reports":0}]]
tests/monthsummary.browser.mjs	exit 0	88/88 checks passed	21s
tests/largetext.browser.mjs	exit 0	8218/8218 checks passed	782s
tests/mobile.test.mjs	exit 0	1397/1397 checks passed	483s
tests/design.browser.mjs	exit 0	72/72 checks passed	10s
tests/smoke.mjs	exit 0	1186/1186 checks passed	380s
tests/reports.browser.mjs	exit 0	109/109 checks passed	4s
tests/payslips.browser.mjs	exit 0	132/132 checks passed	14s
tests/whatsnew.browser.mjs	exit 0	251/251 checks passed	73s
tests/print.test.mjs	exit 0	94/94 checks passed	28s
done at 2026-11-19T16:22:50Z
```

### tests/yearsummary.test.mjs on 432f771, run alone, its own output (every line but the PASS lines)

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
  the season year read in 600, 317, 282 ms (median 317; budget 500)
199/199 checks passed
```

### tests/yearsummary.browser.mjs, its own output (every line but the PASS lines)

On `fc70a26` - RED, 2 checks, both expectations of the suite itself (fixed in `432f771`):

```
the door: in «סיכום חודש», worded for the month on screen
the year on the glass, in its order
**FAIL**  the man with one day without a rate is named, and the year says why its rows do not add up  — ["⚠️ 1 עובדים בלי שכר יומי, ולכן הסכום חסר אותם: דוגמה דלת. הוסף להם שכר במסך \"עובדים ואתרים\".","עובד שאין לו שכר יומי אפילו ביום אחד לא נכלל בנצבר של כל השנה, ולכן הנצבר של השנה קטן מחיבור החודשים.",true] !== ["⚠️ 1 עובדים בלי שכר יומי, ולכן הסכום חסר אותם: דוגמה דלת. הוסף להם שכר במסך \"עובדים ואתרים\".","הנצבר של השנה מחושב על כל השנה ולא מחיבור החודשים, ולכן הוא שונה כאן מחיבור החודשים.",true]
Escape, the backdrop, «סגור», Tab and the focus
the arrows walk the years and keep the focus; a month's row opens that month
the export: the workbook handed to the browser, or the CSV files, in the export's own words
**FAIL**  «הבנתי» shuts the question, the year still open, the focus back on the export, and nothing more written  — [false,true,"yearSummaryExport",[4,{"year":3,"reports":0}]] !== [false,true,"yearSummaryExport",[4,{"year":1,"reports":0}]]
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
the budget: a season read at 4x CPU, the frame first, and the workbook handed over
  the season's year on the glass 589 ms after the tap, at 4x CPU (the reading itself 358 ms; 689 ms seen from outside the page; 40 men drawn; budget 3000)
  the season's workbook built and handed over in 63 ms (37183 bytes; budget 1500)
the browser
167/169 checks passed
failed:
  the year on the glass, in its order :: the man with one day without a rate is named, and the year says why its rows do not add up  — ["⚠️ 1 עובדים בלי שכר יומי, ולכן הסכום חסר אותם: דוגמה דלת. הוסף להם שכר במסך \"עובדים ואתרים\".","עובד שאין לו שכר יומי אפילו ביום אחד לא נכלל בנצבר של כל השנה, ולכן הנצבר של השנה קטן מחיבור החודשים.",true] !== ["⚠️ 1 עובדים בלי שכר יומי, ולכן הסכום חסר אותם: דוגמה דלת. הוסף להם שכר במסך \"עובדים ואתרים\".","הנצבר של השנה מחושב על כל השנה ולא מחיבור החודשים, ולכן הוא שונה כאן מחיבור החודשים.",true]
  the export: the workbook handed to the browser, or the CSV files, in the export's own words :: «הבנתי» shuts the question, the year still open, the focus back on the export, and nothing more written  — [false,true,"yearSummaryExport",[4,{"year":3,"reports":0}]] !== [false,true,"yearSummaryExport",[4,{"year":1,"reports":0}]]
```

On `432f771`, after the fix:

```
on 432f7713759ffc5044dbc2d1f5bb1a7eaeea5ecc status ''
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
the budget: a season read at 4x CPU, the frame first, and the workbook handed over
  the season's year on the glass 609 ms after the tap, at 4x CPU (the reading itself 401 ms; 776 ms seen from outside the page; 40 men drawn; budget 3000)
  the season's workbook built and handed over in 31 ms (37183 bytes; budget 1500)
the browser
169/169 checks passed
exit 0
```

## Pictures and the workbook

In `/tmp/claude-0/-home-user-farkad/d6a64352-db1a-5c3b-b54d-5c09103f2419/scratchpad/feat-yearsummary/`
(synthetic names):
- `shots/*.jpg` - from the browser suite on 432f771: 01-month-door-440-dark.jpg, 02-year-top-440-dark.jpg, 03-year-months-440-dark.jpg, 04-year-men-sites-440-dark.jpg, 05-year-end-440-dark.jpg, 06-export-handed-440-dark.jpg, 07-year-440-dark.jpg, 08-year-320-dark-large-top.jpg, 08-year-320-light-large-top.jpg, 09-year-320-dark-large-months.jpg, 09-year-320-light-large-months.jpg, 10-year-375-dark-doubled-text.jpg
- `farkad-year_2026.xlsx` - the year's workbook of a synthetic record, written by the shipped SheetJS
  from the code at 432f771; `farkad-year_2026.as-table.txt` - each sheet read back by SheetJS and
  laid out as a table.
- `lo/out/*.csv` - the same file opened by LibreOffice 24.2 (headless) and each of its five sheets
  saved as CSV; `lo/pdf/farkad-year_2026.pdf` and `lo/pdf/libreoffice-page-*.jpg` - LibreOffice's
  print of it, right to left, every sentence in its order.

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
   pinned rule for a month's last day, kept so December and the year agree. Default: keep.

Everything else in the contract is built and tested as written.

## Known risks

- NOT tried on a real phone. The workbook was NOT opened in a real Excel: it was read back by SheetJS
  and opened in LibreOffice 24.2 (headless, to CSV and PDF) only.
- The Node season budget (500 ms, the median of three) has little room on this shared machine:
  single readings 223-600 ms and medians 268-469 ms over this day's runs, under other agents' load.
  A red there is the machine first; run the suite alone.
- «📊 יצוא השנה» has no double-press guard, as exportReports has none: two quick presses hand over two
  files; shutting the dialog while the library loads still hands the file over.
- LibreOffice's PRINT of «סיכום» cuts the long sentences at column B's edge (on its screen they run
  on into the empty cells): SheetJS CE writes no wrapped text - the same as v202's «סיכום».
- The year is about six month-readings: a record far larger than the 40-man season is read in
  proportion (only ever after a paint, never inside `render()`).
- A sentence copied out of the workbook carries two invisible marks.

## For the integrator

**«מה חדש» (PROPOSED):**
`{ title: 'סיכום שנה', text: 'השנה חודש אחר חודש, לפי עובד ולפי אתר, וקובץ Excel לרואה החשבון - לפי מה שנרשם, לא מה ששולם.', where: 'דוחות ← הפקת דוח ← סיכום חודש ← סיכום שנת …', go: 'reportsMenu' }`
(see item 2 above for `go`).

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
> **What he sees.** In «סיכום חודש», under the month, one button: «סיכום שנת 2026» - the year of the
> month on screen, on an empty month too. It shuts the month and opens the year at its heading,
> «מחשב את השנה…» painted before anything is read. Then, in this order: two sentences that say what
> the figures are - «נצבר לפי הרישום: כל יום עבודה בשנה, לפי השכר שנרשם ליום הזה. זה לא מה ששולם
> בפועל.» and how a pay period across 1 January is split, by its days - and on the current year
> «השנה עוד לא נגמרה»; «השנה במספרים» (working days, attendance, men, worker-site days, his own and
> Rima's, «נצבר», «מקדמות שניתנו», and with the gate open the cash handed back and the corrections);
> «עובדי יוסף גבס» apart with its note; «חודש אחר חודש» - twelve rows, each one button into «סיכום
> חודש» on that month, each exactly what that month's summary says, a bar in the accent for his own
> men's worker-site days with the number beside it; «העובדים בשנה»; «האתרים בשנה» with the months
> each was billed in; «עובדי יוסף גבס» in its own table, last. The arrows walk the years; the next
> one is not there on the current year.
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
> same origin): «סיכום» (the frame first, the figures, «נצבר»'s sentences in the rows right under it),
> «חודשים», «עובדים» («—» for a wage the year cannot price, and one row after the last man naming
> them), «אתרים», and «עובדי יוסף גבס» last; right to left, money in v202's format, counts as
> counts, the look never costing the file, the CSV files when the library is missing. Every
> sentence in it is set right to left by its own marks (U+200F at each end): opened in LibreOffice
> without them, the unpriced sentence printed «...במסך "עובדים ואתרים". 1 ⚠️». The hand-over is
> exportReports' own title and words, less the sentence that sends him to «🖼️ שיתוף כתמונה» - this
> dialog has no picture - and «שמירה חוזרת» exports the year again.
>
> **The cost.** A season year of 40 men is read only after a paint has shown «מחשב את השנה…»: in Node
> 223-600 ms a reading on a shared machine (the budget is a median of three under 500 ms), and in
> Chromium at 4x CPU on the glass 609 ms after the tap (budget 3,000), its workbook handed over
> in 31 ms (budget 1,500). A redraw under the open dialog never reads: a moved record takes
> the figures off at once and is read again ONCE, when the draws have stopped for 1.5 s, the place
> kept.
>
> **Tests moved, deliberately:** tests/monthsummary.browser.mjs - the frame's Tab walk gains the door,
> and its 48px count of the frame's buttons is 7. New: tests/yearsummary.test.mjs and
> tests/yearsummary.browser.mjs; tests/screens.mjs gains the screen.
>
> Every word proposed and pinned (tests/yearsummary.test.mjs). Not tried on a real phone; the
> workbook not opened in a real Excel (read back by SheetJS, and opened in LibreOffice 24.2).

**CLAUDE.md, the file list (proposed lines):**

```
    js/ui/yearsummary.js       v206: «סיכום שנה» - one calendar year from «סיכום חודש»'s own door: the twelve
                               months as «סיכום חודש» reads them, the year's line over the year
                               (monthSummaryReadRange - never the months added), every man (payrollRows over
                               the year) and every site (invoiceByDate, invoiceWithoutRima, rimaReport), יוסף
                               גבס apart and last; a READING that writes no key; a redraw never reads (a moved
                               record is read again once the draws stop for 1.5 s); «📊 יצוא השנה», the
                               accountant's workbook, every sentence in it set right to left by its marks;
                               every Hebrew word in one block (proposed)
    tests/yearsummary.test.mjs v206: every month row «סיכום חודש»'s own, the year's line not the rows' sum (the
                               man with one unpriced day), the men, the sites, a fortnight across 1 January
                               and neither year its payslip, monthSummaryRead equal to v204's out of Git, the
                               gates, the workbook read back cell for cell, the disk byte for byte, a redraw
                               that never reads, every word, the cost
    tests/yearsummary.browser.mjs v206 in Chromium: the door, the paint before the reading, the arrows and the
                               focus, a month's row, the export through recorders, midEdit(), a commit and an
                               adopted snapshot under it, the floors on three phones in both schemes with and
                               without «תצוגה גדולה», doubled text, a season at 4x CPU. NOT a real phone
```
