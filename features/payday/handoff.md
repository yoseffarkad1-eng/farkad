# «יום תשלום» (payday) - handoff

- **Branch:** `feat-payday`, worktree `/home/user/farkad/.claude/worktrees/feat-payday`.
- **Base:** `6ab193d68c960e4a56d947673c282b867acd258f` (origin/main when the track was cut, v204).
  `origin/main` has moved since: it is `8b8f807` (v205) - see «Fix round 3» and «For the integrator».
- **Final code commit:** `a372a92` (fix round 1). `e9ce62b` is the repair of the review of
  2026-11-19 (the section «Fix round 1» below); `a372a92` adds two checks to `tests/payday.test.mjs`
  and nothing else (the look's place, finding 7). **Fix rounds 2 and 3 changed no code, no test and
  no stamp** (their sections below). Fix round 3's runs are the whole `npm test` chain one step at
  a time and this track's browser suite, both on `6a53bb5` (fix round 2's last commit, which changes
  only this file after `a372a92`), and two stamp probes in a throwaway clone. The round before fix
  round 1 ended at `73ca0e0`.
- **Final commit:** the one that updates this file for fix round 3 and nothing else - no file the
  app serves or a suite reads (every `features/` path a suite names is in a comment, and `sw.js`
  caches none) - so the results below are the final commit's.
- **Contract:** `features/payday/contract.md`, REVISION 2 (2026-11-19). The track was built on
  revision 1, then reconciled with revision 2 in `682a253` and `b030d53` (below).
