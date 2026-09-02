# Handoff — v101: room on the day screen, and the item that could not give any

- Branch: `claude/farkad-mobile-design-review-odl8ue`
- SHA: `991ced4a8bd3b30f4536699f63137e27a65ef237`
- Base: `e4aa66b` (v100 as served)
- Build stamps at that SHA: `farkad-build` v101 · `APP_VERSION` v101 · `VERSION` farkad-v101
- Gates: `LEDGER_WRITES` false, `carryAdvances` false. Neither moved, and nothing in this
  round is behind either of them.
- Contract: `features/day-room/contract.md`
- Wave 2 of `features/next/opus-closeout.md`. The two other things that wave lists — the
  week strip's scroll cue and the two hardening pins — shipped in v100.

## What changed, and what each is worth in pixels

| item | what it does | measured |
|---|---|---|
| 1 | the day header compacts past a scroll threshold | scrolled, the chrome above the first name goes **157px → ~57px** |
| 2 | the switcher joins the header's tools row | unscrolled, **157px → 154px**. Three pixels. See below. |
| 3 | the site card's two footer buttons become icon buttons on its coloured head | **one row back per card**; five cards, five rows |

Nothing here touches data, sync, the record's shape or either money gate. It is one screen's
chrome, and the whole of it is pinned by `tests/mobile.test.mjs` at 430, 390 and 320, in both
colour schemes, portrait and landscape, and at 200% text.

## Item 2 did not do what the brief expected, and the number is the point

The brief asks for the switcher to stop having a row of its own so the crew gets that row
back. It does now stop having one — and the crew gets **three pixels**, not a row.

A 44px segmented pair costs a 44px line wherever it is put. Moving a line from below the
header to inside the header does not give a line back; it moves it. The header grows by
almost exactly what the row it absorbed used to cost:

| | v100 | v101 |
|---|---|---|
| day header | 103px | 154px |
| switcher's own row | 48px + 6px margin | — |
| **chrome above the first name** | **157px** | **154px** |

What item 2 actually buys is item 1's company: the switcher is not on the screen at all once
the list is moving, which a row below the header could never do. That is worth having, and it
is why the change ships. It is not room at the top of the page, and the release note says so
in those words.

**The pin moved with it, deliberately.** `tests/mobile.test.mjs` held the header to 96–112px.
That band stopped measuring anything real the moment the header swallowed the switcher's row,
so it is replaced by the SUM — header plus any switcher row of its own — held at no worse than
v100's 157, plus a widened band on the header itself and a check that the pair is inside the
header and still 44px in both dimensions. The reason is written in the test file, not only
here.

## Two wrong turns, measured, and left in the comments

Both are in `css/app.css` and `js/ui/day.js` where the next reader will meet them.

- **`flex-basis: 100%` on the pair itself.** It claims a line, but it pushed the fold's
  disclosure button down onto the steps' line; that line could then not hold the progress as
  well, so the progress took a third line. At 320 the header came out at **201px — forty-six
  pixels worse than v100**, which cost the smallest phone a whole name. Caught by
  `tests/mobile.test.mjs`'s «at least 3 whole names above the dock», not by reading.
- **`min-width: max-content` to make it claim its line.** Correct at every ordinary size and
  wrong at 200% text: the pair may then never be narrower than its own labels, and at 320 those
  labels are wider than the phone. The page scrolled six pixels sideways. A wrapper element
  (`.day-switch`) takes the line by being one item, and everything inside it is free to shrink.

## The scroll threshold, and why it is not v99's fault again

72px on, 12px off. Two numbers rather than one because collapsing the header takes about fifty
pixels out of the page and everything under it moves up by that much — with a single threshold
the page can land back on the wrong side of it and toggle again on the next frame, which is a
header that flickers while a thumb is travelling.

**The state comes from `scrollY` and from nothing else.** No layout is read in the scroll
handler, no box is measured, `visualViewport` is not asked. v99 spent a whole round taking a
viewport measurement out of the bottom bars — on a home-screen iPhone the two viewports can
disagree with no resize event, and the app read that as "a keyboard is up" and hid both bars
until it was killed. The suite scrolls down, checks, scrolls back and checks that the full
header RETURNS: a class that goes on at a threshold and never comes off would pass every other
check in that block.

