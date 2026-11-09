# Design hand-over: everything the earlier design pass produced

This folder is a hand-over, not a spec. It carries the earlier design pass to the cloud session that
now owns the redesign («Farkad 2.0»). The earlier pass ran on the owner's PC, and the cloud cannot
read anything there. Nothing in this folder is loaded by the app. `docs/` is outside the service
worker's shell, so this branch changes no cached file and needs no build stamp.

Branch `claude/design-handover`, cut from `main` @ `ac9c013` (v167, the build that is live on the
phones). Written 2026-11-09.

## Where the code stands

- **GitHub `main` = v167**: Rima counts, the seder to each worker, the decluttered day screen. It is
  live on GitHub Pages, on the phones of the three people who use the app.
- **Not on GitHub yet**, being built on the owner's PC by the main session:
  - v168, sync fixes;
  - the pay-day screen («יום תשלום»), whose look the G3 mock already draws;
  - later, assigning workers to cars.
  The UI work here will meet those at integration. Keep it to `css/`, `js/ui/*` render code and
  `index.html` markup, and stay out of `js/model`, `js/sync`, `js/state.js`, `js/store.js`,
  `js/recovery.js` and `firestore.rules`. That way the merge stays a merge.
- Build stamps: v168 and v169 are reserved for that work. Use **v170** for any build made from
  this redesign. The final number is set at integration.

## What the owner decided, in his words

| Round | What it was | Owner |
|---|---|---|
| G1 | foundations only: colours, 4 button looks, radii | «مش حاسسها قويه» (too weak). **Rejected.** «بدي تغيير جذري» (wants a radical change) |
| G2 | day screen: 4 header rows → a 2-row blue band; one bottom bar; WhatsApp as a round green floating button; הגדרות / הכל חופש / copy-a-day behind ⋯; 12 of 12 rows visible instead of 8 | «إيه، كمّل هيك» (**approved**). The floating button hides while scrolling down and returns on a scroll up |
| G3 | every other screen in the same language, sent as one set | «كمّل الكل وفرجيني» (design everything, show once, stop asking screen by screen), then «ايه» to the whole set on 2026-11-09. **Approved.** Re-confirm the Hebrew-string list (handover.md §7) explicitly: he answered «مش فاهم» to the detailed message that carried it |
| now | this cloud session | «بدي اياها تقلبلي التطبيق تعملي اشي احترافي جدا» (turn the app over, make it very professional) |

So treat **G3 as the floor, not the ceiling**. Keep what he approved, unless you show him something
better, side by side.

## Files

- `design-audit.md`: the full audit (every inconsistency, with the numbers), the one direction,
  the change groups, then the G2 and G3 notes. It includes the list of **new or changed Hebrew
  strings**, which all need the owner's yes (law 6), and the implementation notes for whoever
  builds it. Paths in it that start with `~/` or `C:\` are on the owner's PC and are not here.
- `handover.md`: **the earlier session's complete closing summary. Read this one first.** It is
  written for a session that sees only GitHub. It covers:
  - the exact G2 and G3 specification with measurements;
  - the behaviour changes;
  - the new Hebrew strings;
  - the tests to add and move;
  - how the mock-ups were made;
  - the mock files verbatim;
  - §12, the implementation it had started.
- `design-v169-wip.patch`: that started implementation, about two hours of work, uncommitted.
  `git apply` it onto `ac9c013`. It covers `css/design.css`, `js/ui/band.js`, `js/ui/more.js`, the
  bands in day/week/reports/roster, the ⋯ sheet and provisional v169 stamps. It has **no tests and
  was never run**. Use it as a head start or ignore it; it is not reviewed.
- `impl-plan.md`: the earlier session's file-by-file plan and order of work for the implementation.
- `pictures/g2/`: the approved day-screen pairs (G2).
- `pictures/g3-*.jpg`: 45 before/after pairs at 440×956, 37 dark and 8 light.
  **قبل (before) is on the RIGHT, بعد (after) on the LEFT.** Fixture data only. Every name in them
  is a test persona already in `tests/` since 2026-08.
- `mock/`: the look as it was mocked.
  - `mock-g1.css`, `mock-g2.css`, `mock-g2.js`, `mock-g3.css` and `mock-g3.js` are injected
    at screenshot time on top of the real app, in that order.
  - `shots.mjs` is the Playwright driver: its `seed()` is the fixture, `MOCK=` / `MOCKJS=` inject
    the files.
  - `compose.mjs` draws the before/after pairs; `sheet.mjs` makes contact sheets; `dom.mjs`
    prints a DOM outline of each screen to write CSS against.
  This is reference code, not production code. Port the intent into `css/` and `js/ui/`, with the
  laws below.

## Rules that do not bend

1. Never push to `main` and never merge into it. `main` is the live app. Publishing needs the
   owner's explicit yes, given for that release.
2. Never touch the Firebase project or real data. Screenshots use fixture data.
3. Read `CLAUDE.md` first. Its twelve laws hold, in particular:
   - 44px targets and 16px inputs;
   - env() safe-area, with bar heights measured by `js/ui/bars.js`;
   - fixed site colours;
   - no prompt/confirm/alert;
   - pinned Hebrew strings;
   - the three stamps move together.
4. Never run tests with `GIT_DIR`, `GIT_WORK_TREE` or `GIT_INDEX_FILE` set. It once wrote fixture
   commits into the real `main`.
5. On your final commit run `npm test` and `npm run test:release` from a clean checkout. Report the
   two gates separately, with the commit. Anything short of every check passing is a stop.
6. Nothing is removed from the app; things only move. Say where each one went, because three people
   must relearn the screens. List behaviour changes separately for the owner's yes.

## Talking to the owner

- Simple Levantine Arabic. Whatever he must know or decide goes in its own clear box.
- He wants as little involvement as possible: batch decisions, and ask only taste questions, with
  before/after pictures.
- Send pictures so they reach his phone. Small JPEGs travel; 2× PNGs have timed out before.
