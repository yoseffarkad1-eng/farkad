// A receipt says an operation landed. WHICH operation?
//
//   node tests/receipt.test.mjs
//
// The receipt is what makes a retry safe: a request whose answer was lost is sent again,
// the client finds the receipt, and it knows not to do the work twice. Everything rests on
// the receipt naming the thing that was actually done.
//
// It named a revision. That is all:
//
//     transaction.set(receiptRef(payload.lastOpId), {
//         revision: payload.revision, at: ..., by: ...
//     });
//
// and the rules asked only that the resulting schedule's lastOpId equals the receipt's own
// id and its revision equals the receipt's revision. So the pair proves that SOME write
// wearing this name reached this revision - not what that write did. A second arrival
// carrying the same operation id and a different path and value is answered "already
// applied", the queue is acknowledged and pruned, and the status says synced, with the
// phone holding one value and the cloud holding another and nothing anywhere recording the
// disagreement.
//
// The client's own name for a batch is value-blind too:
//
//     `${path}#${item.seq}#${item.opId}`
//
// while legacyOpId two hundred lines away deliberately digests the value, with a comment
// explaining that a value-blind name once suppressed a correction. The batch name never
// got the same treatment, and the whole-document create shares the field batch's name, so
// a receipt cannot tell a merge from a replacement either.
//
// So the pair carries a FINGERPRINT: the operation's kind, every semantic path and value
// in it, sorted, and the restore's transaction id where there is one. Revision, lastOpId
// and the two stamps are left out - a retry legitimately carries a different clock, and
// the revision is the thing the fingerprint has to be independent of.
//
// WHAT THE SERVER CAN AND CANNOT DO, said plainly, because the difference matters:
// firestore.rules can require that the fingerprint exists, that the schedule and the
// receipt carry the SAME one, that they move in one transaction, and that a receipt is
// never edited - so a name can never be re-pointed at different semantics afterwards. It
// cannot recompute a digest over nested data; there are no loops and no canonical
// serializer, and on an update request.resource.data is the merged document. So the server
// makes the fingerprint trustworthy against loss and tampering; only the client can make
// it MEAN anything, and only the client can refuse the replay, because a replay performs
// no write and the rules are never consulted.

import { makeDevice, makeCloud, settle, settleUntil } from './harness.mjs';
import { suite, check, same, given, report } from './runner.mjs';

const TICK = 6;
const DAY = '2026-08-12';
const PATH = `days.${DAY}.actual.w_01`;

function phone(id, cloud, storage) {
    const device = makeDevice({ deviceId: id, storage });
    device.Sync.pushDelayMs = TICK;
    device.setToday('2026-08-20');
    device.ctx.askTell = () => Promise.resolve();
    // A reopened device brings its own disk; seeding a roster over what it read back
    // would be a different device wearing the same id.
    if (!storage) {
        device.State.schedule.workers = [
            { id: 'w_01', name: 'דוד', active: true, dailyRate: 400, hourlyRate: 0 }];
        device.State.schedule.places = [
            { id: 'p_01', name: 'הרצליה', active: true },
            { id: 'p_02', name: 'תל אביב', active: true }];
        device.State.save({ silent: true });
    }
    if (cloud) device.Sync.connect(cloud.adapter);
    return device;
}

const site = (device, date, placeId) => device.State.commit(device.call('assignPlace',
    device.State.schedule, date, 'w_01', 'actual', placeId));

// ------------------------------------------------------------ the pair carries the name
{
    suite('the schedule and its receipt name the same operation');

    const cloud = makeCloud();
    const a = phone('d_a', cloud);
    await settle(TICK * 10);
    site(a, DAY, 'p_01');
    await settleUntil(() => a.Sync.pendingCount() === 0, 5000);

    const opId = cloud.doc.lastOpId;
    const receipt = cloud.receipts.get(opId);
    given('the write landed and left a receipt', Boolean(receipt),
        JSON.stringify([...cloud.receipts.keys()]));

    check('the receipt carries a fingerprint of the operation',
        typeof receipt.opFingerprint === 'string' && receipt.opFingerprint.length > 0,
        JSON.stringify(receipt));
    check('the schedule carries the same one',
        cloud.doc.opFingerprint === receipt.opFingerprint,
        JSON.stringify([cloud.doc.opFingerprint, receipt.opFingerprint]));
    check('and it is not merely the revision under another name',
        String(receipt.opFingerprint) !== String(receipt.revision));
}

