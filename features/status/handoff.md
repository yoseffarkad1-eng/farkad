# Handoff — «תמונת מצב» (track `status`)

| | |
|---|---|
| Branch | `feat-status` (never pushed; no PR) |
| Worktree | `/home/user/farkad/.claude/worktrees/feat-status` |
| Base | `6ab193d68c960e4a56d947673c282b867acd258f` (origin/main, stamps v204 - not moved) |
| The suites ran on | `3e661d086427872a0fd6a8e4f85fc959bd54a75a` - every suite one by one, the worktree clean (`git status --short` empty), logs in `/tmp/claude-0/-home-user-farkad/d6a64352-db1a-5c3b-b54d-5c09103f2419/scratchpad/feat-status/final/` |
| After it | this file's own commit, which adds this file and nothing else |
| Contract | `features/status/contract.md` - revision 2, byte for byte the program's `status/contract.md` (re-read from disk before finishing: still revision 2, last written 14:19) |

## Commits (oldest first)

- `469fc3e` features/status/contract.md: the contract of «תמונת מצב», copied in before any code
- `a892e9a` «תמונת מצב»: one screen of where the business stands, opened from the sync chip
- `28c1249` tests/statusscreen.test.mjs: «תמונת מצב» held against its sources on devices (140 checks)
- `7d3b0e7` tests/statusscreen.browser.mjs, screens.mjs, package.json, README: «תמונת מצב» on the glass
- `1627407` «תמונת מצב», the contract's revision 2: the close count mirrored, the payday's men who worked, the rides as stored
- `22c5eb1` tests/statusscreen.test.mjs: «תמונת מצב» held to the contract's revision 2 (198 checks)
- `1eb2ab6` tests/statusscreen.browser.mjs, README: «תמונת מצב» on the glass, held to the contract's revision 2 (576 checks)
- `c41d507` features/status/contract.md: the contract's revision 2, as the critic left it
- `38c6f1e` tests/statusscreen.test.mjs: «תמונת מצב» on a first install - it opens, says what there is, writes nothing
- `3e661d0` tests/statusscreen.browser.mjs: B18's close row checked, not given

## Files changed against the base (`git diff --stat 6ab193d..3e661d0`; this file is the only one after it)

```
 css/app.css                    |   25 +
 css/design.css                 |  156 +++++
 css/large.css                  |   32 +
 features/status/contract.md    |  529 +++++++++++++++
 index.html                     |   32 +-
 js/app.js                      |    5 +
 js/ui/backup.js                |   35 +-
 js/ui/modal.js                 |    2 +
 js/ui/status.js                | 1106 +++++++++++++++++++++++++++++++
 package.json                   |    6 +-
 sw.js                          |    1 +
 tests/README.md                |    2 +
 tests/screens.mjs              |   27 +
 tests/statusscreen.browser.mjs |  821 +++++++++++++++++++++++
 tests/statusscreen.test.mjs    | 1436 ++++++++++++++++++++++++++++++++++++++++
 tests/usual.test.mjs           |    6 +-
 16 files changed, 4202 insertions(+), 19 deletions(-)
```

One line each:

