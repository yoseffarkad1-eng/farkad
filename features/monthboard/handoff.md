# Handoff — «לוח חודשי»: the crew's month on one board (track `monthboard`, v206 program)

- Branch: `feat-monthboard` (worktree `/home/user/farkad/.claude/worktrees/feat-monthboard`)
- **Code SHA, on which every suite below ran: `3b46cae2664ce8951127adf23ebf4d8191cd2e1a`.** The
  commit that adds this file adds nothing else (`git diff 3b46cae HEAD --stat` names
  `features/monthboard/handoff.md` alone).
- Base: `6ab193d68c960e4a56d947673c282b867acd258f` (origin/main, stamps v204).
- Build stamps NOT moved: `farkad-build`, `APP_VERSION` and `VERSION` still say v204 - the
  integrator moves them with v206.
- Contract: `features/monthboard/contract.md`, revision 2 - sha256 `a13ff333…`, byte for byte
  the program's copy, re-read from disk before this report and reconciled (below).
- Not pushed, no PR, no other branch or worktree touched.

Commits, base → code SHA:

- `4402f72` features/monthboard: the contract of «לוח חודשי», as written for the v206 program
- `f11dc41` «לוח חודשי»: the crew's month on one board, a third mode of the week tab
- `4b24381` tests/monthboard.test.mjs: the board cannot be different from what it counts
- `08604b1` features/monthboard: the contract's revision 2, after the critic
- `d177721` «לוח חודשי»: the contract's revision 2 - the reader's place kept, «בלי עובדי רימא» off paper by its kind
- `319326d` tests/monthboard.browser.mjs, and the board in tests/screens.mjs and the shared pictures
- `3b46cae` «לוח חודשי»: a Saturday nobody worked opens on the Friday, the arrows say the month, the paper keeps its grounds - and eleven mutants

## What it is

A third mode of the week tab (`js/ui/monthboard.js`). Its door is the week grid's corner cell:
`button#monthBoardDoor` «לוח חודשי», where «עובדים / ימים» stood - the words stay for paper, and
the header row is no taller for it (measured at three phones x two schemes x the large display).
The board: one row per man (every active man, and a man who is not active only in a month he
worked, marked «לא פעיל»), one column per date of the calendar month (a Saturday only when
something was recorded on it), each cell the week's own cell (the site's colour, its letter in
white, ● a doubled day, + extra hours, «נעדר» an absence), his «נוכחות» at the row's end,
«סה"כ עובדים» per date at the foot, and «רישום לרימא» and «עובדי יוסף גבס» each apart, with its
note, in no total. «חודש קודם» / «חודש הבא» step the months and «החודש» comes back; «אתר» narrows
it to one site, and the foot is then the invoice's own rows for it - «בלי עובדי רימא» (on the
screen only), «רישום לרימא», «סה״כ ימי עובד־אתר» - with יוסף גבס apart. A cell or a date opens that
day; a name opens his card. It opens on today's column (on a Saturday nothing was recorded on,
the Friday before it), and a commit or an adopted snapshot leaves the reader where he was: the
grid's scroll, the page's and the focus. «🖨️ הדפסה» prints it on A4 landscape; «🖼️ שיתוף
כתמונה» shares it as a picture read off the board's DOM. It writes nothing and prices nothing.

## Files changed (`git diff --stat 6ab193d 3b46cae`)

```
 css/app.css                     |   52 ++
 css/design.css                  |  119 ++++
 css/large.css                   |   38 ++
 features/monthboard/contract.md |  382 +++++++++++++
 index.html                      |    6 +
 js/ui/monthboard.js             | 1068 +++++++++++++++++++++++++++++++++++
 js/ui/printout.js               |    2 +
 js/ui/week.js                   |   18 +-
 package.json                    |    6 +-
 sw.js                           |    1 +
 tests/README.md                 |    2 +
 tests/largetext.browser.mjs     |   15 +-
 tests/monthboard.browser.mjs    |  730 ++++++++++++++++++++++++
 tests/monthboard.test.mjs       | 1193 +++++++++++++++++++++++++++++++++++++++
 tests/screens.mjs               |    9 +
 15 files changed, 3632 insertions(+), 9 deletions(-)
```

- `js/ui/monthboard.js` (new): the words, `monthBoardFacts` (pure: no DOM, no storage, the
  `today` todayStr() answers), the drawing, the reader's place kept across a redraw, the door,
  `openMonthBoard`, the ways out, `readMonthPrintout`, `planMonthPrintout`. Runs nothing at load.
