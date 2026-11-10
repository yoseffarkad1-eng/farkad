// tests/months.capacity.test.mjs
//
// PHASE 6, CAPACITY: where the walls are for 20 men once closed months leave the server's
// live document - and which wall is hit first.
//
// Two walls, weighed two ways:
//
//   THE SERVER'S DOCUMENT   1 MiB, as Firestore counts a document (Phase 3's count)
//   A PHONE'S STORAGE       5 MiB of localStorage at two bytes a character - the figure
//                           tests/capacity.test.mjs measures the reclaim ladder against
//
// The method is Phase 2's and Phase 3's: every entry is produced by the shipped writers on
// a real record (a worker-day, an advance and its ledger origin, a closed fortnight with
// its statement and payment, an index row as planArchive stores it, a month row as
// planMonths writes it), a crew of 20 is built from them week by week, and the DOCUMENT is
// weighed - not an estimate multiplied out.
//
// ASSUMPTIONS, said: six days a week, every week; one man in four takes an advance each
// fortnight; every closure has a statement and one payment and is paid in full at the
// closing; a closure leaves the live document 14 days after it is settled (Phase 5); a
// month leaves six months after the later of its last closure and its last day (Phase 6).
// The curves start from an EMPTY record; the owner's document is about 185 KB today, and
// that history is from before the tracking day, so by the shipped default NONE of it is
// eligible to leave (decision 55). The last column adds it back as a constant.

import { settleUntil, makeCloud } from './harness.mjs';
import { suite, check, same, given, report } from './runner.mjs';
import { FORTNIGHT, TODAY, clone, stamp, payDevice, world, plan, openBook, advancesOf } from './paybook.world.mjs';

const MIB = 1024 * 1024;
const TODAYS_KB = 185;
const utf8 = text => Buffer.byteLength(String(text), 'utf8');
const firestoreSize = value => {
    if (value === null || typeof value === 'boolean') return 1;
    if (typeof value === 'number') return 8;
    if (typeof value === 'string') return utf8(value) + 1;
    if (Array.isArray(value)) return value.reduce((sum, item) => sum + firestoreSize(item), 0);
    return Object.keys(value).reduce((sum, key) => sum + utf8(key) + 1 + firestoreSize(value[key]), 0);
};
const documentSize = doc => utf8('schedules') + 1 + utf8('current') + 1 + 16 + firestoreSize(doc) + 32;
const KB = n => Math.round(n / 1024).toLocaleString('en-US');

// ---------------------------------------------------------------- the templates
const seed = world({ advances: [['w_khaled', '2026-10-03', 500]] });
openBook(seed, undefined, 'd_seed');
const [ADV] = advancesOf(seed, 'w_khaled');
const drawn = (first => plan(seed, 'planClosure', 'w_khaled', FORTNIGHT,
    { method: 'cash', allocations: { [ADV]: 500 }, paid: first.review.netDue - 0, paidOn: TODAY }, stamp(TODAY, seed.id)))(
    plan(seed, 'planClosure', 'w_khaled', FORTNIGHT, { method: 'cash', allocations: { [ADV]: 500 } }, stamp(TODAY, seed.id)));
given('the template closure is allowed', drawn.ok === true, JSON.stringify(drawn.reasons));
given('and committed', seed.State.commitPaybook(drawn.changes).ok === true);
const S0 = seed.State.schedule;
const kind = name => clone(drawn.changes.filter(change => change.value.kind === name)[0].value);
const bundleRow = seed.call('planArchive', S0, '2027-01-01', {}).bundles.find(one => one.workerId === 'w_khaled');
given('the template closure is settled and has a stored row', Boolean(bundleRow && bundleRow.row), JSON.stringify(bundleRow && [bundleRow.state, bundleRow.why]));
const T = {
    day: clone(S0.days['2026-10-04'].actual.w_khaled),
    advance: clone(S0.advances[ADV]),
    given: clone(Object.values(S0.ledger.advances).find(entry => entry.kind === 'given' && entry.advanceId === ADV)),
    artifact: kind('closed'), deducted: kind('deducted'), statement: kind('statement'), payment: kind('payment'),
    row: clone(bundleRow.row),
    opening: clone(S0.pay.po_open),
    migrations: clone(S0.ledger.migrations || {}),
    places: clone(S0.places)
};
const jsonBytes = value => utf8(JSON.stringify(value));
console.log('    one entry, JSON bytes: ' + JSON.stringify(Object.fromEntries(Object.keys(T).filter(key => ['opening', 'migrations', 'places'].indexOf(key) === -1)
    .map(key => [key, jsonBytes(T[key])]))));