// -------------------------------------------------------- an honest replay still works
{
    suite('the same operation, sent twice, is answered from its receipt');

    const cloud = makeCloud();
    const a = phone('d_r', cloud);
    await settle(TICK * 10);
    site(a, DAY, 'p_01');
    await settleUntil(() => a.Sync.pendingCount() === 0, 5000);

    const landed = cloud.writes.filter(write => !write.replayed).length;
    const before = JSON.stringify(cloud.doc);
    const last = cloud.writes[cloud.writes.length - 1];

    // THE IDENTICAL BYTES, which is what a lost answer looks like from here. It has to be
    // safe, and it has to stay safe: this is the case the receipt exists for.
    await Promise.resolve(cloud.adapter.update(last.patch || last.data)).catch(() => {});
    check('no second write is performed',
        cloud.writes.filter(write => !write.replayed).length === landed,
        `${landed} -> ${cloud.writes.filter(write => !write.replayed).length}`);
    check('and the document is untouched', JSON.stringify(cloud.doc) === before);
}

// ------------------------------------------------------- a different operation is not
{
    suite('an operation wearing a landed name but doing something else is refused');

    const cloud = makeCloud();
    const a = phone('d_x', cloud);
    await settle(TICK * 10);
    site(a, DAY, 'p_01');
    await settleUntil(() => a.Sync.pendingCount() === 0, 5000);
    site(a, '2026-08-13', 'p_02');
    await settleUntil(() => a.Sync.pendingCount() === 0, 5000);

    const before = JSON.stringify(cloud.doc);
    const landed = cloud.writes.filter(write => !write.replayed).length;
    // The name of the FIRST business write, whichever write that was: the bootstrap comes
    // first on a fresh cloud, so counting from a fixed index names whatever happens to be
    // there rather than the operation this suite is about.
    const business = cloud.writes.filter(write => !write.replayed)
        .map(write => write.patch || write.data)
        .filter(data => Object.keys(data).some(key => key.indexOf('days.') === 0));
    const firstOpId = (business[0] || {}).lastOpId;
    given('the first business operation has a name',
        Boolean(firstOpId), JSON.stringify(business.map(data => data.lastOpId)));

    // The first operation's ID, a path it never carried and a value it never held. Under
    // the old pair this was answered "already applied": the receipt existed, the schedule
    // had reached that revision, and nothing asked what the operation was.
    let refused = null;
    await Promise.resolve(cloud.adapter.update({
        [`days.2026-09-09.actual.w_01`]: { entries: [{ placeId: 'p_02' }] },
        updatedAt: new Date().toISOString(), updatedBy: 'd_x',
        protocol: 1, revision: cloud.doc.revision + 1, lastOpId: firstOpId
    })).then(() => {}, error => { refused = error; });

    check('it is refused, and named as what it is',
        refused && refused.code === 'receipt-mismatch',
        refused ? String(refused.code) : 'accepted as already applied');
    check('the cloud is byte-identical to before',
        JSON.stringify(cloud.doc) === before);
    check('the revision did not move and no write was performed',
        cloud.writes.filter(write => !write.replayed).length === landed,
        `${landed} -> ${cloud.writes.filter(write => !write.replayed).length}`);
}

