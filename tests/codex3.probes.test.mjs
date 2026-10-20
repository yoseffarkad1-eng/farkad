// The THIRD independent Codex review of 9c98399: D1-D6, each from the contract.
//
//   node tests/codex3.probes.test.mjs
//
// WHAT EVERY CHECK ASKS, as in codex2.probes: not whether a call returned true, but what
// the record says when the app is opened again, and what reached the cloud. See
// features/stale-window/contract.md for the design these six measure.
//
// SYNTHETIC ONLY: invented men with fixed ids, invented sites, one invented day. No real
// record, no network, no live project. Nothing is deleted or zeroed.

import { makeDevice, makeCloud, sharedStore, settle, settleUntil } from './harness.mjs';
import { suite, check, given, report } from './runner.mjs';

const TICK = 6;
const DAY = '2026-09-15';
const W1 = 'w_c3_01';
const W2 = 'w_c3_02';
const A = 'p_c3_a';
const B = 'p_c3_b';
const C = 'p_c3_c';
const V2 = 'scheduleData:v2';
const REV = 'farkad:revision';

const WORKERS = [
    { id: W1, name: 'עובד ניסיון א', active: true, dailyRate: 400, hourlyRate: 0 },
    { id: W2, name: 'עובד ניסיון ב', active: true, dailyRate: 450, hourlyRate: 0 }];
const PLACES = [
    { id: A, name: 'אתר ניסיון א', active: true },
    { id: B, name: 'אתר ניסיון ב', active: true },
    { id: C, name: 'אתר ניסיון ג', active: true }];

function bare(id, disk, cloud) {
    const device = makeDevice({ deviceId: id, sharedStorage: disk });
    device.Sync.pushDelayMs = TICK;
    device.setToday(DAY);
    device.ctx.askTell = () => Promise.resolve();
    device.ctx.askConfirm = () => Promise.resolve(true);
    device.State.date = DAY;
    if (cloud) device.Sync.connect(cloud.adapter);
    return device;
}

// A window that seeds the roster and writes it: the first window of a new project.
function seeded(id, disk, cloud) {
    const device = bare(id, disk);
    device.State.schedule.workers = WORKERS.map(worker => Object.assign({}, worker));
    device.State.schedule.places = PLACES.map(place => Object.assign({}, place));
    device.State.save({ silent: true });
    if (cloud) device.Sync.connect(cloud.adapter);
    return device;
}

