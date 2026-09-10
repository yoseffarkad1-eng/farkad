# P3 — the crowded daily screen, measured

Every number below was measured in Playwright's Chromium on this tree, at
deviceScaleFactor 2, `isMobile`, a synthetic 34px home indicator, the account warning up,
a crew of thirty with long Hebrew names (`מוחמד עבד אל רחמן מחאמיד N`), by-worker view.
The 200% pass rewrites every `font-size` rule in every stylesheet at twice its value with
`!important` — the mechanism `tests/mobile.test.mjs` already uses, and the only one in this
repository that survives a rerender. It is not iOS Dynamic Type; see "not provable here".

## The compact hierarchy, as shipped

At 320×667 with 200% text a full layout is impossible, and the app now says so instead of
drawing it. `fitDayList()` in `js/ui/bars.js` measures the first screen — from the top of
the crew's list down to whatever is floating over the bottom — and turns `body.day-tight`
on when that is less than **two whole worker rows**. Everything the class does is in one
block at the end of `css/app.css`. Read from the top, this is what is kept; read from the
bottom, this is the order things give way in.

1. **The selected date.** `.day-nav` and `.day-label` are not mentioned in the collapse
   block at all. On the most collapsed screen the app has, the date button is still a
   44×44 target, still carries `12/08/2026` un-ellipsised, and still opens the picker.
2. **The recording controls.** The switcher, the bulk fold's button, undo, redo and the
   count/`המשך` button are all still on the header at their full 44px. Only their *words*
   are collapsed (see 5).
3. **The warning's meaning and its action.** The folded account warning loses its third
   line of summary (`-webkit-line-clamp: 3 → 2`), never its sentence. `לדוחות` and `✕`
   are untouched and both stay ≥44px. The full prose stays in `.banner-full`, one tap down,
   and stays in the DOM for the checks that read it.
4. **The last worker reachable.** Nothing in the collapse block moves a bar or the page's
   bottom padding. Those stay measured (`--nav-h`, `--day-actions-h`, `--undo-h`,
   `--topbar-h`) and the page clears the deepest of them.
5. **Secondary labels collapse, accessible names do not.** The tab words go off the eyes
   with the stylesheet's own `clip-path: inset(50%)` pattern and stay in the accessibility
   tree; the dock's two phrases and the switcher's two labels are ellipsised to one line
   with their text nodes untouched; `קודם`, `הבא` and the words beside the undo arrows are
   `display: none` on buttons that carry the full sentence as `aria-label`. The app's own
   name in the top strip goes — it is not a control and the document `<title>` still names
   the app.

### What collapses at which breakpoint

| trigger | what it is | what it collapses |
| --- | --- | --- |
| `body.day-tight` | measured: first screen < 2 worker rows | tab words, dock phrases, switcher labels, `קודם`/`הבא` words, undo/redo words, the brand, the warning's 3rd line, the seams |
| `@media (max-width: 360px)` | the narrowest phone | `קודם`/`הבא` words, undo/redo words when `היום` joins them, day name 18→20px, warning line-height 1.2 |
| `body.day-compact` (v101, unchanged) | scrolled past 72px | the whole tools row's contents; the 4px track stays |
| `@media (max-height: 500px)` | landscape | the tools row's own line, the progress text, the storage notice |

`body.day-tight` is **not** a media query on purpose. The case it is for is not a width and
not a height: it is 469px of chrome plus 263px of bars on a 667px screen, which only a
measurement can see.

### Why it cannot chatter

The class shrinks the chrome it measures. Asked again with the class on, the same page
reports plenty of room, the class comes off, the chrome grows back — a page that flickers
between two layouts for as long as anybody looks at it. A threshold with a gap in it only
makes the flicker rarer. So `fitDayList` takes the class OFF, republishes the bar
properties from the natural layout (the dock is placed off `var(--nav-h)`, so reading it
before that is reading it where it used to be), measures, and puts the class back if the
natural page still cannot hold two rows — all inside one frame, before any paint. Asked
twenty times in a row in every one of the twenty-four cells below, the answer is one
answer. That is a check, not a claim: *"the collapse settles on one answer and stays
there"*.

