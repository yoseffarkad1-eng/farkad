# Handoff — v98: the storm closed (a phone held by its own closure), and the by-site grid's short dates

- Branch: `cd-work` → published as `claude/farkad-mobile-design-review-odl8ue`
- SHA: `1e3f0925803dee3b6c175acb694d17d60d0b45ac`
- Base: `7e57333` (v97 as served, `4fe7c9a`, plus its release-note commit)
- Build stamps at the SHA above: `farkad-build` v98 · `APP_VERSION` v98 · `VERSION` farkad-v98
- Gates: `LEDGER_WRITES` false, `carryAdvances` false. Neither moved.

## Where this round came from
The v97 release gate's first run on `f718367` was red in one emulator suite — the
money-concurrency storm, 43/50 — and green on its second run and in nine isolated runs.
Two hunts (reproduce under load; read the code) and two refuters explained it:
`features/storm/findings.md`. This round is the fix, as fail-first pairs, with the storm
run repeatedly under load afterwards.

## What was fixed, and by which pair
| # | sev | pair | pinned by |
|---|---|---|---|
| S1 | P1 (behind the carry gate) | `e6542fb` → `4198d28` | tests/closure.echo.test.mjs (new, 79 checks; joins `npm test` as `test:closure-echo`): every writer's entry equals its own JSON round-trip through both comparators; the storm with the closure landing FIRST converges; the usual order still converges |
| S2 | P3 | `3533c1c` → `b306931` | tests/closure.test.mjs «a closed fortnight's frozen days carry the extra hours they were priced with» |
| D2 | product decision | `923a817` → `899b9ab` | tests/smoke.mjs (beside the site-bars reads: «שני 10/08», «שלישי 11/08», the period line still with the year); tests/print.test.mjs (the row without /2026, the year on the paper exactly once); tests/xlsx.test.mjs and tests/exports.test.mjs (the exported פירוט rows STILL carry the year) |

**S1.** Three sites in js/model/ledger.js, each commented with the failure: `closureFacts`
builds `{ placeId }` and adds `rate`/`hours` only when defined; `appendLedgerEntry` strips
`undefined` at every depth (`withoutUndefined`: a record loses the key, a list element
becomes `null`, as JSON would); `sameLedgerBytes`' `stable()` skips own undefined keys and
renders an undefined list element as `null`, `sameLedgerFact`'s `facts()` skips undefined
too — a key holding `null`, `0`, `''`, `false`, `NaN`, `[]` or `{}` is still a byte, pinned
by the verifier's 20,000-value fuzz. `js/sync/sync.js` is untouched: no test needed it. The
suite pins (a) the round-trip for the carry approval, the mirror origin, a new advance's
origin, a repayment with and without a method, a reversal, a correction, and a closure's
two entries; (b) two phones on the fake cloud, A's closure landing before B's correction:
both synced, neither blocked, nothing conflicted, Recovery empty, the records equal field
for field and equal to the cloud's, every event once, and reopens of both owing exactly
the fresh advance's origin; (c) the usual order through the same checks.

**S2.** `closureFacts` read `one.hours` off live entries whose field is `extraHours`; it now
reads `extraHours`, falling back to `hours` when the day list handed in is already frozen,
so writer and reader agree on `hours` on the record, only where hours were worked.

## Expectations moved deliberately
- None moved. tests/closure.echo.test.mjs is new; tests/closure.test.mjs gains one suite
  (95 → 103); tests/README.md and CLAUDE.md count the new node suite (forty-three).
- None for D2 either: the by-site grid's date rows had no pin; the new checks pin the short
  form on screen and paper and the full date in the file.

## Migrations
None. A closure entry written by this build has no nested keys holding `undefined` — JSON
never had them, so an entry on the disk or on the wire is unchanged in bytes; only the
object a phone kept in memory between the write and the next snapshot differs. A v97
phone sharing a record with this build reads and writes the same bytes. `js/model/ledger.js`
is a cached file, so the three stamps moved. Rollback: revert the merge commit.

