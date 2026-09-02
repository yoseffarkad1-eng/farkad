// What adopting somebody else's document takes off this one.
//
//   node tests/merge.test.mjs
//
// normaliseSchedule reads ONE document and carries every part of its ledger through -
// tests/ledger.ingress.test.mjs proves that, in the direction where the snapshot has the
// part and the phone does not. mergeLedgerInto is the other half: it is what puts THIS
// phone's ledger back on top of the arriving one, and it copied exactly one map.
//
//     const held = (source.ledger && source.ledger.advances) || {};
//
// So the union was directional. Whatever the snapshot carried survived; whatever only
// this phone held was discarded with the object it lived on, and State.persist() then
// wrote that over the disk. A person's approval of the money migration, the entries this
// build held aside as unreadable, the approvals it held aside, and any part of the
// container a later build adds - all four erased by a snapshot from a phone that had
// simply never heard of them, with the status reporting synced.
//
// Two more faults live in the same eleven lines.
//
// EXISTENCE WAS ASKED WITH AN INHERITED LOOKUP. `if (!target.ledger.advances[id])` is
// true for an id of `toString` on an empty map, so an entry legitimately named toString,
// valueOf or hasOwnProperty was dropped by the merge. Those are legal ids - isSafeId
// accepts them, and it should; they are not prototype names - and the codebase already
// knows the right idiom, because scheduleHoldsEntry three files away uses
// Object.prototype.hasOwnProperty.call for exactly this question.
//
// AND THE SAME ID WITH DIFFERENT BYTES WAS RESOLVED SILENTLY. `if (!target...[id])` keeps
// whichever copy the snapshot brought and drops this phone's. An append-only ledger has
// no rule that picks a winner there: an entry is written once, so two different bodies
// under one immutable id is not a merge, it is a disagreement about what happened to
// somebody's money. Both have to survive and a person has to look.
//
// The function's own comment said "an id that exists on both sides keeps the copy that is
// already on this device". It was the wrong way round: `target` is the ARRIVING document.

import { makeDevice, settle } from './harness.mjs';
import { suite, check, same, given, report } from './runner.mjs';

const WORKERS = [{ id: 'w_01', name: 'דוד', active: true, dailyRate: 400, hourlyRate: 0 }];
const PLACES = [{ id: 'p_01', name: 'הרצליה', active: true }];

const owns = (object, key) => Object.prototype.hasOwnProperty.call(object || {}, key);

function entry(id, amount) {
    return { id, advanceId: 'a_1', kind: 'given', workerId: 'w_01',
        date: '2026-08-10', amount, note: '', at: '2026-08-10T09:00:00.000Z', by: 'd_x' };
}

const APPROVAL = id => ({ id, kind: 'carry', rows: 1,
    at: '2026-08-25T09:00:00.000Z', by: 'd_person' });

function phone(deviceId, storage) {
    const device = makeDevice(storage ? { deviceId, storage } : { deviceId });
    device.setToday('2026-08-26');
    device.ctx.askTell = () => Promise.resolve();
    if (!storage) {
        device.State.schedule.workers = WORKERS.map(worker => Object.assign({}, worker));
        device.State.schedule.places = PLACES.map(place => Object.assign({}, place));
        device.State.schedule.updatedAt = '2026-08-20T00:00:00.000Z';
        device.State.schedule.updatedBy = 'd_seed';
        device.State.save({ silent: true });
    }
    return device;
}

// A snapshot from another phone: this device's own document, with the ledger replaced by
// whatever that phone holds, and a stamp newer than this one's so receive() adopts it
// rather than reading it as an echo of its own write.
function snapshotOf(device, ledger) {
    const raw = JSON.parse(JSON.stringify(device.State.schedule));
    raw.ledger = ledger;
    raw.updatedAt = '2026-08-26T10:00:00.000Z';
    raw.updatedBy = 'd_other';
    return raw;
}

