# The ordering protocol — two designs, and the one that was chosen

Status: DESIGN + client implementation + rules, all tested against the local emulator.
**Nothing here has been published to the real project.**

## What is actually broken

Three phones share one Firestore document. Ordinary edits send one field path each
(`days.<date>.<layer>.<worker>`) and Firestore merges them server-side, so two people
filling in the same evening both land. That part works and is not what this is about.

What does not work is everything that is not a disjoint field merge:

- A whole-document restore races an ordinary edit, and the loser is silent.
- A request that may still land is treated as dead, and the work is sent twice or
  dropped.
- A stale writer overwrites a newer document, and nothing on either phone notices.
- The local send claim (`js/sync/send.js`, `SEND_CLAIM_KEY` in `js/sync/sync.js`) is a lease in
  `localStorage`. It coordinates **tabs of one browser profile**. It has never been able
  to order writes across phones and cannot be made to: the three phones share no storage.
  That is the whole of what `tests/sendclaim.test.mjs` was measuring, and why 25 of its
  66 checks were red. They are not red any more, and none of them was closed by weakening
  what it asserts: the suite was rewritten around the protocol below, and stands at 43
  of 43. The claim itself still coordinates only tabs - that has not changed and cannot -
  but it is no longer the thing being asked to order three phones.

The server is the only party all three phones can agree with. So the ordering has to be
enforced there.

## Design A — per-document revision, CAS in a transaction, immutable receipts

The schedule document carries two extra fields:

    protocol   an integer, the protocol version the writer speaks
    revision   an integer, incremented by exactly one on every accepted write

Every mutating operation is a transaction:

1. Read the document. Its `revision` is the authoritative base — never a cached one.
2. Read `schedules/{docId}/receipts/{opId}`. If it exists, this operation has already
   been applied: return success without touching anything. Idempotent by construction,
   which is what makes a request that "may still land" safe to retry.
3. If `expectedBase !== revision`, do not write. Return a conflict.
4. Otherwise apply the patch, set `revision = revision + 1`, and create the receipt.
   All three in the one transaction, so a reader never sees a revision without its
   receipt or a receipt without its revision.

Each operation carries a stable identity computed on the device that made it:
`opId`, `writeId`, a hash of the payload, the protocol version, the restore epoch, and
the `expectedBase` it was built against. None of them is a timestamp. `updatedAt` stays
exactly what it is today - a phone clock, informational, never load-bearing.

A whole-document restore is the same transaction with a stricter test: the global base
revision AND a hash of the document it is replacing. A missing document is an explicit
authoritative base (`revision 0`), not an absence to be papered over.

**Conflict is not failure.** On conflict the client does not overwrite, does not
acknowledge, does not prune the queue, keeps its local bytes byte-identically, leaves
the remote alone, records a durable conflict and surfaces it. The status line may not
say synced while one is held.

Cost: one transaction per write instead of one `updateDoc`. Two documents read per
operation. Receipts accumulate and need a retention rule.

## Design B — append-only operation log, folded on the client

Clients never write the schedule document at all. Every edit is a CREATE at
`schedules/{docId}/ops/{opId}`, and the schedule is folded from the log, ordered by
`(lamport, deviceId, opId)`.

Creates with a client-chosen id never conflict, so there is no CAS and no retry storm.
Duplicate delivery is free: the second create of the same `opId` is refused by the rules
and that refusal means "already recorded". The whole history is auditable, which for a
pay record is worth something on its own. A restore is one operation carrying a
supersession fence, and everything before it is folded away rather than deleted.

Cost, and it is the reason this was not chosen: every client must fold the entire log on
every open, so the log needs compaction and compaction needs a writer that all three
phones trust. It changes the read path, the write path, the offline path and the restore
path at once — on a build whose whole purpose is to stop losing data. And a v86 phone
does not write operations at all, so during any rollout the log is not the record; the
document is, and both have to be maintained.

## The one that was chosen: A

Design A keeps the document model the app already has, changes only the write path, and
can be made backward-compatible in an explicit, observable way. Design B is the better
protocol on paper and the wrong change to make in the same release as four data-safety
repairs. It is written down here so the next person does not have to rediscover it.

## Backward compatibility, said plainly — and the rollout that actually runs

