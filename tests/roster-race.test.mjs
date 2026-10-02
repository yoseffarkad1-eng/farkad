// O2, reproduced: a roster edit that puts another phone's rate change back.
//
//   node tests/roster-race.test.mjs
//
// The finding is in docs/data-safety-audit.md, section O2. B raises a man's day rate to
// 600 and it lands. A - the phone that came back from a stairwell with a roster edit
// queued - ends up showing 500, and A's next ordinary roster edit sends 500 to the cloud
// and to B. All three converge on the stale value, both phones say «מסונכרן», and no line
// on any screen says anything. Every number in this app is somebody's pay, so a rate that
// quietly walks backwards is the failure that matters, not a crash.
//
// The audit names one established mechanism and one it could not establish:
//
//   (a) the baseline is EMPTY. editRoster sends the entities that differ from the last
//       snapshot this device adopted, and that baseline (_remoteRoster, js/sync/sync.js)
//       lives in memory and starts empty on every app start - so a phone that edits the
//       roster before its first snapshot arrives sends EVERY entity, stale ones included.
//
//   (b) the baseline is PRESENT. The audit says the divergence still reproduces and that
//       the legacy whole array is NOT the carrier. This suite measures that claim from
//       both ends: it reproduces the divergence, and then it takes the legacy array out
//       of the run - twice, at the two different places it is handled - and shows what
//       happens with it gone. The counterfactual blocks are evidence about which line
//       carries the value, not a proposal; nothing in this file changes the app.
//
// The failing checks here are the bug. They are written to fail on HEAD and to print the
// actual rate on every device and the status each device is reporting while it is wrong,
// because "all three converge on the stale value while everything says synced" is the
// whole of the finding and a bare false says none of it.

import { makeDevice, makeCloud, settle, settleUntil } from './harness.mjs';
import { suite, check, given, report } from './runner.mjs';
import vm from 'node:vm';

// Real time, kept short - the sync layer debounces before it sends, so a test that does
// not wait past the debounce is testing the debounce.
const TICK = 6;
const wait = () => settle(TICK * 5);
const settled = () => settle(TICK * 30);

// Arbitrary code inside one device's V8 context. The counterfactual blocks below need to
// replace a function the app calls internally, which nothing on the device handle
// exposes; tests/labelcache.test.mjs reaches into a context the same way.
const run = (device, code) => vm.runInContext(code, device.ctx, { filename: 'harness:roster-race' });

// The two-device disk the audit describes: one man at 500, one site. Written by a third
// device so neither A nor B owns the stamp on it.
function baseDoc() {
    return {
        schemaVersion: 2,
        workers: [{ id: 'w_01', name: 'דוד', active: true, dailyRate: 500, hourlyRate: 0 }],
        places: [{ id: 'p_01', name: 'הרצליה', active: true }],
        days: {}, advances: {},
        updatedAt: '2026-08-01T06:00:00.000Z', updatedBy: 'd_other'
    };
}

function rateIn(schedule) {
    const worker = (schedule.workers || []).find(item => item.id === 'w_01');
    return worker ? worker.dailyRate : null;
}

function siteNameIn(schedule) {
    const place = (schedule.places || []).find(item => item.id === 'p_01');
    return place ? place.name : null;
}

// The cloud document read the way the app reads it - through normaliseSchedule, which
// merges the per-entity map over the legacy whole array. Reading either form on its own
// would answer a question this suite is not asking.
function cloudSchedule(device, cloud) {
    return device.call('normaliseSchedule', cloud.doc);
}

// The one line every failing check below carries: what each device thinks the man is
// paid, and what each device is telling the person about its own state while it thinks it.
function where(a, b, cloud) {
    return `A=${rateIn(a.State.schedule)} B=${rateIn(b.State.schedule)} `
        + `cloud=${rateIn(cloudSchedule(a, cloud))} `
        + `· status A=${a.Sync.status} B=${b.Sync.status}`;
}

// THE FIELD PATHS THIS DEVICE ACTUALLY PUT ON THE WIRE, in order, envelope stripped.
// The whole question in (b) is which entry carries the stale rate, and the only honest
// way to answer it is to read what left the phone.
function wirePaths(cloud, deviceId) {
    const envelope = ['protocol', 'revision', 'lastOpId', 'opFingerprint',
        'updatedAt', 'updatedBy', 'schemaVersion'];
    return cloud.attempts
        .filter(attempt => {
            const payload = attempt.payload || {};
            const from = payload.updatedBy || (payload.data && payload.data.updatedBy);
            return from === deviceId;
        })
        .map(attempt => ({
            kind: attempt.kind,
            paths: Object.keys(attempt.payload || {}).filter(key => envelope.indexOf(key) === -1)
        }))
        .filter(entry => entry.paths.length > 0);
}

