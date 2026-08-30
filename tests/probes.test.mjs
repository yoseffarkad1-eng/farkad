// The adversarial probes: Q1-Q9.
//
//   node tests/probes.test.mjs
//
// These are written to run UNCHANGED against two trees - the rejected v87 branch, where
// every one of them fails, and this one, where they must pass. That is the only way a
// regression test earns its name: a test written after the fix, against the fix, proves
// the fix is self-consistent and nothing else.
//
// So nothing here reaches for an internal helper, a projection, or a shape that only one
// of the two trees has. Everything is asked of the public surface and of the BYTES: every
// physical key under farkad:outbox, counted and read, because the defect these exist for
// is precisely a queue that reports one operation while holding two.

import { makeDevice, makeCloud, sharedStore, settle, deferred } from './harness.mjs';
import { suite, check, given, same, report } from './runner.mjs';

const TICK = 5;
const wait = () => settle(TICK * 12);

// ---------------------------------------------------------------- the bytes, not the view

// Every physical operation on the disk, however the tree under test spells one.
//
// Two shapes have existed: a single {seq, items} record, and a batch record holding an
// `ops` array. Both are read here, and both are counted PER PHYSICAL RECORD - never
// collapsed by path, because "how many operations does this disk hold for this path" is
// the question every one of these probes turns on.
function physicalOps(dumpOrDevice) {
    const dump = typeof dumpOrDevice.dump === 'function' ? dumpOrDevice.dump() : dumpOrDevice;
    const out = [];
    Object.keys(dump).filter(key => key.indexOf('farkad:outbox') === 0).forEach(key => {
        if (key.indexOf(':damaged') !== -1) return;
        let parsed;
        try { parsed = JSON.parse(dump[key]); } catch (error) { return; }
        if (!parsed || typeof parsed !== 'object') return;

        // A batch record.
        if (Array.isArray(parsed.ops)) {
            parsed.ops.forEach(op => out.push({
                key, opId: String(op.opId || ''), path: String(op.path || ''),
                value: op.value, seq: op.seq
            }));
            return;
        }
        // An older single record.
        if (parsed.items && typeof parsed.items === 'object') {
            Object.keys(parsed.items).forEach(path => out.push({
                key, opId: '', path, value: parsed.items[path].value,
                seq: parsed.items[path].seq
            }));
        }
    });
    return out;
}

const opsForPath = (device, path) => physicalOps(device).filter(op => op.path === path);
const placeOf = op => {
    const entries = (op.value && op.value.entries) || [];
    return entries.map(entry => entry.placeId).join('+');
};

const copyOf = shared => {
    const out = {};
    Object.keys(shared).forEach(key => { out[key] = shared[key]; });
    return out;
};

const PATH = 'days.2026-08-10.actual.w_01';

function seed(device) {
    device.State.schedule.workers = [
        { id: 'w_01', name: 'דוד', active: true, dailyRate: 400, hourlyRate: 50 },
        { id: 'w_02', name: 'שרה', active: true, dailyRate: 350, hourlyRate: 0 }
    ];
    device.State.schedule.places = [
        { id: 'p_01', name: 'הרצליה', active: true },
        { id: 'p_02', name: 'תל אביב', active: true }
    ];
    device.State.save({ silent: true });
    return device;
}

// One site on a day, REPLACING whatever was there. Several probes turn on "the same path,
// two different values", so the day has to end up holding one site and not two.
//
// assignPlace adds and is idempotent - it filters the site out and puts it straight back
// - so calling it with the site that is already there clears nothing. unassignPlace is
// the one that removes.
function put(device, path, placeId) {
    const [, date, layer, workerId] = path.split('.');
    device.call('entriesFor', device.State.schedule, date, workerId, layer)
        .slice()
        .filter(entry => entry.placeId !== placeId)
        .forEach(entry => device.State.commit(device.call('unassignPlace',
            device.State.schedule, date, workerId, layer, entry.placeId)));
    return device.State.commit(device.call('assignPlace',
        device.State.schedule, date, workerId, layer, placeId));
}

