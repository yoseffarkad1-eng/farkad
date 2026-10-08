# Two pay cycles on one record

Source review updated **2026-10-08** against `js/dates.js`, the worker form in
`js/ui/roster.js`, and the existing ledger/report code. This describes implemented
behavior and the owner's intended dates; it does **not** establish the four workers'
current live settings, device acceptance, or release readiness.

The intended arrangement is four selected active workers settled every Thursday,
with the others continuing on their recorded fortnightly cycle. Both cycles run
Friday through Thursday — the seam this app has always cut on — so a weekly
period is exactly half a fortnight and never straddles one. That is what lets the two
cycles share one ledger: no week contains a day from two different fortnights, so a day
belongs to exactly one period whichever cycle pays the man.

## Current record: a history of boundaries

The writable worker field is **`payCycles`**, one canonical string containing dated
boundaries, for example:

```text
2026-10-02=weekly;2026-10-16=biweekly
```

Every boundary is a real Friday, uses `weekly` or `biweekly`, and is stored in strictly
increasing date order. The form adds a boundary while preserving existing ones; it does
not replace the history with the newest choice. A different cycle on an already recorded
Friday is refused. The history is shown read-only on the worker's form.

`payCycleAt` uses the last boundary at or before the date being reported. Missing history,
or a date before its first boundary, means **biweekly**. An unreadable history is distinct
from an absent one: `parsePayCycles` returns `null`, validation reports it, and the form
refuses to append to it. The record is retained. The display explains its temporary
biweekly fallback; that fallback is not approval to replace or erase the unreadable data.

The history travels as one worker field. Competing edits to that field use the existing
conflict handling rather than combining a cycle from one phone with a start date from
another. Synthetic sync tests are not proof that the family's phones have accepted a
particular live configuration.

New workers must explicitly choose weekly or biweekly. The form suggests the current
week's Friday and clears a previous worker's unsaved choice. An existing worker's form
opens with no proposed cycle change; a new cycle and its effective Friday must be supplied
together. The form rechecks current history and closures after awaited confirmations.

## Intended first weekly account: 2–8 October 2026

The start date was chosen: **Friday 2026-10-02**, as recorded in
[`reviews/v116-crew-controls.md`](reviews/v116-crew-controls.md) and reaffirmed in the
2026-10-08 handoff. The earlier statement that the date was unchosen is superseded.

| Intended configuration | Account containing 2026-10-08 |
| --- | --- |
| Selected worker with `2026-10-02=weekly` effective | Friday 2026-10-02 through Thursday 2026-10-08 |
| Unchanged biweekly worker on the existing account grid | Friday 2026-10-02 through Thursday 2026-10-15 |

The fortnight grid remains anchored at `ACCOUNT_ANCHOR = '2026-08-07'`; choosing a worker's
cycle does not move that global anchor. A weekly worker's next full week is 9–15 October.
Any additional history boundaries must be considered when checking a real worker.

**Live verification remains open.** Check the four selected active identities, their
recorded history and effective dates, the 2–8 October report range, carried balance,
advances, work, absences and overtime. Check existing closures and distinguish the
biweekly 2–15 October report. Similar or inactive names must not be selected by name
alone. No automatic name-based migration is authorized, and this document does not claim
that any live worker was configured, paid, or synchronized by this review.

## It applies forward, and says what it leaves behind

The form refuses a cycle boundary on or before the recorded end of an existing closed
period for that worker. Existing history is retained so a historical closure can still be
validated against the cycle that governed it. A closure applies to its own recorded date
range; overlapping closures are refused. Changing the cycle does not restamp historical
day rates or rewrite closed account figures.

`periodRangeFor` intersects a calendar period with the applicable history segment. A
boundary can leave a shorter **transition period**, reported separately rather than
folded into either neighbor. Returning to biweekly on the second Friday of a fortnight
can also create a short first period before rejoining the existing fortnight grid.

