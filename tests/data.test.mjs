// The data suite: storage, sync, and the arithmetic that turns days into money.
//
//   node tests/data.test.mjs
//
// No browser. Each "device" is a V8 context with its own localStorage holding its own
// Store, State and FarkadSync - so two devices editing at once, and a device closed and
// reopened against a cloud that is behind, are both things a test can simply say.

import { makeDevice, makeCloud, settle, deferred } from './harness.mjs';
import { suite, check, same, given, report } from './runner.mjs';

// Real time, kept short. The sync layer debounces before it sends, and a test that does
// not wait past the debounce is testing the debounce.
const TICK = 6;
const wait = () => settle(TICK * 5);

// One phone off the network while the other stays on it. cloud.online is the whole
// cloud, which is a different situation entirely - every write carries updatedBy, so the
// device that made it is on the request.
function offlineFor(cloud, deviceId) {
    cloud.reject = (kind, payload) => {
        const from = payload && (payload.updatedBy
            || (payload.data && payload.data.updatedBy));
        if (from !== deviceId) return null;
        const error = new Error('client is offline');
        error.code = 'unavailable';
        return error;
    };
}

// A phone with no network. Neither of the two obvious spellings is that: cloud.online
// takes the WHOLE cloud down, and Sync.disconnect() is the app signing out - it leaves
// the subscription running, so snapshots keep arriving at a phone that is supposed to be
// in somebody's pocket underground. An outage is both directions stopping at once.
async function unplugged(device, cloud) {
    const before = cloud.subscribers.length;
    await connected(device, cloud);
    const mine = cloud.subscribers.slice(before);

    return {
        away() {
            cloud.subscribers = cloud.subscribers.filter(fn => !mine.includes(fn));
            offlineFor(cloud, device.id);
        },
        async back() {
            cloud.reject = null;
            mine.forEach(fn => cloud.subscribers.push(fn));
            // Firestore hands a subscriber the current document when it comes back.
            mine.forEach(fn => fn(JSON.parse(JSON.stringify(cloud.doc))));
            device.Sync.flush();
            await settle(TICK * 40);
        }
    };
}

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
        reopened.call('peekUndoState') !== null);
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

// ---------------------------------------------------------------- G10: all or nothing
{
    suite('G10: a bulk journal write is one write, not a chain of them');

    // The queue is rewritten whole on every entry, so a chain of them means each write is
    // larger than the last. Fail on SIZE rather than on the key: that is how a real disk
    // runs out, and it is what makes the second write the one that fails.
    const device = makeDevice();
    seed(device);
    const before = device.raw('scheduleData:v2');

    const baseline = (device.raw('farkad:outbox') || '').length;
    device.setQuota((key, value) =>
        key.startsWith('farkad:outbox') && value.length > baseline + 220);

    const changes = ['w_01', 'w_02'].map(id =>
        device.call('assignPlace', device.State.schedule, '2026-08-12', id, 'actual', 'p_01'));
    const done = device.State.commitMany(changes);

    check('the bulk operation reports that it did not happen', done === false, String(done));
    check('neither worker is on screen',
        device.call('entriesFor', device.State.schedule, '2026-08-12', 'w_01', 'actual').length === 0
        && device.call('entriesFor', device.State.schedule, '2026-08-12', 'w_02', 'actual').length === 0,
        JSON.stringify([
            device.call('entriesFor', device.State.schedule, '2026-08-12', 'w_01', 'actual').length,
            device.call('entriesFor', device.State.schedule, '2026-08-12', 'w_02', 'actual').length
        ]));
    check('the schedule on disk is untouched', device.raw('scheduleData:v2') === before);
    check('and NEITHER worker is in the journal on disk',
        !(device.raw('farkad:outbox') || '').includes('2026-08-12'),
        (device.raw('farkad:outbox') || '').slice(0, 120));

    // The measure that counts, and the one that caught this.
    const reopened = makeDevice({ storage: device.dump() });
    reopened.State.load();
    check('after closing and reopening, neither half is there',
        reopened.call('entriesFor', reopened.State.schedule, '2026-08-12', 'w_01', 'actual').length === 0
        && reopened.call('entriesFor', reopened.State.schedule, '2026-08-12', 'w_02', 'actual').length === 0,
        JSON.stringify(Object.keys(reopened.State.schedule.days || {})));
}

{
    suite('G10: room for some of the batch is not room for the batch');

    // There is no "middle write" any more - that is the point of the fix - so the case
    // becomes: enough room for part of what is being recorded, and not for all of it.
    // Under the old chain that left a prefix on the disk. Now the one write is refused.
    const device = makeDevice();
    seed(device);
    const baseline = (device.raw('farkad:outbox') || '').length;
    device.setQuota((key, value) =>
        key.startsWith('farkad:outbox') && value.length > baseline + 250);

    const changes = ['w_01', 'w_02', 'w_03'].map(id =>
        device.call('assignPlace', device.State.schedule, '2026-08-12', id, 'actual', 'p_01'));
    check('the batch is refused', device.State.commitMany(changes) === false);
    check('and none of the three reached the disk',
        !(device.raw('farkad:outbox') || '').includes('2026-08-12'),
        (device.raw('farkad:outbox') || '').slice(0, 140));

    const reopened = makeDevice({ storage: device.dump() });
    reopened.State.load();
    check('nor are any of them there after a reopen',
        Object.keys(reopened.State.schedule.days || {}).length === 0,
        JSON.stringify(Object.keys(reopened.State.schedule.days || {})));
}

{
    suite('G10: a roster change is one batch too');

    // editRoster writes one path per person plus the order plus the legacy array - the
    // longest chain of queue() calls in the app, and the one where a partial result is
    // hardest to see: a worker present but missing from the order, or the other way round.
    const device = makeDevice();
    seed(device);
    const before = device.raw('scheduleData:v2');
    const baseline = (device.raw('farkad:outbox') || '').length;
    device.setQuota((key, value) =>
        key.startsWith('farkad:outbox') && value.length > baseline + 400);

    device.State.schedule.workers.push({ id: 'w_zz', name: 'חדש', active: true, dailyRate: 300 });
    device.State.schedule.workers.reverse();
    const done = device.State.commitRoster();

    check('the roster change is refused', done === false, String(done));
    check('the new worker is not on screen', !device.State.worker('w_zz'),
        JSON.stringify(device.State.schedule.workers.map(w => w.id)));
    check('the schedule on disk is untouched', device.raw('scheduleData:v2') === before);
    check('and no half-roster reached the journal',
        !(device.raw('farkad:outbox') || '').includes('w_zz'),
        (device.raw('farkad:outbox') || '').slice(0, 140));

    const reopened = makeDevice({ storage: device.dump() });
    reopened.State.load();
    check('and the worker is not there after a reopen', !reopened.State.worker('w_zz'),
        JSON.stringify(reopened.State.schedule.workers.map(w => w.id)));
}

{
    suite('G10: a batch that fits lands whole');

    const device = makeDevice();
    seed(device);
    const changes = ['w_01', 'w_02', 'w_03'].map(id =>
        device.call('assignPlace', device.State.schedule, '2026-08-12', id, 'actual', 'p_01'));
    check('it is accepted', device.State.commitMany(changes) === true);

    const reopened = makeDevice({ storage: device.dump() });
    reopened.State.load();
    check('and all three are there after a reopen',
        ['w_01', 'w_02', 'w_03'].every(id =>
            reopened.call('entriesFor', reopened.State.schedule, '2026-08-12', id, 'actual').length === 1));
}

{
    suite('G10: the same path twice in one batch keeps the later value');

    const device = makeDevice();
    seed(device);
    const path = 'days.2026-08-12.actual.w_01';
    check('a batch with a repeated path is accepted',
        device.Sync.queueBatch([
            { path, value: { entries: [{ placeId: 'p_01' }] } },
            { path, value: { entries: [{ placeId: 'p_02' }] } }
        ]) === true);

    const stored = JSON.parse(device.raw('farkad:outbox')).items[path];
    check('and the value that survives is the later one',
        stored.value.entries[0].placeId === 'p_02', JSON.stringify(stored.value));
    check('with one entry, not two',
        Object.keys(JSON.parse(device.raw('farkad:outbox')).items).length === 1);
}

// ---------------------------------------------------------------- G11: slots
{
    suite('G11: every slot damaged, and plenty of room to quarantine them');

    // No quota fault here on purpose. The device has space; what it does not have is a
    // readable queue anywhere. The old scan left _activeKey pointing at the LAST damaged
    // slot and then wrote the new journal straight over it.
    const raw = {};
    ['farkad:outbox', 'farkad:outbox:active1', 'farkad:outbox:active2',
     'farkad:outbox:active3', 'farkad:outbox:active4'].forEach((key, i) => {
        raw[key] = `{"seq":${i + 1},"items":{"days.2026-0${i + 1}-01.actual.w_01":{"value":{"ent`;
    });

    const device = makeDevice({ storage: Object.assign({}, raw) });
    seed(device);

    check('all five were noticed',
        device.global('Recovery').problems.length >= 5,
        String(device.global('Recovery').problems.length));
    check('and all five were quarantined, since there was room',
        Object.keys(raw).every(key => device.raw(key + ':damaged') === raw[key]));

    const resumed = device.global('Recovery').acknowledge();
    const committed = record(device, '2026-08-12', 'w_01', 'p_01');

    // Either outcome is acceptable. What is not acceptable is writing over the wreckage.
    check('recording either moved to a safe slot or was refused, not written over damage',
        (committed === true && !Object.keys(raw).includes(device.Sync.activeOutboxKey()))
        || committed === false,
        JSON.stringify({ resumed, committed, active: device.Sync.activeOutboxKey() }));

    check('and all five originals are byte-for-byte what they were',
        Object.keys(raw).every(key => device.raw(key) === raw[key]),
        JSON.stringify(Object.keys(raw).filter(key => device.raw(key) !== raw[key])));

    // After a close and reopen, still true.
    const reopened = makeDevice({ storage: device.dump() });
    reopened.State.load();
    check('still true after closing and reopening',
        Object.keys(raw).every(key => reopened.raw(key) === raw[key]),
        JSON.stringify(Object.keys(raw).filter(key => reopened.raw(key) !== raw[key])));
}

{
    suite('G11: when no safe slot can be had at all, recording is refused');

    // Every slot the app will ever try, damaged. There is nowhere to put a journal, so
    // there is no way to record anything that could be re-applied.
    const storage = {};
    const keys = ['farkad:outbox'];
    for (let i = 1; i <= 24; i += 1) keys.push('farkad:outbox:active' + i);
    keys.forEach((key, i) => { storage[key] = `{"seq":${i},"items":{"broken`; });

    const device = makeDevice({ storage: Object.assign({}, storage) });
    seed(device);

    check('there is no active slot',
        device.Sync.activeOutboxKey() === null, String(device.Sync.activeOutboxKey()));
    check('the queue refuses to write rather than choosing a damaged key',
        device.Sync.saveOutbox() === false);
    check('acknowledging does not open recording',
        device.global('Recovery').acknowledge() === false
        && device.call('farkadWritesBlocked') === true);
    check('and an edit is refused',
        record(device, '2026-08-12', 'w_01', 'p_01') === false);
    check('with every original untouched',
        keys.every(key => device.raw(key) === storage[key]),
        JSON.stringify(keys.filter(key => device.raw(key) !== storage[key])));
}

// ---------------------------------------------------------------- G12: the restore
{
    suite('G12: a restore whose pending record cannot be written never starts');

    const device = makeDevice();
    const cloud = makeCloud();
    seed(device);
    await connected(device, cloud);
    record(device, '2026-08-12', 'w_01', 'p_01');
    await wait();

    const cloudCallsBefore = cloud.attempts.filter(a => a.kind === 'save').length;
    const restored = device.call('normaliseSchedule', {
        schemaVersion: 2, workers: device.State.schedule.workers,
        places: device.State.schedule.places,
        days: { '2026-08-01': { plan: {}, actual: {} } }, advances: {},
        updatedAt: '2026-08-01T06:00:00.000Z', updatedBy: 'd_backup'
    });

    device.setQuota(key => key === 'farkad:pendingReplace');
    const prepared = device.Sync.prepareReplace(restored);

    check('preparing the restore reports failure', prepared === false, String(prepared));
    check('and nothing was written for it',
        device.raw('farkad:pendingReplace') === null);
    check('the cloud was never asked to save',
        cloud.attempts.filter(a => a.kind === 'save').length === cloudCallsBefore,
        `${cloudCallsBefore} -> ${cloud.attempts.filter(a => a.kind === 'save').length}`);
    check('the day recorded here is still on screen',
        device.call('entriesFor', device.State.schedule, '2026-08-12', 'w_01', 'actual').length === 1);

    // Close, reopen, and an older snapshot arrives. Nothing should have half-happened.
    const reopened = makeDevice({ storage: device.dump() });
    reopened.State.load();
    check('and still there after a reopen',
        reopened.call('entriesFor', reopened.State.schedule, '2026-08-12', 'w_01', 'actual').length === 1,
        JSON.stringify(Object.keys(reopened.State.schedule.days || {})));
    check('with no pending restore claiming to be waiting',
        reopened.Sync.pendingReplace() === null);
}

{
    suite('G12: pending written, local save fails - the prepared record is cancelled');

    const device = makeDevice();
    const cloud = makeCloud();
    seed(device);
    await connected(device, cloud);
    record(device, '2026-08-12', 'w_01', 'p_01');
    await wait();

    const cloudCallsBefore = cloud.attempts.filter(a => a.kind === 'save').length;
    const previous = device.State.schedule;
    const restored = device.call('normaliseSchedule', {
        schemaVersion: 2, workers: device.State.schedule.workers,
        places: device.State.schedule.places,
        days: { '2026-08-01': { plan: {}, actual: {} } }, advances: {},
        updatedAt: '2026-08-01T06:00:00.000Z', updatedBy: 'd_backup'
    });

    check('the pending record is written first', device.Sync.prepareReplace(restored) === true);
    check('and it is on the disk', typeof device.raw('farkad:pendingReplace') === 'string');

    // Now the local save fails.
    device.setQuota(key => key === 'scheduleData:v2');
    device.State.schedule = restored;
    check('the local save fails', device.State.save() === false);

    // What the restore path must do next.
    device.State.schedule = previous;
    device.Sync.cancelPreparedReplace();

    check('the prepared record is gone', device.raw('farkad:pendingReplace') === null);
    check('the cloud was never asked to save',
        cloud.attempts.filter(a => a.kind === 'save').length === cloudCallsBefore);

    const reopened = makeDevice({ storage: device.dump() });
    reopened.State.load();
    check('and a reopen knows about no restore at all',
        reopened.Sync.pendingReplace() === null);
    check('with the original day still there',
        reopened.call('entriesFor', reopened.State.schedule, '2026-08-12', 'w_01', 'actual').length === 1);
}

{
    suite('G12: pending and local both written, cloud fails - the record survives');

    const device = makeDevice();
    const cloud = makeCloud();
    seed(device);
    await connected(device, cloud);
    record(device, '2026-08-12', 'w_01', 'p_01');
    await wait();

    const restored = device.call('normaliseSchedule', {
        schemaVersion: 2, workers: device.State.schedule.workers,
        places: device.State.schedule.places,
        days: { '2026-07-01': { plan: {}, actual: {} } }, advances: {},
        updatedAt: '2026-07-01T06:00:00.000Z', updatedBy: 'd_backup'
    });

    check('prepared', device.Sync.prepareReplace(restored) === true);
    device.State.schedule = restored;
    check('and stored locally', device.State.save() === true);

    cloud.online = false;
    let rejected = false;
    await device.Sync.executePreparedReplace().catch(() => { rejected = true; });
    check('the cloud send is reported as failed', rejected === true);
    check('and the pending record is still on the disk',
        typeof device.raw('farkad:pendingReplace') === 'string');

    // Closed, reopened, and an OLDER snapshot turns up.
    const disk = device.dump();
    const again = makeDevice({ storage: disk });
    again.State.load();
    check('a reopen knows a restore is still waiting',
        again.Sync.pendingReplace() !== null);

    cloud.online = true;
    again.Sync.pushDelayMs = TICK;
    again.Sync.connect(cloud.adapter);
    await settle(TICK * 30);

    check('the restore is what the cloud ends up holding',
        Object.keys(cloud.doc.days || {}).join() === '2026-07-01',
        JSON.stringify(Object.keys(cloud.doc.days || {})));
    check('the restored state is what is on screen',
        Object.keys(again.State.schedule.days || {}).join() === '2026-07-01',
        JSON.stringify(Object.keys(again.State.schedule.days || {})));
    check('and nothing is left pending', again.Sync.pendingReplace() === null);
}

{
    suite('G12: a restore is not attempted at all when nothing can be written down');

    // Safari private mode. An ordinary edit is allowed there - the app says plainly that
    // nothing survives - but a whole-document restore changes every device, and doing that
    // with no durable retry record is not the same bargain at all.
    const device = makeDevice();
    const cloud = makeCloud();
    seed(device);
    await connected(device, cloud);
    await wait();

    device.Store.available = false;
    const cloudCallsBefore = cloud.attempts.filter(a => a.kind === 'save').length;

    check('an ordinary edit is still accepted',
        record(device, '2026-08-12', 'w_01', 'p_01') === true);
    check('but a restore is refused',
        device.Sync.prepareReplace(device.State.schedule) === false);
    check('and the cloud was never asked',
        cloud.attempts.filter(a => a.kind === 'save').length === cloudCallsBefore);
}

// ---------------------------------------------------------------- G13: the transaction
//
// Everything below is measured after a CLOSE AND REOPEN. A restore that is only true in
// the session that performed it is not a restore.

// The state a restore is trying to reach, and the state it is leaving.
function restoreFixture() {
    const device = makeDevice({ deviceId: 'd_here' });
    seed(device);
    device.State.commit(device.call('assignPlace',
        device.State.schedule, '2026-08-12', 'w_01', 'actual', 'p_01'));

    const restored = device.call('normaliseSchedule', {
        schemaVersion: 2,
        workers: device.State.schedule.workers,
        places: device.State.schedule.places,
        days: { '2026-07-01': { plan: {}, actual: { w_01: { entries: [{ placeId: 'p_01' }] } } } },
        advances: {},
        updatedAt: '2026-07-01T06:00:00.000Z', updatedBy: 'd_backup'
    });
    return { device, restored };
}

function olderCloud(device) {
    return makeCloud({
        doc: {
            schemaVersion: 2,
            workers: device.State.schedule.workers, places: device.State.schedule.places,
            days: { '2026-01-01': { plan: {}, actual: {} } }, advances: {},
            updatedAt: '2026-01-01T06:00:00.000Z', updatedBy: 'd_other'
        }
    });
}

const dayKeys = schedule => Object.keys(schedule.days || {}).sort().join();
const diskDays = device => {
    const raw = device.raw('scheduleData:v2');
    return raw ? Object.keys(JSON.parse(raw).days || {}).sort().join() : null;
};

{
    suite('G13: crash after prepare, before the new state is in memory');

    // GPT's measurement, reproduced exactly: the cloud ends up holding the restore while
    // the device that asked for it still holds - and shows - the old schedule, with the
    // only record of the restore deleted and the status reading "synced".
    const { device, restored } = restoreFixture();
    check('the restore is prepared', device.Sync.prepareReplace(restored) === true);
    check('and the record is on the disk',
        typeof device.raw('farkad:pendingReplace') === 'string');

    // The app dies here. Nothing else happened.
    const disk = device.dump();
    check('the disk still holds the old schedule', (() => {
        const raw = JSON.parse(disk['scheduleData:v2']);
        return Object.keys(raw.days).join() === '2026-08-12';
    })());

    const again = makeDevice({ storage: disk, deviceId: 'd_here' });
    again.State.load();
    const cloud = olderCloud(again);
    check('and so does the reopened device before it connects',
        dayKeys(again.State.schedule) === '2026-08-12', dayKeys(again.State.schedule));

    await connected(again, cloud);
    await settle(TICK * 40);

    const measured = {
        cloudDays: Object.keys(cloud.doc.days || {}).sort().join(),
        screenDays: dayKeys(again.State.schedule),
        diskDays: diskDays(again),
        pending: again.Sync.pendingReplace() === null ? null : 'held',
        status: again.Sync.status
    };

    check('the cloud and this device do not disagree about what the schedule is',
        measured.cloudDays === measured.screenDays, JSON.stringify(measured));
    check('the screen and the disk agree',
        measured.screenDays === measured.diskDays, JSON.stringify(measured));
    check('and if anything reached the cloud, this device holds it too',
        measured.cloudDays !== '2026-07-01' || measured.diskDays === '2026-07-01',
        JSON.stringify(measured));
    check('the status is not "synced" while they differ',
        measured.status !== 'synced' || measured.cloudDays === measured.diskDays,
        JSON.stringify(measured));

    // And once more round: what survives a second close.
    const third = makeDevice({ storage: again.dump(), deviceId: 'd_here' });
    third.State.load();
    check('the restore survives another close and reopen',
        dayKeys(third.State.schedule) === measured.diskDays,
        `${dayKeys(third.State.schedule)} vs ${measured.diskDays}`);
}

{
    suite('G13: crash after memory changed, before the schedule was written');

    const { device, restored } = restoreFixture();
    given('prepared', device.Sync.prepareReplace(restored) === true);
    device.State.schedule = restored;                 // memory only; no save
    const disk = device.dump();

    const again = makeDevice({ storage: disk, deviceId: 'd_here' });
    again.State.load();
    const cloud = olderCloud(again);
    await connected(again, cloud);
    await settle(TICK * 40);

    check('the device ends up holding the restore on disk',
        diskDays(again) === '2026-07-01', String(diskDays(again)));
    check('the screen agrees with the disk',
        dayKeys(again.State.schedule) === diskDays(again),
        `${dayKeys(again.State.schedule)} vs ${diskDays(again)}`);
    check('and the cloud has the same thing',
        Object.keys(cloud.doc.days || {}).sort().join() === '2026-07-01',
        JSON.stringify(Object.keys(cloud.doc.days || {})));
    check('with nothing left pending', again.Sync.pendingReplace() === null);
}

{
    suite('G13: crash after the schedule landed, before the phase was updated');

    // The riskiest of the three, because the disk already agrees with the intended
    // replacement and the record still says it has not been applied. Resuming has to be
    // idempotent rather than clever.
    const { device, restored } = restoreFixture();
    given('prepared', device.Sync.prepareReplace(restored) === true);
    device.State.schedule = restored;
    given('and stored locally', device.State.save() === true);
    // The phase update never happened.
    const disk = device.dump();

    const again = makeDevice({ storage: disk, deviceId: 'd_here' });
    again.State.load();
    const cloud = olderCloud(again);
    await connected(again, cloud);
    await settle(TICK * 40);

    check('the disk still holds the restore', diskDays(again) === '2026-07-01',
        String(diskDays(again)));
    check('the screen agrees', dayKeys(again.State.schedule) === '2026-07-01',
        dayKeys(again.State.schedule));
    check('the cloud agrees',
        Object.keys(cloud.doc.days || {}).sort().join() === '2026-07-01',
        JSON.stringify(Object.keys(cloud.doc.days || {})));
    check('and nothing is pending', again.Sync.pendingReplace() === null);
}

{
    suite('G13: resuming with no room to store the schedule touches nothing');

    const { device, restored } = restoreFixture();
    given('prepared', device.Sync.prepareReplace(restored) === true);
    const disk = device.dump();

    const again = makeDevice({ storage: disk, deviceId: 'd_here', quota: key => key === 'scheduleData:v2' });
    again.State.load();
    const cloud = olderCloud(again);
    const before = Object.keys(cloud.doc.days || {}).sort().join();

    await connected(again, cloud);
    await settle(TICK * 40);

    check('the cloud was never written to',
        cloud.attempts.filter(a => a.kind === 'save').length === 0,
        String(cloud.attempts.filter(a => a.kind === 'save').length));
    check('the cloud document is untouched',
        Object.keys(cloud.doc.days || {}).sort().join() === before);
    check('the original schedule is still on the disk',
        diskDays(again) === '2026-08-12', String(diskDays(again)));
    check('and on the screen',
        dayKeys(again.State.schedule) === '2026-08-12', dayKeys(again.State.schedule));
    check('the pending transaction survives',
        again.Sync.pendingReplace() !== null);
    check('the status is not synced', again.Sync.status !== 'synced', again.Sync.status);
    check('and the queue was not cleared',
        again.Sync.pendingCount() > 0, String(again.Sync.pendingCount()));
}

{
    suite('G13: a v71 record, with no envelope around it, is recovered not deleted');

    // What v71 wrote: the raw cloud document, no version and no phase. It was written
    // BEFORE the local save in that ordering too, so reading it as "prepared" is the
    // conservative interpretation and the correct one.
    const { device, restored } = restoreFixture();
    const legacy = JSON.stringify(device.call('cloudDocument', restored));
    device.putRaw('farkad:pendingReplace', legacy);
    const disk = device.dump();

    const again = makeDevice({ storage: disk, deviceId: 'd_here' });
    again.State.load();
    check('it is read as a pending replacement',
        again.Sync.pendingReplace() !== null);

    const cloud = olderCloud(again);
    await connected(again, cloud);
    await settle(TICK * 40);

    check('the restore it described is on the disk',
        diskDays(again) === '2026-07-01', String(diskDays(again)));
    check('and in the cloud',
        Object.keys(cloud.doc.days || {}).sort().join() === '2026-07-01',
        JSON.stringify(Object.keys(cloud.doc.days || {})));
    check('and it is finished with, not left behind',
        again.Sync.pendingReplace() === null);
}

{
    suite('G13: the queue is not cleared while a replacement is only prepared');

    const { device, restored } = restoreFixture();
    const queuedBefore = device.Sync.pendingCount();
    given('there is something queued', queuedBefore > 0);

    given('prepared', device.Sync.prepareReplace(restored) === true);
    check('the queue is untouched by preparing',
        device.Sync.pendingCount() === queuedBefore,
        `${queuedBefore} -> ${device.Sync.pendingCount()}`);

    // And when the local save fails, still untouched.
    device.setQuota(key => key === 'scheduleData:v2');
    device.State.schedule = restored;
    check('the local save fails', device.State.save() === false);
    check('and the queue is still untouched',
        device.Sync.pendingCount() === queuedBefore,
        `${queuedBefore} -> ${device.Sync.pendingCount()}`);
    check('and the pending record is still there',
        device.Sync.pendingReplace() !== null);
}

{
    suite('G13: a cancellation that cannot be confirmed is not reported as cancelled');

    const { device, restored } = restoreFixture();
    given('prepared', device.Sync.prepareReplace(restored) === true);

    // Nothing can be written or removed from here on.
    device.setQuota(() => true);
    device.blockRemoval(key => key === 'farkad:pendingReplace');

    const cancelled = device.Sync.cancelPreparedReplace();
    check('cancelling reports that it could not be done', cancelled === false,
        String(cancelled));
    check('and the record is still on the disk',
        typeof device.raw('farkad:pendingReplace') === 'string');

    // The point of all that: it must not quietly go to the cloud next session either.
    // Either it is still pending and visible, or it is gone. Not silently sent.
    const again = makeDevice({ storage: device.dump(), deviceId: 'd_here' });
    again.State.load();
    check('a reopened device still sees it, rather than it having vanished',
        again.Sync.pendingReplace() !== null);
}

{
    suite('G13: the snapshot published during save() is not what makes it work');

    // The fake cloud publishes synchronously inside save(), before its promise resolves -
    // exactly as Firestore does. The old code depended on that echo to adopt the restore
    // and then ignored it, because a replacement was in flight. Nothing depends on it now:
    // this device already holds the replacement before save() is ever called.
    const { device, restored } = restoreFixture();
    const cloud = makeCloud();
    await connected(device, cloud);
    await wait();

    const observed = [];
    const realSave = cloud.adapter.save;
    let publishedBeforeResolve = false;
    cloud.adapter.save = data => {
        const seen = observed.length;
        const promise = realSave(data);
        publishedBeforeResolve = observed.length > seen;   // publish() ran inside save()
        return promise;
    };
    cloud.subscribers.push(() => observed.push(1));

    const result = await device.Sync.replaceEverything(restored);
    check('the restore succeeded', result.ok === true, JSON.stringify(result));
    check('and the cloud did publish inside save(), as Firestore does',
        publishedBeforeResolve === true);
    check('the device holds the restore on disk',
        diskDays(device) === '2026-07-01', String(diskDays(device)));

    const reopened = makeDevice({ storage: device.dump(), deviceId: 'd_here' });
    reopened.State.load();
    check('and after a close and reopen it still does',
        dayKeys(reopened.State.schedule) === '2026-07-01',
        dayKeys(reopened.State.schedule));
    check('with nothing pending', reopened.Sync.pendingReplace() === null);
}

