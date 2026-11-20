# Handoff - «מי עבד איפה» (`history`)

Branch `feat-history`, worktree `/home/user/farkad/.claude/worktrees/feat-history`, cut from
`origin/main` 6ab193d68c960e4a56d947673c282b867acd258f. Not pushed, no PR.

- **Fix round 1 is in.** The review of round 1 (sixteen findings) was triaged against the code -
  all sixteen confirmed, none discarded - and repaired in 71e8303, 542b0dd and ef85afe, with the
  browser suite's own handling of the test page's blocked worker made whole in e96492a and da37404;
  the section below names, for each finding, the check that fails before and passes after.
- **Code commit verified: `da37404`** (da374048526765af9ab650dff5d9e636879a1435). The `npm test`
  chain and this track's two suites ran on it from ONE clean detached worktree
  (`/tmp/claude-0/-home-user-farkad/d6a64352-db1a-5c3b-b54d-5c09103f2419/scratchpad/feat-history/verify-r1b`,
  `git status` empty, node_modules a symlink to `/home/user/farkad/node_modules`). The four existing
  browser suites the fix round reaches ran in that same tree at ef85afe: `git diff ef85afe da37404`
  is `tests/history.browser.mjs` alone, which none of them loads. Browser suites one at a time
  through the slot wrapper `bt`.