// One phone in a stairwell. cloud.online takes the WHOLE cloud down and disconnect() is
// the app signing out; an outage is this device's listener stopping and this device's
// writes being refused, with the other phone carrying on. Copied from the same helper in
// tests/data.test.mjs, deliberately - it is the only spelling of the situation O2 is about.
function offlineFor(cloud, deviceId) {
    cloud.reject = (kind, payload) => {
        const from = payload && (payload.updatedBy
            || (payload.data && payload.data.updatedBy));
        if (from !== deviceId) return null;
        const error = new Error('client is offline');
        error.code = 'unavailable';
        return error;
    };
}

async function unplugged(device, cloud) {
    const before = cloud.subscribers.length;
    device.Sync.pushDelayMs = TICK;
    device.Sync.connect(cloud.adapter);
    await wait();
    const mine = cloud.subscribers.slice(before);

    return {
        away() {
            cloud.subscribers = cloud.subscribers.filter(fn => !mine.includes(fn));
            offlineFor(cloud, device.id);
        },
        async back() {
            cloud.reject = null;
            mine.forEach(fn => cloud.subscribers.push(fn));
            // Firestore hands a subscriber the current document when it comes back.
            mine.forEach(fn => fn(JSON.parse(JSON.stringify(cloud.doc))));
            device.Sync.flush();
            await settle(TICK * 40);
        }
    };
}

function openOn(cloud, deviceId, doc) {
    const device = makeDevice({ deviceId });
    device.State.schedule = device.call('normaliseSchedule', doc || cloud.doc);
    device.State.save({ silent: true });
    return device;
}

async function online(device, cloud) {
    device.Sync.pushDelayMs = TICK;
    device.Sync.connect(cloud.adapter);
    await wait();
}

// B raises the man to 600 and it lands. Every block starts here.
async function raiseOnB(b, cloud) {
    b.State.worker('w_01').dailyRate = 600;
    b.State.commitRoster();
    await settled();
}

// ------------------------------------------------- (a) the established mechanism
{
    suite('O2(a): a roster edit made before the first snapshot puts the old rate back');

    // The exact sequence from the audit: A is opened from its old disk and the person
    // changes ONLY the site name, before the listener has delivered anything. Nothing
    // about this window is exotic - open the app, change a site, and the write can leave
    // before the first snapshot arrives.
    const cloud = makeCloud({ doc: baseDoc() });
    const old = baseDoc();                       // A's disk, from before the raise

    const b = openOn(cloud, 'd_b');
    await online(b, cloud);
    await raiseOnB(b, cloud);

    given('B\'s raise reached the cloud',
        rateIn(cloudSchedule(b, cloud)) === 600,
        String(rateIn(cloudSchedule(b, cloud))));

    const a = openOn(cloud, 'd_a', old);
    given('A has adopted no snapshot, so its roster baseline is empty',
        Object.keys(a.Sync._remoteRoster.workers).length === 0,
        JSON.stringify(a.Sync._remoteRoster.workers));

    a.State.place('p_01').name = 'הרצליה מערב';
    given('A\'s site rename is durably queued', a.State.commitRoster() === true);

    const queued = a.Sync.pendingPaths();
    check('a rename of a SITE does not queue a write for the WORKER',
        queued.indexOf('roster.workers.w_01') === -1, JSON.stringify(queued));

    // WHAT THE WRITE LOOKED LIKE AT THE MOMENT IT WAS MADE.
    //
    // There is already a barrier for this window: nothing roster-shaped leaves a phone
    // until the first snapshot has arrived (`_heardFromCloud`, js/sync/send.js:257 and
    // :406). It works, and it does not help - the entry was BUILT at commit time against
    // an empty baseline, and the barrier releases exactly that entry once the snapshot it
    // was waiting for has come. Recorded here so that "wait for the snapshot" cannot be
    // proposed as the fix: it is already the behaviour.
    const released = [];
    cloud.hold = (kind, payload) => {
        if (payload && payload.updatedBy === 'd_a') {
            released.push({
                heard: a.Sync._heardFromCloud,
                cloudSaid: rateIn(cloudSchedule(a, cloud)),
                sentRate: (payload['roster.workers.w_01'] || {}).dailyRate
            });
        }
        return null;
    };

    await online(a, cloud);
    a.Sync.flush();
    await settle(TICK * 40);
    cloud.hold = null;

    const first = released[0] || {};
    check('the write waited for the first snapshot, which carried the raise',
        first.heard === true && first.cloudSaid === 600, JSON.stringify(released));
    check('and what the barrier then released is not the rate from before it',
        first.sentRate === undefined || first.sentRate === 600, JSON.stringify(released));

    const sent = wirePaths(cloud, 'd_a');
    check('and does not put one on the wire either',
        !sent.some(entry => entry.paths.indexOf('roster.workers.w_01') !== -1),
        JSON.stringify(sent));

    check('the cloud still holds the raise',
        rateIn(cloudSchedule(a, cloud)) === 600, where(a, b, cloud));
    check('B still holds the raise it made',
        rateIn(b.State.schedule) === 600, where(a, b, cloud));
    check('and A ends up on the raise too',
        rateIn(a.State.schedule) === 600, where(a, b, cloud));

    // The other half of the contract: whatever is done about this, the person's own edit
    // is not the thing to throw away.
    check('the site rename A actually made is not lost',
        siteNameIn(cloudSchedule(a, cloud)) === 'הרצליה מערב',
        String(siteNameIn(cloudSchedule(a, cloud))));
    check('and nothing on either phone says anything is wrong',
        a.Sync.status === 'synced' && b.Sync.status === 'synced',
        `${a.Sync.status}/${b.Sync.status}`);
}

