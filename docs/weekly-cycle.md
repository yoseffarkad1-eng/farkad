# Two pay cycles on one record

Four of the crew are settled every Thursday; everybody else every second Thursday. Both
weeks run Friday through Thursday — the seam this app has always cut on — so a weekly
period is exactly half a fortnight and never straddles one. That is what lets the two
cycles share one ledger: no week contains a day from two different fortnights, so a day
belongs to exactly one period whichever cycle pays the man.

## Where the setting lives

On the worker, as two fields that travel together:

- `payCycle` — `weekly` or `biweekly`.
- `payCycleFrom` — the **Friday** it takes effect.

**Absent means every second Thursday**, which is what every worker was before the field
existed. A backup written last month therefore opens cut exactly the way it was cut when
it was written. An unreadable value reads as absent for the same reason: the safe reading
of "I do not understand this" is the way it has always been done, never a new way nobody
chose.

Either field alone is refused at the form. A cycle with no date is not in force, and a
date with no cycle names nothing — either half alone is a setting somebody believes they
made and the arithmetic has never heard of.

## It applies forward, and says what it leaves behind

A change never re-cuts a period somebody has already been paid for. The fortnight the
change interrupts becomes its own **transition period**, ending the day before the new
cycle opens, and it is reported separately: folding it forward would pay those days inside
a week they do not belong to, and folding it back would reopen a period that may already
be closed.

The worker's file shows both, before anything is saved: the first period of the new cycle,
and the stub behind it. It never says a past week was paid — nothing here knows that, and
guessing would be the one sentence on that screen that could cost somebody real money.

## What the engine had to learn

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

The sheet splits into a weekly group and a fortnightly group **only when the crew is
actually paid two ways**. On a record where nobody is weekly it is the sheet people have
been reading for months, unchanged — a heading that says «דו־שבועי» over a sheet where
everybody is teaches people to stop reading headings.

Each group names the period it is settled over, in its own dates. A range that is not
somebody's whole period is a way of looking at days, not a payday: it carries no balance
and cannot be closed from, and the line says so.

**Totals and site invoices count every worker regardless of cycle.** What a client is
billed has nothing to do with when a man is paid.

## Measured on the real record

Yusuf's backup of 2026-09-16, read locally and never committed: 26 workers, 9 places, 35
dates, 2 advances, no vehicles. All 26 payroll rows and all 9 invoice rows are
byte-identical to v112.

With `w_17`, `w_18`, `w_19` and `w_24` moved to weekly from Friday 2026-09-11, **no
worker's amount moves at all** — the cycle changes which period settles a man, not what a
day is worth — and `w_12` and `w_13`, the inactive namesakes, are untouched.

## Still open

- **The effective date is not chosen.** Everything above is implemented and tested against
  2026-09-11 as a worked example. The real date is Yusuf's to name, and until he does no
  worker is on a weekly cycle.
- **No payment is ever created here.** Closing a period records what was deducted; it does
  not pay anybody.
- **Nothing was checked on an iPhone.**
