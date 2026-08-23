# Data safety work — handover

Branch `claude/farkad-data-safety`. **Not merged, not published.** `main` is untouched
and the live site still serves v58.

| | |
|---|---|
| Baseline asked for | `ca0d2d6` (v57) |
| Baseline actually used | `182a51f` (v58) — see below |
| Final HEAD | `210b228` |
| Branch | `claude/farkad-data-safety` |
| Version | v66 |

## The one deviation from the brief

The brief pinned the baseline at `ca0d2d6` and the version at v57. `origin/main` was
already one commit past that, at `182a51f` (v58), from the day-header fix made minutes
earlier in the same session. That commit is layout only — `css/app.css`, the day header
builder, the version strings, and tests. It touches no data path.

The branch was cut from `182a51f` so the header fix is not lost. Everything else in the
brief was followed as written.

## What each commit fixed

### `e1fcdbe` — a device, in Node

The browser suite cannot say "record offline, close the app, reopen against a cloud that
is behind": that is three page lifetimes and two devices. Each device is now a V8 context
with its own `localStorage`, running the app's real classic scripts. `dump()` is what
survives closing the app, so reopening is `makeDevice({ storage: old.dump() })`.

The fake cloud models Firestore, not the adapter's happy path: `update()` rejects when
the document does not exist, and a missing document arrives as an unstamped empty
schedule. Getting either wrong would have made the suite agree with code that fails on a
real project.

**This commit is red on purpose** — it reproduces priority 2 before fixing it.

### `2485a73` — priority 2: the first cloud document

Every project starts with no document, so this was the first write of every new project,
and it failed twice: Firestore refuses to update a document that is not there, and the
adapter answered that by writing `{}`, which the rules refuse because they require
`updatedAt`. The only sign was a status line reading "sync error" over a screen where the
days looked fine.

The sync layer now builds a **complete** document — the whole local schedule, normalised,
stamped, with the pending patch written on top — and the adapter creates it in a
**transaction**, so two phones that both find it missing cannot overwrite each other.

Also: every write carries a stamp, including retries. The rules cannot enforce this — in
an update `request.resource.data` is the document *after* the merge, so it still holds the
stored `updatedAt` — and tightening the rule to demand a changed timestamp would turn a
retry into a permission error.

### `8b9d4a0` — priority 1: the durable outbox

The queue of unsent edits lived in a `Map`. A day recorded with no signal, the app closed
the way a phone app always is, and the edit was gone — and the next morning's first
snapshot was adopted whole without it. Worse, `edit()` returned early when no adapter was
connected, so someone recording for a week before signing in had none of it queued.

An edit is written to disk before it counts as made, keyed by field path. Nothing leaves
the outbox until the cloud acknowledges it, and then only if the seq still matches — an
edit made while a send was open has a higher seq and stays. Signing out does not clear it.

With: retry backing off to a minute, reset by success and by the browser reporting the
connection back; sends batched at 300 paths oldest-first (measured at `[302, 152]` for 450
pending); the count of unsent edits on screen; and a send-in-progress guard that releases
after thirty seconds so a hung request cannot wedge the queue.

**The brief's acceptance test runs end to end** and is in the suite.

### `ae33b08` — priority 3: identity

Two failures that together move money to the wrong person. The suite printed the pay
sheet before the fix: `[["דוד",0],["ח'אלד",450]]` — Ahmad's 400 paid to Khaled.

Ids were one past the highest, so two phones holding the same roster handed the same id to
two different men. Ids are random now. **Ids already issued are untouched** — `w_01` stays
`w_01`.

And the roster travelled as two whole arrays, which cannot merge element-wise: the second
phone's write erased the first phone's new man, his days stayed in the document, and his
row left every report. The cloud document now carries the roster keyed by id, one path per
person, with order as its own field.

Backward compatible on purpose: the whole arrays are still written for phones that have
not updated. **They can stop being written once all three devices are past v66 — that is a
decision to take deliberately.**

An import with a duplicate or missing id now stops and names the id.

### `9da861d` — priority 5: no fake success

`replaceAll()` caught its own error and resolved, and no caller awaited it. A restore that
never left the phone still printed "שוחזר.".

It rejects now and every caller awaits. A pending replacement is written to disk **before**
the attempt, so a crash mid-save and a failed save leave the same note; while it is there,
arriving snapshots are not adopted at all and the replacement is pushed again.

The way back is a three-deep stack, not one slot.

Quickstart no longer replaces the whole document — run on a phone already connected to a
project with data, it would have overwritten the cloud with this device's nearly empty one.

### `65132bf` — priority 7: rules at the write

The two-site cap was only on the screen; a third site can arrive from a copy-yesterday, a
migration decision, or another phone. It is enforced in `assignPlace` and the refusal is
returned, handled centrally in `State.commit`/`commitMany`.

Data already over the cap is **flagged, never trimmed** — those are days somebody worked.

The migration was guessing between two sites with the same name: it reported the duplicate
and then let the first one keep the name, so every cell reading "הרצליה" was attached to
whichever was listed first. Ambiguous names are now removed from the lookup and become
questions.

