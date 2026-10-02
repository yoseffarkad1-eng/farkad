// Overlapping writes: two tabs on one disk, two phones on one document, and the pass
// that throws queue records away.
//
//   node tests/races.tabs.test.mjs
//
// Every race here is OPEN AT BOTH ENDS. A test in which the first write resolves before
// the second one starts is not a concurrency test - it is two sequential writes wearing
// the word - so each case holds a request open with deferred() from the harness and
// asserts the record WHILE both are in flight as well as after they have settled. The
// in-flight assertion is the one that catches a queue answering about work nobody has
// answered for yet; the settled one catches the queue that repairs itself only because
// nothing overlapped.
//
// Nothing here reads source and nothing compares one caller of a projection against
// another caller of the same projection. The claims are made against the BYTES on the
// disk - every farkad:outbox key, counted and read - and against the document the fake
// cloud actually holds, because the defects these exist for are precisely a queue that
// reports one thing while holding another.
//
// R1-R5   two tabs, one disk. One person, whatever the two writes are signed with.
// R6-R10  two phones, one document.
// R11-R14 acknowledge and prune: what may be collected, and what a refusal costs.

import { makeDevice, makeCloud, sharedStore, settle, settleUntil, deferred }
    from './harness.mjs';
import { suite, check, same, given, report } from './runner.mjs';

const TICK = 5;

const WORKERS = [
    { id: 'w_01', name: 'דוד', active: true, dailyRate: 400, hourlyRate: 50 },
    { id: 'w_02', name: 'שרה', active: true, dailyRate: 350, hourlyRate: 0 }
];
const PLACES = [
    { id: 'p_00', name: 'בת ים', active: true },
    { id: 'p_01', name: 'הרצליה', active: true },
    { id: 'p_02', name: 'תל אביב', active: true }
];

const DAY_ONE = 'days.2026-08-10.actual.w_01';
const DAY_TWO = 'days.2026-08-11.actual.w_02';
const DAY_THREE = 'days.2026-08-12.actual.w_01';

function baseDocument(days) {
    return {
        schemaVersion: 2,
        workers: WORKERS.map(worker => Object.assign({}, worker)),
        places: PLACES.map(place => Object.assign({}, place)),
        days: days || {}, advances: {},
        updatedAt: '2026-08-01T00:00:00.000Z', updatedBy: 'd_old'
    };
}

function seed(device) {
    device.State.schedule.workers = WORKERS.map(worker => Object.assign({}, worker));
    device.State.schedule.places = PLACES.map(place => Object.assign({}, place));
    device.State.save({ silent: true });
    return device;
}

// One site on a day, REPLACING whatever was there: assignPlace adds and is idempotent,
// so the site that is already there has to be taken off first. Several cases here turn
// on "the same path, two different values", which needs the day to hold one site.
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

const connected = async (device, cloud, adapter) => {
    device.Sync.pushDelayMs = TICK;
    device.Sync.connect(adapter || cloud.adapter);
    await settleUntil(() => device.Sync._heardFromCloud === true, 4000);
    await settle(TICK * 4);
};

// ---------------------------------------------------------------- the bytes

const outboxKeys = device => Object.keys(device.dump())
    .filter(key => key.indexOf('farkad:outbox') === 0 && key.indexOf(':damaged') === -1)
    .sort();

// Every physical operation on this disk, read out of the raw records rather than through
// the projection - the whole question in half of these cases is whether the projection
// and the bytes agree.
function physicalOps(device) {
    const dump = device.dump();
    const out = [];
    outboxKeys(device).forEach(key => {
        if (key.indexOf(':op:') === -1) return;
        let parsed;
        try { parsed = JSON.parse(dump[key]); } catch (error) { return; }
        if (!parsed || !Array.isArray(parsed.ops)) return;
        parsed.ops.forEach(op => out.push({
            key, opId: String(op.opId), path: String(op.path), value: op.value,
            seq: op.seq, after: (op.after || []).map(String)
        }));
    });
    return out;
}

const markedIds = (device, mark) => outboxKeys(device)
    .filter(key => key.indexOf(mark) !== -1)
    .map(key => key.slice(key.lastIndexOf(mark) + mark.length))
    .sort();

const ackedIds = device => markedIds(device, ':ack:');
const heldIds = device => markedIds(device, ':hold:');
const beatenIds = device => markedIds(device, ':beat:');

const placeOf = record => {
    const entries = (record && record.entries) || [];
    return entries.map(entry => entry.placeId).join('+') || null;
};

const dayAt = (root, path) => {
    const [, date, layer, workerId] = String(path).split('.');
    const days = (root && root.days) || {};
    return ((days[date] || {})[layer] || {})[workerId];
};

const cloudPlace = (cloud, path) => placeOf(dayAt(cloud.doc, path));
const screenPlace = (device, path) => placeOf(dayAt(device.State.schedule, path));
const diskPlace = (device, path) => {
    const raw = device.raw('scheduleData:v2');
    if (raw === null) return null;
    try { return placeOf(dayAt(JSON.parse(raw), path)); } catch (error) { return null; }
};

const opsFor = (device, path) => physicalOps(device).filter(op => op.path === path);

// Key ORDER is not part of what a document is - a Firestore map has none, and two runs of
// one race build their days in the order the two writes happened to land - so the
// comparison below is made on a canonical form. Anything else would report a difference
// that is not one.
function canonical(value) {
    if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
    if (value && typeof value === 'object') {
        return '{' + Object.keys(value).sort()
            .map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
    }
    return JSON.stringify(value === undefined ? null : value);
}

// The business half of the cloud document - everything the ordering envelope is not. Two
// runs of one race have different clocks, different device names and different revisions
// by construction; what has to converge is the record.
function businessOf(doc) {
    if (!doc) return null;
    const out = {};
    ['schemaVersion', 'workers', 'places', 'days', 'advances', 'ledger']
        .forEach(key => {
            if (doc[key] !== undefined) out[key] = doc[key];
        });
    return canonical(out);
}

// How many updates have been ATTEMPTED against this cloud, and how many have landed.
// The gap between the two is what "in flight" means here.
const attempted = cloud => cloud.attempts.filter(a => a.kind === 'update').length;
const landed = cloud => cloud.writes.filter(w => w.kind === 'update' && !w.replayed).length;

// Hold every write of `kind` open until the returned gate is released or refused.
function holdWrites(cloud, kind) {
    const gate = deferred();
    cloud.hold = (thisKind) => (thisKind === kind ? gate.promise : null);
    return gate;
}

