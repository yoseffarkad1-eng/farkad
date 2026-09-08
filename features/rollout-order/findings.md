# The rollout order, measured

Three documents disagreed, and the disagreement was not a wording problem.

- `docs/rollout-checklist.md` asked the operator to update all three phones and wait for
  «מסונכרן» on each **before** publishing the rules.
- `docs/firebase-setup.md` said an updated phone writing against the published rules is
  **refused**.
- `features/gate-flip/contract.md` said "rules before clients", which contradicts the
  checklist and agrees with the setup document.

If the second is true the first is impossible: an updated phone cannot reach «מסונכרן»
under rules that refuse it, so step (א) demanded a state step (ב) forbids. That is not a
matter of opinion, so it was measured rather than argued.

**What we do NOT know.** Nothing here says what rules are published on the live
`farkad-schedule` project today. `firestore.rules` being in git proves only that a file is
in git. Nobody in this session has looked at the Firebase console and no agent may. The
only way to know is to open **Firestore Database → Rules** and read the text, and the
runbook in `docs/rollout-checklist.md` makes that its first step for exactly this reason.

---

## How it was measured

`tests/rollout-matrix.test.mjs`, against a local Firestore emulator with synthetic data.
No live project was contacted; no rules were deployed anywhere.

    FIRESTORE_EMULATOR_HOST=127.0.0.1:8231 npx firebase emulators:exec --only firestore \
      --project demo-rollout-order --config firebase.rollout.json \
      "node tests/rollout-matrix.test.mjs"

`firebase.rollout.json` is `firebase.json` with the ports moved (firestore 8231, websocket
9331, logging 4531) and `singleProjectMode` false, because the suite deliberately runs two
projects at once — one carrying the old rules and one the new — so both are live in the
same emulator and no cell has to wait for a redeploy. `firebase.*.json` is already
gitignored; the file is not committed.

**Result: `52/52 checks passed`, twice** — once with a scratchpad config and once with
`firebase.rollout.json`, both on `21c8e08` (v103), Node v22.22.2, OpenJDK 21.0.10.
`firebase emulators:exec` reported `Script exited successfully (code 0)` and the shell exit
was 0 on the second run. **The signal to trust is the suite's own `52/52` and the absence
of `**FAIL**` lines**, not the wrapper's exit code: `emulators:exec` has been seen to
return non-zero over a script that passed everything, and it is the runner in
`tests/runner.mjs` — not the wrapper — that exits non-zero on a failed check.

The two clients are real, not sketches:

- **NEW client** is `js/sync/firebase-adapter.js` itself, imported with four import
  specifiers rewritten (three SDK URLs node cannot resolve, one config redirected to an
  empty one so the browser branch stays shut). The suite asserts that exactly four lines
  differ and that every one of them is an import — the same guard
  `tests/cas.emulator.test.mjs` uses.
- **OLD client** is the write path copied from `git show ae6e4cd^:js/sync/firebase-adapter.js`
  — one `updateDoc` with the changed field path and a timestamp, no protocol, no revision,
  no operation id, no receipt, no transaction. That is what a phone still on v86 runs.

The documents are the real shapes: a LEGACY document with a roster, days worked and an
advance and not one ordering field, and the same document one bootstrap later, carrying
`protocol`, `revision: 4`, `lastOpId` and its receipt.

---

## The matrix — every cell observed, none inferred

Printed by the suite, verbatim:

