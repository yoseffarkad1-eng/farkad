// A poisoned name arriving from the cloud, and what happens to the bytes.
//
//   node tests/snapshot.poison.test.mjs
//
// tests/poison.test.mjs proves the WRITERS: an id that would land on a prototype is
// refused before memory, disk or outbox move, on this phone. This is the other direction -
// a document arriving from the cloud, or out of a backup, or a rescue file, carrying an
// own key of `__proto__`, `prototype` or `constructor` in a map this app reads by id.
//
// Measured on this tree, with a day whose `actual` layer carries an own `__proto__`
// written through JSON.parse so it is a real own property:
//
//     incoming has own __proto__ : true
//     after receive, own __proto__: false
//     keys                        : ["w_01"]
//     Recovery problems           : []
//     writes blocked              : false
//     the bytes anywhere on disk  : false
//
// The key is gone. Not held aside, not reported, not quarantined - gone, and the
// normalised schedule is then written to the disk over the record that had it. Nothing
// told anybody, and the device carried on writing.
//
// That breaks the rule this whole app is built on: nothing unreadable is ever deleted,
// overwritten, or treated as empty. A name this build cannot safely use as a key is
// exactly that - unreadable - and it is somebody's day or somebody's money underneath it.

import { makeDevice, settle } from './harness.mjs';
import { suite, check, given, report } from './runner.mjs';

const MARKER = 'p_POISONED_EVIDENCE';

function phone(deviceId, storage) {
    const device = makeDevice(storage
        ? { deviceId, storage, flags: { carryAdvances: true, ledgerWrites: true } }
        : { deviceId, flags: { carryAdvances: true, ledgerWrites: true } });
    device.setToday('2026-08-26');
    device.ctx.askTell = () => Promise.resolve();
    if (storage) { device.State.load(); return device; }
    device.State.schedule.workers = [
        { id: 'w_01', name: 'דוד', active: true, dailyRate: 400, hourlyRate: 0 }];
    device.State.schedule.places = [{ id: 'p_01', name: 'הרצליה', active: true }];
    device.State.save({ silent: true });
    return device;
}

// The arriving document, with one poisoned map, built through JSON.parse so the key is a
// real own property rather than a setter on the prototype chain.
function arriving(device, build) {
    const raw = JSON.parse(JSON.stringify(device.State.schedule));
    build(raw);
    raw.updatedAt = '2026-08-26T10:00:00.000Z';
    raw.updatedBy = 'd_other';
    return raw;
}

const poisonedDay = poison => JSON.parse(`{"actual":{"${poison}":`
    + `{"entries":[{"placeId":"${MARKER}"}],"rates":{"daily":400,"hourly":0}},`
    + `"w_01":{"entries":[{"placeId":"p_01"}],"rates":{"daily":400,"hourly":0}}}}`);

const cases = [
    ['a day layer', '__proto__', (raw, poison) => {
        raw.days = {};
        raw.days['2026-08-12'] = poisonedDay(poison);
    }],
    ['a day layer, constructor', 'constructor', (raw, poison) => {
        raw.days = {};
        raw.days['2026-08-12'] = poisonedDay(poison);
    }],
    ['the roster', '__proto__', (raw, poison) => {
        raw.roster = JSON.parse(`{"workers":{"${poison}":`
            + `{"id":"${MARKER}","name":"רוח","active":true}}}`);
    }],
    ['the ledger entries', '__proto__', (raw, poison) => {
        raw.ledger = JSON.parse(`{"advances":{"${poison}":`
            + `{"id":"${MARKER}","advanceId":"a_1","kind":"given","workerId":"w_01",`
            + `"date":"2026-08-10","amount":500,"at":"","by":"d_x"}},"unreadable":{}}`);
    }],
    ['the approvals', 'prototype', (raw, poison) => {
        raw.ledger = JSON.parse(`{"advances":{},"unreadable":{},"migrations":{"${poison}":`
            + `{"id":"${MARKER}","kind":"carry","rows":1,"at":"","by":"d_x"}}}`);
    }],
    // THE DAYS MAP ITSELF, one level up from the layer cases above. poisonedContainers
    // looked inside every day and never at the map holding them, and normaliseSchedule
    // drops any key that is not YYYY-MM-DD without a word - so a whole day arrived,
    // vanished, and the status said synced. Measured before the check existed:
    // problems [], writes not blocked, the marker nowhere on the device.
    ['the days map', '__proto__', (raw, poison) => {
        raw.days = JSON.parse(`{"${poison}":{"actual":{"w_01":`
            + `{"entries":[{"placeId":"${MARKER}"}],"rates":{"daily":400,"hourly":0}}}}}`);
    }],
    // And not only the three poison names: ANY key this app cannot read as a date was
    // dropped the same way, and a day nobody can find is somebody's pay either way.
    ['the days map, under a name that is not a date', 'not-a-date', (raw, poison) => {
        raw.days = JSON.parse(`{"${poison}":{"actual":{"w_01":`
            + `{"entries":[{"placeId":"${MARKER}"}],"rates":{"daily":400,"hourly":0}}}}}`);
    }]
];

