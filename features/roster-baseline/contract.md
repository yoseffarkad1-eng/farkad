# Contract — what a phone may say about a roster it has not just changed (O2)

`docs/data-safety-audit.md`, item **O2**, open since v100 and live in the field with no
flag over it. B raises a man's day rate to 600 and it lands. A, coming back with a roster
edit queued, ends up showing 500; A's next ordinary roster edit then sends 500 to the
cloud and to B. All three converge on the stale value, nothing is owed, nothing is held,
and no line on any screen says anything. A day recorded on A in between is stamped at
500 — law 2 reached from the wrong end.

The audit poses one question and this document answers it: **what may a phone with no
roster baseline send?**

## What was measured on the base

`9e46032`, Node v22.22.2, the fake cloud in `tests/harness.mjs`, three phones. Both
carriers below were reproduced deterministically before a line was changed; the probes
became the fail-first pairs in `tests/data.test.mjs`.

### Carrier 1 — the baseline is memory, and an app start empties it

`editRoster` sends only the entities that differ from `this._remoteRoster`, the last
roster this device adopted from a snapshot. That object lives in memory and starts empty
at every app start. A phone that edits the roster before its first snapshot arrives
therefore finds EVERY entity different from an empty baseline and sends all of them.

Measured: A holds 500 on its disk (it was away when B raised the rate). A is reopened the
next morning; the person renames a site before the listener has delivered anything.

    a2 rate on disk = 500
    a2 queued: ["roster.workers.w_01","roster.workerOrder","workers",
                "roster.places.p_01","roster.placeOrder","places"]
    cloud rate = 500      a2 rate = 500      B rate = 500

`roster.workers.w_01` is in that queue although nobody touched w_01. It is an ordinary
per-entity write, it wins on the server, and it is a lie.

### Carrier 2 — the queued legacy array, replayed over the snapshot it predates

This is the mechanism the audit records as NOT established, and it is now established. It
is **not** the whole-array branch in `js/sync/sync.js` that a previous reviewer named — a
fix written against that hypothesis was measured, found not to work, and reverted. The
carrier is the same array on the other side of the wire: the REPLAY in
`applyJournalEntry` (`js/sync/receive.js`), reached from `reapplyPending`.

`editRoster` queues the legacy whole `workers` array and the legacy whole `places` array
on **every** roster edit, whether or not anything in that list changed. When a snapshot is
adopted, `reapplyPending` lays the unsent queue back on top of it. The array branch is
guarded — but only against per-entity edits to the SAME list:

    if (perEntity && perEntity.has(parts[0])) return;

A person who edits only a site queues `roster.places.<id>` and nothing under
`roster.workers`. `perEntity` is therefore `{places}`, the `workers` array is unguarded,
and this device's pre-snapshot opinion of every worker is written straight over the
snapshot it was just handed.

Measured, with the baseline PRESENT and correct (no `roster.workers.*` in the queue at
all — the send side did its job):

    A queue paths: ["roster.workerOrder","workers",
                    "roster.places.p_01","roster.placeOrder","places"]
    AFTER RECONNECT  A rate = 500   A baseline = 600   cloud = 600   B rate = 600
    AFTER NEXT EDIT  A rate = 500   cloud = 500        B rate = 500

The two lines are the whole of O2. The first is the silent revert on A's screen. The
second is what turns it into everybody's answer: A's schedule now says 500 while A's
baseline says 600, so the very next ordinary roster edit reports the difference as news
and sends `roster.workers.w_01 = 500` as an authoritative per-entity write.

## The decision

### R1 — a per-entity roster write is earned by an edit, not by a diff against the cloud

`roster.<kind>.<id>` is a claim: *I changed this man.* Only this device's own record can
justify that claim. So the baseline `editRoster` measures against is **the last roster
this device durably recorded**, and the cloud snapshot is used for it only because, once
one has been adopted and persisted, it IS that record.

The audit's three candidates are all answers to "what does a phone with no baseline do".
The decision refuses the premise: **there is no such phone.** A phone that has not heard
from the cloud this session still has its own last durable record on its own disk —
`State.durableText`, the exact bytes it last wrote — and that record is the correct
baseline whether or not a snapshot has arrived. `_remoteRoster` stays primary once a
snapshot has been adopted; until then the baseline is read from those bytes, normalised
through `normaliseSchedule` so the two sides are compared on the same footing.

Rejected, and why:

- **send everything** — today's behaviour, and it is carrier 1. It reverts other phones.
- **send nothing** — the person's edit would be durable and permanently unbroadcast.
  Law 3 is about a commit being durable before it is claimed; it is not permission to
  record an edit and never say it. This one is silent in the other direction.
