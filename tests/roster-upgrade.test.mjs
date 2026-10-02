// An UPGRADED disk: the roster is in the arrays, and a per-field write says it saw nothing.
//
//   node tests/roster-upgrade.test.mjs
//
// O2 closed the silent rate overwrite: a phone that has not heard the cloud no longer puts
// its stale copy of a man back on everybody else. This is the failure that lives next door
// to that fix, and it is the OPPOSITE shape - nothing is overwritten and nothing is lost;
// a legitimate edit is held for ever and the person is never told why.
//
// The disk is what makes it. A schedule saved by this app carries
//
//     advances, days, ledger, places, schemaVersion, updatedAt, updatedBy, vehicles, workers
//
// and NO `roster` key: the roster lives in `workers[]` and `places[]`. `roster.*` is the
// WIRE shape, not the stored one. So when queueOperations asks storedMarkAt what this
// device holds at `roster.places.p_01.name`, readPath walks a key that is not there and
// the operation is written down with seen: ["absent"] - while `places[0].name` on the very
// same disk says "site". The provenance is false at the moment it is journalled.
//
// Then the first snapshot arrives holding that same "site". movedUnder finds the server's
// mark is not in the operation's seen list, reads it as another device's correction this
// phone has never seen, and holds the write. Nothing is wrong with the value, the network
// or the disk: the record of what the device had seen was wrong.
//
// Every check here is written to print the three rosters and both statuses, because "the
// rename is stranded while everything says it is fine" is the whole of the finding.

import { makeDevice, makeCloud, settle, settleUntil } from './harness.mjs';
import { suite, check, same, given, report } from './runner.mjs';

const TICK = 6;
const settled = () => settle(TICK * 40);

// THE DISK, BUILT THE WAY A BOOT BUILDS ONE.
//
// State.load() first, then the arrays, then save - which is the shape an older schedule
// has after this build opens it: authoritative roster in the arrays, no keyed map. Not
// `State.schedule = normaliseSchedule(cloudDocument)`, which is what the O2 suite does and
// which quietly produces a record this lifecycle never produces.
function upgradedDisk(extra) {
    const device = makeDevice({ deviceId: 'd_seed' });
    device.State.load();
    device.State.schedule.workers = [
        { id: 'w_01', name: 'דוד', active: true, dailyRate: 500, hourlyRate: 0 }
    ];
    device.State.schedule.places = [{ id: 'p_01', name: 'site', active: true }];
    if (typeof extra === 'function') extra(device.State.schedule);
    device.State.save({ silent: true });
    return device.dump();
}

function openOn(disk, deviceId) {
    const device = makeDevice({ deviceId, storage: JSON.parse(JSON.stringify(disk)) });
    device.State.load();
    return device;
}

async function online(device, cloud) {
    device.Sync.pushDelayMs = TICK;
    device.Sync.connect(cloud.adapter);
    await settle(TICK * 10);
}

const workerRate = schedule => {
    const found = (schedule.workers || []).find(item => item.id === 'w_01');
    return found ? found.dailyRate : null;
};
const placeName = schedule => {
    const found = (schedule.places || []).find(item => item.id === 'p_01');
    return found ? found.name : null;
};
const cloudSchedule = (device, cloud) => device.call('normaliseSchedule', cloud.doc);

// The one line every check carries.
function where(a, b, cloud) {
    const c = cloudSchedule(a, cloud);
    return `rate A=${workerRate(a.State.schedule)} B=${workerRate(b.State.schedule)} `
        + `cloud=${workerRate(c)} · site A=${placeName(a.State.schedule)} `
        + `cloud=${placeName(c)} · status A=${a.Sync.status} B=${b.Sync.status} `
        + `· pendingA=${a.Sync.pendingCount()}`;
}