The undo bar is deliberately **not** counted as room the crew has lost. It is the tallest
thing that ever floats over this page — 266px at 320 with a long name in its label — and it
is gone twelve seconds later. Counting it made every `✕` on a worker's row take the words
off the tab bar for twelve seconds and then put them back. What it covers is paid for the
other way, by `--undo-h` and the page's own bottom padding, which is what keeps the last
man tappable underneath it.

## The measurement matrix

### Widths × heights at the size the text ships at — before = after (nothing regressed)

| cell | topbar | warning | header | list starts | row | dock | tabs | whole names |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 320×667 | 52 | 62 | 154 | 283 | 67 | 69 | 102 | 3 |
| 320×844 | 52 | 62 | 154 | 283 | 67 | 69 | 102 | 5 |
| 320×932 | 52 | 62 | 154 | 283 | 67 | 69 | 102 | 7 |
| 375×667 | 52 | 60 | 154 | 285 | 69 | 69 | 102 | 3 |
| 375×844 | 52 | 60 | 154 | 285 | 69 | 69 | 102 | 5 |
| 375×932 | 52 | 60 | 154 | 285 | 69 | 69 | 102 | 6 |
| 390×667 | 52 | 60 | 154 | 285 | 69 | 69 | 102 | 3 |
| 390×844 | 52 | 60 | 154 | 285 | 69 | 69 | 102 | 5 |
| 390×932 | 52 | 60 | 154 | 285 | 69 | 69 | 102 | 6 |
| 430×667 | 52 | 60 | 154 | 285 | 69 | 69 | 102 | 3 |
| 430×844 | 52 | 60 | 154 | 285 | 69 | 69 | 102 | 5 |
| 430×932 | 52 | 60 | 154 | 285 | 69 | 69 | 102 | 6 |

Tab bar 102 includes the synthetic 34px home indicator; with no inset it is 76.
`whole names` counts rows whose whole box clears the top of the dock, unscrolled.
None of these cells collapses, and the check *"the day is NOT collapsed at the size the
text ships at"* holds all twelve to that: a phone that loses the words off its tab bar on
an ordinary evening is a regression, not a rescue.

### Widths × heights at 200% text — the case that was broken

| cell | before: list starts / whole | after: list starts / whole | collapsed |
| --- | --- | --- | --- |
| 320×667 | 469 / **0** | 393 / **1** | yes |
| 320×844 | 469 / 1 | 393 / **3** | yes |
| 320×932 | 523 / 2 | 528 / 2 | no |
| 375×667 | 493 / **0** | 402 / **1** | yes |
| 375×844 | 493 / 1 | 402 / **4** | yes |
| 375×932 | 493 / 3 | 493 / 3 | no |
| 390×667 | 493 / **0** | 402 / **1** | yes |
| 390×844 | 493 / 1 | 402 / **4** | yes |
| 390×932 | 493 / 3 | 493 / 3 | no |
| 430×667 | 493 / **0** | 355 / **2** | yes |
| 430×844 | 493 / 1 | 355 / **4** | yes |
| 430×932 | 493 / 3 | 493 / 3 | no |

Chrome, before → after, on a collapsed cell (320×667 at 200%): top strip 119 → 65,
warning 113 → 79, header 276 → 240, dock 144 → 72, tab bar 119 → 91. Total chrome and bars
732 → 556 on a 667px screen.

**Zero whole worker rows at every width at 667, and one at 844, is what this build did
before this change.** Not a short list — no crew at all, on the screen the app exists to be.

### Per-cell assertions, all twenty-four cells

| assertion | result |
| --- | --- |
| no horizontal overflow (`scrollWidth ≤ clientWidth`) | pass, 24/24 |
| every interactive target ≥44×44 in BOTH dimensions | pass, 24/24 |
| nothing below the 14px readable floor | pass, 24/24 |
| first / middle / last man: `elementFromPoint` at his centre returns his row | pass, 72/72 |
| last man clears every floating bar including `#undoBar` | pass, 24/24 |
| **a real `.tap()` on the last row opens HIS sheet** (title carries his name) | pass, 24/24 |
| a real `.tap()` on the week tab actually changes the screen | pass, 24/24 |
| the collapse settles on one answer over twenty measurements | pass, 24/24 |

