# What has actually been served

One line per build that reached `main`, newest first. `main` is what the live site
deploys, so a build is not released until it is here — a branch full of verified work is
not a release, it is a cost.

Each entry says what changed, what was checked before it went, and anything the build is
known NOT to cover. The last of those is the point of the file: a release note that lists
only what works is a sales page.

Every count below names the commit it was measured on. A count carried over from another
commit is worse than no count at all, so a build whose run was not written down at the
time says so rather than borrowing a neighbour's.

**`main` is at v86 (`880d7bb`).** The four builds at the top of this file are candidates
on a branch: verified, stamped, and NOT served. They are here so that the day one of them
reaches `main` the entry already exists and only its heading has to change.

---

## v95 — CANDIDATE, not served — the tip of `cd-work`

v94 reviewed a second time and repaired a second time: the seven findings of
`features/core-repairs/findings-round2.md` (one P1 - the create race's loser replacing the
winner's day on a project with no document yet - four P2, two P3), each a fail-first test
followed by its fix and each verified again before merging (`27549c5` the send path,
`6303660` the poison doors, `cabcb27` the chip and this file). Nothing on a phone runs it.

**What it would give the crew that v94 does not have**

- Two phones' first-ever evening on a new project, same worker, same day: the second
  phone's half is held and said, not written over the first's.
- A phone whose cloud listener has died never says «מסונכרן» on the strength of its own
  writes; it says so, resubscribes on its own ladder, and is synced only when a listener
  delivers again.
- A poisoned map in the cloud document is one sighting, not a new one at every sibling
  edit: the phone that acknowledged it keeps adopting the crew's work on that day.
- The rescue door reads a file without holding the phone for it; the hold is raised only
  once the person has confirmed and the rescue is on the disk.
- A poisoned snapshot acknowledged mid-session is adopted then and there, not at the next
  change in the cloud.
- The chip beside the app's name says «דורש הכרעה» for a held edit and «הסנכרון מושהה»
  for a suspended sync, instead of «ממתין לשליחה» for both.

**Checked before it was stamped**: the release gate ran on this commit; the counts, per
suite and verbatim, are in `features/core-repairs/handoff.md` beside the commit they were
measured on. No number is copied here.

**What this build is NOT known to do**: everything v94 lists below, unchanged - above all,
no iPhone has run it.

---

## v94 — CANDIDATE, not served — `9f11abf`

The compact day of v93 with the core repaired underneath it: two review rounds, the
first fixed, the second found. Nothing on a phone runs it.

**What it would give the crew that v93 does not have**

The fifteen findings of `features/core-repairs/findings.md`, reviewed at `c744d49` and
each fixed as a fail-first test followed by the fix (`120c8a8` the send path, `6979fcf`
the receipt path, `958a21d` the poison doors, `e25cbcb` the documentation):

- An edit queued before the session heard the cloud - a phone opened offline - is no
  longer sent over another phone's newer value with both phones saying synced. Every
  `days.`/`ledger.` operation now carries what the device had seen at that path in the
  same verified write as the operation, and the pre-send question is asked per path,
  not of the whole document's last writer. Two phones recording the same worker on the
  same day offline, the second coming back later, end in a hold, not a silent replace.
- A hold decided before the send says so: status `contested` and its line, instead of
  «מחובר. יש רישומים שעדיין נשלחים.» for ever with nothing sending.
- A retry answered from its receipt re-adopts the snapshot, so a correction made
  meanwhile by another phone is taken; a replay that empties the queue says synced
  instead of keeping the last error; the loser of a create race whose snapshot arrived
  late merges without a sync error.
- Evidence of an unreadable record is kept under its own key: `__proto__` evidence
  survives a reopen, one quarantine copy is made rather than one per open (the device
  no longer becomes unwritable after twenty opens with a false "no room"), a non-date
  key in the `days` map is held and reported instead of dropped, a poisoned layer
  arriving again is not reparented, an acknowledged record is not an error on every
  snapshot, and a restore file carrying a poisoned map is refused at the door with its
  own sentence instead of putting the DEVICE into recovery hold. The rescue door still
  opens a held phone's own file; only a replacement is refused for it.

**Checked**, at `9f11abf`, the whole release gate from the `farkad-work` worktree on
Node v22.22.2 (`.gate-release.log` in that worktree, 00:06:59-00:22:19, exit 0):

| suite | |
|---|---|
| `npm test`, the 36 node suites | 3602/3602 |
| the 8 browser suites (smoke 1041, print 65, mobile 671, update 30, recovery-browser 25, handover 26, swrestart 31, swidentity 55) | 1944/1944 |
| sendclaim | 43/43 |
| the 5 emulator suites (rules 59, cas-emulator 24, rollout 17, bootstrap 23, bootstrap-rules 28) | 151/151 |
| the whole gate, 50 suites | 5740/5740 |

This is the first time the browser and emulator halves were run on the compact day; the
v93 entry below still says its browser half is unmeasured, and that is still true of
`10a40a5` itself.

**What this build is NOT known to do**

- **It is not on `main`.** No phone has it, and none of the above is a release.
- **The second review, at `9f11abf`, found seven things**
  (`features/core-repairs/findings-round2.md`), none refuted, and they are live at that
  commit - the 5740 above were measured WITH them: the loser of a create race whose
  document already exists sends its queued patch as an ordinary update without asking
  the pre-send question of the document it just read, so the winner's day is replaced
  on every phone with both synced (P1); a phone whose snapshot listener has died says
  «מסונכרן» after its next successful send (P2); a poison sighting's identity is the
  bytes of the whole map, so every sibling edit by any phone is a new sighting and the
  phone never adopts the other phones' work on that day (P2); the rescue door holds the
  READING phone for a file it only previewed, and on cancel it stays held (P2); a
  poisoned snapshot acknowledged mid-session is not re-adopted until the cloud changes
  again (P3); the chip beside the app's name reads the queue count before the sentence,
  so a contested hold is labelled «ממתין לשליחה», never «דורש הכרעה» (P2); and this
  file had no v94 entry (P3). The round-two fixes are NOT in the count above; each
  ships as its own fail-first pair and is measured where it lands.
- Everything in the v93 and v91 entries below that the fixes above do not name still
  holds - the vehicles gate, the ledger gate, the iPhone that has never run it.

## v93 — CANDIDATE, not served — `10a40a5`

The v91 core repair with the compact day on top of it; the base v94 was repaired from.
Nothing on a phone runs it.

**What it would give the crew that v91 does not have**

- The day screen stops spending the top third of a phone on chrome. On first open, with
  the account warning showing and both bottom bars in place, seven whole names fit at
  430×932, five at 390×844, three at 320×667; before, four names were what was left of a
  30-man crew at 430px and at 320px the first name started under the dock.
- The account warning folds to one strong line; the full sentences with the dates are one
  tap down and still in the DOM. The progress count "נרשמו X מתוך Y" is itself the way to
  the next unrecorded man, so the separate המשך row is gone. The bulk fold's button sits at
  the end of the switcher row. A sync chip beside the name repeats the status line's own
  words and never composes its own.
- The mobile suite "the list starts high" holds every piece of chrome to the height it was
  given, so the count of visible names cannot drift back down a pixel at a time.

No data, sync, ledger or pricing code is touched by the compact day; everything under it
is v91's.

**Checked**, at `10a40a5`, from the `fix/docs` worktree on Node v22.22.2:

| suite | |
|---|---|
| `npm test`, the 36 node suites | 3493/3493 |
| data, at seeds 1, 42 and 2026 | 1943/1943 every time |
| sendclaim | 43/43 |

The browser suites were re-pinned by the compact-day commit itself (two smoke taps on
"המשך (N)" now tap the count; the folded bulk row is measured at 0px) and their counts at
`10a40a5` were not written down in any commit. Until they are, treat the browser half of
this build as unmeasured, not as green.

**What this build is NOT known to do**

- Everything in the v91 entry below still holds; the compact day changes none of it.
- **It has never run on an iPhone.** The seven/five/three names were counted in headless
  Chromium at those viewports.

## v91 — CANDIDATE, not served — `cf8b9e5`, core repaired through `c744d49`

The core-repair line, built on v86. Between v86 and this stamp the branch carried v87
(`aca2abe`), v88 (`1ce31d5`) and v89 (`5fd4d1e`), none of which was served either; v90 and
v92 are the ledger-enable branch's numbers, skipped here deliberately so one number never
names two trees.

**What it would give the crew that v86 does not have**

- An update no longer mixes two builds in one window. `clients.claim()` used to take every
  window of the origin and hand a page still running the old scripts the new build's
  bytes for everything it asked for next - new sync layer, old page, one session. The
  worker now knows which windows it handed a page to, serves each its own build's cache,
  and reaps the old cache only when nothing is running it (v87).
- The workbook comes off this origin. SheetJS was fetched from a CDN at export time, and
  in the van at the end of a fortnight - offline all day - the bookkeeper got three CSVs
  under different names instead of one workbook. `vendor/xlsx-0.18.5.min.js` is in the
  service-worker shell now, 860K paid once per build (v88).
- A part of the ledger container this build has never heard of is carried, not written
  over by the next ordinary save (v89). The next build adds `ledger.migrations` - a
  person's approval of a financial migration - and a v86 phone sharing the record would
  have deleted that approval on every save.
- The sync protocol: `protocol`/`revision`/`lastOpId`, immutable receipts, a conflict that
  carries the authoritative document, rebase-if-uncontested and hold-if-contested. A write
  that lost a race is held on the disk until a person decides, and no trigger resends it.
  A receipt names the operation, not just the revision it reached. The bootstrap may not
  carry business data, and `firestore.rules` now says so. See `docs/sync-protocol.md`.
- A name that would land on a prototype - `__proto__`, `constructor`, `prototype` - is not
  a legal id through any door; the whole ledger container survives a snapshot; one
  immutable id arriving with two bodies is a disagreement a person is told about.
- The twelve suites written against v86 before any fix (`a63bc48`, 51 red checks) are
  green: the restore over an older build's queue, retirement by operation across two tabs,
  statements that say how the money moved, the write counter that only moves for keys the
  rescue file carries, לתשלום reconciling with נצבר less מקדמות, the advance's method
  recorded through the mirror, a restore stamped with another schema version caught, the
  retired identity scheme's orphans, and three assertions that could not fail.
- The way out of the assign sheet stays on the screen at 200% text, and the 200% pass now
  actually doubles the text it measures.
- Four gates shut: `permanentDeletion`, `vehicles`, `carryAdvances` and `LEDGER_WRITES`
  are all false. The vehicles feature of v83 is retired behind its flag because the owner
  cancelled it: nothing is drawn, nothing is computed, nothing is written, and every stored
  vehicle byte survives every door.

**Checked**

At `cf8b9e5`, from one clean detached worktree (`2f6b6dc` is the commit that wrote it
down): `npm test` 35 suites 3429/3429; `npm run test:release` 49 suites 5516/5516, zero
skipped; `data.test.mjs` at seeds 1, 42, 2026 and 42 again, 1943/1943 every time.

At `c744d49`, from a clean detached worktree on Node v22.22.2: `npm test` 36 suites
3493/3493; `npm run test:emulator` 5 suites 151/151. The 36th suite is
`tests/snapshot.poison.test.mjs`, which arrived with the poisoned-name repair.

**What this build is NOT known to do**

- **It is not on `main`.** No phone has it, and none of the above is a release.
- **The core review at `c744d49` found fifteen things, thirteen of them in code**, and
  they are live at that commit: an edit queued before the session's first snapshot
  records `base: null`, which the pre-send hold exempts, so a stale value can be accepted
  over another phone's newer one and both phones say synced (P1); "someone else wrote it"
  is decided on the whole document's `updatedBy`, not per path; a pre-send hold sets no
  status, so the line says «יש רישומים שעדיין נשלחים» indefinitely; a replayed write
  never re-adopts the snapshot it missed; evidence held under `__proto__` is dropped at
  reopen; twenty reopens of a device holding an unreadable record exhaust the quarantine
  slots and leave it unwritable with a false "no room". They are being fixed as pairs of
  commits, fail-first then fix, on top of this stamp.
- **It has never run on an iPhone.** The handover was proved between two real trees in
  Chromium; on iOS an installed app is resumed rather than reopened, which is where the
  handover is at its most awkward.
- **The catch-up runs in the window, and the window runs the OLD build.** No v91 can make
  a v86 page reload itself. A v86 window stays a coherent v86 session for the whole of
  its life and crosses on its next open; `tests/handover.test.mjs` says so instead of
  pretending.
- **The vendored SheetJS 0.18.5 carries CVE-2023-30533 in its parsing path.** The app
  never parses a workbook - `book_new`, `aoa_to_sheet`, `book_append_sheet`, `write` and
  nothing else - so the path is unreachable from anything a person can do here; it is
  written down so whoever raises the version knows which half the tests cover.
- **The device still fills up**, and CSV still cannot carry a direction.

---

## v86 — 28 August 2026 — `880d7bb`

One commit on `main`, on top of v85. The last build served.

**What the crew gets that v85 did not have**

- **A client's report leaves the crew out of it.** Both reports live in the document at
  once and the one not being looked at carried `.report-offscreen`, which was hidden under
  `@media screen` ONLY. So selecting a client's report and pressing print produced a
  two-page PDF: the client's page, and behind it the entire payroll - every name, every
  daily rate, the gross, the advances and the net - in a file that goes to the client.
  Measured, not reasoned about: a PDF built through the app's own route came back carrying
  both names and the daily rate 777. The rule is unconditional now, and the print block
  restates it by name.
- The privacy test that existed to catch exactly this had searched only the pages already
  classified as invoice pages, and the leaked page was a payroll page. The new one reads
  every page of the document and fails on a worker's name, the payroll's title, a daily
  rate, an advance, the totals wording, or the detail dialog that was open when print was
  pressed - in both directions.

**Checked before it went**, at `880d7bb`: build 18/18, data 1883/1883, smoke 1021/1021,
mobile 389/389, print 63/63, update 25/25. Putting the screen-only rule back turns five of
the print checks red.

**What this build is NOT known to do**

- **Firestore rules were not re-run for v80 through v86.** `firestore.rules` is byte-for-byte
  what v79 shipped with, and the 34/34 at `94d5a84` is the last run written down for a
  served build.
- **It has never run on an iPhone**, though one iPhone has been at it: the reorder scroll
  in v81 was found on a real phone, and every fix since was measured in Chromium.
- **What twelve suites written against it found**, at `a63bc48` on the repair branch,
  51 red checks before any fix: a restore leaves an older build's legacy item in the slot
  record; a restore goes out while another tab holds the right to send; statements and
  exports do not say how the money moved; a day at a site the roster has lost is not
  billed; the write counter moves for keys the recovery file does not carry, so a second
  tab makes every snapshot read unstable; the לתשלום column does not reconcile with נצבר
  less מקדמות, and a sub-shekel advance breaks the row it is on; the ledger mirror does not
  record how an advance was handed over; a restore stamped with another schema version is
  not caught; a v71 companion outlives its replacement; and renaming, archiving or marking
  a vehicle as stayed-in is not inert while the feature is off.
- **An update mixes two builds in one window.** Found at `aca2abe`: after the handover a
  window still executing the old scripts is served the new build's bytes for everything it
  asks for next. It has been so for every build in this file; the first fix is v87, not
  served.
- **The export needs a signal.** SheetJS is fetched from cdnjs at export time; offline,
  the bookkeeper gets three CSVs instead of one workbook. The first fix is v88, not served.
- **A part of the ledger container this build does not name is dropped on save**
  (`5fd4d1e`). Nothing writes such a part yet, so nothing has been lost yet.
- **Vehicles are live and their default moves money.** An evening with nothing said about
  vehicles means they all went out, so a silent Tuesday adds three hundred shekels to an
  owner's pay by itself. The owner has since cancelled the feature; the retirement is on
  the branch, not here.
- **The device still fills up**, and CSV still cannot carry a direction.

## v85 — 28 August 2026 — `03bf814`

Thirty-one commits from the design pass's third wave, merged onto `main`. Four conflicts,
none a disagreement: three were the build markers and the fourth was the data suite where
each side had appended its own block, needing the first block's closing brace written back.

**What the crew gets that v84 did not have**

- The site report answers the screen's question in bars, and paper keeps the grid.
- The v80 record - היסטוריה מלאה - is readable, and can be closed by hand.
- The worker's own screen says what the record holds against his name; an archived row says
  what he left with and one tap puts him back; the phone field says who already has that
  number while it is typed; the detail modal shows WHICH dates the count is made of; the pay
  card leads with נותר לתשלום on a phone.
- Reorder mode has a screen of its own, and an Escape that answered the question does not
  re-ask it.
- `docs/architecture.md` and `tests/README.md` arrive: the deeper walk, and what each suite
  proves.

**Checked before it went**, at `03bf814`: build 18/18, data 1883/1883, mobile 389/389,
smoke 1021/1021, print 54/54, update 25/25.

**What this build is NOT known to do**

- **Printing a client's report prints the payroll behind it.** Found and measured at
  `880d7bb`, the next build: the client's PDF carries every worker's name and rate on page
  two. This is true of v80 through v85.
- Everything listed under v86, apart from the print leak, which v86 fixes.

## v84 — 28 August 2026 — `9ef68fd`

One commit on `main`.

**What the crew gets that v83 did not have**

- The seder goes to the man driving to one site, not to everybody. The message went out as
  the whole evening - five sites, everybody - to a man who can act on one gate; sending him
  all of them is how somebody reads the wrong line and turns up at the wrong place. Each
  site card carries its own send button once there is somebody to name. Who is away is left
  out of a one-site message: an absence is a fact about the crew, not about a gate.
- The site the message is about is remembered while the dialog is open, so changing the
  wording cannot quietly widen a one-site message back out to five.

**Checked before it went**, at `9ef68fd`: build 18/18, data 1878/1878, smoke 969/969,
mobile 358/358, print 54/54, update 25/25.

**What this build is NOT known to do**: everything listed under v85 and v86.

## v83 — 28 August 2026 — `7bf6860`

One commit on `main`.

**What the crew gets that v82 did not have**

- The crew's vehicles, and what they are owed for. A vehicle earns a flat three hundred for
  a day it went out, paid to whoever OWNS it, whether or not he was on a site himself. An
  ordinary evening writes nothing: the default is that they all went out, and only the
  exception is stored. The rate lives in a short history on the vehicle, each entry what it
  was worth from that date onward, so a raise does not repay last month, and a vehicle added
  today does not earn for months already closed.
- A day nobody worked is not a day five vehicles earned; the count follows real work.
- A man who worked nowhere but whose vehicle went out now has a row on the pay sheet.

**Checked before it went**, at `7bf6860`: build 18/18, data 1878/1878, smoke 963/963,
mobile 358/358, print 54/54, update 25/25. Firestore needed nothing: the rules ask `hasAll`,
not `hasOnly`, so the new field travels as it is - and they were not re-run.

**What this build is NOT known to do**

- **The silent default moves money.** The three-hundred-a-day default is the reason the
  feature was later retired rather than left running: a day nobody said anything about is a
  day somebody was paid. Known from the retirement on the branch, not at release.
- Everything listed under v85 and v86.

## v82 — 28 August 2026 — `c942723`

Three commits from the design pass, merged onto `main`. One conflict, not a disagreement.

**What the crew gets that v81 did not have**

- The week cell says its day once instead of twice.
- The ask dialog is held to the same 44px target floor as the rest.
- The day screen's header is one box rather than three stacked ones.

**Checked before it went**, at `c942723`: build 18/18, data 1852/1852, mobile 358/358,
print 54/54, smoke 948/948, update 25/25.

**What this build is NOT known to do**: everything listed under v85 and v86.

## v81 — 28 August 2026 — `3560444`

One commit on `main`, from the first report off a real phone.

**What the crew gets that v80 did not have**

- A finger can scroll the list it is looking at. Reorder mode could not be scrolled past
  the fifth man of twenty-one on an iPhone: `touch-action: none` was on the whole row, and
  in this mode the rows ARE the screen. The handle carries the rule, the row never needed
  it. Invisible to every assertion in the repository and to a mouse, which is why it took a
  phone to find; there is now a check at every width that no row blocks panning, that the
  handle still does, and that the last man and the save button can be reached.

**Checked before it went**, at `3560444`: mobile 356/356, smoke 947/947, print 54/54,
build 18/18, update 25/25.

**What this build is NOT known to do**: everything listed under v85 and v86.

## v80 — 28 August 2026 — `f645751`

Eleven commits from `claude/farkad-mobile-design-review-odl8ue` merged onto `main`, on top
of the ledger groundwork (`ee3e9ed`) and the adversarial round (`c6fc85d`). Three conflicts,
one of them a real disagreement: the design pass set the bottom bar's labels to 11px, under
the 12px floor that had gone in the day before. The bolder weight is kept; the size is not,
and the assertion that holds it is in the mobile suite at every width.

**What the crew gets that v79 did not have**

- **The advances ledger, read-only.** An advance used to be a record that every change
  MUTATED: corrected from 500 to 300 on the 12th, nothing anywhere said 500 was ever written
  down, or by whom, or when. Now there are entries - given, corrected, cancelled - never
  rewritten and never removed, and what the screens read is a fold over them. This build
  ships the READER and the MIGRATION and writes nothing new: `LEDGER_WRITES` is false
  because a v79 phone has never heard of an entry, and a v80 phone that stopped writing the
  old field would record money the other two cannot see. The boot mirrors every existing
  advance into the ledger once, with a deterministic id, and leaves `schedule.advances`
  byte-identical. Settings answers whether the ledger agrees with the field it was built
  from, in three registers: agreement, merely behind, genuine disagreement.
- The advance form validates to the wire's own standard. `Infinity` and a typed
  `2026-13-45` used to pass commit and quarantine the entire record on the next launch;
  amounts are whole shekels with Arabic-Indic digits normalised, and the date is clamped to
  the account containing TODAY - the viewed-range clamp filed live cash into a fortnight
  printed weeks ago.
- The copy-undo was dead code - the snapshot ran after the mutation - and now works.
- The totals stop asserting what they do not know: no equation over unpriced overtime, the
  money cell answers from the days' own stamps.
- The client's file carries the client's numbers and the pay sheet shows its working;
  הגדרות וכלים grows into six rooms; every state banner tells the truth in its own colour;
  one solid dock; a displaced ask dialog resolves as a dismissal instead of hanging its
  caller; the WhatsApp button is no longer the thing a quarantined phone had disabled.

**Checked before it went**, at `f645751`: build 18/18, data 1852/1852, mobile 350/350,
print 54/54, smoke 947/947, update 25/25.

**What this build is NOT known to do**

- **The ledger has been proved against no real data.** Whether the fold agrees with the
  old field on a live record after a few weeks is the question the parity line exists to
  answer, and it had not been asked when this went out.
- **Reorder mode cannot be scrolled past the fifth man** on a real iPhone. Found the same
  day; fixed in v81.
- Everything listed under v85 and v86.

---


## v79 — 28 August 2026 — `94d5a84`

Sixteen commits, fast-forwarded from `claude/farkad-mobile-workers-v79`, so what is on
`main` is exactly the tree that was verified. The previous build on `main` was v78
(`1dec586`).

**What the crew gets that v78 did not have**

- The phone screen rebuilt around the hand holding it: the day's work reachable with a
  thumb, 44px targets, the home indicator cleared, the sticky headers dropped on a short
  landscape screen where they used to cover the last man in the list.
- Printing that prints the report and nothing else. An open dialog used to print over the
  pay sheet and produce grey pages; now every overlay, bar and dock is excluded by
  default, without the person having to close anything first.
- A worker's history is proved before he can be deleted, and his lifecycle is safe across
  two phones editing at once.
- Nothing off this origin sits between a person and their own data: the export library is
  fetched after the app is running, never before it draws.
- The device says it is filling up while there is still room to act, instead of at the
  moment a tap is refused.
- The bookkeeper's file: a name opening with `=` or `-` is a name and not a formula, and
  the workbook opens right to left the way it reads.
- Zoom, which the app used to refuse, is the reader's to use.

**Checked before it went**, from a clean clone at `94d5a84` on Node v22.22.2:

| suite | |
|---|---|
| build | 18/18 |
| data | 1794/1794, and the same at seeds 1, 42, 2026 and 42 again |
| print / PDF | 54/54 |
| mobile layouts | 278/278 |
| smoke | 902/902, twice |
| update path | 25/25 |
| Firestore rules | 34/34, against a local emulator |

`git diff --check` clean, all 40 tracked JS/MJS files syntax-checked.

**What this build is NOT known to do**

- **It has never run on an iPhone.** Every layout, print and update assertion was measured
  in headless Chromium. That is the right tool for layout arithmetic and it is not a
  phone: an installed app on iOS is resumed rather than reopened, and the update handover
  is at its most awkward exactly there.
- **The update banner was proved against a real deploy, in Chromium.** If a phone sits on
  v78 without offering the banner, Settings has a manual check that asks the server
  directly.
- **The device still fills up.** It now warns first - at about two years of records for a
  crew of thirty - but the ceiling itself is not gone.
- **CSV cannot carry a direction.** The xlsx export opens right to left; the CSV fallback,
  used when the export library cannot be reached, is at the mercy of whatever opens it.