const connected = async (device, cloud) => {
    device.Sync.pushDelayMs = TICK;
    device.Sync.connect(cloud.adapter);
    await settle(TICK * 30);
};

// ================================================================ Q1
//
// Tab A queues p_01, tab B corrects it to p_02. The winner flushes and the queue reports
// nothing pending. Then the app is closed and opened AGAIN, and flushed again.
//
// A queue that keeps a losing operation on the disk and reports only the winner has not
// finished with it. Prune the winner and the loser becomes the winner: the old value
// returns, goes to the cloud, and overwrites the correction on every phone - a day of
// somebody's work, replaced by the value it was corrected from, hours later.
{
    suite('Q1: a corrected day does not come back at the second reopen');

    const cloud = makeCloud();
    const shared = sharedStore();
    const a = makeDevice({ sharedStorage: shared, deviceId: 'd_a' });
    seed(a);
    const b = makeDevice({ sharedStorage: shared, deviceId: 'd_b' });
    b.State.load();

    put(a, PATH, 'p_01');
    put(b, PATH, 'p_02');
    await wait();

    given('both tabs wrote', opsForPath(a, PATH).length >= 1,
        JSON.stringify(opsForPath(a, PATH).map(placeOf)));

    // FIRST reopen, and the flush that empties the queue.
    const first = makeDevice({ storage: copyOf(shared), deviceId: 'd_a' });
    first.State.load();
    await connected(first, cloud);
    await settle(TICK * 60);

    check('the cloud has the correction', Boolean(cloud.doc && cloud.doc.days
        && cloud.doc.days['2026-08-10'])
        && cloud.doc.days['2026-08-10'].actual.w_01.entries[0].placeId === 'p_02',
        JSON.stringify((cloud.doc || {}).days));
    check('and nothing is reported pending', first.Sync.pendingCount() === 0,
        String(first.Sync.pendingCount()));
    check('with no physical operation left that could return later',
        opsForPath(first, PATH).length === 0,
        JSON.stringify(opsForPath(first, PATH).map(op => ({ op: op.opId, at: placeOf(op) }))));

    // SECOND reopen. Nothing was edited; nothing may be sent.
    const second = makeDevice({ storage: first.dump(), deviceId: 'd_a' });
    second.State.load();
    check('the second reopen shows the correction',
        second.call('entriesFor', second.State.schedule, '2026-08-10', 'w_01',
            'actual')[0].placeId === 'p_02',
        JSON.stringify(second.call('entriesFor', second.State.schedule, '2026-08-10',
            'w_01', 'actual')));
    await connected(second, cloud);
    await settle(TICK * 60);
    check('and the cloud still has it after the second flush',
        cloud.doc.days['2026-08-10'].actual.w_01.entries[0].placeId === 'p_02',
        JSON.stringify(cloud.doc.days['2026-08-10'].actual.w_01));
}

