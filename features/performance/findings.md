# What the app costs

The first measurement of this app's speed. Nothing here is a plan; it is what the clock
said, on one machine, at one commit, and what follows from it.

## Where these numbers came from, and what they are not

    commit      9e46032c310590983fd18c612455c1c4e105a238  (v103, before any fix in this wave)
    suite       tests/perf.test.mjs, `npm run test:perf`
    machine     Intel Xeon @ 2.80GHz, 4 cores, 16GB, Ubuntu 24.04 container
    runtime     node v22.22.2, Playwright 1.56.1, Chromium 1194, headless
    flags       --enable-precise-memory-info --js-flags=--expose-gc  (measurement only)
    method      median of repeated in-page runs, warm-ups discarded; every check prints
                its own min/max/n

**The container is shared, and other work was running in it.** Three independent runs of the
whole suite at the same commit agreed to within half a millisecond on every median and to
within a factor of two on `domInteractive`, which is the noisiest figure here and the one
budgeted for it - so the medians below are stable enough to act on. They are not laboratory
numbers, and a figure reproduced once on a quiet machine is worth more than any of them.

**These are desktop Chromium numbers in a container. They are a LOWER BOUND and nothing in
this document is a measurement of a phone.** No number below was taken on an iPhone, and
none may be reported as if it were. A phone is slower for reasons that do not multiply
cleanly - a smaller core, a colder cache, a thermally throttled clock, a different
localStorage implementation, and a compositor with less to spare - so this document does not
guess a multiplier. What it says instead is: the app takes at least this long, and the
places where the cost GROWS WITH THE RECORD are the places that will hurt first on a phone,
because the growth is a property of the code and survives any change of machine.

## The seeds

    fortnight   30 workers, 12 sites, 14 calendar days   ~29KB of JSON
    month       30 workers, 12 sites, 30 calendar days   ~56KB of JSON
    season      30 workers, 12 sites, 200 calendar days  171 working days, 4,617
                day records, ~366KB of JSON
    crew        30 / 60 / 120 workers, 12 sites, 14 days
    biggest     120 workers, 12 sites, everybody placed, by site

All built through the app's own model functions (`assignPlace` stamps each day's rates the
way a tap does) and written through `State.save`, so what the boot measurements read off the
disk is a record this app could actually have produced.

## The table

### Boot

| what | value | verdict |
|---|---|---|
| empty app: scripts parsed and run (`domInteractive`) | 200ms | fine |
| empty app: boot - read disk, replay journal, snapshot, first draw | 24.5ms | fine |
| empty app: answers a tap (`domContentLoadedEventEnd`) | 225ms | fine |
| season on disk: answers a tap | 168ms | fine |
| season on disk: boot itself | 76ms | fine |
| season on disk: first screen | 573 elements | fine |
| 600 unsent journal entries: answers a tap | 363ms | watch |

Boot is dominated by parsing and running the scripts, not by reading the record: 200ms of
the empty app's 225ms is `domInteractive`, and adding a season of days to the disk moves the
total by less than nothing (the second open is served by the service worker, which is what
every real evening after the first one is). The app's own boot work - `State.load`, the
journal replay, the daily snapshot and the first `render()` - is 24ms empty and 76ms on a
season. That is the right shape: the record is read once and the read is cheap.

### The day screen, on a fortnight

| crew | לפי עובדים | לפי אתרים | nodes (by worker / by site) |
|---|---|---|---|
| 30 | 2.3ms | 2.1ms | 248 / 378 |
| 60 | 4.8ms | 3.3ms | 460 / 603 |
| 120 | 15.6ms | 4.9ms | 883 / 1053 |

Fine on a fortnight, and the node counts are small - a tenth of the 5,000 that would make a
2019 phone stutter on layout alone. But look at the 120 row: the by-worker view costs three
times the by-site view while building FEWER nodes. That is not a drawing difference.

### The same two screens, on a season

| what | value | verdict |
|---|---|---|
| day screen, by worker | **12.5ms** | **not fine - grows with the record** |
| day screen, by site | 2.2ms | fine |
| week grid, 30 workers x 7 days | **36.1ms** | **not fine - grows with the record** |
| calls to `placeLabelsIn` per `renderDay()` (by worker) | **27** | the cause |
| calls to `placeLabelsIn` per `renderWeek()` | **81** | the cause |