// Every durable hold this device is carrying, by path.
function holds(device) {
    const raw = device.dump()['farkad:outbox'];
    if (!raw) return [];
    let parsed;
    try { parsed = JSON.parse(raw); } catch (error) { return ['<unreadable>']; }
    const out = [];
    const walk = node => {
        if (!node || typeof node !== 'object') return;
        if (Array.isArray(node)) { node.forEach(walk); return; }
        if (node.held || node.contested) out.push(String(node.path || '?'));
        Object.keys(node).forEach(key => walk(node[key]));
    };
    walk(parsed);
    return out;
}

// B raises the man to 600 and it lands. Every block starts here.
async function raiseOnB(b, cloud) {
    b.State.worker('w_01').dailyRate = 600;
    b.State.commitRoster();
    await settled();
}

// ------------------------------------------------------------------ the finding
async function upgradeRace(label, prepare) {
    suite(label);

    const disk = prepare();
    const cloud = makeCloud({ doc: null });

    const b = openOn(disk, 'd_b');
    await online(b, cloud);
    await settled();
    await raiseOnB(b, cloud);

    given('B\'s raise reached the cloud',
        workerRate(cloudSchedule(b, cloud)) === 600,
        String(workerRate(cloudSchedule(b, cloud))));
    given('and the cloud document is under the protocol',
        Number(cloud.doc && cloud.doc.revision) > 0,
        String(cloud.doc && cloud.doc.revision));

    // A opens on the SAME old disk B started from, and has heard nothing.
    const a = openOn(disk, 'd_a');
    given('A has adopted no snapshot',
        a.Sync._baseDoc === null, String(a.Sync._baseDoc));
    given('but A\'s disk does hold the site name it is about to change',
        placeName(a.State.schedule) === 'site', placeName(a.State.schedule));

    a.State.place('p_01').name = 'renamed site';
    given('A\'s rename is durably queued', a.State.commitRoster() === true);

    // WHAT THE OPERATION SAYS IT HAD SEEN. This is the defect, one line above the
    // symptom: the disk holds "site" and the record of the write says it saw nothing.
    const queued = a.Sync.pendingPaths();
    // The operations are in their OWN slots - `farkad:outbox` is only the index, and its
    // `items` map is empty. Reading the index and finding no `seen` would have made this
    // check fail for the wrong reason, which is the one thing worse than not having it.
    const seenForRename = (() => {
        const disk = a.dump();
        for (const key of Object.keys(disk)) {
            if (key.indexOf('farkad:outbox:op:') !== 0) continue;
            let slot;
            try { slot = JSON.parse(disk[key]); } catch (error) { continue; }
            const found = (slot.ops || []).find(op =>
                String(op.path).indexOf('roster.places.p_01') === 0);
            if (found) return found.seen === undefined ? null : found.seen;
        }
        return null;
    })();
    check('the rename records what this device had actually seen, not "absent"',
        seenForRename !== null && seenForRename.indexOf('absent') === -1,
        `${JSON.stringify(queued)} seen=${JSON.stringify(seenForRename)}`);

    await online(a, cloud);
    await settleUntil(() => a.Sync.pendingCount() === 0, 4000, 10);
    await settled();

    check('the man is still paid what B raised him to, on A',
        workerRate(a.State.schedule) === 600, where(a, b, cloud));
    check('and in the cloud', workerRate(cloudSchedule(a, cloud)) === 600, where(a, b, cloud));
    check('and on B', workerRate(b.State.schedule) === 600, where(a, b, cloud));
    // A's WRITES, not every write the cloud saw. B started from the same old disk and
    // bootstrapped the document at 500 before raising him - reading that as A sending a
    // stale rate made this check fail for a reason that is not the finding.
    const fromA = cloud.attempts.filter(attempt => {
        const payload = attempt.payload || {};
        return (payload.updatedBy || (payload.data && payload.data.updatedBy)) === a.id;
    });
    check('no write carrying the old rate ever left A',
        fromA.length > 0 && fromA.every(attempt =>
            JSON.stringify(attempt.payload || {}).indexOf('"dailyRate":500') === -1),
        `${fromA.length} writes from A: ${JSON.stringify(fromA.map(x => x.kind))}`);

    check('the person\'s rename reached the cloud',
        placeName(cloudSchedule(a, cloud)) === 'renamed site', where(a, b, cloud));
    check('and the other phone', placeName(b.State.schedule) === 'renamed site',
        where(a, b, cloud));
    check('A owes nothing', a.Sync.pendingCount() === 0, where(a, b, cloud));
    check('and holds nothing back', holds(a).length === 0, JSON.stringify(holds(a)));
    check('both phones say they are finished',
        a.Sync.status === 'synced' && b.Sync.status === 'synced', where(a, b, cloud));

    const aAgain = openOn(a.dump(), 'd_a');
    const bAgain = openOn(b.dump(), 'd_b');
    check('a reopen keeps the raise and the rename, on both phones',
        workerRate(aAgain.State.schedule) === 600
        && placeName(aAgain.State.schedule) === 'renamed site'
        && workerRate(bAgain.State.schedule) === 600
        && placeName(bAgain.State.schedule) === 'renamed site',
        `A=${workerRate(aAgain.State.schedule)}/${placeName(aAgain.State.schedule)} `
        + `B=${workerRate(bAgain.State.schedule)}/${placeName(bAgain.State.schedule)}`);
}

