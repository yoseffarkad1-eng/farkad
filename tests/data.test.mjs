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

report();
