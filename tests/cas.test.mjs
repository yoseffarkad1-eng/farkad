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

import { makeDevice, makeCloud, sharedStore, settle, settleUntil } from './harness.mjs';
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

    // AND IT IS TOLD WHICH SILENCE THIS IS.
    //
    // A held path is not a failure - the server is doing exactly what it was built to do,
    // refusing to let an older write put back a value somebody else corrected - and the
    // edit is safe on this disk. It reported as 'error', the same line a tunnel produces,
    // so the one situation a person can actually resolve looked like the one they cannot.
    check('the second phone says the record moved, not that something went wrong',
        two.Sync.status === 'contested', two.Sync.status);

    two.ctx.document.getElementById = id => (id === 'storageNotice'
        ? two.__notice : null);
    two.__notice = { textContent: '' };
    two.call('updateSyncNotice');
    check('in words that say what happened, that nothing was lost, and what to do',
        two.__notice.textContent.indexOf('הנתונים השתנו במכשיר אחר') !== -1
        && two.__notice.textContent.indexOf('לא אבדה') !== -1
        && two.__notice.textContent.indexOf('רענן') !== -1,
        JSON.stringify(two.__notice.textContent));
    check('and never the line a tunnel produces',
        two.__notice.textContent.indexOf('שגיאת סנכרון') === -1,
        JSON.stringify(two.__notice.textContent));
}

// ============================================================ the claim moving is harmless
{
    suite('a held write replayed after the claim moved to another tab');

    // Why the send claim moving is no longer a correctness question.
    //
    // The old rule was that a tab suspended with its request still open keeps the claim,
    // because the request may yet land and another tab taking over could send the same
    // edit twice. That reasoning was sound while the server had no memory: two arrivals of
    // one edit were two writes, and the second one applied.
    //
    // The receipt is that memory. An operation is named by its own contents, the name is
    // written in the same transaction as the revision it produced, and the name is
    // immutable - so a second arrival finds it and stops. Whether the claim moved, whether
    // the tab that made the edit is still awake, and whether the request landed the first
    // time all stop mattering. What is left is the guarantee: the edit applies once.
    //
    // tests/sendclaim.test.mjs T7 and T8 ask this as "a suspended owner does not lose the
    // claim". That was the closest thing to the guarantee available before, and it was
    // already failing at the commit before this protocol existed. This is the guarantee
    // itself.

    const cloud = makeCloud();
    const a = phone(cloud, 'd_a');
    await settle(TICK * 10);

    a.State.commit(a.call('assignPlace', a.State.schedule, DAY, 'w_01', 'actual', 'p_01'));
    await settle(TICK * 30);

    const landed = cloud.writes.filter(write => !write.replayed);
    const last = landed[landed.length - 1];
    given('an edit landed, with its operation named',
        Boolean(last) && typeof (last.patch || last.data || {}).lastOpId === 'string',
        JSON.stringify(landed.map(write => (write.patch || write.data || {}).lastOpId)));

    const before = JSON.parse(JSON.stringify(cloud.doc));
    const acceptedBefore = cloud.writes.filter(write => !write.replayed).length;

    // The same request, arriving again - a retry, a socket that recovered, a tab that woke
    // up and finished what it started. Sent three times over, which is more than any real
    // sequence produces.
    let refusals = 0;
    for (let attempt = 0; attempt < 3; attempt += 1) {
        await Promise.resolve(cloud.adapter.update(last.patch || last.data))
            .catch(() => { refusals += 1; });
    }

    check('a replay is not refused - the operation already succeeded',
        refusals === 0, `${refusals} of 3 refused`);
    check('and it applies nothing: the document is what it was',
        JSON.stringify(cloud.doc) === JSON.stringify(before),
        `revision ${cloud.doc.revision} (was ${before.revision})`);
    check('the revision did not move for a write that had already been counted',
        cloud.doc.revision === before.revision,
        `${before.revision} -> ${cloud.doc.revision}`);
    check('and no second write was recorded against it',
        cloud.writes.filter(write => !write.replayed).length === acceptedBefore,
        `${cloud.writes.filter(write => !write.replayed).length} accepted, was ${acceptedBefore}`);
}

