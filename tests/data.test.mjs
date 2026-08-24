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
// Returns what commit() reports: whether the edit is now somewhere that survives the
// app being closed. Tests that care about the change object build it themselves.
function record(device, date, workerId, placeId, rate) {
    const change = device.call('assignPlace',
        device.State.schedule, date, workerId, 'actual', placeId, rate);
    return device.State.commit(change);
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

// ---------------------------------------------------------------- a full device
{
    suite('a device with no room still knows who it is');

    // Store.set writes to memory first and then to disk. Store.get read the DISK first
    // and returned what it found - including null. So on a full device every write went
    // to memory, every read came back empty, and syncDeviceId() minted a new id on every
    // single call: each write signed by a different device, and the echo check that keeps
    // a phone from adopting its own writes had nothing stable to compare against.
    const device = makeDevice();
    // No id yet, and no room to write one - which is the state a phone that has been
    // full since before it was first opened is actually in.
    device.Store.remove('farkad:deviceId');
    device.setQuota(() => true);              // every write from here on is refused

    const first = device.call('syncDeviceId');
    const second = device.call('syncDeviceId');
    const third = device.call('syncDeviceId');

    check('the device id is the same every time it is asked',
        first === second && second === third, `${first} / ${second} / ${third}`);
    check('and it is a real id, not an empty string', /^d_/.test(first), first);

    // The same fault in general: a value written this session must read back as written,
    // whether or not the disk accepted it.
    device.Store.set('scheduleData:v2', '{"kept":true}');
    check('a write that the disk refused still reads back in this session',
        device.Store.get('scheduleData:v2') === '{"kept":true}',
        JSON.stringify(device.Store.get('scheduleData:v2')));
    check('and the refusal was reported, not swallowed', device.Store.full === true);

    // And a NEWER memory value must win over a stale one still on disk, or a failed
    // outbox write would be read back as the queue from before the edit.
    const withDisk = makeDevice({ storage: { 'farkad:outbox': '{"seq":1,"items":{}}' } });
    withDisk.setQuota(() => true);
    withDisk.Store.set('farkad:outbox', '{"seq":2,"items":{"a":1}}');
    check('a newer value in memory beats a stale one on disk',
        withDisk.Store.get('farkad:outbox') === '{"seq":2,"items":{"a":1}}',
        withDisk.Store.get('farkad:outbox'));

    check('and keys() lists what is only in memory, so snapshots are still found',
        withDisk.Store.keys().includes('farkad:outbox'));
}

{
    suite('a write is only reported as saved when it can be read back');

    const device = makeDevice();
    check('a write that lands is confirmed',
        device.Store.setVerified('k', 'v') === true);

    // A disk that accepts the write and gives back something else is rarer than a full
    // one and worse, because nothing throws. The only way to know is to look.
    const liar = makeDevice();
    liar.corruptOnWrite('k');
    check('a write that comes back changed is not confirmed',
        liar.Store.setVerified('k', 'v') === false);

    const full = makeDevice();
    full.setQuota(() => true);
    check('and neither is one the disk refused',
        full.Store.setVerified('k', 'v') === false);
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

// ---------------------------------------------------------------- the outbox
{
    suite('an edit is written down before it is called done');

    // No adapter at all. Someone recording for a week before they ever sign in is the
    // ordinary case here, not an exotic one - and every one of those edits has to be
    // waiting when they do.
    const device = makeDevice();
    seed(device);
    record(device, '2026-08-12', 'w_01', 'p_01');
    record(device, '2026-08-13', 'w_02', 'p_02');

    // Two days recorded is two field paths. seed() saves silently and is not an edit.
    check('edits queue with no cloud connected at all',
        device.Sync.pendingCount() === 2, String(device.Sync.pendingCount()));
    check('and the queue is on disk, not in memory',
        Boolean(device.dump()['farkad:outbox']));

    // Same path twice is one pending write, not two - the value is the whole record for
    // that field, so the later one is the only one worth sending.
    record(device, '2026-08-12', 'w_01', 'p_02');
    check('editing the same field again does not queue it twice',
        device.Sync.pendingCount() === 2, String(device.Sync.pendingCount()));

    // A roster change queues with no cloud too - a worker added offline who never
    // reaches the cloud takes his days with him. It is one path per person, plus the
    // order, plus the whole array kept for devices still on the older build: for three
    // workers and two places that is 5 + 4 on top of the two days.
    device.State.commitRoster();
    check('a roster change queues one path per person, not one whole array',
        device.Sync.pendingCount() === 11, String(device.Sync.pendingCount()));
    check('and the paths are per-entity',
        device.Sync.pendingPaths().includes('roster.workers.w_01')
        && device.Sync.pendingPaths().includes('roster.workerOrder'),
        JSON.stringify(device.Sync.pendingPaths()));

    const reopened = makeDevice({ storage: device.dump() });
    reopened.State.load();
    check('and the queue survives the app being closed',
        reopened.Sync.pendingCount() === 11, String(reopened.Sync.pendingCount()));
}

{
    suite('the acceptance test: offline, closed, reopened against an older cloud');

    // 1-2. Offline, with no adapter, record days and add a worker.
    const first = makeDevice({ deviceId: 'd_phone' });
    seed(first);
    record(first, '2026-08-12', 'w_01', 'p_01');
    record(first, '2026-08-13', 'w_02', 'p_01');
    first.State.schedule.workers.push({
        id: 'w_09', name: 'חדש', active: true, dailyRate: 300, hourlyRate: 0
    });
    first.State.commitRoster();

    // 3. Close the app completely. This is all that survives.
    const disk = first.dump();

    // 4. Reopen online, against a cloud holding a state from BEFORE any of that.
    const cloud = makeCloud({
        doc: {
            schemaVersion: 2,
            workers: [
                { id: 'w_01', name: 'דוד', active: true, dailyRate: 400, hourlyRate: 50 },
                { id: 'w_02', name: 'שרה', active: true, dailyRate: 350, hourlyRate: 0 },
                { id: 'w_03', name: 'עלי', active: true, dailyRate: 0, hourlyRate: 0 }
            ],
            places: [
                { id: 'p_01', name: 'הרצליה', active: true },
                { id: 'p_02', name: 'תל אביב', active: true }
            ],
            days: { '2026-08-01': { plan: {}, actual: { w_01: { entries: [{ placeId: 'p_02' }] } } } },
            advances: {},
            updatedAt: '2026-08-01T06:00:00.000Z',
            updatedBy: 'd_other'
        }
    });

    const again = makeDevice({ storage: disk, deviceId: 'd_phone' });
    again.State.load();
    await connected(again, cloud);
    await settle(TICK * 20);

    // 5. The local edits are still there.
    check('the day recorded offline survived the older snapshot',
        again.call('entriesFor', again.State.schedule, '2026-08-12', 'w_01', 'actual').length === 1);
    check('so did the second one',
        again.call('entriesFor', again.State.schedule, '2026-08-13', 'w_02', 'actual').length === 1);
    check('and so did the worker added while offline',
        Boolean(again.State.worker('w_09')),
        JSON.stringify(again.State.schedule.workers.map(w => w.id)));
    check('while the cloud\'s own older day was not thrown away',
        again.call('entriesFor', again.State.schedule, '2026-08-01', 'w_01', 'actual').length === 1);

    // 6. Sent once.
    const dayWrites = cloud.writes.filter(w =>
        w.patch && Object.prototype.hasOwnProperty.call(w.patch, 'days.2026-08-12.actual.w_01'));
    check('the offline day was sent exactly once',
        dayWrites.length === 1, `${dayWrites.length} writes carried it`);

    // 7. Everyone agrees.
    check('the cloud has the offline day',
        Boolean(cloud.doc.days['2026-08-12']), JSON.stringify(Object.keys(cloud.doc.days)));
    check('the cloud has the offline worker',
        cloud.doc.workers.some(w => w.id === 'w_09'),
        JSON.stringify(cloud.doc.workers.map(w => w.id)));
    check('and nothing is left waiting',
        again.Sync.pendingCount() === 0, String(again.Sync.pendingCount()));
    check('a third device opening now sees the same thing', (() => {
        const third = makeDevice();
        third.State.schedule = third.call('normaliseSchedule', cloud.doc);
        return third.call('entriesFor', third.State.schedule, '2026-08-12', 'w_01', 'actual').length === 1
            && Boolean(third.State.worker('w_09'));
    })());
}

{
    suite('a failed send is kept, retried, and dropped only when acknowledged');

    const device = makeDevice();
    const cloud = makeCloud();
    seed(device);
    await connected(device, cloud);
    await wait();

    cloud.online = false;
    record(device, '2026-08-12', 'w_01', 'p_01');
    await wait();

    check('a write that failed is still waiting',
        device.Sync.pendingCount() > 0, String(device.Sync.pendingCount()));
    check('and it is still on disk',
        device.dump()['farkad:outbox'].includes('2026-08-12'));

    // Closing the app here is the case the whole outbox exists for.
    const reopened = makeDevice({ storage: device.dump() });
    reopened.State.load();
    check('a restart does not lose it',
        reopened.Sync.pendingCount() > 0, String(reopened.Sync.pendingCount()));

    cloud.online = true;
    device.Sync.flush();
    await wait();

    check('once it lands the queue empties',
        device.Sync.pendingCount() === 0, String(device.Sync.pendingCount()));
    check('and the cloud has it',
        Boolean(cloud.doc.days && cloud.doc.days['2026-08-12']));
}

{
    suite('an edit made during a send is not acknowledged by that send');

    // The value in flight and the value now are different; the ack is for the old one.
    // Removing the path outright on ack would throw away the newer edit with it.
    const device = makeDevice();
    let release;
    const held = new Promise(resolve => { release = resolve; });
    const cloud = makeCloud();

    seed(device);
    await connected(device, cloud);
    await wait();

    const realUpdate = cloud.adapter.update;
    cloud.adapter.update = patch => held.then(() => realUpdate(patch));

    record(device, '2026-08-12', 'w_01', 'p_01');
    await wait();                                   // the send is now open and waiting

    record(device, '2026-08-12', 'w_01', 'p_02');   // changed again, mid-flight
    release();
    await settle(TICK * 20);
    cloud.adapter.update = realUpdate;
    device.Sync.flush();
    await settle(TICK * 20);

    const entries = (cloud.doc.days['2026-08-12'].actual.w_01 || {}).entries || [];
    check('the newer value is the one that ends up in the cloud',
        entries.length === 2 && entries.some(e => e.placeId === 'p_02'),
        JSON.stringify(entries));
    check('and nothing is left waiting',
        device.Sync.pendingCount() === 0, String(device.Sync.pendingCount()));
}

{
    suite('a queue too big for one write still drains');

    // Someone recording for a month before they sign in is the ordinary way this app
    // gets adopted, and the whole month is waiting when they do. As one update it is a
    // single enormous write - and a write Firestore refuses lands nothing at all.
    const device = makeDevice();
    // The document already exists, so this goes through updates rather than through the
    // create shortcut - which would carry the whole schedule in one go and prove nothing
    // about batching.
    const cloud = makeCloud({
        doc: {
            schemaVersion: 2, workers: [], places: [], days: {}, advances: {},
            updatedAt: '2026-01-01T00:00:00.000Z', updatedBy: 'd_other'
        }
    });
    seed(device);

    // Five months of days, three workers a day - a season recorded before signing in.
    const dates = [];
    for (let i = 0; i < 150; i += 1) {
        const d = new Date(Date.UTC(2026, 2, 1) + i * 86400000);
        dates.push(d.toISOString().slice(0, 10));
    }
    dates.forEach(date => {
        ['w_01', 'w_02', 'w_03'].forEach(id => {
            device.State.commit(device.call('assignPlace',
                device.State.schedule, date, id, 'actual', 'p_01'));
        });
    });
    given('the queue is bigger than one write', device.Sync.pendingCount() > 300);

    await connected(device, cloud);
    // Long enough for several rounds of the debounce.
    await settle(TICK * 60);

    check('no single write exceeded the batch size',
        cloud.writes.filter(w => w.patch).every(w => Object.keys(w.patch).length <= 302),
        JSON.stringify(cloud.writes.filter(w => w.patch).map(w => Object.keys(w.patch).length)));
    const batches = cloud.writes.filter(w => w.patch);
    check('it took more than one write', batches.length > 1, String(batches.length));
    check('and every day arrived',
        Object.keys(cloud.doc.days).length === dates.length,
        `${Object.keys(cloud.doc.days).length} of ${dates.length}`);
    check('with nothing left waiting',
        device.Sync.pendingCount() === 0, String(device.Sync.pendingCount()));
}

// ---------------------------------------------------------------- who is who
{
    suite('two devices naming new people at the same moment');

    // max+1 gave both devices the same next id, so two different men were both w_04.
    // From then on every day recorded against w_04 belonged to whichever of them the
    // reading device happened to have - and that is a pay sheet, not a display glitch.
    const cloud = makeCloud({
        doc: {
            schemaVersion: 2,
            workers: [{ id: 'w_01', name: 'דוד', active: true, dailyRate: 400, hourlyRate: 0 }],
            places: [{ id: 'p_01', name: 'הרצליה', active: true }],
            days: {}, advances: {},
            updatedAt: '2026-08-01T06:00:00.000Z', updatedBy: 'd_other'
        }
    });

    const one = makeDevice({ deviceId: 'd_one' });
    const two = makeDevice({ deviceId: 'd_two' });
    [one, two].forEach(device => {
        device.State.schedule = device.call('normaliseSchedule', cloud.doc);
        device.State.save({ silent: true });
    });

    const idOne = one.State.nextWorkerId();
    const idTwo = two.State.nextWorkerId();
    check('two devices at the same baseline do not mint the same worker id',
        idOne !== idTwo, `${idOne} / ${idTwo}`);
    check('nor the same place id',
        one.State.nextPlaceId() !== two.State.nextPlaceId());

    // Each adds a different person, offline, then both come back.
    one.State.schedule.workers.push({ id: idOne, name: 'אחמד', active: true, dailyRate: 400, hourlyRate: 0 });
    one.State.commitRoster();
    two.State.schedule.workers.push({ id: idTwo, name: 'ח\'אלד', active: true, dailyRate: 450, hourlyRate: 0 });
    two.State.commitRoster();

    // A day each, against their own new man.
    one.State.commit(one.call('assignPlace', one.State.schedule, '2026-08-12', idOne, 'actual', 'p_01'));
    two.State.commit(two.call('assignPlace', two.State.schedule, '2026-08-12', idTwo, 'actual', 'p_01'));

    one.Sync.pushDelayMs = TICK;
    two.Sync.pushDelayMs = TICK;
    one.Sync.connect(cloud.adapter);
    await settle(TICK * 20);
    two.Sync.connect(cloud.adapter);
    await settle(TICK * 30);
    one.Sync.flush();
    two.Sync.flush();
    await settle(TICK * 30);

    const finalRoster = one.call('normaliseSchedule', cloud.doc);
    const ids = finalRoster.workers.map(w => w.id);
    check('both new men are in the cloud roster',
        ids.includes(idOne) && ids.includes(idTwo), JSON.stringify(ids));
    check('and neither replaced the other',
        finalRoster.workers.length === 3, String(finalRoster.workers.length));

    const names = finalRoster.workers.map(w => w.name);
    check('with their own names and rates intact',
        names.includes('אחמד') && names.includes('ח\'אלד'), JSON.stringify(names));

    // The whole point: the days did not follow the wrong man.
    check('each day belongs to the man it was recorded against',
        one.call('entriesFor', finalRoster, '2026-08-12', idOne, 'actual').length === 1
        && one.call('entriesFor', finalRoster, '2026-08-12', idTwo, 'actual').length === 1);

    const pay = one.call('payrollReport', finalRoster, '2026-08-01', '2026-08-31');
    check('and so does the pay',
        pay.find(r => r.workerId === idOne).amount === 400
        && pay.find(r => r.workerId === idTwo).amount === 450,
        JSON.stringify(pay.map(r => [r.name, r.amount])));
}

{
    suite('ids that already exist are left exactly as they are');

    const device = makeDevice();
    seed(device);
    check('an old-style roster keeps its old-style ids',
        device.State.schedule.workers.map(w => w.id).join() === 'w_01,w_02,w_03');

    const days = device.State.schedule;
    device.call('assignPlace', days, '2026-08-12', 'w_01', 'actual', 'p_01');
    check('and days recorded against them still resolve',
        device.call('entriesFor', days, '2026-08-12', 'w_01', 'actual').length === 1);

    // Enough of them that a collision would show up rather than being lucky.
    const minted = new Set();
    for (let i = 0; i < 500; i += 1) minted.add(device.call('newEntityId', 'w'));
    check('a new id is not a number one past the last one',
        !/^w_\d+$/.test([...minted][0]), [...minted][0]);
    check('and five hundred of them are five hundred different ids',
        minted.size === 500, String(minted.size));
}

{
    suite('an import with a broken roster stops and asks');

    const device = makeDevice();
    const check1 = device.call('validateRosterIds', {
        workers: [
            { id: 'w_01', name: 'דוד' },
            { id: 'w_01', name: 'מישהו אחר' }
        ],
        places: [{ id: 'p_01', name: 'הרצליה' }]
    });
    check('a duplicate worker id is reported, not quietly renumbered',
        check1.length === 1 && check1[0].includes('w_01'), JSON.stringify(check1));

    const check2 = device.call('validateRosterIds', {
        workers: [{ id: '', name: 'בלי מזהה' }],
        places: [{ id: 'p_01', name: 'הרצליה' }]
    });
    check('so is a missing id', check2.length === 1, JSON.stringify(check2));

    const clean = device.call('validateRosterIds', {
        workers: [{ id: 'w_01' }, { id: 'w_02' }],
        places: [{ id: 'p_01' }]
    });
    check('and a sound file reports nothing', clean.length === 0, JSON.stringify(clean));
}

{
    suite('a device still on the old wire format is understood');

    // The cloud document written by a build that only knew arrays. A device on the new
    // one has to read it correctly, or updating first is what loses the roster.
    const device = makeDevice();
    const legacy = {
        schemaVersion: 2,
        workers: [{ id: 'w_01', name: 'דוד', active: true, dailyRate: 400, hourlyRate: 0 }],
        places: [{ id: 'p_01', name: 'הרצליה', active: true }],
        days: {}, advances: {},
        updatedAt: '2026-08-01T06:00:00.000Z', updatedBy: 'd_old'
    };
    const read = device.call('normaliseSchedule', legacy);
    check('an array-only roster still reads',
        read.workers.length === 1 && read.places.length === 1,
        JSON.stringify([read.workers.length, read.places.length]));

    // And the new build keeps writing the arrays, so a device that has NOT updated can
    // still read what a device that has updated wrote.
    const wire = device.call('cloudDocument', read);
    check('and the new format still carries the arrays for them to read',
        Array.isArray(wire.workers) && wire.workers.length === 1,
        JSON.stringify(Object.keys(wire)));
    check('alongside the per-entity roster',
        Boolean(wire.roster && wire.roster.workers && wire.roster.workers.w_01),
        JSON.stringify(wire.roster && Object.keys(wire.roster)));
}

{
    suite('roster order is its own field, not a reason to resend everyone');

    const device = makeDevice();
    const cloud = makeCloud();
    seed(device);
    await connected(device, cloud);
    await wait();

    device.State.schedule.workers.reverse();
    device.State.commitRoster();
    await wait();

    const read = device.call('normaliseSchedule', cloud.doc);
    check('the new order reached the cloud',
        read.workers.map(w => w.id).join() === 'w_03,w_02,w_01',
        JSON.stringify(read.workers.map(w => w.id)));
}

// ---------------------------------------------------------------- restore
{
    suite('a restore that did not reach the cloud does not report success');

    const device = makeDevice();
    const cloud = makeCloud();
    seed(device);
    await connected(device, cloud);
    record(device, '2026-08-12', 'w_01', 'p_01');
    await wait();

    const restored = device.call('normaliseSchedule', {
        schemaVersion: 2,
        workers: [{ id: 'w_01', name: 'דוד', active: true, dailyRate: 400, hourlyRate: 0 }],
        places: [{ id: 'p_01', name: 'הרצליה', active: true }],
        days: { '2026-07-01': { plan: {}, actual: { w_01: { entries: [{ placeId: 'p_01' }] } } } },
        advances: {},
        updatedAt: '2026-07-01T06:00:00.000Z', updatedBy: 'd_backup'
    });

    cloud.online = false;
    let rejected = false;
    device.State.schedule = restored;
    device.State.save({ silent: true });
    await device.Sync.replaceAll(device.State.schedule).catch(() => { rejected = true; });

    check('replaceAll rejects rather than resolving quietly', rejected);
    check('and the status says so', device.Sync.status === 'error', device.Sync.status);
    check('the restored state is still what is on the device',
        Object.keys(device.State.schedule.days).join() === '2026-07-01',
        JSON.stringify(Object.keys(device.State.schedule.days)));
    check('and the replacement is written down, not just remembered',
        Boolean(device.dump()['farkad:pendingReplace']));

    // The dangerous moment: another phone's snapshot arrives while the restore has not
    // landed. Adopting it would quietly undo the restore, on the device that asked for it.
    device.Sync.receive({
        schemaVersion: 2,
        workers: restored.workers, places: restored.places,
        days: { '2026-08-12': { plan: {}, actual: { w_01: { entries: [{ placeId: 'p_01' }] } } } },
        advances: {}, updatedAt: '2026-08-12T18:00:00.000Z', updatedBy: 'd_other'
    });
    check('an arriving snapshot cannot undo a restore that is still pending',
        Object.keys(device.State.schedule.days).join() === '2026-07-01',
        JSON.stringify(Object.keys(device.State.schedule.days)));

    // It survives the app being closed, and goes out when the network comes back.
    const reopened = makeDevice({ storage: device.dump() });
    reopened.State.load();
    check('a restart still knows the restore has not landed',
        reopened.Sync.pendingReplace() !== null);

    cloud.online = true;
    reopened.Sync.pushDelayMs = TICK;
    reopened.Sync.connect(cloud.adapter);
    await settle(TICK * 30);

    check('and it goes out once there is a connection',
        Object.keys(cloud.doc.days).join() === '2026-07-01',
        JSON.stringify(Object.keys(cloud.doc.days)));
    check('after which nothing is left pending',
        reopened.Sync.pendingReplace() === null);
    check('and the note is off the disk too',
        !reopened.dump()['farkad:pendingReplace']);
}

{
    suite('a restore that did reach the cloud reports success');

    const device = makeDevice();
    const cloud = makeCloud();
    seed(device);
    await connected(device, cloud);
    await wait();

    let ok = false;
    device.State.schedule.days = {};
    device.call('assignPlace', device.State.schedule, '2026-06-01', 'w_01', 'actual', 'p_01');
    device.State.save({ silent: true });
    await device.Sync.replaceAll(device.State.schedule).then(() => { ok = true; });

    check('replaceAll resolves', ok);
    check('the cloud has the replacement',
        Boolean(cloud.doc.days['2026-06-01']), JSON.stringify(Object.keys(cloud.doc.days)));
    check('nothing is pending', device.Sync.pendingReplace() === null);
    check('and the queue of field edits is cleared, since they were superseded',
        device.Sync.pendingCount() === 0, String(device.Sync.pendingCount()));
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

// ---------------------------------------------------------------- the recording rules
{
    suite('the two-site cap belongs to the write, not the screen');

    const device = makeDevice();
    seed(device);
    const s = device.State.schedule;

    device.call('assignPlace', s, '2026-08-12', 'w_01', 'actual', 'p_01');
    device.call('assignPlace', s, '2026-08-12', 'w_01', 'actual', 'p_02');
    check('two sites in a day is allowed',
        device.call('entriesFor', s, '2026-08-12', 'w_01', 'actual').length === 2);

    // A third can arrive from a copy-yesterday, a migration decision, or another phone -
    // none of which pass through the screen that knows about the limit.
    const third = device.call('assignPlace', s, '2026-08-12', 'w_01', 'actual', 'p_03');
    check('a third is refused by the model itself',
        device.call('entriesFor', s, '2026-08-12', 'w_01', 'actual').length === 2,
        String(device.call('entriesFor', s, '2026-08-12', 'w_01', 'actual').length));
    check('and the refusal is returned, not swallowed',
        third === null || (third && third.refused === true), JSON.stringify(third));

    // Replacing a site that is already there is not a third site.
    const same = device.call('assignPlace', s, '2026-08-12', 'w_01', 'actual', 'p_02');
    check('re-assigning a site already recorded still works',
        same && !same.refused
        && device.call('entriesFor', s, '2026-08-12', 'w_01', 'actual').length === 2);
}

{
    suite('data that is already over the cap is flagged, never trimmed');

    const device = makeDevice();
    seed(device);
    // A day written by an older build, or by hand. Three sites, and they are real.
    const s = device.call('normaliseSchedule', {
        workers: [{ id: 'w_01', name: 'דוד', active: true, dailyRate: 400 }],
        places: [{ id: 'p_01', name: 'א' }, { id: 'p_02', name: 'ב' }, { id: 'p_03', name: 'ג' }],
        days: {
            '2026-08-12': {
                plan: {},
                actual: { w_01: { entries: [{ placeId: 'p_01' }, { placeId: 'p_02' }, { placeId: 'p_03' }] } }
            }
        },
        updatedAt: '2026-08-12T18:00:00.000Z'
    });

    check('reading it keeps all three - nothing is thrown away on the way in',
        device.call('entriesFor', s, '2026-08-12', 'w_01', 'actual').length === 3,
        String(device.call('entriesFor', s, '2026-08-12', 'w_01', 'actual').length));

    const flagged = device.call('daysOverCap', s);
    check('and it is reported for a person to look at',
        flagged.length === 1 && flagged[0].date === '2026-08-12' && flagged[0].workerId === 'w_01',
        JSON.stringify(flagged));

    check('a sound schedule flags nothing', (() => {
        const clean = device.State.schedule;
        device.call('assignPlace', clean, '2026-08-12', 'w_01', 'actual', 'p_01');
        return device.call('daysOverCap', clean).length === 0;
    })());
}

{
    suite('two sites with the same name are not silently the same site');

    const device = makeDevice();
    const result = device.call('migrateV1', {
        workers: ['דוד'],
        places: ['הרצליה', 'הרצליה'],
        weekStartDate: '2026-08-07',
        assignments: [{ index: 0, value: 'הרצליה' }]
    });

    check('the duplicate name is reported',
        result.issues.some(i => i.kind === 'duplicate-place-name'),
        JSON.stringify(result.issues.map(i => i.kind)));
    check('and the day is NOT attached to whichever came first',
        device.call('entriesFor', result.schedule, '2026-08-07', 'w_01', 'actual').length === 0,
        JSON.stringify(device.call('entriesFor', result.schedule, '2026-08-07', 'w_01', 'actual')));
    check('it waits for a decision instead',
        result.issues.some(i => i.kind === 'unknown-place' && i.value === 'הרצליה'),
        JSON.stringify(result.issues.map(i => i.kind)));
}

{
    suite('an archived site does not take its history with it');

    const device = makeDevice();
    seed(device);
    const s = device.State.schedule;
    device.call('assignPlace', s, '2026-08-12', 'w_01', 'actual', 'p_02');
    s.places.find(p => p.id === 'p_02').active = false;

    const invoice = device.call('invoiceReport', s, '2026-08-01', '2026-08-31');
    const row = invoice.find(r => r.placeId === 'p_02');
    check('the archived site is still in the invoice',
        Boolean(row) && row.workerDays === 1, JSON.stringify(row && row.workerDays));
    check('and still has its name, so the day is not attributed to nobody',
        Boolean(row) && row.name === 'תל אביב', JSON.stringify(row && row.name));

    const byDate = device.call('invoiceByDate', s, '2026-08-01', '2026-08-31');
    check('and it appears in the day-by-day invoice too',
        byDate.countAt('p_02', '2026-08-12') === 1, String(byDate.countAt('p_02', '2026-08-12')));
}

{
    suite('the numbers are the same after a backup and a restore');

    const device = makeDevice();
    seed(device);
    const s = device.State.schedule;
    device.call('assignPlace', s, '2026-08-10', 'w_01', 'actual', 'p_01');
    device.call('assignPlace', s, '2026-08-11', 'w_01', 'actual', 'p_01', 'double');
    device.call('assignPlace', s, '2026-08-12', 'w_01', 'actual', 'p_01', 'normal', 3);
    device.call('assignPlace', s, '2026-08-12', 'w_02', 'actual', 'p_02');
    device.call('addAdvance', s, 'w_01', '2026-08-11', 250, '');
    s.places.find(p => p.id === 'p_02').active = false;

    const payBefore = device.call('payrollReport', s, '2026-08-01', '2026-08-31');
    const invBefore = device.call('invoiceReport', s, '2026-08-01', '2026-08-31');

    // Exported, then read back the way an import reads it.
    const file = JSON.parse(JSON.stringify(s));
    const back = device.call('normaliseSchedule', file);

    same('the pay sheet is identical',
        device.call('payrollReport', back, '2026-08-01', '2026-08-31'), payBefore);
    same('and so is the invoice',
        device.call('invoiceReport', back, '2026-08-01', '2026-08-31'), invBefore);

    // And through the cloud form, which is the other shape the same data travels in.
    const viaCloud = device.call('normaliseSchedule', device.call('cloudDocument', s));
    same('the cloud round trip does not change them either',
        device.call('payrollReport', viaCloud, '2026-08-01', '2026-08-31'), payBefore);
}

// ---------------------------------------------------------------- historical pay
{
    suite('changing a rate does not repay the past');

    const device = makeDevice();
    seed(device);
    const s = device.State.schedule;

    ['2026-08-09', '2026-08-10', '2026-08-11', '2026-08-12', '2026-08-13'].forEach(date => {
        device.call('assignPlace', s, date, 'w_01', 'actual', 'p_01');
    });

    const before = device.call('payrollReport', s, '2026-08-01', '2026-08-31')
        .find(r => r.workerId === 'w_01');
    check('five days at 400 is 2000', before.amount === 2000, String(before.amount));

    // The raise. It applies from now on, not to work already done and possibly already
    // invoiced - and a rate typed to fix a typo must not silently restate five days.
    device.State.worker('w_01').dailyRate = 450;

    const after = device.call('payrollReport', s, '2026-08-01', '2026-08-31')
        .find(r => r.workerId === 'w_01');
    check('after the rate changes to 450 the old days are still 2000',
        after.amount === 2000, String(after.amount));

    // The next day worked is at the new rate.
    device.call('assignPlace', s, '2026-08-14', 'w_01', 'actual', 'p_01');
    const next = device.call('payrollReport', s, '2026-08-01', '2026-08-31')
        .find(r => r.workerId === 'w_01');
    check('and the next day worked is at the new one', next.amount === 2450, String(next.amount));

    check('the day-by-day sheet agrees with the total',
        device.call('workerDaysReport', s, device.State.worker('w_01'), '2026-08-01', '2026-08-31')
            .reduce((sum, day) => sum + (day.amount || 0), 0) === next.amount);

    check('and the sheet says the period is not all at one rate',
        next.mixedRates === true, JSON.stringify(next.mixedRates));
}

{
    suite('a day recorded before rates were stamped keeps behaving as it did');

    // The days already in the record carry no rate. Guessing one would be inventing what
    // somebody was paid, so they follow the worker's current rate exactly as they always
    // have - and that is a decision for the owner to take, not for this code.
    const device = makeDevice();
    seed(device);
    const old = device.call('normaliseSchedule', {
        workers: [{ id: 'w_01', name: 'דוד', active: true, dailyRate: 400, hourlyRate: 50 }],
        places: [{ id: 'p_01', name: 'הרצליה', active: true }],
        days: { '2026-07-01': { plan: {}, actual: { w_01: { entries: [{ placeId: 'p_01' }] } } } },
        updatedAt: '2026-07-01T06:00:00.000Z'
    });

    check('it is paid at the current rate, as before',
        device.call('payrollReport', old, '2026-07-01', '2026-07-31')
            .find(r => r.workerId === 'w_01').amount === 400);

    check('and it is not silently stamped on the way in',
        !device.call('workerDay', old, '2026-07-01', 'w_01', 'actual').rates);

    // What a migration WOULD do, offered rather than done.
    const plan = device.call('planRateStamping', old);
    check('the days with no stamped rate are countable',
        plan.days === 1, JSON.stringify(plan));
    check('and the plan names what it would write, without writing it',
        plan.changes.length === 1 && plan.changes[0].daily === 400
        && !device.call('workerDay', old, '2026-07-01', 'w_01', 'actual').rates,
        JSON.stringify(plan.changes));
}

{
    suite('the stamped rate travels and survives');

    const device = makeDevice();
    const cloud = makeCloud();
    seed(device);
    await connected(device, cloud);
    record(device, '2026-08-12', 'w_01', 'p_01');
    await wait();

    const remote = device.call('normaliseSchedule', cloud.doc);
    check('the rate a day was recorded at reaches the cloud with it',
        (device.call('workerDay', remote, '2026-08-12', 'w_01', 'actual').rates || {}).daily === 400,
        JSON.stringify(device.call('workerDay', remote, '2026-08-12', 'w_01', 'actual')));

    // And through a backup file.
    const back = device.call('normaliseSchedule', JSON.parse(JSON.stringify(device.State.schedule)));
    check('and survives a backup round trip',
        (device.call('workerDay', back, '2026-08-12', 'w_01', 'actual').rates || {}).daily === 400);

    // Removing one of two sites must not lose the rate the day was recorded at.
    device.call('assignPlace', device.State.schedule, '2026-08-12', 'w_01', 'actual', 'p_02');
    device.State.worker('w_01').dailyRate = 999;
    device.call('unassignPlace', device.State.schedule, '2026-08-12', 'w_01', 'actual', 'p_02');
    check('editing a day does not restamp it at today\'s rate',
        (device.call('workerDay', device.State.schedule, '2026-08-12', 'w_01', 'actual').rates || {}).daily === 400,
        JSON.stringify(device.call('workerDay', device.State.schedule, '2026-08-12', 'w_01', 'actual').rates));
}

// ---------------------------------------------------------------- two phones, one evening
{
    suite('two devices building the same evening');

    const cloud = makeCloud({
        doc: {
            schemaVersion: 2,
            workers: [
                { id: 'w_01', name: 'דוד', active: true, dailyRate: 400, hourlyRate: 0 },
                { id: 'w_02', name: 'שרה', active: true, dailyRate: 350, hourlyRate: 0 }
            ],
            places: [{ id: 'p_01', name: 'הרצליה', active: true },
                     { id: 'p_02', name: 'תל אביב', active: true }],
            days: {}, advances: {},
            updatedAt: '2026-08-01T06:00:00.000Z', updatedBy: 'd_other'
        }
    });

    const one = makeDevice({ deviceId: 'd_one' });
    const two = makeDevice({ deviceId: 'd_two' });
    [one, two].forEach(d => {
        d.State.schedule = d.call('normaliseSchedule', cloud.doc);
        d.State.save({ silent: true });
        d.Sync.pushDelayMs = TICK;
        d.Sync.connect(cloud.adapter);
    });
    await wait();

    // Different workers, same date. The whole design exists for this.
    record(one, '2026-08-12', 'w_01', 'p_01');
    record(two, '2026-08-12', 'w_02', 'p_02');
    await settle(TICK * 30);

    const merged = one.call('normaliseSchedule', cloud.doc);
    check('both people\'s work is in the day',
        one.call('entriesFor', merged, '2026-08-12', 'w_01', 'actual').length === 1
        && one.call('entriesFor', merged, '2026-08-12', 'w_02', 'actual').length === 1,
        JSON.stringify(merged.days['2026-08-12']));
    check('and each device can see the other\'s',
        one.call('entriesFor', one.State.schedule, '2026-08-12', 'w_02', 'actual').length === 1
        && two.call('entriesFor', two.State.schedule, '2026-08-12', 'w_01', 'actual').length === 1);
}

{
    suite('two devices editing the same worker on the same day');

    // Genuinely ambiguous, and the app says so: the later write wins. What must NOT
    // happen is the rest of the evening going with it.
    const cloud = makeCloud({
        doc: {
            schemaVersion: 2,
            workers: [
                { id: 'w_01', name: 'דוד', active: true, dailyRate: 400, hourlyRate: 0 },
                { id: 'w_02', name: 'שרה', active: true, dailyRate: 350, hourlyRate: 0 }
            ],
            places: [{ id: 'p_01', name: 'הרצליה', active: true },
                     { id: 'p_02', name: 'תל אביב', active: true }],
            days: {}, advances: {},
            updatedAt: '2026-08-01T06:00:00.000Z', updatedBy: 'd_other'
        }
    });

    const one = makeDevice({ deviceId: 'd_one' });
    const two = makeDevice({ deviceId: 'd_two' });
    [one, two].forEach(d => {
        d.State.schedule = d.call('normaliseSchedule', cloud.doc);
        d.State.save({ silent: true });
        d.Sync.pushDelayMs = TICK;
        d.Sync.connect(cloud.adapter);
    });
    await wait();

    record(one, '2026-08-12', 'w_02', 'p_01');       // somebody else's work, same evening
    await settle(TICK * 12);
    record(one, '2026-08-12', 'w_01', 'p_01');
    await settle(TICK * 12);
    record(two, '2026-08-12', 'w_01', 'p_02');       // the same cell, from the other phone
    await settle(TICK * 30);

    const merged = one.call('normaliseSchedule', cloud.doc);
    const contested = one.call('entriesFor', merged, '2026-08-12', 'w_01', 'actual');
    check('one of the two values stands, and it is a whole value',
        contested.length >= 1 && contested.every(e => e.placeId),
        JSON.stringify(contested));
    check('and the rest of the evening is untouched',
        one.call('entriesFor', merged, '2026-08-12', 'w_02', 'actual').length === 1,
        JSON.stringify(merged.days['2026-08-12'].actual));
    check('neither device is left in an error state',
        one.Sync.status === 'synced' && two.Sync.status === 'synced',
        `${one.Sync.status}/${two.Sync.status}`);
}

{
    suite('a device still on the old build writing while a new one reads');

    // The un-updated phone writes the roster as a whole array and knows nothing about
    // `roster`. The updated one must not lose people because of that.
    const cloud = makeCloud({
        doc: {
            schemaVersion: 2,
            workers: [{ id: 'w_01', name: 'דוד', active: true, dailyRate: 400, hourlyRate: 0 }],
            places: [{ id: 'p_01', name: 'הרצליה', active: true }],
            days: {}, advances: {},
            updatedAt: '2026-08-01T06:00:00.000Z', updatedBy: 'd_old'
        }
    });

    const fresh = makeDevice({ deviceId: 'd_new' });
    fresh.State.schedule = fresh.call('normaliseSchedule', cloud.doc);
    fresh.State.save({ silent: true });
    fresh.Sync.pushDelayMs = TICK;
    fresh.Sync.connect(cloud.adapter);
    await wait();

    // The new device adds someone - per-entity plus the legacy array.
    const id = fresh.State.nextWorkerId();
    fresh.State.schedule.workers.push({ id, name: 'אחמד', active: true, dailyRate: 400, hourlyRate: 0 });
    fresh.State.commitRoster();
    await settle(TICK * 20);

    check('an old device reading only the arrays still sees the new man',
        (cloud.doc.workers || []).some(w => w.id === id),
        JSON.stringify((cloud.doc.workers || []).map(w => w.id)));
    check('and the per-entity form has him too',
        Boolean(cloud.doc.roster && cloud.doc.roster.workers[id]));

    // Now the old device writes the whole array, the only way it knows how, without a
    // `roster` key at all.
    cloud.doc.workers = [
        { id: 'w_01', name: 'דוד', active: true, dailyRate: 400, hourlyRate: 0 },
        { id: id, name: 'אחמד', active: true, dailyRate: 420, hourlyRate: 0 }
    ];
    cloud.doc.updatedAt = '2026-08-13T19:00:00.000Z';
    cloud.doc.updatedBy = 'd_old';
    fresh.Sync.receive(JSON.parse(JSON.stringify(cloud.doc)));

    check('the new device keeps everyone after an old-build write',
        fresh.State.schedule.workers.length === 2,
        JSON.stringify(fresh.State.schedule.workers.map(w => w.id)));
}

{
    suite('data from the old schema comes across whole');

    const device = makeDevice();
    const result = device.call('migrateV1', {
        workers: ['דוד', 'שרה'],
        places: ['הרצליה', 'תל אביב'],
        weekStartDate: '2026-08-07',
        assignments: [
            { index: 0, value: 'הרצליה' },
            { index: 1, value: 'תל אביב' },
            { index: 7, value: 'חופש', holiday: true },
            { index: 8, value: 'הרצליה + תל אביב' }
        ]
    });

    check('the roster comes across', result.schedule.workers.length === 2);
    check('a day resolves to the right site',
        device.call('entriesFor', result.schedule, '2026-08-07', 'w_01', 'actual')[0].placeId === 'p_01');
    check('a holiday becomes an absence',
        device.call('isAbsent', result.schedule, '2026-08-07', 'w_02', 'actual'));
    check('and a cell it cannot read is a question, not a guess',
        result.issues.some(i => i.kind === 'unknown-place' && i.value === 'הרצליה + תל אביב'),
        JSON.stringify(result.issues.map(i => i.kind)));
    check('with a split offered but not applied',
        result.issues.find(i => i.kind === 'unknown-place').suggestion.placeIds.join() === 'p_01,p_02'
        && device.call('entriesFor', result.schedule, '2026-08-08', 'w_02', 'actual').length === 0);
    check('migrated days carry no invented rate',
        !device.call('workerDay', result.schedule, '2026-08-07', 'w_01', 'actual').rates);
}

// ---------------------------------------------------------------- damaged records
{
    suite('a damaged outbox is not an empty one');

    // Half a write. JSON refuses it; the days inside are still plain text.
    const broken = '{"seq":7,"items":{"days.2026-08-12.actual.w_01":{"value":{"entr';
    const device = makeDevice({ storage: { 'farkad:outbox': broken } });
    seed(device);

    check('it is not reported as an empty queue',
        device.Sync.outboxDamaged === true, String(device.Sync.outboxDamaged));
    check('the raw record is still exactly where it was',
        device.raw('farkad:outbox') === broken);
    check('a copy of it was put somewhere safe',
        device.raw('farkad:outbox:damaged') === broken);
    check('and writing is stopped until somebody has seen this',
        device.call('farkadWritesBlocked') === true);

    // The failure this closes: the next ordinary edit used to overwrite the original.
    record(device, '2026-08-13', 'w_01', 'p_01');
    check('an edit made now does not overwrite the damaged record',
        device.raw('farkad:outbox') === broken, device.raw('farkad:outbox'));
    check('and the schedule is not written over either',
        device.raw('scheduleData:v2') === null);

    // The raw bytes can be got off the device.
    const held = device.global('Recovery').rawRecords();
    check('the export carries the raw record',
        held['farkad:outbox'] === broken, JSON.stringify(Object.keys(held)));

    check('and once it is acknowledged, recording resumes',
        device.global('Recovery').acknowledge() === true
        && device.call('farkadWritesBlocked') === false);
}

{
    suite('a damaged outbox on a device with no room stays blocked');

    const broken = '{"seq":7,"items":{"days.2026-08-12.actual.w_01":{"value":{"entr';
    // The fault has to be on BEFORE the scripts run: sync.js reads its outbox the
    // moment it loads. This is the device this is most likely to happen on.
    const device = makeDevice({ storage: { 'farkad:outbox': broken }, quota: () => true });

    check('the copy could not be made', device.raw('farkad:outbox:damaged') === null);
    check('the original is untouched', device.raw('farkad:outbox') === broken);
    check('writing is blocked', device.call('farkadWritesBlocked') === true);
    check('and acknowledging does not unblock it - the original is the only copy',
        device.global('Recovery').acknowledge() === false
        && device.call('farkadWritesBlocked') === true);
}

{
    suite('a damaged pending replacement is not deleted');

    const broken = '{"schemaVersion":2,"workers":[{"id":"w_01","na';
    const device = makeDevice({ storage: { 'farkad:pendingReplace': broken } });
    seed(device);

    check('reading it does not return a schedule',
        device.Sync.pendingReplace() === null);
    check('and does not remove it', device.raw('farkad:pendingReplace') === broken);
    check('a copy was put aside',
        device.raw('farkad:pendingReplace:damaged') === broken);
    check('writing is blocked', device.call('farkadWritesBlocked') === true);

    // The dangerous part: a snapshot arriving now must not be adopted, because a restore
    // was in flight and nobody knows any more what it was.
    const cloud = makeCloud();
    device.Sync.adapter = cloud.adapter;
    device.Sync.receive({
        schemaVersion: 2, workers: [], places: [],
        days: { '2026-08-01': { plan: {}, actual: {} } }, advances: {},
        updatedAt: '2026-08-01T06:00:00.000Z', updatedBy: 'd_other'
    });
    check('an arriving snapshot is not adopted while this is unresolved',
        Object.keys(device.State.schedule.days).length === 0,
        JSON.stringify(Object.keys(device.State.schedule.days)));
    check('and the record is still there afterwards',
        device.raw('farkad:pendingReplace') === broken);
}

{
    suite('a damaged schedule is never written over - with a v1 to fall back to');

    const brokenV2 = '{"schemaVersion":2,"workers":[{"id":"w_01","name":"דו';
    const v1 = JSON.stringify({
        workers: ['דוד'], places: ['הרצליה'],
        weekStartDate: '2026-08-07',
        assignments: [{ index: 0, value: 'הרצליה' }]
    });
    const device = makeDevice({ storage: { 'scheduleData:v2': brokenV2, 'scheduleData': v1 } });
    const result = device.State.load();

    check('the damage is reported to the caller', result.damaged === true);
    check('the raw v2 is exactly where it was',
        device.raw('scheduleData:v2') === brokenV2);
    check('and a copy was put aside',
        device.raw('scheduleData:v2:damaged') === brokenV2);
    check('the v1 data was read, so there is something on screen',
        device.State.schedule.workers.length === 1,
        String(device.State.schedule.workers.length));
    check('but it was NOT saved over the damaged v2',
        device.raw('scheduleData:v2') === brokenV2);

    // Nor by any later write.
    device.State.schedule.workers.push({ id: 'w_99', name: 'חדש', active: true });
    device.State.save();
    check('and a later save does not overwrite it either',
        device.raw('scheduleData:v2') === brokenV2, device.raw('scheduleData:v2'));
}

{
    suite('a damaged schedule with no v1 does not become an empty table');

    const brokenV2 = '{"schemaVersion":2,"workers":[{"id":"w_01","name":"דו';
    const device = makeDevice({ storage: { 'scheduleData:v2': brokenV2 } });
    const result = device.State.load();

    check('it says it failed rather than opening blank and quiet',
        result.damaged === true);
    check('the raw record is untouched',
        device.raw('scheduleData:v2') === brokenV2);
    check('writing is blocked, so an empty table cannot be saved over it',
        device.call('farkadWritesBlocked') === true);

    // This is the whole scenario: an empty screen, somebody starts re-entering the week.
    device.State.schedule.workers.push({ id: 'w_99', name: 'מקליד מחדש', active: true });
    device.State.save();
    check('re-typing over the blank screen does not destroy the damaged record',
        device.raw('scheduleData:v2') === brokenV2, device.raw('scheduleData:v2'));
}

{
    suite('a damaged schedule on a full device holds everything');

    const brokenV2 = '{"schemaVersion":2,"workers":[{"id":"w_01","name":"דו';
    const device = makeDevice({ storage: { 'scheduleData:v2': brokenV2 }, quota: () => true });
    device.State.load();

    check('no copy was made', device.raw('scheduleData:v2:damaged') === null);
    check('the original is untouched', device.raw('scheduleData:v2') === brokenV2);
    check('and it cannot be acknowledged away',
        device.global('Recovery').acknowledge() === false);
}

{
    suite('a quarantine never overwrites an earlier one');

    const first = '{"a":';
    const device = makeDevice({
        storage: { 'farkad:outbox': '{"b":', 'farkad:outbox:damaged': first }
    });
    device.Sync.loadOutbox();

    check('the earlier copy is still the earlier copy',
        device.raw('farkad:outbox:damaged') === first);
    check('and the new one went beside it, not on top',
        device.raw('farkad:outbox:damaged:2') === '{"b":',
        device.raw('farkad:outbox:damaged:2'));
}

{
    suite('the ordinary paths are untouched by any of this');

    const device = makeDevice();
    seed(device);
    record(device, '2026-08-12', 'w_01', 'p_01');

    check('nothing is blocked', device.call('farkadWritesBlocked') === false);
    check('no problems are recorded',
        device.global('Recovery').problems.length === 0);
    check('and the day was saved',
        device.raw('scheduleData:v2').includes('2026-08-12'));
}

// ---------------------------------------------------------------- writes that fail
{
    suite('a save that did not reach the disk is not reported as a save');

    const device = makeDevice();
    seed(device);
    // Only the schedule fails. Everything else on this device still works, which is what
    // makes it worth testing one write at a time rather than one full disk.
    device.setQuota(key => key === 'scheduleData:v2');

    const wrote = device.State.save({ silent: true });
    check('save says it did not land', wrote === false, String(wrote));
    check('and says so where the app can see it', device.State.saveFailed === true);
    check('the day is still on screen, held in memory',
        device.State.schedule.workers.length === 3);
    check('and reading it back in this session still works',
        device.Store.get('scheduleData:v2') !== null);
}

{
    suite('a queue that did not reach the disk is not reported as queued');

    const device = makeDevice();
    seed(device);
    device.setQuota(key => key === 'farkad:outbox');

    check('saveOutbox says it did not land',
        device.Sync.saveOutbox() === false);

    // The one that matters: the disk accepts the write and gives back something else.
    const liar = makeDevice();
    seed(liar);
    liar.corruptOnWrite('farkad:outbox');
    check('nor does a write that comes back changed',
        liar.Sync.saveOutbox() === false);
}

{
    suite('a restore does not begin until the way back is written down');

    const device = makeDevice();
    seed(device);
    device.call('assignPlace', device.State.schedule, '2026-08-12', 'w_01', 'actual', 'p_01');
    device.State.save({ silent: true });
    const before = device.raw('scheduleData:v2');

    // No room for the undo copy. Replacing now would leave the person with a restored
    // state and no route back to the one they had.
    device.setQuota(key => key.startsWith('scheduleData:undo') || key === 'scheduleData:v2backup');

    check('pushing the way back reports failure',
        device.call('pushUndoState', device.State.schedule) === false);
    check('and the schedule on disk is untouched, because nothing was replaced',
        device.raw('scheduleData:v2') === before);
}

{
    suite('each critical write, failed one at a time');

    // Every one of these has to be survivable on its own, because on a real device that
    // is how it happens - one key too big for the space that is left, not the whole disk
    // vanishing at once.
    // The expected outcome differs by key, and saying so is the point:
    //   the schedule    - the journal carries the edit, so it stands
    //   the journal     - the edit is REFUSED, because nothing could re-apply it
    //   the replacement - unrelated to an ordinary edit, which stands
    const cases = [
        { key: 'scheduleData:v2', stands: true },
        { key: 'farkad:outbox', stands: false },
        { key: 'farkad:pendingReplace', stands: true }
    ];

    for (const { key: failing, stands } of cases) {
        const device = makeDevice();
        const cloud = makeCloud();
        seed(device);
        device.setQuota(key => key === failing);

        let threw = null;
        let committed = null;
        try {
            await connected(device, cloud);
            committed = record(device, '2026-08-12', 'w_01', 'p_01');
            await wait();
            await device.Sync.replaceAll(device.State.schedule).catch(() => {});
            await wait();
        } catch (error) {
            threw = String(error && error.message);
        }

        check(`the app survives ${failing} failing`, threw === null, String(threw));
        check(`the edit ${stands ? 'stands' : 'is refused'} with ${failing} failing`,
            committed === stands, String(committed));

        const onScreen = device.call('entriesFor',
            device.State.schedule, '2026-08-12', 'w_01', 'actual').length;
        check(`and the screen agrees with ${failing} failing`,
            onScreen === (stands ? 1 : 0), String(onScreen));

        // The only measure that counts.
        const reopened = makeDevice({ storage: device.dump() });
        reopened.State.load();
        const afterClose = reopened.call('entriesFor',
            reopened.State.schedule, '2026-08-12', 'w_01', 'actual').length;
        check(`and so does a reopen with ${failing} failing`,
            afterClose === (stands ? 1 : 0), String(afterClose));
    }
}

{
    suite('closing the app between two writes loses nothing that was confirmed');

    // The order is: write the way back, confirm it, then replace. A close between any two
    // steps has to leave something readable - which is only true if the confirmation
    // comes before the replacement, not after.
    const device = makeDevice();
    seed(device);
    device.call('assignPlace', device.State.schedule, '2026-08-12', 'w_01', 'actual', 'p_01');
    device.State.save({ silent: true });

    check('the way back is written and confirmed',
        device.call('pushUndoState', device.State.schedule) === true);

    // The app dies here, before the replacement is written.
    const reopened = makeDevice({ storage: device.dump() });
    reopened.State.load();
    check('and after a restart the original is still the one on disk',
        reopened.call('entriesFor', reopened.State.schedule, '2026-08-12', 'w_01', 'actual').length === 1);
    check('with the way back still there beside it',
        reopened.call('popUndoState') !== null);
}

// ---------------------------------------------------------------- what survives a close
//
// The only question that counts. "The data is still readable in this session" is not an
// answer: the app is closed and reopened every day, and an edit that lives in memory is
// an edit that was never made.
{
    suite('G6: schedule and journal both refused - the edit is refused too');

    const device = makeDevice();
    seed(device);
    const before = device.raw('scheduleData:v2');
    given('there is a good schedule on disk to start from', Boolean(before));

    // Nothing durable is available. Neither the record nor the journal can be written.
    device.setQuota(key => key === 'scheduleData:v2' || key.startsWith('farkad:outbox'));

    const done = record(device, '2026-08-12', 'w_01', 'p_01');

    check('the commit reports that it did not happen', done === false, String(done));
    check('the schedule on disk is untouched',
        device.raw('scheduleData:v2') === before);
    check('and nothing was journalled either',
        device.raw('farkad:outbox') === null);
    check('the screen was put back to what is actually stored',
        device.call('entriesFor', device.State.schedule, '2026-08-12', 'w_01', 'actual').length === 0,
        JSON.stringify(device.call('entriesFor', device.State.schedule, '2026-08-12', 'w_01', 'actual')));

    const reopened = makeDevice({ storage: device.dump() });
    reopened.State.load();
    check('and after closing and reopening there is nothing half-there',
        reopened.call('entriesFor', reopened.State.schedule, '2026-08-12', 'w_01', 'actual').length === 0);
}

{
    suite('G6: schedule refused, journal written - the edit comes back at boot');

    const device = makeDevice();
    seed(device);
    // The record cannot be written, but the journal can. That is enough: the edit is
    // recoverable without any cloud at all.
    device.setQuota(key => key === 'scheduleData:v2');

    const done = record(device, '2026-08-12', 'w_01', 'p_01');
    check('the commit reports success, because something durable holds it', done === true);
    check('and the journal is what holds it',
        (device.raw('farkad:outbox') || '').includes('2026-08-12'));

    // No cloud anywhere. The journal has to rebuild the edit by itself.
    const reopened = makeDevice({ storage: device.dump() });
    reopened.State.load();
    check('reopening with no cloud rebuilds the edit from the journal',
        reopened.call('entriesFor', reopened.State.schedule, '2026-08-12', 'w_01', 'actual').length === 1,
        JSON.stringify(Object.keys(reopened.State.schedule.days || {})));
}

{
    suite('G6: the journal is the gate, so nothing lands that cannot be re-applied');

    // The journal is one field; the schedule is the whole record. If only one of them
    // fits it is the journal, so making it the gate costs nothing real - and it buys the
    // guarantee that every committed edit can be put back on top of an arriving snapshot.
    const device = makeDevice();
    seed(device);
    const before = device.raw('scheduleData:v2');
    device.setQuota(key => key.startsWith('farkad:outbox'));

    const done = record(device, '2026-08-12', 'w_01', 'p_01');
    check('the commit is refused when only the journal fails', done === false, String(done));
    check('and the schedule was NOT written, so the disk did not get ahead of the screen',
        device.raw('scheduleData:v2') === before);
    check('the screen shows what the device can actually produce again',
        device.call('entriesFor', device.State.schedule, '2026-08-12', 'w_01', 'actual').length === 0);
}

{
    suite('G6: an older cloud snapshot cannot take today off the device');

    // The failure this closes: an edit on the disk that nothing would ever send and
    // nothing could re-apply. Every committed edit is journalled now, so reapplyPending
    // always has it.
    const device = makeDevice();
    seed(device);
    record(device, '2026-08-12', 'w_01', 'p_01');

    const disk = device.dump();
    const cloud = makeCloud({
        doc: {
            schemaVersion: 2,
            workers: device.State.schedule.workers, places: device.State.schedule.places,
            days: {}, advances: {},
            updatedAt: '2026-08-01T06:00:00.000Z', updatedBy: 'd_other'
        }
    });

    const again = makeDevice({ storage: disk });
    again.State.load();
    await connected(again, cloud);
    await settle(TICK * 20);

    check('the day recorded here is still on the device',
        again.call('entriesFor', again.State.schedule, '2026-08-12', 'w_01', 'actual').length === 1,
        JSON.stringify(Object.keys(again.State.schedule.days || {})));
    check('and it reached the cloud rather than sitting there unsendable',
        Boolean(cloud.doc.days && cloud.doc.days['2026-08-12']),
        JSON.stringify(Object.keys(cloud.doc.days || {})));
}

{
    suite('G6: a browser that refuses storage entirely still records');

    // Safari in private mode. Nothing survives a refresh, and the app says so in a
    // permanent banner - so an edit accepted here is not being passed off as saved, and
    // refusing every edit would protect nothing while making the app useless.
    const device = makeDevice();
    seed(device);
    device.Store.available = false;

    check('the edit is accepted', record(device, '2026-08-12', 'w_01', 'p_01') === true);
    check('and the app is saying storage is blocked',
        device.Store.available === false);
}

{
    suite('G6: a roster change that cannot be stored is not shown as made');

    const device = makeDevice();
    seed(device);
    const before = device.raw('scheduleData:v2');
    device.setQuota(() => true);

    device.State.schedule.workers.push({ id: 'w_zz', name: 'לא נשמר', active: true });
    const done = device.State.commitRoster();

    check('commitRoster says it did not happen', done === false, String(done));
    check('the stored roster is untouched', device.raw('scheduleData:v2') === before);
    check('and the screen no longer shows the worker either',
        !device.State.worker('w_zz'),
        JSON.stringify(device.State.schedule.workers.map(w => w.id)));

    const reopened = makeDevice({ storage: device.dump() });
    reopened.State.load();
    check('nor does it after a reopen', !reopened.State.worker('w_zz'));
}

{
    suite('G6: a bulk copy that cannot be stored offers no undo and no success');

    const device = makeDevice();
    seed(device);
    const before = device.raw('scheduleData:v2');
    device.setQuota(() => true);

    const changes = ['w_01', 'w_02'].map(id =>
        device.call('assignPlace', device.State.schedule, '2026-08-12', id, 'actual', 'p_01'));
    const done = device.State.commitMany(changes);

    check('commitMany says it did not happen', done === false, String(done));
    check('the stored schedule is untouched', device.raw('scheduleData:v2') === before);
    check('and neither day is on screen',
        device.call('entriesFor', device.State.schedule, '2026-08-12', 'w_01', 'actual').length === 0
        && device.call('entriesFor', device.State.schedule, '2026-08-12', 'w_02', 'actual').length === 0);
}

{
    suite('G6: a failed save does not tell the sync layer anything happened');

    const device = makeDevice();
    const cloud = makeCloud();
    seed(device);
    await connected(device, cloud);
    await wait();

    const writesBefore = cloud.writes.length;
    device.setQuota(() => true);
    device.State.save();
    await wait();

    check('onLocalChange was not called, so no stamp went out alone',
        cloud.writes.length === writesBefore,
        `${writesBefore} -> ${cloud.writes.length}`);
}

{
    suite('G7: a snapshot that could not be stored is not adopted');

    const device = makeDevice({ deviceId: 'd_here' });
    device.State.schedule.workers = [
        { id: 'w_old', name: 'ותיק', active: true, dailyRate: 400, hourlyRate: 0 }
    ];
    device.State.schedule.places = [{ id: 'p_01', name: 'הרצליה', active: true }];
    given('the old roster is on disk', device.State.save({ silent: true }) === true);

    const cloud = makeCloud({
        doc: {
            schemaVersion: 2,
            workers: [{ id: 'w_new', name: 'חדש', active: true, dailyRate: 400, hourlyRate: 0 }],
            places: [{ id: 'p_01', name: 'הרצליה', active: true }],
            days: {}, advances: {},
            updatedAt: '2026-08-20T18:00:00.000Z', updatedBy: 'd_other'
        }
    });

    // No room to write the adopted state. Showing it and calling the app synced would
    // leave the screen and the disk describing two different crews.
    device.setQuota(key => key === 'scheduleData:v2');
    await connected(device, cloud);
    await settle(TICK * 20);

    check('the status does not say synced',
        device.Sync.status !== 'synced', device.Sync.status);
    check('the screen still shows what is actually stored',
        device.State.schedule.workers.map(w => w.id).join() === 'w_old',
        JSON.stringify(device.State.schedule.workers.map(w => w.id)));
    check('and the disk still holds the old roster',
        (device.raw('scheduleData:v2') || '').includes('w_old'));

    // The measure that counts.
    const reopened = makeDevice({ storage: device.dump() });
    reopened.State.load();
    check('a reopen shows the same thing the screen did, not a different crew',
        reopened.State.schedule.workers.map(w => w.id).join() === 'w_old',
        JSON.stringify(reopened.State.schedule.workers.map(w => w.id)));
}

{
    suite('G7: once there is room, the snapshot is adopted after all');

    const device = makeDevice({ deviceId: 'd_here' });
    device.State.schedule.workers = [{ id: 'w_old', name: 'ותיק', active: true, dailyRate: 400 }];
    device.State.schedule.places = [{ id: 'p_01', name: 'הרצליה', active: true }];
    device.State.save({ silent: true });

    const cloud = makeCloud({
        doc: {
            schemaVersion: 2,
            workers: [{ id: 'w_new', name: 'חדש', active: true, dailyRate: 400, hourlyRate: 0 }],
            places: [{ id: 'p_01', name: 'הרצליה', active: true }],
            days: {}, advances: {},
            updatedAt: '2026-08-20T18:00:00.000Z', updatedBy: 'd_other'
        }
    });

    device.setQuota(key => key === 'scheduleData:v2');
    await connected(device, cloud);
    await settle(TICK * 15);
    given('it was refused first', device.Sync.status !== 'synced');

    // Space is freed and the cloud says something again.
    device.setQuota(null);
    device.Sync.receive(JSON.parse(JSON.stringify(cloud.doc)));
    await settle(TICK * 10);

    check('now it is adopted', device.State.schedule.workers.map(w => w.id).join() === 'w_new',
        JSON.stringify(device.State.schedule.workers.map(w => w.id)));
    check('and stored', (device.raw('scheduleData:v2') || '').includes('w_new'));
    check('and the status says synced', device.Sync.status === 'synced', device.Sync.status);
}

{
    suite('G8: a restore whose new state cannot be stored does not happen');

    // The undo write SUCCEEDS here. Only the new state fails - which is the case the
    // previous round did not cover, having tested the undo write failing instead.
    function stagedDevice() {
        const device = makeDevice();
        seed(device);
        device.call('assignPlace', device.State.schedule, '2026-08-12', 'w_01', 'actual', 'p_01');
        device.State.save({ silent: true });

        // A restore point to come back to.
        device.setToday('2026-08-13');
        device.call('takeDailySnapshot');
        return device;
    }

    const device = stagedDevice();
    const originalDisk = device.raw('scheduleData:v2');
    const originalDays = Object.keys(device.State.schedule.days).join();

    // Let the undo copies through, refuse the record itself.
    let armed = false;
    device.setQuota(key => armed && key === 'scheduleData:v2');

    const restoredInto = device.call('normaliseSchedule', {
        schemaVersion: 2, workers: device.State.schedule.workers,
        places: device.State.schedule.places,
        days: { '2026-01-01': { plan: {}, actual: {} } }, advances: {},
        updatedAt: '2026-01-01T06:00:00.000Z', updatedBy: 'd_backup'
    });

    check('the way back can be written', device.call('pushUndoState', device.State.schedule) === true);

    // Now the restore itself: replace memory and try to store it.
    armed = true;
    const previous = device.State.schedule;
    device.State.schedule = restoredInto;
    const stored = device.State.save();

    check('storing the restored state fails', stored === false);
    // What the app must now do - and what the fixed restore paths do.
    device.State.schedule = previous;

    check('the record on disk is exactly as it was',
        device.raw('scheduleData:v2') === originalDisk);
    check('and the days are the ones that were there before',
        Object.keys(device.State.schedule.days).join() === originalDays);

    const reopened = makeDevice({ storage: device.dump() });
    reopened.State.load();
    check('a reopen shows the original, not a half-finished restore',
        Object.keys(reopened.State.schedule.days).join() === originalDays,
        JSON.stringify(Object.keys(reopened.State.schedule.days)));
}

{
    suite('G8: and it does not reach the cloud, or clear the queue');

    const device = makeDevice();
    const cloud = makeCloud();
    seed(device);
    await connected(device, cloud);
    record(device, '2026-08-12', 'w_01', 'p_01');
    await wait();

    // Something queued and not yet sent.
    cloud.online = false;
    record(device, '2026-08-13', 'w_02', 'p_01');
    await wait();
    const queuedBefore = device.Sync.pendingCount();
    given('there is something in the queue', queuedBefore > 0);

    const cloudDaysBefore = Object.keys(cloud.doc.days || {}).join();
    cloud.online = true;
    device.setQuota(key => key === 'scheduleData:v2');

    // A restore attempt whose local write cannot land.
    device.State.schedule = device.call('normaliseSchedule', {
        schemaVersion: 2, workers: device.State.schedule.workers,
        places: device.State.schedule.places, days: {}, advances: {},
        updatedAt: '2026-01-01T06:00:00.000Z', updatedBy: 'd_backup'
    });
    const stored = device.State.save();
    check('the local write fails', stored === false);

    // The rule: do not send what could not be stored here.
    check('nothing new was pushed to the cloud',
        Object.keys(cloud.doc.days || {}).join() === cloudDaysBefore,
        JSON.stringify(Object.keys(cloud.doc.days || {})));
    check('and the queue was not cleared',
        device.Sync.pendingCount() === queuedBefore,
        `${queuedBefore} -> ${device.Sync.pendingCount()}`);
}

{
    suite('G9: after a damaged queue, recording resumes on a queue that is real');

    // The brief's scenario, run end to end.
    // 1. a damaged queue
    const broken = '{"seq":7,"items":{"days.2026-08-01.actual.w_01":{"value":{"entr';
    const device = makeDevice({ storage: { 'farkad:outbox': broken } });
    seed(device);

    // 2. quarantine succeeds
    check('the raw queue was copied aside',
        device.raw('farkad:outbox:damaged') === broken);
    check('and the original is untouched',
        device.raw('farkad:outbox') === broken);

    // 3. the person acknowledges and carries on
    check('acknowledging resumes recording',
        device.global('Recovery').acknowledge() === true);

    // 4. a new day is recorded
    const committed = record(device, '2026-08-12', 'w_01', 'p_01');
    check('the new day is accepted', committed === true, String(committed));
    check('and it went into a NEW queue, not over the damaged one',
        device.raw('farkad:outbox') === broken
        && (device.raw('farkad:outbox:active1') || '').includes('2026-08-12'),
        JSON.stringify({
            original: (device.raw('farkad:outbox') || '').slice(0, 20),
            active: (device.raw('farkad:outbox:active1') || '').slice(0, 40)
        }));

    // 5-6. closed and reopened
    const disk = device.dump();
    const cloud = makeCloud({
        doc: {
            schemaVersion: 2,
            workers: device.State.schedule.workers, places: device.State.schedule.places,
            days: {}, advances: {},
            updatedAt: '2026-08-01T06:00:00.000Z', updatedBy: 'd_other'
        }
    });
    const again = makeDevice({ storage: disk });
    again.State.load();

    check('the new day is still there after a reopen',
        again.call('entriesFor', again.State.schedule, '2026-08-12', 'w_01', 'actual').length === 1,
        JSON.stringify(Object.keys(again.State.schedule.days || {})));

    // 7. an older cloud snapshot arrives
    again.global('Recovery').acknowledge();
    await connected(again, cloud);
    await settle(TICK * 25);

    // 8. it survives
    check('and an older cloud snapshot does not take it away',
        again.call('entriesFor', again.State.schedule, '2026-08-12', 'w_01', 'actual').length === 1,
        JSON.stringify(Object.keys(again.State.schedule.days || {})));
    check('it reached the cloud, so the other phones have it too',
        Boolean(cloud.doc.days && cloud.doc.days['2026-08-12']),
        JSON.stringify(Object.keys(cloud.doc.days || {})));
    check('and the damaged original is STILL exactly where it was',
        again.raw('farkad:outbox') === broken);
}

{
    suite('G9: with nowhere to put a new queue, recording is refused');

    // Damaged queue, and no room for a replacement either. There is no safe way to
    // record: the edit could not be re-applied and could not be sent.
    const broken = '{"seq":7,"items":{"days.2026-08-01.actual.w_01":{"value":{"entr';
    const device = makeDevice({
        storage: { 'farkad:outbox': broken },
        quota: () => true
    });
    seed(device);

    check('writing is blocked and cannot be acknowledged away',
        device.global('Recovery').acknowledge() === false
        && device.call('farkadWritesBlocked') === true);
    check('and an edit is refused rather than held in memory',
        record(device, '2026-08-12', 'w_01', 'p_01') === false);
    check('with the damaged original untouched',
        device.raw('farkad:outbox') === broken);
}

{
    suite('G9: the recovery export carries the live state too, not only the wreckage');

    const broken = '{"seq":7,"items":{"days.2026-08-01.actual.w_01":{"value":{"entr';
    const device = makeDevice({ storage: { 'farkad:outbox': broken } });
    seed(device);
    device.global('Recovery').acknowledge();
    record(device, '2026-08-12', 'w_01', 'p_01');

    const held = device.global('Recovery').rawRecords();
    check('the damaged queue is in it', held['farkad:outbox'] === broken);
    check('the quarantined copy is in it', held['farkad:outbox:damaged'] === broken);
    check('the schedule as it stands is in it',
        typeof held['scheduleData:v2'] === 'string'
        && held['scheduleData:v2'].includes('2026-08-12'),
        JSON.stringify(Object.keys(held)));
    check('and so is the queue that is actually live',
        typeof held['farkad:outbox:active1'] === 'string'
        && held['farkad:outbox:active1'].includes('2026-08-12'),
        JSON.stringify(Object.keys(held)));
}

report();
