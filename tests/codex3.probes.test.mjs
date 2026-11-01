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

// THE SAME, WITH A CREW. The kept ring's byte cap is a quarter of the record, so on the
// two-man roster above it holds exactly one entry - which is the floor, and enough for
// the recovery suites but not enough to prove that a refusal spends NOTHING of a ring
// that has several things in it. A dozen men and eight sites is an ordinary crew and
// raises the cap to several entries.
function crewed(id, disk, cloud) {
    const device = bare(id, disk);
    device.State.schedule.workers = Array.from({ length: 12 }, (ignored, i) => ({
        id: `w_crew_${i}`, name: `עובד ניסיון מספר ${i}`, active: true,
        dailyRate: 400 + i, hourlyRate: 0 }));
    device.State.schedule.places = Array.from({ length: 8 }, (ignored, i) => ({
        id: `p_crew_${i}`, name: `אתר ניסיון מספר ${i}`, active: true }));
    device.State.schedule.workers.push(...WORKERS.map(worker => Object.assign({}, worker)));
    device.State.schedule.places.push(...PLACES.map(place => Object.assign({}, place)));
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

// THE RING, ASKED OF A BUILD THAT MAY NOT HAVE ONE. A red baseline has to be a count, not
// a stack trace: a suite that throws on the old build stops measuring the checks after it,
// and the number it reports is then about where it died rather than about the guarantee.
const ring = device => (typeof device.Sync.keptEntries === 'function'
    ? device.Sync.keptEntries() : []);
const ringBytes = device => (typeof device.Sync.keptBytes === 'function'
    ? device.Sync.keptBytes() : 0);
const ringCap = device => (typeof device.Sync.keptBudget === 'function'
    ? device.Sync.keptBudget() : 0);
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
    check('and the other window attempted no write for the held path',
        sky.writes.filter(write => !write.replayed).length === before,
        `${before} -> ${sky.writes.filter(write => !write.replayed).length}`);
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

    // A QUOTA ERROR, not a throw. The harness reads a throw from setItem as "this browser
    // has no storage at all" and takes the whole Store down, which is a different fault
    // and not the one under test: here the disk works and has no room for the one small
    // record that says an edit is withheld. Both the mark and the descriptive pair are
    // refused, which is every durable trace of the hold.
    const two = opened('d3_two', disk);
    two.setQuota(key => String(key).indexOf(':hold:') !== -1);

    removeTap(one, W1, A);
    addTap(one, W1, B);
    await settle(TICK * 10);

    removeTap(two, W1, A);
    addTap(two, W1, C);
    given('no durable trace of the hold reached the disk',
        holdKeys(disk).length === 0, String(holdKeys(disk).length));

    // The window that noticed is still connected and still flushing, and a snapshot is
    // still arriving. BOTH HALVES have to stay withheld: a two-site move is an unassign
    // and an assign, and holding the second while letting the first go is not holding the
    // edit - it empties the man's day. The first draft of this check asked `!== C` and
    // passed on '-', which is exactly that escape going unnoticed.
    two.Sync.connect(sky.adapter);
    await settle(TICK * 20);
    two.Sync.flush();
    await settle(TICK * 40);
    check('THE UNDECIDED VALUE STILL DID NOT REACH THE CLOUD',
        cloudSites(sky, W1) === B, cloudSites(sky, W1));
    check('and the record still holds the other window\'s answer',
        sitesOnDisk(disk, W1) === B, sitesOnDisk(disk, W1));
    check('and nothing was discarded: the undecided edit is still owed',
        two.Sync.pendingCount() > 0, String(two.Sync.pendingCount()));
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
    // THE VALUE THE PERSON CHOSE, read off the row they were shown rather than guessed
    // at. The first draft of this check expected C alone; what the panel offered was
    // A+C, because the refused removal had been rolled back before the second tap - so
    // the check was asserting a value nobody was ever shown. The guarantee is that the
    // reopen produces what the row said `mine` was.
    const chose = ((row && row.mine && row.mine.entries) || [])
        .map(entry => entry.placeId).sort().join('+') || '-';
    check('so a reopen produces the value the person chose',
        afterReopen(disk, W1, 'd4_r1') === chose,
        `${afterReopen(disk, W1, 'd4_r2')} wanted ${chose} (disk ${sitesOnDisk(disk, W1)})`);
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
    // ============================ D5 IS AN OPEN ITEM, NOT A CLOSED DEFECT ==============
    //
    // What these two suites measure is NOT the whole of what the contract's G2 promised.
    // G2 said a confirmed value stays reconstructible "including after the cloud has
    // acknowledged it and the collector has taken it off the queue", and §5 item 6 named
    // a shadow copy of the record as the mechanism. There is no shadow copy in this
    // build - it cost one permanent copy of the record and the capacity model has two
    // agreed behaviours it cannot coexist with, measured in features/stale-window/
    // contract.md §5a.
    //
    // So the guarantee these suites DO establish, said plainly so that a green run cannot
    // be mistaken for the promise:
    //
    //   - the regression is detected and named, on any device;
    //   - the stale bytes are never overwritten by a repair;
    //   - a device that never had a cloud recovers from the device alone, offline, because
    //     it never collects anything (D5b measures that, not assumes it);
    //   - a device that has a cloud recovers from the cloud, which is a network.
    //
    // AND THE BOUND, which the owner chose knowingly: a bounded local ring of the last
    // N = 32 collected field paths, NOT an unlimited G2. D5c measures the recovery it
    // buys - offline, device alone, after acknowledgement and collection - and D5d
    // measures where it stops. Past 32 the recovery is the cloud, and on a device that
    // has permanently lost its cloud those older fields are not recoverable locally.
    // That residual is the decision, written down in §5a, and nothing below hides it.
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
    check('and the stale bytes are left where they are, not overwritten by a repair',
        sitesOnDisk(disk, W1) === '-', sitesOnDisk(disk, W1));

    // THE WAY BACK, and which one it is depends on whether the collector could have run.
    //
    // The first draft of this suite asked for the day back "from the device alone" after
    // a collection, and that asked for a second local copy of the record. Measured, that
    // copy costs one of two capacity guarantees whichever way it is accounted for - see
    // STAMP_KEY in js/state.js for the numbers - so what is kept is the stamp, and the
    // recovery is the one the collector's own gate already implies: an operation is only
    // ever taken off the queue once `op.sent` is true, which is to say once the CLOUD
    // holds it. Here it does, so hearing the cloud again brings the day back.
    const back = opened('d5_back', disk, sky);
    await settleUntil(() => sitesOn(back, W1) === A, 5000);
    check('the man\'s day comes back when the cloud is heard again',
        sitesOn(back, W1) === A, sitesOn(back, W1));
    check('and the record on the disk holds it again afterwards',
        sitesOnDisk(disk, W1) === A, sitesOnDisk(disk, W1));
}

