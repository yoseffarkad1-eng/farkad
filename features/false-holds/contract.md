# Contract — the holds nobody disagreed about (v99)

The four items this closes are the ones v96–v98 left open, and they are one sentence:
**a phone stops over something that is not a disagreement.** Two of them stop it on its
own honest work; one stops it on another phone's identical record; the fourth is a
decision about when stopping is right.

Everything here sits behind the two money gates, which stay shut. Nothing in this round
can reach a phone in the field until a person opens them, and item 8's contract is what
that person reads first.

## Goal
After this ships:

- A fortnight closed a few days late — the ordinary case, where the man has already
  repaid something dated after the period — writes a closure this app's own reader
  accepts. Today it writes one the reader calls impossible, names in
  `impossibleClosures`, and blocks the phone's writes on the next boot.
- A phone whose clock is behind another's is TOLD it cannot close yet, in a sentence it
  can act on, instead of writing a closure that moves money between fortnights on the
  strength of a wrong clock.
- Two phones that each approved the same carry plan, reaching a project with no document
  yet, both end synced. Today the loser of the create race holds
  `ledger.migrations.cm_carry` for ever and reports `contested` — a conflict about money
  when both phones recorded the same fact.
- Two closures of one fortnight that disagree about the fortnight are still held for a
  person. That is not a bug and this round pins it as the decision it is.

## What was measured on the base

`4a4d277`, node 22.22.2, both gates opened on the fixture the way the suites do.

**1. The writer and the judge do not use the same arithmetic.** `planPeriodClosure`
computes each row's `balanceAfter` from `advanceOutstanding` — the WHOLE record.
`closureProblems` judges it with `outstandingWithout(..., onOrBefore = periodTo,
recordedBy = entry.at)` — the record as of the period's end and the closure's moment.
When those two answers differ the closure is written, accepted locally, and then condemned
by the app's own reader. Three timelines, all reproduced (`impossibleClosures` names the
entry; `farkadWritesBlocked()` is `true` after a reopen):

| # | the timeline | the rule saw | the plan computed from |
|---|---|---|---|
| A | repaid 400 on the 12th, recorded 19:00; closed at 18:00 — the closer's clock is behind | 5000 left | 4600 left |
| B | repaid 400 dated the 24th, recorded before the close | 5000 left | 4600 left |
| C | **repaid 400 on the 24th, recorded on the 24th, fortnight 07–20 closed on the 26th** | 5000 left | 4600 left |

C is the one that matters: **it needs no clock skew and no race.** A man repays, the boss
closes the fortnight a few days later, and the phone puts itself in recovery. The brief
named A; A and B and C are one defect with three doors.

**2 and 4 are one gap in two places, and the place that causes 2 is neither of the two the
brief guessed at first.** The same-fact rule (`ledgerPathSupersededBy`) is asked in exactly
one of the three gates a queued write passes. The other two compare VALUES with
`movedUnder`, so one deterministic id carrying the same numbers in another hand is a value
this device has never seen, and it is held for a person:

| gate | js/sync/sync.js | asks the same-fact rule? |
|---|---|---|
| the conflict branch | ~3379 | yes, since v91 |
| the pre-send hold, `sendClaimed` | ~3096 | **no** |
| `createDocument`'s already-exists branch | ~3960 | **no** |

Reproduced deterministically on the fake cloud (`probe/createrace.mjs`): two phones, each
holding its own approval of the same plan, reach a project with no document. The loser:

    B outbox paths: ["ledger.migrations.cm_carry"]
    B HELD paths:   ["ledger.migrations.cm_carry"]
    B status: contested      same fact? true      same bytes? false

That is item 2's reported end state — one operation held at `ledger.migrations.<id>`,
status `contested`. Tracing every call the adapter received shows **one create attempted
and no write at all from the loser**: it never reached the create-race branch, and it never
reached the conflict branch either. It heard the winner's snapshot, adopted it, and held
its own copy at the PRE-SEND gate. A phone whose queued write has not gone out yet cannot
be refused by anything, so no branch that handles a refusal can see this case.

Item 4's branch is a real second instance of the same gap and is closed with it; item 2 is
the pre-send gate. The emulator saw it once in twenty-eight runs because that is how often
the timing lines up under load; the fake cloud sees it every time.

**3 is already correct.** Measured directly: a v97-shaped closure and a v98-shaped closure
of one fortnight (same money, `hours` recorded only by the second) are `sameLedgerFact:
false`. Two closures from ONE build, two hands, two moments are `sameLedgerFact: true`. A
closure of a different sum is `false`. The rule already separates the three.

## The decisions

**D1 — one arithmetic, at the writer.** `planPeriodClosure` computes each row from the
same cut-off `closureProblems` judges by. The alternative — teaching the judge to ignore
`at` and `date` — was rejected: that cut-off is load-bearing for a bug already fixed (a
repayment arriving after a closure used to condemn it), and `js/model/ledger.js` says so
above `outstandingWithout`. The writer is the half that is wrong. It knows the period it
is closing and the moment it is closing at, and it must not compute from money it is about
to declare out of scope.

Consequence, deliberately: money dated after the period, or recorded after the closure,
is carried as `lateSinceClose` into the next account instead of silently changing the
frozen figure. That is the two-balance design in `advanceWalk`, not a new rule.