// Through receive(), a save, and a reopen - not through the helper. A merge that is right
// in memory and wrong on the disk is wrong.
function afterAdopting(device, ledger, label) {
    const incoming = snapshotOf(device, ledger);
    given(`${label}: the two sides really are different`,
        JSON.stringify(incoming.ledger) !== JSON.stringify(device.State.schedule.ledger),
        JSON.stringify([incoming.ledger, device.State.schedule.ledger]).slice(0, 160));
    device.Sync.receive(incoming);
    device.State.commit(device.call('assignPlace', device.State.schedule,
        '2026-08-11', 'w_01', 'actual', 'p_01'));
    const again = makeDevice({ deviceId: device.deviceId + '_r', storage: device.dump() });
    again.setToday('2026-08-26');
    again.State.load();
    return again.State.schedule.ledger || {};
}

// ----------------------------------------------------------- the four known families
{
    suite('every append-only family survives a snapshot that has never heard of it');

    const device = phone('d_local');
    device.State.schedule.ledger = {
        advances: { le_local: entry('le_local', 500) },
        migrations: { cm_carry: APPROVAL('cm_carry') },
        unreadable: { le_bad: { id: 'le_bad', what: 'held aside earlier' } },
        unreadableMigrations: { cm_bad: { id: 'cm_bad', rows: 'לא מספר' } },
        somethingLater: { note: 'a build after this one' }
    };
    device.State.save({ silent: true });

    const held = afterAdopting(device,
        { advances: { le_remote: entry('le_remote', 300) }, unreadable: {} },
        'families');

    check('the entry the snapshot carried is there',
        owns(held.advances || {}, 'le_remote'),
        JSON.stringify(Object.keys(held.advances || {})));
    check('and the entry only this phone held is still there',
        owns(held.advances || {}, 'le_local'),
        JSON.stringify(Object.keys(held.advances || {})));
    check('the approval a person gave on this phone survives',
        owns(held.migrations || {}, 'cm_carry'),
        JSON.stringify(held.migrations || {}));
    check('what this build had held aside as unreadable survives',
        owns(held.unreadable || {}, 'le_bad'),
        JSON.stringify(Object.keys(held.unreadable || {})));
    check('and the approvals it had held aside survive',
        owns(held.unreadableMigrations || {}, 'cm_bad'),
        JSON.stringify(Object.keys(held.unreadableMigrations || {})));
    check('and a part of the container this build has never heard of survives',
        JSON.stringify((held.somethingLater || {}).note) === '"a build after this one"',
        JSON.stringify(held.somethingLater));
}

// ------------------------------------------------------ the other direction, and both
{
    suite('two distinct approvals, one each side, both survive');

    const device = phone('d_two');
    device.State.schedule.ledger = { advances: {},
        migrations: { cm_local: APPROVAL('cm_local') }, unreadable: {} };
    device.State.save({ silent: true });

    const held = afterAdopting(device,
        { advances: {}, migrations: { cm_remote: APPROVAL('cm_remote') }, unreadable: {} },
        'two approvals');

    same('the union holds both, by id',
        Object.keys(held.migrations || {}).sort(), ['cm_local', 'cm_remote']);
}

// --------------------------------------------------- an id that shadows the prototype
{
    suite('an entry named toString is an entry, not a question about a prototype');

    const device = phone('d_shadow');
    device.State.schedule.ledger = {
        advances: { toString: entry('toString', 700), valueOf: entry('valueOf', 800) },
        unreadable: {} };
    device.State.save({ silent: true });

    given('these are ordinary safe ids, and should be',
        device.call('isSafeId', 'toString') === true
        && device.call('isSafeId', 'valueOf') === true);

    const held = afterAdopting(device,
        { advances: { le_remote: entry('le_remote', 300) }, unreadable: {} }, 'shadow');

    check('both survive the merge',
        owns(held.advances || {}, 'toString') && owns(held.advances || {}, 'valueOf'),
        JSON.stringify(Object.keys(held.advances || {})));
}

