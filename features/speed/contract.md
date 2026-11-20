# Contract — «דוחות ומקדמות מהירים»: one reading, answered once (track `speed`)

Base `6ab193d68c960e4a56d947673c282b867acd258f` (origin/main, stamps v204). Branch `feat-speed`,
worktree `/home/user/farkad/.claude/worktrees/feat-speed`. Wave 2 of the 2026-11-19 program; the
integrator merges it after wave 1 (status, payday, monthboard, yearsummary) and v205, as v206 or v207.

A performance track with NO screen, NO string, NO key and NO writer. On a season-sized record every
money reading of «דוחות» and «מקדמות» walks every man's account from his first advance, and each
step of every walk folds the whole ledger again: v204 takes **40 seconds** in Node to draw «דוחות»,
**44 seconds in one task** in Chromium with the processor slowed 4x, and **two minutes** for «תלוש לכל
עובד» or the workbook. This track makes those readings share what they already worked out - inside
the one reading v196 built (`reportReadOnce`), and then between readings of a record that did not
move - without changing one output byte. Everything below was MEASURED on a prototype in
`/tmp/claude-0/-home-user-farkad/d6a64352-db1a-5c3b-b54d-5c09103f2419/scratchpad/program/speed/`
(`prototype-C.diff` was Revision 1's design, 137 lines; the probes and raw outputs sit beside it).
**Revision 2** (2026-11-19, after an adversarial review) changes the design to prototype D -
`rev2/prototype-D.diff` (263 lines: reports.js, owes.js and one line of advancereset.js), its probes
and outputs in `rev2/`, the critic's in `critic/`. Every change is listed under «Revision 2» at the
end; where this text and an older number disagree, the Revision 2 text holds.

## Goal

After this ships, on the season-open record (40 men, 300 working days, an advance every 14-28 days
per man since the first day, nothing closed; the shape of a crew nobody closes) these readings are
faster than v204's by the measured factors below - with every output byte v204's. Measured BACK TO
BACK at one load (Revision 2, load 2.5-3.6, `rev2/`): 3x to 10x for the readings of one man or of one
page (his statement 5.3x, his days 8x, the weekly closing box 8.8x, «מקדמות» 10x, «שים לב» 7x, the
cards 9.6-9.8x, «סגירות שנרשמו» 8.5x); about 2x for the three below; the workbook, the payslips and
«דוחות» 30x-135x as first measured (v204 at load 7-15, not re-measured at one load: minutes each),
«דוחות» 11x in one 4x-slowed Chromium task:

1. «דוחות» ← «לפי עובד» and «לפי אתר», the closing box, a man's days, his statement, the workbook;
2. «מקדמות» with its board («מי חייב כסף», «שים לב»), a man's page, «סגירות שנרשמו», a close's page;
3. «שים לב» at the head of «דוחות», read after paint;
4. «סגירת שבוע»'s list and the close reminder's count;
5. «כרטיס עובד», «תלוש לכל עובד» (both periods), «איפוס מקדמות»'s reading;
6. a second reading of a record that did not move (a redraw, the section switch, the row read after
   paint, «סגירת שבוע» opened from the reminder's line, a card opened) costs a small fraction of the
   first - also on a synced phone, where the send's queue, receipt and provenance writes move the write
   tick minutes after a write without moving the record (Revision 2: S3's key holds no tick).

«סגירת שבוע»'s list, the close reminder's count and «איפוס מקדמות»'s reading gain about 2x after a
change (back to back at load 2.5-3.6: 1,852 → 920, 2,036 → 939, 1,904 → 865 ms; Revision 1's "3-5x" set
v204 at load 7-15 against the prototype at a lower load), and the reminder's reading in Chromium at 4x
2.6x (load 5, the critic's fresh pages: 5,941 → 2,286 ms). What is left after a change is the model's
walk: every man's periods since his first advance walked once, each period's sheet priced once
(`payrollReport` 74-75 times, `advancesFor` 40 times a sheet - `critic/p3.out`), said under "What it does
NOT do". NOT copies: on season-open and season-closed none of the three reads a copy of the record
(no man has an empty period to close first - `rev2/held.mjs`: 0 on both; «איפוס מקדמות» builds no copy
anywhere, advancereset.js:168-249). On an UNMOVED record they cost a fraction since Revision 2 (S4 keeps
the pay sheets too): 86, 79 and 126 ms on prototype D against 377-585, 468 and 405-998 on prototype C.

«סיכום חודש» is already cheap (a month is never a payday: no walk) and only has to stay so.

## Out of scope

- `js/model/**`, `js/sync/**`, `js/state.js`, `js/store.js`, `js/recovery.js` - not one line. The
  model's own costs stay: the first reading after a change still walks every man's periods since his
  first advance, and each step of a walk still scans the whole advances map (`advancesFor`,
  schema.js:2099) and the whole ledger (`advanceLedgerSum`, schema.js:2170) and prices the crew's
  sheet of that period (`payrollReport`, money.js:210). Measured: ~1.3 s in Node, ~3.5 s in Chromium
  at 4x on season-open. Below that floor is an index in the model - a separate, approved track.
- The commit's own cost on the day screen (journal + record through `Store.setVerified`): 229-571 ms
  per write at 4x on these records, measured and reported, untouched.
- Readings over COPIES of the record (`outstandingWithout`, ledger.js:366, judging a closure;
  `weeklyCloseWithoutEmpties`, weeklyclose.js:413-422, a man's periods with no day of work closed first
  on a copy with a ledger map of its own): another record is never answered from memory
  (reports.js:58-60), so a copy is read again at every reading - 32 walks for 4 such men on the critic's
  probe (`critic/p1.out`). Revision 2: this is NOT where «סגירת שבוע»'s, the reminder's and «איפוס»'s
  remaining cost is on the season records - neither reads a copy there (see the Goal); the copy path
  is measured on the new season-skipped record (criterion 2).
- Any new screen, Hebrew string, Store key, field path, writer, or file in the shell; any CSS.
- `js/ui/weeklyclose.js` (see "Why not weeklyCloseOnce"), `tests/reports.speed.test.mjs` (payday's).
- A worker thread for the close reminder's reading (the one lever left for the day screen; listed
  under "What it does NOT do").

## The offenders, ranked (MEASURED on v204, `6ab193d`)

Node 22, the repo's own harness and Node DOM (`tests/moneydom.mjs`), one run each after a change to
the record (`State.schedule.workers[0].note` moved, so nothing kept is fresh). Machine: 4 cores with a
load average of 7-15 (other suites running), so absolute times are high. Revision 2: a ratio holds only
between two sides timed at the same moment - several of the prototype's rows below were timed at a
lower load than this v204 column (the critic's runs at load 1.0-1.7, ours at 2.5-3.6, `rev2/`), so the
budget times v204 in the same process, interleaved, and states its ceilings as fractions of it.
Records written by the app's own writers through the harness (probe `gen.mjs`):
**season-open**: 40 men (16 weekly), 300 working days 2025-12-05..2026-11-19, 6 sites, Rima and יוסף גבס,
688 advances, 696 ledger entries, 8 repayments, nothing closed, the approval recorded, 954 KiB.
**season-closed**: the same crew, advances only in the last 70 days, every period since closed in
order except a third of the men's last one, 225 closes, 515 entries, 1,069 KiB. TODAY = Thursday
2026-11-19 (a week ends; the weekly men's periods end today).

| # | reading (v204) | season-open | season-closed |
|---|---|---|---|
| 1 | «תלוש לכל עובד», the period before | **142,926 ms** | 1,914 |
| 2 | the workbook (`reportSheets`) | **122,411** | 2,945 |
| 3 | «תלוש לכל עובד», this period | **114,062** | 2,067 |
| 4 | «דוחות» ← «לפי עובד» | **39,704** | 1,905 |
| 5 | «דוחות» ← «לפי אתר» (both sections are built, reports.js:630-646) | **39,542** | 1,378 |
| 6 | «מקדמות» (board + list) | 9,294 | 698 |
| 7 | «סגירות שנרשמו» | 9,132 | 883 |
| 8 | «שים לב» / the board read after paint (`owesReadNow` outside any reading) | 8,132 | 455 |
| 9 | «איפוס מקדמות»'s reading | 5,176 | 194 |
| 10 | the close reminder's count (`closeReminderReadCount`) | 5,113 | 184 |
| 11 | «סגירת שבוע»'s list (`weeklyCloseRead`) | 4,656 | 201 |
| 12 | a man's days (weekly man) | 3,570 | 185 |
| 13 | «כרטיס עובד» (weekly man / fortnightly man) | 3,428 / 1,326 | 123 / 63 |
| 14 | the closing box (weekly man / fortnightly man) | 2,706 / 772 | 149 / 67 |
| 15 | his statement | 711 | 68 |
| 16 | «מקדמות» ← a man | 165 | 13 |
| 17 | «סיכום חודש» | 49 | 23 |
| - | «דוחות» on a record nobody approved (the gate plans inside the draw) | (`planCarryMigration` alone: 457,350) | **50,873** |

Chromium 1194, 375x667 touch, CPU throttled 4x through CDP (`Emulation.setCPUThrottlingRate`), the
disk loaded into localStorage (probe `bprobe.mjs`), season-open:

| reading (v204) | the long task |
|---|---|
| «דוחות» opened from the day screen after a write | **44,041 ms, one task** |
| the close reminder's reading, record moved | 9,735 |
| «שים לב» read after paint, record moved | 6,071 |
| «מקדמות» opened after a write | 2,374 |
| the day screen: one write (commit + draw; no money read in it) | 229 |
| «סיכום חודש» | 148 |

THE DAY SCREEN AFTER A WRITE: the draw itself reads no money. 1.5 s after the last draw the close
reminder re-reads «סגירת שבוע»'s list whenever a period of anybody's ends today (closereminder.js:209-238,
`closeReminderPeriodEnds` :117) - every Thursday for the weekly men. On season-open that is a 9.7 s
task at 4x on v204 after each pause in the typing.

WHERE THE TIME GOES (CPU profiles, `topprof.mjs`): `advanceAccount` → `advancePositionInto` →
`accountsBefore` → one `advanceWalk` per period since his first advance; each walk calls
`overpaidAdvances` (ledger.js:611: an O(advances²) de-duplication, then `advanceOutstanding` per
advance of his, each `foldLedger` + `advanceHistory`, i.e. two full sorts of the ledger) and five
`advanceLedgerSum` scans (each calling `foldLedger` per matching entry). `reportReadOnce` (reports.js:111)
answers the gate, `payrollReport` and `closedPeriods` once, but not the ledger's folds and not the
walks, and the same man's walk is redone by every reader that asks for his account: his row's carry,
his notes, his card, the closing box, the board, the statement, «סגירת שבוע».

## The repair - four steps, all UI-side, measured (Revision 2 added S4)

### S1 - the ledger's folds and each man's walk, once per reading (js/ui/reports.js, `reportReadOnce` only)

For the length of one reading, ONLY for the schedule that reading opened on (`asked === schedule`, the
rule reportReadOnce already keeps for its three, reports.js:124-141), ONLY with exactly the argument
count and types the model's own callers pass (anything else goes to the real function), each of these
answers from what this reading already asked:

| model function (read, never changed) | file:line | asked of it by | key | handed out |
|---|---|---|---|---|
| `ledgerEntries(schedule)` | js/model/ledger.js:67 | foldLedger, advanceHistory, owesRead (owes.js:363), workercard.js:253, reports.js:3439/3794/3934 | - | a copy of the list (`.slice()`) |
| `foldLedger(schedule)` | ledger.js:163 | advanceOutstanding, overpaidAdvances, advanceLedgerSum (schema.js:2190), workerFootprint (schema.js:1419), planPeriodClosure (ledger.js:1201) | - | the same object - nothing writes into a fold: `currentAdvances` (ledger.js:191), the one function that does, has no caller in `js/` (pinned, criterion 11) |
| `advanceHistory(schedule, id)` | ledger.js:229 | advanceOutstanding (ledger.js:274), reports.js:3375/3424/3435/3940, workercard.js:258 | `String(id)`, grouped from the list in its order | a copy of the list |
| `advanceOutstanding(schedule, id)` | ledger.js:256 | overpaidAdvances, openAdvanceBalance, the advance list | `typeof`+value | a shallow copy (its result is flat, ledger.js:311-330) |
| `overpaidAdvances(schedule, workerId)` | ledger.js:611 | advanceWalk (schema.js:2445), owes.js:276, reports.js:3418/3443, advancereset.js:232 | `typeof`+value | a new array of shallow copies |
| `advanceWalk(schedule, workerId, from, to, carriedIn)` | js/model/schema.js:2338 | advancePositionInto, advanceAccount, planAdvanceCarry, planPeriodClosure (ledger.js:1132), weeklyclose.js:388/467, advancereset.js:182, ledger.js:849 | each argument by `typeof`+value, `-0` apart from `0` | a shallow copy (flat, schema.js:2505-2546) |
| `advancePositionInto(schedule, workerId, fromDate)` | schema.js:2264 | advanceAccount, advanceCarryInto, advanceCreditInto, closePeriodChanges (ledger.js:1295) | `typeof`+value | the number |

- `typeof` in every key: `advanceWalk` finds his row with `item.workerId === workerId` (schema.js:2368-2369),
  so `5` and `'5'` are different questions with different answers.
- `appendLedgerEntry` (ledger.js:651) is wrapped for the length of the reading. An append that CAN
  reach the reading's record forgets every answer above, and the reading keeps nothing (S3); so does
  any replacement of the record's ledger map or advances map object (the memo's identity check).
  Revision 2 - THE RULE: an append is SEPARATE, and forgets nothing, only when its first argument is
  an object other than the record, whose `ledger` is an object other than the record's `ledger` and
  whose `ledger.advances` is an object other than the record's own map - checked before the call and
  again after it; an append to the record itself, to a copy that shares its ledger object or its
  ledger map, to anything not an object, or one that throws, forgets. appendLedgerEntry writes only
  into its first argument's own map (ledger.js:694-697), so a separate append cannot move one answer
  for the record. Revision 1 said "nothing appends inside a reading today": FALSE. «סגירת שבוע»'s reading
  (and through it the close reminder's count, and wave 1's paydayFacts, payday.js:393-394) plans the
  pass of a man whose earlier periods have no day of work on a COPY (weeklyclose.js:493-504 →
  weeklyCloseWithoutEmpties :413-422 → closePeriodChanges(copy) → appendLedgerEntry(copy)), and the
  prototype C wrapper counted those too: on the critic's probe (12 weekly men, 4 of whom missed a week
  while owing) one reading made 4 appends to copies, folded the record's ledger 5 times instead of
  once and kept nothing, and a second reading of the unmoved record walked all 36 again
  (`critic/p1.out`). Prototype D: 1 fold, kept, and the unmoved reading walks the record 0 times - only
  the copies' own 32 walks (`rev2/`: `p1-appends.mjs protoD`). weeklyCloseOnce's own rule (any append
  forgets ITS memo, weeklyclose.js:212-218) is untouched; after it forgets, it asks S1's wrappers,
  which still answer the unmoved record.
- Each wrapper is installed ONLY where the real function is a function when the reading opens; one
  that is absent stays absent inside the reading (`advanceHistory` needs `ledgerEntries` too). The case
  is live: tests/smoke.mjs:7071 sets `advanceHistory = undefined` and opens a man's days, and the fold
  must be absent - a wrapper built from `ledgerEntries` would draw it.
- Put back in the same `finally` as the three v196 swaps, throw or no throw, by name. Revision 2, the
  order: everything that can throw runs inside the `try` (the v196 swaps, S1's install, S3's key -
  which is now asked lazily, below); the `finally` puts back S1's wrappers, then v196's three, then
  `REPORT_ONCE = outer`, and only THEN does S3 decide what to keep, inside a try/catch of its own. In
  prototype C the key was computed after `REPORT_ONCE` was set and the swaps were made but before the
  `try`, and recomputed at the close before v196's three were put back: a throw there (todayStr,
  JSON.stringify) left the reading open and v196's wrappers installed for the rest of the page's life.
- Nothing else of reports.js changes (S3 and S4 below live in the same helper). Every way in that already opens the reading gets it: renderReports
  (:595), renderAdvances (:311), openWorkerDays (:2582), openWorkerSettlement (:2656), workerStatementText
  (:4129), shareWorkerStatement (:4313), reportSheets (:5078), and the scopes that open it -
  workerCardScope (workercard.js:146), payslipsScope (payslips.js:113), monthSummaryScope
  (monthsummary.js:139), weeklyCloseRead (weeklyclose.js:542), advanceResetRead (advancereset.js:256),
  and wave 1's paydayFacts and statusMoneyFacts (both open it, per their contracts). The inner scopes
  (owesOnce, weeklyCloseOnce, payslipsScope, ...) capture the reading's wrappers as their `real` and
  nest exactly as they nest inside the v196 three.

**Why not weeklyCloseOnce.** Prototype A opened `weeklyCloseOnce` inside `reportReadOnce` - the judge's
21 s → 1.5 s idea. Measured on it: tests/reports.speed.test.mjs:623 «inside a reading, another schedule
is asked of the real functions» FAILS (`"true,false,false,true" !== "true,false,true,true"`), because
weeklyCloseOnce memoises EVERY schedule object it is handed, copies included, and the reading's rule
(reports.js:58-60) is that another record is never answered from memory. It also installs its ledger
wrappers whether or not the real readers exist (the smoke case above). Prototype B/C keeps the memo in
reportReadOnce under the reading's own rule, and `js/ui/weeklyclose.js` is not touched.

### S2 - «שים לב» and the board read inside the reading (js/ui/owes.js, `owesReadNow` only, :663-670)

`owesReadNow` calls `owesRead(State.schedule, today)` inside `reportReadOnce` when no reading is open
(`typeof reportReadOnce === 'function'`, else as today). That is one of the TWO roads that read the
board OUTSIDE any reading (Revision 2: Revision 1 said "the one road"): the after-paint read of «שים לב»
(renderOwesWarningsInto, owes.js:789-835 → owesAfterPaint :780), and «איפוס מקדמות»'s result step
(advanceResetAfter, advancereset.js:757, whose line :781 called `owesRead(State.schedule, todayStr())`
bare right after its write - 3.7 s in Node at load 4 on season-open on v204, the critic's run). Revision
2 sends that line through `owesReadNow()` (a typeof guard keeps the bare call where owes.js is absent):
the same answer by OWES_KEPT's own rule (owesKey, owes.js), read inside a reading, and kept in
OWES_KEPT for the next draw of «מקדמות». It is the one line of advancereset.js this track changes.
(The critic's "the render() before it (:759) draws «מקדמות» inside a reading" holds only when «מקדמות»
is the view behind ⋯; render() draws whatever view is current - the change is right either way.)
Every other caller (the board through renderAdvances, the close reminder's neighbours, payday, status)
is already inside a reading, where the call is the same reading. `owesOnce` (owes.js:211), `OWES_KEPT`,
`owesKey` and the rest of owes.js are unchanged.

### S3 - kept between readings, under the record itself (js/ui/reports.js)

When a reading closes, S1's answers for its record are kept as
`REPORT_SHARED_KEPT = { schedule, key, found, memo, sheets }` (next to `REPORT_GATE_KEPT`, reports.js:72;
`sheets` is S4's). Revision 2 rewrites the rules:

- THE KEY is `reportSharedKey(schedule)`, a new function beside reportGateKey: today, the build's flags
  and the whole record as text, joined - compared, never hashed (owesKey's rule) - and NOT the write
  tick. Every answer S1 and S4 keep is a pure function of the record's content, today, the flags and the
  readers present: js/model reads no Store, no clock and nothing of the sync (grep: no `Store.`,
  `localStorage`, `FarkadSync`, `Date.now()`, `new Date()` or `todayStr()` in js/model/ on 6ab193d). The
  tick guards the DISK - a record that left and came back equal - and moves with every queue, receipt
  and provenance write (store.js:181-199 bumps it for every snapshot key; recovery.js:554-562 counts
  farkad:prov:* and the queue keys as snapshot keys; sync.js:743-766 writes farkad:prov:sent:<kind>:<id>
  when an id leaves the phone), so on a synced phone the send, landing minutes after a write at a site
  with weak signal, made Revision 1's next redraw a first reading. `reportGateKey` keeps the tick and is
  unchanged (tests/reports.speed.test.mjs reads its body), for the gate only.
- THE READERS FOUND: `found` is the identity (`===`) of every function named in
  `REPORT_SHARED_DEPENDS`, read off the global scope when the OUTERMOST reading opens, before any swap:
  S1's seven, `appendLedgerEntry`, v196's three (`carryReportingEnabled`, `payrollReport`, `closedPeriods`)
  and every name js/model/ feature-detects (`typeof X === 'function'` or `!==`; on 6ab193d also
  `workerDaysReport`, `rimaCount`, `poisonedContainers`, `planAdvanceCarry`, `overpaymentStaysCredit`,
  `ledgerContainerProblem`, `isPeriodFor`). A kept memo is used only when every one is the same function,
  else it is dropped. The model's answers depend on which readers exist - advanceOutstanding reads the
  old field when foldLedger or advanceHistory is absent (ledger.js:264), advanceWalk counts no
  overpayment without overpaidAdvances (schema.js:2444), frozenPeriodFor freezes nothing without
  closedPeriods (schema.js:2325) - and Revision 1's memo outlived a reader taken away: one reading with
  every reader, then `advanceHistory = undefined` on the unmoved record, gave openAdvanceBalance 2,000
  (the kept answer, the 1,000 repaid) where v204 gives 3,000 (`critic/p2.out`); prototype D gives 3,000,
  and 2,000 again once the reader is put back (`rev2/p6-putback.mjs`). In the app no reader is ever taken
  away; in the suites (tests/smoke.mjs:7071) one is, and Revision 1 would have handed a memo kept without
  it to the later normal readings of the same device. A suite that REPLACES some other model function on
  a device that has already read clears `REPORT_SHARED_KEPT`, as suites clear `OWES_KEPT` today.
- ASKED LAZILY: the key is computed at the FIRST question the reading asks of S1's seven for its record,
  inside the `try`, and never by a reading that asks none («סיכום חודש» asks none, `critic/p3.out`). At that
  moment a kept memo for another schedule object, another key or other readers is DROPPED at once (its
  memory freed) and a matching one adopted. At the close, after everything is put back (S1 above), the
  memo is kept only if the key was computed, no append could reach the record, something was put in it
  and `reportSharedKey(schedule)` still returns the same string - those last calls inside a try/catch of
  their own. A key that throws (a planted todayStr) means no S3 for that reading: nothing adopted,
  nothing kept, every answer the reading's own. So: at most TWO key computations per reading that asked
  a kept function, ZERO otherwise (Revision 1 said "at most once"; prototype C made two, and made them for
  readings that asked nothing - «סיכום חודש» B 37 / C 56 ms in Node, 183-210 ms in Chromium against
  v204's 148; prototype D 28-33 ms against v204's 46 at one load, `rev2/`).
- The next reading uses the kept answers only when it opens on THE SAME schedule object with the same
  key and the same readers. `closedPeriods` is NOT kept (its answers are deep - per period, days and
  basis - and it is asked once per man), nor the gate (it has `REPORT_GATE_KEPT`). `payrollReport` IS kept
  since Revision 2: S4.
- One memo at a time: it holds one record's answers, its key (the record as text) and the schedule object
  until a reading replaces or drops it - a few MB on a season record, never two.
reportSharedKey costs about 10 ms in Node on season-open's 977,340 characters (reportGateKey, measured).

### S4 - the pay sheet of a range, kept with S3 (js/ui/reports.js, v196's `payrollReport` wrapper; Revision 2)

What an unmoved record still cost after S3 was the per-period pay sheet, which Revision 1 did not keep:
«איפוס מקדמות»'s reading asked `payrollReport` 74 times (`advancesFor` 3,040 times, 40 a sheet),
«סגירת שבוע»'s 75, with 0 walks (`critic/p3.out`, 377-585 ms in Node). S4 keeps the sheets with S1's answers,
under S3's key, readers and rules:
- v196's wrapper (reports.js:128-134) is the one place. A range asked for the first time in a reading that
  has ADOPTED a kept memo is handed a FRESH COPY of the kept rows (a new array of new row objects,
  `Object.assign({}, row)`), and that copy is then the reading's, shared inside it exactly as v196 shares
  a sheet. A range the real function computes is handed out as v196 hands it, and a pristine copy of its
  rows is put aside for keeping. So a reader that wrote into a row (none does today: payrollRowsOver
  copies before it decorates, reports.js:998-1010) could never reach another reading.
- A row of payrollReport is flat - every field a string, number, boolean, null or undefined
  (money.js:210-373) - pinned by a check over every sheet of the seeded records, so a field that one day
  holds an object fails the pin and gets a deep copy.
- Adopted only once the reading's first S1 question has matched the kept key, so a reading that asks only
  sheets («סיכום חודש») never pays for the key. Kept at the close with S1's memo under the same conditions;
  the kept set is the adopted sheets plus the reading's new ones (one range, one sheet).
- Measured on prototype D, season-open, the record unmoved: «סגירת שבוע»'s list 86 ms, the reminder's
  count 79, «איפוס מקדמות» 126 (prototype C: 471, 468, 998 in the table below); every output the same
  SHA-256 as v204's, after a change and unmoved, on both seasons (`rev2/m-*.jsonl`).
- Its own step in the order of work, after S3, reverted - and said under "What it does NOT do" - if it
  moves one byte, or one existing suite's check other than the one named under "Existing suites touched".

### Measured on the prototype (same machine, same load)

Node, after a change (B = S1+S2; C adds S3; "C, unmoved" = the same reading again, the record unmoved,
from the probe's sequence mode):

| reading | v204 open | B open | C, unmoved open | v204 closed | B closed |
|---|---|---|---|---|---|
| «דוחות» ← «לפי עובד» | 39,704 | 1,339 | (first after a change: 1,465) | 1,905 | 210 |
| «דוחות» ← «לפי אתר» | 39,542 | 1,155 | **78** | 1,378 | 99 |
| the closing box, weekly / fortnightly | 2,706 / 772 | 315 / 217 | 164 / 90 | 149 / 67 | 47 / 32 |
| a man's days | 3,570 | 291 | 178 | 185 | 77 |
| his statement | 711 | 118 | 35 | 68 | 21 |
| the workbook | 122,411 | 976 | **83** | 2,945 | 187 |
| «מקדמות» | 9,294 | 449 | 80 | 698 | 78 |
| «סגירות שנרשמו» | 9,132 | 649 | 51 | 883 | 112 |
| «שים לב» (owesReadNow) | 8,132 | 490 | 15 | 455 | 78 |
| «סגירת שבוע»'s list | 4,656 | 1,393 | 471 | 201 | 204 |
| the close reminder's count | 5,113 | 1,246 | 468 | 184 | 178 |
| «כרטיס עובד», weekly / fortnightly | 3,428 / 1,326 | 239 / 127 | 28 / 30 | 123 / 63 | 31 / 21 |
| «סיכום חודש» | 49 | 37 | 56 | 23 | 25 |
| «תלוש לכל עובד», this period / before | 114,062 / 142,926 | 1,013 / 1,059 | **75 / 142** | 2,067 / 1,914 | 117 / 187 |
| «איפוס מקדמות»'s reading | 5,176 | 1,002 | 998 | 194 | 146 |
| «דוחות», record nobody approved (closed) | - | - | - | 50,873 | C: 5,711 |
| «דוחות», both gates shut (closed) | - | - | - | 121 | C: 149 |
| `planCarryMigration` alone (open) | 457,350 bare | 18,223 inside the reading | | | |

Chromium at 4x, season-open, prototype C, first under load (15) and then re-run on a quiet machine (load
1.7): «דוחות» opened from the day screen after a write **3,861 / 3,053 ms** (includes the write, ~300;
v204 44,041); redrawn unmoved «לפי אתר» 317 / 161, «לפי עובד» 436 / 371; «מקדמות» after a write 513 / 279
(v204 2,374); «שים לב» after paint, moved, 1,240 / 1,150 (v204 6,071); the reminder's reading, moved,
4,245 / 2,265 (v204 9,735, loaded); the closing box 287 / 189; «כרטיס עובד» 238 / 174; «תלוש לכל עובד»
646 / 645; «סיכום חודש» 210 / 183 (v204 148); «סגירת שבוע» opened → read, longest task 1,501 / 798. (The
probe's "a write, then the reminder 1.5 s later" row never caught the reading inside its window - the
reminder also waits for nobody typing and for its own clock; criterion 17 drives it by the app's own
timers and asserts, with a spy on `weeklyCloseRead`, that the reading happened.) Season-closed, the three trees in ONE browser
interleaved (`bcheck.mjs`, load 15): «דוחות» moved v204 2,328 / B 746 / C 1,269; unmoved 2,001 / 730 / 755;
«לפי אתר» unmoved 1,614 / 306 / 753; «מקדמות» moved 920 / 540 / 1,052; payslips unmoved 2,577 / 904 / 466 -
and the `innerHTML` (or the reading's JSON) of every one of them the same SHA-256 on all three trees.
The closed-season browser numbers are inside the noise of that load and are re-measured by the suite.

Output, measured: every one of `measure.mjs`'s 20 readings has the SAME SHA-256 on v204 and B on both
seasons under the approved reading; C's equal B's over season-open's sequence; «דוחות» the same on v204
and C on season-closed with nobody approved and with both gates shut. (A sample, not the proof: the
proof is criteria 1-3.) Existing suites run on prototype C in a
scratch clone of `6ab193d` (`run-suites.sh`): reports.speed 159/0 (the 3,276 v195 readings, the
other-schedule rule, freshness after every write), weeklyclose 146/0, payslips 202/0, workercard 180/0,
closereminder 107/0, approval 72/0, overpaidfix 85/0, advancereset 77/0, monthsummary 98/0, account-view
456/0, closeorder 22/0, repayment 240/0, wording 37/0, reportsclarity 1119/0; **owes 189/1** - the one
check moved under "Existing suites touched"; smoke 1,185/1 - every check passed, among them «without the reader the modal still opens, the fold simply
absent» (smoke.mjs:7071), but «the origin served this commit, byte for byte», which compares the served
files with the COMMITTED tree and so fails on any uncommitted prototype (`suite-protoC-smoke.out`).

**Revision 2 - prototype D, back to back, one process per tree, Node** (`rev2/m-*.jsonl`; season-open at
load 2.5-5.5, season-closed at load 5.7-7.8; the best of 2-3 runs; after a change / the record unmoved):

| reading | v204 open | D open | D unmoved | v204 closed | D closed | D closed unmoved |
|---|---|---|---|---|---|---|
| the closing box, weekly / fortnightly | 2,575 / 615 | 274 / 166 | 81 / 42 | 97 / 58 | 73 / 45 | 38 / 30 |
| a man's days (weekly) | 2,559 | 272 | 72 | 170 | 63 | 31 |
| his statement | 716 | 130 | 17 | 33 | 44 | 19 |
| «מקדמות» / a man's page | 4,381 / 79 | 545 / 18 | 42 / 17 | 530 / 15 | 93 / 18 | 47 / 18 |
| «סגירות שנרשמו» | 3,730 | 442 | 8 | 625 | 122 | 29 |
| «שים לב» (owesReadNow) | 3,507 | 451 | 7 | 430 | 127 | 9 |
| «סגירת שבוע»'s list | 1,852 | 921 | 86 | 190 | 159 | 132 |
| the close reminder's count | 2,036 | 878 | 79 | 193 | 161 | 121 |
| «כרטיס עובד», weekly / fortnightly | 2,509 / 1,354 | 279 / 143 | 27 / 29 | 120 / 59 | 45 / 45 | 37 / 36 |
| «סיכום חודש» | 46 | 33 | 28 | 22 | 32 | 29 |
| «איפוס מקדמות»'s reading | 1,904 | 922 | 126 | 155 | 154 | 74 |
| «דוחות» ← «לפי עובד» / «לפי אתר» | (minutes) | | | 2,050 / 1,329 | 215 / 240 | 120 / 57 |
| the workbook / payslips, this period and before | (minutes) | | | 2,674 / 2,060 / 2,328 | 116 / 169 / 152 | 38 / 76 / 100 |
| «דוחות», both gates shut (closed) | | | | 171 | 90 | |

Re-timed at load 4-5 (5-7 runs, medians): season-closed «מקדמות» 577 → 117, «סגירות שנרשמו» 671 → 147,
`owesReadNow` 439 → 110; «סיכום חודש» 35-40 → 30-31 (it computes no key); and the two readings that are
cheap on v204 there and still ask S1 - his statement 37-40 → 48-53, a man's page of «מקדמות» 15-23 →
26-29 - are about 10 ms SLOWER: the two key computations on a 1 MB record (S3), said under "What it does
NOT do" and inside the budget's "1.25x + 30 ms".

Every row the SAME SHA-256 on v204 and D, after a change and unmoved, on both seasons and with both
gates shut. Season-closed at load 5.7-7.8 is noisy (his statement and «סיכום חודש» swing 2x run to run;
the suite's interleaved medians are what decide). The probes: appends to copies keep the memo
(`critic/p1-appends.mjs protoD`: the record's ledger folded once, kept, 0 walks of the record unmoved);
a reader taken away and put back reads as v204 both times, and a tick moved by a provenance write with
the record unmoved reads nothing again (`rev2/p6-putback.mjs`: 3,000 / 2,000 / 0 real calls; prototype C:
2,000 with the reader taken away). Existing suites on prototype D in a scratch clone of 6ab193d
(`rev2/run-suites-D.sh`, results in `rev2/suites-D.txt`): see «Revision 2», item 7.

## Data - what is read

Nothing new is read and nothing is written. The track only changes HOW OFTEN the functions in S1's
table are computed inside and between readings. Every figure, word and node is the existing function's
answer; no shekel is worked out a new way. Reads of Store: none of its own (Revision 2: S3's key holds
no tick; `Store.tick` is read by reportGateKey, for the gate, as on v204). Writes: none - no Store key, no
record, no outbox, no cloud, no backup, no rescue file. In memory: `REPORT_SHARED_KEPT` (one record's
answers) and, through owesReadNow from «איפוס מקדמות»'s step 3, `OWES_KEPT`, which v204 already keeps.

## Permissions and privacy

Unchanged. Nothing leaves the phone; the kept answers live in memory only and die with the page.
Synthetic names in every suite and probe.

## Entry and navigation

None. No button, no route, no dialog. Every screen is entered exactly as on v204.

## The screen

There is no screen. No node is added, removed, moved or re-ordered; no attribute, class, text or style
changes; there is NO new Hebrew string in the app. The only words are the «מה חדש» item, below, for
the integrator.

## Floors and looks

Unchanged: no CSS, nothing in css/large.css, nothing in tests/screens.mjs. The suites that measure the
floors (largetext-browser, mobile, design-browser and each reading's own browser suite) stay green
untouched - listed under "Existing suites touched".

## Performance budget

Revision 2 rewrites this section. Revision 1 set every ceiling at about 3x the prototype as measured
under load 7-15 and claimed each was below v204's own time, "so a return to v204 is caught": FALSE for
four rows - back to back at load 2.5-3.6 v204 itself takes «סגירת שבוע» 1,852 ms (ceiling 3,500), the
reminder's count 2,036 (3,500), «איפוס מקדמות» 1,904 (3,000) and the fortnightly card 1,354 (1,500), and
«סגירות שנרשמו» 3,730 against 3,000 is a 24% margin; «סיכום חודש»'s 400 was 9x v204's 46; and in Chromium
v204's reminder took 5,941 ms at load 5 against an 8,000 ceiling, while prototype C itself broke its own
«מקדמות» 1,500 in a fresh page (1,662; v204 6,318 there) - Revision 1's 279/513 were measured after
«דוחות» had warmed the JIT in the same page (`bprobe.mjs` line 82 runs after lines 77-80).

So now: THE COUNTS ARE THE CATCHERS AND THE CLOCKS ARE THE NET. Every count rule of criterion 8 is a
required check for EVERY way in (npm test, deterministic, on the small records and the medium season;
wave 1's ways in added by the integrator). A clock is a FRACTION OF v204's TIME taken at the same moment:
in Node both trees in one process (v204's three files, 6ab193d, in one device, this build's in another,
the same disk), interleaved v204 / this / v204 / this / v204 / this, the median of 3 each; in Chromium
fresh pages of both trees, alternating. Only where v204's own time is minutes (season-open «דוחות», the
workbook, the payslips: 40-143 s at load 7-15, never under 18 s at any load seen) is a ceiling absolute,
and then at least 3.5x below v204's lowest. Load moves both sides of a fraction together; that is what
keeps it from flaking.

Node - tests/speed.season.test.mjs (`test:all`; Revision 2 moved the season clocks out of `npm test`),
both trees timed as above, every figure printed with v204's beside it:

| reading | season-open, after a change | season-open, unmoved | season-closed, after a change |
|---|---|---|---|
| «דוחות» ← «לפי עובד» / «לפי אתר» (one draw builds both) | ≤ 5,000 ms (v204 not timed) | ≤ 800 | ≤ 1/4 of v204's |
| the workbook (`reportSheets`) | ≤ 5,000 (v204 not timed) | ≤ 800 | ≤ 1/6 of v204's |
| «תלוש לכל עובד», each period | ≤ 5,000 (v204 not timed) | ≤ 800 | ≤ 1/6 of v204's |
| the closing box (weekly man / fortnightly man) | ≤ 0.35 / ≤ 0.6 of v204's | ≤ 1/4 of v204's | ≤ 1.25x v204's + 30 ms |
| a man's days / his statement | ≤ 0.35 / ≤ 0.5 of v204's | ≤ 1/4 / ≤ 1/2 of v204's | ≤ 1.25x + 30 ms |
| «מקדמות» / a man's page of it | ≤ 0.35 / ≤ 0.6x + 20 ms | ≤ 1/4 / ≤ 0.6x + 20 ms | ≤ 1/2 / ≤ 1.25x + 30 ms |
| «סגירות שנרשמו» / `owesReadNow` | ≤ 0.35 of v204's each | ≤ 1/4 each | ≤ 1/2 each |
| «סגירת שבוע»'s list / the reminder's count | ≤ 0.75 of v204's each | ≤ 1/4 each | ≤ 1.25x + 30 ms |
| «איפוס מקדמות»'s reading, and its step 3 (`advanceResetAfter`'s board) | ≤ 0.75 / ≤ 0.35 of v204's | ≤ 1/4 / ≤ 1/4 | ≤ 1.25x + 30 ms |
| «כרטיס עובד» (weekly / fortnightly) | ≤ 0.35 of v204's each | ≤ 1/4 each | ≤ 1.25x + 30 ms |
| «סיכום חודש» | ≤ 1.25x v204's + 20 ms | ≤ 1.25x + 20 ms | ≤ 1.25x + 20 ms |
| season-skipped: «סגירת שבוע»'s list / the reminder's count | - | - | ≤ 1.25x v204's + 30 ms, after a change and unmoved (the copies are planned again at every reading; what S1 must do there is criterion 4's and 9's counts) |
| both gates shut, season-closed «דוחות» | - | - | ≤ 1.25x v204's + 30 ms |
| season-closed, nobody approved (the gate plans inside the draw): «דוחות» | - | - | ≤ 0.4 of v204's |
| the kept key (`reportSharedKey`) | ≤ 2 per reading that asked a kept function, 0 per reading that asked none (counted, every way in); ≤ 30 ms each | | |

(Measured on prototype D at load 2.5-3.6, every fraction above holds with room: the open-season factors
are 0.11-0.27 where 0.35-0.6 is allowed, 0.43-0.50 where 0.75 is, unmoved 0.01-0.07 where 1/4 is; on
season-closed at load 4, «מקדמות» 0.20, «סגירות שנרשמו» 0.22 and `owesReadNow` 0.25 where 1/2 is. Season-skipped
is not built yet: on the critic's small version of it, v204 18-20 ms and prototype D 12-18 ms - the
copies dominate a record that small, and on season-closed, its nearest built relative, «סגירת שבוע»
is 1.0x after a change and 0.7-0.8x unmoved - so its row only forbids getting slower.)

Chromium - tests/speed.browser.mjs (`test:all`), 375x667, DPR 2, touch, CPU 4x through CDP, the
season-open disk written into localStorage before load, the longest task (a `longtask` observer around
the app's own calls). EVERY ROW IN A FRESH PAGE - loaded from the disk, the day screen drawn, then the
one act, so the JIT is as cold as on the owner's phone after a launch - in this order, each act on both
trees (6ab193d's `git archive` served beside on its own port), alternating v204 / this build:

| row (fresh page unless said) | budget |
|---|---|
| 1. a write on the day screen, then «דוחות» opened | ≤ 1/4 of v204's |
| 2. in row 1's page: «לפי אתר», then «לפי עובד», redrawn unmoved (warm by design: S3's row) | ≤ 1/10 of v204's row 1, each |
| 3. a write on the day screen, then «מקדמות» opened | ≤ 1/2 of v204's |
| 4. «שים לב» read after paint, the record moved | ≤ 1/2 of v204's |
| 5. a write on the day screen, Thursday, and the close reminder's reading after its quiet | ≤ 0.7 of v204's |
| 6. then, in row 5's page, «סגירת שבוע» opened from the reminder's line, the record unmoved | ≤ 1/3 of v204's same act |
| 7. the closing box / 8. «כרטיס עובד» | ≤ 1/2 of v204's, each |
| 9. «תלוש לכל עובד» | ≤ 3,000 ms (v204 not timed: minutes in Node) |
| 10. «סיכום חודש» | ≤ 1.25x v204's + 30 ms |
| 11. a write on the day screen, then a queue-and-receipt write that moves the tick and not the record (a provenance key, as a send leaves it), then «דוחות» redrawn | ≤ 1/10 of v204's row 1 (S3 holds no tick) |
| the day screen: a write (commit + draw) | reported, no budget (js/state.js, js/store.js) |

## The suites

Revision 2 splits the Node suite in two, because Revision 1's criteria 2 and 3 could not fit its own
"≤ 4 minutes" target and would have added tens of minutes to `npm test`: on season-open "the same
reading made afresh" is the bare path - no reading at all, so the gate is the REAL gate, which plans
the migration before it looks at the approval (carryMigrationSettled, ledger.js:1723-1727; 457 s bare on
season-open) - and every afresh draw also gives up v196's memo, so it costs MORE than v204 («דוחות» 40 s,
the workbook 122 s, the payslips 114 s and 143 s at load 7-15). reports.speed alone took 341 s on
prototype C (`clone/suites-protoC.txt`) and 170 s at load about 5 in the critic's run; seeding
season-closed took 76.5 s (`gen-closed.out`). So:

- `tests/speed.seed.mjs` - a helper, asserts nothing: `seasonDisk('open' | 'closed' | 'skipped', { men,
  days, today })` and `mediumDisk({ closes })` write the records through the harness and the app's own
  writers (assignPlace, markAbsent, setRimaCount, setYosefGevesCount, addAdvance; the device reopened so
  the boot mirror writes the ledger; the approval from `planCarryMigration` asked INSIDE `reportReadOnce`
  - 18 s instead of 457 s on season-open, the same plan, byte for byte, measured; closes through
  `closePeriodChanges` and `saveFinancialAction` inside `weeklyCloseOnce(…, { memo: false })`, as
  tests/reports.speed and the probe do), and hands back the disk (`device.dump()`); synthetic names
  only. NEW in Revision 2, **season-skipped**: season-closed's crew and closes, except that a third of the
  weekly men are handed an advance and then work NO day in the week before their last finished one,
  which is left open, while every other period is closed in order - so «סגירת שבוע» offers those men with
  that week closed first on a copy (weeklyCloseWithoutEmpties), as on the owner's own Thursdays. Its
  `given()`s: at least 4 men offered with `empties.length > 0` and at least 4 offered without (on
  season-open and season-closed there are none: `rev2/held.mjs`). The browser suite writes the same disks
  into localStorage before load.
- `tests/speed.test.mjs` (`test:speed`, in `npm test`): criteria 1, 3-12 and 19-21, and criterion 2's
  plan check on the medium season, DETERMINISTIC - no clock, no season-sized record - on reports.speed's
  eight seeded records, the two fixtures and the medium season. Its run time is measured on the first green commit and printed beside reports.speed's,
  measured right after it on the same machine; if it is longer, the medium season's v204 side moves to
  the season suite and the report says so. No target in minutes is fixed before it is measured.
- `tests/speed.season.test.mjs` (`test:speed-season`, in `test:all` and NOT in `npm test`; new in
  Revision 2): the three season records seeded once, criterion 2 and the Node clocks (13). Its run time
  is measured and reported.
- `tests/speed.browser.mjs` (`test:speed-browser`, in `test:all`): criteria 14-18. There is no new
  screen; the suite is there because the owner's phone is the clock that matters and Node is not it.

## Success criteria

New suites `tests/speed.test.mjs` (`test:speed`, appended to `test`), `tests/speed.season.test.mjs`
(`test:speed-season`) and `tests/speed.browser.mjs` (`test:speed-browser`), both appended to `test:all`;
the records come from a new helper `tests/speed.seed.mjs` (asserts nothing; in `HELPERS`,
tests/gate.integrity.test.mjs:36-42). v204's files are read out of Git as reports.speed reads v195's
(`git show 6ab193d:<file>`, reports.speed.test.mjs:57-77): `js/ui/reports.js`, `js/ui/owes.js` and (Revision 2)
`js/ui/advancereset.js` from 6ab193d beside this branch's, every other file the same bytes on both sides
(the suite checks that).

Node, `npm test` (tests/speed.test.mjs):

1. **v204's bytes, cold AND warm.** On (a) reports.speed's eight seeded records (`seeded`,
   reports.speed.test.mjs:148-213, copied: both cycles, closes whole/half/empty, repayments, men who
   stopped, a man with no rate), (b) two fixtures - an over-settled advance (v201) and a close refused out
   of order (v198) - and (c) the medium season (15 men × 26 weeks, with and without closes), under the
   THREE readings of the gate (shut; open and approved; open and nobody approved): every node of «דוחות» on
   both sections over the seven ranges (reports.speed.test.mjs:325-333), the pay rows, the workbook's
   sheets, every man's statement, his days, his closing box; «מקדמות», each man's page, «סגירות שנרשמו» and
   each close's page; `owesRead` and `owesReadNow`; «סגירת שבוע»'s list (JSON) and the reminder's count;
   every worker card; the payslips of both periods; the month's summary of two months; «איפוס מקדמות»'s
   reading and (Revision 2) its step 3 - the board `advanceResetAfter` reads after a real
   `advanceResetWrite`, as the result's `owing` names - are the same bytes as v204's files produce on the
   same disk (nodes snapped as reports.speed snaps them, :215-230). Revision 2: the whole list of ways in
   is run TWICE in sequence on one device with the record unmoved, and each way in twice in a row, so
   that every reading after the first is answered from what earlier readings kept (S3, S4) and is
   compared, not only the cold ones.
2. *(tests/speed.season.test.mjs, `test:all`)* **The season records too**, under the approved reading.
   Season-closed: every reading of 1 against v204 (v204's times printed). Season-open: every reading of 1
   against v204 - «דוחות» once (one draw builds both sections, ~40 s on v204), every man's statement (the
   payslips' text, workerStatementText byte for byte), the cards, days and closing boxes of two weekly and
   two fortnightly men - EXCEPT the workbook and the payslips of both periods (v204: 122 s, 114 s, 143 s),
   which are compared against this build with `REPORT_SHARED_KEPT = null` before each (S1 on, S3 and S4
   cold), cold against warm. Season-skipped: «סגירת שבוע»'s list, the reminder's count, «מקדמות» and the
   cards of the men offered with empties, against v204, each cold and then unmoved. NO "afresh" side on
   a season record (above). The gate's own plan: `planCarryMigration` asked inside a reading equals the
   bare plan, JSON for JSON, on the medium season (in `npm test`) and on season-closed (here) - the seed
   helper relies on it for season-open, where the bare plan takes minutes.
3. **Fresh after every kind of write.** On the medium season, after each of: a day typed; an absence;
   a Rima and a יוסף גבס count; an advance (`recordNewAdvance`); a repayment; a reversal
   (`recordEventReversed`); a close (`closePeriodChanges` through `saveFinancialAction`); «סגירת שבוע»'s
   pass (`weeklyCloseWrite`); «איפוס מקדמות» (`advanceResetWrite`); a rate and a pay cycle changed
   (`State.commitRoster`); a man archived; the approval removed and restored in memory; a change in memory
   no write carried (tick unmoved); a refused commit rolled back (`State.rollback`); a snapshot adopted
   from a second harness device; ↶ of a day; the day turning (`device.setToday`); and (Revision 2) a
   write of a snapshot key that moves `Store.tick` and not the record (a `farkad:prov:sent:…` key, as a
   send leaves it) - every way in equals (a) the same way in drawn afresh (`REPORT_ONCE = { schedule:
   State.schedule }` before it, as reports.speed.test.mjs:669-670 does, the gate answered once per record
   text, :315-324) and (b) v204's.
4. **S3 and S4 keep nothing stale and keep what they may.** The real functions counted from before the
   first reading (8). A way in repeated on an unmoved record asks the real `advanceWalk`,
   `advancePositionInto`, `ledgerEntries`, `foldLedger`, `advanceHistory`, `overpaidAdvances` and
   `advanceOutstanding` of `State.schedule` ZERO times, and the real `payrollReport` only for ranges the
   reading asked BEFORE its first question of those seven (at most 1 on every way in measured on
   prototype D - `rev2/counts-d.mjs`: «דוחות» 1, «מקדמות» 0, «סגירת שבוע» 1, the reminder 1, «איפוס» 0, the
   card 1, the payslips 1) - and draws the same bytes; a way in that asks none of the seven («סיכום חודש»)
   asks exactly what v204 asks and computes no key. After any write of 3 except the tick-only write, and
   after a change in memory with no write, the next reading calls them again (≥ 1) and equals afresh; after
   the tick-only write it calls them ZERO times (S3 holds no tick); a new schedule object with the same
   text (`State.load`) is not handed the old object's answers. The same zeros on season-skipped for
   «סגירת שבוע»'s list and the reminder's count (in the season suite), where the copies' own walks remain
   and are counted apart (`critic/p1.out`: 32 for 4 men).
5. **Scope hygiene.** After every way in; after a reader that throws inside a reading (as
   reports.speed.test.mjs:610-619 plants one); and (Revision 2) with `todayStr` planted to throw, and with
   a `reportSharedKey` planted to throw, at the first S1 question and again at the close: every function
   of S1's table, `appendLedgerEntry` and v196's three are the real ones again, `REPORT_ONCE` is null, no
   memo was kept from a reading whose key failed, and each way in has the outcome v204 has under the same
   plant (the same bytes, or the same throw).
6. **Another record is never answered from memory.** Inside a reading, every function of S1's table and
   `payrollReport`, asked twice of another schedule object (a JSON copy of the record, and a shallow copy
   with a ledger map of its own - weeklyCloseWithoutEmpties's shape, weeklyclose.js:415-417), is answered
   by the real function both times - counted: two real calls - with answers equal to the real function's,
   and, where the answer is an object, two different objects (Revision 2: `advancePositionInto` answers a
   number, so for it the two real calls are the check) - reports.speed.test.mjs:620-631 extended.
7. **An absent reader stays absent - cold and warm.** Cold (`REPORT_SHARED_KEPT = null`): with
   `advanceHistory`, then `foldLedger`, then `ledgerEntries` set to `undefined` before a way in, it is still
   `undefined` inside the reading (spied from inside) and the draw equals v204's with the same reader
   removed. Warm (Revision 2): after a reading with every reader present, the same reader removed with the
   record unmoved - the kept memo is REFUSED (the draw equals v204's without the reader; on the critic's
   fixture openAdvanceBalance is 3,000, not the kept 2,000, `critic/p2-readerset.mjs`) - and then put back,
   when the memo kept without it is refused in its turn (2,000 again, `rev2/p6-putback.mjs`). tests/smoke.mjs:7071's
   case («without the reader the modal still opens, the fold simply absent») held in Node, both ways.
8. **The counts (deterministic budgets), for EVERY way in** (Revision 2: Revision 1 required them for
   one draw). The real functions wrapped BEFORE any reading opens (the `COUNTER` pattern,
   reports.speed.test.mjs:510-524), per reading, on the medium season in `npm test` and on season-open in
   the season suite: `ledgerEntries` and `foldLedger` of `State.schedule` at most once per state of the
   record; `advanceWalk` at most once per (man, from, to, carriedIn); `advancePositionInto` at most once
   per (man, from); `overpaidAdvances` at most once per man; `advanceOutstanding` at most once per advance;
   `payrollReport` at most once per range; `reportSharedKey` at most twice, and zero for a way in that asks
   none of the seven; v204's counts printed beside. Measured for ONE draw of «דוחות» ← «לפי עובד» on
   season-closed (`counts.mjs`), v204 → prototype C: `ledgerEntries` 3,202 → 1, `foldLedger` 1,788 → 1,
   `advanceHistory` 1,413 → 0, `advanceOutstanding` 1,413 → 141 (one per advance), `overpaidAdvances` 335 → 40
   (one per man), `advanceWalk` 316 → 277 (each distinct once), `advancePositionInto` 47 → 47,
   `payrollReport` 18 → 18. Required besides: v204's `ledgerEntries` count ≥ 50x this build's on that
   draw. After the merge the integrator adds wave 1's ways in (paydayFacts, statusMoneyFacts,
   yearSummaryFacts) to the list - the counts, not the clocks, are what catch S1 gone missing.
9. **Appends: a copy keeps, the record forgets** (Revision 2 rewrites it). Inside a reading, test stubs
   that append through `appendLedgerEntry` (a) to a shallow copy with a ledger object and a ledger map of
   its own (weeklyCloseWithoutEmpties's shape): every later answer for `State.schedule` is still a memo
   answer (counted: zero real calls) and the reading is kept; (b) to a copy that shares the record's
   ledger map, (c) to a copy that shares its ledger object, (d) to `State.schedule` itself, (e) one that
   throws: every later answer of that reading is the real function's and nothing of the reading is kept.
   And the real thing: on season-skipped, one «סגירת שבוע» reading folds the record's ledger once and is
   kept (prototype C: 5 folds, nothing kept, `critic/p1.out`).
10. **No write inside a way in.** `State.commit`, `commitMany`, `commitRoster`, `appendLedgerEntry` on
    `State.schedule`, `Store.set`/`setVerified`/`remove`: 0 calls during every way in (spies) -
    «איפוס מקדמות»'s step 3 measured after its write, on its own - and the whole disk (`device.dump()`)
    byte for byte across all of them.
11. **The source.** No file of `js/model/`, `js/sync/`, `js/state.js`, `js/store.js`, `js/recovery.js`
    differs from 6ab193d (`git diff --quiet 6ab193d -- …`); `currentAdvances(` has no caller in `js/`
    (grep: only its definition), so a shared fold is written by nobody; each S1 wrapper in reports.js
    tests `asked !== schedule` first; `js/ui/weeklyclose.js` is 6ab193d's. Revision 2: the kept key is
    `reportSharedKey`, whose body names no `Store` and no `tick`, and `reportGateKey`'s body is 6ab193d's;
    `REPORT_SHARED_DEPENDS` holds S1's seven, `appendLedgerEntry`, v196's three and EVERY name that
    `grep -ohE "typeof [A-Za-z_]+ [!=]==? 'function'" js/model/` finds (a name added to the model's
    feature detection fails this until it is added); js/model/ names no `Store.`, `localStorage`,
    `FarkadSync`, `Date.now(`, `new Date(` or `todayStr(` (what makes the tick-free key sound); and
    `js/ui/advancereset.js` differs from 6ab193d's in exactly the one line of `advanceResetAfter`.
12. **The gate as before.** At most one question per reading and none on an approved record, for every
    way in including S2's after-paint `owesReadNow` and «איפוס מקדמות»'s step 3 (reports.speed's rule,
    counted the same way).
13. *(tests/speed.season.test.mjs)* **The clocks.** The Node rows of the budget, both trees in one
    process, interleaved, medians of 3, printed with v204's.

Node, `npm test` (tests/speed.test.mjs), new in Revision 2 - numbered after the browser's 14-18 so that
Revision 1's numbers keep their meaning:

19. *(Revision 2)* **S4's copies.** Inside a reading that adopted a kept sheet, a test stub writes into a
    row it was handed (`row.amount = -1`, a field added) - within that reading the next asker sees the
    reading's copy as v196 would; the next reading of the unmoved record is handed rows equal, JSON for
    JSON, to the real function's, and its draw equals v204's. Two asks of one range in one reading are the
    same array (v196's rule, reports.speed.test.mjs:627); asks in two readings are two arrays.
20. *(Revision 2)* **Rows are flat.** Every field of every row of every pay sheet the seeded records and the
    medium season produce is a string, number, boolean, null or undefined - the property S4's shallow
    copy relies on, pinned.
21. *(Revision 2)* **One memo, dropped when it cannot serve.** After a reading on another schedule object
    (`State.load`), with another key (the record moved) or with other readers, `REPORT_SHARED_KEPT` is
    replaced or null by the end of that reading's first S1 question - never left holding a record that can
    no longer be served.

Browser (tests/speed.browser.mjs; Chromium, touch, DPR 2, CPU 4x, `serviceWorkers: 'block'`, the
season disks generated in Node by tests/speed.seed.mjs and written into localStorage before load):

14. The browser rows of the budget, in the order the budget lists them, EACH IN A FRESH PAGE unless the
    row says otherwise (Revision 2: a cold JIT, as after a launch on the phone), each the longest task
    measured by a `longtask` PerformanceObserver around the app's own calls (`showView`, `render`,
    `openWorkerSettlement`, `openWorkerCard`, `openPayslips`, `openMonthSummary`, `openWeeklyClose`), on
    this build and on 6ab193d's tree served beside, alternating, printed side by side.
15. **The same DOM.** On season-closed: `#reportsView` (both sections), `#advancesView` (board, a man's
    page, «סגירות שנרשמו»), the closing box and a man's days (`#workerDaysBody`), the worker card's
    and the payslips' dialog bodies - `innerHTML` equal to the same draw made afresh in the page, AND
    drawn a second time on the unmoved record; and «דוחות» (both sections) equal to v204's tree
    (`git archive 6ab193d` into a temp dir, served beside).
16. **The same picture.** `sharePrintout('report')` through a recorder: the same PNG bytes drawn shared
    and drawn afresh.
17. **The day screen.** On the day screen, Thursday 2026-11-19: one write through the app's writer; the
    close reminder's reading after its quiet (`CLOSE_REMINDER_QUIET_MS`, closereminder.js:94) - a spy on
    `weeklyCloseRead` proves it ran, exactly once - within budget; its line's count equal to a fresh
    `closeReminderReadCount`; then «סגירת שבוע» opened from the line, the record unmoved, within its row.
18. Nothing written by any reading (`censusOnly`, tests/census.mjs) - the budget's row 11 writes its one
    provenance key itself, before the redraw, and the census starts after it; no uncaught error.

## Existing suites touched

- **tests/owes.test.mjs:1012-1019, ONE check's set-up, deliberately.** «"דוחות" with the row at its head
  asks exactly what "דוחות" asks without it» compares two draws in a row. Under S3 the first draw is the
  first reading of the pay sheet's ranges after «מקדמות» and the second finds them kept, so the counts
  differ by the warm-up and not by the row (measured on prototype C: `[0,0,37,15] !== [0,0,3,15]`; on
  prototype D `[0,0,2,15] !== [0,0,1,15]`, the one sheet each draw asks before its first S1 question). Each
  of the two draws now starts with `REPORT_SHARED_KEPT = null`, so it is again one draw against the
  other; the check's words and expectation are unchanged. The commit says why.
- Nothing else moves. Revision 2: what must stay green is ALL of `npm test` and ALL of `npm run test:all`
  on the final commit, run one suite at a time (CLAUDE.md: "anything less than every check passing is a
  stop") - not a list picked by hand. Revision 1's list left out browser suites that draw «דוחות» or
  «מקדמות»: reportsclarity-browser, reportnames-browser, rima-browser, yosefgeves-browser,
  simple-advances-browser and navigation-browser (all in `test:all`). (The critic also named
  auditfix-browser: it draws neither page - no renderReports, renderAdvances, reportSheets, openWorkerDays
  or showView of either in its 301 lines - but it is in `test:all` and so is run with the rest.) Measured
  on prototype D in a scratch clone of 6ab193d, one at a time (`rev2/suites-D.txt`): see «Revision 2»,
  item 7.
- `tests/gate.integrity.test.mjs` HELPERS gains `'speed.seed.mjs'` (the rule at :36-42); `package.json`
  gains the three scripts; `tests/README.md` gains three rows and the helper's paragraph.
- Expected red on this branch, and only this: tests/build.test.mjs «the stamps were moved by the commit
  that moved the bytes» (and its sw.js line) and tests/gate.integrity.test.mjs §4 - reports.js, owes.js
  and advancereset.js are cached files and the integrator moves the stamps.

## Base

- `origin/main` = `6ab193d68c960e4a56d947673c282b867acd258f`; branch `feat-speed`; worktree
  `/home/user/farkad/.claude/worktrees/feat-speed` (`git worktree add -b feat-speed <path> 6ab193d…`);
  `npm ci` there.
- Browsers: `export PLAYWRIGHT_BROWSERS_PATH=/tmp/claude-0/-home-user-farkad/d6a64352-db1a-5c3b-b54d-5c09103f2419/scratchpad/pw1194`;
  never `playwright install`; no emulator suites. Commit after every step; never `--amend`; every commit
  ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and
  `Claude-Session: https://claude.ai/code/session_01AczE1SUjJY47GFH8eTREya`. No push, no PR.
- The reference is prototype D (`rev2/prototype-D.diff`), measured; it is a prototype - its flags
  `SPEED_SHARE` / `SPEED_SHEETS` are probe seams and do not ship.
- Order of work (Revision 2): S1 alone, with the append rule, criteria 1, 3, 5, 6, 8-12 green; then S2
  and the advancereset line; then S3 with criteria 4, 7 and 21 and the owes.test move; then S4 with
  criteria 19 and 20; then tests/speed.season.test.mjs; then the browser suite. A step whose bytes differ
  anywhere is not "optimised later": it is reverted.

## Files

This track changes, and only these:
- `js/ui/reports.js` - `reportReadOnce` (:111-150), the helpers directly above it (`REPORT_SHARED_READERS`,
  `REPORT_SHARED_DEPENDS`, `reportSharedKey`, the rows' copy, `reportShareLedger`), and `REPORT_SHARED_KEPT`
  beside `REPORT_GATE_KEPT` (:72). `reportGateKey` is NOT changed. The reading's comment block (:29-70)
  gains one paragraph saying what is shared, for whom, and the S3 key and its readers.
- `js/ui/owes.js` - `owesReadNow` (:663-670), three lines.
- `js/ui/advancereset.js` - Revision 2: the one line of `advanceResetAfter` (:781) through `owesReadNow()`.
- `tests/owes.test.mjs` - the one set-up above (:1012-1019).
- New: `tests/speed.test.mjs`, `tests/speed.season.test.mjs`, `tests/speed.browser.mjs`, `tests/speed.seed.mjs`.
- Shared, additive: `package.json`, `tests/README.md`, `tests/gate.integrity.test.mjs` (HELPERS).
- NOT: `index.html`, `sw.js` SHELL, `css/*`, `tests/screens.mjs` - no file is added to the shell and there
  is no screen.

MUST NOT be touched: `js/model/**`, `js/sync/**`, `js/state.js`, `js/store.js`, `js/recovery.js`,
`firestore.rules`, `functions/**`, `firebase.json`, `.github/**`; the three stamps (index.html:108,
js/app.js:7, sw.js:24); `docs/releases.md`, `CLAUDE.md`, `js/ui/whatsnew.js`, `js/ui/offline.js`;
`js/ui/weeklyclose.js`; `tests/reports.speed.test.mjs`; the wave-1 files (`js/ui/status.js`,
`js/ui/payday.js`, `js/ui/monthboard.js`, `js/ui/yearsummary.js`, `js/ui/week.js`, `js/ui/printout.js`,
`js/ui/monthsummary.js`, `js/ui/backup.js`, `js/app.js`, `js/ui/modal.js`) and their suites (the resets
named under "Conflicts with wave 1" are the integrator's, on the merged tree).

## «מה חדש» (for the integrator; PROPOSED)

Revision 2 replaces the item. `{ title: 'הדוחות והמקדמות נפתחים מהר יותר', text: 'עמוד הדוחות, עמוד המקדמות, כרטיס העובד והתלושים נפתחים מהר יותר גם כשיש הרבה עובדים ומקדמות, והמספרים עצמם לא השתנו.', where: 'דוחות ← לפי עובד, וגם מקדמות', go: 'payReport' }`
- Revision 1's title «דוחות ומקדמות מהירים יותר» read as faster ADVANCES - money handed over faster; its
  text made the advances themselves open («המקדמות ... נפתחים», no «עמוד»); it nearly repeated v196's
  item («דוחות נפתחים מהר יותר», whatsnew.js:132-135); and its `go: 'advances'` landed on «מקדמות» while
  the title and `where` led with «דוחות». Now the pages are named as pages, the text says what is new
  since v196 (the card, the payslips, "even with many workers and advances"), and `go: 'payReport'` - an
  existing key (`WHATSNEW_GO.payReport`, whatsnew.js:556-560: «דוחות» ← «לפי עובד», nothing pressed) -
  lands where `where` starts, as v196's own item does. `where` uses the existing «…, וגם …» form
  («מסך ההסעות ← דוח הסעות לתקופה, וגם דוחות ← הפקת דוח»). One sentence; no new word in the app; pinned
  word for word in tests/whatsnew.test.mjs by the integrator, and tests/whatsnew.browser.mjs's key list
  and landing rules do not move.

## Conflicts with wave 1, and how they resolve

Measured with `git diff --stat 6ab193d <branch>` on the four branches and release-v205, and with a
three-way `git merge-file` of owes.js:
- **js/ui/owes.js (payday).** Payday changes `renderOwesInto` (:680-688, the `owes-actions` row); speed
  changes `owesReadNow` (:663-670). Disjoint hunks with unchanged lines between: the three-way merge of
  6ab193d / feat-payday / prototype C is clean (exit 0, both hunks present, `mergetest/owes.merged.js`);
  prototype D's owes.js hunk is prototype C's.
- **js/ui/advancereset.js** (Revision 2): no wave-1 branch and not v205 touch it (`git diff --stat` empty).
- **tests/reports.speed.test.mjs (payday).** Speed does not edit it; prototype C passes it as it is on
  6ab193d (159/0), and payday's version with prototype C merged (167/0, the critic's run). After the merge
  it carries payday's `PAYDAY_ROW` and `paydayFacts` way in; S1-S4 lower the real calls it counts, and its
  pay-sheet count («a draw of «לפי עובד» ...: N pay sheets», :572-574) is taken on a MOVED record, where S4
  adopts nothing, so it holds; none of the bytes it compares change.
- **js/ui/reports.js, js/ui/weeklyclose.js, tests/owes.test.mjs**: no wave-1 branch and not v205 touch
  them (`git diff --stat` empty).
- **Readings of wave 1** (paydayFacts, statusMoneyFacts, yearSummaryFacts) open `reportReadOnce` and so get
  S1/S3/S4 with no line changed. Their counted rules hold: status's "exactly ONE owesRead and ZERO
  weeklyCloseRead" (S2 still calls `owesRead` once), payday's "inside weeklyCloseOnce equals bare" (a
  reading opened inside weeklyCloseOnce finds weeklyCloseOnce's wrappers among its readers, so it never
  adopts a memo kept outside it). paydayFacts reads «סגירת שבוע»'s list (payday.js:393-394), so it plans
  copies on season-skipped, and the append rule (S1) is what lets it keep.
- **Wave 1's suites reset every kept answer they know of, and not `REPORT_SHARED_KEPT`** (Revision 2).
  After the merge their timing rules would measure a warm reading as a cold one: with prototype C merged,
  payday's season B took 794, 301 and 295 ms, so its "median of 3" (P8, `timed()`) was a warm run
  against cold medians of 2,989-3,708 ms in payday's handoff (`critic/out2-payday.test.mjs.txt`). The
  integrator adds `if (typeof REPORT_SHARED_KEPT !== 'undefined') REPORT_SHARED_KEPT = null;` to:
  tests/payday.test.mjs's `fresh` (:142, run before each timed run); tests/statusscreen.test.mjs's
  "the board with nothing kept" reset (:1311); and tests/yearsummary.test.mjs's timed loop (:1393-1399,
  before each of the three runs - it resets nothing between them today; the reset at :1419 is another
  block's). Each timed run is then cold, as on v204, where every run was.
- **The comparison of «מקדמות» against v204 after the merge** (Revision 2 corrects it). Payday does not
  only add a node to the board: it moves «סגירת שבוע»'s button INTO its new row (feat-payday owes.js:682-688:
  `const row = payday ? el('div','owes-actions') : box; if (payday) { row.appendChild(payday); box.appendChild(row); } if (weekly) row.appendChild(weekly);`),
  while 6ab193d draws the button straight in the box (owes.js:682-683). Revision 1's rule - take the
  classes in the suite's `LATER_NODES` list (nodes later tracks add to a page this suite compares with
  v204), starting with `owes-actions`, out of the NOW side and count them - takes «סגירת שבוע»'s button out
  with the row, and v204's side still has it (`critic/p5.out`: false; unwrapped, true). The rule now: a
  `LATER_NODES` node (`owes-actions`) is REPLACED by its children that v204 also draws - `weekly-close-entry`
  stays, in place - and its own children that v204 does not draw (`payday-entry`) are taken out and
  COUNTED. Asserted: zero such rows on
  feat-speed; exactly one per draw of the board once payday.js is loaded. The integrator loads payday.js on
  BOTH sides (it is one of the "every other file the same bytes" - 6ab193d's owes.js never calls it, so
  v204's board is unchanged by it).
- **package.json** `test` and `test:all` are single lines every track appends to: the integrator
  concatenates. **tests/README.md**: rows, additive. **tests/gate.integrity.test.mjs** HELPERS: one name,
  additive.
- Merge order: v205, then wave 1, then speed; on the merged tree the integrator adds wave 1's ways in to
  criterion 8's list and re-runs, one by one: speed (all three suites), reports.speed, owes, payday,
  status and statusscreen, yearsummary, monthsummary, weeklyclose, closereminder and advancereset (Node
  and browser).

## Interfaces

Provided: nothing a caller calls. Every reading inside `reportReadOnce` shares S1, S3 and S4; a reading
added later gets them by opening `reportReadOnce` as v196's rule already requires. `REPORT_SHARED_KEPT`
(memory, reports.js) is reachable by suites, which clear it to compare cold against cold and before every
timed cold run; `reportSharedKey` and `REPORT_SHARED_DEPENDS` are reachable so criterion 11 can read them.
Consumed: the model functions of S1's table and `payrollReport`, by name, read-only; `todayStr` and
`FARKAD_FLAGS` for the key. No Store (`reportGateKey` and its `Store.tick` stay the gate's, unchanged).

## What it does NOT do

- It does not make the FIRST reading after a change cheaper than the model's walk: ~1.3 s Node, ~3.5 s at
  4x on season-open, dominated by `advancesFor` and `advanceLedgerSum` scanning the whole record per period
  and `payrollReport` per period (profile `prof3/`). After a change every man's periods since his first
  advance are walked once and each period's sheet priced once (74-77 sheets on season-open), however many
  readers ask - that is what is left of «סגירת שבוע»'s, the reminder's and «איפוס»'s cost (about 2x faster
  than v204, not more). Next lever: an index in js/model (owner's approval).
- It does not take the close reminder's reading off the main thread: after a write on a day a period ends
  it is still one task of 2.3-4.2 s at 4x on season-open (prototype C, quiet / load 15; v204 5.9-9.7 s),
  after 1.5 s of quiet and only when nobody is typing, exactly when v204 does it. Next lever: a classic
  Worker with `importScripts` of the model.
- It does not answer a copy of the record from memory: a man of «סגירת שבוע» whose earlier periods with no
  day of work are closed first on a copy is planned again at every reading (season-skipped; 32 walks for
  4 such men on the critic's probe, a few ms). Revision 1 put «סגירת שבוע»'s and «איפוס»'s remaining cost
  here: wrong - on both season records neither reads a copy.
- S3 and S4 do not survive a change of the record: a write, an adopted snapshot from another phone, ↶, the
  day turning - the first reading after any of them is the model's walk. One memo is kept at a time, for
  one schedule object; `closedPeriods` is not kept between readings (asked once per man a reading).
- It does not make a reading that is ALREADY cheap on v204 cheaper, and it costs such a reading its two
  key computations: on season-closed his statement and a man's page of «מקדמות» are about 10 ms slower
  in Node (37-40 → 48-53, 15-23 → 26-29 ms at load 4-5), more at 4x. Not taken: one key per reading, as
  owesReadNow keeps OWES_KEPT (owes.js:663-670: the key taken before the reading, never again) - the
  second computation is the only check that the record at the close is the record the answers were
  computed on, and it stays. A reading that asks none of S1's seven computes none (`rev2/counts-d.mjs`).
- It does not cover a suite that REPLACES a model function outside `REPORT_SHARED_DEPENDS` on a device
  that has already read: such a suite clears `REPORT_SHARED_KEPT`, as suites clear `OWES_KEPT` today (the
  app never replaces one).
- It does not touch the commit (229-571 ms per write at 4x), the boot (`State.load` → `impossibleClosures`,
  0.3-0.6 s Node), the gate's plan on a record nobody approved beyond what S1 shares with it (18 s instead of
  457 s on season-open, still long), or js/ui/weeklyclose.js's own scope.
- It keeps nothing on disk and nothing beyond the page's life; it adds no screen, string, key or writer.
- It was not tried on a real phone; the 4x CPU throttle in Chromium stands in for one, now in fresh pages.

## The report

Branch and final commit; the diff of reports.js, owes.js and advancereset.js; `npm test` and
`npm run test:all` IN FULL on the final commit from one clean detached worktree, every suite's exit code
and counts one by one, the two gates reported apart, and the expected red named (Revision 2: not a list
of suites picked by hand); the run times of tests/speed.test.mjs (beside reports.speed's, measured right
after it) and tests/speed.season.test.mjs; the budget tables as measured on that commit (Node and 4x
Chromium, both trees side by side, with the load average at the time); the v204 / this-build counts of
criterion 8 for every way in; the owes.test.mjs move and its reason; the release-entry text and the
CLAUDE.md file-list amendment for the integrator (the reports.js line gains: "v206: the ledger's folds,
each man's walk and each range's pay sheet once per reading, kept under the record and its readers
between readings"); the wave-1 resets the integrator must add; what was not verified.

## Revision 2

2026-11-19, after an adversarial review of Revision 1 (twelve findings, five major). Each was checked
against the code on 6ab193d (and feat-payday, feat-status, feat-yearsummary where it named them), and
the critic's probes were re-run here. All twelve are right in substance; four carry a detail that is
not, each said in one line where it is (items 2, 6, 10 and 12). The
design moved from prototype C to prototype D (`rev2/prototype-D.diff`), which was built and measured
in this revision. In the critic's order:

1. **Appends to copies inside a reading (major) - RIGHT.** weeklyclose.js:493-504 → weeklyCloseWithoutEmpties
   :413-422 → closePeriodChanges(copy) → appendLedgerEntry(copy), which writes only into the copy's own map
   (ledger.js:694-697); prototype C's wrapper counted every append; `critic/p1.out` reproduced (5 folds of
   the record, nothing kept). Changed: S1's append rule (only an append that can reach the record's own
   ledger object or map forgets; checked before and after; a throw forgets); Revision 1's sentence
   "nothing appends inside a reading today" struck and the evidence put in its place; criterion 9
   rewritten (a copy keeps, five cases that forget); the new season-skipped record in tests/speed.seed.mjs,
   with criterion 2, criterion 4's zeros and a budget row on it. Prototype D: 1 fold, kept, 0 walks of the
   record on the unmoved reading.
2. **Ceilings that do not catch v204 (major) - RIGHT, one detail not.** Re-measured back to back at load 2.5-3.6: v204 itself
   passes four of Revision 1's Node ceilings (1,852 / 2,036 / 1,904 / 1,354 ms against 3,500 / 3,500 /
   3,000 / 1,500), «סגירות שנרשמו» had a 24% margin, «סיכום חודש» 9x; the factors for the three readings were
   about 2x, not 3-5x; the browser «מקדמות» row was measured warm (bprobe.mjs runs it after «דוחות»).
   Changed: the Goal's factors; the whole budget - fractions of v204's time taken in the same process,
   interleaved, medians of 3, and in fresh pages of both trees in one browser (two trees cannot share one
   page, so "the same browser page" became "fresh pages, alternating"); absolute ceilings only where v204
   takes minutes, at least 3.5x below it; «סיכום חודש» and the gates-shut draw held to v204's own time plus
   a little; criterion 8's count rules required for EVERY way in, wave 1's added after the merge;
   criterion 14: fresh pages, in a stated order.
3. **The kept memo outlives a reader taken away (major) - RIGHT, and the fix widened.** ledger.js:264,
   schema.js:2444, schema.js:2325; `critic/p2.out` reproduced (2,000 where v204 gives 3,000). Changed: S3
   compares the identity of every function in `REPORT_SHARED_DEPENDS` - the critic's list (S1's seven,
   closedPeriods, payrollReport) plus appendLedgerEntry, carryReportingEnabled and every name js/model/
   feature-detects, which criterion 11 pins against the grep - by `===` rather than `typeof`, so a
   replaced reader is caught as well as a missing one; criterion 7 warm (refused once removed, refused
   again once put back) and cold; the convention for suites that replace other model functions said.
   Prototype D: 3,000 with the reader removed, 2,000 once it is back (`rev2/p6-putback.mjs`).
4. **Criteria 2 and 3 do not fit the run time (major) - RIGHT.** The afresh side is the bare path, whose
   gate plans the migration before it reads the approval (ledger.js:1723-1727: 457 s on season-open), and
   it gives up v196's memo, so it is slower than v204; reports.speed alone ran 341 s on prototype C; seeding
   season-closed 76.5 s. Changed: tests/speed.test.mjs (`npm test`) is deterministic, with no clock and no
   season-sized record; the new tests/speed.season.test.mjs (`test:all` only) holds criterion 2 and the
   clocks; no afresh side on a season record - season-open is compared against v204 except the workbook
   and the payslips (against this build with S3/S4 cold), whose parts («דוחות», every statement) are against
   v204; the medium season keeps afresh and v204 (criterion 3); run times measured before any target is set.
5. **Payday's row and LATER_NODES (major) - RIGHT.** feat-payday owes.js:682-688 puts «סגירת שבוע»'s button
   INTO `owes-actions`; 6ab193d draws it in the box (:682-683); `critic/p5.out`. Changed: a later row is
   replaced by its children v204 also draws (`weekly-close-entry` kept in place), the rest (`payday-entry`)
   taken out and counted; asserted 0 rows on feat-speed and exactly 1 per draw of the board with payday.js
   loaded; payday.js loaded on both sides, said in the conflicts section.
6. **Wave 1's suites do not reset REPORT_SHARED_KEPT (minor) - RIGHT, one detail not.** payday.test.mjs:142 (`fresh`, and
   P8's median of 3: a warm run after the merge), statusscreen.test.mjs:1311, yearsummary.test.mjs's timed
   loop :1393-1399. Changed: the three files and the one line the integrator adds are named under
   "Conflicts with wave 1". (A detail of the finding is loose: yearsummary's timed loop resets nothing
   between its runs; the reset at :1419 belongs to another block - the line goes before each run.)
7. **The remainder blamed on copies (minor) - RIGHT.** `critic/p3.out`; advancereset.js:168-249 builds no
   copy; `rev2/held.mjs`: no man with an empty period to close first on either season record. Changed:
   the Goal, Out of scope and "What it does NOT do" now say what remains - the model's walk after a change,
   and on an unmoved record (Revision 1) the 74-75 pay sheets S3 did not keep. And the critic's first
   option is taken: **S4** keeps each range's pay sheet under S3's key and readers, handed to each new
   reading as fresh copies of pristine rows (rows are flat: criterion 20), adopted only after the reading's
   first S1 question so a reading of sheets alone («סיכום חודש») pays no key; criteria 19-21. Prototype D,
   unmoved: «סגירת שבוע» 86 ms, the reminder's count 79, «איפוס» 126 (C: 377-585). Existing Node suites run
   on prototype D, one at a time, in a scratch clone of 6ab193d (`rev2/suites-D.txt`, load 6-10): owes
   189/1 (the one check this contract moves: `[0,0,2,15] !== [0,0,1,15]`), advancereset 77/0, weeklyclose
   146/0, closereminder 107/0, approval 72/0, workercard 180/0, payslips 202/0, overpaidfix 85/0, closeorder
   22/0, wording 37/0, repayment 240/0, account-view 456/0, monthsummary 98/0, reports.speed 159/0 (185 s at load 4.4: the 3,276 v195 readings, the other-schedule rule, freshness after every kind of write).
8. **The write tick in S3's key (minor) - RIGHT.** store.js:181-199, recovery.js:554-562, sync.js:743-766; and
   js/model reads no Store, no clock and nothing of the sync (grep), so the answers are pure in the record,
   today, the flags and the readers. Changed: S3's key is the new `reportSharedKey` (no tick); reportGateKey
   unchanged, for the gate; criterion 3 gains a tick-only write (and criterion 4 its zeros), the browser
   budget its row 11, Goal 6 the synced phone. Prototype D: the tick moved 9 → 10, the record unmoved, 0
   real calls (C and v204: 1).
9. **Where the key is computed (minor) - RIGHT.** prototype-C.diff computed it before the `try` and again
   at the close before v196's three were put back, and for readings that ask nothing. Changed: the key is
   asked lazily, inside the `try`, at the first S1 question; the close puts everything back first and keeps
   inside its own try/catch; a key that throws means no S3 for that reading; at most two keys per reading
   that asks a kept function and none otherwise (Revision 1's "at most once" was not what its prototype
   did); a memo that cannot serve is dropped at once (criterion 21, memory); criterion 5 plants a throwing
   todayStr and a throwing key. Prototype D: «סיכום חודש» computes no key (28-33 ms, v204 46); «דוחות» with both
   gates shut 90-95 ms against v204's 171-183; the two keys cost a reading that is cheap on v204 about
   10 ms on season-closed (his statement, a man's page), said under "What it does NOT do".
10. **«איפוס מקדמות»'s step 3 reads the board bare (minor) - RIGHT, one sentence of it not.** advancereset.js:781.
    Changed: the line goes through `owesReadNow()`; S2's "the one road" became two; advancereset.js joined
    Files, the v204 side of the suites, criteria 1, 10, 11 and 12 and the budget. Not so: "the render()
    before it draws «מקדמות» inside a reading" - render() draws the view behind ⋯, «מקדמות» only when it is
    that view; the change is right either way (said in S2). advancereset 77/0 on prototype D.
11. **«מה חדש» (minor) - RIGHT.** Revision 1's title read as faster advances, its text made the advances
    themselves open, it nearly repeated v196's item and its `go` did not land where its `where` began. The
    critic's item is taken word for word, with `go: 'payReport'` (whatsnew.js:556-560).
12. **The report and criterion 6 (minor) - RIGHT, but for one name.** The report now runs `npm test` and
    `npm run test:all` in full, one suite at a time; criterion 6 counts two real calls, because
    advancePositionInto answers a number. WRONG in part: tests/auditfix.browser.mjs draws neither
    «דוחות» nor «מקדמות» (no renderReports, renderAdvances, reportSheets, openWorkerDays or showView of
    either in its 301 lines); it is run anyway, as part of `test:all`.

NOT verified in this revision, and said: prototype D was not run in Chromium (the browser budget's
fractions rest on v204's and prototype C's fresh-page numbers, `critic/browser-*.jsonl`); the medium and
season-skipped records are specified, not yet built (the critic's p1 probe stands in for season-skipped);
prototype D was not merged with wave 1 (the critic's merged runs were with prototype C); tests/smoke.mjs
was not re-run on prototype D (its :7071 case is held in Node by `rev2/p6-putback.mjs` and criterion 7).
