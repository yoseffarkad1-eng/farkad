// The client half of the ordering protocol.
//
//   node tests/cas.test.mjs
//
// firestore.rules now enforces the ordering: a protocol version on every write, a
// revision that goes up by exactly one, and an immutable receipt landing in the same
// commit. tests/rules.test.mjs proves that against the real rules on the emulator.
//
// This file asks the other half of the question: does the CLIENT speak it. The fake cloud
// in tests/harness.mjs models the same contract the rules enforce - so a client that does
// not carry the envelope is refused here for the same reason it would be refused by the
// server, and a client that carries a stale revision is told so rather than overwriting
// somebody's evening.
//
// What must hold, and what each check is for:
//
//   1. Every write the client sends carries protocol, revision and lastOpId.
//   2. Two phones that both read the same revision do not both win. The second is told
//      the document moved, and it does NOT overwrite, does not acknowledge, does not
//      prune its queue, and does not report itself synced.
//   3. Disjoint edits still merge - the second phone re-bases on what it was told and its
//      day lands beside the other one's, because that is the whole point of field paths.
//   4. A retry of a request that may still have landed is safe: the second attempt finds
//      its own receipt and succeeds without applying anything twice.
//   5. A whole-document restore is a write like any other and takes the same fence.

import { makeDevice, makeCloud, settle } from './harness.mjs';
import { suite, check, given, report } from './runner.mjs';

const TICK = 6;
const DAY = '2026-08-12';

function phone(cloud, id) {
    const device = makeDevice({ deviceId: id });
    device.Sync.pushDelayMs = TICK;
    device.setToday('2026-08-20');
    device.ctx.askTell = () => Promise.resolve();
    device.State.schedule.workers = [
        { id: 'w_01', name: 'דוד', active: true, dailyRate: 400, hourlyRate: 0 },
        { id: 'w_02', name: 'שרה', active: true, dailyRate: 350, hourlyRate: 0 }];
    device.State.schedule.places = [{ id: 'p_01', name: 'הרצליה', active: true }];
    device.State.save({ silent: true });
    if (cloud) device.Sync.connect(cloud.adapter);
    return device;
}

const record = (device, date, workerId) => device.State.commit(device.call('assignPlace',
    device.State.schedule, date, workerId, 'actual', 'p_01'));

// ============================================================ the envelope
{
    suite('every write the client sends carries the ordering envelope');

    const cloud = makeCloud();
    const a = phone(cloud, 'd_a');
    await settle(TICK * 10);
    record(a, DAY, 'w_01');
    await settle(TICK * 20);

    const accepted = cloud.writes.filter(write => !write.replayed);
    // Asked of what the client ATTEMPTED, not of what the server took. A client that
    // sends nothing the server will accept has zero accepted writes, and asserting over
    // an empty list is how a suite reports "all of them were fine" about a client that
    // cannot write at all.
    given('the client tried to write', cloud.attempts.length > 0,
        `${cloud.attempts.length} attempts, ${cloud.writes.length} accepted`);

    const envelopeOf = write => write.payload || write.patch || write.data || {};
    const tried = cloud.attempts.filter(attempt =>
        attempt.kind === 'update' || attempt.kind === 'save' || attempt.kind === 'create');
    check('every write the client sends names the protocol it speaks',
        tried.every(write => Number.isInteger(envelopeOf(write).protocol)),
        JSON.stringify(tried.map(write => envelopeOf(write).protocol)));
    check('and the revision it is claiming',
        tried.every(write => Number.isInteger(envelopeOf(write).revision)),
        JSON.stringify(tried.map(write => envelopeOf(write).revision)));
    check('and the operation it is applying',
        tried.every(write => typeof envelopeOf(write).lastOpId === 'string'
            && envelopeOf(write).lastOpId.length > 0),
        JSON.stringify(tried.map(write => envelopeOf(write).lastOpId)));
    check('the server accepted them, which is the point of speaking its protocol',
        accepted.length > 0,
        `${accepted.length} of ${tried.length} accepted`);
    check('the revisions go up by exactly one, in order',
        accepted.length > 0
        && accepted.every((write, at) => envelopeOf(write).revision === at + 1),
        JSON.stringify(accepted.map(write => envelopeOf(write).revision)));
    check('and the day reached the cloud',
        Boolean(cloud.doc && cloud.doc.days && cloud.doc.days[DAY]),
        JSON.stringify(cloud.doc ? Object.keys(cloud.doc.days || {}) : null));
}