// ============================================================ a claim nobody can use
{
    suite('a send claim that is damaged, in every way it can be');

    // What the claim record's own robustness was ever FOR.
    //
    // tests/sendclaim.test.mjs T3 to T6 ask whether a damaged claim is repaired, cleared,
    // quarantined, or eventually released: a claim dated ten years in the future, one
    // whose JSON is truncated, one whose quarantine copy the disk refuses, one whose
    // heartbeat comes back as something else. Every one of those questions exists because
    // the claim was a GATE - if the record could not be used and could not be cleared,
    // no tab could send, and the app went quiet with an evening's work on the disk.
    //
    // It is not a gate any more. So the question is no longer "is the record repaired"
    // but the thing that was always underneath it: can the person's work still leave the
    // phone. That is asked here, of every damaged shape at once, and it is a stronger
    // claim than any of the four it replaces - none of them asserted that an edit
    // actually reached the cloud.
    const SHAPES = [
        ['a claim dated ten years from now',
            () => JSON.stringify({ by: 'd_other', token: 'tok', at: Date.now() + 3.15e11,
                beat: Date.now() + 3.15e11 })],
        ['a claim whose JSON stops halfway', () => '{"by":"d_other","token":"tok'],
        ['a claim that is not JSON at all', () => 'not a record'],
        ['a claim that is an empty string', () => ''],
        ['a claim holding a null', () => 'null'],
        ['a claim holding an array', () => '[]']
    ];

    for (const [label, make] of SHAPES) {
        const cloud = makeCloud();
        const device = phone(cloud, 'd_hurt');
        await settle(TICK * 10);
        // Something already in the cloud, so the document exists and the next edit is an
        // ordinary update rather than the first write.
        device.State.commit(device.call('assignPlace', device.State.schedule,
            '2026-08-01', 'w_01', 'actual', 'p_01'));
        await settle(TICK * 25);

        // Built ONCE. The future-dated shape stamps Date.now() into the record, so
        // calling make() again to compare against later builds a different string and
        // fails a check about the export over a clock, not over the export.
        const bytes = make();
        device.putRaw('farkad:sendClaim', bytes);
        device.Store.forget('farkad:sendClaim');

        device.State.commit(device.call('assignPlace', device.State.schedule,
            DAY, 'w_01', 'actual', 'p_01'));
        device.Sync.flush();
        await settle(TICK * 40);

        check(`${label}: the day still reaches the cloud`,
            Boolean(((cloud.doc || {}).days || {})[DAY]),
            `days ${JSON.stringify(Object.keys((cloud.doc || {}).days || {}))}, `
            + `${device.Sync.pendingCount()} owed, status ${device.Sync.status}`);
        check(`${label}: and nothing is left owed`,
            device.Sync.pendingCount() === 0,
            `${device.Sync.pendingCount()} owed, status ${device.Sync.status}`);

        // AND THE BYTES ARE STILL SOMEWHERE A PERSON CAN GET AT THEM.
        //
        // Not blocking on the damage is only half of iron law 10. The other half is that
        // nothing unreadable is quietly lost - and the rescue file is where an unreadable
        // record is supposed to end up, because it is the only route off the phone.
        //
        // The claim is quarantined under a :damaged suffix and the export sweeps those by
        // allowlist, so the copy is carried. When the copy CANNOT be made - a disk with no
        // room left, which is exactly the state that produces half-written records in the
        // first place - the original is all there is, and it was in the export under no
        // name at all.
        const rescue = device.global('Recovery').rawRecords();
        check(`${label}: the unreadable bytes are in the rescue file`,
            Object.keys(rescue).some(key => rescue[key] === bytes),
            `keys ${JSON.stringify(Object.keys(rescue).filter(k => k.includes('sendClaim')))}`);
    }
}

