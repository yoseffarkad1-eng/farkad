# Findings — the third value at six cells of 3 September

What was measured, on the harness, to answer one question the v105 round could not: with
the owner's phone the only phone the cloud has ever had, how did the cloud come to hold,
at six cells of `days.2026-09-03.actual`, a value the phone never recorded in `seen`?

Produced on 11 September 2026 by five hunters (one hypothesis each) and two refuters per
claim, all on the Node harness with the real v86 tree (`/home/user/v86`, `880d7bb`) and
the current tree (`1e20111`), the owner's v104 rescue export and the owner's v105 panel
screenshots. No emulator, no browser suite, no change to either tree. The hunters'
scripts and outputs are under the session's scratchpad (`hunt-third-value/`), named
below where a line is quoted; they are evidence of that run, not part of the
repository.

The owner's own account, given after the v105 panel showed «בענן: אילון» on all six
rows: at the time, the app «was scrambling days and the order of workers» — which is
what a second window still on the old build looks like from the phone. The verdict
below was written before that sentence arrived and stands on its own evidence.

---

# The third value at six cells of 3 September — verdict

Question: with this phone the only writer the cloud has ever had, how did the cloud come to hold, at six cells of `days.2026-09-03.actual`, a value the phone never recorded in `seen`?

Measured on `/home/user/farkad-work` at 1e20111 (some runs at abf9327, whose `js/`, `sw.js`, `index.html` and `tests/harness.mjs` are identical — the diff is documentation) with the real v86 tree at `/home/user/v86` (880d7bb) loaded through `makeDevice({sources})`; the owner's v104 rescue export (`b8d1cd88-farkadrecovery20260911.json`, 140 records); the owner's v105 panel screenshots of 11 Sept 09:10 local. Not run, per the brief: `test:all`, `test:release`, the browser suites, the emulator. Neither tree was modified.

The six cells, as the phone holds them and as the v105 panel shows the cloud («בענן: אילון» on every row; the id אילון carries in the export is `p_02`):

| worker | on this phone | in the cloud |
|---|---|---|
| w_07 אחמד סקראן | גדרה (p_05), 470 | אילון |
| w_22 רגא | פרסדיה (p_01), 500 | אילון |
| w_23 סטייק | פרסדיה (p_01), 500 | אילון |
| w_24 אבו ברהאן | גדרה (p_05), 650 | אילון |
| w_25 מוני | נעדר (absent), 470 | אילון |
| w_b4f918fe822c אחמד פרקד | אלעד (p_06), no rate stamp | אילון |

## 1. The mechanism that survives

**A second browsing context of the same person, still running the cached v86 build, recorded 3 September at אילון for those six workers, and the v86 rules accepted it.** Between v95 going up (2 Sept, 08:32Z) and the rules publish (10 Sept, 19:45Z) that was the only kind of write the cloud accepted: every write this phone made from v95 on ran inside a receipt transaction the v86 rules refuse (`features/cutover/findings.md`), while a plain v86 `updateDoc` passes `allowed() && stamped() && fullDocumentOk()`. A v86 window cannot be given new code — only v87+ windows are caught up — so it keeps writing as v86 for as long as it lives. On an iPhone the Safari tab and the home-screen app are two localStorages, two device ids and two queues of one person; a laptop tab left open on v86 would do the same. The owner's "no other phone" is true and does not exclude this.

Why this phone's `seen` could never carry that value: the whole chain at the six paths — A (11:37:42Z, the copy that put them at פרסדיה), B (same second, the clear that left `{"entries":[],rates}`), C (16:46:48–16:47:52Z, the re-assignment that is now held) — is in the op-log format v86 does not have (v86's outbox is a per-path map; 8d9b1be is not an ancestor of 880d7bb), so all of it was queued under the lockout and none of it landed. `seenMarksAt` (`js/sync/receive.js` 116–131) draws from the disk mark, the base document only when `_baseDoc !== null`, and the previous op's `seen` and value; `noteRevision` (172) returns before setting `_baseDoc` for a document with no `revision`, and the six ops' `base` is the held string, so no snapshot ever entered `seen`. A's first mark is `absent`: the disk held nothing there at 11:37Z. After the chain began, `reapplyPending` lays the queue's own value over every adopted snapshot, so the disk mark at each later queue time is the previous op's value. At the v104 cutover the bootstrap's re-read set `_baseDoc` for the first time, and `movedUnder` (139) held every one of the six because no mark of the cloud's value was in `seen` and it was not the op's own value.

