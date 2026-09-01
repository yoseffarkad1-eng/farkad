// A damaged APPROVAL is a damaged record, and it has to be treated like one.
//
//   node tests/quarantine.test.mjs
//
// tests/ledger.ingress.test.mjs proves the entries: an advance whose amount will not
// parse is held aside, never coerced, never folded, and its bytes survive into the rescue
// file. The approvals are the other map under the same container, and they decide whether
// this device may write money at all - and half of that treatment stopped at the door.
//
// normaliseSchedule holds a malformed approval aside correctly. It goes into
// ledger.unreadableMigrations, it is kept out of ledger.migrations, the gate stays shut,
// and the device stops writing. Then it tells Recovery:
//
//     Recovery.damaged('scheduleData:v2:ledger',
//         JSON.stringify(schedule.ledger.unreadable),      <- only the ENTRIES
//         '...');
//
// So when the only damaged thing is an approval, the problem is raised with a payload of
// "{}". Measured: problems [{ key: 'scheduleData:v2:ledger', raw: '{}' }] while
// ledger.unreadableMigrations holds the approval in full. Recovery quarantines the raw it
// is handed, so the quarantined copy is "{}" too, and the rescue export built from those
// copies carries an empty object where somebody's approval used to be.
//
// The bytes are not lost - they are still on the schedule and still on the disk - but the
// one mechanism this app has for GETTING THEM OFF THE PHONE was handed an empty string.
// A person following the app's own instructions ("export a backup, then we can continue")
// exports a file that does not contain the thing that stopped them.
//
// And the container itself: ledgerContainerProblem catches a `migrations` that is a
// string, an array or a number, and carries the bytes under unreadableContainer. It lets
// `migrations: null` through as an absence. An absent map is an absence; a null somebody
// WROTE there is not, and it reads as "nobody approved" - which is a statement about
// somebody's money that no byte on this disk actually makes.
//
// Every fixture here is built through JSON so the shapes are the shapes a disk really
// holds, and the marker BAD-MIGRATION-APPROVAL is followed from the disk all the way to a
// second phone's screen.

import { makeDevice } from './harness.mjs';
import { suite, check, same, given, report } from './runner.mjs';

const MARKER = 'BAD-MIGRATION-APPROVAL';
const LEDGER_KEY = 'scheduleData:v2:ledger';

// A record with a man, a day and an advance on it, so planCarryMigration().needed is
// true and the approval actually decides something.
function seeded(deviceId) {
    const device = makeDevice({ deviceId });
    device.setToday('2026-08-26');
    device.ctx.askTell = () => Promise.resolve();
    device.State.schedule.workers = [
        { id: 'w_01', name: 'דוד', active: true, dailyRate: 400, hourlyRate: 0 }];
    device.State.schedule.places = [{ id: 'p_01', name: 'הרצליה', active: true }];
    device.State.save({ silent: true });
    device.State.commit(device.call('assignPlace', device.State.schedule,
        '2026-08-10', 'w_01', 'actual', 'p_01'));
    device.State.commit(device.call('addAdvance', device.State.schedule,
        'w_01', '2026-08-10', 5000, ''));
    return device;
}

// The damaged ledger written onto a real disk, and that disk opened by a fresh device -
// which is what a boot is. Built through JSON.parse so the map is exactly what a phone
// would read back, not an object this file constructed.
function opened(deviceId, ledgerJson, extraStorage) {
    const seed = seeded('seed_' + deviceId);
    const disk = JSON.parse(seed.dump()['scheduleData:v2']);
    disk.ledger = Object.assign({}, disk.ledger, JSON.parse(ledgerJson));
    const storage = Object.assign({}, seed.dump(),
        { 'scheduleData:v2': JSON.stringify(disk) }, extraStorage || {});
    const device = makeDevice({ deviceId, storage });
    device.setToday('2026-08-26');
    device.ctx.askTell = () => Promise.resolve();
    device.State.load();
    return device;
}

const problemsOf = device => device.global('Recovery').problems;
const findProblem = (device, key) =>
    problemsOf(device).find(problem => problem.key === key) || null;

// What the rescue export actually carries. rawRecords() is what the export of last resort
// is built from - see tests/recovery.test.mjs - so this is the file, not a proxy for it.
const rescueText = device => JSON.stringify(device.global('Recovery').rawRecords());

const BAD_APPROVAL = JSON.stringify({
    migrations: { cm_carry: { id: 'cm_carry', kind: 'carry', rows: MARKER, at: '', by: '' } }
});