**No bar moves.** Not the top strip, not the mode dock, not the day actions. That decision is
v99's and this round does not reopen it.

## What item 1 costs, named

The header's «בטל» is a flick away while the list is scrolled. The landscape block in
`css/app.css` argues in so many words that a control which must be scrolled to is not there
when it matters — and it is right, which is why it makes the opposite trade for a 320px-tall
screen where there is nothing to scroll back to.

Here the trade is still the one the brief asks for, because the undo BAR (`js/ui/undo.js`) is
untouched and still appears at the moment of the edit. The header's pair is for the mistake
noticed a name or two later, and that now costs one flick. Written down so that reversing it
is a decision and not a discovery.

## A defect found by a test, not by the change

The site card's glyphs sit on a colour no stylesheet knows: `paintSite` writes the head's
background as an inline style off `js/ui/sitecolor.js`. The first version gave the buttons the
translucent WHITE surface the count beside them uses. `tests/smoke.mjs`'s contrast check
refused it, and it was right to: a white overlay only ever lightens, so on the lightest of the
ten site colours (`--site-5`, the ochre) white ink over an 18% white wash is about **3.2:1** —
under the 4.5 floor, on one site out of ten, and invisible to anybody reading the stylesheet.

A dark scrim can only darken, so white ink on it clears the floor on every colour in the
palette and on any colour added later. That is the fix, and the reasoning is in the stylesheet.

## Expectations moved deliberately
- `tests/mobile.test.mjs`: the header's 96–112px band, replaced as described above. Nothing
  else in that file was relaxed; 21 checks were added.
- `tests/smoke.mjs`: two selectors that clicked «+ הוסף עובד» by its label now ask for the
  button by what it does, because the label is no longer written on it. Matched on the verb
  only — `isolate()` wraps the site's name in invisible bidi marks, so a name inside an
  aria-label never matches as plain text.
- No Hebrew string changed. The two accessible names on the card's head are new
  («הוסף עובד ל<site>», and the send button keeps «שלח את סידור <site> בלבד» unchanged).

## Migrations
None. Nothing on a disk or on the wire is touched. Rollback is a plain revert.

## Test output (verbatim, on the final commit)

**NOT YET COMPLETE, and this file says so rather than carrying a number from somewhere
else.** At the time this was written the release gate was still running on `991ced4` in a
clean detached worktree. What HAS been measured on this exact tree, separately and each
reported here only because it was actually run:

    npm test            43 suites   4380/4380   exit 0
    tests/mobile.test.mjs           807/807     (21 checks added by this round)
    npm run test:smoke              1130/1130
    npm run test:print              78/78
    npm run test:forms              10/10

`npm run test:release` — the gate that adds sendclaim and the six emulator suites — is the
one still outstanding, and **this build is not published until it comes back green on this
commit**. Its verbatim per-suite output replaces this section in the commit that publishes
the build. Two container restarts killed earlier attempts at it partway through the browser
suites; a killed run is not a result and none of its partial counts is recorded anywhere.

## Contract items NOT completed
None of items 1–3 is open. Item 2 is complete as specified and did not produce the room the
brief expected it to; that is measured above rather than left as a surprise.

## Known gaps, measured and named
- **No phone has run any of this**, and this is the round where that matters most: it is a
  round about how a screen feels under a thumb, measured entirely in headless Chromium. Every
  row of `docs/iphone-acceptance.md` is still NOT RUN. In particular the scroll threshold's
  behaviour under iOS rubber-band scrolling and momentum is NOT covered — Chromium does not
  emulate either, and a bounce past the top on a real iPhone is the first thing to look at.
- The mobile suite is Chromium, not Safari, and its 2× text pass is not Dynamic Type.
- **`firestore.rules` is still not deployed**, unchanged from v100 and still the owner's to
  run. `docs/rollout-checklist.md` has the steps.
- The two findings the v100 re-audit left OPEN are still open and untouched by this round —
  see `docs/data-safety-audit.md`.
- Both money gates are shut. Nothing in this round is behind them.
