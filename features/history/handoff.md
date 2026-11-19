# Handoff - «מי עבד איפה» (`history`)

Branch `feat-history`, worktree `/home/user/farkad/.claude/worktrees/feat-history`, cut from
`origin/main` 6ab193d68c960e4a56d947673c282b867acd258f. Not pushed, no PR.

- **Code commit verified: `a22a7272d987ea4ec5948d6f0c1a732dffa7c601`.** Every suite below ran on
  it from ONE clean detached worktree
  (`/tmp/claude-0/-home-user-farkad/d6a64352-db1a-5c3b-b54d-5c09103f2419/scratchpad/feat-history/verify`,
  `git status` empty, node_modules a symlink to `/home/user/farkad/node_modules`), the browser
  suites one at a time through the slot wrapper `bt`.
- **Final commit: the one that adds this file.** It adds `features/history/handoff.md` and
  three sentences of `tests/README.md` (the two rows of this track, brought up to the last
  checks); no suite reads either file.
- The contract is `features/history/contract.md` (Revision 2), copied in before any code
  (9f89b67). Re-read from disk at the end: md5 190b6ab27ace5c8a19f65c9883b00c0b, the same as
  the copy - no revision since.
- The three build stamps are NOT moved (the integrator's), so `npm test` stops at `test:build`,
  red on exactly its two stamp checks, and `test:gate-integrity` is red on exactly its stamp
  check. Everything else in the chain passes - pasted below, with the one timing check
  (tests/owes.test.mjs, not this track's code) that failed under load in the chain and passed
  re-run alone.

## What it is

One dialog, «מי עבד איפה», entered from a fourth door «איפה עבד», LAST on each man the finder
(«חיפוש עובד») lists. Three choices - a man or «כל העובדים», a site or «כל האתרים», a range
(«החודש», «חודש שעבר», «3 החודשים האחרונים» - the one it opens on -, «השנה», «מתחילת הרישום»,
«תאריכים אחרים») - and the matching days newest first, as the day screen words them, with the
counts on top, the text in a fold, and each day a button to that date on the day screen
(asking first while «בניית סידור» is open). A READING: no shekel, no gate, no ledger, no Store
key; the query lives in memory and is gone at a close.

## Files (against the base)

| file | what |
|---|---|
| `js/ui/history.js` (new) | the whole feature: its words (one block of its own, one of borrowed words), the pure reading `historyRead` and its range rules, the facts, the text, the drawing (built again only where it moved), the frame, the doors |
| `index.html` | the frame `#historyModal` after `#findModal`; the classic `<script src="js/ui/history.js">` after sitecard.js, before find.js |
| `sw.js` | `./js/ui/history.js` in SHELL after sitecard.js |
| `js/app.js` | `render()`: `renderHistoryIfOpen()` after `renderSiteCardIfOpen()` |
| `js/ui/modal.js` | `MODAL_CLOSERS.historyModal: () => closeHistory()` |
| `js/ui/find.js` | the fourth door, LAST (`door('history', HISTORY_TEXT.door)`, asked through `typeof`), its branch in `findGo`, the header's list says four doors |
| `css/design.css` | ONE block `/* ---- «מי עבד איפה» (js/ui/history.js) ---- */` after `.find-group`, before «בניית סידור, the second pass» - inside tests/payslips.test.mjs's slice and its limits (no @media, no fixed height, sizes 16-24px) |
| `css/large.css` | block 2: «סגור»'s 64px width kept under the mode's floor; block 3: every size, weight and line-height of the block restated one for one after the finder's |
| `tests/history.test.mjs` (new) | criteria 1-16 on devices in Node, 175 checks, in `npm test` |
| `tests/history.browser.mjs` (new) | criteria 17-26 in Chromium with touch, 723 checks, in `test:all` |
| `tests/screens.mjs` | four entries after 'find' and two helpers: one man; everyone at p1 with Rima; everyone at p2 with יוסף גבס; «תאריכים אחרים» with the fold open |
| `tests/find.browser.mjs` | the three pins the fourth door moves (below) |
| `package.json` | `test:history` (in `test`), `test:history-browser` (in `test:all`) |
| `tests/README.md` | two rows of its own; the finder's two rows say four doors |
| `features/history/contract.md`, `features/history/handoff.md` | the contract; this file |

No migration: no data shape, key, field path or writer is added. Nothing in `js/model`,
`js/sync`, `js/state.js`, `js/store.js`, `js/recovery.js`, `firestore.rules` or `functions`;
no build stamp, `js/ui/whatsnew.js`, `docs/releases.md` or `CLAUDE.md`.

## The commits

```
a22a727 js/ui/history.js: a word joiner after the line's dash - the range broke after it anyway
9dce66f js/ui/history.js: the line under the choices breaks before its dates, never between them
1ca7578 tests/history.browser.mjs: each timed step of the budget says what it drew, and the commit certainly moves
fcf0e8f tests/history.browser.mjs and four screens: «מי עבד איפה» on the glass, in Chromium with touch
88b4f4e js/ui/history.js: the header says what the redraw pays for since 07b48a2 - only what moved
0f5a9b1 js/ui/history.js: the way back in the journey's question named by JOURNEY_TEXT.entry, read when asked
07b48a2 js/ui/history.js: the list built again only where it moved - a commit under 600 days builds one
3a95013 tests/history.test.mjs: the reading is pure - no DOM, no storage, no State, no clock in its section
ba51871 css/design.css: the fold of «מי עבד איפה» shut on the glass, and its two dates as tall as its selects
1dc21c2 tests/find.browser.mjs: the three pins the fourth door moves, and the finder's README rows say four
d0af7ec tests/history.test.mjs: «מי עבד איפה» on devices - it cannot be different from what it reads (170 checks)
4122fcb «מי עבד איפה»: who worked where, on any day of the record - one dialog from the finder's door
9f89b67 features/history/contract.md: the contract of «מי עבד איפה», copied in before any code
```

## Every hook in an existing file

`index.html` (the frame after `#findModal`, the script after sitecard.js), `sw.js` (one SHELL
line), `js/app.js` (one line in `render()`), `js/ui/modal.js` (one `MODAL_CLOSERS` row),
`js/ui/find.js` (the door last, its branch, the header), `css/design.css` (one block),
`css/large.css` (one line in block 2, the restatements in block 3), `tests/screens.mjs` (four
entries, two helpers), `tests/find.browser.mjs` (three pins), `package.json`, `tests/README.md`.

## The source of every count

Nothing is priced, and no money function, gate or ledger reader is called (criterion 14 spies on
every one). Each count is the count an existing report makes of the same days, pinned to it in
tests/history.test.mjs on three seeded records:

| on the screen | what it counts | equal to |
|---|---|---|
| ימי נוכחות · ימי עובד־אתר · כפולים · שעות נוספות · נעדר (no site) | rows not absent; Σ their distinct sites; double rows; Σ hours; absent rows | `payrollReport`'s `attendanceDays`, `siteVisits`, `doubleDays`, `extraHours`, `absent`, summed over the men listed (js/model/money.js) |
| ימי עובד־אתר (a site and one man) | his rows at that site | his count in that site's `invoiceByDate` workerIds |
| סה״כ ימי עובד־אתר (a site and everyone) | billed | the site's row of `invoiceByDate` |
| בלי עובדי רימא | own | `invoiceWithoutRima(…, site).total` |
| סה״כ עובדי רימא | Rima's count | `rimaReport(…, site).total` (js/model/schema.js) |
| עובדי יוסף גבס - apart, in no other figure, never in the text | | `yosefGevesReport(…, site).total` |
| מי עבד באתר | each man's dates at the site | the invoice's own workerIds - the site card's rule |
| a month's heading (no site) | its rows not absent | - |

A day reads as the day screen reads it: `isAbsent` / `entriesFor` on 'actual', the kind by the
pay's rule (double over extra over normal), `entryExtraHours`, every site named from ONE
`placeLabelsIn(schedule)` over the whole record; with a site, THAT site's entry and «2 אתרים».
The live record, not the frozen one: a day corrected after its close reads corrected here, by
exactly the correction (criterion 4). Nothing after today.

## Every new string - PROPOSED, pinned word for word in tests/history.test.mjs

`HISTORY_TEXT` (js/ui/history.js): `title` «מי עבד איפה» · `door` «איפה עבד» · `man` «עובד» ·
`site` «אתר» · `last3` «3 החודשים האחרונים» · `thisYear` «השנה» · `all` «מתחילת הרישום» · `now`
`${who} · ${where} · ${range}` · `asText` «הרשימה כטקסט» · `noRima` «עובדי רימא לא נספרים כאן.
כדי לראות גם אותם, בחר אתר.» · `dayOne` «יום אחד» · `dayMany` «ימים» · `empty` «לא נמצא אף יום
שמתאים לבחירה.» · `month` `${name} ${year}[ · ${count}]` · `who` `${name} · ${count}` ·
`rowName` the date, the man, the sites and the kind joined by « · », an empty part left out ·
`shown` «מוצגות N שורות מתוך M.» · `more` «הצג עוד N» · `capped` «מוצגות N השורות החדשות ביותר
מתוך M. כדי לראות את השאר, בחר טווח קצר יותר, אתר או עובד.» · `textHead` `📄 ${who} · ${where}` ·
`textCut` «ההודעה כוללת רק את N השורות החדשות ביותר מתוך M, כי כל הרשימה ארוכה מדי להודעה אחת.
כדי לקבל את כולן, בחר טווח קצר יותר, אתר או עובד.» · `tooLongForLink` «⚠️ הרשימה ארוכה מדי לקישור
של וואטסאפ - השתמש בהעתק ושלח ידנית» · `leaveTitle` «לצאת מבניית הסידור?» · `leaveMessage` «כדי
לפתוח את ‹day› צריך לצאת מבניית הסידור ל‹seder day›. אפשר לחזור אליה אחר כך מ«‹JOURNEY_TEXT.entry›».»
· `leaveOk` «צא ופתח את היום».

Borrowed (`HISTORY_REUSED`, each found in its owner's source by the suite): «כל העובדים», «כל
האתרים», «לא פעיל», «תקופה», «החודש», «חודש שעבר», «תאריכים אחרים», «מתאריך», «עד תאריך», «הטווח
הפוך» and its sentence, «ימי נוכחות», «יום נוכחות אחד», «ימי עובד־אתר», «כפולים», «שעות נוספות»,
«נעדר», the two-sites sentence, «2 אתרים», `+N ש׳`. Read from their owners' constants when used:
`RATE_LABELS`, the Rima and יוסף גבס titles, totals and notes, «חיוב -», «מי עבד באתר», the month
names, «לחיצה על יום פותחת אותו במסך היום.», «💬 שלח בוואטסאפ», «העתק», «סגור», `JOURNEY_TEXT.entry`.

## Pinned expectations MOVED - on purpose, in their own commit (1dc21c2), with the reason

tests/find.browser.mjs, exactly the three checks the contract names, each with a `MOVED:`
comment naming this track. The fourth door is LAST so «מקדמות» keeps its place under the thumb:
1. «a man on the daily list has four doors…; a man turned off has three…» →
   `[[['כרטיס עובד', 'שיבוץ להיום', 'מקדמות', 'איפה עבד'], []], [['כרטיס עובד', 'מקדמות', 'איפה עבד'], ['לא פעיל']]]`;
2. «Tab goes from the field down the first man's doors» → FIVE presses (`step < 5`), still ending
   on the next man's first door: `['כרטיס עובד', 'שיבוץ להיום', 'מקדמות', 'איפה עבד', 'כרטיס עובד']`;
3. «Shift+Tab from the field reaches «סגור», and once more comes round to the last door» →
   `['findClose', ['איפה עבד', true]]`.

Nothing else in any existing suite moved.

## Found on the glass by this track's own browser suite, and repaired - each held by a check

1. **The fold was never shut** (ba51871). `.history-fold-body { display: grid }` beat the
   `hidden` it is shut by (there is no global `[hidden] { display: none }`), so the text, «שלח»
   and «העתק» stood on the screen and in the Tab order with the fold «shut». The Node suite reads
   the attribute and could not see it; the Tab walk did. `.history-fold-body[hidden] { display:
   none; }`; the checks now read what is painted (`getClientRects`).
2. **The two date fields were 44px under 48px selects** (ba51871): app.css's
   `input[type="date"]:not([aria-hidden="true"])` (0,2,1) beat `.history-field input` (0,1,1).
3. **A commit under 600 drawn days built all 600 again** (07b48a2): 444 ms, and an adopted
   snapshot 794 ms, at 4x on a loaded machine. The list is now built again only where it moved
   (a WeakMap of each node's key and words). Measured by a probe at 4x: the dialog's own share of
   a snapshot 19-30 ms of 258-344 ms; the app's adoption alone, with the dialog shut, 204-317 ms.
   Held in Node (the unmoved days the same nodes; the list node for node what a fresh draw makes
   - both fail on mutants) and in Chromium (a commit adds exactly that day's row).
4. **The line under the choices broke inside its date range** (9dce66f, a22a727): in a
   right-to-left line the break after the range's dash drew «… · - 01/11/2026» over «10/11/2026»
   (440px, everyone at «הרצליה - מגדל הים» - the clean-tree picture). No-break spaces round the
   dash were not enough - Unicode's line breaking lets a line break after a hyphen a no-break
   space follows (LB12a; 22 of 60 lines measured still did) - so a word joiner follows the dash.
   The line now breaks before the range; a range wider than the line itself (doubled text at 320
   and 375) is still broken by `overflow-wrap: anywhere`, never cut. The text keeps dateRange's
   spaces. Held: in Node, and on every phone, scheme and mode, five views each, the two dates on
   one line (60 checks).
5. In the suite itself: a choice is made with its field focused first, as a tap reaches it
   (Playwright's `selectOption` focuses nothing); a site's tag is read by its name, not its whole
   text (the day screen's ◆ past ten sites); a marker with no letter or digit is held to no size
   floor, as tests/mobile.test.mjs holds it; and each timed step of the budget hands back what it
   drew (1ca7578) - two runs had printed «כל העובדים» painted in 18 ms at 4x, which nothing showed
   to be the time of the work it named.

## Where this departs from the contract - deliberately

- `rowName` leaves an empty part out (an absence has no sites) rather than saying « ·  · ».
- The text has a blank line before «מי עבד באתר».
- `historyGoDay(date, key)`: an optional second argument, the asking row's key, so that after
  «ביטול» the focus goes back to that row.
- The list is redrawn incrementally (repair 3); the contract's own numbers were of a whole
  redraw, and every criterion holds.
- The date fields are 48px like the selects (the contract asks ≥ 16px text and the app's 44px).
- The line's range is one word (repair 4): the line's text holds no-break spaces and a word
  joiner the contract's template does not show.
- tests/README.md's two finder rows changed in 1dc21c2, not in the door's own commit 4122fcb as
  the contract asked.
- In tests/history.test.mjs the fixture's two unlisted sites are put into the record in memory
  after the reload: `State.load` puts an unlisted site back as an archived «אתר שנמחק (id)», so
  only that way do the checks see a site the roster has not got.

## The suites, on a22a727, from the clean tree - pasted, not summarized

**`npm test` itself** (exit 1, as it must be until the stamps move - it stops at `test:build`):

```
> farkad@0.0.0 test:isolation
18/18 checks passed
> farkad@0.0.0 test:blobs
11/11 checks passed
> farkad@0.0.0 test:build
**FAIL**  and nothing in the shell has changed since  — 7 changed since 6ab193d6: css/design.css, css/large.css, index.html, js/app.js, js/ui/find.js, js/ui/history.js, js/ui/modal.js
**FAIL**  and neither has the worker that names the shelf  — sw.js
67/69 checks passed
npm test exit 1
```

**Every suite of the `npm test` chain, one by one** (`name, exit, seconds, count`; 109 suites: 106
exit 0, 3 exit 1 - the two stamp suites, and tests/owes.test.mjs's timing ratio):

```
test:isolation	exit 0	0s	18/18 checks passed
test:blobs	exit 0	1s	11/11 checks passed
test:build	exit 1	1s	67/69 checks passed
    **FAIL**  and nothing in the shell has changed since  — 7 changed since 6ab193d6: css/design.css, css/large.css, index.html, js/app.js, js/ui/find.js, js/ui/history.js, js/ui/modal.js
    **FAIL**  and neither has the worker that names the shelf  — sw.js
test:poison	exit 0	0s	37/37 checks passed
test:merge	exit 0	0s	28/28 checks passed
test:contested	exit 0	16s	73/73 checks passed
test:held	exit 0	4s	83/83 checks passed
test:snapshot-stale	exit 0	2s	16/16 checks passed
test:reports-rules	exit 0	2s	26/26 checks passed
test:finance	exit 0	6s	57/57 checks passed
test:weekly-range	exit 0	0s	21/21 checks passed
test:finance-wording	exit 0	2s	12/12 checks passed
test:weekly-unpriced	exit 0	0s	23/23 checks passed
test:receipt	exit 0	2s	28/28 checks passed
test:data	exit 0	43s	1970/1970 checks passed
test:recovery	exit 0	1s	82/82 checks passed
test:adversarial	exit 0	5s	116/116 checks passed
test:probes	exit 0	7s	35/35 checks passed
test:capacity	exit 0	11s	48/48 checks passed
test:concurrency	exit 0	3s	46/46 checks passed
test:exports	exit 0	1s	112/112 checks passed
test:fence	exit 0	2s	35/35 checks passed
test:fence-ingress	exit 0	0s	43/43 checks passed
test:fence-legacy	exit 0	0s	21/21 checks passed
test:money-history	exit 0	0s	9/9 checks passed
test:money-units	exit 0	0s	21/21 checks passed
test:money-cloud	exit 0	2s	17/17 checks passed
test:money-display	exit 0	0s	4/4 checks passed
test:snapshot-poison	exit 0	2s	82/82 checks passed
test:samefact	exit 0	5s	37/37 checks passed
test:wording	exit 0	1s	37/37 checks passed
test:closure	exit 0	18s	122/122 checks passed
test:closure-echo	exit 0	1s	79/79 checks passed
test:correction	exit 0	1s	33/33 checks passed
test:quarantine	exit 0	1s	82/82 checks passed
test:approval	exit 0	7s	72/72 checks passed
test:repayment	exit 0	4s	240/240 checks passed
test:ledger-ingress	exit 0	0s	167/167 checks passed
test:cas	exit 0	13s	88/88 checks passed
test:status	exit 0	6s	37/37 checks passed
test:money	exit 0	2s	40/40 checks passed
test:money-ingress	exit 0	9s	206/206 checks passed
test:method	exit 0	3s	51/51 checks passed
test:restore	exit 0	0s	51/51 checks passed
test:upgrade	exit 0	2s	48/48 checks passed
test:vehicles	exit 0	2s	86/86 checks passed
test:xlsx	exit 0	1s	104/104 checks passed
test:nonassertions	exit 0	1s	23/23 checks passed
test:labels	exit 0	0s	23/23 checks passed
test:labelcache	exit 0	0s	32/32 checks passed
test:restore-ledger	exit 0	2s	26/26 checks passed
test:roster-upgrade	exit 0	7s	55/55 checks passed
test:roster-race	exit 0	6s	63/63 checks passed
test:exports-proof	exit 0	1s	44/44 checks passed | 92/92 checks passed
test:ledger-truth	exit 0	4s	148/148 checks passed
test:races	exit 0	5s	109/109 checks passed
test:overlap-restore	exit 0	20s	117/117 checks passed
test:refute-roster	exit 0	9s	24/24 checks passed
test:refute-restore	exit 0	43s	25/25 checks passed
test:gate-integrity	exit 1	0s	19/20 checks passed
    **FAIL**  no cached file has changed since the three stamps last moved  — a22a7272 js/ui/history.js: a word joiner after the line's dash - the  | 9dce66f8 js/ui/history.js: the line under the choices breaks before 
test:queuecost	exit 0	5s	18/18 checks passed
test:paycycle	exit 0	0s	43/43 checks passed
test:paycycle-blockers	exit 0	2s	17/17 checks passed
test:paycycle-completion	exit 0	5s	31/31 checks passed
test:crew-controls	exit 0	1s	46/46 checks passed
test:simple-advances	exit 0	1s	66/66 checks passed
test:worker-deletion	exit 0	10s	86/86 checks passed
test:calendar	exit 0	0s	58/58 checks passed
test:reminders	exit 0	0s	48/48 checks passed
test:move-late	exit 0	5s	48/48 checks passed
test:codex-probes	exit 0	1s	17/17 checks passed
test:codex2-probes	exit 0	1s	36/36 checks passed
test:codex3-probes	exit 0	3s	59/59 checks passed
test:rima	exit 0	91s	496/496 checks passed
test:yosefgeves	exit 0	93s	562/562 checks passed
test:seder	exit 0	0s	135/135 checks passed
test:bars-stale	exit 0	0s	60/60 checks passed
test:transport	exit 0	1s	566/566 checks passed
test:transport-share	exit 0	12s	304/304 checks passed
test:oracle	exit 0	39s	121/121 checks passed
test:overpayment	exit 0	4s	105/105 checks passed
test:polish	exit 0	0s	73/73 checks passed
test:daycheck	exit 0	5s	169/169 checks passed
test:journey	exit 0	1s	233/233 checks passed
test:workercard	exit 0	20s	180/180 checks passed
test:monthsummary	exit 0	70s	98/98 checks passed
test:payslips	exit 0	22s	202/202 checks passed
test:find	exit 0	0s	91/91 checks passed
test:whatsnew	exit 0	0s	160/160 checks passed
test:account-view	exit 0	17s	456/456 checks passed
test:usual	exit 0	1s	150/150 checks passed
test:sitecard	exit 0	2s	119/119 checks passed
test:reportsclarity	exit 0	2s	1119/1119 checks passed
test:largetext	exit 0	0s	107/107 checks passed
test:reportnames	exit 0	9s	36/36 checks passed
test:holiday	exit 0	0s	109/109 checks passed
test:undo-stale	exit 0	2s	32/32 checks passed
test:auditfix	exit 0	1s	34/34 checks passed
test:owes	exit 1	57s	189/190 checks passed
    **FAIL**  «דוחות» with the board, the record having moved: 102ms against 65ms without - within 1.5x  — {"on":[105.59040000000095,106.82212300000538,101.86672800000088],"off":[87.56860600000073,65.05514699999
test:weeklyclose	exit 0	106s	146/146 checks passed
test:reports-speed	exit 0	164s	159/159 checks passed
test:closeorder	exit 0	0s	22/22 checks passed
test:closuresize	exit 0	11s	13/13 checks passed
test:closerace	exit 0	38s	29/29 checks passed
test:advancereset	exit 0	44s	77/77 checks passed
test:overpaidfix	exit 0	1s	85/85 checks passed
test:xlsxlook	exit 0	7s	293/293 checks passed
test:closereminder	exit 0	12s	107/107 checks passed
test:history	exit 0	9s	175/175 checks passed
DONE
chain exit 0
```

Re-run alone on the same tree (a Node suite, no browser - not through the slot wrapper), the one
that failed by its timing: `node tests/owes.test.mjs` -> `190/190 checks passed`, exit 0. And this track's
Node suite alone, for its printed timings: `node tests/history.test.mjs` -> `175/175 checks passed`, exit 0.

**The browser suites, each alone through the slot wrapper** (`bt node tests/<suite>`; the seconds
include the wait for a slot):

```
history.browser.mjs	exit 0	1247s	723/723 checks passed	0 FAIL lines
find.browser.mjs	exit 0	390s	88/88 checks passed	0 FAIL lines
smoke.mjs	exit 0	330s	1186/1186 checks passed	0 FAIL lines
design.browser.mjs	exit 0	7s	72/72 checks passed	0 FAIL lines
largetext.browser.mjs	exit 0	728s	8569/8569 checks passed	0 FAIL lines
mobile.test.mjs	exit 0	381s	1397/1397 checks passed	0 FAIL lines
workercard.browser.mjs	exit 0	15s	116/116 checks passed	0 FAIL lines
sitecard.browser.mjs	exit 0	17s	135/135 checks passed	0 FAIL lines
day-polish.browser.mjs	exit 0	5s	51/51 checks passed	0 FAIL lines
doubletap.browser.mjs	exit 0	517s	359/359 checks passed	0 FAIL lines
midnight.browser.mjs	exit 0	113s	323/323 checks passed	0 FAIL lines
usual.browser.mjs	exit 0	99s	345/345 checks passed	0 FAIL lines
journey.browser.mjs	exit 0	149s	869/869 checks passed	0 FAIL lines
whatsnew.browser.mjs	exit 0	63s	251/251 checks passed	0 FAIL lines
```

Fourteen suites, all exit 0: this track's (723 checks) and every existing one the contract lists
or the change touches - the finder, smoke, the look, the large display (it walks the four new
screens), mobile, the worker's and the site's cards, the day's polish, the double tap, midnight,
the usual site, the journey and «מה חדש». `test:all`, `test:release` and the emulator suites were
not run (not allowed here).

Earlier commits of this branch were run the same way and are not the answer: fcf0e8f (chain:
107 exit 0, the two stamp suites red), 1ca7578 (chain: the two stamp suites red and test:history
173/174 - its timing check under load - then 174/174 alone; history.browser 663/663), 9dce66f
(history.browser 701/723 - the 22 lines of repair 4 - and the runs stopped there).

## Measured, as the suites printed it on a22a727

The found man's row in the finder, without the door and with it (criterion 17; the contract's
`rev2/doorlast` expectation, met to the pixel):

```
        320x568 dark                        168 ->  168
        320x568 dark, large display         181 ->  181
        320x568 light                       168 ->  168
        320x568 light, large display        181 ->  181
        375x667 dark                        112 ->  168
        375x667 dark, large display         137 ->  213
        375x667 light                       112 ->  168
        375x667 light, large display        137 ->  213
        440x956 dark                        112 ->  168
        440x956 dark, large display         121 ->  181
        440x956 light                       112 ->  168
        440x956 light, large display        121 ->  181
```

The tiles as the dialog opens: 2 a line at 320, 3 from 375; the first on the glass in every cell
but 320x568 with the mode (its bottom at 572 of 539), the whole block at 375x667 without the mode
and at 440x956 in both (`… the first ends at 503, the last at 608, the glass at 638` at 375).

The budget at 4x CPU on a season seeded in the page (40 men, 305 days, 788 KiB), each step held
to what it drew:

```
      at 4x: the door 88 ms, «כל העובדים» 81 ms, «השנה» 57 ms, «הצג עוד» 152 ms, a commit under 600 days 229 ms, an adopted snapshot 427 ms
      of which the action itself: tap 83, everyone 64, year 45, more 136, commit 218, snapshot 419 ms
```

The reading and the text in Node, median of 5 (a season of 40 men, 313 day keys; the year
exactly the contract's 9,206 / 9,669 / 264 / 883 / 206):

```
      the season's year: 9412 rows; attendance 9206, siteDays 9669, doubleDays 264, extraHours 883, absent 206
      a year, everyone, every site: 9412 rows, 59973 characters, 24 ms (median of 5)
      a year, one man, every site: 245 rows, 11386 characters, 3.7 ms (median of 5)
      a year, everyone, one site: 1450 rows, 59986 characters, 36.4 ms (median of 5)
      a year, one man, one site: 239 rows, 10936 characters, 3.5 ms (median of 5)
      this month, everyone, every site: 563 rows, 32720 characters, 4.9 ms (median of 5)
      3 months, everyone, every site: 2336 rows, 59971 characters, 9.6 ms (median of 5)
      the whole record, everyone: 10627 rows, 59977 characters, 25.7 ms (median of 5)
```
(a run alone at a load average of 2.4-2.6 on this 4-CPU machine; at a load average of 8-10 the
same queries measured 46 and 60.2 ms for the two slowest.)

The chosen names against their closed selects (criterion 25): «עבד אל-רחמן אבו חוסיין · לא
פעיל» needs 230px of 240 at 320 (fits), 230 of 295 at 375, 230 of 360 at 440; with the mode 287
of 238 at 320 (does not fit - the line under the fields holds it whole, checked), 287 of 293 at
375, 287 of 358 at 440; «הרצליה - מגדל הים · לא פעיל» 198 of 240 at 320, 248 of 238 at 320 with
the mode (the line again). At doubled text neither fits at 320 or 375; the line holds both.

## NOT done, NOT verified

- **Not tried on a real phone.** Chromium with emulated touch only.
- The 8,000-character bound for a wa.me link is a guess, not tried against WhatsApp; WhatsApp's
  65,536-character limit for one message is the documented one, not measured.
- `tests/readability.audit.mjs` (not a suite) was not run.
- `npm run test:all`, `test:release` and the emulator suites were not run (not allowed here); the
  browser suites that were run are listed above, one by one.
- The three build stamps, «מה חדש», docs/releases.md and CLAUDE.md are the integrator's and were
  not touched - so `test:build` and `test:gate-integrity` stay red on their stamp checks until the
  release commit moves the stamps.

## Risks

- **Timing checks on a loaded machine.** Of the three complete clean-tree runs of the chain
  (fcf0e8f, 1ca7578, a22a727), two each had one timing check fail that passed re-run alone: on
  1ca7578 this track's «each of the seven queries … inside 100 ms» (a year of everyone over 100
  ms; 46 ms alone, at a load average near 9), and on a22a727 tests/owes.test.mjs's «דוחות with the
  board … within 1.5x» (102 against 65 ms; 190/190 alone) - not this track's code. The browser
  budget (≤ 600 ms at 4x) carries the same exposure.
- **The selects in the dark scheme** are the browser's own widget, as every select of the app is
  without the large display (white on #6b6b6b in Chromium, which passes the ruler) - an iPhone
  draws its own.
- **The site's billing walks the invoice twice** (`invoiceByDate`, and again inside
  `invoiceWithoutRima`) - the site card's way, kept as the contract asks; it is the slowest query.
- **The fourth door costs the finder rows**: +56 px a man at 375 and 440 with nothing typed (+76
  at 375 with the mode) - about half the men on the glass, the price the contract states.
- **Unlisted sites** (a site a day names that the roster has not got) are listed and named as the
  day screen names them, but cannot be chosen in «אתר»: they have no name to be chosen by.
- **The redraw is incremental**: a node is kept when its key and its words are unchanged. Its
  words are the row, the man's name and whether names are shown; a site's colour is its id
  (js/ui/sitecolor.js). Anything else a row came to depend on would have to join its words.

## For the integrator

- «מה חדש» (PROPOSED, as the contract has it):
  `{ title: 'מי עבד איפה', text: 'מתי ואיפה עבד עובד, ומי עבד באתר, בכל תקופה - עם הספירה ושליחה כטקסט. לחיצה על יום פותחת אותו.', where: 'היום ← חיפוש עובד ← איפה עבד', go: 'find' }`
  - `go: 'find'` is the existing key; it only navigates.
- CLAUDE.md's file list: the finder's line says «three doors» - four now, the fourth last - and:
  ```
      js/ui/history.js           «מי עבד איפה» - who worked where on any day of the record: one man or everyone,
                                 one site or every site, any range to today; a READING of the live record
                                 (historyRead, pure) - counts and words, no shekel, no gate, no ledger; with a
                                 site and everyone the site's billing from the invoice's own four readers; 200
                                 days at a time, never past 600, built again only where the record moved; the
                                 text in a fold (60,000 at most, never in a wa.me link past 8,000); a day only
                                 opens its date, and asks first while «בניית סידור» is open; the finder's
                                 fourth door «איפה עבד», last; memory only, no key written
      tests/history.test.mjs     «מי עבד איפה» on devices: every row and count against its source on seeded
                                 records, the ranges on every edge of the calendar, the text and its cap on a
                                 season, the journey's question, the disk byte for byte, the costs, every word
      tests/history.browser.mjs  «מי עבד איפה» in Chromium with touch: the door last on the finder at three
                                 widths, both schemes, with and without the large display; the choices, a day,
                                 the journey, the chunks, the text's doors, closing, a record moving under 600
                                 days, the budget at 4x, the ruler at doubled text, the chosen names
  ```
- docs/releases.md, a proposed entry:
  > **«מי עבד איפה».** A man rings - "I worked on the 12th and it was a double" - or a client
  > asks who was billed at a site in March. «חיפוש עובד», his name, «איפה עבד» (the fourth door,
  > last): his days over «3 החודשים האחרונים», newest first, each as the day screen words it, with
  > the counts on top; «עובד», «אתר» and «תקופה» change what is read («כל העובדים» with a site
  > gives the site's billing - with Rima's lines, «עובדי יוסף גבס» apart - and who worked there).
  > The list as text in a fold, by the day message's own two doors; a day opens its date. A
  > READING: no shekel, no gate, no ledger, no key written; the live record, so a day corrected
  > after its close reads corrected (the payslip keeps what was paid). Its Hebrew is proposed and
  > pinned in tests/history.test.mjs; not tried on a real phone.

## Open questions, each with the default built

1. Is the text, which names men, something the owner sends a client? Default: his to send; its
   first line names the question.
2. Should a day corrected after its period was closed be marked? Default: no (the contract's «What
   it does NOT do»).
3. Is «3 החודשים האחרונים» the right first range? Default: yes.
4. Does the finder keep the fourth door at the price of half its rows with nothing typed?
   Default: yes.
5. Are «מי עבד איפה» and «איפה עבד» his words for it? Default: yes - proposed, pinned.

## Pictures

Synthetic names, JPEG, from the clean-tree run of a22a727, in
`/tmp/claude-0/-home-user-farkad/d6a64352-db1a-5c3b-b54d-5c09103f2419/scratchpad/feat-history/shots-final/`:
- `history-finder-375x667-side-by-side.jpg`, `history-finder-440x956-side-by-side.jpg` - the finder
  with nothing typed, without the door (left) and with it (right);
- `history-440x956-dark-*.jpg` - the dialog opened on one man, then one man every site, everyone at
  p1 with Rima, everyone at p2 with יוסף גבס, two dates and the text, the chosen names;
- `history-320x568-dark-large-*.jpg` - the same six with «תצוגה גדולה».