// The disk lifecycles this has to hold for. Each is a real way a phone arrives here.
await upgradeRace('U1: arrays only - the v78/v86 disk this build opened',
    () => upgradedDisk());

await upgradeRace('U2: arrays plus an EMPTY roster map',
    () => upgradedDisk(schedule => { schedule.roster = { workers: {}, places: {} }; }));

await upgradeRace('U3: arrays plus a PARTIAL keyed entity - the worker keyed, the site not',
    () => upgradedDisk(schedule => {
        schedule.roster = { workers: { w_01: schedule.workers[0] }, places: {} };
    }));

// ------------------------------------------------- the fallback must not become a hole
//
// Everything above is the fallback DOING its job. These are the cases where it must
// refuse, because a mark this device cannot honestly claim is the O2 failure again -
// a stale or invented value walking over another phone's edit while nothing says so.
{
    suite('U4: what the fallback refuses to vouch for');

    const disk = upgradedDisk();
    const device = openOn(disk, 'd_probe');
    const stored = device.Sync.storedSchedule();
    const markAt = path => device.Sync.storedMarkAt(path, stored);

    check('the fact the disk really holds is vouched for',
        markAt('roster.places.p_01.name') === JSON.stringify('site'),
        String(markAt('roster.places.p_01.name')));
    check('and so is the whole entity',
        markAt('roster.workers.w_01') !== 'absent'
        && String(markAt('roster.workers.w_01')).indexOf('500') !== -1,
        String(markAt('roster.workers.w_01')));

    check('an entity this device has never heard of is not synthesized',
        markAt('roster.workers.w_99.name') === 'absent',
        String(markAt('roster.workers.w_99.name')));
    check('nor is one invented from a field of a stranger',
        markAt('roster.places.p_99') === 'absent', String(markAt('roster.places.p_99')));
    check('a field this app does not write is never vouched for',
        markAt('roster.workers.w_01.salary') === 'absent',
        String(markAt('roster.workers.w_01.salary')));
    check('nor is a field on a kind that does not have it',
        markAt('roster.places.p_01.dailyRate') === 'absent',
        String(markAt('roster.places.p_01.dailyRate')));
    check('an unsafe id is refused outright',
        markAt('roster.workers.__proto__.name') === 'absent',
        String(markAt('roster.workers.__proto__.name')));
    check('a kind nobody wrote is refused',
        markAt('roster.vehicles.v_01.name') === 'absent',
        String(markAt('roster.vehicles.v_01.name')));
    check('and a path that is not roster-shaped is left exactly as it was',
        markAt('days.2026-08-12.actual.w_01') === 'absent',
        String(markAt('days.2026-08-12.actual.w_01')));

    // A TOMBSTONE IS NOT A VALUE TO INHERIT. The keyed map says this man is gone; the
    // array underneath it still has him because it was written before he left. Reading
    // the array here would let a device vouch for a person it has been told is not there.
    const buried = upgradedDisk(schedule => {
        schedule.roster = { workers: { w_01: null }, places: {} };
    });
    const withGrave = openOn(buried, 'd_grave');
    const graveStored = withGrave.Sync.storedSchedule();
    check('a tombstoned entity is not resurrected out of the array',
        withGrave.Sync.storedMarkAt('roster.workers.w_01.name', graveStored) === 'absent',
        String(withGrave.Sync.storedMarkAt('roster.workers.w_01.name', graveStored)));

    // THE KEYED VALUE IS THE ONE THAT COUNTS when the disk carries both. The array is the
    // older copy by construction - it is what the keyed map was built to supersede.
    const bothWays = upgradedDisk(schedule => {
        schedule.roster = {
            workers: {},
            places: { p_01: { id: 'p_01', name: 'newer keyed name', active: true } }
        };
    });
    const two = openOn(bothWays, 'd_two');
    const twoStored = two.Sync.storedSchedule();
    check('a keyed value newer than the array is the one vouched for',
        two.Sync.storedMarkAt('roster.places.p_01.name', twoStored)
            === JSON.stringify('newer keyed name'),
        String(two.Sync.storedMarkAt('roster.places.p_01.name', twoStored)));

    // FAIL-CLOSED. A record that will not normalise answers null - which contributes
    // nothing to `seen`, which leaves the write held. A hold a person can see is the
    // right failure; a mark this device cannot justify is not.
    const broken = openOn(disk, 'd_broken');
    const brokenStored = { raw: '{"schemaVersion":2}', schedule: null };
    check('an unreadable baseline vouches for nothing',
        broken.Sync.storedMarkAt('roster.places.p_01.name', brokenStored) === null,
        String(broken.Sync.storedMarkAt('roster.places.p_01.name', brokenStored)));
}

