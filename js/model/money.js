// ---------------------------------------------------------------- the money, computed
//
// Split out of js/model/schema.js at v102. The code is unchanged: the same functions in
// the same order. Nothing was renamed and nothing was tidied on the way past.
//
// WHAT THIS FILE OWNS: what a day was worth, and what a fortnight adds up to. The rate a
// day is priced at, the payroll report, the invoice, the advances walk and the closed
// period. Every number a person is paid or billed comes out of here.
//
// WHAT IT MUST NEVER DO:
//   - be anything but PURE. These are functions of a schedule and a range: no storage, no
//     DOM, no clock of their own. That is what lets the same arithmetic be checked on the
//     screen, in the WhatsApp message and inside a real .xlsx and be required to agree.
//   - restate a day at today's rate. A day keeps the rate it was worked at - stamped onto
//     the record at first write, surviving every later edit - and a report prices each day
//     at its own stamp. planRateStamping reports what restating would do and deliberately
//     does not do it.
//   - price one day twice. A closed fortnight is frozen for ITS OWN period and no other;
//     v100 shipped because a closure was being applied to any range that merely started on
//     its opening Friday, and the ordinary month preset then billed a day it had also paid.

// ---------------------------------------------------------------- what a day was worth
//
// The rate a day was worked at belongs to the DAY, not to the worker's row in the roster.
//
// It used to be read from the roster at report time, so raising somebody's daily rate
// silently restated every day they had ever worked - including days already invoiced to
// a client and already paid. Correcting a typo in a rate did the same thing. The number
// on last account's pay sheet would simply be different the next time it was opened, with
// nothing to say it had changed.
//
// So a day records what it was worth when it was recorded, and keeps it through every
// later edit to that day.
function currentRates(schedule, workerId) {
    const worker = (schedule.workers || []).find(w => w && w.id === workerId);
    if (!worker) return null;

    const daily = Number(worker.dailyRate) || 0;
    const hourly = Number(worker.hourlyRate) || 0;
    // Nothing worth stamping. A worker with no rate yet is a rate that has not been
    // decided, and freezing "no rate" onto the day would make it permanent.
    if (daily <= 0 && hourly <= 0) return null;

    return { daily, hourly };
}

// What a given day should be paid at. The stamp if it has one; the roster otherwise.
//
// The fallback is what makes this safe to ship over data that already exists: every day
// recorded before this carries no stamp and goes on behaving exactly as it did. Stamping
// those retroactively would be inventing what somebody was paid, which is not a decision
// this code is allowed to take - see planRateStamping.
function ratesForDay(schedule, date, workerId, worker) {
    const record = workerDay(schedule, date, workerId, 'actual');
    if (record && record.rates) {
        return {
            daily: Number(record.rates.daily) || 0,
            hourly: Number(record.rates.hourly) || 0,
            stamped: true
        };
    }
    return {
        daily: Number(worker.dailyRate) || 0,
        hourly: Number(worker.hourlyRate) || 0,
        stamped: false
    };
}

function setWorkerDay(schedule, date, workerId, layer, record) {
    const previous = workerDay(schedule, date, workerId, layer);
    const side = ensureDay(schedule, date, layer);

    const next = {};
    Object.keys(record).forEach(key => { next[key] = record[key]; });

    if (previous && previous.rates) {
        // Already stamped. Removing one of two sites, changing a rate band, correcting a
        // site - none of those are a reason to restate what the day was worth.
        next.rates = previous.rates;
    } else if (layer === 'actual' && !record.absent && (record.entries || []).length > 0) {
        const rates = currentRates(schedule, workerId);
        if (rates) next.rates = rates;
    }

    side[workerId] = next;
    return { path: fieldPath(date, layer, workerId), value: next };
}

// What stamping the days that carry no rate WOULD do. It does not do it.
//
// Every day recorded before rates were stamped has no confirmed historical rate: the
// roster holds today's number, and whether that is what the man was actually paid in
// March is not something anyone can read out of this data. Writing today's rate onto
// those days would freeze a guess into the pay record and make it look confirmed.
//
// So this reports the change and stops. The decision is the owner's.
function planRateStamping(schedule) {
    const changes = [];

    Object.keys(schedule.days || {}).sort().forEach(date => {
        const side = (schedule.days[date] || {}).actual || {};
        Object.keys(side).forEach(workerId => {
            const record = side[workerId];
            if (!record || record.rates) return;
            if (record.absent || (record.entries || []).length === 0) return;

            const rates = currentRates(schedule, workerId);
            if (!rates) return;

            const worker = (schedule.workers || []).find(w => w && w.id === workerId);
            changes.push({
                date,
                workerId,
                name: worker ? worker.name : workerId,
                daily: rates.daily,
                hourly: rates.hourly
            });
        });
    });

    return { days: changes.length, changes };
}