for (const [what, poison, build] of cases) {
    suite(`a snapshot carrying ${poison} in ${what}`);

    const tag = (what + poison).replace(/\W/g, '').slice(0, 16);
    const device = phone('d_' + tag);
    const raw = arriving(device, target => build(target, poison));

    given(`${what}: the incoming document really carries it as an own key`,
        JSON.stringify(raw).indexOf(`"${poison}"`) !== -1, poison);

    device.Sync.receive(raw);
    await settle(40);

    // NOTHING IS SILENTLY CREATED under the poisoned name, and nothing this app reads by
    // id may have been reparented by it.
    const days = (device.State.schedule.days || {})['2026-08-12'] || {};
    const layer = days.actual || {};
    check(`${what}: no ordinary map answers to the poisoned name`,
        Object.prototype.hasOwnProperty.call(layer, poison) === false
        || String(poison) === 'constructor',
        JSON.stringify(Object.keys(layer)));

    // THE BYTES SURVIVE, somewhere a person can get at them.
    const held = JSON.stringify(device.State.schedule)
        + JSON.stringify(device.dump())
        + JSON.stringify(device.global('Recovery').problems)
        + JSON.stringify(device.global('Recovery').rawRecords());
    check(`${what}: the bytes it carried are still recoverable`,
        held.indexOf(MARKER) !== -1,
        JSON.stringify(Object.keys(device.dump())));

    // AND SOMEBODY IS TOLD, and the device stops writing over what it could not read.
    check(`${what}: the person is told`,
        device.global('Recovery').problems.length > 0,
        JSON.stringify(device.global('Recovery').problems.map(problem => problem.key)));
    check(`${what}: and the device stops writing`,
        device.call('farkadWritesBlocked') === true);

    // Across a close and reopen, because a device that forgets folds it at the next boot.
    const again = phone('d_' + tag + '_r', device.dump());
    check(`${what}: still held after a reopen`,
        again.call('farkadWritesBlocked') === true);
    check(`${what}: and the bytes are still there`,
        (JSON.stringify(again.State.schedule) + JSON.stringify(again.dump()))
            .indexOf(MARKER) !== -1);
}

// ------------------------------------------------------------------- and an honest one
{
    suite('an ordinary snapshot is untouched by any of this');

    // The control. Every check above is about a document nobody could have written; a
    // document somebody DID write has to arrive, apply and leave the device writing.
    const device = phone('d_clean');
    const raw = arriving(device, target => {
        target.days = { '2026-08-12': { actual: { w_01: {
            entries: [{ placeId: 'p_01' }], rates: { daily: 400, hourly: 0 } } } } };
    });
    device.Sync.receive(raw);
    await settle(40);

    check('the day arrived', Boolean(((device.State.schedule.days || {})['2026-08-12']
        || {}).actual.w_01), JSON.stringify(device.State.schedule.days));
    check('nobody was told anything', device.global('Recovery').problems.length === 0,
        JSON.stringify(device.global('Recovery').problems.map(problem => problem.key)));
    check('and the device is still writing',
        device.call('farkadWritesBlocked') === false);
}

