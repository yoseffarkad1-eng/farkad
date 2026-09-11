# Handoff — v105: the held records, shown

- Branch: `cd-work` → published as `claude/farkad-mobile-design-review-odl8ue`
- SHA: `1e20111836fc45e86433bdd4b911eedeb8630c8a`
- Base: `473a573` (v104 as served, `67405c6`, plus the v104 handoff and release note)
- Build stamps at the SHA above: `farkad-build` v105 · `APP_VERSION` v105 · `VERSION` farkad-v105
- Gates: `LEDGER_WRITES` false, `carryAdvances` false. Neither moved.

## Where this round came from
The owner's phone took v104 on 10 September and its 194 queued operations went out: 188
landed, six were held, and the ⋯ panel read «הנתונים השתנו במכשיר אחר. הפעולה שלך לא
אבדה - רענן, בדוק את המסך, ואשר שוב. (6 ממתינים לשליחה)». Nothing on the phone said WHICH
six or what the cloud held there. The screen could not: a held operation is current on the
disk, and the journal lays it over every snapshot, so the day screen showed the phone's own
value. Re-recording the cells as the line advised would have sent the phone's value over
the other phone's record without anyone having seen it.

The six were named by reading the rescue export («ייצא נתונים גולמיים») on a laptop:

| path | this phone recorded | queued | the hold |
|---|---|---|---|
| days.2026-09-03.actual.w_07 (אחמד סקראן) | גדרה | 2 Sep 16:46:48Z | `farkad:outbox:hold:0mtkbwei4_c1eb7c5eda29` |
| days.2026-09-03.actual.w_22 (רגא) | פרסדיה | 2 Sep 16:47:13Z | `…hold:0mtkbwx9p_6943b24998cd` |
| days.2026-09-03.actual.w_23 (סטייק) | פרסדיה | 2 Sep 16:47:14Z | `…hold:0mtkbwxzj_2fa0151e0305` |
| days.2026-09-03.actual.w_24 (אבו ברהאן) | גדרה | 2 Sep 16:47:15Z | `…hold:0mtkbwz0h_d0f42d38d5b2` |
| days.2026-09-03.actual.w_b4f918fe822c (אחמד פרקד) | אלעד | 2 Sep 16:47:18Z | `…hold:0mtkbx1a5_3b9622368a75` |
| days.2026-09-03.actual.w_25 (מוני) | נעדר | 2 Sep 16:47:52Z | `…hold:0mtkbxrmy_33ab08e5ec4b` |

Each of the six carries `seen` = [the empty day, the same six at פרסדיה a minute earlier,
absent] and names the earlier operation in `after`. The hold means the cloud held, at each
of those six paths, a value outside that list and different from the phone's own — a
third value nobody on this phone had seen. The export does not carry the cloud's side (the
base document is memory), so what the other writer recorded is not known from the file;
this build is what shows it. The outbox otherwise read clean: 176 physical operations,
45 current, exactly the six unsent, 93 superseded by later operations that had landed,
38 legacy items retired; no unreadable key, no quarantine.

