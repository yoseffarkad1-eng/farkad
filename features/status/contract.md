# Contract — «תמונת מצב»: where the business stands, on one screen (track `status`)

Base `6ab193d68c960e4a56d947673c282b867acd258f` (origin/main, stamps v204). Branch `feat-status`,
worktree `/home/user/farkad/.claude/worktrees/feat-status`. One of four tracks of the
2026-11-19 program; the integrator ships them together as v206.

The owner asked (2026-11-19, in Arabic) for "real, serious, heavy features that lift the app
several levels". This track is the one he will open first: ONE screen that answers "where does my
business stand right now" - today, the next working day, the money, the last twelve weeks and the
sites - and from which every line is one tap from the screen that owns it. It is a READING: it
prices nothing, counts what existing functions return, and writes nothing.

## Goal

After this ships the owner taps the sync chip at the top of any screen and reads, top to bottom,
in a fixed order:

1. the sync sentence he tapped, in full;
2. today: how many men are on a site and on how many sites, who is not recorded, who is absent,
   and each site's count;
3. the next working day (never "tomorrow" on a Friday evening): how the seder stands, the rides,
   how many of the per-man messages were opened;
4. the money: when the next payday is and for how many men, how many accounts wait to be closed,
   and what the men owe - in the existing screens' own sentences, read after the dialog has
   painted;
5. the last twelve weeks as a heat map of men per day, with its finding said in one sentence;
6. every site worked in the last eight weeks: this month's worker-site days, Rima beside it, an
   eight-week strip and one word when the site is rising, falling, new or quiet;
7. this phone: the backup's age.

Every section ends in a button that only navigates to the screen that owns it.

## Out of scope

- Any figure of money not already produced by an existing reading (no payday total, no sum of a
  weekly and a fortnightly band, no forecast, no profit, no wages per site).
- The payday amounts themselves: they are track `payday`'s («יום תשלום»). Here the money section
  links to it and shows only the two money sentences that already exist (the close reminder's
  count, the board's total).
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
| its rides (only when `journeyRidesOn()`, journey.js:360) | `journeyRideWords(journeyRideStatus(transportContext(d), transportPeekDay(d).day \|\| transportEmptyDay()))` (journey.js:224/245, js/ui/transport.js:754/671/479). PEEK ONLY: never `transportDayOf`, `openTransport`, `transportPrune` (transport.js:651/698). `transportContext` loads the vehicle list into the session as the journey already does; on unreadable settings it puts the bytes aside exactly as the rides screen does - an existing behaviour of that store, not a new writer, and absent on every seeded record of the suites. |
| its per-man messages | `run = sederRun(sederCrew(State.schedule, d, State.layer), d)` (js/ui/seder.js:331/102); said `${JOURNEY_TEXT.sendWorkers}: ${SEDER_TEXT.progress(run.done, run.total)}` only when `run.total > 0` |
| the next payday | for every ACTIVE man `periodRangeFor(worker, today)` (js/dates.js:213); E = the earliest `.to` ≥ today; the men whose period ends on E, counted by `.cycle`. Dates and the roster only: no money. |
| the accounts to close | `closeReminderCount(weeklyCloseRead(State.schedule, today, at))` (js/ui/closereminder.js:102, js/ui/weeklyclose.js:542). Taken from `CLOSE_REMINDER_KEPT.count` (closereminder.js:182) when `CLOSE_REMINDER_KEPT.key === closeReminderKey(State.schedule, today)` (closereminder.js:190); otherwise read after paint (below). |
| what the men owe | `owesKeptNow()` / `owesReadNow()` (js/ui/owes.js:656/663) → `read.total` said by `owesMoney` (owes.js:483) under `OWES_TEXT.total` when `read.folded`, under `OWES_REUSED.recorded` when not; `owesCountLine(read)` (owes.js:487). None owe: `OWES_TEXT.none`. |
| the pulse, a cell | the men with an entry and not absent on that date - the week tab's «סה"כ עובדים» rule (`renderWeekTotals`, js/ui/week.js:290-318), computed from ONE `invoiceByDate(State.schedule, from, today)` (js/model/money.js:563) as the union of each day's `workerIds` per date - the rule `monthSummaryRead` already uses for `menOn` (js/ui/monthsummary.js:218-221) |
| the pulse, a week's total | Σ of its cells = Σ `payrollReport(schedule, weekFrom, min(weekTo, today)).attendanceDays` (money.js:210) - pinned, not used to draw |
| a site's month | `invoiceWithoutRima(State.schedule, monthFrom, monthTo, place.id).total` (money.js:531) over the calendar month of `monthSummaryRange(monthSummaryKeyOf(today))` (monthsummary.js:113/104) - the same range «סיכום חודש» reads; Rima beside it: `rimaReport(State.schedule, monthFrom, monthTo, place.id).total` (schema.js:3077). Their sum equals the billing count `invoiceByDate(...).places[...].workerDays` = `monthSummaryRead(key).sites[...].days` (pinned). |
| a site's 8-week strip | Σ per week of `invoiceWithoutRima(State.schedule, from8, today).countAt(place.id, date)` from ONE call over the eight weeks |
| a site's phase word | the rule below, over `dayCheckIsWorkingDay(schedule, date, 'actual')` (js/ui/daycheck.js:152) and the same `invoiceWithoutRima` counts |
| «עובדי יוסף גבס» this month | `yosefGevesReport(State.schedule, monthFrom, monthTo).total` (schema.js:3338), one line of its own after the sites, with `YOSEF_GEVES_NOTE` (js/ui/reports.js:2396); in NO other number on the screen |
| the backup's age | `backupAgeSentence(Store.get(LAST_BACKUP_KEY), todayStr())` - a PURE function extracted, behaviour-preserving, from `renderBackupAge` (js/ui/backup.js:988-1007), which then calls it; `BACKUP_REMINDER` when `backupReminderDue(...)` (backup.js:1061/1066) |

**The money is read the house way** (scout-api 7.4): ONE synchronous call
`reportReadOnce(() => weeklyCloseOnce(() => statusMoneyRead(today, at)))` (js/ui/reports.js:111,
weeklyclose.js:227), both guarded by `typeof`; never inside `render()`, never before the dialog has
painted (`owesAfterPaint`, owes.js:780: `requestAnimationFrame(() => setTimeout(run, 0))` plus the
400 ms timer); kept as `STATUS_MONEY_KEPT = { key: owesKey(State.schedule, today), facts }`
(owes.js:644). With both other readings' kept values fresh (`owesKeptNow()` non-null and
`CLOSE_REMINDER_KEPT` under this key) nothing is read at all. Never `REPORT_DEDUCTIONS`, never a
write, never an `await` inside the read.

