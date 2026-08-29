// The failures the green suites do not have.
//
//   node tests/adversarial.test.mjs
//
// Every check here was written FROM a reproduction: something was observed going wrong
// against the real production functions and the real durable bytes, and the check is what
// that looked like. Nothing here asserts by reading the source, and nothing here compares
// one caller of a function against another caller of the same function - a projector that
// is wrong is wrong consistently, and two of its answers agreeing proves nothing.
//
// The order is the order of the brief: the queue first, then the raw evidence, then the
// decisions and the way back, then the retired vehicles.

import { makeDevice, makeCloud, settle, sharedStore } from './harness.mjs';
import { suite, check, same, given, report } from './runner.mjs';

const TICK = 6;
const wait = () => settle(TICK * 5);
const PATH = 'days.2026-08-10.actual.w_01';

const WORKERS = [
    { id: 'w_01', name: 'דוד', active: true, dailyRate: 400, hourlyRate: 50 },
    { id: 'w_02', name: 'שרה', active: true, dailyRate: 350, hourlyRate: 0 }
];
const PLACES = [
    { id: 'p_01', name: 'הרצליה', active: true },
    { id: 'p_02', name: 'תל אביב', active: true }
];

function seed(device) {
    device.State.schedule.workers = WORKERS.map(worker => Object.assign({}, worker));
    device.State.schedule.places = PLACES.map(place => Object.assign({}, place));
    device.State.save({ silent: true });
    return device;
}

function document(extra) {
    return Object.assign({
        schemaVersion: 2,
        workers: WORKERS.map(worker => Object.assign({}, worker)),
        places: PLACES.map(place => Object.assign({}, place)),
        days: {}, advances: {},
        updatedAt: '2026-08-01T00:00:00.000Z', updatedBy: 'd_old'
    }, extra || {});
}

const dayValue = placeId => ({ entries: [{ placeId }] });
const dayFor = (workerId, placeId) => ({ plan: {}, actual: { [workerId]: dayValue(placeId) } });

// One site on a day, REPLACING whatever was there. assignPlace adds and is idempotent, so
// the site already there has to be taken off with unassignPlace first.
function put(device, path, placeId) {
    const [, date, layer, workerId] = path.split('.');
    device.call('entriesFor', device.State.schedule, date, workerId, layer)
        .slice()
        .filter(entry => entry.placeId !== placeId)
        .forEach(entry => device.State.commit(device.call('unassignPlace',
            device.State.schedule, date, workerId, layer, entry.placeId)));
    return device.State.commit(device.call('assignPlace',
        device.State.schedule, date, workerId, layer, placeId));
}

const connected = async (device, cloud) => {
    device.Sync.pushDelayMs = TICK;
    device.Sync.connect(cloud.adapter);
    await settle(TICK * 30);
};

function placeOf(record) {
    const entries = (record && record.entries) || [];
    return entries.length > 0 ? entries[0].placeId : null;
}

const cloudPlace = (cloud, date, workerId) =>
    placeOf((((cloud.doc || {}).days || {})[date] || {}).actual
        ? cloud.doc.days[date].actual[workerId] : null);

const screenPlace = (device, date, workerId) => {
    const entries = device.call('entriesFor', device.State.schedule, date, workerId, 'actual');
    return entries.length > 0 ? entries[0].placeId : null;
};

// Every physical outbox key and its bytes, read off the dump - never through the app's own
// reader, so a projector that hides something cannot hide it from this too.
function outboxBytes(device) {
    const dump = device.dump();
    const out = {};
    Object.keys(dump).forEach(key => {
        if (key.indexOf('farkad:outbox') === 0) out[key] = dump[key];
    });
    return out;
}

function rawOps(device) {
    const bytes = outboxBytes(device);
    const out = [];
    Object.keys(bytes).sort().forEach(key => {
        if (key.indexOf(':damaged') !== -1) return;
        let parsed;
        try { parsed = JSON.parse(bytes[key]); } catch (error) { return; }
        if (!parsed || typeof parsed !== 'object') return;
        if (Array.isArray(parsed.ops)) {
            parsed.ops.forEach(op => out.push({ key, opId: String(op.opId || ''),
                path: String(op.path || ''), value: op.value, seq: op.seq }));
            return;
        }
        if (parsed.items && typeof parsed.items === 'object') {
            Object.keys(parsed.items).forEach(path => out.push({ key, opId: '', path,
                value: parsed.items[path].value, seq: parsed.items[path].seq }));
        }
    });
    return out;
}

function answering(device, options = {}) {
    const said = [];
    const asked = [];
    device.ctx.askTell = message => {
        said.push(typeof message === 'string' ? message : JSON.stringify(message));
        return Promise.resolve();
    };
    device.ctx.askConfirm = question => {
        asked.push(question);
        return Promise.resolve(options.answer !== false);
    };
    device.ctx.askText = question => Promise.resolve(String((question || {}).title || ''));
    device.ctx.openMigrationModal = () => {};
    return { said, asked };
}

const reopen = (device, options = {}) => {
    const next = makeDevice(Object.assign({ storage: device.dump(), deviceId: device.id },
        options));
    next.State.load();
    return next;
};

// ================================================================ A1
//
// Two tabs on one disk both write the same path inside the window where neither can see
// the other's batch, so neither names the other in `after`. The projector picks a winner
// and HIDES the loser - and the loser is still on the disk. Acknowledge the winner, let
// the collector run, and the loser is the only operation left for that path: it becomes
// current, and it goes to the cloud over the top of the value the app committed.
//
// The queue reports empty and the status reports synced while it happens.

