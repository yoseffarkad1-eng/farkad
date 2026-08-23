# Data safety work — handover

Branch `claude/farkad-data-safety`. **Not merged, not published.** `main` is untouched and
the live site still serves v58.

| | |
|---|---|
| Baseline asked for (round 1) | `ca0d2d6` (v57) |
| Baseline actually used | `182a51f` (v58) — see below |
| Last **code** commit | `3f415c5` — *Believe a write only when it can be read back* |
| Last commit on the branch | this documentation commit, which changes no code |
| Version | v69 |

**Code HEAD and branch HEAD are not the same thing.** The previous version of this file
called a documentation commit the "Final HEAD", which was misleading. The table above
separates them: nothing in `docs/` affects the app, and the last commit that changes
behaviour is `3f415c5`.

## The one deviation from the brief

Round 1 pinned the baseline at `ca0d2d6`/v57. `origin/main` was already one commit past
that, at `182a51f` (v58), from a day-header fix made minutes earlier in the same session.
That commit is layout only — CSS, the day header builder, version strings, tests — and
touches no data path. The branch was cut from `182a51f` so the fix is not lost.

Round 2's precondition (`HEAD == 6f1dee2`) matched exactly.

## Commits

Round 2 first, since that is what is under review.

| SHA | What it fixed |
|---|---|
| `3f415c5` | **G5** — every critical write verified; restore stops if the way back cannot be written |
| `58ce288` | **G1/G2/G3** — a damaged record is never overwritten, deleted, or treated as empty |
| `b98f629` | **G4** — a full device still knows its own id; `setVerified` added |
| `d9931df` | Repo hygiene: Playwright pinned, self-serving smoke suite, `firestore-debug.log` untracked |
| `6f1dee2` | *(documentation — round 1 handover)* |

Round 1:

| SHA | What it fixed |
|---|---|
| `210b228` | Never sign a write with another device's name |
| `ed9a305` | Merge the two roster forms instead of choosing between them |
| `4a4e7ee` | **P4** — a day is paid at the rate it was worked at |
| `3313baa` | **P6** — one build per session |
| `65132bf` | **P7** — recording rules at the write; migration stops guessing |
| `9da861d` | **P5** — no tick over a write that did not happen |
| `ae33b08` | **P3** — collision-proof ids, per-entity roster |
| `8b9d4a0` | **P1** — the durable outbox |
| `2485a73` | **P2** — the first cloud document, complete and atomic |
| `e1fcdbe` | The Node device harness (deliberately red — reproduces P2) |

## Files changed in round 2, and why

| File | Why |
|---|---|
| `js/recovery.js` | **New.** The rule that a damaged raw record is never deleted, never overwritten, never treated as empty. Verified quarantine, the write block, the banner, the raw export. Owns `farkadWritesBlocked()`. |
| `js/store.js` | Memory is the authoritative session view (G4); `keys()` unions both; `setVerified()` added; a *refused optional* write is rolled back out of memory so it cannot pose as durable. |
| `js/state.js` | `save`/`persist` verify and return; `saveFailed` exposed; a damaged v2 goes to Recovery and the v1 fallback is shown but **not saved**. |
| `js/sync/sync.js` | Damaged outbox and damaged pending-replacement go to Recovery; `saveOutbox`/`rememberReplace` refuse to write over a damaged original; `receive` adopts nothing while blocked; the notice reports a failed save. |
| `js/ui/share.js` | `pushUndoState` verifies and returns; every restore path aborts before replacing if the way back is not on disk; `exportRecoveryData()` added. |
| `js/app.js` | The build mismatch goes through `Recovery.halt` instead of its own flag. |
| `index.html` | `js/recovery.js` loaded; `#recoveryBanner` added; build stamp bumped. |
| `sw.js` | `js/recovery.js` added to the shell; version bumped. |
| `package.json`, `package-lock.json` | Playwright pinned **exactly**; `engines` for Node 20/22; scripts. |
| `tests/serve.mjs` | **New.** The smoke suite serves the app itself. |
| `tests/harness.mjs` | Fault injection: refuse a write by key, corrupt a write by key, stage a raw record, read raw. Faults installable *before* the app's scripts run. |
| `tests/data.test.mjs`, `tests/smoke.mjs` | The tests below. |
| `.gitignore`, `README.md` | Emulator logs ignored; how to run the suites from a clean clone. |
| `firestore-debug.log` | **Deleted from git.** Emulator output, committed by an earlier `git add -A`. |

## Tests

Run from a **clean clone** (`git clone` → `npm ci`), Node v22.22.2:

| Suite | Result |
|---|---|
| Data (`npm test`) | **187/187**, ten consecutive runs |
| Browser (`npm run test:smoke`) | **553/553**, twice |
| Rules (`npm run test:rules`, Firestore emulator) | **24/24** |

Syntax check: 32 tracked `.js`/`.mjs` files, 0 failures.
`git diff --check`: clean. `git status --short`: empty.

## Failure scenarios actually exercised

Damaged records:

