// P0-D: the vehicle feature stays OFF, and dormant vehicle bytes are not lost.
//
//   node vehiclesync.test.mjs
//
// This file asserts NOTHING about turning vehicles back on. FARKAD_FLAGS.vehicles stays
// false in every device below except the two that deliberately measure the retirement
// itself, and even those only read. What is asserted is the other half of the retirement
// promise, the one tests/vehicles.test.mjs states in its own header: "NOTHING IS LOST -
// every stored vehicle byte survives load, save, sync, backup, recovery and restore,
// because the records are somebody's, not this build's."
//
// tests/vehicles.test.mjs proves that promise for the cloud through ONE door: a project
// whose document does not exist yet, where createDocument() writes the whole local
// schedule - vehicles included - as the seed. Every OTHER door into an existing cloud
// document is a field-path update, and there is no vehicle field path. This file walks
// those doors.
//
// The suites below are expected to be RED at aca2abe. Suite 8 is expected GREEN and must
// stay green: it is the check that nothing here has quietly switched the feature on.

import { existsSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname, join, basename, sep } from 'node:path';

// Where the repository is, derived from this file's own location and nothing else.
//
// Two ways, in order. If the suite has been copied INTO the checkout, walking up finds
// tests/harness.mjs directly. If it is running from a scratchpad - which is where it was
// written, because the checkout is read-only - the scratchpad's own path names the
// checkout it belongs to: one of its ancestor directories is the working directory with
// its separators turned into dashes ("-home-user-farkad"), which is decoded back here.
// FARKAD_ROOT overrides both, for a checkout somewhere neither rule reaches.
const HERE = dirname(fileURLToPath(import.meta.url));

function testsUnder(root) {
    return existsSync(join(root, 'tests', 'harness.mjs')) ? join(root, 'tests') : null;
}

function findTests(start) {
    if (process.env.FARKAD_ROOT) {
        const named = testsUnder(process.env.FARKAD_ROOT);
        if (named) return named;
        throw new Error('FARKAD_ROOT does not hold tests/harness.mjs: ' + process.env.FARKAD_ROOT);
    }
    const tried = [];
    for (let dir = start, i = 0; i < 20; i += 1) {
        const direct = testsUnder(dir);
        if (direct) return direct;
        tried.push(dir);
        const name = basename(dir);
        if (name.charAt(0) === '-') {
            const decoded = sep + name.slice(1).split('-').join(sep);
            const encoded = testsUnder(decoded);
            if (encoded) return encoded;
            tried.push(decoded);
        }
        const up = dirname(dir);
        if (up === dir) break;
        dir = up;
    }
    throw new Error('cannot find tests/harness.mjs; looked in:\n  ' + tried.join('\n  ')
        + '\nset FARKAD_ROOT to the checkout.');
}

const TESTS_DIR = findTests(HERE);
const load = name => import(pathToFileURL(join(TESTS_DIR, name)).href);

const { makeDevice, makeCloud, settle } = await load('harness.mjs');
const { suite, check, same, given, report } = await load('runner.mjs');

const TICK = 6;
const SYNCED = () => settle(TICK * 40);

// ---------------------------------------------------------------- the fixture
//
// Awkward on purpose, the same way tests/vehicles.test.mjs is awkward: fields no build in
// this repository has ever heard of, a rate entry carrying a device id, an archived van,
// and an evening that names one of them as having stayed in the yard. "The bytes survive"
// is a claim about the records that are out there, not about the tidy one a test writes.
function fixtureVehicles() {
    return [
        { id: 'v_01', name: 'טנדר לבן', ownerId: 'w_01', active: true,
            plate: '12-345-67', note: { by: 'd_old', text: 'שייך לאבא' },
            telematics: { unit: 'TX-9', since: '2025-03-01' },
            rates: [{ from: '2026-06-01', amount: 250 },
                { from: '2026-08-01', amount: 300, by: 'd_old' }] },
        { id: 'v_02', name: 'טרנזיט', ownerId: 'w_02', active: false,
            rates: [{ amount: 400 }, { from: '2026-07-01', amount: 350 }] }
    ];
}
const FIXTURE_JSON = JSON.stringify(fixtureVehicles());

