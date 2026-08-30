// Two tabs, once more, over everything Phase 3 changed.
//
//   node tests/concurrency.test.mjs
//
// Two tabs of this app are two JavaScript worlds looking at ONE localStorage, and the
// moment that matters is the one BETWEEN a read and the write that depends on it - which
// is what the harness's interleave hook is for. No race here is scheduled by luck: each
// one is opened on a named read, so the run is the same under FARKAD_SEED.
//
// Everything is observed through the production functions and the durable bytes. Nothing
// reads source, and nothing compares one caller of a function against another caller of
// the same function - a projector that is wrong is wrong consistently.
//
// SIX CHECKS HERE ARE RED AT THIS COMMIT, and each is marked RED above itself. They are
// two faults seen twice each - once in the record, once in what losing that record costs:
//
//   C3  the restore does not go out while the other tab holds the right to send
//   C3  nothing lands on the cloud on top of the restore
//   C5  the retirement outlives a removal the disk refused
//   C5  and the operation it retires does not read as live again on a reopen
//   C5  the acknowledgement outlives a removal the disk refused
//   C5  and the edit the cloud has already answered for is not sent again

import { makeDevice, makeCloud, settle, sharedStore, deferred } from './harness.mjs';
import { suite, check, same, given, report } from './runner.mjs';

const TICK = 6;
const PATH = 'days.2026-08-10.actual.w_01';
const LEGACY_PATH = 'days.2026-08-12.actual.w_01';

const WORKERS = [
    { id: 'w_01', name: 'דוד', active: true, dailyRate: 400, hourlyRate: 50 },
    { id: 'w_02', name: 'שרה', active: true, dailyRate: 350, hourlyRate: 0 }
];
const PLACES = [
    { id: 'p_01', name: 'הרצליה', active: true },
    { id: 'p_02', name: 'תל אביב', active: true }
];

const dayValue = placeId => ({ entries: [{ placeId }] });

function document(extra) {
    return Object.assign({
        schemaVersion: 2,
        workers: WORKERS.map(worker => Object.assign({}, worker)),
        places: PLACES.map(place => Object.assign({}, place)),
        days: {}, advances: {},
        updatedAt: '2026-08-01T00:00:00.000Z', updatedBy: 'd_old'
    }, extra || {});
}

function seed(device) {
    device.State.schedule.workers = WORKERS.map(worker => Object.assign({}, worker));
    device.State.schedule.places = PLACES.map(place => Object.assign({}, place));
    device.State.save({ silent: true });
    return device;
}

// One site on a day, REPLACING whatever was there - assignPlace adds and is idempotent.
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

const placeOf = record => {
    const entries = (record && record.entries) || [];
    return entries.length > 0 ? entries[0].placeId : null;
};
const screenPlace = (device, date, workerId) => placeOf(
    ((device.State.schedule.days[date] || {}).actual || {})[workerId]);
const diskPlace = (device, date, workerId) => {
    const raw = device.raw('scheduleData:v2');
    if (raw === null) return null;
    return placeOf(((JSON.parse(raw).days[date] || {}).actual || {})[workerId]);
};

// Two tabs on one disk. The second is opened after the first has recorded and reads the
// queue at once, so from here on it is a live reader of what the first one writes.
function twoTabs() {
    const shared = sharedStore();
    const tabA = makeDevice({ sharedStorage: shared, deviceId: 'd_a' });
    seed(tabA);
    const tabB = makeDevice({ sharedStorage: shared, deviceId: 'd_b' });
    tabB.State.load();
    tabB.Sync.pendingCount();
    return { shared, tabA, tabB };
}

// Two tabs writing one path inside the window where neither can see the other's batch, so
// neither names the other in `after`. queueOperations reads the queue twice before it
// writes; the second read of a warm-up batch key is the last read before that write, so
// the other tab records its day THERE.
function twoTabsRace(shared, tabA, tabB, path, placeA, placeB) {
    put(tabA, 'days.2026-08-09.actual.w_02', 'p_01');
    const warmKey = Object.keys(shared).filter(key =>
        key.indexOf('farkad:outbox:op:') === 0)[0];

    let reads = 0;
    let fired = false;
    const arm = () => shared.interleave(key => {
        if (String(key) === warmKey) reads += 1;
        if (reads === 2 && !fired) { fired = true; put(tabB, path, placeB); return; }
        arm();
    });
    arm();
    put(tabA, path, placeA);
    shared.interleave(null);
    return fired;
}

