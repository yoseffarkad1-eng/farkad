// Losing a race is a decision, not a pause.
//
//   node tests/contested.test.mjs
//
// Two phones write the same field. One lands; the other is refused by its revision, and
// contestedPaths says the path it wanted has moved - somebody else corrected it while
// this write was being built. The app says so, in its own line, and the edit is safe on
// this disk. All of that was already right.
//
// What happened next was not. The refused operation stayed in the outbox with sent:false
// and a retry was scheduled, so it was still a live write - and the WINNER'S SNAPSHOT was
// what set it off. receive() adopts the winner's document, noteRevision replaces _baseDoc
// with it, reapplyPending puts this phone's value back on top, and receive() ends with
//
//     if (this.pendingCount() > 0) this.scheduleFlush();
//
// The rebuilt write is now compared against the base it just adopted, so contestedPaths
// answers [] - the path holds what this device now believes - the write claims the next
// revision, the server accepts it, and the correction the other phone made is gone from
// the document. The winning phone then adopts that, so the correction disappears from the
// phone that made it too. Nothing errors. Both phones say synced. Total elapsed: about two
// seconds of 'contested' on a screen nobody was looking at.
//
// tests/cas.test.mjs never sees it: it manufactures the conflict by nulling _revision and
// _baseDoc by hand rather than by withholding a snapshot, so no further snapshot is ever
// delivered, _baseDoc stays null, every later attempt is contested again by construction,
// and its last settle is 300ms against a 2000ms first retry. It asserts the status one
// moment after the refusal and stops.
//
// So a contested operation is now HELD, durably, by its own id - the same shape the queue
// already uses to retire a beaten operation, one small key per held operation, written and
// read back. A held operation is not sent by anything: not the timer, not a snapshot, not
// reconnect, not online, not scheduleFlush(), not flush(), not a new adapter, not the next
// session. It stays on the disk, it still counts as owed, and the status keeps saying so.
//
// The way out is a person: a fresh explicit edit of the same path supersedes it.

import { makeDevice, makeCloud, settle, settleUntil } from './harness.mjs';
import { suite, check, same, given, report } from './runner.mjs';

const TICK = 6;
const DAY = '2026-08-12';
const PATH = `days.${DAY}.actual.w_01`;

function phone(id) {
    const device = makeDevice({ deviceId: id });
    device.Sync.pushDelayMs = TICK;
    device.setToday('2026-08-20');
    device.ctx.askTell = () => Promise.resolve();
    device.State.schedule.workers = [
        { id: 'w_01', name: 'דוד', active: true, dailyRate: 400, hourlyRate: 0 }];
    device.State.schedule.places = [
        { id: 'p_00', name: 'התחלה', active: true },
        { id: 'p_01', name: 'הרצליה', active: true },
        { id: 'p_02', name: 'תל אביב', active: true }];
    device.State.save({ silent: true });
    return device;
}

const site = (device, placeId) => device.State.commit(device.call('assignPlace',
    device.State.schedule, DAY, 'w_01', 'actual', placeId));

// A phone that can still WRITE but cannot HEAR. Withholding the snapshot is how the race
// actually happens - two people recording the same evening, one of them in a stairwell -
// and it is the difference between this suite and the one that missed the defect.
//
// `jam()` is the stairwell proper: nothing in, nothing out. A write made there fails on
// the network, not on the protocol, so the phone never learns it lost while it is in
// there - and when it comes out, the snapshot it missed is delivered BEFORE its retry.
function tunnel(cloud) {
    const gate = { open: true, jammed: false, waiting: [], adapter: {} };
    const noSignal = () => {
        const error = new Error('client is offline');
        error.code = 'unavailable';
        return error;
    };
    Object.keys(cloud.adapter).forEach(name => {
        gate.adapter[name] = (...args) => (gate.jammed
            ? Promise.reject(noSignal())
            : cloud.adapter[name](...args));
    });
    gate.adapter.subscribe = (onNext, onError) => cloud.adapter.subscribe(
        snapshot => {
            if (gate.open) onNext(snapshot);
            else gate.waiting.push([onNext, snapshot]);
        }, onError);
    gate.close = () => { gate.open = false; };
    gate.jam = () => { gate.open = false; gate.jammed = true; };
    gate.release = () => {
        gate.open = true;
        gate.jammed = false;
        const waiting = gate.waiting.slice();
        gate.waiting = [];
        waiting.forEach(([onNext, snapshot]) => onNext(snapshot));
    };
    return gate;
}