function seed(device) {
    device.State.schedule.workers = [
        { id: 'w_01', name: 'דוד', active: true, dailyRate: 400, hourlyRate: 50 },
        { id: 'w_02', name: 'שרה', active: true, dailyRate: 350, hourlyRate: 0 }
    ];
    device.State.schedule.places = [{ id: 'p_01', name: 'הרצליה', active: true }];
    device.State.save({ silent: true });
    device.setToday('2026-08-29');
    return device;
}

function stubDialogs(device) {
    device.told = [];
    device.ctx.askText = async () => 'x';
    device.ctx.askAmount = async () => 1;
    device.ctx.askConfirm = async () => true;
    device.ctx.askChoice = async () => 'x';
    device.ctx.askTell = (...args) => { device.told.push(args.map(String).join(' | ')); };
}

// A phone holding the fixture and one worked day. The day goes through the model and
// State so the journal and the queue see it; the vehicles are put on the record directly,
// because with the feature off there is no path in the app that writes one - and that is
// precisely the record this build has to go on carrying.
function loaded(options = {}) {
    const device = seed(makeDevice(options));
    device.State.schedule.vehicles = fixtureVehicles();
    device.State.save({ silent: true });
    device.State.commit(device.call('assignPlace',
        device.State.schedule, '2026-08-12', 'w_01', 'actual', 'p_01'));
    device.State.schedule.days['2026-08-12'].vehiclesOff = ['v_02'];
    device.State.save({ silent: true });
    stubDialogs(device);
    return device;
}

const vehiclesOf = d => JSON.stringify(d.State.schedule.vehicles);
const idsOf = list => (Array.isArray(list) ? list : []).map(v => v && v.id).sort();
const byId = (list, id) => (Array.isArray(list) ? list : []).find(v => v && v.id === id) || null;

// A cloud document that ALREADY EXISTS, written by a phone that carries no vehicles.
// This is the ordinary case: two of the three phones are past the retirement, the
// document has been there since v79, and the third phone is the one still holding the
// records. Built by connecting a real device rather than by hand, so the document has
// exactly the shape this app writes.
async function existingCloud() {
    const cloud = makeCloud();
    const zero = seed(makeDevice({ deviceId: 'd_zero' }));
    zero.State.commit(zero.call('assignPlace',
        zero.State.schedule, '2026-08-10', 'w_01', 'actual', 'p_01'));
    zero.Sync.pushDelayMs = TICK;
    zero.Sync.connect(cloud.adapter);
    await SYNCED();
    given('the cloud document exists before anybody with vehicles arrives',
        Boolean(cloud.doc && cloud.doc.updatedAt), JSON.stringify(Object.keys(cloud.doc || {})));
    given('and it carries no vehicles of its own',
        JSON.stringify(cloud.doc.vehicles) === '[]', JSON.stringify(cloud.doc.vehicles));
    return { cloud, zero };
}