### `3313baa` — priority 6: one build per session

The page was network-first while the scripts were cache-first, so a deploy served the new
page against the old scripts — and wrote that page into the old version's cache, making it
permanent. Everything is cache-first now, scoped to the current version's cache, and the
document is never written back at runtime.

If a mismatch happens anyway, the page and the scripts each carry their build, they are
compared at boot, and the app **stops writing** rather than saving something the other half
cannot read. Nothing reloads over somebody's typing.

### `4a4e7ee` — priority 4: historical rates

Reading the rate from the roster at report time meant raising somebody's rate restated
every day they had ever worked. The suite watched 2000 become 2250.

A day now records what it was worth when recorded and keeps it through every later edit.
Totals are summed day by day. **Existing days are not touched** — see the decision below.

### `ed9a305` — the roster merge

Filling in the rest of the brief's scenario list found a bug in `ae33b08`, and it was the
worst in the branch. Only *changed* people are written into the per-entity map, but reading
preferred that map — so a document that has always held plain arrays, receiving its first
per-entity write, would have exactly one person in the map, and every updated device would
adopt a roster of one.

That is the live project's exact state today. The two forms are merged now, not chosen
between.

### `210b228` — the stamp identity

Found by running the suite a tenth time. One check failed, then failed seven runs in eight
— the run I had called green was the lucky one.

The fallback stamp fell back to `State.schedule.updatedBy`, which after adopting another
phone's snapshot is *their* id. So this device's next write went out signed with their
name and carrying their timestamp, and the other phone took it for its own echo and never
adopted it. Two people recording the same evening each stopped seeing the other's entries,
silently.

## Tests

| Suite | Command | Result |
|---|---|---|
| Data | `npm test` | **125/125**, ten runs out of ten |
| Browser | `npm run test:smoke` (needs `npm run serve`) | **546/546**, twice |
| Rules | `npm run test:rules` (Firestore emulator) | **24/24** |

The rules suite runs the **real `firestore.rules`** under the emulator. It asserts the
first-sync bug directly — `setDoc(ref, {}, {merge:true})` is denied — and pins the
allowlist, the exact-case email matching, and the create-only history rule that is the
whole reason the daily copies count as a backup.

Every scenario the brief listed has a test. Coverage of each is noted below.

## Not tested

- **The real Firebase project.** Nothing in this branch touched live data. The rules suite
  runs against a local emulator under `projectId: farkad-rules-test`.
- **Real iOS Safari.** The browser suite is Chromium. The service worker change is the one
  most worth confirming on an actual iPhone before merging, because iOS is where its
  behaviour differs most.
- **A real two-device sync against Firestore.** Simulated faithfully, but the SDK's own
  offline persistence and retry are not in the loop.
- **The 300-path batch against Firestore's real per-write limits.** The number is a
  conservative guess, not a measured ceiling.
- **`window.print()` in an installed iOS PWA** — a known pre-existing gap, out of scope.
- **XLSX export offline** — SheetJS is loaded from a CDN, so export falls back to CSV
  offline. Pre-existing, out of scope.

## Decisions that need you

### 1. Historical rates on days already recorded — the one I stopped at

Every day recorded before this branch carries no rate. The roster holds today's number,
and whether that is what the man was actually paid in March is not something anyone can
read out of this data.

`planRateStamping(schedule)` reports what stamping them *would* write. It does not write it.

- **(a) Leave them.** They keep following the roster exactly as they do today. Shipping
  this branch changes nothing about any existing day. A future rate change still restates
  them.
- **(b) Stamp them all at today's rates.** History is frozen — but only correct if today's
  rates are what was actually paid for every one of those days.
- **(c) Stamp only settled accounts** and leave the current one following the roster.

I recommend **(a) for now**, and (c) later once you tell me which accounts are closed.

### 2. When to drop the legacy roster arrays

The cloud document carries the roster twice so an un-updated phone still reads it. Once all
three of you are past v66, say so and I will drop the arrays.

### 3. Firestore rules

Unchanged in this branch. They do not need to change for any of it. Nothing needs
republishing in the console.

## What was not touched

- **`main`** is at `182a51f`, exactly where this session left it. Verified with
  `git rev-parse origin/main` after the last push.
- **The live site** deploys from `main` and still serves v58.
- **The Firebase project** — no writes, no rule changes, no console actions.
- **Safety** — a different GitHub account, never accessed in this session. The only
  repository touched is `yoseffarkad1-eng/farkad`, and the only branch pushed is
  `claude/farkad-data-safety`.

## Old data still reads

Asserted rather than argued:

- a v1 file migrates whole — roster, days, a holiday becoming an absence, an unreadable
  cell staying a question with a split offered and not applied;
- an old-format cloud document (arrays, no `roster`) reads correctly, and an un-updated
  device writing arrays does not cost the updated one anybody;
- payroll and invoice come back **identical** after a backup round trip and after a cloud
  round trip;
- days recorded before rates were stamped keep behaving exactly as they did;
- old ids keep resolving, and days recorded against them still resolve.