{
    suite('G13: a resolved cloud write is not on its own a reason to forget');

    // The cloud accepts it, and between the local save and the acknowledgement the disk
    // stops holding what was sent. Forgetting the record here would leave the other two
    // phones on the restore and this one on something else, with nothing recording it.
    const { device, restored } = restoreFixture();
    const cloud = makeCloud();
    await connected(device, cloud);
    await wait();

    given('prepared', device.Sync.prepareReplace(restored) === true);
    given('applied locally',
        device.Sync.applyReplacementLocally(device.Sync.pendingReplace()).stored === true);
    device.Sync.confirmReplaceStored();

    // The disk changes underneath, the way a second tab or a failed later write would
    // leave it - after the send starts, before it is acknowledged.
    const realSave = cloud.adapter.save;
    cloud.adapter.save = data => {
        device.putRaw('scheduleData:v2', JSON.stringify({
            schemaVersion: 2, workers: [], places: [], days: { '1999-01-01': { plan: {}, actual: {} } },
            advances: {}, updatedAt: '1999-01-01T00:00:00.000Z', updatedBy: 'd_other'
        }));
        return realSave(data);
    };

    await device.Sync.executePreparedReplace().catch(() => {});
    cloud.adapter.save = realSave;

    check('the cloud did take it',
        Object.keys(cloud.doc.days || {}).sort().join() === '2026-07-01',
        JSON.stringify(Object.keys(cloud.doc.days || {})));
    check('but the record is NOT forgotten, because this device no longer holds it',
        device.Sync.pendingReplace() !== null);
    check('and the status does not claim synced',
        device.Sync.status !== 'synced', device.Sync.status);
}

{
    suite('G13: the queue is not cleared while the replacement is only prepared');

    const { device, restored } = restoreFixture();
    const cloud = makeCloud();
    await connected(device, cloud);
    // Something queued and unsent.
    cloud.online = false;
    record(device, '2026-08-13', 'w_02', 'p_01');
    await wait();
    const queued = device.Sync.pendingCount();
    given('there is something waiting to send', queued > 0);

    given('prepared', device.Sync.prepareReplace(restored) === true);
    check('preparing does not clear the queue',
        device.Sync.pendingCount() === queued,
        `${queued} -> ${device.Sync.pendingCount()}`);

    // And a local save that fails leaves it alone too.
    device.setQuota(key => key === 'scheduleData:v2');
    check('a failed local apply does not clear it',
        device.Sync.applyReplacementLocally(device.Sync.pendingReplace()).stored === false
        && device.Sync.pendingCount() === queued,
        `${queued} -> ${device.Sync.pendingCount()}`);
}

// ---------------------------------------------------------------- G14: the gaps
{
    suite('G14.1: a prepare that failed leaves no phantom behind');

    const { device, restored } = restoreFixture();
    const cloud = makeCloud();
    await connected(device, cloud);
    await wait();

    // The record cannot be written. Store.set still puts required writes in the session
    // cache, so reading the pending record through Store.get found one that does not
    // exist on the disk - and a later snapshot executed a restore the app had refused.
    device.setQuota(key => key === 'farkad:pendingReplace');
    const result = await device.Sync.replaceEverything(restored);

    check('the restore is reported as refused',
        result.ok === false && result.stage === 'prepare', JSON.stringify(result));
    check('nothing is on the disk', device.raw('farkad:pendingReplace') === null);
    check('and nothing reads as pending either',
        device.Sync.pendingReplace() === null,
        JSON.stringify(device.Sync.pendingReplace()));
    check('the screen still shows the original',
        dayKeys(device.State.schedule) === '2026-08-12', dayKeys(device.State.schedule));

    // Everything that could pick a pending restore back up.
    const before = cloud.attempts.filter(a => a.kind === 'save').length;
    device.Sync.receive(JSON.parse(JSON.stringify(cloud.doc)));
    device.Sync.resumeReplace();
    device.Sync.connect(cloud.adapter);
    await settle(TICK * 30);

    check('no replacement was ever sent to the cloud',
        cloud.attempts.filter(a => a.kind === 'save').length === before,
        `${before} -> ${cloud.attempts.filter(a => a.kind === 'save').length}`);
    check('and the schedule is still the original',
        dayKeys(device.State.schedule) === '2026-08-12', dayKeys(device.State.schedule));

    const reopened = makeDevice({ storage: device.dump(), deviceId: 'd_here' });
    reopened.State.load();
    check('after a reopen too', dayKeys(reopened.State.schedule) === '2026-08-12',
        dayKeys(reopened.State.schedule));
}

{
    suite('G14.2: work done after a restore was asked for is not deleted by it');

    const { device, restored } = restoreFixture();
    const cloud = makeCloud();
    await connected(device, cloud);
    await wait();

    given('prepared', device.Sync.prepareReplace(restored) === true);

    // A real edit, after the restore was asked for and before it was applied.
    check('the later edit is accepted',
        record(device, '2026-08-20', 'w_02', 'p_02') === true);

    const disk = device.dump();
    const again = makeDevice({ storage: disk, deviceId: 'd_here' });
    again.State.load();
    again.Sync.pushDelayMs = TICK;
    again.Sync.connect(cloud.adapter);
    await settle(TICK * 40);

    check('the restore happened',
        again.call('entriesFor', again.State.schedule, '2026-07-01', 'w_01', 'actual').length === 1,
        dayKeys(again.State.schedule));
    check('and the later edit survived on screen',
        again.call('entriesFor', again.State.schedule, '2026-08-20', 'w_02', 'actual').length === 1,
        dayKeys(again.State.schedule));
    check('and on the disk',
        (diskDays(again) || '').includes('2026-08-20'), String(diskDays(again)));
    check('and reached the cloud',
        Boolean(cloud.doc.days && cloud.doc.days['2026-08-20']),
        JSON.stringify(Object.keys(cloud.doc.days || {})));
    check('while the day the restore replaced is gone',
        !(diskDays(again) || '').includes('2026-08-12'), String(diskDays(again)));

    const third = makeDevice({ storage: again.dump(), deviceId: 'd_here' });
    third.State.load();
    check('all of it survives another reopen',
        dayKeys(third.State.schedule) === dayKeys(again.State.schedule),
        `${dayKeys(third.State.schedule)} vs ${dayKeys(again.State.schedule)}`);
}

{
    suite('G14.2: a roster change after prepare survives too');

    const { device, restored } = restoreFixture();
    const cloud = makeCloud();
    await connected(device, cloud);
    await wait();
    given('prepared', device.Sync.prepareReplace(restored) === true);

    const id = device.State.nextWorkerId();
    device.State.schedule.workers.push({ id, name: 'אחרי', active: true, dailyRate: 300 });
    check('the roster change is accepted', device.State.commitRoster() === true);

    const again = makeDevice({ storage: device.dump(), deviceId: 'd_here' });
    again.State.load();
    again.Sync.pushDelayMs = TICK;
    again.Sync.connect(cloud.adapter);
    await settle(TICK * 40);

    check('the worker added after the restore was asked for is still here',
        Boolean(again.State.worker(id)),
        JSON.stringify(again.State.schedule.workers.map(w => w.id)));
    check('and in the cloud',
        again.call('normaliseSchedule', cloud.doc).workers.some(w => w.id === id),
        JSON.stringify(again.call('normaliseSchedule', cloud.doc).workers.map(w => w.id)));
}

{
    suite('G15.4: a queue that could not be pruned is not reported as done');

    // This test used to accept `no resurrection OR still pending`, and the second half
    // let the first one through: the superseded days came back on screen and the test
    // passed because the transaction had not finished. A pending transaction is not a
    // licence to show somebody a day their restore removed. Every state below is now
    // named exactly.
    const { device, restored } = restoreFixture();
    const cloud = makeCloud({ online: false });
    await connected(device, cloud);
    // Offline, so the entry stays UNSENT and is still in the queue when the restore is
    // asked for - which is what gives the prune something to do.
    record(device, '2026-08-18', 'w_02', 'p_02');
    await wait();
    given('there is something to supersede', device.Sync.pendingCount() > 0);

    cloud.online = true;
    // The schedule can be written; the queue cannot.
    device.setQuota(key => key.startsWith('farkad:outbox'));
    const result = await device.Sync.replaceEverything(restored);

    check('the restore is not reported as done',
        result.ok === false && result.stage === 'queue', JSON.stringify(result));
    check('and the transaction is still pending',
        device.Sync.pendingReplace() !== null);
    check('the status does not claim synced',
        device.Sync.status !== 'synced', device.Sync.status);
    check('the screen shows the restored state and nothing else',
        dayKeys(device.State.schedule) === '2026-07-01', dayKeys(device.State.schedule));
    check('and so does the disk', diskDays(device) === '2026-07-01', String(diskDays(device)));
    check('the durable queue still holds the superseded entries - they were not lost',
        JSON.parse(device.raw(device.Sync.activeOutboxKey())).items['days.2026-08-12.actual.w_01']
            !== undefined,
        String(device.raw(device.Sync.activeOutboxKey())));
    check('and nothing reached the cloud',
        cloud.attempts.filter(a => a.kind === 'save').length === 0);

    // FIRST REOPEN. The superseded days are on the disk in the queue, and the restore is
    // on the disk in the schedule. What must be on screen is the restore.
    const again = makeDevice({ storage: device.dump(), deviceId: 'd_here' });
    again.State.load();
    check('the superseded day does not resurrect on reopen',
        dayKeys(again.State.schedule) === '2026-07-01', dayKeys(again.State.schedule));
    check('the transaction is still on the disk and readable',
        again.Sync.pendingReplace() !== null);
    check('and the superseded entries are still queued, not deleted',
        again.Sync.pendingPaths().includes('days.2026-08-12.actual.w_01'),
        JSON.stringify(again.Sync.pendingPaths()));

    // RECOVERY. Room is made, and the transaction finishes on its own.
    again.setQuota(null);
    again.Sync.pushDelayMs = TICK;
    again.Sync.connect(cloud.adapter);
    await settle(TICK * 40);

    check('the restore finishes once there is room',
        again.Sync.pendingReplace() === null,
        JSON.stringify(again.Sync.pendingReplace()));
    check('the queue is empty', again.Sync.pendingPaths().length === 0,
        JSON.stringify(again.Sync.pendingPaths()));
    check('the screen is the restored state', dayKeys(again.State.schedule) === '2026-07-01',
        dayKeys(again.State.schedule));
    check('the disk is the restored state', diskDays(again) === '2026-07-01',
        String(diskDays(again)));
    check('and so is the cloud',
        Object.keys(cloud.doc.days || {}).sort().join() === '2026-07-01',
        JSON.stringify(Object.keys(cloud.doc.days || {})));
    check('the status says synced', again.Sync.status === 'synced', again.Sync.status);

    // SECOND REOPEN.
    const third = makeDevice({ storage: again.dump(), deviceId: 'd_here' });
    third.State.load();
    check('and a second reopen agrees', dayKeys(third.State.schedule) === '2026-07-01',
        dayKeys(third.State.schedule));
    check('with nothing left pending', third.Sync.pendingReplace() === null);
}

{
    suite('G14.3: a queue write that comes back changed is caught too');

    const { device, restored } = restoreFixture();
    const cloud = makeCloud({ online: false });
    await connected(device, cloud);
    record(device, '2026-08-18', 'w_02', 'p_02');
    await wait();
    given('there is something to supersede', device.Sync.pendingCount() > 0);

    cloud.online = true;
    device.corruptOnWrite(device.Sync.activeOutboxKey());
    const result = await device.Sync.replaceEverything(restored);
    check('it is not reported as done', result.ok === false, JSON.stringify(result));
    check('and the transaction is still pending', device.Sync.pendingReplace() !== null);
}

{
    suite('G14.4: a mismatch after the cloud write is a failure, not a success');

    const { device, restored } = restoreFixture();
    const cloud = makeCloud();
    await connected(device, cloud);
    await wait();

    given('prepared', device.Sync.prepareReplace(restored) === true);
    given('applied', device.Sync.applyReplacementLocally(device.Sync.pendingReplace()).stored === true);
    device.Sync.confirmReplaceStored();

    const realSave = cloud.adapter.save;
    cloud.adapter.save = data => {
        device.putRaw('scheduleData:v2', JSON.stringify({
            schemaVersion: 2, workers: [], places: [],
            days: { '1999-01-01': { plan: {}, actual: {} } }, advances: {},
            updatedAt: '1999-01-01T00:00:00.000Z', updatedBy: 'd_other'
        }));
        return realSave(data);
    };

    let rejected = false;
    await device.Sync.executePreparedReplace().catch(() => { rejected = true; });
    cloud.adapter.save = realSave;

    check('executePreparedReplace rejects', rejected === true);
    check('the record is kept', device.Sync.pendingReplace() !== null);
    check('and the status is not synced', device.Sync.status !== 'synced', device.Sync.status);
}

{
    suite('G14.5: finalisation that cannot be confirmed is not success');

    const { device, restored } = restoreFixture();
    const cloud = makeCloud();
    await connected(device, cloud);
    await wait();

    // Prepared while everything works, so the transaction really exists...
    given('prepared', device.Sync.prepareReplace(restored) === true);
    given('applied',
        device.Sync.applyReplacementLocally(device.Sync.pendingReplace()).stored === true);

    // ...and only then does the record become impossible to get rid of: the delete does
    // nothing and the tombstone write cannot land either.
    device.blockRemoval(key => key === 'farkad:pendingReplace');
    device.setQuota(key => key === 'farkad:pendingReplace');

    let rejected = false;
    await device.Sync.executePreparedReplace().catch(() => { rejected = true; });

    check('the cloud did take the restore',
        Object.keys(cloud.doc.days || {}).sort().join() === '2026-07-01',
        JSON.stringify(Object.keys(cloud.doc.days || {})));
    check('but it is not reported as finished', rejected === true);
    check('and the status does not claim synced',
        device.Sync.status !== 'synced', device.Sync.status);
    check('the record is still on the disk, and will be resumed',
        device.raw('farkad:pendingReplace') !== null);
}

{
    suite('G14.5: a removeItem that throws is handled');

    const device = makeDevice();
    seed(device);
    device.throwOnRemove(key => key === 'farkad:pendingReplace');
    device.putRaw('farkad:pendingReplace', JSON.stringify({
        version: 2, phase: 'prepared', transactionId: 't', supersedesSeq: 0,
        document: device.call('cloudDocument', device.State.schedule)
    }));

    let threw = false;
    let answer = null;
    try { answer = device.Sync.forgetReplace(); } catch (error) { threw = true; }
    check('it does not throw out of forgetReplace', threw === false);
    check('and the answer is honest about whether it is gone',
        answer === false || device.raw('farkad:pendingReplace') === null,
        JSON.stringify({ answer, still: device.raw('farkad:pendingReplace') !== null }));
}

{
    suite('G14.6: a pending record that is not a schedule is quarantined, not applied');

    const bare = (extra) => JSON.stringify(Object.assign(
        { workers: [], places: [], days: {}, advances: {} }, extra));

    for (const [label, raw] of [
        ['an empty object', '{}'],
        ['null', 'null'],
        ['an array', '[]'],
        ['an unknown phase', '{"version":2,"phase":"whatever","document":{}}'],
        ['an envelope with no document', '{"version":2,"phase":"prepared"}'],
        // G15.6. Every one of these parses, and every one of them used to normalise
        // into an empty schedule and replace the screen, the disk and the cloud with it.
        ['the two rosters and nothing else', '{"workers":[],"places":[]}'],
        ['a document with no days', '{"workers":[],"places":[],"advances":{}}'],
        ['days as an array', bare({ days: [] })],
        ['a worker with no id', bare({ workers: [{ name: 'בלי מזהה' }] })],
        ['two workers claiming one id', bare({
            workers: [{ id: 'w_01', name: 'א' }, { id: 'w_01', name: 'ב' }] })],
        ['a place with an empty id', bare({ places: [{ id: '', name: 'אתר' }] })],
        ['a day key that is not a date', bare({
            days: { yesterday: { actual: {} } } })],
        ['a day that is not an object', bare({ days: { '2026-08-12': 7 } })],
        ['a day with neither side', bare({ days: { '2026-08-12': {} } })],
        ['a layer that is not an object', bare({ days: { '2026-08-12': { actual: [] } } })],
        ['entries that are not a list', bare({
            days: { '2026-08-12': { actual: { w_01: { entries: 'p_01' } } } } })],
        ['an entry with no place', bare({
            days: { '2026-08-12': { actual: { w_01: { entries: [{}] } } } } })],
        ['an advance with no worker', bare({
            advances: { a_1: { date: '2026-08-12', amount: 100 } } })],
        ['an advance with no date', bare({
            advances: { a_1: { workerId: 'w_01', amount: 100 } } })],
        ['an envelope with no transaction id', JSON.stringify({
            version: 2, phase: 'prepared', supersedesSeq: 0,
            document: JSON.parse(bare()) })],
        ['an envelope with a negative supersede point', JSON.stringify({
            version: 2, phase: 'prepared', transactionId: 'r_x', supersedesSeq: -3,
            document: JSON.parse(bare()) })],
        ['an envelope with a fractional supersede point', JSON.stringify({
            version: 2, phase: 'prepared', transactionId: 'r_x', supersedesSeq: 1.5,
            document: JSON.parse(bare()) })]
    ]) {
        const device = makeDevice({ deviceId: 'd_here' });
        seed(device);
        device.call('assignPlace', device.State.schedule, '2026-08-12', 'w_01', 'actual', 'p_01');
        device.State.save({ silent: true });
        const before = device.raw('scheduleData:v2');
        device.putRaw('farkad:pendingReplace', raw);

        const again = makeDevice({ storage: device.dump(), deviceId: 'd_here' });
        again.State.load();
        const cloud = makeCloud();
        await connected(again, cloud);
        await settle(TICK * 25);

        check(`${label} is not applied as a restore`,
            again.raw('scheduleData:v2') === before,
            `${(again.raw('scheduleData:v2') || '').slice(0, 40)}`);
        check(`${label} is left byte-for-byte`,
            again.raw('farkad:pendingReplace') === raw,
            String(again.raw('farkad:pendingReplace')));
        check(`${label} goes through Recovery`,
            again.global('Recovery').problems.some(p => p.key === 'farkad:pendingReplace'),
            JSON.stringify(again.global('Recovery').problems.map(p => p.key)));
        check(`${label} does not reach the cloud`,
            cloud.attempts.filter(a => a.kind === 'save').length === 0);
        check(`${label} leaves the roster intact`,
            again.State.schedule.workers.length === 3,
            String(again.State.schedule.workers.length));
    }
}

{
    suite('G14.7: the document always carries a valid stamp');

    // A migrated v1 backup has no timestamp at all. The envelope used to capture the
    // document BEFORE State.save stamped the schedule, so every retry sent updatedAt:
    // null - which the real rules reject, forever.
    const device = makeDevice();
    seed(device);
    const migrated = device.call('migrateV1', {
        workers: ['דוד'], places: ['הרצליה'],
        weekStartDate: '2026-08-07',
        assignments: [{ index: 0, value: 'הרצליה' }]
    }).schedule;
    check('the migrated backup really has no stamp',
        migrated.updatedAt === null, String(migrated.updatedAt));

    given('prepared', device.Sync.prepareReplace(migrated) === true);
    const envelope = device.Sync.pendingReplace();
    check('the stored document has a string updatedAt',
        typeof envelope.document.updatedAt === 'string',
        JSON.stringify(envelope.document.updatedAt));
    check('and a string updatedBy',
        typeof envelope.document.updatedBy === 'string',
        JSON.stringify(envelope.document.updatedBy));
    check('with the roster the rules require',
        Array.isArray(envelope.document.workers) && Array.isArray(envelope.document.places));
}

// ---------------------------------------------------------------- G15: serialising it
//
// Round 6 put the whole-document restore in order against itself. What was still loose
// was everything ELSE happening at the same time: the ordinary queue draining, and cloud
// writes that were already open when the restore started.

{
    suite('G15.1: a confirmed edit is not deleted by a replacement left pending');

    // GPT's measurement, reproduced: the cloud takes the restore, finalisation fails so
    // the transaction stays pending, the person records a day, the ordinary flush sends
    // and acknowledges it, the prune takes it out of the journal - and the retry of the
    // restore, replaying from its old envelope, deletes that day from screen, disk and
    // cloud at once.
    const { device, restored } = restoreFixture();
    const cloud = makeCloud();
    await connected(device, cloud);
    await wait();

    // The delete is refused and there is no room for the tombstone either, so the record
    // cannot go. Matched on the tombstone's own text rather than on the key, or the
    // prepare that starts the transaction would be refused as well.
    const holdRecord = device => {
        device.blockRemoval(key => key === 'farkad:pendingReplace');
        device.setQuota((key, value) =>
            key === 'farkad:pendingReplace' && value.includes('"cancelled"'));
    };
    holdRecord(device);
    const first = await device.Sync.replaceEverything(restored);

    given('the restore reached the cloud',
        Boolean(cloud.doc.days && cloud.doc.days['2026-07-01']));
    given('it could not be finalised', first.ok === false, JSON.stringify(first));
    given('so the transaction is still pending', device.Sync.pendingReplace() !== null);

    // Room again - but the record is still there, so the transaction is still open.
    device.setQuota(null);
    check('a day recorded now is accepted',
        record(device, '2026-08-20', 'w_02', 'p_02') === true);
    await settle(TICK * 30);

    const path = 'days.2026-08-20.actual.w_02';
    check('the barrier held: it was not sent while the restore was outstanding',
        cloud.writes.filter(w => w.kind === 'update').every(w => w.patch[path] === undefined),
        JSON.stringify(cloud.writes.map(w => w.kind)));
    check('the new day is still queued',
        device.Sync.pendingPaths().includes(path),
        JSON.stringify(device.Sync.pendingPaths()));
    check('and still on the disk in the queue',
        String(device.raw(device.Sync.activeOutboxKey())).includes(path));
    check('the retry ladder is armed rather than silent',
        device.Sync.pendingReplace() !== null);

    // The device recovers.
    device.blockRemoval(null);
    await device.Sync.resumeReplace();
    await settle(TICK * 40);

    const days = dayKeys(device.State.schedule);
    check('the restore finished', device.Sync.pendingReplace() === null,
        JSON.stringify(device.Sync.pendingReplace()));
    check('the screen holds the replacement AND the day recorded after it',
        days === '2026-07-01,2026-08-20', days);
    check('the disk agrees', diskDays(device) === '2026-07-01,2026-08-20',
        String(diskDays(device)));
    check('and the cloud agrees',
        Object.keys(cloud.doc.days || {}).sort().join() === '2026-07-01,2026-08-20',
        JSON.stringify(Object.keys(cloud.doc.days || {})));
    check('the queue is empty', device.Sync.pendingPaths().length === 0,
        JSON.stringify(device.Sync.pendingPaths()));

    const again = makeDevice({ storage: device.dump(), deviceId: 'd_here' });
    again.State.load();
    check('and a reopen produces the same thing',
        dayKeys(again.State.schedule) === '2026-07-01,2026-08-20',
        dayKeys(again.State.schedule));
}

{
    suite('G15.1: roster work done while a replacement is pending survives it too');

    // The same shape with the longest chain of journal entries in the app: a person
    // added, a person retired, and the order changed.
    const { device, restored } = restoreFixture();
    const cloud = makeCloud();
    await connected(device, cloud);
    await wait();

    device.blockRemoval(key => key === 'farkad:pendingReplace');
    device.setQuota((key, value) =>
        key === 'farkad:pendingReplace' && value.includes('"cancelled"'));
    given('the restore is left pending',
        (await device.Sync.replaceEverything(restored)).ok === false);
    given('and it really is pending', device.Sync.pendingReplace() !== null);
    device.setQuota(null);

    const added = device.State.nextWorkerId();
    device.State.schedule.workers.push(
        { id: added, name: 'נוסף אחרי', active: true, dailyRate: 300, hourlyRate: 0 });
    device.State.schedule.workers = device.State.schedule.workers.filter(w => w.id !== 'w_03');
    device.State.schedule.workers.reverse();
    check('the roster change is accepted', device.State.commitRoster() === true);
    await settle(TICK * 30);

    check('nothing about it went out while the restore was pending',
        cloud.writes.filter(w => w.kind === 'update')
            .every(w => w.patch[`roster.workers.${added}`] === undefined),
        JSON.stringify(cloud.writes.map(w => w.kind)));

    device.blockRemoval(null);
    await device.Sync.resumeReplace();
    await settle(TICK * 40);

    const ids = device.State.schedule.workers.map(w => w.id);
    check('the person added afterwards is still here', ids.includes(added),
        JSON.stringify(ids));
    check('the person retired afterwards is still gone', !ids.includes('w_03'),
        JSON.stringify(ids));
    check('the order chosen afterwards is the order kept',
        ids[0] === added, JSON.stringify(ids));
    check('and the cloud has the same roster',
        device.call('normaliseSchedule', cloud.doc).workers.map(w => w.id).join() === ids.join(),
        JSON.stringify(device.call('normaliseSchedule', cloud.doc).workers.map(w => w.id)));

    const again = makeDevice({ storage: device.dump(), deviceId: 'd_here' });
    again.State.load();
    check('and a reopen agrees',
        again.State.schedule.workers.map(w => w.id).join() === ids.join(),
        JSON.stringify(again.State.schedule.workers.map(w => w.id)));
}

{
    suite('a worker removed from the crew does not come back from the cloud');

    // Found while testing the deletions G15.1 asks for, and older than this round:
    // removal travelled in the whole `workers` array only, and the per-person map had no
    // way to hear it. normaliseSchedule merges the two, so the array said he was gone,
    // the map said he was here, and the union put him back - on all three phones, with
    // every day and every shekel recorded against him back in the report.
    const device = makeDevice({ deviceId: 'd_here' });
    seed(device);
    const cloud = makeCloud();
    await connected(device, cloud);
    await wait();
    given('all three are in the cloud map',
        Object.keys((cloud.doc.roster || {}).workers || {}).sort().join() === 'w_01,w_02,w_03',
        JSON.stringify(Object.keys((cloud.doc.roster || {}).workers || {})));

    device.State.schedule.workers = device.State.schedule.workers.filter(w => w.id !== 'w_03');
    check('the removal is accepted', device.State.commitRoster() === true);
    await settle(TICK * 30);

    check('he is gone from the whole-array form',
        (cloud.doc.workers || []).every(w => w.id !== 'w_03'),
        JSON.stringify((cloud.doc.workers || []).map(w => w.id)));
    check('and the cloud map no longer produces him',
        device.call('normaliseSchedule', cloud.doc).workers.every(w => w.id !== 'w_03'),
        JSON.stringify(device.call('normaliseSchedule', cloud.doc).workers.map(w => w.id)));

    // The other phone reads the same document and must not put him back either.
    const other = makeDevice({ deviceId: 'd_other' });
    other.State.load();
    other.Sync.connect(cloud.adapter);
    await settle(TICK * 30);
    check('the other phone does not resurrect him',
        other.State.schedule.workers.every(w => w.id !== 'w_03'),
        JSON.stringify(other.State.schedule.workers.map(w => w.id)));
    check('while the two who are still here arrived intact',
        other.State.schedule.workers.map(w => w.id).sort().join() === 'w_01,w_02',
        JSON.stringify(other.State.schedule.workers.map(w => w.id)));

    // And the phone that removed him sees the echo of its own write without him.
    const again = makeDevice({ storage: device.dump(), deviceId: 'd_here' });
    again.State.load();
    await connected(again, cloud);
    await settle(TICK * 30);
    check('and neither does the one that removed him, after a reopen',
        again.State.schedule.workers.every(w => w.id !== 'w_03'),
        JSON.stringify(again.State.schedule.workers.map(w => w.id)));
}

