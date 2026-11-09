# פרקד — vehicle dispatch (הסעות): what exists, the architecture, the plan

**Status, 2026-11-09: phase 1 is built as the v171 candidate** (`js/model/transport.js`,
`js/ui/transport.js`, `tests/transport.test.mjs`, `tests/transport.browser.mjs`;
`docs/releases.md`, v171). It is on no phone. This document is the design it was built from,
brought up to date with the owner's answers; where the build differs from the first proposal,
§0 says how, and the sections below have been corrected to match.

## 0. The owner's decisions (2026-11-09), and what the build did with them

| question (§9) | his answer | in the build |
|---|---|---|
| The seven vehicles | Right. The 9-seater is a Volkswagen: 9 seats, 2 in front (the driver one of them), then rows of 2, 2 and 3. Five-seaters: 2 front, 3 rear | Seeded once as `tv_01`…`tv_07`; the Volkswagen carries `rows: [2,2,2,3]`. He maintains the list himself: add, rename, seats, retire |
| Who may drive | He decides per worker, and which vehicles | Per-worker `canDrive` and `drives` in this phone's transport settings - not roster fields |
| Pickup areas | Each worker has ONE fixed area; the list is his | The list starts EMPTY; a man with no area yet is planned for all the same (the engine treats "no area" as one more group) |
| Drivers | A driver is a worker on the roster and leaves from his own home | A trip's pickup area starts as its driver's. Only a man working that day is offered as a driver |
| Which ride | Morning only. No return | No return trip anywhere in the model |
| «ממתין» | Removed | Statuses are רכב פרטי / נוסע עם קבלן אחר / אחר, plus the default (rides with us). A stored `waiting` is dropped on read |
| Who sees the plan | First on his phone only, local, no cloud. The other phones later, in a separate approved step | Architecture B, phases 1 and 2 only. No sync, no rules change, nothing in the schedule document, outbox, journal, backup, restore point or rescue file |
| Wording | Blanket approval of professional wording; not to be asked string by string | All strings in one block, pinned in a node test, listed in `docs/releases.md` as proposed |

Where the build differs from the proposal that follows:

- **No `FARKAD_FLAGS.transport`.** The proposal had a code flag plus a per-device switch. The
  build has only the switch (`farkadTransport:enabled`): a flag is the same on all three
  phones, and the requirement is that it is not. Nothing unfinished is reachable either way -
  the switch is off by default.
- **Keys.** `farkadTransport:settings` (not `:config`), vehicles and areas as ordered arrays;
  the marks live in the day record (`marks`), not in a separate progress key.
- **Unreadable records** are copied to `<key>:unreadable` (not `farkadTransport:damaged:<n>`),
  and the screen starts empty and says so rather than going read-only - unless the copy could
  not be kept, in which case nothing is written over the bytes.
- **Retention** is by date: day records older than 35 days are removed when the panel opens.
- **The driver list and the message are on the page, not in dialogs**: the list opens inside
  the vehicle's card, the message is on the driver's card with its link. Accepting and the
  list editing use the app's own questions (`js/ui/ask.js`).
- **A man on two sites that day** rides to the first site his day holds; the second is said on
  his card («רשום היום גם ב… ההסעה לאתר הראשון.») and not routed.
- **Tests** are two files, not five: `tests/transport.test.mjs` (engine, words, message,
  store isolation, the switch) and `tests/transport.browser.mjs`.

What follows was written before the build ("Everything in this folder is a proposal") and
is kept as the reasoning; read it with the table above.

---

## 1. What exists today

### 1.1 The dormant feature is vehicle-owner PAY, not dispatch

The repo's "vehicles" is not a transport planner. It pays the OWNER of a vehicle a flat amount for
each day the vehicle went out, and it is wired into payroll.