// The gap, spelled exactly: queueOperations reads the queue twice - once for the
// projection, once for the physical set - and only then writes its batch. The second read
// of a warm-up batch key is the last read before that write, so the other tab records its
// day THERE: after A has decided what it can see, and before A's bytes exist for B.
function twoTabsRace(shared, tabA, tabB, path) {
    put(tabA, 'days.2026-08-10.actual.w_02', 'p_01');
    const warmKey = Object.keys(shared).filter(key =>
        key.indexOf('farkad:outbox:op:') === 0)[0];

    let reads = 0;
    let fired = false;
    const arm = () => shared.interleave(key => {
        if (String(key) === warmKey) reads += 1;
        if (reads === 2 && !fired) { fired = true; put(tabB, path, 'p_02'); return; }
        arm();
    });
    arm();
    put(tabA, path, 'p_01');
    shared.interleave(() => {});
    return fired;
}

{
    suite('A1: the collector cannot change which value is current');

    const shared = sharedStore();
    const tabA = makeDevice({ sharedStorage: shared, deviceId: 'd_a' });
    seed(tabA);
    const tabB = makeDevice({ sharedStorage: shared, deviceId: 'd_b' });
    tabB.State.load();
    tabB.Sync.pendingCount();

    given('the two tabs overlapped', twoTabsRace(shared, tabA, tabB, PATH));
    const both = rawOps(tabA).filter(op => op.path === PATH);
    given('both operations are on the disk, neither naming the other',
        both.length === 2, JSON.stringify(both.map(op => op.opId)));

    const winner = tabA.Sync.projectedQueue().get(PATH);
    const loser = both.find(op => op.opId !== winner.opId);
    given('the projector chose one and hid the other',
        Boolean(winner) && Boolean(loser)
        && placeOf(winner.value) !== placeOf(loser.value),
        JSON.stringify({ winner: placeOf(winner.value), loser: placeOf(loser.value) }));

    const committed = placeOf(winner.value);
    given('and the committed value is what the schedule on disk holds',
        placeOf(JSON.parse(tabA.raw('scheduleData:v2')).days['2026-08-10'].actual.w_01)
            === committed);

    // Exactly what acknowledge() does when a send comes back.
    tabA.Sync.markAcknowledged([winner.opId]);
    tabA.Sync.collectQueueGarbage();

    const now = tabA.Sync.projectedQueue().get(PATH);
    check('acknowledging the winner does not make the loser current',
        !now || placeOf(now.value) === committed,
        JSON.stringify({ was: committed, now: now && placeOf(now.value) }));
    check('and nothing left on the disk could send the loser',
        rawOps(tabA).filter(op => op.path === PATH)
            .every(op => placeOf(op.value) === committed
                || !tabA.Sync.projectedQueue().has(PATH)
                || placeOf(tabA.Sync.projectedQueue().get(PATH).value) === committed),
        JSON.stringify(rawOps(tabA).filter(op => op.path === PATH)
            .map(op => placeOf(op.value))));
}

{
    suite('A1: the loser never reaches the cloud, through two reopens and a third phone');

    const shared = sharedStore();
    const tabA = makeDevice({ sharedStorage: shared, deviceId: 'd_a' });
    seed(tabA);
    const tabB = makeDevice({ sharedStorage: shared, deviceId: 'd_b' });
    tabB.State.load();
    tabB.Sync.pendingCount();
    given('the two tabs overlapped', twoTabsRace(shared, tabA, tabB, PATH));

    const winner = tabA.Sync.projectedQueue().get(PATH);
    const committed = placeOf(winner.value);
    given('a value was committed', typeof committed === 'string');

    const cloud = makeCloud();
    const first = reopen(tabA);
    await connected(first, cloud);
    await settle(TICK * 60);

    check('the document holds the value the app committed',
        cloudPlace(cloud, '2026-08-10', 'w_01') === committed,
        JSON.stringify({ cloud: cloudPlace(cloud, '2026-08-10', 'w_01'), committed }));
    check('and the screen agrees with it',
        screenPlace(first, '2026-08-10', 'w_01') === committed,
        String(screenPlace(first, '2026-08-10', 'w_01')));
    check('nothing is left waiting', first.Sync.pendingCount() === 0,
        String(first.Sync.pendingCount()));

    const second = reopen(first);
    await connected(second, cloud);
    await settle(TICK * 60);
    check('a second reopen does not send anything else',
        cloudPlace(cloud, '2026-08-10', 'w_01') === committed,
        String(cloudPlace(cloud, '2026-08-10', 'w_01')));

    const third = makeDevice({ deviceId: 'd_c' });
    third.State.load();
    await connected(third, cloud);
    await settle(TICK * 40);
    check('and a third phone sees the same day',
        screenPlace(third, '2026-08-10', 'w_01') === committed,
        String(screenPlace(third, '2026-08-10', 'w_01')));
    check('with the queue and the bytes agreeing',
        third.Sync.pendingCount() === 0
        && second.Sync.pendingCount() === 0
        && rawOps(second).filter(op => op.path === PATH)
            .every(op => placeOf(op.value) === committed),
        JSON.stringify(rawOps(second).filter(op => op.path === PATH).map(op => placeOf(op.value))));
}

// ================================================================ A2
{
    suite('A2: an older build’s queue converges instead of sending for ever');

    // The shape a build before v87 wrote: the whole queue inside the slot record. It has
    // no id of its own and no acknowledgement key, and both markAcknowledged and the
    // collector skipped it - so it went to the cloud on every flush, for ever, while the
    // count beside it never moved.
    const staged = {
        'farkad:deviceId': 'd_legacy',
        'scheduleData:v2': JSON.stringify(document()),
        'farkad:outbox': JSON.stringify({
            seq: 4,
            items: { 'days.2026-08-12.actual.w_01': { value: dayValue('p_01'), seq: 4, sent: false } }
        })
    };

    const device = makeDevice({ storage: staged, deviceId: 'd_legacy' });
    device.State.load();
    given('the legacy edit is pending', device.Sync.pendingCount() === 1,
        String(device.Sync.pendingCount()));

    const cloud = makeCloud();
    await connected(device, cloud);
    for (let round = 0; round < 6; round += 1) {
        device.Sync.flush();
        await settle(TICK * 20);
    }

    const carried = cloud.writes.filter(write => {
        const value = write.patch
            ? write.patch['days.2026-08-12.actual.w_01']
            : (((write.data || {}).days || {})['2026-08-12'] || {}).actual;
        return Boolean(value);
    }).length;

    check('the edit reached the cloud',
        Boolean((cloud.doc.days || {})['2026-08-12']),
        JSON.stringify(Object.keys(cloud.doc.days || {})));
    check('and it stopped being re-sent', carried <= 2, `${carried} writes carried it`);
    check('nothing is left waiting', device.Sync.pendingCount() === 0,
        String(device.Sync.pendingCount()));

    const again = reopen(device);
    check('a reopen does not start it again', again.Sync.pendingCount() === 0,
        String(again.Sync.pendingCount()));
    check('and the day is still on the screen',
        screenPlace(again, '2026-08-12', 'w_01') === 'p_01',
        String(screenPlace(again, '2026-08-12', 'w_01')));
}