// ------------------------------------------------ the approval that could not be read
{
    suite('a damaged approval reaches the quarantine, the rescue file, and the second phone');

    const device = opened('d_bad', BAD_APPROVAL);

    given('the migration is needed, so the approval decides something',
        device.call('planCarryMigration', device.State.schedule).needed === true);
    given('the approval was held aside rather than read',
        Object.keys(device.State.schedule.ledger.unreadableMigrations).length === 1
        && Object.keys(device.State.schedule.ledger.migrations).length === 0,
        JSON.stringify(device.State.schedule.ledger.unreadableMigrations));
    given('so the gate is shut and the device is not writing',
        device.call('carryMigrationSettled', device.State.schedule) === false
        && device.call('farkadWritesBlocked') === true);

    const problem = findProblem(device, LEDGER_KEY);
    check('the person is told, under the ledger key',
        problem !== null, JSON.stringify(problemsOf(device).map(p => p.key)));

    // THE PAYLOAD. This is the check the defect fails: Recovery was handed the entries
    // and never the approvals, so the problem it raised described an empty object.
    check('and the problem carries the bytes that caused it',
        problem !== null && String(problem.raw).indexOf(MARKER) !== -1,
        JSON.stringify(String((problem || {}).raw).slice(0, 120)));

    // THE QUARANTINED COPY, read back off the disk by its own key rather than trusted.
    check('a verified copy of those bytes is on the disk',
        problem !== null && typeof problem.copy === 'string' && problem.copy.length > 0,
        JSON.stringify((problem || {}).copy));
    check('and reading that copy back gives the bytes',
        problem !== null && problem.copy
        && String(device.dump()[problem.copy] || '').indexOf(MARKER) !== -1,
        JSON.stringify(String(device.dump()[(problem || {}).copy] || '').slice(0, 120)));

    // THE RESCUE FILE, which is the whole point of holding the device.
    check('the export of last resort carries them off the phone',
        rescueText(device).indexOf(MARKER) !== -1);

    // AND A SECOND PHONE THAT IMPORTS THAT FILE still has them, still held aside, still
    // not writing. A rescue that arrives readable would mean the first phone had guessed.
    const carried = JSON.parse(device.dump()['scheduleData:v2']);
    const second = makeDevice({ deviceId: 'd_second',
        storage: { 'scheduleData:v2': JSON.stringify(carried) } });
    second.setToday('2026-08-26');
    second.ctx.askTell = () => Promise.resolve();
    second.State.load();
    check('the second phone holds the same bytes, still aside',
        JSON.stringify(second.State.schedule.ledger.unreadableMigrations)
            .indexOf(MARKER) !== -1,
        JSON.stringify(second.State.schedule.ledger.unreadableMigrations));
    check('its gate is shut too',
        second.call('carryMigrationSettled', second.State.schedule) === false);
    check('and it is not writing either',
        second.call('farkadWritesBlocked') === true);
}

// ------------------------------------------------------------- the container, five ways
{
    suite('a migrations map that is not a map is a damaged container, every way it arrives');

    // Every one of these reads as "no approvals" if it is waved through, and "no
    // approvals" is a statement about somebody's money that none of these bytes makes.
    // The NEEDLE is given per shape rather than derived. rawRecords() nests one JSON
    // document inside another, so every inner quote comes back escaped and searching a
    // rescue file for `JSON.stringify(value)` finds nothing however well it was carried -
    // a trap that has cost this repository a green check before. The needle is the part
    // of the value that survives escaping intact.
    const shapes = [
        ['a string', JSON.stringify({ migrations: MARKER }), MARKER],
        ['an array', JSON.stringify({ migrations: [MARKER] }), MARKER],
        ['a number', JSON.stringify({ migrations: 7 }), '7'],
        ['null', JSON.stringify({ migrations: null }), 'null']
    ];

    for (const [what, ledgerJson, needle] of shapes) {
        const device = opened('d_c_' + what.replace(/\W/g, ''), ledgerJson);
        const raw = JSON.parse(ledgerJson).migrations;

        check(`${what}: the device is held`,
            device.call('farkadWritesBlocked') === true, what);
        check(`${what}: the gate stays shut`,
            device.call('carryMigrationSettled', device.State.schedule) === false, what);
        check(`${what}: nothing was read as an approval`,
            Object.keys(device.State.schedule.ledger.migrations || {}).length === 0,
            JSON.stringify(device.State.schedule.ledger.migrations));
        // THE ORIGINAL SERIALIZED VALUE, not a repair of it and not a description.
        check(`${what}: the value is preserved exactly as it arrived`,
            JSON.stringify((device.State.schedule.ledger.unreadableContainer
                || {}).migrations) === JSON.stringify(raw),
            JSON.stringify((device.State.schedule.ledger.unreadableContainer || {}).migrations));
        const problem = findProblem(device, LEDGER_KEY + ':container');
        check(`${what}: Recovery was handed that value`,
            problem !== null && String(problem.raw).indexOf(JSON.stringify(raw)) !== -1,
            JSON.stringify(String((problem || {}).raw).slice(0, 120)));
        check(`${what}: and the rescue file carries it`,
            rescueText(device).indexOf(needle) !== -1,
            `looking for ${needle}`);
    }
}

