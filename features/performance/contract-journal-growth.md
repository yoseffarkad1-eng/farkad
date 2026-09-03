# Contract — the outbox that never prunes while the writes are being refused

**This is not a change. It is the measurement, the mechanism, and the list of what has to be
decided before somebody makes one.**

No code in this wave touches `js/sync/sync.js`. The measurement below is committed as a
failing check in `tests/perf.test.mjs`, deliberately, the way `test:sendclaim` carried its
reproductions: the threshold is not loosened, and the red is the evidence.

**The first version of this document had the premise wrong and it is worth writing down how.**
It said the growth applied to "a phone with no cloud", on the strength of CLAUDE.md's
sentence that sync "is optional and off until `js/sync/firebase-config.js` is filled in" -
which is a true statement about the MECHANISM and was read as a statement about the current
STATE. The file was never opened. It is filled in: `projectId` `farkad-schedule`, a live
apiKey, authDomain, storageBucket, messagingSenderId, appId, and
`SCHEDULE_DOC_PATH = 'schedules/current'`. Sync has been configured on this project for some
time, so "a phone with no cloud" is not the state of any phone and a contract resting on it
would have been arguing about a configuration that does not exist.

Correcting it makes the finding more urgent, not less.

## The state this is actually about

The owner sent a screenshot from his iPhone on 3 September 2026. The status line reads:

    שגיאת סנכרון - הנתונים שמורים במכשיר הזה. (59 ממתינים לשליחה)

A sync ERROR, with fifty-nine records pending. The cloud is configured and the writes are
being refused - most likely `permission-denied` under rules that have never been deployed.
Deploying `firestore.rules` is an owner-only action; it is named in
`docs/rollout-checklist.md` and `docs/firebase-setup.md`, and nobody working in this
repository may run it.

**Nothing is lost and nothing is slow at fifty-nine.** The record is on the phone, it is in
the outbox, and it will go the moment the rules land - that is exactly what a durable outbox
is for, and it is working. What is true, and what this document is about, is that the cost
of every edit grows without bound for as long as the writes keep being refused, and that
nobody would feel it until it was bad.

## The mechanism

`collectQueueGarbage` (js/sync/sync.js:1687) will let an operation go only when it is
finished, and finished is:

    return op.sent && scheduleHoldsEntry(stored, op.path, op.value);

Both halves, and the reason each is there is sound:

- `scheduleHoldsEntry` - the disk here must hold the value, or the journal is the only
  thing that can rebuild it after a crash. This is iron law 3.
- `op.sent` - the cloud must have it, or dropping the entry loses the one record that would
  ever have told the other two phones about this edit.

**A write that is refused is never sent, so it is never collectable.** The queue is then an
append-only log of every edit made since the refusals began, each in its own localStorage
key, decoded on every queue write and replayed onto the schedule at every boot. It climbs by
one for every edit any of the three men makes, and it will keep climbing until the rules are
deployed.

## What was measured on the base

At `9e46032`, headless Chromium in a container (see `findings.md` for the machine), six
hundred ordinary edits made one after another through `State.commit`, on a device with a
fortnight already recorded and every write ending unsent.

| edits made so far | journal | save | render | total per edit |
|---|---|---|---|---|
| 1-50 | 0.52ms | 0.57ms | 2.93ms | **4.0ms** |
| 251-300 | 2.24ms | 3.14ms | 4.23ms | **9.6ms** |
| 451-500 | 3.64ms | 5.40ms | 5.69ms | **14.7ms** |
| 551-600 | 9.98ms | 13.32ms | 9.81ms | **33.1ms** |

At the end: **600 edits, 600 pending paths, 601 localStorage keys, none collectable.** The
boot that has to replay all of them answers a tap at 363ms rather than 225ms.

The owner is at 59. On this table that is still in the first band, which is why the app feels
fine to him and why this is being written down now rather than after somebody complains.

Desktop Chromium, in a container, a lower bound. Not a phone. The SHAPE - every edit costs
more than the last, without limit - is a property of the code and does not depend on the
machine.

### What that run reproduced, and what it did not

The container cannot reach `gstatic.com`, so the Firebase SDK import fails
(`ERR_TUNNEL_CONNECTION_FAILED`), `connectCloudLater` resets `cloudStarted`, no adapter is
ever installed, and the status line reads «הנתונים נשמרים במכשיר הזה בלבד». Verified
directly rather than assumed.

So the run reached `op.sent === false` **by a different route than the owner's phone does**:
no adapter at all, versus an adapter whose writes come back refused. The dead end is the
same one and `collectQueueGarbage` cannot tell them apart - it asks `op.sent` and nothing
else - so the growth curve above is the same curve. What the run did NOT pay is everything
the send path does on a phone that IS connected: the flush timer, the send claim, the retry
ladder, and the error the status line is rewritten with. **The numbers above are therefore a
lower bound on the owner's phone twice over** - once for the machine, once for the work his
phone does that this one never attempted.

