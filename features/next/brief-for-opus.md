# Farkad — the open items after v98, for the next session

You are taking over the Farkad repository (yoseffarkad1-eng/farkad) to close the items
left open by the v96–v98 rounds. Nothing here is urgent for a phone: every code item sits
behind the two money gates, which are shut. What is urgent is that the record of what is
open stays true, and that nothing already closed is reopened.

## Baselines
- `main` = `3a80f7f` (v98, served). The working branch is
  `claude/farkad-mobile-design-review-odl8ue` = `47ee36b` (the same tree plus the release
  note's heading). Start from the branch tip, in a fresh clone; any worktree you find on a
  machine is scratch from an earlier session and is not a source of truth.
- Build stamps: `farkad-build` v98 · `APP_VERSION` v98 · `VERSION` farkad-v98. They move
  together, to v99, in the same commit as any change to a cached file, and only then.
- Gates: `LEDGER_WRITES` false (`js/model/ledger.js:49`), `carryAdvances` false
  (`js/model/schema.js:63`). You do not flip either. Item 8 below is a contract for the
  flip, not the flip.

## Read first, in this order
1. `CLAUDE.md` — the iron laws (twelve now; law 12 is `window.print()` is never called bare).
2. `docs/releases.md`, the v96, v97 and v98 entries — what each build gives and what it is
   NOT known to do.
3. `features/storm/findings.md` and `features/storm/handoff.md` — the closure-echo race,
   closed at v98 with numbers. **Do not reopen it.** Its two "found on the way" items are 1
   and 2 below.
4. `features/iphone/findings.md` and `features/iphone/handoff.md` — the first round answered
   from an iPhone, and the "reversed" verdict (nothing reverses in Chromium; the export path
   was the fix).
5. `features/ledger/handoff.md` — the ledger merge, both gates closed, and the create-race
   gap (item 4).
6. `tests/README.md` — which suite owns what, and the measured counts per commit. The
   release gate is `npm run test:release` (59 suites at v98; needs Java for the six
   emulator suites). **Read the handoff under `features/` before saying a gate was not run:
   the verbatim output is there, on the commit it ran on.**
7. `.claude/skills/{contract,triage,gate,handoff}` — the process this repository uses.

## How work is done here
- A behaviour with a passing test IS the spec. Every fix is a PAIR of commits: first
  "Fail-first: <what is wrong>" adding a test that FAILS on the base, then the fix, with the
  reason in the message and a comment in the code naming the failure it prevents.
- Contract first for anything that touches money or sync (items 1, 2, 3, 4):
  `features/<name>/contract.md` per the `contract` skill, then the pairs, then an
  independent adversarial verification (a second agent or a second pass that tries to
  refute each closure: fail-first proven on the base, the suites green on the fix, a probe
  for a NEW way the change could lose a recorded day or claim synced falsely), then the
  handoff with the release gate's output verbatim, on the commit it ran on.
- Hebrew strings are product decisions; a pinned string moves only with its test, in the
  same commit, with the reason. Never `prompt`/`confirm`/`alert`; never `type="module"`;
  a new script goes into `index.html` in load order AND `sw.js`'s SHELL.
- The emulator suites bind the port in `firebase.json`; to run one beside another job,
  copy the config with a private port and pass `--config` (the harness reads
  `FIRESTORE_EMULATOR_HOST`).
- Never claim a physical iPhone ran anything. No build since v86 has (`docs/iphone-acceptance.md`).
- No model identifier in commits, PR text, comments or files. Your session's own
  attribution trailer, nothing else.
- Publish only when the whole gate is green on the final commit, from one clean detached
  worktree, and say which commit. A PR to `main` carries the counts per gate; after the
  merge, the release note's heading moves from CANDIDATE to the merge SHA in its own docs commit.

## The open items, in order

### 1. A closure judged impossible under clock skew — P2, behind the carry gate
`closureProblems` (`js/model/ledger.js`, the `recordedBy` cut-off around lines 378–407)
judges a closure against the entries whose `at` is on or before the closure's own `at`.
`closePeriodChanges` accepts an `at` EARLIER than an entry already on the record (a phone
whose clock is behind another's, or a caller passing a fixed timestamp), computes the
closure over the whole record, and writes a `balanceAfter` that the rule then calls
impossible — held aside on every phone, and the closer is blocked on its own echo via
`honestStatusFor`. Found by the storm hunt's control scenario (`features/storm/findings.md`,
"found on the way"; the storm agent's note in `features/storm/handoff.md`).
Decide the rule and write it down: either `closePeriodChanges` refuses an `at` earlier than
the newest `at` already on that man's ledger (a closure is written after everything it
closes over), or `closureProblems` judges by the record's own order rather than wall-clock
`at`. Prefer the first if it keeps closures append-only and honest; say why. Fail-first in
`tests/closure.test.mjs` (a clock-behind closer; the closure is either refused with a
sentence a person can act on, or written and never held) and, if the rule touches the
comparison, `tests/closure.echo.test.mjs`. Every existing closure pin stays.

### 2. A refused approval write leaves the phone 'contested' — P2, behind the carry gate
`tests/money.concurrency.test.mjs`, «one phone approving the migration while the other
records a day»: once in twenty-eight runs under CPU load, phone A's approval write
(`recordCarryApproval` → `ledger.migrations.<id>`) was refused `permission-denied` by the
emulator's rules at commit and A ended 'contested' with one operation held, where the
other ledger writes are re-read as a conflict and rebased. Find why the approval's path
does not rebase like the rest (the pre-send hold? the create-race branch? the migration
path in `applyJournalEntry`/`scheduleHoldsEntry` in `js/sync/sync.js`), reproduce it
deterministically on the fake cloud (`tests/harness.mjs`, `makeCloud` with holds, the way
`tests/cas.test.mjs` and `tests/contested.test.mjs` order deliveries), and close it as a
pair in `tests/approval.test.mjs` or `tests/cas.test.mjs`. Then the emulator suite at least
ten times under load on your private port, every run 50/50.

### 3. Cross-build closures of one fortnight are two bodies — P3, decision
A v97 closure and a v98 closure of the same fortnight with extra hours differ in their
frozen `days[].entries[].hours` (v97 never wrote them), so an independent double close
across builds — both gates open on both phones, which no shipped build has — holds the
second phone under the same-fact rule. Decide whether `sameLedgerFact` should compare a
closure on its period facts (`advanceId`, `periodFrom`, `periodTo`, `amount`,
`balanceAfter`, `gross`) rather than the whole frozen basis, or whether a double close is
rightly a person's decision. Write the decision into `features/<name>/contract.md`, pin it
either way in `tests/samefact.test.mjs`, and note it in the release note.

### 4. The create-race hold does not ask the same-fact rule — P3, sync
`js/sync/sync.js`, `createDocument`'s already-exists branch (v95's R1): the loser's
contested `days.`/`ledger.` paths are held against the document just read, but
`ledgerPathSupersededBy` (the same-fact settlement the conflict branch applies around line
3379) is not asked there. Two phones writing the IDENTICAL fact into a project with no
document yet end in a hold a person clears instead of converging. Safe direction, one tap.
Close it: ask the same-fact rule in that branch too; pin in `tests/samefact.test.mjs`
beside the existing two-phones-one-fact suites, and in `tests/cas.test.mjs` «two phones
adding to the same worker's day on a project with no document yet» keep the DIFFERENT-fact
case held.

