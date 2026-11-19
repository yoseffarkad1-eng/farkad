# Contract — «מי עבד איפה»: who worked where, on any day of the record (track `history`)

(Revision 2, 2026-11-19: the critic's nineteen points verified against the code and answered in
place; the list of what changed is the last section, «Revision 2». The product words changed -
«חיפוש בהיסטוריה» / «היסטוריה» are the advances page's words in this app - and the code's names
did not: the track, the file and every identifier stay `history`.)

Base `6ab193d68c960e4a56d947673c282b867acd258f` (origin/main, stamps v204). Branch `feat-history`,
worktree `/home/user/farkad/.claude/worktrees/feat-history`. Wave 2 of the 2026-11-19 program
(the owner: "زيد وتيره العمل واشتغل بقوه اكبر"); the integrator merges it with wave 1 as v206 or
v207.

A man rings: "I worked on 12/10 and it was a double day." A client writes: "who did you bill me
for at Ramat Gan in March?" Today the answer is on the record but nowhere in one place: the day
screen shows one date, the worker's card one month, the pay sheet a period in money, «כרטיס
אתר» one month of one site. This track is ONE dialog that asks the record three things - which
man (or everyone), which site (or every site), which range - and lists the matching days, newest
first, as the day screen words them, with the counts on top. It is a READING: counts and words,
not a shekel; it asks no money function and no gate; it writes nothing.

