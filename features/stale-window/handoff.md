# Handoff — v163: the hold survives the app closing, and the lock that was not one is gone

The round that answers the SECOND independent review of the by-site line. The first
review's six findings shipped as v162 (`7833fb8`); that build was then refused — 9936 of
9936 checks passing and still refused — on three grounds, all about data safety and none
about arithmetic. This is the answer to those three, and the part of it that matters most
is the last section.

Base: `7833fb8dd883dddd7c88cdcb6321bf06603e4b45` (v162).
Branch: `claude/farkad-bysite-move-stale-window`.
Code head: `38a5fcafa04d43c025fa6aa7debd0b88dd383e22`, tree `89ff63e727bf6ff2dcd512d8a1f284f754208195`.
The release gate below ran on that commit. The only change after it is this file.

Nothing in this round changes a rate, an advance, a pay cycle or a report's arithmetic.
Nothing deletes or zeroes a stored byte, a queue or a record.

**CORRECTED after the third review, which was right to catch it.** An earlier version of
this paragraph said both money gates were "still shut and still pinned shut". They are
not. `LEDGER_WRITES` is `true` (`js/model/ledger.js:49`) and `carryAdvances` is `true`
(`js/model/schema.js:63`), both opened in `e5b70f2` for the v116 candidate. The suites
that assert a closed gate assert it **through the test seam** — `flags` on a harness
device, `FARKAD_FLAG_OVERRIDES` in a browser suite (`tests/data.test.mjs:9423`,
`tests/smoke.mjs:62`) — so a green gate never contradicted the false claim. `CLAUDE.md`'s
first iron law still says `LEDGER_WRITES` is `false`, and reading the law instead of the
file is how the error got in; it is reported in `contract.md` for the owner rather than
rewritten here. This round still changes no accounting rule and does not move either gate.

## F4 — the lock was a belief, not a lock

### What v162 had, and why it was refused

v162 held a token under `farkad:writeLock`: read the key, decide it is free or stale,
write ours, read it back. That is a read followed by a write. The review's words were
exact — it is not an atomic transaction, and a longer token or a timeout bigger than
1500ms does not make the sequence atomic. Two windows can each read "free" and each come
away believing they own the record.

### The platform constraint, stated rather than papered over

The review asked for this explicitly: if the platform does not provide an atomic
guarantee sufficient for the design, explain the constraint and give a safe, testable
design instead of claiming a guarantee that does not exist.

**There is no synchronous mutual exclusion available here.** `localStorage` has no
test-and-set, no compare-and-swap and no transaction; `navigator.locks` is the only real
mutual-exclusion primitive in the browser and it is **asynchronous**, while every write
path in this app is synchronous by construction — `State.commit` returns a verdict its
caller has already acted on by the time any promise could settle. Making the write path
asynchronous would mean every inline `onclick` in `index.html`, every button, and the
whole of the no-build-step design in `CLAUDE.md`.

So the guarantee is restated as what it actually is: **recoverability, not exclusion.**

### What it rests on

1. **One key per queued operation.** `farkad:outbox:op:<id>` is written by a single
   `setItem`, which IS atomic, so two windows never write the same bytes and no window's
   edit can be erased by another's. This is where a person's work lives between the tap
   and the cloud, and it is why the word for the remaining hazard is "replay", not "loss".
2. **Validate, write, re-validate.** `State.guardedSave` reads the record off the disk,
   decides (`clear`, `rebased`, `contested`, `unreadable`, `unsafe`), and writes;
   `State.save` re-reads the record in the instruction before its own `setItem` and
   refuses if it moved; `State.lastWriteWon` records whether what landed is still there an
   instant later. A pass refused *because the record moved* is decided again rather than
   abandoned, so the ordinary outcome of losing a race is a rebase that lands. Three
   passes, then a refusal that keeps the edit in the journal — never a spin.