// ================================================================ A3
{
    suite('A3: two different legacy entries never share one identity');

    // 'legacy_' + a 32-bit rolling hash of slot|path. These two paths are both valid and
    // both ordinary - a worker id in base 36 - and they collide.
    const one = 'days.2026-08-12.actual.w_1n';
    const two = 'days.2026-08-12.actual.w_30';

    const device = makeDevice({
        deviceId: 'd_collide',
        storage: {
            'farkad:deviceId': 'd_collide',
            'scheduleData:v2': JSON.stringify(document({
                workers: [
                    { id: 'w_1n', name: 'אחד', active: true, dailyRate: 100, hourlyRate: 0 },
                    { id: 'w_30', name: 'שניים', active: true, dailyRate: 100, hourlyRate: 0 }
                ]
            })),
            'farkad:outbox': JSON.stringify({
                seq: 2,
                items: {
                    [one]: { value: dayValue('p_01'), seq: 1, sent: false },
                    [two]: { value: dayValue('p_02'), seq: 2, sent: false }
                }
            })
        }
    });
    device.State.load();

    const ids = device.Sync.physicalOperations()
        .filter(op => op.legacy).map(op => op.opId);
    given('both legacy entries were read', ids.length === 2, JSON.stringify(ids));
    check('and they are two different operations, not one',
        new Set(ids).size === 2, JSON.stringify(ids));
    check('so both days are pending, not one',
        device.Sync.pendingCount() === 2, String(device.Sync.pendingCount()));
    check('and the journal rebuilds both',
        screenPlace(device, '2026-08-12', 'w_1n') === 'p_01'
        && screenPlace(device, '2026-08-12', 'w_30') === 'p_02',
        JSON.stringify([screenPlace(device, '2026-08-12', 'w_1n'),
            screenPlace(device, '2026-08-12', 'w_30')]));
}

{
    suite('A3: an old tab’s later correction is not suppressed by an earlier operation');

    // The old tab rewrites the same path. Its synthetic identity used to be a hash of the
    // PATH alone, so the correction wore the name of the value it replaced - and an
    // operation that named that id as superseded suppressed the correction too.
    const path = 'days.2026-08-12.actual.w_01';
    const shared = sharedStore();
    shared.setItem('farkad:deviceId', 'd_old');
    shared.setItem('scheduleData:v2', JSON.stringify(document()));
    shared.setItem('farkad:outbox', JSON.stringify({
        seq: 1, items: { [path]: { value: dayValue('p_01'), seq: 1, sent: false } }
    }));

    const modern = makeDevice({ sharedStorage: shared, deviceId: 'd_new' });
    modern.State.load();
    const beaten = modern.Sync.physicalOperations().find(op => op.legacy);
    given('the new tab can see the old entry', Boolean(beaten));

    // The new tab corrects it, naming what it saw.
    put(modern, path, 'p_02');
    given('the new tab named it as superseded',
        modern.Sync.physicalOperations()
            .some(op => (op.after || []).indexOf(beaten.opId) !== -1),
        JSON.stringify(modern.Sync.physicalOperations().map(op => op.after)));

    // Now the OLD tab writes again, over the same path - a different value entirely.
    shared.setItem('farkad:outbox', JSON.stringify({
        seq: 9, items: { [path]: { value: dayValue('p_01'), seq: 9, sent: false } }
    }));

    const reader = makeDevice({ storage: shared, deviceId: 'd_new' });
    reader.State.load();
    const current = reader.Sync.projectedQueue().get(path);
    check('the old tab’s later write is a later operation, not the suppressed one',
        Boolean(current) && placeOf(current.value) === 'p_01',
        JSON.stringify({ current: current && placeOf(current.value),
            ops: reader.Sync.physicalOperations().map(op => [op.opId, placeOf(op.value)]) }));
    check('and it is on the screen',
        screenPlace(reader, '2026-08-12', 'w_01') === 'p_01',
        String(screenPlace(reader, '2026-08-12', 'w_01')));
}

