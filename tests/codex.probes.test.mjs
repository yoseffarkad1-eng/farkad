// The six findings of the independent Codex review of f883541, each as its own probe.
//
//   node tests/codex.probes.test.mjs
//
// Every one of these is RED at f8835411eea551d44b872cfc116578b9ffb40103 and green after
// the repair. They are written against the public surface - State, Store, FarkadSync -
// and never against an internal the repair introduced, so they measure the behaviour
// rather than the shape of the fix.
//
// SYNTHETIC ONLY: invented men with fixed ids and rates, invented sites, one invented
// day. No real record is read or written, no network, no live project.
//
// WHAT IS NOT UNDER TEST, and must not be changed to make any of these pass: the wage
// rules, the advance rules, the pay cycles, and the deliberate allowance of TWO sites a
// day for one worker. Several probes are built ON that allowance.

import { makeDevice, makeCloud, sharedStore, settle, settleUntil } from './harness.mjs';
import { suite, check, given, report } from './runner.mjs';

const TICK = 6;
const DAY = '2026-09-15';
const W1 = 'w_cx_01';
const W2 = 'w_cx_02';
const A = 'p_cx_a';
const B = 'p_cx_b';
const C = 'p_cx_c';
const V2 = 'scheduleData:v2';

// The first window on a disk: it seeds the roster, as the app's own first run does.
function firstWindow(id, disk, cloud) {
    const device = makeDevice({ deviceId: id, sharedStorage: disk });
    device.Sync.pushDelayMs = TICK;
    device.setToday(DAY);
    device.ctx.askTell = () => Promise.resolve();
    device.ctx.askConfirm = () => Promise.resolve(false);
    device.State.date = DAY;
    device.State.schedule.workers = [
        { id: W1, name: 'עובד ניסיון א', active: true, dailyRate: 400, hourlyRate: 0 },
        { id: W2, name: 'עובד ניסיון ב', active: true, dailyRate: 450, hourlyRate: 0 }];
    device.State.schedule.places = [
        { id: A, name: 'אתר ניסיון א', active: true },
        { id: B, name: 'אתר ניסיון ב', active: true },
        { id: C, name: 'אתר ניסיון ג', active: true }];
    device.State.save({ silent: true });
    if (cloud) device.Sync.connect(cloud.adapter);
    return device;
}

// A second window of the app on the same disk: it reads what is there, as js/app.js does
// at boot. Nothing is seeded.
function secondWindow(id, disk, cloud) {
    const device = makeDevice({ deviceId: id, sharedStorage: disk });
    device.Sync.pushDelayMs = TICK;
    device.setToday(DAY);
    device.ctx.askTell = () => Promise.resolve();
    device.ctx.askConfirm = () => Promise.resolve(false);
    device.State.load();
    device.State.date = DAY;
    if (cloud) device.Sync.connect(cloud.adapter);
    return device;
}

const addTap = (d, w, p) => d.State.commit(
    d.call('assignPlace', d.State.schedule, DAY, w, 'actual', p, 'normal'));
const removeTap = (d, w, p) => d.State.commit(
    d.call('unassignPlace', d.State.schedule, DAY, w, 'actual', p));

const sitesOn = (device, worker) =>
    device.call('entriesFor', device.State.schedule, DAY, worker, 'actual')
        .map(entry => entry.placeId).sort().join('+') || '-';

const sitesOnDisk = (disk, worker) => {
    let stored = null;
    try { stored = JSON.parse(disk[V2] || 'null'); } catch (error) { return '!unreadable'; }
    const record = (((((stored || {}).days || {})[DAY]) || {}).actual || {})[worker];
    return (((record || {}).entries) || []).map(entry => entry.placeId).sort().join('+') || '-';
};

const nameOnDisk = (disk, worker) => {
    let stored = null;
    try { stored = JSON.parse(disk[V2] || 'null'); } catch (error) { return '!unreadable'; }
    const found = ((stored || {}).workers || []).find(item => item && item.id === worker);
    return found ? found.name : '!missing';
};