// ===================================================== what the damage is reported AS
{
    suite('a damaged claim is described the way it actually is');

    // Two sentences the app says about a damaged claim, both of which stopped being true
    // when the claim stopped being a gate.
    //
    // The first is on the screen. 'claimstuck' reads "השליחה תקועה - סגור את שאר החלונות":
    // sending is stuck, close your other windows. It was accurate while the damage held
    // the device back. It is not accurate now - the write goes out, the server orders it,
    // the day lands - and it asks somebody standing on a building site to go and close
    // windows on two other phones to fix something that is not broken.
    //
    // The second is the diagnosis behind it. quarantineSendClaim() returns nothing on
    // every path, so `kept` is always undefined and the reason recorded is always "cannot
    // be read OR COPIED" - including when the copy was made and verified. A record that
    // says the bytes were not preserved, when they were, is the same class of untruth as
    // a green tick over a failed save.
    const cloud = makeCloud();
    const device = phone(cloud, 'd_told');
    await settle(TICK * 10);

    // One edit per round, because a flush with an empty queue never asks for the claim
    // and so never sees the damage.
    const DAYS = ['2026-08-03', '2026-08-04', '2026-08-05', '2026-08-06',
        '2026-08-07', '2026-08-10', '2026-08-11'];
    for (const day of DAYS) {
        device.putRaw('farkad:sendClaim', 'not a record');
        device.Store.forget('farkad:sendClaim');
        device.State.commit(device.call('assignPlace', device.State.schedule,
            day, 'w_01', 'actual', 'p_01'));
        device.Sync.flush();
        await settle(TICK * 25);
    }

    given('the damage was seen often enough for the app to speak',
        (device.Sync._claimDamage || 0) >= 5, String(device.Sync._claimDamage));
    given('and every day went to the cloud anyway',
        DAYS.every(day => Boolean(((cloud.doc || {}).days || {})[day])),
        JSON.stringify(Object.keys((cloud.doc || {}).days || {})));

    check('the person is not told to close windows over a send that is working',
        device.Sync.status !== 'claimstuck',
        `status ${device.Sync.status}, reason ${(device.Sync.lastError || {}).message || '-'}`);

    // The copy succeeded here - the disk is fine - so a reason naming a failed copy is
    // simply wrong about what is on the device.
    //
    // Asked of quarantineSendClaim directly rather than through the status line, because
    // the status line does not hold still: a send that succeeds a moment later sets
    // 'synced' and clears lastError, so reading the reason off the device tests the
    // ordering of two timers. The answer this function gives is what claimIsFree branches
    // on, and it is the thing that is wrong.
    given('the quarantine copy was in fact made',
        device.dump()['farkad:sendClaim:damaged'] !== undefined,
        JSON.stringify(Object.keys(device.dump()).filter(k => k.includes('sendClaim'))));
    check('and quarantining the bytes reports that it kept them',
        device.Sync.quarantineSendClaim() === true,
        String(device.Sync.quarantineSendClaim()));
}

