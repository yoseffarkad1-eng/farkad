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

import { makeDevice, makeCloud } from './harness.mjs';
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


// ------------------------------------------------ the CONTAINER, not just what is in it
//
// The suites above protect a bad ENTRY inside a valid map. Reproduced at 359a244, with
// the map itself unreadable:
//
//   ledger = "abc"                  ledgerProblems: non-empty
//   ledger = []                     storedScheduleProblems: []
//   ledger = { advances: "abc" }    fullScheduleProblems: []
//   ledger = { advances: [] }       writes blocked: false
//   ledger = { unreadable: "abc" }  normalised ledger: EMPTY
//
// normaliseSchedule read `raw.ledger && typeof raw.ledger === 'object'` and fell back to
// {} for anything else - so a string was dropped on the floor, an array was read as a
// record with no advances, and either way the schedule that came out carried an empty
// ledger. The first ordinary save then wrote that empty ledger over the only copy of
// somebody's financial history, with load() reporting clean and nothing blocked.
//
// The entry checks could not catch this: there were no entries to check. A container this
// build cannot read is not an absent container, and the difference is a man's advances.
const BAD_CONTAINERS = [
    ['the whole history is a string', 'abc'],
    ['the whole history is a list', []],
    ['the entries are a string', { advances: 'abc' }],
    ['the entries are a list', { advances: [] }],
    ['what was held aside is a string', { unreadable: 'abc' }],
    ['the whole history is a number', 7],
    ['the entries are a number', { advances: 3 }]
];

function documentWithLedger(device, ledger) {
    const raw = JSON.parse(JSON.stringify(device.State.schedule));
    raw.ledger = ledger;
    return raw;
}

{
    suite('an unreadable history CONTAINER is named by the check');

    const device = crew({ deviceId: 'd_container' });
    BAD_CONTAINERS.forEach(([label, ledger]) => {
        const raw = documentWithLedger(device, ledger);
        check(`refused: ${label}`,
            device.call('ledgerContainerProblem', raw) !== null,
            JSON.stringify(device.call('ledgerContainerProblem', raw)));
    });
    const good = documentWithLedger(device, { advances: {}, unreadable: {} });
    check('and an ordinary empty history is not refused',
        device.call('ledgerContainerProblem', good) === null,
        JSON.stringify(device.call('ledgerContainerProblem', good)));
    const absent = JSON.parse(JSON.stringify(device.State.schedule));
    delete absent.ledger;
    check('nor is one that is simply not there',
        device.call('ledgerContainerProblem', absent) === null);
}

{
    suite('an unreadable container is kept, and the device stops writing');

    BAD_CONTAINERS.forEach(([label, ledger]) => {
        const source = crew({ deviceId: 'd_cs' });
        const raw = documentWithLedger(source, ledger);
        const stamp = JSON.stringify(ledger);
        const disk = Object.assign({}, source.dump(),
            { 'scheduleData:v2': JSON.stringify(raw) });

        const device = makeDevice({ deviceId: 'd_c2', storage: disk });
        device.State.load();

        check(`${label}: the record still opens`,
            device.State.schedule.workers.length === 1,
            String(device.State.schedule.workers.length));
        check(`${label}: the bytes are kept, not turned into an empty history`,
            JSON.stringify(device.State.schedule.ledger.unreadableContainer) === stamp,
            JSON.stringify(device.State.schedule.ledger.unreadableContainer));
        check(`${label}: the person is told, under a key of its own`,
            device.global('Recovery').problems
                .some(item => item.key === 'scheduleData:v2:ledger:container'),
            JSON.stringify(device.global('Recovery').problems.map(p => p.key)));
        check(`${label}: and the device will not write`,
            device.call('farkadWritesBlocked') === true,
            String(device.call('farkadWritesBlocked')));
        check(`${label}: the original record on the disk is untouched`,
            device.raw('scheduleData:v2') === disk['scheduleData:v2']);
        check(`${label}: and the rescue export still carries it out`,
            JSON.stringify(device.global('Recovery').rawRecords()).indexOf(stamp.slice(1, 12)) !== -1
            || JSON.stringify(device.global('Recovery').rawRecords())
                .indexOf('scheduleData:v2') !== -1,
            JSON.stringify(Object.keys(device.global('Recovery').rawRecords())));
    });
}

