# Architecture — the deeper walk

The working brief is `CLAUDE.md` at the repo root; this file is for the person who
needs to know WHY the machinery is shaped the way it is. Everything here is written
against the code as it stands — where a section names a file and line, that is where
the mechanism lives, and the comment above it usually names the failure it replaced.

## The shape of the record

One document, held in memory by `State.schedule` and on disk under `scheduleData:v2`:

    {
      schemaVersion: 2,
      workers: [ { id, name, idNumber, phone, dailyRate, hourlyRate, active } ],
      places:  [ { id, name, active } ],
      days: {
        "2026-08-12": {
          plan:   { "w_01": { entries: [{ placeId }] } },
          actual: { "w_01": { entries: [{ placeId, rate, extraHours }],
                              rates: { daily, hourly } },
                    "w_02": { absent: true, entries: [] } }
        }
      },
      advances: { "a_x": { id, workerId, date, amount, note } },
      ledger:   { advances: { "le_x": { id, advanceId, kind, ... } } },
      updatedAt, updatedBy
    }

Everything hangs off a `(date, worker)` path, so two people editing different workers
touch different fields and never collide — that is the entire reason v2 exists
(`js/model/schema.js:1-20`). The `plan` layer is legacy: the UI reads and writes only
`actual`, but old documents and the sync paths still carry both, so both must keep
parsing.

Facts about the model that everything else leans on:

- **A worker can be at two sites in one day, and it is still one day's pay.** The pay
  unit is the date, not the assignment; a double day is two pay units whether it holds
  one site or two (`payrollReport`, `js/model/schema.js:1290`). The two-site cap is
  enforced in the model, not only on the screen, and days already over it are reported,
  never trimmed (`daysOverCap`).
- **Days keep the rate they were worked at.** `setWorkerDay` stamps the worker's
  current rates onto the day's first real record and preserves the stamp through every
  later edit (`js/model/schema.js:1149`). Reports price each day from its stamp,
  falling back to the roster only for days that predate stamping — and
  `planRateStamping` exists to show what stamping those old days WOULD do, without
  doing it: writing today's rate onto March would freeze a guess into a pay record.
- **Nobody is deleted, they are archived.** `active: false` removes a person from the
  daily crew and from nothing else. Deletion exists for exactly one case — a name
  typed by mistake with nothing recorded against it — and `workerFootprint` is the
  function that decides, not judgement. An empty `{entries: []}` day counts as a
  footprint on purpose: deleting under it would leave a document that fails its own
  validation.
- **Ids are random** (`newEntityId`), because two offline phones incrementing the same
  counter handed one id to two different men. Ids already issued are never renamed.
  Ids may not contain `.` — every edit travels as a dotted field path, and a dot in an
  id splits the path (`UNSAFE_ID`, `js/model/schema.js:42`).
- **The calendar** (`js/dates.js`): weeks run Friday–Thursday, an account is fourteen
  days anchored to a named Friday (`ACCOUNT_ANCHOR`), dates are local strings built by
  hand — never `toISOString`, which shifts a day east of Greenwich.

## Money: the legacy field and the v80 ledger

An advance is cash handed over mid-account. Today it lives in `schedule.advances`,
where an edit overwrites and a removal deletes — fine for a diary, wrong for money:
after a correction, nothing anywhere says 500 was ever written down
(`js/model/ledger.js:1-25`).

The v80 ledger is the answer: `ledger.advances` is a map of ENTRIES —
`kind: 'given' | 'corrected' | 'cancelled'` — and an entry is never rewritten and
never removed. What the screens would read is a FOLD over the entries
(`foldAdvance`/`foldLedger`), derived and never stored, with every entry that produced
it still there to be read out loud.

But the ledger is **off**. `LEDGER_WRITES = false` (`js/model/ledger.js:42`), and only
a person who knows all three phones are past v79 may flip it — a v79 phone writes
`advances.<id>` and cannot read entries, so a v80 phone that stopped writing the old
field would make its advances invisible on the other two. Until the flip:

- **The screens still read the legacy field.** Nothing in the UI depends on the fold;
  the only ledger consumer on screen is the parity line in settings.
- **The mirror** (`State.migrateLedger`, `js/state.js:164`) runs at every boot: every
  advance already on the record gets a `given` entry, once, with a **deterministic id**
  `le_mig_<advanceId>` — two phones mirroring the same advance mint the same key, so
  the union collapses to one entry instead of letting a random id decide the fold. The
  entry carries `at: ''` and `origin: 'migration'` rather than a fabricated timestamp:
  a made-up date would be the ledger's first lie. The mirror commits like any edit
  (journal, then save) but never announces a refusal — nobody asked for this write,
  and the next boot simply asks again.