| fact | where |
|---|---|
| The gate: `vehicles: false` in `FARKAD_SHIPPED_FLAGS`; frozen; the only seam is the test-only `FARKAD_FLAG_OVERRIDES` | `js/model/schema.js:33-42`, `:76-81`; `vehiclesEnabled()` `:2453-2455`; `tests/build.test.mjs:342-362` refuses a shipped file that defines the override |
| Roster of vehicles: top-level array `vehicles: [{id, name, ownerId, active, rates:[{from, amount}], …unknown fields kept}]` in the one schedule document (`scheduleData:v2` / `schedules/current`) | `js/model/schema.js:116-120`; rebuilt at load `js/state.js:1309-1331`; ids `v_01…` `js/model/schema.js:2622-2627` |
| Per-day record (v110/v111 redesign): `days.<date>.vehicleRuns.<vehicleId> = {out, name, ownerId, amount, siteIds[]}` — one field path per vehicle per day, price and owner stamped | `setVehicleOut` `js/model/schema.js:2601-2619`; validator `vehicleRunProblems` `:2550-2560`; contract `docs/ledger-vehicles-preparation.md:21-37` |
| Legacy per-day record (v83): `days.<date>.vehiclesOff = [vehicleId]` (three segments), kept and never converted | `js/model/schema.js:814-841`, `:1166-1183`; `js/state.js:1346-1353`; `js/sync/receive.js:1610-1617` |
| It is money: `vehiclePayFor` → `payrollReport` adds `vehicleDays`/`vehicleAmount` to a man's row and to `amount` | `js/model/schema.js:2573-2586`; `js/model/money.js:311-324`; report columns «ימי רכב», «שכר רכב» `js/ui/reports.js:1385-1404`, `:3436-3453` |
| It is tied to closed pay periods and to worker deletion | `vehicleDateClosed` `js/model/schema.js:2588-2597`; `workerFootprint` counts owned vehicles and runs `:1408-1416`; deletion blocked `js/ui/roster.js:1353` |
| UI that exists (all behind the flag): the «רכבים» panel on the crew page with «+ הוסף רכב», rename, rate, archive; a tray on the day screen «רכבים — נרשמים בנפרד» and a departure dialog (out / stayed, which sites) | `index.html:128-137` (`#vehiclesHeading`, `#vehicleList`); `js/ui/roster.js:770-960` (panel hidden when off `:774-785`); `js/ui/day.js:1314-1410`; `css/app.css:4761-4762`; held-record rows in ⋯ `js/ui/settings.js:435-451` |
| What the flag gates when off: nothing drawn (`roster.js:774`, `day.js:1315`), nothing computed (`vehiclesOutOn` returns `[]`, `schema.js:2563`), nothing written (`setVehicleOut` `:2602`, `roster.js:856/907/926/953`, `day.js:1342`), no report column (`reports.js:750/786/1390/3444`) — and every stored byte still survives load, save, sync, backup, recovery, restore | `tests/vehicles.test.mjs:1-20`; merge that never removes `js/model/schema.js:2468-2504`, called at `js/sync/receive.js:1002-1007`; wire document `js/sync/sync.js:1089`; backup `js/ui/backup.js:1174-1190` |

It has NO passengers, no seats, no driver, no eligibility, no pickup area. `docs/ledger-vehicles-preparation.md:29-30`
says so: "this does not assign individual passengers or enforce seat capacity".

### 1.2 Why it was retired

- v83 (`7bf6860`, 28 Aug 2026) shipped it with a default: an evening with nothing said meant every
  vehicle went out (`docs/releases.md:1795-1812`).
- v86's notes: "Vehicles are live and their default moves money… a silent Tuesday adds three hundred
  shekels to an owner's pay by itself. The owner has since cancelled the feature"
  (`docs/releases.md:1741-1744`).
- v91 candidate retired it behind the flag: "nothing is drawn, nothing is computed, nothing is
  written, and every stored vehicle byte survives every door" (`docs/releases.md:1649-1652`).
- v110/v111 rebuilt it as explicit departures (`vehicleRuns`), still off: "Source flags remain false.
  This is deliberate preparation, not a released feature" (`docs/ledger-vehicles-preparation.md:39-45`).
  It reached this branch in `e5b70f2` (v116 staging, 2026-10-02); `0197a64` (v119) added "vehicle
  ownership blocks deletion".
- Stale note: the header of `tests/vehicles.test.mjs:22-30` still lists four deliberately red checks
  (R1–R4). The suite passes 86/86 on the current tree; the comment was not updated.

### 1.3 What a phone does with vehicle data it does not use — measured

| build | behaviour | evidence |
|---|---|---|
| before v110 | "an old normaliser may drop or refuse that new day field" (`vehicleRuns`) | `docs/ledger-vehicles-preparation.md:42-43` |
| current tree, flag off | keeps `vehicles`, `vehicleRuns`, `vehiclesOff` byte for byte; a snapshot without them does not remove them; a malformed run in a snapshot refuses the whole snapshot as an invalid financial record | `js/state.js:1319-1353`; `js/model/schema.js:2468-2504`; `js/sync/receive.js:704-707`; `tests/vehicles.test.mjs` |
| current tree, a layer it has NEVER heard of (`transport`) | probe `probe-unknown-paths.mjs`: `storedScheduleProblems`/`fullScheduleProblems` refuse `days.<date>.transport` («שכבה שאינה מוכרת: transport»), accept an unknown TOP-LEVEL key but `normaliseSchedule` drops it; `journalEntryProblems` refuses both `transport.*` ("a path root nobody wrote") and `days.<date>.transport.*` ("a layer nobody wrote") | this folder |
| current tree adopting a cloud document that carries transport data | probe `probe-snapshot.mjs` (simulated cloud): the snapshot is adopted, writes are not blocked, the transport data is on neither the phone's memory nor its disk, and the cloud still has it | this folder |

