# Contract — O1: what a restore does to the advances ledger

Base: `9e46032` on `claude/farkad-quality-leap`. Opened because the owner asked for the
decision to be made and explained rather than referred back to him.

## The bug this answers

Two phones, both online, nothing failing. A takes a backup. B records a repayment of 500,
which reaches the cloud and A. A restores that backup through the ordinary door. Afterwards:

    A  left 5000        B  left 4500        cloud  left 5000

B keeps the repayment for ever, never sends it back, and **both phones report `synced`**.
Only the ledger diverges; days, advances, workers and places all converge. `receive()` unions
the arriving ledger with this phone's and has no way to tell an ordinary field-merge snapshot
from the whole-document replacement a restore just wrote — nothing travels with the document
to say which it is.

## THE DECISION: a restore removes no ledger entry, on any phone

**Rule A.** The restore replaces days, roster, places and every other part of the record, as
it always has. It **unions** the ledger — on the restoring device as well as on the two that
adopt the snapshot afterwards. Nothing in a restore ever deletes an advance, a repayment, a
correction or a closure, anywhere.

Four reasons, in the order that decided it.

**1. Rule B would break an iron law, and this is not the place to change one.** Law 1 says
the ledger is append-only and that entries "are never edited, never deleted, and merged by
union". Rule B — the restore's snapshot replaces the ledger everywhere — is a deletion of
ledger entries by definition. CLAUDE.md reserves changes to that law for a person, in one
commit, alongside `carryAdvances`. Choosing B inside a bug fix would be exactly the silent
decision the audit refused to make.

**2. The two failure modes are not comparable.**

| | what goes wrong | who sees it | can it be undone |
|---|---|---|---|
| **Rule A** | an entry you wanted gone is still there | **visible** — it is on the screen and in the statement | yes: write a correction beside it, which is the ledger's own designed mechanism |
| **Rule B** | an entry somebody else recorded is deleted from their phone | **invisible** — B's repayment vanishes and B did nothing and is told nothing | only from a backup, if one exists |

A record that quietly says something different from what was done is the failure this whole
application is built against. Rule B is that failure; Rule A is an untidiness.

**3. A restore is not the undo button for money, and the app already says so.** The ledger
has correction and reversal kinds precisely so that a wrong entry is answered by a second
entry beside it. Closure goes further and says it out loud — «סגירה היא סופית - אי אפשר
לבטל אותה, רק לרשום תיקון לצידה». Using a whole-document restore to roll money back would be
a second, undocumented undo path with different semantics from the one the screens teach.

**4. The owner has already been told Rule A, in the document he is meant to act on.**
`docs/rollout-checklist.md` tells him, about reverting the gate flip: «**بس السجل ما بيرجع.**
القيود الي انكتبت بتضل مكتوبة (السجل بيزيد وما بينقص أبداً، وهاد بالتصميم)» — the ledger does
not roll back, entries stay written, it only ever grows. `features/gate-flip/contract.md` says
the same in English. **Rule B would contradict the instructions already in his hands.** Rule A
is not a new promise; it is the one that has been made.

## What this costs, stated plainly

- **A restore can no longer be used to remove a ledger entry**, including on the phone that
  performs it. Somebody restoring an old backup to "get rid of" a mistaken advance will find
  it still there, and must write a correction instead. That is the designed path and the
  screens support it, but it IS a change from what the code does today.
- **`tests/restore.test.mjs` R1/R2/R5 pin the opposite** on the restoring device. Those
  expectations move, deliberately, in the same commit as the change, with the reason in the
  message. That is the repo's rule for a pinned behaviour and this is a deliberate use of it.

## What must be true when this ships

1. After the reproduction above, **all three hold `left 4500`** — A, B and the cloud agree,
   and B's repayment survives on every one of them.
2. **No ledger entry is removed by any restore door.** All four restore doors are covered:
   the backup file, the local restore point, the cloud restore point, and the legacy upgrade.
3. **Days, roster, places and every non-ledger part still REPLACE.** A restore is still a
   restore; this contract narrows it in exactly one place and must not widen.
4. **The union is the same union `receive()` already performs** (`mergeLedgerInto`), so a
   restore and a snapshot cannot disagree about what merging a ledger means.
5. **Nothing unreadable is coerced.** A ledger container that will not parse is quarantined
   exactly as it is today (law 10); this change must not turn a held record into a merged one.
6. **The status line stays honest.** No path here may report `synced` while anything is owed
   or held.

## Out of scope
- Both money gates stay `false`. This is reachable today only through the tests' flag seam,
  and that is where it is measured.
- O2 (the roster baseline) is a separate contract and a separate fix.
- No change to what a restore does to days, roster, places, vehicles or the journal.

## How it will be proved
A fail-first pair: the three-device reproduction, red on the base with `A 5000 / B 4500 /
cloud 5000`, green after with all three at 4500. Then the same through each of the four
restore doors. Then `npm test` (43 suites) plus the sync-sensitive suites — `sendclaim`,
`cas`, `samefact`, `contested`, `merge`, `restore`, `money`, `repayment`, `closure` — and the
emulator suites run SERIALLY.

---

## What shipped, and the one prediction above that was wrong

Rule A is implemented in `js/sync/restore.js`, in three places and through one function:

- `applyReplacementLocally` unions this device's ledger - from memory AND from the disk,
  because a second tab writes the disk without touching this context's schedule - onto the
  replacement before it is stored.
