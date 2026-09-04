# Data safety — what is proven now, and the v79 handover behind it

**Two documents in one file, and deliberately so.** The v79 handover below says in its own
first paragraph that it must not be quietly edited, because a handover changed after the
fact cannot be checked against what happened. It is kept word for word, under its own
heading, further down. This section is the current one: what the sync, recovery and storage
path is proven to do TODAY, by which suite, and what is known to be wrong with it.

Re-audited at v100 (`claude/farkad-mobile-design-review-odl8ue`). The v79 handover predates
the versioned CAS protocol, the advances ledger, the send-path repairs of v91–v96, the
closure-echo race closed at v98, and everything in v99 and v100. Nothing in it was
inaccurate when written; most of what it describes has since been replaced by machinery it
does not mention.

## How this section was produced

Four independent adversarial reviews, in parallel, each given two of seven lenses and told
that a finding without a runnable reproduction is not a finding:

| lens | asked |
|---|---|
| L1 | a recorded day is lost |
| L2 | a restore leaves a device with part of a record |
| L3 | a phone claims synced falsely |
| L4 | a hold nobody can clear |
| L5 | a poisoned name through every door |
| L6 | a day is priced twice |
| L7 | two phones and the cloud disagree after a storm |

Every finding below was re-run and confirmed independently before anything was changed, and
every one of them is now either closed with a fail-first pair or listed as open with its
reproduction. Reports that did not survive that second run were dropped and are not listed;
the one refuted MECHANISM is named where it belongs, under O2, because a hypothesis that was
measured and found wrong is evidence about the code and worth as much as a confirmed one to
whoever picks that item up.

## What was found, and closed

| # | lens | what it was | closed by | pinned by |
|---|---|---|---|---|
| 1 | L6 | **A closed fortnight was applied to any range that started on its opening Friday**, whatever it ended on: `closedPeriods` folded under `periodFrom` and discarded `periodTo`. Reachable through the ordinary «החודש» preset in months whose first day is an account start — the sheet showed ten days and 5,000 where the crew worked twenty for 10,000, with the invoice in the same workbook still billing twenty. Read as two halves that do not overlap, one day was priced in both. | `frozenPeriodFor` in `js/model/schema.js` asks both ends, for `payrollReport`, `workerDaysReport` and `advanceWalk` | `tests/closure.test.mjs`, «a closed fortnight is frozen for its own period and no other» |
| 2 | L3 | **A phone whose pending restore would not parse said «מסונכרן» while permanently deaf.** `receive()` refuses every snapshot while `replaceDamaged`, correctly — but set no status, and `pendingReplace()` answers null, so `honestStatusFor`'s guards were all satisfied. Its own writes still landed, so the other two phones looked healthy. | `honestStatusFor` answers `error`, and the ⋯ panel names the unreadable restore and the one thing that clears it | `tests/status.test.mjs`, «a phone whose pending restore will not parse is not finished either» |
| 3 | L1 | **A refused edit stayed on the screen when nothing durable stood behind it.** `rollback()` returned false without acting whenever `durableText` was unset — which is precisely the session that opened onto a damaged record, and precisely when somebody re-types the week they can see is missing. The re-typed days reached the disk with no journal behind them and the next snapshot deleted them. | `rollback()` falls back to the empty schedule and the journal, which is what a reopen produces | `tests/data.test.mjs`, «a refused edit is taken off the screen even with nothing durable behind it» |
| 4 | L2 | **A restore reported a way back it did not have.** `pushUndoState` answered `stacked \|\| slotted`, and the slot is overwritten by `receive()` on every adopted snapshot — so the route home lasted until the other phone recorded an evening. | the answer is the stack alone; the slot is still written but is not evidence | `tests/data.test.mjs`, «a way back the next snapshot erases is not a way back» |
| 5 | L2 | **An unreadable undo stack was written over**, under a comment claiming the raw value was left where it is. It holds up to three whole schedules. The one record family exempt from law 10, by accident. | quarantined through `Recovery.damaged` before the stack restarts | `tests/data.test.mjs`, «an undo stack that will not parse is held, not written over» |

## What was found and is OPEN