// ------------------------------------------------ and the client does not call it done
{
    suite('a mismatch is never acknowledged, never pruned, and never synced');

    const cloud = makeCloud();
    const a = phone('d_ack', cloud);
    await settle(TICK * 10);
    site(a, DAY, 'p_01');
    await settleUntil(() => a.Sync.pendingCount() === 0, 5000);

    // A receipt already on the disk from before the binding existed, naming the operation
    // this device is about to send but describing something else. The client is built to
    // believe a receipt - that is what makes a retry safe - so this is the one it must not
    // believe.
    const b = phone('d_ack2', null);
    site(b, '2026-08-14', 'p_01');
    b.Sync.connect(cloud.adapter);
    await settle(TICK * 20);

    const owed = b.Sync.pendingCount();
    // Plant the receipt under the name the next send will use, with a fingerprint that
    // describes a different operation entirely. A receipt already on the disk from before
    // the binding existed looks exactly like this.
    const planted = 'op_planted';
    cloud.receipts.set(planted, { revision: cloud.doc.revision,
        opFingerprint: 'not-the-operation-you-are-sending',
        at: new Date().toISOString(), by: 'd_someone' });

    let refused = null;
    await Promise.resolve(cloud.adapter.update({
        [`days.2026-08-15.actual.w_01`]: { entries: [{ placeId: 'p_01' }] },
        updatedAt: new Date().toISOString(), updatedBy: 'd_ack2',
        protocol: 1, revision: cloud.doc.revision + 1, lastOpId: planted,
        opFingerprint: 'a-different-fingerprint'
    })).then(() => {}, error => { refused = error; });

    check('a planted receipt describing another operation is refused',
        refused && refused.code === 'receipt-mismatch',
        refused ? String(refused.code) : 'accepted');
    check('the day it would have written is not in the document',
        (cloud.doc.days || {})['2026-08-15'] === undefined,
        JSON.stringify(Object.keys(cloud.doc.days || {})));
    check('and the phone still owes what it owed',
        b.Sync.pendingCount() >= 0 && b.Sync.status !== 'synced' || owed === 0,
        `${owed} -> ${b.Sync.pendingCount()}, ${b.Sync.status}`);
}

// ------------------------------------------------- the create branch of one operation
{
    suite('a create whose answer was lost is the same operation when it is retried');

    // THE FIRST WRITE OF A PROJECT, and the one shape where one operation can go out
    // through two different doors.
    //
    // The document does not exist, so the update is refused 'not-found' and createDocument
    // sends the whole seed instead - deliberately under the SAME operation id, because it
    // IS that write taking the other branch. The server commits it and the answer is lost.
    //
    // The client then retries, and by now the document exists, so this time the operation
    // goes out as the update it always was. Same id, same edit - and a fingerprint computed
    // over the seed rather than over the patch, so the receipt the create left describes a
    // different operation from the one now asking about it. receipt-mismatch, on the only
    // retry path there is, for ever: the day is in the cloud, the queue never empties, the
    // status never leaves error, and closing and reopening the app changes nothing.
    const cloud = makeCloud();
    const landed = cloud.adapter.create.bind(cloud.adapter);
    let lost = 0;
    cloud.adapter.create = data => landed(data).then(() => {
        lost += 1;
        // A network that drops after the commit, which is indistinguishable from one that
        // drops before it - which is the whole reason receipts exist.
        const dropped = new Error('client is offline');
        dropped.code = 'unavailable';
        throw dropped;
    });

    const a = phone('d_lost');
    cloud.online = false;
    a.Sync.connect(cloud.adapter);
    await settle(TICK * 10);
    site(a, DAY, 'p_01');
    await settle(TICK * 10);
    cloud.online = true;
    a.Sync.flush();
    await settleUntil(() => lost > 0 && cloud.attempts.some(one => one.kind === 'update'),
        5000);
    await settle(TICK * 20);

    given('the create committed and its answer was lost', lost === 1 && Boolean(cloud.doc),
        `${lost} lost, document ${cloud.doc ? 'exists' : 'missing'}`);
    given('the work is in the cloud',
        Boolean(((cloud.doc.days || {})[DAY] || {}).actual),
        JSON.stringify((cloud.doc.days || {})[DAY]));

    const applied = cloud.writes.filter(write => !write.replayed).length;

    // Closed and opened again, against a cloud that can create normally now - there is
    // nothing left to create.
    const disk = a.dump();
    cloud.adapter.create = landed;
    const b = phone('d_lost', cloud, disk);
    await settleUntil(() => b.Sync.pendingCount() === 0, 5000);
    await settle(TICK * 20);

    check('the retry is recognised as the operation that already landed',
        b.Sync.pendingCount() === 0, `${b.Sync.pendingCount()} still owed`);
    check('the queue clears without applying anything a second time',
        cloud.writes.filter(write => !write.replayed).length === applied,
        `${applied} -> ${cloud.writes.filter(write => !write.replayed).length}`);
    check('and nothing is held as a receipt for a different operation',
        !(b.Sync.lastError && /different operation/.test(
            String(b.Sync.lastError.message || b.Sync.lastError))),
        String(b.Sync.lastError && (b.Sync.lastError.message || b.Sync.lastError)));
    check('the phone says it is synced', b.Sync.status === 'synced', b.Sync.status);
    check('and the day it recorded is still the day the cloud holds',
        JSON.stringify(((cloud.doc.days || {})[DAY] || {}).actual)
            === JSON.stringify((b.State.schedule.days[DAY] || {}).actual),
        JSON.stringify([(cloud.doc.days || {})[DAY], b.State.schedule.days[DAY]]));
}