const cloud = makeCloud();
const inCloud = () => {
    const held = ((((cloud.doc || {}).days || {})[DAY] || {}).actual || {}).w_01;
    return ((held && held.entries) || []).map(item => item.placeId).sort().join();
};
const accepted = () => cloud.writes.filter(write => !write.replayed).length;

const a = phone('d_a');
const b = phone('d_b');
const gate = tunnel(cloud);
a.Sync.connect(cloud.adapter);
await settle(TICK * 10);
b.Sync.connect(gate.adapter);
await settle(TICK * 10);

site(a, 'p_00');
await settleUntil(() => inCloud() === 'p_00'
    && b.Sync._revision === cloud.doc.revision, 5000);
given('both phones read the same value at the same revision',
    inCloud() === 'p_00' && b.Sync._revision === cloud.doc.revision,
    `cloud ${inCloud()} at ${cloud.doc && cloud.doc.revision}, B at ${b.Sync._revision}`);

// A corrects; B, which cannot hear, writes the same path.
gate.close();
site(a, 'p_01');
await settleUntil(() => inCloud() === 'p_00,p_01', 5000);
site(b, 'p_02');
b.Sync.flush();
await settleUntil(() => b.Sync.status === 'contested', 5000);

const wonWith = inCloud();
const wonAt = cloud.doc.revision;
const wonCount = accepted();

{
    suite('the refusal, and what it leaves behind');

    check('B is told it lost, in its own words',
        b.Sync.status === 'contested', b.Sync.status);
    check('the cloud holds the winner', wonWith === 'p_00,p_01', wonWith);
    check('B still holds its own edit, on its own disk',
        b.State.schedule.days[DAY].actual.w_01.entries.some(e => e.placeId === 'p_02'));
    check('and still owes it', b.Sync.pendingCount() > 0, String(b.Sync.pendingCount()));
}

// --------------------------------------------------------------- every trigger, one by one
{
    suite('nothing sends a held operation');

    // The order matters: the winner's snapshot FIRST, because that is the trigger that
    // used to do it, and every other trigger after it so that a hold released by the
    // snapshot would still be caught.
    const triggers = [
        ['the winner\'s snapshot arrives', async () => { gate.release(); await settle(TICK * 40); }],
        ['the retry timer fires', async () => { await settle(3000); }],
        ['scheduleFlush is called directly', async () => {
            b.Sync.scheduleFlush(); await settle(TICK * 40);
        }],
        ['flush is called directly', async () => {
            b.Sync.flush(); await settle(TICK * 40);
        }],
        ['the browser comes back online', async () => {
            if (typeof b.ctx.window.onlineHandler === 'function') b.ctx.window.onlineHandler();
            b.Sync.scheduleFlush(); await settle(TICK * 40);
        }],
        ['the adapter is recreated', async () => {
            b.Sync.connect(gate.adapter); await settle(TICK * 40);
        }]
    ];

    for (const [what, fire] of triggers) {
        await fire();
        check(`${what}: the cloud is still the winner's`,
            inCloud() === wonWith, `${inCloud()} (was ${wonWith})`);
        check(`${what}: and the revision has not moved`,
            cloud.doc.revision === wonAt && accepted() === wonCount,
            `revision ${cloud.doc.revision} of ${wonAt}, ${accepted()} writes of ${wonCount}`);
        check(`${what}: B never says synced`,
            b.Sync.status !== 'synced', b.Sync.status);
    }

    check('B is still holding its own bytes',
        b.State.schedule.days[DAY].actual.w_01.entries.some(e => e.placeId === 'p_02'));
    check('and still owes them', b.Sync.pendingCount() > 0, String(b.Sync.pendingCount()));
}

