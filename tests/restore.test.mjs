// The stricter whole-document comparison.
//
//   node tests/restore.test.mjs
//
// replacementContent (js/sync/sync.js) answers two questions about somebody's ENTIRE
// record. Does this device already hold the restore it is about to tell the cloud it
// holds - that is localDurableHolds, the gate a restore passes before the cloud is
// written and again before the record of it is removed. And does a frozen v71 companion
// belong to the v71 record lying beside it - that is readFrozenLegacy on the phone and
// pendingReplacementIn in the rescue file, which must answer alike or the file a person
// exports says something different from the phone they exported it from.
//
// It grew from four subtrees to seven: schemaVersion, both halves of the roster, days,
// advances, ledger, vehicles. A comparison that gets stricter can fail in two directions
// and both cost somebody their evening. Too strict, and a device that DOES hold the
// restore is told it does not: the transaction wedges with the status reading error,
// after the person has already been told the restore happened. Too loose, and the
// transaction closes over a phone holding the days and none of the money.
//
// Every check below is an observation through the production functions and the bytes
// actually on the disk. Nothing asserts by reading source, and nothing compares one
// caller of a function with another caller of the same function.

import { makeDevice, settle } from './harness.mjs';
import { suite, check, given, report } from './runner.mjs';

const WORKERS = [
    { id: 'w_01', name: 'דוד', idNumber: '', phone: '', dailyRate: 400, hourlyRate: 50, active: true },
    { id: 'w_02', name: 'שרה', idNumber: '', phone: '', dailyRate: 350, hourlyRate: 0, active: true }
];
const PLACES = [
    { id: 'p_01', name: 'הרצליה', active: true },
    { id: 'p_02', name: 'תל אביב', active: true }
];

const day = (workerId, placeId) => ({ plan: {}, actual: { [workerId]: { entries: [{ placeId }] } } });

// The document every legitimate-restore suite below is built on: one of everything the
// comparison now covers, so a subtree that stopped being compared has something to lose.
function fullDocument(extra) {
    return Object.assign({
        schemaVersion: 2,
        workers: WORKERS.map(worker => Object.assign({}, worker)),
        places: PLACES.map(place => Object.assign({}, place)),
        days: {
            '2026-07-01': day('w_01', 'p_01'),
            // Which vehicles stayed in the yard. This build draws nothing for it and
            // keeps it anyway - it is a fact somebody recorded about an evening - so a
            // device that lost it is a device holding less than the restore.
            '2026-07-02': Object.assign(day('w_02', 'p_02'), { vehiclesOff: ['v_01'] })
        },
        advances: {
            // The method: cash or transfer, the one thing about an advance that is not a
            // number. normaliseSchedule carries it verbatim, so the comparison can see it.
            a_01: {
                id: 'a_01', workerId: 'w_01', date: '2026-07-01',
                amount: 500, note: 'מקדמה', method: 'transfer'
            }
        },
        // An entry for the one advance, so the boot mirror has nothing to add. R2 is the
        // suite that lets it add something on purpose.
        ledger: {
            advances: {
                le_mig_a_01: {
                    id: 'le_mig_a_01', advanceId: 'a_01', kind: 'given',
                    workerId: 'w_01', date: '2026-07-01', amount: 500,
                    note: 'מקדמה', at: '', by: 'd_old', origin: 'migration'
                }
            }
        },
        // Dormant, and carried whole: `plate` is a field this build has never heard of
        // and a rate entry with no `from` is a price somebody wrote down. Both survive
        // normaliseSchedule, so both are part of what "holding the restore" means.
        vehicles: [{
            id: 'v_01', name: 'טנדר לבן', ownerId: 'w_01', active: true,
            plate: '12-345-67',
            rates: [{ from: '2026-01-01', amount: 300 }, { amount: 250 }]
        }],
        updatedAt: '2026-08-01T00:00:00.000Z', updatedBy: 'd_old'
    }, extra || {});
}

// A phone with its own smaller record: the thing the restore is replacing. Saved rather
// than staged, so the disk holds bytes this app actually wrote.
function phone(id) {
    const device = makeDevice({ deviceId: id });
    // Booted, not merely constructed. State.load is what pins the mirror to the schedule
    // it read, and the mirror is the writer R2 is about - a device that never booted
    // never asks for one, which would make that suite measure the harness.
    device.State.load();
    device.State.schedule.workers = [Object.assign({}, WORKERS[0])];
    device.State.schedule.places = [Object.assign({}, PLACES[0])];
    device.State.schedule.days['2026-08-10'] = day('w_01', 'p_01');
    device.State.save({ silent: true });
    return device;
}