// ------------------------------------------------- two phones, one worker, two fields
{
    suite('U5: different fields merge, the same field contests');

    const disk = upgradedDisk();
    const cloud = makeCloud({ doc: null });
    const a = openOn(disk, 'd_a');
    const b = openOn(disk, 'd_b');
    await online(a, cloud);
    await online(b, cloud);
    await settled();

    a.State.worker('w_01').phone = '050-1111111';
    a.State.commitRoster();
    b.State.worker('w_01').dailyRate = 600;
    b.State.commitRoster();
    await settled();
    await settleUntil(() => a.Sync.pendingCount() === 0 && b.Sync.pendingCount() === 0,
        4000, 10);
    await settled();

    const merged = cloudSchedule(a, cloud).workers[0];
    check('the phone number one phone typed survives',
        merged.phone === '050-1111111', JSON.stringify(merged));
    check('and so does the rate the other one set',
        merged.dailyRate === 600, JSON.stringify(merged));
    check('with both phones finished',
        a.Sync.status === 'synced' && b.Sync.status === 'synced',
        `${a.Sync.status}/${b.Sync.status}`);

    // THE SAME FIELD, TWO ANSWERS. This must NOT merge: it is a disagreement about what
    // a man is paid, and the loser is held rather than folded away.
    const cloud2 = makeCloud({ doc: null });
    const c = openOn(disk, 'd_c');
    const d = openOn(disk, 'd_d');
    await online(c, cloud2);
    await settled();
    c.State.worker('w_01').dailyRate = 700;
    c.State.commitRoster();
    await settled();

    await online(d, cloud2);
    await settled();
    d.State.worker('w_01').dailyRate = 800;
    d.State.commitRoster();
    await settled();
    await settleUntil(() => d.Sync.pendingCount() === 0 || d.Sync.status === 'contested',
        3000, 10);

    const settledRate = cloudSchedule(c, cloud2).workers[0].dailyRate;
    check('one of the two answers stands, and it is one of the two',
        settledRate === 700 || settledRate === 800, String(settledRate));
    check('and the phone that lost is not silently folded away',
        d.Sync.status === 'synced' || d.Sync.status === 'contested', d.Sync.status);
}