// ------------------------------------------------------------ and across a close/reopen
{
    suite('the hold is on the disk, not in the session');

    const again = makeDevice({ deviceId: 'd_b', storage: b.dump() });
    again.Sync.pushDelayMs = TICK;
    again.setToday('2026-08-20');
    again.ctx.askTell = () => Promise.resolve();
    again.State.load();
    again.Sync.connect(gate.adapter);
    await settle(TICK * 60);

    check('a reopened phone does not send it either',
        inCloud() === wonWith && cloud.doc.revision === wonAt,
        `${inCloud()} at ${cloud.doc.revision}`);
    check('it still owes it', again.Sync.pendingCount() > 0,
        String(again.Sync.pendingCount()));
    check('and it does not call itself synced',
        again.Sync.status !== 'synced', again.Sync.status);
}

// --------------------------------------------------- a disjoint edit is not held with it
{
    suite('an unrelated edit in its own batch still leaves the phone');

    // A held operation is not a broken connection. The rest of the evening has to go.
    const before = accepted();
    b.State.commit(b.call('assignPlace', b.State.schedule,
        '2026-08-13', 'w_01', 'actual', 'p_01'));
    await settleUntil(() => accepted() > before, 6000);

    check('the other day landed',
        Boolean(((cloud.doc.days || {})['2026-08-13'] || {}).actual),
        JSON.stringify(Object.keys(cloud.doc.days || {})));
    check('and the contested day is still the winner\'s',
        inCloud() === wonWith, inCloud());
    check('while the contested operation is still owed',
        b.Sync.pendingCount() > 0, String(b.Sync.pendingCount()));
    check('and the phone still does not say synced',
        b.Sync.status !== 'synced', b.Sync.status);
}