// ================================================================ Q2
//
// An acknowledgement is a statement about ONE operation that left this device. It may
// mark it, and it may prune it. It may not create anything: only a person editing
// something creates an operation.
//
// The failure is silent and total. A's send is acknowledged while B's correction is the
// current value; the acknowledgement finds A's old value in A's memory, sees the disk has
// moved on, and writes A's value down again as a BRAND NEW operation - newer than the
// correction. The correction is now the loser, and the value the person fixed goes to
// every phone as the current one.
{
    suite('Q2: an acknowledgement never mints an operation');

    const cloud = makeCloud();
    const shared = sharedStore();
    const a = makeDevice({ sharedStorage: shared, deviceId: 'd_a' });
    seed(a);
    const b = makeDevice({ sharedStorage: shared, deviceId: 'd_b' });
    b.State.load();

    const gate = deferred();
    cloud.hold = kind => (kind === 'update' ? gate.promise : null);
    await connected(a, cloud);
    put(a, PATH, 'p_01');
    await settle(TICK * 30);
    given('A has a send open', a.Sync.pendingCount() > 0, String(a.Sync.pendingCount()));

    // The schedule write is refused from here, which is what leaves _savedSeq behind and
    // makes the acknowledgement path do its most work.
    a.setQuota(key => key === 'scheduleData:v2');

    put(b, PATH, 'p_02');
    await wait();
    const beforeAck = physicalOps(a).map(op => op.opId).sort().join();

    gate.release();
    await settle(TICK * 60);
    a.setQuota(null);

    // Pruning is allowed - that is what an acknowledgement is for. MINTING is not.
    const known = new Set(beforeAck.split(','));
    const minted = physicalOps(a).map(op => op.opId).filter(id => !known.has(id));
    check('the acknowledgement created no new operation', minted.length === 0,
        JSON.stringify(minted));
    check('and the disk still names the correction as the current value',
        opsForPath(a, PATH).length > 0
        && opsForPath(a, PATH).some(op => placeOf(op) === 'p_02'),
        JSON.stringify(opsForPath(a, PATH).map(placeOf)));

    const reopened = makeDevice({ storage: copyOf(shared), deviceId: 'd_a' });
    reopened.State.load();
    check('the reopened screen shows the correction',
        reopened.call('entriesFor', reopened.State.schedule, '2026-08-10', 'w_01',
            'actual')[0].placeId === 'p_02',
        JSON.stringify(reopened.call('entriesFor', reopened.State.schedule, '2026-08-10',
            'w_01', 'actual')));

    cloud.hold = null;
    await connected(reopened, cloud);
    await settle(TICK * 60);
    check('and the cloud ends on the correction',
        cloud.doc.days['2026-08-10'].actual.w_01.entries[0].placeId === 'p_02',
        JSON.stringify(cloud.doc.days['2026-08-10'].actual.w_01));
}

// ================================================================ Q3
//
// Two contexts, two open requests, completed in the opposite order to the one they were
// started in. Each tab orders its own writes; nothing orders them against each other, so
// the older value can land last and be the one the document keeps.
{
    suite('Q3: an older request landing later does not win');

    const cloud = makeCloud();
    const shared = sharedStore();
    const a = makeDevice({ sharedStorage: shared, deviceId: 'd_a' });
    seed(a);
    const b = makeDevice({ sharedStorage: shared, deviceId: 'd_b' });
    b.State.load();

    // Every update is held, and each one gets its own gate, so that whether two of them
    // can be open at the same time is a fact this test can measure rather than assume.
    const held = [];
    let open = 0;
    let mostOpenAtOnce = 0;
    cloud.hold = (kind, payload) => {
        if (kind !== 'update') return null;
        // By the device that SIGNED the write. Reading the payload for a site id
        // classified A's send as B's - the roster it carries names every site, p_02
        // included - and the setup then proved nothing about two tabs.
        const from = payload && (payload.updatedBy
            || (payload.data && payload.data.updatedBy));
        const gate = deferred();
        open += 1;
        mostOpenAtOnce = Math.max(mostOpenAtOnce, open);
        const done = () => { open -= 1; };
        gate.promise.then(done, done);
        held.push({ gate, at: from === 'd_b' ? 'b' : 'a' });
        return gate.promise;
    };

    await connected(a, cloud);
    await connected(b, cloud);
    put(a, PATH, 'p_01');
    await settle(TICK * 40);
    put(b, PATH, 'p_02');
    await settle(TICK * 40);

    // This used to require that only one tab ever had a write open, and that WAS the
    // guarantee for as long as the server accepted whatever arrived and kept the last of
    // it: while both could be open, the older of the two could answer last and put a
    // stale day over a correction on all three phones.
    //
    // The server orders the writes now. Every one carries the revision it was built on,
    // one built on a base that has moved is refused, and a path another tab changed in
    // between is held rather than overwritten - so the older write answering last cannot
    // win, whether or not the two overlapped.
    //
    // Keeping the old check would have pinned the mechanism instead of the guarantee, and
    // the mechanism had a cost with no floor: the single-writer rule was a localStorage
    // lease, and a tab suspended with its request still open held it against every other
    // tab indefinitely. So both tabs may now be open at once, and the two checks below -
    // which are the guarantee, and which were already here - say what that must not cost.
    check('both tabs may have a write open, which is what the ordering is for',
        mostOpenAtOnce >= 1 && held.length >= 2,
        `${mostOpenAtOnce} at once: ` + JSON.stringify(held.map(item => item.at)));

    // A's write - the older value - is answered first. B's has not been made yet.
    held.forEach(item => item.gate.release());
    cloud.hold = null;
    await settle(TICK * 120);

    check('the document keeps the newer value',
        cloud.doc.days['2026-08-10'].actual.w_01.entries[0].placeId === 'p_02',
        JSON.stringify(cloud.doc.days['2026-08-10'].actual.w_01));

    const third = makeDevice({ deviceId: 'd_third' });
    await connected(third, cloud);
    await settle(TICK * 40);
    check('and a third phone agrees',
        third.call('entriesFor', third.State.schedule, '2026-08-10', 'w_01',
            'actual')[0].placeId === 'p_02',
        JSON.stringify(third.call('entriesFor', third.State.schedule, '2026-08-10',
            'w_01', 'actual')));
}

