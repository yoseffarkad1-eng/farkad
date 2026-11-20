# Handoff — «בדיקת הצוות» (track `crewcheck`)

| | |
|---|---|
| Branch | `feat-crewcheck` (never pushed; no PR) |
| Worktree | `/home/user/farkad/.claude/worktrees/feat-crewcheck` (`node_modules` a symlink to `/home/user/farkad/node_modules`) |
| Base | `6ab193d68c960e4a56d947673c282b867acd258f` (origin/main, stamps v204 - not moved) |
| Fix round 1 | `12c8b4b` (the fix), `fcd830b`, `d54fad5` and `69fc168` (the browser suite, and a hold tried and taken back out - below) - the eleven findings of the review of `68c7ab7` triaged; ten fixed, each with a check that failed on `68c7ab7`'s app code and passes here; one left for the owner (below, "Fix round 1") |
| Fix round 2 | the verification of `6c1635d`: ONE finding, P1 «verification failures» - the three stamp-lag checks of tests/build.test.mjs and tests/gate.integrity.test.mjs that the contract's §Base expects, and nothing else red. CONFIRMED and LEFT: its one fix is a commit moving the three stamps, which the round's hard rules and the contract leave to the integrator. No byte of the app, of a suite or of the wiring changed - this file is the round's only change (below, "Fix round 2") |
| The suites ran on | fix round 2: `6c1635d`, the tree clean when the runs began - the `npm test` chain suite by suite (**107 of 109 green**, 13,063 of 13,066 checks; the two red the stamp lag) and tests/crewcheck.browser.mjs **544/544** through the slot wrapper; and two stamp probes in throwaway clones, one on this branch and one with this branch merged onto `origin/main` `8b8f807` (v205). Logs in `/tmp/claude-0/-home-user-farkad/d6a64352-db1a-5c3b-b54d-5c09103f2419/scratchpad/feat-crewcheck/fix2/`. The commit that carries this file changes nothing a suite reads or the app serves (every `features/` path a suite names is in a comment, and sw.js caches none), so these are the branch head's results. Fix round 1's runs, on its own commits, are under "Fix round 1"; its logs in `feat-crewcheck/fix1/`, the build round's in `feat-crewcheck/` |
| After it | this file's own commit (fix round 2), which changes this file and nothing else |
| Contract | `features/crewcheck/contract.md` - revision 2, byte for byte the program's `crewcheck/contract.md` (re-read from disk in fix rounds 1 and 2: unchanged, md5 `20880f09a718e70afedcc4d7e49d28d5`, last written 2026-11-19 17:35). Where fix round 1 departs from its words, the departure and its reason are below; the contract itself is the program's and is not edited here |

## Fix round 2 - the verification of `6c1635d`

The independent verifier ran the suites on `6c1635d` and reported ONE finding, P1 «verification failures»: three
checks of two suites, all three the stamp lag, and no protected file touched (`protectedTouched: []`). Triaged in the
manner of `.claude/skills/triage/SKILL.md`: both suites run again on this tree, and the code of each check read
(tests/build.test.mjs:482-525 with its `shellMovedSince`, :474-479; tests/gate.integrity.test.mjs:262-334).

| # | finding | sev. | verdict | outcome | the check |
|---|---|---|---|---|---|
| 1 | «verification failures» - tests/build.test.mjs «the stamps were moved by the commit that moved the bytes»: «and nothing in the shell has changed since» (6 files since `6ab193d6`: css/design.css, css/large.css, index.html, js/ui/crewcheck.js, js/ui/modal.js, js/ui/roster.js) and «and neither has the worker that names the shelf» (sw.js, its SHELL one line longer); tests/gate.integrity.test.mjs §4 «no cached file has changed since the three stamps last moved» (`0a500ec`, `12c8b4b`, `d54fad5`, `69fc168`) | P1 | CONFIRMED - reproduced on `6c1635d`, the tree clean: build **67/69**, gate-integrity **19/20**, exactly these three red (`fix2/build-head.out`, `fix2/gate-head.out`), and in the whole `npm test` chain nothing else (below). It is the contract's §Base "expected red on this branch, and only this" | LEFT - the integrator's stamp commit | the two stamp probes below: one commit moving the three stamps turns both suites wholly green, on this branch and on this branch merged onto today's `origin/main` |

**Why it is left.** Both checks put a question to git, not to the bytes: which commit last wrote each stamp line
(`git log -S`), and whether any shell file has changed since that commit (`git diff --name-only`,
`git log --first-parent`). Neither has an allowlist or a seam in the tree that a branch could use. This branch adds a
file to the shell, changes five more and makes the worker's SHELL a line longer, and the round may not move the
stamps, so the answer is "yes" on every commit of it from `0a500ec` on, whatever its code says. The one fix is a commit that moves the three stamps together -
`<meta name="farkad-build">` (index.html:109), `APP_VERSION` (js/app.js:7), `VERSION` (sw.js:24), iron law 5 - and
the round's hard rules ("do not move the build stamps ... the integrator does") and the contract's MUST NOT list (the
three stamps by line; js/app.js altogether) leave it to the integrator, who moves them once for the release that
ships this track. The two other ways to a green line - taking the feature's bytes back out of the shell, or loosening
either check - would make the line green and the branch wrong; neither is done, and no test was touched.

**What shows nothing else stands behind it - two stamp probes**, each in a throwaway clone in the scratchpad
(`git clone --shared --no-checkout` of this worktree, the commit checked out detached, `node_modules` a symlink to
`/home/user/farkad/node_modules`; a repository of its own - nothing of this one's branches, worktrees or refs written,
nothing fetched back):

- **A - this branch** (`fix2/stampprobe`): `6c1635d` and ONE commit on it that moves the three stamps v204 -> v205
  together and changes nothing else (3 files, 3 lines): tests/build.test.mjs **69/69** («nothing since 8d894fc7»),
  tests/gate.integrity.test.mjs **20/20**, exit 0 both (`fix2/build-stampprobe.out`, `fix2/gate-stampprobe.out`).