// A hook that fires on EVERY read until it is stopped, re-arming itself from inside. One
// shot is not enough against anything that reads in a loop: rawSnapshot takes five
// readings, and a race that disturbs only the first proves nothing about the other four.
function whileReading(shared, act) {
    let fired = 0;
    const arm = () => shared.interleave(() => { fired += 1; act(); arm(); });
    arm();
    return { fired: () => fired, stop: () => shared.interleave(null) };
}

// The other tab removes a record and puts the SAME bytes back. Two readings either side
// of it are equal, so only something that goes forward can see it happened.
function putBackIdentically(tab, key) {
    const bytes = tab.Store.durableGet(key);
    if (bytes === null) return false;
    tab.Store.remove(key);
    return tab.Store.setVerified(key, bytes);
}

// Read off the dump rather than through the app's own reader, so a projector that hides
// something cannot hide it from this too.
const queueKeysOf = device => Object.keys(device.dump())
    .filter(key => key.indexOf('farkad:outbox') === 0).sort();

// What a session that opens these bytes would hold - twice, so that "the record settles"
// is a claim about the bytes and not about one lucky reader.
function shapeOf(device) {
    return JSON.stringify({
        days: device.State.schedule.days,
        workers: device.State.schedule.workers.map(worker => worker.id),
        pending: device.Sync.pendingCount(),
        queued: [...device.Sync.projectedQueue().keys()].sort()
    });
}

function twoReopens(dump) {
    const one = makeDevice({ storage: dump, deviceId: 'd_reopen1' });
    one.State.load();
    const two = makeDevice({ storage: dump, deviceId: 'd_reopen2' });
    two.State.load();
    const agreed = shapeOf(one) === shapeOf(two);
    check('two reopens of these bytes agree about the record',
        agreed, agreed ? '' : shapeOf(one) + '  !==  ' + shapeOf(two));
    return one;
}

// ================================================================ C1
//
// A retirement is a decision about ONE OPERATION, written under that operation's id. The
// scheme it replaced hashed the slot and the PATH, and a record keyed by path is one tab
// writing about work the other has not done yet: the beat key for the day sits there, and
// the next edit to it - anybody's - reads as retired the moment it is written. Hidden from
// the projection, never sent, gone from the sheet, with the queue reporting empty.
{
    suite('C1: a retirement names an operation, never a path');

    const { shared, tabA, tabB } = twoTabs();

    given('the two tabs overlapped on one path',
        twoTabsRace(shared, tabA, tabB, PATH, 'p_01', 'p_02'));
    const raced = tabA.Sync.physicalOperations().filter(op => op.path === PATH);
    given('both operations are on the disk, neither naming the other',
        raced.length === 2 && raced.every(op => (op.after || []).length === 0));

    // Neither, not either: two operations for one day must leave one of them current. A
    // retirement that hid both would take the day off the sheet with nothing said.
    const chosen = tabA.Sync.projectedQueue().get(PATH);
    check('the race left one of the two current, not neither', Boolean(chosen),
        String(tabA.Sync.projectedQueue().size));
    given('the winner can be named', Boolean(chosen));

    const beaten = raced.find(op => op.opId !== chosen.opId);
    given('the collector has already written the loser down as beaten',
        tabA.raw(beaten.slot + ':beat:' + beaten.opId) === '1');

    // The window: the first tab has read the whole physical set and decided who is
    // current, and has not written its retirements yet.
    let sneaked = false;
    const race = whileReading(shared, () => {
        if (sneaked) return;
        sneaked = true;
        put(tabB, PATH, 'p_01');
    });
    tabA.Sync.collectQueueGarbage();
    race.stop();
    given('the other tab wrote its edit inside that window', sneaked);

    const newest = tabB.Sync.projectedQueue().get(PATH);
    check('the edit made while the other tab was retiring is still current for its day',
        Boolean(newest), String(tabB.Sync.projectedQueue().size));
    given('that edit can be named', Boolean(newest));
    check('the edit made while the other tab was retiring is not itself retired',
        tabB.raw(newest.slot + ':beat:' + newest.opId) === null,
        newest.opId);

    // The same claim over every operation on the disk, not only the one being watched.
    const live = tabA.Sync.projectedQueue();
    const wronglyRetired = tabA.Sync.physicalOperations().filter(op =>
        op.retired && live.has(op.path) && live.get(op.path).opId === op.opId);
    check('nothing that is current for its path is retired anywhere on this disk',
        wronglyRetired.length === 0, JSON.stringify(wronglyRetired.map(op => op.path)));

    check('the last edit is what the queue would send and what the disk holds',
        placeOf(newest.value) === 'p_01' && diskPlace(tabB, '2026-08-10', 'w_01') === 'p_01',
        JSON.stringify([placeOf(newest.value), diskPlace(tabB, '2026-08-10', 'w_01')]));

    const reopened = twoReopens(tabA.dump());
    check('and a reopen shows that day, not the one it beat',
        screenPlace(reopened, '2026-08-10', 'w_01') === 'p_01',
        String(screenPlace(reopened, '2026-08-10', 'w_01')));
}

