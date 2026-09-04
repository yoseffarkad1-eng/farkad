# Contract — the queue is decoded once per change, not once per question

This is the half of `features/performance/contract-journal-growth.md` that needs nobody's
decision. That document ends with a section called **"The work that does NOT need that
answer"**, naming two costs; this is that work and nothing else.

## The sentence this contract exists to make impossible to misread

**No journal entry is forgotten, expired, capped, evicted or dropped by anything in this
change, and no durability property moves.** The question
contract-journal-growth.md asks — *when may a device whose writes are being REFUSED forget
a journal entry whose value is provably in the written schedule?* — is **not answered here
and must not be answered here.** It belongs to the owner. The answer this change assumes
is the one that document says survives the reframing: **never, as today.** The owner's
fifty-nine records, and everything queued behind them, are exactly what will carry his
work to the other two phones when `firestore.rules` is deployed. This change makes holding
them cheaper. It does not make holding them optional.

The real remedy is still deploying `firestore.rules`, it is still the owner's action, and
nothing here substitutes for it.

## What was measured on the base

`50e467b`, headless Chromium in this container, node v22.22.2, Playwright 1.56.1. The
device is the perf suite's own fixture: 30 workers, 12 sites, a fortnight recorded, then
600 ordinary edits made through `State.journal` / `State.save` / `render()` with no adapter
installed, so every operation ends unsent and none is collectable — the shape the owner's
phone is in.

At 600 unsent operations across 601 storage keys:

| call | median |
|---|---|
| `Object.keys(localStorage)` | 0.10ms |
| `Store.keys()` | 0.20ms |
| `FarkadSync.queueKeys()` | 0.57ms |
| `FarkadSync.durableQueueRecords()` — the honest re-read of every queue key | 0.86ms |
| the same, plus comparing it against the previous read | 0.92ms |
| **`FarkadSync.physicalOperations()`** | **4.15 – 5.45ms** |
| `FarkadSync.projectedQueue()` | 5.03ms |
| `FarkadSync.pendingCount()` | 5.26ms |
| `updateSyncNotice()` | 5.32ms |
| cloning all 600 queued values (what `decodeQueue` hands out) | 0.32ms |

So of the ~5ms a single question about the queue costs, **0.9ms is reading the disk and
~4ms is decoding bytes that were already decoded** — building 600 operation objects,
concatenating 1,800 mark keys and probing three Sets per operation, running the `after`
cross-path and cycle passes, and re-scanning twenty-five legacy slots. The parse itself is
already cached (`BATCH_CACHE`); everything above it is not.

And the question is asked **four times per edit**, measured by stack:

| when | who asks |
|---|---|
| journal | `queueOperations` → `projectedQueue` → `physicalOperations` |
| journal | `queueOperations` → `physicalOperations` (again, for `after`) |
| save | `collectQueueGarbage` → `physicalOperations` — **and a second bare `decodeQueue` beside it** |
| render | `updateSyncNotice` → `pendingCount` → `_outbox` → `projectedQueue` → `physicalOperations` |

Per-edit medians on that device, first 50 edits against last 50:

| band | journal | save | render | total |
|---|---|---|---|---|
| 1–50 | 0.50ms | 1.30ms | 3.40ms | **5.2ms** |
| 551–600 | 8.70ms | 11.40ms | 8.40ms | **28.5ms** |

## Goal — what will be true after this

1. **The queue is decoded once per change of the bytes on the disk, not once per
   question.** One `State.commit` on a device with a deep unsent queue decodes the queue
   exactly once, and that count does not grow with the depth of the queue.
2. **A render that asks nothing new decodes nothing.** `updateSyncNotice` on a queue
   nobody has touched since the last question decodes it zero times.
3. **The sentence the person reads does not change by one character.** Including, exactly,
   `שגיאת סנכרון - הנתונים שמורים במכשיר הזה. (59 ממתינים לשליחה)` — the owner's line —
   and the singular `(רישום אחד ממתין לשליחה)`.
4. Every existing suite keeps its exact count and its exact strings.

## How the cache is kept honest, which is the whole of the risk

**The disk is re-read on every question. Every time. Nothing is skipped.**

`physicalOperations` already calls `durableQueueRecords()`, which reads every queue key
through `Store.durableGet` — the accessor that deliberately bypasses `Store.memory` so
that what another tab wrote is what comes back. That read stays exactly where it is and
costs exactly what it cost. What is cached is only the DECODE, and it is kept against the
exact bytes it was decoded from: on every call the freshly-read record map is compared,
key by key and value by value, against the map the cached decode was built from, and any
difference at all discards it.

