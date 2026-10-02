# The iPhone close-out — lane P: an honest diagnostic, and a day screen that breathes

Base: `21c8e08` (v103), branch `claude/farkad-closeout-blockers`. Everything below was
measured in headless Chromium against a local server serving this tree. **No iPhone ran
any of it**, and §5 says exactly which questions that leaves open.

Files this lane changed: `js/ui/bars.js`, `js/ui/day.js`, `js/ui/settings.js`,
`css/app.css`, `tests/mobile.test.mjs`. No new script file, `index.html` untouched, no
build stamp moved, both money gates still shut.

---

## 0. The evidence, and what it is not

What this round inherited is a screenshot showing the two bottom bars floating in the
middle of the screen with page content underneath them, and a chip reading
«(59 ממתינים לשליחה)». They are **historical evidence**. They are not proof of what that
phone is running now, and they are not proof of a cause.

Three things are therefore not claimed anywhere below.

- **The build is not inferred.** A previous session read the app version off the pixel
  dimensions of a screenshot and lost a day to it. §2 exists so the version comes back as
  a string somebody read off their own phone.
- **The raised-bar geometry is not reproduced.** Chromium anchors `position: fixed` to the
  LAYOUT viewport; iOS Safari anchors it to the VISUAL viewport. A bar drawn against a
  viewport that has slid out from under it is exactly what the screenshot shows, and no
  suite in this repository can produce it. §3 measures everything on this side of that
  difference and says so in its own header comment in the suite.
- **"kbd-open is absent" is not treated as sufficient.** It is necessary, not sufficient,
  and this round found a defect that satisfies it: both bars measured, both classes right,
  every rectangle where the design says — and a tap on the last man in the crew landing on
  a third bar that nothing had ever measured. §4.1.

---

## 1. The design board

**Opened.** `https://claude.ai/code/artifact/10548f53-e554-4ffb-9bdb-520afdb9a06a` — a
design canvas of 110 artboards, read out of the `appifact-doc` record inside the published
page. The two carrying numbers for this lane are `CDMeasure` (the day screen, before →
after → saved) and `TouchTable` (every target that was under 44px, and its fix).

The board is a spec, not a proof. §4.4 and §4.5 report this tree's own measurements
against it, including the two places they disagree.

The board's own honesty markers are kept here: its "before" column was measured from a
screenshot of the LIVE app (430pt logical, 01/09/2026); its "after" column was measured in
Chromium on the built boards, not estimated; and it states that a physical iPhone
finger-tap test in both orientations is a manual acceptance step it does **not** claim was
performed. §5 carries that same distinction forward.

---

## 2. The diagnostic — what finally answers the version question

`js/ui/settings.js`, at the foot: `diagnosticText()`, `renderDiagnostic()`,
`copyDiagnostic()`, `askServiceWorkerBuilds()`, `syncReasonCode()`, `diagnosticAscii()`,
`diagnosticRect()`, `diagnosticFocus()`. Stylesheet: `.diagnostic-box`, `.diagnostic-text`.
The block is built into the settings sheet by JS, so `index.html` and `sw.js`'s SHELL are
untouched.

⋯ → «מידע טכני» → «🛠️ הצג מידע טכני». One read-only field, one «העתק» button.

### What it prints

Verbatim, from a real Chromium run at 390×844 on this tree:

```
--- farkad diagnostic ---
page.build=v103
app.build=v103
build.agree=yes
sw.controller=yes
sw.builds=farkad-v103
window=390x844
visual=390x844 scale=1.00 offsetTop=0 pageTop=0
scroll=0
dpr=2
standalone=no
scheme=light
orientation=portrait
focus=H2#settingsTitle
bar.tabs=fixed top=768 bottom=844 h=76
bar.dock=fixed top=699 bottom=768 h=69
bar.undo=hidden
css.bars=nav=76px dock=69px undo=0px topbar=0px kb=0px safe=0px
body.kbd-open=no
body.day-compact=no
sync.pending=0
sync.status=off
sync.reason=none
sync.code=-
writes.blocked=no
save.failed=no
navigator.online=yes
--- end ---
```

Every field the brief named is there: the build stamp (three of them),
`innerWidth`/`innerHeight`, `visualViewport` width/height/scale/offsetTop, what has focus,
the measured bounding rects of **both** bottom bars (and of the third one), the
pending-to-send count, and the sync reason.

