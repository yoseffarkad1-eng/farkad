// The v2 data model.
//
// v1 stored one flat list of {index, value} where index was a cell's position in the DOM.
// That could not express what actually happens: a worker at two sites in one day, a rate
// per site, or any day outside the single week on screen. It also made every write a
// whole-document replacement, which is unsafe now that three people build the roster
// together in the evening.
//
// v2 is keyed by date and worker id:
//
//   days["2026-08-12"].plan["w_01"]   = { entries: [{ placeId }] }
//   days["2026-08-12"].actual["w_01"] = { entries: [{ placeId, rate, extraHours }] }
//   days["2026-08-12"].actual["w_02"] = { absent: true, entries: [] }
//
// plan   = the seder written the night before, by whoever is doing it
// actual = what really happened, recorded after work; this is what pay and invoices
//          are calculated from
//
// Because every value hangs off a (date, worker) path, two people editing different
// workers touch different fields and never collide.

const SCHEMA_VERSION = 2;

const RATE_NORMAL = 'normal';
const RATE_EXTRA = 'extra';
const RATE_DOUBLE = 'double';
const RATES = [RATE_NORMAL, RATE_EXTRA, RATE_DOUBLE];

const RATE_LABELS = {
    [RATE_NORMAL]: 'רגיל',
    [RATE_EXTRA]: 'שעות נוספות',
    [RATE_DOUBLE]: 'יום כפול'
};

// A worker can be at two sites in one day. This is the ceiling the manager confirmed;
// it exists so the UI can size itself, not to reject data that is already stored.
const MAX_ENTRIES_PER_DAY = 2;

function emptySchedule() {
    return {
        schemaVersion: SCHEMA_VERSION,
        workers: [],
        places: [],
        days: {},
        // Money handed over before settlement day, keyed by its own id so two people
        // recording an advance at the same moment write to different fields.
        advances: {},
        updatedAt: null,
        updatedBy: null
    };
}

// ---------------------------------------------------------------- advances
//
// An advance is cash given mid-account, and it is the one number that turns a pay sheet
// into the wrong pay sheet: the days are right, the rate is right, and the man was
// already paid 500 of it a week ago. Kept as its own record rather than folded into the
// total, so the statement can show what was earned AND what is left.

function advanceId() {
    return 'a_' + Math.random().toString(36).slice(2, 10);
}

// ---------------------------------------------------------------- identity
//
// Ids used to be one past the highest in the list. Two phones holding the same roster -
// which is the normal state of three people sharing one record - therefore handed the
// same id to two different men, and from that moment every day recorded against it
// belonged to whichever of them the reading device happened to have. That is a pay
// sheet, not a display glitch, and nothing anywhere would have said so.
//
// A random id cannot collide by construction, so no coordination is needed and it works
// offline, which is where the two additions actually happen.
//
// Ids ALREADY ISSUED are never touched. w_01 stays w_01: every day, advance and archived
// copy in existence points at it, and renaming an id is the one operation that would
// detach a man from his own history.
function newEntityId(prefix) {
    const bytes = (typeof crypto !== 'undefined' && crypto && typeof crypto.randomUUID === 'function')
        ? crypto.randomUUID().replace(/-/g, '')
        : Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
    return `${prefix}_${bytes.slice(0, 12)}`;
}

// What is wrong with a roster, said in sentences rather than repaired.
//
// A duplicate id in an imported file is genuinely ambiguous: two rows claim to be the
// same person, their days are already merged under one id, and there is no way to tell
// from here which day belonged to whom. Renumbering one of them silently would invent an
// answer and hide the question. So the import stops and the file is left alone.
function validateRosterIds(raw) {
    const problems = [];

    [['workers', 'עובד'], ['places', 'אתר']].forEach(([kind, label]) => {
        const list = Array.isArray(raw && raw[kind]) ? raw[kind] : [];
        const seen = new Set();

        list.forEach((item, index) => {
            const id = item && item.id !== undefined && item.id !== null ? String(item.id) : '';
            const name = (item && item.name) ? String(item.name) : `#${index + 1}`;

            if (!id) {
                problems.push(`${label} "${name}" בקובץ בלי מזהה.`);
                return;
            }
            if (seen.has(id)) {
                problems.push(`המזהה ${id} מופיע ביותר מ${label} אחד ("${name}").`);
                return;
            }
            seen.add(id);
        });
    });

    return problems;
}