## What was built, and by which pair
| # | sev | pair | pinned by |
|---|---|---|---|
| held | P2 | `4fd8ae1` → `47432e2`, `8cb26fc` | tests/held.test.mjs (45, new; the base stops at «heldRecords is not a function»); tests/smoke.mjs «the held records, with both sides» (12, new; the base has no #heldRecords) |
| export | P3 | `8b895fa` → `33936ff` | tests/held.test.mjs «the rescue export carries the held records, both sides, raw» (+6; 47/51 on the tree before the fix) |
| review 1 | P1 | `a91cb44` → `1e20111` | «a cloud that moved while the question was open is not answered» (7 red before: the row's stale cloud value went out over the other phone's newer record, and both said synced) |
| review 2 | P2 | same pair | «a hold the disk would not take is released by the same decision, in the same session» (2 red: `_heldNow` had no way out but a reopen — pre-existing for a day-screen edit too) |
| review 3 | P2 | same pair | «a rate that differs is said whatever the sites say» (1 red) |
| review 4 | P3 | same pair | «with no dialog to ask through, taking the cloud's is refused» (setup red: the fallback said yes) |
| review 5 | P3 | same pair | «a held advance is named; a held ledger entry says it has no way out here» (2 red) |
| review 6 | P3 | same pair | «a worker no longer on the roster is named as such» (1 red) |
| review 7 | P3 | same pair | «the status line and the panel answer from the same set» (1 red: `holdingContested` asked the physical set; «contested» over an empty panel) |
| review 8 | P3 | same pair | tests/smoke.mjs «a held list that will not read is said, not hidden» (+1) |

- `FarkadSync.heldRecords()` (js/sync/sync.js, beside `holdingContested`): every held
  operation off the projection with `path`, `opId`, `mine`, `cloud` (the base document's
  value at the path, `undefined` where it holds nothing) and `heard` (false when no
  snapshot has arrived this session). Values cloned on the way out.
- js/ui/settings.js: `describeHeldRecord(row, schedule)` — pure; the title «יום חמישי
  03/09 · ⁨אחמד סקראן⁩», the two sides in the day screen's words (site names isolated,
  «נעדר», «טרם נרשם», «אין רישום»; «(כפול)», «(נוספות +h)»; the stamped daily rate only
  when the sites agree and the bytes do not; «(הענן כבר מחזיק את אותו רישום)» when they
  agree), `decidable` and `takeable`. `resolveHeldRecord(row, takeCloud)` — keeping
  re-issues the same bytes as a new operation through `State.commit` on the same path;
  taking asks `askConfirm` with both sides in the question and then writes the cloud's
  record exactly (stamp and all), or `clearWorkerDay` when the cloud holds nothing there.
  `renderHeldRecords()` draws the rows into `#heldRecords` under the sync reason line;
  the box is hidden, whole, while nothing is held.
- index.html: `#heldRecords` in the ענן וסנכרון group. css/app.css: `.held-*`, the two
  answers at the 44px floor outright.
- js/ui/backup.js: the rescue export («ייצא נתונים גולמיים») carries `held` - every held
  path with this device's bytes, the cloud's last-heard bytes and `heard` - so the next
  file answers the question this round's file could not.
- The stamps moved to v105: settings.js, sync.js, backup.js, index.html and app.css are
  cached files.

## The adversarial review, and what it changed
One reviewer, read-only, against `4fd8ae1..8cb26fc`, with four reproductions of its own
(`stale.mjs`, `heldnow.mjs`, `physical.mjs`, `describe.mjs`). Nine findings; eight taken,
each first as a red check. The P1: the row is a reading of the base document, and a
snapshot that arrives while «לקחת מהענן?» is open changes the cloud's side under the
question — the answer went through with the row's value, the sync layer let it out
(`seen` is stamped at commit time with the new base), and the other phone's newer
correction was overwritten with both phones saying synced. Now `resolveHeldRecord`
re-reads the held rows at the moment of the decision, after the confirmation, and
refuses with «הרישום בענן השתנה בזמן שהחלון היה פתוח…» and a redraw when either side
moved; the same for keeping. The ninth (every render rebuilt the rows, so a button could
be replaced under a finger) is mitigated: the rows are rebuilt only when their signature
— both sides, bytes and all — changed.

Two of the fixes are in the sync layer and are not cosmetic: `queueOperations` now
releases a path from `_heldNow` the moment a fresh operation on it is on the disk (the
loser is superseded by record; before this, a hold whose marker the disk refused blocked
the way out until a reopen — for the ⋯ button and for a day-screen edit alike), and
`holdingContested` answers from the projection, like the panel. Both are pinned in
tests/held.test.mjs; contested 73, status 37, cas 88, probes 35, concurrency 46,
samefact 37, data 1949, fence 35, adversarial 116, receipt 28 and merge 28 did not move.