// ------------------------------------------------- (b) the unestablished mechanism
{
    suite('O2(b): the same revert with the baseline already adopted');

    // A has been connected and has adopted a snapshot, so _remoteRoster holds the man at
    // 500 and editRoster has something to compare against. The audit says the divergence
    // still reproduces from here. It does - and it takes one more step to travel: A's own
    // copy goes stale first, and the NEXT ordinary roster edit is what sends it out.
    const cloud = makeCloud({ doc: baseDoc() });

    const a = openOn(cloud, 'd_a');
    const link = await unplugged(a, cloud);
    const b = openOn(cloud, 'd_b');
    await online(b, cloud);

    given('A has adopted a snapshot, so its baseline names the man at 500',
        (a.Sync._remoteRoster.workers.w_01 || {}).dailyRate === 500,
        JSON.stringify(a.Sync._remoteRoster.workers.w_01));

    link.away();

    a.State.place('p_01').name = 'הרצליה מערב';
    given('A\'s site rename is durably queued while it is away',
        a.State.commitRoster() === true);

    const queued = a.Sync.pendingPaths();
    check('with the baseline present, no per-worker write is queued at all',
        queued.indexOf('roster.workers.w_01') === -1, JSON.stringify(queued));

    await raiseOnB(b, cloud);
    given('B\'s raise reached the cloud while A was away',
        rateIn(cloudSchedule(b, cloud)) === 600,
        String(rateIn(cloudSchedule(b, cloud))));

    await link.back();

    // The moment A comes back it adopts the snapshot carrying 600 - and then puts its
    // own queue back on top of it.
    check('A shows the raise the moment it has heard it',
        rateIn(a.State.schedule) === 600, where(a, b, cloud));
    check('A and the cloud agree about what the man is paid',
        rateIn(a.State.schedule) === rateIn(cloudSchedule(a, cloud)), where(a, b, cloud));

    const afterReconnect = wirePaths(cloud, 'd_a');
    check('nothing A sent on reconnecting named the worker',
        !afterReconnect.some(entry => entry.paths.indexOf('roster.workers.w_01') !== -1),
        JSON.stringify(afterReconnect));

    // The step the audit describes: A's next ORDINARY roster edit. Nothing about it is
    // about the worker - the person renames the site again - but A's copy of the man now
    // differs from the baseline, so editRoster sends him.
    a.State.place('p_01').name = 'הרצליה מזרח';
    given('A\'s second edit is durably queued', a.State.commitRoster() === true);
    await settle(TICK * 40);

    const afterSecond = wirePaths(cloud, 'd_a');
    const carried = afterSecond[afterSecond.length - 1] || { paths: [] };
    check('A\'s next ordinary roster edit does not carry the worker',
        carried.paths.indexOf('roster.workers.w_01') === -1,
        JSON.stringify(carried.paths));

    check('the cloud still holds the raise after A\'s second edit',
        rateIn(cloudSchedule(a, cloud)) === 600, where(a, b, cloud));
    check('B still holds the raise it made',
        rateIn(b.State.schedule) === 600, where(a, b, cloud));
    check('and both phones are saying synced about it',
        a.Sync.status === 'synced' && b.Sync.status === 'synced',
        `${a.Sync.status}/${b.Sync.status}`);
}

