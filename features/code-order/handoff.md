# Handoff — v102: the code put in order, and the two places it was left alone

- Branch: `claude/farkad-mobile-design-review-odl8ue`
- SHA: `21bd9ba0dd6a637707be8d48515a4b3b977e1cee`
- Base: `ee50ae4` (v101 as served)
- Build stamps at that SHA: `farkad-build` v102 · `APP_VERSION` v102 · `VERSION` farkad-v102
- Gates: `LEDGER_WRITES` false, `carryAdvances` false. Neither moved, and nothing in this
  round goes near them.
- Contract: `features/code-order/contract.md`
- Wave 3 of `features/next/opus-closeout.md`.

## The promise, and how it is held

**Nothing in this wave changes what the app does.** Not a pixel, not a shekel, not a byte on
a disk or on the wire. A person on a building site cannot tell v102 from v101 by using it.

That is a strong claim in a codebase where every number is somebody's pay, so it is held by
the gate rather than by care: `npm test` green after every commit, and the whole 59-suite
release gate on the wave's final commit and on the sync split itself.

## What moved

| file | v101 | v102 | what came out of it |
|---|---|---|---|
| `js/sync/sync.js` | 6,194 | 2,523 | `restore.js` 776 · `receive.js` 1,216 · `send.js` 1,264 · `status.js` 494 · `boot.js` 22 |
| `js/ui/share.js` | 2,093 | 290 | `backup.js` 1,824 |
| `js/model/schema.js` | 2,928 | 2,430 | `money.js` 519 |
| `css/app.css` | 3,485 | 3,529 | a table of contents. **Not reordered** — see below |
| dead code | 570 functions | 567 | three removed, each named with its reason |

Every split moved code VERBATIM: the same bodies in the same order, nothing renamed, nothing
tidied on the way past. `index.html`'s load order, `sw.js`'s SHELL and `tests/harness.mjs`'s
own list move in the same commit as each split, because a file added to one and forgotten in
another is an app that is broken in a tunnel and says nothing.

## The sync split: what made it safe, checked rather than assumed

`js/sync/sync.js` was 6,194 lines of which about 4,670 were ONE object literal. A literal
cannot be cut across classic files, so the later five extend it with
`Object.assign(FarkadSync, { … })`. Two facts make that safe and both were measured before a
line moved:

- **Nothing anywhere iterates or spreads `FarkadSync`** — no `Object.keys`, no `for…in`, no
  `...FarkadSync`, in `js/` or in `tests/`. Property order is therefore not observable, and
  `Object.assign` cannot change behaviour by reordering.
- **There is exactly one accessor pair**, `get`/`set _outbox`, and it **stays in the
  declaring file**. `Object.assign` copies VALUES: sent that way it would invoke the getter
  and install its result as a plain property, turning a derived queue into a stale snapshot.
  That is a money bug with no symptom, and it is why the contract named it before the code
  did.

**`js/sync/boot.js` is a file rather than a tail, on purpose.** Two lines run at load time —
`window.FarkadSync` and `FarkadSync.loadOutbox()` — and everything they reach has to be
defined before they do. While this was one file that was simply true; split across six it
becomes a thing somebody has to remember, and the failure if they forget is a phone that
opens with a queue it has not read, reports nothing waiting, and looks perfectly healthy.
Being last is that file's whole job, and every later split of the group goes above it.

## Two things this wave measured and deliberately did NOT do

### `js/ui/reports.js` is not split, and the reason is a number

It was split, measured, and put back. The cost is in the test suite, not in the file:

- **25 places in 13 suites read `js/ui/reports.js` off the disk BY NAME** and evaluate it
  into a device's context — not through `tests/harness.mjs`'s list.
- **Three of those are meta-tests.** `tests/isolation.test.mjs` pins the read itself as a
  string; `tests/vehicles.test.mjs` and `tests/wording.test.mjs` iterate hard-coded file
  lists that include it. A split that missed any of the three would leave a suite quietly
  covering less than it claims — the exact failure `tests/nonassertions.test.mjs` exists to
  catch.

`schema.js` and `share.js` cost 1 and 3 such reads and were split; `sync.js` cost the
harness list and three legacy references. **The difference is not the size of the file, it
is how the suites reach it** — and that sentence is the one worth keeping for whoever
finishes the job. Doing it properly needs one place in the harness that names the reports
group, all 25 reads moved onto it, and the three meta-tests moved deliberately with their
reasons. It is real work and it is not worth doing carelessly at the end of a wave whose
whole promise is that nothing changed.

### `css/app.css` gets a table of contents and keeps its order

The wave asks for its sections to be reordered to match the screens. They are not, and the
table of contents says why where a person will read it. That file states, in its own
comments, that ORDER IS THE MECHANISM in at least four places:

- the print rule that lifts the unpaid-hours warning back onto the paper does it by
  SPECIFICITY, because the earlier version had been losing to a later block **for months,
  silently** — and what it lost was a warning about hours somebody was not paid for;
