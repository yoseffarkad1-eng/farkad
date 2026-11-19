# Handoff — «בדיקת הצוות» (track `crewcheck`)

| | |
|---|---|
| Branch | `feat-crewcheck` (never pushed; no PR) |
| Worktree | `/home/user/farkad/.claude/worktrees/feat-crewcheck` (`node_modules` a symlink to `/home/user/farkad/node_modules`) |
| Base | `6ab193d68c960e4a56d947673c282b867acd258f` (origin/main, stamps v204 - not moved) |
| The suites ran on | `b73550f671a64643089d3788d9a526a08a056dba`, the tree clean (`git status --short` empty): tests/crewcheck.browser.mjs and every Node re-run named below. The `npm test` chain and the eleven existing browser suites ran while HEAD moved `840bddb` → `b73550f` through commits that change `tests/crewcheck.browser.mjs` only - the app's bytes the same throughout (each browser suite checked the served tree against HEAD as it started), and the three Node suites that read the test corpus were run again on `b73550f`. Logs in `/tmp/claude-0/-home-user-farkad/d6a64352-db1a-5c3b-b54d-5c09103f2419/scratchpad/feat-crewcheck/` (`chain/`, `browsers/`, `full*.out`) |
| After it | this file's own commit, which adds this file and nothing else |
| Contract | `features/crewcheck/contract.md` - revision 2, byte for byte the program's `crewcheck/contract.md` (re-read from disk before finishing: unchanged, md5 `20880f09a718e70afedcc4d7e49d28d5`, last written 17:35) |

## Files changed against the base

```
 css/design.css                 |   17 +
 css/large.css                  |    3 +
 features/crewcheck/contract.md |  859 +++++++++++++++++++++++++
 index.html                     |   26 +
 js/ui/crewcheck.js             |  742 ++++++++++++++++++++++
 js/ui/modal.js                 |    2 +
 js/ui/roster.js                |    8 +
 package.json                   |    6 +-
 sw.js                          |    1 +
 tests/README.md                |    2 +
 tests/crewcheck.browser.mjs    |  981 +++++++++++++++++++++++++++++
 tests/crewcheck.test.mjs       | 1359 ++++++++++++++++++++++++++++++++++++++++
 tests/screens.mjs              |   54 ++
 13 files changed, 4058 insertions(+), 2 deletions(-)
```

One line each:

- `js/ui/crewcheck.js` (new) - the words (`CREW_CHECK_TEXT`, proposed; `CREW_CHECK_REUSED`, borrowed), the
  pure reading (`crewCheckRead`, `crewCheckPhoneKind`), the flat list (`crewCheckFindings`), the drawing
  (`renderCrewCheckInto`, through the one `crewCheckDraw`), the entry, the dialog's open/close/redraw, the
  doors (`crewCheckGo`) and the hold of the slow second tap, and `crewCheckFocusEntry` for «מה חדש». Writes
  no key; nothing in it commits.
- `index.html` - the empty host `div#crewCheckFoot.crewcheck-row[hidden]` after `.roster-columns` (line 239);
  the static frame `#crewCheckModal` after `#dayCheckModal` (line 969); `<script src="js/ui/crewcheck.js">`
  after `daycheck.js` and before the הסעות comment (line 1196).
- `sw.js` - `'./js/ui/crewcheck.js'` in `SHELL` after `daycheck.js` (line 106).
- `js/ui/modal.js` - `crewCheckModal: () => closeCrewCheck()` after `dayCheckModal` (line 42).
- `js/ui/roster.js` - the three lines the contract names, each with its comment: in `renderRoster` the two
  `typeof`-guarded calls (lines 35-36), and `row.dataset.placeId = place.id` in `renderPlaceList` (line 764).
  Nothing else; no rectangle moves (tests/crewcheck.browser.mjs section 10).
- `css/design.css` - one commented block straight after the day check's (lines 806-822), inside `@media screen`.
- `css/large.css` - block 3, its three sizes restated one for one straight after the day check's (lines 710-712).
- `tests/crewcheck.test.mjs` (new, `test:crewcheck`, appended to `npm test`) and `tests/crewcheck.browser.mjs`
  (new, `test:crewcheck-browser`, appended to `test:all`).
- `tests/screens.mjs` - two entries after 'crew - reorder' (lines 310-363), each carrying its in-memory change
  inside its own open/close.
- `package.json`, `tests/README.md` - the two scripts and the two rows.
- `features/crewcheck/contract.md` - the contract.

No expectation of an existing suite was moved.


## Commits (oldest first)