// ------------------------------------------------- (c) which entry carries the value
//
// Two counterfactuals over the SAME sequence as (b), each removing the legacy whole array
// at a different point. They are the evidence for the report, and they are written as
// checks because a counterfactual that quietly stopped being run would take the diagnosis
// with it. Neither touches js/ - both patch one function inside one device's context.
{
    suite('O2(c): the legacy whole array, taken out at the point it is QUEUED');

    const cloud = makeCloud({ doc: baseDoc() });
    const a = openOn(cloud, 'd_a');
    const link = await unplugged(a, cloud);
    const b = openOn(cloud, 'd_b');
    await online(b, cloud);
    link.away();

    // editRoster ends each list with `put(kind, schedule[kind])` - the whole array, sent
    // for a phone still on v78. This is that line removed, and nothing else: the
    // per-entity paths, the order and the tombstones all still go.
    run(a, `
      FarkadSync.__queueBatchWithLegacy = FarkadSync.queueBatch;
      FarkadSync.queueBatch = function (batch) {
        return FarkadSync.__queueBatchWithLegacy((batch || []).filter(entry =>
          entry.path !== 'workers' && entry.path !== 'places'));
      };
    `);

    a.State.place('p_01').name = 'הרצליה מערב';
    given('the rename is still queued without the legacy arrays',
        a.State.commitRoster() === true);
    const queued = a.Sync.pendingPaths();
    check('and the queue holds no whole array',
        queued.indexOf('workers') === -1 && queued.indexOf('places') === -1,
        JSON.stringify(queued));

    await raiseOnB(b, cloud);
    await link.back();

    check('A keeps the raise when no whole array is queued behind it',
        rateIn(a.State.schedule) === 600, where(a, b, cloud));

    a.State.place('p_01').name = 'הרצליה מזרח';
    given('a second ordinary roster edit is queued', a.State.commitRoster() === true);
    await settle(TICK * 40);

    check('and the second edit leaves the raise standing everywhere',
        rateIn(a.State.schedule) === 600 && rateIn(b.State.schedule) === 600
        && rateIn(cloudSchedule(a, cloud)) === 600, where(a, b, cloud));
    check('while the person\'s own site rename still arrives',
        siteNameIn(cloudSchedule(a, cloud)) === 'הרצליה מזרח',
        String(siteNameIn(cloudSchedule(a, cloud))));
}

{
    suite('O2(c): the legacy whole array, taken out at the point it is RE-APPLIED');

    // The same run again, with the queue left exactly as the app builds it - the whole
    // array is queued and is still sent, so a v78 reader is served - and only the LOCAL
    // re-application of a single-segment path suppressed. That is the branch at the foot
    // of applyJournalEntry in js/sync/receive.js, reached from reapplyPending after a
    // snapshot is adopted.
    const cloud = makeCloud({ doc: baseDoc() });
    const a = openOn(cloud, 'd_a');
    const link = await unplugged(a, cloud);
    const b = openOn(cloud, 'd_b');
    await online(b, cloud);
    link.away();

    run(a, `
      var __applyWithLegacy = applyJournalEntry;
      globalThis.__legacyApplications = 0;
      applyJournalEntry = function (schedule, path, value, perEntity, tombstoned) {
        if (String(path).split('.').length === 1) {
          globalThis.__legacyApplications += 1;
          return;
        }
        return __applyWithLegacy(schedule, path, value, perEntity, tombstoned);
      };
    `);

    a.State.place('p_01').name = 'הרצליה מערב';
    given('the rename is queued, whole arrays and all',
        a.State.commitRoster() === true);
    await raiseOnB(b, cloud);
    await link.back();

    // WAS: `> 0`, asserting that the queued array IS offered - the precondition that made
    // the counterfactual below meaningful while the defect was still in the tree. The
    // guard in reapplyPending is now the shipped behaviour, so the array is never offered
    // and the precondition can no longer hold. Inverted rather than deleted: it is the
    // cheapest possible sentinel for the fix being silently reverted, and it fails loudly
    // the day somebody puts single-segment paths back into that loop.
    check('the queued whole array is never offered to the adopted snapshot',
        run(a, 'globalThis.__legacyApplications') === 0,
        String(run(a, 'globalThis.__legacyApplications')));
    check('and A keeps the raise when it is not laid over the snapshot',
        rateIn(a.State.schedule) === 600, where(a, b, cloud));

    a.State.place('p_01').name = 'הרצליה מזרח';
    given('a second ordinary roster edit is queued', a.State.commitRoster() === true);
    await settle(TICK * 40);
    check('and nothing sends the old rate afterwards',
        rateIn(cloudSchedule(a, cloud)) === 600 && rateIn(b.State.schedule) === 600,
        where(a, b, cloud));
}