### The other axes

| axis | where it is measured | result |
| --- | --- | --- |
| light and dark | the pre-existing matrix, 4 widths × 2 schemes × 2 insets, and a contrast check on a worker's name in dark | pass |
| safe inset 0 and 34 | the pre-existing matrix; the 24 new cells all run at 34 | pass |
| keyboard open | `320×667` and `390×844`: `applyKeyboardInset(291)` → both bars gone, `--nav-h` 0, sheet foot above the keys; and the shell does **not** collapse under a keyboard, and nothing is left behind when it closes | pass |
| undo banner visible | `320×667` and `390×844`: coverage measured and published (266px at 320), last man still the thing a tap hits under it, and the shell does **not** collapse for it | pass |
| warning banner visible | every one of the 24 cells is a `given` on the warning being up | pass |
| RTL visual order | `☰` at the start (right) corner, `קודם` right of the date, `הבא` left of it — the pre-existing suite's RTL checks, plus the nav-row rectangles measured here | pass |
| accessibility order | every control on the collapsed screen still has a name in the accessibility tree, computed the way a screen reader computes it (aria-label, else the text of subtrees that are not `display:none`/`visibility:hidden` — a `clip-path` box IS in the tree, a `display:none` box is not) | pass |

## Where the measurement disagrees with the Fable board

The board is a spec, not a proof. Four disagreements, with the numbers.

1. **`CD320Zoom` / `TextZoom200` — "200% אמיתי: הכול זורם מחדש לגובה … אין טקסט חבוי".**
   The board's 200% artboard draws the ordinary layout with nine worker rows on it. At a
   real 200% this build put **469px of chrome above the list and 263px of bars below it on
   a 667px screen** — 732 of 667, and no whole worker row at any of the four widths. The
   board's claim that nothing is hidden at 200% and that everything simply reflows to
   height is not reproducible; the collapse above is the honest answer, and it *does* hide
   text — from the eyes only, never from the accessibility tree.
2. **`.cd-date { font-size: 11.5px }`.** The board sets the date under the day name at
   11.5px. This app's readable floor is 14px and `tests/mobile.test.mjs` enforces it, so
   the shipped date is 14px. The board's own value would fail the board's own
   `TouchTable` promise of "every input ≥16px" by analogy and fails `unreadable()` outright.
3. **The dock and the tab bar.** `CDMeasure` puts the dock at 64px and the tab bar at 64px
   "without safe area". Measured: dock **69**, tab bar **76** with no inset and **102** with
   34px of home indicator. The 5px and 12px are the `pointer: coarse` padding and the 44px
   floors underneath; they were not shaved, because the floors are the law and the board's
   64 is the floor plus nothing.
4. **`CDMeasure` — "תחילת הרשימה ב-430 … 341".** Measured at 430 with no top inset: **285**.
   With the 59px top safe area the board adds, that is 344 — three pixels of the board's
   341, which is agreement, not disagreement, and is recorded here so the two numbers are
   not read as a conflict later.

The board's `CDMeasure` "after" column is otherwise met or beaten: app bar 52 (=52),
warning 60 (60–62), header + switcher + track 151 (154), worker row 68 (67–69),
rows above the dock 6/5/3 at 430/390/320 (6/5/3 with a home indicator, 7/6/3 without).

## Defects found and NOT fixed

**D1 — the undo and redo buttons announce the wrong thing.** `js/ui/undo.js` updates
`undoBtn.title` when an action becomes available (`בטל: <what>`) but never the
`aria-label`, which `js/ui/day.js` set once to `אין מה לבטל`. So after an edit the button
is enabled, its tooltip says what it will undo, and a screen reader still says "nothing to
undo". Reproduce: open the day, clear a worker's row, inspect
`document.getElementById('undoBtn').getAttribute('aria-label')` — `אין מה לבטל`, while
`.title` is `בטל: …`. This is now load-bearing for the collapse (the words beside the
arrows are hidden under `day-tight`, so the aria-label is the whole name), but the fix is
one line in `js/ui/undo.js`, which this lane does not own.