Two are worth naming:

- **`sw.builds`** is the answer the owner has been asked for twice and has not sent. It is
  the service worker's own `which-builds` census (`sw.js`; the same message
  `js/ui/offline.js` already sends for the write fence), asked on a channel of its own with
  a 900 ms timeout. It is the only way to learn that a phone is running a page from one
  build under a worker from another — the state two rounds have been unable to rule out.
  `page.build` / `app.build` / `build.agree` answer the same question from the page's side.
- **`sync.reason`** is a code, not the Hebrew sentence: `refused` / `signin` /
  `unreachable` / `deaf` / `blind` / `unrecorded` / `message` / `none`, with `sync.code`
  carrying the cloud's own code (`permission-denied`, …). The code is **derived from
  `syncFailureReason()`'s own answer** rather than from a second walk over the same fields,
  so the report and the sentence on the screen cannot drift apart. Keeping it a code is
  also what keeps the block ASCII.

### The leak test

`tests/mobile.test.mjs`, suite «the diagnostic», at 320 and 390. The roster is seeded with
a Hebrew worker name (מוחמד אבו פרקד), a **Latin** worker name (Yosef Latin), a Hebrew site
(פרסדיה), a Latin site (Ashdod Yard), an e-mail-shaped string, and daily/hourly rates
437/613/51/77. The suite then asserts, against the actual text in the field:

| check | measured | why it is there |
|---|---|---|
| no worker's name and no site's name is in it | `[]` | the guarantee itself |
| and no amount out of the record either | `[]` | an amount is nobody's business on a WhatsApp thread |
| it is printable ASCII and nothing else | `[]` | the mechanism: a Hebrew name cannot survive it |
| and not the device id | absent (`d_gy3k6myq` was live and does not appear) | not argued about, simply not there |

The **Latin** name is the point of the pair. The report is ASCII by construction — every
value goes through `diagnosticAscii()` — so a Hebrew name could not appear whatever the
code did, and a test that only looked for Hebrew would be proving the mechanism instead of
the guarantee. A Latin name survives an ASCII filter, so it is seeded and looked for.

