# The first iPhone round — what one phone on v96 showed, and what the lenses found

The person updated one iPhone (the app on the home screen) from v86 to v96 and wrote four
things: the reports and the files come out "reversed - English order, left to right";
the print button does nothing; the day screen shows Saturday; two taps zoom the page.
Their two screenshots also show the chip reading «38 ממתינים לשליחה» on a phone with 5G.
No iPhone is available here. Everything below was measured in Chromium against a v86
worktree with the same seed, and every finding that proposed a change was put to two
independent verifiers who tried to refute it.

## "Reversed": six lenses, thirteen verifications

Nothing on any surface reads left to right in Chromium, and every surface is identical
to v86: the reports screen (every element `direction: rtl`, no `dir` attributes, the
first header cell rightmost), the day and week screens, the printed PDF (עובד rightmost
at 514.7pt, לתשלום leftmost at 63.1pt, the minus before its digits, byte-identical
read-back on both trees), the .xlsx (every sheet `rightToLeft="1"`, עובד in A1, no bidi
controls in any string, the shipped library sha256-identical to the 0.18.5 v86 fetched
from the CDN), the CSV fallback, all thirteen WhatsApp day-message variants and the
worker's statement (every line first-strong Hebrew). What IS true on an iPhone, and was
true on v86 too:

| # | sev | surface | finding | verdicts |
|---|---|---|---|---|
| E1 | P2 | the export dialog | v96 says «הקובץ נפתח מימין לשמאל» after every export. True in Excel; false in the viewers an iPhone opens first — the Files/Quick Look preview, WhatsApp's document preview and Numbers ignore the sheet's `rightToLeft` flag and lay column A (עובד) out on the left. v86 exported silently and promised nothing. | confirmed ×2 (since v86) |
| E2 | P2 | the export dialog | Its cancel is «שמירה חוזרת» and the code re-exports whenever askConfirm resolves false — which a backdrop tap does too. Measured: three backdrop taps, four files. | confirmed ×2 (since v86) |
| E3 | P3 | the file names | דוחות_2026-08-07_2026-08-20.xlsx and שכר_/חיוב_/פירוט_… start with a Hebrew word; in an RTL list (Files, WhatsApp) the bidi algorithm lays the dates out swapped and the extension on the far left. The backup already names itself ASCII-first. | confirmed ×2 (pre-existing) |
| D1 | P3 | every date range | '07/08/2026 - 20/08/2026' in an RTL paragraph paints the later date on the LEFT — the range line, the report period, the worker modal's meta line, the week header (whose per-date isolates do not keep from before to), the PDF. | confirmed ×2 (pre-existing) |
| M1 | P3 | the worker modal | Opens with «+ מקדמה» focused and the body scrolled to its end on a 390 phone; the title and the day chips are off screen. v86 opened at the top. | confirmed ×2 |
| P1 | P3 | print, «לפי אתר» | A blank first page: `.report-invoice { page-break-before: always }` fires behind a display:none payroll. | confirmed ×2 (pre-existing) |
| W1 | P3 | the week strip | At 390 the strip is 419px in a 390px box and Thursday hangs off the left edge at rest; v86 fitted the week at narrower columns. Deliberate (the 48px pitch, `tests/mobile.test.mjs`), the order unchanged. | confirmed ×2, left as designed |
| X1 | P2/P3 | the .xlsx on iPhone viewers | There is no write-time way to satisfy a viewer that ignores `rightToLeft` and one that honours it. The answer is not in the file: it is the picture («🖼️ שיתוף כתמונה», this round), which every viewer lays out as drawn. | confirmed (viewer behaviour, not a regression) |

Refuted, deliberately: "only the on-screen section reaches the paper" is correct, not a
defect — the client's invoice must not carry the crew's pay (v86's own subject line: a
client's report leaves the crew out of it); the comment in `renderReports` that said
otherwise is what was wrong. And a mixed build (index.html from one build, scripts from
another) reproduces exactly and explains nothing the person said — the crash banner names
it, and no screenshot shows the banner.

## The screenshots' own four

| # | sev | finding | fix |
|---|---|---|---|
| print | P1 | `window.print()` in an iOS home-screen web app has for years either not opened the sheet or opened an empty one; "use Safari" is not an answer because the home-screen app's storage is a separate partition and this phone holds 38 unsent records | `js/ui/printout.js`: print where the sheet opens, the table as a picture where it does not, and an always-on «🖼️ שיתוף כתמונה» |
| saturday | P2 | the arrows land on Saturday while the drawer, the blank-days count and the week grid all treat it as the rest day | the arrows step over an empty Saturday and land on one with a record |
| zoom | P2 | iOS double-tap-to-zoom on every element without `touch-action` | `touch-action: manipulation` on body and on html; pinch and the viewport meta untouched |
| chip | P2 | the chip read the queue count before the sentence, so «שגיאת סנכרון …» rendered as «38 ממתינים לשליחה» — the person could not see the cloud refusing the queue | the sentence first: «שגיאת סנכרון» chip-danger, «השליחה תקועה» chip-warn |

Full text of every finding, every probe and every verdict: the two workflow runs
(`rtl-regression-hunt`, `iphone-round-v97`) in the session that produced this file;
evidence under its scratchpad `rtl/`.