// ------------------------------------------------- and a batch is held whole, or not at all
{
    suite('one held path holds its whole batch');

    // A batch is written once and is atomic. Sending the rest of it because only one path
    // was contested is splitting a write to get part of it out, which is the one thing the
    // batch record exists to prevent - a copy-a-day, a quickstart roster or a bulk edit
    // arriving half-applied on the other phones.
    //
    // sendClaimed builds `heldBatches` for exactly this, and NOTHING EVER PUT ANYTHING IN
    // IT: the Set is created empty, asked `heldBatches.has(item.batchKey)`, and never
    // added to. So the held path was skipped and its partner went out alone.
    const cloud2 = makeCloud();
    const one = phone('d_batch_a');
    const two = phone('d_batch_b');
    const gate2 = tunnel(cloud2);
    one.Sync.connect(cloud2.adapter);
    await settle(TICK * 10);
    two.Sync.connect(gate2.adapter);
    await settle(TICK * 10);

    const DAY_ONE = '2026-08-18';
    const DAY_TWO = '2026-08-19';
    const put = (device, date, placeId) => device.call('assignPlace',
        device.State.schedule, date, 'w_01', 'actual', placeId);

    one.State.commit(put(one, DAY_ONE, 'p_00'));
    await settleUntil(() => Boolean((cloud2.doc.days || {})[DAY_ONE])
        && two.Sync._revision === cloud2.doc.revision, 5000);
    given('both phones start from the same document',
        Boolean((cloud2.doc.days || {})[DAY_ONE]));

    // A corrects the first day. B, which cannot hear, edits BOTH days in ONE batch.
    gate2.close();
    one.State.commit(put(one, DAY_ONE, 'p_01'));
    await settleUntil(() => JSON.stringify(cloud2.doc.days[DAY_ONE]).indexOf('p_01') !== -1,
        5000);
    const wonAtTwo = cloud2.doc.revision;

    two.State.commitMany([put(two, DAY_ONE, 'p_02'), put(two, DAY_TWO, 'p_02')]);
    two.Sync.flush();
    await settleUntil(() => two.Sync.status === 'contested', 5000);

    check('B is told it lost', two.Sync.status === 'contested', two.Sync.status);
    check('the contested day is still the winner\'s',
        JSON.stringify(cloud2.doc.days[DAY_ONE]).indexOf('p_01') !== -1,
        JSON.stringify(cloud2.doc.days[DAY_ONE]));
    // THE OTHER HALF OF THE SAME BATCH. It is not contested and it would have gone out
    // alone, leaving the cloud holding half of one atomic edit.
    check('and the OTHER day of that batch never left the phone',
        (cloud2.doc.days || {})[DAY_TWO] === undefined,
        JSON.stringify(Object.keys(cloud2.doc.days || {})));

    // Every trigger, again, against the batch rather than the operation.
    gate2.release();
    await settle(TICK * 40);
    two.Sync.flush();
    await settle(3000);
    check('no trigger sends half of it afterwards either',
        (cloud2.doc.days || {})[DAY_TWO] === undefined
        && JSON.stringify(cloud2.doc.days[DAY_ONE]).indexOf('p_01') !== -1,
        JSON.stringify(Object.keys(cloud2.doc.days || {})));
    check('B still owes the whole batch', two.Sync.pendingCount() >= 2,
        String(two.Sync.pendingCount()));
    check('and never says synced', two.Sync.status !== 'synced', two.Sync.status);

    // A DIFFERENT batch is untouched - the control. A held write is not a broken
    // connection, and the rest of the evening still has to go.
    const before = cloud2.writes.filter(write => !write.replayed).length;
    two.State.commit(put(two, '2026-08-20', 'p_01'));
    await settleUntil(() =>
        cloud2.writes.filter(write => !write.replayed).length > before, 6000);
    check('an unrelated day in its own batch still goes',
        Boolean((cloud2.doc.days || {})['2026-08-20']),
        JSON.stringify(Object.keys(cloud2.doc.days || {})));
}