// A window of the app opening on a disk that already holds a record - what js/app.js does.
function opened(id, disk, cloud) {
    const device = bare(id, disk);
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
const afterReopen = (disk, worker, id) => sitesOn(opened(id, disk), worker);

const holdKeys = disk => Object.keys(disk).filter(key => key.indexOf('farkad:hold:') === 0);
const cloudSites = (cloud, worker) => {
    const record = ((((cloud.doc || {}).days || {})[DAY] || {}).actual || {})[worker];
    return (((record || {}).entries) || []).map(entry => entry.placeId).sort().join('+') || '-';
};

// ================================================================= D1 · the base is lost
{
    suite('D1 · a window with no base of its own may not replace a record it has not read');

    // js/state.js:340 - `if (typeof this.durableText !== 'string') return 'clear';` - and
    // :491, the same answer in stillCurrent. A window that has never SUCCESSFULLY read or
    // written the record has no base, and "no base" is being read as "no conflict is
    // possible" instead of "I must not replace a record I have not read".
    //
    // Two windows of a new project, which is the ordinary way in: the second one is open
    // before the first record exists, so its durableText is null for as long as it never
    // saves. Everything the first window then records is erased by the second window's
    // first ordinary edit, with no hold, no refusal and nothing said.
    const disk = sharedStore();
    const late = bare('d1_late', disk);          // open on an EMPTY disk: no base at all
    given('the late window has no base of its own',
        typeof late.State.durableText !== 'string', String(late.State.durableText));

    const first = seeded('d1_first', disk);
    addTap(first, W1, A);
    addTap(first, W2, B);
    given('the first window recorded two men', sitesOnDisk(disk, W1) === A
        && sitesOnDisk(disk, W2) === B,
        `${sitesOnDisk(disk, W1)} / ${sitesOnDisk(disk, W2)}`);

    // One ordinary edit from the window that never read the record.
    late.State.schedule.workers = WORKERS.map(worker => Object.assign({}, worker));
    late.State.schedule.places = PLACES.map(place => Object.assign({}, place));
    addTap(late, W1, C);

    // THE RECORD ITSELF, not the journal that is holding it up. The journal does recover
    // the second man here, and that is worth nothing: the collector takes an operation
    // off the moment the cloud has it and the disk holds it, and after that the journal
    // is not there to recover anything. See D5, which is the same wound a minute later.
    check('THE SECOND MAN IS STILL IN THE RECORD, not only in the journal',
        sitesOnDisk(disk, W2) === B, sitesOnDisk(disk, W2));
    check('and the late window\'s own edit is on the man it was about',
        afterReopen(disk, W1, 'd1_r1') === C,
        `${afterReopen(disk, W1, 'd1_r2')} (disk ${sitesOnDisk(disk, W1)})`);
    check('and a reopen produces both men',
        afterReopen(disk, W2, 'd1_r3') === B,
        `${afterReopen(disk, W2, 'd1_r4')} (disk ${sitesOnDisk(disk, W2)})`);
}

// ====================================================== D2 · a hold another window wrote
{
    suite('D2 · a window does not send an operation another window is holding');

    // loadHolds runs once per session, behind loadOutbox's `if (this._loaded) return`
    // (js/sync/sync.js:1287). The queue beside it is re-read off the disk on EVERY call
    // (:1379). So a hold written by one window is invisible to the other, which flushes
    // and sends the operation nobody has answered.
    const sky = makeCloud();
    const disk = sharedStore();
    const one = seeded('d2_one', disk, sky);
    await settle(TICK * 10);
    addTap(one, W1, A);
    await settleUntil(() => cloudSites(sky, W1) === A, 4000);

    // NOT connected: a window that has HEARD the correction is not behind, and holds
    // nothing. The second window of one app on one phone, with its own listener idle.
    const two = opened('d2_two', disk);
    given('both windows are open on one disk, and the cloud has the day',
        cloudSites(sky, W1) === A, cloudSites(sky, W1));

    // Window TWO goes behind: window ONE corrects the day and writes it.
    removeTap(one, W1, A);
    addTap(one, W1, B);
    await settle(TICK * 10);

    // Window TWO now edits the same man's day from the record it last agreed with, which
    // is the two-window conflict holdHere exists for.
    removeTap(two, W1, A);
    addTap(two, W1, C);
    const held = holdKeys(disk);
    given('the conflict was written down on the shared disk', held.length > 0,
        String(held.length));

    // And window ONE flushes. It must not send what window TWO is holding.
    const before = sky.writes.filter(write => !write.replayed).length;
    one.Sync.flush();
    await settle(TICK * 40);
    // EXACTLY what the cloud holds, not "something other than C". The first version of
    // this check asked `!== C` and passed on "p_c3_a+p_c3_c" - the held value had reached
    // the cloud and the check said nothing, because the string was not equal to it.
    check('THE HELD VALUE DID NOT REACH THE CLOUD FROM THE OTHER WINDOW',
        cloudSites(sky, W1).indexOf(C) === -1, cloudSites(sky, W1));
    check('and what the cloud holds is the correction the other window made',
        cloudSites(sky, W1) === B, cloudSites(sky, W1));
    check('and the other window knows the path is held',
        one.Sync.isHeldHere(`days.${DAY}.actual.${W1}`) === true,
        String(one.Sync.isHeldHere(`days.${DAY}.actual.${W1}`)));
    given('writes attempted', true, `${before} -> ${sky.writes.filter(w => !w.replayed).length}`);
}

// ============================================== D3 · a hold that could not be written
{
    suite('D3 · a hold that cannot be written down bars the send anyway');

    // holdHere swallows the write failure on purpose, and _heldUnreadable records that a
    // hold record would not parse. Neither bars the send anywhere but in the memory of
    // the window that noticed, so a reopen sends the operation nobody decided about.
    const sky = makeCloud();
    const disk = sharedStore();
    const one = seeded('d3_one', disk, sky);
    await settle(TICK * 10);
    addTap(one, W1, A);
    await settleUntil(() => cloudSites(sky, W1) === A, 4000);

    const two = opened('d3_two', disk);
    two.failWrite(key => String(key).indexOf('farkad:hold:') === 0);

    removeTap(one, W1, A);
    addTap(one, W1, B);
    await settle(TICK * 10);

    removeTap(two, W1, A);
    addTap(two, W1, C);
    given('no readable hold reached the disk',
        holdKeys(disk).every(key => {
            try { return !JSON.parse(disk[key]); } catch (error) { return true; }
        }), String(holdKeys(disk).length));

    // The app is opened again, with no memory of the hold anywhere.
    const again = opened('d3_again', disk, sky);
    await settle(TICK * 10);
    again.Sync.flush();
    await settle(TICK * 40);
    // BOTH HALVES. A two-site move is an unassign and an assign, and holding the second
    // while letting the first go is not holding the edit: it empties the man's day. The
    // first version of this check asked `!== C` and passed on '-', which is the removal
    // having reached the cloud - the undecided edit escaping by its other half.
    check('THE UNDECIDED VALUE STILL DID NOT REACH THE CLOUD',
        cloudSites(sky, W1) === B, cloudSites(sky, W1));
    check('and the record still holds the other window\'s answer',
        sitesOnDisk(disk, W1) === B, sitesOnDisk(disk, W1));
    check('and nothing was discarded: the undecided edit is still owed',
        again.Sync.pendingCount() > 0, String(again.Sync.pendingCount()));
}

// ================================================ D4 · the decision, bound to the hold
{
    suite('D4 · a hold is released by the person\'s decision, and only by it');

    // FarkadSync.releaseHold has no caller anywhere in js/. resolveHeldRecord answers by
    // issuing a fresh operation and leaves the hold KEY on the disk for ever; isHeldHere
    // filters the replay BY PATH, so once a path's hold key exists, every later edit at
    // that path - the person's own decision included - is suppressed from the replay at
    // every reopen.
    const sky = makeCloud();
    const disk = sharedStore();
    const one = seeded('d4_one', disk, sky);
    await settle(TICK * 10);
    addTap(one, W1, A);
    await settleUntil(() => cloudSites(sky, W1) === A, 4000);

    const two = opened('d4_two', disk);
    removeTap(one, W1, A);
    addTap(one, W1, B);
    await settle(TICK * 10);
    removeTap(two, W1, A);
    addTap(two, W1, C);
    const keys = holdKeys(disk);
    given('a hold is on the disk', keys.length > 0, String(keys.length));

    // The person decides, in the window that is holding: keep mine.
    const rows = two.Sync.heldRecords();
    const row = rows.find(item => item.path === `days.${DAY}.actual.${W1}`);
    given('the panel has a row for it', Boolean(row), JSON.stringify(rows.map(r => r.path)));

    const answered = row && typeof two.Sync.answerHold === 'function'
        ? two.Sync.answerHold(row.opId, 'mine')
        : null;
    check('THE DECISION IS A DURABLE RECORD NAMING THE OPERATION',
        answered === true, String(answered));
    check('and the hold it answers is no longer holding the path',
        two.Sync.isHeldHere(`days.${DAY}.actual.${W1}`) === false,
        String(two.Sync.isHeldHere(`days.${DAY}.actual.${W1}`)));
    check('so a reopen produces the value the person chose',
        afterReopen(disk, W1, 'd4_r1') === C,
        `${afterReopen(disk, W1, 'd4_r2')} (disk ${sitesOnDisk(disk, W1)})`);
}

{
    suite('D4b · a two-window hold is answerable on a device with no cloud at all');

    // describeHeldRecord offers a decision only when `decidable: heard && readable`
    // (js/ui/settings.js:500). A two-window hold on a device where sync was never
    // configured has no cloud side at all, so it can never be answered - the record
    // diverges and there is no way out of it. v163 added the family; the interface
    // cannot resolve it.
    const disk = sharedStore();
    const one = seeded('d4b_one', disk);
    addTap(one, W1, A);
    const two = opened('d4b_two', disk);
    removeTap(one, W1, A);
    addTap(one, W1, B);
    removeTap(two, W1, A);
    addTap(two, W1, C);
    given('no cloud was ever configured', two.Sync.adapter === null
        || two.Sync.adapter === undefined, String(Boolean(two.Sync.adapter)));
    const keys = holdKeys(disk);
    given('and a hold is on the disk', keys.length > 0, String(keys.length));

    const rows = two.Sync.heldRecords();
    const row = rows.find(item => item.path === `days.${DAY}.actual.${W1}`);
    given('the panel has a row', Boolean(row), JSON.stringify(rows.map(r => r.path)));
    check('THE PERSON IS OFFERED A DECISION EVEN WITH NO CLOUD',
        Boolean(row) && row.answerable === true,
        JSON.stringify(row ? { heard: row.heard, answerable: row.answerable } : null));
    check('and taking their own value ends the hold',
        Boolean(row) && typeof two.Sync.answerHold === 'function'
            && two.Sync.answerHold(row.opId, 'mine') === true
            && two.Sync.isHeldHere(`days.${DAY}.actual.${W1}`) === false,
        String(typeof two.Sync.answerHold));
}

// ==================================== D5 · a way back after acknowledgement and collection
{
    suite('D5 · an edit survives an older build writing over it after it was collected');

    // The collector's gate is `op.sent && scheduleHoldsEntry(stored, op.path, op.value)`.
    // Once both are true the operation is removed, and the device holds no second copy.
    // An older build - code already on a phone, which cannot be given a new rule - then
    // writes its own stale memory over the blob, and on a device with no cloud configured
    // the edit is simply gone.
    const sky = makeCloud();
    const disk = sharedStore();
    const one = seeded('d5_one', disk, sky);
    await settle(TICK * 10);
    addTap(one, W1, A);
    await settleUntil(() => cloudSites(sky, W1) === A
        && one.Sync.pendingCount() === 0, 5000);
    given('the cloud has it and the queue is empty',
        cloudSites(sky, W1) === A && one.Sync.pendingCount() === 0,
        `${cloudSites(sky, W1)} / ${one.Sync.pendingCount()}`);
    given('and the disk holds it', sitesOnDisk(disk, W1) === A, sitesOnDisk(disk, W1));

    // AN OLDER BUILD. It writes the whole record out of its own memory, validating
    // nothing and moving no fence - which is precisely what a build that predates this
    // one does, and what no rule here can stop.
    const stale = JSON.parse(disk[V2]);
    delete stale.days[DAY];
    stale.updatedAt = '2026-09-01T00:00:00.000Z';
    stale.updatedBy = 'd_old_build';
    one.putRaw(V2, JSON.stringify(stale));
    given('an older build has written the day away', sitesOnDisk(disk, W1) === '-',
        sitesOnDisk(disk, W1));

    check('THE REGRESSION IS DETECTED RATHER THAN ACCEPTED',
        typeof one.State.recordRegressed === 'function'
            && one.State.recordRegressed() === true,
        String(typeof one.State.recordRegressed === 'function'
            ? one.State.recordRegressed() : 'no such question'));
    check('and the man\'s day comes back on the reopen, from the device alone',
        afterReopen(disk, W1, 'd5_r1') === A,
        `${afterReopen(disk, W1, 'd5_r2')} (disk ${sitesOnDisk(disk, W1)})`);
}

// ======================================================= D6 · the shared revision
{
    suite('D6 · the shared revision is never lowered by a window that is behind');

    // rememberRevision writes String(said) unconditionally and loadRevision caches for
    // the session behind _revisionLoaded. Window A reaches 9 and writes it; window B
    // loaded 7 when it opened and never re-reads; B adopts a snapshot at 8 and writes 8
    // OVER 9. Both functions are v163's own, and the server cannot be made to lower it -
    // firestore.rules:86 requires exactly one more - so the device key is the only place
    // this can go backwards.
    const disk = sharedStore();
    const one = seeded('d6_one', disk);
    const doc = seq => ({ revision: seq, protocol: 1, days: {}, workers: [], places: [],
        updatedAt: '2026-09-15T00:00:00.000Z', updatedBy: 'd6_cloud' });

    one.Sync.noteRevision(doc(7));
    given('the disk remembers 7', disk[REV] === '7', String(disk[REV]));

    const two = opened('d6_two', disk);
    two.Sync.loadRevision();
    given('the second window read 7 when it opened', two.Sync._revision === 7,
        String(two.Sync._revision));

    one.Sync.noteRevision(doc(9));
    given('the first window has taken the disk to 9', disk[REV] === '9', String(disk[REV]));

    // The behind window adopts a snapshot at 8. Legitimate for ITS memory; it must not
    // take the shared record backwards.
    two.Sync.noteRevision(doc(8));
    check('THE DISK WAS NOT TAKEN BACKWARDS',
        Number(disk[REV]) >= 9, String(disk[REV]));
    check('and a window opening now does not present itself as behind',
        opened('d6_r1', disk).Sync.loadRevision() >= 9,
        String(opened('d6_r2', disk).Sync.loadRevision()));
}

report();