// ================================================================ C2
//
// An item an older build left inside the slot record has no batch of its own, and that
// record is SHARED - rewriting it to say "sent" is the lost update this file refuses. So
// the acknowledgement is a key of its own, and the question is whether the other tab,
// which holds the same item as pending, reads it.
{
    suite('C2: a legacy item one tab acknowledged is not sent again by the other');

    const shared = sharedStore({
        'farkad:deviceId': 'd_a',
        'scheduleData:v2': JSON.stringify(document()),
        'farkad:outbox': JSON.stringify({
            seq: 4,
            items: { [LEGACY_PATH]: { value: dayValue('p_01'), seq: 4, sent: false } }
        })
    });
    const staged = shared['farkad:outbox'];

    const tabA = makeDevice({ sharedStorage: shared, deviceId: 'd_a' });
    tabA.State.load();
    const tabB = makeDevice({ sharedStorage: shared, deviceId: 'd_b' });
    tabB.State.load();
    given('both tabs hold the same legacy edit as pending',
        tabA.Sync.pendingCount() === 1 && tabB.Sync.pendingCount() === 1);

    const cloud = makeCloud({ doc: document() });
    const carried = () => cloud.writes.filter(write =>
        (write.patch && write.patch[LEGACY_PATH] !== undefined)
        || (((write.data || {}).days || {})['2026-08-12'] !== undefined)).length;

    // The other tab records an ordinary day WHILE the first is acknowledging. Both live in
    // the same slot's family, so a tab that answered one by rewriting the shared record
    // would lose the other.
    let interrupted = 0;
    const race = whileReading(shared, () => {
        if (interrupted) return;
        put(tabB, 'days.2026-08-13.actual.w_02', 'p_02');
        interrupted = Number(tabB.Sync.projectedQueue()
            .get('days.2026-08-13.actual.w_02').seq) || 0;
    });
    await connected(tabA, cloud);
    await settle(TICK * 40);
    race.stop();
    given('the other tab got its edit in during the send', interrupted > 0);
    check('the legacy day reached the cloud once, not once per flush',
        carried() === 1, String(carried()));
    const legacyIn = tabB.Sync.physicalOperations().filter(op => op.path === LEGACY_PATH);
    check('the tab that never sent it now reports nothing owed for that day',
        legacyIn.length > 0 && legacyIn.every(op => op.sent === true),
        JSON.stringify(legacyIn.map(op => op.sent)));

    const before = carried();
    for (let round = 0; round < 5; round += 1) {
        tabB.Sync.flush();
        await settle(TICK * 20);
    }
    check('and five more flushes from it write that day again zero times',
        carried() === before, String(carried() - before));

    const record = JSON.parse(tabA.raw('farkad:outbox'));
    same('the shared slot record still holds the item exactly as it was',
        record.items, JSON.parse(staged).items);
    const ackKeys = queueKeysOf(tabA)
        .filter(key => key.indexOf('farkad:outbox:ack:legacy_') === 0);
    check('the acknowledgement is a key of its own beside it',
        ackKeys.length === 1, String(ackKeys.length));
    check('and the day the other tab recorded during the send is on the disk',
        diskPlace(tabB, '2026-08-13', 'w_02') === 'p_02',
        String(diskPlace(tabB, '2026-08-13', 'w_02')));

    // The mark is the high-water sequence BOTH tabs hand the next edit. Rewriting that
    // record from bytes read a moment earlier would put the mark back below an operation
    // the other tab had already written, and hand the next edit a number already used -
    // which is what decides which of two edits to one day survives.
    check('and the shared mark still covers the edit the other tab wrote into it',
        record.seq >= interrupted, JSON.stringify({ mark: record.seq, edit: interrupted }));

    const reopened = twoReopens(tabA.dump());
    check('a reopen holds both days and owes the cloud neither of them again',
        screenPlace(reopened, '2026-08-12', 'w_01') === 'p_01'
        && screenPlace(reopened, '2026-08-13', 'w_02') === 'p_02'
        && reopened.Sync.pendingCount() === 0,
        JSON.stringify([screenPlace(reopened, '2026-08-12', 'w_01'),
            screenPlace(reopened, '2026-08-13', 'w_02'), reopened.Sync.pendingCount()]));
}