O1 below is now CLOSED - see the note under its heading. O2 is still open. Both were
reproducible and both were confirmed independently. They were written here rather than
in a commit message because each needed a decision this repository reserves for a
contract, and one of them I could not diagnose to the line. O1 got its contract
(`features/restore-ledger/contract.md`) and its fix; O2 has neither yet.

### O1 — a restore is undone on the phone that did not ask for it, in the ledger only

> **CLOSED.** Decided in `features/restore-ledger/contract.md` (Rule A: a restore removes
> no ledger entry, on any phone) and fixed in `js/sync/restore.js` - the ledger is unioned
> through `mergeLedgerInto`, the same union `receive()` performs, on the restoring device,
> on the wire, and at the invariant that gates the transaction. Days, roster, places and
> every other part still replace. Proved by `tests/restore.ledger.test.mjs`: the
> reproduction below, red at `A 5000 / B 4500 / cloud 5000` and green at 4,500 on all
> three, then the same claim through each of the four doors. The paragraph below is kept
> as it was written, because it is the description of the fault.
>
> **CLOSED NARROWLY, and the remainder is named.** It holds for every restore door on
> the phone performing the restore, and for the cloud when that phone has ALREADY
> adopted the entry - which is the sequence below. It does NOT yet hold when the
> restoring phone has never received the entry: A restores while offline, B's
> repayment lands and is confirmed, A comes back, and A's whole-document write is
> ACCEPTED at the next revision and takes the entry off the cloud. `noteRevision`
> runs before `receive()`'s pending-replace branch returns, so A learns the revision
> from a snapshot whose content it declines to adopt. Same numbers, different route,
> and NOT a regression: identical on `5faa40a` without the fix. The sequence, the two
> lines that produce it and the three candidate fixes are written up under LIMIT in
> `features/restore-ledger/contract.md`.
>
> **One sentence in it was wrong and is corrected here**: `tests/restore.test.mjs`
> R1/R2/R5 do NOT pin ledger replacement on the restoring device. Every one of those
> fixtures restores onto a phone with an empty ledger, so there is nothing for a union
> to preserve; what they pin is that a restore is not REFUSED, and that is untouched.
> They were expected to move and did not: the suite is unchanged and green. The check
> that genuinely constrains this is R6's «with the ledger emptied», which requires the
> gate to notice an entry the replacement carries and the disk lacks - and it still does,
> because the union only ever adds to what is expected.

Two phones, both online, nothing failing. A takes a backup; B records a repayment of 500,
which reaches the cloud and A; A restores that backup through the ordinary door. Afterwards
A and the cloud hold no repayment and B holds it, for ever — B never sends it back, both
phones report `synced`, and it survives closing and reopening B.

    A money  left 5000   B money  left 4500   cloud  left 5000

Only the ledger diverges; days, advances, workers and places all converge. The cause is
that `receive()` unions the arriving ledger container with this phone's (`mergeLedgerInto`),
with no way to tell an ordinary field-merge snapshot from the whole-document replacement a
restore just wrote — and nothing travels with the document to say which it is.

**Why it is not fixed here.** Two rules would both fix it and they disagree about money.
Either a restore does not remove ledger entries anywhere (union on the restoring device
too, which reads straight off law 1 — "entries are never deleted, merged by union") or a
restore's snapshot replaces the ledger on every phone that adopts it (which is what a
restore means everywhere else, and what `tests/restore.test.mjs` R1/R2/R5 already pins on
the restoring device). Picking one silently would decide what a restore does to somebody's
pay. It needs `features/<name>/contract.md` and a person's answer.

### O2 — a roster edit made before the first snapshot arrives reverts another phone's change

B raises a man's day rate to 600 and it lands. A, returning from a stairwell with a roster
edit queued, ends up showing 500; A's next ordinary roster edit then sends 500 to the cloud
and to B. All three converge on the stale value, nothing is owed, nothing is held, and no
line on any screen says anything. A day recorded on A in between is stamped at 500 — law 2
reached from the wrong end.

One mechanism is established: `editRoster` sends only the entities that differ from the
last snapshot this device adopted, and that baseline (`_remoteRoster`) lives in memory and
starts empty on every app start. A phone that edits the roster before its first snapshot
arrives therefore sends EVERY entity, stale ones included. That window is ordinary, not
exotic: open the app, change a site, and the write can leave before the listener delivers.

