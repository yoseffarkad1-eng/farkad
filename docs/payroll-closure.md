# Worker accounts, closure and payment — the design as built (Phases 0 and 1)

Status: **the pure model and its suite, and nothing else.** `js/model/payroll.js` is not
loaded by `index.html`, is not in the service worker's shell, and no build stamp moved for
it. Nothing here can reach a phone. There is no screen, no storage, no sync and no rule for
any of it yet; each of those is a later phase, listed in [What later phases must
add](#what-later-phases-must-add).

Built on `bd59a68` (v169). The specification was the audit and design written against
`b640c5a`; where the code disagreed with either, the code won, and every such place is in
[Where the audit and the design were wrong](#where-the-audit-and-the-design-were-wrong).

    node tests/payroll.test.mjs       # the suite; also the last step of `npm test`

## The owner's rules, and where each one lives

| rule | where |
|---|---|
| One wage calculator | No wage is computed in `payroll.js`. Every figure is `payrollReport`'s row over a period `periodRangeFor` names (`paybookPeriodWage`); a closed period is the artifact `payrollReport` already reads. |
| A weekly man's running account is his open week only | `accountFor(...).running` is the wage of **his own** current period, and 0 once that period is closed. |
| Earlier unclosed periods apart | `accountFor(...).pending` — one row each, never added to `running` or to each other (default 2). |
| Unpaid wage from an earlier closure is its own balance | `accountFor(...).wageDue` and `.unpaid` — «יתרת שכר לתשלום». |
| Advance debt and wage owed: two balances, never netted | `.debt` and `.wageDue` are two fields. No field holds their difference, and the suite checks that none does. |
| The person chooses per advance | `planClosure(..., { allocations: { advanceId: amount } })`. An advance with no answer is a missing answer (`allocation-missing`), not a zero. |
| Never more than is left; never twice | `over-advance`; deterministic ids; `closed` / `statement`; a statement naming one advance twice is refused by its validator. |
| A new advance is never a wage payment | Nothing reads an advance when folding what was paid. Pinned: 1,000 handed over as an advance leaves 3,700 of wage owed and unpaid. |
| Closure never erases debt | What is left stays on the advance (`advanceOutstanding`) and opens the next account (`advanceCarryInto`). |
| Extra deductions | Their own entry kind (`deduction`): amount, reason, date, worker, statement. Never touch an advance. |
| Closure and payment are two facts | `statement` and `payment` are two entries. A payment never edits a statement. |
| Reset deletes nothing; corrections are linked | Append-only; `void` (`pv_<target>`) and `adjustment` (`pa_<statement>_<n>`) stand beside what they correct, reason mandatory. An advance deduction is undone through the ledger's existing `recordEventReversed`, which the fold reads. |
| No destructive migration; ambiguous history to a review list | `planPayMigration` writes nothing. Older closures are `paymentUnknown` until a person answers for one (`planLegacy`). |

## The eight defaults

All in one frozen object at the top of the file, `PAYBOOK_RULES`. Each is one line; the
suite loads the file with each line flipped and shows the behaviour follows.

| # | constant | default | flipped |
|---|---|---|---|
| 1 | `legacyReportFollowsAccounts` | `false` — the weekly-only-open-week rule applies to the new accounts functions; «לפי עובד» is unchanged | **Read by nothing in this phase.** It is the name of the decision; the reports change (Phase 2) reads it. The present behaviour of that report is pinned in Phase 0 of the suite: 3,800. |
| 2 | `earlierUnclosedSummed` | `false` — listed apart as waiting | `running` becomes the sum (the 3,800 again) |
| 3 | `closeWithNothingPaid` | `true` | a closure that names no payment is refused: `unpaid` |
| 4 | `closeBeforeLastDay` | `false` | no `early` refusal |
| 5 | `deductionsMayExceedWage` | `false` — capped, the debt carries | the net may go below zero |
| 6 | `offerLaterDatedAdvances` | `false` — shown, not offered | offered — but **not one line**: `advanceWalk` counts a period from what is dated inside it, so the plan is then refused with `deduction` until `js/model/schema.js` learns the same rule |
| 7 | `trackingFromActivationPeriod` | `true` — tracking starts at each man's period containing the activation day | all history is tracked and no activation is needed |
| 8 | `whoMayClose` | `null` — every account on the allowlist | a list of signers; others get `permission` (client only — a server role is a rules change) |
| + | `unlistedAdvanceMeansZero` | `false` | an advance the person did not answer for is deducted 0. Not one of the eight; it differs from the design note, so it has a name. |

## Data model

A closure stays what it is today. The artifact `ledger.advances.le_period_<worker>_<from>`
and one `ledger.advances.le_close_<advance>_<from>` per advance touched are built by the
existing writers (`recordPeriodArtifact`, `recordPeriodClosed`) on a **copy** of the
schedule. For an oldest-first split the ledger half of a plan is byte for byte what
`closePeriodChanges` writes today (pinned), and today's journal, validators and a reopen
accept a per-advance split (pinned, through `State.commitMany`).

Everything new is one append-only map at the top of the document, one field path per entry:

    schedule.pay = { "<id>": entry }          path: pay.<id>

Common fields: `id`, `kind`, `date` (local day), `at` (ISO moment), `by` (signer), optional
`rev`. Every kind but `opening` carries `workerId`. A field not on the kind's list refuses
the entry — the bar is "this build could have written it".

| kind | id | fields beyond the common ones |
|---|---|---|
| `statement` | `ps_<worker>_<YYYYMMDD from>` | `cycle`, `transition`, `periodFrom`, `periodTo`, `date` = `periodTo`, `artifactId`, `gross` (copied from the artifact), `advanceDeductions [{advanceId, entryId, amount, before, after}]`, `advanceDeducted`, `extraIds`, `extraDeducted`, `netDue`, `wageDueBefore` (information), `debtAfter` (= the artifact's `balanceAfter`), `note?` |
| `deduction` | `pd_<worker>_<YYYYMMDD from>_<n>` | `statementId`, `amount` > 0, `category` (`agreed` / `settlement` / `other`), `reason` (mandatory) |
| `payment` | `pp_<statementId>` for the payment made at the closing; `pp_<random>` for every later one | `statementId` (a statement, or a legacy answer that said "owed"), `amount` > 0, `method?` (`cash` / `transfer`; absent is absent), `note?` |
| `void` | `pv_<targetId>` | `targetId`, `targetKind` (`payment` / `deduction`), `statementId`, `amount` ≤ the target's, `reason` (mandatory) |
| `adjustment` | `pa_<statementId>_<n>` | `statementId`, `delta` (signed, non-zero), `reason` (mandatory) |
| `opening` | `po_open` | `date` — the activation day |
| `legacy` | `pl_<artifactId>` | `artifactId`, `state` (`paid` / `due`), `due` (only when owed; ≤ that closure's net), `note?` |

Amounts are JSON numbers, finite, never negative, at most `ADVANCE_MAX`, and a whole number
of agorot (the same 1e-6 tolerance `advanceAmountProblems` uses). Nothing is coerced:
`"500"` is refused. Every id passes `isSafeId` — `__proto__`, `constructor`, `prototype`,
dots and Firestore's metacharacters are refused before anything is keyed on them.

**Ids are the idempotency keys.** A statement's id is its man and its period's first day,
exactly as the artifact's is, so two phones closing one account write one path. The
payment made at the closing is derived from the statement for the same reason: with a
random id, two phones each closing with «שולם הכול» would record one envelope twice. A
later payment's id is minted by `newPaymentId()` when the form opens, so a double tap, a
retry and a reload carry one id.

**Same fact, or a disagreement.** `paybookSameFact` compares two bodies under one id
without `at`, `by`, `rev` and `wageDueBefore`. Equal: one fact, the first writer stands.
Different: the first still stands and the other is kept under `payConflicted[<id>]` for a
person. Nothing is merged and nothing is chosen between.

## The folds

`paybookFold(schedule)` reads the map once, independent of arrival order:

- entries that fail `payEntryProblems` are **held** (id + reason), never dropped;
- a statement is judged against the record (`paybookStatementProblems`): its artifact is
  there with the same period and gross, each advance deduction is on the ledger with the
  same amount, the ledger holds no deduction for that period the statement omits, every
  extra it names exists and they add up. A statement that fails is held, not folded;
- a deduction no standing statement names, a payment or adjustment whose statement is not
  standing, and a void of nothing are held — a payment that arrived before its statement
  waits there and folds when the statement lands;
- per statement: `owed = netDue + adjustments + voided extra deductions + advance
  deductions reversed in the ledger`; `paid = payments − voided payments`;
  `due = max(0, owed − paid)`; `overpaid = max(0, paid − owed)`. A surplus is **named**,
  never moved into the next wage or an advance.

Statement status, one rule: `review` (overpaid) → `paid` (paid > 0, due 0) → `partial`
(paid > 0) → `closed`.

`accountFor(schedule, worker, today)` — worker status, first match wins:

| status | condition | label |
|---|---|---|
| `review` | something of his is held, contested or over-settled | proposed |
| `waiting` | a period with work and no closure: the current one, or an earlier one inside tracking | «ממתין לסגירה» |
| `partial` / `closed` | his latest statement still owes him: part paid / nothing paid | «שולם חלקית» / «נסגר» |
| `open` | nothing waiting, the latest settled, but an older wage or an advance debt stands | «יתרה פתוחה» |
| `paid` / `closed` | his latest statement, settled (`closed` = net of nothing, no payment) | «שולם» / «נסגר» |
| `none` | no account to speak of | proposed |

A period "has work" when it has an attendance day or a positive wage. (The design note said
"days or an advance"; an advance with no work is a debt, not a period to close.)

## The functions

| function | contract |
|---|---|
| `payEntryProblems(id, value)` | Everything wrong with one `pay` entry, in English; empty means this build could have written it. |
| `paybookFold(schedule)` | `{ opening, statements, legacy, held, conflicts }` — the map, folded; nothing dropped. |
| `accountFor(schedule, worker, today)` | One man's running account: `current`, `running`, `pending`, `beforeTracking`, `advances`, `debt`, `unpaid`, `wageDue`, `wageOverpaid`, `paymentUnknown`, `held`, `conflicts`, `status`. |
| `accountsList(schedule, today, { cycle })` | Every man by his own cycle, roster order, with three totals that are never added together. |
| `planClosure(schedule, worker, { from, to }, choices, { at, by, today })` | Dry run: the review page (`review`), the exact `changes`, the `ids`, an `expects` fingerprint — or `reasons`. |
| `planPayment(schedule, statementId, amount, { paymentId, date, method, note }, stamp)` | One later payment. The same id with the same money is `already: true`, not a refusal. |
| `planVoid(schedule, targetId, { reason, amount, date }, stamp)` | A payment or extra deduction recorded in error; one void per target. |
| `planAdjustment(schedule, statementId, delta, { reason, date }, stamp)` | A closed net that was wrong, stated beside it. |
| `planOpening(schedule, date, stamp)` | The activation day. One entry, one id. |
| `planLegacy(schedule, worker, periodFrom, { state, due, note }, stamp)` | The owner's word on one older closure. |
| `planGroupClosure(schedule, workers, scope, choicesByWorker, stamp)` | One independent plan per man; `outcome` is `write` / `done` / `skip` / `refuse`. |
| `stillValid(schedule, plan)` | Re-plans from the plan's own inputs against the record now. `stale` (+ the fresh refusal), or `done` when it already landed; hands back the fresh plan. |
| `paybookApply(schedule, changes)` | A **new** schedule with the changes laid in by the record's laws: `applied`, `same`, `conflicts`, `refused`. A model of a commit for suites and dry runs — not the write path. |
| `closureHistory(schedule, query)` | Every closure with its full summary, searchable by worker, name, closing day, work period, cycle, payment status. Closures from before statements are included, status `unknown`. |
| `planPayMigration(schedule, today)` | A report: closures with unknown payment, unclosed periods inside / before tracking, each advance and what can be reconstructed, where the two debt folds disagree. `changes: []`. Nothing applies it. |
| `newPaymentId()` | Mints a later payment's id. The one function here that is not deterministic, and nothing else calls it. |

None of them mutates its input (JSON-compared before and after, and re-run on a
deep-frozen schedule), and all but `newPaymentId` give the same output for the same input.

## Refusal codes

Stable strings in `reasons`; every one that applies is reported, not just the first. The
sentence a person reads is Hebrew and the owner's, so none is written here.

**`planClosure`**

| code | meaning |
|---|---|
| `worker` | nobody on the roster by that id |
| `stamp` | no moment, signer or today |
| `gate` | `financialWritingEnabled` is false on this record or build |
| `permission` | rule 8 names who may close, and this signer is not among them |
| `inactive` | tracking was never activated |
| `before-tracking` | the period ended before tracking begins |
| `period` | `[from, to]` is not a period this man is settled on |
| `closed` | this exact period already has a closure |
| `overlap` | a closed period shares a day with it — compared by days |
| `statement` | a statement for this man and period is already in the map |
| `conflict` | an unsettled disagreement on one of his ids |
| `early` | before the period's last day (rule 4) |
| `unpriced` | a worked day has no rate |
| `overpaid` | one of his advances is settled beyond what was given |
| `allocation` | an allocation that is not money, or names an advance that is not his, not open or not offered |
| `allocation-missing` | an open advance with no answer |
| `over-advance` | more than the advance has left — judged against both the balance `closureProblems` will use and the live one |
| `over-wage` | advances + extras exceed the wage (rule 5) |
| `deduction` | the account walk allows less than was chosen — see the next section |
| `clock` | an entry on a touched advance was recorded after this closure's moment |
| `extra` | an extra deduction with no reason, no category or no real amount; or too many |
| `paid` | the paid amount, its day, method or note is not valid |
| `overpay` | more paid than the net |
| `unpaid` | rule 3 flipped, and no payment named |
| `note` | the closure's note is not text |
| `unsafe-id` | an id this closure would mint cannot be a field path |
| `rejected` | the ledger's own writer or judge refused an entry the plan built (never produced by any input in the suite) |

**The others**

| planner | codes |
|---|---|
| `planPayment` | `stamp`, `gate`, `permission`, `target`, `payment-id`, `amount`, `overpay`, `date`, `method`, `note`, `conflict`, `rejected` |
| `planVoid` | `stamp`, `gate`, `permission`, `target`, `reason`, `amount`, `over-target`, `date`, `voided`, `rejected` |
| `planAdjustment` | `stamp`, `gate`, `permission`, `target`, `delta`, `reason`, `below-zero`, `date`, `rejected` |
| `planOpening` | `stamp`, `gate`, `permission`, `date`, `opened` |
| `planLegacy` | `stamp`, `gate`, `permission`, `target`, `state`, `due`, `note`, `answered`, `rejected` |
| `planGroupClosure` | per man: `planClosure`'s codes, plus `cycle` and `twice` on a skip |
| `stillValid` | `stale` (followed by the fresh plan's codes), `done` |

## Where the audit and the design were wrong

Verified first: probes 1 and 2 reproduce on `bd59a68` to the figure (3,800 on the fortnight
row; 500 + 200 oldest-first; the same-Friday hole; a hand-built 300/200/200 accepted and
reopened clean). Probe 3 (sync) was not re-run — nothing in this phase touches sync.
`docs/architecture.md:75` does still say the ledger is off, as the audit noted; it is not.

1. **Two folds disagree about an advance whose own period was never closed, and neither
   document says so.** `advanceOutstanding` — "the one answer" — says 500 is left, because
   nothing was recorded against it. `advanceWalk` has already counted it as taken from the
   wage of the fortnight it was given in, so `advanceCarryInto` answers 0, and
   `advanceAccount` refuses any chosen deduction of it later. Measured on unchanged code:
   the existing dialog refuses (`deduction`), and so does the new planner — it cannot plan
   around it, because the artifact's `carriedIn`, `net` and `balanceAfter` are the walk's
   and a deduction the walk does not know opens the next period on a negative balance.
   Both figures are on the review (`left` per advance, `walkRoom` for the closure), and
   `planPayMigration(...).debtDisagreements` lists every man it affects. **Until this is
   decided, "deduct an old advance later" does not work for advances from periods nobody
   closed.** Pinned in Phase 0.
2. **A partial deduction shuts the financial gate on a record with no carry approval.**
   The audit says a hand-chosen split is accepted; it is — and then `planAdvanceCarry`
   sees a fortnight whose deduction is not the advance given in it, `planCarryMigration`
   becomes `needed`, and `financialWritingEnabled` answers false until `cm_carry` is
   approved. Existing behaviour, pinned in Phase 0. A record approved once stays approved;
   whether the real record is must be checked before Phase 2.
3. **A random id for every payment loses the payment made at closing.** Two phones closing
   one account, each with a paid amount, are one statement and two payments. Built with a
   derived id (`pp_<statementId>`) for that one payment.
4. **"Advances not listed = 0"** contradicts the owner's own words. Built as a missing
   answer (`allocation-missing`), one constant to flip.
5. **`wageDueBefore` cannot be compared as money.** Two phones with the same choices can
   honestly differ on it; with `sameLedgerFact` as designed, an agreed statement would be
   held as a conflict. It is excluded from the comparison.
6. **The opening is a day, not a Friday.** "The period containing activation" is a
   different window for a weekly and a fortnightly man; the entry stores the day and each
   man's tracking start is derived from it.
7. **The design's Phase 0 loaded the file in `index.html`, `sw.js` and the harness.** This
   phase ships nothing: the suite loads the file itself, and `tests/build.test.mjs` passes
   untouched with an un-shipped file in `js/model/` (it reads only what the page loads).
8. **The design's Phase 1 changed six protected files.** None is touched here; what each
   needs is listed below.
9. **`statement.debtAfter` is the period's debt, not all of it.** It equals the artifact's
   `balanceAfter`, which excludes advances dated after the period. The review carries the
   live total separately.

## The gap table, brought up to date

"Model" means: exists as a pure function with a passing check. Nothing is on a screen.

| # | owner's rule | on `bd59a68` | after this phase |
|---|---|---|---|
| 1a | one accounts list, per-worker cycle, filter | partial | **model**: `accountsList` |
| 1b | weekly man shows only his open week | contradicts (3,800) | **model**: `accountFor` → 2,000. The existing report is unchanged and pinned at 3,800. |
| 1c | biweekly shows his fortnight | true | true; **model** agrees: 4,400 |
| 1d | closed wages never return to the running account | partial | **model**: `running` is 0 once closed; the closed wage is a statement |
| 1e | unpaid wage from an earlier closure, apart | absent | **model**: `wageDue`, `unpaid` |
| 1f | existing week / fortnight definitions | true | unchanged; `periodRangeFor` only |
| 2 | review page, final confirm, opening closes nothing | partial | **model**: `planClosure(...).review` + `changes`; `stillValid` at confirm. No page. |
| 3a | advance: id, date, original, deducted, remaining, each deduction | true | unchanged; surfaced in `closureHistory` |
| 3b | choose per advance | partial (one total, oldest first) | **model**; blocked for advances from never-closed periods (finding 1) |
| 3c | never delete an advance / change its date | partial | unchanged. The new planners write no `corrected` and no removal; `removeAdvance` and `recordAdvanceCorrected` still exist. |
| 3d | never over-deduct, never twice, debt survives | true | true; **model** adds the live-balance cap and closes the same-Friday hole in the planner |
| 3e | a new advance is never a wage payment | true | **model**: pinned |
| 3f | safe migration of old advances | exists | **model**: `planPayMigration` reports what can and cannot be reconstructed |
| 4 | extra deductions | absent | **model** |
| 5 | payment apart from closure; later payment; no netting | absent | **model** |
| 6 | group closure | absent | **model**: `planGroupClosure`. No work list, no draft storage. |
| 7 | reset deletes nothing | true | true; pinned for the new entries too |
| 8 | history, search, no silent edit, linked corrections | partial | **model**: `closureHistory`, `planVoid`, `planAdjustment` |
| 9 | safety and concurrency | see audit A6 | **model only**: ids, same-fact, conflict kept beside, `stillValid`. No server-first write, no intent, no rule. |
| 10 | break nothing; one wage source; review list | true as architecture | no shipped file changed; agreement with the old model on old data is pinned |
| 11 | tests | none for payment, extras, group, history | `tests/payroll.test.mjs` |
| 12 | UI | none | none |

Still open on `bd59a68` and **not** fixed by this phase: the same-Friday hole in
`planPeriodClosure` / `closureProblems` (a foreign phone can still deliver such a closure;
only the new planner refuses to write one), and both findings 1 and 2 above.

## What later phases must add

Nothing below exists. Each names the file it lives in.

**Persistence (the first thing; without it `pay` is dropped by every door).**
- `js/model/schema.js`: `emptySchedule` gains `pay: {}`; `journalEntryProblems` accepts
  `pay.<id>` (never null, value passes `payEntryProblems`); `storedScheduleProblems`,
  `fullScheduleProblems` and `readReplacementDocument` learn `pay`, `payConflicted` and a
  `payUnreadable` map; `cloudDocument` carries them.
- `js/state.js`: `normaliseSchedule` keeps `pay`, moves what `payEntryProblems` refuses to
  `payUnreadable` verbatim, and decides whether a held or contested entry blocks writes.
- `js/sync/receive.js`, `restore.js`, `sync.js`: union `pay` on adoption and on restore
  with `paybookSameFact`; never remove a key; the outbox reader accepts the path.
- `index.html`, `sw.js`, `js/app.js`, `tests/harness.mjs`: load order (after
  `model/ledger.js`, before `state.js`), the shell entry and the three stamps.

**Server-first transaction.** `FarkadSync.transact(changes, { opId })` in
`js/sync/send.js`: one Firestore transaction carrying every path of one operation, or
nothing; offline refuses; a conflict adopts the fresh document and the review is redrawn
(`stillValid` is the model half); a device-local intent for an answer lost in flight.

**Rules.** `firestore.rules`: `protocol >= 2`, and append-only for `pay` and
`ledger.advances` (no changed and no removed keys on update). The owner's manual publish.

**The existing model.** `js/model/ledger.js`: compare overlap by days and stop accepting a
fortnight for a man it is not a period for. `js/model/schema.js`: reconcile `advanceWalk`
with `advanceOutstanding` for unclosed earlier periods (finding 1), which rule 6 needs too.

**UI.** The accounts list, the worker account, the review page, the payment sheet, the
group walk and its drafts, the history — and the answer to default 1 for `js/ui/reports.js`.

**The rollout rule for phones that have not updated.** (What an older phone does with an
unknown top-level key was measured by the audit's probe 3 and is not re-measured here.) A
phone on v169 or earlier drops
`pay` from its own copy and never removes it from the cloud with an ordinary edit; it sees
the artifact and the `deducted` entries, so the period is frozen and the advances reduced
there, but it shows no extra deduction, no payment and no wage balance, and its "net" for
that period ignores extra deductions. It can still close a period the old way, offline.
So, as for v166: **every phone on the new build before the first closure with an extra
deduction or a payment is recorded; until then no backup, restore point or cloud copy is
restored across builds in either direction, and no window of an older build stays open
beside a new one.** The protocol gate makes that enforced instead of promised.

## Hebrew strings

No string is shown by anything in this phase. The five status labels are in the model
(`PAYBOOK_STATUS_LABELS`) and pinned word for word, because they are the owner's own words.
Every other string is **proposed** and needs his word before it is pinned (iron law 6).

| string | source | where |
|---|---|---|
| סגירת חשבון ואיפוס | owner | worker account, primary action |
| יתרת שכר לתשלום | owner | list line, worker account, review |
| סגירת חשבונות עובדים | owner | list, primary action |
| סגירת חשבון דו-שבועי | owner | list, secondary action |
| היסטוריית סגירות חשבון | owner | history entry and title |
| ממתין לסגירה | owner | status `waiting` |
| נסגר | owner | status `closed` |
| שולם | owner | status `paid` |
| שולם חלקית | owner | status `partial` |
| יתרה פתוחה | owner | status `open` |
| סגירת חשבון | owner | titles, history |
| תשלום בפועל | owner | payment action and title |
| עובד שבועי | owner | cycle chip, review header |
| עובד דו-שבועי | owner | cycle chip, review header |
| שבועי / דו־שבועי | existing (`PAY_CYCLE_LABELS`) | filter chips |
| מקדמות פתוחות, נשאר להחזיר, תיקון טעות | existing | reused as they are |
| לבדיקה | proposed | status `review` |
| אין חשבון פתוח | proposed | status `none` |
| נסגר לפני שנרשמו תשלומים - לא ידוע אם שולם | proposed | a closure with payment unknown |
| חשבונות / מקדמות | proposed | the switch on the tab |
| הכול | proposed | filter chip; per-advance chip |
| מקדמות לקיזוז | proposed | review section |
| כמה לקזז מהמקדמה הזאת? | proposed | per-advance field |
| לא נבחר סכום לכל המקדמות | proposed | `allocation-missing` |
| אי אפשר לקזז יותר ממה שנשאר במקדמה | proposed | `over-advance` |
| הניכויים גבוהים מהשכר של התקופה | proposed | `over-wage` |
| מקדמה מתקופה שלא נסגרה - אי אפשר לקזז אותה כאן | proposed | `deduction` |
| מקדמה מאוחרת - תקוזז מהתקופה הבאה | proposed | an advance dated after the period |
| ניכויים נוספים / + ניכוי נוסף | proposed | review section |
| ניכוי מוסכם / הסדר / אחר | proposed | deduction categories |
| סיבת הניכוי | proposed | field label |
| יתרת שכר מסגירות קודמות | proposed | review, read-only |
| שכר התקופה / נטו לתשלום / שולם בפועל / יתרה אחרי הסגירה | proposed | review result |
| שולם הכול / עוד לא שולם | proposed | paid chips |
| אישור סגירה | proposed | review, primary action |
| אי אפשר לסגור לפני היום האחרון של התקופה | proposed | `early` |
| החשבון כבר נסגר | proposed | `closed` / `statement` |
| החשבון השתנה בזמן האישור. לא נשמר דבר. בדוק את הסכומים ואשר שוב. | proposed (today's: «…לא נשמר ניכוי…») | `stale` |
| רשום תשלום | proposed | payment, primary action |
| אי אפשר לרשום תשלום גבוה מהיתרה | proposed | `overpay` |
| כבר נרשם | proposed | `already` |
| שולם יותר מהיתרה - צריך לבדוק | proposed | an overpaid statement |
| ביטול רישום / סיבת הביטול | proposed | void |
| תיקון לסגירה | proposed | adjustment |
| אישור והבא / דלג | proposed | group walk |
| הכן סגירה לנבחרים | proposed | group page |
| נסה שוב לנכשלים | proposed | group results |
| תקופה קודמת שלא נסגרה | proposed | a pending period line |
| לפני תחילת המעקב | proposed | a period before tracking |
| תחילת המעקב | proposed | activation day |
| שולם / נשאר חוב של X ₪ | proposed | the two legacy answers |

## Still the owner's to decide

The eight defaults above, and:

9. Is an advance the person did not answer for a missing answer (built) or a zero?
10. Which of the two folds is a man's debt when an advance comes from a period nobody
    closed — the 500 `advanceOutstanding` says, or the 0 the account walk carries? Until
    it is one answer, such an advance cannot be deducted at a later closure.
11. Has the carry (`cm_carry`) been approved on the real record? If not, the first partial
    deduction locks every financial control until it is.
12. May a later period be closed while an earlier one is still waiting? Built: yes; the
    earlier one stays listed.
13. May a period from before the activation day be closed through the new flow? Built: no
    — the activation day can be chosen earlier instead.
14. One payment at the closing per statement, with a derived id (built), so two phones
    cannot record one envelope twice.
15. One void per entry, whole or part (built). A second correction needs a person.
16. May a legacy closure answered "still owed X" be paid like a statement? Built: yes.
17. The deduction categories (agreed / settlement / other), at most twenty per closure,
    and the payment methods (cash / transfer).
18. A payment may not be dated in the future. Built: refused.
19. The wording for `review`, `none` and "payment unknown", and every other proposed
    string above.
