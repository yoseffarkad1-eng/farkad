# Worker accounts, closure and payment — the design as built (Phases 0, 1 and 2)

Status: **the model, and its storage and sync — shipped shut, on a development branch.**
Since v173 `js/model/payroll.js` is loaded, and the record it describes (`schedule.pay`) is
stored, journalled, merged, backed up, restored and sent like the advances ledger. The
WRITER is off: `FARKAD_FLAGS.paybook` is `false`, every planner refuses with `gate`, and
`State.commitPaybook` refuses whatever reaches it. A phone on this build keeps a pay book
it is handed and never starts one. There is still no screen and no rule. **v173 is not
served and not merged; nothing here has touched a real record.** Phase 2 as built is in
[Phase 2](#phase-2--storage-and-sync-as-built-v173); what is still missing is in [What
later phases must add](#what-later-phases-must-add).

Phases 0 and 1 were built on `bd59a68` (v169); Phase 2 on `0acaceb` (v171). The
specification was the audit and design written against `b640c5a`; where the code disagreed
with either, the code won, and every such place is in [Where the audit and the design were
wrong](#where-the-audit-and-the-design-were-wrong).

    node tests/payroll.test.mjs             # the model, writer on through the test seam
    node tests/paybook.store.test.mjs       # one phone: the gate, the commit, the disk, the files, capacity
    node tests/paybook.sync.test.mjs        # two and three phones on the fake cloud
    node tests/paybook.oldbuilds.test.mjs   # v167, v169 and v171, out of Git, beside this build
    npm run -s test:paybook-emulator        # the unchanged rules and the production adapter (needs Java)

## Phase 2 — storage and sync, as built (v173)

### The three findings to read first

1. **The document is on a clock, and closures are what wind it.** The whole schedule is one
   Firestore document, and Firestore refuses a document over 1,048,576 bytes — measured on
   the emulator (`maximum entity size is 1048576 bytes`), not assumed. A closure as the app
   writes it TODAY costs about 0.9 KB for a week and 1.4 KB for a fortnight per man (the
   frozen payslip), plus the same again for each advance it touches; a statement and its
   payment add about 0.7 KB. Numbers in [Capacity](#capacity). For fourteen men closed
   every fortnight the document is full after about a year with the pay book and about
   fifteen months without it; for thirty men, in months. **The pay book must not be opened
   on the single document as it is.** The split is proposed below and is not built.
2. **A closure is not all-or-nothing on the wire.** It is one transaction when it fits and
   is held whole when one of its paths is contested — and it is cut in two by the 296-path
   limit when a long queue is ahead of it. Measured; see [On the wire](#on-the-wire).
3. **A phone that has not updated can erase the pay book** — from the cloud with any
   restore, and from a disk it shares with a newer window. Measured on v167, v169 and v171;
   see [The rollout rule](#the-rollout-rule).

### The stored shape

    schedule.pay                    { "<id>": entry }   one field path per entry: pay.<id>
    schedule.payConflicted          { "<id>": [entry, …] }   the other side(s) of a disagreement; absent when empty
    schedule.payUnreadableContainer { pay?: …, payConflicted?: … }   bytes of a container that was not a record; absent normally

`emptySchedule()` names `pay`, because `normaliseSchedule` starts from it and keeps only
what it names — which is exactly why every older build drops the map from its own copy.

- **Created once, never rewritten, never removed.** `journalEntryProblems` accepts
  `pay.<id>` with exactly two segments and a value `payEntryProblems` accepts; a null is «a
  pay entry cannot be deleted». `payConflicted.*` is not a path at all: what is kept beside
  an entry is never sent on its own.
- **An entry stays where it lies, readable or not.** The ledger moves an entry it cannot
  fold into `ledger.unreadable`; a whole-document write from that phone then carries it
  under another name. Here it stays at `pay.<id>` on the disk, in memory and on the wire,
  and what keeps it out of the arithmetic is the fold (`paybookFold(...).held`).
- **Three doors refuse a rewrite**, each for the callers the one before it cannot see:
  `State.commitPaybook` (asks the record as it is now, answers with a reason, refuses the
  whole batch), the queue's one minting path `queueOperations` (asks the disk and the
  queue; a batch that got round the first door is not written), and the queue's reader (a
  batch on the disk carrying `pay.<id>: null` is not a queue this app wrote).
- **The same fact twice is one fact.** Same id, same content, another `at`/`by`/`rev`/
  `wageDueBefore` (`paybookSameFact`): nothing is written, the first signer stands, and a
  queued copy is acknowledged against the server's without replacing it
  (`ledgerPathSupersededBy` learned the `pay.` family).

### The commit

`State.commitPaybook(changes)` is the one door a pay entry is written by: a plan's
`changes` — the closure artifact, its `deducted` entries and the `pay.*` entries — as ONE
journal batch, journal first, through `commitMany`. It returns
`{ ok, reasons, written, same, kept }`. `reasons` is `gate` (this build, or this record's
financial gate), `rejected` (a null, a path that is not an entry, one path twice, an empty
batch), `conflict` (an id that already says something else, or is in dispute), or
`unwritten` (the journal or the record refused; `commitMany` has said so in its own words,
and `kept: true` means the journal HOLDS the batch and only the record write failed).

Pinned in `tests/paybook.store.test.mjs`: one journal record of six operations; a reopen
that reads back the same bytes and the same fold; a death between the journal and the
record rebuilt from the journal; a journal the disk refuses rolling memory back with the
app's own «הרישום לא נשמר» said once.

### The conflict rule

**One id, two different bodies: both are kept, the copy the cloud holds stands, and the
phone is not stopped.**

| | what happens |
|---|---|
| which copy stands | `paybookUnion(standing, other)`: the caller names who outranks. `receive()`: the cloud over this phone. `prepareReplace`: what is live over what is being restored. `absorbCloudLedger`: the cloud over the restore's envelope. So every phone that has heard the cloud folds the SAME entry under a disputed id. |
| where the other goes | `payConflicted[<id>]`, verbatim, on the record — across saves, reopens, backups, the rescue file, and inside any whole-document write. |
| what is held | (1) The loser's queued write: `pay.` is a `replacesWhole` family, so the pre-send pass and the conflict branch hold it by name — and its whole batch with it — and it is listed in ⋯ in the ledger's existing words («רישום כספי שהענן מחזיק אחרת. נשמר כאן ואינו נשלח; אין לו פתרון מהמסך הזה.»). (2) Every pay planner for the man the id belongs to: `conflict`. His account reads `review`. (3) `commitPaybook` for that id, from either side. |
| what is NOT held | The phone. No Recovery problem, no banner, writing not blocked: days, roster, advances and every other man's account go on. |

**Why narrower than the ledger's.** A ledger disagreement stops the phone through Recovery
because the losing phone keeps ITS OWN figure in the fold (the queue lays it back over the
adopted snapshot), so its screens would price a man differently from the other two. The pay
book does the opposite — the journal's replay never lays a queued body over one that stands
(`layPaybookEntry`) — so nothing on the losing phone is computed from the disputed figure.
Both bodies are readable and on the record; nothing can be lost by recording tonight's
days beside them. Stopping the phone would buy nothing and cost the evening.

**What is not weakened.** A closure whose DEDUCTIONS differ between two phones is a ledger
disagreement (`le_close_*`) as well, and that still stops the losing phone through Recovery
exactly as before — measured on the fake cloud (P4) and the emulator (A4), with the cloud
left entry for entry the winner's and no double deduction. The pay book's rule applies to
what only the pay book holds: a different paid amount, a different extra deduction.

**What it does not yet do.** Nothing in this phase lets a person SETTLE a disagreement;
the held write stays held and the status line stays «contested» on that phone until a later
phase gives it a screen. A disagreement that arrives with no queued write behind it (from a
restore, say) is on the record and in the fold and on no screen at all yet.

### Unreadable entries (iron law 10)

An entry `payEntryProblems` refuses — a kind from a build that does not exist yet, a sum
that is text, a null — is **kept at `pay.<id>` exactly as it arrived**, copied by Recovery
under `scheduleData:v2:pay` (the rescue file carries the copy under its own name), and
**all writing stops until the person has been told**, as for an unreadable ledger entry.
After «הבנתי» writing resumes with the entry still in place, and the next open says it
again. A `pay` that is not a record at all reads as an empty book, its bytes are carried
under `payUnreadableContainer` and quarantined under `scheduleData:v2:pay:container`, and a
replacement door refuses such a file in its own sentence. A poison name (`__proto__`,
`constructor`, `prototype`) under `pay` or `payConflicted` is the existing
`poisonedContainers` hold, extended to the two maps.

A payment that arrived before its statement is NOT unreadable: it is the ordinary order of
two field paths, it is held by the fold and stops nothing.

### The restore rule

**A restore never removes or rewrites a pay entry.** It replaces the work record — days,
roster — and unions the pay book in, exactly as it has always done for the advances ledger
(`features/restore-ledger/contract.md`), at the same two moments:

- `prepareReplace`: the live book is unioned into the envelope; where one id holds two
  bodies **what is live stands** and the file's is kept beside it.
- `absorbCloudLedger`, in the same turn as the write: the cloud's book is unioned in again,
  so a payment another phone recorded while the restore was waiting is not erased;
  **the cloud's copy stands.**

So a backup written before the pay book, an old restore point and a cloud copy from a
not-updated phone all restore as «no pay entries in that file», and every entry this phone
or the cloud holds stays. `localDurableHolds` compares `pay` and `payConflicted` too. The
four confirmations gain one sentence — only on a phone that holds a pay entry, so with the
writer shut they read exactly as they did: « סגירות חשבון ותשלומים שכבר נרשמו אינם נמחקים
בשחזור - הם נשארים רשומים.» (proposed wording).

This holds for a restore made BY THIS BUILD. A restore from an older build is the hazard in
the next section.

### The gate

`paybook: false` in `FARKAD_SHIPPED_FLAGS` (`js/model/schema.js`), read through
`paybookWritesEnabled()`. Off: the planners answer `gate`, `commitPaybook` answers `gate`,
and nothing else in the app calls either. NOT behind the gate, deliberately: reading,
folding, keeping across a save, merging, backing up, restoring and re-sending a queue that
holds one. The journal's grammar accepts `pay.<id>` whatever the gate says — a phone handed
a queue with one in it must still be able to read its own queue. It is not `ledgerWrites`:
the existing closure's ledger entries are written today by every phone.

### On the wire

Measured in `tests/paybook.sync.test.mjs` (P10) and against the production adapter
(`tests/paybook.emulator.test.mjs`, A1–A5):

| case | what happens |
|---|---|
| the ordinary closure | ONE update, one revision, one receipt: every path or none. |
| a path of it is contested before sending | the batch is held WHOLE; a sibling path that collides with nothing is never sent on its own. |
| the server refuses it on its revision and a path has moved | nothing of it is applied; the path is held, and the batch with it. |
| the server refuses it and nothing has moved | rebased and sent whole. |
| a retry after a lost answer | answered from its receipt, or settled as the same fact; one entry. |
| **more than 296 paths are queued ahead of it** | **the closure is CUT: one write carries the frozen payslip and the deductions, the next the statement and the payment.** Between the two every other phone reads a closure with no payment recorded («payment unknown»), the advances already reduced. If the second write never lands, that is where it stays. |

So: **no** — a multi-path closure is not all-or-nothing on the wire. It is by construction
only while it fits in one write. Phase 3's server-first transaction has to carry a closure
as exactly one transaction of its own, outside the ordinary flush.

Also measured, and pre-existing: a phone whose whole batch is settled against the server's
copy (the second of two identical closures, or a retry that finds its own write there)
sends nothing — and its status line is left at «שולח» or at the failure until the next
snapshot, over an empty queue. The existing ledger-only closure does the same on v171. It
is in `js/sync/send.js`, which this phase does not change; pinned as «TODAY» in P2 and P8.

### What the unchanged rules do

`firestore.rules` was not edited. On the emulator, with the file as it stands:

- an account on the allowlist: an update adding `pay.<id>` paths with the protocol envelope
  and its receipt is **accepted**;
- a signed-in account not on the list, and nobody at all: **refused** (and may not read);
- a write with no protocol, or at a stale revision: **refused**.

And what they do **not** refuse, pinned as «TODAY»: an allowlisted account may REWRITE an
existing pay entry, DELETE one, and write a whole document with no `pay` at all. The rules
look at who writes, at the envelope and at the receipt, and at nothing inside the document.
Append-only is kept by this build's client and by nothing else — an older build is not
bound by it, which is the next section.

### The rollout rule

Derived from `tests/paybook.oldbuilds.test.mjs`: v167 (`a25566f`), v169 (`bd59a68`) and
v171 (`0acaceb`), each built out of Git and run beside this build. All three answer every
question the same way.

| question | measured |
|---|---|
| does it keep working with `pay` on the cloud document? | yes: synced, not blocked, no Recovery problem |
| what does its own copy hold? | no `pay` at all — dropped from memory and from its disk |
| does it see the closure? | yes: the artifact and the `deducted` entries are ledger entries it reads; it refuses to close that period again |
| does an ordinary write of its remove `pay` from the cloud? | **no** — a day, and a closure made its own way, go out as field paths; the cloud's pay book is byte for byte unchanged |
| its backup file, its rescue file | no `pay` |
| its own closure (no statement) on an updated phone | a closure with payment unknown |
| **a restore from it — any door** | **erases `pay` from the cloud.** Updated phones keep their copies; nothing puts them back; a phone installing afterwards never learns of them. A restore from an UPDATED phone that holds them puts the whole book back. |
| **its window open beside a window of this build, on one disk** | **its next save writes the record without `pay`, and this build's own window then loses the book from memory too.** With a cloud, the next snapshot gives it all back (it is not read as an echo — `paybookCovers`). With no cloud, entries still in the journal are rebuilt from it and an entry that was only on the record is gone. If the queue holds an unsent pay path the old window cannot read that batch and is held by Recovery before it writes. |
| when it updates | its first snapshot gives it the whole pay book at once |

**THE ROLLOUT RULE.** Before the first pay entry is ever written — that is, before
`paybook` is opened on any phone:

1. **Every phone is on v173 or later**, checked on each phone in ⋯, not assumed.
2. **From the first pay entry on, no backup, restore point, cloud copy or rescue file is
   restored from a phone on an older build** — and a file written BY an older build
   carries no pay book, so restoring one on an updated phone is safe only because this
   build unions (the restore rule above).
3. **No window of an older build stays open beside a new one.** The app's own catch-up
   (law 7) reloads the other window; until it has, that window must not be recorded in.
4. A phone that turns up later on an older build is updated before it is used. Its
   ordinary recording harms nothing; its restore buttons do.

It is a rule, and a rule is a promise. What makes it enforced is the rules change Phase 3
needs anyway (`protocol >= 2`, so an older build's writes are refused outright).

### Capacity

`tests/paybook.store.test.mjs` builds the entries with the shipped writers, lays a year of
them into a document and weighs the DOCUMENT by Firestore's count. Six days a week; one
closure in four touches an advance. Entry sizes (JSON bytes): a worker-day 65; a closed
week's payslip 941, its deduction entry 983; a closed fortnight's 1,437 and 1,478; a
statement about 510, a payment about 190.

| crew | scenario | after 52 weeks | 50% of 1 MiB | 100% of 1 MiB |
|---|---|---|---|---|
| 14 | days only, nobody ever closed | 273 KB (26%) | week 100 | week 202 (3.9 y) |
| 14 | closed every fortnight, as written TODAY | 844 KB (80%) | week 32 | week 65 (1.2 y) |
| 14 | closed every fortnight, + statement and payment | 1,050 KB (100%) | week 26 | week 52 (1.0 y) |
| 14 | closed every week, as written TODAY | 1,071 KB (102%) | week 25 | week 51 |
| 14 | closed every week, + statement and payment | 1,482 KB (141%) | week 18 | week 37 |
| 30 | days only, nobody ever closed | 577 KB (55%) | week 47 | week 95 (1.8 y) |
| 30 | closed every fortnight, as written TODAY | 1,781 KB (170%) | week 15 | week 31 |
| 30 | closed every fortnight, + statement and payment | 2,222 KB (212%) | week 12 | week 24 |
| 30 | closed every week, as written TODAY | 2,259 KB (215%) | week 12 | week 24 |
| 30 | closed every week, + statement and payment | 3,138 KB (299%) | week 9 | week 17 |

Read it this way:

- **The pay book is the smaller half** of what a closure adds — in every scenario it weighs
  less than the ledger entries beside it — but it brings the day the document is full
  forward by at least a sixth.
- **The existing closure is the heavy part, and it is already shipped and on.** A frozen
  payslip with its day list, copied whole into every `deducted` entry. Whoever closes
  accounts regularly TODAY is spending this budget now.
- **Days alone fill it too**, in about four years for fourteen men and under two for thirty.
- A full document is not a slow one: every write to it is refused, on all three phones at
  once. One copy on the phone is a separate limit (5 MiB, with up to seven more copies in
  restore points and the way back): 30 men closed weekly with the pay book is 7.2 MB a copy.
- **Not known from here: how big the real document is today, and the real crew.** Both are
  the owner's to say; the first is one read of the live document's size.

**The split, proposed and NOT built.** Closed history leaves the live document: one
document per closed period (or per man per year) in a subcollection —
`schedules/current/closed/<worker>_<from>` — holding the frozen payslip, its `deducted`
entries, the statement and its payments, created once and never updated (the `history`
rule's shape: `allow create`, never update or delete — which is also the server-side
append-only the pay book lacks). The live document keeps open periods, balances and a
small index. It needs a rules change, a migration that is a copy and never a move, and a
reader on every phone — a phase of its own, before the gate opens.

### Hebrew added in this phase

All **proposed**; none is the owner's wording yet. Four of the five can only be seen on a
phone that holds a pay entry or an unreadable pay record, which with the writer shut is no
phone.

| string | where |
|---|---|
| חלק מרישום סגירות החשבון והתשלומים לא נקרא. הנתונים נשמרו כמו שהם ולא נמחק דבר, אבל אי אפשר לרשום עוד עד שתייצא גיבוי - כדי שלא ייחשב סכום שלא הצלחנו לקרוא. | Recovery, an unreadable pay entry |
| רישום סגירות החשבון אינו בצורה שאפשר לקרוא. שום דבר לא נמחק - הנתונים נשמרו כמו שהם - אבל אי אפשר לרשום עוד עד שתייצא גיבוי, כדי שלא ייכתב רישום ריק מעליו. | Recovery, a `pay` that is not a record |
| רישום סגירות החשבון בקובץ אינו בצורה שאפשר לקרוא. | a replacement refused for that |
| סגירות חשבון ותשלומים שכבר נרשמו אינם נמחקים בשחזור - הם נשארים רשומים. | the four restore confirmations |
| רישום סגירת חשבון <id>: לא נקרא | a rescue rebuild that lost a pay entry |

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

Persistence is built (Phase 2, above). Nothing below exists. Each names the file it lives in.

**The document's size, before anything else.** See [Capacity](#capacity): closed history
has to leave the live document before the writer opens. A phase of its own.

**Server-first transaction.** `FarkadSync.transact(changes, { opId })` in
`js/sync/send.js`: one Firestore transaction carrying every path of one operation, or
nothing — outside the ordinary flush, so the 296-path cut measured in Phase 2 cannot split
it; offline refuses; a conflict adopts the fresh document and the review is redrawn
(`stillValid` is the model half); a device-local intent for an answer lost in flight.
`State.commitPaybook` is the local half it will call, and is not enough on its own: it
accepts a closure offline, exactly as the existing dialog does.

**Rules.** `firestore.rules`: `protocol >= 2` (which is what turns the rollout rule from a
promise into a refusal), and append-only for `pay` and `ledger.advances` (no changed and no
removed keys on update) — Phase 2 measured that today's rules accept a rewrite, a deletion
and a whole document with no `pay`. The owner's manual publish.

**A way to settle a disagreement, and to see one.** `payConflicted` is on the record and
in the fold and on no screen; the held write has no button. A person has to be able to
say which body is true (the answer is a `void` or an `adjustment` beside the one that
stands, and the retirement of the held operation — `answerHold(opId, 'cloud')`).

**Healing a cloud that lost the pay book.** A phone that holds entries the cloud no longer
has does not send them back (P6). Either the protocol gate makes the cause impossible, or
the receive path re-queues them; not both half-done.

**The stale status line** after a batch settled wholly against the server's copy
(`js/sync/send.js`, the early return in `sendClaimed`): «שולח» over an empty queue until
the next snapshot. Pre-existing; it will be a closing phone's last impression.

**The existing model.** `js/model/ledger.js`: compare overlap by days and stop accepting a
fortnight for a man it is not a period for. `js/model/schema.js`: reconcile `advanceWalk`
with `advanceOutstanding` for unclosed earlier periods (finding 1), which rule 6 needs too.

**UI.** The accounts list, the worker account, the review page, the payment sheet, the
group walk and its drafts, the history — and the answer to default 1 for `js/ui/reports.js`.

**The rollout rule** is no longer a prediction: it is measured against v167, v169 and v171
and written in [The rollout rule](#the-rollout-rule) above. What an older phone shows a
person is unchanged from what was predicted here: it sees the artifact and the `deducted`
entries, so the period is frozen and the advances reduced there, but it shows no extra
deduction, no payment and no wage balance, its "net" for that period ignores extra
deductions, and it can still close a period the old way, offline.

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

From Phase 2:

20. **How big is the live document today, and how many men are on it?** Everything in
    [Capacity](#capacity) turns on those two numbers, and neither can be read from here.
21. **Where does closed history go** — the split proposed there, or another? Until it is
    answered the writer stays shut.
22. A pay-book disagreement does not stop the phone (built); a ledger one still does. Is
    that the rule he wants, or should a disputed payment also stop recording until looked at?
23. An unreadable pay entry stops the phone until acknowledged, at every open (built, law
    10). The same as the ledger; said here because it is his phones it would stop.
24. The five Hebrew strings added in Phase 2.
25. Whether the stale «שולח» line (pre-existing) is fixed before or with the server-first
    transaction.