// prepare -> store -> settle, which is the order replaceEverything performs and the only
// one in which the gate can be asked an honest question: the entries the restore
// supersedes have to be off the queue before the two sides can agree.
async function restoredOnto(device, document, label) {
    given(`${label}: the restore is prepared`,
        device.Sync.prepareReplace(document, false) === true);
    const envelope = device.Sync.pendingReplace();
    given(`${label}: and the envelope carries a document`,
        Boolean(envelope && envelope.document));
    const applied = device.Sync.applyReplacementLocally(envelope);
    given(`${label}: and it is stored, with the superseded queue pruned`,
        applied.stored === true && applied.pruned === true);
    // The ledger mirror commits a moment after the swap - see migrateSoon in js/state.js.
    // Measuring before it runs would measure a state no session ever holds.
    await settle(5);
    return envelope;
}

const diskOf = device => JSON.parse(device.raw('scheduleData:v2'));

// ================================================================ R1
{
    suite('R1: a document that round-trips is not refused');

    const device = phone('d_round');
    const envelope = await restoredOnto(device, fullDocument(), 'round trip');

    check('the device holds the restore it was just given',
        device.Sync.localDurableHolds(envelope) === true,
        String(device.Sync.localDurableHolds(envelope)));

    // The same record in the shape the CLOUD carries: the roster a second time, keyed by
    // id. A comparison that read the arrays alone, or the map alone, would call this a
    // different document - and this is the shape a first sync seeds and a snapshot
    // arrives in, so a device that has just adopted its own restore back off the wire
    // would be told it does not hold it.
    const durable = diskOf(device);
    device.putRaw('scheduleData:v2',
        JSON.stringify(device.call('cloudDocument',
            device.call('normaliseSchedule', durable))));
    check('and still holds it with the record in the cloud’s own shape',
        device.Sync.localDurableHolds(envelope) === true,
        String(device.Sync.localDurableHolds(envelope)));

    // Normalised twice. Every route in - a boot, a snapshot, an import, a restore - ends
    // in this function, so a field it moves on the second pass is a device that stops
    // holding its own restore at the next open, for no reason anyone could see.
    device.putRaw('scheduleData:v2',
        JSON.stringify(device.call('normaliseSchedule',
            device.call('normaliseSchedule', durable))));
    check('and when the record has been normalised twice',
        device.Sync.localDurableHolds(envelope) === true,
        String(device.Sync.localDurableHolds(envelope)));

    // Not the gate's opinion: the bytes. Every part the comparison covers has to still
    // be there at the next open, or the gate is agreeing about a record nobody holds.
    device.putRaw('scheduleData:v2', JSON.stringify(durable));
    const again = makeDevice({ storage: device.dump(), deviceId: 'd_round' });
    again.State.load();
    const back = again.State.schedule;
    check('and a reopen still finds every part of it',
        back.advances.a_01.method === 'transfer'
        && Object.keys(back.ledger.advances).join() === 'le_mig_a_01'
        && (back.vehicles[0] || {}).plate === '12-345-67'
        && (back.days['2026-07-02'].vehiclesOff || []).join() === 'v_01'
        && back.workers.map(worker => worker.id).join() === 'w_01,w_02',
        JSON.stringify({
            method: back.advances.a_01.method,
            ledger: Object.keys(back.ledger.advances),
            plate: (back.vehicles[0] || {}).plate,
            off: back.days['2026-07-02'].vehiclesOff
        }));
}

