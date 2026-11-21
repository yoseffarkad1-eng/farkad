# Handoff — טבלת האתרים under «דוחות» ← «לפי אתר» (track `sitegrid`)

| | |
|---|---|
| Branch | `feat-sitegrid` (never pushed; no PR) |
| Worktree | `/home/user/farkad/.claude/worktrees/feat-sitegrid` (`node_modules` a symlink) |
| Base | `000dde8` (origin/main, v207 as served). The three stamps are NOT moved. |
| Code commits | `e6ae04d` (the block, its two suites, the wiring), `b653544` (the page's 16px floor; the pinned suites moved), `cf59ba0` (the switch's words at 16px on a phone) |
| The suites ran on | `cf59ba0`, the tree clean, one lane |
| After it | this file's own commit, which changes this file and nothing else |
| Not touched | `js/model`, `js/sync`, `js/state.js`, `js/store.js`, `js/recovery.js`, `js/ui/whatsnew.js`, `docs/releases.md`, `CLAUDE.md`, `index.html`, `sw.js` |

## What the owner asked for

He asked for a page of the client's account as a table, was shown that «לפי אתר» already has
the figures, and chose (2026-11-21, "2") to improve that page in place. No new page.

## What was there, and what is there now

On the screen «לפי אתר» was bars per site, then - only when Rima's men were counted in the
range - a second table «בלי עובדי רימא», then «רישום לרימא» and «עובדי יוסף גבס». The date-by-site
grid with Rima was the PAPER's (`.invoice-grid`, hidden on the screen).

Now, straight under the bars, one block (`renderSiteGrid`, `js/ui/reports.js`):

- a two-state switch, **«כולל עובדי רימא»** / **«ללא עובדי רימא»** (the owner's words), `aria-pressed`
  on each, 44px (52px in «תצוגה גדולה»), opening on «כולל» at every load - memory only
  (`SITE_GRID_WITH_RIMA`), no Store key;
- one line saying what is shown;
- a table: a row per date that has work, a column per site, «סה״כ יומי» last, and the foot
  «סה״כ ימי עובד־אתר». «כולל» is `invoiceByDate`; «ללא» is `invoiceWithoutRima`. No arithmetic of
  its own; a cell at nought is blank, as on the paper.
- the DATE COLUMN STAYS at the inline start while the sites scroll sideways inside the block.
  The page itself never scrolls sideways.

A site chosen in the picker narrows the grid to that site, in both states. An empty range has
no switch and no grid. The switch is drawn even when no Rima count is in the range (the two
states are then the same figures).

«בלי עובדי רימא»'s old section is still in the document, whole, and is put away on the screen
by one CSS rule: the switch now says the same thing in the same place, and the suites and the
workbook that read that section are not moved.

## Paper, picture, files

The block is not a `.report-table` (so `readReportPrintout` never reads it) and is
`display: none` in print. tests/sitegrid.browser.mjs §9 holds, against v207's tree out of Git
served beside this one, in BOTH states, for every site and for one client: the printed PDF's
text word for word, what the picture reads, the picture's PNG by SHA-256, and every sheet and
cell of the workbook. Nothing that leaves the phone moved.

## Not done, and said

- **The header row does not stick.** The box that scrolls sideways is the header's scroll box;
  a sticky header would need a second, vertical scroll inside the page (a table with its own
  height), which is worse on a phone than the header scrolling away. Only the date column sticks.
- **The sideways scroll is SET in the suite, not dragged.** A CDP touch drag left the page in
  Chromium's emulation; what is held is where the column stands once the box has scrolled.
  A finger on a real phone has not been tried.
- No «מה חדש» item, no stamps, no docs/releases.md, no CLAUDE.md: the release does those.
- Not tried on a real phone. Nobody far-sighted has looked at it.

## Hebrew

| | |
|---|---|
| «כולל עובדי רימא», «ללא עובדי רימא» | the owner's |
| «עובדי רימא בטבלה» (the group's spoken name) | proposed |
| «כל העובדים בכל אתר, כולל עובדי רימא - כמו בחיוב.» | proposed |
| «העובדים שלך בלבד, בלי עובדי רימא.» | proposed |
| «תאריך», «סה״כ יומי» | proposed (the foot is the invoice's own «סה״כ ימי עובד־אתר») |

All pinned word for word in tests/sitegrid.test.mjs §4 and tests/sitegrid.browser.mjs §1-2.

## Pinned expectations moved, and why

Each because a second table now lives inside `.report-invoice`:

1. **tests/smoke.mjs** - eleven selectors `.report-invoice thead|tbody|tfoot` now say
   `.report-invoice .invoice-grid …`: the paper's grid, which is what each of those checks
   describes. No expected value changed.
2. **tests/rima.browser.mjs** - «בלי עובדי רימא»'s section: "it is drawn and on the screen" is now
   "in the document, whole, and put away on the screen". Every other check of that section
   (its order, title, columns, cells, total, the workbook's sheet, hidden on paper) is as it was.
3. **tests/reports.speed.test.mjs**, **tests/speed.seed.mjs** + **tests/speed.test.mjs**,
   **tests/speed.browser.mjs** - the comparisons of «דוחות» with an older build's bytes take the
   one new block out, count it, and require it to have been there (one new check in each).
4. **tests/screens.mjs** - one more screen, «reports - by site, «ללא עובדי רימא»», so the large
   display's ruler walks both states.

Not moved, and met instead: tests/reportsclarity.browser.mjs holds everything under «לפי אתר»
at 16px, and tests/largetext.browser.mjs holds wrapped text at 1.4 - the block's sizes were
raised to them.

## The runs, on `cf59ba0`

| | |
|---|---|
| `npm test`, step by step | 118 steps: **116 green, 15,180 of 15,182 checks**. The two red are the stamp lag - tests/build.test.mjs «nothing in the shell has changed since» and tests/gate.integrity.test.mjs §4 - because three cached files changed and the stamps were, by instruction, not moved. They go green in the commit that moves the stamps. |
| tests/sitegrid.test.mjs | 36 / 36 |
| tests/sitegrid.browser.mjs | 121 / 121 |
| the browser suites that pin this page | rima 150, reportsclarity 193, yosefgeves 157, sitecard 135, reports 109, smoke 1,186, print 94, mobile 1,397, design 72, largetext 9,950, reportnames 258, account-view 74, polish 201, owes 589, monthsummary 88, speed 100 - all green; with sitegrid, **17 suites, 14,874 of 14,874** |
| tests/speed.season.test.mjs | 94 / 94 |
| NOT run | the rest of `test:all`, `test:release`, the emulator suites |

## Pictures

`/tmp/claude-0/-home-user-farkad/d6a64352-db1a-5c3b-b54d-5c09103f2419/scratchpad/shots/sitegrid/`
(written by `SITEGRID_SHOTS=<dir> node tests/sitegrid.browser.mjs`; synthetic names; eight
sites, 01-17/11; on 03/11 אלעד is 5 with and 4 without, אילון 5 and 3):

- `1-with-rima-375-light.png`, `2-without-rima-375-light.png` - the block on a 375x812 phone
- `3-scrolled-sideways-date-stays-375-light.png`
- `4-320-large-display.png` - 320x568 with «תצוגה גדולה»

## For the release (v208)

Move the three stamps; add the «מה חדש» item and the docs/releases.md entry; a CLAUDE.md
sentence. Suggested «איפה»: «דוחות» ← «לפי אתר», מתחת לעמודות האתרים. No rollout rule: nothing is
written, nothing new is stored.