## Expectations moved deliberately
- None. Two suites gained checks: tests/held.test.mjs is new (73: 45 for the panel, 6
  for the export, 22 from the review) and tests/smoke.mjs gains 13 in one section. The panel's six group headings, the one primary action and
  every pinned sentence are unchanged.

## Migrations
None. No number moved, no byte on the wire changed: both answers are the fresh explicit
edit that has been the way out of a hold since v91 (tests/contested.test.mjs «a fresh
explicit edit of the same path supersedes the held one»). Rollback: revert `1e20111`, `33936ff`,
`8cb26fc` and `47432e2` and move the stamps.

## Test output (verbatim, release gate on the final SHA)
```
=== npm run test:release on 1e20111836fc45e86433bdd4b911eedeb8630c8a at 05:32:57 v22.22.2
node tests/isolation.test.mjs: 18/18 checks passed
node tests/blobs.test.mjs: 11/11 checks passed
node tests/build.test.mjs: 32/32 checks passed
node tests/poison.test.mjs: 37/37 checks passed
node tests/merge.test.mjs: 28/28 checks passed
node tests/contested.test.mjs: 73/73 checks passed
node tests/held.test.mjs: 73/73 checks passed
node tests/receipt.test.mjs: 28/28 checks passed
node tests/data.test.mjs: 1949/1949 checks passed
node tests/recovery.test.mjs: 75/75 checks passed
node tests/adversarial.test.mjs: 116/116 checks passed
node tests/probes.test.mjs: 35/35 checks passed
node tests/capacity.test.mjs: 44/44 checks passed
node tests/concurrency.test.mjs: 46/46 checks passed
node tests/exports.test.mjs: 73/73 checks passed
node tests/fence.test.mjs: 35/35 checks passed
node tests/fence.ingress.test.mjs: 43/43 checks passed
node tests/fence.legacy.test.mjs: 21/21 checks passed
node tests/money.history.test.mjs: 9/9 checks passed
node tests/money.units.test.mjs: 21/21 checks passed
node tests/money.cloud.test.mjs: 17/17 checks passed
node tests/money.display.test.mjs: 4/4 checks passed
node tests/snapshot.poison.test.mjs: 82/82 checks passed
node tests/samefact.test.mjs: 37/37 checks passed
node tests/wording.test.mjs: 37/37 checks passed
node tests/closure.test.mjs: 122/122 checks passed
node tests/closure.echo.test.mjs: 79/79 checks passed
node tests/correction.test.mjs: 33/33 checks passed
node tests/quarantine.test.mjs: 82/82 checks passed
node tests/approval.test.mjs: 72/72 checks passed
node tests/repayment.test.mjs: 240/240 checks passed
node tests/ledger.ingress.test.mjs: 151/151 checks passed
node tests/cas.test.mjs: 88/88 checks passed
node tests/status.test.mjs: 37/37 checks passed
node tests/money.test.mjs: 40/40 checks passed
node tests/money.ingress.test.mjs: 206/206 checks passed
node tests/method.test.mjs: 51/51 checks passed
node tests/restore.test.mjs: 51/51 checks passed
node tests/upgrade.test.mjs: 48/48 checks passed
node tests/vehicles.test.mjs: 61/61 checks passed
node tests/xlsx.test.mjs: 74/74 checks passed
node tests/nonassertions.test.mjs: 23/23 checks passed
node tests/labels.test.mjs: 23/23 checks passed
node tests/labelcache.test.mjs: 32/32 checks passed
node tests/smoke.mjs: 1142/1142 checks passed
node tests/print.test.mjs: 78/78 checks passed
node tests/mobile.test.mjs: 807/807 checks passed
node tests/update.test.mjs: 30/30 checks passed
node tests/forms.browser.mjs: 10/10 checks passed
node tests/recovery.browser.mjs: 25/25 checks passed
node tests/handover.test.mjs: 26/26 checks passed
node tests/swrestart.test.mjs: 31/31 checks passed
node tests/swidentity.test.mjs: 55/55 checks passed
node tests/sendclaim.test.mjs: 43/43 checks passed
firebase emulators:exec --only firestore "node tests/rules.test.mjs": 59/59 checks passed
firebase emulators:exec --only firestore "node tests/cas.emulator.test.mjs": 24/24 checks passed
firebase emulators:exec --only firestore "node tests/rollout.test.mjs": 17/17 checks passed
firebase emulators:exec --only firestore "node tests/bootstrap.emulator.test.mjs": 23/23 checks passed
firebase emulators:exec --only firestore "node tests/bootstrap.rules.test.mjs": 28/28 checks passed
firebase emulators:exec --only firestore "node tests/money.concurrency.test.mjs": 50/50 checks passed
EXIT=0
60 suites · 6905/6905 checks
```