A second mechanism is NOT established. With the baseline present the divergence still
reproduces, and the legacy whole array named by the reviewer is not the carrier — guarding
that branch does not stop it. It was investigated and reverted rather than shipped on a
hypothesis; `js/sync/sync.js` is the wrong file to change on one.

**What a contract has to answer**: what a phone with no roster baseline may send. Sending
everything reverts other phones; sending nothing loses the person's own edit; sending only
tombstones and the legacy array leaves the per-entity map stale on the cloud.

## An observation, not a finding

A three-phone storm with a reopen mid-evening ends with both phones blocked on «חלק
מהיסטוריית המקדמות לא נקרא» while `ledger.unreadable` and `ledger.unreadableMigrations` are
empty on both. Nothing claims to be settled — the app is stopping loudly and asking, which
is its job — so it is outside every lens above. But the sentence on screen sends a person
to look at a history neither device is holding. The reviewer who found it could not isolate
it to a line and said so; it is recorded here for whoever picks it up, and the place to
start is the revert at `receive()`'s persist failure.

## What is proven, and by which suite

The claims below are the ones this path actually rests on. Each names the suite that would
fail if it stopped being true; none is asserted here on reasoning alone.

| claim | proven by |
|---|---|
| An edit is not reported saved until something durable holds it, and a refused one comes off the screen | `data`, `capacity` |
| Nothing unreadable is deleted, overwritten or treated as empty — through every door | `recovery`, `quarantine`, `ledger-ingress`, `snapshot-poison` |
| A damaged record blocks writing until a person is told, and the raw bytes stay exportable | `recovery`, `recovery-browser` |
| The queue is durable, survives a reopen, and is acknowledged by operation and never by path | `data`, `concurrency`, `probes`, `fence` |
| A whole-document restore is ordered as a transaction, reaches this device before the cloud, and is caught if only part of it lands | `restore`, `data` |
| Two tabs on one disk cannot acknowledge each other's work away | `probes`, `concurrency` |
| The server orders every write: revision, receipt, and a receipt bound to its operation | `rules`, `cas`, `cas-emulator`, `receipt`, `bootstrap-rules` |
| A stale write is refused, rebased when disjoint, and held when contested — durably, across a reopen | `cas`, `contested` |
| One fact written by two phones is one fact, at every gate that can hold a write | `samefact`, `closure-echo` |
| The status line never says synced while anything is owed, held, unreadable, or unheard | `status` |
| A prototype-poisoning id cannot land, through any door | `poison`, `snapshot-poison`, `ledger-ingress` |
| Money survives a reopen, a second phone, an export and a restore, to the shekel | `money`, `money-ingress`, `money-cloud`, `xlsx` |
| A closed fortnight is frozen — for its own period, and on a phone whose gate is shut | `closure`, `closure-echo` |
| Two phones writing money at once converge, against the real emulator | `money-concurrency` |

## What this section does NOT cover

- **No physical device.** Every measurement above is Node or headless Chromium. See
  `docs/iphone-acceptance.md`, where every row is still NOT RUN.
- **Real Firestore.** The emulator suites run against the real rules and the production
  adapter, but not against the service itself, and not against the SDK's own offline
  persistence.
- **The two money gates are shut**, so the ledger paths above are exercised by tests that
  open them and by no phone in the field.

---

---

# The v79 handover, as it was written

Everything below this line is the August 2026 document, unedited. Read it as history: it
describes the state of the code at v79 and the rounds that produced it.

# Data safety work — handover

> **Read this first, if you are reading it after August 2026.** The statements below about
> what is on `main` and what the live site serves were true on the day each was written and
> are now history. v79 was released on 28 August 2026 and `main` is `94d5a84`. What has
> actually been served, and what each build is known not to cover, is in
> [`docs/releases.md`](releases.md) — that file is kept current; the sections here are
> kept as they were, because a handover that is quietly edited afterwards cannot be
> checked against what happened.

Branch `claude/farkad-data-safety`. **Not merged, not published.** `main` is untouched and
the live site still serves v58.

| | |
|---|---|
| Baseline asked for (round 1) | `ca0d2d6` (v57) |
| Baseline actually used | `182a51f` (v58) — see below |
| **Last behaviour change** | `109a029` — *A restore reaches this device before it reaches the cloud* |
| **Branch HEAD** | this documentation commit |
| Version | v79 |