// ================================================================ 1
{
    suite('1. a vehicle on one phone reaches a cloud document that already exists');

    const { cloud } = await existingCloud();

    const A = loaded({ deviceId: 'd_A' });
    A.Sync.pushDelayMs = TICK;
    A.Sync.connect(cloud.adapter);
    await SYNCED();

    const B = seed(makeDevice({ deviceId: 'd_B' }));
    B.Sync.pushDelayMs = TICK;
    B.Sync.connect(cloud.adapter);
    await SYNCED();

    // The claimed reproduction, verbatim.
    const observed = {
        deviceALocalVehicles: (A.State.schedule.vehicles || []).length,
        cloudVehicles: (cloud.doc.vehicles || []).length,
        deviceBLocalVehicles: (B.State.schedule.vehicles || []).length,
        deviceAStatus: A.Sync.status,
        deviceBStatus: B.Sync.status
    };
    console.log('  observed: ' + JSON.stringify(observed));

    given('the ordinary day edit DID reach the cloud, so the send itself worked',
        Boolean(cloud.doc.days['2026-08-12']),
        JSON.stringify(Object.keys(cloud.doc.days || {})));

    check('the vehicle A is holding reaches the existing cloud document',
        idsOf(cloud.doc.vehicles).join(',') === 'v_01,v_02',
        JSON.stringify(cloud.doc.vehicles));

    check('and with every byte of it - the plate, the note, the unknown fields',
        JSON.stringify(cloud.doc.vehicles) === FIXTURE_JSON,
        JSON.stringify(cloud.doc.vehicles).slice(0, 160));

    check('and the evening that named one of them off',
        JSON.stringify((cloud.doc.days['2026-08-12'] || {}).vehiclesOff) === '["v_02"]',
        JSON.stringify((cloud.doc.days['2026-08-12'] || {}).vehiclesOff));

    check('A may NOT say "synced" while a record it holds is absent from the document',
        !(A.Sync.status === 'synced' && (cloud.doc.vehicles || []).length === 0),
        `status=${A.Sync.status} cloudVehicles=${(cloud.doc.vehicles || []).length}`);

    check('the second phone receives them, though it can draw none of them',
        vehiclesOf(B) === FIXTURE_JSON, vehiclesOf(B).slice(0, 160));

    check('and B may NOT say "synced" while it is behind on them',
        !(B.Sync.status === 'synced' && (B.State.schedule.vehicles || []).length === 0),
        `status=${B.Sync.status} local=${(B.State.schedule.vehicles || []).length}`);

    check('A still holds its own copy locally, whatever the cloud did',
        vehiclesOf(A) === FIXTURE_JSON, vehiclesOf(A).slice(0, 100));
}

// ================================================================ 2
{
    suite('2. two phones add a vehicle at the same time and both survive');

    // 2a. The creation race: neither document exists yet, both phones try to make it.
    const raceCloud = makeCloud();
    const A = seed(makeDevice({ deviceId: 'd_race_A' }));
    A.State.schedule.vehicles = [{ id: 'v_A', name: 'של דוד', ownerId: 'w_01',
        active: true, rates: [{ from: '2026-06-01', amount: 250 }] }];
    A.State.save({ silent: true });
    A.State.commit(A.call('assignPlace', A.State.schedule, '2026-08-12', 'w_01', 'actual', 'p_01'));

    const B = seed(makeDevice({ deviceId: 'd_race_B' }));
    B.State.schedule.vehicles = [{ id: 'v_B', name: 'של שרה', ownerId: 'w_02',
        active: true, rates: [{ from: '2026-06-01', amount: 300 }] }];
    B.State.save({ silent: true });
    B.State.commit(B.call('assignPlace', B.State.schedule, '2026-08-13', 'w_02', 'actual', 'p_01'));

    A.Sync.pushDelayMs = TICK;
    B.Sync.pushDelayMs = TICK;
    A.Sync.connect(raceCloud.adapter);
    B.Sync.connect(raceCloud.adapter);
    await SYNCED();
    await SYNCED();

    given('both days landed, so both phones did send',
        Boolean(raceCloud.doc && raceCloud.doc.days['2026-08-12']
            && raceCloud.doc.days['2026-08-13']),
        JSON.stringify(Object.keys((raceCloud.doc || {}).days || {})));

    check('both vans are in the document neither phone knew it was racing for',
        idsOf(raceCloud.doc.vehicles).join(',') === 'v_A,v_B',
        JSON.stringify(raceCloud.doc.vehicles));

    // 2b. The same two additions against a document that is already there.
    const { cloud } = await existingCloud();
    const C = seed(makeDevice({ deviceId: 'd_two_C' }));
    C.State.schedule.vehicles = [{ id: 'v_C', name: 'ג', ownerId: 'w_01', active: true, rates: [] }];
    C.State.save({ silent: true });
    C.State.commit(C.call('assignPlace', C.State.schedule, '2026-08-14', 'w_01', 'actual', 'p_01'));
    const D = seed(makeDevice({ deviceId: 'd_two_D' }));
    D.State.schedule.vehicles = [{ id: 'v_D', name: 'ד', ownerId: 'w_02', active: true, rates: [] }];
    D.State.save({ silent: true });
    D.State.commit(D.call('assignPlace', D.State.schedule, '2026-08-15', 'w_02', 'actual', 'p_01'));

    C.Sync.pushDelayMs = TICK;
    D.Sync.pushDelayMs = TICK;
    C.Sync.connect(cloud.adapter);
    D.Sync.connect(cloud.adapter);
    await SYNCED();
    await SYNCED();

    given('both of their days landed too',
        Boolean(cloud.doc.days['2026-08-14'] && cloud.doc.days['2026-08-15']),
        JSON.stringify(Object.keys(cloud.doc.days || {})));

    check('and against an existing document both vans survive as well',
        idsOf(cloud.doc.vehicles).join(',') === 'v_C,v_D',
        JSON.stringify(cloud.doc.vehicles));

    check('neither phone loses the other one at the next snapshot',
        idsOf(C.State.schedule.vehicles).join(',') === 'v_C,v_D'
            && idsOf(D.State.schedule.vehicles).join(',') === 'v_C,v_D',
        `C=${idsOf(C.State.schedule.vehicles)} D=${idsOf(D.State.schedule.vehicles)}`);
}

