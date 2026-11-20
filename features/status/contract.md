# Contract — «תמונת מצב»: where the business stands, on one screen (track `status`)

Base `6ab193d68c960e4a56d947673c282b867acd258f` (origin/main, stamps v204). Branch `feat-status`,
worktree `/home/user/farkad/.claude/worktrees/feat-status`. One of four tracks of the
2026-11-19 program; the integrator ships them together as v206.

The owner asked (2026-11-19, in Arabic) for "real, serious, heavy features that lift the app
several levels". This track is the one he will open first: ONE screen that answers "where does my
business stand right now" - today, the next working day, the money, the last twelve weeks and the
sites - and from which every line is one tap from the screen that owns it. It is a READING: it
prices nothing, counts what existing functions return, and writes nothing.

## Revision 2 - after the critic (2026-11-19). A builder who started from revision 1 reconciles THIS

Each point was checked against the code at the base; the text below is already changed in place.
1. **Doors to what is not a dialog run one task later** (js/ui/modal.js:145-161 hands the focus back
   to the opener at the microtask checkpoint after the block that shut the last dialog, so a target
   that focused something in the same task loses it; whatsNewGo, js/ui/whatsnew.js:594-606, is the
   precedent). See «Entry and navigation».
2. **The payday line counts the men who WORKED in that pay period**, archived men included, says
   «היום, » when the period ends today, and is worded «עבדו בתקופה» - not men to pay (the desk's
   «סה״כ לתשלום · N עובדים» counts rows with a wage, reports.js:1790, which an advance or a carried
   debt keeps alive and an unpriced day removes; the two are different facts with different words).
3. **The ride line reads the stored day as it is** (who gets there another way, vehicles kept home)
   even when nobody is seated (transportPeekDay answers day:null then, js/ui/transport.js:682), and
   **is left out when the vehicle list on the disk will not read**, because transportContext →
   transportSettings → transportLoad would copy those bytes to a key of their own (transport.js:613):
   a write this screen must never cause.
4. **The status never calls weeklyCloseRead.** The close count is mirrored from the reminder's line
   when that line is up (closeReminderShown, js/ui/closereminder.js:188/315), never read; the one money
   reading left is the board's (owesReadNow). Reason: after any write on the day screen
   CLOSE_REMINDER_KEPT keeps its count under the old key (closereminder.js:225-228), so revision 1's
   "both kept, nothing read" almost never held, and weeklyCloseRead costs 1.5 s in Node on a season
   nobody closed (scratchpad program/season-open.txt). Two budget rows added.
5. **The pulse's week total is pinned against the week tab's tfoot rule and invoiceByDate only**;
   the payrollReport identity is pinned only for weeks no man has a closure of (a closed period
   answers its FROZEN counts, js/model/money.js:352-367), and a weekly week closed then corrected is a
   fixture.
6. Hebrew: «בעלייה»/«בירידה» for the chips, «שבועי: 8 · דו־שבועי: 4», the legend names «חדש» and
   says «12 ימי העבודה», the hero is «עובדים היום» with a singular, the «מה חדש» item names the chip
   («מצב הסנכרון למעלה»), not the line.
7. A site's month and «עובדי יוסף גבס» are read up to TODAY, as the pulse and the strip are.
8. Each pulse row writes its Friday's date; the ramp's lightest step is ≥ 3:1 on `--surface` (WCAG
   1.4.11), in both schemes. One Saturday rule with the month board: `anyRecordOnRestDay`.
9. A site outside the roster («אתר שאינו ברשימה N») is a plain row, not a button that opens nothing
   (openSiteCard returns on an unknown place, js/ui/sitecard.js:426-430).
10. The dialog suite asserts `midEdit() === true` while the dialog is open (v205 installs an update at
    the first moment midEdit() is false; js/ui/offline.js:491-498 on release-v205).

## Goal

After this ships the owner taps the sync chip at the top of any screen and reads, top to bottom,
in a fixed order:

1. the sync sentence he tapped, in full;
2. today: how many men are on a site and on how many sites, who is not recorded, who is absent,
   and each site's count;
3. the next working day (never "tomorrow" on a Friday evening): how the seder stands, the rides,
   how many of the per-man messages were opened;
4. the money: when the next payday is and how many men worked in that pay period so far, the close
   reminder's own line when it is up, and what the men owe - in the existing screens' own
   sentences, the board's read after the dialog has painted;
5. the last twelve weeks as a heat map of men per day, with its finding said in one sentence;
6. every site worked in the last eight weeks: this month's worker-site days so far, Rima beside
   it, an eight-week strip and one word when the site is rising, falling, new or quiet;
7. this phone: the backup's age.

Every section ends in a button that only navigates to the screen that owns it.

## Out of scope

- Any figure of money not already produced by an existing reading (no payday total, no sum of a
  weekly and a fortnightly band, no forecast, no profit, no wages per site).
- The payday amounts themselves: they are track `payday`'s («יום תשלום»). Here the money section
  links to it and shows only the two money sentences that already exist: the board's total (read
  here, after paint) and the close reminder's line exactly as the banner shows it (mirrored, never
  read - this file never calls `weeklyCloseRead`; the desk and the reminder are where it is read).
- The drivers' messages (`transportMarkState` reads through `transportDayOf`, which can write an
  aside copy; changing its signature is not this track's).