// ================================================================ C3
//
// The right to send is a record on the disk because the gate inside FarkadSync belongs to
// ONE JavaScript context: two tabs each let their own write out while the other's was
// still open, and the older of the two landed last. A whole-document restore is the worst
// thing to have on the other side of that race - it replaces everything, so an ordinary
// update that was already open lands on top of it and puts back a day somebody had
// deliberately restored away.
{
    suite('C3: the right to send, and a restore in the other tab');

    const { tabA, tabB } = twoTabs();
    put(tabA, PATH, 'p_01');

    const cloud = makeCloud();
    await connected(tabA, cloud);
    await connected(tabB, cloud);
    await settle(TICK * 40);
    given('both tabs are up to date and the day is in the cloud',
        tabA.Sync.pendingCount() === 0 && tabB.Sync.pendingCount() === 0
        && placeOf((((cloud.doc || {}).days || {})['2026-08-10'] || {}).actual.w_01) === 'p_01');

    // One ordinary field write from the first tab, held open by the cloud: a phone on a
    // site with one bar, the request out and no answer yet.
    const open = deferred();
    cloud.hold = kind => (kind === 'update' ? open.promise : null);
    const mark = cloud.writes.length;
    put(tabA, PATH, 'p_02');
    tabA.Sync.flush();
    await settle(TICK * 10);

    const claimed = tabA.raw('farkad:sendClaim');
    const claim = claimed === null ? {} : JSON.parse(claimed);
    given('the first tab holds the right to send, with its write still open',
        claim.by === 'd_a' && String(claim.token || '') !== ''
        && cloud.attempts.slice(mark).some(attempt => attempt.kind === 'update')
        && cloud.writes.length === mark);

    // Meanwhile the second tab is asked to restore a backup that does not have that day.
    const restored = JSON.parse(JSON.stringify(tabB.State.schedule));
    delete restored.days['2026-08-10'];
    const result = await tabB.Sync.replaceEverything(restored);
    const duringHold = cloud.writes.slice(mark).map(write => write.kind);
    given('the second tab was told the restore was done',
        result.ok === true && result.stage === 'done', JSON.stringify(result));

    // RED. The restore reads the claim nowhere: executePreparedReplace waits only on the
    // writes THIS context started, and the other tab's open update is not one of them.
    check('the restore does not go out while the other tab holds the right to send',
        duringHold.indexOf('save') === -1, JSON.stringify(duringHold));

    open.release();
    await settle(TICK * 80);

    // RED, and this is what it costs: the update that was already open lands on top of the
    // whole-document save, so the cloud holds the day the restore removed - and every
    // phone subscribed at that moment adopts it.
    const order = cloud.writes.slice(mark).map(write => write.kind);
    const lastSave = order.lastIndexOf('save');
    const firstSave = order.indexOf('save');
    check('nothing lands on the cloud on top of the restore',
        firstSave === -1 || order.slice(firstSave).indexOf('update') === -1,
        JSON.stringify(order));

    // The half that DOES cross tabs: the record of the restore is on the shared disk, so
    // the other tab reads it, holds its own queue behind it, and finishes the transaction
    // itself. Whichever tab picks it up, it ends once and the record goes.
    put(tabA, 'days.2026-08-11.actual.w_02', 'p_01');
    tabA.Sync.flush();
    await settle(TICK * 40);
    check('the restore was carried to the end by whichever tab picked it up',
        lastSave !== -1 && tabA.raw('farkad:pendingReplace') === null,
        JSON.stringify({ order, record: tabA.raw('farkad:pendingReplace') }));
    const held = [screenPlace(tabA, '2026-08-10', 'w_01'), screenPlace(tabB, '2026-08-10', 'w_01')];
    check('and both tabs end holding the schedule that was restored',
        held[0] === null && held[1] === null, JSON.stringify(held));
    check('the day the restore removed is not in the cloud either',
        (((cloud.doc || {}).days || {})['2026-08-10'] || null) === null,
        JSON.stringify(((cloud.doc || {}).days || {})['2026-08-10'] || null));
    const later = placeOf((((cloud.doc || {}).days || {})['2026-08-11'] || {}).actual
        ? cloud.doc.days['2026-08-11'].actual.w_02 : null);
    check('and the day recorded after it reaches the cloud once the barrier lifts',
        later === 'p_01' && screenPlace(tabA, '2026-08-11', 'w_02') === 'p_01',
        JSON.stringify([later, screenPlace(tabA, '2026-08-11', 'w_02')]));

    const reopened = twoReopens(tabA.dump());
    check('a reopen does not put the restored-away day back',
        screenPlace(reopened, '2026-08-10', 'w_01') === null,
        String(screenPlace(reopened, '2026-08-10', 'w_01')));
}