{
    suite('G15.2: a restore does not overtake a cloud write that was already open');

    // The measurement: an ordinary update carrying an old day is started, the restore
    // runs and reports done, and THEN the old update lands - putting the day back into
    // a document the restore had just removed it from.
    const { device, restored } = restoreFixture();
    const cloud = makeCloud();
    await connected(device, cloud);
    await wait();

    const gate = deferred();
    cloud.hold = kind => (kind === 'update' ? gate.promise : null);
    record(device, '2026-08-19', 'w_02', 'p_02');
    await settle(TICK * 15);
    given('an ordinary write is open',
        cloud.attempts.filter(a => a.kind === 'update').length > 0);
    given('and it has not landed', !(cloud.doc.days || {})['2026-08-19']);

    const restoring = device.Sync.replaceEverything(restored);
    await settle(TICK * 15);
    check('the restore is not sent while the older write is open',
        cloud.attempts.filter(a => a.kind === 'save').length === 0,
        String(cloud.attempts.filter(a => a.kind === 'save').length));
    check('and nothing has reported it done yet',
        device.Sync.pendingReplace() !== null);

    gate.release();
    const result = await restoring;
    await settle(TICK * 40);

    check('the restore succeeds once the older write has finished',
        result.ok === true, JSON.stringify(result));
    const order = cloud.writes.map(w => w.kind).join();
    check('and the two writes landed in the order they were started',
        order.endsWith('update,save'), order);
    check('so the day the older write carried did not come back',
        !(cloud.doc.days || {})['2026-08-19'],
        JSON.stringify(Object.keys(cloud.doc.days || {})));
    check('the cloud is the restored state',
        Object.keys(cloud.doc.days || {}).sort().join() === '2026-07-01',
        JSON.stringify(Object.keys(cloud.doc.days || {})));
    check('and so is this device',
        dayKeys(device.State.schedule) === '2026-07-01', dayKeys(device.State.schedule));
}

{
    suite('G15.2: an earlier write that FAILED still orders the restore');

    const { device, restored } = restoreFixture();
    const cloud = makeCloud();
    await connected(device, cloud);
    await wait();

    const gate = deferred();
    cloud.hold = kind => (kind === 'update' ? gate.promise : null);
    record(device, '2026-08-19', 'w_02', 'p_02');
    await settle(TICK * 15);

    const restoring = device.Sync.replaceEverything(restored);
    await settle(TICK * 15);
    given('the restore is waiting', cloud.attempts.filter(a => a.kind === 'save').length === 0);

    // Settled is settled. A write that failed did not land, so the restore is free.
    gate.refuse(new Error('refused'));
    const result = await restoring;
    await settle(TICK * 40);

    check('the restore goes through', result.ok === true, JSON.stringify(result));
    check('the cloud is the restored state',
        Object.keys(cloud.doc.days || {}).sort().join() === '2026-07-01',
        JSON.stringify(Object.keys(cloud.doc.days || {})));
}

{
    suite('G15.2: a HUNG earlier write is not a reason to report a restore done');

    const { device, restored } = restoreFixture();
    const cloud = makeCloud();
    await connected(device, cloud);
    await wait();

    // Never released. The real thing is a socket that neither answers nor closes.
    const hung = deferred();
    cloud.hold = kind => (kind === 'update' ? hung.promise : null);
    device.Sync.stuckMs = TICK * 4;
    record(device, '2026-08-19', 'w_02', 'p_02');
    await settle(TICK * 15);

    const result = await device.Sync.replaceEverything(restored);
    check('the restore is not reported as done',
        result.ok === false && result.stage === 'cloud', JSON.stringify(result));
    check('nothing was sent',
        cloud.attempts.filter(a => a.kind === 'save').length === 0,
        String(cloud.attempts.filter(a => a.kind === 'save').length));
    check('the transaction is kept so it can still run',
        device.Sync.pendingReplace() !== null);
    check('the status does not say synced', device.Sync.status !== 'synced', device.Sync.status);
    check('and this device holds the restore, as it was told it would',
        diskDays(device) === '2026-07-01', String(diskDays(device)));

    // The write finally answers, and the ladder finishes the job.
    cloud.hold = null;
    hung.release();
    await device.Sync.resumeReplace();
    await settle(TICK * 40);
    check('the restore lands once the socket lets go',
        device.Sync.pendingReplace() === null,
        JSON.stringify(device.Sync.pendingReplace()));
    check('and the cloud is the restored state',
        Object.keys(cloud.doc.days || {}).sort().join() === '2026-07-01',
        JSON.stringify(Object.keys(cloud.doc.days || {})));
}

{
    suite('G15.2: a STAMP-ONLY write is an earlier write like any other');

    // The one _sending.size cannot see: a stamp refresh carries no field paths, so the
    // map it was measured by is empty while a real request is open.
    const { device, restored } = restoreFixture();
    const cloud = makeCloud();
    await connected(device, cloud);
    await wait();

    const gate = deferred();
    cloud.hold = kind => (kind === 'update' ? gate.promise : null);
    device.Sync.onLocalChange({
        updatedAt: '2026-08-21T05:00:00.000Z', updatedBy: device.id
    });
    device.Sync.flush();
    await settle(TICK * 10);
    given('a stamp-only write is open',
        cloud.attempts.filter(a => a.kind === 'update').length > 0);
    given('and it carries no field paths',
        Object.keys(cloud.attempts[cloud.attempts.length - 1].payload)
            .every(key => key === 'updatedAt' || key === 'updatedBy'),
        JSON.stringify(Object.keys(cloud.attempts[cloud.attempts.length - 1].payload)));
    given('so the sending map is empty', device.Sync._sending.size === 0,
        String(device.Sync._sending.size));

    const restoring = device.Sync.replaceEverything(restored);
    await settle(TICK * 15);
    check('the restore still waits for it',
        cloud.attempts.filter(a => a.kind === 'save').length === 0,
        String(cloud.attempts.filter(a => a.kind === 'save').length));

    gate.release();
    const result = await restoring;
    await settle(TICK * 30);
    check('and goes through afterwards', result.ok === true, JSON.stringify(result));
    const order = cloud.writes.map(w => w.kind).join();
    check('in the order the two were started', order.endsWith('update,save'), order);
}

{
    suite('G15.1: flush() called by hand while a replacement is pending loses nothing');

    const { device, restored } = restoreFixture();
    const cloud = makeCloud();
    await connected(device, cloud);
    await wait();

    device.blockRemoval(key => key === 'farkad:pendingReplace');
    device.setQuota((key, value) =>
        key === 'farkad:pendingReplace' && value.includes('"cancelled"'));
    given('the restore is pending',
        (await device.Sync.replaceEverything(restored)).ok === false
        && device.Sync.pendingReplace() !== null);
    device.setQuota(null);

    record(device, '2026-08-20', 'w_02', 'p_02');
    record(device, '2026-08-21', 'w_01', 'p_01');
    const queued = device.Sync.pendingPaths().slice().sort().join();
    const writes = cloud.writes.length;

    // Every door into the send path, one after another.
    await device.Sync.flush();
    await device.Sync.flush();
    device.Sync.scheduleFlush();
    device.Sync.edit('days.2026-08-22.actual.w_01', { entries: [{ placeId: 'p_01' }] });
    await settle(TICK * 30);

    check('none of them sent anything', cloud.writes.length === writes,
        `${writes} -> ${cloud.writes.length}`);
    check('and the queue still holds every entry',
        queued.split(',').every(path => device.Sync.pendingPaths().includes(path)),
        JSON.stringify(device.Sync.pendingPaths()));
    check('including the one made through edit()',
        device.Sync.pendingPaths().includes('days.2026-08-22.actual.w_01'),
        JSON.stringify(device.Sync.pendingPaths()));

    device.blockRemoval(null);
    await device.Sync.resumeReplace();
    await settle(TICK * 40);
    check('and all three go out once the restore is finished',
        ['2026-08-20', '2026-08-21', '2026-08-22']
            .every(date => Boolean((cloud.doc.days || {})[date])),
        JSON.stringify(Object.keys(cloud.doc.days || {})));
}

{
    suite('G15.3: a prune that is refused leaves memory and the disk agreeing');

    for (const [label, arm] of [
        ['refused', device => device.setQuota(key => key.startsWith('farkad:outbox'))],
        ['written back changed', device => device.corruptOnWrite(device.Sync.activeOutboxKey())]
    ]) {
        const device = makeDevice({ deviceId: 'd_here' });
        seed(device);
        const cloud = makeCloud();
        await connected(device, cloud);
        await wait();
        given(`${label}: the roster has drained`, device.Sync.pendingCount() === 0,
            String(device.Sync.pendingCount()));

        // Recorded offline, so the entry is still in the queue when the fault is armed.
        // A prune with nothing to prune proves nothing.
        cloud.online = false;
        record(device, '2026-08-12', 'w_01', 'p_01');
        await wait();
        given(`${label}: the entry is queued and unsent`,
            device.Sync.pendingCount() === 1, String(device.Sync.pendingCount()));

        arm(device);
        cloud.online = true;
        await device.Sync.flush();
        await wait();

        given(`${label}: the entry reached the cloud`,
            Boolean(cloud.doc && cloud.doc.days && cloud.doc.days['2026-08-12']));
        check(`${label}: memory still holds what the disk holds`,
            device.Sync.pendingPaths().includes('days.2026-08-12.actual.w_01'),
            JSON.stringify(device.Sync.pendingPaths()));
        check(`${label}: nothing in memory claims the cloud has it`,
            device.Sync.pendingCount() === 1, String(device.Sync.pendingCount()));
        check(`${label}: the journal failure is reported`,
            device.Sync.journalFailed === true);
        check(`${label}: and the status does not claim synced`,
            device.Sync.status !== 'synced', device.Sync.status);

        const again = makeDevice({ storage: device.dump(), deviceId: 'd_here' });
        again.State.load();
        check(`${label}: the day survives the first reopen`,
            dayKeys(again.State.schedule) === '2026-08-12', dayKeys(again.State.schedule));

        const third = makeDevice({ storage: again.dump(), deviceId: 'd_here' });
        third.State.load();
        check(`${label}: and the second`,
            dayKeys(third.State.schedule) === '2026-08-12', dayKeys(third.State.schedule));
    }
}

{
    suite('G15.5: a local-only restore whose queue cannot be pruned is recoverable');

    // No cloud at all. The restore still has two halves, and the failure between them
    // used to leave the restored blob on the disk, the old queue beside it, and nothing
    // anywhere able to finish the job - so the next open replayed the superseded days
    // straight back over the restore.
    const { device, restored } = restoreFixture();
    given('there is no cloud', device.Sync.adapter === null);
    given('and something to supersede', device.Sync.pendingCount() > 0);

    device.setQuota(key => key.startsWith('farkad:outbox'));
    const result = await device.Sync.replaceEverything(restored);

    check('it is not reported as done',
        result.ok === false && result.stage === 'queue', JSON.stringify(result));
    check('a durable transaction was left behind to finish it',
        device.raw('farkad:pendingReplace') !== null);
    check('and it says no cloud write is owed',
        Boolean(device.Sync.pendingReplace()) && device.Sync.pendingReplace().cloud === false,
        JSON.stringify(device.Sync.pendingReplace()));
    check('the screen is the restored state',
        dayKeys(device.State.schedule) === '2026-07-01', dayKeys(device.State.schedule));

    // FIRST REOPEN, still with no room.
    const stuck = makeDevice({ storage: device.dump(), deviceId: 'd_here',
        quota: key => key.startsWith('farkad:outbox') });
    stuck.State.load();
    check('reopening does not resurrect the superseded day',
        dayKeys(stuck.State.schedule) === '2026-07-01', dayKeys(stuck.State.schedule));
    check('and the transaction is still there to be finished',
        stuck.Sync.pendingReplace() !== null);

    // SECOND REOPEN, with room. It finishes itself, with no cloud anywhere.
    const free = makeDevice({ storage: stuck.dump(), deviceId: 'd_here' });
    free.State.load();
    check('the transaction closes on its own',
        free.Sync.pendingReplace() === null,
        JSON.stringify(free.Sync.pendingReplace()));
    check('the queue is empty', free.Sync.pendingPaths().length === 0,
        JSON.stringify(free.Sync.pendingPaths()));
    check('and the restored state is what the device holds',
        dayKeys(free.State.schedule) === '2026-07-01', dayKeys(free.State.schedule));
    check('on the disk too', diskDays(free) === '2026-07-01', String(diskDays(free)));

    // And it is never pushed anywhere when a cloud finally appears.
    const cloud = makeCloud();
    const later = makeDevice({ storage: free.dump(), deviceId: 'd_here' });
    later.State.load();
    await connected(later, cloud);
    await settle(TICK * 30);
    check('a local-only restore is never sent to a cloud that turns up later',
        cloud.attempts.filter(a => a.kind === 'save').length === 0,
        String(cloud.attempts.filter(a => a.kind === 'save').length));
}

{
    suite('G15.5: a local-only restore that cannot be finalised says so');

    const { device, restored } = restoreFixture();
    device.blockRemoval(key => key === 'farkad:pendingReplace');
    device.setQuota((key, value) =>
        key === 'farkad:pendingReplace' && value.includes('"cancelled"'));
    const result = await device.Sync.replaceEverything(restored);

    check('it is not reported as done',
        result.ok === false && result.stage === 'finalize', JSON.stringify(result));
    check('but the restore itself did happen',
        diskDays(device) === '2026-07-01', String(diskDays(device)));

    device.blockRemoval(null);
    const again = makeDevice({ storage: device.dump(), deviceId: 'd_here' });
    again.State.load();
    check('and the leftover note closes itself at the next open',
        again.Sync.pendingReplace() === null,
        JSON.stringify(again.Sync.pendingReplace()));
    check('with the restored state intact',
        dayKeys(again.State.schedule) === '2026-07-01', dayKeys(again.State.schedule));
}

{
    suite('G15.6: a genuine v71 record and a valid empty schedule still work');

    // v71 wrote the bare cloud document with no envelope around it. Tightening the
    // validation must not turn those into quarantine on somebody's phone.
    const { device, restored } = restoreFixture();
    device.putRaw('farkad:pendingReplace',
        JSON.stringify(device.call('cloudDocument', restored)));

    const again = makeDevice({ storage: device.dump(), deviceId: 'd_here' });
    again.State.load();
    const cloud = makeCloud();
    await connected(again, cloud);
    await settle(TICK * 40);

    check('the v71 record is recognised, not quarantined',
        !again.global('Recovery').problems.some(p => p.key === 'farkad:pendingReplace'),
        JSON.stringify(again.global('Recovery').problems.map(p => p.key)));
    check('and it is carried out', dayKeys(again.State.schedule) === '2026-07-01',
        dayKeys(again.State.schedule));
    check('reaching the cloud', Boolean((cloud.doc.days || {})['2026-07-01']),
        JSON.stringify(Object.keys(cloud.doc.days || {})));

    // An empty schedule is a real schedule - a project restored from a backup taken on
    // its first day. It is emptiness that is allowed; missing parts that are not.
    const blank = makeDevice({ deviceId: 'd_blank' });
    seed(blank);
    const empty = blank.call('normaliseSchedule',
        { workers: [], places: [], days: {}, advances: {} });
    check('an empty schedule passes the model check',
        blank.call('fullScheduleProblems', blank.call('cloudDocument', empty)).length === 0,
        JSON.stringify(blank.call('fullScheduleProblems', blank.call('cloudDocument', empty))));

    const emptyCloud = makeCloud();
    await connected(blank, emptyCloud);
    await wait();
    const emptied = await blank.Sync.replaceEverything(empty);
    check('and restoring to it is allowed', emptied.ok === true, JSON.stringify(emptied));
    check('leaving the device genuinely empty',
        blank.State.schedule.workers.length === 0,
        String(blank.State.schedule.workers.length));
    check('while the two rosters alone are still refused',
        blank.call('fullScheduleProblems', { workers: [], places: [] }).length > 0);

    // And a document that would be quarantined on the way back in is never written down
    // in the first place: a record the device refuses to read is a record that blocks
    // every restore on it and halts recording, over something the app built itself.
    const bad = makeDevice({ deviceId: 'd_bad' });
    seed(bad);
    check('a document that is not a schedule is refused at prepare',
        bad.Sync.prepareReplace({ workers: [], places: [] }) === false);
    check('and nothing is left on the disk',
        bad.raw('farkad:pendingReplace') === null,
        String(bad.raw('farkad:pendingReplace')));
}

{
    suite('G15: offline, closed, reopened against a cloud that is behind');

    // The whole journey, run again after every fix in this round.
    const device = makeDevice({ deviceId: 'd_here' });
    seed(device);
    record(device, '2026-08-12', 'w_01', 'p_01');
    record(device, '2026-08-13', 'w_02', 'p_02');
    given('two days recorded with no cloud', device.Sync.pendingCount() === 2,
        String(device.Sync.pendingCount()));

    // Closed, reopened, and the cloud that turns up is older than this device.
    const reopened = makeDevice({ storage: device.dump(), deviceId: 'd_here' });
    reopened.State.load();
    check('both days come back off the disk',
        dayKeys(reopened.State.schedule) === '2026-08-12,2026-08-13',
        dayKeys(reopened.State.schedule));

    const cloud = olderCloud(reopened);
    await connected(reopened, cloud);
    await settle(TICK * 40);

    check('the older cloud does not take them away',
        ['2026-08-12', '2026-08-13'].every(date =>
            Boolean(reopened.State.schedule.days[date])),
        dayKeys(reopened.State.schedule));
    check('and they are pushed up to it',
        ['2026-08-12', '2026-08-13'].every(date =>
            Boolean((cloud.doc.days || {})[date])),
        JSON.stringify(Object.keys(cloud.doc.days || {})));
    check('the queue drains', reopened.Sync.pendingCount() === 0,
        String(reopened.Sync.pendingCount()));

    const third = makeDevice({ storage: reopened.dump(), deviceId: 'd_here' });
    third.State.load();
    check('and one more reopen still holds everything',
        ['2026-08-12', '2026-08-13'].every(date => Boolean(third.State.schedule.days[date])),
        dayKeys(third.State.schedule));
}

// ---------------------------------------------------------------- G16: the last of it

// Every attempt that could change the shared schedule document. `save` alone is not the
// question: an ordinary `update` is what gets acknowledged, and an acknowledgement is
// what lets an entry be pruned out of the queue.
function documentWrites(cloud) {
    return cloud.attempts
        .filter(attempt => ['update', 'create', 'save'].includes(attempt.kind))
        .map(attempt => attempt.kind);
}

// The value of one field path, off the cloud document, so "which of the two writes won"
// is a question with a plain answer.
function cloudEntries(cloud, date, workerId) {
    const day = (cloud.doc && cloud.doc.days && cloud.doc.days[date]) || {};
    const record = (day.actual || {})[workerId] || {};
    return (record.entries || []).map(entry => entry.placeId).join();
}

function screenEntries(device, date, workerId) {
    return device.call('entriesFor', device.State.schedule, date, workerId, 'actual')
        .map(entry => entry.placeId).join();
}

function diskEntries(device, date, workerId) {
    const raw = device.raw('scheduleData:v2');
    if (!raw) return null;
    const day = (JSON.parse(raw).days || {})[date] || {};
    const record = (day.actual || {})[workerId] || {};
    return (record.entries || []).map(entry => entry.placeId).join();
}

for (const ending of ['succeeds', 'fails']) {
    suite(`G16.1: a second write never starts while the first is open (A ${ending})`);

    const device = makeDevice({ deviceId: 'd_here' });
    seed(device);
    const cloud = makeCloud();
    await connected(device, cloud);
    await wait();

    // A: the day, recorded at one site.
    record(device, '2026-08-12', 'w_01', 'p_01');
    await wait();
    given('A reached the cloud', cloudEntries(cloud, '2026-08-12', 'w_01') === 'p_01',
        cloudEntries(cloud, '2026-08-12', 'w_01'));

    // A second write to the SAME path, held open. In the app this is a socket that has
    // gone quiet: the request was made, the server may or may not have it.
    //
    // The threshold is dropped to a few milliseconds BEFORE the write starts, so that
    // "past every timeout there is" happens inside the test rather than half a minute
    // from now.
    device.Sync.stuckMs = TICK;
    const gate = deferred();
    cloud.hold = kind => (kind === 'update' ? gate.promise : null);
    device.State.commit(device.call('unassignPlace',
        device.State.schedule, '2026-08-12', 'w_01', 'actual', 'p_01'));
    await settle(TICK * 10);
    const attemptsWithAOpen = cloud.attempts.filter(a => a.kind === 'update').length;
    given('the second write is open', attemptsWithAOpen > 0);

    // B: the same path again, while A hangs.
    device.State.commit(device.call('assignPlace',
        device.State.schedule, '2026-08-12', 'w_01', 'actual', 'p_02'));

    // Past every timeout there is, several times over.
    await settle(TICK * 40);

    check(`${ending}: B has not called the adapter while A is unresolved`,
        cloud.attempts.filter(a => a.kind === 'update').length === attemptsWithAOpen,
        `${attemptsWithAOpen} -> ${cloud.attempts.filter(a => a.kind === 'update').length}`);
    check(`${ending}: nothing claims to be synced`,
        device.Sync.status !== 'synced', device.Sync.status);
    check(`${ending}: and B is durable in the journal`,
        String(device.raw(device.Sync.activeOutboxKey()))
            .includes('days.2026-08-12.actual.w_01'));

    if (ending === 'succeeds') gate.release();
    else gate.refuse(new Error('the socket gave up'));
    cloud.hold = null;
    await settle(TICK * 60);
    await device.Sync.flush();
    await settle(TICK * 40);

    check(`${ending}: B is what the screen shows`,
        screenEntries(device, '2026-08-12', 'w_01') === 'p_02',
        screenEntries(device, '2026-08-12', 'w_01'));
    check(`${ending}: B is what the disk holds`,
        diskEntries(device, '2026-08-12', 'w_01') === 'p_02',
        String(diskEntries(device, '2026-08-12', 'w_01')));
    check(`${ending}: B is what the cloud holds - A did not land on top of it`,
        cloudEntries(cloud, '2026-08-12', 'w_01') === 'p_02',
        cloudEntries(cloud, '2026-08-12', 'w_01'));
    check(`${ending}: the queue is empty`, device.Sync.pendingCount() === 0,
        String(device.Sync.pendingCount()));
    check(`${ending}: and only now does it say synced`,
        device.Sync.status === 'synced', device.Sync.status);

    const again = makeDevice({ storage: device.dump(), deviceId: 'd_here' });
    again.State.load();
    check(`${ending}: the first reopen agrees`,
        screenEntries(again, '2026-08-12', 'w_01') === 'p_02',
        screenEntries(again, '2026-08-12', 'w_01'));

    const third = makeDevice({ storage: again.dump(), deviceId: 'd_here' });
    third.State.load();
    check(`${ending}: and the second`,
        screenEntries(third, '2026-08-12', 'w_01') === 'p_02',
        screenEntries(third, '2026-08-12', 'w_01'));
}

{
    suite('G16.2: a pruned queue does not take the sequence counter back to zero');

    // The exact regression. A restore prunes the entries it supersedes, which can leave
    // {seq:N, items:{}} on the disk. Reading the mark back out of the items - there are
    // none - started the next session at zero, so the next edit was handed a sequence
    // number BELOW the boundary of a restore that was still pending. The restore then
    // superseded an edit made after it, and deleted it.
    const { device, restored } = restoreFixture();
    const cloud = makeCloud();
    await connected(device, cloud);
    await wait();

    // Finalisation cannot happen: neither the delete nor the tombstone will write.
    device.blockRemoval(key => key === 'farkad:pendingReplace');
    device.setQuota((key, value) =>
        key === 'farkad:pendingReplace' && value.includes('"cancelled"'));
    const first = await device.Sync.replaceEverything(restored);
    given('the transaction is left pending', first.ok === false
        && device.Sync.pendingReplace() !== null, JSON.stringify(first));

    const boundary = device.Sync.pendingReplace().supersedesSeq;
    given('it has a real boundary', boundary > 0, String(boundary));
    const queue = JSON.parse(device.raw(device.Sync.activeOutboxKey()));
    given('the queue is pruned down to nothing but the mark',
        Object.keys(queue.items).length === 0, JSON.stringify(queue));
    given('and the mark itself is on the disk', queue.seq === boundary,
        `${queue.seq} vs ${boundary}`);

    // The app closes and opens again. Disconnected first, or the session that is
    // supposedly closed carries on retrying its own restore against the same cloud - two
    // phones, not one closed and reopened.
    device.Sync.disconnect();
    const again = makeDevice({ storage: device.dump(), deviceId: 'd_here' });
    again.State.load();
    check('the sequence counter survives the reopen',
        again.Sync._seq === boundary, `${again.Sync._seq} vs ${boundary}`);

    check('a day recorded now is accepted',
        record(again, '2026-08-20', 'w_02', 'p_02') === true);
    const entry = JSON.parse(again.raw(again.Sync.activeOutboxKey()))
        .items['days.2026-08-20.actual.w_02'];
    check('and it is numbered above the boundary, not below it',
        entry.seq > boundary, `${entry.seq} vs ${boundary}`);

    // The transaction finishes.
    again.blockRemoval(null);
    again.setQuota(null);
    again.Sync.pushDelayMs = TICK;
    again.Sync.connect(cloud.adapter);
    await settle(TICK * 60);

    check('the restore finishes', again.Sync.pendingReplace() === null,
        JSON.stringify(again.Sync.pendingReplace()));
    check('the day recorded after it is still on the screen',
        dayKeys(again.State.schedule) === '2026-07-01,2026-08-20',
        dayKeys(again.State.schedule));
    check('and on the disk', diskDays(again) === '2026-07-01,2026-08-20',
        String(diskDays(again)));
    check('and in the cloud',
        Object.keys(cloud.doc.days || {}).sort().join() === '2026-07-01,2026-08-20',
        JSON.stringify(Object.keys(cloud.doc.days || {})));
    check('the queue drained', again.Sync.pendingCount() === 0,
        String(again.Sync.pendingCount()));

    const third = makeDevice({ storage: again.dump(), deviceId: 'd_here' });
    third.State.load();
    check('the first reopen agrees',
        dayKeys(third.State.schedule) === '2026-07-01,2026-08-20',
        dayKeys(third.State.schedule));
    const fourth = makeDevice({ storage: third.dump(), deviceId: 'd_here' });
    fourth.State.load();
    check('and the second',
        dayKeys(fourth.State.schedule) === '2026-07-01,2026-08-20',
        dayKeys(fourth.State.schedule));
}

{
    suite('G16.2: a sequence that is not a whole number is corruption, not a number');

    for (const [label, seq] of [
        ['a string', '"7"'], ['a boolean', 'true'], ['null', 'null'],
        ['a fraction', '1.5'], ['a negative', '-1'],
        ['past the safe range', '9007199254740993']
    ]) {
        const raw = `{"seq":${seq},"items":{}}`;
        const device = makeDevice({ storage: { 'farkad:outbox': raw }, deviceId: 'd_here' });
        check(`${label} is not read as a queue`,
            device.Sync.activeOutboxKey() !== 'farkad:outbox',
            String(device.Sync.activeOutboxKey()));
        check(`${label} goes through Recovery`,
            device.global('Recovery').problems.some(p => p.key === 'farkad:outbox'));
        check(`${label} is left byte-for-byte`,
            device.raw('farkad:outbox') === raw, String(device.raw('farkad:outbox')));
    }
}

// A record exactly as v71 wrote one: the bare cloud document, no envelope around it, and
// the stamp still null because v71 captured it before State.save had touched it.
//
// FROZEN. Written out by hand rather than built with today's cloudDocument(), because
// the whole question is whether a record from a build that no longer exists still opens
// - and a fixture generated by the current builder answers a different question every
// time the builder changes.
const V71_RECORD = JSON.stringify({
    schemaVersion: 2,
    workers: [
        { id: 'w_01', name: 'דוד', idNumber: '', phone: '', dailyRate: 400, hourlyRate: 50, active: true },
        { id: 'w_02', name: 'שרה', idNumber: '', phone: '', dailyRate: 350, hourlyRate: 0, active: true },
        { id: 'w_03', name: 'עלי', idNumber: '', phone: '', dailyRate: 0, hourlyRate: 0, active: true }
    ],
    places: [
        { id: 'p_01', name: 'הרצליה', active: true },
        { id: 'p_02', name: 'תל אביב', active: true }
    ],
    days: {
        '2026-07-01': { plan: {}, actual: { w_01: { entries: [{ placeId: 'p_01' }] } } }
    },
    advances: {},
    updatedAt: null,
    updatedBy: null,
    roster: {
        workers: {
            w_01: { id: 'w_01', name: 'דוד', idNumber: '', phone: '', dailyRate: 400, hourlyRate: 50, active: true },
            w_02: { id: 'w_02', name: 'שרה', idNumber: '', phone: '', dailyRate: 350, hourlyRate: 0, active: true },
            w_03: { id: 'w_03', name: 'עלי', idNumber: '', phone: '', dailyRate: 0, hourlyRate: 0, active: true }
        },
        places: {
            p_01: { id: 'p_01', name: 'הרצליה', active: true },
            p_02: { id: 'p_02', name: 'תל אביב', active: true }
        },
        workerOrder: ['w_01', 'w_02', 'w_03'],
        placeOrder: ['p_01', 'p_02']
    }
});