// ================================================================ R1
//
// Two tabs of one app record two different days at the same moment, and each one's write
// is open while the other's is being made. Nothing may be lost - both operations are on
// the one disk they share - and nothing may be ACKNOWLEDGED while it is still unanswered:
// an acknowledgement is what lets the collector throw the only copy of an edit away.
{
    suite('R1: two tabs, two days, both writes open at once');

    const cloud = makeCloud({ doc: baseDocument() });
    const shared = sharedStore();
    const tabA = makeDevice({ sharedStorage: shared, deviceId: 'd_a' });
    seed(tabA);
    const tabB = makeDevice({ sharedStorage: shared, deviceId: 'd_b' });
    tabB.State.load();

    await connected(tabA, cloud);
    await connected(tabB, cloud);
    given('both tabs are connected and have heard the document',
        tabA.Sync._heardFromCloud && tabB.Sync._heardFromCloud);

    const gate = holdWrites(cloud, 'update');

    put(tabA, DAY_ONE, 'p_01');
    put(tabB, DAY_TWO, 'p_02');
    const bothOpen = await settleUntil(() => attempted(cloud) >= 2, 4000);

    // IN FLIGHT, both of them.
    given('both tabs have a write open at the same moment',
        bothOpen && landed(cloud) === 0,
        JSON.stringify({ attempted: attempted(cloud), landed: landed(cloud) }));

    check('both days are on the shared disk while both writes are open',
        opsFor(tabA, DAY_ONE).length === 1 && opsFor(tabA, DAY_TWO).length === 1,
        JSON.stringify(physicalOps(tabA).map(op => op.path)));
    check('and neither is acknowledged while it is still unanswered',
        ackedIds(tabA).length === 0, JSON.stringify(ackedIds(tabA)));
    check('each tab owes both days, because one disk is one queue',
        tabA.Sync.pendingCount() === 2 && tabB.Sync.pendingCount() === 2,
        JSON.stringify([tabA.Sync.pendingCount(), tabB.Sync.pendingCount()]));

    gate.release();
    await settleUntil(() => cloudPlace(cloud, DAY_ONE) === 'p_01'
        && cloudPlace(cloud, DAY_TWO) === 'p_02', 5000);
    await settle(TICK * 40);

    check('both days are in the cloud once the two writes have settled',
        cloudPlace(cloud, DAY_ONE) === 'p_01' && cloudPlace(cloud, DAY_TWO) === 'p_02',
        JSON.stringify([cloudPlace(cloud, DAY_ONE), cloudPlace(cloud, DAY_TWO)]));
    check('nothing is owed on either tab',
        tabA.Sync.pendingCount() === 0 && tabB.Sync.pendingCount() === 0,
        JSON.stringify([tabA.Sync.pendingCount(), tabB.Sync.pendingCount()]));
    check('and nothing was held as a contest',
        heldIds(tabA).length === 0 && !tabA.Sync.holdingContested(),
        JSON.stringify(heldIds(tabA)));

    const reopened = makeDevice({ storage: tabA.dump(), deviceId: 'd_a' });
    reopened.State.load();
    check('a reopen of the shared disk holds both days',
        screenPlace(reopened, DAY_ONE) === 'p_01'
        && screenPlace(reopened, DAY_TWO) === 'p_02',
        JSON.stringify([screenPlace(reopened, DAY_ONE), screenPlace(reopened, DAY_TWO)]));
}

// ================================================================ R2
//
// The same path, twice, by one person on two tabs - and the second decision is made while
// the first is still on its way to the cloud. Their later decision has to win, and NEITHER
// tab may be left holding a contest: a contest is somebody ELSE's correction, and there is
// nobody else here. A phantom one strands the edit for ever and tells a person there is a
// conflict about a day they corrected themselves.
{
    suite('R2: two tabs correcting one day, the second decided mid-flight');

    const cloud = makeCloud({ doc: baseDocument() });
    const shared = sharedStore();
    const tabA = makeDevice({ sharedStorage: shared, deviceId: 'd_a' });
    seed(tabA);
    const tabB = makeDevice({ sharedStorage: shared, deviceId: 'd_b' });
    tabB.State.load();

    await connected(tabA, cloud);
    await connected(tabB, cloud);

    const gate = holdWrites(cloud, 'update');

    put(tabA, DAY_ONE, 'p_01');
    const firstOpen = await settleUntil(() => attempted(cloud) >= 1, 4000);
    given('the first tab has its write open', firstOpen && landed(cloud) === 0);

    // The correction, made while the first write is still open.
    put(tabB, DAY_ONE, 'p_02');
    await settle(TICK * 8);

    const inFlight = opsFor(tabA, DAY_ONE);
    const current = tabA.Sync.projectedQueue().get(DAY_ONE);
    check('the later decision is the one the queue would send',
        placeOf(current && current.value) === 'p_02',
        String(placeOf(current && current.value)));
    // The earlier value must be UNABLE to come back, and there are two lawful ways for
    // that to be true: its record is gone because the later one superseded it, or it is
    // still there and the later one NAMES it. What must never be true is a p_01 sitting
    // on the disk that nothing supersedes - prune the winner and it is current again.
    const stale = inFlight.filter(op => placeOf(op.value) === 'p_01');
    check('the value that was corrected cannot become current again',
        stale.every(op => (current && current.after.indexOf(op.opId) !== -1)
            || beatenIds(tabA).indexOf(op.opId) !== -1),
        JSON.stringify({ stale: stale.map(op => op.opId),
            named: current && current.after, beaten: beatenIds(tabA) }));
    check('and nothing is acknowledged while the first write is still open',
        ackedIds(tabA).length === 0, JSON.stringify(ackedIds(tabA)));
    check('neither tab holds a contest while both are in flight',
        heldIds(tabA).length === 0
        && !tabA.Sync.holdingContested() && !tabB.Sync.holdingContested(),
        JSON.stringify(heldIds(tabA)));

    gate.release();
    await settleUntil(() => cloudPlace(cloud, DAY_ONE) === 'p_02'
        && tabA.Sync.pendingCount() === 0 && tabB.Sync.pendingCount() === 0, 6000);
    await settle(TICK * 40);

    check('the person\'s later decision is what the cloud holds',
        cloudPlace(cloud, DAY_ONE) === 'p_02', String(cloudPlace(cloud, DAY_ONE)));
    check('and what the disk holds', diskPlace(tabB, DAY_ONE) === 'p_02',
        String(diskPlace(tabB, DAY_ONE)));
    check('no phantom contest was written down on either tab',
        heldIds(tabA).length === 0 && heldIds(tabB).length === 0,
        JSON.stringify([heldIds(tabA), heldIds(tabB)]));
    check('neither tab is stuck reporting a conflict',
        tabA.Sync.status !== 'contested' && tabB.Sync.status !== 'contested',
        JSON.stringify([tabA.Sync.status, tabB.Sync.status]));
    check('and nothing is left owing',
        tabA.Sync.pendingCount() === 0 && tabB.Sync.pendingCount() === 0,
        JSON.stringify([tabA.Sync.pendingCount(), tabB.Sync.pendingCount()]));

    const reopened = makeDevice({ storage: tabA.dump(), deviceId: 'd_a' });
    reopened.State.load();
    check('and a reopen shows the correction, not what it corrected',
        screenPlace(reopened, DAY_ONE) === 'p_02',
        String(screenPlace(reopened, DAY_ONE)));
}

// ---------------------------------------------------------------- R2, the other way
//
// The same two tabs, with the LANDING ORDER reversed: the correction reaches the server
// first and the older tab's request - open all the while - arrives against a document that
// has moved. The server refuses it, which is right. What must not follow is a hold: a hold
// says somebody ELSE corrected this and only a person can decide, and there is nobody else
// here. One person, one disk, two tabs, and their own later decision already in the cloud.
{
    suite('R2b: the correction lands first, and the older tab is refused');

    const cloud = makeCloud({ doc: baseDocument() });
    const shared = sharedStore();
    const tabA = makeDevice({ sharedStorage: shared, deviceId: 'd_a' });
    seed(tabA);
    const tabB = makeDevice({ sharedStorage: shared, deviceId: 'd_b' });
    tabB.State.load();

    await connected(tabA, cloud);
    await connected(tabB, cloud);

    // Only the FIRST update is held: the correction that follows it goes straight through
    // and takes the revision the held one was built for.
    const gate = deferred();
    let updates = 0;
    cloud.hold = (kind) => {
        if (kind !== 'update') return null;
        updates += 1;
        return updates === 1 ? gate.promise : null;
    };

    put(tabA, DAY_ONE, 'p_01');
    const firstOpen = await settleUntil(() => attempted(cloud) >= 1, 4000);
    given('the older tab has its write open', firstOpen && landed(cloud) === 0);

    put(tabB, DAY_ONE, 'p_02');
    const arrived = await settleUntil(() => cloudPlace(cloud, DAY_ONE) === 'p_02', 5000);
    given('the correction landed while that write was still open',
        arrived && landed(cloud) === 1,
        JSON.stringify({ cloud: cloudPlace(cloud, DAY_ONE), landed: landed(cloud) }));

    gate.release();
    await settle(TICK * 60);
    await settleUntil(() => tabA.Sync.pendingCount() === 0
        && tabB.Sync.pendingCount() === 0, 6000);
    await settle(TICK * 40);

    check('the correction is still what the cloud holds',
        cloudPlace(cloud, DAY_ONE) === 'p_02', String(cloudPlace(cloud, DAY_ONE)));
    check('the older tab did not put its value back',
        cloudPlace(cloud, DAY_ONE) !== 'p_01', String(cloudPlace(cloud, DAY_ONE)));
    check('no hold was written down for one person\'s own two decisions',
        heldIds(tabA).length === 0 && heldIds(tabB).length === 0,
        JSON.stringify([heldIds(tabA), heldIds(tabB)]));
    check('neither tab is left holding a contest',
        !tabA.Sync.holdingContested() && !tabB.Sync.holdingContested(),
        JSON.stringify([tabA.Sync.holdingContested(), tabB.Sync.holdingContested()]));
    check('and neither is left saying there is a conflict',
        tabA.Sync.status !== 'contested' && tabB.Sync.status !== 'contested',
        JSON.stringify([tabA.Sync.status, tabB.Sync.status]));
    check('with nothing owed on either tab',
        tabA.Sync.pendingCount() === 0 && tabB.Sync.pendingCount() === 0,
        JSON.stringify([tabA.Sync.pendingCount(), tabB.Sync.pendingCount()]));
}