// ================================================================ A4
{
    suite('A4: a restore fences the candidates, not the winner it left behind');

    // The fence names the operations the restore supersedes. It used to run AFTER the
    // projection, so it could only remove the one winner the projector had already
    // chosen - and a named pre-restore operation with a HIGHER sequence was hiding a
    // non-named post-restore one. Removing the winner left nothing, and the work done
    // after the person pressed the button disappeared.
    const path = 'days.2026-08-12.actual.w_01';
    const envelope = {
        version: 2, phase: 'prepared', transactionId: 't_fence',
        supersedesSeq: 0, supersedes: ['opbefore'], cloud: false,
        document: document({ days: { '2026-07-01': dayFor('w_01', 'p_01') } })
    };

    for (const [label, postSeq] of [['lower', 3], ['equal', 6], ['higher', 9]]) {
        const staged = {
            'farkad:deviceId': 'd_fence',
            'scheduleData:v2': JSON.stringify(document({
                days: { '2026-07-01': dayFor('w_01', 'p_01') } })),
            'farkad:outbox': JSON.stringify({ seq: 9, items: {} }),
            // The pre-restore operation, named by the envelope, in one slot.
            'farkad:outbox:op:before1': JSON.stringify({
                batchId: 'before1', at: '2026-08-12T06:00:00.000Z',
                ops: [{ opId: 'opbefore', path, value: dayValue('p_01'), seq: 6, after: [] }]
            }),
            // The post-restore operation, in another slot and another batch.
            'farkad:outbox:active1': JSON.stringify({ seq: 9, items: {} }),
            'farkad:outbox:active1:op:after1': JSON.stringify({
                batchId: 'after1', at: '2026-08-12T07:00:00.000Z',
                ops: [{ opId: 'opafter', path, value: dayValue('p_02'), seq: postSeq, after: [] }]
            }),
            'farkad:pendingReplace': JSON.stringify(envelope)
        };

        const device = makeDevice({ storage: staged, deviceId: 'd_fence' });
        device.State.load();
        check(`${label}: the work done after the restore is on the screen`,
            screenPlace(device, '2026-08-12', 'w_01') === 'p_02',
            String(screenPlace(device, '2026-08-12', 'w_01')));
        check(`${label}: and the restore itself is there too`,
            Boolean((device.State.schedule.days || {})['2026-07-01']),
            JSON.stringify(Object.keys(device.State.schedule.days || {})));

        const again = reopen(device);
        check(`${label}: still both after a reopen`,
            screenPlace(again, '2026-08-12', 'w_01') === 'p_02'
            && Boolean((again.State.schedule.days || {})['2026-07-01']),
            JSON.stringify(Object.keys(again.State.schedule.days || {})));

        // And the rescue file rebuilds the same thing the phone shows.
        const reader = makeDevice({ deviceId: 'd_fence_reader' });
        seed(reader);
        const loaded = reader.call('readBackupFile', {
            kind: 'farkad-recovery',
            records: Object.keys(staged).reduce((out, key) => {
                if (key !== 'farkad:deviceId') out[key] = staged[key];
                return out;
            }, {})
        });
        const rebuilt = reader.call('entriesFor', loaded.schedule,
            '2026-08-12', 'w_01', 'actual');
        check(`${label}: and the rescue file agrees with the phone`,
            rebuilt.length === 1 && rebuilt[0].placeId === 'p_02',
            JSON.stringify(rebuilt));
    }
}

// ================================================================ A5
{
    suite('A5: a queued operation cannot name what it did not supersede');

    const other = 'days.2026-08-11.actual.w_02';
    const base = {
        'farkad:deviceId': 'd_after',
        'scheduleData:v2': JSON.stringify(document()),
        'farkad:outbox': JSON.stringify({ seq: 4, items: {} }),
        'farkad:outbox:op:good1': JSON.stringify({
            batchId: 'good1', at: '2026-08-11T06:00:00.000Z',
            ops: [{ opId: 'opgood', path: other, value: dayValue('p_01'), seq: 1, after: [] }]
        })
    };

    const arms = [
        ['naming an operation on another path', {
            batchId: 'bad1', at: '2026-08-11T07:00:00.000Z',
            ops: [{ opId: 'opcross', path: PATH, value: dayValue('p_02'), seq: 2,
                after: ['opgood'] }]
        }],
        ['naming itself', {
            batchId: 'bad1', at: '2026-08-11T07:00:00.000Z',
            ops: [{ opId: 'opself', path: PATH, value: dayValue('p_02'), seq: 2,
                after: ['opself'] }]
        }],
        ['naming the same operation twice', {
            batchId: 'bad1', at: '2026-08-11T07:00:00.000Z',
            ops: [{ opId: 'opdupe', path: PATH, value: dayValue('p_02'), seq: 2,
                after: ['opgood', 'opgood'] }]
        }],
        ['an id that is not an id', {
            batchId: 'bad1', at: '2026-08-11T07:00:00.000Z',
            ops: [{ opId: 'opjunk', path: PATH, value: dayValue('p_02'), seq: 2,
                after: ['farkad:outbox:op:x'] }]
        }]
    ];

    for (const [label, batch] of arms) {
        const staged = Object.assign({}, base,
            { 'farkad:outbox:op:bad1': JSON.stringify(batch) });
        const device = makeDevice({ storage: staged, deviceId: 'd_after' });
        device.State.load();

        check(`${label}: the unrelated day is not suppressed`,
            screenPlace(device, '2026-08-11', 'w_02') === 'p_01',
            String(screenPlace(device, '2026-08-11', 'w_02')));
        check(`${label}: and the record that said it is held, not read`,
            device.global('Recovery').problems
                .some(problem => problem.key === 'farkad:outbox:op:bad1'),
            JSON.stringify(device.global('Recovery').problems.map(p => p.key)));
        check(`${label}: with its bytes exactly where they were`,
            device.raw('farkad:outbox:op:bad1') === staged['farkad:outbox:op:bad1']);
    }

    // A cycle: two operations on one path, each naming the other. Neither can be current,
    // so the path has no value at all - and nothing said so.
    const cycle = Object.assign({}, base, {
        'farkad:outbox:op:cyc1': JSON.stringify({
            batchId: 'cyc1', at: '2026-08-11T07:00:00.000Z',
            ops: [{ opId: 'opa', path: PATH, value: dayValue('p_01'), seq: 2, after: ['opb'] }]
        }),
        'farkad:outbox:op:cyc2': JSON.stringify({
            batchId: 'cyc2', at: '2026-08-11T08:00:00.000Z',
            ops: [{ opId: 'opb', path: PATH, value: dayValue('p_02'), seq: 3, after: ['opa'] }]
        })
    });
    const looped = makeDevice({ storage: cycle, deviceId: 'd_after' });
    looped.State.load();
    check('a cycle is held rather than silently cancelling both operations',
        looped.global('Recovery').problems.length > 0,
        JSON.stringify(looped.global('Recovery').problems.map(p => p.key)));
    check('and the unrelated day still stands',
        screenPlace(looped, '2026-08-11', 'w_02') === 'p_01',
        String(screenPlace(looped, '2026-08-11', 'w_02')));

    // What the rescue file says about all of it: nothing may be dropped in silence.
    const reader = makeDevice({ deviceId: 'd_after_reader' });
    seed(reader);
    const loaded = reader.call('readBackupFile', { kind: 'farkad-recovery', records: cycle });
    check('the rescue file names the records it could not read',
        (loaded.unread || []).length > 0, JSON.stringify(loaded.unread));
}