3. **The collector's gate.** An operation leaves the queue only when the cloud has
   answered it AND a schedule containing it has been read back off the disk
   (`js/sync/sync.js`, `collectQueueGarbage`). A clobbered write therefore cannot take the
   record of itself away with it.

### The door that was closed

The validation moved INSIDE `State.save`. That is the one part of F4 that closes a door
rather than renaming one: `save()` writes the WHOLE schedule and was reachable without
the guard — the boot-time ledger mirror calls it directly — so the only thing keeping a
whole-record write off a record this window had not read was every caller remembering to
ask first. A guarantee resting on that is not a guarantee. The restore transaction
declares itself with `save({ whole: true })`, because replacing the whole record on
purpose is what it exists for (`js/sync/restore.js`, and Law 4).

### The two sub-asks, answered by subtraction

The review asked to stop an expired owner from resuming its write, and to stop a release
from deleting another writer's ownership. With no lock there is no owner and no release:
both are answered structurally rather than by a better token. v162's bytes under
`farkad:writeLock` are inert and are **deliberately not deleted** — this round removes no
stored bytes of any kind.

### A bug the lock itself caused

A window that died a moment before the 1500ms timeout left a FRESH token behind, and the
next window's perfectly ordinary edit was refused with a dialog. That is now a check of
its own (`F4 · an edit is not refused by a claim nobody is honouring`) and it is one of
the seventeen that fail on v162.

## F3 — the hold is durable, and the three sides are kept apart

The hold lived in a `Set` that died with the tab, so closing the app released every
conflict it was protecting: the queue looked ordinary, nothing on the disk said the
operation had lost, and the edit nobody had decided about went out on the next flush.

It is now **one key per held operation** — `farkad:hold:<opId>`, not per path, because a
later edit at the same path is a different question — written through `Store.setVerified`,
read back by `loadHolds` before anything can be sent, and removed only by a person
releasing it from the `⋯` panel.

A held path is also kept out of the journal **replay**, not only out of the send. Without
that the hold was cosmetic: the value nobody had agreed to was laid straight back onto the
schedule by the next replay, shown on the reopened screen, and carried to the disk and
then to the cloud by the next ordinary save. The hold has to mean both things or it means
neither.

**The three sides, stored apart**, because conflating them is how the whole fault began:

| side | what it is |
|---|---|
| `seen` | the record as this window last agreed the disk held it — the version the person was looking at when they made the edit |
| `mine` | what this window wrote, as the queue holds it |
| `disk` | what the other writer had put there by the time we looked |

A newer value on the disk is **not** the person agreeing to be replaced by it. The panel
shows the pair; a person releases one at a time; neither side is ever deleted.

The replay filter reads only the DURABLE holds (`_heldDurable`). `_heldNow` also carries
the cloud half — a write that lost a race to another phone — whose long-settled behaviour
`tests/contested.test.mjs` is the record of, and filtering on it wholesale changed what a
reopened phone holds.

## F5 — the adopted revision is not forgotten when the app is opened again

`_revision` lived only in memory, so a reopen started at `null` — "this device has never
seen a revision" — which is the one state that makes a document WITHOUT a revision
adoptable. The v162 repair therefore held only until the app was closed. The number now
has its own key (`farkad:revision`), written by whoever adopts and read before the first
delivery can arrive. A device that genuinely has never seen one finds nothing there and
keeps `null`, so the legacy transition is untouched — which is the whole reason the field
is nullable.

**Persisting the number alone broke a pairing**, and this is the part worth reading. Since
v102 the monotonic test in `noteRevision` has compared revisions, and that was exact while
the revision lived only in memory: a session that knew a number had, by construction,
adopted the document it came from. A reopened session knew revision N and held no
document, so the current delivery — at exactly N — failed `said > _revision`, `_baseDoc`
stayed `null`, and every pre-send hold reads a null base as "nothing heard, nothing to
compare". The queued write nobody had decided about then went out over the other phone's
correction. `noteRevision` now also adopts a delivery whose revision EQUALS the remembered
one when this session holds no base at all; an equal revision is the document as it
stands, not a delivery from behind, so it lowers nothing, and a LOWER number is refused
exactly as before. `tests/contested.test.mjs` caught this, which is what it is for.

