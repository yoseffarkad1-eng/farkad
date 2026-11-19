# Handoff — «דוחות ומקדמות מהירים» (track `speed`, for v206)

- Branch: `feat-speed`, worktree `/home/user/farkad/.claude/worktrees/feat-speed`
- Code-final commit: `22830d3`. Nothing under `js/` moved after `77e63e2`; the commits after it touch test files only.
  The `npm test` chain and the season suite ran on `247bcfa`; `6caaba1` changed one printout line of
  `tests/speed.test.mjs` and `22830d3` two faults of `tests/speed.browser.mjs`, so the suites that read those files
  ran again on `6caaba1` and `22830d3` (speed.test, isolation, build, nonassertions, gate-integrity); the browser
  suites ran on `22830d3`, except design and smoke, on `9404c76` (a tree whose served files are the same). Said per
  suite.
- This report is committed on top of it as the branch's last commit (its SHA is the one handed back to
  the workflow); it adds `features/speed/handoff.md` and nothing else.
- Base (contract): `6ab193d68c960e4a56d947673c282b867acd258f` (origin/main, v204).
- Contract: `features/speed/contract.md`, Revision 2 (prototype D), copied byte for byte from the program's
  scratchpad (SHA-256 `b8644419…f68f7`); re-read from disk before this report: unchanged.
- Build stamps: NOT moved (v204 in all three), on purpose - the integrator moves them. Hence the
  expected red named below.

## The results, in one place

