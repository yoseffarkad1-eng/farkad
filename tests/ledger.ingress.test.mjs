// Malformed financial history, at every door it can arrive through.
//
//   node tests/ledger.ingress.test.mjs
//
// ledgerProblems() has existed and been correct for some time. Nothing called it. The
// consequence, reproduced before this suite was written:
//
//   a repayment whose amount is the string "abc"
//   fullScheduleProblems: []          the whole-document gate accepts it
//   storedScheduleProblems: []        the boot gate accepts it
//   ledgerProblems: unreadable        the check that would have caught it, uncalled
//   folded repaid: undefined          and the fold reads it as nothing
//
// A number nobody can read, reinterpreted as zero, on a man's outstanding debt. It
// arrives through boot, a cloud snapshot, a restore, a backup import, the raw rescue
// import, the migration and a whole-document replacement, and it looked identical to a
// clean record at every one of them.
//
// WHAT THIS SUITE DOES NOT ASK FOR is a refused document. The rescue file exists to
// salvage what can be read and NAME what cannot, and refusing the record for one
// unreadable line turns the last door into another wall - that reasoning is written into
// storedScheduleProblems and it is right. What it asks for is the other half: the bytes
// are kept, the fold never sees them, the person is told, and the device stops WRITING
// while its financial history is uncertain. Reading, exporting and rescuing all go on.

import { makeDevice } from './harness.mjs';
import { suite, check, given, report } from './runner.mjs';

const WORKERS = [{ id: 'w_01', name: 'דוד', active: true, dailyRate: 400, hourlyRate: 0 }];
const PLACES = [{ id: 'p_01', name: 'הרצליה', active: true }];

// Every shape the brief names, each one money or the identity of money.
function badEntries(advanceId) {
    return [
        ['a repayment amount that is a string',
            { advanceId, kind: 'repaid', date: '2026-08-18', amount: 'abc' }],
        ['a repayment amount that is not a number at all',
            { advanceId, kind: 'repaid', date: '2026-08-18', amount: NaN }],
        ['an infinite repayment',
            { advanceId, kind: 'repaid', date: '2026-08-18', amount: Infinity }],
        ['an advance given for less than nothing',
            { advanceId, kind: 'given', workerId: 'w_01', date: '2026-08-10', amount: -500 }],
        ['a repayment of less than nothing',
            { advanceId, kind: 'repaid', date: '2026-08-18', amount: -200 }],
        ['a date that is not on any calendar',
            { advanceId, kind: 'repaid', date: '2026-02-30', amount: 100 }],
        ['a repayment with no date',
            { advanceId, kind: 'repaid', amount: 100 }],
        ['a closure whose balanceAfter is a string',
            { advanceId, kind: 'deducted', workerId: 'w_01', date: '2026-08-20',
                periodFrom: '2026-08-07', periodTo: '2026-08-20', amount: 100,
                balanceAfter: 'nope' }],
        ['a correction to less than nothing',
            { advanceId, kind: 'corrected', date: '2026-08-18', amount: -50 }],
        ['an amount finer than an agora',
            { advanceId, kind: 'repaid', date: '2026-08-18', amount: 10.005 }],
        ['an amount beyond anything a safe integer holds',
            { advanceId, kind: 'repaid', date: '2026-08-18', amount: 1e308 }],
        ['a kind nobody wrote',
            { advanceId, kind: 'invented', date: '2026-08-18', amount: 100 }],
        ['an entry with no advance behind it',
            { kind: 'repaid', date: '2026-08-18', amount: 100 }]
    ];
}

function crew(options = {}) {
    const device = makeDevice(options);
    device.setToday('2026-08-26');
    device.State.schedule.workers = WORKERS.slice();
    device.State.schedule.places = PLACES.slice();
    device.State.save({ silent: true });
    device.State.commit(device.call('addAdvance', device.State.schedule,
        'w_01', '2026-08-10', 500, ''));
    return device;
}

// A stored document carrying one bad entry, as it would sit on a disk or arrive from
// anywhere else.
function documentWith(device, entry) {
    const raw = JSON.parse(JSON.stringify(device.State.schedule));
    raw.ledger = raw.ledger || { advances: {}, unreadable: {} };
    raw.ledger.advances = raw.ledger.advances || {};
    raw.ledger.advances.le_bad = Object.assign({ id: 'le_bad' }, entry);
    return raw;
}

// ---------------------------------------------------------------- the check itself
{
    suite('every shape of unreadable money is named by the check');

    const device = crew({ deviceId: 'd_shapes' });
    const advanceId = Object.keys(device.State.schedule.advances)[0];

    badEntries(advanceId).forEach(([label, entry]) => {
        const raw = documentWith(device, entry);
        check(`refused: ${label}`,
            device.call('ledgerProblems', raw).length > 0,
            JSON.stringify(device.call('ledgerProblems', raw)));
    });

    // And a good one is not refused, or the check above says nothing.
    const fine = documentWith(device,
        { advanceId, kind: 'repaid', date: '2026-08-18', amount: 200 });
    check('a repayment that reads properly is not refused',
        device.call('ledgerProblems', fine).length === 0,
        JSON.stringify(device.call('ledgerProblems', fine)));
}

