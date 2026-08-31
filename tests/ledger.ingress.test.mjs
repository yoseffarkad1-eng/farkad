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

report();
