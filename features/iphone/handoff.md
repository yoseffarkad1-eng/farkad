# Handoff — v97: the first iPhone round (what one phone on v96 showed), and the export path told the truth

- Branch: `cd-work` → published as `claude/farkad-mobile-design-review-odl8ue`
- SHA: `f718367585c0039970e644b2a920711aa5ae86c6`
- Base: `71ed815` (v96 as served, `366e5ad`, plus its release-note commit)
- Build stamps at the SHA above: `farkad-build` v97 · `APP_VERSION` v97 · `VERSION` farkad-v97
- Gates: `LEDGER_WRITES` false, `carryAdvances` false. Neither moved.

## Where this round came from
The person updated ONE iPhone (the app on the home screen, no Safari chrome) from v86 to
v96 and sent two screenshots and four sentences: the reports and the files come out
"reversed, English order, left to right"; the print button does nothing; the day screen
shows Saturday; two taps zoom the page. The chip in both screenshots reads
«38 ממתינים לשליחה» on a phone with 5G. No physical iPhone is available here; every fix
below is argued from the platform and measured in Chromium, and says so.

## What was found about "reversed"
Six lenses (the screens rendered, the files read back, print to PDF, the diff since v86
read as a bidi engineer, an iOS-only lens, history), every surface compared against a
v86 worktree with the same seed, then every actionable finding refuted or confirmed by two
independent agents. Nothing on any surface reads left to right in Chromium and every
surface is pixel-identical to v86: the reports screen, the week and day screens, the
printed PDF (עובד rightmost, לתשלום leftmost, the minus before its digits), the .xlsx
(every sheet `rightToLeft="1"`, עובד in A1, no bidi controls in any string, byte-for-byte
the same direction handling as v86), the CSV fallback, the WhatsApp day message and the
worker's statement (every line first-strong Hebrew). What IS true on an iPhone, and was
true on v86 too:
- The export dialog promised «הקובץ נפתח מימין לשמאל»; the iPhone's own viewers (Files
  preview, WhatsApp's preview, Numbers) ignore the sheet's flag and show עובד on the left.
- The same dialog re-exported on a backdrop tap (three taps, four files).
- The file names start with a Hebrew word, so an RTL list lays their dates out swapped.
- Every date range paints the later date on the left; the worker modal opened at its end
  with «+ מקדמה» focused; a by-site print began with a blank page.
The table with verdicts: `features/iphone/findings.md`.

## What was fixed, and by which pair
| # | sev | pair | pinned by |
|---|---|---|---|
| print | P1 | `5229eab` → `2521a51` | tests/smoke.mjs «printing where window.print() does not open» (25 checks) |
| saturday | P2 | `36e9b21` → `c14c226` | tests/smoke.mjs «the arrows and the rest day» (9 checks) |
| zoom | P2 | `33107e3` → `d05dc07`, then `3b1ad68` (the root) | tests/mobile.test.mjs «two taps do not zoom the page» at every width |
| chip | P2 | `500bec7` → `311da0b` | tests/smoke.mjs beside the R6 chip reads: «שגיאת סנכרון» chip-danger, «השליחה תקועה» chip-warn |
| E2 | P2 | `55cce69` → `ec8a676` | tests/xlsx.test.mjs «closing the hand-over dialog is not a request for another file»; tests/smoke.mjs «closing the hand-over is not a second press» |
| E3 | P3 | `c2473ed` → `2bcdd19` | tests/xlsx.test.mjs «the file is named so a list reads it in order, whichever way the list runs»; tests/exports.test.mjs; tests/smoke.mjs |
| E1 | P2 | `09c990f` → `810609d` | tests/xlsx.test.mjs «what the dialog says about the file is true in every viewer that opens it»; the verbatim pin in tests/smoke.mjs |
| D1 | P3 | `85269d9` → `073b08a`, then `5c437a5` (the settings panel) | tests/smoke.mjs «a range reads from left to right» (9 checks, rectangles and the canvas); tests/print.test.mjs «a range on the paper reads from left to right» |
| M1 | P3 | `46cf14a` → `efeb5e1` | tests/smoke.mjs «the worker modal opens at its top» |
| P1 | P3 | `913f00b` → `6233ad5` | tests/print.test.mjs «no blank first page» |