**Code HEAD and branch HEAD are not the same thing.** An earlier version of this file
called a documentation commit the "Final HEAD", which was misleading. The table above
separates them: the last commit that changes **behaviour** is `109a029`, and
`git branch -r --contains 109a029` returns only `origin/claude/farkad-data-safety`.

## The one deviation from the brief

Round 1 pinned the baseline at `ca0d2d6`/v57. `origin/main` was already one commit past
that, at `182a51f` (v58), from a day-header fix made minutes earlier in the same session.
That commit is layout only — CSS, the day header builder, version strings, tests — and
touches no data path. The branch was cut from `182a51f` so the fix is not lost.

Round 2's precondition (`HEAD == 6f1dee2`) matched exactly.

## Round 5 — the replacement transaction

### Root cause

`retryReplace()` pushed the pending document to the cloud from wherever the app happened
to be, without ever asking whether **this** device held it. Crash between preparing a
restore and storing it, reopen, and:

```
{"cloudDays":"2026-07-01","screenDays":"2026-08-12",
 "diskDays":"2026-08-12","pending":null,"status":"synced"}
```

The snapshot published during `save()` was ignored because a replacement was in flight,
then the record and the queue were cleared. The cloud held the restore, the phone that
asked for it held the old schedule, and the only thing that knew a restore was owed had
just been deleted — so a later edit from that phone would build on the superseded state
with nothing anywhere recording it.

### The invariant

> The cloud may be written only once `scheduleData:v2`, **read straight back off the
> disk**, already contains the replacement.

`localDurableHolds(document)` asks exactly that — before the cloud write, and **again**
before anything is forgotten. A resolved cloud write is not on its own a reason to forget:
the question is whether screen, disk and cloud say the same thing, and only the disk can
answer it. Comparison is canonical (key-order independent) over `workers`, `places`,
`days`, `advances`; the **only** excluded metadata is `updatedAt` and `updatedBy`, which
saving here legitimately re-stamps.

### The envelope

```
{ version: 2, phase, transactionId, supersedesSeq, document }

phase: 'prepared'      the intent is written down; nothing else has happened
       'local-stored'  this device durably holds it; the cloud may be written
       'cancelled'     a tombstone, for a delete that could not be confirmed
```

**The phase is a hint, not the guarantee.** A phase can be stale after a crash; the bytes
cannot. `supersedesSeq` is the journal position when the restore was asked for — entries
at or below it describe the state being replaced, and replaying them would put the
pre-restore days back on top of the restore. They are dropped **only** once the
replacement is durably stored here.

### The flow — `FarkadSync.replaceEverything(schedule)`

```
1 prepareReplace          verified   → fail: nothing changed                (stage 'prepare')
2 applyReplacementLocally verified   → fail: memory reverted, intent cancelled (stage 'local')
  └─ then drop superseded journal entries
3 confirmReplaceStored               (best effort; the disk is the gate)
4 executePreparedReplace  cloud      → fail: intent stays on disk, resumed  (stage 'cloud')
  └─ on resolve: re-check the invariant, then clear queue + forget + synced
```

`resumeReplace()` replaces `retryReplace()` and puts **this device first**. It applies
unconditionally rather than only when the disk disagrees — `State.load` has meanwhile
replayed the journal, so memory can be ahead of a disk that already holds the replacement.
That also makes it idempotent, which is what the third crash boundary needs.

### Cancellation

`cancelPreparedReplace()` / `forgetReplace()` return whether the record is **genuinely
gone**. `localStorage` can refuse a remove; a tombstone covers that with a write instead;
if neither works the answer is `false` and the app says the restore may still happen at the
next open rather than claiming nothing is pending.

### v71 compatibility

A v71 record is the bare cloud document, no `version`, no `phase`. It is read as
**`prepared`** — conservative *and* accurate, since v71 also wrote it before the local
save. It is never deleted for being old; recovery applies it locally first, exactly like a
new one.

### Round 5 fault injection — every result measured after a close and reopen