{
    suite('an unreadable container arriving through every other door');

    const shape = { advances: 'abc' };
    const stamp = JSON.stringify(shape);

    // A CLOUD SNAPSHOT. The commonest way a bad document reaches a phone that never had
    // one: another build, or a partial write, and this device adopts it.
    {
        const device = crew({ deviceId: 'd_door_cloud' });
        const cloud = makeCloud();
        device.Sync.connect(cloud.adapter);
        const raw = documentWithLedger(device, shape);
        raw.updatedAt = '2026-09-01T10:00:00.000Z';
        device.Sync.receive(raw);
        check('cloud snapshot: the bytes are held aside',
            JSON.stringify(device.State.schedule.ledger.unreadableContainer) === stamp
            || device.call('farkadWritesBlocked') === true,
            JSON.stringify(device.State.schedule.ledger.unreadableContainer));
        check('cloud snapshot: and the device stops writing',
            device.call('farkadWritesBlocked') === true);
    }

    // A WHOLE-DOCUMENT REPLACEMENT - a restore, or a backup import. The gate that decides
    // whether a replacement may be adopted at all.
    {
        const device = crew({ deviceId: 'd_door_replace' });
        const raw = documentWithLedger(device, shape);
        const refused = device.call('fullScheduleProblems', raw);
        check('a replacement carrying an unreadable history is refused at the door',
            refused.length > 0, JSON.stringify(refused));
    }

    // AND CLOSE AND REOPEN. A device that forgot on the next boot would write over the
    // only copy at the first tap.
    {
        const source = crew({ deviceId: 'd_door_boot' });
        const raw = documentWithLedger(source, shape);
        const disk = Object.assign({}, source.dump(),
            { 'scheduleData:v2': JSON.stringify(raw) });
        const first = makeDevice({ deviceId: 'd_door_boot2', storage: disk });
        first.State.load();
        given('the first boot found it', first.call('farkadWritesBlocked') === true);

        const again = makeDevice({ deviceId: 'd_door_boot3', storage: first.dump() });
        again.State.load();
        check('close and reopen: it is found again',
            again.call('farkadWritesBlocked') === true,
            JSON.stringify(again.global('Recovery').problems.map(p => p.key)));
        check('close and reopen: and the record on the disk is still the original',
            again.raw('scheduleData:v2') === disk['scheduleData:v2']);
    }
}

{
    suite('an unreadable container when the quarantine itself cannot land');

    const FAULTS = [
        ['the disk is full', device => device.setQuota(
            key => String(key).indexOf(':damaged') !== -1)],
        ['the browser refuses the write outright', device => device.failWrite(
            key => String(key).indexOf(':damaged') !== -1)],
        ['the disk takes the write and hands back something else',
            device => device.corruptWhen(key => String(key).indexOf(':damaged') !== -1)]
    ];

    FAULTS.forEach(([label, breakIt]) => {
        const source = crew({ deviceId: 'd_cf' });
        const raw = documentWithLedger(source, { advances: 'abc' });
        const disk = Object.assign({}, source.dump(),
            { 'scheduleData:v2': JSON.stringify(raw) });

        const device = makeDevice({ deviceId: 'd_cf2', storage: disk });
        breakIt(device);
        device.State.load();

        const problem = device.global('Recovery').problems
            .find(item => item.key === 'scheduleData:v2:ledger:container');
        check(`${label}: the person is told`, Boolean(problem),
            JSON.stringify(device.global('Recovery').problems.map(p => p.key)));
        check(`${label}: and told there is no verified copy`,
            Boolean(problem) && problem.copy === null && problem.mustHold === true,
            JSON.stringify(problem && { copy: problem.copy, mustHold: problem.mustHold }));
        check(`${label}: acknowledging does not release it`,
            (device.global('Recovery').acknowledge('scheduleData:v2:ledger:container'),
                device.call('farkadWritesBlocked')) === true);
        check(`${label}: the original is untouched`,
            device.raw('scheduleData:v2') === disk['scheduleData:v2']);

        const again = makeDevice({ deviceId: 'd_cf3', storage: device.dump() });
        breakIt(again);
        again.State.load();
        check(`${label}: and it is still blocked after a close and reopen`,
            again.call('farkadWritesBlocked') === true);
    });
}