**E1–E3, the export path.** The hand-over dialog is an askChoice — «הבנתי» / «שמירה
חוזרת» — and re-exports ONLY on the named press; a backdrop tap or Escape resolves null
and writes nothing (before: three backdrop taps, four files). The files are named
Latin-first — `farkad-reports_<from>_<to>.xlsx`, `farkad-invoice_…` for the client copy,
`farkad-payroll_/farkad-invoice_/farkad-detail_<from>_<to>.csv` — so a list in either
direction reads their dates in order; the Hebrew sheet names inside the workbook are
unchanged and still pinned. The dialog says where right-to-left is true: «ב-Excel הטבלה
נפתחת מימין לשמאל; תצוגה מקדימה ("קבצים", וואטסאפ, Numbers) עשויה להציג אותה משמאל
לימין, עם אותם מספרים. טבלה שנקראת נכון בכל מקום יוצאת מהכפתור «🖼️ שיתוף כתמונה».»
The sheet's `rightToLeft` flag stays. «עשויה» is deliberate: the iOS viewers' behaviour
is derived from what those renderers do, not measured on a phone.

**D1, ranges.** `dateRange(from, to)` in js/ui/dom.js wraps the pair in ONE left-to-right
isolate (U+2066…U+2069); the week header, the reports range line, the report period, the
settings panel's carry rows use it; `#workerDaysMeta` is turned by a stylesheet rule
(`direction: ltr`); printout.js keeps the range's isolate and strips only the name
isolates, so the picture draws from→to and is still named from→to. The WhatsApp
statement's «X עד Y» was left in Hebrew order on purpose: its connective is a Hebrew word,
and that line reads as a sentence.

