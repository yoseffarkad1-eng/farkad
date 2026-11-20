# Handoff — «לוח חודשי»: the crew's month on one board (track `monthboard`, v206 program)

- Branch: `feat-monthboard` (worktree `/home/user/farkad/.claude/worktrees/feat-monthboard`)
- **Code SHA, on which every suite of fix round 1 ran: `32d4e6ed6d4c97ef0763bd0d71ff1170cd5322ca`.** The commit that
  adds this report adds nothing else (`git diff 32d4e6e HEAD --stat` names
  `features/monthboard/handoff.md` alone). The build's own runs, on `3b46cae`, are kept below
  under their own heading; fix round 1's are at the top.
- Base: `6ab193d68c960e4a56d947673c282b867acd258f` (origin/main, stamps v204).
- Build stamps NOT moved: `farkad-build`, `APP_VERSION` and `VERSION` still say v204 - the
  integrator moves them with v206.
- Contract: `features/monthboard/contract.md`, revision 2 - sha256 `a13ff333…`, byte for byte
  the program's copy, re-read from disk before fix round 1 (unchanged since the build) and
  reconciled (below: five more places where the code now departs from its letter, 8-12).
- Not pushed, no PR, no other branch or worktree touched.

Commits, base → code SHA:

- `4402f72` features/monthboard: the contract of «לוח חודשי», as written for the v206 program
- `f11dc41` «לוח חודשי»: the crew's month on one board, a third mode of the week tab
- `4b24381` tests/monthboard.test.mjs: the board cannot be different from what it counts
- `08604b1` features/monthboard: the contract's revision 2, after the critic
- `d177721` «לוח חודשי»: the contract's revision 2 - the reader's place kept, «בלי עובדי רימא» off paper by its kind
- `319326d` tests/monthboard.browser.mjs, and the board in tests/screens.mjs and the shared pictures
- `3b46cae` «לוח חודשי»: a Saturday nobody worked opens on the Friday, the arrows say the month, the paper keeps its grounds - and eleven mutants
- `af099ca` features/monthboard/handoff.md: the report, on 3b46cae
- `97bca13` «לוח חודשי»: the review of v206 - his card on the board's month, the arrows still, the door's words inside it, and the cheap rest
- `32d4e6e` «לוח חודשי»: «החודש» ends the site's row - the arrows still, and no row more off this month

## Fix round 1 - the review of v206 (2026-11-19)

The review of `af099ca` sent nineteen findings: three P2, sixteen P3, no P1. Each was opened at
its file and line and reproduced, and all nineteen are CONFIRMED. Two pairs are the same fault
reported twice: the card on the wrong month (P2 and P3) and «נוכחות» on a one-site board (two
P3s). That leaves seventeen distinct faults. Fourteen are fixed, one of them (paper's date)
only in part, in two commits: `97bca13` (all of them) and `32d4e6e`, which moves «החודש» to the
end of the site's row because its own row cost the first screen a man off this month (measured
below). Three are left: each needs a design decision for the owner, and none is cheap.