// ------------------------------------------------- what it costs in money
{
    suite('O2: the day recorded while A holds the stale rate is stamped at it');

    // Law 2: a day keeps the rate it was worked at. Reached from the wrong end - the day
    // is stamped from a roster that has silently walked backwards, so the stamp is a
    // faithful record of a number that was never true.
    const cloud = makeCloud({ doc: baseDoc() });
    const a = openOn(cloud, 'd_a');
    const link = await unplugged(a, cloud);
    const b = openOn(cloud, 'd_b');
    await online(b, cloud);
    link.away();

    a.State.place('p_01').name = 'הרצליה מערב';
    given('A\'s roster edit is queued while it is away',
        a.State.commitRoster() === true);
    await raiseOnB(b, cloud);
    await link.back();

    given('A is back and reporting synced', a.Sync.status === 'synced', a.Sync.status);

    const change = a.call('assignPlace', a.State.schedule, '2026-08-12', 'w_01', 'actual', 'p_01');
    given('the day is recorded on A', a.State.commit(change) === true);
    await settled();

    const merged = cloudSchedule(a, cloud);
    const row = a.call('payrollReport', merged, '2026-08-01', '2026-08-31')
        .find(entry => entry.workerId === 'w_01');
    check('the day is priced at the rate B raised him to',
        row && row.amount === 600,
        `${JSON.stringify(row && { rate: row.dailyRate, amount: row.amount, mixed: row.mixedRates })} · ${where(a, b, cloud)}`);

    const reopened = makeDevice({ deviceId: 'd_a', storage: a.dump() });
    reopened.State.load();
    check('and A does not carry the stale rate across a reopen',
        rateIn(reopened.State.schedule) === 600,
        `${rateIn(reopened.State.schedule)} · ${where(a, b, cloud)}`);
}

// ------------------------------------------------- a third mechanism, in the same family
{
    suite('O2(d): one worker, two fields, two phones');

    // Not the audit's scenario, and worth pinning next to it: the unit editRoster sends is
    // the WHOLE entity record. A phone that changes a man's phone number sends his rate
    // along with it, whether it has heard the newer rate or not - and the per-entity map
    // outranks the whole array everywhere, so this one wins on every device. The baseline
    // is present and correct here, and it does not help: the man himself is what changed.
    const cloud = makeCloud({ doc: baseDoc() });
    const a = openOn(cloud, 'd_a');
    const link = await unplugged(a, cloud);
    const b = openOn(cloud, 'd_b');
    await online(b, cloud);
    link.away();

    a.State.worker('w_01').phone = '050-1111111';
    given('A\'s phone-number edit is queued while it is away',
        a.State.commitRoster() === true);
    await raiseOnB(b, cloud);
    await link.back();

    const merged = cloudSchedule(a, cloud);
    check('the phone number A typed arrives',
        (merged.workers.find(w => w.id === 'w_01') || {}).phone === '050-1111111',
        JSON.stringify(merged.workers.find(w => w.id === 'w_01')));
    check('and it does not bring A\'s old rate with it',
        rateIn(merged) === 600, where(a, b, cloud));
    check('B is not moved off the raise it made',
        rateIn(b.State.schedule) === 600, where(a, b, cloud));
}

// ------------------------------------------------- the per-field write, tried to break
//
// O2(d) is closed by making an ordinary roster edit travel one FIELD at a time -
// `roster.<kind>.<id>.<field>` - so the fields this phone merely happens to be holding
// stay off the wire. Everything below is an attempt to make that new shape lose
// something. Each block is a way it could, written as the check that would catch it.