// ================================================================ C4
//
// The rescue export's one honest claim is "these bytes were one moment of this device".
// Taking the records twice and comparing them cannot prove it: a record can leave the disk
// and come back between the readings, and two equal readings of a state the disk was never
// in is exactly what the other tab produces. So the captures are bracketed by Store's
// write tick, which only ever goes forward.
//
// Every family below is put back BYTE FOR BYTE, so the readings are equal every time and
// nothing but the tick can see that it happened.
{
    suite('C4: the snapshot fence sees the other tab, whichever record it touches');

    const { shared, tabA: exporter, tabB: other } = twoTabs();

    given('the two tabs overlapped, so one operation was beaten and written down',
        twoTabsRace(shared, exporter, other, PATH, 'p_01', 'p_02'));
    const current = exporter.Sync.projectedQueue().get(PATH);
    given('one of them is current', Boolean(current));
    given('the cloud has that one', exporter.Sync.markAcknowledged([current.opId]));
    given('and this device minted a worker of its own',
        exporter.Sync.markLocallyMinted('workers', 'w_09'));
    // A quarantine copy from an earlier session, whose original has since been written
    // over. The export carries it by allowlist, so it is a family too.
    exporter.putRaw('farkad:outbox:damaged', '{"seq":2,"items":{"days.2026-08-0');

    const keys = queueKeysOf(exporter);
    const pick = mark => keys.filter(key => key.indexOf(mark) !== -1)[0];
    const families = [
        ['the schedule', 'scheduleData:v2'],
        ['the queue mark', 'farkad:outbox'],
        ['a batch of edits', pick(':op:')],
        ['an acknowledgement', pick(':ack:')],
        ['a retirement', pick(':beat:')],
        ['a quarantine copy', 'farkad:outbox:damaged'],
        ['a provenance fact', 'farkad:prov:mine:workers:w_09']
    ];

    const Recovery = exporter.global('Recovery');
    const carried = Recovery.rawRecords();
    given('the export carries one of every family named below',
        families.every(([, key]) => typeof key === 'string'
            && Object.prototype.hasOwnProperty.call(carried, key)),
        JSON.stringify(families.map(([name, key]) => [name, key,
            key ? Object.prototype.hasOwnProperty.call(carried, key) : false])));

    const size = snapshot => Object.keys(snapshot.records).length;
    const calm = Recovery.rawSnapshot();
    check('with the other tab quiet the snapshot is one moment, and says so',
        calm.stable === true && size(calm) === Object.keys(carried).length,
        JSON.stringify({ stable: calm.stable, records: size(calm) }));

    families.forEach(([name, key]) => {
        const race = whileReading(shared, () => { putBackIdentically(other, key); });
        const snapshot = Recovery.rawSnapshot();
        race.stop();
        check(`the fence sees the other tab put ${name} back exactly as it was`,
            snapshot.stable === false && snapshot.captures.length === 1 && race.fired() > 0,
            JSON.stringify({ key, stable: snapshot.stable,
                readings: snapshot.captures.length, reads: race.fired() }));
    });

    // And it is still a file. This is the device that most needs its bytes off it, so an
    // unprovable moment is a warning on the file and never a refusal.
    const race = whileReading(shared, () => { putBackIdentically(other, 'scheduleData:v2'); });
    const shaken = Recovery.rawSnapshot();
    race.stop();
    check('and the records still leave the device, marked as what they are',
        shaken.stable === false && shaken.storageReadable === true
        && size(shaken) === Object.keys(carried).length,
        JSON.stringify({ stable: shaken.stable, records: size(shaken) }));
    check('the tab that was writing put every record back exactly as it found it',
        JSON.stringify(Recovery.rawRecords()) === JSON.stringify(carried));

    const settled = Recovery.rawSnapshot();
    check('and with it quiet again the very next snapshot is one moment',
        settled.stable === true, JSON.stringify({ stable: settled.stable }));

    twoReopens(exporter.dump());
}