function assignPlace(schedule, date, workerId, layer, placeId, rate, extraHours) {
    const existing = entriesFor(schedule, date, workerId, layer)
        .filter(entry => entry.placeId !== placeId);

    // The cap is enforced HERE, not only on the screen that knows about it. A third site
    // can arrive from a copy-yesterday, from a migration decision, or from another phone
    // - none of which go through that screen. A day with three sites is still paid as one
    // day, so it does not overpay anybody; it means somebody's day is recorded wrong, and
    // recording it wrong quietly is what this refuses.
    //
    // The refusal is RETURNED. Swallowing it would leave a caller believing it wrote.
    if (existing.length >= MAX_ENTRIES_PER_DAY) {
        return {
            refused: true,
            reason: `אפשר לרשום עד ${MAX_ENTRIES_PER_DAY} אתרים ליום לעובד.`
        };
    }

    // Adding, not replacing: two sites in a day is the normal case here, so a second
    // assignment must not silently discard the first.
    const entries = existing.concat([makeEntry(placeId, rate, extraHours)]);

    return setWorkerDay(schedule, date, workerId, layer, { entries });
}

// Days already recorded above the cap. Reported, never trimmed: those entries are days
// somebody worked, and deleting data to satisfy a rule written afterwards is the one
// thing a record of pay must not do. They are surfaced so a person can look and decide.
function daysOverCap(schedule) {
    const over = [];

    Object.keys(schedule.days || {}).sort().forEach(date => {
        ['plan', 'actual'].forEach(layer => {
            const side = (schedule.days[date] || {})[layer] || {};
            Object.keys(side).forEach(workerId => {
                const entries = (side[workerId] && side[workerId].entries) || [];
                if (entries.length > MAX_ENTRIES_PER_DAY) {
                    over.push({ date, layer, workerId, count: entries.length });
                }
            });
        });
    });

    return over;
}

function unassignPlace(schedule, date, workerId, layer, placeId) {
    const entries = entriesFor(schedule, date, workerId, layer)
        .filter(entry => entry.placeId !== placeId);

    return setWorkerDay(schedule, date, workerId, layer, { entries });
}

function setRate(schedule, date, workerId, layer, placeId, rate, extraHours) {
    const entries = entriesFor(schedule, date, workerId, layer)
        .map(entry => entry.placeId === placeId
            ? makeEntry(placeId, rate, extraHours)
            : entry);

    return setWorkerDay(schedule, date, workerId, layer, { entries });
}

function markAbsent(schedule, date, workerId, layer) {
    return setWorkerDay(schedule, date, workerId, layer, { absent: true, entries: [] });
}

function clearWorkerDay(schedule, date, workerId, layer) {
    return setWorkerDay(schedule, date, workerId, layer, { entries: [] });
}

// ---------------------------------------------------------------- reports