{
    suite('O2(e): the SAME field, from two phones, is a contest and is not merged');

    // Two fields of one man merge because they are two paths. One field of one man is one
    // path, and there is no arithmetic that resolves two numbers in it: one of them is
    // wrong about somebody's pay and only a person knows which. So it is held, and said.
    const cloud = makeCloud({ doc: baseDoc() });
    const a = openOn(cloud, 'd_a');
    const link = await unplugged(a, cloud);
    const b = openOn(cloud, 'd_b');
    await online(b, cloud);
    link.away();

    a.State.worker('w_01').dailyRate = 550;
    given('A\'s own rate change is queued while it is away',
        a.State.commitRoster() === true);
    const queued = a.Sync.pendingPaths();
    given('and it is queued as one field',
        queued.indexOf('roster.workers.w_01.dailyRate') !== -1, JSON.stringify(queued));

    await raiseOnB(b, cloud);
    await link.back();

    check('A does not put its own number over the one B recorded',
        rateIn(cloudSchedule(a, cloud)) === 600, where(a, b, cloud));
    check('B is not moved off it either',
        rateIn(b.State.schedule) === 600, where(a, b, cloud));
    check('and A says so rather than saying synced',
        a.Sync.status === 'contested', a.Sync.status);
    check('A\'s own edit is not thrown away - it is still on its disk',
        a.Sync.pendingPaths().indexOf('roster.workers.w_01.dailyRate') !== -1,
        JSON.stringify(a.Sync.pendingPaths()));

    const sent = wirePaths(cloud, 'd_a');
    check('and it never reached the wire',
        !sent.some(entry => entry.paths.indexOf('roster.workers.w_01.dailyRate') !== -1),
        JSON.stringify(sent));
}

{
    suite('O2(f): a DIFFERENT field of the same man in the same window is not held');

    // The other side of the same rule, and the reason the paths are one field wide: a
    // phone number and a rate are two facts about one person, and two people recording
    // two facts is not a disagreement about either.
    const cloud = makeCloud({ doc: baseDoc() });
    const a = openOn(cloud, 'd_a');
    const link = await unplugged(a, cloud);
    const b = openOn(cloud, 'd_b');
    await online(b, cloud);
    link.away();

    a.State.worker('w_01').phone = '050-2222222';
    given('A\'s phone-number edit is queued while it is away',
        a.State.commitRoster() === true);
    await raiseOnB(b, cloud);
    await link.back();

    const merged = cloudSchedule(a, cloud);
    const man = merged.workers.find(w => w.id === 'w_01') || {};
    check('both facts are on the record',
        man.phone === '050-2222222' && man.dailyRate === 600, JSON.stringify(man));
    check('and nothing is held over it',
        a.Sync.status === 'synced' && b.Sync.status === 'synced',
        `${a.Sync.status}/${b.Sync.status}`);
}

{
    suite('O2(g): a field CLEARED travels, and takes nothing else with it');

    // A field emptied is a decision as much as a field filled, and the wire has to carry
    // it: an edit that only ever added would leave a wrong number on a man for ever.
    const cloud = makeCloud({ doc: baseDoc() });
    const a = openOn(cloud, 'd_a');
    await online(a, cloud);

    a.State.worker('w_01').phone = '050-3333333';
    given('a number is put on him and lands', a.State.commitRoster() === true);
    await settled();
    given('the cloud has it',
        (cloudSchedule(a, cloud).workers.find(w => w.id === 'w_01') || {}).phone
            === '050-3333333');

    a.State.worker('w_01').phone = '';
    given('and then it is cleared', a.State.commitRoster() === true);
    const cleared = a.Sync.pendingPaths();
    check('the clearing travels as that one field',
        cleared.indexOf('roster.workers.w_01.phone') !== -1, JSON.stringify(cleared));
    await settled();

    const man = cloudSchedule(a, cloud).workers.find(w => w.id === 'w_01') || {};
    check('the number is gone from the record',
        man.phone === '', JSON.stringify(man));
    check('and everything else about him is untouched',
        man.name === 'דוד' && man.dailyRate === 500 && man.active === true,
        JSON.stringify(man));
}