## The expectations that moved, and why

Nothing was weakened. Three old suites built their scenarios by having a window write a
whole schedule over a record it had not read — the exact fault this round refuses — so
those CONSTRUCTIONS moved while every assertion stayed:

| suite | what changed |
|---|---|
| `tests/probes.test.mjs` Q1–Q5 | a catch-up `State.load()` for the second window, so the window is behind for the reason the suite describes rather than by accident |
| `tests/concurrency.test.mjs` C1 | the same |
| `tests/races.tabs.test.mjs` R13 | the racing pair is built at queue level (`racingWrite`), because `State.commit` now refuses to make such a pair |
| `tests/races.tabs.test.mjs` R12(b) | the older record is written AT THE DISK rather than through `save()`. The state still exists on field disks — an older build writes without validating, and a write landing inside the window named below leaves the same bytes — and the collector must still be right about it, which is what that case asserts |

One pinned Hebrew string was added rather than changed, for the F6 case v162 introduced
(an edit the journal is holding was never "cancelled"):

    title   הרישום לא נכתב למכשיר
    message השינוי נשמר ברשימת ההמתנה ולא אבד, אבל לא הצלחנו לכתוב אותו לרישום
            שבמכשיר כרגע. מה שכבר שמור לא נפגע. נסה שוב בעוד רגע, ואם זה חוזר -
            פתח את ⋯ כדי לראות מה ממתין.

## The new suite

`tests/codex2.probes.test.mjs` — 36 checks. **19/36 on v162 (17 failures); 36/36 here.**
Every check reads the worker's FINAL value back off the disk after a reopen, rather than
asking whether a save returned true or whether some JSON exists, because that is what the
review asked for.

| scenario the review named | suite |
|---|---|
| two windows, same `deviceId` | `F4 · two windows with the SAME deviceId do not lose each other's work` |
| two different windows | `F4 · two DIFFERENT windows, interleaved at the write, lose nothing` |
| the same worker on the same day | the F3 conflict suites (a contested path IS one worker, one day, one layer) |
| removing one site and adding another | `F3 · removing one site and adding another, from a window that is behind` |
| a window dying; the owner returning after a timeout | `F4 · a window that dies mid-write…` and `F4 · an edit is not refused by a claim nobody is honouring` |
| storage failure and quota | `F4 · a full disk refuses the record and keeps the man recoverable` |
| a window on an older build | `F4 · a window on an older build writes the record without validating` |
| a roster save beside day work | `F4 · a roster save and a day edit at the same time keep both` |
| reopening with a held conflict | `F3 · a conflict is still held after the app is opened again` |
| an old operation sent after a reopen | `F3 · a held operation is not sent after the app is opened again` |
| a legacy document with no revision | the two `F5 ·` suites |

The interleave in the second suite is real: a commit from window ONE is re-entered in the
middle of window TWO's `setVerified`, which is the hazard with deterministic timing and
no lock to hide behind.

**Said plainly, because a red count that flatters is worse than none:** the F4 *outcome*
checks other than the leftover claim already pass on v162. v162's read-then-write lock
happens to serialise correctly in a deterministic harness, so those outcomes were already
right there; what the review refused was the mechanism and the claim made for it, and one
behaviour the lock actively broke. The seventeen that go from red to green are all of F3,
all of F5, and the leftover claim.

## The gate

`npm run test:release` on `38a5fcaf`, from one clean detached worktree, Node v22.22.0,
OpenJDK 21.0.12.1 for the emulator suites:

    NPM_EXIT=0
    106 suite summaries, 9973/9973 checks, 0 failures

