# Worker accounts, closure and payment — the design as built (Phases 0 to 8)

Status: **the model, its storage and sync, the server-first closure, the rules for it, the
screens, and closed accounts leaving the live document — shipped shut, on a development
branch.** `FARKAD_FLAGS.paybook` is `false`: every planner refuses with `gate`, nothing in
the app creates a pay entry, the one-debt ruling the owner approved is behind the same
gate, and the screens are reached by nothing. **v176 is not served and not merged; nothing
here has touched a real record, no rules were published, and the gate has never been open
outside a test.** Phase 5 as built comes first below, then Phase 4, then Phase 3; **the
gate may still not be opened**, and [What is still NOT built after Phase
5](#what-is-still-not-built-after-phase-5) says exactly why. **Phase 6 comes before all of
them**: closed months of days leaving the live document, behind a second flag
(`months`, shipped `false`) - with what it measured about the phone's own storage, which
is now the first wall and a blocker of the gate. **Phase 7 comes first of all**: the
phone's cold store, which is the answer to that wall, behind a third flag (`cold`,
shipped `false`), built on this branch merged with main at v180 (`d3103d6`).

**Phase 8 is the activation candidate, and it changes what the paragraph above means.**
The three flags are still `false` and stay false - but they are no longer how the pay book
is turned on. It is turned on for ONE RECORD, by a person, from the app: an entry in the
shared record (the opening) written by a server transaction only the new rules accept.
Wherever a phase below says "the gate may not be opened" or "the commit that opens the
gate", read it against [Phase 8](#phase-8--the-activation-candidate-stamped-v186-on-its-branch-v187-as-a-candidate): there is no
such commit any more, and the order in which it is done is
[`docs/payroll-activation.md`](payroll-activation.md).

**And the release candidate, v187, comes before Phase 8:** that phase merged with main at
v186 (the shared rides), as one commit, with the rules of both in one file and the rollout
table measured again.