// ================================================================ R3
//
// One tab's write is open when the other runs the collector. The rule the pass has to
// obey is exactly one sentence: an operation may be collected only when the cloud has
// answered it AND the disk holds it. A write that is still in flight has been answered by
// nobody, so nothing about it may be thrown away - and the tab running the collector is a
// different JavaScript context, which knows nothing about the request the first one has
// open.
{
    suite('R3: the collector runs while the other tab has a write open');

    const cloud = makeCloud({ doc: baseDocument() });
    const shared = sharedStore();
    const tabA = makeDevice({ sharedStorage: shared, deviceId: 'd_a' });
    seed(tabA);
    const tabB = makeDevice({ sharedStorage: shared, deviceId: 'd_b' });
    tabB.State.load();

    // Something for the collector to actually find. This is the state that exists between
    // the two halves of acknowledge() - the cloud has answered the operation and the
    // collection pass has not run yet - staged through the same accessor acknowledge()
    // uses, so the collector is asked exactly the question it is asked in the app.
    put(tabA, DAY_THREE, 'p_00');
    const settledOp = opsFor(tabA, DAY_THREE)[0];
    given('the first day is queued and on the disk',
        Boolean(settledOp) && diskPlace(tabA, DAY_THREE) === 'p_00');
    // The cloud really does hold it, exactly as this device recorded it - an
    // acknowledgement that were not true of the document would be staging a state the
    // app cannot reach, and the reopen at the end of this case would be measuring it.
    cloud.doc.days['2026-08-12'] = {
        actual: { w_01: dayAt(tabA.State.schedule, DAY_THREE) }
    };
    given('and the cloud has answered it',
        tabA.Sync.markAcknowledged([settledOp.opId]) === true);
    given('while the collection pass has not run',
        opsFor(tabA, DAY_THREE).length === 1);

    await connected(tabA, cloud);

    const gate = holdWrites(cloud, 'update');
    put(tabA, DAY_ONE, 'p_01');
    const open = await settleUntil(() => attempted(cloud) >= 1, 4000);
    given('the write is open', open && landed(cloud) === 0);

    const flying = opsFor(tabA, DAY_ONE)[0];
    given('the in-flight operation can be named', Boolean(flying));
    given('and it is not acknowledged', ackedIds(tabA).indexOf(flying.opId) === -1);

    // The OTHER tab - a background tab of the same app, with no connection of its own -
    // records a day and saves. State.persist calls markSaved on every successful write,
    // and markSaved is the ordinary door into the collector.
    tabB.State.load();
    put(tabB, DAY_TWO, 'p_02');
    const collected = tabB.Sync.collectQueueGarbage();

    const afterIds = physicalOps(tabB).map(op => op.opId);
    check('the collector took the operation the cloud had answered and the disk held',
        afterIds.indexOf(settledOp.opId) === -1, settledOp.opId);
    check('and left the one that is still in flight exactly where it was',
        afterIds.indexOf(flying.opId) !== -1
        && placeOf(opsFor(tabB, DAY_ONE)[0].value) === 'p_01',
        JSON.stringify(opsFor(tabB, DAY_ONE).map(op => placeOf(op.value))));
    check('nothing unanswered was collected by the other tab',
        opsFor(tabB, DAY_ONE).length === 1 && opsFor(tabB, DAY_TWO).length === 1,
        JSON.stringify(physicalOps(tabB).map(op => op.path)));
    check('the in-flight day is not acknowledged by anybody',
        ackedIds(tabB).indexOf(flying.opId) === -1, JSON.stringify(ackedIds(tabB)));
    check('and the pass reports what it actually did',
        collected === true, String(collected));

    gate.release();
    await settleUntil(() => cloudPlace(cloud, DAY_ONE) === 'p_01'
        && cloudPlace(cloud, DAY_TWO) === 'p_02', 6000);
    await settle(TICK * 40);

    check('both days reach the cloud once the write is answered',
        cloudPlace(cloud, DAY_ONE) === 'p_01' && cloudPlace(cloud, DAY_TWO) === 'p_02',
        JSON.stringify([cloudPlace(cloud, DAY_ONE), cloudPlace(cloud, DAY_TWO)]));

    const reopened = makeDevice({ storage: tabA.dump(), deviceId: 'd_a' });
    reopened.State.load();
    check('and a reopen holds all three days',
        screenPlace(reopened, DAY_THREE) === 'p_00'
        && screenPlace(reopened, DAY_ONE) === 'p_01'
        && screenPlace(reopened, DAY_TWO) === 'p_02',
        JSON.stringify([screenPlace(reopened, DAY_THREE), screenPlace(reopened, DAY_ONE),
            screenPlace(reopened, DAY_TWO)]));
}

// ================================================================ R4
//
// The right to send is a record on the shared disk, and it can be taken away while a
// request is open - the owner is asleep, its lease goes stale, the other tab takes over.
// The claim moving is deliberately no longer a reason to stand down: the ordering protocol
// catches a stale write at the server. What it must NOT do is let the tab that lost the
// claim report an unanswered write as done. An acknowledgement is what lets the collector
// throw the only copy of an edit away.
{
    suite('R4: a tab that loses the claim mid-flight reports nothing as done');

    const cloud = makeCloud({ doc: baseDocument() });
    const shared = sharedStore();
    const tabA = makeDevice({ sharedStorage: shared, deviceId: 'd_a' });
    seed(tabA);
    const tabB = makeDevice({ sharedStorage: shared, deviceId: 'd_b' });
    tabB.State.load();

    await connected(tabA, cloud);

    const gate = holdWrites(cloud, 'update');
    put(tabA, DAY_ONE, 'p_01');
    const open = await settleUntil(() => attempted(cloud) >= 1, 4000);
    given('the first tab has a write open', open && landed(cloud) === 0);
    given('and it owns the right to send', tabA.Sync.stillOwnsSendClaim() === true);

    const flying = opsFor(tabA, DAY_ONE)[0];
    given('the in-flight operation can be named', Boolean(flying));

    // The other tab takes the claim while that request is still open - which is what an
    // owner that has stopped beating looks like from over there.
    const now = Date.now();
    given('the other tab took the claim',
        tabB.Store.setVerified('farkad:sendClaim', JSON.stringify({
            by: 'd_b', token: 'ct_' + now, at: now, beat: now
        })) === true);

    check('the tab with the request open knows it no longer owns the claim',
        tabA.Sync.stillOwnsSendClaim() === false, String(tabA.Sync.stillOwnsSendClaim()));
    check('and has acknowledged nothing while the answer is still owed',
        ackedIds(tabA).indexOf(flying.opId) === -1, JSON.stringify(ackedIds(tabA)));
    check('the edit is still owed on both tabs',
        tabA.Sync.pendingCount() === 1 && tabB.Sync.pendingCount() === 1,
        JSON.stringify([tabA.Sync.pendingCount(), tabB.Sync.pendingCount()]));

    // The answer never comes: the connection went while the claim was being taken.
    const lost = new Error('the answer never arrived');
    lost.code = 'unavailable';
    gate.refuse(lost);
    await settle(TICK * 40);

    check('a write that was never answered is not acknowledged',
        ackedIds(tabA).indexOf(flying.opId) === -1, JSON.stringify(ackedIds(tabA)));
    check('the operation is still on the disk, whole',
        opsFor(tabA, DAY_ONE).length === 1
        && placeOf(opsFor(tabA, DAY_ONE)[0].value) === 'p_01',
        JSON.stringify(opsFor(tabA, DAY_ONE).map(op => placeOf(op.value))));
    check('and nothing on that tab says it is synced',
        tabA.Sync.status !== 'synced', tabA.Sync.status);
    check('nor did the cloud take anything',
        cloudPlace(cloud, DAY_ONE) === null, String(cloudPlace(cloud, DAY_ONE)));

    // And it is not stranded: the ladder comes round, the claim is free again by then,
    // and the day goes.
    cloud.hold = null;
    tabA.Store.remove('farkad:sendClaim');
    tabA.Sync._retryAt = 0;
    tabA.Sync.flush();
    await settleUntil(() => cloudPlace(cloud, DAY_ONE) === 'p_01', 6000);
    check('the day still reaches the cloud when the connection comes back',
        cloudPlace(cloud, DAY_ONE) === 'p_01', String(cloudPlace(cloud, DAY_ONE)));
    check('and only then is it acknowledged',
        ackedIds(tabA).indexOf(flying.opId) !== -1
        || opsFor(tabA, DAY_ONE).length === 0,
        JSON.stringify({ acked: ackedIds(tabA), left: opsFor(tabA, DAY_ONE).length }));
}