The node chain, the ten browser suites, `sendclaim`, and all eight emulator suites
(`rules`, `cas-emulator`, `rollout`, `bootstrap`, `bootstrap-rules`, `money-concurrency`,
`rollout-matrix`, `reminders-emulator`). `npm test` and `npm run test:release` are
reported separately and neither is wrapped in anything that turns a nonzero exit into a
success: the number above is read from `NPM_EXIT=` in the log, not from a task's exit
code, because the wrapping subshell's own `echo` succeeds either way. The full log is the
round's `.gate-release.log`, which `.gitignore` keeps out of the tree on purpose.

The gate caught one regression of this round's own making, and it is worth recording.
`tests/smoke.mjs`, in the sandboxed frame where `localStorage` throws on access, found
that adding a worker put the man on no list and told the person the device was full.
Reading `save()`'s answer at all is new — v162 called it and threw the result away — and a
browser with NO durable storage lets an edit stand in memory deliberately, saying so in a
permanent banner; that is what `journal()` and `journalBatch()` mean by answering true
when `Store.available` is false. `commitRoster` hands `guardedSave` the value of `queued`
— what the journal is actually holding — which is false in exactly that browser, so
reading it as "nothing to stand on" was wrong. Reproduced in real Chromium before and
after the fix (`rows 0` → `rows 1`).

## What is NOT done

1. **There is no mutual exclusion, and this round does not pretend otherwise.** Between
   `save()`'s last reading of the record and its `setItem`, another window can land a
   write. The cost is one journal replay at the next read, not a lost record, because the
   operation is still on the disk under its own key and the collector's gate will not take
   it. Two windows writing the same schedule blob in the same microsecond is the only
   case. The comment above `State.recordOnDisk` names this; no test can prove its absence,
   because it is not absent.
2. **`State.persist` is still an unvalidated whole-record write.** It is the snapshot
   adoption path (`js/sync/receive.js`), and it is protected differently: `reapplyPending`
   puts the queue's pending edits back on top of the arriving snapshot before it is
   written, and on one phone the journal is one journal shared by every window. An edit
   that is neither in the arriving snapshot nor still in the queue is the only gap, and
   the collector's gate makes that pair hard to construct — but it was not made to refuse
   the way `save()` now does, and it was not in this round's scope.
3. **The boot-time ledger mirror can now refuse silently.** `migrateLedger` calls `save()`
   directly, so the new validation applies to it: if another window has moved the record,
   the mirror does not write and retries at the next boot or edit. Its entries are
   journalled either way, so nothing is lost, and its comment already promised silence.
   **This is a LIVE path, not a dormant one** — see the correction above: both gates are
   open in this build, so the mirror runs, and its silence is a real risk rather than a
   theoretical one. It is in scope as a writer in `contract.md`.
4. **An older build cannot be stopped.** A window or phone on v162 or earlier writes the
   record without validating anything, and nothing in v163 can prevent that. What v163
   guarantees against it is recovery, not prevention; Law 7's catch-up only holds from v87
   forward, and a build already on somebody's phone cannot be given new code.
5. **A hold that cannot be written down survives only the session.** If the disk refuses
   the hold's own write, the operation is still held for this session and still not sent,
   but a reopen loses the hold. `honestStatusFor` says so rather than this function
   pretending otherwise, and `_heldUnreadable` keeps an unparseable hold record held rather
   than coercing it.
6. **No real device was used.** No iPhone, no Android, no second physical phone: every
   result here is Chromium on Linux plus the Node harness plus the Firestore emulator. The
   iPhone limits in `features/iphone/` and `features/iphone-closeout/` are unchanged and
   unre-measured.
7. **No production Firebase, no real worker data, nothing published.** No push, no merge,
   no deploy, no Preview; `main` untouched; no shared settings or permissions changed; no
   suspended check re-run or re-purposed under a new name.
8. **`docs/releases.md` is not updated.** Its newest entry is v142 and this build has not
   been served; that file is the record of what was served, and an entry for an unserved
   build would be the sales page its own closing paragraph warns against.
9. **This is not declared READY.** The verdict belongs to a third independent review, not
   to the hand that wrote the code.