- **Final commit: the one that adds this version of this file.** It changes
  `features/history/handoff.md` and one sentence of `tests/README.md` (the browser row's B26: the
  midnight walk's own list of errors); no suite reads either.
- The contract is `features/history/contract.md` (Revision 2), copied in before any code
  (9f89b67). Re-read from disk for this round: md5 190b6ab27ace5c8a19f65c9883b00c0b, the same as
  the copy - no revision since.
- The three build stamps are NOT moved (the integrator's), so `npm test` stops at `test:build`,
  red on exactly its two stamp checks, and `test:gate-integrity` is red on exactly its stamp
  check. Everything else in the chain passes on da37404: 109 suites, 107 exit 0 - pasted below.

## What it is

One dialog, «מי עבד איפה», entered from a fourth door «איפה עבד», LAST on each man the finder
(«חיפוש עובד») lists. Three choices - a man or «כל העובדים», a site or «כל האתרים», a range
(«החודש», «חודש שעבר», «3 החודשים האחרונים» - the one it opens on, unless the man has no day in
it: then «מתחילת הרישום» -, «השנה», «מתחילת הרישום», «תאריכים אחרים») - and the matching days
newest first, as the day screen words them, with the counts on top, the text in a fold, and each
day a button to that date on the day screen (asking first while «בניית סידור» is open). A
READING: no shekel, no gate, no ledger, no Store key; the query lives in memory and is gone at a
close.

## Fix round 1 - the review of round 1, triaged against the code

Sixteen findings, each opened at its line in the reviewed code (b54df95, whose code is a22a727's)
and marked: **all sixteen CONFIRMED**, two of them the same defect (the line under the text's doors,
found by both reviewers). None NOT REPRODUCIBLE, none ALREADY HANDLED, none discarded. Repaired in
71e8303, 542b0dd and ef85afe. What is left is left on purpose and said in its place.

Every check named below FAILS BEFORE and passes on da37404 (the Node suite 192/192, the browser
suite 1245/1245, below). "Before" is one of three runs, kept in
`/tmp/claude-0/-home-user-farkad/d6a64352-db1a-5c3b-b54d-5c09103f2419/scratchpad/feat-history/`:
- `fix1b/node-r1.out`: tests/history.test.mjs of ef85afe run on round 1's bytes (an archive of
  b54df95 with that one file put in) - **175/192**, seventeen fail-befores; 192/192 on da37404.
- `fix1/muts.out`, and again `fix1b/muts2.out` against ef85afe's own file and suite: the mutant that
  undoes each repair (fifteen) - every one caught by the check named for it.
- `fix1/before-browser2.out`: tests/history.browser.mjs run on round 1 with the reviewer's three
  mutants applied (the rows out of the redraw's signature, no refocus, no `dayChosenByHand`) -
  the fail-befores of the glass.

1. **P1 - a four-figure count painted over at doubled text** (css/design.css:1244). CONFIRMED:
   `minmax(96px, 1fr)` stayed 96px at twice the text while the figure was 48px/800, and the next
   tile painted over its first digit. FIXED (71e8303): the tracks are `minmax(calc(4.4em + 20px),
   1fr)`, in the em the text size sets - never narrower than a five-figure count in the figure's
   size and the tile's padding, with no media query (the payslips slice's limits hold); a label
   breaks only between words (`overflow-wrap: break-word`); each figure stands at its tile's foot.
   CHECK: criterion 25, «… every figure - up to 4 digits - inside its own tile» (under «השנה») and
   «… up to 5 digits …» (under «מתחילת הרישום») on a season seeded in the page, at 320, 375 and 440,
   as it is, with «תצוגה גדולה» and doubled - before: 9037, 9538 and 1012 (and under «מתחילת הרישום»
   10241, 10817 and 1152) out of their tiles at all three phones doubled, and 10241 and 10817 at 375
   with the large display - seven failures. PIN MOVED ON PURPOSE:
   criterion 17, two tiles a line at 375 with the large display (three left a year's count of
   forty men less than its padding).
2. **P2 - the line under the text's doors at 14px** (css/design.css:1265; two findings, one
   defect). CONFIRMED: `#historyStatus` had only `.share-status` (css/app.css:3126, 14px), and
   the five floor views all had it empty, so `display: none`. FIXED (71e8303): `#historyStatus {
   font-size: 16px }`, restated as `:root.display-large #historyStatus { font-size: 20px }` in
   css/large.css. CHECKS: criterion 21 «"העתק" puts the text on the clipboard and says so, at the
   dialog's 16px» (before: 14) and «a long one … the line saying to copy it ON THE GLASS, at 16px»;
   criterion 25's new view «the text, refused for a link» under the ruler, «no word under 16px»
   (before: the refusal at 14px in every cell without the mode). The new views also give the
   ruler a two-site day under a chosen site and more days than a chunk (eight views, five before).
3. **P2 - the redraw's two guards held by nothing**. CONFIRMED: every move the suites made moved a
   count, and criterion 23's moves never touched the focused day. FIXED IN THE SUITES: Node «a day
   moved to another site at the same rate under the open dialog: no count moves, and its row says
   where he was now» (fails on the mutant with the rows out of the signature); browser criterion
   23 «a commit moving the FOCUSED day to another site at the same rate: no count moves, the day is
   drawn anew saying where he was, the focus back on it, the place kept» and «an adopted snapshot
   moving another drawn day the same way …» (before, on the mutants: the moved day never built
   again, still saying «אתר 2» where the record said «אתר 3», and after the snapshot «אתר 4»). The
   refocus alone - with the rows left in the signature, so the day IS built again - is shown by
   `fix1b/refocus.mjs` (`refocus.out`, run on ef85afe): the focused row moved from p2 to p1 at the same
   rate is built again either way, and as built the focus is back on it; with only the refocus taken
   out it is on the page's `body` - which criterion 23's «the focus back on it» reads. The snapshot moves ANOTHER day than the
   commit's (ef85afe): the commit's edit of the focused day is this phone's own and unsent, so a
   snapshot is rebased under it, as it must be.
4. **P2 - a two-site day's kind and hours beside the second site only** (js/ui/history.js:721).
   CONFIRMED. FIXED (71e8303): the sites are a group of their own, a whole line when there are two
   or more, so the kind and the hours under it are the day's. CHECKS: criterion 25 «a day at two
   sites - both sites, and under them the day's kind with its hours, beside neither alone» on the
   critic's day (before: false at 320, 375 and 440, both schemes, with and without the mode); Node
   «a day at two sites: both in a group that takes a line of its own …» and «a day at one site: its
   group is not made a line of its own» (fail on round 1).
5. **P3 - with no share sheet the link's bound refuses a season's opening view; its unit unpinned**
   (js/ui/history.js:1061). CONFIRMED: one man's three months on the season, 3,015 characters and
   14,326 in a link. CHECK ADDED: Node «so with no share sheet nothing is put in a link, and the
   line under the doors says to copy it», on a text of 3,015 characters whose link is 14,326 (fails
   on the `text.length` mutant), and a short one that goes. THE BOUND IS LEFT at 8,000 encoded
   characters: it cannot be measured here against WhatsApp, and a higher number would be as much a
   guess. The owner is told (Open questions, 6).
6. **P3 - left open across midnight, «שלח» and «העתק» sent a reading the screen did not show**
   (:1057, :1078). CONFIRMED. FIXED (71e8303): both build the text from the facts the screen was
   last drawn from (`historyShownFacts`). CHECK: Node «"העתק" and "שלח" in the morning send the text
   the field and the line show …» (fails on round 1: the copied range ending 11/11).
7. **P3 - five guards of what the rows and notes say held by nothing**. CONFIRMED: each mutant
   passed both suites of round 1. FIXED IN THE SUITES, each check failing on its mutant
   (`fix1/muts.out`): «everyone, every site, a range with no Rima count: no Rima sentence, on the
   screen or in the text» (`rimaInRange >= 0`); «one man: no name on any of his rows …» and «and him
   alone again …» (the name on every row); «everyone: every row carries its man's name …» and «his
   rows alone do not» (a kept row without `everyone`); «a man renamed under the open dialog …» (a
   kept row without the name); «and says that day was chosen by hand, once …» in Node and, across a
   real midnight in Chromium, criterion 19 «a row of the old today: tapped, the day screen is on
   2026-11-10, the dialog shut - and stays there» (without `dayChosenByHand`: 2026-11-11).
8. **P3 - tests/find.browser.mjs red at 4122fcb and d0af7ec**. CONFIRMED: `git show` - both draw
   the fourth door while the suite still pins three doors, four Tab presses and «מקדמות» last
   (85/88, `program/history/rev2/run-doorlast-find.browser.txt`). LEFT IN THE HISTORY, SAID HERE:
   the three pins moved in 1dc21c2, two commits after the door. The branch is not rewritten - every
   SHA this file, the commit messages and the contract name would move. **Merge the branch whole,
   or squash 1dc21c2 into 4122fcb; do not bisect onto either commit expecting find-browser green.**
9. **P3 - the refusal of a long link written off the glass, and gone after six seconds** (:1061).
   CONFIRMED. FIXED: brought onto the glass (`scrollIntoView({ block: 'nearest' })`), kept until the
   next door, choice or fold (71e8303), and an earlier send's own four-second clear no longer wipes
   it (ef85afe). CHECKS: criterion 21 «a long one … the line saying to copy it ON THE GLASS, at 16px»
   and «and seven seconds later it is still there, on the glass» (before: off the glass, then gone;
   on 71e8303 the second still failed, to the earlier send's clear); Node «the choice put the line
   away, and a short text goes». NOT COVERED: «העתק»'s own two-second clear (copyTextOut,
   js/ui/share.js, shared by every dialog with a text) still wipes a refusal pressed within two
   seconds of a copy. The usual order is the other way round - the refusal says to copy.
10. **P3 - a man turned off opened on three empty months** (:878). CONFIRMED. FIXED (71e8303): a man
    with no day in the last three months opens on «מתחילת הרישום»; everyone and a man with days
    there open as before. CHECKS: Node «a man turned off in the summer, through his door: opened on
    "מתחילת הרישום", on his days - the last of them in August» (fails on round 1: «3 החודשים
    האחרונים», no rows) and «while a man with days in the last three months opens on them, as before».
11. **P3 - the text ran the man into a site's name, and told its reader to choose** (:549).
    CONFIRMED. FIXED (71e8303): with everyone the man ends at a colon («• שני 09/11 - דוד כהן:
    הרצליה - מגדל הים · רגיל»); the text says the facts only - «עובדי רימא לא נספרים כאן.» and the cut
    line without «בחר …»; the screen keeps «כדי לראות גם אותם, בחר אתר.» (`noRimaHow`, new) and its
    cap names «תקופה», the select's own label, for «טווח». CHECKS: Node §9 «everyone, every site: …»
    and «everyone at a site: …», the text's cap on a season, and §13 the words (all fail on round 1).
    PINS MOVED ON PURPOSE (71e8303; criterion 20's copy of the cap in the browser suite, ef85afe).
12. **P3 - one man's rows zigzag at 375** (css/design.css:1271). CONFIRMED. FIXED (71e8303): the date
    in a column of its own width (`.history-when { flex: 0 0 6.5em }`), and with everyone the day on
    a line of its own under the date and the name. CHECK: criterion 25 «… every row of his has one
    shape …» (before: two shapes at 375 without the mode, and at 440 with it).
13. **P3 - at doubled text a date broken inside itself** (:391). CONFIRMED, at 440 too. FIXED
    (71e8303): the range is an inline box of its own, and its one break is after the dash - a
    no-break space holds the dash to the first date. CHECKS: criterion 25 «no date of the line is
    split across two lines, and its dash stays with the first date», in the doubled cells too
    (before: in four of the eight views of every cell, and in all eight at doubled text - 64
    failures); Node «the line: the template's words, then the range in a box of its own …» (fails
    on round 1). PIN MOVED ON PURPOSE (71e8303): the
    glue - one no-break space before the dash, the one break after it.
14. **P3 - a double tap on «הרשימה כטקסט» opened the fold and shut it again** (:1042). CONFIRMED,
    probed on round 1's bytes with the button on the glass: the second tap shut it
    (`fix1b/foldtap2.out`). FIXED (71e8303): a finger's press less than WALK_BOUNCE_MS after the
    last one let through does nothing (`historyFoldTooSoon`; a keyboard and code act at once).
    CHECK: criterion 21 «the point the double tap comes down on is the fold's button, on the glass»
    and «a double tap on "הרשימה כטקסט" opens the fold and leaves it open - one tap, not two». Until
    ef85afe that check aimed at nothing - next section.
15. **P3 - no day on the glass as it opens at 375 and 320; one line of tiles with its figures at
    three heights** (css/design.css:1244). CONFIRMED, both. FIXED (71e8303): each figure stands at
    its tile's foot. CHECK: criterion 25 «… and the figures of one line of tiles on one line»
    (before: failed at 320, 375 and 440 with the mode and doubled, and at 375 as it is). LEFT FOR THE
    OWNER: whether the first glass holds the counts or the first days is his (Open questions, 7; the
    picture).

### What the runs of the repaired suite showed, and what ef85afe, e96492a and da37404 did with it

On 71e8303, 1236/1241:

- **The fold's double tap was aimed at nothing.** Its point was the button's rectangle as the dialog
  stood: the middle at y 644, the scroll box ending at 638 - both taps came down on the dialog's
  padding, on round 1 and on the repair alike, and the check read «shut» for both. Probed both
  ways (`fix1b/foldtap2.mjs`, `foldtap2.out`): aimed so, nothing is toggled on either tree; with
  the button on the glass, round 1 opens and shuts again, the repair opens once and ignores the
  second tap. The check now brings the button onto the glass and first checks that the point IS
  the button.
- **A refusal wiped by the send before it**: «שלח»'s own clear, four seconds after a short text,
  was unconditional - fixed in js/ui/history.js (ef85afe).
- **The snapshot rebased under the commit's own edit**: criterion 23's snapshot now moves another
  day (ef85afe, above).
- **The cap's sentence**: criterion 20's copy still said «טווח» - moved on purpose (ef85afe).
- **The blocked worker's own error** on the midnight walk's return: tests/screens.mjs blocks the
  service worker, and js/ui/offline.js's listener for the return reads `update` of a registration
  that never came. 542b0dd set apart what Playwright had handed over 100 ms after the return; on a
  loaded machine some came later (the run on ef85afe), and one more comes as the walk's page leaves
  with `document.visibilityState` still overridden (the run on e96492a, after a count taken in the
  page). Since da37404 the walk's two pages hand their errors to a list of their own, held at the
  very end to that one message; every other page's errors go where they always went, and «no
  uncaught browser errors» is round 1's check again, word for word.
- Two reads of tests/history.test.mjs threw on round 1's bytes and ended the run; they fail now,
  so the run on round 1 goes to its end (ef85afe).

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
| `css/large.css` | block 2: «סגור»'s 64px width kept under the mode's floor; block 3: every size, weight and line-height of the block restated one for one after the finder's (`#historyStatus` 20px since fix round 1) |
| `tests/history.test.mjs` (new) | criteria 1-16 on devices in Node, 192 checks, in `npm test` |
| `tests/history.browser.mjs` (new) | criteria 17-26 in Chromium with touch, 1245 checks, in `test:all` |
| `tests/screens.mjs` | four entries after 'find' and two helpers: one man; everyone at p1 with Rima; everyone at p2 with יוסף גבס; «תאריכים אחרים» with the fold open |
| `tests/find.browser.mjs` | the three pins the fourth door moves (below) |
| `package.json` | `test:history` (in `test`), `test:history-browser` (in `test:all`) |
| `tests/README.md` | two rows of its own (brought up to fix round 1 in 71e8303); the finder's two rows say four doors |
| `features/history/contract.md`, `features/history/handoff.md` | the contract; this file |

No migration: no data shape, key, field path or writer is added. Nothing in `js/model`,
`js/sync`, `js/state.js`, `js/store.js`, `js/recovery.js`, `firestore.rules` or `functions`;
no build stamp, `js/ui/whatsnew.js`, `docs/releases.md` or `CLAUDE.md`. Fix round 1 added no file,
no key, no hook and no screen: it changed `js/ui/history.js`, the block of `css/design.css`, one
line of `css/large.css`, this track's two suites and their two README rows.

## The commits

```
(this commit) features/history/handoff.md: fix round 1 - sixteen findings triaged, each check named, the suites on da37404
da37404 tests/history.browser.mjs: the midnight walk's pages hand their errors to a list of their own, held at the end to the blocked worker's one message
e96492a tests/history.browser.mjs: the blocked worker's own errors counted in the page that throws them, and taken off by that count
ef85afe «מי עבד איפה», fix round 1, what the run on 71e8303 showed: a refusal no earlier send wipes, and three checks that now aim at what they hold
542b0dd tests/history.browser.mjs: the midnight walk sets apart the blocked worker's own error, and a failed double tap no longer ends the walk
71e8303 «מי עבד איפה», fix round 1: a count never painted over, the day's kind under both its sites, the line under the doors at 16px
b54df95 features/history/handoff.md: what was built, what moved, and every suite on a22a727 from a clean tree
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

4122fcb and d0af7ec fail tests/find.browser.mjs (85/88: its three door pins moved only in 1dc21c2) -
merge the branch whole, or squash 1dc21c2 into 4122fcb (fix round 1, finding 8).

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
`${who} · ${where} · ${range}` · `asText` «הרשימה כטקסט» · `noRima` «עובדי רימא לא נספרים כאן.» ·
`noRimaHow` «כדי לראות גם אותם, בחר אתר.» (the screen says both, the text the first alone) ·
`dayOne` «יום אחד» · `dayMany` «ימים» · `empty` «לא נמצא אף יום שמתאים לבחירה.» · `month`
`${name} ${year}[ · ${count}]` · `who` `${name} · ${count}` · `rowName` the date, the man, the sites
and the kind joined by « · », an empty part left out · `shown` «מוצגות N שורות מתוך M.» · `more`
«הצג עוד N» · `capped` «מוצגות N השורות החדשות ביותר מתוך M. כדי לראות את השאר, בחר תקופה קצרה יותר,
אתר או עובד.» · `textHead` `📄 ${who} · ${where}` · `textCut` «ההודעה כוללת רק את N השורות החדשות
ביותר מתוך M, כי כל הרשימה ארוכה מדי להודעה אחת.» · `tooLongForLink` «⚠️ הרשימה ארוכה מדי לקישור של
וואטסאפ - השתמש בהעתק ושלח ידנית» · `leaveTitle` «לצאת מבניית הסידור?» · `leaveMessage` «כדי לפתוח
את ‹day› צריך לצאת מבניית הסידור ל‹seder day›. אפשר לחזור אליה אחר כך מ«‹JOURNEY_TEXT.entry›».» ·
`leaveOk` «צא ופתח את היום». A line of the text with everyone: `• ‹when› - ‹name›: ‹site + site› ·
‹kind›[ · +N ש׳]` (the man ends at a colon, not a dash, since fix round 1).

CHANGED IN FIX ROUND 1 (71e8303), each pin moved with it: `noRima` split into the fact and
`noRimaHow` (new); `capped` «בחר תקופה קצרה יותר» for «בחר טווח קצר יותר» (the select is «תקופה»);
`textCut` without «כדי לקבל את כולן, בחר טווח קצר יותר, אתר או עובד.» (whoever reads the message has
nothing to choose); the text's man ends at a colon.

Borrowed (`HISTORY_REUSED`, each found in its owner's source by the suite): «כל העובדים», «כל
האתרים», «לא פעיל», «תקופה», «החודש», «חודש שעבר», «תאריכים אחרים», «מתאריך», «עד תאריך», «הטווח
הפוך» and its sentence, «ימי נוכחות», «יום נוכחות אחד», «ימי עובד־אתר», «כפולים», «שעות נוספות»,
«נעדר», the two-sites sentence, «2 אתרים», `+N ש׳`. Read from their owners' constants when used:
`RATE_LABELS`, the Rima and יוסף גבס titles, totals and notes, «חיוב -», «מי עבד באתר», the month
names, «לחיצה על יום פותחת אותו במסך היום.», «💬 שלח בוואטסאפ», «העתק», «סגור», `JOURNEY_TEXT.entry`.

## Pinned expectations MOVED - on purpose, with the reason

In an EXISTING suite, only tests/find.browser.mjs, in its own commit (1dc21c2), exactly the three
checks the contract names, each with a `MOVED:` comment naming this track. The fourth door is LAST
so «מקדמות» keeps its place under the thumb:
1. «a man on the daily list has four doors…; a man turned off has three…» →
   `[[['כרטיס עובד', 'שיבוץ להיום', 'מקדמות', 'איפה עבד'], []], [['כרטיס עובד', 'מקדמות', 'איפה עבד'], ['לא פעיל']]]`;
2. «Tab goes from the field down the first man's doors» → FIVE presses (`step < 5`), still ending
   on the next man's first door: `['כרטיס עובד', 'שיבוץ להיום', 'מקדמות', 'איפה עבד', 'כרטיס עובד']`;
3. «Shift+Tab from the field reaches «סגור», and once more comes round to the last door» →
   `['findClose', ['איפה עבד', true]]`.

Fix round 1 moved no pin of any existing suite. In this track's own two suites it moved, each
with a `MOVED ON PURPOSE` comment and the reason in its commit: tests/history.browser.mjs criterion
17 (two tiles a line at 375 with the large display) and criterion 20 (the cap's sentence,
ef85afe); tests/history.test.mjs the text of everyone (the colon), the text's Rima line (the fact),
the text's cut line (the fact), the screen's cap («תקופה»), the line's range glue, the kinds reader
(the sites' group) and the words block (`noRimaHow`).

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
   one line (60 checks). SUPERSEDED in fix round 1 (finding 13): `overflow-wrap: anywhere` broke
   that one word inside a date at twice the text, so the range is now an inline box of its own,
   with no word joiner, whose one break is after its dash.
5. In the suite itself: a choice is made with its field focused first, as a tap reaches it
   (Playwright's `selectOption` focuses nothing); a site's tag is read by its name, not its whole
   text (the day screen's ◆ past ten sites); a marker with no letter or digit is held to no size
   floor, as tests/mobile.test.mjs holds it; and each timed step of the budget hands back what it
   drew (1ca7578) - two runs had printed «כל העובדים» painted in 18 ms at 4x, which nothing showed
   to be the time of the work it named.
6. **Fix round 1: the fold's double tap was aimed at nothing** (ef85afe). The point came from the
   button's rectangle as the dialog stood - below the scroll box's edge - so both taps landed on
   the dialog's padding and the check read «shut» on round 1 and on the repair alike. It now
   brings the button onto the glass and checks the point is the button (finding 14 above).
7. **Fix round 1: a refusal wiped by the send before it** (ef85afe): «שלח»'s four-second clear was
   unconditional.
8. **Fix round 1: a snapshot rebased under this phone's own unsent edit** (ef85afe): criterion 23's
   snapshot moved the very day the commit had just moved, and the protocol rightly kept the local
   edit; it moves another day now.
9. **Fix round 1: the test page's blocked worker** (542b0dd, e96492a, da37404): a return from the
   lock on a page whose service worker tests/screens.mjs blocks reads `update` of a registration
   that never came (js/ui/offline.js). The midnight walk's two pages now hand their errors to a list
   of their own, held at the end to that one message - neither a window after the return nor a
   count taken in the page could hold the one handed over late.

## Where this departs from the contract - deliberately

- `rowName` leaves an empty part out (an absence has no sites) rather than saying « ·  · ».
- The text has a blank line before «מי עבד באתר».
- `historyGoDay(date, key)`: an optional second argument, the asking row's key, so that after
  «ביטול» the focus goes back to that row.
- The list is redrawn incrementally (repair 3); the contract's own numbers were of a whole
  redraw, and every criterion holds.
- The date fields are 48px like the selects (the contract asks ≥ 16px text and the app's 44px).
- tests/README.md's two finder rows changed in 1dc21c2, not in the door's own commit 4122fcb as
  the contract asked - and tests/find.browser.mjs's three pins with them, so 4122fcb and d0af7ec
  are red on find-browser (85/88).
- In tests/history.test.mjs the fixture's two unlisted sites are put into the record in memory
  after the reload: `State.load` puts an unlisted site back as an archived «אתר שנמחק (id)», so
  only that way do the checks see a site the roster has not got.
- FIX ROUND 1, each from a finding of the review:
  - A man with no day in «3 החודשים האחרונים» opens on «מתחילת הרישום» (the contract: always the
    three months) - a man turned off in the summer opened on five tiles of 0 (finding 10).
  - The text's line for everyone ends the man at a colon (the contract's template: a dash), the
    text's Rima line and its cut line say the fact without «בחר …», and the screen's cap says «בחר
    תקופה קצרה יותר» (the contract: «בחר טווח קצר יותר») - finding 11.
  - The tiles' tracks are `minmax(calc(4.4em + 20px), 1fr)` (the contract measured `minmax(96px,
    1fr)`): two a line at 375 with the large display, where the contract has three (finding 1).
  - The line's range is an inline box with its one break after the dash (finding 13) - the
    contract's template shows a plain string, and the text keeps dateRange's own spaces.

## The suites, on da37404, from the clean tree - pasted, not summarized

**`npm test` itself** stops at `test:build`, as it must until the stamps move:

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

**Every suite of the `npm test` chain, one by one** (`name, exit, seconds, count`):

```
tree da374048526765af9ab650dff5d9e636879a1435 status-lines 0
test:isolation	exit 0	1s	18/18 checks passed
test:blobs	exit 0	1s	11/11 checks passed
test:build	exit 1	1s	67/69 checks passed
    **FAIL**  and nothing in the shell has changed since  — 7 changed since 6ab193d6: css/design.css, css/large.css, index.html, js/app.js, js/ui/find.js, js/ui/history.js, js/ui/modal.js
    **FAIL**  and neither has the worker that names the shelf  — sw.js
test:poison	exit 0	0s	37/37 checks passed
test:merge	exit 0	0s	28/28 checks passed
test:contested	exit 0	16s	73/73 checks passed
test:held	exit 0	4s	83/83 checks passed
test:snapshot-stale	exit 0	1s	16/16 checks passed
test:reports-rules	exit 0	2s	26/26 checks passed
test:finance	exit 0	8s	57/57 checks passed
test:weekly-range	exit 0	0s	21/21 checks passed
test:finance-wording	exit 0	2s	12/12 checks passed
test:weekly-unpriced	exit 0	0s	23/23 checks passed
test:receipt	exit 0	2s	28/28 checks passed
test:data	exit 0	44s	1970/1970 checks passed
test:recovery	exit 0	2s	82/82 checks passed
test:adversarial	exit 0	5s	116/116 checks passed
test:probes	exit 0	7s	35/35 checks passed
test:capacity	exit 0	13s	48/48 checks passed
test:concurrency	exit 0	3s	46/46 checks passed
test:exports	exit 0	1s	112/112 checks passed
test:fence	exit 0	3s	35/35 checks passed
test:fence-ingress	exit 0	1s	43/43 checks passed
test:fence-legacy	exit 0	0s	21/21 checks passed
test:money-history	exit 0	0s	9/9 checks passed
test:money-units	exit 0	0s	21/21 checks passed
test:money-cloud	exit 0	1s	17/17 checks passed
test:money-display	exit 0	1s	4/4 checks passed
test:snapshot-poison	exit 0	2s	82/82 checks passed
test:samefact	exit 0	5s	37/37 checks passed
test:wording	exit 0	1s	37/37 checks passed
test:closure	exit 0	25s	122/122 checks passed
test:closure-echo	exit 0	1s	79/79 checks passed
test:correction	exit 0	1s	33/33 checks passed
test:quarantine	exit 0	1s	82/82 checks passed
test:approval	exit 0	9s	72/72 checks passed
test:repayment	exit 0	6s	240/240 checks passed
test:ledger-ingress	exit 0	0s	167/167 checks passed
test:cas	exit 0	13s	88/88 checks passed
test:status	exit 0	6s	37/37 checks passed
test:money	exit 0	3s	40/40 checks passed
test:money-ingress	exit 0	9s	206/206 checks passed
test:method	exit 0	3s	51/51 checks passed
test:restore	exit 0	1s	51/51 checks passed
test:upgrade	exit 0	1s	48/48 checks passed
test:vehicles	exit 0	3s	86/86 checks passed
test:xlsx	exit 0	1s	104/104 checks passed
test:nonassertions	exit 0	1s	23/23 checks passed
test:labels	exit 0	1s	23/23 checks passed
test:labelcache	exit 0	0s	32/32 checks passed
test:restore-ledger	exit 0	2s	26/26 checks passed
test:roster-upgrade	exit 0	7s	55/55 checks passed
test:roster-race	exit 0	6s	63/63 checks passed
test:exports-proof	exit 0	2s	44/44 checks passed | 92/92 checks passed
test:ledger-truth	exit 0	6s	148/148 checks passed
test:races	exit 0	5s	109/109 checks passed
test:overlap-restore	exit 0	20s	117/117 checks passed
test:refute-roster	exit 0	10s	24/24 checks passed
test:refute-restore	exit 0	43s	25/25 checks passed
test:gate-integrity	exit 1	0s	19/20 checks passed
    **FAIL**  no cached file has changed since the three stamps last moved  — ef85afeb «מי עבד איפה», fix round 1, what the run on 71e8303 showed:  | 71e83034 «מי עבד איפה», fix round 1: a count never painted over, the  | a22a7272 js/ui/his
test:queuecost	exit 0	6s	18/18 checks passed
test:paycycle	exit 0	0s	43/43 checks passed
test:paycycle-blockers	exit 0	3s	17/17 checks passed
test:paycycle-completion	exit 0	5s	31/31 checks passed
test:crew-controls	exit 0	1s	46/46 checks passed
test:simple-advances	exit 0	2s	66/66 checks passed
test:worker-deletion	exit 0	10s	86/86 checks passed
test:calendar	exit 0	0s	58/58 checks passed
test:reminders	exit 0	1s	48/48 checks passed
test:move-late	exit 0	5s	48/48 checks passed
test:codex-probes	exit 0	0s	17/17 checks passed
test:codex2-probes	exit 0	1s	36/36 checks passed
test:codex3-probes	exit 0	3s	59/59 checks passed
test:rima	exit 0	92s	496/496 checks passed
test:yosefgeves	exit 0	93s	562/562 checks passed
test:seder	exit 0	1s	135/135 checks passed
test:bars-stale	exit 0	0s	60/60 checks passed
test:transport	exit 0	1s	566/566 checks passed
test:transport-share	exit 0	12s	304/304 checks passed
test:oracle	exit 0	53s	121/121 checks passed
test:overpayment	exit 0	6s	105/105 checks passed
test:polish	exit 0	0s	73/73 checks passed
test:daycheck	exit 0	7s	169/169 checks passed
test:journey	exit 0	1s	233/233 checks passed
test:workercard	exit 0	29s	180/180 checks passed
test:monthsummary	exit 0	102s	98/98 checks passed
test:payslips	exit 0	32s	202/202 checks passed
test:find	exit 0	1s	91/91 checks passed
test:whatsnew	exit 0	0s	160/160 checks passed
test:account-view	exit 0	27s	456/456 checks passed
test:usual	exit 0	2s	150/150 checks passed
test:sitecard	exit 0	3s	119/119 checks passed
test:reportsclarity	exit 0	3s	1119/1119 checks passed
test:largetext	exit 0	0s	107/107 checks passed
test:reportnames	exit 0	14s	36/36 checks passed
test:holiday	exit 0	0s	109/109 checks passed
test:undo-stale	exit 0	2s	32/32 checks passed
test:auditfix	exit 0	2s	34/34 checks passed
test:owes	exit 0	82s	190/190 checks passed
test:weeklyclose	exit 0	144s	146/146 checks passed
test:reports-speed	exit 0	238s	159/159 checks passed
test:closeorder	exit 0	0s	22/22 checks passed
test:closuresize	exit 0	15s	13/13 checks passed
test:closerace	exit 0	39s	29/29 checks passed
test:advancereset	exit 0	62s	77/77 checks passed
test:overpaidfix	exit 0	0s	85/85 checks passed
test:xlsxlook	exit 0	10s	293/293 checks passed
test:closereminder	exit 0	15s	107/107 checks passed
test:history	exit 0	13s	192/192 checks passed
DONE
```

The same chain ran twice before on this round's code, and is not the answer: on ef85afe (whose
code is da37404's) 105 of 109 - the two stamp suites, and two that were not this track's and passed
on the next run: tests/payslips.test.mjs «nothing a man is paid is in it» (its pattern
`/800|אחמד|97252/` met the mark's own clock, `"at":1795147055800`, a `Date.now()` with the digits
800 in it - a check that fails whenever the wall clock does so) and tests/owes.test.mjs's 1.5x
ratio (162 against 99 ms, at a load average near nine); on e96492a 107 of 109, the stamp suites
alone (`fix1b/chain.tsv`, `fix1b/chain2.tsv`).

**The browser suites, each alone through the slot wrapper** (`bt node tests/<suite>`; the seconds
include the wait for a slot, which other sessions' suites held):

```
history.browser.mjs     da37404  exit 0  465s   1245/1245 checks passed   0 FAIL lines
find.browser.mjs        ef85afe  exit 0  21s    88/88 checks passed       0 FAIL lines
smoke.mjs               ef85afe  exit 0  395s   1186/1186 checks passed   0 FAIL lines
largetext.browser.mjs   ef85afe  exit 0  764s   8569/8569 checks passed   0 FAIL lines
design.browser.mjs      ef85afe  exit 0  9s     72/72 checks passed       0 FAIL lines
```

This track's suite ran twice before in this round, and those runs are not the answer: on ef85afe
1242/1244 - the budget at a load average near nine (a commit 1447 ms against 600) and two of the
test page's own blocked-worker errors handed over late; on e96492a 1243/1244 - one more of them, as
the walk's page left (da37404 says why). Logs: `fix1b/browser-logs/`, `browser-logs2/`,
`browser-logs3/`.

The browser suites run are this track's and every existing one the fix round's change reaches:
the large display (it walks this dialog's four screens with css/large.css, whose one line moved),
the finder (the door opens the dialog through `openHistory`, whose first range moved), smoke (every
page loads js/ui/history.js) and the look (css/design.css). `test:all`, `test:release` and the
emulator suites were not run (not allowed here).

## Measured, as the suites printed it on da37404

The found man's row in the finder, without the door and with it (criterion 17; the fix round moved
nothing here - the contract's `rev2/doorlast` expectation, met to the pixel):

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

The tiles as the dialog opens (criterion 17): two a line at 320 and at 375 with «תצוגה גדולה»
(three before fix round 1), three at 375 and at 440; the first on the glass in every cell but
320x568 with the mode (its bottom at 572 of 539), the whole block at 375x667 without the mode (503
to 608 of 638) and at 440x956 in both.

A season's counts in their tiles (criterion 25, new in fix round 1) - 40 men, 305 days, 788 KiB -
every figure inside its own tile and every line of figures on one line, in each of the eighteen
cells below:

```
320x568, as it is, thisYear: 2 a line; 9037 / 9538 / 289 / 1012 / 205
320x568, as it is, all: 2 a line; 10241 / 10817 / 326 / 1152 / 225
320x568, large display, thisYear: 2 a line; 9037 / 9538 / 289 / 1012 / 205
320x568, large display, all: 2 a line; 10241 / 10817 / 326 / 1152 / 225
320x568, text doubled, thisYear: 1 a line; 9037 / 9538 / 289 / 1012 / 205
320x568, text doubled, all: 1 a line; 10241 / 10817 / 326 / 1152 / 225
375x667, as it is, thisYear: 3 a line; 9037 / 9538 / 289 / 1012 / 205
375x667, as it is, all: 3 a line; 10241 / 10817 / 326 / 1152 / 225
375x667, large display, thisYear: 2 a line; 9037 / 9538 / 289 / 1012 / 205
375x667, large display, all: 2 a line; 10241 / 10817 / 326 / 1152 / 225
375x667, text doubled, thisYear: 1 a line; 9037 / 9538 / 289 / 1012 / 205
375x667, text doubled, all: 1 a line; 10241 / 10817 / 326 / 1152 / 225
440x956, as it is, thisYear: 3 a line; 9037 / 9538 / 289 / 1012 / 205
440x956, as it is, all: 3 a line; 10241 / 10817 / 326 / 1152 / 225
440x956, large display, thisYear: 3 a line; 9037 / 9538 / 289 / 1012 / 205
440x956, large display, all: 3 a line; 10241 / 10817 / 326 / 1152 / 225
440x956, text doubled, thisYear: 2 a line; 9037 / 9538 / 289 / 1012 / 205
440x956, text doubled, all: 2 a line; 10241 / 10817 / 326 / 1152 / 225
```

The budget at 4x CPU on that season, each step held to what it drew (da37404, at a load average
between three and five):

```
at 4x: the door 158 ms, «כל העובדים» 128 ms, «השנה» 49 ms, «הצג עוד» 199 ms, a commit under 600 days 306 ms, an adopted snapshot 446 ms
of which the action itself: tap 154, everyone 109, year 47, more 183, commit 290, snapshot 438 ms
```

On ef85afe, at a load average near nine, the same check failed once - «a commit under 600 days
1447 ms», 1425 of them the commit itself (round 1 measured 218 ms quiet); e96492a passed it (223 ms)
and da37404 (306 ms). A timing, not the dialog's own share: the redraw is the same code in all three.

The reading and the text in Node, median of 5 (tests/history.test.mjs on da37404, inside the chain -
the year exactly the contract's 9,206 / 9,669 / 264 / 883 / 206):

```
      the season's year: 9412 rows; attendance 9206, siteDays 9669, doubleDays 264, extraHours 883, absent 206
      a man's three months on the season: 3015 characters, 14326 in a link
      a year, everyone, every site: 9412 rows, 59988 characters, 35.7 ms (median of 5)
      a year, one man, every site: 245 rows, 11386 characters, 5.4 ms (median of 5)
      a year, everyone, one site: 1450 rows, 59941 characters, 50.8 ms (median of 5)
      a year, one man, one site: 239 rows, 10936 characters, 5.1 ms (median of 5)
      this month, everyone, every site: 563 rows, 32129 characters, 7.7 ms (median of 5)
      3 months, everyone, every site: 2336 rows, 59986 characters, 15.5 ms (median of 5)
      the whole record, everyone: 10627 rows, 59992 characters, 39.4 ms (median of 5)
```

The chosen names against their closed selects (criterion 25):

```
320x568 dark: «עבד אל-רחמן אבו חוסיין · לא פעיל» needs 230px of 240; «הרצליה - מגדל הים · לא פעיל» 198px of 240
320x568 dark, large display: «עבד אל-רחמן אבו חוסיין · לא פעיל» needs 287px of 238; «הרצליה - מגדל הים · לא פעיל» 248px of 238
320x568 light: «עבד אל-רחמן אבו חוסיין · לא פעיל» needs 230px of 240; «הרצליה - מגדל הים · לא פעיל» 198px of 240
320x568 light, large display: «עבד אל-רחמן אבו חוסיין · לא פעיל» needs 287px of 238; «הרצליה - מגדל הים · לא פעיל» 248px of 238
375x667 dark: «עבד אל-רחמן אבו חוסיין · לא פעיל» needs 230px of 295; «הרצליה - מגדל הים · לא פעיל» 198px of 295
375x667 dark, large display: «עבד אל-רחמן אבו חוסיין · לא פעיל» needs 287px of 293; «הרצליה - מגדל הים · לא פעיל» 248px of 293
375x667 light: «עבד אל-רחמן אבו חוסיין · לא פעיל» needs 230px of 295; «הרצליה - מגדל הים · לא פעיל» 198px of 295
375x667 light, large display: «עבד אל-רחמן אבו חוסיין · לא פעיל» needs 287px of 293; «הרצליה - מגדל הים · לא פעיל» 248px of 293
440x956 dark: «עבד אל-רחמן אבו חוסיין · לא פעיל» needs 230px of 360; «הרצליה - מגדל הים · לא פעיל» 198px of 360
440x956 dark, large display: «עבד אל-רחמן אבו חוסיין · לא פעיל» needs 287px of 358; «הרצליה - מגדל הים · לא פעיל» 248px of 358
440x956 light: «עבד אל-רחמן אבו חוסיין · לא פעיל» needs 230px of 360; «הרצליה - מגדל הים · לא פעיל» 198px of 360
440x956 light, large display: «עבד אל-רחמן אבו חוסיין · לא פעיל» needs 287px of 358; «הרצליה - מגדל הים · לא פעיל» 248px of 358
320x568 light, text doubled: «עבד אל-רחמן אבו חוסיין · לא פעיל» needs 459px of 240; «הרצליה - מגדל הים · לא פעיל» 396px of 240
375x667 dark, text doubled: «עבד אל-רחמן אבו חוסיין · לא פעיל» needs 459px of 295; «הרצליה - מגדל הים · לא פעיל» 396px of 295
```

They fit at 375 and 440 with and without the mode, and at 320 without it; where they do not (320
with the mode, and every cell with the text doubled) the line under the fields holds them whole -
checked in every cell.

## NOT done, NOT verified

- **Not tried on a real phone.** Chromium with emulated touch only.
- **The 8,000-character bound for a wa.me link is a guess**, not tried against WhatsApp; WhatsApp's
  65,536-character limit for one message is the documented one, not measured. And on a
  season-sized record the dialog's own opening view does not fit it (fix round 1, finding 5):
  one man's three months are 3,015 characters, 14,326 in a link. Only where there is no share
  sheet - a computer's browser, some in-app browsers; on an iPhone's Safari or Android's Chrome
  the text goes to the share sheet whatever its length. Open question 6.
- **«העתק»'s own two-second clear** (copyTextOut, js/ui/share.js, shared by every dialog with a
  text) still wipes a refusal pressed within two seconds of a copy (finding 9). Not changed: the
  usual order is the other way round, and the door is every dialog's.
- **What the first glass holds at 375 and 320** - the counts, not the first days - is left for the
  owner (finding 15; open question 7).
- `tests/readability.audit.mjs` (not a suite) was not run.
- `npm run test:all`, `test:release` and the emulator suites were not run (not allowed here); the
  browser suites that were run are listed above, one by one.
- The three build stamps, «מה חדש», docs/releases.md and CLAUDE.md are the integrator's and were
  not touched - so `test:build` and `test:gate-integrity` stay red on their stamp checks until the
  release commit moves the stamps.

## Risks

- **Timing checks on a loaded machine.** This track's «each of the seven queries … inside 100 ms»
  and the browser budget (≤ 600 ms at 4x) are timings; so are tests/owes.test.mjs's ratio and
  others in the chain. A failure under load is re-run alone before it is believed (and said
  above when it happened).
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
  (js/ui/sitecolor.js). Anything else a row came to depend on would have to join its words - fix
  round 1's checks fail when the name or the everyone flag is left out of them.
- **The fold's double-tap guard is on the presses' own clock** (`openPress`, js/ui/sheet.js): a
  finger's press less than 300 ms after the last one let through does nothing - a mouse's double
  click too. A keyboard and a call from code act at once.

## For the integrator

- **Not this track's, met on the way:** tests/payslips.test.mjs's «nothing a man is paid is in it»
  tests the stored marks against `/800|אחמד|97252/`, and the marks hold `Date.now()` - so it fails
  whenever the wall clock's milliseconds contain the digits 800 (`"at":1795147055800` on ef85afe's
  chain; it passed on the next two). A pattern that matched the figure as a whole value, not as
  digits anywhere, would hold. Left as it is: an existing suite, outside this track.
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
                                 text in a fold, what was drawn and nothing read afresh (60,000 at most, never
                                 in a wa.me link past 8,000); a man with no day in the last three months opens
                                 on his whole record; a day only opens its date, and asks first while «בניית
                                 סידור» is open; the finder's fourth door «איפה עבד», last; memory only, no key
                                 written
      tests/history.test.mjs     «מי עבד איפה» on devices: every row and count against its source on seeded
                                 records, the ranges on every edge of the calendar, the text and its cap on a
                                 season, what a kept row says after a choice, a rename or a move, what leaves
                                 after midnight, the journey's question, the disk byte for byte, the costs,
                                 every word
      tests/history.browser.mjs  «מי עבד איפה» in Chromium with touch: the door last on the finder at three
                                 widths, both schemes, with and without the large display; the choices, a day,
                                 across midnight, the journey, the chunks, the text's doors and the fold's
                                 double tap, closing, a record moving under 600 days (the focused day moved
                                 at the same rate), the budget at 4x, a season's counts in their tiles, the
                                 ruler at doubled text, the chosen names
  ```
- docs/releases.md, a proposed entry:
  > **«מי עבד איפה».** A man rings - "I worked on the 12th and it was a double" - or a client
  > asks who was billed at a site in March. «חיפוש עובד», his name, «איפה עבד» (the fourth door,
  > last): his days over «3 החודשים האחרונים» (over his whole record when he has none there - a
  > man who left), newest first, each as the day screen words it, with the counts on top;
  > «עובד», «אתר» and «תקופה» change what is read («כל העובדים» with a site gives the site's
  > billing - with Rima's lines, «עובדי יוסף גבס» apart - and who worked there). The list as text
  > in a fold, by the day message's own two doors; a day opens its date. A READING: no shekel, no
  > gate, no ledger, no key written; the live record, so a day corrected after its close reads
  > corrected (the payslip keeps what was paid). Its Hebrew is proposed and pinned in
  > tests/history.test.mjs; not tried on a real phone.

## Open questions, each with the default built

1. Is the text, which names men, something the owner sends a client? Default: his to send; its
   first line names the question.
2. Should a day corrected after its period was closed be marked? Default: no (the contract's «What
   it does NOT do»).
3. Is «3 החודשים האחרונים» the right first range? Default: yes - and a man with no day in it opens
   on «מתחילת הרישום» (fix round 1).
4. Does the finder keep the fourth door at the price of half its rows with nothing typed?
   Default: yes.
5. Are «מי עבד איפה» and «איפה עבד» his words for it? Default: yes - proposed, pinned.
6. **With no share sheet, is «העתק» enough for a long list?** Where the phone has no share sheet,
   «💬 שלח בוואטסאפ» would put the text in a wa.me link, and past 8,000 encoded characters (about
   1,700 characters of this text, some 34 rows) none is opened: the text is selected and the line
   under the doors says to copy it. On a season-sized record that is the dialog's own opening view
   (one man's three months: 3,015 characters, 14,326 in a link). Default: the 8,000, unmeasured;
   a higher bound needs a try on the computer he would send from.
7. **What should the first glass hold on the small phones?** As it opens at 375x667 the head, the
   three choices, the line and the five counts fill it, and the first day is below it (157 px
   below at 375x667, 309 px at 320x568, 304 px at 375 with «תצוגה גדולה», measured by the review).
   The counts answer "how many", the days "when and where". Default: as built, the counts first.
   If he wants the days higher: the counts as one line of words, or the three choices folded under
   the line that already says them. The picture: `/tmp/claude-0/-home-user-farkad/d6a64352-db1a-5c3b-b54d-5c09103f2419/scratchpad/feat-history/fix1b/shots/history-375x667-light-one-man.jpg`.

## Pictures

Synthetic names, JPEG, taken by tests/history.browser.mjs (`HISTORY_SHOTS`) on ef85afe from the clean
tree - its app code is da37404's - in
`/tmp/claude-0/-home-user-farkad/d6a64352-db1a-5c3b-b54d-5c09103f2419/scratchpad/feat-history/fix1b/shots/`:
- `history-375x667-light-one-man.jpg` - the dialog as it opens at 375x667 (open question 7): the
  head, the three choices, the line breaking BEFORE its dates, the five counts with each figure at
  its tile's foot - and no day yet.
- `history-finder-375x667-without-door.jpg` / `-with-door.jpg`, and the same at 440x956 - the finder
  with nothing typed, without the fourth door and with it.
- `history-440x956-dark-*.jpg` - the eight floor views: one man every site; one man at a site, a day
  at two; everyone at p1 with Rima; everyone at p2 with יוסף גבס; everyone, more than one chunk; the
  text refused for a link (the refusal on the glass under «העתק», at 16px, the text selected); two
  dates and the text; the chosen names. And `history-440x956-dark-one-man.jpg` as it opens.
- `history-320x568-dark-large-*.jpg` - the same with «תצוגה גדולה».
- `history-375x667-light-doubled-season-tiles.jpg` - twice the text on the season, the head of the
  dialog (the counts below it are measured by the suite, not shown in this picture).
