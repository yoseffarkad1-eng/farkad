# Contract — the design before the code: one rule for every fact two windows share

Written after the THIRD independent review refused `9c98399`. The review's first
instruction was the right one: not scattered patches, but a consistent design for data
safety, then the fixes it implies, proven by tests that fail first.

Base under review: `9c98399ebd3e3b2b37c44088598e0de0904f8867` (v163).

## 0. A correction first, because it changes the premise

**Both money gates are OPEN in this build, and have been since v116.**

    js/model/ledger.js:49   const LEDGER_WRITES = true;
    js/model/schema.js:63   carryAdvances: true
    opened in e5b70f2 ("Stage tested v116 candidate")

`features/stale-window/handoff.md` said they were "still shut and still pinned shut" and
called the ledger mirror "dormant in this build, both money gates being shut". That was
false, and it is corrected in the same round as this contract. The suites that assert a
closed gate do so **through the test seam**, not against the shipped default
(`tests/data.test.mjs:9423`, `tests/smoke.mjs:62`), so a green gate never contradicted the
claim.

`CLAUDE.md`'s first iron law also still says `LEDGER_WRITES` "is `false`". That is the
project's own constitution and rewriting a law is not this round's decision, so it is
named here and left for the owner. **It is why the handoff was wrong**: the law was read
and believed instead of the file.

What this changes about the work below: the ledger mirror is a LIVE whole-record writer,
not a dormant one, so `State.migrateLedger` is in scope as a writer and its silence is a
real risk rather than a theoretical one. No accounting rule, rate, advance or pay cycle is
touched by anything in this contract.

## 1. The five sources of truth, as they actually are

Read off the code, not off the comments:

| family | where it lives now | survives a reopen | seen by another window |
|---|---|---|---|
| **what the user saw** — the base an edit was built on | `State.durableText`, a string in memory (`js/state.js:275`) for the DISK side; `item.seen` marks per operation, durable, for the CLOUD side | cloud side yes; **disk side no** | no |
| **confirmed local data** | the `scheduleData:v2` blob, written and read back by `Store.setVerified` | yes | yes, via `Store.durableGet` |
| **pending operations** | one key per operation, `farkad:outbox:op:<id>`, plus slot marks | yes | **yes** — re-read off the disk on every call (`physicalOperations`, `js/sync/sync.js:1379`) |
| **held operations** | `farkad:hold:<opId>` on the disk; `_heldNow` / `_heldDurable` in memory | on the disk yes | **no** — `loadHolds` runs once per session behind `loadOutbox`'s `if (this._loaded) return` (`js/sync/sync.js:1287`) |
| **acknowledged cloud data** | `farkad:revision` on the disk, `_revision` / `_revisionLoaded` cached in memory, `_baseDoc` in memory, `sent` per operation | revision yes; `_baseDoc` no | revision key is shared but **cached per session** |