// ================================================================ C5
//
// Collection is a separate pass that may not change which value is current, and the rule
// that makes it safe is an ORDER: a winner may only be removed once everything it beat has
// been written down as beaten. Two tabs collecting at once are two passes over one disk,
// each deciding from what it read a moment ago.
{
    suite('C5: two tabs collecting at once');

    const { shared, tabA, tabB } = twoTabs();
    given('the two tabs overlapped on one path',
        twoTabsRace(shared, tabA, tabB, PATH, 'p_01', 'p_02'));

    const winner = tabA.Sync.projectedQueue().get(PATH);
    given('one of the two is current', Boolean(winner));
    const committed = placeOf(winner.value);
    given('the day the app committed is the winner of that race',
        diskPlace(tabA, '2026-08-10', 'w_01') === committed);
    tabA.Sync.markAcknowledged([winner.opId]);

    // The second tab collects from inside the first tab's collection: after it has read the
    // physical set and decided who is current, before it has finished acting on it.
    let joined = false;
    const race = whileReading(shared, () => {
        if (joined) return;
        joined = true;
        tabB.Sync.collectQueueGarbage();
    });
    tabA.Sync.collectQueueGarbage();
    race.stop();
    given('both tabs collected inside one another', joined);

    const readable = tabA.Sync.physicalOperations()
        .filter(op => op.path === PATH && !op.retired);
    check('neither tab left an operation readable that the projection had beaten',
        readable.length === 0
        || (readable.length === 1 && readable[0].opId === winner.opId),
        JSON.stringify(readable.map(op => ({ v: placeOf(op.value), retired: op.retired }))));
    // Asked of the disk and of what is left in the queue - never of a tab's own screen,
    // which after a race legitimately still shows what that tab typed until it reloads.
    const left = tabA.Sync.projectedQueue();
    const queued = left.has(PATH) ? placeOf(left.get(PATH).value) : null;
    check('and the day the app committed is the day that survives both of them',
        diskPlace(tabA, '2026-08-10', 'w_01') === committed
        && (queued === null || queued === committed),
        JSON.stringify([diskPlace(tabA, '2026-08-10', 'w_01'), queued]));

    const reopened = twoReopens(tabA.dump());
    check('a reopen shows it too, and would not send the one it beat',
        screenPlace(reopened, '2026-08-10', 'w_01') === committed
        && [...reopened.Sync.projectedQueue().entries()]
            .filter(([path]) => path === PATH)
            .every(([, op]) => placeOf(op.value) === committed),
        String(screenPlace(reopened, '2026-08-10', 'w_01')));
}