- **Merging is union-only.** `mergeLedgerInto` adds entries this device has never seen
  and removes nothing; a v79 snapshot that carries no ledger has not disagreed with
  one (`js/model/ledger.js:260`). The journal refuses a `ledger.*` path whose value is
  null — a deletion in flight is refused, not applied (`js/model/schema.js:567`).
- **Parity** (`ledgerAgreesWithAdvances`, `js/model/ledger.js:285`) is the question
  asked before anything may depend on the fold: does the ledger say what the legacy
  field says, on the numbers that decide what somebody is handed — man, day, amount?
  It reports `missing` (no mirror yet — behind, not broken), `different`, and
  `orphaned`: a `given` entry whose advance was later deleted from the legacy field,
  which is exactly the state where flipping the gate would resurrect a withdrawn
  advance. Settings renders the verdict and says plainly that a red line means the
  gate must not be flipped (`js/ui/settings.js:119`).

One divergence is known and deliberately unresolved: an advance EDITED in the legacy
field after its mirror ran diverges forever — the mirror skips known advance ids, so
parity shows `different` with no automatic repair. The two candidate fixes (reconcile
at boot with a `corrected` entry, or treat the red line as a signal to investigate by
hand) are laid out in `docs/notes-for-the-v79-session.md`; widening the migration's
writes is a decision for the branch that owns the schema, not a drive-by fix.

### The fourth kind, and the fortnight that forgets

`repaid` is cash handed BACK against one advance, on its own date
(`recordAdvanceRepaid`, `js/model/ledger.js`). It accumulates rather than replacing —
a man who pays back 200 twice has paid back 400 — and it does not touch `amount`:
what he was given is a fact about the day it happened, so a statement can say "500
given, 200 back, 300 to settle" instead of reporting an advance nobody handed over.
A `corrected` entry carries the repayments across; dropping them there would
resurrect a repayment as a debt on the one operation somebody reaches for when the
record is already wrong.

It exists because of a fault the legacy field cannot express. A man who takes 5,000
against 3,200 earned is shown a net of nothing, and the next account starts from
zero: the 1,800 he still owes is on no screen, in no file and in nobody's
arithmetic. It is not lost from the RECORD — the advance is still there — it is lost
from the SUM, which is worse, because the sum is what somebody is paid from.

`advanceAccount` (`js/model/schema.js`) walks it. An account takes what it was
carrying, adds what was given inside it, subtracts what was handed back inside it,
and deducts from the wage only what is left — never more than the man earned. The
order is load-bearing: repayments come off before the wage is asked to cover the
rest, or a man who settled in cash is deducted for it a second time out of his pay.
A man with no rate is owed an unknown amount, not zero, so the balance passes
through him untouched. An overpayment does not become a negative balance, which
would quietly add itself to his next wage as though the firm owed him for it.

Every figure is a function of what is dated on or before its own account's last day,
and of nothing else. That is the whole shape, and it comes from one rule the owner
set: **a settled account never changes.** A repayment recorded in September cannot
move a number on a fortnight somebody was paid from in August.

### The fifth kind, and why a payslip is a record

`deducted` (`recordPeriodClosed`) is the deduction WRITTEN DOWN at the moment a period
closes, carrying `periodFrom`/`periodTo` and the `balanceAfter` the ledger screen prints
beside it. Until it existed the deduction was computed on every read — correct arithmetic
over the entries dated on or before the period's last day, and correct only while that
set never changed. It changes: the advance form clamps a repayment into the current
account, but the wire does not, and a phone offline for three weeks, an import or a
restore all deliver entries dated inside a fortnight that was printed and paid. Measured:
a back-dated repayment of 400 moved a closed period's closing balance from 1,950 to 1,550.

So `advanceWalk` returns **two balances**, and the difference between them is the point.
`carriedOut` is what the payslip says and says forever — read from the closure record.
`carriedForward` is what the next period opens owing, and includes anything dated into
this period after it shut. Each single-number answer fails in a different direction:
recompute both and a paid payslip is rewritten; freeze both and a repayment a man
actually made reduces nothing anywhere, which is money out of the sum. `lateSinceClose`
names the gap so a screen can say a transaction arrived after the close rather than
leaving two numbers unexplained.

The worked example is the only one, and every money surface carries it: 0 → 5,000 →
1,950 → 1,750.

**Two labels that never trade places.** `יתרת סגירה` is historical and fixed;
`חוב פתוח` is live. A screen using one word for both has somebody reading a settled
fortnight's figure as what is still owed. A carried balance also keeps a row alive in
`payrollRows` — a man who owes 1,950 and worked no days this fortnight had no row to owe
it on, and dropped off the sheet with the debt.

