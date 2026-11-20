# Handoff — «דוחות ומקדמות מהירים» (track `speed`, for v206)

- Branch: `feat-speed`, worktree `/home/user/farkad/.claude/worktrees/feat-speed`
- **Fix round 1** (2026-11-20, the review of `adb60aa`): code-final commit `7af295a`. `ea92a19` carries every
  change under `js/` (`js/ui/reports.js` only) with the Node suites' checks; `9ab1c1d` adds the browser suite's
  rows, the two rows of tests/README.md and one line of tests/speed.test.mjs (a condition tests/nonassertions.test.mjs
  read as a literal); `3e2b867` times the owner's Thursday rows on three pages of each build; `7af295a` times rows
  12 and 14 by the act's own synchronous call - nothing under `js/` after `ea92a19`. From clean detached worktrees:
  `npm test` in full and the season suite on `9ab1c1d`; the four scripts that read the test files and this track's
  browser suite on `7af295a`; six existing browser suites on `3e2b867` and nine on `ea92a19` (the same served
  files) - said per suite below.
  This report is committed on top of it as the branch's last commit (its SHA is the one handed back to the
  workflow) and adds `features/speed/handoff.md` and nothing else.
- Round 0: code-final `22830d3`, its report `adb60aa`; its outputs are in that commit's copy of this file.
- Base (contract): `6ab193d68c960e4a56d947673c282b867acd258f` (origin/main, v204).
- Contract: `features/speed/contract.md`, Revision 2 (prototype D), byte for byte the program's scratchpad copy
  (SHA-256 `b8644419…f68f7`), re-read from disk at the start of this round: unchanged. NOT edited in this round -
  it is the program's document; where its text is wrong about what was measured, this report says so (Where the
  contract was wrong, items 10-13).
- Build stamps: NOT moved (v204 in all three), on purpose - the integrator moves them. Hence the expected red
  named below.

## Fix round 1 (2026-11-20): the review's ten findings

Each finding was opened at its cited file and line on `adb60aa` (the round-0 head) and its evidence re-run
where it was cheap to (the review's probes live in
`/tmp/claude-0/-home-user-farkad/d6a64352-db1a-5c3b-b54d-5c09103f2419/scratchpad/review-speed/`; this round's
in `/tmp/claude-0/-home-user-farkad/d6a64352-db1a-5c3b-b54d-5c09103f2419/scratchpad/speed-fix1/`). All ten are
CONFIRMED; none was discarded.

| # | finding (the review's severity) | triage | outcome | the check - red before, green after |
|---|---|---|---|---|
| 5 | P1: every reading takes two JSON copies of the whole record; a man's page of «מקדמות» 39 → 119 ms at 4x | CONFIRMED - `ensureKey` (reports.js:262) and `finish` (:389) both call `reportSharedKey` | **fixed** - a reading that adopted the kept memo and worked out no answer and no sheet of its own goes back on the shelf under its key with no second copy | speed.test 4 «…each of its readings takes ONE copy of the record» (every repeated reading took 2 before) and 22 «a man's page … ONE copy» (`[2]` → `[1]`); browser row 12 |
| 6 | P2: a letter typed into «מקדמות»'s search re-reads every listed man's advances outside the reading | CONFIRMED - reports.js:709 | **fixed** - `reportReadOnce(paint)` | speed.test 8 «every question of the seven asked inside a reading» (70 bare calls for one letter before) and 22 «a letter typed…» (`[true,70,[],70]` → `[true,0,[1],0]`); browser row 14 |
| 2 | P2: criterion 17 and row 6 ran on season-open, where the count is 0 and no line shows | CONFIRMED - speed.browser.mjs:157, 194, 204, 212 | **fixed** - rows 5, 6 and criterion 17 on season-closed and season-skipped, the real `#closeReminderOpen` pressed | browser 17 «its line is up, counting N men», «pressing the line opened «סגירת שבוע», offering N men», the count a fresh count's and v204's - on every one of three pages of each build (`3e2b867`) |
| 7 | P2: the Thursday flow is timed only where the line never shows; where it shows, rows 5-6 miss their fractions | CONFIRMED - the review's runs, and this round's (below) | **partly fixed, partly left** - measured where the line shows, held to never slower than v204 with the fraction printed, and the memo that answered the dialog read off the page; the contract's Goal 6, its "a few ms" and the release draft corrected here. LEFT: a Thursday faster than v204 on these records - it needs the copies of the record answered from memory between readings, which the contract rules out (another record is never answered from memory, reports.js:58-60), and the copies are made in `js/model/ledger.js` (`outstandingWithout`, a close's plan) and `js/ui/weeklyclose.js` (`weeklyCloseWithoutEmpties`), both files this track may not touch | browser rows 5 and 6 on season-closed and season-skipped, the medians of three fresh pages of each build (`3e2b867`) |
| 1 | P3: S4 keeps the gate plan's 4,000 far-future fortnights of sheets: +50 MB | CONFIRMED - reports.js:383, 391-392; re-run: 4,006 sheets, 65 MB retained | **fixed** - the sheets the gate's own question prices while it plans are shared inside the reading and not put aside; the plan's walks are still kept | speed.test 23 «the reading kept N sheets…»: 4,004 before, 2 after |
| 3 | P3: S4's pristine copy of a sheet the reading itself priced is untested | CONFIRMED - the review's mutant passes every criterion | **fixed** (a check) | speed.test 19 «a sheet worked out and written into in one reading: the next reading is handed the real function's rows»: false on the mutant, true on this build (`probe-mutant19.mjs`) |
| 8 | P3: the closing box re-plans the close outside the reading on every digit and on both buttons | CONFIRMED - reports.js:3108, 3124 | **fixed** - `paint` and `selected` inside `reportReadOnce`; `closeAccountFor`'s re-plan at the moment of the write is left bare on purpose (the writer's own check of the record as it is NOW) | speed.test 8 «every question … inside a reading» (1,056 bare calls before) and 22 «two figures typed … every question asked inside a reading» |
| 9 | P3: browser rows 2 and 11 cannot fail when S3 is missing or the tick is back in its key | CONFIRMED - each ceiling was a tenth of v204's row 1, above this build's own first reading | **fixed** - also ≤ 1/4 of this build's own first draw in the same page, and the memo kept before the redraw must be the memo that answered it | browser rows 2 and 11 (`speedKept`): red with S3 taken out (both) and with the tick put back in the key (row 11), green here - the page's predicate run in Node on the two mutants (`probe-kept-mutants.mjs`) |
| 4 | P3: the integrator's `REPORT_SHARED_KEPT` reset list names lines that moved | CONFIRMED - `git show` of the three heads and of `release-v206` | **fixed** - re-pointed by name and line (For the integrator) | none executable - a document about other branches' files; every line checked with `git show` on `b95149a`, `f4cf70b`, `9a4b8e7` and the merged `release-v206` (`d2d4710`) |
| 10 | P3: the proposed «מה חדש» item repeats v196's | CONFIRMED - whatsnew.js:131-135 | **fixed** - a new proposal that leads with what is new since v196 (For the integrator) | none executable here - `js/ui/whatsnew.js` is the integrator's, who pins the item in tests/whatsnew.test.mjs; measured against that suite's rules (title 34 ≤ 40, one sentence of 98 ≤ 120, no «נשלח», an existing `go`) |

Ran on the code before the fix, the new checks of tests/speed.test.mjs fail and nothing else does: `96/104`
on `adb60aa`'s `js/` with this round's two test files copied in (a scratch detached worktree), the eight
reds being criterion 8, criterion 4, the five checks of 22 and 23's kept sheets (`before.speed.test.out`);
`104/104` on this round's code.