// ================================================================ R5
//
// Two tabs with a write each open, and a snapshot arriving between them. Neither may
// acknowledge the OTHER's unanswered work: an acknowledgement is a statement about the
// exact operation that left this device, and the second tab's write failing must leave
// its day owed even though the first tab's write - which carried that day too - landed
// with a different operation id on it.
{
    suite('R5: one snapshot, two open writes, nobody acknowledges the other');

    const cloud = makeCloud({ doc: baseDocument() });
    const shared = sharedStore();
    const tabA = makeDevice({ sharedStorage: shared, deviceId: 'd_a' });
    seed(tabA);
    const tabB = makeDevice({ sharedStorage: shared, deviceId: 'd_b' });
    tabB.State.load();

    await connected(tabA, cloud);
    await connected(tabB, cloud);

    // Three gates, and the third is what makes the measurement possible: the tab whose
    // write lands schedules another flush the moment it is answered, so without a gate on
    // the write after this race the queue drains before anything can be read.
    const gateA = deferred();
    const gateB = deferred();
    const gateC = deferred();
    let updates = 0;
    cloud.hold = (kind) => {
        if (kind !== 'update') return null;
        updates += 1;
        if (updates === 1) return gateA.promise;
        if (updates === 2) return gateB.promise;
        return gateC.promise;
    };

    put(tabA, DAY_ONE, 'p_01');
    const firstOpen = await settleUntil(() => attempted(cloud) >= 1, 4000);
    given('the first tab has its write open', firstOpen && landed(cloud) === 0);
    const opOne = opsFor(tabA, DAY_ONE)[0];

    put(tabB, DAY_TWO, 'p_02');
    const secondOpen = await settleUntil(() => attempted(cloud) >= 2, 4000);
    given('and the second tab opens one of its own while it is still there',
        secondOpen && landed(cloud) === 0);
    const opTwo = opsFor(tabB, DAY_TWO)[0];
    given('both operations can be named', Boolean(opOne) && Boolean(opTwo));

    check('nothing is acknowledged while both writes are open',
        ackedIds(tabA).length === 0, JSON.stringify(ackedIds(tabA)));

    // The second tab's answer is lost; the first tab's lands. The first tab's write
    // carried only its own day, so the second tab's day is still owed by everybody.
    const lost = new Error('the answer never arrived');
    lost.code = 'unavailable';
    gateB.refuse(lost);
    gateA.release();
    await settleUntil(() => cloudPlace(cloud, DAY_ONE) === 'p_01', 5000);
    await settleUntil(() => attempted(cloud) >= 3, 4000);
    await settle(TICK * 20);

    check('the answered day is finished with: acknowledged, and collected',
        opsFor(tabA, DAY_ONE).length === 0, JSON.stringify(physicalOps(tabA)
            .map(op => op.path)));
    check('the unanswered day is not acknowledged, by either tab',
        ackedIds(tabA).indexOf(opTwo.opId) === -1
        && ackedIds(tabB).indexOf(opTwo.opId) === -1,
        JSON.stringify({ a: ackedIds(tabA), b: ackedIds(tabB), owed: opTwo.opId }));
    check('the unanswered operation is still on the disk, whole',
        opsFor(tabA, DAY_TWO).length === 1
        && opsFor(tabA, DAY_TWO)[0].opId === opTwo.opId
        && placeOf(opsFor(tabA, DAY_TWO)[0].value) === 'p_02',
        JSON.stringify(opsFor(tabA, DAY_TWO).map(op => placeOf(op.value))));
    check('it is still owed on both tabs',
        tabA.Sync.pendingCount() === 1 && tabB.Sync.pendingCount() === 1,
        JSON.stringify([tabA.Sync.pendingCount(), tabB.Sync.pendingCount()]));
    check('the cloud does not have it yet',
        cloudPlace(cloud, DAY_TWO) === null, String(cloudPlace(cloud, DAY_TWO)));
    check('and its day is still on the screen and on the disk',
        screenPlace(tabB, DAY_TWO) === 'p_02' && diskPlace(tabB, DAY_TWO) === 'p_02',
        JSON.stringify([screenPlace(tabB, DAY_TWO), diskPlace(tabB, DAY_TWO)]));

    gateC.release();
    cloud.hold = null;
    await settleUntil(() => cloudPlace(cloud, DAY_TWO) === 'p_02', 6000);
    check('and it goes on the next attempt',
        cloudPlace(cloud, DAY_TWO) === 'p_02', String(cloudPlace(cloud, DAY_TWO)));
    check('with both days in the document',
        cloudPlace(cloud, DAY_ONE) === 'p_01' && cloudPlace(cloud, DAY_TWO) === 'p_02',
        JSON.stringify([cloudPlace(cloud, DAY_ONE), cloudPlace(cloud, DAY_TWO)]));
}

