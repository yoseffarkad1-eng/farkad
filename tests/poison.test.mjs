// A name that is not a name.
//
//   node tests/poison.test.mjs
//
// `__proto__` is a legal string, a legal JSON key, and - until this file - a legal Farkad
// id. isSafeId accepted it; ledgerEntryProblems accepted it; ledgerProblems accepted it;
// the whole-document gate accepted it. And then this happened:
//
//     map['__proto__'] = entry
//
// which does not store an entry. It re-parents the map. Object.keys() answers [], the
// entry is not in the fold, it is not in `unreadable`, Recovery is never told, writes are
// not blocked, and the very next save writes {"advances":{}} over the only record that
// 500 shekels were handed to somebody. A load that reported clean, a parity check that
// blessed it, and money gone.
//
// It is not prototype POLLUTION - Object.prototype is untouched, and a test that only
// checked that would have passed while the money vanished. It is a silent deletion, which
// is the one thing iron law 10 exists to make impossible.
//
// Three maps take caller-supplied keys and all three had the same hole: the ledger, the
// legacy advances field every phone still writes, and the day records. The wire was
// already safe - journalEntryProblems asks isSafeSegment, which knows the three names -
// so the app looked like it had thought about this. It had thought about half of it.
//
// A SECOND FAULT, in the same block and found beside it: normaliseSchedule validated
// `Object.assign({}, entry, { id: String(id) })` - the id forced to agree with the key
// BEFORE the check that they agree. So an entry stored under le_a claiming to be le_b was
// silently rewritten to le_a, folded as money, and the evidence of the mismatch destroyed.
// ledgerEntryProblems has always had the rule; nothing on the read path ever asked it.
//
// Every fixture here is built with JSON.parse, because that is the only way to get a real
// own `__proto__` property - and it is exactly how one arrives: off a disk, out of a
// backup file, out of a cloud snapshot.

import { makeDevice } from './harness.mjs';
import { suite, check, same, given, report } from './runner.mjs';

const WORKERS = [{ id: 'w_01', name: 'דוד', active: true, dailyRate: 400, hourlyRate: 0 }];
const PLACES = [{ id: 'p_01', name: 'הרצליה', active: true }];

// hasOwnProperty.call, always. `map['__proto__'] !== undefined` reads Object.prototype off
// an empty map and answers true - so the natural spelling of every assertion in this file
// passes without the code doing anything at all.
const owns = (object, key) => Object.prototype.hasOwnProperty.call(object || {}, key);

const POISON = ['__proto__', 'prototype', 'constructor'];

function phone(deviceId, storage) {
    const device = makeDevice(storage ? { deviceId, storage } : { deviceId });
    device.setToday('2026-08-20');
    return device;
}

function seeded() {
    const device = phone('d_seed');
    device.State.schedule.workers = WORKERS.map(worker => Object.assign({}, worker));
    device.State.schedule.places = PLACES.map(place => Object.assign({}, place));
    device.State.save({ silent: true });
    return device;
}

// ------------------------------------------------------------------ the predicate
{
    suite('a name that would land on a prototype is not a safe id');

    const device = seeded();
    POISON.forEach(name => {
        check(`isSafeId refuses ${name}`,
            device.call('isSafeId', name) === false,
            String(device.call('isSafeId', name)));
    });
    // The wire predicate already knew. The document predicate is the one that did not,
    // and every map key in this app is a document key.
    POISON.forEach(name => {
        check(`isSafeSegment refuses ${name} too`,
            device.call('isSafeSegment', name) === false);
    });
    // AND NOTHING ELSE MOVED. A predicate that started refusing ordinary ids would take
    // the roster with it.
    ['w_01', 'a_6hlrw2uk', 'le_mig_a_01', 'cm_carry', 'toString', 'valueOf']
        .forEach(name => {
            check(`and still accepts ${name}`, device.call('isSafeId', name) === true);
        });
}

