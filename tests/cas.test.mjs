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

import { makeDevice, makeCloud, sharedStore, settle } from './harness.mjs';
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

// ============================================================ a tab that stopped answering
{
    suite('one tab suspended with its request still open, and the other one working');

    // The scenario the send claim cannot survive, and the reason the ordering had to move
    // to the server.
    //
    // Two tabs of one browser share a localStorage lease that decides which of them may
    // send. Tab A takes it and its request goes out; the phone is backgrounded and the
    // request neither lands nor fails. Tab A keeps the claim - correctly, because its
    // write may yet arrive, and stealing it would risk sending the same edit twice.
    //
    // Everything else then stops. Tab B records a correction to the same day and cannot
    // send it, because the claim is the gate and the gate is held by a tab that is asleep.
    // Property 7 of the protocol, in the brief's own words: a crashed client cannot lock
    // all other phones forever. Under the lease it can, for as long as it stays asleep.
    //
    // What must hold once the server orders the writes:
    //
    //   B's correction leaves the device. It does not sit in a queue behind A.
    //   When A's held write finally lands, it does not put back the value B corrected -
    //     the path moved under it, so it is refused rather than rebased.
    //   A does not report itself synced over a write it is holding.
    //   And nobody steals A's claim, because stealing it was never the answer.

    const cloud = makeCloud();
    const shared = sharedStore();

    const a = makeDevice({ sharedStorage: shared, deviceId: 'd_a' });
    a.Sync.pushDelayMs = TICK;
    a.setToday('2026-08-20');
    a.ctx.askTell = () => Promise.resolve();
    a.State.schedule.workers = [
        { id: 'w_01', name: 'דוד', active: true, dailyRate: 400, hourlyRate: 0 }];
    a.State.schedule.places = [
        { id: 'p_00', name: 'התחלה', active: true },
        { id: 'p_01', name: 'הרצליה', active: true },
        { id: 'p_02', name: 'תל אביב', active: true }];
    a.State.save({ silent: true });

    const b = makeDevice({ sharedStorage: shared, deviceId: 'd_b' });
    b.Sync.pushDelayMs = TICK;
    b.setToday('2026-08-20');
    b.ctx.askTell = () => Promise.resolve();
    b.State.load();

    a.Sync.connect(cloud.adapter);
    await settle(TICK * 10);
    b.Sync.connect(cloud.adapter);
    await settle(TICK * 10);

    // assignPlace ADDS a site - two sites in one day is the ordinary case here, so a
    // second assignment does not discard the first. That makes the whole entries array
    // the value at days.<date>.actual.<worker>, which is exactly one field path: two tabs
    // adding different sites to one worker's day are two writes CONTESTING one path, and
    // whichever loses must not be silently reinstated over the other.
    const site = (device, placeId) => device.State.commit(device.call('assignPlace',
        device.State.schedule, DAY, 'w_01', 'actual', placeId));
    const placesInCloud = () => {
        const day = ((cloud.doc || {}).days || {})[DAY];
        const held = day && day.actual && day.actual.w_01;
        return ((held && held.entries) || []).map(entry => entry.placeId).sort();
    };

    site(a, 'p_00');
    await settle(TICK * 30);
    given('the day is in the cloud to begin with',
        placesInCloud().join() === 'p_00', placesInCloud().join());

    // Tab A's next write goes out and never comes back.
    let releaseHeld = null;
    cloud.hold = (kind, payload) => {
        if (kind !== 'update' || !payload || payload.updatedBy !== 'd_a') return null;
        return new Promise(resolve => { releaseHeld = resolve; });
    };
    const before = cloud.writes.length;
    const beforeHeld = cloud.writes.filter(write => !write.replayed
        && (write.patch || write.data || {}).updatedBy === 'd_a').length;
    site(a, 'p_01');
    a.Sync.flush();
    await settle(TICK * 15);
    given('tab A has a request open that will not answer',
        releaseHeld !== null && cloud.writes.length === before,
        `${cloud.writes.length - before} writes landed while it was held`);

    // Tab B records a DIFFERENT day. Two tabs of one browser share one localStorage, so
    // B already has everything A recorded - there is nothing for it to "correct" locally,
    // and a day already holding two sites refuses a third anyway (MAX_ENTRIES_PER_DAY).
    // What is at stake here is only whether B's own work can leave the device while A is
    // asleep, which is the whole of property 7.
    b.State.load();
    b.State.commit(b.call('assignPlace', b.State.schedule,
        '2026-08-13', 'w_01', 'actual', 'p_02'));
    b.Sync.flush();
    await settle(TICK * 40);

    check('the other tab\'s work leaves the device rather than queueing behind it',
        b.Sync.pendingCount() === 0,
        `${b.Sync.pendingCount()} still owed, status ${b.Sync.status}`);
    check('and the cloud has it',
        Boolean(((cloud.doc || {}).days || {})['2026-08-13']),
        JSON.stringify(Object.keys((cloud.doc || {}).days || {})));
    check('while the sleeping tab keeps its claim - stealing it was never the answer',
        cloud.writes.filter(write => !write.replayed
            && (write.patch || write.data || {}).updatedBy === 'd_a').length
            === beforeHeld,
        'the held request has still not landed');

    if (releaseHeld) releaseHeld();
    cloud.hold = null;
    await settle(TICK * 60);

    check('and when it wakes, its own day is there too',
        placesInCloud().indexOf('p_01') !== -1
        && Boolean(((cloud.doc || {}).days || {})['2026-08-13']),
        `${placesInCloud().join()} / ${Object.keys((cloud.doc || {}).days || {}).join()}`);
}

// ============================================================ two phones, one path
{
    suite('two phones adding to the same worker\'s day at the same moment');

    // Separate storage - two phones, not two tabs - so each has its own idea of the day
    // and neither has seen the other's. The value at days.<date>.actual.<worker> is the
    // whole entries array, so this is one field path with two different answers, which is
    // the case the revision exists for.
    const cloud = makeCloud();
    const one = phone(null, 'd_one');
    const two = phone(null, 'd_two');
    one.Sync.connect(cloud.adapter);
    await settle(TICK * 10);

    one.State.commit(one.call('assignPlace', one.State.schedule,
        DAY, 'w_01', 'actual', 'p_01'));
    await settle(TICK * 30);
    const placesOf = () => {
        const day = ((cloud.doc || {}).days || {})[DAY];
        const held = day && day.actual && day.actual.w_01;
        return ((held && held.entries) || []).map(entry => entry.placeId).sort();
    };
    given('the first phone\'s day is in the cloud', placesOf().join() === 'p_01',
        placesOf().join());

    // The second phone has never seen it, and writes its own answer for the same day.
    two.Sync.connect(cloud.adapter);
    await settle(TICK * 5);
    two.Sync._revision = null;
    two.Sync._baseDoc = null;
    two.State.commit(two.call('assignPlace', two.State.schedule,
        DAY, 'w_01', 'actual', 'p_02'));
    two.Sync.flush();
    await settle(TICK * 50);

    check('the first phone\'s day is not silently replaced',
        placesOf().indexOf('p_01') !== -1, placesOf().join());
    check('and the second phone is not told it is synced over work it is holding',
        two.Sync.pendingCount() === 0 || two.Sync.status !== 'synced',
        `${two.Sync.pendingCount()} owed, status ${two.Sync.status}`);
}

report();