## Test output (verbatim, release gate on the final SHA)
```
=== npm run test:release on 1e3f0925803dee3b6c175acb694d17d60d0b45ac at 16:20:23 v22.22.2
node tests/isolation.test.mjs: 18/18 checks passed
node tests/blobs.test.mjs: 11/11 checks passed
node tests/build.test.mjs: 29/29 checks passed
node tests/poison.test.mjs: 37/37 checks passed
node tests/merge.test.mjs: 28/28 checks passed
node tests/contested.test.mjs: 73/73 checks passed
node tests/receipt.test.mjs: 28/28 checks passed
node tests/data.test.mjs: 1944/1944 checks passed
node tests/recovery.test.mjs: 75/75 checks passed
node tests/adversarial.test.mjs: 116/116 checks passed
node tests/probes.test.mjs: 35/35 checks passed
node tests/capacity.test.mjs: 44/44 checks passed
node tests/concurrency.test.mjs: 46/46 checks passed
node tests/exports.test.mjs: 70/70 checks passed
node tests/fence.test.mjs: 35/35 checks passed
node tests/fence.ingress.test.mjs: 43/43 checks passed
node tests/fence.legacy.test.mjs: 21/21 checks passed
node tests/money.history.test.mjs: 9/9 checks passed
node tests/money.units.test.mjs: 21/21 checks passed
node tests/money.cloud.test.mjs: 17/17 checks passed
node tests/money.display.test.mjs: 4/4 checks passed
node tests/snapshot.poison.test.mjs: 82/82 checks passed
node tests/samefact.test.mjs: 24/24 checks passed
node tests/wording.test.mjs: 36/36 checks passed
node tests/closure.test.mjs: 103/103 checks passed
node tests/closure.echo.test.mjs: 79/79 checks passed
node tests/correction.test.mjs: 33/33 checks passed
node tests/quarantine.test.mjs: 82/82 checks passed
node tests/approval.test.mjs: 72/72 checks passed
node tests/repayment.test.mjs: 240/240 checks passed
node tests/ledger.ingress.test.mjs: 151/151 checks passed
node tests/cas.test.mjs: 88/88 checks passed
node tests/status.test.mjs: 29/29 checks passed
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
node tests/smoke.mjs: 1124/1124 checks passed
node tests/print.test.mjs: 78/78 checks passed
node tests/mobile.test.mjs: 709/709 checks passed
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
59 suites · 6664/6664 checks
```

## The storm suite, repeatedly
All on the fix commit `b306931`, the shipped `tests/money.concurrency.test.mjs` with only its
emulator address read from `FIRESTORE_EMULATOR_HOST`, a cold `firebase emulators:exec` per
run on a private port, three busy-loop processes alongside for the verifier's runs:

| who | what | runs | result |
|---|---|---|---|
| the implementer | the shipped storm suite, cold | 5 | 50/50 every run |
| the verifier | the shipped storm suite, cold, under load | 5 | 50/50 every run |
| the merger | the shipped storm suite, cold | 2 | 50/50 every run |
| the merger | the hunt's forced-order variant (the closer's write allowed to land first — 1/1 red before the fix) | 3 | 50/50 every run |

Twelve shipped and three forced runs, none red; before the fix the same shipped suite was
red 4 of 28 under load and the forced variant 1 of 1.

## Contract items NOT completed
Nothing of this round is open. Not claimed: physical-device coverage; the money gates stay shut.

## Known gaps, measured and named
- Two things found on the way and not fixed here (`features/storm/findings.md`, "found on
  the way"): a closure judged impossible under clock skew, and a refused approval write
  leaving a phone 'contested' once in twenty-eight runs. Both behind the shut gates.
- Everything the v97 handoff lists: no iPhone has run any of it; the rules deploy is by hand.