{
    suite('a part of the ledger this build has never heard of is carried, not dropped');

    // FOUND ON THE LEDGER BRANCH, and it is a fault of THIS one.
    //
    // normaliseSchedule rebuilds schedule.ledger out of the two maps this build owns -
    // `advances` and `unreadable` - and writes nothing else into it. save() then
    // serialises exactly that object. So any OTHER part of the ledger container is read
    // off the disk, left out of the schedule, and written over by the next ordinary save.
    //
    // That is not hypothetical. The next build adds `ledger.migrations`, a person's
    // approval of a financial migration, and three phones do not update together: a phone
    // still on this build, sharing the record, would delete it on every save - the
    // approval, and anything else a later build ever puts there. Silently, with the load
    // reporting clean, nothing quarantined, and the parity check blessing the result.
    //
    // The rule this file already states for an ENTRY it cannot fold is the rule: the
    // bytes survive and the fold ignores them. It has to hold for the container's parts
    // too, because "this build does not understand it" and "it is not there" are
    // different statements about somebody's money.
    const device = makeDevice({ deviceId: 'd_future' });
    device.State.schedule.workers = WORKERS.map(worker => Object.assign({}, worker));
    device.State.schedule.places = PLACES.map(place => Object.assign({}, place));
    device.State.save({ silent: true });
    const disk = JSON.parse(device.raw('scheduleData:v2'));
    disk.ledger = disk.ledger || { advances: {}, unreadable: {} };
    disk.ledger.migrations = {
        cm_carry: { id: 'cm_carry', kind: 'carry', rows: 1,
            at: '2026-08-26T09:00:00.000Z', by: 'd_v89' }
    };
    disk.ledger.somethingLater = { note: 'a build after this one' };

    const opened = makeDevice({ deviceId: 'd_future2',
        storage: Object.assign({}, device.dump(),
            { 'scheduleData:v2': JSON.stringify(disk) }) });
    opened.State.load();
    check('the record still opens', opened.State.schedule.workers.length === 1);
    // On THIS branch `migrations` is a map the build owns, so it is kept by the named
    // path rather than by the catch-all. Both are asserted: the one that exists today,
    // and the one a build after this one adds.
    check('the approval this build does know is on the schedule, unchanged',
        JSON.stringify(opened.State.schedule.ledger.migrations)
            === JSON.stringify(disk.ledger.migrations),
        JSON.stringify(opened.State.schedule.ledger));
    check('every part of it, not the one somebody thought of',
        JSON.stringify(opened.State.schedule.ledger.somethingLater)
            === JSON.stringify(disk.ledger.somethingLater),
        JSON.stringify(opened.State.schedule.ledger));

    // NOT QUARANTINED AND NOT A REASON TO STOP. It is not unreadable - this build has no
    // opinion about it at all - and a device that went into recovery over a field a later
    // build added would be one nobody could record a day on.
    check('nothing is held aside and nothing is blocked',
        Object.keys(opened.State.schedule.ledger.unreadable).length === 0
        && opened.call('farkadWritesBlocked') === false,
        JSON.stringify(opened.State.schedule.ledger.unreadable));

    // THE SAVE IS THE WHOLE POINT. Reading it into memory and writing it away again is
    // the same deletion one commit later.
    opened.State.commit(opened.call('assignPlace', opened.State.schedule,
        '2026-08-10', 'w_01', 'actual', 'p_01'));
    const written = JSON.parse(opened.raw('scheduleData:v2'));
    check('and an ordinary edit writes it back to the disk rather than over it',
        JSON.stringify(written.ledger.migrations)
            === JSON.stringify(disk.ledger.migrations),
        JSON.stringify(written.ledger));

    // And through the cloud door, which is the one it would actually arrive by.
    const other = makeDevice({ deviceId: 'd_future3' });
    other.State.schedule.workers = WORKERS.map(worker => Object.assign({}, worker));
    other.State.save({ silent: true });
    other.Sync.receive(Object.assign({}, disk,
        { updatedAt: '2026-08-26T10:00:00.000Z', updatedBy: 'd_v89' }));
    check('a snapshot from a later build keeps its own part of the ledger',
        JSON.stringify((other.State.schedule.ledger || {}).migrations)
            === JSON.stringify(disk.ledger.migrations),
        JSON.stringify(other.State.schedule.ledger));
}

report();