// ================================================================ R6
//
// Two phones, two field paths, both writes open at the same moment. This is the ordinary
// evening: three people filling in one day. Both have to land, and the one refused for
// being built on a base that has moved has to rebase rather than hold - a path nobody
// touched is not a contest.
{
    suite('R6: two phones, disjoint paths, both open at once');

    const cloud = makeCloud({ doc: baseDocument() });
    const phoneA = seed(makeDevice({ deviceId: 'd_a' }));
    const phoneB = seed(makeDevice({ deviceId: 'd_b' }));
    await connected(phoneA, cloud);
    await connected(phoneB, cloud);

    const gate = holdWrites(cloud, 'update');
    put(phoneA, DAY_ONE, 'p_01');
    put(phoneB, DAY_TWO, 'p_02');
    const bothOpen = await settleUntil(() => attempted(cloud) >= 2, 4000);
    given('both phones have a write open at the same moment',
        bothOpen && landed(cloud) === 0,
        JSON.stringify({ attempted: attempted(cloud), landed: landed(cloud) }));

    check('each phone still holds its own edit while both are open',
        opsFor(phoneA, DAY_ONE).length === 1 && opsFor(phoneB, DAY_TWO).length === 1,
        JSON.stringify([opsFor(phoneA, DAY_ONE).length, opsFor(phoneB, DAY_TWO).length]));
    check('and neither has acknowledged anything',
        ackedIds(phoneA).length === 0 && ackedIds(phoneB).length === 0,
        JSON.stringify([ackedIds(phoneA), ackedIds(phoneB)]));

    gate.release();
    await settleUntil(() => cloudPlace(cloud, DAY_ONE) === 'p_01'
        && cloudPlace(cloud, DAY_TWO) === 'p_02', 6000);
    await settle(TICK * 40);

    check('both days landed', cloudPlace(cloud, DAY_ONE) === 'p_01'
        && cloudPlace(cloud, DAY_TWO) === 'p_02',
        JSON.stringify([cloudPlace(cloud, DAY_ONE), cloudPlace(cloud, DAY_TWO)]));
    check('neither phone held the other\'s day as a contest',
        heldIds(phoneA).length === 0 && heldIds(phoneB).length === 0,
        JSON.stringify([heldIds(phoneA), heldIds(phoneB)]));
    check('and both phones owe nothing',
        phoneA.Sync.pendingCount() === 0 && phoneB.Sync.pendingCount() === 0,
        JSON.stringify([phoneA.Sync.pendingCount(), phoneB.Sync.pendingCount()]));
    check('with each phone showing the other\'s day too',
        screenPlace(phoneA, DAY_TWO) === 'p_02' && screenPlace(phoneB, DAY_ONE) === 'p_01',
        JSON.stringify([screenPlace(phoneA, DAY_TWO), screenPlace(phoneB, DAY_ONE)]));
}

// ================================================================ R7
//
// Two phones, ONE path, both writes open at the same moment. One lands. The loser must
// not be rebased on top of the winner - that is somebody's recorded day replaced by a
// value built before it existed - and it must not be silently dropped either. It is HELD:
// written down on the disk, under the operation's own id, visible on the status line, and
// still held after the app is closed and opened again.
{
    suite('R7: two phones on one day, and what happens to the loser');

    const cloud = makeCloud({ doc: baseDocument({ '2026-08-10': { actual: { w_01: { entries: [{ placeId: 'p_00' }] } } } }) });
    const phoneA = seed(makeDevice({ deviceId: 'd_a' }));
    const phoneB = seed(makeDevice({ deviceId: 'd_b' }));
    await connected(phoneA, cloud);
    await connected(phoneB, cloud);
    given('both phones start from the same day',
        screenPlace(phoneA, DAY_ONE) === 'p_00' && screenPlace(phoneB, DAY_ONE) === 'p_00',
        JSON.stringify([screenPlace(phoneA, DAY_ONE), screenPlace(phoneB, DAY_ONE)]));

    const gateA = deferred();
    const gateB = deferred();
    let updates = 0;
    cloud.hold = (kind) => {
        if (kind !== 'update') return null;
        updates += 1;
        return updates === 1 ? gateA.promise : (updates === 2 ? gateB.promise : null);
    };

    put(phoneA, DAY_ONE, 'p_01');
    const firstOpen = await settleUntil(() => attempted(cloud) >= 1, 4000);
    given('the first write is open', firstOpen && landed(cloud) === 0);
    put(phoneB, DAY_ONE, 'p_02');
    const bothOpen = await settleUntil(() => attempted(cloud) >= 2, 4000);
    given('and the second is open beside it',
        bothOpen && landed(cloud) === 0,
        JSON.stringify({ attempted: attempted(cloud), landed: landed(cloud) }));

    check('neither phone has held anything while both are in flight',
        heldIds(phoneA).length === 0 && heldIds(phoneB).length === 0,
        JSON.stringify([heldIds(phoneA), heldIds(phoneB)]));

    gateA.release();
    await settleUntil(() => cloudPlace(cloud, DAY_ONE) === 'p_01', 5000);
    gateB.release();
    await settleUntil(() => heldIds(phoneB).length > 0, 6000);
    await settle(TICK * 40);

    check('the winner\'s day is what the cloud holds',
        cloudPlace(cloud, DAY_ONE) === 'p_01', String(cloudPlace(cloud, DAY_ONE)));
    const loser = opsFor(phoneB, DAY_ONE)[0];
    check('the loser is written down as held, by its own id',
        Boolean(loser) && heldIds(phoneB).indexOf(loser.opId) !== -1,
        JSON.stringify({ held: heldIds(phoneB), op: loser && loser.opId }));
    check('and it says so on the loser\'s status',
        phoneB.Sync.status === 'contested', phoneB.Sync.status);
    check('the loser still holds its own record of the day',
        opsFor(phoneB, DAY_ONE).length === 1
        && placeOf(opsFor(phoneB, DAY_ONE)[0].value) === 'p_02',
        JSON.stringify(opsFor(phoneB, DAY_ONE).map(op => placeOf(op.value))));

    const before = landed(cloud);
    const reopened = makeDevice({ storage: phoneB.dump(), deviceId: 'd_b' });
    reopened.State.load();
    await connected(reopened, cloud);
    reopened.Sync.flush();
    await settle(TICK * 60);

    check('a reopened phone is still holding it',
        reopened.Sync.holdingContested() === true,
        String(reopened.Sync.holdingContested()));
    check('and sends nothing over the winner\'s day',
        landed(cloud) === before && cloudPlace(cloud, DAY_ONE) === 'p_01',
        JSON.stringify({ landed: landed(cloud) - before, cloud: cloudPlace(cloud, DAY_ONE) }));
    check('the held edit survives the reopen on the disk',
        heldIds(reopened).indexOf(loser.opId) !== -1, JSON.stringify(heldIds(reopened)));
}

// ================================================================ R8
//
// A phone that was away comes back, HEARS the winner, and only then flushes. Nothing
// refuses it: its revision is current by the time it writes, so the compare-and-set is
// satisfied and its stale value would land straight over the correction. This was a real
// defect - measured as cloud p_00,p_02 where the winner was p_00,p_01 - and the fix is
// the pre-send question, asked of the record the operation carries rather than of the
// document's signature. It stays fixed here, with the winner's next write open at the
// same moment so the two are genuinely overlapping.
{
    suite('R8: back from the tunnel, hearing the winner, then flushing');

    const cloud = makeCloud({ doc: baseDocument({ '2026-08-10': { actual: { w_01: { entries: [{ placeId: 'p_00' }] } } } }) });
    const phoneA = seed(makeDevice({ deviceId: 'd_a' }));
    const phoneB = seed(makeDevice({ deviceId: 'd_b' }));
    await connected(phoneA, cloud);
    await connected(phoneB, cloud);
    given('both phones heard the day as it was',
        screenPlace(phoneB, DAY_ONE) === 'p_00', String(screenPlace(phoneB, DAY_ONE)));

    // The tunnel: the listener is gone and nothing this phone writes goes anywhere.
    phoneB.Sync.stopListening();
    phoneB.Sync.adapter = null;
    put(phoneB, DAY_ONE, 'p_02');
    given('the phone recorded its day with no signal',
        opsFor(phoneB, DAY_ONE).length === 1 && cloudPlace(cloud, DAY_ONE) === 'p_00');

    // Meanwhile the correction is made on the other phone, and lands.
    put(phoneA, DAY_ONE, 'p_01');
    await settleUntil(() => cloudPlace(cloud, DAY_ONE) === 'p_01', 5000);
    given('the other phone corrected the day', cloudPlace(cloud, DAY_ONE) === 'p_01');

    // The winner opens ANOTHER write, and the phone that was away comes back while it is
    // still open: the two are in flight together.
    const gate = holdWrites(cloud, 'update');
    put(phoneA, DAY_TWO, 'p_02');
    const open = await settleUntil(() => attempted(cloud) >= 2, 4000);
    given('the winner has a second write open', open);

    const landedBefore = landed(cloud);
    await connected(phoneB, cloud);
    phoneB.Sync._retryAt = 0;
    phoneB.Sync.flush();
    await settle(TICK * 60);

    // HEARD, which is the whole premise: the pre-send question is asked of the document
    // this phone has been told about, and by the time it flushes that document holds the
    // other phone's correction. What is on its SCREEN is deliberately its own record -
    // the queued value is put back over the adopted snapshot until somebody decides.
    check('the phone that was away heard the correction',
        placeOf(dayAt(phoneB.Sync._baseDoc, DAY_ONE)) === 'p_01',
        String(placeOf(dayAt(phoneB.Sync._baseDoc, DAY_ONE))));
    check('and kept its own record on the screen rather than losing it',
        screenPlace(phoneB, DAY_ONE) === 'p_02', String(screenPlace(phoneB, DAY_ONE)));
    check('its stale value did not go out at the current revision',
        cloudPlace(cloud, DAY_ONE) === 'p_01' && landed(cloud) === landedBefore,
        JSON.stringify({ cloud: cloudPlace(cloud, DAY_ONE),
            landed: landed(cloud) - landedBefore }));
    const stale = opsFor(phoneB, DAY_ONE)[0];
    check('it is held, durably, by its own id',
        Boolean(stale) && heldIds(phoneB).indexOf(stale.opId) !== -1,
        JSON.stringify({ held: heldIds(phoneB), op: stale && stale.opId }));
    check('and the phone says so rather than saying synced',
        phoneB.Sync.status === 'contested', phoneB.Sync.status);

    gate.release();
    await settleUntil(() => cloudPlace(cloud, DAY_TWO) === 'p_02', 6000);
    await settle(TICK * 40);
    check('the winner\'s other day still lands',
        cloudPlace(cloud, DAY_TWO) === 'p_02', String(cloudPlace(cloud, DAY_TWO)));
    check('and the correction is still what the cloud holds',
        cloudPlace(cloud, DAY_ONE) === 'p_01', String(cloudPlace(cloud, DAY_ONE)));
}