{
    suite('G16.3: a genuine v71 record is frozen once, and never recomputed');

    const device = makeDevice({ deviceId: 'd_here' });
    seed(device);
    record(device, '2026-08-12', 'w_01', 'p_01');
    device.putRaw('farkad:pendingReplace', V71_RECORD);

    // FIRST OPEN. The record is upgraded, and the boundary it gets is the queue as it
    // stands right now - the pre-restore queue.
    const first = makeDevice({ storage: device.dump(), deviceId: 'd_here' });
    first.State.load();
    const frozen = first.Sync.pendingReplace();
    check('the v71 record is recognised, not quarantined',
        frozen !== null && !first.global('Recovery').problems.some(p => p.key === 'farkad:pendingReplace'),
        JSON.stringify(first.global('Recovery').problems.map(p => p.key)));
    check('the upgrade is on the disk, not only in memory',
        String(first.raw('farkad:pendingReplace')).includes('"version":2'),
        String(first.raw('farkad:pendingReplace')).slice(0, 60));
    check('with a stamp the rules will accept',
        typeof frozen.document.updatedAt === 'string' && frozen.document.updatedAt.length > 0
        && typeof frozen.document.updatedBy === 'string' && frozen.document.updatedBy.length > 0,
        JSON.stringify([frozen.document.updatedAt, frozen.document.updatedBy]));
    check('and a cloud write owed', frozen.cloud === true);
    check('and a transaction id of its own',
        typeof frozen.transactionId === 'string' && frozen.transactionId !== 'legacy',
        String(frozen.transactionId));

    const boundary = frozen.supersedesSeq;
    check('the boundary is the queue as it was, not zero', boundary > 0, String(boundary));

    // A day recorded while the restore is still pending.
    check('a day recorded now is accepted',
        record(first, '2026-08-20', 'w_02', 'p_02') === true);

    // TWO REOPENS. The boundary must be the one frozen above, not one computed again
    // against a queue that has grown - which would put the new day INSIDE it.
    const second = makeDevice({ storage: first.dump(), deviceId: 'd_here' });
    second.State.load();
    check('the boundary is unchanged after one reopen',
        second.Sync.pendingReplace().supersedesSeq === boundary,
        `${second.Sync.pendingReplace().supersedesSeq} vs ${boundary}`);
    check('and the transaction id is the same one',
        second.Sync.pendingReplace().transactionId === frozen.transactionId);

    const third = makeDevice({ storage: second.dump(), deviceId: 'd_here' });
    third.State.load();
    check('and after two', third.Sync.pendingReplace().supersedesSeq === boundary,
        `${third.Sync.pendingReplace().supersedesSeq} vs ${boundary}`);
    check('the day recorded after the restore is still queued',
        third.Sync.pendingPaths().includes('days.2026-08-20.actual.w_02'),
        JSON.stringify(third.Sync.pendingPaths()));

    // And now it runs.
    const cloud = makeCloud();
    third.Sync.pushDelayMs = TICK;
    third.Sync.connect(cloud.adapter);
    await settle(TICK * 60);

    check('the restore finished', third.Sync.pendingReplace() === null,
        JSON.stringify(third.Sync.pendingReplace()));
    check('the queue finished with it', third.Sync.pendingCount() === 0,
        String(third.Sync.pendingCount()));
    check('the restored day is here', dayKeys(third.State.schedule).includes('2026-07-01'),
        dayKeys(third.State.schedule));
    check('the day recorded after it survived',
        dayKeys(third.State.schedule).includes('2026-08-20'), dayKeys(third.State.schedule));
    check('the day the restore replaced is gone',
        !dayKeys(third.State.schedule).includes('2026-08-12'), dayKeys(third.State.schedule));
    check('the cloud holds both',
        ['2026-07-01', '2026-08-20'].every(date => Boolean((cloud.doc.days || {})[date])),
        JSON.stringify(Object.keys(cloud.doc.days || {})));
    check('and every write it accepted carried a real timestamp',
        cloud.writes.every(write => typeof (write.data || write.patch).updatedAt === 'string'
            && (write.data || write.patch).updatedAt.length > 0),
        JSON.stringify(cloud.writes.map(w => (w.data || w.patch).updatedAt)));

    const fourth = makeDevice({ storage: third.dump(), deviceId: 'd_here' });
    fourth.State.load();
    check('and a reopen after all that agrees',
        dayKeys(fourth.State.schedule) === '2026-07-01,2026-08-20',
        dayKeys(fourth.State.schedule));
    check('with nothing pending', fourth.Sync.pendingReplace() === null);
}

{
    suite('G16.3: an upgrade with nowhere to live holds the record instead of guessing');

    const device = makeDevice({ deviceId: 'd_here' });
    seed(device);
    record(device, '2026-08-12', 'w_01', 'p_01');
    device.putRaw('farkad:pendingReplace', V71_RECORD);

    const held = makeDevice({
        storage: device.dump(), deviceId: 'd_here',
        quota: key => key.startsWith('farkad:pendingReplace')
    });
    held.State.load();

    check('the raw v71 record is left byte-for-byte',
        held.raw('farkad:pendingReplace') === V71_RECORD);
    check('nothing acts on it', held.Sync.pendingReplace() === null,
        JSON.stringify(held.Sync.pendingReplace()));
    check('no half-written companion is left behind',
        held.raw('farkad:pendingReplace:v71') === null,
        String(held.raw('farkad:pendingReplace:v71')));
    check('recording is stopped rather than allowed to run past it',
        held.call('farkadWritesBlocked') === true);
    check('and the reason names the storage, not the record',
        held.global('Recovery').problems.some(problem =>
            problem.key === 'replace-upgrade' && problem.message.includes('אין מקום')),
        JSON.stringify(held.global('Recovery').problems.map(p => p.message)));

    const cloud = makeCloud();
    held.Sync.pushDelayMs = TICK;
    held.Sync.connect(cloud.adapter);
    await settle(TICK * 30);
    check('and nothing is sent anywhere',
        cloud.attempts.filter(a => a.kind === 'save').length === 0,
        String(cloud.attempts.filter(a => a.kind === 'save').length));

    // Room is made, and the next open upgrades it properly.
    const free = makeDevice({ storage: held.dump(), deviceId: 'd_here' });
    free.State.load();
    check('once there is room the upgrade happens',
        free.Sync.pendingReplace() !== null);
    check('and the record on disk is a v2 envelope now',
        String(free.raw('farkad:pendingReplace')).includes('"version":2'));
}

{
    suite('G16.3: a companion left by a half-finished upgrade is what the next open reads');

    const device = makeDevice({ deviceId: 'd_here' });
    seed(device);
    record(device, '2026-08-12', 'w_01', 'p_01');
    device.putRaw('farkad:pendingReplace', V71_RECORD);

    // The companion writes; replacing the raw record does not. That is the one window
    // where two different descriptions of the same restore exist, and the frozen one has
    // to win - a recomputed boundary would swallow anything recorded since.
    const half = makeDevice({
        storage: device.dump(), deviceId: 'd_here',
        quota: (key, value) => key === 'farkad:pendingReplace' && value.includes('"version":2')
    });
    half.State.load();
    const frozen = half.Sync.pendingReplace();
    check('the upgrade still happened', frozen !== null);
    check('the companion holds it',
        String(half.raw('farkad:pendingReplace:v71')).includes('"version":2'),
        String(half.raw('farkad:pendingReplace:v71')).slice(0, 40));
    check('and the raw v71 record was not destroyed on the way',
        half.raw('farkad:pendingReplace') === V71_RECORD);

    check('a day recorded now is accepted',
        record(half, '2026-08-20', 'w_02', 'p_02') === true);

    const again = makeDevice({ storage: half.dump(), deviceId: 'd_here' });
    again.State.load();
    check('the next open reads the frozen boundary, not a new one',
        again.Sync.pendingReplace().supersedesSeq === frozen.supersedesSeq,
        `${again.Sync.pendingReplace().supersedesSeq} vs ${frozen.supersedesSeq}`);

    const cloud = makeCloud();
    again.Sync.pushDelayMs = TICK;
    again.Sync.connect(cloud.adapter);
    await settle(TICK * 60);
    check('and the day recorded after the restore survives it',
        dayKeys(again.State.schedule) === '2026-07-01,2026-08-20',
        dayKeys(again.State.schedule));
}

// A schedule that passes everything, built once so the malformed cases below can each
// break exactly one thing and nothing else.
function soundDocument() {
    return {
        schemaVersion: 2,
        workers: [{ id: 'w_01', name: 'דוד', dailyRate: 400, hourlyRate: 50, active: true }],
        places: [{ id: 'p_01', name: 'הרצליה', active: true }],
        days: {
            '2026-08-12': {
                plan: {},
                actual: { w_01: { entries: [{ placeId: 'p_01', rate: 'extra', extraHours: 2 }] } }
            }
        },
        advances: { a_01: { id: 'a_01', workerId: 'w_01', date: '2026-08-12', amount: 500, note: '' } },
        updatedAt: '2026-08-12T18:00:00.000Z',
        updatedBy: 'd_other'
    };
}

// One thing wrong with it, per row.
function brokenDocuments() {
    const broken = [];
    const add = (label, change) => {
        const document = soundDocument();
        change(document);
        broken.push([label, document]);
    };

    add('a worker id with a dot in it', d => {
        d.workers[0].id = 'w.01';
        d.days['2026-08-12'].actual = { 'w.01': d.days['2026-08-12'].actual.w_01 };
        d.advances.a_01.workerId = 'w.01';
    });
    add('a place id with a bracket in it', d => {
        d.places[0].id = 'p[1]';
        d.days['2026-08-12'].actual.w_01.entries[0].placeId = 'p[1]';
    });
    add('two workers claiming one id', d => d.workers.push({ id: 'w_01', name: 'אחר' }));
    add('a roster map key that is not the id it holds', d => {
        d.roster = { workers: { w_02: { id: 'w_01', name: 'דוד' } } };
    });
    add('an order list naming the same man twice', d => {
        d.roster = { workerOrder: ['w_01', 'w_01'] };
    });
    add('an order list that is not a list', d => { d.roster = { workerOrder: 'w_01' }; });
    add('a day on the 30th of February', d => {
        d.days['2026-02-30'] = { plan: {}, actual: {} };
    });
    add('the 29th of a February that had 28 days', d => {
        d.days['2025-02-29'] = { plan: {}, actual: {} };
    });
    add('a layer nobody has heard of', d => {
        d.days['2026-08-12'].estimate = {};
    });
    add('a day recorded against a worker who is not in it', d => {
        d.days['2026-08-12'].actual.w_09 = { entries: [] };
    });
    add('an entry at a site that is not in it', d => {
        d.days['2026-08-12'].actual.w_01.entries[0].placeId = 'p_09';
    });
    add('a rate the model does not have', d => {
        d.days['2026-08-12'].actual.w_01.entries[0].rate = 'triple';
    });
    add('extra hours that are not a number', d => {
        d.days['2026-08-12'].actual.w_01.entries[0].extraHours = '2';
    });
    add('extra hours below zero', d => {
        d.days['2026-08-12'].actual.w_01.entries[0].extraHours = -1;
    });
    add('an absence flag that is not a flag', d => {
        d.days['2026-08-12'].actual.w_01.absent = 'yes';
    });
    add('a frozen rate that is not a number', d => {
        d.days['2026-08-12'].actual.w_01.rates = { daily: 'four hundred', hourly: 0 };
    });
    add('a frozen rate below zero', d => {
        d.days['2026-08-12'].actual.w_01.rates = { daily: -400, hourly: 0 };
    });
    add('a pay rate that is not a number', d => { d.workers[0].dailyRate = '400'; });
    add('an advance for a worker who is not in it', d => { d.advances.a_01.workerId = 'w_09'; });
    add('an advance on a day that does not exist', d => { d.advances.a_01.date = '2026-13-01'; });
    add('an advance whose amount is not a number', d => { d.advances.a_01.amount = null; });
    add('an advance filed under a different id', d => { d.advances.a_01.id = 'a_99'; });
    add('an "active" flag that is not a flag', d => { d.workers[0].active = 'yes'; });

    return broken;
}

{
    suite('G16.4: what a whole-document replacement has to be');

    const model = makeDevice({ deviceId: 'd_model' });

    check('the sound document passes',
        model.call('readReplacementDocument', soundDocument()).document !== null,
        JSON.stringify(model.call('readReplacementDocument', soundDocument()).problems));

    brokenDocuments().forEach(([label, document]) => {
        const read = model.call('readReplacementDocument', document);
        check(`${label} is refused`, read.document === null,
            JSON.stringify(read.problems));
        check(`${label} is refused with a reason`, read.problems.length > 0);
    });

    // The two that must keep working.
    const empty = { schemaVersion: 2, workers: [], places: [], days: {}, advances: {},
        updatedAt: '2026-08-12T18:00:00.000Z', updatedBy: 'd_other' };
    check('a complete empty schedule is a real schedule',
        model.call('readReplacementDocument', empty).document !== null,
        JSON.stringify(model.call('readReplacementDocument', empty).problems));

    const preAdvances = {
        schemaVersion: 2,
        workers: [{ id: 'w_01', name: 'דוד', dailyRate: 400, hourlyRate: 50, active: true }],
        places: [{ id: 'p_01', name: 'הרצליה', active: true }],
        days: { '2026-08-12': { plan: {}, actual: { w_01: { entries: [{ placeId: 'p_01' }] } } } },
        updatedAt: '2026-08-12T18:00:00.000Z', updatedBy: 'd_other'
    };
    const upgraded = model.call('readReplacementDocument', preAdvances);
    check('a backup from before advances existed still opens', upgraded.document !== null,
        JSON.stringify(upgraded.problems));
    check('and it opens with no advances rather than with something invented',
        JSON.stringify(upgraded.document.advances) === '{}',
        JSON.stringify(upgraded.document.advances));
    check('with the day it actually holds',
        Object.keys(upgraded.document.days).join() === '2026-08-12');

    check('the frozen v71 fixture passes too',
        model.call('readReplacementDocument', JSON.parse(V71_RECORD)).document !== null,
        JSON.stringify(model.call('readReplacementDocument', JSON.parse(V71_RECORD)).problems));

    // The leap day itself, both ways round.
    check('the 29th of February 2024 is a real day',
        model.call('isRealDate', '2024-02-29') === true);
    check('the 29th of February 2025 is not',
        model.call('isRealDate', '2025-02-29') === false);
    check('the 29th of February 2100 is not either',
        model.call('isRealDate', '2100-02-29') === false);
    check('the 29th of February 2000 is',
        model.call('isRealDate', '2000-02-29') === true);
}

{
    suite('G16.4: the envelope, checked exactly');

    const model = makeDevice({ deviceId: 'd_model' });
    const sound = () => ({
        version: 2, phase: 'prepared', transactionId: 'r_1', supersedesSeq: 3,
        cloud: true, document: soundDocument()
    });

    check('a sound envelope reads', model.call('envelopeProblems', sound()).length === 0,
        JSON.stringify(model.call('envelopeProblems', sound())));

    [
        ['a supersede point as a string', e => { e.supersedesSeq = '3'; }],
        ['a supersede point as a boolean', e => { e.supersedesSeq = true; }],
        ['a supersede point as null', e => { e.supersedesSeq = null; }],
        ['a fractional supersede point', e => { e.supersedesSeq = 3.5; }],
        ['a supersede point past the safe range', e => { e.supersedesSeq = 9007199254740993; }],
        ['a negative supersede point', e => { e.supersedesSeq = -1; }],
        ['no supersede point at all', e => { delete e.supersedesSeq; }],
        ['cloud as a string', e => { e.cloud = 'true'; }],
        ['no transaction id', e => { delete e.transactionId; }],
        ['an empty transaction id', e => { e.transactionId = ''; }],
        ['a phase nobody wrote', e => { e.phase = 'halfway'; }],
        ['a document that is not a schedule', e => { e.document = { workers: [], places: [] }; }]
    ].forEach(([label, breakIt]) => {
        const envelope = sound();
        breakIt(envelope);
        check(`${label} is refused`,
            model.call('envelopeProblems', envelope).length > 0);
    });

    const tombstone = { version: 2, phase: 'cancelled', transactionId: 'r_2', document: null };
    check('a cancelled record may carry no document',
        model.call('envelopeProblems', tombstone).length === 0,
        JSON.stringify(model.call('envelopeProblems', tombstone)));
    check('but not a document',
        model.call('envelopeProblems',
            Object.assign({}, tombstone, { document: soundDocument() })).length > 0);
    check('and still needs a transaction id',
        model.call('envelopeProblems',
            { version: 2, phase: 'cancelled', document: null }).length > 0);
}

// The dialogs, in the harness. The four restore doors ask before they act and tell
// afterwards; ask.js is a UI file the data suite does not load, so the two calls are
// answered here and recorded. What they SAY is then something a test can assert on.
function watchDialogs(device, answer = true) {
    const said = [];
    device.ctx.askConfirm = () => Promise.resolve(answer);
    device.ctx.askTell = message => {
        said.push(typeof message === 'string'
            ? { title: '', message }
            : { title: String(message.title || ''), message: String(message.message || '') });
        return Promise.resolve();
    };
    return said;
}

{
    suite('G16.4: all four doors refuse a source that is not a whole schedule');

    // Each door is handed something that parses, normalises into an empty schedule, and
    // is not a schedule. Nothing anywhere may change.
    const rubbish = JSON.stringify({ workers: [], places: [] });

    for (const door of ['cloud copy', 'restore point', 'imported file', 'way back']) {
        const device = makeDevice({ deviceId: 'd_here' });
        seed(device);
        record(device, '2026-08-12', 'w_01', 'p_01');
        const cloud = makeCloud();
        await connected(device, cloud);
        await wait();

        const said = watchDialogs(device);
        const diskBefore = device.raw('scheduleData:v2');
        const queueBefore = device.raw(device.Sync.activeOutboxKey());
        const cloudBefore = JSON.stringify(cloud.doc);
        const savesBefore = cloud.attempts.filter(a => a.kind === 'save').length;

        if (door === 'cloud copy') {
            device.Sync.archiveRead = () => Promise.resolve(JSON.parse(rubbish));
            await device.call('restoreFromCloud', '2026-08-01');
        } else if (door === 'restore point') {
            device.Store.set('scheduleData:snap:2026-08-01', rubbish);
            await device.call('restoreSnapshot', '2026-08-01');
        } else if (door === 'imported file') {
            let refused = false;
            try {
                device.call('readBackupFile', JSON.parse(rubbish));
            } catch (error) {
                refused = Boolean(error);
            }
            check(`${door}: the file is refused before anything is replaced`, refused);
        } else {
            device.Store.set('scheduleData:undoStack',
                JSON.stringify([{ at: '2026-08-01T06:00:00.000Z', schedule: rubbish }]));
            await device.call('restoreLocalBackup');
            check(`${door}: the way back is still on the stack, not consumed by the attempt`,
                JSON.parse(device.raw('scheduleData:undoStack'))
                    .some(entry => entry.schedule === rubbish),
                String(device.raw('scheduleData:undoStack')));
        }

        check(`${door}: the disk is untouched`,
            device.raw('scheduleData:v2') === diskBefore);
        check(`${door}: the queue is untouched`,
            device.raw(device.Sync.activeOutboxKey()) === queueBefore);
        check(`${door}: the cloud is untouched`,
            JSON.stringify(cloud.doc) === cloudBefore);
        check(`${door}: nothing was sent`,
            cloud.attempts.filter(a => a.kind === 'save').length === savesBefore);
        check(`${door}: no restore was written down`,
            device.raw('farkad:pendingReplace') === null,
            String(device.raw('farkad:pendingReplace')));
        check(`${door}: the screen still shows the day that was there`,
            dayKeys(device.State.schedule) === '2026-08-12', dayKeys(device.State.schedule));

        if (door !== 'imported file') {
            check(`${door}: and it says so, rather than reporting a restore`,
                said.length > 0 && said[said.length - 1].title === 'לא בוצע שחזור',
                JSON.stringify(said));
        }
    }
}

{
    suite('G16.4: a restore point whose JSON will not parse says so');

    const device = makeDevice({ deviceId: 'd_here' });
    seed(device);
    record(device, '2026-08-12', 'w_01', 'p_01');
    const said = watchDialogs(device);
    device.Store.set('scheduleData:snap:2026-08-01', '{"workers":[');

    const before = device.raw('scheduleData:v2');
    await device.call('restoreSnapshot', '2026-08-01');

    check('the button does not simply do nothing',
        said.length > 0, JSON.stringify(said));
    check('it names the failure exactly',
        said[said.length - 1].title === 'לא בוצע שחזור'
        && said[said.length - 1].message.includes('לא נקרא'),
        JSON.stringify(said[said.length - 1]));
    check('and nothing was replaced', device.raw('scheduleData:v2') === before);
    check('the damaged restore point is left where it is',
        device.raw('scheduleData:snap:2026-08-01') === '{"workers":[');
}

{
    suite('G16.4: replaceEverything refuses on its own account');

    const device = makeDevice({ deviceId: 'd_here' });
    seed(device);
    record(device, '2026-08-12', 'w_01', 'p_01');
    const cloud = makeCloud();
    await connected(device, cloud);
    await wait();

    const before = device.raw('scheduleData:v2');
    const result = await device.Sync.replaceEverything({ workers: [], places: [] });

    check('a caller that skipped its own check is still refused',
        result.ok === false && result.stage === 'invalid', JSON.stringify(result));
    check('the disk is untouched', device.raw('scheduleData:v2') === before);
    check('no record was written', device.raw('farkad:pendingReplace') === null);
    check('and nothing was sent',
        cloud.attempts.filter(a => a.kind === 'save').length === 0);
}

{
    suite('G16.5: a queue record that parses is not therefore a queue');

    for (const [label, raw] of [
        ['an empty object', '{}'],
        ['an array', '[]'],
        ['no items block', '{"seq":3}'],
        ['items as an array', '{"seq":3,"items":[]}'],
        ['an item that is not an object', '{"seq":3,"items":{"days.a.b.c":7}}'],
        ['an item with no value', '{"seq":3,"items":{"days.a.b.c":{"seq":1}}}'],
        ['an item sequence as a string', '{"seq":3,"items":{"days.a.b.c":{"value":1,"seq":"1"}}}'],
        ['an item past the high-water mark', '{"seq":1,"items":{"days.a.b.c":{"value":1,"seq":9}}}'],
        ['a sent flag that is not a flag', '{"seq":3,"items":{"days.a.b.c":{"value":1,"seq":1,"sent":"yes"}}}'],
        ['a path with a bracket in it', '{"seq":3,"items":{"days.a[1].b.c":{"value":1,"seq":1}}}'],
        ['a path with an empty segment', '{"seq":3,"items":{"days..b.c":{"value":1,"seq":1}}}']
    ]) {
        const device = makeDevice({ storage: { 'farkad:outbox': raw }, deviceId: 'd_here' });
        seed(device);

        check(`${label} is not chosen as the live queue`,
            device.Sync.activeOutboxKey() !== 'farkad:outbox',
            String(device.Sync.activeOutboxKey()));
        check(`${label} goes through Recovery`,
            device.global('Recovery').problems.some(p => p.key === 'farkad:outbox'));
        check(`${label} has a verified copy taken`,
            device.raw('farkad:outbox:damaged') !== null);

        // The whole point: the next edit must not land on top of it.
        record(device, '2026-08-12', 'w_01', 'p_01');
        check(`${label} is left byte-for-byte after the next edit`,
            device.raw('farkad:outbox') === raw, String(device.raw('farkad:outbox')));

        const again = makeDevice({ storage: device.dump(), deviceId: 'd_here' });
        again.State.load();
        check(`${label} survives a reopen untouched`,
            again.raw('farkad:outbox') === raw);
    }
}

{
    suite('G16.5: a local record that parses is not therefore a schedule');

    for (const [label, raw] of [
        ['the two rosters and nothing else', '{"workers":[],"places":[]}'],
        ['an empty object', '{}'],
        ['an array', '[]'],
        ['days as an array', '{"workers":[],"places":[],"days":[],"advances":{}}'],
        ['a day on the 31st of April',
            '{"workers":[],"places":[],"days":{"2026-04-31":{"actual":{}}},"advances":{}}'],
        ['an id with a dot in it',
            '{"workers":[{"id":"w.1","name":"x"}],"places":[],"days":{},"advances":{}}']
    ]) {
        const device = makeDevice({ storage: { 'scheduleData:v2': raw }, deviceId: 'd_here' });
        device.State.load();

        check(`${label} is not read as an empty schedule`,
            device.call('farkadWritesBlocked') === true);
        check(`${label} goes through Recovery`,
            device.global('Recovery').problems.some(p => p.key === 'scheduleData:v2'),
            JSON.stringify(device.global('Recovery').problems.map(p => p.key)));
        check(`${label} keeps the original byte-for-byte`,
            device.raw('scheduleData:v2') === raw, String(device.raw('scheduleData:v2')));

        // Writing is blocked, so nothing can land on top of it.
        check(`${label} cannot be overwritten by a save`,
            device.State.save() === false);
        check(`${label} is still there afterwards`,
            device.raw('scheduleData:v2') === raw);
    }
}

{
    suite('G16.5: a genuine record from before advances existed still opens');

    // Frozen, and written by hand: the shape a build from before the advances feature
    // wrote. No `advances` block, because there was nothing to put in one.
    const OLD_V2 = JSON.stringify({
        schemaVersion: 2,
        workers: [
            { id: 'w_01', name: 'דוד', idNumber: '', phone: '', dailyRate: 400, hourlyRate: 50, active: true },
            { id: 'w_02', name: 'שרה', idNumber: '', phone: '', dailyRate: 350, hourlyRate: 0, active: true }
        ],
        places: [{ id: 'p_01', name: 'הרצליה', active: true }],
        days: {
            '2026-08-12': {
                plan: {},
                actual: {
                    w_01: { entries: [{ placeId: 'p_01' }] },
                    w_02: { absent: true, entries: [] }
                }
            }
        },
        updatedAt: '2026-08-12T18:00:00.000Z',
        updatedBy: 'd_old'
    });

    const device = makeDevice({ storage: { 'scheduleData:v2': OLD_V2 }, deviceId: 'd_here' });
    device.State.load();

    check('it opens', device.call('farkadWritesBlocked') === false);
    check('with both people', device.State.schedule.workers.map(w => w.id).join() === 'w_01,w_02',
        JSON.stringify(device.State.schedule.workers.map(w => w.id)));
    check('the day that was recorded',
        device.call('entriesFor', device.State.schedule, '2026-08-12', 'w_01', 'actual').length === 1);
    check('the absence that was recorded',
        device.call('isAbsent', device.State.schedule, '2026-08-12', 'w_02', 'actual') === true);
    check('the site', device.State.schedule.places.map(p => p.id).join() === 'p_01');
    check('and no advances rather than something invented',
        JSON.stringify(device.State.schedule.advances) === '{}');

    // And it can then be written down and reopened without losing any of it.
    check('a new day can be recorded on top of it',
        record(device, '2026-08-13', 'w_01', 'p_01') === true);
    const again = makeDevice({ storage: device.dump(), deviceId: 'd_here' });
    again.State.load();
    check('and a reopen has everything',
        dayKeys(again.State.schedule) === '2026-08-12,2026-08-13',
        dayKeys(again.State.schedule));
    check('with the absence intact',
        again.call('isAbsent', again.State.schedule, '2026-08-12', 'w_02', 'actual') === true);
}

// ---------------------------------------------------------------- G17: the last three

// A device with a real way back on the stack, and an older one behind it.
function undoFixture() {
    const device = makeDevice({ deviceId: 'd_here' });
    seed(device);

    // A and B: two states worth going back to, frozen as text so the tests can compare
    // them byte-for-byte rather than by whatever the builder produces today.
    const stateWithDay = date => JSON.stringify(device.call('normaliseSchedule', {
        schemaVersion: 2,
        workers: device.State.schedule.workers,
        places: device.State.schedule.places,
        days: { [date]: { plan: {}, actual: { w_01: { entries: [{ placeId: 'p_01' }] } } } },
        advances: {},
        updatedAt: `${date}T06:00:00.000Z`, updatedBy: 'd_backup'
    }));

    const A = stateWithDay('2026-07-01');
    const B = stateWithDay('2026-06-01');
    device.Store.set('scheduleData:undoStack', JSON.stringify([
        { at: '2026-07-01T06:00:00.000Z', schedule: A },
        { at: '2026-06-01T06:00:00.000Z', schedule: B }
    ]));
    device.Store.set('scheduleData:v2backup', A);

    // C, the state actually on screen.
    record(device, '2026-08-12', 'w_01', 'p_01');
    return { device, A, B };
}

