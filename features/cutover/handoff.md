# Handoff — v104: the cutover reaches the phone

- Branch: `cd-work` → published as `claude/farkad-mobile-design-review-odl8ue`
- SHA: `976a88bc527362526301b0e3ef9db3f70718667b`
- Base: `da1e062` (v103 as served, `21c8e08`, plus docs and the rules workflow)
- Build stamps at the SHA above: `farkad-build` v104 · `APP_VERSION` v104 · `VERSION` farkad-v104
- Gates: `LEDGER_WRITES` false, `carryAdvances` false. Neither moved.

## Where this round came from
The owner published the repository's `firestore.rules` on 10 September at 19:45 and the
phone (v103, 194 queued operations) stayed refused with the same `permission-denied`
sentence. Two hunts and two refuters on the emulator: `features/cutover/findings.md`.

## What was fixed, and by which pair
| # | sev | pair | pinned by |
|---|---|---|---|
| cutover | P1 | `35bad60` → `976a88b` | tests/build.test.mjs «the production adapter hands the sync layer every operation it has» (3 red on the base: not forwarded: bootstrap, read) |

`window.FarkadSync.connect({...})` in js/sync/firebase-adapter.js now forwards
`bootstrap: ops.bootstrap` and `read: ops.read` beside update/save/create, with the
failure named in a comment. Nothing else in the code changed. The stamps moved because
the adapter is a cached file.

## Expectations moved deliberately
- None. tests/build.test.mjs gains one suite (29 → 32).

## Migrations
None. The cloud document takes its first protocol write (revision 1, the five protocol
fields) on the owner's first flush after the update; the queued work follows at revision
2. From that write on a phone still on v86 is refused until it updates
(`docs/sync-protocol.md` step 4). Rollback: revert `976a88b` and move the stamps.

## Test output (verbatim, release gate on the final SHA)
```
=== npm run test:release on 976a88bc527362526301b0e3ef9db3f70718667b at 17:41:06 v22.22.2
node tests/isolation.test.mjs: 18/18 checks passed
node tests/blobs.test.mjs: 11/11 checks passed
node tests/build.test.mjs: 32/32 checks passed
node tests/poison.test.mjs: 37/37 checks passed
node tests/merge.test.mjs: 28/28 checks passed
node tests/contested.test.mjs: 73/73 checks passed
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
node tests/smoke.mjs: 1130/1130 checks passed
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
59 suites · 6820/6820 checks
```

## The owner's scenario on the fix
The verifier evaluated the REAL `connect({...})` literal of the fixed tree (only the SDK
imports, the config and `window.FarkadSync` stubbed) and drove the reproduced situation
through it against the byte-identical rules on a private emulator: a v86 document (23
workers, 21 days, 2 advances, history copies for yesterday and today) and a v86-queued
disk (42 items: 35 day assignments, a roster edit, an advance, an absence; 45 queued
operations once this build adds the ledger mirror) opened by v104, signed in as an allowed
address. Six runs, three orderings of the first op and one with the revision-1 snapshot
arriving before the cutover's re-read: every run ended synced, pending 0, no error, the
cutover at revision 1 changing exactly [lastOpId, protocol, revision, updatedAt,
updatedBy] with the days byte-equal to the seed, the queue at revision 2 with the two
receipts, every recorded cell in the cloud, no conflict, no hold, and a reopen owing
nothing. Synced at 1.4–1.9 s, or ~5.4 s when the snapshot outran the cutover (the
rebuilt batch waits one ladder rung; the person may see «דורש הכרעה» for a few seconds
first). The same disk on the base literal: refused on every retry, 45 pending, the cloud
untouched — the emulator's line «evaluation error at L257:24 … Property revision is
undefined on object». The only refusal on the fix is the daily copy for a day whose
history document already exists (create-only, by design), logged and carried on.

## Contract items NOT completed
Nothing of this round is open. Not claimed: the owner's phone taking the update - that is the acceptance.

## Known gaps, measured and named
- **P1 for the next round, found by the reachability verifier and NOT fixed here**: for
  the v86-written part of a queue (items with no `seen`), the pre-send hold's older-build
  fallback trusts `document.updatedBy`, and the owner's own bootstrap has just signed the
  document — so a path another phone changed WHILE THE OWNER WAS AWAY is sent over that
  value at revision 2 and both say synced. Measured on the emulator with the real v86 tree
  (scenario A overwrites; a foreign bootstrap holds; a this-build queue holds). It needs
  another phone's write to the same path after the owner's queue began; the other two
  phones have not been used, so the owner's cutover is not exposed, and the person is
  asked to confirm that before updating. Fix direction: treat a legacy item as unheard
  whenever the server holds a value that is neither absent nor its own, ignoring the
  bootstrap's own signature (a `_bootstrappedBy` mark), pinned in
  tests/bootstrap.emulator.test.mjs.
- **The claim that a v86 phone "does not say synced" after the cutover is false**
  (firestore.rules ~69, docs/sync-protocol.md step 4): v86 has no honest-status gate and
  reads 'synced' on every snapshot while its writes are refused and its queue kept. The
  queue and the screen are safe; the sentence is not. The two v86 phones must update
  before they are used again; the documents get corrected in the next round.
- One genuinely contested v86-format path holds every v86-format op behind it (they
  share one batch key) until a person resolves it — safe, and the whole backlog waits.
- No iPhone has run v104 yet; the owner's phone is the first, and its queue landing is
  the acceptance.
- The Codex review's two notes on `.github/workflows/rules.yml` are open (the site deploys
  before the rules job; two runs can finish out of order); the workflow publishes nothing
  until the repository holds a key.
- Everything v103 lists, unchanged.
