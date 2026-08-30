// The agora rule that is written down and not implemented.
//
//   node tests/money.units.test.mjs
//
// js/model/schema.js says, above advanceAmountProblems:
//
//     never more precise than an agora, because three surfaces round it independently
//     and a value they cannot all represent is a value they will disagree about
//
// That is the rule. The line underneath it is
//
//     if (!Number.isSafeInteger(Math.round(amount * 100)))
//
// which cannot reject anything. Three guards above it already require
// 0 < amount <= ADVANCE_MAX, and ADVANCE_MAX is ten million - so amount * 100 is at most
// one billion, five orders of magnitude below Number.MAX_SAFE_INTEGER. Math.round of any
// value that reaches the line is a safe integer by construction. The branch is
// unreachable, its Hebrew sentence has never been shown to anybody, and no test refers to
// it. The rule in the comment has no implementation.
//
// What that costs, measured below: an advance of 0.001 is accepted, stored verbatim,
// netted into 399.999, and displayed as 0. The record says a tenth of an agora was handed
// over; the screen says nothing was; the pay sheet says four hundred. Every one of those
// is somebody's money.
//
// And the second half, which the comment does not mention: there is no ceiling on a RATE
// at all. A daily rate of 1e308 passes every gate, and two days of it is Infinity.

import { makeDevice } from './harness.mjs';
import { suite, check, given, report } from './runner.mjs';

const WORKERS = [{ id: 'w_01', name: 'דוד', active: true, dailyRate: 400, hourlyRate: 50 }];
const PLACES = [{ id: 'p_01', name: 'הרצליה', active: true }];

const advanceRecord = amount => ({
    id: 'a1', workerId: 'w_01', date: '2026-08-12', amount, note: ''
});

const rosterWith = rate => ({
    version: 2,
    workers: [{ id: 'w_01', name: 'דוד', dailyRate: rate, hourlyRate: 0, active: true }],
    places: [], days: {}, advances: {}
});

// ============================================================ the rule with no code
{
    suite('an amount finer than an agora, at every door that admits one');

    const device = makeDevice();
    const wire = amount =>
        device.call('journalEntryProblems', 'advances.a1', advanceRecord(amount));

    // The values are passed NATIVE. A JSON round trip turns NaN and Infinity into null
    // and would measure the serialiser rather than the gate.
    const FINER = [0.001, 0.009, 1.005, 250.501];
    FINER.forEach(amount => {
        check(`an advance of ${amount} is refused, because no surface can represent it`,
            wire(amount).length > 0,
            `journalEntryProblems -> ${JSON.stringify(wire(amount))}`);
    });

    // The ones that must keep working. An agora is a real amount and half the roster is
    // priced in whole shekels.
    [1, 400, 0.5, 0.05, 250.5, 9999999].forEach(amount => {
        check(`an advance of ${amount} is still accepted`,
            wire(amount).length === 0,
            `journalEntryProblems -> ${JSON.stringify(wire(amount))}`);
    });

    // And the restore door agrees with the wire door. Two doors with different rules is
    // how a value that cannot be sent arrives anyway.
    check('the restore door refuses what the wire door refuses',
        FINER.every(amount => device.call('fullScheduleProblems', {
            version: 2, workers: WORKERS, places: PLACES, days: {},
            advances: { a1: advanceRecord(amount) }
        }).length > 0),
        FINER.map(amount => `${amount}: ${device.call('fullScheduleProblems', {
            version: 2, workers: WORKERS, places: PLACES, days: {},
            advances: { a1: advanceRecord(amount) }
        }).length} problems`).join(', '));
}