Evidence, verbatim.

From `hunt-third-value/h1-byteshape/h1.out` (real v86 tree as the second window, current tree as the app; re-run twice by the refuters with the same lines):

- `PASS 3a: the other window's value lands AFTER the app queued its chain: the app's ops were refused (v86 rules, protocol write)`
- `PASS 3a: the other window's value lands AFTER the app queued its chain: the v86 window's write LANDED under the v86 rules`
- `heldRecords: [{"path":"days.2026-09-03.actual.w_01","opId":"0mtwjncop_oaw3ss1rwsug","mine":{"entries":[{"placeId":"p_05"}],"rates":{"daily":470,"hourly":0}},"cloud":{"entries":[{"placeId":"p_02"}],"rates":{"daily":470,"hourly":0}},"heard":true}]`
- `WHO: base document updatedBy at the hold = d_app | the last legacy (v86-window) write was signed d_safari | bootstrap signed d_app | this device d_app`
- `PASS 3a REPRODUCED: single phone, second window on cached v86 -> the app's cell is HELD at the v104 cutover`
- `PASS 3b control: when the app had adopted the other value before queueing, seen carries it and nothing is held`
- `PASS 3c: on one shared disk the current tab's cell is held too (the v86 tab signed with the SAME device id)`
- `PASS PHASE 2: no hold on the single-writer disk (holdingContested false)` — the same disk reopened by the current tree with one storage context: zero holds.
- `26/26 checks passed`