| client | rules | document | result |
|---|---|---|---|
| old | old | legacy | **ACCEPTED** — ordinary field edit; document stays legacy |
| old | old | protocol | **ACCEPTED** — business data changed under a revision that did not move: the ordering is bypassed |
| old | old | protocol (restore/save) | **ACCEPTED** — the ordering fields are stripped off; orphan receipts remain |
| new | new (rules republished after a rollback) | legacy + orphan receipt | **REFUSED `receipt-mismatch`** — receipts are immutable, so a rollback leaves receipts no document can ever support |
| old | new | legacy | **ACCEPTED** — `legacyWrite()`: a phone that has not updated keeps working until cutover |
| old | new | protocol | **REFUSED `permission-denied`** — cutover has happened: an un-updated phone is refused and holds its queue |
| new | old | legacy | **REFUSED `permission-denied`** (bootstrap) / **`permission-denied`** (edit) — the old rules have no receipts subcollection: the transaction cannot even read one |
| new | old | protocol | **REFUSED `permission-denied`** — rolling the rules back stops every UPDATED phone dead |
| new | new | legacy | **ACCEPTED** (bootstrap first, then the edit) — a business write BEFORE the bootstrap is refused: `permission-denied` |
| new | new | protocol | **ACCEPTED** — the steady state |

Ten rows for eight cells: the rollback question needed the old client's whole-document
write, and the wreckage it leaves, as rows of their own.

Details worth naming, each of them a passing check in the suite:

- **Why the new client is refused by the old rules is a READ, not a write.** Every write
  the new adapter makes opens with `transaction.get(receiptRef(...))`. The old rules have
  no `receipts` match, so that read falls through to `match /{document=**} { allow read,
  write: if false; }` and is denied before a single byte of the write is attempted.
  Measured directly: under the old rules the schedule reads fine and a receipt read is
  `permission-denied`.
- **Reading is allowed in all four (client × rules) combinations.** The schedule is
  readable under both rule sets by both clients. Only receipts are not.
- **The bootstrap changes no work.** After it, the roster still has two workers, the one
  recorded day is still there, and the advance is still 500. Only `protocol`, `revision`,
  `lastOpId`, `updatedAt` and `updatedBy` moved.
- **A business write cannot be the first protocol write.** The new client sending an
  ordinary day edit at revision 1 against a legacy document is `permission-denied` — that
  is `bootstrapTouchesOnlyProtocol()` doing its job, and it is why the cutover is its own
  operation.

---

## Four different steps, which the documents were treating as one

### 1. Installing the new version on a phone

**Safe under either rules set, and it is not "read-only" — the app has no such mode.**

A phone can be updated at any time. It reads the schedule under both rule sets (measured).
It writes nothing until somebody records something on it: `bootstrapCutover()` is reached
only from the send path in `js/sync/send.js`, on the first flush of a queued write.

So "install a read-only new version" is not a state the software has; it is a discipline —
update the phone and do not record anything on it yet. If somebody does record something
while the old rules are still published, the write is refused (`permission-denied`), stays
in the outbox, and the phone says so. Nothing is lost, and nothing on the server changes.

### 2. Allowing that version to write

**One server-side act, not a per-phone one: publish `firestore.rules`.**

Under the old rules an updated phone cannot write at all — not a business edit, not even
the protocol-only bootstrap (cells `new × old × legacy` and `new × old × protocol`). Under
the new rules it can. There is no middle setting and no phone-by-phone version of this.

This is where the checklist was impossible. "Update the phones, wait for «מסונכרן», then
publish the rules" asks a phone to reach a state the published rules forbid. **The
wait-for-synced step has been deleted from that phase.** The right order is measured, not
preferred:

> **Publish the rules first. Then update the phones.**

Publishing first breaks nobody: an un-updated phone keeps writing normally under the new
rules for as long as the document is still legacy (`old × new × legacy` is ACCEPTED, via
`legacyWrite()`).

### 3. Upgrading the document to the protocol — the cutover

**A separate event, and it is not the deploy.** It happens the first time an *updated*
phone flushes a write. It writes five fields and no business data (measured).

The moment it lands, un-updated phones stop being able to write (`old × new × protocol` is
`permission-denied`). Their work is not lost — the queue is on the phone and the retry
ladder holds it — but they show a sync error until they update.

So the window that matters is not "between the deploy and the first phone update". It is
**between the first edit made on an updated phone and the last phone finishing its
update**. Keeping that window short is the whole reason to update the phones in one
sitting, and it is the reason the runbook says: publish, update all three, *then* record.

