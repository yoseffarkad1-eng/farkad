# Contract — opening the two money gates

**This is not a change. It is the list of what has to be true before somebody makes one.**

No code in this round flips anything. `LEDGER_WRITES` is `false` in `js/model/ledger.js`
and `carryAdvances` is `false` in `js/model/schema.js`, and this file exists so that the
person who eventually changes those two lines is reading a checklist rather than
remembering one. CLAUDE.md law 1 reserves that decision for a person; nothing here takes
it, and no agent should treat this document as permission.

## What the flip actually is

Two constants, in one commit, in the same direction:

    js/model/ledger.js:49    const LEDGER_WRITES = false;   ->  true
    js/model/schema.js:63        carryAdvances: false       ->  true

They move TOGETHER. One open without the other ships a lie: the ledger would take writes
that the reports would not price, or the reports would price a carry the ledger refuses to
record. `tests/data.test.mjs` pins the pair, and `tests/smoke.mjs` pins what the shut
build shows — both of those pinned expectations move in the flip commit, deliberately,
with the reason in the message. That is not incidental work to be discovered on the day:
it is part of the flip and it is why the flip is a commit and not a toggle.

The three build stamps move with it, because both files are in the service worker's shell.

## What must be true first

**1. Every phone is past the build, and it has been checked on the phone.**
All three phones show v98 or later in ⋯ → עדכון וגרסה. Not "should have updated" — read off each
screen. A phone still on v86 cannot read a ledger entry the other two write, and law 1's
whole subject is that the three phones do not update together.

**2. `firestore.rules` is published, and it was published BEFORE the phones updated.**

Say what is known and what is not. `firestore.rules` in this repo has changed since v86.
**Whether it has been published to `farkad-schedule` is not knowable from here** — a file
in git says nothing about a live project, and nobody in this repository has looked at the
console. Step one is to open **Firestore Database → Rules** and read the text.

The order is measured, in `tests/rollout-matrix.test.mjs`, and it is not symmetric:

- an updated phone under the OLD rules cannot write **anything** — not a day, not even the
  protocol-only bootstrap. Every write it makes opens by reading its own receipt, and the
  old rules have no `receipts` at all, so it is `permission-denied` before a byte is
  written;
- a phone that has NOT updated, under the NEW rules, keeps working normally for as long as
  the document is still legacy (`legacyWrite()`).

So: **rules first, then the phones.** The reverse order — the one the checklist used to
carry, "update the phones and wait for מסונכרן, then publish" — is not merely worse, it is
impossible, because a phone cannot reach «מסונכרן» under rules that refuse it. That step
has been deleted from `docs/rollout-checklist.md`.

The deploy is `firebase deploy --only firestore:rules --project farkad-schedule`, and it is
the owner's to run — no agent does it.

**And rolling the rules back is not an undo.** Measured: with the old rules republished, an
old phone overwrites a record written under the protocol *without the revision moving* (so
the compare-and-set silently stops protecting anything), a whole-document write from an old
phone strips `protocol`/`revision`/`lastOpId` off entirely, the immutable receipts left
behind can strand an updated phone in `receipt-mismatch` for ever, and every updated phone
stops writing the moment the old rules are back. The old rules are a fire escape for a
project that has not cut over yet, and nothing more. `features/rollout-order/findings.md`
has the eight-cell table.

**3. Every phone has a backup exported that day.**
⋯ → גיבוי → «💾 שמור קובץ גיבוי» on each phone, saved somewhere off the phone. The flip is revertible in code
(below) and the ledger it writes is not: entries are append-only by law 1, and a wrong
entry is corrected by a second entry beside it, never removed.

**4. Items 1–4 of the v98 open list are closed.**
They are, at v99 — `features/false-holds/contract.md` and its handoff. Two of them were
reachable only with these gates open, which is exactly why they had to be shut when they
were found and closed before the gates open:

- a fortnight closed after the man had already repaid put the phone into recovery;
- a phone whose clock was behind moved a payment into the next fortnight silently;
- two phones each approving the carry plan held one another's approval for ever.

**5. The person has read every row of `planAdvanceCarry`.**
Not the summary — the rows. It says which legacy advance becomes which ledger entry for
which man, and it is the one screen where a wrong answer is somebody's wage.

