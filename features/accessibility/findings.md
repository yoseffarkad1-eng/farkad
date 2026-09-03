# Accessibility — what three men on a site can actually operate

Measured on the working tree at **094231f** (v103). Nothing here was fixed; nothing under
`js/`, `css/`, `index.html`, `sw.js` or `tests/` was touched.

F2 was re-checked by the integrator before this file was committed, by reading rather than
by measuring, and it holds: `css/app.css:425-428` carries the diagnosis in its own words -
"`--ink-3` on paper is 3.2:1, which is under the 4.5:1 a small glyph needs and exactly the
sort of thing that reads fine to whoever chose it and not at all on a site at four in the
afternoon" - and the line under it applies the cure to `#settingsBtn` alone, while the
`.btn-icon` rule eight lines above still sets `color: var(--ink-3)`.

## What this is

Not a checklist run. The question asked was whether three specific people can operate this
app: three men, on building sites, on phones, in sun, with dusty or gloved hands, reading
Hebrew, one of them older. Everything below is ranked by what it costs THEM, and where a
formal WCAG point does not cost them anything the report says so and moves on.

The app is already better on this than most. Every icon-only button but one carries a
Hebrew name; the dialogs have a real keyboard contract; the bidi work in `js/ui/dom.js` is
the most careful thing of its kind I have read. The list at the end of confirmed-good
things is there so nobody re-checks them.

Two of the findings below are already written down inside the files they are about, in
comments that diagnose the fault correctly and then fix one call site out of thirty
(F2) or the neighbouring element instead of the one in front of it (F6). Those are the
cheapest to close and the most embarrassing to leave.

## How it was measured

- The tree served by `tests/serve.mjs` out of the working directory, opened in the
  Playwright Chromium already installed here — **141.0.7390.37**, `playwright-core`
  **1.56.1**, Node **v22.22.2**. Viewport 390x844 unless a finding names another width.
  `colorScheme` forced per scheme; no `isMobile` unless a finding says so.
- Accessible names and roles come from the browser's own accessibility tree
  (`Accessibility.getFullAXTree` over CDP), not from reading attributes.
- **Contrast, two ways, and they are different claims.** Token pairs (`--ink-3` on
  `--paper`, and so on) are computed from the hex values in `css/app.css` itself. On-screen
  figures are sampled: an element is screenshotted, its background is the most common pixel
  in its own box, its ink is its computed `color` composited onto that background when
  translucent. Where both were available they agreed (site-count: 4.23 computed, 4.29
  sampled). One earlier reading of mine was a screenshot-clip artefact — the rate select
  read as 2.45:1 — and it is wrong; measured through the element it is 16.43:1. It is named
  here so nobody finds the discarded number somewhere and treats it as a result.
- **I did not run `npm test` or `npm run test:release`.** No suite count appears in this
  file. Where a finding says the gate cannot see something, that is read off the suite's
  own fixture, quoted.
- The tree moved under me mid-audit (2509cbf -> 094231f, the perf maps and the iOS bar
  drop). Every measurement quoted below was re-run afterwards and reproduced identically
  at 094231f. Line numbers are 094231f's.

**PROVED** means I made the browser do it and read the number off. **SUSPECTED** means the
mechanism is in the source and the consequence is well established but needs a real
screen reader or a real iPhone, which this box does not have.

---

# The findings, ranked by what they cost these three men

## F1 — At 200% text the day screen's DEFAULT view runs off the side of the phone. PROVED

`css/app.css:2304` (`.site-grid { grid-template-columns: 1fr; }`), default set at
`js/ui/day.js:22`.

Measured with the mobile suite's own fixture and its own scaling mechanism (every
`font-size` rule in every sheet re-emitted at twice its value, `!important`, in one style
tag appended last — copied from `tests/mobile.test.mjs`), after `showView('day')` and
`render()`:

| width | by worker, 200% | **by site, 200%** |
|---|---|---|
| 320 | 320 / 320 | **398 / 320 — 78px off the side** |
| 375 | 375 / 375 | **398 / 375 — 23px off** |
| 390 | 390 / 390 | **398 / 390 — 8px off** |
| 430 | 430 / 430 | 430 / 430 |