- **tombstones and the legacy array only** — leaves the per-entity map stale on the
  cloud, which is the map every build since v79 reads in preference to the array
  (`mergeRoster`: the map wins). It would fix the symptom by making the record wrong in a
  place nobody looks at yet.

If the durable bytes cannot be read, there is no local record either, so there is nothing
this device could be stale ABOUT: the old behaviour stands and the whole roster goes up.

Two call sites in `js/sync/receive.js` are seeding the cloud rather than reporting an
edit — the unfinished document with no roster in it, and the document nobody has ever
written to. Those say so explicitly (`{ all: true }`) instead of relying on an empty
baseline to mean "send everything". An implicit emptiness that means two opposite things
is what carrier 1 was.

### R2 — a queued whole array may not contradict the snapshot it is laid on top of

When the outbox is replayed over an adopted snapshot, the queued legacy array is this
device's opinion of the roster from BEFORE that snapshot. It may not contradict the
snapshot about anybody: not about a body — a rate, a name, an archive mark — and not
about membership. It may only carry somebody the snapshot has never heard of, and never
over a tombstone.

This is the rule the tombstone guard beside it already applies to one man, generalised to
every man in the list. The per-entity entries queued alongside carry everything this
device actually changed, so nothing of the person's own work depends on the array: it is
redundant locally and it was never anything but a hazard there.

Outside a snapshot replay — the boot-time journal replay, and the backup reader — there is
no snapshot to contradict and the array is the only opinion there is. It keeps replacing
the list wholesale there, unchanged.

### R3 — nothing here opens a gate, and nothing here restates a stamped day

No flag moves. `LEDGER_WRITES` and `carryAdvances` stay closed. No stamped day is touched
in either direction: this is about what the ROSTER says next, never about what a day
already recorded says.

## Against the iron laws

**Law 2 — days keep the rate they were worked at.** The stamping machinery is correct and
is not touched. O2 defeats law 2 from the other end: a day recorded on A after the revert
is stamped at 500 because the roster A is reading says 500, and it says 500 because A's
own memory of a rate outlived a newer one it had already been told about. R1 and R2 are
the same sentence in two places — *a phone may not put its older copy of a man over a
newer one it has been handed* — and that is the precondition law 2 has always assumed.

**Law 3 — never claim saved before a durable commit.** Every path here keeps the person's
own edit whole. `commitRoster` still journals first and saves second, and its answer is
still read; the batch `editRoster` queues is never empty (the order and the arrays are
always in it), so a roster edit still has somewhere durable to live and still reports
truthfully when it does not. R2 removes nothing from the replay that the per-entity
entries beside it do not already carry — the fail-first pair pins that the person's own
site rename survives the snapshot that arrives on top of it.

**Law 4 — no ordinary edit sends the whole document.** R1 sends strictly fewer field paths
than today, never more. R2 sends nothing at all.

## What this does NOT close

Named here so nobody reads the fix as wider than it is.

- **A v78 reader can still see a stale whole array, briefly.** The queued array is a
  durable operation and is not rewritten by R2 — only its replay is. So a phone that
  adopts 600 and then flushes its pre-snapshot queue leaves `workers` in the cloud
  document saying 500 while `roster.workers.<id>` says 600. Every build since v79 reads
  the map in preference (`mergeRoster`), and the next roster edit rewrites the array from
  the corrected schedule. A phone still on v78 would read the stale array in that window.

  **DECIDED, 3 September 2026: this stays open, deliberately, and is not work.** The
  exposure is to a v78 READER and to nothing else. Law 7 puts the supported floor at v87 -
  "the catch-up half only holds from v87 forward" - so v78 is nine builds below the floor
  this repository says it supports, and the one phone whose build is actually known runs
  v103. Closing it means teaching `sanitiseQueuedRosters` to refresh BODIES as well as drop
  tombstoned ids, and that function is in `js/sync/receive.js`: the highest-consequence file
  in the app, where a mistake is somebody's pay. It currently has one narrow job and a test
  for exactly that job.

  Adding risk to the sync layer for a reader that does not exist is a bad trade, and the
  reason it looks like a good one is that the work is small and the sentence "not closed"
  is uncomfortable. It is written down here as a decision rather than left in the list, so
  that the next person weighs the same trade rather than assuming nobody thought about it.

  What would REOPEN it: a phone found running below v87, or a deliberate choice to keep
  supporting one. Neither is true today.
- **A phone whose disk has no readable schedule still sends its whole roster.** By R1 that
  is deliberate — it has no record to be stale against — but it is a window, and it is the
  one shape of carrier 1 that survives.
- **The audit's other items.** O2 only.