// ------------------------------------------------------- an older damaged copy is kept
{
    suite('a second reading does not overwrite the first quarantine');

    // The device has been opened before and a copy already sits at :damaged. Nothing may
    // write over it: it is a copy of bytes nobody has read yet.
    const previous = JSON.stringify({ ledger: { migrations: { cm_old: 'AN-EARLIER-' + MARKER } } });
    const device = opened('d_twice', BAD_APPROVAL,
        { [LEDGER_KEY + ':damaged']: previous });

    check('the earlier copy is untouched',
        device.dump()[LEDGER_KEY + ':damaged'] === previous,
        String(device.dump()[LEDGER_KEY + ':damaged'] || '').slice(0, 80));
    check('and the new one went beside it',
        String(device.dump()[LEDGER_KEY + ':damaged:2'] || '').indexOf(MARKER) !== -1,
        JSON.stringify(Object.keys(device.dump()).filter(k => k.indexOf(':damaged') !== -1)));
    check('the rescue file carries both',
        rescueText(device).indexOf('AN-EARLIER-' + MARKER) !== -1
        && rescueText(device).indexOf(MARKER) !== -1);
}

// ------------------------------------------------------------------- when it cannot be kept
{
    suite('a quarantine that could not be verified holds the device, four ways');

    // The fault matrix. In every one of these the copy does not exist, so the ORIGINAL is
    // the only thing there is - and nothing, including a person tapping the button, may
    // let the device write near it.
    const quarantineKey = key => key.indexOf(':damaged') !== -1;
    const faults = [
        // The write is refused outright - not for want of room, but because this device
        // has decided it has no storage.
        ['the write is refused', device => device.failWrite(quarantineKey)],
        // No room. Store's reclaim ladder is allowed to throw restore points away for
        // this one write, and here even that is not enough.
        ['the disk is full', device => device.setQuota(() => true)],
        // The disk TAKES the write and gives back something else, which is why
        // setVerified reads back rather than trusting the return value.
        ['the write comes back altered', device => device.corruptWhen(quarantineKey)],
        // A slot that already holds something and will not be cleared: there is nowhere
        // to put the copy, and the copy must not be claimed.
        ['the slot cannot be cleared', device => {
            device.blockRemoval(quarantineKey);
            device.setQuota(quarantineKey);
        }]
    ];

    for (const [what, breakIt] of faults) {
        const seed = seeded('seed_f_' + what.replace(/\W/g, ''));
        const disk = JSON.parse(seed.dump()['scheduleData:v2']);
        disk.ledger = Object.assign({}, disk.ledger, JSON.parse(BAD_APPROVAL));
        const bytes = JSON.stringify(disk);

        const device = makeDevice({ deviceId: 'd_f_' + what.replace(/\W/g, ''),
            storage: Object.assign({}, seed.dump(), { 'scheduleData:v2': bytes }) });
        device.setToday('2026-08-26');
        device.ctx.askTell = () => Promise.resolve();
        breakIt(device);
        device.State.load();

        const problem = findProblem(device, LEDGER_KEY);
        check(`${what}: the original bytes are untouched`,
            device.dump()['scheduleData:v2'] === bytes, what);
        check(`${what}: no copy is claimed`,
            problem !== null && problem.copy === null,
            JSON.stringify((problem || {}).copy));
        check(`${what}: and it is a hold nobody can wave away`,
            problem !== null && problem.mustHold === true,
            JSON.stringify((problem || {}).mustHold));

        device.global('Recovery').acknowledge();
        check(`${what}: acknowledging does not let it write`,
            device.call('farkadWritesBlocked') === true, what);

        const again = makeDevice({ deviceId: 'd_f2_' + what.replace(/\W/g, ''),
            storage: device.dump() });
        again.setToday('2026-08-26');
        again.ctx.askTell = () => Promise.resolve();
        again.State.load();
        check(`${what}: and a reopen is still held`,
            again.call('farkadWritesBlocked') === true, what);
    }
}

report();