// ================================================================ R9
//
// The server committed and the answer never arrived. The retry carries the same operation
// id - it is the same operation, not a second one - so the server answers it from its
// receipt, performs no write, and the client is told which revision the operation
// actually reached. Writing twice here means the day lands twice at two revisions, and
// the second one goes out over whatever arrived in between.
{
    suite('R9: a lost answer, and a retry that must not write twice');

    const cloud = makeCloud({ doc: baseDocument() });
    const phoneA = seed(makeDevice({ deviceId: 'd_a' }));

    let dropped = 0;
    const flaky = Object.assign({}, cloud.adapter, {
        update(patch) {
            if (dropped === 0) {
                dropped = 1;
                return Promise.resolve(cloud.adapter.update(patch)).then(() => {
                    const lost = new Error('the answer never arrived');
                    lost.code = 'unavailable';
                    throw lost;
                }, () => {
                    const lost = new Error('the answer never arrived');
                    lost.code = 'unavailable';
                    throw lost;
                });
            }
            return cloud.adapter.update(patch);
        }
    });

    await connected(phoneA, cloud, flaky);
    put(phoneA, DAY_ONE, 'p_01');
    await settleUntil(() => dropped === 1 && cloudPlace(cloud, DAY_ONE) === 'p_01', 5000);
    const revisionAfterFirst = cloud.doc.revision;
    given('the server committed the write whose answer was lost',
        cloudPlace(cloud, DAY_ONE) === 'p_01' && Number.isInteger(revisionAfterFirst));
    check('and the phone has not acknowledged it, because it was never answered',
        ackedIds(phoneA).length === 0 && phoneA.Sync.pendingCount() === 1,
        JSON.stringify({ acked: ackedIds(phoneA), pending: phoneA.Sync.pendingCount() }));

    phoneA.Sync._retryAt = 0;
    phoneA.Sync.flush();
    await settleUntil(() => phoneA.Sync.pendingCount() === 0, 6000);
    await settle(TICK * 40);

    const replays = cloud.writes.filter(w => w.kind === 'update' && w.replayed).length;
    check('the retry was answered from the receipt rather than written again',
        replays === 1 && landed(cloud) === 1,
        JSON.stringify({ replays, landed: landed(cloud) }));
    check('the document moved exactly one revision for one operation',
        cloud.doc.revision === revisionAfterFirst, JSON.stringify(
            { before: revisionAfterFirst, after: cloud.doc.revision }));
    check('the day is in the cloud once, as it was recorded',
        cloudPlace(cloud, DAY_ONE) === 'p_01', String(cloudPlace(cloud, DAY_ONE)));
    check('the queue is finished with it',
        phoneA.Sync.pendingCount() === 0, String(phoneA.Sync.pendingCount()));
    check('and the phone may say synced',
        phoneA.Sync.status === 'synced', phoneA.Sync.status);
}

// ================================================================ R10
//
// The same two writes, raced both ways round. Which of two phones lands first is a coin
// toss on a building site, and the record must not depend on it: the document that comes
// out of A-then-B has to be the document that comes out of B-then-A, field for field.
{
    suite('R10: both winner orders converge to the same document');

    async function race(firstWins) {
        const cloud = makeCloud({ doc: baseDocument() });
        const phoneA = seed(makeDevice({ deviceId: 'd_a' }));
        const phoneB = seed(makeDevice({ deviceId: 'd_b' }));
        await connected(phoneA, cloud);
        await connected(phoneB, cloud);

        const gateA = deferred();
        const gateB = deferred();
        let updates = 0;
        cloud.hold = (kind) => {
            if (kind !== 'update') return null;
            updates += 1;
            return updates === 1 ? gateA.promise : (updates === 2 ? gateB.promise : null);
        };

        put(phoneA, DAY_ONE, 'p_01');
        await settleUntil(() => attempted(cloud) >= 1, 4000);
        put(phoneB, DAY_TWO, 'p_02');
        const bothOpen = await settleUntil(() => attempted(cloud) >= 2, 4000);
        given('both writes are open before either lands',
            bothOpen && landed(cloud) === 0,
            JSON.stringify({ attempted: attempted(cloud), landed: landed(cloud) }));

        if (firstWins) { gateA.release(); await settle(TICK * 8); gateB.release(); }
        else { gateB.release(); await settle(TICK * 8); gateA.release(); }

        await settleUntil(() => cloudPlace(cloud, DAY_ONE) === 'p_01'
            && cloudPlace(cloud, DAY_TWO) === 'p_02'
            && phoneA.Sync.pendingCount() === 0 && phoneB.Sync.pendingCount() === 0, 8000);
        await settle(TICK * 40);
        return { cloud, phoneA, phoneB };
    }

    const one = await race(true);
    const two = await race(false);

    same('both orders leave the same document',
        businessOf(one.cloud.doc), businessOf(two.cloud.doc));
    check('and both orders left both days in it',
        cloudPlace(one.cloud, DAY_ONE) === 'p_01'
        && cloudPlace(one.cloud, DAY_TWO) === 'p_02'
        && cloudPlace(two.cloud, DAY_ONE) === 'p_01'
        && cloudPlace(two.cloud, DAY_TWO) === 'p_02',
        JSON.stringify([cloudPlace(one.cloud, DAY_ONE), cloudPlace(one.cloud, DAY_TWO),
            cloudPlace(two.cloud, DAY_ONE), cloudPlace(two.cloud, DAY_TWO)]));
    check('with nothing owed on any of the four phones',
        one.phoneA.Sync.pendingCount() === 0 && one.phoneB.Sync.pendingCount() === 0
        && two.phoneA.Sync.pendingCount() === 0 && two.phoneB.Sync.pendingCount() === 0,
        JSON.stringify([one.phoneA.Sync.pendingCount(), one.phoneB.Sync.pendingCount(),
            two.phoneA.Sync.pendingCount(), two.phoneB.Sync.pendingCount()]));
    check('and nothing held as a contest in either order',
        heldIds(one.phoneA).length === 0 && heldIds(one.phoneB).length === 0
        && heldIds(two.phoneA).length === 0 && heldIds(two.phoneB).length === 0,
        JSON.stringify([heldIds(one.phoneB), heldIds(two.phoneA)]));
}