- the narrowest-phone block must follow the compact-day block or lose to it at equal
  specificity;
- the landscape bar is last on purpose: it collapses the header everything above refines;
- one sticky rule in the day view carries a note about having been beaten by a later rule of
  the same specificity, which is why that comment exists at all.

So the rule the file now carries is: **add to a section, do not move one** — and if a section
must move, prove first that no rule in it shares a selector AND a specificity with any rule
it would cross. Not one declaration moved; the file's bytes below the new block are identical.

## The one red, root-caused rather than re-run

The sync split's release gate came back **EXIT=2 at 50 of 59 suites with zero failed
checks** — a `given()` in `tests/swrestart.test.mjs` reporting `0 targets` and a worker still
running.

`stopWorker` asks two different sources for one fact. `targets` is asked for on demand;
`control.versions` is a Map filled in by `ServiceWorker.workerVersionUpdated` events as they
arrive. The loop waited only for the targets to drain and then read `versions` ONCE — so when
the last event carrying `runningStatus: 'stopped'` had not been delivered yet, the caller was
told a worker was still running that the browser had already let go.

**It is not called a flake.** It went red inside a full gate and green every time the suite
was run alone — and alone is the case with the LEAST event latency, which is exactly where a
race like this hides. The split made it likelier: six shell files instead of one is six times
the fetches behind a worker being stopped, and a longer tail after the stop. The split did not
create it. Both facts are polled now, under the one deadline, and the return still says what
each of them was so a future red names which half was late.

## The dead-code sweep, with where it looked

All 570 top-level functions, searched across `js/`, `tests/`, `index.html` and `sw.js` — so
the inline `onclick` handlers are covered by the search rather than by assumption. Three had
no reference anywhere but their own declaration:

- `hashedId` — superseded by `legacyOpId`, which digests the VALUE as well, the repair
  `tests/receipt.test.mjs` exists for;
- `outboxIdIn` — `queueKeyKind` answers the same question at the four call sites that had it.
  `SAFE_ID`, which it used, is used by eight other places and stays;
- `renderUnrecordedBanner` — drew a warning nothing has drawn for a long time. It carried a
  Hebrew string no test pins, because no surface renders it, so removing it changes no
  product decision.

Nothing behind a shut flag was touched: vehicles, `permanentDeletion` and the carry are
reached through their flags and are not dead. After the sweep: 567 declared, none
unreferenced.

Two comments that the split itself had made untrue were repaired in the same pass — one in
`js/sync/receive.js` that said `legacyOpId` was "two hundred lines up" when it is now in
another file, and the protocol state and forty lines of prose about adopting a snapshot that
had been left above a queue file which adopts nothing.

## Expectations moved deliberately
- `tests/fence.legacy.test.mjs` builds its v86 device from **the released commit's own file
  list** rather than this build's. It took `loadOrder()` and read each of today's names out
  of commit `880d7bb` — a demand that the past contain the present, which would have broken
  on any split this repository ever made. Filtered loudly: a `given()` names how many of this
  build's files the released one had, and lists the ones it did not.
- `tests/swrestart.test.mjs`'s `stopWorker`, as above.
- No Hebrew string moved, and no product decision changed.

## Migrations
None. Nothing on a disk or on the wire is touched. Rollback is a plain revert.

## Test output (verbatim, on the final commit)

**NOT YET COMPLETE, and this file says so rather than carrying a number from somewhere
else.** At the time this was written the release gate was still running on `21bd9ba` in a
clean detached worktree. What HAS been measured on this exact tree:

    npm test            43 suites   4380/4380   exit 0

`npm run test:release` — the gate that adds the nine browser suites, sendclaim and the six
emulator suites — is outstanding, and **this build is not published until it comes back
green on this commit**. Its verbatim per-suite output replaces this section in the commit
that publishes the build.

One earlier release gate, on the sync split at `3767569`, came back EXIT=2 at 50 suites: the
`swrestart` race described above, now fixed. That run's counts are not recorded as a result,
because it did not finish.

## Contract items NOT completed
- **`js/ui/reports.js` is not split.** Measured, reasoned and written down above and in the
  contract; the number is 25 reads across 13 suites, three of them meta-tests.
- **`css/app.css` is not reordered.** Measured against its own comments and written down.

## Known gaps, measured and named
- **No phone has run any of this.** Nothing since v86 has, and every row of
  `docs/iphone-acceptance.md` is still NOT RUN. For a behaviour-neutral wave that matters
  less than it did for v101 — but "behaviour-neutral" is a claim held by 59 suites, not by a
  person using the app.
- **`firestore.rules` is still not deployed**, unchanged from v100 and still the owner's to
  run. `docs/rollout-checklist.md` has the steps.
- The two findings v100's re-audit left OPEN are still open and untouched by this round.
- Both money gates are shut. Nothing in this round is behind them.
