# Contract — v104: the bars put back on the bottom of the screen

Base: `9e46032` (v103 as served, `21c8e08`, plus `features/bars-raised/findings.md`).
Read that findings file first: it is the first physical-device evidence this repository
has, and everything below is written against it.

## The fault, in one paragraph

On iOS a `position: fixed` element is anchored to the **visual** viewport. When the visual
viewport is short and no keyboard is on screen — the share sheet closed, the app brought
back from the background, a keyboard dismissed while the page was scrolled, a stale layout
viewport — iOS paints both bottom bars at the bottom of the SHORT viewport, which on the
owner's iPhone 16 Pro Max was about 387pt above the bottom of the screen, with the worker
list and the storage notice showing in the strip underneath them. Nothing in the stylesheet
can produce that geometry: `.tabs` is `bottom: 0`, `.day-actions` is `bottom: var(--nav-h)`,
and there is no containing block for fixed descendants above either of them in v86 or v103.

This is the residue v99 left. v99 was right — a keyboard needs a focused editable, and the
app stopped hiding bars on a viewport measurement alone — and v99 could not have fixed this,
because where iOS paints a fixed element is not the app's to decide. So the app cannot stop
it; it has to be correct anyway.

## The decision this is built on, and it is not reopened

**No bar auto-hides on scroll.** Not the top strip, not the tab bar, not the day actions,
not the undo bar. `features/day-room/contract.md` says it and this contract says it again,
because the fix below touches the same three elements: a bar that moves while a thumb is
travelling to it is a missed target on a building site. The bars move here for exactly one
reason — the viewport underneath them moved first — and they move back to where the
stylesheet already said they were.

`features/compact-day/contract.md` is the measured design underneath: six whole worker rows
at 430, five at 390, three at 320, the 44px target floor, the 16px input floor, safe-area
through `env()` and never a written-down inset. None of those floors moves, and no bar
changes height.

## What will be true when this ships

### 1. A short visual viewport with nothing focused lowers the bars instead of stranding them
- `js/ui/bars.js` measures how far the bottom of the visual viewport sits above the bottom
  of the layout viewport — `innerHeight − (visualViewport.height + visualViewport.offsetTop)`
  — and, when that gap clears the same 150px floor v99 uses, publishes it as `--bar-drop`
  and marks the page `body.bars-lowered`.
- The stylesheet translates `.tabs`, `.day-actions` and `.undo-bar` down by that much, and
  by nothing else. The three move together: the dock's whole job is to sit on the tab bar
  and the undo bar's is to sit above the dock, so lowering one without the others would
  replace one wrong geometry with a worse one.
- The bars' MEASURED heights are unchanged — `translateY` does not change a rectangle's
  height — so `--nav-h`, `--day-actions-h` and the room the page reserves for them are the
  same numbers they are today, and they now describe where the bars are actually painted.

### 2. It never fights a real keyboard
- The lowering and `body.kbd-open` are mutually exclusive **by construction, not by luck**:
  the drop is 0 whenever `keyboardTarget()` is true, which is the single condition v99 put
  the keyboard behind. Under a real keyboard both bars are still HIDDEN, as they have been
  since v99, and nothing is translated.
- Pinch-zoom shrinks the visual viewport exactly like a keyboard does. The drop reuses
  v99's zoom guard (`scale > 1.01` → 0), so a zoomed page does not have its bars shoved
  down past the bottom of the screen.

### 3. It degrades to today's behaviour wherever it cannot know better
- No `window.visualViewport`: the drop is 0, the class never appears, no transform is ever
  applied. Every browser without the API renders exactly what it renders today.
- Gap at or below the 150px floor: 0. The browser's own chrome sliding in and out as the
  page scrolls is tens of pixels, and it must never move a bar.
- With the drop at 0 there is **no `transform` on any bar at all** — the rule is behind the
  `body.bars-lowered` class, not written with a `var(…, 0px)` fallback — so the normal case
  gains no stacking context, no compositing layer and no changed containing block.

### 4. It costs nothing on a scroll frame
- The measurement runs only inside `scheduleBarMeasure`, which is already coalesced to one
  animation frame and already the only place that reads a rectangle.
