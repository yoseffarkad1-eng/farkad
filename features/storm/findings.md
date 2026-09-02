# The storm — one red run of the money-concurrency suite, explained

`tests/money.concurrency.test.mjs` «an interleaved storm leaves two phones and the cloud on
one record» failed 7 of 50 in the first release-gate run on `f718367` (v97) and passed
50/50 in the second run and in nine isolated runs. Two hunts ran in parallel — one
reproducing under load on a private emulator port, one reading the code for the race —
and two independent refuters tried to break each account. All four agree.

## Reproduced

28 natural runs of the suite under CPU pressure (busy loops, a concurrent gate, a second
emulator): the storm broke in 4 — 1 of 15 with a warm JVM, 3 of 12 cold — every time with
the same seven checks as the gate log. A forced-order variant (the closer's write allowed
to land first) broke 1 of 1. A deterministic fake-cloud test (no emulator, no timing)
shows the same end state every time. Logs: the hunt's `runs/` directory in the session's
scratch trees; the deterministic test is in this round's fix branch.

## The cause — a phone held by its own closure

| step | where | what |
|---|---|---|
| 1 | `closureFacts`, js/model/ledger.js ~796-801 | builds `days[].entries[]` with OWN keys `rate: undefined`, `hours: undefined` |
| 2 | `appendLedgerEntry`, ~586-606 | strips `undefined` at the top level only, so the closure entries the phone keeps in memory carry nested own-undefined keys; the outbox, the disk and the wire hold the JSON form, which has none |
| 3 | `sameLedgerBytes` ~1523, `sameLedgerFact` ~1554 | render a leaf with `JSON.stringify`, which yields the text `"rate":undefined` for such a key — so the phone's OWN closure and its wire copy compare as one id, two bodies |
| 4 | `receive()`, js/sync/sync.js ~5276 | the phone's own echo is skipped (updatedAt/updatedBy match), so when the closer's transaction lands FIRST its live objects are never replaced |
| 5 | `receive()` ~5292-5370 → `mergeLedgerInto` ~1614-1628 | the next non-echo snapshot (the other phone's rebased write) carries the closure back; bytes differ, fact differs → `conflicts.push` → `ledger.conflicted` persisted → `Recovery.damaged('scheduleData:v2:ledger:conflict')` → writes blocked → `fail()` → status 'error' |
| 6 | js/state.js ~987, ~174 | on reopen `normaliseSchedule` re-reports the persisted conflict, and `migrateLedger` returns before the boot mirror — the reopened phone is still held and owes nothing |

When the OTHER phone lands first — the usual order, since the suite commits B's write a
few milliseconds before A's — the closer's write is refused, it adopts the snapshot,
`reapplyPending`/`applyJournalEntry` replace its live entries with JSON-parsed outbox
copies, and everything converges. Either order is legal under the adapter's revision CAS;
a cold JVM widens the window, which is why the gate (a fresh `emulators:exec` after twenty
minutes of browser suites) is where it showed.

All seven failing checks follow from the one cause: status error / synced; refusing to
write; the records differ (at `ledger.conflicted` only); the cloud read-back differs (the
same); the reopened phone held; the reopened queue empty; the fresh advance's origin
missing. `ledger.unreadable` stays empty because nothing is unreadable — the hold is the
conflict key.

## Exposure

A closure is written only with the carry gate open. Both money gates are shut on every
served build, so no phone in the field can take this path today. It is a defect of the
build the gates would open, and it is fixed before they do.

## Found on the way, not the cause

- **closureProblems' recordedBy cut-off** (ledger.js ~378-407) judges a closure against
  entries with `at` ≤ the closure's own `at`; a closure computed on a record that already
  holds a correction whose wall-clock `at` is LATER than the closure's (a phone whose clock
  is behind another's) records a `balanceAfter` the rule then calls impossible, on every
  phone. Reproduced by accident in a first draft of the emulator control. Its own round.
- **The frozen day list loses its hours**: `closureFacts` reads `one.hours` while the live
  entry's field is `extraHours`, so a closed fortnight's frozen days never carry the extra
  hours they were priced with — evidence for the man's statement, not money. Fixed in this
  round beside the cause.
- **A second, separate flake, 1 of 28**: «one phone approving the migration while the
  other records a day» left A 'contested' after its approval write was refused
  `permission-denied` (the same-fact settlement at the pre-send gate against a
  synchronous cloud). Not investigated further; its own round.
- In 28 of 28 runs a phone in an EARLIER suite («two phones closing the same account»,
  «close and reopen after a race», «a repayment racing the wage deduction») was silently
  held by the same cause; those suites never assert status or `farkadWritesBlocked()`,
  so the hold passed. The deterministic test pins the guarantee those suites assumed.