// ================================================================ 3
{
    suite('3. one id, two full records: neither is silently chosen');

    const cloud = makeCloud();
    const zero = seed(makeDevice({ deviceId: 'd_zero3' }));
    zero.State.schedule.vehicles = [{ id: 'v_01', name: 'הטרנזיט של שרה', ownerId: 'w_02',
        active: true, plate: '99-999-99', depot: 'רעננה',
        rates: [{ from: '2026-06-01', amount: 250 }, { from: '2026-09-01', amount: 320 }] }];
    zero.State.save({ silent: true });
    zero.State.commit(zero.call('assignPlace',
        zero.State.schedule, '2026-08-10', 'w_01', 'actual', 'p_01'));
    zero.Sync.pushDelayMs = TICK;
    zero.Sync.connect(cloud.adapter);
    await SYNCED();
    given('the cloud holds the remote reading of v_01',
        JSON.stringify(cloud.doc.vehicles).includes('הטרנזיט של שרה'),
        JSON.stringify(cloud.doc.vehicles).slice(0, 120));

    const A = seed(makeDevice({ deviceId: 'd_A3' }));
    A.State.schedule.vehicles = [{ id: 'v_01', name: 'הטנדר של דוד', ownerId: 'w_01',
        active: true, plate: '12-345-67', note: 'שלי',
        rates: [{ from: '2026-06-01', amount: 250 }, { from: '2026-08-01', amount: 300 }] }];
    A.State.save({ silent: true });
    A.Sync.pushDelayMs = TICK;
    A.Sync.connect(cloud.adapter);
    await SYNCED();

    const after = byId(A.State.schedule.vehicles, 'v_01');
    console.log('  v_01 after adoption: ' + JSON.stringify(after));

    check('the local reading of v_01 is not silently replaced by the remote one',
        !(after && after.name === 'הטרנזיט של שרה'),
        JSON.stringify(after));

    check('the local plate is not gone',
        Boolean(after && after.plate === '12-345-67'), String(after && after.plate));

    check('nor the local note - a field no other phone knew about',
        Boolean(after && after.note === 'שלי'), JSON.stringify(after && after.note));

    // Failing closed means the disagreement is written down somewhere a person can be
    // shown it. The whole-schedule backup written just before adoption is not that: it is
    // one slot, overwritten by the very next snapshot from any phone.
    const heldBefore = String(A.raw('scheduleData:v2backup')).includes('הטנדר של דוד');
    const second = JSON.parse(JSON.stringify(cloud.doc));
    second.updatedAt = '2099-01-01T00:00:00.000Z';
    second.updatedBy = 'd_third';
    second.days['2026-08-11'] = { actual: { w_01: {
        entries: [{ placeId: 'p_01' }], rates: { daily: 400, hourly: 50 } } } };
    cloud.subscribers.forEach(fn => fn(JSON.parse(JSON.stringify(second))));
    await SYNCED();

    const stillOnDisk = Object.entries(A.dump())
        .filter(([, value]) => String(value).includes('הטנדר של דוד'))
        .map(([key]) => key);
    console.log('  evidence of the local reading, after one more snapshot: '
        + JSON.stringify(stillOnDisk) + ' (before it: ' + heldBefore + ')');

    check('evidence of the discarded reading outlives the next unrelated snapshot',
        stillOnDisk.length > 0, JSON.stringify(stillOnDisk));

    check('and the device does not report "synced" over an unresolved disagreement',
        A.Sync.status !== 'synced' || stillOnDisk.length > 0,
        `status=${A.Sync.status} evidence=${JSON.stringify(stillOnDisk)}`);
}

