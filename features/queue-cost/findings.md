# What the queue cost, and what it costs now

One machine, one sitting: Intel Xeon @ 2.80GHz container, Ubuntu 24.04, node v22.22.2,
Playwright 1.56.1, headless Chromium, `npm run test:perf`. Base `50e467b`; the change is
the commit this file is in. Desktop Chromium in a container is a LOWER BOUND and none of
it is a measurement of a phone; `features/performance/findings.md` says why at length
and all of it applies here.

## Where the time was going

At 600 unsent operations across 601 storage keys, measured in the page:

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
| cloning all 600 queued values, which `decodeQueue` already did per call | 0.32ms |
| shallow-copying all 600 operation objects | 0.09ms |

**A fifth of a question about the queue was reading the disk. Four fifths was decoding
bytes that had already been decoded.** The JSON parse was not the cost — `BATCH_CACHE`
already held it. The cost was everything above the parse, rebuilt per call: 600 operation
objects, 1,800 mark-key concatenations and Set probes, the `after` cross-path and cycle
passes, the twenty-five-slot legacy scan, and the sort.

And the question was asked four times per edit, by stack:

| when | who asks |
|---|---|
| journal | `queueOperations` → `projectedQueue` → `physicalOperations` |
| journal | `queueOperations` → `physicalOperations` |
| save | `collectQueueGarbage` → `physicalOperations`, and a second bare `decodeQueue` beside it |
| render | `updateSyncNotice` → `pendingCount` → `_outbox` → `projectedQueue` → `physicalOperations` |

## Either side of the change

`npm run test:perf`, suite "the journal an unsent queue accumulates" — 600 ordinary edits
made through `State.journal` / `State.save` / `render()`, no adapter, so nothing is ever
sent and nothing is ever collectable:

| band | journal | save | render | total |
|---|---|---|---|---|
| 1-50, before | 0.4ms | 1.1ms | 3.0ms | **4.6ms** |
| 551-600, before | 9.3ms | 14.9ms | 10.2ms | **40.4ms** |
| 1-50, after | 0.4ms | 1.4ms | 3.1ms | **5.0ms** |
| 551-600, after | 2.7ms | 7.3ms | 5.2ms | **15.2ms** |

A second independent run of the same suite on the same tree, which is what this file's
own methodology asks for: first 25 4.1ms (journal 0.3, save 0.9, render 2.9), last 25
**15.6ms** (journal 2.7, save 7.4, render 5.3). The two runs agree to within half a
millisecond on every column of the band that matters.

The six-hundredth edit went from **8.8x the first to 3.0x**. The journal column, which is
the one the contract named first, went from 9.3ms to 2.7ms. The render column — the walk
`updateSyncNotice` was doing for the number in the owner's status line — went from 10.2ms
to 5.2ms, of which about 0.9ms is now the queue and the rest is drawing the screen. The
first band did not move and was not meant to: fifty operations deep, there is nothing to
decode twice, and the difference between 4.6ms and 5.0ms is this container's weather.

The save column moved because `collectQueueGarbage` runs from `State.save` and was one of
the four askers. `State.save()` stringifying the whole schedule and reading it back through
`Store.setVerified` is untouched; that is iron law 3 and it is what the remaining 7.9ms
mostly is. The whole suite is 48/48 on the change and was 46/48 on the base — the two reds
being the committed reproduction above and one `boot ... under 60ms` at 70.9ms, which is
this container being busy and is green on the change's run.

## What did NOT change, and is the point

600 edits still leave **600 pending paths across 601 storage keys**, unsent and
unprunable, on both trees — `perf.test.mjs` checks it beside the timing and
`tests/queuecost.test.mjs` checks it four ways in Node. `collectQueueGarbage` still returns
`op.sent && scheduleHoldsEntry(...)`. Nothing was capped, expired, evicted or forgotten,
and the queue still grows by one per edit for as long as the writes are refused.

## One thing the contract did not foresee, and the reversal it caused

The first version of this change also collapsed `queueOperations`' two readings of the disk
into one - it takes `projectedQueue()` and then `physicalOperations()`, and with the decode
shared the second looked like pure waste. `tests/adversarial.test.mjs` A1 stopped at its
setup:

    SETUP FAILED: both operations are on the disk, neither naming the other  — ["0mtlcuzy6_vuq3yzq51yf6"]

**The gap between those two reads is a behaviour, not an accident.** It is the window in
which the other tab's write lands unseen by this one, so that neither names the other in
`after` and the two are GENUINELY concurrent - the only state in which the projection has
to decide by rule rather than by record, and the state A1 and C1-C5 exist to be sure about.
Both suites open their race on the second of those two reads (`twoTabsRace`, in
`tests/adversarial.test.mjs` and `tests/concurrency.test.mjs`), so the failure was the
suites saying, correctly, that the window had been narrowed.

It was put back, with the reason written above it in the code. The second reading now costs
a re-read of the disk instead of a rebuild of every operation on it, which is what the
decode cache was for; the journal column is 2.7ms rather than the 1.6ms the collapsed
version measured, and the 1.1ms difference buys a race that stays as reachable as it was.

## The honest residual

The disk is still read for every question, and that read is O(the queue): 0.86ms at 600
keys, of which 0.57ms is `queueKeys()` classifying and sorting them and 0.29ms is reading
their bytes. **That floor was not removed and could not be honestly removed.** Skipping it
would mean answering out of a cache without asking the disk, and the only signals available
for deciding when that is safe are this tab's own record of what it did (wrong the moment a
second tab writes), `localStorage.length` (blind to a slot mark rewritten in place), and
`Store`'s write tick (best-effort by design — a tick that cannot be written does not fail
the write beside it, so a cache resting on it would be wrong exactly on the full disk where
it matters most). `capacityState` in `js/ui/backup.js` accepts a signal of that kind and
documents why it can: it answers a threshold, and being slightly stale costs nothing. A
count of somebody's unsent work is not a threshold.

So the slope was reduced by about a factor of five and not to zero, and the remedy for the
growth itself is still to deploy `firestore.rules`.

## What has and has not been run on this commit

`npm test` — 45 suites, 4448/4448, exit 0. The browser suites — smoke 1130, print 78,
mobile 817, update 30, forms 10, recovery-browser 25, handover 26, swrestart 31,
swidentity 55 — all green, run one at a time. `npm run test:perf` — 48/48.

**The emulator suites were NOT run here, deliberately.** The Firestore emulator takes port
8080 out of `firebase.json` and every worktree on this machine asks for the same one, so
two of them cannot run at once (`tests/README.md` says so). They are run centrally on the
integrated tree, and until they have been, this change is not release-gated - it is
`npm test` and the browser suites green, which is a different and smaller claim.