A v86 phone writes no `protocol` field and no `revision`. There is no rule that both
accepts those writes AND orders them — accepting them ordinarily IS the hole. The first
draft of this file therefore said: publish nothing until all three phones are updated.
That sentence was not a plan, and the emulator is what proved it. Both orders fail:

- **Rules first.** Publishing rules that demand `protocol` breaks every phone in the
  field the same minute. The one that has not updated yet writes `permission-denied` on
  every tap of a day it just recorded.
- **Phones first.** Waiting until all three are updated does not help either, because
  until the new rules are published there is no `receipts` subcollection in them: the
  updated phones' protocol writes are refused by the rules that are still live. And the
  live schedule document has never carried a `revision`, so `nextRevision()` asks it for
  `null + 1` and refuses — for ever. Without an exception the document that actually
  holds the work can never take its first protocol write at all.

So the rules carry a transition, and it is exactly two rules wide (`firestore.rules`,
`legacyWrite()` and `bootstrapRevision()`):

- **`legacyWrite()`** — a write with no `protocol` is accepted *only while the document
  still has no `revision`*. That is the un-updated phone, working normally, during the
  window.
- **`bootstrapRevision()`** — a protocol write may claim `revision == 1` over a document
  that has no revision yet, provided it carries its receipt like any other. That is the
  first updated phone bringing the live document into the protocol.
- **`bootstrapTouchesOnlyProtocol()`** — and it may touch NOTHING ELSE. The exception
  exists to bring a legacy document into the protocol, and that is all it is allowed to
  do, so the rule asks the request itself:

      request.resource.data.diff(resource.data).affectedKeys()
        .hasOnly(['protocol', 'revision', 'lastOpId', 'updatedAt', 'updatedBy'])

  Without it, the one write that is exempt from `nextRevision()` was also the one write
  that could carry a day, an advance, a whole ledger or a roster past every ordering
  check — at revision 1, with a valid receipt, refused by nothing. It is a rule about
  the AFFECTED KEYS rather than about the values, because a rule that lists what a
  payload may not contain is a list somebody has to remember to extend.

The moment a revision lands, `noRevisionYet()` is false: `nextRevision()` governs every
later write, and a phone that does not speak the protocol is refused. **The first
protocol-capable write closes the door behind itself.** The exception cannot be reused to
reset the count, because a write claiming revision 1 over a document already at 7 fails
both halves.

### The order of operations, as implemented

1. **Publish these rules.** Nothing breaks: a phone that has not updated keeps writing
   through `legacyWrite()`, because the live document still has no `revision`.
2. **Ship the candidate build** to the phones, in whatever order they happen to update.
   No census is needed and no phone has to be offline.
3. **The first updated phone writes.** Its write bootstraps the document: `protocol`,
   `revision = 1`, `lastOpId`, and the immutable receipt at
   `schedules/{docId}/receipts/{opId}` — created in the same commit, enforced by
   `getAfter()`, so a revision never exists without the operation that explains it. If
   two updated phones race, exactly one bootstrap lands; the loser gets a conflict
   carrying the authoritative document, rebases its disjoint edit and lands at revision 2.
   Nothing is lost and nothing is acknowledged twice.
4. **Cutover is that write.** From it on, a phone still on the old build is refused with
   `permission-denied`, surfaces a visible sync error, keeps its queue durably and does
   **not** say synced. It cannot flatten the ordering fields, and it cannot diverge
   quietly. That refusal is the point: it is loud, and the work is still on the phone.
5. **Watch the canary complete a full evening**, then confirm no held conflicts on any
   phone.

Two operational steps stand outside the code and are still required when this is
performed for real, as a separately reviewed operation and **not from this repository**:
save the currently published rules verbatim as the rollback artifact before step 1, and
keep it for the agreed window.

A missing document and a legacy document are different roads and are tested separately:
a first-ever `create` must be a full protocol write at revision 1 with its receipt
(`firstRevision()`), and a create can never be used to overwrite a document that exists.

## What is implemented at this commit

- The client protocol (`js/sync/receive.js` and `js/sync/send.js`, `js/sync/firebase-adapter.js`): revision,
  receipt, conflict-carries-the-document, rebase-if-uncontested, hold-if-contested.