// ================================================================ Q4
//
// Two writes inside one millisecond, with the second made by a tab that has already SEEN
// the first on the disk. That is not a tie: B happened after A and knew it. Ordering them
// by a random suffix decides it with a coin, and the coin comes up wrong about half the
// time - which is a day of work replaced by the value it was corrected from, at random.
{
    suite('Q4: a correction that saw the value it replaced always wins');

    const trials = 40;
    let wrong = 0;
    const detail = [];

    for (let i = 0; i < trials; i += 1) {
        const shared = sharedStore();
        const a = makeDevice({ sharedStorage: shared, deviceId: 'd_a' });
        seed(a);
        const b = makeDevice({ sharedStorage: shared, deviceId: 'd_b' });
        b.State.load();

        // One frozen millisecond for both writes.
        const frozen = 1800000000000 + i;
        [a, b].forEach(device => { device.ctx.Date = Object.assign(
            function Date(...args) { return new (Function.prototype.bind.apply(
                globalThis.Date, [null].concat(args)))(); },
            { now: () => frozen, parse: globalThis.Date.parse,
              UTC: globalThis.Date.UTC }); });

        put(a, PATH, 'p_01');
        // B reads the disk - it can SEE A's operation - and only then writes.
        given('B saw A before writing', physicalOps(b).length > 0);
        put(b, PATH, 'p_02');

        const reopened = makeDevice({ storage: copyOf(shared), deviceId: 'd_a' });
        reopened.State.load();
        const shown = reopened.call('entriesFor', reopened.State.schedule, '2026-08-10',
            'w_01', 'actual');
        if (!shown[0] || shown[0].placeId !== 'p_02') {
            wrong += 1;
            if (detail.length < 3) detail.push(JSON.stringify(shown));
        }
    }

    check(`the later correction wins every time, not most times (${trials} trials)`,
        wrong === 0, `${wrong} of ${trials} reopened on the OLD value  ${detail.join(' ')}`);
}

