# Handoff — «תמונת מצב» (track `status`)

| | |
|---|---|
| Branch | `feat-status` (never pushed; no PR) |
| Worktree | `/home/user/farkad/.claude/worktrees/feat-status` |
| Base | `6ab193d68c960e4a56d947673c282b867acd258f` (origin/main, stamps v204 - not moved) |
| The suites ran on | `7f0d2f9ba21f756092898220b15e86affed7286b` (fix round 1) - every suite one by one, the worktree clean (`git status --short` empty), logs in `/tmp/claude-0/-home-user-farkad/d6a64352-db1a-5c3b-b54d-5c09103f2419/scratchpad/feat-status/fix1/` (`chain/`, `browser2/`). Round 0 ran on `3e661d0` (logs in `…/feat-status/final/`) |
| After it | this file's own commit, which changes this file and nothing else |
| Contract | `features/status/contract.md` - revision 2, byte for byte the program's `status/contract.md` (re-read from disk in fix round 1: still revision 2, last written 14:19) |

## Fix round 1 (2026-11-19) - the review of 135bdb1, fifteen findings

Each finding opened against the code at 135bdb1 (`.claude/skills/triage/SKILL.md`'s way) and
reproduced: the Node ones by the new checks run against 135bdb1's own source (`git archive 135bdb1`,
the new `tests/statusscreen.test.mjs` copied in - `fix1/node-new-on-before.log`), the browser ones by
a probe on the same frozen tree (`fix1/repro.mjs`: `repro-journey-before.log`, `repro-before-2.log`) and
by the review's own logs. ALL FIFTEEN CONFIRMED; none not reproducible, none already handled. Paths below are in
`/tmp/claude-0/-home-user-farkad/d6a64352-db1a-5c3b-b54d-5c09103f2419/scratchpad/feat-status/fix1/`.

