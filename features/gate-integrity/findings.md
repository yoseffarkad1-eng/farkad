# Gate integrity, and the diff — findings

Audited at `f182e03` (the branch tip; the brief named `696ee86`, three commits earlier —
`a0d4f1c`, `c4f54f6`, `f182e03` landed from a parallel session while this audit ran).
Nothing here is a fix. The only files written are this one and `tests/gate.integrity.test.mjs`.

**The working tree is shared and live.** Other sessions committed and edited underneath this
audit. Every measurement below names the moment it was taken.

---

## 1. Orphan suites — none, among tracked files

Method, not assumption: `package.json`'s script graph is *resolved* (`npm test` is a chain of
`npm run test:x`, three levels deep in places), the leaf commands are matched for
`tests/*.mjs`, and the result is differenced against `git ls-files tests`.

- 76 tracked `.mjs` in `tests/`.
- 66 are reachable from `npm run test:release`; 10 are helpers.
- **Orphans: none.**

The gates nest cleanly: `npm test` (48 suites) ⊂ `test:all` (58) ⊂ `test:release` (66). The
eight the default gates do not reach are the seven emulator suites and `sendclaim` — which is
what `package.json` says they are, not an accident.

The ten helpers are correctly *not* orphans: `harness.mjs`, `runner.mjs`, `serve.mjs`,
`pdf.mjs`, `treecheck.mjs`, `moneydom.mjs`, `nodes.mjs`, `shell.mjs`,
`exports-proof.lib.mjs` are imported by suites; `shot.mjs` is `npm run shot` and asserts
nothing by design.

### Live, uncommitted orphan risk for the integration owner

While this audit ran, six untracked `.mjs` appeared in `tests/` from concurrent sessions, none
named by any script:

    exports-proof.offline.mjs   ledger.truth.test.mjs   overlap.restore.test.mjs
    races.tabs.test.mjs         refute.roster.mjs       startup.blank.test.mjs

They are work in progress, not a defect at `f182e03`. But a suite that lands without a
`package.json` entry is a guard nobody runs, and that is how the previous crop got in.
`tests/gate.integrity.test.mjs` will keep saying so until each is wired or deleted.

---

## 2. Swallowed failures

**Checked; one real finding, and the category is otherwise clean.**

Every `catch` in the corpus that turns a failure into a pass was read. The overwhelming
majority are correct and fail *closed*:

- `blobs.test.mjs:94`, `treecheck.mjs:85` — `catch { return true }` means "treat as a
  symlink", i.e. reject. Correct direction.
- `bootstrap.rules.test.mjs:99` — `try { await p; return false } catch { return true }` is
  the "was it denied?" helper. Correct.
- `blobs.test.mjs:213` — a missing `treecheck.mjs` yields `{ ok: true }` against a check that
  demands `ok === false`, so the suite fails. Correct.
- `rules.test.mjs:50,55` — `check(name, true)` is reached only after `assertSucceeds` /
  `assertFails` resolved; the catch reports `false`. Not vacuous.
- `data.test.mjs:1632`, `data.test.mjs:2827`, `receipt.test.mjs:117`,
  `quarantine.test.mjs:447` — `.catch(() => {})` on the operation under test, followed by
  assertions on the observable state. Correct idiom, not a swallow.
- `recovery.test.mjs:781-782` — swallows a throw from writing a frozen flag; the assertion is
  on the read-back value. Correct.

**FINDING G-1 — `tests/sendclaim.test.mjs:200`**

    try { done = want(key, value); } catch (error) { done = true; }

A predicate that *throws* is treated as a predicate that *succeeded*: the re-arming read hook
stops, and the test proceeds as though the interleave condition had been met. A bug inside
`want` is indistinguishable from the thing the test is waiting for. Severity: low (release-only
suite, and the surrounding checks would likely still fail), but it is the one place in the
corpus where an exception is converted into "done".

### `.then(() => true, () => false)` — all twenty-one asserted