// The same two tabs, on a disk that takes a removal and does nothing about it. The
// collector knows how to answer that - it reads the key back, finds it there and reports
// that it did not finish - and then forgets the small records that hang off the operation
// anyway: the retirement that keeps a beaten value beaten, and the acknowledgement that
// says the cloud has it, while the operation itself is still readable by both tabs.
{
    suite('C5: a removal the disk refused, with the other tab watching');

    const { shared, tabA, tabB } = twoTabs();
    given('the two tabs overlapped on one path',
        twoTabsRace(shared, tabA, tabB, PATH, 'p_01', 'p_02'));

    const winner = tabA.Sync.projectedQueue().get(PATH);
    given('one of the two is current', Boolean(winner));
    const beaten = tabA.Sync.physicalOperations()
        .filter(op => op.path === PATH).find(op => op.opId !== winner.opId);
    const retirement = beaten.slot + ':beat:' + beaten.opId;
    given('the first tab wrote the loser down as beaten', tabA.raw(retirement) === '1');
    tabA.Sync.markAcknowledged([winner.opId]);

    tabB.blockRemoval(key => key === beaten.batchKey);
    const whole = tabB.Sync.collectQueueGarbage();
    given('the collector reported that it could not finish', whole === false);
    given('and the operation it could not remove is still readable by both tabs',
        tabA.raw(beaten.batchKey) !== null
        && tabB.Sync.physicalOperations().some(op => op.opId === beaten.opId));

    // RED. The retirement is the only thing keeping that value out of the projection, and
    // it is taken back while the value is still on the disk - so the beaten operation
    // reads as an ordinary live candidate again at the next open.
    check('the retirement outlives a removal the disk refused',
        tabA.raw(retirement) === '1', String(tabA.raw(retirement)));
    check('and the operation it retires does not read as live again on a reopen',
        makeDevice({ storage: tabA.dump(), deviceId: 'd_r' })
            .Sync.physicalOperations()
            .filter(op => op.opId === beaten.opId).every(op => op.retired === true),
        beaten.opId);

    twoReopens(tabA.dump());
}

{
    suite('C5: an acknowledgement, and a removal the disk refused');

    const { tabA, tabB } = twoTabs();

    put(tabA, PATH, 'p_01');
    const op = tabA.Sync.projectedQueue().get(PATH);
    given('the edit is queued', Boolean(op));
    const acknowledgement = op.slot + ':ack:' + op.opId;
    given('the cloud has it and the acknowledgement is on the disk',
        tabA.Sync.markAcknowledged([op.opId]) && tabA.raw(acknowledgement) === '1');

    tabB.blockRemoval(key => key === op.batchKey);
    tabB.Sync.collectQueueGarbage();
    given('the operation is still on the disk', tabA.raw(op.batchKey) !== null);

    // RED, and the cost is the shape A2 pins for an older build's queue: an edit the cloud
    // has already answered for goes out again at every open, for as long as the disk goes
    // on refusing, with the count beside it never moving.
    check('the acknowledgement outlives a removal the disk refused',
        tabA.raw(acknowledgement) === '1', String(tabA.raw(acknowledgement)));

    const cloud = makeCloud({ doc: document({ days: { '2026-08-10': {
        plan: {}, actual: { w_01: dayValue('p_01') } } } }) });
    const reopened = makeDevice({ storage: tabA.dump(), deviceId: 'd_r' });
    reopened.State.load();
    await connected(reopened, cloud);
    await settle(TICK * 40);
    check('and the edit the cloud has already answered for is not sent again',
        cloud.writes.filter(write => write.patch && write.patch[PATH] !== undefined)
            .length === 0,
        JSON.stringify(cloud.writes.map(write => Object.keys(write.patch || {}))));

    twoReopens(tabA.dump());
}

report();