// ============================================ the copy that could not be made at all
{
    suite('unreadable claim bytes on a disk with no room for the copy');

    // The case the export was actually missing. A half-written record and a full disk are
    // the same event seen twice: the write that ran out of room is what left the record
    // half written. So the shape where quarantine FAILS is not exotic - it is the likely
    // one - and there the original under farkad:sendClaim is the only copy of those bytes
    // in existence.
    //
    // The rescue file walks quarantine keys by allowlist and a handful of named records.
    // farkad:sendClaim was in neither list, so on the disk where the copy could not be
    // made, the bytes reached nothing: not the screen, not the export, nowhere.
    const cloud = makeCloud();
    const device = phone(cloud, 'd_nocopy');
    await settle(TICK * 10);
    device.State.commit(device.call('assignPlace', device.State.schedule,
        '2026-08-01', 'w_01', 'actual', 'p_01'));
    await settle(TICK * 25);

    const BYTES = '{"by":"d_other","token":"tok';
    device.putRaw('farkad:sendClaim', BYTES);
    device.Store.forget('farkad:sendClaim');
    // Room for everything except the quarantine copy.
    device.setQuota(key => key === 'farkad:sendClaim:damaged');

    device.State.commit(device.call('assignPlace', device.State.schedule,
        DAY, 'w_01', 'actual', 'p_01'));
    device.Sync.flush();
    await settle(TICK * 40);

    given('the copy really could not be made',
        device.dump()['farkad:sendClaim:damaged'] === undefined,
        JSON.stringify(Object.keys(device.dump()).filter(k => k.includes('sendClaim'))));
    given('and the original was not written over',
        device.dump()['farkad:sendClaim'] === BYTES,
        JSON.stringify(device.dump()['farkad:sendClaim']));

    check('the day still reaches the cloud',
        Boolean(((cloud.doc || {}).days || {})[DAY]),
        `days ${JSON.stringify(Object.keys((cloud.doc || {}).days || {}))}, `
        + `${device.Sync.pendingCount()} owed`);

    const rescue = device.global('Recovery').rawRecords();
    check('and the only copy of the bytes leaves the phone in the rescue file',
        Object.keys(rescue).some(key => rescue[key] === BYTES),
        `keys ${JSON.stringify(Object.keys(rescue).filter(k => k.includes('sendClaim')))}`);
}

// ============================================================ a restore under the fence
{
    suite('a whole-document restore built on a revision that has moved');

    // A restore replaces the whole document for all three phones at once, so it is the
    // write where being wrong costs the most. It used to be guarded by the send claim -
    // "do not hand it over if the claim moved" - which is a guess about another tab made
    // from a record on this device's disk, and which stopped the restore even when nothing
    // had actually changed underneath it.
    //
    // It takes the same fence as every other write now: a revision, an operation id, and a
    // receipt. tests/sendclaim.test.mjs T9 asked whether the hand-over is refused; this
    // asks the thing that matters, which is whether a restore built on a stale base can
    // replace work that arrived after it was prepared.
    const cloud = makeCloud();
    const one = phone(cloud, 'd_one');
    await settle(TICK * 10);
    one.State.commit(one.call('assignPlace', one.State.schedule,
        DAY, 'w_01', 'actual', 'p_01'));
    await settle(TICK * 30);
    given('the document exists with a day in it',
        Boolean(((cloud.doc || {}).days || {})[DAY]),
        JSON.stringify(Object.keys((cloud.doc || {}).days || {})));

    // Another phone records a different day. The restoring device has not seen it.
    const two = phone(cloud, 'd_two');
    await settle(TICK * 10);
    two.State.commit(two.call('assignPlace', two.State.schedule,
        '2026-08-14', 'w_01', 'actual', 'p_01'));
    await settle(TICK * 30);
    const revisionNow = (cloud.doc || {}).revision;
    given('the other phone\'s day is in the cloud too',
        Boolean(((cloud.doc || {}).days || {})['2026-08-14']),
        JSON.stringify(Object.keys((cloud.doc || {}).days || {})));

    // The restoring device is put back to the base it had BEFORE that arrived, which is
    // what a restore prepared a moment earlier is built on.
    one.Sync._revision = revisionNow - 1;
    const restored = JSON.parse(JSON.stringify(one.State.schedule));
    delete restored.days['2026-08-14'];

    const answer = await one.Sync.replaceEverything(restored).then(
        value => ({ ok: true, value }),
        error => ({ ok: false, error: String(error && error.message) }));
    await settle(TICK * 50);

    check('a restore built on a stale revision does not replace the newer document',
        Boolean(((cloud.doc || {}).days || {})['2026-08-14'])
        || (answer.value && answer.value.ok === false),
        `cloud days ${JSON.stringify(Object.keys((cloud.doc || {}).days || {}))}, `
        + `answer ${JSON.stringify(answer)}`);
    check('and the device is not told the restore is done when it is not',
        answer.ok === false
        || !answer.value
        || answer.value.ok === false
        || Boolean(((cloud.doc || {}).days || {})['2026-08-14']) === false,
        JSON.stringify(answer));
}