// ================================================================ A6
{
    suite('A6: the queue is bytes, not the objects the screen is holding');

    // The whole-array roster path is where the cache is handed out by reference:
    // applyJournalEntry assigns schedule.places = value, so State.schedule.places IS the
    // parsed value the cache is holding. Pushing to it - which is what the add-a-site
    // screen does before it commits anything - rewrites what the "durable" queue reports.
    const source = makeDevice({ deviceId: 'd_alias' });
    source.State.schedule.workers = [
        { id: 'w_01', name: 'דוד', active: true, dailyRate: 400, hourlyRate: 50 }];
    source.State.schedule.places = [{ id: 'p_01', name: 'הרצליה', active: true }];
    given('the roster edit is queued', source.State.commitRoster() === true);

    const device = makeDevice({ storage: source.dump(), deviceId: 'd_alias' });
    device.State.load();

    const queuedPlaces = () => {
        const found = (device.Sync.durableJournalEntries() || [])
            .find(([path]) => path === 'places');
        return found ? found[1].value.map(place => place.name) : [];
    };
    const bytes = () => JSON.stringify(outboxBytes(device));

    given('the queue reports the one site the disk holds',
        JSON.stringify(queuedPlaces()) === JSON.stringify(['הרצליה']),
        JSON.stringify(queuedPlaces()));
    const before = bytes();

    // Ordinary app code, mid-edit. Nothing is written anywhere.
    device.State.schedule.places.push({ id: 'p_zz', name: 'רמת גן', active: true });

    given('the durable bytes did not move', bytes() === before);
    check('and the queue still reports what the disk says',
        JSON.stringify(queuedPlaces()) === JSON.stringify(['הרצליה']),
        JSON.stringify(queuedPlaces()));

    // A context with a cold cache reading the same bytes must not disagree with this one.
    const cold = makeDevice({ storage: device.dump(), deviceId: 'd_cold' });
    cold.State.load();
    const coldPlaces = (cold.Sync.durableJournalEntries() || [])
        .find(([path]) => path === 'places');
    check('a second context over the same bytes reads the same queue',
        JSON.stringify(queuedPlaces())
            === JSON.stringify(coldPlaces ? coldPlaces[1].value.map(p => p.name) : []),
        JSON.stringify({ warm: queuedPlaces(),
            cold: coldPlaces && coldPlaces[1].value.map(p => p.name) }));

    // And a refused write must roll back to what the DISK holds, not to a cache the
    // rollback itself has been editing.
    device.setQuota(() => true);
    device.State.schedule.places.push({ id: 'p_yy', name: 'לוד', active: true });
    check('a roster commit that cannot be stored is refused',
        device.State.commitRoster() === false);
    device.setQuota(null);
    check('and the screen is put back to what the disk holds',
        (device.State.schedule.places || []).map(place => place.id).join() === 'p_01',
        JSON.stringify((device.State.schedule.places || []).map(place => place.id)));
    check('with the bytes never having moved', bytes() === before, bytes().slice(0, 120));
    check('and a reopen agreeing with them',
        (reopen(device).State.schedule.places || []).map(place => place.id).join() === 'p_01',
        JSON.stringify((reopen(device).State.schedule.places || []).map(place => place.id)));
}

// ================================================================ A7
{
    suite('A7: a frozen companion that describes another restore is refused');

    // The primary is a bare v71 document holding one week; the companion holds a
    // different one. Live boot compares them and refuses; the rescue rebuild did not
    // compare them at all, so it carried out the wrong restore in silence.
    const primary = document({ days: { '2026-07-01': dayFor('w_01', 'p_01') } });
    const companion = {
        version: 2, phase: 'prepared', transactionId: 'legacy_other',
        supersedesSeq: 0, supersedes: [], cloud: true,
        document: document({ days: { '2026-07-02': dayFor('w_01', 'p_02') } })
    };

    const reader = makeDevice({ deviceId: 'd_companion' });
    seed(reader);
    let loaded = null;
    let refused = null;
    try {
        loaded = reader.call('readBackupFile', {
            kind: 'farkad-recovery',
            records: {
                'scheduleData:v2': JSON.stringify(document({
                    days: { '2026-08-10': dayFor('w_01', 'p_01') } })),
                'farkad:pendingReplace': JSON.stringify(primary),
                'farkad:pendingReplace:v71': JSON.stringify(companion)
            }
        });
    } catch (error) {
        refused = String(error && error.message);
    }

    check('the companion’s week is not imported as though it were the primary’s',
        refused !== null
        || !Object.keys((loaded.schedule || {}).days || {}).includes('2026-07-02'),
        JSON.stringify({ refused, days: Object.keys((loaded && loaded.schedule || {}).days || {}) }));
    check('and the mismatch is named rather than passed over',
        refused !== null
        || (loaded.unread || []).some(line => String(line).includes('pendingReplace')),
        JSON.stringify({ refused, unread: loaded && loaded.unread }));
}