## Contract items NOT completed
No contract was written for this round: nothing touching money, sync's wire or the
record's shape changed. Not claimed: the owner's phone taking the update and the six rows
being decided there — that is the acceptance, and it is the owner's. Not claimed either:
what the cloud holds at the six paths; the build shows it, this file does not know it.

## The owner's statement, and what it changed
The owner said no phone but theirs had touched the app; then the v105 panel on that phone
showed «בענן: אילון» on all six rows — the cloud holds the six at one site, אילון (p_02),
where the phone holds גדרה / פרסדיה / אלעד / נעדר. A hunt of five hypotheses with
refuters (`findings.md` in this directory) reproduced one mechanism and refuted the
rest: a SECOND WINDOW of the same person — the Safari tab beside the home-screen app on
one iPhone, or a laptop tab — still running the cached v86 build recorded 3 September at
אילון for those six, and the v86 rules accepted it, while every write from this app's
v95+ builds was refused until v104. The hold was correct; the comparison was not at
fault; and "one writer" did not make this phone's value the true one — the two records
disagree on money (מוני absent here, a paid day at אילון there). The decision stays with
the person, per row, through the v105 panel; the owner recognised the אילון rows as the
old build's scrambling.

For v106, from the findings: (1) the hold cannot SAY who wrote the value — the bootstrap
signs the document with this phone's id before the base is read — so the bootstrap
transaction should capture the pre-cutover `updatedBy`/`updatedAt` and the hold record,
`heldRecords()`, the panel and the rescue export should carry them; (2) the panel's lead
sentence says «מכשיר אחר», and the other writer can be another window of the same
person — the wording moves with its pins; (3) operationally, every other window or tab
of the app is closed, and the Firebase console's `history/2026-09-03` copy names the
context that opened that day first.

## Known gaps, measured and named
- A held roster record, advance or ledger entry is listed with «לשחרור: ערוך את הרישום
  הזה שוב מהמסך שלו.» and no button. For an advance or a ledger entry that sentence is
  weak: a re-recorded advance is a new id, not the same path, so the held one stays held
  and stays counted. No such hold exists on the owner's phone; it is named here so the
  next person does not learn it from a phone.
- A decision made from the panel is not on the undo stack. The day screen's ✕ and the
  sheet still edit the same path afterwards, which is the same way out.
- A held advance or ledger entry has no button: the advance row now names the person,
  the day and the sum, and the ledger row says it has no way out from this screen. A
  held ledger entry stays held and stays counted until the ledger's own round handles it.
- A tap that lands in the instant a row is being rebuilt (the rows change only when a
  snapshot moves them now) still lands on nothing; the redraw then shows the new sides.
  Not measured in a browser.
- Everything v104 lists, unchanged: the P1 for a v86-written queue after this phone's own
  cutover; the false claim in firestore.rules ~69 and docs/sync-protocol.md step 4 that a
  v86 phone «does not say synced»; the two Codex notes on `.github/workflows/rules.yml`;
  the other two phones on v86, not in use.

## Verification of this handoff
Every count above names the commit it was measured on. The gate ran once on `1e20111836fc45e86433bdd4b911eedeb8630c8a`
from `/home/user/v105-gate`, a detached worktree clean at that commit, Node v22.22.2,
`.gate-release.log` there; the counts in tests/README.md were copied from that log and
from nothing else.