- A list of news / "insights" in sentences (rejected for this program: it cries wolf; see the
  program's `rejected`). The only interpretation this screen makes is the site's phase word and
  the pulse's caption, both pure counts over the record, both pinned.
- Any new tab, any new button in the top strip beside «הגדרות», any change to the day screen.
- Paper and the shared picture: a dialog never prints (app.css:4147-4180). No picture kind.
- Capacity («מצב המכשיר»), the held records, the cloud's reason: they stay in ⋯.
- `js/ui/offline.js` (v205 is rewriting it) and `js/ui/whatsnew.js` (the integrator's).

## Data — reads only

Nothing in this track writes the record, the outbox, the cloud, a backup, a restore point, the
rescue file or ANY Store key. It needs no preference. "Nothing written" is a test (criteria 9, 21).

Every line, and the one function it is read from (file:line at the base):

| line | read from |
|---|---|
| the sync sentence | `document.getElementById('storageNotice').textContent`, verbatim (written only by `updateSyncNotice`, js/sync/status.js:433). Never composed again. |
| the door's label | the chip's own label as `renderSyncChip` (js/app.js:191-253) sets it; nothing recomputed |
| today's men on a site | `journeyCrewStatus(State.schedule, today, State.layer).placed.length` (js/ui/journey.js:172) |
| today's words | `journeyCrewWords(crew)` (journey.js:189) - «שובצו: 12 · לא נרשמו: 3 · נעדרים: 1» |
| today's sites | each ACTIVE site with men: `workersAtPlace(State.schedule, today, place.id, State.layer).length` (js/model/schema.js:2858) and `rimaCount(State.schedule, today, place.id)` (schema.js:3028) |
| the next working day | `journeyDefaultDate(today)` (journey.js:157); its heading `JOURNEY_TEXT.forDay(hebrewDayName(d), formatFullDate(d))` (journey.js:93) |
| its crew words | `journeyCrewWords(journeyCrewStatus(State.schedule, d, State.layer))` |
| its rides (only when `journeyRidesOn()`, journey.js:360) | `journeyRideWords(journeyRideStatus(transportContext(d), statusRideDay(d)))` (journey.js:224/245, js/ui/transport.js:754). TWO GUARDS, both reads with no write: (a) **the vehicle list** - when `transportSettingsMemory` (transport.js:432) is null and `Store.get(TRANSPORT_SETTINGS_KEY)` holds bytes that `transportJson` (transport.js:488) will not read, there is NO ride line at all: `transportContext` would reach `transportLoad`, which copies such bytes to `farkadTransport:settings:unreadable` (transport.js:600-616) - a write this screen must never cause. Absent bytes and bytes that read are safe (transportLoad writes nothing for either). (b) **the day** - `statusRideDay(d)` (this file) = `transportDays[d]` (transport.js:433, the session's own copy, as the journey sees it) when there is one; else the bytes of `TRANSPORT_DAY_PREFIX + d` read the peek's own way (`Store.get` → `transportJson` → `transportReadDay`, transport.js:675-681) - so a day with men marked as getting there another way, or vehicles kept home, and nobody seated yet is read AS IT IS, where `transportPeekDay` would answer `day: null` (transport.js:682); no key → `transportEmptyDay()`; bytes that will not read → NO ride line. Never `transportDayOf`, `openTransport`, `transportPrune`, `transportLoad` (transport.js:651/698/600). The line then equals what the journey's station 3 says for the same day (`journeyReadings`, journey.js:536-539). |
| its per-man messages | `run = sederRun(sederCrew(State.schedule, d, State.layer), d)` (js/ui/seder.js:331/102); said `${JOURNEY_TEXT.sendWorkers}: ${SEDER_TEXT.progress(run.done, run.total)}` only when `run.total > 0` |
| the next payday | for EVERY man of the roster, archived men included: `p = periodRangeFor(worker, today)` (js/dates.js:213). He is IN his period when some date of `[p.from, p.to]` holds an entry of his and no absence in the 'actual' layer (`entriesFor` / `isAbsent`, schema.js:2847/2852 - the days payrollReport counts as `attendanceDays`; a date after today already recorded, like tomorrow's seder, counts). E = the earliest `p.to` among the men in their period; the men counted are those in their period whose `p.to === E`, split by `p.cycle`. No man in his period → no payday line (the door stays). Dates and the roster only: no money. NOT the desk's «סה״כ לתשלום · N עובדים», on purpose: that counts rows with a wage (reports.js:1790), which an advance or a carried debt alone keeps alive and one unpriced day removes; this line counts who WORKED, and says so in its own words. |
| the accounts to close | MIRRORED, NEVER READ: `closeReminderShown` (js/ui/closereminder.js:188, "the count the line on the glass says, or null"; set by `closeReminderShow` :315, cleared by `closeReminderHide` :320-322). When it is an integer > 0 the line is `CLOSE_REMINDER_TEXT.line(closeReminderShown)` - byte for byte `#closeReminderLine`'s text - with its door; otherwise (the switch off, ✕ today, nothing to close, the gate shut, the reminder not yet read) there is no close line here and the desk's door is the way. This file never calls `weeklyCloseRead`, `closeReminderReadCount` or `closeReminderRefresh` (spies). |
| what the men owe | `owesKeptNow()` / `owesReadNow()` (js/ui/owes.js:656/663) → `read.total` said by `owesMoney` (owes.js:483) under `OWES_TEXT.total` when `read.folded`, under `OWES_REUSED.recorded` when not; `owesCountLine(read)` (owes.js:487). None owe: `OWES_TEXT.none`. |
| the pulse, a cell | the men with an entry and not absent on that date - the week tab's «סה"כ עובדים» rule (`renderWeekTotals`, js/ui/week.js:290-318), computed from ONE `invoiceByDate(State.schedule, from, today)` (js/model/money.js:563) as the union of each day's `workerIds` per date - the rule `monthSummaryRead` already uses for `menOn` (js/ui/monthsummary.js:218-221) |
| the pulse, a week's total | Σ of its cells - pinned equal to the week tab's tfoot rule summed over the week's dates up to today and to the union rule over `invoiceByDate`; pinned equal to Σ `payrollReport(schedule, weekFrom, min(weekTo, today)).attendanceDays` (money.js:210) ONLY for a week no man has a closure matching that same range (`frozenPeriodFor(schedule, id, weekFrom, min(weekTo, today)) === undefined` for every man, schema.js:2324 - which also catches an old closure recorded with no `periodTo`, matched by any range starting on its first day, :2319-2321): a closed period answers its FROZEN counts (money.js:352-367), and a day corrected after a weekly close is then live here and frozen there - the pulse is the live record, by design. Not used to draw. |
| a site's month | THE MONTH SO FAR, like the pulse and the strip: `invoiceWithoutRima(State.schedule, monthFrom, today, place.id).total` (money.js:531), `monthFrom` = `monthSummaryRange(monthSummaryKeyOf(today)).from` (monthsummary.js:113/104); Rima beside it: `rimaReport(State.schedule, monthFrom, today, place.id).total` (schema.js:3077). Their sum equals the billing count `invoiceByDate(State.schedule, monthFrom, today)` for that site (pinned); and equals `monthSummaryRead(key).sites[...].days` exactly when no date after today in the month holds a record (pinned both ways: a seeded record with tomorrow's seder typed differs there by tomorrow's count, and only by it). |
| a site's 8-week strip | Σ per week of `invoiceWithoutRima(State.schedule, from8, today).countAt(place.id, date)` from ONE call over the eight weeks |
| a site's phase word | the rule below, over `dayCheckIsWorkingDay(schedule, date, 'actual')` (js/ui/daycheck.js:152) and the same `invoiceWithoutRima` counts |
| «עובדי יוסף גבס» this month | `yosefGevesReport(State.schedule, monthFrom, today).total` (schema.js:3338) - the month so far, as the sites - one line of its own after the sites, with `YOSEF_GEVES_NOTE` (js/ui/reports.js:2396); in NO other number on the screen |
| the backup's age | `backupAgeSentence(Store.get(LAST_BACKUP_KEY), todayStr())` - a PURE function extracted, behaviour-preserving, from `renderBackupAge` (js/ui/backup.js:988-1007), which then calls it; `BACKUP_REMINDER` when `backupReminderDue(...)` (backup.js:1061/1066) |

**The money is read the house way** (scout-api 7.4), and it is ONE reading - the board's: ONE
synchronous call `reportReadOnce(() => weeklyCloseOnce(() => owesReadNow()))` (js/ui/reports.js:111,
weeklyclose.js:227, owes.js:663), each guarded by `typeof`; never inside `render()`, never before
the dialog has painted (`owesAfterPaint`, owes.js:780: `requestAnimationFrame(() => setTimeout(run,
0))` plus the 400 ms timer). `owesReadNow` keeps its own reading (`OWES_KEPT`, memory, under
`owesKey`, owes.js:644-670), so with `owesKeptNow()` non-null nothing is read at all and the lines
are in the first paint. NEVER `weeklyCloseRead` (the close line is mirrored, above): after a write on
the day screen the reminder keeps its count under an old key on purpose (closereminder.js:225-228),
so a status that read whenever that key was stale would run the 1.5 s reading (Node, a season nobody
closed) on nearly every opening, and again 1.5 s later in the reminder. Never `REPORT_DEDUCTIONS`,
never a write, never an `await` inside the read.

**The gate.** Shut (`advanceCarryEnabled()` false) or unapproved: the board's own words and nothing
of the new arithmetic - «מקדמות רשומות» and the sum handed over, exactly as `renderOwesInto` draws
it (owes.js:690-693; tests/approval.test.mjs is the rule). There is no close line, because the
reminder's line is never up then (`closeReminderCount` answers 0 when `read.gate !== true`).

**The phase word** (one per site, none for a steady site; history needed: 36 working days, else
no word). R = the last 12 working days up to today, B = the 24 working days before R. `own(d)` =
the site's own men that working day (0 counts). Constants in the file, pinned:

| word | rule (first that applies, in this order) |
|---|---|
| «שקט» | the site is ACTIVE, had own men on some working day of B, and none on each of the last 5 working days |
| «בירידה» | mean(B) ≥ 4, mean(R) ≤ 0.6 × mean(B) and mean(B) − mean(R) ≥ 3 |
| «חדש» | the site's first own day in the whole record is inside R, and it has ≥ 10 own worker-site days since |
| «בעלייה» | mean(B) ≥ 2, mean(R) ≥ 1.6 × mean(B) and mean(R) − mean(B) ≥ 3 |

(«בעלייה»/«בירידה», not «עולה»/«יורד»: beside a number on a screen that also shows money, «עולה»
reads as "costs".)

**The pulse.** 12 rows, newest on top, each a Friday-anchored week (`snapToWeekStart`,
js/dates.js:41) - the current week included. Each row STARTS with its Friday's date,
`formatShortDate` (js/dates.js:272, «13/11»), written (≥ 14 px; 18 with the mode), so a sighted
reader tells the weeks apart without counting rows. Columns: the six days in `workerCardWeekdays()`
order (js/ui/workercard.js:380), headed by `HEBREW_DAY_LETTERS` (js/ui/dom.js:163); a seventh, «ש׳»,
for every row only when a Saturday inside the twelve weeks holds anything recorded -
`anyRecordOnRestDay(date)` (js/ui/day.js:1343), the rule the day's arrows use and the one the month
board uses, so the two screens agree about Saturdays (a Saturday holding only an absence or only a
Rima count is a column whose cells are 0). Dates after today are «·» and counted nowhere. A cell's
shade is step `ceil(5 × n / max)` of a five-step ramp, max = the largest cell of the twelve weeks;
n = 0 is the surface with a hairline. Cells carry NO digits (they do not fit at 320 or with the
large display, measured in proposal-wow §1.3): the week's total is written at the row's end, and the
row's accessible name says every day. The caption: averages of men per WORKING day (a date with
n > 0) over the last four weeks and the four before, to one decimal.

## Permissions and privacy

The three phones each read their own copy; this screen reads it and nothing else. Names, counts and
the two money sentences are shown on the phone only; nothing leaves it from here (no text door, no
picture, no file). The suites use synthetic names only.

## Entry and navigation

**The door is the sync chip, made a button** - 0 px on every measured phone (proposal-field §1.1):
a new button in the strip wraps the 320 px strip to 76 px and fails tests/mobile.test.mjs:649; a
sixth tab spills «מקדמות» by 2.3-4.2 px (scout-ui §a).

- index.html:127: the existing `<span class="sync-chip" id="syncChip" hidden aria-hidden="true">`
  is put, unchanged, inside `<button type="button" class="status-door" id="statusDoor"
  aria-haspopup="dialog" onclick="typeof openStatus === 'function' && openStatus()">`, with a
  `<span class="status-door-words" hidden></span>` beside it and `chevronIcon('fwd')`'s SVG
  (dom.js:119, aria-hidden) after both. The span keeps its id, class, `hidden` and `aria-hidden`,
  so tests/smoke.mjs:3133-3180 and tests/startup.blank.test.mjs:554 hold untouched.
- js/app.js `renderSyncChip` (:191-253) gains ONE line at its end:
  `if (typeof statusDoorSync === 'function') statusDoorSync(chip, label);`. `statusDoorSync`
  (this file) sets the door's `aria-label` to `STATUS_TEXT.doorName(label)` when the chip has a
  label, and otherwise shows `.status-door-words` with `STATUS_TEXT.door` and names the door with
  it; while the dialog is open it also rewrites the dialog's first line from `#storageNotice`, so
  the line follows the chip without a `render()`.
- The door is ≥ 44 × 44 px (52 × 52 with «תצוגה גדולה») as a hit area, the pill drawn as today
  inside it (24 px), transparent around it, focus ring on the door. The strip's height does not
  change on any phone or wide window (criterion 12). THE CHEVRON IS CONDITIONAL: it is there to say
  "this opens something", and it stays only if criterion 12 holds with it in every measured case
  (computed: the longest chip at 320 with the mode off leaves 11 px); if any case is taller than the
  base with it, the chevron goes and the door stays worded.
- The frame: a static `.modal#statusModal > .modal-content.modal-wide` in index.html, directly
  after the `#siteCardModal` frame (ends ~:1015): `h3#statusTitle[tabindex=-1]` first, then
  `#statusBody`, then `.modal-actions` with `button#statusClose` («סגור»). Words set by JS.
  `MODAL_CLOSERS.statusModal: () => closeStatus()` after the `whatsNewModal` row
  (js/ui/modal.js:46). `if (typeof renderStatusIfOpen === 'function') renderStatusIfOpen();` in
  `render()` after the `renderFindIfOpen` line (js/app.js:175).
- `js/ui/status.js`: `<script>` directly after `js/ui/reminders.js` and before `js/app.js`
  (index.html:1230-1231) with a comment saying it runs nothing at load; `'./js/ui/status.js'` in
  `sw.js` SHELL after `'./js/ui/reminders.js'`.

**Every door closes the dialog first, then calls the target's own opener - and WHEN depends on
what the target is** (revision 2). js/ui/modal.js hands the focus back to the dialog's opener
(`#statusDoor`, always in the document) from a MutationObserver, i.e. at the microtask checkpoint
AFTER the whole block that shut the last dialog (modal.js:145-161):
- **the target is a `.modal`** (the site card, «סגירת שבוע», «יום תשלום»): opened in the SAME task,
  its title focused by hand (siteCardGoMan's rule, js/ui/sitecard.js:507-519) - modal.js never sees
  a moment with no dialog open, so it gives nothing back;
- **the target is anything else** (a view, the journey, the month board, ⋯): `closeStatus()` and
  then `setTimeout(go, 0)` - whatsNewGo's rule (js/ui/whatsnew.js:594-606) - so modal.js's focus
  return lands first and the focus then ends where the target puts it (the board's title, the ⋯
  heading `settingsJump` focuses), never on `#statusDoor`.
None of them writes:

| door | words | kind | action |
|---|---|---|---|
| today | «פתיחת היום לעריכה» (borrowed, js/ui/week.js:225) | view: one task later | `State.date = today; dayChosenByHand(); showView('day')` (js/app.js:367) |
| the next working day | `journeyDayEntryWords(Date.now(), today)` (journey.js:1078 - the dock button's own title: «בניית סידור ליום ראשון 22/11/2026», or «המשך בניית הסידור · שלב N מתוך 5») | view: one task later | `journeyStart()` (journey.js:368) - the dock button's own action (index.html:292). The journey then writes its own place key (`farkadSederJourney`) exactly as a press of `#journeyDockBtn` does: that is the journey's existing behaviour, and the only byte any door here causes (criterion 21 holds it to the dock's bytes). |
| the next payday | `PAYDAY_TEXT.entry` («יום תשלום») when `typeof openPayday === 'function'` (track `payday`); otherwise «דוחות» (the tab's own word) | `openPayday`: a `.modal`, same task, `#paydayTitle` focused by hand; «דוחות»: view, one task later | `openPayday()`; otherwise `showView('reports')` |
| the close line (only while the reminder's line is up) | `CLOSE_REMINDER_TEXT.open` «לסגירת שבוע» (borrowed) | a `.modal`: same task | `openWeeklyClose()` (weeklyclose.js:787, which focuses its own title, :792) |
| the board | `OWES_TEXT.board` «מי חייב כסף» (borrowed) | view: one task later | `OWES_PAGE = null; ADVANCE_WORKER = null; showView('advances')` |
| a week of the pulse (the row) | the row itself, named by `STATUS_TEXT.weekName(...)` | view: one task later | `showView('week'); setWeekFromDate(friday); render()` (week.js:33; showView resets the week to the grid, app.js:88-92) |
| under the pulse | `MONTH_BOARD_TEXT.door` («לוח חודשי») only when `typeof openMonthBoard === 'function'` (track `monthboard`) | NOT a dialog: one task later, so the board's title keeps the focus `openMonthBoard` gives it | `openMonthBoard(null, null)` |
| a site (the row) - a site of the roster only | the row itself, named by `STATUS_TEXT.siteName(...)` | a `.modal`: same task, `#siteCardTitle` focused by hand | `openSiteCard(place.id)` (sitecard.js:426). A site outside the roster («אתר שאינו ברשימה N», which `invoiceWithoutRima` can name, schema.js:1785-1794) is drawn as a plain row with the same words, not a button: `openSiteCard` returns without a word for a place `siteCardPlace` does not find (sitecard.js:93-95/426-430) |
| the cloud | «ענן וסנכרון» (borrowed: the ⋯ card's title, index.html ~:334) | ⋯ is not a `.modal` (`div.settings-panel`, index.html:315): one task later, so the heading `settingsJump` focuses keeps it | `openSettings(); settingsJump('settingsDaily')` (js/ui/settings.js:17/40) |
| the backup | «גיבוי» (borrowed: the ⋯ row's title, index.html ~:383) | the same: one task later | `openSettings(); openSettingsFold('settingsFoldBackup'); settingsJump('settingsBackups')` (settings.js:95) |

## The screen, section by section, in this order

Every word below marked PROPOSED is new, lives in ONE frozen block `STATUS_TEXT` at the top of
`js/ui/status.js`, and is pinned word for word in tests/status.test.mjs. BORROWED words are read
from their owner (or repeated in `STATUS_REUSED` and found in the owner's source by the suite).
Names inside sentences go through `isolate()`, dates through `dateRange()`/`formatFullDate`,
figures through the sheet's own helpers. Never «נשלח».

0. **Title** `STATUS_TEXT.title` = **«תמונת מצב»** (PROPOSED). Under it, the sync sentence,
   verbatim, as one line.
1. **«היום»** (BORROWED: the tab's word).
   - The hero: the number of men on a site today, ≥ 48 px (51 with the mode), labelled
     `STATUS_TEXT.heroLabel(n)` = **`n === 1 ? 'עובד היום' : 'עובדים היום'`** (PROPOSED), with
     `STATUS_TEXT.inSites(n)` = **`n === 1 ? 'באתר אחד' : \`ב-${n} אתרים\``** (PROPOSED) under it
     (the label no longer says «באתרים», so the two lines do not repeat it). With nobody:
     **«עוד אין היום אף עובד באתר.»** (PROPOSED) and no hero.
   - `journeyCrewWords(...)` (BORROWED).
   - A thin segmented bar of today's worker-site counts per site in `siteColorVar` (sitecolor.js:40),
     2 px surface gaps, `aria-hidden`. Under it one line per active site with men: a swatch, the name
     (`isolate`), the count, and **`רימא ${n}`** where n > 0 (the template PROPOSED; «רימא» BORROWED,
     js/ui/day.js:1457). The lines carry every number the bar draws.
   - Door: «פתיחת היום לעריכה».
2. **The next working day**, headed `JOURNEY_TEXT.forDay(...)` (BORROWED): its crew words; the
   ride words when rides are on; `${JOURNEY_TEXT.sendWorkers}: ${SEDER_TEXT.progress(done, total)}`
   (BORROWED: «הודעה לכל עובד: נפתחו 3 מתוך 12») when there is a list. Door: the journey's entry.
3. **«חשבונות ומקדמות»** (PROPOSED).
   - Drawn at once (dates and counts only), two lines:
     - `STATUS_TEXT.nextPayday(day, date, isToday)` =
       **`` `יום התשלום הבא: ${isToday ? 'היום, ' : ''}${day} ${date}` ``** (PROPOSED; «היום, » the
       same words track `payday` proposes for its card), `day` = `hebrewDayName`, `date` =
       `formatShortDate` (dates.js:272), `isToday` = `E === today`;
     - `STATUS_TEXT.worked(n)` = **`` `עבדו בתקופה: ${n}` ``** (PROPOSED) - the men counted above;
       when both cycles end on E, `STATUS_TEXT.workedBoth(w, b)` =
       **`` `עבדו בתקופה: ${PAY_CYCLE_LABELS.weekly}: ${w} · ${PAY_CYCLE_LABELS.biweekly}: ${b}` ``**
       (PROPOSED template, BORROWED words, reports.js:564 - «שבועי: 8 · דו־שבועי: 4», never a number
       before a singular adjective). Door: as the table says.
   - The close line, at once, only while the reminder's line is up: `CLOSE_REMINDER_TEXT.line(closeReminderShown)`
     (BORROWED, the owner's own sentence) with its door. Never read here, never a placeholder for it,
     no "all closed" claim when it is absent.
   - Read after paint; meanwhile `WEEKLY_CLOSE_TEXT.reading` «מחשב את החשבונות…» (BORROWED) in the
     place the board's lines will take (no figure of an older reading ever shown as current):
     `${OWES_TEXT.total}: ${owesMoney(total)}` and `owesCountLine(read)` (BORROWED) with its door;
     or `OWES_TEXT.none`; or, gate shut/unapproved, `${OWES_REUSED.recorded}: ${owesMoney(total)}`.
4. **«12 השבועות האחרונים»** (PROPOSED).
   - The caption, always above the grid: `STATUS_TEXT.pulseCaption(a, b)` =
     **`` `בממוצע ${a} עובדים ביום עבודה ב-4 השבועות האחרונים, ו-${b} ב-4 השבועות שלפניהם.` ``**
     (PROPOSED); with no working day in the four before: **`` `בממוצע ${a} עובדים ביום עבודה ב-4 השבועות האחרונים.` ``**
     (PROPOSED); with none at all, no caption.
   - The grid (HTML spans, not SVG: scout-ui §g, the ruler's blind spots). Each row is ONE button,
     full width, ≥ 44 px (52), its Friday's `formatShortDate` written at its start (above), named
     `STATUS_TEXT.weekName(range, total, days)` =
     **`` `שבוע ${range}: ${total === 1 ? 'יום נוכחות אחד' : `${total} ימי נוכחות`} · ${days}` ``** (PROPOSED; `range` = `dateRange`,
     `days` = `${hebrewDayName} ${n}` joined by « · »); its end shows the total under the column head
     «סה״כ» (BORROWED, `OWES_TEXT.sum`).
   - The legend: five swatches between **«מעט»** and **«הרבה»** (both PROPOSED).
   - **«לחיצה על שבוע פותחת אותו במסך השבוע.»** (PROPOSED). The month board's door when present.
5. **«האתרים»** (PROPOSED). Every site with own work in the last eight weeks; active first by this
   month's own count, then archived with «לא פעיל» (BORROWED). A row is ONE button (→ the site card):
   swatch, name, the big number with **«ימי עובד־אתר החודש»** (PROPOSED; the month SO FAR, up to
   today, as the strip), `רימא ${n}` when n > 0,
   the phase word in a chip - **«בעלייה»**, **«בירידה»**, **«חדש»**, **«שקט»** (all PROPOSED) - and the
   eight-week strip (bars in `--ink-3`, the latest week `--accent`, `aria-hidden`; heights against
   the site's own eight-week maximum). Its name: `STATUS_TEXT.siteName(name, count, weeks)` =
   **`` `${name}: ${count === 1 ? 'יום עובד־אתר אחד' : `${count} ימי עובד־אתר`} החודש · 8 השבועות האחרונים: ${weeks}` ``** (PROPOSED; weeks =
   the eight numbers joined by « · »; the phase word appended when there is one). Under the list:
   **«בעלייה או בירידה: כמה עובדים היו ביום עבודה ב-12 ימי העבודה האחרונים, לעומת 24 ימי העבודה שלפניהם. חדש: אתר שהתחיל לעבוד ב-12 ימי העבודה האחרונים. שקט: אתר פעיל שלא עבד בו אף עובד ב-5 ימי העבודה האחרונים.»**
   (PROPOSED; the numbers in it are the constants of the rule, and the suite reads them from the
   constants so a constant changed alone fails). A site outside the roster is a plain row (no
   button, no card behind it), with the same words. Then, apart, only when > 0: **`` `${YOSEF_GEVES_TITLE} החודש: ${n}` ``** (PROPOSED
   template, BORROWED title) and `YOSEF_GEVES_NOTE` (BORROWED). None worked:
   **«לא נרשמה עבודה באתרים ב-8 השבועות האחרונים.»** (PROPOSED).
6. **«המכשיר הזה»** (PROPOSED): the backup's sentence (BORROWED, backup.js), `BACKUP_REMINDER`
   (BORROWED) when due, and the two doors «ענן וסנכרון», «גיבוי».
7. **«סגור»** (BORROWED) in the frame.

`STATUS_TEXT.door` = **«תמונת מצב»** (PROPOSED; the door's words when the chip is hidden) and
`STATUS_TEXT.doorName(label)` = **`` `תמונת מצב · ${label}` ``** (PROPOSED; the door's accessible
name - the visible label is inside it).

## Floors and looks

- 320x568, 375x667, 440x956; both schemes; «תצוגה גדולה» on and off; text doubled (the cascade
  rewrite `doubleEveryFontSize`, tests/mobile.test.mjs:755-842, because the dialog redraws). No
  sideways page scroll; the dialog's last control reachable.
- App floors: targets 44 × 44, inputs n/a, no letter or digit under 14 px, 4.5:1 on the ground
  really painted (the ruler, tests/screens.mjs `measureInPage`). Large display: nothing under
  18 px, nothing lighter than 500, 7:1, targets 52.
- The look is css/design.css, inside its `@media screen`, ONE commented block at the very end of
  the layer (before the file's last `}`); the door's hit area (a mechanism, the 44 px floor) beside
  `.sync-chip` in css/app.css:309-325. Every font-size, line-height and font-weight added is
  restated in css/large.css block 3, one for one, with the original's importance (large.css:54-57
  mapping), at the end of block 3 (before «---- 4.» at ~:1040). No `--site-N` in large.css.
- The ramp: five new tokens `--pulse-1..5` (and nothing else) in design.css under `:root`
  (light), `:root[data-theme="dark"]` and `@media (prefers-color-scheme: dark) :root:not([data-theme="light"])`
  (design.css:41/85/109). One hue, "more" darker in the light scheme and brighter in the dark.
  Revision 2: proposal-wow §1.4's values put the lightest step at about 2:1 on the light surface
  (#9eb6e7 on white is 2.04:1), under the 3:1 WCAG 1.4.11 asks of a graphic that carries meaning -
  so the builder picks the five values per scheme and they must hold, measured from computed styles
  (criterion 15): the LIGHTEST step ≥ 3:1 against `--surface` in both schemes (a 0 cell is the
  surface itself, so this is also "an empty day is told from a slow one"); lightness strictly
  monotone; each step ≥ 1.25:1 from its neighbour. The values chosen go in the report with their
  ratios. Site colours only for identity,
  always beside a written name and number (they are 1.5-2.9:1 on the dark grounds, scout-ui §g).
- Charts are HTML spans with their text twins; no SVG text anywhere.

## Performance budget

| what | budget | how measured |
|---|---|---|
| `statusFacts(today)` - everything but the money - on a season (40 men, 6 sites, 2026-01-01..2026-11-19, ~277 day keys, approval recorded) | ≤ 60 ms median of 5 (components measured ≤ 25 ms, proposal-wow §1.1) | Node, tests/status.test.mjs, `performance.now()`, the measured number printed |
| the money read (the board only) when nothing is kept, on the screens.mjs seed / on a season whose periods are closed in order (scout-api 7.2 "D": `owesRead` inside `weeklyCloseOnce` measured 29 ms) | ≤ 300 ms / ≤ 300 ms | Node, same suite |
| the money read on a season NOBODY closed (scout-api "B": 41 men, 277 day keys, 637 advances; `owesRead` inside `weeklyCloseOnce` measured 309 ms, bare 2,835 ms - program/season-open.txt) | ≤ 900 ms | Node, same suite, printed |
| an open after a write ON THE DAY SCREEN (a commit through `State` with `currentView === 'day'`, then `openStatus()`), on that season | exactly ONE `owesRead` and ZERO `weeklyCloseRead`, in Node and in the browser; in the browser at 4x CPU: the dialog painted (sections 0-2, 4-6, the placeholder) ≤ 1,200 ms after the tap and the board's lines ≤ 4,000 ms after that paint | spies; browser, the season seeded in the page with its advances |
| the money read when `OWES_KEPT` is fresh | 0 calls to `owesRead`; the lines in the first paint | spies |
| `weeklyCloseRead`, `closeReminderReadCount`, `closeReminderRefresh` from this file | NEVER (0 calls over every row above, every redraw and every door) | spies |
| a redraw under the open dialog (a commit or an adopted snapshot) | the cheap sections redrawn in the same `render()`; the board re-read at most ONCE, after the draws have stopped for 1.5 s (closereminder.js:263's rule) | spies, Node and browser |
| `render()` with the dialog shut | calls nothing of this file but `renderStatusIfOpen` (returns at its first line); 0 calls to `invoiceByDate`/`invoiceWithoutRima`/`payrollReport` from it over 20 renders | spies in Node |
| open → the dialog painted with sections 0-2 and 4-6 and the money placeholder | ≤ 1200 ms at 4x CPU (`Emulation.setCPUThrottlingRate`, tests/removepace.browser.mjs:160) on a season seeded in the page (removepace's `seedSeason` pattern) | browser suite, `requestAnimationFrame` timestamp after `openStatus()` |

## Success criteria

New suites: `tests/status.test.mjs` (`test:status`, appended to `npm test`) and
`tests/status.browser.mjs` (`test:status-browser`, appended to `test:all`), both rows in
tests/README.md; no new helper file (seasons are seeded inside each suite).

Node (tests/status.test.mjs, on the harness devices with `tests/moneydom.mjs`, seeded records with
a seeded PRNG, both cycles, Rima, יוסף גבס, an archived site, a Saturday with work, rides on and
off, both gate readings):
1. «היום»: the hero, the words and every site line equal their sources (table above) on 30 seeded days.
2. The next working day: the date is `journeyDefaultDate` (a Friday evening → Sunday; a recorded
   Saturday is opened); the crew, ride and seder lines equal the journey's own functions (the ride
   line equal to `journeyRideWords(journeyRideStatus(transportContext(d), transportDayOf(d)))` asked
   on a TWIN device, so this device never calls `transportDayOf`); the ride line absent with rides
   off; `transportDayOf`, `transportLoad` and `transportPrune` never called on this device (spies).
   Fixtures (revision 2): (a) a stored day with two men marked as getting there another way
   (`status`), one vehicle kept home (`unavailable`) and NOBODY seated - the line counts the riders
   the journey counts, not every man on a site; (b) the same day held only in the session
   (`transportDays[d]`, the disk refused it) - the session's copy is read; (c) the day's bytes damaged
   - no ride line; (d) `farkadTransport:settings` damaged and not yet loaded this session - no ride
   line, and `censusOnly` plus every Store key byte for byte unchanged across opening the status and
   every redraw (no `:unreadable` copy appears); (e) no day key at all - the empty day, as the journey.
3. The next payday: E, «היום, » exactly when E is today, and the counts (total and per cycle) on a
   Thursday whose period ends today, a Friday, a transition period (`periodRangeFor(...).transition`),
   only weekly / only fortnightly crews, an ARCHIVED man who worked in the period (counted), an active
   man with nothing recorded in it (not counted), a man with only an absence (not counted), a man with
   only an advance (not counted), and a date after today already recorded (counted). Each count equals
   the number of rows with `attendanceDays > 0` of `payrollReport(schedule, from, E)` among the men of
   that period - for periods no man has a closure of (the frozen-count rule, criterion 6).
4. The close line: present exactly while `#closeReminderLine` is on the glass, byte for byte its
   text, with the door; absent with the reminder switched off, ✕ pressed today, a count of 0, the
   gate shut and before the reminder has read - and in none of those cases is anything read for it
   (`weeklyCloseRead` spy at 0). The board's lines equal the board's own figures and words
   (`renderOwesInto`'s total and `owesCountLine`), under both gate readings; gate shut → «מקדמות
   רשומות».
5. The money reading inside `reportReadOnce` + `weeklyCloseOnce` equals the bare `owesRead` (JSON);
   the gate asked at most once and never planned on an approved record (counted as
   tests/reports.speed.test.mjs counts it); a fresh `OWES_KEPT` reused (0 reads); a moved record
   re-read exactly once; a write on the day screen then an open: one `owesRead`, zero
   `weeklyCloseRead`.
6. The pulse: every cell equals the week tab's tfoot rule for that date (`renderWeekTotals`'s
   count over `weekWorkers`) AND the union of `invoiceByDate(...).places[].days[].workerIds` per
   date (the rule `monthSummaryRead` keeps in its local `menOn`; on each month's busiest date the
   cell equals `monthSummaryRead(key).busiest.men`); every week's total equals the sum of those
   cells up to today. The payrollReport identity (total = Σ `payrollReport(week).attendanceDays`) is
   pinned ONLY for weeks no man has a closure of exactly that range, and a FIXTURE pins the
   exception: a weekly week closed and then a day of it corrected - the pulse follows the live
   record (the tfoot rule) and `payrollReport` over that week answers the closure's frozen basis,
   and the two differ by exactly the correction. Future dates are «·» and in no total; the Saturday
   column exactly when `anyRecordOnRestDay` holds for a Saturday of the twelve weeks (a fixture with a
   Saturday holding only an absence, and one holding only a Rima count); each row's written date is
   its Friday's `formatShortDate`; the shade steps and the caption's averages.
7. The sites: which, in what order; own + Rima = the billing count of `invoiceByDate(schedule,
   monthFrom, today)` per site; equal to `monthSummaryRead(key).sites` exactly when no date after
   today holds a record, and different by exactly tomorrow's count on a record whose seder for
   tomorrow is typed; the strip = Σ `countAt` per week; יוסף גבס (also up to today) in its own line
   and in no other number; a site outside the roster drawn as a plain row (no button) and an
   archived site as a button that opens its card.
8. The phase words on seeded seasons with PLANTED lifecycles: a site ramped down says «בירידה» within
   5 working days of the drop meeting the rule and while it holds; a steady site has no word on any
   evening of the season; «חדש», «שקט» and «בעלייה» each on the fixture made for it; under 36 working
   days of history, no word; the four thresholds pinned as constants, and the legend sentence's
   numbers read from those constants.
9. The device: the sync line is `#storageNotice`'s text; `backupAgeSentence` answers renderBackupAge's
   five sentences (none, unknown, today, yesterday, N days) and renderBackupAge's output is byte
   for byte what it was (tests/polish.*, tests/settings.browser.mjs stay green).
10. Every PROPOSED word pinned; every BORROWED word found in its owner's source;
    tests/reportnames.test.mjs's Hebrew/Arabic scan green.
11. The cost rows of the budget table.

Browser (tests/status.browser.mjs, Chromium 1194, touch, DPR 2):
12. The door at 320x568, 375x667, 440x956 × dark/light × the mode off/on, with the chip saying
    «שגיאת סנכרון», «מסונכרן», «38 ממתינים לשליחה» and hidden: the strip's height is what it is
    on the same page with the door's wrapper unwrapped (≤ 52 off, as tests/mobile.test.mjs:649 and
    tests/design.browser.mjs hold it; ≤ 60 on, except the longest chip at 320 with the mode, which
    wraps today already); the same at 667x375 (the tight day), 844x390 and 1024x768, where the tabs
    sit inside the strip; the door ≥ 44 × 44 (52); its name `תמונת מצב · <label>`; «הגדרות» whole
    on the glass.
13. A tap on the door opens the dialog entered at its title; Escape, the backdrop and «סגור» close
    it and give the focus back to the door; Tab stays inside; `midEdit()` (js/ui/offline.js) is
    `true` while the dialog is open and `false` once it is shut (the dialog is shown by
    `style.display = 'flex'`, the rule v205's automatic update waits on).
14. The money: with a stale `OWES_KEPT` the first paint holds «מחשב את החשבונות…» and no figure
    of the board; the lines replace it; with a fresh one the lines are in the first paint; the close
    line, when the reminder's line is up, is in the first paint either way.
15. The ramp: the five computed `--pulse-N` colours strictly monotone in lightness, the lightest
    ≥ 3:1 on `--surface`, each ≥ 1.25:1 from its neighbour, in both schemes; the values and their
    ratios printed.
16. Every door lands where the table says. A door to a `.modal` ends with the new dialog's title
    focused; a door to anything else ends - after `setTimeout(0)` and the task after it - with
    `document.activeElement` where the TARGET put it: the ⋯ heading `settingsJump` focused for both
    ⋯ doors (`#settingsDaily`, `#settingsBackups`), and never `#statusDoor`. With the month board
    present (the merged tree, or a stub that focuses a node of its own) the same holds for the
    board's title; the stub `openMonthBoard` is called once, with `(null, null)`, and NOT in the task
    that shut the dialog.
17. A commit under the open dialog redraws the cheap sections with `.modal-content.scrollTop`
    kept, and re-reads the money once after the draws stop for 1.5 s (closereminder.js:263's rule).
18. Floors on every phone, scheme and mode, and at doubled text: the ruler's checks
    (`measureInPage`), no sideways scroll, nothing cut, the last control reachable.
19. The open budget row (4x CPU, a season).
20. No uncaught error.
21. Nothing written: `censusOnly` (tests/census.mjs) and `JSON.stringify(State.schedule)` across
    opening, every redraw and every door - except the journey door, whose only byte is the
    journey's own key, equal to a press of `#journeyDockBtn` on a twin page under the same clock.

Registered (each moves nothing else): `tests/screens.mjs` gains `{ name: 'status - the whole
screen', scope: ['#statusModal'] }` (opened through `openStatus()`, waited until the money is
read) and `{ name: 'status - the door with no chip', scope: ['.topbar'] }` (chip hidden), both
after the 'the close reminder line' entry; nothing else in that file moves.

Existing suites that must stay green, untouched in their expectations: build (except the stamp
checks below), smoke, mobile, design-browser, navigation-browser, largetext + largetext-browser
(BASE `topbar: 44` at 440 unchanged), settings-browser, settings-order-browser, polish +
polish-browser, holiday-browser, bars-stale-browser, print, whatsnew + whatsnew-browser, owes +
owes-browser, closereminder + closereminder-browser, journey + journey-browser, reports-speed,
nonassertions, gate-integrity (but its stamp section), isolation.

## Base

- `origin/main` = `6ab193d68c960e4a56d947673c282b867acd258f`; branch `feat-status`; worktree
  `/home/user/farkad/.claude/worktrees/feat-status` (`git worktree add -b feat-status <path>
  6ab193d…`), `npm ci` there.
- MUST NOT be touched: `js/model/**`, `js/sync/**`, `js/state.js`, `js/store.js`,
  `js/recovery.js`, `firestore.rules`, `functions/**`, `firebase.json`, `.github/**`; the three
  stamps (index.html:108, js/app.js:7, sw.js:24); `docs/releases.md`, `CLAUDE.md`,
  `js/ui/whatsnew.js`, `js/ui/offline.js`, `tests/update.test.mjs`; the other tracks' files
  (`js/ui/payday.js`, `js/ui/monthboard.js`, `js/ui/yearsummary.js`, `js/ui/week.js`,
  `js/ui/printout.js`, `js/ui/monthsummary.js`, `js/ui/owes.js`).
- Expected red on this branch, and only this: tests/build.test.mjs «the stamps were moved by the
  commit that moved the bytes» (and its sw.js line) and the same check in
  tests/gate.integrity.test.mjs §4 - the integrator moves the stamps. Everything else green.
- Browsers: `export PLAYWRIGHT_BROWSERS_PATH=/tmp/claude-0/-home-user-farkad/d6a64352-db1a-5c3b-b54d-5c09103f2419/scratchpad/pw1194`;
  no `playwright install`; no emulator suites. Commit after every step; never `--amend`; every
  commit ends with the session's two attribution lines (`Co-Authored-By: Claude Opus 5.5
  <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_01AczE1SUjJY47GFH8eTREya`).
  No push, no PR.

## «מה חדש» (for the integrator; PROPOSED)

`{ title: 'תמונת מצב', text: 'לחיצה על מצב הסנכרון למעלה, ליד שם האפליקציה, פותחת תמונת מצב: היום, הסידור הבא, הכסף, 12 השבועות האחרונים והאתרים.', where: 'למעלה, ליד שם האפליקציה ← מצב הסנכרון (או «תמונת מצב»)', go: 'status' }`
- Revision 2: it names the CHIP («מצב הסנכרון», beside the app's name - renderSyncChip's own
  description, js/app.js:186-190), never «שורת הסנכרון»: the line is `#storageNotice`
  (index.html:242), which opens nothing. On a phone with no chip the door shows «תמונת מצב», which
  the parenthesis names.
- `go: 'status'` only navigates: shut the card and ⋯, then focus `#statusDoor` without pressing it.

## Interfaces

Provided (globals of `js/ui/status.js`):
- `openStatus()` → `boolean`; `closeStatus()`; `statusIsOpen()` → `boolean`; `renderStatusIfOpen()`;
  `statusDoorSync(chipNode, label)`; `statusFacts(today)` → plain data, no DOM:
  `{ today, sync, crew: {placed, words, sites:[{placeId, name, count, rima}]}, next: {date, heading, words, rides|null, seder|null}, payday: {date, isToday, worked, weekly, biweekly} | null, close: number | null (the mirrored count), pulse: {weeks:[{from, to, label, days:[{date, n|null}], total}], saturday, max, caption}, sites: [{placeId, name, active, listed, month, rima, weeks:[8 numbers], phase|null}], yosef, backup: {sentence, reminder} }` - `next.rides` null when rides are off or either ride guard holds; `listed` false for a site outside the roster (a plain row); the board's money is NOT in it (read after paint, `statusMoneyFacts()`);
  `statusMoneyFacts()` → the board's lines as plain data (`{ folded, total, countLine } | { none: true }`),
  ONE call of `reportReadOnce(() => weeklyCloseOnce(() => owesReadNow()))`, made only after paint;
  `STATUS_TEXT`; the node `#statusDoor`.
Consumed, each behind `typeof` (absent → the stated fallback, and the branch's own suite runs that way):
- `openPayday()` and `PAYDAY_TEXT.entry` (track `payday`) → else «דוחות» → `showView('reports')`.
- `openMonthBoard(key, placeId)` and `MONTH_BOARD_TEXT.door` (track `monthboard`) → else no door.
  The board is NOT a dialog: called one task after `closeStatus()` (`setTimeout(go, 0)`), never in
  the same task (the door rule above).
  The suite proves both paths with stubs (a recorded stub `openPayday`/`openMonthBoard` is called
  once with the expected arguments, `openPayday` in the task that shut the dialog and
  `openMonthBoard` in a later one; without them the fallbacks).
- Read, never written: `closeReminderShown` (js/ui/closereminder.js:188) and `CLOSE_REMINDER_TEXT`;
  `transportSettingsMemory`, `transportDays`, `TRANSPORT_SETTINGS_KEY`, `TRANSPORT_DAY_PREFIX`,
  `transportJson`, `transportReadDay`, `transportEmptyDay` (js/ui/transport.js) for the two ride
  guards; `anyRecordOnRestDay` (js/ui/day.js) for the Saturday column.
- For the integrator, on the merged tree: one check that the status → «לוח חודשי» door ends with
  `document.activeElement` on the board's title, and that both ⋯ doors end on the heading
  `settingsJump` focused.

## The report

Branch and final commit; every hook added to an existing file; where each figure comes from;
every new string; expectations moved (none expected); every suite's exit code and counts, run one
by one on the final commit from a clean tree; the release-entry text and the CLAUDE.md file-list
line for the integrator; screenshots (synthetic names, 440x956 dark and 320x568 with the mode,
JPEG) in `/tmp/claude-0/-home-user-farkad/d6a64352-db1a-5c3b-b54d-5c09103f2419/scratchpad/feat-status/`;
what was not verified (it has not been tried on a real phone); open questions with a default -
at least: whether the owner wants the close count read on this screen when the reminder's line is
down (default: no - the desk reads it, and a second 1.5 s reading here is the cost revision 2
removed).