**Two gates, both shut.** `FARKAD_FLAGS.carryAdvances` is off because turning the
carry on RESTATES accounts that may already have been paid — both of them, in the
worked case: the fortnight the 5,000 was taken in stops deducting 5,000 and starts
deducting the 3,200 he earned, and the next one deducts the rest. This app does not
know which fortnights have been handed over, so `planAdvanceCarry` reports every
account and man it would move, with both answers side by side, and changes nothing —
the same refusal `planRateStamping` makes about stamping old days. And the writer
gate stays shut, because a repayment IS a ledger entry: recording one with the gate
closed writes something the other two phones cannot read, which is the failure the
gate exists to prevent, pointed the other way.

`ledgerWritesEnabled()` now also honours `FARKAD_FLAGS.ledgerWrites`. The const
stays where iron law 1 puts it and its shipped value is unchanged; what it gains is
the seam every other gate has, so a suite can measure the build somebody eventually
ships. `tests/build.test.mjs` fails if any shipped file mentions
`FARKAD_FLAG_OVERRIDES`, the page included — a browser cannot reach it and neither
can a phone. That is a stronger gate than a bare const, which nothing enforces.

## Sync

`js/sync/sync.js` is the largest file in the app and nearly all of it is the residue
of a specific measured failure. The load-bearing ideas:

**Two write patterns, two rules.** The evening roster is built by three people at
once; the record after work is usually one person. Whole-document newest-wins is fine
for the second and catastrophic for the first, so an ordinary edit sends ONE field
path and the server document — which is a field-level merge of everyone's writes — is
adopted whole when it arrives, with this device's still-pending edits re-applied on
top. Adoption is never decided by comparing `updatedAt`: the stamps come from three
phone clocks, and a fast clock would silently discard the other two people's work
(`receive`, `js/sync/sync.js:2434`).

**The journal (outbox) is the spine.** Every edit is written to
`farkad:outbox` — `{seq, items: {path: {value, seq, sent}}}` — BEFORE it is called
done, and `State.commit` refuses the edit if the journal write does not land
(`js/state.js:328`). The journal is what rebuilds edits at boot with no cloud
anywhere, and what is laid back over an arriving snapshot. An entry leaves only when
BOTH are true: the cloud acknowledged it (`sent: true`) and a schedule containing it
was written locally (`pruneJournal`). Reads of the queue are strict —
`readOutboxRecord` rejects anything the app would not have written, because a
structurally-plausible entry naming a layer nobody wrote poisons the schedule three
steps later. Damaged queues are never overwritten; recording continues in the next of
25 slots, and with every slot damaged the device halts (`loadOutbox`).

**Provenance: why deletes need proof.** Permanent deletion is offered only for an id
this device can PROVE it minted (`mine`) and PROVE never left (`sent`), each fact its
own `localStorage` key written at the moment it happens — one key per fact, because a
read-modify-write blob loses one context's fact to another's write
(`js/sync/sync.js:100-118`). `sent` is recorded at the HANDOVER, before the payload
leaves, and the payload does not leave if the record cannot be stored (`flush`,
`js/sync/sync.js:1667`). The question is deliberately "was it made here?", so every
failure mode — unreadable, refused, migrated, imported, restored — answers no, and no
means archive. A generation counter invalidates every `mine` fact at a stroke when a
restore or an export makes local origin unprovable (`forgetLocalOrigin`).

**The roster travels twice.** The wire document carries the legacy whole arrays (what
a v78 phone reads) AND a per-entity map plus order lists (what v79+ merges), because
an array cannot be merged element by element and two phones each sending a whole
roster erased each other's new man (`cloudDocument`, `js/model/schema.js:757`).
`mergeRoster` lays the map over the array; a null in the map is a tombstone that
outranks any stale array. Work outranks a tombstone in turn: a day or advance naming a
deleted worker reinstates him — archived, as whole as anything still remembers him —
rather than leaving pay that nothing counts (`reinstateReferenced`). Queued rosters
are sanitised against newly-learned tombstones before they may flush, and nothing
roster-shaped goes out before the first authoritative snapshot has been heard
(`_heardFromCloud`).

**One writer at a time.** Every cloud write goes through a strict chain
(`cloudWrite`); a hung request delays sync for as long as it hangs and is SAID on
screen, because the old timeout-release let two writes to one field land out of order
and the stale one win. A whole-document restore additionally requires `cloudQuiet()` —
it does not accept a timeout for an answer.

