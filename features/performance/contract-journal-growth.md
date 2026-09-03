# Contract — the outbox that never prunes on a phone with no cloud

**This is not a change. It is the measurement, the mechanism, and the list of what has to be
decided before somebody makes one.**

No code in this wave touches `js/sync/sync.js`. The measurement below is committed as a
failing check in `tests/perf.test.mjs`, deliberately, the way `test:sendclaim` carried its
reproductions: the threshold is not loosened, and the red is the evidence.

## What was measured on the base

At `9e46032`, desktop Chromium in a container (see `findings.md` for the machine), six
hundred ordinary edits made one after another through `State.commit`, on a device with a
fortnight already recorded and **no cloud configured** — which is what all three of these
phones are today, because `js/sync/firebase-config.js` is empty.

| edits made so far | journal | save | render | total per edit |
|---|---|---|---|---|
| 1-50 | 0.52ms | 0.57ms | 2.93ms | **4.0ms** |
| 251-300 | 2.24ms | 3.14ms | 4.23ms | **9.6ms** |
| 451-500 | 3.64ms | 5.40ms | 5.69ms | **14.7ms** |
| 551-600 | 9.98ms | 13.32ms | 9.81ms | **33.1ms** |

At the end: **600 edits, 600 pending paths, 601 localStorage keys, none collectable.** The
boot that has to replay all of them answers a tap at 363ms rather than 225ms.

Desktop Chromium, in a container, a lower bound. Not a phone. The SHAPE — every edit costs
more than the last, without limit — is a property of the code and does not depend on the
machine.

## The mechanism

`collectQueueGarbage` (js/sync/sync.js) will let an operation go only when it is finished,
and finished is:

    return op.sent && scheduleHoldsEntry(stored, op.path, op.value);

Both halves, and the reason each is there is sound:

- `scheduleHoldsEntry` — the disk here must hold the value, or the journal is the only
  thing that can rebuild it after a crash. This is iron law 3.
- `op.sent` — the cloud must have it, or dropping the entry loses the one record that would
  ever have told the other two phones about this edit.

On a phone with a cloud, both become true and the queue drains. On a phone with **no**
cloud, `op.sent` is never true for anything, so nothing is ever collectable and the queue is
an append-only log of every edit ever made on the device. Nothing is lost by this and
nothing is wrong in it — it is simply unbounded, and the cost of every subsequent edit and
every subsequent boot is paid against it.

## What is NOT proposed here

Not a cap, not a size-based eviction, not a "drop the oldest N". Every one of those decides
which record of somebody's work to discard, and this repository does not discard a record to
buy speed (iron law 10 is the same instinct pointed at damaged data). Nothing in this
document should be read as a licence to do any of them.

## The question a person has to answer

**When may a device that has no cloud, and has never had one, forget a journal entry whose
value is provably in the written schedule?**

That is one question and it has at least three defensible answers:

1. **Never, as today.** The queue is the record that the edit exists as an *operation*, and
   the moment a cloud is configured — which the owner may do at any time — every one of
   those operations is what tells the other two phones about a season of local-only work.
   Under this answer the growth is the price of a decision already taken, and the right work
   is to make the growth cheaper (below), not to end it.
2. **Once the schedule holding it has itself been proved durable AND the device has never
   been paired.** A device with no `firebase-config.js` has no other phone to tell. But
   "has never been paired" is a claim about the future as much as the past, and the failure
   mode is silent: the owner fills in the config in March and a season of January work is
   invisible to the other two phones, exactly the failure the comment on `FarkadSync.edit`
   says the early-return version caused.
3. **Once a SNAPSHOT covering it has been written somewhere off the device** — the daily
   archive, or an exported backup. This is the only one of the three that keeps the
   guarantee whole, because there is then a second copy of the same fact that is not the
   journal.

Answering this needs the owner, not an agent: it is a decision about what the record is,
not about how fast it is.

## The work that does NOT need that answer

Two of the three growing columns can be made cheap without deciding anything about what may
be forgotten, and they should be measured separately before the question above is opened:

- **The journal column (0.52ms -> 9.98ms).** Every `queueOperations` call re-reads and
  re-decodes every operation key on the disk to build the projection. That is a decode
  cache, not a semantics change: the same operations, read fewer times. It touches
  `js/sync/sync.js`, so it needs its own contract and its own suite, but it does not need
  anybody to decide what may be forgotten.
- **The render column (2.93ms -> 9.81ms).** `render()` ends in `updateSyncNotice()`, which
  asks the outbox for a pending count on every redraw — so the queue is walked once per tap
  for a number on a status line. Same shape, same fix, same file.

The save column (0.57ms -> 13.32ms) is not this defect at all: it is the record itself
getting bigger, and `Store.setVerified` writing and reading it back is iron law 3 working
as designed.

## What must be true before any of it ships

1. The three phones are all past the build, read off each screen, not assumed. A queue
   format that a v103 phone writes and a v86 phone cannot decode is worse than a slow queue.
2. A backup exported from each phone that day, off the phone.
3. `tests/perf.test.mjs` re-run on the base commit and on the change, both numbers in the
   commit message, on one machine, in one sitting.
4. The whole release gate green on the change, run from a clean detached worktree, at the
   commit being asked about — `npm test` and `npm run test:release` reported separately.
5. A new suite that fails on the base: whatever is claimed about what the queue may forget,
   there is a device state that proves the old code forgot too much or too little.

## Base

`9e46032c310590983fd18c612455c1c4e105a238` (v103). The measurement above is reproducible
with `npm run test:perf`, suite "the journal a phone with no cloud accumulates".