Phases 0 and 1 were built on `bd59a68` (v169); Phase 2 on `0acaceb` (v171); Phase 3 on
Phase 2 merged with main at v172 (`8c943fa`); Phase 4 on Phase 3 merged with main at
v174 (`893def8`); Phase 5 on Phase 4 (`1981c5e`). The specification was the audit and design
written against `b640c5a`; where the code disagreed with either, the code won, and every
such place is in [Where the audit and the design were
wrong](#where-the-audit-and-the-design-were-wrong).

    node tests/payroll.test.mjs             # the model, writer on through the test seam
    node tests/paybook.store.test.mjs       # one phone: the gate, the commit, the disk, the files, capacity
    node tests/paybook.sync.test.mjs        # two and three phones on the fake cloud (the old queue door, opened by name)
    node tests/paybook.oldbuilds.test.mjs   # v167, v169 and v171, out of Git, beside this build
    node tests/activation.test.mjs          # Phase 8: turning it on for one record, on the build as it ships
    npm run -s test:paybook-emulator        # the PUBLISHED rules and the production adapter (needs Java)

## The release candidate — v187 (Phase 8 on top of main at v186)

**Candidate. Not served, not merged, on no phone; no rules published; no real record
read.** One commit on `9846d7f`. It waits for the owner's decisions 71, 75 and 76 and his
explicit approval. The release entry is `docs/releases.md`, v187; the order is
[`docs/payroll-activation.md`](payroll-activation.md). Nothing was built in this step: it
is Phase 8 merged with what main gained, re-measured.

### Main at v186 merged in

Main gained v185/v186, the shared rides: `js/ui/transport-share.js`, `transportOps` in the
adapter, five hooks in `js/ui/transport.js`, and `match /transport/{name}` in
`firestore.rules`.

| conflict | resolved as |
|---|---|
| `firestore.rules` | the file `tools/combine-rules.py` builds: the pay book's file with main's 67-line block inserted after `probe/`. Byte for byte the working file handed over with Phase 8 (41,260 bytes). Against main's file: 380 lines added, none removed or changed |
| `package.json` | the union of both chains and both sets of scripts |
| `CLAUDE.md` | main's file; the pay book's per-phase paragraphs replaced by one paragraph and grouped file lines |
| `docs/releases.md` | main's file, whole; the branch's entries above it, under a v187 entry |
| merged by Git, read | `js/sync/firebase-adapter.js` (the pay book's operations inside `firestoreOps`; `transportOps` and its hand-over untouched), `index.html` and `sw.js` (both script lists), `css/design.css`, `tests/harness.mjs` |

### "The rules of before" are now main's rules at v186

`docs/firestore.rules.before-paybook` was the rules of v184. The owner reported pasting
main's file - with the rides' block - on 2026-11-10, so **that file is what is believed
live, and the artifact is now it** (396 lines). Wherever a phase below says "the published
rules" or "the rollback artifact", it is this file. The shared rides' own suites keep their
own "rules of before" - the file from before the block, out of Git (`d3103d6`) - because
their question is a phone that meets rules with no block.

### The rollout table, re-derived

`tests/activation.emulator.test.mjs`, O, T, N and R: v180, v183, v184 **and v186**, each
build's real bytes and its own adapter, on the emulator.

| the build | the rules | the record | |
|---|---|---|---|
| older | live today | not on | records a day, synced |
| older | new | not on | records a day, restores, synced |
| older, beside v187 | new | not on | the mixed fleet: v187 writes a day (protocol 2), the older phone one after it (protocol 1), and again each - all on the server and on both phones, synced |
| older | new | on | a day, an old-style closure and a restore each REFUSED; sync error; the work kept |
| older | live today | on | its restore is accepted and **the pay book is gone** - why the new rules never go back |
| v187 | live today | not on | records a day, shares rides; the step refused by asking (`rules`); sent anyway, refused whole |
| v187 | new | not on / on | turned on; both phones on with one arithmetic |

Every older build answers every question the same way. So: the new rules may be live
before or after v187 reaches a phone; they must be live before the button, and the app and
the rules each enforce that.

### The shared rides beside a record that is on

`activatedNeedsPaybook` is a condition of the schedule document's update. A ride plan is
`schedules/<doc>/transport/<name>`, matched by its own block, which asks who writes, the
shape and the next revision - never the protocol, which a transport write does not carry.
Measured (R, v186's own `transportOps` out of Git, the real rules), on a record that is on:

- the v186 phone's **day is refused**, the record's revision does not move, the phone does
  not say synced;
- the same phone **seats a man and the plan is accepted**; so is its change to the list of
  vehicles; v187 beside it reads that plan and writes the next;
- the rides' own compare-and-set is what it was (a late write is told `conflict`), a
  stranger is refused, and none of it moves the record's revision, pay book or closed
  document.

Not designed; left as it is - a ride plan is not the record and holds no money - and
written in the runbook («A phone on v186 that has not updated»).

### Pinned expectations this step moved

None was weakened; each moved with its reason beside the check.

| suite | was | is | why |
|---|---|---|---|
| `docs/firestore.rules.before-paybook` | the rules of v184 | main's rules at v186 | what is live moved (above) |
| `tests/activation.test.mjs`, V12 | «the place another block of documents under the schedule is added: after probe/, before the schedule's closing brace» - an empty place | the rides' block stands in that place, word for word as the live file holds it; and neither side's rules name the other | the block arrived |
| `tests/activation.test.mjs`, V9b | v180, v183, v184 | + v186 | the build every phone should be on today |
| `tests/activation.emulator.test.mjs` | the artifact asked of `990f5b4`; three older builds; six cells each | asked of `9846d7f`; four builds; eight cells (+ the live rules on a record not on; + the mixed fleet beside this build); + section R; + one rides check in T; every O section takes its phones off the cloud before the next reseeds | the same, and the questions nobody had asked. The last: a phone left connected with refused writes retried them into the next section's record (seen on the emulator when a section was added between two) |
| `tests/months.emulator.test.mjs`, `tests/paybook.archive.emulator.test.mjs`, `tests/paybook.split.emulator.test.mjs` | the artifact asked of `8c943fa` (v172) | asked of `9846d7f` | the same |
| `tests/transport.emulator.test.mjs`, ADD | «with that one block taken out, the file is today's file byte for byte», asked of `firestore.rules` | asked of the file it is still true of (the live one); and of this build's file: the block is that block word for word, and no line of the rules of before is gone around it | this build's file also carries the pay book's rules |
| `tests/transport.share.test.mjs`, `tests/transport.emulator.test.mjs` | an older tree is asked for every file this build loads | less the six only the pay book has (named) | the same rule `tests/yosefgeves.test.mjs` follows |
| `tests/accounts.test.mjs` | «reports.js without its five hooks is main's file», «index.html gained no element» - asked of `990f5b4` | asked of `9846d7f` | v187 is built on v186; main's own new element (the rides' line) is not the pay book's |
| `tests/gate-open.expected.mjs` | `test:build`, `test:gate-integrity` on the list | off it | the stamps moved in this commit, as the list said they would |

## Phase 8 — the activation candidate (stamped v186 on its branch; v187 as a candidate)

**Development branch. Not served, not merged, on no phone; no real record was read and no
rules were published. `paybook`, `months` and `cold` are `false` in everything committed,
and stay false: they are no longer how the pay book is turned on.** This phase merged main
at v184 (`990f5b4`), closed the gaps between Phase 7 and a safe first use, and built the
way the pay book is turned on for a real record. The runbook - who does what, in which
order, and what to do when a check fails - is [`docs/payroll-activation.md`](payroll-activation.md).

    node tests/activation.test.mjs              # the record's own switch, on the build as it ships (fake cloud)
    npm run -s test:activation-browser          # turning it on from the app, in Chromium
    npm run -s test:activation-emulator         # the real rules, the production adapter, v180 / v183 / v184 out of Git
    npm run -s test:gate-open                   # every existing suite with the gates open, against a hand-kept list (in no gate)

### The decision of this phase: the record turns it on, not the build

Until now "open the gate" meant a commit with `paybook: true` - on for everybody who
updates, at the moment each phone happens to update, with three phones on two arithmetics
in between. That is not built. What is built:

| | |
|---|---|
| **what turns it on** | one entry in the shared record: the opening, `pay.po_open` - "tracking begins on this day" (Phase 1's `planOpening`). It was already the first thing the pay book needs, already append-only on the wire and in the rules, and every build that keeps `pay` already carries it. A second entry beside it would be a second fact that could disagree with the first |
| **who** | a person, from the app: ⋯ → «פנקס שכר - הכנה והפעלה», a screen that is read first, one button, the app's own confirmation |
| **the one function** | `paybookOn(schedule)` in `js/model/schema.js`: the build's flag (the test seam - false in everything a person installs) **or** a record that holds a readable opening. `monthsOn` and `coldOn` beside it. Every reader of the three flags now hands over the record: the one-debt ruling (`advanceDebtStays(schedule)`), the planners, `planArchive`, `planMonths`, the two archive moves, the cold store's writer, the screens. `tests/activation.test.mjs` V11 reads the source and lists every remaining read of the three flags: the three predicates and the fallback beside each of their three callers |
| **a new shipped flag** | `paybookActivation: true` - this build OFFERS the step and HONOURS the entry. It is not a second way to turn anything on. `false` is the way back (below) |
| **all phones together** | there is no setting, no local key and no per-phone answer. The same record gives the same answer on every phone that holds it; a phone that has not heard is on the old arithmetic for the WHOLE record until it has, and then on the new for the whole record (V4) |

**With the step offered and nobody having taken it, the build is the build main serves
plus one row in ⋯.** Not argued: every suite of `npm test` and `test:all` that is not about
the pay book runs on the build as it ships, on records with no opening, and says what it
said (the stamp checks apart, on this branch).

### The step, in order - and each stage can be the last with nothing lost

`accDrawActivate` in `js/ui/accounts.js`; the same sequence is run by hand in the suites.

1. **The screen** is `planActivation(schedule, day, stamp)` drawn - see the next section.
   Reading it writes nothing and asks the server nothing (measured in Chromium).
2. **The confirmation**: the app's own dialog, saying the step applies to every phone on
   the record and cannot be turned off from the app, and from which day. Declined: nothing.
3. **The server is asked which rules it runs** - `FarkadSync.activationRefusal()`:
   everything `payTransactRefusal` refuses (no signal, unsent work, a restore outstanding,
   an operation in doubt), `protocol` for a build below 2, and **`rules`** when the server
   still runs older rules. The question is a READ of `schedules/{doc}/probe/paybook-8`,
   which the rules of this branch allow and every published set of rules before them
   refuses (they have no such block). Asking changes nothing anywhere. "Could not ask" is
   never read as "may" (`offline`).
4. **The carry approval**, if this record carries none: the entry the existing review in
   ⋯ writes (`cm_carry`), by the ordinary path. It is not a pay entry. The opening may not
   be sent over unsent work, so the screen waits for the queue and goes on by itself.
5. **The opening**, through the server-first door: one transaction, one create-once
   closed document, or nothing.

**If a build ever sent the opening without asking:** the rules published today refuse it
whole (they have no `closed/`): `refused: server`, nothing queued, nothing in doubt, no
closed document, the record not on - measured on the fake cloud (V3) and on the emulator
with the production adapter (T). So the question in stage 3 is a courtesy, not the lock.

### Why an activation always approves the carry

Measured in `tests/workercard.test.mjs` (Job A, duty 2): the worker's card (v184) reads
`openAdvanceBalance`; the accounts page reads the pay book's own fold. Over twelve seeded
records they are one figure, to the agora, **once the carry is approved** - and before it,
the card says «מקדמות רשומות», what was handed over, and 5 of 23 men read another figure
there than on the accounts page. So `planOpening`, when it is the activation, answers
`carry-approval-needed` whenever the record carries no approval **at all** - not only when
the carry is "needed" - and the step writes it first. After an activation there is no
record on which the two can part. (On the real record it is very likely there already.)

### What the screen shows - the dry runs, as one report

`planActivation` computes on the record **as it will read** (`paybookActivationView`: a
copy of the top level and the pay map with the opening laid in, never written anywhere),
by the functions that already existed:

| on the screen | from |
|---|---|
| «חוב מקדמות שיוצג אחרת» - each man whose open debt reads differently: «היום», «אחרי ההפעלה» | `planDebtRuling` |
| «סגירות ישנות» - how many closures have no payment record | `planPayMigration().paymentUnknown` |
| the carry line, only when the record has no approval | `paybookCarryApproval` |
| «גודל הרישום והארכיון» - the server's document in KB out of 1,024, and what leaves it later, with the sentence that a day of an archived month can no longer be changed | `planArchive().totals` |
| «יום תחילת המעקב» | the field; default the first day of the fortnight that holds today |
| «לפני שמפעילים» - three things to check, and that it cannot be turned off | words |

`planMonths` is in the report (`report.months`) and is not drawn here: on a record just
turned on no month can be ready, and its own page («ארכיון חודשים») draws it when one can.
`planHistoryMove` is what `planArchive` is built on.

### The rules, as they now stand on this branch

Two additions; **nothing was published**. The file is the published one with lines added
and not one removed or changed (V12).

- **`activatedNeedsPaybook`: once the document holds a pay book at all, a writer below
  protocol 2 may not write.** Until this phase an older build could go on recording days
  beside a pay book and only its restore was refused. But a record with a pay book is now
  a record that is ON: it reads debts under the ruling and closes through the pay book,
  and an older build does neither - and could still close an account the old way, with no
  signal, through field paths the rules do not look inside, and send it later. Its screens
  cannot be made right from here; its writes can be stopped.
- **`match /probe/{generation}`**: `get` allowed for `paybook-8` and nothing else, ever.

**This changes one cell of Phase 3's rollout table**, deliberately: «older | new | with a
pay book | records a day» was **yes** and is **REFUSED**. Publishing the rules first is
still safe - with no pay book on the document both additions are vacuous.

### Older builds, measured on their real bytes

v180 (`d3103d6`), v183 (`1af6729`) and v184 (`990f5b4`), their own files out of Git, asked
twice: by `tests/activation.test.mjs`, V9b, on the fake cloud that speaks these rules; and
by `tests/activation.emulator.test.mjs`, O, on the REAL rules through each build's own
adapter. The second is in `test:emulator`. **Whether it had been run when this branch was
handed over is in the hand-over report and not in this file** - a result belongs to a
commit - and the runbook's step A1 runs it on the commit that is served. The table is
what V9b measured; the last row is the emulator suite's alone.

| | before the record is on | after |
|---|---|---|
| records a day | **yes**, synced | **REFUSED** - not on the server, the revision does not move, the phone does not say synced, the day stays on that phone |
| a closure made the old way | (yes) | **REFUSED** - never reaches the server |
| its restore | **yes** | **REFUSED** - the opening and the revision exactly where they were |
| what it shows | today's arithmetic | **still today's arithmetic** - it drops `pay` from its own copy and reads the old walk. This cannot be changed from here; it is why every phone updates first, and why its writes are stopped |
| under the rules PUBLISHED TODAY, on a record that is on *(the emulator suite only; the same cell was measured for a pay book at Phase 3 on v167, v171, v172)* | | its restore is accepted and **the pay book is gone** - so the new rules are never rolled back once a closure exists |

"Stopped loudly" for a build already in the field means exactly this: every write refused,
a sync error instead of «מסונכרן», the work kept on the phone. Nothing gives such a build
a sentence it does not already have.

### The point of no return, and the way back before it

**It is the first closure, payment or answer recorded through the pay book - not the
button.** Between the two the record has gained `pay.po_open`, `cm_carry` if it lacked
one, and the opening's closed document; every day, advance, ledger entry, wage, invoice
line and count is what it was, and the only figure that reads differently is what a man
is said to owe going into an account (V5, field for field).

- **Before it:** serve this build with `paybookActivation: false`. A phone on that build
  reads the activated record exactly as it read before the button - every figure (V6; on
  the emulator, W) - keeps the opening in its own copy, records days at protocol 2, and
  refuses a closure with `gate`. **The rules stay.**
- **After it:** no way back. A closure through the pay book is a frozen payslip and
  deductions a person chose under the ruling.

### A phone that had not heard

V8. The owner turns the record on; a second phone, on this build, has no signal and closes
an account with the old dialog's writer. When it hears: both phones are on, nobody is
stopped, nothing is held, the closure is CLOSED on both (the pay book will not close that
account a second time), and it is on «סגירות ישנות לבדיקה» on both, where a person answers
it once. Not lost, not silent, not a second arithmetic.

### Two phones at once

V7, and N on the emulator with the production adapter: two phones turn the record on in
the same minute with different days - exactly one opening lands, the other phone is told
(`stale`, `opened`) and adopts it; one closed document; no intent, no queued write and
nothing kept beside on either. The same day on both: one opening, both told it is done.

### Settling a pay-book disagreement (decision 49) - DESIGNED, NOT BUILT

**What exists:** «מה לבדוק?» shows both bodies of a disagreement and which one is counted
(Phase 5). Nothing lets a person choose.

**Why it was not built in this phase:** choosing which body is counted changes the fold of
money, on every phone, for a closed account. That is a phase with its own proofs, and
items 1 to 4 of this one came first.

**Why its absence does not block a first use.** A disagreement cannot arise through the
screens: every pay entry is one server transaction under an id two phones cannot both
hold, and the loser is told (`tests/paybook.transact.test.mjs`; for the opening, V7). The
old door through the queue is shut in every build. What is left is a **file**: a backup,
rescue file or restore point from ANOTHER state of the record, restored - the pay book is
unioned, the live body stands, the file's is kept beside it. The runbook forbids nothing
new here; it says who to call.

**The one disagreement that is on no screen:** a disputed OPENING (V7b). It belongs to no
man, and «מה לבדוק?» is a page per man. The server's opening stands on every phone, the
record stays on from that day, nobody is locked, and no figure differs anywhere - so it
is harmless, and it is invisible. Pinned as KNOWN.

**The design**, for the phase that builds it:

- **A new pay entry kind, `resolution`**, id `pr_<disputedId>` - one per disputed id, so
  two phones settling it differently are one path and the second is told. Fields beyond
  the common ones: `targetId`, `workerId` (absent for the opening), `stands`
  (`counted` or `beside`), `digest` (of the body chosen, so that every phone knows which
  of several kept bodies is meant), `reason` (mandatory).
- **Written by the server-first door**, with its own create-once closed document: the
  rules need nothing new - it is a pay entry, and `payGuard` already binds it.
- **Nothing is rewritten.** `pay.<id>` keeps the bytes the server holds and
  `payConflicted.<id>` keeps the others. The FOLD reads a standing resolution: `counted`
  takes the id off the list of disputes; `beside` makes the fold read the chosen kept
  body IN PLACE of the standing one, by digest. The man leaves «לבדיקה» when no dispute of
  his is unresolved.
- **The held queued write** of the phone that lost is retired with the existing
  `answerHold(opId, 'cloud')`.
- **What it does not settle:** two closures of one account with different DEDUCTIONS. That
  is a ledger disagreement (`le_close_*`) as well, and it stops the losing phone through
  Recovery as it always has.
- **The rollout it needs:** a build that does not know the kind reads a `resolution` as an
  unreadable pay entry and stops writing until told (law 10) - loud, not wrong. So every
  phone updates before the first one is written, and the probe's name moves to the next
  generation so that the button can ask.

### The screens of this phase

| | |
|---|---|
| the row in ⋯ | drawn by `js/ui/accounts.js` (`accountsActivationRow`) into a box of its own beside the carry review; asked for by `js/ui/settings.js` in one guarded line; `index.html` holds no element for it. Not on: one sentence and the button. On: the sentence that it is on, and since which day |
| «פנקס שכר - הכנה והפעלה» | drawn in the «מקדמות» tab's own page, as every accounts screen is - only while it is up, only on a record that is not on. «חזרה» gives the tab back to the advances list. The dry runs are drawn once per record and day, not once per repaint |
| «יתרת זכות» (decision 67) | a third small figure on the accounts row and a line on the review page, each only when above zero. The figure is `accountFor().credit` and `planClosure().review.creditBefore` - no arithmetic in the screen |
| «ארכיון חודשים» (decision 57) | reached from «ארכיון סגירות». Phase 6's dry run in Phase 6's own words (`monthsPlanLines`), then one button and the app's own confirmation naming the months and that their days can no longer be changed; then `FarkadSync.archiveMonths`, which can be pressed again after any interruption. Reading the page writes nothing |

Seen in Chromium for the first time in this phase (they were Node-only): the refusal
dialog of an edit of an archived day, and the month dry run.

### Job A - main at v184 merged in

A real merge commit (`11622a7`), two parents. Main gained v181 (polish), v182 (the day's
check, the rides' period report), v183 («עובדי יוסף גבס», a second count per site) and v184
(the seder as a journey, the worker's card, a vehicle turned off).

| conflict | resolved as |
|---|---|
| `js/state.js`, `lostFields` | both tests: main's wider «a site count is never a loss to put back» (`isSiteCountFieldPath`), then the branch's «nor a field the cold store keeps» |
| `js/sync/receive.js`, the echo test | main's two count layers (`owes(layer)`), then the branch's three conditions (the pay book covered, the month index covered, nothing missing from the cold store) |
| `index.html`, `sw.js` | both scripts: `js/ui/accounts.js`, then `js/ui/workercard.js` |
| `package.json` | the union of both chains and both sets of scripts |
| `CLAUDE.md`, `docs/releases.md` | both sides; the branch's own "v181" is named as the branch's stamp, since main has a v181 now |
| the three stamps | v186 |

**Duty 1 - «עובדי יוסף גבס» travels with an archived month.** No shipped byte changed: the
move was already layer-blind. Measured by name: the base record of the months, cold and
emulator suites carries the count beside Rima's, so every «byte for byte» is asked with
the layer in the day; `tests/months.test.mjs` M12 (the month documents hold it; the digest
of a counts-only month is of the days WITH it; a phone installed afterwards is made whole
with it; an edit, a clear and a first count on an archived day are refused in the
archive's sentence; the rules refuse the path; an edit queued before the phone heard is
held and retired by a person; a restore that disagrees keeps the archive's counts);
`tests/cold.test.mjs` K8 (to the cold store and back; a changed cold copy is missing, not
believed).

**Duty 2 - the worker's card beside the accounts page:** above («Why an activation always
approves the carry»).

**Duty 3 - `js/ui/daycheck.js` and `js/ui/journey.js` with the gates open:** their suites
(`test:daycheck`, `test:journey`, and the two browser suites) are in the matrix below.

### The existing suites with the gates open - the whole picture

`npm run test:gate-open` (`tests/gate-open.matrix.mjs`): every suite of `npm test` and of
`test:all`, run through `tests/gate-open.preload.mjs` with `paybook`, `months` and `cold`
open through the test seam, and compared BOTH WAYS with a hand-kept list
(`tests/gate-open.expected.mjs`): a difference not on the list fails it, and so does an
entry on the list that no longer differs. In no gate, on purpose.

Seventeen suites are not run by it, by name: their subject IS the gate, and each opens and
shuts it itself. **The seam is not the activation**: a device opened through the seam has
the flags and whatever record its suite built, usually with no opening - so under this
instrument the «מקדמות» tab is the first-run card, not the accounts list. The activated
record itself is measured, on the build as it ships, in `tests/activation.test.mjs` and
`tests/activation.browser.mjs`.

**The run: 121 suites (84 node, 37 browser). In the first full run 108 said with the
gates open exactly what they say shut and 13 differed; every one was read. One of the 13
was a defect of this phase and was fixed, so the list holds 12.** (A count belongs to a
commit: these are from the runs recorded in the hand-over report of this phase;
`npm run test:gate-open` re-measures.)

| suite | with the gates open | kind | what is different, and where the guarantee is held with the pay book on |
|---|---|---|---|
| `repayment` | 6 checks | **the ruling** | An account that inherits what the one before could not cover: 1,800 under the old walk, the whole 5,000 under the ruling, where the earlier account was never closed. Held: `tests/debt.ruling.test.mjs` (the carry into any account is the sum of what is left on each advance - 60 seeded records, 630 accounts); `tests/activation.test.mjs` V4, V10. |
| `ledger-truth` | 1 check | **the ruling** | The same: the next account opens on everything given in the unclosed account before it, not on what its wage left over. Held: `tests/debt.ruling.test.mjs`. |
| `paycycle-completion` | 1 check | **the ruling** | The same: October opens owing the whole 3,000, not 1,050. Held: `tests/debt.ruling.test.mjs`. |
| `oracle` | 6 checks | **the ruling** | The second calculator is main's documented rule; with the ruling on the app parts from it on every man with an advance behind an unclosed period. **Not held by a second calculator** - see below. Held by: `tests/debt.ruling.test.mjs`, `tests/payroll.test.mjs`, `tests/overpayment.test.mjs` suite 4. |
| `overpayment` | stops at a fixture | **the ruling** | «The middle account closed: 500 off, written against the oldest advance» - under the ruling that closure takes the whole debt, so the history the rest of the suite is built on does not exist. Held: its own suite 4, which builds that history with the gate open and runs in the ordinary gate. |
| `poison` | stops at its own precondition | reading | «The shipped build does not write the pay book», asked of a device the instrument opened. Held: `tests/paybook.store.test.mjs` (poison names under `pay` and `payConflicted`, writer on). |
| `transport` | 1 check | reading | A detector, not a leak: the suite looks for the word "off" (a vehicle turned off) in the rescue file, and with the cold store's reader active the file's `aboutColdStore.state` on a device that never ran `State.load` is that word. No transport key is in the file. Held: `tests/cold.test.mjs` K4. |
| `simple-advances-browser` | stops at its third step | **replaced** | It taps a man's card on the «מקדמות» tab, which is the accounts home. Held: `tests/activation.browser.mjs` (one man's advances page from his row; a repayment and «תיקון טעות» through the real forms - added in this phase for exactly this), `tests/accounts.browser.mjs` (the review page that replaces the old closure dialog, decision 29). |
| `polish-browser` | stops at the quiet zero | **replaced** | v181's quiet zero is measured on the advances list. Held: `tests/accounts.browser.mjs` (a quiet row; a debt figure only above zero). **Not measured with the gates open:** what that suite holds after that point - the empty screens, the week's letter, the backup's age. None is drawn by anything the pay book touches. |
| `settings-order-browser` | 3 checks | reading | The pay book's row in ⋯ is drawn for a record that is not on, or on; under the seam the record is neither and no row is drawn. Held: `tests/activation.browser.mjs`, before and after. |
| `nonassertions` | 1 check | **A DEFECT, fixed** | A literal `check(true)` in this phase's new emulator suite. It failed shut as well; it is a real comparison now and is not on the list. |
| `build`, `gate-integrity` | - | (not the gate) | Were on the list while the branch had many commits (the stamp checks). **Off it since v187**, the commit that moves the stamps. |

**The 108 that say the same**, among them every suite the brief named: `daycheck`,
`journey`, `workercard`, `yosefgeves`, `polish` (node), and in Chromium `daycheck-browser`,
`journey-browser`, `workercard-browser`, `yosefgeves-browser`, `smoke`, `mobile`, `print`,
`forms`, `reports-browser`, `navigation-browser`, `design-browser`, `transport-browser`,
`seder-browser`, `rima-browser`, `week-browser`, `settings-browser`, the service-worker
suites and the exports' proofs.

**One real defect was found by this run** - in this phase's own work: a literal
`check(..., true)` in the new emulator suite, caught by `tests/nonassertions.test.mjs`. It
is a real comparison now.

**There is no second calculator for the one-debt ruling.** `tests/oracle.mjs` implements
the documented rule of main. With the ruling on, the app and that calculator part by
design; the gate-open arithmetic is held by `tests/debt.ruling.test.mjs` (one invariant
over 60 seeded records: the carry into any account is the sum of what is left on each
advance) and by fixtures. Stated as a shortfall, not papered over.

### Pinned expectations this phase moved

None was weakened. Each moved in the commit that moved it, with its reason beside the
check.

| suite | was | is | why |
|---|---|---|---|
| `tests/gate.integrity.test.mjs` | what is OPEN in the shipped build: `permanentDeletion`, `carryAdvances` | + `paybookActivation` | the line that had never moved. The flag opens nothing by itself: it offers the step and honours the entry |
| `tests/gate.integrity.test.mjs` | seven shipped flags | eight | the same flag |
| `tests/gate.integrity.test.mjs` | `HELPERS` | + `gate-open.matrix.mjs`, `gate-open.expected.mjs` | the instrument, in no gate |
| `tests/accounts.test.mjs` | «reports.js without its five hooks is main's file», «index.html gained no element» - asked of `d3103d6` (v180) | asked of `990f5b4` (v184) | the merge base moved |
| `tests/accounts.test.mjs` | ONE ordinary commit in the screens (the carry approval) | TWO, both the carry approval | the activation step writes it too |
| `tests/accounts.test.mjs` | no other shipped script calls into the screens | + one named entry: the row, asked for by `settings.js` | the one way to the activation screen |
| `tests/accounts.test.mjs` | the strings | + `credit`, and 41 for the activation and the months page | |
| `tests/paybook.world.mjs` | `payDevice()`: the flags named; `shipped: true`: no flags | the same, **and the record's switch not honoured** unless `activation: true` | nearly every record in those suites holds an opening, which now turns a build on. The suites go on measuring a BUILD with the flags named |
| `tests/payroll.test.mjs` | «HISTORY (the gate shut)» on an opened record, asked of a device with no flags | asked of a build that does not honour the opening; the build as it ships is asserted beside it (on) | the same |
| `tests/paybook.split.emulator.test.mjs` | an older build beside a pay book «STILL RECORDS A DAY» | «ITS DAY IS REFUSED» | `activatedNeedsPaybook` - see The rules |
| `tests/paybook.split.emulator.test.mjs` | section R: «an ordinary day, sent at protocol 1 ..., is accepted beside a pay book» | «... is REFUSED once there is a pay book» | the same rule, asked by a hand-written write |
| `tests/paybook.split.emulator.test.mjs` | each O section left its phones connected | each takes them off the cloud before the next reseeds the document | an old phone now holds two refused DAYS, a refused day is retried, and it wrote them into the next section's document (measured on the emulator) |
| `tests/months.emulator.test.mjs` | an older phone is handed the suite's base record as its disk and its restore file | the base record **less «עובדי יוסף גבס»** | the base carries the count since this phase (duty 1), and an older build reads a disk that holds the layer as damaged - it never has one |
| `tests/accounts.browser.mjs`, `tests/archive.browser.mjs`, `tests/cold.browser.mjs` | the flags each names through the seam | the same flags **and** `paybookActivation: false` | the same rule for pages as for devices: the flags named decide, on whatever record |
| `tests/archive.browser.mjs` | «with the gate shut none of it exists», asked of a phone with no flags on a record that holds an opening | asked of the build with the pay book shut (`paybookActivation: false`); the build as it ships is asserted beside it: on, the tab the accounts home | an opening now turns the build as it ships on |
| `tests/settings-order.browser.mjs` | «every control» and «every sentence» of the sheet equal the v171 lists | the v171 lists, untouched, **plus `ADDED_SINCE`** - one sentence and one button, named apart | the pay book's row: the one thing a person sees of it in the build as it ships |
| `tests/yosefgeves.test.mjs` | an older tree is asked for every file this build loads | less the six only this branch has (`NOT_ON_MAIN`, named) | the merge |
| `css/design.css` | - | the accounts styles are again the LAST block of the screen-only layer | main appended blocks after them; no rule changed |

### Hebrew in Phase 8

All **proposed**; in the existing block (`ACC_TEXT` in `js/ui/accounts.js`), pinned word for
word in `tests/accounts.test.mjs`, and tabled in [Hebrew in Phase 4](#hebrew-in-phase-4)
with the phase beside each: `credit` («יתרת זכות» - v180's own word), 33 strings of the
activation (`activation…`) and 8 of the months page (`months…`). The months' dry run and
the refusal of an edit are Phase 6's strings, unchanged.

### What is still NOT built after Phase 8

1. **Settling a pay-book disagreement** (decision 49) - designed above.
2. **No real phone, no real record.** Unchanged. The runbook's step 4 is the first reading
   of the dry runs on the real record.
3. **A second calculator for the ruling** - above.
4. **The activation screen does not draw the months plan**, nor the list of the carry's
   rows (it says how many; the rows are in ⋯ as they always were).
5. **A disputed opening is on no screen** (V7b).
6. **A restore into a new, empty project** still does not carry the pay book (decision 47).
7. **The Phase 7 list**: no screen beyond the sentence for a phone whose cold store is
   missing units; the marks are not compacted; the index of closures is not bounded.
8. **Firestore's 40,000 index entries** - not measurable here (Phase 6); in the runbook.

### Decisions for the owner (71 to 78)

| # | the question | recommended default |
|---|---|---|
| 71 | The build that is served OFFERS the step: one row in ⋯ on every phone, on a record that is not on. Nothing happens until somebody opens it, reads the screen, presses the button and confirms - and the server must already run the new rules. | **As built** (`paybookActivation: true`): otherwise the dry runs cannot be read on the real record before the gate opens, and turning it on needs a second served build. The alternative is one line (`false`), a build that shows nothing, and a second build on the day. |
| 72 | All three accounts can press the button (as all three may close and pay, rule 8). | **As built**, with the confirmation. If only the owner should: say so - it is a list of who may activate, in one constant, and a sentence for the other two. |
| 73 | An activation always writes the carry approval if the record has none. | **As built.** Without it the worker's card and the accounts page can show two figures for one man. |
| 74 | From the moment the record is on, a phone on an older build cannot write even a day (it keeps the work and shows a sync error). Before this phase it could go on recording days. | **As built.** It could otherwise close an account the old way with no signal. Every phone updates first - the runbook's step 3. |
| 75 | The day tracking begins: the screen offers the first day of the fortnight that holds today. | **That day.** Earlier only if he wants an earlier period closed through the new screens; it cannot be changed afterwards. |
| 76 | Men on the screen's debt list whose advance was in fact settled by hand in a period nobody closed. | **He notes them at step 4 and records a «החזר» for each after turning it on.** The app cannot know which were. |
| 77 | Settling a disagreement between two bodies of one pay entry (decision 49) is designed and not built. | **Go ahead without it**: it cannot arise through the screens. Build it before any restore from a file is expected in anger. |
| 78 | Every proposed string of this phase. | The owner reads the table; the activation screen's are the ones he will read first. |

## Phase 7 — the phone's cold store (design, then as built)

**Development branch. Not served, not merged, on no phone; no real record was read and no
rules were published. `FARKAD_FLAGS.cold`, `months` and `paybook` are `false` in
everything committed.** The owner approved BUILDING this on 2026-11-10 as a condition of
ever opening the pay book's gate (decision 58). This section was written before the code;
[Phase 7 as built](#phase-7-as-built) at its end says what exists and where the work
stopped.

### The problem

Phase 6 measured it: with the pay book in use at 20 men closing fortnightly, a phone's
localStorage (5 MiB, two bytes a character) stops fitting the record and one copy of it
after about 0.7 years and the record alone after about 1.4, because Phases 5 and 6 shrink
the SERVER's document and deliberately keep every archived day and every closure entry on
the phone ("a phone's record never has a hole").

### The decision, in one table

The invariant is kept **in memory** and given up **on the localStorage record**:

| | holds |
|---|---|
| `State.schedule` (memory) | every day and every entry, at the path it was written at - exactly as before. No fold, report, export or screen changes or reads anything new |
| `scheduleData:v2` (localStorage) | what the server's live document holds, plus whatever has left the server and has NOT yet been proven to be in the cold store |
| the cold store (IndexedDB `farkad-cold`, one object store `units`) | one record per thing that has left the live document: `m:<YYYY-MM>` - the days of an archived month; `c:<rowId>` - the entries of an archived closure, by field path |
| `farkad:cold:u:<unit>` (localStorage, one small key per unit) | THE MARK: "the cold store was read back holding this unit with this digest". ~60 bytes. One key per unit so that two tabs never read-modify-write a shared list |

What is cold is decided by the two indexes the live document already carries
(`payIndex.rows`, `monthIndex.rows`) and by nothing else: a unit is exactly what an index
row stands for (`paybookRowPaths`, the month's days). **Archived units never change** -
both indexes only grow and both kinds of server document are create-once - which is what
makes every step below idempotent.

The digest of a month unit is the index row's own `h` (the server's digest, so a cold
copy is checked against the live document, not only against itself). A closure row
carries no digest of its entries, so the mark carries one (`monthHash` of the canonical
entries), taken from memory at the moment of the move.

### The move: copy, read back, compare, mark, and only then drop (law 3)

`Cold.move()`, asynchronous, one unit at a time, never by a screen - it runs after boot
and after a snapshot is adopted, when the flag is on.

1. **COPY** - `put` the unit into IndexedDB; wait for the transaction's `complete`.
2. **READ BACK** - in a NEW transaction, read the unit and digest what came back.
3. **COMPARE** - with the digest of what memory holds (and, for a month, with the row's
   `h`). Different: the cold copy is not believed, nothing is marked, nothing is dropped.
4. **MARK** - `Store.setVerified('farkad:cold:u:<unit>', digest)`. Not landed: stop.
   (As built: a copy with no mark is never believed afterwards, whatever it looks like -
   the fault real Chromium found; see Phase 7 as built.)
5. **DROP** - the next write of the record leaves the unit out
   (`State.persist` of `coldStrip(schedule)`), read back as every record write is.

A kill at any point leaves one of: nothing changed (before 1); an unmarked cold copy and
the record whole (after 1-3: the copy is simply made again); a mark and the record still
whole (after 4: both hold it - the next boot verifies and then drops); the record without
the unit and the cold store with it (after 5). **There is no order of events in which
both are gone**, because 5 happens only after 2-4 in the same session.

**What a write of the record may leave out - one rule, in `coldStripSet()`:** a unit this
SESSION has read back from the cold store with the right digest (`Cold.verified`), or a
unit the localStorage record did not hold when this session last read or wrote it. So a
save never removes a unit on the strength of a mark alone (the cold store may have been
evicted since the mark was written), and never ADDS a unit to localStorage that was not
there (a phone that refetched three years of archive from the server must not try to fit
them into five megabytes). With the reader inactive the set is empty and the record is
written exactly as today.

### Boot (IndexedDB is asynchronous; the app is not)

`State.load()` stays synchronous and reads localStorage as today. Then, **only if the
flag is on or a mark exists** (`farkad:cold:any`), `Cold.begin()`:

- every index-named unit the record holds: nothing to wait for;
- some are absent: `State.coldMissing()` is non-empty and the app is **partial** from the
  first render. The day screen draws; everything computed over the archive says so and
  refuses (next section). IndexedDB is opened with a deadline (4 s); each unit read is
  digested; the ones that verify are laid into the raw record and the record is
  re-normalised whole (`State.coldRebuild`, the same path `rollback` takes), then
  rendered. Memory is then byte for byte what a phone without a cold store holds.
- IndexedDB absent, blocked, slow past the deadline, throwing, or a unit missing or of
  another digest: **not treated as empty** (law 10). The unit stays in `coldMissing()`,
  the phone does not say synced, and Phase 5/6's gate does what it already does for a
  phone that lacks detail: the next server document is made whole from the server's
  `closed/` and `months/` documents (`closedGate`, `fetchClosed`), adopted, and
  `Cold.move()` then writes the units to the cold store again. A database that answers
  after the deadline is still used; one that refused is asked again at the next open.
- **Private mode / no IndexedDB at all:** nothing is ever moved (step 1 fails), so
  everything stays in localStorage as today, and ⋯ says so.

`rollback()`, `adoptDiskBaseline()` and `loadRecord()` rebuild memory from the
localStorage text; each now lays the units back before normalising - from what the cold
store handed this session, or from the outgoing memory (units never change, so memory is
always a correct source).

### Missing data is said, and blocks what would be wrong without it (law 10)

While `State.coldMissing()` is not empty:

| | what happens | why |
|---|---|---|
| recording a day in a month that has not left | **works** | it needs nothing from the archive; this is the job on the site |
| a day of a missing archived month | drawn with the sentence, never as an empty day; an edit is refused as any archived day's is | an empty day reads as "nobody worked" |
| reports, the pay sheet, the invoice, a statement, xlsx/CSV/print/picture | **refused with the sentence** - all of them, not only ranges that touch a missing month | a missing closure makes every advance read as never deducted and every closed period as open, in ANY range; a pay sheet that silently omits is the worst failure here |
| accounts, closing, paying, an advance, a repayment, a correction (`ledger.`, `advances.`, `pay.` paths) | **refused** before the journal | the planners would judge against folds with entries missing |
| the backup file, a restore | **refused** | a backup that silently lacks the archive is a false backup |
| the rescue file | **always made**; it says what is missing | it is the door of last resort |
| «מסונכרן» | not said (the gate holds the document) | |

### The files and the restore doors

- **The backup file** is `State.schedule`, whole, as before - refused while partial.
- **The rescue file** (`Recovery.rawRecords`) reads localStorage and now also carries
  every cold unit this session read from IndexedDB, raw, under `cold:<unit>`, verified or
  not, with `aboutColdStore` saying the state. `Cold.begin()` reads the cold store even
  when the main record is quarantined (it then reads every unit there is, since the
  index cannot be trusted), so the synchronous export has them.
- **Restore points and `scheduleData:v2backup`** are written stripped, like the record.
  A restore from one loses nothing: archived units never change, and Phases 5 and 6
  already lay the phone's own archived months and closure entries over whatever a
  restored document holds (`layMonthsKept`, `layPaybookUnion`).
- **A restore** changes only what has not left, so the cold store is not rewritten by it;
  memory and the record are written consistently by the existing doors.

### Two tabs on one disk

Marks are one key per unit (no shared list to lose). A `put` of a unit is idempotent (same
key, same bytes). A tab that did not make the move strips nothing it has not itself read
back; when it rebases onto the other tab's smaller record (`diskVerdict`), the units are
carried over from its own memory. The worst case is the record flapping between "with the
unit" and "without" until both tabs have verified - never a hole.

### The reclaim ladder, and full ≠ blocked

`Store.reclaim` deletes restore points and nothing else; the cold store is in another
storage and the marks are not restore points - neither can be reclaimed. A full
localStorage does not stop a move (the mark is ~60 bytes; if even that is refused the
move stops before the drop). Nothing in the ladder waits on IndexedDB.

### The flag

`FARKAD_FLAGS.cold`, shipped `false`. With it shut and no mark on the disk **no IndexedDB
database is opened**, nothing is stripped, and every byte written is today's. The READER
is active whenever a mark exists, flag or not - a build that could not read what an
earlier session moved would read holes.

### Phase 7 as built

    node tests/cold.test.mjs                 # the whole of it on a fake IndexedDB (tests/fake-indexeddb.mjs)
    node tests/cold.browser.mjs              # the same questions put to the REAL IndexedDB, in Chromium
    node tests/months.capacity.test.mjs      # C3: the phone's table, before and after

**Built, behind `FARKAD_FLAGS.cold` (shipped `false`):**

| | where |
|---|---|
| the units, the digests, the move, the boot read with its deadline, what the rescue file carries, the words | `js/cold.js` |
| memory kept whole on load, rollback and rebase; what a write of the record may leave out; what is missing; the refusals | `js/state.js` (`coldNote`, `coldStripSet`, `coldForDisk`, `coldLaid`, `coldMissing`, `coldRefusal`, `refuseColdMoney`, `coldRebuild`, `coldDrop`) |
| a document made whole is not read as this phone's own echo while anything is missing | `js/sync/receive.js` |
| closing and paying refused (`waiting`); a restore does not run | `js/sync/transact.js`, `js/sync/restore.js` |
| the sentence in place of the reports, the accounts, and a day or week of a missing month | `js/app.js` (`coldNotice`) |
| the backup refused while partial; restore points, the undo slot and the pre-adoption copy written as the record is; the rescue file's `aboutColdStore` | `js/ui/backup.js`, `js/recovery.js` |
| one line in ⋯ → מצב המכשיר | `js/ui/settings.js`, `coldDeviceLine` |

**Each requirement, and the check that proves it** (`tests/cold.test.mjs` unless said):

1. **Law 3 - nothing dropped before it is durable elsewhere.** K2: the move is stopped at
   each of its 30 steps (copy, copied, read, marked for seven units; drop; dropped) and as
   each of the 15 cold-store transactions commits. At every one: each unit is in the
   record, or in the cold store under a mark whose digest the copy has; no unit is out of
   the record before its mark is on the disk; the next open has the whole record in memory
   with no signal, and finishes. A mark followed by an eviction does not cost the unit
   (the record still holds it and is not stripped on the mark alone). A copy that reads
   back wrong is not marked; a cold store with no room keeps the unit in the record.
2. **Law 10 - gone is not empty.** K3, eight kinds of damage (evicted; a unit deleted; a
   day changed in a month; an amount changed in a closure; a unit emptied; the database
   refusing to open; never answering; throwing when asked): exactly the affected units are
   listed missing; the app opens and shows the roster and the open month; the sentence is
   said; an advance is refused before the journal, the backup is not made, closing is
   refused, a day of the missing month reads as missing, today's day still records and
   that save writes no hole; the rescue file is made and names what is missing. With
   signal the document is made whole from the server's `closed/` and `months/` documents
   and the phone says synced only then - including when the server's document looks
   exactly like this phone's own echo. The refetched archive goes to the cold store and
   is never written into localStorage.
3. **Boot.** K1: in the first tick after a reopen the archived days are not in memory and
   the phone says «טוען»; once the cold store answers memory is byte for byte what it was.
   A database slower than the deadline: the phone stops saying «טוען» and says what is
   missing. K7: no IndexedDB at all - nothing moves, the record keeps everything, ⋯ says so.
4. **The files and the restore doors.** K4: the backup file is the file a phone with
   everything in one place writes; the rescue file carries every unit and they lay back
   into the whole record; **with the main record quarantined the rescue file still
   carries every unit**; a restore point is written without the units and a restore from
   it leaves the archive whole in memory and the cold store untouched; a backup file
   imported on the same phone, the same.
5. **Two tabs.** K5: both move at once; one rebases onto the other's smaller record and
   keeps the archive; a tab that never read the cold store neither loses it nor writes it
   back; told of a mark, it reads the unit for itself.
6. **The ladder.** K6: a full disk spends restore points and takes no mark and nothing
   from the cold store; with no room for even a mark nothing is dropped and a day still
   records.
7. **Capacity** - below.
8. **A fake IndexedDB and the real one.** `tests/fake-indexeddb.mjs`: asynchronous
   delivery, transactions that commit by themselves and leave nothing if the page dies
   first, copies in and out, quota, eviction, a disk that lies, open failing / hanging /
   blocked on `versionchange`. `tests/cold.browser.mjs`, real Chromium, real IndexedDB:
   no database with the flag shut; the move and a reload; the page closed at four points
   of the move; `deleteDatabase` under an open page (the app lets go of its connection)
   and between sessions, with the sentence on the reports and accounts screens and not
   one ₪ figure drawn; two tabs; no IndexedDB.

**With the flag shut** (K0, B0): through five closures, both archive moves and every save
no database was opened, no mark written, and the record written is `JSON.stringify` of
memory, byte for byte.

**Fourteen mutants** of the shipped code were each run against `tests/cold.test.mjs` and
each is caught (a unit stripped on a mark alone; the read-back not compared; missing read
as empty; a refetched unit written into localStorage; a rebuild forgetting the units; the
echo; no mark written; the boot not checking digests; money accepted while partial; the
backup made while partial; the reader active with the flag shut; the rescue file without
the units; a whole restore point; the Phase 6 fault below).

**Two faults the suites found, both fixed:**

- **Of Phase 6:** `receive()` kept the document AFTER the gate as `_latestRaw`, and the
  two callers that hand `_latestRaw` back to `receive()` then showed the gate a live
  document "holding a day of an archived month", which it calls broken. A phone back from
  no signal with one ordinary unsent day, after a month had left, never said synced again.
  `_latestRaw` is now the document as served.
- **Of this phase, found only in real Chromium:** a copy made and not yet marked when the
  page was closed was believed at the next boot by its shape alone, and the closure's
  entries were then left out of the record with no mark and no comparison. A unit is now
  verified only against its mark. The Node invariant had asked the same lenient question;
  it now asks for the mark.

**NOT built - where the work stopped, exactly:**

1. **No screen beyond the sentence.** A view that is refused shows one sentence; there is
   no progress, no «נסה שוב», no list of which months are missing. The line in ⋯ is drawn
   by `renderSettings` and its WORDS are pinned, but it was not looked at in a browser.
2. **The sentence was not seen on the week grid**, nor the day sentence under a real
   keyboard. The reports, the accounts and the day ARE measured in Chromium (B3).
3. **Not on a real phone, and not a real eviction.** `deleteDatabase` is what a test can
   do; what iOS does after days of disuse is not measured. `navigator.storage.persist()`
   is asked for at the first move and its answer is not read.
4. **The undo slot and the copy kept before an adopted snapshot** are written stripped by
   the same call as a restore point; only the restore point is asserted.
5. **`lostFields`** (the "record went backwards" detector) skips fields the cold store
   keeps; argued, not tested - no suite builds a kept-ring entry under an archived unit.
6. **A phone with years of rows:** `coldMissing()` walks both indexes on every render and
   every save. Not measured at ten years of rows.
7. **A later build that changes the database's version** while an older window is open is
   not designed: this build closes its connection on `versionchange` and reopens at its
   own version, which would then fail and read as "no cold store" - loudly, not silently.
8. **Nothing compacts the marks** (decision 68).

### The phone's capacity, with the cold store

`tests/months.capacity.test.mjs`, C3 - Phase 6's method: 5 MiB at two bytes a character is
2,621,440 characters for everything the app keeps; 20 men; on top of today's 185 KB.

| 20 men | year 1 | year 3 | year 10 | the record AND one copy stop fitting | the record ALONE stops fitting |
|---|---|---|---|---|---|
| closed fortnightly, BEFORE (Phase 6) | 1,715 K chars | 5,152 K | 17,183 K | **after 0.7 years** | **after 1.4 years** |
| **closed fortnightly, WITH THE COLD STORE** | 452 K | 809 K | 2,103 K | **after 4.5 years** | **after 11.6 years** |
| closed weekly, BEFORE (Phase 6) | 3,118 K | 9,369 K | 31,247 K | after 0.4 years | after 0.8 years |
| **closed weekly, WITH THE COLD STORE** | 630 K | 1,253 K | 3,479 K | **after 2.4 years** | **after 6.5 years** |

The server's document, from Phase 6's table, is full after 4.3 years fortnightly and 2.3
weekly - so **the phone is no longer the first wall**: with one copy it now lasts as long
as the server's document does, and alone far longer. In the cold store at year 10: 15.3
million characters fortnightly, 28.3 million weekly - megabytes, which is what IndexedDB
is for.

**What still grows in localStorage without bound** - 179 K characters a year fortnightly,
312 K weekly:

| | |
|---|---|
| the rows of the closure index (`payIndex`) - one per closure, never folded | the largest part; decision 59 |
| the marks - one key per unit, about 48 characters a closure | 25 K a year fortnightly, 49 K weekly; decision 68 |
| advances and their ledger origin - none ever leaves | decision 60 |
| the month index - a row and the calendar dates of each month | small |
| today's 185 KB of days from before the tracking day | constant, unless decision 55 |
| restore points (up to the album's limit) and the copy before an adopted snapshot | each is one more copy of the record as written; the ladder spends them first |

### Hebrew in Phase 7

All **proposed**, in one block (`COLD_TEXT` in `js/cold.js`), pinned word for word in
`tests/cold.test.mjs`.

| string | where |
|---|---|
| טוען את הארכיון השמור במכשיר… | in place of a screen, while the cold store is being read |
| חלק מהרישום הישן שהועבר לארכיון לא נמצא כרגע במכשיר הזה. הדוחות, החשבונות והגיבוי לא יוצגו עד שהוא יושלם מהשרת, כדי שלא יוצג סכום חסר. רישום הימים ממשיך כרגיל. | in place of the reports and the accounts; the refusal of the backup |
| אין כרגע קליטה. כשתהיה, המכשיר ישלים את החסר בעצמו. | added to it when the browser says it is offline |
| הארכיון במכשיר לא שלם | the title of a refusal |
| אי אפשר לרשום עכשיו מקדמה, החזר או סגירת חשבון: חלק מהרישום הישן לא נמצא במכשיר, והחישוב היה יוצא חסר. הרישום לא שונה ודבר לא נשמר. המכשיר ישלים את החסר מהשרת כשתהיה קליטה. | the refusal of an advance, a repayment, a correction or a closure |
| היום הזה שייך לחודש שהועבר לארכיון, והעותק שלו לא נמצא כרגע במכשיר. הוא לא ריק - הוא חסר. | in place of a day (or a week) of a missing archived month |
| ארכיון במכשיר: שלם ({n} פריטים) | ⋯ → מצב המכשיר |
| ארכיון במכשיר: חסרים {n} פריטים מתוך {of} | ⋯ → מצב המכשיר |
| ארכיון במכשיר: בטעינה | ⋯ → מצב המכשיר |
| ארכיון במכשיר: אין בדפדפן הזה אחסון נפרד, ולכן הכול נשמר באחסון הרגיל | ⋯ → מצב המכשיר, a browser with no IndexedDB |

Closing and paying while anything is missing reuse Phase 5's `waiting` and its sentence.

### Pinned expectations this phase and the merge moved

None was weakened.

- `tests/gate.integrity.test.mjs`: the shipped flags are SEVEN (`cold`, declared so that
  it can be declared shut, with a line asserting `false`); `HELPERS` gains `oracle.mjs`
  (main's), `fake-indexeddb.mjs` and `cold.world.mjs`.
- Six lists of files an older build never had gain `js/cold.js`: `NOT_IN_V165`
  (`tests/rima.test.mjs`), `NOT_IN_V179` (`tests/overpayment.test.mjs`, new at the merge),
  and `NEW_HERE` in `tests/paybook.oldbuilds.test.mjs`, `tests/paybook.split.emulator.test.mjs`,
  `tests/paybook.archive.emulator.test.mjs`, `tests/months.emulator.test.mjs`.
- `tests/accounts.test.mjs`: «reports.js without its hooks is main's file» and «index.html
  gained no element» are asked of the new merge base, `d3103d6` (v180), not `893def8`.
- `tests/oracle.test.mjs`: the anchor of one mutant («a deduction larger than the wage»)
  is this branch's line - the same deduction with `advanceLiveRoom` beside it.
- The stamps are v181 on this branch. The commits after the merge change cached files
  without moving them, so `tests/build.test.mjs` and `tests/gate.integrity.test.mjs` are
  red on their stamp checks, as on this branch before.

### Decisions for the owner (64 to 70)

| # | the question | recommended default |
|---|---|---|
| 64 | Once a phone has moved anything to the cold store, a build with no reader would read a record with holes. | **Accept: one way.** Every later build carries the reader (it is not behind the flag). Never serve a build older than the first one that had `cold` on to a phone that used it. |
| 65 | While part of the archive is on a phone in neither place: reports, accounts, the backup, advances and closures are refused with a sentence, and the day screen goes on recording. | **As built.** The alternative - blocking the whole app - stops the crew recording today's work over a problem with last year's. |
| 66 | Ask the browser not to evict (`navigator.storage.persist()`), at the first move. Some browsers show a question. | **Ask.** It is the one thing that makes an eviction less likely; the answer is not relied on. |
| 67 | (From the merge.) The accounts page now shows «חוב מקדמות» net of a man's credit, and has no line naming the credit. | **Add the line «יתרת זכות» to the account row and the review page before the gate opens**, in v180's words. Not built. |
| 68 | The marks grow 25 K characters a year (49 K weekly). | **Leave them** until decision 59's index pages are built; a page of rows can then carry one digest for all of its units. |
| 69 | The first move on a phone that already holds years of archive writes it all to IndexedDB in one run after boot (seven units are what the suites move; thousands were not measured). | **Measure on a real phone with a year of synthetic data before opening the gate.** |
| 70 | The sentences of this phase are proposed. | The owner reads the table above. |

## Phase 6 — closed months of days leave the live document (design, then as built)

**Development branch. Not served, not merged, on no phone; no real record was read and no
rules were published. `FARKAD_FLAGS.months` is `false` and `paybook` is still `false` in
everything committed.** The owner approved BUILDING AND TESTING this on 2026-11-10 (his
word: «موافق»), not publishing it. This section was written before the code and corrected
after it; [Phase 6 as built](#phase-6-as-built) at its end says what exists, what was
measured, and where the work stopped.

### The problem

The record is one Firestore document and Firestore refuses one over 1 MiB. Phase 5 moves
settled closures out of it; the DAYS are the larger half and stay. Measured at Phase 3 for
20 men from today's 185 KB: the days alone fill it in about two years, and then every write
on all three phones is refused.

### The decision, in one table

Phase 5's invariant is kept and extended, not replaced: **a phone's record never has a
hole.**

| | holds |
|---|---|
| the server's live document | the days of every month that has NOT left, and `monthIndex` - one row per month that has, and the list of that month's calendar dates |
| the server's month documents | `schedules/{doc}/months/{YYYY-MM}_{digest}` - the days of one month, verbatim, create-once |
| **a phone's own record** | **every day, at the field path it was written at, exactly as before anything left** - and the index, as the server holds it |

So no report, no fold, no export and no screen reads the index: `payrollReport`,
`invoiceReport`, the week grid, the xlsx and CSV, the pay sheet read `days` as they always
have, because on a phone the days are still there. The index is used at the boundary, in
the same two places as Phase 5 and through the same functions (`closedGate`,
`closedAware`), which now make whole and strip both things.

### Eligibility (the default the owner was told)

`planMonths(schedule, today, { afterMonths })` - the dry run, and the list the move works
from. It writes nothing. One row per calendar month that holds at least one day:

| state | means |
|---|---|
| `archived` | already out of the live document |
| `ready` | every man's every day in it is inside a closed, settled account, and at least six calendar months have passed since the later of its last such closure and its last day |
| `waiting` | the same, and younger than that |
| `held` | it stays - `why`: `current` (the month is not over), `open` (some man has a day in it that no closed account covers - named), `before-opening` (the same, and every such day is from before the tracking day, so no account ever will: decision 55), `unsettled` (a covering closure is owed, unanswered, disputed, overpaid, corrected or irregular - named), `unreadable` (a day this build cannot read: law 10, it stays where a person can see it), `too-large` (over 900 KB: one document could not hold it) |

"Settled" is Phase 5's word and Phase 5's function: a closure `planArchive` would call
`ready`, `waiting` or `archived`. A month with a Rima count and no worker-day is settled by
definition (nobody's account covers a Rima count) and waits six months from its last day.
**Everything in a day moves with the day, byte for byte** - `plan`, `actual`, the rate
stamps inside each entry, `rima`, `vehicleRuns` and any layer this build has never heard
of: the month document holds `days[date]` as the server holds it, and nothing is rebuilt.

### The move: copy, read back, compare, and only then drop

`FarkadSync.archiveMonths({ today, limit, only })` in `js/sync/months.js`, one month at a
time, Phase 5's loop: nothing about a move in progress is written on the phone; each step
begins by READING the server and does the next thing it calls for.

1. Read the live document. The row is there and no day of that month is: done.
2. The live document's days of the month must be this phone's, byte for byte (`differs`).
3. The month document is named by its content: `{YYYY-MM}_{digest of the canonical days}`.
   **This is the one place the pattern differs from Phase 5, and it is forced.** A closure
   is frozen; a day of a month that has not left yet is not (a Rima count, a late day for
   a new man). With one fixed name a copy made before such an edit could never agree
   again and the month could never leave. Named by content, a stale copy is simply a
   document nothing points at.
4. **THE COPY**, if no document of that name exists: created once, in a commit that moves
   the revision and changes no business field (`adapter.copyMonth`).
5. **THE DROP** (`adapter.archiveMonth`): the days leave, the row and the month's calendar
   dates arrive, in one commit. Inside that transaction the adapter reads the month
   document and the schedule and confirms the document holds exactly the days being
   removed, each equal (`month-unconfirmed`, nothing written). Back to step 1, which is how
   success is confirmed - by reading, at a revision at least that new.

Refused with nothing attempted: `gate` (either flag), `busy`, `waiting`, `unsupported`, and
everything `payTransactRefusal` refuses a closure for (`offline`, `unsent-work`, `pending`,
`restoring`). **Never by itself**: unlike a closure, a month moves only when somebody asks
(decision 57).

### The rules (extended on this branch; nothing published)

One file for the pay book and this together. Added:

- **The month index only grows** - no row removed or changed, no date removed
  (`monthGuard`).
- **A row arrives one at a time**, in a protocol-2 write that names it (`archivedMonth`)
  and its document (`monthDoc`); that document must ALREADY EXIST, be of that month and
  that digest; the dates added must be exactly the document's; and **the days that leave
  must be exactly the days the document holds - by key, checked by the server**
  (`archivesMonth`). That the VALUES are equal is the adapter's, inside the transaction:
  the rules cannot loop.
- **No write, by anybody, of any shape, may add, change or remove a day whose date is in
  the index** (`daysGuard`). This is what refuses a whole document that would resurrect
  archived days, and a stale queued edit from a phone that had not heard. It is why the
  index carries the calendar dates as a flat list: the rules have no loops and no string
  functions over a set, but they can ask whether two sets meet.
- **Once a month has left, a writer that does not speak protocol 2 may not write at all**
  (`monthsNeedPaybook`), for Phase 5's reason: an older build installed afresh would read
  those months as empty.
- **A project may not begin with a month index.**
- `months/{id}`: create-once, never updated or deleted, creatable only in the commit that
  takes the schedule to the revision it names (the rule a closed document already has),
  and only under the name its own month and digest give it.

With no month index on the document every one of these is vacuous, which is what makes
publishing the rules before any phone updates safe - to be MEASURED, not argued (see the
rollout table).

### On the way in: whole, or not adopted

`closedGate` (top of `receive()`) now also calls `monthsWhole`. For each row: the days are
laid back from this phone's own record when its days of that month have the row's digest;
else from the last server document this phone adopted; else from the month document, which
is fetched. A document that cannot be made whole is NOT adopted: the phone keeps the
record it has, leaves «מסונכרן», and tries again on Phase 5's ladder. A row this build
cannot read, or a live document that holds a day of an indexed month, cannot be made
whole by anything and is held as `broken` - loudly, never papered over.

### On the way out

`closedAware` strips the days of indexed months from the three whole-document writes
(`save`, `create`, the daily cloud copy). A field-path edit is untouched - and one that
names an archived day never leaves the phone (next section).

### The six hard questions

**1. Does the phone keep the archived days?** Yes - only the server shrinks, as Phase 5
chose for closures, and for the same reason: every reader of `days` stays untouched. **It
moves the wall and does not remove it**; the phone's own storage becomes the bound. Both
bounds are measured in [Capacity](#capacity-for-20-men-with-months-leaving); the next step
is proposed there, not built.

**2. An edit of an archived day.** Refused, in a sentence, before anything is written:
`State.commit` and `State.commitMany` ask `monthArchivedPath` first, put memory back
(`rollback`), and say why and what to do. Nothing is journalled, so nothing is owed and
nothing can be reported as saved (law 3). An edit that was ALREADY queued when the month
left (made offline on another phone) is not sent - the pre-send pass holds it with the
contested writes, durably, and it is listed in ⋯ with both sides, where a person retires
it; the server would refuse it in any case. It is never dropped silently (law 10).
Bringing a month back was considered and rejected for this phase: a month document is
create-once and the index only grows, so "back" needs a second generation of both - a
larger mechanism than the one it corrects. The correction of a wage that is already
closed has a door already: an adjustment on the man's statement (Phase 2). Decision 54.

**3. Reports and exports over a range that includes archived months.** The same figures,
by construction (the phone's days are whole) and by proof: one string of every report over
the whole range, compared before and after, on the phone that moved, a phone that watched,
a phone that was away, and a phone installed afterwards.

**4. Backups, the rescue file, the four restore doors, the daily copy.** The backup and
the rescue file are the phone's record, so they carry every day, archived or not, and say
so in the file. A restore never changes an archived month: `layMonthsKept` puts the
phone's index and the archived months' own days over whatever the file held, before the
document is built; the write is stripped; and the server refuses any whole document that
touches an archived date or drops a row. Older builds are measured out of Git.

**5. Rules.** Above; the rollout table is re-measured below.

**6. Capacity.** Re-measured below, with what still grows.

### Phase 6 as built

    node tests/months.test.mjs                  # the model, the move, the gate, the refusals, the restores, the files - on the fake cloud
    node tests/months.capacity.test.mjs         # 20 men: the server's document and a phone's storage, weighed
    npm run -s test:months-emulator             # the rules, the production adapter, three older builds (needs Java)

**Built, behind `FARKAD_FLAGS.months` (shipped `false`; it needs `paybook` as well):**

| | where |
|---|---|
| the model: eligibility, the dry run and its words, the month document, the row, whole and stripped, what a restore keeps | `js/model/months.js` (pure) |
| the move: copy, read back, compare, drop; the retiring of a held edit | `js/sync/months.js` |
| the gate on the way in and the strip on the way out - Phase 5's two functions, now doing both | `js/sync/closed.js` |
| `copyMonth`, `archiveMonth` (the confirmation inside the transaction), `readMonth` | `js/sync/firebase-adapter.js` |
| the rules for both the pay book and the months, one file | `firestore.rules` |
| an edit of an archived day refused before the journal | `State.refuseArchivedMonth`, called by `commit` and `commitMany` |
| a queued edit of an archived day held and never sent; «mine» refused as an answer | `sendClaimed`, `contestedPaths`, `heldRecords`, `answerHold` |
| a restore keeps every archived month as the archive holds it | `layMonthsKept`, called twice in `js/sync/restore.js` |
| the index carried by every door a record comes through | `normaliseSchedule`, `replacementContent`, the echo test in `receive()` |
| the backup and rescue files say what they carry; the rescue's comparison knows each month | `js/ui/backup.js` |
| the fake cloud speaks the same contract | `tests/harness.mjs`, `tests/accounts.cloud.mjs` |

**NOT built - where the work stopped, exactly:**

1. **No screen.** The dry run is a function (`planMonths`) and its words (`monthsPlanLines`);
   nothing draws it and no button calls `archiveMonths`. With both flags open a month still
   moves only if code calls the function. Three sentences ARE wired to existing screens - the
   refusal dialog of an edit, the row of a held edit in ⋯ (one sentence, one button), and
   the waiting sentence on the accounts page - and **none of the three has been seen in a
   browser**: they are asserted in Node only.
2. **A phone's copy does not shrink**, and with the pay book in use that is the wall that
   is hit first. See Capacity. This is the largest thing the phase leaves (decision 58).
3. **The server's document is still not bounded.** The days are; the index of closures is
   not. See Capacity (decision 59).
4. **Nothing before the tracking day is eligible**, by the shipped default: today's 185 KB
   of history stays in the live document for good unless the owner says the opening
   settles what came before it (`planMonths(..., { beforeOpening: true })`, decision 55).
   `archiveMonths` does not pass that option today, so even the function cannot move it.
5. **Bringing a month back** (decision 54), and **an automatic move** (decision 57).
6. **A restore that meets a month archived by another phone while it was waiting to be
   sent** (`restore.js`, the second call of `layMonthsKept`) is written and not tested. The
   fallback is: the server refuses the write and the restore stays owed.
7. **The oracle on main was not merged in.** Question 3 is answered by the proof described
   under it below, not by `tests/oracle.mjs`.

### The six questions, answered with what was measured

**1. The phone keeps the archived days - and that only moves the wall.**
`tests/months.capacity.test.mjs`, C2, at 5 MiB of localStorage and two bytes a character
(2,621,440 characters for everything the app keeps), 20 men, closed fortnightly, on top of
today's 185 KB:

| what the phone keeps | year 1 | year 3 | the record AND one copy of it stop fitting | the record ALONE stops fitting |
|---|---|---|---|---|
| **as built: every day and every closure entry** | 1,715 K chars | 5,152 K | **after 0.7 years** | **after 1.4 years** |
| archived days dropped, closure entries kept | 1,493 K | 4,014 K | 0.7 years | 1.7 years |
| only what the live document holds (days and closures both dropped) | 428 K | 736 K | 5.1 years | 13.3 years |
| nobody closes: days and advances only | 503 K | 1,502 K | 2.2 years | 4.8 years |

"One copy" is `scheduleData:v2backup`, which every adopted snapshot writes; the reclaim
ladder gives it and the restore points up before it refuses. Measured on a device with a
real five-megabyte edge: a record of 2.0 million characters is adopted, one of 3.0 million
is not («no room to store the update; it was not adopted»), and the phone does not say
synced.

**Read it plainly.** Once the pay book is in use the PHONE is full before the SERVER is
(1.4 years against 4.3), and it loses its way back from a bad snapshot after about eight
months. Dropping archived days from the phone would not fix it: the closure entries are
three quarters of the weight, and Phase 5 chose to keep them too. **Nobody is at this wall
today** - with nobody closing through the pay book a phone has 4.8 years - but opening the
gate starts this clock, so this is a blocker of the gate, not a note.

**Proposed, not built (decision 58):** the phone keeps in localStorage only what the
server's live document holds, and keeps what has left - archived months, archived closure
entries - in IndexedDB (hundreds of megabytes on the same phones), loaded into memory at
boot and laid at the same paths. Every fold and report still reads one whole record, so no
arithmetic changes; what changes is `State.load`, `State.persist`, `Recovery` and the
backup doors, which is why it is a phase of its own. Until then the invariant "a phone's
record never has a hole" is paid for in the phone's storage.

**2. An edit of an archived day is refused in a sentence; one already queued is held.**
Measured in `tests/months.test.mjs`, M6: the commit answers false, the dialog says «החודש
הזה בארכיון» and the sentence below, nothing is journalled or sent, the disk is byte for
byte what it was, and memory is put back. A Rima count, a batch with one such day in it
(refused whole), and a brand-new day on a date of that month that held nothing are refused
the same way; a day in a month that has not left is recorded as ever. An edit made with no
signal BEFORE the phone heard: never sent (no write to that date leaves the phone, through
a reopen too), the ordinary day queued behind it IS sent, the phone does not say synced,
the row is in ⋯ with the archive's value beside it, «mine» is refused as an answer, and a
person retires it - after which the phone holds the archive's value and says synced.
The server refuses such a write in any case (Y2). **What this costs, said:** a Rima count
in an archived month can never be corrected - the client's invoice for it is final six
months after its last day. A wage has the adjustment on the statement; a Rima count has
nothing. Decision 54.

**3. Reports over a range that includes archived months: the same figures.** Proved as one
string - `payrollReport`, `invoiceReport`, every man's `workerDaysReport`, `rimaReport`
over September to November, `accountsList`, and `days` itself - equal before and after, on
the phone that moved the months, a phone that watched, a phone reopened from its disk, a
phone that was away for the move, a phone installed afterwards (fake cloud and emulator),
a phone with the flag shut, and with Phase 5's move before and after this one. **Not
compared byte for byte:** the xlsx, the CSV, the week grid, the printed pay sheet and the
picture. They read `days` and the roster through those same functions and `days` is
asserted identical, which is an argument from construction for those five, not a
measurement of them.

**4. A restore never loses or duplicates an archived month.** M8 and Y1: a file from
before the move, one from after, a daily cloud copy (no archived days in it), and a file
whose October disagrees with the archive and whose November was really changed - each is
accepted by a server that refuses any write to an archived date; the index, the dates and
the month documents are exactly what they were; the document sent carries the index and no
day of an archived month; both phones hold October as the archive does; and November - a
month that has not left - is the file's, as asked. A phone that holds nothing with the
archive's digest does not run a restore at all (`prepare`, record untouched). From a build
that does not know archiving (v167, v171, v172, out of Git, on the emulator): the whole
document it sends - October back in it, no index - is **refused**, with the index, the
dates, the days and the revision exactly where they were. The backup and the rescue file
carry every day and say so in the file (`aboutArchivedMonths`); with no month out the
backup file is byte for byte what it was. The daily cloud copy is the live document's
shape.

**5. The rules, and whether publishing them first is still safe.** See the next section.

**6. Capacity.** See the section after it.

### The rollout table, re-measured

`tests/months.emulator.test.mjs`, Y5 and Y6: v167 (`a25566f`), v171 (`0acaceb`) and v172
(`8c943fa`), their own files and their own adapter out of Git, and this build. All three
older builds answer every question the same way. Rows about the pay book alone are Phase
3's and Phase 5's, measured by their own suites under THESE rules in the same chain.

| client | rules | document | records a day | restores | moves a month |
|---|---|---|---|---|---|
| older | new | today's: no pay book, no month out | **yes** | **yes** | - |
| older | new | with a pay book, no index (Phase 3) | yes | REFUSED, nothing erased | - |
| older | new | a closure has left (Phase 5) | REFUSED | REFUSED | - |
| older | new | **a month has left** | **REFUSED** - the day stays on that phone, the revision does not move, it does not say synced | **REFUSED** - the index, the dates, the days and the revision exactly where they were; the month documents untouched | - |
| this build | today's | either | yes | yes | **REFUSED whole** - those rules have no `months/`; the read is refused, nothing is copied, nothing leaves (`server`) |
| this build | new | a month has left | yes, in a month that has not left; an archived date is refused on the phone and by the server | yes; archived months kept as they are | yes |

**Measured, and the reason for the fourth row:** an older build that adopts a document
with a month out **loses those days from its own copy** - it reads October as empty (0 of
12 days, all three builds). Its screens cannot be made right from here; its writes are
stopped (`monthsNeedPaybook`).

**Is publishing these rules BEFORE any phone updates still safe? Yes - measured, for the
document as it is today.** Every new guard is vacuous while the document has no month
index and no pay book: all three older builds record a day and restore a file under the
new rules (first row). The order of Phase 3 stands unchanged, with one line added to its
last step:

1. Save the published rules and compare with `docs/firestore.rules.before-paybook`.
2. Publish `firestore.rules` - **once, for the pay book and the months together.**
3. Update the phones. 4. Check each phone in ⋯.
5. Only then open the gates. **From the first month that leaves, as from the first closure
   that leaves, a phone on an older build can no longer write at all** and must be updated
   before it is used again. THE ROLLOUT RULE already says every phone updates first.

**Protocol 2 now means "keeps the pay book AND knows the months".** No build that speaks
protocol 2 has ever been served (v175 and v176 are this branch), so there is no phone in
the field that speaks 2 and does not know the months. The first build served with
protocol 2 must carry this phase's reading half - which it does, flag shut or not.

**What the server enforces, and what it does not** (Y2, Y3): enforced - everything in
[The rules](#the-rules-extended-on-this-branch-nothing-published), including that the days
leaving are exactly the days the month document holds, by date. **Not enforced: that their
values are equal.** Measured by writing the drop by hand, around the adapter, on a copy
with the right dates and one wrong value: the rules accept it. The production adapter
refuses the same drop inside its transaction (`month-unconfirmed`, nothing written). The
three people on the allowlist are trusted not to write transactions by hand; the rules are
there for builds and bugs.

### Capacity, for 20 men, with months leaving

`tests/months.capacity.test.mjs`, C1 - the method and assumptions of Phase 3's table,
entries from the shipped writers, the document weighed by Firestore's count; a closure
leaves 14 days after it is settled, a month six months after its last closure.

| 20 men | year 1 | year 2 | year 3 | year 5 | year 10 | grows by then | full, from empty | **full, on top of today's 185 KB** |
|---|---|---|---|---|---|---|---|---|
| nobody closes (no month is ever eligible) | 415 KB | 825 KB | 1,236 KB | 2,056 KB | 4,106 KB | 410 KB a year | 2.5 years | **2.0 years** |
| closed fortnightly, closures leave (Phase 5), days stay | 545 KB | 1,051 KB | 1,558 KB | 2,571 KB | 5,104 KB | 507 KB a year | 2.0 years | **1.6 years** |
| **closed fortnightly, closures AND months leave (Phase 6)** | 366 KB | 503 KB | 640 KB | 948 KB | 1,637 KB | **138 KB a year** | 5.7 years | **4.3 years** |
| closed weekly, closures leave (Phase 5), days stay | 684 KB | 1,290 KB | 1,897 KB | 3,110 KB | 6,142 KB | 606 KB a year | 1.6 years | **1.3 years** |
| **closed weekly, closures AND months leave (Phase 6)** | 505 KB | 742 KB | 979 KB | 1,486 KB | 2,675 KB | **238 KB a year** | 3.1 years | **2.3 years** |

(Phase 5's rows here are heavier than Phase 3's "with the split" rows because they carry
the row as it is actually stored, and the two weeks of closures that have not left yet.)

Read it this way:

- **The days are bounded now**: the live document holds about eight months of them, 211 KB
  for 20 men, at year 1 and at year 10.
- **The document is not.** It hits 1 MiB **4.3 years from today closed fortnightly, 2.3
  years closed weekly** - against 1.6 and 1.3 without this phase.
- **And if nobody closes through the pay book, this phase buys nothing at all**: no month
  is ever eligible, and the days fill the document in two years, as measured at Phase 3.
- **What still grows without bound**, a year, fortnightly (weekly in brackets):

| | grows | held at year 10 |
|---|---|---|
| the index of closures - one row per closure, never folded | 96 KB (196 KB) | 961 KB (1,956 KB) |
| advances and their ledger origin - none ever leaves, repaid or not | 37 KB | 375 KB |
| the month index - a row and the calendar dates of each month | 5 KB | 48 KB |
| an unpaid closure - never leaves, and holds its month with it | not modelled: everybody is paid at the closing here | |
| the roster | nothing while the crew is 20 | 2 KB |

- **Today's 185 KB is counted as a constant**, because by the shipped default none of it
  is eligible (it is from before the tracking day). If the owner rules that the opening
  settles it (decision 55) most of it leaves and each "from today" figure moves towards
  its "from empty" one.
- **The next two things to leave** are therefore named by the table: the rows of the
  closure index older than a horizon (to create-once index pages - the same mechanism a
  third time), and settled advances. Neither is designed in detail; neither is built.

### Hebrew in Phase 6

All **proposed**, in one block (`MONTH_TEXT` in `js/model/months.js`), pinned word for word
in `tests/months.test.mjs`.

| string | where |
|---|---|
| החודש הזה בארכיון | the title of the refusal of an edit |
| החודש הזה נסגר לכל העובדים והועבר לארכיון, ולכן אי אפשר לשנות בו ימים. הרישום לא שונה ודבר לא נשמר. לתיקון שכר של תקופה סגורה רושמים התאמה בחשבון העובד. | the refusal of an edit of an archived day |
| השינוי הזה נרשם במכשיר לפני שנודע לו שהחודש הועבר לארכיון. הוא לא נשלח ולא יישלח. מה שמופיע בארכיון הוא הרישום הקובע. | the row of such an edit in ⋯, above its one button («לקחת מהענן», an existing string) |
| המכשיר עוד לא קיבל מהשרת את הימים של חודש שהועבר לארכיון, ולכן לא עדכן את הרישום. הוא ינסה שוב כשיהיה קליטה. עד אז מוצג הרישום שהיה במכשיר. | the accounts page, while a month document is being fetched |
| העברת חודשים סגורים לארכיון - בדיקה בלבד, דבר לא הועבר | the dry run, first line (no screen draws it yet) |
| גודל הרישום בשרת עכשיו: {now} ק״ב מתוך 1,024. אחרי העברת החודשים המוכנים: {after} ק״ב. | the dry run |
| אין חודש שמוכן להעברה. | the dry run |
| {n} ימים | the dry run, per month |
| בארכיון | a month that has left |
| מוכן להעברה | a month that may leave |
| סגור לכולם; יוכל לעבור החל מ-{date} | a month that is settled and not yet six months old |
| החודש עוד לא הסתיים | the current month |
| יש ימים שעוד לא נסגר עליהם חשבון: {names} | a month somebody has an open day in |
| יש בו ימים מלפני תחילת המעקב, ולא נסגר עליהם חשבון: {names} | a month from before the tracking day |
| יש חשבון סגור שעוד לא הוסדר: {names} | a month with an unsettled closure |
| יש בו יום שאי אפשר לקרוא. הוא נשאר במקומו | a month with an unreadable day |
| החודש גדול מדי למסמך אחד. הוא נשאר במקומו | a month over 900 KB |

### Pinned expectations this phase moved

None was weakened. Two moved, each in the commit that moved it:

- `tests/gate.integrity.test.mjs`: «the shipped flags are the five that were argued over»
  is now SIX - `months` is declared so that it can be declared shut - and a line beside it
  asserts that it ships `false`. What is open in the shipped build did not move.
- Four lists of file names gained the two new files, because each names what this build
  loads that an older one did not: `NOT_IN_V165` in `tests/rima.test.mjs`, and `NEW_HERE`
  in `tests/paybook.oldbuilds.test.mjs`, `tests/paybook.split.emulator.test.mjs` and
  `tests/paybook.archive.emulator.test.mjs`.

**Found, not caused, and not fixed:** `CLAUDE.md`, `docs/architecture.md`,
`docs/releases.md` and `docs/sync-protocol.md` each carry Phase 5's paragraph three times
over (the script that inserted it ran three times). Left as found; it is one edit for
whoever squashes the branch.

### An open risk this phase did not create and could not measure

**Firestore also limits a document to 40,000 index entries**, and by default indexes every
field of every map and every element of every list. The emulator does not enforce it, no
suite here can see it, and nothing in this repository says whether the real project has a
single-field index exemption on `days`, `ledger` or `pay`. A document of worker-days is
mostly small fields, so this limit may bind BEFORE the mebibyte does - and
`monthIndex.dates` adds entries of its own (one list element per archived date, about 365
a year). **The owner or whoever holds the console should look once:** Firestore → Indexes
→ Single field → exemptions. If there is none, add exemptions for `days`, `ledger`,
`pay`, `payIndex`, `monthIndex`, `roster`, `advances` (the app never queries inside the
document; it reads it whole) BEFORE the document grows much further. This is said here
because the capacity tables of Phases 2, 3 and 6 all weigh bytes and none weighs this.

### Decisions for the owner (54 to 63)

| # | the question | recommended default |
|---|---|---|
| 54 | A late correction to a day in an archived month: refused with a sentence (built), or the month brought back? | **Refused.** The wage has the adjustment on the statement. Say plainly to the owner that a Rima count is final six months after the month ends. |
| 55 | Days from before the tracking day are covered by no account and never leave - today's 185 KB. Does the opening settle everything before it? | **Yes, once the owner confirms nothing from before that day is still owed** - one answer, recorded, and `archiveMonths` then passes `beforeOpening`. Until he does, it stays. |
| 56 | The horizon: six months after the later of the month's last closure and its last day. | **Six months**, as he was told. |
| 57 | Does a month move by itself (as a closure does after 14 days) or only when somebody asks? | **Only when asked**, from a screen that shows the dry run first - to be built on «ארכיון סגירות». Automatic later, after it has been watched on real data. |
| 58 | **The phone is full before the server is** (1.4 years against 4.3, closing fortnightly). | **Build the cold store (IndexedDB) before the gate is opened.** This is a blocker of the gate. |
| 59 | The index of closures grows 96 KB a year (196 weekly) and is what fills the document now. | **Index pages**: rows older than a horizon move to create-once documents. Design next; not urgent before 58. |
| 60 | Advances and their ledger origin never leave, repaid or not (37 KB a year). | Leave them. Revisit with 59. |
| 61 | Once one month has left, an older build cannot write at all. | **Accept**, as decision 46: every phone updates before the first month moves. |
| 62 | The server checks WHICH days leave, not that their values equal the copy's; that is the adapter's. | **Accept.** The alternative is a Cloud Function, which this project does not have. |
| 63 | Protocol 2 now means "pay book and months". | **Ship them in one release**, with the rules pasted once. |

## Phase 5 — what leaves the live document, and the screens Phase 4 left (v176)

**Development branch. Not served, not merged, on no phone; no real record was read and no
rules were published. The gate (`paybook`) is still `false` in everything committed.**
Everything below is reachable only with the gate open, which has never happened outside a
test. After this phase the gate still may not be opened; [what is still not
built](#what-is-still-not-built-after-phase-5) says why.

    node tests/paybook.archive.test.mjs             # the move on the fake cloud; restores; the files
    npm run -s test:paybook-archive-emulator        # the rules, the production adapter, three older builds (needs Java)
    npm run -s test:archive-browser                 # the archive, the draft, «לבדיקה», «נסגר» - in Chromium
    node --import ./tests/gate-open.preload.mjs tests/<suite>   # an EXISTING browser suite with the gate open

### The one decision of this phase: a phone's record never has a hole

Phase 3 wrote that dropping the live copy "needs the folds to read the index" and that
teaching every reader of the ledger to do so "is a phase of its own". This phase did NOT
teach them. It made the drop safe without it:

| | holds |
|---|---|
| the server's live document | the open accounts, the days, and `payIndex.rows` - one row per closure whose entries have left it |
| the server's closed documents | those entries, verbatim, create-once (Phase 3) |
| **a phone's own record** | **both, laid together: every entry at the field path it was written at, exactly as before anything left** |

So **no fold in the app reads the index for money** - `closedPeriods`,
`advanceOutstanding`, the judge, `payrollReport`, `accountFor`, `closureHistory` read the
entries they always read, because on a phone the entries are still there. The index is a
manifest used at the boundary, in two functions:

- **on the way in** - `closedGate`, the first lines of `receive()`, the one door every
  server document comes through. For each row the entries it stands for are laid back at
  their paths (`paybookWhole`): from this phone's own record where it holds them, from the
  closed documents where it does not. **A document that cannot be made whole is not
  adopted.** The phone keeps the record it has, leaves «מסונכרן», says so on the accounts
  page, refuses to close or pay (`waiting`), fetches, and tries again on a ladder (1.5 s
  to 60 s) with nobody tapping anything.
- **on the way out** - `closedAware` wraps the three whole-document writes (`save`,
  `create`, the daily cloud copy `archive`) so that they leave out what a row stands for
  (`paybookStripCovered`). A field-path edit is untouched.

**What this buys and what it does not.** It buys: the server's document shrinks, and every
figure on every screen of every phone is the figure it was - asserted as one string over
`accountsList`, `closureHistory`, every `advanceOutstanding`, every `closedPeriods`, every
`advanceCarryInto`, `payrollReport`, and the two maps byte for byte, on the phone that
moved the closure, a phone that watched, a phone with the writer off, a phone that was away
for both the closure and the move, and a phone installed afterwards. It does **not** buy a
smaller copy on the PHONE: a phone's record is as large as it always was. That is decision
43, and it is the largest thing this phase leaves.

### What leaves, and when

`planArchive(schedule, today, { olderThanDays })` - the dry run, and the list the move
works from. It writes nothing. One row per closed period per man:

| state | means |
|---|---|
| `ready` | settled, and may leave now |
| `waiting` | settled, and younger than the horizon asked for |
| `archived` | already out of the live document (its row is in the index) |
| `held` | it stays - `why`: `unanswered` (an older closure nobody answered for), `owed` (not paid in full), `overpaid`, `disputed`, `corrected` (a ledger «תיקון טעות» points at one of its deductions), `irregular` (an entry is not where this build would have written it) |

**Nothing unsettled moves, ever.** A bundle is the frozen payslip, each `deducted` entry,
the statement, its extra deductions, its payments, voids and adjustments - or, for a
closure from before statements, the payslip, its deductions, the owner's answer and any
payment against it.

**The row** is Phase 3's index row (`paybookIndexFrom`) with three differences, all forced:

- `a` is a MAP, `{ advanceId: [amount, balanceAfter] }`, not a list of triples.
  **Firestore refuses a list inside a list** - measured on the emulator
  (`invalid-argument`; the first drop that carried one never landed). The fake cloud now
  refuses one too, so the node suite would catch it.
- `e` - the pay entries that left with it, other than the one the row is named after;
- `d` - the closed documents that hold the bundle, other than the one the row is named
  after (a later payment's, the ledger half of an older closure).

Every field path a row stands for is derived from the row alone (`paybookRowPaths`), and
`planArchive` refuses (`irregular`) any bundle whose paths are not exactly those. A row is
**create-once**: a correction made to a closure after it left - a void, an adjustment, a
later payment - is a new entry in the live document and stays there (decision 52).

A stored row is the derived row plus `e`: 31 bytes more for a closure paid at the closing
(210 against 179 on a nine-day fortnight with no advance; 258 against 226 with two
advances). **The capacity table of Phase 3 was drawn with the derived row and was not
redrawn**: for 20 men closed fortnightly that is about 16 KB a year more than it says,
and 32 KB closed weekly - which moves no conclusion in it.

### The move: copy, read back, compare, and only then drop

`FarkadSync.archiveClosed({ today, olderThanDays, limit, only })` in `js/sync/closed.js`,
one bundle at a time. **Nothing about a move in progress is written on the phone**: each
step begins by reading the server's document and the closed documents, and does the next
thing they call for. That is what makes it idempotent and resumable - a reload, a lost
answer and a second phone doing the same move all end in the same place.

1. Read the live document. The row is there and the entries are gone: done.
2. Every path of the bundle must be in the live document **with this phone's bytes**
   (`differs` otherwise - somebody knows something this phone does not).
3. Read the closed documents the bundle can be in. One that holds another figure for an
   entry: `copy-differs`, and the closure stays for good - a closed document is
   create-once and the live copy is then the only true one.
4. **THE COPY**, only if some entry is in no closed document (every closure from before
   the server-first door): one create-once document, in a commit that moves the revision
   and changes no business field. Then back to step 1.
5. **THE DROP**: the entries leave and the row arrives, in one commit
   (`adapter.archiveClosed`). Then back to step 1, which is how a success is confirmed -
   by reading, at a revision at least that new.

**Never before server confirmation - checked in three places.** The client compares what
it read (step 3). The adapter compares again INSIDE the drop's own transaction, against
the closed documents and the schedule that transaction read (`closed-unconfirmed`, nothing
written) - measured on the emulator by asking the production adapter to drop on the
strength of a document that does not hold the entries, of one that does not exist, and of
none. And the rules refuse a drop that names no existing closed document.

Refused, with nothing attempted: `gate`, `busy`, `waiting`, `unsupported`, and everything
`payTransactRefusal` refuses a closure for (`offline`, `unsent-work`, `pending`,
`restoring`).

**By itself:** after any closure, payment or correction goes through, the closures settled
at least `PAYBOOK_ARCHIVE_AFTER_DAYS` (14) days ago are moved, three at a time, refused
quietly if anything is in the way (`archiveDue`). Fourteen days so that a phone seldom
meets a closure it never held. By hand, any settled closure, from «ארכיון סגירות».

Two things the emulator found that the fake cloud could not, both fixed and both now
modelled in the fake: the nested list above; and **a read can be a moment behind the
commit it follows** (the lesson of Phase 3 again) - the read straight after a drop that
had committed handed back the revision before it, the move concluded it had not landed and
reported «busy» about a closure that was already out. A look that follows a write this
phone knows of now waits for a document at least that new.

### The rules, as they now stand on this branch

Added to `firestore.rules`; **nothing was published**. `docs/firestore.rules.before-paybook`
is still the rollback artifact.

- **The index only grows.** No row removed, none changed, by anybody (`indexGuard`).
- **A row arrives one at a time**, in a write that names it (`archivedId`), speaks
  protocol 2, and whose closed document of that name **already exists** (`archivesOne`).
- **A pay entry may leave** in such a write and in no other; that write adds none and
  changes none (`payOnlyLeaves`).
- **A project may not begin with an index** (`indexGuardOnCreate`).
- **Once there is an index, a writer that does not speak protocol 2 may not write at
  all** (`indexedNeedsPaybook`) - new, and it changes a cell of Phase 3's rollout table:
  decision 46.

Not server-enforced, said plainly: that the entries leaving are the ones the closed
documents hold. The rules cannot loop. That is the adapter's, inside the transaction.

Measured in `tests/paybook.archive.emulator.test.mjs`, by hand-written transactions:
refused - a drop naming no row; naming a closed document that does not exist; from
protocol 1; two rows at once; pay entries leaving with no row; a drop that also adds or
changes a pay entry; a stranger; removing a row; changing a row; another entry leaving
under a row that is already there; a whole document with no index; one that puts the
entries back; a protocol-1 day once an index exists; a project created with an index.
Accepted - the drop; a protocol-2 day after it; a whole document carrying the index and
the pay book as they are (a restore from this build); the next closure.

**The rollout order gains nothing new** - the rules to publish at its step 2 are these.
If Phase 3's rules were what had been published, a drop would be refused whole (a pay
entry removed) and nothing would be lost; they were never published.

### Older builds, once anything has moved

v167, v171 and v172, out of Git, on the emulator under these rules:

| | measured |
|---|---|
| installed after the move (a copy that never held the closure) | **reads that account as never closed** - which is why the next line exists |
| it records a day | **refused**: the day does not reach the server, the revision does not move, the phone does not say synced; the day stays on that phone |
| its whole-document restore | **refused**: the rows, the pay book and the revision exactly where they were; the closed document untouched |
| this build beside it | goes on recording |

A build that had been syncing all along still holds the ledger half of the closure (the
ledger is merged by union) and computes as before - but the rules cannot tell the two
apart. THE ROLLOUT RULE already says every phone updates before the first pay entry.

### A restore never erases a closure

Proven in `tests/paybook.archive.test.mjs` (R9) on a fake cloud that refuses what the
rules refuse of a whole-document write, and against the real rules on the emulator:

| the restore | what happens |
|---|---|
| a file from before any closure | accepted; the index, the live pay book and every closed document exactly as they were; both phones still hold every closure and pay from the same figures; the work record IS replaced, as asked |
| a file from before the move | the same |
| a file from after the move | the same |
| from a phone installed after the move, of a file that never held a closure | the same (also on the emulator) |
| the document it sends | carries the rows and none of the entries they stand for |
| a whole document from a build that does not know `pay` | **refused** (fake cloud; and v167, v171, v172 on the emulator) |
| a whole document that takes a row away | **refused** |

How: `layPaybookUnion` - the one function `receive()`, `prepareReplace` and
`absorbCloudLedger` already call - now unions the index too (rows only arrive); the
restore's "did the cloud gain anything" comparison and `localDurableHolds` include the
index; and the write is stripped by `closedAware`.

### The files

A phone's record is whole, and the backup file is the phone's record - so **the backup
and the rescue file carry every entry of every closure, archived or not**, by
construction. What they do not carry is said **in the file** and **on the screen**, and
only on a phone that has an archived closure (with none, the backup file is byte for byte
`JSON.stringify(schedule)` as before - asserted):

- in the file: `aboutClosedAccounts` - how many closures are archived on the server, how
  many of their entries the file carries (and how many it lacks: 0), `closedDocumentsCarried:
  false`, and a note in plain words. `normaliseSchedule` does not read that name: a file
  read back is the record, without the note.
- on the screen, added to the confirmation of both exports (proposed wording):
  «הקובץ כולל את כל סגירות החשבון והתשלומים שבמכשיר הזה, גם אלה שכבר הועברו לארכיון בשרת. מסמכי הארכיון עצמם נשארים בשרת ואינם בקובץ: שחזור לאותו חשבון לא מוחק דבר, אבל שחזור לחשבון חדש וריק לא יחזיר את סגירות החשבון לשרת.»
- the daily cloud copy (`history/{day}`) is the live document's shape - the rows, not the
  entries - so it is no larger than the document it copies.
- the rescue's comparison of two captures knows each row as a fact (`payIndex:<id>`).

**NOT built, and stated in both places: a restore into a NEW, EMPTY project does not put
the pay book on that server.** The rules refuse a pay entry that arrives without its
closed document and a project that begins with an index. Measured: nothing is created
there, the phone does not say synced, and it still holds everything. Building it means
replaying every closure as its own transaction (decision 47).

### The screens

All in `js/ui/accounts.js`, drawn inside the «מקדמות» tab's page as the others are; styles
at the end of `css/design.css`, inside `@media screen`. One more guarded line in
`js/ui/reports.js` (its fifth hook).

| screen | what it is |
|---|---|
| «ארכיון סגירות» | A link on the accounts list, shown once a closure may move or has moved, with how many are ready. The page IS the dry run: one paragraph saying what moving is and that nothing is deleted; the size of the server's record now, out of 1,024 KB, and after; the closures ready, by name and period; the ones that stay, each with its reason; the ones already archived. One filled button, «העבר לארכיון», which can be pressed again after any interruption. Reading the page writes nothing (measured). |
| a phone that lacks the detail | One sentence at the top of every accounts screen while the phone is waiting, and it goes by itself when the phone has adopted. A closure or payment from that phone is refused in the same sentence. |
| «לבדיקה» → «מה לבדוק?» | A man who reads «לבדיקה» has a button on his row. The page shows both bodies of a disagreement - the one that is counted («נספר - מה שהשרת מחזיק») and the one kept beside it - with kind, amount, date and device; each entry the fold holds out; what was paid beyond what was owed. **It settles nothing and says so**; its only button is the way back. |
| a draft | What is typed into a review is kept in one Store key (`farkadPayDraft`) after the first key or tap - opening a page still writes nothing. After a reload the list offers «המשך סגירה שהתחלת: <name>», and the review opens with what was typed and says it was put back. It is put back only for the same man, the same period, on the same day, into an account that still reads exactly as it did (a mark of the wage, the open advances and what is left on each, and what he is already owed); otherwise it is removed without a word. A closure that goes through takes its draft with it. Never the record, the cloud, a backup or the rescue file. |
| «נסגר» on «לפי עובד» | In the «פירוט שבועי» fold of that report, a week of a weekly man that is whole and closed carries the mark «נסגר» - the owner's word, the model's label - beside its dates. The figures are untouched. That fold has never been printed (`@media print` hides it), so the mark is on the screen only. The report's main rows are per range and are not marked (decision 51). |

Two pinned expectations moved, in the commits that moved them, each with its reason
beside the check: «nothing is kept in storage» became «ONE thing is kept in storage - the
draft - under one key of its own» (`tests/accounts.test.mjs`); «all of that typing wrote
nothing» became «…nothing of the record and nothing to the cloud» plus «it wrote the
draft» (`tests/accounts.browser.mjs`). And `js/ui/reports.js` "without its four hooks is
main's file" is now five hooks.

### The existing suites with the gate open

Run through `tests/gate-open.preload.mjs`, which gives every page any suite opens the test
seam with `paybook: true` before the app's scripts load, without changing the suite or a
shipped byte.

The eight browser suites that open the «מקדמות» tab, an advance form or the worker-days
dialog: the seven Phase 4 named, and `print`. No count is written here - a count belongs
to a commit; run them on the commit you are asking about.

| suite | with the gate open | why |
|---|---|---|
| `simple-advances.browser.mjs` | **ABORTS at its third step** (a locator times out) | **By design.** It taps a man's card on the «מקדמות» tab; with the gate open that tab is the accounts home and has no such card. Read, not run, the rest of it: its first section (the card, a repayment, «תיקון טעות») reaches one man's advances page through the tab's old list; its second («קיזוז מהשכר», a typed deduction, «סגירת חשבון התקופה») IS the old closure dialog, which decision 29 replaces with the review page; its fourth measures the layout of the old list. Its third (the worker picker of the reports and the files) does not touch either and would pass. All three that fail are the gate's own design; the suite is rewritten in the commit that opens the gate. |
| `forms.browser.mjs` | passes whole | It drives the advance and correction FORMS, which are the existing ones on one man's advances page - unchanged with the gate open. |
| `reports.browser.mjs` | passes whole | It opens the worker-days dialog and reads it; it does not close an account through it. |
| `navigation.browser.mjs` | passes whole | It taps the «מקדמות» tab and asks that the tab is current and its page is up - true of the accounts home too. |
| `design.browser.mjs` | passes whole | Does not depend on what the tab holds. |
| `mobile.test.mjs` | passes whole | The same. |
| `smoke.mjs` | passes whole | It counts the five tabs and their labels - unchanged, the label included. |
| `print.test.mjs` | passes whole | Everything it reads off the paper and the PDF is unchanged. **Not asked by it, and not checked here:** whether the one button the dialog's closure block becomes with the gate open appears on a printed worker-days page. |

So Phase 4's prediction - that all seven would have expectations to move - was wrong for
six of them: **one suite moves** when the gate opens, and it moves because the thing it
tests is the thing the gate replaces.

**One real defect was found by this run, and fixed.** Following `simple-advances` by hand
past the point where it stops: before the tracking day is chosen the accounts home is one
screen, and its «מקדמות» button opened the advances page of the FIRST man on the roster -
whose «חזרה לכל העובדים» leads back to that same screen. So until somebody chose the day,
an advance could be given or handed back for one man only. The button now opens the
roster, a name a button, each to that man's own page (`tests/archive.browser.mjs`, first
section).

**Not run with the gate open:** every other browser suite (they do not open the tab, a
form of it or the dialog), and the node suites - whose eight expectations the one-debt
ruling moves were measured at Phase 3 and are unchanged.

### What is still NOT built after Phase 5

1. **A phone's copy does not shrink.** Folds that read the index instead of the entries
   are not built (decision 43). The limit that remains on a phone is its own storage -
   one copy of the record plus up to seven more in restore points and the way back,
   the same limit Phase 2 measured.
2. **The server's document is still not bounded.** What Phase 3 measured stands: with
   closures leaving, the days are the larger half and fill it in about a year and a half
   for 20 men; the index is one row per closure and is not folded into a checkpoint. The
   capacity table was not redrawn.
3. **An unpaid closure never leaves.** Only what is settled moves, so a man who is owed
   for months keeps his closures in the live document for months.
4. **Settling a disagreement.** «לבדיקה» shows one; choosing between two bodies is a new
   linked record kind and a change to the model (decision 49).
5. **A restore into a new, empty project** does not carry the pay book (decision 47).
6. **A phone installed afresh re-reads every closed document its index names** - one read
   per document - and holds them only in memory until it has adopted; a reload in the
   middle starts again.
7. **The partial void** (skipped on instruction), and Phase 4's items 3, 4, 6 and 9: the
   wording of «late since close», a date for the payment made at the closing, reversing
   an advance deduction from the statement, the stale «שולח» line.
8. **The commit that opens the gate**, with the expectations it moves - the eight in
   `repayment`, `ledger.truth` and `paycycle.completion`, and the browser expectations in
   the table above. Nothing here opens it.
9. **A real phone, and the owner's real record.** `planArchive`, `planDebtRuling`,
   `planPayMigration` and `planHistoryMove` have been read on synthetic records only.

### Hebrew in Phase 5

All **proposed**. Forty strings in `ACC_TEXT` (the four groups at the end of the table in
[Hebrew in Phase 4](#hebrew-in-phase-4): the draft, «לבדיקה», the archive, a phone that
lacks the detail), pinned word for word in `tests/accounts.test.mjs`; and one in
`js/ui/backup.js`, pinned in `tests/paybook.archive.test.mjs`:

| string | where |
|---|---|
| הקובץ כולל את כל סגירות החשבון והתשלומים שבמכשיר הזה, גם אלה שכבר הועברו לארכיון בשרת. מסמכי הארכיון עצמם נשארים בשרת ואינם בקובץ: שחזור לאותו חשבון לא מוחק דבר, אבל שחזור לחשבון חדש וריק לא יחזיר את סגירות החשבון לשרת. | the confirmation of the backup and of the rescue file, on a phone with an archived closure |

«נסגר» on the weekly breakdown is not a new string: it is `PAYBOOK_STATUS_LABELS.closed`.

## Phase 4 — the screens (v176)

**Development branch. Not served, not merged, on no phone; no real record was read. The
gate (`paybook`) is still `false` in everything committed, and with it shut the app is
v174's: no new entry point, no new sentence, no moved pixel.** The gate has never been
open outside a test. Everything in [What is NOT built](#what-is-not-built-and-why-the-gate-stays-shut)
still stands, so after this phase the gate still may not be opened.

    node tests/accounts.test.mjs          # every word pinned, every refusal a sentence, the gate shut
    npm run -s test:accounts-browser      # the owner's examples through the screens (Chromium, a played cloud)

### What was built

One file, `js/ui/accounts.js`, its styles at the end of `css/design.css` (inside
`@media screen`, every class `acc-…`), and four guarded lines in `js/ui/reports.js`. The
screens draw INSIDE the «מקדמות» tab's own page (`#advancesView`) — not a new fixed layer —
so the tab bar, the top strip, the keyboard and the stuck-frame rules are the ones every
tab already has, and paper never sees them.

| # | screen | what it is |
|---|---|---|
| 1 | entry | With the gate open the «מקדמות» tab is the accounts home. **The tab's label is unchanged** («מקדמות») and the tab bar has its five tabs. One man's advances page is the existing one, unchanged, reached from his row («מקדמות»), and is still how an advance is given or handed back. |
| 2 | the list | `accountsList`: a card a man — name, «עובד שבועי» / «עובד דו-שבועי», the status, his OPEN period's wage as the one big number with its dates, and only when non-zero two separate small figures: «יתרת שכר לתשלום» (green) and «חוב מקדמות» (amber). An earlier unclosed period is a quiet «ממתין לסגירה» line of its own, never summed. Filter (הכול / שבועי / דו־שבועי), search by name. Top: «סגירת חשבונות עובדים» (the one filled button), «סגירת חשבון דו-שבועי», and the «היסטוריית סגירות חשבון» link. |
| 3 | the review page | «סגירת חשבון ואיפוס» on his row. Period, days, regular / double / extra hours, sites, the day list folded; the wage; «יתרת שכר לתשלום» from earlier closures apart; each open advance a row (date, given, left) with its own field pre-filled by `paybookSuggestAllocations`, «הכול» and «0» one tap each, and a live «יישאר אחרי הסגירה»; extra deductions (amount, category, reason); the net; paid — «שולם הכול» / «שולם חלקית» / «עוד לא שולם» — and how; the balance after. One filled button: «אישור סגירה». |
| 4 | later payment | «תשלום בפועל» on his row or on a closure's statement: amount (the whole balance offered), date, method. The payment's id is minted when the form opens. |
| 5 | the group walk | «סגירת חשבונות עובדים» / «סגירת חשבון דו-שבועי»: every waiting account in scope with its status and «3 מתוך 8 · נשארו 5»; «התחל» / «המשך» walks them one by one (confirm → next, «דלג» → next, the skipped ones come back last); tick several and «הכן סגירה לנבחרים» shows a summary — wage, advances, net, paid per man and the four column totals — before anything is written; then one transaction per man, a result on each row, and «נסה שוב לנכשלים», which never repeats the ones done. |
| 6 | history | «היסטוריית סגירות חשבון», `closureHistory`: search by name, cycle, payment status, closure dates, work-period dates. A record opens its statement: the frozen wage and day list, each advance deducted with what remained then and what is left today, extras, payments, corrections under what they correct. «תשלום בפועל» when still owed; «תיקון לסגירה» and «ביטול רישום» with a mandatory reason, each a NEW linked entry. |
| 7 | first run | Until an `opening` exists the tab shows one sentence, the day (default: the first day of the fortnight containing today) and «התחל מעקב». Older closures with no payment record are «סגירות ישנות לבדיקה (N)» on the list: «שולם» / «נשאר חוב» (+ a sum) / «לא ידוע» each, answerable any time, never in the way. |
| 8 | the old dialog | With the gate open `openWorkerSettlement`, «קיזוז מהשכר» and the closure block of the worker-days dialog all lead to the review page (decision 29's default): one way to close. With the gate shut they are untouched. |

**Taps, the common case** — close one biweekly worker with two advances, paid in full:
**three.** «סגירת חשבון ואיפוס» on his row → (both advances are already answered by the
suggestion) «שולם הכול» → «אישור סגירה». Changing one advance's amount is typing it;
"deduct nothing from this one" is one more tap («0»). No dialog asks "are you sure": the
review page IS the confirmation, and a closure is corrected by a linked record, not undone.

### The rules the screens keep

- **No money is computed in the screen.** Every figure is a field of a plan or a fold.
  The review page asks `planClosure` again on every change (180 ms after the last key);
  «שולם הכול» is the plan's own `netDue`; the summary's column totals are the model's
  `paybookSum`. The suite reads the source for arithmetic on a money field and finds none.
- **One door.** `FarkadSync.transactPaybook(plan)` and nothing else writes a pay entry.
  The one ordinary commit in the file is the carry approval, by the ledger's own writer.
- **Opening a page writes nothing** — measured: the disk and the cloud's write log are
  what they were.
- **A refusal is a sentence beside the field that caused it.** A blank advance field is
  `allocation-missing` on that row (after the first attempt to confirm — not while
  typing); over an advance, over the wage and over the net are said at once, on the row,
  under the net and beside the paid field. A refusal about the account itself (too early,
  already closed, no rate) is a line at the top of the page. No control is ever disabled
  for a reason the page does not say.
- **The server's answers, as built:**

| answer | the person sees |
|---|---|
| `closed` / `done` | back to the list (or the next man), his row updated, one calm line |
| `refused: offline` | «אין חיבור לשרת. סגירת חשבון ותשלום נרשמים רק כשיש חיבור. לא נרשם דבר.» — the page stays, the entries stay, nothing is written or queued (measured: every key on the disk byte for byte, no attempt on the cloud) |
| `refused: unsent-work` / `busy` / `pending` / `restoring` / `unsupported` / `storage` / `server` | each its own sentence (the table below) |
| `stale` | «החשבון השתנה בזמן האישור…»; the page is re-planned from the record the phone has just adopted, with what was typed kept — a new advance appears as an unanswered row. If the account was closed by another phone: «החשבון כבר נסגר בטלפון אחר…» and the numbers it was closed on |
| `unknown` | «הרישום נשלח, ועדיין לא ידוע אם השרת קיבל אותו. אל תרשום שוב…» on the page and at the top of every accounts screen; the screens ask the sync layer to look again every three seconds, and when it is settled say which way («…התקבל בשרת» / «…לא התקבל…») until «הבנתי» |

- **The carry approval** (`carry-approval-needed`) is one sentence and «אשר את המעבר»,
  right above the button that needed it — on the review page or on the activation screen.
  Measured on a record nobody approved: with the gate open the ruling makes the carry
  needed at once, so the FIRST thing a person meets is that question, on the activation
  screen. That is decision 28 answering itself: the approval and the opening day are one
  step in practice.
- **The order of the list** is the one decision in it that is this file's: (0) «לבדיקה»,
  (1) a period that has ENDED and is not closed, (2) wage still owed from a closure,
  (3) the open period still running, (4) only an advance debt, (5) settled, (6) nothing.
  Inside a rank the roster's order stands. The existing «סידור» of the advances page is
  not reachable while the gate is open.
- **Geometry**, measured at 440×956 and 375×667, dark and light: every target 44px in both
  dimensions, every field 16px or more with `inputmode="decimal"` on amounts, no sideways
  scroll, exactly one filled button on a screen that has a primary action, and at 200%
  text no amount, name or status clipped. No bar height and no inset is written in the
  styles; nothing is `position: fixed`.

### One addition to the model

`paybookSuggestAllocations(review)` in `js/model/payroll.js`: what the review page
pre-fills — all of each advance, oldest first, for as long as the wage (and the account
walk's `walkRoom`) allows, and an explicit 0 for the rest. Pure, in agorot, reads only
`planClosure`'s own review, writes nothing. It is in the model so that the screen does not
subtract. Pinned in `tests/accounts.test.mjs`. No other file under `js/model/` or
`js/sync/` changed, and `firestore.rules` was not touched.

### What is NOT built in Phase 4

1. **«נסגר» on the «לפי עובד» report** for closed weeks (the owner's answer of
   2026-11-10). *Built at Phase 5, on the weekly breakdown - see above.*
2. **A screen to settle a pay-book disagreement** (`payConflicted`). Such a man reads
   «לבדיקה», his planners refuse with `conflict` and its sentence, and nothing lets a
   person choose. *Phase 5 built the page that SHOWS it; settling is still not built.*
3. **The wording of «late since close»** on a closed row under the ruling (decision 26).
4. **A date for the payment made AT the closing.** It is dated today; a different day is a
   later payment.
5. **A partial void.** «ביטול רישום» voids the whole payment or extra deduction; the
   model's `amount` option is not offered.
6. **An advance deduction is not reversed from the statement.** That is the ledger's
   existing «תיקון טעות», on the man's advances page.
7. **Drafts.** What is typed into a review is in memory only; a reload loses it, on
   purpose — a draft of a closure offered a week later would be against another account.
   *Built at Phase 5, with that objection answered: a draft is put back only against the
   account it was typed against, on the day it was typed.*
8. **The absent detail is not fetched into a backup**, and the «detail not on this phone»
   sentence can only be produced in a test today, because nothing has left the live
   document (Phase 3, item 1). *At Phase 5 closures do leave it - and a phone's own record
   keeps every entry, so a backup is whole and that sentence still cannot arise outside a
   test: a phone that lacks the detail does not adopt the document at all.*
9. **The stale «שולח» status line** after a batch settled against the server's copy
   (pre-existing, `js/sync/send.js`).

### What Phase 5 (activation on real data) must do

Unchanged in substance from Phase 3's list, with what this phase learned:

1. Build Phase 3's [What is NOT built](#what-is-not-built-and-why-the-gate-stays-shut),
   items 1–5 (the folds reading the index, dropping the live copy, the index's own bound,
   the days leaving, backups carrying closed documents) and re-measure Capacity.
2. The owner reads `planDebtRuling`, `planPayMigration` and `planHistoryMove` on his real
   record.
3. The rollout order: save the published rules, publish the new ones, update every phone,
   check each in ⋯.
4. One commit: `paybook: true`, with the eight expectations the ruling moves
   (`repayment`, `ledger.truth`, `paycycle.completion`) — and, new, **every browser suite
   that opens the «מקדמות» tab or the old closure dialog** (`simple-advances-browser`,
   `forms`, `reports-browser`, `navigation-browser`, `mobile`, `design-browser`, `smoke`):
   with the gate open that tab is the accounts home and the old dialog is a door to the
   review page, so their expectations move in that commit, deliberately.
5. On each phone, the first open of the tab: the carry approval (if the record needs it),
   the opening day, then «סגירות ישנות לבדיקה».
6. Moving existing history, settled bundles only, copy → read back → compare → drop.
7. **A real phone.** Nothing here has been on one: the keyboard over the review page, the
   date control in the iPhone's locale, a slow signal between the tap and the answer.

### Hebrew in Phase 4

**Verbatim (the owner's):** in `ACC_OWNER` and, for the five statuses, the model's
`PAYBOOK_STATUS_LABELS`. **Everything else is proposed**, in `ACC_TEXT` and
`ACC_REFUSALS` at the top of `js/ui/accounts.js`, pinned word for word in
`tests/accounts.test.mjs`, and listed here. The suite fails if a string in the file is
missing from this table.

**The tab's label is not changed.** «מקדמות» stays on the tab bar while the page under it
is «חשבונות עובדים» — a proposed title. If the owner wants the tab renamed, that is one
string in `index.html` and a pinned expectation in several suites; it was not done here.

#### The owner's labels, verbatim

| string | where |
|---|---|
| סגירת חשבון ואיפוס | the per-worker close button on his row |
| יתרת שכר לתשלום | list figure, review, payment, statement |
| סגירת חשבונות עובדים | list, the filled button; title of the walk |
| סגירת חשבון דו-שבועי | list, second button; title of the walk |
| היסטוריית סגירות חשבון | the history link and its title |
| סגירת חשבון | title of the review page and of a statement |
| תשלום בפועל | the payment button and its title |
| עובד שבועי | cycle mark |
| עובד דו-שבועי | cycle mark |
| שולם חלקית | status; the middle "paid" choice on the review page |
| ממתין לסגירה | status `waiting`; the earlier-period line; a waiting item of the walk (model: `PAYBOOK_STATUS_LABELS`) |
| נסגר | status `closed`; a finished item of the walk (model: `PAYBOOK_STATUS_LABELS`) |
| שולם | status `paid` (model: `PAYBOOK_STATUS_LABELS`) |
| יתרה פתוחה | status `open` (model: `PAYBOOK_STATUS_LABELS`) |

#### Proposed: the screens (237)

Existing words reused as they are: «מקדמות», «חיפוש עובד», «לא נמצא עובד.», «מזומן», «העברה», «הבנתי», «כבוי», «אשר את המעבר», «אין מקדמות פתוחות לעובד הזה.» and the filter's «שבועי» / «דו־שבועי».

| key | string | where |
|---|---|---|
| `title` | חשבונות עובדים | the list |
| `back` | חזרה | the list |
| `backToList` | חזרה לרשימה | the list |
| `understood` | הבנתי | the list |
| `filterAll` | הכול | the list |
| `filterWeekly` | שבועי | the list |
| `filterBiweekly` | דו־שבועי | the list |
| `search` | חיפוש עובד | the list |
| `notFound` | לא נמצא עובד. | the list |
| `advances` | מקדמות | the list |
| `debt` | חוב מקדמות | the list |
| `credit` | יתרת זכות | the list and the review page (Phase 8, decision 67: v180's own word) |
| `statusReview` | לבדיקה | the list |
| `statusNone` | אין חשבון פתוח | the list |
| `statusUnknown` | לא ידוע אם שולם | the list |
| `inactiveMark` | כבוי | the list |
| `unpriced` | חסר תעריף - אי אפשר לחשב שכר | the list |
| `workDays` | ימי עבודה | the review page |
| `regularDays` | ימים רגילים | the review page |
| `doubleDays` | ימים כפולים | the review page |
| `extraHours` | שעות נוספות | the review page |
| `absentDays` | ימי היעדרות | the review page |
| `dayList` | פירוט הימים | the review page |
| `absent` | נעדר | the review page |
| `gross` | שכר התקופה | the review page |
| `wageDueBefore` | מסגירות קודמות. לא נכלל בסגירה הזאת. | the review page |
| `advancesTitle` | מקדמות לקיזוז | the review page |
| `advanceGiven` | ניתנה | the review page |
| `advanceLeft` | נשאר | the review page |
| `advanceField` | כמה לקזז מהמקדמה הזאת? | the review page |
| `all` | הכול | the review page |
| `zero` | 0 | the review page |
| `leftAfter` | יישאר אחרי הסגירה | the review page |
| `noAdvances` | אין מקדמות פתוחות לעובד הזה. | the review page |
| `laterAdvance` | מקדמה מאוחרת - תקוזז מהתקופה הבאה | the review page |
| `extrasTitle` | ניכויים נוספים | the review page |
| `addExtra` | + ניכוי נוסף | the review page |
| `extraAmount` | סכום הניכוי | the review page |
| `extraCategory` | סוג הניכוי | the review page |
| `extraReason` | סיבת הניכוי | the review page |
| `removeExtra` | הסר ניכוי | the review page |
| `categoryAgreed` | ניכוי מוסכם | the review page |
| `categorySettlement` | הסדר | the review page |
| `categoryOther` | אחר | the review page |
| `advanceDeducted` | קיזוז מקדמות | the review page |
| `netDue` | נטו לתשלום | the review page |
| `paidTitle` | שולם בפועל | the review page |
| `paidFull` | שולם הכול | the review page |
| `paidNone` | עוד לא שולם | the review page |
| `paidAmount` | כמה שולם? | the review page |
| `methodTitle` | איך שולם? | the review page |
| `methodCash` | מזומן | the review page |
| `methodTransfer` | העברה | the review page |
| `balanceAfter` | יתרה אחרי הסגירה | the review page |
| `debtAfter` | חוב מקדמות אחרי הסגירה | the review page |
| `confirm` | אישור סגירה | the review page |
| `busy` | רושם בשרת… | the review page |
| `closedDone` | החשבון נסגר ונרשם. | the review page |
| `fixFirst` | יש שדה שצריך לתקן. הוא מסומן למעלה. | the review page |
| `carryButton` | אשר את המעבר | the review page |
| `carryDone` | המעבר אושר. אפשר להמשיך. | the review page |
| `carryFailed` | האישור לא נשמר. נסה שוב. | the review page |
| `freshClosed` | כך נסגר החשבון: | the review page |
| `offline` | אין חיבור לשרת. סגירת חשבון ותשלום נרשמים רק כשיש חיבור. לא נרשם דבר. | the server's answers |
| `unsentWork` | יש במכשיר הזה רישומים שעוד לא נשלחו לשרת. חכה שיישלחו ונסה שוב. לא נרשם דבר. | the server's answers |
| `busyElsewhere` | פעולה אחרת עדיין נרשמת. חכה רגע. | the server's answers |
| `pending` | פעולה קודמת עדיין לא אושרה מהשרת. אי אפשר לרשום עוד עד שיתברר מה קרה איתה. | the server's answers |
| `restoring` | שחזור נתונים עוד לא הסתיים. נסה שוב אחריו. לא נרשם דבר. | the server's answers |
| `unsupported` | הגרסה במכשיר הזה לא יכולה לרשום סגירת חשבון. עדכן את האפליקציה. | the server's answers |
| `nothingToWrite` | אין מה לרשום. בדוק את הסכומים. | the server's answers |
| `storage` | אין מקום לשמור במכשיר. לא נרשם דבר. | the server's answers |
| `server` | השרת לא קיבל את הרישום. לא נרשם דבר. נסה שוב. | the server's answers |
| `stale` | החשבון השתנה בזמן האישור. לא נשמר דבר. בדוק את הסכומים ואשר שוב. | the server's answers |
| `staleClosed` | החשבון כבר נסגר בטלפון אחר. לא נרשם דבר נוסף. | the server's answers |
| `unknown` | הרישום נשלח, ועדיין לא ידוע אם השרת קיבל אותו. אל תרשום שוב - הבדיקה תיעשה מעצמה כשיהיה חיבור. | the server's answers |
| `outcomeCommitted` | הרישום שהיה בבדיקה התקבל בשרת. | the server's answers |
| `outcomeNothing` | הרישום שהיה בבדיקה לא התקבל. לא נרשם דבר - אפשר לרשום שוב. | the server's answers |
| `payFor` | עבור התקופה | later payment |
| `payOwed` | נשאר לתשלום | later payment |
| `payAmount` | סכום התשלום | later payment |
| `payDate` | תאריך התשלום | later payment |
| `paySave` | רשום תשלום | later payment |
| `payDone` | התשלום נרשם. | later payment |
| `payAlready` | כבר נרשם | later payment |
| `payNothing` | אין יתרת שכר לתשלום לעובד הזה. | later payment |
| `groupStart` | התחל | the group walk and its summary |
| `groupResume` | המשך | the group walk and its summary |
| `groupOf` | מתוך | the group walk and its summary |
| `groupLeft` | נשארו | the group walk and its summary |
| `skip` | דלג | the group walk and its summary |
| `skipped` | דולג | the group walk and its summary |
| `notClosed` | לא נסגר | the group walk and its summary |
| `notEnded` | התקופה מסתיימת ב־ | the group walk and its summary |
| `prepare` | הכן סגירה לנבחרים | the group walk and its summary |
| `select` | בחירה | the group walk and its summary |
| `needSelection` | בחר עובדים קודם: סמן את התיבה ליד כל עובד. | the group walk and its summary |
| `groupEmpty` | אין חשבונות שממתינים לסגירה. | the group walk and its summary |
| `groupAllDone` | כל החשבונות שאפשר לסגור נסגרו. | the group walk and its summary |
| `summaryTitle` | סיכום לפני אישור | the group walk and its summary |
| `colWage` | שכר | the group walk and its summary |
| `colAdvances` | מקדמות | the group walk and its summary |
| `colNet` | נטו | the group walk and its summary |
| `colPaid` | שולם | the group walk and its summary |
| `total` | סה״כ | the group walk and its summary |
| `batchUnpaid` | התשלום לא נרשם: כל החשבונות ייסגרו כ״עוד לא שולם״. אפשר לרשום תשלום אחר כך. | the group walk and its summary |
| `batchPaid` | כל החשבונות יירשמו כ״שולם הכול״ במזומן. | the group walk and its summary |
| `batchConfirm` | אישור סגירה לכל הרשימה | the group walk and its summary |
| `batchRunning` | סוגר | the group walk and its summary |
| `batchNone` | אין ברשימה חשבון שאפשר לסגור. | the group walk and its summary |
| `retry` | נסה שוב לנכשלים | the group walk and its summary |
| `openRow` | פתח ועדכן | the group walk and its summary |
| `historySearch` | חיפוש לפי שם | history, the statement, corrections |
| `statusAll` | כל המצבים | history, the statement, corrections |
| `statusFilter` | מצב התשלום | history, the statement, corrections |
| `dateFilters` | סינון לפי תאריכים | history, the statement, corrections |
| `closedFrom` | נסגר מתאריך | history, the statement, corrections |
| `closedTo` | נסגר עד תאריך | history, the statement, corrections |
| `periodFrom` | תקופת עבודה מתאריך | history, the statement, corrections |
| `periodTo` | תקופת עבודה עד תאריך | history, the statement, corrections |
| `historyEmpty` | לא נמצאו סגירות. | history, the statement, corrections |
| `closedOn` | נסגר ב־ | history, the statement, corrections |
| `deducted` | קוזז | history, the statement, corrections |
| `leftThen` | נשאר במקדמה אחרי הסגירה | history, the statement, corrections |
| `leftNow` | נשאר היום | history, the statement, corrections |
| `payments` | תשלומים | history, the statement, corrections |
| `noPayments` | לא נרשם תשלום. | history, the statement, corrections |
| `corrections` | תיקונים | history, the statement, corrections |
| `voided` | בוטל | history, the statement, corrections |
| `voidAction` | ביטול רישום | history, the statement, corrections |
| `voidReason` | סיבת הביטול | history, the statement, corrections |
| `adjustAction` | תיקון לסגירה | history, the statement, corrections |
| `adjustAdd` | להוסיף לעובד | history, the statement, corrections |
| `adjustSub` | להפחית | history, the statement, corrections |
| `adjustAmount` | סכום התיקון | history, the statement, corrections |
| `adjustReason` | סיבת התיקון | history, the statement, corrections |
| `correctionLead` | תיקון הוא רישום חדש שנשאר ליד המקורי. שום דבר לא נמחק. | history, the statement, corrections |
| `saveCorrection` | רשום תיקון | history, the statement, corrections |
| `correctionDone` | התיקון נרשם. | history, the statement, corrections |
| `detailAbsent` | הפירוט המלא של הסגירה הזאת עדיין לא במכשיר הזה. הסכומים נכונים; הפירוט יופיע כשיהיה חיבור. | history, the statement, corrections |
| `owed` | מגיע לעובד | history, the statement, corrections |
| `paidSoFar` | שולם עד היום | history, the statement, corrections |
| `legacyUnknown` | נסגר לפני שנרשמו תשלומים - לא ידוע אם שולם | history, the statement, corrections |
| `openingLead` | מהיום שתבחר, כל סגירת חשבון ותשלום נרשמים כאן. מה שנסגר לפני כן לא משתנה. | first run and the older closures |
| `openingDay` | יום תחילת המעקב | first run and the older closures |
| `openingConfirm` | התחל מעקב | first run and the older closures |
| `openingDone` | המעקב התחיל. | first run and the older closures |
| `legacyEntry` | סגירות ישנות לבדיקה | first run and the older closures |
| `legacyTitle` | סגירות ישנות - האם שולם? | first run and the older closures |
| `legacyLead` | סגירות שנעשו לפני שנרשמו תשלומים. ענה מתי שנוח - זה לא עוצר שום דבר. | first run and the older closures |
| `legacyPaid` | שולם | first run and the older closures |
| `legacyDue` | נשאר חוב | first run and the older closures |
| `legacyLeave` | לא ידוע | first run and the older closures |
| `legacyDueAmount` | כמה נשאר לשלם? | first run and the older closures |
| `legacySave` | רשום | first run and the older closures |
| `legacyDone` | התשובה נרשמה. | first run and the older closures |
| `legacyEmpty` | אין סגירות ישנות לבדיקה. | first run and the older closures |
| `draftRestored` | מה שהוקלד לפני שהעמוד נטען מחדש שוחזר. בדוק את הסכומים לפני האישור. | Phase 5: a draft kept across a reload |
| `draftContinue` | המשך סגירה שהתחלת | Phase 5: a draft kept across a reload |
| `lookAction` | מה לבדוק? | Phase 5: what «לבדיקה» is about |
| `lookLead` | הסכומים שבמסכים הם אלה שהשרת מחזיק. שום דבר לא נמחק. עד שזה ייפתר אי אפשר לרשום לעובד הזה סגירה או תשלום. | Phase 5: what «לבדיקה» is about |
| `lookConflict` | שני טלפונים רשמו את אותו רישום בסכומים שונים | Phase 5: what «לבדיקה» is about |
| `lookCounted` | נספר - מה שהשרת מחזיק | Phase 5: what «לבדיקה» is about |
| `lookBeside` | נשמר בצד, לא נספר | Phase 5: what «לבדיקה» is about |
| `lookHeld` | רישום שלא נספר | Phase 5: what «לבדיקה» is about |
| `lookOverpaid` | שולם יותר מהמגיע | Phase 5: what «לבדיקה» is about |
| `lookOverpaidAdvance` | הוחזר או קוזז יותר ממה שניתן במקדמה | Phase 5: what «לבדיקה» is about |
| `lookNoFix` | עדיין אין פתרון מהמסך הזה. הראה את המסך הזה למי שמתחזק את האפליקציה. | Phase 5: what «לבדיקה» is about |
| `lookNothing` | אין מה לבדוק לעובד הזה. | Phase 5: what «לבדיקה» is about |
| `lookAmount` | סכום | Phase 5: what «לבדיקה» is about |
| `lookDate` | תאריך | Phase 5: what «לבדיקה» is about |
| `lookBy` | נרשם במכשיר | Phase 5: what «לבדיקה» is about |
| `kindPayment` | תשלום | Phase 5: what «לבדיקה» is about |
| `kindDeduction` | ניכוי נוסף | Phase 5: what «לבדיקה» is about |
| `kindLegacy` | תשובה על סגירה ישנה | Phase 5: what «לבדיקה» is about |
| `archiveEntry` | ארכיון סגירות | Phase 5: the archive |
| `archiveLead` | סגירה ששולמה במלואה עוברת מהרישום החי לארכיון בשרת, כדי שהרישום לא יתמלא. שום דבר לא נמחק: הסגירה נשארת במכשיר הזה ובהיסטוריה בדיוק כמו שהיא. | Phase 5: the archive |
| `archiveReady` | מוכנות להעברה | Phase 5: the archive |
| `archiveHeld` | נשארות ברישום | Phase 5: the archive |
| `archiveDone` | כבר בארכיון | Phase 5: the archive |
| `archiveSizeNow` | גודל הרישום בשרת | Phase 5: the archive |
| `archiveSizeAfter` | אחרי ההעברה | Phase 5: the archive |
| `archiveRun` | העבר לארכיון | Phase 5: the archive |
| `archiveRunning` | מעביר… | Phase 5: the archive |
| `archiveNone` | אין סגירות שמוכנות להעברה. | Phase 5: the archive |
| `archiveMoved` | הועברו לארכיון | Phase 5: the archive |
| `archiveStopped` | ההעברה נעצרה. מה שכבר הועבר נמצא בארכיון, ושום דבר לא אבד. אפשר לנסות שוב. | Phase 5: the archive |
| `archiveOffline` | אין חיבור לשרת. ההעברה נעשית רק כשיש חיבור. שום דבר לא השתנה. | Phase 5: the archive |
| `archiveDiffers` | הסגירה בשרת אינה זהה למה שבמכשיר הזה. היא נשארת ברישום. | Phase 5: the archive |
| `archiveCopyDiffers` | העותק שבארכיון אינו זהה לסגירה. היא נשארת ברישום. | Phase 5: the archive |
| `archiveServer` | השרת לא קיבל את ההעברה. שום דבר לא השתנה. נסה שוב. | Phase 5: the archive |
| `archiveBusy` | הרישום בשרת השתנה כמה פעמים בזמן ההעברה. נסה שוב בעוד רגע. | Phase 5: the archive |
| `whyOwed` | עוד לא שולם במלואו | Phase 5: the archive |
| `whyCorrected` | יש תיקון למקדמה שקוזזה בסגירה הזאת | Phase 5: the archive |
| `whyIrregular` | רישום ישן שאי אפשר להעביר | Phase 5: the archive |
| `closedWaiting` | במכשיר הזה חסר הפירוט של סגירות שכבר בארכיון. עד שהוא יירד מהשרת המכשיר לא מתעדכן, ואי אפשר לרשום ממנו סגירה או תשלום. זה קורה מעצמו כשיש חיבור. | Phase 5: a phone that lacks the detail |
| `closedBroken` | סגירה שבארכיון בשרת אינה שלמה. המכשיר הזה לא מתעדכן עד שזה ייבדק. הראה את המסך הזה למי שמתחזק את האפליקציה. | Phase 5: a phone that lacks the detail |
| `activationRowOff` | פנקס שכר (סגירת חשבון, תשלומים וארכיון): עוד לא הופעל ברישום הזה. | Phase 8: the row in the settings sheet |
| `activationRowOn` | פנקס השכר פעיל ברישום הזה. יום תחילת המעקב: | Phase 8: the row in the settings sheet |
| `activationEntry` | פנקס שכר - הכנה והפעלה | Phase 8: the row in the settings sheet |
| `activationTitle` | פנקס שכר - הכנה והפעלה | Phase 8: the activation screen |
| `activationLead` | כאן רואים מה ישתנה לפני שמפעילים. המסך הזה לא רושם ולא משנה דבר עד שלוחצים על הכפתור שבסופו ומאשרים. | Phase 8: the activation screen |
| `activationWhat` | אחרי ההפעלה לשונית «מקדמות» היא עמוד חשבונות העובדים: סגירת חשבון ותשלום נרשמים מול השרת, ומקדמה נשארת חוב עד שמקזזים אותה או עד שהעובד מחזיר אותה. | Phase 8: the activation screen |
| `activationDebtTitle` | חוב מקדמות שיוצג אחרת | Phase 8: the activation screen |
| `activationDebtLead` | היום האפליקציה מניחה שמקדמה מתקופה שלא נסגרה כבר ירדה מהשכר. אחרי ההפעלה היא נשארת חוב עד שמישהו מקזז אותה. אצל העובדים האלה החוב יוצג אחרת: | Phase 8: the activation screen |
| `activationDebtNone` | אין עובד שהחוב שלו יוצג אחרת. | Phase 8: the activation screen |
| `activationDebtNow` | היום | Phase 8: the activation screen |
| `activationDebtAfter` | אחרי ההפעלה | Phase 8: the activation screen |
| `activationDebtCheck` | אם תקופה כזאת כבר הוסדרה ביד, רושמים לעובד החזר אחרי ההפעלה. שום דבר לא נמחק ושום יום עבודה לא משתנה. | Phase 8: the activation screen |
| `activationLegacyTitle` | סגירות ישנות | Phase 8: the activation screen |
| `activationLegacy` | סגירות שנעשו לפני פנקס השכר יופיעו ברשימה «סגירות ישנות לבדיקה», ועונים עליהן מתי שנוח: | Phase 8: the activation screen |
| `activationLegacyNone` | אין סגירות ישנות לבדיקה. | Phase 8: the activation screen |
| `activationSizeTitle` | גודל הרישום והארכיון | Phase 8: the activation screen |
| `activationSize` | גודל הרישום בשרת היום | Phase 8: the activation screen |
| `activationArchiveNote` | חשבון שנסגר ושולם במלואו עובר אחרי 14 יום לארכיון בשרת. חודש שנסגר לכל העובדים יכול לעבור לארכיון אחרי חצי שנה, ורק כשמבקשים. שום דבר לא נמחק והכול נשאר במכשיר - אבל יום בחודש שעבר לארכיון כבר אי אפשר לשנות. | Phase 8: the activation screen |
| `activationCarry` | ההפעלה מאשרת גם, פעם אחת, שיתרת מקדמה עוברת לחשבון הבא. שורות שישתנו: | Phase 8: the activation screen |
| `activationTrackingDecided` | יום תחילת המעקב שנקבע: | v190: the activation screen, under the day - only while the day offered is the day the owner decided (30/10/2026) |
| `activationTrackingMeans` | תקופה מהיום הזה שעוד לא נסגרה נסגרת בעמוד החדש. תקופה שכבר נסגרה בדרך הישנה לא משתנה, ומופיעה ברשימה «סגירות ישנות לבדיקה». אחרי ההפעלה אי אפשר לשנות את היום הזה. | v190: the same line, after the day |
| `activationTrackingStranded` | ביום שבחרת, תקופות עם עבודה שעוד לא נסגרו נשארות לפני תחילת המעקב. אחרי ההפעלה אי אפשר יהיה לסגור אותן. מספר התקופות: | v190: the activation screen, a warning - only when the day in the field is LATER than the day offered and would leave unclosed periods before tracking |
| `activationBeforeTitle` | לפני שמפעילים | Phase 8: the activation screen |
| `activationBeforePhones` | כל הטלפונים מעודכנים לגרסה הזאת. | Phase 8: the activation screen |
| `activationBeforeBackup` | נלקח היום גיבוי מהטלפון הזה (⋯ ← גיבוי). | Phase 8: the activation screen |
| `activationBeforeRules` | הכללים החדשים פורסמו ב-Firebase. האפליקציה בודקת את זה בעצמה, ובלעדיהם לא תפעיל. | Phase 8: the activation screen |
| `activationNoReturn` | אחרי ההפעלה אי אפשר לכבות את פנקס השכר מהאפליקציה. עד הסגירה או התשלום הראשון לא נרשם שום דבר כספי חדש. | Phase 8: the activation screen |
| `activationRun` | הפעל את פנקס השכר | Phase 8: the activation screen |
| `activationConfirmTitle` | להפעיל את פנקס השכר? | Phase 8: the activation screen |
| `activationConfirm` | ההפעלה חלה על כל הטלפונים שמחוברים לרישום הזה, ואי אפשר לכבות אותה מהאפליקציה. יום תחילת המעקב: | Phase 8: the activation screen |
| `activationConfirmYes` | הפעל | Phase 8: the activation screen |
| `activationChecking` | בודק את השרת… | Phase 8: the activation screen |
| `activationRules` | השרת עדיין עובד עם הכללים הישנים. פנקס השכר לא הופעל ודבר לא נרשם. מפרסמים את הכללים החדשים ב-Firebase ומנסים שוב. | Phase 8: the activation screen |
| `activationCarryWait` | אישור המעבר נשמר במכשיר ועוד לא הגיע לשרת. פנקס השכר עוד לא הופעל. חכה רגע ולחץ שוב. | Phase 8: the activation screen |
| `activationDone` | פנקס השכר הופעל. | Phase 8: the activation screen |
| `activationElsewhere` | פנקס השכר כבר הופעל מטלפון אחר. לא נרשם דבר נוסף. | Phase 8: the activation screen |
| `monthsEntry` | ארכיון חודשים | Phase 8: the months page |
| `monthsLead` | חודש שכל ימי העבודה שבו נסגרו ושולמו, ועברה חצי שנה, יכול לעבור מהרישום החי לארכיון בשרת. הימים נשארים במכשיר הזה ובכל דוח בדיוק כמו שהם. אחרי ההעברה אי אפשר לשנות יום באותו חודש. | Phase 8: the months page |
| `monthsRun` | העבר את החודשים המוכנים לארכיון | Phase 8: the months page |
| `monthsConfirmTitle` | להעביר חודשים לארכיון? | Phase 8: the months page |
| `monthsConfirm` | אחרי ההעברה אי אפשר לשנות יום בחודשים האלה, גם לא רישום לרימא או ליוסף גבס. חודשים להעברה: | Phase 8: the months page |
| `monthsConfirmYes` | העבר | Phase 8: the months page |
| `monthsMoved` | חודשים שהועברו לארכיון | Phase 8: the months page |
| `monthsDiffers` | ימי החודש בשרת אינם זהים למה שבמכשיר הזה. החודש נשאר ברישום. | Phase 8: the months page |

#### Proposed: one sentence per refusal code (47)

`closed` and `statement` share a sentence, as do `amount` and `delta`.

| code | sentence |
|---|---|
| `worker` | העובד לא נמצא ברשימה. |
| `stamp` | השעון או זיהוי המכשיר חסרים. פתח את האפליקציה מחדש. |
| `gate` | רישום סגירות חשבון לא פעיל במכשיר הזה. |
| `carry-approval-needed` | כדי לקזז רק חלק ממקדמה צריך לאשר פעם אחת שיתרת מקדמה עוברת לחשבון הבא. |
| `permission` | למשתמש הזה אין הרשאה לסגור חשבונות. |
| `inactive` | עוד לא נקבע יום תחילת המעקב. קבע אותו בעמוד החשבונות. |
| `before-tracking` | התקופה הזאת לפני יום תחילת המעקב. |
| `period` | התקופה אינה תקופת התשלום של העובד הזה. |
| `closed` | החשבון כבר נסגר. |
| `overlap` | התקופה חופפת לתקופה שכבר נסגרה לעובד הזה. |
| `statement` | החשבון כבר נסגר. |
| `conflict` | שני טלפונים רשמו סכומים שונים לעובד הזה. צריך לבדוק לפני שממשיכים. |
| `early` | אי אפשר לסגור לפני היום האחרון של התקופה. |
| `unpriced` | יש יום עבודה בלי תעריף. קבע תעריף לעובד ואז סגור. |
| `overpaid` | יש עודף בהחזרי המקדמות של העובד הזה. תקן קודם, ואז סגור. |
| `allocation` | הסכום אינו תקין. הכנס מספר, גם 0 אפשרי. |
| `allocation-missing` | לא נבחר סכום למקדמה הזאת. הכנס סכום, גם 0 אפשרי. |
| `over-advance` | אי אפשר לקזז יותר ממה שנשאר במקדמה. |
| `over-wage` | הניכויים גבוהים מהשכר של התקופה. |
| `deduction` | אי אפשר לקזז את הסכום הזה מהתקופה הזאת. |
| `clock` | השעון של הטלפון הזה מפגר אחרי תנועה שכבר רשומה בחשבון. תקן את השעון ונסה שוב. |
| `extra` | בניכוי נוסף חסר סכום או סיבה. |
| `paid` | סכום התשלום אינו תקין. |
| `overpay` | אי אפשר לרשום תשלום גבוה מהסכום לתשלום. |
| `unpaid` | צריך לרשום תשלום כדי לסגור. |
| `note` | ההערה ארוכה מדי. |
| `unsafe-id` | מזהה העובד אינו תקין. אי אפשר לרשום לו סגירה. |
| `rejected` | הרישום לא עבר בדיקה פנימית. לא נרשם דבר. |
| `target` | הרישום לא נמצא, או שכבר אין בו יתרה. |
| `payment-id` | הטופס נפתח לא נכון. סגור ופתח אותו שוב. |
| `amount` | הכנס סכום גדול מ־0. |
| `date` | התאריך אינו תקין, או שעוד לא הגיע. |
| `method` | בחר מזומן או העברה. |
| `reason` | חובה לכתוב סיבה. |
| `over-target` | אי אפשר לבטל יותר מהסכום שנרשם. |
| `voided` | הרישום הזה כבר בוטל. |
| `delta` | הכנס סכום גדול מ־0. |
| `below-zero` | התיקון יוריד את הסכום מתחת למה שכבר שולם. |
| `opened` | יום תחילת המעקב כבר נקבע. |
| `state` | בחר תשובה. |
| `due` | הסכום אינו תקין, או גבוה מהנטו של אותה סגירה. |
| `answered` | כבר נרשמה תשובה לסגירה הזאת. |
| `cycle` | העובד אינו במחזור הזה. |
| `twice` | העובד נבחר פעמיים. |
| `stale` | החשבון השתנה בזמן האישור. לא נשמר דבר. בדוק את הסכומים ואשר שוב. |
| `done` | כבר נרשם |
| `server-first` | רישום כזה נעשה רק מול השרת. |

In all: **284 proposed strings** (237 + 47), beside the owner's fourteen. (Phase 8 added 42 of the 237: `credit`, 33 for the activation, 8 for the months page.)

## Phase 3 — one debt, the server-first closure, and the split (v175)

**Development branch. Not served, not merged, on no phone; no real record was read. The
gate (`paybook`) is still `false`, and after this phase it still may not be opened** — see
[What is NOT built](#what-is-not-built-and-why-the-gate-stays-shut).

    node tests/debt.ruling.test.mjs            # A: the ruling, both builds side by side
    node tests/paybook.transact.test.mjs       # C: the server-first door, on the fake cloud
    node tests/paybook.split.test.mjs          # B: the model of the split, and capacity for 20 men
    npm run -s test:paybook-split-emulator     # the NEW rules, the production adapter, three older builds (needs Java)

### What the owner decided (2026-11-10)

His own answers; requirements from here on. The "defaults" of Phase 1 that he answered
are no longer defaults.

| question | decided |
|---|---|
| the live data today | the backup file is about 185 KB, about 20 active men |
| closed accounts leave the single document | **approved**, including a rules change he publishes by hand |
| the other team's «יום תשלום» screen | dropped; the pay book is the one system |
| a weekly man in the NEW list | his open week only (rule 1, as built) |
| the old «לפי עובד» report | not restructured; closed weeks are marked «נסגר» — a marking, Phase 4 |
| an earlier unclosed period | apart, as «ממתין לסגירה», never summed (rule 2, as built) |
| closing with nothing paid | yes (rule 3, as built) |
| closing before the period's last day | no (rule 4, as built) |
| deductions above the wage | no — capped, the debt carries (rule 5, as built) |
| an advance dated after the period's end | not offered in that closure (rule 6, as built; and since v175 the existing dialog obeys it too under the ruling) |
| an advance from a period nobody closed | **stays a full debt until somebody deducts it** — CHANGES EXISTING BEHAVIOUR; [section A](#a--one-debt) |
| an advance with no amount entered at closure | a missing answer, not a zero (as built: `allocation-missing`) |
| who may close and pay | all three accounts (rule 8, as built) |
| closures from before the pay book | a «payment unknown» list; he answers each (`planLegacy`, as built) |
| payment methods / deduction categories | cash, transfer / agreed, settlement, other (as built) |
| «העברת מקדמות לחשבון נמשך» (`cm_carry`) | "do what is best": the flow must never leave financial controls silently locked — [`carry-approval-needed`](#the-carry-approval) |

### A — one debt

**The rule.** An advance from a period that was never closed stays a full debt until a
person deducts it at a closure or the man hands it back. Before: the account walk settled
such a period by itself — `min(what he owed, what he earned)` came off inside the walk,
recorded nowhere — while `advanceOutstanding`, the per-advance fold every card and every
closure is judged by, had never heard of that deduction. One record, two answers, and the
later closure refused to deduct the very advance the card said was owed (Phase 1,
finding 1).

**Where.** `js/model/schema.js`: `advanceDebtStays()`, `advanceCarryInto` →
`advanceCarryIntoUnder(schedule, worker, from, stays)`, `advanceWalk(..., stays)`,
`advanceLiveRoom`. `js/model/ledger.js`: `planPeriodClosure` (the cap and the date filter).
A closed period is untouched: it reports its record. So the carry into any account is the
sum of what `advanceOutstanding` says was left on each advance the day before it opens —
checked on 60 seeded random records, 630 accounts and 284 closures, in `tests/debt.ruling.test.mjs`.

**It is behind the pay book's gate, and that is why there are not two calculators.**
`advanceDebtStays()` is `FARKAD_FLAGS.paybook === true`, read in one place; every reader —
the sheet, the statement, the existing dialog, the new planner — comes through
`advanceCarryInto`, so a build answers one way everywhere. **It ships with the gate's
opening and not before**: a build with the gate shut computes the old walk byte for byte
(asserted on a shut-gate device in every section of the suite), which is every build a
person has installed and this one as committed.

**Two things found while building it, both fixed and pinned.**

- *Closing out of order would have taken an advance twice.* Under the ruling a debt
  travels, so an EARLIER account can be closed after a later closure (or a later
  repayment) already settled the advance its balance is made of. Measured: 500 given in
  August and never closed, 300 of it deducted at September's closure, and August's own
  closure then offered the whole 500 again. `advanceLiveRoom` caps what an unclosed account
  may deduct by what is left on its advances TODAY; the entry's `balanceAfter` stays the
  figure the judge recomputes (as of that account's last day), so every phone accepts it.
- *The gate every financial control asks took over a second.* `planAdvanceCarry` walked on
  through four thousand empty fortnights while a debt stood — free while the old walk
  settled every debt out of the next wage, 1,415 ms a call (against 4) once a debt stands
  until somebody deducts it. It now stops at the last day anything on the record is dated;
  the rows are the same.

**A settled account never changes.** A closure's frozen figures — `carriedIn`, `gross`,
`deducted`, `carriedOut`, `net` — are the same bytes and the same numbers under both rules,
whenever it was closed. What moves on a CLOSED row is only what was never frozen: the money
the next account opens owing (`carriedForward`) — and with it `lateSinceClose`, which the
sheet words as «הגיעה תנועה אחרי סגירת התקופה». Under the ruling that note appears on an
old closure that has a never-closed advance behind it, and its sentence is then not true
(nothing arrived late; the rule moved). The figure beside it («חוב פתוח») is true. Pinned
as KNOWN; the wording is Phase 4's and the owner's.

**The dry run: `planDebtRuling(schedule, today?)`.** Writes nothing, returns
`changes: []`, says the same thing on either build. Per man: `advances` — one row per
(advance, never-closed period) with `assumed`, what the old walk silently took; `figures`
— every account figure that moves, old and new; `debt` — what the walk says he owes going
into his open account, old and new, beside `recorded`, the advances' own sum. On the
suite's fixture (Khaled: 500 in a fortnight he earned 700 in, 300 in one he earned 1,400
in, neither closed; the third closed by the old build with nothing deducted; today in the
fourth):

    advances   500 given 08-10, 500 left, assumed taken 500 in 08-07..08-20
               300 given 08-24, 300 left, assumed taken 300 in 08-21..09-03
    figures    08-07  deducted 500 → 0 · net 200 → 700 · carried forward 0 → 500
               08-21  carried in 0 → 500 · deducted 300 → 0 · net 1,100 → 1,400 · carried forward 0 → 800
               09-04  (closed) late-since-close 0 → 800 · carried forward 0 → 800
               09-18  carried in 0 → 800 · deducted 0 → 700 · net 700 → 0
    debt       as of 09-18: old 0, new 800, recorded 800

**The owner reads this report on his real record before the gate opens.** It is the list
of men whose open accounts will say they owe more than the sheet says today, and it is his
to say which of those fortnights were in fact settled by hand.

**Every expectation that moved, in the commit that moved it** (`tests/payroll.test.mjs`;
each carries the ruling and its date, and the old value is still asserted on a device
built as shipped):

| check (before) | was | is |
|---|---|---|
| Phase 0: «500 from a fortnight nobody closed is "500 left" to one fold and "nothing carried" to the other» | `[500, 0]` | HISTORY on a shut-gate device: `[500, 0]`; THE RULING: `[500, 500]` |
| Phase 0: «and the existing closure refuses to deduct it from a later wage» | refused, `deduction` | HISTORY: refused; THE RULING: closes, 300 off, 200 left |
| advances: «an advance from a fortnight nobody closed: 500 left on it, nothing the account walk will let come off» | `[false, ['deduction'], 500, 0]` | `[true, [], 500, 500]`, then 200 left / 200 carried / net 4,100 |
| advances: «the migration report names the disagreement instead of settling it» | one row, 500 against 0 | `[]` |
| refusal codes: «the account walk allowing less than was chosen» (150.01 of 500) | refused, `deduction` | HISTORY on a shut-gate device: refused, walk room 150; THE RULING: allowed, walk room 500 |
| refusal codes: «and exactly what the walk carries is allowed» | `[true, 150, 500]` | replaced by the line above |
| refusal codes: the vocabulary list | includes `deduction` | `deduction` joins `rejected`: produced by no input with the gate open |

Nothing else moved in A. **What moves when the gate opens** — measured by forcing the
ruling on in a scratch copy and running every node suite: `tests/repayment.test.mjs` 6
checks (an account that inherits what the one before could not cover: 1,800 → 5,000 where
the earlier account was never closed), `tests/ledger.truth.test.mjs` 1,
`tests/paycycle.completion.test.mjs` 1. Those are Phase 5's to move, with the gate, in one
commit. The browser suites were not run that way.

### The carry approval

`paybookGateReasons` answers three ways now: `gate` (this build does not write the pay
book, the ledger or the carry — nothing a person can do), `carry-approval-needed` (the
record's carry is needed and unapproved — the one shut gate a person can open), and
nothing. A refusal carrying the code also carries `carryApproval: { id, needed, approved,
rows }` (`paybookCarryApproval`), the rows being `planCarryMigration`'s own.

And a closure **may not lock the record behind itself**: `planClosure` builds the closure
on a copy, asks whether that copy would be locked (`paybookWouldLock`), and if so refuses
BEFORE anything is written, with the same code. `planCarryApproval(schedule, stamp)` is
the approval as a plan — one path, `ledger.migrations.cm_carry`, the record the existing
dialog writes; it is not a pay entry and goes by the ordinary path, after being laid into
the schedule. Phase 4 says one sentence and offers it there. **Recommended for Phase 5:**
approve the carry in the same step as the opening day, so the first partial deduction
never meets the question.

### C — the server-first closure

`js/sync/transact.js`: `FarkadSync.transactPaybook(plan)`. A closure, a payment, a void,
an adjustment, a legacy answer, the opening — each is ONE transaction of its own through
the production adapter (`transact` in `js/sync/firebase-adapter.js`), outside the ordinary
flush, and it writes the schedule's field paths, the operation's receipt and a create-once
closed document together or not at all.

| state | means |
|---|---|
| `closed` | the transaction committed, the closed document was read back from the server and is what was sent, the server's schedule carries every path, and this phone's own record has adopted them. The only state that means done. |
| `done` | the same fact was already on the server (a payment pressed twice). Nothing written. |
| `refused` | nothing was sent, or the server refused it whole: `offline`, `unsupported`, `restoring`, `unsent-work`, `pending`, `busy`, `plan`, `storage`, `server`. |
| `stale` | the account changed. The fresh document is adopted, nothing was written, `fresh` is the plan as it now stands (with its reasons — `closed`, `statement`, …). |
| `unknown` | it was sent and its fate is not known and cannot be asked right now. The intent stays; everything else is refused (`pending`) until it is settled. |

**The intent.** Before anything leaves, the operation is written to this phone's disk
under one key (`farkad:payIntent`): its name, its exact bytes, the revision it was aimed
at. It is not a queue — nothing ever sends it again. Its name is the idempotency key
(this device, the closed document's id, the exact entries), so a retry finds its own
receipt.

**Measured outcomes** (`tests/paybook.transact.test.mjs`, fake cloud; the emulator suite
repeats the ones marked E):

| case | what happens |
|---|---|
| the ordinary closure (E) | one write, one revision, one receipt, one closed document named for the statement holding exactly the plan's entries; no journal batch, nothing pending; the other phones — one with the writer off — hold the same book |
| no signal / no cloud / the server's document not heard yet | `refused: offline`; the disk is byte for byte what it was; nothing is sent when the signal returns |
| this phone holds unsent work | `refused: unsent-work` (and the queue is asked to drain); goes through once it has |
| the other phone closed it first, different choices (E, truly concurrent) | exactly one closed document, one statement, one receipt; the loser is `stale` with `closed`/`statement`, holds the winner's closure afterwards, no intent, nothing queued, nothing beside, not stopped; each advance reduced once |
| the same choices on both | the second is told it is already closed; one closure stands, the first signer's |
| the document moved for somebody else's reason | the same operation under the same name, re-aimed (up to three times) after the plan is judged again; a day recorded INSIDE the account is `stale`, with the fresh wage |
| a double tap | one operation; the second is `refused: busy` |
| the write landed and the answer was lost | settled by reading the receipt; `closed`; one write, never a second |
| the answer was lost and the server cannot be asked | `unknown`; another closure is `refused: pending`; at the next signal: `committed`, by looking |
| reloaded mid-flight, it had reached the server | found by its receipt at the next open, adopted, outcome `committed` |
| reloaded mid-flight, it died and the document moved | its revision is spent: outcome `nothing`, and the phone says so |
| reloaded mid-flight, still on the way | the revision it was aimed at is spent on purpose by one write that changes no business field; when the old request arrives it is refused; outcome `nothing`, and it stays true |
| a later payment; a void from the other phone | each one write and one closed document of its own |
| an intent that cannot be read | everything is `refused: pending`; the bytes are not deleted; resolving answers `unknown` |

Three things the emulator found that the fake cloud could not, all fixed: a lost revision
race arrives as `permission-denied` (the rules judge the loser's commit against a document
that already moved) and was answered «server» — it is now answered by looking; a read can
be a moment behind the commit it follows and was answered «unverified» — it is read again,
a bounded number of times, when it looks merely early; and adoption can trail the read by
a moment — the record is looked at again before anything is said.

**The ordinary queue never carries a pay path.** `FARKAD_FLAGS.paybookQueue` is `false` in
every build: `State.commitPaybook` answers `server-first`, and the queue's one minting
path refuses a `pay.` path whoever asks (asserted, with the cloud's whole write log
searched). The flag exists so that the Phase 2 suites — whose subject is two phones holding
different pay entries — can still produce that state; they open it by name
(`WRITER_ON` in `tests/paybook.world.mjs`).

**Protocol 2.** This build writes `protocol: 2` on every write. Nothing in the envelope
changed shape; the number is what the rules read.

### B — the split

**The design.**

- **Where:** `schedules/{doc}/closed/{id}`, one document per server-first OPERATION: a
  closure under its statement's id (`ps_<worker>_<from>`), a later payment, a void, an
  adjustment, a legacy answer or the opening under its own entry's id.
- **Why per operation, not per man per year:** a closed document is create-once — that is
  the server-side append-only the pay book has never had — and a per-year document would
  have to be updated. Two phones closing one man's one period aim at ONE document. A phone
  opening the app reads one document, as today; a closed document is read only when
  somebody opens that closure's detail, and never changes afterwards, so it can be kept.
- **What it holds:** `{ v: 1, id, kind, workerId, opId, revision, entries }`, `entries`
  being the operation's field paths and values VERBATIM — the frozen payslip with its day
  list, each `deducted` entry, the extras, the statement, the payment. No second
  description of a closure exists to drift from the first, and the closed documents laid
  back over a record that has dropped them rebuild it byte for byte (asserted on the
  fixture and on 30 random records).
- **When:** at the closure, in the same commit — never a later move. So for everything
  written through the new door there is no copy-verify-drop to interrupt: the copy exists
  from birth, bound to its schedule write by the rules from both sides.
- **The index** (`paybookIndexFrom`): one row per closed period per man, keyed by the
  closed document's id — whose and which period, the moment of closing, the wage it was
  closed on, the balance it opened and closed on, `[advance, amount, balance after]` per
  advance deducted, and where a statement stands the extras, the net, what is owed and
  what was paid. **It is enough** — on 30 seeded random records (360 statements, 90 old
  closures, 268 payments, 49 voids, 60 adjustments, 526 advances) the folds from the index
  (`paybookIndexFolds`) equal the folds from the whole history: every closed period's
  frozen figures (`closedPeriods`), what was deducted from every advance
  (`advanceOutstanding().deductedGross`), and every man's «יתרת שכר לתשלום», what is
  overpaid, each statement still owing and each closure with payment unknown
  (`accountFor`). It is derived, so it can be rebuilt from the closed documents.
- **Offline:** balances come from the index and never from the detail.
  `paybookDetail(schedule, closed, id)` answers `record` / `fetched` / `absent`; on
  `absent` the screen says the detail is not on this phone yet and shows NO day list
  rather than a live one.
- **Existing closures** (the ledger's `closed`/`deducted` entries written since v116) are
  bundles of the same shape: `planHistoryMove(schedule)` reports each — its paths, its
  bytes, whether it is SETTLED (a statement that still owes, an unanswered older closure
  and a disputed id are not, and nothing unsettled moves) — and the totals: bytes moving,
  the index's bytes, bytes freed, the document before and after. It writes nothing and
  nothing applies it.

**What is built of it.** The closed collection, its rules, the atomic copy at every
server-first operation, the read-back, the reader that judges a closed document
(`paybookClosedProblems`), `paybookDetail`, `planHistoryMove`, the index and its folds
with their proof.

### What is NOT built, and why the gate stays shut

1. **Nothing leaves the live document yet.** *(Phase 5: a settled closure now does - by
   another road than the one written here. The folds were NOT taught to read the index;
   a phone's record keeps every entry and the index is used only at the boundary. See
   Phase 5.)* A closure written through the new door is in
   the closed collection AND still in the schedule. Dropping the live copy needs the folds
   to read the index — and every reader of the ledger (`closedPeriods`,
   `advanceOutstanding`, `advanceHistory`, the judge, the reports) reads the entry map
   directly. Teaching them is a change to the most protected arithmetic in the app and is
   a phase of its own; a version of it squeezed into this one would have been the weaker
   version. **So the capacity clock is not stopped**, and opening the gate today would
   fill the document in about seven months (below).
2. **The index is not stored.** *(Phase 5: it is, one row per archived closure, written
   by the transaction that drops the entries.)* It is derivable from the entries for as long as they are
   in the schedule, which is always, today. It must be written by the same transaction
   that drops an entry, never before.
3. **The index as designed is itself not bounded** — measured, below. Rows of settled
   closures older than some horizon have to fold into one per-man checkpoint.
4. **The days are still in the document, and they are the larger half.** See Capacity.
5. **Backups and the rescue file do not carry closed documents, and a restore does not
   re-create them.** *(Phase 5: they carry every ENTRY, say in the file and on the screen
   what they do not carry, and a restore never erases a closure - proven. A restore into
   an empty project is still not built.)* While nothing has left the schedule a backup is complete without
   them, by construction. Decided, not built: the backup file gains `closed: { id: doc }`
   for every closed document the phone can fetch (and says how many it could not); a
   restore never deletes or rewrites a closed document (the rules make that impossible)
   and unions; a restore into an EMPTY project re-creates them in the restore's own commit.
   **Under the new rules a whole-document write that would ADD pay entries is refused
   unless it creates a closed document in the same commit** — so until that is built, a
   pay book cannot be restored into a new project. With the gate shut there is none.
6. **Moving existing history** — Phase 5, after every phone reads the index. *(Built:
   `archiveClosed`, with `planArchive` as its dry run.)*
7. **No screen.** Phase 4.

### The rules, as a file

`firestore.rules` ON THIS BRANCH is the tested artifact; nothing was published and nothing
here can publish. `docs/firestore.rules.before-paybook` is the rules as main carries them,
byte for byte (asserted against `git show 8c943fa:firestore.rules`) — **the rollback
artifact.**

The difference, in words:

- **A write that changes the `pay` map** must speak protocol 2, may only ADD entries
  (none removed, none changed), and must create in the same commit the closed document it
  names in `closedId`, which must name this operation and this revision. An absent map
  and an empty one are the same thing. A write that does not change the map is judged
  exactly as before — which is every write of a phone that has not updated.
- **`closed/{id}`**: readable and creatable only by the allowlist; created only in the
  commit that takes the schedule to the revision it names, pointing at the operation it
  names, at protocol 2; never updated, never deleted, by anyone.
- Everything else is untouched: `tests/rules.test.mjs`, `rollout*`, `bootstrap*`,
  `cas.emulator`, `money.concurrency` are green unchanged, except two pins in
  `tests/bootstrap.emulator.test.mjs` that read `protocol === 1` and now read 2.

**Server-enforced:** the three above. **Not server-enforced** (the rules cannot loop):
that the closed document's `entries` are exactly the paths the schedule gained; that a
whole-document write adding several entries has a closed copy for each. Those are the
client's, and pinned in the suites.

`tests/paybook.emulator.test.mjs` (Phase 2) now loads `docs/firestore.rules.before-paybook`
by name: its subject is what the ordinary queue does to a closure under the PUBLISHED
rules, and the new rules refuse that path outright.

### The rollout order, measured

`tests/paybook.split.emulator.test.mjs`: v167 (`a25566f`), v171 (`0acaceb`) and v172
(`8c943fa`) — their own files and their own adapter, out of Git — and this build, under
the rules of today and the new ones, with and without a pay book on the document. All
three older builds answer every question the same way.

| client | rules | document | records a day | restores | closes an account |
|---|---|---|---|---|---|
| older | new | no pay book (today's) | **yes** | **yes** | — |
| older | new | with a pay book | ~~yes, pay book unchanged~~ **REFUSED since Phase 8** (`activatedNeedsPaybook`): a record with a pay book is a record that is on, and an older build may write nothing to it | **REFUSED** — pay book and revision exactly where they were; the phone says `error`, not synced; days it records afterwards wait on that phone behind the refused restore until it is updated | — |
| older | today's | with a pay book | yes | **accepted, and the pay book is GONE** | — |
| this build | today's | either | **yes** (protocol 2 is accepted) | yes | **REFUSED whole** — no `closed/` in those rules; nothing queued, nothing in doubt |
| this build | new | no pay book | **yes** | **yes** | — |
| this build | new | with a pay book | yes | yes | **yes** — one commit, three documents |

So the order that never leaves a working phone refused or a pay book erasable:

1. **Save the published rules.** Firebase console → Firestore Database → Rules: copy what
   is there into a file and compare it with `docs/firestore.rules.before-paybook`. If they
   differ, stop — the artifact in this repository is not what is live.
2. **Publish the new rules** (paste `firestore.rules` → Publish). No phone needs to update
   first and none is refused: an older build records and restores exactly as before, and
   there is no pay book for it to touch.
3. **Update the phones**, in any order. This build records and restores under either
   rules.
4. **Check each phone in ⋯** — not assumed. A phone still on an older build keeps working.
5. **Only then open the gate** (a later build, Phase 5). From the first pay entry on, an
   older build's restore is refused by the server instead of erasing; that phone shows an
   error and must be updated before it is used again.

**The wrong order is the one that loses money, and it is measured too:** a pay book on the
server under the rules of today is erased by any older build's restore. And a closure
cannot land before step 2 — the rules of today refuse it whole — so the gate cannot be
opened early by accident.

**Rolling back** (republishing `docs/firestore.rules.before-paybook`): safe while no pay
entry exists. After the first one it reopens the door above; closed documents stay where
they are but become unreadable to the app (no rule matches them) until the new rules
return.

### Capacity, for 20 men

`tests/paybook.split.test.mjs`, the method of Phase 2: every entry produced by the shipped
writers, a year built from them, and the DOCUMENT weighed by Firestore's count. Six days a
week; one man in four takes an advance each fortnight; every closure has a statement and
one payment. Entry sizes (JSON bytes): a worker-day 65; an advance 105 and its ledger
origin 198; a closed week's payslip 929, its deduction entry 975; a fortnight's 1,413 and
1,459; a statement about 490, a payment 189; **an index row 176**.

| 20 men | year 1 | year 2 | year 3 | year 4 | year 5 | a week | full, from today's 185 KB |
|---|---|---|---|---|---|---|---|
| days and advances only, nobody closes | 415 KB (41%) | 825 KB (81%) | 1,235 KB | 1,645 KB | 2,055 KB | 8,073 B | **2.0 years** |
| closed every fortnight, IN the live document | 1,468 KB (143%) | 2,931 KB | 4,394 KB | 5,858 KB | 7,321 KB | 28,811 B | **0.6 years** |
| closed every week, IN the live document | 1,945 KB (190%) | 3,883 KB | 5,822 KB | 7,760 KB | 9,699 KB | 38,176 B | **0.4 years** |
| closed every fortnight, WITH THE SPLIT | 502 KB (49%) | 999 KB (98%) | 1,496 KB | 1,993 KB | 2,490 KB | 9,786 B | **1.7 years** |
| closed every week, WITH THE SPLIT | 586 KB (57%) | 1,166 KB | 1,747 KB | 2,327 KB | 2,907 KB | 11,426 B | **1.4 years** |

Read it this way:

- **The split works for what it was approved for.** A week of closing weighs under a third
  of what it weighs in the live document; closing every fortnight then costs under a
  quarter more than never closing at all.
- **It does not bound the document, and nothing here says it does.** With the split the
  document still fills in about a year and a half — because the DAYS are in it (1,863 KB
  after five years, by themselves) and because the index, one row per closure, is itself
  435 KB after five years closed fortnightly and 851 KB closed weekly.
- **So two more things have to leave before "bounded" is true**, and both are the same
  mechanism (create-once documents, an index of what left, copy at birth or verified
  copy-then-drop): settled index rows older than a horizon folded into a per-man
  checkpoint, and the days of months that are closed for everybody and older than a
  horizon moved to a document per month. With both, the live document is the open items
  and the recent months. Neither is designed in detail and neither is built.
- **The owner's document is about a fifth full today and nobody is closing with the pay
  book.** On days alone it has about two years.

### What Phase 4 (the UI) must do

- Call `FarkadSync.transactPaybook(plan)` and nothing else for a pay entry; show `closed`
  only on `state: 'closed'`; on `stale` redraw from `fresh`; on `unknown` say that the
  closure is waiting to be confirmed and block; on open, read `FarkadSync.payOutcome()` and
  say what became of an interrupted closure, then `acknowledgePayOutcome()`.
- On `carry-approval-needed`: one plain sentence, the rows, and the approval right there
  (`planCarryApproval`, laid into the schedule and committed by `State.commitMany`).
- On `paybookDetail(...).state === 'absent'`: say the detail is not on this phone; fetch it
  with the adapter's `readClosed` when there is signal; never show a live day list in its
  place.
- Word the closed row's «late since close» note for the ruling (see A), and every refusal
  of `payTransactRefusal` (`offline`, `unsent-work`, `pending`, `busy`, `restoring`).
- Mark closed weeks «נסגר» on «לפי עובד»; retire or keep the old «סגור את החשבון» dialog —
  it works under the ruling, but it writes no statement and goes through the queue.
- A way to see and settle a pay-book disagreement (unchanged from Phase 2's list).

### What Phase 5 (activation) must do

1. Build what is listed under [What is NOT built](#what-is-not-built-and-why-the-gate-stays-shut),
   items 1–5, and re-measure Capacity.
2. The owner reads `planDebtRuling` on his real record, and `planPayMigration` and
   `planHistoryMove` beside it.
3. The rollout order above, steps 1–4.
4. One commit: `paybook: true`, with the eight expectations the ruling moves in
   `repayment`, `ledger.truth` and `paycycle.completion`, and the browser suites re-run.
5. The opening day (`planOpening`) and the carry approval in one step; then the «payment
   unknown» list, one answer at a time (`planLegacy`).
6. Moving existing history, bundle by bundle, settled ones only: create the closed
   document, read it back, compare byte for byte, and only then — in a transaction that
   also writes the index row — drop the live entries. Every step re-runnable; an
   interrupted move leaves a copy and never a hole.

## Phase 2 — storage and sync, as built (v173)

### The three findings to read first

1. **The document is on a clock, and closures are what wind it.** The whole schedule is one
   Firestore document, and Firestore refuses a document over 1,048,576 bytes — measured on
   the emulator (`maximum entity size is 1048576 bytes`), not assumed. A closure as the app
   writes it TODAY costs about 0.9 KB for a week and 1.4 KB for a fortnight per man (the
   frozen payslip), plus the same again for each advance it touches; a statement and its
   payment add about 0.7 KB. Numbers in [Capacity](#capacity). For fourteen men closed
   every fortnight the document is full after about a year with the pay book and about
   fifteen months without it; for thirty men, in months. **The pay book must not be opened
   on the single document as it is.** The split is proposed below and is not built.
2. **A closure is not all-or-nothing on the wire.** It is one transaction when it fits and
   is held whole when one of its paths is contested — and it is cut in two by the 296-path
   limit when a long queue is ahead of it. Measured; see [On the wire](#on-the-wire).
3. **A phone that has not updated can erase the pay book** — from the cloud with any
   restore, and from a disk it shares with a newer window. Measured on v167, v169 and v171;
   see [The rollout rule](#the-rollout-rule).

### The stored shape

    schedule.pay                    { "<id>": entry }   one field path per entry: pay.<id>
    schedule.payConflicted          { "<id>": [entry, …] }   the other side(s) of a disagreement; absent when empty
    schedule.payUnreadableContainer { pay?: …, payConflicted?: … }   bytes of a container that was not a record; absent normally

`emptySchedule()` names `pay`, because `normaliseSchedule` starts from it and keeps only
what it names — which is exactly why every older build drops the map from its own copy.

- **Created once, never rewritten, never removed.** `journalEntryProblems` accepts
  `pay.<id>` with exactly two segments and a value `payEntryProblems` accepts; a null is «a
  pay entry cannot be deleted». `payConflicted.*` is not a path at all: what is kept beside
  an entry is never sent on its own.
- **An entry stays where it lies, readable or not.** The ledger moves an entry it cannot
  fold into `ledger.unreadable`; a whole-document write from that phone then carries it
  under another name. Here it stays at `pay.<id>` on the disk, in memory and on the wire,
  and what keeps it out of the arithmetic is the fold (`paybookFold(...).held`).
- **Three doors refuse a rewrite**, each for the callers the one before it cannot see:
  `State.commitPaybook` (asks the record as it is now, answers with a reason, refuses the
  whole batch), the queue's one minting path `queueOperations` (asks the disk and the
  queue; a batch that got round the first door is not written), and the queue's reader (a
  batch on the disk carrying `pay.<id>: null` is not a queue this app wrote).
- **The same fact twice is one fact.** Same id, same content, another `at`/`by`/`rev`/
  `wageDueBefore` (`paybookSameFact`): nothing is written, the first signer stands, and a
  queued copy is acknowledged against the server's without replacing it
  (`ledgerPathSupersededBy` learned the `pay.` family).

### The commit

`State.commitPaybook(changes)` is the one door a pay entry is written by: a plan's
`changes` — the closure artifact, its `deducted` entries and the `pay.*` entries — as ONE
journal batch, journal first, through `commitMany`. It returns
`{ ok, reasons, written, same, kept }`. `reasons` is `gate` (this build, or this record's
financial gate), `rejected` (a null, a path that is not an entry, one path twice, an empty
batch), `conflict` (an id that already says something else, or is in dispute), or
`unwritten` (the journal or the record refused; `commitMany` has said so in its own words,
and `kept: true` means the journal HOLDS the batch and only the record write failed).

Pinned in `tests/paybook.store.test.mjs`: one journal record of six operations; a reopen
that reads back the same bytes and the same fold; a death between the journal and the
record rebuilt from the journal; a journal the disk refuses rolling memory back with the
app's own «הרישום לא נשמר» said once.

### The conflict rule

**One id, two different bodies: both are kept, the copy the cloud holds stands, and the
phone is not stopped.**

| | what happens |
|---|---|
| which copy stands | `paybookUnion(standing, other)`: the caller names who outranks. `receive()`: the cloud over this phone. `prepareReplace`: what is live over what is being restored. `absorbCloudLedger`: the cloud over the restore's envelope. So every phone that has heard the cloud folds the SAME entry under a disputed id. |
| where the other goes | `payConflicted[<id>]`, verbatim, on the record — across saves, reopens, backups, the rescue file, and inside any whole-document write. |
| what is held | (1) The loser's queued write: `pay.` is a `replacesWhole` family, so the pre-send pass and the conflict branch hold it by name — and its whole batch with it — and it is listed in ⋯ in the ledger's existing words («רישום כספי שהענן מחזיק אחרת. נשמר כאן ואינו נשלח; אין לו פתרון מהמסך הזה.»). (2) Every pay planner for the man the id belongs to: `conflict`. His account reads `review`. (3) `commitPaybook` for that id, from either side. |
| what is NOT held | The phone. No Recovery problem, no banner, writing not blocked: days, roster, advances and every other man's account go on. |

**Why narrower than the ledger's.** A ledger disagreement stops the phone through Recovery
because the losing phone keeps ITS OWN figure in the fold (the queue lays it back over the
adopted snapshot), so its screens would price a man differently from the other two. The pay
book does the opposite — the journal's replay never lays a queued body over one that stands
(`layPaybookEntry`) — so nothing on the losing phone is computed from the disputed figure.
Both bodies are readable and on the record; nothing can be lost by recording tonight's
days beside them. Stopping the phone would buy nothing and cost the evening.

**What is not weakened.** A closure whose DEDUCTIONS differ between two phones is a ledger
disagreement (`le_close_*`) as well, and that still stops the losing phone through Recovery
exactly as before — measured on the fake cloud (P4) and the emulator (A4), with the cloud
left entry for entry the winner's and no double deduction. The pay book's rule applies to
what only the pay book holds: a different paid amount, a different extra deduction.

**What it does not yet do.** Nothing in this phase lets a person SETTLE a disagreement;
the held write stays held and the status line stays «contested» on that phone until a later
phase gives it a screen. A disagreement that arrives with no queued write behind it (from a
restore, say) is on the record and in the fold and on no screen at all yet.

### Unreadable entries (iron law 10)

An entry `payEntryProblems` refuses — a kind from a build that does not exist yet, a sum
that is text, a null — is **kept at `pay.<id>` exactly as it arrived**, copied by Recovery
under `scheduleData:v2:pay` (the rescue file carries the copy under its own name), and
**all writing stops until the person has been told**, as for an unreadable ledger entry.
After «הבנתי» writing resumes with the entry still in place, and the next open says it
again. A `pay` that is not a record at all reads as an empty book, its bytes are carried
under `payUnreadableContainer` and quarantined under `scheduleData:v2:pay:container`, and a
replacement door refuses such a file in its own sentence. A poison name (`__proto__`,
`constructor`, `prototype`) under `pay` or `payConflicted` is the existing
`poisonedContainers` hold, extended to the two maps.

A payment that arrived before its statement is NOT unreadable: it is the ordinary order of
two field paths, it is held by the fold and stops nothing.

### The restore rule

**A restore never removes or rewrites a pay entry.** It replaces the work record — days,
roster — and unions the pay book in, exactly as it has always done for the advances ledger
(`features/restore-ledger/contract.md`), at the same two moments:

- `prepareReplace`: the live book is unioned into the envelope; where one id holds two
  bodies **what is live stands** and the file's is kept beside it.
- `absorbCloudLedger`, in the same turn as the write: the cloud's book is unioned in again,
  so a payment another phone recorded while the restore was waiting is not erased;
  **the cloud's copy stands.**

So a backup written before the pay book, an old restore point and a cloud copy from a
not-updated phone all restore as «no pay entries in that file», and every entry this phone
or the cloud holds stays. `localDurableHolds` compares `pay` and `payConflicted` too. The
four confirmations gain one sentence — only on a phone that holds a pay entry, so with the
writer shut they read exactly as they did: « סגירות חשבון ותשלומים שכבר נרשמו אינם נמחקים
בשחזור - הם נשארים רשומים.» (proposed wording).

This holds for a restore made BY THIS BUILD. A restore from an older build is the hazard in
the next section.

### The gate

`paybook: false` in `FARKAD_SHIPPED_FLAGS` (`js/model/schema.js`), read through
`paybookWritesEnabled()`. Off: the planners answer `gate`, `commitPaybook` answers `gate`,
and nothing else in the app calls either. NOT behind the gate, deliberately: reading,
folding, keeping across a save, merging, backing up, restoring and re-sending a queue that
holds one. The journal's grammar accepts `pay.<id>` whatever the gate says — a phone handed
a queue with one in it must still be able to read its own queue. It is not `ledgerWrites`:
the existing closure's ledger entries are written today by every phone.

### On the wire

Measured in `tests/paybook.sync.test.mjs` (P10) and against the production adapter
(`tests/paybook.emulator.test.mjs`, A1–A5):

| case | what happens |
|---|---|
| the ordinary closure | ONE update, one revision, one receipt: every path or none. |
| a path of it is contested before sending | the batch is held WHOLE; a sibling path that collides with nothing is never sent on its own. |
| the server refuses it on its revision and a path has moved | nothing of it is applied; the path is held, and the batch with it. |
| the server refuses it and nothing has moved | rebased and sent whole. |
| a retry after a lost answer | answered from its receipt, or settled as the same fact; one entry. |
| **more than 296 paths are queued ahead of it** | **the closure is CUT: one write carries the frozen payslip and the deductions, the next the statement and the payment.** Between the two every other phone reads a closure with no payment recorded («payment unknown»), the advances already reduced. If the second write never lands, that is where it stays. |

So: **no** — a multi-path closure is not all-or-nothing on the wire. It is by construction
only while it fits in one write. Phase 3's server-first transaction has to carry a closure
as exactly one transaction of its own, outside the ordinary flush.

Also measured, and pre-existing: a phone whose whole batch is settled against the server's
copy (the second of two identical closures, or a retry that finds its own write there)
sends nothing — and its status line is left at «שולח» or at the failure until the next
snapshot, over an empty queue. The existing ledger-only closure does the same on v171. It
is in `js/sync/send.js`, which this phase does not change; pinned as «TODAY» in P2 and P8.

### What the unchanged rules do

`firestore.rules` was not edited. On the emulator, with the file as it stands:

- an account on the allowlist: an update adding `pay.<id>` paths with the protocol envelope
  and its receipt is **accepted**;
- a signed-in account not on the list, and nobody at all: **refused** (and may not read);
- a write with no protocol, or at a stale revision: **refused**.

And what they do **not** refuse, pinned as «TODAY»: an allowlisted account may REWRITE an
existing pay entry, DELETE one, and write a whole document with no `pay` at all. The rules
look at who writes, at the envelope and at the receipt, and at nothing inside the document.
Append-only is kept by this build's client and by nothing else — an older build is not
bound by it, which is the next section.

### The rollout rule

Derived from `tests/paybook.oldbuilds.test.mjs`: v167 (`a25566f`), v169 (`bd59a68`) and
v171 (`0acaceb`), each built out of Git and run beside this build. All three answer every
question the same way.

| question | measured |
|---|---|
| does it keep working with `pay` on the cloud document? | yes: synced, not blocked, no Recovery problem |
| what does its own copy hold? | no `pay` at all — dropped from memory and from its disk |
| does it see the closure? | yes: the artifact and the `deducted` entries are ledger entries it reads; it refuses to close that period again |
| does an ordinary write of its remove `pay` from the cloud? | **no** — a day, and a closure made its own way, go out as field paths; the cloud's pay book is byte for byte unchanged |
| its backup file, its rescue file | no `pay` |
| its own closure (no statement) on an updated phone | a closure with payment unknown |
| **a restore from it — any door** | **erases `pay` from the cloud.** Updated phones keep their copies; nothing puts them back; a phone installing afterwards never learns of them. A restore from an UPDATED phone that holds them puts the whole book back. |
| **its window open beside a window of this build, on one disk** | **its next save writes the record without `pay`, and this build's own window then loses the book from memory too.** With a cloud, the next snapshot gives it all back (it is not read as an echo — `paybookCovers`). With no cloud, entries still in the journal are rebuilt from it and an entry that was only on the record is gone. If the queue holds an unsent pay path the old window cannot read that batch and is held by Recovery before it writes. |
| when it updates | its first snapshot gives it the whole pay book at once |

**THE ROLLOUT RULE.** Before the first pay entry is ever written — that is, before
`paybook` is opened on any phone:

1. **Every phone is on v173 or later**, checked on each phone in ⋯, not assumed.
2. **From the first pay entry on, no backup, restore point, cloud copy or rescue file is
   restored from a phone on an older build** — and a file written BY an older build
   carries no pay book, so restoring one on an updated phone is safe only because this
   build unions (the restore rule above).
3. **No window of an older build stays open beside a new one.** The app's own catch-up
   (law 7) reloads the other window; until it has, that window must not be recorded in.
4. A phone that turns up later on an older build is updated before it is used. Its
   ordinary recording harms nothing; its restore buttons do.

It is a rule, and a rule is a promise. What makes it enforced is the rules change Phase 3
needs anyway (`protocol >= 2`, so an older build's writes are refused outright).

### Capacity

`tests/paybook.store.test.mjs` builds the entries with the shipped writers, lays a year of
them into a document and weighs the DOCUMENT by Firestore's count. Six days a week; one
closure in four touches an advance. Entry sizes (JSON bytes): a worker-day 65; a closed
week's payslip 941, its deduction entry 983; a closed fortnight's 1,437 and 1,478; a
statement about 510, a payment about 190.

| crew | scenario | after 52 weeks | 50% of 1 MiB | 100% of 1 MiB |
|---|---|---|---|---|
| 14 | days only, nobody ever closed | 273 KB (26%) | week 100 | week 202 (3.9 y) |
| 14 | closed every fortnight, as written TODAY | 844 KB (80%) | week 32 | week 65 (1.2 y) |
| 14 | closed every fortnight, + statement and payment | 1,050 KB (100%) | week 26 | week 52 (1.0 y) |
| 14 | closed every week, as written TODAY | 1,071 KB (102%) | week 25 | week 51 |
| 14 | closed every week, + statement and payment | 1,482 KB (141%) | week 18 | week 37 |
| 30 | days only, nobody ever closed | 577 KB (55%) | week 47 | week 95 (1.8 y) |
| 30 | closed every fortnight, as written TODAY | 1,781 KB (170%) | week 15 | week 31 |
| 30 | closed every fortnight, + statement and payment | 2,222 KB (212%) | week 12 | week 24 |
| 30 | closed every week, as written TODAY | 2,259 KB (215%) | week 12 | week 24 |
| 30 | closed every week, + statement and payment | 3,138 KB (299%) | week 9 | week 17 |

Read it this way:

- **The pay book is the smaller half** of what a closure adds — in every scenario it weighs
  less than the ledger entries beside it — but it brings the day the document is full
  forward by at least a sixth.
- **The existing closure is the heavy part, and it is already shipped and on.** A frozen
  payslip with its day list, copied whole into every `deducted` entry. Whoever closes
  accounts regularly TODAY is spending this budget now.
- **Days alone fill it too**, in about four years for fourteen men and under two for thirty.
- A full document is not a slow one: every write to it is refused, on all three phones at
  once. One copy on the phone is a separate limit (5 MiB, with up to seven more copies in
  restore points and the way back): 30 men closed weekly with the pay book is 7.2 MB a copy.
- **Not known from here: how big the real document is today, and the real crew.** Both are
  the owner's to say; the first is one read of the live document's size.

(Superseded by Phase 3: the owner answered both - about 185 KB, about 20 men - and the
figures for that crew, with and without the split, are in [Capacity, for 20
men](#capacity-for-20-men). The split below is now designed and partly built; see
[B — the split](#b--the-split).)

**The split, as it was proposed at Phase 2.** Closed history leaves the live document: one
document per closed period (or per man per year) in a subcollection —
`schedules/current/closed/<worker>_<from>` — holding the frozen payslip, its `deducted`
entries, the statement and its payments, created once and never updated (the `history`
rule's shape: `allow create`, never update or delete — which is also the server-side
append-only the pay book lacks). The live document keeps open periods, balances and a
small index. It needs a rules change, a migration that is a copy and never a move, and a
reader on every phone — a phase of its own, before the gate opens.

### Hebrew added in this phase

All **proposed**; none is the owner's wording yet. Four of the five can only be seen on a
phone that holds a pay entry or an unreadable pay record, which with the writer shut is no
phone.

| string | where |
|---|---|
| חלק מרישום סגירות החשבון והתשלומים לא נקרא. הנתונים נשמרו כמו שהם ולא נמחק דבר, אבל אי אפשר לרשום עוד עד שתייצא גיבוי - כדי שלא ייחשב סכום שלא הצלחנו לקרוא. | Recovery, an unreadable pay entry |
| רישום סגירות החשבון אינו בצורה שאפשר לקרוא. שום דבר לא נמחק - הנתונים נשמרו כמו שהם - אבל אי אפשר לרשום עוד עד שתייצא גיבוי, כדי שלא ייכתב רישום ריק מעליו. | Recovery, a `pay` that is not a record |
| רישום סגירות החשבון בקובץ אינו בצורה שאפשר לקרוא. | a replacement refused for that |
| סגירות חשבון ותשלומים שכבר נרשמו אינם נמחקים בשחזור - הם נשארים רשומים. | the four restore confirmations |
| רישום סגירת חשבון <id>: לא נקרא | a rescue rebuild that lost a pay entry |

## The owner's rules, and where each one lives

| rule | where |
|---|---|
| One wage calculator | No wage is computed in `payroll.js`. Every figure is `payrollReport`'s row over a period `periodRangeFor` names (`paybookPeriodWage`); a closed period is the artifact `payrollReport` already reads. |
| A weekly man's running account is his open week only | `accountFor(...).running` is the wage of **his own** current period, and 0 once that period is closed. |
| Earlier unclosed periods apart | `accountFor(...).pending` — one row each, never added to `running` or to each other (default 2). |
| Unpaid wage from an earlier closure is its own balance | `accountFor(...).wageDue` and `.unpaid` — «יתרת שכר לתשלום». |
| Advance debt and wage owed: two balances, never netted | `.debt` and `.wageDue` are two fields. No field holds their difference, and the suite checks that none does. |
| The person chooses per advance | `planClosure(..., { allocations: { advanceId: amount } })`. An advance with no answer is a missing answer (`allocation-missing`), not a zero. |
| Never more than is left; never twice | `over-advance`; deterministic ids; `closed` / `statement`; a statement naming one advance twice is refused by its validator. |
| A new advance is never a wage payment | Nothing reads an advance when folding what was paid. Pinned: 1,000 handed over as an advance leaves 3,700 of wage owed and unpaid. |
| Closure never erases debt | What is left stays on the advance (`advanceOutstanding`) and opens the next account (`advanceCarryInto`). |
| Extra deductions | Their own entry kind (`deduction`): amount, reason, date, worker, statement. Never touch an advance. |
| Closure and payment are two facts | `statement` and `payment` are two entries. A payment never edits a statement. |
| Reset deletes nothing; corrections are linked | Append-only; `void` (`pv_<target>`) and `adjustment` (`pa_<statement>_<n>`) stand beside what they correct, reason mandatory. An advance deduction is undone through the ledger's existing `recordEventReversed`, which the fold reads. |
| No destructive migration; ambiguous history to a review list | `planPayMigration` writes nothing. Older closures are `paymentUnknown` until a person answers for one (`planLegacy`). |

## The eight defaults

All in one frozen object at the top of the file, `PAYBOOK_RULES`. Each is one line; the
suite loads the file with each line flipped and shows the behaviour follows.

| # | constant | default | flipped |
|---|---|---|---|
| 1 | `legacyReportFollowsAccounts` | `false` — the weekly-only-open-week rule applies to the new accounts functions; «לפי עובד» is unchanged | **Read by nothing in this phase.** It is the name of the decision; the reports change (Phase 2) reads it. The present behaviour of that report is pinned in Phase 0 of the suite: 3,800. |
| 2 | `earlierUnclosedSummed` | `false` — listed apart as waiting | `running` becomes the sum (the 3,800 again) |
| 3 | `closeWithNothingPaid` | `true` | a closure that names no payment is refused: `unpaid` |
| 4 | `closeBeforeLastDay` | `false` | no `early` refusal |
| 5 | `deductionsMayExceedWage` | `false` — capped, the debt carries | the net may go below zero |
| 6 | `offerLaterDatedAdvances` | `false` — shown, not offered | offered — but **not one line**: `advanceWalk` counts a period from what is dated inside it, so the plan is then refused with `deduction` until `js/model/schema.js` learns the same rule |
| 7 | `trackingFromActivationPeriod` | `true` — tracking starts at each man's period containing the activation day | all history is tracked and no activation is needed |
| 8 | `whoMayClose` | `null` — every account on the allowlist | a list of signers; others get `permission` (client only — a server role is a rules change) |
| + | `unlistedAdvanceMeansZero` | `false` | an advance the person did not answer for is deducted 0. Not one of the eight; it differs from the design note, so it has a name. |

## Data model

A closure stays what it is today. The artifact `ledger.advances.le_period_<worker>_<from>`
and one `ledger.advances.le_close_<advance>_<from>` per advance touched are built by the
existing writers (`recordPeriodArtifact`, `recordPeriodClosed`) on a **copy** of the
schedule. For an oldest-first split the ledger half of a plan is byte for byte what
`closePeriodChanges` writes today (pinned), and today's journal, validators and a reopen
accept a per-advance split (pinned, through `State.commitMany`).

Everything new is one append-only map at the top of the document, one field path per entry:

    schedule.pay = { "<id>": entry }          path: pay.<id>

Common fields: `id`, `kind`, `date` (local day), `at` (ISO moment), `by` (signer), optional
`rev`. Every kind but `opening` carries `workerId`. A field not on the kind's list refuses
the entry — the bar is "this build could have written it".

| kind | id | fields beyond the common ones |
|---|---|---|
| `statement` | `ps_<worker>_<YYYYMMDD from>` | `cycle`, `transition`, `periodFrom`, `periodTo`, `date` = `periodTo`, `artifactId`, `gross` (copied from the artifact), `advanceDeductions [{advanceId, entryId, amount, before, after}]`, `advanceDeducted`, `extraIds`, `extraDeducted`, `netDue`, `wageDueBefore` (information), `debtAfter` (= the artifact's `balanceAfter`), `note?` |
| `deduction` | `pd_<worker>_<YYYYMMDD from>_<n>` | `statementId`, `amount` > 0, `category` (`agreed` / `settlement` / `other`), `reason` (mandatory) |
| `payment` | `pp_<statementId>` for the payment made at the closing; `pp_<random>` for every later one | `statementId` (a statement, or a legacy answer that said "owed"), `amount` > 0, `method?` (`cash` / `transfer`; absent is absent), `note?` |
| `void` | `pv_<targetId>` | `targetId`, `targetKind` (`payment` / `deduction`), `statementId`, `amount` ≤ the target's, `reason` (mandatory) |
| `adjustment` | `pa_<statementId>_<n>` | `statementId`, `delta` (signed, non-zero), `reason` (mandatory) |
| `opening` | `po_open` | `date` — the activation day |
| `legacy` | `pl_<artifactId>` | `artifactId`, `state` (`paid` / `due`), `due` (only when owed; ≤ that closure's net), `note?` |

Amounts are JSON numbers, finite, never negative, at most `ADVANCE_MAX`, and a whole number
of agorot (the same 1e-6 tolerance `advanceAmountProblems` uses). Nothing is coerced:
`"500"` is refused. Every id passes `isSafeId` — `__proto__`, `constructor`, `prototype`,
dots and Firestore's metacharacters are refused before anything is keyed on them.

**Ids are the idempotency keys.** A statement's id is its man and its period's first day,
exactly as the artifact's is, so two phones closing one account write one path. The
payment made at the closing is derived from the statement for the same reason: with a
random id, two phones each closing with «שולם הכול» would record one envelope twice. A
later payment's id is minted by `newPaymentId()` when the form opens, so a double tap, a
retry and a reload carry one id.

**Same fact, or a disagreement.** `paybookSameFact` compares two bodies under one id
without `at`, `by`, `rev` and `wageDueBefore`. Equal: one fact, the first writer stands.
Different: the first still stands and the other is kept under `payConflicted[<id>]` for a
person. Nothing is merged and nothing is chosen between.

## The folds

`paybookFold(schedule)` reads the map once, independent of arrival order:

- entries that fail `payEntryProblems` are **held** (id + reason), never dropped;
- a statement is judged against the record (`paybookStatementProblems`): its artifact is
  there with the same period and gross, each advance deduction is on the ledger with the
  same amount, the ledger holds no deduction for that period the statement omits, every
  extra it names exists and they add up. A statement that fails is held, not folded;
- a deduction no standing statement names, a payment or adjustment whose statement is not
  standing, and a void of nothing are held — a payment that arrived before its statement
  waits there and folds when the statement lands;
- per statement: `owed = netDue + adjustments + voided extra deductions + advance
  deductions reversed in the ledger`; `paid = payments − voided payments`;
  `due = max(0, owed − paid)`; `overpaid = max(0, paid − owed)`. A surplus is **named**,
  never moved into the next wage or an advance.

Statement status, one rule: `review` (overpaid) → `paid` (paid > 0, due 0) → `partial`
(paid > 0) → `closed`.

`accountFor(schedule, worker, today)` — worker status, first match wins:

| status | condition | label |
|---|---|---|
| `review` | something of his is held, contested or over-settled | proposed |
| `waiting` | a period with work and no closure: the current one, or an earlier one inside tracking | «ממתין לסגירה» |
| `partial` / `closed` | his latest statement still owes him: part paid / nothing paid | «שולם חלקית» / «נסגר» |
| `open` | nothing waiting, the latest settled, but an older wage or an advance debt stands | «יתרה פתוחה» |
| `paid` / `closed` | his latest statement, settled (`closed` = net of nothing, no payment) | «שולם» / «נסגר» |
| `none` | no account to speak of | proposed |

A period "has work" when it has an attendance day or a positive wage. (The design note said
"days or an advance"; an advance with no work is a debt, not a period to close.)

## The functions

| function | contract |
|---|---|
| `payEntryProblems(id, value)` | Everything wrong with one `pay` entry, in English; empty means this build could have written it. |
| `paybookFold(schedule)` | `{ opening, statements, legacy, held, conflicts }` — the map, folded; nothing dropped. |
| `accountFor(schedule, worker, today)` | One man's running account: `current`, `running`, `pending`, `beforeTracking`, `advances`, `debt`, `unpaid`, `wageDue`, `wageOverpaid`, `paymentUnknown`, `held`, `conflicts`, `status`. |
| `accountsList(schedule, today, { cycle })` | Every man by his own cycle, roster order, with three totals that are never added together. |
| `planClosure(schedule, worker, { from, to }, choices, { at, by, today })` | Dry run: the review page (`review`), the exact `changes`, the `ids`, an `expects` fingerprint — or `reasons`. |
| `planPayment(schedule, statementId, amount, { paymentId, date, method, note }, stamp)` | One later payment. The same id with the same money is `already: true`, not a refusal. |
| `planVoid(schedule, targetId, { reason, amount, date }, stamp)` | A payment or extra deduction recorded in error; one void per target. |
| `planAdjustment(schedule, statementId, delta, { reason, date }, stamp)` | A closed net that was wrong, stated beside it. |
| `planOpening(schedule, date, stamp)` | The activation day. One entry, one id. |
| `planLegacy(schedule, worker, periodFrom, { state, due, note }, stamp)` | The owner's word on one older closure. |
| `planGroupClosure(schedule, workers, scope, choicesByWorker, stamp)` | One independent plan per man; `outcome` is `write` / `done` / `skip` / `refuse`. |
| `stillValid(schedule, plan)` | Re-plans from the plan's own inputs against the record now. `stale` (+ the fresh refusal), or `done` when it already landed; hands back the fresh plan. |
| `paybookApply(schedule, changes)` | A **new** schedule with the changes laid in by the record's laws: `applied`, `same`, `conflicts`, `refused`. A model of a commit for suites and dry runs — not the write path. |
| `closureHistory(schedule, query)` | Every closure with its full summary, searchable by worker, name, closing day, work period, cycle, payment status. Closures from before statements are included, status `unknown`. |
| `planPayMigration(schedule, today)` | A report: closures with unknown payment, unclosed periods inside / before tracking, each advance and what can be reconstructed, where the two debt folds disagree. `changes: []`. Nothing applies it. |
| `newPaymentId()` | Mints a later payment's id. The one function here that is not deterministic, and nothing else calls it. |

None of them mutates its input (JSON-compared before and after, and re-run on a
deep-frozen schedule), and all but `newPaymentId` give the same output for the same input.

## Refusal codes

Stable strings in `reasons`; every one that applies is reported, not just the first. The
sentence a person reads is Hebrew and the owner's, so none is written here.

**`planClosure`**

| code | meaning |
|---|---|
| `worker` | nobody on the roster by that id |
| `stamp` | no moment, signer or today |
| `gate` | `financialWritingEnabled` is false on this record or build |
| `permission` | rule 8 names who may close, and this signer is not among them |
| `inactive` | tracking was never activated |
| `before-tracking` | the period ended before tracking begins |
| `period` | `[from, to]` is not a period this man is settled on |
| `closed` | this exact period already has a closure |
| `overlap` | a closed period shares a day with it — compared by days |
| `statement` | a statement for this man and period is already in the map |
| `conflict` | an unsettled disagreement on one of his ids |
| `early` | before the period's last day (rule 4) |
| `unpriced` | a worked day has no rate |
| `overpaid` | one of his advances is settled beyond what was given |
| `allocation` | an allocation that is not money, or names an advance that is not his, not open or not offered |
| `allocation-missing` | an open advance with no answer |
| `over-advance` | more than the advance has left — judged against both the balance `closureProblems` will use and the live one |
| `over-wage` | advances + extras exceed the wage (rule 5) |
| `deduction` | the account walk allows less than was chosen — see the next section |
| `clock` | an entry on a touched advance was recorded after this closure's moment |
| `extra` | an extra deduction with no reason, no category or no real amount; or too many |
| `paid` | the paid amount, its day, method or note is not valid |
| `overpay` | more paid than the net |
| `unpaid` | rule 3 flipped, and no payment named |
| `note` | the closure's note is not text |
| `unsafe-id` | an id this closure would mint cannot be a field path |
| `rejected` | the ledger's own writer or judge refused an entry the plan built (never produced by any input in the suite) |

**The others**

| planner | codes |
|---|---|
| `planPayment` | `stamp`, `gate`, `permission`, `target`, `payment-id`, `amount`, `overpay`, `date`, `method`, `note`, `conflict`, `rejected` |
| `planVoid` | `stamp`, `gate`, `permission`, `target`, `reason`, `amount`, `over-target`, `date`, `voided`, `rejected` |
| `planAdjustment` | `stamp`, `gate`, `permission`, `target`, `delta`, `reason`, `below-zero`, `date`, `rejected` |
| `planOpening` | `stamp`, `gate`, `permission`, `date`, `opened` |
| `planLegacy` | `stamp`, `gate`, `permission`, `target`, `state`, `due`, `note`, `answered`, `rejected` |
| `planGroupClosure` | per man: `planClosure`'s codes, plus `cycle` and `twice` on a skip |
| `stillValid` | `stale` (followed by the fresh plan's codes), `done` |

## Where the audit and the design were wrong

Verified first: probes 1 and 2 reproduce on `bd59a68` to the figure (3,800 on the fortnight
row; 500 + 200 oldest-first; the same-Friday hole; a hand-built 300/200/200 accepted and
reopened clean). Probe 3 (sync) was not re-run — nothing in this phase touches sync.
`docs/architecture.md:75` does still say the ledger is off, as the audit noted; it is not.

1. **Two folds disagree about an advance whose own period was never closed, and neither
   document says so.** `advanceOutstanding` — "the one answer" — says 500 is left, because
   nothing was recorded against it. `advanceWalk` has already counted it as taken from the
   wage of the fortnight it was given in, so `advanceCarryInto` answers 0, and
   `advanceAccount` refuses any chosen deduction of it later. Measured on unchanged code:
   the existing dialog refuses (`deduction`), and so does the new planner — it cannot plan
   around it, because the artifact's `carriedIn`, `net` and `balanceAfter` are the walk's
   and a deduction the walk does not know opens the next period on a negative balance.
   Both figures are on the review (`left` per advance, `walkRoom` for the closure), and
   `planPayMigration(...).debtDisagreements` lists every man it affects. **Until this is
   decided, "deduct an old advance later" does not work for advances from periods nobody
   closed.** Pinned in Phase 0.
2. **A partial deduction shuts the financial gate on a record with no carry approval.**
   The audit says a hand-chosen split is accepted; it is — and then `planAdvanceCarry`
   sees a fortnight whose deduction is not the advance given in it, `planCarryMigration`
   becomes `needed`, and `financialWritingEnabled` answers false until `cm_carry` is
   approved. Existing behaviour, pinned in Phase 0. A record approved once stays approved;
   whether the real record is must be checked before Phase 2.
3. **A random id for every payment loses the payment made at closing.** Two phones closing
   one account, each with a paid amount, are one statement and two payments. Built with a
   derived id (`pp_<statementId>`) for that one payment.
4. **"Advances not listed = 0"** contradicts the owner's own words. Built as a missing
   answer (`allocation-missing`), one constant to flip.
5. **`wageDueBefore` cannot be compared as money.** Two phones with the same choices can
   honestly differ on it; with `sameLedgerFact` as designed, an agreed statement would be
   held as a conflict. It is excluded from the comparison.
6. **The opening is a day, not a Friday.** "The period containing activation" is a
   different window for a weekly and a fortnightly man; the entry stores the day and each
   man's tracking start is derived from it.
7. **The design's Phase 0 loaded the file in `index.html`, `sw.js` and the harness.** This
   phase ships nothing: the suite loads the file itself, and `tests/build.test.mjs` passes
   untouched with an un-shipped file in `js/model/` (it reads only what the page loads).
8. **The design's Phase 1 changed six protected files.** None is touched here; what each
   needs is listed below.
9. **`statement.debtAfter` is the period's debt, not all of it.** It equals the artifact's
   `balanceAfter`, which excludes advances dated after the period. The review carries the
   live total separately.

## The gap table, brought up to date

"Model" means: exists as a pure function with a passing check. Nothing is on a screen.

| # | owner's rule | on `bd59a68` | after this phase |
|---|---|---|---|
| 1a | one accounts list, per-worker cycle, filter | partial | **model**: `accountsList` |
| 1b | weekly man shows only his open week | contradicts (3,800) | **model**: `accountFor` → 2,000. The existing report is unchanged and pinned at 3,800. |
| 1c | biweekly shows his fortnight | true | true; **model** agrees: 4,400 |
| 1d | closed wages never return to the running account | partial | **model**: `running` is 0 once closed; the closed wage is a statement |
| 1e | unpaid wage from an earlier closure, apart | absent | **model**: `wageDue`, `unpaid` |
| 1f | existing week / fortnight definitions | true | unchanged; `periodRangeFor` only |
| 2 | review page, final confirm, opening closes nothing | partial | **model**: `planClosure(...).review` + `changes`; `stillValid` at confirm. No page. |
| 3a | advance: id, date, original, deducted, remaining, each deduction | true | unchanged; surfaced in `closureHistory` |
| 3b | choose per advance | partial (one total, oldest first) | **model**; blocked for advances from never-closed periods (finding 1) |
| 3c | never delete an advance / change its date | partial | unchanged. The new planners write no `corrected` and no removal; `removeAdvance` and `recordAdvanceCorrected` still exist. |
| 3d | never over-deduct, never twice, debt survives | true | true; **model** adds the live-balance cap and closes the same-Friday hole in the planner |
| 3e | a new advance is never a wage payment | true | **model**: pinned |
| 3f | safe migration of old advances | exists | **model**: `planPayMigration` reports what can and cannot be reconstructed |
| 4 | extra deductions | absent | **model** |
| 5 | payment apart from closure; later payment; no netting | absent | **model** |
| 6 | group closure | absent | **model**: `planGroupClosure`. No work list, no draft storage. |
| 7 | reset deletes nothing | true | true; pinned for the new entries too |
| 8 | history, search, no silent edit, linked corrections | partial | **model**: `closureHistory`, `planVoid`, `planAdjustment` |
| 9 | safety and concurrency | see audit A6 | **model only**: ids, same-fact, conflict kept beside, `stillValid`. No server-first write, no intent, no rule. |
| 10 | break nothing; one wage source; review list | true as architecture | no shipped file changed; agreement with the old model on old data is pinned |
| 11 | tests | none for payment, extras, group, history | `tests/payroll.test.mjs` |
| 12 | UI | none | none |

Still open on `bd59a68` and **not** fixed by this phase: the same-Friday hole in
`planPeriodClosure` / `closureProblems` (a foreign phone can still deliver such a closure;
only the new planner refuses to write one), and both findings 1 and 2 above.

## What later phases must add

**Brought up to date at Phase 3.** Built since this list was written: the server-first
transaction (as `FarkadSync.transactPaybook`, in `js/sync/transact.js`), the rules
(`protocol >= 2`, the pay map append-only on the server, `closed/`), finding 1 in
`js/model/schema.js` (behind the gate), and the split's first half (the copy at birth).
Still missing: everything in [What is NOT built](#what-is-not-built-and-why-the-gate-stays-shut),
a way to settle a disagreement, the stale status line, the same-Friday hole in
`js/model/ledger.js`, and the UI. "Healing a cloud that lost the pay book" is answered by
the rules: under them it cannot lose one. The list below is as Phase 2 left it.

**The document's size, before anything else.** See [Capacity](#capacity): closed history
has to leave the live document before the writer opens. A phase of its own.

**Server-first transaction.** `FarkadSync.transact(changes, { opId })` in
`js/sync/send.js`: one Firestore transaction carrying every path of one operation, or
nothing — outside the ordinary flush, so the 296-path cut measured in Phase 2 cannot split
it; offline refuses; a conflict adopts the fresh document and the review is redrawn
(`stillValid` is the model half); a device-local intent for an answer lost in flight.
`State.commitPaybook` is the local half it will call, and is not enough on its own: it
accepts a closure offline, exactly as the existing dialog does.

**Rules.** `firestore.rules`: `protocol >= 2` (which is what turns the rollout rule from a
promise into a refusal), and append-only for `pay` and `ledger.advances` (no changed and no
removed keys on update) — Phase 2 measured that today's rules accept a rewrite, a deletion
and a whole document with no `pay`. The owner's manual publish.

**A way to settle a disagreement, and to see one.** `payConflicted` is on the record and
in the fold and on no screen; the held write has no button. A person has to be able to
say which body is true (the answer is a `void` or an `adjustment` beside the one that
stands, and the retirement of the held operation — `answerHold(opId, 'cloud')`).

**Healing a cloud that lost the pay book.** A phone that holds entries the cloud no longer
has does not send them back (P6). Either the protocol gate makes the cause impossible, or
the receive path re-queues them; not both half-done.

**The stale status line** after a batch settled wholly against the server's copy
(`js/sync/send.js`, the early return in `sendClaimed`): «שולח» over an empty queue until
the next snapshot. Pre-existing; it will be a closing phone's last impression.

**The existing model.** `js/model/ledger.js`: compare overlap by days and stop accepting a
fortnight for a man it is not a period for. `js/model/schema.js`: reconcile `advanceWalk`
with `advanceOutstanding` for unclosed earlier periods (finding 1), which rule 6 needs too.

**UI.** The accounts list, the worker account, the review page, the payment sheet, the
group walk and its drafts, the history — and the answer to default 1 for `js/ui/reports.js`.

**The rollout rule** is no longer a prediction: it is measured against v167, v169 and v171
and written in [The rollout rule](#the-rollout-rule) above. What an older phone shows a
person is unchanged from what was predicted here: it sees the artifact and the `deducted`
entries, so the period is frozen and the advances reduced there, but it shows no extra
deduction, no payment and no wage balance, its "net" for that period ignores extra
deductions, and it can still close a period the old way, offline.

## Hebrew strings

No string is shown by anything in this phase. The five status labels are in the model
(`PAYBOOK_STATUS_LABELS`) and pinned word for word, because they are the owner's own words.
Every other string is **proposed** and needs his word before it is pinned (iron law 6).

| string | source | where |
|---|---|---|
| סגירת חשבון ואיפוס | owner | worker account, primary action |
| יתרת שכר לתשלום | owner | list line, worker account, review |
| סגירת חשבונות עובדים | owner | list, primary action |
| סגירת חשבון דו-שבועי | owner | list, secondary action |
| היסטוריית סגירות חשבון | owner | history entry and title |
| ממתין לסגירה | owner | status `waiting` |
| נסגר | owner | status `closed` |
| שולם | owner | status `paid` |
| שולם חלקית | owner | status `partial` |
| יתרה פתוחה | owner | status `open` |
| סגירת חשבון | owner | titles, history |
| תשלום בפועל | owner | payment action and title |
| עובד שבועי | owner | cycle chip, review header |
| עובד דו-שבועי | owner | cycle chip, review header |
| שבועי / דו־שבועי | existing (`PAY_CYCLE_LABELS`) | filter chips |
| מקדמות פתוחות, נשאר להחזיר, תיקון טעות | existing | reused as they are |
| לבדיקה | proposed | status `review` |
| אין חשבון פתוח | proposed | status `none` |
| נסגר לפני שנרשמו תשלומים - לא ידוע אם שולם | proposed | a closure with payment unknown |
| חשבונות / מקדמות | proposed | the switch on the tab |
| הכול | proposed | filter chip; per-advance chip |
| מקדמות לקיזוז | proposed | review section |
| כמה לקזז מהמקדמה הזאת? | proposed | per-advance field |
| לא נבחר סכום לכל המקדמות | proposed | `allocation-missing` |
| אי אפשר לקזז יותר ממה שנשאר במקדמה | proposed | `over-advance` |
| הניכויים גבוהים מהשכר של התקופה | proposed | `over-wage` |
| מקדמה מתקופה שלא נסגרה - אי אפשר לקזז אותה כאן | proposed | `deduction` |
| מקדמה מאוחרת - תקוזז מהתקופה הבאה | proposed | an advance dated after the period |
| ניכויים נוספים / + ניכוי נוסף | proposed | review section |
| ניכוי מוסכם / הסדר / אחר | proposed | deduction categories |
| סיבת הניכוי | proposed | field label |
| יתרת שכר מסגירות קודמות | proposed | review, read-only |
| שכר התקופה / נטו לתשלום / שולם בפועל / יתרה אחרי הסגירה | proposed | review result |
| שולם הכול / עוד לא שולם | proposed | paid chips |
| אישור סגירה | proposed | review, primary action |
| אי אפשר לסגור לפני היום האחרון של התקופה | proposed | `early` |
| החשבון כבר נסגר | proposed | `closed` / `statement` |
| החשבון השתנה בזמן האישור. לא נשמר דבר. בדוק את הסכומים ואשר שוב. | proposed (today's: «…לא נשמר ניכוי…») | `stale` |
| רשום תשלום | proposed | payment, primary action |
| אי אפשר לרשום תשלום גבוה מהיתרה | proposed | `overpay` |
| כבר נרשם | proposed | `already` |
| שולם יותר מהיתרה - צריך לבדוק | proposed | an overpaid statement |
| ביטול רישום / סיבת הביטול | proposed | void |
| תיקון לסגירה | proposed | adjustment |
| אישור והבא / דלג | proposed | group walk |
| הכן סגירה לנבחרים | proposed | group page |
| נסה שוב לנכשלים | proposed | group results |
| תקופה קודמת שלא נסגרה | proposed | a pending period line |
| לפני תחילת המעקב | proposed | a period before tracking |
| תחילת המעקב | proposed | activation day |
| שולם / נשאר חוב של X ₪ | proposed | the two legacy answers |

## Still the owner's to decide

**Answered on 2026-11-10** - see [What the owner decided](#what-the-owner-decided-2026-11-10):
defaults 1 to 8, and items 9, 10 (the debt stays; built behind the gate), 11 (the carry:
never silently locked - `carry-approval-needed`), 17, 20, 21. What follows is the list as
it stood, kept for the items that are still open: 12 to 16, 18, 19 and 22 to 25.

**New, from Phase 5** - each answerable in one line; what is built is said:

43. A phone keeps every entry of an archived closure (built): the SERVER's document gets
    smaller, the phone's own copy does not. The other way - phones holding only the index
    and fetching the detail when somebody opens it - means teaching every fold of money to
    read the index. Recommended: accept for now, and build the other when a phone's own
    storage is what is running out.
44. A phone that cannot fetch the closed copy of an archived closure does not take the
    server's newer record at all until it can (built): it goes on with the record it has,
    says so, and is not «מסונכרן». The other way is to take it with the sums from the
    index and no detail. Recommended: keep - no screen can then show a closed account as
    open.
45. A closure that is paid in full leaves the live record by itself fourteen days after
    it was closed, three at a time, right after a closure or payment goes through (built),
    and sooner by hand from «ארכיון סגירות». Recommended: fourteen days.
46. Once any closure has been archived, a phone on a build from before the pay book may
    not write at all - not even a day (built in the rules of this branch; measured on
    v167, v171, v172). Before, such a phone could go on recording days. Recommended: keep
    - installed afresh, such a build reads an archived account as never closed.
47. A backup restored into a NEW, EMPTY Firebase project does not put the pay book on
    that server (as built; said in the file and on the screen). Recommended: accept;
    building it means replaying every closure as a transaction of its own.
48. A closure with a «תיקון טעות» against one of its deductions, an overpaid one and a
    disputed one never move (built). Recommended: keep.
49. «לבדיקה» now SHOWS a disagreement - both figures, which one is counted - and cannot
    settle it (built). Settling needs a new linked record. Build it before the gate opens?
    Recommended: yes if restores from files are expected; otherwise after.
50. What is typed into a closure is kept on the phone until the closure goes through, the
    day ends or the account changes (built). Recommended: keep.
51. «נסגר» is marked on the lines of the weekly breakdown («פירוט שבועי») of «לפי עובד»
    (built); the report's main rows are per chosen range, not per week, and are not marked.
    Is that the marking he meant? Recommended: show him the page.
52. A correction made to a closure after it was archived - a void, an adjustment, a later
    payment - stays in the live record for good (built). They are small. Recommended:
    accept.
53. Every proposed string of Phase 5: the four groups at the end of the table in
    [Hebrew in Phase 4](#hebrew-in-phase-4), and the one sentence in
    [Hebrew in Phase 5](#hebrew-in-phase-5).

**New, from Phase 4** - each answerable in one line; what is built is said:

33. The tab's label stays «מקדמות» while its page is «חשבונות עובדים» (built). Rename the
    tab? Recommended: keep it until he has used the screens.
34. At a closure the payment starts at «עוד לא שולם» and he taps «שולם הכול» (built): the
    app never assumes money was handed over. Recommended: keep.
35. No "are you sure?" before «אישור סגירה» (built): the review page is the confirmation.
    Recommended: keep - a closure is corrected by a linked record.
36. The list puts the men who need him first (built) instead of the roster's order.
    Recommended: keep; the alternative is one line.
37. Each advance field is pre-filled with all of it, oldest first, up to the wage (built).
    The alternative is blank fields he must fill. Recommended: keep.
38. A prepared batch closes as «עוד לא שולם» unless he switches the whole batch to «שולם
    הכול», which records cash for every man (built). Recommended: keep the switch.
39. The payment made at the closing is dated today (built); another day is a later
    payment. Recommended: keep.
40. «לא ידוע» on an older closure writes nothing and is asked again after a reload
    (built). Recommended: keep - "unknown" is not an answer to store.
41. While the pay book is open the advances page's «סידור» is not reachable (built).
    Recommended: accept; the accounts list has its own order.
42. Every proposed string in [Hebrew in Phase 4](#hebrew-in-phase-4).

**New, from Phase 3** - each answerable in one line; the default built or recommended is
said:

26. A closed row whose «late since close» note now appears because of the ruling, not
    because anything arrived late: what should it say? Recommended: no note, only «חוב
    פתוח X ₪».
27. May a closure be attempted while this phone still holds unsent days? Built: no -
    refused (`unsent-work`) until the queue has drained.
28. The carry approval: asked on the spot when first needed (built), or given once
    together with the opening day? Recommended: with the opening day.
29. After the pay book opens, does the old «סגור את החשבון» dialog stay? Recommended: no -
    it writes no statement and goes through the queue.
30. An older phone whose restore the server refuses shows an error and holds later days
    behind it until it is updated (measured). Acceptable? Recommended: yes - the rollout
    order forbids that restore anyway.
31. When do the DAYS of closed months leave the live document, and how far back must the
    invoice reports reach without signal? Recommended: a document per month, after the
    month is closed for everybody and six months old.
32. How long does an index row stay before it folds into a per-man checkpoint?
    Recommended: one year after it is settled.

The eight defaults above, and:

9. Is an advance the person did not answer for a missing answer (built) or a zero?
10. Which of the two folds is a man's debt when an advance comes from a period nobody
    closed — the 500 `advanceOutstanding` says, or the 0 the account walk carries? Until
    it is one answer, such an advance cannot be deducted at a later closure.
11. Has the carry (`cm_carry`) been approved on the real record? If not, the first partial
    deduction locks every financial control until it is.
12. May a later period be closed while an earlier one is still waiting? Built: yes; the
    earlier one stays listed.
13. May a period from before the activation day be closed through the new flow? Built: no
    — the activation day can be chosen earlier instead.
14. One payment at the closing per statement, with a derived id (built), so two phones
    cannot record one envelope twice.
15. One void per entry, whole or part (built). A second correction needs a person.
16. May a legacy closure answered "still owed X" be paid like a statement? Built: yes.
17. The deduction categories (agreed / settlement / other), at most twenty per closure,
    and the payment methods (cash / transfer).
18. A payment may not be dated in the future. Built: refused.
19. The wording for `review`, `none` and "payment unknown", and every other proposed
    string above.

From Phase 2:

20. **How big is the live document today, and how many men are on it?** Everything in
    [Capacity](#capacity) turns on those two numbers, and neither can be read from here.
21. **Where does closed history go** — the split proposed there, or another? Until it is
    answered the writer stays shut.
22. A pay-book disagreement does not stop the phone (built); a ledger one still does. Is
    that the rule he wants, or should a disputed payment also stop recording until looked at?
23. An unreadable pay entry stops the phone until acknowledged, at every open (built, law
    10). The same as the ledger; said here because it is his phones it would stop.
24. The five Hebrew strings added in Phase 2.
25. Whether the stale «שולח» line (pre-existing) is fixed before or with the server-first
    transaction.