**The gate.** Shut (`advanceCarryEnabled()` false) or unapproved: the board's own words and nothing
of the new arithmetic - «מקדמות רשומות» and the sum handed over, exactly as `renderOwesInto` draws
it (owes.js:690-693; tests/approval.test.mjs is the rule). The close line is absent
(`closeReminderCount` answers 0 when `read.gate !== true`).

**The phase word** (one per site, none for a steady site; history needed: 36 working days, else
no word). R = the last 12 working days up to today, B = the 24 working days before R. `own(d)` =
the site's own men that working day (0 counts). Constants in the file, pinned:

| word | rule (first that applies, in this order) |
|---|---|
| «שקט» | the site is ACTIVE, had own men on some working day of B, and none on each of the last 5 working days |
| «יורד» | mean(B) ≥ 4, mean(R) ≤ 0.6 × mean(B) and mean(B) − mean(R) ≥ 3 |
| «חדש» | the site's first own day in the whole record is inside R, and it has ≥ 10 own worker-site days since |
| «עולה» | mean(B) ≥ 2, mean(R) ≥ 1.6 × mean(B) and mean(R) − mean(B) ≥ 3 |

**The pulse.** 12 rows, newest on top, each a Friday-anchored week (`snapToWeekStart`,
js/dates.js:41) - the current week included. Columns: the six days in `workerCardWeekdays()` order
(js/ui/workercard.js:380), headed by `HEBREW_DAY_LETTERS` (js/ui/dom.js:163); a seventh, «ש׳», for
every row only when a Saturday inside the twelve weeks holds work. Dates after today are «·» and
counted nowhere. A cell's shade is step `ceil(5 × n / max)` of a five-step ramp, max = the largest
cell of the twelve weeks; n = 0 is the surface with a hairline. Cells carry NO digits (they do not
fit at 320 or with the large display, measured in proposal-wow §1.3): the week's total is written
at the row's end, and the row's accessible name says every day. The caption: averages of men per
WORKING day (a date with n > 0) over the last four weeks and the four before, to one decimal.

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

