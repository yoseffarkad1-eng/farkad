# The cutover that never ran — why the owner's phone was refused after the new rules

## What the phone showed
10 September 2026, the owner's iPhone on v103 (the app on the home screen, signed in as
an address in `allowed()`): «שגיאת סנכרון - הנתונים שמורים במכשיר הזה. (194 ממתינים
לשליחה)» and under it the reason line «הענן מסרב לקבל רישומים מהמכשיר הזה … (permission-
denied)». The owner published the repository's `firestore.rules` that evening (the
console's history shows the version starred at 19:45; the editor holds all 329 lines);
a force-quit and reopen changed nothing. The other two phones are not in use.

## Two refusals with one sentence
- **Before 19:45**, the cloud ran the v86 rules, which have no rule for the `receipts`
  subcollection. Every protocol write since 2 September (a schedule update and its receipt
  in one transaction) fell to the catch-all deny. That is the queue.
- **After 19:45**, the new rules refuse the SAME write for a different reason, and the
  phone reports the same sentence — so the deploy looked like it did nothing.

## The cause — the adapter never handed over `bootstrap` or `read`
`firestoreOps()` in `js/sync/firebase-adapter.js` has carried `bootstrap()` and `read()`
since the cutover was written (`ce9d338`, 31 August). The object literal the browser
branch passes to `window.FarkadSync.connect({...})` forwarded `update`, `save` and
`create`, and was never extended. Every emulator suite builds its own adapter from
`firestoreOps` — with both operations — so none of them could see the literal.

On the phone: the snapshot delivers the v86 document (no `revision`), `_revision` stays
null, and `send.js` runs the cutover only when `typeof this.adapter.bootstrap ===
'function'` — false. The first batch of queued work is stamped `protocol: 1`,
`revision: 1`, `lastOpId`, `opFingerprint` and sent as an ordinary update with its
receipt. The rules' `allow update` then refuses on every branch: `nextRevision()` errors
on `resource.data.revision + 1` over a document with no revision; the bootstrap branch
fails `bootstrapTouchesOnlyProtocol()` because the write carries `days.*`, `ledger.*`
and `opFingerprint`; `legacyWrite()` fails because the write carries `protocol`. The
receipt in the same transaction fails `receiptMatchesSchedule`. `onFailure` could
re-judge a refusal only with `adapter.read` — also absent — so `fail()` sets 'error' and
the ladder re-sends the identical write every 2/4/8…60 s for as long as the app is open.

Reproduced on the emulator with the published rules, a v86 document built by the v86
tree's own harness (23 workers, 21 days, advances, history copies for today and
yesterday) and a v86-queued disk opened by this build through the shipped adapter —
six variants, all refused with the emulator's own line «evaluation error at L257:24 …
Property revision is undefined on object». The same disk with `bootstrap` and `read`
forwarded: bootstrap at revision 1 touching only the five protocol fields, the queued
work at revision 2, synced in 1.3 s. Two independent refuters agreed on every step.

## The fix — v104
`bootstrap: ops.bootstrap, read: ops.read` in the literal, with the failure named beside
it; the three stamps move together. `tests/build.test.mjs` now reads the literal against
`firestoreOps` and fails when any operation the adapter defines is not forwarded (three
red checks on the base).

## What the owner does after v104 is served
Open the app, ⋯ → «בדוק עדכון», take the update. The first flush bootstraps the
document; the queue lands. From that write on, a phone still on v86 is refused until it
updates (the documented cutover, `docs/sync-protocol.md` step 4); the other two phones
are not in use, and they update before they are.

## A fact for the bars-raised finding
The owner's ⋯ panel reads «גרסה v103», «מותקן על מסך הבית», «יש מקום פנוי במכשיר». So
the phone in `features/bars-raised/findings.md` was on v103, past v86 — the inference is
now a reading.