- `js/ui/status.js` (new) - the reading and its drawing: `STATUS_TEXT`/`STATUS_REUSED`, the pure readers (`statusFacts`, `statusMoneyFacts`), the frame (`openStatus`, `closeStatus`, `renderStatusIfOpen`, `statusDoorSync`, `statusFocusDoor`) and the doors. Writes no key; nothing in it commits.
- `index.html` - the chip wrapped in `button#statusDoor.status-door` (the span unchanged, `.status-door-words` and a chevron beside it); the static frame `#statusModal` after `#siteCardModal`; `<script src="js/ui/status.js">` after `reminders.js`, before `app.js`.
- `js/app.js` - two hooks, both through `typeof`: `renderStatusIfOpen()` in `render()` after `renderFindIfOpen()`; `statusDoorSync(chip, label)` at the end of `renderSyncChip()`.
- `js/ui/modal.js` - `statusModal: () => closeStatus()` in `MODAL_CLOSERS`, after `whatsNewModal`.
- `js/ui/backup.js` - `backupAgeDays` and `backupAgeSentence` split out of `renderBackupAge`, behaviour-preserving (S9 draws the row with v204's own bytes out of Git and with these, byte for byte on every age).
- `sw.js` - `'./js/ui/status.js'` in the shell after `reminders.js`.
- `css/app.css` - the door's hit area (44px, transparent, no padding), the words/chevron rules.
- `css/design.css` - `--pulse-1..5` in the three scheme blocks; one block at the end of the screen layer, with no fixed height in it.
- `css/large.css` - block 2: `.status-site` 64px; block 3: every size, weight and line-height of the block restated one for one.
- `tests/statusscreen.test.mjs` (new), `tests/statusscreen.browser.mjs` (new) - the suites.
- `tests/screens.mjs` - two entries after 'the close reminder line': 'status - the whole screen', 'status - the door with no chip'.
- `package.json` - `test:statusscreen` appended to `test`, `test:statusscreen-browser` appended to `test:all`.
- `tests/README.md` - the two rows.
- `tests/usual.test.mjs` - ONE expectation moved (below).
- `features/status/contract.md` - the contract.

## Where each figure comes from

| line | read from |
|---|---|
| the sync sentence | `#storageNotice`'s text, verbatim |
| today's men, its words | `journeyCrewStatus` / `journeyCrewWords` |
| today's sites | `workersAtPlace` / `rimaCount`, each ACTIVE site with men |
| the next working day | `journeyDefaultDate`, `JOURNEY_TEXT.forDay` |
| its rides | `journeyRideWords(journeyRideStatus(transportContext(d), <the stored day>))` - the session's `transportDays[d]`, else the day's bytes through `transportJson`/`transportReadDay` as they are, no key = `transportEmptyDay()`; no line when the day or the vehicle list will not read |
| its messages | `sederRun(sederCrew(...))`, `SEDER_TEXT.progress` |
| the next payday | `periodRangeFor` per man (archived men too), `entriesFor`/`isAbsent` - who WORKED in his period; no money |
| the accounts to close | MIRRORED: `closeReminderShown` while the reminder's line is up, `CLOSE_REMINDER_TEXT.line(n)` - never read here |
| what the men owe | `owesReadNow()` inside `reportReadOnce` + `weeklyCloseOnce`, after paint, kept by `OWES_KEPT`; `owesMoney`, `owesCountLine`, `OWES_TEXT`/`OWES_REUSED` |
| the pulse | the union of `invoiceByDate(...).places[].days[].workerIds` per date (the week tab's tfoot rule) |
| a site's month, Rima | `invoiceWithoutRima(..., monthFrom, today, id).total`, `rimaReport(...).total` - the month so far |
| a site's eight weeks | `invoiceWithoutRima(..., from8, today).countAt` per week |
| a site's word | `STATUS_PHASE` over `dayCheckIsWorkingDay` and the same counts |
| «עובדי יוסף גבס» | `yosefGevesReport(..., monthFrom, today).total`, its own line, in no other number |
| the backup | `backupAgeSentence`, `backupReminderDue` / `BACKUP_REMINDER` |

## Every new string (PROPOSED - pinned word for word in `tests/statusscreen.test.mjs` S10)

| key | words |
|---|---|
| `title`, `door` | «תמונת מצב» |
| `doorName(label)` | `תמונת מצב · ${label}` |
| `heroLabel(n)` | n === 1 ? «עובד היום» : «עובדים היום» |
| `inSites(n)` | n === 1 ? «באתר אחד» : `ב-${n} אתרים` |
| `nobodyToday` | «עוד אין היום אף עובד באתר.» |
| `rima(n)` | `רימא ${n}` (the word borrowed, the template proposed) |
| `money` | «חשבונות ומקדמות» |
| `nextPayday(day, date, isToday)` | `יום התשלום הבא: ${isToday ? 'היום, ' : ''}${day} ${date}` |
| `worked(n)` | `עבדו בתקופה: ${n}` |
| `workedBoth(w, b)` | `עבדו בתקופה: שבועי: ${w} · דו־שבועי: ${b}` (the cycles' words read from `PAY_CYCLE_LABELS`) |
| `pulse` | «12 השבועות האחרונים» |
| `pulseCaption(a, b)` | `בממוצע ${a} עובדים ביום עבודה ב-4 השבועות האחרונים, ו-${b} ב-4 השבועות שלפניהם.` |
| `pulseCaptionRecent(a)` | `בממוצע ${a} עובדים ביום עבודה ב-4 השבועות האחרונים.` |
| `weekName(range, total, days)` | `שבוע ${range}: ${total === 1 ? 'יום נוכחות אחד' : `${total} ימי נוכחות`} · ${days}` |
| `few`, `many` | «מעט», «הרבה» |
| `pulseHint` | «לחיצה על שבוע פותחת אותו במסך השבוע.» |
| `sites` | «האתרים» |
| `siteDays` | «ימי עובד־אתר החודש» |
| `rising`, `falling`, `fresh`, `quiet` | «בעלייה», «בירידה», «חדש», «שקט» |
| `siteName(name, count, weeks)` | `${name}: ${count === 1 ? 'יום עובד־אתר אחד' : `${count} ימי עובד־אתר`} החודש · 8 השבועות האחרונים: ${weeks}` |
| `phaseNote` | «בעלייה או בירידה: כמה עובדים היו ביום עבודה ב-12 ימי העבודה האחרונים, לעומת 24 ימי העבודה שלפניהם. חדש: אתר שהתחיל לעבוד ב-12 ימי העבודה האחרונים. שקט: אתר פעיל שלא עבד בו אף עובד ב-5 ימי העבודה האחרונים.» (its numbers are `STATUS_PHASE`'s; S8 builds the expected sentence from the constants) |
| `yosef(n)` | `עובדי יוסף גבס החודש: ${n}` (the title read from `YOSEF_GEVES_TITLE`) |
| `noSites` | «לא נרשמה עבודה באתרים ב-8 השבועות האחרונים.» |
| `device` | «המכשיר הזה» |

The phase rule's constants, pinned (S8): `STATUS_PHASE = { history: 36, recent: 12, before: 24, quietDays: 5,
fallFrom: 4, fallShare: 0.6, fallBy: 3, freshDays: 10, riseFrom: 2, riseShare: 1.6, riseBy: 3 }`.

Borrowed, and found in their owners by S10: «היום», «פתיחת היום לעריכה», «רימא», «דוחות», «לא פעיל»,
«ענן וסנכרון», «גיבוי», «סגור» (`STATUS_REUSED`); read from their blocks, never repeated:
`JOURNEY_TEXT`, `SEDER_TEXT`, `CLOSE_REMINDER_TEXT`, `OWES_TEXT`, `OWES_REUSED`, `WEEKLY_CLOSE_TEXT.reading`,
`PAY_CYCLE_LABELS`, `YOSEF_GEVES_TITLE`, `YOSEF_GEVES_NOTE`, `BACKUP_REMINDER`, `HEBREW_DAY_LETTERS`,
`journeyDayEntryWords`. Never «נשלח».

## The ramp (contract criterion 15; measured in Chromium from the computed styles)

Values chosen (css/design.css), measured from the computed styles by B15 on 3e661d0:

| scheme | --pulse-1..5 | on `--surface` | neighbours |
|---|---|---|---|
| light | #6288d9 #426bc6 #2950ad #163990 #09256d | 3.48, 5.06, 7.38, 10.39, 14.03 :1 on #ffffff | 1.46, 1.46, 1.41, 1.35 :1 |
| dark | #4364ac #5b7ec8 #7999db #9ab6ed #c4d6fb | 3.13, 4.50, 6.32, 8.80, 12.28 :1 on #14171c | 1.44, 1.40, 1.39, 1.40 :1 |

One hue (OKLCH 264, the accent's family; no site's colour), lightness strictly monotone - darker for more in
the light scheme, brighter in the dark.

## Expectations moved

ONE, on purpose, with its reason in commit 1627407:
`tests/usual.test.mjs` «the last block of the screen layer but for the ones added since» names, in
order, every block of css/design.css after the usual site's; this screen's look is one more block at
the END of the layer (where the brief puts every feature's look), so it is named as the fifth and last -
the same move «סגירת שבוע», the readings of who owes and «עוד ⋯» each made before it. What it guards is
unchanged. Revision 1 of the look had fixed heights and broke `tests/payslips.test.mjs` («no fixed height
to the end of the layer»); that expectation was NOT moved - the look was changed to have none.

`tests/status.test.mjs` (the sync line's suite) is untouched: the contract names this track's suites
`tests/status.*`, but that name is taken, so they are `tests/statusscreen.*` (`test:statusscreen`,
`test:statusscreen-browser`).

## Migrations

None. No field, no key, no preference, no writer: the screen reads. Tested on an empty first-install
record (S9: it opens, says nobody today / nobody owing / no site / no backup, writes nothing) and on populated records (every block); the Node suite reads v204's `js/ui/backup.js` out of Git.

## Suites, run one by one (output pasted)

### `npm test`, script by script (`scripts/chain.sh`: each script of the chain run alone, its exit code and the last verdict line of its own output)

On `3e661d086427872a0fd6a8e4f85fc959bd54a75a`. 107 of 109 exit 0. The two reds are the ones the contract expects on this branch - the
stamps, which the integrator moves - and nothing else:

```
test:isolation  exit 0  0s  18/18 checks passed
test:blobs  exit 0  1s  11/11 checks passed
test:build  exit 1  2s  67/69 checks passed
test:poison  exit 0  0s  37/37 checks passed
test:merge  exit 0  1s  28/28 checks passed
test:contested  exit 0  15s  73/73 checks passed
test:held  exit 0  4s  83/83 checks passed
test:snapshot-stale  exit 0  2s  16/16 checks passed
test:reports-rules  exit 0  3s  26/26 checks passed
test:finance  exit 0  6s  57/57 checks passed
test:weekly-range  exit 0  0s  21/21 checks passed
test:finance-wording  exit 0  2s  12/12 checks passed
test:weekly-unpriced  exit 0  0s  23/23 checks passed
test:receipt  exit 0  2s  28/28 checks passed
test:data  exit 0  45s  1970/1970 checks passed
test:recovery  exit 0  2s  82/82 checks passed
test:adversarial  exit 0  5s  116/116 checks passed
test:probes  exit 0  7s  35/35 checks passed
test:capacity  exit 0  12s  48/48 checks passed
test:concurrency  exit 0  3s  46/46 checks passed
test:exports  exit 0  1s  112/112 checks passed
test:fence  exit 0  3s  35/35 checks passed
test:fence-ingress  exit 0  0s  43/43 checks passed
test:fence-legacy  exit 0  1s  21/21 checks passed
test:money-history  exit 0  0s  9/9 checks passed
test:money-units  exit 0  0s  21/21 checks passed
test:money-cloud  exit 0  2s  17/17 checks passed
test:money-display  exit 0  0s  4/4 checks passed
test:snapshot-poison  exit 0  2s  82/82 checks passed
test:samefact  exit 0  5s  37/37 checks passed
test:wording  exit 0  1s  37/37 checks passed
test:closure  exit 0  21s  122/122 checks passed
test:closure-echo  exit 0  1s  79/79 checks passed
test:correction  exit 0  0s  33/33 checks passed
test:quarantine  exit 0  2s  82/82 checks passed
test:approval  exit 0  6s  72/72 checks passed
test:repayment  exit 0  6s  240/240 checks passed
test:ledger-ingress  exit 0  0s  167/167 checks passed
test:cas  exit 0  13s  88/88 checks passed
test:status  exit 0  6s  37/37 checks passed
test:money  exit 0  2s  40/40 checks passed
test:money-ingress  exit 0  10s  206/206 checks passed
test:method  exit 0  3s  51/51 checks passed
test:restore  exit 0  0s  51/51 checks passed
test:upgrade  exit 0  2s  48/48 checks passed
test:vehicles  exit 0  2s  86/86 checks passed
test:xlsx  exit 0  2s  104/104 checks passed
test:nonassertions  exit 0  1s  23/23 checks passed
test:labels  exit 0  0s  23/23 checks passed
test:labelcache  exit 0  1s  32/32 checks passed
test:restore-ledger  exit 0  2s  26/26 checks passed
test:roster-upgrade  exit 0  7s  55/55 checks passed
test:roster-race  exit 0  6s  63/63 checks passed
test:exports-proof  exit 0  2s  92/92 checks passed
test:ledger-truth  exit 0  6s  148/148 checks passed
test:races  exit 0  5s  109/109 checks passed
test:overlap-restore  exit 0  21s  117/117 checks passed
test:refute-roster  exit 0  10s  24/24 checks passed
test:refute-restore  exit 0  43s  25/25 checks passed
test:gate-integrity  exit 1  1s  19/20 checks passed
test:queuecost  exit 0  6s  18/18 checks passed
test:paycycle  exit 0  0s  43/43 checks passed
test:paycycle-blockers  exit 0  3s  17/17 checks passed
test:paycycle-completion  exit 0  5s  31/31 checks passed
test:crew-controls  exit 0  1s  46/46 checks passed
test:simple-advances  exit 0  1s  66/66 checks passed
test:worker-deletion  exit 0  11s  86/86 checks passed
test:calendar  exit 0  0s  58/58 checks passed
test:reminders  exit 0  0s  48/48 checks passed
test:move-late  exit 0  6s  48/48 checks passed
test:codex-probes  exit 0  0s  17/17 checks passed
test:codex2-probes  exit 0  2s  36/36 checks passed
test:codex3-probes  exit 0  3s  59/59 checks passed
test:rima  exit 0  92s  496/496 checks passed
test:yosefgeves  exit 0  95s  562/562 checks passed
test:seder  exit 0  1s  135/135 checks passed
test:bars-stale  exit 0  1s  60/60 checks passed
test:transport  exit 0  1s  566/566 checks passed
test:transport-share  exit 0  13s  304/304 checks passed
test:oracle  exit 0  48s  121/121 checks passed
test:overpayment  exit 0  7s  105/105 checks passed
test:polish  exit 0  0s  73/73 checks passed
test:daycheck  exit 0  6s  169/169 checks passed
test:journey  exit 0  1s  233/233 checks passed
test:workercard  exit 0  27s  180/180 checks passed
test:monthsummary  exit 0  88s  98/98 checks passed
test:payslips  exit 0  28s  202/202 checks passed
test:find  exit 0  1s  91/91 checks passed
test:whatsnew  exit 0  0s  160/160 checks passed
test:account-view  exit 0  21s  456/456 checks passed
test:usual  exit 0  1s  150/150 checks passed
test:sitecard  exit 0  3s  119/119 checks passed
test:reportsclarity  exit 0  3s  1119/1119 checks passed
test:largetext  exit 0  1s  107/107 checks passed
test:reportnames  exit 0  11s  36/36 checks passed
test:holiday  exit 0  0s  109/109 checks passed
test:undo-stale  exit 0  2s  32/32 checks passed
test:auditfix  exit 0  1s  34/34 checks passed
test:owes  exit 0  74s  190/190 checks passed
test:weeklyclose  exit 0  118s  146/146 checks passed
test:reports-speed  exit 0  189s  159/159 checks passed
test:closeorder  exit 0  1s  22/22 checks passed
test:closuresize  exit 0  13s  13/13 checks passed
test:closerace  exit 0  38s  29/29 checks passed
test:advancereset  exit 0  53s  77/77 checks passed
test:overpaidfix  exit 0  1s  85/85 checks passed
test:xlsxlook  exit 0  11s  293/293 checks passed
test:closereminder  exit 0  15s  107/107 checks passed
test:statusscreen  exit 0  15s  205/205 checks passed
```

The two reds, as their suites print them:

```
test:build.log           **FAIL**  and nothing in the shell has changed since  — 8 changed since 6ab193d6: css/app.css, css/design.css, css/large.css, index.html, js/app.js, js/ui/backup.js, js/ui/modal.js, js/ui/status.js
test:build.log           **FAIL**  and neither has the worker that names the shelf  — sw.js
test:gate-integrity.log  **FAIL**  no cached file has changed since the three stamps last moved  — 16274070 «תמונת מצב», the contract's revision 2: the close count mirr | a892e9a0 «תמונת מצב»: one screen of where the business stands, op
```

`tests/statusscreen.test.mjs` printed, inside that chain (two browser suites running beside it):

```
        season B: 41 men, 278 day keys, 644 advances, no close, 924 KiB as text
        statusFacts on the season: 45.4, 17.6, 20.1, 30.5, 23.0 ms (median 23.0)
        the board, nothing kept, on the season nobody closed: 656 ms (owesRead inside weeklyCloseOnce measured 309 ms by the scout)
        the board, kept: 12.4 ms
        a write on the day screen, then an open: 507 ms, the board read 1 time(s)
        the board, nothing kept, on the screens' record: 1 ms
        season D: 246 closes, 520 ledger entries, seeded in 4.2 s
        the board, nothing kept, on the season closed in order: 64 ms
```

Measured alone on this same code earlier the same day, the board on season B took 376-402 ms (budget 900);
under the chain's load it took 656 ms. A single cold reading is what is held - the strictest honest one - so a much heavier load
could push it over; that is a timing check in `npm test`.

### Browser suites, one by one through the two-slot wrapper (`bt`), on the same commit

```
statusscreen.browser.mjs  exit 0  710s  588/588 checks passed
largetext.browser.mjs  exit 0  1254s  8329/8329 checks passed
mobile.test.mjs  exit 0  437s  1397/1397 checks passed
design.browser.mjs  exit 0  15s  72/72 checks passed
smoke.mjs  exit 1  102s  
navigation.browser.mjs  exit 0  7s  84/84 checks passed
settings.browser.mjs  exit 0  8s  107/107 checks passed
settings-order.browser.mjs  exit 0  54s  164/164 checks passed
polish.browser.mjs  exit 0  40s  201/201 checks passed
holiday.browser.mjs  exit 0  883s  393/393 checks passed
bars.stale.browser.mjs  exit 0  30s  47/47 checks passed
print.test.mjs  exit 0  25s  94/94 checks passed
whatsnew.browser.mjs  exit 0  71s  251/251 checks passed
owes.browser.mjs  exit 0  57s  589/589 checks passed
closereminder.browser.mjs  exit 0  38s  106/106 checks passed
journey.browser.mjs  exit 0  149s  869/869 checks passed
startup.blank.test.mjs  exit 0  16s  63/63 checks passed
```

`smoke.mjs` did not finish on the first pass: it threw, uncaught, at the offline reload of its export section,
with the other tracks' suites running on the machine at the same time:

```
    triggerUncaughtException(
    ^

page.reload: net::ERR_INTERNET_DISCONNECTED
Call log:
  - waiting for navigation until "load"

    at /home/user/farkad/.claude/worktrees/feat-status/tests/smoke.mjs:1911:14 {
  name: 'Error'
```

The section waits a fixed 1,500 ms for the service worker to take the shell down before it pulls the plug, and
the shell has one file more on this branch (`js/ui/status.js`). Re-run ALONE through the wrapper, on the same
commit, the tree clean (the contract's rule for a timing failure under load):

```
smoke.mjs (re-run)  exit 0  1186/1186 checks passed
```

`tests/statusscreen.browser.mjs` printed:

```
        320x568 dark large, «38 ממתינים לשליחה»: the strip wraps already - 92px without the door, 120px with it
        320x568 light large, «38 ממתינים לשליחה»: the strip wraps already - 92px without the door, 120px with it
        dark: #4364ac #5b7ec8 #7999db #9ab6ed #c4d6fb on #14171c - 3.13, 4.5, 6.32, 8.8, 12.28:1; neighbours 1.44, 1.4, 1.39, 1.4:1
        light: #6288d9 #426bc6 #2950ad #163990 #09256d on #ffffff - 3.48, 5.06, 7.38, 10.39, 14.03:1; neighbours 1.46, 1.46, 1.41, 1.35:1
        opened on the season at 4x: 391 ms to the first frame
        season B in the page: {"men":41,"days":277,"advances":649,"kib":907}
        the reminder's own reading on that season: its line down (every man held)
        at 4x: painted 156 ms after the tap, the board's lines 1146 ms after that paint; owesRead 1, weeklyCloseRead 0
```


## For the integrator

- «מה חדש» (PROPOSED, the contract's): `{ title: 'תמונת מצב', text: 'לחיצה על מצב הסנכרון למעלה, ליד שם האפליקציה, פותחת תמונת מצב: היום, הסידור הבא, הכסף, 12 השבועות האחרונים והאתרים.', where: 'למעלה, ליד שם האפליקציה ← מצב הסנכרון (או «תמונת מצב»)', go: 'status' }` - `go: 'status'` only navigates: shut the card and ⋯, then `statusFocusDoor()` (focuses `#statusDoor`, never presses it).
- CLAUDE.md, the files list:
  - `js/ui/status.js           v206: «תמונת מצב» - where the business stands, on one screen opened from the sync chip (#statusDoor): today, the next working day, the money, twelve weeks of men per day, the sites with one word each, this phone. A READING: no key written, every button only navigates; the board's money read after paint inside reportReadOnce + weeklyCloseOnce and kept by OWES_KEPT; the close count MIRRORED from the reminder's line, never read; every Hebrew word in one block (proposed)`
  - `tests/statusscreen.test.mjs v206: «תמונת מצב» on devices - every figure against the one function it is read from, the close count never read, the board read once, the budget; not tests/status.test.mjs, which is the sync line's`
  - `tests/statusscreen.browser.mjs v206 in Chromium: the door costs the strip nothing on every phone, scheme and mode; the dialog's floors, its doors and their focus, the first paint, the ramp, the budget at 4x CPU, nothing written`
- MERGE NOTE: `tests/usual.test.mjs`'s block-order check names this block after «סגירת שבוע»'s; every other track that appends a `/* ---- ` block to css/design.css moves the same check (and `tests/payslips.test.mjs` fails on any fixed `height:` after the journey's second pass) - on the merged tree the list is every new block in the order they land.
- On the merged tree, the contract asks one check of the integrator: the status → «לוח חודשי» door ends with `document.activeElement` on the board's title, and both ⋯ doors end on the heading `settingsJump` focused (this branch proves the ⋯ half for real and the board half with a stand-in that focuses a title of its own).

## Contract items NOT completed, and deviations

- **The suites' names.** The contract names them `tests/status.test.mjs` / `test:status` and
  `tests/status.browser.mjs` / `test:status-browser`. `tests/status.test.mjs` and `test:status` already exist -
  the sync line's own suite - so this track's are `tests/statusscreen.*` (`test:statusscreen`,
  `test:statusscreen-browser`), appended to `test` and `test:all` as the contract says. The old suite is untouched.
- **"transportLoad never called on this device" (Node criterion 2), read literally, does not hold - on purpose.**
  The contract's own formula for the ride line is `journeyRideStatus(transportContext(d), …)`, and
  `transportContext` → `transportSettings` loads the VEHICLE LIST through `transportLoad` the first time a session
  asks - exactly as the journey does. That is reached only when the list's bytes are absent or read (memory
  only; `transportLoad` writes nothing for either, transport.js:600-605, and the seed stays in memory); when they
  will not read there is no ride line and `transportLoad` is never reached (guard (a); S2 fixture (d): never
  loaded, every key byte for byte, no `:unreadable` copy). `transportLoad` is never called for a DAY, and
  `transportDayOf`, `transportPrune`, `transportPeekDay` and `openTransport` never at all (S2 spies; S10 scans the
  code). S2 fixture (e) prints the one load it sees: `farkadTransport:settings`.
- **"render() with the dialog shut calls nothing of this file but renderStatusIfOpen".** `render()` also calls
  `renderSyncChip()`, whose last line is the contract's own `statusDoorSync(chip, label)` hook: it names the door
  from the label it is handed and touches nothing else (with the dialog shut it does not even read the sync
  line). S11 holds twenty such draws to zero calls of `invoiceByDate`, `invoiceWithoutRima`, `payrollReport`,
  `statusFacts`, `drawStatus`, `statusMoneyFacts`, `statusMoneyLater` and `statusSyncSentence`.
- **The other tracks' doors** («יום תשלום», «לוח חודשי») are proved with stand-ins on this branch: the real ones
  are tracks `payday` and `monthboard`. On the merged tree the contract asks the integrator for one check: the
  status → «לוח חודשי» door ends on the board's title.
- **Not tried on a real phone.** Chromium 1194 with emulated touch, DPR 2, CPU throttling for the budget rows.
  Colour blindness is not simulated for the ramp (only its luminance contrast is measured).
- **Open question, with the default built (the contract's):** whether the owner wants the close count READ on
  this screen when the reminder's line is down. Default: no - the desk reads it, and a second 1.5 s reading here
  is the cost revision 2 removed. Note what that default means on a record where NOBODY has closed for weeks:
  «סגירת שבוע» holds every man (an earlier open period a debt ran through, v198 D5), so its count - and with it
  the reminder's line and this screen's close line - is 0 there (seen in B19's season: "its line down (every man
  held)"). The screen says nothing about closing on exactly the record with the most to close; «שים לב» on
  «מקדמות» and «דוחות» is where that is said today.

## Known risks

- **The merge with the other three tracks.** Each appends a `/* ---- ` block to css/design.css, and
  `tests/usual.test.mjs` names every block after the usual site's in order - each branch moves that one check its
  own way, so the integrator writes the merged list. `tests/payslips.test.mjs` fails on any fixed `height: N`
  after the journey's second pass: this block has none (revision 1 had, and was changed); at the time of writing
  the monthboard and yearsummary branches add `height:` declarations to the same layer.
- **The strip with «תצוגה גדולה» at 320 and the longest chip («38 ממתינים לשליחה»)**: the strip wraps there
  already (92px without the door) and the 52px door makes the wrapped strip 120px - the one case criterion 12
  exempts; measured and printed by B12, not held.
- **The close line follows the reminder's reading**, made after the first paint at boot: opened in the first
  moments after a start, the screen has no close line, and the reminder does not read while this dialog is open
  (it waits for midEdit() to be false) - the line appears at the next opening after the reminder has read.
- **The cost on a real low-end phone.** Measured at 4x CPU in Chromium on a season nobody closed (41 men,
  649 advances): painted 156 ms after the tap, the board's lines 1,146 ms after that paint; Node: the board
  with nothing kept 376-402 ms alone and 656 ms inside the chain on the same kind of season. A phone slower than 4x a desktop core would be slower.
- **Every proposed word is the builder's**: the owner has read none of them.

## Screenshots (synthetic names; JPEG)

In `/tmp/claude-0/-home-user-farkad/d6a64352-db1a-5c3b-b54d-5c09103f2419/scratchpad/feat-status/`, written by the
final `statusscreen.browser.mjs` run on 3e661d0 (`STATUS_SHOTS`), the dialog as it opens:

- `status-440-dark.jpg` - 440x956, dark, the mode off
- `status-320-dark-large.jpg`, `status-320-light-large.jpg` - 320x568 with «תצוגה גדולה»

And the whole dialog unclipped, from a scratch script on the same code: `look-440x956-dark-off-full.jpg`,
`look-375x667-light-off-full.jpg`.

Not tried on a real phone. Chromium with emulated touch only.