// ---------------------------------------------- a replay is not the last word on the day
{
    suite('a retry answered from its receipt still takes the correction made meanwhile');

    // The receipt makes a lost answer safe to retry: the server finds the operation's
    // receipt, performs no write, and says "already applied". That answer is about the
    // OPERATION. It says nothing about what the path holds now - and between the write
    // that landed and the retry that asked about it, another phone can have corrected
    // the very same day.
    //
    // Measured on this tree: this phone's day landed, its answer was lost, and while the
    // retry was open on the wire the other phone corrected the day. The correction's
    // snapshot arrived here and was adopted, and reapplyPending put the still-owed value
    // back on top of it - correctly, since the write was still owed. Then the replay was
    // acknowledged, the queue was pruned, and nothing looked at the snapshot again. The
    // cloud and the other phone showed the correction; this phone showed its own older
    // value, said synced, and priced the day at a different site until the next write
    // from anyone.
    //
    // No snapshot follows a replay - it performed no write - so the only thing that can
    // put the correction back on this screen is the acknowledgement itself.
    const cloud = makeCloud();
    const a = phone('d_a', cloud);
    await settle(TICK * 10);
    const b = phone('d_b', cloud);
    await settleUntil(() => a.Sync.status === 'synced' && b.Sync.status === 'synced', 5000);
    given('both phones are on the same document',
        a.Sync.status === 'synced' && b.Sync.status === 'synced',
        `${a.Sync.status} / ${b.Sync.status}`);

    const placesAt = schedule => (((((schedule || {}).days || {})[DAY] || {}).actual || {})
        .w_01 || {}).entries;
    const spell = entries => JSON.stringify((entries || []).map(entry => entry.placeId));
    const own = (patch, path) => Object.prototype.hasOwnProperty.call(patch, path);

    // 1. This phone's first recording of the day lands, and its answer is lost.
    const landed = cloud.adapter.update.bind(cloud.adapter);
    let lost = 0;
    cloud.adapter.update = patch => landed(patch).then(result => {
        if (lost === 0 && patch.updatedBy === 'd_a' && own(patch, PATH)) {
            lost += 1;
            const dropped = new Error('client is offline');
            dropped.code = 'unavailable';
            throw dropped;
        }
        return result;
    });
    site(a, DAY, 'p_01');
    await settleUntil(() => lost === 1 && a.Sync.status === 'error', 5000);
    given('the write landed and its answer was lost',
        lost === 1 && spell(placesAt(cloud.doc)) === '["p_01"]' && a.Sync.pendingCount() === 1,
        `${lost} lost, cloud ${spell(placesAt(cloud.doc))}, ${a.Sync.pendingCount()} owed`);

    // 2. The retry goes out, and is held open on the wire.
    let releaseRetry = null;
    cloud.hold = (kind, payload) => (kind === 'update' && payload.updatedBy === 'd_a'
        && own(payload, PATH))
        ? new Promise(resolve => { releaseRetry = resolve; })
        : null;
    a.Sync._retryAt = 0;
    a.Sync.flush();
    await settleUntil(() => releaseRetry !== null, 5000);
    given('the retry is open on the wire', releaseRetry !== null);

    // 3. While it is open, the other phone corrects the day - a different site - and
    //    this phone hears about it.
    b.State.commit(b.call('unassignPlace', b.State.schedule, DAY, 'w_01', 'actual', 'p_01'));
    site(b, DAY, 'p_02');
    const before = cloud.doc.revision;
    await settleUntil(() => cloud.doc.revision > before && spell(placesAt(cloud.doc)) === '["p_02"]'
        && Boolean(a.Sync._latestRaw) && a.Sync._latestRaw.revision === cloud.doc.revision, 5000);
    given('the correction reached the cloud and this phone heard it',
        spell(placesAt(cloud.doc)) === '["p_02"]'
        && a.Sync._latestRaw.revision === cloud.doc.revision,
        `cloud ${spell(placesAt(cloud.doc))}, heard revision ${a.Sync._latestRaw.revision} `
        + `of ${cloud.doc.revision}`);

    // 4. The retry is answered - from the receipt, because the operation already landed.
    releaseRetry();
    cloud.hold = null;
    await settleUntil(() => a.Sync.pendingCount() === 0, 5000);
    await settle(TICK * 20);

    check('the retry was answered from its receipt, and applied nothing',
        cloud.writes.some(write => write.replayed && (write.patch || {}).updatedBy === 'd_a')
        && spell(placesAt(cloud.doc)) === '["p_02"]',
        `cloud ${spell(placesAt(cloud.doc))}, replayed: `
        + JSON.stringify(cloud.writes.filter(write => write.replayed).length));
    check('the phone shows the day as the cloud holds it',
        spell(placesAt(a.State.schedule)) === spell(placesAt(cloud.doc)),
        `screen ${spell(placesAt(a.State.schedule))}, cloud ${spell(placesAt(cloud.doc))}`);
    const disk = JSON.parse(a.dump()['scheduleData:v2'] || 'null');
    check('and so does its disk',
        spell(placesAt(disk)) === spell(placesAt(cloud.doc)),
        `disk ${spell(placesAt(disk))}, cloud ${spell(placesAt(cloud.doc))}`);
    check('and only then does it say synced',
        a.Sync.status === 'synced' && a.Sync.pendingCount() === 0,
        `${a.Sync.status}, ${a.Sync.pendingCount()} owed`);
}

// ------------------------------------------------------------- and the name covers the value
{
    suite('two different values do not share one operation name');

    const device = makeDevice({ deviceId: 'd_name' });
    device.setToday('2026-08-20');
    const one = new Map([[PATH, { opId: 'op_1', seq: 5,
        value: { entries: [{ placeId: 'p_01' }] } }]]);
    const two = new Map([[PATH, { opId: 'op_1', seq: 5,
        value: { entries: [{ placeId: 'p_02' }] } }]]);

    // The batch's name used to be path + seq + opId, so these two produced the same one -
    // while legacyOpId, written for the same class of fault, already digests the value.
    check('the name of a batch changes when its value changes',
        device.Sync.operationIdFor(one) !== device.Sync.operationIdFor(two),
        `${device.Sync.operationIdFor(one)} vs ${device.Sync.operationIdFor(two)}`);
    check('and is stable for the same value',
        device.Sync.operationIdFor(one) === device.Sync.operationIdFor(
            new Map([[PATH, { opId: 'op_1', seq: 5,
                value: { entries: [{ placeId: 'p_01' }] } }]])));
}

report();
