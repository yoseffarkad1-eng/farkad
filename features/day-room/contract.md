# Contract — v101: room on the day screen, without moving a bar

Base: `e8f2616` on `claude/farkad-mobile-design-review-odl8ue`; `main` at `e4aa66b` (v100,
served). Wave 2 of `features/next/opus-closeout.md`.

## The decision this is built on, and it is not reopened

**No bar auto-hides on scroll.** Not the top strip, not the mode dock, not the day actions.
A bar that moves while a thumb is travelling to it is a missed target on a building site,
and v99 spent a whole round on the family of iOS faults that made the bottom bars vanish by
themselves. Everything below takes room from CHROME THAT IS NOT A BAR.

`features/compact-day/contract.md` is the measured design this extends: six whole worker
rows at 430, five at 390, three at 320, the 44px target floor and the 16px input floor,
safe-area via `env()` and never a written-down inset. None of those floors moves. What
changes is what sits above the list, and when.

## What will be true when this ships

### 1. The day header compacts once the page is scrolled
- Above a scroll threshold the header is ONE row: ☰, «קודם», the day name and its date,
  «הבא». The tools row — «בטל»/«שוב»/«היום» and the progress line's text — is not drawn in
  that state. The 4px progress track stays: it is the header's own bottom edge and costs no
  row.
- Back at the top of the page, the second row returns. The state is driven by a **scroll
  threshold**, never by a viewport measurement — that is the mechanism v99 removed from
  `js/ui/bars.js`, and it is not coming back through another door.
- No layout is read during the scroll event itself; the class is toggled from a value the
  scroll gives directly, and the toggle is idempotent.
- The compact header is SHORTER than the full one at every measured width, and the full one
  is unchanged from v100 at the top of the page.
- **What this costs, named:** the header's «בטל» is a scroll-to-top away while the list is
  scrolled. The undo BAR (`js/ui/undo.js`) is unaffected and still appears at the moment of
  the edit, which is the case the header's pair was never for; the header's pair is for the
  mistake noticed a name or two later, and that now costs one flick. This is the trade the
  brief asks for, and it is written here so that whoever reverses it knows what they are
  buying back.

### 2. The mode switcher stops having a row of its own
- «לפי עובדים / לפי אתרים» is a segmented pair inside the header's tools row. `.day-mode-row`
  ceases to exist as a row above the list.
- It therefore compacts away with that row, which is consistent with what the code already
  says about it: a way of working is chosen once, not consulted every row.
- The bulk fold's disclosure button, which shares the switcher's row today, keeps a home and
  keeps its 44px target.
- Both segments stay 44px in both dimensions at every measured width and at 200% text; the
  pair wraps to a line of its own rather than losing a word or shrinking below the floor.

### 3. The site card's two footer buttons become icon buttons in its coloured header
- «+ הוסף עובד» and «💬 שלח את האתר הזה» become 44px icon buttons (＋ and 💬) in
  `.site-head`, each with an accessible name that says what it does and which site it is
  for. `.site-card-actions` is not drawn.
- The send button still appears only when there is somebody to name: a message saying an
  empty site is empty is a message nobody sends.
- The card's own colour identity, and the count, are unchanged.
- Five sites recover five rows.

## What is out of scope
- Any change to a bar's position, height, or visibility rule.
- Any change to the day's data, the record's shape, sync, or either money gate. Both stay
  `false`.
- The week strip's scroll cue and the two hardening pins that Wave 2 also lists: they
  shipped in v100 (`features/false-holds/handoff.md`).
- Anything on the week, roster, reports or settings screens.

## How it will be proved
`tests/mobile.test.mjs`, at the four sizes it already measures (430×932, 390×844, 320×667,
320×568) plus landscape, both colour schemes and 200% text:
- the rows-above-the-dock counts of `features/compact-day/contract.md`, unchanged or better;
- the compact header measured against the full one, after a real scroll;
- the switcher's two segments at 44px in both dimensions, in the header, at every width;
- the site card's two icon buttons at 44px with non-empty accessible names, and no
  `.site-card-actions` in the tree;
- no horizontal page scroll at any width, which is the check that catches a row that has
  been given more than it has.

Expectations that move — the switcher-row height check, and any rectangle the header change
shifts — move in the same commit as the change, with the reason in the message.

## The gate
`npm test` and `npm run test:release` on the wave's final commit, from a clean detached
worktree, run separately and reported separately. The three build stamps move together, once,
at the end of the wave.