// ---------------------------------------------------------------- the wire form
//
// The document as it is stored in the cloud. It is the local schedule plus the roster a
// SECOND time, keyed by id.
//
// The arrays alone were the problem: an array cannot be merged element by element, so a
// roster change had to send the whole thing, and two phones each sending their own whole
// roster meant the second one erased the first one's new man. His days stayed in the
// document and his row left the report, so a week of somebody's pay went missing with
// nothing on screen to say it had.
//
// Keyed by id, each man is his own field and two phones adding two men write two
// different paths. Order is a field of its own, because the order IS meaningful - it is
// the order every screen reads in - and it is the one part where last-write-wins costs
// nothing: the worst case is a list in somebody else's preferred order.
//
// The arrays are still written, and that is deliberate. A phone that has not updated yet
// reads them and sees a correct roster; it cannot see `roster` and never writes to it.
// They can be dropped once all three devices are past v72 - not before.
function cloudDocument(schedule) {
    const wire = JSON.parse(JSON.stringify(schedule));
    wire.roster = rosterDocument(schedule);
    return wire;
}

function rosterDocument(schedule) {
    const byId = list => {
        const out = {};
        (list || []).forEach(item => { if (item && item.id) out[String(item.id)] = item; });
        return out;
    };
    const ids = list => (list || []).filter(item => item && item.id).map(item => String(item.id));

    return {
        workers: byId(schedule.workers),
        places: byId(schedule.places),
        workerOrder: ids(schedule.workers),
        placeOrder: ids(schedule.places)
    };
}

// The reverse: the two forms of the roster, back into the one ordered array the app works
// in. They are MERGED, not chosen between, and that is the whole of it.
//
// Reading the per-entity map alone looks right and is catastrophic. Only the people who
// CHANGED are written into it - that is the point, so a stale copy of somebody cannot be
// put back - so a document that has always held plain arrays and then receives its first
// per-entity write ends up with exactly one person in the map. A device reading the map
// alone would see a roster of one and adopt it, deleting everybody else from every phone,
// and every report walks the roster. The suite caught this before it shipped.
//
// So the array is the floor and the map is laid over it: the map wins per person, because
// it is the authoritative per-entity form, and nobody is dropped for being absent from
// it. Nothing is ever removed from a roster anyway - people are archived, never deleted -
// so a union cannot resurrect anyone.
//
// Order: the order field first, then anyone it had not heard of, in the order the array
// had them. An order written by a device that has not yet seen a new man must not remove
// him.
function mergeRoster(list, map, order) {
    const byId = new Map();
    (Array.isArray(list) ? list : []).forEach(item => {
        if (item && item.id) byId.set(String(item.id), item);
    });

    const entries = (map && typeof map === 'object') ? map : {};
    Object.keys(entries).forEach(id => {
        if (entries[id]) byId.set(String(id), entries[id]);
    });

    const out = [];
    const used = new Set();

    (Array.isArray(order) ? order : []).forEach(id => {
        const key = String(id);
        if (byId.has(key) && !used.has(key)) {
            used.add(key);
            out.push(byId.get(key));
        }
    });
    byId.forEach((item, id) => {
        if (!used.has(id)) out.push(item);
    });

    return out;
}

function advancePath(id) {
    return `advances.${id}`;
}

function addAdvance(schedule, workerId, date, amount, note) {
    const id = advanceId();
    const record = {
        id,
        workerId: String(workerId),
        date: String(date),
        amount: Number(amount) || 0,
        note: String(note || '')
    };
    schedule.advances = schedule.advances || {};
    schedule.advances[id] = record;
    return { path: advancePath(id), value: record };
}

// Removed by writing null rather than deleting, so the deletion itself is a field the
// other devices receive - a key that simply vanished locally would be re-added by the
// next snapshot that still had it.
function removeAdvance(schedule, id) {
    if (schedule.advances) delete schedule.advances[id];
    return { path: advancePath(id), value: null };
}

