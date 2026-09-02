# Handoff — v100: the holds nobody disagreed about

- Branch: `claude/farkad-mobile-design-review-odl8ue`
- SHA: `14eeb8d1dcfcce39e88cc6ae052503dfc5d3172d`
- Base: `4a4d277` (v98 as served), merged with `5650235` — the v99 that was served from
  this same branch while this round was being built
- Build stamps at that SHA: `farkad-build` v100 · `APP_VERSION` v100 · `VERSION` farkad-v100
- Gates: `LEDGER_WRITES` false, `carryAdvances` false. Neither moved.
- Contracts: `features/false-holds/contract.md` (items 1–4), `features/gate-flip/contract.md`
  (item 8 — a checklist, no code)
- Also in this round, and not from that brief: the data-safety re-audit
  `features/next/opus-closeout.md` asks for in its Wave 1. Its result is
  `docs/data-safety-audit.md`; the five findings it closed are in the table below and
  the two it could not close are named further down.

## What was closed, and by which pair

| # | sev | pair | pinned by |
|---|---|---|---|
| 1 | P1 behind the carry gate | `d8416a9` → `49d24e9` | `tests/closure.test.mjs` «a fortnight closed after the man has already repaid something» and «a phone whose clock is behind is told…» — 14 new checks |
| 2+4 | P1 behind the carry gate | `0ec2c53` → `ea73ed7` | `tests/samefact.test.mjs` «two phones approving one plan reach an empty project» |
| 3 | decision, no code | `0ec2c53` | `tests/samefact.test.mjs` «a closure of one fortnight is the same fact only when the fortnight is» |
| 5 | documentation | `87c6d95` | `docs/iphone-acceptance.md` rows 34–45, all NOT RUN |
| 6a | P2, and NOT a pin | `73d6c86` → `2c21ebd` | `tests/exports.test.mjs` «a Latin name does not turn a line of the message round» |
| 6b | P3 | `4961bd7` → `ad51d55` | `tests/mobile.test.mjs`, the card heading at 390/430 and the header order at 900 |
| 7 | P3, product | `4961bd7` → `71e601c` | `tests/mobile.test.mjs` «the week strip shows where it is cut off», 320/375/390/430 |
| 8 | contract only | `72bc5b4` | — |
| A1 | P1 — a day priced twice | `03dadd8` → `3383d03` | `tests/closure.test.mjs` «a closed fortnight is frozen for its own period and no other» |
| A2 | P1 — a false «מסונכרן» | `1bd8da8` → `c8f1dcb` | `tests/status.test.mjs` «a phone whose pending restore will not parse is not finished either» |
| A3 | P1 — a refused edit left on screen | `1107a3b` → `4c75e66` | `tests/data.test.mjs` «a refused edit is taken off the screen even with nothing durable behind it» |
| A4 | P2 — a way back that is not one | `046be72` → `a107bf7` | `tests/data.test.mjs` «a way back the next snapshot erases is not a way back» |
| A5 | P2 — law 10 broken by accident | `046be72` → `a107bf7` | `tests/data.test.mjs` «an undo stack that will not parse is held, not written over» |

## The three places the brief was wrong, and what was measured instead

**Item 1 is not only about clocks, and that matters.** The brief describes a closer whose
clock is behind another phone's. The root is wider: `planPeriodClosure` computed each row's
`balanceAfter` from `advanceOutstanding` — the whole record — while `closureProblems` judges
it with `outstandingWithout(..., periodTo, entry.at)`. Two records, two answers. The
ordinary timeline reaches it with no clock skew and no race at all:

| the timeline | the rule saw | the plan computed from |
|---|---|---|
| repaid 400 on the 12th, recorded 19:00; closed at 18:00 (the brief's case) | 5000 left | 4600 left |
| repaid 400 dated the 24th, recorded before the close | 5000 left | 4600 left |
| **repaid 400 on the 24th, recorded on the 24th, fortnight 07–20 closed on the 26th** | 5000 left | 4600 left |

The third needs nothing unusual: a man repays, the boss closes the fortnight a few days
later. `impossibleClosures` named the entry and `farkadWritesBlocked()` was `true` after a
reopen — the phone put itself in recovery over a fortnight nobody disagreed about.

So the writer computes from the record the closure will be judged against (D1), and the
clock case gets a refusal a person can act on rather than a payment quietly moved into the
next fortnight (D2). The cut-off itself is untouched: it is what stops a repayment landing
after a closure from condemning it, which this file fixed once already.

**Item 2 is the pre-send gate, not the create-race branch.** The brief offers three
candidates. Tracing every call the adapter received during the deterministic reproduction
shows **one create attempted and no write at all from the loser** — it never reached the
create-race branch and never reached the conflict branch either. A phone whose queued write
has not gone out cannot be refused by anything, so no branch that handles a refusal can see
this case. It hears the winner's snapshot, adopts it, and holds its own copy at the
pre-send gate in `sendClaimed`. The same-fact rule is now asked at all three gates.

Item 4's branch is a real second instance of the same gap and is closed in the same commit.

**Item 6(a) does not hold today; it is a defect, not a pin.** The brief says a lens checked
by hand that every line of `dayMessage` starts Hebrew-strong or isolated. With one Latin
worker and one Latin site, twenty-seven lines across the three styles start with a strong
Latin character and bidi turns the whole line round. `workerStatementText` has isolated its
heading since it was written; `dayMessage` never did. Fixed, with three pinned strings
moved deliberately — the words are the owner's and unchanged, only the isolates are new.

**Item 6(b) cannot be measured as written.** At ≤700px `css/app.css` sets
`.report-table thead { display: none }`: at 390 and 430 there is no `th` at all, by design,
because the row is a card carrying each cell's name in `data-label`. Both sides of the
breakpoint are pinned instead — the card's heading is the rightmost cell at 390/430, and at
900 (where `tests/print.test.mjs` needs the table to stay a table) the first `th` is the
rightmost and the headers step leftward in order. The invoice is deliberately excluded: its
`.report-table` lives inside `.table-scroll.invoice-grid`, which `@media screen` hides, so
measuring it on a screen measures nothing. Its geometry belongs to the print suite.

## The data-safety re-audit (Wave 1's other half)

`docs/data-safety-audit.md` was the v79 handover and nothing else — it predates the
versioned CAS protocol, the ledger, the send-path repairs of v91–v96 and the storm. It has
not been edited; its own first paragraph forbids that, and it is kept word for word under
its own heading. What was added above it is a current section, and this is how it was
produced.

Four independent adversarial reviews ran in parallel in their own worktrees, each given two
of seven lenses — a recorded day lost; a restore leaving part of a record; a false claim of
synced; a hold nobody can clear; a poisoned name through every door; a day priced twice; two
phones and the cloud disagreeing after a storm — and each told that a finding without a
runnable reproduction is not a finding. **I re-ran every report myself before it counted.**
Five became the pairs A1–A5 in the table above. Two are open, below. Reports that did not
survive the second run were dropped.

**The one that would have cost money, A1.** `closedPeriods` folded a closure under
`periodFrom` and threw `periodTo` away, so a frozen fortnight was applied to any range that
happened to start on its opening Friday. The ordinary «החודש» preset reaches it in any month
whose first day is an account start: the pay sheet showed ten days and 5,000 where the crew
had worked twenty for 10,000, while the invoice in the same workbook still billed twenty.
Read as two ranges that do not overlap, one day was priced in both. `frozenPeriodFor` now
asks both ends, for `payrollReport`, `workerDaysReport` and `advanceWalk` alike.

**A2 is the third false «מסונכרן» this line has found.** `receive()` refuses every snapshot
while `replaceDamaged` — correctly — but set no status, and `pendingReplace()` answers null,
so every guard in `honestStatusFor` was satisfied. The phone was permanently deaf, its own
writes still landed, and the other two phones looked healthy from the outside.

**A3 and A5 are law 3 and law 10 respectively**, each broken in one place. `rollback()`
returned false without acting whenever `durableText` was unset — exactly the session that
opened onto a damaged record, exactly when somebody re-types the week they can see is
missing. And the undo stack, which holds up to three whole schedules, was written over when
it would not parse, under a comment claiming the raw value was left where it is.

### What is OPEN, with reproductions

Both were confirmed independently and neither is fixed, because each needs a rule this
repository reserves for a person.

- **O1 — a restore is undone on the phone that did not ask for it, in the ledger only.**
  Two phones online, nothing failing: A backs up, B records a repayment of 500 that reaches
  the cloud and A, A restores its backup. Afterwards `A left 5000 · B left 4500 · cloud left
  5000`, both phones say synced, and it survives closing and reopening B. `receive()` unions
  the arriving ledger with this phone's, and nothing travels with a document to say whether
  it is a field-merge snapshot or the whole-document replacement a restore just wrote. Two
  rules would both fix it and they disagree about money: a restore removes no ledger entry
  anywhere (which reads straight off law 1) or a restore's snapshot replaces the ledger on
  every phone that adopts it (which is what a restore means everywhere else, and what
  `tests/restore.test.mjs` R1/R2/R5 already pin on the restoring device). Picking one
  quietly would decide what a restore does to somebody's pay.
- **O2 — a roster edit made before the first snapshot arrives reverts another phone's
  change.** B raises a man to 600; A, returning from a stairwell with a roster edit queued,
  shows 500 and then sends 500 to the cloud and to B. All three converge on the stale value,
  nothing is held, no line says anything, and a day recorded on A in between is stamped at
  500 — law 2 reached from the wrong end. One mechanism is established: `editRoster` sends
  what differs from the last snapshot this device adopted, and that baseline lives in memory
  and starts empty at every app start. A **second carrier is not identified** — with the
  baseline present the divergence still reproduces, and the legacy whole-array branch the
  reviewer named is not it. A fix was written against that hypothesis, measured, found not
  to work, and **taken back out** (`2cc9341` → `576f15f`) rather than shipped with a suite
  that would have pinned a fiction.

Neither is a regression of this round; both predate it. They are in the audit with their
reproductions so that whoever writes the contract starts from a runnable case rather than
from a sentence.

### An observation that is not a finding

A three-phone storm with a reopen mid-evening ends with both phones blocked on «חלק
מהיסטוריית המקדמות לא נקרא» while `ledger.unreadable` and `ledger.unreadableMigrations` are
empty on both. Nothing claims to be settled — the app is stopping loudly, which is its job —
so it is outside every lens. But the sentence sends a person to look at a history neither
device holds. Not isolated to a line, and recorded rather than guessed at.

## Expectations moved deliberately
- Nine pins of the WhatsApp message, in two files, all for the isolates and nothing else:
  three in `tests/exports.test.mjs` (the owner's template, the one-site message, the
  absence-only day) and six in `tests/smoke.mjs` (the site and bullet lines, the doubled
  day, the absentee list, and the other two styles). Written into the pins through a named
  FSI/PDI pair rather than stripped from the comparison, so dropping the isolates fails
  them instead of passing.

  The six in `tests/smoke.mjs` were found by the release gate, not by the change: the grep
  that went with the isolates looked for the heading string and so matched only the file
  that pins the heading. That cost one full gate run and is the reason the numbers below
  are from `3990de0` and not from the commit that made the change.
- Nothing else. `tests/closure.test.mjs`'s existing 103 checks, `tests/cas.test.mjs`'s
  two-phones-one-day hold and `tests/samefact.test.mjs`'s correction control all pass
  unchanged — a different fact is still a contest at every gate.

## New Hebrew string
`CLOSURE_CLOCK_BEHIND` in `js/ui/reports.js`, shown instead of the close button and in the
dialog when the clock goes behind between drawing the screen and pressing it. It names what
would happen rather than the mechanism: a person holding a phone does not care which
timestamp lost, they care that a payment would move fortnight.

## Migrations
None. Nothing on a disk is rewritten. A closure written by v99 can differ from one v98
would have written at the same moment — in `amount` and `balanceAfter`, and only when the
record holds money the period does not cover — but v98's answer in that case is an entry
its own reader refuses, so there is nothing to be compatible with. Rollback is a plain
revert; a v99 closure stays readable by v98, because agreeing with v98's judge is the whole
change.

## Test output (verbatim, on the final commit)

```
=== npm test on 14eeb8d1dcfcce39e88cc6ae052503dfc5d3172d at 20:40:25 v22.22.2
18/18 checks passed
11/11 checks passed
29/29 checks passed
37/37 checks passed
28/28 checks passed
73/73 checks passed
28/28 checks passed
1949/1949 checks passed
75/75 checks passed
116/116 checks passed
35/35 checks passed
44/44 checks passed
46/46 checks passed
73/73 checks passed
35/35 checks passed
43/43 checks passed
21/21 checks passed
9/9 checks passed
21/21 checks passed
17/17 checks passed
4/4 checks passed
82/82 checks passed
37/37 checks passed
36/36 checks passed
122/122 checks passed
79/79 checks passed
33/33 checks passed
82/82 checks passed
72/72 checks passed
240/240 checks passed
151/151 checks passed
88/88 checks passed
37/37 checks passed
40/40 checks passed
206/206 checks passed
51/51 checks passed
51/51 checks passed
48/48 checks passed
61/61 checks passed
74/74 checks passed
23/23 checks passed
23/23 checks passed
32/32 checks passed
EXIT=0
43 suites · 4380/4380 checks

=== npm run test:release on 14eeb8d1dcfcce39e88cc6ae052503dfc5d3172d at 20:44:05 v22.22.2
18/18 checks passed
11/11 checks passed
29/29 checks passed
37/37 checks passed
28/28 checks passed
73/73 checks passed
28/28 checks passed
1949/1949 checks passed
75/75 checks passed
116/116 checks passed
35/35 checks passed
44/44 checks passed
46/46 checks passed
73/73 checks passed
35/35 checks passed
43/43 checks passed
21/21 checks passed
9/9 checks passed
21/21 checks passed
17/17 checks passed
4/4 checks passed
82/82 checks passed
37/37 checks passed
36/36 checks passed
122/122 checks passed
79/79 checks passed
33/33 checks passed
82/82 checks passed
72/72 checks passed
240/240 checks passed
151/151 checks passed
88/88 checks passed
37/37 checks passed
40/40 checks passed
206/206 checks passed
51/51 checks passed
51/51 checks passed
48/48 checks passed
61/61 checks passed
74/74 checks passed
23/23 checks passed
23/23 checks passed
32/32 checks passed
1130/1130 checks passed
78/78 checks passed
752/752 checks passed
30/30 checks passed
10/10 checks passed
25/25 checks passed
26/26 checks passed
31/31 checks passed
55/55 checks passed
43/43 checks passed
59/59 checks passed
24/24 checks passed
17/17 checks passed
23/23 checks passed
28/28 checks passed
50/50 checks passed
EXIT=0
59 suites · 6761/6761 checks
```

Both from one clean detached worktree at `14eeb8d`, `git diff --check` clean, Node
v22.22.2, run separately and reported separately, neither wrapped in anything that turns
a nonzero exit into a success. `npm test` contains no emulator suite, which is why it is
not evidence about the six that matter most here.

Two earlier pairs of runs are superseded by the numbers above and are named so that nobody
compares against a tree that no longer exists: `3990de0` (this round WITHOUT the v99 served
from the same branch) at 43/4362 and 59/6725, and `847560c` (with v99, before the re-audit)
at 43/4366 and 59/6747. The re-audit's five pairs account for the whole of the difference —
`closure` 117→122, `data` 1944→1949, `status` 35→37 — and no suite was added or removed by
either round.

## The storm suite, repeatedly

Item 2 asks for the emulator suite at least ten times under load. Ten runs of
`tests/money.concurrency.test.mjs` against the real emulator, serially, on an idle machine:
**50/50 every run, ten out of ten.** Those ten were measured on `847560c`, which is this
round's production code before the re-audit; the five pairs added after it touch
`js/model/schema.js`, `js/state.js` and `js/ui/share.js` and none of them touches the send
path or the ledger container the storm suite exercises. On the final tree `14eeb8d` the
suite ran once, inside the release gate above: 50/50. Eleven runs in total, and the ten are
named against the commit they were measured on rather than carried over silently.

**A trap worth writing down.** Two earlier attempts at these runs came back 43/50 and
46/50 — the exact signature v98 closed — and both were self-inflicted: two of this
session's own background loops were running the suite at once, and
`firebase emulators:exec` binds the port from `firebase.json`, so they shared one emulator.
The suite's `reseed()` wipes the shared document, so each run was deleting the other's
record mid-test. `tests/README.md` already warns to pass `--config` with a private port
when running one beside another job; the websocket port is NOT taken from that config and
still collides, so the honest answer is to run them serially on an idle machine. The three
red runs are not evidence of anything about this build, and are recorded here so that
nobody re-opens the storm on them.

## Contract items NOT completed
Nothing of items 1–8 is open.

## Known gaps, measured and named
- **No phone has run any of this.** Nothing since v86 has. `docs/iphone-acceptance.md` now
  carries twelve rows for v97/v98 and every row in the file is still NOT RUN.
- **Both money gates are shut**, so four of the six repairs cannot be reached by any phone
  in the field. `features/gate-flip/contract.md` says what opening them requires; the
  decision is the owner's and this round does not take it.
- **`firestore.rules` is still not deployed.** Unchanged since v86's note, still the
  owner's to run, and the gate-flip contract puts it first in the order.
- **The emulator's original 1-in-28 flake is not proven gone by a reproduction.** What was
  closed here is a defect with exactly that end state, deterministic on the fake cloud.
  Whether the one red emulator run in the v98 round took this path cannot be known from its
  log.
- The mobile suite is Chromium, not Safari, and its 2× text pass is not Dynamic Type. Row
  18 of the acceptance list remains the only Dynamic Type coverage there is.

## Where this sits in the other plan

`features/next/opus-closeout.md` was written by the session that shipped v99 from this same
branch, and it lays the same ground out as waves. This round is not that plan and did not
follow it — its own brief was `features/next/brief-for-opus.md`, the eight items — but they
overlap, so plainly:

- **Wave 1: done here, both halves.** Items 1–4 of the eight-item brief, and the
  data-safety re-audit — five findings closed as pairs, two left open with reproductions,
  and `docs/data-safety-audit.md` now saying what is proven and by which suite above the
  v79 handover it keeps unedited.
- **Wave 2: the week strip's scroll cue and both hardening pins are done here.** The three
  day-screen changes that wave asks for — the header compacting on scroll, the mode
  switcher joining that row, the site cards' footer buttons becoming icons in the header —
  are NOT done.
- **Wave 5: the gate-flip contract is done here** (`features/gate-flip/contract.md`).
- **Waves 0, 3 and 4** are untouched by this round.

That plan numbers its publishes v100, v101 and so on. This build is v100 because v99 was
taken while it was being written; it is also that plan's Wave 1, which lands on the same
number by coincidence rather than by arrangement.