// ================================================================ 4
{
    suite('4. one id, two rate histories');

    const cloud = makeCloud();
    const zero = seed(makeDevice({ deviceId: 'd_zero4' }));
    zero.State.schedule.vehicles = [{ id: 'v_01', name: 'טנדר', ownerId: 'w_01', active: true,
        rates: [{ from: '2026-06-01', amount: 250 }, { from: '2026-09-01', amount: 320 }] }];
    zero.State.save({ silent: true });
    zero.State.commit(zero.call('assignPlace',
        zero.State.schedule, '2026-08-10', 'w_01', 'actual', 'p_01'));
    zero.Sync.pushDelayMs = TICK;
    zero.Sync.connect(cloud.adapter);
    await SYNCED();

    const A = seed(makeDevice({ deviceId: 'd_A4' }));
    A.State.schedule.vehicles = [{ id: 'v_01', name: 'טנדר', ownerId: 'w_01', active: true,
        rates: [{ from: '2026-06-01', amount: 250 },
            { from: '2026-08-01', amount: 300, by: 'd_A4' }] }];
    A.State.save({ silent: true });
    A.Sync.pushDelayMs = TICK;
    A.Sync.connect(cloud.adapter);
    await SYNCED();

    const rates = ((byId(A.State.schedule.vehicles, 'v_01') || {}).rates) || [];
    const froms = rates.map(r => r && r.from).sort();
    console.log('  rate history after adoption: ' + JSON.stringify(rates));

    // Rates are the one field the model already treats as history rather than as a value:
    // a day keeps the price it was worked at. Dropping a stamp restates the month it
    // covers, which is iron law 2 read from the vehicle side.
    check('no rate stamp is dropped: both histories are present for v_01',
        froms.join(',') === '2026-06-01,2026-08-01,2026-09-01', JSON.stringify(froms));

    check('and the 2026-08-01 stamp this phone was holding is still there',
        rates.some(r => r && r.from === '2026-08-01' && r.amount === 300),
        JSON.stringify(froms));
}