// ------------------------------------------------- and the twenty-first open still opens
{
    suite('a phone that once heard a poisoned snapshot is still released after many reopens');

    // The hold is re-derived at every boot from the quarantine copy, which is right: the
    // record carrying the marker was never saved, so the copy is the only durable thing.
    // But re-deriving it called Recovery.damaged again, and Recovery never writes over
    // an existing quarantine, so every boot minted one more copy - :damaged:2, :3 ... -
    // until the ladder ran out at twenty. From then on quarantineRecord answered null,
    // the problem was pushed with mustHold, acknowledge() answered false, and the
    // banner said there was no room for a copy. Twenty identical copies were on the
    // disk. Freeing space changed nothing, and every later boot did the same.
    //
    // A phone that ever heard one such document stopped being able to record after
    // about twenty app opens, and was told the wrong reason.
    const first = phone('d_many');
    first.Sync.receive(arriving(first, target => {
        target.days = {};
        target.days['2026-08-12'] = poisonedDay('__proto__');
    }));
    await settle(40);
    given('the first sighting holds the device', first.call('farkadWritesBlocked') === true);
    given('and the person acknowledges it',
        first.global('Recovery').acknowledge() === true);

    const copiesOn = device => Object.keys(device.dump())
        .filter(key => key.indexOf('scheduleData:v2:poison:') === 0);

    let storage = first.dump();
    const boots = [];
    for (let n = 1; n <= 22; n += 1) {
        const again = phone(`d_many_${n}`, storage);
        const heldAtBoot = again.call('farkadWritesBlocked') === true;
        const released = again.global('Recovery').acknowledge() === true;
        boots.push({ n, heldAtBoot, released, copies: copiesOn(again).length,
            problems: again.global('Recovery').problems.map(problem =>
                ({ key: problem.key, copy: problem.copy, mustHold: problem.mustHold })) });
        storage = again.dump();
    }

    check('every reopen is held at boot until the person is told',
        boots.every(boot => boot.heldAtBoot),
        JSON.stringify(boots.filter(boot => !boot.heldAtBoot).map(boot => boot.n)));
    check('and every one of them, the twenty-second included, is released by acknowledging',
        boots.every(boot => boot.released),
        JSON.stringify(boots.filter(boot => !boot.released)
            .map(boot => [boot.n, boot.problems])));
    check('the bytes were kept once, not once per boot',
        boots[boots.length - 1].copies === 1,
        JSON.stringify(boots.map(boot => boot.copies)));
    check('and the one copy still carries them',
        JSON.stringify(storage).indexOf(MARKER) !== -1);
    check('no boot ever claimed a copy could not be kept',
        boots.every(boot => boot.problems.every(problem => problem.copy !== null
            && problem.mustHold === false)),
        JSON.stringify(boots.filter(boot => boot.problems.some(problem =>
            problem.copy === null)).map(boot => boot.n)));
}

{
    suite('and so is a phone whose own record carries the poisoned name');

    // The other road to the same ladder. Here the evidence IS on the record - held under
    // ledger.unreadable, which the writer round-trips - so every boot reads it off the
    // disk, reports it, and quarantined one more copy of the very same bytes.
    const first = phone('d_own');
    first.State.schedule.ledger = JSON.parse('{"advances":{},"unreadable":'
        + `{"__proto__":{"id":"${MARKER}","amount":500}},`
        + '"migrations":{},"unreadableMigrations":{}}');
    first.State.save({ silent: true });

    let storage = first.dump();
    const boots = [];
    for (let n = 1; n <= 22; n += 1) {
        const again = phone(`d_own_${n}`, storage);
        boots.push({ n,
            heldAtBoot: again.call('farkadWritesBlocked') === true,
            released: again.global('Recovery').acknowledge() === true,
            copies: Object.keys(again.dump()).filter(key =>
                key.indexOf(':damaged') !== -1).length });
        storage = again.dump();
    }
    check('every reopen is held at boot', boots.every(boot => boot.heldAtBoot),
        JSON.stringify(boots.filter(boot => !boot.heldAtBoot).map(boot => boot.n)));
    check('and every one is released by acknowledging',
        boots.every(boot => boot.released),
        JSON.stringify(boots.filter(boot => !boot.released).map(boot => boot.n)));
    check('identical bytes are quarantined once per record they were held under',
        boots[boots.length - 1].copies <= 2,
        JSON.stringify(boots.map(boot => boot.copies)));
    check('and the evidence is still on the record itself',
        String(storage['scheduleData:v2']).indexOf(MARKER) !== -1);
}

report();