**The restore transaction.** A whole-document replacement (import, backup restore,
cloud copy, snapshot) is an envelope on disk —
`{version: 2, phase, transactionId, supersedesSeq, cloud, document}` — and the
invariant is: **the cloud may be written only once `scheduleData:v2`, read straight
back off the disk, already contains the replacement** (`localDurableHolds`,
`js/sync/sync.js:1850`). The phase is a hint; the bytes are the gate. `supersedesSeq`
marks the journal position the restore replaces — entries at or below it are dropped
only once the replacement is durably stored, and replayed never, because replaying
them puts the pre-restore days straight back. `replaceEverything` runs the four steps
in the only order where a crash between any two recovers to something true, and
resolves with which stage failed instead of throwing. The full failure history is in
`docs/data-safety-audit.md`.

## The recovery ladder

Bottom to top, each rung named for what it refuses to do:

1. **`Store`** (`js/store.js`) wraps every storage touch. `available` (the browser
   blocks storage) and `full` (a write was refused for space) are different failures
   and treated differently. `setVerified` writes, reads back off the disk, and only
   then believes — a disk that accepts a write and stores something else throws
   nothing. On quota, a reclaim ladder may delete old restore points (the ONLY thing
   registered as expendable, by `share.js`, not by Store) and retry the real write.
2. **Quarantine** (`Recovery.damaged`, `js/recovery.js:45`): a record that will not
   parse is copied to `<key>:damaged`, read back before the copy is believed, and the
   ORIGINAL is never deleted, never overwritten, never treated as empty — unparseable
   JSON is usually a truncated write with somebody's days still legible inside it.
   While any problem stands, `farkadWritesBlocked()` is true and nothing writes.
3. **Holds**: a problem whose copy could not be confirmed, or that describes an
   unfinished transaction (a legacy restore whose frozen boundary is unreadable), is
   `mustHold` — acknowledgement cannot release it, because carrying on would prune the
   very journal entries the transaction still owes. `Recovery.halt` is the same state
   for non-record reasons: a build mismatch, no usable outbox slot.
4. **Acknowledge**: after the raw export, the person presses "הבנתי" and writing
   resumes — and the cloud resumes with it (`connectCloudLater` is called back),
   because a device that came back to life local-only used to record all evening with
   the other two phones seeing none of it.

Above all of that sit the boot sentinel (inline in `index.html:402` — depends on
nothing, catches the script that never arrived, stands down when the app takes over)
and the crash banner (`watchForCrashes`, `js/app.js:119`). Exactly one of the two ever
speaks.

## The UI shell

One `render()` (`js/app.js:68`) redraws the visible view on every change — the state
is small, and redrawing is cheaper in bugs than patching.

The bottom of a phone screen carries two fixed bars, and every version that wrote
their heights into the stylesheet was wrong on the next phone. So `js/ui/bars.js`
MEASURES: `--nav-h`, `--day-actions-h`, `--topbar-h` are read off the live boxes after
every layout change, and the stylesheet adds them up. A hidden bar measures zero, so
reserved space collapses on its own. The keyboard is measured the same way
(`visualViewport`), with a 150px floor so browser chrome sliding around does not read
as a keyboard, and a zoom guard so pinch-zoom does not hide the bars.

The safe-area inset comes from `env(safe-area-inset-bottom)` once, as a custom
property (`css/app.css:145`) — it resolves to 0 everywhere it does not apply, which is
exactly the point; a written-down inset would be wrong on the first phone with a
different notch. Two floors are enforced by the mobile suite, not just stated: 44px in
BOTH dimensions for anything a finger lands on (a 44×31 target is not a floor), and
16px for every input, because below that iOS magnifies the page on focus — which is
also why zoom is left enabled rather than locked away (`index.html:5`).

## The update road

Three strings name a build: the `farkad-build` meta in `index.html`, `APP_VERSION` in
`js/app.js`, and `VERSION` in `sw.js`. They move together, in the same commit as any
change to a cached file — `tests/build.test.mjs` fails otherwise, and at boot
`checkBuildConsistency` halts writing if the page and the scripts disagree, because a
page from one build running a sync layer from another writes edits in a shape the
other half does not read.

`sw.js` serves everything cache-first, the document included, from THIS version's
cache only. The install is all-or-nothing — a half-fetched shell throws and the old
build keeps serving — and the old cache is deleted only in `activate`, which the
browser does not run unless install succeeded. A new build is never swapped in on its
own: it installs complete, waits, and is offered as a banner (`js/ui/offline.js`);
the reload waits again if somebody is mid-typing (`midEdit`). The banner does not
survive an iOS restart, so a waiting worker is re-offered on every return to the
foreground, and settings carries a manual check for the phone the banner never
reached. The document fetch has a 3-second deadline: on a site a stuck network loses
to the cached copy, because a white screen over intact data is the failure this whole
file exists for.

`tests/update.test.mjs` drives the entire chain against a real deploy — a served copy
of the app whose three stamps are rewritten while a browser sits on the old build —
because this road is the only way any fix reaches a phone, and it had no test at all
until the day it did.
