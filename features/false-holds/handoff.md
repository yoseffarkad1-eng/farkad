# Handoff — v99: the holds nobody disagreed about

- Branch: `claude/farkad-mobile-design-review-odl8ue`
- SHA: FINAL_SHA
- Base: `4a4d277` (v98 as served, `5dd5a83`, plus the brief this round was given)
- Build stamps at that SHA: `farkad-build` v99 · `APP_VERSION` v99 · `VERSION` farkad-v99
- Gates: `LEDGER_WRITES` false, `carryAdvances` false. Neither moved.
- Contracts: `features/false-holds/contract.md` (items 1–4), `features/gate-flip/contract.md`
  (item 8 — a checklist, no code)

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

## Expectations moved deliberately
- `tests/exports.test.mjs`, three pins of the WhatsApp message (the owner's template, the
  one-site message, the absence-only day): every name now carries U+2068…U+2069. Written
  into the pins rather than stripped from the comparison, so dropping the isolates fails
  them.
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

GATE_OUTPUT

## The storm suite, repeatedly

Item 2 asks for the emulator suite at least ten times under load. STORM_SUMMARY

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