function advancesFor(schedule, workerId, fromDate, toDate) {
    const all = schedule.advances || {};
    return Object.keys(all)
        .map(id => all[id])
        .filter(item => item && item.workerId === workerId &&
            item.date >= fromDate && item.date <= toDate)
        .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

function advancesTotal(schedule, workerId, fromDate, toDate) {
    return advancesFor(schedule, workerId, fromDate, toDate)
        .reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
}

function makeEntry(placeId, rate, extraHours) {
    const entry = { placeId: String(placeId) };

    if (RATES.includes(rate) && rate !== RATE_NORMAL) {
        entry.rate = rate;
    }
    // Only stored when it carries information. An absent field reads as "no extra hours"
    // everywhere, so writing 0 would just be noise in every document.
    const hours = Number(extraHours);
    if (Number.isFinite(hours) && hours > 0) {
        entry.extraHours = hours;
    }

    return entry;
}

function entryRate(entry) {
    return entry && RATES.includes(entry.rate) ? entry.rate : RATE_NORMAL;
}

function entryExtraHours(entry) {
    const hours = entry && Number(entry.extraHours);
    return Number.isFinite(hours) && hours > 0 ? hours : 0;
}

// ---------------------------------------------------------------- reading

function dayRecord(schedule, date) {
    return (schedule.days && schedule.days[date]) || null;
}

function workerDay(schedule, date, workerId, layer) {
    const day = dayRecord(schedule, date);
    const side = day && day[layer];
    return (side && side[workerId]) || null;
}

function entriesFor(schedule, date, workerId, layer) {
    const record = workerDay(schedule, date, workerId, layer);
    return record && Array.isArray(record.entries) ? record.entries : [];
}

function isAbsent(schedule, date, workerId, layer) {
    const record = workerDay(schedule, date, workerId, layer);
    return Boolean(record && record.absent);
}

// Everyone assigned to one place on one date, in roster order.
function workersAtPlace(schedule, date, placeId, layer) {
    const day = dayRecord(schedule, date);
    const side = (day && day[layer]) || {};

    return schedule.workers
        .filter(worker => {
            const record = side[worker.id];
            return record && !record.absent && (record.entries || [])
                .some(entry => entry.placeId === placeId);
        })
        .map(worker => worker.id);
}

// ---------------------------------------------------------------- writing
//
// Each of these returns the single field path it changed, so the sync layer can send that
// path alone instead of the whole document. That is what keeps three people editing the
// same evening from overwriting each other.

function fieldPath(date, layer, workerId) {
    return `days.${date}.${layer}.${workerId}`;
}

function ensureDay(schedule, date, layer) {
    if (!schedule.days) schedule.days = {};
    if (!schedule.days[date]) schedule.days[date] = { plan: {}, actual: {} };
    if (!schedule.days[date][layer]) schedule.days[date][layer] = {};
    return schedule.days[date][layer];
}

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
        const row = {
            workerId: worker.id,
            name: worker.name,
            daysWorked: 0,
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

            row.daysWorked++;
            row.siteVisits += entries.length;

            const doubled = entries.some(entry => entryRate(entry) === RATE_DOUBLE);
            if (doubled) row.doubleDays++;
            else row.normalDays++;

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
        if (row.daysWorked === 0) row.amount = daily > 0 ? 0 : null;
        else row.amount = unpriced ? null : total;

        // More than one daily rate inside one period. Not an error - a raise mid-account
        // is ordinary - but a sheet whose total cannot be checked by multiplying days by
        // the rate on screen has to say so, or it reads as an arithmetic mistake.
        row.mixedRates = dailyRatesUsed.size > 1;
        row.hoursUnpriced = Boolean(row.hoursUnpriced);

        // What was earned and what is still owed are two different numbers, and paying
        // the first one twice is the whole reason advances are recorded at all.
        row.advances = advancesTotal(schedule, worker.id, fromDate, toDate);
        row.netAmount = row.amount === null ? null : row.amount - row.advances;

        return row;
    });
}

// One worker, day by day, with the same arithmetic the pay sheet totals - because the
// question this answers is "why is my pay this number", and an answer computed a second
// way is not an answer.
function workerDaysReport(schedule, worker, fromDate, toDate) {
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
function invoiceReport(schedule, fromDate, toDate) {
    const dates = Object.keys(schedule.days || {})
        .filter(date => date >= fromDate && date <= toDate)
        .sort();

    return schedule.places.map(place => {
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
