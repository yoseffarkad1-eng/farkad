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