| # | finding | sev | verdict | outcome | the check that fails before and passes after |
|---|---|---|---|---|---|
| 6 | «פתיחת היום לעריכה» carries a «בניית סידור» journey from tomorrow to today and writes `farkadSederJourney` | P1 | CONFIRMED (`repro-journey-before.log`: date 11/11 -> 10/11, the key written) | FIXED: while a journey stands at its first station on another day the door is not offered, and `statusGoToday` refuses (`statusTodayMovesJourney`, status.js) | S1's new block «today's door» (journey at station 1 on Wednesday: no `go:today`, a press returns false, date/journey/disk unchanged; station 2 and a journey on today itself: the door is there); B21's new block (the journey started by a real tap on `#journeyDockBtn`, every other door pressed: journey and disk byte for byte; the door back once the journey is on today) |
| 1 | the door makes the strip taller with a count waiting (chevron width; hit-area height) on widths and labels B12 never tried | P2 | CONFIRMED (the review's `queue*.log`, and 135bdb1's own B12, which printed 92 -> 120 at 320 large and exempted it) | FIXED: the chevron removed (the contract's own condition); the hit area is (floor - 24)/2 of padding taken back by margin, so the door's line is the pill's own; `flex: none`; no hover filter | B12 widened: counts of 1-4 digits, 320/340/360/375/390/412/440, 667/736/768/844/960/1024, the mode off and on - equality everywhere, the pill unmoved, the pill all door, «הגדרות» all its own, the door's reach, no chevron |
| 7 | at 320 with the mode the door adds 28px whenever a count waits | P2 | CONFIRMED | FIXED (the same change: equality where 135bdb1's B12 exempted it) | B12 320 large, every count: 92 = 92, the pill where v204 drew it |
| 8 | a change from another phone moves everything under the money up 88px (126 large), then back | P2 | CONFIRMED (`repro-before-2.log`: the third week row at 120 -> 32 -> 120 at 375, 120 -> -6 -> 120 at 320 large; the money's place 112 -> 25px) | FIXED: the money's place keeps the height its lines had while it waits; a redraw keeps the row the reader was looking at where it stood (an anchor by key, also after the money is read) | B17: every week and site row on the glass at the same `top` after a commit, after the re-read, after a site's line leaves today above him, and after it comes back |
| 9 | the ride line «כל העובדים משובצים» under «לא נרשמו: 6» | P2 | CONFIRMED | FIXED: `STATUS_TEXT.rides(words)` = «הסעות: …» (the word is `TRANSPORT_TEXT.title`) | S2: every ride fixture now «הסעות: …», and a fixture with every rider seated: «הסעות: כל העובדים משובצים» under «שובצו: 4 · לא נרשמו: 1 · נעדרים: 1» |
| 10 | «עבדו בתקופה: 2» on a week the fortnight does not end, under 31 men | P2 | CONFIRMED | FIXED: one template, the cycle named every time - «עבדו בתקופה: שבועי 2», «… דו־שבועי 9», «… שבועי 2 · דו־שבועי 9» | S3: a Tuesday mid-fortnight (`2026-11-17`): «עבדו בתקופה: שבועי 2»; a fortnightly crew named too |
| 2 | the close line keeps an older record's count beside the board read again | P3 | CONFIRMED | FIXED: the mirror is dropped when the ledger (or the legacy map) has a new entry or the day turns under the open dialog; a count the reminder itself re-shows is mirrored; `renderStatusIfOpen` moved after `closeReminderAfterRender` in `render()` | S4: three accounts closed under the open dialog -> no close line, nothing read for it, the reminder's own line untouched; the day turned -> gone; a re-shown count mirrored; S10's hook check now says "after the close reminder's" |
| 3 | «עבדו בתקופה» counts a seder typed for days to come | P3 | CONFIRMED | FIXED: the period read UP TO TODAY (the pulse's and the sites' own rule) - a deviation from criterion 3's "(counted)", said below | S3: the Friday (only today's man counted, the sheet's own count over the period to today); Friday evening 2026-11-27, both periods opening, the seder typed: no line |
| 4 | «בממוצע 0 עובדים ביום עבודה»; «בממוצע 1 עובדים» | P3 | CONFIRMED | FIXED: `pulseCaptionQuiet` for four weeks with no working day; «עובד אחד» | S6: a crew that stopped in October; a crew of one; S10 pins every form |
| 15 | two colons in one line; «ו-24 ב-4» | P3 | CONFIRMED | FIXED: one colon, the word before its count, no-break spaces; «ארבעת השבועות» in words | S10: the templates word for word, one colon, no count before «ב-4» |
| 5 | the «מה חדש» text points at "the app's name", which no screen draws | P3 | CONFIRMED (`css/design.css:220` hides `.brand`) | FIXED in the proposed item for the integrator (below); no code - `js/ui/whatsnew.js` is the integrator's | - (the item is not code on this branch) |
| 11 | the pulse's day letters run into each other at 320 with the mode and seven columns, and pile up at doubled text | P3 | CONFIRMED (`repro-before-2.log`: gaps 3.9, -3.2, -1, 0 … at 320 large; down to -23.8px at doubled text) | FIXED: the geresh is a span of its own, dropped where the column is under 1.3em; the letter hidden where it is under 0.85em (container queries, the column's own em) | B18 «the pulse's day letters»: 320/375/440 large and 320 plain with a Saturday (seven columns), gaps ≥ 1px, every column still says its day; doubled text at 320 and 375: no letter drawn into the next |
| 12 | the five-line legend printed when no site has a word | P3 | CONFIRMED | FIXED: drawn only when a site has a word | S8: an evening with «בירידה» on the list: the legend; the same list on an evening with none, and a young record: no legend |
| 13 | a redraw drops the keyboard from «מי חייב כסף» to `<body>` | P3 | CONFIRMED (`repro-before-2.log`: BODY right after the commit and after the re-read) | FIXED: while the money waits the keyboard waits on `#statusMoney` (tabindex -1), and is given the button back when the board is drawn | B17: in its place inside the dialog while it waits; on «מי חייב כסף» again after; the next Tab goes on from there |
| 14 | a site off the roster drawn as a button; a long name orphans its swatch | P3 | CONFIRMED | FIXED: the off-roster row has no ground and a dashed line; the name takes `flex: 1 1 0` with `min-width: min(8em, 100% - 22px)` and the top line stands on the name's baseline | B18 «a site's row» at 320 large and 440: a plain row, no button under the finger, not the buttons' ground, dashed; a long name wraps beside its swatch; the ruler's floors on the whole dialog |

### What else the round found, and did

- **The door's own words on a wide window with no chip (found by the widened B12, not by the review).** On
  a phone with no chip (local only) the door shows «תמונת מצב» (90px) where a chip would stand. Above 700px
  the strip holds the tabs too, and on some widths has no room for a word that wide beside them: the words cost
  it a line - 701-768px (73 -> 127), and with the mode 768-844px (75 -> 131). Measured beside every chip in
  `fix1/wide.log`: from 701 to 736 every chip of v204 costs that same line («שולח…» 65px, «מסונכרן» 68px
  included); at 768 the two shortest still fit and «אין חיבור» (75px) and «שגיאת סנכרון» (103px) do not; with
  the mode, every chip costs it up to 844. From 800px (880 with the mode) the words fit and the strip is
  unchanged. Not fixed: the door must be worded (the v122 rule: an unexplained icon was the complaint), and a
  shorter word is the owner's to choose. B12 HOLDS the bound - the words, no wider than the chip of a sync
  error, never cost the strip more than that chip does in v204 on the same window - and prints each case. On
  every phone width (320 to 700) the strip is unchanged with every chip and with none.
- **The hit area in its first form (e67a9f8) was negative margins alone**, which would have made the door's
  line 24px whatever it held: its own words at twice the text size are taller than that. 19c1dfd makes it
  padding taken back by margin, so the line is never smaller than what is in it; B18 checks the words at
  doubled text inside the strip and clear of «הגדרות».
- **The price of keeping the strip, measured and said**: where the strip already puts the chip on a line of its
  own (the mode on, 320-360, a count waiting) the door's reach down its pill is all the room the strip has above
  «הגדרות»'s line - 42px measured: the 36px the strip has above that line, and 6px more beside «הגדרות», where
  nothing else stands - not 52. B12 holds "every point of the pill is the door's" and "every point of «הגדרות» its own" there, and the
  reach against the room. A 52px reach there needs 28px more strip, which is what the review asked to give back.
- **The door takes no hover filter** (7362d89): `button:hover { filter: … }` would make it a layer of its own,
  drawn over «הגדרות» where their rows meet.
- **B12's «הגדרות» points avoid its rounded corners** (a finger in a rounded-off corner lands on what is under the
  curve, in v204 too).
- **tests/nonassertions.test.mjs (V6)** caught B12's given() standing over a helper call only (f2cc482): the
  strip's equality is said in each loop again.

### Strings added or changed this round (PROPOSED; pinned in S10)

| key | words |
|---|---|
| `rides(words)` (new) | `${TRANSPORT_TEXT.title}: ${words}` - «הסעות: כל העובדים משובצים», «הסעות: בלי מושב: 3» |
| `worked(weekly, biweekly)` (replaces `worked(n)` and `workedBoth`) | `עבדו בתקופה: ` + `שבועי ${w}` and/or `דו־שבועי ${b}`, joined by ` · `; a no-break space between each cycle's word and its count and after «·»; a cycle with nobody is left out |
| `pulseCaption(a, b)` | `בממוצע ${a === 1 ? 'עובד אחד' : `${a} עובדים`} ביום עבודה בארבעת השבועות האחרונים, ו-${b} בארבעת השבועות שלפניהם.` |
| `pulseCaptionRecent(a)` | `בממוצע ${a === 1 ? 'עובד אחד' : `${a} עובדים`} ביום עבודה בארבעת השבועות האחרונים.` |
| `pulseCaptionQuiet(b)` (new) | `בארבעת השבועות האחרונים לא היה יום עבודה. בארבעת השבועות שלפניהם: בממוצע ${b === 1 ? 'עובד אחד' : `${b} עובדים`} ביום עבודה.` |

Borrowed this round: «הסעות» (`TRANSPORT_TEXT.title`, js/ui/transport.js), read from its block.

### Expectations moved this round (each the behaviour its finding changes; reasons in e67a9f8's message)

- `tests/statusscreen.test.mjs` S2: the ride line now says «הסעות: …» (finding 9).
- S3: the Friday's seder typed for Sunday is no longer counted (`worked: 2` -> `1`; finding 3); every worked line
  names its cycle («עבדו בתקופה: 2» -> «עבדו בתקופה: שבועי 2»; finding 10); the sheet's own count is asked over
  the period up to today.
- S6: the caption's words («ב-4» -> «בארבעת»; findings 4 and 15).
- S10: `worked(n)`/`workedBoth` -> `worked(weekly, biweekly)`; the captions; `rides`; `render()`'s order - after
  `closeReminderAfterRender`, no longer straight after `renderFindIfOpen` (finding 2).
- `tests/statusscreen.browser.mjs` B12: no chevron (was "a chevron beside it"); equality where 135bdb1 exempted
  320-large «38» (findings 1 and 7). B17: the rows' rectangles instead of `scrollTop` (finding 8).
- No other suite's expectation moved.

### Deviations from the contract, this round

- **Criterion 3, "a date after today already recorded (counted)"**: no longer counted. The contract's own goal
  says "how many men worked in that pay period so far", the line says «עבדו», and every other section of the
  screen reads up to today; the review showed the line saying «עבדו בתקופה: 4» on a Friday evening when nobody had
  worked. A Friday evening that opens both periods now has no payday line (the door stays).
- **The door table's «פתיחת היום לעריכה»**: not offered while a journey stands at its first station on another day
  (finding 6). Everything else of the table is as it was.
- **`renderStatusIfOpen` in `render()`**: after `closeReminderAfterRender`, not after `renderFindIfOpen` (finding 2).
- **The chevron**: gone, by the contract's own rule ("if any case is taller than the base with it, the chevron
  goes and the door stays worded").
- **Criterion 12 on a wide window with no chip** - above, «What else the round found».
- **`workedBoth`'s template** («שבועי: 8 · דו־שבועי: 4», the contract's revision 2): replaced by one template with
  one colon (finding 15).

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
- `135bdb1` features/status/handoff.md: what «תמונת מצב» is, what it reads, what ran, and what it does not do