- `executePreparedReplace` sends the document with that same union laid on, on a COPY:
  the cloud write is a whole-document save, so anything not in it is deleted from the
  cloud and from every phone that adopts the snapshot afterwards. `envelope.document` is
  left exactly as it arrived, because the frozen v71 companion is bound to it byte for byte.
- `localDurableHolds` unions the same way before comparing, or the gate would call a
  correct device wrong for holding entries the replacement never named - and wedge the
  transaction after the person had been told the restore happened.

All of it through `mergeLedgerInto` (requirement 4). A disputed id - one entry, two bodies -
is kept on both sides under `ledger.conflicted` and reported, exactly as `receive()` keeps
it (requirement 5); nothing here resolves one.

**The prediction under "What this costs" was wrong about the tests.** It said
`tests/restore.test.mjs` R1/R2/R5 pin the opposite on the restoring device and would have
to move. They do not, and they did not: all three restore onto a phone whose ledger is
empty, so there is nothing for a union to preserve, and what they actually pin is that a
restore is not REFUSED. That suite is unchanged and green at 51/51. **No pinned expectation
was moved anywhere.** The check that does constrain this change is R6's «with the ledger
emptied», which requires the gate to notice a ledger entry the replacement carries and the
disk does not - and it still fails there, because the union only ever ADDS to what the gate
expects. `tests/restore.ledger.test.mjs` L8 pins that bound in the suite that owns it.

The decision itself is unchanged. Nothing in the code was fitted to the tests; the
paragraph above is a correction to a claim the contract made about the test corpus, not to
the rule.

---

## LIMIT — an entry that is in the cloud and has never reached the restoring phone

**This is NOT fixed by this commit, it is not new, and requirement 2 does not hold for it.**
It was found while answering a question about the wire half, reproduced on both trees, and
is written here rather than repaired because repairing it is a second change and deserves
its own contract and its own fail-first pair.

### The sequence, exactly

1. A and B are both on the cloud document, revision 1, and the man owes 5,000.
2. A takes a restore point, then loses the network: it can neither hear snapshots nor
   write. The restore is asked for through the ordinary door. The local half lands - A's
   disk holds the restored record - and the cloud half cannot go, so the transaction
   stays on A's disk, which is correct and is what `resumeReplace` exists for.
3. B records a repayment of 500. It reaches the cloud, is confirmed, and B's outbox
   empties. The cloud is at revision 2 and says 4,500. **B reports `synced`, and is right.**
4. A comes back. The snapshot carrying B's repayment is delivered to A.
5. A's restore is sent, is ACCEPTED, and the cloud goes back to 5,000 at revision 3.

Afterwards: **A 5000, B 4500, cloud 5000** - the same three numbers O1 opened with, reached
by a different route. B's repayment now exists on exactly one disk in the world, B's outbox
is empty so nothing re-sends it, B still reports `synced`, neither phone is blocked, and
Recovery on both is empty. **A phone that bootstraps from the cloud after this reads 5,000.**

### Why the ordering protocol does not close it

It is natural to expect the compare-and-set to refuse step 5, because A never adopted
revision 2. It does not, and the reason is one deliberate line:

- `js/sync/receive.js`, in `receive()`: `this.noteRevision(raw)` runs **first, before any of
  the branches below can return early**. Its comment says so and gives the reason - a
  snapshot this device refuses to ADOPT is still a snapshot that tells it what revision the
  document is at, and writing against a stale base is refused by the rules, which is a worse
  way to find out. That reasoning is right for an ordinary edit.
- Four lines further down: `if (this.pendingReplace()) { if (!this._replacing)
  this.resumeReplace(); return; }`. The snapshot is **not adopted** - which is also right,
  and is the older fix: adopting it would undo the restore on the very device that asked
  for it. So `mergeLedgerInto` never sees B's document.
- The result is a device that knows the revision and not the content. `stampProtocol` then
  writes `patch.revision = this._revision + 1` = 3, the server's CAS is satisfied, and the
  whole-document save lands.

So the two lines are each correct on their own and wrong together: A learns the NUMBER from
a snapshot whose CONTENT it declines to read, and then overwrites that content.

`replacementToSend` cannot help here. It unions the ledger this device durably holds, and
what A holds cannot contain an entry A was never given.

### It is not a regression

The identical sequence produces the identical numbers on `5faa40a`, without this commit.
What this commit fixes is the case where the restoring phone HAS the entry - which is the
reproduction O1 was written from, where A is online and has already adopted B's repayment.
What it does not fix is the case where the phone has not. The rule as written - "a restore
removes no ledger entry, on any phone" - therefore holds for every restore door on the
device performing it, and does NOT yet hold for the cloud document when the restoring
device is behind.

### What a fix would have to decide

Not attempted here, and each of these is a decision about money rather than a repair:

- **Read before write.** The restore's send reads the authoritative document
  (`adapter.read()`, which exists) and unions its ledger onto the replacement before
  saving. It closes the hole, and it means a restore's content now depends on a second
  round trip that can itself fail - so what happens when the read fails has to be decided,
  and "send anyway" is the current behaviour by another name.
- **Adopt the ledger only, while refusing the snapshot.** `receive()`'s pending-replace
  branch merges the arriving ledger into the local record and returns without adopting
  anything else. Narrow, and it makes that branch do two things instead of one.
- **Refuse to send a restore built on a revision this device has not read.** Honest and
  cheap, but a phone that is behind and cannot catch up never completes its restore, and
  the person is told a restore is still pending with no way to finish it.

The reproduction above is enough to build the fail-first pair for whichever is chosen.