- `js/ui/week.js`: the three hooks the contract allows, nothing else.
- `js/ui/printout.js`: the two dispatch lines of `printoutImage`, nothing else.
- `index.html`: one `<script>` directly after `js/ui/find.js`, with its comment.
- `sw.js`: `'./js/ui/monthboard.js'` in SHELL directly after `'./js/ui/find.js'`.
- `css/design.css`: one commented block directly after the week cell's letter block, every rule
  under `@media screen` and starting with `.month-board` (or the door's own selector).
- `css/large.css`: every size, weight and line-height of that block restated in block 3 (directly
  after the week letter's copy, with the original's importance), the shapes in block 4.
- `css/app.css`: `.month-print-title` hidden on screen; the board's `@media print` rules directly
  after the week's.
- `tests/monthboard.test.mjs`, `tests/monthboard.browser.mjs` (new); `package.json` (the two
  scripts, appended to `test` and `test:all`); `tests/README.md` (two rows - the paragraph that
  counts the suites is the integrator's, counted once); `tests/screens.mjs` (two entries);
  `tests/largetext.browser.mjs` (the month's picture).
- `features/monthboard/contract.md` (the contract as given), and this file.

Nothing in `js/model`, `js/sync`, `js/state.js`, `js/store.js`, `js/recovery.js`,
`firestore.rules`, `functions/`, `firebase.json`, `.github/`, `docs/releases.md`, `CLAUDE.md`,
`js/ui/whatsnew.js`, `js/ui/offline.js`, `js/app.js`, `js/ui/modal.js`, or any other track's file.

## Every hook in an existing file (line numbers at `3b46cae`)

| file:line | what |
|---|---|
| `js/ui/week.js:14-23` | `setWeekPhoneMode` learns `'month'` (anything else still `'days'`); entering it focuses `#monthBoardTitle`, leaving it for the grid focuses `#monthBoardDoor` |
| `js/ui/week.js:57-63` | top of `renderWeek`, before `clear(root)`: in the month mode, with a crew and `renderMonthBoard` defined, the board is drawn instead of the week and the function returns |
| `js/ui/week.js:105-106` | the corner: `if (typeof monthBoardDoor === 'function') corner.appendChild(monthBoardDoor());` before the span «עובדים / ימים» |
| `js/ui/printout.js:186, 195` | `printoutImage`: `kind === 'month'` → `readMonthPrintout()` (behind `typeof`) and `planMonthPrintout(spec, probe, family)` |
| `index.html:1198-1203` | the comment and `<script src="js/ui/monthboard.js">`, after find.js |
| `sw.js:113` | `'./js/ui/monthboard.js'` in SHELL |
| `css/design.css:775-893` | the board's look (screen), one commented block |
| `css/large.css:701-725, 1293-1304` | block 3's restatement, block 4's shapes |
| `css/app.css:4959-5009` | screen: `.month-print-title { display: none }`; `@media print`: the board's paper |
| `tests/screens.mjs:290-298` | 'week - the month board', 'week - the month board, one site' |
| `tests/largetext.browser.mjs:821-823, 841` | the month's picture, mode off and on |
| `package.json` | `test:monthboard`, `test:monthboard-browser`, each appended to its chain |

## The source of every count

| what the board says | read from |
|---|---|
| the month's dates | `monthSummaryRange(key)` (js/ui/monthsummary.js) - «סיכום חודש»'s month |
| a Saturday column | every site: `anyRecordOnRestDay(date)` (js/ui/day.js); one site: a man's entry there, or `rimaCount` / `yosefGevesCount` at that site |
| the rows | `weekWorkers(the month's dates)` (js/ui/week.js); one site: the men with an entry there |
| a cell | `isAbsent` / `entriesFor`, `entryRate` / `entryExtraHours`, `placeLabelFrom(placeLabelsIn(State.schedule), id)` - ONE whole-record map per draw, `renderWeekCell`'s own - `siteInitial` and the board's two-letter rule, `paintSite`, `siteMark` |
| a man's «נוכחות» | his dates with an entry and no absence: equal to `payrollReport(...).attendanceDays` (pinned) except the one case the contract names; one site: his dates there, equal to the invoice's `workerIds` |
| «סה"כ עובדים» | the week's foot rule (`renderWeekTotals`); its total the men's «נוכחות» added; its busiest day `monthSummaryRead(key).busiest` |
| «רישום לרימא» / «עובדי יוסף גבס» | `rimaReport(...).dayTotal` / `yosefGevesReport(...).dayTotal`; one site: `.countAt(site, date)` |
| one site: «בלי עובדי רימא» | `invoiceWithoutRima(...).countAt(site, date)` - screen only |
| one site: «סה״כ ימי עובד־אתר» | `invoiceByDate(...).countAt(site, date)`, its total the invoice row's `workerDays` |
| the filter's sites | `invoiceByDate(...).places` ids, named from the board's one map |
| the legend | the sites drawn, `paintSite`, their letters and names |

The reports a draw asks, counted on a 40-man season month: every site `{anyRecordOnRestDay: 5,
invoiceByDate: 1, placeLabelsIn: 4, rimaReport: 1, yosefGevesReport: 1}`; one site
`{invoiceByDate: 2, invoiceWithoutRima: 1, placeLabelsIn: 5, rimaReport: 1, yosefGevesReport: 1}`
(`placeLabelsIn` beyond the first is the reports' own); `payrollReport` never.

## The words

PROPOSED - not read by the owner - in one frozen block, `MONTH_BOARD_TEXT`, pinned word for word
in tests/monthboard.test.mjs:

- `door`: «לוח חודשי»
- `title(month, year, site)`: «לוח חודשי · {month} {year}», and «לוח חודשי · {month} {year} · {site}» (the site isolated) when narrowed - the heading, the paper's h1 and the picture's title
- `filter`: «אתר»
- `rowName(name, total)`: «{name} · יום נוכחות אחד» / «{name} · {total} ימי נוכחות» - the name button's spoken name
- `file(key)`: `farkad-לוח-חודשי-{YYYY-MM}.png` - the picture's file name

BORROWED, fourteen in `MONTH_BOARD_REUSED`, each found by the suite in its owner's source:
«עובדים / ימים», «לא פעיל», «סה"כ עובדים», «חזרה לטבלת השבוע», «🖨️ הדפסה», «🖼️ שיתוף כתמונה»,
«● = יום כפול · + = שעות נוספות · — = נעדר», «לחיצה על תא פותחת את היום לעריכה.», «נעדר», «כפול»,
«נוספות» (js/ui/week.js); «נוכחות», «החודש», «כל האתרים» (js/ui/reports.js). Read at draw time from
their owners: «חודש קודם», «חודש הבא», the months, «אין רישומים בחודש הזה.» and the Rima note
(`MONTH_SUMMARY_TEXT`); `RIMA_TITLE`, `NO_RIMA_TITLE`, `NO_RIMA_TOTAL`, `YOSEF_GEVES_TITLE`,
`YOSEF_GEVES_NOTE` (js/ui/reports.js). No existing string changed; the Hebrew/Arabic scan is green.

## Migrations

None. No key, no field path, no record shape, no writer, no Store call. The month and the site
are memory (`MONTH_BOARD_KEY`, `MONTH_BOARD_PLACE`). The board reads the record as it is - an
empty month included (December in both suites: the month summary's sentence, the header, no grid,
nothing to print). Every key on the disk is held byte for byte across every way in and out, in
Node (`device.dump()`, then shown to notice a real write) and in Chromium (`censusOnly`).

## Tests added

`tests/monthboard.test.mjs` - `test:monthboard`, the last of `npm test`. On harness devices, over
a DOM that reads compound selectors and bubbles a click to the grid's one listener:

1-6 over October 2026 written out by hand (every figure spelled: two sites in a day sharing
«ה», a double, extra hours with and without, an absence, an archived man who worked and one who
left before, an archived site, Rima on two sites and on a Saturday alone, יוסף גבס on a site never
billed, a month with nobody) and three seeded records x four months x every site: the rows, every
cell node for node `renderWeekCell`'s (but the board's letters), «נוכחות» against
`payrollReport`, the foot against the week's foot, `monthSummaryRead`, the two reports and the
invoice, the Saturdays, the two-letter rule, the column it opens on. 7 nothing written. 8 the
words. The file's promises read as text. One whole-record map per draw and `renderWeekCell` never
called (spies). 3's one exception as a fixture (May 2026: an older weekly closure with no
`periodTo` - `payrollReport` answers the frozen 4, the board the live 5; with `periodTo` they
agree). 9 the cost. 10 the picture's reading. 11 THE MUTANTS.

Negative tests among them: «בלי עובדי רימא» never in the picture's spec and `paper: false` on
its row alone; no Saturday column without a record, and a weekday with nothing still a column;
no two letters without a shared letter (`siteInitial` untouched); a man who left before the month
is not a row, and nobody off the board has attendance; `renderWeekCell` never called, the pay
sheet never asked, no writer or Store named in the file, nothing run at load; a site with nothing
that month is the empty board; December offers no print or share; and the eleven mutants, each a
fault a careless edit could make, each run in a child process and red by a claim: an absence
counted as a day; «בלי עובדי רימא» read into the picture; every foot row told it may leave the
phone; every Saturday a column; two letters for every site; the week's one letter where two
share it; a narrowed board keeping the other sites' blocks; a narrowed board drawing an absence;
a man who worked and left dropped; יוסף גבס added into «סה"כ עובדים»; the billed row without Rima.

`tests/monthboard.browser.mjs` - `test:monthboard-browser`, the last of `test:all`. Chromium with
emulated touch: the door at 320x568, 375x667, 440x956 x dark/light x the large display off/on
(44/52px, its words inside it, the header row no taller than without the door); the grid with the
door the grid of before plus one node, every other node and `readWeekPrintout()` the same; a real
tap opening this month at its title with today's column on the glass; the grid scrolling in its
own box with the names pinned; the arrows (focus kept, described by the title), «החודש», December
empty, the filter, «כל האתרים», an empty Saturday opening on its Friday; print and the picture
through stand-ins; nothing written (`censusOnly`); a cell, a date and a name out, Escape back onto
his name, «חזרה לטבלת השבוע» onto the door, the tab left and come back to; the place kept across
a commit and an ADOPTED SNAPSHOT (the harness's fake cloud) - `scrollLeft` and `scrollY` within
1px, the month, the filter and the focused cell; a new month at today's column or the first date;
a dialog shut and `openMonthBoard` a task later ending on the board's title; the floors by
`measureInPage` on both boards at every phone, scheme and mode, and at doubled text; a real PDF of
12-, 25- and 40-man Octobers (pages, dates on every page, every name once, Saturdays, no control,
«בלי עובדי רימא» absent, the week's own paper without the door); the picture read off its PNG; the
budgets.

## Expectations moved, deliberately

- `tests/screens.mjs`: two entries added after 'week - days' - 'week - the month board' and
  'week - the month board, one site' (opened by `openMonthBoard`, closed by
  `setWeekPhoneMode('grid')`). The one suite that walks that list, tests/largetext.browser.mjs,
  now walks the board too: with the mode on nothing under 18px, 7:1, 52px targets; with it off the
  app's floors. That is the point: a new screen joins the list (CLAUDE.md).
- `tests/largetext.browser.mjs`: `'month'` joins the shared pictures drawn with the mode off and
  on - the same width, height, length and SHA-256.
- No pinned value of any existing suite changed.
- Red on this branch by design, and nothing else: tests/build.test.mjs «the stamps were moved by
  the commit that moved the bytes» (2 checks) and tests/gate.integrity.test.mjs §4 (1 check) -
  the stamps are the integrator's.

## Test output, on `3b46cae`, from a clean tree

Each suite run one at a time, to its end (the chain's own `&&` stops at the first red, and
test:build is red here by design): `node chain.mjs` runs every script of `npm test` in its
order and prints its exit code, its `N/M checks passed` and its first failures. The browser
suites ran one at a time through the shared wrapper (`bt`, two Chromium suites at most on the
machine across every track). Seconds include waiting for a browser slot. The first line of each
block names the commit and how many files of the tree differed from it (`dirty=0`, `clean=0`:
none - both say the number of changed files); `exit 0` at the chain's end is the runner's own.

`npm test`, suite by suite (the first line is the tree it ran on):

```
HEAD 3b46cae2664ce8951127adf23ebf4d8191cd2e1a dirty=0
test:isolation	exit 0	18/18	0s
test:blobs	exit 0	11/11	1s
test:build	exit 1	67/69	1s	FAIL: and nothing in the shell has changed since  — 7 changed since 6ab193d6: css/app.css, css/design.css, css/large.css, index.html, js/ui/monthb | and neither has the worker that names the shelf  — sw.js
test:poison	exit 0	37/37	0s
test:merge	exit 0	28/28	0s
test:contested	exit 0	73/73	15s
test:held	exit 0	83/83	4s
test:snapshot-stale	exit 0	16/16	2s
test:reports-rules	exit 0	26/26	2s
test:finance	exit 0	57/57	6s
test:weekly-range	exit 0	21/21	0s
test:finance-wording	exit 0	12/12	2s
test:weekly-unpriced	exit 0	23/23	0s
test:receipt	exit 0	28/28	2s
test:data	exit 0	1970/1970	43s
test:recovery	exit 0	82/82	1s
test:adversarial	exit 0	116/116	5s
test:probes	exit 0	35/35	7s
test:capacity	exit 0	48/48	10s
test:concurrency	exit 0	46/46	3s
test:exports	exit 0	112/112	1s
test:fence	exit 0	35/35	2s
test:fence-ingress	exit 0	43/43	0s
test:fence-legacy	exit 0	21/21	0s
test:money-history	exit 0	9/9	0s
test:money-units	exit 0	21/21	0s
test:money-cloud	exit 0	17/17	2s
test:money-display	exit 0	4/4	0s
test:snapshot-poison	exit 0	82/82	2s
test:samefact	exit 0	37/37	5s
test:wording	exit 0	37/37	0s
test:closure	exit 0	122/122	20s
test:closure-echo	exit 0	79/79	1s
test:correction	exit 0	33/33	0s
test:quarantine	exit 0	82/82	2s
test:approval	exit 0	72/72	7s
test:repayment	exit 0	240/240	5s
test:ledger-ingress	exit 0	167/167	0s
test:cas	exit 0	88/88	12s
test:status	exit 0	37/37	6s
test:money	exit 0	40/40	2s
test:money-ingress	exit 0	206/206	10s
test:method	exit 0	51/51	3s
test:restore	exit 0	51/51	0s
test:upgrade	exit 0	48/48	2s
test:vehicles	exit 0	86/86	2s
test:xlsx	exit 0	104/104	2s
test:nonassertions	exit 0	23/23	1s
test:labels	exit 0	23/23	0s
test:labelcache	exit 0	32/32	0s
test:restore-ledger	exit 0	26/26	2s
test:roster-upgrade	exit 0	55/55	7s
test:roster-race	exit 0	63/63	6s
test:exports-proof	exit 0	44/44 92/92	2s
test:ledger-truth	exit 0	148/148	5s
test:races	exit 0	109/109	5s
test:overlap-restore	exit 0	117/117	20s
test:refute-roster	exit 0	24/24	9s
test:refute-restore	exit 0	25/25	43s
test:gate-integrity	exit 1	19/20	0s	FAIL: no cached file has changed since the three stamps last moved  — 3b46cae2 «לוח חודשי»: a Saturday nobody worked opens on the Friday, t | d177
test:queuecost	exit 0	18/18	7s
test:paycycle	exit 0	43/43	0s
test:paycycle-blockers	exit 0	17/17	2s
test:paycycle-completion	exit 0	31/31	5s
test:crew-controls	exit 0	46/46	1s
test:simple-advances	exit 0	66/66	1s
test:worker-deletion	exit 0	86/86	10s
test:calendar	exit 0	58/58	0s
test:reminders	exit 0	48/48	0s
test:move-late	exit 0	48/48	5s
test:codex-probes	exit 0	17/17	1s
test:codex2-probes	exit 0	36/36	1s
test:codex3-probes	exit 0	59/59	3s
test:rima	exit 0	496/496	92s
test:yosefgeves	exit 0	562/562	94s
test:seder	exit 0	135/135	1s
test:bars-stale	exit 0	60/60	0s
test:transport	exit 0	566/566	1s
test:transport-share	exit 0	304/304	12s
test:oracle	exit 0	121/121	45s
test:overpayment	exit 0	105/105	5s
test:polish	exit 0	73/73	0s
test:daycheck	exit 0	169/169	6s
test:journey	exit 0	233/233	1s
test:workercard	exit 0	180/180	24s
test:monthsummary	exit 0	98/98	77s
test:payslips	exit 0	202/202	27s
test:find	exit 0	91/91	0s
test:whatsnew	exit 0	160/160	0s
test:account-view	exit 0	456/456	22s
test:usual	exit 0	150/150	1s
test:sitecard	exit 0	119/119	3s
test:reportsclarity	exit 0	1119/1119	3s
test:largetext	exit 0	107/107	0s
test:reportnames	exit 0	36/36	13s
test:holiday	exit 0	109/109	0s
test:undo-stale	exit 0	32/32	2s
test:auditfix	exit 0	34/34	2s
test:owes	exit 0	190/190	70s
test:weeklyclose	exit 0	146/146	117s
test:reports-speed	exit 0	159/159	202s
test:closeorder	exit 0	22/22	0s
test:closuresize	exit 0	13/13	15s
test:closerace	exit 0	29/29	38s
test:advancereset	exit 0	77/77	52s
test:overpaidfix	exit 0	85/85	0s
test:xlsxlook	exit 0	293/293	9s
test:closereminder	exit 0	107/107	14s
test:monthboard	exit 0	785/785	19s
exit 0
```

The browser suites the contract lists or this change touches:

```
HEAD 3b46cae2664ce8951127adf23ebf4d8191cd2e1a clean=0
monthboard.browser.mjs	exit 0	305/305 checks passed	134s
week.browser.mjs	exit 0	55/55 checks passed	3s
week-print.browser.mjs	exit 0	17/17 checks passed	2s
design.browser.mjs	exit 0	72/72 checks passed	10s
polish.browser.mjs	exit 0	201/201 checks passed	20s
print.test.mjs	exit 0	94/94 checks passed	25s
monthsummary.browser.mjs	exit 0	88/88 checks passed	16s
sitecard.browser.mjs	exit 0	135/135 checks passed	19s
workercard.browser.mjs	exit 0	116/116 checks passed	14s
whatsnew.browser.mjs	exit 0	251/251 checks passed	70s
mobile.test.mjs	exit 0	1397/1397 checks passed	402s
smoke.mjs	exit 0	1186/1186 checks passed	372s
largetext.browser.mjs	exit 0	8324/8324 checks passed	787s
DONE
```

109 suites in `npm test`: 107 exit 0, 2 exit 1. Checks, the last «N/M checks passed» of each suite added up: 13,673/13,676.

The two reds are the expected ones, and only those: tests/build.test.mjs's two stamp checks and
tests/gate.integrity.test.mjs §4 - the stamps are the integrator's.

`node tests/monthboard.test.mjs` alone on the same commit - the cost and the mutants, as printed:

```
monthBoardFacts, median of 5: every site 11.61 ms, one site 12.07 ms
the mutants: one fault put in the board at a time, and this suite red on each
  PASS  «an absence counted as a day of attendance»: red - 9 of its checks fail  — October, every site: every man's «נוכחות» is payrollReport's attendanceDays and the count of his filled cells  — ["w_1"] !== []
  PASS  ««בלי עובדי רימא» read into the picture»: red - 4 of its checks fail  — p_1: the foot rows read off the board are the ones that leave it  — [["own","בלי עובדי רימא",["2","","1","","1","1","","","","","","","","","","","","
  PASS  «the paper told every foot row leaves the phone»: red - 4 of its checks fail  — p_1: every foot row says whether it leaves the phone - all but the site's own men  — [["own",true],["rima",true],["billed",true]] !== [["own",false],[
  PASS  «every Saturday drawn as a column»: red - 53 of its checks fail  — October, every site: a column for every weekday, and a Saturday only where something is recorded  — ["2026-10-01","2026-10-02","2026-10-03","2026-10-0
  PASS  «two letters for every site, shared or not»: red - 6 of its checks fail  — the archived site, worked at, is on the board with its own letter  — [["p_3","רמ"]] !== [["p_3","ר"]]
  PASS  «the week's one letter where two sites share it»: red - 5 of its checks fail  — October, every site: every cell is renderWeekCell's for the same man and day (112 cells)  — [{"row":"w_1","date":"2026-10-01","got":{"tag":"TD","cls":
  PASS  «a narrowed board keeping every site's blocks»: red - 76 of its checks fail  — October, הרצליה: the rows are the men with an entry at that site, in the roster's order  — ["w_1","w_2","w_3"] !== ["w_1","w_2"]
  PASS  «a narrowed board drawing a man's absence»: red - 17 of its checks fail  — October, הרצליה: every cell is renderWeekCell's for the same man and day, narrowed to that site (54 cells)  — [{"row":"w_1","date":"2026-10-02","got":
  PASS  «a man who worked and left dropped from his month»: red - 4 of its checks fail, then a precondition stops it  — October, every site: the rows are the week's rule over the month, in the roster's order  — ["w_1","w_2","w_5"] !== ["w_1","w_2","w_3","w_5"]
  PASS  «יוסף גבס added into «סה"כ עובדים»»: red - 5 of its checks fail  — October, every site: and its total is the men's «נוכחות» added - no count of Rima or יוסף גבס in it  — 10 !== 8
  PASS  «the billed row without Rima's men»: red - 16 of its checks fail  — October, הרצליה: «סה״כ ימי עובד־אתר» is the invoice's count on every day, and its total  — [[2,0,1,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],8]

785/785 checks passed
```

`tests/monthboard.browser.mjs` on the same commit, as printed:

```
pages of A4 landscape: 12 men 1, 25 men 2, 40 men 2
PASS  within 4,096px a side  — 2664x3922
the board drawn: 58 ms, 251 ms at 4x; its picture 583 ms at 4x (3922px)
```

A first full run on `319326d` (the code before the last commit) was green as far as it went -
85 Node suites to test:workercard with the same two expected reds, and 11 browser suites to
mobile.test.mjs - and was stopped when the last commit was made; everything above ran again on
`3b46cae`.

## Paper, the picture, the budgets

- Pages of A4 landscape (Chromium's PDF of an October, every Saturday worked shaded): 12 men 1, 25 men 2, 40 men 2.
  One page holds the header, the foot and a crew of 12; 25 and 40 men run to a second page with the
  dates' header repeated and no man cut. Said, not promised.
- The picture of a 40-man month: 2664x3922 px, inside the 4,096px cap; drawn in 583 ms at 4x CPU
  (budget 2,000).
- The board drawn on a 40-man month: 58 ms (budget 250), 251 ms at 4x CPU (budget 1,000).
- `monthBoardFacts` on a 40-man season month, median of 5: every site 11.61 ms, one site 12.07 ms
  (budget 25 ms; 5-7 ms on a quieter machine earlier the same day - three other tracks were
  running their suites beside this one).

## Screenshots (synthetic names: the suites' own seed)

In `/tmp/claude-0/-home-user-farkad/d6a64352-db1a-5c3b-b54d-5c09103f2419/scratchpad/feat-monthboard/`,
written by the browser run on `3b46cae` (`MONTHBOARD_SHOTS`):

- `board-440x956-dark.jpg` (and `-full.jpg`) - the board on the big phone, dark
- `board-320x568-light-large.jpg` (and `-full.jpg`) - the small phone with «תצוגה גדולה»
- `board.pdf` and its first page `board-pdf-page1-1.png` - a 40-man October on A4 landscape
- `board-site.pdf` and `board-site-pdf-page1-1.png` - narrowed to one site
- `board-picture.png` - the shared picture

## Reconciled with the contract (re-read from disk), and where the code says otherwise

Every criterion 1-20 has its check, and the two existing suites the contract names moved as it
says. Where the code is not word for word the contract:

1. **The month is said in the title, not again between the arrows.** The contract's header
   line lists «חודש קודם» / the month / «חודש הבא», as «סיכום חודש» draws them. The board's
   title directly above already says «לוח חודשי · נובמבר 2026»; a third item in that row wraps it
   to two on 320px and with «תצוגה גדולה». Instead each arrow keeps the focus after its step and is
   described by the title (`aria-describedby`), so a screen reader hears the new month where the
   focus lands - the job «סיכום חודש»'s live line does. One `<span>` between the arrows if wanted.
2. **A narrowed board keeps the chosen site in the filter** even in a month that billed nothing
   there (the contract lists the month's billed sites): the box says the site the board shows.
3. **A narrowed board draws no absence**: only that site's line (criterion 2), so an absent man's
   cell is empty there.
4. **A Saturday's header** carries `month-board-saturday`; its cells keep the week's `col-rest`
   and are not faded on the board, so a worked Saturday reads at full contrast.
5. **The column the board opens on** is the contract's "today's column", and on a Saturday
   nothing was recorded on (no column) the Friday before it (the contract is silent; the 1st was
   the old fallback).
6. **`facts`** carries more than the interface lists (`name`, `title`, `thisMonth`, `today`,
   `anchor`, `sites`, `notes`, and per line `name`, `mark`, `hours`, `word`) - a superset.
7. **Paper's colours**: `print-color-adjust: exact` on the board's cells (a Saturday's shade, the
   foot's band) as on the site blocks.

## NOT DONE

- The «מה חדש» item, the three stamps, docs/releases.md and CLAUDE.md: the integrator's (texts
  below).
- Track `status`'s real call to `openMonthBoard(null, null)`: tested with a stub caller that
  shuts a dialog and calls it a task later (criterion 12's alternative), not on the merged tree.
- Nothing of the contract's criteria is left undone.

## Not verified

- Not tried on a real phone; Chromium with emulated touch only. Not run on WebKit at all: the
  paper's date row uses `display: contents` (Chrome painted the repeated header's buttons blank
  on page 2 - fixed and measured for Chromium only).
- The paper was not printed on a printer: Chromium's PDFs only.
- An automatic update's reload (v205) under the board lands on the week GRID, its month and site
  lost: by construction (the month, the site and `weekPhoneMode` are memory; `showView('week')`
  starts at the grid), not run against v205's `updateReturnKeep`, which is not in this base.
- Nobody far-sighted has looked at it with «תצוגה גדולה»; colour blindness not simulated on the
  board (the letter, the legend and the spoken label carry the site; never colour alone).

## Known risks

- At 320x568 with «תצוגה גדולה» the board's header (the way back, the title, the arrows, the
  filter, print and share) fills about two thirds of the first screen, and the grid shows two
  days at a time below it (the contract states that price). See the screenshot.
- The paper of a large crew is small type (dates 7pt, letters 6.5pt) on two pages; readable in the
  PDF, unproven on a printer.
- A 40-man month's picture is near the 4,096px cap; a larger crew is scaled down to fit, its
  letters smaller.
- Two sites whose first two letters are also the same (e.g. «הרצליה א» / «הרצליה ב») both read
  «הר»: the colour and the legend still tell them apart on screen, not on black-and-white paper.
- The board redraws on every commit and adopted snapshot, as the week does: a 40-man month costs
  about 55 ms a draw (under 300 at 4x CPU).
- Past midnight with the board open, today's mark and the opening column move at the next redraw.

## Open questions, each with the default this branch took

1. Is the filtered board something the owner hands a client, given that it names his men?
   **Default: no** - it is his and the accountant's; the app's client paper names nobody, and
   nothing on the board says «לקוח».
2. Does he want «בלי עובדי רימא» on THIS board's paper? **Default: no** - his v167 ruling for that
   figure is screen and workbook only; hidden on paper by its kind, left out of the picture.
3. Should `updateReturnKeep` (v205) carry the board's month and filter across an update?
   **Default: the integrator's call**, not this branch's; today the reload lands on the grid.
4. The month's name also between the arrows, as «סיכום חודש» has it? **Default: no** - once, in
   the title above, and spoken from the arrows.

## For the integrator

**«מה חדש» (PROPOSED):**
`{ title: 'לוח חודשי', text: 'כל החודש בטבלה אחת: כל עובד, כל יום והאתר שלו בצבע, עם סינון לפי אתר, הדפסה ותמונה לשיתוף.', where: 'שבוע ← לוח חודשי, בפינת הטבלה', go: 'monthBoard' }`
- `go: 'monthBoard'` only navigates: `showView('week')` (the grid), then focus `#monthBoardDoor`
  without pressing it, one task later (whatsNewGo's rule).
- Track `status` calls `openMonthBoard(null, null)` and reads `MONTH_BOARD_TEXT.door`, both behind
  `typeof`, one task after its dialog shut.

**Release entry (docs/releases.md, under v206):**

> ### «לוח חודשי» - the crew's month on one board, on paper and as a picture (track `monthboard`)
>
> **What it is** (`js/ui/monthboard.js`). A third mode of the week tab, entered from the week
> grid's corner cell - «לוח חודשי» where «עובדים / ימים» stood, the words kept for paper, the
> header row no taller. One row per man (every active man, and a man not active only in a month
> he worked, marked «לא פעיל»), one column per date of the calendar month (a Saturday only when
> something was recorded on it), each cell the week's own cell - the site's colour, its letter in
> white (on this board two letters where two of its sites share one), ● a doubled day, + extra
> hours, «נעדר» an absence - his «נוכחות» at the row's end, «סה"כ עובדים» per date at the foot,
> and «רישום לרימא» and «עובדי יוסף גבס» each apart, with its note, in no total. «חודש קודם» /
> «חודש הבא» and «החודש» walk the months; «אתר» narrows it to one site, the foot then the invoice's
> own rows for it («בלי עובדי רימא» on the screen only, «רישום לרימא», «סה״כ ימי עובד־אתר») and
> יוסף גבס apart. A cell or a date opens that day; a name opens his card. It opens on today's column
> (on a Saturday nothing was recorded on, the Friday before it), and a commit or a snapshot adopted
> from another phone leaves the reader where he was - the grid's scroll, the page's and the focus.
>
> **A reading.** It writes no key and no record; the month and the site are memory, and leaving
> the tab - or an update's reload - puts the week back on its grid. It prices nothing: every count
> is an existing function's - `weekWorkers`, the week cell's own rule, `payrollReport`'s
> attendanceDays (pinned equal, but for a closure recorded with no periodTo that starts on the
> month's first day, where the board shows the live record), the week's foot rule, `rimaReport`,
> `yosefGevesReport`, `invoiceWithoutRima`, `invoiceByDate`. Nothing in js/model, js/sync,
> js/state.js, js/store.js, js/recovery.js or the rules. It names every man, so it is not paper
> for a client (the owner has not been asked).
>
> **Paper and the picture.** «🖨️ הדפסה» prints it on A4 landscape (the week's own
> body.week-print-layout): one page for a crew of 12; 25 and 40 men ran to two pages each, the
> dates' header repeated and no man cut (Chromium's PDFs; not printed on a printer). «🖼️ שיתוף
> כתמונה» shares it as a picture read off the board's DOM (2664x3922 for 40 men). «בלי עובדי רימא»
> is on neither (the owner's v167 ruling).
>
> **Moved expectations (two, deliberate).** tests/screens.mjs lists the board and the one-site
> board after 'week - days', so tests/largetext.browser.mjs walks them; that suite also draws the
> month's picture with the large display off and on and holds it the same PNG. No pinned value
> changed.
>
> **Hebrew - PROPOSED**, one block in js/ui/monthboard.js, pinned in tests/monthboard.test.mjs:
> «לוח חודשי»; «לוח חודשי · {חודש} {שנה}» and «… · {אתר}»; «אתר»; a name's spoken label «{שם} · {N}
> ימי נוכחות» / «{שם} · יום נוכחות אחד»; the picture's file farkad-לוח-חודשי-YYYY-MM.png. Fourteen
> borrowed words are found in their owners. No existing string changed.
>
> **Known not covered.** Not tried on a real phone, and not on WebKit at all (the paper's date row
> uses display: contents, fixed for Chrome's repeated header). The paper was not printed. At
> 320x568 with «תצוגה גדולה» the board's header fills most of the first screen and the grid shows
> two days at a time. The month is said in the title and not again between the arrows.

**CLAUDE.md, the file list:**

```
    js/ui/monthboard.js        v206: «לוח חודשי» - the crew's month as a third mode of the week tab (weekPhoneMode
                               'month'), its door the grid's corner cell: a row per man, a column per date (a
                               Saturday only when recorded), the week's own cell, «נוכחות», the counts at the
                               foot; «אתר» narrows it to one site with the invoice's own rows («בלי עובדי רימא»
                               on the screen only); paper on A4 landscape and the picture read off its DOM
                               (readMonthPrintout / planMonthPrintout); memory only, no key written, no shekel;
                               openMonthBoard(key, site) for other screens, called one task after a dialog shut
    tests/monthboard.test.mjs  v206: the board on devices - the rows, every cell renderWeekCell's node for node,
                               «נוכחות» payrollReport's, the foot the week's and the reports', the Saturdays, two
                               letters, the column it opens on, nothing written, the words, the cost, the
                               picture's reading; eleven mutants, each red
    tests/monthboard.browser.mjs v206 in Chromium: the door at three phones x schemes x the large display, the grid
                               plus one node, the ways in and out, the place kept across a commit and an adopted
                               snapshot, the floors and doubled text, a real PDF (12/25/40 men: 1, 2, 2 pages),
                               the picture read off its PNG, the budgets
```

**CLAUDE.md, a sentence for the long paragraph:**

> v206 adds «לוח חודשי» (js/ui/monthboard.js): the crew's month as a third mode of the week tab,
> entered from the grid's corner cell - a row per man, a column per date (a Saturday only when
> recorded), the week's own cell, «נוכחות» and the counts at the foot, narrowed by «אתר» to one
> site with the invoice's own rows («בלי עובדי רימא» on the screen only, never on paper or in the
> picture), printed on A4 landscape and shared as a picture read off its DOM; a reading - no key
> written, no shekel priced, the month and the site memory only, so an update's reload lands on
> the week's grid; it names every man and is not paper for a client; its Hebrew is proposed and
> pinned in tests/monthboard.test.mjs; not tried on a real phone (docs/releases.md, v206).