Fix round 1:

- `e67a9f8` «תמונת מצב», fix round 1: the journey's day kept, the strip as it was, rows that stay put, words that say what they count
- `19c1dfd` «תמונת מצב»: the door's hit area is padding taken back by margin - its line never smaller than what is in it
- `d4025e4` tests/statusscreen.browser.mjs: the door's own words at twice the text size stay inside the strip, clear of «הגדרות»
- `3028773` tests/statusscreen.browser.mjs: the doubled-text check asks that the door's words are the ones drawn
- `53f61a0` tests/statusscreen.browser.mjs: B12 says "a line of its own" by what shares the chip's line, and the room by the line under it
- `f2cc482` tests/statusscreen.browser.mjs: B12's strip equality said in each loop, so the mode's given protects a check below it
- `7362d89` «תמונת מצב»: the door takes no hover filter - «הגדרות» stays on top where their rows meet
- `7f0d2f9` «תמונת מצב»: a site's name never asks for more of its row than the row has; B12's last two corrections

## Files changed against the base (`git diff --stat 6ab193d..7f0d2f9`; this file's own commit is the only one after it)

```
 css/app.css                    |   36 +
 css/design.css                 |  179 +++++
 css/large.css                  |   36 +
 features/status/contract.md    |  529 +++++++++++++
 features/status/handoff.md     |  429 +++++++++++
 index.html                     |   35 +-
 js/app.js                      |    7 +
 js/ui/backup.js                |   35 +-
 js/ui/modal.js                 |    2 +
 js/ui/status.js                | 1269 +++++++++++++++++++++++++++++++
 package.json                   |    6 +-
 sw.js                          |    1 +
 tests/README.md                |    2 +
 tests/screens.mjs              |   27 +
 tests/statusscreen.browser.mjs | 1124 ++++++++++++++++++++++++++++
 tests/statusscreen.test.mjs    | 1606 ++++++++++++++++++++++++++++++++++++++++
 tests/usual.test.mjs           |    6 +-
 17 files changed, 5310 insertions(+), 19 deletions(-)
```