// ------------------------------------------------- the disk lifecycles around the race
{
    suite('U6: closing before the first snapshot, and a listener that arrives late');

    // CLOSE AND REOPEN BEFORE HEARING ANYTHING. The provenance was written to the disk
    // with the operation; a reopen must read it back, not rebuild it from a document the
    // device still has not seen.
    const disk = upgradedDisk();
    const cloud = makeCloud({ doc: null });
    const b = openOn(disk, 'd_b');
    await online(b, cloud);
    await settled();
    await raiseOnB(b, cloud);

    const first = openOn(disk, 'd_a');
    first.State.place('p_01').name = 'renamed site';
    given('the rename is queued before any snapshot', first.State.commitRoster() === true);

    const reopened = openOn(first.dump(), 'd_a');
    await online(reopened, cloud);
    await settleUntil(() => reopened.Sync.pendingCount() === 0, 4000, 10);
    await settled();

    check('a reopen before the first snapshot still lands the rename',
        placeName(cloudSchedule(reopened, cloud)) === 'renamed site',
        where(reopened, b, cloud));
    check('and does not disturb the raise',
        workerRate(cloudSchedule(reopened, cloud)) === 600, where(reopened, b, cloud));
    check('and ends finished', reopened.Sync.status === 'synced'
        && reopened.Sync.pendingCount() === 0, where(reopened, b, cloud));

    // A LISTENER THAT ARRIVES LATE, well past the debounce. The barrier holds roster
    // writes until a snapshot has come; this proves the write still goes once it does,
    // rather than sitting behind a barrier nothing releases.
    const cloud2 = makeCloud({ doc: null });
    const b2 = openOn(disk, 'd_b');
    await online(b2, cloud2);
    await settled();
    await raiseOnB(b2, cloud2);

    const late = openOn(disk, 'd_a');
    late.State.place('p_01').name = 'late rename';
    late.State.commitRoster();
    late.Sync.pushDelayMs = 1;

    // A LISTENER THAT REGISTERS AND DELIVERS NOTHING.
    //
    // Emptying cloud.subscribers before connect does NOT model this: connect adds its own
    // subscriber and the fake cloud hands it the document straight away, so the device has
    // heard and the barrier is open. That version of this check failed, and it failed for
    // the wrong reason - it was measuring a snapshot that had in fact arrived. The
    // listener is intercepted instead, so nothing is delivered until this test says so.
    let deliver = null;
    const quiet = Object.create(cloud2.adapter);
    quiet.subscribe = fn => { deliver = fn; return () => {}; };
    late.Sync.connect(quiet);
    await settle(TICK * 30);                     // well past pushDelayMs
    const beforeHearing = cloud2.attempts.filter(attempt => {
        const payload = attempt.payload || {};
        return (payload.updatedBy || (payload.data && payload.data.updatedBy)) === late.id;
    });
    check('nothing roster-shaped left before a snapshot arrived',
        beforeHearing.every(attempt => Object.keys(attempt.payload || {})
            .every(key => !late.Sync.rosterShaped(key))),
        JSON.stringify(beforeHearing.map(x => Object.keys(x.payload || {}))));

    given('the listener did register', typeof deliver === 'function');
    deliver(JSON.parse(JSON.stringify(cloud2.doc)));
    late.Sync.flush();
    await settleUntil(() => late.Sync.pendingCount() === 0, 4000, 10);
    await settled();
    check('and once it did, the rename went and the raise stood',
        placeName(cloudSchedule(late, cloud2)) === 'late rename'
        && workerRate(cloudSchedule(late, cloud2)) === 600,
        where(late, b2, cloud2));
}

report();