// ------------------------------------------------------ one id, two different bodies
{
    suite('one immutable id with two different bodies is a disagreement, not a merge');

    const device = phone('d_clash');
    device.State.schedule.ledger = { advances: { le_1: entry('le_1', 500) }, unreadable: {} };
    device.State.save({ silent: true });
    const mine = JSON.parse(JSON.stringify(device.State.schedule.ledger.advances.le_1));

    const incoming = snapshotOf(device,
        { advances: { le_1: entry('le_1', 900) }, unreadable: {} });
    given('the two bodies really differ',
        JSON.stringify(incoming.ledger.advances.le_1) !== JSON.stringify(mine));

    device.Sync.receive(incoming);
    await settle(20);

    // NEITHER IS THROWN AWAY. Which of 500 and 900 was handed over is a question for a
    // person; there is no arithmetic that makes it one number, and picking the one that
    // happened to arrive second is picking at random.
    const rescue = JSON.stringify(device.global('Recovery').rawRecords())
        + JSON.stringify(device.State.schedule.ledger);
    check('both bodies are still recoverable',
        rescue.indexOf('500') !== -1 && rescue.indexOf('900') !== -1,
        JSON.stringify(device.State.schedule.ledger).slice(0, 200));
    check('the person is told', device.global('Recovery').problems.length > 0,
        JSON.stringify(device.global('Recovery').problems.map(problem => problem.key)));
    check('the device stops writing while the money is uncertain',
        device.call('farkadWritesBlocked') === true);
    check('and it never says synced', device.Sync.status !== 'synced', device.Sync.status);

    const again = makeDevice({ deviceId: 'd_clash_r', storage: device.dump() });
    again.setToday('2026-08-26');
    again.State.load();
    check('and it is still held after a close and reopen',
        again.call('farkadWritesBlocked') === true);
}

// ------------------------------------------------------- and identical bytes are not
{
    suite('the same id with the same bytes is the same entry, and passes quietly');

    const device = phone('d_same');
    device.State.schedule.ledger = { advances: { le_1: entry('le_1', 500) }, unreadable: {} };
    device.State.save({ silent: true });

    // The ordinary case, and by far the commonest: two phones mirroring one advance mint
    // the same id and the same body. A hold there would stop the crew working.
    device.Sync.receive(snapshotOf(device,
        { advances: { le_1: entry('le_1', 500) }, unreadable: {} }));
    await settle(20);
    check('nothing is held', device.call('farkadWritesBlocked') === false);
    check('and the entry is exactly the one entry',
        Object.keys(device.State.schedule.ledger.advances).length === 1,
        JSON.stringify(Object.keys(device.State.schedule.ledger.advances)));
}

// ------------------------------------------- and a name that cannot be assigned at all
{
    suite('evidence held under a poisoned name survives the merge');

    // An id of `__proto__` under ledger.unreadable is exactly what an earlier read leaves
    // behind: the entry could not be used as a key, so it was held aside as evidence. The
    // merge then carries every family across with
    //
    //     target.ledger[key][id] = held[id];
    //
    // and for that id an ordinary assignment creates NO own property - it writes the
    // prototype, or silently does nothing. So the one map whose whole job is to keep what
    // could not be read loses the thing it was keeping, on the next snapshot from a phone
    // that never had it.
    //
    // The quarantined copy on the disk is why this is not a total loss today, and it is
    // not a reason to leave it: the copy is one storage failure or one collection away,
    // and the record itself is supposed to carry its own evidence.
    const device = phone('d_poison');
    device.State.schedule.ledger = JSON.parse('{"advances":{},"unreadable":'
        + '{"__proto__":{"id":"le_EVIDENCE_500","amount":500}},'
        + '"migrations":{},"unreadableMigrations":{}}');
    device.State.save({ silent: true });
    given('the evidence really is an own key on this phone',
        Object.prototype.hasOwnProperty.call(device.State.schedule.ledger.unreadable,
            '__proto__'),
        JSON.stringify(Object.keys(device.State.schedule.ledger.unreadable)));

    const clean = JSON.parse(JSON.stringify(device.State.schedule));
    clean.ledger = { advances: {}, unreadable: {}, migrations: {},
        unreadableMigrations: {} };
    clean.updatedAt = '2026-08-27T10:00:00.000Z';
    clean.updatedBy = 'd_other';
    device.Sync.receive(clean);
    await settle(30);

    check('the evidence is still an own key after the merge',
        Object.prototype.hasOwnProperty.call(
            device.State.schedule.ledger.unreadable || {}, '__proto__'),
        JSON.stringify(Object.keys(device.State.schedule.ledger.unreadable || {})));
    check('and it still carries the bytes it was holding',
        JSON.stringify(device.State.schedule.ledger.unreadable)
            .indexOf('le_EVIDENCE_500') !== -1,
        JSON.stringify(device.State.schedule.ledger.unreadable));
    check('nothing was reparented by writing it',
        Object.getPrototypeOf(device.State.schedule.ledger.unreadable) !== null
        && (device.State.schedule.ledger.unreadable || {}).amount === undefined,
        JSON.stringify((device.State.schedule.ledger.unreadable || {}).amount));
    check('the device is still held', device.call('farkadWritesBlocked') === true);
    check('and never says synced', device.Sync.status !== 'synced', device.Sync.status);

    const again = makeDevice({ deviceId: 'd_poison_r', storage: device.dump() });
    again.setToday('2026-08-26');
    again.ctx.askTell = () => Promise.resolve();
    again.State.load();
    check('a reopened phone still holds the evidence',
        (JSON.stringify(again.State.schedule.ledger || {})
            + JSON.stringify(again.dump())).indexOf('le_EVIDENCE_500') !== -1);
    check('and is still held', again.call('farkadWritesBlocked') === true);
}