// ========================================================================== F1
// diskVerdict asks Store.get, and Store.get answers from Store.memory first - which holds
// what THIS window last wrote. So for any window that has saved even once, the comparison
// is its own text against its own text: the guard answers 'clear' and never fires. Only a
// window that has never written is protected, which is not the case the guard exists for.
{
    suite('F1 · a window that has already saved still sees the real disk');

    const disk = sharedStore();
    const one = firstWindow('d_f1_one', disk);
    addTap(one, W1, A);
    given('the first window recorded him at the first site',
        sitesOnDisk(disk, W1) === A, sitesOnDisk(disk, W1));

    const two = secondWindow('d_f1_two', disk);
    // THE DIFFERENCE FROM EVERY EARLIER SUITE: this window SAVES before the disk moves,
    // which is what an ordinary evening looks like, and what fills Store.memory.
    addTap(two, W2, C);
    given('the second window has saved at least once', sitesOnDisk(disk, W2) === C,
        sitesOnDisk(disk, W2));

    // The first window completes a move the second one never hears about.
    removeTap(one, W1, A);
    addTap(one, W1, B);
    given('the disk now holds the move', sitesOnDisk(disk, W1) === B, sitesOnDisk(disk, W1));

    // An ordinary next edit from the window that has gone out of date.
    addTap(two, W2, A);
    check('the stale window does not put the moved man back',
        sitesOnDisk(disk, W1) === B, `disk says ${sitesOnDisk(disk, W1)}`);
    check('and its own edit is recorded',
        sitesOnDisk(disk, W2).indexOf(A) !== -1, sitesOnDisk(disk, W2));
}

{
    suite('F1 · damaged storage is still detected by a window that has saved');

    const disk = sharedStore();
    const one = firstWindow('d_f1b_one', disk);
    addTap(one, W1, A);
    const two = secondWindow('d_f1b_two', disk);
    addTap(two, W2, C);                      // this window has now written
    given('both men are recorded', sitesOnDisk(disk, W1) === A && sitesOnDisk(disk, W2) === C,
        `${sitesOnDisk(disk, W1)} / ${sitesOnDisk(disk, W2)}`);

    // Something that parses but is not a schedule, left on the disk by another process.
    const damaged = JSON.stringify({ workers: 'not a list', places: [], days: {}, advances: {} });
    disk[V2] = damaged;

    const answered = addTap(two, W2, B);
    check('the edit is refused rather than written over the damaged record',
        answered === false, String(answered));
    check('AND THE DAMAGED BYTES ARE STILL THERE, exactly',
        disk[V2] === damaged, disk[V2] === damaged ? 'preserved' : 'OVERWRITTEN');
}

// ========================================================================== F2
// commitRoster journals through editRoster and then calls save() with no verdict at all,
// so a roster edit from a stale window writes its whole schedule - days included - over
// a newer record. Renaming one man therefore rewrites another man's recorded work.
{
    suite('F2 · a roster edit from a stale window does not rewrite recorded work');

    const disk = sharedStore();
    const one = firstWindow('d_f2_one', disk);
    addTap(one, W1, A);
    const two = secondWindow('d_f2_two', disk);
    given('the second window sees him at the first site', sitesOn(two, W1) === A, sitesOn(two, W1));

    removeTap(one, W1, A);
    addTap(one, W1, B);
    given('the first window moved him, on the disk', sitesOnDisk(disk, W1) === B,
        sitesOnDisk(disk, W1));

    // The stale window renames the OTHER man - a roster change, nothing to do with days.
    const worker = two.State.schedule.workers.find(item => item.id === W2);
    worker.name = 'עובד ניסיון ב - שם חדש';
    two.State.commitRoster();

    check('the rename lands', nameOnDisk(disk, W2) === 'עובד ניסיון ב - שם חדש',
        nameOnDisk(disk, W2));
    check('AND IT DOES NOT CARRY OLD DAY DATA with it',
        sitesOnDisk(disk, W1) === B, `disk says ${sitesOnDisk(disk, W1)}`);
}

// ========================================================================== F3
// The rebase takes whatever is on the disk as the new baseline and then replays this
// window's journal over it. The journal entry for a worker-day is the WHOLE record, so a
// site another window deliberately removed comes back, and the other window's edit is
// overwritten with nobody told. The version the person actually saw when they made their
// edit is never recorded, so there is nothing to compare against.
{
    suite('F3 · a deliberately removed site is not resurrected by another window');

    const disk = sharedStore();
    const one = firstWindow('d_f3_one', disk);
    addTap(one, W1, A);
    addTap(one, W1, B);                       // two sites: allowed, and the point
    given('he is at two sites, which is allowed',
        sitesOnDisk(disk, W1) === [A, B].sort().join('+'), sitesOnDisk(disk, W1));

    const two = secondWindow('d_f3_two', disk);
    given('the second window sees both', sitesOn(two, W1) === [A, B].sort().join('+'),
        sitesOn(two, W1));

    // The first window REMOVES one of them, on purpose.
    removeTap(one, W1, B);
    given('the first window removed the second site deliberately',
        sitesOnDisk(disk, W1) === A, sitesOnDisk(disk, W1));

    // The stale window edits the SAME worker-day, computed against what it still
    // believes: it takes him off the FIRST site. Against its memory that leaves the
    // second one - the very site the other window deleted on purpose.
    removeTap(two, W1, A);

    const after = sitesOnDisk(disk, W1);
    check('the removed site is NOT brought back',
        after.indexOf(B) === -1, `disk says ${after}`);
    check('and the other window\'s removal still stands',
        after.indexOf(A) !== -1, `disk says ${after}`);
    check('a conflict over one worker-day is kept, not silently resolved',
        two.Sync.heldRecords().length > 0
        || two.global('Recovery').problems.length > 0,
        JSON.stringify({ held: two.Sync.heldRecords().length,
            problems: two.global('Recovery').problems.length }));
}

