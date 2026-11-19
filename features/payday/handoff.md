# «יום תשלום» (payday) - handoff

- **Branch:** `feat-payday`, worktree `/home/user/farkad/.claude/worktrees/feat-payday`.
- **Base:** `6ab193d68c960e4a56d947673c282b867acd258f` (origin/main when the track was cut).
- **Final code commit:** `73ca0e0cf2216def2b93f12e4b9c4e25f37e6515`. The whole `npm test` chain ran
  on it, suite by suite, from a clean tree (`git status --porcelain` empty, printed at the head of
  the run). The browser suites ran on `b030d536579929dc7997a09ae54b3885e69eef53`, which serves the
  same bytes (`73ca0e0` changes `tests/usual.test.mjs` only), and smoke again on `73ca0e0`.
- **Final commit:** the one that adds this file and nothing else - no file the app serves or a
  suite reads - so the results below are the final commit's.
- **Contract:** `features/payday/contract.md`, REVISION 2 (2026-11-19). The track was built on
  revision 1, then reconciled with revision 2 in `682a253` and `b030d53` (below).
- **Not pushed, no PR.** The three build stamps, `js/ui/whatsnew.js`, `docs/releases.md` and
  `CLAUDE.md` are untouched (the integrator's).

## Commits (oldest first)

| commit | what |
|---|---|
| `bf315ca` | features/payday/contract.md: the contract (revision 1) |
| `17452d1` | the feature: js/ui/payday.js, its row on «מקדמות», the frame, the hooks, the look |
| `64c52bb` | tests/payday.test.mjs (Node, `test:payday` in `npm test`) |
| `45ad689` | tests/payday.browser.mjs (`test:payday-browser` in `test:all`), tests/screens.mjs, tests/reports.speed.test.mjs, tests/README.md, package.json |
| `682a253` | revision 2: the contract copy, js/ui/payday.js and the Node suite reconciled |
| `b030d53` | revision 2 on the glass: the board's move measured, the doors' task, `midEdit()` |
| `73ca0e0` | tests/usual.test.mjs: the design layer's block order names «יום תשלום»'s block last (the one existing pin moved; why below) |
| (this one) | features/payday/handoff.md |

## Files changed against the base (`git diff --stat 6ab193d 73ca0e0`)

```
 css/design.css               |   59 +++
 css/large.css                |   34 ++
 features/payday/contract.md  |  374 ++++++++++++++
 index.html                   |   22 +
 js/app.js                    |    3 +
 js/ui/modal.js               |    2 +
 js/ui/owes.js                |    7 +-
 js/ui/payday.js              |  793 +++++++++++++++++++++++++++++
 package.json                 |    6 +-
 sw.js                        |    1 +
 tests/README.md              |    4 +-
 tests/payday.browser.mjs     |  754 +++++++++++++++++++++++++++
 tests/payday.test.mjs        | 1160 ++++++++++++++++++++++++++++++++++++++++++
 tests/reports.speed.test.mjs |   44 +-
 tests/screens.mjs            |   24 +
 tests/usual.test.mjs         |    7 +-
 16 files changed, 3285 insertions(+), 9 deletions(-)
```

One line each:
- `js/ui/payday.js` (new) - the desk: the reading (`paydayFacts`), its memory, the dialog, the doors, every word.
- `js/ui/owes.js` - `renderOwesInto` only: the weekly button's line becomes the row `div.owes-actions` («יום תשלום», then «סגירת שבוע» when it is drawn); a build without payday.js draws what it drew.
- `js/ui/modal.js` - one `MODAL_CLOSERS` row: `paydayModal: () => closePayday()`.
- `js/app.js` - one line in `render()`: `if (typeof renderPaydayIfOpen === 'function') renderPaydayIfOpen();`.
- `index.html` - the frame `#paydayModal` (title `#paydayTitle` tabindex -1, body `#paydayBody`, «סגור» `#paydayClose`) after `#advanceResetModal`, and `<script src="js/ui/payday.js">` straight after advancereset.js. The `farkad-build` meta is untouched.
- `sw.js` - `'./js/ui/payday.js'` in `SHELL` after advancereset.js. `VERSION` untouched.
- `css/design.css` - ONE commented block inside `@media screen`, straight after the `.weekly-close-entry` rule: the half-width row, then the dialog. No colour of its own (the money ink, the warn/danger hints and the group marks are the sheet's tokens).
- `css/large.css` - block 3: every size, weight and line-height of that block restated one for one with the original's importance, straight after the `.weekly-close-entry` restatement; block 4: at 320 with the mode the three figures stack (`@media (max-width: 359px)`).
- `tests/payday.test.mjs`, `tests/payday.browser.mjs` (new) - the two suites.
- `tests/screens.mjs` - two screens after 'advances - one closure': 'advances - «יום תשלום», read' and 'advances - «יום תשלום», the fold opened' (scope `#paydayModal`), opened by the row on «מקדמות» on `owesRecord`.
- `tests/reports.speed.test.mjs` - the two deliberate additions (below).
- `tests/usual.test.mjs` - the order of the design layer's last blocks names «יום תשלום»'s fifth and last (below).
- `package.json` - `test:payday` (end of `npm test`), `test:payday-browser` (end of `test:all`).
- `tests/README.md` - the two rows; the reports-speed row's v206 sentence.
- `features/payday/contract.md` - revision 2 of the contract, copied in.

## Migrations and data

None. No record field, no field path, no writer, no Store key, nothing queued or synced, no
preference. The desk's only state is memory (`PAYDAY_KEPT`, `PAYDAY`), forgotten by a reload.
Held by tests: P10 (the whole disk, `device.dump()`, byte for byte across the reading, the opening,
a redraw, every door and the closing, gate open, gate shut, Thursday morning); P11 (no `Store.*`,
`localStorage`, `State.commit/save`, `closePeriodChanges`, `saveFinancialAction`, `recordAdvance*`,
`appendLedgerEntry`, `alert/confirm/prompt`, `window.print` in the code); in the browser the disk
compared before and after the desk on every page, every door, the writer-gate pages and the
in-memory unapproved record. The only key any door writes is the payslips' own
(`farkadPayslipsProgress`), written by `openPayslips` itself, and B15 holds those bytes equal to what
the payslips' own entry in «הפקת דוח» writes.

## Every hook in an existing file

| file | hook |
|---|---|
| js/ui/owes.js `renderOwesInto` | `const payday = typeof paydayEntryButton === 'function' ? paydayEntryButton() : null; const row = payday ? el('div', 'owes-actions') : box; if (payday) { row.appendChild(payday); box.appendChild(row); } if (weekly) row.appendChild(weekly);` |
| js/ui/modal.js `MODAL_CLOSERS` | `paydayModal: () => closePayday(),` |
| js/app.js `render()` | `if (typeof renderPaydayIfOpen === 'function') renderPaydayIfOpen();` after the advance-reset line |
| index.html | the `#paydayModal` frame; the script tag after advancereset.js |
| sw.js | `'./js/ui/payday.js'` in `SHELL` |
| css/design.css, css/large.css | the blocks above |

`js/ui/reports.js`, `js/ui/weeklyclose.js`, `js/ui/closereminder.js`, `js/ui/payslips.js`,
`js/ui/monthsummary.js` and `js/ui/offline.js` are read, never changed. Nothing in `js/model`,
`js/sync`, `js/state.js`, `js/store.js`, `js/recovery.js`, `firestore.rules`, `functions`,
`firebase.json` or `.github`.

## Where every figure comes from (no money worked out here)

| on the desk | the function that answers it |
|---|---|
| the groups | every man's `periodRangeFor(worker, today)`, keyed by its cycle, from and to, ordered as `payrollAccountGroups` orders them (the sheet's meeting order, then weekly first, then by date) |
| a group's rows | `payrollRowsOver(from, to, gate, id => group.has(id))` - what «דוחות» draws for those men on its default |
| «נצבר», the deduction, «לתשלום» | `payrollBandTotals(rows)`: `gross`, `taken`, `net`; «—» where the sheet prints no money in the band (no man with money and no day, and nobody with a daily rate: `payrollGroupTable`'s `anyRate`) |
| the deduction's name | `deductionColumnName(rows)` |
| the count line | `סה״כ לתשלום · countedIn(paid, 'עובד אחד', 'עובדים')`, `paid` = rows with `amount !== null` |
| each man's figure | `moneyOf(row).net`, «—» for null |
| «לסגירה» | ALWAYS read by the desk: `weeklyCloseRead(State.schedule, today, at)`, counted by `closeReminderCount(read)`; the held men `read.men` with `held`, each in `weeklyCloseHeldText(man)`; the line `CLOSE_REMINDER_TEXT.line(count)` or `WEEKLY_CLOSE_TEXT.nobody`; never `CLOSE_REMINDER_KEPT` |
| check a | `weeklyCloseReadyWord()` |
| check b | `owesWarnings(owesReadNow())` kind `'unclosed'`, worded by `owesWarningWords` (the board's own reading of this moment; `owesRead(schedule, today)` for another day) |
| check c | rows with `amount === null && attendanceDays > 0`, said by `MONTH_SUMMARY_TEXT.unpriced(n, names)` |
| check d | men who worked in a period that ends today, not frozen (`frozenPeriodFor`), and `!weeklyCloseTodayRecorded(...)` - the men «סגירת שבוע» holds «נגמרת היום» (P4 holds the two sets equal) |
| check e | `overpaymentWarning(row.carry)` |
| check f | rows with `hoursUnpriced`, said by `HOURS_UNPRICED_NOTE` without its leading «* » |
| the days recorded ahead | `entriesFor(schedule, date, id, 'actual')` for the dates after today inside the period |

The one thing the file adds up is a COUNT of men a sentence names. Two groups paid on one date
are never added: two cards, and the sentence that says they are not.

## Every new string (PROPOSED - the owner has not read them; pinned word for word in tests/payday.test.mjs P11)

`PAYDAY_TEXT`, js/ui/payday.js (20 entries):

| key | words |
|---|---|
| entry | יום תשלום |
| title | יום תשלום |
| lead | כמה לשלם ביום התשלום הבא לפי מה שנרשם עד עכשיו, ומה כדאי לסדר לפני שסוגרים. המסך הזה רק מראה - שום דבר לא נרשם ממנו. |
| next | יום התשלום הבא |
| none | עוד אין רישומים בתקופה הנוכחית. |
| heading | `${day} ${date} · ${cycle}` (e.g. «יום חמישי 19/11 · שבועי») |
| today | «היום, » (before the heading of a card whose period ends today) |
| soFar | לפי מה שנרשם עד עכשיו. ימים ומקדמות שעוד לא נרשמו - לא נכללים. |
| fullDeduction | הסכום לתשלום הוא אחרי כל הניכוי שהדוח מציע. ניכוי קטן יותר בסגירה - יותר לתשלום, עד הנצבר. |
| ahead | `כולל ימים שכבר נרשמו מראש: ${dates}.` |
| chosen | לחלק מהעובדים נבחר בדוח ניכוי אחר, והוא כלול כאן. «סגירת שבוע» מתחילה מהניכוי המלא. |
| bothGroups | ביום הזה משלמים לשתי הקבוצות. לכל קבוצה הסכום שלה - הם לא מחוברים כאן. |
| before | לפני שסוגרים |
| endsTodayOne | `התקופה של ${name} נגמרת היום, והיום עוד לא נרשם לו.` (revision 2: «סגירת שבוע»'s `heldEndsToday` with the name - P11 holds it to that sentence) |
| endsTodayMany | `התקופות של ${count} עובדים נגמרות היום, והיום עוד לא נרשם להם: ${names}.` (revision 2: plural throughout) |
| toToday | לרישום היום |
| nothing | אין מה לסדר לפני הסגירה. |
| forgotten | מקדמה שניתנה ולא נרשמה לא תנוכה. רושמים אותה לפני שסוגרים. |
| toClose | לסגירה |
| after | אחרי הסגירה |

BORROWED, each found in its owner's source by P11 (a word changed there and not here fails by
name): `PAYDAY_REUSED` - «נצבר», «לתשלום», «סה״כ לתשלום», «עובד אחד», «עובדים», «לפי עובד», the
transition sentence «תקופת מעבר: הימים שנשארו מהמחזור הקודם, לפני המעבר לתשלום שבועי.» (js/ui/reports.js),
«עובדים ואתרים», «מקדמות», «סגור» (index.html), «₪», «—» (reports.js); and the owners' constants
read by name: `WEEKLY_CLOSE_TEXT.reading/.nobody/.stateHeld`, `weeklyCloseHeldText`,
`weeklyCloseReadyWord()`, `CLOSE_REMINDER_TEXT.line/.open`, `MONTH_SUMMARY_TEXT.unpriced`,
`PAYSLIPS_TEXT.entry`, `OWES_TEXT.closures/.advancesOf`, `OWES_REUSED.checkFirst`,
`OTHER_ACCOUNT_SHOW`, `HOURS_UNPRICED_NOTE` (without its «* »), `PAY_CYCLE_LABELS`, `owesWarningWords`,
`overpaymentWarning`. No word claims money handed over or a message sent («נשלח», «שולם», «נמסר»,
«שילמת» are absent); no Arabic letter in the file (P11; tests/reportnames.test.mjs green).

## Tests added

**tests/payday.test.mjs** (Node, harness devices with a DOM that holds text, records written by
the app's own writers; synthetic names):
- P1 each card's three figures equal, as text, the band «דוחות» draws for that group on its
  default in the Node DOM (the work table's footer, or «סיכום התקופה»), in the sheet's order,
  gate open, gate shut and with a deduction chosen on the sheet.
- P2 each man's figure is `moneyOf` of the sheet's row (both gates); on Thursday it is
  `weeklyCloseFigures(man, man.max).net` for every man «סגירת שבוע» offers - EXCEPT (revision 2)
  a man with 200 chosen on the sheet: his figure is the sheet's under the choice (2,200), «סגירת
  שבוע» starts from the full 600 (1,800), and his card carries the line «לחלק מהעובדים נבחר בדוח
  ניכוי אחר…».
- P3 «לסגירה» = `closeReminderCount(weeklyCloseRead)`, the held men and their reasons; (revision 2)
  the section drawn BYTE FOR BYTE the same with a fresh `CLOSE_REMINDER_KEPT` and without one, on
  three records (two of them with held men); payday.js never names `CLOSE_REMINDER_KEPT`.
- P4 every check fires on its fixture and is silent on the clean crew; its words; every drawn door
  pressed: it calls no writer and leaves the disk byte for byte; (revision 2) a door to a dialog
  calls its opener in the task of the press, a door to anything else has run NOTHING of its target
  when that task ends and arrives in the next.
- P5 a week walked Friday to Thursday and a fortnight's Thursday.
- P6 the reading inside `reportReadOnce`/`weeklyCloseOnce` equals the bare one; the report's
  filter, range and deductions and every swapped function back after a throw.
- P7 the gate asked at most once a reading, never planned on an approved record.
- P8 the cost (seasons D and B, medians printed; «מקדמות» reads nothing of the file; an unmoved
  record read once; a moved record re-read after 1.5 s).
- P9 gate shut / unapproved: plain bands, no a, b, e, «מקדמות»'s sentence.
- P10 the whole disk byte for byte across everything.
- P11 the words; the frame, the script's place, the shell, the closer, the hook.
- P12 the row on «מקדמות»; the button alone where «סגירת שבוע» is not; a build without the file
  node for node as before.
- P13 (revision 2) the transition sentence only on a stub weekly pay follows; a weekly man back to
  fortnightly on the fortnight's second Friday: a transition, not `toWeekly`, no sentence - drawn.

Negative tests: every check is asserted silent on the clean crew and the "nothing to sort"
sentence said there; the gate-shut and unapproved readings assert the absence of a, b, e and of
sections 4-5. **Mutations run in this session** (each put into js/ui/payday.js, the suite run, the
file restored and compared byte for byte with the kept copy):
1. view doors run in the same task → 3 checks red (P4: the view doors, «סגירות שנרשמו», «לרישום היום»);
2. the transition sentence for any stub → 2 checks red (P13);
3. «לסגירה» taken from a fresh `CLOSE_REMINDER_KEPT` → 3 checks red (P3, both records with held men, and the name check).
(Earlier, before revision 2, the suite's mutations were run as well; one survived - check b
without its gate guard - because `owesWarnings` itself answers nothing unless the board is
folded, so the guard is redundant there, not untested.)

**tests/payday.browser.mjs** (real Chromium, emulated touch; the crew tests/screens.mjs seeds and
that record changed in memory only):
- B12 at 320x568, 375x667, 440x956 × dark, light × mode off, on: the row (one row first in the
  board, «יום תשלום» then «סגירת שבוע», half each, 48px (52) tall, words inside); the board under
  it unmoved, 18px at 320 with the mode; «סגירת שבוע» at full width without the file and STILL
  OPENING FROM THE ROW at its title, writing nothing; the desk read, unfolded and with every check,
  every floor; and (revision 2) the record's approval taken off in memory: «יום תשלום» alone at the
  board's full width, the board's move measured and equal to the row.
- B13 the tap paints «מחשב את החשבונות…» with no figure in the next frame; the figures within
  1,500 ms; equal as text to the bands «דוחות» draws.
- B14 a build without the file: «מקדמות» rectangle for rectangle as the base commit draws it
  (`git archive 6ab193d`, served beside and verified blob for blob).
- B15 every door tapped on Thursday 12/11 landing where it says; the payslips census; (revision 2)
  the timing of every door recorded in the page and the keyboard on the pay sheet's group heading
  after «הצג את החשבון…», never on a node of the shut desk.
- B16 Escape, the backdrop, «סגור» (and a redraw underneath) give the keyboard back to
  `#paydayEntry`; Tab kept inside; the fold by Enter and Space; (revision 2) `midEdit()` true while
  the desk is open, false once shut.
- B17 a commit under the open desk.
- B18 every font doubled at 320 and 440.
- B20 (revision 2) the writer gate shut through the test seam (`FARKAD_FLAG_OVERRIDES = {
  ledgerWrites: false }` before the scripts load) at every phone, scheme and mode: «יום תשלום»
  alone, its words inside, the board's move measured and equal to the row, the desk opening from it.
- B19 nothing threw.

## Expectations moved, and why

**In existing suites: one pin moved, on purpose - `tests/usual.test.mjs`** (commit `73ca0e0`): it
holds the usual site's look whole by naming every css/design.css block after it, in order, and
requiring nothing after the last; the suite moved that list for each feature that added a block at
the end of the layer (four times, each said in its comment). «יום תשלום»'s block is where its
contract puts it - straight after the `.weekly-close-entry` rule, the end of the layer - so the list
names it fifth and last in the same words; on the base's design.css that check now fails, as each
earlier move made it. Not in the contract's list of touched suites: the contract did not foresee
it. **For the integrator:** every other track that adds a block at the end of css/design.css meets
the same check, and the merged list must name each block in the merged order.

`tests/reports.speed.test.mjs` gained exactly the two additions
the contract names: (1) the row `div.owes-actions` on «מקדמות» (which v195 never drew) is taken out
of the byte comparison as ONE node and counted (`device.paydayRows`, required once on every draw of
the board in every reading of the gate, never on «דוחות» or a man's page, never in v195), with the
«סגירת שבוע» button inside it still counted as `WEEKLY_ENTRY` (`device.weeklyEntries` unchanged per
draw); (2) `WAYS_IN` gains `['«יום תשלום»', 'paydayFacts(todayStr(), "<TODAY>T15:00:00.000Z");']`,
counted like every other way in. `tests/screens.mjs` gained the two screens the contract names.

**In this track's own suites, for revision 2 (commit `682a253`, the reason in its message):** check
d's two pinned sentences («החשבון של … נגמר…» → «התקופה של … נגמרת…», «התקופות של N עובדים
נגמרות…») in P4 and P11, and check f's pinned sentence without its leading «* » in P4.

## Test output (pasted; every line is that suite's own last count line, its exit code and its time)

Run on this machine, shared with three other agents building at the same time; browser suites
one at a time through the slot wrapper (`scratchpad/bt`), Node suites one by one in the chain's order.

### `npm test`, suite by suite, on the final code commit `73ca0e0` (clean tree)

```
HEAD 73ca0e0cf2216def2b93f12e4b9c4e25f37e6515 status[0]
test:isolation | exit 0 | 0s | 18/18 checks passed
test:blobs | exit 0 | 2s | 11/11 checks passed
test:build | exit 1 | 1s | 67/69 checks passed
test:poison | exit 0 | 1s | 37/37 checks passed
test:merge | exit 0 | 0s | 28/28 checks passed
test:contested | exit 0 | 15s | 73/73 checks passed
test:held | exit 0 | 3s | 83/83 checks passed
test:snapshot-stale | exit 0 | 2s | 16/16 checks passed
test:reports-rules | exit 0 | 3s | 26/26 checks passed
test:finance | exit 0 | 7s | 57/57 checks passed
test:weekly-range | exit 0 | 0s | 21/21 checks passed
test:finance-wording | exit 0 | 2s | 12/12 checks passed
test:weekly-unpriced | exit 0 | 0s | 23/23 checks passed
test:receipt | exit 0 | 1s | 28/28 checks passed
test:data | exit 0 | 45s | 1970/1970 checks passed
test:recovery | exit 0 | 1s | 82/82 checks passed
test:adversarial | exit 0 | 5s | 116/116 checks passed
test:probes | exit 0 | 8s | 35/35 checks passed
test:capacity | exit 0 | 11s | 48/48 checks passed
test:concurrency | exit 0 | 3s | 46/46 checks passed
test:exports | exit 0 | 1s | 112/112 checks passed
test:fence | exit 0 | 3s | 35/35 checks passed
test:fence-ingress | exit 0 | 0s | 43/43 checks passed
test:fence-legacy | exit 0 | 0s | 21/21 checks passed
test:money-history | exit 0 | 0s | 9/9 checks passed
test:money-units | exit 0 | 0s | 21/21 checks passed
test:money-cloud | exit 0 | 2s | 17/17 checks passed
test:money-display | exit 0 | 0s | 4/4 checks passed
test:snapshot-poison | exit 0 | 2s | 82/82 checks passed
test:samefact | exit 0 | 5s | 37/37 checks passed
test:wording | exit 0 | 1s | 37/37 checks passed
test:closure | exit 0 | 21s | 122/122 checks passed
test:closure-echo | exit 0 | 1s | 79/79 checks passed
test:correction | exit 0 | 0s | 33/33 checks passed
test:quarantine | exit 0 | 2s | 82/82 checks passed
test:approval | exit 0 | 6s | 72/72 checks passed
test:repayment | exit 0 | 5s | 240/240 checks passed
test:ledger-ingress | exit 0 | 0s | 167/167 checks passed
test:cas | exit 0 | 13s | 88/88 checks passed
test:status | exit 0 | 7s | 37/37 checks passed
test:money | exit 0 | 2s | 40/40 checks passed
test:money-ingress | exit 0 | 10s | 206/206 checks passed
test:method | exit 0 | 2s | 51/51 checks passed
test:restore | exit 0 | 1s | 51/51 checks passed
test:upgrade | exit 0 | 1s | 48/48 checks passed
test:vehicles | exit 0 | 2s | 86/86 checks passed
test:xlsx | exit 0 | 2s | 104/104 checks passed
test:nonassertions | exit 0 | 1s | 23/23 checks passed
test:labels | exit 0 | 0s | 23/23 checks passed
test:labelcache | exit 0 | 0s | 32/32 checks passed
test:restore-ledger | exit 0 | 2s | 26/26 checks passed
test:roster-upgrade | exit 0 | 7s | 55/55 checks passed
test:roster-race | exit 0 | 6s | 63/63 checks passed
test:exports-proof | exit 0 | 2s | 92/92 checks passed
test:ledger-truth | exit 0 | 5s | 148/148 checks passed
test:races | exit 0 | 5s | 109/109 checks passed
test:overlap-restore | exit 0 | 20s | 117/117 checks passed
test:refute-roster | exit 0 | 10s | 24/24 checks passed
test:refute-restore | exit 0 | 43s | 25/25 checks passed
test:gate-integrity | exit 1 | 0s | 19/20 checks passed
test:queuecost | exit 0 | 6s | 18/18 checks passed
test:paycycle | exit 0 | 0s | 43/43 checks passed
test:paycycle-blockers | exit 0 | 3s | 17/17 checks passed
test:paycycle-completion | exit 0 | 5s | 31/31 checks passed
test:crew-controls | exit 0 | 1s | 46/46 checks passed
test:simple-advances | exit 0 | 2s | 66/66 checks passed
test:worker-deletion | exit 0 | 10s | 86/86 checks passed
test:calendar | exit 0 | 1s | 58/58 checks passed
test:reminders | exit 0 | 0s | 48/48 checks passed
test:move-late | exit 0 | 5s | 48/48 checks passed
test:codex-probes | exit 0 | 1s | 17/17 checks passed
test:codex2-probes | exit 0 | 1s | 36/36 checks passed
test:codex3-probes | exit 0 | 3s | 59/59 checks passed
test:rima | exit 0 | 94s | 496/496 checks passed
test:yosefgeves | exit 0 | 95s | 562/562 checks passed
test:seder | exit 0 | 0s | 135/135 checks passed
test:bars-stale | exit 0 | 0s | 60/60 checks passed
test:transport | exit 0 | 1s | 566/566 checks passed
test:transport-share | exit 0 | 12s | 304/304 checks passed
test:oracle | exit 0 | 52s | 121/121 checks passed
test:overpayment | exit 0 | 6s | 105/105 checks passed
test:polish | exit 0 | 0s | 73/73 checks passed
test:daycheck | exit 0 | 5s | 169/169 checks passed
test:journey | exit 0 | 1s | 233/233 checks passed
test:workercard | exit 0 | 24s | 180/180 checks passed
test:monthsummary | exit 0 | 82s | 98/98 checks passed
test:payslips | exit 0 | 26s | 202/202 checks passed
test:find | exit 0 | 1s | 91/91 checks passed
test:whatsnew | exit 0 | 0s | 160/160 checks passed
test:account-view | exit 0 | 21s | 456/456 checks passed
test:usual | exit 0 | 2s | 150/150 checks passed
test:sitecard | exit 0 | 3s | 119/119 checks passed
test:reportsclarity | exit 0 | 3s | 1119/1119 checks passed
test:largetext | exit 0 | 1s | 107/107 checks passed
test:reportnames | exit 0 | 11s | 36/36 checks passed
test:holiday | exit 0 | 0s | 109/109 checks passed
test:undo-stale | exit 0 | 2s | 32/32 checks passed
test:auditfix | exit 0 | 1s | 34/34 checks passed
test:owes | exit 0 | 67s | 190/190 checks passed
test:weeklyclose | exit 0 | 115s | 146/146 checks passed
test:reports-speed | exit 0 | 248s | 167/167 checks passed
test:closeorder | exit 0 | 1s | 22/22 checks passed
test:closuresize | exit 0 | 16s | 13/13 checks passed
test:closerace | exit 0 | 38s | 29/29 checks passed
test:advancereset | exit 0 | 90s | 77/77 checks passed
test:overpaidfix | exit 0 | 0s | 85/85 checks passed
test:xlsxlook | exit 0 | 15s | 293/293 checks passed
test:closereminder | exit 0 | 16s | 107/107 checks passed
test:payday | exit 0 | 39s | 234/234 checks passed
DONE
```

**Red, and only the two the contract expects** (the build stamps are the integrator's):

```
test:build
failed:
  the stamps were moved by the commit that moved the bytes :: and nothing in the shell has changed since  — 7 changed since 6ab193d6: css/design.css, css/large.css, index.html, js/app.js, js/ui/modal.js, js/ui/owes.js, js/ui/payday.js
  the stamps were moved by the commit that moved the bytes :: and neither has the worker that names the shelf  — sw.js

test:gate-integrity
failed:
  the build stamps describe the bytes a phone would be handed :: no cached file has changed since the three stamps last moved  — 682a2539 «יום תשלום»: revision 2 of the contract, reconciled | 17452d10 «יום תשלום»: the payday desk (js/ui/payday.js), its row on «
```

The same chain ran first on `b030d53` and found one more red, which was NOT expected:

```
test:build | exit 1 | 1s | 67/69 checks passed
test:gate-integrity | exit 1 | 0s | 19/20 checks passed
test:usual | exit 1 | 1s | 149/150 checks passed
failed:
  the shell: on the page after the files it calls, in the offline shell, in one style block :: the last block of the screen layer but for the ones added since
```

`tests/usual.test.mjs` pins the ORDER of css/design.css's blocks after the usual site's and
requires nothing after the last; the suite has moved that list on purpose for every feature that
added its block at the end (four times, each said in its comment). «יום תשלום»'s block stands where
its contract puts it - straight after the `.weekly-close-entry` rule, the end of the layer - so
`73ca0e0` names it fifth and last in the same words, the reason in its message. That commit
changes `tests/usual.test.mjs` only (`git diff --stat b030d53 73ca0e0`: 1 file), and the whole
chain above was then run again on it. **This is the one pinned expectation of an existing suite
this track moved.**

### Browser suites (the ones the contract names, and this track's)

On `b030d53` (clean tree); `b030d53` and `73ca0e0` serve the same bytes (the only difference is
`tests/usual.test.mjs`, which no browser suite reads):

```
HEAD b030d536579929dc7997a09ae54b3885e69eef53 status[0]
payday.browser.mjs | exit 0 | 776s | 691/691 checks passed
smoke.mjs | exit 143 | 126s | 
mobile.test.mjs | exit 0 | 405s | 1397/1397 checks passed
design.browser.mjs | exit 0 | 9s | 72/72 checks passed
largetext.browser.mjs | exit 0 | 752s | 8335/8335 checks passed
owes.browser.mjs | exit 0 | 63s | 589/589 checks passed
weeklyclose.browser.mjs | exit 0 | 74s | 408/408 checks passed
closereminder.browser.mjs | exit 0 | 47s | 106/106 checks passed
payslips.browser.mjs | exit 0 | 18s | 132/132 checks passed
whatsnew.browser.mjs | exit 0 | 78s | 251/251 checks passed
DONE
smoke.mjs (alone) | exit 0 | 495s | 1186/1186 checks passed
```

`smoke.mjs` was terminated the first time, 126 s in: exit 143 (SIGTERM), its browser gone under it
(`page.waitForTimeout: Target page, context or browser has been closed`), 368 checks passed and none
failed. What sent the signal was not established - the machine is shared with three other agents'
suites. Re-run ALONE through the wrapper on `73ca0e0`: 1186/1186, exit 0 (the last line above).
`payday.browser.mjs` also ran a second time on `73ca0e0`, with `--shots`: 691/691, exit 0.

Five more browser suites of `test:all` that draw «מקדמות» and so could see the new row, beyond the
contract's list, one at a time through the wrapper on `73ca0e0` (clean tree):

```
HEAD 73ca0e0cf2216def2b93f12e4b9c4e25f37e6515 status[0]
forms.browser.mjs | exit 0 | 297s | 32/32 checks passed
polish.browser.mjs | exit 0 | 20s | 201/201 checks passed
advancereset.browser.mjs | exit 0 | 59s | 259/259 checks passed
overpaidfix.browser.mjs | exit 0 | 6s | 20/20 checks passed
simple-advances.browser.mjs | exit 0 | 3s | 22/22 checks passed
DONE
```

## Measured

- **The row on «מקדמות» where «סגירת שבוע» is drawn:** the board under it moves 0px at 320, 375
  and 440 with the mode off and at 375 and 440 with it on; 18px at 320 with the mode (both words
  wrap to two lines), both buttons 48px tall (52 with the mode), words inside. Base rectangles of
  the board equal to the base commit's with the file taken away (B14).
- **Where «סגירת שבוע» is NOT drawn** (revision 2, criterion 12): «יום תשלום» alone at the board's
  full width, and the board moves down by that row and nothing more - **62px (the button 48 + the
  row's gap 14) with the mode off, 66px (52 + 14) with it on, at 320, 375 and 440, in both schemes,
  on a record nobody approved and with the writer gate shut alike** (24 measurements, printed by the
  suite). The contract's estimate was 52-60 (60-68 with the mode).
- **The reading's cost** (Node, P8, the median of three each time; budgets 600 ms and 8,000 ms), as
  printed by the three runs of this session - the machine shared with three other agents:
  - season D (40 men, 139 advances, 236 closes, closed in order): median **241 ms** (the suite run alone
    on the revision 2 code, before `682a253` was committed), **289 ms** (the chain on `b030d53`), **474 ms** (the chain on `73ca0e0`,
    the heaviest load: 494, 474, 312);
  - season B (40 men, 636 advances, nothing closed): median **2,989 ms**, **3,057 ms**, **3,708 ms**.
- **Tap to figures** on the seeded crew (B13): **25-26 ms** (budget 1,500 ms); the placeholder and
  no figure in the frame after the tap.

## Screenshots (synthetic names, JPEG)

Left by `node tests/payday.browser.mjs --shots <dir>` on `73ca0e0` (that run: 691/691, exit 0),
the crew tests/screens.mjs seeds and the record with every check changed in memory - synthetic names:

- `/tmp/claude-0/-home-user-farkad/d6a64352-db1a-5c3b-b54d-5c09103f2419/scratchpad/feat-payday/payday-row-440x956-dark.jpg` - the row on «מקדמות»
- `/tmp/claude-0/-home-user-farkad/d6a64352-db1a-5c3b-b54d-5c09103f2419/scratchpad/feat-payday/payday-desk-440x956-dark.jpg` - the desk as it opens
- `/tmp/claude-0/-home-user-farkad/d6a64352-db1a-5c3b-b54d-5c09103f2419/scratchpad/feat-payday/payday-checks-440x956-dark.jpg` - «לפני שסוגרים» with every check
- `/tmp/claude-0/-home-user-farkad/d6a64352-db1a-5c3b-b54d-5c09103f2419/scratchpad/feat-payday/payday-desk-320x568-dark-large.jpg`, `/tmp/claude-0/-home-user-farkad/d6a64352-db1a-5c3b-b54d-5c09103f2419/scratchpad/feat-payday/payday-desk-320x568-light-large.jpg` - the desk at 320x568 with «תצוגה גדולה»
- `/tmp/claude-0/-home-user-farkad/d6a64352-db1a-5c3b-b54d-5c09103f2419/scratchpad/feat-payday/payday-checks-320x568-dark-large.jpg`, `/tmp/claude-0/-home-user-farkad/d6a64352-db1a-5c3b-b54d-5c09103f2419/scratchpad/feat-payday/payday-checks-320x568-light-large.jpg` - its checks there

## NOT DONE, and why

- **Not tried on a real phone.** Emulated touch in Chromium only; no iPhone, no far-sighted reader.
- **`npm run test:all`, `npm run test:release` and the emulator suites were not run** - the task
  forbids them on this shared machine. The npm test chain ran suite by suite, and the browser
  suites the contract names ran one at a time through the slot wrapper, with five more that draw
  «מקדמות» (forms, polish, advancereset, overpaidfix, simple-advances); the rest of `test:all`'s
  browser suites (print, update, handover, the service-worker suites, week, reports and the others
  that never open «מקדמות») did not run here.
- **The three build stamps, the «מה חדש» entry, docs/releases.md and CLAUDE.md** are the
  integrator's; texts for them are below. Until the stamps move, `tests/build.test.mjs` (its stamp
  check and the sw.js line) and `tests/gate.integrity.test.mjs` §4 are red - expected, the contract
  says so; see the output above.
- **The owner has not read one word of it.** Every string is proposed.

## Known risks, observations, and open questions (each with the default kept)

1. **Where «סגירת שבוע» is not drawn the board moves down 62px (66 with the mode)** - on a record
   nobody approved, and on a build whose writer is shut. Default kept (revision 2): the desk is still
   drawn there, alone, because its plain bands are what he pays from. The owner may rule otherwise.
2. **The writer gate shut (a test-only build; `LEDGER_WRITES = true` ships):** the carry gate is
   open, so the cards and checks b and e are the new arithmetic, but «סגירת שבוע» has no list - and
   the desk then puts «מקדמות»'s own sentence (`OWES_REUSED.checkFirst`) in place of sections 4-5,
   as it does for a record nobody approved. No shipped build reaches this state; nothing was changed
   for it.
3. **The sheet's transition sentence is untrue for a man returning to fortnightly pay - pre-existing,
   in js/ui/reports.js (`groupPeriodNote`), which this track may not change.** It says «…לפני המעבר
   לתשלום שבועי.» for ANY period a boundary cut short; the desk (revision 2) says it only of a stub
   weekly pay follows, so for such a man the sheet and the desk now word the card differently, by
   design. A repair of the sheet is a separate decision.
4. **A group whose deduction comes only from a carried debt has no deduction column on the work
   table** (pre-existing sheet behaviour): the desk then shows the band's own «נצבר» less «לתשלום»
   under the deduction's name - P1 holds that difference to the band's two printed figures.
5. **A deduction chosen on the sheet this session is in the desk's figure** (it is what the sheet
   says) while «סגירת שבוע» starts from the full deduction; the card says so in one sentence
   (`chosen`). By design (revision 2, criterion 2).
6. **The cost.** About 3-3.7 s for season B (636 advances, nothing closed) on this machine, under
   the placeholder «מחשב את החשבונות…»; inside budget, measured, not optimised. Season D's median
   rose from 241 ms alone to 474 ms under this machine's heaviest load, against a 600 ms budget: a
   timing check that could go red only under load - re-run it alone before believing such a red.
7. **The key a reading is kept under** is owes.js's (`owesKey`: the write tick, today, both gates and
   the record as text), so while the desk is open each `render()` serialises the record once to ask
   whether it moved - the house rule (owes.js, closereminder.js, weeklyclose.js do the same) - and
   `PAYDAY_KEPT` holds one more record-sized string in memory.
8. **Choices inside the contract's words, stated:** check d names the men who WORKED in a period that
   ends today and is still open (P4 holds that set equal to the men «סגירת שבוע» holds «נגמרת היום»);
   «סגירות שנרשמו» is offered only when a closure is on the record (`owesAnyClosure`); a band the
   sheet cannot price says «—», never 0; the doors are data (`{ words, go, args }`) so that two
   readings compare as JSON.

## For the integrator

**«מה חדש» item (PROPOSED):**
`{ title: 'יום תשלום', text: 'בעמוד המקדמות: כמה לשלם בכל קבוצה ביום התשלום הבא לפי מה שנרשם, ומה כדאי לסדר לפני שסוגרים.', where: 'מקדמות ← יום תשלום', go: 'payday' }`
- `go: 'payday'` only navigates: `OWES_PAGE = null; ADVANCE_WORKER = null; showView('advances')`,
  then focus `#paydayEntry` without pressing it («הראה לי» never opens a reading of money).

**Release entry (a draft for docs/releases.md):**

> ### «יום תשלום»: the moment before he pays, on one screen (candidate, not served)
>
> **Why.** The owner (2026-11-19) asked for real features that lift the app. His money pain is the
> one the app keeps answering piece by piece - periods nobody closed, deductions not taken, advances
> forgotten. What did not exist is the moment BEFORE he pays: on Wednesday night or Thursday morning
> he found each group's band at the bottom of its cards in «דוחות», and found out what would stop the
> close only when he pressed it.
>
> **What changed in the app: `js/ui/payday.js` (new), `js/ui/owes.js` (the weekly button's line in
> `renderOwesInto`), `js/ui/modal.js` (one closer), `js/app.js` (one line in `render()`),
> `index.html` (the frame and the script), `sw.js` (the shell), `css/design.css`, `css/large.css`.
> Nothing in `js/model`, `js/sync`, `js/state.js`, `js/store.js`, `js/recovery.js`,
> `firestore.rules` or `functions`; no key, no field path, no writer.**
>
> One button, «יום תשלום», beside «סגירת שבוע» on top of «מקדמות» (half the row each; alone at full
> width where «סגירת שבוע» is not drawn - a record nobody approved - and then the board moves down
> by that row, 62px, 66 with «תצוגה גדולה»). It opens ONE dialog: «יום התשלום הבא» - a card per pay
> group with its payday's date and the three figures «דוחות» prints under that group (`payrollRowsOver`,
> `payrollBandTotals`, `deductionColumnName`), each man's figure one tap away; «לפני שסוגרים» - what
> will stop or distort the close, each finding an existing function's answer in its owner's words,
> each with one button that only navigates; «לסגירה» - how many «סגירת שבוע» would close now and who
> it holds and why, read by the desk itself; «אחרי הסגירה» - the payslips and the closes on record.
> It works no money out (the one thing it adds up is a count of men), writes nothing, closes nothing
> and opens nothing by itself; a weekly payday is never added to a fortnightly one. It reads inside
> the pay sheet's one reading (`reportReadOnce`) and «סגירת שבוע»'s memory (`weeklyCloseOnce`),
> after the dialog has painted «מחשב את החשבונות…», kept under the record (`owesKey`); a record that
> moves under it puts the placeholder over its figures at once and is read again when the draws stop.
> Every word proposed and pinned (tests/payday.test.mjs). NOT tried on a real phone.

**CLAUDE.md file-list lines (a draft):**

```
    js/ui/payday.js            v206: «יום תשלום» - the moment before he pays, one dialog from «מקדמות» beside
                               «סגירת שבוע»: each pay group's next payday and the three figures «דוחות» prints
                               under it (payrollRowsOver, payrollBandTotals), what will stop or distort the
                               close (each an existing function's finding, each with one door that only
                               navigates; a door to a view runs one task later), how many «סגירת שבוע» would
                               close now and who it holds (read here, never CLOSE_REMINDER_KEPT), the doors
                               after; inside reportReadOnce and weeklyCloseOnce, kept under owesKey, read after
                               paint; no money of its own, no key written; every Hebrew word in one block
    tests/payday.test.mjs      v206: the desk on devices - every card the band «דוחות» draws, each man's figure,
                               the count and the held men, every check and every door (and when it runs), a
                               week walked, the scopes, the gate, the cost, the gate shut, the disk byte for
                               byte, every word, the row on «מקדמות», the transition sentence
    tests/payday.browser.mjs   v206 in Chromium: the row at three phones, both schemes, the mode - the board
                               unmoved where «סגירת שבוע» is drawn and its move measured where it is not; the
                               tap and the band; a build without the file against the base; every door, its
                               task and the focus; the keyboard and midEdit(); a commit under it; the floors
```