| gate | where | result |
|---|---|---|
| `npm test`, one script at a time (109 scripts) | `247bcfa`, clean detached worktree | **107 green, 2 red - the two expected reds** (`test:build` 68/69, `test:gate-integrity` 19/20: the stamps, the integrator's); 12,979 / 12,981 checks |
| the scripts reading the test files changed since | speed on `6caaba1`; isolation, build, nonassertions, gate-integrity on `6caaba1` and again on `22830d3` | speed 90/90, isolation 18/18, nonassertions 23/23; build 68/69 and gate-integrity 19/20 (the same two reds) |
| `tests/speed.test.mjs` (in `npm test`) | `6caaba1` | 90/90, 317 s; as a timed pair on `247bcfa`: 320 s, then reports.speed right after it 162 s (159/159) |
| `tests/speed.season.test.mjs` (in `test:all`) | `247bcfa` | 94/94, 22.6 minutes |
| `tests/speed.browser.mjs` (in `test:all`) | `22830d3`, through `bt` | 32/32, 8.7 minutes in the slot |
| every other suite of `test:all`, one at a time through `bt` (60) | `22830d3`; design and smoke on `9404c76` | 60 / 60 green; 20,220 checks |
| `npm run test:all` as one command, `test:release`, the emulator suites | - | NOT run (the task's rule) |
| six mutants of `js/ui/reports.js` against `tests/speed.test.mjs` | scratch worktree at `247bcfa` | 6 / 6 caught |

Every output byte is v204's on every way in compared - 8,464 readings on the seeded records and fixtures and 3,844
on the medium season, cold, again and the list again; after 26 kinds of write; 369 ways in on season-closed, 66 on
season-open, 9 on season-skipped; the DOM of eight surfaces and the shared picture in Chromium. «דוחות» after a
write in Chromium at 4x: 2,950 ms where v204 takes 33,516 in one task; redrawn unmoved, 199-504 ms.

## Files changed (`git diff --stat 6ab193d..22830d3`)

```
 features/speed/contract.md    | 969 ++++++++++++++++++++++++++++++++++++++++++
 js/ui/advancereset.js         |   2 +-
 js/ui/owes.js                 |   5 +-
 js/ui/reports.js              | 348 ++++++++++++++-
 package.json                  |   7 +-
 tests/README.md               |   5 +
 tests/gate.integrity.test.mjs |   5 +-
 tests/owes.test.mjs           |   5 +
 tests/speed.browser.mjs       | 353 +++++++++++++++
 tests/speed.season.test.mjs   | 363 ++++++++++++++++
 tests/speed.seed.mjs          | 804 +++++++++++++++++++++++++++++++++++
 tests/speed.test.mjs          | 701 ++++++++++++++++++++++++++++++
 12 files changed, 3540 insertions(+), 27 deletions(-)
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

Commits, oldest first: `d530a32` the contract; `f9bc05b` S1; `90a3482` S2; `0753250` S3 + the owes.test set-up;
`77e63e2` S4; `6a15dfc` the suites; `a349c31` the medium season's v204 side moved to the season suite;
`9404c76` the later-track row taken out and counted; `247bcfa` the season-open «סגירות שנרשמו» unmoved cell;
`6caaba1` criterion 8's printout names every counted function; `22830d3` the browser suite's two faults (the kept
page's CDP session, the afresh draws' gate); then this report.

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

## The suites, run on the code-final commit

### `npm test`, IN FULL, one script at a time (the chain itself stops at the first red), on a clean detached worktree at `247bcfa`

Run 20:11-20:41 UTC, 2026-11-19, with the season suite and other tracks' suites running beside it (load 4-7). 109 scripts: **107 green, 2 red - the two expected reds and nothing else**; 12,979 of 12,981 checks. Every script's exit code, time and count, as `chain.sh` wrote them:

<details><summary>109 lines</summary>

```
test:isolation	exit 0	1s	18/18 checks passed
test:blobs	exit 0	1s	11/11 checks passed
test:build	exit 1	2s	68/69 checks passed
test:poison	exit 0	0s	37/37 checks passed
test:merge	exit 0	1s	28/28 checks passed
test:contested	exit 0	16s	73/73 checks passed
test:held	exit 0	3s	83/83 checks passed
test:snapshot-stale	exit 0	2s	16/16 checks passed
test:reports-rules	exit 0	3s	26/26 checks passed
test:finance	exit 0	7s	57/57 checks passed
test:weekly-range	exit 0	0s	21/21 checks passed
test:finance-wording	exit 0	2s	12/12 checks passed
test:weekly-unpriced	exit 0	0s	23/23 checks passed
test:receipt	exit 0	2s	28/28 checks passed
test:data	exit 0	45s	1970/1970 checks passed
test:recovery	exit 0	1s	82/82 checks passed
test:adversarial	exit 0	6s	116/116 checks passed
test:probes	exit 0	7s	35/35 checks passed
test:capacity	exit 0	12s	48/48 checks passed
test:concurrency	exit 0	3s	46/46 checks passed
test:exports	exit 0	1s	112/112 checks passed
test:fence	exit 0	3s	35/35 checks passed
test:fence-ingress	exit 0	1s	43/43 checks passed
test:fence-legacy	exit 0	0s	21/21 checks passed
test:money-history	exit 0	0s	9/9 checks passed
test:money-units	exit 0	1s	21/21 checks passed
test:money-cloud	exit 0	1s	17/17 checks passed
test:money-display	exit 0	0s	4/4 checks passed
test:snapshot-poison	exit 0	3s	82/82 checks passed
test:samefact	exit 0	5s	37/37 checks passed
test:wording	exit 0	1s	37/37 checks passed
test:closure	exit 0	20s	122/122 checks passed
test:closure-echo	exit 0	1s	79/79 checks passed
test:correction	exit 0	0s	33/33 checks passed
test:quarantine	exit 0	2s	82/82 checks passed
test:approval	exit 0	8s	72/72 checks passed
test:repayment	exit 0	5s	240/240 checks passed
test:ledger-ingress	exit 0	0s	167/167 checks passed
test:cas	exit 0	13s	88/88 checks passed
test:status	exit 0	6s	37/37 checks passed
test:money	exit 0	2s	40/40 checks passed
test:money-ingress	exit 0	10s	206/206 checks passed
test:method	exit 0	3s	51/51 checks passed
test:restore	exit 0	0s	51/51 checks passed
test:upgrade	exit 0	2s	48/48 checks passed
test:vehicles	exit 0	2s	86/86 checks passed
test:xlsx	exit 0	2s	104/104 checks passed
test:nonassertions	exit 0	1s	23/23 checks passed
test:labels	exit 0	0s	23/23 checks passed
test:labelcache	exit 0	0s	32/32 checks passed
test:restore-ledger	exit 0	2s	26/26 checks passed
test:roster-upgrade	exit 0	7s	55/55 checks passed
test:roster-race	exit 0	6s	63/63 checks passed
test:exports-proof	exit 0	2s	92/92 checks passed
test:ledger-truth	exit 0	5s	148/148 checks passed
test:races	exit 0	5s	109/109 checks passed
test:overlap-restore	exit 0	21s	117/117 checks passed
test:refute-roster	exit 0	9s	24/24 checks passed
test:refute-restore	exit 0	43s	25/25 checks passed
test:gate-integrity	exit 1	0s	19/20 checks passed
test:queuecost	exit 0	6s	18/18 checks passed
test:paycycle	exit 0	0s	43/43 checks passed
test:paycycle-blockers	exit 0	2s	17/17 checks passed
test:paycycle-completion	exit 0	6s	31/31 checks passed
test:crew-controls	exit 0	1s	46/46 checks passed
test:simple-advances	exit 0	1s	66/66 checks passed
test:worker-deletion	exit 0	10s	86/86 checks passed
test:calendar	exit 0	1s	58/58 checks passed
test:reminders	exit 0	0s	48/48 checks passed
test:move-late	exit 0	5s	48/48 checks passed
test:codex-probes	exit 0	1s	17/17 checks passed
test:codex2-probes	exit 0	1s	36/36 checks passed
test:codex3-probes	exit 0	3s	59/59 checks passed
test:rima	exit 0	92s	496/496 checks passed
test:yosefgeves	exit 0	93s	562/562 checks passed
test:seder	exit 0	1s	135/135 checks passed
test:bars-stale	exit 0	0s	60/60 checks passed
test:transport	exit 0	1s	566/566 checks passed
test:transport-share	exit 0	12s	304/304 checks passed
test:oracle	exit 0	48s	121/121 checks passed
test:overpayment	exit 0	7s	105/105 checks passed
test:polish	exit 0	0s	73/73 checks passed
test:daycheck	exit 0	7s	169/169 checks passed
test:journey	exit 0	1s	233/233 checks passed
test:workercard	exit 0	27s	180/180 checks passed
test:monthsummary	exit 0	82s	98/98 checks passed
test:payslips	exit 0	27s	202/202 checks passed
test:find	exit 0	0s	91/91 checks passed
test:whatsnew	exit 0	1s	160/160 checks passed
test:account-view	exit 0	22s	456/456 checks passed
test:usual	exit 0	2s	150/150 checks passed
test:sitecard	exit 0	3s	119/119 checks passed
test:reportsclarity	exit 0	3s	1119/1119 checks passed
test:largetext	exit 0	1s	107/107 checks passed
test:reportnames	exit 0	11s	36/36 checks passed
test:holiday	exit 0	0s	109/109 checks passed
test:undo-stale	exit 0	2s	32/32 checks passed
test:auditfix	exit 0	2s	34/34 checks passed
test:owes	exit 0	80s	190/190 checks passed
test:weeklyclose	exit 0	137s	146/146 checks passed
test:reports-speed	exit 0	225s	159/159 checks passed
test:closeorder	exit 0	0s	22/22 checks passed
test:closuresize	exit 0	13s	13/13 checks passed
test:closerace	exit 0	39s	29/29 checks passed
test:advancereset	exit 0	56s	77/77 checks passed
test:overpaidfix	exit 0	1s	85/85 checks passed
test:xlsxlook	exit 0	13s	293/293 checks passed
test:closereminder	exit 0	13s	107/107 checks passed
test:speed	exit 0	353s	90/90 checks passed
```

</details>

The two reds, verbatim:

```
**FAIL**  and nothing in the shell has changed since  — 3 changed since 6ab193d6: js/ui/advancereset.js, js/ui/owes.js, js/ui/reports.js
**FAIL**  no cached file has changed since the three stamps last moved  — 77e63e22 reports.js: each range's pay sheet kept with the walks, as r | 07532505 reports.js: the walks kept between readings of a record that | 90a34820 owes.js, advancereset.js: the board read after paint, and af | f9bc05b8 reports.js: the ledger's folds and each man's walk, once per
```

### The suites that read `tests/speed.test.mjs`, again on `6caaba1` (the clean tree moved to it)

```
test:isolation	exit 0	0s	18/18 checks passed	(load 2.81 4.34 5.19)
test:build	exit 1	1s	68/69 checks passed	(load 2.91 4.34 5.18)
test:nonassertions	exit 0	1s	23/23 checks passed	(load 2.91 4.34 5.18)
test:gate-integrity	exit 1	0s	19/20 checks passed	(load 2.91 4.34 5.18)
test:speed	exit 0	317s	90/90 checks passed	(load 2.42 3.31 4.49)
```

(`test:build` and `test:gate-integrity`: the same two expected reds, verbatim as above.)

And on `22830d3` (the clean tree moved again; `tests/speed.browser.mjs` is the only file changed):

```
test:isolation	exit 0	0s	18/18 checks passed
test:build	exit 1	1s	68/69 checks passed
test:nonassertions	exit 0	0s	23/23 checks passed
test:gate-integrity	exit 1	1s	19/20 checks passed
```

(The same two expected reds again.)

### `tests/speed.test.mjs` on `6caaba1` (90/90, 317 s)

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
  PASS  10 records x 3 readings, 8464 readings of a screen (each way in cold, again, and the list again): every one v204's bytes
        ({"the gates shut: read the old way":10,"the gates open: read the new way":10,"the gates open, nobody approved: read the old way":9,"the gates open, nobody approved: read the new way":1})
  PASS  every way in ended as v204's did, and none of v204's threw
  PASS  5. after every way in, every reader is the one it was and no reading is left open
  PASS  10. not one write at any door during any of them: commit, commitMany, commitRoster, save, persist, an append to the record, Store.set/setVerified/remove
  PASS  10. and the whole disk byte for byte across all of them
  PASS  S3: a memo was kept at the end of 30 of 30 sequences (it is used, criterion 4)  — 30
        (the medium season, both records, against v204: tests/speed.season.test.mjs)
  PASS  the rows later tracks add to «מקדמות», taken out and counted: 0 on 196 boards drawn
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
  PASS  32 ways in on the medium season, each read cold: every rule of the count
        v204 -> this build: the default account: «דוחות» ← «לפי עובד»: ledgerEntries 2506 -> 1, foldLedger 1497 -> 1, advanceHistory 1008 -> 0, overpaidAdvances 474 -> 15, advanceOutstanding 1008 -> 30, advanceWalk 459 -> 278, advancePositionInto 30 -> 30, payrollReport 39 -> 39, keys 2
        v204 -> this build: the default account: «דוחות» ← «לפי אתר»: ledgerEntries 1390 -> 1, foldLedger 834 -> 1, advanceHistory 556 -> 0, overpaidAdvances 278 -> 15, advanceOutstanding 556 -> 30, advanceWalk 278 -> 278, advancePositionInto 15 -> 15, payrollReport 39 -> 39, keys 2
        v204 -> this build: the default account: the pay rows: ledgerEntries 1390 -> 1, foldLedger 834 -> 1, advanceHistory 556 -> 0, overpaidAdvances 278 -> 15, advanceOutstanding 556 -> 30, advanceWalk 278 -> 278, advancePositionInto 15 -> 15, payrollReport 38 -> 38, keys 2
        v204 -> this build: the default account: the workbook: ledgerEntries 4170 -> 1, foldLedger 2502 -> 1, advanceHistory 1668 -> 0, overpaidAdvances 834 -> 15, advanceOutstanding 1668 -> 30, advanceWalk 834 -> 278, advancePositionInto 45 -> 15, payrollReport 39 -> 39, keys 2
        v204 -> this build: the default account: w_1: his statement: ledgerEntries 125 -> 1, foldLedger 75 -> 1, advanceHistory 50 -> 0, overpaidAdvances 25 -> 1, advanceOutstanding 50 -> 2, advanceWalk 25 -> 25, advancePositionInto 1 -> 1, payrollReport 25 -> 25, keys 2
        v204 -> this build: the default account: w_1: his days: ledgerEntries 255 -> 1, foldLedger 152 -> 1, advanceHistory 102 -> 0, overpaidAdvances 50 -> 1, advanceOutstanding 100 -> 2, advanceWalk 50 -> 25, advancePositionInto 0 -> 0, payrollReport 25 -> 25, keys 2
        v204 -> this build: the default account: w_1: his closing box: ledgerEntries 252 -> 1, foldLedger 152 -> 1, advanceHistory 100 -> 0, overpaidAdvances 50 -> 1, advanceOutstanding 100 -> 2, advanceWalk 50 -> 25, advancePositionInto 0 -> 0, payrollReport 25 -> 25, keys 2
        v204 -> this build: the default account: w_2: his statement: ledgerEntries 65 -> 1, foldLedger 39 -> 1, advanceHistory 26 -> 0, overpaidAdvances 13 -> 1, advanceOutstanding 26 -> 2, advanceWalk 13 -> 13, advancePositionInto 1 -> 1, payrollReport 13 -> 13, keys 2
        v204 -> this build: the default account: w_2: his days: ledgerEntries 135 -> 1, foldLedger 80 -> 1, advanceHistory 54 -> 0, overpaidAdvances 26 -> 1, advanceOutstanding 52 -> 2, advanceWalk 26 -> 13, advancePositionInto 0 -> 0, payrollReport 13 -> 13, keys 2
        v204 -> this build: the default account: w_2: his closing box: ledgerEntries 132 -> 1, foldLedger 80 -> 1, advanceHistory 52 -> 0, overpaidAdvances 26 -> 1, advanceOutstanding 52 -> 2, advanceWalk 26 -> 13, advancePositionInto 0 -> 0, payrollReport 13 -> 13, keys 2
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
  PASS  32 ways in, each twice on the unmoved record: the second asks the model nothing it already answered
        (pay sheets worked out by the second reading, all before its first question: «דוחות» ← «לפי עובד» 1, «דוחות» ← «לפי אתר» 1, the pay rows 1, the workbook 1, his statement 0, his days 0, his closing box 0, his statement 0, his days 0, his closing box 0, «מקדמות» 0, «סגירות שנרשמו» 0, owesRead 0, owesReadNow 0, «סגירת שבוע»'s list 1, the reminder's count 1, the payslips, this period 1, the payslips, the period before 1, the month 2, the month before 2, «איפוס מקדמות»'s reading 0, his page of «מקדמות» 0, his card 1, his page of «מקדמות» 0, his card 2, a close's page 2026-07-23T15:00:00.000Z|d_office 0, a close's page 2026-07-09T15:00:00.000Z|d_office 0, a close's page 2026-07-02T15:00:00.000Z|d_office 0, a close's page 2026-06-25T15:00:00.000Z|d_office 0, a close's page 2026-06-18T15:00:00.000Z|d_office 0, a close's page 2026-06-11T15:00:00.000Z|d_office 0, a close's page 2026-06-04T15:00:00.000Z|d_office 0)

3. after every kind of write, every way in is the record's: the same as afresh
  PASS  every way in, after each of 26 kinds of write: as the same way drawn afresh
        (the seven, called by the first reading after each: before anything 355, nothing changed 0, a day typed 355, an absence 355, the two counts 355, an advance 356, a repayment 356, a reversal 356, a close 356, «סגירת שבוע»'s pass 354, «איפוס מקדמות» 353, a rate and a cycle 353, a man archived 353, the approval removed in memory 215, the approval put back 353, a change in memory 353, the change taken back 353, a snapshot adopted 353, a day placed with ↶ ready 353, ↶ 353, the day turned 362, and back 353, the sends settled 0, a write that moves the tick and not the record 0, a new schedule object with the same text 341, a refused commit rolled back 341)
        (the same scenario against v204's files: tests/speed.season.test.mjs - the medium season's v204 side)

5. through every throw, every reader is put back, no reading is left open and nothing is kept from a failed key
  PASS  a reader that throws inside the reading: every way in ends as v204's does (the same bytes, or the same throw), and leaves the page clean
  PASS  todayStr that throws: every way in ends as v204's does (the same bytes, or the same throw), and leaves the page clean
  PASS  the kept key that throws at the first question: every way in ends as v204's does (the same bytes, or the same throw), and leaves the page clean
  PASS  the kept key that throws at the close: every way in ends as v204's does (the same bytes, or the same throw), and leaves the page clean

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

20. every row of every pay sheet is flat - what S4's shallow copy relies on
  PASS  85815 pay sheets, 394352 rows: every field a string, a number, a boolean, null or undefined
  PASS  and there were sheets to read  — 85815 / 394352

21. one memo at a time, dropped at the first question of a reading it cannot serve
  PASS  another schedule object (State.load): the kept memo is off the shelf by the end of the first question
  PASS  and the memo kept after it is the new object's
  PASS  another key (the record moved in memory): dropped at the first question
  PASS  and the memo after it is of the record as it now reads
  PASS  other readers (closedPeriods replaced): dropped at the first question
  PASS  the same schedule, key and readers: adopted (off the shelf while the reading has it)
  PASS  and put back at its close
  PASS  a reading that asks none of the seven («סיכום חודש») neither drops nor replaces it

end

        (tests/speed.test.mjs ran 5.3 minutes on this machine; by section: the seeding 0 s, 11. the source 26 s, 1. every way in is v204's bytes 24 s, 1. «איפוס מקדמות»'s step 3 6 s, 2. the gate's own plan, asked inside a reading, is the bare plan 1 s, 8. the counts, for every way in 3 s, 4. a way in repeated on an unmoved record 1 s, 3. after every kind of write, every way in is the record's 243 s, 5. through every throw, every reader is put back, no reading is left open and nothing is kept from a failed key 6 s, 6. inside a reading, another schedule is asked of the real functions, every time 0 s, 7. a reader that is absent stays absent 4 s, 9. appends inside a reading 0 s, 12. the gate 1 s, 19. a kept pay sheet is handed to a reading as rows of its own 0 s, 20. every row of every pay sheet is flat 0 s, 21. one memo at a time, dropped at the first question of a reading it cannot serve 0 s)

90/90 checks passed
```

</details>

### `tests/speed.season.test.mjs` on `247bcfa` (94/94, 22.6 minutes, load 5.9)

<details><summary>its output, whole</summary>

```

1. the medium season: every way in is v204's bytes - cold, again, and the whole list again
  PASS  both medium records x 3 readings, 3844 readings of a screen: every one v204's bytes
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
        (the seven, called by the first reading after each: before anything 355, nothing changed 0, a day typed 355, an absence 355, the two counts 355, an advance 356, a repayment 356, a reversal 356, a close 356, «סגירת שבוע»'s pass 354, «איפוס מקדמות» 353, a rate and a cycle 353, a man archived 353, the approval removed in memory 215, the approval put back 353, a change in memory 353, the change taken back 353, a snapshot adopted 353, a day placed with ↶ ready 353, ↶ 353, the day turned 362, and back 353, the sends settled 0, a write that moves the tick and not the record 0, a new schedule object with the same text 341, a refused commit rolled back 341; load 6.4 6.2 5.5)

the three seasons, written by the app's own writers
        season-open: {"kind":"open","men":40,"days":300,"from":"2025-12-05","to":"2026-11-19","closes":0,"repaid":8,"skippers":[],"advances":688,"ledger":696,"kib":954} - seeded in 19.8 s (load 6.3 6.2 5.5)
        season-closed: {"kind":"closed","men":40,"days":300,"from":"2025-12-05","to":"2026-11-19","closes":225,"repaid":5,"skippers":[],"advances":141,"ledger":530,"kib":1074} - seeded in 42.9 s (load 5.5 6.0 5.5)
        season-skipped: {"kind":"skipped","men":40,"days":300,"from":"2025-12-05","to":"2026-11-19","closes":214,"repaid":4,"skippers":["w_01","w_04","w_07","w_10","w_13","w_16"],"advances":136,"ledger":510,"kib":1066} - seeded in 34.4 s (load 4.6 5.8 5.5)
  PASS  season-open: 688 advances, 696 ledger entries, 954 KiB, nothing closed
  PASS  season-closed: 225 closes, 530 ledger entries, 1074 KiB
  PASS  season-skipped: 6 weekly men who missed the week before their last finished one

2. season-closed: every way in is v204's bytes, cold and again
        (season-closed: 369 ways in - v204 46.8 s, this build cold 20.0 s; load 5.0 5.5 5.4)
  PASS  369 ways in on season-closed
        (season-closed, nobody approved: 2 ways in - v204 54.1 s, this build cold 6.1 s; load 5.2 5.5 5.4)
  PASS  season-closed, nobody approved: «דוחות», both sections
        (season-closed, both gates shut: 2 ways in - v204 0.1 s, this build cold 0.1 s; load 5.1 5.4 5.4)
  PASS  season-closed, both gates shut: «דוחות», both sections
  PASS  the gate's own plan, asked inside a reading, is the bare plan, JSON for JSON

2. season-open: «דוחות», every statement, four men's cards, days and closing boxes, the pages of «מקדמות» - v204's bytes
        (season-open: 66 ways in - v204 117.8 s, this build cold 19.9 s; load 6.1 5.8 5.5)
  PASS  66 ways in on season-open
  PASS  the workbook and the payslips of both periods: cold (nothing kept) and warm, the same bytes

2, 4, 9. season-skipped: the men whose empty week is closed first on a copy
        (season-skipped: 9 ways in - v204 2.9 s, this build cold 1.8 s; load 6.2 5.8 5.5)
  PASS  9 ways in on season-skipped, each cold and then again: v204's bytes
  PASS  «סגירת שבוע»'s list, again on the unmoved record: the record's seven asked 0 times
  PASS  and the copies' own walks are planned again, as they must be: 184  — 184
  PASS  the reminder's count, again on the unmoved record: the record's seven asked 0 times
  PASS  and the copies' own walks are planned again, as they must be: 184  — 184
  PASS  one «סגירת שבוע» reading on season-skipped: the record's ledger folded once
  PASS  it appended to copies (6) and was kept all the same

8. season-open, every way in read cold: each reader once per question, the key twice at most
  PASS  35 ways in on season-open
        one draw of «לפי עובד» on season-closed, v204 -> this build: ledgerEntries 3343 -> 1, foldLedger 1865 -> 1, advanceHistory 1477 -> 0, overpaidAdvances 348 -> 40, advanceOutstanding 1477 -> 141, advanceWalk 324 -> 277, advancePositionInto 48 -> 48, payrollReport 18 -> 18
  PASS  v204 listed the ledger 3343 times for it, this build 1: at least 50x  — 3343 / 1

13. the clocks: this build against v204 in the same process, interleaved, medians of three
        (load at the start of the clocks: 5.7 5.7 5.5)
  PASS  season-open, «דוחות» (one draw builds both sections), after a change: 1204 ms (v204 not timed: minutes) - <= 5000 ms
  PASS  season-open, «דוחות» (one draw builds both sections), unmoved: 99 ms (v204 not timed) - <= 800 ms
  PASS  season-closed, «דוחות» (one draw builds both sections), after a change: 237 ms (v204 1638 ms) - <= 0.25 of v204's
  PASS  season-open, the workbook, after a change: 1096 ms (v204 not timed: minutes) - <= 5000 ms
  PASS  season-open, the workbook, unmoved: 38 ms (v204 not timed) - <= 800 ms
  PASS  season-closed, the workbook, after a change: 174 ms (v204 3663 ms) - <= 0.17 of v204's
  PASS  season-open, «תלוש לכל עובד», this period, after a change: 1100 ms (v204 not timed: minutes) - <= 5000 ms
  PASS  season-open, «תלוש לכל עובד», this period, unmoved: 68 ms (v204 not timed) - <= 800 ms
  PASS  season-closed, «תלוש לכל עובד», this period, after a change: 218 ms (v204 2387 ms) - <= 0.17 of v204's
  PASS  season-open, «תלוש לכל עובד», the period before, after a change: 1307 ms (v204 not timed: minutes) - <= 5000 ms
  PASS  season-open, «תלוש לכל עובד», the period before, unmoved: 87 ms (v204 not timed) - <= 800 ms
  PASS  season-closed, «תלוש לכל עובד», the period before, after a change: 326 ms (v204 2299 ms) - <= 0.17 of v204's
  PASS  season-open, the closing box, a weekly man, after a change: 350 ms (v204 3773 ms) - <= 0.35 of v204's
  PASS  season-open, the closing box, a weekly man, unmoved: 93 ms (v204 2965 ms) - <= 0.25 of v204's
  PASS  season-closed, the closing box, a weekly man, after a change: 92 ms (v204 152 ms) - <= 1.25x + 30 ms of v204's
  PASS  season-open, the closing box, a fortnightly man, after a change: 210 ms (v204 765 ms) - <= 0.6 of v204's
  PASS  season-open, the closing box, a fortnightly man, unmoved: 41 ms (v204 919 ms) - <= 0.25 of v204's
  PASS  season-closed, the closing box, a fortnightly man, after a change: 94 ms (v204 140 ms) - <= 1.25x + 30 ms of v204's
  PASS  season-open, a man's days, after a change: 396 ms (v204 3149 ms) - <= 0.35 of v204's
  PASS  season-open, a man's days, unmoved: 102 ms (v204 3364 ms) - <= 0.25 of v204's
  PASS  season-closed, a man's days, after a change: 88 ms (v204 247 ms) - <= 1.25x + 30 ms of v204's
  PASS  season-open, his statement, after a change: 439 ms (v204 1748 ms) - <= 0.5 of v204's
  PASS  season-open, his statement, unmoved: 20 ms (v204 1899 ms) - <= 0.5 of v204's
  PASS  season-closed, his statement, after a change: 84 ms (v204 105 ms) - <= 1.25x + 30 ms of v204's
  PASS  season-open, «מקדמות», after a change: 877 ms (v204 6514 ms) - <= 0.35 of v204's
  PASS  season-open, «מקדמות», unmoved: 41 ms (v204 1292 ms) - <= 0.25 of v204's
  PASS  season-closed, «מקדמות», after a change: 204 ms (v204 902 ms) - <= 0.5 of v204's
  PASS  season-open, a man's page of «מקדמות», after a change: 19 ms (v204 136 ms) - <= 0.6 + 20 ms of v204's
  PASS  season-open, a man's page of «מקדמות», unmoved: 32 ms (v204 142 ms) - <= 0.6 + 20 ms of v204's
  PASS  season-closed, a man's page of «מקדמות», after a change: 25 ms (v204 35 ms) - <= 1.25x + 30 ms of v204's
  PASS  season-open, «סגירות שנרשמו», after a change: 828 ms (v204 5247 ms) - <= 0.35 of v204's
  PASS  season-open, «סגירות שנרשמו», unmoved: 19 ms (v204 12 ms) - <= 1.25x + 30 ms of v204's
  PASS  season-closed, «סגירות שנרשמו», after a change: 261 ms (v204 1195 ms) - <= 0.5 of v204's
  PASS  season-open, owesReadNow («שים לב»), after a change: 572 ms (v204 5086 ms) - <= 0.35 of v204's
  PASS  season-open, owesReadNow («שים לב»), unmoved: 147 ms (v204 5119 ms) - <= 0.25 of v204's
  PASS  season-closed, owesReadNow («שים לב»), after a change: 188 ms (v204 748 ms) - <= 0.5 of v204's
  PASS  season-open, «סגירת שבוע»'s list, after a change: 1166 ms (v204 2473 ms) - <= 0.75 of v204's
  PASS  season-open, «סגירת שבוע»'s list, unmoved: 140 ms (v204 2348 ms) - <= 0.25 of v204's
  PASS  season-closed, «סגירת שבוע»'s list, after a change: 326 ms (v204 365 ms) - <= 1.25x + 30 ms of v204's
  PASS  season-open, the reminder's count, after a change: 1387 ms (v204 2934 ms) - <= 0.75 of v204's
  PASS  season-open, the reminder's count, unmoved: 182 ms (v204 2662 ms) - <= 0.25 of v204's
  PASS  season-closed, the reminder's count, after a change: 276 ms (v204 378 ms) - <= 1.25x + 30 ms of v204's
  PASS  season-open, «איפוס מקדמות»'s reading, after a change: 1304 ms (v204 2799 ms) - <= 0.75 of v204's
  PASS  season-open, «איפוס מקדמות»'s reading, unmoved: 250 ms (v204 2588 ms) - <= 0.25 of v204's
  PASS  season-closed, «איפוס מקדמות»'s reading, after a change: 155 ms (v204 150 ms) - <= 1.25x + 30 ms of v204's
  PASS  season-open, «איפוס מקדמות»'s step 3 (the board after the write), after a change: 649 ms (v204 4541 ms) - <= 0.35 of v204's
  PASS  season-open, «איפוס מקדמות»'s step 3 (the board after the write), unmoved: 124 ms (v204 4724 ms) - <= 0.25 of v204's
  PASS  season-closed, «איפוס מקדמות»'s step 3 (the board after the write), after a change: 123 ms (v204 647 ms) - <= 1.25x + 30 ms of v204's
  PASS  season-open, «כרטיס עובד», a weekly man, after a change: 378 ms (v204 3232 ms) - <= 0.35 of v204's
  PASS  season-open, «כרטיס עובד», a weekly man, unmoved: 32 ms (v204 3203 ms) - <= 0.25 of v204's
  PASS  season-closed, «כרטיס עובד», a weekly man, after a change: 61 ms (v204 154 ms) - <= 1.25x + 30 ms of v204's
  PASS  season-open, «כרטיס עובד», a fortnightly man, after a change: 216 ms (v204 1478 ms) - <= 0.35 of v204's
  PASS  season-open, «כרטיס עובד», a fortnightly man, unmoved: 40 ms (v204 1538 ms) - <= 0.25 of v204's
  PASS  season-closed, «כרטיס עובד», a fortnightly man, after a change: 73 ms (v204 96 ms) - <= 1.25x + 30 ms of v204's
  PASS  season-open, «סיכום חודש», after a change: 54 ms (v204 48 ms) - <= 1.25x + 20 ms of v204's
  PASS  season-open, «סיכום חודש», unmoved: 61 ms (v204 59 ms) - <= 1.25x + 20 ms of v204's
  PASS  season-closed, «סיכום חודש», after a change: 64 ms (v204 74 ms) - <= 1.25x + 20 ms of v204's
  PASS  season-skipped, «סגירת שבוע»'s list, after a change: 841 ms (v204 711 ms) - <= 1.25x + 30 ms
  PASS  season-skipped, «סגירת שבוע»'s list, unmoved: 710 ms (v204 970 ms) - <= 1.25x + 30 ms
  PASS  season-skipped, the reminder's count, after a change: 722 ms (v204 722 ms) - <= 1.25x + 30 ms
  PASS  season-skipped, the reminder's count, unmoved: 657 ms (v204 793 ms) - <= 1.25x + 30 ms
  PASS  season-closed, both gates shut, «דוחות»: 205 ms (v204 340 ms) - <= 1.25x + 30 ms
  PASS  season-closed, nobody approved, «דוחות»: 6691 ms (v204 61413 ms) - <= 0.4 of v204's
  PASS  the kept key on season-open's record (977262 characters): 7 ms - <= 30 ms
        this build / v204, ms: «דוחות» (one draw builds both sections): open 1204/-, unmoved 99/-, closed 237/1638
        this build / v204, ms: the workbook: open 1096/-, unmoved 38/-, closed 174/3663
        this build / v204, ms: «תלוש לכל עובד», this period: open 1100/-, unmoved 68/-, closed 218/2387
        this build / v204, ms: «תלוש לכל עובד», the period before: open 1307/-, unmoved 87/-, closed 326/2299
        this build / v204, ms: the closing box, a weekly man: open 350/3773, unmoved 93/2965, closed 92/152
        this build / v204, ms: the closing box, a fortnightly man: open 210/765, unmoved 41/919, closed 94/140
        this build / v204, ms: a man's days: open 396/3149, unmoved 102/3364, closed 88/247
        this build / v204, ms: his statement: open 439/1748, unmoved 20/1899, closed 84/105
        this build / v204, ms: «מקדמות»: open 877/6514, unmoved 41/1292, closed 204/902
        this build / v204, ms: a man's page of «מקדמות»: open 19/136, unmoved 32/142, closed 25/35
        this build / v204, ms: «סגירות שנרשמו»: open 828/5247, unmoved 19/12, closed 261/1195
        this build / v204, ms: owesReadNow («שים לב»): open 572/5086, unmoved 147/5119, closed 188/748
        this build / v204, ms: «סגירת שבוע»'s list: open 1166/2473, unmoved 140/2348, closed 326/365
        this build / v204, ms: the reminder's count: open 1387/2934, unmoved 182/2662, closed 276/378
        this build / v204, ms: «איפוס מקדמות»'s reading: open 1304/2799, unmoved 250/2588, closed 155/150
        this build / v204, ms: «איפוס מקדמות»'s step 3 (the board after the write): open 649/4541, unmoved 124/4724, closed 123/647
        this build / v204, ms: «כרטיס עובד», a weekly man: open 378/3232, unmoved 32/3203, closed 61/154
        this build / v204, ms: «כרטיס עובד», a fortnightly man: open 216/1478, unmoved 40/1538, closed 73/96
        this build / v204, ms: «סיכום חודש»: open 54/48, unmoved 61/59, closed 64/74
        this build / v204, ms: season-skipped «סגירת שבוע»'s list: 841/711, unmoved 710/970
        this build / v204, ms: season-skipped the reminder's count: 722/722, unmoved 657/793
        this build / v204, ms: shut 205/340, unapproved 6691/61413
        (load at the end of the clocks: 5.9 6.1 5.9)

        (tests/speed.season.test.mjs ran 22.6 minutes on this machine; load 5.9 6.1 5.9)

94/94 checks passed

real	22m38.318s
user	19m6.848s
sys	0m21.960s
exit 0 load 5.94 6.14 5.87
```

</details>

### `tests/speed.browser.mjs` on `22830d3`, through the slot wrapper (32/32, 8.7 minutes inside the slot, 18.5 with the wait)

<details><summary>its output, whole</summary>

```
season-open: {"kind":"open","men":40,"days":300,"from":"2025-12-05","to":"2026-11-19","closes":0,"repaid":8,"skippers":[],"advances":688,"ledger":696,"kib":954} - seeded in 16.7 s
season-closed: {"kind":"closed","men":40,"days":300,"from":"2025-12-05","to":"2026-11-19","closes":225,"repaid":5,"skippers":[],"advances":141,"ledger":530,"kib":1074} - seeded in 35.0 s
  PASS  this build's origin serves this commit, byte for byte
  PASS  v204's origin serves 6ab193d, byte for byte

14. the clocks: fresh pages, 375x667, the processor slowed 4x, this build against v204 (load 1.5 1.6 2.0)
  PASS  1. a write, then «דוחות» opened: the longest task 2950 ms (v204 33516 ms) - <= 1/4 of v204's  — 2950 > 8379
  PASS  2. then «לפי אתר» redrawn, the record unmoved: the longest task 199 ms (v204 34735 ms) - <= 1/10 of v204's row 1  — 199 > 3352
  PASS  2. then «לפי עובד» redrawn, the record unmoved: the longest task 504 ms (v204 34928 ms) - <= 1/10 of v204's row 1  — 504 > 3352
  PASS  3. a write, then «מקדמות» opened: the longest task 1591 ms (v204 5479 ms) - <= 1/2 of v204's  — 1591 > 2740
  PASS  4. «שים לב» read after paint, the record moved: the longest task 963 ms (v204 4526 ms) - <= 1/2 of v204's  — 963 > 2263
  PASS  5. a write on Thursday, then the close reminder's reading after its quiet: the longest task 2447 ms (v204 5083 ms) - <= 0.7 of v204's  — 2447 > 3558
  PASS  17. v204: the reminder read the record exactly once after the write
  PASS  17. v204: the line's count (0) is a fresh count's
  PASS  17. now: the reminder read the record exactly once after the write
  PASS  17. now: the line's count (0) is a fresh count's
  PASS  6. then «סגירת שבוע» opened (no man to offer, so no line: by the function the line calls), the record unmoved: the longest task 270 ms (v204 5056 ms) - <= 1/3 of v204's same act  — 270 > 1685
  PASS  7. the closing box (a weekly man): the longest task 180 ms (v204 3070 ms) - <= 1/2 of v204's  — 180 > 1535
  PASS  8. «כרטיס עובד» (a fortnightly man): the longest task 232 ms (v204 1538 ms) - <= 1/2 of v204's  — 232 > 769
  PASS  9. «תלוש לכל עובד»: the longest task 397 ms (v204 not timed) - <= 3,000 ms  — 397 > 3000
  PASS  10. «סיכום חודש»: the longest task 148 ms (v204 161 ms) - <= 1.25x v204's + 30 ms  — 148 > 231
  PASS  11. a write, «דוחות», a send's provenance key (the tick moved, the record not), «דוחות» redrawn: the longest task 381 ms (v204 34847 ms) - <= 1/10 of v204's row 1  — 381 > 3352
        the day screen, a write (commit + draw): this build 320 ms / v204 243 ms - reported, no budget
        1. a write, then «דוחות» opened: this build 2950 ms / v204 33516 ms
        2. then «לפי אתר» redrawn, the record unmoved: this build 199 ms / v204 34735 ms
        2. then «לפי עובד» redrawn, the record unmoved: this build 504 ms / v204 34928 ms
        3. a write, then «מקדמות» opened: this build 1591 ms / v204 5479 ms
        4. «שים לב» read after paint, the record moved: this build 963 ms / v204 4526 ms
        5. a write on Thursday, then the close reminder's reading after its quiet: this build 2447 ms / v204 5083 ms
        6. then «סגירת שבוע» opened (no man to offer, so no line: by the function the line calls), the record unmoved: this build 270 ms / v204 5056 ms
        7. the closing box (a weekly man): this build 180 ms / v204 3070 ms
        8. «כרטיס עובד» (a fortnightly man): this build 232 ms / v204 1538 ms
        9. «תלוש לכל עובד»: this build 397 ms / v204 -
        10. «סיכום חודש»: this build 148 ms / v204 161 ms
        11. a write, «דוחות», a send's provenance key (the tick moved, the record not), «דוחות» redrawn: this build 381 ms / v204 34847 ms
        (load at the end of the clocks: 3.6 3.1 2.5)
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

        (tests/speed.browser.mjs ran 8.7 minutes; load 4.0 3.2 2.6)

32/32 checks passed

real	18m30.547s
user	1m5.237s
sys	0m5.203s
exit 0
```

</details>

### The rest of `test:all`, one suite at a time through the slot wrapper (`bt`), from a clean detached worktree

Every suite of `npm run test:all` that is not in `npm test`, each alone as `bt node tests/<suite>.mjs` (the script itself, `npm run test:all`, was never run - the task's rule). The time includes the wait for a slot; the load is at the suite's end.

On `9404c76` (served files the same as `22830d3`'s):

```
design.browser.mjs	exit 0	439s	72/72 checks passed	(load 5.40 4.88 5.04)
smoke.mjs	exit 0	352s	1186/1186 checks passed	(load 7.81 5.74 5.26)
```

On `22830d3` - every browser suite that draws «דוחות», «מקדמות», the cards, the payslips, the month, «סגירת שבוע», the reminder or «איפוס מקדמות» (by grep), the floors suites, and print:

```
largetext.browser.mjs	exit 0	1442s	8101/8101 checks passed	(load 3.90 3.58 3.37)
mobile.test.mjs	exit 0	391s	1397/1397 checks passed	(load 2.62 4.00 3.78)
reportsclarity.browser.mjs	exit 0	7s	193/193 checks passed	(load 2.89 4.01 3.79)
reportnames.browser.mjs	exit 0	14s	258/258 checks passed	(load 2.97 4.00 3.79)
rima.browser.mjs	exit 0	35s	150/150 checks passed	(load 1.66 3.52 3.64)
yosefgeves.browser.mjs	exit 0	25s	157/157 checks passed	(load 1.70 3.41 3.60)
simple-advances.browser.mjs	exit 0	2s	22/22 checks passed	(load 1.72 3.39 3.59)
navigation.browser.mjs	exit 0	3s	84/84 checks passed	(load 1.72 3.39 3.59)
auditfix.browser.mjs	exit 0	3s	27/27 checks passed	(load 1.67 3.35 3.57)
owes.browser.mjs	exit 0	57s	589/589 checks passed	(load 0.97 2.86 3.39)
weeklyclose.browser.mjs	exit 0	58s	408/408 checks passed	(load 1.17 2.55 3.25)
advancereset.browser.mjs	exit 0	56s	259/259 checks passed	(load 1.63 2.43 3.16)
closereminder.browser.mjs	exit 0	40s	106/106 checks passed	(load 2.42 2.51 3.16)
payslips.browser.mjs	exit 0	13s	132/132 checks passed	(load 2.03 2.42 3.12)
workercard.browser.mjs	exit 0	13s	116/116 checks passed	(load 1.86 2.37 3.09)
monthsummary.browser.mjs	exit 0	14s	88/88 checks passed	(load 2.17 2.42 3.10)
account-view.browser.mjs	exit 0	2s	74/74 checks passed	(load 2.24 2.43 3.10)
overpaidfix.browser.mjs	exit 0	6s	20/20 checks passed	(load 2.14 2.40 3.08)
sitecard.browser.mjs	exit 0	16s	135/135 checks passed	(load 2.67 2.50 3.11)
print.test.mjs	exit 0	23s	94/94 checks passed	(load 3.33 2.70 3.16)
reports.browser.mjs	exit 0	5s	109/109 checks passed	(load 3.95 2.83 3.20)
forms.browser.mjs	exit 0	12s	32/32 checks passed	(load 4.05 2.89 3.21)
whatsnew.browser.mjs	exit 0	69s	251/251 checks passed	(load 2.83 2.77 3.15)
polish.browser.mjs	exit 0	20s	201/201 checks passed	(load 2.86 2.79 3.14)
midnight.browser.mjs	exit 0	118s	323/323 checks passed	(load 3.70 3.07 3.20)
find.browser.mjs	exit 0	15s	88/88 checks passed	(load 4.36 3.24 3.26)
transport.browser.mjs	exit 0	282s	1338/1338 checks passed	(load 3.45 3.18 3.20)
reminders.browser.mjs	exit 0	3s	35/35 checks passed	(load 3.45 3.18 3.20)
exports-proof.print.mjs	exit 0	23s	44/44 checks passed	(load 3.33 3.18 3.20)
```

And on `22830d3`, the rest of `test:all` (suites that open no money reading):

```
update.test.mjs	exit 0	97s	38/38 checks passed	(load 4.03 3.25 3.20)
recovery.browser.mjs	exit 0	18s	61/61 checks passed	(load 3.99 3.29 3.22)
handover.test.mjs	exit 0	13s	26/26 checks passed	(load 3.75 3.27 3.21)
swrestart.test.mjs	exit 0	26s	31/31 checks passed	(load 3.63 3.29 3.22)
swidentity.test.mjs	exit 0	206s	55/55 checks passed	(load 2.42 2.73 3.00)
swfresh.test.mjs	exit 0	21s	18/18 checks passed	(load 2.23 2.67 2.97)
firstvisit.browser.mjs	exit 0	45s	40/40 checks passed	(load 4.03 2.96 3.05)
startup.blank.test.mjs	exit 0	15s	63/63 checks passed	(load 4.07 3.02 3.06)
exports-proof.offline.mjs	exit 0	3s	43/43 checks passed	(load 4.07 3.02 3.06)
reorder.browser.mjs	exit 0	366s	10/10 checks passed	(load 2.01 2.58 2.86)
boot.browser.mjs	exit 0	4s	10/10 checks passed	(load 2.01 2.58 2.86)
settings.browser.mjs	exit 0	4s	107/107 checks passed	(load 2.73 2.72 2.90)
settings-order.browser.mjs	exit 0	19s	164/164 checks passed	(load 2.76 2.72 2.90)
roster.browser.mjs	exit 0	3s	42/42 checks passed	(load 2.54 2.68 2.88)
week.browser.mjs	exit 0	2s	55/55 checks passed	(load 2.54 2.68 2.88)
week-print.browser.mjs	exit 0	1s	17/17 checks passed	(load 2.54 2.68 2.88)
day-polish.browser.mjs	exit 0	4s	51/51 checks passed	(load 2.34 2.63 2.87)
move.browser.mjs	exit 0	54s	58/58 checks passed	(load 1.59 2.37 2.76)
scroll.browser.mjs	exit 0	135s	604/604 checks passed	(load 2.89 2.78 2.87)
seder.browser.mjs	exit 0	27s	89/89 checks passed	(load 2.10 2.60 2.81)
bars.stale.browser.mjs	exit 0	28s	47/47 checks passed	(load 1.88 2.52 2.78)
declutter.browser.mjs	exit 0	20s	131/131 checks passed	(load 3.05 2.74 2.84)
transport.share.browser.mjs	exit 0	43s	192/192 checks passed	(load 2.47 2.65 2.81)
daycheck.browser.mjs	exit 0	19s	122/122 checks passed	(load 2.58 2.69 2.82)
journey.browser.mjs	exit 0	149s	869/869 checks passed	(load 1.95 2.48 2.72)
usual.browser.mjs	exit 0	101s	345/345 checks passed	(load 2.62 2.50 2.70)
doubletap.browser.mjs	exit 0	532s	359/359 checks passed	(load 6.02 4.52 3.49)
removepace.browser.mjs	exit 0	94s	91/91 checks passed	(load 4.80 4.43 3.56)
holiday.browser.mjs	exit 0	832s	393/393 checks passed	(load 1.56 2.50 3.05)
```

This track's own two `test:all` suites are above: `tests/speed.season.test.mjs` 94/94 (`247bcfa`) and `tests/speed.browser.mjs` 32/32 (`22830d3`).

### The run times (the contract asks for them)

Measured on the clean tree at `247bcfa`, `tests/speed.test.mjs` and then `tests/reports.speed.test.mjs` right after
it, nothing of this track running beside them (other tracks' suites were):

```
speed.test	exit 0	320.123847785s	90/90 checks passed	(load 3.41 4.16 5.06)	20:46:36
reports.speed.test	exit 0	161.631776214s	159/159 checks passed	(load 3.01 3.71 4.75)	20:49:18
```

So `tests/speed.test.mjs` takes 5.3 minutes against reports.speed's 2.7. On the first green commit it took 11.2
against 2.9 (`6a15dfc`), and the contract's rule moved the medium season's v204 side to the season suite (`a349c31`).
What is left is criterion 3's afresh column - 246 s of the 320, every way in after each of 26 kinds of write against
the same way drawn on the bare path - which the contract puts in `npm test`. The contract names no further move;
if `npm test`'s length matters more, that column can follow the v204 one into the season suite with no check lost.
`tests/speed.season.test.mjs`: 22.6 minutes at load 5.9 (94/94, above); 19.6 minutes in its first run at load 3-6.

## The budget, as measured (Node on `247bcfa`, Chromium on `22830d3` - the same `js/`)

### Node - tests/speed.season.test.mjs (criterion 13), both builds in one process on the same disk, interleaved v204 / this, the median of three each; load 5.7 at the start of the clocks, 5.9 at the end (other suites running beside: the `npm test` chain of this report)

| reading | season-open, after a change (this / v204 ms) | season-open, unmoved | season-closed, after a change | ceilings (open / unmoved / closed) |
|---|---|---|---|---|
| «דוחות» (one draw builds both sections) | 1,204 / not timed (minutes) | 99 / - | 237 / 1,638 | ≤ 5,000 / ≤ 800 / ≤ 1/4 |
| the workbook | 1,096 / - | 38 / - | 174 / 3,663 | ≤ 5,000 / ≤ 800 / ≤ 1/6 |
| «תלוש לכל עובד», this period | 1,100 / - | 68 / - | 218 / 2,387 | ≤ 5,000 / ≤ 800 / ≤ 1/6 |
| «תלוש לכל עובד», the period before | 1,307 / - | 87 / - | 326 / 2,299 | ≤ 5,000 / ≤ 800 / ≤ 1/6 |
| the closing box, a weekly man | 350 / 3,773 | 93 / 2,965 | 92 / 152 | ≤ 0.35 / ≤ 1/4 / ≤ 1.25x + 30 |
| the closing box, a fortnightly man | 210 / 765 | 41 / 919 | 94 / 140 | ≤ 0.6 / ≤ 1/4 / ≤ 1.25x + 30 |
| a man's days | 396 / 3,149 | 102 / 3,364 | 88 / 247 | ≤ 0.35 / ≤ 1/4 / ≤ 1.25x + 30 |
| his statement | 439 / 1,748 | 20 / 1,899 | 84 / 105 | ≤ 0.5 / ≤ 1/2 / ≤ 1.25x + 30 |
| «מקדמות» | 877 / 6,514 | 41 / 1,292 | 204 / 902 | ≤ 0.35 / ≤ 1/4 / ≤ 1/2 |
| a man's page of «מקדמות» | 19 / 136 | 32 / 142 | 25 / 35 | ≤ 0.6x + 20 / ≤ 0.6x + 20 / ≤ 1.25x + 30 |
| «סגירות שנרשמו» | 828 / 5,247 | 19 / 12 | 261 / 1,195 | ≤ 0.35 / **≤ 1.25x + 30** (deviation 1) / ≤ 1/2 |
| owesReadNow («שים לב») | 572 / 5,086 | 147 / 5,119 | 188 / 748 | ≤ 0.35 / ≤ 1/4 / ≤ 1/2 |
| «סגירת שבוע»'s list | 1,166 / 2,473 | 140 / 2,348 | 326 / 365 | ≤ 0.75 / ≤ 1/4 / ≤ 1.25x + 30 |
| the reminder's count | 1,387 / 2,934 | 182 / 2,662 | 276 / 378 | ≤ 0.75 / ≤ 1/4 / ≤ 1.25x + 30 |
| «איפוס מקדמות»'s reading | 1,304 / 2,799 | 250 / 2,588 | 155 / 150 | ≤ 0.75 / ≤ 1/4 / ≤ 1.25x + 30 |
| «איפוס מקדמות»'s step 3 (the board after the write) | 649 / 4,541 | 124 / 4,724 | 123 / 647 | ≤ 0.35 / ≤ 1/4 / ≤ 1.25x + 30 |
| «כרטיס עובד», a weekly man | 378 / 3,232 | 32 / 3,203 | 61 / 154 | ≤ 0.35 / ≤ 1/4 / ≤ 1.25x + 30 |
| «כרטיס עובד», a fortnightly man | 216 / 1,478 | 40 / 1,538 | 73 / 96 | ≤ 0.35 / ≤ 1/4 / ≤ 1.25x + 30 |
| «סיכום חודש» | 54 / 48 | 61 / 59 | 64 / 74 | ≤ 1.25x + 20 each |
| season-skipped: «סגירת שבוע»'s list | - | - | 841 / 711 after a change, 710 / 970 unmoved | ≤ 1.25x + 30 |
| season-skipped: the reminder's count | - | - | 722 / 722 after a change, 657 / 793 unmoved | ≤ 1.25x + 30 |
| season-closed, both gates shut, «דוחות» | - | - | 205 / 340 | ≤ 1.25x + 30 |
| season-closed, nobody approved, «דוחות» | - | - | 6,691 / 61,413 | ≤ 0.4 |
| the kept key, season-open's record (977,262 characters) | 7 ms | | | ≤ 30 ms |

Every row passed (94/94, above). Two rows to read with care: season-skipped's «סגירת שבוע» after a change is SLOWER
than v204 (841 against 711 ms, inside 1.25x + 30) - the copies of the record are planned again at every reading, as
the contract says S1 must not touch, and this build adds its two key computations; and «איפוס מקדמות»'s reading on
season-closed is v204's time (155 / 150). Neither is a fraction the contract asked for; both are held by "never
slower than 1.25x + 30 ms".

### Chromium - tests/speed.browser.mjs (criterion 14), Chromium 1194, 375x667, DPR 2, touch, CPU 4x through CDP; every row in a fresh page of each tree (6ab193d's served beside on its own port), alternating v204 / this build; the longest task of the act; load 1.5 at the start of the clocks, 3.6 at their end; commit `22830d3`

| row | this build / v204, ms | ceiling | |
|---|---|---|---|
| 1. a write, then «דוחות» opened | 2,950 / 33,516 | ≤ 1/4 of v204's (8,379) | 0.09 |
| 2. then «לפי אתר» redrawn, unmoved (row 1's page) | 199 / 34,735 | ≤ 1/10 of v204's row 1 (3,352) | |
| 2. then «לפי עובד» redrawn, unmoved | 504 / 34,928 | ≤ 1/10 of v204's row 1 | |
| 3. a write, then «מקדמות» opened | 1,591 / 5,479 | ≤ 1/2 | 0.29 |
| 4. «שים לב» read after paint, the record moved | 963 / 4,526 | ≤ 1/2 | 0.21 |
| 5. a write on Thursday, the reminder's reading after its quiet | 2,447 / 5,083 | ≤ 0.7 | 0.48 |
| 6. then «סגירת שבוע» opened, unmoved (by `openWeeklyClose`, deviation 8) | 270 / 5,056 | ≤ 1/3 | 0.05 |
| 7. the closing box (a weekly man) | 180 / 3,070 | ≤ 1/2 | 0.06 |
| 8. «כרטיס עובד» (a fortnightly man) | 232 / 1,538 | ≤ 1/2 | 0.15 |
| 9. «תלוש לכל עובד» | 397 / not timed | ≤ 3,000 ms | |
| 10. «סיכום חודש» | 148 / 161 | ≤ 1.25x + 30 (231) | |
| 11. a write, «דוחות», a send's provenance key (tick moved, record not), «דוחות» redrawn | 381 / 34,847 | ≤ 1/10 of v204's row 1 | |
| the day screen: a write (commit + draw) | 320 / 243 | reported, no budget (js/state.js, js/store.js) | |

The day screen's write is 77 ms slower here than v204's in this run; this track changes nothing the write runs
(the commit and the day's draw read no money), and one fresh-page sample of each is all the suite takes - noise
until shown otherwise; reported, as the contract asks, with no budget.

## Criterion 8: the counts, v204 → this build, for every way in

Real calls of the model functions, counted from before the first reading (the `COUNTER` pattern), one cold reading per way in (`REPORT_SHARED_KEPT = null` first), on the medium season with closes (`tests/speed.test.mjs` on `6caaba1`); "keys" is `reportSharedKey` computations. Every rule held for all 32 ways in - each reader once per question, `advanceHistory` never (grouped from the entries), `payrollReport` once per range, the key at most twice and never for a way in that asks none of the seven, the gate not asked on an approved record:

```
the default account: «דוחות» ← «לפי עובד»: ledgerEntries 2506 -> 1, foldLedger 1497 -> 1, advanceHistory 1008 -> 0, overpaidAdvances 474 -> 15, advanceOutstanding 1008 -> 30, advanceWalk 459 -> 278, advancePositionInto 30 -> 30, payrollReport 39 -> 39, keys 2
the default account: «דוחות» ← «לפי אתר»: ledgerEntries 1390 -> 1, foldLedger 834 -> 1, advanceHistory 556 -> 0, overpaidAdvances 278 -> 15, advanceOutstanding 556 -> 30, advanceWalk 278 -> 278, advancePositionInto 15 -> 15, payrollReport 39 -> 39, keys 2
the default account: the pay rows: ledgerEntries 1390 -> 1, foldLedger 834 -> 1, advanceHistory 556 -> 0, overpaidAdvances 278 -> 15, advanceOutstanding 556 -> 30, advanceWalk 278 -> 278, advancePositionInto 15 -> 15, payrollReport 38 -> 38, keys 2
the default account: the workbook: ledgerEntries 4170 -> 1, foldLedger 2502 -> 1, advanceHistory 1668 -> 0, overpaidAdvances 834 -> 15, advanceOutstanding 1668 -> 30, advanceWalk 834 -> 278, advancePositionInto 45 -> 15, payrollReport 39 -> 39, keys 2
the default account: w_1: his statement: ledgerEntries 125 -> 1, foldLedger 75 -> 1, advanceHistory 50 -> 0, overpaidAdvances 25 -> 1, advanceOutstanding 50 -> 2, advanceWalk 25 -> 25, advancePositionInto 1 -> 1, payrollReport 25 -> 25, keys 2
the default account: w_1: his days: ledgerEntries 255 -> 1, foldLedger 152 -> 1, advanceHistory 102 -> 0, overpaidAdvances 50 -> 1, advanceOutstanding 100 -> 2, advanceWalk 50 -> 25, advancePositionInto 0 -> 0, payrollReport 25 -> 25, keys 2
the default account: w_1: his closing box: ledgerEntries 252 -> 1, foldLedger 152 -> 1, advanceHistory 100 -> 0, overpaidAdvances 50 -> 1, advanceOutstanding 100 -> 2, advanceWalk 50 -> 25, advancePositionInto 0 -> 0, payrollReport 25 -> 25, keys 2
the default account: w_2: his statement: ledgerEntries 65 -> 1, foldLedger 39 -> 1, advanceHistory 26 -> 0, overpaidAdvances 13 -> 1, advanceOutstanding 26 -> 2, advanceWalk 13 -> 13, advancePositionInto 1 -> 1, payrollReport 13 -> 13, keys 2
the default account: w_2: his days: ledgerEntries 135 -> 1, foldLedger 80 -> 1, advanceHistory 54 -> 0, overpaidAdvances 26 -> 1, advanceOutstanding 52 -> 2, advanceWalk 26 -> 13, advancePositionInto 0 -> 0, payrollReport 13 -> 13, keys 2
the default account: w_2: his closing box: ledgerEntries 132 -> 1, foldLedger 80 -> 1, advanceHistory 52 -> 0, overpaidAdvances 26 -> 1, advanceOutstanding 52 -> 2, advanceWalk 26 -> 13, advancePositionInto 0 -> 0, payrollReport 13 -> 13, keys 2
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

Season-closed, one draw of «דוחות» ← «לפי עובד» (`tests/speed.season.test.mjs` on `247bcfa`), beside the contract's prototype C (`ledgerEntries` 3,202 → 1, `foldLedger` 1,788 → 1, `advanceHistory` 1,413 → 0, `advanceOutstanding` 1,413 → 141, `overpaidAdvances` 335 → 40, `advanceWalk` 316 → 277, `advancePositionInto` 47 → 47, `payrollReport` 18 → 18):

```
one draw of «לפי עובד» on season-closed, v204 -> this build: ledgerEntries 3343 -> 1, foldLedger 1865 -> 1, advanceHistory 1477 -> 0, overpaidAdvances 348 -> 40, advanceOutstanding 1477 -> 141, advanceWalk 324 -> 277, advancePositionInto 48 -> 48, payrollReport 18 -> 18
PASS  v204 listed the ledger 3343 times for it, this build 1: at least 50x  — 3343 / 1
```

On season-open the same rules held for 35 ways in, read cold (`PASS  35 ways in on season-open`); v204's own counts are not taken there - its readings of that record take 40 s to minutes each (deviation 7).

## An existing suite's expectation moved (one, the contract's, deliberately)

`tests/owes.test.mjs:1012-1019` - «"דוחות" with the row at its head asks exactly what "דוחות" asks without it»
compares two draws in a row. Under S3 the first draw is the first reading of the pay sheet's ranges after
«מקדמות» and the second finds them kept, so the counts differed by the warm-up and not by the row (on prototype
D `[0,0,2,15] !== [0,0,1,15]`). Each of the two draws now starts with `REPORT_SHARED_KEPT = null`, so it is again
one draw against the other. The check's words and its expectation are unchanged. Commit `0753250` says why.
Nothing else in an existing suite moved; `tests/gate.integrity.test.mjs` and `package.json` and
`tests/README.md` are additive.

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

## For the integrator

**«מה חדש» (PROPOSED, the contract's Revision 2 item, word for word):**

```js
{ title: 'הדוחות והמקדמות נפתחים מהר יותר', text: 'עמוד הדוחות, עמוד המקדמות, כרטיס העובד והתלושים נפתחים מהר יותר גם כשיש הרבה עובדים ומקדמות, והמספרים עצמם לא השתנו.', where: 'דוחות ← לפי עובד, וגם מקדמות', go: 'payReport' }
```

`go: 'payReport'` is an existing key (`WHATSNEW_GO.payReport`); pin it word for word in
tests/whatsnew.test.mjs; tests/whatsnew.browser.mjs's key list and landing rules do not move.

**CLAUDE.md, the file list** - the `js/ui/reports.js` entry gains, after its v196 sentence:

    v206: the ledger's folds, each man's walk and each range's pay sheet once per reading, kept under the record
    and its readers between readings (REPORT_SHARED_KEPT, reportSharedKey - the record as text, no tick;
    REPORT_SHARED_DEPENDS)

and the `tests/` part gains `tests/speed.test.mjs`, `tests/speed.season.test.mjs`, `tests/speed.browser.mjs` and
the helper `tests/speed.seed.mjs` (the rows written for tests/README.md can be lifted).

**docs/releases.md, a draft of the entry** (the numbers are this report's, above):

    ## v206 — «דוחות» and «מקדמות» answer each man's walk once: the readings share what they already worked out

    js/ui/reports.js (reportReadOnce and the helpers above it), js/ui/owes.js (owesReadNow, three lines) and one line
    of js/ui/advancereset.js. Nothing in js/model, js/sync, the state, the store or the recovery; no screen, node,
    string, key, field path or writer; no CSS; no file added to the shell. NO OUTPUT BYTE MOVES: every way in of
    «דוחות», «מקדמות», «סגירת שבוע», the reminder, the cards, the payslips, the month and «איפוס מקדמות» is held
    byte for byte against v204's files (6ab193d, out of Git) - cold, again and after 26 kinds of write - on the
    seeded records, two fixtures, a medium season and three season records (tests/speed.*).

    Why. On a season nobody closed, every reader of a man's account walked every period of his since his first
    advance, and every step of every walk folded and sorted the whole ledger again: v204 took 40 s in Node to draw
    «דוחות», 44 s in one task in Chromium at 4x, and two minutes for «תלוש לכל עובד» or the workbook.

    What changed. S1: inside v196's one reading the seven readers of a walk answer each question once, for the
    reading's own record only; an append to a copy of its own forgets nothing, anything that can reach the record
    forgets everything. S2: «שים לב» read after paint, and «איפוס מקדמות»'s result, read the board inside a reading.
    S3: the answers are kept between readings under the record as text, today and the flags (not the write tick, so
    a send's receipts do not make the next redraw a first reading), and only for the same readers. S4: each range's
    pay sheet kept with them, handed to a later reading as rows of its own.

    What it does NOT do: the first reading after a change still walks every man's periods once (≈ 1 s in Node,
    seconds at 4x on a season nobody closed - an index in js/model is the next lever, the owner's to approve); the
    close reminder's reading is still one task on the main thread after a pause on a Thursday; a reading of a COPY
    of the record is never answered from memory; the commit's own cost is untouched; a reading that is already
    cheap pays two key computations (≈ 10 ms on a 1 MB record). Not tried on a real phone.

**The wave-1 resets** (the contract's "Conflicts with wave 1" - each makes a timed run cold, as on v204):
add `if (typeof REPORT_SHARED_KEPT !== 'undefined') REPORT_SHARED_KEPT = null;`
- in tests/payday.test.mjs's `fresh` (:142 on feat-payday, run before each timed run);
- in tests/statusscreen.test.mjs's "the board with nothing kept" reset (:1311 on feat-status);
- in tests/yearsummary.test.mjs's timed loop (:1393-1399 on feat-yearsummary), before EACH of the three runs.

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

**Expected red on this branch, and only this** (the stamps are the integrator's): tests/build.test.mjs's
`and nothing in the shell has changed since — 3 changed since 6ab193d6: js/ui/advancereset.js, js/ui/owes.js,
js/ui/reports.js` (68/69) and tests/gate.integrity.test.mjs's §4 `no cached file has changed since the three
stamps last moved — 77e63e22 reports.js: … | 07532505 reports.js: … | 90a34820 owes.js, advancereset.js: … |
f9bc05b8 reports.js: …` (19/20). The integrator's stamp commit turns both green.

## NOT done, and not verified

- **`npm run test:all` was never run as one command** - the task's rule for this step (never `test:all`,
  `test:release` or the emulator suites; the full gate is run once, later, alone). What the contract's report asks
  for instead was done: `npm test` IN FULL one script at a time on a clean detached worktree at `247bcfa` (and the
  scripts that read the test files `6caaba1` and `22830d3` changed again on each - five on `6caaba1`, the four
  that do not run speed.test on `22830d3`), and EVERY ONE of the 62
  suites `test:all` adds to it, one at a time through the slot wrapper, on `22830d3` (design and smoke on
  `9404c76`, the season suite on `247bcfa`) - all green. That is the gate's parts, not the gate: one chain on one
  commit, run by the integrator on the merged tree, is still owed.
- The emulator suites (`test:emulator`, `test:sendclaim`) - not run, by rule; nothing in js/sync changed.
- Not tried on a real phone; the 4x CPU throttle in Chromium stands in for one, in fresh pages.
- Not merged with wave 1 (status, payday, monthboard, yearsummary) or v205: the resets, the ways in and the
  later-track file above are the integrator's, on the merged tree.
- The browser rows' budgets rest on one green run (load 1.5-4.0, another track's browser suite in the other slot)
  and the first run's rows 1-5; every fraction is against v204 taken in the same browser, alternating, one
  fresh page per row per tree - no medians in Chromium, as the contract specifies.
- The contract's "What it does NOT do" stands as written: the first reading after a change is still the model's
  walk; the reminder's reading is still a main-thread task after a pause on a Thursday; copies of the record are
  read again every time; the commit, the boot and the gate's plan on an unapproved record are untouched.

## Known risks

- **Memory.** `REPORT_SHARED_KEPT` holds one record's answers, the record as text (the key) and the schedule
  object until a reading replaces or drops it - a few MB on a season record, never two at once. On a phone short
  of memory that is more than v204 held (v204 already holds the record's text in `OWES_KEPT`'s key, and in
  `REPORT_GATE_KEPT`'s on a record that must be planned).
- **Two key computations per reading that asks a kept function** (`JSON.stringify` of the record at the first
  question and again at the close): ≈ 10 ms in Node on a 1 MB record, more at 4x; a reading already cheap on v204
  (a man's page of «מקדמות», his statement on season-closed) can be that much slower - held by the budget's
  1.25x + 30 ms.
- **A model reader added later that the model feature-detects** must join `REPORT_SHARED_DEPENDS`;
  tests/speed.test.mjs fails until it does (criterion 11 greps js/model). A reader added to S1's seven must keep
  the rules (exact arity and types, `asked !== schedule` first, answers copied).
- **A suite that replaces a model function outside `REPORT_SHARED_DEPENDS` on a device that has already read**
  must clear `REPORT_SHARED_KEPT` (as suites clear `OWES_KEPT`); the app never replaces one. The three wave-1
  timed suites above are the known cases.
- **Something that changes the record in place inside a reading without `appendLedgerEntry`** is caught at the
  close (the record must still read as at the first question), but a sheet worked out before that first question
  is trusted as v196 trusts it; no reader does this today.
- **The kept answers share the record's own entry objects** (`ledgerEntries` returns them, as the real function
  does): nothing edits an entry (iron law 1), and a record whose text changed is never served from memory.

## Appendix: the diff of the app (`git diff 6ab193d..22830d3 -- js/`)

The contract's report asks for it whole: `js/ui/reports.js`, `js/ui/owes.js`, `js/ui/advancereset.js` - nothing else under `js/` differs, and nothing under `js/` moved after `77e63e2`.

<details><summary>416 lines</summary>

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
index 95e7eef..d20157f 100644
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
@@ -108,47 +135,324 @@ function reportReading() {
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
+// The pay sheets (S4) are kept with it: a range this reading works out is put aside as rows
+// nobody has touched; a range asked after the memo was adopted is handed a fresh copy of the
+// kept rows, and that copy is then the reading's, shared inside it exactly as v196 shares one.
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
+            held: liveMap(), legacy: liveLegacy() };
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
+                if (gate === undefined) gate = reportGateAnswer(asked, real.gate);
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
+                        if (shared) shared.sawSheet(key, rows);
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
 
```

</details>