{
    suite('O2(h): a man created here, edited again before the create has left');

    // The create is the one roster write that MUST stay whole - there is nothing on any
    // record to merge one field into, and mergeRoster deliberately refuses to build a
    // person out of a fragment. So an edit made while that create is still queued goes
    // out whole as well. Firestore refuses a single update naming both `roster.workers.x`
    // and `roster.workers.x.name`, so a queue holding both would fail every send it ever
    // made, for as long as both were in it.
    const cloud = makeCloud({ doc: baseDoc() });
    const a = openOn(cloud, 'd_a');
    const link = await unplugged(a, cloud);
    link.away();

    const id = a.State.nextWorkerId();
    a.State.schedule.workers.push({
        id, name: 'חדש', idNumber: '', phone: '', dailyRate: 400, hourlyRate: 0, active: true
    });
    given('a new man is queued while the phone is away',
        a.State.commitRoster() === true);
    check('and he travels whole, because nobody has a record of him',
        a.Sync.pendingPaths().indexOf(`roster.workers.${id}`) !== -1,
        JSON.stringify(a.Sync.pendingPaths()));

    a.State.worker(id).name = 'חדש מתוקן';
    given('he is renamed before the create has left',
        a.State.commitRoster() === true);

    const paths = a.Sync.pendingPaths();
    const inside = paths.filter(path => path.indexOf(`roster.workers.${id}.`) === 0);
    check('the queue never holds a record and something inside it at once',
        !(paths.indexOf(`roster.workers.${id}`) !== -1 && inside.length > 0),
        JSON.stringify(paths));
    check('and no queued path in the app is inside another queued path',
        paths.every(path => !paths.some(other =>
            other !== path && path.indexOf(other + '.') === 0)),
        JSON.stringify(paths));

    await link.back();
    const man = (cloudSchedule(a, cloud).workers || []).find(w => w.id === id) || {};
    check('he arrives whole, under the name he ended up with',
        man.name === 'חדש מתוקן' && man.dailyRate === 400, JSON.stringify(man));
}

{
    suite('O2(i): a v79 phone, on both sides of a document carrying per-field writes');

    // Backward compatibility is not a wish here: two of the three phones can be on an
    // older build on any given evening, and an older build reads the whole arrays and
    // writes the whole entity. Both directions are measured.
    const cloud = makeCloud({ doc: baseDoc() });
    const a = openOn(cloud, 'd_a');
    await online(a, cloud);

    a.State.worker('w_01').phone = '050-4444444';
    given('this build writes one field', a.State.commitRoster() === true);
    await settled();

    // WHAT AN OLDER READER SEES. It never looks at `roster` at all - the whole array is
    // the only roster it has - so the array has to be right on its own.
    const legacy = (cloud.doc.workers || []).find(item => item.id === 'w_01') || {};
    check('the whole array a v78/v79 reader reads carries the new number',
        legacy.phone === '050-4444444' && legacy.dailyRate === 500,
        JSON.stringify(legacy));

    // WHAT AN OLDER WRITER SENDS: the whole entity, straight into the keyed map, exactly
    // as editRoster used to. It lands on top of a map entry that per-field writes built.
    const older = Object.assign({}, legacy, { name: 'דוד ב.', phone: '050-4444444' });
    cloud.doc.roster = cloud.doc.roster || {};
    cloud.doc.roster.workers = cloud.doc.roster.workers || {};
    cloud.doc.roster.workers.w_01 = older;
    cloud.doc.workers = [older];

    const read = a.call('normaliseSchedule', cloud.doc);
    const man = (read.workers || []).find(w => w.id === 'w_01') || {};
    check('a whole-entity write from an older phone is read as one record, not two',
        man.name === 'דוד ב.' && man.phone === '050-4444444' && man.dailyRate === 500,
        JSON.stringify(man));

    // And the fragment shape the older build has never heard of does not make the
    // document unreadable to it or to this one.
    const fragmented = JSON.parse(JSON.stringify(cloud.doc));
    fragmented.roster.workers.w_01 = { phone: '050-5555555' };
    check('a document holding a FRAGMENT is still a valid record',
        a.call('fullScheduleProblems',
            a.call('normaliseSchedule', fragmented)).length === 0,
        JSON.stringify(a.call('fullScheduleProblems',
            a.call('normaliseSchedule', fragmented))));
    const patched = (a.call('normaliseSchedule', fragmented).workers || [])
        .find(w => w.id === 'w_01') || {};
    check('and the fragment is merged into the man rather than replacing him',
        patched.phone === '050-5555555' && patched.name === 'דוד ב.'
        && patched.dailyRate === 500, JSON.stringify(patched));
}

{
    suite('O2(j): a fragment with nobody to belong to is not a person');

    // The failure this rule exists for: a per-field write landing where no record of that
    // man exists leaves `{ phone: … }` in the map with no id in it. Read as a person it
    // is a nameless row that normaliseSchedule then drops for having no id - and landed on
    // a tombstone it is a man somebody removed, standing back up.
    const device = makeDevice({ deviceId: 'd_x' });
    const orphan = {
        schemaVersion: 2,
        workers: [], places: [{ id: 'p_01', name: 'הרצליה', active: true }],
        roster: { workers: { w_99: { phone: '050-6666666' } } },
        days: {}, advances: {},
        updatedAt: '2026-08-01T06:00:00.000Z', updatedBy: 'd_other'
    };
    const read = device.call('normaliseSchedule', orphan);
    check('nobody is invented out of one field',
        (read.workers || []).length === 0, JSON.stringify(read.workers));
    check('and the document is still readable',
        device.call('fullScheduleProblems', read).length === 0,
        JSON.stringify(device.call('fullScheduleProblems', read)));
}