The widest node is `.site-card` at 386px. What sits at its inline end is the ＋ and the 💬
— the two buttons v101 moved onto the coloured head. At 375 with Dynamic Type up, they go
past the edge, and the page has to be dragged sideways to reach them.

`1fr` is `minmax(auto, 1fr)`, and `auto` as a track minimum is the item's **min-content**
width. The card's min-content is set by the `<select>` inside it, whose own min-content is
its longest option (`שעות נוספות`) at twice the size. So the track refuses to be smaller
than the card, and the card refuses to be smaller than the select.

**What a person experiences.** The older man turns text up. The by-site view is what the
app opens on. The two buttons on every site card slide off the screen edge, and nothing on
screen says the page can be dragged.

**Severity for these three: highest.** It is the default screen, it is the accommodation an
older man actually makes, and the two affected buttons are "add a man to this site" and
"send this gate its seder".

**Why the gate does not see it.** `tests/mobile.test.mjs:55` — `async function open({ ...,
mode = 'workers' })`. The 200%-text block calls `open({ width, height })` and takes the
default. The by-site fixture further down (`${width}px: the day, by site`) does check
`the page does not run off the side`, but only at ordinary text. The two blocks between
them cover every width and every mode except this one cell.

**The fix.** `grid-template-columns: minmax(0, 1fr)` in the phone block, and let
`.assign-row` wrap when its rate control cannot shrink. Then add the missing cell: the
200% block opened with `mode: 'sites'` as well.

## F2 — In the light scheme `--ink-3` is under the floor everywhere it is used, including the date. PROVED

`css/app.css:57` (`--ink-3: #7a8797`), used in 33 places.

Computed from the stylesheet's own values:

| | light | dark |
|---|---|---|
| `--ink-3` on `--surface` (#ffffff) | **3.66** | 4.65 |
| `--ink-3` on `--paper` (#eef1f5) | **3.23** | 5.11 |
| `--ink-3` on `--surface-2` | **3.00** | **4.03** |

Sampled off the rendered page, light scheme, and every one of these is small text at a
4.5:1 floor:

- `.day-date` — **3.66:1** — `12/08/2026`, the date on the day header. `css/app.css:944`.
- `.btn-icon` at its class default — **3.66:1** — measured on the ✕ that clears a man's
  record (`.assign-row .btn-icon`) and on the ✏️ that opens a worker (`.roster-actions
  .btn-icon`). `css/app.css:416-420`.
- `#storageNotice` — **3.23:1** — the sentence that says whether the other two phones can
  see tonight's work.
- `.hint` — **3.66:1** — every explanatory line in the ⋯ panel and every form.
- `.tray-empty` — 3.66:1. `.week-table thead small` (the dates across the week) — **3.00:1**.
  `.cell-absent` — **3.00:1**.

**The stylesheet already knows.** `css/app.css:424-427`:

> *the text colour rather than the quiet one: --ink-3 on paper is 3.2:1, which is under the
> 4.5:1 a small glyph needs and exactly the sort of thing that reads fine to whoever chose
> it and not at all on a site at four in the afternoon.*

That comment is attached to `#settingsBtn`, and `#settingsBtn` is the only thing it was
applied to. The class it diagnoses — `.btn-icon`, eight lines above — still carries
`--ink-3`, and so do thirty-two other rules.

**What a person experiences.** At four in the afternoon on a site, the date on the header
is the faintest thing on the screen. Recording a day against the wrong date is the money
bug this app's whole calendar is built around, and the label that prevents it is the one
under the floor. 4.5:1 is an indoor number; in direct sun the real floor is higher, so
`--ink-2` at 7.04:1 is where these lines want to be, not 4.5.

**Severity for these three: highest, jointly with F1.** It is every screen, all the time,
in the light scheme, which is what a phone in sunlight is in.

**The fix.** Raise `--ink-3` in the light scheme until it clears 4.5:1 on `--surface-2`
(the darkest ground it has to survive), or retire it for `--ink-2` on the lines that carry
a fact rather than an aside — the date, the icon buttons, the sync sentence. Dark is nearly
fine; only `--ink-3` on `--surface-2` (4.03) fails there, and it is the week grid.

## F3 — The day drawer is a dialog that is not one, and never leaves the page. PROVED

`index.html:133` (`<aside class="day-drawer" id="dayDrawer" aria-label="בחירת יום">`),
`js/ui/day.js:451-467`, `css/app.css:2404-2418`.

Every other dialog in the app was driven and measured. This is the whole table:

| dialog | focus enters | Tab held (20 presses) | Escape closes | focus returns |
|---|---|---|---|---|
| askModal | yes | held | yes | **no — BODY** |
| quickModal | yes | held | yes | **no — BODY** |
| assignSheet | yes | held | yes | yes |
| workerPickerModal | yes | held | yes | yes |
| placePickerModal | yes | held | yes | yes |
| workerFormModal | yes | held | yes | yes |
| workerDaysModal | yes | held | yes | yes |
| shareModal | yes | held | yes | yes |
| migrationModal | yes | held | yes | yes |
| signInModal | yes | held | yes | **no — BODY** |
| settingsPanel | yes | held | yes | yes (`#settingsBtn`) |
| reorderPanel | yes | held | yes | yes (`#reorderOpenBtn`) |
| **dayDrawer** | **no** | **left on 20 of 20** | yes | **no** |

The drawer has Escape (`drawerKeydown`, `js/ui/day.js:464`) and nothing else. Measured:

- **It is never removed from the page.** Closed, it is `display: flex`,
  `visibility: visible`, `transform: translateX(310px)`, with no `aria-hidden` and no
  `inert`. Its buttons have a live `offsetParent`. Before it has ever been opened, its ✕ is
  already a tab stop at x=406 on a 390px screen. After one open and close it is **26**
  buttons parked off the right-hand edge, all reachable. A Tab walk from the top of the day
  screen reached 14 of them within 40 presses and had not finished.
- **Focus does not enter it.** `document.activeElement` right after `openDayDrawer()` is
  `BODY`. The first six Tab presses with the drawer open went to the tab bar, ⋯, and the
  account banner — every one of them behind the drawer.
- The `<aside>` has an `aria-label` and no `role="dialog"`, so it is a permanently present
  landmark rather than a dialog that comes and goes.

**What a person experiences.** For the two men who use touch: nothing — until the day one
of them turns VoiceOver on. Then the day screen has an extra fortnight of invisible day
buttons at the end of it, always, and pressing ☰ does not take the reader anywhere. For
whoever builds the seder on a desktop keyboard — which `js/ui/modal.js:3-5` says happens —
pressing ☰ and then Tab moves focus behind the panel that just opened.

**Severity for these three: high, and it is the only dialog in the app that is wrong.** The
gap is worth naming as a gap rather than a design: `settingsPanel` and `reorderPanel` are
not `.modal`s either and both implement the full contract by hand.

**The fix.** Either give the drawer the same hand-written contract the other two
non-`.modal` panels have (enter at a heading, trap Tab, return focus to the ☰), or make it
`display: none` when closed so at minimum it stops being 26 tab stops on every screen. The
second half is one line and closes the worst of it.

## F4 — Focus never comes back from the three dialogs that put the cursor in a field. PROVED

`js/ui/modal.js:76-85`, against `js/ui/ask.js:80-82`, `js/ui/quickstart.js:18-19`,
`js/ui/modal.js:164-167`.

Ten of thirteen dialogs return focus to where the person was. Three do not, and they are
exactly the three that focus a text field for themselves:

    askModal     focus while open: askInput      after Escape: BODY (at 50ms, 300ms, 1000ms)
    quickModal   focus while open: quickText     after Escape: BODY
    signInModal  focus while open: signInEmail   after Escape: BODY
    shareModal   focus while open: a button      after Escape: settingsBtn

Closing by the dialog's own ביטול button does the same thing — this is not about Escape.

**The mechanism.** `watchModals`'s MutationObserver fires at the microtask checkpoint,
after the whole synchronous block that both revealed the dialog *and* moved focus into it:

    parts.modal.style.display = 'flex';     // ask.js:80  — mutation queued
    parts.input.focus();                    // ask.js:82  — activeElement is now the input
    ...                                     // observer runs here

So `focusBeforeModal = document.activeElement` (`modal.js:79`) records a node **inside** the
dialog. On close, `focusBeforeModal.focus()` is called on a node whose ancestor is now
`display: none`, which is a no-op, and focus lands on `<body>`. `focusFirst` at
`modal.js:103-105` anticipates precisely this case — *"Whatever the dialog already focused
for itself is left alone"* — and the capture two dozen lines above it does not.

**What a person experiences.** `askText` is this app's `prompt()`. Renaming a site,
correcting an amount, answering the reorder guard — they all go through it. On a keyboard,
every one of those questions drops the person back at the top of the document.

**Severity for these three: medium.** It costs the touch users nothing and the desktop
seder-writer a lot. It is worth fixing mostly because `docs/iphone-acceptance.md` row 33
already promises it — *"פתח דיאלוג וסגור ב-Escape/החלקה -> חוזר לאותו מקום שהיית בו"* — and
that row has never been run on a phone. It would fail today, on the most-used dialog.

**The fix.** Capture the opener before the dialog can steal focus: set
`focusBeforeModal` in the openers themselves, or have the observer ignore a candidate that
is inside an open modal (`if (!open.some(m => m.contains(candidate)))`) and fall back to
the last focused element outside one.

## F5 — On a phone the week grid says which site by colour and by nothing else. PROVED

`css/app.css:2071` (`.week-cell .cell-line .site-mark { display: none; }`) and the rule
above it hiding `.site-name`; `js/ui/week.js:239-240`.

Two channels are supposed to carry a site's identity: the colour narrows the search, the
name confirms it (`js/ui/sitecolor.js:189-190`). Under 424px the second channel is switched
off, and so is the third — the ◆ that `sitecolor.js:196-198` exists to add when the palette
wraps past ten. Measured at 390px with two sites in the same palette slot:

    cell 11/08  site p_01 (הרצליה)          background rgb(29, 78, 216)   innerText ""   site-mark: (none present)
    cell 13/08  site p_11 (אתר אחד עשר)     background rgb(29, 78, 216)   innerText ""   site-mark: display:none

Same colour, no text, and the one mark that distinguishes them suppressed. The legend under
the grid does show `◆ | אתר אחד עשר` — but the legend names the colour, and the colour is
shared, so the legend cannot answer which of the two a given cell is.

**And the cell is a leaf with the site removed.** `cell.setAttribute('aria-label',
'${worker.name} · ${day} ${date}')` at `js/ui/week.js:239` overrides the cell's contents for
the accessibility tree. Read back off the browser: name `"דוד · יום שישי 07/08/2026"`,
`childIds` **0**. Who and when; never where. The whole week grid is unreadable
non-visually, and an absence — which does have the word `נעדר` in the DOM — is announced
identically to a blank day.

**What a person experiences.** Eleven sites is not hypothetical for a firm running gates;
the palette is built to wrap. The screen a manager reads a whole week off is the screen
where the wrap becomes invisible.

**Severity for these three: high once there are eleven sites, none before.** It is a
latent failure with a date on it.

**The fix.** Let the `.site-mark` through at phone widths — it is one glyph on a 16px block
and the whole point of the cycle. And extend the cell's `aria-label` with the site (and
`נעדר` when absent). Both are new Hebrew strings and law 6 applies: the pin that reads this
label is `tests/smoke.mjs:7862-7865`, and it asserts `cellLabel.includes('בודק')`, so
appending to the label does not move it — but that is a fact to re-check, not to assume.

## F6 — The count on the site head is white ink on a white wash, and the comment beside it says why that is wrong. PROVED

`css/app.css:1018` — `.site-head-color .site-count { background: rgba(255, 255, 255, .22); color: #fff; }`

White on a 22% white wash over the site colour, 14px/600 — small text, 4.5:1 floor:

| slot | light | dark |
|---|---|---|
| 1 | **4.23** | **3.51** |
| 2 | **3.60** | **3.40** |
| 3 | **3.37** | **3.22** |
| 4 | 4.55 | **3.72** |
| 5 (the ochre) | **3.27** | **3.16** |
| 6 | **3.51** | **3.24** |
| 7 | 4.51 | **3.64** |
| 8 | **4.29** | **3.57** |
| 9 | **3.58** | **3.20** |
| 10 | 4.74 | **3.56** |

Fails on eight of ten in light and on all ten in dark. Sampled on the rendered page for
slot 1: **4.29:1** light (`#ffffff` on `#4e74e0`), **3.51:1** dark. The computed and the
sampled figures agree.

Thirteen lines below it, `css/app.css:1041-1046` explains this exact construction and
refuses it:

> *The first version used the translucent WHITE the count beside it uses, and
> tests/smoke.mjs refused it. It was right to: a white overlay only ever LIGHTENS ... on the
> lightest of the ten (--site-5, the ochre) white ink over an 18% white wash is about
> 3.2:1 — under the 4.5 floor, on one site out of ten, and invisible to anybody reading the
> stylesheet.*

The buttons took the fix (dark scrim, measured at 7.18-10.50:1 across the palette, sampled
9.35:1 on slot 1). The count, which is the thing the sentence was written about, still
wears the white wash at a slightly higher alpha — 22%, so slightly worse than the 18% the
comment measured.

**What a person experiences.** The number of men at a site washes out on the ochre and the
green, in both schemes, worst in sun.

**Severity for these three: medium.** It is a count they can also get by reading the rows
under it. But it is the cheapest fix in this document — the same dark scrim, one line — and
leaving it means the stylesheet contains a correct diagnosis of a live defect.

**The fix.** `background: rgba(0, 0, 0, .22)` on `.site-count` inside `.site-head-color`,
for the reason already written above `.site-head-btn`.

## F7 — The day's live region is a new node on every render, so the one thing it says is the thing least likely to be heard. PROVED (node identity) / SUSPECTED (the silence)

`js/ui/day.js:303, 327-328, 331`.

`renderDayProgress` builds `.progress-line` from scratch, fills it, and then sets
`role="status"` and `aria-live="polite"` on the freshly built node before inserting it.
Measured across three ordinary edits: **three distinct `.progress-line` nodes**, each
carrying `aria-live`.

`index.html:283-286` states the rule this breaks, about the panel next door:

> *It lives out here rather than inside the list, because the list is redrawn on every move
> and a live region that is destroyed and rebuilt is a live region that announces nothing.*

The node identity is PROVED. That the browser therefore does not announce it is the
well-established consequence of inserting an already-populated live region, and it is
SUSPECTED here: confirming it needs VoiceOver, which this box does not have.

What rides on it: the climbing count and the day switch — `js/ui/day.js:324-325` calls them
*"the two things a person not looking at the screen most needs to hear"* — the hidden twin
of the date built at line 306 purely for the announcement, and the `הרישום מושבת` badge at
line 331, which is the **only text anywhere** saying that writing is held (see F11).

**Severity for these three: low today, structural.** None of them runs a screen reader that
I know of. But this is the region the design leans on, and it is inert.

**The fix.** Put an empty `.progress-line`-shaped live region in `index.html` beside
`#reorderLive`, and have `renderDayProgress` write text into it rather than rebuild it.

## F8 — `#storageNotice` re-announces on every tap. PROVED

`js/sync/status.js:493` — `notice.textContent = text;`, the last line of `updateSyncNotice`,
which `render()` calls on every change (`js/app.js:107`).

Measured: three ordinary edits produced **three** childList mutations inside the live
region, and writing the *identical* sentence back into it produced **one more** —
`textContent =` always replaces the text node, so even an unchanged sentence is a change.
And the sentence genuinely does change: after those three edits it read
`הנתונים נשמרים במכשיר הזה בלבד. (3 ממתינים לשליחה)`.

Forty lines up, `showStorageBanner` guards exactly this: `js/sync/status.js:377` —
`if (banner.dataset.text === text) return;   // already saying exactly this`. Measured
alongside: the banner took **zero** mutations across the same three edits. One writer in
the file has the guard; the other does not.

**What a person experiences.** A man marking thirty names with VoiceOver on hears the sync
sentence thirty times, in between the thirty things he asked for.

**Severity for these three: low now, and it is the other half of F7.** Together they are one
fault: the region that should speak is silent, and the region that should be quiet talks
over everything.

**The fix.** The same three-line guard the banner already has.

## F9 — At 320px two ordinary evenings push the day screen off the side. PROVED

Bisected at 320/360/375/390, by-site, ordinary text:

| what is recorded | 320 | 360 | 375 | 390 |
|---|---|---|---|---|
| one site per man, default rate | ok | ok | ok | ok |
| a long Hebrew worker name | ok | ok | ok | ok |
| **a man at two sites** (`2 אתרים`) | **337 / 320** | ok | ok | ok |
| **a day of extra hours** (the hours box appears) | **338 / 320** | ok | ok | ok |

Traced: `.rate-control` (`css/app.css:1088`) computes `min-width: auto` and will not shrink
below the select plus the hours box (128 -> 194px). `.assign-name` beside it has
`min-width: 0` and does shrink, to 34px. `.site-grid`'s `1fr` then takes the card's
min-content — the same `minmax(auto, 1fr)` trap as F1. The page does scroll to reach the
overflow (measured: `scrollBy(-500, 0)` moves it 46px and the 💬 comes fully into view), so
nothing is unreachable; it is just not where it looks.

A doubled day and extra hours are the two rate states this app exists to record. The
mobile suite's by-site fixture assigns one site per man and sets no rate other than the
default, so neither shape is ever drawn at 320 in the gate.

**Severity for these three: low unless one of them is on a 320px phone.** 320 is an iPhone
SE 1st generation, or any iPhone with Display Zoom turned on — which is a thing an older
man does. Worth asking before deciding how much this is worth.

**The fix.** `minmax(0, 1fr)` closes F1 and F9 together; letting `.assign-row` wrap when the
rate control cannot shrink closes it at any size.

## F10 — The rate select is the one control in the app with no name. PROVED

`js/ui/day.js:876-877`.

Walked the browser's accessibility tree across the day screen (both modes), the week, the
roster, the reports, the ⋯ panel and the reorder panel, looking for anything interactive
whose accessible name has no Hebrew letter and no Latin character:

    day view (by site):   4  — every one of them role=combobox, name ""
    day view (by worker): 0
    week view:            0
    roster view:          0
    reports view:         0
    settings panel:       0
    reorder panel:        0

The four are the rate `<select>` on each site row — one per recorded man. The extra-hours
input built ten lines below it (`js/ui/day.js:900`) *does* get
`aria-label: 'שעות נוספות'`; the select does not. So a reader announces `רגיל, תיבה
משולבת` with nothing saying whose day it prices or at which site — on a screen where four
of them are visible at once.

Every ＋, 💬, ☰, ⋯, ✕, ✏️, ⤒, ▲, ▼, ⤓, ₪, 🗄️, ↩️ in the app is named, most of them with the
worker's or site's name folded in. This is the single gap.

**Severity for these three: low — none of them is likely to be running a reader today.**
It is here because it is the only one, and because the rate is what a day is priced at.

**The fix.** An `aria-label` on the select naming the man and the site, in the shape the
buttons around it already use (`הסר את <X> מ<Y>`). That is a new Hebrew string: law 6
applies, it is a product decision, and any pin that later reads it moves with it in the
same commit. Nothing pins it today.

## F11 — "Writing is held" is carried by opacity, and the button it disables is still live to a keyboard. PROVED

`css/app.css:3181-3189`, `js/ui/sheet.js:559-579`.

With `body.writes-blocked` set, measured:

    #dayView .site-grid        opacity .55   pointer-events auto
    .site-head-btn             disabled false   aria-disabled null   still the element at its own centre
    #copyDayBtn                opacity .5    pointer-events none   disabled false   aria-disabled null
    #copyDayBtn activated programmatically (what Enter on a focused button does):  IT FIRED

`pointer-events: none` stops a finger and does not stop a keyboard, and it does not reach
the accessibility tree at all — the button announces as enabled. `renderCopyButton` sets a
real `disabled` in one case only (`js/ui/sheet.js:569`, no previous day with a record); the
hold never does.

The record is not at risk — `State.commit` refuses under the hold, which is law 3 doing its
job. What is wrong is the SAYING. The recording surfaces say "held" by fading, which is a
contrast reduction and not a second channel, and the one textual channel — the
`הרישום מושבת` badge — is built inside the live region of F7, which does not announce.

**Severity for these three: low.** They are sighted, the banner above is at full strength
and explains, and the arithmetic is safe either way.

**The fix.** `disabled = true` on the dock's copy button under the hold, alongside the
`pointer-events` rule; and move the badge out of the rebuilt region when F7 is fixed.

## F12 — The week cell's label is the one name in the app that is not bidi-isolated. PROVED

`js/ui/week.js:239-240` — `${worker.name} · ${hebrewDayName(...)} ${formatFullDate(...)}`.

With a worker named `Ali 2`, on one page load:

    the day screen's remove button   "הסר את <FSI>Ali 2<PDI> מ<FSI>הרצליה<PDI>"   isolates: yes
    all 28 week-cell labels          "Ali 2 · יום שישי 07/08/2026"                isolates: NO

`js/ui/dom.js:5-19` states the rule and says it holds *"all the way through offerUndo,
askConfirm and every aria-label"*. It does, in 13 labels on that page — and not in the 28
week cells. A non-Hebrew name and a date are two LTR runs inside an RTL paragraph, which is
the arrangement `dateRange` was written for.

**Severity for these three: low.** It is spoken text, not the record, and it only misreads
for a Latin-scripted name. It is here because it is a one-word gap in a rule this repo
otherwise keeps perfectly, and because v100 already did this sweep once ("every name in the
day message isolated") and this label was not in it.

**The fix.** `isolate(worker.name)`. Not a Hebrew string change; `tests/smoke.mjs:7864`
matches with `.includes('בודק')` and is unaffected, and `tests/mobile.test.mjs:1698-1702`
already strips isolate marks before matching label text.

## F13 — The keyboard focus ring is invisible on the site cards. PROVED

`css/app.css:395` — `button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }`

The 2px offset puts the ring on the site colour, not on the button's own dark scrim.
`--accent` against each of the ten:

    slot        1     2     3     4     5     6     7     8     9    10
    light    1.34  1.73  1.78  1.28  1.82  1.67  1.38  1.48  1.64  1.13
    dark     2.39  2.21  2.17  2.49  2.16  2.20  2.23  2.25  2.17  2.49

Never reaches 3:1; on slot 10 in light it is 1.13:1, which is no ring at all. Sampled live
on slot 1: outline `rgb(31, 75, 122)` on `rgb(29, 78, 216)` — **1.34:1**. Against the paper
elsewhere in the app the same ring is 7.90:1, so this is specific to the coloured heads.

**Severity for these three: low.** Touch has no focus ring. It costs the desktop
seder-writer, on the two buttons v101 put on the coloured head.

**The fix.** A ring that carries on any ground — a white outer stroke with a dark inner, or
`outline-offset: -2px` so it lands on the button's own dark scrim, where white would clear
7:1.

## F14 — Escape on the sign-in dialog leaves the password in the field. PROVED

`js/ui/modal.js:15-25`. `signInModal` is a `.modal`, so `topModal()` finds it and Escape
closes it — through the fallback at `modal.js:98` (`modal.style.display = 'none'`), because
it is the one `.modal` with no entry in `MODAL_CLOSERS`. Measured:

    typed a password, set an error, pressed Escape
      -> display none, password field still "hunter2", error still "סיסמה שגויה"
    the same, closed through closeSignInModal()
      -> password field ""

`closeSignInModal` (`modal.js:170-175`) exists and clears both; Escape does not reach it.

**Severity for these three: low.** It is a shared phone on a site, which is the argument for
fixing it, and it is one line.

**The fix.** `signInModal: () => closeSignInModal()` in `MODAL_CLOSERS`.

---

# Checked, and right

Short, so nobody re-checks it.

- **The tab pattern is complete.** All four `role="tab"` carry `aria-controls` and every
  target id exists; `aria-selected` is maintained on every render (`js/app.js:83`); the
  panels carry `aria-labelledby`; hidden panels are `display: none` and so are absent from
  the accessibility tree entirely. The tab's accessible name adapts correctly with the
  width — `צוות` at 390, `עובדים ואתרים` at 1024 — because the hidden span is excluded
  from the name. The browser reports `controls` only on the selected tab; that is the
  correct consequence of the other panels being removed, not a gap.
- **Accessible names.** Outside F10 there is not one unnamed or symbol-only control on any
  of the seven surfaces walked. The labels are better than named: they carry the worker
  and the site, bidi-isolated (`הסר את <FSI>מוחמד אבו-ראס<PDI> מ<FSI>מגדלי נאמן רמת גן<PDI>`).
- **The `.site-head-btn` glyphs clear the floor on all ten colours** — 7.18-10.50 light,
  6.82-7.76 dark, sampled 9.35 on slot 1 — because the button brings its own dark scrim.
  The reasoning in `css/app.css:1035-1050` is sound and the numbers hold.
- **The site name on its own colour** clears it too: 4.92-7.90 light, 4.67-5.39 dark, at
  17px/700.
- **Every banner clears the floor in both schemes.** warn 4.80 / 6.96, danger 6.17 / 6.36,
  info 7.15 / 6.64. `banner-danger` is the failure colour and carries the save that failed
  and the quarantine, correctly.
- **No colour-alone state that matters, except F5.** The site chips on the day screen carry
  the full name and the ◆; the drawer's coloured edge is doubled by a count (`יום שישי |
  21/08 | 0/4`); the by-worker list writes `נעדר` in words; the held state has a banner and
  a badge as well as the dimming.
- **Nothing focusable inside an `aria-hidden` container**, on any of the four views. The
  5px date picker behind the day title is `aria-hidden="true"`, `tabIndex -1` and a 0x0 box,
  exactly as `css/app.css:441-444` says.
- **No `prompt`/`confirm`/`alert` anywhere.** Law 11 holds.
- **RTL.** Logical properties throughout — 28 `inline-start`/`inline-end` rules and only
  three physical `left`/`right` in the whole stylesheet, each with a stated reason. The bidi
  machinery in `js/ui/dom.js` (isolate, dateRange, isolateLtr, minusAmount, plusAmount, and
  the chevrons and step arrows drawn as SVG because the characters are Bidi_Mirrored) is
  the most careful work in this repository. Two notes rather than findings: F12 is the one
  name that escaped it, and `#workerDaysMeta` (`js/ui/reports.js:723-724`) is the one date
  range fixed by CSS (`direction: ltr`, `css/app.css:2193`) rather than by `dateRange()` —
  it renders correctly (`21/08/2026 - 03/09/2026`, earlier date first, measured) but its
  correctness lives in the stylesheet, so it is the one that would not survive being copied,
  shared, or drawn on the printout canvas. Nothing does that to it today.
- **`--ink-2` and `--ink` clear the floor everywhere**, in both schemes, by a wide margin
  (5.77 and up). The palette is fine; `--ink-3` is the single bad token.

# What a checklist would flag and I am not flagging

- **No roving `tabindex` and no arrow-key movement on the tablist.** Measured: ArrowLeft on
  the first tab does nothing, and all four tabs are tab stops. That is a deviation from the
  ARIA tabs pattern and it costs these three men exactly nothing — they tap. Four tab stops
  is arguably better than one for the desktop case. Leave it.
- **`aria-live="polite"` rather than `assertive` on the danger banners.** The correct
  reading of "a change that was not written down" is that it should interrupt. But the
  banner is the loudest visible thing on the screen and these men are sighted; making the
  app interrupt would be a change made for a checklist. Revisit only if a reader is ever
  actually in use.
- **No `tabindex="0"` on the tabpanels.** They all contain focusable content, so nothing is
  stranded.
- **The `-webkit-line-clamp: 3` on the folded account banner** cuts the sentence at 200%
  text (measured: 218px of content in a 109px box at 390). It is a fold with the full prose
  one tap below (`css/app.css` `.banner-full`), which is the second channel. Not a finding.

# What I did not do

- I did not run `npm test` or `npm run test:release`. No count from either appears here.
- No screen reader was used. Every claim about what is *announced* is marked SUSPECTED;
  every claim about what is in the accessibility tree is PROVED, from the browser's own
  tree.
- No real iPhone, so no iOS Dynamic Type and no VoiceOver. `tests/mobile.test.mjs:598-603`
  already says why Chromium cannot model either, and `docs/iphone-acceptance.md` keeps them
  as physical checks. F1 and F4 are the two findings those physical rows would catch, and
  rows 33 and 50 are where they would show up.
- I proposed no Hebrew string. Two fixes (F5, F10) would introduce one; both are marked,
  and law 6 applies — a new string is a product decision and any pin that reads it moves in
  the same commit.

# If only three things are fixed

**F2** (raise `--ink-3` in the light scheme), **F1** (`minmax(0, 1fr)`, which takes F9 with
it), and the second half of **F3** (`display: none` on the closed drawer). Between them they
are perhaps a dozen lines, they are the three that touch a man reading the date in the sun,
an older man with the text turned up, and the only dialog in the app without a contract.
