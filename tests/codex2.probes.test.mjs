// The second independent Codex review of 7833fb8: F4, F3 and F5 at the root.
//
//   node tests/codex2.probes.test.mjs
//
// WHAT EVERY CHECK HERE ASKS. Not whether a save returned true, and not whether some
// JSON exists: what THIS MAN'S DAY SAYS when the app is opened again. A write that
// reported success and a record that cannot produce the value are the same failure to
// the person holding the phone, and only the second question tells them apart.
//
// THE GUARANTEE UNDER TEST, stated the way js/state.js states it above recordOnDisk:
// localStorage has no atomic test-and-set, so two windows writing one key cannot be made
// mutually exclusive in synchronous code. What is guaranteed instead is that a committed
// edit is never lost - it is in the stored record, or it is in the journal and a reopen
// produces it - and that a conflict nobody has answered stays unanswered rather than
// being sent.
//
// SYNTHETIC ONLY: invented men with fixed ids and rates, invented sites, one invented
// day. No real record, no network, no live project. Nothing is deleted or zeroed.

import { makeDevice, makeCloud, sharedStore, settle, settleUntil } from './harness.mjs';
import { suite, check, given, report } from './runner.mjs';

const TICK = 6;
const DAY = '2026-09-15';
const W1 = 'w_c2_01';
const W2 = 'w_c2_02';
const A = 'p_c2_a';
const B = 'p_c2_b';
const C = 'p_c2_c';
const V2 = 'scheduleData:v2';

const WORKERS = [
    { id: W1, name: 'עובד ניסיון א', active: true, dailyRate: 400, hourlyRate: 0 },
    { id: W2, name: 'עובד ניסיון ב', active: true, dailyRate: 450, hourlyRate: 0 }];
const PLACES = [
    { id: A, name: 'אתר ניסיון א', active: true },
    { id: B, name: 'אתר ניסיון ב', active: true },
    { id: C, name: 'אתר ניסיון ג', active: true }];

function firstWindow(id, disk, cloud) {
    const device = makeDevice({ deviceId: id, sharedStorage: disk });
    device.Sync.pushDelayMs = TICK;
    device.setToday(DAY);
    device.ctx.askTell = () => Promise.resolve();
    device.ctx.askConfirm = () => Promise.resolve(false);
    device.State.date = DAY;
    device.State.schedule.workers = WORKERS.map(worker => Object.assign({}, worker));
    device.State.schedule.places = PLACES.map(place => Object.assign({}, place));
    device.State.save({ silent: true });
    if (cloud) device.Sync.connect(cloud.adapter);
    return device;
}