{
    suite('O2(k): a per-field write for a man another phone removed');

    // A is away with one field of a man queued; B removes him. The tombstone is a
    // statement about one person made after A's edit, and A must not stand him back up
    // with it - not on its own screen, and not in the document the third phone reads.
    const cloud = makeCloud({ doc: baseDoc() });
    const a = openOn(cloud, 'd_a');
    const link = await unplugged(a, cloud);
    const b = openOn(cloud, 'd_b');
    await online(b, cloud);
    link.away();

    a.State.worker('w_01').phone = '050-7777777';
    given('A\'s field edit is queued while it is away',
        a.State.commitRoster() === true);

    b.State.schedule.workers = b.State.schedule.workers.filter(item => item.id !== 'w_01');
    given('B removed him', b.State.commitRoster({ workers: ['w_01'] }) === true);
    await settled();
    given('B has removed him and the cloud says so',
        (cloudSchedule(b, cloud).workers || []).length === 0,
        JSON.stringify(cloudSchedule(b, cloud).workers));

    await link.back();

    check('A does not stand him up again on its own screen',
        (a.State.schedule.workers || []).length === 0,
        JSON.stringify(a.State.schedule.workers));
    check('nor in the document every phone reads',
        (cloudSchedule(a, cloud).workers || []).length === 0,
        JSON.stringify(cloudSchedule(a, cloud).workers));
    check('and B does not get him back',
        (b.State.schedule.workers || []).length === 0,
        JSON.stringify(b.State.schedule.workers));
    check('the tombstone itself is still in the document',
        cloud.doc.roster && cloud.doc.roster.workers
        && cloud.doc.roster.workers.w_01 === null,
        JSON.stringify(cloud.doc.roster && cloud.doc.roster.workers));
}

{
    suite('O2(l): a field name nobody wrote is refused, not carried');

    // The queue is replayed into the schedule at boot with no further checking, so an
    // unrecognised field would be written into somebody's row and then saved to the disk.
    // The named fields are the ones this build can read back; everything else is refused
    // at the door - see ENTITY_FIELDS in js/model/schema.js.
    const device = makeDevice({ deviceId: 'd_y' });
    const ask = (path, value) => device.call('journalEntryProblems', path, value);

    check('a real field of a worker is admitted',
        ask('roster.workers.w_01.dailyRate', 600).length === 0,
        JSON.stringify(ask('roster.workers.w_01.dailyRate', 600)));
    check('a field of a SITE that only a worker has is refused',
        ask('roster.places.p_01.dailyRate', 600).length > 0,
        JSON.stringify(ask('roster.places.p_01.dailyRate', 600)));
    check('a name this build has never heard of is refused',
        ask('roster.workers.w_01.salary', 600).length > 0,
        JSON.stringify(ask('roster.workers.w_01.salary', 600)));
    check('the id may not be moved by a field write',
        ask('roster.workers.w_01.id', 'w_02').length > 0,
        JSON.stringify(ask('roster.workers.w_01.id', 'w_02')));
    check('a wage that is not a number is refused',
        ask('roster.workers.w_01.dailyRate', 'ניפוח').length > 0,
        JSON.stringify(ask('roster.workers.w_01.dailyRate', 'ניפוח')));
    check('a record arriving where one field should be is refused',
        ask('roster.workers.w_01.name', { name: 'x' }).length > 0,
        JSON.stringify(ask('roster.workers.w_01.name', { name: 'x' })));
    check('a path that would land on the prototype is refused',
        ask('roster.workers.w_01.__proto__', 1).length > 0,
        JSON.stringify(ask('roster.workers.w_01.__proto__', 1)));
    check('a field cleared travels as the empty string',
        ask('roster.workers.w_01.phone', '').length === 0,
        JSON.stringify(ask('roster.workers.w_01.phone', '')));
    check('and the whole-entity form is still admitted, for the phone that sends it',
        ask('roster.workers.w_01', { id: 'w_01', name: 'דוד', dailyRate: 500 }).length === 0,
        JSON.stringify(ask('roster.workers.w_01',
            { id: 'w_01', name: 'דוד', dailyRate: 500 })));
    check('and a removal still travels as null',
        ask('roster.workers.w_01', null).length === 0,
        JSON.stringify(ask('roster.workers.w_01', null)));
}


report();