### 4. Opening the two money gates

**Not a Firebase act at all.** `LEDGER_WRITES` in `js/model/ledger.js` and `carryAdvances`
in `js/model/schema.js` are two constants in one commit, served as a new build.
`firestore.rules` neither knows nor cares about them: every cell above behaves identically
with the gates open or shut, because a ledger entry travels as an ordinary field path
inside the same envelope.

Its dependency on steps 1-3 is real but indirect: an entry written by an open phone has to
be readable and mergeable by the other two, which means all three past the build and the
document in the protocol. `features/gate-flip/contract.md` owns that list.

---

## Is rolling back to the old rules safe?

**No. Republishing the old rules over a document that has entered the protocol is a
destructive act, and it must never be described as an undo.** Three measured reasons, any
one of which is enough:

1. **It re-permits an OLD client to overwrite a record written under the new protocol.**
   This was the specific question, and the answer is yes. Under the old rules an old client
   wrote a day onto a protocol document and **the revision did not move** — it stayed at 4,
   `lastOpId` still named the previous operation, and no receipt explains the change. The
   compare-and-set stops being enforced the second the old rules are back: the ordering
   fields are still on the document, still saying revision 4, and now describing a document
   that has changed underneath them. The next protocol write from an updated phone computes
   `4 + 1`, is accepted, and overwrites whatever the old phone wrote without ever seeing a
   conflict.

2. **An old client's whole-document write knocks the document out of the protocol
   entirely.** A restore or an import from an un-updated phone is `setDoc` of the document
   it holds, which has no ordering fields. Measured: `protocol`, `revision` and `lastOpId`
   were all gone afterwards, while the receipts — immutable by rule — stayed.

3. **The wreckage outlives the rollback.** With the new rules republished, an updated phone
   retrying an operation whose receipt survived is stopped with `receipt-mismatch`: the
   receipt claims revision 4 and the document cannot support it. A fresh bootstrap still
   lands and puts the document at revision 1 — and the orphan receipt is *still* poisonous,
   because 4 is still greater than 1. That phone cannot complete that operation, ever.

And a fourth, which is what an operator will actually notice within a minute:

4. **Rolling back stops every UPDATED phone dead.** `new × old` is `permission-denied` in
   both document states. A rollback done to "rescue" the phones disables exactly the ones
   that have been updated.

The old rules are therefore a **fire escape for a project that has not cut over yet**, and
nothing more. Once the document carries a revision, the way back is forward: fix the rules
and republish them, not revert them.

---

## Is `pending` evidence that an operation never reached the server?

**No, and this is the single most misread line in the app.**

Measured: the server accepted a write (day on the document, revision 5, receipt written),
and the client's queue is pruned only *after* an answer comes back — `this.acknowledge(sent)`
runs inside the `.then` in `js/sync/send.js`. So if the answer is lost — a tunnel, a locked
phone, a backgrounded tab — the edit is on the server and still in the outbox, and the
status line still counts it: «(רישום אחד ממתין לשליחה)».

That is the correct behaviour, and it is safe because of what the retry finds:

- the same operation sent again is answered **as a replay**, `{ replayed: true, revision: 5 }`,
  and **writes nothing a second time**;
- an operation carrying the same name but a *different* fingerprint is refused with
  `receipt-mismatch`, so a replay can never acknowledge somebody else's write.

**What the number next to «ממתינים לשליחה» means:** *this phone has not been told the write
landed.* It does not mean the write did not land. Read the other way round it is dangerous
in both directions — re-entering an advance because "it never went" is how a man is paid
twice, and the runbook says so.

The honest reading of the two lines a person is asked for:

- **«מסונכרן»** — everything this phone knows about has been acknowledged. Trustworthy.
- **«ממתינים לשליחה (N)»** — N edits are not acknowledged. Some of them may already be in
  the cloud. Wait, or read the reason line; never re-enter the work.

---

## What the person sees, per failure