// ================================================================ 5
{
    suite('5. a whole-array vehicle opinion, before the first snapshot');

    const probe = makeDevice({ deviceId: 'd_probe5' });

    // The barrier that exists for rosters: anything that could carry a whole-list opinion
    // waits for the first authoritative answer from the document. A whole `vehicles`
    // array is exactly that shape of opinion.
    check('a whole-array vehicles path is recognised as needing to wait',
        probe.Sync.rosterShaped('vehicles') === true,
        String(probe.Sync.rosterShaped('vehicles')));

    // A phone upgrading from the build that DID write vehicles has one of those arrays
    // sitting in its outbox, beside ordinary day edits, in one batch.
    const A = seed(makeDevice({ deviceId: 'd_A5' }));
    A.State.commit(A.call('assignPlace', A.State.schedule, '2026-08-12', 'w_01', 'actual', 'p_01'));
    const opKey = Object.keys(A.dump()).find(k => k.startsWith('farkad:outbox:op:'));
    given('the day edit was queued', Boolean(opKey), JSON.stringify(Object.keys(A.dump())));
    const batch = JSON.parse(A.raw(opKey));
    batch.ops.push({
        opId: '0legacyvehiclesop_aaaa', path: 'vehicles', seq: batch.ops[0].seq + 1, after: [],
        value: [{ id: 'v_01', name: 'טנדר לבן', ownerId: 'w_01', active: true,
            rates: [{ from: '2026-06-01', amount: 250 }] }]
    });
    const disk = A.dump();
    disk[opKey] = JSON.stringify(batch);

    const upgraded = makeDevice({ storage: disk, deviceId: 'd_A5' });
    upgraded.State.load();
    stubDialogs(upgraded);
    const cloud = makeCloud();
    upgraded.Sync.pushDelayMs = TICK;
    upgraded.Sync.connect(cloud.adapter);
    await SYNCED();

    const Recovery = upgraded.global('Recovery');
    console.log('  after the upgraded phone connected: cloud='
        + (cloud.doc === null ? 'null' : JSON.stringify(Object.keys(cloud.doc.days || {})))
        + ' status=' + upgraded.Sync.status
        + ' recoveryBlocked=' + (Recovery && Recovery.blocked && Recovery.blocked()));

    // Law 10 holding, and it does: the bytes are quarantined rather than dropped, the
    // original is kept, and the device stops instead of carrying on quietly. These two
    // are expected GREEN and are here so the suite records which half works.
    check('the vehicle opinion is not lost: a copy of the batch is kept',
        upgraded.raw(opKey + ':damaged') !== null && upgraded.raw(opKey) !== null,
        `original=${upgraded.raw(opKey) !== null} damaged=${upgraded.raw(opKey + ':damaged') !== null}`);
    check('and the phone says so out loud rather than carrying on',
        Boolean(Recovery && Recovery.blocked && Recovery.blocked()),
        String(Recovery && Recovery.blocked && Recovery.blocked()));

    // What is NOT right: one unreadable op takes its whole batch with it, and the batch
    // is the unit the queue is stored in - so an ordinary day edit queued in the same
    // second as the legacy vehicles array never leaves the phone either, and the device
    // sits at 'connecting' with nothing pending and nothing sent.
    check('the ordinary day edit queued beside it still reaches the cloud',
        Boolean(cloud.doc && cloud.doc.days && cloud.doc.days['2026-08-12']),
        cloud.doc === null ? 'the cloud document was never even created'
            : JSON.stringify(Object.keys(cloud.doc.days || {})));

    check('and the phone is not left reporting a state it can never leave',
        upgraded.Sync.status === 'synced', String(upgraded.Sync.status));

    // Collision-safe ids. Workers and places were moved off "one past the highest" for
    // exactly this reason - see newEntityId in js/model/schema.js, and the comment above
    // it, which describes this failure as a pay sheet rather than a display glitch.
    // Vehicles were never moved. Two phones holding the same roster, offline, both mint
    // v_01 for two different vans.
    const one = seed(makeDevice({ deviceId: 'd_id_1' }));
    const two = seed(makeDevice({ deviceId: 'd_id_2' }));
    one.State.schedule.vehicles = [];
    two.State.schedule.vehicles = [];
    const idA = one.call('nextVehicleId', one.State.schedule);
    const idB = two.call('nextVehicleId', two.State.schedule);
    check('two offline phones do not mint the same vehicle id', idA !== idB, `${idA} vs ${idB}`);
}