// ============================================================ the rebase ceiling
{
    suite('a document that moves under every attempt is held, not chased forever');

    // Rebasing is what keeps two people filling in one evening from blocking each other:
    // the second write is refused for a stale base, nothing it touches has moved, so it
    // is rebuilt against the new revision and sent again. It is also the shape of an
    // infinite loop - a server that always answers "moved" against a client that always
    // rebuilds - and the only thing between those two readings is a bound.
    //
    // CAS_REBASE_LIMIT is that bound, and until this suite nothing measured it. A device
    // that cannot get a word in after several tries has to say so rather than spin: a
    // phone burning its battery on a write it will never land is a phone whose owner is
    // told nothing while the evening's work sits in a queue.
    const cloud = makeCloud();
    const a = phone(cloud, 'd_a');
    await settle(TICK * 10);
    record(a, DAY, 'w_01');
    await settle(TICK * 20);
    given('one write landed, so there is a document to move under the next one',
        Boolean(cloud.doc) && cloud.doc.revision >= 1,
        `revision ${cloud.doc && cloud.doc.revision}`);

    // A server that refuses every attempt, and refuses it in the way that INVITES a
    // rebase: the document it hands back is the current one with a higher revision, so
    // nothing this write touches has moved and contestedPaths answers empty every time.
    let attempts = 0;
    cloud.adapter.update = (patch) => {
        attempts += 1;
        const moved = JSON.parse(JSON.stringify(cloud.doc));
        moved.revision = (Number(moved.revision) || 0) + attempts;
        const error = new Error('the document moved again');
        error.code = 'conflict';
        error.revision = moved.revision;
        error.document = moved;
        return Promise.reject(error);
    };

    // The bound itself, read out of the build rather than written down here twice - a
    // second copy of a constant is a second place for it to be wrong.
    const limit = a.global('CAS_REBASE_LIMIT');
    given('the build states a rebase ceiling', Number.isInteger(limit) && limit > 0,
        String(limit));

    record(a, '2026-08-14', 'w_02');
    await settle(TICK * 30);
    const firstFlush = attempts;
    // At MOST limit + 1: the first send plus the rebases. It may stop sooner - a rebase
    // is only taken while nothing the write touches has moved - and stopping sooner is
    // the same guarantee reached earlier, so the assertion is the ceiling, not a count.
    check('one flush tries a bounded number of times and then stops',
        firstFlush >= 2 && firstFlush <= limit + 1,
        `${firstFlush} attempts against a ceiling of ${limit} rebases`);

    // And it does not spin. The retry timer will come back - that is correct, a tunnel
    // ends - but each visit is bounded the same way, and the count does not run away.
    // This is the check that fails on an unbounded rebase.
    await settle(TICK * 400);
    check('and waiting a long time is more retries, never a loop',
        attempts <= (limit + 1) * 4, `${attempts} attempts after a long wait`);

    check('the work is still held on this device, not acknowledged',
        a.Sync.pendingCount() > 0, `${a.Sync.pendingCount()} pending`);
    check('and nothing on the screen says synced', a.Sync.status !== 'synced',
        a.Sync.status);
    check('the day is still on this phone\'s own record',
        Boolean(a.State.schedule.days['2026-08-14']),
        JSON.stringify(Object.keys(a.State.schedule.days)));
}

