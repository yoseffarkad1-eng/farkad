// Deleting an advance, and what arrives from the cloud claiming to be one.
//
//   node tests/money.cloud.test.mjs
//
// Two defects, one root. The container an advances map lives in is never checked - only
// its contents are - and the two halves of the app disagree about what a null advance
// means.
//
// THE TOMBSTONE. removeAdvance sends `advances.<id> = null`, and its own comment says the
// null IS the deletion the other phones receive. schema.js's queue-path validator agrees:
// `if (value === null) return []`. The INGRESS validator does not: advanceProblems asks
// isPlainObject(item), a null is not one, and the answer is "this advance is damaged".
//
// So a person deletes an advance and the deleting phone quarantines the echo of its own
// write. Both phones stop adopting snapshots and stop recording days - the tap does
// nothing, no error, no banner. A phone that joins the project afterwards receives
// nothing at all, not even the roster. Acknowledging the quarantine unblocks local
// writing and does NOT unblock adoption, so the phone stays behind for good. And the
// moment any phone writes over that field, the deleted advance is back - on the disk, in
// the cloud, five hundred shekels, with the status line reading synced.
//
// THE CONTAINER. `(raw.advances && typeof raw.advances === 'object') ? raw.advances : {}`
// is how both the gate and normaliseSchedule read the map. An empty ARRAY is truthy and
// typeof 'object', so it passes as a map with nothing in it. A string and a null fall
// through to {}. In all three the gate validates an empty container, finds nothing wrong,
// and the device adopts a document with no advances - deleting a valid local one from
// memory and from the disk, with no quarantine, and reporting synced.
//
// And the money gate sits AFTER the incomplete-document branch, so a document with no
// workers array and an advance of -500 is answered with synced before anything looks at
// the money.

import { makeDevice, makeCloud, settle } from './harness.mjs';
import { suite, check, given, report } from './runner.mjs';

const DAY = '2026-08-07';
const TODAY = '2026-08-20';

const TICK = 6;

function phone(options) {
    const device = makeDevice(options || {});
    device.Sync.pushDelayMs = TICK;
    device.setToday(TODAY);
    device.ctx.askTell = () => Promise.resolve();
    device.State.schedule.workers = [
        { id: 'w_01', name: 'דוד', active: true, dailyRate: 400, hourlyRate: 0 }];
    device.State.schedule.places = [{ id: 'p_01', name: 'הרצליה', active: true }];
    device.State.save({ silent: true });
    return device;
}

const advanceIds = device => Object.keys(device.State.schedule.advances || {}).sort();
const quarantined = device =>
    Object.keys(device.dump()).filter(key => key.indexOf(':damaged') !== -1);
const onDiskAdvances = device => {
    try { return Object.keys(JSON.parse(device.raw('scheduleData:v2')).advances || {}).sort(); }
    catch (error) { return ['<unreadable>']; }
};

// ============================================================ the tombstone
{
    suite('one person deletes an advance, on three phones');

    const cloud = makeCloud();
    const a = phone();
    const b = phone();
    a.Sync.connect(cloud.adapter);
    b.Sync.connect(cloud.adapter);
    await settle(TICK * 10);

    a.State.commit(a.call('assignPlace', a.State.schedule, DAY, 'w_01', 'actual', 'p_01'));
    const added = a.call('addAdvance', a.State.schedule, 'w_01', DAY, 500, '');
    a.State.commit(added);
    await settle(TICK * 20);

    const id = Object.keys(a.State.schedule.advances)[0];
    given('the advance reached the cloud',
        Boolean(id) && Boolean(cloud.doc) && Boolean((cloud.doc.advances || {})[id]),
        `cloud ${JSON.stringify(cloud.doc && Object.keys(cloud.doc.advances || {}))}`);
    given('both phones hold the advance', Boolean(id) && advanceIds(b).includes(id),
        `A ${advanceIds(a).join()} / B ${advanceIds(b).join()}`);

    a.State.commit(a.call('removeAdvance', a.State.schedule, id));
    await settle(TICK * 20);

    check('the phone that deleted it is not put into recovery by its own write',
        quarantined(a).length === 0,
        `quarantine ${JSON.stringify(quarantined(a))}, status ${a.Sync.status}`);
    check('and it does not report an error for succeeding',
        a.Sync.status !== 'error', `status ${a.Sync.status}`);
    check('the other phone applies the deletion',
        !advanceIds(b).includes(id), `B holds ${advanceIds(b).join() || 'nothing'}`);
    check('and is not put into recovery either',
        quarantined(b).length === 0,
        `quarantine ${JSON.stringify(quarantined(b))}, status ${b.Sync.status}`);

    // The part that decides whether an evening can be recorded at all.
    a.State.commit(a.call('assignPlace', a.State.schedule, '2026-08-08', 'w_01', 'actual', 'p_01'));
    b.State.commit(b.call('assignPlace', b.State.schedule, '2026-08-09', 'w_01', 'actual', 'p_01'));
    await settle(TICK * 15);
    check('both phones can still record a day afterwards',
        onDiskAdvances(a) !== null
        && Object.keys(JSON.parse(a.raw('scheduleData:v2')).days).includes('2026-08-08')
        && Object.keys(JSON.parse(b.raw('scheduleData:v2')).days).includes('2026-08-09'),
        `A days ${Object.keys(JSON.parse(a.raw('scheduleData:v2')).days).join()}; `
        + `B days ${Object.keys(JSON.parse(b.raw('scheduleData:v2')).days).join()}`);

    // A phone that joins after the deletion.
    const c = phone();
    c.Sync.connect(cloud.adapter);
    await settle(TICK * 20);
    check('a phone joining afterwards receives the roster and the days',
        c.State.schedule.workers.length > 0
        && Object.keys(c.State.schedule.days).length > 0,
        `workers ${c.State.schedule.workers.length}, `
        + `days ${Object.keys(c.State.schedule.days).join() || 'none'}, `
        + `status ${c.Sync.status}`);

    // And it must not come back.
    check('the deleted advance is not in the cloud document as a live advance',
        !Object.keys(cloud.doc.advances || {}).some(key =>
            key === id && cloud.doc.advances[key] && typeof cloud.doc.advances[key] === 'object'),
        JSON.stringify(cloud.doc.advances));
}