One line each:

- `js/ui/status.js` (new) - the reading and its drawing: `STATUS_TEXT`/`STATUS_REUSED`, the pure readers (`statusFacts`, `statusMoneyFacts`), the frame (`openStatus`, `closeStatus`, `renderStatusIfOpen`, `statusDoorSync`, `statusFocusDoor`) and the doors. Writes no key; nothing in it commits.
- `index.html` - the chip wrapped in `button#statusDoor.status-door` (the span unchanged, `.status-door-words` beside it; no chevron since fix round 1); the static frame `#statusModal` after `#siteCardModal`; `<script src="js/ui/status.js">` after `reminders.js`, before `app.js`.
- `js/app.js` - two hooks, both through `typeof`: `renderStatusIfOpen()` in `render()` after `closeReminderAfterRender()` (fix round 1; it was after `renderFindIfOpen()`); `statusDoorSync(chip, label)` at the end of `renderSyncChip()`.
- `js/ui/modal.js` - `statusModal: () => closeStatus()` in `MODAL_CLOSERS`, after `whatsNewModal`.
- `js/ui/backup.js` - `backupAgeDays` and `backupAgeSentence` split out of `renderBackupAge`, behaviour-preserving (S9 draws the row with v204's own bytes out of Git and with these, byte for byte on every age).
- `sw.js` - `'./js/ui/status.js'` in the shell after `reminders.js`.
- `css/app.css` - the door's hit area: 44px, transparent, (44 - 24)/2 of padding taken back by as much margin so its line is the pill's own, `flex: none`, no hover filter; the words' rule.
- `css/design.css` - `--pulse-1..5` in the three scheme blocks; one block at the end of the screen layer, with no fixed height in it (fix round 1 adds the day letters' two container queries, the off-roster row, the name's `flex`/`min-width` and the top line's baseline).
- `css/large.css` - block 2: `.status-site` 64px and the door's padding and margin for 52; block 3: every size, weight and line-height of the block restated one for one.
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
| its rides | «הסעות: » (`TRANSPORT_TEXT.title`) + `journeyRideWords(journeyRideStatus(transportContext(d), <the stored day>))` - the session's `transportDays[d]`, else the day's bytes through `transportJson`/`transportReadDay` as they are, no key = `transportEmptyDay()`; no line when the day or the vehicle list will not read |
| its messages | `sederRun(sederCrew(...))`, `SEDER_TEXT.progress` |
| the next payday | `periodRangeFor` per man (archived men too), `entriesFor`/`isAbsent` over his period UP TO TODAY - who WORKED in it; no money; each cycle named |
| the accounts to close | MIRRORED: `closeReminderShown` while the reminder's line is up, `CLOSE_REMINDER_TEXT.line(n)` - never read here; dropped when the ledger has a new entry or the day turns under the open dialog |
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
| `worked(weekly, biweekly)` | `עבדו בתקופה: ` + `שבועי ${w}` and/or `דו־שבועי ${b}` joined by ` · ` (no-break spaces after each word and after «·»; the words read from `PAY_CYCLE_LABELS`) - fix round 1, replacing `worked(n)` and `workedBoth` |
| `rides(words)` | `${TRANSPORT_TEXT.title}: ${words}` - fix round 1 |
| `pulse` | «12 השבועות האחרונים» |
| `pulseCaption(a, b)` | `בממוצע ${a === 1 ? 'עובד אחד' : `${a} עובדים`} ביום עבודה בארבעת השבועות האחרונים, ו-${b} בארבעת השבועות שלפניהם.` |
| `pulseCaptionRecent(a)` | `בממוצע ${a === 1 ? 'עובד אחד' : `${a} עובדים`} ביום עבודה בארבעת השבועות האחרונים.` |
| `pulseCaptionQuiet(b)` | `בארבעת השבועות האחרונים לא היה יום עבודה. בארבעת השבועות שלפניהם: בממוצע ${b === 1 ? 'עובד אחד' : `${b} עובדים`} ביום עבודה.` - fix round 1 |
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
`TRANSPORT_TEXT.title` (fix round 1), `journeyDayEntryWords`. Never «נשלח».

## The ramp (contract criterion 15; measured in Chromium from the computed styles)

Values chosen (css/design.css), measured from the computed styles by B15 on 3e661d0, and the same again on 7f0d2f9:

| scheme | --pulse-1..5 | on `--surface` | neighbours |
|---|---|---|---|
| light | #6288d9 #426bc6 #2950ad #163990 #09256d | 3.48, 5.06, 7.38, 10.39, 14.03 :1 on #ffffff | 1.46, 1.46, 1.41, 1.35 :1 |
| dark | #4364ac #5b7ec8 #7999db #9ab6ed #c4d6fb | 3.13, 4.50, 6.32, 8.80, 12.28 :1 on #14171c | 1.44, 1.40, 1.39, 1.40 :1 |

One hue (OKLCH 264, the accent's family; no site's colour), lightness strictly monotone - darker for more in
the light scheme, brighter in the dark.

## Expectations moved

Round 0: ONE, on purpose, with its reason in commit 1627407 (fix round 1's are listed in its own section above):
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

On `7f0d2f9ba21f756092898220b15e86affed7286b`, the worktree clean. 107 of 109 exit 0. The two reds are the ones the contract expects on this
branch - the stamps, which the integrator moves - and nothing else (logs: `fix1/chain/`):

```
test:isolation  exit 0  0s  18/18 checks passed
test:blobs  exit 0  1s  11/11 checks passed
test:build  exit 1  2s  67/69 checks passed
test:poison  exit 0  0s  37/37 checks passed
test:merge  exit 0  1s  28/28 checks passed
test:contested  exit 0  15s  73/73 checks passed
test:held  exit 0  4s  83/83 checks passed
test:snapshot-stale  exit 0  2s  16/16 checks passed
test:reports-rules  exit 0  2s  26/26 checks passed
test:finance  exit 0  8s  57/57 checks passed
test:weekly-range  exit 0  1s  21/21 checks passed
test:finance-wording  exit 0  3s  12/12 checks passed
test:weekly-unpriced  exit 0  0s  23/23 checks passed
test:receipt  exit 0  2s  28/28 checks passed
test:data  exit 0  45s  1970/1970 checks passed
test:recovery  exit 0  2s  82/82 checks passed
test:adversarial  exit 0  6s  116/116 checks passed
test:probes  exit 0  7s  35/35 checks passed
test:capacity  exit 0  12s  48/48 checks passed
test:concurrency  exit 0  4s  46/46 checks passed
test:exports  exit 0  1s  112/112 checks passed
test:fence  exit 0  2s  35/35 checks passed
test:fence-ingress  exit 0  1s  43/43 checks passed
test:fence-legacy  exit 0  0s  21/21 checks passed
test:money-history  exit 0  0s  9/9 checks passed
test:money-units  exit 0  1s  21/21 checks passed
test:money-cloud  exit 0  1s  17/17 checks passed
test:money-display  exit 0  1s  4/4 checks passed
test:snapshot-poison  exit 0  2s  82/82 checks passed
test:samefact  exit 0  5s  37/37 checks passed
test:wording  exit 0  1s  37/37 checks passed
test:closure  exit 0  21s  122/122 checks passed
test:closure-echo  exit 0  1s  79/79 checks passed
test:correction  exit 0  1s  33/33 checks passed
test:quarantine  exit 0  1s  82/82 checks passed
test:approval  exit 0  7s  72/72 checks passed
test:repayment  exit 0  5s  240/240 checks passed
test:ledger-ingress  exit 0  0s  167/167 checks passed
test:cas  exit 0  13s  88/88 checks passed
test:status  exit 0  6s  37/37 checks passed
test:money  exit 0  2s  40/40 checks passed
test:money-ingress  exit 0  9s  206/206 checks passed
test:method  exit 0  3s  51/51 checks passed
test:restore  exit 0  0s  51/51 checks passed
test:upgrade  exit 0  2s  48/48 checks passed
test:vehicles  exit 0  2s  86/86 checks passed
test:xlsx  exit 0  2s  104/104 checks passed
test:nonassertions  exit 0  0s  23/23 checks passed
test:labels  exit 0  1s  23/23 checks passed
test:labelcache  exit 0  0s  32/32 checks passed
test:restore-ledger  exit 0  2s  26/26 checks passed
test:roster-upgrade  exit 0  7s  55/55 checks passed
test:roster-race  exit 0  6s  63/63 checks passed
test:exports-proof  exit 0  1s  92/92 checks passed
test:ledger-truth  exit 0  6s  148/148 checks passed
test:races  exit 0  5s  109/109 checks passed
test:overlap-restore  exit 0  20s  117/117 checks passed
test:refute-roster  exit 0  10s  24/24 checks passed
test:refute-restore  exit 0  43s  25/25 checks passed
test:gate-integrity  exit 1  0s  19/20 checks passed
test:queuecost  exit 0  7s  18/18 checks passed
test:paycycle  exit 0  0s  43/43 checks passed
test:paycycle-blockers  exit 0  2s  17/17 checks passed
test:paycycle-completion  exit 0  6s  31/31 checks passed
test:crew-controls  exit 0  1s  46/46 checks passed
test:simple-advances  exit 0  1s  66/66 checks passed
test:worker-deletion  exit 0  10s  86/86 checks passed
test:calendar  exit 0  1s  58/58 checks passed
test:reminders  exit 0  0s  48/48 checks passed
test:move-late  exit 0  5s  48/48 checks passed
test:codex-probes  exit 0  1s  17/17 checks passed
test:codex2-probes  exit 0  1s  36/36 checks passed
test:codex3-probes  exit 0  3s  59/59 checks passed
test:rima  exit 0  93s  496/496 checks passed
test:yosefgeves  exit 0  96s  562/562 checks passed
test:seder  exit 0  0s  135/135 checks passed
test:bars-stale  exit 0  1s  60/60 checks passed
test:transport  exit 0  2s  566/566 checks passed
test:transport-share  exit 0  13s  304/304 checks passed
test:oracle  exit 0  52s  121/121 checks passed
test:overpayment  exit 0  7s  105/105 checks passed
test:polish  exit 0  0s  73/73 checks passed
test:daycheck  exit 0  7s  169/169 checks passed
test:journey  exit 0  1s  233/233 checks passed
test:workercard  exit 0  29s  180/180 checks passed
test:monthsummary  exit 0  104s  98/98 checks passed
test:payslips  exit 0  46s  202/202 checks passed
test:find  exit 0  0s  91/91 checks passed
test:whatsnew  exit 0  1s  160/160 checks passed
test:account-view  exit 0  34s  456/456 checks passed
test:usual  exit 0  1s  150/150 checks passed
test:sitecard  exit 0  4s  119/119 checks passed
test:reportsclarity  exit 0  6s  1119/1119 checks passed
test:largetext  exit 0  1s  107/107 checks passed
test:reportnames  exit 0  14s  36/36 checks passed
test:holiday  exit 0  1s  109/109 checks passed
test:undo-stale  exit 0  2s  32/32 checks passed
test:auditfix  exit 0  2s  34/34 checks passed
test:owes  exit 0  75s  190/190 checks passed
test:weeklyclose  exit 0  144s  146/146 checks passed
test:reports-speed  exit 0  280s  159/159 checks passed
test:closeorder  exit 0  0s  22/22 checks passed
test:closuresize  exit 0  19s  13/13 checks passed
test:closerace  exit 0  39s  29/29 checks passed
test:advancereset  exit 0  66s  77/77 checks passed
test:overpaidfix  exit 0  0s  85/85 checks passed
test:xlsxlook  exit 0  12s  293/293 checks passed
test:closereminder  exit 0  18s  107/107 checks passed
test:statusscreen  exit 0  15s  232/232 checks passed
```

The two reds, as their suites print them:

```
test:build.log           **FAIL**  and nothing in the shell has changed since  — 8 changed since 6ab193d6: css/app.css, css/design.css, css/large.css, index.html, js/app.js, js/ui/backup.js, js/ui/modal.js, js/ui/status.js
test:build.log           **FAIL**  and neither has the worker that names the shelf  — sw.js
test:gate-integrity.log  **FAIL**  no cached file has changed since the three stamps last moved  — 7f0d2f9b «תמונת מצב»: a site's name never asks for more of its row th | 7362d89e «תמונת מצב»: the door takes no hover filter - «הגדרות» stays | 19c1dfd2 «תמונת מצב»: the door's hit area is padding taken back by ma | e67a9f8b «
```

`tests/statusscreen.test.mjs` printed, inside that chain (the browser suites of four tracks running beside it):

```
        season B: 41 men, 278 day keys, 644 advances, no close, 924 KiB as text
        statusFacts on the season: 21.2, 18.4, 15.2, 23.4, 12.3 ms (median 18.4)
        the board, nothing kept, on the season nobody closed: 570 ms (owesRead inside weeklyCloseOnce measured 309 ms by the scout)
        the board, kept: 24.1 ms
        a write on the day screen, then an open: 640 ms, the board read 1 time(s)
        the board, nothing kept, on the screens' record: 1 ms
        season D: 246 closes, 520 ledger entries, seeded in 3.9 s
        the board, nothing kept, on the season closed in order: 45 ms
```

Before the fixes: the new `tests/statusscreen.test.mjs`, run against 135bdb1's own source (`git archive 135bdb1`), failed 24
checks - every one of them a check this round added or moved (`fix1/node-new-on-before.log`; its S9 stops there,
the archive having no Git history for v204's `backup.js`).

### Browser suites, one by one through the two-slot wrapper (`bt`), on the same commit

`fix1/browsers.sh` on `7f0d2f9ba21f756092898220b15e86affed7286b`, the worktree clean: each suite this round's fixes touch, one
after another, each through the slot wrapper (the seconds include the wait for a slot; logs in `fix1/browser2/`):

```
statusscreen.browser.mjs  exit 0  2194s (slot wait included)  2424/2424 checks passed
design.browser.mjs  exit 0  10s (slot wait included)  72/72 checks passed
navigation.browser.mjs  exit 0  4s (slot wait included)  84/84 checks passed
startup.blank.test.mjs  exit 0  17s (slot wait included)  63/63 checks passed
closereminder.browser.mjs  exit 0  46s (slot wait included)  106/106 checks passed
smoke.mjs  exit 0  345s (slot wait included)  1186/1186 checks passed
mobile.test.mjs  exit 0  393s (slot wait included)  1397/1397 checks passed
largetext.browser.mjs  exit 0  725s (slot wait included)  8329/8329 checks passed
```

`tests/statusscreen.browser.mjs` printed:

```
        320x568 dark large, «9 ממתינים לשליחה»: the chip on a line of its own - the door reaches 42px down the pill, all the 36px the strip has above the line under it
        320x568 dark large, «38 ממתינים לשליחה»: the chip on a line of its own - the door reaches 42px down the pill, all the 36px the strip has above the line under it
        320x568 dark large, «138 ממתינים לשליחה»: the chip on a line of its own - the door reaches 42px down the pill, all the 36px the strip has above the line under it
        320x568 dark large, «1234 ממתינים לשליחה»: the chip on a line of its own - the door reaches 42px down the pill, all the 36px the strip has above the line under it
        320x568 light large, «9 ממתינים לשליחה»: the chip on a line of its own - the door reaches 42px down the pill, all the 36px the strip has above the line under it
        320x568 light large, «38 ממתינים לשליחה»: the chip on a line of its own - the door reaches 42px down the pill, all the 36px the strip has above the line under it
        320x568 light large, «138 ממתינים לשליחה»: the chip on a line of its own - the door reaches 42px down the pill, all the 36px the strip has above the line under it
        320x568 light large, «1234 ממתינים לשליחה»: the chip on a line of its own - the door reaches 42px down the pill, all the 36px the strip has above the line under it
        340x640 large, «38 ממתינים לשליחה»: the chip on a line of its own - the door reaches 42px down the pill, all the 36px the strip has above the line under it
        340x640 large, «138 ממתינים לשליחה»: the chip on a line of its own - the door reaches 42px down the pill, all the 36px the strip has above the line under it
        340x640 large, «1234 ממתינים לשליחה»: the chip on a line of its own - the door reaches 42px down the pill, all the 36px the strip has above the line under it
        360x640 large, «1234 ממתינים לשליחה»: the chip on a line of its own - the door reaches 42px down the pill, all the 36px the strip has above the line under it
        736x414, «no chip»: the door's own words (90px) take the line a chip takes - 73px without the door, 127px with it; v204 with «שגיאת סנכרון» (103px): 127px
        768x1024, «no chip»: the door's own words (90px) take the line a chip takes - 73px without the door, 127px with it; v204 with «שגיאת סנכרון» (103px): 127px
        768x1024 large, «no chip»: the door's own words (110px) take the line a chip takes - 75px without the door, 131px with it; v204 with «שגיאת סנכרון» (128px): 131px
        dark: #4364ac #5b7ec8 #7999db #9ab6ed #c4d6fb on #14171c - 3.13, 4.5, 6.32, 8.8, 12.28:1; neighbours 1.44, 1.4, 1.39, 1.4:1
        light: #6288d9 #426bc6 #2950ad #163990 #09256d on #ffffff - 3.48, 5.06, 7.38, 10.39, 14.03:1; neighbours 1.46, 1.46, 1.41, 1.35:1
        320x568 large: 7 columns of 16.5px, 18px letters, drawn ["ו","ש","א","ב","ג","ד","ה"], gaps 8.6, 5.2, 6.6, 8.5, 9, 7.2px
        375x667 large: 7 columns of 24.4px, 18px letters, drawn ["ו׳","ש׳","א׳","ב׳","ג׳","ד׳","ה׳"], gaps 9.1, 5.7, 7.2, 9, 9.5, 7.8px
        440x956 large: 7 columns of 33.7px, 18px letters, drawn ["ו׳","ש׳","א׳","ב׳","ג׳","ד׳","ה׳"], gaps 18.4, 15, 16.5, 18.3, 18.8, 17px
        320x568: 7 columns of 19.9px, 14px letters, drawn ["ו׳","ש׳","א׳","ב׳","ג׳","ד׳","ה׳"], gaps 8.5, 5.8, 7, 8.4, 8.8, 7.4px
        320x568, text doubled: 7 columns of 8.1px, 28px letters, drawn ["","","","","","",""], gaps px
        375x667, text doubled: 7 columns of 16px, 28px letters, drawn ["","","","","","",""], gaps px
        opened on the season at 4x: 168 ms to the first frame
        season B in the page: {"men":41,"days":277,"advances":649,"kib":907}
        the reminder's own reading on that season: its line down (every man held)
        at 4x: painted 120 ms after the tap, the board's lines 961 ms after that paint; owesRead 1, weeklyCloseRead 0
```

The first run of the widened suite (on 53f61a0, before 7362d89/f2cc482/7f0d2f9 - `fix1/b-statusscreen-1.log`)
ended 2196/2424 checks passed: 224 of the 228 reds were B12 sampling «הגדרות» at its rounded corners (the test's fault),
three were the wide windows with no chip, one the site names at doubled text - each answered in 7f0d2f9.

Before the fixes, on 135bdb1's frozen tree (`fix1/repro.mjs`): `repro-journey-before.log` - the today door moved the
journey from 11/11 to 10/11 and wrote `farkadSederJourney`; `repro-before-2.log` - the rows jumped 88px (126 with the
mode) and back, the keyboard fell to BODY, the day letters overlapped (-3.2px at 320 large, down to -23.8px at doubled
text).

## For the integrator

- «מה חדש» (PROPOSED; CORRECTED in fix round 1 - the contract's item said «ליד שם האפליקציה», and `css/design.css:220` hides the app's name on every screen, so it pointed at nothing): `{ title: 'תמונת מצב', text: 'לחיצה על מצב הסנכרון בפינה העליונה מימין פותחת תמונת מצב: היום, הסידור הבא, הכסף, 12 השבועות האחרונים והאתרים.', where: 'בפינה העליונה מימין ← מצב הסנכרון (או «תמונת מצב»)', go: 'status' }` - the door is the strip's first item, at its right-hand end in this right-to-left page, on every phone and window; «הגדרות» is at the other end - `go: 'status'` only navigates: shut the card and ⋯, then `statusFocusDoor()` (focuses `#statusDoor`, never presses it).
- CLAUDE.md, the files list:
  - `js/ui/status.js           v206: «תמונת מצב» - where the business stands, on one screen opened from the sync chip (#statusDoor): today, the next working day, the money, twelve weeks of men per day, the sites with one word each, this phone. A READING: no key written, every button only navigates; the board's money read after paint inside reportReadOnce + weeklyCloseOnce and kept by OWES_KEPT; the close count MIRRORED from the reminder's line, never read, and dropped when the money moves under the open dialog; no door to today while «בניית סידור» builds another day; every Hebrew word in one block (proposed)`
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
- **The strip, since fix round 1**: as tall as v204's on every phone width (320-700) with every chip and with none,
  and on wide windows with every chip; the price is the door's reach where the chip is on a line of its own (42px,
  not 52; above, «What else the round found»), and on a window 701-768px wide (768-844 with the mode) with no chip
  the door's own words cost the strip the line a chip costs it there (B12 holds no more than the sync-error chip's).
- **The close line follows the reminder's reading**, made after the first paint at boot: opened in the first
  moments after a start, the screen has no close line, and the reminder does not read while this dialog is open
  (it waits for midEdit() to be false) - the line appears at the next opening after the reminder has read.
- **The cost on a real low-end phone.** Measured at 4x CPU in Chromium on a season nobody closed (41 men,
  649 advances), fix round 1: painted 120 ms after the tap, the board's lines 961 ms after that paint (round 0: 156 and
  1,146 ms); Node: the board with nothing kept 570 ms inside the chain on the same kind of season (round 0: 376-402 ms
  alone, 656 ms in the chain). A phone slower than 4x a desktop core would be slower.
- **Every proposed word is the builder's**: the owner has read none of them.

## Screenshots (synthetic names; JPEG)

Written by the round's `statusscreen.browser.mjs` run on `7f0d2f9` (`STATUS_SHOTS`), the dialog as it opens, in
`/tmp/claude-0/-home-user-farkad/d6a64352-db1a-5c3b-b54d-5c09103f2419/scratchpad/feat-status/fix1/shots/`:

- `status-440-dark.jpg` - 440x956, dark, the mode off
- `status-320-dark-large.jpg`, `status-320-light-large.jpg` - 320x568 with «תצוגה גדולה»

Round 0's pictures (3e661d0) stay in `…/feat-status/` beside it.

Not tried on a real phone. Chromium with emulated touch only.