That last row is exactly the v166 Rima situation (`docs/releases.md:343-375`): an old phone never
removes the new layer through an ordinary edit, but it does not keep it either, so a whole-document
restore run on it — or a restore of a backup, restore point or daily cloud copy it wrote — erases
the layer for everyone, with no word said.

---

## 2. Architecture

### 2.1 The two options

**(A) Inside the schedule document** — revive or extend the dormant model: an inventory in the
top-level `vehicles` array (or a new `transport` map), plans under `days.<date>.transport.*`,
travelling through the existing outbox, journal, CAS protocol, backups and restore.

**(B) A separate store** — its own `localStorage` keys through `Store`, later its own Firestore
documents under `transport/…`, never the schedule document, never the outbox.

| question | (A) in the document | (B) separate |
|---|---|---|
| Isolation from payroll and attendance (the owner's requirement) | Broken by construction. The existing model IS payroll (`money.js:311-324`), blocks worker deletion, and answers to closed periods. A new layer on the day record shares the day's validation: one malformed transport record refuses the whole day or the whole snapshot, the way a malformed vehicle run or Rima count does (`receive.js:704-720`; `releases.md:403-409`) — and that holds every write, attendance included. | Holds by construction: a different key, a different document. A damaged transport record cannot stop attendance from being recorded, and no transport byte can reach a pay sheet. |
| Phones on older builds (the three do not update together) | Every validator, the normaliser, the journal, the wire and `receive` need the new paths (probe: all refuse or drop today). Until EVERY phone has the build, the v166 rollout rule applies in full (`releases.md:279-289`): no restore of any kind across builds, no older window open beside a new one, and an older phone silently drops the layer from its copy. For Rima that was one integer per site. Here it is the whole plan. | An older phone has never heard of the keys or the documents and touches neither. No rollout rule. It simply does not have the screen. |
| Restore / backup | Travels with backups — which is the risk: a restore point or daily cloud copy written by an older phone restores a document with no transport data (`releases.md:353-361`). The daily copy is written by whichever phone opens first. | Not in the backup file, the restore points, the rescue file or the cloud copy (they carry named records only, `js/recovery.js:482-552`). A schedule restore leaves transport untouched, and the reverse. Cost: transport needs its own export if it must survive a lost phone before phase 3. |
| Document size | Plans WITH version history in the one Firestore document (1 MiB limit). A day's attendance for 14 men is roughly 1.3 KB; one accepted plan version is roughly 1–2 KB, and a day has several versions. The document's growth would more than double, with no pruning allowed inside a pay record. | Per-date records, pruned by date (proposal: 35 days). The schedule document does not grow by a byte. |
| Sync machinery | Reuses the hardest code in the repo (send claim, pre-send hold, receipts, contested writes, held rows in ⋯) — and every one of those needs a transport case and a test, as Rima's did through two reviews (`releases.md:291-341`). | Phase 1–2 need none. Phase 3 needs a small one of its own (§2.4) and a `firestore.rules` change. |
| `firestore.rules` | No change needed: nested paths are not restricted (`releases.md:274-275`). The rules also do not type-check them (`releases.md:410-411`). | Phase 3 needs a new `match` block: today everything outside `schedules` and `history` is denied (`firestore.rules:325-327`). Publishing is a MANUAL owner operation — the CI publish reports failure without the `FIREBASE_SERVICE_ACCOUNT` secret (`.github/workflows/rules.yml:93-103`). Rules go first, then the client. |
| Iron law 3 (never claim saved before a durable commit) | Inherited from `State.commit`. | Must be honoured by hand: `Store.setVerified`, and the screen says «לא נשמר» when it fails. |
| Iron law 4 (one field path per edit; whole-document writes only for restore) | Each move of a man is a path; a "suggest" rewrites many paths at once → `State.commitMany`, one journal batch, and the contested-write rules for each. | Law 4 is about the schedule document and is untouched. Drafts never leave the phone; phase 3 sends only ACCEPTED versions, each a create-only document (§2.4) — nothing is ever overwritten, so there is no whole-document overwrite to forbid. This reading of law 4 needs to be approved, not assumed. |
| Iron law 5 (three stamps) | Same for both: any phase adds files to `index.html` and `sw.js` SHELL, so the three stamps move in that commit. | same |
| Iron law 10 (nothing unreadable deleted, overwritten or treated as empty) | Inherited — at the price above: quarantine blocks ALL writes. | Own quarantine: copy to `farkadTransport:damaged:<n>`, read back, original kept, the transport screen read-only until the person is told — and `farkadWritesBlocked()` is NOT raised, so recording the day goes on. |
| Iron law 11 (no prompt/confirm/alert) | Same for both: `askText`/`askConfirm`/`askChoice`. | same |
| What goes wrong if it is wrong | A pay record. | A ride plan for one morning. |

### 2.2 Recommendation: (B), and leave the dormant vehicle-pay model exactly as it is

1. The owner's requirement is isolation, and (A) cannot give it: the existing model is payroll, and
   any day-record layer shares the day's validation and the document's restore.
2. The phones do not update together. (A) repeats the v166 rollout rule with a far larger payload.
   (B) has no cross-build hazard at all.
3. (B) lets phase 1 be local-only with zero sync risk, which is what is asked for.
4. A wrong transport plan must never be able to hold a pay record. Only (B) guarantees that.

Do not reuse the `vehicles` flag, the `vehicles` array, the `v_NN` ids or the «רכבים» crew panel.
The transport inventory is a separate list with its own ids (`tv_…`). If vehicle-owner pay is ever
revived, linking the two lists is a decision for then.

### 2.3 What needs the owner's explicit approval

| # | decision | why it is his |
|---|---|---|
| 1 | Every Hebrew string in §7 | law 6 |
| 2 | Separate store; transport is not in the backup file, restore points, rescue file or cloud copy | it is the trade for isolation |
| 3 | A per-phone switch in ⋯ that shows the transport entry on that phone only (phase 1) | today no setting reaches a feature gate (`schema.js:30-32`). The code gate `FARKAD_FLAGS.transport` stays a constant in a commit; the switch is a second, per-device condition on top of it |
| 4 | Where the entry sits (recommended: in the WhatsApp dialog, under «לכל עובד בנפרד» — no new button on the day screen, which he said has too many) | he decided the same for the seder (`js/ui/seder.js:36-37`) |
| 5 | A manual «סימנתי שנשלח» mark | the seder deliberately never says "sent" (`releases.md:27-28`). Here it would be a person's own statement, never the app's claim, and it stops being believed when the message changes |
| 6 | Keeping 35 days of plans and dropping older ones | pruning is deletion |
| 7 | Phase 3 at all (rules change, manual publish, rules first), and the reading of law 4 in §2.1 | cloud work |
| 8 | That deleting a worker or a site is never blocked by a transport plan naming him | isolation, in the other direction |

### 2.4 Phased build plan

**Phase 0 — judge the planner (now).** `transport-prototype.html`: synthetic data, in memory, no
storage. The owner answers the questions in §9 and corrects the wording in §7.

**Phase 1 — local-only, one phone, behind the flag. Zero sync risk.**
- `FARKAD_FLAGS.transport: false` in `FARKAD_SHIPPED_FLAGS`. While the work is unfinished the shipped
  value is false and only the suites turn it on (`FARKAD_FLAG_OVERRIDES`). Nothing unfinished is
  ever reachable in production.
- New files (classic scripts, global scope): `js/model/transport.js` (pure: the model, `suggest`,
  `validate`, signatures — the content of `transport-core.js` here), `js/ui/transport.js` (the
  screen, its words in one `TRANSPORT_TEXT` block). Loaded after `js/model/schema.js` and with the UI
  group; not part of the sync group, so nothing goes near `sync/boot.js`. Added to `index.html`,
  to `sw.js` SHELL and to the load order in `tests/harness.mjs`; the three stamps move.
- Storage: §3. No outbox entry, no `State.commit`, no change to `scheduleData:v2`, no write-fence
  tick (the keys are not in `FARKAD_SNAPSHOT_KEYS`, `js/recovery.js:546-553`).
- Reads the day record through the functions the seder reads it with (`workersAtPlace`,
  `entriesFor`, `State.layer`); writes nothing to it.
- Release, when complete: flag true, entry shown only on a phone where the switch of §2.3 #3 is on.

**Phase 2 — the drivers' messages.** The seder's pattern, reused: a real `<a href="https://wa.me/…">`
whose address is set before the finger lands, the 1.5 s one-tap-one-man guard, «נפתח בוואטסאפ» with
the message's fingerprint, resume after iOS kills the app, phone normalisation by `sederWaNumber`
(`js/ui/seder.js:172-185`, `:515-560`). Plus the manual mark of §2.3 #5.

**Phase 3 — other phones see the plan (only if question 8 says they must).**
- `firestore.rules`, published by hand BEFORE the client:
  `match /transport/{docId}` and `match /transport/{day}/versions/{n}` — `allowed()`; versions are
  create-only (`allow update, delete: if false`, the rule `history/{day}` already uses,
  `firestore.rules:319-322`); the config document is small and takes a `revision == resource.revision + 1` check.
- Drafts never sync. Accepting version n creates `transport/<date>/versions/<n>`. If another phone
  already created n, the create is refused; this phone is told, shows the other version, and its own
  becomes n+1 only when a person accepts it again. No merge, no timestamp comparison, no overwrite.
- A few methods in `js/sync/firebase-adapter.js` (still the only file that knows Firebase), reached
  after boot, failing soft. The schedule's listener, queue and receipts are not touched.
- Old phones: denied nothing, shown nothing.

**Phase 4 — by the answers:** the return ride, a drawn seat layout, each passenger's ride in his
seder message.

---

## 3. Data model (option B)

Ids are random (`newEntityId`), never contain `.` (`isSafeId`), and never reuse `v_NN`.

```
farkadTransport:enabled           "1" while the switch is on; absent = off

farkadTransport:settings          one record, through Store.setVerified (optional)
{
  version: 1, seeded: true,
  vehicles: [ { id: "tv_05", name, seats: 9, rows: [2,2,2,3], active: true } ],   // list order
  areas:    [ { id: "ta_9x…", name } ],                          // pickup areas, list order
  workers:  { "w_01": { area: "ta_9x…" | null,                   // keyed by the ROSTER's worker id
                        canDrive: true, drives: "all" | ["tv_02"] } }
}

farkadTransport:day:2026-11-10    one record per date
{
  version: 1,
  unavailable: { "tv_k3": true },                 // absent = available
  status:      { "w_07": "private" | "contractor" | "other" },
  trips:       { "tv_k3": { driver: "w_01" | null, passengers: ["w_02"],
                            area: "ta_9x" | null,           // pickup area; destinations are DERIVED
                            seats: { "w_02": 2 },           // optional; seat 1 is the driver
                            locked: false } },
  workerLocks: { "w_02": true },
  accepted: [ { n: 1, at: <ms>, complete: false, reason: "…", errors: 1, moved: null,
                sig: "<plan fingerprint>", attendance: { "w_02": "p_01" },
                trips: {…}, status: {…}, unavailable: {…} } ],     // append-only on this phone
  marks:    { "tv_k3": { sig, openedAt, sentAt } }                // the drivers' messages
}
```

Rules of the model:

- **Destination sites are never stored.** They are read from the day record at the moment of
  drawing: the sites of the trip's occupants. A man on two sites that day rides to the first one his
  day holds (the order `sederCrew` uses); the second is shown, not routed.
- **A worker and a site are referenced by the roster's id and nothing else is copied** — no name, no
  rate, no phone. A name is read from the roster when drawn. An id the roster no longer has is drawn
  as «עובד שנמחק» and is a validation error; it never blocks the deletion and never reinstates him.
- **An accepted version is a frozen copy** and is never edited. `attendanceSig` lets the screen say
  that the day record changed after the plan was accepted.
- **Writes**: `Store.setVerified(key, json, { optional: true })` — verified, and optional so a full
  disk can never spend a payroll restore point to make room (`js/store.js:161-163`). A refused
  write leaves the change in memory for the session and the screen says it was not kept.
- **Reads**: a record that will not parse is copied to `farkadTransport:damaged:<n>`, read back, the
  original left in place, and the transport screen is read-only until the person has been told.
  `farkadWritesBlocked()` is not raised.
- **Retention**: the 35 most recent dates; older day records are removed when a new date is first
  written (approval #6).

---

## 4. The suggestion algorithm

No AI, no randomness, no clock. The same input gives the same plan, byte for byte. It is
`suggest(ctx, day)` in `transport-core.js`, and the prototype runs that file's text verbatim.

Priorities, in the owner's order: pickup area → destination site → driver eligibility → capacity →
convenience → less unnecessary travel. It does NOT minimise the number of vehicles.

**Inputs.** Riders = workers with a site in the day record and no status. Vehicles = those not
marked unavailable. All lists are processed in their stored order (roster order, inventory order,
area order, site order); those orders are the only tie-breakers.

**Every choice is a comparison of tuples, left to right, and the last element is always a unique
index** — so two candidates never tie.

| step | what it does | choice rule (tuple, smaller wins) |
|---|---|---|
| 0 Keep | A locked vehicle is kept exactly as it is — driver, passengers, their order, seats — even if it is wrong (validation says so; suggest does not repair what a person froze). A locked worker keeps his vehicle and his role. Everything else is cleared. | — |
| 1 Drivers for kept vehicles | A kept vehicle with no driver (a locked passenger sits in it) gets an unplaced rider who may drive it. If nobody may, it stays without a driver. An ineligible man is never chosen. | `[other area?, other site?, roster index]` |
| 2 Open vehicles per pickup area | Area by area: while the area's unplaced riders exceed the free seats already open for it, open one more vehicle with a driver from that area. Stops when the area is covered or no (vehicle, driver) pair exists. | `[fit, driver's flexibility, −group size, roster index, inventory index]` where **fit** = the vehicle's seats if it seats everyone still uncovered, else `1000 − seats` (the smallest that fits, else the largest there is); **flexibility** = how many free vehicles this man may drive (the man who can drive only one car gets it); **group size** = riders of this area going to his site |
| 3 Passengers in their own area | Per area, by destination group, largest group first (then site order): seat the group in that area's vehicles, as many as fit, the rest into the next vehicle. | `[not already going to this site?, group does not fit whole?, number of destinations, −free seats, inventory index]` |
| 4 Leftovers | A man whose area had no driver or no seat takes a free seat in any vehicle that has a driver. Order: area, site, roster. | `[not going to his site?, 0, number of destinations, −free seats, inventory index]` |
| 5 A driver from a passenger seat | If men are still unseated and a vehicle stands free: an eligible man riding as an unlocked passenger is moved to drive it, and step 4 runs again. One vehicle per round, so it ends. | `[shares no site with the men left?, fit, roster index, inventory index]` |
| last | Passengers of every vehicle suggest filled are listed in roster order. | — |

Output: `{ trips, unseated[], log[] }`. `log` records each decision (step, vehicle, driver, how many
seated), so "why is he in that car" has an answer.

How the priorities map: pickup area = steps 2–3 work area by area. Destination = step 3's groups and
the first element of steps 3–4. Eligibility = a driver is only ever taken from the men who may drive
that vehicle. Capacity = seats are counted in every step and never exceeded. Convenience = whole
groups, fewer destinations per vehicle. Less travel = a vehicle is opened only when an area still
has uncovered riders; leftovers go to a car already going to their site.

Known limits, stated rather than hidden: it is greedy, not optimal; it knows no distances (areas
have no order of closeness — an answer to question 4 could add one); a locked vehicle with empty
seats is not filled (scenario 2c below); a man alone in his area who may drive opens a car for
himself.

### 4.1 Unit results (`node suggest.test.cjs`, 30/30)

Sample day: 14 workers, 13 with a site, one «רכב פרטי», one «נוסע עם קבלן אחר» → 11 riders.
`w1`,`w6`,`w11` may drive everything; `w4`,`w9` only `v1`,`v2`,`v6`. Notation: `vehicle=driver+[passengers]`.

| scenario | result |
|---|---|
| 0 Sample day | `v1=w4+[w1,w2,w3,w5] v2=w6+[w7,w8] v6=w9+[w10,w12]`. Nobody unseated; one warning (w12 rides from another area). Two runs byte-identical; input not mutated; suggest on its own output gives the same plan. |
| 1 Not enough seats — only `v1` (5 seats) goes out | `v1=w1+[w2,w3,w4,w5]`. Unseated, in roster order: `w6,w7,w8,w9,w10,w12`. Six `noSeat` errors; plan incomplete; capacity not exceeded. (Both area-1 drivers have one option, so the one whose site has more riders drives.) |
| 2 A locked vehicle — `v5=w1+[w3,w2,w12]` locked, seat 2 fixed for w3 | `v5` byte-identical, order and seat included. Around it: `v1=w4+[w5] v2=w6+[w7,w8] v6=w9+[w10]`. Nobody twice, nobody unseated. |
| 2b A locked worker — w10 locked as a passenger of `v7` | w10 still a passenger of `v7`; `v7` given an eligible driver (`v7=w1+[w9,w10]`). |
| 2c A lock that strands men — `v5=w6+[w1,w12,w9]` locked (the only area-2 and area-3 drivers frozen in it, 5 seats empty) | `v5` untouched; `w7,w10` reported unseated. Suggest does not fill a locked vehicle. |
| 3a No eligible driver — w12 locked into the 9-seater and nobody may drive it | `v5=?+[w12]`: no driver, never an ineligible one; nobody else put into it; validation `noDriver:v5`; plan incomplete. |
| 3b Nobody on the day may drive anything | No vehicle opened; all 11 riders reported unseated. |
| 3c A manual plan with a man driving a car not on his list | `driverNotEligible` error. |
| 4 Step 5 — only `v1` and `v3` go out | Both used, both with eligible drivers; 10 seats, 11 riders, exactly one unseated. |

---

## 5. Validation

Run live on every change (`validate(ctx, day)`). An error makes the plan incomplete; a warning never
does. An incomplete plan can be accepted only with a typed reason.

| code | level | rule |
|---|---|---|
| `noDriver` | error | a vehicle with anyone in it has exactly one driver — none is an error (two is impossible: one field) |
| `driverNotEligible` | error | the driver may drive this vehicle (`canDrive` and `drives`) |
| `overCapacity` | error | driver + passengers ≤ seats |
| `twice` | error | a worker is in at most one vehicle |
| `hasStatus` | error | a worker with a status (private / contractor / other) is not seated |
| `notWorking` | error | everyone seated has a site in the day record for that date — READ from the day record, never written |
| `vehicleUnavailable` | error | a vehicle marked unavailable carries nobody |
| `noSeat` | error | every rider has a seat |
| `badSeat` | error | a seat number is 2…seats, unique in the vehicle, and belongs to a passenger |
| `unknownWorker` / `unknownVehicle` | error | an id the roster or the inventory no longer has |
| `otherArea` | warning | a man rides in a vehicle whose pickup area is not his - only when both have an area |

Structural guards before any of that, as the app does everywhere: ids through `isSafeId` (no dots,
no `__proto__`), dates through `isRealDate`, maps without a prototype.

---

## 6. UI flow on a phone

Entry (approval #4): the WhatsApp dialog, under «לכל עובד בנפרד», opens the transport screen for the
date being viewed. Nothing new on the day screen.

One screen, four tabs, one filled button at most per screen:

1. **רכבים** — the inventory, one row each, one toggle «זמין היום / לא זמין היום». One tap per vehicle.
2. **עובדים** — the men with a site that day (read from the record). Per man: his site, his pickup
   area, a select «בהסעה שלנו / רכב פרטי / נוסע עם קבלן אחר / ממתין / אחר», and «רשאי לנהוג». In the
   app, eligibility and the pickup area are roster-like settings kept in `farkadTransport:config`;
   they are edited here, not on the crew page.
3. **שיבוץ** — the plan.
   - A status card: «טיוטה» / «גרסה N מאושרת» / «יש שינויים שלא אושרו מאז גרסה N», and seated/total.
   - «הצעת שיבוץ» (filled while the plan is empty) and «אישור התוכנית» (filled once there is a plan).
   - Errors and warnings, live.
   - «בלי מקום ברכב» — the men with no seat.
   - A card per available vehicle: occupancy, a lock, the pickup area, the destinations as site
     chips, the driver button (opens a list of ONLY the men who may drive that vehicle), the passengers.
   - Moving: tap a man → a bar at the bottom names him → tap «העברה לכאן» on the target vehicle.
     Two taps. The bar also carries his lock, «הוצאה מהרכב», and the optional seat.
   - Locks: a locked vehicle refuses every edit until unlocked; a locked man cannot be moved; suggest
     respects both.
   - «היסטוריית גרסאות» — every accepted version: time, complete or partial with its reason, how
     many men changed since the previous one, one line per vehicle.
4. **הודעות** — one card per driver of the LAST ACCEPTED version (never of a draft; a draft that
   differs is said on top). «הצגת ההודעה» shows the text; the green button opens WhatsApp; «סימנתי
   שנשלח» is the person's own mark. A mark is tied to the message text: when a later version changes
   that driver's message, the card says so and the mark is no longer believed.

Accepting: a complete plan asks once. An incomplete plan lists what is open and requires a typed
reason; without one nothing is accepted. Any edit after acceptance is a draft again; accepting it
makes version N+1. Versions are never edited or removed.

Floors, measured in the prototype and to be measured by the app's mobile suite: every target ≥ 44px
both ways, every field ≥ 16px, no horizontal scroll at 375px, bar heights from `js/ui/bars.js`,
safe area from `env()`.

One finding for the build: `isolate()` in `js/ui/dom.js:20-23` wraps a name in FSI…PDI (first-strong).
A vehicle name that begins with a Latin letter («BYD סיל U») then takes a left-to-right base and
comes out scrambled inside a Hebrew sentence. The prototype uses RLI…PDI for names. The app needs
the same for vehicle names, or names stored Hebrew-first.

---

## 7. Every Hebrew string — proposed, the owner corrects on sight

The owner gave blanket approval of professional wording on 2026-11-09. The strings as built,
with «ממתין» and the prototype's own lines removed and the list-editing, switch and store
lines added, are in one block at the top of `js/ui/transport.js`, pinned word for word in
`tests/transport.test.mjs`, and listed in full in `docs/releases.md` under v171. That table is
the one to correct; this document does not keep a second copy to go stale.

---

## 8. Test plan

Node suites, with `tests/harness.mjs` (flag turned on through `flags: { transport: true }`):

| suite | what it pins |
|---|---|
| `tests/transport.model.test.mjs` | The nine scenarios of §4.1 with their exact plans; determinism (two runs, same bytes); idempotence; input never mutated; a generated sweep (fixed seeds: random availability, statuses, eligibility, locks) asserting on every result — nobody twice, capacity never exceeded, every driver eligible, locked vehicles byte-identical, locked workers in place, `unseated` equals the `noSeat` errors. Every validation code, one at a time. |
| `tests/transport.isolation.test.mjs` | After every transport action: `scheduleData:v2` bytes, the outbox, `cloud.writes`, the write tick and `payrollReport`/`invoiceReport` are unchanged. The backup file, restore points, the rescue file and the daily cloud copy contain no transport key. Every restore door leaves the transport keys as they were. Deleting a worker or a site is not blocked by a plan naming him, and nothing reinstates him. Flag off: no entry drawn, no key written, no function reachable. The retired `vehicles` suite still passes unchanged. |
| `tests/transport.store.test.mjs` | A write the disk refused is not called saved. A full disk: the optional write never deletes a restore point. A record that will not parse: copied, original kept, transport read-only, `farkadWritesBlocked()` false and a day edit still commits. Retention drops only dates beyond the limit. Poisoned ids (`__proto__`) through every reader. |
| `tests/transport.text.test.mjs` | Every string of §7 word for word, and the block's keys. Each driver's message for a pinned plan. Phone numbers through `sederWaNumber`. The mark's fingerprint: a changed message is no longer "opened" or "sent". |
| `tests/build.test.mjs` (existing) | The new files in the shell; the three stamps. |

One browser suite, `tests/transport.browser.mjs` (Chromium, self-served, in `npm run test:all`): the
flow of `verify-prototype.cjs` against the real app — availability, statuses, suggest, move, driver
list offering only eligible men, locks respected, accept refused without a reason, version 2 after
an edit, the message, the green link being a real `<a href="https://wa.me/…">` that a tap follows
(route intercepted, as `tests/seder.browser.mjs` does), one tap one driver, a reload mid-run, the
manual mark; at 320/375/440, both schemes, 2x text: 44px both ways, 16px fields, no overflow, the
bars measured.

Phase 3 adds: cases in `tests/rules.test.mjs` (create-only versions, no update, no delete, not
readable by a stranger, the schedule rules unchanged) and one emulator suite for two phones accepting
the same version number.

Not coverable by any suite here, and to be said in the release notes: the hand-off from the
home-screen app to WhatsApp on a real iPhone.

---

## 9. The questions that were open — answered 2026-11-09

All eight are answered; the answers and what the build did with each are the table in §0.
Still open, for the step that brings the other phones in (phase 3): whether the vehicle list,
the areas and who may drive become one shared record, and what a phone that already has its
own does when it first sees the shared one.

---

## 10. The prototype, and what was verified

`transport-prototype.html`: one file, no external request, no storage, synthetic data, the banner
«אב-טיפוס · נתוני דוגמה». It starts with `<title>`, then `<style>`, markup, `<script>` — no
doctype/html/head/body. Colours are custom properties on `:root` (dark), with the light set under
`@media (prefers-color-scheme: light){:root:not([data-theme="dark"])}` and `:root[data-theme="light"]`.
Built by `build.mjs` from `prototype.template.html` + `transport-core.js` + `transport-sample.js` +
`transport-text.js`.

`node verify-prototype.cjs` — Chromium, the file wrapped in a minimal skeleton, 440×956 and 375×667,
dark and light, touch taps: **420/420** (log: `verify-prototype.log`). Per combination it drives
availability → statuses → suggest (the pinned plan) → move a man → seat → driver dialog (only the
eligible offered; Escape returns focus) → set driver → lock a vehicle and a man → suggest respects
both → make it incomplete → accept refused without a reason → version 1 partial → edit → version 2 →
driver message → the green button does not navigate → «סימנתי שנשלח» → version 3 changes that
message and the mark is no longer believed. On every screen and dialog it asserts: no horizontal
overflow, every target ≥ 44px in both dimensions, fields ≥ 16px, at most one filled button, no emoji,
text contrast ≥ 7:1 in dark (measured minimum 7.13) and ≥ 4.5:1 in light (measured minimum 6.7 — the
white-on-#1d4ed8 button, as specified). And: no console error, no request other than the file, no
native dialog.

Not verified: any real phone (iOS Safari, the home-screen app, a Galaxy); a screen reader; text
scaled to 200%; 320px width; the real WhatsApp hand-off (the prototype deliberately has none); the
real roster, sites, areas and vehicles; anything in §2–§3, which is design and not code.