// A window of the app opening on a disk that already holds a record - what js/app.js
// does at boot. Nothing is seeded; everything comes off the disk.
function window2(id, disk, cloud) {
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

// THE ONLY QUESTION THAT COUNTS: open the app again and read the man's day.
const afterReopen = (disk, worker, id) => sitesOn(window2(id, disk), worker);

const holdKeys = disk => Object.keys(disk).filter(key => key.indexOf('farkad:hold:') === 0);

// ===================================================================== F4 · the writers
{
    suite('F4 · two windows with the SAME deviceId do not lose each other\'s work');

    // One phone, one person, two windows of the app: the device id is identical, so
    // nothing can be told apart by who signed it.
    const disk = sharedStore();
    const one = firstWindow('d_same', disk);
    addTap(one, W1, A);
    const two = window2('d_same', disk);
    addTap(two, W2, C);
    given('both windows are on one disk and one device id',
        one.ctx.localStorage === two.ctx.localStorage, 'd_same, one disk');
    given('each window recorded its own man',
        sitesOnDisk(disk, W1) === A && sitesOnDisk(disk, W2) === C,
        `${sitesOnDisk(disk, W1)} / ${sitesOnDisk(disk, W2)}`);

    removeTap(one, W1, A);
    addTap(one, W1, B);
    addTap(two, W2, A);

    check('the first man ends where the first window last put him',
        afterReopen(disk, W1, 'd_same_r1') === B, afterReopen(disk, W1, 'd_same_r2'));
    check('and the second man keeps what the second window recorded',
        afterReopen(disk, W2, 'd_same_r3').indexOf(C) !== -1,
        afterReopen(disk, W2, 'd_same_r4'));
}

{
    suite('F4 · two DIFFERENT windows, interleaved at the write, lose nothing');

    const disk = sharedStore();
    const one = firstWindow('d_i_one', disk);
    addTap(one, W1, A);
    const two = window2('d_i_two', disk);
    addTap(two, W2, C);

    // A real commit from window ONE entered in the middle of window TWO's write. In a
    // browser these are two threads; here one re-enters the other, which is the same
    // hazard with deterministic timing and no lock to hide behind.
    const Store2 = two.global('Store');
    const real = Store2.setVerified;
    let fired = false;
    const said = [];
    Store2.setVerified = function (key, value) {
        if (!fired && key === V2) {
            fired = true;
            said.push(removeTap(one, W1, A));
            said.push(addTap(one, W1, B));
        }
        return real.call(this, key, value);
    };
    addTap(two, W2, A);
    Store2.setVerified = real;

    given('the interleave happened', fired === true, String(fired));
    check('THE MAN\'S DAY AFTER A REOPEN IS WHAT THE LAST TAP LEFT',
        afterReopen(disk, W1, 'd_i_r1') === B,
        JSON.stringify({ said, disk: sitesOnDisk(disk, W1),
            reopen: afterReopen(disk, W1, 'd_i_r2') }));
    check('and the other man is not lost either',
        afterReopen(disk, W2, 'd_i_r3').indexOf(C) !== -1,
        afterReopen(disk, W2, 'd_i_r4'));
    check('no operation was dropped from the queue by the overwrite',
        one.Sync.pendingPaths().length + two.Sync.pendingPaths().length > 0,
        `${one.Sync.pendingPaths().length} + ${two.Sync.pendingPaths().length}`);
}

{
    suite('F4 · a window that dies mid-write leaves nothing holding the record');

    // There is no owner to expire any more - the lock is gone, and with it the question
    // of an owner coming back after a timeout. What must still hold is that a window
    // which stopped between its journal write and its schedule write has NOT taken the
    // record with it: the next window writes normally and the dead window's edit is
    // rebuilt from the journal.
    const disk = sharedStore();
    const one = firstWindow('d_dead', disk);
    addTap(one, W1, A);

    const Store1 = one.global('Store');
    const real = Store1.setVerified;
    Store1.setVerified = function (key, value) {
        if (key === V2) throw new Error('this window stopped here');
        return real.call(this, key, value);
    };
    let died = false;
    try { addTap(one, W1, B); } catch (error) { died = true; }
    Store1.setVerified = real;
    given('the window stopped inside its schedule write', died === true, String(died));

    // Another window opens and records somebody else. Nothing may be blocked, and the
    // dead window's journalled edit must still be there to rebuild.
    const two = window2('d_after_dead', disk);
    const ok = addTap(two, W2, C);
    check('the next window is not blocked by the one that died', ok === true, String(ok));
    check('and the dead window\'s edit is rebuilt from the journal at a reopen',
        afterReopen(disk, W1, 'd_dead_r1').indexOf(B) !== -1,
        afterReopen(disk, W1, 'd_dead_r2'));
    check('the other man is recorded too',
        afterReopen(disk, W2, 'd_dead_r3') === C, afterReopen(disk, W2, 'd_dead_r4'));
}

{
    suite('F4 · a full disk refuses the record and keeps the man recoverable');

    const disk = sharedStore();
    const one = firstWindow('d_quota', disk);
    addTap(one, W1, A);
    const before = sitesOnDisk(disk, W1);

    // The schedule key is refused for room, the way a full device refuses it. The
    // journal's own keys are smaller and still take, which is the whole reason the
    // journal is written first.
    one.setQuota((key) => key === V2);
    const answered = addTap(one, W1, B);
    one.setQuota(null);

    check('the record on the disk was not damaged by the refusal',
        sitesOnDisk(disk, W1) === before, `${before} -> ${sitesOnDisk(disk, W1)}`);
    check('the edit is not lost: the journal holds it and a reopen produces it',
        afterReopen(disk, W1, 'd_quota_r1').indexOf(B) !== -1,
        JSON.stringify({ answered, reopen: afterReopen(disk, W1, 'd_quota_r2') }));
}

{
    suite('F4 · a window on an older build writes the record without validating');

    // An older build has no verdict and no re-read: it writes its whole schedule from
    // memory. That window cannot be made to validate retroactively, so what is measured
    // is the other half of the guarantee - the current build's committed edits survive
    // it, because the journal keeps them and the collector will not drop an operation
    // the record does not hold.
    const disk = sharedStore();
    const one = firstWindow('d_newbuild', disk);
    addTap(one, W1, A);
    const stale = disk[V2];                       // the record before the move
    removeTap(one, W1, A);
    addTap(one, W1, B);
    given('the current build moved him', sitesOnDisk(disk, W1) === B, sitesOnDisk(disk, W1));

    // The older window writes its copy straight over the key. No validation, no lock.
    disk[V2] = stale;
    check('the record on the disk is the old build\'s copy, as it would be',
        sitesOnDisk(disk, W1) === A, sitesOnDisk(disk, W1));
    check('AND A REOPEN STILL PRODUCES THE MOVE, out of the journal',
        afterReopen(disk, W1, 'd_newbuild_r1') === B,
        afterReopen(disk, W1, 'd_newbuild_r2'));
}

{
    suite('F4 · a roster save and a day edit at the same time keep both');

    const disk = sharedStore();
    const one = firstWindow('d_roster', disk);
    addTap(one, W1, A);
    const two = window2('d_roster_two', disk);

    // The roster write from one window, entered in the middle of the other's day write.
    const Store2 = two.global('Store');
    const real = Store2.setVerified;
    let fired = false;
    Store2.setVerified = function (key, value) {
        if (!fired && key === V2) {
            fired = true;
            const worker = one.State.schedule.workers.find(item => item.id === W2);
            worker.name = 'עובד ניסיון ב - שם חדש';
            one.State.commitRoster();
        }
        return real.call(this, key, value);
    };
    addTap(two, W1, B);
    Store2.setVerified = real;
    given('the roster save and the day edit overlapped', fired === true, String(fired));

    const reopened = window2('d_roster_r1', disk);
    const named = (reopened.State.schedule.workers.find(item => item.id === W2) || {}).name;
    check('the rename is there after a reopen', named === 'עובד ניסיון ב - שם חדש', String(named));
    check('and the day edit is there too',
        sitesOn(reopened, W1).indexOf(B) !== -1, sitesOn(reopened, W1));
    check('the first site was not resurrected by the roster write',
        sitesOn(reopened, W1).indexOf(A) === -1 || sitesOn(reopened, W1) === [A, B].sort().join('+'),
        sitesOn(reopened, W1));
}

{
    suite('F4 · an edit is not refused by a claim nobody is honouring');

    // The lock that used to stand here was a key in localStorage holding a token. A
    // window that died between taking it and releasing it left that token behind, and
    // for as long as it looked fresh every OTHER window's edit was refused - recording
    // stopped for a reason no one could see, and the edit never reached the record.
    // There is no such key any more, and nothing may consult one: a value left under it
    // by v162 is inert. It is written here on purpose, to prove that.
    const disk = sharedStore();
    const one = firstWindow('d_claim', disk);
    addTap(one, W1, A);
    disk['farkad:writeLock'] = JSON.stringify({ token: 'some_other_window:9', at: Date.now() });

    const answered = addTap(one, W1, B);
    check('the edit is not refused by a leftover claim', answered === true, String(answered));
    check('AND THE MAN\'S DAY AFTER A REOPEN HAS IT',
        afterReopen(disk, W1, 'd_claim_r1').indexOf(B) !== -1,
        afterReopen(disk, W1, 'd_claim_r2'));
    check('the leftover bytes were not deleted either - nothing is removed this round',
        typeof disk['farkad:writeLock'] === 'string', String(typeof disk['farkad:writeLock']));
}

// ================================================================ F3 · the durable hold
{
    suite('F3 · a conflict is still held after the app is opened again');

    const disk = sharedStore();
    const one = firstWindow('d_hold_one', disk);
    addTap(one, W1, A);
    addTap(one, W1, B);                       // two sites: allowed, and the point
    const two = window2('d_hold_two', disk);
    given('the second window sees both sites',
        sitesOn(two, W1) === [A, B].sort().join('+'), sitesOn(two, W1));

    // One window removes a site deliberately; the other edits the same worker-day.
    removeTap(one, W1, B);
    const answered = removeTap(two, W1, A);

    given('the stale window was told its edit did not reach the record',
        answered === false, String(answered));
    check('the conflict was written down, not kept in memory',
        holdKeys(disk).length === 1, JSON.stringify(holdKeys(disk)));

    const readHold = () => {
        const key = holdKeys(disk)[0];
        try { return JSON.parse(disk[key]); } catch (error) { return {}; }
    };
    const record = readHold();
    check('it names the operation it is about',
        typeof record.opId === 'string' && record.opId.length > 0, String(record.opId));
    check('and keeps the THREE sides apart: what was seen, what is mine, what the disk had',
        Object.prototype.hasOwnProperty.call(record, 'seen')
        && Object.prototype.hasOwnProperty.call(record, 'mine')
        && Object.prototype.hasOwnProperty.call(record, 'disk'),
        JSON.stringify(Object.keys(record)));
    check('the two sides are not the same value',
        JSON.stringify(record.mine) !== JSON.stringify(record.disk),
        JSON.stringify({ mine: record.mine, disk: record.disk }));

    // THE REOPEN.
    const fresh = window2('d_hold_reopen', disk);
    check('the hold is still there after the reopen',
        holdKeys(disk).length === 1, JSON.stringify(holdKeys(disk)));
    check('the reopened window shows the conflict with both sides',
        fresh.Sync.heldRecords().some(row => row.durable === true
            && Object.prototype.hasOwnProperty.call(row, 'seen')
            && Object.prototype.hasOwnProperty.call(row, 'disk')),
        JSON.stringify(fresh.Sync.heldRecords().map(row =>
            ({ path: row.path, durable: row.durable }))));
    check('neither side was deleted',
        holdKeys(disk).length === 1 && fresh.Sync.pendingPaths().length > 0,
        JSON.stringify({ holds: holdKeys(disk).length,
            pending: fresh.Sync.pendingPaths() }));
    check('and the record still holds the other window\'s answer',
        sitesOn(fresh, W1) === A, sitesOn(fresh, W1));
}

{
    suite('F3 · a held operation is not sent after the app is opened again');

    const disk = sharedStore();
    const one = firstWindow('d_send_one', disk);
    addTap(one, W1, A);
    addTap(one, W1, B);
    const two = window2('d_send_two', disk);
    removeTap(one, W1, B);
    removeTap(two, W1, A);
    // A check rather than a precondition: on a build where the hold is not durable there
    // IS no held conflict, and that absence is the finding - it must be reported, not
    // allowed to stop the run before the rest of the evidence is gathered.
    check('the conflict was written down before the app was closed',
        holdKeys(disk).length === 1, JSON.stringify(holdKeys(disk)));

    // The app is opened again, this time with a cloud to send to.
    const cloud = makeCloud();
    const fresh = window2('d_send_reopen', disk, cloud);
    await settle(TICK * 10);
    await settleUntil(() => cloud.doc !== null, 4000);
    await settle(TICK * 40);

    const inCloud = ((((cloud.doc || {}).days || {})[DAY] || {}).actual || {})[W1];
    const cloudSites = (((inCloud || {}).entries) || [])
        .map(entry => entry.placeId).sort().join('+') || '-';
    check('the operation nobody answered was NOT sent',
        cloudSites !== B, `the cloud says ${cloudSites}`);
    check('and it is still held rather than retired',
        holdKeys(disk).length === 1, JSON.stringify(holdKeys(disk)));
    check('a person can release it, and only a person',
        (() => {
            const key = holdKeys(disk)[0];
            let opId = null;
            try { opId = JSON.parse(disk[key] || '{}').opId; } catch (error) { opId = null; }
            // typeof, because a build without the repair has no such door at all, and
            // a probe must indict that build rather than throw on it.
            return typeof fresh.Sync.releaseHold === 'function'
                && fresh.Sync.releaseHold(opId) === true;
        })(),
        JSON.stringify(holdKeys(disk)));
}

{
    suite('F3 · removing one site and adding another, from a window that is behind');

    const disk = sharedStore();
    const one = firstWindow('d_swap_one', disk);
    addTap(one, W1, A);
    const two = window2('d_swap_two', disk);

    // The first window moves him; the second, which still believes he is at A, tries the
    // same kind of move to a different site.
    removeTap(one, W1, A);
    addTap(one, W1, B);
    removeTap(two, W1, A);
    const added = addTap(two, W1, C);

    check('the deliberate move is what the record holds',
        afterReopen(disk, W1, 'd_swap_r1') === B,
        JSON.stringify({ added, reopen: afterReopen(disk, W1, 'd_swap_r2') }));
    check('the site the first window removed was not resurrected',
        afterReopen(disk, W1, 'd_swap_r3').indexOf(A) === -1,
        afterReopen(disk, W1, 'd_swap_r4'));
}

// ===================================================================== F5 · the revision
{
    suite('F5 · the adopted revision is not forgotten when the app is opened again');

    const cloud = makeCloud();
    const disk = sharedStore();
    const one = firstWindow('d_rev_one', disk, cloud);
    await settle(TICK * 10);
    addTap(one, W1, A);
    await settleUntil(() => one.Sync.pendingCount() === 0, 8000);
    removeTap(one, W1, A);
    addTap(one, W1, B);
    await settleUntil(() => one.Sync.pendingCount() === 0, 8000);
    given('the device adopted a revision and holds the move',
        Number.isInteger(cloud.doc.revision) && sitesOn(one, W1) === B,
        `revision ${cloud.doc.revision} / ${sitesOn(one, W1)}`);
    check('the revision was written down where a reopen can find it',
        Number.isInteger(Number(disk['farkad:revision'])), String(disk['farkad:revision']));

    // THE LEGACY DOCUMENT IS THE FIRST THING THE REOPENED WINDOW SEES.
    //
    // Delivered after a live snapshot it proves nothing: that snapshot carries a
    // revision, the session learns it, and the guard then holds on memory alone. The
    // case the persisted revision exists for is the one where the only document in
    // front of a freshly opened window has no revision at all - a phone that never
    // reached the protocol writing while this one was closed.
    const legacy = JSON.parse(JSON.stringify(cloud.doc));
    delete legacy.revision;
    delete legacy.protocol;
    legacy.updatedBy = 'd_old_phone';
    legacy.days[DAY].actual[W1] = { entries: [{ placeId: A }],
        rates: { daily: 400, hourly: 0 } };
    cloud.doc = JSON.parse(JSON.stringify(legacy));
    const fresh = window2('d_rev_reopen', disk, cloud);
    await settle(TICK * 40);

    check('THE REOPENED DEVICE DOES NOT GO BACK to the old site',
        sitesOn(fresh, W1) === B, sitesOn(fresh, W1));
    check('and the record on the disk did not either',
        sitesOnDisk(disk, W1) === B, sitesOnDisk(disk, W1));
}

{
    suite('F5 · a device that has never seen a revision still adopts a legacy document');

    // The transition this guard must not cut off: a project that has not been through
    // the cutover, and a device with nothing stored under the revision key.
    const legacyDoc = {
        workers: WORKERS.map(worker => Object.assign({}, worker)),
        places: PLACES.map(place => Object.assign({}, place)),
        days: { [DAY]: { plan: {}, actual: { [W1]: { entries: [{ placeId: C }],
            rates: { daily: 400, hourly: 0 } } } } },
        advances: {}, updatedAt: '2026-09-15T08:00:00.000Z', updatedBy: 'd_pre_protocol' };
    const cloud = makeCloud({ doc: legacyDoc });
    const disk = sharedStore();
    const device = firstWindow('d_rev_legacy', disk, cloud);
    await settle(TICK * 30);
    given('nothing is stored under the revision key',
        disk['farkad:revision'] === undefined || disk['farkad:revision'] === null,
        String(disk['farkad:revision']));
    check('the legacy document is adopted', sitesOn(device, W1) === C, sitesOn(device, W1));
}

report();