for (const [label, arm] of [
    ['the record cannot be written', device => device.setQuota(key => key === 'farkad:pendingReplace')],
    ['the schedule cannot be written', device => device.setQuota(key => key === 'scheduleData:v2')]
]) {
    suite(`G17.1: a refused restore does not eat the way back (${label})`);

    const { device, A, B } = undoFixture();
    const cloud = makeCloud();
    await connected(device, cloud);
    await wait();

    const said = watchDialogs(device);
    const stackBefore = device.raw('scheduleData:undoStack');
    const screenBefore = dayKeys(device.State.schedule);
    arm(device);

    await device.call('restoreLocalBackup');
    device.setQuota(null);

    check('the restore was refused', said.some(line => line.title === 'לא בוצע שחזור'),
        JSON.stringify(said));
    check('the screen still shows what it showed',
        dayKeys(device.State.schedule) === screenBefore, dayKeys(device.State.schedule));
    check('the way back is still the first thing on the stack',
        JSON.parse(device.raw('scheduleData:undoStack'))[0].schedule === A,
        String(device.raw('scheduleData:undoStack')).slice(0, 80));
    check('the older one behind it is still there too',
        JSON.parse(device.raw('scheduleData:undoStack'))
            .some(entry => entry.schedule === B));
    check('the stack is exactly what it was - nothing pushed either',
        device.raw('scheduleData:undoStack') === stackBefore,
        String(device.raw('scheduleData:undoStack')).slice(0, 80));
    check('the single slot was not overwritten with the state that never moved',
        device.raw('scheduleData:v2backup') === A,
        String(device.raw('scheduleData:v2backup')).slice(0, 60));
    check('and the next press still reaches it',
        device.call('peekUndoState') === A);

    // With the fault gone it works, and it is A that comes back.
    await device.call('restoreLocalBackup');
    await settle(TICK * 30);
    check('once the fault is gone the same way back is the one restored',
        dayKeys(device.State.schedule) === '2026-07-01', dayKeys(device.State.schedule));
}

{
    suite('G17.1: pressing it again undoes the undo, and loses nothing behind it');

    const { device, A, B } = undoFixture();
    const cloud = makeCloud();
    await connected(device, cloud);
    await wait();
    watchDialogs(device);

    await device.call('restoreLocalBackup');
    await settle(TICK * 30);
    check('the first press restores A', dayKeys(device.State.schedule) === '2026-07-01',
        dayKeys(device.State.schedule));
    check('A is off the stack now',
        !JSON.parse(device.raw('scheduleData:undoStack'))
            .some(entry => entry.schedule === A));
    check('and B is still behind it',
        JSON.parse(device.raw('scheduleData:undoStack'))
            .some(entry => entry.schedule === B));
    check('the single slot points at the state this restore left, not at A',
        device.raw('scheduleData:v2backup') !== A,
        String(device.raw('scheduleData:v2backup')).slice(0, 60));

    // The second press undoes the first: restoreLocalBackup pushes the state it leaves,
    // by design, so the pair is reversible in both directions. What matters here is that
    // walking back and forth over the top of the stack never consumes what is under it.
    await device.call('restoreLocalBackup');
    await settle(TICK * 30);
    check('the second press goes back to where the first one started',
        dayKeys(device.State.schedule) === '2026-08-12', dayKeys(device.State.schedule));
    check('and B is still behind them, untouched',
        JSON.parse(device.raw('scheduleData:undoStack'))
            .some(entry => entry.schedule === B),
        String(device.raw('scheduleData:undoStack')).slice(0, 100));

    await device.call('restoreLocalBackup');
    await settle(TICK * 30);
    check('a third press still finds A rather than nothing',
        dayKeys(device.State.schedule) === '2026-07-01', dayKeys(device.State.schedule));
    check('and B has still not been skipped past or dropped',
        JSON.parse(device.raw('scheduleData:undoStack'))
            .some(entry => entry.schedule === B),
        String(device.raw('scheduleData:undoStack')).slice(0, 100));
    check('the stack never grew past what it keeps',
        JSON.parse(device.raw('scheduleData:undoStack')).length <= 3,
        String(JSON.parse(device.raw('scheduleData:undoStack')).length));
}

{
    suite('G17.2: a damaged companion is never read past, and never recomputed');

    // The setup the report names: the companion writes, replacing the primary record does
    // not, a day is recorded after the restore was asked for, and then the companion is
    // corrupted while the bare v71 record beside it is left alone.
    const device = makeDevice({ deviceId: 'd_here' });
    seed(device);
    record(device, '2026-08-12', 'w_01', 'p_01');
    device.putRaw('farkad:pendingReplace', V71_RECORD);

    const half = makeDevice({
        storage: device.dump(), deviceId: 'd_here',
        quota: (key, value) => key === 'farkad:pendingReplace' && value.includes('"version":2')
    });
    half.State.load();
    const boundary = half.Sync.pendingReplace().supersedesSeq;
    given('the boundary was frozen at the pre-restore queue', boundary === 1, String(boundary));
    given('the companion holds it',
        String(half.raw('farkad:pendingReplace:v71')).includes('"version":2'));

    check('a day recorded now is accepted',
        record(half, '2026-08-20', 'w_02', 'p_02') === true);
    const entry = JSON.parse(half.raw(half.Sync.activeOutboxKey()))
        .items['days.2026-08-20.actual.w_02'];
    given('and it is numbered above the boundary', entry.seq > boundary,
        `${entry.seq} vs ${boundary}`);

    // The companion is damaged. The bare v71 primary is untouched.
    const damaged = makeDevice({ storage: half.dump(), deviceId: 'd_here' });
    damaged.putRaw('farkad:pendingReplace:v71', '{"version":2,"phase":"pre');
    const companionRaw = damaged.raw('farkad:pendingReplace:v71');

    const first = makeDevice({ storage: damaged.dump(), deviceId: 'd_here' });
    first.State.load();

    check('the boundary is not recomputed',
        first.Sync.pendingReplace() === null,
        JSON.stringify(first.Sync.pendingReplace()));
    check('the damaged companion is kept byte-for-byte',
        first.raw('farkad:pendingReplace:v71') === companionRaw,
        String(first.raw('farkad:pendingReplace:v71')));
    check('the bare v71 record is kept byte-for-byte too',
        first.raw('farkad:pendingReplace') === V71_RECORD);
    check('and it goes through Recovery rather than passing unnoticed',
        first.global('Recovery').problems.some(p => p.key === 'farkad:pendingReplace:v71'),
        JSON.stringify(first.global('Recovery').problems.map(p => p.key)));
    check('a verified copy of it was taken',
        first.raw('farkad:pendingReplace:v71:damaged') !== null);
    check('the transaction is held rather than run',
        first.Sync.replaceHeld === true);
    check('the day recorded after the restore is still on the screen',
        dayKeys(first.State.schedule).includes('2026-08-20'),
        dayKeys(first.State.schedule));
    check('and still queued', first.Sync.pendingPaths().includes('days.2026-08-20.actual.w_02'),
        JSON.stringify(first.Sync.pendingPaths()));

    const cloud = makeCloud();
    first.Sync.pushDelayMs = TICK;
    first.Sync.connect(cloud.adapter);
    await settle(TICK * 30);
    // EVERY write that can change the shared document. Counting only `save` was how the
    // hole below went unnoticed: the restore never went out, and the ordinary field
    // merges did - and it is the merges that get acknowledged and pruned.
    check('nothing is sent while the boundary cannot be trusted',
        documentWrites(cloud).length === 0, JSON.stringify(documentWrites(cloud)));

    // TWO REOPENS. The day must survive both, and must never be superseded.
    const second = makeDevice({ storage: first.dump(), deviceId: 'd_here' });
    second.State.load();
    check('after the first reopen the day is still here',
        dayKeys(second.State.schedule).includes('2026-08-20'),
        dayKeys(second.State.schedule));
    check('and the companion is still untouched',
        second.raw('farkad:pendingReplace:v71') === companionRaw);

    const third = makeDevice({ storage: second.dump(), deviceId: 'd_here' });
    third.State.load();
    check('after the second reopen too',
        dayKeys(third.State.schedule).includes('2026-08-20'),
        dayKeys(third.State.schedule));
    check('and the boundary was never recomputed to swallow it',
        third.Sync.pendingReplace() === null);

    // The export has to carry both, or the person cannot hand any of it to anybody.
    const exported = third.global('Recovery').rawRecords();
    check('the export carries the damaged companion',
        exported['farkad:pendingReplace:v71'] === companionRaw,
        JSON.stringify(Object.keys(exported)));
    check('and the v71 record it belongs to',
        exported['farkad:pendingReplace'] === V71_RECORD);
}

{
    suite('G17.2: a companion belonging to a different restore is not borrowed');

    const device = makeDevice({ deviceId: 'd_here' });
    seed(device);
    record(device, '2026-08-12', 'w_01', 'p_01');
    device.putRaw('farkad:pendingReplace', V71_RECORD);

    // Perfectly readable, and about something else entirely.
    const stranger = JSON.stringify({
        version: 2, phase: 'prepared', transactionId: 'legacy_other', supersedesSeq: 99,
        cloud: true,
        document: device.call('cloudDocument', device.call('normaliseSchedule', {
            workers: device.State.schedule.workers, places: device.State.schedule.places,
            days: { '2026-01-01': { plan: {}, actual: {} } }, advances: {},
            updatedAt: '2026-01-01T06:00:00.000Z', updatedBy: 'd_other'
        }))
    });
    device.putRaw('farkad:pendingReplace:v71', stranger);

    const again = makeDevice({ storage: device.dump(), deviceId: 'd_here' });
    again.State.load();

    check('its boundary is not applied to this restore',
        again.Sync.pendingReplace() === null,
        JSON.stringify(again.Sync.pendingReplace()));
    check('the stranger is kept byte-for-byte, not written over',
        again.raw('farkad:pendingReplace:v71') === stranger);
    check('the v71 record is kept too',
        again.raw('farkad:pendingReplace') === V71_RECORD);
    check('and it is reported rather than passed over',
        again.global('Recovery').problems.some(p => p.key === 'farkad:pendingReplace:v71'));
}

{
    suite('G17.3: a queue entry that is not a Farkad journal entry is corruption');

    const good = { entries: [{ placeId: 'p_01' }] };
    const queue = (path, value, seq = 1) =>
        JSON.stringify({ seq, items: { [path]: { value, seq } } });

    for (const [label, raw] of [
        ['a layer nobody wrote', queue('days.2026-08-12.estimate.w_01', good)],
        ['a root nobody wrote', queue('schedule.2026-08-12', good)],
        ['a day path with three segments', queue('days.2026-08-12.actual', good)],
        ['a day path with five', queue('days.2026-08-12.actual.w_01.extra', good)],
        ['a date that does not exist', queue('days.2026-02-30.actual.w_01', good)],
        ['a date that is not a date', queue('days.yesterday.actual.w_01', good)],
        ['a worker id with a dot', queue('days.2026-08-12.actual.w.01', good)],
        ['a segment that lands on the prototype',
            queue('days.2026-08-12.actual.__proto__', good)],
        ['a roster path with a prototype segment', queue('roster.workers.constructor', { id: 'constructor' })],
        ['a day value that is not a record', queue('days.2026-08-12.actual.w_01', 7)],
        ['a day value with entries that are not a list',
            queue('days.2026-08-12.actual.w_01', { entries: 'p_01' })],
        ['a day value with an entry with no site',
            queue('days.2026-08-12.actual.w_01', { entries: [{}] })],
        ['a day value with a rate nobody has',
            queue('days.2026-08-12.actual.w_01', { entries: [{ placeId: 'p_01', rate: 'triple' }] })],
        ['a day value with a frozen rate that is not a number',
            queue('days.2026-08-12.actual.w_01', { entries: [], rates: { daily: 'x' } })],
        ['an advance with no worker', queue('advances.a_01', { date: '2026-08-12', amount: 5 })],
        ['an advance on a day that does not exist',
            queue('advances.a_01', { workerId: 'w_01', date: '2026-02-30', amount: 5 })],
        ['an advance whose amount is not a number',
            queue('advances.a_01', { workerId: 'w_01', date: '2026-08-12', amount: 'x' })],
        ['an advance path with three segments',
            queue('advances.a_01.amount', 5)],
        ['a roster entry filed under another id',
            queue('roster.workers.w_01', { id: 'w_02', name: 'x' })],
        ['a roster entry that is not a record', queue('roster.workers.w_01', 'דוד')],
        ['an order that is not a list', queue('roster.workerOrder', 'w_01')],
        ['an order naming the same man twice', queue('roster.workerOrder', ['w_01', 'w_01'])],
        ['an order naming an unusable id', queue('roster.workerOrder', ['w.01'])],
        ['a roster path nobody wrote', queue('roster.crew.w_01', { id: 'w_01' })],
        ['a legacy array that is not an array', queue('workers', { w_01: {} })],
        ['a legacy array holding something else', queue('workers', ['דוד'])],
        ['a legacy array with a duplicate id',
            queue('workers', [{ id: 'w_01', name: 'a' }, { id: 'w_01', name: 'b' }])]
    ]) {
        const device = makeDevice({ storage: { 'farkad:outbox': raw }, deviceId: 'd_here' });
        seed(device);
        const cloud = makeCloud();
        await connected(device, cloud);
        await wait();

        check(`${label}: the slot is not chosen`,
            device.Sync.activeOutboxKey() !== 'farkad:outbox',
            String(device.Sync.activeOutboxKey()));
        check(`${label}: it goes through Recovery`,
            device.global('Recovery').problems.some(p => p.key === 'farkad:outbox'));
        check(`${label}: a verified copy is taken`,
            device.raw('farkad:outbox:damaged') !== null);
        check(`${label}: nothing from it was replayed onto the schedule`,
            device.State.schedule.days['2026-08-12'] === undefined
            && device.State.schedule.days['2026-02-30'] === undefined,
            dayKeys(device.State.schedule));
        check(`${label}: nothing from it reached the cloud`,
            cloud.writes.every(write => Object.keys(write.patch || write.data || {})
                .every(key => key.indexOf('estimate') === -1 && key.indexOf('2026-02-30') === -1)),
            JSON.stringify(cloud.writes.map(w => Object.keys(w.patch || w.data || {}))));

        // Recovery's own rule: the raw bytes are copied, the person is told, and once
        // that is acknowledged recording carries on - in the next slot along, never over
        // the record that is being held.
        given(`${label}: acknowledging the copy lifts the hold`,
            device.global('Recovery').acknowledge() === true);
        check(`${label}: a day can still be recorded`,
            record(device, '2026-09-01', 'w_01', 'p_01') === true);
        check(`${label}: and it went to a slot of its own`,
            device.Sync.activeOutboxKey() !== 'farkad:outbox',
            String(device.Sync.activeOutboxKey()));
        check(`${label}: the original is byte-for-byte what it was`,
            device.raw('farkad:outbox') === raw, String(device.raw('farkad:outbox')));

        // Two reopens. The point is that the SCHEDULE is never poisoned: the damaged
        // queue is held every time, and the record of the work is readable every time.
        const again = makeDevice({ storage: device.dump(), deviceId: 'd_here' });
        again.State.load();
        check(`${label}: the first reopen still has the day`,
            dayKeys(again.State.schedule) === '2026-09-01', dayKeys(again.State.schedule));
        check(`${label}: and the schedule itself was never quarantined`,
            !again.global('Recovery').problems.some(p => p.key === 'scheduleData:v2'),
            JSON.stringify(again.global('Recovery').problems.map(p => p.key)));
        given(`${label}: acknowledging again lifts the hold`,
            again.global('Recovery').acknowledge() === true);
        check(`${label}: and recording carries on`,
            record(again, '2026-09-02', 'w_01', 'p_01') === true);

        const third = makeDevice({ storage: again.dump(), deviceId: 'd_here' });
        third.State.load();
        check(`${label}: the second reopen has both days`,
            dayKeys(third.State.schedule) === '2026-09-01,2026-09-02',
            dayKeys(third.State.schedule));
        check(`${label}: the schedule is still not quarantined`,
            !third.global('Recovery').problems.some(p => p.key === 'scheduleData:v2'),
            JSON.stringify(third.global('Recovery').problems.map(p => p.key)));
        check(`${label}: and the original is still exactly as it was`,
            third.raw('farkad:outbox') === raw);
    }
}

{
    suite('G17.3: every journal path this app writes is still accepted');

    const model = makeDevice({ deviceId: 'd_model' });
    const ok = (path, value) => model.call('journalEntryProblems', path, value).length === 0;

    check('a day', ok('days.2026-08-12.actual.w_01',
        { entries: [{ placeId: 'p_01', rate: 'extra', extraHours: 2 }], rates: { daily: 400, hourly: 50 } }));
    check('a plan day', ok('days.2026-08-12.plan.w_01', { entries: [{ placeId: 'p_01' }] }));
    check('an absence', ok('days.2026-08-12.actual.w_01', { absent: true, entries: [] }));
    check('a cleared day', ok('days.2026-08-12.actual.w_01', { entries: [] }));
    check('a leap day', ok('days.2024-02-29.actual.w_01', { entries: [] }));
    check('an advance', ok('advances.a_01',
        { id: 'a_01', workerId: 'w_01', date: '2026-08-12', amount: 500, note: '' }));
    check('an advance being removed', ok('advances.a_01', null));
    check('one person', ok('roster.workers.w_01',
        { id: 'w_01', name: 'דוד', dailyRate: 400, hourlyRate: 50, active: true }));
    check('one person being removed', ok('roster.workers.w_01', null));
    check('one site', ok('roster.places.p_01', { id: 'p_01', name: 'הרצליה', active: true }));
    check('the order of the crew', ok('roster.workerOrder', ['w_01', 'w_02']));
    check('the order of the sites', ok('roster.placeOrder', ['p_01']));
    check('an empty order', ok('roster.workerOrder', []));
    check('the legacy crew array', ok('workers',
        [{ id: 'w_01', name: 'דוד', dailyRate: 400, hourlyRate: 50, active: true }]));
    check('the legacy site array', ok('places', [{ id: 'p_01', name: 'הרצליה', active: true }]));
    check('an empty legacy array', ok('workers', []));

    // And the real thing, end to end: a full roster edit still queues nothing the
    // reader will refuse.
    const device = makeDevice({ deviceId: 'd_here' });
    seed(device);
    const cloud = makeCloud({ online: false });
    await connected(device, cloud);
    device.State.schedule.workers.push(
        { id: device.State.nextWorkerId(), name: 'חדש', active: true, dailyRate: 300, hourlyRate: 0 });
    device.State.commitRoster();
    record(device, '2026-08-12', 'w_01', 'p_01');
    device.State.commit(device.call('addAdvance', device.State.schedule, 'w_01', '2026-08-12', 200, ''));
    await wait();

    const raw = device.raw(device.Sync.activeOutboxKey());
    given('there is a real queue to read back', JSON.parse(raw).seq > 3, String(raw).slice(0, 40));

    const again = makeDevice({ storage: device.dump(), deviceId: 'd_here' });
    again.State.load();
    check('a queue the app just wrote reads back as a queue',
        again.Sync.activeOutboxKey() === device.Sync.activeOutboxKey(),
        String(again.Sync.activeOutboxKey()));
    check('with nothing quarantined',
        !again.global('Recovery').problems.some(p => p.key.startsWith('farkad:outbox')),
        JSON.stringify(again.global('Recovery').problems.map(p => p.key)));
    check('and every entry still in it',
        again.Sync.pendingPaths().length === device.Sync.pendingPaths().length,
        `${again.Sync.pendingPaths().length} vs ${device.Sync.pendingPaths().length}`);
}

{
    suite('G18: a held legacy transaction cannot be acknowledged away');

    // The continuation the last round left open. The companion is damaged, the app
    // correctly holds the transaction - and then the person presses "I understand,
    // carry on recording", which is the button that exists for a damaged record whose
    // bytes are safely copied. From there ordinary sends resumed, the seq-2 entry was
    // acknowledged and pruned, and when the good companion came back the restore ran
    // with its original boundary over a queue that no longer held the day.
    const device = makeDevice({ deviceId: 'd_here' });
    seed(device);
    record(device, '2026-08-12', 'w_01', 'p_01');
    device.putRaw('farkad:pendingReplace', V71_RECORD);

    const half = makeDevice({
        storage: device.dump(), deviceId: 'd_here',
        quota: (key, value) => key === 'farkad:pendingReplace' && value.includes('"version":2')
    });
    half.State.load();
    given('the boundary was frozen at 1', half.Sync.pendingReplace().supersedesSeq === 1,
        String(half.Sync.pendingReplace().supersedesSeq));
    const goodCompanion = half.raw('farkad:pendingReplace:v71');

    check('a day recorded after the restore is accepted',
        record(half, '2026-08-20', 'w_02', 'p_02') === true);
    const queueBefore = half.raw(half.Sync.activeOutboxKey());
    given('and it is queued above the boundary',
        JSON.parse(queueBefore).items['days.2026-08-20.actual.w_02'].seq === 2,
        queueBefore);

    // The companion is damaged; everything else is left exactly as it is.
    const broken = makeDevice({ storage: half.dump(), deviceId: 'd_here' });
    broken.putRaw('farkad:pendingReplace:v71', '{"version":2,"phase":"pre');
    const brokenCompanion = broken.raw('farkad:pendingReplace:v71');

    const held = makeDevice({ storage: broken.dump(), deviceId: 'd_here' });
    held.State.load();
    const cloud = makeCloud();
    held.Sync.pushDelayMs = TICK;
    held.Sync.connect(cloud.adapter);
    await settle(TICK * 30);

    given('the transaction is held', held.Sync.replaceHeld === true);

    // 1. Connecting sends nothing at all - not a save, not an update, not a create.
    check('connecting sends nothing that could change the document',
        documentWrites(cloud).length === 0, JSON.stringify(documentWrites(cloud)));

    // 2. The acknowledgment cannot lift it, even though the copy was taken.
    check('a copy of the damaged companion WAS taken',
        held.raw('farkad:pendingReplace:v71:damaged') !== null);
    check('and it is still held anyway',
        held.global('Recovery').acknowledge() === false);
    check('writing is still blocked after acknowledging',
        held.call('farkadWritesBlocked') === true);
    check('the queue is byte-for-byte what it was',
        held.raw(held.Sync.activeOutboxKey()) === queueBefore,
        String(held.raw(held.Sync.activeOutboxKey())));

    // 3. Nothing anybody presses can get past it.
    await held.Sync.flush();
    await held.Sync.flush();
    held.Sync.scheduleFlush();
    held.Sync.disconnect();
    held.Sync.connect(cloud.adapter);
    held.Sync.scheduleRetry();
    await settle(TICK * 60);

    check('repeated flushes, a reconnect and a retry still send nothing',
        documentWrites(cloud).length === 0, JSON.stringify(documentWrites(cloud)));
    check('and the queue is still byte-for-byte what it was',
        held.raw(held.Sync.activeOutboxKey()) === queueBefore,
        String(held.raw(held.Sync.activeOutboxKey())));
    const waitingBefore = Object.keys(JSON.parse(queueBefore).items)
        .filter(path => JSON.parse(queueBefore).items[path].sent !== true).length;
    check('and every entry is still waiting - none was marked as sent',
        held.Sync.pendingCount() === waitingBefore,
        `${held.Sync.pendingCount()} vs ${waitingBefore}`);

    // 4. And no new work is taken on while it is held.
    check('a new edit is refused rather than accepted',
        record(held, '2026-08-21', 'w_01', 'p_01') === false);
    check('the disk did not change either',
        JSON.parse(held.raw('scheduleData:v2')).days['2026-08-21'] === undefined);
    check('and the queue STILL has not moved',
        held.raw(held.Sync.activeOutboxKey()) === queueBefore);

    // Both raw records, and the copy, are all there to be exported.
    check('the raw v71 record is intact',
        held.raw('farkad:pendingReplace') === V71_RECORD);
    check('the damaged companion is intact',
        held.raw('farkad:pendingReplace:v71') === brokenCompanion);
    const exported = held.global('Recovery').rawRecords();
    check('the export carries both, and the queue',
        exported['farkad:pendingReplace'] === V71_RECORD
        && exported['farkad:pendingReplace:v71'] === brokenCompanion
        && exported[held.Sync.activeOutboxKey()] === queueBefore,
        JSON.stringify(Object.keys(exported)));

    // 5. The companion is repaired, and the transaction finishes properly.
    const mended = makeDevice({ storage: held.dump(), deviceId: 'd_here' });
    mended.putRaw('farkad:pendingReplace:v71', goodCompanion);

    const running = makeDevice({ storage: mended.dump(), deviceId: 'd_here' });
    running.State.load();
    check('the original frozen boundary is the one used',
        running.Sync.pendingReplace().supersedesSeq === 1,
        JSON.stringify(running.Sync.pendingReplace() && running.Sync.pendingReplace().supersedesSeq));

    running.Sync.pushDelayMs = TICK;
    running.Sync.connect(cloud.adapter);
    await settle(TICK * 60);

    check('the restore finishes', running.Sync.pendingReplace() === null,
        JSON.stringify(running.Sync.pendingReplace()));
    check('the queue drains', running.Sync.pendingCount() === 0,
        String(running.Sync.pendingCount()));
    check('the restored day is on the screen',
        dayKeys(running.State.schedule).includes('2026-07-01'),
        dayKeys(running.State.schedule));
    check('and the day recorded after the restore survived',
        dayKeys(running.State.schedule).includes('2026-08-20'),
        dayKeys(running.State.schedule));
    check('the disk says the same', String(diskDays(running)).includes('2026-08-20'),
        String(diskDays(running)));
    check('and so does the cloud',
        Boolean((cloud.doc.days || {})['2026-08-20'])
        && Boolean((cloud.doc.days || {})['2026-07-01']),
        JSON.stringify(Object.keys(cloud.doc.days || {})));

    const first = makeDevice({ storage: running.dump(), deviceId: 'd_here' });
    first.State.load();
    check('the first reopen agrees',
        dayKeys(first.State.schedule) === '2026-07-01,2026-08-20',
        dayKeys(first.State.schedule));
    const second = makeDevice({ storage: first.dump(), deviceId: 'd_here' });
    second.State.load();
    check('and the second',
        dayKeys(second.State.schedule) === '2026-07-01,2026-08-20',
        dayKeys(second.State.schedule));
    check('with nothing left held or pending',
        second.Sync.replaceHeld === false && second.Sync.pendingReplace() === null);
}

{
    suite('G18: a companion belonging to another restore holds it just as hard');

    const device = makeDevice({ deviceId: 'd_here' });
    seed(device);
    record(device, '2026-08-12', 'w_01', 'p_01');
    device.putRaw('farkad:pendingReplace', V71_RECORD);
    device.putRaw('farkad:pendingReplace:v71', JSON.stringify({
        version: 2, phase: 'prepared', transactionId: 'legacy_other', supersedesSeq: 99,
        cloud: true,
        document: device.call('cloudDocument', device.call('normaliseSchedule', {
            workers: device.State.schedule.workers, places: device.State.schedule.places,
            days: { '2026-01-01': { plan: {}, actual: {} } }, advances: {},
            updatedAt: '2026-01-01T06:00:00.000Z', updatedBy: 'd_other'
        }))
    }));

    const held = makeDevice({ storage: device.dump(), deviceId: 'd_here' });
    held.State.load();
    const cloud = makeCloud();
    held.Sync.pushDelayMs = TICK;
    held.Sync.connect(cloud.adapter);
    await settle(TICK * 40);

    check('it is held', held.Sync.replaceHeld === true);
    check('acknowledging does not lift it',
        held.global('Recovery').acknowledge() === false);
    check('nothing that could change the document was sent',
        documentWrites(cloud).length === 0, JSON.stringify(documentWrites(cloud)));
    check('and no new edit is taken on',
        record(held, '2026-08-21', 'w_01', 'p_01') === false);
}

