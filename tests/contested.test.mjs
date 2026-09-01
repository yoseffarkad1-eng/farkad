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
function tunnel(cloud) {
    const gate = { open: true, waiting: [], adapter: {} };
    Object.keys(cloud.adapter).forEach(name => {
        gate.adapter[name] = (...args) => cloud.adapter[name](...args);
    });
    gate.adapter.subscribe = (onNext, onError) => cloud.adapter.subscribe(
        snapshot => {
            if (gate.open) onNext(snapshot);
            else gate.waiting.push([onNext, snapshot]);
        }, onError);
    gate.close = () => { gate.open = false; };
    gate.release = () => {
        gate.open = true;
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