- `b3d02e5` features/crewcheck: the contract, revision 2, as the design round left it
- `0a500ec` «בדיקת הצוות»: one button at the foot of the crew screen and one dialog that reads the roster
- `4a6f3e5` tests/crewcheck.test.mjs: the rules, the phone family, the agreements, the tiers, the words, nothing written
- `e2c1114` tests/crewcheck.test.mjs: quiet seasons read as of each evening, the cost, not in a draw; into npm test
- `840bddb` tests/crewcheck.browser.mjs, tests/screens.mjs: the glass, and the two screens every floor is measured on
- `fc1ad33` tests/crewcheck.browser.mjs: a chip brought into view before a timed tap; the entries' place checked, not given
- `4d503a7` tests/crewcheck.browser.mjs: each timed trial on its own baseline; a gap the page did not see as asked is void and undone
- `e92928a` tests/crewcheck.browser.mjs: nothing leaves the phone from the dialog - no door but its names and «סגור», and not on paper
- `b73550f` tests/crewcheck.browser.mjs: the worker form's own once-a-session probe named, the doors held against the disk it leaves

Every commit after `0a500ec` changes the tests and their wiring only (tests/, package.json, tests/README.md):
`js/ui/crewcheck.js` and every other file the app serves are as `0a500ec` left them.

## The rules, and where each one is read from

| line | tier | exactly when | read from |
|---|---|---|---|
| `noRate` | כדאי לבדוק | `(Number(dailyRate) \|\| 0) <= 0` on an active man ('' / 0 / '0' / no field / negative / an hourly rate alone) | the roster as `js/state.js` normalises it |
| `badPhone` | כדאי לבדוק | a digit typed (`/[0-9٠-٩۰-۹]/`), `sederWaNumber(phone) === ''`, and not another country's as typed | `sederWaNumber` (js/ui/seder.js) |
| `sharedPhone` | כדאי לבדוק | two or more active men on one non-empty `normalisePhone`; a group whose every number opens regrouped by `sederWaNumber`, sub-groups of two or more stand | `normalisePhone` (schema.js), `sederWaNumber` |
| `sameName` | כדאי לבדוק | two or more active men with the same `name` string | `hasDuplicateName`'s comparison (roster.js) |
| `idle` | כדאי לבדוק | his last day with a site before the first of the last 25 working days (on or before today) | `dayCheckHasSite`, `dayCheckIsWorkingDay` (daycheck.js) |
| `idleSites` | כדאי לבדוק | the same for a site: the last day anybody had a site there, or Rima's or יוסף גבס's men were counted on it | `dayCheckHasSite`, `rimaCount`, `yosefGevesCount` (schema.js) |
| `otherPhone` | לידיעה | a digit, the seder refuses it, and a typed `+` or `00` then a country that is neither 972 nor a 0 | the typed text |
| `noPhone` | לידיעה | no digit typed at all, and he has a day of work that is not idle | as above |
| `zeroStamped` | לידיעה | an active man's days with a site whose stamp has `daily <= 0` (`stamped: true`) | `ratesForDay` (money.js) - one fact, no figure |
| `never` | לידיעה | an active man with no day of work at all (absences only included) | `dayCheckHasSite` |
| `neverSites` | לידיעה | an active site with no day at all | as `idleSites` |

The window `S` is `W[W.length - 25]` with `W` every key `<= today` that `dayCheckIsWorkingDay` accepts; with
fewer than 25 there is no window and nothing is idle, and the dialog says so in its first line.
`crewCheckRead(schedule, today, layer, asOf)`: one forward pass over the sorted day keys, stopping at the
first key after `asOf` when it is given (the app gives none). The contract's "then a binary search" is a
comparison: `W` is sorted, so "25 working days after `L`" is exactly `L < S` - the same answer, no search.

## For the integrator

**«מה חדש»** (PROPOSED, the contract's revision-2 text, pinned in tests/crewcheck.test.mjs section 5 and held
to the copy in `WHATSNEW_BUILDS` once it is there - SKIP, printed, until then):

```js
{ title: 'בדיקת הצוות',
    text: 'בסוף מסך הצוות: מה כדאי לסדר בעובדים ובאתרים - שכר יומי חסר, טלפון שלא ייפתח בוואטסאפ, שם או מספר כפול, ועובדים ואתרים בלי עבודה ב-25 ימי העבודה האחרונים.',
    where: 'צוות ← בדיקת הצוות (בסוף המסך)', go: 'crewcheck' }
```