// ================================================================ R2
{
    suite('R2: the ledger mirror runs between the two gates, and the gate still holds');

    // The one writer that fires on its own between "the restore is stored" and "the
    // restore is verified": every restore door ends in State.save, save sees a different
    // schedule object and asks for the mirror, and the mirror appends a 'given' entry for
    // every advance the restored document did not already have one for. A comparison that
    // read the bare document would find a ledger entry the restore never named and call
    // the device wrong - a restore refused by the app's own bookkeeping.
    const device = phone('d_mirror');
    const document = fullDocument({ ledger: { advances: {} } });
    const envelope = await restoredOnto(device, document, 'mirror');

    given('the mirror wrote an entry the document never carried',
        Object.keys(diskOf(device).ledger.advances).length === 1
        && Object.keys(envelope.document.ledger.advances).length === 0);

    check('the device still holds the restore after the mirror has written',
        device.Sync.localDurableHolds(envelope) === true,
        String(device.Sync.localDurableHolds(envelope)));

    // And the entry is not merely in memory. The gate reads the disk; so does this.
    check('and the entry it wrote is on the disk, not only on the screen',
        (diskOf(device).ledger.advances.le_mig_a_01 || {}).advanceId === 'a_01',
        JSON.stringify(diskOf(device).ledger.advances));
}

// ================================================================ R3
{
    suite('R3: a restore carrying vehicles is not refused');

    // Vehicles are retired - FARKAD_FLAGS in js/model/schema.js - and a retired feature is
    // a reason to draw nothing, not a reason to refuse a restore. The record here carries
    // a field this build cannot name and a rate with no date it applies from, which are
    // exactly the two things a field-by-field projection loses.
    const device = phone('d_vehicles');
    const envelope = await restoredOnto(device, fullDocument(), 'vehicles');

    given('the restored record carries the vehicle whole',
        JSON.stringify(diskOf(device).vehicles[0].rates) ===
            JSON.stringify([{ from: '2026-01-01', amount: 300 }, { amount: 250 }]));

    check('a device holding a dormant vehicle whole is not called wrong',
        device.Sync.localDurableHolds(envelope) === true,
        String(device.Sync.localDurableHolds(envelope)));

    check('and the evening that named a vehicle as staying in is held too',
        (diskOf(device).days['2026-07-02'].vehiclesOff || []).join() === 'v_01',
        JSON.stringify(diskOf(device).days['2026-07-02']));
}

// ================================================================ R4
{
    suite('R4: an advance carrying a method is not refused, and losing it is caught');

    const device = phone('d_method');
    const envelope = await restoredOnto(device, fullDocument(), 'method');

    check('an advance handed over by transfer is held as such',
        device.Sync.localDurableHolds(envelope) === true
        && diskOf(device).advances.a_01.method === 'transfer',
        JSON.stringify(diskOf(device).advances.a_01));

    // The other direction, in the same suite so neither can pass by accident: a device
    // whose record says only "מקדמה" is not holding an advance the restore says was a
    // transfer. HOW the money moved is the one fact about an advance a person disputes.
    const durable = diskOf(device);
    const stripped = JSON.parse(JSON.stringify(durable));
    delete stripped.advances.a_01.method;
    device.putRaw('scheduleData:v2', JSON.stringify(stripped));
    check('and a device that dropped the method does not claim to hold the restore',
        device.Sync.localDurableHolds(envelope) === false,
        String(device.Sync.localDurableHolds(envelope)));
}

// ================================================================ R5
{
    suite('R5: an empty ledger and no ledger at all are both restorable');

    // Two documents that mean the same thing. A crew that has never corrected an advance
    // has `{advances:{}}`; a document written before v80 has no such key at all.
    // Refusing either would refuse every backup taken before the ledger existed.
    for (const [label, build] of [
        ['an empty ledger', () => fullDocument({ advances: {}, ledger: { advances: {} } })],
        ['no ledger block at all', () => {
            const document = fullDocument({ advances: {} });
            delete document.ledger;
            return document;
        }]
    ]) {
        const device = phone('d_' + label.replace(/\s/g, '_'));
        const envelope = await restoredOnto(device, build(), label);
        check(`${label}: the device holds it`,
            device.Sync.localDurableHolds(envelope) === true,
            String(device.Sync.localDurableHolds(envelope)));
    }

    // And the two are not told apart, which is the point of normalising before comparing:
    // a device whose record has no ledger key holds a restore whose document had none
    // either, even though normaliseSchedule spells one out on the way past.
    const device = phone('d_ledger_shape');
    const document = fullDocument({ advances: {} });
    delete document.ledger;
    const envelope = await restoredOnto(device, document, 'ledger shape');
    const durable = diskOf(device);
    // The shape gained a second family: `unreadable`, where normaliseSchedule now puts a
    // ledger entry this build cannot fold. It used to leave such an entry OUT of the
    // object it built - and that object is what save() writes, so the only copy of
    // somebody's correction was deleted by a read. What this given needs is that the
    // empty ledger is spelled out at all, not that it has exactly one key in it.
    given('the restored record spells the empty ledger out',
        JSON.stringify((durable.ledger || {}).advances) === '{}',
        JSON.stringify(durable.ledger));
    delete durable.ledger;
    device.putRaw('scheduleData:v2', JSON.stringify(durable));
    check('a record with no ledger key holds a restore that had none either',
        device.Sync.localDurableHolds(envelope) === true,
        String(device.Sync.localDurableHolds(envelope)));
}