- damaged outbox, quarantine **succeeds** — original untouched, writes blocked, a later
  edit does not overwrite it, export carries the raw bytes, acknowledging resumes;
- damaged outbox, quarantine **fails** (no room) — original untouched, writes blocked, and
  acknowledging does **not** unblock;
- damaged pending replacement — not deleted, not returned as a schedule, and an arriving
  cloud snapshot is **not adopted** while it is unresolved;
- damaged `scheduleData:v2` **with** v1 — v1 shown on screen, not saved over the original;
- damaged `scheduleData:v2` **without** v1 — blank screen, writes blocked, and re-typing
  the week does not destroy what is underneath;
- damaged `scheduleData:v2` on a full device — no copy, original intact, cannot be
  acknowledged away;
- a quarantine never overwrites an earlier quarantine (`:damaged`, then `:damaged:2`).

Write failures, injected one key at a time:

- `scheduleData:v2` refused — `save()` returns false, `saveFailed` set, banner says so,
  data still readable in-session;
- `farkad:outbox` refused — `saveOutbox()` returns false;
- `farkad:outbox` **corrupted on write** (accepted, reads back different) — also false;
- `farkad:pendingReplace` refused;
- undo keys refused — every restore path stops **before** replacing and says why;
- each of the three critical keys failed in isolation with the app still running and the
  day still readable;
- app closed between "write the way back" and "replace" — both survive.

Device identity:

- no id on disk, no room to write one: three calls returned three ids before, one after;
- a newer in-memory value beats a stale on-disk one;
- `keys()` lists memory-only records.

Carried over from round 1 and still green: the offline→close→reopen-against-older-cloud
acceptance test, two devices on one evening, two devices on the same cell, two devices
racing to create the first document, an un-updated device writing arrays, a v1 upgrade,
rate changes after history, sync failure then retry, and backup round-trip equality.

## The new recovery path, end to end

1. A record will not parse. **The original is left exactly where it is.**
2. Recovery copies the raw bytes to `<key>:damaged` (`:damaged:2` if that exists) using
   `setVerified` — written, then read back off the disk. Never `optional`.
3. Writing stops. `farkadWritesBlocked()` is asked by `State.save`, `State.persist`,
   `FarkadSync.saveOutbox`, `FarkadSync.rememberReplace` and `FarkadSync.receive`.
4. `#recoveryBanner` explains, and offers **💾 ייצא נתונים גולמיים** — a JSON file of the
   raw records exactly as they sit on the device, plus which keys they came from.
5. If **every** damaged record was copied, a second button resumes recording.
   If any copy failed, there is no such button: the original is the only copy there is.

Keys: `farkad:outbox`, `farkad:pendingReplace`, `scheduleData:v2` → `<key>:damaged`.
A build before v67 used `scheduleData:v2damaged` (no colon); nothing reads it now, and
anything found under it on an old device is still a real copy worth keeping.

## Remaining risks

- **Blocking writes is a real cost on a site.** A single corrupt byte in the outbox stops
  recording until somebody presses a button. The trade was deliberate; if you would rather
  it degraded differently, say so.
- **`setVerified` on every save** re-reads the schedule each time. Measured nowhere. At
  today's data size it is well under a frame; at ten times the size it is worth checking.
- **Real iOS Safari is untested.** Chromium only. The service worker change from `3313baa`
  is the one most worth confirming on an actual iPhone before merging.
- **Real Firestore is untested.** Simulated faithfully; the SDK's own offline persistence
  and retry are not in the loop.
- **The 300-path batch** is a conservative guess, not a measured ceiling.
- **Recovery's banner is one line of text.** It says what happened and what to press. It
  has had no design pass, per the brief.
- **`window.print()` in an installed iOS PWA** and **XLSX export offline** — pre-existing,
  out of scope.

## Decisions NOT taken, deliberately

1. **Historical rates on days already recorded.** Untouched. They still follow the roster
   exactly as they always have; `planRateStamping()` reports what stamping them *would*
   write and does not write it. Nobody can read out of this data what a man was actually
   paid in March.
2. **Legacy roster arrays.** Still written, for devices that have not updated. Not to be
   removed before all three phones are confirmed past v69 and there is a rollback plan.
3. **Firestore rules.** Unchanged. Nothing here needs them changed and nothing needs
   republishing in the console.
4. **UX notes.** None implemented, per the brief.

## What was not touched

- **`main`** is `182a51f`, and `git branch -r --contains 3f415c5` lists only
  `origin/claude/farkad-data-safety`.
- **The live site** deploys from `main` and still serves `APP_VERSION = 'v58'`.
- **Firebase** — no writes, no rule changes, no console actions. `firestore.rules` is
  byte-identical to `182a51f`. The rules suite runs against a local emulator under
  `projectId: farkad-rules-test`; nothing anywhere names the real project.
- **Safety** — a different GitHub account, never accessed. The only repository touched is
  `yoseffarkad1-eng/farkad`, and the only branch pushed in this phase is
  `claude/farkad-data-safety`.
