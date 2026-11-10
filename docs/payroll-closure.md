# Worker accounts, closure and payment — the design as built (Phases 0 to 4)

Status: **the model, its storage and sync, the server-first closure, the rules for it and
the screens — shipped shut, on a development branch.** `FARKAD_FLAGS.paybook` is `false`:
every planner refuses with `gate`, nothing in the app creates a pay entry, the one-debt
ruling the owner approved is behind the same gate, and the screens of Phase 4 are reached
by nothing. **v176 is not served and not merged; nothing here has touched a real record,
no rules were published, and the gate has never been open outside a test.** Phase 4 as
built comes first below, then Phase 3; **the gate may still not be opened**, and
[What is NOT built](#what-is-not-built-and-why-the-gate-stays-shut) says exactly why.

Phases 0 and 1 were built on `bd59a68` (v169); Phase 2 on `0acaceb` (v171); Phase 3 on
Phase 2 merged with main at v172 (`8c943fa`); Phase 4 on Phase 3 merged with main at
v174 (`893def8`). The specification was the audit and design
written against `b640c5a`; where the code disagreed with either, the code won, and every
such place is in [Where the audit and the design were
wrong](#where-the-audit-and-the-design-were-wrong).

    node tests/payroll.test.mjs             # the model, writer on through the test seam
    node tests/paybook.store.test.mjs       # one phone: the gate, the commit, the disk, the files, capacity
    node tests/paybook.sync.test.mjs        # two and three phones on the fake cloud (the old queue door, opened by name)
    node tests/paybook.oldbuilds.test.mjs   # v167, v169 and v171, out of Git, beside this build
    npm run -s test:paybook-emulator        # the PUBLISHED rules and the production adapter (needs Java)

## Phase 4 — the screens (v176)

**Development branch. Not served, not merged, on no phone; no real record was read. The
gate (`paybook`) is still `false` in everything committed, and with it shut the app is
v174's: no new entry point, no new sentence, no moved pixel.** The gate has never been
open outside a test. Everything in [What is NOT built](#what-is-not-built-and-why-the-gate-stays-shut)
still stands, so after this phase the gate still may not be opened.

    node tests/accounts.test.mjs          # every word pinned, every refusal a sentence, the gate shut
    npm run -s test:accounts-browser      # the owner's examples through the screens (Chromium, a played cloud)

### What was built

One file, `js/ui/accounts.js`, its styles at the end of `css/design.css` (inside
`@media screen`, every class `acc-…`), and four guarded lines in `js/ui/reports.js`. The
screens draw INSIDE the «מקדמות» tab's own page (`#advancesView`) — not a new fixed layer —
so the tab bar, the top strip, the keyboard and the stuck-frame rules are the ones every
tab already has, and paper never sees them.

| # | screen | what it is |
|---|---|---|
| 1 | entry | With the gate open the «מקדמות» tab is the accounts home. **The tab's label is unchanged** («מקדמות») and the tab bar has its five tabs. One man's advances page is the existing one, unchanged, reached from his row («מקדמות»), and is still how an advance is given or handed back. |
| 2 | the list | `accountsList`: a card a man — name, «עובד שבועי» / «עובד דו-שבועי», the status, his OPEN period's wage as the one big number with its dates, and only when non-zero two separate small figures: «יתרת שכר לתשלום» (green) and «חוב מקדמות» (amber). An earlier unclosed period is a quiet «ממתין לסגירה» line of its own, never summed. Filter (הכול / שבועי / דו־שבועי), search by name. Top: «סגירת חשבונות עובדים» (the one filled button), «סגירת חשבון דו-שבועי», and the «היסטוריית סגירות חשבון» link. |
| 3 | the review page | «סגירת חשבון ואיפוס» on his row. Period, days, regular / double / extra hours, sites, the day list folded; the wage; «יתרת שכר לתשלום» from earlier closures apart; each open advance a row (date, given, left) with its own field pre-filled by `paybookSuggestAllocations`, «הכול» and «0» one tap each, and a live «יישאר אחרי הסגירה»; extra deductions (amount, category, reason); the net; paid — «שולם הכול» / «שולם חלקית» / «עוד לא שולם» — and how; the balance after. One filled button: «אישור סגירה». |
| 4 | later payment | «תשלום בפועל» on his row or on a closure's statement: amount (the whole balance offered), date, method. The payment's id is minted when the form opens. |
| 5 | the group walk | «סגירת חשבונות עובדים» / «סגירת חשבון דו-שבועי»: every waiting account in scope with its status and «3 מתוך 8 · נשארו 5»; «התחל» / «המשך» walks them one by one (confirm → next, «דלג» → next, the skipped ones come back last); tick several and «הכן סגירה לנבחרים» shows a summary — wage, advances, net, paid per man and the four column totals — before anything is written; then one transaction per man, a result on each row, and «נסה שוב לנכשלים», which never repeats the ones done. |
| 6 | history | «היסטוריית סגירות חשבון», `closureHistory`: search by name, cycle, payment status, closure dates, work-period dates. A record opens its statement: the frozen wage and day list, each advance deducted with what remained then and what is left today, extras, payments, corrections under what they correct. «תשלום בפועל» when still owed; «תיקון לסגירה» and «ביטול רישום» with a mandatory reason, each a NEW linked entry. |
| 7 | first run | Until an `opening` exists the tab shows one sentence, the day (default: the first day of the fortnight containing today) and «התחל מעקב». Older closures with no payment record are «סגירות ישנות לבדיקה (N)» on the list: «שולם» / «נשאר חוב» (+ a sum) / «לא ידוע» each, answerable any time, never in the way. |
| 8 | the old dialog | With the gate open `openWorkerSettlement`, «קיזוז מהשכר» and the closure block of the worker-days dialog all lead to the review page (decision 29's default): one way to close. With the gate shut they are untouched. |

**Taps, the common case** — close one biweekly worker with two advances, paid in full:
**three.** «סגירת חשבון ואיפוס» on his row → (both advances are already answered by the
suggestion) «שולם הכול» → «אישור סגירה». Changing one advance's amount is typing it;
"deduct nothing from this one" is one more tap («0»). No dialog asks "are you sure": the
review page IS the confirmation, and a closure is corrected by a linked record, not undone.

### The rules the screens keep

- **No money is computed in the screen.** Every figure is a field of a plan or a fold.
  The review page asks `planClosure` again on every change (180 ms after the last key);
  «שולם הכול» is the plan's own `netDue`; the summary's column totals are the model's
  `paybookSum`. The suite reads the source for arithmetic on a money field and finds none.
- **One door.** `FarkadSync.transactPaybook(plan)` and nothing else writes a pay entry.
  The one ordinary commit in the file is the carry approval, by the ledger's own writer.
- **Opening a page writes nothing** — measured: the disk and the cloud's write log are
  what they were.
- **A refusal is a sentence beside the field that caused it.** A blank advance field is
  `allocation-missing` on that row (after the first attempt to confirm — not while
  typing); over an advance, over the wage and over the net are said at once, on the row,
  under the net and beside the paid field. A refusal about the account itself (too early,
  already closed, no rate) is a line at the top of the page. No control is ever disabled
  for a reason the page does not say.
- **The server's answers, as built:**

| answer | the person sees |
|---|---|
| `closed` / `done` | back to the list (or the next man), his row updated, one calm line |
| `refused: offline` | «אין חיבור לשרת. סגירת חשבון ותשלום נרשמים רק כשיש חיבור. לא נרשם דבר.» — the page stays, the entries stay, nothing is written or queued (measured: every key on the disk byte for byte, no attempt on the cloud) |
| `refused: unsent-work` / `busy` / `pending` / `restoring` / `unsupported` / `storage` / `server` | each its own sentence (the table below) |
| `stale` | «החשבון השתנה בזמן האישור…»; the page is re-planned from the record the phone has just adopted, with what was typed kept — a new advance appears as an unanswered row. If the account was closed by another phone: «החשבון כבר נסגר בטלפון אחר…» and the numbers it was closed on |
| `unknown` | «הרישום נשלח, ועדיין לא ידוע אם השרת קיבל אותו. אל תרשום שוב…» on the page and at the top of every accounts screen; the screens ask the sync layer to look again every three seconds, and when it is settled say which way («…התקבל בשרת» / «…לא התקבל…») until «הבנתי» |

- **The carry approval** (`carry-approval-needed`) is one sentence and «אשר את המעבר»,
  right above the button that needed it — on the review page or on the activation screen.
  Measured on a record nobody approved: with the gate open the ruling makes the carry
  needed at once, so the FIRST thing a person meets is that question, on the activation
  screen. That is decision 28 answering itself: the approval and the opening day are one
  step in practice.
- **The order of the list** is the one decision in it that is this file's: (0) «לבדיקה»,
  (1) a period that has ENDED and is not closed, (2) wage still owed from a closure,
  (3) the open period still running, (4) only an advance debt, (5) settled, (6) nothing.
  Inside a rank the roster's order stands. The existing «סידור» of the advances page is
  not reachable while the gate is open.
- **Geometry**, measured at 440×956 and 375×667, dark and light: every target 44px in both
  dimensions, every field 16px or more with `inputmode="decimal"` on amounts, no sideways
  scroll, exactly one filled button on a screen that has a primary action, and at 200%
  text no amount, name or status clipped. No bar height and no inset is written in the
  styles; nothing is `position: fixed`.

### One addition to the model

`paybookSuggestAllocations(review)` in `js/model/payroll.js`: what the review page
pre-fills — all of each advance, oldest first, for as long as the wage (and the account
walk's `walkRoom`) allows, and an explicit 0 for the rest. Pure, in agorot, reads only
`planClosure`'s own review, writes nothing. It is in the model so that the screen does not
subtract. Pinned in `tests/accounts.test.mjs`. No other file under `js/model/` or
`js/sync/` changed, and `firestore.rules` was not touched.

### What is NOT built in Phase 4

1. **«נסגר» on the «לפי עובד» report** for closed weeks (the owner's answer of
   2026-11-10). The reports are unchanged.
2. **A screen to settle a pay-book disagreement** (`payConflicted`). Such a man reads
   «לבדיקה», his planners refuse with `conflict` and its sentence, and nothing lets a
   person choose.
3. **The wording of «late since close»** on a closed row under the ruling (decision 26).
4. **A date for the payment made AT the closing.** It is dated today; a different day is a
   later payment.
5. **A partial void.** «ביטול רישום» voids the whole payment or extra deduction; the
   model's `amount` option is not offered.
6. **An advance deduction is not reversed from the statement.** That is the ledger's
   existing «תיקון טעות», on the man's advances page.
7. **Drafts.** What is typed into a review is in memory only; a reload loses it, on
   purpose — a draft of a closure offered a week later would be against another account.
8. **The absent detail is not fetched into a backup**, and the «detail not on this phone»
   sentence can only be produced in a test today, because nothing has left the live
   document (Phase 3, item 1).
9. **The stale «שולח» status line** after a batch settled against the server's copy
   (pre-existing, `js/sync/send.js`).

### What Phase 5 (activation on real data) must do

Unchanged in substance from Phase 3's list, with what this phase learned:

1. Build Phase 3's [What is NOT built](#what-is-not-built-and-why-the-gate-stays-shut),
   items 1–5 (the folds reading the index, dropping the live copy, the index's own bound,
   the days leaving, backups carrying closed documents) and re-measure Capacity.
2. The owner reads `planDebtRuling`, `planPayMigration` and `planHistoryMove` on his real
   record.
3. The rollout order: save the published rules, publish the new ones, update every phone,
   check each in ⋯.
4. One commit: `paybook: true`, with the eight expectations the ruling moves
   (`repayment`, `ledger.truth`, `paycycle.completion`) — and, new, **every browser suite
   that opens the «מקדמות» tab or the old closure dialog** (`simple-advances-browser`,
   `forms`, `reports-browser`, `navigation-browser`, `mobile`, `design-browser`, `smoke`):
   with the gate open that tab is the accounts home and the old dialog is a door to the
   review page, so their expectations move in that commit, deliberately.
5. On each phone, the first open of the tab: the carry approval (if the record needs it),
   the opening day, then «סגירות ישנות לבדיקה».
6. Moving existing history, settled bundles only, copy → read back → compare → drop.
7. **A real phone.** Nothing here has been on one: the keyboard over the review page, the
   date control in the iPhone's locale, a slow signal between the tap and the answer.

### Hebrew in Phase 4

**Verbatim (the owner's):** in `ACC_OWNER` and, for the five statuses, the model's
`PAYBOOK_STATUS_LABELS`. **Everything else is proposed**, in `ACC_TEXT` and
`ACC_REFUSALS` at the top of `js/ui/accounts.js`, pinned word for word in
`tests/accounts.test.mjs`, and listed here. The suite fails if a string in the file is
missing from this table.

**The tab's label is not changed.** «מקדמות» stays on the tab bar while the page under it
is «חשבונות עובדים» — a proposed title. If the owner wants the tab renamed, that is one
string in `index.html` and a pinned expectation in several suites; it was not done here.

#### The owner's labels, verbatim

| string | where |
|---|---|
| סגירת חשבון ואיפוס | the per-worker close button on his row |
| יתרת שכר לתשלום | list figure, review, payment, statement |
| סגירת חשבונות עובדים | list, the filled button; title of the walk |
| סגירת חשבון דו-שבועי | list, second button; title of the walk |
| היסטוריית סגירות חשבון | the history link and its title |
| סגירת חשבון | title of the review page and of a statement |
| תשלום בפועל | the payment button and its title |
| עובד שבועי | cycle mark |
| עובד דו-שבועי | cycle mark |
| שולם חלקית | status; the middle "paid" choice on the review page |
| ממתין לסגירה | status `waiting`; the earlier-period line; a waiting item of the walk (model: `PAYBOOK_STATUS_LABELS`) |
| נסגר | status `closed`; a finished item of the walk (model: `PAYBOOK_STATUS_LABELS`) |
| שולם | status `paid` (model: `PAYBOOK_STATUS_LABELS`) |
| יתרה פתוחה | status `open` (model: `PAYBOOK_STATUS_LABELS`) |

#### Proposed: the screens (195)

Existing words reused as they are: «מקדמות», «חיפוש עובד», «לא נמצא עובד.», «מזומן», «העברה», «הבנתי», «כבוי», «אשר את המעבר», «אין מקדמות פתוחות לעובד הזה.» and the filter's «שבועי» / «דו־שבועי».

| key | string | where |
|---|---|---|
| `title` | חשבונות עובדים | the list |
| `back` | חזרה | the list |
| `backToList` | חזרה לרשימה | the list |
| `understood` | הבנתי | the list |
| `filterAll` | הכול | the list |
| `filterWeekly` | שבועי | the list |
| `filterBiweekly` | דו־שבועי | the list |
| `search` | חיפוש עובד | the list |
| `notFound` | לא נמצא עובד. | the list |
| `advances` | מקדמות | the list |
| `debt` | חוב מקדמות | the list |
| `statusReview` | לבדיקה | the list |
| `statusNone` | אין חשבון פתוח | the list |
| `statusUnknown` | לא ידוע אם שולם | the list |
| `inactiveMark` | כבוי | the list |
| `unpriced` | חסר תעריף - אי אפשר לחשב שכר | the list |
| `workDays` | ימי עבודה | the review page |
| `regularDays` | ימים רגילים | the review page |
| `doubleDays` | ימים כפולים | the review page |
| `extraHours` | שעות נוספות | the review page |
| `absentDays` | ימי היעדרות | the review page |
| `dayList` | פירוט הימים | the review page |
| `absent` | נעדר | the review page |
| `gross` | שכר התקופה | the review page |
| `wageDueBefore` | מסגירות קודמות. לא נכלל בסגירה הזאת. | the review page |
| `advancesTitle` | מקדמות לקיזוז | the review page |
| `advanceGiven` | ניתנה | the review page |
| `advanceLeft` | נשאר | the review page |
| `advanceField` | כמה לקזז מהמקדמה הזאת? | the review page |
| `all` | הכול | the review page |
| `zero` | 0 | the review page |
| `leftAfter` | יישאר אחרי הסגירה | the review page |
| `noAdvances` | אין מקדמות פתוחות לעובד הזה. | the review page |
| `laterAdvance` | מקדמה מאוחרת - תקוזז מהתקופה הבאה | the review page |
| `extrasTitle` | ניכויים נוספים | the review page |
| `addExtra` | + ניכוי נוסף | the review page |
| `extraAmount` | סכום הניכוי | the review page |
| `extraCategory` | סוג הניכוי | the review page |
| `extraReason` | סיבת הניכוי | the review page |
| `removeExtra` | הסר ניכוי | the review page |
| `categoryAgreed` | ניכוי מוסכם | the review page |
| `categorySettlement` | הסדר | the review page |
| `categoryOther` | אחר | the review page |
| `advanceDeducted` | קיזוז מקדמות | the review page |
| `netDue` | נטו לתשלום | the review page |
| `paidTitle` | שולם בפועל | the review page |
| `paidFull` | שולם הכול | the review page |
| `paidNone` | עוד לא שולם | the review page |
| `paidAmount` | כמה שולם? | the review page |
| `methodTitle` | איך שולם? | the review page |
| `methodCash` | מזומן | the review page |
| `methodTransfer` | העברה | the review page |
| `balanceAfter` | יתרה אחרי הסגירה | the review page |
| `debtAfter` | חוב מקדמות אחרי הסגירה | the review page |
| `confirm` | אישור סגירה | the review page |
| `busy` | רושם בשרת… | the review page |
| `closedDone` | החשבון נסגר ונרשם. | the review page |
| `fixFirst` | יש שדה שצריך לתקן. הוא מסומן למעלה. | the review page |
| `carryButton` | אשר את המעבר | the review page |
| `carryDone` | המעבר אושר. אפשר להמשיך. | the review page |
| `carryFailed` | האישור לא נשמר. נסה שוב. | the review page |
| `freshClosed` | כך נסגר החשבון: | the review page |
| `offline` | אין חיבור לשרת. סגירת חשבון ותשלום נרשמים רק כשיש חיבור. לא נרשם דבר. | the server's answers |
| `unsentWork` | יש במכשיר הזה רישומים שעוד לא נשלחו לשרת. חכה שיישלחו ונסה שוב. לא נרשם דבר. | the server's answers |
| `busyElsewhere` | פעולה אחרת עדיין נרשמת. חכה רגע. | the server's answers |
| `pending` | פעולה קודמת עדיין לא אושרה מהשרת. אי אפשר לרשום עוד עד שיתברר מה קרה איתה. | the server's answers |
| `restoring` | שחזור נתונים עוד לא הסתיים. נסה שוב אחריו. לא נרשם דבר. | the server's answers |
| `unsupported` | הגרסה במכשיר הזה לא יכולה לרשום סגירת חשבון. עדכן את האפליקציה. | the server's answers |
| `nothingToWrite` | אין מה לרשום. בדוק את הסכומים. | the server's answers |
| `storage` | אין מקום לשמור במכשיר. לא נרשם דבר. | the server's answers |
| `server` | השרת לא קיבל את הרישום. לא נרשם דבר. נסה שוב. | the server's answers |
| `stale` | החשבון השתנה בזמן האישור. לא נשמר דבר. בדוק את הסכומים ואשר שוב. | the server's answers |
| `staleClosed` | החשבון כבר נסגר בטלפון אחר. לא נרשם דבר נוסף. | the server's answers |
| `unknown` | הרישום נשלח, ועדיין לא ידוע אם השרת קיבל אותו. אל תרשום שוב - הבדיקה תיעשה מעצמה כשיהיה חיבור. | the server's answers |
| `outcomeCommitted` | הרישום שהיה בבדיקה התקבל בשרת. | the server's answers |
| `outcomeNothing` | הרישום שהיה בבדיקה לא התקבל. לא נרשם דבר - אפשר לרשום שוב. | the server's answers |
| `payFor` | עבור התקופה | later payment |
| `payOwed` | נשאר לתשלום | later payment |
| `payAmount` | סכום התשלום | later payment |
| `payDate` | תאריך התשלום | later payment |
| `paySave` | רשום תשלום | later payment |
| `payDone` | התשלום נרשם. | later payment |
| `payAlready` | כבר נרשם | later payment |
| `payNothing` | אין יתרת שכר לתשלום לעובד הזה. | later payment |
| `groupStart` | התחל | the group walk and its summary |
| `groupResume` | המשך | the group walk and its summary |
| `groupOf` | מתוך | the group walk and its summary |
| `groupLeft` | נשארו | the group walk and its summary |
| `skip` | דלג | the group walk and its summary |
| `skipped` | דולג | the group walk and its summary |
| `notClosed` | לא נסגר | the group walk and its summary |
| `notEnded` | התקופה מסתיימת ב־ | the group walk and its summary |
| `prepare` | הכן סגירה לנבחרים | the group walk and its summary |
| `select` | בחירה | the group walk and its summary |
| `needSelection` | בחר עובדים קודם: סמן את התיבה ליד כל עובד. | the group walk and its summary |
| `groupEmpty` | אין חשבונות שממתינים לסגירה. | the group walk and its summary |
| `groupAllDone` | כל החשבונות שאפשר לסגור נסגרו. | the group walk and its summary |
| `summaryTitle` | סיכום לפני אישור | the group walk and its summary |
| `colWage` | שכר | the group walk and its summary |
| `colAdvances` | מקדמות | the group walk and its summary |
| `colNet` | נטו | the group walk and its summary |
| `colPaid` | שולם | the group walk and its summary |
| `total` | סה״כ | the group walk and its summary |
| `batchUnpaid` | התשלום לא נרשם: כל החשבונות ייסגרו כ״עוד לא שולם״. אפשר לרשום תשלום אחר כך. | the group walk and its summary |
| `batchPaid` | כל החשבונות יירשמו כ״שולם הכול״ במזומן. | the group walk and its summary |
| `batchConfirm` | אישור סגירה לכל הרשימה | the group walk and its summary |
| `batchRunning` | סוגר | the group walk and its summary |
| `batchNone` | אין ברשימה חשבון שאפשר לסגור. | the group walk and its summary |
| `retry` | נסה שוב לנכשלים | the group walk and its summary |
| `openRow` | פתח ועדכן | the group walk and its summary |
| `historySearch` | חיפוש לפי שם | history, the statement, corrections |
| `statusAll` | כל המצבים | history, the statement, corrections |
| `statusFilter` | מצב התשלום | history, the statement, corrections |
| `dateFilters` | סינון לפי תאריכים | history, the statement, corrections |
| `closedFrom` | נסגר מתאריך | history, the statement, corrections |
| `closedTo` | נסגר עד תאריך | history, the statement, corrections |
| `periodFrom` | תקופת עבודה מתאריך | history, the statement, corrections |
| `periodTo` | תקופת עבודה עד תאריך | history, the statement, corrections |
| `historyEmpty` | לא נמצאו סגירות. | history, the statement, corrections |
| `closedOn` | נסגר ב־ | history, the statement, corrections |
| `deducted` | קוזז | history, the statement, corrections |
| `leftThen` | נשאר במקדמה אחרי הסגירה | history, the statement, corrections |
| `leftNow` | נשאר היום | history, the statement, corrections |
| `payments` | תשלומים | history, the statement, corrections |
| `noPayments` | לא נרשם תשלום. | history, the statement, corrections |
| `corrections` | תיקונים | history, the statement, corrections |
| `voided` | בוטל | history, the statement, corrections |
| `voidAction` | ביטול רישום | history, the statement, corrections |
| `voidReason` | סיבת הביטול | history, the statement, corrections |
| `adjustAction` | תיקון לסגירה | history, the statement, corrections |
| `adjustAdd` | להוסיף לעובד | history, the statement, corrections |
| `adjustSub` | להפחית | history, the statement, corrections |
| `adjustAmount` | סכום התיקון | history, the statement, corrections |
| `adjustReason` | סיבת התיקון | history, the statement, corrections |
| `correctionLead` | תיקון הוא רישום חדש שנשאר ליד המקורי. שום דבר לא נמחק. | history, the statement, corrections |
| `saveCorrection` | רשום תיקון | history, the statement, corrections |
| `correctionDone` | התיקון נרשם. | history, the statement, corrections |
| `detailAbsent` | הפירוט המלא של הסגירה הזאת עדיין לא במכשיר הזה. הסכומים נכונים; הפירוט יופיע כשיהיה חיבור. | history, the statement, corrections |
| `owed` | מגיע לעובד | history, the statement, corrections |
| `paidSoFar` | שולם עד היום | history, the statement, corrections |
| `legacyUnknown` | נסגר לפני שנרשמו תשלומים - לא ידוע אם שולם | history, the statement, corrections |
| `openingLead` | מהיום שתבחר, כל סגירת חשבון ותשלום נרשמים כאן. מה שנסגר לפני כן לא משתנה. | first run and the older closures |
| `openingDay` | יום תחילת המעקב | first run and the older closures |
| `openingConfirm` | התחל מעקב | first run and the older closures |
| `openingDone` | המעקב התחיל. | first run and the older closures |
| `legacyEntry` | סגירות ישנות לבדיקה | first run and the older closures |
| `legacyTitle` | סגירות ישנות - האם שולם? | first run and the older closures |
| `legacyLead` | סגירות שנעשו לפני שנרשמו תשלומים. ענה מתי שנוח - זה לא עוצר שום דבר. | first run and the older closures |
| `legacyPaid` | שולם | first run and the older closures |
| `legacyDue` | נשאר חוב | first run and the older closures |
| `legacyLeave` | לא ידוע | first run and the older closures |
| `legacyDueAmount` | כמה נשאר לשלם? | first run and the older closures |
| `legacySave` | רשום | first run and the older closures |
| `legacyDone` | התשובה נרשמה. | first run and the older closures |
| `legacyEmpty` | אין סגירות ישנות לבדיקה. | first run and the older closures |
| `draftRestored` | מה שהוקלד לפני שהעמוד נטען מחדש שוחזר. בדוק את הסכומים לפני האישור. | Phase 5: a draft kept across a reload |
| `draftContinue` | המשך סגירה שהתחלת | Phase 5: a draft kept across a reload |
| `lookAction` | מה לבדוק? | Phase 5: what «לבדיקה» is about |
| `lookLead` | הסכומים שבמסכים הם אלה שהשרת מחזיק. שום דבר לא נמחק. עד שזה ייפתר אי אפשר לרשום לעובד הזה סגירה או תשלום. | Phase 5: what «לבדיקה» is about |
| `lookConflict` | שני טלפונים רשמו את אותו רישום בסכומים שונים | Phase 5: what «לבדיקה» is about |
| `lookCounted` | נספר - מה שהשרת מחזיק | Phase 5: what «לבדיקה» is about |
| `lookBeside` | נשמר בצד, לא נספר | Phase 5: what «לבדיקה» is about |
| `lookHeld` | רישום שלא נספר | Phase 5: what «לבדיקה» is about |
| `lookOverpaid` | שולם יותר מהמגיע | Phase 5: what «לבדיקה» is about |
| `lookOverpaidAdvance` | הוחזר או קוזז יותר ממה שניתן במקדמה | Phase 5: what «לבדיקה» is about |
| `lookNoFix` | עדיין אין פתרון מהמסך הזה. הראה את המסך הזה למי שמתחזק את האפליקציה. | Phase 5: what «לבדיקה» is about |
| `lookNothing` | אין מה לבדוק לעובד הזה. | Phase 5: what «לבדיקה» is about |
| `lookAmount` | סכום | Phase 5: what «לבדיקה» is about |
| `lookDate` | תאריך | Phase 5: what «לבדיקה» is about |
| `lookBy` | נרשם במכשיר | Phase 5: what «לבדיקה» is about |
| `kindPayment` | תשלום | Phase 5: what «לבדיקה» is about |
| `kindDeduction` | ניכוי נוסף | Phase 5: what «לבדיקה» is about |
| `kindLegacy` | תשובה על סגירה ישנה | Phase 5: what «לבדיקה» is about |
| `archiveEntry` | ארכיון סגירות | Phase 5: the archive |
| `archiveLead` | סגירה ששולמה במלואה עוברת מהרישום החי לארכיון בשרת, כדי שהרישום לא יתמלא. שום דבר לא נמחק: הסגירה נשארת במכשיר הזה ובהיסטוריה בדיוק כמו שהיא. | Phase 5: the archive |
| `archiveReady` | מוכנות להעברה | Phase 5: the archive |
| `archiveHeld` | נשארות ברישום | Phase 5: the archive |
| `archiveDone` | כבר בארכיון | Phase 5: the archive |
| `archiveSizeNow` | גודל הרישום בשרת | Phase 5: the archive |
| `archiveSizeAfter` | אחרי ההעברה | Phase 5: the archive |
| `archiveRun` | העבר לארכיון | Phase 5: the archive |
| `archiveRunning` | מעביר… | Phase 5: the archive |
| `archiveNone` | אין סגירות שמוכנות להעברה. | Phase 5: the archive |
| `archiveMoved` | הועברו לארכיון | Phase 5: the archive |
| `archiveStopped` | ההעברה נעצרה. מה שכבר הועבר נמצא בארכיון, ושום דבר לא אבד. אפשר לנסות שוב. | Phase 5: the archive |
| `archiveOffline` | אין חיבור לשרת. ההעברה נעשית רק כשיש חיבור. שום דבר לא השתנה. | Phase 5: the archive |
| `archiveDiffers` | הסגירה בשרת אינה זהה למה שבמכשיר הזה. היא נשארת ברישום. | Phase 5: the archive |
| `archiveCopyDiffers` | העותק שבארכיון אינו זהה לסגירה. היא נשארת ברישום. | Phase 5: the archive |
| `archiveServer` | השרת לא קיבל את ההעברה. שום דבר לא השתנה. נסה שוב. | Phase 5: the archive |
| `archiveBusy` | הרישום בשרת השתנה כמה פעמים בזמן ההעברה. נסה שוב בעוד רגע. | Phase 5: the archive |
| `whyOwed` | עוד לא שולם במלואו | Phase 5: the archive |
| `whyCorrected` | יש תיקון למקדמה שקוזזה בסגירה הזאת | Phase 5: the archive |
| `whyIrregular` | רישום ישן שאי אפשר להעביר | Phase 5: the archive |
| `closedWaiting` | במכשיר הזה חסר הפירוט של סגירות שכבר בארכיון. עד שהוא יירד מהשרת המכשיר לא מתעדכן, ואי אפשר לרשום ממנו סגירה או תשלום. זה קורה מעצמו כשיש חיבור. | Phase 5: a phone that lacks the detail |
| `closedBroken` | סגירה שבארכיון בשרת אינה שלמה. המכשיר הזה לא מתעדכן עד שזה ייבדק. הראה את המסך הזה למי שמתחזק את האפליקציה. | Phase 5: a phone that lacks the detail |

#### Proposed: one sentence per refusal code (47)

`closed` and `statement` share a sentence, as do `amount` and `delta`.

| code | sentence |
|---|---|
| `worker` | העובד לא נמצא ברשימה. |
| `stamp` | השעון או זיהוי המכשיר חסרים. פתח את האפליקציה מחדש. |
| `gate` | רישום סגירות חשבון לא פעיל במכשיר הזה. |
| `carry-approval-needed` | כדי לקזז רק חלק ממקדמה צריך לאשר פעם אחת שיתרת מקדמה עוברת לחשבון הבא. |
| `permission` | למשתמש הזה אין הרשאה לסגור חשבונות. |
| `inactive` | עוד לא נקבע יום תחילת המעקב. קבע אותו בעמוד החשבונות. |
| `before-tracking` | התקופה הזאת לפני יום תחילת המעקב. |
| `period` | התקופה אינה תקופת התשלום של העובד הזה. |
| `closed` | החשבון כבר נסגר. |
| `overlap` | התקופה חופפת לתקופה שכבר נסגרה לעובד הזה. |
| `statement` | החשבון כבר נסגר. |
| `conflict` | שני טלפונים רשמו סכומים שונים לעובד הזה. צריך לבדוק לפני שממשיכים. |
| `early` | אי אפשר לסגור לפני היום האחרון של התקופה. |
| `unpriced` | יש יום עבודה בלי תעריף. קבע תעריף לעובד ואז סגור. |
| `overpaid` | יש עודף בהחזרי המקדמות של העובד הזה. תקן קודם, ואז סגור. |
| `allocation` | הסכום אינו תקין. הכנס מספר, גם 0 אפשרי. |
| `allocation-missing` | לא נבחר סכום למקדמה הזאת. הכנס סכום, גם 0 אפשרי. |
| `over-advance` | אי אפשר לקזז יותר ממה שנשאר במקדמה. |
| `over-wage` | הניכויים גבוהים מהשכר של התקופה. |
| `deduction` | אי אפשר לקזז את הסכום הזה מהתקופה הזאת. |
| `clock` | השעון של הטלפון הזה מפגר אחרי תנועה שכבר רשומה בחשבון. תקן את השעון ונסה שוב. |
| `extra` | בניכוי נוסף חסר סכום או סיבה. |
| `paid` | סכום התשלום אינו תקין. |
| `overpay` | אי אפשר לרשום תשלום גבוה מהסכום לתשלום. |
| `unpaid` | צריך לרשום תשלום כדי לסגור. |
| `note` | ההערה ארוכה מדי. |
| `unsafe-id` | מזהה העובד אינו תקין. אי אפשר לרשום לו סגירה. |
| `rejected` | הרישום לא עבר בדיקה פנימית. לא נרשם דבר. |
| `target` | הרישום לא נמצא, או שכבר אין בו יתרה. |
| `payment-id` | הטופס נפתח לא נכון. סגור ופתח אותו שוב. |
| `amount` | הכנס סכום גדול מ־0. |
| `date` | התאריך אינו תקין, או שעוד לא הגיע. |
| `method` | בחר מזומן או העברה. |
| `reason` | חובה לכתוב סיבה. |
| `over-target` | אי אפשר לבטל יותר מהסכום שנרשם. |
| `voided` | הרישום הזה כבר בוטל. |
| `delta` | הכנס סכום גדול מ־0. |
| `below-zero` | התיקון יוריד את הסכום מתחת למה שכבר שולם. |
| `opened` | יום תחילת המעקב כבר נקבע. |
| `state` | בחר תשובה. |
| `due` | הסכום אינו תקין, או גבוה מהנטו של אותה סגירה. |
| `answered` | כבר נרשמה תשובה לסגירה הזאת. |
| `cycle` | העובד אינו במחזור הזה. |
| `twice` | העובד נבחר פעמיים. |
| `stale` | החשבון השתנה בזמן האישור. לא נשמר דבר. בדוק את הסכומים ואשר שוב. |
| `done` | כבר נרשם |
| `server-first` | רישום כזה נעשה רק מול השרת. |

In all: **242 proposed strings** (195 + 47), beside the owner's fourteen.

## Phase 3 — one debt, the server-first closure, and the split (v175)

**Development branch. Not served, not merged, on no phone; no real record was read. The
gate (`paybook`) is still `false`, and after this phase it still may not be opened** — see
[What is NOT built](#what-is-not-built-and-why-the-gate-stays-shut).

    node tests/debt.ruling.test.mjs            # A: the ruling, both builds side by side
    node tests/paybook.transact.test.mjs       # C: the server-first door, on the fake cloud
    node tests/paybook.split.test.mjs          # B: the model of the split, and capacity for 20 men
    npm run -s test:paybook-split-emulator     # the NEW rules, the production adapter, three older builds (needs Java)

### What the owner decided (2026-11-10)

His own answers; requirements from here on. The "defaults" of Phase 1 that he answered
are no longer defaults.

| question | decided |
|---|---|
| the live data today | the backup file is about 185 KB, about 20 active men |
| closed accounts leave the single document | **approved**, including a rules change he publishes by hand |
| the other team's «יום תשלום» screen | dropped; the pay book is the one system |
| a weekly man in the NEW list | his open week only (rule 1, as built) |
| the old «לפי עובד» report | not restructured; closed weeks are marked «נסגר» — a marking, Phase 4 |
| an earlier unclosed period | apart, as «ממתין לסגירה», never summed (rule 2, as built) |
| closing with nothing paid | yes (rule 3, as built) |
| closing before the period's last day | no (rule 4, as built) |
| deductions above the wage | no — capped, the debt carries (rule 5, as built) |
| an advance dated after the period's end | not offered in that closure (rule 6, as built; and since v175 the existing dialog obeys it too under the ruling) |
| an advance from a period nobody closed | **stays a full debt until somebody deducts it** — CHANGES EXISTING BEHAVIOUR; [section A](#a--one-debt) |
| an advance with no amount entered at closure | a missing answer, not a zero (as built: `allocation-missing`) |
| who may close and pay | all three accounts (rule 8, as built) |
| closures from before the pay book | a «payment unknown» list; he answers each (`planLegacy`, as built) |
| payment methods / deduction categories | cash, transfer / agreed, settlement, other (as built) |
| «העברת מקדמות לחשבון נמשך» (`cm_carry`) | "do what is best": the flow must never leave financial controls silently locked — [`carry-approval-needed`](#the-carry-approval) |

### A — one debt

**The rule.** An advance from a period that was never closed stays a full debt until a
person deducts it at a closure or the man hands it back. Before: the account walk settled
such a period by itself — `min(what he owed, what he earned)` came off inside the walk,
recorded nowhere — while `advanceOutstanding`, the per-advance fold every card and every
closure is judged by, had never heard of that deduction. One record, two answers, and the
later closure refused to deduct the very advance the card said was owed (Phase 1,
finding 1).

**Where.** `js/model/schema.js`: `advanceDebtStays()`, `advanceCarryInto` →
`advanceCarryIntoUnder(schedule, worker, from, stays)`, `advanceWalk(..., stays)`,
`advanceLiveRoom`. `js/model/ledger.js`: `planPeriodClosure` (the cap and the date filter).
A closed period is untouched: it reports its record. So the carry into any account is the
sum of what `advanceOutstanding` says was left on each advance the day before it opens —
checked on 60 seeded random records, 630 accounts and 284 closures, in `tests/debt.ruling.test.mjs`.

**It is behind the pay book's gate, and that is why there are not two calculators.**
`advanceDebtStays()` is `FARKAD_FLAGS.paybook === true`, read in one place; every reader —
the sheet, the statement, the existing dialog, the new planner — comes through
`advanceCarryInto`, so a build answers one way everywhere. **It ships with the gate's
opening and not before**: a build with the gate shut computes the old walk byte for byte
(asserted on a shut-gate device in every section of the suite), which is every build a
person has installed and this one as committed.

**Two things found while building it, both fixed and pinned.**

- *Closing out of order would have taken an advance twice.* Under the ruling a debt
  travels, so an EARLIER account can be closed after a later closure (or a later
  repayment) already settled the advance its balance is made of. Measured: 500 given in
  August and never closed, 300 of it deducted at September's closure, and August's own
  closure then offered the whole 500 again. `advanceLiveRoom` caps what an unclosed account
  may deduct by what is left on its advances TODAY; the entry's `balanceAfter` stays the
  figure the judge recomputes (as of that account's last day), so every phone accepts it.
- *The gate every financial control asks took over a second.* `planAdvanceCarry` walked on
  through four thousand empty fortnights while a debt stood — free while the old walk
  settled every debt out of the next wage, 1,415 ms a call (against 4) once a debt stands
  until somebody deducts it. It now stops at the last day anything on the record is dated;
  the rows are the same.

**A settled account never changes.** A closure's frozen figures — `carriedIn`, `gross`,
`deducted`, `carriedOut`, `net` — are the same bytes and the same numbers under both rules,
whenever it was closed. What moves on a CLOSED row is only what was never frozen: the money
the next account opens owing (`carriedForward`) — and with it `lateSinceClose`, which the
sheet words as «הגיעה תנועה אחרי סגירת התקופה». Under the ruling that note appears on an
old closure that has a never-closed advance behind it, and its sentence is then not true
(nothing arrived late; the rule moved). The figure beside it («חוב פתוח») is true. Pinned
as KNOWN; the wording is Phase 4's and the owner's.

**The dry run: `planDebtRuling(schedule, today?)`.** Writes nothing, returns
`changes: []`, says the same thing on either build. Per man: `advances` — one row per
(advance, never-closed period) with `assumed`, what the old walk silently took; `figures`
— every account figure that moves, old and new; `debt` — what the walk says he owes going
into his open account, old and new, beside `recorded`, the advances' own sum. On the
suite's fixture (Khaled: 500 in a fortnight he earned 700 in, 300 in one he earned 1,400
in, neither closed; the third closed by the old build with nothing deducted; today in the
fourth):

    advances   500 given 08-10, 500 left, assumed taken 500 in 08-07..08-20
               300 given 08-24, 300 left, assumed taken 300 in 08-21..09-03
    figures    08-07  deducted 500 → 0 · net 200 → 700 · carried forward 0 → 500
               08-21  carried in 0 → 500 · deducted 300 → 0 · net 1,100 → 1,400 · carried forward 0 → 800
               09-04  (closed) late-since-close 0 → 800 · carried forward 0 → 800
               09-18  carried in 0 → 800 · deducted 0 → 700 · net 700 → 0
    debt       as of 09-18: old 0, new 800, recorded 800

**The owner reads this report on his real record before the gate opens.** It is the list
of men whose open accounts will say they owe more than the sheet says today, and it is his
to say which of those fortnights were in fact settled by hand.

**Every expectation that moved, in the commit that moved it** (`tests/payroll.test.mjs`;
each carries the ruling and its date, and the old value is still asserted on a device
built as shipped):

| check (before) | was | is |
|---|---|---|
| Phase 0: «500 from a fortnight nobody closed is "500 left" to one fold and "nothing carried" to the other» | `[500, 0]` | HISTORY on a shut-gate device: `[500, 0]`; THE RULING: `[500, 500]` |
| Phase 0: «and the existing closure refuses to deduct it from a later wage» | refused, `deduction` | HISTORY: refused; THE RULING: closes, 300 off, 200 left |
| advances: «an advance from a fortnight nobody closed: 500 left on it, nothing the account walk will let come off» | `[false, ['deduction'], 500, 0]` | `[true, [], 500, 500]`, then 200 left / 200 carried / net 4,100 |
| advances: «the migration report names the disagreement instead of settling it» | one row, 500 against 0 | `[]` |
| refusal codes: «the account walk allowing less than was chosen» (150.01 of 500) | refused, `deduction` | HISTORY on a shut-gate device: refused, walk room 150; THE RULING: allowed, walk room 500 |
| refusal codes: «and exactly what the walk carries is allowed» | `[true, 150, 500]` | replaced by the line above |
| refusal codes: the vocabulary list | includes `deduction` | `deduction` joins `rejected`: produced by no input with the gate open |

Nothing else moved in A. **What moves when the gate opens** — measured by forcing the
ruling on in a scratch copy and running every node suite: `tests/repayment.test.mjs` 6
checks (an account that inherits what the one before could not cover: 1,800 → 5,000 where
the earlier account was never closed), `tests/ledger.truth.test.mjs` 1,
`tests/paycycle.completion.test.mjs` 1. Those are Phase 5's to move, with the gate, in one
commit. The browser suites were not run that way.

### The carry approval

`paybookGateReasons` answers three ways now: `gate` (this build does not write the pay
book, the ledger or the carry — nothing a person can do), `carry-approval-needed` (the
record's carry is needed and unapproved — the one shut gate a person can open), and
nothing. A refusal carrying the code also carries `carryApproval: { id, needed, approved,
rows }` (`paybookCarryApproval`), the rows being `planCarryMigration`'s own.

And a closure **may not lock the record behind itself**: `planClosure` builds the closure
on a copy, asks whether that copy would be locked (`paybookWouldLock`), and if so refuses
BEFORE anything is written, with the same code. `planCarryApproval(schedule, stamp)` is
the approval as a plan — one path, `ledger.migrations.cm_carry`, the record the existing
dialog writes; it is not a pay entry and goes by the ordinary path, after being laid into
the schedule. Phase 4 says one sentence and offers it there. **Recommended for Phase 5:**
approve the carry in the same step as the opening day, so the first partial deduction
never meets the question.

### C — the server-first closure

`js/sync/transact.js`: `FarkadSync.transactPaybook(plan)`. A closure, a payment, a void,
an adjustment, a legacy answer, the opening — each is ONE transaction of its own through
the production adapter (`transact` in `js/sync/firebase-adapter.js`), outside the ordinary
flush, and it writes the schedule's field paths, the operation's receipt and a create-once
closed document together or not at all.

| state | means |
|---|---|
| `closed` | the transaction committed, the closed document was read back from the server and is what was sent, the server's schedule carries every path, and this phone's own record has adopted them. The only state that means done. |
| `done` | the same fact was already on the server (a payment pressed twice). Nothing written. |
| `refused` | nothing was sent, or the server refused it whole: `offline`, `unsupported`, `restoring`, `unsent-work`, `pending`, `busy`, `plan`, `storage`, `server`. |
| `stale` | the account changed. The fresh document is adopted, nothing was written, `fresh` is the plan as it now stands (with its reasons — `closed`, `statement`, …). |
| `unknown` | it was sent and its fate is not known and cannot be asked right now. The intent stays; everything else is refused (`pending`) until it is settled. |

**The intent.** Before anything leaves, the operation is written to this phone's disk
under one key (`farkad:payIntent`): its name, its exact bytes, the revision it was aimed
at. It is not a queue — nothing ever sends it again. Its name is the idempotency key
(this device, the closed document's id, the exact entries), so a retry finds its own
receipt.

**Measured outcomes** (`tests/paybook.transact.test.mjs`, fake cloud; the emulator suite
repeats the ones marked E):

| case | what happens |
|---|---|
| the ordinary closure (E) | one write, one revision, one receipt, one closed document named for the statement holding exactly the plan's entries; no journal batch, nothing pending; the other phones — one with the writer off — hold the same book |
| no signal / no cloud / the server's document not heard yet | `refused: offline`; the disk is byte for byte what it was; nothing is sent when the signal returns |
| this phone holds unsent work | `refused: unsent-work` (and the queue is asked to drain); goes through once it has |
| the other phone closed it first, different choices (E, truly concurrent) | exactly one closed document, one statement, one receipt; the loser is `stale` with `closed`/`statement`, holds the winner's closure afterwards, no intent, nothing queued, nothing beside, not stopped; each advance reduced once |
| the same choices on both | the second is told it is already closed; one closure stands, the first signer's |
| the document moved for somebody else's reason | the same operation under the same name, re-aimed (up to three times) after the plan is judged again; a day recorded INSIDE the account is `stale`, with the fresh wage |
| a double tap | one operation; the second is `refused: busy` |
| the write landed and the answer was lost | settled by reading the receipt; `closed`; one write, never a second |
| the answer was lost and the server cannot be asked | `unknown`; another closure is `refused: pending`; at the next signal: `committed`, by looking |
| reloaded mid-flight, it had reached the server | found by its receipt at the next open, adopted, outcome `committed` |
| reloaded mid-flight, it died and the document moved | its revision is spent: outcome `nothing`, and the phone says so |
| reloaded mid-flight, still on the way | the revision it was aimed at is spent on purpose by one write that changes no business field; when the old request arrives it is refused; outcome `nothing`, and it stays true |
| a later payment; a void from the other phone | each one write and one closed document of its own |
| an intent that cannot be read | everything is `refused: pending`; the bytes are not deleted; resolving answers `unknown` |

Three things the emulator found that the fake cloud could not, all fixed: a lost revision
race arrives as `permission-denied` (the rules judge the loser's commit against a document
that already moved) and was answered «server» — it is now answered by looking; a read can
be a moment behind the commit it follows and was answered «unverified» — it is read again,
a bounded number of times, when it looks merely early; and adoption can trail the read by
a moment — the record is looked at again before anything is said.

**The ordinary queue never carries a pay path.** `FARKAD_FLAGS.paybookQueue` is `false` in
every build: `State.commitPaybook` answers `server-first`, and the queue's one minting
path refuses a `pay.` path whoever asks (asserted, with the cloud's whole write log
searched). The flag exists so that the Phase 2 suites — whose subject is two phones holding
different pay entries — can still produce that state; they open it by name
(`WRITER_ON` in `tests/paybook.world.mjs`).

**Protocol 2.** This build writes `protocol: 2` on every write. Nothing in the envelope
changed shape; the number is what the rules read.

### B — the split

**The design.**

- **Where:** `schedules/{doc}/closed/{id}`, one document per server-first OPERATION: a
  closure under its statement's id (`ps_<worker>_<from>`), a later payment, a void, an
  adjustment, a legacy answer or the opening under its own entry's id.
- **Why per operation, not per man per year:** a closed document is create-once — that is
  the server-side append-only the pay book has never had — and a per-year document would
  have to be updated. Two phones closing one man's one period aim at ONE document. A phone
  opening the app reads one document, as today; a closed document is read only when
  somebody opens that closure's detail, and never changes afterwards, so it can be kept.
- **What it holds:** `{ v: 1, id, kind, workerId, opId, revision, entries }`, `entries`
  being the operation's field paths and values VERBATIM — the frozen payslip with its day
  list, each `deducted` entry, the extras, the statement, the payment. No second
  description of a closure exists to drift from the first, and the closed documents laid
  back over a record that has dropped them rebuild it byte for byte (asserted on the
  fixture and on 30 random records).
- **When:** at the closure, in the same commit — never a later move. So for everything
  written through the new door there is no copy-verify-drop to interrupt: the copy exists
  from birth, bound to its schedule write by the rules from both sides.
- **The index** (`paybookIndexFrom`): one row per closed period per man, keyed by the
  closed document's id — whose and which period, the moment of closing, the wage it was
  closed on, the balance it opened and closed on, `[advance, amount, balance after]` per
  advance deducted, and where a statement stands the extras, the net, what is owed and
  what was paid. **It is enough** — on 30 seeded random records (360 statements, 90 old
  closures, 268 payments, 49 voids, 60 adjustments, 526 advances) the folds from the index
  (`paybookIndexFolds`) equal the folds from the whole history: every closed period's
  frozen figures (`closedPeriods`), what was deducted from every advance
  (`advanceOutstanding().deductedGross`), and every man's «יתרת שכר לתשלום», what is
  overpaid, each statement still owing and each closure with payment unknown
  (`accountFor`). It is derived, so it can be rebuilt from the closed documents.
- **Offline:** balances come from the index and never from the detail.
  `paybookDetail(schedule, closed, id)` answers `record` / `fetched` / `absent`; on
  `absent` the screen says the detail is not on this phone yet and shows NO day list
  rather than a live one.
- **Existing closures** (the ledger's `closed`/`deducted` entries written since v116) are
  bundles of the same shape: `planHistoryMove(schedule)` reports each — its paths, its
  bytes, whether it is SETTLED (a statement that still owes, an unanswered older closure
  and a disputed id are not, and nothing unsettled moves) — and the totals: bytes moving,
  the index's bytes, bytes freed, the document before and after. It writes nothing and
  nothing applies it.

**What is built of it.** The closed collection, its rules, the atomic copy at every
server-first operation, the read-back, the reader that judges a closed document
(`paybookClosedProblems`), `paybookDetail`, `planHistoryMove`, the index and its folds
with their proof.

### What is NOT built, and why the gate stays shut

1. **Nothing leaves the live document yet.** A closure written through the new door is in
   the closed collection AND still in the schedule. Dropping the live copy needs the folds
   to read the index — and every reader of the ledger (`closedPeriods`,
   `advanceOutstanding`, `advanceHistory`, the judge, the reports) reads the entry map
   directly. Teaching them is a change to the most protected arithmetic in the app and is
   a phase of its own; a version of it squeezed into this one would have been the weaker
   version. **So the capacity clock is not stopped**, and opening the gate today would
   fill the document in about seven months (below).
2. **The index is not stored.** It is derivable from the entries for as long as they are
   in the schedule, which is always, today. It must be written by the same transaction
   that drops an entry, never before.
3. **The index as designed is itself not bounded** — measured, below. Rows of settled
   closures older than some horizon have to fold into one per-man checkpoint.
4. **The days are still in the document, and they are the larger half.** See Capacity.
5. **Backups and the rescue file do not carry closed documents, and a restore does not
   re-create them.** While nothing has left the schedule a backup is complete without
   them, by construction. Decided, not built: the backup file gains `closed: { id: doc }`
   for every closed document the phone can fetch (and says how many it could not); a
   restore never deletes or rewrites a closed document (the rules make that impossible)
   and unions; a restore into an EMPTY project re-creates them in the restore's own commit.
   **Under the new rules a whole-document write that would ADD pay entries is refused
   unless it creates a closed document in the same commit** — so until that is built, a
   pay book cannot be restored into a new project. With the gate shut there is none.
6. **Moving existing history** — Phase 5, after every phone reads the index.
7. **No screen.** Phase 4.

### The rules, as a file

`firestore.rules` ON THIS BRANCH is the tested artifact; nothing was published and nothing
here can publish. `docs/firestore.rules.before-paybook` is the rules as main carries them,
byte for byte (asserted against `git show 8c943fa:firestore.rules`) — **the rollback
artifact.**

The difference, in words:

- **A write that changes the `pay` map** must speak protocol 2, may only ADD entries
  (none removed, none changed), and must create in the same commit the closed document it
  names in `closedId`, which must name this operation and this revision. An absent map
  and an empty one are the same thing. A write that does not change the map is judged
  exactly as before — which is every write of a phone that has not updated.
- **`closed/{id}`**: readable and creatable only by the allowlist; created only in the
  commit that takes the schedule to the revision it names, pointing at the operation it
  names, at protocol 2; never updated, never deleted, by anyone.
- Everything else is untouched: `tests/rules.test.mjs`, `rollout*`, `bootstrap*`,
  `cas.emulator`, `money.concurrency` are green unchanged, except two pins in
  `tests/bootstrap.emulator.test.mjs` that read `protocol === 1` and now read 2.

**Server-enforced:** the three above. **Not server-enforced** (the rules cannot loop):
that the closed document's `entries` are exactly the paths the schedule gained; that a
whole-document write adding several entries has a closed copy for each. Those are the
client's, and pinned in the suites.

`tests/paybook.emulator.test.mjs` (Phase 2) now loads `docs/firestore.rules.before-paybook`
by name: its subject is what the ordinary queue does to a closure under the PUBLISHED
rules, and the new rules refuse that path outright.

### The rollout order, measured

`tests/paybook.split.emulator.test.mjs`: v167 (`a25566f`), v171 (`0acaceb`) and v172
(`8c943fa`) — their own files and their own adapter, out of Git — and this build, under
the rules of today and the new ones, with and without a pay book on the document. All
three older builds answer every question the same way.

| client | rules | document | records a day | restores | closes an account |
|---|---|---|---|---|---|
| older | new | no pay book (today's) | **yes** | **yes** | — |
| older | new | with a pay book | **yes**, pay book unchanged | **REFUSED** — pay book and revision exactly where they were; the phone says `error`, not synced; days it records afterwards wait on that phone behind the refused restore until it is updated | — |
| older | today's | with a pay book | yes | **accepted, and the pay book is GONE** | — |
| this build | today's | either | **yes** (protocol 2 is accepted) | yes | **REFUSED whole** — no `closed/` in those rules; nothing queued, nothing in doubt |
| this build | new | no pay book | **yes** | **yes** | — |
| this build | new | with a pay book | yes | yes | **yes** — one commit, three documents |

So the order that never leaves a working phone refused or a pay book erasable:

1. **Save the published rules.** Firebase console → Firestore Database → Rules: copy what
   is there into a file and compare it with `docs/firestore.rules.before-paybook`. If they
   differ, stop — the artifact in this repository is not what is live.
2. **Publish the new rules** (paste `firestore.rules` → Publish). No phone needs to update
   first and none is refused: an older build records and restores exactly as before, and
   there is no pay book for it to touch.
3. **Update the phones**, in any order. This build records and restores under either
   rules.
4. **Check each phone in ⋯** — not assumed. A phone still on an older build keeps working.
5. **Only then open the gate** (a later build, Phase 5). From the first pay entry on, an
   older build's restore is refused by the server instead of erasing; that phone shows an
   error and must be updated before it is used again.

**The wrong order is the one that loses money, and it is measured too:** a pay book on the
server under the rules of today is erased by any older build's restore. And a closure
cannot land before step 2 — the rules of today refuse it whole — so the gate cannot be
opened early by accident.

**Rolling back** (republishing `docs/firestore.rules.before-paybook`): safe while no pay
entry exists. After the first one it reopens the door above; closed documents stay where
they are but become unreadable to the app (no rule matches them) until the new rules
return.

### Capacity, for 20 men

`tests/paybook.split.test.mjs`, the method of Phase 2: every entry produced by the shipped
writers, a year built from them, and the DOCUMENT weighed by Firestore's count. Six days a
week; one man in four takes an advance each fortnight; every closure has a statement and
one payment. Entry sizes (JSON bytes): a worker-day 65; an advance 105 and its ledger
origin 198; a closed week's payslip 929, its deduction entry 975; a fortnight's 1,413 and
1,459; a statement about 490, a payment 189; **an index row 176**.

| 20 men | year 1 | year 2 | year 3 | year 4 | year 5 | a week | full, from today's 185 KB |
|---|---|---|---|---|---|---|---|
| days and advances only, nobody closes | 415 KB (41%) | 825 KB (81%) | 1,235 KB | 1,645 KB | 2,055 KB | 8,073 B | **2.0 years** |
| closed every fortnight, IN the live document | 1,468 KB (143%) | 2,931 KB | 4,394 KB | 5,858 KB | 7,321 KB | 28,811 B | **0.6 years** |
| closed every week, IN the live document | 1,945 KB (190%) | 3,883 KB | 5,822 KB | 7,760 KB | 9,699 KB | 38,176 B | **0.4 years** |
| closed every fortnight, WITH THE SPLIT | 502 KB (49%) | 999 KB (98%) | 1,496 KB | 1,993 KB | 2,490 KB | 9,786 B | **1.7 years** |
| closed every week, WITH THE SPLIT | 586 KB (57%) | 1,166 KB | 1,747 KB | 2,327 KB | 2,907 KB | 11,426 B | **1.4 years** |

Read it this way:

- **The split works for what it was approved for.** A week of closing weighs under a third
  of what it weighs in the live document; closing every fortnight then costs under a
  quarter more than never closing at all.
- **It does not bound the document, and nothing here says it does.** With the split the
  document still fills in about a year and a half — because the DAYS are in it (1,863 KB
  after five years, by themselves) and because the index, one row per closure, is itself
  435 KB after five years closed fortnightly and 851 KB closed weekly.
- **So two more things have to leave before "bounded" is true**, and both are the same
  mechanism (create-once documents, an index of what left, copy at birth or verified
  copy-then-drop): settled index rows older than a horizon folded into a per-man
  checkpoint, and the days of months that are closed for everybody and older than a
  horizon moved to a document per month. With both, the live document is the open items
  and the recent months. Neither is designed in detail and neither is built.
- **The owner's document is about a fifth full today and nobody is closing with the pay
  book.** On days alone it has about two years.

### What Phase 4 (the UI) must do

- Call `FarkadSync.transactPaybook(plan)` and nothing else for a pay entry; show `closed`
  only on `state: 'closed'`; on `stale` redraw from `fresh`; on `unknown` say that the
  closure is waiting to be confirmed and block; on open, read `FarkadSync.payOutcome()` and
  say what became of an interrupted closure, then `acknowledgePayOutcome()`.
- On `carry-approval-needed`: one plain sentence, the rows, and the approval right there
  (`planCarryApproval`, laid into the schedule and committed by `State.commitMany`).
- On `paybookDetail(...).state === 'absent'`: say the detail is not on this phone; fetch it
  with the adapter's `readClosed` when there is signal; never show a live day list in its
  place.
- Word the closed row's «late since close» note for the ruling (see A), and every refusal
  of `payTransactRefusal` (`offline`, `unsent-work`, `pending`, `busy`, `restoring`).
- Mark closed weeks «נסגר» on «לפי עובד»; retire or keep the old «סגור את החשבון» dialog —
  it works under the ruling, but it writes no statement and goes through the queue.
- A way to see and settle a pay-book disagreement (unchanged from Phase 2's list).

### What Phase 5 (activation) must do

1. Build what is listed under [What is NOT built](#what-is-not-built-and-why-the-gate-stays-shut),
   items 1–5, and re-measure Capacity.
2. The owner reads `planDebtRuling` on his real record, and `planPayMigration` and
   `planHistoryMove` beside it.
3. The rollout order above, steps 1–4.
4. One commit: `paybook: true`, with the eight expectations the ruling moves in
   `repayment`, `ledger.truth` and `paycycle.completion`, and the browser suites re-run.
5. The opening day (`planOpening`) and the carry approval in one step; then the «payment
   unknown» list, one answer at a time (`planLegacy`).
6. Moving existing history, bundle by bundle, settled ones only: create the closed
   document, read it back, compare byte for byte, and only then — in a transaction that
   also writes the index row — drop the live entries. Every step re-runnable; an
   interrupted move leaves a copy and never a hole.

## Phase 2 — storage and sync, as built (v173)

### The three findings to read first

1. **The document is on a clock, and closures are what wind it.** The whole schedule is one
   Firestore document, and Firestore refuses a document over 1,048,576 bytes — measured on
   the emulator (`maximum entity size is 1048576 bytes`), not assumed. A closure as the app
   writes it TODAY costs about 0.9 KB for a week and 1.4 KB for a fortnight per man (the
   frozen payslip), plus the same again for each advance it touches; a statement and its
   payment add about 0.7 KB. Numbers in [Capacity](#capacity). For fourteen men closed
   every fortnight the document is full after about a year with the pay book and about
   fifteen months without it; for thirty men, in months. **The pay book must not be opened
   on the single document as it is.** The split is proposed below and is not built.
2. **A closure is not all-or-nothing on the wire.** It is one transaction when it fits and
   is held whole when one of its paths is contested — and it is cut in two by the 296-path
   limit when a long queue is ahead of it. Measured; see [On the wire](#on-the-wire).
3. **A phone that has not updated can erase the pay book** — from the cloud with any
   restore, and from a disk it shares with a newer window. Measured on v167, v169 and v171;
   see [The rollout rule](#the-rollout-rule).

### The stored shape

    schedule.pay                    { "<id>": entry }   one field path per entry: pay.<id>
    schedule.payConflicted          { "<id>": [entry, …] }   the other side(s) of a disagreement; absent when empty
    schedule.payUnreadableContainer { pay?: …, payConflicted?: … }   bytes of a container that was not a record; absent normally

`emptySchedule()` names `pay`, because `normaliseSchedule` starts from it and keeps only
what it names — which is exactly why every older build drops the map from its own copy.

- **Created once, never rewritten, never removed.** `journalEntryProblems` accepts
  `pay.<id>` with exactly two segments and a value `payEntryProblems` accepts; a null is «a
  pay entry cannot be deleted». `payConflicted.*` is not a path at all: what is kept beside
  an entry is never sent on its own.
- **An entry stays where it lies, readable or not.** The ledger moves an entry it cannot
  fold into `ledger.unreadable`; a whole-document write from that phone then carries it
  under another name. Here it stays at `pay.<id>` on the disk, in memory and on the wire,
  and what keeps it out of the arithmetic is the fold (`paybookFold(...).held`).
- **Three doors refuse a rewrite**, each for the callers the one before it cannot see:
  `State.commitPaybook` (asks the record as it is now, answers with a reason, refuses the
  whole batch), the queue's one minting path `queueOperations` (asks the disk and the
  queue; a batch that got round the first door is not written), and the queue's reader (a
  batch on the disk carrying `pay.<id>: null` is not a queue this app wrote).
- **The same fact twice is one fact.** Same id, same content, another `at`/`by`/`rev`/
  `wageDueBefore` (`paybookSameFact`): nothing is written, the first signer stands, and a
  queued copy is acknowledged against the server's without replacing it
  (`ledgerPathSupersededBy` learned the `pay.` family).

### The commit

`State.commitPaybook(changes)` is the one door a pay entry is written by: a plan's
`changes` — the closure artifact, its `deducted` entries and the `pay.*` entries — as ONE
journal batch, journal first, through `commitMany`. It returns
`{ ok, reasons, written, same, kept }`. `reasons` is `gate` (this build, or this record's
financial gate), `rejected` (a null, a path that is not an entry, one path twice, an empty
batch), `conflict` (an id that already says something else, or is in dispute), or
`unwritten` (the journal or the record refused; `commitMany` has said so in its own words,
and `kept: true` means the journal HOLDS the batch and only the record write failed).

Pinned in `tests/paybook.store.test.mjs`: one journal record of six operations; a reopen
that reads back the same bytes and the same fold; a death between the journal and the
record rebuilt from the journal; a journal the disk refuses rolling memory back with the
app's own «הרישום לא נשמר» said once.

### The conflict rule

**One id, two different bodies: both are kept, the copy the cloud holds stands, and the
phone is not stopped.**

| | what happens |
|---|---|
| which copy stands | `paybookUnion(standing, other)`: the caller names who outranks. `receive()`: the cloud over this phone. `prepareReplace`: what is live over what is being restored. `absorbCloudLedger`: the cloud over the restore's envelope. So every phone that has heard the cloud folds the SAME entry under a disputed id. |
| where the other goes | `payConflicted[<id>]`, verbatim, on the record — across saves, reopens, backups, the rescue file, and inside any whole-document write. |
| what is held | (1) The loser's queued write: `pay.` is a `replacesWhole` family, so the pre-send pass and the conflict branch hold it by name — and its whole batch with it — and it is listed in ⋯ in the ledger's existing words («רישום כספי שהענן מחזיק אחרת. נשמר כאן ואינו נשלח; אין לו פתרון מהמסך הזה.»). (2) Every pay planner for the man the id belongs to: `conflict`. His account reads `review`. (3) `commitPaybook` for that id, from either side. |
| what is NOT held | The phone. No Recovery problem, no banner, writing not blocked: days, roster, advances and every other man's account go on. |

**Why narrower than the ledger's.** A ledger disagreement stops the phone through Recovery
because the losing phone keeps ITS OWN figure in the fold (the queue lays it back over the
adopted snapshot), so its screens would price a man differently from the other two. The pay
book does the opposite — the journal's replay never lays a queued body over one that stands
(`layPaybookEntry`) — so nothing on the losing phone is computed from the disputed figure.
Both bodies are readable and on the record; nothing can be lost by recording tonight's
days beside them. Stopping the phone would buy nothing and cost the evening.

**What is not weakened.** A closure whose DEDUCTIONS differ between two phones is a ledger
disagreement (`le_close_*`) as well, and that still stops the losing phone through Recovery
exactly as before — measured on the fake cloud (P4) and the emulator (A4), with the cloud
left entry for entry the winner's and no double deduction. The pay book's rule applies to
what only the pay book holds: a different paid amount, a different extra deduction.

**What it does not yet do.** Nothing in this phase lets a person SETTLE a disagreement;
the held write stays held and the status line stays «contested» on that phone until a later
phase gives it a screen. A disagreement that arrives with no queued write behind it (from a
restore, say) is on the record and in the fold and on no screen at all yet.

### Unreadable entries (iron law 10)

An entry `payEntryProblems` refuses — a kind from a build that does not exist yet, a sum
that is text, a null — is **kept at `pay.<id>` exactly as it arrived**, copied by Recovery
under `scheduleData:v2:pay` (the rescue file carries the copy under its own name), and
**all writing stops until the person has been told**, as for an unreadable ledger entry.
After «הבנתי» writing resumes with the entry still in place, and the next open says it
again. A `pay` that is not a record at all reads as an empty book, its bytes are carried
under `payUnreadableContainer` and quarantined under `scheduleData:v2:pay:container`, and a
replacement door refuses such a file in its own sentence. A poison name (`__proto__`,
`constructor`, `prototype`) under `pay` or `payConflicted` is the existing
`poisonedContainers` hold, extended to the two maps.

A payment that arrived before its statement is NOT unreadable: it is the ordinary order of
two field paths, it is held by the fold and stops nothing.

### The restore rule

**A restore never removes or rewrites a pay entry.** It replaces the work record — days,
roster — and unions the pay book in, exactly as it has always done for the advances ledger
(`features/restore-ledger/contract.md`), at the same two moments:

- `prepareReplace`: the live book is unioned into the envelope; where one id holds two
  bodies **what is live stands** and the file's is kept beside it.
- `absorbCloudLedger`, in the same turn as the write: the cloud's book is unioned in again,
  so a payment another phone recorded while the restore was waiting is not erased;
  **the cloud's copy stands.**

So a backup written before the pay book, an old restore point and a cloud copy from a
not-updated phone all restore as «no pay entries in that file», and every entry this phone
or the cloud holds stays. `localDurableHolds` compares `pay` and `payConflicted` too. The
four confirmations gain one sentence — only on a phone that holds a pay entry, so with the
writer shut they read exactly as they did: « סגירות חשבון ותשלומים שכבר נרשמו אינם נמחקים
בשחזור - הם נשארים רשומים.» (proposed wording).

This holds for a restore made BY THIS BUILD. A restore from an older build is the hazard in
the next section.

### The gate

`paybook: false` in `FARKAD_SHIPPED_FLAGS` (`js/model/schema.js`), read through
`paybookWritesEnabled()`. Off: the planners answer `gate`, `commitPaybook` answers `gate`,
and nothing else in the app calls either. NOT behind the gate, deliberately: reading,
folding, keeping across a save, merging, backing up, restoring and re-sending a queue that
holds one. The journal's grammar accepts `pay.<id>` whatever the gate says — a phone handed
a queue with one in it must still be able to read its own queue. It is not `ledgerWrites`:
the existing closure's ledger entries are written today by every phone.

### On the wire

Measured in `tests/paybook.sync.test.mjs` (P10) and against the production adapter
(`tests/paybook.emulator.test.mjs`, A1–A5):

| case | what happens |
|---|---|
| the ordinary closure | ONE update, one revision, one receipt: every path or none. |
| a path of it is contested before sending | the batch is held WHOLE; a sibling path that collides with nothing is never sent on its own. |
| the server refuses it on its revision and a path has moved | nothing of it is applied; the path is held, and the batch with it. |
| the server refuses it and nothing has moved | rebased and sent whole. |
| a retry after a lost answer | answered from its receipt, or settled as the same fact; one entry. |
| **more than 296 paths are queued ahead of it** | **the closure is CUT: one write carries the frozen payslip and the deductions, the next the statement and the payment.** Between the two every other phone reads a closure with no payment recorded («payment unknown»), the advances already reduced. If the second write never lands, that is where it stays. |

So: **no** — a multi-path closure is not all-or-nothing on the wire. It is by construction
only while it fits in one write. Phase 3's server-first transaction has to carry a closure
as exactly one transaction of its own, outside the ordinary flush.

Also measured, and pre-existing: a phone whose whole batch is settled against the server's
copy (the second of two identical closures, or a retry that finds its own write there)
sends nothing — and its status line is left at «שולח» or at the failure until the next
snapshot, over an empty queue. The existing ledger-only closure does the same on v171. It
is in `js/sync/send.js`, which this phase does not change; pinned as «TODAY» in P2 and P8.

### What the unchanged rules do

`firestore.rules` was not edited. On the emulator, with the file as it stands:

- an account on the allowlist: an update adding `pay.<id>` paths with the protocol envelope
  and its receipt is **accepted**;
- a signed-in account not on the list, and nobody at all: **refused** (and may not read);
- a write with no protocol, or at a stale revision: **refused**.

And what they do **not** refuse, pinned as «TODAY»: an allowlisted account may REWRITE an
existing pay entry, DELETE one, and write a whole document with no `pay` at all. The rules
look at who writes, at the envelope and at the receipt, and at nothing inside the document.
Append-only is kept by this build's client and by nothing else — an older build is not
bound by it, which is the next section.

### The rollout rule

Derived from `tests/paybook.oldbuilds.test.mjs`: v167 (`a25566f`), v169 (`bd59a68`) and
v171 (`0acaceb`), each built out of Git and run beside this build. All three answer every
question the same way.

| question | measured |
|---|---|
| does it keep working with `pay` on the cloud document? | yes: synced, not blocked, no Recovery problem |
| what does its own copy hold? | no `pay` at all — dropped from memory and from its disk |
| does it see the closure? | yes: the artifact and the `deducted` entries are ledger entries it reads; it refuses to close that period again |
| does an ordinary write of its remove `pay` from the cloud? | **no** — a day, and a closure made its own way, go out as field paths; the cloud's pay book is byte for byte unchanged |
| its backup file, its rescue file | no `pay` |
| its own closure (no statement) on an updated phone | a closure with payment unknown |
| **a restore from it — any door** | **erases `pay` from the cloud.** Updated phones keep their copies; nothing puts them back; a phone installing afterwards never learns of them. A restore from an UPDATED phone that holds them puts the whole book back. |
| **its window open beside a window of this build, on one disk** | **its next save writes the record without `pay`, and this build's own window then loses the book from memory too.** With a cloud, the next snapshot gives it all back (it is not read as an echo — `paybookCovers`). With no cloud, entries still in the journal are rebuilt from it and an entry that was only on the record is gone. If the queue holds an unsent pay path the old window cannot read that batch and is held by Recovery before it writes. |
| when it updates | its first snapshot gives it the whole pay book at once |

**THE ROLLOUT RULE.** Before the first pay entry is ever written — that is, before
`paybook` is opened on any phone:

1. **Every phone is on v173 or later**, checked on each phone in ⋯, not assumed.
2. **From the first pay entry on, no backup, restore point, cloud copy or rescue file is
   restored from a phone on an older build** — and a file written BY an older build
   carries no pay book, so restoring one on an updated phone is safe only because this
   build unions (the restore rule above).
3. **No window of an older build stays open beside a new one.** The app's own catch-up
   (law 7) reloads the other window; until it has, that window must not be recorded in.
4. A phone that turns up later on an older build is updated before it is used. Its
   ordinary recording harms nothing; its restore buttons do.

It is a rule, and a rule is a promise. What makes it enforced is the rules change Phase 3
needs anyway (`protocol >= 2`, so an older build's writes are refused outright).

### Capacity

`tests/paybook.store.test.mjs` builds the entries with the shipped writers, lays a year of
them into a document and weighs the DOCUMENT by Firestore's count. Six days a week; one
closure in four touches an advance. Entry sizes (JSON bytes): a worker-day 65; a closed
week's payslip 941, its deduction entry 983; a closed fortnight's 1,437 and 1,478; a
statement about 510, a payment about 190.

| crew | scenario | after 52 weeks | 50% of 1 MiB | 100% of 1 MiB |
|---|---|---|---|---|
| 14 | days only, nobody ever closed | 273 KB (26%) | week 100 | week 202 (3.9 y) |
| 14 | closed every fortnight, as written TODAY | 844 KB (80%) | week 32 | week 65 (1.2 y) |
| 14 | closed every fortnight, + statement and payment | 1,050 KB (100%) | week 26 | week 52 (1.0 y) |
| 14 | closed every week, as written TODAY | 1,071 KB (102%) | week 25 | week 51 |
| 14 | closed every week, + statement and payment | 1,482 KB (141%) | week 18 | week 37 |
| 30 | days only, nobody ever closed | 577 KB (55%) | week 47 | week 95 (1.8 y) |
| 30 | closed every fortnight, as written TODAY | 1,781 KB (170%) | week 15 | week 31 |
| 30 | closed every fortnight, + statement and payment | 2,222 KB (212%) | week 12 | week 24 |
| 30 | closed every week, as written TODAY | 2,259 KB (215%) | week 12 | week 24 |
| 30 | closed every week, + statement and payment | 3,138 KB (299%) | week 9 | week 17 |

Read it this way:

- **The pay book is the smaller half** of what a closure adds — in every scenario it weighs
  less than the ledger entries beside it — but it brings the day the document is full
  forward by at least a sixth.
- **The existing closure is the heavy part, and it is already shipped and on.** A frozen
  payslip with its day list, copied whole into every `deducted` entry. Whoever closes
  accounts regularly TODAY is spending this budget now.
- **Days alone fill it too**, in about four years for fourteen men and under two for thirty.
- A full document is not a slow one: every write to it is refused, on all three phones at
  once. One copy on the phone is a separate limit (5 MiB, with up to seven more copies in
  restore points and the way back): 30 men closed weekly with the pay book is 7.2 MB a copy.
- **Not known from here: how big the real document is today, and the real crew.** Both are
  the owner's to say; the first is one read of the live document's size.

(Superseded by Phase 3: the owner answered both - about 185 KB, about 20 men - and the
figures for that crew, with and without the split, are in [Capacity, for 20
men](#capacity-for-20-men). The split below is now designed and partly built; see
[B — the split](#b--the-split).)

**The split, as it was proposed at Phase 2.** Closed history leaves the live document: one
document per closed period (or per man per year) in a subcollection —
`schedules/current/closed/<worker>_<from>` — holding the frozen payslip, its `deducted`
entries, the statement and its payments, created once and never updated (the `history`
rule's shape: `allow create`, never update or delete — which is also the server-side
append-only the pay book lacks). The live document keeps open periods, balances and a
small index. It needs a rules change, a migration that is a copy and never a move, and a
reader on every phone — a phase of its own, before the gate opens.

### Hebrew added in this phase

All **proposed**; none is the owner's wording yet. Four of the five can only be seen on a
phone that holds a pay entry or an unreadable pay record, which with the writer shut is no
phone.

| string | where |
|---|---|
| חלק מרישום סגירות החשבון והתשלומים לא נקרא. הנתונים נשמרו כמו שהם ולא נמחק דבר, אבל אי אפשר לרשום עוד עד שתייצא גיבוי - כדי שלא ייחשב סכום שלא הצלחנו לקרוא. | Recovery, an unreadable pay entry |
| רישום סגירות החשבון אינו בצורה שאפשר לקרוא. שום דבר לא נמחק - הנתונים נשמרו כמו שהם - אבל אי אפשר לרשום עוד עד שתייצא גיבוי, כדי שלא ייכתב רישום ריק מעליו. | Recovery, a `pay` that is not a record |
| רישום סגירות החשבון בקובץ אינו בצורה שאפשר לקרוא. | a replacement refused for that |
| סגירות חשבון ותשלומים שכבר נרשמו אינם נמחקים בשחזור - הם נשארים רשומים. | the four restore confirmations |
| רישום סגירת חשבון <id>: לא נקרא | a rescue rebuild that lost a pay entry |

## The owner's rules, and where each one lives

| rule | where |
|---|---|
| One wage calculator | No wage is computed in `payroll.js`. Every figure is `payrollReport`'s row over a period `periodRangeFor` names (`paybookPeriodWage`); a closed period is the artifact `payrollReport` already reads. |
| A weekly man's running account is his open week only | `accountFor(...).running` is the wage of **his own** current period, and 0 once that period is closed. |
| Earlier unclosed periods apart | `accountFor(...).pending` — one row each, never added to `running` or to each other (default 2). |
| Unpaid wage from an earlier closure is its own balance | `accountFor(...).wageDue` and `.unpaid` — «יתרת שכר לתשלום». |
| Advance debt and wage owed: two balances, never netted | `.debt` and `.wageDue` are two fields. No field holds their difference, and the suite checks that none does. |
| The person chooses per advance | `planClosure(..., { allocations: { advanceId: amount } })`. An advance with no answer is a missing answer (`allocation-missing`), not a zero. |
| Never more than is left; never twice | `over-advance`; deterministic ids; `closed` / `statement`; a statement naming one advance twice is refused by its validator. |
| A new advance is never a wage payment | Nothing reads an advance when folding what was paid. Pinned: 1,000 handed over as an advance leaves 3,700 of wage owed and unpaid. |
| Closure never erases debt | What is left stays on the advance (`advanceOutstanding`) and opens the next account (`advanceCarryInto`). |
| Extra deductions | Their own entry kind (`deduction`): amount, reason, date, worker, statement. Never touch an advance. |
| Closure and payment are two facts | `statement` and `payment` are two entries. A payment never edits a statement. |
| Reset deletes nothing; corrections are linked | Append-only; `void` (`pv_<target>`) and `adjustment` (`pa_<statement>_<n>`) stand beside what they correct, reason mandatory. An advance deduction is undone through the ledger's existing `recordEventReversed`, which the fold reads. |
| No destructive migration; ambiguous history to a review list | `planPayMigration` writes nothing. Older closures are `paymentUnknown` until a person answers for one (`planLegacy`). |

## The eight defaults

All in one frozen object at the top of the file, `PAYBOOK_RULES`. Each is one line; the
suite loads the file with each line flipped and shows the behaviour follows.

| # | constant | default | flipped |
|---|---|---|---|
| 1 | `legacyReportFollowsAccounts` | `false` — the weekly-only-open-week rule applies to the new accounts functions; «לפי עובד» is unchanged | **Read by nothing in this phase.** It is the name of the decision; the reports change (Phase 2) reads it. The present behaviour of that report is pinned in Phase 0 of the suite: 3,800. |
| 2 | `earlierUnclosedSummed` | `false` — listed apart as waiting | `running` becomes the sum (the 3,800 again) |
| 3 | `closeWithNothingPaid` | `true` | a closure that names no payment is refused: `unpaid` |
| 4 | `closeBeforeLastDay` | `false` | no `early` refusal |
| 5 | `deductionsMayExceedWage` | `false` — capped, the debt carries | the net may go below zero |
| 6 | `offerLaterDatedAdvances` | `false` — shown, not offered | offered — but **not one line**: `advanceWalk` counts a period from what is dated inside it, so the plan is then refused with `deduction` until `js/model/schema.js` learns the same rule |
| 7 | `trackingFromActivationPeriod` | `true` — tracking starts at each man's period containing the activation day | all history is tracked and no activation is needed |
| 8 | `whoMayClose` | `null` — every account on the allowlist | a list of signers; others get `permission` (client only — a server role is a rules change) |
| + | `unlistedAdvanceMeansZero` | `false` | an advance the person did not answer for is deducted 0. Not one of the eight; it differs from the design note, so it has a name. |

## Data model

A closure stays what it is today. The artifact `ledger.advances.le_period_<worker>_<from>`
and one `ledger.advances.le_close_<advance>_<from>` per advance touched are built by the
existing writers (`recordPeriodArtifact`, `recordPeriodClosed`) on a **copy** of the
schedule. For an oldest-first split the ledger half of a plan is byte for byte what
`closePeriodChanges` writes today (pinned), and today's journal, validators and a reopen
accept a per-advance split (pinned, through `State.commitMany`).

Everything new is one append-only map at the top of the document, one field path per entry:

    schedule.pay = { "<id>": entry }          path: pay.<id>

Common fields: `id`, `kind`, `date` (local day), `at` (ISO moment), `by` (signer), optional
`rev`. Every kind but `opening` carries `workerId`. A field not on the kind's list refuses
the entry — the bar is "this build could have written it".

| kind | id | fields beyond the common ones |
|---|---|---|
| `statement` | `ps_<worker>_<YYYYMMDD from>` | `cycle`, `transition`, `periodFrom`, `periodTo`, `date` = `periodTo`, `artifactId`, `gross` (copied from the artifact), `advanceDeductions [{advanceId, entryId, amount, before, after}]`, `advanceDeducted`, `extraIds`, `extraDeducted`, `netDue`, `wageDueBefore` (information), `debtAfter` (= the artifact's `balanceAfter`), `note?` |
| `deduction` | `pd_<worker>_<YYYYMMDD from>_<n>` | `statementId`, `amount` > 0, `category` (`agreed` / `settlement` / `other`), `reason` (mandatory) |
| `payment` | `pp_<statementId>` for the payment made at the closing; `pp_<random>` for every later one | `statementId` (a statement, or a legacy answer that said "owed"), `amount` > 0, `method?` (`cash` / `transfer`; absent is absent), `note?` |
| `void` | `pv_<targetId>` | `targetId`, `targetKind` (`payment` / `deduction`), `statementId`, `amount` ≤ the target's, `reason` (mandatory) |
| `adjustment` | `pa_<statementId>_<n>` | `statementId`, `delta` (signed, non-zero), `reason` (mandatory) |
| `opening` | `po_open` | `date` — the activation day |
| `legacy` | `pl_<artifactId>` | `artifactId`, `state` (`paid` / `due`), `due` (only when owed; ≤ that closure's net), `note?` |

Amounts are JSON numbers, finite, never negative, at most `ADVANCE_MAX`, and a whole number
of agorot (the same 1e-6 tolerance `advanceAmountProblems` uses). Nothing is coerced:
`"500"` is refused. Every id passes `isSafeId` — `__proto__`, `constructor`, `prototype`,
dots and Firestore's metacharacters are refused before anything is keyed on them.

**Ids are the idempotency keys.** A statement's id is its man and its period's first day,
exactly as the artifact's is, so two phones closing one account write one path. The
payment made at the closing is derived from the statement for the same reason: with a
random id, two phones each closing with «שולם הכול» would record one envelope twice. A
later payment's id is minted by `newPaymentId()` when the form opens, so a double tap, a
retry and a reload carry one id.

**Same fact, or a disagreement.** `paybookSameFact` compares two bodies under one id
without `at`, `by`, `rev` and `wageDueBefore`. Equal: one fact, the first writer stands.
Different: the first still stands and the other is kept under `payConflicted[<id>]` for a
person. Nothing is merged and nothing is chosen between.

## The folds

`paybookFold(schedule)` reads the map once, independent of arrival order:

- entries that fail `payEntryProblems` are **held** (id + reason), never dropped;
- a statement is judged against the record (`paybookStatementProblems`): its artifact is
  there with the same period and gross, each advance deduction is on the ledger with the
  same amount, the ledger holds no deduction for that period the statement omits, every
  extra it names exists and they add up. A statement that fails is held, not folded;
- a deduction no standing statement names, a payment or adjustment whose statement is not
  standing, and a void of nothing are held — a payment that arrived before its statement
  waits there and folds when the statement lands;
- per statement: `owed = netDue + adjustments + voided extra deductions + advance
  deductions reversed in the ledger`; `paid = payments − voided payments`;
  `due = max(0, owed − paid)`; `overpaid = max(0, paid − owed)`. A surplus is **named**,
  never moved into the next wage or an advance.

Statement status, one rule: `review` (overpaid) → `paid` (paid > 0, due 0) → `partial`
(paid > 0) → `closed`.

`accountFor(schedule, worker, today)` — worker status, first match wins:

| status | condition | label |
|---|---|---|
| `review` | something of his is held, contested or over-settled | proposed |
| `waiting` | a period with work and no closure: the current one, or an earlier one inside tracking | «ממתין לסגירה» |
| `partial` / `closed` | his latest statement still owes him: part paid / nothing paid | «שולם חלקית» / «נסגר» |
| `open` | nothing waiting, the latest settled, but an older wage or an advance debt stands | «יתרה פתוחה» |
| `paid` / `closed` | his latest statement, settled (`closed` = net of nothing, no payment) | «שולם» / «נסגר» |
| `none` | no account to speak of | proposed |

A period "has work" when it has an attendance day or a positive wage. (The design note said
"days or an advance"; an advance with no work is a debt, not a period to close.)

## The functions

| function | contract |
|---|---|
| `payEntryProblems(id, value)` | Everything wrong with one `pay` entry, in English; empty means this build could have written it. |
| `paybookFold(schedule)` | `{ opening, statements, legacy, held, conflicts }` — the map, folded; nothing dropped. |
| `accountFor(schedule, worker, today)` | One man's running account: `current`, `running`, `pending`, `beforeTracking`, `advances`, `debt`, `unpaid`, `wageDue`, `wageOverpaid`, `paymentUnknown`, `held`, `conflicts`, `status`. |
| `accountsList(schedule, today, { cycle })` | Every man by his own cycle, roster order, with three totals that are never added together. |
| `planClosure(schedule, worker, { from, to }, choices, { at, by, today })` | Dry run: the review page (`review`), the exact `changes`, the `ids`, an `expects` fingerprint — or `reasons`. |
| `planPayment(schedule, statementId, amount, { paymentId, date, method, note }, stamp)` | One later payment. The same id with the same money is `already: true`, not a refusal. |
| `planVoid(schedule, targetId, { reason, amount, date }, stamp)` | A payment or extra deduction recorded in error; one void per target. |
| `planAdjustment(schedule, statementId, delta, { reason, date }, stamp)` | A closed net that was wrong, stated beside it. |
| `planOpening(schedule, date, stamp)` | The activation day. One entry, one id. |
| `planLegacy(schedule, worker, periodFrom, { state, due, note }, stamp)` | The owner's word on one older closure. |
| `planGroupClosure(schedule, workers, scope, choicesByWorker, stamp)` | One independent plan per man; `outcome` is `write` / `done` / `skip` / `refuse`. |
| `stillValid(schedule, plan)` | Re-plans from the plan's own inputs against the record now. `stale` (+ the fresh refusal), or `done` when it already landed; hands back the fresh plan. |
| `paybookApply(schedule, changes)` | A **new** schedule with the changes laid in by the record's laws: `applied`, `same`, `conflicts`, `refused`. A model of a commit for suites and dry runs — not the write path. |
| `closureHistory(schedule, query)` | Every closure with its full summary, searchable by worker, name, closing day, work period, cycle, payment status. Closures from before statements are included, status `unknown`. |
| `planPayMigration(schedule, today)` | A report: closures with unknown payment, unclosed periods inside / before tracking, each advance and what can be reconstructed, where the two debt folds disagree. `changes: []`. Nothing applies it. |
| `newPaymentId()` | Mints a later payment's id. The one function here that is not deterministic, and nothing else calls it. |

None of them mutates its input (JSON-compared before and after, and re-run on a
deep-frozen schedule), and all but `newPaymentId` give the same output for the same input.

## Refusal codes

Stable strings in `reasons`; every one that applies is reported, not just the first. The
sentence a person reads is Hebrew and the owner's, so none is written here.

**`planClosure`**

| code | meaning |
|---|---|
| `worker` | nobody on the roster by that id |
| `stamp` | no moment, signer or today |
| `gate` | `financialWritingEnabled` is false on this record or build |
| `permission` | rule 8 names who may close, and this signer is not among them |
| `inactive` | tracking was never activated |
| `before-tracking` | the period ended before tracking begins |
| `period` | `[from, to]` is not a period this man is settled on |
| `closed` | this exact period already has a closure |
| `overlap` | a closed period shares a day with it — compared by days |
| `statement` | a statement for this man and period is already in the map |
| `conflict` | an unsettled disagreement on one of his ids |
| `early` | before the period's last day (rule 4) |
| `unpriced` | a worked day has no rate |
| `overpaid` | one of his advances is settled beyond what was given |
| `allocation` | an allocation that is not money, or names an advance that is not his, not open or not offered |
| `allocation-missing` | an open advance with no answer |
| `over-advance` | more than the advance has left — judged against both the balance `closureProblems` will use and the live one |
| `over-wage` | advances + extras exceed the wage (rule 5) |
| `deduction` | the account walk allows less than was chosen — see the next section |
| `clock` | an entry on a touched advance was recorded after this closure's moment |
| `extra` | an extra deduction with no reason, no category or no real amount; or too many |
| `paid` | the paid amount, its day, method or note is not valid |
| `overpay` | more paid than the net |
| `unpaid` | rule 3 flipped, and no payment named |
| `note` | the closure's note is not text |
| `unsafe-id` | an id this closure would mint cannot be a field path |
| `rejected` | the ledger's own writer or judge refused an entry the plan built (never produced by any input in the suite) |

**The others**

| planner | codes |
|---|---|
| `planPayment` | `stamp`, `gate`, `permission`, `target`, `payment-id`, `amount`, `overpay`, `date`, `method`, `note`, `conflict`, `rejected` |
| `planVoid` | `stamp`, `gate`, `permission`, `target`, `reason`, `amount`, `over-target`, `date`, `voided`, `rejected` |
| `planAdjustment` | `stamp`, `gate`, `permission`, `target`, `delta`, `reason`, `below-zero`, `date`, `rejected` |
| `planOpening` | `stamp`, `gate`, `permission`, `date`, `opened` |
| `planLegacy` | `stamp`, `gate`, `permission`, `target`, `state`, `due`, `note`, `answered`, `rejected` |
| `planGroupClosure` | per man: `planClosure`'s codes, plus `cycle` and `twice` on a skip |
| `stillValid` | `stale` (followed by the fresh plan's codes), `done` |

## Where the audit and the design were wrong

Verified first: probes 1 and 2 reproduce on `bd59a68` to the figure (3,800 on the fortnight
row; 500 + 200 oldest-first; the same-Friday hole; a hand-built 300/200/200 accepted and
reopened clean). Probe 3 (sync) was not re-run — nothing in this phase touches sync.
`docs/architecture.md:75` does still say the ledger is off, as the audit noted; it is not.

1. **Two folds disagree about an advance whose own period was never closed, and neither
   document says so.** `advanceOutstanding` — "the one answer" — says 500 is left, because
   nothing was recorded against it. `advanceWalk` has already counted it as taken from the
   wage of the fortnight it was given in, so `advanceCarryInto` answers 0, and
   `advanceAccount` refuses any chosen deduction of it later. Measured on unchanged code:
   the existing dialog refuses (`deduction`), and so does the new planner — it cannot plan
   around it, because the artifact's `carriedIn`, `net` and `balanceAfter` are the walk's
   and a deduction the walk does not know opens the next period on a negative balance.
   Both figures are on the review (`left` per advance, `walkRoom` for the closure), and
   `planPayMigration(...).debtDisagreements` lists every man it affects. **Until this is
   decided, "deduct an old advance later" does not work for advances from periods nobody
   closed.** Pinned in Phase 0.
2. **A partial deduction shuts the financial gate on a record with no carry approval.**
   The audit says a hand-chosen split is accepted; it is — and then `planAdvanceCarry`
   sees a fortnight whose deduction is not the advance given in it, `planCarryMigration`
   becomes `needed`, and `financialWritingEnabled` answers false until `cm_carry` is
   approved. Existing behaviour, pinned in Phase 0. A record approved once stays approved;
   whether the real record is must be checked before Phase 2.
3. **A random id for every payment loses the payment made at closing.** Two phones closing
   one account, each with a paid amount, are one statement and two payments. Built with a
   derived id (`pp_<statementId>`) for that one payment.
4. **"Advances not listed = 0"** contradicts the owner's own words. Built as a missing
   answer (`allocation-missing`), one constant to flip.
5. **`wageDueBefore` cannot be compared as money.** Two phones with the same choices can
   honestly differ on it; with `sameLedgerFact` as designed, an agreed statement would be
   held as a conflict. It is excluded from the comparison.
6. **The opening is a day, not a Friday.** "The period containing activation" is a
   different window for a weekly and a fortnightly man; the entry stores the day and each
   man's tracking start is derived from it.
7. **The design's Phase 0 loaded the file in `index.html`, `sw.js` and the harness.** This
   phase ships nothing: the suite loads the file itself, and `tests/build.test.mjs` passes
   untouched with an un-shipped file in `js/model/` (it reads only what the page loads).
8. **The design's Phase 1 changed six protected files.** None is touched here; what each
   needs is listed below.
9. **`statement.debtAfter` is the period's debt, not all of it.** It equals the artifact's
   `balanceAfter`, which excludes advances dated after the period. The review carries the
   live total separately.

## The gap table, brought up to date

"Model" means: exists as a pure function with a passing check. Nothing is on a screen.

| # | owner's rule | on `bd59a68` | after this phase |
|---|---|---|---|
| 1a | one accounts list, per-worker cycle, filter | partial | **model**: `accountsList` |
| 1b | weekly man shows only his open week | contradicts (3,800) | **model**: `accountFor` → 2,000. The existing report is unchanged and pinned at 3,800. |
| 1c | biweekly shows his fortnight | true | true; **model** agrees: 4,400 |
| 1d | closed wages never return to the running account | partial | **model**: `running` is 0 once closed; the closed wage is a statement |
| 1e | unpaid wage from an earlier closure, apart | absent | **model**: `wageDue`, `unpaid` |
| 1f | existing week / fortnight definitions | true | unchanged; `periodRangeFor` only |
| 2 | review page, final confirm, opening closes nothing | partial | **model**: `planClosure(...).review` + `changes`; `stillValid` at confirm. No page. |
| 3a | advance: id, date, original, deducted, remaining, each deduction | true | unchanged; surfaced in `closureHistory` |
| 3b | choose per advance | partial (one total, oldest first) | **model**; blocked for advances from never-closed periods (finding 1) |
| 3c | never delete an advance / change its date | partial | unchanged. The new planners write no `corrected` and no removal; `removeAdvance` and `recordAdvanceCorrected` still exist. |
| 3d | never over-deduct, never twice, debt survives | true | true; **model** adds the live-balance cap and closes the same-Friday hole in the planner |
| 3e | a new advance is never a wage payment | true | **model**: pinned |
| 3f | safe migration of old advances | exists | **model**: `planPayMigration` reports what can and cannot be reconstructed |
| 4 | extra deductions | absent | **model** |
| 5 | payment apart from closure; later payment; no netting | absent | **model** |
| 6 | group closure | absent | **model**: `planGroupClosure`. No work list, no draft storage. |
| 7 | reset deletes nothing | true | true; pinned for the new entries too |
| 8 | history, search, no silent edit, linked corrections | partial | **model**: `closureHistory`, `planVoid`, `planAdjustment` |
| 9 | safety and concurrency | see audit A6 | **model only**: ids, same-fact, conflict kept beside, `stillValid`. No server-first write, no intent, no rule. |
| 10 | break nothing; one wage source; review list | true as architecture | no shipped file changed; agreement with the old model on old data is pinned |
| 11 | tests | none for payment, extras, group, history | `tests/payroll.test.mjs` |
| 12 | UI | none | none |

Still open on `bd59a68` and **not** fixed by this phase: the same-Friday hole in
`planPeriodClosure` / `closureProblems` (a foreign phone can still deliver such a closure;
only the new planner refuses to write one), and both findings 1 and 2 above.

## What later phases must add

**Brought up to date at Phase 3.** Built since this list was written: the server-first
transaction (as `FarkadSync.transactPaybook`, in `js/sync/transact.js`), the rules
(`protocol >= 2`, the pay map append-only on the server, `closed/`), finding 1 in
`js/model/schema.js` (behind the gate), and the split's first half (the copy at birth).
Still missing: everything in [What is NOT built](#what-is-not-built-and-why-the-gate-stays-shut),
a way to settle a disagreement, the stale status line, the same-Friday hole in
`js/model/ledger.js`, and the UI. "Healing a cloud that lost the pay book" is answered by
the rules: under them it cannot lose one. The list below is as Phase 2 left it.

**The document's size, before anything else.** See [Capacity](#capacity): closed history
has to leave the live document before the writer opens. A phase of its own.

**Server-first transaction.** `FarkadSync.transact(changes, { opId })` in
`js/sync/send.js`: one Firestore transaction carrying every path of one operation, or
nothing — outside the ordinary flush, so the 296-path cut measured in Phase 2 cannot split
it; offline refuses; a conflict adopts the fresh document and the review is redrawn
(`stillValid` is the model half); a device-local intent for an answer lost in flight.
`State.commitPaybook` is the local half it will call, and is not enough on its own: it
accepts a closure offline, exactly as the existing dialog does.

**Rules.** `firestore.rules`: `protocol >= 2` (which is what turns the rollout rule from a
promise into a refusal), and append-only for `pay` and `ledger.advances` (no changed and no
removed keys on update) — Phase 2 measured that today's rules accept a rewrite, a deletion
and a whole document with no `pay`. The owner's manual publish.

**A way to settle a disagreement, and to see one.** `payConflicted` is on the record and
in the fold and on no screen; the held write has no button. A person has to be able to
say which body is true (the answer is a `void` or an `adjustment` beside the one that
stands, and the retirement of the held operation — `answerHold(opId, 'cloud')`).

**Healing a cloud that lost the pay book.** A phone that holds entries the cloud no longer
has does not send them back (P6). Either the protocol gate makes the cause impossible, or
the receive path re-queues them; not both half-done.

**The stale status line** after a batch settled wholly against the server's copy
(`js/sync/send.js`, the early return in `sendClaimed`): «שולח» over an empty queue until
the next snapshot. Pre-existing; it will be a closing phone's last impression.

**The existing model.** `js/model/ledger.js`: compare overlap by days and stop accepting a
fortnight for a man it is not a period for. `js/model/schema.js`: reconcile `advanceWalk`
with `advanceOutstanding` for unclosed earlier periods (finding 1), which rule 6 needs too.

**UI.** The accounts list, the worker account, the review page, the payment sheet, the
group walk and its drafts, the history — and the answer to default 1 for `js/ui/reports.js`.

**The rollout rule** is no longer a prediction: it is measured against v167, v169 and v171
and written in [The rollout rule](#the-rollout-rule) above. What an older phone shows a
person is unchanged from what was predicted here: it sees the artifact and the `deducted`
entries, so the period is frozen and the advances reduced there, but it shows no extra
deduction, no payment and no wage balance, its "net" for that period ignores extra
deductions, and it can still close a period the old way, offline.

## Hebrew strings

No string is shown by anything in this phase. The five status labels are in the model
(`PAYBOOK_STATUS_LABELS`) and pinned word for word, because they are the owner's own words.
Every other string is **proposed** and needs his word before it is pinned (iron law 6).

| string | source | where |
|---|---|---|
| סגירת חשבון ואיפוס | owner | worker account, primary action |
| יתרת שכר לתשלום | owner | list line, worker account, review |
| סגירת חשבונות עובדים | owner | list, primary action |
| סגירת חשבון דו-שבועי | owner | list, secondary action |
| היסטוריית סגירות חשבון | owner | history entry and title |
| ממתין לסגירה | owner | status `waiting` |
| נסגר | owner | status `closed` |
| שולם | owner | status `paid` |
| שולם חלקית | owner | status `partial` |
| יתרה פתוחה | owner | status `open` |
| סגירת חשבון | owner | titles, history |
| תשלום בפועל | owner | payment action and title |
| עובד שבועי | owner | cycle chip, review header |
| עובד דו-שבועי | owner | cycle chip, review header |
| שבועי / דו־שבועי | existing (`PAY_CYCLE_LABELS`) | filter chips |
| מקדמות פתוחות, נשאר להחזיר, תיקון טעות | existing | reused as they are |
| לבדיקה | proposed | status `review` |
| אין חשבון פתוח | proposed | status `none` |
| נסגר לפני שנרשמו תשלומים - לא ידוע אם שולם | proposed | a closure with payment unknown |
| חשבונות / מקדמות | proposed | the switch on the tab |
| הכול | proposed | filter chip; per-advance chip |
| מקדמות לקיזוז | proposed | review section |
| כמה לקזז מהמקדמה הזאת? | proposed | per-advance field |
| לא נבחר סכום לכל המקדמות | proposed | `allocation-missing` |
| אי אפשר לקזז יותר ממה שנשאר במקדמה | proposed | `over-advance` |
| הניכויים גבוהים מהשכר של התקופה | proposed | `over-wage` |
| מקדמה מתקופה שלא נסגרה - אי אפשר לקזז אותה כאן | proposed | `deduction` |
| מקדמה מאוחרת - תקוזז מהתקופה הבאה | proposed | an advance dated after the period |
| ניכויים נוספים / + ניכוי נוסף | proposed | review section |
| ניכוי מוסכם / הסדר / אחר | proposed | deduction categories |
| סיבת הניכוי | proposed | field label |
| יתרת שכר מסגירות קודמות | proposed | review, read-only |
| שכר התקופה / נטו לתשלום / שולם בפועל / יתרה אחרי הסגירה | proposed | review result |
| שולם הכול / עוד לא שולם | proposed | paid chips |
| אישור סגירה | proposed | review, primary action |
| אי אפשר לסגור לפני היום האחרון של התקופה | proposed | `early` |
| החשבון כבר נסגר | proposed | `closed` / `statement` |
| החשבון השתנה בזמן האישור. לא נשמר דבר. בדוק את הסכומים ואשר שוב. | proposed (today's: «…לא נשמר ניכוי…») | `stale` |
| רשום תשלום | proposed | payment, primary action |
| אי אפשר לרשום תשלום גבוה מהיתרה | proposed | `overpay` |
| כבר נרשם | proposed | `already` |
| שולם יותר מהיתרה - צריך לבדוק | proposed | an overpaid statement |
| ביטול רישום / סיבת הביטול | proposed | void |
| תיקון לסגירה | proposed | adjustment |
| אישור והבא / דלג | proposed | group walk |
| הכן סגירה לנבחרים | proposed | group page |
| נסה שוב לנכשלים | proposed | group results |
| תקופה קודמת שלא נסגרה | proposed | a pending period line |
| לפני תחילת המעקב | proposed | a period before tracking |
| תחילת המעקב | proposed | activation day |
| שולם / נשאר חוב של X ₪ | proposed | the two legacy answers |

## Still the owner's to decide

**Answered on 2026-11-10** - see [What the owner decided](#what-the-owner-decided-2026-11-10):
defaults 1 to 8, and items 9, 10 (the debt stays; built behind the gate), 11 (the carry:
never silently locked - `carry-approval-needed`), 17, 20, 21. What follows is the list as
it stood, kept for the items that are still open: 12 to 16, 18, 19 and 22 to 25.

**New, from Phase 4** - each answerable in one line; what is built is said:

33. The tab's label stays «מקדמות» while its page is «חשבונות עובדים» (built). Rename the
    tab? Recommended: keep it until he has used the screens.
34. At a closure the payment starts at «עוד לא שולם» and he taps «שולם הכול» (built): the
    app never assumes money was handed over. Recommended: keep.
35. No "are you sure?" before «אישור סגירה» (built): the review page is the confirmation.
    Recommended: keep - a closure is corrected by a linked record.
36. The list puts the men who need him first (built) instead of the roster's order.
    Recommended: keep; the alternative is one line.
37. Each advance field is pre-filled with all of it, oldest first, up to the wage (built).
    The alternative is blank fields he must fill. Recommended: keep.
38. A prepared batch closes as «עוד לא שולם» unless he switches the whole batch to «שולם
    הכול», which records cash for every man (built). Recommended: keep the switch.
39. The payment made at the closing is dated today (built); another day is a later
    payment. Recommended: keep.
40. «לא ידוע» on an older closure writes nothing and is asked again after a reload
    (built). Recommended: keep - "unknown" is not an answer to store.
41. While the pay book is open the advances page's «סידור» is not reachable (built).
    Recommended: accept; the accounts list has its own order.
42. Every proposed string in [Hebrew in Phase 4](#hebrew-in-phase-4).

**New, from Phase 3** - each answerable in one line; the default built or recommended is
said:

26. A closed row whose «late since close» note now appears because of the ruling, not
    because anything arrived late: what should it say? Recommended: no note, only «חוב
    פתוח X ₪».
27. May a closure be attempted while this phone still holds unsent days? Built: no -
    refused (`unsent-work`) until the queue has drained.
28. The carry approval: asked on the spot when first needed (built), or given once
    together with the opening day? Recommended: with the opening day.
29. After the pay book opens, does the old «סגור את החשבון» dialog stay? Recommended: no -
    it writes no statement and goes through the queue.
30. An older phone whose restore the server refuses shows an error and holds later days
    behind it until it is updated (measured). Acceptable? Recommended: yes - the rollout
    order forbids that restore anyway.
31. When do the DAYS of closed months leave the live document, and how far back must the
    invoice reports reach without signal? Recommended: a document per month, after the
    month is closed for everybody and six months old.
32. How long does an index row stay before it folds into a per-man checkpoint?
    Recommended: one year after it is settled.

The eight defaults above, and:

9. Is an advance the person did not answer for a missing answer (built) or a zero?
10. Which of the two folds is a man's debt when an advance comes from a period nobody
    closed — the 500 `advanceOutstanding` says, or the 0 the account walk carries? Until
    it is one answer, such an advance cannot be deducted at a later closure.
11. Has the carry (`cm_carry`) been approved on the real record? If not, the first partial
    deduction locks every financial control until it is.
12. May a later period be closed while an earlier one is still waiting? Built: yes; the
    earlier one stays listed.
13. May a period from before the activation day be closed through the new flow? Built: no
    — the activation day can be chosen earlier instead.
14. One payment at the closing per statement, with a derived id (built), so two phones
    cannot record one envelope twice.
15. One void per entry, whole or part (built). A second correction needs a person.
16. May a legacy closure answered "still owed X" be paid like a statement? Built: yes.
17. The deduction categories (agreed / settlement / other), at most twenty per closure,
    and the payment methods (cash / transfer).
18. A payment may not be dated in the future. Built: refused.
19. The wording for `review`, `none` and "payment unknown", and every other proposed
    string above.

From Phase 2:

20. **How big is the live document today, and how many men are on it?** Everything in
    [Capacity](#capacity) turns on those two numbers, and neither can be read from here.
21. **Where does closed history go** — the split proposed there, or another? Until it is
    answered the writer stays shut.
22. A pay-book disagreement does not stop the phone (built); a ledger one still does. Is
    that the rule he wants, or should a disputed payment also stop recording until looked at?
23. An unreadable pay entry stops the phone until acknowledged, at every open (built, law
    10). The same as the ledger; said here because it is his phones it would stop.
24. The five Hebrew strings added in Phase 2.
25. Whether the stale «שולח» line (pre-existing) is fixed before or with the server-first
    transaction.