// ================================================================ A8
{
    suite('A8: a restore is not held by a device holding part of it');

    const full = document({
        days: { '2026-07-01': dayFor('w_01', 'p_01') },
        advances: { a_01: { id: 'a_01', workerId: 'w_01', date: '2026-07-01',
            amount: 500, note: '' } },
        ledger: { advances: { le_01: { id: 'le_01', advanceId: 'a_01', kind: 'given',
            workerId: 'w_01', date: '2026-07-01', amount: 500 } } },
        vehicles: [{ id: 'v_01', name: 'טנדר', ownerId: 'w_01', active: true,
            rates: [{ from: '2026-01-01', amount: 300 }] }]
    });

    for (const [label, missing] of [
        ['a ledger entry', schedule => { schedule.ledger = { advances: {} }; }],
        ['a vehicle', schedule => { schedule.vehicles = []; }],
        ['both', schedule => { schedule.ledger = { advances: {} }; schedule.vehicles = []; }]
    ]) {
        const device = makeDevice({ deviceId: 'd_partial' });
        seed(device);
        given(`${label}: a restore can be prepared`,
            device.Sync.prepareReplace(full, false) === true);
        const envelope = device.Sync.pendingReplace();
        given(`${label}: and it carries all of it`,
            Object.keys(envelope.document.ledger.advances).length === 1
            && envelope.document.vehicles.length === 1);

        // What actually landed on the disk: the replacement, minus one part of it.
        const partial = JSON.parse(JSON.stringify(envelope.document));
        missing(partial);
        device.putRaw('scheduleData:v2', JSON.stringify(partial));

        check(`${label}: the device does not claim to hold the replacement`,
            device.Sync.localDurableHolds(envelope) === false,
            String(device.Sync.localDurableHolds(envelope)));
    }
}

// ================================================================ B1
{
    suite('B1: two equal readings are not proof of one moment');

    const device = makeDevice({ deviceId: 'd_aba' });
    seed(device);
    put(device, PATH, 'p_01');

    // A write that leaves the map byte-identical: the record goes and comes back. Nothing
    // about the two readings can see it, which is the whole point - a snapshot has to be
    // fenced by something a writer moves, not by comparing two values.
    const key = Object.keys(outboxBytes(device))
        .filter(name => name.indexOf('farkad:outbox:op:') === 0)[0];
    given('there is a batch on the disk', typeof key === 'string');
    const bytes = device.raw(key);

    let passes = 0;
    const arm = () => device.ctx.localStorage.interleave(read => {
        if (String(read) !== 'scheduleData:v2') { arm(); return; }
        passes += 1;
        // Between the two readings the record leaves the disk and comes back.
        device.Store.remove(key);
        device.putRaw(key, bytes);
        arm();
    });
    arm();

    const snapshot = device.global('Recovery').rawSnapshot();
    device.ctx.localStorage.interleave(() => {});

    given('the disk really did move between the readings', passes >= 2, String(passes));
    check('the snapshot does not call itself stable',
        snapshot.stable === false, JSON.stringify({ stable: snapshot.stable, passes }));
}

{
    suite('B1: an unstable export keeps every reading it took');

    const device = makeDevice({ deviceId: 'd_unstable' });
    seed(device);
    answering(device);
    put(device, PATH, 'p_01');

    // Something changes on every single reading, so no two agree.
    let round = 0;
    const arm = () => device.ctx.localStorage.interleave(read => {
        if (String(read) !== 'scheduleData:v2') { arm(); return; }
        round += 1;
        device.putRaw('farkad:outbox:noise' + round, String(round));
        arm();
    });
    arm();
    device.call('exportRecoveryData');
    device.ctx.localStorage.interleave(() => {});

    given('a file was produced', device.downloads.length === 1);
    const file = JSON.parse(device.downloads[0].text);
    check('it says it is not one moment of the device', file.stable === false,
        String(file.stable));
    check('and it keeps every distinct reading rather than throwing four away',
        Array.isArray(file.captures) && file.captures.length > 1,
        JSON.stringify({ captures: (file.captures || []).length, rounds: round }));
}

// ================================================================ B2
{
    suite('B2: the evidence survives a handover that takes storage away');

    const device = makeDevice({
        deviceId: 'd_gone',
        storage: {
            'farkad:deviceId': 'd_gone',
            'scheduleData:v2': JSON.stringify(document({
                days: { '2026-08-10': dayFor('w_01', 'p_01') } })),
            'farkad:outbox': JSON.stringify({ seq: 1, items: {} }),
            'farkad:outbox:op:keep1': JSON.stringify({
                batchId: 'keep1', at: '2026-08-10T06:00:00.000Z',
                ops: [{ opId: 'opkeep', path: 'days.2026-08-11.actual.w_02',
                    value: dayValue('p_02'), seq: 1, after: [] }]
            }),
            'farkad:outbox:damaged': '{"seq":2,"items":{"days'
        }
    });
    device.State.load();
    device.global('Recovery').acknowledge();
    answering(device);
    const before = device.global('Recovery').rawRecords();
    given('there is evidence to lose', Object.keys(before).length > 3,
        JSON.stringify(Object.keys(before)));

    // Not a full disk: a browser that hands back a SecurityError, which is what Store
    // treats as "there is no storage here any more".
    device.failWrite(key => String(key).indexOf('farkad:prov:') === 0);

    device.call('exportRecoveryData');

    check('the file was still handed over', device.downloads.length === 1,
        JSON.stringify(device.downloads.map(file => file.name)));
    const file = JSON.parse(device.downloads[0].text);
    check('and it is not empty',
        Object.keys(file.records || {}).length >= Object.keys(before).length,
        JSON.stringify(Object.keys(file.records || {})));
    check('it does not call itself one moment of the device',
        file.stable === false, String(file.stable));
    check('it says the disk stopped answering',
        file.storageReadable === false, String(file.storageReadable));
    check('and it says the handover was not written down',
        file.handoverRecorded === false, String(file.handoverRecorded));
}