// ============================================================ the create race, heard late
{
    suite('the loser of a create race whose snapshot is late merges without an error');

    // Both phones are told the project is empty, both record a day, and both send a
    // create. Exactly one wins; the loser is handed 'already-exists' and sends its day
    // as the update it always was. tests/data.test.mjs covers that - with a listener
    // that has already delivered the winner's document by the time the refusal comes
    // back, because the harness publishes synchronously. Firestore makes no such
    // promise: the transaction's answer and the listener are two channels with no
    // ordering between them, and the refusal can arrive first.
    //
    // Then the loser's update goes out at revision 1 against a document already at
    // revision 1. A conflict - the same shape every other write gets rebased and
    // merged from - except that the create's follow-up was not routed through the
    // handler that does that, so it escaped to the outer catch: 'sync error (N pending)'
    // on the loser's screen for as long as the listener took, and the day landed only
    // when the late snapshot triggered another flush. No data was lost. The line said
    // something had gone wrong about an ordinary two-people-one-evening merge.
    const cloud = makeCloud();
    const a = phone(null, 'd_a');
    const b = phone(null, 'd_b');

    // The loser's listener runs 150 ms behind the transaction. The first delivery - the
    // state at subscribe, "the project is empty" - is prompt, as it is in Firestore;
    // it is what the winner PUBLISHES that arrives late.
    const late = Object.assign({}, cloud.adapter, {
        subscribe: (onSnapshot, onError) => {
            let first = true;
            return cloud.adapter.subscribe(snapshot => {
                if (first) { first = false; onSnapshot(snapshot); return; }
                setTimeout(() => onSnapshot(snapshot), 150);
            }, onError);
        }
    });
    // Both creates are held open on the wire, so the race is decided by the test and
    // not by the debounce.
    const holds = [];
    cloud.hold = (kind, payload) => (kind === 'create'
        ? new Promise(resolve => { holds.push({ by: payload.updatedBy, resolve }); }) : null);

    a.Sync.connect(cloud.adapter);
    b.Sync.connect(late);
    record(a, DAY, 'w_01');
    record(b, '2026-08-13', 'w_02');
    await settleUntil(() => holds.length === 2, 5000);
    given('both phones sent a create', holds.length === 2, `${holds.length} creates open`);

    // Every status the loser lands on from here, and every error it is handed.
    const seen = [];
    const errors = [];
    const original = b.Sync.setStatus;
    b.Sync.setStatus = function (status, error) {
        original.call(this, status, error);
        seen.push(this.status);
        if (error) errors.push(String(error.message || error));
    };

    // The winner lands; the loser's create is refused a moment later, while its
    // listener has still not delivered the winner's document.
    const winner = holds.find(held => held.by === 'd_a');
    const loser = holds.find(held => held.by === 'd_b');
    given('one create from each phone', Boolean(winner) && Boolean(loser),
        JSON.stringify(holds.map(held => held.by)));
    winner.resolve();
    await settle(TICK);
    loser.resolve();
    cloud.hold = null;
    await settleUntil(() => a.Sync.pendingCount() === 0 && b.Sync.pendingCount() === 0
        && a.Sync.status === 'synced' && b.Sync.status === 'synced', 5000);
    await settle(TICK * 20);

    const days = Object.keys((cloud.doc || {}).days || {}).sort();
    check('exactly one create landed',
        cloud.writes.filter(write => write.kind === 'create' && !write.replayed).length === 1,
        JSON.stringify(cloud.writes.map(write => write.kind)));
    check('and both days are in the cloud',
        days.join() === `${DAY},2026-08-13`, days.join());
    check('both phones are finished', a.Sync.status === 'synced' && b.Sync.status === 'synced'
        && a.Sync.pendingCount() === 0 && b.Sync.pendingCount() === 0,
        `${a.Sync.status} / ${b.Sync.status}`);
    // THE PIN. The loser's conflict is the ordinary merge and is handled as one.
    check('the loser never showed a sync error on the way',
        seen.indexOf('error') === -1, JSON.stringify(seen));
    check('and was never handed the document moving as a failure',
        errors.every(message => !/moved/.test(message)), JSON.stringify(errors));
}

report();