- The rules above, in `firestore.rules`.
- `tests/rules.test.mjs`, `tests/cas.emulator.test.mjs` and `tests/rollout.test.mjs`
  against the local Firestore emulator, all three wired into `npm run test:emulator` and
  so into `npm run test:release`. `tests/rollout.test.mjs` starts from a genuine legacy
  document — roster, days and an advance, no `protocol`, no `revision`, no `lastOpId`,
  no receipt — and walks the five steps above.

## The fingerprint, and what the server can actually enforce

Every protocol write carries a sixth envelope field, `opFingerprint`: a canonical digest
of the operation's KIND, every semantic path and value in it, and the restore's
transaction id where there is one. Revision, `lastOpId`, the retry envelope and the two
stamps are deliberately excluded — a retry legitimately carries a different clock, and
the fingerprint is the thing the revision has to be independent of.

The difference between what the server guarantees and what the client guarantees matters,
and is stated here rather than implied:

**Server-enforced** (`firestore.rules`, against the emulator):

- A protocol write must CARRY a fingerprint.
- The schedule and its receipt must carry the SAME fingerprint, written in one
  transaction, checked with `getAfter()` — a revision never exists without the
  operation that explains it.
- A receipt is immutable: created once, never updated, never deleted. So a name can
  never be re-pointed at different semantics after the fact.

**Every one of the three above has a check, and this was verified rather than assumed**
(v103's rules review). `tests/rules.test.mjs`: «a schedule write with no fingerprint at all
is refused» for the first; «a receipt whose fingerprint disagrees with the document is
refused» and «a receipt with a fingerprint for a document without one is refused» for the
second; «and can never be changed afterwards» and «nor deleted» for the third. Adding a
server-enforced claim to this list without adding its check is how a protocol comes to
promise a guarantee its rules do not keep.

**Not server-enforced, and it cannot be:** the rules cannot RECOMPUTE the digest. There
are no loops and no canonical serializer in the rules language, and on an update
`request.resource.data` is the merged document rather than the patch. A client that
computes its fingerprint wrongly, or lies about it deliberately, is not caught by the
server — it is caught, if at all, by the next honest client that compares.

**Client-enforced** (`js/sync/firebase-adapter.js`, which is where `receipt-mismatch` is
raised, with the queue half in `js/sync/sync.js` and `js/sync/send.js`): the replay path.
A replay performs no write, so the rules are never consulted for it; the client compares
the receipt's fingerprint against the operation it is about to repeat, and a mismatch is
`receipt-mismatch` — never acknowledged, never pruned from the queue, never reported as
synced.

## Protocol 2, and the pay book's rules (v175 — a development branch)

`PROTOCOL` is 2 since v175. The envelope did not change shape; the number says "this build
keeps the pay book", and `firestore.rules` on that branch reads it in exactly one place: a
write that CHANGES the `pay` map must speak protocol 2, may only add entries, and must
create its closed copy (`schedules/{doc}/closed/{id}`) in the same commit - `getAfter()`
from both sides, the device the receipt uses. Every other write is judged as before, so a
phone at protocol 1 keeps recording days; what it can no longer do is restore a document
that would erase a pay book. The order in which those rules and the phones change is
derived by measurement in `tests/paybook.split.emulator.test.mjs` and written as numbered
steps in `docs/payroll-closure.md` («The rollout order, measured»), with
`docs/firestore.rules.before-paybook` as the rollback artifact.

### What leaves the document (Phase 5 — the same development branch)

A settled closure's entries leave `schedules/{doc}` for their closed documents, and one
row of `payIndex.rows` stays. Four rules, all in `firestore.rules` on that branch: the
index only grows; a row arrives one at a time, in a protocol-2 write that names it
(`archivedId`) and whose closed document of that name already exists; a pay entry may
leave in such a write and in no other; and once a document has an index, a writer that
does not speak protocol 2 may not write to it at all. The client's half is
**Phase 6 (shipped shut) adds a second thing that leaves, by the same gate**: the days of a
closed month, to `schedules/{doc}/months/{YYYY-MM}_{digest}`, with `monthIndex` (a row per
month and the calendar dates of those months) in the live document. Two new write shapes,
both protocol 2 and both the adapter's own transactions: `copyMonth` (the month document,
created once, in a commit that moves the revision and changes no business field) and
`archiveMonth` (the days leave, the row and the dates arrive; the adapter confirms the
copy inside the transaction). After it, no write of any shape may touch a date in
`monthIndex.dates`. `docs/payroll-closure.md`, «Phase 6»; `tests/months.emulator.test.mjs`.