and in `WHATSNEW_GO` (navigation only; the button is given the keyboard and never pressed; with nobody on
the crew the screen alone - `crewCheckFocusEntry()` answers false):

```js
// «בדיקת הצוות»: the crew screen, and the button at its foot brought to the middle and given the
// keyboard - NOT pressed (js/ui/crewcheck.js, crewCheckFocusEntry).
crewcheck: () => { showView('roster'); setTimeout(() => { if (typeof crewCheckFocusEntry === 'function') crewCheckFocusEntry(); }, 0); return true; },
```

Its landing rule joins tests/whatsnew.browser.mjs's `lands` (the entry focused, on the glass, the dialog
shut, no byte moved) and the key list at :427. `crewCheckFocusEntry` is held by tests/crewcheck.browser.mjs.

**The CLAUDE.md file-list line** (the contract's words):

    js/ui/crewcheck.js         «בדיקת הצוות» - a reading of the roster from one button at the foot of the crew
                               screen: no daily rate, a number that will not open, one number or one name on two
                               active rows, 25 working days with no work (men and sites); the rest under
                               «לידיעה», days stamped with no daily rate among them; each name one door that only
                               navigates, the «פעיל» switches and the form's «שמור» held for 700 ms after it;
                               writes nothing; every Hebrew word in one block (proposed)

**A release-entry paragraph** (for docs/releases.md, in its manner; the integrator's to adjust):

> «בדיקת הצוות» (js/ui/crewcheck.js): ONE button at the foot of the crew screen, after the sites - where
> nothing that was measured before it moves - and ONE dialog that reads the roster against the record:
> under «כדאי לבדוק» a man with no daily rate, a number written as an Israeli one that will not open in
> WhatsApp, one number or one name on two active rows, and men and sites with no work in the last 25
> working days (with the day of the last); under «לידיעה», never counted, another country's number, no
> number for a man working these days, days stamped with no daily rate (iron law 2: nothing mends them),
> and men and sites with no day of work at all. Each name or site only navigates - the man's form on the
> field to mend, or his row or the site's row - and for DOUBLE_TAP_GUARD_MS after a door the «פעיל»
> switches and the form's «שמור» are held (the house's guardFingersOn, on each press's own time). It writes
> nothing: no record, no key, no preference. Every Hebrew word proposed and pinned (tests/crewcheck.test.mjs);
> not tried on a real phone.

**Interplay with wave 1 (`payday`)** - a fact about its doors, nothing of wave 1 changed: payday's c («…
בלי שכר יומי, ולכן הסכום חסר אותם») and f («שעות נוספות בלי שכר שעה») both send the owner to «עובדים
ואתרים». For c, the check names the man under `noRate` when his roster has no daily rate (the form's door
mends it: every day recorded with no stamp, and every day from then on, is priced at the rate typed), and
under `zeroStamped` with how many days when his days were stamped with no daily rate (an hourly-only man):
those stay without an amount whatever is typed, so c will go on naming him for a period that holds them,
and the check says why. For f the check says nothing: it reads no hourly rate, and an hourly rate typed in
the form prices only the extra hours recorded after it (the stamp carries the hourly rate too,
money.js:76-83) - that is for payday's door to say. And `status`'s «שקט» (5 working days) and this check's
idle site (25) read the same calendar and ask different questions; the release note can say both numbers.

## Every new string (PROPOSED; `CREW_CHECK_TEXT`, pinned word for word in tests/crewcheck.test.mjs section 5)

| key | words |
|---|---|
| `entry`, `title` | בדיקת הצוות |
| `counts(men, sites)` | עובדים פעילים: ${men} · אתרים פעילים: ${sites} |
| `tooFew(25)` | עדיין אין 25 ימי עבודה רשומים, ולכן לא נבדקו עובדים ואתרים בלי עבודה זמן רב. |
| `clean` | ✓ לא נמצא בצוות דבר שכדאי לבדוק. |
| `goForm` / `goRow` / `goSite` (read aloud) | עריכת הפרטים של ${name} / הצג את ${name} ברשימת העובדים / הצג את ${name} ברשימת האתרים |
| `noRate` (1 / many) | בלי שכר יומי - ימי העבודה שלו לא יחושבו בשכר: / בלי שכר יומי - ימי העבודה שלהם לא יחושבו בשכר: |
| `badPhone` (1 / many) | אין מספר טלפון תקין - המספר שנרשם לו לא ייפתח בוואטסאפ: / אין מספר טלפון תקין - המספרים שנרשמו להם לא ייפתחו בוואטסאפ: |
| `sharedPhone` | מספר משותף - ${number} רשום אצל ${count} עובדים פעילים: |
| `sameName` | שם כפול - ${count} עובדים פעילים בשם ${name}: |
| `idle` (1 / many) | לא עבד ב-25 ימי העבודה האחרונים (מאז ${since}), ועדיין פעיל: / לא עבדו ב-25 ימי העבודה האחרונים (מאז ${since}), ועדיין פעילים: |
| `archiveIf` (+ the borrowed sentence, one line) | אם מכבים עובד בכפתור «פעיל»: הימים שכבר נרשמו יישמרו, והעובד לא יופיע ברשימה היומית. |
| `idleSites` (1 / many) | אתר שלא נרשמה בו עבודה ב-25 ימי העבודה האחרונים (מאז ${since}), ועדיין פעיל: / אתרים שלא נרשמה בהם עבודה ב-25 ימי העבודה האחרונים (מאז ${since}), ועדיין פעילים: |
| `otherPhone` (1 / many) | מספר שאינו נייד ישראלי - אי אפשר לפתוח לו הודעה בוואטסאפ: / מספרים שאינם ניידים ישראליים - אי אפשר לפתוח להם הודעה בוואטסאפ: |
| `noPhone` (1 / many) | בלי טלפון - אי אפשר לפתוח לו הודעה בוואטסאפ: / בלי טלפון - אי אפשר לפתוח להם הודעה בוואטסאפ: |
| `zeroStamped` (1 / many) | ימים שנרשמו לו בלי שכר יומי יישארו בלי סכום גם אחרי שיוזן שכר: / ימים שנרשמו להם בלי שכר יומי יישארו בלי סכום גם אחרי שיוזן שכר: |
| `never` (1 / many) | פעיל בלי אף יום עבודה רשום: / פעילים בלי אף יום עבודה רשום: |
| `neverSites` (1 / many) | אתר פעיל בלי אף יום עבודה רשום: / אתרים פעילים בלי אף יום עבודה רשום: |
| `chip`, `oneDay`, `days(n)` | ${name} · ${more} / יום אחד / ${n} ימים |

BORROWED (`CREW_CHECK_REUSED`, each found in its owner by the suite): «כדאי לבדוק», «לידיעה», «הבדיקה רק מראה מה
כדאי לבדוק. היא לא משנה ולא שומרת דבר.», «סגור» (read from `DAY_CHECK_TEXT`); «אין מספר טלפון תקין» (read from
`SEDER_TEXT`); «בלי טלפון», «מספר משותף», «שם כפול» and the archive question's body «הימים שכבר נרשמו יישמרו,
והעובד לא יופיע ברשימה היומית.» (repeated from js/ui/roster.js, where they are inline). Never «נשלח», «עזב»,
«עזבו», «סיים», «הפסיק».

## Where the code follows the code's truth rather than the contract's words

- "ONE forward pass ... then a binary search": the pass is one, and the search is a comparison - `W` is
  sorted, so "at least 25 working days of W after L" is exactly `L < W[W.length - 25]`.
- The `zeroStamped` count is taken on the layer handed in only when it is `'actual'` (the app's only
  layer): `ratesForDay` reads the 'actual' layer and no other, the day check's own reason
  (daycheck.js:263-264).
- Beyond the contract, and said: the dialog opens at its top every time (`scrollTop = 0` on open - the
  migration dialog's older habit of opening where it was last read to is not copied); a row door whose
  man was switched off between the draw and the press opens the archive fold to land on him (view only,
  never stored); form-door chips carry `aria-haspopup="dialog"`; and `crewCheckFocusEntry()` exists for
  «מה חדש»'s «הראה לי» (held by the browser suite; the integrator's WHATSNEW_GO line is above).
- js/ui/roster.js has the contract's three lines and a comment above each pair; js/ui/modal.js has the
  one row and a comment above it (two lines).

## The suites, one by one

### `npm test`, every suite of the chain run on its own (an `&&` chain stops at the first red, and two reds are expected on a track branch)

107 of 109 green. The two red ones are the contract's expected pair and nothing else - the stamps, which the
integrator moves:

```
test:build | exit 1 | 1s | 67/69 checks passed
test:gate-integrity | exit 1 | 0s | 19/20 checks passed
```

```
  the stamps were moved by the commit that moved the bytes :: and nothing in the shell has changed since  — 6 changed since 6ab193d6: css/design.css, css/large.css, index.html, js/ui/crewcheck.js, js/ui/modal.js, js/ui/roster.js
  the stamps were moved by the commit that moved the bytes :: and neither has the worker that names the shelf  — sw.js
  (gate.integrity) the build stamps describe the bytes a phone would be handed :: no cached file has changed since the three stamps last moved  — 0a500ecf «בדיקת הצוות»: ...
```

Every line of the chain (suite | exit | seconds | last count):

```
test:isolation | exit 0 | 0s | 18/18 checks passed
test:blobs | exit 0 | 1s | 11/11 checks passed
test:build | exit 1 | 1s | 67/69 checks passed
test:poison | exit 0 | 0s | 37/37 checks passed
test:merge | exit 0 | 0s | 28/28 checks passed
test:contested | exit 0 | 16s | 73/73 checks passed
test:held | exit 0 | 3s | 83/83 checks passed
test:snapshot-stale | exit 0 | 1s | 16/16 checks passed
test:reports-rules | exit 0 | 2s | 26/26 checks passed
test:finance | exit 0 | 6s | 57/57 checks passed
test:weekly-range | exit 0 | 0s | 21/21 checks passed
test:finance-wording | exit 0 | 2s | 12/12 checks passed
test:weekly-unpriced | exit 0 | 0s | 23/23 checks passed
test:receipt | exit 0 | 1s | 28/28 checks passed
test:data | exit 0 | 43s | 1970/1970 checks passed
test:recovery | exit 0 | 1s | 82/82 checks passed
test:adversarial | exit 0 | 5s | 116/116 checks passed
test:probes | exit 0 | 7s | 35/35 checks passed
test:capacity | exit 0 | 13s | 48/48 checks passed
test:concurrency | exit 0 | 3s | 46/46 checks passed
test:exports | exit 0 | 1s | 112/112 checks passed
test:fence | exit 0 | 3s | 35/35 checks passed
test:fence-ingress | exit 0 | 0s | 43/43 checks passed
test:fence-legacy | exit 0 | 1s | 21/21 checks passed
test:money-history | exit 0 | 0s | 9/9 checks passed
test:money-units | exit 0 | 0s | 21/21 checks passed
test:money-cloud | exit 0 | 2s | 17/17 checks passed
test:money-display | exit 0 | 0s | 4/4 checks passed
test:snapshot-poison | exit 0 | 2s | 82/82 checks passed
test:samefact | exit 0 | 5s | 37/37 checks passed
test:wording | exit 0 | 1s | 37/37 checks passed
test:closure | exit 0 | 25s | 122/122 checks passed
test:closure-echo | exit 0 | 1s | 79/79 checks passed
test:correction | exit 0 | 1s | 33/33 checks passed
test:quarantine | exit 0 | 2s | 82/82 checks passed
test:approval | exit 0 | 8s | 72/72 checks passed
test:repayment | exit 0 | 5s | 240/240 checks passed
test:ledger-ingress | exit 0 | 1s | 167/167 checks passed
test:cas | exit 0 | 12s | 88/88 checks passed
test:status | exit 0 | 7s | 37/37 checks passed
test:money | exit 0 | 2s | 40/40 checks passed
test:money-ingress | exit 0 | 10s | 206/206 checks passed
test:method | exit 0 | 3s | 51/51 checks passed
test:restore | exit 0 | 0s | 51/51 checks passed
test:upgrade | exit 0 | 2s | 48/48 checks passed
test:vehicles | exit 0 | 2s | 86/86 checks passed
test:xlsx | exit 0 | 2s | 104/104 checks passed
test:nonassertions | exit 0 | 0s | 23/23 checks passed
test:labels | exit 0 | 1s | 23/23 checks passed
test:labelcache | exit 0 | 0s | 32/32 checks passed
test:restore-ledger | exit 0 | 2s | 26/26 checks passed
test:roster-upgrade | exit 0 | 6s | 55/55 checks passed
test:roster-race | exit 0 | 6s | 63/63 checks passed
test:exports-proof | exit 0 | 2s | 92/92 checks passed
test:ledger-truth | exit 0 | 7s | 148/148 checks passed
test:races | exit 0 | 5s | 109/109 checks passed
test:overlap-restore | exit 0 | 20s | 117/117 checks passed
test:refute-roster | exit 0 | 10s | 24/24 checks passed
test:refute-restore | exit 0 | 43s | 25/25 checks passed
test:gate-integrity | exit 1 | 0s | 19/20 checks passed
test:queuecost | exit 0 | 7s | 18/18 checks passed
test:paycycle | exit 0 | 0s | 43/43 checks passed
test:paycycle-blockers | exit 0 | 2s | 17/17 checks passed
test:paycycle-completion | exit 0 | 5s | 31/31 checks passed
test:crew-controls | exit 0 | 1s | 46/46 checks passed
test:simple-advances | exit 0 | 1s | 66/66 checks passed
test:worker-deletion | exit 0 | 11s | 86/86 checks passed
test:calendar | exit 0 | 0s | 58/58 checks passed
test:reminders | exit 0 | 0s | 48/48 checks passed
test:move-late | exit 0 | 5s | 48/48 checks passed
test:codex-probes | exit 0 | 1s | 17/17 checks passed
test:codex2-probes | exit 0 | 1s | 36/36 checks passed
test:codex3-probes | exit 0 | 3s | 59/59 checks passed
test:rima | exit 0 | 94s | 496/496 checks passed
test:yosefgeves | exit 0 | 96s | 562/562 checks passed
test:seder | exit 0 | 0s | 135/135 checks passed
test:bars-stale | exit 0 | 0s | 60/60 checks passed
test:transport | exit 0 | 2s | 566/566 checks passed
test:transport-share | exit 0 | 14s | 304/304 checks passed
test:oracle | exit 0 | 82s | 121/121 checks passed
test:overpayment | exit 0 | 8s | 105/105 checks passed
test:polish | exit 0 | 0s | 73/73 checks passed
test:daycheck | exit 0 | 8s | 169/169 checks passed
test:journey | exit 0 | 2s | 233/233 checks passed
test:workercard | exit 0 | 30s | 180/180 checks passed
test:monthsummary | exit 0 | 118s | 98/98 checks passed
test:payslips | exit 0 | 40s | 202/202 checks passed
test:find | exit 0 | 1s | 91/91 checks passed
test:whatsnew | exit 0 | 0s | 160/160 checks passed
test:account-view | exit 0 | 22s | 456/456 checks passed
test:usual | exit 0 | 1s | 150/150 checks passed
test:sitecard | exit 0 | 3s | 119/119 checks passed
test:reportsclarity | exit 0 | 4s | 1119/1119 checks passed
test:largetext | exit 0 | 0s | 107/107 checks passed
test:reportnames | exit 0 | 11s | 36/36 checks passed
test:holiday | exit 0 | 0s | 109/109 checks passed
test:undo-stale | exit 0 | 2s | 32/32 checks passed
test:auditfix | exit 0 | 2s | 34/34 checks passed
test:owes | exit 0 | 66s | 190/190 checks passed
test:weeklyclose | exit 0 | 119s | 146/146 checks passed
test:reports-speed | exit 0 | 218s | 159/159 checks passed
test:closeorder | exit 0 | 1s | 22/22 checks passed
test:closuresize | exit 0 | 11s | 13/13 checks passed
test:closerace | exit 0 | 39s | 29/29 checks passed
test:advancereset | exit 0 | 47s | 77/77 checks passed
test:overpaidfix | exit 0 | 0s | 85/85 checks passed
test:xlsxlook | exit 0 | 9s | 293/293 checks passed
test:closereminder | exit 0 | 14s | 107/107 checks passed
test:crewcheck | exit 0 | 24s | 148/148 checks passed
```

Re-run on `b73550f` exactly:

```
tests/crewcheck.test.mjs | 148/148 checks passed
tests/build.test.mjs | 67/69 checks passed
tests/isolation.test.mjs | 18/18 checks passed
tests/nonassertions.test.mjs | 23/23 checks passed
tests/gate.integrity.test.mjs | 19/20 checks passed
tests/daycheck.test.mjs | 169/169 checks passed
tests/seder.test.mjs | 135/135 checks passed
tests/find.test.mjs | 91/91 checks passed
tests/reportnames.test.mjs | 36/36 checks passed
tests/largetext.test.mjs | 107/107 checks passed
```

### Browser suites, each through the slot wrapper

```
tests/crewcheck.browser.mjs | exit 0 | 421/421 checks passed     (on b73550f)
largetext.browser.mjs | exit 0 | 3123s | 8335/8335 checks passed
mobile.test.mjs | exit 0 | 433s | 1397/1397 checks passed
design.browser.mjs | exit 0 | 12s | 72/72 checks passed
smoke.mjs | exit 0 | 425s | 1186/1186 checks passed
roster.browser.mjs | exit 0 | 5s | 42/42 checks passed
polish.browser.mjs | exit 0 | 24s | 201/201 checks passed
sitecard.browser.mjs | exit 0 | 20s | 135/135 checks passed
workercard.browser.mjs | exit 0 | 15s | 116/116 checks passed
daycheck.browser.mjs | exit 0 | 21s | 122/122 checks passed
doubletap.browser.mjs | exit 0 | 551s | 359/359 checks passed
scroll.browser.mjs | exit 0 | 156s | 604/604 checks passed
```

(the seconds include the wait for a slot; up to eighteen jobs of other tracks were queued for the two.)
smoke's own check of the roster's last button now measures this one, and holds:
`PASS  390x844: the last button on the roster clears the tab bar — {"dayBarShown":false,"clear":true,"reachable":true,"label":"בדיקת הצוות"}`.
tests/largetext.browser.mjs walked both new screens.mjs entries at every phone, scheme and mode (8335/8335).

The end of tests/crewcheck.browser.mjs on `b73550f`:

```
  (the gaps the page saw: row/350:346 row/350:337 row/350:329 site/350:337 site/350:348 form/350:343 form/350:344 row/500:485 row/500:493 row/500:489 site/500:492 site/500:489 form/500:485 form/500:492 row/650:642 row/650:637 row/650:642 site/650:627 site/650:640 form/650:649 form/650:642)
  (one reading at 4x: median 8.8 ms, max 21.4 ms of 15)
  (a tap to the dialog painted with its list, at 4x: 70 ms)
  PASS  no uncaught error
  PASS  no alert, confirm or prompt

421/421 checks passed
```

Its first run (on `840bddb`'s app bytes) was 414/416; both failures were the suite's and are fixed in
`b73550f`, its message says how - one of them is a finding about the contract, below.

## The measured noise and cost, re-run on `b73550f` (printed by tests/crewcheck.test.mjs)

```
  SKIP  «מה חדש» does not carry it yet: the integrator adds it with the stamps
  (20 seasons, 1798 evenings: calm on 92.3%; idle sites 0.08 an evening, of them a site worked again later 58.0%; «never» 3.02 an evening)
  (8 seasons, 1652 evenings to 20/09, as of each: 2.07 men named an evening, of them a man who worked again later 29.6%; sites 0.53 an evening)
  (the whole record read instead, the app's reading: 1.46 an evening, of them back later 0.0% - by construction)
  (leavers: 40; last day 45+ calendar days before 20/09: 33, named 33, the first time after a median 31 and at most 42 calendar days; out of the window's reach 7, of them named anyway 2)
  (regulars: 208; named 17, each with a run of 25+ working days; never named 191, their longest run 24)
  (the time-season record, 40 men x 277 day keys, 703 KiB: median 9.6 ms, max 12.9 ms of 25)
  (60 men x 329 day keys, 1149 KiB: median 22.8 ms, max 36.0 ms of 15)
```

The turnover model's figures are the contract's to the decimal (29.6%, 33 of 33 leavers within 42 days,
17 of 208 regulars, 0.0% read whole). The day check's seasons are run with its own generator copied line for
line (seeds 11-55, both habits, Rima on Fridays or not: 20 seasons, 1,798 evenings) where the contract's probe
had used a variant without the Friday switch (10 seasons, 898 evenings): 92.3% calm here against its 92.0%,
the floor held at 85%. In Chromium at 4x CPU the reading of the time-season record is 8.8 ms (median of 15;
budget 60) and a tap to the dialog painted with its list 70 ms (budget 300).

## A finding against the contract's words (criterion 13), kept to its intent

"Every localStorage key but `farkad:openBuilds` byte for byte across ... every door (the form left by «ביטול»)"
cannot hold for a form door in a fresh session, and the reason is not this dialog: the worker's form - by ANY
road, «עוד ⋯» ← «עריכת פרטים» included - asks `canRecordProvenance()` (js/sync/sync.js:3178) the first time it
opens in a session, which writes one optional key, `farkad:prov:probe`, and the write tick moves with it
(measured: exactly `farkad:prov:probe`, `farkad:writeTick` and `farkad:writeTick:tab:*`). The suite now holds
three things in order: opening, reading and shutting the dialog four times moves not one byte of a fresh disk;
the form opened once the app's own way moves exactly those keys and the record not at all; and every door after
it - six form doors, three row doors, two site doors, the search, a man gone, a double tap, the twenty-one slow
taps - moves not one byte against the disk as that leaves it. `js/ui/crewcheck.js` writes nothing.

## The conflict table, re-measured on the heads of 19:50

`git diff -U0 6ab193d <branch>` on the shared files, and `git merge-tree` of this branch with each:

| file | this track inserts after base line | others (head) | merge |
|---|---|---|---|
| index.html | 234, 958 (the day check's frame ends at 957; the blank line after it), 1170 | status `7f0d2f9` 126/1017/1230; payday `6aeacb2` 942/1212; monthboard `ff3e9c6` 1197; yearsummary `376911b` 972/986/1189; v205 `f9a432b` 109/1042; history `07b48a2` 834/1193 | clean |
| sw.js | 105 | yearsummary 110, history 111, monthboard 112, payday 115, status 125, v205 24/788/827/1165 | clean |
| js/ui/modal.js | 40 | history 26, payday 36, yearsummary 44, status 48 | clean |
| css/design.css | 805 | monthboard 774, status 79/106/131/1846, yearsummary 1094, history 1211, payday 1720 | clean |
| css/large.css | 709 | monthboard 700/1267, history 157/839, status 176/1038, yearsummary 792, payday 1015/1278, v205 1278 | clean |
| tests/screens.mjs | 309 | payday 227/243/339, monthboard 289, yearsummary 416, status 458 | clean |
| js/ui/roster.js | 31, 756 | nobody | - |
| package.json, tests/README.md | append after closereminder | every track | CONFLICT with each - the append-only files the contract leaves to the integrator |

`feat-speed` (`a349c31`) touches none of the shared code files; it too conflicts only in package.json and
tests/README.md. Every insertion line is the contract's, unchanged on these heads.

## Screenshots (synthetic names; JPEG; they assert nothing)

`/tmp/claude-0/-home-user-farkad/d6a64352-db1a-5c3b-b54d-5c09103f2419/scratchpad/feat-crewcheck/`:
`crew-foot-440x956-dark.jpg`, `dialog-calm-440x956-dark.jpg`, `dialog-findings-440x956-dark.jpg`,
`dialog-findings-end-440x956-dark.jpg`, and the same four `-320x568-large-dark.jpg` (with «תצוגה גדולה»).
Made by `shots.mjs` beside them, on tests/screens.mjs's seed and its two entries.

## NOT DONE

- Not tried on a real phone, and nobody far-sighted has looked at it: Chromium with emulated touch only. THE
  SLOW SECOND TAP in particular is held on Chromium's touch events; an iPhone's are not measured.
- `docs/releases.md`, `js/ui/whatsnew.js`, CLAUDE.md and the three stamps are the integrator's (texts above).
  Until «מה חדש» carries the item, tests/crewcheck.test.mjs prints a SKIP where it would hold the copy.
- tests/README.md's opening count of suites is stale on the base already and no track updates it; the two new
  rows are added, the count is not touched (a conflict with every other track for a number nobody keeps).
- The integrator's landing rule for `go: 'crewcheck'` in tests/whatsnew.browser.mjs is not written (that suite
  is not this track's); `crewCheckFocusEntry` itself is held here.
- The readability audit (`tests/readability.audit.mjs`, not a suite) was not run; tests/largetext.browser.mjs
  walked the two entries with the same ruler.

## Risks

- The form door focuses a field inside the user's tap, which is what raises the keys on iOS; Chromium cannot
  show whether Safari keeps that focus after a dialog is hidden in the same task.
- The hold (`guardFingersOn` on `#rosterView` and `#workerFormModal`) is installed once, lazily, at the first
  door, and stays for the page's life with nothing held outside 700 ms of a door. If another feature later
  calls `guardFingersOn` on either surface, `fingerGuarded` keeps the first install only - this one, or that
  one - and the second predicate is never asked. Today nothing else guards either surface (sheet.js guards
  the assign sheet and the two pickers only).
- Under the 700 ms hold a deliberate tap on any «פעיל» switch of the crew screen is also held - the window
  is the trays' and the contract's; a press after it, and a keyboard's, are as they were.
- A long-idle man is named whether he left or is on a long leave (the model: 29.6% come back); the words never
  say he left. The threshold is open question 1.

## Open questions (a default stands until the owner rules; the contract's)

1. The threshold - 25 working days (at least 29 calendar days). 18 names more men who come back (40%); 40
   names a man who left only after about seven weeks.
2. «בלי טלפון» under «לידיעה» on a crew that keeps no numbers - shown (tests/owes.seed.mjs: nine of nine).
3. A number shared with an archived man - not named here (the row's «מספר משותף» still says it).
4. PRE-EXISTING, not changed: archiving a SITE asks with the button «כבה עובד» (togglePlaceActive) - the idle
   site's door leads to that very question.
5. A duplicate identity number - not checked.
6. Days stamped with no daily rate - named under «לידיעה» for as long as the record holds them (for ever).