This is not a new idea in this file. It is the same pattern as `storedSchedule()` two
hundred lines below (*"parsed once and cached on its own bytes … a season's record is not
something to re-parse per question"*) and `_localRosterBaselineText` above it. Both are
exact, both are cross-tab safe, and both are exact and cross-tab safe **for the same
reason**: the disk is the key, not a timestamp, not a counter, and not this tab's belief
about what it did last.

So the cross-tab question in `tests/probes.test.mjs` and `tests/concurrency.test.mjs` has
no purchase here. There is no invalidation to get wrong, because there is no signal being
trusted: another tab's write changes the bytes, the bytes are re-read, the comparison
fails, and the queue is decoded again. `Store`'s write tick is not consulted and does not
need to be — it is best-effort by design (a tick that cannot be written does not fail the
write it accompanies), so a cache resting on it would be wrong exactly on the full disk
where it matters most.

`decodeQueue` is a pure function of the record map: `queueKeyKind`, `readBatchCached`,
`legacyOpId` and the sort are all deterministic in it. Two decodes of identical bytes are
identical, which is what makes reusing one of them not a claim about anything.

**Handed out, never shared.** `decodeQueue` clones each operation's value on the way out,
because *"a value that reaches State is a value ordinary app code edits in place before it
commits anything"*. A cached decode would break that guarantee by handing two callers the
same objects, so the cached operations never leave: every call rebuilds the returned list
with a fresh shallow copy per operation, a fresh `cloneValue` of its value and a fresh copy
of its `after`. Measured above, that costs 0.32ms + 0.09ms at 600 operations — an
eighth of what it replaces, and the guarantee is unchanged.

## Out of scope

- Any expiry, cap, eviction, age limit, size limit or forgetting of any kind. See the top
  of this file.
- `collectQueueGarbage`'s rule. `op.sent && scheduleHoldsEntry(...)` is not touched: both
  halves stay, and a refused write stays uncollectable.
- The save column. `State.save()` stringifies the whole schedule and reads it back through
  `Store.setVerified`; that is iron law 3 working, and this change does not go near it.
  (Collection is called from `save`, so the *measured* save column will move. That is the
  decode leaving, not the durable write getting weaker.)
- Deploying `firestore.rules`. Owner-only, and named here so nobody reads a faster queue
  as the problem being solved.
- The three build stamps. They stay at v103; the integrator stamps once.

## What this must never do

- Never answer a question about the queue without reading the disk for it.
- Never hand a caller an operation object, or a value inside one, that another caller is
  also holding.
- Never let a write that did not land look like one that did: `queueOperations` still
  writes journal-first through `Store.setVerified`, still reads back, and still calls
  `Store.forget` and returns `false` when the batch did not land, so `State.commit` still
  rolls memory back and says so out loud.
- Never change a Hebrew string, a status, or the order in which anything is written.
- Never change what `physicalOperations` reports about a damaged record: an unreadable
  batch is quarantined through `Recovery.damaged` on every call, exactly as before.

## How it will be proved

`tests/queuecost.test.mjs`, a new node suite in `npm test`, wrapping the global
`decodeQueue` so the count is a fact and not a stopwatch:

1. one `State.commit` on a 300-deep unsent queue decodes the queue **once** (red on the
   base: five);
2. that count is the same at 30 deep and at 300 deep;
3. `updateSyncNotice()` twice over an unchanged queue decodes it **zero** times (red on
   the base: one per call);
4. the line reads, byte for byte, `שגיאת סנכרון - הנתונים שמורים במכשיר הזה. (59 ממתינים
   לשליחה)` at fifty-nine and `(רישום אחד ממתין לשליחה)` at one;
5. **another tab writes an operation straight onto the shared disk and this tab's very
   next `pendingCount()` counts it** — the cache may not hide it;
6. **another tab removes a batch record and this tab's very next question stops reporting
   it** — the cache may not resurrect it;
7. **another tab acknowledges an operation and this tab's next `pendingCount()` drops** —
   a mark key changing under an unchanged batch is still a change;
8. six hundred edits with nothing sent leave six hundred pending paths, every one of them
   readable, and `collectQueueGarbage` collects none of them — nothing was forgotten;
9. a journal write the disk refuses still returns `false` from `State.commit`, still
   leaves no operation behind, and the count of pending paths does not move.

Plus, either side of the change on one machine in one sitting: `npm run test:perf`, the
suite "the journal an unsent queue accumulates", both numbers in the commit message; and
the gate — `npm test` and `npm run test:release`, reported separately, at the commit being
asked about.

## Base

`50e467b` (v103). The state this is about is the owner's iPhone of 3 September 2026, at
fifty-nine pending and climbing by one per edit — and it will keep climbing after this
change, one key per edit, exactly as it does today. Only cheaper to carry.