// ---------------------------------------------------------------- the fold never sees it
{
    suite('the fold never reads an unreadable entry as a number');

    const device = crew({ deviceId: 'd_fold' });
    const advanceId = Object.keys(device.State.schedule.advances)[0];

    badEntries(advanceId).forEach(([label, entry]) => {
        const raw = documentWith(device, entry);
        const schedule = device.call('normaliseSchedule', raw);
        const kept = schedule.ledger && schedule.ledger.unreadable
            && schedule.ledger.unreadable.le_bad !== undefined;
        const folded = schedule.ledger && schedule.ledger.advances
            && schedule.ledger.advances.le_bad !== undefined;
        check(`held aside, not folded: ${label}`, kept === true && folded === false,
            JSON.stringify({ kept, folded }));
    });
}

// ---------------------------------------------------------------- boot fails closed
{
    suite('a device that boots onto unreadable money stops writing and says so');

    const device = crew({ deviceId: 'd_boot' });
    const advanceId = Object.keys(device.State.schedule.advances)[0];
    const raw = documentWith(device,
        { advanceId, kind: 'repaid', date: '2026-08-18', amount: 'abc' });

    // Put it on the disk the way a sync, a restore or another build would have.
    const reopened = makeDevice({ deviceId: 'd_boot2',
        storage: Object.assign({}, device.dump(), {
            'scheduleData:v2': JSON.stringify(raw)
        }) });
    reopened.State.load();

    check('the record still opens - the rescue file needs it to',
        reopened.State.schedule.workers.length === 1,
        JSON.stringify(reopened.State.schedule.workers.length));
    check('the bytes are kept, not dropped',
        JSON.stringify(reopened.State.schedule.ledger.unreadable.le_bad || null)
            .indexOf('abc') !== -1,
        JSON.stringify(reopened.State.schedule.ledger.unreadable.le_bad || null));
    check('the person is told',
        reopened.global('Recovery').problems.length > 0,
        JSON.stringify(reopened.global('Recovery').problems.map(p => p.key)));
    check('and the device will not write while the money is uncertain',
        reopened.call('farkadWritesBlocked') === true,
        String(reopened.call('farkadWritesBlocked')));

    // The one thing that must still work.
    const rescue = reopened.global('Recovery').rawRecords();
    check('the raw rescue export still carries everything',
        JSON.stringify(rescue).indexOf('abc') !== -1,
        JSON.stringify(Object.keys(rescue)));
}