// ================================================================ Q5
{
    suite('Q5: a restore fences every physical operation, not the visible one');

    const shared = sharedStore();
    const a = makeDevice({ sharedStorage: shared, deviceId: 'd_a' });
    seed(a);
    const b = makeDevice({ sharedStorage: shared, deviceId: 'd_b' });
    b.State.load();

    put(a, PATH, 'p_01');
    put(b, PATH, 'p_02');
    await wait();
    given('the disk holds work for that path', opsForPath(a, PATH).length >= 1,
        String(opsForPath(a, PATH).length));

    const backup = a.call('normaliseSchedule', {
        schemaVersion: 2, workers: a.State.schedule.workers, places: a.State.schedule.places,
        days: { '2026-07-01': { plan: {}, actual: {} } }, advances: {},
        updatedAt: '2026-07-01T06:00:00.000Z', updatedBy: 'd_backup'
    });

    const result = await a.Sync.replaceEverything(backup);
    check('the restore reports what it did', result && typeof result.ok === 'boolean',
        JSON.stringify(result));
    await wait();

    check('no operation for the restored-away path is left on the disk',
        opsForPath(a, PATH).length === 0,
        JSON.stringify(opsForPath(a, PATH).map(op => ({ op: op.opId, at: placeOf(op) }))));

    const once = makeDevice({ storage: copyOf(shared), deviceId: 'd_a' });
    once.State.load();
    check('the first reopen does not resurrect it',
        !once.State.schedule.days['2026-08-10'],
        JSON.stringify(Object.keys(once.State.schedule.days || {})));

    const twice = makeDevice({ storage: once.dump(), deviceId: 'd_a' });
    twice.State.load();
    check('nor the second',
        !twice.State.schedule.days['2026-08-10'],
        JSON.stringify(Object.keys(twice.State.schedule.days || {})));
}

// ================================================================ Q6
{
    suite('Q6: an empty supersedes list supersedes nothing');

    const device = makeDevice({ deviceId: 'd_here' });
    seed(device);
    put(device, PATH, 'p_01');
    given('the edit is queued', device.Sync.pendingCount() === 1,
        String(device.Sync.pendingCount()));

    // An envelope that names NOTHING, with a number high enough to sweep the queue if the
    // number is what gets read. Naming nothing is a statement, not an absence.
    const envelope = {
        version: 2, phase: 'prepared', transactionId: 'r_probe',
        supersedesSeq: 999, supersedes: [], cloud: false,
        document: device.call('cloudDocument', device.State.schedule)
    };
    device.Sync.dropSupersededEntries(envelope);

    check('the edit is still queued', device.Sync.pendingCount() === 1,
        String(device.Sync.pendingCount()));
    check('and still on the disk', opsForPath(device, PATH).length >= 1,
        JSON.stringify(opsForPath(device, PATH).map(placeOf)));
}