| Boundary | Outcome |
|---|---|
| crash after prepare, before memory | resumes, applies locally, then sends; screen = disk = cloud; survives a **second** reopen |
| crash after memory, before the schedule write | same |
| crash after the schedule landed, before the phase | idempotent resume; no journal replay left on top |
| each of the three, against an **older** cloud | the restore wins, not the older snapshot |
| no room during resume | **zero** cloud calls, original screen and disk, transaction survives, status not synced, queue intact |
| snapshot published synchronously inside `save()` | asserted to happen, and nothing depends on it |
| cloud resolves while the disk no longer holds what was sent | record **kept**, status not synced |
| v71 raw record | recovered, not deleted |
| cancellation cannot be confirmed | reports `false`; record still there; still visible after reopen |
| queue while only prepared / after a failed local save | untouched |

## Round 4 — three ways a half-finished write could still survive

### G10 — a bulk operation was not atomic, only reported as if it were

The queue is rewritten whole on every entry, so journalling a bulk change one entry at a
time was a run of writes each larger than the last. The second running out of room left
the **first one durable** — and `commitMany` reported that nothing had happened while half
of it sat on the disk and came back at the next open.

**`queueBatch(entries)`** builds the change on a copy, writes it **once**, reads it back,
and adopts it only then. Nothing partial can survive because nothing partial is ever
written — there is no prefix to clean up afterwards. `commitMany` and `editRoster` each go
through one batch. A repeated path inside a batch keeps the later value at the later seq;
`Map.set` replaces, so that falls out rather than needing a rule.

### G11 — how an outbox slot is chosen

```
for i in 0 .. 24:
    key = i == 0 ? "farkad:outbox" : "farkad:outbox:active{i}"
    raw = durableGet(key)
    raw is absent   →  _activeKey = key, empty queue, done
    raw parses      →  _activeKey = key, load it, done
    raw is damaged  →  quarantine it, leave it byte-for-byte, try the next i
none left           →  _activeKey = null, Recovery.halt(mustHold)
```

`_activeKey` is **null until a slot passes**, and a slot passes only by being absent or
parsing. The previous version assigned it at the top of each turn, so with every slot
damaged it came to rest on the last one and wrote the new journal over bytes it had just
quarantined. With no slot available, `saveOutbox` refuses **without writing**, and
acknowledging cannot open recording.

### G12 — the whole-document restore, step by step

```
1. pushUndoState(current)            verified  → fail: nothing replaced
2. prepareReplace(incoming)          verified  → fail: nothing replaced, cloud NOT called
3. State.schedule = incoming
4. State.save()                      verified  → fail: revert memory,
                                                  cancelPreparedReplace(), cloud NOT called
5. render()
6. executePreparedReplace()          cloud     → fail: retry record STAYS on disk
7. on success only: clear the pending record and the superseded queue
```

Preparing **first** is the only order in which a crash between any two steps is safe.
Before 1 nothing has happened; between 2 and 4 there is a retry record and the old state,
so the restore is re-attempted next session; after 4 the two agree.

`rememberReplace` no longer adopts the document in memory when the write failed — that
left this device believing in a pending restore no other session would ever find, while
refusing to adopt snapshots on account of a record that did not exist.

All four paths reordered: `restoreFromCloud`, `restoreSnapshot`, `importBackup`,
`restoreLocalBackup`. **None calls `replaceAll` any more.**

### The private-mode exception does not extend to a restore

An ordinary edit is allowed on a browser that stores nothing — the app says plainly that
nothing survives, and refusing would protect nobody. A whole-document restore changes what
**every other device** holds, and doing that with no durable record of the intent is a
different bargain. `prepareReplace` returns false when storage is unavailable.

### Round 4 fault injection, by boundary

| Boundary | Outcome |
|---|---|
| bulk: second journal write fails (by **size**) | whole batch refused, neither half on disk or after reopen |
| bulk: room for part, not all | refused whole |
| roster: add + reorder, batch too large | refused, worker not on screen, none of it journalled |
| bulk that fits | lands whole, all three present after reopen |
| same path twice in a batch | later value kept, one entry |
| five slots present and damaged, **quarantine space available** | moves to slot 6; all five byte-identical, before and after reopen |
| every slot damaged | `_activeKey` null, `saveOutbox` false, acknowledge cannot unblock, edit refused |
| restore: retry record refused | restore never starts, `adapter.save` **never called**, nothing pending after reopen |
| restore: retry ok, local save fails | memory reverted, prepared record cancelled, cloud never called |
| restore: retry + local ok, cloud fails | record survives the close and is sent on reconnect |
| restore under unavailable storage | refused; ordinary edits still accepted |