// ================================================================ R6
{
    suite('R6: a device holding only part of the restore is caught, subtree by subtree');

    // The mutation is made to the device's OWN durable record, one subtree at a time, so
    // the only difference between the reading that must pass and the reading that must
    // fail is the part that went missing. Staging a second document instead would be
    // measuring two documents against each other and calling it a gate.
    const device = phone('d_partial');
    const envelope = await restoredOnto(device, fullDocument(), 'partial');
    const whole = device.raw('scheduleData:v2');

    given('the whole record is held before anything is taken out of it',
        device.Sync.localDurableHolds(envelope) === true);

    const PARTS = [
        ['with the roster gone', d => { d.workers = []; }],
        ['with the sites gone', d => { d.places = []; }],
        ['with every day gone', d => { d.days = {}; }],
        ['with one man’s day gone', d => { delete d.days['2026-07-01']; }],
        ['with the advances gone', d => { d.advances = {}; }],
        ['with the ledger emptied', d => { d.ledger = { advances: {} }; }],
        ['with the vehicles gone', d => { d.vehicles = []; }],
        ['with a vehicle’s rate history gone', d => { d.vehicles[0].rates = []; }],
        ['with an evening’s vehiclesOff gone', d => { delete d.days['2026-07-02'].vehiclesOff; }],
        // RED, deliberately, and the only red in this file.
        //
        // The comment above replacementContent says schemaVersion is in the comparison
        // "because a document from another version is not the same document".
        // normaliseSchedule starts from emptySchedule(), which stamps SCHEMA_VERSION, and
        // never copies raw.schemaVersion - so both sides read 2 whatever the record says
        // and the sentence describes a guarantee the code does not provide.
        //
        // Worth knowing before anyone closes it by making the field live: the v71 binding
        // below compares an UPGRADED document against the raw v71 record beside it, and
        // those two legitimately differ in exactly this field, so a live schemaVersion
        // would hold every genuine v71 restore for ever. The honest close is to drop the
        // field from the object and the sentence with it.
        ['stamped with another schema version', d => { d.schemaVersion = 1; }]
    ];

    for (const [label, take] of PARTS) {
        const partial = JSON.parse(whole);
        take(partial);
        device.putRaw('scheduleData:v2', JSON.stringify(partial));
        check(`${label}: the device does not claim to hold the restore`,
            device.Sync.localDurableHolds(envelope) === false,
            String(device.Sync.localDurableHolds(envelope)));
        device.putRaw('scheduleData:v2', whole);
    }
}

// ---------------------------------------------------------------- the v71 companion
//
// A v71 record is the bare cloud document and nothing else - no version, no phase, and
// no supersede boundary. The frozen companion beside it is the record that says WHERE
// that boundary was, and a companion describing a different restore is a record of
// somebody else's transaction: reading past it restores a week nobody asked for.
//
// Two builds ask that question - readFrozenLegacy on the phone and pendingReplacementIn
// in the rescue reader - and they must answer alike. A person exports a rescue file
// BECAUSE the phone will not open, so a file that carries out the restore the phone
// refused is the worst possible moment to disagree.
//
// Three of the five cases differ from their primary ONLY in a subtree the comparison did
// not used to cover.

const v71Primary = () => ({
    schemaVersion: 2,
    workers: WORKERS.map(worker => Object.assign({}, worker)),
    places: PLACES.map(place => Object.assign({}, place)),
    days: { '2026-07-01': day('w_01', 'p_01') },
    advances: {
        a_01: { id: 'a_01', workerId: 'w_01', date: '2026-07-01',
            amount: 500, note: '', method: 'cash' }
    },
    ledger: { advances: { le_01: { id: 'le_01', advanceId: 'a_01', kind: 'given',
        workerId: 'w_01', date: '2026-07-01', amount: 500 } } },
    vehicles: [{ id: 'v_01', name: 'טנדר', ownerId: 'w_01', active: true,
        rates: [{ from: '2026-01-01', amount: 300 }] }],
    updatedAt: '2026-07-09T00:00:00.000Z', updatedBy: 'd_v71'
});