- **B - the tree the integrator will build** (`fix2/stampprobe-main`): `origin/main` has moved since the track was
  cut - it is `8b8f807` (v205, PR #86). `8b8f807` with `6c1635d` merged onto it: ONE conflict, package.json, one hunk
  holding `"test"` and `"test:all"`, two additions at one place - v205 appended `test:autoupdate` to `"test"` and left
  `"test:all"` as it was; this track appended `test:crewcheck` to `"test"` and `test:crewcheck-browser` to
  `"test:all"` - resolved by keeping both, v205's step first (`fix2/probeB-resolve.mjs`, which refuses unless each
  side is exactly that; the resolution in `fix2/probeB-resolution.diff`; `"test"` then has 110 steps).
  index.html, sw.js, css/large.css and tests/README.md merge by themselves. Before a stamp commit: the same three reds
  (gate-integrity names the merge commit). After ONE commit moving the three stamps **v205 -> v206**: build **69/69**,
  gate-integrity **20/20**, and the Node suites that read what this track changed - crewcheck **175/175**, largetext
  **107/107** (css/large.css as text), usual **150/150** (the design layer's blocks), find **91/91**, sitecard
  **119/119**, workercard **180/180**, polish **73/73**, reportnames **36/36**, holiday **109/109** - and v205's own
  autoupdate **76/76**; every one exit 0 (`fix2/probeB-*.out`). No browser suite was run on the merged tree: that is
  the integrator's gate.

**What changed in fix round 2:** this file, and nothing else. No byte of the app, of a suite or of the wiring moved,
so no check was added: there is no fix for a check to hold, and the two checks that fail are themselves the
instrument that says what is missing.

**For the integrator:** the stamp commit is all these two suites ask of this track - moved together, after the last
shell change of the merge, they go green with nothing else changed (probe B). The rest of the release's duties for
this track are under "For the integrator" below, unchanged. Trial merges of `6c1635d`, read in the throwaway clone
(`git merge-tree --write-tree`): onto `release-v206` `d2d4710` - conflicts in package.json and tests/README.md only, the
append-only pair (css/design.css, css/large.css, index.html, js/ui/modal.js, sw.js and tests/screens.mjs merge by
themselves); onto `v205-followup` `b76c727` and `origin/main` `8b8f807` - package.json only. None of the 46 top-level
names of js/ui/crewcheck.js is declared by any js file of `d2d4710`.

## Fix round 1 - the review of `68c7ab7`

Triaged in the manner of `.claude/skills/triage/SKILL.md`: each cited line opened, each probe of the review re-run
on this tree (`review-crewcheck/probes/norate.mjs`, `dualsim.mjs`) or measured again by a check of this track's own.

| # | finding | sev. | verdict | outcome | the check that failed before and passes now |
|---|---|---|---|---|---|
| 1 | «בלי שכר יומי - ימי העבודה שלו לא יחושבו בשכר» said of a man whose rate was cleared after his days were stamped (crewcheck.js:60/260) | P2 | CONFIRMED: five days stamped 400, rate cleared - the sentence, and `payrollReport` 2000 | fixed | Node §1 «no daily rate: the words true of what his recorded days carry»; the agreement on every seed (`noRate all w02` on the 'with findings' state before) |
| 2 | two numbers in one field, another country's first, filed as `otherPhone` (crewcheck.js:153) | P2 | CONFIRMED: `dualsim.mjs` gave `other` for three spellings, `bad` the other way round | fixed | Node §2: six dual spellings and the 15/16-digit boundary in the phone family; «a man with two numbers … counted, and the calm line does not stand» |
| 3 | the same sentence false on the program's own fixture (עלי חסן, 15 days at 410) | P2 | CONFIRMED - the defect of 1, on `screens.mjs`'s 'with findings' state | fixed by 1 | Node §3 agreement and §4 `WITH_FINDINGS` (moved, below); browser §11 «the pay sheet prices his days at their stamp all the same» |
| 4 | a typed number broken across lines on the glass (crewcheck.js:379/381/397) | P2 | CONFIRMED (the review's Chromium probe; and this suite's new check on `68c7ab7`'s code) | fixed | browser §15 «no typed number is broken across lines, and no «label: n» under the title», every phone, scheme and mode; Node §4 «a number … is drawn as one block» |
| 5 | `zeroStamped` says the days stay without an amount; the whole account period has no total (crewcheck.js:95) | P3 | CONFIRMED: `payrollReport` (money.js:273-291) nulls the row for one unpriced day | fixed | Node §1 «the account period that holds them has no accrued, the days at the new rate in it too»; §3 agreement per period (`periodRangeFor`) |
| 6 | two men with one name told apart only on «שם כפול» (crewcheck.js:342) | P3 | CONFIRMED: identical chips and labels on the never line | fixed | Node §4 «namesakes: one number each, the same on every line, and no two chips of one line alike» |
| 7 | «אי אפשר לפתוח לו הודעה בוואטסאפ» untrue of WhatsApp (crewcheck.js:85) | P3 | CONFIRMED: the refusal is the app's (seder.js:166-182) | fixed | Node §5 words |
| 8 | the line under the title broken inside «label: n» (crewcheck.js:47) | P3 | CONFIRMED (the review's probe; this suite's new check) | fixed | browser §15 (with 4); Node §4 «three blocks» |
| 9 | the men's «never» line has no subject (crewcheck.js:98) | P3 | CONFIRMED | fixed | Node §5 words |
| 10 | after a row door the way back to the button is the length of the crew screen (crewcheck.js:665) | P3 | CONFIRMED as measured - and as the contract designed it | LEFT | none: the contract allows nothing on the crew screen but the one button at its foot (Out of scope; Entry and navigation), and the review itself names it the owner's or the integrator's to decide - open question 7 |
| 11 | a slow second touch after the last site's door reopens the check from «בדיקת הצוות» (crewcheck.js:626) | P3 | CONFIRMED: the hold covered `.worker-active-toggle` and «שמור» only | fixed - the review's first option, every control of the two surfaces (`12c8b4b`); its second, the chip's own place on the whole page, was added in `d54fad5` on a misreading of a run and taken out in `69fc168` (below) | browser §13: 350/500/650 ms on «בדיקת הצוות» and «כרטיס אתר» after the last site's door, on «עוד פרטים» and «ביטול» after a form door; every slow trial now also checks that nothing opened but what the door opened and that the crew screen is still the view |

Before and after, on the same new checks: tests/crewcheck.test.mjs **149/175** on `68c7ab7`'s app code with the new
suite (`fix1/node-before.out`), **175/175** on `12c8b4b`; tests/crewcheck.browser.mjs **510/544** on a copy of `68c7ab7`'s app code with the final suites (`fix1/browser-before.out`: the 33 new checks red, and the copy's own «the origin served this commit», which has no git to read), **544/544** on `69fc168` (`fix1/browser-after.out`).

**What changed** (`js/ui/crewcheck.js`, `css/design.css`; nothing else of the app):

- **«בלי שכר יומי» in the words true of each man.** The reading counts, per `noRate` man, his recorded days whose
  stamp carries a daily rate (`priced`, from the one `ratesForDay` call the pass already made - a fact, no figure).
  The men with none keep the contract's sentence; a man with such days - his rate cleared after they were stamped -
  is told «בלי שכר יומי - ימי עבודה שיירשמו לו מעכשיו לא יחושבו בשכר:», because the sheet prices his stamped days
  (iron law 2). Two findings of kind `noRate` when both are there, the first sentence first. The kinds are the
  contract's; the reading's `noRate` entries gain `priced`.
- **One number per field.** Another country's number, as typed, must be ONE number: no second `+`, and at most 15
  digits after its prefix (ITU-T E.164: a whole international number, its country code included). Two numbers never
  fit in 15, so a dual-SIM field is `badPhone` whichever number comes first - mended in one field, as the contract
  says of two numbers. `CREW_CHECK_ONE_NUMBER_DIGITS = 15`.
- **What a line may not break inside.** Every typed number in a chip or a sentence (the LTR isolate) and each part of
  the line under the title is ONE inline block - `.crewcheck-whole` (`display: inline-block; max-width: 100%`,
  `.report-dates`' rule, css/app.css), the number also `.crewcheck-number` (`direction: ltr`) - so it goes to the next
  line whole, and wraps inside itself only where no line can hold it (320 px at doubled text, the house's rule,
  tests/account-view.browser.mjs:157). No size: nothing for css/large.css to say again. `textContent` and every label
  are the same characters as before.
- **The account period, said.** `zeroStamped` names what the sheet does: the account period that holds such a day has
  no accrued, even after a rate is typed - the sheet's own «בלי שכר יומי - הנצבר לא חושב» (reports.js:14).
- **Namesakes.** A name two or more active men hold carries «(n)», his place among them in the crew list's order, on
  every chip of his - in the words and read aloud - and «שם כפול …» ends «, ממוספרים לפי הסדר ברשימת העובדים:».
  The «שם כפול» chips say «(n)» where they said «· n» (which read like a chip's day or count).
- **The app, not WhatsApp; and a subject.** `otherPhone`: «… - האפליקציה לא תפתח לו / להם הודעה בוואטסאפ:».
  `never`: «עובד פעיל / עובדים פעילים בלי אף יום עבודה רשום:».
- **The hold covers what undoes a door.** For the same `DOUBLE_TAP_GUARD_MS` from the chip's own press, the house's
  `guardFingersOn` now holds every control of the crew screen (`button, input, select, summary` on `#rosterView` -
  «בדיקת הצוות» itself, the cards' buttons, «עוד ⋯», the switches, the search) and every button, fold and choice of the
  form (`button, summary, select` on `#workerFormModal` - «שמור», «ביטול», «עוד פרטים»), judged on each press's own
  time; a keyboard's click is never held, a box to type in is not held, and a press later than 700 ms is what it was.
  **Tried and taken back out:** `d54fad5` also held a press at the chip's own place on the whole page
  (`guardFingersOn(document.body, '*', …)`), read off the browser run on `fcd830b`, which had stopped after a slow touch
  at a site chip's place changed the screen. A probe of the page's own events (`fix1/probe/hold-probe.mjs` and `.out`)
  showed the suite's fault instead: the new lines had pushed that chip under the dialog's sticky foot, the raw first
  touch pressed «סגור», no door ran, and the second touch landed on the tab bar. On a phone the top bar is static and
  scrolls away, and the fixed tab bar lies under the sticky foot, never under a chip the dialog shows, so that hold
  answered nothing that can happen; `69fc168` takes it out (js/ui/crewcheck.js is `12c8b4b`'s again, byte for byte)
  and makes every trial bring its chip to the middle of the dialog and find it under the finger before the touch.

**Pinned expectations moved, on purpose, in `12c8b4b`** (its message says each):
- tests/crewcheck.test.mjs `WITH_FINDINGS` (§4) and §5: the five sentences and two new templates above; the «שם כפול»
  chips «· n» → «(n)»; the never chips carrying the marks.
- tests/screens.mjs 'with findings' (and its twin in the Node suite): w13, the second «וליד זועבי», gets
  `dailyRate = 0`, so that both sentences of «בלי שכר יומי» are drawn for the floors and a namesake is named on three
  lines. Taken back on closing with the rest, as before.
- tests/crewcheck.browser.mjs: `w_18` ('דוגמה 18', seeded at 470) has his daily rate cleared after his days were
  stamped - `noRate` twice in the kinds' order, and the second sentence on the glass. (`12c8b4b` had added a man,
  `w_21`, instead; run on `68c7ab7`'s app code that moved the rows standing above the sites at full scroll, and the
  existing trial «site door, on a man's «פעיל» on the glass» found no switch there at any gap - the crew screen's
  layout, which the fix does not touch. `fcd830b` makes an existing man the case, the crew screen row for row the
  build round's, and puts «עובדים פעילים: 19» back.)

**New and changed words (PROPOSED, pinned word for word in tests/crewcheck.test.mjs §5):**

| key | words |
|---|---|
| `noRateFromNow` (new; 1 / many) | בלי שכר יומי - ימי עבודה שיירשמו לו מעכשיו לא יחושבו בשכר: / בלי שכר יומי - ימי עבודה שיירשמו להם מעכשיו לא יחושבו בשכר: |
| `sameName` (changed) | שם כפול - ${count} עובדים פעילים בשם ${name}, ממוספרים לפי הסדר ברשימת העובדים: |
| `otherPhone` (changed; 1 / many) | מספר שאינו נייד ישראלי - האפליקציה לא תפתח לו הודעה בוואטסאפ: / מספרים שאינם ניידים ישראליים - האפליקציה לא תפתח להם הודעה בוואטסאפ: |
| `zeroStamped` (changed; 1 / many) | ימים שנרשמו לו בלי שכר יומי - בתקופת החשבון שלהם הנצבר לא יחושב, גם אחרי שיוזן שכר: / ימים שנרשמו להם בלי שכר יומי - בתקופת החשבון שלהם הנצבר לא יחושב, גם אחרי שיוזן שכר: |
| `never` (changed; 1 / many) | עובד פעיל בלי אף יום עבודה רשום: / עובדים פעילים בלי אף יום עבודה רשום: |
| `twin` (new) | ${name} (${n}) - and with more after it, ${name} (${n}) · ${more} |

The «מה חדש» item for the integrator is unchanged.

## Files changed against the base

At `69fc168`, the last commit that changes anything but this file (`git diff --stat 6ab193d 69fc168`):

```
 css/design.css                 |   24 +
 css/large.css                  |    3 +
 features/crewcheck/contract.md |  859 ++++++++++++++++++++++
 features/crewcheck/handoff.md  |  473 ++++++++++++
 index.html                     |   26 +
 js/ui/crewcheck.js             |  842 +++++++++++++++++++++
 js/ui/modal.js                 |    2 +
 js/ui/roster.js                |    8 +
 package.json                   |    6 +-
 sw.js                          |    1 +
 tests/README.md                |    2 +
 tests/crewcheck.browser.mjs    | 1098 +++++++++++++++++++++++++++
 tests/crewcheck.test.mjs       | 1594 ++++++++++++++++++++++++++++++++++++++++
 tests/screens.mjs              |   57 ++
 14 files changed, 4993 insertions(+), 2 deletions(-)
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
- `css/design.css` - one commented block straight after the day check's (lines 806-829), inside `@media screen`;
  fix round 1 adds `.crewcheck-whole` and `.crewcheck-number` to it (no size, so nothing to restate).
- `css/large.css` - block 3, its three sizes restated one for one straight after the day check's (lines 710-712).
- `tests/crewcheck.test.mjs` (new, `test:crewcheck`, appended to `npm test`) and `tests/crewcheck.browser.mjs`
  (new, `test:crewcheck-browser`, appended to `test:all`).
- `tests/screens.mjs` - two entries after 'crew - reorder' (lines 310-363), each carrying its in-memory change
  inside its own open/close.
- `package.json`, `tests/README.md` - the two scripts and the two rows.
- `features/crewcheck/contract.md` - the contract.

No expectation of a suite this track did not write was moved; the pins fix round 1 moved in its own suites and in
its own two entries of tests/screens.mjs are listed under "Fix round 1".


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
- `68c7ab7` features/crewcheck/handoff.md: what was built, what every suite said on b73550f, and what is left
- `12c8b4b` «בדיקת הצוות», fix round 1: words true of every man named, one number per field, numbers never broken, namesakes told apart, every control held after a door
- `fcd830b` tests/crewcheck.browser.mjs: the cleared-rate man is an existing one, so the slow-tap trials keep their switches
- `d54fad5` «בדיקת הצוות»: a slow second touch at the chip's own place is held wherever it lands (taken out again by the next)
- `69fc168` «בדיקת הצוות»: the same-place hold of d54fad5 taken out; the suite's first touch lands on the chip
- `6c1635d` features/crewcheck/handoff.md: fix round 1 - the eleven findings triaged, ten fixed and one left, and what every suite said
- this file's commit (fix round 2) - the verification's one finding triaged, CONFIRMED and LEFT, and what every suite said; it changes this file only

Of the build round's, every commit after `0a500ec` changes the tests and their wiring only. Of fix round 1's,
`12c8b4b` changes the app (js/ui/crewcheck.js, css/design.css) with its suites; `d54fad5` changed
js/ui/crewcheck.js and `69fc168` put it back, so the app's bytes at `69fc168` are `12c8b4b`'s exactly
(`git diff 12c8b4b 69fc168 -- js css index.html sw.js` is empty); `fcd830b` and `69fc168` otherwise change
tests/crewcheck.browser.mjs and tests/README.md only.

## The rules, and where each one is read from

| line | tier | exactly when | read from |
|---|---|---|---|
| `noRate` | כדאי לבדוק | `(Number(dailyRate) \|\| 0) <= 0` on an active man ('' / 0 / '0' / no field / negative / an hourly rate alone); since fix round 1 in two sentences by `priced`, his recorded days whose stamp carries a daily rate - none: «ימי העבודה שלו…», some: «ימי עבודה שיירשמו לו מעכשיו…» | the roster as `js/state.js` normalises it; `ratesForDay` (money.js) for `priced` |
| `badPhone` | כדאי לבדוק | a digit typed (`/[0-9٠-٩۰-۹]/`), `sederWaNumber(phone) === ''`, and not another country's as typed - two numbers in one field among them, whichever is first (fix round 1) | `sederWaNumber` (js/ui/seder.js) |
| `sharedPhone` | כדאי לבדוק | two or more active men on one non-empty `normalisePhone`; a group whose every number opens regrouped by `sederWaNumber`, sub-groups of two or more stand | `normalisePhone` (schema.js), `sederWaNumber` |
| `sameName` | כדאי לבדוק | two or more active men with the same `name` string | `hasDuplicateName`'s comparison (roster.js) |
| `idle` | כדאי לבדוק | his last day with a site before the first of the last 25 working days (on or before today) | `dayCheckHasSite`, `dayCheckIsWorkingDay` (daycheck.js) |
| `idleSites` | כדאי לבדוק | the same for a site: the last day anybody had a site there, or Rima's or יוסף גבס's men were counted on it | `dayCheckHasSite`, `rimaCount`, `yosefGevesCount` (schema.js) |
| `otherPhone` | לידיעה | a digit, the seder refuses it, and a typed `+` or `00` then a country that is neither 972 nor a 0 - and ONE number: no second `+`, at most 15 digits after the prefix (E.164; fix round 1) | the typed text |
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
                               navigates, every control of the crew screen and of the form held for 700 ms
                               after it; writes nothing; every Hebrew word in one block (proposed)

**A release-entry paragraph** (for docs/releases.md, in its manner; the integrator's to adjust):

> «בדיקת הצוות» (js/ui/crewcheck.js): ONE button at the foot of the crew screen, after the sites - where
> nothing that was measured before it moves - and ONE dialog that reads the roster against the record:
> under «כדאי לבדוק» a man with no daily rate (in the words true of what his recorded days carry: none
> priced, or priced at their stamp and only the days from now on not), a number written as an Israeli one
> that will not open in WhatsApp or two numbers in one field, one number or one name on two active rows, and men and sites with no work in the last 25
> working days (with the day of the last); under «לידיעה», never counted, another country's number, no
> number for a man working these days, days stamped with no daily rate (iron law 2: nothing mends them),
> and men and sites with no day of work at all. Each name or site only navigates - the man's form on the
> field to mend, or his row or the site's row - and for DOUBLE_TAP_GUARD_MS after a door every control of
> the crew screen and of the form is held (the house's guardFingersOn, on each press's own time). A typed
> number is never broken across lines, and two men with one name carry their number on every line. It writes
> nothing: no record, no key, no preference. Every Hebrew word proposed and pinned (tests/crewcheck.test.mjs);
> not tried on a real phone.

**Interplay with wave 1 (`payday`)** - a fact about its doors, nothing of wave 1 changed: payday's c («…
בלי שכר יומי, ולכן הסכום חסר אותם») and f («שעות נוספות בלי שכר שעה») both send the owner to «עובדים
ואתרים». For c, the check names the man under `noRate` when his roster has no daily rate (the form's door
mends it: every day recorded with no stamp, and every day from then on, is priced at the rate typed; a man
whose rate was cleared after days of his were stamped with it is told only of the days from now on - since
fix round 1 - because c does not name him for the periods his stamped days alone fill), and under
`zeroStamped` with how many days when his days were stamped with no daily rate (an hourly-only man): the
account period that holds them stays without an accrued whatever is typed, so c will go on naming him for
that period, and the check now says so in the sheet's own words. For f the check says nothing: it reads no hourly rate, and an hourly rate typed in
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
| `noRateFromNow` (1 / many; fix round 1) | בלי שכר יומי - ימי עבודה שיירשמו לו מעכשיו לא יחושבו בשכר: / בלי שכר יומי - ימי עבודה שיירשמו להם מעכשיו לא יחושבו בשכר: |
| `badPhone` (1 / many) | אין מספר טלפון תקין - המספר שנרשם לו לא ייפתח בוואטסאפ: / אין מספר טלפון תקין - המספרים שנרשמו להם לא ייפתחו בוואטסאפ: |
| `sharedPhone` | מספר משותף - ${number} רשום אצל ${count} עובדים פעילים: |
| `sameName` | שם כפול - ${count} עובדים פעילים בשם ${name}, ממוספרים לפי הסדר ברשימת העובדים: (fix round 1) |
| `idle` (1 / many) | לא עבד ב-25 ימי העבודה האחרונים (מאז ${since}), ועדיין פעיל: / לא עבדו ב-25 ימי העבודה האחרונים (מאז ${since}), ועדיין פעילים: |
| `archiveIf` (+ the borrowed sentence, one line) | אם מכבים עובד בכפתור «פעיל»: הימים שכבר נרשמו יישמרו, והעובד לא יופיע ברשימה היומית. |
| `idleSites` (1 / many) | אתר שלא נרשמה בו עבודה ב-25 ימי העבודה האחרונים (מאז ${since}), ועדיין פעיל: / אתרים שלא נרשמה בהם עבודה ב-25 ימי העבודה האחרונים (מאז ${since}), ועדיין פעילים: |
| `otherPhone` (1 / many; fix round 1) | מספר שאינו נייד ישראלי - האפליקציה לא תפתח לו הודעה בוואטסאפ: / מספרים שאינם ניידים ישראליים - האפליקציה לא תפתח להם הודעה בוואטסאפ: |
| `noPhone` (1 / many) | בלי טלפון - אי אפשר לפתוח לו הודעה בוואטסאפ: / בלי טלפון - אי אפשר לפתוח להם הודעה בוואטסאפ: |
| `zeroStamped` (1 / many; fix round 1) | ימים שנרשמו לו בלי שכר יומי - בתקופת החשבון שלהם הנצבר לא יחושב, גם אחרי שיוזן שכר: / ימים שנרשמו להם בלי שכר יומי - בתקופת החשבון שלהם הנצבר לא יחושב, גם אחרי שיוזן שכר: |
| `never` (1 / many; fix round 1) | עובד פעיל בלי אף יום עבודה רשום: / עובדים פעילים בלי אף יום עבודה רשום: |
| `neverSites` (1 / many) | אתר פעיל בלי אף יום עבודה רשום: / אתרים פעילים בלי אף יום עבודה רשום: |
| `chip`, `oneDay`, `days(n)` | ${name} · ${more} / יום אחד / ${n} ימים |
| `twin` (fix round 1) | ${name} (${n}) - a namesake's place among the active men of his name, in the crew list's order, on every line he is on |

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
- FIX ROUND 1 departs from the contract's words where they were found untrue or incomplete, each said in
  "Fix round 1" above: `noRate` is two sentences by what a man's recorded days carry (the contract's one sentence
  was false of a man whose rate was cleared - its own 'with findings' fixture); `otherPhone` is one number of at
  most 15 digits (the contract's prefix rule filed a dual-SIM field as foreign); `zeroStamped`, `otherPhone` and
  `never` have new words; the «שם כפול» chips say «(n)» and a namesake carries it on every line; the line under the
  title and every typed number are drawn as blocks that break whole; the hold after a door covers every control
  of the crew screen and every button, fold and choice of the form, not the switches and «שמור» alone; and the
  'with findings' entry of tests/screens.mjs sets w13's daily rate to 0 besides the contract's recipe.

## The suites, one by one - fix round 2, on `6c1635d`

### `npm test`, every suite of the chain run on its own (an `&&` chain stops at the first red, and two reds are expected on a track branch)

Run by `fix2/chain.sh` (in the scratchpad) on `6c1635d077aeb206a661da1888f84199c70000fa`, the tree clean when it
started; when it ended the one file changed was `features/crewcheck/handoff.md` - this one, which no suite reads.
**107 of 109 green**, 13,063 of 13,066 checks, 1176 s in all. The two red ones are the contract's
expected pair and nothing else - the stamps, which the integrator moves (fix round 2's finding, above):

```
test:build | exit 1 | 2s | 67/69 checks passed
test:gate-integrity | exit 1 | 0s | 19/20 checks passed
```

```
  FAIL  and nothing in the shell has changed since  — 6 changed since 6ab193d6: css/design.css, css/large.css, index.html, js/ui/crewcheck.js, js/ui/modal.js, js/ui/roster.js
  FAIL  and neither has the worker that names the shelf  — sw.js
  FAIL  no cached file has changed since the three stamps last moved  — 69fc1680 «בדיקת הצוות»: the same-place hold of d54fad5 taken out; the | d54fad54 «בדיקת הצוות»: a slow second touch at the chip's own place i | 12c8b4bb «בדיקת הצוות», fix round 1: words true of every man named, o | 0a500ecf «בדיקת הצוות»: one button at the foot of the crew screen and
```

Fix round 1's run of the same chain, on `12c8b4b` (the app's bytes of `6c1635d`): 107 of 109 green, 13,063 of
13,066 checks, 1190 s, the same two red.

Every line of the chain (suite | exit | seconds | last count):

```
test:isolation | exit 0 | 0s | 18/18 checks passed
test:blobs | exit 0 | 1s | 11/11 checks passed
test:build | exit 1 | 2s | 67/69 checks passed
test:poison | exit 0 | 0s | 37/37 checks passed
test:merge | exit 0 | 0s | 28/28 checks passed
test:contested | exit 0 | 16s | 73/73 checks passed
test:held | exit 0 | 3s | 83/83 checks passed
test:snapshot-stale | exit 0 | 2s | 16/16 checks passed
test:reports-rules | exit 0 | 2s | 26/26 checks passed
test:finance | exit 0 | 7s | 57/57 checks passed
test:weekly-range | exit 0 | 0s | 21/21 checks passed
test:finance-wording | exit 0 | 2s | 12/12 checks passed
test:weekly-unpriced | exit 0 | 0s | 23/23 checks passed
test:receipt | exit 0 | 2s | 28/28 checks passed
test:data | exit 0 | 43s | 1970/1970 checks passed
test:recovery | exit 0 | 1s | 82/82 checks passed
test:adversarial | exit 0 | 6s | 116/116 checks passed
test:probes | exit 0 | 7s | 35/35 checks passed
test:capacity | exit 0 | 9s | 48/48 checks passed
test:concurrency | exit 0 | 3s | 46/46 checks passed
test:exports | exit 0 | 0s | 112/112 checks passed
test:fence | exit 0 | 2s | 35/35 checks passed
test:fence-ingress | exit 0 | 1s | 43/43 checks passed
test:fence-legacy | exit 0 | 0s | 21/21 checks passed
test:money-history | exit 0 | 0s | 9/9 checks passed
test:money-units | exit 0 | 0s | 21/21 checks passed
test:money-cloud | exit 0 | 2s | 17/17 checks passed
test:money-display | exit 0 | 0s | 4/4 checks passed
test:snapshot-poison | exit 0 | 2s | 82/82 checks passed
test:samefact | exit 0 | 5s | 37/37 checks passed
test:wording | exit 0 | 1s | 37/37 checks passed
test:closure | exit 0 | 17s | 122/122 checks passed
test:closure-echo | exit 0 | 0s | 79/79 checks passed
test:correction | exit 0 | 1s | 33/33 checks passed
test:quarantine | exit 0 | 1s | 82/82 checks passed
test:approval | exit 0 | 6s | 72/72 checks passed
test:repayment | exit 0 | 4s | 240/240 checks passed
test:ledger-ingress | exit 0 | 0s | 167/167 checks passed
test:cas | exit 0 | 12s | 88/88 checks passed
test:status | exit 0 | 6s | 37/37 checks passed
test:money | exit 0 | 2s | 40/40 checks passed
test:money-ingress | exit 0 | 9s | 206/206 checks passed
test:method | exit 0 | 3s | 51/51 checks passed
test:restore | exit 0 | 1s | 51/51 checks passed
test:upgrade | exit 0 | 1s | 48/48 checks passed
test:vehicles | exit 0 | 2s | 86/86 checks passed
test:xlsx | exit 0 | 2s | 104/104 checks passed
test:nonassertions | exit 0 | 0s | 23/23 checks passed
test:labels | exit 0 | 1s | 23/23 checks passed
test:labelcache | exit 0 | 0s | 32/32 checks passed
test:restore-ledger | exit 0 | 2s | 26/26 checks passed
test:roster-upgrade | exit 0 | 6s | 55/55 checks passed
test:roster-race | exit 0 | 7s | 63/63 checks passed
test:exports-proof | exit 0 | 1s | 92/92 checks passed
test:ledger-truth | exit 0 | 4s | 148/148 checks passed
test:races | exit 0 | 4s | 109/109 checks passed
test:overlap-restore | exit 0 | 21s | 117/117 checks passed
test:refute-roster | exit 0 | 9s | 24/24 checks passed
test:refute-restore | exit 0 | 43s | 25/25 checks passed
test:gate-integrity | exit 1 | 0s | 19/20 checks passed
test:queuecost | exit 0 | 5s | 18/18 checks passed
test:paycycle | exit 0 | 0s | 43/43 checks passed
test:paycycle-blockers | exit 0 | 2s | 17/17 checks passed
test:paycycle-completion | exit 0 | 6s | 31/31 checks passed
test:crew-controls | exit 0 | 1s | 46/46 checks passed
test:simple-advances | exit 0 | 1s | 66/66 checks passed
test:worker-deletion | exit 0 | 10s | 86/86 checks passed
test:calendar | exit 0 | 1s | 58/58 checks passed
test:reminders | exit 0 | 0s | 48/48 checks passed
test:move-late | exit 0 | 5s | 48/48 checks passed
test:codex-probes | exit 0 | 0s | 17/17 checks passed
test:codex2-probes | exit 0 | 1s | 36/36 checks passed
test:codex3-probes | exit 0 | 3s | 59/59 checks passed
test:rima | exit 0 | 91s | 496/496 checks passed
test:yosefgeves | exit 0 | 93s | 562/562 checks passed
test:seder | exit 0 | 0s | 135/135 checks passed
test:bars-stale | exit 0 | 0s | 60/60 checks passed
test:transport | exit 0 | 1s | 566/566 checks passed
test:transport-share | exit 0 | 11s | 304/304 checks passed
test:oracle | exit 0 | 38s | 121/121 checks passed
test:overpayment | exit 0 | 4s | 105/105 checks passed
test:polish | exit 0 | 0s | 73/73 checks passed
test:daycheck | exit 0 | 5s | 169/169 checks passed
test:journey | exit 0 | 0s | 233/233 checks passed
test:workercard | exit 0 | 20s | 180/180 checks passed
test:monthsummary | exit 0 | 68s | 98/98 checks passed
test:payslips | exit 0 | 23s | 202/202 checks passed
test:find | exit 0 | 0s | 91/91 checks passed
test:whatsnew | exit 0 | 1s | 160/160 checks passed
test:account-view | exit 0 | 16s | 456/456 checks passed
test:usual | exit 0 | 1s | 150/150 checks passed
test:sitecard | exit 0 | 3s | 119/119 checks passed
test:reportsclarity | exit 0 | 2s | 1119/1119 checks passed
test:largetext | exit 0 | 0s | 107/107 checks passed
test:reportnames | exit 0 | 9s | 36/36 checks passed
test:holiday | exit 0 | 1s | 109/109 checks passed
test:undo-stale | exit 0 | 1s | 32/32 checks passed
test:auditfix | exit 0 | 2s | 34/34 checks passed
test:owes | exit 0 | 56s | 190/190 checks passed
test:weeklyclose | exit 0 | 103s | 146/146 checks passed
test:reports-speed | exit 0 | 170s | 159/159 checks passed
test:closeorder | exit 0 | 0s | 22/22 checks passed
test:closuresize | exit 0 | 13s | 13/13 checks passed
test:closerace | exit 0 | 38s | 29/29 checks passed
test:advancereset | exit 0 | 46s | 77/77 checks passed
test:overpaidfix | exit 0 | 0s | 85/85 checks passed
test:xlsxlook | exit 0 | 8s | 293/293 checks passed
test:closereminder | exit 0 | 12s | 107/107 checks passed
test:crewcheck | exit 0 | 21s | 175/175 checks passed
```

### Browser suites, each through the slot wrapper

| suite | commit | result |
|---|---|---|
| tests/crewcheck.browser.mjs | `6c1635d` (fix round 2) | **544/544**, exit 0 (`fix2/browser.out`) |
| tests/crewcheck.browser.mjs | `69fc168` | **544/544**, exit 0 (`fix1/browser-after.out`) |
| tests/crewcheck.browser.mjs, the same file | a copy of `68c7ab7`'s app code | 510/544, exit 1 - every new check red, as it should be (`fix1/browser-before.out`) |
| tests/largetext.browser.mjs | `12c8b4b` (the app's bytes of `69fc168`) | **8335/8335**, exit 0, both crew-check entries walked at every phone, scheme and mode (`fix1/largetext-browser.out`) |

The runs in between, kept for what they showed: on `fcd830b` the suite stopped in THE SLOW SECOND TAP
(`fix1/browser-fcd830b.out`), and on `d54fad5` it named the fault «the screen is still the crew screen» - "week"
(`fix1/browser-d54fad5.out`); the probe (`fix1/probe/hold-probe.out`) showed the suite's first touch pressing the
dialog's sticky «סגור» over a chip pushed under it, and `69fc168` makes every trial find its chip under the finger.

The end of tests/crewcheck.browser.mjs on `6c1635d` (fix round 2; fix round 1's, on `69fc168`, is in `fix1/browser-after.out`):

```
  (the gaps the page saw: row/350:329 row/350:348 row/350:343 site/350:349 site/350:331 form/350:343 form/350:329 site/350:345 site/350:335 form/350:337 form/350:350 row/500:483 row/500:487 row/500:473 site/500:488 site/500:474 form/500:494 form/500:485 site/500:490 site/500:466 form/500:489 form/500:493 row/650:621 row/650:638 row/650:640 site/650:631 site/650:632 form/650:644 form/650:638 site/650:630 site/650:636 form/650:646 form/650:635)
  (under the finger at the chip's own point: row/350: crew-cycle | site/350: roster-details site-details | form/350: field-label | row/500: crew-cycle | site/500: roster-details site-details | form/500: workerFormPhone | row/650: crew-cycle | site/650: roster-details site-details | form/650: workerFormPhone)
  (one reading at 4x: median 9.7 ms, max 25.8 ms of 15)
  (a tap to the dialog painted with its list, at 4x: 69 ms)
  PASS  no uncaught error
  PASS  no alert, confirm or prompt

544/544 checks passed
```

What the before-run's reds were, one per line (the copy of `68c7ab7`'s app, the final suite):

```
FAIL  the origin served this commit, byte for byte  — 71 assets; index.html: not tracked | css/app.css: not tracked | css/readability.css: not tracked
FAIL  every kind, in the order the contract gives them - «בלי שכר יומי» twice, as what the men's days carry tells them apart  — ["noRate","badPhone","sharedPhone","sameName","idle","idleSites","otherP
FAIL  «בלי שכר יומי»: the men none of whose days is priced, then the man whose days at 470 still are - told of the days from now on  — [["בלי שכר יומי - ימי העבודה שלהם לא יחושבו בשכר:",["דוגמה בלי שכ
FAIL  site door, 350 ms, on «בדיקת הצוות», under the last site: nothing opened but what the door opened  — ["crewCheckModal"] !== []
FAIL  site door, 350 ms, on its row's «כרטיס אתר»: nothing opened but what the door opened  — ["siteCardModal"] !== []
FAIL  form door, 350 ms, on the fold «עוד פרטים» the number is in: the fold is still open, the number in it
FAIL  form door, 350 ms, on the form's «ביטול»: nothing opened but what the door opened  — [] !== ["workerFormModal"]
FAIL  site door, 500 ms, on «בדיקת הצוות», under the last site: nothing opened but what the door opened  — ["crewCheckModal"] !== []
FAIL  site door, 500 ms, on its row's «כרטיס אתר»: nothing opened but what the door opened  — ["siteCardModal"] !== []
FAIL  form door, 500 ms, on the fold «עוד פרטים» the number is in: the fold is still open, the number in it
FAIL  form door, 500 ms, on the form's «ביטול»: nothing opened but what the door opened  — [] !== ["workerFormModal"]
FAIL  site door, 650 ms, on «בדיקת הצוות», under the last site: nothing opened but what the door opened  — ["crewCheckModal"] !== []
FAIL  site door, 650 ms, on its row's «כרטיס אתר»: nothing opened but what the door opened  — ["siteCardModal"] !== []
FAIL  form door, 650 ms, on the fold «עוד פרטים» the number is in: the fold is still open, the number in it
FAIL  form door, 650 ms, on the form's «ביטול»: nothing opened but what the door opened  — [] !== ["workerFormModal"]
FAIL  320x568 dark: crew - «בדיקת הצוות», calm: no typed number is broken across lines, and no «label: n» under the title  — [{"what":"context","lines":["עובדים פעילים:","14"]}] !== []
FAIL  320x568 dark: crew - «בדיקת הצוות», with findings: no typed number is broken across lines, and no «label: n» under the title  — [{"what":"number","lines":["03-","5551234"]},{"what":"number","lin
FAIL  320x568 dark large: crew - «בדיקת הצוות», calm: no typed number is broken across lines, and no «label: n» under the title  — [{"what":"context","lines":["עובדים","פעילים: 14"]}] !== []
FAIL  320x568 dark large: crew - «בדיקת הצוות», with findings: no typed number is broken across lines, and no «label: n» under the title  — [{"what":"number","lines":["+970 59-","123-4567"]},{"what":"
FAIL  320x568 light: crew - «בדיקת הצוות», calm: no typed number is broken across lines, and no «label: n» under the title  — [{"what":"context","lines":["עובדים פעילים:","14"]}] !== []
FAIL  320x568 light: crew - «בדיקת הצוות», with findings: no typed number is broken across lines, and no «label: n» under the title  — [{"what":"number","lines":["03-","5551234"]},{"what":"number","li
FAIL  320x568 light large: crew - «בדיקת הצוות», calm: no typed number is broken across lines, and no «label: n» under the title  — [{"what":"context","lines":["עובדים","פעילים: 14"]}] !== []
FAIL  320x568 light large: crew - «בדיקת הצוות», with findings: no typed number is broken across lines, and no «label: n» under the title  — [{"what":"number","lines":["+970 59-","123-4567"]},{"what":
FAIL  375x667 dark: crew - «בדיקת הצוות», calm: no typed number is broken across lines, and no «label: n» under the title  — [{"what":"context","lines":["אתרים","פעילים: 5"]}] !== []
FAIL  375x667 dark: crew - «בדיקת הצוות», with findings: no typed number is broken across lines, and no «label: n» under the title  — [{"what":"number","lines":["03-","5551234"]},{"what":"context","li
FAIL  375x667 dark large: crew - «בדיקת הצוות», calm: no typed number is broken across lines, and no «label: n» under the title  — [{"what":"context","lines":["עובדים פעילים:","14"]}] !== []
FAIL  375x667 dark large: crew - «בדיקת הצוות», with findings: no typed number is broken across lines, and no «label: n» under the title  — [{"what":"number","lines":["03-","5551234"]},{"what":"number
FAIL  375x667 light: crew - «בדיקת הצוות», calm: no typed number is broken across lines, and no «label: n» under the title  — [{"what":"context","lines":["אתרים","פעילים: 5"]}] !== []
FAIL  375x667 light: crew - «בדיקת הצוות», with findings: no typed number is broken across lines, and no «label: n» under the title  — [{"what":"number","lines":["03-","5551234"]},{"what":"context","l
FAIL  375x667 light large: crew - «בדיקת הצוות», calm: no typed number is broken across lines, and no «label: n» under the title  — [{"what":"context","lines":["עובדים פעילים:","14"]}] !== []
FAIL  375x667 light large: crew - «בדיקת הצוות», with findings: no typed number is broken across lines, and no «label: n» under the title  — [{"what":"number","lines":["03-","5551234"]},{"what":"numbe
FAIL  440x956 dark large: crew - «בדיקת הצוות», with findings: no typed number is broken across lines, and no «label: n» under the title  — [{"what":"number","lines":["03-","5551234"]}] !== []
FAIL  440x956 light large: crew - «בדיקת הצוות», with findings: no typed number is broken across lines, and no «label: n» under the title  — [{"what":"number","lines":["03-","5551234"]}] !== []
FAIL  and both sentences of «בלי שכר יומי» among them  — ["בלי שכר יומי - ימי העבודה שלהם לא יחושבו בשכר:"] !== ["בלי שכר יומי - ימי העבודה שלו לא יחושבו בשכר:","בלי שכר יומי - ימי עבודה שיירשמו לו מע
```

The other existing browser suites were not run again in fix round 1: none of them opens the crew check or
presses its doors, and the app's bytes they would serve differ from `b73550f`'s only in js/ui/crewcheck.js and the
two classes it alone uses (css/design.css). Nor in fix round 2, which changed no byte the app serves; the
independent verifier's report on `6c1635d` lists no failure but the three stamp checks. Their results on `b73550f`
(the build round) were:
smoke 1186/1186, mobile 1397/1397, design-browser 72/72, roster-browser 42/42, polish-browser 201/201,
sitecard-browser 135/135, workercard-browser 116/116, daycheck-browser 122/122, doubletap-browser 359/359,
scroll-browser 604/604.


## The measured noise and cost, re-run on `6c1635d` (fix round 2; printed by tests/crewcheck.test.mjs in the chain above)

```
  SKIP  «מה חדש» does not carry it yet: the integrator adds it with the stamps
  (20 seasons, 1798 evenings: calm on 92.3%; idle sites 0.08 an evening, of them a site worked again later 58.0%; «never» 3.02 an evening)
  (8 seasons, 1652 evenings to 20/09, as of each: 2.07 men named an evening, of them a man who worked again later 29.6%; sites 0.53 an evening)
  (the whole record read instead, the app's reading: 1.46 an evening, of them back later 0.0% - by construction)
  (leavers: 40; last day 45+ calendar days before 20/09: 33, named 33, the first time after a median 31 and at most 42 calendar days; out of the window's reach 7, of them named anyway 2)
  (regulars: 208; named 17, each with a run of 25+ working days; never named 191, their longest run 24)
  (the time-season record, 40 men x 277 day keys, 703 KiB: median 10.0 ms, max 15.6 ms of 25)
  (60 men x 329 day keys, 1149 KiB: median 17.7 ms, max 21.4 ms of 15)
```

The turnover model's figures are the contract's to the decimal (29.6%, 33 of 33 leavers within 42 days,
17 of 208 regulars, 0.0% read whole) - unmoved by fix round 1, which counts one more fact per day the pass already
reads (`priced`) and changes no rule of who is named. The day check's seasons are run with its own generator copied line for
line (seeds 11-55, both habits, Rima on Fridays or not: 20 seasons, 1,798 evenings) where the contract's probe
had used a variant without the Friday switch (10 seasons, 898 evenings): 92.3% calm here against its 92.0%,
the floor held at 85%. In Chromium at 4x CPU, on `6c1635d` (fix round 2), the reading of the time-season record is 9.7 ms
(median of 15, max 25.8; budget 60) and a tap to the dialog painted with its list 69 ms (budget 300) - fix round 1
measured 13.2 ms and 108 ms on `69fc168`, the build round 8.8 ms and 70 ms; every run shared the machine with other
tracks' browser suites. Fix round 2's five lines of the noise above are fix round 1's character for character; the two cost lines are
ceilings and move with the machine's load.

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

## The conflict table (the build round's, at 19:50) and the trial merges of fix rounds 1 and 2

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

Fix round 1 inserted no new line in a shared file outside this track's own blocks (css/design.css grows inside
the crew check's block; tests/screens.mjs inside its own entry). `git merge-tree --write-tree 69fc168 <head>`, read
only, on the heads of 2026-11-20 00:0x: feat-status `f4cf70b`, feat-payday `b95149a`, feat-yearsummary `9a4b8e7`,
feat-speed `adb60aa`, feat-history `b54df95` - conflicted in package.json and tests/README.md only; feat-monthboard
`ff3e9c6` and release-v205 `f9a432b` - in package.json only. No code file conflicts with any of them.

Fix round 2 changed no shared file, and those seven heads are the same commits today (read 2026-11-20 02:3x), so the
trial merges above stand. The branches that are new since were tried in the throwaway clone, `6c1635d` merged onto
each: `release-v206` `d2d4710` - package.json and tests/README.md; `v205-followup` `b76c727` and `origin/main`
`8b8f807` (v205) - package.json only (see "Fix round 2", probe B for the last).

## Screenshots (synthetic names; JPEG; they assert nothing)

Fix round 1, from the green run on `69fc168` (`CREWCHECK_SHOTS`), in
`/tmp/claude-0/-home-user-farkad/d6a64352-db1a-5c3b-b54d-5c09103f2419/scratchpad/feat-crewcheck/fix1/shots/`:
`dialog-with-findings-440-dark.jpg` (both «בלי שכר יומי» sentences, «03-5551234» whole, «וליד זועבי (1)» / «(2)»),
`dialog-320-large-dark.jpg` (the line under the title breaking only at «·», the namesake's mark on «בלי שכר יומי»),
`dialog-440-dark.jpg`, `crew-foot-440-dark.jpg`, `landed-row-440-dark.jpg`.

The build round's, in `/tmp/claude-0/-home-user-farkad/d6a64352-db1a-5c3b-b54d-5c09103f2419/scratchpad/feat-crewcheck/`:
`crew-foot-440x956-dark.jpg`, `dialog-calm-440x956-dark.jpg`, `dialog-findings-440x956-dark.jpg`,
`dialog-findings-end-440x956-dark.jpg`, and the same four `-320x568-large-dark.jpg` (with «תצוגה גדולה»),
made by `shots.mjs` beside them - they show the words as they were before fix round 1.

## NOT DONE

- Not tried on a real phone, and nobody far-sighted has looked at it: Chromium with emulated touch only. THE
  SLOW SECOND TAP in particular is held on Chromium's touch events; an iPhone's are not measured.
- `docs/releases.md`, `js/ui/whatsnew.js`, CLAUDE.md and the three stamps are the integrator's (texts above).
  Until «מה חדש» carries the item, tests/crewcheck.test.mjs prints a SKIP where it would hold the copy.
- Until the stamps move, tests/build.test.mjs (67/69) and tests/gate.integrity.test.mjs (19/20) are red on this branch
  BY CONSTRUCTION - the three stamp-lag checks and nothing else (fix round 2). A verification that counts them answers
  red whatever a fix round of this track does; only the integrator's stamp commit turns them, and the probes show it does.
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
  door, and stays for the page's life with nothing held outside 700 ms of a door. Since fix round 1 it holds every
  control of the crew screen and every button, fold and choice of the form inside those 700 ms - a deliberate tap
  that fast after a door is held too (the trays' window for "a control of another kind", the same 700 ms). A control
  outside `#rosterView` and `#workerFormModal` - a banner that appears at the top of the screen at that moment - is
  not held; on a phone nothing else can be under a chip the dialog shows (see `69fc168`). If another feature later
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
7. (Fix round 1, the review's tenth finding - LEFT.) After a row or site door, the way back to «בדיקת הצוות» is a
   scroll to the foot of the crew screen: 1.2-3.8 screens at 375x667, 2.4-7.0 at 320x568 with the large display, on
   the 14-man seed - about three times that on a crew of forty. The contract allows nothing on the crew screen but
   the one button at its foot (Out of scope; Entry and navigation), so nothing was changed. The review's two
   options, for the owner or the integrator: a way back on the landed row while its mark stands (e.g. «חזרה לבדיקת
   הצוות» in the 2.5 s mark), or a sentence in the dialog saying the button is at the end of the screen.