Each fix has a check that is RED on `af099ca` and GREEN on `32d4e6e`. The browser checks were
run against `af099ca`'s code with the new suite laid over it
(`/tmp/claude-0/-home-user-farkad/d6a64352-db1a-5c3b-b54d-5c09103f2419/scratchpad/feat-monthboard/fix1/before-tree`):
334/359, 25 red, which is every new browser check except the paper's first line (see 7), plus
the served-tree check, red only because that copy is not a git checkout. The Node checks are
held by eight new mutants. Each mutant puts one old fault back, and the suite goes red on each
one (`node tests/monthboard.test.mjs`, the mutants' section). On `af099ca` itself the Node
suite fails the card check and then stops at the first new word (`T.rowNameAtSite is not a
function`). The two checks `32d4e6e` added (off this month «החודש» in the site's row with the
header no taller, and the floors on October's board) were not run on `af099ca`, where «החודש»
stood between the arrows and could not be in the site's row; on `97bca13` the probe below
measured the header 56px taller off this month.

| # | finding | sev | verdict | outcome | the check (red before, green after) |
|---|---|---|---|---|---|
| 8 (+3) | A name on a past month's board opened his card on THIS month | P2 | CONFIRMED (`openWorkerCard` resets `WORKER_CARD_MONTH`) | **fixed**: `monthBoardOpenCard` opens the card and, off this month, puts it on the board's month (the card's own memory) and draws it again through `renderWorkerCardIfOpen`. js/ui/workercard.js is untouched | browser «a name on October's board opens his card on October, entered at its title» (before: `[null,"נובמבר 2026"]`) + Escape forgets the month; Node + mutant «a name opening his card on this month whatever month the board is on» |
| 9 | «החודש» between the arrows: a second «חודש קודם» landed on it | P2 | CONFIRMED (flex thirds) | **fixed**: the two arrows are their whole row on every month, and «החודש» ends the site's row, as tall as the list. `97bca13` put it on a row of its own under the arrows (the worker card's way), and the probe below showed that row cost the first screen a man off this month; `32d4e6e` moved it | browser: «חודש קודם» twice at the same spot 450 ms apart → September; «חודש הבא» twice → January; the arrows' rectangles off this month = on it (before: November, November, `107.7` vs `171.5` wide); off this month «החודש» in the site's row and the header no taller, with the floors held on October's board at all twelve setups and at doubled text; Node: the arrows' row is `[prev, next]` on and off this month, with «החודש» right after the site's row |
| 10 | At doubled text the door's «חודשי» ran 15px out over the first date | P2 | CONFIRMED (`overflow-wrap: normal`) | **fixed**: `overflow-wrap: anywhere` on the door | browser, doubled text at 320 and 375: the door's words inside it, and the ruler reports no spill or overlap on the door (before: «15.2px past its edge» at 320) |
| 1 | The names' column announced as «לוח חודשי» | P3 | CONFIRMED (CDP) | **fixed**: the corner's words are clipped to a pixel beside the door (`.btn-emoji`'s shape), not `display:none` | browser (CDP): the first columnheader is named with «עובדים / ימים» («לוח חודשי עובדים / ימים»), with the door the one button inside it (before: «לוח חודשי») |
| 2 | Header row 3.1px taller with the door wider than 700px | P3 | CONFIRMED (53 vs 49.9) | **fixed**: the door reaches the wide cell's 6px (margin -6px; -2px on phones as before) | browser 1b: 568x320, 667x375, 844x390, 932x430, 1280x800, mode off and on: no taller (before: 844, 932, 1280 red) |
| 4 (+16) | One site's «נוכחות» column and «N ימי נוכחות» count only that site | P3 | CONFIRMED | **fixed**, PROPOSED words: the column «ימים באתר», the name «{שם} · {N} ימים באתר» / «{שם} · יום אחד באתר» - on the screen, on paper and in the picture (both read the column's head off the board) | Node + mutant «one site's days called «נוכחות»»; the picture's spec reads «ימים באתר» |
| 5 | An inactive man's spoken name dropped «לא פעיל» | P3 | CONFIRMED | **fixed**: «{שם} · לא פעיל · …» (the word is borrowed) | Node + mutant «a man who is not active said to be one who is» |
| 6 | Two guards untested (the door keeping a site; the filter named from the invoice) | P3 | CONFIRMED | **fixed**: a check for each, and a mutant for each | Node: the door after a site was chosen and the board left → every site; two unlisted sites the invoice numbers 1/2 and the board 2/3 - the filter, the list on screen, the legend and every cell say 2/3 |
| 7 | A mutant (`paper`) that nothing reads; a PDF title check satisfied by the legend | P3 | CONFIRMED | **fixed**: the mutant is renamed for what it is («the facts telling their readers every foot row may leave the phone», the facts' interface flag; the paper and the picture leave the row out by its KIND, which the mutant before it and the PDF hold), and tests/README.md says so; the PDF title is read off the page's first line | the first-line check: on `af099ca` it passes, because the h1 there was always right; it is the check that got stronger. On the paper of a site board the line is «Alpha · 2026 רבוטקוא · ישדוח חול» |
| 11 | A week across two months opened its Friday's month | P3 | CONFIRMED (as the contract wrote it) | **fixed**: the month most of the week is in (its Monday's, the 4th of 7 days). The week of today still opens this month. **Deviates from the contract's letter**, below | Node + mutant «a week across two months opening its Friday's»: Fri 30 Oct-Thu 5 Nov → November |
| 15 | Two sites of one city both «תל» | P3 | CONFIRMED | **fixed**: a third level of the board's letters - the first letter and the letter where the names part («תר», «תד», «תמ»); a pair already on the board is passed over; a name that ends where the other goes on keeps its two letters; one site entered twice is numbered. `siteInitial` untouched | Node: seven cases of `monthBoardLegendLetters`, and a board's legend and cells; mutant «two sites that read alike in two letters left alike» |
| 17 | The foot read «סה"כ עובדים1» as the board opened | P3 | CONFIRMED | **fixed**: the opening scroll moves less than half a column so the column at the names' edge is whole (`monthBoardWholeAtNames`); the names' column has a 2px edge of its own | browser, all 12 phone × scheme × mode setups: no date column across the names' edge (before: red at all 12) |
| 18 | At doubled text the board's corner «עובדים» lay over the first date | P3 | CONFIRMED | **fixed**: `overflow-wrap: anywhere` in the corner | browser, doubled text: no word of the grid out of its own cell (before: red at 320 and 375) |
| 19 | Paper and picture of the current month carry no date | P3 | CONFIRMED | **fixed in part**: PROPOSED «נכון ל־{dd/mm/yyyy}» after the paper's and the picture's title for a month not over (the screen's title unchanged: it marks today in its column). The days after today are NOT shaded | Node + mutant «the paper of a month not over without the day it was made»; browser: this month's picture title |
| 12 | The dates row scrolls away with the page | P3 | CONFIRMED | **left** - not cheap, and a design call: making the dates stick means a grid box bounded by the screen that scrolls vertically inside the page (a second vertical scroller on a phone, which the week grid does not have), or a dates row repeated every N men on screen (new structure the paper and the picture would have to leave out). Paper repeats the dates on every page. For the owner | - |
| 13 | The header fills the first screen at 320 with the mode | P3 | CONFIRMED | **left** - not cheap: compacting it moves the board's controls (back + title on one line, arrows + filter in one row, print/share at the foot), and the app's own rule is that a control that stays where it was is worth more than a tidier header (css/design.css, its head). Fix 9 first put «החודש» on a row of its own off this month, and the measurement below showed that made it worse; it now ends the site's row and costs nothing. For the owner | - |
| 14 | A man's «נוכחות» is off the screen without a long swipe | P3 | CONFIRMED | **left** - the contract puts the total last (paper and picture too). Pinning it beside the names on screen costs the 320 phone a day of its width (two days at a time with the mode, so one). His spoken name carries the number. For the owner | - |

**The first screen, measured** (`fix1/probe/glass.mjs`, light, seeded crew of 14; the board's
header, and the whole rows of men between the top and the tab bar at opening) on `32d4e6e`, and
in the last column on `97bca13`:

| phone | this month: header, whole rows of 14 | October, «החודש» shown, on `32d4e6e` | October on `97bca13` («החודש» a row of its own) |
|---|---|---|---|
| 320x568, «תצוגה גדולה» | 66..360px, 1 | 66..360px, 1 | 66..420px, **0** |
| 375x667 | 48..295px, 4 | 48..295px, 4 | 48..351px, 3 |
| 440x956 | 48..295px, 10 | 48..295px, 10 | 48..351px, 9 |

The 320 phone with the mode still shows one man of fourteen at opening. That is finding 13,
which is left; fix 9 no longer makes it worse.

**What changed, file by file** (`git diff af099ca 32d4e6e --stat`):

```
 css/design.css               |  46 +++++++--
 css/large.css                |   1 +
 js/ui/monthboard.js          | 151 ++++++++++++++++++++++++----
 tests/README.md              |   4 +-
 tests/monthboard.browser.mjs | 179 ++++++++++++++++++++++++++++++++-
 tests/monthboard.test.mjs    | 233 +++++++++++++++++++++++++++++++++++++++++--
 6 files changed, 571 insertions(+), 43 deletions(-)
```

- `js/ui/monthboard.js`: three proposed words; `monthBoardLegendLetters` (the letters' three
  levels); `facts.paperTitle`, `facts.asOf`, `facts.totalHead`; the name's spoken label (inactive, one
  site); «החודש» at the end of the site's row;
  `monthBoardWholeAtNames`; the door's month rule;
  `monthBoardOpenCard` on the board's month. Still no key, writer, Store call or money function.
- `css/design.css`: the door's wide margin and `overflow-wrap`; the corner's words clipped, not
  removed; `.month-board-home` (the list's height, after it) and `.month-board-filter` (three
  fifths of the line at least, the rest for «החודש»); the names' column's 2px edge; the corner's
  `overflow-wrap`.
- `css/large.css`: `.month-board-home` at 20px (the one new size, restated in block 3).
- `tests/monthboard.test.mjs`, `tests/monthboard.browser.mjs`, `tests/README.md` (the two rows).
- Nothing else. week.js, printout.js, index.html, sw.js, app.css, screens.mjs and
  largetext.browser.mjs are as they were at `af099ca`.

**New words, PROPOSED, pinned word for word in tests/monthboard.test.mjs:**
- `siteTotal`: «ימים באתר» - the last column's head on a board narrowed to one site.
- `rowNameAtSite(name, total)`: «{name} · יום אחד באתר» / «{name} · {N} ימים באתר» - the name's
  spoken label on one site.
- `asOf(date)`: «נכון ל־{date}» (a maqaf, the date isolated left to right) - after the title on
  paper and in the picture of a month not over.
- A composition with no new word: an inactive man's spoken name is «{name} · לא פעיל · …», where
  «לא פעיל» is the week's own (`MONTH_BOARD_REUSED.inactive`).

**Expectations moved, all in this track's own suites, each because the change is the point:**
- tests/monthboard.test.mjs «a name opens that man's card …»: `[['w_2', 'drawn on 2026-10'],
  ['week']]`. The board is on October there, so the card is now put on October.
- «the new words are exactly these five» → eight.
- the mutant «two letters for every site» mutates the line that moved into
  `monthBoardLegendLetters`; the `paper` mutant is renamed (7).
- the picture's title check compares paper's title (`facts.paperTitle`). October is over, so
  it is the same words as before.
- tests/monthboard.browser.mjs: the paper's title is read off its first line (7).
No pinned value of any suite outside the track's two moved.

**Where the code now departs from the contract's letter** (in addition to the seven below):
8. **The door opens the month most of the week is in** (its Monday's), not the Friday's; the week
   that holds today opens this month as before (finding 11).
9. **«החודש» ends the site's row** off this month, not between the arrows (finding 9).
10. **One site's last column says «ימים באתר»**, not «נוכחות», on screen, on paper and in the
    picture (finding 4).
11. **The paper's h1 and the picture's title** of a month not over end in «נכון ל־{date}»; the
    screen's title is `MONTH_BOARD_TEXT.title` as before (finding 19).
12. **The letters have a third level**, where two sites still read alike in two letters (finding 15).

### Test output of fix round 1, on `32d4e6ed6d4c97ef0763bd0d71ff1170cd5322ca`, from a clean tree

`npm test`, suite by suite (`node chain.mjs`: every script of the chain in its order, each run to
its end - the chain's own `&&` stops at the first red, and test:build is red on this branch by
design). The first line names the commit and how many files of the tree differed from it:

```
HEAD 32d4e6ed6d4c97ef0763bd0d71ff1170cd5322ca dirty=0
test:isolation	exit 0	18/18	0s
test:blobs	exit 0	11/11	1s
test:build	exit 1	67/69	1s	FAIL: and nothing in the shell has changed since  — 7 changed since 6ab193d6: css/app.css, css/design.css, css/large.css, index.html, js/ui/monthb | and neither has the worker that names the shelf  — sw.js
test:poison	exit 0	37/37	0s
test:merge	exit 0	28/28	0s
test:contested	exit 0	73/73	16s
test:held	exit 0	83/83	4s
test:snapshot-stale	exit 0	16/16	2s
test:reports-rules	exit 0	26/26	2s
test:finance	exit 0	57/57	6s
test:weekly-range	exit 0	21/21	0s
test:finance-wording	exit 0	12/12	1s
test:weekly-unpriced	exit 0	23/23	0s
test:receipt	exit 0	28/28	2s
test:data	exit 0	1970/1970	44s
test:recovery	exit 0	82/82	1s
test:adversarial	exit 0	116/116	5s
test:probes	exit 0	35/35	7s
test:capacity	exit 0	48/48	12s
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
test:wording	exit 0	37/37	1s
test:closure	exit 0	122/122	22s
test:closure-echo	exit 0	79/79	1s
test:correction	exit 0	33/33	0s
test:quarantine	exit 0	82/82	2s
test:approval	exit 0	72/72	9s
test:repayment	exit 0	240/240	5s
test:ledger-ingress	exit 0	167/167	0s
test:cas	exit 0	88/88	13s
test:status	exit 0	37/37	7s
test:money	exit 0	40/40	3s
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
test:gate-integrity	exit 1	19/20	0s	FAIL: no cached file has changed since the three stamps last moved  — 32d4e6ed «לוח חודשי»: «החודש» ends the site's row - the arrows still, | 97bc
test:queuecost	exit 0	18/18	5s
test:paycycle	exit 0	43/43	0s
test:paycycle-blockers	exit 0	17/17	2s
test:paycycle-completion	exit 0	31/31	5s
test:crew-controls	exit 0	46/46	1s
test:simple-advances	exit 0	66/66	1s
test:worker-deletion	exit 0	86/86	10s
test:calendar	exit 0	58/58	0s
test:reminders	exit 0	48/48	0s
test:move-late	exit 0	48/48	5s
test:codex-probes	exit 0	17/17	0s
test:codex2-probes	exit 0	36/36	1s
test:codex3-probes	exit 0	59/59	3s
test:rima	exit 0	496/496	92s
test:yosefgeves	exit 0	562/562	95s
test:seder	exit 0	135/135	0s
test:bars-stale	exit 0	60/60	0s
test:transport	exit 0	566/566	1s
test:transport-share	exit 0	304/304	12s
test:oracle	exit 0	121/121	48s
test:overpayment	exit 0	105/105	5s
test:polish	exit 0	73/73	0s
test:daycheck	exit 0	169/169	7s
test:journey	exit 0	233/233	1s
test:workercard	exit 0	180/180	25s
test:monthsummary	exit 0	98/98	84s
test:payslips	exit 0	202/202	34s
test:find	exit 0	91/91	1s
test:whatsnew	exit 0	160/160	1s
test:account-view	exit 0	456/456	25s
test:usual	exit 0	150/150	1s
test:sitecard	exit 0	119/119	3s
test:reportsclarity	exit 0	1119/1119	4s
test:largetext	exit 0	107/107	0s
test:reportnames	exit 0	36/36	12s
test:holiday	exit 0	109/109	1s
test:undo-stale	exit 0	32/32	2s
test:auditfix	exit 0	34/34	1s
test:owes	exit 0	190/190	86s
test:weeklyclose	exit 0	146/146	171s
test:reports-speed	exit 0	159/159	229s
test:closeorder	exit 0	22/22	0s
test:closuresize	exit 0	13/13	12s
test:closerace	exit 0	29/29	38s
test:advancereset	exit 0	77/77	57s
test:overpaidfix	exit 0	85/85	1s
test:xlsxlook	exit 0		11s
test:closereminder	exit 0	107/107	16s
test:monthboard	exit 0	831/831	44s
exit 0
test:xlsxlook (re-run alone, as the chain runs it, on 32d4e6e)	exit 0	293/293
```

109 suites in `npm test`: 107 exit 0, 2 exit 1 (test:build, test:gate-integrity). Checks, the last «N/M checks passed» of each suite added up: 13,719/13,722. test:xlsxlook's own line of the chain printed no count: its last line was lost from the pipe under load, with exit 0; re-run alone the way the chain runs it, on the same commit, it is exit 0 and 293/293 (the last line of the block), which the sum counts. The reds are the expected ones and only those: tests/build.test.mjs's two stamp checks and tests/gate.integrity.test.mjs §4 - the stamps are the integrator's.

The browser suites this round touches or the contract lists, one at a time through the shared
wrapper (`bt`: two Chromium suites at most on the machine across every track; the seconds
include the wait for a slot):

```
HEAD 32d4e6ed6d4c97ef0763bd0d71ff1170cd5322ca clean=0
monthboard.browser.mjs	exit 0	459/459 checks passed	140s
week.browser.mjs	exit 0	55/55 checks passed	4s
week-print.browser.mjs	exit 0	17/17 checks passed	3s
design.browser.mjs	exit 0	72/72 checks passed	11s
polish.browser.mjs	exit 0	201/201 checks passed	23s
print.test.mjs	exit 0	94/94 checks passed	29s
monthsummary.browser.mjs	exit 0	88/88 checks passed	15s
sitecard.browser.mjs	exit 0	135/135 checks passed	19s
workercard.browser.mjs	exit 0	116/116 checks passed	15s
whatsnew.browser.mjs	exit 0	251/251 checks passed	70s
mobile.test.mjs	exit 0	1397/1397 checks passed	420s
smoke.mjs	exit 0	1186/1186 checks passed	416s
largetext.browser.mjs	exit 0	8324/8324 checks passed	751s
DONE
```

`node tests/monthboard.test.mjs` on the same commit - the cost and the nineteen mutants, as printed:

```
HEAD 32d4e6ed6d4c97ef0763bd0d71ff1170cd5322ca dirty=0
monthBoardFacts, median of 5: every site 13.57 ms, one site 5.60 ms
the mutants: one fault put in the board at a time, and this suite red on each
  PASS  «an absence counted as a day of attendance»: red - 10 of its checks fail  — October, every site: every man's «נוכחות» is payrollReport's attendanceDays and the count of his filled cells  — ["w_1"] !== []
  PASS  ««בלי עובדי רימא» read into the picture»: red - 4 of its checks fail  — p_1: the foot rows read off the board are the ones that leave it  — [["own","בלי עובדי רימא",["2","","1","","1","1","","","","","","","","","","","","
  PASS  «the facts telling their readers every foot row may leave the phone»: red - 4 of its checks fail  — p_1: every foot row says whether it leaves the phone - all but the site's own men  — [["own",true],["rima",true],["billed",true]] !== [["own",false],[
  PASS  «every Saturday drawn as a column»: red - 53 of its checks fail  — October, every site: a column for every weekday, and a Saturday only where something is recorded  — ["2026-10-01","2026-10-02","2026-10-03","2026-10-0
  PASS  «two letters for every site, shared or not»: red - 10 of its checks fail  — the archived site, worked at, is on the board with its own letter  — [["p_3","רמ"]] !== [["p_3","ר"]]
  PASS  «the week's one letter where two sites share it»: red - 6 of its checks fail  — October, every site: every cell is renderWeekCell's for the same man and day (112 cells)  — [{"row":"w_1","date":"2026-10-01","got":{"tag":"TD","cls":
  PASS  «a narrowed board keeping every site's blocks»: red - 78 of its checks fail  — October, הרצליה: the rows are the men with an entry at that site, in the roster's order  — ["w_1","w_2","w_3"] !== ["w_1","w_2"]
  PASS  «a narrowed board drawing a man's absence»: red - 17 of its checks fail  — October, הרצליה: every cell is renderWeekCell's for the same man and day, narrowed to that site (54 cells)  — [{"row":"w_1","date":"2026-10-02","got":
  PASS  «a man who worked and left dropped from his month»: red - 4 of its checks fail, then a precondition stops it  — October, every site: the rows are the week's rule over the month, in the roster's order  — ["w_1","w_2","w_5"] !== ["w_1","w_2","w_3","w_5"]
  PASS  «יוסף גבס added into «סה"כ עובדים»»: red - 5 of its checks fail  — October, every site: and its total is the men's «נוכחות» added - no count of Rima or יוסף גבס in it  — 10 !== 8
  PASS  «the billed row without Rima's men»: red - 16 of its checks fail  — October, הרצליה: «סה״כ ימי עובד־אתר» is the invoice's count on every day, and its total  — [[2,0,1,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],8]
  PASS  «the door keeping the site chosen before it»: red - 1 of its checks fail  — the door, after a site was chosen and the board left, opens it on every site again  — ["p_1","לוח חודשי · אוקטובר 2026 · ⁨הרצליה⁩"] !== [null,"לוח חוד
  PASS  «the filter naming a site the invoice's way, not the board's»: red - 2 of its checks fail  — the filter names each as the legend does - one site, one name, on one board  — [["p_1","הרצליה"],["p_98","אתר שאינו ברשימה 1"],["p_99","אתר שאינו ברשי
  PASS  «a name opening his card on this month whatever month the board is on»: red - 1 of its checks fail  — a name on October's board opens his card and puts it on October - its calendar, his days - drawn again  — [["w_2","drawn on null"],null] !== [["w_2","
  PASS  «a week across two months opening its Friday's»: red - 1 of its checks fail  — a week of Friday the 30th of October to Thursday the 5th of November opens November - five of its six working days  — ["2026-10-30","2026-10"] !== ["2
  PASS  «two sites that read alike in two letters left alike»: red - 8 of its checks fail  — the board names them over the whole record, as the week's cell does, and gives each its own mark  — [["p_1","הרצליה","ה"],["p_98","אתר שאינו ברשימה 2"
  PASS  «one site's days called «נוכחות»»: red - 4 of its checks fail  — one site: the last column is «ימים באתר», and his number is said as his days there, not as his attendance  — ["נוכחות","⁨אבי טסט⁩ · 3 ימים באתר","⁨בני
  PASS  «a man who is not active said to be one who is»: red - 2 of its checks fail  — every site: the last column is «נוכחות», and a man who is not active is said to be one, as his button shows him  — ["נוכחות","⁨אבי טסט⁩ · 3 ימי נוכחות
  PASS  «the paper of a month not over without the day it was made»: red - 3 of its checks fail  — this month's paper says the day it was made, after its title  — "לוח חודשי · נובמבר 2026" !== "לוח חודשי · נובמבר 2026 · נכון ל־⁦10/11/2026⁩"
831/831 checks passed
```

`tests/monthboard.browser.mjs` on the same commit, as printed:

```
pages of A4 landscape: 12 men 1, 25 men 2, 40 men 2
PASS  within 4,096px a side  — 2664x3922
the board drawn: 99 ms, 309 ms at 4x; its picture 606 ms at 4x (3922px)
459/459 checks passed
```


## What it is

A third mode of the week tab (`js/ui/monthboard.js`). Its door is the week grid's corner cell:
`button#monthBoardDoor` «לוח חודשי», where «עובדים / ימים» stood - the words stay for paper, and
the header row is no taller for it (measured at three phones x two schemes x the large display).
The board: one row per man (every active man, and a man who is not active only in a month he
worked, marked «לא פעיל»), one column per date of the calendar month (a Saturday only when
something was recorded on it), each cell the week's own cell (the site's colour, its letter in
white, ● a doubled day, + extra hours, «נעדר» an absence), his «נוכחות» at the row's end,
«סה"כ עובדים» per date at the foot, and «רישום לרימא» and «עובדי יוסף גבס» each apart, with its
note, in no total. «חודש קודם» / «חודש הבא» step the months - the two of them the whole row, on
every month - and «החודש», at the end of the site's row off this month, comes back; «אתר»
narrows it to one site, and the foot is then the invoice's own rows for it - «בלי עובדי רימא» (on
the screen only), «רישום לרימא», «סה״כ ימי עובד־אתר» - with יוסף גבס apart, and the last column is
his days there, «ימים באתר». A cell or a date opens that day; a name opens his card, on the
board's month. It opens on today's column (on a Saturday nothing was recorded on, the Friday
before it) with no day half under the names, and a commit or an adopted snapshot leaves the
reader where he was: the grid's scroll, the page's and the focus. «🖨️ הדפסה» prints it on A4
landscape; «🖼️ שיתוף כתמונה» shares it as a picture read off the board's DOM; a month not over
says on both the day they were made. Two sites that read alike get letters that tell them
apart. It writes nothing and prices nothing.

## Files changed (`git diff --stat 6ab193d 32d4e6e`)

```
 css/app.css                     |   52 ++
 css/design.css                  |  149 +++++
 css/large.css                   |   39 ++
 features/monthboard/contract.md |  382 +++++++++++
 features/monthboard/handoff.md  |  576 ++++++++++++++++
 index.html                      |    6 +
 js/ui/monthboard.js             | 1175 ++++++++++++++++++++++++++++++++
 js/ui/printout.js               |    2 +
 js/ui/week.js                   |   18 +-
 package.json                    |    6 +-
 sw.js                           |    1 +
 tests/README.md                 |    2 +
 tests/largetext.browser.mjs     |   15 +-
 tests/monthboard.browser.mjs    |  907 +++++++++++++++++++++++++
 tests/monthboard.test.mjs       | 1406 +++++++++++++++++++++++++++++++++++++++
 tests/screens.mjs               |    9 +
 16 files changed, 4736 insertions(+), 9 deletions(-)
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

## Every hook in an existing file (line numbers at `32d4e6e`; only the stylesheets' moved in fix round 1)

| file:line | what |
|---|---|
| `js/ui/week.js:14-23` | `setWeekPhoneMode` learns `'month'` (anything else still `'days'`); entering it focuses `#monthBoardTitle`, leaving it for the grid focuses `#monthBoardDoor` |
| `js/ui/week.js:57-63` | top of `renderWeek`, before `clear(root)`: in the month mode, with a crew and `renderMonthBoard` defined, the board is drawn instead of the week and the function returns |
| `js/ui/week.js:105-106` | the corner: `if (typeof monthBoardDoor === 'function') corner.appendChild(monthBoardDoor());` before the span «עובדים / ימים» |
| `js/ui/printout.js:186, 195` | `printoutImage`: `kind === 'month'` → `readMonthPrintout()` (behind `typeof`) and `planMonthPrintout(spec, probe, family)` |
| `index.html:1198-1203` | the comment and `<script src="js/ui/monthboard.js">`, after find.js |
| `sw.js:113` | `'./js/ui/monthboard.js'` in SHELL |
| `css/design.css:775-923` | the board's look (screen), one commented block |
| `css/large.css:701-726, 1294-1305` | block 3's restatement, block 4's shapes |
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
| the legend | the sites drawn, `paintSite`, their letters (`monthBoardLegendLetters`: `siteInitial`, two letters where two share it, the letters where the names part where two still read alike) and names |
| one site: the last column | his days at that site, under «ימים באתר» (on every board «נוכחות») |

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
- `rowNameAtSite(name, total)` (fix round 1): «{name} · יום אחד באתר» / «{name} · {total} ימים באתר» - the same on a board narrowed to one site
- `siteTotal` (fix round 1): «ימים באתר» - the last column's head on a board narrowed to one site
- `asOf(date)` (fix round 1): «נכון ל־{date}» - after the paper's and the picture's title of a month not over
- (fix round 1, no new word) an inactive man's spoken name: «{name} · לא פעיל · …», the week's own «לא פעיל»
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
agree). 9 the cost. 10 the picture's reading. 11 THE MUTANTS. And, since fix round 1, the
review's: the door after a site was chosen opens every site; a week across two months opens the
month most of it is in; a name on a past month's board puts his card on that month; «החודש»
at the end of the site's row; an inactive man's spoken name; one site's «ימים באתר»; the paper's date; two
unlisted sites named by the board's one map in the filter, the legend and every cell; and the
letters where two letters are not enough - seven cases and a board.

Negative tests among them: «בלי עובדי רימא» never in the picture's spec and `paper: false` on
its row alone; no Saturday column without a record, and a weekday with nothing still a column;
no two letters without a shared letter (`siteInitial` untouched); a man who left before the month
is not a row, and nobody off the board has attendance; `renderWeekCell` never called, the pay
sheet never asked, no writer or Store named in the file, nothing run at load; a site with nothing
that month is the empty board; December offers no print or share; and the mutants, each a
fault a careless edit could make, each run in a child process and red by a claim: an absence
counted as a day; «בלי עובדי רימא» read into the picture; the facts telling their readers every
foot row may leave the phone; every Saturday a column; two letters for every site; the week's one letter where two
share it; a narrowed board keeping the other sites' blocks; a narrowed board drawing an absence;
a man who worked and left dropped; יוסף גבס added into «סה"כ עובדים»; the billed row without Rima;
and fix round 1's eight - the door keeping a site, the filter naming a site the invoice's way, the
card on this month whatever the board's, a week across two months opening its Friday's, two sites
that read alike left alike, one site's days called «נוכחות», a man not active said to be one, the
paper of a month not over without its date. Nineteen in all; the `paper` one renamed for what it
is (a lie told to the facts' readers - see fix round 1, 7).

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
budgets. Since fix round 1 also: the door on a phone on its side and wider (five sizes, the mode
off and on); the names' column's spoken name (CDP); no day half under the names as the board
opens (twelve setups); «חודש קודם» and «חודש הבא» twice at one spot at a person's pace, and the
arrows' rectangles on and off this month; the paper's date in this month's picture; a name on
October's board opening his card on October, and Escape forgetting the month; the door's words
and every cell's words inside their boxes at doubled text; the paper's title read off its first
line; off this month «החודש» in the site's row with the header no taller, and the floors on
October's board at every setup and at doubled text.

## Expectations moved, deliberately

- `tests/screens.mjs`: two entries added after 'week - days' - 'week - the month board' and
  'week - the month board, one site' (opened by `openMonthBoard`, closed by
  `setWeekPhoneMode('grid')`). The one suite that walks that list, tests/largetext.browser.mjs,
  now walks the board too: with the mode on nothing under 18px, 7:1, 52px targets; with it off the
  app's floors. That is the point: a new screen joins the list (CLAUDE.md).
- `tests/largetext.browser.mjs`: `'month'` joins the shared pictures drawn with the mode off and
  on - the same width, height, length and SHA-256.
- No pinned value of any existing suite changed. Fix round 1 moved four expectations of this
  track's own Node suite and one of its browser suite, each because the change was the point
  (listed in the fix round's section above).
- Red on this branch by design, and nothing else: tests/build.test.mjs «the stamps were moved by
  the commit that moved the bytes» (2 checks) and tests/gate.integrity.test.mjs §4 (1 check) -
  the stamps are the integrator's.

## Test output of the build, on `3b46cae`, from a clean tree (fix round 1's are at the top)

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

## Paper, the picture, the budgets (the build's run on `3b46cae`; fix round 1's at the top)

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

Fix round 1's, written on `32d4e6e` in
`/tmp/claude-0/-home-user-farkad/d6a64352-db1a-5c3b-b54d-5c09103f2419/scratchpad/feat-monthboard/fix1/shots/`:
the suite's own set again (`board-440x956-dark.jpg`, `board-320x568-light-large.jpg` and their
`-full`, `board.pdf`, `board-site.pdf`, `board-picture.png`), and from `fix1/probe/glass.mjs`
`fix1-november-375x667-light.png` (this month: the two arrows, no «החודש»),
`fix1-october-375x667-light.png` (October: «החודש» at the end of the site's row) and
`fix1-card-from-october-375x667.png` and `fix1-card-calendar-october-375x667.png` (the card a name on
October's board opens: its top, the current pay period with its dates, and its calendar on October -
7 days with a site, his row's 7).

The build's:

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
8. **The door opens the month most of the week is in** - its Monday's, the 4th of its seven days
   - and not the Friday's (fix round 1, finding 11); the week that holds today opens this month.
9. **«החודש» ends the site's row** off this month, as tall as the list, not between the arrows
   (finding 9); on this month there is none, as before.
10. **One site's last column is «ימים באתר»**, not the borrowed «נוכחות», on screen, on paper and
    in the picture, and the name's spoken label says his days there (finding 4).
11. **The paper's h1 and the picture's title** of a month not over end in «נכון ל־{date}»; the
    screen's title is `MONTH_BOARD_TEXT.title` as before (finding 19).
12. **The letters have a third level**, where two sites still read alike in two letters (finding 15).

## NOT DONE

- The «מה חדש» item, the three stamps, docs/releases.md and CLAUDE.md: the integrator's (texts
  below).
- Track `status`'s real call to `openMonthBoard(null, null)`: tested with a stub caller that
  shuts a dialog and calls it a task later (criterion 12's alternative), not on the merged tree.
- Nothing of the contract's criteria is left undone.
- Of the review of v206 (fix round 1): findings 12 (the dates row scrolls away), 13 (the header
  fills the first screen at 320 with the mode) and 14 («נוכחות» a swipe away) are left for the
  owner, each a change of layout he should see first; and of 19, the days after today are not
  shaded on paper or in the picture - the date in the title says it.

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
  days at a time below it (the contract states that price). Off this month it is no taller:
  «החודש» ends the site's row. Measured in fix round 1's section; finding 13, left for the owner.
- The dates row scrolls away with the page: a man low on a long crew is read against columns
  with no date over them (finding 12, left). Paper repeats the dates on every page.
- A man's «נוכחות» is the last column, a long swipe away on a phone (finding 14, left); his name
  says it to a screen reader.
- The paper of a large crew is small type (dates 7pt, letters 6.5pt) on two pages; readable in the
  PDF, unproven on a printer.
- A 40-man month's picture is near the 4,096px cap; a larger crew is scaled down to fit, its
  letters smaller.
- The letters' third level makes some marks less obvious than a site's two first letters («תי»
  for «תל אביב - דיזנגוף» when another site of the board already reads «תד»); the legend says
  which is which, on paper too.
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
5. (fix round 1) The new words «ימים באתר», «{שם} · {N} ימים באתר» / «יום אחד באתר» and «נכון ל־{תאריך}»?
   **Default: as proposed**, pinned; the owner corrects.
6. (fix round 1) The header at 320 with the mode, the dates row that scrolls away, and the total
   a swipe away (findings 13, 12, 14)? **Default: as built** - each is a change of layout the
   owner should see first: a compact header (back and title on one line, arrows and filter in one
   row, print and share at the foot), dates that stick (a second vertical scroller in the page,
   or the dates row repeated every N men), and «נוכחות» pinned beside the names on screen only.
7. (fix round 1) Shade the days after today on paper and in the picture, besides the date in the
   title? **Default: no** - the date says it; one more mark on paper is the owner's call.

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
> «חודש הבא» walk the months and never move («החודש», off this month, ends the site's row);
> «אתר» narrows it to one site, the foot then the invoice's own rows for it («בלי עובדי
> רימא» on the screen only, «רישום לרימא», «סה״כ ימי עובד־אתר») and יוסף גבס apart, and the last
> column his days there, «ימים באתר». A cell or a date opens that day; a name opens his card on
> the board's month. The door opens the month most of the week on screen is in (the week of today:
> this month). It opens on today's column (on a Saturday nothing was recorded on, the Friday before
> it), no day half under the names, and a commit or a snapshot adopted from another phone leaves
> the reader where he was - the grid's scroll, the page's and the focus. Two sites that read alike
> in two letters («תל אביב - …») take the letters where their names part.
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
> is on neither (the owner's v167 ruling). A month not over carries on both the day they were made
> («נכון ל־…»).
>
> **Moved expectations (two, deliberate).** tests/screens.mjs lists the board and the one-site
> board after 'week - days', so tests/largetext.browser.mjs walks them; that suite also draws the
> month's picture with the large display off and on and holds it the same PNG. No pinned value
> changed.
>
> **Hebrew - PROPOSED**, one block in js/ui/monthboard.js, pinned in tests/monthboard.test.mjs:
> «לוח חודשי»; «לוח חודשי · {חודש} {שנה}» and «… · {אתר}»; «אתר»; a name's spoken label «{שם} · {N}
> ימי נוכחות» / «{שם} · יום נוכחות אחד», and on one site «{שם} · {N} ימים באתר» / «… · יום אחד באתר»
> (an inactive man's with the week's «לא פעיל» after his name); one site's last column «ימים
> באתר»; «נכון ל־{תאריך}» after the paper's title of a month not over; the picture's file
> farkad-לוח-חודשי-YYYY-MM.png. Fourteen borrowed words are found in their owners. No existing
> string changed.
>
> **Known not covered.** Not tried on a real phone, and not on WebKit at all (the paper's date row
> uses display: contents, fixed for Chrome's repeated header). The paper was not printed. At
> 320x568 with «תצוגה גדולה» the board's header fills most of the first screen and the grid shows
> two days at a time; the dates row scrolls away with the page and «נוכחות» is a swipe away on a
> phone (the review of v206 named all three; left for the owner). The month is said in the title
> and not again between the arrows.

**CLAUDE.md, the file list:**

```
    js/ui/monthboard.js        v206: «לוח חודשי» - the crew's month as a third mode of the week tab (weekPhoneMode
                               'month'), its door the grid's corner cell: a row per man, a column per date (a
                               Saturday only when recorded), the week's own cell, «נוכחות», the counts at the
                               foot; «אתר» narrows it to one site with the invoice's own rows («בלי עובדי רימא»
                               on the screen only); paper on A4 landscape and the picture read off its DOM
                               (readMonthPrintout / planMonthPrintout); memory only, no key written, no shekel;
                               openMonthBoard(key, site) for other screens, called one task after a dialog shut;
                               a name opens his card on the board's month (the card's own WORKER_CARD_MONTH)
    tests/monthboard.test.mjs  v206: the board on devices - the rows, every cell renderWeekCell's node for node,
                               «נוכחות» payrollReport's, the foot the week's and the reports', the Saturdays, two
                               letters, the column it opens on, nothing written, the words, the cost, the
                               picture's reading; the review of v206's faults held; nineteen mutants, each red
    tests/monthboard.browser.mjs v206 in Chromium: the door at three phones x schemes x the large display, the grid
                               plus one node, the door on a phone on its side and wider, the corner's spoken
                               name, the ways in and out, two steps at one spot, the card on the board's month,
                               the place kept across a commit and an adopted snapshot, the floors and doubled
                               text, a real PDF (12/25/40 men: 1, 2, 2 pages), the picture read off its PNG,
                               the budgets
```

**CLAUDE.md, a sentence for the long paragraph:**

> v206 adds «לוח חודשי» (js/ui/monthboard.js): the crew's month as a third mode of the week tab,
> entered from the grid's corner cell - a row per man, a column per date (a Saturday only when
> recorded), the week's own cell, «נוכחות» and the counts at the foot, narrowed by «אתר» to one
> site with the invoice's own rows («בלי עובדי רימא» on the screen only, never on paper or in the
> picture; there its last column is «ימים באתר»), printed on A4 landscape and shared as a picture
> read off its DOM - a month not over with the day they were made; a reading - no key
> written, no shekel priced, the month and the site memory only, so an update's reload lands on
> the week's grid; it names every man and is not paper for a client; its Hebrew is proposed and
> pinned in tests/monthboard.test.mjs; not tried on a real phone (docs/releases.md, v206).