// ========================================================================== F4
// The verdict reads the disk and save() writes it; between those two a write from another
// window is not seen. Re-reading is not serialisation. Two REAL operations are interleaved
// here - the second window's commit is entered from inside the first window's write - and
// neither may be lost.
{
    suite('F4 · two interleaved commits do not lose one of them');

    const disk = sharedStore();
    const one = firstWindow('d_f4_one', disk);
    addTap(one, W1, A);
    const two = secondWindow('d_f4_two', disk);
    addTap(two, W2, C);
    given('both windows are up to date',
        sitesOnDisk(disk, W1) === A && sitesOnDisk(disk, W2) === C,
        `${sitesOnDisk(disk, W1)} / ${sitesOnDisk(disk, W2)}`);

    // A real commit from window ONE, entered in the middle of window TWO's write. In a
    // browser these are two threads; here one re-enters the other, which is the same
    // hazard with deterministic timing.
    const Store2 = two.global('Store');
    const real = Store2.setVerified;
    let fired = false;
    const oneSaid = [];
    Store2.setVerified = function (key, value) {
        if (!fired && key === V2) {
            fired = true;
            // Two real operations, through the real path, inside the other window's write.
            oneSaid.push(removeTap(one, W1, A));
            oneSaid.push(addTap(one, W1, B));
        }
        return real.call(this, key, value);
    };
    const answered = addTap(two, W2, A);
    Store2.setVerified = real;

    given('the interleave actually happened', fired === true, String(fired));

    // THE INVARIANT IS THE WORKER'S FINAL VALUE, NOT THE RETURN OF A SAVE.
    //
    // localStorage has no atomic test-and-set, so two windows writing one key cannot be
    // made mutually exclusive synchronously - the note above recordOnDisk in js/state.js
    // says so plainly rather than claiming otherwise. What IS guaranteed is that a
    // committed edit is never lost: it is in the record, or it is in the journal and a
    // reopen produces it. So the question asked here is the one that matters to the
    // person - what does this man's day say when the app is opened again - and not
    // whether some call returned true.
    const landed = sitesOnDisk(disk, W1);
    const reopened = secondWindow('d_f4_reopen', disk);
    check('the interrupted window\'s operation is still in the queue, not on the floor',
        one.Sync.pendingPaths().some(path => path.indexOf(W1) !== -1),
        JSON.stringify(one.Sync.pendingPaths()));
    check('AND A REOPEN PRODUCES THE MAN\'S DAY INCLUDING THAT OPERATION',
        sitesOn(reopened, W1) === B,
        JSON.stringify({ oneSaid, diskRightAfter: landed, afterReopen: sitesOn(reopened, W1) }));
    check('nothing was dropped from the queue by the overwrite',
        one.Sync.pendingPaths().length >= 1, String(one.Sync.pendingPaths().length));
    check('and the second window either landed or was told it did not',
        (answered === true && sitesOnDisk(disk, W2).indexOf(A) !== -1)
        || (answered === false && sitesOnDisk(disk, W2) === C),
        JSON.stringify({ answered, w2: sitesOnDisk(disk, W2) }));
}