// ============================================================ the container
{
    suite('an advances container that is not a map');

    const SHAPES = [
        ['an empty array', []],
        ['a string', 'broken'],
        ['a null', null]
    ];

    for (const [label, shape] of SHAPES) {
        const cloud = makeCloud();
        const device = phone();
        device.Sync.connect(cloud.adapter);
        await settle(TICK * 10);
        device.State.commit(device.call('assignPlace',
            device.State.schedule, DAY, 'w_01', 'actual', 'p_01'));
        device.State.commit(device.call('addAdvance',
            device.State.schedule, 'w_01', DAY, 500, ''));
        await settle(TICK * 20);

        const held = advanceIds(device)[0];
        given(`${label}: the phone holds an advance that is already sent`,
            Boolean(held) && device.Sync.pendingPaths().length === 0,
            `advances ${advanceIds(device).join()}, pending ${device.Sync.pendingPaths().length}`);

        // Another phone publishes a document whose advances are not a map.
        cloud.doc.advances = shape;
        cloud.doc.updatedAt = '2026-08-21T05:00:00.000Z';
        cloud.doc.updatedBy = 'd_other_phone';
        cloud.subscribers.forEach(fn => fn(JSON.parse(JSON.stringify(cloud.doc))));
        await settle(TICK * 15);

        check(`${label}: the advance already on this phone is not deleted`,
            advanceIds(device).includes(held) && onDiskAdvances(device).includes(held),
            `memory ${advanceIds(device).join() || 'none'}, disk ${onDiskAdvances(device).join() || 'none'}`);
        check(`${label}: and the phone does not call that synced`,
            device.Sync.status !== 'synced', `status ${device.Sync.status}`);
        check(`${label}: and the bytes that arrived are kept where somebody can look`,
            quarantined(device).length > 0,
            `quarantine ${JSON.stringify(quarantined(device))}`);
    }
}

// ============================================================ the order of the gates
{
    suite('money that arrives before the roster does');

    // The roster write the incomplete-document branch makes is held open, so the first
    // verdict is readable rather than immediately overwritten by the republish it causes.
    const doc = {
        days: { [DAY]: { plan: {}, actual: {} } },
        updatedAt: '2026-08-21T05:00:00.000Z',
        updatedBy: 'd_other_phone',
        advances: { a_bad: { id: 'a_bad', workerId: 'w_01', date: DAY, amount: -500, note: '' } }
    };
    const cloud = makeCloud({ doc, hold: kind => (kind === 'update' ? new Promise(() => {}) : null) });
    const device = phone();
    device.Sync.connect(cloud.adapter);
    await settle(TICK * 20);

    given('the document really has no workers array', !Array.isArray(doc.workers));
    check('an advance of minus five hundred is never answered with synced',
        device.Sync.status !== 'synced',
        `status ${device.Sync.status}; the money gate on the same bytes says `
        + JSON.stringify(device.call('advanceProblems', doc, null)));
}

report();