// ---------------------------------------------------------------- counting the days
//
// The account that started this: four dates on site, two of them double, at 450 a day.
//
//   450 + 900 + 900 + 450 = 2700, less a 100 advance = 2600
//
// The money was right the whole time. What was wrong was the sheet printing "4 ימי עבודה"
// beside it, because 4 x 450 is 1800 and the person reading it has no way to get from one
// number to the other. Two counts now, and they answer two different questions.
{
    suite('the account that reads: 4 days on site, 6 days of pay');

    const device = makeDevice({ deviceId: 'd_here' });
    device.State.schedule.workers = [
        { id: 'w_01', name: 'דוד', active: true, dailyRate: 450, hourlyRate: 0 }
    ];
    device.State.schedule.places = [
        { id: 'p_01', name: 'הרצליה', active: true },
        { id: 'p_02', name: 'תל אביב', active: true }
    ];
    device.State.save({ silent: true });

    const RATE_DOUBLE = device.global('RATE_DOUBLE');
    const assign = (date, place, rate) => device.State.commit(device.call('assignPlace',
        device.State.schedule, date, 'w_01', 'actual', place, rate));

    assign('2026-08-10', 'p_01');                   // ordinary
    assign('2026-08-11', 'p_01', RATE_DOUBLE);      // double
    assign('2026-08-12', 'p_01', RATE_DOUBLE);      // double
    assign('2026-08-13', 'p_01');                   // ordinary
    device.State.commit(device.call('addAdvance',
        device.State.schedule, 'w_01', '2026-08-13', 100, ''));

    const row = device.call('payrollReport', device.State.schedule, '2026-08-01', '2026-08-31')
        .find(item => item.workerId === 'w_01');

    check('attendanceDays = 4', row.attendanceDays === 4, String(row.attendanceDays));
    check('payUnits = 6', row.payUnits === 6, String(row.payUnits));
    check('doubleDays = 2', row.doubleDays === 2, String(row.doubleDays));
    check('gross = 2700', row.amount === 2700, String(row.amount));
    check('advance = 100', row.advances === 100, String(row.advances));
    check('net = 2600', row.netAmount === 2600, String(row.netAmount));

    // The detail screen, the message and the export all read the same summary, so the
    // four of them cannot print different numbers for the same fortnight.
    const days = device.call('workerDaysReport', device.State.schedule,
        device.State.worker('w_01'), '2026-08-01', '2026-08-31');
    const summary = device.call('workerDaysSummary', days);

    check('the detail summary agrees on attendance',
        summary.attendanceDays === row.attendanceDays, String(summary.attendanceDays));
    check('and on pay units', summary.payUnits === row.payUnits, String(summary.payUnits));
    check('and on double days', summary.doubleDays === row.doubleDays,
        String(summary.doubleDays));
    check('and on the money', summary.amount === row.amount, String(summary.amount));
}

{
    suite('what does and does not add a day');

    const device = makeDevice({ deviceId: 'd_here' });
    device.State.schedule.workers = [
        { id: 'w_01', name: 'דוד', active: true, dailyRate: 450, hourlyRate: 40 }
    ];
    device.State.schedule.places = [
        { id: 'p_01', name: 'הרצליה', active: true },
        { id: 'p_02', name: 'תל אביב', active: true }
    ];
    device.State.save({ silent: true });

    const RATE_DOUBLE = device.global('RATE_DOUBLE');
    const RATE_EXTRA = device.global('RATE_EXTRA');
    const assign = (date, place, rate, hours) => device.State.commit(device.call('assignPlace',
        device.State.schedule, date, 'w_01', 'actual', place, rate, hours));
    const rowFor = () => device.call('payrollReport',
        device.State.schedule, '2026-08-01', '2026-08-31')
        .find(item => item.workerId === 'w_01');

    // 1. One site, one date.
    assign('2026-08-03', 'p_01');
    same('one site on a date is one day of attendance and one of pay',
        [rowFor().attendanceDays, rowFor().payUnits], [1, 1]);

    // 2. Two sites, same date. He was there once.
    assign('2026-08-04', 'p_01');
    assign('2026-08-04', 'p_02');
    same('two sites on one date is still one day, not two',
        [rowFor().attendanceDays, rowFor().payUnits], [2, 2]);
    check('though both site visits are counted separately', rowFor().siteVisits === 3,
        String(rowFor().siteVisits));

    // 3. A double day.
    assign('2026-08-05', 'p_01', RATE_DOUBLE);
    same('a double day is one day of attendance and two of pay',
        [rowFor().attendanceDays, rowFor().payUnits], [3, 4]);

    // 4. Two sites on a double day. Two pay units, never four.
    assign('2026-08-06', 'p_01', RATE_DOUBLE);
    assign('2026-08-06', 'p_02');
    same('two sites on a double day is one day of attendance and two of pay',
        [rowFor().attendanceDays, rowFor().payUnits], [4, 6]);

    // 5. Extra hours change neither count.
    const before = [rowFor().attendanceDays, rowFor().payUnits];
    assign('2026-08-07', 'p_01', RATE_EXTRA, 3);
    same('extra hours add the day itself and nothing more',
        [rowFor().attendanceDays - before[0], rowFor().payUnits - before[1]], [1, 1]);
    check('and the hours are reported on their own', rowFor().extraHours === 3,
        String(rowFor().extraHours));

    // 6. An absence is not attendance.
    device.State.commit(device.call('markAbsent',
        device.State.schedule, '2026-08-08', 'w_01', 'actual'));
    same('an absence is counted as an absence, not as a day worked',
        [rowFor().attendanceDays, rowFor().payUnits, rowFor().absent], [5, 7, 1]);

    // 7. The total is the real arithmetic, not payUnits times today's rate.
    //
    // The rate is raised AFTER the days above were recorded, so every one of them keeps
    // the 450 it was worked at. 7 x 900 would be 6300, and that number would be a lie
    // about what these men were paid.
    device.State.schedule.workers[0].dailyRate = 900;
    device.State.commitRoster();
    const raised = rowFor();
    check('the days keep the rate they were worked at',
        raised.amount === 450 * 7 + 40 * 3, String(raised.amount));
    check('which is NOT pay units times the rate on screen today',
        raised.amount !== raised.payUnits * 900, String(raised.amount));
    check('and the sheet says the rate changed mid-period', raised.mixedRates === true);
}

// ---------------------------------------------------------------- leaving the crew
//
// Two ways out, and only one of them is ever safe for a man with anything recorded
// against him. Which one is offered is decided by the model, not by the screen.

// A crew, a site, and the dialogs answered for us. `answer` is what the person taps.
function crew(options = {}) {
    const device = makeDevice({ deviceId: options.deviceId || 'd_here' });
    device.State.schedule.workers = [
        { id: 'w_01', name: 'דוד', active: true, dailyRate: 400, hourlyRate: 50 },
        { id: 'w_02', name: 'שרה', active: true, dailyRate: 350, hourlyRate: 0 }
    ];
    device.State.schedule.places = [{ id: 'p_01', name: 'הרצליה', active: true }];
    device.State.save({ silent: true });

    const said = [];
    const asked = [];
    device.ctx.askConfirm = question => {
        asked.push(question);
        return Promise.resolve(options.answer !== false);
    };
    // Deleting asks for the name to be TYPED. The default answer is the name typed
    // correctly, so a test that is about something else does not have to care; a test
    // that is about the typing passes its own.
    device.ctx.askText = question => {
        asked.push(question);
        if (options.typed !== undefined) return Promise.resolve(options.typed);
        const title = String((question && question.title) || '');
        const name = title.replace('למחוק את ', '').replace('?', '');
        return Promise.resolve(name);
    };
    device.ctx.askTell = message => {
        said.push(typeof message === 'string' ? message : String(message.title || ''));
        return Promise.resolve();
    };
    return { device, said, asked };
}

const workerIds = device => device.State.schedule.workers.map(worker => worker.id).join();

// What a phone still on v78 sees. That build has no mergeRoster and no idea the keyed
// roster exists: it reads the whole array off the document and shows it. Copied here
// rather than imported, because the point is to be frozen - it must keep describing the
// old build after this one changes again.
function v78Reader(document) {
    return (Array.isArray(document && document.workers) ? document.workers : [])
        .filter(item => item && item.id)
        .map(item => ({ id: String(item.id), name: String(item.name || ''),
            active: item.active !== false }));
}

// Whether a document says anything about this id beyond "not here": a record in either
// form. A bare tombstone names nobody and cannot resurrect anybody.
function a_nameInDocument(document, id) {
    const doc = document || {};
    if ((doc.workers || []).some(item => item && String(item.id) === id)) return true;
    const map = (doc.roster && doc.roster.workers) || {};
    return Boolean(map[id]);
}

{
    suite('a worker this phone has never told anybody about can be deleted');

    // The one case deleting exists for, and the only one it is safe in: a name typed by
    // mistake on a device that has never handed it to a cloud. No adapter has ever seen
    // him, so no other phone can be holding a day for him, so there is nothing that can
    // arrive later and be orphaned by his removal.
    const { device } = crew();
    const added = device.State.nextWorkerId();
    device.State.schedule.workers.push(
        { id: added, name: 'טעות', active: true, dailyRate: 0, hourlyRate: 0 });
    given('he was added', device.State.commitRoster() === true);
    given('and nothing is recorded against him',
        device.call('workerFootprint', device.State.schedule, added).days.length === 0);
    given('and this device can prove it made him and never sent him',
        device.Sync.provenLocalOnly('workers', added) === true);

    await device.call('deleteWorker', added);
    await wait();

    check('he is off the screen', !workerIds(device).includes(added), workerIds(device));
    check('and off the disk',
        !String(device.raw('scheduleData:v2')).includes(added));

    // Closed and opened again.
    const again = makeDevice({ storage: device.dump(), deviceId: 'd_here' });
    again.State.load();
    check('he does not come back at the next open',
        !workerIds(again).includes(added), workerIds(again));

    // And when this device finally does connect, the cloud never hears the name at all:
    // the tombstone replaced the pending roster write on the same field path.
    const cloud = makeCloud();
    await connected(again, cloud);
    await wait();
    check('the cloud never learns who he was',
        !a_nameInDocument(cloud.doc, added), JSON.stringify(cloud.doc));
    check('and nothing in it could ever put him back',
        !again.call('normaliseSchedule', cloud.doc).workers.some(w => w.id === added),
        JSON.stringify(cloud.doc.workers.map(w => w.id)));

    // A new man never gets his id back.
    const minted = [device.State.nextWorkerId(), device.State.nextWorkerId()];
    check('and his id is never handed out again',
        !minted.includes(added) && minted[0] !== minted[1], JSON.stringify(minted));
}

{
    suite('a stale offline roster cannot resurrect a deleted worker');

    // THE MEASURED SEQUENCE. Two phones know him; one deletes him; the other was away
    // with the old crew in its pocket and comes back having changed something else
    // entirely. Before the fix the second phone's whole array was the last word and put
    // him back on every device, days and rates and all, with nothing on screen to
    // explain the return.
    const cloud = makeCloud();
    const a = crew({ deviceId: 'd_a' }).device;
    await connected(a, cloud);
    await wait();

    const doomed = a.State.nextWorkerId();
    a.State.schedule.workers.push(
        { id: doomed, name: 'זמני', active: true, dailyRate: 0, hourlyRate: 0 });
    a.State.commitRoster();
    await wait();
    given('both phones can see him', JSON.stringify(cloud.doc).includes(doomed));

    // The second phone catches up, then goes offline holding that roster.
    const b = crew({ deviceId: 'd_b' }).device;
    b.State.load();
    const bLink = await unplugged(b, cloud);
    await wait();
    given('the second phone has him too', workerIds(b).includes(doomed));
    bLink.away();

    // He is deleted on A. He is shared by now, so the screen would not offer it - this
    // is the model being driven directly, which is what makes the merge the thing under
    // test rather than the button.
    a.State.schedule.workers = a.State.schedule.workers.filter(item => item.id !== doomed);
    given('A removed him', a.State.commitRoster({ workers: [doomed] }) === true);
    await wait();
    check('the cloud holds a tombstone rather than a hole',
        cloud.doc.roster.workers[doomed] === null,
        JSON.stringify(cloud.doc.roster.workers));

    // B, still on the old roster, edits something unrelated and reconnects.
    b.State.schedule.places.push({ id: 'p_09', name: 'רמלה', active: true });
    b.State.commitRoster();
    await wait();
    await bLink.back();

    check('the deleted man does not come back to the cloud',
        !a.call('normaliseSchedule', cloud.doc).workers.some(w => w.id === doomed),
        JSON.stringify(cloud.doc.workers.map(w => w.id)));
    check('nor to the phone that deleted him',
        !workerIds(a).includes(doomed), workerIds(a));
    check('nor to the phone that was behind',
        !workerIds(b).includes(doomed), workerIds(b));
    check('while the unrelated edit did land',
        b.State.schedule.places.some(place => place.id === 'p_09'));

    // THE V78 READER. Everything above is about phones that understand the map. A phone
    // still on v78 reads the whole array and nothing else, so a tombstone is invisible to
    // it and the man is still in its crew - which is not "the document is right, the old
    // build is wrong", it is two people looking at one roster and seeing different crews.
    check('the raw array in the document no longer names him',
        !(cloud.doc.workers || []).some(item => item && item.id === doomed),
        JSON.stringify((cloud.doc.workers || []).map(item => item.id)));
    check('while the tombstone is still the authority',
        Object.prototype.hasOwnProperty.call(cloud.doc.roster.workers, doomed)
        && cloud.doc.roster.workers[doomed] === null,
        JSON.stringify(cloud.doc.roster.workers));
    check('so a frozen v78 reader sees him gone too',
        !v78Reader(cloud.doc).some(worker => worker.id === doomed),
        JSON.stringify(v78Reader(cloud.doc).map(worker => worker.id)));
    check('and still sees the two who are here',
        v78Reader(cloud.doc).map(worker => worker.id).join() === 'w_01,w_02',
        JSON.stringify(v78Reader(cloud.doc).map(worker => worker.id)));

    // No loop: the repair is a write about a disagreement, and the disagreement is gone.
    const settled = cloud.writes.length;
    await settle(TICK * 40);
    check('and the repair does not write again once the two forms agree',
        cloud.writes.length === settled, `${settled} -> ${cloud.writes.length}`);

    // And it stays gone across a reopen, which is what a stored null buys that a deleted
    // field does not.
    const reopened = makeDevice({ storage: b.dump(), deviceId: 'd_b' });
    reopened.State.load();
    const back = makeCloud({ doc: JSON.parse(JSON.stringify(cloud.doc)) });
    await connected(reopened, back);
    await wait();
    check('and he is still gone at the next open',
        !workerIds(reopened).includes(doomed), workerIds(reopened));
}

for (const [label, record] of [
    ['day', (device, id) => device.State.commit(device.call('assignPlace',
        device.State.schedule, '2026-08-12', id, 'actual', 'p_01'))],
    ['advance', (device, id) => device.State.commit(device.call('addAdvance',
        device.State.schedule, id, '2026-08-12', 300, ''))]
]) {
    suite(`an offline ${label} that arrives after a deletion is not orphaned`);

    // The other measured sequence. B records real work while it is away; A cannot see
    // it and removes the man; B reconnects. The work must not be discarded to keep the
    // deletion tidy, and it must not sit in the document belonging to nobody.
    const cloud = makeCloud();
    const a = crew({ deviceId: 'd_a' }).device;
    await connected(a, cloud);
    await wait();

    const doomed = a.State.nextWorkerId();
    a.State.schedule.workers.push(
        { id: doomed, name: 'יוסי', active: true, dailyRate: 400, hourlyRate: 0 });
    a.State.commitRoster();
    await wait();

    const b = crew({ deviceId: 'd_b' }).device;
    b.State.load();
    const bLink = await unplugged(b, cloud);
    await wait();
    given('both phones know him', workerIds(b).includes(doomed));

    // B goes away and does a day's work on him. Nothing leaves it and nothing reaches
    // it, so it still has him on its own roster - which is what makes it the last place
    // his name exists once A has removed him.
    bLink.away();
    record(b, doomed);
    await wait();
    given(`B has a queued ${label}`, b.Sync.pendingCount() > 0);

    // A, which can see none of that, is asked to delete him. The screen refuses,
    // because he has been shared - that is the whole point of the rule.
    const blockers = a.global('deletionBlockers');
    check('the model refuses a permanent deletion for a shared worker',
        blockers(doomed).some(reason => reason.includes('אי אפשר להוכיח')),
        JSON.stringify(blockers(doomed)));

    // Driven past the screen anyway, which is the state an older build could reach and
    // the state a document may already be in. The work still has to survive it.
    a.State.schedule.workers = a.State.schedule.workers.filter(item => item.id !== doomed);
    a.State.commitRoster({ workers: [doomed] });
    await wait();

    await bLink.back();

    const document = cloud.doc;
    check(`the cloud kept the ${label}`,
        JSON.stringify(document.days || {}).includes(doomed)
        || JSON.stringify(document.advances || {}).includes(doomed),
        JSON.stringify({ days: document.days, advances: document.advances }));
    check('and no reference is left pointing at nobody',
        a.call('fullScheduleProblems', document).length === 0,
        JSON.stringify(a.call('fullScheduleProblems', document)));

    const seen = a.call('normaliseSchedule', document).workers.find(w => w.id === doomed);
    check('the man has an identity again in the shared document', Boolean(seen),
        JSON.stringify(document.roster && document.roster.workers));
    check('archived rather than back in the crew', seen && seen.active === false,
        JSON.stringify(seen));
    check('and under his own name, which the phone holding the work still knew',
        seen && seen.name === 'יוסי', seen && seen.name);

    await settle(TICK * 40);
    check('the phone that deleted him sees the same thing rather than a hole',
        Boolean(a.State.worker(doomed)) && a.State.worker(doomed).active === false,
        JSON.stringify(a.State.worker(doomed)));

    const paid = b.call('payrollReport', b.State.schedule, '2026-08-01', '2026-08-31')
        .find(row => row.workerId === doomed);
    check(`the ${label} is counted for him rather than lost`,
        Boolean(paid) && (paid.attendanceDays > 0 || paid.advances > 0),
        JSON.stringify(paid));
}

{
    suite('a reinstated man comes back whole, not as a name and four blanks');

    // The measured result of restoring only the name: his phone and identity number go
    // blank, both rates go to zero, and a day recorded before rates were stamped onto the
    // day itself is then priced from a roster that says zero - so a week of work is worth
    // nothing and the report says so with a straight face.
    const device = crew().device;
    const full = {
        id: 'w_gone', name: 'סאמר', idNumber: '312445678', phone: '052-884-1930',
        dailyRate: 450, hourlyRate: 60, active: true
    };
    const document = {
        workers: [
            { id: 'w_01', name: 'דוד', active: true, dailyRate: 400, hourlyRate: 50 },
            full
        ],
        places: [{ id: 'p_01', name: 'הרצליה', active: true }],
        // Tombstoned in the keyed form, still whole in the stale array - which is the
        // only place his details survive.
        roster: { workers: { w_gone: null }, workerOrder: ['w_01'] },
        // An UNSTAMPED day: no rates of its own, so its value comes from the roster.
        days: { '2026-08-12': { plan: {}, actual: { w_gone: { entries: [{ placeId: 'p_01' }] } } } },
        advances: {}, updatedAt: '2026-08-12T10:00:00.000Z', updatedBy: 'd_a'
    };

    const before = device.call('payrollReport',
        device.call('normaliseSchedule', {
            workers: [full], places: document.places, days: document.days, advances: {},
            updatedAt: document.updatedAt, updatedBy: 'd_a'
        }), '2026-08-01', '2026-08-31').find(row => row.workerId === 'w_gone');
    given('the day is worth something while he is still in the crew',
        before.amount === 450, JSON.stringify(before));

    const merged = device.call('normaliseSchedule', document);
    const back = merged.workers.find(worker => worker.id === 'w_gone');
    check('he is back', Boolean(back), JSON.stringify(merged.workers.map(w => w.id)));
    check('archived, which is the one field this is allowed to decide',
        back && back.active === false, JSON.stringify(back));
    check('with his name', back && back.name === 'סאמר', back && back.name);
    check('his identity number', back && back.idNumber === '312445678',
        JSON.stringify(back && back.idNumber));
    check('his phone', back && back.phone === '052-884-1930', JSON.stringify(back && back.phone));
    check('his daily rate', back && back.dailyRate === 450, String(back && back.dailyRate));
    check('and his hourly rate', back && back.hourlyRate === 60, String(back && back.hourlyRate));

    const after = device.call('payrollReport', merged, '2026-08-01', '2026-08-31')
        .find(row => row.workerId === 'w_gone');
    check('so the day is worth exactly what it was worth before',
        after.amount === before.amount, `${after.amount} vs ${before.amount}`);
    check('and it is not the unknown a zeroed rate would have produced',
        after.amount === 450, JSON.stringify(after));
    check('and it is still one day of attendance', after.attendanceDays === 1,
        String(after.attendanceDays));
}

{
    suite('an id with no work behind it is not reinstated');

    // The other half of the same rule, and the thing that keeps it from being the
    // resurrection bug wearing a different hat: a stale array entry is not work.
    const device = crew().device;
    const document = {
        workers: [
            { id: 'w_01', name: 'דוד', active: true, dailyRate: 400, hourlyRate: 50 },
            { id: 'w_gone', name: 'רפאים', active: true, dailyRate: 400, hourlyRate: 0 }
        ],
        places: [{ id: 'p_01', name: 'הרצליה', active: true }],
        roster: { workers: { w_gone: null }, workerOrder: ['w_01'] },
        days: {}, advances: {}, updatedAt: '2026-08-12T10:00:00.000Z', updatedBy: 'd_a'
    };

    const merged = device.call('normaliseSchedule', document);
    check('the tombstone beats the stale array',
        !merged.workers.some(w => w.id === 'w_gone'),
        JSON.stringify(merged.workers.map(w => w.id)));

    document.days = { '2026-08-12': { plan: {}, actual: { w_gone: { entries: [{ placeId: 'p_01' }] } } } };
    const withWork = device.call('normaliseSchedule', document);
    const back = withWork.workers.find(w => w.id === 'w_gone');
    check('but a day behind the same id brings the identity back', Boolean(back));
    check('archived, and named from what the document still held',
        back && back.active === false && back.name === 'רפאים', JSON.stringify(back));
}

for (const [label, mark] of [
    ['a day in actual', device => device.State.commit(device.call('assignPlace',
        device.State.schedule, '2026-08-12', 'w_01', 'actual', 'p_01'))],
    ['a day in plan', device => device.State.commit(device.call('assignPlace',
        device.State.schedule, '2026-08-12', 'w_01', 'plan', 'p_01'))],
    ['a cleared day that is still a row', device => device.State.commit(
        device.call('clearWorkerDay', device.State.schedule, '2026-08-12', 'w_01', 'actual'))],
    ['an absence', device => device.State.commit(device.call('markAbsent',
        device.State.schedule, '2026-08-12', 'w_01', 'actual'))],
    ['an advance', device => device.State.commit(device.call('addAdvance',
        device.State.schedule, 'w_01', '2026-08-12', 300, ''))]
]) {
    suite(`a worker with ${label} cannot be deleted`);

    const { device, said } = crew();
    mark(device);
    const before = device.raw('scheduleData:v2');

    check('the model sees what is recorded against him',
        device.call('workerFootprint', device.State.schedule, 'w_01').days.length > 0
        || device.call('workerFootprint', device.State.schedule, 'w_01').advances.length > 0,
        JSON.stringify(device.call('workerFootprint', device.State.schedule, 'w_01')));

    await device.call('deleteWorker', 'w_01');
    await wait();

    check('he is still here', workerIds(device) === 'w_01,w_02', workerIds(device));
    check('the disk did not change', device.raw('scheduleData:v2') === before);
    check('and he was told why, rather than nothing happening',
        said.some(line => line.includes('לא נמחק')), JSON.stringify(said));

    // Archiving him is allowed, and is what the screen offers instead.
    await device.call('setWorkerArchived', 'w_01', true);
    await wait();
    check('archiving him is allowed',
        Boolean(device.State.worker('w_01')) && device.State.worker('w_01').active === false,
        JSON.stringify(device.State.worker('w_01')));
}

{
    suite('an archived worker leaves the crew and keeps his record');

    const { device } = crew();
    device.State.commit(device.call('assignPlace',
        device.State.schedule, '2026-08-12', 'w_01', 'actual', 'p_01'));
    device.State.commit(device.call('addAdvance',
        device.State.schedule, 'w_01', '2026-08-12', 100, ''));

    const paidBefore = device.call('payrollReport',
        device.State.schedule, '2026-08-01', '2026-08-31').find(row => row.workerId === 'w_01');
    given('he has a day and an advance on the sheet',
        paidBefore.attendanceDays === 1 && paidBefore.advances === 100);

    await device.call('setWorkerArchived', 'w_01', true);
    await wait();

    check('he is out of the active crew',
        device.State.activeWorkers().map(w => w.id).join() === 'w_02',
        device.State.activeWorkers().map(w => w.id).join());
    check('and off the day screen for a day he has nothing on',
        !device.State.workersForDay('2026-08-13', 'actual').some(w => w.id === 'w_01'),
        device.State.workersForDay('2026-08-13', 'actual').map(w => w.id).join());
    check('but still on the day he actually worked, or the day would lose him',
        device.State.workersForDay('2026-08-12', 'actual').some(w => w.id === 'w_01'));

    const paidAfter = device.call('payrollReport',
        device.State.schedule, '2026-08-01', '2026-08-31').find(row => row.workerId === 'w_01');
    check('the old report still has his day',
        paidAfter.attendanceDays === 1, String(paidAfter.attendanceDays));
    check('and his advance', paidAfter.advances === 100, String(paidAfter.advances));
    check('and his name', paidAfter.name === 'דוד', paidAfter.name);

    // Closed, reopened, and brought back.
    const again = makeDevice({ storage: device.dump(), deviceId: 'd_here' });
    again.State.load();
    again.ctx.askConfirm = () => Promise.resolve(true);
    again.ctx.askTell = () => Promise.resolve();
    check('he is still archived after a reopen',
        again.State.worker('w_01').active === false);

    await again.call('setWorkerArchived', 'w_01', false);
    await wait();
    check('and he can be put back to work',
        again.State.activeWorkers().map(w => w.id).sort().join() === 'w_01,w_02',
        again.State.activeWorkers().map(w => w.id).join());
    check('with his day still where it was',
        again.call('entriesFor', again.State.schedule, '2026-08-12', 'w_01', 'actual').length === 1);
}

{
    suite('an open advance is said out loud before a man is put away');

    const { device } = crew();
    device.State.commit(device.call('addAdvance',
        device.State.schedule, 'w_01', '2026-08-12', 250, ''));

    const owed = device.call('openAdvanceBalance', device.State.schedule, 'w_01');
    check('the balance is found', owed && owed.total === 250 && owed.count === 1,
        JSON.stringify(owed));
    check('and a man who took nothing has none',
        device.call('openAdvanceBalance', device.State.schedule, 'w_02') === null);
}

for (const [label, arm] of [
    ['the journal will not write', device => device.setQuota(key => key.startsWith('farkad:outbox'))],
    ['the schedule will not write', device => device.setQuota(key => key === 'scheduleData:v2')]
]) {
    suite(`${label}, the screen goes back to what the disk holds`);

    // Deleting.
    const { device } = crew();
    const added = device.State.nextWorkerId();
    device.State.schedule.workers.push(
        { id: added, name: 'טעות', active: true, dailyRate: 0, hourlyRate: 0 });
    given('he was added', device.State.commitRoster() === true);
    const diskBefore = device.raw('scheduleData:v2');
    const queueBefore = device.raw(device.Sync.activeOutboxKey());

    arm(device);
    await device.call('deleteWorker', added);
    await wait();
    device.setQuota(null);

    // Each branch is asserted against the state it is SUPPOSED to end in, named here in
    // full. "The screen and the reopen agree" is not that assertion: they agree just as
    // happily when both of them have lost the man, and that is a way this can fail.
    const again = makeDevice({ storage: device.dump(), deviceId: 'd_here' });
    again.State.load();

    if (label === 'the journal will not write') {
        // Nothing durable took the deletion, so the deletion did not happen. He is on
        // the screen, on the disk, and in the queue exactly as he was.
        check('the man is back on the screen', workerIds(device).includes(added),
            workerIds(device));
        check('and the disk never lost him', device.raw('scheduleData:v2') === diskBefore);
        check('and the queue is untouched',
            device.raw(device.Sync.activeOutboxKey()) === queueBefore);
        check('the next open has him too', workerIds(again).includes(added),
            workerIds(again));
        check('and the crew is the one it started as',
            workerIds(again) === `w_01,w_02,${added}`, workerIds(again));
    } else {
        // The journal took it, so the deletion IS durable even though the schedule blob
        // refused: the journal is what rebuilds the schedule at the next open, and the
        // intended end state is a crew without him, on the screen and at the next open.
        check('the deletion stands on the screen', !workerIds(device).includes(added),
            workerIds(device));
        check('and the next open rebuilds a crew without him',
            !workerIds(again).includes(added), workerIds(again));
        check('with the two men who were always there',
            workerIds(again) === 'w_01,w_02', workerIds(again));
    }

    // Archiving, the same way.
    const second = crew();
    second.device.State.commit(second.device.call('assignPlace',
        second.device.State.schedule, '2026-08-12', 'w_01', 'actual', 'p_01'));
    arm(second.device);
    await second.device.call('setWorkerArchived', 'w_01', true);
    await wait();
    second.device.setQuota(null);

    const reopened = makeDevice({ storage: second.device.dump(), deviceId: 'd_here' });
    reopened.State.load();
    const archivedNow = label === 'the journal will not write' ? true : false;

    check('archiving: the screen holds the state that is actually durable',
        second.device.State.worker('w_01').active === archivedNow,
        String(second.device.State.worker('w_01').active));
    check('and the next open holds the same one',
        reopened.State.worker('w_01').active === archivedNow,
        String(reopened.State.worker('w_01').active));
    check('his day survives either way',
        reopened.call('entriesFor',
            reopened.State.schedule, '2026-08-12', 'w_01', 'actual').length === 1);
}

