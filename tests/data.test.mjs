// The data suite: storage, sync, and the arithmetic that turns days into money.
//
//   node tests/data.test.mjs
//
// No browser. Each "device" is a V8 context with its own localStorage holding its own
// Store, State and FarkadSync - so two devices editing at once, and a device closed and
// reopened against a cloud that is behind, are both things a test can simply say.

import { makeDevice, makeCloud, settle } from './harness.mjs';
import { suite, check, same, given, report } from './runner.mjs';

// Real time, kept short. The sync layer debounces before it sends, and a test that does
// not wait past the debounce is testing the debounce.
const TICK = 6;
const wait = () => settle(TICK * 5);

function connected(device, cloud) {
    device.Sync.pushDelayMs = TICK;
    device.Sync.connect(cloud.adapter);
    return wait();
}

function seed(device) {
    device.State.schedule.workers = [
        { id: 'w_01', name: 'דוד', active: true, dailyRate: 400, hourlyRate: 50 },
        { id: 'w_02', name: 'שרה', active: true, dailyRate: 350, hourlyRate: 0 },
        // No rate on purpose: the reports have to say "unknown", not "owed nothing".
        { id: 'w_03', name: 'עלי', active: true, dailyRate: 0, hourlyRate: 0 }
    ];
    device.State.schedule.places = [
        { id: 'p_01', name: 'הרצליה', active: true },
        { id: 'p_02', name: 'תל אביב', active: true }
    ];
    device.State.save({ silent: true });
}

// Record a day the way the app does: mutate through the model, commit through State so
// the field path reaches the sync layer.
function record(device, date, workerId, placeId, rate) {
    const change = device.call('assignPlace',
        device.State.schedule, date, workerId, 'actual', placeId, rate);
    device.State.commit(change);
    return change;
}

// ---------------------------------------------------------------- the harness itself
{
    suite('a device in Node behaves like a device');

    const device = makeDevice();
    check('storage is available', device.Store.available === true);

    device.Store.set('k', 'v');
    check('a value written comes back', device.Store.get('k') === 'v');
    check('and appears in keys(), which the snapshot list reads',
        device.Store.keys().includes('k'));

    seed(device);
    record(device, '2026-08-12', 'w_01', 'p_01');
    check('a recorded day is in the schedule',
        device.call('entriesFor', device.State.schedule, '2026-08-12', 'w_01', 'actual').length === 1);

    // The whole point of the harness: this is what survives the app being closed.
    const disk = device.dump();
    check('the schedule was written to storage', Boolean(disk['scheduleData:v2']));

    const reopened = makeDevice({ storage: disk });
    reopened.State.load();
    check('and a reopened device reads it back',
        reopened.call('entriesFor', reopened.State.schedule, '2026-08-12', 'w_01', 'actual').length === 1);

    check('a second device is genuinely separate',
        makeDevice().Store.get('scheduleData:v2') === null);
}

// ---------------------------------------------------------------- local only
{
    suite('with no cloud at all, the app is unchanged');

    const device = makeDevice();
    seed(device);
    record(device, '2026-08-12', 'w_01', 'p_01');

    check('sync stays off', device.Sync.status === 'off');
    check('the day is recorded anyway',
        device.call('entriesFor', device.State.schedule, '2026-08-12', 'w_01', 'actual').length === 1);
    check('and it survives a restart', (() => {
        const again = makeDevice({ storage: device.dump() });
        again.State.load();
        return again.call('entriesFor', again.State.schedule, '2026-08-12', 'w_01', 'actual').length === 1;
    })());
}

// ---------------------------------------------------------------- one device online
{
    suite('one device, online');

    const device = makeDevice();
    const cloud = makeCloud();
    seed(device);
    await connected(device, cloud);

    record(device, '2026-08-12', 'w_01', 'p_01');
    await wait();

    check('the day reached the cloud',
        Boolean(cloud.doc && cloud.doc.days && cloud.doc.days['2026-08-12']),
        JSON.stringify(cloud.doc && Object.keys(cloud.doc)));
    check('and the status says so', device.Sync.status === 'synced', device.Sync.status);
}

// ---------------------------------------------------------------- the empty project
{
    suite('a project whose document does not exist yet');

    const device = makeDevice();
    const cloud = makeCloud();               // doc: null - nobody has ever written
    seed(device);
    await connected(device, cloud);

    record(device, '2026-08-12', 'w_01', 'p_01');
    await wait();

    given('the cloud document was created at all', Boolean(cloud.doc));

    check('the first write creates a document, not an empty one',
        typeof cloud.doc.updatedAt === 'string', JSON.stringify(cloud.doc.updatedAt));
    check('carrying the roster, which the rules require of a full write',
        Array.isArray(cloud.doc.workers) && Array.isArray(cloud.doc.places)
        && cloud.doc.workers.length === 3, JSON.stringify(Object.keys(cloud.doc)));
    check('and it says which device wrote it',
        typeof cloud.doc.updatedBy === 'string', String(cloud.doc.updatedBy));
    check('the day that triggered it is in there',
        Boolean(cloud.doc.days && cloud.doc.days['2026-08-12']),
        JSON.stringify(cloud.doc.days && Object.keys(cloud.doc.days)));
    check('nothing was written as a bare {} first',
        !cloud.writes.some(w => w.data && Object.keys(w.data).length === 0),
        JSON.stringify(cloud.writes.map(w => w.kind)));
}