{
    suite('D5b · with no cloud at all, the journal is the way back and keeps it');

    // THE DEVICE THAT HAS NO OTHER PATH, which is every phone until firebase-config.js is
    // filled in. The claim the suite above leans on is checked here rather than assumed:
    // the collector's gate is `op.sent && the disk holds it`, and a device that has never
    // had a cloud marks nothing sent - so it never collects, and the journal still holds
    // every edit when an older build writes the record away.
    const disk = sharedStore();
    const one = seeded('d5b_one', disk);
    addTap(one, W1, A);
    given('no cloud was ever configured', !one.Sync.adapter, String(Boolean(one.Sync.adapter)));
    given('and the disk holds the day', sitesOnDisk(disk, W1) === A, sitesOnDisk(disk, W1));
    one.Sync.collectQueueGarbage();
    check('THE COLLECTOR TAKES NOTHING, because nothing is acknowledged',
        one.Sync.pendingCount() > 0, String(one.Sync.pendingCount()));

    const stale = JSON.parse(disk[V2]);
    delete stale.days[DAY];
    stale.updatedAt = '2026-09-01T00:00:00.000Z';
    stale.updatedBy = 'd_old_build';
    one.putRaw(V2, JSON.stringify(stale));
    given('an older build has written the day away', sitesOnDisk(disk, W1) === '-',
        sitesOnDisk(disk, W1));

    // DETECTION IS NOT AVAILABLE HERE, and saying so is the honest answer rather than
    // asserting it. recordRegressed asks "does the record hold nothing where this device
    // has a CONFIRMED value", and the list of confirmed values is the ring - which on this
    // device is empty, because nothing is ever acknowledged and so nothing is ever
    // collected. With no list to compare against, a record that lost a day is
    // indistinguishable from another window having written it.
    //
    // The earlier version of this check passed only because detection was asked of
    // `updatedAt < stamp`, which is dead on the real path: every build stamps its write
    // with the current time, so an older build that is RUNNING carries a fresh stamp. The
    // check was green against a stamp the test had forced into the bytes by hand.
    //
    // WHAT IS GUARANTEED HERE IS THE DATA, not the notice, and it is the stronger half:
    // the journal holds every edit on a device that never collects, so the day comes back
    // whatever wrote over it. That is the check below, and it is unchanged.
    const asks = typeof one.State.recordRegressed === 'function';
    check('the device does not claim a detection it cannot make',
        asks && one.State.recordRegressed() === false,
        asks ? String(one.State.recordRegressed()) : 'no such question');
    check('AND THE MAN\'S DAY COMES BACK FROM THE DEVICE ALONE',
        afterReopen(disk, W1, 'd5b_r1') === A,
        `${afterReopen(disk, W1, 'd5b_r2')} (disk ${sitesOnDisk(disk, W1)})`);
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

// ====================== D5c · offline, from the device alone, after collection
{
    suite('D5c · a collected edit comes back OFFLINE, from the device alone');

    // THE CASE THE RING WAS APPROVED FOR, and the one the stamp alone could not answer.
    // The operation is acknowledged by the cloud AND collected, so the journal no longer
    // holds it; then the cloud is gone for good - the adapter is dropped, which is what a
    // deleted project or a revoked credential looks like from here - and an older build
    // writes the day away. No network, no cloud, no journal entry. The bounded ring is
    // the only thing left, and it is what puts the day back.
    //
    // N = 32 field paths; what is older than that is NOT recoverable locally, which D5d
    // measures rather than leaves implied.
    const sky = makeCloud();
    const disk = sharedStore();
    const one = seeded('d5c_one', disk, sky);
    await settle(TICK * 10);
    addTap(one, W1, A);
    await settleUntil(() => cloudSites(sky, W1) === A && one.Sync.pendingCount() === 0, 5000);
    one.Sync.collectQueueGarbage();
    given('the cloud acknowledged it and the collector took it',
        one.Sync.pendingCount() === 0
        && one.Sync.physicalOperations().every(op => op.path !== `days.${DAY}.actual.${W1}`),
        `${one.Sync.pendingCount()} / ${one.Sync.physicalOperations().length}`);
    check('and the device kept the field it collected',
        ring(one).some(entry => entry.path === `days.${DAY}.actual.${W1}`),
        JSON.stringify(ring(one).map(entry => entry.path)));

    const stale = JSON.parse(disk[V2]);
    delete stale.days[DAY];
    stale.updatedAt = '2026-09-01T00:00:00.000Z';
    stale.updatedBy = 'd_old_build';
    one.putRaw(V2, JSON.stringify(stale));
    given('an older build wrote the day away', sitesOnDisk(disk, W1) === '-',
        sitesOnDisk(disk, W1));

    // NO CLOUD AT ALL from here: the reopened window is given no adapter.
    const back = opened('d5c_back', disk);
    check('THE DAY COMES BACK WITH NO NETWORK AND NO JOURNAL ENTRY',
        sitesOn(back, W1) === A, sitesOn(back, W1));
    const named = Array.isArray(back.State.recovered) ? back.State.recovered : [];
    check('and the recovery names the field it put back, rather than claiming a rescue',
        named.indexOf(`days.${DAY}.actual.${W1}`) !== -1, JSON.stringify(named));
    check('and the stale bytes on the disk were not overwritten by the repair',
        sitesOnDisk(disk, W1) === '-', sitesOnDisk(disk, W1));
}

// ============================================ D5d · and what the bound does NOT cover
{
    suite('D5d · past N the ring holds nothing, and does not pretend to');

    // THE RESIDUAL, measured. 33 collected field paths; the oldest is gone, by its own
    // timestamp, and the newest 32 are there. A guarantee whose edge is not tested is a
    // guarantee nobody knows the shape of.
    const sky = makeCloud();
    const disk = sharedStore();
    const one = crewed('d5d_one', disk, sky);
    await settle(TICK * 10);
    // REAL DATES, and the first draft of this did not have them: 33 days from the 1st of
    // July walked off the end of the month into 2026-07-33, which the model refuses, so
    // the newest day was never recorded and the bound looked as though it kept the wrong
    // end. Thirty-one days of July and two of August.
    const days = [];
    for (let i = 0; i < 33; i += 1) {
        const day = i < 31
            ? `2026-07-${String(i + 1).padStart(2, '0')}`
            : `2026-08-${String(i - 30).padStart(2, '0')}`;
        days.push(day);
        one.State.date = day;
        one.State.commit(one.call('assignPlace', one.State.schedule, day, W1, 'actual', A, 'normal'));
        await settleUntil(() => one.Sync.pendingCount() === 0, 4000);
        one.Sync.collectQueueGarbage();
    }
    const kept = ring(one).map(entry => entry.path);
    given('all thirty-three days were recorded and collected',
        days.every(day => day.length === 10), String(days.length));
    // WHICHEVER BOUND BINDS, BINDS - and on a record this size it is the bytes, not the
    // count. A worker-day entry is about 440 bytes and the cap is a quarter of the
    // record, so the count of 32 only becomes the binding limit once the record passes
    // about 56 KB, which is a season. Both invariants are asserted, and which one bit is
    // reported rather than assumed.
    const bytes = ringBytes(one);
    const cap = ringCap(one);
    check('THE RING IS BOUNDED: inside its count AND inside its bytes',
        kept.length <= 32 && bytes <= cap,
        `${kept.length} entries, ${bytes} of ${cap} bytes - bound by ${bytes > cap - 440 ? 'bytes' : 'count'}`);
    check('and it is not empty: the floor keeps at least the newest field',
        kept.length >= 1, String(kept.length));
    check('the newest collected field is one of them',
        kept.indexOf(`days.${days[32]}.actual.${W1}`) !== -1,
        `${days[32]} | ${JSON.stringify(kept.slice(-3))}`);
    check('and the oldest is NOT - this is what past N means',
        kept.indexOf(`days.${days[0]}.actual.${W1}`) === -1,
        `${days[0]} still kept: ${kept.indexOf(`days.${days[0]}.actual.${W1}`) !== -1}`);
}

// ====== R4 · a hold the disk would not record is withheld from the REPLAYS too
{
    suite('R4 · an undecided edit is not laid back on the record by a replay');

    // THE OTHER TWO REPLAY PATHS. The snapshot path was taught to withhold a hold the
    // disk refused; replayDurableJournal and replayJournal were not, because they asked
    // `op.held` - which reads the very mark the disk would not take. So on that one device
    // the send was refused correctly and then a rollback put the undecided value straight
    // back onto the schedule, where the next write that DID land would carry it.
    const disk = sharedStore();
    const one = crewed('r4_one', disk);
    addTap(one, W1, A);
    const two = opened('r4_two', disk);
    removeTap(one, W1, A);
    addTap(one, W1, B);
    given('the record holds the other window\'s answer', sitesOnDisk(disk, W1) === B,
        sitesOnDisk(disk, W1));

    // The disk takes everything EXCEPT a record that says an edit is withheld.
    two.setQuota(key => String(key).indexOf(':hold:') !== -1);
    removeTap(two, W1, A);
    addTap(two, W1, C);
    given('no durable trace of the hold reached the disk',
        Object.keys(disk).every(key => key.indexOf(':hold:') === -1),
        String(Object.keys(disk).filter(key => key.indexOf(':hold:') !== -1).length));

    // A REPLAY, asked for directly: this is what a rollback and a boot both do.
    const replayed = two.call('emptySchedule');
    replayed.workers = two.State.schedule.workers;
    replayed.places = two.State.schedule.places;
    two.Sync.replayJournal(replayed);
    const onReplay = two.call('entriesFor', replayed, DAY, W1, 'actual')
        .map(entry => entry.placeId).sort().join('+') || '-';
    check('THE UNDECIDED VALUE IS NOT IN WHAT A REPLAY PRODUCES',
        onReplay.indexOf(C) === -1, onReplay);
    check('and the other window\'s answer is what the replay produces',
        onReplay === B, onReplay);
    check('the record on the disk is untouched by any of it',
        sitesOnDisk(disk, W1) === B, sitesOnDisk(disk, W1));
}

// ====== R5 · the rejected value can never be sent, crash or no crash
{
    suite('R5 · a value the person decided AGAINST is retired before anything is unbarred');

    // THE GAP. answerHold used to write the answer and then immediately take the mark
    // off, leaving the operation unheld and unsent until the caller committed. A crash in
    // that gap flushed `mine` - and when the person had chosen the other side, `mine` is
    // the value they had just rejected. Here nothing commits after the answer at all,
    // which is the crash, and the rejected value must still never go.
    const sky = makeCloud();
    const disk = sharedStore();
    const one = crewed('r5_one', disk, sky);
    await settle(TICK * 10);
    addTap(one, W1, A);
    await settleUntil(() => cloudSites(sky, W1) === A, 5000);

    const two = opened('r5_two', disk);
    removeTap(one, W1, A);
    addTap(one, W1, B);
    await settle(TICK * 10);
    removeTap(two, W1, A);
    addTap(two, W1, C);
    const row = two.Sync.heldRecords().find(item => item.path === `days.${DAY}.actual.${W1}`);
    given('the conflict is held and has a row', Boolean(row),
        JSON.stringify(two.Sync.heldRecords().map(item => item.path)));

    // The person chooses the OTHER side - and then the app dies: nothing commits.
    check('the decision is recorded', two.Sync.answerHold(row.opId, 'disk') === true,
        String(two.Sync.answerHold ? 'yes' : 'no'));
    const answer = two.Sync.holdAnswer(row.opId);
    check('and it is on the disk, naming the operation and the side',
        Boolean(answer) && answer.choice === 'disk' && answer.opId === row.opId,
        JSON.stringify(answer));

    // THE REOPEN, with no commit ever having happened, and a flush.
    const again = opened('r5_again', disk, sky);
    await settle(TICK * 10);
    again.Sync.flush();
    await settle(TICK * 40);
    check('THE REJECTED VALUE NEVER REACHED THE CLOUD',
        cloudSites(sky, W1).indexOf(C) === -1, cloudSites(sky, W1));
    check('the cloud still holds the side the person chose',
        cloudSites(sky, W1) === B, cloudSites(sky, W1));
    check('and no replay puts the rejected value on the screen either',
        sitesOn(again, W1).indexOf(C) === -1, sitesOn(again, W1));
}

// ====== R6 · a ring write the disk refused is written down, not shrugged off
{
    suite('R6 · a field the ring could not keep is reported, not silently unprotected');

    // The collector discarded keepConfirmed's answer and removed the operation anyway.
    // The operation leaving is right - the cloud has it - but the offline protection for
    // that field is gone, and a panel that keeps claiming the protection is claiming
    // something this device can no longer do.
    const sky = makeCloud();
    const disk = sharedStore();
    const one = crewed('r6_one', disk, sky);
    await settle(TICK * 10);
    one.setQuota(key => String(key).indexOf('farkad:kept:') === 0);
    addTap(one, W1, A);
    await settleUntil(() => cloudSites(sky, W1) === A && one.Sync.pendingCount() === 0, 5000);
    one.Sync.collectQueueGarbage();
    check('the ring could keep nothing', ring(one).length === 0,
        JSON.stringify(ring(one).map(entry => entry.path)));
    check('AND THE DEVICE SAYS THE RING HAS A HOLE IN IT',
        one.Sync.keptIncomplete() === true, String(one.Sync.keptIncomplete()));
    check('while the day itself is on the record, which is what the cloud answered about',
        sitesOnDisk(disk, W1) === A, sitesOnDisk(disk, W1));
}

// ================== R1 · the real path: an older build with a FRESH timestamp
{
    suite('R1 · the regression is caught when the older build stamps it NOW');

    // THE PATH THE FIELD ACTUALLY PRODUCES, and the one the first version of this
    // machinery missed completely. An older build writing its own stale memory is a
    // RUNNING program: `save` sets updatedAt to the current time, so its write is stamped
    // newer than anything this device confirmed. Detection by `updatedAt < stamp`
    // therefore answered false exactly when it mattered, and D5/D5c only passed because
    // they forced an old stamp into the bytes by hand.
    const sky = makeCloud();
    const disk = sharedStore();
    const one = crewed('r1_one', disk, sky);
    await settle(TICK * 10);
    addTap(one, W1, A);
    await settleUntil(() => cloudSites(sky, W1) === A && one.Sync.pendingCount() === 0, 5000);
    one.Sync.collectQueueGarbage();
    given('the field was acknowledged, collected, and kept',
        ring(one).some(entry => entry.path === `days.${DAY}.actual.${W1}`),
        JSON.stringify(ring(one).map(entry => entry.path)));

    const stale = JSON.parse(disk[V2]);
    delete stale.days[DAY];
    stale.updatedAt = new Date().toISOString();      // FRESH, as a running build writes
    stale.updatedBy = 'd_old_build';
    one.putRaw(V2, JSON.stringify(stale));
    given('the stale record is stamped NEWER than this device\'s confirmation',
        stale.updatedAt >= String(one.State.confirmedStamp()),
        `${stale.updatedAt} vs ${one.State.confirmedStamp()}`);

    const back = opened('r1_back', disk);
    check('THE LOSS IS STILL DETECTED, timestamp or no timestamp',
        back.State.recordRegressed() === true, String(back.State.recordRegressed()));
    check('and the day comes back, offline, from the device alone',
        sitesOn(back, W1) === A, sitesOn(back, W1));
}

// ========== R2 · and it does not overrule somebody else's newer decision
{
    suite('R2 · a correction from another phone is not reverted by the ring');

    // THE HAZARD THE ABSENCE RULE EXISTS FOR. If the trigger were "the record differs
    // from what I confirmed", every value another phone corrected would look like a loss,
    // and this device would put its own older copy back over a decision somebody else
    // made - the exact fault this whole round is about, committed by the repair instead
    // of by the bug. Absence cannot be confused that way: a corrected field HAS something
    // in it.
    const sky = makeCloud();
    const disk = sharedStore();
    const one = crewed('r2_one', disk, sky);
    await settle(TICK * 10);
    addTap(one, W1, A);
    await settleUntil(() => cloudSites(sky, W1) === A && one.Sync.pendingCount() === 0, 5000);
    one.Sync.collectQueueGarbage();
    given('the ring holds this device\'s confirmed value',
        ring(one).some(entry => entry.path === `days.${DAY}.actual.${W1}`),
        JSON.stringify(ring(one).map(entry => entry.path)));

    const moved = JSON.parse(disk[V2]);
    moved.days[DAY].actual[W1] = { entries: [{ placeId: B }],
        rates: { daily: 400, hourly: 0 } };
    moved.updatedAt = new Date().toISOString();
    moved.updatedBy = 'd_other_phone';
    one.putRaw(V2, JSON.stringify(moved));

    const back = opened('r2_back', disk);
    check('this is NOT read as a loss: something is there',
        back.State.recordRegressed() === false, String(back.State.recordRegressed()));
    check('AND THE OTHER PHONE\'S CORRECTION STANDS',
        sitesOn(back, W1) === B, sitesOn(back, W1));
    check('the ring put nothing back',
        (Array.isArray(back.State.recovered) ? back.State.recovered : []).length === 0,
        JSON.stringify(back.State.recovered));
}

// ========== R3 · and it does not resurrect a day somebody cleared on purpose
{
    suite('R3 · a day the person cleared is not brought back by the ring');

    // The other half of the same hazard. A cleared day is absence - which is what the
    // ring's trigger looks for - so the clearing has to be confirmed in the ring too, or
    // the repair would undo somebody's deliberate deletion at every reopen.
    const sky = makeCloud();
    const disk = sharedStore();
    const one = crewed('r3_one', disk, sky);
    await settle(TICK * 10);
    addTap(one, W1, A);
    await settleUntil(() => one.Sync.pendingCount() === 0, 5000);
    one.Sync.collectQueueGarbage();
    removeTap(one, W1, A);
    await settleUntil(() => one.Sync.pendingCount() === 0, 5000);
    one.Sync.collectQueueGarbage();
    given('the day is empty and the clearing was confirmed too',
        sitesOnDisk(disk, W1) === '-', sitesOnDisk(disk, W1));

    const back = opened('r3_back', disk);
    check('THE CLEARED DAY STAYS CLEARED',
        sitesOn(back, W1) === '-', sitesOn(back, W1));
    check('and nothing was reported as lost',
        back.State.recordRegressed() === false, String(back.State.recordRegressed()));
}

// ================= the refusal on a full device, WITH A RING THAT IS NOT EMPTY
{
    suite('a full device refuses the write and spends no ring entry to do it');

    // AN EMPTY RING PROVES NOTHING, and the first draft of this suite had one - the
    // device had never synced, so nothing was ever collected and there was no insurance
    // on the disk for the ladder to have sold. Asked properly: a device that HAS synced,
    // whose ring holds real entries, then runs out of room.
    //
    // The guarantee is the one tests/capacity.test.mjs owns in full and that the
    // whole-record copy this replaced broke: a device with no restore points and not a
    // byte to spare refuses the edit and moves nothing. The ladder's currency is restore
    // points; the ring is not currency.
    const sky = makeCloud();
    const disk = sharedStore();
    const one = crewed('dcap_one', disk, sky);
    await settle(TICK * 10);
    addTap(one, W1, A);
    await settleUntil(() => one.Sync.pendingCount() === 0, 5000);
    one.Sync.collectQueueGarbage();
    one.State.date = '2026-09-16';
    one.State.commit(one.call('assignPlace', one.State.schedule, '2026-09-16', W2, 'actual', B, 'normal'));
    await settleUntil(() => one.Sync.pendingCount() === 0, 5000);
    one.Sync.collectQueueGarbage();
    const ringBefore = ring(one).map(entry => entry.path).sort();
    given('THE RING IS NOT EMPTY: this device has synced and collected several fields',
        ringBefore.length >= 2, JSON.stringify(ringBefore));
    given('and it holds no restore point the ladder could sell',
        Object.keys(one.dump()).every(key => key.indexOf('scheduleData:snap:') !== 0),
        String(Object.keys(one.dump()).filter(key => key.indexOf('scheduleData:snap:') === 0).length));

    const before = JSON.stringify(one.dump());
    const ringBytesBefore = ringBytes(one);
    one.setQuota(() => true);
    one.State.date = DAY;
    const wrote = addTap(one, W1, C);

    check('the edit is refused rather than claimed', wrote === false, String(wrote));
    check('AND NOT ONE BYTE OF THE DEVICE MOVED',
        JSON.stringify(one.dump()) === before,
        `${Object.keys(JSON.parse(before)).length} keys before, ${Object.keys(one.dump()).length} after`);
    check('the ring was not sold to pay for it: every entry is still there',
        JSON.stringify(ring(one).map(entry => entry.path).sort()) === JSON.stringify(ringBefore),
        JSON.stringify(ring(one).map(entry => entry.path).sort()));
    check('and the ring is the same size, to the byte',
        ringBytes(one) === ringBytesBefore,
        `${ringBytesBefore} -> ${ringBytes(one)}`);
}

// ============================================== the byte cap, and a value too large
{
    suite('the ring is capped in BYTES as well as in count');

    // MEASURED, because a count alone is not a byte limit: a count-only ring of 32 came
    // to 17,520 bytes against a 5,786-byte record on a realistic crew - three times the
    // record it insured - because its biggest entries were whole-roster paths that grow
    // with the crew. The cap is a quarter of the record with a 32 KB ceiling, and only
    // the families where a queued value replaces what is there are kept at all.
    const sky = makeCloud();
    const disk = sharedStore();
    const one = crewed('dcap2_one', disk, sky);
    await settle(TICK * 10);
    const cap = ringCap(one);
    given('the cap is a quarter of the record, not a fixed number',
        cap === Math.min(32 * 1024, Math.floor((one.State.durableText.length * 2) / 4)),
        `${cap} of ${one.State.durableText.length * 2}`);

    // A season of days, every one acknowledged and collected.
    for (let i = 0; i < 20; i += 1) {
        const day = `2026-07-${String(i + 1).padStart(2, '0')}`;
        one.State.date = day;
        one.State.commit(one.call('assignPlace', one.State.schedule, day, W1, 'actual', A, 'normal'));
        await settleUntil(() => one.Sync.pendingCount() === 0, 4000);
        one.Sync.collectQueueGarbage();
    }
    check('THE RING STAYS INSIDE ITS BYTE CAP',
        ringBytes(one) <= ringCap(one),
        `${ringBytes(one)} of ${ringCap(one)}`);
    check('and inside its count',
        ring(one).length <= 32, String(ring(one).length));
    check('a whole-roster path is not kept at all - it merges per id and costs the most',
        ring(one).every(entry => entry.path.indexOf('workers') !== 0
            && entry.path.indexOf('places') !== 0
            && entry.path.indexOf('roster.workerOrder') !== 0),
        JSON.stringify(ring(one).map(entry => entry.path).slice(0, 4)));

    // A SINGLE VALUE BIGGER THAN THE WHOLE CAP is not kept by evicting everything else.
    const held = ring(one).length;
    const huge = { entries: Array.from({ length: 400 }, () => ({ placeId: A })),
        rates: { daily: 400, hourly: 0 } };
    if (typeof one.Sync.keepConfirmed === 'function') {
        one.Sync.keepConfirmed({ path: `days.2026-06-01.actual.${W1}`, value: huge,
            sent: true, seq: 99999, slot: 'farkad:outbox', opId: 'op_huge' });
    }
    check('a value larger than the cap is refused, and evicts nothing',
        ring(one).length === held
        && ring(one).every(entry => entry.path !== `days.2026-06-01.actual.${W1}`),
        `${held} -> ${ring(one).length}`);
    check('and the ring is still inside its cap afterwards',
        ringBytes(one) <= ringCap(one),
        `${ringBytes(one)} of ${ringCap(one)}`);
}

report();
