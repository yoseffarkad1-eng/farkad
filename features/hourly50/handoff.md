# Handoff — `hourly50`: 50 ₪ an extra hour, the undecided hourly stamp, and a cycle edit with no mess

Branch `feat-hourly50`, cut from `dd9432b` (v206 served). Not pushed. Build stamps NOT moved
(the release's). Approved by the owner on 2026-11-20, in conversation, for exactly these four
things; the js/model change is ONE function.

## What was built

1. **The undecided hourly stamp** (js/model/money.js, `ratesForDay`, one const
   `HOURLY_ZERO_STAMP_UNDECIDED = true`).
   - A day stamped `{daily: D, hourly: 0}` is priced at D a day and the man's CURRENT hourly
     rate for its extra hours.
   - A stamped daily rate is never the roster's, and a stamped hourly rate above 0 is never
     replaced.
   - READING ONLY: no stamp is rewritten and no day is written. Writing the hourly into the stamp
     at the next write would turn a reading rule into a data migration, spread over whichever
     days happen to be edited. Reading time keeps the disk byte for byte and needs nothing in
     js/sync.
   - A closed period is read from its frozen record (`frozenPeriodFor`) and does not move. The
     closure judge's live-wage fallback can only see a HIGHER wage, so it can never condemn a
     closure.
2. **«שכר שעה נוספת 50 ₪ לכולם»** (js/ui/roster.js, `#hourlyFillRow` at the foot of the crew's
   workers panel).
   - Drawn only while a man (active or archived) has hourly 0 or none.
   - askConfirm names how many, then it is written through `State.commitRoster()`, and memory is
     rolled back on a refused commit.
   - A man with a rate keeps it.
   - A new man's form opens at 50, and he can still change it.
3. **«מחיקת השינוי האחרון»** (the worker form, under «רשום:»).
   - It removes the LAST boundary only.
   - It is offered only while every closed period of his stays one of his periods without it
     (`closedPeriods` + `isPeriodFor`).
   - askConfirm (danger) asks first, and the check is repeated after the answer.
   - Written through the roster writer.
4. **No mess in the form.**
   - (a) A cycle he already has on that Friday adds nothing, and the hint says so.
   - (b) A real change of an existing man's cycle is asked first, naming him, the Friday and the
     stub it leaves; «ביטול» keeps the form. A new man's first cycle is part of adding him and is
     unchanged.
   - (c) The edit form's date stays empty, as it already was, and the question names the date.
     This moved no add-form pin; prefilling the edit form instead would have.
   - (d) «עכשיו: כל שבוע/כל שבועיים.» comes before «רשום:».
   - (e) A date without a cycle is refused in plain words.

## Every figure that moved, and why

Every existing suite below ran green with NO pinned expectation of a figure moved. None of their
fixtures has a day stamped hourly 0 with extra hours AND a man whose roster hourly rate is above
0, which is the only case the rule changes.

The oracle's 240 seeded records have such days. It was taught the rule from the rule text and
agrees on all of them (122/122, including the new mutant "a stamped hourly 0 read as a decided
rate again", which goes red).

The fixtures that show the change are in tests/hourly50.test.mjs:
- H1: Yosef's 1000 → 1200;
- H2: a range that is not the closed period moves 2000 → 2150, and the closed one stays 2000.

## Expectations moved on purpose

- tests/paycycle.completion.test.mjs C3: the question held open while another phone writes is
  still the first one (the duplicate name). The cycle question that now follows it is answered
  yes, so the race under test is unchanged.

## Runs (commit 8bce951, with the suites' own later commits; no app byte changed after 8bce951)

- Node, one by one:

  | Suite | Result |
  |---|---|
  | hourly50 | 49/49 |
  | data | 1970/1970 |
  | money | 40/40 |
  | money.display | 4/4 |
  | money.units | 21/21 |
  | money.history | 9/9 |
  | money.ingress | 206/206 |
  | reportsclarity | 1119/1119 |
  | oracle | 122/122 |
  | closure | 122/122 |
  | closure.echo | 79/79 |
  | overpayment | 105/105 |
  | reports.speed | 167/167 |
  | payday | 302/302 |
  | statusscreen | 232/232 |
  | yearsummary | 239/239 |
  | workercard | 180/180 |
  | payslips | 202/202 |
  | monthsummary | 98/98 |
  | daycheck | 169/169 |
  | crew-controls | 46/46 |
  | paycycle | 43/43 |
  | paycycle.completion | 31/31 |
  | paycycle.blockers | 17/17 |
  | wording | 37/37 |
  | approval | 72/72 |
  | repayment | 240/240 |
  | owes | 190/190 |
  | weeklyclose | 146/146 |
  | closeorder | 22/22 |
  | advancereset | 77/77 |
  | account-view | 456/456 |
  | usual | 150/150 |
  | nonassertions | 23/23 |
  | isolation | 18/18 |

- build 68/69 and gate.integrity 19/20 fail ONLY on the stamp checks (cached files changed; the
  release moves the stamps).
- Browser through `bt`: hourly50.browser 22/22, roster.browser 42/42, forms.browser 32/32,
  smoke 1186/1186, design.browser 72/72, mobile 1397/1397, largetext.browser 9137/9137.
- Pictures (375, light) are in scratchpad/shots/hourly50/:
  - Yosef before (1000, «לא נכללו בסכום») and after (1200);
  - the crew button, its question and its result;
  - «עכשיו:» and the way back, and its question;
  - Yosef's fortnight after the undo;
  - the cycle question.

## NOT done

- Not tried on a real phone.
- The crew row sits after the workers list. A long crew has to scroll to it; that was chosen to
  move no pinned rectangle above the list.
- The new Hebrew is PROPOSED and pinned in tests/hourly50.*.
- «מה חדש», docs/releases.md and CLAUDE.md are the release's.
- The full npm test chain as one command, test:all and test:release were not run; that gate is
  the release's.