**Every door closes the dialog first, then calls the target's own opener** (siteCardGoMan's rule,
js/ui/sitecard.js:507-519: when one dialog shuts and another opens in the same step, focus the new
title by hand). None of them writes:

| door | words | action |
|---|---|---|
| today | «פתיחת היום לעריכה» (borrowed, js/ui/week.js:225) | `State.date = today; dayChosenByHand(); showView('day')` (js/app.js:367) |
| the next working day | `journeyDayEntryWords(Date.now(), today)` (journey.js:1078 - the dock button's own title: «בניית סידור ליום ראשון 22/11/2026», or «המשך בניית הסידור · שלב N מתוך 5») | `journeyStart()` (journey.js:368) - the dock button's own action (index.html:292). The journey then writes its own place key (`farkadSederJourney`) exactly as a press of `#journeyDockBtn` does: that is the journey's existing behaviour, and the only byte any door here causes (criterion 21 holds it to the dock's bytes). |
| the next payday | `PAYDAY_TEXT.entry` («יום תשלום») when `typeof openPayday === 'function'` (track `payday`); otherwise «דוחות» (the tab's own word) | `openPayday()`; otherwise `showView('reports')` |
| the close line | `CLOSE_REMINDER_TEXT.open` «לסגירת שבוע» (borrowed) | `openWeeklyClose()` (weeklyclose.js:787), its title focused by hand |
| the board | `OWES_TEXT.board` «מי חייב כסף» (borrowed) | `OWES_PAGE = null; ADVANCE_WORKER = null; showView('advances')` |
| a week of the pulse (the row) | the row itself, named by `STATUS_TEXT.weekName(...)` | `showView('week'); setWeekFromDate(friday); render()` (week.js:33; showView resets the week to the grid, app.js:88-92) |
| under the pulse | `MONTH_BOARD_TEXT.door` («לוח חודשי») only when `typeof openMonthBoard === 'function'` (track `monthboard`) | `openMonthBoard(null, null)` |
| a site (the row) | the row itself, named by `STATUS_TEXT.siteName(...)` | `openSiteCard(place.id)` (sitecard.js:426), its title focused by hand |
| the cloud | «ענן וסנכרון» (borrowed: the ⋯ card's title, index.html ~:334) | `openSettings(); settingsJump('settingsDaily')` (js/ui/settings.js:17/40) |
| the backup | «גיבוי» (borrowed: the ⋯ row's title, index.html ~:383) | `openSettings(); openSettingsFold('settingsFoldBackup'); settingsJump('settingsBackups')` (settings.js:95) |

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
     **«עובדים באתרים היום»** (PROPOSED), with `STATUS_TEXT.inSites(n)` =
     **`n === 1 ? 'באתר אחד' : \`ב-${n} אתרים\``** (PROPOSED). With nobody:
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
   - Drawn at once (dates only): `STATUS_TEXT.nextPayday(day, date, men)` =
     **`` `יום התשלום הבא: ${day} ${date} · ${men}` ``** (PROPOSED), `day` = `hebrewDayName`,
     `date` = `formatShortDate` (dates.js:272), `men` = `countedIn(n, 'עובד אחד', 'עובדים')`
     (BORROWED, reports.js:4483); when both cycles end on E, followed by
     `STATUS_TEXT.payCycles(w, b)` = **`` `${w} ${PAY_CYCLE_LABELS.weekly}, ${b} ${PAY_CYCLE_LABELS.biweekly}` ``**
     (PROPOSED template, BORROWED words, reports.js:564) in parentheses. Door: as the table says.
   - Read after paint; meanwhile `WEEKLY_CLOSE_TEXT.reading` «מחשב את החשבונות…» (BORROWED) in the
     place the two lines will take (no figure of an older reading ever shown as current):
     - `CLOSE_REMINDER_TEXT.line(count)` (BORROWED, the owner's own sentence) with its door - only
       when count > 0 (no "all closed" claim: held men are not in the count);
     - `${OWES_TEXT.total}: ${owesMoney(total)}` and `owesCountLine(read)` (BORROWED) with its door;
       or `OWES_TEXT.none`; or, gate shut/unapproved, `${OWES_REUSED.recorded}: ${owesMoney(total)}`.
4. **«12 השבועות האחרונים»** (PROPOSED).
   - The caption, always above the grid: `STATUS_TEXT.pulseCaption(a, b)` =
     **`` `בממוצע ${a} עובדים ביום עבודה ב-4 השבועות האחרונים, ו-${b} ב-4 השבועות שלפניהם.` ``**
     (PROPOSED); with no working day in the four before: **`` `בממוצע ${a} עובדים ביום עבודה ב-4 השבועות האחרונים.` ``**
     (PROPOSED); with none at all, no caption.
   - The grid (HTML spans, not SVG: scout-ui §g, the ruler's blind spots). Each row is ONE button,
     full width, ≥ 44 px (52), named `STATUS_TEXT.weekName(range, total, days)` =
     **`` `שבוע ${range}: ${total === 1 ? 'יום נוכחות אחד' : `${total} ימי נוכחות`} · ${days}` ``** (PROPOSED; `range` = `dateRange`,
     `days` = `${hebrewDayName} ${n}` joined by « · »); its end shows the total under the column head
     «סה״כ» (BORROWED, `OWES_TEXT.sum`).
   - The legend: five swatches between **«מעט»** and **«הרבה»** (both PROPOSED).
   - **«לחיצה על שבוע פותחת אותו במסך השבוע.»** (PROPOSED). The month board's door when present.
5. **«האתרים»** (PROPOSED). Every site with own work in the last eight weeks; active first by this
   month's own count, then archived with «לא פעיל» (BORROWED). A row is ONE button (→ the site card):
   swatch, name, the big number with **«ימי עובד־אתר החודש»** (PROPOSED), `רימא ${n}` when n > 0,
   the phase word in a chip - **«עולה»**, **«יורד»**, **«חדש»**, **«שקט»** (all PROPOSED) - and the
   eight-week strip (bars in `--ink-3`, the latest week `--accent`, `aria-hidden`; heights against
   the site's own eight-week maximum). Its name: `STATUS_TEXT.siteName(name, count, weeks)` =
   **`` `${name}: ${count === 1 ? 'יום עובד־אתר אחד' : `${count} ימי עובד־אתר`} החודש · 8 השבועות האחרונים: ${weeks}` ``** (PROPOSED; weeks =
   the eight numbers joined by « · »; the phase word appended when there is one). Under the list:
   **«עולה או יורד: כמה עובדים היו ביום עבודה בשבועיים האחרונים, לעומת ארבעת השבועות שלפניהם. שקט: אתר פעיל שלא עבד בו אף עובד בחמשת ימי העבודה האחרונים.»**
   (PROPOSED). Then, apart, only when > 0: **`` `${YOSEF_GEVES_TITLE} החודש: ${n}` ``** (PROPOSED
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
  (design.css:41/85/109). One hue, validated in proposal-wow §1.4 (light, few → many:
  `#9eb6e7 #809fdf #3054a7 #1d3f90 #0f2c75`; dark: `#324a7c #7d9fe5 #94b4f5 #afc9fe #cddeff`,
  "more" brighter in the dark). The lightest step ≥ 2:1 against `--surface` and each step's
  lightness monotone, measured from computed styles (criterion 15). Site colours only for identity,
  always beside a written name and number (they are 1.5-2.9:1 on the dark grounds, scout-ui §g).
- Charts are HTML spans with their text twins; no SVG text anywhere.

## Performance budget

| what | budget | how measured |
|---|---|---|
| `statusFacts(today)` - everything but the money - on a season (40 men, 6 sites, 2026-01-01..2026-11-19, ~277 day keys, approval recorded) | ≤ 60 ms median of 5 (components measured ≤ 25 ms, proposal-wow §1.1) | Node, tests/status.test.mjs, `performance.now()`, the measured number printed |
| the money read when nothing is kept, on the screens.mjs seed / on a season whose periods are closed in order (scout-api 7.2 "D") | ≤ 300 ms / ≤ 600 ms | Node, same suite |
| the money read when `OWES_KEPT` and `CLOSE_REMINDER_KEPT` are fresh | 0 calls to `owesRead` and `weeklyCloseRead` | spies |
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
   Saturday is opened); the crew, ride and seder lines equal the journey's own functions; the ride
   line absent with rides off; `transportDayOf` and `transportPrune` never called (spies).
3. The next payday: E and the per-cycle counts on a Thursday whose period ends today, a Friday, a
   transition period (`periodRangeFor(...).transition`), and only weekly / only fortnightly crews.
4. The money lines equal `CLOSE_REMINDER_TEXT.line(closeReminderCount(weeklyCloseRead(...)))` and
   the board's own figures and words, under both gate readings; gate shut → «מקדמות רשומות» and no
   close line; count 0 → no close line.
5. The money reading inside `reportReadOnce` + `weeklyCloseOnce` equals the bare reading (JSON);
   the gate asked at most once and never planned on an approved record (counted as
   tests/reports.speed.test.mjs counts it); kept readings reused (0 reads); a moved record re-read
   exactly once.
6. The pulse: every cell equals the week tab's tfoot rule for that date (`renderWeekTotals`'s
   count over `weekWorkers`) AND the union of `invoiceByDate(...).places[].days[].workerIds` per
   date (the rule `monthSummaryRead` keeps in its local `menOn`; on each month's busiest date the
   cell equals `monthSummaryRead(key).busiest.men`); every past week's total equals Σ `payrollReport(week).attendanceDays`, the current
   week's Σ up to today; future dates are «·» and in no total; the Saturday column exactly when a
   Saturday of the twelve weeks holds work; the shade steps and the caption's averages.
7. The sites: which, in what order; own + Rima = the billing count = `monthSummaryRead(key).sites`
   per site; the strip = Σ `countAt` per week; יוסף גבס in its own line and in no other number.
8. The phase words on seeded seasons with PLANTED lifecycles: a site ramped down says «יורד» within
   5 working days of the drop meeting the rule and while it holds; a steady site has no word on any
   evening of the season; «חדש», «שקט» and «עולה» each on the fixture made for it; under 36 working
   days of history, no word; the four thresholds pinned as constants.
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
    it and give the focus back to the door; Tab stays inside.
14. The money: with stale kept readings the first paint holds «מחשב את החשבונות…» and no figure;
    the lines replace it; with fresh ones the lines are in the first paint.
15. The ramp: the five computed `--pulse-N` colours monotone in lightness, the lightest ≥ 2:1 on
    `--surface`, in both schemes.
16. Every door lands where the table says, the new dialog entered at its title.
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

`{ title: 'תמונת מצב', text: 'לחיצה על שורת הסנכרון למעלה פותחת תמונת מצב: היום, הסידור הבא, הכסף, 12 השבועות האחרונים והאתרים.', where: 'למעלה ← שורת הסנכרון', go: 'status' }`
- `go: 'status'` only navigates: shut the card and ⋯, then focus `#statusDoor` without pressing it.

## Interfaces

Provided (globals of `js/ui/status.js`):
- `openStatus()` → `boolean`; `closeStatus()`; `statusIsOpen()` → `boolean`; `renderStatusIfOpen()`;
  `statusDoorSync(chipNode, label)`; `statusFacts(today)` → plain data, no DOM:
  `{ today, sync, crew: {placed, words, sites:[{placeId, name, count, rima}]}, next: {date, heading, words, rides|null, seder|null}, payday: {date, men, weekly, biweekly}, pulse: {weeks:[{from, to, days:[{date, n|null}], total}], saturday, max, caption}, sites: [{placeId, name, active, month, rima, weeks:[8 numbers], phase|null}], yosef, backup: {sentence, reminder} }`;
  `STATUS_TEXT`; the node `#statusDoor`.
Consumed, each behind `typeof` (absent → the stated fallback, and the branch's own suite runs that way):
- `openPayday()` and `PAYDAY_TEXT.entry` (track `payday`) → else «דוחות» → `showView('reports')`.
- `openMonthBoard(key, placeId)` and `MONTH_BOARD_TEXT.door` (track `monthboard`) → else no door.
  The suite proves both paths with stubs (a recorded stub `openPayday`/`openMonthBoard` is called
  once with the expected arguments; without them the fallbacks).

## The report

Branch and final commit; every hook added to an existing file; where each figure comes from;
every new string; expectations moved (none expected); every suite's exit code and counts, run one
by one on the final commit from a clean tree; the release-entry text and the CLAUDE.md file-list
line for the integrator; screenshots (synthetic names, 440x956 dark and 320x568 with the mode,
JPEG) in `/tmp/claude-0/-home-user-farkad/d6a64352-db1a-5c3b-b54d-5c09103f2419/scratchpad/feat-status/`;
what was not verified (it has not been tried on a real phone); open questions with a default.
