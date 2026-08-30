# The ordering protocol — two designs, and the one that was chosen

Status: DESIGN + client implementation staged. Rules are in the repository and tested
against the local emulator only. **Nothing here has been published to the real project.**

## What is actually broken

Three phones share one Firestore document. Ordinary edits send one field path each
(`days.<date>.<layer>.<worker>`) and Firestore merges them server-side, so two people
filling in the same evening both land. That part works and is not what this is about.

What does not work is everything that is not a disjoint field merge:

- A whole-document restore races an ordinary edit, and the loser is silent.
- A request that may still land is treated as dead, and the work is sent twice or
  dropped.
- A stale writer overwrites a newer document, and nothing on either phone notices.
- The local send claim (`js/sync/sync.js`, `SEND_CLAIM_KEY`) is a lease in
  `localStorage`. It coordinates **tabs of one browser profile**. It has never been able
  to order writes across phones and cannot be made to: the three phones share no storage.
  That is the whole of what `tests/sendclaim.test.mjs` has been measuring, and why 25 of
  its 66 checks are red and stay red until this is replaced.

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

## Backward compatibility, said plainly

A v86 phone writes no `protocol` field and no `revision`. There is no rule that both
accepts those writes and orders them — accepting them IS the hole. So:

- The rules require `protocol` on every write to `schedules/{docId}`.
- A v86 write is therefore refused with `permission-denied`.
- v86 surfaces that as a visible sync error. It does not silently diverge, which is the
  requirement ("a legacy writer cannot bypass the final protocol unnoticed"). It is
  noticed loudly, by design.
- Which is exactly why the rules are not published until every phone is on the candidate
  build. There is no permissive transition that keeps accepting legacy writes after
  activation, because such a transition is the defect wearing a rollout plan.

The staged order, to be performed as a separately reviewed operation and **not here**:

1. Ship the candidate to all three phones and confirm each is running it.
2. Confirm from the client census that no window of an older build is open.
3. Save the currently published rules verbatim as the rollback artifact.
4. Publish the new rules.
5. Watch one phone (the canary) complete a full evening.
6. Confirm no held conflicts and no `permission-denied` on any phone.
7. Keep the rollback artifact for the agreed window.

## What is implemented at this commit

- This document.
- Nothing else. The client protocol, the rules changes and the emulator tests are the
  next unit of work and are not in the tree yet.

Do not read this file as a description of shipped behaviour.