// ============================================================ two phones, one revision
{
    suite('two phones that both read the same revision');

    const cloud = makeCloud();
    const a = phone(cloud, 'd_a');
    const b = phone(cloud, 'd_b');
    await settle(TICK * 10);

    // A writes and lands. B has not heard about it - its snapshot is held back - so B is
    // about to write against a revision that is no longer there.
    record(a, DAY, 'w_01');
    await settle(TICK * 20);
    const base = cloud.doc && cloud.doc.revision;
    check('the first phone landed a write the server accepted',
        Number.isInteger(base) && base >= 1, `revision ${base}`);

    record(b, '2026-08-13', 'w_02');
    await settle(TICK * 25);

    const days = (cloud.doc && cloud.doc.days) || {};
    check('the second phone did not overwrite the first phone\'s day',
        Boolean(days[DAY]), JSON.stringify(Object.keys(days)));
    check('and its own day is there too, because the paths are disjoint',
        Boolean(days['2026-08-13']), JSON.stringify(Object.keys(days)));
    check('the revision counts every accepted write and no more',
        Boolean(cloud.doc)
        && cloud.doc.revision === cloud.writes.filter(write => !write.replayed).length,
        `revision ${cloud.doc && cloud.doc.revision}, `
        + `accepted ${cloud.writes.filter(w => !w.replayed).length}`);
    check('and neither phone is left holding work it thinks was sent',
        a.Sync.pendingCount() === 0 && b.Sync.pendingCount() === 0,
        `A ${a.Sync.pendingCount()} pending, B ${b.Sync.pendingCount()} pending`);
}

// ============================================================ a request that may still land
{
    suite('a retry of a request that may still have landed');

    const cloud = makeCloud();
    const a = phone(cloud, 'd_a');
    await settle(TICK * 10);
    record(a, DAY, 'w_01');
    await settle(TICK * 20);

    const before = cloud.doc ? JSON.parse(JSON.stringify(cloud.doc)) : null;
    const sent = cloud.writes.filter(write => !write.replayed);
    const last = sent[sent.length - 1];
    check('there is a write to replay, which needs the client to have landed one',
        Boolean(last && (last.patch || last.data)), `${sent.length} accepted writes`);

    // The same operation, sent again - which is what a client does when it cannot tell
    // whether its request landed. It must not apply twice and must not be refused.
    let outcome = 'no answer';
    if (last) {
        await Promise.resolve(cloud.adapter.update(last.patch || last.data))
            .then(() => { outcome = 'accepted'; })
            .catch(error => { outcome = `${error.code || 'error'}: ${error.message}`; });
    } else {
        outcome = 'the client landed nothing to replay';
    }

    check('replaying an operation that already landed is answered as success',
        outcome === 'accepted', outcome);
    check('and the document is exactly what it was',
        before !== null && JSON.stringify(cloud.doc) === JSON.stringify(before),
        `revision ${cloud.doc && cloud.doc.revision} (was ${before && before.revision})`);
}

// ============================================================ a stale writer
{
    suite('a write built against a revision that has moved');

    const cloud = makeCloud();
    const a = phone(cloud, 'd_a');
    await settle(TICK * 10);
    record(a, DAY, 'w_01');
    await settle(TICK * 20);

    if (!cloud.doc) {
        check('a stale write is refused rather than applied', false,
            'the client landed nothing, so there is no revision to be stale against');
        check('and the document it would have overwritten is untouched', false,
            'there is no document');
    } else {
    const stale = {
        [`days.2026-08-14.actual.w_01`]: { entries: [{ placeId: 'p_01' }] },
        updatedAt: new Date().toISOString(),
        protocol: 1,
        revision: 1,
        lastOpId: 'op_stale'
    };
    const held = JSON.parse(JSON.stringify(cloud.doc));

    let refused = null;
    await Promise.resolve(cloud.adapter.update(stale))
        .then(() => { refused = null; })
        .catch(error => { refused = error; });

    check('a stale write is refused rather than applied',
        refused !== null && refused.code === 'conflict',
        refused ? `${refused.code}: ${refused.message}` : 'it was accepted');
    check('and the document it would have overwritten is untouched',
        JSON.stringify(cloud.doc) === JSON.stringify(held),
        `revision ${cloud.doc.revision}`);
    }
}

report();