// Per worker, over a date range: the sheet pay is calculated from.
//
// The unit is the DAY, not the assignment. Two sites in one day is one day's pay - the
// travelling does not earn more - so counting assignments here would overpay every time
// someone moved between sites, which happens most days.
//
// The rules, as given:
//   a normal day        = the daily rate
//   a double day        = twice the daily rate, exactly
//   extra hours         = the worker's hourly rate, per hour, on top
//   two sites in a day  = still one day
//
// A day where one site was normal and another was double is paid as a double day: the
// person worked the longer day, and it is paid once at the highest level worked.
function payrollReport(schedule, fromDate, toDate) {
    const dates = Object.keys(schedule.days || {})
        .filter(date => date >= fromDate && date <= toDate)
        .sort();

    return schedule.workers.map(worker => {
        // Two counts, deliberately, because they answer two different questions and one
        // number was being made to answer both.
        //
        //   attendanceDays - how many DATES this man was on a site. Two sites on one
        //                    date is one day; he was there once.
        //   payUnits       - how many days he is PAID for. A double day is two of them.
        //
        // The sheet used to print only the first, next to a total computed from the
        // second, so four days at 450 came out as 2700 and looked like an arithmetic
        // mistake. Neither number was wrong; the sheet was only showing one of them.
        const row = {
            workerId: worker.id,
            name: worker.name,
            attendanceDays: 0,
            payUnits: 0,
            normalDays: 0,
            doubleDays: 0,
            extraHours: 0,
            siteVisits: 0,
            absent: 0
        };

        // Summed day by day, because each day is paid at the rate it was RECORDED at.
        // Multiplying a day count by today's rate is what silently restated the past
        // every time somebody's rate was corrected or raised.
        let total = 0;
        let unpriced = false;
        const dailyRatesUsed = new Set();

        dates.forEach(date => {
            if (isAbsent(schedule, date, worker.id, 'actual')) {
                row.absent++;
                return;
            }

            const entries = entriesFor(schedule, date, worker.id, 'actual');
            if (entries.length === 0) return;

            // Once per DATE, whatever is on it. Two sites in one day is two entries and
            // one day of work - counting the entries would pay a man twice for standing
            // in two places.
            row.attendanceDays++;
            row.siteVisits += entries.length;

            // `some`, not a count: a double day is double whether it carries one site or
            // two, so two sites on a double day is two pay units and never four.
            const doubled = entries.some(entry => entryRate(entry) === RATE_DOUBLE);
            if (doubled) row.doubleDays++;
            else row.normalDays++;
            row.payUnits += doubled ? 2 : 1;

            const hours = entries.reduce((sum, entry) => sum + entryExtraHours(entry), 0);
            row.extraHours += hours;

            const rates = ratesForDay(schedule, date, worker.id, worker);
            dailyRatesUsed.add(rates.daily);

            if (rates.daily <= 0) {
                unpriced = true;
                return;
            }
            if (hours > 0 && rates.hourly <= 0) row.hoursUnpriced = true;

            total += rates.daily * (doubled ? 2 : 1) + rates.hourly * hours;
        });

        const daily = Number(worker.dailyRate) || 0;
        const hourly = Number(worker.hourlyRate) || 0;

        row.dailyRate = daily;
        row.hourlyRate = hourly;
        // Only a number when there is a rate to multiply by. Showing 0 for a worker whose
        // rate has not been entered would read as "owed nothing", which is a different
        // thing entirely.
        if (row.attendanceDays === 0) row.amount = daily > 0 ? 0 : null;
        else row.amount = unpriced ? null : total;

        // A sheet whose total cannot be checked against the rate printed beside it has to
        // say so, or it reads as an arithmetic mistake. Two ways that happens:
        //
        //   more than one rate inside the period - a raise partway through it; or
        //   every day at one rate that is no longer the rate on the roster today.
        //
        // The second was missed. All the days would be stamped 450, the column would
        // print today's 900, and nothing anywhere said why 7 days came to 3270 - which is
        // the same complaint that split this count in two: a number printed next to a
        // total it does not explain.
        row.mixedRates = dailyRatesUsed.size > 1
            || (daily > 0 && row.attendanceDays > 0 && !dailyRatesUsed.has(daily));
        row.hoursUnpriced = Boolean(row.hoursUnpriced);

        // What was earned and what is still owed are two different numbers, and paying
        // the first one twice is the whole reason advances are recorded at all.
        row.advances = advancesTotal(schedule, worker.id, fromDate, toDate);

        // What his vehicles earned, kept as its own number rather than folded into the
        // day rate. It is a different thing being paid for - the vehicle went out, and
        // whether he went with it is not the question - so a sheet that added the two
        // together would show a man 5 days at 450 coming to 3750 and explain nothing.
        const vehicles = vehiclePayFor(schedule, worker.id, fromDate, toDate);
        row.vehicleDays = vehicles.days;
        row.vehicleAmount = vehicles.amount;

        // A man who did not work but whose vehicle did is still owed. amount is null only
        // when a rate is missing for days he DID work; nothing here is unpriced.
        if (row.vehicleAmount > 0 && row.amount === null && row.attendanceDays === 0) {
            row.amount = 0;
        }
        if (row.amount !== null) row.amount += row.vehicleAmount;

        // Only a POSITIVE advance is money that was handed over, and only that is netted.
        // A negative one is not a repayment this build knows how to account for; netting
        // it reports a man as owed MORE than he earned, which is exactly how gross 400
        // with an advance of -500 came out as 900 - on a document that passed every gate
        // this build had. The amount stays in `advances` so the screen can show it and a
        // person can see there is money here the app is refusing to account for.
        const netted = row.advances > 0 ? row.advances : 0;
        row.netAmount = row.amount === null ? null : row.amount - netted;

        // A CLOSED FORTNIGHT REPORTS THE ROW IT WAS CLOSED ON.
        //
        // C4 froze the three money columns and left the counts and the day list beside
        // them live, so removing one historical day from a paid fortnight moved
        // attendanceDays 5 -> 4, payUnits 5 -> 4 and this amount 3,050 -> 2,440 while the
        // deduction column stayed 3,050 - a row that no longer adds up, on the sheet the
        // crew is paid from. Half a frozen payslip is not a payslip.
        //
        // Only where the closure RECORDED them: a closure from before this carries no
        // basis and nothing is invented for it. See closedPeriods, which never coerces.
        //
        // AND WITH NO GATE IN FRONT OF IT, deliberately. The carry flag says what this
        // build may write and how it reads an account; a closure is a fact on the shared
        // record, and a phone whose gate is still shut recomputing a fortnight that the
        // phone with the gate open closed is two phones printing different money for
        // one payday. Pinned in tests/closure.test.mjs, «a fortnight closed on one
        // phone is frozen on a phone whose gate is shut».
        const frozen = frozenPeriodFor(schedule, worker.id, fromDate, toDate);
        if (frozen !== undefined) {
            if (Number.isFinite(frozen.gross)) {
                row.amount = frozen.gross;
                row.netAmount = frozen.gross - netted;
            }
            if (isPlainObject(frozen.basis)) {
                // Every count the sheet prints, where the closure recorded it. A closure
                // from before a given field exists carries none, and that column is the
                // live one - which is the same fallback the wage takes.
                ['attendanceDays', 'payUnits', 'normalDays', 'doubleDays', 'extraHours',
                    'siteVisits', 'absent'].forEach(field => {
                        if (Number.isFinite(Number(frozen.basis[field]))) {
                            row[field] = Number(frozen.basis[field]);
                        }
                    });
            }
        }

        return row;
    });
}