// ================================================================ B3
{
    suite('B3: a file that cannot say whether the handover was recorded is not trusted');

    for (const [label, value] of [
        ['missing', undefined],
        ['a string', 'false'],
        ['a number', 0],
        ['null', null],
        ['a word', 'no']
    ]) {
        const rescuer = makeDevice({ deviceId: 'd_unknown' });
        seed(rescuer);
        const { said } = answering(rescuer);
        const payload = {
            kind: 'farkad-recovery',
            records: { 'scheduleData:v2': JSON.stringify(document({
                days: { '2026-08-10': dayFor('w_01', 'p_01') } })) }
        };
        if (value !== undefined) payload.handoverRecorded = value;

        rescuer.call('importBackup', rescuer.fileEvent('rescue.json', JSON.stringify(payload)));
        await settle(80);

        check(`${label}: the person is warned rather than reassured`,
            said.some(message => message.includes('לא נרשם')),
            JSON.stringify(said));
    }

    // And the one value that IS proof still reads as proof.
    const trusted = makeDevice({ deviceId: 'd_known' });
    seed(trusted);
    const { said } = answering(trusted);
    trusted.call('importBackup', trusted.fileEvent('rescue.json', JSON.stringify({
        kind: 'farkad-recovery', handoverRecorded: true,
        records: { 'scheduleData:v2': JSON.stringify(document({
            days: { '2026-08-10': dayFor('w_01', 'p_01') } })) }
    })));
    await settle(80);
    check('a file that says it WAS recorded does not raise the warning',
        !said.some(message => message.includes('לא נרשם')), JSON.stringify(said));
}

// ================================================================ B4
{
    suite('B4: a rescue file with questions in it still says what it could not say');

    // The warnings live in one sentence, built at the end. Two earlier branches returned
    // before reaching it, and both are branches a rescue file takes - so a file that
    // brought decisions with it never told anybody that the phone it came from could not
    // record the handover.
    const rescuer = makeDevice({ deviceId: 'd_b4' });
    seed(rescuer);
    const { said } = answering(rescuer);

    rescuer.call('importBackup', rescuer.fileEvent('rescue.json', JSON.stringify({
        kind: 'farkad-recovery',
        handoverRecorded: false,
        stable: false,
        pendingDecisions: [{ kind: 'unknown-place', value: 'אתר לא ידוע',
            date: '2026-08-11', workerId: 'w_02', message: 'לא ידוע' }],
        records: { 'scheduleData:v2': JSON.stringify(document({
            days: { '2026-08-10': dayFor('w_01', 'p_01') } })) }
    })));
    await settle(80);

    given('the decisions arrived', rescuer.State.migrationIssues.length === 1,
        String(rescuer.State.migrationIssues.length));
    check('the questions are named',
        said.some(message => message.includes('ממתינים להחלטה')), JSON.stringify(said));
    check('and so is the handover the source could not record',
        said.some(message => message.includes('לא נרשם')), JSON.stringify(said));
    check('and so is the file that was taken while something moved',
        said.some(message => message.includes('נלקח בזמן')), JSON.stringify(said));
}

// ================================================================ C1
{
    suite('C1: the questions are written in the format they are read in');

    // A v1 record the app migrates on first load, with one cell the migration refuses to
    // guess. The questions are written down; the next open has to find them.
    const v1 = JSON.stringify({
        weekStartDate: '2026-08-09',
        workers: ['דוד', 'שרה'],
        places: ['הרצליה'],
        assignments: [
            { index: 1, value: 'הרצליה' },
            { index: 9, value: 'מקום שלא ברשימה' }
        ]
    });
    const device = makeDevice({ deviceId: 'd_issues', storage: { scheduleData: v1 } });
    device.State.load();
    given('the migration raised a question', device.State.migrationIssues.length === 1,
        String(device.State.migrationIssues.length));
    given('and wrote it down',
        String(device.raw('scheduleData:migrationIssues')).includes('מקום שלא ברשימה'));

    const again = reopen(device);
    check('the next open still has the question',
        again.State.migrationIssues.length === 1,
        JSON.stringify({ issues: again.State.migrationIssues,
            disk: again.raw('scheduleData:migrationIssues') }));

    // And through the real export and the real import.
    answering(again);
    again.call('exportRecoveryData');
    const rescuer = makeDevice({ deviceId: 'd_issues_target' });
    seed(rescuer);
    answering(rescuer);
    rescuer.call('importBackup',
        rescuer.fileEvent(again.downloads[0].name, again.downloads[0].text));
    await settle(80);
    check('and a rescue round trip carries it to the other phone',
        rescuer.State.migrationIssues.length === 1,
        JSON.stringify(rescuer.State.migrationIssues));
    check('which survives a reopen there too',
        reopen(rescuer).State.migrationIssues.length === 1,
        JSON.stringify(reopen(rescuer).State.migrationIssues));
}

{
    suite('C1: questions that cannot be shown to belong to this week are not adopted');

    const rescuer = makeDevice({ deviceId: 'd_unbound' });
    seed(rescuer);
    answering(rescuer);

    // A bare array, the way a build before the binding wrote it. It says nothing about
    // which schedule it describes, so it cannot be attached to one as though it did.
    rescuer.call('importBackup', rescuer.fileEvent('rescue.json', JSON.stringify({
        kind: 'farkad-recovery',
        records: {
            'scheduleData:v2': JSON.stringify(document({
                days: { '2026-08-10': dayFor('w_01', 'p_01') } })),
            'scheduleData:migrationIssues': JSON.stringify([
                { kind: 'unknown-place', value: 'ישן', date: '2001-01-01',
                  workerId: 'w_zz', message: 'ישן' }
            ])
        }
    })));
    await settle(80);

    check('an unbound list is carried, not silently dropped',
        rescuer.State.migrationIssues.length === 1,
        JSON.stringify(rescuer.State.migrationIssues));
    check('and it is marked as belonging to nothing in particular',
        String(rescuer.raw('scheduleData:migrationIssues')).includes('"bound":false')
        || String(rescuer.raw('scheduleData:migrationIssues')).includes('"uncertain":true'),
        String(rescuer.raw('scheduleData:migrationIssues')));
}