// ================================================================ R11
//
// The collection rule, stated three ways and asked of the bytes: an operation may only be
// collected when the cloud has ANSWERED it and the disk HOLDS it. Either half alone leaves
// something that cannot be rebuilt - a day that exists only in a cloud this device has no
// record of, or a day that exists only on a disk nobody has been told about.
//
// The half that is easy to get wrong is the second, and the way it goes wrong is a race:
// the other tab writes ITS schedule over the shared key while this one's operation is
// being answered, and the day is then in the cloud, acknowledged, and in no schedule on
// this disk at all.
{
    suite('R11: collected only when the cloud has answered and the disk holds it');

    // (a) the disk holds it, the cloud has not answered it.
    {
        const device = seed(makeDevice({ deviceId: 'd_a' }));
        put(device, DAY_ONE, 'p_01');
        const op = opsFor(device, DAY_ONE)[0];
        given('the day is on the disk and unanswered',
            Boolean(op) && diskPlace(device, DAY_ONE) === 'p_01'
            && ackedIds(device).length === 0);

        device.Sync.collectQueueGarbage();
        check('an unanswered operation is not collected, however saved it is',
            opsFor(device, DAY_ONE).length === 1, JSON.stringify(physicalOps(device)
                .map(o => o.path)));
    }

    // (b) the cloud has answered it, the disk does not hold it - because the other tab
    // saved its own older schedule over the shared record while the answer was arriving.
    {
        const shared = sharedStore();
        const tabA = makeDevice({ sharedStorage: shared, deviceId: 'd_a' });
        seed(tabA);
        const tabB = makeDevice({ sharedStorage: shared, deviceId: 'd_b' });
        tabB.State.load();

        put(tabA, DAY_ONE, 'p_01');
        const op = opsFor(tabA, DAY_ONE)[0];
        given('the day is queued', Boolean(op));
        given('the cloud has answered it',
            tabA.Sync.markAcknowledged([op.opId]) === true);

        // The other tab has been holding a schedule from before that edit, and saves.
        tabB.State.save({ silent: true });
        given('the disk no longer holds the day',
            diskPlace(tabB, DAY_ONE) === null, String(diskPlace(tabB, DAY_ONE)));

        tabA.Sync.collectQueueGarbage();
        check('an answered operation the disk does not hold is not collected',
            opsFor(tabA, DAY_ONE).length === 1
            && placeOf(opsFor(tabA, DAY_ONE)[0].value) === 'p_01',
            JSON.stringify(opsFor(tabA, DAY_ONE).map(o => placeOf(o.value))));

        const reopened = makeDevice({ storage: tabA.dump(), deviceId: 'd_a' });
        reopened.State.load();
        check('so a reopen can still put the day back on the record',
            screenPlace(reopened, DAY_ONE) === 'p_01',
            String(screenPlace(reopened, DAY_ONE)));
    }

    // (c) both, and only then.
    {
        const device = seed(makeDevice({ deviceId: 'd_a' }));
        put(device, DAY_ONE, 'p_01');
        const op = opsFor(device, DAY_ONE)[0];
        given('the day is queued and on the disk',
            Boolean(op) && diskPlace(device, DAY_ONE) === 'p_01');
        given('and the cloud has answered it',
            device.Sync.markAcknowledged([op.opId]) === true);

        const whole = device.Sync.collectQueueGarbage();
        check('an operation the cloud has answered and the disk holds is collected',
            opsFor(device, DAY_ONE).length === 0 && whole === true,
            JSON.stringify({ left: physicalOps(device).length, whole }));
        check('and its acknowledgement goes with it, leaving no orphan mark',
            ackedIds(device).length === 0, JSON.stringify(ackedIds(device)));
        check('while the day itself is still on the disk',
            diskPlace(device, DAY_ONE) === 'p_01', String(diskPlace(device, DAY_ONE)));
    }
}

// ================================================================ R12
//
// A batch record is written once and cannot be rewritten, so there is no such thing as
// half of it. Collecting a batch whose second operation is still owed would take the only
// record of that operation away with the first one - and the batch is exactly what a bulk
// edit is: copying a day across writes several paths in ONE record.
{
    suite('R12: a batch is collected whole or not at all');

    const device = seed(makeDevice({ deviceId: 'd_a' }));
    const changes = [
        device.call('assignPlace', device.State.schedule, '2026-08-10', 'w_01', 'actual', 'p_01'),
        device.call('assignPlace', device.State.schedule, '2026-08-11', 'w_02', 'actual', 'p_02')
    ];
    given('the bulk edit was committed', device.State.commitMany(changes) === true);

    const batchKeys = [...new Set(physicalOps(device).map(op => op.key))];
    given('both paths are in ONE batch record',
        batchKeys.length === 1 && physicalOps(device).length === 2,
        JSON.stringify({ keys: batchKeys.length, ops: physicalOps(device).length }));

    const first = opsFor(device, DAY_ONE)[0];
    const second = opsFor(device, DAY_TWO)[0];
    given('both can be named', Boolean(first) && Boolean(second));
    given('the disk holds both days',
        diskPlace(device, DAY_ONE) === 'p_01' && diskPlace(device, DAY_TWO) === 'p_02');

    given('the cloud answered one of the two',
        device.Sync.markAcknowledged([first.opId]) === true);
    const partial = device.Sync.collectQueueGarbage();
    check('a batch with one operation still owed is not collected',
        physicalOps(device).length === 2 && opsFor(device, DAY_TWO).length === 1,
        JSON.stringify(physicalOps(device).map(op => op.path)));
    check('and the answered half of it is not removed on its own either',
        opsFor(device, DAY_ONE).length === 1,
        JSON.stringify(opsFor(device, DAY_ONE).map(op => op.opId)));
    check('the pass says so rather than reporting the batch finished',
        partial === true && device.Sync.pendingCount() === 1,
        JSON.stringify({ partial, pending: device.Sync.pendingCount() }));

    given('and then the cloud answered the other',
        device.Sync.markAcknowledged([second.opId]) === true);
    device.Sync.collectQueueGarbage();
    check('a batch whose every operation is finished goes whole',
        physicalOps(device).length === 0, JSON.stringify(physicalOps(device)
            .map(op => op.path)));
    check('with no acknowledgement left behind it',
        ackedIds(device).length === 0, JSON.stringify(ackedIds(device)));
    check('and both days still on the disk',
        diskPlace(device, DAY_ONE) === 'p_01' && diskPlace(device, DAY_TWO) === 'p_02',
        JSON.stringify([diskPlace(device, DAY_ONE), diskPlace(device, DAY_TWO)]));
}