// One worker, day by day, with the same arithmetic the pay sheet totals - because the
// question this answers is "why is my pay this number", and an answer computed a second
// way is not an answer.
function workerDaysReport(schedule, worker, fromDate, toDate) {
    // THE DAYS A CLOSED FORTNIGHT WAS PAID FOR, as it recorded them.
    //
    // This list is what the man is handed and asked to agree with - it is the answer to
    // "why is my pay this number" - and it was recomputed from the live schedule on every
    // read, so a day corrected off a paid fortnight quietly disappeared from a statement
    // whose total, by then, was frozen. The two halves of one document disagreeing.
    //
    // Only where the closure carries them: an older closure has no list and this behaves
    // as it always did.
    const frozen = frozenPeriodFor(schedule, worker.id, fromDate, toDate);
    if (frozen !== undefined && Array.isArray(frozen.days)) {
        return frozen.days.map(day => ({
            date: String(day.date),
            absent: Boolean(day.absent),
            entries: Array.isArray(day.entries) ? day.entries.map(one => {
                const entry = { placeId: String(one.placeId || '') };
                if (one.rate !== undefined) entry.rate = one.rate;
                if (one.hours !== undefined) entry.hours = one.hours;
                return entry;
            }) : [],
            doubled: Array.isArray(day.entries)
                && day.entries.some(one => String(one.rate) === String(RATE_DOUBLE)),
            extraHours: Array.isArray(day.entries)
                ? day.entries.reduce((sum, one) => sum + (Number(one.hours) || 0), 0) : 0,
            amount: Number(day.amount) || 0
        }));
    }
    return Object.keys(schedule.days || {})
        .filter(date => date >= fromDate && date <= toDate)
        .sort()
        .map(date => {
            if (isAbsent(schedule, date, worker.id, 'actual')) {
                return { date, absent: true, entries: [], doubled: false, extraHours: 0, amount: 0 };
            }

            const entries = entriesFor(schedule, date, worker.id, 'actual');
            if (entries.length === 0) return null;

            const doubled = entries.some(entry => entryRate(entry) === RATE_DOUBLE);
            const extraHours = entries.reduce((sum, entry) => sum + entryExtraHours(entry), 0);
            const rates = ratesForDay(schedule, date, worker.id, worker);

            return {
                date,
                absent: false,
                entries,
                doubled,
                extraHours,
                dailyRate: rates.daily,
                // True when this day is not at the rate the roster shows today, so the
                // line can say why it does not match.
                historic: rates.stamped && rates.daily !== (Number(worker.dailyRate) || 0),
                amount: rates.daily > 0
                    ? rates.daily * (doubled ? 2 : 1) + rates.hourly * extraHours
                    : null
            };
        })
        .filter(Boolean);
}