// ============================================================ what it does when it lands
{
    suite('an advance of a thousandth of a shekel, on the pay sheet');

    const device = makeDevice();
    device.Store.set('scheduleData:v2', JSON.stringify({
        schemaVersion: 2, workers: WORKERS, places: PLACES,
        days: { '2026-08-12': { plan: {}, actual: { w_01: {
            entries: [{ placeId: 'p_01' }], rates: { daily: 400, hourly: 50 }
        } } } },
        advances: { a1: advanceRecord(0.001) },
        updatedAt: '2026-08-12T00:00:00.000Z', updatedBy: 'd'
    }));
    device.State.load();

    const row = device.call('payrollReport', device.State.schedule,
        '2026-08-01', '2026-08-31')[0];
    given('the day is priced', row && row.amount === 400, JSON.stringify(row && row.amount));

    // js/ui/reports.js is not loaded here - it is the screen, and a device in this harness
    // has no screen. What it does to a number is not a secret though: moneyText rounds to
    // the agora and prints that. So the question "will the screen and the record agree"
    // is the question "is this value an exact number of agorot", and that can be asked
    // without the file.
    const isAgorot = value => {
        const scaled = Number(value) * 100;
        return Number.isFinite(scaled) && Math.abs(scaled - Math.round(scaled)) < 1e-9;
    };

    check('the advance the record holds is an amount a screen can show',
        isAgorot(row.advances),
        `advances = ${row.advances}, which rounds to ${Math.round(row.advances * 100) / 100}`);
    check('and so is the net the pay sheet is built from',
        isAgorot(row.netAmount),
        `net = ${row.netAmount}, which rounds to ${Math.round(row.netAmount * 100) / 100}`);
}

// ============================================================ the rate with no ceiling
{
    suite('a rate nobody bounded');

    const device = makeDevice();

    check('a daily rate larger than any wage is refused',
        device.call('storedScheduleProblems', rosterWith(1e308)).length > 0,
        JSON.stringify(device.call('storedScheduleProblems', rosterWith(1e308))));
    check('and so is one at the largest number there is',
        device.call('storedScheduleProblems', rosterWith(Number.MAX_VALUE)).length > 0,
        JSON.stringify(device.call('storedScheduleProblems', rosterWith(Number.MAX_VALUE))));

    // Ordinary rates keep working.
    [0, 400, 1250.5].forEach(rate => {
        check(`a daily rate of ${rate} is still accepted`,
            device.call('storedScheduleProblems', rosterWith(rate)).length === 0,
            JSON.stringify(device.call('storedScheduleProblems', rosterWith(rate))));
    });

    // The consequence, if such a rate ever reaches a day: the pay sheet stops being
    // arithmetic. A number that is not finite is not a wage anybody can be paid.
    const priced = makeDevice();
    priced.Store.set('scheduleData:v2', JSON.stringify({
        schemaVersion: 2,
        workers: [{ id: 'w_01', name: 'דוד', dailyRate: 1e308, hourlyRate: 0, active: true }],
        places: PLACES,
        days: {
            '2026-08-12': { plan: {}, actual: { w_01: {
                entries: [{ placeId: 'p_01' }], rates: { daily: 1e308, hourly: 0 } } } },
            '2026-08-13': { plan: {}, actual: { w_01: {
                entries: [{ placeId: 'p_01' }], rates: { daily: 1e308, hourly: 0 } } } }
        },
        advances: {},
        updatedAt: '2026-08-12T00:00:00.000Z', updatedBy: 'd'
    }));
    priced.State.load();
    const row = priced.call('payrollReport', priced.State.schedule,
        '2026-08-01', '2026-08-31')[0];
    check('no pay sheet row is ever an amount that is not a number',
        row === undefined || Number.isFinite(row.amount),
        `amount = ${row && row.amount}`);
}

// ============================================================ coercion inside the model
{
    suite('a numeric string that the gate refused, once it is already on the disk');

    // The gates reject "500". The arithmetic inside the model reads Number(x) || 0, so a
    // record that arrived another way - an older build, a hand-edited restore, a partial
    // write - becomes five hundred payable shekels without anything having accepted it.
    const device = makeDevice();
    given('the wire door refuses a numeric string',
        device.call('journalEntryProblems', 'advances.a1', advanceRecord('500')).length > 0);

    device.Store.set('scheduleData:v2', JSON.stringify({
        schemaVersion: 2, workers: WORKERS, places: PLACES,
        days: { '2026-08-12': { plan: {}, actual: { w_01: {
            entries: [{ placeId: 'p_01' }], rates: { daily: 400, hourly: 0 }
        } } } },
        advances: { a1: advanceRecord('500') },
        updatedAt: '2026-08-12T00:00:00.000Z', updatedBy: 'd'
    }));
    device.State.load();
    const row = device.call('payrollReport', device.State.schedule,
        '2026-08-01', '2026-08-31')[0];

    check('a value no door would accept does not become money by being read',
        row === undefined || row.advances === 0 || row.netAmount === 400
        || device.call('farkadWritesBlocked') === true,
        `advances ${JSON.stringify(row && row.advances)}, net ${row && row.netAmount}, `
        + `blocked ${device.call('farkadWritesBlocked')}`);
}

report();