The incoherence is visible in the right-hand columns. **The queue obeys four clauses that
nothing else does:** it lives on the disk, one key per fact; a single `setItem` owns each
key, so no two windows write the same bytes; it is read at the moment it is used rather
than cached for the session; and nothing in it is lowered or replaced by a writer holding
an older view. Its own comment says so in full (`js/sync/sync.js`, above `decodedQueue`:
"the disk is read here on every call, every time… there is no signal being trusted, and
so no signal to get wrong").

Every defect below is a family that breaks one of those four clauses.

## 2. The rule

> **A fact two windows share lives on the disk under its own key; it is read at the moment
> it is used, never cached for the session; it is written by one `setItem`, so ownership is
> per key and needs no lock; and it is never lowered, nor replaced by a writer holding an
> older view of it.**

This is not a new mechanism. It is the queue's rule, applied to the four families that
were left out of it. It needs no atomic test-and-set, which is what makes it buildable
here: per-key ownership and read-at-use together give the ordering that a lock was being
asked for and could not provide.

## 3. The two guarantees the rule is for

- **G1 — no regression.** A write carrying an older view of a record never replaces a
  newer one. For every writer this build controls, by refusing the write. For a writer it
  does not control — an older build — by making the regression DETECTABLE and the lost
  fields re-assertable, because refusing is not available against code already on a phone.
- **G2 — a way back.** Every field value this device has confirmed stays reconstructible
  until something newer for that field is confirmed, **including after the cloud has
  acknowledged it and the collector has taken it off the queue.**

## 4. The defects this design closes, each proven from the code

**D1 (F3) — the base the user saw is lost, and the other window's value takes its place.**
`durableText` is memory only. When `save()` is refused the base stays at what this window
loaded; on the next open, `loadRecord` sets `durableText` from whatever the disk now holds
(`js/state.js:92`), which may be the OTHER window's value. `contestedPaths` then compares
against that as "base" (`js/state.js:506`), finds base equal to theirs, reports no
conflict, and `diskVerdict` rebases — so the queued edit overwrites the other window's
record with nobody told. The journal-only and replay paths are exactly where this bites.

**D2 (F3) — a hold is durable but invisible to the window that will send it.**
`loadHolds` is called inside `loadOutbox` after `if (this._loaded) return`
(`js/sync/sync.js:1287`). The queue beside it is re-read from the disk on every single
call. So window B writes `farkad:hold:<opId>`, window A's next flush sees the operation
and does not see the hold, and sends it.

**D3 (F3) — a hold that could not be written stops nothing but this session.**
`holdHere` swallows the write failure deliberately; `_heldUnreadable` records that a hold
record would not parse. Neither bars the send anywhere but in the memory of the window
that noticed. A reopen, or any other window, sends the operation nobody decided about.

**D4 (F3) — the decision is not bound to the operation, and the hold is never released.**
`FarkadSync.releaseHold` has **no caller anywhere in `js/`**. `resolveHeldRecord`
(`js/ui/settings.js:513`) answers by issuing a fresh operation that names the held one in
`after`; the hold KEY is left on the disk for ever. Two consequences, both measurable:
`isHeldHere` filters the journal replay **by path**, so once a path's hold key exists every
later edit at that path — the person's own decision included — is suppressed from the
replay at every reopen; and `describeHeldRecord` offers a decision only when
`decidable: heard && readable` (`js/ui/settings.js:500`), so a two-window hold on a device
with no cloud configured can never be answered at all. v163 added a hold family the
interface cannot resolve.

**D5 (F4) — after acknowledgement and collection there is no way back.**
The collector's gate is `op.sent && scheduleHoldsEntry(stored, op.path, op.value)`. Once
both are true the operation is removed. If the blob afterwards regresses — an older build
writing its own stale memory over it — the device holds no second copy: not in the queue,
not anywhere. On a device with no cloud configured the edit is simply gone.

**D6 (F5) — the shared revision can be lowered, by this build.**
`rememberRevision` writes `String(said)` unconditionally, and `loadRevision` caches for
the session behind `_revisionLoaded`. Window A reaches revision 9 and writes it; window B
loaded 7 at open and never re-reads; B adopts a snapshot at 8 and writes **8 over 9**.
Both functions are v163's own. The server cannot be made to lower the shared revision —
`nextRevision()` in `firestore.rules:86` requires exactly one more, and `legacyWrite()`
(`:154`) is gated on `noRevisionYet()`, so after cutover an old phone cannot flatten it —
which makes the device key the only place this can go backwards.

## 5. What will be true when this ships

1. The base an edit was built on is recorded **with the operation**, durably, for the disk
   side as it already is for the cloud side, and a reopen compares against the base the
   person actually saw rather than against whatever is on the disk now.
2. Holds are asked of the disk at the moment the send decides, like the queue. No window
   sends an operation another window has held.
3. A hold that cannot be written down, or cannot be read back, **bars the send** for that
   operation device-wide; if even the bar cannot be written, the flush refuses rather than
   sending.
4. A person's decision is written down as its own durable record naming the operation, and
   the send is permitted only after it is. The hold is released by that record and by
   nothing else. The replay filter asks about the OPERATION, not the path, so a decision
   is never suppressed by the hold it answers.
5. Every two-window hold is answerable in the interface, including on a device with no
   cloud configured, and the test drives the real button.
6. A regression of the record by a writer this build does not control is detected, named,
   and recoverable field by field from a shadow copy of the last confirmed record that
   older builds do not write.
7. The shared revision is written monotonically — read, compare, write only if higher —
   and is re-read at use rather than cached for the session.

## 5a. OPEN — G2 is NOT met as written. This needs the owner's decision.

Recorded here because a reworded test going green is not a defect closed, and the third
review was right to say so.

**What §3 promised.** "G2 — a way back. Every field value this device has confirmed stays
reconstructible until something newer for that field is confirmed, **including after the
cloud has acknowledged it and the collector has taken it off the queue.**" And §5 item 6
named the mechanism: "recoverable field by field from a shadow copy of the last confirmed
record that older builds do not write."

**What v164 actually does.** The shadow copy is NOT there. What is kept is the stamp of
the last confirmed record - `updatedAt`, about sixty bytes - which detects the regression
and names it. The recovery comes from two places that already existed:

| the device | after acknowledgement AND collection | from the device alone, with no network |
|---|---|---|
| never had a cloud | **cannot happen** - `op.sent` is never true, so nothing is collected; `retired` and `superseded` only ever remove an operation a NEWER one for the same path has replaced | **yes** - the journal holds the current value of every field ever edited (D5b) |
| has a cloud now | happens; the cloud holds every collected value by the gate's own condition | **no** - the next snapshot merge brings it back, which is a network |
| had a cloud, then lost it for good | happens; the collected values are in a cloud this device can no longer reach | **NO. This is the gap.** |

**So the exact change in the guarantee:** offline, device-alone reconstruction after
acknowledgement and collection held while the whole-record shadow existed, and does not
hold now for one case - a device that had a cloud, collected operations, and then lost
cloud access permanently (project deleted, credentials revoked, `firebase-config.js`
emptied). For that device, an older build writing the record away loses the collected
days, and nothing local brings them back.

**Why it was taken out, measured rather than argued.** A whole-record shadow is one
permanent extra copy, and the capacity model has two agreed behaviours it cannot coexist
with whichever way it is accounted for:

- **In the reclaim ladder** → `tests/capacity.test.mjs`, "a device with nowhere left
  refuses the edit rather than claiming it": that device has no restore points, so the
  shadow becomes the thing the ladder sells, and a refused edit stops moving zero bytes.
- **Out of the ladder** → it is pure pressure. `tests/data.test.mjs` C1, measured: 5,084
  bytes used against a 2,793 budget, of which 848 were the shadow, leaving 271 free where
  a copy costs 798. The device is then called critical for carrying the very copy that
  was supposed to be expendable.

**The three ways out, put to the owner.** Not for the hand that wrote the code. Named
rather than numbered, because the list below and the list in the question put to the owner
were in different orders and a number is the one thing that cannot survive that:

- **THE BOUNDED RING** - the last N collected field writes, path and value. Meets G2 for
  the last N confirmed writes offline and from the device alone; anything older falls back
  to "the stamp alone". Costs N field records rather than a copy of the whole schedule.
  **This is what the owner approved**, presented to them as the first of the three, and it
  is what ships. Its measured numbers are below.
- **The stamp alone** - zero bytes, both capacity behaviours intact, the gap accepted and
  written down. The case it fails is a device that loses its cloud for good.
- **The whole-record shadow** - meets G2 literally, and requires changing ONE of the two
  capacity behaviours deliberately. **Not approved, not implemented.**

**WHAT WAS OFFERED AND WHAT WAS MEASURED, reconciled, because they differ.** The option as
put to the owner said N would be chosen so the ring stays under "the 271-byte margin C1
measures". That figure does not govern this, and saying so is the correction:

- **271 bytes is a FIXTURE margin, not a production budget.** It is what is left in
  `tests/data.test.mjs` C1 after that suite sets `Store.budget = copy * 3.5` on a device
  whose whole record is 798 bytes. Production `Store.budget` is `5 * 1024 * 1024`
  (`js/store.js`).
- **It does not bind the ring at all**, because C1's device has no cloud: nothing is ever
  marked `sent`, so nothing is ever collected, so the ring is never written there. The
  whole-record shadow was written on every save, which is why it did bind.
- So the real limit had to be measured and set, not inherited from a fixture. It is below.

**THE ENFORCED LIMITS, measured on a realistic crew** - 20 workers, 12 sites, one man on
two sites, record 5,786 bytes:

| | |
|---|---|
| count | **32 field paths** (`KEPT_LIMIT`) |
| bytes | **a quarter of the record, 32 KB ceiling, floor of one entry** |
| a worker-day entry | about **440 bytes** |
| count-only ring, as first written | **17,520 bytes - three times the record**, because its largest entries were whole-roster paths that grow with the crew, not with N |
| after the `replacesWhole` filter | **440 bytes** on the same device |
| which bound bites | the BYTES below a ~56 KB record; the COUNT above it, at about 14 KB |
| worst case | `max(one entry, a quarter of the record)`, capped at 32 KB - on a tiny record that is one entry, about 440 bytes |

The floor exists because without it the guarantee was empty where it was needed most: on a
1,500-byte record a quarter is 375 bytes and one day entry is 440, so nothing at all was
insured. **It is a stated trade-off, not a silent one:** past the floor the ring can never
shift a capacity verdict by more than a quarter of one threshold step; at the floor it can
shift it by one entry.

Only the families where a queued value REPLACES what is there are kept - `replacesWhole`,
the same classification the pre-send hold uses. A whole-roster array merges per id and an
added worker is additive rather than a correction, so keeping those cost 15 KB of the 17.5
and bought nothing the snapshot merge does not already do.

**DECIDED by the owner: the BOUNDED RING, and explicitly as a bounded local ring rather
than an unlimited G2.** What ships:

|  |  |
|---|---|
| N | **32 field paths** (`KEPT_LIMIT`, `js/sync/sync.js`) |
| per entry | one field path and its value - **measured at about 440 bytes** for a worker-day |
| byte budget | **a quarter of the record, 32 KB ceiling, floor of one entry** - enforced, not estimated. See the reconciliation above for why an earlier "10-13 KB" figure was wrong |
| kept families | only `replacesWhole` paths: a day, a ledger entry, one field of one person |
| when written | at COLLECTION only, so a device with no cloud pays nothing - it never marks anything `sent`, so it never collects |
| key | one per PATH (`farkad:kept:<path>`), a single `setItem`, so a second confirmation of the same field replaces its own entry |
| bound applied | after the write, oldest first, ordered by the operation's own `seq` - a timestamp is not an order, and thirty-three collections inside one millisecond proved it |
| ladder | **not currency.** `Store.reclaim` sells restore points and nothing else |

**What is recovered:** the newest confirmed value of each of the last 32 collected field
paths, from the device alone, offline, after acknowledgement and collection. Measured in
`tests/codex3.probes.test.mjs` D5c: the cloud acknowledges, the collector takes the
operation, the adapter is dropped for good, an older build writes the day away, and the
day comes back with no network and no journal entry.

**What is NOT guaranteed:** anything past N - the 33rd collected path back and older. For
those the recovery is still the cloud, and on a device that has permanently lost its cloud
they are **not recoverable locally**. `tests/codex3.probes.test.mjs` D5d measures that
edge rather than leaving it implied: 33 collected paths, the newest kept, the oldest gone.

**And the behaviour that did NOT change:** a device with no restore points and not a byte
to spare still refuses the write and moves not one byte. `tests/capacity.test.mjs` owns
the full version; D5's own suite asks the one line of it the ring could have broken, **on
a device that has synced and whose ring holds six real entries** - measured at 2,580 bytes
of a 2,939-byte cap. An empty ring proves nothing there, and the first draft of that suite
had one: the device had never synced, so there was no insurance on the disk for the ladder
to have sold. Asserted on refusal: the edit is refused, not one byte of the device moves,
every ring entry is still present, and the ring is the same size to the byte.

G2 as written in §3 - "every field value this device has confirmed" - is therefore still
**not** met in full, by decision rather than by oversight. It is met for the last 32.

## 6. Out of scope, deliberately

- No accounting change of any kind: no rate, advance, pay cycle, report arithmetic, or
  ledger rule. The two gates stay exactly as they are; this round only stops describing
  them wrongly.
- No change to `firestore.rules`' revision arithmetic. It is already correct and the
  emulator suites measure it.
- `CLAUDE.md`'s stale first law is reported, not rewritten.
- No push, merge, deploy or Preview; `main` untouched; no real worker data, no production
  Firebase, no permissions or shared settings.

## 7. What is NOT available, said before the code rather than after

**There is still no synchronous mutual exclusion on this platform**, for the reasons set
out in `handoff.md`: `localStorage` has no test-and-set and no transaction, and
`navigator.locks` is asynchronous while every write path here is synchronous by
construction. This contract does not claim to close that. What it claims is narrower and
checkable: that no fact two windows share is held in one window's memory, and that every
decision which must survive a crash is on the disk before the action it authorises.

**Against an older build, refusal is not available.** Code already on a phone cannot be
given a new rule. G1's second half is detection and recovery for exactly that reason, and
a shadow copy one generation deep is what it buys — not a guarantee that the regression
cannot happen.