Same rows, same crew, same day - a bigger record underneath, and the screen is six times
slower. `placeLabelsIn` (js/model/schema.js) walks EVERY day in the schedule looking for
sites the roster has lost, and it was being called from inside the per-row loop in
`js/ui/day.js` and the per-CELL loop in `js/ui/week.js`. Drawing thirty rows walked the
season thirty times; drawing one week walked it eighty-one. The map cannot change while a
screen is being drawn, so this is pure repetition. Fixed in this wave - see below.

### One tap, end to end, through the real button

| what | value | verdict |
|---|---|---|
| median of 25 taps on a fresh day, fortnight-sized record | 11.3ms | fine |
| first five vs last five of those 25 | 10.4ms -> 11.9ms | fine |

A tap runs `editWithUndo` -> `State.commit` -> the journal write, the whole-schedule
stringify, the verified write and read-back, and a full `render()`. Eleven milliseconds for
all of that is comfortable.

### One tap, on a phone whose writes are being refused

This is the number that is not fine, it is the one the crew would feel first, and it is the
state the owner's phone is in today - see the correction below the table.

| edits made so far | journal | save | render | total |
|---|---|---|---|---|
| 1-50 | 0.52ms | 0.57ms | 2.93ms | **4.0ms** |
| 251-300 | 2.24ms | 3.14ms | 4.23ms | **9.6ms** |
| 451-500 | 3.64ms | 5.40ms | 5.69ms | **14.7ms** |
| 551-600 | 9.98ms | 13.32ms | 9.81ms | **33.1ms** |

The six-hundredth edit costs **eight times** the first, and all three parts grow. The suite
fails on this deliberately; the reproduction is committed rather than the threshold
loosened, the way `test:sendclaim` was.

Two separate things are growing here and they need separating:

1. **The record grows, so the save grows.** `State.save()` stringifies the whole schedule,
   writes it, and reads it back to prove it landed (`Store.setVerified`, iron law 3). That
   is 0.7ms on a fortnight and 9.5ms on a season, and it is paid on every edit. This is the
   honest price of never claiming saved before a durable commit, and it is not a defect.
2. **The journal never shrinks while the writes are being refused.** `collectQueueGarbage`
   in `js/sync/sync.js` lets an operation go only when it is BOTH in a written schedule and
   acknowledged by the cloud (`op.sent`). A refused write is never sent, so it is never
   collectable, so **every edit made since the refusals began is still in the outbox**, in
   its own localStorage key, decoded on every queue write and replayed onto the schedule at
   every boot. The suite proves it: 600 edits, 600 pending paths, 601 storage keys, none
   collectable.

**This first said "on a phone with no cloud", and that was wrong.**
`js/sync/firebase-config.js` is NOT empty - it carries a live `farkad-schedule` config and
`SCHEDULE_DOC_PATH` - and the error was reading CLAUDE.md's "off until it is filled in" as a
statement about the current state rather than about the mechanism. The real state is worse:
the owner's iPhone showed «שגיאת סנכרון - הנתונים שמורים במכשיר הזה. (59 ממתינים לשליחה)» on
3 September 2026. The cloud is configured and the writes are being refused, so the growth
above is not hypothetical - it is running, at 59 and climbing by one per edit.

Nothing is lost and nothing is slow at 59; the durable outbox is doing its job. The remedy
is not a code change at all - deploying `firestore.rules` drains the queue and collection
resumes - and it is the owner's action, not this repository's. The rest is a change to how
an edit survives a crash, which is iron law 3 and the sync layer, so it gets a contract
rather than a patch: `features/performance/contract-journal-growth.md`.

### The reports screen, on a season

| range | pay + invoice arithmetic | whole screen redraw |
|---|---|---|
| a fortnight | 0.9ms | 2.8ms |
| a month | 1.1ms | 3.6ms |
| a season, 200 days | 4.9ms | 11.0ms |

Fine, and better than expected. `payrollReport` and `invoiceReport` walk the range once per
worker and once per site respectively; over 171 working days that is still single-digit
milliseconds. The season report is 3,021 nodes.

### Storage

| record | `State.save()` |
|---|---|
| fortnight, 29KB | 0.7ms |
| month, 56KB | 1.2ms |
| season, 366KB | 9.5ms |

Straight-line in the size of the record, as it must be: the whole document is stringified,
written and read back. 9.5ms on a season is acceptable; it is worth knowing that it is paid
thirty times an evening and that it will be several times that on a phone.

### Memory

| what | value | verdict |
|---|---|---|
| heap growth over 200 day-screen redraws (60 workers) | 2,058KB (~10KB each) | fine |
| heap holding a drawn day screen | 6MB | fine |