Everything below marked MEASURED was measured on the base by the probes in this directory
(`/tmp/claude-0/-home-user-farkad/d6a64352-db1a-5c3b-b54d-5c09103f2419/scratchpad/program/history/`:
`time-history.mjs`, `measure-entry.mjs`, `measure-card.mjs`, `measure-rows.mjs`,
`measure-frame.mjs`, their `.txt`/`.json` outputs, the probe trees `base`, `doorfind`,
`doorcard` and the trial-merge tree `trial`) - and, for Revision 2, by the critic's probes in
`critic/` (re-run where cited) and by `rev2/`: `time-history2.mjs`, `measure-rows2.mjs`,
`measure-finder2.mjs`, `measure-frame2.mjs` / `measure-frame3.mjs`, `select-above.mjs`, their
`.txt` outputs, and the probe tree `rev2/doorlast` (the finder's door placed last).

## Goal

After this ships the owner, on the day screen, taps «חיפוש עובד», types two letters of a name
and taps «איפה עבד» on the man found. One dialog opens on that man, every site, the last three
months, and shows:

1. the counts of what is listed, each the same number an existing report counts for the same
   days on the live record (the one exception, a closed period, is criterion 4) - and WHICH
   counts depends on what is chosen, because no existing function counts a double day or an
   extra hour per site (Revision 2):
   - no site chosen: «ימי נוכחות», «ימי עובד־אתר», «כפולים», «שעות נוספות», «נעדר» - the pay
     sheet's own counts (`payrollReport`) for the man, or summed over everyone;
   - a site chosen and one man: ONE count, «ימי עובד־אתר» - his days at that site, the
     invoice's own count of him there;
   - a site chosen and everyone: no tiles - the site's billing, in the site card's order and
     words, IS the count: «סה״כ ימי עובד־אתר» (what the client is billed), and when Rima's men
     were counted there «בלי עובדי רימא» and «סה״כ עובדי רימא» with its note; «עובדי יוסף גבס»
     apart again, with its note; then «מי עבד באתר», who worked there and on how many days. Each
     figure once, under the invoice's own name;
2. every matching day, newest first, grouped by month: the date with its weekday, the man (when
   everyone is chosen), and his day - with no site chosen, each site of his day in its colour
   with its name and the day's kind by the pay's own rule («רגיל», «יום כפול», «שעות נוספות»
   with the hours, «נעדר»); with a site chosen, THAT site's own entry, its kind and its hours as
   the day screen's row under that site reads it, and «2 אתרים» when he was at another site too
   that day (nothing of the other site is counted); a tap on a day opens that date on the day
   screen;
3. the same as text, shown before it leaves, through the day message's own two doors.

He changes the man (or «כל העובדים»), the site (or «כל האתרים») and the range («החודש», «חודש
שעבר», «3 החודשים האחרונים», «השנה», «מתחילת הרישום», «תאריכים אחרים» with two native date
fields) and the answer follows at once. The three example questions are answered so: "did Ahmad
work on 12/10, where, double?" - Ahmad, every site, «תאריכים אחרים» 12/10-12/10: one row; "when
did he last work at site X?" - Ahmad, site X, «מתחילת הרישום»: the first row, across a year's
turn too; "who worked at site Y in March?" - everyone, site Y, 01/03-31/03: «מי עבד באתר» and
the rows.

## Out of scope

- Any shekel: no rate, no «נצבר», no «לתשלום», no deduction, no advance, no payslip, no closed /
  not closed mark. No gate is asked because nothing gated is read (the site card's sentence,
  js/ui/sitecard.js:12-15).
- The frozen days of a closed period. The history is the LIVE record - what the day screen a
  row opens shows. A day corrected after its period was closed reads as corrected here, while
  the payslip in «דוחות» keeps what was paid (`workerDaysReport` answers the frozen days for an
  exact closed period, js/model/money.js:378-401). AND ONE WIDER CASE (Revision 2): a closure
  written before `periodTo` was recorded is matched on its opening day ALONE
  (`frozenPeriodFor`, js/model/schema.js:2319-2330; js/model/ledger.js:1106), so the money
  functions read it frozen for ANY range that starts on that day - «השנה» from 1 January,
  «החודש» from the 1st - whatever the range ends on. For this list's COUNTS AND ROWS that bites
  only when such a closure also carries a `basis` or `days` (`closedPeriods` folds them whatever
  `periodTo` says, ledger.js:1373-1377; `payrollReport` freezes counts only from a basis,
  money.js:352-368, `workerDaysReport` days only from `days`, :388-389): every closure written
  in this repository's history carries `periodTo` (ledger.js:991, 1057), and the old shape the
  code keeps reading recorded only what came off and the balance (closureFacts' own comment,
  ledger.js:836-837), so it changes no count. Both shapes are held by fixtures (criterion 4):
  the real old one agrees with the pay sheet; a hand-made one with a basis and days and no
  `periodTo` is read frozen by the pay sheet over every range starting on its day, and this
  list stays live. Named in «What it does NOT do». No mark on such rows - see there.
- Dates after today. Tomorrow's seder typed in the evening is a plan, not history: every range
  is read up to today and says so in its dates.
- Rima's or יוסף גבס's men by name (they are counts per site, never named); «עובדי יוסף גבס» in
  the text (the site card's rule for a text that may reach a client, js/ui/sitecard.js:36-39).
- Editing: a row only opens its day. No search inside notes; no Latin spelling read as a Hebrew
  name (the finder's own rule, js/ui/find.js:70-72).
- Paper, a picture, a file: it is a dialog (css/app.css:4147-4180); the workbook is «דוחות»'s.
- A door from the worker's card (measured below and left out: one entry, the finder's).
- Remembering the query: memory only, like every reading.
- `js/ui/offline.js` (v205), `js/ui/whatsnew.js`, `docs/releases.md`, `CLAUDE.md` (the
  integrator's), the three stamps.

## Data — reads only

Nothing in this track writes the record, the outbox, the cloud, a backup, a restore point, the
rescue file or ANY Store key, and it needs no preference. No field, no path, no migration: the
rollback is reverting the commit, with nothing on any phone to undo. Its only state is memory: `HISTORY`
= `null` when shut, else `{ workerId: string|null, placeId: string|null, range:
'thisMonth'|'lastMonth'|'last3'|'thisYear'|'all'|'custom', from, to, shown, textOpen }`
(`from`/`to` held for 'custom' only; `shown` = rows drawn, never more than `HISTORY_SHOWN_MAX`;
`textOpen` = the fold is open). A reload closes it; an automatic update (v205) never reloads
under it, because an open `.modal` is `midEdit()` (js/ui/offline.js:186-193).

THE ONE KEY THAT CAN MOVE BECAUSE OF THIS DIALOG IS NOT ITS OWN (Revision 2, MEASURED by
`critic/journey-door.mjs`, re-run in `rev2/journey-door.out`): at station 1 of «בניית סידור»
the day screen is the journey's editor and the journey follows every change of `State.date`
(js/ui/journey.js:583-589 → `journeyTouch` → `Store.set('farkadSederJourney')`, :338-357). A
row's door run as Revision 1 wrote it moved a journey for 11/11 to 26/10 and wrote the key. So
a row's door, while a journey is open (`typeof journeyStation === 'function' &&
journeyStation() > 0`), ASKS FIRST (`askConfirm`, the words in §«The screen»): «ביטול» changes
nothing - no date, no key; the confirming answer leaves the journey by the journey's own
`journeyLeave()` - exactly what its «יציאה» does (journey.js:424-432, 651): the frame goes, its
place is kept under its own key for three hours (`JOURNEY_RESUME_MS`, :304) and «בניית סידור»
brings him back to it - and only then opens the day. This file never calls `Store`; the bytes
that move are the journey's, written by its own function, on the person's own answer, and are
the bytes its «יציאה» leaves (criteria 12 and 26 measure both answers).

**The range** - `historyRange(key, today, chosen, firstDay)`, pure, `{ from, to }` or `null`:

| key | from | to (before the cut) |
|---|---|---|
| `thisMonth` | the 1st of today's month | its last day |
| `lastMonth` | the 1st of the month before | its last day |
| `last3` | the 1st of the month two before today's | the last day of today's month |
| `thisYear` | 1 January of today's year | 31 December |
| `all` (Revision 2) | the earliest key of `schedule.days` (today when the record holds no day) | today |
| `custom` | `chosen.from` | `chosen.to`; `null` when either is not `isRealDate` (js/model/schema.js:277) or `from > min(to, today)` - a start after the last day that would be read is the inverted range the reports refuse |

THE CUT: the reading uses `to' = min(to, today)`; the range line, every count, every row and
the text are of `[from, to']` and of nothing after today. Month arithmetic as
`setMonthRange` / `transportReportRange` do it (local noon, day 0 of the next month,
js/ui/reports.js:817-826, js/ui/transport.js:1939-1951) - never `toISOString`. `historyRange`
takes the schedule's first day as a fourth argument (`historyRange(key, today, chosen,
firstDay)`, still pure); `historyFirstDay(schedule)` is the one-line min over the keys.

The edges, deliberately (Revision 2): on the 1st of a month «3 החודשים האחרונים» is two
months and a day (01/09-01/11) and on 1 January «השנה» is one day - calendar months and the
calendar year, the current one in progress, like «החודש» on the reports screen; the range line
says the dates read, and «מתחילת הרישום» is the range that crosses a year's turn. They are
pinned as such (criterion 1), not "fixed" into rolling windows.

**The reading** - `historyRead(schedule, query, today)`, PURE (no DOM, no Store, no clock; the
suite scans it as find.test.mjs scans `findRead`). One pass, every record read through the
model's own primitives (file:line at the base):

| what | read from |
|---|---|
| the men | `schedule.workers` in roster order, active and archived (`active === false`, «לא פעיל»), or the one `query.workerId` |
| the dates | `Object.keys(schedule.days)` inside `[from, to']`, sorted newest first - the key set every report walks (`payrollReport`, js/model/money.js:210-213) |
| an absence | `isAbsent(schedule, date, id, 'actual')` (js/model/schema.js:2852) - a row of kind `absent`, listed ONLY when no site is chosen (an absence has no site) |
| his day | `entriesFor(schedule, date, id, 'actual')` (schema.js:2847); none → no row; a site chosen and no entry at it → no row |
| the names of sites | ONE map per reading over the WHOLE record, `placeLabelsIn(schedule)` (schema.js:1785, no span - the map the day screen and the week draw a day with, js/ui/day.js:1094, js/ui/week.js:230), read with `placeLabelFrom` (schema.js:1799): an unlisted site is «אתר שאינו ברשימה N» with the SAME N as on the day its row opens, whatever the range (Revision 2; MEASURED 4.7 ms a reading on the season, `rev2/time-history2.txt`, against 0.6 ms for a three-month span) |
| no site chosen: the sites of a row | the distinct `placeId`s of his entries, in their order |
| no site chosen: the kind | the pay's own rule (money.js:262): `double` when some entry's `entryRate` (schema.js:2826) is `RATE_DOUBLE`; else `extra` when some entry's rate is `RATE_EXTRA`; else `normal` - `workerDaysReport`'s live `doubled` (money.js:417) |
| no site chosen: the hours | Σ `entryExtraHours(entry)` (schema.js:2830) over his entries - the hours `payrollReport` counts (money.js:267), shown whenever > 0 |
| a site chosen: the row (Revision 2) | THAT site's entry and nothing else of the day: the first of his entries whose `placeId` is the site - the entry the day screen's row under that site reads (`entries.find(e => e.placeId === place.id)`, js/ui/day.js:1579-1581); its kind `entryRate(entry)`, its hours `entryExtraHours(entry)`; `split: true` when he had another entry that day (the day screen's «2 אתרים», day.js:1589-1594) - the other site named nowhere and counted nowhere |
| the site's own men (site chosen, everyone) | `invoiceWithoutRima(schedule, from, to', placeId).total` (money.js:531) |
| Rima there | `rimaReport(schedule, from, to', placeId).total` (schema.js:3077) |
| what is billed there | the `workerDays` of that site's row of `invoiceByDate(schedule, from, to').places` (money.js:563), 0 when none - own + Rima (pinned) |
| «עובדי יוסף גבס» there | `yosefGevesReport(schedule, from, to', placeId).total` (schema.js:3338) - in NO other figure |
| who worked there (site chosen, everyone) | the site card's rule (js/ui/sitecard.js:189-203): that site's `days[].workerIds` from the same `invoiceByDate`, each man counted once per date, by days, roster order among equals |

`historyRead` returns `{ from, to, rows: [{ date, workerId, kind: 'normal'|'extra'|'double'|'absent',
hours, split, sites: [{ id, name }] }], months: [{ key, rows: n, attendance: n|null }], tiles:
[{ id, value }], site: null | { placeId, name, own, rima, billed, yosef, men: [{ id, name, days }]
}, rimaInRange: n }` where, over the LISTED rows:
- no site chosen - `tiles` are `attendance` (rows not absent), `siteDays` (Σ their distinct
  sites), `doubleDays` (rows of kind `double`), `extraHours` (Σ hours), `absent` (rows of kind
  `absent`), in that order; a month's `attendance` is its rows not absent;
- a site chosen and one man - `tiles` is `[siteDays]` (his rows: one a row); `site` is `null`
  (Revision 2: his reading carries none of the site's billing) and a month's `attendance` is
  `null` (its heading carries no count, §4);
- a site chosen and everyone - `tiles` is `[]`; `site` holds the billing and «מי עבד באתר»;
  a month's `attendance` is `null`.
`rimaInRange` is `rimaReport(schedule, from, to').total` (every site) when no site and no man is
chosen, else 0 - it decides only whether the Rima sentence is shown.

`historyFacts()` = `historyRead(State.schedule, query, todayStr())` plus the words and the range
line - the only function that reads `State`. THE TEXT IS NOT BUILT THERE (Revision 2): it is
`historyText(facts)`, asked only while the fold is open and when a door is pressed, so a redraw
with the fold shut pays nothing for it (MEASURED in Revision 1: 20.7 ms of the 42.7 ms of "a
year, everyone" was the text).

**No money function is called**: no `payrollReport`, `workerDaysReport`, `moneyOf`,
`reportReadOnce`, `carryReportingEnabled`, ledger reader (a spy holds it, criterion 14);
`payrollReport` and `workerDaysReport` appear only in the suite, as the functions the counts are
pinned to.

**MEASURED cost of the reading** (Node 22, the repo's harness, `time-history.mjs`: 40 men, 6
sites, 313 day keys 2025-11-20..2026-11-19 without Saturdays, Rima on two sites, יוסף גבס on
one, 797 KiB as text; median of 7):

| query | rows | read | read + text |
|---|---|---|---|
| a year, everyone, every site | 9,412 | 22.0 ms | 42.7 ms (463,250 characters uncapped) |
| a year, one man, every site | 232 | 2.7 ms | 2.9 ms (11,391) |
| a year, everyone, one site | 1,450 | 13.8 ms | 12.1 ms (77,040) |
| a year, one man, one site | 228 | 2.7 ms | 2.9 ms |
| this month, everyone, every site | 563 | 1.1 ms | 1.7 ms (27,626) |
| 3 months, everyone, every site | 2,336 | 4.8 ms | 6.8 ms (115,505) |
| the whole record, everyone | 10,627 | 23.4 ms | 41.5 ms (523,280) |

On the same season the prototype's counts ALREADY equal the functions they will be pinned to:
attendance 9,206 = Σ `payrollReport.attendanceDays`; worker-site days 9,669 = Σ `siteVisits` =
`invoiceWithoutRima(...).total`; double days 264, extra hours 883, absences 206 equal; one site
1,450 = `invoiceWithoutRima(..., 'p_1').total`; one man 228 / 240 = his `attendanceDays` /
`siteVisits`. A line of text is about 49 characters. The reading is never the cost; the DOM
and the text are, and both are bounded (below).

MEASURED AGAIN FOR REVISION 2 (`rev2/time-history2.mjs` → `rev2/time-history2.txt`, the same
season, Revision 2's reading: the whole-record map, the per-site row, the site's billing asked of
its four functions, the text capped at 60,000): a year, everyone, every site 26.5 ms (read) /
20.1 ms (read + capped text, 1,072 rows in 59,994 characters); a year, one man 4.3 / 4.1 ms; a
year, everyone, one site 51.9 / 60.4 ms (the billing's four walks of the year - each asked once,
as the site card asks them); a year, one man, one site 3.6 / 3.5 ms; this month, everyone 3.6 /
4.3 ms; three months 7.2 / 8.0 ms; «מתחילת הרישום», everyone, 27.3 / 24.2 ms. Every query under
the 100 ms budget. The pins hold on it: the five counts with no site equal the pay sheet's sums
(9,206 / 9,669 / 264 / 883 / 206); under p_1 the set of (date, man) rows IS the invoice's
`workerIds` of p_1 (1,450 = `invoiceWithoutRima(..., 'p_1').total`; billed 1,719 = 1,450 own +
269 Rima); every row's kind and hours under p_1 are those of the entry the day screen's row under
p_1 reads; 147 of those rows carry «2 אתרים». And the critic's fixture (one man, 3 extra hours at
p_a and a double at p_b on one day): p_a chosen → «שעות נוספות» +3 ש׳, «2 אתרים»; p_b chosen →
«יום כפול», no hours, «2 אתרים»; no site → «יום כפול» · +3 ש׳ on both sites, the pay sheet's
doubleDays 1 and extraHours 3. Revision 1's rule gave «יום כפול» · +3 under BOTH sites.

## Permissions and privacy

Every phone reads its own copy; the dialog shows names, dates and sites - no wage, no debt - on
that phone. Nobody writes through it (there is nothing to authorise: a door to a man or a site
that left the record between the draw and the tap opens nothing, the finder's rule). It leaves only by the person's own press of «💬 שלח בוואטסאפ» or «העתק», after the
text has been shown in its field (the site card's rule: "the text is on the screen before it can
leave", index.html:987-991). The text names men: whether a list naming the crew is something to
hand a CLIENT is the owner's to decide - the app's client paper names nobody
(css/app.css:4766-4773); the default here is "his reading, his to send", and the question goes
in the report. One man's reading - on the screen and as text - carries only HIS days, never the
site's billing or his crewmates (Revision 2): it is the list a man in a dispute is handed, and
the statement the app already hands a man carries none of it (`workerStatementText`,
reports.js:4129-4185). Synthetic names in the suites.

## Entry and navigation

**THE DOOR IS THE FINDER'S - one more door on every man it finds.** Measured against the other
candidate, a button on «כרטיס עובד», on probe trees with a stub door (`doorfind`, `doorcard`):

| | the finder: a fourth door, LAST (Revision 2, `rev2/doorlast`) | the worker card: a button after its strip |
|---|---|---|
| pinned suites that move | ONE: tests/find.browser.mjs, 3 checks (85/88, MEASURED on `rev2/doorlast`: the door lists, the Tab walk, the Shift+Tab end); Revision 1's place before «מקדמות» moved 2 (86/88, `doorfind`) | ONE: tests/workercard.browser.mjs, 2 expressions = 5 checks (111/116) |
| Node suites | find.test 91/91, workercard.test 180/180 - untouched (they do not load history.js; the door is asked through `typeof`) | the same |
| other suites run | workercard.browser 116/116; tests/largetext.browser.mjs walking every screen (the finder with four doors among them, 3 phones × 2 schemes × mode on and off): 8,101/8,101 in 799 s - on `doorfind`, the door before «מקדמות»; NOT re-run with the door last (the same four doors in another order) | find.browser 88/88 |
| taps from the day screen | «חיפוש עובד», two letters, «איפה עבד» | the crew tab, his row's card, then a scroll of 2,085-3,127 px (440 off - 320 with the mode) to the button |
| what it costs (`rev2/finder2-base.txt` against `rev2/finder2-doorlast.txt`) | a man on the daily list: 0 px at 320 (168 / 181 with the mode - the three doors already take two lines, the fourth fills the empty cell beside «מקדמות»); +56 px at 375 and 440 (112 → 168), +76 at 375 with the mode (137 → 213), +60 at 440 with the mode (121 → 181) - so with nothing typed the list shows 2 whole men instead of 4 at 375x667 and 4 instead of 6 at 440x956; with two letters typed it is one or two men either way. «מקדמות» keeps its place at every width (x and line unchanged): at 375 and 440 the fourth door goes on a line of its own, under «כרטיס עובד»; at 320 it fills the empty cell beside «מקדמות». A man turned off: three doors, one line at 375 and 440 as a daily man's three are today (no growth); at 320 a second line (+56 px by the same grid - NOT measured: the screens seed turns nobody off) | nothing on the finder; the card grows by one row at its very end |

The finder is chosen: the same number of suites, one tap from the man and on the screen the
owner works on. The card is not given a door (its own calendar already answers the month on
screen). THE PRICE IS SAID TO THE OWNER, not hidden (Revision 2): the report shows the finder
with nothing typed at 375x667 and 440x956 before and after (half the whole men on the glass),
and asks whether he keeps the door there (default: yes - the finder is typed into, and a typed
finder lists one or two men).

- **js/ui/find.js** - TWO code lines and their comments, and its header's door list:
  - in `findRowNode` (find.js:167-189), directly AFTER `door('advances', FIND_REUSED.advances);`
    (find.js:186), the last door of the row: `if (typeof HISTORY_TEXT === 'object' && typeof
    openHistory === 'function') door('history', HISTORY_TEXT.door);` - for a man on the daily
    list AND a man turned off (a dispute about a man who left is the commonest one). The doors
    become «כרטיס עובד», «שיבוץ להיום», «מקדמות», «איפה עבד» / «כרטיס עובד», «מקדמות», «איפה
    עבד». Its accessible name is the finder's own `FIND_TEXT.doorFor(words, isolate(name))`
    («איפה עבד · אחמד נסאר»). LAST, and not before «מקדמות» as Revision 1 had it (MEASURED,
    above): «מקדמות» keeps its place under the thumb at every width; the price is the Shift+Tab
    pin, moved on purpose (§«Existing suites touched»). No Hebrew literal in find.js (its suite
    scans for one, find.test.mjs:344-355), no new key in `FIND_TEXT` (pinned, find.test.mjs:324).
  - in `findGo` (find.js:287-310), before the `'advances'` branch: `if (what === 'history') {
    if (typeof openHistory === 'function') openHistory(worker.id); return; }`. `closeFind()`
    runs first, as for every door; its own fallback focus (find.js:248-254) does nothing while a
    dialog is open. The heading is focused by `openHistory` itself (below), so this branch needs
    no step of its own.
  - the header comment's list of doors (find.js:5-16: "the three doors", the table of
    functions) gains its fourth line, `«איפה עבד»  openHistory  js/ui/history.js - asked
    through typeof`, in the same commit; tests/README.md's two finder rows (:425-426, "The three
    doors") likewise.
- **The frame**: a static `.modal#historyModal` in index.html DIRECTLY AFTER the `#findModal`
  frame (index.html:820-833), with a comment that it is a reading drawn by js/ui/history.js:
  ```
  .modal#historyModal > .modal-content.history-content
     .history-head  > h3#historyTitle[tabindex=-1]  +  button#historyClose.btn-secondary
     #historyScroll.history-scroll                       (everything below scrolls; the head never)
        .history-choose
           label.history-field[for=historyMan]   span#historyManLabel    select#historyMan   onchange="historyChoose('man')"
           label.history-field[for=historySite]  span#historySiteLabel   select#historySite  onchange="historyChoose('site')"
           label.history-field[for=historyRange] span#historyRangeLabel  select#historyRange onchange="historyChoose('range')"
           #historyDates[hidden]   two labels, input[type=date]#historyFrom / #historyTo onchange="historyChoose('dates')"
           strong#historyRangeNow[role=status][aria-live=polite]
        #historyTotals
        .history-fold  button#historyFoldLabel[aria-expanded][aria-controls=historyText]
                       #historyFoldBody[hidden] > textarea#historyText[readonly][rows=10]
                           + button#historySend.btn-success + button#historyCopy.btn-secondary
                           + span#historyStatus.share-status[role=status]
        #historyList
  ```
  EACH LABEL ABOVE ITS FIELD, at every width and in both modes (Revision 2): one rule, no media
  query (the block may hold none, §«Floors and looks»). MEASURED (`rev2/select-above.mjs` →
  `rev2/select-above.txt`, on the app's own sheets, against `critic/select-fit.mjs` →
  `rev2/select-beside.txt` for Revision 1's label beside its field; every room below is the
  select's inner width less ~20 px for its arrow): with the label above, the longest probe
  values fit the closed select at 320 without the mode (231 px needed of 240) and at 375 and 440
  in both modes (287 of 293 at 375 with the mode); beside it, a long man's name was cut at 320
  (231 of 198) and with the mode at 320 AND 375 (287 of 243). At 320 with the mode the two
  longest probe values are still cut in the closed select even above it (a man «עבד אל-רחמן אבו
  חוסיין · לא פעיל», 287 px of 238; an archived site 248 of 238) - which is
  why THE CHOICE IS ALSO WRITTEN AS WORDS: `#historyRangeNow` is
  `HISTORY_TEXT.now(who, where, range)` - `${who} · ${where} · ${range}`, the man or «כל
  העובדים», the site or «כל האתרים», the dates read - text that wraps, that the ruler measures,
  and that a screen reader hears after every choice («אחמד נסאר · כל האתרים · 01/09/2026 -
  19/11/2026»). The selects keep the choosing; the line says what was chosen, whole, on every
  phone.
  `h3#historyTitle` is NOT where js/ui/modal.js enters by itself: `focusFirst` takes only an
  `h3[tabindex="-1"]` that is a DIRECT child of `.modal-content` (modal.js:192), and this one
  stands in `.history-head` beside «סגור», as the finder's does (index.html:821-825 - the finder
  focuses its own field, find.js:229-233). So `openHistory` focuses `#historyTitle` ITSELF, with
  `preventScroll`, after the frame is shown and forced into effect - `openWeeklyClose`'s own
  step (js/ui/weeklyclose.js:792-795) - whatever opened it (Revision 2; Revision 1 left it to
  `focusFirst` and to the finder's branch, and a later door from anywhere else would have entered
  at «סגור», with a scroll). modal.js then leaves it alone ("whatever the dialog already focused
  for itself", :183). The choices, the fold and the doors are IN THE FRAME, so a redraw (render,
  «הצג עוד») never takes the focus off them; JS sets every word (`say(id, text)`,
  monthsummary.js:611). «סגור» stands in the head because the list can be long - the finder's own
  head (index.html:822-825) - and Escape and the backdrop close it too.
- **js/ui/modal.js**: `historyModal: () => closeHistory(),` with a one-line comment, directly
  after the `findModal` row (modal.js:26).
- **js/app.js**: `if (typeof renderHistoryIfOpen === 'function') renderHistoryIfOpen();` with a
  one-line comment, directly after the `renderSiteCardIfOpen` line (app.js:164).
- **js/ui/history.js**: `<script src="js/ui/history.js">` with its comment DIRECTLY AFTER
  `js/ui/sitecard.js` and before find.js's comment (index.html:1193); it calls, at call time only,
  dom.js, sitecolor.js, schema/money's readers, reports.js's constants and `countedIn`,
  monthsummary.js's and sitecard.js's words, share.js's doors, ask.js's questions and
  journey.js's `journeyStation` / `journeyLeave` / `JOURNEY_TEXT` - all above it - and find.js
  (below it) asks for it through `typeof`. It runs nothing at load. `'./js/ui/history.js'` in
  `sw.js` SHELL directly after `'./js/ui/sitecard.js'` (sw.js:111).
- **Every door out navigates and writes nothing** (the one exception, a journey left on the
  person's answer, is the journey's own write - §«Data»):

| door | words | action |
|---|---|---|
| a row | the row (its accessible name, below) | `historyGoDay(date)`. No journey open: `closeHistory(); State.date = date; dayChosenByHand(); showView('day');` - `siteCardGoDay`'s steps (sitecard.js:493-499, js/app.js:367); a day the record no longer holds is still a date and opens empty, as the week's cell does. A JOURNEY OPEN (`journeyStation() > 0`, Revision 2): `askConfirm({ title: HISTORY_TEXT.leaveTitle, message: HISTORY_TEXT.leaveMessage(day, sederDay), ok: HISTORY_TEXT.leaveOk })` over the dialog, `cancel` its own «ביטול»; «ביטול», Escape or the backdrop → nothing at all (the history stays open, the focus given back to the row that asked, found again by its `data-history-key`, `preventScroll`); the confirming answer → `closeHistory(); journeyLeave(); State.date = date; dayChosenByHand(); showView('day');` - checked again after the answer (the journey may have ended meanwhile: then no question is owed and the plain steps run) |
| «הצג עוד …» | `HISTORY_TEXT.more(n)` | draws the next `HISTORY_CHUNK` rows under the drawn ones, never past `HISTORY_SHOWN_MAX` (Revision 2, below); focus to the first new row |
| «💬 שלח בוואטסאפ» | BORROWED | `historySend()`: the text built now (`historyText(facts)`), then `shareTextOut(text, status, done)` (js/ui/share.js:196) - the dialog stays open behind it (monthSummarySend's rule, monthsummary.js:687-694). ONE REFUSAL OF ITS OWN (Revision 2): with no share sheet (`!navigator.share`) shareTextOut opens `wa.me/?text=` with the whole text encoded in the link (share.js:217) - MEASURED by the critic: a 60,000-character list is a link of 295,220 characters. So when `encodeURIComponent(text).length > HISTORY_LINK_MAX` (8,000), nothing is opened: the fold's field is shown with the text selected and the status line says **«⚠️ הרשימה ארוכה מדי לקישור של וואטסאפ - השתמש בהעתק ושלח ידנית»** (PROPOSED, `HISTORY_TEXT.tooLongForLink` - the share door's own sentence, share.js:205, with its first half changed); «העתק» does the rest. 8,000 is a common ceiling of one request line, NOT measured against WhatsApp (the report says so); the share sheet's path keeps the 60,000 cap |
| «העתק» | BORROWED | `copyTextOut(field, status)` (share.js:231), the field shown first, the text built now |
| «סגור», Escape, the backdrop | BORROWED | `closeHistory()`: `HISTORY = null`, frame hidden, the fold shut, the field emptied. js/ui/modal.js gives the focus back to what it kept - `#findEntry`, the finder's opener (the two dialogs never left an empty moment) - ONLY while that node is still in the document (modal.js:160). Every `render()` rebuilds the day under the dialog (`swapDay`, js/ui/day.js:437-443), and then it is not: MEASURED by `critic/focus-back.mjs` (re-run, `rev2/focus-back.out`) on the finder's card door, the same shape - with no redraw the focus lands on `findEntry`, after one `render()` under the dialog on BODY. So `closeHistory` carries closeFind's own fallback (find.js:243-254) in the same words of code: a `setTimeout(0)` that, when the focus is lost (on BODY or inside the shut dialog) and no dialog is open, focuses the `#findEntry` that stands NOW, `preventScroll`, focus only (Revision 2) |

## The screen, section by section, in this order

PROPOSED words live in ONE frozen block `HISTORY_TEXT` at the top of `js/ui/history.js`, pinned
word for word in tests/history.test.mjs; BORROWED words are read from their owner's constant at
call time (never at load) or repeated in `HISTORY_REUSED` and found in the owner's source by the
suite. Names through `isolate()` (js/ui/dom.js:20), the range through `dateRange()` (dom.js:41)
of `formatFullDate` (dom.js:169), hours through `plusAmount()` (dom.js:110). Never «נשלח».

0. **The head**: `HISTORY_TEXT.title` = **«מי עבד איפה»** (PROPOSED, Revision 2); «סגור»
   (BORROWED, index.html). The finder's door: `HISTORY_TEXT.door` = **«איפה עבד»** (PROPOSED,
   Revision 2). NOT «היסטוריה» and not «חיפוש בהיסטוריה» (Revision 1's): in this app
   «היסטוריה» is a man's MONEY record - «היסטוריה מלאה», the advances ledger on his «מקדמות»
   page (js/ui/reports.js:3958), which the app's own sentences send the owner to («פתח את
   ההיסטוריה ובדוק את התנועות», reports.js:416; «תקן אותו ב«היסטוריה מלאה»», :3162 and :3354;
   «...רשום גם בהיסטוריה של העובד בעמוד המקדמות שלו», js/ui/owes.js:137) - and the worker
   form's «היסטוריה» box (js/ui/roster.js:1300). A door of that name standing beside «מקדמות»
   and opening attendance with no shekel on it is the wrong door taken; and the dialog has no
   search field to be a «חיפוש». The title is the question the dialog answers and fits one line
   beside «סגור» at 320 (MEASURED, `rev2/measure-frame3.txt`: the head 48 px, 52 with the mode;
   Revision 1's «חיפוש בהיסטוריה» wrapped to 81 with the mode, `measure-frame.txt`, and the
   critic's «מי עבד, איפה ומתי» to 71 without it and 81 with it, `rev2/measure-frame2.txt`). A check pins that neither word contains «היסטוריה»
   and that neither is a string literal of js/ui/reports.js, js/ui/owes.js or js/ui/roster.js.
1. **The three choices**, EACH LABEL ABOVE ITS FIELD (Revision 2, §«Entry and navigation»):
   - `HISTORY_TEXT.man` = **«עובד»** (PROPOSED): first option «כל העובדים» (BORROWED,
     js/ui/reports.js:502), then the men on the daily list in roster order, then the men turned
     off, each `${name} · לא פעיל` («לא פעיל» BORROWED, js/ui/roster.js). Opened from the
     finder: that man.
   - `HISTORY_TEXT.site` = **«אתר»** (PROPOSED - the same word track `monthboard` proposes for
     its filter): «כל האתרים» (BORROWED, reports.js:2549), then the active sites, then the
     archived ones `${name} · לא פעיל`. Default: every site. An unlisted site (a day names an id
     the roster has not got) is not offered - it has no name to choose by - and its rows are
     listed and named with no site chosen.
   - `HISTORY_REUSED.range` = «תקופה» (BORROWED, reports.js:5273): «החודש», «חודש שעבר»,
     «תאריכים אחרים» (BORROWED, reports.js:724/727/728), **«3 החודשים האחרונים»**, **«השנה»**
     and **«מתחילת הרישום»** (PROPOSED; the last is Revision 2's - not «כל התקופה», because in
     this app «תקופה» is a pay period and the select is itself called «תקופה»), in the order
     «החודש», «חודש שעבר», «3 החודשים האחרונים», «השנה», «מתחילת הרישום», «תאריכים אחרים».
     Default: **«3 החודשים האחרונים»** - on the first of a month «החודש» would open on nothing,
     and three months cover the last pay periods of both cycles.
   - «תאריכים אחרים» shows `#historyDates`: «מתאריך» / «עד תאריך» (BORROWED, reports.js:734),
     native date fields, `max` = today on both, `from.max = to`, `to.min = from`; FILLED IN WITH
     THE DATES READ by the range that was chosen before it - `[from, to']`, so never a date
     after today (Revision 2: Revision 1 filled in `to`, which after «השנה» is 31 December,
     past its own `max`). A start after the last day read (`from > min(to, today)`) is REFUSED,
     not swapped - the reports' own rule and words (reports.js:851-860), true here because the
     end read is at the latest today: the field is put back and `askTell({ title: 'הטווח הפוך',
     message: 'תאריך ההתחלה מאוחר מתאריך הסיום, ולכן הוא לא שונה. בחר קודם את תאריך ההתחלה ואז
     את הסיום.' })` (BORROWED). An end typed after today (a phone that lets a date be typed past
     `max`) is read as today - the cut - and the field is written back as today, so the field
     and the line say the same day.
   - `#historyRangeNow`: `HISTORY_TEXT.now(who, where, range)` = **`` `${who} · ${where} · ${range}` ``**
     (PROPOSED template, Revision 2) - the man (isolated) or «כל העובדים», the site (isolated)
     or «כל האתרים», and `dateRange(formatFullDate(from), formatFullDate(to'))`, the dates
     actually read. With one man chosen this is the one place on the screen his name is written
     whole (the rows leave it out); the selects may cut it (measured above).
2. **`#historyTotals`** - BY WHAT IS CHOSEN (Revision 2; label over value, each `String(n)`):
   - NO SITE: five tiles, in this order and always all five (a 0 is an answer): «ימי נוכחות»
     (BORROWED, reports.js:4179), «ימי עובד־אתר» (BORROWED, reports.js:5281), «כפולים», «שעות
     נוספות», «נעדר» (BORROWED, the sheet's columns, reports.js:1979-1984). Under them, each only
     when it applies: worker-site days ≠ attendance (a man at two sites in a day) - the billing
     page's own sentence, verbatim: «עובד בשני אתרים נספר פעם אחת בכל אתר; ימי עובד־אתר אינם
     ימי נוכחות ואינם ימי שכר — אין לצפות שהסכומים יתאימו.» (BORROWED, reports.js:2288-2289);
     and, ONLY with «כל העובדים» and a Rima count inside the range (Revision 2: with one man
     Rima's men were never in question), **«עובדי רימא לא נספרים כאן. כדי לראות גם אותם, בחר
     אתר.»** (PROPOSED) - so this «ימי עובד־אתר» is never read as the invoice's «סה״כ ימי
     עובד־אתר», which counts Rima's men in.
   - A SITE AND ONE MAN: one tile, «ימי עובד־אתר» - his days at that site, which is his count
     in that site's `workerIds`. No «ימי נוכחות» beside it (at one site it would be the same
     number under a name the app says it is not, reports.js:2288-2289), no «כפולים» or «שעות
     נוספות» (no existing function counts them per site; the row says each day's kind), no
     «נעדר» (an absence has no site), and NOT the site's billing (Revision 2: his reading is
     what may be handed to HIM in a dispute; the statement the app sends a man never carries the
     client's billing, `workerStatementText`, reports.js:4129-4185).
   - A SITE AND EVERYONE: no tiles - **the site's billing IS the count**, headed
     `${SITE_CARD_REUSED.billing} ${isolate(site)}` («חיוב - רמת גן», BORROWED, sitecard.js:80),
     in the SITE CARD'S ORDER AND WORDS (`siteCardNumbers`, sitecard.js:242-256, without its «ימי עבודה» and average, which that card counts for itself), each figure
     once: `NO_RIMA_TOTAL` «סה״כ ימי עובד־אתר» = billed; when Rima > 0 `NO_RIMA_TITLE` «בלי
     עובדי רימא» = own and `RIMA_TOTAL` «סה״כ עובדי רימא» with `RIMA_NOTE` (BORROWED,
     reports.js:2452/2451/2321/2320 - «בחיוב שלמעלה» is true here as on the card: the billed
     total stands above it); then, apart again and only when > 0, `YOSEF_GEVES_TOTAL` with
     `YOSEF_GEVES_NOTE` (BORROWED, reports.js:2395/2396). (Revision 1 showed five tiles and own
     as «ימי נוכחות», «ימי עובד־אתר» and «בלי עובדי רימא» - one number under three names.)
     Then «מי עבד באתר» (BORROWED, `SITE_CARD_TEXT.men`, sitecard.js:52), one line per man:
     **`` `${name} · ${countedIn(days, 'יום אחד', 'ימים')}` ``** (`who` and its two forms
     `dayOne` / `dayMany` PROPOSED; `countedIn` BORROWED, reports.js:4483) - his DATES at the
     site; not «ימי נוכחות» (Revision 1), which they are not. Plain text, no buttons.
3. **The fold**: `HISTORY_TEXT.asText` = **«הרשימה כטקסט»** (PROPOSED), a toggle BUTTON with
   `aria-expanded` (not `<details>`: the dialogs' Tab trap knows buttons and fields,
   monthsummary.js:649-659); opened: the read-only field with the text, «💬 שלח בוואטסאפ» and
   «העתק» (BORROWED, index.html, `MONTH_SUMMARY_REUSED.send/copy`). The doors are INSIDE the
   fold: one 48 px line when shut (MEASURED below: shown always, the three buttons took 104 px
   at 320 and 172 px with the mode, above the first row). The text is built when the fold opens
   and again on each redraw while it is open, never while it is shut (§«Data»).
4. **`#historyList`** - the rows, newest first, grouped by month:
   - a month's heading: with no site, **`` `${MONTH_SUMMARY_TEXT.months[m]} ${year} · ${countedIn(attendance, 'יום נוכחות אחד', 'ימי נוכחות')}` ``**
     (PROPOSED template; month names BORROWED, monthsummary.js:45) - the month's whole count,
     whatever is drawn of it yet; WITH A SITE, the month's name and year alone (Revision 2: a
     count of his men's days there would stand beside the billed total, which counts Rima's men
     in, under the same words);
   - a row is ONE button (`data-history-key="row:<date>:<workerId>"`), ≥ 48 px: its date
     `${HEBREW_DAY_NAMES[d]} ${formatShortDate(date)}` (the statement's own date, reports.js:4157;
     the year is on the month's heading); the man's name - ONLY when «כל העובדים» is chosen (with
     one man his name is in `#historyRangeNow`, and in every row's accessible name); then his
     day: with NO SITE, each site of his day as the day screen draws it, a `.tag.tag-place`
     painted by `paintSite` with `appendSiteName` (js/ui/sitecolor.js:46/59;
     js/ui/day.js:1097-1100), its name always written, and the day's kind -
     `RATE_LABELS[kind]` «רגיל» / «שעות נוספות» / «יום כפול» (BORROWED, js/model/schema.js:90-94)
     or «נעדר» (BORROWED, day.js:1090) - and, when hours > 0, **`` `${plusAmount(hours)} ש׳` ``**
     (the statement's own form, BORROWED, reports.js:4167); WITH A SITE, that one site's tag,
     the kind and hours of HIS ENTRY THERE (§«Data»), and «2 אתרים» (BORROWED, day.js:1592, the
     day screen's `.badge.badge-split`) when he was at another site too that day;
   - its accessible name `HISTORY_TEXT.rowName(when, name, sites, kind)` =
     **`` `${when} · ${name} · ${sites} · ${kind}` ``** (PROPOSED; `when` = `hebrewDayName` +
     `formatFullDate`, `sites` the names joined by « · », `kind` with its hours and, with a site,
     « · 2 אתרים» when it applies), names isolated;
   - nothing matches: **«לא נמצא אף יום שמתאים לבחירה.»** (PROPOSED);
   - under the rows: `WORKER_CARD_TEXT.openDay` «לחיצה על יום פותחת אותו במסך היום.» (BORROWED,
     workercard.js:69);
   - more rows than drawn: **`` `מוצגות ${shown} שורות מתוך ${total}.` ``** (PROPOSED,
     `HISTORY_TEXT.shown`) and the button **`` `הצג עוד ${n}` ``** (PROPOSED, `HISTORY_TEXT.more`,
     n = min(HISTORY_CHUNK, the rest, HISTORY_SHOWN_MAX - shown));
   - THE SCREEN'S CAP (Revision 2): `HISTORY_SHOWN_MAX = 600` - three chunks. At the cap there
     is no «הצג עוד»; the line is **`` `מוצגות ${n} השורות החדשות ביותר מתוך ${total}. כדי לראות את השאר, בחר טווח קצר יותר, אתר או עובד.` ``**
     (PROPOSED, `HISTORY_TEXT.capped`). Why: every moved record (a commit, a snapshot from
     another phone) redraws the open dialog with `shown` kept, so Revision 1's unbounded `shown`
     made each redraw cost what the person had unfolded - MEASURED, `measure-rows.txt`: 1,000
     rows 607-677 ms and 2,000 rows 659-815 ms at 4x CPU, over the 600 ms budget. MEASURED for
     the cap (`rev2/measure-rows2.mjs` → `rev2/measure-rows2.txt`, three runs, 375x667, 4x,
     mode off / on): 200 rows 63-110 ms, 400 rows 143-208 ms, 600 rows 175-286 ms, 800 rows
     255-383 ms. So no redraw draws more than 600 rows and none costs more than ~290 ms of
     drawing. The questions the dialog is for fit under it (a year of one man is 232 rows; a
     month at one site a few hundred); a longer list is narrowed, and the TEXT still carries up
     to its own cap.

**The text** (`historyText(facts)`, pure over the facts; the text's rows begin with the screen's
rows, in the same order, and go on past the screen's cap up to the text's own):
```
📄 <the man | כל העובדים> · <the site | כל האתרים>          HISTORY_TEXT.textHead(who, where) (PROPOSED template)
<dd/mm/yyyy - dd/mm/yyyy>                                    dateRange
                                                              (blank)
<the tiles, `${label}: ${n}` a line, by what is chosen:       no site: the five; a site and one man:
 «ימי עובד־אתר: 12»; a site and everyone: none>                 
<the two-sites sentence / the Rima sentence, when shown>
<a site and everyone only: the site's block - «חיוב - <site>», «סה״כ ימי עובד־אתר: N», and with Rima
 «בלי עובדי רימא: N», «סה״כ עובדי רימא: N», RIMA_NOTE - NEVER יוסף גבס; then «מי עבד באתר» and its lines>
                                                              (blank)
<month heading>
• <when> - [<name> - ]<site + site> · <kind>[ · +2 ש׳]        no site: the statement's bullet and dash, reports.js:4157-4171
• <when> - [<name> - ]<site> · <kind>[ · +2 ש׳][ · 2 אתרים]   a site: his entry there
• <when> - [<name> - ]נעדר
```
THE CAP: rows are added newest first while the text stays within `HISTORY_TEXT_MAX = 60000`
characters (MEASURED again, `rev2/time-history2.txt`: a year of everyone keeps 1,072 rows in
59,994 characters; WhatsApp's own limit for one message is 65,536 characters - not tried on a
real phone); a row is never cut in half; when rows were left out the text ends with
**`` `ההודעה כוללת רק את ${n} השורות החדשות ביותר מתוך ${total}, כי כל הרשימה ארוכה מדי להודעה אחת. כדי לקבל את כולן, בחר טווח קצר יותר, אתר או עובד.` ``**
(PROPOSED, `HISTORY_TEXT.textCut`, Revision 2: Revision 1's had no verb, said «האחרונות» of a
list whose LAST rows are the oldest - exactly the ones left out - and «בחרו» in the plural,
where the app speaks to the owner in the singular: «בחר קודם את תאריך ההתחלה», reports.js:857;
«נסה שם או מספר אחר», find.js:51; the plural «לחצו» of week.js:168 is the one exception). The
tiles and the site's block in the text are always of the whole range. The wa.me path has its own, lower bound
(`HISTORY_LINK_MAX`, the door table).

**`HISTORY_TEXT`, the whole block (PROPOSED, pinned word for word; nothing else in it):**
`title` «מי עבד איפה» · `door` «איפה עבד» · `man` «עובד» · `site` «אתר» · `last3` «3 החודשים
האחרונים» · `thisYear` «השנה» · `all` «מתחילת הרישום» · `now(who, where, range)`
`` `${who} · ${where} · ${range}` `` · `asText` «הרשימה כטקסט» · `noRima` «עובדי רימא לא נספרים
כאן. כדי לראות גם אותם, בחר אתר.» · `dayOne` «יום אחד» · `dayMany` «ימים» · `empty` «לא נמצא אף
יום שמתאים לבחירה.» · `month(name, year, count)` `` `${name} ${year} · ${count}` `` and, with
`count` null, `` `${name} ${year}` `` · `who(name, count)` `` `${name} · ${count}` `` ·
`rowName(when, name, sites, kind)` `` `${when} · ${name} · ${sites} · ${kind}` `` · `shown(n,
total)` `` `מוצגות ${n} שורות מתוך ${total}.` `` · `more(n)` `` `הצג עוד ${n}` `` · `capped(n,
total)` (the sentence above) · `textHead(who, where)` `` `📄 ${who} · ${where}` `` · `textCut(n,
total)` (the sentence above) · `tooLongForLink` «⚠️ הרשימה ארוכה מדי לקישור של וואטסאפ - השתמש
בהעתק ושלח ידנית» · `leaveTitle` «לצאת מבניית הסידור?» · `leaveMessage(day, sederDay)`
`` `כדי לפתוח את ${day} צריך לצאת מבניית הסידור ל${sederDay}. אפשר לחזור אליה אחר כך מ«בניית סידור».` ``
· `leaveOk` «צא ופתח את היום». (`count` in `month` is `countedIn(n, 'יום נוכחות אחד', 'ימי
נוכחות')`, BORROWED, and in `who` `countedIn(n, dayOne, dayMany)`; `day` and `sederDay` are
`${hebrewDayName(d)} ${formatFullDate(d)}` of the row's date and of the journey's - «כדי לפתוח
את יום שני 12/10/2026 צריך לצאת מבניית הסידור ליום שישי 20/11/2026.»; «בניית סידור» inside it
is the journey's own name, `JOURNEY_TEXT.entry`, found there by the suite; «ביטול» is
askConfirm's own; the hours' form `` `${plusAmount(hours)} ש׳` `` is `HISTORY_REUSED.hours`,
BORROWED from the statement, reports.js:4167, and «2 אתרים» `HISTORY_REUSED.split`, BORROWED from
day.js:1592 - not words of this block.)

## Floors and looks

- 320x568, 375x667, 440x956; both schemes; «תצוגה גדולה» on and off; text doubled with the
  cascade rewrite `doubleEveryFontSize` (tests/mobile.test.mjs:755-842 - the dialog redraws).
  No sideways page scroll; nothing cut; the last control reachable.
- App floors: targets 44 × 44 and every row, door and button of the dialog 48 px tall (the
  finder's own height, design.css:1209); selects and date fields ≥ 16 px (the app's field floor,
  css/app.css:500-545; 20 px and 52 px with the mode by large.css block 2, :129-131 - nothing to
  add); every word ≥ 16 px (the finder's dialog holds 16, find.browser.mjs:419); 4.5:1 on the
  ground really painted. Large: ≥ 18 px, ≥ 500, 7:1, 52 × 52.
- Site colour only beside its written name, white on the colour (7.1-9.9:1, scout-ui §g). The
  kind is a WORD - «יום כפול» may be heavier, never only coloured. No SVG anywhere (the ruler's
  blind spots, scout-ui §g).
- MEASURED, Revision 1 (`measure-frame.mjs`, labels beside their fields): the three choices
  and the range line took 191 px at every width (209 with the mode), 247-337 px with the two
  date fields; the selects 48 px / 16 px (52 / 20 with the mode); the mock's three text doors,
  shown always, took 104 px more (172 with the mode) - which is why they are inside the fold
  here, one 48 px line when shut.
- MEASURED, Revision 2 (`rev2/measure-frame3.mjs` → `rev2/measure-frame3.txt`, the frame as now
  written: each label ABOVE its field, the choice in words under them, five tiles in
  `repeat(auto-fit, minmax(96px, 1fr))`, the fold's button, the title «מי עבד איפה»): the head is
  48 px at every width (52 with the mode); the choices and their line take 304 px (347 with the
  mode at 375 and 440, 378 at 320) - more again with «תאריכים אחרים»'s two fields, which this
  probe did not open (Revision 1 measured them at +56 to +128 px beside their labels). The grid makes 2 columns at 320 and 3 at 375 and 440, with no
  query. As it opens, the FIRST tile is on the glass in every cell but 320x568 with the mode -
  there its bottom is at 592 px of a 536 px dialog, one scroll down: the price of the large
  display on the smallest phone, paid only in the mode, as the mode's own rule has it (CLAUDE.md,
  v191) - and the WHOLE tiles block at 375x667 without the mode and at 440x956 in both (not at
  320, nor at 375 with the mode). Criterion 17 holds exactly that, measured again on the real
  dialog. (With one tile, a site and one man, it is on the glass wherever the first of five is.)
- The look: css/design.css inside `@media screen`, ONE commented block `/* ---- «מי עבד איפה»
  (js/ui/history.js) ---- */` placed DIRECTLY AFTER the finder's rules (the `.find-group` rule,
  design.css:1210) and before «בניית סידור, the second pass» (design.css:1212) - i.e. BEFORE the
  usual site's block (design.css:1282), so tests/usual.test.mjs:755-778, which pins the order of
  every block AFTER that one and is already edited by both `status` and `payday`, is not touched
  by this track.
- THAT PLACE HAS LIMITS, AND THE BLOCK KEEPS THEM (Revision 2): it lies inside the slice
  tests/payslips.test.mjs reads from `/* «תלוש לכל עובד»` (design.css:1095) to `/* ---- בניית
  סידור, the second pass` (design.css:1212), which must hold NO `@media`, NO fixed `height:
  <digit>` (min-height, max-height and line-height are not counted), and every `font-size`
  between 16 px and 30 px with 30 the largest (`.payslips-value`) - tests/payslips.test.mjs:1383-1410;
  and the slice after it, up to «the reports say the account» (design.css:1365), must hold no
  `@media` either (:1411-1418). MEASURED by the critic's trial merge (`critic/merge`, every
  wave-1 tip plus this track's registrations): a 16 px rule joined the slice's sizes (44 values
  against the base's 43) and passed; a `@media (max-width: 374px)` failed «and it stands at the
  end of the layer ... with no fixed height in it» (201/202); a 32 px figure failed «nothing in
  it is written under 16px, and the figure is the largest thing on a row». Moving the block
  helps only at the very END of the layer and only under a header that does not begin
  `/* ---- ` (tests/usual.test.mjs:768-777 counts those blocks after its own; «איפוס מקדמות»'s
  block, design.css:1704, escaped that way) - and the end is where `status` appends its own
  block (Revision 1's trial merge), so that is a conflict bought to hold a query the grid does
  not need. So:
  no media query (the grid above needs none, and each label is above its field at every
  width); no fixed height; every size 16-30 px - a tile's figure at most 28 px. With the mode the
  sizes are restated in css/large.css, which that suite does not read.
- Every font-size, line-height and font-weight restated in css/large.css block 3 DIRECTLY AFTER
  the finder's restatements (large.css:839), one for one, with the original's importance
  (large.css:54-57 mapping). Block 2 gains nothing unless a control asks more than 52 px. No
  `--site-N`, no new colour token. The «2 אתרים» badge is the day screen's own `.badge.badge-split`
  (css/app.css:1488) and its colours; its SIZE is not - `.badge` is 11 px at the base
  (css/app.css:1479-1481) - so the block raises it to 16 px inside a row, as the finder raises
  its own badge (`.find-who .badge`, design.css:1207), and large.css restates it.

## Performance budget

| what | budget | how measured |
|---|---|---|
| `historyRead` + `historyText` on the season of `time-history.mjs` (40 men, 313 day keys), each of the seven queries of the table above, «מתחילת הרישום» among them | ≤ 100 ms each, median of 5 (measured 1.1-42.7 ms in Revision 1; 3.5-60.4 ms for Revision 2's reading, `rev2/time-history2.txt` - the slowest a year of everyone at one site, the billing's four walks) | Node, tests/history.test.mjs, `performance.now()`, the numbers printed |
| the text | ≤ 60,000 characters on every query; exactly the cut line when rows were left out; NOT BUILT while the fold is shut: 0 calls to `historyText` over 20 redraws with it shut, one a redraw with it open (Revision 2) | Node, spies |
| the wa.me link | never opened with more than `HISTORY_LINK_MAX` = 8,000 characters after `encodeURIComponent` (Revision 2) | browser, a recorder on `window.open` with `navigator.share` deleted |
| the finder's draw | reads nothing of this file: 0 calls to `historyRead` over 10 draws with the door shown | spies |
| `render()` with the dialog shut | `renderHistoryIfOpen` returns at its first line: 0 calls to `historyRead` over 20 renders | spies |
| `render()` with the dialog open, the record unmoved | ONE `historyRead`, no node of the dialog changed (a MutationObserver counts 0) | browser and Node |
| the DOM | never more rows than `shown`, and `shown` never more than `HISTORY_SHOWN_MAX = 600`: the first draw `HISTORY_CHUNK = 200`, each «הצג עוד» 200 more, none at 600 (Revision 2) | browser, node count |
| (a) a tap on «איפה עבד» → the dialog painted with its choices, the tiles and the first 200 rows of the found man, every site, «3 החודשים האחרונים» (the only query a tap makes - Revision 2 split this row), on a season seeded in the page (removepace's `seedSeason` pattern) | ≤ 600 ms at 4x CPU (`Emulation.setCPUThrottlingRate`, tests/removepace.browser.mjs:160) | browser, `requestAnimationFrame` after the tap |
| (b) «עובד» changed to «כל העובדים» and then «תקופה» to «השנה» on that dialog → each painted with the first 200 rows | ≤ 600 ms each at 4x CPU; MEASURED for the rows alone (`measure-rows.mjs` and `rev2/measure-rows2.mjs`, 375x667, 4x, mode off/on): 200 rows 63-143 ms | browser, `requestAnimationFrame` after the `change` |
| «הצג עוד» → 200 more painted | ≤ 300 ms at 4x CPU | browser |
| a commit, and an adopted snapshot, under the open dialog with `shown` AT THE CAP (600 rows drawn, «כל העובדים», «השנה») → the new rows painted (Revision 2: the row now names its `shown`) | ≤ 600 ms at 4x CPU, the scroll kept; MEASURED for 600 rows alone: 175-286 ms at 4x (`rev2/measure-rows2.txt`), and for the reading of a year of everyone 26.5 ms at 1x | browser |

## Success criteria

New suites: `tests/history.test.mjs` (`test:history`, appended to `npm test`) and
`tests/history.browser.mjs` (`test:history-browser`, appended to `test:all`); rows in
tests/README.md. (`tests/money.history.test.mjs` exists and is another suite; the names do not
collide.)

Node (tests/history.test.mjs; harness devices with `tests/moneydom.mjs` and js/ui/history.js
loaded beside find.js - and js/ui/journey.js for criterion 12's journey; seeded with a seeded
PRNG: both cycles, two sites a day, doubles, extra hours with and without hours, an entry of rate
«רגיל» carrying hours, absences, an archived man who worked, an archived site, two unlisted site
ids (one only outside the default range), Rima on two sites, יוסף גבס on one, a Saturday with
work, tomorrow's seder typed, a closed exact period corrected after its close, an OLD closure
with no `periodTo` opening on 1 January, and THE CRITIC'S DAY: one man with 3 extra hours at one
site and a double at another on the same date):
1. `historyRange` for every key on 2026-01-01 («חודש שעבר» is December 2025; «3 החודשים
   האחרונים» is 01/11/2025-31/01/2026; «השנה» read as 01/01/2026-01/01/2026), 2026-03-31,
   2026-11-01 («3 החודשים האחרונים» read as 01/09/2026-01/11/2026 - two months and a day, the
   intended edge), 2026-11-19, 2026-12-31 and 2028-02-29; `all` = [the record's first day,
   today], and [today, today] on a record with no day; `custom` refused (`null`) inverted, not a
   date, or starting after `min(to, today)`; a custom end after today read as today; the fields
   of «תאריכים אחרים» opened after «השנה» filled with [01/01, today]; and for every key the
   reading's `to'` is never after today.
2. The rows, on 3 seeded records × man/everyone × site/every site × «החודש» / «השנה» /
   «מתחילת הרישום» / «תאריכים אחרים»: for one man, no site, and a range that is neither exactly a
   closed period of his nor one STARTING on the opening day of an old closure of his (criterion
   4), row for row the live branch of `workerDaysReport` (js/model/money.js:402-430): the same
   dates, the same absences, the same sites (distinct, in order), `kind === 'double'` exactly
   when `doubled`, the same `extraHours`; for one man and a site, his rows are exactly the dates
   whose live entries hold that site, each row's kind and hours those of the first entry at it
   (the entry `renderAssignmentRow` reads, js/ui/day.js:1580) and `split` exactly when he had
   two; for everyone and a site, the set of (man, date) is that site's
   `invoiceByDate(...).places[].days[].workerIds`, each with the same per-site kind; newest
   first, roster order within a date; an absence never listed with a site chosen.
3. The tiles, by what is chosen: with no site, the five equal to Σ over the listed men of
   `payrollReport(schedule, from, to')` `attendanceDays`, `siteVisits`, `doubleDays`,
   `extraHours`, `absent` (money.js:210); with a site and one man, exactly one tile, his count in
   that site's `workerIds`; with a site and everyone, no tile and the site's block (criterion
   5). AGAINST THE SITE CARD (Revision 2): for every PAST month on each record, the history over
   that month and site has `site.men` equal to `siteCardFacts(P, month).men` (the same men, days
   and order) and `billed` equal to its `siteDays`; for the CURRENT month, equal when no date
   after today holds a record at P, and - with tomorrow's seder typed at P - different by exactly
   that: each man recorded at P tomorrow has one day more on the card, and the card's
   `siteDays` is more by tomorrow's billed count (the card reads the whole calendar month,
   `workerCardMonthSpan`, js/ui/workercard.js:346-354; the history stops at today). THE CRITIC'S
   DAY, with both sites chosen in turn: at the site with the hours, the row is «שעות נוספות» ·
   +3 ש׳ · «2 אתרים» and the one tile 1; at the site with the double, «יום כפול», no hours, «2
   אתרים», the one tile 1; with no site, «יום כפול» · +3 ש׳ on both sites and the tiles
   1 / 2 / 1 / 3 / 0, the pay sheet's own (Revision 1 said «יום כפול» · +3 under both sites).
4. THE EXCEPTION, two fixtures: (a) a weekly man's week closed (`closePeriodChanges` on a copy,
   as the seeds do), then a day of it corrected; over exactly that week `payrollReport` and
   `workerDaysReport` answer the closure's frozen days (money.js:352-369/387-401) and the history
   the live record - the corrected day's site and kind - and the two differ by exactly the
   correction; (b) (Revision 2) a closure with NO `periodTo` opening on 1 January, its entries
   written by hand on a copy, in two shapes: the real old one (what came off and the balance,
   no basis, no days - js/model/ledger.js:836-837, 1106) - over «השנה» the pay sheet's counts
   and this list AGREE, a day corrected or not; and a hand-made one carrying a `basis` and
   `days` - then a day of it corrected: over «השנה» (01/01 to today) and over «תאריכים אחרים»
   from 01/01 to any end, `payrollReport` and `workerDaysReport` answer the frozen counts and
   days (`frozenPeriodFor` on the start date alone, js/model/schema.js:2319-2330) and the two
   differ by exactly the correction, while over a range starting on any other day they agree.
5. The site's block (a site and everyone): billed = that site's `invoiceByDate` `workerDays` =
   own + Rima, first, as «סה״כ ימי עובד־אתר»; with Rima > 0, own = `invoiceWithoutRima(...).total`
   as «בלי עובדי רימא» and Rima = `rimaReport(...).total` as «סה״כ עובדי רימא» with `RIMA_NOTE`;
   with Rima 0 neither line, and billed = own; יוסף גבס = `yosefGevesReport(...).total`, drawn
   apart with its note, and in no other number of the screen and nowhere in the text; the order
   is `siteCardNumbers`' without its two counts of its own. With ONE man and a site the block is
   absent, on the screen and in the text (Revision 2).
6. The kinds on their fixtures: «רגיל», «יום כפול» (one entry double of two, no site chosen),
   «שעות נוספות» with `+2 ש׳`, «שעות נוספות» without hours, «רגיל» with `+1 ש׳` (a regular entry
   carrying hours, which the pay counts), «נעדר»; with a site chosen, the kind of the entry at
   that site and «2 אתרים» (the critic's day both ways); every word read from `RATE_LABELS`,
   day.js and its owner.
7. Nothing after today: tomorrow's typed seder is in no row, no tile, no block, no line of the
   text, on every range; a custom range ending after today reads to today and the line says
   today.
8. An unlisted site named «אתר שאינו ברשימה N» from the WHOLE-record map, N equal to what
   `placeLabelsIn(State.schedule)` - the day screen's map - gives that id, and unchanged when the
   range changes to one that leaves the other unlisted site's days out (Revision 1's span map
   renumbered it); the «אתר» select offers no unlisted site; an archived man and an archived site
   listed and chosen with «· לא פעיל»; a chosen man or site that leaves the record under the open
   dialog falls back to «כל העובדים» / «כל האתרים».
9. The text, line for line on a fixture of each of the three views; names isolated; the bullet
   and dash of the statement; the Rima sentence only with «כל העובדים» and no site; no billing
   in the text of one man at a site; never יוסף גבס; the cap: on the season's "a year,
   everyone" the text is ≤ 60,000 characters, ends with Revision 2's cut line naming how many of
   how many, holds only whole rows, and its rows begin with the screen's rows in the same order;
   a short query has no cut line.
10. The chunks: the first draw shows min(200, total) rows; each «הצג עוד» 200 more, up to 600;
    at 600 no «הצג עוד» and the `capped` line naming 600 of the total; the «מוצגות …» line and
    the button's number; a month's heading carries the month's whole count with no site and no
    count with a site.
11. The finder's door, with js/ui/history.js loaded: the doors are «כרטיס עובד», «שיבוץ להיום»,
    «מקדמות», «איפה עבד» on a man on the daily list and «כרטיס עובד», «מקדמות», «איפה עבד» on a
    man turned off, the door named `איפה עבד · <name>`; `findGo('history', id)` shuts the finder
    (its field empty), opens the dialog on that man, every site, «3 החודשים האחרונים», the focus
    on `#historyTitle`; a man who left the record between the list and the tap opens nothing;
    and WITHOUT history.js the finder draws its three doors as on the base (tests/find.test.mjs
    green, untouched).
12. It writes nothing: every key on the disk byte for byte (`device.dump()`) across opening it
    for every man, every choice, the dates, «הצג עוד», the fold, both doors (stubbed), a row's
    door and the close - with a recorder shown to notice a real write. AND A JOURNEY AT STATION 1
    (Revision 2: `journeyStart()` on the device, the history opened over it - where the
    harness's DOM cannot draw the journey's frame, the same check runs on criterion 19's page and
    this one says SKIP with the reason): a row's door asks
    (askConfirm recorded, its words the block's); answered «ביטול», every key byte for byte,
    `State.date` and the journey's date unchanged; answered yes, the ONLY key that moved is
    `farkadSederJourney`, and it reads as `journeyLeave()` leaves it - the same version, date and
    station as before, `open: false`, a fresh `at` - with `State.date` the row's date and
    `journeyStation()` 0. Its code calls no writer, no `Store`, `localStorage`, `innerHTML`,
    `prompt`/`confirm`/`alert`, sets `State.date` only in `historyGoDay`, and calls
    `journeyLeave` only there, after the answer (the scan find.test.mjs:294-313 makes of
    find.js).
13. Every PROPOSED word pinned; every BORROWED word found in its owner's source and saying there
    what it says here («בניית סידור» in `JOURNEY_TEXT`, «2 אתרים» in day.js); no Hebrew outside
    the two blocks; no «נשלח»; the door and the title hold no «היסטוריה» and are no string literal
    of js/ui/reports.js, js/ui/owes.js or js/ui/roster.js (Revision 2); tests/reportnames.test.mjs's
    Hebrew/Arabic scan green.
14. No money: a spy on `payrollReport`, `workerDaysReport`, `reportReadOnce`,
    `carryReportingEnabled`, `ledgerEntries`, `openAdvanceBalance` and `closedPeriods` counts 0
    calls across every reading and every draw of the dialog.
15. The cost rows of the budget, `historyText` uncalled while the fold is shut among them.
16. The shell: one classic `<script>` after js/ui/sitecard.js and before js/ui/find.js and
    js/app.js; in `sw.js` SHELL; the frame as above, static at boot; the `MODAL_CLOSERS` row; the
    `render()` hook; no `type="module"`.

Browser (tests/history.browser.mjs, Chromium 1194, touch, DPR 2, `tests/screens.mjs` `openApp`):
17. The door, LAST in its row, at 320/375/440 × dark/light × mode off/on: ≥ 48 × 44 (52 × 52),
    its words whole; the found man's row height MEASURED and printed against the same page with
    `openHistory` set to `undefined` (the door is asked through `typeof`; expected, from
    `rev2/doorlast`: equal at 320 - 168, 181 with the mode - +56 px at 375 and 440, +76 at 375
    and +60 at 440 with the mode), and «מקדמות» at the same x and line with and without the door
    in every cell; the finder's own rectangles (find.browser.mjs:360-436) hold. A tap opens the
    dialog with the focus on `#historyTitle`, on that man, every site, «3 החודשים האחרונים»; on
    opening the first tile is on the glass in every cell but 320x568 with the mode, and the whole
    tiles block at 375x667 without the mode and at 440x956 in both (the layout measured in
    `rev2/measure-frame3.txt`, measured again here and printed).
18. Each choice redraws the body and keeps the focus on the select it was made in; each label
    above its field; `#historyRangeNow` says the man (or «כל העובדים»), the site (or «כל
    האתרים») and the dates; «תאריכים אחרים» shows the two fields filled with the dates read
    (never after today), 16 px (20 with the mode), `max` today; an inverted pair and a start
    after today are put back and `askTell` says the reports' own words over the dialog.
19. A row opens its date on the day screen (`currentView === 'day'`, `State.date`), the dialog
    shut; a double tap on a row is ONE navigation and nothing on the day screen under the finger
    is pressed (the page's own rule, js/ui/sheet.js `WALK_BOUNCE_MS`). WITH A JOURNEY AT
    STATION 1 (Revision 2; `journeyStart()` on the seeded page, the finder opened from the day's
    foot, the dialog from its door): the tap asks, over the dialog, in the block's words, the
    journey's date and the row's named; «ביטול» leaves the dialog open, the focus back on that
    row (found by its `data-history-key`), the journey's date and key unchanged; the confirming
    answer leaves the day screen on the row's date with no journey drawn (`journeyStation()`
    0), and «בניית סידור» in the dock then brings the journey back on ITS date and station. A
    real double tap on a row with the journey open opens the question and answers NOTHING - the
    second press lands on the question's buttons and is spent by the page's own rule
    (`WALK_BOUNCE_MS`, js/ui/sheet.js) - the journey and the disk as they were.
20. «הצג עוד» draws 200 more, the focus on the first new row; the DOM holds exactly the drawn
    rows; at 600 there is no «הצג עוד» and the `capped` line is drawn.
21. The fold opens the field with the text the facts hold (built at that moment - a spy);
    «💬 שלח בוואטסאפ» through a recorder on `navigator.share`; with `navigator.share` deleted, a
    short text opens `window.open` once with the `wa.me` link, and a long one (a year of
    everyone) opens nothing - the field shown and selected, the status line `tooLongForLink`
    (Revision 2); «העתק» through the clipboard; the dialog stays open; no «נשלח» anywhere.
22. RUN AFTER CRITERION 23, ON THE SAME PAGE (Revision 2: after its redraws the finder's
    `#findEntry` is a new node): Escape, the backdrop and «סגור» close it and give the focus to
    the `#findEntry` that stands now (closeHistory's fallback), never to BODY; Tab stays inside
    and walks head → choices → fold → rows → «הצג עוד»; `midEdit()` is `true` while it is open
    and `false` once it is shut.
23. A commit and an ADOPTED SNAPSHOT under the open dialog (the harness's fake cloud), with
    `shown` at 600: the rows and tiles follow, `#historyScroll.scrollTop` kept, the focused row or
    button found again by its `data-history-key`; a `render()` on an unmoved record changes no
    node.
24. The browser budget rows at 4x CPU on a season seeded in the page; the numbers printed.
25. Floors on every phone, scheme and mode and at doubled text: the ruler (`measureInPage`,
    tests/screens.mjs:567-843), no sideways scroll, nothing cut, every word ≥ 16 px, the last
    control reachable by `scrollIntoView`. AND THE CHOSEN NAMES (Revision 2), on the screens seed
    plus a man «עבד אל-רחמן אבו חוסיין» turned off and an archived site «הרצליה - מגדל הים»,
    both chosen: `#historyRangeNow` holds both names whole in every cell (the ruler: not cut,
    wrapped); the chosen option's width, measured with a canvas in the select's own font, against
    the select's inner width less 20 px for the arrow, printed for every cell and REQUIRED to fit
    at 320 without the mode and at 375 and 440 in both modes (`rev2/select-above.txt`: 231 of 240,
    287 of 293); at 320 with the mode and at doubled text it may not, and there the line is the
    one place the name is whole - the check says so and holds the line to it.
26. Nothing written (`censusOnly`, tests/census.mjs) and `JSON.stringify(State.schedule)` unchanged
    across all of it - but for criterion 19's confirming answer, where the one key that moved is
    `farkadSederJourney` as `journeyLeave()` leaves it (criterion 12's reading of it); no uncaught
    error.

## Existing suites touched, deliberately and only as said

- **tests/find.browser.mjs** - the THREE checks the probe failed with the door LAST (MEASURED on
  `rev2/doorlast`: 85/88, exactly these, `rev2/run-doorlast-find.browser.txt`), each moved with a
  `MOVED:` comment naming this track:
  - :164-168 «a man on the daily list has three doors by their words; a man turned off has two
    and the badge» → «… four doors …; a man turned off has three …», expecting
    `[[['כרטיס עובד', 'שיבוץ להיום', 'מקדמות', 'איפה עבד'], []], [['כרטיס עובד', 'מקדמות', 'איפה עבד'], ['לא פעיל']]]`;
  - :251-255 «Tab goes from the field down the first man's doors» → FIVE presses of Tab (the
    loop's `step < 4` at :251 becomes `step < 5`), expecting `['כרטיס עובד', 'שיבוץ להיום', 'מקדמות', 'איפה עבד', 'כרטיס
    עובד']` - so the walk still ends on the NEXT man's first door and still proves that Tab
    crosses from one man to the next (Revision 2: four presses would have ended on the first
    man's last door and proved nothing about the crossing);
  - :258-262 «Shift+Tab from the field reaches «סגור», and once more comes round to the last
    door - never the page behind» → expecting `['findClose', ['איפה עבד', true]]`: the last door
    of the dialog is now «איפה עבד». The price of keeping «מקדמות» where the thumb knows it
    (§«Entry and navigation»), paid in a test and not by the owner.
  Nothing else in that file moves (measured: the rectangles at six cells, the keyboard lift, the
  doors' landings pass with the door last).
- **js/ui/find.js's header comment** (find.js:5-16: "the three doors" and the table of their
  functions) and **tests/README.md's two finder rows** (:425-426, "The three doors") say four, in
  the same commit as the door (Revision 2).
- **tests/screens.mjs** - FOUR entries directly after the 'find' entry (:446-450), each opened
  through the finder's door on the seeded record and closed by `closeHistory()`:
  `{ name: 'find - where one man worked', scope: ['#historyModal'] }` (w02, the default range);
  `{ name: 'find - a site and everyone, with Rima', scope: ['#historyModal'] }` (p1, «כל
  העובדים», «החודש» - the site's block with Rima's two lines and its note, «מי עבד באתר»; the
  screens seed counts Rima ONLY at p1, tests/screens.mjs:114, 117);
  `{ name: 'find - a site and everyone, with יוסף גבס', scope: ['#historyModal'] }` (p2, «כל
  העובדים», «החודש» - «עובדי יוסף גבס» apart with its note; the seed counts it ONLY at p2,
  :115, 118) (Revision 2: Revision 1's one site entry, on p1, never drew the יוסף גבס line for the
  ruler to measure);
  `{ name: 'find - two dates and the text', scope: ['#historyModal'] }` («תאריכים אחרים», the
  fold open). tests/history.browser.mjs asserts that the second and third entries' states draw
  the Rima lines and the יוסף גבס line respectively, so neither entry measures an empty block.
  The 'find' entry itself now walks four doors (measured with the door before «מקדמות»: the
  large display's walk passes on it, 8,101/8,101; not re-run with the door last).
- package.json (two scripts and the two chains), tests/README.md (two rows of its own, and the
  two finder rows above).
- Stay green with no expectation moved: find (Node, untouched), workercard + workercard-browser,
  sitecard + browser, day-polish-browser, doubletap-browser, midnight-browser, usual +
  usual-browser (its CSS block-order pin untouched by placement), **payslips (Revision 2: the
  design.css block sits inside its slice and keeps the slice's limits - no `@media`, no fixed
  height, sizes 16-30 px; tests/payslips.test.mjs:1383-1418)**, journey + journey-browser (the
  row's question only CALLS `journeyStation` and `journeyLeave`; js/ui/journey.js is not
  changed), whatsnew + browser, smoke, mobile, design-browser, largetext + largetext-browser,
  reportnames, nonassertions, gate-integrity (but its stamp section), isolation, build (but its
  stamp checks).

## Base

- `origin/main` = `6ab193d68c960e4a56d947673c282b867acd258f`; branch `feat-history`; worktree
  `/home/user/farkad/.claude/worktrees/feat-history` (`git worktree add -b feat-history <path>
  6ab193d68c960e4a56d947673c282b867acd258f`), `npm ci` there.
- New files: `js/ui/history.js`, `tests/history.test.mjs`, `tests/history.browser.mjs`, and
  `features/history/contract.md` (this file, copied as the branch's first commit, as each wave-1
  branch carries its own).
- Changed, and only as said: `index.html` (the frame after `#findModal`; the script after
  sitecard.js), `sw.js` (one SHELL line), `js/app.js` (one render hook), `js/ui/modal.js` (one
  closer row), `js/ui/find.js` (the door, its branch and its header's list of doors),
  `css/design.css` (one block after the finder's rules), `css/large.css` (the restatements after
  the finder's), `tests/screens.mjs` (four entries), `tests/find.browser.mjs` (three pins),
  `package.json`, `tests/README.md` (two rows, and the finder's two).
- MUST NOT be touched: `js/model/**`, `js/sync/**`, `js/state.js`, `js/store.js`,
  `js/recovery.js`, `firestore.rules`, `functions/**`, `firebase.json`, `.github/**`; the three
  stamps (index.html:108, js/app.js:7, sw.js:24); `docs/releases.md`, `CLAUDE.md`,
  `js/ui/whatsnew.js`, `js/ui/offline.js`; `tests/usual.test.mjs`, `tests/find.test.mjs`,
  `tests/whatsnew.*`, `tests/payslips.test.mjs`; js/ui/workercard.js, js/ui/reports.js,
  js/ui/sitecard.js, js/ui/monthsummary.js, js/ui/share.js, js/ui/day.js, js/ui/journey.js
  (read and called, never changed); the wave-1 files
  (`js/ui/status.js`, `js/ui/payday.js`, `js/ui/monthboard.js`, `js/ui/yearsummary.js`,
  `js/ui/week.js`, `js/ui/printout.js`, `js/ui/owes.js`, `js/ui/backup.js`).
- Expected red on this branch, and only this: tests/build.test.mjs «the stamps were moved by the
  commit that moved the bytes» (and its sw.js line) and tests/gate.integrity.test.mjs §4 - the
  integrator moves the stamps.
- Browsers: `export PLAYWRIGHT_BROWSERS_PATH=/tmp/claude-0/-home-user-farkad/d6a64352-db1a-5c3b-b54d-5c09103f2419/scratchpad/pw1194`;
  never `playwright install`; no emulator suites. Commit after every step; never `--amend`; every
  commit ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and
  `Claude-Session: https://claude.ai/code/session_01AczE1SUjJY47GFH8eTREya`. No push, no PR.

## «מה חדש» (for the integrator; PROPOSED)

`{ title: 'מי עבד איפה', text: 'מתי ואיפה עבד עובד, ומי עבד באתר, בכל תקופה - עם הספירה ושליחה כטקסט. לחיצה על יום פותחת אותו.', where: 'היום ← חיפוש עובד ← איפה עבד', go: 'find' }` (Revision 2: the
title and the door's words, §«The screen» 0)
- `go: 'find'` is the EXISTING key (whatsnew.js `WHATSNEW_GO`; landing pinned at
  tests/whatsnew.browser.mjs:462: the day, the finder open, its field focused) - the door is on
  every man the finder lists - so `WHATSNEW_GO`'s key list (whatsnew.browser.mjs:426) does not
  move. It only navigates; it presses no door.

## Conflicts with wave 1, and how they resolve

MEASURED by a trial merge (`trial/`, a clone of the repository): a commit on the base carrying
exactly this track's registrations - the frame and the script in index.html, the SHELL line, the
render hook, the closer row, the finder's door, a design.css block after the finder's rules, a
large.css line after the finder's restatements, a screens.mjs entry after 'find' - merged
CLEANLY with each of `feat-status` 3e661d0, `feat-payday` 73ca0e0, `feat-monthboard` af099ca,
`feat-yearsummary` 432f771 and `release-v205` bdaed5e (the tips at 15:20-15:53 UTC; they move).
MEASURED AGAIN by the critic (`critic/merge`, all five tips of 16:30 merged together, then the
registrations): clean with every one, `feat-yearsummary` eef8c88 among them, but for the
additive lines of package.json and tests/README.md. Revision 2 moves the finder's door after
«מקדמות» instead of before it - js/ui/find.js is still touched by no other track - and adds one
screens.mjs entry beside the others. Where each one lands beside them:

| file | this track | wave 1 / v205 | resolution |
|---|---|---|---|
| index.html, script | after sitecard.js (:1193) | monthboard after find.js (:1197), yearsummary after monthsummary.js (:1189), payday after advancereset.js, status after reminders.js | four lines apart: clean (measured) |
| index.html, frame | after `#findModal` (:833) | yearsummary after `#monthSummaryModal`, payday after `#advanceResetModal`, status after `#siteCardModal` | clean |
| sw.js SHELL | after sitecard.js (:111) | monthboard after find.js (:112), yearsummary after monthsummary.js (:110); v205 moves `VERSION` (:24) | one unchanged line between each pair: clean (measured) |
| js/app.js render() | after `renderSiteCardIfOpen` (:164) | yearsummary after `renderMonthSummaryIfOpen`, payday after `renderAdvanceResetIfOpen`, status after `renderFindIfOpen`, v205 `APP_VERSION` (:7) | clean (measured) |
| js/ui/modal.js | after the `findModal` row (:26) | payday after `advanceResetModal`, yearsummary after `monthSummaryModal`, status after `whatsNewModal` | clean |
| js/ui/find.js | the door (last), its branch, the header's list of doors | NOT touched by wave 1 or v205 | none |
| css/design.css | after `.find-group` (:1210), before the usual block, inside tests/payslips.test.mjs's slice and under its limits (§«Floors and looks») | monthboard after the week letter (:772), yearsummary after `.msum-*`, payday after `.weekly-close-entry`, status at the end | clean; tests/usual.test.mjs:755-778 untouched here (payday and status both edit it and resolve between themselves) |
| css/large.css | after the finder's restatements (:839) | monthboard after :698, yearsummary after the msum restatements, payday after :972, status and v205 at the end | clean here (payday and v205 conflict with EACH OTHER at the end of the file - measured, not this track's) |
| tests/screens.mjs | after 'find' (:450) | monthboard after 'week - days', yearsummary after 'reports - the month on one screen', payday after 'advances - one closure', status after 'the close reminder line' | clean |
| package.json, tests/README.md | appended to the `test` / `test:all` lines and the table | every track appends to the same lines (wave 1 already conflicts with itself there, measured) | additive: the integrator keeps every name |
| v205's automatic update | the dialog is a `.modal` | `midEdit()` waits on any open `.modal` (js/ui/offline.js:186-193) | nothing to do; criterion 22 asserts `midEdit()` |

No interface with another track: nothing here calls `status`, `payday`, `monthboard` or
`yearsummary`, and none of them calls this. (`monthboard`'s board also lets a man's month be
read; the history is any range, one man or a site, as text - neither links the other in this
round.)

## Interfaces

Provided (globals of `js/ui/history.js`): `HISTORY_TEXT` (with `.door`), `HISTORY_REUSED`,
`HISTORY_CHUNK` (200), `HISTORY_SHOWN_MAX` (600), `HISTORY_TEXT_MAX` (60000), `HISTORY_LINK_MAX`
(8000); `historyRange(key, today, chosen, firstDay)`; `historyFirstDay(schedule)`;
`historyRead(schedule, query, today)` (pure); `historyFacts()`; `historyText(facts)`;
`openHistory(workerId)` → `boolean` (it focuses `#historyTitle` itself); `closeHistory()` (with
closeFind's focus fallback); `historyIsOpen()` → `boolean`; `renderHistoryIfOpen()`;
`historyChoose(which)`; `historyMore()`; `historyToggleText()`; `historySend()`; `historyCopy()`;
`historyGoDay(date)` → `Promise` (it may ask first, while a journey is open). Consumed by
js/ui/find.js only, through `typeof`. Consumed FROM other files, at call time only and each
through `typeof` too: `journeyStation`, `journeyLeave` and `JOURNEY_TEXT.entry`
(js/ui/journey.js, loaded above it - index.html:1185), `askConfirm` / `askTell` (js/ui/ask.js,
index.html:1146).

## What it does NOT do

- It does not price, total money, or say what was paid: no shekel, no gate, no ledger read.
- It does not show a closed period's frozen days: it is the live record, what the day screen
  shows; a day corrected after a close reads corrected (the payslip in «דוחות» keeps what was
  paid). The pay sheet's counts and this list can therefore differ over exactly a closed period,
  and - for a closure with a basis and no `periodTo`, a shape no writer here produces - over any
  range starting on its opening day (criterion 4). NO MARK on such rows, and Revision 2 keeps that
  default, for three reasons: the worker's card's calendar, the other live reading of a man's
  days, marks no closed period either (js/ui/workercard.js reads no `closedPeriods`); once weekly
  closes are the habit (v197) nearly every past row lies in a closed period, so a «closed» mark
  would be on nearly every row and say nothing; and a mark only where the live day DIFFERS from
  the frozen one needs the closure's frozen days - the ledger, and a comparison with what was
  paid - which is the payslip's job («תלוש לכל עובד», «דוחות»), not a reading of attendance's.
  The owner is asked (open question 2).
- It does not list a date after today, name Rima's or יוסף גבס's men, put «עובדי יוסף גבס» in
  the text, read הסעות, or open the worker's card.
- It does not count a double day or an extra hour PER SITE: with a site chosen each row says the
  kind of his entry there, and the only count is the invoice's (Revision 2).
- It does not show the site's billing on one man's reading, on the screen or in his text.
- It does not edit: a row only opens its day; it writes no key, not even a preference. While a
  journey is open, a row asks before it leaves it, and leaving is the journey's own `journeyLeave`.
- It does not draw more than 600 rows; a longer list says so and is narrowed.
- It does not print, make a picture or a file; the text is capped at 60,000 characters and says
  so when it is; with no share sheet a text whose link would pass 8,000 characters is not put in
  a link - «העתק» is offered - and that bound is a guess, not measured against WhatsApp.
- It is not entered from the worker's card (measured above; a later round may add it).
- It does not keep the query: memory only, lost on close, reload or update.
- It has not been tried on a real phone; WhatsApp's 65,536-character limit is the documented
  one, not measured here.

## The report

Branch and final commit; every hook in an existing file; the source of every count; every new
string; the three moved pins of tests/find.browser.mjs; every suite's exit code and counts, one by
one on the final commit from a clean tree; the finder's row heights with and without the door at
the nine cells (criterion 17); the budget rows measured; the release-entry text and the CLAUDE.md
file-list line for the integrator; screenshots (synthetic names, 440x956 dark and 320x568 with
the mode, JPEG) in
`/tmp/claude-0/-home-user-farkad/d6a64352-db1a-5c3b-b54d-5c09103f2419/scratchpad/feat-history/`,
AMONG THEM the finder with nothing typed at 375x667 and 440x956, with and without the door, side
by side (Revision 2: the owner sees the price - half the whole men on the glass); what was not
verified (not tried on a real phone; the 8,000-character link bound not tried against WhatsApp;
the large display's walk not re-run with the door last if it was not); open questions with a
default - at least: (1) is the text, which names men, something the owner sends a client
(default: his to send; the text names the query on its first line); (2) should a day corrected
after its period was closed be marked (default: no - see «What it does NOT do»); (3) is «3
החודשים האחרונים» the right first range (default: yes); (4) does the finder keep the fourth door
at the price of half its rows with nothing typed (default: yes); (5) are «מי עבד איפה» and «איפה
עבד» his words for it (default: yes - proposed, pinned).

## Revision 2

2026-11-19, after the critic's review. Each of its nineteen points was checked against the code
at the base (6ab193d), its probes re-run where they were the evidence, and new probes written
where a decision needed a number - all in
`/tmp/claude-0/-home-user-farkad/d6a64352-db1a-5c3b-b54d-5c09103f2419/scratchpad/program/history/rev2/`
(`time-history2.mjs/.txt`, `measure-rows2.mjs/.txt`, `measure-finder2.mjs` with
`finder2-base.txt` / `finder2-doorlast.txt`, `measure-frame2.mjs/.txt`, `measure-frame3.mjs/.txt`,
`select-above.mjs/.txt`, `select-beside.txt`, `journey-door.out`, `focus-back.out`,
`run-doorlast-find.browser.txt`, the probe tree `doorlast`, and Revision 1 kept as
`contract.r1.md`). Verdict, then what changed - or, where the critic is wrong, the one line why.

| # | the critic's point | verdict | what changed |
|---|---|---|---|
| 1 | blocking: under a site, «כפולים» / «שעות נוספות» and each row's kind and hours came from his OTHER site too; one number under three names | RIGHT - `site-kind-probe.mjs` re-run: the double at p_b and the 3 hours at p_a both showed under each site | With a site, a row is THAT site's entry - the first entry at it, as the day screen's row under the site reads it (day.js:1580) - with «2 אתרים» (day.js:1592) when he had another; the tiles depend on the choice: no site, the five (the pay sheet's sums); a site and one man, ONE tile «ימי עובד־אתר»; a site and everyone, no tiles - the site card's billing lines in its order and words, each figure once (so `RIMA_NOTE`, billed now standing above it); a month's heading counts only with no site; «מי עבד באתר» says «N ימים», not «ימי נוכחות». `historyRead` returns `tiles`. The critic's fixture is in criteria 3 and 6 with both sites in turn; `rev2/time-history2.txt` shows it and the season's pins holding under the new rule |
| 2 | major: a row's door moves the evening's journey and writes its key | RIGHT - `journey-door.out`: 11/11 → 26/10, the key rewritten | While a journey is open the row ASKS (askConfirm, proposed words); «ביטול» moves nothing; the answer leaves it by the journey's own `journeyLeave()` (its «יציאה») and then opens the day. §«Data» names the one key that can move and whose it is; criteria 12, 19 and 26 walk a journey at station 1 with both answers and a double tap. Considered and not taken: "open the day without moving the journey" (impossible without editing js/ui/journey.js - at station 1 the journey follows `State.date` by its own code, :583-589) and rows that open nothing while a journey is open (they would write nothing, but turn one answer into leaving the seder by hand and finding the man again) |
| 3 | major: the design.css place is inside tests/payslips.test.mjs's slice, which forbids a query, a fixed height and sizes outside 16-30 | RIGHT - read at tests/payslips.test.mjs:1383-1418, and the critic's trial merge | The limits are written into §«Floors and looks»; the tiles are `repeat(auto-fit, minmax(96px, 1fr))` (MEASURED: 2 columns at 320, 3 at 375 and 440, no query); each label is above its field at every width; a figure is at most 28 px; tests/payslips.test.mjs joins "stay green" and "must not be touched". (The very end of the layer under a non-`/* ---- ` header would also escape the pins, but `status` appends there - a conflict for a query nobody needs.) |
| 4 | major: criterion 3's `siteCardFacts` identity cannot hold in the current month with tomorrow typed | RIGHT - `workerCardMonthSpan` reads the whole month (workercard.js:346-354) and the screens seed types tomorrow | Criterion 3 pins past months exactly, and the current month both ways: equal with nothing after today, different by exactly tomorrow's men at the site otherwise |
| 5 | major: «היסטוריה» is the advances page's word | RIGHT - reports.js:416/3162/3354/3958, owes.js:137, roster.js:1300 | The door is «איפה עבד», the title «מי עבד איפה». Not the critic's «מי עבד, איפה ומתי»: MEASURED, it wraps the head at 320 to 71 px (81 with the mode); «מי עבד איפה» keeps it 48 (52, where Revision 1's title took 81). Not «יומן עבודה» either: that is the name of a building site's official work diary. A check pins that neither word holds «היסטוריה» or is a literal of reports/owes/roster; the «מה חדש» proposal follows; the code's names stay `history` (`.history-*` / `#history*` collide with nothing - the only family is `.worker-history*`) |
| 6 | major: a chosen name is cut in its closed select at 320 and with the mode, and written nowhere else | RIGHT - `select-beside.txt`: cut at 320 (231 px of 198 after the arrow) and with the mode at 320 and 375 | Each label ABOVE its field at every width - not "at 375 and below and with the mode", which needs the query the block may not hold; MEASURED (`select-above.txt`) it then fits at 320 without the mode and at 375 and 440 in both. At 320 with the mode it still cannot (287 of 238), so the choice is ALSO written as words in `#historyRangeNow` («אחמד נסאר · כל האתרים · dates»). Criterion 25 requires the option to fit where it can and, at 320 with the mode and at doubled text, holds the written line to the name instead of failing on a select no layout can widen |
| 7 | minor: after a redraw, Escape leaves the focus on BODY | RIGHT - `focus-back.out`: findEntry without a render, BODY after one | closeHistory carries closeFind's fallback to the `#findEntry` standing now; criterion 22 runs after 23 on the same page |
| 8 | minor: `focusFirst` does not enter a nested h3 | RIGHT - modal.js:192 takes a DIRECT child only | `openHistory` focuses `#historyTitle` itself, `preventScroll` (openWeeklyClose's step, weeklyclose.js:792-795); the wrong sentence is replaced; findGo's branch needs no focus step of its own |
| 9 | minor: a redraw costs whatever «הצג עוד» unfolded; the text is built while the fold is shut | RIGHT - `measure-rows.txt`: 1,000 rows 607-677 ms at 4x | `HISTORY_SHOWN_MAX = 600` (MEASURED `measure-rows2.txt`: 600 rows 175-286 ms at 4x) with the `capped` sentence and no «הצג עוד» past it; the text built only while the fold is open or at a door; the commit / snapshot budget row is now at `shown` = 600. Not taken: resetting `shown` on a moved record (it throws away the place criterion 23 keeps) or patching months (a reconciler for a cost the cap already bounds) |
| 10 | minor: the tap's budget row names a query no tap makes | RIGHT | Split into (a) the tap - the found man, the default range - and (b) «כל העובדים» then «השנה», each with its own budget |
| 11 | minor: the screens entry on p1 never draws «עובדי יוסף גבס» | RIGHT - tests/screens.mjs:114-118 counts Rima only at p1 and יוסף גבס only at p2 | A fourth entry on p2; the suite asserts that the p1 state draws Rima's lines and the p2 state the יוסף גבס line |
| 12 | minor: the frozen exception is wider than "exactly that week" | RIGHT about the matching - `frozenPeriodFor` takes an old closure on its start day alone - and TOO WIDE about its reach: for counts and rows it bites only when such a closure carries a `basis` or `days` (money.js:352-368, 388-389), which the old shape does not (ledger.js:836-837) and no writer here produces without `periodTo` (ledger.js:991, 1057) | Named precisely in §«Out of scope», Goal 1 and criterion 2; criterion 4(b) pins both shapes. The suggested mark is NOT added: the worker card's calendar marks none, weekly closes put nearly every past row inside a closed period, and a mark of "differs from what was paid" needs the ledger's frozen days - the payslip's job. Open question 2 keeps it with the owner |
| 13 | minor: the cut line and the Rima sentence | RIGHT - no verb; «האחרונות» of a newest-first list; the plural «בחרו» against the app's singular (reports.js:857, find.js:51) | Both replaced by the critic's sentences, word for word; the Rima sentence only with «כל העובדים»; the new `capped` sentence in the same voice |
| 14 | minor: one man's reading carried the site's whole billing | RIGHT - the statement a man is sent carries none (reports.js:4129-4185) | The billing block only with «כל העובדים»; one man's screen and text carry his days only (§«Permissions and privacy») |
| 15 | minor: the fourth door halves the finder's rows and moves «מקדמות» | RIGHT - `m-doorfind-finder.json` | The door goes LAST: MEASURED on `rev2/doorlast`, «מקדמות» keeps its x and line at every width; the row heights are re-measured (320 equal; +56 at 375 and 440; +76 / +60 with the mode). The height is not hidden: the report shows the finder before and after, and open question 4 asks the owner |
| 16 | minor: the 60,000 cap does not protect the wa.me link | RIGHT - share.js:217 puts the whole text in the link | `HISTORY_LINK_MAX` = 8,000 encoded characters on the no-share-sheet path; above it nothing opens, the field is selected and `tooLongForLink` is said; criterion 21 tests a short and a long text. The bound is a guess at one request line, NOT measured against WhatsApp, and the report says so |
| 17 | minor: the edges of the ranges | RIGHT on four: no whole-record range, a pre-fill past `max`, a start after today, an end after today | «מתחילת הרישום» added (not «כל התקופה»: «תקופה» is this app's pay period and the select's own label); the custom fields filled with `[from, to']`; `from > min(to, today)` refused in the reports' own words; an end after today read and written back as today. WRONG on one: two months and a day on the 1st and one day on 1 January are calendar months and the calendar year in progress, as «החודש» is everywhere in the app, and the line says the dates - kept, and now pinned as intended |
| 18 | minor: unlisted sites numbered over the range, not as the day screen numbers them | RIGHT - day.js:1094 and week.js:230 use the whole record | One whole-record map per reading (MEASURED 4.7 ms on the season); criterion 8 pins the day screen's N and its stability across ranges |
| 19 | minor: four Tabs no longer prove the crossing; find.js's header and the README say three doors | RIGHT | Five presses, ending on the next man's first door; the Shift+Tab end moves to «איפה עבד» (the price of item 15); find.js's header and tests/README.md:425-426 say four, in the same commit |

Found while verifying, and changed too:
- `.badge` is 11 px at the base (css/app.css:1479-1481): the «2 אתרים» badge is raised to 16 px
  inside a row, as the finder raises its own, and restated in css/large.css.
- The title's length moved the head: «מי עבד איפה» keeps it one line at 320 (48 px).
- With labels above, the choices take 304 px (378 at 320 with the mode): criterion 17's promise
  is now the measured one - the first tile on the glass everywhere but 320x568 with the mode,
  the whole tiles block at 375x667 without it and at 440x956.
- The old closure's real shape changes no count; the fixture holds that agreement as well as the
  hand-made shape that does not agree.

Unchanged, and still true: no field, path, writer or key of its own; no money function, gate or
ledger reader (the spy list gains `closedPeriods`); classic script, no module, no third-party
code, no SVG; `js/model`, `js/sync`, `js/state.js`, `js/store.js`, `js/recovery.js`,
`firestore.rules` and `functions/` untouched; the stamps, js/ui/whatsnew.js, docs/releases.md and
CLAUDE.md left to the integrator. Not tried on a real phone.