**D2 — a clock that is behind refuses.** D1 alone would let a wrong clock decide which
fortnight a repayment lands in: with the closer's clock behind, an entry recorded before
the closure in real time is excluded by `at` and carried to the next period. No money is
lost either way, but a payslip changes because a phone is wrong about the time, silently.
So `planPeriodClosure` reports the reason `clock` and `canClose` false when an entry on
the advances being closed was recorded after the moment the closure would carry, and the
screen says so before it offers the button. Refusing is reversible; a frozen payslip is
not — «סגירה היא סופית».

Scope: only entries the `at` cut-off would drop, on the advances that close would touch,
and only when there is something to deduct. An entry excluded for its DATE is ordinary
late money and refuses nothing.

**D3 — ask the same-fact rule at every gate that can hold a write**, not only at the one
that handles a refusal: the pre-send hold in `sendClaimed` and `createDocument`'s
already-exists branch both ask it now, exactly as the conflict branch does.

What a settled path does differs by gate, because the two gates are at different moments:

- **Pre-send**, nothing has left, so the path is ACKNOWLEDGED rather than sent. The fact
  is on the server under this id with the first writer's name on it — which is what the
  record should say, since they did decide first — and sending would replace their hand
  with this one's for no change in the money.
- **Create-race**, the write is already in flight, so the path is DROPPED from the patch
  as the conflict branch drops it; when nothing but the envelope is left the batch
  resolves through the ordinary success path instead of bumping the revision for a write
  that changes nothing.

A path the rule does NOT settle — any difference in a financial field — is held at both,
unchanged.

**D4 — a double close that disagrees about the fortnight stays held.** `sameLedgerFact`
keeps comparing every financial field including the frozen basis. Two phones that
disagree about which days a fortnight was priced on disagree about something real, and
settling that by "the first one wins" would discard a record. The cross-build case that
prompted this cannot occur on a build a person can run — it needs both gates open on two
different builds — and item 8's contract requires all three phones on one build before
the gates open at all. Pinned, not changed.

## Out of scope
- Neither gate moves. `LEDGER_WRITES` stays `false`; `carryAdvances` stays `false`.
- No change to what is recorded, priced, exported or printed.
- No change to `closureProblems`' three money questions or to the `outstandingWithout`
  cut-off itself.
- No change to `sameLedgerFact`'s field list (D4).
- No new dependency, no build step, no `type="module"`, no new script file.
- No physical-iPhone claim.

## Data
No storage key added or changed. No migration.

A closure written by v99 can differ from one v98 would have written at the same moment,
in `amount` and `balanceAfter`, when and only when the record holds money the period does
not cover. v98's answer in that case is an entry its own reader refuses, so there is
nothing to be compatible with. Entries already on a disk are untouched: this changes what
is COMPUTED for a new closure, never what is stored for an old one, and the ledger stays
append-only.

Rollback: revert the commits. A closure written under v99 remains readable by v98 — every
field is one v98 writes, and v98's judge accepts it, because agreeing with the judge is
the whole change.

## Permissions
Unchanged. `firestore.rules` is not touched, so nothing needs deploying for this round.
D3 changes which paths a client HOLDS, never which it is allowed to write.

## Privacy
Unchanged. No new field leaves the phone; D3 sends strictly less than before.

## Success criteria
1. `tests/closure.test.mjs`: a fortnight closed on the 26th, with a repayment dated the
   24th already on the record, writes a closure with `closureProblems` empty; the entry is
   not in `impossibleClosures`; a reopen of that disk has `farkadWritesBlocked() === false`;
   and the 400 shows as late money in the next account, not in the frozen figure.
2. `tests/closure.test.mjs`: a closer whose clock is behind an entry it would exclude gets
   `canClose === false` with reason `clock`, writes nothing (`closePeriodChanges` returns
   `[]`), and the record is unchanged. The screen shows the sentence rather than the
   button.
3. `tests/closure.test.mjs`: every existing closure pin still passes, unchanged — the
   ordinary close, the second press, the second phone, the frozen basis, the frozen hours.
4. `tests/samefact.test.mjs`: two phones each holding their own approval of one plan reach
   a project with no document; both end `pendingCount() === 0`, neither `contested`,
   `carryMigrationSettled` true on both, and the cloud holds ONE approval — the first
   writer's, with the first writer's `by`.
5. `tests/cas.test.mjs`: «two phones adding to the same worker's day on a project with no
   document yet» still HOLDS — a different fact is still a contest, and the create-race
   branch settles nothing it should not.
6. `tests/samefact.test.mjs`: the D4 decision, pinned three ways — a v97-shaped and a
   v98-shaped closure of one fortnight are not the same fact and are held; two closures
   from one build with two hands are; a closure of a different sum is not.
7. `npm test` and `npm run test:release` green on the final commit, from one clean
   detached worktree, reported separately with their counts.

## Base
- Branch `claude/farkad-mobile-design-review-odl8ue`, base SHA `4a4d277`.
- `main` = `3a80f7f` (v98, served). Not touched.
- Must not be touched: `firestore.rules`, `js/sync/firebase-config.js`, `vendor/`,
  the two gate constants, and every Hebrew string not named in a success criterion above.