Pinned by `tests/status.test.mjs` and `tests/smoke.mjs`; the reason line lives in
`js/ui/settings.js` (⋯ → מצב המכשיר) and the status line in `js/sync/status.js`.

| what happened | code | the line under the board | the reason in ⋯ → מצב המכשיר | what the app does |
|---|---|---|---|---|
| the rules refuse this phone | `permission-denied` | «שגיאת סנכרון - הנתונים שמורים במכשיר הזה.» + the queue count | «הענן מסרב לקבל רישומים מהמכשיר הזה. אם האפליקציה עודכנה זה עתה, כללי הענן עדיין לא פורסמו.» + the code | keeps the queue, retry ladder. Re-checked first against the document: if the revision moved it is re-classified as a conflict, not an error |
| no signal | `unavailable`, `deadline-exceeded`, a `TypeError` from fetch | «אין חיבור - השינויים יישלחו כשהחיבור יחזור.» (or «אין חיבור - הכל כבר נשלח.» with an empty queue) | «אין כרגע גישה לענן - הניסיון יחזור מעצמו.» | keeps the queue, retries by itself |
| sign-in lapsed | `unauthenticated` | «שגיאת סנכרון - הנתונים שמורים במכשיר הזה.» | «הענן אינו מזהה את המכשיר הזה - התחבר שוב.» | keeps the queue; needs a person to sign in |
| another phone changed the same thing | `conflict` (status `contested`) | «הנתונים השתנו במכשיר אחר. הפעולה שלך לא אבדה - רענן, בדוק את המסך, ואשר שוב.» | — | contested paths held, disjoint paths rebased; nothing is overwritten |
| the browser blocks storage | — | «⚠️ הדפדפן חוסם שמירה. הנתונים יימחקו ברענון - ייצא קובץ גיבוי.» | — | banner with a «💾 שמור גיבוי» button |
| the phone is full | — | «⚠️ אין מקום פנוי במכשיר והשינוי האחרון לא נשמר - ייצא קובץ גיבוי ופנה מקום.» | — | same banner; what was already saved is safe, the last change is not |
| a write read back as something else | — | «⚠️ השינוי האחרון לא נשמר במכשיר. ייצא קובץ גיבוי עכשיו.» | — | same banner; memory is rolled back so nothing claims to be saved |

The failure to worry about is the last row, not the first: a refused sync keeps the record
on the phone, and a failed disk write means the record is nowhere.

---

## Production changes this measurement suggests — described, not made

None of these was made by this lane; every one of them touches a file it does not own.

1. **Wire the suite into the gate.** `tests/rollout-matrix.test.mjs` is in no npm script.
   It needs `"test:rollout-matrix": "firebase emulators:exec --only firestore \"node
   tests/rollout-matrix.test.mjs\""` in `package.json`, appended to `test:emulator`, plus a
   line in `tests/README.md`'s suite list and in `CLAUDE.md`'s file table. Until then the
   rollout order is measured but not defended: nothing fails if somebody weakens
   `legacyWrite()` or the bootstrap's affected-key rule.

2. **The rollback file should say what it costs.** `docs/firestore.rules.rollback` reads as
   a symmetric undo. It is not one, and a comment header saying so — pointing at the four
   rollback rows above — belongs in the file itself, where somebody about to paste it into
   the console will actually read it.

3. **Consider refusing a legacy whole-document write once the document is in the protocol.**
   The old rules let a full replacement strip `revision` off a protocol document. That hole
   is only reachable *after* a rollback, so it is not urgent; but if the rollback file is to
   stay a real fire escape, that is the one change that would make it non-destructive. It is
   awkward to express in the old rules alone, so it may belong on the client instead — an
   updated phone declining to send a whole-document write to a document it has seen carry a
   revision.

4. **`docs/releases.md` still describes the rollout as "the app updates itself, then the
   rules go out by hand"** — quoted inside the comment in `js/ui/settings.js` as the v91
   rollout note. That is the order this measurement contradicts, and it should be reversed
   in both places.