- The scroll and touch failsafe keeps its shape from v99: it asks for a re-measure only
  while `kbd-open` **or** `bars-lowered` is standing, and is one `classList` read otherwise.
- No listener is added to `visualViewport`'s `scroll` event. It fires while a pinch is being
  panned, and a layout read per frame of a pinch is the cost this clause exists to refuse.

## What this must never do

1. **Never hide a bar from a viewport measurement.** That is the v98 fault, it cost a round
   to remove, and no part of this may bring it back through another door. This change may
   only MOVE a bar that is already drawn; hiding stays where v99 put it, behind a focused
   editable.
2. **Never auto-hide, shrink, fade or re-anchor a bar on scroll.** See above.
3. **Never lower a bar off the bottom of the screen.** The drop is the measured gap and
   nothing larger, it is never applied under a keyboard or a zoom, and it is removed by the
   same measurement that applied it the moment the gap closes.
4. **Never let the fix decide anything about the record.** No day, no rate, no ledger entry,
   no sync path is touched. `LEDGER_WRITES` and `carryAdvances` both stay `false`.
5. **Never claim this was seen working on a phone.** Chromium anchors `position: fixed` to
   the layout viewport and does not emulate iOS's visual-viewport anchoring. The check added
   below SIMULATES the iOS geometry; it is arithmetic about rectangles, not device coverage,
   and it says so in its own comment. `docs/iphone-acceptance.md` is where the device claim
   would have to come from, and this round does not make one.

## The limit this fix has, named rather than hidden

The state it acts on — a visual viewport more than 150px short, no editable focused, no
zoom — cannot be measured apart from "iOS has stranded the bars" by any API a page can
call. A browser that anchors `fixed` to the LAYOUT viewport and reported that same state
would have its bars pushed below the fold. That state is not producible on such a browser:
a keyboard there needs focus and closes on blur with a resize, and the URL bar's own
shrink is far under the floor. This is an assumption about browsers, it is the assumption
the fix rests on, and it is written here so that whoever finds it false knows exactly which
line to delete.

## Out of scope
- The full-viewport overlays — `.modal`, `.sheet`, `.settings-panel`, `.reorder-panel`,
  `.drawer-wrap`. Under a short visual viewport iOS draws them over the part that can be
  seen, which is what they are for; lowering them would push their feet off the screen.
- The top bar. It is `sticky`, laid out in the flow, and this fault does not reach it.
- The 59 records waiting to send, and the `firestore.rules` deploy behind them. That is the
  operational half of the same screenshot, it matters more than the layout, and it is not a
  code change (`docs/rollout-checklist.md`).
- Any change to what is recorded, priced, synced or exported.

## Data, permissions, privacy
Unchanged, all three. No storage key is added, read or written. No new permission. No new
data reaches the DOM. Rollback is a plain revert of the commit.

## How it will be proved
`tests/mobile.test.mjs`, a new suite «390px: the viewport left short with nothing focused»,
which stubs `window.visualViewport` the way the v99 suite already does and models the iOS
anchoring the browser does not have:
- the v99 guarantee first, unmoved: nothing focused means no `kbd-open`, and both bars are
  drawn and measured;
- the page marks the state and publishes the gap;
- the painted bottom of the tab bar is the bottom of the layout viewport, and the dock's
  painted bottom is the tab bar's painted top;
- **no `.wrow` is painted in the strip between the tab bar and the bottom of the screen** —
  the screenshot's fault, stated as a rectangle;
- a real keyboard under the same shortfall hides the bars and lowers nothing;
- a pinched page under the same shortfall lowers nothing;
- no `visualViewport` at all lowers nothing and marks nothing;
- the gap closing takes the drop and the class away again.

Every one of those but the first fails on the base.

## The gate
`npm test` and `node tests/mobile.test.mjs` on the final commit, from a clean detached
worktree, reported separately. The three build stamps — `farkad-build` in `index.html`,
`APP_VERSION` in `js/app.js`, `VERSION` in `sw.js` — move to v104 together, in the same
commit as the change to the two cached files.