## Round 3 — the durable transaction

Four findings, one root cause: the app changed memory, drew the result, and reported
success without anything durable holding the change.

### The rule

**A commit is not made until the journal holds it.**

```
1. journal the change      (verified: written, then read back off the disk)
   └─ failed?  →  roll back memory, redraw, say why, return false. Nothing else runs.
2. write the schedule      (verified; may fail - the journal covers it)
3. render, return true
```

The journal is one field; the schedule is the whole record. In practice the journal is
the write that fits, so making it the *gate* rather than one of two acceptable outcomes
costs nothing real — and it buys the guarantee that **every committed edit is in the
journal**, so an arriving snapshot can always be told what to put back on top of itself.

I built the weaker version first, exactly as the brief specified it (durable if the
schedule **or** the journal landed). The suite then found the hole: schedule written,
journal refused, an older snapshot arrives from another phone — the edit was on the disk,
nothing would ever send it, nothing could re-apply it, and `receive()` took it off the
device. Hence the stronger rule.

Writing the schedule only *after* the journal is what keeps the disk from getting ahead of
the screen: a refused edit is never written anywhere.

### The journal

- Replayed at boot by `State.load()`, so an edit whose schedule write failed comes back on
  the next open **with no cloud involved**.
- An acknowledged entry is **marked sent, not deleted**; it goes only once a schedule
  containing it has also been written here. Either alone leaves something unrebuildable.
- `pendingCount()` still counts only what is waiting to *go out* — that is what the number
  on screen claims.
- Read through `Store.durableGet` (new): what the **next session** would see, bypassing
  the session cache that holds writes the disk refused.

### Rollback

Memory returns to the last state this device is known to hold, then forward again through
the journal — what a reopen would do. Three things had to be right: the journal is
re-read from the **disk**; the schedule is never written; and the failed entries are
dropped, so the next flush cannot send the other two phones an edit this one has just
disowned.

### Failure boundaries

| Boundary | Behaviour |
|---|---|
| journal fails | edit refused, memory rolled back, schedule untouched, message shown |
| journal ok, schedule fails | edit stands; rebuilt from the journal at next boot |
| both fail | refused; nothing written anywhere |
| `persist()` fails in `receive()` | snapshot **not** adopted, previous state on screen and disk, status **not** synced, retried on the next snapshot |
| restore: way back fails | nothing replaced, `noWayBackNotice` |
| restore: new state fails | memory rolled back, **not** sent to cloud, queue **not** cleared, `notStoredNotice` |
| `replaceAll` cloud ok, local save failed | queue **not** cleared (found by the suite) |
| damaged queue, quarantine ok | recording resumes in the next slot, confirmed by read-back |
| damaged queue, no room for a new slot | recording refused, not held in memory |
| storage unavailable entirely | edits accepted — see the exception below |

### One deliberate exception

A browser that refuses storage outright (Safari private mode) accepts edits. Nothing there
is recoverable whatever we do, the app already says so in a permanent banner, and refusing
every edit would protect nothing while making the app useless. Tested rather than assumed.

### Every announcement now asks first

undo/redo, bulk assign, clearing a site, copy-a-day, quick start, migration decisions,
roster edits. No undo bar over an edit that did not happen; no "copied N workers" over a
copy that was refused.

## Commits

Round 5:

| SHA | What it fixed |
|---|---|
| `109a029` | **G13** — the phased durable replacement transaction |

Round 4:

| SHA | What it fixed |
|---|---|
| `7272be6` | **G10/G11/G12** — atomic batch journal, safe slot selection, ordered restore |

Round 3:

| SHA | What it fixed |
|---|---|
| `d4229ad` | **G6/G7/G8/G9** — the durable transaction above |

Round 2:

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

## Files changed in round 5, and why