// ================================================================ 6
{
    suite('6. a restore whose vehicles are malformed is refused, not normalised away');

    const wholeDocument = () => ({
        schemaVersion: 2,
        workers: [{ id: 'w_01', name: 'דוד', active: true, dailyRate: 400, hourlyRate: 50 }],
        places: [{ id: 'p_01', name: 'הרצליה', active: true }],
        days: { '2026-08-12': { actual: { w_01: {
            entries: [{ placeId: 'p_01' }], rates: { daily: 400, hourly: 50 } } } } },
        advances: {}, ledger: { advances: {} },
        updatedAt: '2026-08-29T00:00:00.000Z', updatedBy: 'd_old'
    });

    const malformed = [
        ['a map where the array should be', { bad: 'bytes' }],
        ['an array of things that are not records', ['nope', 7]],
        ['a record whose rate history is not a history', [{ id: 'v_01', name: 'טנדר',
            ownerId: 'w_01', active: true, rates: 'nope' }]],
        ['a record with no id at all', [{ name: 'טנדר', ownerId: 'w_01',
            rates: [{ from: '2026-06-01', amount: 250 }] }]],
        ['one id claimed by two records', [{ id: 'v_01', name: 'A', ownerId: 'w_01', rates: [] },
            { id: 'v_01', name: 'B', ownerId: 'w_01', rates: [] }]]
    ];

    const gate = makeDevice({ deviceId: 'd_gate6' });
    for (const [label, vehicles] of malformed) {
        const document = wholeDocument();
        document.vehicles = vehicles;

        // The gate every replacement passes: fullScheduleProblems, in the model.
        const problems = gate.call('fullScheduleProblems', document);
        check(`the restore gate reads the vehicles: ${label}`,
            problems.length > 0, JSON.stringify(problems));

        // And the real door, end to end: a file, the reader, the confirmation, the
        // whole-document restore transaction underneath.
        const device = seed(makeDevice({ deviceId: 'd_r6' }));
        stubDialogs(device);
        device.call('importBackup', device.fileEvent('backup.json', JSON.stringify(document)));
        await settle(160);

        const landed = JSON.stringify(device.State.schedule.vehicles);
        const quarantined = Object.keys(device.dump()).filter(k => k.includes(':damaged'));
        const refused = device.told.some(text => !text.includes('הגיבוי נטען'));
        check(`and the bytes are not silently turned into []: ${label}`,
            landed !== '[]' || quarantined.length > 0 || refused,
            `vehicles=${landed} quarantine=${JSON.stringify(quarantined)} told=${JSON.stringify(device.told)}`);
    }
}

// ================================================================ 7
{
    suite('7. the whole round trip: backup, rescue, cloud, restore, two reopens');

    const source = loaded({ deviceId: 'd_src7' });
    const carries = (what, text) => {
        let parsed = null;
        try { parsed = JSON.parse(text); } catch (error) { parsed = null; }
        const vehicles = parsed && (parsed.vehicles
            || (parsed.records && JSON.parse(parsed.records['scheduleData:v2'] || 'null') || {}).vehicles);
        return { what, ok: JSON.stringify(vehicles) === FIXTURE_JSON,
            got: JSON.stringify(vehicles).slice(0, 140) };
    };

    // 1. a backup file
    source.call('exportBackup');
    const backup = source.downloads[source.downloads.length - 1];
    given('a backup file was handed over', Boolean(backup && backup.text));
    const backupHas = carries('backup', backup.text);
    check('leg 1 - the backup file carries every byte', backupHas.ok, backupHas.got);

    // 2. the rescue file of last resort
    source.call('exportRecoveryData');
    const rescue = source.downloads[source.downloads.length - 1];
    given('a rescue file was written', Boolean(rescue && rescue.text));
    check('leg 2 - the rescue file carries them too',
        String(rescue.text).includes('טנדר לבן') && String(rescue.text).includes('TX-9'),
        String(rescue.text).length + ' bytes');

    // 3. the cloud, into a document that already exists
    const { cloud } = await existingCloud();
    source.Sync.pushDelayMs = TICK;
    source.Sync.connect(cloud.adapter);
    await SYNCED();
    check('leg 3 - the cloud document carries them',
        JSON.stringify(cloud.doc.vehicles) === FIXTURE_JSON,
        JSON.stringify(cloud.doc.vehicles).slice(0, 140));

    // 4. a phone that reads the cloud
    const reader = seed(makeDevice({ deviceId: 'd_read7' }));
    reader.Sync.pushDelayMs = TICK;
    reader.Sync.connect(cloud.adapter);
    await SYNCED();
    check('leg 4 - a phone reading that document gets them',
        vehiclesOf(reader) === FIXTURE_JSON, vehiclesOf(reader).slice(0, 140));

    // 5. the restore door
    const restored = seed(makeDevice({ deviceId: 'd_res7' }));
    stubDialogs(restored);
    restored.call('importBackup', restored.fileEvent(backup.name, backup.text));
    await settle(160);
    check('leg 5 - a restore from the backup file carries them',
        vehiclesOf(restored) === FIXTURE_JSON, vehiclesOf(restored).slice(0, 140));

    // 6 and 7. two reopens, with an ordinary edit in between
    const once = makeDevice({ storage: restored.dump(), deviceId: restored.id });
    once.State.load();
    once.setToday('2026-08-29');
    once.State.commit(once.call('assignPlace',
        once.State.schedule, '2026-08-20', 'w_02', 'actual', 'p_01'));
    check('leg 6 - the first reopen, and an edit after it, keeps them',
        vehiclesOf(once) === FIXTURE_JSON, vehiclesOf(once).slice(0, 140));

    const twice = makeDevice({ storage: once.dump(), deviceId: once.id });
    twice.State.load();
    check('leg 7 - and so does the second reopen',
        vehiclesOf(twice) === FIXTURE_JSON, vehiclesOf(twice).slice(0, 140));
    check('leg 7 - the unknown telematics block is still on the record',
        JSON.stringify((byId(twice.State.schedule.vehicles, 'v_01') || {}).telematics)
            === '{"unit":"TX-9","since":"2025-03-01"}',
        JSON.stringify((byId(twice.State.schedule.vehicles, 'v_01') || {}).telematics));
}