- **Not pushed, no PR.** The three build stamps, `js/ui/whatsnew.js`, `docs/releases.md` and
  `CLAUDE.md` are untouched (the integrator's).

## Fix round 3 - the same three reds, sent back again (2026-11-19)

The independent verifier ran the suites on `6a53bb5` and sent back the same ONE finding, P1
«verification failures», with the same three checks as fix round 2 (the table there). Its own
evidence calls each of them the stamp lag the contract (§Base) expects, says that its stamp probe -
the three stamps moved v204 → v206 in one commit on a throwaway clone - turned them green (build
69/69), and that no test was weakened and no protected file touched. Its fix line asks for every
listed check to pass without weakening a test or touching a protected file. Triaged in the manner
of `.claude/skills/triage`: **CONFIRMED - the three checks are red on this branch, reproduced - and
LEFT: the one change that turns them green is a commit moving the three build stamps, which the
task's hard rules («Do not move the build stamps … the integrator does those») and the contract
(§Base) leave to the integrator.** No code, no test and no stamp changed this round.

Each point checked again on `6a53bb5`, not carried over from fix round 2:
- **Reproduced, and only these three.** In this worktree, clean tree: `node tests/build.test.mjs`
  **67/69**, exit 1; `node tests/gate.integrity.test.mjs` **19/20**, exit 1 - the three checks of
  fix round 2's table, word for word. The whole `npm test` chain on `6a53bb5` (under «Test output»):
  109 steps, **13,181 of 13,184 checks**, and the three are the ones that failed.
- **No green exists on this branch that keeps the rules.** Both checks are iron law 5 read off
  git: the commit that last WROTE each stamp line (`git log --first-parent -m -1 -S <line>`), then
  any shell file changed after it - the files whose bytes differ from it at HEAD
  (tests/build.test.mjs:462-525) and the commits since that touched one
  (tests/gate.integrity.test.mjs:253-334). Neither has an allowlist, a seam or a variable a branch
  could set (build.test.mjs even takes every `GIT_*` out of git's environment, :438). Two kinds of
  tree pass them: one whose last shell change is followed by a commit that moves the three stamps -
  forbidden here - and one with no shell change since v204, which is this branch without its
  feature. Neither was made, and no test was touched.
- **Nothing outside the track moved.** `git diff 6ab193d..6a53bb5` is the 17 files of «Files
  changed against the base» and no protected path (the list in fix round 2); the stamp lines read
  v204 at the base and at `6a53bb5`; the hunks in `index.html`, `js/app.js`, `sw.js`,
  `js/ui/modal.js` and `js/ui/owes.js` are the ones «Every hook in an existing file» names.
- **Probe A - one stamp commit is all this branch needs** (`payday-fix3/stamp-probe.sh` in the
  scratchpad, its logs beside it): a throwaway CLONE - a repository of its own, so no branch or
  worktree of this one was touched, nothing was pushed or fetched back into it, and it was deleted
  afterwards - at `6a53bb5`. Before: build **67/69**, gate-integrity **19/20**, the same three
  checks. After ONE commit moving the three stamps v204 → v206 together (`index.html`, `js/app.js`,
  `sw.js`, one line each): **build 69/69 and gate-integrity 20/20, both exit 0.**
- **Probe B, new this round - the tree the integrator will build.** `origin/main` moved after the
  track was cut: it is `8b8f807` now (v205, PR #86, the update at the next launch; 18 files,
  among them `index.html`, `js/app.js`, `sw.js`, `css/large.css`, `package.json` and
  `tests/README.md`). In the same throwaway clone (`origin/main` read out of this repository into
  a ref of the clone; this repository was only read), `8b8f807` with `6a53bb5` merged onto it:
  - **two conflicts, each two additions at one place**, resolved by keeping both sides
    (`payday-fix3/resolve-merge.mjs`, which refuses unless each side is exactly that):
    `package.json` - in `"test"` v205 inserted `npm run test:autoupdate` and this track appended
    `npm run test:payday` at the end, so main's line with ` && npm run test:payday` appended; the
    hunk carries `"test:all"` with it, which v205 left as it was and this track appended
    `npm run test:payday-browser` to, so this track's line. `css/large.css` - both sides added a
    block straight before the sheet's closing `}`: v205's `.launch-cover` rule, then this track's
    `@media (max-width: 359px)` rule. `index.html`, `js/app.js`, `sw.js` and `tests/README.md`
    merge by themselves.
  - before a stamp commit: the same three reds (gate-integrity now names the merge commit); after
    ONE commit moving the three stamps **v205 → v206**: **build 69/69, gate-integrity 20/20,
    tests/payday.test.mjs 285/285, tests/largetext.test.mjs 107/107** (it reads css/large.css as
    text), **tests/usual.test.mjs 150/150** (the design layer's block order) **and
    tests/autoupdate.test.mjs 76/76** (v205's own suite) - each exit 0. No browser suite was run on
    the merged tree: that is the integrator's gate.
- **This track's own suites on `6a53bb5`:** `test:payday` **285/285** inside the chain;
  `tests/payday.browser.mjs` **1040/1040**, exit 0 (124 s of its own, after 29 minutes queued for a slot).

For the workflow: the finding has now come back twice with the same three checks and the same
evidence. On this branch they are red BY CONSTRUCTION until the integrator's stamp commit, so a
verification that counts them answers `allGreen: false` whatever a fix round does; a fix round
could change that only by breaking the rule that forbids it.

## Fix round 2 - the verifier's three reds (2026-11-19)

The independent verifier ran the suites on `6aeacb2` and sent back ONE finding, P1 «verification
failures»: three checks red, each of which its own report marks as the red this contract expects.
Triaged in the manner of `.claude/skills/triage`: **reproduced, and ALREADY HANDLED - discarded,
not fixed.** No code, no test and no stamp changed this round.

| check (suite) | on `6aeacb2` | what it measures |
|---|---|---|
| «the stamps were moved by the commit that moved the bytes» :: «and nothing in the shell has changed since» (tests/build.test.mjs) | red: «7 changed since 6ab193d6: css/design.css, css/large.css, index.html, js/app.js, js/ui/modal.js, js/ui/owes.js, js/ui/payday.js» | iron law 5 read off git: the commit that last wrote the three stamp LINES (`git log -S`), then any shell file changed after it |
| the same :: «and neither has the worker that names the shelf» (tests/build.test.mjs) | red: «sw.js» (its `SHELL` entry) | the same, for the worker |
| §4 «no cached file has changed since the three stamps last moved» (tests/gate.integrity.test.mjs) | red: `e9ce62b`, `682a253`, `17452d1` | the same law, as a list of commits |

Why it is not a fault of this branch - each point checked on the tree, not taken from the contract:
- **It is the red the contract names, and only that.** «Expected red on this branch, and only
  this: tests/build.test.mjs «the stamps were moved by the commit that moved the bytes» (and its
  sw.js line) and tests/gate.integrity.test.mjs §4» (contract, §Base). The run under «Test output»
  holds the «only»: of the chain's 13,184 checks, these three are the ones that failed.
- **Green here needs one of two things, and both are ruled out.** The three stamps moved - which
  the task's hard rules and the contract (§Base: «MUST NOT be touched: … the three stamps») give to
  the integrator, who ships the four tracks together as v206 - or the feature taken out. Neither
  was done; no test was weakened, and none was touched.
- **What moved is this track's, and nothing else.** `git diff 6ab193d..6aeacb2` touches the shell
  in exactly the seven files named and `sw.js`, each hunk one the contract names (the table «Every
  hook in an existing file»); the stamp lines read v204 at the base and at `6aeacb2`; the commits
  that touch the shell are exactly the three §4 names, all this track's; no protected path
  (js/model, js/sync, js/state.js, js/store.js, js/recovery.js, firestore.rules, functions,
  firebase.json, .github, docs/releases.md, CLAUDE.md, js/ui/whatsnew.js, js/ui/offline.js,
  js/ui/reports.js, js/ui/weeklyclose.js, another track's files) is in the diff.
- **The proof that the reds are the stamp lag and nothing else** (`payday-fix2/stamp-probe.sh` in
  the scratchpad, its four logs beside it): a throwaway CLONE of the repository - a repository of
  its own, so no branch or worktree of this one was touched, nothing was fetched back, and it was
  deleted afterwards - at `6aeacb2`. Before: build **67/69**, gate-integrity **19/20**, the same three
  checks. After ONE commit that moves the three stamps v204 → v206 together, as the integrator
  will: **build 69/69 and gate-integrity 20/20, both exit 0.**

For the workflow: on this branch those three checks are red BY CONSTRUCTION until the integrator's
stamp commit. A verification that counts them answers `allGreen: false` whatever this track does,
and no fix round can change that without breaking the rule that forbids it.

## Fix round 1 - the review of 2026-11-19

Triaged in the manner of `.claude/skills/triage`: every finding opened at its cited line and
reproduced on this tree - the reviewer's probes copied into the scratchpad and pointed at this
worktree (`payday-fix/probes`), or the fact read off the code where it is structural. **All 17
CONFIRMED; none discarded.** Two parts are the owner's to rule on and are left, their defaults kept.
Every repair has a check that ran RED on `96f8d88` (an archive of it, `payday-fix/before`) and
GREEN on `e9ce62b`.

| # | finding | sev | outcome | the check |
|---|---|---|---|---|
| 1 | the kept reading ignores a deduction chosen on «דוחות» after the first opening | P1 | **fixed** - the key a reading is kept under is `owesKey` AND the session's `REPORT_DEDUCTIONS` | P14 «opened again after the choice: the sheet's band…» (red: 4250/-600/3650 against the sheet's 4250/-200/4050), the chosen line, the choice taken back |
| 2 | check a frozen into the kept reading | P2 | **fixed** - asked whenever the desk is drawn (`paydayLive`), never kept; `render()` draws the kept reading again when it changes; while the desk is open it watches the sync line (`#storageNotice`), which a status changes without a `render()` | P14 «a render() under the open desk…», «reopened while offline…», back in sync; B16 «the sync line changing under the open desk…» (red: a stayed) |
| 3 | «כל הניכוי שהדוח מציע…» on a closed card, and beside a chosen deduction | P2 | **fixed** - said only when every man something comes off is an open account at the sheet's proposal; a closed man named closed (`closedOne`/`closedMany`, the sheet's «החשבון נסגר ולא ישתנה» with the name); the chosen line only of an open account | P15 (both closed; a choice), P17 (one closed, one open) |
| 4 | «אין מה לסדר» while «לסגירה» lists men «סגירת שבוע» will not close | P2 | **fixed** - every held man no check names gets a check of his own (kind `held`), in «סגירת שבוע»'s sentence, with the door to what stops him (an earlier period: v195's «הצג את החשבון …»; no rate: the roster; over-settled: his advances; otherwise his account); `nothing` is never true while one is held | P16 (a) ראמז on 26/11, (b) זיאד on 18/11, his door pressed |
| 5 | four guards survive mutation | P2 | **fixed** - four fixtures | P17 (a group nobody can price; a weekly man absent Mon-Wed; a man closed at 07:30), P15 (the chosen line on no other card); the review's four mutations each red now |
| 6 | the count line on a group nobody can price | P3 | **fixed** - the sheet's «סה״כ» (`PAYDAY_REUSED.total`) | P17 (1), `bandsAgree` on that record |
| 7 | the CSS block inside «סגירת שבוע»'s, in both sheets | P3 | **fixed** - both blocks moved after the whole of «סגירת שבוע»'s family (its dialog and «איפוס מקדמות»'s pieces); still the layer's last dashed block | P11 (`a372a92`): the desk's block holds no rule of that family and theirs none of the desk's, in both sheets (red on the archive: design `[true,true,false,false]`, large `[true,true,false]`); tests/usual.test.mjs (its pin unchanged, its comment corrected), tests/largetext.test.mjs |
| 8 | three cards on one payday: the sentence twice, «לשתי הקבוצות» | P3 | **fixed** - once, under the last card of that date, `sameDay(n)` (replaces `bothGroups`, whose «הם» had nothing to refer to) | P18 three cards ending 26/11 |
| 9 | `checks` never holds `forgotten` | P3 | **fixed** - h is the last entry of `checks`, as the contract's interface says; `facts.forgotten` is gone (nothing read it) | P18, P4 |
| 10 | a money figure broken across lines at doubled text | P1 | **fixed** - a figure is one piece (`white-space: nowrap`), a label breaks between its words only, the two smaller figures share a line only at their natural width (`flex: 1 1 auto`), otherwise one under the other | B18 at 320, 375 and 440, the mode off and on: every figure (cards' and each man's) on one line, every label word whole, each count with its word |
| 11 | after a commit under a scrolled desk, the dialog goes blank | P2 | **fixed** - the placeholder sticks to the top of the glass (`.payday-reading-held`); the keyboard waits on the title and goes back to its own control after the read | B17 «meanwhile «מחשב…» is on the glass» (red: at -188..-162 on a glass of 12..655), the keyboard checks |
| 12 | Thursday morning: check d's fact 14 times, a red list 12 screens tall | P2 | **fixed** - «לסגירה» counts the men check d names in ONE line in check d's look (`heldToday`); no «אין עכשיו חשבונות לסגור» above held men; a red line a man only for the other reasons | P16 (c); B15 (red: the held sentence 13 times, a red list, «אין עכשיו…»); B12's Thursday desk at every phone, scheme and mode |
| 13 | the morning after payday drops the period just ended | P3 | **LEFT - the owner's ruling.** The contract scopes the desk to the NEXT payday; «לסגירה» still counts that period's men and its door is «סגירת שבוע», which offers the period with every figure. Showing a passed payday's card is a design change (a second reading per group, new words) | - |
| 14 | Hebrew: (a) «1 עובדים … אותם … להם»; (b) «הם» with no antecedent; (c) the past-tense «נוכה מהשכר» on a future payday; (d) «סה״כ לתשלום · 3» over «עובדים» | P3 | (a) **fixed** (`unpricedOne`); (b) **fixed** (`sameDay`); (d) **fixed** (the count and its word in one `nowrap` span, the text the sheet's character for character); (c) **LEFT - the owner's ruling**: it is the sheet's own column name, borrowed so that the desk reads as the sheet does | P4, P11, P18, B18 |
| 15 | at 320 with the mode the first screen shows the lead and no «לתשלום» | P3 | **fixed** - the lead cut to its one sentence and drawn LAST; «so far» said once, under the cards | B12 «as it opens, the first card's «לתשלום» is on the glass», every phone, scheme and mode (red: 652..701 on a glass ending at 556) |
| 16 | the keyboard falls to `<body>` after a re-read; the «מקדמות» door only shuts the desk; two «לפי עובד» of one name | P3 | **fixed** - the control found again by its key (`data-focus`); the door lands on «מקדמות»'s men, the search centred on the glass and the keyboard on the first man (never on the search: a phone's keyboard would cover the list); each fold named `לפי עובד · <cycle> · <dates>`, the open one ringed | B17, B15 «h: the men's list…», B16 fold names, B12 the ring |
| 17 | `tests/screens.mjs` walks the desk only on Tuesday's owes record | P3 | **fixed in part** - 'every check' and 'a record nobody approved' added to the walk; the THURSDAY desk is measured in B12 on a page of its own at every phone, scheme and mode instead, because a period ends on a Thursday only (a boundary is a Friday) and the walk's clock is a Tuesday for every screen after it | tests/largetext.browser.mjs walks the two; B12 the Thursday desk and the unapproved desk to every floor |

**Red before, green after - the runs** (logs in `/tmp/claude-0/-home-user-farkad/d6a64352-db1a-5c3b-b54d-5c09103f2419/scratchpad/payday-fix/`):
- Node, this round's `tests/payday.test.mjs` on the archive of `96f8d88`: **215/259** - every check of
  P14-P18 red (and the moved pins), `node-before.log`; on `e9ce62b`: **283/283**; on `a372a92`, with
  the two placement checks of P11 (their logic run on the archive's sheets: red), **285/285**.
- Browser, the new checks of B12 (at 320 with the mode), B15, B16 and B17 on the archive: all red,
  `browser-before.log` - the first «לתשלום» at 652..701 on a glass ending at 556, the fold unmarked,
  Thursday's «לסגירה» with no line, a red list and the held sentence 13 times, «מקדמות» landing nowhere,
  the folds of one name, the sync line not followed, the placeholder at -188..-162 on a glass of
  12..655, the keyboard on `<body>`.
- Browser, B18 alone on the archive: **43/55**, `browser-before-b18.log` - «6400», «28040» and «-1500»
  broken across lines at 320, «26540» at 320 with the mode, «28040» and «-1500» at 375, «מהשכר» broken
  in its middle; on `e9ce62b` the whole suite **1040/1040**.

**Found on the way, and repaired:** the `close` of this track's two screens in `tests/screens.mjs`
ran an arrow in the page that named `owesRecordBack` - a function only the Node side has. It
threw, the walk forgives a close that throws, and the owes record was never taken back for the
screens after them. Each close now hands the page the function itself (`run(page, fn)`).
(The same pattern stands in the base's own 'reports - «שים לב», opened' entry; not this track's,
not touched.)

**Mutations** (each put into `js/ui/payday.js` alone, `tests/payday.test.mjs` run, the file restored
and compared byte for byte - `payday-fix/mutate.sh`):

| mutation | result |
|---|---|
| `const priced = true;` (the review's survivor 1) | 279/283 - P17 (1) red |
| check d without `attendanceDays > 0` (survivor 2) | 282/283 - P17 d red |
| check d without the `frozenPeriodFor` filter (survivor 3) | 282/283 - P17 d red |
| the chosen line whenever `REPORT_DEDUCTIONS` has any entry (survivor 4) | 282/283 - P15 «no other card» red |
| the key without the chosen deductions | 280/283 - P14 red |
| check a kept with the reading | 281/283 - P14 red |
| the full-deduction line whenever something comes off | 281/283 - P15 red |
| the held men never checked | 280/283 - P16 red |
| the men check d names listed in «לסגירה» again | 280/283 - P16 (c) red |

**Interface, changed (for the integrator; nothing outside this file reads it):** `paydayFacts().checks`
now ends with `{ kind: 'forgotten' }` and may hold `{ kind: 'held', workerId, held }`; checks carry
the men they name (`workerId` or `workers`; b also `from`/`to`); `close.held[]` carries `kind`, `from`,
`to`; `close.say` is null when nobody can be closed and somebody is held; `facts.forgotten` is gone.
Track `status` uses only `openPayday()` and `PAYDAY_TEXT.entry`, both unchanged.

## Commits (oldest first)

| commit | what |
|---|---|
| `bf315ca` | features/payday/contract.md: the contract (revision 1) |
| `17452d1` | the feature: js/ui/payday.js, its row on «מקדמות», the frame, the hooks, the look |
| `64c52bb` | tests/payday.test.mjs (Node, `test:payday` in `npm test`) |
| `45ad689` | tests/payday.browser.mjs (`test:payday-browser` in `test:all`), tests/screens.mjs, tests/reports.speed.test.mjs, tests/README.md, package.json |
| `682a253` | revision 2: the contract copy, js/ui/payday.js and the Node suite reconciled |
| `b030d53` | revision 2 on the glass: the board's move measured, the doors' task, `midEdit()` |
| `73ca0e0` | tests/usual.test.mjs: the design layer's block order names «יום תשלום»'s block last (the one existing pin moved; why below) |
| `96f8d88` | features/payday/handoff.md (the round reviewed) |
| `e9ce62b` | fix round 1: js/ui/payday.js, css/design.css, css/large.css, the two suites, tests/screens.mjs, tests/usual.test.mjs (a comment), tests/README.md |
| `a372a92` | tests/payday.test.mjs: the look's place held in P11 (finding 7) |
| `6aeacb2` | features/payday/handoff.md, updated for fix round 1 |
| `f72d724` | features/payday/handoff.md, updated for fix round 2 - no code, no test, no stamp |
| `6a53bb5` | features/payday/handoff.md: fix round 2's run of this track's browser suite |
| (this one) | features/payday/handoff.md, updated for fix round 3 - no code, no test, no stamp: the runs on `6a53bb5`, the two stamp probes, the merge onto v205 |

## Files changed against the base (`git diff --stat 6ab193d a372a92`)

```
 css/design.css               |   74 +++
 css/large.css                |   37 ++
 features/payday/contract.md  |  374 +++++++++++
 features/payday/handoff.md   |  581 ++++++++++++++++
 index.html                   |   22 +
 js/app.js                    |    3 +
 js/ui/modal.js               |    2 +
 js/ui/owes.js                |    7 +-
 js/ui/payday.js              | 1041 +++++++++++++++++++++++++++++
 package.json                 |    6 +-
 sw.js                        |    1 +
 tests/README.md              |    4 +-
 tests/payday.browser.mjs     |  930 ++++++++++++++++++++++++++
 tests/payday.test.mjs        | 1506 ++++++++++++++++++++++++++++++++++++++++++
 tests/reports.speed.test.mjs |   44 +-
 tests/screens.mjs            |   77 +++
 tests/usual.test.mjs         |    8 +-
 17 files changed, 4708 insertions(+), 9 deletions(-)
```
(Fix round 1 alone, `git diff --stat 73ca0e0 a372a92`: 9 files changed, 1665 insertions(+), 242 deletions(-).
After `a372a92` only this file changed: in `6aeacb2` for fix round 1, in `f72d724` and `6a53bb5`
for fix round 2, and in the final commit for fix round 3.)

One line each:
- `js/ui/payday.js` (new) - the desk: the reading (`paydayFacts`), its memory, the dialog, the doors, every word.
- `js/ui/owes.js` - `renderOwesInto` only: the weekly button's line becomes the row `div.owes-actions` («יום תשלום», then «סגירת שבוע» when it is drawn); a build without payday.js draws what it drew.
- `js/ui/modal.js` - one `MODAL_CLOSERS` row: `paydayModal: () => closePayday()`.
- `js/app.js` - one line in `render()`: `if (typeof renderPaydayIfOpen === 'function') renderPaydayIfOpen();`.
- `index.html` - the frame `#paydayModal` (title `#paydayTitle` tabindex -1, body `#paydayBody`, «סגור» `#paydayClose`) after `#advanceResetModal`, and `<script src="js/ui/payday.js">` straight after advancereset.js. The `farkad-build` meta is untouched.
- `sw.js` - `'./js/ui/payday.js'` in `SHELL` after advancereset.js. `VERSION` untouched.
- `css/design.css` - ONE commented block inside `@media screen`, after the whole of «סגירת שבוע»'s block (its frame, its dialog and «איפוס מקדמות»'s pieces of it - fix round 1 moved it out of the middle of that block): the half-width row, then the dialog. No colour of its own (the money ink, the warn/danger hints, the accent ring and the group marks are the sheet's tokens).
- `css/large.css` - block 3: every size, weight and line-height of that block restated one for one with the original's importance, after the «איפוס מקדמות» restatements (moved with it); block 4: at 320 with the mode the three figures stand one under the other (`@media (max-width: 359px)`).
- `tests/payday.test.mjs`, `tests/payday.browser.mjs` (new) - the two suites.
- `tests/screens.mjs` - four screens after 'advances - one closure' (scope `#paydayModal`), opened by the row on «מקדמות»: 'read' and 'the fold opened' on `owesRecord`, and (fix round 1) 'every check' and 'a record nobody approved' on `paydayRecord` (in memory, taken back whole); each close hands the page the function that takes the record back.
- `tests/reports.speed.test.mjs` - the two deliberate additions (below).
- `tests/usual.test.mjs` - the order of the design layer's last blocks names «יום תשלום»'s fifth and last (below); fix round 1 corrected only the comment that said where the block stood.
- `package.json` - `test:payday` (end of `npm test`), `test:payday-browser` (end of `test:all`).
- `tests/README.md` - the two rows; the reports-speed row's v206 sentence.
- `features/payday/contract.md` - revision 2 of the contract, copied in.

## Migrations and data

None. No record field, no field path, no writer, no Store key, nothing queued or synced, no
preference. The desk's only state is memory (`PAYDAY_KEPT`, `PAYDAY`), forgotten by a reload.
Held by tests: P10 (the whole disk, `device.dump()`, byte for byte across the reading, the opening,
a redraw, every door and the closing, gate open, gate shut, Thursday morning); P11 (no `Store.*`,
`localStorage`, `State.commit/save`, `closePeriodChanges`, `saveFinancialAction`, `recordAdvance*`,
`appendLedgerEntry`, `alert/confirm/prompt`, `window.print` in the code); in the browser the disk
compared before and after the desk on every page, every door, the writer-gate pages and the
in-memory unapproved record. The only key any door writes is the payslips' own
(`farkadPayslipsProgress`), written by `openPayslips` itself, and B15 holds those bytes equal to what
the payslips' own entry in «הפקת דוח» writes.

## Every hook in an existing file

| file | hook |
|---|---|
| js/ui/owes.js `renderOwesInto` | `const payday = typeof paydayEntryButton === 'function' ? paydayEntryButton() : null; const row = payday ? el('div', 'owes-actions') : box; if (payday) { row.appendChild(payday); box.appendChild(row); } if (weekly) row.appendChild(weekly);` |
| js/ui/modal.js `MODAL_CLOSERS` | `paydayModal: () => closePayday(),` |
| js/app.js `render()` | `if (typeof renderPaydayIfOpen === 'function') renderPaydayIfOpen();` after the advance-reset line |
| index.html | the `#paydayModal` frame; the script tag after advancereset.js |
| sw.js | `'./js/ui/payday.js'` in `SHELL` |
| css/design.css, css/large.css | the blocks above |

`js/ui/reports.js`, `js/ui/weeklyclose.js`, `js/ui/closereminder.js`, `js/ui/payslips.js`,
`js/ui/monthsummary.js` and `js/ui/offline.js` are read, never changed. Nothing in `js/model`,
`js/sync`, `js/state.js`, `js/store.js`, `js/recovery.js`, `firestore.rules`, `functions`,
`firebase.json` or `.github`.

## Where every figure comes from (no money worked out here)

| on the desk | the function that answers it |
|---|---|
| the groups | every man's `periodRangeFor(worker, today)`, keyed by its cycle, from and to, ordered as `payrollAccountGroups` orders them (the sheet's meeting order, then weekly first, then by date) |
| a group's rows | `payrollRowsOver(from, to, gate, id => group.has(id))` - what «דוחות» draws for those men on its default |
| «נצבר», the deduction, «לתשלום» | `payrollBandTotals(rows)`: `gross`, `taken`, `net`; «—» where the sheet prints no money in the band (no man with money and no day, and nobody with a daily rate: `payrollGroupTable`'s `anyRate`) |
| the deduction's name | `deductionColumnName(rows)` |
| the count line | `סה״כ לתשלום · countedIn(paid, 'עובד אחד', 'עובדים')`, `paid` = rows with `amount !== null` |
| each man's figure | `moneyOf(row).net`, «—» for null |
| «לסגירה» | ALWAYS read by the desk: `weeklyCloseRead(State.schedule, today, at)`, counted by `closeReminderCount(read)`; the held men `read.men` with `held`, each in `weeklyCloseHeldText(man)`; the line `CLOSE_REMINDER_TEXT.line(count)` or `WEEKLY_CLOSE_TEXT.nobody`; never `CLOSE_REMINDER_KEPT` |
| check a | `weeklyCloseReadyWord()` |
| check b | `owesWarnings(owesReadNow())` kind `'unclosed'`, worded by `owesWarningWords` (the board's own reading of this moment; `owesRead(schedule, today)` for another day) |
| check c | rows with `amount === null && attendanceDays > 0`, said by `MONTH_SUMMARY_TEXT.unpriced(n, names)` |
| check d | men who worked in a period that ends today, not frozen (`frozenPeriodFor`), and `!weeklyCloseTodayRecorded(...)` - the men «סגירת שבוע» holds «נגמרת היום» (P4 holds the two sets equal) |
| check e | `overpaymentWarning(row.carry)` |
| check f | rows with `hoursUnpriced`, said by `HOURS_UNPRICED_NOTE` without its leading «* » |
| check g, `held` (fix round 1) | each man of `weeklyCloseRead(...).men` with `held` that no check above names, said in `weeklyCloseHeldText(man)`, his door by `held.kind` |
| a closed man on a card (fix round 1) | `row.carry.closed` - the sheet's «החשבון נסגר ולא ישתנה» with his name |
| the full-deduction line (fix round 1) | every row with `moneyOf(row).netted < 0` an open account (`row.carry && !row.carry.closed`) with no `REPORT_DEDUCTIONS` entry |
| the days recorded ahead | `entriesFor(schedule, date, id, 'actual')` for the dates after today inside the period |

The one thing the file adds up is a COUNT of men a sentence names. Two groups paid on one date
are never added: two cards, and the sentence that says they are not.

## Every new string (PROPOSED - the owner has not read them; pinned word for word in tests/payday.test.mjs P11)

`PAYDAY_TEXT`, js/ui/payday.js (24 entries since fix round 1; every function said in P11):

| key | words |
|---|---|
| entry | יום תשלום |
| title | יום תשלום |
| lead | המסך הזה רק מראה - שום דבר לא נרשם ממנו. (fix round 1: cut to its one sentence and drawn last; it took six lines above the cards at 320 with the mode) |
| next | יום התשלום הבא |
| none | עוד אין רישומים בתקופה הנוכחית. |
| heading | `${day} ${date} · ${cycle}` (e.g. «יום חמישי 19/11 · שבועי») |
| today | «היום, » (before the heading of a card whose period ends today) |
| soFar | לפי מה שנרשם עד עכשיו. ימים ומקדמות שעוד לא נרשמו - לא נכללים. (fix round 1: said once, under the cards) |
| fullDeduction | הסכום לתשלום הוא אחרי כל הניכוי שהדוח מציע. ניכוי קטן יותר בסגירה - יותר לתשלום, עד הנצבר. |
| ahead | `כולל ימים שכבר נרשמו מראש: ${dates}.` |
| chosen | לחלק מהעובדים נבחר בדוח ניכוי אחר, והוא כלול כאן. «סגירת שבוע» מתחילה מהניכוי המלא. |
| closedOne | `החשבון של ${name} נסגר ולא ישתנה.` (fix round 1: the sheet's «החשבון נסגר ולא ישתנה» with the name - P11 holds it to that sentence) |
| closedMany | `החשבונות של ${count} עובדים נסגרו ולא ישתנו: ${names}.` (fix round 1) |
| sameDay | for two: «ביום הזה משלמים לשתי הקבוצות. לכל קבוצה הסכום שלה - שני הסכומים לא מחוברים כאן.»; for more: `ביום הזה משלמים ל-${count} קבוצות. לכל קבוצה הסכום שלה - הסכומים לא מחוברים כאן.` (fix round 1: replaces bothGroups) |
| before | לפני שסוגרים |
| unpricedOne | `⚠️ עובד אחד בלי שכר יומי, ולכן הסכום חסר אותו: ${name}. הוסף לו שכר במסך "עובדים ואתרים".` (fix round 1: the sheet's sentence for many, said of one; two or more still borrow `MONTH_SUMMARY_TEXT.unpriced`) |
| endsTodayOne | `התקופה של ${name} נגמרת היום, והיום עוד לא נרשם לו.` (revision 2: «סגירת שבוע»'s `heldEndsToday` with the name - P11 holds it to that sentence) |
| endsTodayMany | `התקופות של ${count} עובדים נגמרות היום, והיום עוד לא נרשם להם: ${names}.` (revision 2: plural throughout) |
| toToday | לרישום היום |
| nothing | אין מה לסדר לפני הסגירה. |
| forgotten | מקדמה שניתנה ולא נרשמה לא תנוכה. רושמים אותה לפני שסוגרים. |
| toClose | לסגירה |
| heldToday | «עובד אחד לא ייסגר עד שיירשם לו היום.» / `${count} עובדים לא ייסגרו עד שיירשם להם היום.` (fix round 1) |
| after | אחרי הסגירה |

BORROWED, each found in its owner's source by P11 (a word changed there and not here fails by
name): `PAYDAY_REUSED` - «נצבר», «לתשלום», «סה״כ לתשלום», «סה״כ» (fix round 1: the band's first cell where nobody has a rate), «עובד אחד», «עובדים», «לפי עובד», the
transition sentence «תקופת מעבר: הימים שנשארו מהמחזור הקודם, לפני המעבר לתשלום שבועי.» (js/ui/reports.js),
«עובדים ואתרים», «מקדמות», «סגור» (index.html), «₪», «—» (reports.js); and the owners' constants
read by name: `WEEKLY_CLOSE_TEXT.reading/.nobody/.stateHeld`, `weeklyCloseHeldText`,
`weeklyCloseReadyWord()`, `CLOSE_REMINDER_TEXT.line/.open`, `MONTH_SUMMARY_TEXT.unpriced`,
`PAYSLIPS_TEXT.entry`, `OWES_TEXT.closures/.advancesOf`, `OWES_REUSED.checkFirst`,
`OTHER_ACCOUNT_SHOW`, `HOURS_UNPRICED_NOTE` (without its «* »), `PAY_CYCLE_LABELS`, `owesWarningWords`,
`overpaymentWarning`. No word claims money handed over or a message sent («נשלח», «שולם», «נמסר»,
«שילמת» are absent); no Arabic letter in the file (P11; tests/reportnames.test.mjs green).

## Tests added

**tests/payday.test.mjs** (Node, harness devices with a DOM that holds text, records written by
the app's own writers; synthetic names):
- P1 each card's three figures equal, as text, the band «דוחות» draws for that group on its
  default in the Node DOM (the work table's footer, or «סיכום התקופה»), in the sheet's order,
  gate open, gate shut and with a deduction chosen on the sheet.
- P2 each man's figure is `moneyOf` of the sheet's row (both gates); on Thursday it is
  `weeklyCloseFigures(man, man.max).net` for every man «סגירת שבוע» offers - EXCEPT (revision 2)
  a man with 200 chosen on the sheet: his figure is the sheet's under the choice (2,200), «סגירת
  שבוע» starts from the full 600 (1,800), and his card carries the line «לחלק מהעובדים נבחר בדוח
  ניכוי אחר…».
- P3 «לסגירה» = `closeReminderCount(weeklyCloseRead)`, the held men and their reasons; (revision 2)
  the section drawn BYTE FOR BYTE the same with a fresh `CLOSE_REMINDER_KEPT` and without one, on
  three records (two of them with held men); payday.js never names `CLOSE_REMINDER_KEPT`.
- P4 every check fires on its fixture and is silent on the clean crew; its words; every drawn door
  pressed: it calls no writer and leaves the disk byte for byte; (revision 2) a door to a dialog
  calls its opener in the task of the press, a door to anything else has run NOTHING of its target
  when that task ends and arrives in the next.
- P5 a week walked Friday to Thursday and a fortnight's Thursday.
- P6 the reading inside `reportReadOnce`/`weeklyCloseOnce` equals the bare one; the report's
  filter, range and deductions and every swapped function back after a throw.
- P7 the gate asked at most once a reading, never planned on an approved record.
- P8 the cost (seasons D and B, medians printed; «מקדמות» reads nothing of the file; an unmoved
  record read once; a moved record re-read after 1.5 s).
- P9 gate shut / unapproved: plain bands, no a, b, e, «מקדמות»'s sentence.
- P10 the whole disk byte for byte across everything.
- P11 the words; the frame, the script's place, the shell, the closer, the hook.
- P12 the row on «מקדמות»; the button alone where «סגירת שבוע» is not; a build without the file
  node for node as before.
- P13 (revision 2) the transition sentence only on a stub weekly pay follows; a weekly man back to
  fortnightly on the fortnight's second Friday: a transition, not `toWeekly`, no sentence - drawn.
- P14-P18 (fix round 1) - the table in «Fix round 1» above, check by check; and in P11 the look's
  place in both sheets (`a372a92`). 285 checks in all now.

Negative tests: every check is asserted silent on the clean crew and the "nothing to sort"
sentence said there; the gate-shut and unapproved readings assert the absence of a, b, e and of
sections 4-5. **Mutations run in this session** (each put into js/ui/payday.js, the suite run, the
file restored and compared byte for byte with the kept copy):
1. view doors run in the same task → 3 checks red (P4: the view doors, «סגירות שנרשמו», «לרישום היום»);
2. the transition sentence for any stub → 2 checks red (P13);
3. «לסגירה» taken from a fresh `CLOSE_REMINDER_KEPT` → 3 checks red (P3, both records with held men, and the name check).
(Earlier, before revision 2, the suite's mutations were run as well; one survived - check b
without its gate guard - because `owesWarnings` itself answers nothing unless the board is
folded, so the guard is redundant there, not untested.)

**tests/payday.browser.mjs** (real Chromium, emulated touch; the crew tests/screens.mjs seeds and
that record changed in memory only):
- B12 at 320x568, 375x667, 440x956 × dark, light × mode off, on: the row (one row first in the
  board, «יום תשלום» then «סגירת שבוע», half each, 48px (52) tall, words inside); the board under
  it unmoved, 18px at 320 with the mode; «סגירת שבוע» at full width without the file and STILL
  OPENING FROM THE ROW at its title, writing nothing; the desk read, unfolded and with every check,
  every floor; and (revision 2) the record's approval taken off in memory: «יום תשלום» alone at the
  board's full width, the board's move measured and equal to the row.
- B13 the tap paints «מחשב את החשבונות…» with no figure in the next frame; the figures within
  1,500 ms; equal as text to the bands «דוחות» draws.
- B14 a build without the file: «מקדמות» rectangle for rectangle as the base commit draws it
  (`git archive 6ab193d`, served beside and verified blob for blob).
- B15 every door tapped on Thursday 12/11 landing where it says; the payslips census; (revision 2)
  the timing of every door recorded in the page and the keyboard on the pay sheet's group heading
  after «הצג את החשבון…», never on a node of the shut desk.
- B16 Escape, the backdrop, «סגור» (and a redraw underneath) give the keyboard back to
  `#paydayEntry`; Tab kept inside; the fold by Enter and Space; (revision 2) `midEdit()` true while
  the desk is open, false once shut.
- B17 a commit under the open desk.
- B18 every font doubled at 320 and 440.
- B20 (revision 2) the writer gate shut through the test seam (`FARKAD_FLAG_OVERRIDES = {
  ledgerWrites: false }` before the scripts load) at every phone, scheme and mode: «יום תשלום»
  alone, its words inside, the board's move measured and equal to the row, the desk opening from it.
- B19 nothing threw.
- Fix round 1, added inside the blocks above: B12 the first «לתשלום» on the glass as the desk opens,
  the open fold ringed, the Thursday desk (today typed for nobody) and the desk on a record nobody
  approved each to every floor; B15 Thursday's «לסגירה» and the «מקדמות» door's landing; B16 the
  folds' names and check a following the sync line; B17 the placeholder on the glass and the
  keyboard kept; B18 at 320, 375 and 440 with the mode off and on, every figure on one line.

## Expectations moved, and why

**In existing suites: one pin moved, on purpose - `tests/usual.test.mjs`** (commit `73ca0e0`): it
holds the usual site's look whole by naming every css/design.css block after it, in order, and
requiring nothing after the last; the suite moved that list for each feature that added a block at
the end of the layer (four times, each said in its comment). «יום תשלום»'s block is where its
contract puts it - straight after the `.weekly-close-entry` rule, the end of the layer - so the list
names it fifth and last in the same words; on the base's design.css that check now fails, as each
earlier move made it. Not in the contract's list of touched suites: the contract did not foresee
it. **For the integrator:** every other track that adds a block at the end of css/design.css meets
the same check, and the merged list must name each block in the merged order.

`tests/reports.speed.test.mjs` gained exactly the two additions
the contract names: (1) the row `div.owes-actions` on «מקדמות» (which v195 never drew) is taken out
of the byte comparison as ONE node and counted (`device.paydayRows`, required once on every draw of
the board in every reading of the gate, never on «דוחות» or a man's page, never in v195), with the
«סגירת שבוע» button inside it still counted as `WEEKLY_ENTRY` (`device.weeklyEntries` unchanged per
draw); (2) `WAYS_IN` gains `['«יום תשלום»', 'paydayFacts(todayStr(), "<TODAY>T15:00:00.000Z");']`,
counted like every other way in. `tests/screens.mjs` gained the two screens the contract names.

**In this track's own suites, for revision 2 (commit `682a253`, the reason in its message):** check
d's two pinned sentences («החשבון של … נגמר…» → «התקופה של … נגמרת…», «התקופות של N עובדים
נגמרות…») in P4 and P11, and check f's pinned sentence without its leading «* » in P4.

**Fix round 1 (commit `e9ce62b`, the reasons in its message), in this track's own suites only:**
P4 - check c for one man in the singular (`unpricedOne`), and h read from `checks`; P5 - «so far»
no longer a line of each card, and the same-day sentence's new words; P11 - `PAYDAY_TEXT`'s new and
changed entries (24, every function said), `PAYDAY_REUSED.total`, the lead drawn last; B18 widened
to 375 and the mode. **No pinned expectation of an existing suite moved this round:**
`tests/usual.test.mjs` - only the comment that said where the block stood; `tests/screens.mjs` -
two screens added and this track's closes repaired (no expectation lives there).

## Test output (pasted; every line is that suite's own last count line, its exit code and its time)

Run on this machine, shared with other agents building at the same time; browser suites one at a
time through the slot wrapper (`scratchpad/bt`), Node suites one by one in the chain's order (the
chain itself is `&&`, and the expected red of `test:build`, its third step, would stop it there
and hide the other 106). The build round's outputs (on `73ca0e0` and `b030d53`) are in this
file's history (`git show 96f8d88:features/payday/handoff.md`), fix round 1's `npm test` (on
`e9ce62b`) and its run of the three suites that read `a372a92`'s change in
`git show 6aeacb2:features/payday/handoff.md`, and fix round 2's `npm test` (on `6aeacb2`: the same
109 steps, the same 13,181 of 13,184 and the same two reds) and browser run (on `f72d724`) in
`git show 6a53bb5:features/payday/handoff.md`. Below: fix round 3's `npm test` and this track's
browser suite, both on `6a53bb5`; then fix round 1's other browser suites, on `e9ce62b`, whose
served bytes `6a53bb5` carries unchanged.

### `npm test`, suite by suite, on `6a53bb5` (fix round 3; clean tree before and after)

```
HEAD 6a53bb5130e7f19ac480d3b15f0f629214d97e4e status[0]
test:isolation | exit 0 | 1s | 18/18 checks passed
test:blobs | exit 0 | 0s | 11/11 checks passed
test:build | exit 1 | 1s | 67/69 checks passed
test:poison | exit 0 | 0s | 37/37 checks passed
test:merge | exit 0 | 1s | 28/28 checks passed
test:contested | exit 0 | 15s | 73/73 checks passed
test:held | exit 0 | 4s | 83/83 checks passed
test:snapshot-stale | exit 0 | 2s | 16/16 checks passed
test:reports-rules | exit 0 | 1s | 26/26 checks passed
test:finance | exit 0 | 6s | 57/57 checks passed
test:weekly-range | exit 0 | 0s | 21/21 checks passed
test:finance-wording | exit 0 | 2s | 12/12 checks passed
test:weekly-unpriced | exit 0 | 0s | 23/23 checks passed
test:receipt | exit 0 | 2s | 28/28 checks passed
test:data | exit 0 | 42s | 1970/1970 checks passed
test:recovery | exit 0 | 1s | 82/82 checks passed
test:adversarial | exit 0 | 6s | 116/116 checks passed
test:probes | exit 0 | 7s | 35/35 checks passed
test:capacity | exit 0 | 10s | 48/48 checks passed
test:concurrency | exit 0 | 3s | 46/46 checks passed
test:exports | exit 0 | 0s | 112/112 checks passed
test:fence | exit 0 | 3s | 35/35 checks passed
test:fence-ingress | exit 0 | 0s | 43/43 checks passed
test:fence-legacy | exit 0 | 0s | 21/21 checks passed
test:money-history | exit 0 | 1s | 9/9 checks passed
test:money-units | exit 0 | 0s | 21/21 checks passed
test:money-cloud | exit 0 | 1s | 17/17 checks passed
test:money-display | exit 0 | 1s | 4/4 checks passed
test:snapshot-poison | exit 0 | 2s | 82/82 checks passed
test:samefact | exit 0 | 4s | 37/37 checks passed
test:wording | exit 0 | 1s | 37/37 checks passed
test:closure | exit 0 | 18s | 122/122 checks passed
test:closure-echo | exit 0 | 1s | 79/79 checks passed
test:correction | exit 0 | 0s | 33/33 checks passed
test:quarantine | exit 0 | 2s | 82/82 checks passed
test:approval | exit 0 | 7s | 72/72 checks passed
test:repayment | exit 0 | 4s | 240/240 checks passed
test:ledger-ingress | exit 0 | 0s | 167/167 checks passed
test:cas | exit 0 | 12s | 88/88 checks passed
test:status | exit 0 | 6s | 37/37 checks passed
test:money | exit 0 | 2s | 40/40 checks passed
test:money-ingress | exit 0 | 10s | 206/206 checks passed
test:method | exit 0 | 3s | 51/51 checks passed
test:restore | exit 0 | 0s | 51/51 checks passed
test:upgrade | exit 0 | 2s | 48/48 checks passed
test:vehicles | exit 0 | 2s | 86/86 checks passed
test:xlsx | exit 0 | 1s | 104/104 checks passed
test:nonassertions | exit 0 | 1s | 23/23 checks passed
test:labels | exit 0 | 0s | 23/23 checks passed
test:labelcache | exit 0 | 0s | 32/32 checks passed
test:restore-ledger | exit 0 | 2s | 26/26 checks passed
test:roster-upgrade | exit 0 | 6s | 55/55 checks passed
test:roster-race | exit 0 | 7s | 63/63 checks passed
test:exports-proof | exit 0 | 1s | 92/92 checks passed
test:ledger-truth | exit 0 | 4s | 148/148 checks passed
test:races | exit 0 | 5s | 109/109 checks passed
test:overlap-restore | exit 0 | 20s | 117/117 checks passed
test:refute-roster | exit 0 | 10s | 24/24 checks passed
test:refute-restore | exit 0 | 42s | 25/25 checks passed
test:gate-integrity | exit 1 | 1s | 19/20 checks passed
test:queuecost | exit 0 | 4s | 18/18 checks passed
test:paycycle | exit 0 | 0s | 43/43 checks passed
test:paycycle-blockers | exit 0 | 3s | 17/17 checks passed
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
test:rima | exit 0 | 91s | 496/496 checks passed
test:yosefgeves | exit 0 | 93s | 562/562 checks passed
test:seder | exit 0 | 1s | 135/135 checks passed
test:bars-stale | exit 0 | 0s | 60/60 checks passed
test:transport | exit 0 | 1s | 566/566 checks passed
test:transport-share | exit 0 | 12s | 304/304 checks passed
test:oracle | exit 0 | 40s | 121/121 checks passed
test:overpayment | exit 0 | 4s | 105/105 checks passed
test:polish | exit 0 | 0s | 73/73 checks passed
test:daycheck | exit 0 | 5s | 169/169 checks passed
test:journey | exit 0 | 1s | 233/233 checks passed
test:workercard | exit 0 | 22s | 180/180 checks passed
test:monthsummary | exit 0 | 71s | 98/98 checks passed
test:payslips | exit 0 | 23s | 202/202 checks passed
test:find | exit 0 | 1s | 91/91 checks passed
test:whatsnew | exit 0 | 0s | 160/160 checks passed
test:account-view | exit 0 | 18s | 456/456 checks passed
test:usual | exit 0 | 1s | 150/150 checks passed
test:sitecard | exit 0 | 2s | 119/119 checks passed
test:reportsclarity | exit 0 | 3s | 1119/1119 checks passed
test:largetext | exit 0 | 0s | 107/107 checks passed
test:reportnames | exit 0 | 10s | 36/36 checks passed
test:holiday | exit 0 | 1s | 109/109 checks passed
test:undo-stale | exit 0 | 1s | 32/32 checks passed
test:auditfix | exit 0 | 2s | 34/34 checks passed
test:owes | exit 0 | 61s | 190/190 checks passed
test:weeklyclose | exit 0 | 106s | 146/146 checks passed
test:reports-speed | exit 0 | 167s | 167/167 checks passed
test:closeorder | exit 0 | 0s | 22/22 checks passed
test:closuresize | exit 0 | 11s | 13/13 checks passed
test:closerace | exit 0 | 38s | 29/29 checks passed
test:advancereset | exit 0 | 44s | 77/77 checks passed
test:overpaidfix | exit 0 | 1s | 85/85 checks passed
test:xlsxlook | exit 0 | 7s | 293/293 checks passed
test:closereminder | exit 0 | 12s | 107/107 checks passed
test:payday | exit 0 | 28s | 285/285 checks passed
DONE status[0]
```

109 steps: 107 exit 0, 2 exit 1; **13,181 of 13,184 checks passed**; 1,199 s of the steps' own
time, on a machine at a load of 2 to 5 on 4 CPUs (the other tracks' browser suites beside it).
`test:payday` 285/285 is `a372a92`'s suite.

**Red, and only the three checks the contract expects** (the build stamps are the integrator's; the
section «Fix round 3» proves, on this commit and on the tree merged onto v205, that a stamp commit
alone turns them green):

```
test:build
  the stamps were moved by the commit that moved the bytes :: and nothing in the shell has changed since  — 7 changed since 6ab193d6: css/design.css, css/large.css, index.html, js/app.js, js/ui/modal.js, js/ui/owes.js, js/ui/payday.js
  the stamps were moved by the commit that moved the bytes :: and neither has the worker that names the shelf  — sw.js

test:gate-integrity
  the build stamps describe the bytes a phone would be handed :: no cached file has changed since the three stamps last moved  — e9ce62bb «יום תשלום»: fix round 1 - the review of 2026-11-19, every c | 682a2539 «יום תשלום»: revision 2 of the contract, reconciled | 17452d10 «יום תשלום»: the payday desk (js/ui/payday.js), its row on «
```

### The stamp probes (fix round 3): a throwaway clone, deleted afterwards

```
A. at 6a53bb5
   before the stamp commit:                                 build 67/69 exit 1 | gate-integrity 19/20 exit 1
   after ONE commit moving the three stamps v204 -> v206:   build 69/69 exit 0 | gate-integrity 20/20 exit 0
B. at 8b8f807 (origin/main, v205) with 6a53bb5 merged onto it - package.json and css/large.css
   conflicted, each resolved by keeping both sides; nothing else conflicted
   before the stamp commit:                                 build 67/69 exit 1 | gate-integrity 19/20 exit 1
   after ONE commit moving the three stamps v205 -> v206:   build 69/69 exit 0 | gate-integrity 20/20 exit 0
                                                            payday.test 285/285 | largetext.test 107/107
                                                            usual.test 150/150 | autoupdate.test 76/76 (each exit 0)
```

### Browser suites

**Fix round 3, on `6a53bb5`** (the commit before the final one; it changes nothing after
`a372a92` but this file) - this track's suite, through the slot wrapper, on a clean tree:

```
payday.browser.mjs | exit 0 | 124s of its own (1881s with 29 minutes queued for a slot) | 1040/1040 checks passed
```

Its measurements are fix round 1's again: the board under the row unmoved at 320, 375 and 440 with
the mode off and at 375 and 440 with it on, 18px at 320 with the mode; where «סגירת שבוע» is not
drawn, 12 × 62px and 12 × 66px, each equal to the row; tap to figures 27 ms (budget 1,500).

**Fix round 1, on `e9ce62b`** - this track's suite, then the existing suites fix round 1 touches:
`largetext.browser.mjs` walks `tests/screens.mjs` (two screens added, the closes repaired) and
measures every rule of `css/large.css`; `design.browser.mjs` reads the whole design layer (a block moved in it);
`owes.browser.mjs` draws «מקדמות» with the row; `weeklyclose.browser.mjs` draws «סגירת שבוע», whose block
the desk's no longer sits inside. (The chain of the last four started while this file was modified -
`status[1]` - and this file is read or served by no suite.)

```
payday.browser.mjs | exit 0 | 416s | 1040/1040 checks passed
largetext.browser.mjs | exit 0 | 948s | 8569/8569 checks passed
design.browser.mjs | exit 0 | 10s | 72/72 checks passed
owes.browser.mjs | exit 0 | 66s | 589/589 checks passed
weeklyclose.browser.mjs | exit 2 | 37s | SETUP FAILED: 375 light the result: something is on the page to measure
weeklyclose.browser.mjs (again, alone) | exit 0 | 183s | 408/408 checks passed
```

`weeklyclose.browser.mjs`'s first run went red at «the dialog is gone and «מקדמות» shows the close»
(`["week","none"]`): that block taps «סגור» and then taps it again with `force: true` after the dialog
has shut, so the second press lands on whatever is under it - here the week tab - and the app's
double-tap guard swallows it only inside its few hundred milliseconds; under this machine's load the
gap was longer. Nothing of this track is on that path (the desk is shut there, and its watch on the
sync line exists only while it is open). Run again alone through the wrapper: 408/408, exit 0.

Not run in fix rounds 2 and 3: every existing browser suite. Neither round changed anything, and no
file the app serves has changed since `e9ce62b`, where fix round 1 ran the four above; the
independent verifier ran its own list on `6aeacb2` (largetext, mobile, design, smoke and the suites
the contract names) and ran the suites again on `6a53bb5`, and each report lists no failure but the
three stamp checks. Not run on the tree merged onto v205 (fix round 3, probe B): any browser suite - that
is the integrator's gate, on the merged tree with the stamps moved. Not run in fix round 1:
`smoke.mjs` and `mobile.test.mjs` (they never open the desk; they ran green on the build round's
bytes, and fix round 1 changes no rule outside the desk's own block but its place). Not run in any
round: the rest of `test:all`, `test:release` and the emulator suites (the task forbids them on
this shared machine).

## Measured

- **The row on «מקדמות» where «סגירת שבוע» is drawn:** the board under it moves 0px at 320, 375
  and 440 with the mode off and at 375 and 440 with it on; 18px at 320 with the mode (both words
  wrap to two lines), both buttons 48px tall (52 with the mode), words inside. Base rectangles of
  the board equal to the base commit's with the file taken away (B14). Unchanged by fix round 1.
- **Where «סגירת שבוע» is NOT drawn** (revision 2, criterion 12): «יום תשלום» alone at the board's
  full width, and the board moves down by that row and nothing more - **62px (the button 48 + the
  row's gap 14) with the mode off, 66px (52 + 14) with it on, at 320, 375 and 440, in both schemes,
  on a record nobody approved and with the writer gate shut alike** (24 measurements printed by the
  run on `e9ce62b`: 12 × 62px, 12 × 66px).
- **The reading's cost** (Node, P8, the median of three; budgets 600 ms and 8,000 ms), on `e9ce62b`
  run alone on the shared machine: season D (40 men, 139 advances, 236 closes, closed in order)
  **332 ms** (470, 332, 264); season B (40 men, 636 advances, nothing closed) **3,567 ms** (3,758,
  3,567, 3,518). The previous round measured 241-474 ms and 2,989-3,708 ms under the same load.
  Fix round 2, on `6aeacb2` inside the chain (the machine at a load of 4 to 8): season D **236 ms**
  (225, 236, 282), season B **2,633 ms** (2,835, 2,633, 2,566). Fix round 3, on `6a53bb5` inside
  the chain (a load of 2 to 5): season D **230 ms** (233, 230, 227), season B **2,877 ms** (2,897,
  2,779, 2,877).
- **Tap to figures** on the seeded crew (B13): **44 ms** (budget 1,500 ms); the placeholder and no
  figure in the frame after the tap. Fix round 2, on `f72d724`: **25 ms**. Fix round 3, on `6a53bb5`: **27 ms**.
- **Fix round 1:** at 320 with the mode the first card's «לתשלום» now stands at 449..498 on a glass
  that ends at 556 (it was 652..701); the Thursday desk at 375 is 4.4 screens tall (it was 7); with
  every font doubled no figure of the desk is drawn on two lines at any phone, the mode off or on.

## Screenshots (synthetic names, JPEG)

Left by `node tests/payday.browser.mjs --shots <dir>` on `e9ce62b` (that run: 1040/1040, exit 0),
the crew tests/screens.mjs seeds and the record with every check changed in memory - synthetic names:

- `/tmp/claude-0/-home-user-farkad/d6a64352-db1a-5c3b-b54d-5c09103f2419/scratchpad/feat-payday/fix1/payday-row-440x956-dark.jpg` - the row on «מקדמות»
- `/tmp/claude-0/-home-user-farkad/d6a64352-db1a-5c3b-b54d-5c09103f2419/scratchpad/feat-payday/fix1/payday-desk-440x956-dark.jpg` - the desk as it opens: the cards first, «so far» once under them
- `/tmp/claude-0/-home-user-farkad/d6a64352-db1a-5c3b-b54d-5c09103f2419/scratchpad/feat-payday/fix1/payday-checks-440x956-dark.jpg` - «לפני שסוגרים» with every check (check c in the singular)
- `/tmp/claude-0/-home-user-farkad/d6a64352-db1a-5c3b-b54d-5c09103f2419/scratchpad/feat-payday/fix1/payday-desk-320x568-dark-large.jpg`, `/tmp/claude-0/-home-user-farkad/d6a64352-db1a-5c3b-b54d-5c09103f2419/scratchpad/feat-payday/fix1/payday-desk-320x568-light-large.jpg` - the desk at 320x568 with «תצוגה גדולה»: the first «לתשלום» on the first screen
- `/tmp/claude-0/-home-user-farkad/d6a64352-db1a-5c3b-b54d-5c09103f2419/scratchpad/feat-payday/fix1/payday-checks-320x568-dark-large.jpg`, `/tmp/claude-0/-home-user-farkad/d6a64352-db1a-5c3b-b54d-5c09103f2419/scratchpad/feat-payday/fix1/payday-checks-320x568-light-large.jpg` - its checks there
- `/tmp/claude-0/-home-user-farkad/d6a64352-db1a-5c3b-b54d-5c09103f2419/scratchpad/feat-payday/fix1/payday-doubled-320x568.jpg`, `/tmp/claude-0/-home-user-farkad/d6a64352-db1a-5c3b-b54d-5c09103f2419/scratchpad/feat-payday/fix1/payday-doubled-320x568-large.jpg` - every font doubled at 320, the mode off and on: each figure whole, one under the other

## NOT DONE, and why

- **Not tried on a real phone.** Emulated touch in Chromium only; no iPhone, no far-sighted reader.
- **`npm run test:all`, `npm run test:release` and the emulator suites were not run** - the task
  forbids them on this shared machine. Fix round 1: the npm test chain ran suite by suite on
  `e9ce62b`, and the browser suites its changes touch (this track's, largetext, design, owes,
  weeklyclose) one at a time through the slot wrapper. The previous round also ran smoke, mobile,
  closereminder, payslips, whatsnew, forms, polish, advancereset, overpaidfix and simple-advances
  (green); they were not run again in fix round 1, which changes no rule outside the desk's own
  block but its place in the two sheets. Fix round 2, which changed nothing: the npm test chain step
  by step on `6aeacb2` and this track's browser suite on `f72d724`; no existing browser suite again
  (no served byte moved after `e9ce62b`). Fix round 3, which changed nothing either: the npm test
  chain step by step and this track's browser suite, both on `6a53bb5`, and the two stamp probes;
  no existing browser suite again (no served byte moved after `e9ce62b`), and no browser suite on
  the tree merged onto v205 (the integrator's gate).
- **Fix round 1 left two findings, or parts of them, to the owner** (13 and 14c in its table): the
  morning after payday, and the tense of «נוכה מהשכר» on a payday still ahead.
- **The three build stamps, the «מה חדש» entry, docs/releases.md and CLAUDE.md** are the
  integrator's; texts for them are below. Until the stamps move, `tests/build.test.mjs` (its stamp
  check and the sw.js line) and `tests/gate.integrity.test.mjs` §4 are red - expected, the contract
  says so; see the output above. Fix round 2 proved, in a throwaway clone, that one commit moving
  the three stamps turns both suites green (69/69 and 20/20) and that nothing else in them is red;
  fix round 3 proved it again on `6a53bb5` and on the tree merged onto v205 (stamps v205 → v206).
- **The owner has not read one word of it.** Every string is proposed.

## Known risks, observations, and open questions (each with the default kept)

1. **Where «סגירת שבוע» is not drawn the board moves down 62px (66 with the mode)** - on a record
   nobody approved, and on a build whose writer is shut. Default kept (revision 2): the desk is still
   drawn there, alone, because its plain bands are what he pays from. The owner may rule otherwise.
2. **The writer gate shut (a test-only build; `LEDGER_WRITES = true` ships):** the carry gate is
   open, so the cards and checks b and e are the new arithmetic, but «סגירת שבוע» has no list - and
   the desk then puts «מקדמות»'s own sentence (`OWES_REUSED.checkFirst`) in place of sections 4-5,
   as it does for a record nobody approved. No shipped build reaches this state; nothing was changed
   for it.
3. **The sheet's transition sentence is untrue for a man returning to fortnightly pay - pre-existing,
   in js/ui/reports.js (`groupPeriodNote`), which this track may not change.** It says «…לפני המעבר
   לתשלום שבועי.» for ANY period a boundary cut short; the desk (revision 2) says it only of a stub
   weekly pay follows, so for such a man the sheet and the desk now word the card differently, by
   design. A repair of the sheet is a separate decision.
4. **A group whose deduction comes only from a carried debt has no deduction column on the work
   table** (pre-existing sheet behaviour): the desk then shows the band's own «נצבר» less «לתשלום»
   under the deduction's name - P1 holds that difference to the band's two printed figures.
5. **A deduction chosen on the sheet this session is in the desk's figure** (it is what the sheet
   says) while «סגירת שבוע» starts from the full deduction; the card says so in one sentence
   (`chosen`). By design (revision 2, criterion 2).
6. **The cost.** About 3-3.7 s for season B (636 advances, nothing closed) on this machine, under
   the placeholder «מחשב את החשבונות…»; inside budget, measured, not optimised. Season D's median
   rose from 241 ms alone to 474 ms under this machine's heaviest load, against a 600 ms budget: a
   timing check that could go red only under load - re-run it alone before believing such a red.
7. **The key a reading is kept under** is owes.js's (`owesKey`: the write tick, today, both gates and
   the record as text), so while the desk is open each `render()` serialises the record once to ask
   whether it moved - the house rule (owes.js, closereminder.js, weeklyclose.js do the same) - and
   `PAYDAY_KEPT` holds one more record-sized string in memory.
8. **Choices inside the contract's words, stated:** check d names the men who WORKED in a period that
   ends today and is still open (P4 holds that set equal to the men «סגירת שבוע» holds «נגמרת היום»,
   and since fix round 1 P17 holds it on a man with no day and a man closed that morning);
   «סגירות שנרשמו» is offered only when a closure is on the record (`owesAnyClosure`); a band the
   sheet cannot price says «—», never 0, and the sheet's «סה״כ» (P17); the doors are data
   (`{ words, go, args }`) so that two readings compare as JSON.
9. **Fix round 1: the desk watches the sync line while it is open** (`paydayWatch`: a
   MutationObserver on `#storageNotice`, disconnected when the desk shuts), because a change of the
   phone's link changes that line and calls no `render()`. Each change costs one `paydayKey()` (the
   record serialised once) and draws again only when check a now says something else.
10. **Fix round 1: the Thursday desk is measured in B12, not in the screens' walk.** A period ends on
   a Thursday only (a pay-cycle boundary is a Friday) and the walk is a Tuesday for every screen;
   moving its clock would move the day rollover and the close reminder under every screen after it
   in `tests/largetext.browser.mjs`. B12 moves the clock of its own page and holds that desk to
   every floor at every phone, scheme and mode.
11. **The owner's two rulings, defaults kept (fix round 1, findings 13 and 14c):** the morning after
   payday the desk shows the NEXT payday, and the period just ended is reached through «לסגירה»
   («סגירת שבוע» offers it with every figure); and the deduction keeps the sheet's own column name
   «נוכה מהשכר» on a payday still ahead.
12. **A re-read under a stream of commits still waits for 1.5 s of quiet** (the close reminder's rule,
   as the contract says). Since fix round 1 the placeholder stands on the glass the whole time; a
   cap on the wait was considered and not added.
13. **The «מקדמות» door puts the keyboard on the first man of the list, never on the search field**,
   which would raise a phone's keyboard over the list it searches.

## For the integrator

**The three build stamps** are all this track's three red checks need (fix round 2's probe and
fix round 3's probe A: one commit moving them, and build 69/69, gate-integrity 20/20). Law 5 reads
git history, so in the merged tree that commit has to be the LAST one to touch a cached file - a
shell file changed after it turns the same checks red again, whichever track it belongs to.

**`origin/main` is v205 now, not v204** (`8b8f807`, PR #86, published after this track was cut at
`6ab193d`). Fix round 3's probe B merged `6a53bb5` onto it in a throwaway clone:
- **two conflicts, each two additions at one place - keep both sides:** `package.json` - `"test"`
  is v205's line (with `npm run test:autoupdate`) and ` && npm run test:payday` appended at its
  end; `"test:all"` is this branch's line (v205 left it as it was; this track appended
  `npm run test:payday-browser`). `css/large.css` - v205's `.launch-cover` rule, then this track's
  `@media (max-width: 359px) { :root.display-large .payday-figure … }`, both straight before the
  sheet's closing `}`. Everything else merges by itself (`index.html`, `js/app.js`, `sw.js`,
  `tests/README.md` included).
- **the stamp commit is v205 → v206** on that tree. After it: build 69/69, gate-integrity 20/20,
  tests/payday.test.mjs 285/285, tests/largetext.test.mjs 107/107, tests/usual.test.mjs 150/150,
  tests/autoupdate.test.mjs 76/76. No browser suite was run on the merged tree; the one of this
  track that meets v205 there is tests/payday.browser.mjs B16 - `midEdit()` true while the desk is
  open and false once it is shut, which v205's update at the next launch waits on (contract,
  revision 2, point 6).

**«מה חדש» item (PROPOSED):**
`{ title: 'יום תשלום', text: 'בעמוד המקדמות: כמה לשלם בכל קבוצה ביום התשלום הבא לפי מה שנרשם, ומה כדאי לסדר לפני שסוגרים.', where: 'מקדמות ← יום תשלום', go: 'payday' }`
- `go: 'payday'` only navigates: `OWES_PAGE = null; ADVANCE_WORKER = null; showView('advances')`,
  then focus `#paydayEntry` without pressing it («הראה לי» never opens a reading of money).

**Release entry (a draft for docs/releases.md):**

> ### «יום תשלום»: the moment before he pays, on one screen (candidate, not served)
>
> **Why.** The owner (2026-11-19) asked for real features that lift the app. His money pain is the
> one the app keeps answering piece by piece - periods nobody closed, deductions not taken, advances
> forgotten. What did not exist is the moment BEFORE he pays: on Wednesday night or Thursday morning
> he found each group's band at the bottom of its cards in «דוחות», and found out what would stop the
> close only when he pressed it.
>
> **What changed in the app: `js/ui/payday.js` (new), `js/ui/owes.js` (the weekly button's line in
> `renderOwesInto`), `js/ui/modal.js` (one closer), `js/app.js` (one line in `render()`),
> `index.html` (the frame and the script), `sw.js` (the shell), `css/design.css`, `css/large.css`.
> Nothing in `js/model`, `js/sync`, `js/state.js`, `js/store.js`, `js/recovery.js`,
> `firestore.rules` or `functions`; no key, no field path, no writer.**
>
> One button, «יום תשלום», beside «סגירת שבוע» on top of «מקדמות» (half the row each; alone at full
> width where «סגירת שבוע» is not drawn - a record nobody approved - and then the board moves down
> by that row, 62px, 66 with «תצוגה גדולה»). It opens ONE dialog: «יום התשלום הבא» - a card per pay
> group with its payday's date and the three figures «דוחות» prints under that group (`payrollRowsOver`,
> `payrollBandTotals`, `deductionColumnName`), each man's figure one tap away; «לפני שסוגרים» - what
> will stop or distort the close, each finding an existing function's answer in its owner's words,
> each with one button that only navigates - every man «סגירת שבוע» would hold among them, and
> «may this phone close now» asked each time the desk is drawn; «לסגירה» - how many «סגירת שבוע»
> would close now and who it holds and why, each reason said once, read by the desk itself; «אחרי
> הסגירה» - the payslips and the closes on record. A figure is never broken across lines, whatever
> the size of the letters; a deduction chosen on «דוחות» is in the desk's figures the moment it is
> chosen.
> It works no money out (the one thing it adds up is a count of men), writes nothing, closes nothing
> and opens nothing by itself; a weekly payday is never added to a fortnightly one. It reads inside
> the pay sheet's one reading (`reportReadOnce`) and «סגירת שבוע»'s memory (`weeklyCloseOnce`),
> after the dialog has painted «מחשב את החשבונות…», kept under the record (`owesKey`) and the
> deductions chosen on the sheet; a record that moves under it puts the placeholder over its figures
> at once - on the glass, wherever the dialog is scrolled to - and is read again when the draws stop.
> Every word proposed and pinned (tests/payday.test.mjs). NOT tried on a real phone.

**CLAUDE.md file-list lines (a draft):**

```
    js/ui/payday.js            v206: «יום תשלום» - the moment before he pays, one dialog from «מקדמות» beside
                               «סגירת שבוע»: each pay group's next payday and the three figures «דוחות» prints
                               under it (payrollRowsOver, payrollBandTotals), what will stop or distort the
                               close (each an existing function's finding, each with one door that only
                               navigates; a door to a view runs one task later), how many «סגירת שבוע» would
                               close now and who it holds (read here, never CLOSE_REMINDER_KEPT), the doors
                               after; inside reportReadOnce and weeklyCloseOnce, kept under owesKey and the
                               deductions chosen on «דוחות», read after paint; «may this phone close» asked at
                               every drawing, never kept; every man «סגירת שבוע» holds named before the close;
                               no money of its own, no key written; every Hebrew word in one block
    tests/payday.test.mjs      v206: the desk on devices - every card the band «דוחות» draws, each man's figure,
                               the count and the held men, every check and every door (and when it runs), a
                               week walked, the scopes, the gate, the cost, the gate shut, the disk byte for
                               byte, every word, the row on «מקדמות», the transition sentence
    tests/payday.browser.mjs   v206 in Chromium: the row at three phones, both schemes, the mode - the board
                               unmoved where «סגירת שבוע» is drawn and its move measured where it is not; the
                               tap and the band; a build without the file against the base; every door, its
                               task and the focus; the keyboard and midEdit(); a commit under it; the floors
```