{
    suite('archiving and restoring reach the other phone');

    // The baseline editRoster measures against used to be the very objects the app then
    // worked in, so setting worker.active = false changed the man AND the record he was
    // about to be compared with. editRoster found no difference and sent nothing: this
    // phone showed him archived and the other one still had him at work, with no error
    // anywhere and no second chance - the next edit compared equal too.
    const cloud = makeCloud();
    const a = crew({ deviceId: 'd_a' });
    await connected(a.device, cloud);
    a.device.State.commit(a.device.call('assignPlace',
        a.device.State.schedule, '2026-08-12', 'w_01', 'actual', 'p_01'));
    a.device.State.commit(a.device.call('addAdvance',
        a.device.State.schedule, 'w_01', '2026-08-12', 100, ''));
    await wait();

    const b = crew({ deviceId: 'd_b' });
    b.device.State.load();
    await connected(b.device, cloud);
    await settle(TICK * 20);
    given('both phones have the crew', workerIds(b.device).includes('w_01'));
    given('and his day', b.device.call('entriesFor',
        b.device.State.schedule, '2026-08-12', 'w_01', 'actual').length === 1);

    // Archived on the phone that ADOPTED the snapshot, which is where the fault lives:
    // its State.schedule holds the very objects normaliseSchedule produced, and those
    // were the objects the baseline was built from. Archiving on the phone that seeded
    // the document compares against a separately parsed copy and passes either way.
    await b.device.call('setWorkerArchived', 'w_01', true);
    await settle(TICK * 40);

    check('the archiving reaches the other phone',
        a.device.State.worker('w_01') && a.device.State.worker('w_01').active === false,
        JSON.stringify(a.device.State.worker('w_01')));
    check('and the cloud says so too',
        cloud.doc.roster.workers.w_01.active === false,
        JSON.stringify(cloud.doc.roster.workers.w_01));

    // Closed and reopened, both of them, against the same document.
    const a2 = makeDevice({ storage: a.device.dump(), deviceId: 'd_a' });
    a2.State.load();
    a2.ctx.askConfirm = () => Promise.resolve(true);
    a2.ctx.askTell = () => Promise.resolve();
    a2.ctx.askText = question => Promise.resolve(String(question.title));
    await connected(a2, cloud);
    const b2 = makeDevice({ storage: b.device.dump(), deviceId: 'd_b' });
    b2.State.load();
    b2.ctx.askConfirm = () => Promise.resolve(true);
    b2.ctx.askTell = () => Promise.resolve();
    b2.ctx.askText = question => Promise.resolve(String(question.title));
    await connected(b2, cloud);
    await settle(TICK * 20);
    given('he is still archived on both after a reopen',
        a2.State.worker('w_01').active === false && b2.State.worker('w_01').active === false);

    await b2.call('setWorkerArchived', 'w_01', false);
    await settle(TICK * 40);

    check('putting him back reaches the other phone as well',
        a2.State.worker('w_01') && a2.State.worker('w_01').active === true,
        JSON.stringify(a2.State.worker('w_01')));
    check('his day never moved',
        b2.call('entriesFor', b2.State.schedule, '2026-08-12', 'w_01', 'actual').length === 1);
    check('and neither did his advance',
        b2.call('advancesTotal', b2.State.schedule, 'w_01', '2026-08-01', '2026-08-31') === 100,
        String(b2.call('advancesTotal', b2.State.schedule, 'w_01', '2026-08-01', '2026-08-31')));
}

{
    suite('a snapshot that arrives while the archive question is open');

    // The question is open for as long as somebody takes to read it, and the schedule
    // can be replaced outright underneath it. Everything after the await has to be done
    // against the schedule as it is THEN.
    const { device } = crew();
    const cloud = makeCloud();
    await connected(device, cloud);
    await wait();

    device.ctx.askConfirm = () => {
        // A whole new schedule object, which is what receive() installs - the worker
        // captured before the question is now an orphan nothing on screen points at.
        const other = makeCloud();
        void other;
        device.State.schedule = device.call('normaliseSchedule', {
            workers: [
                { id: 'w_01', name: 'דוד', active: true, dailyRate: 400, hourlyRate: 50 },
                { id: 'w_02', name: 'שרה', active: true, dailyRate: 350, hourlyRate: 0 }
            ],
            places: [{ id: 'p_01', name: 'הרצליה', active: true }],
            days: { '2026-08-12': { plan: {}, actual: { w_01: { entries: [{ placeId: 'p_01' }] } } } },
            advances: {}, updatedAt: '2026-08-12T09:00:00.000Z', updatedBy: 'd_other'
        });
        return Promise.resolve(true);
    };

    await device.call('setWorkerArchived', 'w_01', true);
    await wait();

    check('the man on screen is the one that was archived',
        device.State.worker('w_01').active === false,
        JSON.stringify(device.State.worker('w_01')));
    check('and the day that arrived with the snapshot is still there',
        device.call('entriesFor', device.State.schedule, '2026-08-12', 'w_01', 'actual').length === 1);

    const reopened = makeDevice({ storage: device.dump(), deviceId: 'd_here' });
    reopened.State.load();
    check('the disk holds the same man, not the one that was captured first',
        reopened.State.worker('w_01').active === false,
        JSON.stringify(reopened.State.worker('w_01')));
}

{
    suite('deleting asks for the name to be typed, not for one more tap');

    // The difference between archiving and deleting is the whole of what this screen
    // does, and a confirmation that is one more tap in the same place as the last tap is
    // not a decision.
    const { device } = crew();
    const added = device.State.nextWorkerId();
    device.State.schedule.workers.push(
        { id: added, name: 'טעות', active: true, dailyRate: 0, hourlyRate: 0 });
    device.State.commitRoster();

    let asked = null;
    device.ctx.askText = question => { asked = question; return Promise.resolve(null); };
    device.ctx.askConfirm = () => Promise.resolve(true);

    await device.call('deleteWorker', added);
    await wait();

    check('it is the typing dialog that is opened', Boolean(asked), String(asked));
    check('and it asks for the name', String(asked.message).includes('הקלד את שם העובד'),
        String(asked.message));
    check('the right name is accepted', asked.validate('טעות') === null,
        String(asked.validate('טעות')));
    check('a near miss is not', typeof asked.validate('טעו') === 'string',
        String(asked.validate('טעו')));
    check('and another name is not', typeof asked.validate('דוד') === 'string',
        String(asked.validate('דוד')));
    check('backing out of it deletes nobody', workerIds(device).includes(added),
        workerIds(device));
}

{
    suite('a snapshot that arrives while the delete question is open');

    const { device, said } = crew();
    const added = device.State.nextWorkerId();
    device.State.schedule.workers.push(
        { id: added, name: 'טעות', active: true, dailyRate: 0, hourlyRate: 0 });
    given('he was added and is deletable', device.State.commitRoster() === true
        && device.global('deletionBlockers')(added).length === 0);

    // The day arrives from another phone WHILE the name is being typed.
    device.ctx.askText = question => {
        device.State.commit(device.call('assignPlace',
            device.State.schedule, '2026-08-12', added, 'actual', 'p_01'));
        return Promise.resolve(String(question.title).replace('למחוק את ', '').replace('?', ''));
    };

    await device.call('deleteWorker', added);
    await wait();

    check('he is not deleted', workerIds(device).includes(added), workerIds(device));
    check('the day that arrived is still his',
        device.call('entriesFor', device.State.schedule, '2026-08-12', added, 'actual').length === 1);
    check('and the refusal was said out loud',
        said.some(line => line.includes('לא נמחק')), JSON.stringify(said));
}

for (const [label, act] of [
    ['archive', device => device.call('setWorkerArchived', 'w_01', true)],
    ['delete', device => device.call('deleteWorker', 'w_01')]
]) {
    suite(`saying no to ${label} changes nothing at all`);

    const { device } = crew({ answer: false, typed: null });
    const diskBefore = device.raw('scheduleData:v2');
    const queueBefore = device.raw(device.Sync.activeOutboxKey());
    const rendersBefore = device.renders.count;

    await act(device);
    await wait();

    check('the crew is untouched', workerIds(device) === 'w_01,w_02', workerIds(device));
    check('and he is still at work', device.State.worker('w_01').active === true);
    check('the disk is byte for byte what it was',
        device.raw('scheduleData:v2') === diskBefore);
    check('the queue is byte for byte what it was',
        device.raw(device.Sync.activeOutboxKey()) === queueBefore);
    check('and nothing was redrawn as if something had happened',
        device.renders.count === rendersBefore,
        `${rendersBefore} -> ${device.renders.count}`);
}

{
    suite('the archive warning says what the record says, and no more');

    // The schema has no paid, open or settled state on an advance - it is an amount on a
    // date. The warning used to read "שטרם קוזזו", not yet deducted, which is a fact
    // about somebody's money that nothing in this app knows.
    const { device, asked } = crew();
    device.State.commit(device.call('addAdvance',
        device.State.schedule, 'w_01', '2026-08-12', 250, ''));
    device.State.commit(device.call('addAdvance',
        device.State.schedule, 'w_01', '2026-08-13', 150, ''));

    await device.call('setWorkerArchived', 'w_01', true);
    await wait();

    const message = String((asked[asked.length - 1] || {}).message || '');
    check('the count and the total are both in it',
        message.includes('2') && message.includes('400'), message);
    check('and it claims nothing about them being settled or not',
        !message.includes('קוזז') && !message.includes('טרם'), message);
    await device.call('setWorkerArchived', 'w_02', true);
    await wait();
    check('a man with no advances is asked nothing about them',
        !String((asked[asked.length - 1] || {}).message || '').includes('מקדמות'),
        String((asked[asked.length - 1] || {}).message || ''));
}

{
    suite('putting a man back into a crew that already has his name');

    const { device, asked } = crew();
    device.State.schedule.workers.push(
        { id: 'w_03', name: 'דוד', active: false, dailyRate: 400, hourlyRate: 0 });
    device.State.commitRoster();

    await device.call('setWorkerArchived', 'w_03', false);
    await wait();

    check('the clash is said before he is put back',
        asked.some(question => String(question.title || '').includes('כבר יש עובד פעיל בשם')),
        JSON.stringify(asked.map(q => q.title)));
    check('and on a yes he does come back',
        device.State.worker('w_03').active === true);

    // And on a no, nothing moves.
    const second = crew({ answer: false });
    second.device.State.schedule.workers.push(
        { id: 'w_03', name: 'דוד', active: false, dailyRate: 400, hourlyRate: 0 });
    second.device.State.commitRoster();
    await second.device.call('setWorkerArchived', 'w_03', false);
    await wait();
    check('refusing the clash leaves him in the archive',
        second.device.State.worker('w_03').active === false);
}

{
    suite('a queued DAY holds a deletion; a queued roster entry does not');

    // The distinction that keeps this usable. A device with no cloud never acknowledges
    // anything, so its journal holds every roster edit it has ever made - and counting
    // those would mean a name typed by mistake could never be removed on the one kind of
    // device where that happens most.
    const { device } = crew();
    const cloud = makeCloud({ online: false });
    await connected(device, cloud);

    const added = device.State.nextWorkerId();
    device.State.schedule.workers.push(
        { id: added, name: 'חדש', active: true, dailyRate: 300, hourlyRate: 0 });
    given('he was added with no connection', device.State.commitRoster() === true);
    given('and the queue does hold roster entries naming him',
        String(device.raw(device.Sync.activeOutboxKey())).includes(added));

    check('a roster entry alone does not hold the deletion',
        device.Sync.queueNamesWorker(added) === false);
    check('and this device can prove he was made here and never sent',
        device.Sync.provenLocalOnly('workers', added) === true);
    await device.call('deleteWorker', added);
    await wait();
    check('so the name typed by mistake can go, cloud or no cloud',
        !workerIds(device).includes(added), workerIds(device));
    check('and the write that would have carried him was replaced, not queued behind him',
        !String(device.raw(device.Sync.activeOutboxKey()) || '').includes(`"name":"חדש"`),
        String(device.raw(device.Sync.activeOutboxKey())));

    // A queued DAY is a different thing, and it does hold.
    const second = crew();
    const cloud2 = makeCloud({ online: false });
    await connected(second.device, cloud2);
    const other = second.device.State.nextWorkerId();
    second.device.State.schedule.workers.push(
        { id: other, name: 'חדש', active: true, dailyRate: 300, hourlyRate: 0 });
    second.device.State.commitRoster();
    second.device.State.commit(second.device.call('assignPlace',
        second.device.State.schedule, '2026-08-12', other, 'actual', 'p_01'));

    check('a queued day does hold it',
        second.device.Sync.queueNamesWorker(other) === true);
    await second.device.call('deleteWorker', other);
    await wait();
    check('and he stays', workerIds(second.device).includes(other),
        workerIds(second.device));
    check('with the reason said out loud',
        second.said.some(line => line.includes('לא נמחק')), JSON.stringify(second.said));
}

{
    suite('once a write has been handed over, the name can never be deleted again');

    // Where the line is, exactly. Not "was it acknowledged" - a write can land on the
    // server and its answer be lost on the way back, and the SDK holds an offline write
    // and sends it later without asking. The honest moment is the handover: from then on
    // this device cannot say the name never left it, so from then on it archives.
    const { device } = crew();
    const cloud = makeCloud({ online: false });
    await connected(device, cloud);

    const added = device.State.nextWorkerId();
    device.State.schedule.workers.push(
        { id: added, name: 'חדש', active: true, dailyRate: 300, hourlyRate: 0 });
    device.State.commitRoster();
    given('nothing has gone out yet', device.Sync.provenLocalOnly('workers', added) === true);

    // The send is attempted and REFUSED - the cloud is offline. It still counts.
    await settle(TICK * 20);
    given('the send was attempted', cloud.attempts.length > 0);
    check('a refused send still counts as handed over',
        device.Sync.provenLocalOnly('workers', added) === false);

    const blockers = device.global('deletionBlockers');
    check('so the screen stops offering to delete him',
        blockers(added).some(reason => reason.includes('אי אפשר להוכיח')),
        JSON.stringify(blockers(added)));

    await device.call('deleteWorker', added);
    await wait();
    check('and driving the function directly does not delete him either',
        workerIds(device).includes(added), workerIds(device));

    // Across a close and reopen, which is the whole reason the ledger is on disk: the
    // question is asked in a session that did not watch the write go out.
    const again = makeDevice({ storage: device.dump(), deviceId: 'd_here' });
    again.State.load();
    check('the record survives the app being closed',
        again.Sync.provenLocalOnly('workers', added) === false);
}

{
    suite('a crew upgraded from v78 is never offered for deletion');

    // The upgrade, exactly as it happens: a v78 phone had no provenance record at all,
    // because v78 had no such thing. Read as "nothing has ever left this device" - which
    // is what the record this replaced said - every man in the crew looks like a typo
    // that can be destroyed, on the first offline open, with no cloud to argue.
    const frozen = {
        schemaVersion: 2,
        workers: [
            { id: 'w_01', name: 'דוד', active: true, dailyRate: 400, hourlyRate: 50 },
            { id: 'w_02', name: 'שרה', active: true, dailyRate: 350, hourlyRate: 0 }
        ],
        places: [{ id: 'p_01', name: 'הרצליה', active: true }],
        days: {}, advances: {},
        updatedAt: '2026-07-01T08:00:00.000Z', updatedBy: 'd_v78'
    };

    const device = makeDevice({
        deviceId: 'd_here',
        storage: { 'scheduleData:v2': JSON.stringify(frozen) }
    });
    device.ctx.askConfirm = () => Promise.resolve(true);
    device.ctx.askText = question => Promise.resolve(
        String(question.title).replace('למחוק את ', '').replace('?', ''));
    const said = [];
    device.ctx.askTell = message => {
        said.push(typeof message === 'string' ? message : String(message.title || ''));
        return Promise.resolve();
    };
    device.State.load();

    given('the v78 crew opened', workerIds(device) === 'w_01,w_02', workerIds(device));
    given('and there is no provenance record on the disk',
        device.raw('farkad:provenance:v1') === null);
    given('and no cloud has ever been connected', device.Sync.adapter === null);
    given('and nothing at all is recorded against him',
        device.call('workerFootprint', device.State.schedule, 'w_01').days.length === 0
        && device.call('workerFootprint', device.State.schedule, 'w_01').advances.length === 0);

    check('a worker read out of a v78 schedule is not provably local',
        device.Sync.provenLocalOnly('workers', 'w_01') === false);
    const blockers = device.global('deletionBlockers');
    check('so the screen has a reason not to offer deletion',
        blockers('w_01').length > 0, JSON.stringify(blockers('w_01')));
    check('and the reason is the provenance, not a footprint',
        blockers('w_01').some(reason => reason.includes('אי אפשר להוכיח')),
        JSON.stringify(blockers('w_01')));

    await device.call('deleteWorker', 'w_01');
    await wait();
    check('driving the function directly does not delete him either',
        workerIds(device) === 'w_01,w_02', workerIds(device));
    check('and he was told why', said.some(line => line.includes('לא נמחק')),
        JSON.stringify(said));

    // Archiving is what is offered instead, and it works.
    await device.call('setWorkerArchived', 'w_01', true);
    await wait();
    check('archiving him is allowed', device.State.worker('w_01').active === false);
}

{
    suite('a worker who arrived in a restore has no provenance either');

    // Even a man made on THIS device stops being provably local once a whole document
    // has been laid over the top: what survived the swap arrived inside somebody else's
    // roster, and this device cannot tell the two apart.
    const { device } = crew();
    const added = device.State.nextWorkerId();
    device.State.schedule.workers.push(
        { id: added, name: 'טעות', active: true, dailyRate: 0, hourlyRate: 0 });
    device.State.commitRoster();
    given('he is deletable before the restore',
        device.Sync.provenLocalOnly('workers', added) === true);

    const incoming = device.call('normaliseSchedule', {
        workers: [
            { id: 'w_01', name: 'דוד', active: true, dailyRate: 400, hourlyRate: 50 },
            { id: added, name: 'טעות', active: true, dailyRate: 0, hourlyRate: 0 },
            { id: 'w_imported', name: 'מיובא', active: true, dailyRate: 300, hourlyRate: 0 }
        ],
        places: [{ id: 'p_01', name: 'הרצליה', active: true }],
        days: {}, advances: {},
        updatedAt: '2026-08-01T08:00:00.000Z', updatedBy: 'd_backup'
    });
    const result = await device.Sync.replaceEverything(incoming);
    given('the restore landed', result.ok === true, JSON.stringify(result));

    check('the imported worker is not provably local',
        device.Sync.provenLocalOnly('workers', 'w_imported') === false);
    check('and neither is the one that was minted here before it',
        device.Sync.provenLocalOnly('workers', added) === false);

    const blockers = device.global('deletionBlockers');
    check('so neither of them can be deleted',
        blockers('w_imported').length > 0 && blockers(added).length > 0,
        JSON.stringify([blockers('w_imported'), blockers(added)]));

    // Across a reopen, which is where a memory-only record would forget.
    const again = makeDevice({ storage: device.dump(), deviceId: 'd_here' });
    again.State.load();
    check('and still not after the app is closed and opened',
        again.Sync.provenLocalOnly('workers', added) === false
        && again.Sync.provenLocalOnly('workers', 'w_imported') === false);
}

{
    suite('a typo made here in v79 is still deletable after a reopen');

    // The one case deleting exists for has to keep working, or the rule is just a ban.
    const { device } = crew();
    const added = device.State.nextWorkerId();
    device.State.schedule.workers.push(
        { id: added, name: 'טעות', active: true, dailyRate: 0, hourlyRate: 0 });
    given('he was added', device.State.commitRoster() === true);
    given('and nothing was ever handed to an adapter', device.Sync.adapter === null);

    const again = makeDevice({ storage: device.dump(), deviceId: 'd_here' });
    again.State.load();
    again.ctx.askConfirm = () => Promise.resolve(true);
    again.ctx.askTell = () => Promise.resolve();
    again.ctx.askText = question => Promise.resolve(
        String(question.title).replace('למחוק את ', '').replace('?', ''));

    check('the proof survived the close and reopen',
        again.Sync.provenLocalOnly('workers', added) === true);
    check('and the screen offers the deletion',
        again.global('deletionBlockers')(added).length === 0,
        JSON.stringify(again.global('deletionBlockers')(added)));

    await again.call('deleteWorker', added);
    await wait();
    check('and he goes', !workerIds(again).includes(added), workerIds(again));
}

{
    suite('nothing leaves the device until the proof that it left is on the disk');

    // The measured sequence: the write lands in the cloud, the record that says so is
    // refused by a full disk, the queue is acknowledged and pruned, the app is closed -
    // and at the next open a man who is on three phones looks like a typo.
    const { device } = crew();
    const cloud = makeCloud();
    const added = device.State.nextWorkerId();
    device.State.schedule.workers.push(
        { id: added, name: 'חדש', active: true, dailyRate: 300, hourlyRate: 0 });
    device.State.commitRoster();

    // The disk refuses the provenance record and nothing else.
    device.setQuota(key => key === 'farkad:provenance:v1');
    await connected(device, cloud);
    await settle(TICK * 30);

    check('the payload was never handed to the adapter',
        cloud.attempts.length === 0, JSON.stringify(cloud.attempts.map(a => a.kind)));
    check('the cloud holds nothing', cloud.doc === null, JSON.stringify(cloud.doc));
    check('the queue still has the work', device.Sync.pendingCount() > 0,
        String(device.Sync.pendingCount()));
    check('and the failure is reported rather than passed over',
        device.Sync.status === 'error', device.Sync.status);
    check('while the local record of the man is untouched',
        workerIds(device).includes(added), workerIds(device));

    // Room again: the retry sends it, and the proof lands with it.
    device.setQuota(null);
    device.Sync.flush();
    await settle(TICK * 40);

    check('once there is room the write goes out', cloud.attempts.length > 0);
    check('and the cloud has him', JSON.stringify(cloud.doc || {}).includes(added));
    check('the proof is on the disk now',
        String(device.raw('farkad:provenance:v1')).includes(added),
        String(device.raw('farkad:provenance:v1')));
    check('so he can no longer be deleted',
        device.Sync.provenLocalOnly('workers', added) === false);

    const again = makeDevice({ storage: device.dump(), deviceId: 'd_here' });
    again.State.load();
    check('and not after a reopen either',
        again.Sync.provenLocalOnly('workers', added) === false);
}

{
    suite('a day and an advance name a worker just as loudly as a roster entry');

    // days.<date>.<layer>.<id> puts that id in the cloud. Leaving days and advances out
    // of the record was the same mistake as leaving out the whole arrays.
    const { device } = crew();
    const cloud = makeCloud();
    await connected(device, cloud);
    await wait();

    const byDay = device.State.nextWorkerId();
    const byAdvance = device.State.nextWorkerId();
    device.State.schedule.workers.push(
        { id: byDay, name: 'א', active: true, dailyRate: 300, hourlyRate: 0 },
        { id: byAdvance, name: 'ב', active: true, dailyRate: 300, hourlyRate: 0 });

    const leaving = device.Sync.idsLeaving({
        [`days.2026-08-12.actual.${byDay}`]: { entries: [{ placeId: 'p_01' }] },
        'advances.a_1': { id: 'a_1', workerId: byAdvance, date: '2026-08-12', amount: 100 }
    });
    check('a day path names its worker', leaving.workers.has(byDay));
    check('the site inside it is named too', leaving.places.has('p_01'));
    check('and an advance names the man it belongs to', leaving.workers.has(byAdvance));
}

{
    suite('an unreadable provenance record refuses every deletion');

    // Unreadable is not "nothing was ever made here". It is no idea, and no idea is not a
    // reason to delete somebody - the same rule the queue check has always used.
    const device = makeDevice({ deviceId: 'd_here' });
    device.putRaw('farkad:provenance:v1', '{ this is not json');
    device.State.load();

    check('a damaged record proves nothing about a worker',
        device.Sync.provenLocalOnly('workers', 'w_01') === false);
    check('nor about a site', device.Sync.provenLocalOnly('places', 'p_01') === false);

    // And a NEW id minted while it is damaged is not deletable either: the write that
    // would record him cannot be read back, so nothing about him can be proven.
    const minted = device.State.nextWorkerId();
    check('and an id minted while it is damaged is not deletable either',
        device.Sync.provenLocalOnly('workers', minted) === false, minted);
}

{
    suite('one man, one number - however it was typed');

    const device = makeDevice({ deviceId: 'd_here' });
    const same = device.call('samePhone');
    void same;

    const pairs = [
        ['052-884-1930', '052 884 1930'],
        ['052-884-1930', '0528841930'],
        ['052-884-1930', '+972-52-884-1930'],
        ['052-884-1930', '972528841930'],
        ['052-884-1930', '52-884-1930'],
        ['052-884-1930', ' 052.884.1930 ']
    ];
    pairs.forEach(([one, other]) => {
        check(`${one} and ${other} are one number`,
            device.call('samePhone', one, other) === true,
            `${device.call('normalisePhone', one)} vs ${device.call('normalisePhone', other)}`);
    });

    check('two different numbers are not',
        device.call('samePhone', '052-884-1930', '052-884-1931') === false);
    check('and an empty number matches nothing, including another empty one',
        device.call('samePhone', '', '') === false
        && device.call('samePhone', '', '052-884-1930') === false);

    // Archived rows count. The man about to be entered again is exactly the one the
    // daily list is not showing.
    const schedule = device.call('normaliseSchedule', {
        workers: [
            { id: 'w_01', name: 'דוד', phone: '052-884-1930', active: true },
            { id: 'w_02', name: 'שרה', phone: '050-1234567', active: true },
            { id: 'w_03', name: 'סאמר', phone: '+972 52 884 1930', active: false }
        ],
        places: [], days: {}, advances: {},
        updatedAt: '2026-08-12T10:00:00.000Z', updatedBy: 'd_a'
    });

    const sharing = device.call('workersSharingPhone', schedule, '0528841930', 'w_new');
    check('both the active man and the archived one are found',
        sharing.map(worker => worker.id).sort().join() === 'w_01,w_03',
        JSON.stringify(sharing.map(worker => worker.id)));
    check('and the man being edited is not counted against himself',
        device.call('workersSharingPhone', schedule, '052-884-1930', 'w_01')
            .map(worker => worker.id).join() === 'w_03');
}

{
    suite('one press of the arrow is one visible change');

    // [active, archived, active]: moving the first man down one ARRAY slot stepped over
    // the archived row, which is not on this screen - so the write went out, the other
    // phones took it, and on screen absolutely nothing happened.
    const { device } = crew();
    device.State.schedule.workers = [
        { id: 'w_a', name: 'א', active: true, dailyRate: 400, hourlyRate: 0 },
        { id: 'w_x', name: 'ארכיון', active: false, dailyRate: 400, hourlyRate: 0 },
        { id: 'w_b', name: 'ב', active: true, dailyRate: 400, hourlyRate: 0 }
    ];
    device.State.save({ silent: true });

    const activeOrder = () => device.State.schedule.workers
        .filter(worker => worker.active !== false).map(worker => worker.id).join();
    const allOrder = () => device.State.schedule.workers.map(worker => worker.id).join();

    given('the visible order starts as A then B', activeOrder() === 'w_a,w_b');

    device.call('moveWorker', 'w_a', 1);
    check('one press moves him past the man he can see',
        activeOrder() === 'w_b,w_a', activeOrder());
    check('and the archived row has not moved',
        allOrder() === 'w_b,w_x,w_a', allOrder());

    device.call('moveWorker', 'w_a', -1);
    check('and back again', activeOrder() === 'w_a,w_b', activeOrder());
    check('with the archived row still where it was',
        allOrder() === 'w_a,w_x,w_b', allOrder());

    // The ends do nothing, rather than something invisible.
    const before = allOrder();
    device.call('moveWorker', 'w_a', -1);
    device.call('moveWorker', 'w_b', 1);
    check('the top man cannot go up and the bottom man cannot go down',
        allOrder() === before, `${before} -> ${allOrder()}`);
}

