# Farkad — the close-out: every open item, the code put in order, the app put in order

You are taking over Farkad (yoseffarkad1-eng/farkad): a Hebrew, RTL, offline-first PWA that
records who worked at which construction site and produces the pay sheet and the client
invoice from that record. Three people, three iPhones, one record, unreliable signal. Every
number in it is somebody's pay. Your job in this session: close everything that is open,
put the code in order without changing what it does, put the app in order without moving a
number, and leave nothing undocumented. You have one session's budget; work in WAVES, and
PUBLISH at the end of every wave, so whatever the budget allows is on `main` and not in a
branch.

## Baselines (verify them, do not trust this file over `git`)
- `main` is the served build. Read the top entry of `docs/releases.md` for its version and
  merge SHA. At the time of writing: v98 = `3a80f7f`; a v99 round (the bottom bars stuck
  hidden on iOS, and the ⋯ panel naming the sync error's reason) was in flight on the
  working branch — if `docs/releases.md` shows v99 served, Wave 0 below is done; if not, it
  is yours first.
- Working branch: `claude/farkad-mobile-design-review-odl8ue`. Start from its tip, in a
  fresh clone. Any worktree or scratch tree you find on a machine is not a source of truth.
- Build stamps move together (`farkad-build` in index.html, `APP_VERSION` in js/app.js,
  `VERSION` in sw.js), once per wave, in the same commit as any change to a cached file.
- Gates: `LEDGER_WRITES` false (`js/model/ledger.js`), `carryAdvances` false
  (`js/model/schema.js`). You do NOT flip either. Wave 5 writes the contract for the flip.

## Read first, in this order, before touching anything
1. `CLAUDE.md` — the twelve iron laws. They override anything in this file.
2. `docs/releases.md` — the top five entries (v95–v99): what each gives, what it is NOT
   known to do.
3. `features/next/brief-for-opus.md` — the eight open items after v98, with pointers.
4. `features/storm/findings.md` + `handoff.md` — the closure-echo race, closed at v98 with
   numbers. **Do not reopen it.** Its two "found on the way" items are in Wave 1.
5. `features/iphone/findings.md` + `handoff.md`; `features/ledger/handoff.md`;
   `features/core-repairs/{contract,findings,findings-round2,handoff}.md`;
   `features/compact-day/{contract,handoff}.md`.
6. `tests/README.md` — which suite owns what; the measured counts per commit. **Read the
   handoff under `features/` before ever saying a gate was not run: the verbatim output is
   there, on the commit it ran on.**
7. `docs/architecture.md`, `docs/sync-protocol.md`, `docs/data-safety-audit.md`,
   `docs/iphone-acceptance.md`, `docs/دليل-الاستخدام.md`.
8. `.claude/skills/{contract,triage,gate,handoff}` — the process; use them.

## The rules of work (non-negotiable)
- **A behaviour with a passing test IS the spec.** Every fix is a PAIR of commits: first
  "Fail-first: <what is wrong>" adding a test that FAILS on the base, then the fix, with the
  reason in the message and a comment in the code naming the failure it prevents.
- **Contract first** for anything touching money, sync, storage or the record's shape:
  `features/<name>/contract.md` (the `contract` skill). Then the pairs. Then an
  **independent adversarial verification** (a second agent, or a second pass that tries to
  refute each closure: fail-first proven on the base, the suites green on the fix, a probe
  for a NEW way the change could lose a recorded day or claim synced falsely). Then the
  handoff (the `handoff` skill) with the release gate's output verbatim on its commit.
- Hebrew strings are product decisions: a pinned string moves only with its test, in the
  same commit, with the reason. No new Hebrew sentence without a pin.
- Classic scripts only, one global scope, no build step; never `type="module"`; a new script
  goes into `index.html` in load order AND `sw.js`'s SHELL (`tests/build.test.mjs` checks).
- Never `prompt`/`confirm`/`alert`; never a bare `window.print()`; safe-area via `env()`;
  bar heights are measured, never written into the stylesheet; 44px targets and 16px inputs
  are floors; names are never markup.
- The ledger is append-only; entries are never edited or deleted; the boot mirror is the one
  sanctioned write; days keep the rate they were worked at; never claim saved before a
  verified durable commit; one field path per edit; whole-document writes only in the
  restore transaction; nothing unreadable is ever deleted or treated as empty.
- **Refactors change no behaviour.** A refactor commit ships with the WHOLE gate green and
  a one-line proof in the message of what stayed the same (the same pinned strings, the
  same counts, the same served bytes where nothing was meant to move).
- The release gate is `npm run test:release` (Java for the emulator suites), from one clean
  detached worktree, on the final commit of the wave; `npm test` and `test:release` are
  reported separately, neither wrapped in anything that turns a nonzero exit into a success.
  A red suite is a stop: root-cause it; "flake" is not a cause (the storm taught that). To
  run an emulator suite beside another job, copy `firebase.json` with a private port and
  pass `--config` (the harness reads `FIRESTORE_EMULATOR_HOST`).
- Never claim a physical iPhone ran anything. No model identifier in commits, PRs, comments
  or files; your session's own attribution trailer, nothing else.
- Publish per wave: PR to `main` with the counts per gate; after the merge, the release
  note's heading moves from CANDIDATE to the merge SHA in its own docs commit; update
  `tests/README.md`'s counts (counted off `package.json`) and `CLAUDE.md`'s file list when a
  file is added or split.
- Use parallel subagents in their own worktrees for independent items, each returning a
  structured result; verify each before merging; you are the integrator. Do not let two
  agents edit the same region of `tests/smoke.mjs` (append new blocks at the end under a
  banner; edit the middle only when moving a pin).

## Wave 0 — only if v99 is not yet served
- **bars**: the two bottom bars (`.tabs`, `.day-actions`) stayed hidden until the app was
  killed. `js/ui/bars.js` turns a viewport measurement alone into `body.kbd-open`; iOS can
  leave the layout and visual viewports disagreeing with no resize event (the share sheet,
  the print sheet, a keyboard dismissed while scrolled, backgrounding, rotation). Rule: a
  keyboard needs a focused editable; nothing focused → the class comes off and `--kb-h` is
  0 whatever the viewport says; re-measure on focusin/focusout (+rAF), visibilitychange,
  pageshow, and on the first touch/scroll while the class stands. Keep the
  `applyKeyboardInset(px)` test seam. Pins in `tests/mobile.test.mjs` beside the keyboard
  checks (a shrunk visualViewport stub with nothing focused leaves the bars; a real input
  focus hides them; blur brings them back with the stub still shrunk; a `<select>` never
  hides them).
- **reason**: the ⋯ panel says WHY the sync failed, under `#settingsSyncStatus`, only while
  the status is 'error' or the claim is stuck, from `FarkadSync.lastError`: permission-denied
  → the cloud refuses this phone's writes; if the app was just updated, the rules have not
  been published; unauthenticated → sign in again; unavailable/network → no reach right now;
  else the message, isolated LTR. Pinned in `tests/smoke.mjs`.
Publish as v99.

## Wave 1 — the money and sync items (contract first, pairs, verification)
The eight items of `features/next/brief-for-opus.md` are the spec; in short:
1. **A closure judged impossible under clock skew** (P2): `closePeriodChanges` accepts an
   `at` earlier than an entry already on the record; `closureProblems`' `recordedBy` cut-off
   then calls the closure impossible on every phone. Decide the rule (prefer: a closure is
   written after everything it closes over — refuse an earlier `at` with a sentence a person
   can act on), pin it in `tests/closure.test.mjs` (+ `closure.echo` if the comparison moves).
2. **A refused approval write leaves the phone 'contested'** (P2): the approval's path does
   not rebase like the other ledger writes after `permission-denied` at commit
   (`tests/money.concurrency.test.mjs`, «one phone approving the migration…», 1/28 under
   load). Reproduce deterministically on the fake cloud, close it, then the emulator suite
   ten times under load, every run 50/50.
3. **Cross-build closures of one fortnight are two bodies** (P3, decision): a v97 closure
   and a v98 closure differ in the frozen `hours`; decide whether `sameLedgerFact` compares a
   closure on its period facts, write the decision in the contract, pin it in
   `tests/samefact.test.mjs`.
4. **The create-race hold does not ask the same-fact rule** (P3): `createDocument`'s
   already-exists branch in `js/sync/sync.js` holds the loser's contested paths without
   `ledgerPathSupersededBy`; two phones writing the IDENTICAL fact into an empty project end
   in a hold. Ask it there too; pin in `tests/samefact.test.mjs` and keep the different-fact
   case held in `tests/cas.test.mjs`.
Then a **data-safety re-audit**: `docs/data-safety-audit.md` predates the send-path repairs,
the ledger merge and the storm. Run an adversarial review of the whole sync/recovery/storage
path (lenses: a recorded day lost; a day priced twice; a phone claiming synced falsely; a
hold nobody can clear; a poisoned name through every door; a restore leaving a device with
part of a record; two phones and the cloud disagreeing after any storm), verify every
finding independently, fix what is proven as pairs, and rewrite the audit document to say
what is now proven and by which suite. Publish as v100.

## Wave 2 — the phone's screen: room without moving bars
Product decisions already taken with the person: bars never auto-hide on scroll (a moving
bar is a missed target on a building site, and it is the family of iOS faults Wave 0 fixed).
Room comes from three deterministic changes, each with the mobile suite's rectangles moved
deliberately (`tests/mobile.test.mjs`; read `features/compact-day/contract.md` for the day
screen's measured design: rows at 430/390/320, the 44px and 16px floors, the safe-area rule):
1. **The day header compacts on scroll**: past a scroll threshold the two rows become one
   (day name, date, the two arrows); the second row (בטל/שוב/היום, the progress line)
   returns when the page is scrolled back to the top. A class toggled from a scroll
   threshold, not from viewport measurement; no bar hidden.
2. **The mode switcher** («לפי עובדים / לפי אתרים») joins the compact row as a segmented
   pair instead of a row of its own.
3. **Site cards**: the two footer buttons («+ הוסף עובד», «שלח את האתר הזה») become 44px
   icon buttons (＋ and 💬) in the card's coloured header, with accessible names; the row
   disappears. Five sites recover five rows.
Also: the week strip at 390 shows a scroll cue (a fade or shadow at the clipped edge, no
direction or pitch change), pinned present at 320/375/390 and absent at 430; the two
hardening pins from the brief (every WhatsApp/statement line first-strong Hebrew with a
Latin-named fixture; the first `th` of each report table rightmost). Publish as v101.

## Wave 3 — the code put in order (behaviour-neutral, every commit gated)
The shape today: `js/sync/sync.js` ≈ 6,100 lines, `css/app.css` ≈ 3,300, `js/model/schema.js`
≈ 2,900, `js/ui/reports.js` ≈ 2,500, `js/ui/share.js` ≈ 2,100, `js/model/ledger.js` ≈ 1,700,
`js/ui/roster.js` ≈ 1,500. The architecture (classic scripts, one global scope, load order
in `index.html`, the SHELL in `sw.js`) allows splitting a file into several classic files
loaded in order; it does not allow modules, bundlers or a build step. Rules for this wave:
one split per commit; the split moves code verbatim (no renames, no "while I'm here"); the
whole gate green after each; `index.html`, `sw.js` SHELL, `tests/build.test.mjs`,
`CLAUDE.md`'s file list, `docs/architecture.md` and `tests/README.md`'s ownership table move
in the same commit; the stamps bump once at the end of the wave.
1. `js/sync/sync.js` → by concern, in load order: the outbox and journal (durable queue,
   replay, receipts), the send path (the pre-send hold, the create race, the ladder), the
   receive path (snapshot adoption, merge, provenance, the poison doors), the restore
   transaction, the status line and honest status. Each file's header comment says what it
   owns and what it must never do (the same voice as today's comments).
2. `js/ui/reports.js` → rendering; the exports (xlsx/csv, names, the hand-over dialog); the
   worker statement text. `js/ui/share.js` → the WhatsApp message; backups and snapshots;
   the four restore doors and the rescue file.
3. `js/model/schema.js` → the model and validators; field paths; the payroll and invoice
   arithmetic. Pure functions stay pure.
4. `css/app.css` stays one precached file, but gets a table of contents at the top and its
   sections reordered to match the screens (shell, day, sheet, week, roster, reports,
   settings, dialogs, print, dark scheme), with every comment kept.
5. A dead-code sweep with evidence: for every function not referenced anywhere (grep across
   `index.html`, `js/`, `tests/`), either a reference exists in a test that pins it or it
   goes, named in the commit; nothing behind a flag is dead (`vehicles`, `permanentDeletion`,
   the carry) — those stay and are named as such.
6. Housekeeping: `.gitignore` gains the gate logs (`.gate-*.log`, `.storm-*.log`) and any
   scratch pattern found in `.git/info/exclude`; `features/README.md` indexes the rounds
   (compact-day, core-repairs, ledger, iphone, storm, next) with one line each; the
   `features/next/` briefs are marked done when they are.
Publish as v102.

## Wave 4 — the app put in order (no number moves)
Write `features/organization/contract.md` first: a map of every screen, dialog and panel
with its purpose, its primary action, and what it must never do; then make the app match it.
1. The ⋯ panel: sections in the order a person needs them on a building site (cloud and
   sync with its reason line; backup; restore; update and version; device state; the carry
   migration last, gated), one voice in the hints, no duplicated actions, every button 44px.
2. Button vocabulary: one primary (`btn-success`) per screen; destructive actions confirm
   through `askConfirm` with the consequence in the sentence; the same word for the same
   action everywhere (a glossary in the contract; every existing pinned string honoured or
   moved with its test).
3. Empty states and hints: every screen with nothing on it says what to do next, in the
   file's own voice; nothing says "error" without saying what to do.
4. The user guide `docs/دليل-الاستخدام.md` updated for v97–v102: the print button and the
   picture, the Saturday arrows, the export names and the dialog, the chip's words and the
   reason line, the compact header, the site-card icons — with the one-tap checks a person
   can do.
5. `docs/iphone-acceptance.md`: rows for every v97–v102 behaviour (see the brief's item 5
   for the v97/v98 list), all NOT RUN until the person runs them; a short Arabic checklist
   at the top telling the person the order to run them in.
6. `docs/architecture.md` and `docs/sync-protocol.md` refreshed to the split files and the
   repaired send path; `docs/firebase-setup.md` states the rules-first rollout with the
   exact command.
7. A rules review: `firestore.rules` read against `docs/sync-protocol.md`; every claim in
   the protocol that the rules enforce has a check in `tests/rules.test.mjs` or
   `tests/bootstrap.rules.test.mjs`; anything unenforced is either enforced or written down.
Publish as v103.

## Wave 5 — the flip, as a contract, and the person's checklist
- `features/gate-flip/contract.md`: what must be true before `LEDGER_WRITES` and
  `carryAdvances` flip TOGETHER in one commit (CLAUDE.md law 1; the pins in
  `tests/data.test.mjs` and `tests/smoke.mjs` moved deliberately): all three phones show the
  latest build in ⋯; `firestore.rules` deployed per `tests/rollout.test.mjs`'s order; a
  backup exported on each phone that day; Waves 0–1 closed; the rollout order and what the
  other two phones see meanwhile (`docs/sync-protocol.md`); the rollback (revert the flip
  commit; the ledger stays as written, append-only); the acceptance rows run after.
- `docs/rollout-checklist.md`, in Arabic, for the person: step by step, per phone, with the
  exact commands and the exact ⋯ lines to read back, for (a) updating the other two phones,
  (b) the rules deploy, (c) the day they decide to flip. You do not flip.

## Not yours — say so, do not simulate
- The `firestore.rules` deploy (`firebase deploy --only firestore:rules --project
  farkad-schedule`), the other two phones' update, any run on a physical iPhone, and the
  flip decision. Ask for the ⋯ panel's sync line and version line when you need a fact from
  a phone.

## When a wave ends, and when you finish
Per wave: the release gate on the wave's final commit, the handoff under
`features/<wave>/handoff.md` with the verbatim output, `docs/releases.md`'s CANDIDATE entry,
the PR with the counts per gate, the merge, the heading commit. If the budget ends
mid-wave, publish nothing from that wave: leave the branch with its handoff saying exactly
what is done and what is not, and stop.
At the end, one message in the repository's voice: the branch and SHA, the stamps, both
gates, every item with its pair and its pinned test, the counts per suite on the commit
they were measured on (`npm test` and `npm run test:release`, separately), what is NOT
done, and what the person must do next.