// -------------------------------------------- and a hold the disk refused survives anyway
{
    suite('a hold the disk would not take still holds after a reopen');

    // The marker is written AFTER the refusal, and a disk that will not take it leaves
    // only `_heldNow` - which is a Set in one session's memory. Close the app and the
    // hold is gone: the operation is still in the outbox with sent:false, nothing on the
    // disk says it lost, and the next flush puts the loser's value over the winner's
    // correction. Fail-open, on the one path where this app has decided to fail closed.
    //
    // The fix cannot be another post-conflict write - the same disk refuses that too. The
    // base each edit was built on is recorded WITH the operation, in the same verified
    // write, so it is exactly as durable as the edit itself: if it cannot be written the
    // edit is not queued at all, which is what State.commit already promises.
    const faults = [
        ['the marker write is refused', device =>
            device.failWrite(key => key.indexOf(':hold:') !== -1)],
        ['there is no room for it', device =>
            device.setQuota(key => key.indexOf(':hold:') !== -1)],
        ['it comes back altered', device =>
            device.corruptWhen(key => key.indexOf(':hold:') !== -1)]
    ];

    for (const [what, breakIt] of faults) {
        const sky = makeCloud();
        const won = phone('d_fo_a_' + what.replace(/\W/g, '').slice(0, 8));
        const lost = phone('d_fo_b_' + what.replace(/\W/g, '').slice(0, 8));
        const wall = tunnel(sky);
        won.Sync.connect(sky.adapter);
        await settle(TICK * 10);
        lost.Sync.connect(wall.adapter);
        await settle(TICK * 10);

        const set = (device, placeId) => device.State.commit(device.call('assignPlace',
            device.State.schedule, DAY, 'w_01', 'actual', placeId));
        set(won, 'p_00');
        await settleUntil(() => Boolean((sky.doc.days || {})[DAY])
            && lost.Sync._revision === sky.doc.revision, 5000);

        wall.close();
        set(won, 'p_01');
        await settleUntil(() =>
            JSON.stringify(sky.doc.days[DAY]).indexOf('p_01') !== -1, 5000);
        const winner = JSON.stringify(sky.doc.days[DAY]);
        const writes = sky.writes.filter(write => !write.replayed).length;

        breakIt(lost);
        set(lost, 'p_02');
        lost.Sync.flush();
        await settleUntil(() => lost.Sync.status === 'contested', 5000);
        given(`${what}: the loser is told, in this session`,
            lost.Sync.status === 'contested', lost.Sync.status);
        // No READABLE marker: `corruptWhen` lets the write happen and gives back something
        // else, which is why setVerified reads back rather than trusting the return.
        const marker = Object.keys(lost.dump()).filter(key => key.indexOf(':hold:') !== -1);
        given(`${what}: and the disk did not durably record the hold`,
            marker.every(key => lost.dump()[key] !== '1'),
            JSON.stringify(marker.map(key => [key.slice(-12), lost.dump()[key]])));

        // THE REOPEN, in the order that is actually dangerous: the phone comes back, HEARS
        // the winner's document first, and only then flushes. That is what empties the
        // conflict of evidence - the base it would be compared against has already become
        // the winner's value, so nothing looks contested and the loser rebases over it.
        wall.release();
        await settle(TICK * 20);
        const again = makeDevice({ deviceId: lost.deviceId, storage: lost.dump() });
        again.Sync.pushDelayMs = TICK;
        again.setToday('2026-08-20');
        again.ctx.askTell = () => Promise.resolve();
        again.State.load();
        again.Sync.connect(sky.adapter);
        await settleUntil(() => again.Sync._revision === sky.doc.revision, 5000);
        given(`${what}: the reopened phone has heard the winner`,
            again.Sync._revision === sky.doc.revision,
            `${again.Sync._revision} of ${sky.doc.revision}`);
        again.Sync.flush();
        await settle(TICK * 80);

        check(`${what}: the winner's correction is still the winner's`,
            JSON.stringify(sky.doc.days[DAY]) === winner,
            `${JSON.stringify(sky.doc.days[DAY])} (was ${winner})`);
        check(`${what}: and the reopened loser sent nothing`,
            sky.writes.filter(write => !write.replayed).length === writes,
            `${writes} -> ${sky.writes.filter(write => !write.replayed).length}`);
        check(`${what}: it still owes its edit`, again.Sync.pendingCount() > 0,
            String(again.Sync.pendingCount()));
        check(`${what}: and does not say synced`, again.Sync.status !== 'synced',
            again.Sync.status);
    }
}