// ------------------------------------------------ when the quarantine itself cannot land
//
// The suites above all assume the copy gets written. It does not always: the disk can be
// full, the browser can refuse writes outright (Safari in a private tab takes localStorage
// away wholesale), and rarest and worst, it can ACCEPT the write and hand back something
// else - nothing throws, and the only way to find out is to read back.
//
// A quarantine that failed is not a smaller problem than the damage it was for. It is a
// bigger one: the original bytes are now the ONLY copy that exists, and this is the
// financial history. So every one of these has to end in the same place - the original
// still on the disk untouched, the person told, writing stopped, and the raw rescue export
// still carrying the bytes out. And it has to survive the app being closed and reopened,
// because a device that forgot on the next boot would resume writing over the only copy.
{
    const FAULTS = [
        ['the disk is full', device => device.setQuota(
            key => String(key).indexOf(':damaged') !== -1)],
        ['the browser refuses the write outright', device => device.failWrite(
            key => String(key).indexOf(':damaged') !== -1)],
        ['the disk takes the write and hands back something else',
            device => device.corruptWhen(key => String(key).indexOf(':damaged') !== -1)]
    ];

    FAULTS.forEach(([label, breakIt]) => {
        suite(`the copy cannot be made: ${label}`);

        const source = crew({ deviceId: 'd_fault_src' });
        const advanceId = Object.keys(source.State.schedule.advances)[0];
        const raw = documentWith(source,
            { advanceId, kind: 'repaid', date: '2026-08-18', amount: 'abc' });
        const disk = Object.assign({}, source.dump(),
            { 'scheduleData:v2': JSON.stringify(raw) });

        const device = makeDevice({ deviceId: 'd_fault', storage: disk });
        breakIt(device);
        device.State.load();

        const problem = device.global('Recovery').problems
            .find(item => item.key === 'scheduleData:v2:ledger');
        check('the person is told, by name', Boolean(problem),
            JSON.stringify(device.global('Recovery').problems.map(p => p.key)));
        // THE DIFFERENCE THIS FAULT MAKES. An ordinary quarantine can be acknowledged -
        // the bytes are safe in a copy, and carrying on is a fair trade. Here there is no
        // copy, so it cannot be waved away by anybody.
        check('and it says there is no copy, so it cannot be acknowledged away',
            Boolean(problem) && problem.copy === null && problem.mustHold === true,
            JSON.stringify(problem && { copy: problem.copy, mustHold: problem.mustHold }));
        check('the device will not write', device.call('farkadWritesBlocked') === true,
            String(device.call('farkadWritesBlocked')));
        check('acknowledging does not release it',
            (device.global('Recovery').acknowledge('scheduleData:v2:ledger'),
                device.call('farkadWritesBlocked')) === true);

        // THE ORIGINAL. Whatever happened to the copy, the bytes that were there are
        // still there - untouched, unparsed and unaltered.
        check('the original record is untouched on the disk',
            device.raw('scheduleData:v2') === disk['scheduleData:v2'],
            String(device.raw('scheduleData:v2') === disk['scheduleData:v2']));
        check('and it still contains the unreadable amount',
            String(device.raw('scheduleData:v2')).indexOf('"abc"') !== -1);
        check('the entry was held aside rather than folded',
            JSON.stringify(device.State.schedule.ledger.unreadable.le_bad || null)
                .indexOf('abc') !== -1,
            JSON.stringify(device.State.schedule.ledger.unreadable.le_bad || null));
        check('and no fold reads it as a number',
            device.call('foldLedger', device.State.schedule)[advanceId] === undefined
            || device.call('foldLedger', device.State.schedule)[advanceId].repaid === 0,
            JSON.stringify(device.call('foldLedger', device.State.schedule)[advanceId]));

        // The one door that must still open with the copy gone.
        const rescue = device.global('Recovery').rawRecords();
        check('the raw rescue export still carries the bytes out',
            JSON.stringify(rescue).indexOf('abc') !== -1,
            JSON.stringify(Object.keys(rescue)));

        // CLOSE AND REOPEN, with the fault still in place. A device that forgot here
        // would resume writing over the only copy of somebody's advances.
        const again = makeDevice({ deviceId: 'd_fault2', storage: device.dump() });
        breakIt(again);
        again.State.load();
        check('after a close and reopen it is found again',
            again.global('Recovery').problems
                .some(item => item.key === 'scheduleData:v2:ledger'),
            JSON.stringify(again.global('Recovery').problems.map(p => p.key)));
        check('the reopened device still refuses to write',
            again.call('farkadWritesBlocked') === true,
            String(again.call('farkadWritesBlocked')));
        check('and the record it reopened onto is still the original bytes',
            again.raw('scheduleData:v2') === disk['scheduleData:v2']);
        check('with the roster and the days still readable',
            again.State.schedule.workers.length === 1
            && Object.keys(again.State.schedule.advances).length === 1,
            JSON.stringify({ workers: again.State.schedule.workers.length,
                advances: Object.keys(again.State.schedule.advances).length }));
    });
}

// ---------------------------------------------- and when the copy CAN be made, once
{
    suite('a second damaged ledger never overwrites the first quarantine');

    // The mistake this whole file exists to prevent, one level up: two damaged records
    // under one key, the second recovery destroying the evidence from the first.
    const source = crew({ deviceId: 'd_twice_src' });
    const advanceId = Object.keys(source.State.schedule.advances)[0];
    const first = documentWith(source,
        { advanceId, kind: 'repaid', date: '2026-08-18', amount: 'FIRST-abc' });
    const one = makeDevice({ deviceId: 'd_twice',
        storage: Object.assign({}, source.dump(),
            { 'scheduleData:v2': JSON.stringify(first) }) });
    one.State.load();
    given('the first copy landed',
        one.raw('scheduleData:v2:ledger:damaged') !== null
        && String(one.raw('scheduleData:v2:ledger:damaged')).indexOf('FIRST') !== -1,
        String(one.raw('scheduleData:v2:ledger:damaged')));

    const second = documentWith(source,
        { advanceId, kind: 'repaid', date: '2026-08-18', amount: 'SECOND-abc' });
    const two = makeDevice({ deviceId: 'd_twice2',
        storage: Object.assign({}, one.dump(),
            { 'scheduleData:v2': JSON.stringify(second) }) });
    two.State.load();

    check('the first quarantine is still exactly what it was',
        String(two.raw('scheduleData:v2:ledger:damaged')).indexOf('FIRST') !== -1,
        String(two.raw('scheduleData:v2:ledger:damaged')).slice(0, 60));
    check('and the second went to a slot of its own',
        String(two.raw('scheduleData:v2:ledger:damaged:2')).indexOf('SECOND') !== -1,
        String(two.raw('scheduleData:v2:ledger:damaged:2')).slice(0, 60));
    const rescue = two.global('Recovery').rawRecords();
    check('the rescue export carries both wrecks',
        JSON.stringify(rescue).indexOf('FIRST') !== -1
        && JSON.stringify(rescue).indexOf('SECOND') !== -1,
        JSON.stringify(Object.keys(rescue)));
}

report();