// ------------------------------------------------------- the ledger, through the door
{
    suite('a ledger entry keyed on a prototype name is held aside, not deleted by a read');

    const source = seeded();
    const disk = JSON.parse(source.raw('scheduleData:v2'));
    // JSON.parse, so the key is a REAL own property - which is how it arrives.
    disk.ledger = JSON.parse('{"advances":{"__proto__":{"id":"__proto__",'
        + '"advanceId":"a_1","kind":"given","workerId":"w_01","date":"2026-08-10",'
        + '"amount":500,"note":"","at":"","by":"d_old"}},"unreadable":{}}');

    const beforeProto = Object.getOwnPropertyNames(Object.prototype).length;
    const device = phone('d_poison', Object.assign({}, source.dump(),
        { 'scheduleData:v2': JSON.stringify(disk) }));
    device.State.load();

    check('the document gate names it',
        device.call('ledgerProblems', disk).length > 0,
        JSON.stringify(device.call('ledgerProblems', disk)));
    check('Object.prototype is untouched either way',
        Object.getOwnPropertyNames(Object.prototype).length === beforeProto);
    // THE MAP'S OWN PROTOTYPE. This is the mechanism, and it is the thing that used to
    // make the entry invisible rather than merely wrong.
    check('and the map the entries live in still has an ordinary prototype',
        Object.getPrototypeOf(device.State.schedule.ledger.advances) === Object.prototype);
    check('the entry is not in the fold',
        Object.keys(device.State.schedule.ledger.advances).length === 0,
        JSON.stringify(Object.keys(device.State.schedule.ledger.advances)));
    check('its bytes are held aside, under a key the read can see',
        owns(device.State.schedule.ledger.unreadable, '__proto__'),
        JSON.stringify(Object.keys(device.State.schedule.ledger.unreadable)));
    check('the person is told', device.global('Recovery').problems.length > 0,
        JSON.stringify(device.global('Recovery').problems.map(problem => problem.key)));
    check('and the device stops writing while the money is uncertain',
        device.call('farkadWritesBlocked') === true);
    check('the rescue export still carries the 500 out',
        JSON.stringify(device.global('Recovery').rawRecords()).indexOf('"amount":500') !== -1);

    // THE SAVE, which is where the deletion actually happened.
    device.State.save({ silent: true });
    check('and an ordinary save writes the bytes back rather than over them',
        device.raw('scheduleData:v2').indexOf('500') !== -1,
        device.raw('scheduleData:v2').slice(0, 120));

    const again = phone('d_poison2', device.dump());
    again.State.load();
    check('still held aside, and still blocked, after a close and reopen',
        owns(again.State.schedule.ledger.unreadable, '__proto__')
        && again.call('farkadWritesBlocked') === true);
}

// ------------------------------------------------- the legacy money field, same door
{
    suite('an advance keyed on a prototype name does not disappear either');

    // schedule.advances is the field EVERY phone still writes. The ledger is the newer
    // record; this is the one the money is actually paid from today.
    const source = seeded();
    const disk = JSON.parse(source.raw('scheduleData:v2'));
    disk.advances = JSON.parse('{"__proto__":{"id":"__proto__","workerId":"w_01",'
        + '"date":"2026-08-10","amount":500,"note":""}}');

    check('the document gate names it',
        device_problems(source, disk).length > 0,
        JSON.stringify(device_problems(source, disk)));

    const device = phone('d_adv', Object.assign({}, source.dump(),
        { 'scheduleData:v2': JSON.stringify(disk) }));
    device.State.load();
    check('and five hundred shekels does not vanish on the way in',
        JSON.stringify(device.global('Recovery').rawRecords()).indexOf('"amount":500') !== -1
        || Object.keys(device.State.schedule.advances).length > 0,
        JSON.stringify(device.State.schedule.advances));
    check('the person is told rather than the record quietly emptied',
        device.global('Recovery').problems.length > 0,
        JSON.stringify(device.global('Recovery').problems.map(problem => problem.key)));
}

function device_problems(device, raw) {
    return device.call('storedScheduleProblems', raw);
}

