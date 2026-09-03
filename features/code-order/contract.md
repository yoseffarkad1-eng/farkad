# Contract — v102: the code put in order, and nothing else

Base: `78c7d25` on `claude/farkad-mobile-design-review-odl8ue`; `main` at `ee50ae4` (v101,
served). Wave 3 of `features/next/opus-closeout.md`.

## The one promise

**Nothing this wave ships changes what the app does.** Not a pixel, not a shekel, not a byte
on a disk or on the wire. A person on a building site cannot tell v102 from v101 by using it.
Every commit in this wave is a move, and every commit says in one line what stayed the same
and how that was proved.

That is a strong claim about a codebase where every number is somebody's pay, so it is held
by the gate rather than by care: `npm test` after every commit, and the **whole** release gate
— 59 suites, browser and emulator — on any commit that moves code between files. A commit
whose gate was not run is not in this wave.

## What the architecture allows, and what it does not

`index.html` loads every script with a plain `<script src>` and every button is an inline
`onclick` resolved on the global scope. There is no build step and there are no modules
(`js/sync/firebase-adapter.js` is the single exception and stays one). So a "split" here means
**more classic files loaded in order**, and three things move with every one of them, in the
same commit, or the build breaks in a way that is silent on a phone:

- `index.html`'s script list, in load order;
- `sw.js`'s SHELL, or the new file is not in the offline cache and the app is broken in a
  tunnel — `tests/build.test.mjs` fails if the shell is incomplete;
- `CLAUDE.md`'s file list, `docs/architecture.md` and `tests/README.md`'s ownership table,
  because a map that does not match the ground is worse than no map.

## The hard part, named before it is met

`js/sync/sync.js` is 6,194 lines, of which roughly **4,670 are one object literal** —
`const FarkadSync = { … }` from line 1159. An object literal cannot be cut across files. The
only honest way to split it is for the declaring file to keep the state and the later files to
add method groups with `Object.assign(FarkadSync, { … })`, moving each method body verbatim.

Two facts were checked before deciding that, and they are the reason it is safe:

- **Nothing anywhere iterates or spreads `FarkadSync`.** No `Object.keys`, no `for…in`, no
  `...FarkadSync`, in `js/` or in `tests/`. So property ORDER is not observable and
  `Object.assign` cannot change behaviour by reordering.
- **There is exactly one accessor pair in the literal** — `get _outbox` / `set _outbox`.
  `Object.assign` copies VALUES: it would invoke the getter and install its result as a plain
  property, which turns a derived queue into a stale snapshot. That is a money bug, silently.
  **The accessor pair stays in the declaring file** and never moves through `Object.assign`.
  If any other accessor appears, the same rule applies to it.

The split, in load order, each file's header comment saying what it owns and what it must
never do, in the voice of the comments already there:

1. the outbox and journal — the durable queue, replay, receipts;
2. the send path — the pre-send hold, the create race, the ladder;
3. the receive path — snapshot adoption, merge, provenance, the poison doors;
4. the restore transaction;
5. the status line and honest status.

## `css/app.css`: the table of contents yes, the reordering only where it is safe

The wave asks for a table of contents at the top and the sections reordered to match the
screens. **The table of contents is unconditional. The reordering is not**, and this contract
says so before the work rather than after.

That file documents, in its own comments, several places where ORDER IS THE MECHANISM:

- the print rule lifted back onto the paper "by SPECIFICITY, not by position", written that
  way because the earlier version had been losing to a later block **silently, for months**,
  and the failure was a warning about unpaid hours not printing;
- the narrowest-phone block that must come "AFTER the compact block above, whose
  same-specificity rules would otherwise win by being later in the file";
- the landscape bar block, "last in the file on purpose - this block collapses the header
  that everything above refines, so it must come after all of it or lose to the cascade in
  silence".

Every one of those says the same thing: moving a block in this file can change what a phone
renders, and the failure is quiet. So the rule for this wave is: **a section moves only if no
rule in it shares a selector-and-specificity with a rule in any section it would cross.** That
is checked mechanically, not by eye. Sections that cannot pass that check keep their place and
get a comment in the table of contents saying why they are where they are. A partially
reordered file with the reason written down is worth more than a tidy one that renders
differently.

## `js/ui/reports.js` was measured and NOT split, and here is the number

The wave asks for `reports.js` (2,562 lines) to be split into rendering, the exports and
the worker statement. It was split, measured, and put back. The reason is in the test
suite, not in the file:

- **25 places in 13 suites read `js/ui/reports.js` off the disk directly** and evaluate it
  into a device's context — not through `tests/harness.mjs`'s list, but by name. Every one
  of them would have to learn that "reports" is now three files.
- **Three of those are meta-tests.** `tests/isolation.test.mjs` pins the READ ITSELF as a
  string; `tests/vehicles.test.mjs` and `tests/wording.test.mjs` iterate hard-coded file
  lists that include it. A split that missed one of those three would leave a suite quietly
  covering less than it says it does — which is the exact failure `tests/nonassertions.test.mjs`
  exists to catch, and the one this repository fears most.

`js/model/schema.js` and `js/ui/share.js` were split instead, and they cost 1 and 3 direct
reads respectively because they load through the harness's own list. Same for
`js/sync/sync.js`. The difference is not the size of the file; it is how the suites reach it.

So `reports.js` stays whole at v102, with the measurement written down rather than the
intention. Splitting it is a real piece of work worth doing — it needs one place in the
harness that names the reports group, all 25 reads moved onto it, and the three meta-tests
moved deliberately with their reasons — and it is not worth doing carelessly at the end of
a wave whose whole promise is that nothing changed.

## The dead-code sweep needs evidence, not a grep

For every top-level function not referenced anywhere, the commit that removes it names where
it was looked for (`index.html`'s inline handlers, `js/`, `tests/`). Three kinds are NOT dead
and are named as such rather than removed: anything reached only from an inline `onclick`;
anything behind a shut flag (vehicles, `permanentDeletion`, the carry); and anything a test
pins deliberately. `tests/nonassertions.test.mjs` exists because a test that stops testing is
the failure this repository fears most, and a "dead" function that a suite quietly relies on
is the same fault wearing different clothes.

## Out of scope
- Any behaviour change, any rename, any "while I'm here". A move is a move.
- Both money gates stay `false`. Nothing in this wave goes near them.
- The two findings v100's re-audit left OPEN stay open; this wave does not touch them.
- No Hebrew string moves. If a split would move one, the split is wrong.

## How it will be proved
- `npm test` green after every commit; the whole release gate on every commit that moves code
  between files, and on the wave's final commit.
- `tests/build.test.mjs` — the three stamps agree, the shell is complete, caches never cross
  builds — is the check that catches a file added to `index.html` and forgotten in `sw.js`.
- The stamps move to v102 once, at the end of the wave.
- Each commit message carries the one-line proof: what moved, what it is now, and what the
  gate said.
