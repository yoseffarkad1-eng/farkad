# Findings — the bottom bars drawn in the wrong place, from a real iPhone

**The first physical-device evidence this repository has had.** One screenshot, sent by the
owner on 3 September 2026 at 06:11 local. Nothing here was run on a phone by anybody but him;
everything below is measured off that image and off the code.

## What the image is

1320 × 2868 px, ratio 1:2.173 — an **iPhone 16 Pro Max**, and a normal single-screen capture
rather than an iOS "Full Page" one (the ratio matches the device exactly). At 3× that is a
**440 × 956 pt viewport**.

## What it shows

- The day screen, by-worker, scrolled: five rows (`טרם נרשם`), then the day-actions bar
  («💬 שליחה לוואטסאפ» and «↧ מיום חמישי 20/08»), then the tab bar.
- **Below the tab bar**: another worker row, and the storage notice.
- The notice reads **«שגיאת סנכרון - הנתונים שמורים במכשיר הזה. (59 ממתינים לשליחה)»**.

Both bars are sitting roughly **387 pt above the bottom of the screen**, with page content
rendering underneath them.

## What the code says, in both builds

| | v86 (`880d7bb`) | v103 (`21c8e08`) |
|---|---|---|
| `.tabs` | `position: fixed; bottom: 0` | identical |
| `.day-actions` | `position: fixed; bottom: var(--nav-h, 0px)` | identical |
| a containing block for fixed descendants above them | none | none |

Checked for `transform`, `filter`, `backdrop-filter`, `perspective`, `will-change` and
`contain` on every possible ancestor in both builds. There is none. **The stylesheet cannot
produce this geometry in either build.** 387 pt is keyboard-height on that device, and on iOS
a `position: fixed` element is anchored to the VISUAL viewport — so this is the shape of "the
visual viewport is shrunk as if a keyboard were up, while no keyboard is on screen."

## The inference that matters, and its premise

`body.kbd-open` sets `display: none` on **both** bars (`css/app.css`). So:

- **If `kbd-open` were standing** — the pre-v99 fault, where a viewport measurement alone
  turned the class on and left it on — both bars would be **absent** from the screen. That is
  what v99 was written about, and it is NOT what this image shows.
- **The bars are drawn.** So `kbd-open` is OFF while iOS's visual viewport is shrunk.

That is exactly the state v99's rule produces: *a keyboard needs a focused editable; nothing
focused, no keyboard, whatever the viewport says.* v99 correctly stopped the app hiding the
bars. **It could not stop iOS anchoring `position: fixed` to the shrunk visual viewport** —
that is the browser, not the app. So the bars come back, in the wrong place, with the page
showing beneath them.

**Two consequences, and both need saying out loud:**

1. **This is a NEW finding, not the v98 fault.** It is the residue the v99 fix left behind:
   the same underlying iOS state, a different and arguably more confusing symptom — a bar in
   the wrong place reads as a broken layout, where a missing bar reads as a missing bar.
2. **The evidence favours the phone being on v99 or later**, which would mean at least one
   phone HAS updated past v86 — contradicting a standing assumption in this repository's own
   notes. **It is an inference, not a reading.** One line settles it: ⋯ → גרסה. Asked for;
   not yet answered. Nothing in `docs/releases.md` has been changed on the strength of it.

Two things were tried as build discriminators and **both failed**, recorded so nobody repeats
them: the sync sentence «שגיאת סנכרון - הנתונים שמורים במכשיר הזה.» and the copy button's
«↧ מיום <day> <date>» are byte-identical in v86 and v103.

## Why no suite here could have caught it

The nine browser suites drive headless Chromium. Chromium lays `position: fixed` out against
the layout viewport and does not emulate iOS's visual-viewport anchoring, so the geometry in
that screenshot **cannot occur** in any suite in this repository, at any width, in any
orientation. `applyKeyboardInset(px)` — the seam the mobile suite uses — sets `--kb-h` and
toggles `kbd-open`, which HIDES the bars; it has no way to raise them.

This is not a gap to be closed by another check. It is the reason
`docs/iphone-acceptance.md` exists, and it is the first time that file has been vindicated by
an actual device.

## The other half of the image, which matters more than the layout

**59 records were waiting to send, with a sync error.** They exist on that phone and nowhere
else — not on the other two, not in the cloud. The app said so accurately, which is the
honest-status work doing its job; the danger is operational, not informational. The owner was
told, in order: export a backup off the phone; do not delete or reinstall the app; send the
version and device-state lines.

The most likely cause of the error is the `firestore.rules` deploy that has been outstanding
since v86 — a phone writing the new protocol against old rules is refused exactly this way,
and `docs/rollout-checklist.md` names the sentence it produces.

## Not done here
- **No fix.** A contract comes first for this, and the contract cannot be written until the
  build is known: whether this is v99's residue or something else changes what the fix is.
- **No document was corrected on the strength of the inference.** When the version arrives,
  `docs/releases.md`, `docs/iphone-acceptance.md` and this file get the fact rather than the
  reasoning.