const BINDINGS = [
    // The companion IS the primary, written in the shape the cloud carries - the roster
    // a second time, keyed by id, which is the shape the freeze actually stores.
    // Refusing this would hold every genuine v71 restore on every phone.
    ['the same restore in the cloud’s shape', true, () => {
        const document = v71Primary();
        const wire = JSON.parse(JSON.stringify(document));
        wire.roster = {
            workers: { w_01: document.workers[0], w_02: document.workers[1] },
            places: { p_01: document.places[0], p_02: document.places[1] },
            workerOrder: ['w_01', 'w_02'], placeOrder: ['p_01', 'p_02']
        };
        return wire;
    }],
    ['a companion holding another week', false, () => {
        const document = v71Primary();
        document.days = { '2026-07-02': day('w_01', 'p_02') };
        return document;
    }],
    ['a companion differing only in a ledger entry', false, () => {
        const document = v71Primary();
        document.ledger.advances.le_02 = { id: 'le_02', advanceId: 'a_01',
            kind: 'corrected', workerId: 'w_02', date: '2026-07-01', amount: 500 };
        return document;
    }],
    ['a companion differing only in a vehicle', false, () => {
        const document = v71Primary();
        document.vehicles = [];
        return document;
    }],
    ['a companion differing only in how an advance was paid', false, () => {
        const document = v71Primary();
        document.advances.a_01.method = 'transfer';
        return document;
    }]
];

// The three records as they sit on the disk of a phone that has not finished a v71
// restore, and as they sit inside the rescue file that phone exports.
const bindingRecords = companionDocument => ({
    'scheduleData:v2': JSON.stringify(Object.assign(v71Primary(), {
        days: { '2026-08-10': day('w_01', 'p_01') } })),
    'farkad:pendingReplace': JSON.stringify(v71Primary()),
    'farkad:pendingReplace:v71': JSON.stringify({
        version: 2, phase: 'prepared', transactionId: 'legacy_bind',
        supersedesSeq: 0, supersedes: [], cloud: true, document: companionDocument
    })
});

// ================================================================ R7
{
    suite('R7: the v71 companion is bound to its primary on the phone');

    const reader = makeDevice({ deviceId: 'd_rescue' });

    for (const [label, shouldBind, build] of BINDINGS) {
        const records = bindingRecords(build());

        const device = makeDevice({ deviceId: 'd_v71', storage: records });
        const envelope = device.Sync.pendingReplace();
        const held = device.Sync.replaceHeld === true;

        if (shouldBind) {
            check(`${label}: the phone carries the restore out`,
                envelope !== null && held === false
                && Object.keys(envelope.document.days).join() === '2026-07-01',
                JSON.stringify({ held, days: envelope && Object.keys(envelope.document.days) }));
        } else {
            check(`${label}: the phone refuses it and holds`,
                envelope === null && held === true
                && device.call('farkadWritesBlocked') === true,
                JSON.stringify({ envelope: envelope && envelope.transactionId, held }));
            // Held, not tidied away. These bytes are the only record there is of another
            // transaction, and the file this phone is about to export has to carry them.
            check(`${label}: and both records are still on the disk`,
                typeof device.raw('farkad:pendingReplace:v71') === 'string'
                && typeof device.raw('farkad:pendingReplace') === 'string',
                String(device.raw('farkad:pendingReplace:v71')).slice(0, 40));
        }

        // ------------------------------------------------ the same records, in the file
        const loaded = reader.call('readBackupFile',
            { kind: 'farkad-recovery', records });
        const days = Object.keys((loaded.schedule || {}).days || {}).join();
        // The line the app writes, character for character: it is what tells the person
        // that part of the file they are holding was not used.
        const named = (loaded.unread || [])
            .includes('farkad:pendingReplace:v71: מלווה שחזור אחר - לא בוצע');

        if (shouldBind) {
            check(`${label}: the rescue file carries it out too`,
                days === '2026-07-01' && named === false,
                JSON.stringify({ days, unread: loaded.unread }));
        } else {
            check(`${label}: the rescue file refuses it and says so`,
                days === '2026-08-10' && named === true,
                JSON.stringify({ days, unread: loaded.unread }));
        }

        // Stated as its own claim rather than left to the reader of two PASS lines: the
        // phone and the file are different functions in different files, and this is the
        // one thing that must be true of them together.
        check(`${label}: the phone and the rescue file reach the same answer`,
            (envelope !== null) === (days === '2026-07-01'),
            JSON.stringify({ phone: envelope !== null, file: days }));
    }
}