// ================================================================ C2
{
    suite('C2: a way back that does not carry the questions is not a way back');

    const device = makeDevice({ deviceId: 'd_undo' });
    seed(device);
    device.State.migrationIssues = [{ kind: 'unknown-place', value: 'שאלה',
        date: '2026-08-10', workerId: 'w_01', message: 'שאלה' }];
    device.call('writeIssues', device.State.migrationIssues);
    put(device, PATH, 'p_01');
    answering(device);

    // The stack write - the one that carries the decisions - is refused. The single slot,
    // which an older build reads and which carries the schedule alone, still lands.
    device.setQuota(key => String(key).indexOf('scheduleData:undoStack') === 0);
    const pushed = device.call('pushUndoState', device.State.schedule);
    device.setQuota(null);

    check('the app does not claim a way back it does not have',
        pushed === false, String(pushed));

    // And when it CAN be written, restoring it brings the questions back with the week.
    const whole = makeDevice({ deviceId: 'd_undo2' });
    seed(whole);
    whole.State.migrationIssues = [{ kind: 'unknown-place', value: 'שאלה',
        date: '2026-08-10', workerId: 'w_01', message: 'שאלה' }];
    whole.call('writeIssues', whole.State.migrationIssues);
    put(whole, PATH, 'p_01');
    answering(whole);
    given('the way back is written', whole.call('pushUndoState', whole.State.schedule) === true);

    whole.call('importBackup', whole.fileEvent('backup.json', JSON.stringify(
        document({ days: { '2026-01-01': dayFor('w_01', 'p_02') } }))));
    await settle(80);
    given('the import happened',
        Boolean((whole.State.schedule.days || {})['2026-01-01']),
        JSON.stringify(Object.keys(whole.State.schedule.days || {})));
    given('and the imported file brought no questions of its own',
        whole.State.migrationIssues.length === 0,
        JSON.stringify(whole.State.migrationIssues));

    await whole.call('restoreLocalBackup');
    await settle(80);
    check('the way back returns the week',
        Boolean((whole.State.schedule.days || {})['2026-08-10']),
        JSON.stringify(Object.keys(whole.State.schedule.days || {})));
    check('and the questions that belonged to it',
        whole.State.migrationIssues.length === 1,
        JSON.stringify(whole.State.migrationIssues));
    check('which the disk agrees with',
        String(whole.raw('scheduleData:migrationIssues')).includes('שאלה'),
        String(whole.raw('scheduleData:migrationIssues')));
}

// ================================================================ D
{
    suite('D: a snapshot cannot delete vehicle records this build does not draw');

    const vehicles = [{ id: 'v_local', name: 'טנדר', ownerId: 'w_01', active: true,
        rates: [{ from: '2026-01-01', amount: 300 }, { from: '2026-06-01', amount: 350 }] }];

    for (const [label, remote] of [
        ['an empty cloud array', []],
        ['a different cloud vehicle', [{ id: 'v_cloud', name: 'טרנזיט', ownerId: 'w_02',
            active: true, rates: [{ from: '2026-02-01', amount: 250 }] }]]
    ]) {
        const cloud = makeCloud({
            doc: Object.assign(document({ vehicles: remote }), {
                updatedAt: '2026-08-20T00:00:00.000Z', updatedBy: 'd_other'
            })
        });
        const device = makeDevice({ deviceId: 'd_veh' });
        seed(device);
        device.State.schedule.vehicles = JSON.parse(JSON.stringify(vehicles));
        device.State.schedule.days['2026-08-12'] = Object.assign(
            dayFor('w_01', 'p_01'), { vehiclesOff: ['v_local'] });
        device.State.save({ silent: true });

        await connected(device, cloud);
        await settle(TICK * 40);

        const kept = (device.State.schedule.vehicles || []).find(item => item.id === 'v_local');
        check(`${label}: the local vehicle is still on the screen`,
            Boolean(kept), JSON.stringify(device.State.schedule.vehicles));
        check(`${label}: with its rate history`,
            Boolean(kept) && (kept.rates || []).length === 2,
            JSON.stringify(kept && kept.rates));
        check(`${label}: and on the disk`,
            String(device.raw('scheduleData:v2')).includes('v_local'));
        check(`${label}: and the evening that named it still says so`,
            JSON.stringify((device.State.schedule.days['2026-08-12'] || {}).vehiclesOff)
                === '["v_local"]',
            JSON.stringify(device.State.schedule.days['2026-08-12']));
        check(`${label}: and a reopen agrees`,
            String(reopen(device).raw('scheduleData:v2')).includes('v_local'));
    }
}

{
    suite('D: vehicle bytes this build cannot read are held, not normalised away');

    const odd = document({
        vehicles: [
            { id: 'v_ok', name: 'טנדר', ownerId: 'w_01', active: true,
              rates: [{ from: '2026-01-01', amount: 300 }], plate: '12-345-67' },
            { id: 'v_future', name: 'משאית', ownerId: 'w_02', active: true,
              rates: [{ amount: 400 }], shift: 'night' }
        ]
    });

    const device = makeDevice({ deviceId: 'd_odd',
        storage: { 'scheduleData:v2': JSON.stringify(odd) } });
    device.State.load();

    check('a field this build has never heard of is still there',
        ((device.State.schedule.vehicles || [])
            .find(item => item.id === 'v_ok') || {}).plate === '12-345-67',
        JSON.stringify(device.State.schedule.vehicles));
    check('and a rate entry it cannot place is kept rather than dropped',
        Boolean(((device.State.schedule.vehicles || [])
            .find(item => item.id === 'v_future') || {})),
        JSON.stringify(device.State.schedule.vehicles));

    device.State.save({ silent: true });
    check('an ordinary save does not strip them',
        String(device.raw('scheduleData:v2')).includes('12-345-67')
        && String(device.raw('scheduleData:v2')).includes('night'),
        String(device.raw('scheduleData:v2')).slice(0, 300));

    const again = reopen(device);
    check('and a reopen still has them',
        String(again.raw('scheduleData:v2')).includes('12-345-67')
        && String(again.raw('scheduleData:v2')).includes('night'));
    check('with nothing quarantined over it',
        again.global('Recovery').problems.length === 0,
        JSON.stringify(again.global('Recovery').problems.map(problem => problem.key)));
}

report();