{
    suite('every write carries a stamp');

    // The rules cannot enforce this. In an update, request.resource.data is the document
    // as it would be AFTER the merge, so it still holds the stored updatedAt and an
    // unstamped write passes - and lands, leaving the document looking older than it is.
    // The guarantee has to be here.
    const device = makeDevice();
    const cloud = makeCloud();
    seed(device);
    await connected(device, cloud);
    record(device, '2026-08-12', 'w_01', 'p_01');
    await wait();

    // A send that fails and is retried is the path that used to go out bare: the stamp
    // is consumed by the first attempt and there is nothing left to put on the second.
    cloud.online = false;
    record(device, '2026-08-13', 'w_01', 'p_01');
    await wait();
    cloud.online = true;
    device.Sync.flush();
    await wait();

    const updates = cloud.attempts.filter(a => a.kind === 'update');
    given('there were writes to look at', updates.length > 0);
    check('no write goes out without one, retries included',
        updates.every(a => typeof a.payload.updatedAt === 'string'),
        `${updates.filter(a => typeof a.payload.updatedAt !== 'string').length} of ${updates.length} unstamped`);
    check('and the retried day arrived',
        Boolean(cloud.doc.days && cloud.doc.days['2026-08-13']),
        JSON.stringify(cloud.doc.days && Object.keys(cloud.doc.days)));
}

{
    suite('two devices reaching an empty project at the same moment');

    // Both subscribe before either writes, so both are told the document is missing and
    // both try to create it. Exactly one can win; the loser must not overwrite the
    // winner, and must not lose its own day either.
    const cloud = makeCloud();
    const one = makeDevice({ deviceId: 'd_one' });
    const two = makeDevice({ deviceId: 'd_two' });

    one.State.schedule.workers = [{ id: 'w_01', name: 'דוד', active: true, dailyRate: 400 }];
    one.State.schedule.places = [{ id: 'p_01', name: 'הרצליה', active: true }];
    one.State.save({ silent: true });

    two.State.schedule.workers = [{ id: 'w_01', name: 'דוד', active: true, dailyRate: 400 }];
    two.State.schedule.places = [{ id: 'p_01', name: 'הרצליה', active: true }];
    two.State.save({ silent: true });

    one.Sync.pushDelayMs = TICK;
    two.Sync.pushDelayMs = TICK;
    one.Sync.connect(cloud.adapter);
    two.Sync.connect(cloud.adapter);
    await wait();

    record(one, '2026-08-12', 'w_01', 'p_01');
    record(two, '2026-08-13', 'w_01', 'p_01');
    await settle(TICK * 20);

    check('exactly one create was accepted',
        cloud.writes.filter(w => w.kind === 'create').length === 1,
        JSON.stringify(cloud.writes.map(w => w.kind)));
    check('the first device\'s day is there',
        Boolean(cloud.doc.days && cloud.doc.days['2026-08-12']));
    check('and so is the second device\'s',
        Boolean(cloud.doc.days && cloud.doc.days['2026-08-13']),
        JSON.stringify(cloud.doc.days && Object.keys(cloud.doc.days)));
    check('neither device is left reporting an error',
        one.Sync.status === 'synced' && two.Sync.status === 'synced',
        `${one.Sync.status}/${two.Sync.status}`);
}

// ---------------------------------------------------------------- money
{
    suite('the arithmetic that becomes someone\'s pay');

    const device = makeDevice();
    seed(device);
    const s = device.State.schedule;

    ['2026-08-09', '2026-08-10', '2026-08-11', '2026-08-12', '2026-08-13'].forEach(date => {
        device.call('assignPlace', s, date, 'w_01', 'actual', 'p_01');
    });

    const row = device.call('payrollReport', s, '2026-08-01', '2026-08-31')
        .find(r => r.workerId === 'w_01');
    check('five days at 400 is 2000', row.amount === 2000, String(row.amount));

    // Two sites in one day is one day's pay - the travelling does not earn more.
    device.call('assignPlace', s, '2026-08-13', 'w_01', 'actual', 'p_02');
    const after = device.call('payrollReport', s, '2026-08-01', '2026-08-31')
        .find(r => r.workerId === 'w_01');
    check('a second site on a day already worked adds nothing',
        after.amount === 2000, String(after.amount));

    device.call('assignPlace', s, '2026-08-12', 'w_03', 'actual', 'p_01');
    check('a worker with no rate is unknown, not owed nothing',
        device.call('payrollReport', s, '2026-08-01', '2026-08-31')
            .find(r => r.workerId === 'w_03').amount === null);
}

report();
