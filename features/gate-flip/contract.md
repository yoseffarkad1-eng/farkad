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
All three phones show v98 or later in ⋯ → גרסה. Not "should have updated" — read off each
screen. A phone still on v86 cannot read a ledger entry the other two write, and law 1's
whole subject is that the three phones do not update together.

**2. `firestore.rules` is deployed, and the rules went first.**
The rules have changed since v86 and are NOT deployed. `tests/rollout.test.mjs` measures
the order and it is not symmetric: rules before clients. A client writing the protocol
envelope to a project whose rules do not know about it is refused; a project whose rules
demand the envelope from clients that do not send it stops all three phones. The deploy is
`firebase deploy --only firestore:rules --project farkad-schedule`, and it is the owner's
to run — no agent does it.

**Last checked against `main` at v103 (`21c8e08`), 3 September 2026.** The conditions below
are unchanged since v99 wrote them; what has changed is that item 4 is now met and item 2 is
not, and the re-audit under item 4 has added two open findings worth reading first.

**3. Every phone has a backup exported that day.**
⋯ → נסח גיבוי on each phone, saved somewhere off the phone. The flip is revertible in code
(below) and the ledger it writes is not: entries are append-only by law 1, and a wrong
entry is corrected by a second entry beside it, never removed.

**4. Items 1–4 of the v98 open list are closed, and so is the re-audit they led to.**
They are, and they shipped in **v100** — `features/false-holds/contract.md` and its handoff.
Three of them were reachable only with these gates open, which is exactly why the gates had
to be shut when they were found and why they had to be closed before the gates open:

- a fortnight closed after the man had already repaid put the phone into recovery;
- a phone whose clock was behind moved a payment into the next fortnight silently;
- two phones each approving the carry plan held one another's approval for ever.

**The data-safety re-audit that shipped beside them found five more and left TWO OPEN**, and
one of the two is about money with these gates open. Both are in `docs/data-safety-audit.md`
with runnable reproductions:

- **O1** — a restore is undone on the phone that did NOT ask for it, in the ledger only, with
  both phones reporting synced. **This one is behind these gates**, and it is a reason to
  weigh before opening them rather than after: two rules would both fix it and they disagree
  about somebody's pay, so it needs an answer, not a patch.
- **O2** — a roster edit made before the first snapshot arrives reverts another phone's rate
  change on all three devices, silently. This one is NOT behind the gates and is live today.

Neither is a reason the flip cannot happen. Both are reasons the person opening the gates
should know what is still open underneath them.

**5. The person has read every row of `planAdvanceCarry`.**
Not the summary — the rows. It says which legacy advance becomes which ledger entry for
which man, and it is the one screen where a wrong answer is somebody's wage.

**6. The whole release gate is green on the flip commit itself.**
`npm test` and `npm run test:release`, both, on the commit that flips them — not on its
parent, and not on a branch that "only differs by the flag". The emulator suites are the
half that matters here and `npm test` does not contain them.

## The rollout, in order

1. Deploy the rules. Nothing else that day until this is done and one phone has synced
   normally against them.
2. Merge and serve the flip commit.
3. **One phone first.** Open it, let it update, check ⋯ shows the new build, and open the
   migration review screen. It lists what `planAdvanceCarry` proposes. Approve it there,
   on that phone, once.
4. The other two phones update when they are next opened. They will read the approval off
   the shared record rather than asking again — `cm_carry` is one decision and the
   same-fact rule settles the second and third hands (`tests/samefact.test.mjs`).
5. Until a phone has updated it goes on reading the record with both flags off. That is
   pinned and deliberate: `tests/closure.test.mjs` «a fortnight closed on one phone is
   frozen on a phone whose gate is shut». A shut phone reads a closure the open one wrote
   and prints the same money; it simply cannot write one.

## The rollback

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
- ⋯ → מצב המכשיר never says «מסונכרן» while anything is waiting.

## Out of scope for this document
- It does not authorise the flip and does not schedule it.
- It does not deploy rules, touch Firebase, or run anything on a phone.
- It does not decide WHEN. The person decides when.