// ================================================================ Q7
{
    suite('Q7: an edit the app refused is not left active');

    // A roster commit is several field paths that only mean anything together: the person,
    // the order he appears in, and the whole array an older phone reads. The shape this
    // replaced wrote them one at a time and put the queue back by hand when one failed -
    // so a refused write left some of them on the disk, the rollback of the rest failed
    // too, and the app reported "that did not happen" over a device holding half of it.
    //
    // Two arms, because there are two ways for the disk to say no and they must not have
    // the same answer.
    const device = makeDevice({ deviceId: 'd_here' });
    seed(device);
    put(device, PATH, 'p_01');
    const before = device.Sync.pendingPaths().sort().join();

    // ARM ONE: the queue will not take the batch at all, and nothing can be removed
    // either - so a rollback that had to delete anything could not run.
    device.setQuota(key => String(key).indexOf('farkad:outbox') === 0);
    device.blockRemoval(key => String(key).indexOf('farkad:outbox') === 0);
    device.throwOnRemove(key => String(key).indexOf('farkad:outbox') === 0);

    device.State.schedule.workers.push(
        { id: 'w_zz', name: 'חדש', active: true, dailyRate: 300, hourlyRate: 0 });
    const done = device.State.commitRoster();

    check('the app says it did not happen', done === false, String(done));
    check('and nothing of it is on the screen', !device.State.worker('w_zz'),
        JSON.stringify(device.State.schedule.workers.map(worker => worker.id)));

    device.setQuota(null);
    device.blockRemoval(null);
    device.throwOnRemove(null);

    const reopened = makeDevice({ storage: device.dump(), deviceId: 'd_here' });
    reopened.State.load();
    check('the reopen does not show the refused edit as pending',
        !reopened.Sync.pendingPaths().some(path => path.indexOf('w_zz') !== -1),
        JSON.stringify(reopened.Sync.pendingPaths()));
    check('nor apply it to the crew', !reopened.State.worker('w_zz'),
        JSON.stringify(reopened.State.schedule.workers.map(worker => worker.id)));
    check('while the edit that WAS accepted is still owed',
        reopened.Sync.pendingPaths().sort().join() === before,
        `${before} vs ${reopened.Sync.pendingPaths().sort().join()}`);

    // ARM TWO: the batch lands and the write AFTER it does not. This is the state that
    // used to be half a roster on the disk. It cannot be one now - the batch is a single
    // record - so the honest answer is that the edit happened, whole, and every part of
    // it is there at the next open.
    const second = makeDevice({ deviceId: 'd_two' });
    seed(second);
    let outboxWrites = 0;
    second.setQuota(key => {
        if (String(key).indexOf('farkad:outbox') !== 0) return false;
        outboxWrites += 1;
        return outboxWrites > 1;
    });
    second.blockRemoval(key => String(key).indexOf('farkad:outbox') === 0);
    second.throwOnRemove(key => String(key).indexOf('farkad:outbox') === 0);

    second.State.schedule.workers.push(
        { id: 'w_zz', name: 'חדש', active: true, dailyRate: 300, hourlyRate: 0 });
    const stood = second.State.commitRoster();
    second.setQuota(null);
    second.blockRemoval(null);
    second.throwOnRemove(null);

    check('a batch that landed is not reported as a failure', stood === true,
        String(stood));
    const reopenedTwo = makeDevice({ storage: second.dump(), deviceId: 'd_two' });
    reopenedTwo.State.load();
    check('and the reopen holds the WHOLE roster edit, not part of it',
        Boolean(reopenedTwo.State.worker('w_zz'))
        && (reopenedTwo.State.schedule.workers || [])
            .filter(worker => worker && worker.id === 'w_zz').length === 1,
        JSON.stringify((reopenedTwo.State.schedule.workers || [])
            .map(worker => worker.id)));
    check('with every path of it queued together or none of them',
        (() => {
            const paths = physicalOps(reopenedTwo)
                .filter(op => JSON.stringify(op.value || '').indexOf('w_zz') !== -1
                    || op.path.indexOf('w_zz') !== -1)
                .map(op => op.path);
            return paths.indexOf('roster.workers.w_zz') !== -1
                && paths.indexOf('workers') !== -1;
        })(),
        JSON.stringify(physicalOps(reopenedTwo).map(op => op.path)));
}