**D2 — the landscape bar is 101px, not the 62 its own comment claims.** The comment at the
end of `css/app.css` describes the landscape header as "62px in all, measured at 568x320".
Since the switcher moved into the header (v101) it has taken a second row. Measured at
568×320 on this tree: 101px collapsed, 105 not. The date is now on it and whole (see the
fix below), but the bar is a third of a landscape screen. Getting it back to one row means
deciding whether the switcher may be dropped in landscape, which is a product call.

**D3 — the top strip doubles when the sync chip is in an error state at 200%.**
`.topbar` measured 52px at 100%, 65px at 200% with no chip, and **119px** at 200% with
`שגיאת סנכרון` in the chip — the chip wraps to a line of its own. It scrolls away, so it
costs only the first screen, but at 320×932 it is the 54px that keeps that cell one row
short of collapsing. `js/app.js` (`renderSyncChip`) is not this lane's file.

## Fixed here, beyond the collapse

**The date button had no width at all in landscape.** At 568×320 the tools row claimed
393–412px of a 568px header (`.day-switch { flex: 1 1 100% }`) and `.day-nav` was written
`flex: 1 1 0; min-width: 0` — "the nav asks for nothing" — so the nav got 155px for four
controls whose floors add up to 188, and `.day-label` came out **0px wide**. The 44px
checks never saw it: an element of no size is skipped by `undersized()`. Three changes,
each with its own comment in the stylesheet: `.day-label` now states the 44px floor it was
exempted from; the landscape nav asks for its own content width (`flex: 1 1 auto`, **not**
`min-width: min-content` — that was measured too, and at 200% on a 320px screen the nowrap
day name made the nav 459px inside a 320px page, which is the sideways scroll the suite
exists to stop); and the switcher gives up its own line in landscape. Measured after:
header 101, date button 408px wide.

**`קודם`/`הבא` competed with the date at 320.** Measured before: the two pills took 116px
of the 304px row and the date had 127 — the two ways of *leaving* the day were as wide as
the day. Their words are now in a `.nav-word` span, dropped at ≤360px and under
`day-tight`, with `min-width: 44px` spelled out because `.btn-nav` is not in the global
44px list and would otherwise have become a 32px target. Measured after at 320: date 154px,
day name 18 → 20px, header unchanged at 154.

## Not provable here — physical iPhone acceptance rows

Chromium anchors `position: fixed` to the LAYOUT viewport; iOS anchors it to the VISUAL
viewport. iPhone floating-bar geometry cannot be reproduced in this harness and nothing
above should be read as covering it. These are acceptance steps for a real device:

- **A1.** On a home-screen iPhone, with the keyboard up on the assign sheet's hours field,
  both bottom bars are gone and the sheet's foot is above the keys — and both bars come
  back when the keyboard closes *without* a resize event (the v98/v99 fault).
- **A2.** With Dynamic Type at AX2 on a 4.7" phone (375×667 logical), the day screen shows
  at least one whole worker row, the date is whole, and the tab bar is icons only. Dynamic
  Type is not a uniform multiplier — each text style has its own curve, some clamp, and
  SF's optical variants change advance widths across 20pt — so the 200% pass above is an
  approximation of it and not a substitute.
- **A3.** VoiceOver on the collapsed screen: swiping the tab bar announces
  `היום / שבוע / צוות / דוחות`; the dock announces its two phrases in full; the nav
  buttons announce `יום קודם` and `יום הבא`. The tree computation above is Chromium's, not
  VoiceOver's.
- **A4.** A real finger, both orientations, on the last worker in a crew of thirty with the
  home indicator present — Playwright's `.tap()` is a synthesised pointer sequence at a
  point, not a fingertip contact patch.
- **A5.** The landscape bar (D2) against a real 812×375 screen with the browser's own
  chrome sliding, which Chromium does not model.