Every site was traced. The booleans are either asserted in place or returned from a helper
(`crossTo` → `{offered, crossed}`, `installAndWait` → `{full, waiting, bad}`) and asserted at
every call site (`swidentity.test.mjs:579,591,748,862,913,1090,1188,1279`;
`swrestart.test.mjs:604,619`). No `false` is dropped.

### Early `process.exit`

Ten sites. All are stops, not silent passes: `runner.mjs:34` (`given`, exit 2),
`runner.mjs:45` / `smoke.mjs:8486` / `update.test.mjs:435` / `recovery.browser.mjs:392`
(`exit(failed ? 1 : 0)`), and the browser suites' own setup guards
(`handover.test.mjs:166`, `swidentity.test.mjs:100`, `swrestart.test.mjs:156`,
`update.test.mjs:47`), all exit 2. `shot.mjs:52` exits 0 and asserts nothing, by design and
outside every gate. **Nothing turns a nonzero exit into a success.**

Worth naming, not a defect: when `given` fails the run stops *before* `report()`, so no
`n/m checks passed` line is printed. Exit code 2 is unambiguous, but an operator reading only
stdout sees a run with no count. That is deliberate (`runner.mjs`'s own comment) and correct.

---

## 3. Vacuous assertions

**Checked; clean.** The repository already instruments this itself:
`tests/nonassertions.test.mjs` runs in `npm test` and enforces five rules —
V1 length-tautology, V2 `|| true`, V3 literal condition, V4 self-compare, V5
assignment-in-condition — proved against written offenders and near-misses. It is green on
this head (23/23).

Independent sweeps for `check(name, true)`, `same(x, x)`, and conditions that cannot be false
found only the instrument's own fixtures (`nonassertions.test.mjs:362,379`) and the two
correct `rules.test.mjs` helpers above.

**What the instrument does not cover**, and what `tests/gate.integrity.test.mjs` now adds:
an assertion on a value the test just wrote with no round trip has no rule; a discarded
`settleUntil` result has no rule; an async predicate handed to a synchronous poller has no
rule; and the re-rooting rule names only two variables (see §5).

---

## 4. Waited assertions — the timeout count on this head

**ZERO timeouts.**

Method: `tests/harness.mjs`'s `settleUntil` was temporarily instrumented to append the
limit and the calling site to a log on every timeout, `npm test` was run once end to end, and
the log was collected.

- Result: `npm test` exit 0, **48 suites, 4644/4644 checks passed, 0 settleUntil timeouts.**
- The instrument was proved non-vacuous: a forced `settleUntil(() => false, 60)` returned
  `false` and wrote its `TIMEOUT` line.
- **`tests/harness.mjs` was then restored byte for byte.** Verified by sha256:
  `dc95452e99ee72549f12903cf44c3da6f0b98f3659baed0dce3894f8412c7c19`, identical before and
  after, and `git diff` shows no change to it.

Caveat, stated rather than hidden: this was run **in the shared working tree, not a clean
detached worktree**, contrary to `CLAUDE.md`. At the moment the run started the production
tree was clean — proved by `blobs.test.mjs`'s own "no tracked production file is modified"
check passing as the second suite in the chain. Concurrent sessions modified
`js/ui/backup.js`, `js/ui/reports.js` and `js/ui/share.js` minutes later. The integration
owner's gate run is the authority on the count; this one is the authority on the timeouts.

### The structural problem behind the count

`settleUntil` returns `false` on timeout. Of 103 call sites outside the harness, **99 discard
that boolean.** A barrier that silently gives up is followed by an assertion that then fails
for the wrong reason — or, worse, passes because the state happened to arrive during the next
`settle()`. Zero timeouts today is a fact about today's machine, not a guarantee: on a slower
or more loaded runner these become flakes whose failure message points at the wrong line.
Four sites do it right (e.g. `data.test.mjs:633,2933,3123`, which pass the result into
`check`). This is a real, deferred hazard, not a present failure.

**FINDING G-2 — `tests/bootstrap.emulator.test.mjs:223, 267, 330, 365, 421`**

Five barriers that **never wait at all.** `settleUntil` reads its predicate synchronously
(`if (ready()) return true`). These five hand it `async () => {...}`. An async function
returns a Promise, a Promise is always truthy, so `settleUntil` returns `true` on the first
iteration — it never polls, never evaluates the condition, and the `8000, 100` it was given is
decoration. What actually gives the emulator time is the `await settle(400)` on the next line.
The returned Promise is also never awaited or caught, so a rejecting `readDoc()` is an
unhandled rejection. The suites may still pass; the barriers do not exist.

---

## 5. Cross-checkout imports

`tests/isolation.test.mjs` and `tests/blobs.test.mjs` still guard this, and both are green
(18/18 and its own count). Their hand-kept lists:

- **`isolation.test.mjs:214` — the SMOKE_URL list is CURRENT.** A live scan returns exactly
  `exports-proof.print.mjs, forms.browser.mjs, mobile.test.mjs, print.test.mjs,
  recovery.browser.mjs, smoke.mjs`, which is the pinned list.
- Soft note: that `same()` is filtered by `.filter(name => files.includes(name))` on both
  sides, so *deleting* one of the six would pass silently. It catches additions, which is the
  direction that matters, but the filter weakens it.

**FINDING G-3 — the re-rooting rule names only two variables.**
`isolation.test.mjs:209` bans a suite reading `FARKAD_REPO` or `FARKAD_EXPECT_SHA` for
itself; `blobs.test.mjs:139` binds `FARKAD_REPO`/`SMOKE_URL` to a commit. Two other
environment variables choose which **bytes** a suite reads and are bound to nothing:

| file:line | variable | what it re-roots |
|---|---|---|
| `tests/sendclaim.test.mjs:52` | `FARKAD_ROOT` | the whole checkout the suite imports `harness.mjs` and `runner.mjs` from |
| `tests/exports-proof.lib.mjs:21` | `FARKAD_SHEETJS` | the SheetJS bytes the export proof calls "THE SHIPPED BYTES" |
| `tests/money.ingress.test.mjs:70` | `FARKAD_SHEETJS` | the same |

`sendclaim.test.mjs` is the sharper one: `findRoot()` also climbs from `process.cwd()` and
takes the first directory containing `tests/harness.mjs`, so it can silently consume a
neighbouring checkout with no variable set at all. It is a release-only suite, which is
exactly where "this ran against commit X" is being claimed.

No test imports a production file by absolute path or from a copied tree — that half is clean
and proved by both existing guards.

---

## 6. Production-file hash table

The 18 files `tests/harness.mjs` loads into every Node device, sha256 of the **Git blob** at
`696ee86` (identical at `f182e03` — no shell file changed in the last three commits):

| sha256 | file |
|---|---|
| `9de1b740d357738c5b65bee2e27e281978b7e7c31fe06d1bb802911ead704b95` | `js/dates.js` |
| `76f73a5118c1b01bbba4c007a20237f0a99d47adc885ee5ccf99b9862afb6083` | `js/ui/dom.js` |
| `6fbff9656fa948624e257acb4afb27ddb330e76d59e318dcae4ba63fbe3e3c8b` | `js/store.js` |
| `5ccf0ba99ec7e8969911c94d1ea933e12ecbb6b7b0e6249968f8fc5c57cc292a` | `js/recovery.js` |
| `c4d47c1eb53f421a11389d016aaeb3f4760ffa6b03de3956192119ed826457b8` | `js/model/schema.js` |
| `5e91fed06fd76f133bd0a0c30aa9a5c5ecb3114e83be309523fac06531788a0f` | `js/model/money.js` |
| `d6574d83cdb6d017aa6ca919281f34254e4afa50dbece938812ef6beab6692f7` | `js/model/migrate.js` |
| `927135fed318db5750dbfee0a02efedd05f97660539cb0013b7ce11a59f666d1` | `js/model/ledger.js` |
| `a7bc43cb4d455d681443d0f1d4ce547a9725d80f0dd8680cf93bfe59c89c71dd` | `js/state.js` |
| `d3c1be926826e92173955d2982805ea2182cd9d32539e1ed6cbde71ca57eefcc` | `js/sync/sync.js` |
| `02c2ab4d9df41fcb8525dc0c8adcb5237788f055474eb3ed4492eb02e2c119c2` | `js/sync/restore.js` |
| `8aa66be6239bbea48b3cd531c145ff8214ae36d706d13fa624e1baf3c8291c59` | `js/sync/receive.js` |
| `cda9c08b1af95e19f84f6599efad60e9a44d469239f816cad60efe04bf87d0e4` | `js/sync/send.js` |
| `b316d25dfcb1b2a076b1ab4ce7e04a1c1b924c89c3dfdcb30e0b2babbea760fe` | `js/sync/status.js` |
| `cae206829c3ed47ab8e35d5e1335b887f0a2c3826084c9076233c83385cac6d3` | `js/sync/boot.js` |
| `8755401f6969bfa6a5077db467ce0f2a601309dd02a40f763eb81110e78f5637` | `js/ui/share.js` |
| `26b8096ce32f869a3affcbd55e0887dbfb51568bcc47356998bad58d9c204e33` | `js/ui/backup.js` |
| `06eaeb7e2787964fe963e05bf4260fd5fb1eef6f0e901f14c0fea138f0969169` | `js/ui/roster.js` |

At the time of writing, the **working tree** copies of `js/ui/share.js` and `js/ui/backup.js`
differ from these blobs — a concurrent session's uncommitted edits. `blobs.test.mjs` catches
exactly that and would now be red; the table above is the commit's answer, which is the one
that keeps.

Note on coverage: the Node harness loads 18 files. The rest of the app —
`js/ui/day.js`, `sheet.js`, `reports.js`, `week.js`, `settings.js`, `printout.js`,
`offline.js` and the CSS — is only ever exercised through the browser suites, which hash what
the origin *served* rather than going through `loadedSources()`.

---

## 7. Per-commit scope review — 11 commits, `origin/main..f182e03`

| commit | in scope? |
|---|---|
| `da4ed01` A restore puts the work back. It does not put the money back. | Yes. One file, `features/restore-ledger/contract.md`. Contract before code, per the repo's own habit. |
| `2459639` O1: a restore replaces the work record and keeps the money | Yes. `js/sync/restore.js` + its suite + the audit doc it answers. Nothing else. |
| `23c40db` The rollout order is derived from eight measured cells | Yes. The new matrix suite, its `package.json` wiring, and the three documents whose claims it replaces. The `CLAUDE.md` +2 is the new suite's line in the file list — required by convention. |
| `a45de88` The iPhone: a third bar nobody measured… | Yes, though the subject undersells it. The body explicitly covers the five export defects, which is what `money.test.mjs` (+12) and `xlsx.test.mjs` (+9) are. Both are pinned-expectation moves with the reason written in the same commit — iron law 6 satisfied. The `isolation.test.mjs` ±8 adds `exports-proof.print.mjs` to the hand-kept SMOKE_URL list, which the new browser suite required. |
| `30fe642` O2: a roster edit carries what the person touched | Yes. Model + sync + its suite + `package.json`; the `rules.test.mjs` +48 is the server half of the same per-entity paths. |
| `79d6210` v104: the three stamps… | Yes. Stamps, releases, acceptance rows. |
| `c7afe7f` Two pinned expectations move | Yes. Both moves carry their reason inline. It also *adds* one new check (`roster.workers.w_09` carries him, not the legacy array) — a strengthening the subject does not mention. Minor. |
| `696ee86` An upgraded disk records that it saw nothing | Content in scope. **Stamp discipline is not — see FINDING G-4.** |
| `a0d4f1c` An acceptance bundle | Yes. `tools/acceptance-bundle.sh` + the acceptance doc. |
| `c4f54f6` The bundle neutralises the live project | Yes, and it is the right call: it overwrites the staged config with the local-only shape *and reads it back*. |
| `f182e03` The bundle reads the app's file names | Yes. Nine lines, exactly what the message says. |

**FINDING G-4 — iron law 5 is broken at the branch tip.**
`696ee86` changed `js/sync/receive.js` (+168/−14), which is in `sw.js`'s `SHELL`
(`sw.js:39`), and did **not** move the three build stamps. They were last moved by `79d6210`,
two commits earlier. `index.html`, `js/app.js` and `sw.js` all still say `v104`, over
`receive.js` bytes that are not the `v104` those stamps named.

`tests/build.test.mjs` cannot catch this: it proves the three stamps agree *with each other*
(lines 49-51), never that they moved with the bytes. A phone already holding `v104` would
never be offered this change — the exact failure iron law 5 and law 7 exist to prevent. The
stamps need to go to `v105` before this ships.

---

## 8. Secrets and real config — the unambiguous answer

**`js/sync/firebase-config.js` is NOT the empty local-only shape.** It carries the live
project:

    apiKey: "AIzaSyC1hOWJZ…"   (real, redacted here)
    projectId: "farkad-schedule"
    authDomain / storageBucket / messagingSenderId / appId — all real

This is **pre-existing on `origin/main`** (since `56eb023`, "Turn on cloud sync") and
**unchanged by this branch** — `git diff origin/main..HEAD -- js/sync/firebase-config.js` is
empty. It is tracked, not gitignored.

It is not a secret in the security sense: a Firebase web config is public by design, the file
says so, and `firestore.rules` is what enforces access. But it does contradict `CLAUDE.md`'s
"sync is optional and off until `js/sync/firebase-config.js` is filled in" — on this branch it
*is* filled in, and the shipped app is sync-on against a live project.

**Consequence worth flagging.** `js/sync/firebase-adapter.js:313` gates on
`projectId && apiKey`, which are both present, so `initializeApp(firebaseConfig)` runs. The
browser suites are local-only today only because the SDK import at
`firebase-adapter.js:12` fetches from `https://www.gstatic.com/...` and that fetch fails in
the sandbox. `smoke.mjs:1107` asserts `status === 'off'` — an assertion that currently holds
for an **environmental** reason, not a structural one. On a networked developer machine,
`npm run test:smoke` / `test:mobile` would initialize a real Firebase app against
`farkad-schedule`. Writes still need an allowlisted sign-in, so the exposure is small, but
"the suites cannot touch the live project" is not currently guaranteed by anything in the
tree. `tools/acceptance-bundle.sh` is the one place that closes this properly, and it does it
well — overwrite, then read back to prove.

### Everything else

- **No credentials, tokens, private keys, `.env` files, service accounts or cloud keys**
  anywhere in the tree. The only `AIza…` match is the config above.
- **Three real personal Gmail addresses** — `yosef.farkad1@gmail.com`, `farkad1963@gmail.com`,
  `mu.mahameed1992@gmail.com` — in `firestore.rules:21-23`, `docs/firestore.rules.rollback`,
  `docs/firebase-setup.md`, and copied as `const ALLOWED` into seven emulator suites. All
  pre-existing on `origin/main`; a rules allowlist structurally must name the real accounts.
  Worth a conscious decision only if this repository is or becomes public.
- **Nothing personal added by this branch.** The new fixtures are synthetic
  (`050-1111111` … `050-7777777`). `tests/exports-proof.print.mjs` deliberately seeds
  `'מוחמד אבו פרקד'`, `'Yosef Latin'`, `'sod@example.com'` as *canaries* for the diagnostic
  block's no-leak test — invented strings used as tripwires, which is the right shape.
- Pre-existing fixture, not from this branch, flagged for a human who would know:
  `tests/data.test.mjs:5901` pairs `phone: '052-884-1930'` with `idNumber: '312445678'`. Both
  look like plausible real Israeli values and are used throughout the phone-normalisation
  suites. If they were invented, nothing to do. If either belongs to a real crew member, it is
  personal data in a repository.
- **No doc or fixture added this week contains an address, an ID number or a phone number.**

## 9. `.gitignore`, tracked files, symlinks, submodules

`.gitignore` is correct and unusually well-reasoned: `node_modules/`, every emulator debug log
(with the note that one was committed once), Playwright output, the six `_adapter-*` /
`_*-test-config` files the emulator suites write and delete, the `.gate-*` / `.storm-*` logs
(with the reason — a count with no commit attached), and `firebase.*.json` with
`!firebase.json` un-ignored.

- **No symlinks and no submodules in the index** — every entry is mode `100644` or `100755`.
- **No tracked file that should not be**: no `.env`, no key material, no build output, no
  emulator log. `vendor/xlsx-0.18.5.min.js` is tracked on purpose (precached shell).
- `docs/firestore.rules.rollback` is tracked and should be — it is the rollback artefact the
  rollout checklist depends on.

## 10. The shipped flags

All four are false in source, and every one is pinned by a test:

| flag | source | pinned by |
|---|---|---|
| `permanentDeletion` | `js/model/schema.js:55` | `build.test.mjs:239` (source text), `data.test.mjs:5638`, `recovery.test.mjs:785` (runtime) |
| `vehicles` | `js/model/schema.js:61` | `build.test.mjs:239` (source text), `adversarial:1331`, `data:9819`, `exports:403`, `recovery:757,788`, `vehicles:186` |
| `carryAdvances` | `js/model/schema.js:63` | `data.test.mjs:9337`, `closure.test.mjs:865-867` (runtime) |
| `LEDGER_WRITES` | `js/model/ledger.js:49` | `data.test.mjs:9332`, `smoke.mjs:6790`, `closure.test.mjs:867` (runtime) |

The pair required to move together by iron law 1 — `LEDGER_WRITES` and `carryAdvances` — is
pinned together at `data.test.mjs:9332,9337` and again at `closure.test.mjs:865-867`.

Completeness note, not a hole: `build.test.mjs:239` pins the *source text* of only two of the
three shipped flags; `carryAdvances: false` and `LEDGER_WRITES = false` are pinned at runtime
only. `tests/gate.integrity.test.mjs` now pins all four as source text in one place, and
requires the shipped-flags object to contain exactly the three flags that were argued over —
so a fourth flag arrives with a decision about its default rather than without one.

---

## The suite this audit leaves behind

`tests/gate.integrity.test.mjs`, 15 checks, **11 pass / 4 fail** at `f182e03`. It is red on
purpose, in the manner of `tests/blobs.test.mjs`: each red check is a defect proved by hand
first. It reads the corpus as text and asserts nothing about the app.

    §1  no suite is left out of npm run test:release        RED — six untracked WIP suites (§1)
    §1  exactly one suite is exempt, and it is this one     pass
    §1  every name exempted as a helper exists              pass
    §1  the rule fires on a suite no script names           pass  (non-vacuity)
    §1  npm test ⊂ test:all                                 pass
    §1  test:all ⊂ test:release                             pass
    §1  release-only == emulator half + sendclaim           pass
    §2  no async predicate handed to settleUntil            RED — FINDING G-2, five sites
    §2  settleUntil still reads its predicate synchronously pass  (pins why §2 exists)
    §3  no unverified re-rooting variable                   RED — FINDING G-3, three sites
    §4  a stamp commit and a shell commit were found        pass
    §4  no cached file changed since the stamps moved       RED — FINDING G-4
    §5  no shipped flag is open                             pass
    §5  the shipped flags are the three argued over         pass
    §5  the ledger writer gate is shut in its own file      pass

It passes `tests/nonassertions.test.mjs` (23/23) and `tests/isolation.test.mjs` (18/18) with
itself in the corpus. It is **not wired into `package.json`** — the auditor may not edit it —
so it is presently an orphan by its own rule, exempted by name with the reason in the file and
a check that pins the exemption at exactly one file.


---

## Addendum — what was repaired, and what the repair was measured against

Written by the integration owner, after the audit above. Each item names the commit that
closed it and the evidence, not the intention.

### G-2 (a barrier that waited for nothing) — CLOSED at `844e69b`

`settleUntil` read its predicate synchronously, so an `async` predicate handed it a Promise,
which is always truthy: it returned on its first turn. Proved by hand before the change:

    async predicate  -> { answer: true,  turns: 1 }  predicate calls: 1
    sync  predicate  -> { answer: false, turns: 7 }  predicate calls: 7

and after it:

    async predicate now -> false | calls: 16 | waited: 305 ms
    sync  predicate     -> true  | calls: 4

The five barriers in `tests/bootstrap.emulator.test.mjs` now hold their answer against a
named `given`, so a timeout is a red line rather than a silent pass.

The check that stood here said, in its own comment, that it should be *removed* in the
commit that fixed the harness rather than left standing as a rule about a hazard that no
longer exists. It was. What replaces it is the half that was never true and still has to
be: a wait that can time out is only a barrier if somebody looks at the answer — measured
by running `settleUntil` rather than by reading the line that implements it.

### G-3 (a seam that chose bytes with nothing checking it) — CLOSED

Three offences, one shape.

- **`FARKAD_ROOT` in `tests/sendclaim.test.mjs`.** A second name for re-rooting that
  `tests/treecheck.mjs` had never heard of, and that `tests/isolation.test.mjs` — which
  knows `FARKAD_REPO` and `FARKAD_EXPECT_SHA` — could not see. It pointed the suite at any
  tree at all with nothing checking it was the commit being reported on. Replaced by
  `FARKAD_REPO`, bound through `refuseUnlessVerified`. Both refusals fired when asked:

      FARKAD_REPO was set without FARKAD_EXPECT_SHA: a re-rooted suite must name the
      commit that tree is expected to be
      FARKAD_REPO does not hold 00000000: 45 file(s) are not the commit

  The same commit removed `climb(process.cwd())`. It could only ever win if the climb from
  the file's own location failed — which cannot happen, the file *is* in `tests/` — so it
  was unreachable in the ordinary case and a hazard in every other: run from inside some
  other checkout, it was one missing file away from silently gating a tree nobody asked
  about. A suite must not be able to choose its bytes by where somebody stood.

- **A stale instruction in `tests/fence.ingress.test.mjs`.** Its "cannot find the checkout"
  error told the reader to set `FARKAD_ROOT`; that suite never read the variable, and after
  the change above no suite does. Advice that names a seam which does not exist teaches the
  next person to go looking for one.

- **`FARKAD_SHEETJS` in three suites.** The money arithmetic is proved *through* the
  spreadsheet library, and all three files say in their own comments why it must be the
  shipped copy — "reading anything else would prove the arithmetic of a file no phone has",
  on the line directly above the one that let the variable read anything else. The only
  thing asked of it was that the path exist.

  Not removed — a bundle or a relocated checkout is a fair reason to move the file — but
  **bound to the bytes**, the way `FARKAD_REPO` is bound to a commit (`shippedLibrary` in
  `tests/treecheck.mjs`). Relocation passes; a different build does not:

      SETUP FAILED: SheetJS is the shipped build (…/alt.js) — FARKAD_SHEETJS names a
      DIFFERENT build: dde18040d22e is not c9506197caf8, the bytes a phone runs.

  **One assumption in those comments is false and is now corrected in place.** They assert
  that `node_modules` holds a different build of the same version. Measured:
  `node_modules/xlsx/dist/xlsx.full.min.js` and `vendor/xlsx-0.18.5.min.js` are the same
  bytes in this tree today (`c9506197caf8…`). The first negative control run against
  `node_modules` therefore passed, and passing was *correct* — the control was invalid, not
  the binding. That is not a reason to relax: it is the reason the rule asks about bytes and
  not about a path. A rule that refused `node_modules` by name would pass a copy that had
  drifted and refuse one that had not.

### G-4 (stamps that no longer describe the bytes) — still RED here, deliberately

`79d6210` moved the three stamps to v104; `696ee86` then changed `js/sync/receive.js`, which
is in `sw.js`'s SHELL, and left them. The cache is named for the stamp, so a phone already
holding `farkad-v104` has a complete, valid shelf under that name, `sw.js` is cache-first
for every file in it, and the change is never offered. The fix ships, the gate is green, and
the phone that needs it goes on running the code the fix replaced.

`tests/build.test.mjs` now asks git the question the other four suites could not — which
shell files have changed since the commit that last wrote these stamps — with planted
histories proving it is not vacuous. It goes green when the stamps move to v105 at the final
candidate, and not before. It must not be weakened to get there.

### The remaining red: orphan suites

Seven untracked suites are not yet named by any gate script. That is a registration step at
integration, not a defect in the instrument — the instrument is what found them.

---

## Addendum 2 — startup and update, and two claims of my own that were wrong

### A cloud that failed to LOAD looked exactly like a phone with no cloud — CLOSED

`js/app.js` caught the adapter's dynamic-import failure with `cloudStarted = false` and a
`console.info`. On every surface — the line under the board, the chip beside the app name,
the ⋯ panel — that was indistinguishable from a phone with no project configured:

    { "status": "off", "foot": "הנתונים נשמרים במכשיר הזה בלבד.",
      "chip": "", "chipHidden": true, "reason": "", "reasonHidden": true }

Which is a phone recording all evening while the screen calls it local-only and the other
two phones see none of it. Now reported through the sync layer's own door
(`FarkadSync.fail`), and only from status `'off'`, so a stale import failure cannot paint
over a live status. Offline is untouched: with `navigator.onLine === false` the foot keeps
the offline sentence, so no false alarm on a site with no signal.

**Nothing was erased by the old behaviour and that is now pinned**, not assumed — the record
on the disk is byte-for-byte what was planted, and a day recorded with no cloud is written
beside the old one.

### The two pinned strings that moved with it (law 6), and why the stated reason was wrong

The suites' own author reported that `smoke.mjs:1105` "would fail on a machine with internet
today too, since the adapter would connect." **Measured, that is not so.** `isConfigured()`
is true in this repository, so the SDK initialises — but `FarkadSync.connect` is called only
inside the auth-state callback, for a signed-in `user`. Unauthenticated, the adapter attaches
a listener and connects nothing, so `FarkadSync.status` stays `'off'` and the check passes.

It fails **here**, with no route to gstatic, because the import fails and the app now says
so — which is the new behaviour working, not a regression. So the check was environment-
dependent in the opposite direction from the one reported, and either way it was measuring
the machine rather than the app. It now asks its own name's question: `FarkadSync.adapter`
is `null` — what `connect()` sets and `disconnect()` clears — which is the same answer with
a network and without one.

The second (`smoke.mjs:7107`) claims the storage-space message did not ERASE the sync half
of that line. The sync half is now put into a chosen state before the read, and **the pinned
sentence is unchanged**. Loosening the string to accept either sentence would have turned it
into "some sync sentence is present", which is exactly what it would say if the space message
really had eaten it.

### A related exposure, measured and recorded rather than alarmed about

`tests/smoke.mjs` does not neutralise `js/sync/firebase-config.js`, which carries the real
`farkad-schedule` project. On a machine with a network the suite therefore initialises the
Firebase SDK against the live project. **It does not reach business data**: no `connect`
without a signed-in user, so no read or write of `schedules/current`. The exposure is SDK
initialisation and an anonymous auth-state check. Worth knowing before anyone runs the
browser gate on a networked machine; not a data-safety defect, and not fixed here.

### A documentation claim that overstated a safety property — CORRECTED

`docs/rollout-checklist.md` told Yusuf that if he does not press «רענן עכשיו» the app
"updates itself at the first moment nobody is typing." That is true of a second WINDOW and
of nothing else: a phone is one window, there is no `controllerchange`, and `catchUpWhenSafe`
is never reached. The code is right — reloading the only window somebody is looking at
because a timer decided they had stopped typing is precisely what `js/ui/offline.js` refuses
to do, and law 7 scopes the catch-up to every OTHER window. The document was wrong, and now
says what `tests/update.test.mjs` measures: the offer waits, returns on every open, and lands
when the app is closed completely and reopened — which is step (2) of the checklist already.

### Not constructible in Chromium, and said so rather than claimed

Real page visibility: in headless Chromium every page stays `visibilityState: 'visible'` and
`bringToFront()` produces zero `visibilitychange` events, so the iOS resume cannot be
produced here. The re-offer check dispatches the event and says so in its own comment —
everything else it touches is real; only the tap on the app icon is pretended. And the case
where `index.html` itself arrives truncated above `#bootBanner` is guarded structurally
(the sentinel is parsed after the element it reveals) but is not measured end to end.
