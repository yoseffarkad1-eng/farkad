# Handoff — v99: the bottom bars come back, and the ⋯ panel says why the cloud refused

- Branch: `cd-work` → published as `claude/farkad-mobile-design-review-odl8ue`
- SHA: `55bfa00aeddea456d10e122cc50e878ccc53c811`
- Base: `4a4d277` (v98 as served, `5dd5a83`, plus docs)
- Build stamps at the SHA above: `farkad-build` v99 · `APP_VERSION` v99 · `VERSION` farkad-v99
- Gates: `LEDGER_WRITES` false, `carryAdvances` false. Neither moved.

## Where this round came from
One screenshot from the person's iPhone on v98, dark scheme: the day screen with NEITHER
bottom bar — not the tab bar, not the day dock — and the chip reading «שגיאת סנכרון». They
said the bar disappears and nothing brings it back except closing the app entirely.

## What was fixed, and by which pair
| # | sev | pair | pinned by |
|---|---|---|---|
| bars | P1 | `ea555a4` → `8b37d52` | tests/mobile.test.mjs «390px: a keyboard needs a focused editable» (12 checks; 8 fail on the base) |
| reason | P2 | `1c368f5` → `427cb78`, then `bc54f83` (two folds with pins) | tests/smoke.mjs beside the ⋯ panel's sync-line mirror (six reads); tests/status.test.mjs «the dead listener's refusal survives the next write» (+2 pins) |

**bars.** `js/ui/bars.js` turned a viewport measurement alone — `innerHeight −
visualViewport.height > 150` — into `body.kbd-open`, and the stylesheet hides both bars
under it. On the home-screen app iOS can leave the two viewports disagreeing with no resize
event: the share sheet and the print sheet (both new in v97), a keyboard dismissed while
the page is scrolled, backgrounding and returning, rotation. Nothing then cleared the class.
Now `keyboardHeight()` returns 0 unless `document.activeElement` is something a keyboard
opens for (a text-like input, a textarea, contenteditable — not a select, not a button),
before the zoom guard and the floor; `watchBottomBars` re-measures on focusin, on focusout
a frame later (iOS moves the viewport after the field lets go), on visibilitychange and
pageshow, and — only while the class stands — on the first touchstart or scroll. The
`applyKeyboardInset(px)` seam the mobile suite drives is untouched, and so are the
stylesheet's hide rule and the sheet's `--kb-h` padding. The verifier's own probe: the
share sheet with `navigator.share` never resolving, seven non-keyboard focus targets, a
stale class recovered through four events, the assign sheet's foot still above the keyboard.

**reason.** `#settingsSyncReason`, under the sync line in ⋯, shown only while the status is
'error' or the claim is stuck, from `FarkadSync.lastError` — and a dead listener's refusal
is now kept (`_listenerError`) until a listener delivers again, because `setStatus` nulled
`lastError` on the phone's next write and the one thing the person could act on was gone.
The sentences, pinned: «הענן מסרב לקבל רישומים מהמכשיר הזה. אם האפליקציה עודכנה זה עתה,
כללי הענן עדיין לא פורסמו.» (permission-denied); «הענן אינו מזהה את המכשיר הזה - התחבר
שוב.» (unauthenticated); «אין כרגע גישה לענן - הניסיון יחזור מעצמו.» (unavailable,
deadline-exceeded, a network failure); else «הודעת השגיאה: ⁦<message>⁩»; the code follows
in a left-to-right isolate. Blank when the phone is offline or the disk failed (the foot
already says so), blank on 'synced'. The chip is unchanged. Folded after verification: an
error with no message reads «הסיבה לא נרשמה.», not "[object Object]"; a stuck claim adds
no line of its own (the line above it already says so in Hebrew) unless the cloud gave a code.

## Expectations moved deliberately
- None. tests/mobile.test.mjs gains one suite (709 → 721); tests/smoke.mjs six checks;
  tests/status.test.mjs four (29 → 33). `isolateLtr()` was added to js/ui/dom.js rather than
  reusing `ltr()`, which js/ui/roster.js already owns as a node-returning global.

## Migrations
None. Cached files changed (bars.js, dom.js, sync.js, settings.js, app.js, index.html), so
the three stamps moved. Rollback: revert the two merge commits and the fold.