From `hunt-third-value/h5-owner-disk/h5-v86third.txt` (the owner's ACTUAL 140 records opened by the current tree; the cloud written by a v86 device on its own disk):

- `=== a v86 device on ITS OWN disk (d_safari) recorded the six at p_02; its cloud: updatedBy=d_safari revision=undefined w_07={"entries":[{"placeId":"p_02"}],"rates":{"daily":470,"hourly":0}}`
- `owner's disk opened by the current tree: status=contested holdingContested=true pending=6 revision=1`
- `HELD (6): w_07 w_22 w_23 w_24 w_25 w_b4f918fe822c`
- `panel w_07: mine={"entries":[{"placeId":"p_05"}],"rates":{"daily":470,"hourly":0}} cloud={"entries":[{"placeId":"p_02"}],"rates":{"daily":470,"hourly":0}}`
- and from `h5-run1.txt`, the only candidates that hold all six on the owner's disk: `l_other_place_p02 6 held 0 landed agrees status=contested`, `s_json_string 6 held 0 landed agrees` — every byte-shape variant holds five at most and never w_b4f918fe822c.

From the owner's phone: the v105 panel (uploads 04cbafa5, 1cd2f289) lists all six with «בענן: אילון»; the 2 Sept 20:41-local screenshot (180a7145) shows 03/09 «הכל נרשם» with רגא and סטייק at פרסדיה — the phone's own C values — and «שגיאת סנכרון»; the export's six hold keys hold `"1"`, its only device id anywhere is `d_ybzfxax9`, its v86 slot holds 38 roster items (seq 633–670) and no day item, and the disk's `updatedAt 2026-09-10T18:03:23.905Z updatedBy d_ybzfxax9` is the bootstrap's re-stamp.

The one premise the reproduction hands over by fiat: the second context knew all six workers. Refuter 1's stricter variant (`refute-v86-send-shape-0/fresh-tab.mjs`, a fresh Safari tab adopting the cloud roster) reports `HELD 5/6: w_07,w_22,w_23,w_24,w_25` when the cloud roster lacked w_b4f918fe822c and `HELD 6/6` when it carried him, with `6/6 needs the cloud to have carried w_b4f918fe822c before the tab wrote: true`. His roster item on this phone (seq 658, `dailyRate 0`) is still unsent in the v86 slot; whether an earlier v86 write got him to the cloud cannot be read off the export. See section 3.

**The v106 fix.**

- No change to `movedUnder`, `marksOf` or `normaliseLayer`. On the owner's own disk every candidate value answered exactly as designed, and every patch proposed this round that widens `seen` or short-circuits on the writer was shown unsafe: counting a heard-but-never-adopted document as seen lets a stale op overwrite the cloud (`refute-cutover-flush-order-0/poisonseen2.out`: `patched / door=unfinished … held=0 cloud w_22 now={"entries":[{"placeId":"p_01"}],…}` where shipped keeps p_02); a "pre-protocol author is self → do not hold" sentinel rebases this phone's stale value over another phone's correction on a multi-phone project and never fires for this project, whose document has carried a `revision` since 10 Sept 18:03Z.
- The defect that is real: at the hold the phone cannot SAY who wrote the value. `_baseDoc.updatedBy` is already this phone's id (the bootstrap signed the document) and the pre-cutover stamp exists nowhere durable. v106 should capture the pre-cutover document's `updatedBy` and `updatedAt` inside the bootstrap transaction in `js/sync/firebase-adapter.js` — its `transaction.get` on the schedule is the one read guaranteed to see the document before revision 1 is written (`bootstrapCutover` in `receive.js` 327 writes before it re-reads, so a capture in `receive()` only works if a listener snapshot arrived first) — return it from the bootstrap, and store it through `Store` under a key the rescue export carries, not as a session field. `holdContested` in `js/sync/sync.js` should then write, instead of `"1"`, the base document's value at the path and that stamp; `heldRecords()` (~1959) adds them to every row; the panel in `js/ui/settings.js` (~564) and `heldRecordsForExport` in `js/ui/backup.js` (~555) carry them. Pin in `tests/held.test.mjs`: a hold produced by a v86-tree window (as in `h1.mjs` 3a) names that window's device id and time; a hold with no pre-protocol document names null.
- Nothing releases the six existing holds by code: their `seen` arrays are records. The decision stays with the person through the v105 panel (section 4).
- No code is needed to stop a recurrence: since the rules publish a v86 window's writes are refused. Operationally the owner should close every other window or tab of the app (Safari on the phone, any laptop tab) — the known gap in `features/cutover/handoff.md` (an unsent v86 queue in another window mistaken for synced) is this incident.

## 2. Tried and did not reproduce

- **A byte-shape gap on v86's send path** (rates dropped or added, `hourly` omitted, `rate:'normal'`, `extraHours:0`, a whole-day rebuild, the `createDocument` seed): `PASS H1 (byte-shape gap on the v86 field write): NO gap between the op record and the cloud / 0 gaps` across nine shapes; v86 sends `patch[path] = item.value` verbatim.
- **The upgrade rebuild** (the current build rewriting v86 day records on open): 17 v86 writer shapes reopen byte-identical, `whole scheduleData:v2 byte-equal after reopen: true`, `GAPS: 0`; `setWorkerDay`/`makeEntry`/`assignPlace`/`markAbsent`/`clearWorkerDay` hash-identical on every served commit v86→v105.
- **The own-echo rule hiding the document** (h2): it fires only when `disk.updatedAt === cloud.updatedAt`, a state in which the disk already holds the cloud's value; any real divergence re-stamps the disk and the build adopts. Both natural origins carried to the cutover give `HOLDS 0` with p_02 in `seen` (`scenario-natural.mjs`, `scenario-c2realistic.mjs`).
- **v86 dropping an acknowledged day after an older snapshot** (h2 C2, h34 "same-disk+stale-snapshot"): produced only by a snapshot pushed into the listener by hand, older than the client's own acknowledged write; the SDK's memory-cache client applies acknowledged batches to its remote documents and drops outdated watch updates, and neither adapter ever enabled persistence. Six realistic v86 sequences leave the day intact: `ONLY the hand-injected regression (f) takes the day off the v86 disk: true`.
- **The cutover flush itself** (legacy slot items or an older batch first at revision 2, a rebase of superseded values, the bootstrap's re-read, the daily archive, `reapplyPending` leaking into the base): eight orderings, `foreignValueWritten=0` in 8/8; a hold appears only when the v86-era document already held a third value.
- **This phone's own v86 build writing from a storage that lacked the value** (h34 as stated): needs two disks under one device id. On ONE disk the v86 value enters `seen` off the disk, `assignPlace` ADDS an entry (`{"entries":[{"placeId":"p_02"},{"placeId":"p_01"}]}`), the chain never ends in `absent`, and `this build, heard on 2 Sept seenHasCloud=true chainEndsAbsent=false held=0 status=synced` — same for never-heard and for the real v95 tree; the boots of v95–v103 keep a future day intact.
- **The bounded `seen` window with a cached-first stale snapshot** (h6): with only the injected snapshot removed, `seen` carries p_02 and holds go to 0; the reproduction's fingerprint (`seen=["absent"]`, no predecessor, cloud stamped 11:37:42Z when nothing landed at 11:37Z) does not match the export's (`[empty+rates, p_01, absent]`, `after` naming one live op).
- **Candidate cloud shapes on the owner's actual disk** (h5): every shape `normaliseLayer` absorbs lands all six; no-rates, bare `{entries:[]}`, `{}` and zero-rates hold five and never w_b4f918fe822c, whose `seen` has no rates; a rate drift to today's roster holds three; the v86 slot's rates equal the stamps at w_07/w_24/w_25.
- **A v86 window on the SAME disk sending the six on its own**: it sends `paths sent: 40; day paths: 0; roster/legacy: 38; six touched: 0` — it re-sends the retired roster items and touches no day unless a person edits in it (which is 3c).
- **A restore or rollback**: refused as a receipt transaction and then blocking every later flush behind the replacement barrier, contradicting the 10 Sept flush landing; no `farkad:pendingReplace` on the disk; the six would have been superseded by its floor.
- **The boot-time ledger mirror re-stamping the disk before the first snapshot**: the 24 Aug advance already carried `le_eadf6700de81`, so the v95 boot added nothing.
- **A retired v86 day item, or a heard base at queue time**: the slot holds only roster items; `_baseDoc` stays null for a document without `revision`, and the six ops' `base` is the held string.

## 3. Not settled, and what from the phone settles it

- **Which context wrote אילון, and its device id.** The export carries only `d_ybzfxax9`, and the bootstrap re-stamped the live document. What settles it: any other open window or tab of the app — its 03/09 screen and its sync chip (a v86 window now shows a refused queue); and in the Firebase console the create-only daily copies `history/2026-09-02` and `history/2026-09-03`, whose `updatedBy` is the context that opened first that day — any id other than `d_ybzfxax9` is the second context.
- **Whether the cloud roster carried אחמד פרקד before the write** (the 5/6 vs 6/6 premise). The v105 rescue export's held rows give the cloud's bytes at his cell: a `rates` object there means the writing context's roster carried him with a rate (this phone's v86 slot has him at `dailyRate 0` and his stamp is absent); the console's `workers` entry for him says the rest.
- **When אילון landed.** Above: before 10 Sept 19:45Z. Below: only that this phone had not adopted it by 11:37:42Z on 2 Sept (A recorded `absent`). 3b shows an adoption before the chain leaves no hold; that a mid-chain adoption would not enter `seen` was argued from `reapplyPending` and not staged. `history/2026-09-03` shows whether אילון was there when the day was first opened on 3 Sept.
- **The iOS storage split** between Safari and the home-screen app was modelled (two localStorages in 3a, one shared in 3c; both hold), not tested on a device.
- **The production adapter** was not exercised against the emulator (the port is taken); the fake cloud's v86-rules phase is `reject → permission-denied` on every write kind, matching the findings of the v104 hunt.
- **A v86 window on a post-v87 disk re-sends the 38 retired roster items in one 40-path write** (h5 side finding); whether the post-cutover rules refuse it was not measured.
- **What the other context holds at 3 Sept now**, and whether it has an unsent queue of its own, is not on this phone's export.

## 4. «להשאיר את שלי» on all six

The hold is correct: it held a value nobody on this phone had seen, which is what it exists for. But "single writer" does not make the phone's value the true one. The contest is not this phone against another phone; it is the same person's evening-before record (2 Sept, 19:46 local, made on the phone) against a record the same person made in another window, at an unknown time, that put all six at אילון. Six workers at one site on one day reads like a seder that was sent, not noise.

The two records disagree on money: מוני is נעדר on the phone and a paid day (470) at אילון in the cloud; אחמד פרקד's day carries no rate stamp on the phone; four days are billed to גדרה or פרסדיה on the phone and to אילון in the cloud. So a blanket «להשאיר את שלי» is right only if those six were in fact at גדרה, פרסדיה and אלעד (and מוני absent) on 3 September — and wrong for the pay sheet and the אילון invoice otherwise. It should not be decided by "one writer, mine wins": that rule is exactly the refuted h6 fix, written by hand.

Recommendation: decide per row, not all six at once, after looking at what happened on 3 Sept — the other window if it is still open, the WhatsApp seder for that day, who was invoiced for אילון that fortnight. If the owner cannot say, keep the six held until he can; the other fifteen cells of 3 Sept already landed at the cutover, and a held row costs nothing until a pay sheet or invoice for that fortnight is drawn.