// --------------------------------------------- a hold decided before the send says so
{
    suite('a hold decided before the send is reported as itself');

    // Two roads to a hold, and only one of them told anybody.
    //
    // The conflict branch reaches the status line through fail(), which knows a held
    // path from a failure and says 'contested'. The pre-send check - the one built for
    // the phone that hears the winner FIRST and only then flushes, which is the ordinary
    // way back into signal - held the path and set nothing. The holding branch below it
    // schedules no retry for a contested hold, on purpose, and re-asks the status only
    // when it currently reads 'synced'; at that moment it read 'sending'. So the line
    // said "מחובר. יש רישומים שעדיין נשלחים." for the rest of the evening, with nothing
    // sending and nothing that would ever retry. The way out of a hold is a person, and
    // the person was told the opposite of what they needed to know.
    const sky = makeCloud();
    const won = phone('d_say_a');
    const lost = phone('d_say_b');
    const wall = tunnel(sky);
    won.Sync.connect(sky.adapter);
    await settle(TICK * 10);
    lost.Sync.connect(wall.adapter);
    await settle(TICK * 10);
    const landed = () => sky.writes.filter(write => !write.replayed).length;

    const set = (device, placeId) => device.State.commit(device.call('assignPlace',
        device.State.schedule, DAY, 'w_01', 'actual', placeId));
    set(won, 'p_00');
    await settleUntil(() => Boolean((sky.doc.days || {})[DAY])
        && lost.Sync._revision === sky.doc.revision, 5000);
    given('both phones start from the same document',
        lost.Sync._revision === sky.doc.revision,
        `${lost.Sync._revision} of ${sky.doc.revision}`);

    // The stairwell. The winner corrects; the loser records over the same day, and its
    // send dies on the network - so nothing has refused it, and nothing is held yet.
    wall.jam();
    set(won, 'p_01');
    await settleUntil(() => JSON.stringify(sky.doc.days[DAY]).indexOf('p_01') !== -1, 5000);
    const winner = JSON.stringify(sky.doc.days[DAY]);
    const writes = landed();
    set(lost, 'p_02');
    await settleUntil(() => lost.Sync.status === 'error' || lost.Sync.status === 'offline',
        5000);
    given('the loser\'s write failed on the network, not on the protocol',
        lost.Sync.status === 'error' || lost.Sync.status === 'offline', lost.Sync.status);

    // Back in signal: the winner's document arrives first, and the flush follows it.
    wall.release();
    await settleUntil(() => lost.Sync.holdingContested(), 5000);
    given('the pre-send check held the path', lost.Sync.holdingContested(),
        `status ${lost.Sync.status}, ${lost.Sync.pendingCount()} pending`);

    check('the cloud still holds the winner',
        JSON.stringify(sky.doc.days[DAY]) === winner,
        `${JSON.stringify(sky.doc.days[DAY])} (was ${winner})`);
    check('and the loser sent nothing', landed() === writes, `${writes} -> ${landed()}`);
    check('the loser is told it lost, in its own word',
        lost.Sync.status === 'contested', lost.Sync.status);

    lost.ctx.document.getElementById = id => (id === 'storageNotice'
        ? lost.__notice : null);
    lost.__notice = { textContent: '' };
    lost.call('updateSyncNotice');
    check('and the line says what happened, that nothing was lost, and what to do',
        lost.__notice.textContent.indexOf('הנתונים השתנו במכשיר אחר') !== -1
        && lost.__notice.textContent.indexOf('לא אבדה') !== -1
        && lost.__notice.textContent.indexOf('רענן') !== -1,
        JSON.stringify(lost.__notice.textContent));
    check('and never that something is still on its way',
        lost.__notice.textContent.indexOf('יש רישומים שעדיין נשלחים') === -1,
        JSON.stringify(lost.__notice.textContent));

    // An idle phone, past the first rung of the retry ladder. A decision does not expire.
    await settle(3000);
    check('it still says so with nothing else happening',
        lost.Sync.status === 'contested', lost.Sync.status);
    check('and still sent nothing',
        landed() === writes && JSON.stringify(sky.doc.days[DAY]) === winner,
        `${writes} -> ${landed()}, ${JSON.stringify(sky.doc.days[DAY])}`);
    check('while still owing its edit', lost.Sync.pendingCount() > 0,
        String(lost.Sync.pendingCount()));
}

// ------------------------------------------------------------------ the way out is a person
{
    suite('a fresh explicit edit of the same path supersedes the held one');

    const before = accepted();
    // The person looks at the day, sees what the other phone recorded, and decides. This
    // is a NEW operation on the same path, not the old one waking up.
    site(b, 'p_02');
    await settleUntil(() => accepted() > before, 8000);
    await settle(TICK * 40);

    check('exactly one new write landed', accepted() === before + 1,
        `${before} -> ${accepted()}`);
    check('and it is the value the person just chose',
        inCloud().indexOf('p_02') !== -1, inCloud());
    check('the queue is empty again', b.Sync.pendingCount() === 0,
        String(b.Sync.pendingCount()));
    check('and the phone may say synced now', b.Sync.status === 'synced', b.Sync.status);
}

report();