`js/sync/closed.js`: every server document passes one gate at the top of `receive()`,
which lays the archived entries back from this phone's own record or from the closed
documents - or does not adopt the document; and a whole-document write (`save`, `create`,
the daily copy) leaves those entries out. So the ordering protocol itself did not change:
a drop is an ordinary next revision with its receipt, and what a phone calls "the
server's document" is the live document made whole. Measured in
`tests/paybook.archive.test.mjs` and `tests/paybook.archive.emulator.test.mjs`.

### What leaves the document (Phase 5 — the same development branch)

A settled closure's entries leave `schedules/{doc}` for their closed documents, and one
row of `payIndex.rows` stays. Four rules, all in `firestore.rules` on that branch: the
index only grows; a row arrives one at a time, in a protocol-2 write that names it
(`archivedId`) and whose closed document of that name already exists; a pay entry may
leave in such a write and in no other; and once a document has an index, a writer that
does not speak protocol 2 may not write to it at all. The client's half is
`js/sync/closed.js`: every server document passes one gate at the top of `receive()`,
which lays the archived entries back from this phone's own record or from the closed
documents - or does not adopt the document; and a whole-document write (`save`, `create`,
the daily copy) leaves those entries out. So the ordering protocol itself did not change:
a drop is an ordinary next revision with its receipt, and what a phone calls "the
server's document" is the live document made whole. Measured in
`tests/paybook.archive.test.mjs` and `tests/paybook.archive.emulator.test.mjs`.

### What leaves the document (Phase 5 — the same development branch)

A settled closure's entries leave `schedules/{doc}` for their closed documents, and one
row of `payIndex.rows` stays. Four rules, all in `firestore.rules` on that branch: the
index only grows; a row arrives one at a time, in a protocol-2 write that names it
(`archivedId`) and whose closed document of that name already exists; a pay entry may
leave in such a write and in no other; and once a document has an index, a writer that
does not speak protocol 2 may not write to it at all. The client's half is
`js/sync/closed.js`: every server document passes one gate at the top of `receive()`,
which lays the archived entries back from this phone's own record or from the closed
documents - or does not adopt the document; and a whole-document write (`save`, `create`,
the daily copy) leaves those entries out. So the ordering protocol itself did not change:
a drop is an ordinary next revision with its receipt, and what a phone calls "the
server's document" is the live document made whole. Measured in
`tests/paybook.archive.test.mjs` and `tests/paybook.archive.emulator.test.mjs`.

**Nothing here has been published to the real project.** The rules in this repository are
the tested artifact, not the live ones; publishing them is a human operation performed
deliberately, and this file describes what will happen when someone does. No rules were
published from the session that wrote this paragraph, and none can be: every rules suite
runs through `firebase emulators:exec` against a local emulator.

## Which rules are live, and a record that is on (Phase 8; carried by v190, offered by the build after it)

Two additions to the pay book's rules, neither published:

- **`schedules/{doc}/probe/{generation}`** - nothing is ever stored there. `get` of
  `probe/paybook-8` is allowed to the people on the list and every other operation on the
  collection is refused; under any rules published before these the read is refused,
  because they have no such block. `adapter.probeRules(generation)` answers true, false,
  or throws when it could not ask, and `FarkadSync.activationRefusal()` turns that into
  `rules`, `offline` or nothing. It is how a phone asks "are the new rules live" before it
  turns the pay book on for a record - by reading. The generation's name moves only when
  the rules a client must not run without move.
- **`activatedNeedsPaybook`** - once the document holds a pay book at all, a write of any
  shape that does not speak protocol 2 is refused. A record with a pay book is a record
  that is on (its first pay entry is the opening); a build from before the pay book
  speaks protocol 1, reads the old arithmetic and could close an account the old way with
  no signal. Its writes are stopped; nothing is erased; it does not say synced. With no
  pay book on the document the rule is vacuous. Measured on v180, v183, v184 and v186 in
  `tests/activation.emulator.test.mjs`. It binds the schedule document only: the shared
  rides' documents (`transport/…`) carry no protocol and are judged by their own block, so
  a v186 phone refused its days can still write a ride plan (the same suite, R).

Protocol 2 itself did not change.