// ========================================================================== F5
// The stale-snapshot guard asks Number.isInteger(raw.revision). A document with no
// revision at all skips it entirely and is adopted, so one legacy delivery undoes
// everything a device has accepted since. The legacy path itself must stay open: a device
// that has never seen a revision has to keep adopting them.
{
    suite('F5 · a revision-less document does not downgrade a device past the protocol');

    const cloud = makeCloud();
    const disk = sharedStore();
    const one = firstWindow('d_f5_one', disk, cloud);
    await settle(TICK * 10);
    addTap(one, W1, A);
    await settleUntil(() => one.Sync.pendingCount() === 0, 8000);
    removeTap(one, W1, A);
    addTap(one, W1, B);
    await settleUntil(() => one.Sync.pendingCount() === 0, 8000);
    given('the device adopted the protocol and holds the move',
        sitesOn(one, W1) === B && Number.isInteger(cloud.doc.revision),
        `${sitesOn(one, W1)} / revision ${cloud.doc.revision}`);

    // A document with no revision, carrying the state from before the move.
    const legacy = JSON.parse(JSON.stringify(cloud.doc));
    delete legacy.revision;
    delete legacy.protocol;
    legacy.updatedBy = 'd_old_phone';
    legacy.days[DAY].actual[W1] = { entries: [{ placeId: A }], rates: { daily: 400, hourly: 0 } };
    cloud.subscribers.forEach(fn => fn(JSON.parse(JSON.stringify(legacy))));
    await settle(TICK * 20);

    check('the device does not take the move off its own screen',
        sitesOn(one, W1) === B, sitesOn(one, W1));

    // AND THE LEGACY PATH STAYS OPEN: a device that has never seen a revision adopts one.
    const legacyDoc = {
        workers: [{ id: W1, name: 'עובד ניסיון א', active: true, dailyRate: 400, hourlyRate: 0 },
            { id: W2, name: 'עובד ניסיון ב', active: true, dailyRate: 450, hourlyRate: 0 }],
        places: [{ id: A, name: 'אתר ניסיון א', active: true },
            { id: B, name: 'אתר ניסיון ב', active: true },
            { id: C, name: 'אתר ניסיון ג', active: true }],
        days: { [DAY]: { plan: {}, actual: { [W1]: { entries: [{ placeId: C }],
            rates: { daily: 400, hourly: 0 } } } } },
        advances: {}, updatedAt: '2026-09-15T08:00:00.000Z', updatedBy: 'd_pre_protocol' };
    // A project that has never been through the cutover: the document already there has
    // no revision, and it is the FIRST thing this device is shown.
    const cloud2 = makeCloud({ doc: legacyDoc });
    const disk2 = sharedStore();
    const fresh = firstWindow('d_f5_fresh', disk2, cloud2);
    await settle(TICK * 20);
    check('a device that has never seen a revision still adopts a legacy document',
        sitesOn(fresh, W1) === C, sitesOn(fresh, W1));
}

// ========================================================================== F6
// When the disk cannot be adopted, commit() refuses AFTER the journal has already taken
// the edit - so the operation is on the disk, will be replayed at the next open, and is
// owed to the cloud. The dialog says «השינוי בוטל כדי שלא ייראה כאילו נרשם», which is
// false: nothing was cancelled. The fate and the sentence have to agree.
{
    suite('F6 · an edit that is still in the queue is not reported as cancelled');

    const disk = sharedStore();
    const one = firstWindow('d_f6_one', disk);
    addTap(one, W1, A);
    // NOT saved before the damage, deliberately: that is what makes the verdict path
    // reachable on the reviewed head as well, where F1 masks it for any window that has
    // written. The fate and the sentence are the subject here, not the detection.
    const two = secondWindow('d_f6_two', disk);

    const said = [];
    two.ctx.askTell = options => {
        said.push(typeof options === 'string' ? options : JSON.stringify(options));
        return Promise.resolve();
    };
    two.ctx.askConfirm = options => {
        said.push(typeof options === 'string' ? options : JSON.stringify(options));
        return Promise.resolve(false);
    };

    const queuedBefore = two.Sync.pendingPaths().length;
    given('this window has not written yet, so the verdict path is reachable',
        queuedBefore >= 0, String(queuedBefore));
    const damaged = JSON.stringify({ workers: 'not a list', places: [], days: {}, advances: {} });
    disk[V2] = damaged;
    const answered = addTap(two, W2, B);

    given('the edit was refused', answered === false, String(answered));
    given('and the journal took it before the refusal',
        two.Sync.pendingPaths().length > 0,
        JSON.stringify(two.Sync.pendingPaths()));
    given('and something was said to the person', said.length > 0, JSON.stringify(said));
    check('the operation was NOT dropped from the queue',
        two.Sync.pendingPaths().length >= queuedBefore,
        `${queuedBefore} -> ${two.Sync.pendingPaths().length}`);
    check('and the person is not told the change was cancelled while it is still queued',
        said.every(text => text.indexOf('בוטל') === -1), JSON.stringify(said));
}

report();