The worker's file shows both, before anything is saved: the first period of the new cycle,
and the stub behind it. It never says a past week was paid — nothing here knows that, and
guessing would be the one sentence on that screen that could cost somebody real money.

## Historical rationale retained

The original v113 design used separate `payCycle` and `payCycleFrom` fields. That design
is **superseded**: replacing the pair lost the cycle that governed old days, and independent
field merges could produce a combination neither phone chose. `payCycleHistory` retains
read compatibility with a valid legacy pair when `payCycles` contains no boundaries;
current worker edits write the single history field. `js/dates.js` records that the v113
build was not merged or served, though a bundle existed.

**`accountsBefore` stepped the calendar in fixed fortnights.** For a weekly man that
produced a period which *contains* the one being asked about — his week `09-11..09-17`
sits inside the fortnight `09-04..09-17` — so that fortnight was pushed as "before" and
every advance dated inside his own week was counted once as carried in and once as given.
Measured: 3,000 taken on 09-11 against a 1,950 week reported `carriedIn 1,050` and
`given 3,000` — an obligation of 4,050 from a 3,000 advance, and a man carrying 2,100
where he owed 1,050. Both halves were internally consistent and nothing said so. The walk
now steps in the man's own cycle and refuses any period that overlaps its target.

**`closedPeriods` is keyed by the opening Friday.** That answered every question correctly
while everybody was on one grid: two periods either began on the same Friday or shared no
day. A weekly man breaks it — his week and the fortnight containing it open on different
Fridays — so a fortnight closed over a week already closed would freeze the same days
twice and take the same advance off his wage twice. The question is asked about **days**
now. A closure that cannot be proved disjoint counts as overlapping, and the person
decides which period is the right one to settle him on.

## What the reports do

Reports label payment frequency for both homogeneous and mixed groups. A mixed report
splits weekly and biweekly rows; an all-weekly or all-biweekly report still names its
cycle. CSV/Excel include the payment-frequency column. The older policy of omitting a
cycle label from a homogeneous report is superseded by the v116 controls work.

Each group names the period it is settled over, in its own dates. A range that is not
somebody's whole period is a way of looking at days, not a payday: it carries no balance
and cannot be closed from, and the line says so.

**Payment frequency does not itself exclude a worker from site billing.** What a client
is billed does not depend on when a worker is paid. Explicit worker and site filters
still govern report views and exports: payroll totals follow the selected workers,
and an export for a worker subset omits the unfiltered site invoice.

## Historical validation record — not a current acceptance result

The earlier document recorded isolated validation of the owner's 2026-09-16 backup:
26 workers, 9 places, 35 dates, 2 advances, no vehicles; its 26 payroll rows and 9 invoice
rows were reported byte-identical to v112. That historical result has not been rerun as
part of this documentation update and says nothing about later entries or today's phones.

It also recorded a hypothetical weekly change from 2026-09-11 for `w_17`, `w_18`, `w_19`
and `w_24`, with unchanged day amounts and untouched inactive namesakes `w_12` and `w_13`.
**2026-09-11 was a test example, not the approved current start date.** Those historical
IDs are not sufficient evidence for changing today's roster.

## Verification and remaining acceptance

- Relevant automated coverage lives in `tests/paycycle.test.mjs`,
  `tests/paycycle.blockers.test.mjs`, `tests/paycycle.completion.test.mjs`,
  `tests/crew-controls.test.mjs`, and the closure suites. Counts and passing status belong
  to an exact tested head and its evidence, not to this guide.
- The four workers' **actual settings and 2–8 October account contents** still need
  authorized read-only confirmation. Do not edit live data to prove the feature.
- **No payment is ever created here.** Closing a period records what was deducted; it does
  not pay anybody.
- **Real iPhone/Android and cross-phone acceptance remain separate from automated tests.**
  This review supplies no new device evidence. Release still requires the full project
  gate, a current backup with isolated restore evidence, sensitive-path acceptance and
  explicit approval to merge and publish.