// ================================================================ 8
{
    suite('8. the shipped build is still vehicle-free (this suite must stay GREEN)');

    const device = loaded({ deviceId: 'd_off8' });
    const s = device.State.schedule;

    check('the flag is off, as shipped', device.call('vehiclesEnabled') === false,
        String(device.call('vehiclesEnabled')));

    same('no vehicle goes out on a worked day', device.call('vehiclesOutOn', s, '2026-08-12'), []);
    same('nor on any other day', device.call('vehiclesOutOn', s, '2026-08-13'), []);
    same('nobody is owed anything for owning one',
        device.call('vehiclePayFor', s, 'w_01', '2026-08-01', '2026-08-31'), { days: 0, amount: 0 });

    const rows = device.call('payrollReport', s, '2026-08-01', '2026-08-31');
    const david = (Array.isArray(rows) ? rows : []).find(r => r && r.workerId === 'w_01');
    given('the pay sheet has a row for the man who owns one', Boolean(david),
        JSON.stringify(rows).slice(0, 200));
    check('the pay sheet charges no vehicle days',
        david.vehicleDays === 0 && david.vehicleAmount === 0,
        `days=${david.vehicleDays} amount=${david.vehicleAmount}`);
    check('and his total is the day rate and nothing else',
        david.amount === 400, String(david.amount));

    const invoice = device.call('invoiceReport', s, '2026-08-01', '2026-08-31');
    check('and nothing on the client invoice mentions a vehicle',
        !JSON.stringify(invoice).toLowerCase().includes('vehicle'),
        JSON.stringify(invoice).slice(0, 160));

    // The screen. renderVehicleList is given a real host node so its retirement branch is
    // actually reached rather than falling out at the first null.
    const panel = { className: 'roster-panel', style: {}, parentNode: null };
    const host = {
        className: 'vehicle-list', childNodes: [], style: {}, parentNode: panel,
        appendChild(child) { host.childNodes.push(child); return child; },
        removeChild(child) {
            const at = host.childNodes.indexOf(child);
            if (at >= 0) host.childNodes.splice(at, 1);
            return child;
        },
        setAttribute() {}, closest: () => panel,
        get firstChild() { return host.childNodes[0] || null; }
    };
    device.ctx.document.getElementById = id => (id === 'vehicleList' ? host : null);
    device.call('renderVehicleList');
    check('the roster draws no vehicle row', host.childNodes.length === 0,
        String(host.childNodes.length));
    check('and hides the whole panel, heading and add button with it',
        panel.style.display === 'none', String(panel.style.display));

    // The one control the feature ever had, with the gate shut.
    const change = device.call('setVehicleOut', s, '2026-08-12', 'v_01', false);
    same('the day control writes nothing at all', change, { path: null, value: null });
}

report();