// ------------------------------------------- and it is the RECORD that carries it
{
    suite('a reopened phone carries the evidence on the schedule itself');

    // The check above this one reads the reopened schedule AND the dump together, so it
    // passes while the schedule holds nothing and only the quarantine copy has the bytes.
    // That is not the guarantee. The record is supposed to carry its own evidence: the
    // held-aside map is carried across a boot by keepUnder in normaliseSchedule, and the
    // guard in front of keepUnder asked `map[id] === undefined` - which for `__proto__`
    // reads Object.prototype off a plain object and is never undefined. So keepUnder
    // never ran for the one id it was written for, the reopened schedule lost the entry,
    // and the first ordinary save after an acknowledgement wrote a record without it
    // over the record that had it.
    const device = phone('d_poison_disk');
    device.State.schedule.ledger = JSON.parse('{"advances":{},"unreadable":'
        + '{"__proto__":{"id":"le_EVIDENCE_500","amount":500},'
        + '"le_bad":{"id":"le_bad","amount":"abc"}},'
        + '"migrations":{},"unreadableMigrations":{}}');
    device.State.save({ silent: true });
    given('the record on the disk carries the evidence',
        String(device.raw('scheduleData:v2')).indexOf('le_EVIDENCE_500') !== -1);

    const again = makeDevice({ deviceId: 'd_poison_disk_r', storage: device.dump() });
    again.setToday('2026-08-26');
    again.ctx.askTell = () => Promise.resolve();
    again.State.load();

    const held = again.State.schedule.ledger.unreadable;
    check('the reopened schedule owns the poisoned name, on the schedule and not in a copy',
        owns(held, '__proto__'), JSON.stringify(Object.keys(held || {})));
    check('and the schedule itself carries the bytes',
        JSON.stringify(again.State.schedule.ledger || {}).indexOf('le_EVIDENCE_500') !== -1,
        JSON.stringify(again.State.schedule.ledger));
    check('the ordinary held-aside entry beside it is still there',
        owns(held, 'le_bad'), JSON.stringify(Object.keys(held || {})));
    // Against a plain object from the same realm: the harness runs the app in its own
    // V8 context, whose Object.prototype is not this file's.
    check('and nothing was reparented by carrying it',
        Object.getPrototypeOf(held) === Object.getPrototypeOf(again.State.schedule.ledger.advances)
        && held.amount === undefined && held.id === undefined,
        JSON.stringify([held && held.amount, held && held.id]));

    // The person exports, acknowledges, and records a day - the ordinary way out of a
    // hold. That save is the one that used to delete the evidence from the disk.
    given('the hold is acknowledged', again.global('Recovery').acknowledge() === true);
    const change = again.call('assignPlace', again.State.schedule,
        '2026-08-12', 'w_01', 'actual', 'p_01');
    given('and a day is recorded', again.State.commit(change) === true);
    check('the record on the disk still carries the evidence after that save',
        String(again.raw('scheduleData:v2')).indexOf('le_EVIDENCE_500') !== -1,
        String(again.raw('scheduleData:v2')).slice(0, 200));
    check('and the ordinary held-aside entry too',
        String(again.raw('scheduleData:v2')).indexOf('le_bad') !== -1);
}

report();
