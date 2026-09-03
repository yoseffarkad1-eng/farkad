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