The browser rows were run, not mutated, in Chromium (three runs, below: `9ab1c1d` with one page of each build on the
Thursday rows, `3e2b867` with three, `7af295a` with rows 12 and 14 timed by the act's own synchronous call); what their memo checks would say about the two
failures finding 9 names was run in Node instead (Negative proof, (c)). Criterion 17's new checks need no mutant to
show they can fail: on season-open, where the old row ran, the line is down and the count 0 on both builds, so
«its line is up, counting N men» is false there - which is why the rows moved to the records where it is up.

### What moved

**Fix round 1 - what moved in `js/ui/reports.js`** (`ea92a19`; nothing else under `js/`):
- *One copy of the record for a reading that adds nothing* (`reportShareLedger`'s `finish`, `sizeOf`). A reading
  that adopted the kept memo, worked out no answer (the memo's count of answers is the count it was adopted
  with, and it is still the same memo object) and priced no sheet the kept set lacks, goes back on the shelf
  under its key as it is - no second `reportSharedKey`. The second key is the check that answers a reading WORKED
  OUT were worked out on the record its first key read; this reading worked none out, and whether the record
  moved since is the next reading's first key's question, as it always was. A reading that adds anything still
  takes both.
- *The search of «מקדמות»*: its `input` listener runs `paint` inside `reportReadOnce`, as the page's own draw
  does.
- *The closing box*: `paint` (the preview at every figure typed) and `selected` (the plan «הצג בדוח» and «סגור
  את החשבון» each ask before they act) inside `reportReadOnce`, as the box's own draw is. `closeAccountFor`'s
  re-plan at the moment of the write (and the one that says why nothing was written) stay bare: they are the
  writer's own look at the record as it is NOW, and run once per close.
- *The plan's sheets* (`reportReadOnce`, `planning`): while the gate's own question is answered - the plan of the
  migration, on a record nobody approved - a range priced is shared inside the reading as v196 shares it and not
  put aside for the next one. The plan's walks are still kept (S1), so a plan asked again on the same record (the
  gate's kept answer has the tick in its key, and a send's receipt moves it) is answered from them and prices no
  sheet.

### Measured in this round (beside the suites' own clocks, below)

Memory, Node 22 with `--expose-gc`, the heap held after ONE draw of «דוחות» ← «לפי עובד» (`probe-memory.mjs`,
`probe-memory2.mjs`; the disks the review generated with this track's own `seasonDisk`):

| record | v204 | round 0 (`adb60aa`) | fix round 1 | what `REPORT_SHARED_KEPT` holds after it |
|---|---|---|---|---|
| season-closed, nobody approved, + a man who owes 1,000 and has no daily rate | 14.7 MB (the review) | 65.1 MB (the review) | **25.9 MB**; 26.3 MB re-run on `9ab1c1d` | 2 sheets (82 rows; round 0: 4,006 sheets, 164,246 rows), 16,175 walks, the record as text |
| season-closed, approved | 12.9 MB | - | 15.6 MB | 18 sheets, 277 walks, 48 positions |
| season-open, approved | - | - | 17.5 MB | 77 sheets, 1,396 walks, 80 positions |

On the unapproved record the draw took 5.9 s (the re-run, at load 3-5: 7.9 s; the review: 5.6 s; v204 54 s), drawn again
57 ms (120), and drawn again after a provenance key moved the tick - the gate's kept answer misses and the migration is
planned again - 192 ms (301):
the plan is answered from the walks that were kept and prices no sheet; all three draws the same bytes.

Chromium 1194 at 4x, 375x667, fresh pages of each build alternating, 4 pages each and 3 men a page
(`glass.mjs manpage closed 4`, `glass-manpage-closed.jsonl`; load 2.6-3.4), season-closed, «מקדמות» drawn first:

| act (the synchronous call, ms) | v204, median (all) | fix round 1, median (all) |
|---|---|---|
| a man's page of «מקדמות» | 48 (21-74) | **67** (53-118) - the review measured 39 / 119 on round 0 |
| back to the list | 198 | 171 |
| «סגירות שנרשמו» from the board | 770 | 267 (0.35) |
| «סגירות שנרשמו» again, the board between | 831 | 288 (0.35) |

The suite's own rows (tests/speed.browser.mjs: 2, 5 and 6 on the three seasons, 11, 12, 13, 14) are below, under
the budget.

## The results, in one place

| gate | where | result |
|---|---|---|
| `npm test`, one script at a time (109 scripts) | `9ab1c1d`, clean detached worktree | **107 green, 2 red** - the two expected reds (`test:build`, `test:gate-integrity`: the stamps, the integrator's); 12,945 / 12,947 checks |
| the four scripts that read the test files `7af295a` changed (isolation, build, nonassertions, gate-integrity) | `7af295a`, a second clean detached worktree | test:isolation 18/18; test:build 68/69; test:nonassertions 23/23; test:gate-integrity 19/20 - build and gate-integrity the same two expected reds |
| `tests/speed.test.mjs` (in `npm test`) | `9ab1c1d` (in the chain; not changed since) | 104/104, 9.0 minutes |
| `tests/speed.season.test.mjs` (in `test:all`) | `9ab1c1d` (not changed since) | 94/94, 36.5 minutes |
| `tests/speed.browser.mjs` (in `test:all`) | `7af295a`, through `bt`, Chromium 1194 | 99/99, 15.4 minutes in the slot |
| (its first run, on `9ab1c1d` - one page of each build on the owner's Thursday rows) | `9ab1c1d`, through `bt`, Chromium 1194, load 8-11 | 66/67: the one red a clock, season-skipped's reading after a write 1.28x of v204 against 1.25x + 30 ms on one page each - so `3e2b867` takes three pages of each build there |
| (its second run, on `3e2b867` - three pages each) | `3e2b867`, through `bt`, Chromium 1194, load 3-5 | 98/99: every Thursday row green; the one red row 12, where v204's man's page took under the 50 ms a long task needs and the observer recorded 0 ms for two men of three - so `7af295a` times rows 12 and 14 by the act's own synchronous call |
| the existing browser suites this round's changes reach (15), one after another in ONE slot | nine on `ea92a19`, six on `3e2b867` (the same served files as `7af295a`) | 15 / 15 green; 3,769 checks |
| this round's new checks on the code BEFORE the fix | `adb60aa`'s `js/`, this round's two test files, a scratch worktree | 96/104 - the eight new checks red, nothing else |
| the review's S4 mutant (the pristine copy dropped) against criterion 19's new case | this round's `reports.js`, in Node (`probe-mutant19.mjs`) | caught (re-run on the final code: `live ... true` / `mutant ... false`) |
| every other suite of `test:all` | round 0, `22830d3` (design and smoke `9404c76`) | 60 / 60 green then; not re-run in this round (NOT done) |
| `npm run test:all` as one command, `test:release`, the emulator suites | - | NOT run (the task's rule) |

Every output byte is v204's on every way in compared: 10 records x 3 readings, 9496 readings on the seeded records and fixtures; both medium records x 3 readings, 4588 readings on the medium season; 450 ways in on season-closed, 67 ways in on season-open, the season-skipped ones; the DOM of eight surfaces and the shared picture in Chromium.

## Files changed (`git diff --stat 6ab193d..7af295a`)

```
 features/speed/contract.md    |  969 +++++++++++++++++++++++++
 features/speed/handoff.md     | 1607 +++++++++++++++++++++++++++++++++++++++++
 js/ui/advancereset.js         |    2 +-
 js/ui/owes.js                 |    5 +-
 js/ui/reports.js              |  404 ++++++++++-
 package.json                  |    7 +-
 tests/README.md               |    5 +
 tests/gate.integrity.test.mjs |    5 +-
 tests/owes.test.mjs           |    5 +
 tests/speed.browser.mjs       |  500 +++++++++++++
 tests/speed.season.test.mjs   |  368 ++++++++++
 tests/speed.seed.mjs          |  892 +++++++++++++++++++++++
 tests/speed.test.mjs          |  842 +++++++++++++++++++++
 13 files changed, 5579 insertions(+), 32 deletions(-)
```


- `js/ui/reports.js` - `REPORT_SHARED_KEPT` beside `REPORT_GATE_KEPT`; above `reportReadOnce`: `REPORT_SHARED_READERS`,
  `REPORT_SHARED_DEPENDS`, `reportSharedKey`, `reportSharedFound`, `reportSharedRows`, `reportSharedApart`,
  `reportShareLedger` (S1, S3, S4); `reportReadOnce` installs it, keeps v196's three inside the `try` and puts
  everything back in one `finally`; one paragraph in the reading's comment block. `reportGateKey` untouched.
- `js/ui/owes.js` - `owesReadNow` reads `owesRead` inside `reportReadOnce` (S2): three lines and a comment.
- `js/ui/advancereset.js` - the one line of `advanceResetAfter` that read the board bare, through `owesReadNow()`.
- `tests/owes.test.mjs` - the contract's one moved set-up (:1012-1019), below.
- `tests/speed.seed.mjs` - the helper (records, phones, ways in, counter, snapshot); asserts nothing.
- `tests/speed.test.mjs` - `npm test`: criteria 1-12 and 19-21, deterministic.
- `tests/speed.season.test.mjs` - `test:all`: the medium season against v204, the three seasons, criteria 2, 4,
  8, 9 on them, and the clocks (13).
- `tests/speed.browser.mjs` - `test:all`: criteria 14-18 in Chromium at 4x.
- `package.json` - `test:speed` appended to `test`; `test:speed-season`, `test:speed-browser` appended to
  `test:all`; the three scripts.
- `tests/README.md` - three rows and the helper's paragraph.
- `tests/gate.integrity.test.mjs` - `HELPERS` gains `'speed.seed.mjs'`.
- `features/speed/contract.md` - the contract, copied in before any code; `features/speed/handoff.md` - this.
- (fix round 1) `js/ui/reports.js` again (`ea92a19`, above); `tests/speed.seed.mjs`, `tests/speed.test.mjs`,
  `tests/speed.season.test.mjs`, `tests/speed.browser.mjs` and two rows of `tests/README.md` - this track's own
  (`9ab1c1d`: the browser rows, the README rows and one line of `tests/speed.test.mjs`; `3e2b867`: the Thursday rows on three pages;
  `7af295a`: rows 12 and 14 by the act's own call).

Commits, oldest first: `d530a32` the contract; `f9bc05b` S1; `90a3482` S2; `0753250` S3 + the owes.test set-up;
`77e63e2` S4; `6a15dfc` the suites; `a349c31` the medium season's v204 side moved to the season suite;
`9404c76` the later-track row taken out and counted; `247bcfa` the season-open «סגירות שנרשמו» unmoved cell;
`6caaba1` criterion 8's printout names every counted function; `22830d3` the browser suite's two faults; `adb60aa`
round 0's report; then fix round 1: `ea92a19` reports.js and the Node checks; `9ab1c1d` the browser rows, the
README rows and the one condition; `3e2b867` the Thursday rows on three pages of each build; `7af295a` rows 12 and 14 by
the act's own synchronous call; then this report.

## What it does (one paragraph per step of the contract)


**S1 - the ledger's folds and each man's walk, once per reading** (`js/ui/reports.js`, `reportShareLedger`,
installed by `reportReadOnce`). For the length of one reading, and only for the schedule it opened on, the
seven readers of a man's walk (`ledgerEntries`, `foldLedger`, `advanceHistory`, `overpaidAdvances`,
`advanceOutstanding`, `advanceWalk`, `advancePositionInto`) answer each question once; anything else -
another schedule, another argument count, an id that is neither a string nor a number - goes to the real
function. Each wrapper tests `asked !== schedule` first, is installed only where the real reader is loaded
(`advanceHistory` also needs `ledgerEntries`), and answers from memory only while every name of
`REPORT_SHARED_DEPENDS` is as present as when the reading opened (`weeklyCloseOnce`, opened inside a
reading, installs readers that were absent). `appendLedgerEntry` is wrapped: an append to a copy with a
ledger object and a map of its own (the copy «סגירת שבוע» closes a man's empty weeks on) forgets nothing;
an append to the record, to a copy sharing its ledger object or map, to a non-object, or one that throws,
forgets every answer and the reading keeps nothing. Lists are handed out sliced, flat answers copied, the
fold shared (nothing writes into a fold; `currentAdvances`, the one writer, has no caller - pinned).
v196's three swaps now run inside the `try`; the `finally` puts back S1's wrappers, then v196's three, then
`REPORT_ONCE`, and only then decides what to keep.

**S2 - the board read inside the reading** (`js/ui/owes.js`, `owesReadNow`; `js/ui/advancereset.js`, one
line). `owesReadNow` reads `owesRead` inside `reportReadOnce` (typeof-guarded): «שים לב» read after paint
shares S1. «איפוס מקדמות»'s step 3 (`advanceResetAfter`) reads its board through `owesReadNow()` instead of
a bare `owesRead` (typeof-guarded; OWES_KEPT's own rule; kept for the next draw of «מקדמות»).

**S3 - kept between readings, under the record itself** (`REPORT_SHARED_KEPT`, beside `REPORT_GATE_KEPT`).
At the close, S1's answers are kept as `{ schedule, key, found, memo, sheets }`. The key is the new
`reportSharedKey`: today, the build's flags and the whole record as text, compared and never hashed - and
NOT the write tick (`reportGateKey` keeps the tick and is 6ab193d's body). `found` is the identity of every
function of `REPORT_SHARED_DEPENDS` (S1's seven, the appender, v196's three and every name js/model
feature-detects), read when the OUTERMOST reading opens. The key is asked lazily, at the first question of
the seven, inside the `try`; there the kept memo is taken off the shelf - adopted when it is the same
schedule object, the same key and the same readers, and nothing appended yet; dropped otherwise. At the
close it is kept again only when the key was worked out, nothing could reach the record, something was
asked, and `reportSharedKey(schedule)` still says the same - in a try/catch of its own. A reading that asks
none of the seven (the month's summary) works out no key.

**S4 - each range's pay sheet kept with S3** (v196's `payrollReport` wrapper). A range worked out in the
reading is handed out as v196 hands it and a pristine copy of its rows is put aside; a range asked after the
reading adopted a kept memo is handed a fresh copy of the kept rows (a new array of new row objects), which
is then the reading's. Rows are flat (pinned, criterion 20). Kept at the close with S1's memo.

**Fix round 1** changed four things in `js/ui/reports.js` (`ea92a19`): one copy of the record for a reading
that adds nothing, the search of «מקדמות» and the closing box's figures and buttons read inside the reading, and the
sheets the gate's own plan prices not kept - each said under «Fix round 1 → What moved», above.

Nothing in `js/model/**`, `js/sync/**`, `js/state.js`, `js/store.js`, `js/recovery.js`, `firestore.rules`,
`functions/**`; no screen, node, string, key, field path or writer; no CSS; nothing added to the shell.

## Migrations


None. No Store key, field path or record shape is added or changed, and nothing is written: the kept
answers live in memory and die with the page. (Records read: reports.speed's eight seeded records, two
fixtures, the medium season and the three season records, all written by the app's own writers; an
empty record is drawn by the existing suites - smoke, mobile - which pass, below.)

## Tests added (negative tests included)


`tests/speed.seed.mjs` - a helper, asserts nothing (in `HELPERS`): `seasonDisk('open' | 'closed' | 'skipped')`
and `mediumDisk({ closes })`, written through the harness by the app's own writers (assignPlace, markAbsent,
the two counts, addAdvance, the boot mirror, `planCarryMigration` asked inside `reportReadOnce` for the
approval, closes through `closePeriodChanges` + `saveFinancialAction` inside `weeklyCloseOnce(…, { memo:
false })`); phones of this tree or of v204 (`git show 6ab193d:` of the three changed files, every other file
checked to be 6ab193d's bytes); the ways in; the `COUNTER` of real calls (installed before any reading);
the node snapshot (reports.speed's), with the later-track rule for «מקדמות» (below).

`tests/speed.test.mjs` (`test:speed`, appended to `npm test`) - deterministic, no clock:
- **11** the source: no file of js/model, js/sync, state, store, recovery differs from 6ab193d;
  `js/ui/weeklyclose.js` is 6ab193d's; `js/ui/advancereset.js` differs in exactly one line of
  `advanceResetAfter`; `currentAdvances(` has no caller in js/; every S1 wrapper's first statement is
  `asked !== schedule`; `reportSharedKey`'s body names no Store and no tick; `reportGateKey`'s body is
  6ab193d's; `REPORT_SHARED_DEPENDS` ⊇ S1's seven + the appender + v196's three + every name of
  `grep -ohE "typeof [A-Za-z_]+ [!=]==? 'function'" js/model/` (a name added to the model's feature
  detection fails it); js/model names no `Store.`, `localStorage`, `FarkadSync`, `Date.now(`, `new Date(`,
  `todayStr(` (one `new Date(Date.UTC(year, month - 1, day))` is pure date arithmetic and is the one
  exception, named).
- **1** every way in - «דוחות» both sections over the seven ranges, the pay rows, the workbook, every man's
  statement, days and closing box, «מקדמות», each man's page, «סגירות שנרשמו», each close's page, owesRead and
  owesReadNow, «סגירת שבוע»'s list (JSON), the reminder's count, every card, the payslips of both periods, two
  months' summaries, «איפוס מקדמות»'s reading - on reports.speed's eight seeded records, the over-settled
  fixture (v201) and the out-of-order fixture (v198), under the three readings of the gate: v204's bytes cold,
  each way in twice, and the whole list twice more (S3/S4 warm); «איפוס מקדמות»'s step 3 after a real
  `advanceResetWrite`, against v204.
- **2** (plan) `planCarryMigration` inside a reading equals the bare plan, JSON for JSON, on the medium season.
- **8** the counts for EVERY way in, on the medium season (with closes): `ledgerEntries`/`foldLedger` at most once
  per state of the record, `advanceWalk` once per (man, from, to, carriedIn), `advancePositionInto` once per
  (man, from), `overpaidAdvances` once per man, `advanceOutstanding` once per advance, `payrollReport` once per
  range, `reportSharedKey` ≤ 2 and 0 for a way in that asks none of the seven; v204's counts printed beside.
- **4** each way in repeated on the unmoved record asks the seven nothing and `payrollReport` only for ranges
  asked before its first question of the seven; «סיכום חודש» asks what v204 asks and works out no key.
- **3** after 26 kinds of write (a day, an absence, the two counts, an advance, a repayment, a reversal, a close,
  «סגירת שבוע»'s pass, «איפוס», a rate and a cycle, a man archived, the approval removed and restored in memory,
  a change in memory with no write, a refused commit rolled back, a snapshot adopted from a second phone, ↶, the
  day turning, a provenance key that moves the tick and not the record, …): every way in equals the same way
  drawn afresh (`REPORT_ONCE` planted, the gate answered once per record text); the seven are called again after
  every write but the tick-only one (0). The v204 column of the same scenario is in the season suite.
- **5 (negative)** a reader that throws inside a reading; `todayStr` planted to throw; `reportSharedKey` planted to
  throw at the first question and at the close: every way in ends as v204's does (the same bytes or the same
  throw), every reader and v196's three are the real ones again, `REPORT_ONCE` is null, nothing kept.
- **6 (negative)** another record (a JSON copy, and a shallow copy with a ledger map of its own) asked twice inside
  a reading: two real calls, answers equal to the real function's, two objects.
- **7 (negative)** `advanceHistory`, `foldLedger`, `ledgerEntries` taken away: still absent inside the reading;
  warm, the memo kept with it is refused and every way in is v204's without it; cold the same; taken away and put
  back: 2,000 / 3,000 / 3,000 / 2,000 / 2,000 as the model says each time; smoke's :7071 case held both ways.
- **9 (negative)** appends inside a reading: (a) a copy of its own keeps every answer (no real call) and the
  reading is kept; (b) a copy sharing the ledger map, (c) sharing the ledger object, (d) the record, (e) one that
  throws - every later answer real, nothing kept.
- **10** no write inside any way in (spies on the commits, the appender on the record, Store's writers) and the
  whole disk byte for byte - across criterion 1's 8,464 readings and «איפוס»'s step 3 (and, in the season suite,
  across the medium season's 3,844).
- **12** the gate at most once per reading and never on an approved record, for every way in, «שים לב» after
  paint and «איפוס»'s step 3 included.
- **19 (negative)** a stub writing into a row of an adopted sheet: the reading's own copy changes as v196 would;
  the next reading is handed rows equal to the real function's and draws v204's bytes; two readings, two arrays.
- **20** every field of every row of every sheet the records produce is flat.
- **21** one memo at a time: another schedule object, another key, other readers - dropped at the first question;
  the same schedule, key and readers adopted and put back; a reading that asks none of the seven leaves it alone.

`tests/speed.season.test.mjs` (`test:speed-season`, appended to `test:all`): the medium season's v204 side
(criteria 1 and 3 against v204 - moved here by the contract's own run-time rule, below); the three season
records seeded once (with their shape checked); criterion 2 (season-closed every way in, season-open «דוחות»,
every statement, four men's cards, days and closing boxes and the pages of «מקדמות» against v204, the workbook
and the payslips cold against warm; season-skipped's list, reminder, «מקדמות» and cards cold and unmoved; the
plan inside a reading equal to the bare plan on season-closed); criterion 4's zeros and criterion 9's real
thing on season-skipped; criterion 8 on season-open for every way in and the ≥ 50x rule on season-closed;
criterion 13, the clocks.

`tests/speed.browser.mjs` (`test:speed-browser`, appended to `test:all`): criteria 14-18 in Chromium 1194,
375x667, DPR 2, touch, CPU 4x, `serviceWorkers: 'block'`; this tree and 6ab193d's (materialised from Git)
served side by side, each checked byte for byte against its commit; every row in a fresh page.

**Fix round 1 added to `tests/speed.seed.mjs`**: the Node DOM keeps every node's listeners and `speedFire` calls
them (tests/moneydom.mjs drops them), so a way in can type into a field or press a button the page drew; two
ways in - «מקדמות», a letter typed into its search (`speedSearch`), and his closing box, figures typed ('1', which
may be more than he may give, then '0', which never is) and «הצג בדוח» pressed (`speedBoxTyped`); and the counter
marks where each outermost reading opens and closes (`readingsOf`) and records every question of the seven about
the record asked outside all of them (`bare`).

**Fix round 1 added to `tests/speed.test.mjs`** (deterministic, as the rest):
- **8** per READING now (a way in that types into a drawn page is a reading for the page and one for each hand on
  it): each reader once per question a reading, the key at most twice a reading, and no question of the seven
  asked outside a reading - red on the code before the fix (the search's letter 70 bare calls, the box's two
  figures and press 552-1,056).
- **4** every reading of a repeated way in takes ONE copy of the record - red before (every one took two).
- **5** the key plants say when they throw, and "at the close" is a reading's SECOND key: a way in in which a key
  threw keeps nothing; one in which none threw may put back what it adopted (`it did throw, in N of 35 ways in`).
- **19** a sheet the reading itself priced, written into in that same reading: the next reading is handed the real
  function's rows - false on the review's mutant (no pristine copy), true here (`probe-mutant19.mjs`).
- **22 (new)** a hand on a drawn page, on the medium season, v204's bytes each: a man's page of «מקדמות» opened from
  the board (the seven asked nothing, ONE copy of the record), a letter and then another typed into its search
  (inside one reading each, nothing bare, one copy), two figures typed into a closing box and «הצג בדוח» pressed
  (three readings, nothing bare, each question once a reading, the press - the last figure's own plan - working
  out nothing new: one copy). All five red before.
- **23 (new)** a record nobody approved with a man who owes and has no daily rate (seed 4): the draw plans the
  migration once, prices his four thousand fortnights (`priced > 1000`) and keeps 2 sheets (4,004 before); the draw
  is v204's; after a provenance key moved the tick the gate plans again from the kept walks - the seven asked
  nothing - and the bytes are v204's.

**Fix round 1 in `tests/speed.season.test.mjs`**: criterion 8 on season-open per reading and with no bare question,
as in `npm test`; the new ways in ride along everywhere `waysOf` is used (season-closed: every man's box typed into
against v204, the search; season-open: the search).

**Fix round 1 in `tests/speed.browser.mjs`**: season-skipped seeded too; rows 5 and 6 and criterion 17 on season-closed
and season-skipped, the real `#closeReminderOpen` pressed, the line up with a count > 0 equal to a fresh count and to
v204's, the dialog up and offering men, on THREE fresh pages of each build, alternating, every page checked and the medians held to never
slower than v204 (1.25x + 30 ms), every sample printed (`3e2b867`; `9ab1c1d` took one page each, and its run at load 10 put
season-skipped's reading at 1.28x - a coin toss between two builds that are level there);
season-open's rows 5 and 6 kept as clocks, its count 0 and no line asserted instead of compared; rows 2 and 11 also
≤ 1/4 of this build's own first draw in the same page; and wherever a row reads an unmoved record the memo kept
before it must be the memo that answered it, with nothing worked out anew (`speedHold`, `speedKept`, read off
`REPORT_SHARED_KEPT`); new rows 12 (a man's page of «מקדמות» from the board, the median of three men, ≤ 1.25x
v204's + 60 ms), 13 («סגירות שנרשמו» from the board, ≤ 1/2) and 14 (letters typed into the search on season-open,
the first and the median of six, ≤ 1/4 each) - those two timed by the act's own synchronous call or the longest task
after it, whichever is longer (`own`, `7af295a`: a long-task observer records nothing under 50 ms, and on `3e2b867`'s
run v204's man's page read 0 ms for two men of three); a median pools its samples (`pooled`: finished only if all
finished, a disk moved if any moved it).

## Negative proof: six guards taken out of `js/ui/reports.js`, one at a time, and `tests/speed.test.mjs` run on each


In a scratch detached worktree at `247bcfa`, each mutant applied to `js/ui/reports.js` by a script, the suite run,
the file put back (`git checkout`), the tree clean at the end. Every mutant goes red:

```
M1	exit 2	389s		6 FAIL lines	(load 7.49 6.08 5.40)
M2	exit 1	396s	86/90 checks passed	4 FAIL lines	(load 8.10 7.25 6.19)
M3	exit 1	380s	84/90 checks passed	6 FAIL lines	(load 6.27 7.12 6.56)
M4	exit 1	330s	88/90 checks passed	2 FAIL lines	(load 3.29 5.47 6.09)
M5	exit 1	285s	80/90 checks passed	10 FAIL lines	(load 4.81 4.74 5.56)
M6	exit 1	325s	88/90 checks passed	2 FAIL lines	(load 5.19 5.00 5.44)
```

- **M1 - S1 never installed** (`shared.install()` removed: no shared answer, so no S3 and no S4 either). Caught by
  the counts, as the contract wants ("the counts, not the clocks, are what catch S1 gone missing"):
  `32 ways in on the medium season, each read cold: every rule of the count — ["the default account: «דוחות» ← «לפי
  עובד»: ledgerEntries once …`, `one draw of «לפי עובד»: v204 listed the ledger 1390 times, this build 1390`,
  criterion 4 (3,907 real calls of the seven on a repeated way in), criterion 3, `S3: a memo was kept at the end
  of 0 of 30 sequences`, and criterion 5's set-up (`SETUP FAILED: … a memo is kept beforehand`, which ends the run).
- **M2 - every append treated as separate** (nothing ever forgets): criterion 9 (b), (c), (d), (e) - `{"threw":false,
  "real":0,"kept":false}` … `{"threw":true,"real":0,"kept":true}`: later answers came from memory after an append
  that reached the record, and after a throw the reading was even kept.
- **M3 - the readers' presence and identity never compared**: criterion 7 - the memo kept with a reader is no
  longer refused when it is taken away (warm), the in-reading presence rule is gone (cold), and the critic's case
  reads `[2000,2000,2000,2000,2000] !== [2000,3000,3000,2000,2000]`.
- **M4 - S4 hands out the kept rows themselves**: criterion 19 - `the next reading of the unmoved record is handed
  rows equal to the real function's` (a stub's `amount: -1` reached the next reading) and `two readings are handed
  two arrays`.
- **M5 - the kept key without the record**: criterion 11's source check, criterion 1's «איפוס מקדמות» step 3 against
  v204 on all eight seeds (a stale board after the reset's write), and criterion 3 (`a day typed: … not as afresh`, …).
- **M6 - the write tick put back into the key**: criterion 11's source check, and criterion 3's tick-only write -
  `a write that moves the tick and not the record: the first reading after it called the seven 353 times - nothing
  was kept across it`.

**Fix round 1's negative proof.** (a) This round's `tests/speed.test.mjs` and `tests/speed.seed.mjs` copied into a
scratch detached worktree at `adb60aa` - the code BEFORE the fix - and run whole: `96/104`, and the eight reds are
exactly the new checks (`before.speed.test.out`):

```
**FAIL**  35 ways in on the medium season, each read cold: every rule of the count  — [... his closing box, figures typed and «הצג בדוח» pressed: every question of the seven asked inside a reading ({"keys":2,"readings":1,"bare":1056,...}) ... «מקדמות», a letter typed into its search: every question of the seven asked inside a reading ({"keys":2,"readings":1,"bare":70,...})]
**FAIL**  35 ways in, each twice on the unmoved record: ... each of its readings takes ONE copy of the record  — [... «דוחות» ← «לפי עובד»: reading 1 worked out nothing new and took 2 copies of the record ... (every way in)]
**FAIL**  a man's page of «מקדמות» opened from the board, the record unmoved: v204's page, the seven asked nothing, ONE copy of the record  — [true,0,[2]] !== [true,0,[1]]
**FAIL**  a letter typed into its search: v204's list, asked inside ONE reading, the seven asked nothing, one copy of the record  — [true,70,[],70] !== [true,0,[1],0]
**FAIL**  and the next letter the same  — [true,10,[]] !== [true,0,[1]]
**FAIL**  two figures typed into w_1's closing box and «הצג בדוח» pressed: what v204 shows and chooses, every question asked inside a reading - one for each figure, one for the press  — [true,1056,0] !== [true,0,3]
**FAIL**  each asking each question once, and the press - the last figure's own plan - working out nothing new: one copy of the record  — []
**FAIL**  and the reading kept 4004 sheets: the ranges the draw itself read, none of the plan's  — 4004
96/104 checks passed
```

(Every byte comparison passed there too: the old code drew the same pages - what it did wrong was cost and memory,
never a figure.) (b) The review's mutant - `pristine.set(range, rows)`, the copy dropped - against criterion 19's new
case, on this round's `reports.js` (`probe-mutant19.mjs`, one device each): `live kept: true next reading handed
the real rows: true` / `mutant kept: true next reading handed the real rows: false`. (c) The browser rows that
read the kept memo off the page (`speedHold` / `speedKept`, rows 2 and 11) against the two failures the review named,
in Node with the page's own predicate (`probe-kept-mutants.mjs`, the medium season; not run as mutants in Chromium):

```
live: row 2 {"same":true,"grew":false}  row 11 {"same":true,"grew":false}
S3 missing: row 2 {"same":false,"grew":false}  row 11 {"same":false,"grew":false}
the tick in the key: row 2 {"same":true,"grew":false}  row 11 {"same":false,"grew":false}
```

Both rows require `{ same: true, grew: false }`: with S3 gone both go red, and with the write tick back in
`reportSharedKey` row 11 - the row named for it - goes red (row 2 moves no tick, so it holds there, rightly).

## The suites, run on the code-final commit `7af295a` and on `9ab1c1d` before it

`3e2b867` and `7af295a` changed only `tests/speed.browser.mjs` and a row of `tests/README.md` after `9ab1c1d`: `npm test` and the season suite ran on `9ab1c1d`, the four scripts that read the test files again on `7af295a` (and on `3e2b867`, the same), this track's browser suite on `7af295a` (its two earlier runs below), and six existing browser suites on `3e2b867`.

### `npm test`, IN FULL, one script at a time, on a clean detached worktree at `9ab1c1d`

commit 9ab1c1d3c6682fb2b8334b89dc05d4e13ea0ee4d started 03:37:10; DONE 04:18:11 (UTC). 109 scripts: **107 green, 2 red**; 12,945 of 12,947 checks. Every script's exit code, time, count and the load at its end, as `chain.sh` wrote them (other tracks' suites ran beside it, and this track's browser suite from 04:46:55):

<details><summary>109 lines</summary>

```
test:isolation	exit 0	1s	18/18 checks passed	(load 3.21 1.97 0.92)
test:blobs	exit 0	2s	11/11 checks passed	(load 3.43 2.04 0.95)
test:build	exit 1	1s	68/69 checks passed	(load 3.43 2.04 0.95)
    **FAIL**  and nothing in the shell has changed since  — 3 changed since 6ab193d6: js/ui/advancereset.js, js/ui/owes.js, js/ui/reports.js
test:poison	exit 0	0s	37/37 checks passed	(load 3.43 2.04 0.95)
test:merge	exit 0	0s	28/28 checks passed	(load 3.43 2.04 0.95)
test:contested	exit 0	16s	73/73 checks passed	(load 3.34 2.09 0.98)
test:held	exit 0	4s	83/83 checks passed	(load 4.11 2.27 1.05)
test:snapshot-stale	exit 0	2s	16/16 checks passed	(load 4.11 2.27 1.05)
test:reports-rules	exit 0	2s	26/26 checks passed	(load 3.86 2.25 1.05)
test:finance	exit 0	8s	57/57 checks passed	(load 3.63 2.23 1.05)
test:weekly-range	exit 0	0s	21/21 checks passed	(load 3.63 2.23 1.05)
test:finance-wording	exit 0	2s	12/12 checks passed	(load 3.42 2.21 1.05)
test:weekly-unpriced	exit 0	0s	23/23 checks passed	(load 3.42 2.21 1.05)
test:receipt	exit 0	2s	28/28 checks passed	(load 3.42 2.21 1.05)
test:data	exit 0	44s	1970/1970 checks passed	(load 3.14 2.30 1.13)
test:recovery	exit 0	2s	82/82 checks passed	(load 3.14 2.30 1.13)
test:adversarial	exit 0	5s	116/116 checks passed	(load 3.29 2.35 1.15)
test:probes	exit 0	7s	35/35 checks passed	(load 2.78 2.27 1.14)
test:capacity	exit 0	12s	48/48 checks passed	(load 2.66 2.26 1.15)
test:concurrency	exit 0	3s	46/46 checks passed	(load 2.45 2.22 1.14)
test:exports	exit 0	2s	112/112 checks passed	(load 2.45 2.22 1.14)
test:fence	exit 0	3s	35/35 checks passed	(load 2.49 2.24 1.15)
test:fence-ingress	exit 0	0s	43/43 checks passed	(load 2.49 2.24 1.15)
test:fence-legacy	exit 0	0s	21/21 checks passed	(load 2.49 2.24 1.15)
test:money-history	exit 0	1s	9/9 checks passed	(load 2.49 2.24 1.15)
test:money-units	exit 0	0s	21/21 checks passed	(load 2.49 2.24 1.15)
test:money-cloud	exit 0	1s	17/17 checks passed	(load 2.49 2.24 1.15)
test:money-display	exit 0	1s	4/4 checks passed	(load 2.49 2.24 1.15)
test:snapshot-poison	exit 0	2s	82/82 checks passed	(load 2.45 2.23 1.16)
test:samefact	exit 0	5s	37/37 checks passed	(load 2.25 2.19 1.15)
test:wording	exit 0	1s	37/37 checks passed	(load 2.25 2.19 1.15)
test:closure	exit 0	24s	122/122 checks passed	(load 2.82 2.31 1.22)
test:closure-echo	exit 0	1s	79/79 checks passed	(load 2.82 2.31 1.22)
test:correction	exit 0	0s	33/33 checks passed	(load 2.82 2.31 1.22)
test:quarantine	exit 0	2s	82/82 checks passed	(load 2.82 2.31 1.22)
test:approval	exit 0	10s	72/72 checks passed	(load 2.86 2.33 1.24)
test:repayment	exit 0	5s	240/240 checks passed	(load 3.03 2.38 1.26)
test:ledger-ingress	exit 0	0s	167/167 checks passed	(load 3.03 2.38 1.26)
test:cas	exit 0	13s	88/88 checks passed	(load 3.05 2.41 1.29)
test:status	exit 0	6s	37/37 checks passed	(load 3.12 2.44 1.30)
test:money	exit 0	3s	40/40 checks passed	(load 2.95 2.41 1.30)
test:money-ingress	exit 0	10s	206/206 checks passed	(load 2.73 2.38 1.30)
test:method	exit 0	3s	51/51 checks passed	(load 2.73 2.38 1.30)
test:restore	exit 0	0s	51/51 checks passed	(load 2.73 2.38 1.30)
test:upgrade	exit 0	2s	48/48 checks passed	(load 2.83 2.41 1.32)
test:vehicles	exit 0	2s	86/86 checks passed	(load 2.83 2.41 1.32)
test:xlsx	exit 0	2s	104/104 checks passed	(load 2.76 2.40 1.32)
test:nonassertions	exit 0	1s	23/23 checks passed	(load 2.76 2.40 1.32)
test:labels	exit 0	0s	23/23 checks passed	(load 2.76 2.40 1.32)
test:labelcache	exit 0	0s	32/32 checks passed	(load 2.76 2.40 1.32)
test:restore-ledger	exit 0	3s	26/26 checks passed	(load 2.76 2.40 1.32)
test:roster-upgrade	exit 0	6s	55/55 checks passed	(load 3.05 2.47 1.36)
test:roster-race	exit 0	7s	63/63 checks passed	(load 2.88 2.45 1.35)
test:exports-proof	exit 0	2s	44/44 checks passed | 92/92 checks passed	(load 2.88 2.45 1.35)
test:ledger-truth	exit 0	6s	148/148 checks passed	(load 3.29 2.55 1.40)
test:races	exit 0	4s	109/109 checks passed	(load 3.29 2.55 1.40)
test:overlap-restore	exit 0	21s	117/117 checks passed	(load 6.13 3.26 1.67)
test:refute-roster	exit 0	10s	24/24 checks passed	(load 6.55 3.44 1.74)
test:refute-restore	exit 0	43s	25/25 checks passed	(load 4.80 3.37 1.79)
test:gate-integrity	exit 1	1s	19/20 checks passed	(load 4.80 3.37 1.79)
    **FAIL**  no cached file has changed since the three stamps last moved  — ea92a194 reports.js: one copy of the record for a reading that adds n | 77e63e22 reports.js: each range's pay sheet kept with the walks, as r | 07532505 reports.js: the walks kept between readings of a record that | 90a34820
test:queuecost	exit 0	7s	18/18 checks passed	(load 4.67 3.39 1.81)
test:paycycle	exit 0	0s	43/43 checks passed	(load 4.67 3.39 1.81)
test:paycycle-blockers	exit 0	3s	17/17 checks passed	(load 4.67 3.39 1.81)
test:paycycle-completion	exit 0	5s	31/31 checks passed	(load 4.46 3.37 1.81)
test:crew-controls	exit 0	1s	46/46 checks passed	(load 4.18 3.33 1.81)
test:simple-advances	exit 0	1s	66/66 checks passed	(load 4.18 3.33 1.81)
test:worker-deletion	exit 0	11s	86/86 checks passed	(load 5.31 3.60 1.91)
test:calendar	exit 0	0s	58/58 checks passed	(load 5.31 3.60 1.91)
test:reminders	exit 0	1s	48/48 checks passed	(load 5.31 3.60 1.91)
test:move-late	exit 0	5s	48/48 checks passed	(load 5.60 3.69 1.95)
test:codex-probes	exit 0	1s	17/17 checks passed	(load 5.60 3.69 1.95)
test:codex2-probes	exit 0	1s	36/36 checks passed	(load 5.64 3.73 1.97)
test:codex3-probes	exit 0	3s	59/59 checks passed	(load 5.64 3.73 1.97)
test:rima	exit 0	93s	496/496 checks passed	(load 4.82 3.98 2.24)
test:yosefgeves	exit 0	95s	562/562 checks passed	(load 4.54 4.15 2.47)
test:seder	exit 0	1s	135/135 checks passed	(load 4.54 4.15 2.47)
test:bars-stale	exit 0	0s	60/60 checks passed	(load 4.54 4.15 2.47)
test:transport	exit 0	1s	566/566 checks passed	(load 4.54 4.15 2.47)
test:transport-share	exit 0	13s	304/304 checks passed	(load 6.03 4.49 2.61)
test:oracle	exit 0	58s	121/121 checks passed	(load 5.33 4.59 2.76)
test:overpayment	exit 0	7s	105/105 checks passed	(load 5.27 4.60 2.78)
test:polish	exit 0	0s	73/73 checks passed	(load 5.27 4.60 2.78)
test:daycheck	exit 0	8s	169/169 checks passed	(load 5.81 4.73 2.83)
test:journey	exit 0	0s	233/233 checks passed	(load 5.81 4.73 2.83)
test:workercard	exit 0	33s	180/180 checks passed	(load 6.48 5.00 2.99)
test:monthsummary	exit 0	127s	98/98 checks passed	(load 8.79 6.44 3.78)
test:payslips	exit 0	57s	202/202 checks passed	(load 9.81 7.18 4.21)
test:find	exit 0	1s	91/91 checks passed	(load 9.81 7.18 4.21)
test:whatsnew	exit 0	1s	160/160 checks passed	(load 9.81 7.18 4.21)
test:account-view	exit 0	56s	456/456 checks passed	(load 11.39 8.09 4.69)
test:usual	exit 0	3s	150/150 checks passed	(load 11.04 8.07 4.71)
test:sitecard	exit 0	7s	119/119 checks passed	(load 11.03 8.12 4.74)
test:reportsclarity	exit 0	9s	1119/1119 checks passed	(load 10.49 8.10 4.77)
test:largetext	exit 0	1s	107/107 checks passed	(load 10.49 8.10 4.77)
test:reportnames	exit 0	28s	36/36 checks passed	(load 9.95 8.20 4.91)
test:holiday	exit 0	1s	109/109 checks passed	(load 9.95 8.20 4.91)
test:undo-stale	exit 0	2s	32/32 checks passed	(load 9.95 8.20 4.91)
test:auditfix	exit 0	2s	34/34 checks passed	(load 11.07 8.47 5.01)
test:owes	exit 0	160s	190/190 checks passed	(load 10.90 9.51 5.97)
test:weeklyclose	exit 0	238s	146/146 checks passed	(load 11.16 10.43 7.16)
test:reports-speed	exit 0	369s	159/159 checks passed	(load 9.02 9.81 8.02)
test:closeorder	exit 0	1s	22/22 checks passed	(load 9.02 9.81 8.02)
test:closuresize	exit 0	26s	13/13 checks passed	(load 8.76 9.66 8.02)
test:closerace	exit 0	39s	29/29 checks passed	(load 9.05 9.67 8.09)
test:advancereset	exit 0	91s	77/77 checks passed	(load 7.22 9.05 8.02)
test:overpaidfix	exit 0	0s	85/85 checks passed	(load 7.12 9.00 8.01)
test:xlsxlook	exit 0	15s	293/293 checks passed	(load 7.31 8.95 8.01)
test:closereminder	exit 0	20s	107/107 checks passed	(load 7.36 8.85 8.00)
test:speed	exit 0	542s	104/104 checks passed	(load 5.86 7.52 7.82)
```

</details>

### The four scripts that read the test files, again on `7af295a` (a second clean detached worktree)

```
commit 7af295a9eefc364f2d30f6ee95b7386ad4e6af98
test:isolation	exit 0	0s	18/18 checks passed	(load 2.25 3.53 4.70)
test:build	exit 1	1s	68/69 checks passed	(load 2.25 3.53 4.70)
    **FAIL**  and nothing in the shell has changed since  — 3 changed since 6ab193d6: js/ui/advancereset.js, js/ui/owes.js, js/ui/reports.js
test:nonassertions	exit 0	1s	23/23 checks passed	(load 2.25 3.53 4.70)
test:gate-integrity	exit 1	0s	19/20 checks passed	(load 2.25 3.53 4.70)
    **FAIL**  no cached file has changed since the three stamps last moved  — ea92a194 reports.js: one copy of the record for a reading that adds n | 77e63e22 reports.js: each range's pay sheet kept with the walks, as r | 07532505 reports.js: the walks kept between readings of a record that | 90a34820
```

### `tests/speed.test.mjs` on `9ab1c1d` (in the chain: 104/104)

<details><summary>its output, whole</summary>

```
11. the source: nothing of the model, the sync, the state or the store; the key and its readers
  PASS  no file of js/model, js/sync, js/state.js, js/store.js, js/recovery.js, firestore.rules or functions differs from 6ab193d
  PASS  js/ui/weeklyclose.js is 6ab193d's
  PASS  every other file a phone here loads is 6ab193d's bytes, so the v204 side IS v204
  PASS  js/ui/advancereset.js differs from 6ab193d's in exactly one line
  PASS  and it is advanceResetAfter's board, through owesReadNow()
  PASS  inside advanceResetAfter
  PASS  currentAdvances - the one function that writes into a fold - has no caller in js/, so a shared fold is written by nobody
  PASS  S1 wraps the seven readers and the appender, and nothing else
  PASS  each of the seven tests `asked !== schedule` first
  PASS  the kept key is today, the flags and the record as text - and names no Store and no tick
  PASS  reportGateKey's body is 6ab193d's
  PASS  REPORT_SHARED_DEPENDS holds every name js/model feature-detects
  PASS  the names that are a parameter of their own function, and so not on the list
  PASS  and the seven, the appender and v196's three
  PASS  js/model names no Store., localStorage, FarkadSync, Date.now(, new Date() or todayStr(
  PASS  its one `new Date(` is built from the parts it is handed

1. every way in is v204's bytes - cold, again, and the whole list again
  PASS  10 records x 3 readings, 9496 readings of a screen (each way in cold, again, and the list again): every one v204's bytes
        ({"the gates shut: read the old way":10,"the gates open: read the new way":10,"the gates open, nobody approved: read the old way":9,"the gates open, nobody approved: read the new way":1})
  PASS  every way in ended as v204's did, and none of v204's threw
  PASS  5. after every way in, every reader is the one it was and no reading is left open
  PASS  10. not one write at any door during any of them: commit, commitMany, commitRoster, save, persist, an append to the record, Store.set/setVerified/remove
  PASS  10. and the whole disk byte for byte across all of them
  PASS  S3: a memo was kept at the end of 30 of 30 sequences (it is used, criterion 4)  — 30
        (the medium season, both records, against v204: tests/speed.season.test.mjs)
  PASS  the rows later tracks add to «מקדמות», taken out and counted: 0 on 316 boards drawn
  PASS  and the boards were drawn to count them on

1. «איפוס מקדמות»'s step 3: the board read after a real write is v204's
  PASS  seed 1: the result and the names it says still owe are v204's (4 of 4 men reset)
  PASS  seed 1: 10. reading it writes nothing, and 12. asks the gate nothing on an approved record
  PASS  seed 2: the result and the names it says still owe are v204's (4 of 4 men reset)
  PASS  seed 2: 10. reading it writes nothing, and 12. asks the gate nothing on an approved record
  PASS  seed 3: the result and the names it says still owe are v204's (3 of 3 men reset)
  PASS  seed 3: 10. reading it writes nothing, and 12. asks the gate nothing on an approved record
  PASS  seed 4: the result and the names it says still owe are v204's (3 of 3 men reset)
  PASS  seed 4: 10. reading it writes nothing, and 12. asks the gate nothing on an approved record
  PASS  seed 5: the result and the names it says still owe are v204's (4 of 4 men reset)
  PASS  seed 5: 10. reading it writes nothing, and 12. asks the gate nothing on an approved record
  PASS  seed 6: the result and the names it says still owe are v204's (2 of 2 men reset)
  PASS  seed 6: 10. reading it writes nothing, and 12. asks the gate nothing on an approved record
  PASS  seed 7: the result and the names it says still owe are v204's (3 of 3 men reset)
  PASS  seed 7: 10. reading it writes nothing, and 12. asks the gate nothing on an approved record
  PASS  seed 8: the result and the names it says still owe are v204's (3 of 3 men reset)
  PASS  seed 8: 10. reading it writes nothing, and 12. asks the gate nothing on an approved record
  PASS  records where v204's reset wrote something: 8, men reset: 26

2. the gate's own plan, asked inside a reading, is the bare plan
  PASS  the medium season: JSON for JSON
  PASS  the medium season: and it is a plan of something  — {"id":"cm_carry","rows":[],"needed":false}
  PASS  the medium season, closed in order: JSON for JSON
  PASS  the medium season, closed in order: and it is a plan of something  — {"id":"cm_carry","rows":[{"workerId":"w_2","from":"2026-05-29","to":"2026-06-11"

8. the counts, for every way in: each reader once per question, the key twice at most
  PASS  the month: it asks none of the seven - and so asks exactly what v204 asks, and works out no key
  PASS  the month before: it asks none of the seven - and so asks exactly what v204 asks, and works out no key
  PASS  35 ways in on the medium season, each read cold: every rule of the count
        v204 -> this build: the default account: «דוחות» ← «לפי עובד»: ledgerEntries 2506 -> 1, foldLedger 1497 -> 1, advanceHistory 1008 -> 0, overpaidAdvances 474 -> 15, advanceOutstanding 1008 -> 30, advanceWalk 459 -> 278, advancePositionInto 30 -> 30, payrollReport 39 -> 39, keys 2
        v204 -> this build: the default account: «דוחות» ← «לפי אתר»: ledgerEntries 1390 -> 1, foldLedger 834 -> 1, advanceHistory 556 -> 0, overpaidAdvances 278 -> 15, advanceOutstanding 556 -> 30, advanceWalk 278 -> 278, advancePositionInto 15 -> 15, payrollReport 39 -> 39, keys 2
        v204 -> this build: the default account: the pay rows: ledgerEntries 1390 -> 1, foldLedger 834 -> 1, advanceHistory 556 -> 0, overpaidAdvances 278 -> 15, advanceOutstanding 556 -> 30, advanceWalk 278 -> 278, advancePositionInto 15 -> 15, payrollReport 38 -> 38, keys 2
        v204 -> this build: the default account: the workbook: ledgerEntries 4170 -> 1, foldLedger 2502 -> 1, advanceHistory 1668 -> 0, overpaidAdvances 834 -> 15, advanceOutstanding 1668 -> 30, advanceWalk 834 -> 278, advancePositionInto 45 -> 15, payrollReport 39 -> 39, keys 2
        v204 -> this build: the default account: w_1: his statement: ledgerEntries 125 -> 1, foldLedger 75 -> 1, advanceHistory 50 -> 0, overpaidAdvances 25 -> 1, advanceOutstanding 50 -> 2, advanceWalk 25 -> 25, advancePositionInto 1 -> 1, payrollReport 25 -> 25, keys 2
        v204 -> this build: the default account: w_1: his days: ledgerEntries 255 -> 1, foldLedger 152 -> 1, advanceHistory 102 -> 0, overpaidAdvances 50 -> 1, advanceOutstanding 100 -> 2, advanceWalk 50 -> 25, advancePositionInto 0 -> 0, payrollReport 25 -> 25, keys 2
        v204 -> this build: the default account: w_1: his closing box: ledgerEntries 252 -> 1, foldLedger 152 -> 1, advanceHistory 100 -> 0, overpaidAdvances 50 -> 1, advanceOutstanding 100 -> 2, advanceWalk 50 -> 25, advancePositionInto 0 -> 0, payrollReport 25 -> 25, keys 2
        v204 -> this build: the default account: w_1: his closing box, figures typed and «הצג בדוח» pressed: ledgerEntries 630 -> 1, foldLedger 380 -> 1, advanceHistory 250 -> 0, overpaidAdvances 125 -> 1, advanceOutstanding 250 -> 2, advanceWalk 125 -> 25, advancePositionInto 0 -> 0, payrollReport 100 -> 25, keys 5
        v204 -> this build: the default account: w_2: his statement: ledgerEntries 65 -> 1, foldLedger 39 -> 1, advanceHistory 26 -> 0, overpaidAdvances 13 -> 1, advanceOutstanding 26 -> 2, advanceWalk 13 -> 13, advancePositionInto 1 -> 1, payrollReport 13 -> 13, keys 2
        v204 -> this build: the default account: w_2: his days: ledgerEntries 135 -> 1, foldLedger 80 -> 1, advanceHistory 54 -> 0, overpaidAdvances 26 -> 1, advanceOutstanding 52 -> 2, advanceWalk 26 -> 13, advancePositionInto 0 -> 0, payrollReport 13 -> 13, keys 2
        v204 -> this build: the default account: w_2: his closing box: ledgerEntries 132 -> 1, foldLedger 80 -> 1, advanceHistory 52 -> 0, overpaidAdvances 26 -> 1, advanceOutstanding 52 -> 2, advanceWalk 26 -> 13, advancePositionInto 0 -> 0, payrollReport 13 -> 13, keys 2
        v204 -> this build: the default account: w_2: his closing box, figures typed and «הצג בדוח» pressed: ledgerEntries 330 -> 1, foldLedger 200 -> 1, advanceHistory 130 -> 0, overpaidAdvances 65 -> 1, advanceOutstanding 130 -> 2, advanceWalk 65 -> 13, advancePositionInto 0 -> 0, payrollReport 52 -> 13, keys 5
        v204 -> this build: «מקדמות»: ledgerEntries 60 -> 1, foldLedger 30 -> 1, advanceHistory 30 -> 0, overpaidAdvances 0 -> 0, advanceOutstanding 30 -> 30, advanceWalk 0 -> 0, advancePositionInto 0 -> 0, payrollReport 0 -> 0, keys 2
        v204 -> this build: «סגירות שנרשמו»: ledgerEntries 1 -> 1, foldLedger 1 -> 1, advanceHistory 0 -> 0, overpaidAdvances 76 -> 12, advanceOutstanding 152 -> 24, advanceWalk 76 -> 36, advancePositionInto 36 -> 36, payrollReport 10 -> 10, keys 2
        v204 -> this build: owesRead: ledgerEntries 1116 -> 1, foldLedger 663 -> 1, advanceHistory 452 -> 0, overpaidAdvances 196 -> 15, advanceOutstanding 452 -> 30, advanceWalk 181 -> 181, advancePositionInto 15 -> 15, payrollReport 38 -> 38, keys 2
        v204 -> this build: owesReadNow: ledgerEntries 1116 -> 1, foldLedger 663 -> 1, advanceHistory 452 -> 0, overpaidAdvances 196 -> 15, advanceOutstanding 452 -> 30, advanceWalk 181 -> 181, advancePositionInto 15 -> 15, payrollReport 38 -> 38, keys 2
        v204 -> this build: «סגירת שבוע»'s list: ledgerEntries 1 -> 1, foldLedger 1 -> 1, advanceHistory 0 -> 0, overpaidAdvances 269 -> 14, advanceOutstanding 566 -> 28, advanceWalk 269 -> 247, advancePositionInto 0 -> 0, payrollReport 37 -> 37, keys 2
        v204 -> this build: the reminder's count: ledgerEntries 1 -> 1, foldLedger 1 -> 1, advanceHistory 0 -> 0, overpaidAdvances 269 -> 14, advanceOutstanding 566 -> 28, advanceWalk 269 -> 247, advancePositionInto 0 -> 0, payrollReport 37 -> 37, keys 2
        v204 -> this build: the payslips, this period: ledgerEntries 2780 -> 1, foldLedger 1668 -> 1, advanceHistory 1112 -> 0, overpaidAdvances 556 -> 15, advanceOutstanding 1112 -> 30, advanceWalk 556 -> 278, advancePositionInto 30 -> 15, payrollReport 38 -> 38, keys 2
        v204 -> this build: the payslips, the period before: ledgerEntries 2630 -> 1, foldLedger 1578 -> 1, advanceHistory 1052 -> 0, overpaidAdvances 526 -> 15, advanceOutstanding 1052 -> 30, advanceWalk 526 -> 263, advancePositionInto 30 -> 15, payrollReport 36 -> 36, keys 2
        v204 -> this build: the month: ledgerEntries 0 -> 0, foldLedger 0 -> 0, advanceHistory 0 -> 0, overpaidAdvances 0 -> 0, advanceOutstanding 0 -> 0, advanceWalk 0 -> 0, advancePositionInto 0 -> 0, payrollReport 2 -> 2, keys 0
        v204 -> this build: the month before: ledgerEntries 0 -> 0, foldLedger 0 -> 0, advanceHistory 0 -> 0, overpaidAdvances 0 -> 0, advanceOutstanding 0 -> 0, advanceWalk 0 -> 0, advancePositionInto 0 -> 0, payrollReport 2 -> 2, keys 0
        v204 -> this build: «איפוס מקדמות»'s reading: ledgerEntries 1 -> 1, foldLedger 1 -> 1, advanceHistory 0 -> 0, overpaidAdvances 278 -> 15, advanceOutstanding 616 -> 30, advanceWalk 263 -> 263, advancePositionInto 0 -> 0, payrollReport 36 -> 36, keys 2
        v204 -> this build: «מקדמות», a letter typed into its search: ledgerEntries 88 -> 1, foldLedger 44 -> 1, advanceHistory 44 -> 0, overpaidAdvances 0 -> 0, advanceOutstanding 44 -> 30, advanceWalk 0 -> 0, advancePositionInto 0 -> 0, payrollReport 0 -> 0, keys 3
        v204 -> this build: w_1: his page of «מקדמות»: ledgerEntries 19 -> 1, foldLedger 8 -> 1, advanceHistory 10 -> 0, overpaidAdvances 0 -> 0, advanceOutstanding 8 -> 2, advanceWalk 0 -> 0, advancePositionInto 0 -> 0, payrollReport 0 -> 0, keys 2
        v204 -> this build: w_1: his card: ledgerEntries 260 -> 1, foldLedger 153 -> 1, advanceHistory 106 -> 0, overpaidAdvances 50 -> 1, advanceOutstanding 102 -> 2, advanceWalk 50 -> 25, advancePositionInto 2 -> 1, payrollReport 25 -> 25, keys 2
        v204 -> this build: w_2: his page of «מקדמות»: ledgerEntries 19 -> 1, foldLedger 8 -> 1, advanceHistory 10 -> 0, overpaidAdvances 0 -> 0, advanceOutstanding 8 -> 2, advanceWalk 0 -> 0, advancePositionInto 0 -> 0, payrollReport 0 -> 0, keys 2
        v204 -> this build: w_2: his card: ledgerEntries 140 -> 1, foldLedger 81 -> 1, advanceHistory 58 -> 0, overpaidAdvances 26 -> 1, advanceOutstanding 54 -> 2, advanceWalk 26 -> 13, advancePositionInto 2 -> 1, payrollReport 14 -> 14, keys 2
        v204 -> this build: a close's page 2026-07-23T15:00:00.000Z|d_office: ledgerEntries 2 -> 1, foldLedger 2 -> 1, advanceHistory 0 -> 0, overpaidAdvances 88 -> 12, advanceOutstanding 176 -> 24, advanceWalk 88 -> 36, advancePositionInto 40 -> 36, payrollReport 10 -> 10, keys 2
        v204 -> this build: a close's page 2026-07-09T15:00:00.000Z|d_office: ledgerEntries 2 -> 1, foldLedger 2 -> 1, advanceHistory 0 -> 0, overpaidAdvances 112 -> 12, advanceOutstanding 224 -> 24, advanceWalk 112 -> 36, advancePositionInto 48 -> 36, payrollReport 10 -> 10, keys 2
        v204 -> this build: a close's page 2026-07-02T15:00:00.000Z|d_office: ledgerEntries 2 -> 1, foldLedger 2 -> 1, advanceHistory 0 -> 0, overpaidAdvances 104 -> 12, advanceOutstanding 208 -> 24, advanceWalk 104 -> 36, advancePositionInto 44 -> 36, payrollReport 10 -> 10, keys 2
        v204 -> this build: a close's page 2026-06-25T15:00:00.000Z|d_office: ledgerEntries 2 -> 1, foldLedger 2 -> 1, advanceHistory 0 -> 0, overpaidAdvances 112 -> 12, advanceOutstanding 224 -> 24, advanceWalk 112 -> 36, advancePositionInto 54 -> 36, payrollReport 10 -> 10, keys 2
        v204 -> this build: a close's page 2026-06-18T15:00:00.000Z|d_office: ledgerEntries 2 -> 1, foldLedger 2 -> 1, advanceHistory 0 -> 0, overpaidAdvances 98 -> 12, advanceOutstanding 196 -> 24, advanceWalk 98 -> 36, advancePositionInto 50 -> 36, payrollReport 10 -> 10, keys 2
        v204 -> this build: a close's page 2026-06-11T15:00:00.000Z|d_office: ledgerEntries 2 -> 1, foldLedger 2 -> 1, advanceHistory 0 -> 0, overpaidAdvances 92 -> 12, advanceOutstanding 184 -> 24, advanceWalk 92 -> 36, advancePositionInto 50 -> 36, payrollReport 10 -> 10, keys 2
        v204 -> this build: a close's page 2026-06-04T15:00:00.000Z|d_office: ledgerEntries 2 -> 1, foldLedger 2 -> 1, advanceHistory 0 -> 0, overpaidAdvances 78 -> 12, advanceOutstanding 156 -> 24, advanceWalk 78 -> 36, advancePositionInto 38 -> 36, payrollReport 10 -> 10, keys 2
  PASS  the month's summary is among them, asking none of the seven  — 2
  PASS  one draw of «לפי עובד»: v204 listed the ledger 1390 times, this build 1

4. a way in repeated on an unmoved record: no walk, no fold, and a pay sheet only before its first question
  PASS  35 ways in, each twice on the unmoved record: the second asks the model nothing it already answered, and each of its readings takes ONE copy of the record
        (pay sheets worked out by the second reading, all before its first question: «דוחות» ← «לפי עובד» 1, «דוחות» ← «לפי אתר» 1, the pay rows 1, the workbook 1, his statement 0, his days 0, his closing box 0, his closing box, figures typed and «הצג בדוח» pressed 0, his statement 0, his days 0, his closing box 0, his closing box, figures typed and «הצג בדוח» pressed 0, «מקדמות» 0, «סגירות שנרשמו» 0, owesRead 0, owesReadNow 0, «סגירת שבוע»'s list 1, the reminder's count 1, the payslips, this period 1, the payslips, the period before 1, the month 2, the month before 2, «איפוס מקדמות»'s reading 0, «מקדמות», a letter typed into its search 0, his page of «מקדמות» 0, his card 1, his page of «מקדמות» 0, his card 2, a close's page 2026-07-23T15:00:00.000Z|d_office 0, a close's page 2026-07-09T15:00:00.000Z|d_office 0, a close's page 2026-07-02T15:00:00.000Z|d_office 0, a close's page 2026-06-25T15:00:00.000Z|d_office 0, a close's page 2026-06-18T15:00:00.000Z|d_office 0, a close's page 2026-06-11T15:00:00.000Z|d_office 0, a close's page 2026-06-04T15:00:00.000Z|d_office 0)
  PASS  and those copies were taken: 40 keys over the 35 repeats

3. after every kind of write, every way in is the record's: the same as afresh
  PASS  every way in, after each of 26 kinds of write: as the same way drawn afresh
        (the seven, called by the first reading after each: before anything 355, nothing changed 0, a day typed 355, an absence 355, the two counts 355, an advance 356, a repayment 356, a reversal 356, a close 356, «סגירת שבוע»'s pass 354, «איפוס מקדמות» 353, a rate and a cycle 353, a man archived 353, the approval removed in memory 215, the approval put back 353, a change in memory 353, the change taken back 353, a snapshot adopted 353, a day placed with ↶ ready 353, ↶ 353, the day turned 362, and back 353, the sends settled 0, a write that moves the tick and not the record 0, a new schedule object with the same text 341, a refused commit rolled back 341)
        (the same scenario against v204's files: tests/speed.season.test.mjs - the medium season's v204 side)

5. through every throw, every reader is put back, no reading is left open and nothing is kept from a failed key
  PASS  a reader that throws inside the reading: every way in ends as v204's does (the same bytes, or the same throw), and leaves the page clean
  PASS  todayStr that throws: every way in ends as v204's does (the same bytes, or the same throw), and leaves the page clean
  PASS  the kept key that throws at the first question: every way in ends as v204's does (the same bytes, or the same throw), and leaves the page clean
  PASS  the kept key that throws at the first question: and it did throw, in 33 of 35 ways in  — 33
  PASS  the kept key that throws at the close: every way in ends as v204's does (the same bytes, or the same throw), and leaves the page clean
  PASS  the kept key that throws at the close: and it did throw, in 20 of 35 ways in  — 20

6. inside a reading, another schedule is asked of the real functions, every time
  PASS  16 questions of another record, each asked twice: two real calls, two answers, each the real function's

7. a reader that is absent stays absent - cold, and warm
  PASS  advanceHistory taken away: inside the reading it is still absent
  PASS  advanceHistory taken away: the memo kept with it is refused, and every way in is v204's without it
  PASS  advanceHistory taken away, cold: every way in is v204's without it
  PASS  foldLedger taken away: inside the reading it is still absent
  PASS  foldLedger taken away: the memo kept with it is refused, and every way in is v204's without it
  PASS  foldLedger taken away, cold: every way in is v204's without it
  PASS  ledgerEntries taken away: inside the reading it is still absent
  PASS  ledgerEntries taken away: the memo kept with it is refused, and every way in is v204's without it
  PASS  ledgerEntries taken away, cold: every way in is v204's without it
  PASS  every reader, then advanceHistory taken away, then put back: 2,000 / 3,000 / 3,000 / 2,000 / 2,000 - as the model says each time
  PASS  a man's days with advanceHistory taken away, after a reading with it kept: as v204 draws them
  PASS  and cold

9. appends inside a reading: a copy of its own keeps every answer; anything that can reach the record forgets
  PASS  (a) a copy with a ledger object and a ledger map of its own: every later answer for the record still the reading's (no real call), and the reading is kept
  PASS  (b) a copy that shares the record's ledger map: every later answer is the real function's, and nothing of the reading is kept  — {"threw":false,"real":7,"kept":false}
  PASS  (c) a copy that shares its ledger object: every later answer is the real function's, and nothing of the reading is kept  — {"threw":false,"real":7,"kept":false}
  PASS  (d) the record itself: every later answer is the real function's, and nothing of the reading is kept  — {"threw":false,"real":7,"kept":false}
  PASS  (e) one that throws: every later answer is the real function's, and nothing of the reading is kept  — {"threw":true,"real":6,"kept":false}
  PASS  (it did throw)

12. the gate: at most one question per reading, none on an approved record - every way in, «שים לב» after paint included
  PASS  every way in, approved and not

19. a kept pay sheet is handed to a reading as rows of its own
  PASS  within the reading that adopted it, a row written into is the row the next asker sees, as v196 hands a sheet (one array)
  PASS  the next reading of the unmoved record is handed rows equal to the real function's, JSON for JSON
  PASS  and its draw is v204's
  PASS  two readings are handed two arrays
  PASS  a sheet worked out and written into in one reading: the next reading is handed the real function's rows, JSON for JSON
  PASS  (and the next reading was handed the kept sheet, not a sheet of its own)
  PASS  and its draw is v204's, after it too

20. every row of every pay sheet is flat - what S4's shallow copy relies on
  PASS  86069 pay sheets, 395453 rows: every field a string, a number, a boolean, null or undefined
  PASS  and there were sheets to read  — 86069 / 395453

21. one memo at a time, dropped at the first question of a reading it cannot serve
  PASS  another schedule object (State.load): the kept memo is off the shelf by the end of the first question
  PASS  and the memo kept after it is the new object's
  PASS  another key (the record moved in memory): dropped at the first question
  PASS  and the memo after it is of the record as it now reads
  PASS  other readers (closedPeriods replaced): dropped at the first question
  PASS  the same schedule, key and readers: adopted (off the shelf while the reading has it)
  PASS  and put back at its close
  PASS  a reading that asks none of the seven («סיכום חודש») neither drops nor replaces it

22. a hand on a drawn page: a man's page, a letter typed, a figure typed - each inside a reading, one copy of the record where nothing is new
  PASS  a man's page of «מקדמות» opened from the board, the record unmoved: v204's page, the seven asked nothing, ONE copy of the record
  PASS  a letter typed into its search: v204's list, asked inside ONE reading, the seven asked nothing, one copy of the record
  PASS  and the next letter the same
  PASS  two figures typed into w_1's closing box and «הצג בדוח» pressed: what v204 shows and chooses, every question asked inside a reading - one for each figure, one for the press
  PASS  each asking each question once, and the press - the last figure's own plan - working out nothing new: one copy of the record  — [[1,10],[1,10],[1,10]]

23. a record nobody approved: the sheets the gate's own plan prices are not kept for the next reading
  PASS  and the reading kept 2 sheets: the ranges the draw itself read, none of the plan's  — 2
  PASS  the draw is v204's
  PASS  the next draw, the tick moved and the record not: the gate planned again from what was kept - the seven asked nothing - and v204's bytes

end

        (tests/speed.test.mjs ran 9.0 minutes on this machine; by section: the seeding 0 s, 11. the source 54 s, 1. every way in is v204's bytes 46 s, 1. «איפוס מקדמות»'s step 3 9 s, 2. the gate's own plan, asked inside a reading, is the bare plan 1 s, 8. the counts, for every way in 5 s, 4. a way in repeated on an unmoved record 2 s, 3. after every kind of write, every way in is the record's 401 s, 5. through every throw, every reader is put back, no reading is left open and nothing is kept from a failed key 9 s, 6. inside a reading, another schedule is asked of the real functions, every time 0 s, 7. a reader that is absent stays absent 8 s, 9. appends inside a reading 0 s, 12. the gate 2 s, 19. a kept pay sheet is handed to a reading as rows of its own 1 s, 20. every row of every pay sheet is flat 1 s, 21. one memo at a time, dropped at the first question of a reading it cannot serve 1 s, 22. a hand on a drawn page 1 s, 23. a record nobody approved 2 s)

104/104 checks passed
```

</details>

### `tests/speed.season.test.mjs` on `9ab1c1d` (94/94)

<details><summary>its output, whole</summary>

```
start 03:48:10 load 6.00 4.88 2.94 commit 9ab1c1d

1. the medium season: every way in is v204's bytes - cold, again, and the whole list again
  PASS  both medium records x 3 readings, 4588 readings of a screen: every one v204's bytes
  PASS  every way in ended as v204's did, and none of v204's threw
  PASS  5. after every way in, every reader is the one it was and no reading is left open
  PASS  10. not one write at any door, and the disk byte for byte
  PASS  20. every row of every pay sheet flat

1. the medium season: «איפוס מקדמות»'s step 3, the board read after a real write, is v204's
  PASS  the medium season: v204's reset wrote something (15 of 15 men)  — {"men":15,"done":15,"failure":null,"result":{"key":"2026-11-19T10:00:00.000Z|d_office","closes":263,"repaid":33900,"repayments":[{"name":"עובד 1","amount":1400},{"name":"עובד 2","amount":1700},{"name"
  PASS  the medium season: the result and the names it says still owe are v204's
  PASS  the medium season: 10. reading it writes nothing, and 12. asks the gate nothing on an approved record
  PASS  the medium season, closed in order: v204's reset wrote something (15 of 15 men)  — {"men":15,"done":15,"failure":null,"result":{"key":"2026-11-19T10:00:00.000Z|d_office","closes":227,"repaid":13175,"repayments":[{"name":"עובד 1","amount":300},{"name":"עובד 2","amount":500},{"name":"
  PASS  the medium season, closed in order: the result and the names it says still owe are v204's
  PASS  the medium season, closed in order: 10. reading it writes nothing, and 12. asks the gate nothing on an approved record

3. the medium season, after every kind of write: every way in is v204's
  PASS  every way in, after each of 26 kinds of write: v204's files on the same record
        (the seven, called by the first reading after each: before anything 355, nothing changed 0, a day typed 355, an absence 355, the two counts 355, an advance 356, a repayment 356, a reversal 356, a close 356, «סגירת שבוע»'s pass 354, «איפוס מקדמות» 353, a rate and a cycle 353, a man archived 353, the approval removed in memory 215, the approval put back 353, a change in memory 353, the change taken back 353, a snapshot adopted 353, a day placed with ↶ ready 353, ↶ 353, the day turned 362, and back 353, the sends settled 0, a write that moves the tick and not the record 0, a new schedule object with the same text 341, a refused commit rolled back 341; load 11.6 9.1 5.5)

the three seasons, written by the app's own writers
        season-open: {"kind":"open","men":40,"days":300,"from":"2025-12-05","to":"2026-11-19","closes":0,"repaid":8,"skippers":[],"advances":688,"ledger":696,"kib":954} - seeded in 46.2 s (load 10.6 9.2 5.7)
        season-closed: {"kind":"closed","men":40,"days":300,"from":"2025-12-05","to":"2026-11-19","closes":225,"repaid":5,"skippers":[],"advances":141,"ledger":530,"kib":1074} - seeded in 100.2 s (load 11.9 9.9 6.3)
        season-skipped: {"kind":"skipped","men":40,"days":300,"from":"2025-12-05","to":"2026-11-19","closes":214,"repaid":4,"skippers":["w_01","w_04","w_07","w_10","w_13","w_16"],"advances":136,"ledger":510,"kib":1066} - seeded in 96.2 s (load 10.6 10.1 6.7)
  PASS  season-open: 688 advances, 696 ledger entries, 954 KiB, nothing closed
  PASS  season-closed: 225 closes, 530 ledger entries, 1074 KiB
  PASS  season-skipped: 6 weekly men who missed the week before their last finished one

2. season-closed: every way in is v204's bytes, cold and again
        (season-closed: 450 ways in - v204 183.3 s, this build cold 66.8 s; load 11.2 10.7 7.9)
  PASS  450 ways in on season-closed
        (season-closed, nobody approved: 2 ways in - v204 102.3 s, this build cold 15.7 s; load 8.6 9.9 8.0)
  PASS  season-closed, nobody approved: «דוחות», both sections
        (season-closed, both gates shut: 2 ways in - v204 0.5 s, this build cold 0.7 s; load 8.6 9.9 8.0)
  PASS  season-closed, both gates shut: «דוחות», both sections
  PASS  the gate's own plan, asked inside a reading, is the bare plan, JSON for JSON

2. season-open: «דוחות», every statement, four men's cards, days and closing boxes, the pages of «מקדמות» - v204's bytes
        (season-open: 67 ways in - v204 154.4 s, this build cold 27.5 s; load 9.2 8.7 8.1)
  PASS  67 ways in on season-open
  PASS  the workbook and the payslips of both periods: cold (nothing kept) and warm, the same bytes

2, 4, 9. season-skipped: the men whose empty week is closed first on a copy
        (season-skipped: 9 ways in - v204 3.9 s, this build cold 2.2 s; load 8.8 8.6 8.1)
  PASS  9 ways in on season-skipped, each cold and then again: v204's bytes
  PASS  «סגירת שבוע»'s list, again on the unmoved record: the record's seven asked 0 times
  PASS  and the copies' own walks are planned again, as they must be: 184  — 184
  PASS  the reminder's count, again on the unmoved record: the record's seven asked 0 times
  PASS  and the copies' own walks are planned again, as they must be: 184  — 184
  PASS  one «סגירת שבוע» reading on season-skipped: the record's ledger folded once
  PASS  it appended to copies (6) and was kept all the same

8. season-open, every way in read cold: each reader once per question, the key twice at most
  PASS  40 ways in on season-open
        one draw of «לפי עובד» on season-closed, v204 -> this build: ledgerEntries 3343 -> 1, foldLedger 1865 -> 1, advanceHistory 1477 -> 0, overpaidAdvances 348 -> 40, advanceOutstanding 1477 -> 141, advanceWalk 324 -> 277, advancePositionInto 48 -> 48, payrollReport 18 -> 18
  PASS  v204 listed the ledger 3343 times for it, this build 1: at least 50x  — 3343 / 1

13. the clocks: this build against v204 in the same process, interleaved, medians of three
        (load at the start of the clocks: 7.4 8.3 8.0)
  PASS  season-open, «דוחות» (one draw builds both sections), after a change: 1351 ms (v204 not timed: minutes) - <= 5000 ms
  PASS  season-open, «דוחות» (one draw builds both sections), unmoved: 71 ms (v204 not timed) - <= 800 ms
  PASS  season-closed, «דוחות» (one draw builds both sections), after a change: 276 ms (v204 2180 ms) - <= 0.25 of v204's
  PASS  season-open, the workbook, after a change: 1313 ms (v204 not timed: minutes) - <= 5000 ms
  PASS  season-open, the workbook, unmoved: 42 ms (v204 not timed) - <= 800 ms
  PASS  season-closed, the workbook, after a change: 181 ms (v204 4460 ms) - <= 0.17 of v204's
  PASS  season-open, «תלוש לכל עובד», this period, after a change: 1298 ms (v204 not timed: minutes) - <= 5000 ms
  PASS  season-open, «תלוש לכל עובד», this period, unmoved: 74 ms (v204 not timed) - <= 800 ms
  PASS  season-closed, «תלוש לכל עובד», this period, after a change: 217 ms (v204 2817 ms) - <= 0.17 of v204's
  PASS  season-open, «תלוש לכל עובד», the period before, after a change: 1320 ms (v204 not timed: minutes) - <= 5000 ms
  PASS  season-open, «תלוש לכל עובד», the period before, unmoved: 96 ms (v204 not timed) - <= 800 ms
  PASS  season-closed, «תלוש לכל עובד», the period before, after a change: 233 ms (v204 2577 ms) - <= 0.17 of v204's
  PASS  season-open, the closing box, a weekly man, after a change: 372 ms (v204 3268 ms) - <= 0.35 of v204's
  PASS  season-open, the closing box, a weekly man, unmoved: 78 ms (v204 3340 ms) - <= 0.25 of v204's
  PASS  season-closed, the closing box, a weekly man, after a change: 89 ms (v204 176 ms) - <= 1.25x + 30 ms of v204's
  PASS  season-open, the closing box, a fortnightly man, after a change: 269 ms (v204 881 ms) - <= 0.6 of v204's
  PASS  season-open, the closing box, a fortnightly man, unmoved: 42 ms (v204 835 ms) - <= 0.25 of v204's
  PASS  season-closed, the closing box, a fortnightly man, after a change: 69 ms (v204 104 ms) - <= 1.25x + 30 ms of v204's
  PASS  season-open, a man's days, after a change: 448 ms (v204 3649 ms) - <= 0.35 of v204's
  PASS  season-open, a man's days, unmoved: 79 ms (v204 3265 ms) - <= 0.25 of v204's
  PASS  season-closed, a man's days, after a change: 81 ms (v204 216 ms) - <= 1.25x + 30 ms of v204's
  PASS  season-open, his statement, after a change: 378 ms (v204 1864 ms) - <= 0.5 of v204's
  PASS  season-open, his statement, unmoved: 11 ms (v204 1960 ms) - <= 0.5 of v204's
  PASS  season-closed, his statement, after a change: 93 ms (v204 145 ms) - <= 1.25x + 30 ms of v204's
  PASS  season-open, «מקדמות», after a change: 828 ms (v204 6487 ms) - <= 0.35 of v204's
  PASS  season-open, «מקדמות», unmoved: 43 ms (v204 1117 ms) - <= 0.25 of v204's
  PASS  season-closed, «מקדמות», after a change: 178 ms (v204 1107 ms) - <= 0.5 of v204's
  PASS  season-open, a man's page of «מקדמות», after a change: 24 ms (v204 151 ms) - <= 0.6 + 20 ms of v204's
  PASS  season-open, a man's page of «מקדמות», unmoved: 13 ms (v204 135 ms) - <= 0.6 + 20 ms of v204's
  PASS  season-closed, a man's page of «מקדמות», after a change: 21 ms (v204 24 ms) - <= 1.25x + 30 ms of v204's
  PASS  season-open, «סגירות שנרשמו», after a change: 656 ms (v204 4873 ms) - <= 0.35 of v204's
  PASS  season-open, «סגירות שנרשמו», unmoved: 9 ms (v204 9 ms) - <= 1.25x + 30 ms of v204's
  PASS  season-closed, «סגירות שנרשמו», after a change: 221 ms (v204 1091 ms) - <= 0.5 of v204's
  PASS  season-open, owesReadNow («שים לב»), after a change: 671 ms (v204 5097 ms) - <= 0.35 of v204's
  PASS  season-open, owesReadNow («שים לב»), unmoved: 118 ms (v204 4903 ms) - <= 0.25 of v204's
  PASS  season-closed, owesReadNow («שים לב»), after a change: 133 ms (v204 761 ms) - <= 0.5 of v204's
  PASS  season-open, «סגירת שבוע»'s list, after a change: 1165 ms (v204 2584 ms) - <= 0.75 of v204's
  PASS  season-open, «סגירת שבוע»'s list, unmoved: 111 ms (v204 2509 ms) - <= 0.25 of v204's
  PASS  season-closed, «סגירת שבוע»'s list, after a change: 253 ms (v204 292 ms) - <= 1.25x + 30 ms of v204's
  PASS  season-open, the reminder's count, after a change: 1384 ms (v204 2523 ms) - <= 0.75 of v204's
  PASS  season-open, the reminder's count, unmoved: 97 ms (v204 2554 ms) - <= 0.25 of v204's
  PASS  season-closed, the reminder's count, after a change: 259 ms (v204 289 ms) - <= 1.25x + 30 ms of v204's
  PASS  season-open, «איפוס מקדמות»'s reading, after a change: 1298 ms (v204 2540 ms) - <= 0.75 of v204's
  PASS  season-open, «איפוס מקדמות»'s reading, unmoved: 155 ms (v204 2626 ms) - <= 0.25 of v204's
  PASS  season-closed, «איפוס מקדמות»'s reading, after a change: 172 ms (v204 176 ms) - <= 1.25x + 30 ms of v204's
  PASS  season-open, «איפוס מקדמות»'s step 3 (the board after the write), after a change: 679 ms (v204 4700 ms) - <= 0.35 of v204's
  PASS  season-open, «איפוס מקדמות»'s step 3 (the board after the write), unmoved: 119 ms (v204 4709 ms) - <= 0.25 of v204's
  PASS  season-closed, «איפוס מקדמות»'s step 3 (the board after the write), after a change: 123 ms (v204 627 ms) - <= 1.25x + 30 ms of v204's
  PASS  season-open, «כרטיס עובד», a weekly man, after a change: 300 ms (v204 3020 ms) - <= 0.35 of v204's
  PASS  season-open, «כרטיס עובד», a weekly man, unmoved: 28 ms (v204 3304 ms) - <= 0.25 of v204's
  PASS  season-closed, «כרטיס עובד», a weekly man, after a change: 69 ms (v204 167 ms) - <= 1.25x + 30 ms of v204's
  PASS  season-open, «כרטיס עובד», a fortnightly man, after a change: 192 ms (v204 1657 ms) - <= 0.35 of v204's
  PASS  season-open, «כרטיס עובד», a fortnightly man, unmoved: 32 ms (v204 1683 ms) - <= 0.25 of v204's
  PASS  season-closed, «כרטיס עובד», a fortnightly man, after a change: 51 ms (v204 90 ms) - <= 1.25x + 30 ms of v204's
  PASS  season-open, «סיכום חודש», after a change: 44 ms (v204 43 ms) - <= 1.25x + 20 ms of v204's
  PASS  season-open, «סיכום חודש», unmoved: 37 ms (v204 42 ms) - <= 1.25x + 20 ms of v204's
  PASS  season-closed, «סיכום חודש», after a change: 50 ms (v204 47 ms) - <= 1.25x + 20 ms of v204's
  PASS  season-skipped, «סגירת שבוע»'s list, after a change: 674 ms (v204 666 ms) - <= 1.25x + 30 ms
  PASS  season-skipped, «סגירת שבוע»'s list, unmoved: 554 ms (v204 699 ms) - <= 1.25x + 30 ms
  PASS  season-skipped, the reminder's count, after a change: 650 ms (v204 836 ms) - <= 1.25x + 30 ms
  PASS  season-skipped, the reminder's count, unmoved: 624 ms (v204 700 ms) - <= 1.25x + 30 ms
  PASS  season-closed, both gates shut, «דוחות»: 109 ms (v204 113 ms) - <= 1.25x + 30 ms
  PASS  season-closed, nobody approved, «דוחות»: 7434 ms (v204 67214 ms) - <= 0.4 of v204's
  PASS  the kept key on season-open's record (977262 characters): 8 ms - <= 30 ms
        this build / v204, ms: «דוחות» (one draw builds both sections): open 1351/-, unmoved 71/-, closed 276/2180
        this build / v204, ms: the workbook: open 1313/-, unmoved 42/-, closed 181/4460
        this build / v204, ms: «תלוש לכל עובד», this period: open 1298/-, unmoved 74/-, closed 217/2817
        this build / v204, ms: «תלוש לכל עובד», the period before: open 1320/-, unmoved 96/-, closed 233/2577
        this build / v204, ms: the closing box, a weekly man: open 372/3268, unmoved 78/3340, closed 89/176
        this build / v204, ms: the closing box, a fortnightly man: open 269/881, unmoved 42/835, closed 69/104
        this build / v204, ms: a man's days: open 448/3649, unmoved 79/3265, closed 81/216
        this build / v204, ms: his statement: open 378/1864, unmoved 11/1960, closed 93/145
        this build / v204, ms: «מקדמות»: open 828/6487, unmoved 43/1117, closed 178/1107
        this build / v204, ms: a man's page of «מקדמות»: open 24/151, unmoved 13/135, closed 21/24
        this build / v204, ms: «סגירות שנרשמו»: open 656/4873, unmoved 9/9, closed 221/1091
        this build / v204, ms: owesReadNow («שים לב»): open 671/5097, unmoved 118/4903, closed 133/761
        this build / v204, ms: «סגירת שבוע»'s list: open 1165/2584, unmoved 111/2509, closed 253/292
        this build / v204, ms: the reminder's count: open 1384/2523, unmoved 97/2554, closed 259/289
        this build / v204, ms: «איפוס מקדמות»'s reading: open 1298/2540, unmoved 155/2626, closed 172/176
        this build / v204, ms: «איפוס מקדמות»'s step 3 (the board after the write): open 679/4700, unmoved 119/4709, closed 123/627
        this build / v204, ms: «כרטיס עובד», a weekly man: open 300/3020, unmoved 28/3304, closed 69/167
        this build / v204, ms: «כרטיס עובד», a fortnightly man: open 192/1657, unmoved 32/1683, closed 51/90
        this build / v204, ms: «סיכום חודש»: open 44/43, unmoved 37/42, closed 50/47
        this build / v204, ms: season-skipped «סגירת שבוע»'s list: 674/666, unmoved 554/699
        this build / v204, ms: season-skipped the reminder's count: 650/836, unmoved 624/700
        this build / v204, ms: shut 109/113, unapproved 7434/67214
        (load at the end of the clocks: 4.1 5.1 6.6)

        (tests/speed.season.test.mjs ran 36.5 minutes on this machine; load 4.1 5.1 6.6)

94/94 checks passed

real	36m27.934s
user	26m25.662s
sys	0m29.946s
exit 0 load 4.13 5.12 6.63
end 04:24:38
```

</details>

### `tests/speed.browser.mjs` on `7af295a`, through the slot wrapper, Chromium 1194 (99/99)

<details><summary>its output, whole</summary>

```
start 04:46:55 load 1.90 3.41 4.65 commit 7af295a
browser: CHROME_PATH unset, PLAYWRIGHT_BROWSERS_PATH=/tmp/claude-0/-home-user-farkad/d6a64352-db1a-5c3b-b54d-5c09103f2419/scratchpad/pw1194
season-open: {"kind":"open","men":40,"days":300,"from":"2025-12-05","to":"2026-11-19","closes":0,"repaid":8,"skippers":[],"advances":688,"ledger":696,"kib":954} - seeded in 22.7 s
season-closed: {"kind":"closed","men":40,"days":300,"from":"2025-12-05","to":"2026-11-19","closes":225,"repaid":5,"skippers":[],"advances":141,"ledger":530,"kib":1074} - seeded in 50.3 s
season-skipped: {"kind":"skipped","men":40,"days":300,"from":"2025-12-05","to":"2026-11-19","closes":214,"repaid":4,"skippers":["w_01","w_04","w_07","w_10","w_13","w_16"],"advances":136,"ledger":510,"kib":1066} - seeded in 44.6 s
  PASS  this build's origin serves this commit, byte for byte
  PASS  v204's origin serves 6ab193d, byte for byte

14. the clocks: fresh pages, 375x667, the processor slowed 4x, this build against v204 (load 2.9 3.2 4.4)
  PASS  1. a write, then «דוחות» opened: the longest task 3858 ms (v204 45103 ms) - <= 1/4 of v204's  — 3858 > 11276
  PASS  2. then «לפי אתר» redrawn, the record unmoved: the longest task 213 ms (v204 47636 ms) - <= 1/10 of v204's row 1 and <= 1/4 of this build's own (3858 ms)  — 213 > 965
  PASS  2. «לפי אתר»: the memo «דוחות» kept answered the redraw, and nothing was worked out anew
  PASS  2. then «לפי עובד» redrawn, the record unmoved: the longest task 380 ms (v204 47552 ms) - <= 1/10 of v204's row 1 and <= 1/4 of this build's own (3858 ms)  — 380 > 965
  PASS  2. «לפי עובד»: the memo «דוחות» kept answered the redraw, and nothing was worked out anew
  PASS  3. a write, then «מקדמות» opened: the longest task 1991 ms (v204 7645 ms) - <= 1/2 of v204's  — 1991 > 3823
  PASS  4. «שים לב» read after paint, the record moved: the longest task 2190 ms (v204 5974 ms) - <= 1/2 of v204's  — 2190 > 2987
  PASS  5. season-open: a write on Thursday, then the close reminder's reading after its quiet: the longest task 3363 ms (v204 8495 ms) - <= 0.7 of v204's  — 3363 > 5947
  PASS  17. season-open, v204: the reminder read the record exactly once after the write
  PASS  season-open, v204: every man held, so a count of 0 and no line - the dialog opened by the function the line calls
  PASS  17. season-open, now: the reminder read the record exactly once after the write
  PASS  season-open, now: every man held, so a count of 0 and no line - the dialog opened by the function the line calls
  PASS  6. season-open: then «סגירת שבוע» opened (no line: by the function the line calls), the record unmoved: the longest task 405 ms (v204 8230 ms) - <= 1/3 of v204's same act  — 405 > 2743
  PASS  6. season-open: the memo the reminder's reading kept answered the dialog
  PASS  17. season-closed, v204, page 1: the reminder read the record exactly once after the write
  PASS  17. season-closed, v204, page 1: its line is up, counting 19 men («יש 19 עובדים שהחשבון שלהם עוד לא נסגר»)
  PASS  17. season-closed, v204, page 1: pressing the line opened «סגירת שבוע», offering 19 men
  PASS  17. season-closed, v204, page 1: the line's count (19) is a fresh count's
  PASS  17. season-closed, now, page 1: the reminder read the record exactly once after the write
  PASS  17. season-closed, now, page 1: its line is up, counting 19 men («יש 19 עובדים שהחשבון שלהם עוד לא נסגר»)
  PASS  17. season-closed, now, page 1: pressing the line opened «סגירת שבוע», offering 19 men
  PASS  17. season-closed, now, page 1: the line's count (19) is a fresh count's
  PASS  17. season-closed, v204, page 2: the reminder read the record exactly once after the write
  PASS  17. season-closed, v204, page 2: its line is up, counting 19 men («יש 19 עובדים שהחשבון שלהם עוד לא נסגר»)
  PASS  17. season-closed, v204, page 2: pressing the line opened «סגירת שבוע», offering 19 men
  PASS  17. season-closed, v204, page 2: the line's count (19) is a fresh count's
  PASS  17. season-closed, now, page 2: the reminder read the record exactly once after the write
  PASS  17. season-closed, now, page 2: its line is up, counting 19 men («יש 19 עובדים שהחשבון שלהם עוד לא נסגר»)
  PASS  17. season-closed, now, page 2: pressing the line opened «סגירת שבוע», offering 19 men
  PASS  17. season-closed, now, page 2: the line's count (19) is a fresh count's
  PASS  17. season-closed, v204, page 3: the reminder read the record exactly once after the write
  PASS  17. season-closed, v204, page 3: its line is up, counting 19 men («יש 19 עובדים שהחשבון שלהם עוד לא נסגר»)
  PASS  17. season-closed, v204, page 3: pressing the line opened «סגירת שבוע», offering 19 men
  PASS  17. season-closed, v204, page 3: the line's count (19) is a fresh count's
  PASS  17. season-closed, now, page 3: the reminder read the record exactly once after the write
  PASS  17. season-closed, now, page 3: its line is up, counting 19 men («יש 19 עובדים שהחשבון שלהם עוד לא נסגר»)
  PASS  17. season-closed, now, page 3: pressing the line opened «סגירת שבוע», offering 19 men
  PASS  17. season-closed, now, page 3: the line's count (19) is a fresh count's
  PASS  17. season-closed: both builds count the same men, on every page
  PASS  5. season-closed: a write on Thursday, then the close reminder's reading after its quiet (the median of 3 pages each): the longest task 568 ms (v204 648 ms) - <= 1.25x v204's + 30 ms (0.88 of it; this build 568, 562, 734 / v204 671, 617, 648)  — 568 > 840
  PASS  6. season-closed: then «סגירת שבוע» opened from the reminder's line, the record unmoved (the median of 3 pages each): the longest task 354 ms (v204 744 ms) - <= 1.25x v204's + 30 ms (0.48 of it; this build 354, 361, 348 / v204 744, 651, 748)  — 354 > 960
  PASS  6. season-closed: the memo the reminder's reading kept answered the dialog, on every page
  PASS  17. season-skipped, v204, page 1: the reminder read the record exactly once after the write
  PASS  17. season-skipped, v204, page 1: its line is up, counting 21 men («יש 21 עובדים שהחשבון שלהם עוד לא נסגר»)
  PASS  17. season-skipped, v204, page 1: pressing the line opened «סגירת שבוע», offering 21 men
  PASS  17. season-skipped, v204, page 1: the line's count (21) is a fresh count's
  PASS  17. season-skipped, now, page 1: the reminder read the record exactly once after the write
  PASS  17. season-skipped, now, page 1: its line is up, counting 21 men («יש 21 עובדים שהחשבון שלהם עוד לא נסגר»)
  PASS  17. season-skipped, now, page 1: pressing the line opened «סגירת שבוע», offering 21 men
  PASS  17. season-skipped, now, page 1: the line's count (21) is a fresh count's
  PASS  17. season-skipped, v204, page 2: the reminder read the record exactly once after the write
  PASS  17. season-skipped, v204, page 2: its line is up, counting 21 men («יש 21 עובדים שהחשבון שלהם עוד לא נסגר»)
  PASS  17. season-skipped, v204, page 2: pressing the line opened «סגירת שבוע», offering 21 men
  PASS  17. season-skipped, v204, page 2: the line's count (21) is a fresh count's
  PASS  17. season-skipped, now, page 2: the reminder read the record exactly once after the write
  PASS  17. season-skipped, now, page 2: its line is up, counting 21 men («יש 21 עובדים שהחשבון שלהם עוד לא נסגר»)
  PASS  17. season-skipped, now, page 2: pressing the line opened «סגירת שבוע», offering 21 men
  PASS  17. season-skipped, now, page 2: the line's count (21) is a fresh count's
  PASS  17. season-skipped, v204, page 3: the reminder read the record exactly once after the write
  PASS  17. season-skipped, v204, page 3: its line is up, counting 21 men («יש 21 עובדים שהחשבון שלהם עוד לא נסגר»)
  PASS  17. season-skipped, v204, page 3: pressing the line opened «סגירת שבוע», offering 21 men
  PASS  17. season-skipped, v204, page 3: the line's count (21) is a fresh count's
  PASS  17. season-skipped, now, page 3: the reminder read the record exactly once after the write
  PASS  17. season-skipped, now, page 3: its line is up, counting 21 men («יש 21 עובדים שהחשבון שלהם עוד לא נסגר»)
  PASS  17. season-skipped, now, page 3: pressing the line opened «סגירת שבוע», offering 21 men
  PASS  17. season-skipped, now, page 3: the line's count (21) is a fresh count's
  PASS  17. season-skipped: both builds count the same men, on every page
  PASS  5. season-skipped: a write on Thursday, then the close reminder's reading after its quiet (the median of 3 pages each): the longest task 1816 ms (v204 1725 ms) - <= 1.25x v204's + 30 ms (1.05 of it; this build 2206, 1816, 1664 / v204 1749, 1545, 1725)  — 1816 > 2186
  PASS  6. season-skipped: then «סגירת שבוע» opened from the reminder's line, the record unmoved (the median of 3 pages each): the longest task 1485 ms (v204 1800 ms) - <= 1.25x v204's + 30 ms (0.82 of it; this build 1472, 1485, 1557 / v204 1828, 1800, 1788)  — 1485 > 2280
  PASS  6. season-skipped: the memo the reminder's reading kept answered the dialog, on every page
  PASS  7. the closing box (a weekly man): the longest task 193 ms (v204 4216 ms) - <= 1/2 of v204's  — 193 > 2108
  PASS  8. «כרטיס עובד» (a fortnightly man): the longest task 257 ms (v204 2315 ms) - <= 1/2 of v204's  — 257 > 1158
  PASS  9. «תלוש לכל עובד»: the longest task 597 ms (v204 not timed) - <= 3,000 ms  — 597 > 3000
  PASS  10. «סיכום חודש»: the longest task 212 ms (v204 187 ms) - <= 1.25x v204's + 30 ms  — 212 > 264
  PASS  11. a write, «דוחות», a send's provenance key (the tick moved, the record not), «דוחות» redrawn: the longest task 321 ms (v204 46985 ms) - <= 1/10 of v204's row 1 and <= 1/4 of this page's own first draw (4174 ms)  — 321 > 1044
  PASS  11. the memo the first draw kept answered the redraw across the tick (S3 holds no tick), nothing worked out anew
  PASS  12. season-closed: a man's page of «מקדמות», opened from the board (its own synchronous draw, the median of three men): the longest task 82 ms (v204 44 ms) - <= 1.25x v204's + 60 ms (one copy of a 1 MB record at 4x; this build 89, 82, 79 / v204 80, 44, 41)  — 82 > 115
  PASS  12. the board's memo answered each man's page, nothing worked out anew
  PASS  13. season-closed: «סגירות שנרשמו», opened from the board: the longest task 339 ms (v204 999 ms) - <= 1/2 of v204's  — 339 > 500
  PASS  13. the board's memo answered it
  PASS  14. season-open: the first letter typed into «מקדמות»'s search (its own synchronous call): the longest task 53 ms (v204 982 ms) - <= 1/4 of v204's  — 53 > 246
  PASS  14. season-open: the median of 6 letters (each its own synchronous call): the longest task 62 ms (v204 1006 ms) - <= 1/4 of v204's (this build 53, 66, 47, 63, 62, 53 / v204 982, 932, 1006, 1030, 1060, 249)  — 62 > 252
  PASS  14. every letter answered by the board's memo, nothing worked out anew; the same men listed on both builds
        the day screen, a write (commit + draw): this build 278 ms / v204 321 ms - reported, no budget
        1. a write, then «דוחות» opened: this build 3858 ms / v204 45103 ms
        2. then «לפי אתר» redrawn, the record unmoved: this build 213 ms / v204 47636 ms
        2. then «לפי עובד» redrawn, the record unmoved: this build 380 ms / v204 47552 ms
        3. a write, then «מקדמות» opened: this build 1991 ms / v204 7645 ms
        4. «שים לב» read after paint, the record moved: this build 2190 ms / v204 5974 ms
        5. season-open: a write on Thursday, then the close reminder's reading after its quiet: this build 3363 ms / v204 8495 ms
        6. season-open: then «סגירת שבוע» opened (no line: by the function the line calls), the record unmoved: this build 405 ms / v204 8230 ms
        5. season-closed: a write on Thursday, then the close reminder's reading after its quiet (the median of 3 pages each): this build 568 ms / v204 648 ms
        6. season-closed: then «סגירת שבוע» opened from the reminder's line, the record unmoved (the median of 3 pages each): this build 354 ms / v204 744 ms
        5. season-skipped: a write on Thursday, then the close reminder's reading after its quiet (the median of 3 pages each): this build 1816 ms / v204 1725 ms
        6. season-skipped: then «סגירת שבוע» opened from the reminder's line, the record unmoved (the median of 3 pages each): this build 1485 ms / v204 1800 ms
        7. the closing box (a weekly man): this build 193 ms / v204 4216 ms
        8. «כרטיס עובד» (a fortnightly man): this build 257 ms / v204 2315 ms
        9. «תלוש לכל עובד»: this build 597 ms / v204 -
        10. «סיכום חודש»: this build 212 ms / v204 187 ms
        11. a write, «דוחות», a send's provenance key (the tick moved, the record not), «דוחות» redrawn: this build 321 ms / v204 46985 ms
        12. season-closed: a man's page of «מקדמות», opened from the board (its own synchronous draw, the median of three men): this build 82 ms / v204 44 ms
        13. season-closed: «סגירות שנרשמו», opened from the board: this build 339 ms / v204 999 ms
        14. season-open: the first letter typed into «מקדמות»'s search (its own synchronous call): this build 53 ms / v204 982 ms
        14. season-open: the median of 6 letters (each its own synchronous call): this build 62 ms / v204 1006 ms
        (load at the end of the clocks: 3.4 4.2 4.5)
  PASS  18. no reading wrote to the disk: every act's disk after it was the disk its write left

15, 16. season-closed: drawn sharing, drawn again unmoved, drawn afresh - the same nodes and the same picture
  PASS  15. «דוחות», both sections: drawn sharing, drawn again on the unmoved record, and drawn afresh - the same innerHTML (124029 characters)
  PASS  16. sharePrintout('report'): the same PNG bytes drawn sharing and drawn afresh (d02839a51da6)
  PASS  15. «מקדמות», the board: drawn sharing, drawn again on the unmoved record, and drawn afresh - the same innerHTML (23337 characters)
  PASS  15. «מקדמות», a man's page: drawn sharing, drawn again on the unmoved record, and drawn afresh - the same innerHTML (4376 characters)
  PASS  15. «סגירות שנרשמו»: drawn sharing, drawn again on the unmoved record, and drawn afresh - the same innerHTML (2415 characters)
  PASS  15. the closing box: drawn sharing, drawn again on the unmoved record, and drawn afresh - the same innerHTML (787 characters)
  PASS  15. a man's days: drawn sharing, drawn again on the unmoved record, and drawn afresh - the same innerHTML (9135 characters)
  PASS  15. «כרטיס עובד»: drawn sharing, drawn again on the unmoved record, and drawn afresh - the same innerHTML (12184 characters)
  PASS  15. «תלוש לכל עובד»: drawn sharing, drawn again on the unmoved record, and drawn afresh - the same innerHTML (75244 characters)
  PASS  18. drawing every one of them, three times each, wrote nothing (the payslips' own open-state preference left out)
  PASS  the disk reading leaves out the service worker's census of open builds and no other key  — {"left":[],"census":"not written yet"}
  PASS  15. «דוחות», both sections, is v204's tree's node for node (124029 characters)
  PASS  18. no uncaught error on any page of either build

        (tests/speed.browser.mjs ran 15.4 minutes; load 2.9 4.0 4.4)

99/99 checks passed
exit 0 after 923s
end 05:02:18 load 2.93 4.01 4.44
```

</details>

### `tests/speed.browser.mjs` on `3e2b867`, its second run (98/99)

Three pages of each build on the Thursday rows - all green. Its one red is row 12: v204's man's page took under 50 ms for two men of three, a long-task observer records nothing under 50 ms, so the median v204 time read 0 and the ceiling 60 ms; `7af295a` times rows 12 and 14 by the act's own synchronous call instead:

<details><summary>its output, whole</summary>

```
start 04:30:18 load 3.44 4.53 5.93 commit 3e2b867
browser: CHROME_PATH unset, PLAYWRIGHT_BROWSERS_PATH=/tmp/claude-0/-home-user-farkad/d6a64352-db1a-5c3b-b54d-5c09103f2419/scratchpad/pw1194
season-open: {"kind":"open","men":40,"days":300,"from":"2025-12-05","to":"2026-11-19","closes":0,"repaid":8,"skippers":[],"advances":688,"ledger":696,"kib":954} - seeded in 22.7 s
season-closed: {"kind":"closed","men":40,"days":300,"from":"2025-12-05","to":"2026-11-19","closes":225,"repaid":5,"skippers":[],"advances":141,"ledger":530,"kib":1074} - seeded in 48.5 s
season-skipped: {"kind":"skipped","men":40,"days":300,"from":"2025-12-05","to":"2026-11-19","closes":214,"repaid":4,"skippers":["w_01","w_04","w_07","w_10","w_13","w_16"],"advances":136,"ledger":510,"kib":1066} - seeded in 44.2 s
  PASS  this build's origin serves this commit, byte for byte
  PASS  v204's origin serves 6ab193d, byte for byte

14. the clocks: fresh pages, 375x667, the processor slowed 4x, this build against v204 (load 2.6 3.9 5.5)
  PASS  1. a write, then «דוחות» opened: the longest task 4159 ms (v204 43980 ms) - <= 1/4 of v204's  — 4159 > 10995
  PASS  2. then «לפי אתר» redrawn, the record unmoved: the longest task 204 ms (v204 47792 ms) - <= 1/10 of v204's row 1 and <= 1/4 of this build's own (4159 ms)  — 204 > 1040
  PASS  2. «לפי אתר»: the memo «דוחות» kept answered the redraw, and nothing was worked out anew
  PASS  2. then «לפי עובד» redrawn, the record unmoved: the longest task 335 ms (v204 49137 ms) - <= 1/10 of v204's row 1 and <= 1/4 of this build's own (4159 ms)  — 335 > 1040
  PASS  2. «לפי עובד»: the memo «דוחות» kept answered the redraw, and nothing was worked out anew
  PASS  3. a write, then «מקדמות» opened: the longest task 2277 ms (v204 8296 ms) - <= 1/2 of v204's  — 2277 > 4148
  PASS  4. «שים לב» read after paint, the record moved: the longest task 2169 ms (v204 5988 ms) - <= 1/2 of v204's  — 2169 > 2994
  PASS  5. season-open: a write on Thursday, then the close reminder's reading after its quiet: the longest task 2999 ms (v204 7501 ms) - <= 0.7 of v204's  — 2999 > 5251
  PASS  17. season-open, v204: the reminder read the record exactly once after the write
  PASS  season-open, v204: every man held, so a count of 0 and no line - the dialog opened by the function the line calls
  PASS  17. season-open, now: the reminder read the record exactly once after the write
  PASS  season-open, now: every man held, so a count of 0 and no line - the dialog opened by the function the line calls
  PASS  6. season-open: then «סגירת שבוע» opened (no line: by the function the line calls), the record unmoved: the longest task 368 ms (v204 7616 ms) - <= 1/3 of v204's same act  — 368 > 2539
  PASS  6. season-open: the memo the reminder's reading kept answered the dialog
  PASS  17. season-closed, v204, page 1: the reminder read the record exactly once after the write
  PASS  17. season-closed, v204, page 1: its line is up, counting 19 men («יש 19 עובדים שהחשבון שלהם עוד לא נסגר»)
  PASS  17. season-closed, v204, page 1: pressing the line opened «סגירת שבוע», offering 19 men
  PASS  17. season-closed, v204, page 1: the line's count (19) is a fresh count's
  PASS  17. season-closed, now, page 1: the reminder read the record exactly once after the write
  PASS  17. season-closed, now, page 1: its line is up, counting 19 men («יש 19 עובדים שהחשבון שלהם עוד לא נסגר»)
  PASS  17. season-closed, now, page 1: pressing the line opened «סגירת שבוע», offering 19 men
  PASS  17. season-closed, now, page 1: the line's count (19) is a fresh count's
  PASS  17. season-closed, v204, page 2: the reminder read the record exactly once after the write
  PASS  17. season-closed, v204, page 2: its line is up, counting 19 men («יש 19 עובדים שהחשבון שלהם עוד לא נסגר»)
  PASS  17. season-closed, v204, page 2: pressing the line opened «סגירת שבוע», offering 19 men
  PASS  17. season-closed, v204, page 2: the line's count (19) is a fresh count's
  PASS  17. season-closed, now, page 2: the reminder read the record exactly once after the write
  PASS  17. season-closed, now, page 2: its line is up, counting 19 men («יש 19 עובדים שהחשבון שלהם עוד לא נסגר»)
  PASS  17. season-closed, now, page 2: pressing the line opened «סגירת שבוע», offering 19 men
  PASS  17. season-closed, now, page 2: the line's count (19) is a fresh count's
  PASS  17. season-closed, v204, page 3: the reminder read the record exactly once after the write
  PASS  17. season-closed, v204, page 3: its line is up, counting 19 men («יש 19 עובדים שהחשבון שלהם עוד לא נסגר»)
  PASS  17. season-closed, v204, page 3: pressing the line opened «סגירת שבוע», offering 19 men
  PASS  17. season-closed, v204, page 3: the line's count (19) is a fresh count's
  PASS  17. season-closed, now, page 3: the reminder read the record exactly once after the write
  PASS  17. season-closed, now, page 3: its line is up, counting 19 men («יש 19 עובדים שהחשבון שלהם עוד לא נסגר»)
  PASS  17. season-closed, now, page 3: pressing the line opened «סגירת שבוע», offering 19 men
  PASS  17. season-closed, now, page 3: the line's count (19) is a fresh count's
  PASS  17. season-closed: both builds count the same men, on every page
  PASS  5. season-closed: a write on Thursday, then the close reminder's reading after its quiet (the median of 3 pages each): the longest task 611 ms (v204 631 ms) - <= 1.25x v204's + 30 ms (0.97 of it; this build 582, 611, 618 / v204 629, 714, 631)  — 611 > 819
  PASS  6. season-closed: then «סגירת שבוע» opened from the reminder's line, the record unmoved (the median of 3 pages each): the longest task 381 ms (v204 688 ms) - <= 1.25x v204's + 30 ms (0.55 of it; this build 381, 410, 359 / v204 695, 674, 688)  — 381 > 890
  PASS  6. season-closed: the memo the reminder's reading kept answered the dialog, on every page
  PASS  17. season-skipped, v204, page 1: the reminder read the record exactly once after the write
  PASS  17. season-skipped, v204, page 1: its line is up, counting 21 men («יש 21 עובדים שהחשבון שלהם עוד לא נסגר»)
  PASS  17. season-skipped, v204, page 1: pressing the line opened «סגירת שבוע», offering 21 men
  PASS  17. season-skipped, v204, page 1: the line's count (21) is a fresh count's
  PASS  17. season-skipped, now, page 1: the reminder read the record exactly once after the write
  PASS  17. season-skipped, now, page 1: its line is up, counting 21 men («יש 21 עובדים שהחשבון שלהם עוד לא נסגר»)
  PASS  17. season-skipped, now, page 1: pressing the line opened «סגירת שבוע», offering 21 men
  PASS  17. season-skipped, now, page 1: the line's count (21) is a fresh count's
  PASS  17. season-skipped, v204, page 2: the reminder read the record exactly once after the write
  PASS  17. season-skipped, v204, page 2: its line is up, counting 21 men («יש 21 עובדים שהחשבון שלהם עוד לא נסגר»)
  PASS  17. season-skipped, v204, page 2: pressing the line opened «סגירת שבוע», offering 21 men
  PASS  17. season-skipped, v204, page 2: the line's count (21) is a fresh count's
  PASS  17. season-skipped, now, page 2: the reminder read the record exactly once after the write
  PASS  17. season-skipped, now, page 2: its line is up, counting 21 men («יש 21 עובדים שהחשבון שלהם עוד לא נסגר»)
  PASS  17. season-skipped, now, page 2: pressing the line opened «סגירת שבוע», offering 21 men
  PASS  17. season-skipped, now, page 2: the line's count (21) is a fresh count's
  PASS  17. season-skipped, v204, page 3: the reminder read the record exactly once after the write
  PASS  17. season-skipped, v204, page 3: its line is up, counting 21 men («יש 21 עובדים שהחשבון שלהם עוד לא נסגר»)
  PASS  17. season-skipped, v204, page 3: pressing the line opened «סגירת שבוע», offering 21 men
  PASS  17. season-skipped, v204, page 3: the line's count (21) is a fresh count's
  PASS  17. season-skipped, now, page 3: the reminder read the record exactly once after the write
  PASS  17. season-skipped, now, page 3: its line is up, counting 21 men («יש 21 עובדים שהחשבון שלהם עוד לא נסגר»)
  PASS  17. season-skipped, now, page 3: pressing the line opened «סגירת שבוע», offering 21 men
  PASS  17. season-skipped, now, page 3: the line's count (21) is a fresh count's
  PASS  17. season-skipped: both builds count the same men, on every page
  PASS  5. season-skipped: a write on Thursday, then the close reminder's reading after its quiet (the median of 3 pages each): the longest task 1617 ms (v204 1653 ms) - <= 1.25x v204's + 30 ms (0.98 of it; this build 1526, 1852, 1617 / v204 1606, 1681, 1653)  — 1617 > 2096
  PASS  6. season-skipped: then «סגירת שבוע» opened from the reminder's line, the record unmoved (the median of 3 pages each): the longest task 1313 ms (v204 1552 ms) - <= 1.25x v204's + 30 ms (0.85 of it; this build 1285, 1544, 1313 / v204 1552, 1612, 1530)  — 1313 > 1970
  PASS  6. season-skipped: the memo the reminder's reading kept answered the dialog, on every page
  PASS  7. the closing box (a weekly man): the longest task 188 ms (v204 4563 ms) - <= 1/2 of v204's  — 188 > 2282
  PASS  8. «כרטיס עובד» (a fortnightly man): the longest task 260 ms (v204 2346 ms) - <= 1/2 of v204's  — 260 > 1173
  PASS  9. «תלוש לכל עובד»: the longest task 545 ms (v204 not timed) - <= 3,000 ms  — 545 > 3000
  PASS  10. «סיכום חודש»: the longest task 219 ms (v204 237 ms) - <= 1.25x v204's + 30 ms  — 219 > 326
  PASS  11. a write, «דוחות», a send's provenance key (the tick moved, the record not), «דוחות» redrawn: the longest task 376 ms (v204 44809 ms) - <= 1/10 of v204's row 1 and <= 1/4 of this page's own first draw (3755 ms)  — 376 > 939
  PASS  11. the memo the first draw kept answered the redraw across the tick (S3 holds no tick), nothing worked out anew
**FAIL**  12. season-closed: a man's page of «מקדמות», opened from the board (the median of three men): the longest task 71 ms (v204 0 ms) - <= 1.25x v204's + 60 ms (one copy of a 1 MB record at 4x; this build 106, 71, 71 / v204 76, 0, 0)  — 71 > 60
  PASS  12. the board's memo answered each man's page, nothing worked out anew
  PASS  13. season-closed: «סגירות שנרשמו», opened from the board: the longest task 325 ms (v204 1100 ms) - <= 1/2 of v204's  — 325 > 550
  PASS  13. the board's memo answered it
  PASS  14. season-open: the first letter typed into «מקדמות»'s search: the longest task 72 ms (v204 1030 ms) - <= 1/4 of v204's  — 72 > 258
  PASS  14. season-open: the median of 6 letters: the longest task 67 ms (v204 1032 ms) - <= 1/4 of v204's (this build 72, 67, 68, 57, 52, 52 / v204 1030, 1101, 1032, 1119, 973, 240)  — 67 > 258
  PASS  14. every letter answered by the board's memo, nothing worked out anew; the same men listed on both builds
        the day screen, a write (commit + draw): this build 290 ms / v204 328 ms - reported, no budget
        1. a write, then «דוחות» opened: this build 4159 ms / v204 43980 ms
        2. then «לפי אתר» redrawn, the record unmoved: this build 204 ms / v204 47792 ms
        2. then «לפי עובד» redrawn, the record unmoved: this build 335 ms / v204 49137 ms
        3. a write, then «מקדמות» opened: this build 2277 ms / v204 8296 ms
        4. «שים לב» read after paint, the record moved: this build 2169 ms / v204 5988 ms
        5. season-open: a write on Thursday, then the close reminder's reading after its quiet: this build 2999 ms / v204 7501 ms
        6. season-open: then «סגירת שבוע» opened (no line: by the function the line calls), the record unmoved: this build 368 ms / v204 7616 ms
        5. season-closed: a write on Thursday, then the close reminder's reading after its quiet (the median of 3 pages each): this build 611 ms / v204 631 ms
        6. season-closed: then «סגירת שבוע» opened from the reminder's line, the record unmoved (the median of 3 pages each): this build 381 ms / v204 688 ms
        5. season-skipped: a write on Thursday, then the close reminder's reading after its quiet (the median of 3 pages each): this build 1617 ms / v204 1653 ms
        6. season-skipped: then «סגירת שבוע» opened from the reminder's line, the record unmoved (the median of 3 pages each): this build 1313 ms / v204 1552 ms
        7. the closing box (a weekly man): this build 188 ms / v204 4563 ms
        8. «כרטיס עובד» (a fortnightly man): this build 260 ms / v204 2346 ms
        9. «תלוש לכל עובד»: this build 545 ms / v204 -
        10. «סיכום חודש»: this build 219 ms / v204 237 ms
        11. a write, «דוחות», a send's provenance key (the tick moved, the record not), «דוחות» redrawn: this build 376 ms / v204 44809 ms
        12. season-closed: a man's page of «מקדמות», opened from the board (the median of three men): this build 71 ms / v204 0 ms
        13. season-closed: «סגירות שנרשמו», opened from the board: this build 325 ms / v204 1100 ms
        14. season-open: the first letter typed into «מקדמות»'s search: this build 72 ms / v204 1030 ms
        14. season-open: the median of 6 letters: this build 67 ms / v204 1032 ms
        (load at the end of the clocks: 3.1 4.4 5.1)
  PASS  18. no reading wrote to the disk: every act's disk after it was the disk its write left

15, 16. season-closed: drawn sharing, drawn again unmoved, drawn afresh - the same nodes and the same picture
  PASS  15. «דוחות», both sections: drawn sharing, drawn again on the unmoved record, and drawn afresh - the same innerHTML (124029 characters)
  PASS  16. sharePrintout('report'): the same PNG bytes drawn sharing and drawn afresh (d02839a51da6)
  PASS  15. «מקדמות», the board: drawn sharing, drawn again on the unmoved record, and drawn afresh - the same innerHTML (23337 characters)
  PASS  15. «מקדמות», a man's page: drawn sharing, drawn again on the unmoved record, and drawn afresh - the same innerHTML (4376 characters)
  PASS  15. «סגירות שנרשמו»: drawn sharing, drawn again on the unmoved record, and drawn afresh - the same innerHTML (2415 characters)
  PASS  15. the closing box: drawn sharing, drawn again on the unmoved record, and drawn afresh - the same innerHTML (787 characters)
  PASS  15. a man's days: drawn sharing, drawn again on the unmoved record, and drawn afresh - the same innerHTML (9135 characters)
  PASS  15. «כרטיס עובד»: drawn sharing, drawn again on the unmoved record, and drawn afresh - the same innerHTML (12184 characters)
  PASS  15. «תלוש לכל עובד»: drawn sharing, drawn again on the unmoved record, and drawn afresh - the same innerHTML (75244 characters)
  PASS  18. drawing every one of them, three times each, wrote nothing (the payslips' own open-state preference left out)
  PASS  the disk reading leaves out the service worker's census of open builds and no other key  — {"left":[],"census":"not written yet"}
  PASS  15. «דוחות», both sections, is v204's tree's node for node (124029 characters)
  PASS  18. no uncaught error on any page of either build

        (tests/speed.browser.mjs ran 14.7 minutes; load 2.4 4.1 5.0)

98/99 checks passed

failed:
  14. the clocks: fresh pages, 375x667, the processor slowed 4x, this build against v204 (load 2.6 3.9 5.5) :: 12. season-closed: a man's page of «מקדמות», opened from the board (the median of three men): the longest task 71 ms (v204 0 ms) - <= 1.25x v204's + 60 ms (one copy of a 1 MB record at 4x; this build 106, 71, 71 / v204 76, 0, 0)  — 71 > 60
exit 1 after 884s
end 04:45:02 load 2.42 4.12 5.02
```

</details>

### `tests/speed.browser.mjs` on `9ab1c1d`, its first run (66/67)

One page of each build on the Thursday rows of season-closed and season-skipped. Its one red, at load 10, is the clock that `3e2b867` measures on three pages each instead:

<details><summary>its output, whole</summary>

```
start 03:38:53 load 2.72 2.26 1.15
browser: CHROME_PATH unset, PLAYWRIGHT_BROWSERS_PATH=/tmp/claude-0/-home-user-farkad/d6a64352-db1a-5c3b-b54d-5c09103f2419/scratchpad/pw1194
season-open: {"kind":"open","men":40,"days":300,"from":"2025-12-05","to":"2026-11-19","closes":0,"repaid":8,"skippers":[],"advances":688,"ledger":696,"kib":954} - seeded in 45.7 s
season-closed: {"kind":"closed","men":40,"days":300,"from":"2025-12-05","to":"2026-11-19","closes":225,"repaid":5,"skippers":[],"advances":141,"ledger":530,"kib":1074} - seeded in 105.1 s
season-skipped: {"kind":"skipped","men":40,"days":300,"from":"2025-12-05","to":"2026-11-19","closes":214,"repaid":4,"skippers":["w_01","w_04","w_07","w_10","w_13","w_16"],"advances":136,"ledger":510,"kib":1066} - seeded in 90.5 s
  PASS  this build's origin serves this commit, byte for byte
  PASS  v204's origin serves 6ab193d, byte for byte

14. the clocks: fresh pages, 375x667, the processor slowed 4x, this build against v204 (load 10.4 9.5 6.1)
  PASS  1. a write, then «דוחות» opened: the longest task 4938 ms (v204 51561 ms) - <= 1/4 of v204's  — 4938 > 12890
  PASS  2. then «לפי אתר» redrawn, the record unmoved: the longest task 445 ms (v204 67219 ms) - <= 1/10 of v204's row 1 and <= 1/4 of this build's own (4938 ms)  — 445 > 1235
  PASS  2. «לפי אתר»: the memo «דוחות» kept answered the redraw, and nothing was worked out anew
  PASS  2. then «לפי עובד» redrawn, the record unmoved: the longest task 582 ms (v204 68212 ms) - <= 1/10 of v204's row 1 and <= 1/4 of this build's own (4938 ms)  — 582 > 1235
  PASS  2. «לפי עובד»: the memo «דוחות» kept answered the redraw, and nothing was worked out anew
  PASS  3. a write, then «מקדמות» opened: the longest task 1712 ms (v204 8787 ms) - <= 1/2 of v204's  — 1712 > 4394
  PASS  4. «שים לב» read after paint, the record moved: the longest task 2366 ms (v204 6910 ms) - <= 1/2 of v204's  — 2366 > 3455
  PASS  5. season-open: a write on Thursday, then the close reminder's reading after its quiet: the longest task 3379 ms (v204 7903 ms) - <= 0.7 of v204's  — 3379 > 5532
  PASS  17. season-open, v204: the reminder read the record exactly once after the write
  PASS  season-open, v204: every man held, so a count of 0 and no line - the dialog opened by the function the line calls
  PASS  17. season-open, now: the reminder read the record exactly once after the write
  PASS  season-open, now: every man held, so a count of 0 and no line - the dialog opened by the function the line calls
  PASS  6. season-open: then «סגירת שבוע» opened (no line: by the function the line calls), the record unmoved: the longest task 803 ms (v204 12002 ms) - <= 1/3 of v204's same act  — 803 > 4001
  PASS  6. season-open: the memo the reminder's reading kept answered the dialog
  PASS  5. season-closed: a write on Thursday, then the close reminder's reading after its quiet: the longest task 617 ms (v204 585 ms) - <= 1.25x v204's + 30 ms (1.05 of it)  — 617 > 761
  PASS  17. season-closed, v204: the reminder read the record exactly once after the write
  PASS  17. season-closed, v204: its line is up, counting 19 men («יש 19 עובדים שהחשבון שלהם עוד לא נסגר»)
  PASS  17. season-closed, v204: pressing the line opened «סגירת שבוע», offering 19 men
  PASS  17. season-closed, v204: the line's count (19) is a fresh count's
  PASS  17. season-closed, now: the reminder read the record exactly once after the write
  PASS  17. season-closed, now: its line is up, counting 19 men («יש 19 עובדים שהחשבון שלהם עוד לא נסגר»)
  PASS  17. season-closed, now: pressing the line opened «סגירת שבוע», offering 19 men
  PASS  17. season-closed, now: the line's count (19) is a fresh count's
  PASS  17. season-closed: both builds count the same men
  PASS  6. season-closed: then «סגירת שבוע» opened from the reminder's line, the record unmoved: the longest task 373 ms (v204 809 ms) - <= 1.25x v204's + 30 ms (0.46 of it)  — 373 > 1041
  PASS  6. season-closed: the memo the reminder's reading kept answered the dialog
**FAIL**  5. season-skipped: a write on Thursday, then the close reminder's reading after its quiet: the longest task 2031 ms (v204 1590 ms) - <= 1.25x v204's + 30 ms (1.28 of it)  — 2031 > 2018
  PASS  17. season-skipped, v204: the reminder read the record exactly once after the write
  PASS  17. season-skipped, v204: its line is up, counting 21 men («יש 21 עובדים שהחשבון שלהם עוד לא נסגר»)
  PASS  17. season-skipped, v204: pressing the line opened «סגירת שבוע», offering 21 men
  PASS  17. season-skipped, v204: the line's count (21) is a fresh count's
  PASS  17. season-skipped, now: the reminder read the record exactly once after the write
  PASS  17. season-skipped, now: its line is up, counting 21 men («יש 21 עובדים שהחשבון שלהם עוד לא נסגר»)
  PASS  17. season-skipped, now: pressing the line opened «סגירת שבוע», offering 21 men
  PASS  17. season-skipped, now: the line's count (21) is a fresh count's
  PASS  17. season-skipped: both builds count the same men
  PASS  6. season-skipped: then «סגירת שבוע» opened from the reminder's line, the record unmoved: the longest task 1335 ms (v204 2345 ms) - <= 1.25x v204's + 30 ms (0.57 of it)  — 1335 > 2961
  PASS  6. season-skipped: the memo the reminder's reading kept answered the dialog
  PASS  7. the closing box (a weekly man): the longest task 207 ms (v204 4807 ms) - <= 1/2 of v204's  — 207 > 2404
  PASS  8. «כרטיס עובד» (a fortnightly man): the longest task 445 ms (v204 2734 ms) - <= 1/2 of v204's  — 445 > 1367
  PASS  9. «תלוש לכל עובד»: the longest task 652 ms (v204 not timed) - <= 3,000 ms  — 652 > 3000
  PASS  10. «סיכום חודש»: the longest task 240 ms (v204 281 ms) - <= 1.25x v204's + 30 ms  — 240 > 381
  PASS  11. a write, «דוחות», a send's provenance key (the tick moved, the record not), «דוחות» redrawn: the longest task 313 ms (v204 49084 ms) - <= 1/10 of v204's row 1 and <= 1/4 of this page's own first draw (4405 ms)  — 313 > 1101
  PASS  11. the memo the first draw kept answered the redraw across the tick (S3 holds no tick), nothing worked out anew
  PASS  12. season-closed: a man's page of «מקדמות», opened from the board (the median of three men): the longest task 94 ms (v204 79 ms) - <= 1.25x v204's + 60 ms (one copy of a 1 MB record at 4x)  — 94 > 159
  PASS  12. the board's memo answered each man's page, nothing worked out anew
  PASS  13. season-closed: «סגירות שנרשמו», opened from the board: the longest task 325 ms (v204 820 ms) - <= 1/2 of v204's  — 325 > 410
  PASS  13. the board's memo answered it
  PASS  14. season-open: the first letter typed into «מקדמות»'s search: the longest task 62 ms (v204 1089 ms) - <= 1/4 of v204's  — 62 > 272
  PASS  14. season-open: the median of 6 letters: the longest task 74 ms (v204 1089 ms) - <= 1/4 of v204's  — 74 > 272
  PASS  14. every letter answered by the board's memo, nothing worked out anew; the same men listed on both builds
        the day screen, a write (commit + draw): this build 289 ms / v204 242 ms - reported, no budget
        1. a write, then «דוחות» opened: this build 4938 ms / v204 51561 ms
        2. then «לפי אתר» redrawn, the record unmoved: this build 445 ms / v204 67219 ms
        2. then «לפי עובד» redrawn, the record unmoved: this build 582 ms / v204 68212 ms
        3. a write, then «מקדמות» opened: this build 1712 ms / v204 8787 ms
        4. «שים לב» read after paint, the record moved: this build 2366 ms / v204 6910 ms
        5. season-open: a write on Thursday, then the close reminder's reading after its quiet: this build 3379 ms / v204 7903 ms
        6. season-open: then «סגירת שבוע» opened (no line: by the function the line calls), the record unmoved: this build 803 ms / v204 12002 ms
        5. season-closed: a write on Thursday, then the close reminder's reading after its quiet: this build 617 ms / v204 585 ms
        6. season-closed: then «סגירת שבוע» opened from the reminder's line, the record unmoved: this build 373 ms / v204 809 ms
        5. season-skipped: a write on Thursday, then the close reminder's reading after its quiet: this build 2031 ms / v204 1590 ms
        6. season-skipped: then «סגירת שבוע» opened from the reminder's line, the record unmoved: this build 1335 ms / v204 2345 ms
        7. the closing box (a weekly man): this build 207 ms / v204 4807 ms
        8. «כרטיס עובד» (a fortnightly man): this build 445 ms / v204 2734 ms
        9. «תלוש לכל עובד»: this build 652 ms / v204 -
        10. «סיכום חודש»: this build 240 ms / v204 281 ms
        11. a write, «דוחות», a send's provenance key (the tick moved, the record not), «דוחות» redrawn: this build 313 ms / v204 49084 ms
        12. season-closed: a man's page of «מקדמות», opened from the board (the median of three men): this build 94 ms / v204 79 ms
        13. season-closed: «סגירות שנרשמו», opened from the board: this build 325 ms / v204 820 ms
        14. season-open: the first letter typed into «מקדמות»'s search: this build 62 ms / v204 1089 ms
        14. season-open: the median of 6 letters: this build 74 ms / v204 1089 ms
        (load at the end of the clocks: 8.4 8.9 8.1)
  PASS  18. no reading wrote to the disk: every act's disk after it was the disk its write left

15, 16. season-closed: drawn sharing, drawn again unmoved, drawn afresh - the same nodes and the same picture
  PASS  15. «דוחות», both sections: drawn sharing, drawn again on the unmoved record, and drawn afresh - the same innerHTML (124029 characters)
  PASS  16. sharePrintout('report'): the same PNG bytes drawn sharing and drawn afresh (d02839a51da6)
  PASS  15. «מקדמות», the board: drawn sharing, drawn again on the unmoved record, and drawn afresh - the same innerHTML (23337 characters)
  PASS  15. «מקדמות», a man's page: drawn sharing, drawn again on the unmoved record, and drawn afresh - the same innerHTML (4376 characters)
  PASS  15. «סגירות שנרשמו»: drawn sharing, drawn again on the unmoved record, and drawn afresh - the same innerHTML (2415 characters)
  PASS  15. the closing box: drawn sharing, drawn again on the unmoved record, and drawn afresh - the same innerHTML (787 characters)
  PASS  15. a man's days: drawn sharing, drawn again on the unmoved record, and drawn afresh - the same innerHTML (9135 characters)
  PASS  15. «כרטיס עובד»: drawn sharing, drawn again on the unmoved record, and drawn afresh - the same innerHTML (12184 characters)
  PASS  15. «תלוש לכל עובד»: drawn sharing, drawn again on the unmoved record, and drawn afresh - the same innerHTML (75244 characters)
  PASS  18. drawing every one of them, three times each, wrote nothing (the payslips' own open-state preference left out)
  PASS  the disk reading leaves out the service worker's census of open builds and no other key  — {"left":[],"census":"not written yet"}
  PASS  15. «דוחות», both sections, is v204's tree's node for node (124029 characters)
  PASS  18. no uncaught error on any page of either build

        (tests/speed.browser.mjs ran 18.5 minutes; load 7.8 8.7 8.0)

66/67 checks passed

failed:
  14. the clocks: fresh pages, 375x667, the processor slowed 4x, this build against v204 (load 10.4 9.5 6.1) :: 5. season-skipped: a write on Thursday, then the close reminder's reading after its quiet: the longest task 2031 ms (v204 1590 ms) - <= 1.25x v204's + 30 ms (1.28 of it)  — 2031 > 2018

real	31m38.617s
user	2m13.316s
sys	0m8.688s
exit 1
end 04:10:32 load 7.81 8.71 8.02
```

</details>

### The existing browser suites this round's changes reach, one after another inside one slot

Every suite that types into the closing box or the search of «מקדמות» (by grep: account-view, overpaidfix, reportnames,
simple-advances, polish, midnight) and those that draw «מקדמות», «דוחות», «סגירת שבוע», the reminder, the forms, the payslips
and the card - the readings a kept memo now goes back without a second copy for - and smoke. The first nine ran on `ea92a19`
(`bt touched.sh`, from the clean tree; the machine restarted after the ninth), the other six on `3e2b867` (`bt touched2.sh`,
Chromium 1194); nothing the browser is served differs between those commits and `7af295a` (`git diff --stat ea92a19 7af295a -- js css index.html sw.js` is empty):

```
commit ea92a19421eda7753587ebbecd871c7e1b6af183 started 03:21:52
account-view.browser.mjs	exit 0	3s	74/74 checks passed	(load 5.65 4.73 4.09)
overpaidfix.browser.mjs	exit 0	5s	20/20 checks passed	(load 5.44 4.70 4.09)
reportnames.browser.mjs	exit 0	18s	258/258 checks passed	(load 8.15 5.38 4.33)
simple-advances.browser.mjs	exit 0	3s	22/22 checks passed	(load 8.15 5.38 4.33)
polish.browser.mjs	exit 0	23s	201/201 checks passed	(load 8.13 5.58 4.42)
midnight.browser.mjs	exit 0	131s	323/323 checks passed	(load 8.30 6.44 4.89)
owes.browser.mjs	exit 0	63s	589/589 checks passed	(load 6.98 6.37 4.96)
weeklyclose.browser.mjs	exit 0	69s	408/408 checks passed	(load 8.19 6.74 5.18)
closereminder.browser.mjs	exit 0	52s	106/106 checks passed	(load 9.97 7.52 5.54)

commit 3e2b867242865a59e2472c86571eeea0661aef65 started 04:45:02
forms.browser.mjs	exit 0	11s	32/32 checks passed	(load 2.61 4.10 5.00)
reports.browser.mjs	exit 0	4s	109/109 checks passed	(load 3.20 4.20 5.03)
reportsclarity.browser.mjs	exit 0	6s	193/193 checks passed	(load 2.94 4.13 5.00)
payslips.browser.mjs	exit 0	12s	132/132 checks passed	(load 2.59 4.00 4.94)
workercard.browser.mjs	exit 0	13s	116/116 checks passed	(load 2.34 3.90 4.90)
smoke.mjs	exit 0	320s	1186/1186 checks passed	(load 4.24 3.57 4.39)
DONE 04:51:08
```

### The run times

`tests/speed.test.mjs`: 9.0 minutes inside the chain (round 0: 5.3; reports.speed beside it in the same chain: 369 s). `tests/speed.season.test.mjs`: 36.5 minutes. `tests/speed.browser.mjs`: 15.4 minutes in the slot.

## The budget, as measured (Node on `9ab1c1d`, Chromium on `7af295a` - the same `js/`)

### Node - tests/speed.season.test.mjs (criterion 13), both builds in one process on the same disk, interleaved v204 / this, the median of three each; load at the end of the clocks 4.1 5.1 6.6 (other suites running beside: this report's `npm test` chain at first, and other tracks')

| reading | season-open, after a change (this / v204 ms) | season-open, unmoved | season-closed, after a change | ceilings (open / unmoved / closed) |
|---|---|---|---|---|
| «דוחות» (one draw builds both sections) | 1,351 / not timed (minutes) | 71 / - | 276 / 2,180 | ≤ 5,000 / ≤ 800 / ≤ 1/4 |
| the workbook | 1,313 / - | 42 / - | 181 / 4,460 | ≤ 5,000 / ≤ 800 / ≤ 1/6 |
| «תלוש לכל עובד», this period | 1,298 / - | 74 / - | 217 / 2,817 | ≤ 5,000 / ≤ 800 / ≤ 1/6 |
| «תלוש לכל עובד», the period before | 1,320 / - | 96 / - | 233 / 2,577 | ≤ 5,000 / ≤ 800 / ≤ 1/6 |
| the closing box, a weekly man | 372 / 3,268 | 78 / 3,340 | 89 / 176 | ≤ 0.35 / ≤ 1/4 / ≤ 1.25x + 30 |
| the closing box, a fortnightly man | 269 / 881 | 42 / 835 | 69 / 104 | ≤ 0.6 / ≤ 1/4 / ≤ 1.25x + 30 |
| a man's days | 448 / 3,649 | 79 / 3,265 | 81 / 216 | ≤ 0.35 / ≤ 1/4 / ≤ 1.25x + 30 |
| his statement | 378 / 1,864 | 11 / 1,960 | 93 / 145 | ≤ 0.5 / ≤ 1/2 / ≤ 1.25x + 30 |
| «מקדמות» | 828 / 6,487 | 43 / 1,117 | 178 / 1,107 | ≤ 0.35 / ≤ 1/4 / ≤ 1/2 |
| a man's page of «מקדמות» | 24 / 151 | 13 / 135 | 21 / 24 | ≤ 0.6x + 20 / ≤ 0.6x + 20 / ≤ 1.25x + 30 |
| «סגירות שנרשמו» | 656 / 4,873 | 9 / 9 | 221 / 1,091 | ≤ 0.35 / **≤ 1.25x + 30** (round 0, deviation 1) / ≤ 1/2 |
| owesReadNow («שים לב») | 671 / 5,097 | 118 / 4,903 | 133 / 761 | ≤ 0.35 / ≤ 1/4 / ≤ 1/2 |
| «סגירת שבוע»'s list | 1,165 / 2,584 | 111 / 2,509 | 253 / 292 | ≤ 0.75 / ≤ 1/4 / ≤ 1.25x + 30 |
| the reminder's count | 1,384 / 2,523 | 97 / 2,554 | 259 / 289 | ≤ 0.75 / ≤ 1/4 / ≤ 1.25x + 30 |
| «איפוס מקדמות»'s reading | 1,298 / 2,540 | 155 / 2,626 | 172 / 176 | ≤ 0.75 / ≤ 1/4 / ≤ 1.25x + 30 |
| «איפוס מקדמות»'s step 3 (the board after the write) | 679 / 4,700 | 119 / 4,709 | 123 / 627 | ≤ 0.35 / ≤ 1/4 / ≤ 1.25x + 30 |
| «כרטיס עובד», a weekly man | 300 / 3,020 | 28 / 3,304 | 69 / 167 | ≤ 0.35 / ≤ 1/4 / ≤ 1.25x + 30 |
| «כרטיס עובד», a fortnightly man | 192 / 1,657 | 32 / 1,683 | 51 / 90 | ≤ 0.35 / ≤ 1/4 / ≤ 1.25x + 30 |
| «סיכום חודש» | 44 / 43 | 37 / 42 | 50 / 47 | ≤ 1.25x + 20 each |
| season-skipped: «סגירת שבוע»'s list | - | - | 674 / 666 after a change, 554 / 699 unmoved | ≤ 1.25x + 30 |
| season-skipped: the reminder's count | - | - | 650 / 836 after a change, 624 / 700 unmoved | ≤ 1.25x + 30 |
| season-closed, both gates shut, «דוחות» | - | - | 109 / 113 | ≤ 1.25x + 30 |
| season-closed, nobody approved, «דוחות» | - | - | 7,434 / 67,214 | ≤ 0.4 |
| the kept key, season-open's record (977,262 characters) | 8 ms | | | ≤ 30 ms |

Every row passed (94/94).

### Chromium - tests/speed.browser.mjs (criterion 14), Chromium 1194, 375x667, DPR 2, touch, CPU 4x through CDP; every row in a fresh page of each tree (6ab193d's served beside on its own port), alternating v204 / this build, unless the row says otherwise; the longest task of the act; load 1.90 3.41 4.65 when the run was queued, 3.4 4.2 4.5 at the end of the clocks; commit `7af295a`

| row | this build / v204, ms | ceiling | this / v204 |
|---|---|---|---|
| 1. a write, then «דוחות» opened | 3,858 / 45,103 | <= 1/4 of v204's | 0.09 |
| 2. then «לפי אתר» redrawn, the record unmoved | 213 / 47,636 | <= 1/10 of v204's row 1 and <= 1/4 of this build's own (3858 ms) | 0.00 |
| 2. then «לפי עובד» redrawn, the record unmoved | 380 / 47,552 | <= 1/10 of v204's row 1 and <= 1/4 of this build's own (3858 ms) | 0.01 |
| 3. a write, then «מקדמות» opened | 1,991 / 7,645 | <= 1/2 of v204's | 0.26 |
| 4. «שים לב» read after paint, the record moved | 2,190 / 5,974 | <= 1/2 of v204's | 0.37 |
| 5. season-open: a write on Thursday, then the close reminder's reading after its quiet | 3,363 / 8,495 | <= 0.7 of v204's | 0.40 |
| 6. season-open: then «סגירת שבוע» opened (no line: by the function the line calls), the record unmoved | 405 / 8,230 | <= 1/3 of v204's same act | 0.05 |
| 5. season-closed: a write on Thursday, then the close reminder's reading after its quiet (the median of 3 pages each) | 568 / 648 | <= 1.25x v204's + 30 ms (0.88 of it; this build 568, 562, 734 / v204 671, 617, 648) | 0.88 |
| 6. season-closed: then «סגירת שבוע» opened from the reminder's line, the record unmoved (the median of 3 pages each) | 354 / 744 | <= 1.25x v204's + 30 ms (0.48 of it; this build 354, 361, 348 / v204 744, 651, 748) | 0.48 |
| 5. season-skipped: a write on Thursday, then the close reminder's reading after its quiet (the median of 3 pages each) | 1,816 / 1,725 | <= 1.25x v204's + 30 ms (1.05 of it; this build 2206, 1816, 1664 / v204 1749, 1545, 1725) | 1.05 |
| 6. season-skipped: then «סגירת שבוע» opened from the reminder's line, the record unmoved (the median of 3 pages each) | 1,485 / 1,800 | <= 1.25x v204's + 30 ms (0.82 of it; this build 1472, 1485, 1557 / v204 1828, 1800, 1788) | 0.82 |
| 7. the closing box (a weekly man) | 193 / 4,216 | <= 1/2 of v204's | 0.05 |
| 8. «כרטיס עובד» (a fortnightly man) | 257 / 2,315 | <= 1/2 of v204's | 0.11 |
| 9. «תלוש לכל עובד» | 597 / not timed | <= 3,000 ms |  |
| 10. «סיכום חודש» | 212 / 187 | <= 1.25x v204's + 30 ms | 1.13 |
| 11. a write, «דוחות», a send's provenance key (the tick moved, the record not), «דוחות» redrawn | 321 / 46,985 | <= 1/10 of v204's row 1 and <= 1/4 of this page's own first draw (4174 ms) | 0.01 |
| 12. season-closed: a man's page of «מקדמות», opened from the board (its own synchronous draw, the median of three men) | 82 / 44 | <= 1.25x v204's + 60 ms (one copy of a 1 MB record at 4x; this build 89, 82, 79 / v204 80, 44, 41) | 1.86 |
| 13. season-closed: «סגירות שנרשמו», opened from the board | 339 / 999 | <= 1/2 of v204's | 0.34 |
| 14. season-open: the first letter typed into «מקדמות»'s search (its own synchronous call) | 53 / 982 | <= 1/4 of v204's | 0.05 |
| 14. season-open: the median of 6 letters (each its own synchronous call) | 62 / 1,006 | <= 1/4 of v204's (this build 53, 66, 47, 63, 62, 53 / v204 982, 932, 1006, 1030, 1060, 249) | 0.06 |
| the day screen: a write (commit + draw) | 278 / 321 | reported, no budget (js/state.js, js/store.js) | |

Every row passed (99/99).

## Criterion 8: the counts, v204 → this build, for every way in

Real calls of the model functions, counted from before the first reading (the `COUNTER` pattern), one cold reading per way in (`REPORT_SHARED_KEPT = null` first), on the medium season with closes (`tests/speed.test.mjs` on `9ab1c1d`, in the chain); "keys" is `reportSharedKey` computations, now counted per reading. Every rule held for all 35 ways in - each reader once per question a reading, `advanceHistory` never, `payrollReport` once per range a reading, the key at most twice a reading and never for a reading that asks none of the seven, no question of the seven asked outside a reading, the gate not asked on an approved record. A way in that types into a drawn page counts all its readings together (the box's two figures and its press are four readings with the box's own: `keys 5` is 2 + 1 + 1 + 1):

```
the default account: «דוחות» ← «לפי עובד»: ledgerEntries 2506 -> 1, foldLedger 1497 -> 1, advanceHistory 1008 -> 0, overpaidAdvances 474 -> 15, advanceOutstanding 1008 -> 30, advanceWalk 459 -> 278, advancePositionInto 30 -> 30, payrollReport 39 -> 39, keys 2
the default account: «דוחות» ← «לפי אתר»: ledgerEntries 1390 -> 1, foldLedger 834 -> 1, advanceHistory 556 -> 0, overpaidAdvances 278 -> 15, advanceOutstanding 556 -> 30, advanceWalk 278 -> 278, advancePositionInto 15 -> 15, payrollReport 39 -> 39, keys 2
the default account: the pay rows: ledgerEntries 1390 -> 1, foldLedger 834 -> 1, advanceHistory 556 -> 0, overpaidAdvances 278 -> 15, advanceOutstanding 556 -> 30, advanceWalk 278 -> 278, advancePositionInto 15 -> 15, payrollReport 38 -> 38, keys 2
the default account: the workbook: ledgerEntries 4170 -> 1, foldLedger 2502 -> 1, advanceHistory 1668 -> 0, overpaidAdvances 834 -> 15, advanceOutstanding 1668 -> 30, advanceWalk 834 -> 278, advancePositionInto 45 -> 15, payrollReport 39 -> 39, keys 2
the default account: w_1: his statement: ledgerEntries 125 -> 1, foldLedger 75 -> 1, advanceHistory 50 -> 0, overpaidAdvances 25 -> 1, advanceOutstanding 50 -> 2, advanceWalk 25 -> 25, advancePositionInto 1 -> 1, payrollReport 25 -> 25, keys 2
the default account: w_1: his days: ledgerEntries 255 -> 1, foldLedger 152 -> 1, advanceHistory 102 -> 0, overpaidAdvances 50 -> 1, advanceOutstanding 100 -> 2, advanceWalk 50 -> 25, advancePositionInto 0 -> 0, payrollReport 25 -> 25, keys 2
the default account: w_1: his closing box: ledgerEntries 252 -> 1, foldLedger 152 -> 1, advanceHistory 100 -> 0, overpaidAdvances 50 -> 1, advanceOutstanding 100 -> 2, advanceWalk 50 -> 25, advancePositionInto 0 -> 0, payrollReport 25 -> 25, keys 2
the default account: w_1: his closing box, figures typed and «הצג בדוח» pressed: ledgerEntries 630 -> 1, foldLedger 380 -> 1, advanceHistory 250 -> 0, overpaidAdvances 125 -> 1, advanceOutstanding 250 -> 2, advanceWalk 125 -> 25, advancePositionInto 0 -> 0, payrollReport 100 -> 25, keys 5
the default account: w_2: his statement: ledgerEntries 65 -> 1, foldLedger 39 -> 1, advanceHistory 26 -> 0, overpaidAdvances 13 -> 1, advanceOutstanding 26 -> 2, advanceWalk 13 -> 13, advancePositionInto 1 -> 1, payrollReport 13 -> 13, keys 2
the default account: w_2: his days: ledgerEntries 135 -> 1, foldLedger 80 -> 1, advanceHistory 54 -> 0, overpaidAdvances 26 -> 1, advanceOutstanding 52 -> 2, advanceWalk 26 -> 13, advancePositionInto 0 -> 0, payrollReport 13 -> 13, keys 2
the default account: w_2: his closing box: ledgerEntries 132 -> 1, foldLedger 80 -> 1, advanceHistory 52 -> 0, overpaidAdvances 26 -> 1, advanceOutstanding 52 -> 2, advanceWalk 26 -> 13, advancePositionInto 0 -> 0, payrollReport 13 -> 13, keys 2
the default account: w_2: his closing box, figures typed and «הצג בדוח» pressed: ledgerEntries 330 -> 1, foldLedger 200 -> 1, advanceHistory 130 -> 0, overpaidAdvances 65 -> 1, advanceOutstanding 130 -> 2, advanceWalk 65 -> 13, advancePositionInto 0 -> 0, payrollReport 52 -> 13, keys 5
«מקדמות»: ledgerEntries 60 -> 1, foldLedger 30 -> 1, advanceHistory 30 -> 0, overpaidAdvances 0 -> 0, advanceOutstanding 30 -> 30, advanceWalk 0 -> 0, advancePositionInto 0 -> 0, payrollReport 0 -> 0, keys 2
«סגירות שנרשמו»: ledgerEntries 1 -> 1, foldLedger 1 -> 1, advanceHistory 0 -> 0, overpaidAdvances 76 -> 12, advanceOutstanding 152 -> 24, advanceWalk 76 -> 36, advancePositionInto 36 -> 36, payrollReport 10 -> 10, keys 2
owesRead: ledgerEntries 1116 -> 1, foldLedger 663 -> 1, advanceHistory 452 -> 0, overpaidAdvances 196 -> 15, advanceOutstanding 452 -> 30, advanceWalk 181 -> 181, advancePositionInto 15 -> 15, payrollReport 38 -> 38, keys 2
owesReadNow: ledgerEntries 1116 -> 1, foldLedger 663 -> 1, advanceHistory 452 -> 0, overpaidAdvances 196 -> 15, advanceOutstanding 452 -> 30, advanceWalk 181 -> 181, advancePositionInto 15 -> 15, payrollReport 38 -> 38, keys 2
«סגירת שבוע»'s list: ledgerEntries 1 -> 1, foldLedger 1 -> 1, advanceHistory 0 -> 0, overpaidAdvances 269 -> 14, advanceOutstanding 566 -> 28, advanceWalk 269 -> 247, advancePositionInto 0 -> 0, payrollReport 37 -> 37, keys 2
the reminder's count: ledgerEntries 1 -> 1, foldLedger 1 -> 1, advanceHistory 0 -> 0, overpaidAdvances 269 -> 14, advanceOutstanding 566 -> 28, advanceWalk 269 -> 247, advancePositionInto 0 -> 0, payrollReport 37 -> 37, keys 2
the payslips, this period: ledgerEntries 2780 -> 1, foldLedger 1668 -> 1, advanceHistory 1112 -> 0, overpaidAdvances 556 -> 15, advanceOutstanding 1112 -> 30, advanceWalk 556 -> 278, advancePositionInto 30 -> 15, payrollReport 38 -> 38, keys 2
the payslips, the period before: ledgerEntries 2630 -> 1, foldLedger 1578 -> 1, advanceHistory 1052 -> 0, overpaidAdvances 526 -> 15, advanceOutstanding 1052 -> 30, advanceWalk 526 -> 263, advancePositionInto 30 -> 15, payrollReport 36 -> 36, keys 2
the month: ledgerEntries 0 -> 0, foldLedger 0 -> 0, advanceHistory 0 -> 0, overpaidAdvances 0 -> 0, advanceOutstanding 0 -> 0, advanceWalk 0 -> 0, advancePositionInto 0 -> 0, payrollReport 2 -> 2, keys 0
the month before: ledgerEntries 0 -> 0, foldLedger 0 -> 0, advanceHistory 0 -> 0, overpaidAdvances 0 -> 0, advanceOutstanding 0 -> 0, advanceWalk 0 -> 0, advancePositionInto 0 -> 0, payrollReport 2 -> 2, keys 0
«איפוס מקדמות»'s reading: ledgerEntries 1 -> 1, foldLedger 1 -> 1, advanceHistory 0 -> 0, overpaidAdvances 278 -> 15, advanceOutstanding 616 -> 30, advanceWalk 263 -> 263, advancePositionInto 0 -> 0, payrollReport 36 -> 36, keys 2
«מקדמות», a letter typed into its search: ledgerEntries 88 -> 1, foldLedger 44 -> 1, advanceHistory 44 -> 0, overpaidAdvances 0 -> 0, advanceOutstanding 44 -> 30, advanceWalk 0 -> 0, advancePositionInto 0 -> 0, payrollReport 0 -> 0, keys 3
w_1: his page of «מקדמות»: ledgerEntries 19 -> 1, foldLedger 8 -> 1, advanceHistory 10 -> 0, overpaidAdvances 0 -> 0, advanceOutstanding 8 -> 2, advanceWalk 0 -> 0, advancePositionInto 0 -> 0, payrollReport 0 -> 0, keys 2
w_1: his card: ledgerEntries 260 -> 1, foldLedger 153 -> 1, advanceHistory 106 -> 0, overpaidAdvances 50 -> 1, advanceOutstanding 102 -> 2, advanceWalk 50 -> 25, advancePositionInto 2 -> 1, payrollReport 25 -> 25, keys 2
w_2: his page of «מקדמות»: ledgerEntries 19 -> 1, foldLedger 8 -> 1, advanceHistory 10 -> 0, overpaidAdvances 0 -> 0, advanceOutstanding 8 -> 2, advanceWalk 0 -> 0, advancePositionInto 0 -> 0, payrollReport 0 -> 0, keys 2
w_2: his card: ledgerEntries 140 -> 1, foldLedger 81 -> 1, advanceHistory 58 -> 0, overpaidAdvances 26 -> 1, advanceOutstanding 54 -> 2, advanceWalk 26 -> 13, advancePositionInto 2 -> 1, payrollReport 14 -> 14, keys 2
a close's page 2026-07-23T15:00:00.000Z|d_office: ledgerEntries 2 -> 1, foldLedger 2 -> 1, advanceHistory 0 -> 0, overpaidAdvances 88 -> 12, advanceOutstanding 176 -> 24, advanceWalk 88 -> 36, advancePositionInto 40 -> 36, payrollReport 10 -> 10, keys 2
a close's page 2026-07-09T15:00:00.000Z|d_office: ledgerEntries 2 -> 1, foldLedger 2 -> 1, advanceHistory 0 -> 0, overpaidAdvances 112 -> 12, advanceOutstanding 224 -> 24, advanceWalk 112 -> 36, advancePositionInto 48 -> 36, payrollReport 10 -> 10, keys 2
a close's page 2026-07-02T15:00:00.000Z|d_office: ledgerEntries 2 -> 1, foldLedger 2 -> 1, advanceHistory 0 -> 0, overpaidAdvances 104 -> 12, advanceOutstanding 208 -> 24, advanceWalk 104 -> 36, advancePositionInto 44 -> 36, payrollReport 10 -> 10, keys 2
a close's page 2026-06-25T15:00:00.000Z|d_office: ledgerEntries 2 -> 1, foldLedger 2 -> 1, advanceHistory 0 -> 0, overpaidAdvances 112 -> 12, advanceOutstanding 224 -> 24, advanceWalk 112 -> 36, advancePositionInto 54 -> 36, payrollReport 10 -> 10, keys 2
a close's page 2026-06-18T15:00:00.000Z|d_office: ledgerEntries 2 -> 1, foldLedger 2 -> 1, advanceHistory 0 -> 0, overpaidAdvances 98 -> 12, advanceOutstanding 196 -> 24, advanceWalk 98 -> 36, advancePositionInto 50 -> 36, payrollReport 10 -> 10, keys 2
a close's page 2026-06-11T15:00:00.000Z|d_office: ledgerEntries 2 -> 1, foldLedger 2 -> 1, advanceHistory 0 -> 0, overpaidAdvances 92 -> 12, advanceOutstanding 184 -> 24, advanceWalk 92 -> 36, advancePositionInto 50 -> 36, payrollReport 10 -> 10, keys 2
a close's page 2026-06-04T15:00:00.000Z|d_office: ledgerEntries 2 -> 1, foldLedger 2 -> 1, advanceHistory 0 -> 0, overpaidAdvances 78 -> 12, advanceOutstanding 156 -> 24, advanceWalk 78 -> 36, advancePositionInto 38 -> 36, payrollReport 10 -> 10, keys 2
```

Season-closed, one draw of «דוחות» ← «לפי עובד» (`tests/speed.season.test.mjs` on `9ab1c1d`):

```
one draw of «לפי עובד» on season-closed, v204 -> this build: ledgerEntries 3343 -> 1, foldLedger 1865 -> 1, advanceHistory 1477 -> 0, overpaidAdvances 348 -> 40, advanceOutstanding 1477 -> 141, advanceWalk 324 -> 277, advancePositionInto 48 -> 48, payrollReport 18 -> 18
PASS  v204 listed the ledger 3343 times for it, this build 1: at least 50x  — 3343 / 1
```

## An existing suite's expectation moved (one, the contract's, deliberately)


`tests/owes.test.mjs:1012-1019` - «"דוחות" with the row at its head asks exactly what "דוחות" asks without it»
compares two draws in a row. Under S3 the first draw is the first reading of the pay sheet's ranges after
«מקדמות» and the second finds them kept, so the counts differed by the warm-up and not by the row (on prototype
D `[0,0,2,15] !== [0,0,1,15]`). Each of the two draws now starts with `REPORT_SHARED_KEPT = null`, so it is again
one draw against the other. The check's words and its expectation are unchanged. Commit `0753250` says why.
Nothing else in an existing suite moved; `tests/gate.integrity.test.mjs` and `package.json` and
`tests/README.md` are additive.

Fix round 1 moved no expectation of an existing suite: every check it changed is one of this track's own
(tests/speed.*), each named with its reason in `ea92a19`'s message.

## Where the contract was wrong about the code, and what was done (its intent kept)


1. **«סגירות שנרשמו» unmoved on season-open: "≤ 1/4 of v204's" cannot hold, and is held by the cheap-reading
   rule instead (commit `247bcfa`).** v204 already keeps that page's one reading - the board, `OWES_KEPT`
   (owesKey, owes.js) - and season-open has no close to list, so v204 draws it unmoved in milliseconds (measured:
   this build 8 ms / v204 8 ms in the first season run, 19 / 12 ms in the final one; the prototype's `measure.mjs`
   used the same body, and the contract listed only prototype D's 8 ms, not v204's). A quarter of 8 ms is no ceiling a draw can meet. The
   cell is held to the contract's own rule for a reading already cheap on v204 - never slower than 1.25x + 30 ms;
   after a change on season-open (≤ 0.35) and every cell on season-closed (≤ 1/2) are as the contract says.
2. **The medium season's v204 side lives in the season suite** (commit `a349c31`), by the contract's own rule
   ("if it is longer, the medium season's v204 side moves to the season suite and the report says so"):
   with it, `tests/speed.test.mjs` ran 11.2 minutes against reports.speed's 2.9 measured right after it. Criteria 1
   and 3 on the medium season are held against v204 there (both records, three readings of the gate, cold, again
   and the list again; the 26 writes); criterion 3 is held against the same way drawn afresh in `npm test`, and
   criterion 1 there runs on the seeded records and the two fixtures.
3. **Payday's row on «מקדמות» (the LATER rule) is implemented and counted, not yet exercised** (commit `9404c76`).
   `SNAP` replaces an `owes-actions` row by its children that v204 also draws (`weekly-close-entry` stays, in
   place) and takes out and counts its children v204 does not draw (`payday-entry`) - `SPEED_LATER` - with
   the boards drawn counted too. On feat-speed: 0 rows on every board (asserted, with boards > 0). Probed
   against feat-payday's owes.js (read with `git show`, not touched): with the rule the boards are equal and
   one row, one entry per board is counted; without it they differ. `LATER_SCREENS` in tests/speed.seed.mjs is
   the list of later screen files loaded on BOTH sides; it is `[]` here and the integrator adds
   `'js/ui/payday.js'` (the check then expects exactly one row per board by itself; see the integrator's list).
4. **Criterion 3's "approval removed and restored in memory" needed the lists of ways in to be built where no
   reading had just been kept** - an implementation note, not a change of intent: the first reading after the
   approval is removed plans the gate (minutes on nothing, seconds on the medium season) and, being a first
   reading, keeps; the suite builds the lists on the v204 phone and uses the first counted reading with keys > 0
   for the "called again" rule.
5. **Criterion 7 warm needs `OWES_KEPT` cleared on both phones** - v204's own `OWES_KEPT` is keyed without the
   readers (owesKey), so a board kept with every reader present is handed by v204 itself to a draw with a reader
   taken away; the suite warms both phones identically and clears `OWES_KEPT` on both, so the comparison is of
   S3, which is what the criterion is about. (v204's OWES_KEPT behaviour is not this track's and is unchanged.)
6. **Smoke's :7071 case in Node, and `foldLedger` taken away** - with `foldLedger` undefined, the
   `weeklyCloseOnce` wrappers v204 installs throw inside `owesClosures`; criterion 7 reads the close keys inside
   a try/catch on both phones and compares outcomes (the same bytes or the same throw), as criterion 5 does.
7. **Criterion 8 on season-open: this build's counts held to every rule for 35 ways in, v204's not taken there.**
   The contract says "v204's counts printed beside"; on the medium season they are, for all 32 ways in, and on
   season-closed for the draw it names (with the ≥ 50x rule); on season-open v204's readings take 40 s to minutes
   each («דוחות», the workbook, the payslips), so its counts are not taken there - the rules are this build's, and
   they are what catch S1 gone missing (mutant M1, above).
8. **Row 6 and criterion 17 in Chromium: on season-open the reminder's line never shows - its count is 0 - so
   «סגירת שבוע» is opened by `openWeeklyClose()`, the function the line's button calls.** Probed: «סגירת שבוע»
   lists 38 men on season-open and holds all 38 - 37 for an earlier open period a debt ran through (D5, as v198
   rules), one whose period ends today - so the count is 0 on both builds and there is no line to press. The
   reading is the same one (the spy on `weeklyCloseRead` proves the reminder read once after the write, and the
   line's count, 0, equals a fresh count on both builds); the row's name in the suite says which way it opened.
9. **The browser suite's afresh draws answer the gate once, by v196's rule** (commit `22830d3`). Criterion 15's
   "drawn afresh" plants `REPORT_ONCE`, as reports.speed does, and so reaches the bare gate, which plans the
   migration before reading the approval: 161 s in Node on season-closed (measured), a dozen times a draw. As
   reports.speed and `AFRESH` do, the gate is answered once for the record during an afresh draw - here through
   `reportGateAnswer` (an approved record is not planned; reports.speed holds it equal to the gate). The same
   commit fixes the suite's own fault that stopped its first run at row 6 (`both()` kept a page without its CDP
   session); rows 1-5 of that first run had passed (row 1: 3,229 ms against v204's 36,126).
10. **(fix round 1) Goal 6 - "«סגירת שבוע» opened from the reminder's line … costs a small fraction of the first"
    - holds only where there is no line.** On season-open (the record the contract measured it on) every man is
    held, the count is 0 on both builds and no line is up; opened by the function the line calls, the dialog is
    0.05 of v204's (round 0). On the records where the line shows - season-closed and season-skipped, the
    owner's own Thursday shape - the dialog opened from the line with the record unmoved is 0.48 on season-closed and 0.82 on season-skipped (the medians of three fresh pages of each build, `7af295a`: 354 / 744 and 1485 / 1800 ms; one page each on `9ab1c1d`: 0.46 and 0.57) of v204's
    at 4x (the review: 0.69-0.93 and 0.83-0.84), and the reminder's own reading after a write 0.88 on season-closed and 1.05 on season-skipped (the medians of three fresh pages of each build, `7af295a`: 568 / 648 and 1816 / 1725 ms; one page each on `9ab1c1d`: 1.05 and 1.28) (the review:
    0.88 and 1.00): after a write the reading IS the model's walk of every man's last period, and the
    unmoved one still plans, at every reading, the copies of the record a close's plan asks each advance on (`planPeriodClosure` →
    `outstandingWithout`, js/model/ledger.js:1223 - season-closed: 68 folds of copies, the review's count) and an empty week is closed first on (season-skipped). Those rows
    are now measured there, pressing the real line, held to never being slower than v204 (1.25x + 30 ms),
    and the memo that answered the dialog is read off the page; the claim is corrected in the release draft.
11. **"a few ms (32 walks for 4 men)" for the copies (contract.md:837) - on season-skipped they are most of the
    reading.** Each «סגירת שבוע» reading there plans 184 walks, 98 pay sheets and 742 `advanceOutstanding` calls
    on copies (the review's count, `unmoved-counts.out`): about 0.4 s of a 0.43 s unmoved reading in Node. The
    contract keeps copies out of scope (another record is never answered from memory, reports.js:58-60, and
    `weeklyCloseWithoutEmpties` lives in `js/ui/weeklyclose.js`, which this track may not touch); what would
    make the owner's Thursday faster - the copies' plans kept per (record key, man) between readings - is a
    design change for the owner and the designer, said under NOT done.
12. **"reportSharedKey costs about 10 ms" / "≈ 10 ms on a 1 MB record" (contract.md:275 and :843) - in Node.**
    At 4x in Chromium two copies were 70-80 ms of a man's page of «מקדמות» (39 → 119 ms, the review). Fix
    round 1 takes one of the two away wherever a reading works out nothing new: that page is now 67 ms
    against v204's 48 (the medians of 12 taps each, `glass-manpage-closed.jsonl`), and 82 ms against v204's 44 (the synchronous draw, the median of three men) in the
    suite's row 12 (`7af295a`). A reading that works something out still pays two - the bracket the contract
    keeps on purpose ("What it does NOT do").
13. **"a few MB on a season record" (contract.md:273-274) - true on an approved one, not on a record nobody
    approved.** Measured with `--expose-gc` after one draw of «דוחות» (`probe-memory2.mjs`, `probe-memory.mjs`):
    approved season-closed 15.6 MB held against v204's 12.9, approved season-open 17.5 MB; season-closed nobody
    approved, with a man who owes and has no daily rate, 65 MB before fix round 1 (4,006 sheets, 164,246 rows
    kept: the plan's four thousand fortnights) and 26 MB after it (2 sheets; the plan's 16,175 walks are still
    kept, so a plan asked again after a send's receipt needs no sheet: 192 ms instead of the first draw's
    5.9 s) against v204's 14.7.

## Fix round 2 (on `602c1a8`)

One finding, from the independent verifier's run on `602c1a8`: «verification failures», P1. Triaged:
CONFIRMED as described, and LEFT, because it is the contract's own expected red (contract, "Existing suites
touched": "Expected red on this branch, and only this").

- `tests/build.test.mjs` «the stamps were moved by the commit that moved the bytes :: and nothing in the
  shell has changed since» - re-run here on `602c1a8`: 68/69, the one red naming js/ui/advancereset.js,
  js/ui/owes.js, js/ui/reports.js changed since 6ab193d6.
- `tests/gate.integrity.test.mjs` §4 «no cached file has changed since the three stamps last moved» - re-run
  here: 19/20, the one red naming ea92a194, 77e63e22, 07532505, 90a34820, f9bc05b8.

Both say one fact: three cached files changed and the three stamps did not move. The only fix is to move the
stamps (index.html:108, js/app.js:7, sw.js:24), which the hard rules give to the integrator alone; weakening
either check is not a fix. No code changed in this round, so no other suite was re-run (the verifier ran 107 of
109 npm test steps green, 34 browser runs and the season suite green, on this same commit). `npm test` is a
chain of `&&` and stops at test:build, so on this branch it exits 1 until the integrator moves the stamps; the
integrator re-runs the whole of it after the stamps move, as "For the integrator" says.

## For the integrator

**«מה חדש» (PROPOSED; fix round 1 replaces the contract's Revision 2 item, which repeated v196's own almost
word for word - «דוחות נפתחים מהר יותר» / «עמוד הדוחות ועמוד המקדמות נפתחים הרבה יותר מהר», whatsnew.js:131-135):**

```js
{ title: 'גם כרטיס העובד והתלושים נפתחים מהר', text: 'כרטיס העובד ותלוש לכל עובד נפתחים עכשיו מהר גם כשיש הרבה מקדמות שלא נסגרו, והסכומים עצמם לא השתנו.', where: 'דוחות ← לפי עובד ← הפקת דוח ← תלוש לכל עובד, וגם צוות ← כרטיס עובד', go: 'payReport' }
```

It leads with what is new since v196 - the card and the payslips, which on a crew nobody closes took seconds
and minutes on v204 - and promises nothing about «סגירת שבוע», the close reminder or a man's page of «מקדמות»:
on the owner's own Thursday shape the reminder's reading is v204's time and «סגירת שבוע» from its line a little
under it (below), and a man's page is a few tens of ms slower. Measured against tests/whatsnew.test.mjs's rules: a title of 34 characters (≤ 40), one sentence of 98
(≤ 120) ending in its only full stop, no «נשלח». `go: 'payReport'` is an existing key (`WHATSNEW_GO.payReport`,
«דוחות» ← «לפי עובד», nothing pressed), and `where` starts there and uses the existing «…, וגם …» form (as
«מסך ההסעות ← דוח הסעות לתקופה, וגם דוחות ← הפקת דוח» does); the two places are named as the v188 items name them
(«דוחות ← לפי עובד ← הפקת דוח ← תלוש לכל עובד», «צוות ← כרטיס עובד»). Pin it word for word in tests/whatsnew.test.mjs; tests/whatsnew.browser.mjs's key list and
landing rules do not move.

**CLAUDE.md, the file list** - the `js/ui/reports.js` entry gains, after its v196 sentence:

    v206: the ledger's folds, each man's walk and each range's pay sheet once per reading, kept under the record
    and its readers between readings (REPORT_SHARED_KEPT, reportSharedKey - the record as text, no tick;
    REPORT_SHARED_DEPENDS); a reading that works out nothing new goes back with one copy of the record, not
    two; the sheets the gate's own plan prices are not kept; a letter typed into «מקדמות»'s search and a figure
    typed into the closing box are read inside the reading too

and the `tests/` part gains `tests/speed.test.mjs`, `tests/speed.season.test.mjs`, `tests/speed.browser.mjs` and
the helper `tests/speed.seed.mjs` (the rows written for tests/README.md can be lifted).

**docs/releases.md, a draft of the entry** (the numbers are this report's; fix round 1 corrected what it said
about cheap readings, the owner's Thursday and memory):

    ## v206 — «דוחות» and «מקדמות» answer each man's walk once: the readings share what they already worked out

    js/ui/reports.js (reportReadOnce and the helpers above it, the search of «מקדמות», the closing box's preview
    and buttons), js/ui/owes.js (owesReadNow, three lines) and one line of js/ui/advancereset.js. Nothing in
    js/model, js/sync, the state, the store or the recovery; no screen, node, string, key, field path or writer;
    no CSS; no file added to the shell. NO OUTPUT BYTE MOVES: every way in of «דוחות», «מקדמות» (its search
    typed into), «סגירת שבוע», the reminder, the cards, the payslips, the month, the closing box (figures typed
    into it, «הצג בדוח» pressed) and «איפוס מקדמות» is held byte for byte against v204's files (6ab193d, out of
    Git) - cold, again and after 26 kinds of write - on the seeded records, two fixtures, a medium season and
    three season records (tests/speed.*).

    Why. On a season nobody closed, every reader of a man's account walked every period of his since his first
    advance, and every step of every walk folded and sorted the whole ledger again: v204 took 40 s in Node to draw
    «דוחות», 44 s in one task in Chromium at 4x, and two minutes for «תלוש לכל עובד» or the workbook.

    What changed. S1: inside v196's one reading the seven readers of a walk answer each question once, for the
    reading's own record only; an append to a copy of its own forgets nothing, anything that can reach the record
    forgets everything. S2: «שים לב» read after paint, and «איפוס מקדמות»'s result, read the board inside a reading.
    S3: the answers are kept between readings under the record as text, today and the flags (not the write tick, so
    a send's receipts do not make the next redraw a first reading), and only for the same readers; a reading that
    works out nothing new is put back with one copy of the record, not two. S4: each range's pay sheet kept with
    them, handed to a later reading as rows of its own - not the sheets the gate's own plan prices on a record
    nobody approved. And a letter typed into «מקדמות»'s search and a figure typed into the closing box are read
    inside the reading as their pages are (each letter re-read every listed man's advances: 850 ms at 4x).

    What it does NOT do. The first reading after a change still walks every man's periods once (≈ 1 s in Node,
    seconds at 4x on a season nobody closed - an index in js/model is the next lever, the owner's to approve). ON
    A CREW THAT CLOSES ITS WEEKS - the owner's Thursday - the close reminder's reading after a pause is v204's time,
    and «סגירת שבוע» opened from its line a little under it (the reminder's reading 0.88 and 1.05 of v204's, «סגירת שבוע» from the line 0.48 and 0.82, on season-closed and season-skipped at 4x): after a write the reading is that walk
    of every man's last period, and the copies of the record a close is judged on and an empty week is closed
    first on are planned again at every reading, by rule (a copy is never answered from memory). A reading that
    was already cheap pays one copy of the whole record as text, two when it works something out: a man's page of
    «מקדמות» opened from the board takes 67-82 ms at 4x on a 1 MB record where v204 takes 44-48. On a record nobody approved
    one draw keeps the plan's walks (26 MB held on season-closed with a man who owes and has no daily rate,
    against v204's 15). The commit's own cost is untouched. Not tried on a real phone.

**The wave-1 resets** (the contract's "Conflicts with wave 1" - each makes a timed run cold, as on v204). Fix
round 1 re-points them: the round-0 list named lines that had moved. Add
`if (typeof REPORT_SHARED_KEPT !== 'undefined') REPORT_SHARED_KEPT = null;`, found by name - the line numbers
are the same on the branch heads (`feat-payday` `b95149a`, `feat-status` `f4cf70b`, `feat-yearsummary` `9a4b8e7`)
and on the merged tree as it stands (`release-v206` `d2d4710`), checked with `git show`:
- tests/payday.test.mjs: inside `const fresh = d => d.run('OWES_KEPT = null; REPORT_GATE_KEPT = null; PAYDAY_KEPT = null; 1');`
  (:148), which `timed()` (:847) calls before each of its three runs - so P8's medians are cold again;
- tests/statusscreen.test.mjs: in device `b`'s reset `b.run('OWES_KEPT = null; REPORT_GATE_KEPT = null;');` (:1481),
  under "The board with nothing kept, on the season nobody closed" (:1480) - readings precede it on `b`. The two
  other blocks of that name need nothing: the screens' record `s` (:1548) and season D `c` (:1590) are fresh
  devices that read nothing before them (their seeding writes through `weeklyCloseOnce`, which keeps no memo of
  this track's, and every write would move the key anyway);
- tests/yearsummary.test.mjs: inside the timed loop `for (let n = 0; n < 3; n += 1) {` (:1625), before
  `yearSummaryFacts(2026)` on each of the three runs - the loop swaps `carryReportingEnabled` (a name of
  `REPORT_SHARED_DEPENDS`) once before it, so runs 2 and 3 would adopt run 1's memo and its "median of three under
  500 ms" would time a warm reading.

**Criterion 8's wave-1 ways in**: add `paydayFacts`, `statusMoneyFacts` and `yearSummaryFacts` to the lists of
ways in (`PAGE_WAYS`/`BOOK_WAYS` in tests/speed.seed.mjs) and re-run tests/speed.test.mjs and
tests/speed.season.test.mjs; their screen files go on BOTH sides (`SCREENS`), as `payday.js` must.

**The later-track rule**: add `'js/ui/payday.js'` to `LATER_SCREENS` in tests/speed.seed.mjs (loaded on both
sides; 6ab193d's owes.js never calls it, so v204's board is unchanged by it). Nothing else moves: the check
«the rows later tracks add to «מקדמות», taken out and counted: K on N boards drawn» expects K = 0 while no
`paydayEntryButton` is loaded and K = N (one row, one entry per board) once it is - the contract's "exactly one
per draw once payday.js is loaded" - so it turns red by itself if payday's row is missing or doubled.

**Merge order** (the contract's): v205, then wave 1, then speed; then re-run one by one: speed (all three suites),
reports.speed, owes, payday, status and statusscreen, yearsummary, monthsummary, weeklyclose, closereminder and
advancereset (Node and browser).

**Expected red on this branch, and only this** (the stamps are the integrator's), as fix round 1 leaves it -
`ea92a19` is one more commit that moved a cached file (`9ab1c1d`, `3e2b867` and `7af295a` move none); the same two
lines on `9ab1c1d` (the chain), on `3e2b867` and on `7af295a`:

```
test:build           **FAIL**  and nothing in the shell has changed since  — 3 changed since 6ab193d6: js/ui/advancereset.js, js/ui/owes.js, js/ui/reports.js
test:gate-integrity  **FAIL**  no cached file has changed since the three stamps last moved  — ea92a194 reports.js: one copy of the record for a reading that adds n | 77e63e22 reports.js: each range's pay sheet kept with the walks, as r | 07532505 reports.js: the walks kept between readings of a record that | 90a34820 owes.js, advancereset.js: the board read after paint, and af | f9bc05b8 reports.js: the ledger's folds and each man's walk, once per
```

The integrator's stamp commit turns both green.

## NOT done, and not verified

- **The owner's Thursday is not made much faster** (finding 7's second half, LEFT). On season-closed and
  season-skipped the close reminder's reading after a write stays at v204's time (0.88 and 1.05 of it, the medians
  of three pages each at 4x) and «סגירת שבוע» opened from its line takes half to most of it (0.48 and 0.82): after a
  write the reading is the model's walk of every man's last period (S1 shares it, there is little to share), and
  the copies of the record - a close's plan asks each of the man's advances on one (`planPeriodClosure` →
  `outstandingWithout`, js/model/ledger.js:1223), an empty week is closed first on another
  (`weeklyCloseWithoutEmpties`, js/ui/weeklyclose.js) - are read again at every reading, because another record is never answered from memory. What would change it: the copies' plans kept
  per (record key, man) between readings - a change of the contract's rule and of a file this track may not
  touch, for the owner and the designer to decide. The rows now say so and are held to never slower.
- **`npm run test:all` was never run as one command** - the task's rule (never `test:all`, `test:release` or the
  emulator suites; the full gate is run once, later, alone). This round ran `npm test` IN FULL one script at a time
  on a clean detached worktree at `9ab1c1d` and the season suite there (the commits after it change only
  tests/speed.browser.mjs and a README row; the four scripts that read the test files ran again on `7af295a`), this
  track's browser suite on `7af295a` (the code-final commit), and the fifteen existing browser suites the round's
  changes reach - nine on `ea92a19` before the machine restarted, six on `3e2b867` (nothing the browser is served
  differs between those commits and `7af295a`). The other browser suites of
  `test:all` - the floors (largetext, mobile, design), print, update and the day screen's - were NOT re-run in this
  round: they were green on round 0's `22830d3` (design and smoke on `9404c76`), fix round 1 moved no node, word,
  key or style, and the code paths it changed are each driven by a suite that was re-run. One chain on one commit,
  run by the integrator on the merged tree, is still owed.
- The emulator suites (`test:emulator`, `test:sendclaim`) - not run, by rule; nothing in js/sync changed.
- Not tried on a real phone; the 4x CPU throttle in Chromium stands in for one, in fresh pages.
- Not merged with wave 1 (status, payday, monthboard, yearsummary) or v205: the resets, the ways in and the
  later-track file are the integrator's, on the merged tree (re-pointed in this round, For the integrator).
- The browser rows rest on one green run, on `7af295a` (the load is printed beside them), after two runs of one red
  each whose reds were the suite's own measuring (one page each on two builds that are level; a long-task observer
  that sees nothing under 50 ms) - both said under the suites. Every fraction is against v204 taken in the same
  browser, alternating, one fresh page per row per tree, except the Thursday rows on season-closed and
  season-skipped, three pages each; medians only where a row times more than one act (those rows, 12 and 14).
- `closeAccountFor`'s re-plan at the moment of the write is still bare (finding 8 named only the box's figures and
  buttons; the writer's own last look at the record is left as it was, once per close).
- The contract's "What it does NOT do" stands, with the corrections of items 10-13: the first reading after a
  change is still the model's walk; the reminder's reading is still a main-thread task after a pause on a
  Thursday; copies of the record are read again every time; the commit, the boot and the gate's plan on an
  unapproved record are untouched (the plan's walks, not its sheets, are now what one draw of such a record keeps).

## Known risks

- **Memory** (measured in fix round 1, `--expose-gc`, after one draw of «דוחות»). `REPORT_SHARED_KEPT` holds one
  record's answers, the record as text (the key) and the schedule object until a reading replaces or drops it,
  never two at once: on an approved season-closed 15.6 MB held by the draw against v204's 12.9, on an approved
  season-open 17.5 MB. On a record nobody approved the gate's plan is asked inside the reading and its WALKS are
  kept (16,175 on season-closed with a man who owes and has no daily rate: 26 MB held against v204's 14.7; 65 MB
  before fix round 1, when its 4,006 sheets were kept too). On a phone short of memory that is more than v204 held
  (v204 already holds the record's text in `OWES_KEPT`'s key, and in `REPORT_GATE_KEPT`'s on a record that must
  be planned).
- **The copy of the record per reading** (`JSON.stringify` at the first question): every reading that asks one of
  S1's seven pays one, and a reading that works something out pays a second at its close. On a 1 MB record at 4x
  that is a few tens of ms a copy - a man's page of «מקדמות» opened from the board is 67 ms against v204's 48
  (the median of twelve taps each; 119 with two copies), and 82 ms against v204's 44 (the synchronous draw, the median of three men) in the suite's row 12 on `7af295a`. Held
  in the browser suite by row 12's "v204's + one copy" and in Node by the budget's 1.25x + 30 ms. A letter typed
  into the search of «מקדמות» and a figure typed into the closing box are a reading each now, so each pays that
  one copy too: 62 ms a letter against v204's 1,006 in row 14, the median of six, where v204 read every listed man's advances again.
- **A reading that works nothing out is put back WITHOUT a second look at the record** (fix round 1). What it puts
  back is exactly the memo a reading of the same key checked at its close, and the next reading's first key
  still refuses it if the record moved; but a record changed in place DURING that reading, without
  `appendLedgerEntry`, would be served the memo for the rest of that reading - the same trust v196 gives a sheet
  inside a reading (no reader does this today; tests/speed.test.mjs 21 drops the memo at the next reading's
  first question when the record moved in memory).
- **A model reader added later that the model feature-detects** must join `REPORT_SHARED_DEPENDS`;
  tests/speed.test.mjs fails until it does (criterion 11 greps js/model). A reader added to S1's seven must keep
  the rules (exact arity and types, `asked !== schedule` first, answers copied).
- **A suite that replaces a model function outside `REPORT_SHARED_DEPENDS` on a device that has already read**
  must clear `REPORT_SHARED_KEPT` (as suites clear `OWES_KEPT`); the app never replaces one. The three wave-1
  timed suites above are the known cases.
- **Something that changes the record in place inside a reading without `appendLedgerEntry`** is caught at the
  close of a reading that worked something out (the record must still read as at the first question), but a sheet
  worked out before that first question is trusted as v196 trusts it; no reader does this today.
- **The kept answers share the record's own entry objects** (`ledgerEntries` returns them, as the real function
  does): nothing edits an entry (iron law 1), and a record whose text changed is never served from memory.
- **A new hand on a drawn page** (a field, a button) that reads money in its own handler must open
  `reportReadOnce` as the page's draw does, or it reads bare: tests/speed.test.mjs's criterion 8 forbids a bare
  question of the seven for every way in it knows, and a new hand is a new way in to add there.

## Appendix: the diff of the app (`git diff 6ab193d..7af295a -- js/`)

The contract's report asks for it whole: `js/ui/reports.js`, `js/ui/owes.js`, `js/ui/advancereset.js` - nothing else under `js/` differs, and nothing under `js/` moved after `ea92a19`.

<details><summary>498 lines</summary>

```diff
diff --git a/js/ui/advancereset.js b/js/ui/advancereset.js
index d053f8e..db3be04 100644
--- a/js/ui/advancereset.js
+++ b/js/ui/advancereset.js
@@ -778,7 +778,7 @@ function advanceResetAfter(result, chosen) {
         return;
     }
     // «3 · נרשם», read off the record as it now is.
-    const board = owesRead(State.schedule, todayStr());
+    const board = typeof owesReadNow === 'function' ? owesReadNow() : owesRead(State.schedule, todayStr());
     ADVANCE_RESET.result = {
         key: `${result.at}|${result.by}`,
         closes: done.reduce((sum, man) => sum + man.periods.length, 0),
diff --git a/js/ui/owes.js b/js/ui/owes.js
index 941768d..c747026 100644
--- a/js/ui/owes.js
+++ b/js/ui/owes.js
@@ -664,7 +664,10 @@ function owesReadNow() {
     const today = todayStr();
     const key = owesKey(State.schedule, today);
     if (OWES_KEPT && OWES_KEPT.key === key) return OWES_KEPT.read;
-    const read = owesRead(State.schedule, today);
+    // Inside the pay sheet's one reading (reportReadOnce, js/ui/reports.js), so a board read
+    // after paint or after «איפוס מקדמות» shares the walks the readers in it ask for (v206).
+    const reading = () => owesRead(State.schedule, today);
+    const read = typeof reportReadOnce === 'function' ? reportReadOnce(reading) : reading();
     OWES_KEPT = { key, read };
     return read;
 }
diff --git a/js/ui/reports.js b/js/ui/reports.js
index 95e7eef..033f866 100644
--- a/js/ui/reports.js
+++ b/js/ui/reports.js
@@ -68,8 +68,35 @@ let ADVANCE_ORDER_DRAFT = null;
 // before, and tests/reports.speed.test.mjs holds every cell of the sheet, the paper's
 // tables, the workbook, the statements and the cards byte for byte against the pay sheet
 // of v195 (out of Git) under both readings of the gates.
+//
+// AND THE LEDGER AND EACH MAN'S WALK, ONCE (v206). What was left after v196 was the walk:
+// every reader that asks for a man's account - his row's carry, his notes, his card, the
+// closing box, the board, his statement, «סגירת שבוע» - walks every period of his since his
+// first advance, and every step of every walk folds the WHOLE ledger again (advanceWalk ->
+// overpaidAdvances -> advanceOutstanding -> foldLedger + advanceHistory, js/model). Measured
+// on a season nobody closed (40 men, 300 days): 40 seconds for one draw of «דוחות» in Node,
+// 44 in one task in Chromium slowed four times, two minutes for the payslips. So inside the
+// reading the seven readers of that walk - ledgerEntries, foldLedger, advanceHistory,
+// overpaidAdvances, advanceOutstanding, advanceWalk, advancePositionInto - answer THIS record
+// once per question (reportShareLedger, below), for every way in that opens the reading:
+// the two pages, a man's days, his closing, his statement, the workbook, the card, the
+// payslips, the month, «סגירת שבוע»'s list and «איפוס מקדמות»'s. Same rules as the three
+// above: another record goes to the real function every time, an append that can reach
+// this record forgets every answer, and the readers are put back in the same finally.
+//
+// AND BETWEEN READINGS OF A RECORD THAT DID NOT MOVE, those answers and each range's pay
+// sheet are kept (REPORT_SHARED_KEPT) under a key that is the record (reportSharedKey:
+// today, the build's flags and the whole record as text - NOT the write tick, which a
+// send's queue, receipt and provenance writes move minutes after a write without moving
+// the record) and under the very readers they were worked out with (REPORT_SHARED_DEPENDS,
+// compared by identity: an answer of advanceOutstanding with no advanceHistory loaded is
+// another answer). One record's answers at a time; the next reading of the same schedule
+// object, the same key and the same readers starts from them, anything else drops them.
+// tests/speed.test.mjs holds every way in byte for byte against v204's files (out of Git),
+// cold and warm, and counts what is asked.
 let REPORT_ONCE = null;
 let REPORT_GATE_KEPT = null;
+let REPORT_SHARED_KEPT = null;
 
 function reportGateKey(schedule) {
     return [
@@ -108,47 +135,361 @@ function reportReading() {
     return REPORT_ONCE !== null && REPORT_ONCE.schedule === State.schedule;
 }
 
+// ---------------------------------------------------- the ledger and the walks, once (v206)
+//
+// THE SEVEN READERS OF A MAN'S WALK, answered once per question inside a reading. Each is
+// a model function read and never changed (js/model/ledger.js, js/model/schema.js); what
+// is asked of it here is exactly what its own callers ask, and anything else - another
+// schedule, another number of arguments, an id that is neither a string nor a number - goes
+// to the real function, untouched.
+const REPORT_SHARED_READERS = ['ledgerEntries', 'foldLedger', 'advanceHistory', 'overpaidAdvances',
+    'advanceOutstanding', 'advanceWalk', 'advancePositionInto'];
+
+// WHAT THOSE ANSWERS DEPEND ON BESIDES THE RECORD: the readers themselves, the one appender,
+// v196's three, and every name js/model feature-detects (`typeof X === 'function'`) - because
+// the model's answer depends on which of them is loaded. advanceOutstanding reads the old
+// field when foldLedger or advanceHistory is absent; advanceWalk counts no overpayment with
+// no overpaidAdvances; frozenPeriodFor freezes nothing with no closedPeriods. An answer kept
+// with every reader loaded, handed to a reading with one taken away, was 2,000 where the
+// model says 3,000 (the critic's probe, 2026-11-19). So a kept answer is handed on only when
+// every one of these is the SAME function it was worked out with, and inside one reading
+// only while each is as present as it was when the reading opened. tests/speed.test.mjs
+// fails the day the model feature-detects a name that is not on this list.
+const REPORT_SHARED_DEPENDS = REPORT_SHARED_READERS.concat(['appendLedgerEntry', 'carryReportingEnabled',
+    'payrollReport', 'closedPeriods', 'workerDaysReport', 'rimaCount', 'poisonedContainers',
+    'planAdvanceCarry', 'overpaymentStaysCredit', 'ledgerContainerProblem', 'isPeriodFor']);
+
+// THE KEY THE KEPT ANSWERS ARE KEPT UNDER IS THE RECORD, and nothing that moves without it.
+//
+// Today, the build's flags and the whole record as text, compared and never hashed - owesKey's
+// rule. NOT the write tick (reportGateKey keeps it, for the gate): every answer kept here is a
+// function of the record's content, today, the flags and the readers present, and of nothing
+// else - js/model reads no Store, no clock and nothing of the sync (tests/speed.test.mjs pins
+// it) - while the tick moves with every queue, receipt and provenance write a send leaves
+// behind (js/store.js counts each of those keys), so on a synced phone a send landing minutes
+// after a write would make the next redraw a first reading again.
+function reportSharedKey(schedule) {
+    return [
+        String(typeof todayStr === 'function' ? todayStr() : ''),
+        typeof FARKAD_FLAGS === 'object' ? JSON.stringify(FARKAD_FLAGS) : '',
+        JSON.stringify(schedule)
+    ].join('|');
+}
+
+// The readers as they are on the page right now, by name, in REPORT_SHARED_DEPENDS's order.
+function reportSharedFound() {
+    const page = typeof globalThis === 'object' && globalThis ? globalThis : {};
+    return REPORT_SHARED_DEPENDS.map(name => page[name]);
+}
+
+// A pay sheet's rows as a reader may be handed them: a new list of new rows. A row of
+// payrollReport is flat - strings, numbers, booleans, null (js/model/money.js; pinned by
+// tests/speed.test.mjs) - so a shallow copy is a whole one, and a reader that wrote into a
+// row it was handed could never reach the rows kept for the next reading.
+function reportSharedRows(rows) {
+    if (!Array.isArray(rows)) return rows;
+    return rows.map(row => (row !== null && typeof row === 'object' ? Object.assign({}, row) : row));
+}
+
+// An append that cannot reach this record: its first argument is an object other than the
+// record, with a ledger object of its own and a map of entries of its own - the copy
+// «סגירת שבוע» closes a man's empty periods on first (weeklyCloseWithoutEmpties). The
+// appender writes only into its first argument's own map (js/model/ledger.js), so such an
+// append moves nothing this reading answers for. Anything else - the record itself, a copy
+// sharing the record's ledger object or its map, something that is not an object - can.
+function reportSharedApart(asked, schedule) {
+    const object = value => value !== null && typeof value === 'object';
+    const ledger = object(schedule) ? schedule.ledger : undefined;
+    const map = object(ledger) ? ledger.advances : undefined;
+    return asked !== schedule && object(asked) && object(asked.ledger) && asked.ledger !== ledger
+        && object(asked.ledger.advances) && asked.ledger.advances !== map;
+}
+
+// ONE READING'S SHARE OF THE LEDGER, for the record it opened on.
+//
+// The answers are kept per STATE of the record, the rule weeklyCloseOnce keeps (js/ui/
+// weeklyclose.js): the schedule object, its ledger map, its map of advances, and a count of
+// the appends that could reach it. An append that can - or one that throws - forgets every
+// answer, and the reading then keeps nothing for later; an append to a copy of its own (see
+// reportSharedApart) forgets nothing. What is handed out is what the real function would
+// hand out, as a copy wherever a caller could change it: the lists sliced, the flat answers
+// copied, the fold shared as v196 shares a pay sheet - nothing writes into a fold
+// (currentAdvances, the one function that does, has no caller; pinned).
+//
+// Between readings (S3), at the FIRST question this reading asks of the seven, the key is
+// worked out (reportSharedKey) and a kept memo of THIS schedule object, this key and these
+// readers is adopted - anything else kept is dropped there and then. At the close, after
+// every reader is put back, the memo is kept again only if the key was worked out, nothing
+// could reach the record, something was asked, and the record still reads as it did. A key
+// that throws means nothing adopted and nothing kept. A reading that asks none of the seven
+// (the month's summary) works out no key at all.
+//
+// AND A READING THAT ADDED NOTHING IS PUT BACK WITHOUT THE SECOND COPY. The second key - the
+// whole record as text again - is the check that the answers a reading WORKED OUT were worked
+// out on the record its first key read. A reading that took a kept memo and worked out no
+// answer and no sheet of its own has nothing to check: it hands back exactly what it was
+// handed, answers a reading of this same key already checked at its close. So it goes back on
+// the shelf under that key as it is, and whether the record moved since is the next reading's
+// first key's question, as it always was. Measured on a 1 MB season at 4x: the two copies of
+// the record were most of a man's page of «מקדמות» opened from the board (the review: 39 ms on
+// v204, 119 with two; with one, 67 against v204's 48 in a later run). A redraw, a man's page, a
+// letter typed into the search, the press of a button over a box already drawn: one copy.
+//
+// The pay sheets (S4) are kept with it: a range this reading works out is put aside as rows
+// nobody has touched; a range asked after the memo was adopted is handed a fresh copy of the
+// kept rows, and that copy is then the reading's, shared inside it exactly as v196 shares one.
+// NOT the sheets the gate's own question prices while it plans the migration of a record
+// nobody approved (reportReadOnce says when): those are shared inside the reading as v196
+// shares them and never put aside - see reportReadOnce.
+function reportShareLedger(schedule, found) {
+    const page = typeof globalThis === 'object' && globalThis ? globalThis : {};
+    const real = {};
+    REPORT_SHARED_READERS.concat(['appendLedgerEntry']).forEach(name => {
+        real[name] = typeof page[name] === 'function' ? page[name] : null;
+    });
+    // Which of the readers were there when the reading opened. A scope opened inside it may
+    // put one in that was absent (weeklyCloseOnce installs its own whether or not the real
+    // reader is loaded); while that is so the model's answer is another one, and every
+    // question goes to the real function, remembered nowhere.
+    const present = found.map(fn => typeof fn === 'function');
+    const asPresent = () => {
+        for (let n = 0; n < present.length; n += 1) {
+            if ((typeof page[REPORT_SHARED_DEPENDS[n]] === 'function') !== present[n]) return false;
+        }
+        return true;
+    };
+    const liveMap = () => (schedule && schedule.ledger && schedule.ledger.advances) || null;
+    const liveLegacy = () => (schedule && schedule.advances) || null;
+    const sameFound = list => Array.isArray(list) && list.length === found.length
+        && list.every((fn, at) => fn === found[at]);
+    let moved = 0;
+    let memo = null;
+    // How many answers a memo holds. Nothing is ever taken out of one or set twice (each
+    // answer is stored only where it is missing), so the same count means nothing was added.
+    const sizeOf = slot => (slot.entries ? 1 : 0) + (slot.fold ? 1 : 0) + (slot.history ? 1 : 0)
+        + slot.overpaid.size + slot.outstanding.size + slot.walks.size + slot.positions.size;
+    let keyed = false;
+    let key = null;
+    let adopted = null;
+    const pristine = new Map();
+    const fresh = () => ({ held: liveMap(), legacy: liveLegacy(), moved, entries: null, fold: null, history: null,
+        overpaid: new Map(), outstanding: new Map(), walks: new Map(), positions: new Map() });
+    const ensureKey = () => {
+        if (keyed) return;
+        keyed = true;
+        try { key = reportSharedKey(schedule); } catch (error) { key = null; }
+        const kept = REPORT_SHARED_KEPT;
+        if (!kept) return;
+        // Taken off the shelf either way: adopted, it is this reading's until the close puts
+        // it back; anything else it can no longer serve, and its memory is freed now.
+        REPORT_SHARED_KEPT = null;
+        if (kept.schedule !== schedule || key === null || kept.key !== key || !sameFound(kept.found)
+            || moved !== 0 || !kept.memo) return;
+        adopted = { memo: kept.memo, sheets: kept.sheets instanceof Map ? kept.sheets : new Map(),
+            held: liveMap(), legacy: liveLegacy(), size: sizeOf(kept.memo) };
+        memo = kept.memo;
+        memo.held = adopted.held;
+        memo.legacy = adopted.legacy;
+        memo.moved = moved;
+    };
+    const now = () => {
+        ensureKey();
+        if (!memo || memo.held !== liveMap() || memo.legacy !== liveLegacy() || memo.moved !== moved) memo = fresh();
+        return memo;
+    };
+    // A key for one argument: its type and its value, -0 apart from 0. Only for the two
+    // kinds of id the model's callers pass; anything else is not answered from memory.
+    const idKey = value => ((typeof value === 'string' || typeof value === 'number')
+        ? `${typeof value}:${Object.is(value, -0) ? '-0' : String(value)}` : null);
+    const entriesOf = slot => {
+        if (!slot.entries) slot.entries = real.ledgerEntries(schedule);
+        return slot.entries;
+    };
+    const wrap = {};
+    if (real.appendLedgerEntry) wrap.appendLedgerEntry = function (asked) {
+        const apart = reportSharedApart(asked, schedule);
+        if (!apart) moved += 1;
+        let landed = false;
+        try {
+            const out = real.appendLedgerEntry.apply(this, arguments);
+            landed = true;
+            return out;
+        } finally {
+            // Checked again after the call: still a copy of its own, and it did not throw.
+            if (apart && !(landed && reportSharedApart(asked, schedule))) moved += 1;
+        }
+    };
+    if (real.ledgerEntries) wrap.ledgerEntries = function (asked) {
+        if (asked !== schedule) return real.ledgerEntries.apply(this, arguments);
+        if (arguments.length !== 1 || !asPresent()) return real.ledgerEntries.apply(this, arguments);
+        return entriesOf(now()).slice();
+    };
+    if (real.foldLedger) wrap.foldLedger = function (asked) {
+        if (asked !== schedule) return real.foldLedger.apply(this, arguments);
+        if (arguments.length !== 1 || !asPresent()) return real.foldLedger.apply(this, arguments);
+        const slot = now();
+        if (!slot.fold) slot.fold = real.foldLedger(schedule);
+        return slot.fold;
+    };
+    // advanceHistory is ledgerEntries filtered to one advance, in the same order: the whole
+    // ledger grouped once, in that order. It needs ledgerEntries to group from - with that
+    // absent it is not wrapped, and asks for itself exactly as it would.
+    if (real.advanceHistory && real.ledgerEntries) wrap.advanceHistory = function (asked, advanceId) {
+        if (asked !== schedule) return real.advanceHistory.apply(this, arguments);
+        const one = arguments.length === 2 ? idKey(advanceId) : null;
+        if (one === null || !asPresent()) return real.advanceHistory.apply(this, arguments);
+        const slot = now();
+        if (!slot.history) {
+            const history = new Map();
+            entriesOf(slot).forEach(entry => {
+                const of = String(entry.advanceId);
+                if (!history.has(of)) history.set(of, []);
+                history.get(of).push(entry);
+            });
+            slot.history = history;
+        }
+        return (slot.history.get(String(advanceId)) || []).slice();
+    };
+    if (real.overpaidAdvances) wrap.overpaidAdvances = function (asked, workerId) {
+        if (asked !== schedule) return real.overpaidAdvances.apply(this, arguments);
+        const one = arguments.length === 2 ? idKey(workerId) : null;
+        if (one === null || !asPresent()) return real.overpaidAdvances.apply(this, arguments);
+        const slot = now();
+        if (!slot.overpaid.has(one)) slot.overpaid.set(one, real.overpaidAdvances(schedule, workerId));
+        const answer = slot.overpaid.get(one);
+        return Array.isArray(answer) ? answer.map(state => Object.assign({}, state)) : answer;
+    };
+    if (real.advanceOutstanding) wrap.advanceOutstanding = function (asked, advanceId) {
+        if (asked !== schedule) return real.advanceOutstanding.apply(this, arguments);
+        const one = arguments.length === 2 ? idKey(advanceId) : null;
+        if (one === null || !asPresent()) return real.advanceOutstanding.apply(this, arguments);
+        const slot = now();
+        if (!slot.outstanding.has(one)) slot.outstanding.set(one, real.advanceOutstanding(schedule, advanceId));
+        return Object.assign({}, slot.outstanding.get(one));
+    };
+    if (real.advanceWalk) wrap.advanceWalk = function (asked, workerId, from, to, carriedIn) {
+        if (asked !== schedule) return real.advanceWalk.apply(this, arguments);
+        const one = arguments.length === 5 && typeof from === 'string' && typeof to === 'string'
+            && typeof carriedIn === 'number' ? idKey(workerId) : null;
+        if (one === null || !asPresent()) return real.advanceWalk.apply(this, arguments);
+        const slot = now();
+        const walk = `${one}|${from}|${to}|${idKey(carriedIn)}`;
+        if (!slot.walks.has(walk)) slot.walks.set(walk, real.advanceWalk(schedule, workerId, from, to, carriedIn));
+        return Object.assign({}, slot.walks.get(walk));
+    };
+    if (real.advancePositionInto) wrap.advancePositionInto = function (asked, workerId, fromDate) {
+        if (asked !== schedule) return real.advancePositionInto.apply(this, arguments);
+        const one = arguments.length === 3 && typeof fromDate === 'string' ? idKey(workerId) : null;
+        if (one === null || !asPresent()) return real.advancePositionInto.apply(this, arguments);
+        const slot = now();
+        const at = `${one}|${fromDate}`;
+        if (!slot.positions.has(at)) slot.positions.set(at, real.advancePositionInto(schedule, workerId, fromDate));
+        return slot.positions.get(at);
+    };
+    const anything = () => Boolean(memo) && Boolean(memo.entries || memo.fold || memo.history
+        || memo.overpaid.size || memo.outstanding.size || memo.walks.size || memo.positions.size);
+    return {
+        install() { Object.keys(wrap).forEach(name => { page[name] = wrap[name]; }); },
+        uninstall() { Object.keys(wrap).forEach(name => { page[name] = real[name]; }); },
+        // S4: a kept range for this reading, as fresh rows - only once the memo was adopted
+        // and while the record is still the state it was adopted in.
+        keptSheet(range) {
+            if (!adopted || moved !== 0 || liveMap() !== adopted.held || liveLegacy() !== adopted.legacy
+                || !adopted.sheets.has(range)) return undefined;
+            return reportSharedRows(adopted.sheets.get(range));
+        },
+        sawSheet(range, rows) { if (!pristine.has(range)) pristine.set(range, reportSharedRows(rows)); },
+        // After everything is put back: kept only when a key was worked out, nothing could
+        // reach the record, something was asked, and the record still reads as it did.
+        finish() {
+            if (!keyed || key === null || moved !== 0 || !anything()) return;
+            // Adopted, and nothing worked out: handed back as it was handed, with no second copy
+            // of the record (see above). A sheet this reading priced before its first question
+            // is one the kept memo already holds, or it is new and the record is read again.
+            if (adopted && memo === adopted.memo && sizeOf(memo) === adopted.size
+                && Array.from(pristine.keys()).every(range => adopted.sheets.has(range))) {
+                REPORT_SHARED_KEPT = { schedule, key, found, memo, sheets: adopted.sheets };
+                return;
+            }
+            try {
+                if (reportSharedKey(schedule) !== key) return;
+                const sheets = new Map(adopted ? adopted.sheets : []);
+                pristine.forEach((rows, range) => { if (!sheets.has(range)) sheets.set(range, rows); });
+                REPORT_SHARED_KEPT = { schedule, key, found, memo, sheets };
+            } catch (error) { /* nothing kept */ }
+        }
+    };
+}
+
 function reportReadOnce(read, self, args) {
     if (reportReading()) return read.apply(self, args || []);
     const schedule = State.schedule;
     const outer = REPORT_ONCE;
+    // The readers this reading's answers depend on, taken before anything is swapped - by the
+    // OUTERMOST reading: a reading of another record opened inside one is handed the outer
+    // reading's wrappers, which give another record to the real functions untouched.
+    const found = outer && Array.isArray(outer.found) ? outer.found : reportSharedFound();
     const real = { gate: carryReportingEnabled, sheet: payrollReport, closed: closedPeriods };
     const model = typeof real.gate === 'function' && typeof real.sheet === 'function'
         && typeof real.closed === 'function';
     let gate;
+    let shared = null;
+    // While the gate's own question is being answered. On a record nobody approved it plans
+    // the migration, and the plan walks a man with a debt and no daily rate four thousand
+    // fortnights ahead: every one of those sheets is shared inside this reading, as v196
+    // shares a sheet, and NOT put aside for the next reading - kept, they held some 50 MB
+    // after one draw of «דוחות» on a season (the review of v206, measured), sheets of empty
+    // fortnights nobody will ever open. The walks the plan asks are kept (S1), so a plan asked
+    // again on the same record needs none of those sheets anyway.
+    let planning = 0;
     const sheets = new Map();
     const folds = new Map();
-    REPORT_ONCE = { schedule };
-    if (model) {
-        carryReportingEnabled = asked => {
-            if (asked !== schedule) return real.gate(asked);
-            if (gate === undefined) gate = reportGateAnswer(asked, real.gate);
-            return gate;
-        };
-        payrollReport = function (asked, from, to) {
-            if (asked !== schedule || arguments.length !== 3 || typeof from !== 'string' || typeof to !== 'string') {
-                return real.sheet.apply(this, arguments);
-            }
-            const key = `${from}..${to}`;
-            if (!sheets.has(key)) sheets.set(key, real.sheet(asked, from, to));
-            return sheets.get(key);
-        };
-        closedPeriods = function (asked, workerId) {
-            if (asked !== schedule || arguments.length !== 2) return real.closed.apply(this, arguments);
-            const key = String(workerId);
-            if (!folds.has(key)) folds.set(key, real.closed(asked, workerId));
-            return folds.get(key);
-        };
-    }
+    REPORT_ONCE = { schedule, found };
     try {
+        if (model) {
+            carryReportingEnabled = asked => {
+                if (asked !== schedule) return real.gate(asked);
+                if (gate === undefined) {
+                    planning += 1;
+                    try { gate = reportGateAnswer(asked, real.gate); } finally { planning -= 1; }
+                }
+                return gate;
+            };
+            payrollReport = function (asked, from, to) {
+                if (asked !== schedule || arguments.length !== 3 || typeof from !== 'string' || typeof to !== 'string') {
+                    return real.sheet.apply(this, arguments);
+                }
+                const key = `${from}..${to}`;
+                if (!sheets.has(key)) {
+                    const kept = shared ? shared.keptSheet(key) : undefined;
+                    if (kept !== undefined) sheets.set(key, kept);
+                    else {
+                        const rows = real.sheet(asked, from, to);
+                        if (shared && planning === 0) shared.sawSheet(key, rows);
+                        sheets.set(key, rows);
+                    }
+                }
+                return sheets.get(key);
+            };
+            closedPeriods = function (asked, workerId) {
+                if (asked !== schedule || arguments.length !== 2) return real.closed.apply(this, arguments);
+                const key = String(workerId);
+                if (!folds.has(key)) folds.set(key, real.closed(asked, workerId));
+                return folds.get(key);
+            };
+            shared = reportShareLedger(schedule, found);
+            shared.install();
+        }
         return read.apply(self, args || []);
     } finally {
+        if (shared) shared.uninstall();
         if (model) {
             carryReportingEnabled = real.gate;
             payrollReport = real.sheet;
             closedPeriods = real.closed;
         }
         REPORT_ONCE = outer;
+        if (shared) shared.finish();
     }
 }
 
@@ -402,7 +743,11 @@ function renderAdvances() {
         });
         if (!list.children.length) list.appendChild(emptyHint('לא נמצא עובד.'));
     };
-    search.addEventListener('input', () => { ADVANCE_SEARCH = search.value.trim(); paint(); });
+    // Each letter typed draws the list again, and every man on it is his advances read again:
+    // inside the pay sheet's one reading, as the page's own drawing is (v206), so a letter is
+    // answered from what the page already worked out - outside it, every advance of every man
+    // listed sorted the whole ledger again, most of a second a letter on a season nobody closed.
+    search.addEventListener('input', () => { ADVANCE_SEARCH = search.value.trim(); reportReadOnce(paint); });
     paint(); root.appendChild(list);
 }
 
@@ -2809,22 +3154,27 @@ function renderPeriodClosure(worker) {
     // ended in two ARABIC letters (LAM U+0644, FEH U+0641) - a broken word, on the one line
     // that says what a man still owes. tests/reportnames.test.mjs pins this sentence and
     // holds every file under js/ to words with no Arabic letter inside a Hebrew one.
-    const paint = () => {
+    // The preview at every figure typed, and the plan each button asks before it acts, are read
+    // inside the pay sheet's one reading - as this box's own drawing is (v206): outside it,
+    // every digit walked his account again from his first advance. The plan is the same plan;
+    // the reading only answers again what it already worked out on this same record. (The
+    // close itself is planned once more, bare, the moment it is confirmed: closeAccountFor.)
+    const paint = () => reportReadOnce(() => {
         const next = chosenPlan();
         preview.textContent = Number.isFinite(readChoice()) && next.canClose
             ? `לתשלום לעובד: ${moneyText(next.gross - next.deducted)} ₪ · יישאר חוב פתוח: ${moneyText(next.carriedForward)} ₪`
             : `שכר התקופה: ${moneyText(plan.gross)} ₪ · ניתן לקזז עד ${moneyText(plan.deducted)} ₪. בחר את הסכום בעצמך.`;
-    };
+    });
     amount.addEventListener('input', paint); paint();
     box.appendChild(preview); box.appendChild(error);
-    const selected = () => {
+    const selected = () => reportReadOnce(() => {
         const next = chosenPlan();
         if (!Number.isFinite(readChoice()) || !next.canClose) {
             error.textContent = 'הכנס סכום תקין בין 0 לבין היתרה שניתן לקזז. אם הנתונים השתנו, פתח את החשבון מחדש.';
             return null;
         }
         return next;
-    };
+    });
     const actions = el('div', 'finance-actions');
     actions.appendChild(button('הצג בדוח', 'btn-secondary', () => {
         const next = selected(); if (!next) return;
```

</details>