Also asserted, measured at 320 and 390: every named field is actually emitted (so a field
that quietly stops being printed fails here rather than on somebody's phone); the two
viewports both parse; both bars come back as `fixed top=… bottom=… h=…`; the field is
read-only, 16px (below 16 an iPhone magnifies the whole page on focus, and this field takes
focus on purpose), 254px wide and inside the screen at 320; «העתק» is 254×48; touching the
field selects all 582 characters; and with the block open the settings panel still has
nothing under 44×44 and nothing under 14px.

`copyDiagnostic()` uses `navigator.clipboard.writeText` and falls back to selecting the
field and saying so through `askTell` — no `alert`/`confirm`/`prompt` anywhere (law 11).

---

## 3. The transitions

`tests/mobile.test.mjs`, suite «the transitions», at 320×568 and 390×844, 34px home
indicator, crew of thirty. Eight states. After **every one** the same block runs:

1. every bar floating over the bottom sits on the bottom edge, in order;
2. each is measured at the height it is drawn at, and 0 when it is not floating;
3. **reach**, for the last man in the crew and for the dock's two buttons and the two end
   tabs — is the element what `document.elementFromPoint` returns at its own centre, is
   that centre inside the **visual** viewport (not the layout one; they differ under a
   pinch), and does the rect intersect the visible band;
4. **a real tap**, through the browser's input path: `tap()` the last row and assert the
   assign sheet opened **with that man's name on it** (`{"title":"עובד 30","wanted":"עובד 30"}`),
   then `tap()` the week tab and assert the screen actually changed.

Step 4 is why step 3 is not enough on its own, and step 3 is why a width measurement is not
a reach test.

| # | transition | how it is produced | bars, after | last row | real tap |
|---|---|---|---|---|---|
| T0 | at rest | — | tabs `fixed 466–568 h=102`, dock `fixed 397–466 h=69`, `--nav-h` 102px, `--day-actions-h` 69px | 258–324 reached | opened עובד 30 |
| T1 | keyboard up | `applyKeyboardInset(291)` with `.rate-hours` focused | both `display:none`, `kbd-open` true | — | — |
| T1 | keyboard down | blur, close the sheet, let `keyboardHeight()` decide | both back, measured 102/69 | 162–228 reached | opened עובד 30 |
| T2 | share/print sheet over the page | a 300px shortfall with **nothing focused** — the v98 fault | `decided=0`, tabs `grid`, `kbd-open` false | — | — |
| T2 | sheet closed | a stale class cleared by a touch | both back, 102/69 | 236–302 reached | opened עובד 30 |
| T3 | backgrounded and brought back | `visibilitychange` + `pageshow`, neither of which sends a resize | both back, 102/69 | 236–302 reached | opened עובד 30 |
| T4 | turned sideways | `setViewportSize` + `orientationchange` | 320→568×320: both still fixed, 102/69. 390→844×390: the tab bar moves into the header and is **not** fixed, `--nav-h` correctly 0, the dock is the only bottom bar at `291–390 h=99` | — | — |
| T4 | turned back | same, both ways | both back, 102/69 | reached | opened עובד 30 |
| T5 | pinched to 2× | CDP `Emulation.setPageScaleFactor` | `scale=2`, visual 568→284 (320) / 844→422 (390), `inner` unchanged; `decided=0`, tabs `grid`, `kbd-open` false | — | — |
| T5 | zoom released | back to 1 | both back, 102/69 | 236–302 reached | opened עובד 30 |
| T6 | the visual viewport moves on its own | `scroll` on `visualViewport`, which fires nowhere on `window` | both back, 102/69 | 236–302 reached | opened עובד 30 |
| T7 | the undo bar up | `offerUndo` with a long label | undo `fixed 280–387 h=107`, `--undo-h` 288px | 119–185 reached | opened עובד 30 |
| T7 | the undo bar gone | `dismissUndoBar` | `--undo-h` 0px | — | — |

**T4 taught the suite something.** How many bottom bars there are is a property of the
screen, not a constant: above 700px the tab bar moves up into the header and stops being
fixed, which a 390px phone turned sideways reaches. `barHeight()` deliberately reports 0
for a bar that is not floating over the bottom, so the fact the suite asserts is the one
true in both layouts.

**T5 is a real page scale, not a mimed one.** Measured on this Chromium:
`visualViewport.scale` 1 → 2 and its height 844 → 422 against an unchanged
`window.innerHeight`. That exercises the scale gate in `keyboardHeight()` for real —
without it a pinch reads as a keyboard and both bars vanish under somebody's zoom.

**What T5 and T6 cannot do, stated rather than glossed.** `visualViewport.offsetTop` stays
0 in this browser. `window.scrollTo` under a page scale moves nothing (`scrollY` measured
at 0 with the page scrolled to its end), and `Input.synthesizeScrollGesture` at the
coordinates that would pan the visual viewport is refused with `Position out of bounds`. So
the half of the gesture that actually produces the screenshot — the visual viewport sliding
**inside** a layout viewport that has not moved, leaving a `position: fixed` bar at the old
anchor — is **not reproducible here**. T6 drives the app's own listener for that event; it
does not reproduce the geometry. Acceptance rows P1 and P2.

---

## 4. The day screen

### 4.1 The third bar — the defect this round found

`js/ui/bars.js` opens with: *"Everything that scrolls has to clear BOTH, or the last worker
in the list sits under them — visible, and impossible to tap, because the tap lands on the
bar instead."* There are **three** bars. The undo bar (`#undoBar`) is `position: fixed` at
`bottom: calc(var(--bars-h) + 10px)` and nothing measured it, so the page reserved room for
two bars while three were covering it.

Reproduced before the fix, 320×667, 34px home indicator, crew of thirty:

| undo label | bar rect | last row | tap at the row's centre |
|---|---|---|---|
| «בוטל» (one line) | top 422, h 64 | 357–423 | **reached** — by one pixel |
| «הרישום של עובד עם שם ארוך מאוד נמחק מהאתר הראשי ומהיום הזה» (three lines) | top 379, h 107 | 357–423 | **MISSED** — `elementFromPoint` returned the undo bar |

The long label is not contrived: `editWithUndo` builds it as
`` `הרישום של ${isolate(worker.name)} נמחק` `` and a long Hebrew or Arabic name wraps it to
three lines on a 320px screen. On a wider phone the one-line bar clears the row by a single
pixel, which is how this survived four builds: it was never fixed, it was lucky. **At 200%
text it missed at every width measured — 320, 375, 390 and 430** (§4.4).

**The fix**, in the shape law 8 requires — measured, published, never a number in the
stylesheet:

- `bottomCoverage()` in `js/ui/bars.js` reports the strip of viewport from a fixed
  element's top edge to the bottom. Coverage, not height, because the bar carries its own
  10px lift and that lift is a stylesheet choice this file must not hold a copy of.
- `--undo-h` is published beside `--nav-h`, `--day-actions-h`, `--topbar-h`, `--kb-h`.
- `.app`'s bottom padding becomes `max(bars + 24, undo + 24, 24 + safe-bottom)`. `--undo-h`
  is deliberately **not** folded into `--bars-h`: the bar positions itself off `--bars-h`,
  and a variable containing the bar would move the bar.
- A `MutationObserver` on `#undoBar` re-measures when it appears, when its label changes
  and when it goes. `offerUndo` and the twelve-second timer are not always followed by a
  render, and which paths are is not `bars.js`'s business to know.

Measured after, same seed, ordinary text:

| width | `--undo-h` with the bar up | `.app` padding, idle → bar up → dismissed | last row's tap |
|---|---|---|---|
| 320×667 | 288px | 195px → 312px → 195px | **reached** |
| 390×844 | 245px | 195px → 269px → 195px | **reached** |
| 430×932 | 245px | 195px → 269px → 195px | **reached** |

Held by T7: the bar is measured while it is up, `--undo-h` equals `innerHeight − top`
exactly, it is deeper than the two docked bars added together (which is *why* it has to be
measured), the reach-and-tap block runs in that state, and the room comes back when it goes.

### 4.2 A serious error that was being collapsed away

«הרישום מושבת» — *this phone is refusing to record anything* — was the last child of
`.progress-line`. That element is clipped to one pixel by the compact header (v101) and
again by the landscape bar. So the moment the list was scrolled the badge went away, while
the banner explaining **why** had scrolled off the top a moment earlier: a screen that
looks ordinary, on a phone that is keeping nothing.

A folded warning is one a person can unfold. A clipped one is not. The badge now hangs off
`.progress` — a sibling of the clipped line — so it survives both states, and its size went
from 12px to 14px, the floor every other sentence in this app is held to.

Measured, writes held (`Recovery.halt`), list scrolled 600px:

| viewport | day header | `day-compact` | badge | painted at its own centre | px |
|---|---|---|---|---|---|
| 320×667 | 201 → 88 | yes | top 53, 112×26 | yes | 14 |
| 390×844 | 201 → 88 | yes | top 53, 112×26 | yes | 14 |
| 667×320 landscape | 106 → 55 | yes | top 15, 112×26 | yes | 14 |

Held by `tests/mobile.test.mjs`, suite «writes held, and the list scrolled», portrait and
landscape.

### 4.3 The visual viewport moving on its own

`bars.js` listened for `resize` on `visualViewport` and for `scroll` on `window`. On a
home-screen iPhone the visual viewport slides **inside** a layout viewport that has not
moved — the keyboard going down with the page scrolled, a zoomed page panned — and that
fires `scroll` on `visualViewport` and nothing on `window`. Added, with the same failsafe
shape as the two listeners beside it: it re-measures only while `kbd-open` is standing, so
when the class is not standing it reads one `classList` entry and returns.

### 4.4 The geometry, before and after

Bold means the number moved. Everything not bold is unchanged from `21c8e08` — which
is the honest headline of this section: **the day screen's resting geometry already met
the board's targets at v103, and this lane did not redesign it.** What moved is what
happens when the undo bar is up, and what happens to a long name at twice the text size.


**ordinary text, ordinary names** · 30 workers · a 34px home indicator · the warning collapsed · both bottom bars in place

| w×h | scheme | top strip | warning | day header | switcher | row | dock | tabs | list starts at | whole rows | last row, tapped | last row with the undo bar up | `.app` pad | `.app` pad, undo bar up |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 320×667 | light | 52 | 62 | 154 | 48 | 67 | 69 | 102 | 283 | 3 | reached | **MISSED → reached** | 195px | **195px → 290px** |
| 320×667 | dark | 52 | 62 | 154 | 48 | 67 | 69 | 102 | 283 | 3 | reached | **MISSED → reached** | 195px | **195px → 290px** |
| 375×667 | light | 52 | 60 | 154 | 48 | 69 | 69 | 102 | 285 | 3 | reached | reached | 195px | **195px → 290px** |
| 375×667 | dark | 52 | 60 | 154 | 48 | 69 | 69 | 102 | 285 | 3 | reached | reached | 195px | **195px → 290px** |
| 390×844 | light | 52 | 60 | 154 | 48 | 69 | 69 | 102 | 285 | 5 | reached | reached | 195px | **195px → 269px** |
| 390×844 | dark | 52 | 60 | 154 | 48 | 69 | 69 | 102 | 285 | 5 | reached | reached | 195px | **195px → 269px** |
| 430×932 | light | 52 | 60 | 154 | 48 | 69 | 69 | 102 | 285 | 6 | reached | reached | 195px | **195px → 269px** |
| 430×932 | dark | 52 | 60 | 154 | 48 | 69 | 69 | 102 | 285 | 6 | reached | reached | 195px | **195px → 269px** |

**text genuinely doubled — every px font-size in every stylesheet re-emitted at 2×** · 30 workers · a 34px home indicator · the warning collapsed · both bottom bars in place

| w×h | scheme | top strip | warning | day header | switcher | row | dock | tabs | list starts at | whole rows | last row, tapped | last row with the undo bar up | `.app` pad | `.app` pad, undo bar up |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 320×667 | light | 65 | 113 | 276 | 84 | 67 | 144 | 119 | 469 | 0 | reached | MISSED | 287px | **287px → 447px** |
| 320×667 | dark | 65 | 113 | 276 | 84 | 67 | 144 | 119 | 469 | 0 | reached | MISSED | 287px | **287px → 447px** |
| 375×667 | light | 65 | 129 | 280 | 84 | 69 | 111 | 119 | 493 | 0 | reached | **MISSED → reached** | 254px | **254px → 414px** |
| 375×667 | dark | 65 | 129 | 280 | 84 | 69 | 111 | 119 | 493 | 0 | reached | **MISSED → reached** | 254px | **254px → 414px** |
| 390×844 | light | 65 | 129 | 280 | 84 | 69 | 111 | 119 | 493 | 1 | reached | **MISSED → reached** | 254px | **254px → 414px** |
| 390×844 | dark | 65 | 129 | 280 | 84 | 69 | 111 | 119 | 493 | 1 | reached | **MISSED → reached** | 254px | **254px → 414px** |
| 430×932 | light | 65 | 129 | 280 | 84 | 69 | 111 | 119 | 493 | 3 | reached | **MISSED → reached** | 254px | **254px → 414px** |
| 430×932 | dark | 65 | 129 | 280 | 84 | 69 | 111 | 119 | 493 | 3 | reached | **MISSED → reached** | 254px | **254px → 414px** |

**ordinary text, long Hebrew and Arabic names** · 30 workers · a 34px home indicator · the warning collapsed · both bottom bars in place

| w×h | scheme | top strip | warning | day header | switcher | row | dock | tabs | list starts at | whole rows | last row, tapped | last row with the undo bar up | `.app` pad | `.app` pad, undo bar up |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 320×667 | light | 52 | 62 | 154 | 48 | 67 | 69 | 102 | 283 | 3 | reached | **MISSED → reached** | 195px | **195px → 290px** |
| 320×667 | dark | 52 | 62 | 154 | 48 | 67 | 69 | 102 | 283 | 3 | reached | **MISSED → reached** | 195px | **195px → 290px** |
| 375×667 | light | 52 | 60 | 154 | 48 | 69 | 69 | 102 | 285 | 3 | reached | reached | 195px | **195px → 290px** |
| 375×667 | dark | 52 | 60 | 154 | 48 | 69 | 69 | 102 | 285 | 3 | reached | reached | 195px | **195px → 290px** |
| 390×844 | light | 52 | 60 | 154 | 48 | 69 | 69 | 102 | 285 | 5 | reached | reached | 195px | **195px → 269px** |
| 390×844 | dark | 52 | 60 | 154 | 48 | 69 | 69 | 102 | 285 | 5 | reached | reached | 195px | **195px → 269px** |
| 430×932 | light | 52 | 60 | 154 | 48 | 69 | 69 | 102 | 285 | 6 | reached | reached | 195px | **195px → 269px** |
| 430×932 | dark | 52 | 60 | 154 | 48 | 69 | 69 | 102 | 285 | 6 | reached | reached | 195px | **195px → 269px** |

**doubled text AND long names — the worst case measured** · 30 workers · a 34px home indicator · the warning collapsed · both bottom bars in place

| w×h | scheme | top strip | warning | day header | switcher | row | dock | tabs | list starts at | whole rows | last row, tapped | last row with the undo bar up | `.app` pad | `.app` pad, undo bar up |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 320×667 | light | 65 | 113 | 276 | 84 | 67 | 144 | 119 | 469 | 0 | **MISSED → reached** | MISSED | 287px | **287px → 447px** |
| 320×667 | dark | 65 | 113 | 276 | 84 | 67 | 144 | 119 | 469 | 0 | **MISSED → reached** | MISSED | 287px | **287px → 447px** |
| 375×667 | light | 65 | 129 | 280 | 84 | 69 | 111 | 119 | 493 | 0 | **MISSED → reached** | **MISSED → reached** | 254px | **254px → 414px** |
| 375×667 | dark | 65 | 129 | 280 | 84 | 69 | 111 | 119 | 493 | 0 | **MISSED → reached** | **MISSED → reached** | 254px | **254px → 414px** |
| 390×844 | light | 65 | 129 | 280 | 84 | 69 | 111 | 119 | 493 | 1 | **MISSED → reached** | **MISSED → reached** | 254px | **254px → 414px** |
| 390×844 | dark | 65 | 129 | 280 | 84 | 69 | 111 | 119 | 493 | 1 | **MISSED → reached** | **MISSED → reached** | 254px | **254px → 414px** |
| 430×932 | light | 65 | 129 | 280 | 84 | 69 | 111 | 119 | 493 | 3 | **MISSED → reached** | **MISSED → reached** | 254px | **254px → 414px** |
| 430×932 | dark | 65 | 129 | 280 | 84 | 69 | 111 | 119 | 493 | 3 | **MISSED → reached** | **MISSED → reached** | 254px | **254px → 414px** |

Reading the four tables:

- **Nothing at rest moved.** Top strip 52, collapsed warning 60–62, header 154, switcher
  48, rows 67–69, list starting at 283–285, and 6 / 5 / 3 whole rows at 430 / 390 / 320×667
  — before and after, light and dark, ordinary names and long ones.
- **The undo bar was the whole defect.** At ordinary text it took the last man's row away
  at 320; at 200% text it took it away at 320, 375, 390 **and** 430. After: reached
  everywhere except 320×667 at 200% text, where nothing can fix it — see below.
- **Long names cost nothing now.** With `min-width: 0` and `flex: 1 1 50%` a long Hebrew or
  Arabic name is ellipsised instead of pushing the row off the screen: rows stay 67/69 and
  the whole-row counts stay 3/3/5/6, exactly as with short names. Before the fix that same
  row measured 1008px wide inside a 320px screen with its ✕ at x = −732 — off the screen
  entirely, at 320 and at 390 both — see §4.5.
- **One case is not fixed and cannot be**: 320×667 at 200% text with the undo bar up. That
  screen has 469px of chrome above the list and a 144px dock below it before the undo bar
  arrives at all — `whole rows` is already **0** there without it. The undo bar is now
  capped at three lines (447px of coverage instead of 727), but there is no scroll position
  at which a 68px row clears a 447px bar on a 667px screen. The honest answer is that a
  320×667 phone at AX2 cannot show a worker row and an undo bar at the same time; the undo
  bar expires after twelve seconds and the header's own בטל stays. It is listed as
  acceptance row P12.


### 4.5 A row three times the width of the screen

Found while measuring §4.4 at 200% text with long names, and it is the second defect this
round turned up.

`.wrow-main` is `flex: 1`. A flex item's `min-width` defaults to `auto`, which is its
MIN-CONTENT — and the min-content of an unbreakable Hebrew or Arabic name is the whole
word. So `flex: 1` never held the button to the row. Measured before the fix, at 200% text
with a long name:

| | `.wrow-main` width | `.wrow-name` width | the row's ✕ |
|---|---|---|---|
| 320×667 | **1008px** inside a 320px row | 652 | at x = **−732 … −688** — off the screen |
| 390×844 | **1008px** inside a 390px row | 652 | at x = **−662 … −618** — off the screen |

`.worker-list` clips the overflow, so `document.scrollWidth` stayed 320 and every
"the page does not scroll sideways" check in the mobile suite passed. What went off the
screen was the END of the row: the ✕ that clears a man's day, and the badges saying where
he was. It could not be reached by any tap at any scroll position.

The fix is `min-width: 0` on `.wrow-main`, plus `flex-wrap: wrap` and `flex: 1 1 50%` on
the name inside the phone block. Measured after, same seed:

| | `.wrow-main` | `.wrow-name` | the ✕ | row height |
|---|---|---|---|---|
| 320, 200% text | 272 (inside the row) | 248 | x = 0 … 48, on screen | 91 (grown, as the board says rows do at 200%) |
| 390, 200% text | 342 | 318 | x = 0 … 48, on screen and hit-tested | 91 |
| 320/375/390/430, ordinary text, long names | the row's width | ellipsised | on screen | 67 / 69 / 69 / 69 — unchanged |

The `50%` is measured rather than chosen: `flex: 1 1 auto` protects the name just as well
but makes a long name demand a line of its own at ORDINARY text too, which took every row
from 69 to 71 and cost a 375px phone a whole name off the first screen (3 → 2). Asking for
half instead leaves ordinary sizes untouched and only wraps when the badge alone is wider
than the row, which is what 200% does.

### 4.6 Touch targets, against `TouchTable`

Measured on this tree, first visible instance of each, at four widths:

| target | board's "after" | 320×568 | 375×667 | 390×844 | 430×932 |
|---|---|---|---|---|---|
| ☰ בחר יום | 44×44 | 44×44 | 44×44 | 44×44 | 44×44 |
| the date button (`day-label`) | min-height 44 | 127×44 | 158×44 | 173×44 | 213×44 |
| קודם / הבא | 44 (unchanged) | 60×44 / 56×44 | 72×44 / 68×44 | 72×44 / 68×44 | 72×44 / 68×44 |
| בטל / שוב | 44 (unchanged) | 44×44 / 44×44 | 59×44 / 56×44 | 59×44 / 56×44 | 59×44 / 56×44 |
| the by-worker/by-site switch | 48 | 115×44 | 143×44 | 150×44 | 170×44 |
| a worker row | 68 | 276×66 | 331×68 | 346×68 | 386×68 |
| a tab | 50 (unchanged) | 74×61 | 87×61 | 91×61 | 101×61 |
| the dock's two buttons | 48 (unchanged) | 160×48 / 120×48 | 192×48 / 143×48 | 201×48 / 149×48 | 225×48 / 166×48 |
| week day-header cell | **48×64** | 67×**44** | 79×**44** | 82×**44** | 88×**44** |
| week worker-day cell | 48×44 | 48×48 | 48×48 | 48×48 | 49×48 |
| ✕ settings | 44 | 44×44 | 44×44 | 44×44 | 44×44 |

Everything clears 44×44 in both dimensions at every width. **One disagreement with the
board, reported rather than papered over:** the week's day-header cell is 44 tall here, not
the 64 the board specifies. It is above the floor and the mobile suite passes it, so this
lane did not change it — the week grid is not this lane's file. It is a discrepancy for
whoever owns `js/ui/week.js` to settle: at 64 the header would carry a day name and a date
on two lines, which is what the board's artboard draws.

---

## 5. What is NOT provable here — acceptance rows for a physical iPhone

These belong in `docs/iphone-acceptance.md`, which this lane does not own — hand them to
whoever does. Every one is **NOT RUN**.

| # | what to do | what must happen | why no suite here can say |
|---|---|---|---|
| P1 | On the home-screen app: scroll the day list, then pull the page down and let it settle | Both bottom bars stay ON the bottom edge. If either floats mid-screen with content under it, that is the original fault | Chromium anchors `position: fixed` to the layout viewport, iOS to the visual viewport. The geometry cannot be produced here |
| P2 | Pinch to zoom in, pan to the bottom of the list, tap the last man | His sheet opens, with his name on it | `visualViewport.offsetTop` stays 0 in headless Chromium; `Input.synthesizeScrollGesture` is refused at the coordinates that would pan it |
| P3 | Open a field, dismiss the keyboard **with the page scrolled**, then tap the last man | Both bars return, and the tap reaches him | the return is measured here through the app's own seam; that Safari fires the events that seam is driven by is an assumption |
| P4 | Press «הדפס», then close the sheet iOS opens (or does not) | Both bars return without killing the app | Safari's print sheet has no Chromium equivalent |
| P5 | Background the app for a minute, bring it back, tap the last man | Bars in place, no empty strip at the bottom, the tap reaches him | `visibilitychange`/`pageshow` are dispatched here as events, not produced by the OS |
| P6 | Turn the phone sideways, scroll to the end of the list, tap the last man, in **both** orientations | Reached, in both | a real finger on real glass — the board says this too and does not claim it |
| P7 | iOS → Display → Text Size → largest (AX2), then open the day screen and the assign sheet | Nothing clipped, no button gone, every target still a finger's size | the 200% pass rewrites the CSS cascade; it is a real reflow and it is not Dynamic Type |
| P8 | ⋯ → מידע טכני → «העתק», paste into WhatsApp | The block pastes whole, and `sw.builds` names a build | `navigator.clipboard` behaves differently inside a home-screen web app; the fallback path is written and unexercised on a phone |
| P9 | With writes held (quarantine), scroll the day list | «הרישום מושבת» stays on the screen | measured here in Chromium; the compact header under Safari's own scroll is not |
| P10 | Delete a worker's day so the undo bar appears carrying a long name, then tap the last man in the list | He is reached, not the undo bar | the fix is measured here; a real finger on a real 320px screen is not |
| P11 | Send back the diagnostic block from the phone that produced the floating-bars screenshot | `page.build`, `app.build` and `sw.builds` all name the same version — or they do not, which is the answer | this is the one row that ends the guessing, and only the owner can run it |
| P12 | On the smallest phone at AX2: delete a worker's day so the undo bar appears, then try to reach the last man in the list | If he cannot be reached, that is expected on that screen — the undo bar expires in twelve seconds and בטל stays in the header. What must NOT happen is the bar covering the screen with no way out | measured here as a geometric impossibility, not as a bug; a person's judgement of whether it is tolerable is not a measurement |

---

## 6. What was run

`node tests/mobile.test.mjs`, on this working tree, Node v22.22.2:

```
**FAIL**  the origin served this commit, byte for byte  — 44 assets;
          css/app.css: served 8fe4e06fdc12 != a2e7aa1d2edf
          js/model/schema.js: served c4d47c1eb53f != 348200d29ca7
          js/sync/sync.js: served b7366912d1f2 != 1c9a8c142866
1026/1027 checks passed
```

**The one failure is `treecheck`, and it is expected on an uncommitted tree.** That check
hashes what the origin served against the Git blob at HEAD (`21c8e08`); this tree carries
this lane's edits AND two other lanes' (`js/model/schema.js`, `js/sync/sync.js` — not mine,
not touched by me). It cannot pass until somebody commits. **Every other check passed**,
including all 220 the transitions, diagnostic and writes-held sections add.

For comparison, on the same commit before this lane: `807/807 checks passed`, exit 0, on a
clean detached tree. So this lane adds **220 checks** and no check was removed, weakened or
re-pinned. No pinned expectation moved: the header stays 96–160, the switcher 44–48, the
rows 64–72, the whole-row counts 6 / 5 / 3 / 1, and every Hebrew string in this suite is
untouched.

`npm test` and `npm run test:release` were **not** run by this lane — they are the
coordinator's gates, and a gate on a tree three agents are still writing to is not a gate.
Nothing above may be read as a release gate.

## 7. The stamps and the gates

`farkad-build`, `APP_VERSION` and `VERSION` were **not** moved — the coordinator bumps them
once at the end, and `css/app.css` is a cached file, so they must move in whatever commit
carries this. `LEDGER_WRITES` and `carryAdvances` are untouched and still `false`.

No new script file. `index.html` and `sw.js` are untouched, so the SHELL needs no entry.