| File | Why |
|---|---|
| `js/sync/sync.js` | The envelope (`version`/`phase`/`transactionId`/`supersedesSeq`), `readReplacementRecord` for the v71 format, `canonicalJson` + `replacementContent` for the comparison, `localDurableHolds` (the invariant), `applyReplacementLocally`, `dropSupersededEntries`, `resumeReplace`, `confirmReplaceStored`, `replaceEverything`; `executePreparedReplace` gated on the disk and re-checked after the cloud resolves; `forgetReplace`/`cancelPreparedReplace` return a verified result with a tombstone fallback; **`retryReplace` deleted** — it was where G13 lived. |
| `js/ui/share.js` | All four restore paths call `replaceEverything`; `tellRestoreResult` reads the stage; `stuckIntentNotice()` for a cancellation that could not be confirmed. |
| `tests/harness.mjs` | `blockRemoval()` — a `removeItem` the browser silently refuses. |
| `index.html`, `sw.js`, `js/app.js`, `js/model/schema.js` | v72. |
| `tests/data.test.mjs` | The round-5 scenarios above. |

## Files changed in round 4, and why

| File | Why |
|---|---|
| `js/sync/sync.js` | `queueBatch()` — one verified write, adopted only on success; `queue()` delegates to it; `editRoster` collects into one batch. Slot selection rewritten: `_activeKey` null until a slot passes, bound raised to 25, `Recovery.halt` when none. `saveOutbox` refuses with no active key. `prepareReplace`/`executePreparedReplace`/`cancelPreparedReplace`; `rememberReplace` no longer adopts on a failed write and refuses when storage is unavailable. |
| `js/state.js` | `journalBatch()`; `commitMany` uses one batch instead of a chain. |
| `js/ui/share.js` | All four restore paths reordered to prepare → save → execute, with `cancelPreparedReplace` on a local failure; `noRetryRecordNotice()`. |
| `index.html`, `sw.js`, `js/app.js` | v71. |
| `tests/data.test.mjs`, `tests/smoke.mjs` | The round-4 scenarios above. |

## Files changed in round 3, and why

| File | Why |
|---|---|
| `js/state.js` | `commit`/`commitMany`/`commitRoster` return whether the edit is durable and refuse it when it is not; `journal()` is the gate; `rollback()` and `durableText`; `load()` replays the journal; `save()` calls `onLocalChange` only on success. |
| `js/sync/sync.js` | Journal semantics — `sent` marking, `pruneJournal`, `markSaved`, `replayJournal`, `reloadJournal`, `activeOutboxKey`; outbox slots so a damaged queue does not stop recording; `queue`/`edit`/`editRoster` return durability; `receive()` reads `persist()` and refuses while the journal cannot be written; `replaceAll` keeps the queue when the local save failed. |
| `js/store.js` | `durableGet()` — what the next session would see, bypassing the session cache. |
| `js/recovery.js` | The export carries the live schedule and the live queue, not only the wreckage. |
| `js/ui/share.js` | All four restore paths check the save of the **new** state; `notStoredNotice()`. |
| `js/ui/undo.js`, `day.js`, `sheet.js`, `quickstart.js`, `migration.js` | Every success message and undo bar gated on the commit result. |
| `index.html`, `sw.js`, `js/app.js` | v70. |
| `tests/data.test.mjs`, `tests/smoke.mjs` | The round-3 scenarios below. |

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
| Data (`npm test`) | **344/344**, ten consecutive runs |
| Browser (`npm run test:smoke`) | **560/560**, twice |
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

### Round 3 scenarios, all measured by what survives a close

- schedule **and** journal refused → refused, rolled back, nothing on disk, nothing after
  reopen;
- schedule refused, journal written → accepted, and **rebuilt at boot with no cloud**;
- journal refused, schedule writable → **refused**, and the schedule deliberately not
  written;
- an older cloud snapshot arriving over a locally-recorded day → the day survives *and*
  reaches the cloud;
- storage unavailable entirely → accepted, banner up;
- roster change with nowhere to store it → refused, worker gone from the screen too, and
  after reopen;
- bulk copy with nowhere to store it → refused, no success message, no undo bar;
- failed save does **not** call `onLocalChange`, so no bare timestamp goes out for an edit
  that does not exist;
- each critical key failed **in isolation**, with the expected outcome stated per key and
  checked after a reopen;
- `persist()` failing during `receive()`, then succeeding once there is room;
- restore with the **new state** failing after the undo write succeeded — nothing
  replaced, nothing sent, queue intact;