## The actual remedy, which is not a code change

**Deploy `firestore.rules`.** The queue drains, `op.sent` becomes true for the fifty-nine and
for everything behind them, `collectQueueGarbage` starts collecting again, and the growth
stops - without anybody having to decide anything about what may be forgotten. That is the
first thing to do and it makes the question below hypothetical again.

It is the owner's action. `docs/rollout-checklist.md` has the order (rules before clients,
measured in `tests/rollout.test.mjs`), and neither an agent nor a reviewer may run it.

## What is NOT proposed here

Not a cap, not a size-based eviction, not a "drop the oldest N". Every one of those decides
which record of somebody's work to discard, and this repository does not discard a record to
buy speed (iron law 10 is the same instinct pointed at damaged data). Nothing in this
document should be read as a licence to do any of them.

## The question, reframed - and it is strictly harder than it was

**When may a device whose writes are being REFUSED forget a journal entry whose value is
provably in the written schedule?**

Harder than "a device with no cloud", because a refused write is not a write with nowhere to
go: it is a write that may become sendable the moment the rules land. Forgetting one would
lose a real record that was about to travel. The three answers the first version of this
document offered do not survive that reframing equally, and here is which is which:

1. **Never, as today. — SURVIVES, and is strengthened.** The queue is precisely what will
   carry the owner's fifty-nine records to the other two phones when the rules are deployed;
   every one of them is a real edit that has not reached anybody else. Under this answer the
   growth is the price of a decision already taken correctly, and the right work is to make
   the growth CHEAPER (below), not to end it.
2. **Once the schedule is durable and the device has never been paired. — DOES NOT SURVIVE.**
   It rested entirely on the premise that was wrong. Every phone here is paired: the config
   is live and `SCHEDULE_DOC_PATH` is set. There is no unpaired device to reason about, and
   the answer is now simply inapplicable rather than merely risky.
3. **Once a snapshot covering it exists off the device. — SURVIVES, but narrower than it
   looked.** The daily archive `FarkadSync` writes is written through the same path that is
   being refused, so on a phone in this state there IS no off-device copy from it. What still
   counts is a backup file the owner exported himself. So this answer reduces to: an entry
   may be forgotten once a human-exported backup covering it exists - which is a much smaller
   and much rarer condition than it first read as, and one the app cannot verify on its own.

Answering this needs the owner, not an agent: it is a decision about what the record is, not
about how fast it is. And it does not need answering at all if the rules are deployed.

## The work that does NOT need that answer

Two of the three growing columns can be made cheap without deciding anything about what may
be forgotten, and they should be measured separately before the question above is opened:

- **The journal column (0.52ms -> 9.98ms).** Every `queueOperations` call re-reads and
  re-decodes every operation key on the disk to build the projection. That is a decode
  cache, not a semantics change: the same operations, read fewer times. It touches
  `js/sync/sync.js`, so it needs its own contract and its own suite, but it does not need
  anybody to decide what may be forgotten.
- **The render column (2.93ms -> 9.81ms).** `render()` ends in `updateSyncNotice()`, which
  asks the outbox for a pending count on every redraw - so the queue is walked once per tap
  for a number on a status line. Same shape, same fix, same file. Note that this one is paid
  on the owner's phone right now: the count in his status line, «(59 ממתינים לשליחה)», is
  that walk.

The save column (0.57ms -> 13.32ms) is not this defect at all: it is the record itself
getting bigger, and `Store.setVerified` writing and reading it back is iron law 3 working
as designed.

## What must be true before any of it ships

1. The three phones are all past the build, read off each screen, not assumed. A queue
   format that a v103 phone writes and a v86 phone cannot decode is worse than a slow queue.
2. A backup exported from each phone that day, off the phone. On a phone in this state that
   export is the ONLY off-device copy of the pending records - see answer 3 above.
3. `tests/perf.test.mjs` re-run on the base commit and on the change, both numbers in the
   commit message, on one machine, in one sitting.
4. The whole release gate green on the change, run from a clean detached worktree, at the
   commit being asked about - `npm test` and `npm run test:release` reported separately.
5. A new suite that fails on the base: whatever is claimed about what the queue may forget,
   there is a device state that proves the old code forgot too much or too little.

## Base

`9e46032c310590983fd18c612455c1c4e105a238` (v103). The measurement above is reproducible
with `npm run test:perf`, suite "the journal an unsent queue accumulates". The state it is
about is the owner's iPhone screenshot of 3 September 2026, at fifty-nine pending and
climbing.
