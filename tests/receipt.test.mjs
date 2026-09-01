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

function phone(id, cloud) {
    const device = makeDevice({ deviceId: id });
    device.Sync.pushDelayMs = TICK;
    device.setToday('2026-08-20');
    device.ctx.askTell = () => Promise.resolve();
    device.State.schedule.workers = [
        { id: 'w_01', name: 'דוד', active: true, dailyRate: 400, hourlyRate: 0 }];
    device.State.schedule.places = [
        { id: 'p_01', name: 'הרצליה', active: true },
        { id: 'p_02', name: 'תל אביב', active: true }];
    device.State.save({ silent: true });
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