**6. The whole release gate is green on the flip commit itself.**
`npm test` and `npm run test:release`, both, on the commit that flips them — not on its
parent, and not on a branch that "only differs by the flag". The emulator suites are the
half that matters here and `npm test` does not contain them.

And one gap to close before that sentence means what it says: `tests/rollout-matrix.test.mjs`
— the suite the order in item 2 is read off — is in **no** npm script yet, so a green
`test:release` does not currently defend it. It needs a `test:rollout-matrix` entry appended
to `test:emulator`.

## The rollout, in order

These are four DIFFERENT steps, and treating them as one is what produced the contradiction
this contract used to carry. In order:

1. **Publish the rules.** One server-side act. Nothing on any phone changes, and nothing in
   the field breaks: an un-updated phone goes on writing under `legacyWrite()`.
2. **Update every phone**, in one sitting, and read the build number off each screen.
   Installing the build is safe under either rules set — but there is no read-only mode, so
   an updated phone whose owner records something while the OLD rules are still published
   is refused, keeps its queue, and says «הענן מסרב לקבל רישומים מהמכשיר הזה».
3. **The cutover, which is not the deploy.** The first time an updated phone flushes a
   write, it moves the document into the protocol — five fields, and not one byte of
   anybody's work (measured). From that instant a phone that has not updated cannot write
   at all. That is why step 2 finishes before anyone records anything: the window that
   hurts is between the first edit on an updated phone and the last phone's update, not
   between the deploy and the first update.
4. **Then, and separately, the gates.** Merge and serve the flip commit. It is a code
   change and Firestore neither knows nor cares about it — a ledger entry travels as an
   ordinary field path inside the same envelope.
5. **One phone first.** Open it, let it update, check ⋯ shows the new build, and open the
   migration review screen. It lists what `planAdvanceCarry` proposes. Approve it there,
   on that phone, once.
6. The other two phones update when they are next opened. They will read the approval off
   the shared record rather than asking again — `cm_carry` is one decision and the
   same-fact rule settles the second and third hands (`tests/samefact.test.mjs`).
7. Until a phone has updated it goes on reading the record with both flags off. That is
   pinned and deliberate: `tests/closure.test.mjs` «a fortnight closed on one phone is
   frozen on a phone whose gate is shut». A shut phone reads a closure the open one wrote
   and prints the same money; it simply cannot write one.

## The rollback

This is the rollback of the GATES. It is not the rollback of the rules, which is a different
act with a different answer — see item 2: republishing the old rules over a document that
has cut over is destructive and stops every updated phone.

Revert the flip commit and serve that. The two constants go back to `false`, the three
stamps move again, and every phone stops writing financial entries at its next update.

**What does NOT roll back is the ledger.** Entries written while the gates were open stay
written — they are append-only, the boot-time mirror in `state.js` is the one sanctioned
write, and a build with the gates shut still READS them. That is the design and it is the
reason step 3 above is one phone and not three: the smallest reversible step is one
person's approval on one phone, and the largest irreversible one is a fortnight closed.

A closure in particular cannot be undone at all — «סגירה היא סופית - אי אפשר לבטל אותה,
רק לרשום תיקון לצידה». Do not close a period on the day of the flip. Let the crew record
a fortnight normally first.

## After it is open

The rows a person runs on a phone, from `docs/iphone-acceptance.md` — none of them can be
run here, and none has been run on any build since v86:

- the migration review screen lists what it proposes and approving it once is enough;
- an advance recorded on one phone shows on the other two, with the same number;
- a repayment recorded in cash shows as «הוחזר במזומן» and moves the debt down;
- a fortnight's account closes, prints, and prints the SAME figures the next morning;
- a correction beside a closed fortnight shows as late money and does not restate it;
- ⋯ → ענן וסנכרון never says «מסונכרן» while anything is waiting.

**And one thing the person running those rows must be told, because getting it wrong pays a
man twice.** A count beside «ממתינים לשליחה» means *this phone has not been told the write
landed* — NOT that the write did not land. Measured: the server can accept a write and the
answer be lost, and the queue is pruned only after an answer arrives. The retry is answered
from the receipt as a replay and writes nothing a second time; a retry whose operation
differs from the one the receipt names is refused with `receipt-mismatch`. So an advance is
never re-entered because "it did not go".

## Out of scope for this document
- It does not authorise the flip and does not schedule it.
- It does not deploy rules, touch Firebase, or run anything on a phone.
- It does not decide WHEN. The person decides when.