// ================================================================ R13
//
// The disk refuses the removal. localStorage does that - quietly, with nothing thrown -
// and the danger is not the bytes that stay: it is what they MEAN afterwards. A superseded
// value whose superseding record was removed becomes current again, goes to the cloud, and
// replaces the correction. So a refused prune has to leave the queue exactly as replayable
// as it was, and the value that lost has to stay lost.
{
    suite('R13: a refused prune, and a value that must stay lost');

    const shared = sharedStore();
    const tabA = makeDevice({ sharedStorage: shared, deviceId: 'd_a' });
    seed(tabA);
    const tabB = makeDevice({ sharedStorage: shared, deviceId: 'd_b' });
    tabB.State.load();

    put(tabA, DAY_ONE, 'p_01');
    // Every removal under the queue is refused from here on - which is what localStorage
    // does, quietly, with nothing thrown.
    tabA.blockRemoval(key => String(key).indexOf('farkad:outbox') === 0);
    put(tabB, DAY_ONE, 'p_02');

    const both = opsFor(tabA, DAY_ONE);
    given('both decisions are on the disk', both.length === 2,
        JSON.stringify(both.map(op => placeOf(op.value))));
    const beaten = both.find(op => placeOf(op.value) === 'p_01');
    const winner = both.find(op => placeOf(op.value) === 'p_02');
    given('the later one supersedes the earlier by name',
        Boolean(winner) && Boolean(beaten) && winner.after.indexOf(beaten.opId) !== -1,
        JSON.stringify(winner && winner.after));

    const whole = tabA.Sync.collectQueueGarbage();

    check('the pass does not report itself finished',
        whole === false, String(whole));
    check('the records are all still on the disk',
        opsFor(tabA, DAY_ONE).length === 2,
        JSON.stringify(opsFor(tabA, DAY_ONE).map(op => placeOf(op.value))));
    check('the queue is still replayable',
        Array.isArray(tabA.Sync.durableJournalEntries()),
        JSON.stringify(tabA.Sync.durableJournalEntries()
            && tabA.Sync.durableJournalEntries().map(([path]) => path)));

    const still = tabA.Sync.projectedQueue().get(DAY_ONE);
    check('and the value that lost has not become current again',
        placeOf(still && still.value) === 'p_02',
        String(placeOf(still && still.value)));

    const reopened = makeDevice({ storage: tabA.dump(), deviceId: 'd_a' });
    reopened.State.load();
    const afterOpen = reopened.Sync.projectedQueue().get(DAY_ONE);
    check('a reopen of these bytes reads the same winner',
        placeOf(afterOpen && afterOpen.value) === 'p_02',
        String(placeOf(afterOpen && afterOpen.value)));
    check('and rebuilds the day as the correction left it',
        screenPlace(reopened, DAY_ONE) === 'p_02',
        String(screenPlace(reopened, DAY_ONE)));

    // And the beaten value never leaves the phone, however many times the ladder comes
    // back - the two records are both still on that disk, which is the point.
    const cloud = makeCloud({ doc: baseDocument() });
    await connected(reopened, cloud);
    for (let round = 0; round < 4; round += 1) {
        reopened.Sync.flush();
        await settle(TICK * 12);
    }
    await settleUntil(() => cloudPlace(cloud, DAY_ONE) !== null, 5000);
    check('the correction is what reaches the cloud',
        cloudPlace(cloud, DAY_ONE) === 'p_02', String(cloudPlace(cloud, DAY_ONE)));
    const carried = cloud.writes
        .filter(write => write.patch && write.patch[DAY_ONE] !== undefined)
        .map(write => placeOf(write.patch[DAY_ONE]));
    check('and the beaten value was never in any write',
        carried.length > 0 && carried.every(place => place === 'p_02'),
        JSON.stringify(carried));
}

// ================================================================ R14
//
// The disk stops taking writes PARTWAY THROUGH the pass. Retirement is a write; so is the
// acknowledgement it clears. A pass that got halfway and answered true would tell State
// the journal was pruned, and the next thing to read that answer would act on a queue that
// is not in the state it was told about. Nothing may claim to be finished.
{
    suite('R14: storage refuses mid-prune, and nothing claims to be finished');

    const shared = sharedStore();
    const tabA = makeDevice({ sharedStorage: shared, deviceId: 'd_a' });
    seed(tabA);
    const tabB = makeDevice({ sharedStorage: shared, deviceId: 'd_b' });
    tabB.State.load();

    // Two tabs writing one path inside the window where neither can see the other's batch,
    // so neither names the other. That is what makes a RETIREMENT necessary: two genuinely
    // concurrent operations, one of which the projection beats by rule, and the fact that
    // it lost has to be written down before the winner may ever be collected.
    //
    // queueOperations reads the queue twice before it writes; the second read of a
    // warm-up batch key is the last read before that write, so the other tab records its
    // day THERE.
    function race(path, placeA, placeB) {
        put(tabA, DAY_THREE, 'p_00');
        const warmKey = Object.keys(shared)
            .filter(key => key.indexOf('farkad:outbox:op:') === 0)[0];
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

    // The disk refuses EVERY retirement while the races are run, so the collector that
    // State.save calls on the way past cannot quietly finish the work first. One quota
    // function, because the two tabs share one localStorage - which is the whole point of
    // this file.
    let taken = 0;
    tabA.setQuota((key) => {
        if (String(key).indexOf(':beat:') === -1) return false;
        taken += 1;
        return true;
    });

    given('the two tabs overlapped on the first day', race(DAY_ONE, 'p_01', 'p_02'));
    given('and on the second', race(DAY_TWO, 'p_01', 'p_02'));

    const contested = [DAY_ONE, DAY_TWO];
    given('each day has two operations, neither naming the other',
        contested.every(path => opsFor(tabA, path).length === 2
            && opsFor(tabA, path).every(op => op.after.length === 0)),
        JSON.stringify(contested.map(path => opsFor(tabA, path).map(op => op.after))));
    given('and nothing has been retired yet, because the disk refused',
        beatenIds(tabA).length === 0 && taken > 0,
        JSON.stringify({ beaten: beatenIds(tabA), attempts: taken }));

    given('the cloud answered everything',
        tabA.Sync.markAcknowledged(physicalOps(tabA).map(op => op.opId)) === true);

    const winners = contested.map(path => tabA.Sync.projectedQueue().get(path));
    given('each day has a winner', winners.every(Boolean));

    // Now the disk takes the FIRST retirement and refuses everything after it: the pass
    // stops halfway through its own first phase.
    let written = 0;
    tabA.setQuota((key) => {
        if (String(key).indexOf(':beat:') === -1) return false;
        written += 1;
        return written > 1;
    });

    const whole = tabA.Sync.collectQueueGarbage();
    given('the pass really was interrupted partway through', written > 1, String(written));

    check('the pass does not report itself finished',
        whole === false, String(whole));
    check('the retirement it could not write is not treated as written',
        beatenIds(tabA).length === 1, JSON.stringify(beatenIds(tabA)));
    check('nothing that is current for its day was retired',
        winners.every(op => beatenIds(tabA).indexOf(op.opId) === -1),
        JSON.stringify({ winners: winners.map(op => op.opId), beaten: beatenIds(tabA) }));
    check('nothing that is current for its day was collected',
        winners.every(op => physicalOps(tabA).some(live => live.opId === op.opId)),
        JSON.stringify(physicalOps(tabA).map(op => [op.path, placeOf(op.value)])));
    check('every day still reads as the same winner',
        contested.every((path, at) =>
            (tabA.Sync.projectedQueue().get(path) || {}).opId === winners[at].opId),
        JSON.stringify(contested.map(path =>
            placeOf((tabA.Sync.projectedQueue().get(path) || {}).value))));
    check('and the queue is still replayable',
        Array.isArray(tabA.Sync.durableJournalEntries()),
        String(Array.isArray(tabA.Sync.durableJournalEntries())));

    const reopened = makeDevice({ storage: tabA.dump(), deviceId: 'd_a' });
    reopened.State.load();
    check('a reopen of these bytes reads the same two winners',
        contested.every((path, at) =>
            (reopened.Sync.projectedQueue().get(path) || {}).opId === winners[at].opId),
        JSON.stringify(contested.map(path =>
            (reopened.Sync.projectedQueue().get(path) || {}).opId)));
    check('and rebuilds both days as those winners left them',
        contested.every((path, at) =>
            screenPlace(reopened, path) === placeOf(winners[at].value)),
        JSON.stringify(contested.map(path => screenPlace(reopened, path))));

    // And once the disk takes writes again the pass finishes, without ever having lied.
    tabA.setQuota(null);
    for (let round = 0; round < 4; round += 1) tabA.Sync.collectQueueGarbage();
    check('the pass finishes once the disk takes writes again',
        tabA.Sync.collectQueueGarbage() === true,
        JSON.stringify({ left: physicalOps(tabA).map(op => op.path),
            beaten: beatenIds(tabA).length }));
    check('and no beaten value was left current anywhere',
        contested.every((path, at) => {
            const live = tabA.Sync.projectedQueue().get(path);
            return live === undefined || live.opId === winners[at].opId;
        }),
        JSON.stringify(contested.map(path =>
            placeOf((tabA.Sync.projectedQueue().get(path) || {}).value))));
}

report();