No leak. The day screen clears `root.innerHTML` and rebuilds every row with a fresh click
listener on every render, which is the classic way to leak detached nodes, and it does not:
two hundred redraws with a collection either side leave two megabytes behind, which is
ordinary churn rather than retention.

### The biggest realistic screen

120 workers, everybody placed, by site: **1,053 elements**, 153 buttons, 108 selects, 7
levels deep. Well under the 5,000 nodes at which layout itself becomes the thing a thumb
waits for. The DOM is not this app's problem.

## What is fine, and what is not

**Fine, with no action:** boot, the reports arithmetic and screen, memory, DOM size,
`State.save()` in itself, and the day screen on a fortnight-sized record.

**Not fine, fixed in this wave:** the site-label map rebuilt per row and per cell. Six times
the cost of the day screen by worker and nine times the cost of the week grid, on a record
that has been in use for a season - and the multiplier grows every week the crew keeps
using the app.

**Not fine, contracted and NOT fixed here:** the outbox that cannot prune while the writes
are being refused. It makes every edit more expensive than the last, without bound, and it
is happening on the owner's phone now. The remedy is to deploy `firestore.rules`, which is
the owner's action; changing when the one local rebuild of an unsent edit may be discarded
is iron law 3 and needs a person, not an agent.

## After the one fix this wave made

`placeLabelsIn` hoisted out of the per-row loop on the day screen, out of the per-cell loop
on the week grid, and out of the per-day loops in the worker-days modal and the worker's
WhatsApp statement. One map per draw, never held across draws. Same machine, same seeds,
median of eleven in-page runs, two independent runs agreeing to within half a millisecond:

| what | before | after |
|---|---|---|
| calls to `placeLabelsIn` per `renderDay()`, by worker | 27 | **1** |
| calls to `placeLabelsIn` per `renderWeek()` | 81 | **1** |
| day screen by worker, 30 workers, **season** | 12.5ms | **1.8ms** |
| week grid, 30 workers x 7 days, **season** | 36.1ms | **2.5ms** |
| day screen by worker, 120 workers, fortnight | 15.6ms | **2.8ms** |
| day screen by worker, 30 workers, fortnight | 2.3ms | 1.4ms |
| week grid, 30 workers, fortnight | 8.0ms | 2.9ms |

The reports screen moved from 11.0ms to 9.8ms and that is **noise, not the fix**:
`renderReports` never reached either of the two loops that were repaired there (the
worker-days modal and the worker's own WhatsApp statement, both opened from the reports
screen rather than drawn with it). Those two are not in the table because no baseline
figure was taken for them before the change; what is known about them is the shape - the
statement asked for the map once per day of itself, so a season's statement walked the
season a hundred and seventy times to write one message - and that shape is gone.

The two ways of looking at one day now cost the same on a season - 1.8ms and 2.0ms - where
they differed six-fold before. More important than either number: the cost has stopped
growing with the record. A screen that was 2.3ms on a fortnight and 12.5ms on a season would
have gone on getting worse every week the crew kept recording, and would have arrived at the
phone as "the app got slow this winter" with nothing to point at.

Nothing else was changed. Every other number in the table above is within the noise of the
run that produced it.

## The budgets

`tests/perf.test.mjs` now pins every one of these as a ceiling at **twice the larger of two
independent runs**, with a small absolute floor on the millisecond figures - twice 1.4ms is
2.8ms, and a single scheduler slice on a shared container is wider than that, so the small
screens get 2x plus a couple of milliseconds and the large ones get 2x. The node counts are
deterministic and are pinned tighter: 14 nodes per worker on the day screen against the 8
and 9 measured.

They are calibrated on **one machine class** and are a regression tripwire for a developer's
machine, not a portable specification. That is the second reason this suite is not in
`test:all` or `test:release`; the first is that a timing suite on a shared container will
eventually be red for a reason that is nobody's defect, and a red suite in this repository is
a stop.

## What a phone would do to these numbers

Nothing here says. Three of the numbers above will be worse on a phone for a reason this
container cannot show at all: `localStorage` on iOS is a synchronous main-thread write to a
SQLite-backed store, and the read-back in `Store.setVerified` is a second trip through it. So
the save column of the tap table is the one to be most suspicious of, and it is also the one
this repository is least willing to change. The right next measurement is not another run
here - it is the same suite pointed at a real device, which
`docs/iphone-acceptance.md` is the place to record.