{
    suite('reordering a crew with archived men scattered through it');

    const { device } = crew();
    device.State.schedule.workers = [
        { id: 'w_x1', name: 'ארכיון א', active: false, dailyRate: 0, hourlyRate: 0 },
        { id: 'w_a', name: 'א', active: true, dailyRate: 400, hourlyRate: 0 },
        { id: 'w_x2', name: 'ארכיון ב', active: false, dailyRate: 0, hourlyRate: 0 },
        { id: 'w_b', name: 'ב', active: true, dailyRate: 400, hourlyRate: 0 },
        { id: 'w_x3', name: 'ארכיון ג', active: false, dailyRate: 0, hourlyRate: 0 },
        { id: 'w_c', name: 'ג', active: true, dailyRate: 400, hourlyRate: 0 }
    ];
    device.State.save({ silent: true });

    const active = () => device.State.schedule.workers
        .filter(worker => worker.active !== false).map(worker => worker.id).join();
    const archived = () => device.State.schedule.workers
        .filter(worker => worker.active === false).map(worker => worker.id).join();

    given('three men with three archived rows between them', active() === 'w_a,w_b,w_c');

    // Every press, from every position, moves exactly one place in the visible list.
    device.call('moveWorker', 'w_c', -1);
    check('the last man moves up one', active() === 'w_a,w_c,w_b', active());
    device.call('moveWorker', 'w_c', -1);
    check('and up one again', active() === 'w_c,w_a,w_b', active());
    device.call('moveWorker', 'w_a', 1);
    check('a man in the middle moves down one', active() === 'w_c,w_b,w_a', active());
    check('and the archived men have not moved at all',
        archived() === 'w_x1,w_x2,w_x3', archived());
    check('while the crew is still the same six',
        device.State.schedule.workers.length === 6);
}

{
    suite('the queued whole array is cleaned on the disk, not only on the way past');

    // The queue is the one copy of the old roster still on its way OUT of this device.
    // Filtering it at replay time fixes what is on screen and sends the stale array
    // anyway, because the flush reads what is STORED.
    const { device } = crew();
    const doomed = device.State.nextWorkerId();
    device.State.schedule.workers.push(
        { id: doomed, name: 'זמני', active: true, dailyRate: 0, hourlyRate: 0 });
    given('he was queued in the whole array', device.State.commitRoster() === true);

    const queuedArray = source => {
        const raw = JSON.parse(String((source || device).raw(
            (source || device).Sync.activeOutboxKey())));
        return JSON.stringify(raw.items.workers.value);
    };
    given('and the stored queue really does hold him in it',
        queuedArray().includes(doomed), queuedArray());

    // The tombstone arrives.
    device.Sync.sanitiseQueuedRosters({
        workers: new Set([doomed]), places: new Set()
    });

    check('the STORED array no longer names him',
        !queuedArray().includes(doomed), queuedArray());
    check('while the two who are still here are untouched',
        queuedArray().includes('w_01') && queuedArray().includes('w_02'), queuedArray());

    // And across a reopen, because the disk is the point.
    const again = makeDevice({ storage: device.dump(), deviceId: 'd_here' });
    again.State.load();
    check('and the next session does not find him queued either',
        !queuedArray(again).includes(doomed), queuedArray(again));
}

{
    suite('a document whose own array disagrees with its own tombstone is repaired');

    // Written by a phone still on v78: it cannot see the keyed roster, so it writes the
    // whole array it holds - the man included - straight over the top of a tombstone it
    // has no idea is there. The two forms now disagree, and every v78 reader is on the
    // wrong side of the disagreement until a v79 phone says so.
    const cloud = makeCloud();
    const a = crew({ deviceId: 'd_a' }).device;
    await connected(a, cloud);
    await wait();

    const doomed = a.State.nextWorkerId();
    a.State.schedule.workers.push(
        { id: doomed, name: 'זמני', active: true, dailyRate: 0, hourlyRate: 0 });
    a.State.commitRoster();
    await wait();

    a.State.schedule.workers = a.State.schedule.workers.filter(item => item.id !== doomed);
    a.State.commitRoster({ workers: [doomed] });
    await settle(TICK * 30);
    given('the tombstone is in the document', cloud.doc.roster.workers[doomed] === null);
    given('and the array agrees for now',
        !cloud.doc.workers.some(item => item.id === doomed));

    // The v78 phone writes its whole array back, over the top.
    cloud.doc.workers = cloud.doc.workers.concat([
        { id: doomed, name: 'זמני', active: true, dailyRate: 0, hourlyRate: 0 }]);
    cloud.doc.updatedAt = '2030-01-01T00:00:00.000Z';
    cloud.doc.updatedBy = 'd_v78';
    given('a frozen v78 reader now sees him again',
        v78Reader(cloud.doc).some(worker => worker.id === doomed),
        JSON.stringify(v78Reader(cloud.doc).map(worker => worker.id)));

    cloud.subscribers.forEach(fn => fn(JSON.parse(JSON.stringify(cloud.doc))));
    await settle(TICK * 40);

    check('the v79 phone repairs the array it disagrees with',
        !cloud.doc.workers.some(item => item.id === doomed),
        JSON.stringify(cloud.doc.workers.map(item => item.id)));
    check('so the v78 reader loses him again too',
        !v78Reader(cloud.doc).some(worker => worker.id === doomed),
        JSON.stringify(v78Reader(cloud.doc).map(worker => worker.id)));
    check('and the tombstone is still the authority',
        cloud.doc.roster.workers[doomed] === null,
        JSON.stringify(cloud.doc.roster.workers[doomed]));
    check('while the phone itself never showed him',
        !workerIds(a).includes(doomed), workerIds(a));

    const settled = cloud.writes.length;
    await settle(TICK * 40);
    check('and the repair stops once the two forms agree',
        cloud.writes.length === settled, `${settled} -> ${cloud.writes.length}`);
}

{
    suite('a queue that could not be cleaned is never sent');

    // The rewrite is refused - a full disk - so the ORIGINAL entry stays on the disk with
    // the removed man still inside its whole array. Carrying on from there would adopt the
    // snapshot, call the device synced, and then flush him straight back into the document
    // where every v78 reader picks him up again.
    const cloud = makeCloud();
    const a = crew({ deviceId: 'd_a' }).device;
    await connected(a, cloud);
    await wait();

    const doomed = a.State.nextWorkerId();
    a.State.schedule.workers.push(
        { id: doomed, name: 'זמני', active: true, dailyRate: 0, hourlyRate: 0 });
    a.State.commitRoster();
    await wait();

    const b = crew({ deviceId: 'd_b' }).device;
    b.State.load();
    const bLink = await unplugged(b, cloud);
    await wait();
    given('both phones know him', workerIds(b).includes(doomed));

    // B goes away and edits the roster, so its queue holds a whole array with him in it.
    bLink.away();
    b.State.schedule.places.push({ id: 'p_09', name: 'רמלה', active: true });
    b.State.commitRoster();
    await wait();
    // Empty once it has been acknowledged and pruned, which is the shape success takes.
    const queuedNames = () => {
        const raw = JSON.parse(String(b.raw(b.Sync.activeOutboxKey())) || '{}');
        const entry = (raw.items || {}).workers;
        return entry ? JSON.stringify(entry.value) : '';
    };
    given('B has him queued in a whole array', queuedNames().includes(doomed));
    const queuedBefore = String(b.raw(b.Sync.activeOutboxKey()));

    // A removes him. B comes back with no room to rewrite its queue.
    a.State.schedule.workers = a.State.schedule.workers.filter(item => item.id !== doomed);
    a.State.commitRoster({ workers: [doomed] });
    await settle(TICK * 30);
    given('the cloud has the tombstone', cloud.doc.roster.workers[doomed] === null);

    // Only what happens from HERE on. A's own early writes carried him quite properly -
    // he was in the crew then.
    //
    // The final document is not enough on its own: the other phone repairs a disagreement
    // it sees, so a stale array that DID go out would be tidied away behind us and this
    // would pass over the very thing it is here for.
    const fromWrite = cloud.writes.length;
    const everSentHim = () => cloud.writes.slice(fromWrite).some(write => {
        const carried = write.kind === 'update'
            ? [write.patch && write.patch.workers]
            : [write.data && write.data.workers];
        return carried.some(list =>
            Array.isArray(list) && list.some(item => item && item.id === doomed));
    });

    b.setQuota(key => String(key).startsWith('farkad:outbox'));
    await bLink.back();

    check('B does not call itself synced', b.Sync.status !== 'synced', b.Sync.status);
    check('and no write ever carried him in a whole array', !everSentHim(),
        JSON.stringify(cloud.writes.map(write => write.kind)));
    check('and the queue is byte for byte what it was',
        String(b.raw(b.Sync.activeOutboxKey())) === queuedBefore);
    check('the removed man was NOT put back into the cloud',
        !(cloud.doc.workers || []).some(item => item && item.id === doomed),
        JSON.stringify((cloud.doc.workers || []).map(item => item.id)));
    check('so a frozen v78 reader does not see him either',
        !v78Reader(cloud.doc).some(worker => worker.id === doomed),
        JSON.stringify(v78Reader(cloud.doc).map(worker => worker.id)));

    // Pushing harder: even a flush asked for directly is refused while the queue is dirty.
    b.Sync.flush();
    await settle(TICK * 30);
    check('a flush while the queue is dirty sends nothing',
        !(cloud.doc.workers || []).some(item => item && item.id === doomed),
        JSON.stringify((cloud.doc.workers || []).map(item => item.id)));
    check('and still nothing has ever carried him out of this phone', !everSentHim(),
        JSON.stringify(cloud.writes.map(write => write.kind)));

    // The fault clears. No second snapshot arrives - the retry ladder has to be enough.
    b.setQuota(null);
    b.Sync.flush();
    await settle(TICK * 60);

    check('the queue is cleaned once there is room',
        !queuedNames().includes(doomed), queuedNames());
    check('the unrelated edit finally lands',
        JSON.stringify(cloud.doc.places || []).includes('p_09'),
        JSON.stringify((cloud.doc.places || []).map(item => item.id)));
    check('and he is still absent from the array',
        !(cloud.doc.workers || []).some(item => item && item.id === doomed),
        JSON.stringify((cloud.doc.workers || []).map(item => item.id)));
    check('with the tombstone still the authority',
        cloud.doc.roster.workers[doomed] === null,
        JSON.stringify(cloud.doc.roster.workers[doomed]));
    check('both phones agree he is gone',
        !workerIds(a).includes(doomed) && !workerIds(b).includes(doomed),
        `${workerIds(a)} | ${workerIds(b)}`);
    check('and from first to last, no write ever put him back',
        !everSentHim(), JSON.stringify(cloud.writes.map(write => write.kind)));
}

{
    suite('the shapes an Israeli number is actually written in');

    const device = makeDevice({ deviceId: 'd_here' });
    const canonical = '0528841930';
    [
        '052-884-1930',
        '+972-52-884-1930',
        '+972 (0) 52-884-1930',
        '00972-52-884-1930',
        '00972 (0)52 884 1930',
        '052 884 1930',
        '0528841930',
        '52-884-1930'
    ].forEach(written => {
        check(`${written} is ${canonical}`,
            device.call('normalisePhone', written) === canonical,
            device.call('normalisePhone', written));
    });

    check('a different number stays different',
        device.call('normalisePhone', '+972-52-884-1931') !== canonical);
    check('and nothing is not a number',
        device.call('normalisePhone', '') === ''
        && device.call('normalisePhone', '+972') === '');
}

{
    suite('restoring from the archive gives up rather than writing into a moving crew');

    // Four rounds of questions and the crew is still changing under them. Falling out of
    // the loop and writing anyway would put him back into a clash nobody agreed to.
    const { device, said } = crew();
    device.State.schedule.workers.push(
        { id: 'w_arch', name: 'דוד', active: false, phone: '052-884-1930',
          dailyRate: 400, hourlyRate: 0 });
    device.State.commitRoster();

    // Every answer changes the clash: the name matches, then the phone, then the name
    // again - so no round is ever the last one.
    let round = 0;
    device.ctx.askConfirm = () => {
        round += 1;
        const live = device.State.worker('w_arch');
        if (round % 2 === 1) {
            live.name = `דוד ${round}`;
            device.State.schedule.workers[0].name = `דוד ${round}`;
        } else {
            live.phone = `052-884-193${round}`;
            device.State.schedule.workers[0].phone = `052-884-193${round}`;
        }
        return Promise.resolve(true);
    };

    await device.call('setWorkerArchived', 'w_arch', false);
    await wait();

    check('he is left in the archive', device.State.worker('w_arch').active === false,
        String(device.State.worker('w_arch').active));
    check('and the person is told why rather than nothing happening',
        said.some(line => line.includes('לא הוחזר לעבודה')), JSON.stringify(said));
    check('the questions did stop', round <= 5, String(round));
}

{
    suite('a worker taken away mid-question is not written into');

    const { device, said } = crew();
    device.State.schedule.workers.push(
        { id: 'w_arch', name: 'דוד', active: false, dailyRate: 400, hourlyRate: 0 });
    device.State.commitRoster();

    // The clash question goes up; the other phone removes him while it is open.
    device.ctx.askConfirm = () => {
        device.State.schedule = device.call('normaliseSchedule', {
            workers: [{ id: 'w_01', name: 'דוד', active: true, dailyRate: 400, hourlyRate: 50 }],
            places: [{ id: 'p_01', name: 'הרצליה', active: true }],
            days: {}, advances: {},
            updatedAt: '2030-01-01T00:00:00.000Z', updatedBy: 'other'
        });
        return Promise.resolve(true);
    };

    let threw = null;
    try {
        await device.call('setWorkerArchived', 'w_arch', false);
    } catch (error) {
        threw = String(error && error.message);
    }
    await wait();

    check('nothing was thrown into the middle of the write', threw === null, String(threw));
    check('and the person was told', said.some(line => line.includes('כבר אינו ברשימה')),
        JSON.stringify(said));
    check('the crew that arrived is what is on screen',
        workerIds(device) === 'w_01', workerIds(device));
}

{
    suite('an archived typo can still be deleted; an archived worker with a record cannot');

    const { device } = crew();
    device.ctx.askText = question => Promise.resolve(
        String(question.title).replace('למחוק את ', '').replace('?', ''));

    // Made here, never sent, nothing recorded - and then archived.
    const typo = device.State.nextWorkerId();
    device.State.schedule.workers.push(
        { id: typo, name: 'טעות', active: false, dailyRate: 0, hourlyRate: 0 });
    device.State.commitRoster();

    check('the model still says he can go',
        device.global('deletionBlockers')(typo).length === 0,
        JSON.stringify(device.global('deletionBlockers')(typo)));

    await device.call('deleteWorker', typo);
    await wait();
    check('and he goes', !workerIds(device).includes(typo), workerIds(device));

    // A man with a day behind him, archived: archive-only, exactly as before.
    device.State.commit(device.call('assignPlace',
        device.State.schedule, '2026-08-12', 'w_01', 'actual', 'p_01'));
    await device.call('setWorkerArchived', 'w_01', true);
    await wait();
    given('he is archived', device.State.worker('w_01').active === false);

    check('the model refuses him',
        device.global('deletionBlockers')('w_01').length > 0,
        JSON.stringify(device.global('deletionBlockers')('w_01')));
    await device.call('deleteWorker', 'w_01');
    await wait();
    check('and he stays, with his day', workerIds(device).includes('w_01'),
        workerIds(device));
    check('which is still on the sheet',
        device.call('entriesFor', device.State.schedule, '2026-08-12', 'w_01', 'actual').length === 1);
}

// ---------------------------------------------------------------- provenance, on the disk
//
// Everything below is about what the NEXT session reads, which is the only thing that
// decides whether a man can be destroyed tomorrow.

for (const [label, run] of [
    ['a local restore', async device => {
        const incoming = device.call('normaliseSchedule', {
            workers: [{ id: 'w_imported', name: 'מיובא', active: true, dailyRate: 300, hourlyRate: 0 }],
            places: [{ id: 'p_01', name: 'הרצליה', active: true }],
            days: {}, advances: {},
            updatedAt: '2026-08-01T08:00:00.000Z', updatedBy: 'd_backup'
        });
        return device.Sync.replaceEverything(incoming);
    }],
    ['a cloud restore', async device => {
        const cloud = makeCloud();
        await connected(device, cloud);
        await wait();
        const incoming = device.call('normaliseSchedule', {
            workers: [{ id: 'w_imported', name: 'מיובא', active: true, dailyRate: 300, hourlyRate: 0 }],
            places: [{ id: 'p_01', name: 'הרצליה', active: true }],
            days: {}, advances: {},
            updatedAt: '2026-08-01T08:00:00.000Z', updatedBy: 'd_backup'
        });
        return device.Sync.replaceEverything(incoming);
    }]
]) {
    suite(`${label} that cannot record the loss of local origin does not finish`);

    const { device } = crew();
    const mine = device.State.nextWorkerId();
    device.State.schedule.workers.push(
        { id: mine, name: 'טעות', active: true, dailyRate: 0, hourlyRate: 0 });
    device.State.commitRoster();
    given('he is deletable before any of this',
        device.Sync.provenLocalOnly('workers', mine) === true);
    const provenanceBefore = device.raw('farkad:provenance:v1');

    // The one write that is refused is the provenance record.
    device.setQuota(key => key === 'farkad:provenance:v1');
    const result = await run(device);
    device.setQuota(null);

    check('the restore reports that it did not finish', result.ok !== true,
        JSON.stringify(result));
    check('the provenance record on the disk was not changed',
        device.raw('farkad:provenance:v1') === provenanceBefore,
        String(device.raw('farkad:provenance:v1')));

    // The proof is written BEFORE the schedule is swapped, so a refusal means the
    // replacement never landed at all - which is the strongest form of the invariant:
    // there is no worker from that document on this device to be deleted later.
    check('not one worker from that document is on the device',
        !workerIds(device).includes('w_imported'), workerIds(device));
    check('and the crew that was here is untouched',
        workerIds(device).includes(mine) && workerIds(device).includes('w_01'),
        workerIds(device));

    // THE POINT. Not what this session believes - what the next one reads.
    const again = makeDevice({ storage: device.dump(), deviceId: 'd_here' });
    again.State.load();
    check('after a reopen the imported worker is still nowhere',
        !workerIds(again).includes('w_imported'), workerIds(again));
    check('and nothing from that document is claimed as local either',
        again.Sync.provenLocalOnly('workers', 'w_imported') === false);

    // Room again: the same restore now finishes, and everything in it - including the man
    // this device minted itself - stops being provably local.
    const third = makeDevice({ storage: again.dump(), deviceId: 'd_here' });
    third.State.load();
    third.ctx.askConfirm = () => Promise.resolve(true);
    third.ctx.askTell = () => Promise.resolve();
    third.ctx.askText = question => Promise.resolve(
        String(question.title).replace('למחוק את ', '').replace('?', ''));

    const retried = await run(third);
    await wait();
    check('the retry finishes once there is room', retried.ok === true,
        JSON.stringify(retried));
    check('and now the document really did land',
        workerIds(third).includes('w_imported'), workerIds(third));
    check('with nothing in it provably local',
        third.Sync.provenLocalOnly('workers', 'w_imported') === false
        && third.Sync.provenLocalOnly('workers', mine) === false);

    const fourth = makeDevice({ storage: third.dump(), deviceId: 'd_here' });
    fourth.State.load();
    check('which is still true at the next open',
        fourth.Sync.provenLocalOnly('workers', 'w_imported') === false
        && fourth.Sync.provenLocalOnly('workers', mine) === false);
    check('and the screen refuses the deletion',
        fourth.global('deletionBlockers')('w_imported').length > 0,
        JSON.stringify(fourth.global('deletionBlockers')('w_imported')));
}

{
    suite('a restore that lands after the proof cannot leave the proof behind');

    // The ordering, stated directly: if the schedule was replaced, the record that says
    // this device no longer owns what it minted is already on the disk. There is no
    // sequence in which one happened and the other did not.
    const { device } = crew();
    const mine = device.State.nextWorkerId();
    device.State.schedule.workers.push(
        { id: mine, name: 'טעות', active: true, dailyRate: 0, hourlyRate: 0 });
    device.State.commitRoster();

    const incoming = device.call('normaliseSchedule', {
        workers: [{ id: 'w_imported', name: 'מיובא', active: true, dailyRate: 300, hourlyRate: 0 }],
        places: [{ id: 'p_01', name: 'הרצליה', active: true }],
        days: {}, advances: {},
        updatedAt: '2026-08-01T08:00:00.000Z', updatedBy: 'd_backup'
    });
    const result = await device.Sync.replaceEverything(incoming);
    given('the restore finished', result.ok === true, JSON.stringify(result));

    const stored = JSON.parse(String(device.raw('farkad:provenance:v1')));
    check('the generation on the disk moved on', Number(stored.gen) >= 1,
        JSON.stringify(stored.gen));
    check('and the disk claims nothing as locally made',
        stored.mine.workers.length === 0, JSON.stringify(stored.mine));

    const again = makeDevice({ storage: device.dump(), deviceId: 'd_here' });
    again.State.load();
    check('so the next session offers no deletion at all',
        again.Sync.provenLocalOnly('workers', 'w_imported') === false
        && again.Sync.provenLocalOnly('workers', mine) === false);
}

{
    suite('a backup file is a handover, and the source device stops claiming him');

    // The file is opened on another phone and worked on. The device it left has no way of
    // hearing about that, so it cannot go on saying he never left.
    const { device } = crew();
    const mine = device.State.nextWorkerId();
    device.State.schedule.workers.push(
        { id: mine, name: 'טעות', active: true, dailyRate: 0, hourlyRate: 0 });
    device.State.commitRoster();
    given('he is deletable before the export',
        device.Sync.provenLocalOnly('workers', mine) === true);

    let downloaded = null;
    device.ctx.Blob = function Blob(parts) { downloaded = String(parts[0]); };
    device.ctx.URL = { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} };
    device.ctx.document.createElement = () => ({ style: {}, setAttribute: () => {},
        appendChild: () => {}, click: () => {} });
    device.ctx.askTell = () => Promise.resolve();

    device.call('exportBackup');

    check('the file was written', Boolean(downloaded) && downloaded.includes(mine));
    check('and he is no longer provably local',
        device.Sync.provenLocalOnly('workers', mine) === false);
    check('so the screen will not offer to delete him',
        device.global('deletionBlockers')(mine).length > 0,
        JSON.stringify(device.global('deletionBlockers')(mine)));

    // The second phone imports it and records a day - the thing the source cannot see.
    const other = makeDevice({ deviceId: 'd_other' });
    other.State.load();
    const imported = other.call('normaliseSchedule', JSON.parse(downloaded));
    other.State.schedule = imported;
    other.State.save({ silent: true });
    other.State.commit(other.call('assignPlace',
        other.State.schedule, '2026-08-12', mine, 'actual', 'p_01'));
    check('the other phone really is holding work for him',
        other.call('workerFootprint', other.State.schedule, mine).days.length === 1);

    // And across a reopen of the source.
    const again = makeDevice({ storage: device.dump(), deviceId: 'd_here' });
    again.State.load();
    check('the source device still refuses after a reopen',
        again.Sync.provenLocalOnly('workers', mine) === false);
}

{
    suite('a backup that cannot record the handover is not handed over');

    const { device } = crew();
    const mine = device.State.nextWorkerId();
    device.State.schedule.workers.push(
        { id: mine, name: 'טעות', active: true, dailyRate: 0, hourlyRate: 0 });
    device.State.commitRoster();

    let downloaded = null;
    device.ctx.Blob = function Blob(parts) { downloaded = String(parts[0]); };
    device.ctx.URL = { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} };
    device.ctx.document.createElement = () => ({ style: {}, setAttribute: () => {},
        appendChild: () => {}, click: () => {} });
    const said = [];
    device.ctx.askTell = message => {
        said.push(String((message && message.title) || message));
        return Promise.resolve();
    };

    device.setQuota(key => key === 'farkad:provenance:v1');
    device.call('exportBackup');
    device.setQuota(null);

    check('no file left the device', downloaded === null, String(downloaded));
    check('and the person was told why', said.some(line => line.includes('לא יוצא')),
        JSON.stringify(said));

    // He was never handed over, so he is still a typo - which is the honest outcome, and
    // the reason refusing the export is safe rather than merely strict.
    check('he is still deletable, because nothing left',
        device.Sync.provenLocalOnly('workers', mine) === true);

    // With room again the export works and the claim is dropped.
    device.call('exportBackup');
    check('the second attempt writes the file', Boolean(downloaded));
    check('and now he is not deletable',
        device.Sync.provenLocalOnly('workers', mine) === false);

    const again = makeDevice({ storage: device.dump(), deviceId: 'd_here' });
    again.State.load();
    check('which survives the reopen',
        again.Sync.provenLocalOnly('workers', mine) === false);
}

{
    suite('the recovery export is never blocked by bookkeeping');

    // It exists to get unreadable bytes off a phone. Refusing it because a small record
    // could not be updated would trade the data for the bookkeeping.
    const device = makeDevice({ deviceId: 'd_here' });
    device.putRaw('scheduleData:v2', '{ truncated');
    device.State.load();

    let downloaded = null;
    device.ctx.Blob = function Blob(parts) { downloaded = String(parts[0]); };
    device.ctx.URL = { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} };
    device.ctx.document.createElement = () => ({ style: {}, setAttribute: () => {},
        appendChild: () => {}, click: () => {} });
    device.ctx.askTell = () => Promise.resolve();

    device.setQuota(key => key === 'farkad:provenance:v1');
    device.call('exportRecoveryData');
    device.setQuota(null);

    check('the raw bytes still leave the phone', Boolean(downloaded), String(downloaded));
    check('and they are the damaged record itself',
        String(downloaded).includes('truncated'), String(downloaded).slice(0, 120));
}

{
    suite('provenance is read from the disk, not from what this tab remembers');

    // Two contexts share one localStorage: two tabs, or a tab and the installed app. The
    // other one marks him sent - durably, correctly - and this one is still holding the
    // copy it read at boot.
    const { device } = crew();
    const mine = device.State.nextWorkerId();
    device.State.schedule.workers.push(
        { id: mine, name: 'טעות', active: true, dailyRate: 0, hourlyRate: 0 });
    device.State.commitRoster();
    given('this tab has him as deletable',
        device.Sync.provenLocalOnly('workers', mine) === true);

    // The other context writes the disk directly - which is exactly what it looks like
    // from in here.
    const held = JSON.parse(String(device.raw('farkad:provenance:v1')));
    held.sent.workers.push(mine);
    device.putRaw('farkad:provenance:v1', JSON.stringify(held));

    check('the answer follows the disk, not the cache',
        device.Sync.provenLocalOnly('workers', mine) === false);
    check('and the screen stops offering it',
        device.global('deletionBlockers')(mine).length > 0,
        JSON.stringify(device.global('deletionBlockers')(mine)));

    // And this tab's next write must not erase what the other one wrote.
    const other = device.State.nextWorkerId();
    const after = JSON.parse(String(device.raw('farkad:provenance:v1')));
    check('a later write here keeps the fact the other tab recorded',
        after.sent.workers.includes(mine), JSON.stringify(after.sent));
    check('while still recording what this one minted',
        after.mine.workers.includes(other), JSON.stringify(after.mine));
    check('and the man the other tab sent stays undeletable',
        device.Sync.provenLocalOnly('workers', mine) === false);
}

{
    suite('a generation bump is not undone by a context holding the old one');

    // The bump is the one deliberate way `mine` is cleared. A writer that read the record
    // before it happened must not merge its copy back over the top.
    const { device } = crew();
    const mine = device.State.nextWorkerId();
    device.State.schedule.workers.push(
        { id: mine, name: 'טעות', active: true, dailyRate: 0, hourlyRate: 0 });
    device.State.commitRoster();

    const before = JSON.parse(String(device.raw('farkad:provenance:v1')));
    given('the record is at its first generation', Number(before.gen || 0) === 0);

    check('the bump clears what was minted here',
        device.Sync.forgetLocalOrigin() === true);
    const after = JSON.parse(String(device.raw('farkad:provenance:v1')));
    check('the generation moved on', Number(after.gen) === 1, JSON.stringify(after.gen));
    check('and nothing is claimed as local any more',
        after.mine.workers.length === 0, JSON.stringify(after.mine));
    check('so he cannot be deleted', device.Sync.provenLocalOnly('workers', mine) === false);

    // Whatever this device records next starts from the bumped record.
    const later = device.State.nextWorkerId();
    const now = JSON.parse(String(device.raw('farkad:provenance:v1')));
    check('a later mint does not bring the old ones back',
        now.mine.workers.join() === later, JSON.stringify(now.mine.workers));
    check('and the generation is not rolled back',
        Number(now.gen) === 1, JSON.stringify(now.gen));
}

report();