// ------------------------------------------------------------ the invented identity
{
    suite('an immutable id is never rewritten to match the key it was found under');

    const source = seeded();
    const disk = JSON.parse(source.raw('scheduleData:v2'));
    disk.ledger = { advances: { le_a: { id: 'le_b', advanceId: 'a_x', kind: 'given',
        workerId: 'w_01', date: '2026-08-10', amount: 500, note: '', at: '', by: 'd_old' } },
        unreadable: {} };

    const device = phone('d_mismatch', Object.assign({}, source.dump(),
        { 'scheduleData:v2': JSON.stringify(disk) }));
    device.State.load();

    check('the id is not rewritten to the key',
        !owns(device.State.schedule.ledger.advances, 'le_a'),
        JSON.stringify(device.State.schedule.ledger.advances));
    check('the mismatch is retained, exactly as it arrived',
        JSON.stringify(device.State.schedule.ledger.unreadable.le_a)
            === JSON.stringify(disk.ledger.advances.le_a),
        JSON.stringify(device.State.schedule.ledger.unreadable));
    check('and it has no financial effect',
        Object.keys(device.call('foldLedger', device.State.schedule)).length === 0,
        JSON.stringify(device.call('foldLedger', device.State.schedule)));
    check('recovery names it', device.global('Recovery').problems.length > 0,
        JSON.stringify(device.global('Recovery').problems.map(problem => problem.key)));
    check('and the device stops writing',
        device.call('farkadWritesBlocked') === true);
}

// ---------------------------------------------------------------- and at the writer
{
    suite('an unsafe id is refused before it touches memory, disk or the outbox');

    const device = seeded();
    const before = JSON.stringify(device.State.schedule);
    const beforeDisk = device.raw('scheduleData:v2');
    const beforePending = device.Sync.pendingCount();

    // appendLedgerEntry with a caller-supplied poison id. The UI cannot produce one; a
    // rescue import, another build or a bug can, and this is the last line before the
    // live schedule.
    let threw = null;
    let change = null;
    try {
        change = device.call('appendLedgerEntry', device.State.schedule, {
            id: '__proto__', advanceId: 'a_1', kind: 'given', workerId: 'w_01',
            date: '2026-08-10', amount: 500, note: '', at: '', by: 'd_x'
        });
    } catch (error) { threw = error; }

    check('the writer refuses it', threw !== null || change === null,
        threw ? String(threw.message) : JSON.stringify(change));
    check('the live schedule in memory is not re-parented',
        Object.getPrototypeOf(device.State.schedule.ledger.advances) === Object.prototype);
    check('nothing changed in memory', JSON.stringify(device.State.schedule) === before);
    check('nothing reached the disk', device.raw('scheduleData:v2') === beforeDisk);
    check('and nothing reached the outbox',
        device.Sync.pendingCount() === beforePending,
        `${beforePending} -> ${device.Sync.pendingCount()}`);
}

// ------------------------------------- and one poison operation does not eat a batch
{
    suite('a good edit queued beside a poison one still leaves the phone');

    // The queue validates on the way OUT of the disk and refuses the whole batch record,
    // because a batch is atomic and half of one is not a thing. So an operation that
    // should never have been written took a legitimate 300-shekel edit down with it, and
    // pendingPaths() answered [] with the good edit's bytes plainly on the disk. Refusing
    // at the queue means the batch never contains the poison in the first place.
    const device = seeded();
    device.State.commit(device.call('assignPlace', device.State.schedule,
        '2026-08-10', 'w_01', 'actual', 'p_01'));
    const good = device.Sync.pendingCount();
    given('the good edit is owed', good > 0, String(good));

    device.Sync.edit('days.2026-08-11.actual.__proto__',
        { entries: [{ placeId: 'p_01' }] });

    check('the good edit is still owed', device.Sync.pendingCount() >= good,
        String(device.Sync.pendingCount()));
    const again = phone('d_batch2', device.dump());
    check('and still owed after a close and reopen',
        again.Sync.pendingCount() >= good, String(again.Sync.pendingCount()));
}

report();