// ================================================================ Q8
{
    suite('Q8: a stale tab does not resend what has already been settled');

    const cloud = makeCloud();
    const shared = sharedStore();
    const a = makeDevice({ sharedStorage: shared, deviceId: 'd_a' });
    seed(a);
    put(a, PATH, 'p_01');
    await wait();

    // B opens with the edit already on the disk, which is what makes it a stale tab
    // later: it is holding a version of that path in its own session memory.
    const b = makeDevice({ sharedStorage: shared, deviceId: 'd_b' });
    b.State.load();
    given('both tabs hold it', b.Sync.pendingPaths().includes(PATH));

    // A sends it and settles it.
    await connected(a, cloud);
    await settle(TICK * 60);
    given('A settled it', a.Sync.pendingCount() === 0, String(a.Sync.pendingCount()));

    // A DIFFERENT PHONE corrects the day - its own disk, its own session, through the
    // cloud like any other phone. The correction has to be the document's, not a
    // synthetic snapshot handed to one device: the question is what the stale tab does to
    // a document that has genuinely moved on.
    const other = makeDevice({ deviceId: 'd_other' });
    await connected(other, cloud);
    await settle(TICK * 40);
    put(other, PATH, 'p_02');
    await settle(TICK * 60);
    given('the other phone corrected it in the cloud',
        cloud.doc.days['2026-08-10'].actual.w_01.entries[0].placeId === 'p_02',
        JSON.stringify(cloud.doc.days['2026-08-10'].actual.w_01));
    await settle(TICK * 40);

    // The stale tab records something else entirely.
    put(b, 'days.2026-08-12.actual.w_02', 'p_01');
    await settle(TICK * 60);

    check('recording an unrelated day did not put the settled one back',
        opsForPath(b, PATH).length === 0,
        JSON.stringify(opsForPath(b, PATH).map(op => ({ op: op.opId, at: placeOf(op) }))));

    const reopened = makeDevice({ storage: copyOf(shared), deviceId: 'd_a' });
    reopened.State.load();
    await connected(reopened, cloud);
    await settle(TICK * 60);
    check('and the newer value stands on the cloud',
        cloud.doc.days['2026-08-10'].actual.w_01.entries[0].placeId === 'p_02',
        JSON.stringify(cloud.doc.days['2026-08-10'].actual.w_01));
}

// ================================================================ Q9
{
    suite('Q9: an older build’s queue is read from every slot');

    // A damaged mark in the first slot, a legacy queue in the second. The work in the
    // second slot is somebody's unsent day, and a loader that reads only the slot it
    // writes to reports it as nothing.
    const disk = {
        'farkad:deviceId': 'd_old',
        'scheduleData:v2': JSON.stringify({
            schemaVersion: 2,
            workers: [{ id: 'w_01', name: 'דוד', active: true, dailyRate: 400 }],
            places: [{ id: 'p_01', name: 'הרצליה', active: true }],
            days: {}, advances: {},
            updatedAt: '2026-08-01T00:00:00.000Z', updatedBy: 'd_old'
        }),
        'farkad:outbox': '{"seq":',
        'farkad:outbox:active1': JSON.stringify({ seq: 3, items: {
            'days.2026-08-14.actual.w_01': {
                value: { entries: [{ placeId: 'p_01' }] }, seq: 3 }
        } })
    };

    const device = makeDevice({ storage: disk });
    device.State.load();
    check('the day in the second slot is pending',
        device.Sync.pendingPaths().includes('days.2026-08-14.actual.w_01'),
        JSON.stringify(device.Sync.pendingPaths()));
    check('and the journal rebuilds it onto the schedule',
        device.call('entriesFor', device.State.schedule, '2026-08-14', 'w_01',
            'actual').length === 1,
        JSON.stringify(Object.keys(device.State.schedule.days || {})));

    // A legacy item that is NEWER than an operation for the same path. An old client is
    // still writing whole records, and "there is an operation, so the item is older" is
    // an assumption, not a fact.
    const mixed = makeDevice({ deviceId: 'd_mixed' });
    seed(mixed);
    put(mixed, PATH, 'p_01');
    const record = JSON.parse(mixed.raw('farkad:outbox') || '{"seq":0,"items":{}}');
    record.seq = 999;
    record.items = record.items || {};
    record.items[PATH] = { value: { entries: [{ placeId: 'p_02' }] }, seq: 999 };
    mixed.putRaw('farkad:outbox', JSON.stringify(record));

    const reopened = makeDevice({ storage: mixed.dump(), deviceId: 'd_mixed' });
    reopened.State.load();
    check('a newer legacy item is not overruled by an older operation',
        reopened.call('entriesFor', reopened.State.schedule, '2026-08-10', 'w_01',
            'actual')[0].placeId === 'p_02',
        JSON.stringify(reopened.call('entriesFor', reopened.State.schedule, '2026-08-10',
            'w_01', 'actual')));
}

report();