## Test output (verbatim, release gate on the final SHA)
```
=== npm run test:release on 55bfa00aeddea456d10e122cc50e878ccc53c811 at 18:35:40 v22.22.2
node tests/isolation.test.mjs: 18/18 checks passed
node tests/blobs.test.mjs: 11/11 checks passed
node tests/build.test.mjs: 29/29 checks passed
node tests/poison.test.mjs: 37/37 checks passed
node tests/merge.test.mjs: 28/28 checks passed
node tests/contested.test.mjs: 73/73 checks passed
node tests/receipt.test.mjs: 28/28 checks passed
node tests/data.test.mjs: 1944/1944 checks passed
node tests/recovery.test.mjs: 75/75 checks passed
node tests/adversarial.test.mjs: 116/116 checks passed
node tests/probes.test.mjs: 35/35 checks passed
node tests/capacity.test.mjs: 44/44 checks passed
node tests/concurrency.test.mjs: 46/46 checks passed
node tests/exports.test.mjs: 70/70 checks passed
node tests/fence.test.mjs: 35/35 checks passed
node tests/fence.ingress.test.mjs: 43/43 checks passed
node tests/fence.legacy.test.mjs: 21/21 checks passed
node tests/money.history.test.mjs: 9/9 checks passed
node tests/money.units.test.mjs: 21/21 checks passed
node tests/money.cloud.test.mjs: 17/17 checks passed
node tests/money.display.test.mjs: 4/4 checks passed
node tests/snapshot.poison.test.mjs: 82/82 checks passed
node tests/samefact.test.mjs: 24/24 checks passed
node tests/wording.test.mjs: 36/36 checks passed
node tests/closure.test.mjs: 103/103 checks passed
node tests/closure.echo.test.mjs: 79/79 checks passed
node tests/correction.test.mjs: 33/33 checks passed
node tests/quarantine.test.mjs: 82/82 checks passed
node tests/approval.test.mjs: 72/72 checks passed
node tests/repayment.test.mjs: 240/240 checks passed
node tests/ledger.ingress.test.mjs: 151/151 checks passed
node tests/cas.test.mjs: 88/88 checks passed
node tests/status.test.mjs: 33/33 checks passed
node tests/money.test.mjs: 40/40 checks passed
node tests/money.ingress.test.mjs: 206/206 checks passed
node tests/method.test.mjs: 51/51 checks passed
node tests/restore.test.mjs: 51/51 checks passed
node tests/upgrade.test.mjs: 48/48 checks passed
node tests/vehicles.test.mjs: 61/61 checks passed
node tests/xlsx.test.mjs: 74/74 checks passed
node tests/nonassertions.test.mjs: 23/23 checks passed
node tests/labels.test.mjs: 23/23 checks passed
node tests/labelcache.test.mjs: 32/32 checks passed
node tests/smoke.mjs: 1130/1130 checks passed
node tests/print.test.mjs: 78/78 checks passed
node tests/mobile.test.mjs: 721/721 checks passed
node tests/update.test.mjs: 30/30 checks passed
node tests/forms.browser.mjs: 10/10 checks passed
node tests/recovery.browser.mjs: 25/25 checks passed
node tests/handover.test.mjs: 26/26 checks passed
node tests/swrestart.test.mjs: 31/31 checks passed
node tests/swidentity.test.mjs: 55/55 checks passed
node tests/sendclaim.test.mjs: 43/43 checks passed
firebase emulators:exec --only firestore "node tests/rules.test.mjs": 59/59 checks passed
firebase emulators:exec --only firestore "node tests/cas.emulator.test.mjs": 24/24 checks passed
firebase emulators:exec --only firestore "node tests/rollout.test.mjs": 17/17 checks passed
firebase emulators:exec --only firestore "node tests/bootstrap.emulator.test.mjs": 23/23 checks passed
firebase emulators:exec --only firestore "node tests/bootstrap.rules.test.mjs": 28/28 checks passed
firebase emulators:exec --only firestore "node tests/money.concurrency.test.mjs": 50/50 checks passed
EXIT=0
59 suites · 6686/6686 checks
```

## Contract items NOT completed
Nothing of this round is open. Not claimed: physical-device coverage; the money gates stay shut.

## Known gaps, measured and named
- No iPhone has run this. The bars fix is measured in Chromium with a stubbed
  visualViewport and a stubbed innerHeight; the share-sheet and stale-viewport paths on a
  real home-screen iPhone are the acceptance the person's phone gives.
- The reason line's sentence for a refusal is true for the person's case (a phone that just
  updated, rules not yet published) and for an account that lost its role; it cannot tell
  the two apart — the code is shown for that.
- Everything v98 lists; the open items are `features/next/opus-closeout.md`.