const dayAfter = (date, n) => new Date(Date.parse(date + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
const START = '2026-08-07';
const MEN = 20;

// The record after `weeks` weeks, as a PHONE holds it (everything) and as the SERVER holds
// it under a policy: { closuresLeave: bool (Phase 5), monthsLeave: bool (Phase 6) }.
// `cycle`: false (nobody closes), 'biweekly' or 'weekly'.
function build(weeks, cycle, policy) {
    const phone = clone(seed.call('emptySchedule'));
    phone.places = clone(T.places);
    phone.ledger = { advances: {}, unreadable: {}, migrations: clone(T.migrations), unreadableMigrations: {} };
    phone.pay = cycle ? { po_open: clone(T.opening) } : {};
    for (let m = 1; m <= MEN; m += 1) {
        phone.workers.push({ id: 'w_' + String(m).padStart(2, '0'), name: 'עובד מספר ' + m, idNumber: '',
            phone: '050-000-00' + String(m).padStart(2, '0'), dailyRate: 400, hourlyRate: 50,
            payCycles: cycle === 'weekly' ? `${START}=weekly` : '', active: true });
    }
    const today = dayAfter(START, weeks * 7);
    const server = clone(phone);
    const payRows = {};
    const lastClosedInMonth = {};
    const span = cycle === 'weekly' ? 1 : 2;
    for (let week = 0; week < weeks; week += 1) {
        const friday = dayAfter(START, week * 7);
        const closes = cycle && (week % span) === span - 1;
        // The period this week belongs to is closed the day after it ends.
        const periodEnd = dayAfter(START, (Math.floor(week / span) + 1) * span * 7 - 1);
        const closedOn = cycle ? dayAfter(periodEnd, 1) : null;
        [0, 2, 3, 4, 5, 6].forEach(offset => {
            const date = dayAfter(friday, offset);
            const record = { plan: {}, actual: {} };
            phone.workers.forEach(worker => { record.actual[worker.id] = T.day; });
            phone.days[date] = record;
            server.days[date] = record;
            const month = date.slice(0, 7);
            if (closedOn && closedOn <= today && (!lastClosedInMonth[month] || closedOn > lastClosedInMonth[month])) lastClosedInMonth[month] = closedOn;
            if (closedOn && closedOn > today) lastClosedInMonth[month] = '9999-12-31';      // a day nobody has closed yet
        });
        const key = friday.replace(/-/g, '');
        phone.workers.forEach((worker, at) => {
            const withAdvance = (at % 4) === 0 && week % 2 === 0;
            const advanceId = `a_${worker.id.slice(2)}${key}`;
            if (withAdvance) {
                [phone, server].forEach(doc => {
                    doc.advances[advanceId] = Object.assign({}, T.advance, { id: advanceId, workerId: worker.id });
                    doc.ledger.advances['le_given_' + advanceId] = Object.assign({}, T.given, { id: 'le_given_' + advanceId, advanceId, workerId: worker.id });
                });
            }
            if (!closes || closedOn > today) return;
            const statementId = `ps_${worker.id}_${key}`;
            const artifactId = `le_period_${worker.id}_${key}`;
            const out = policy.closuresLeave && dayAfter(closedOn, 14) <= today;
            [phone].concat(out ? [] : [server]).forEach(doc => {
                doc.ledger.advances[artifactId] = Object.assign({}, T.artifact, { id: artifactId, workerId: worker.id });
                if (withAdvance) {
                    const entryId = `le_close_${advanceId}_${key}`;
                    doc.ledger.advances[entryId] = Object.assign({}, T.deducted, { id: entryId, advanceId, workerId: worker.id });
                }
                doc.pay[statementId] = Object.assign({}, T.statement, { id: statementId, workerId: worker.id, artifactId });
                doc.pay['pp_' + statementId] = Object.assign({}, T.payment, { id: 'pp_' + statementId, workerId: worker.id, statementId });
            });
            if (out) payRows[statementId] = Object.assign({}, T.row, { w: worker.id, a: withAdvance ? T.row.a : {} });
        });
    }
    if (Object.keys(payRows).length > 0) {
        server.payIndex = { v: 1, rows: payRows };
        phone.payIndex = { v: 1, rows: payRows };
    }
    // Months: eligible only when everybody closes (decision: nothing unsettled moves).
    const monthsOut = [];
    if (policy.monthsLeave && cycle) {
        const months = [...new Set(Object.keys(server.days).map(date => date.slice(0, 7)))].sort();
        months.forEach(month => {
            const lastDay = seed.call('monthCalendar', month).pop();
            const closedOn = lastClosedInMonth[month];
            if (!closedOn || closedOn === '9999-12-31') return;
            const since = closedOn > lastDay ? closedOn : lastDay;
            if (seed.call('monthStepDay', since, 6) > today) return;
            monthsOut.push(month);
        });
        if (monthsOut.length > 0) {
            const index = { v: 1, rows: {}, dates: [] };
            monthsOut.forEach(month => {
                const days = seed.call('monthDaysOf', server, month);
                index.rows[month] = clone(seed.call('monthRow', month, days, today + 'T10:00:00.000Z'));
                index.dates = index.dates.concat(seed.call('monthCalendar', month));
                Object.keys(days).forEach(date => { delete server.days[date]; });
            });
            server.monthIndex = index;
            phone.monthIndex = index;
        }
    }
    return { phone, server, monthsOut };
}

const wire = doc => Object.assign(seed.call('cloudDocument', doc), doc.payIndex ? { payIndex: doc.payIndex } : {},
    doc.monthIndex ? { monthIndex: doc.monthIndex } : {});
const serverSize = (weeks, cycle, policy) => documentSize(wire(build(weeks, cycle, policy).server));
const phoneChars = (weeks, cycle, policy) => JSON.stringify(build(weeks, cycle, policy).phone).length;

// When a curve first passes `limit`, by bisection over weeks (it is monotonic for these builds).
function weeksUntil(measure, limit, cap = 52 * 40) {
    if (measure(cap) < limit) return Infinity;
    let low = 0;
    let high = cap;
    while (high - low > 1) {
        const mid = Math.floor((low + high) / 2);
        if (measure(mid) >= limit) high = mid; else low = mid;
    }
    return high;
}
const yrs = weeks => (weeks === Infinity ? 'never (40-year horizon)' : (weeks / 52).toFixed(1) + ' years');

// ------------------------------------------------------------------------------------
const serverTable = {};
{
    suite('C1: THE SERVER\'S DOCUMENT for 20 men - what Phase 6 buys, and what it does not');

    const ROWS = [
        ['nobody closes (no month is ever eligible)', false, { closuresLeave: false, monthsLeave: true }],
        ['closed fortnightly, closures leave (Phase 5), days stay', 'biweekly', { closuresLeave: true, monthsLeave: false }],
        ['closed fortnightly, closures AND months leave (Phase 6)', 'biweekly', { closuresLeave: true, monthsLeave: true }],
        ['closed weekly, closures leave (Phase 5), days stay', 'weekly', { closuresLeave: true, monthsLeave: false }],
        ['closed weekly, closures AND months leave (Phase 6)', 'weekly', { closuresLeave: true, monthsLeave: true }]
    ];
    const todays = TODAYS_KB * 1024;
    ROWS.forEach(([label, cycle, policy]) => {
        const at = [1, 2, 3, 5, 8, 10].map(year => serverSize(52 * year, cycle, policy));
        const perYearLate = (serverSize(52 * 10, cycle, policy) - serverSize(52 * 8, cycle, policy)) / 2;
        const full = weeksUntil(weeks => serverSize(weeks, cycle, policy), MIB);
        const fullFromToday = weeksUntil(weeks => serverSize(weeks, cycle, policy) + todays, MIB);
        serverTable[label] = { at, perYearLate, full, fullFromToday };
        console.log(`    ${label}:`);
        console.log('        ' + [1, 2, 3, 5, 8, 10].map((year, i) => `y${year}: ${KB(at[i])} KB`).join(' · ')
            + ` · grows ${KB(perYearLate)} KB/year by then · full after ${yrs(full)} from empty, ${yrs(fullFromToday)} on top of today's ${TODAYS_KB} KB`);
    });
    const of = text => serverTable[ROWS.find(row => row[0].indexOf(text) === 0)[0]];

    check('NOBODY CLOSES: nothing is ever eligible, and the days fill the document in about two years from today - Phase 6 changes nothing here',
        of('nobody closes').fullFromToday > 52 * 1.7 && of('nobody closes').fullFromToday < 52 * 2.4, yrs(of('nobody closes').fullFromToday));
    check('closed fortnightly with only Phase 5: full inside two years from today (Phase 3\'s measurement, with Phase 5\'s stored row)',
        of('closed fortnightly, closures leave').fullFromToday < 52 * 2, yrs(of('closed fortnightly, closures leave').fullFromToday));
    check('PHASE 6, closed fortnightly: the days stop growing - under 450 KB after a year, and each later year adds under 200 KB',
        of('closed fortnightly, closures AND').at[0] < 450 * 1024 && of('closed fortnightly, closures AND').perYearLate < 200 * 1024,
        JSON.stringify([KB(of('closed fortnightly, closures AND').at[0]), KB(of('closed fortnightly, closures AND').perYearLate)]));
    check('and it at least DOUBLES the time to the wall from today, fortnightly',
        of('closed fortnightly, closures AND').fullFromToday >= 2 * of('closed fortnightly, closures leave').fullFromToday,
        JSON.stringify([yrs(of('closed fortnightly, closures leave').fullFromToday), yrs(of('closed fortnightly, closures AND').fullFromToday)]));
    check('BUT THE DOCUMENT IS STILL NOT BOUNDED, and this pins it: fortnightly it is full inside six years from today, weekly inside three and a half',
        of('closed fortnightly, closures AND').fullFromToday < 52 * 6 && of('closed weekly, closures AND').fullFromToday < 52 * 3.5,
        JSON.stringify([yrs(of('closed fortnightly, closures AND').fullFromToday), yrs(of('closed weekly, closures AND').fullFromToday)]));

    // What still grows, weighed at year 10 against year 8.
    const part = (weeks, cycle, policy) => {
        const built = build(weeks, cycle, policy).server;
        return { days: firestoreSize(built.days), payIndex: built.payIndex ? firestoreSize(built.payIndex) : 0,
            monthIndex: built.monthIndex ? firestoreSize(built.monthIndex) : 0,
            advances: firestoreSize(built.advances) + firestoreSize(Object.fromEntries(Object.entries(built.ledger.advances).filter(([id]) => id.indexOf('le_given_') === 0))),
            closures: firestoreSize(built.pay) + firestoreSize(Object.fromEntries(Object.entries(built.ledger.advances).filter(([id]) => id.indexOf('le_given_') !== 0))),
            roster: firestoreSize(built.workers) };
    };
    const P = { closuresLeave: true, monthsLeave: true };
    ['biweekly', 'weekly'].forEach(cycle => {
        const late = part(52 * 10, cycle, P);
        const early = part(52 * 8, cycle, P);
        const growth = Object.fromEntries(Object.keys(late).map(key => [key, Math.round((late[key] - early[key]) / 2 / 1024)]));
        console.log(`    what still grows, ${cycle}, KB a year (year 8 to 10): ` + JSON.stringify(growth)
            + ' · held at year 10, KB: ' + JSON.stringify(Object.fromEntries(Object.keys(late).map(key => [key, Math.round(late[key] / 1024)]))));
        serverTable['growth ' + cycle] = { growth, held: late };
    });
    const g = serverTable['growth biweekly'];
    check('WHAT STILL GROWS WITHOUT BOUND, largest first: the index of closures (one row per closure), then advances and their ledger origin, then the month index; the days do not',
        g.growth.payIndex > g.growth.advances && g.growth.advances > g.growth.monthIndex && g.growth.monthIndex >= 1 && Math.abs(g.growth.days) <= 3,
        JSON.stringify(g.growth));
    check('the days held in the live document level off at the window - about eight months of them, under 320 KB',
        g.held.days < 320 * 1024 && g.held.days > 200 * 1024, KB(g.held.days));
    check('the month index costs about six kilobytes a year - the price of the server refusing writes to archived dates',
        g.growth.monthIndex >= 4 && g.growth.monthIndex <= 9, String(g.growth.monthIndex));
}

// ------------------------------------------------------------------------------------
{
    suite('C2: A PHONE\'S STORAGE - keeping everything locally moves the wall, it does not remove it');

    // 5 MiB at two bytes a character is 2,621,440 characters for EVERYTHING the app keeps:
    // the record, the copy kept before each adopted snapshot (scheduleData:v2backup), the
    // restore points and the journal. The ladder gives the copies up before it refuses.
    const CHARS = 5 * MIB / 2;
    const P = { closuresLeave: true, monthsLeave: true };
    const curves = {
        'as built (Phase 5 + 6): the phone keeps every day and every closure entry': weeks => phoneChars(weeks, 'biweekly', P),
        'if the phone dropped archived DAYS and kept closure entries': weeks => {
            const built = build(weeks, 'biweekly', P);
            const kept = clone(built.phone);
            kept.days = built.server.days;
            return JSON.stringify(kept).length;
        },
        'if the phone held only what the server\'s live document holds (days and closures both dropped)': weeks =>
            JSON.stringify(build(weeks, 'biweekly', P).server).length,
        'nobody closes: days and advances only': weeks => phoneChars(weeks, false, P)
    };
    const todays = TODAYS_KB * 1024;
    const found = {};
    Object.keys(curves).forEach(label => {
        const one = weeksUntil(weeks => curves[label](weeks) + todays, CHARS);
        const two = weeksUntil(weeks => (curves[label](weeks) + todays) * 2, CHARS);
        found[label] = { one, two, y1: curves[label](52), y3: curves[label](156) };
        console.log(`    ${label}:`);
        console.log(`        year 1: ${KB(found[label].y1)} K chars · year 3: ${KB(found[label].y3)} K chars · the record ALONE fills the phone after ${yrs(one)} from today;`
            + ` the record and one copy of it, after ${yrs(two)}`);
    });
    const asBuilt = found[Object.keys(curves)[0]];
    const daysDropped = found[Object.keys(curves)[1]];
    const liveOnly = found[Object.keys(curves)[2]];
    check('AS BUILT, closing fortnightly: the phone can no longer keep the record AND one copy of it inside a year and a half from today',
        asBuilt.two < 52 * 1.3 && asBuilt.two > 52 * 0.5, yrs(asBuilt.two));
    check('and the record ALONE no longer fits inside two and a half years - every restore point and the way back already given up',
        asBuilt.one < 52 * 2.5 && asBuilt.one > 52 * 1.2, yrs(asBuilt.one));
    const serverFull = serverTable['closed fortnightly, closures AND months leave (Phase 6)'].fullFromToday;
    check('SO THE PHONE IS THE WALL THAT IS HIT FIRST once the pay book is in use: its record alone is full before the server\'s document is',
        asBuilt.one < serverFull, JSON.stringify([yrs(asBuilt.one), yrs(serverFull)]));
    check('dropping archived DAYS from the phone would not be enough by itself: the closure entries the phone keeps (Phase 5, decision 43) fill it',
        daysDropped.one < 52 * 3.5, yrs(daysDropped.one));
    check('a phone that held only what the live document holds would outlast the server\'s document - which is what the next step has to build',
        liveOnly.one > serverFull, JSON.stringify([yrs(liveOnly.one), yrs(serverFull)]));

    // AND MEASURED ON A DEVICE, not only counted: a phone with a real five-megabyte edge is
    // handed the record as the server holds it after N years and asked to adopt it.
    const bytesOf = dump => Object.keys(dump).reduce((sum, key) => sum + (key.length + String(dump[key]).length) * 2, 0);
    // Days and advances only: the synthetic closures above are weighed, not folded - their
    // ids are stamped out of one template - so the device is handed a record every
    // validator accepts, of the SIZE in question.
    const adopts = async weeks => {
        const built = build(weeks, false, { closuresLeave: false, monthsLeave: false });
        const doc = Object.assign(wire(built.phone), { protocol: 2, revision: 1, lastOpId: 'op_seed', updatedAt: '2030-01-01T00:00:00.000Z', updatedBy: 'd_other' });
        const cloud = makeCloud({ doc });
        const device = payDevice({ deviceId: 'd_cap', flags: { paybookQueue: false }, storage: {} });
        device.setQuota((key, value) => {
            const dump = device.dump();
            const had = Object.prototype.hasOwnProperty.call(dump, key) ? (key.length + String(dump[key]).length) * 2 : 0;
            return bytesOf(dump) - had + (key.length + String(value).length) * 2 > 5 * MIB;
        });
        device.State.load();
        device.Sync.connect(cloud.adapter);
        await settleUntil(() => device.Sync.status === 'synced' || device.Sync.status === 'error', 8000, 10);
        const dump = device.dump();
        return { chars: JSON.stringify(built.phone).length, adopted: device.State.schedule.workers.length === MEN && Boolean(dump['scheduleData:v2']),
            status: device.Sync.status, used: bytesOf(dump), copy: Boolean(dump['scheduleData:v2backup']),
            error: device.Sync.lastError ? String(device.Sync.lastError.message || device.Sync.lastError).slice(0, 80) : null };
    };
    const fits = await adopts(52 * 4);
    const over = await adopts(52 * 6);
    console.log('    a real device with a 5 MiB edge, handed a record of days and advances: after 4 years ' + JSON.stringify(fits) + ' · after 6 years ' + JSON.stringify(over));
    same('ON A DEVICE: a record of 2.0 million characters is adopted - it fits once', [fits.adopted, fits.status, fits.chars < CHARS], [true, 'synced', true]);
    same('ON A DEVICE: one of 3.0 million is NOT - the phone does not adopt it and does not say synced; the count above is the device\'s own limit',
        [over.adopted, over.status === 'synced', over.chars > CHARS], [false, false, true]);
}

report();