### 5. The acceptance checklist has no rows for v97 and v98 — P2, documentation
`docs/iphone-acceptance.md` (33 rows, every one NOT RUN) predates the print fallback. Add
rows, in its own voice, for: the print button on the home-screen app (either the print
sheet opens, or «ההדפסה לא נפתחה במסך הזה…» appears within two seconds); «🖼️ שיתוף
כתמונה» on the week and on a report (a PNG in the share sheet that reads right to left,
named `farkad-שבוע-…png` / `farkad-דוח-…png`); the arrows stepping over an empty Saturday
and landing on a recorded one; two taps not zooming while pinch still does; the chip
reading «שגיאת סנכרון» in red when the cloud refuses; the export dialog's two choices and
a backdrop tap writing no second file; the file names Latin-first in the Files app; a
date range with the earlier date on the left; the worker modal opening at its heading;
a by-site print with no blank first page; the by-site grid's rows as «ראשון 23/08».
Rows only — they stay NOT RUN until the person runs them. Documentation commits need no pair.

### 6. Two hardening pins — P3
(a) Every non-empty line of `dayMessage` (all styles) and `workerStatementText` begins
with a Hebrew-strong character or an isolate, with a fixture that has a Latin-named worker
and a Latin site — the lens that checked this by hand said it holds today and nothing pins
it. Put it in `tests/exports.test.mjs`. (b) The reports screen's header geometry: the
first `th` of each report table is the rightmost at 390 and 430 — `tests/mobile.test.mjs`
measures rectangles; nothing measures this one.

### 7. The week strip at 390 gives no sign that it scrolls — P3, product
At 390 the strip holds five days and Thursday hangs off the left edge at rest (the 48px
pitch is deliberate: `css/app.css`, the week block; `tests/mobile.test.mjs` pins it). A
scroll cue at the clipped edge (a fade or a shadow), nothing else: no direction change,
no pitch change, the sticky name column untouched. Pin the cue's presence at 320/375/390
and its absence at 430 in the mobile suite.

### 8. The gate flip, as a CONTRACT only — no code
Write `features/gate-flip/contract.md`: what must be true before `LEDGER_WRITES` and
`carryAdvances` flip (they flip TOGETHER, in one commit — CLAUDE.md law 1 — with the pins
in `tests/data.test.mjs` and `tests/smoke.mjs` moved deliberately): all three phones show
v98 or later in ⋯; `firestore.rules` deployed and `tests/rollout.test.mjs`'s order
honoured; a backup exported on each phone that day; items 1–4 above closed; the rollout
order (which phone first, what the other two see meanwhile — `docs/sync-protocol.md`), the
rollback (revert the flip commit; the ledger stays as written, append-only), and the
acceptance rows a person runs after. The person decides when; you do not flip.

## Not yours
- The 38 queued records on the person's phone, and the `firestore.rules` deploy
  (`firebase deploy --only firestore:rules --project farkad-schedule`): the person's.
- Running anything on a physical iPhone: the person's. Ask for the ⋯ panel's sync line
  and the version line when you need a fact from the phone.

## When you finish
One message, in the repository's voice: the branch and SHA, the stamps, both gates,
each item as a pair with its pinned test, the release gate's counts per suite on the
commit they were measured on (both `npm test` and `npm run test:release`, separately,
neither wrapped in anything that turns a nonzero exit into a success), what is NOT done,
and what a person must do next. Update `docs/releases.md` (a CANDIDATE entry), the
`features/<name>/handoff.md`, and `tests/README.md`'s counts — counted off `package.json`.