- the brief's full G9 sequence: damaged queue → quarantine → continue → record → close →
  reopen → older snapshot → the day survives, reached the cloud, and the damaged original
  is still byte-for-byte where it was;
- recovery export carries the damaged record, its quarantine, the live schedule and the
  live queue.

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
- **The journal is now a hard dependency of recording.** If it cannot be written, the app
  refuses edits. That is the intended trade, and it is why the queue moves to a fresh slot
  rather than staying stuck — but it means a storage fault stops recording rather than
  degrading. Deliberate, and the one design decision here most worth a second opinion.
- **`rollback()` needs `durableText`.** It is set on every confirmed save and on load, so
  the only window without it is before the first successful save of a brand-new install —
  where there is nothing to roll back to anyway.
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
   removed before all three phones are confirmed past v79 and there is a rollback plan.
3. **Firestore rules.** Unchanged. Nothing here needs them changed and nothing needs
   republishing in the console.
4. **UX notes.** None implemented, per the brief.

## What was not touched

- **`main`** is `182a51f`, and `git branch -r --contains 7272be6` — the current code HEAD —
  lists only `origin/claude/farkad-data-safety`.
- **The live site** deploys from `main` and still serves `APP_VERSION = 'v58'`.
- **Firebase** — no writes, no rule changes, no console actions. `firestore.rules` is
  byte-identical to `182a51f`. The rules suite runs against a local emulator under
  `projectId: farkad-rules-test`; nothing anywhere names the real project.
- **Safety** — a different GitHub account, never accessed. The only repository touched is
  `yoseffarkad1-eng/farkad`, and the only branch pushed in this phase is
  `claude/farkad-data-safety`.

## v79 release blockers — what was found and closed

This section is about the v79 branch only. It was written while that branch was unmerged;
`main` was `1dec586` and served v78. It has since been released - see
[`docs/releases.md`](releases.md).

### Was any earlier v79 ever served?

No. The three build markers were bumped to v79 in `4bce096`, and that commit exists only
on this feature branch:

```
git log -S"farkad-v79" origin/main -- sw.js     # no output: never on main
git show origin/main:sw.js     | grep VERSION   # const VERSION = 'farkad-v78'
git show origin/main:js/app.js | grep APP_      # const APP_VERSION = 'v78'
git show origin/main:index.html | grep build    # content="v79" -> v78
```

The production origin deploys from `main`, so no phone has ever been served a build
calling itself v79. The markers therefore stay at v79 rather than being bumped again:
there is no older v79 cache anywhere for this one to collide with.

`tests/build.test.mjs` now checks that invariant on every run — the page `<meta>`, the
scripts' `APP_VERSION`, the service worker's cache name, and the shell list against every
local asset the page and the scripts actually load, including the one imported at runtime.

### The cloud that was never there

`import('./js/sync/firebase-adapter.js')` from inside `js/app.js` is resolved against the
SCRIPT's URL, not the document's — so the app asked for `/js/js/sync/firebase-adapter.js`,
got a 404, and swallowed it in the `catch` that exists for a phone with no signal. Every
v79 build so far was local-only on every device: no sign-in button, no snapshots, edits
piling up in a queue with nowhere to go, and nothing on any screen saying so.

It was not found by reading the code. It was found by making a test honest: the assertion
`hung.length === 0` passed both when nothing off-origin is between a person and their data
AND when the deferred import had not started yet. Watching the ordering instead — the
first draw, then the request — the request never came.

### The rest

- **The first snapshot.** A persisted roster queue no longer flushes before the document
  has answered, so a phone that closed with a roster edit queued cannot put a deleted
  worker back in front of a v78 reader.
- **Recovery.** A device that boots onto a damaged record now paints its banner (the
  damaged-queue case reported itself before the UI existed and was never repainted, so
  the one button that turns writing back on was invisible), and acknowledging starts the
  cloud that boot skipped instead of leaving the phone local-only for the session.
- **The rescue file.** It is still never refused, and it now invalidates every "made here
  and never sent" claim on the device — verifiably, or, when the device cannot write at
  all, by refusing to answer that question for as long as the disk refuses.
- **The boot sentinel.** An inline script before every application script, depending on
  nothing, that turns a white screen into a sentence when a script 404s or will not parse.