// Per place, over a date range: worker-days at each site, which is what the client
// invoice is built from.
// The same two counts, over the day rows one worker's detail screen is built from.
//
// It exists so that the pay sheet, the detail modal, the message sent to the worker and
// the exported file cannot disagree: every one of them asks THIS, and none of them counts
// anything for itself. The bug that started this was one screen printing a count of dates
// beside a total computed from pay units, and there is no way to keep four places in step
// by hand.
//
// Absences are not attendance. A man who was away was not on a site, and paying him for
// the day he was away is the one arithmetic nobody wants to explain.
function workerDaysSummary(days) {
    const worked = (days || []).filter(day => day && !day.absent);

    return {
        attendanceDays: worked.length,
        payUnits: worked.reduce((sum, day) => sum + (day.doubled ? 2 : 1), 0),
        doubleDays: worked.filter(day => day.doubled).length,
        // Reported beside the days and never folded into them: extra hours are paid at
        // the hourly rate, and adding them to a day count would restate the day itself.
        extraHours: worked.reduce((sum, day) => sum + (Number(day.extraHours) || 0), 0),
        absent: (days || []).filter(day => day && day.absent).length,
        // The real sum of what each day was worth at the rate it was RECORDED at - never
        // payUnits times today's rate, which quietly repays the past at the new price.
        amount: worked.some(day => day.amount === null)
            ? null
            : worked.reduce((sum, day) => sum + (day.amount || 0), 0)
    };
}

function invoiceReport(schedule, fromDate, toDate) {
    const dates = Object.keys(schedule.days || {})
        .filter(date => date >= fromDate && date <= toDate)
        .sort();

    // The roster first, then every site the days name that the roster has not got. A
    // sheet built by walking the roster alone drops those days off the invoice while the
    // pay sheet still pays for them - three sheets in one file, and the money in them not
    // adding up to the same fortnight.
    const labels = placeLabelsIn(schedule, fromDate, toDate);
    const columns = schedule.places.map(place => ({ id: place.id, name: place.name }))
        .concat(unlistedPlaceIds(schedule, fromDate, toDate)
            .map(id => ({ id, name: placeLabelFrom(labels, id) })));

    return columns.map(place => {
        const row = { placeId: place.id, name: place.name, workerDays: 0, byDate: {}, days: [] };

        dates.forEach(date => {
            const workerIds = workersAtPlace(schedule, date, place.id, 'actual');
            if (workerIds.length === 0) return;

            row.byDate[date] = workerIds.length;
            row.workerDays += workerIds.length;
            // The client is invoiced day by day, so the detail has to survive the
            // aggregation rather than be recomputed by whoever reads the total.
            row.days.push({ date, count: workerIds.length, workerIds });
        });

        return row;
    });
}

// Every date in the range that had any work, with each site's count. This is the shape
// the printed invoice reads down: one row per day, one column per site.
function invoiceByDate(schedule, fromDate, toDate) {
    const rows = invoiceReport(schedule, fromDate, toDate).filter(row => row.workerDays > 0);

    const dates = new Set();
    rows.forEach(row => row.days.forEach(day => dates.add(day.date)));

    return {
        places: rows,
        dates: Array.from(dates).sort(),
        countAt(placeId, date) {
            const place = rows.find(row => row.placeId === placeId);
            return (place && place.byDate[date]) || 0;
        },
        total: rows.reduce((sum, row) => sum + row.workerDays, 0)
    };
}