// ================================================================ R8
{
    suite('R8: a restore point carrying a poisoned map is refused at the door, and the phone is not held for it');

    // Through the real door - restoreSnapshot in js/ui/share.js - and not through the
    // gate function alone, because the failure was in the ORDER of the door. The gate,
    // fullScheduleProblems, asked about the ledger container and nothing about a name
    // that cannot be used as a key, so the file passed; the door then called
    // normaliseSchedule on it, which handed the poisoned map to Recovery - quarantine
    // written, writes blocked - BEFORE replaceEverything ran; and replaceEverything
    // refused at its prepare stage because writes were blocked, which the door reports
    // as "no room on the device to record the restore". The device is not full. Freeing
    // space does nothing. And the phone somebody was recording on is now held, across a
    // reopen, by a file they only tried to restore.
    const device = makeDevice({ deviceId: 'd_door' });
    device.setToday('2026-08-26');
    device.State.load();
    device.State.schedule.workers = [Object.assign({}, WORKERS[0])];
    device.State.schedule.places = [Object.assign({}, PLACES[0])];
    device.State.save({ silent: true });
    given('a day is recorded on this phone',
        device.State.commit(device.call('assignPlace', device.State.schedule,
            '2026-08-12', 'w_01', 'actual', 'p_01')) === true);

    const point = JSON.parse(JSON.stringify(device.State.schedule));
    point.ledger = JSON.parse('{"advances":{},"unreadable":'
        + '{"__proto__":{"id":"le_POISON_RESTORE","amount":500}}}');
    const text = JSON.stringify(point);
    given('the restore point really carries the name as an own key',
        text.indexOf('"__proto__"') !== -1
        && device.call('poisonedContainers', JSON.parse(text)).length === 1);
    device.Store.set('scheduleData:snap:2026-08-01', text);

    const said = [];
    device.ctx.askConfirm = () => Promise.resolve(true);
    device.ctx.askTell = message => {
        said.push(typeof message === 'string'
            ? { title: '', message }
            : { title: String(message.title || ''), message: String(message.message || '') });
        return Promise.resolve();
    };

    const before = device.raw('scheduleData:v2');
    await device.call('restoreSnapshot', '2026-08-01');

    const last = said[said.length - 1] || { title: '', message: '' };
    check('the door says the file is not a whole record, in its own words',
        last.title === 'לא בוצע שחזור' && last.message.indexOf('אינו רישום שלם') !== -1,
        JSON.stringify(last));
    check('and names what is wrong with it, not a full disk',
        last.message.indexOf('אין מקום') === -1
        && last.message.indexOf('שאי אפשר להשתמש בו כמפתח') !== -1,
        JSON.stringify(last));
    check('nothing on the disk changed', device.raw('scheduleData:v2') === before);
    check('the phone is not held for a file it only tried to restore',
        device.call('farkadWritesBlocked') === false);
    check('Recovery was told nothing, because nothing on this phone is damaged',
        device.global('Recovery').problems.length === 0,
        JSON.stringify(device.global('Recovery').problems.map(problem => problem.key)));
    check('and no quarantine copy was written for it',
        Object.keys(device.dump()).every(key => key.indexOf(':poison:') === -1),
        JSON.stringify(Object.keys(device.dump()).filter(key => key.indexOf('poison') !== -1)));
    check('the next day can still be recorded',
        device.State.commit(device.call('assignPlace', device.State.schedule,
            '2026-08-13', 'w_01', 'actual', 'p_01')) === true);

    const again = makeDevice({ deviceId: 'd_door_r', storage: device.dump() });
    again.setToday('2026-08-26');
    again.State.load();
    check('and a reopened phone is not held either',
        again.call('farkadWritesBlocked') === false,
        JSON.stringify(again.global('Recovery').problems.map(problem => problem.key)));
    check('the refused restore point is left where it was',
        again.raw('scheduleData:snap:2026-08-01') === text);
}

report();