**M1, P1.** A dialog whose `.modal-content > h3` carries `tabindex="-1"` is entered at
that heading (focus with preventScroll; Shift+Tab from the heading goes to the last
control); openWorkerDays resets `scrollTop` to 0. The print block gains
`.report-payroll.report-offscreen + .report-invoice { page-break-before: auto !important }`
— the hidden pay sheet was still the preceding sibling. Only the on-screen section
reaches the paper, deliberately (the client's report leaves the crew out of it); the
comment in renderReports that said otherwise is fixed, the behaviour is not.

**print.** `window.print()` in an iOS home-screen web app has for years either not opened
the sheet or opened an empty one (Apple's forums since iOS 9); "use Safari" is not an
answer because the home-screen app's storage is a separate partition from Safari's and
this phone holds 38 unsent records. New classic script `js/ui/printout.js` (index.html
after share.js; sw.js SHELL): `printWithFallback(kind)` attaches `beforeprint` and
`matchMedia('print')` listeners BEFORE calling `window.print()`, and if neither fired
within 1.5 s offers «ההדפסה לא נפתחה במסך הזה. לשתף את הטבלה כתמונה?» with «שיתוף
כתמונה» / «ביטול». `sharePrintout(kind)` draws the CURRENT table off the DOM onto a
canvas (RTL, the site chips in their computed colours, the Saturday column shaded, the
legend, the totals; for a report the active section with its heading, period, header
band and rules), synchronously — toDataURL, the blob decoded by hand — so
`navigator.share({files})` runs inside the tap's gesture (Safari spends it on an await);
no share → an anchor download; neither → askTell. A cancelled sheet is a cancel, not a
download (the WhatsApp button's rule). Product decision, argued in `2521a51`: an
always-visible «🖼️ שיתוף כתמונה» beside each print button — on a building site a
picture on WhatsApp is what a table becomes anyway, and it is the one surface every
iPhone viewer lays out right to left. CLAUDE.md gains law 12: `window.print()` is never
called bare.

**saturday.** The arrows walked the calendar one day at a time while the drawer, the
blank-days count and the week grid all treat Saturday as the rest day. `stepDay` now
steps over a Saturday that has no record at all (checked over every worker, archived
included, every layer on the day record) and lands on one that has any record —
somebody's Saturday pay is never hidden. The date picker, the drawer, «היום» and the
midnight follow are untouched: a Saturday set directly still shows.

**zoom.** `touch-action: manipulation` on `body` and on `html` (the band below a short
screen hit-tests to the root, which is outside body). Panning and pinch stay; the
viewport meta is untouched and the smoke suite still refuses `user-scalable=no`. The
mobile suite reads the fact the way the browser applies it — the chain from a tab, a
dock button and the root — because touch-action is not inherited.

**chip.** `renderSyncChip` read the queue-count suffix before the sentence, so the error
line («שגיאת סנכרון - הנתונים שמורים במכשיר הזה.») and the claim-stuck line both rendered
as «38 ממתינים לשליחה» — the person could not see that the cloud was REFUSING the
queue. The sentence now comes first for both, as R6 did for the contested and suspended
lines: the error is chip-danger (nothing moves until somebody acts), the stuck claim
chip-warn.

## Expectations moved deliberately
- tests/mobile.test.mjs: the week header and the reports actions row gain a button each;
  every existing rectangle pin still holds (675/675 on the print branch, before the zoom
  checks were added).
- tests/xlsx.test.mjs, tests/exports.test.mjs (all twenty template names), tests/vehicles.test.mjs,
  tests/money.ingress.test.mjs, tests/smoke.mjs: every pinned export file name moved to the
  Latin-first form in `2bcdd19`, with the reason in the message.
- tests/xlsx.test.mjs and tests/smoke.mjs: the export dialog's sentence and its two choices,
  moved in `810609d` and `ec8a676`.
- tests/print.test.mjs: the by-site PDF's page count (one fewer) in `6233ad5`.

## Migrations
None. One new cached file (`js/ui/printout.js`), so the three stamps moved. Rollback:
revert the merge commits.

## Test output (verbatim, release gate on the final SHA)
```
=== npm run test:release on f718367585c0039970e644b2a920711aa5ae86c6 at 14:06:13 v22.22.2 (second run; the first had money.concurrency 43/50)
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
node tests/exports.test.mjs: 69/69 checks passed
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
node tests/closure.test.mjs: 95/95 checks passed
node tests/correction.test.mjs: 33/33 checks passed
node tests/quarantine.test.mjs: 82/82 checks passed
node tests/approval.test.mjs: 72/72 checks passed
node tests/repayment.test.mjs: 240/240 checks passed
node tests/ledger.ingress.test.mjs: 151/151 checks passed
node tests/cas.test.mjs: 88/88 checks passed
node tests/status.test.mjs: 29/29 checks passed
node tests/money.test.mjs: 40/40 checks passed
node tests/money.ingress.test.mjs: 206/206 checks passed
node tests/method.test.mjs: 51/51 checks passed
node tests/restore.test.mjs: 51/51 checks passed
node tests/upgrade.test.mjs: 48/48 checks passed
node tests/vehicles.test.mjs: 61/61 checks passed
node tests/xlsx.test.mjs: 73/73 checks passed
node tests/nonassertions.test.mjs: 23/23 checks passed
node tests/labels.test.mjs: 23/23 checks passed
node tests/labelcache.test.mjs: 32/32 checks passed
node tests/smoke.mjs: 1121/1121 checks passed
node tests/print.test.mjs: 76/76 checks passed
node tests/mobile.test.mjs: 709/709 checks passed
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
58 suites · 6570/6570 checks
```

## Contract items NOT completed
Nothing of this round is open. Not claimed: physical-device coverage; the money gates stay shut.

## Known gaps, measured and named
- **The release gate's FIRST run on this commit was red in one suite**: `tests/money.concurrency.test.mjs`
  43/50, the seven failures all in «an interleaved storm leaves two phones and the cloud on
  one record» — phone A ended in status 'error' with writes blocked (`Recovery.blocked()`
  true, `ledger.unreadable` empty on both), the two records differed field for field, and
  after a reopen A was still held with the boot mirror's origin write missing. The suite
  then passed 50/50 in nine isolated runs (six on this commit, three on the v96 tip
  `71ed815`), and the gate was run a second time on this commit — the verbatim output below
  is that second run; the first is `.gate-release.log`'s predecessor and is quoted here so
  the count is not the only thing anybody reads. Nothing in this round touched js/sync,
  js/state.js, js/recovery.js or js/model. A hunt for the interleaving (reproduce under load on a separate emulator port, read the sync/recovery path for the race, refute) was started and could not complete in the session that shipped this; it is the first follow-up, and until it lands the storm's one red run is a fact about a path no shipped phone can take (both money gates are shut) and not a fact anybody has explained.
- No iPhone has run this: the print heuristic (does Safari fire `beforeprint` or the
  print media change when the sheet opens?), the share sheet inside the askChoice
  resolution, and the touch-action rule are argued from the platform. If Safari opens the
  sheet AND fires neither event, the person gets one harmless offer after 1.5 s behind it.
- The 38 queued records on the person's phone are a rollout question, not a code one:
  either the rules are not yet published (`firebase deploy --only firestore:rules`) or
  the chip was hiding an error line. The chip now says which; the deploy is the person's.
- Everything the v96 handoff lists, unchanged.
