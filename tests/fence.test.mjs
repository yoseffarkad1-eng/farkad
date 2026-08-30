// The snapshot fence, after it is narrowed.
//
// Store bumps a counter on every durable write so that Recovery.rawSnapshot can tell
// "nothing moved" from "moved and came back" - the ABA a value comparison cannot see.
// The counter is about to be bumped only for the keys Recovery.rawRecords() actually
// reads, because a phone was paying a second synchronous localStorage write, on every
// save, all evening, for restore points and preferences that cannot appear in a rescue
// file at all and therefore cannot move under one.
//
// Narrowing a fence is the kind of change that looks free and is not: under-fencing is
// silent, and what it produces is a file that says stable:true about a disk that moved.
// So both halves are pinned here. The amplification half is RED at this commit - the
// narrowing has not shipped - and the ABA half is GREEN and must stay green through it.
//
// Nothing below reads a source file or asks one caller of a function about another
// caller of the same function. Membership of "the keys the snapshot reads" is decided by
// asking Recovery.rawRecords() what it returned, with the key on the disk at the time.

import { makeDevice, sharedStore } from './harness.mjs';
import { suite, check, same, given, report } from './runner.mjs';

// ---------------------------------------------------------------- shared seams

function seed(device) {
    device.State.schedule.workers = [
        { id: 'w_01', name: 'דוד', active: true, dailyRate: 400, hourlyRate: 50 },
        { id: 'w_02', name: 'שרה', active: true, dailyRate: 350, hourlyRate: 0 },
        { id: 'w_03', name: 'עלי', active: true, dailyRate: 300, hourlyRate: 40 }
    ];
    device.State.schedule.places = [
        { id: 'p_01', name: 'הרצליה', active: true },
        { id: 'p_02', name: 'תל אביב', active: true }
    ];
    device.State.save({ silent: true });
    return device;
}

// Deterministic dates, computed here rather than off the wall clock: a suite whose
// failing run cannot be repeated tomorrow is not evidence of anything.
function dayAfter(date, n) {
    const [y, m, d] = date.split('-').map(Number);
    const at = new Date(Date.UTC(y, m - 1, d + n));
    return at.toISOString().slice(0, 10);
}

function record(device, date, workerId, placeId) {
    return device.State.commit(
        device.call('assignPlace', device.State.schedule, date, workerId, 'actual', placeId));
}

// Every durable write this device makes, with what the counter did across it.
//
// Wrapped at Store's own seam, so what is counted is a real call from the app's own code
// - State.commit, takeDailySnapshot, pushUndoState - and not a list of keys a test
// decided the app writes. The counter is read through readWriteTick(), which reads the
// disk, so a bump that never left memory would not be counted as one.
function watchWrites(device) {
    const store = device.Store;
    const log = [];
    let depth = 0;
    ['set', 'remove', 'removeVerified'].forEach(name => {
        const original = store[name];
        store[name] = function watched(key, ...rest) {
            // Only the outermost call. Store.set can reclaim, which calls Store.remove,
            // and counting the inner bump twice would invent amplification that is not
            // there - which is exactly the mistake this file exists to catch.
            if (depth > 0) return original.call(this, key, ...rest);
            depth += 1;
            const before = this.readWriteTick();
            try {
                const landed = original.call(this, key, ...rest);
                log.push({
                    name, key: String(key), landed,
                    moved: (this.readWriteTick() || 0) - (before || 0)
                });
                return landed;
            } finally { depth -= 1; }
        };
    });
    return log;
}

// A second tab that writes a value and puts the old one back, in the gap between the
// exporter's two readings of the disk.
//
// Fired off a read of 'scheduleData:v2' because that is a key every reading passes
// through, so the interleaving lands at the same moment whichever key is being moved -
// the in-set families and the out-of-set control are then measured under one experiment
// and the difference between them is the fence, not the timing. It re-arms itself: the
// snapshot gets five attempts, and a disturbance that happened once would leave four
// quiet ones and a file that calls itself stable for the wrong reason.
function abaDuringSnapshot(shared, tabA, tabB, key) {
    const held = tabB.Store.durableGet(key);
    let busy = false;
    let fired = 0;
    const hook = readKey => {
        if (!busy && readKey === 'scheduleData:v2') {
            busy = true;
            fired += 1;
            tabB.Store.set(key, String(held) + '·B');
            tabB.Store.set(key, String(held));
            busy = false;
        }
        shared.interleave(hook);
    };
    shared.interleave(hook);
    const snapshot = tabA.global('Recovery').rawSnapshot();
    shared.interleave(null);
    return {
        stable: snapshot.stable,
        captures: snapshot.captures.length,
        fired,
        restored: tabB.Store.durableGet(key) === held
    };
}

// ---------------------------------------------------------------- a season of days
{
    suite('a season of days: the counter moves for what the file carries, and nothing else');

    const device = seed(makeDevice());
    const START = '2026-03-02';
    const DAYS = 156;

    // Armed after the seed, so the roster write and the boot machinery are not counted
    // against the recording path - what is being measured is an evening of work.
    const writes = watchWrites(device);

    // Every key any reading of the rescue file carried, sampled once a day. Presence here
    // is the only definition of "the snapshot reads this key" used anywhere below: it is
    // what rawRecords() actually returned, with the key on the disk at the time.
    const carried = new Set();

    for (let n = 0; n < DAYS; n += 1) {
        const date = dayAfter(START, n);
        device.setToday(date);
        // The morning photograph and the way back: the two biggest records this app
        // writes that the rescue file does not carry, so they are the whole point.
        device.call('takeDailySnapshot');
        record(device, date, 'w_01', 'p_01');
        record(device, date, 'w_02', 'p_01');
        record(device, date, 'w_03', 'p_02');
        if (n % 20 === 0) device.call('pushUndoState', device.State.schedule);
        Object.keys(device.global('Recovery').rawRecords()).forEach(key => carried.add(key));
    }

    // The device id, minted by the sync layer itself rather than written by hand: it is
    // in the app's own list of records and is NOT in the rescue file, which is the trap
    // any narrowing built on that list would fall into.
    device.Store.remove('farkad:deviceId');
    device.call('syncDeviceId');
    device.Store.set('farkadMessageStyle', 'plain');

    const inside = writes.filter(item => carried.has(item.key));
    const outside = writes.filter(item => !carried.has(item.key));

    given('the season wrote records the rescue file carries', inside.length > 0);
    given('and records it does not', outside.length > 0);
    given('the schedule and the queue are among the ones it carries',
        carried.has('scheduleData:v2') && carried.has('farkad:outbox'));
    given('the restore points and the device id are not',
        !carried.has('scheduleData:snap:' + START)
        && !carried.has('farkad:deviceId')
        && !carried.has('scheduleData:v2backup'));

    // GREEN, and it must stay green: a narrowing that drops one of these families is a
    // rescue file that says stable:true over a disk that moved underneath it.
    const missed = inside.filter(item => item.landed !== false && item.moved !== 1);
    check('every write to a record the file carries moved the counter exactly once',
        missed.length === 0,
        `${inside.length} writes, ${missed.length} wrong` +
        (missed[0] ? ` — first ${missed[0].name} ${missed[0].key} moved ${missed[0].moved}` : ''));

    // RED at this commit. bumpWriteTick fires for every key Store touches, so a restore
    // point, an undo stack, a preference and the device id each cost a second
    // synchronous write to prove a quiet moment for a file none of them appear in.
    const amplified = outside.filter(item => item.moved !== 0);
    check('no write to a record the file does not carry moved the counter',
        amplified.length === 0,
        `${outside.length} such writes, ${amplified.length} moved it` +
        (amplified[0] ? ` — first ${amplified[0].name} ${amplified[0].key}` : ''));

    const bumps = writes.reduce((sum, item) => sum + Math.max(0, item.moved), 0);
    check('and the evening costs one disk write per edit, not two',
        bumps <= inside.length,
        `${writes.length} writes, ${bumps} counter bumps — ${(bumps / writes.length).toFixed(3)}x`);
}

// ------------------------------------------- what the rescue file does not carry
{
    suite('the records the rescue file does not carry, observed rather than assumed');

    const device = seed(makeDevice());
    device.setToday('2026-03-01');
    record(device, '2026-03-01', 'w_01', 'p_01');
    device.call('takeDailySnapshot');
    device.call('pushUndoState', device.State.schedule);
    device.Store.set('farkadMessageStyle', 'plain');
    device.putRaw('farkad:sendClaim', '{"by":"d_test1","token":"t","at":1}');

    const carried = device.global('Recovery').rawRecords();
    const OUTSIDE = [
        ['the morning restore point', 'scheduleData:snap:2026-03-01'],
        ['the way back from the last restore', 'scheduleData:v2backup'],
        ['the undo stack', 'scheduleData:undoStack'],
        ['the device id', 'farkad:deviceId'],
        ['the cross-tab send claim', 'farkad:sendClaim'],
        ['the WhatsApp message style', 'farkadMessageStyle']
    ];

    OUTSIDE.forEach(([label, key]) => {
        // On the disk AND absent from the file: without the first half this says nothing.
        check(`${label} is on the device and not in the rescue file`,
            device.raw(key) !== null && !Object.prototype.hasOwnProperty.call(carried, key),
            `on disk ${device.raw(key) !== null}, carried ${key in carried}`);
    });
}

// ---------------------------------------------------------------- the ABA fence
{
    suite('the ABA fence, one family at a time');

    const shared = sharedStore();
    const tabA = seed(makeDevice({ sharedStorage: shared, deviceId: 'd_A' }));
    const tabB = makeDevice({ sharedStorage: shared, deviceId: 'd_B' });

    tabA.setToday('2026-03-01');
    record(tabA, '2026-03-01', 'w_01', 'p_01');
    record(tabA, '2026-03-02', 'w_02', 'p_02');
    tabA.call('takeDailySnapshot');
    tabA.call('pushUndoState', tabA.State.schedule);

    // Staged the way a half-finished write or an older build leaves them: these are
    // records the file carries and the app does not necessarily write in one session, and
    // a fence that covers only what today's happy path writes is not a fence.
    const staged = {
        'scheduleData': '{"days":{"2026-01-04":{"w_01":"p_01"}}}',
        'scheduleData:migrationIssues': '[{"date":"2026-01-04","worker":"w_01"}]',
        'scheduleData:v2:damaged': '{"days":{"2026-01-05"',
        'farkad:pendingReplace': '{"phase":"prepared","version":2}',
        'farkad:pendingReplace:v71': '{"phase":"prepared"}',
        'farkad:provenance:v1': '{"mine":["w_01"]}',
        'farkad:prov:gen': '7',
        'farkad:outbox:ack:abc123': 'a',
        'farkad:outbox:beat:abc123': 'a',
        'farkad:outbox:active1': '{"seq":0,"items":{}}'
    };
    Object.keys(staged).forEach(key => tabA.putRaw(key, staged[key]));

    const batchKey = tabA.Sync.queueKeys().find(key => key.indexOf(':op:') !== -1);
    given('the queue put a batch of its own on the disk', typeof batchKey === 'string');

    const carried = tabA.global('Recovery').rawRecords();

    // Non-vacuity, and the control for everything below: undisturbed, the snapshot says
    // stable. A fence that answered false always would pass every ABA check here.
    const quiet = tabA.global('Recovery').rawSnapshot();
    check('with nobody else writing, the snapshot says it is one moment',
        quiet.stable === true && quiet.captures.length === 1,
        `stable ${quiet.stable}, ${quiet.captures.length} readings`);

    const INSIDE = [
        ['the schedule', 'scheduleData:v2'],
        ['the record an old build wrote', 'scheduleData'],
        ['the decisions the migration refused to guess', 'scheduleData:migrationIssues'],
        ['a quarantined copy', 'scheduleData:v2:damaged'],
        ['a restore that has not finished', 'farkad:pendingReplace'],
        ['its frozen v71 companion', 'farkad:pendingReplace:v71'],
        ['the provenance record', 'farkad:provenance:v1'],
        ['one provenance fact', 'farkad:prov:gen'],
        ['the queue slot', 'farkad:outbox'],
        ['a second queue slot', 'farkad:outbox:active1'],
        ['a batch of queued edits', batchKey],
        ['what the cloud has acknowledged', 'farkad:outbox:ack:abc123'],
        ['a retirement mark', 'farkad:outbox:beat:abc123']
    ];

    INSIDE.forEach(([label, key]) => {
        given(`${label} is a record the rescue file carries`,
            Object.prototype.hasOwnProperty.call(carried, key));
        const seen = abaDuringSnapshot(shared, tabA, tabB, key);
        given(`${label}: the other tab put the old value back`, seen.restored && seen.fired > 0);
        // captures === 1 is the half that matters. Both readings agreed - the value
        // comparison saw nothing - so the only thing that could have refused this
        // snapshot is the counter. Without it the file would say stable over a disk that
        // held a different value in between.
        check(`${label}: changed and changed back, the snapshot refuses to call itself stable`,
            seen.stable === false && seen.captures === 1,
            `stable ${seen.stable}, ${seen.captures} distinct readings, ${seen.fired} interleavings`);
    });

    // RED at this commit, all five. None of these can appear in the file, so none of them
    // can have moved under it - and a snapshot that reports itself unprovable because a
    // restore point was rewritten is telling somebody their rescue file is incomplete
    // when it is not.
    const OUTSIDE = [
        ['the morning restore point', 'scheduleData:snap:2026-03-01'],
        ['the way back from the last restore', 'scheduleData:v2backup'],
        ['the undo stack', 'scheduleData:undoStack'],
        ['the device id', 'farkad:deviceId'],
        ['the cross-tab send claim', 'farkad:sendClaim']
    ];
    tabA.putRaw('farkad:sendClaim', '{"by":"d_B","token":"t","at":1}');

    OUTSIDE.forEach(([label, key]) => {
        given(`${label} is on the disk`, tabA.raw(key) !== null);
        given(`${label} is not a record the rescue file carries`,
            !Object.prototype.hasOwnProperty.call(carried, key));
        const seen = abaDuringSnapshot(shared, tabA, tabB, key);
        given(`${label}: the other tab put the old value back`, seen.restored && seen.fired > 0);
        check(`${label}: rewritten mid-export, the snapshot is still one moment`,
            seen.stable === true,
            `stable ${seen.stable}, ${seen.captures} distinct readings, ${seen.fired} interleavings`);
    });

    // The machinery is not left broken by the run above.
    const after = tabA.global('Recovery').rawSnapshot();
    check('and the fence still answers stable once the other tab stops',
        after.stable === true, `stable ${after.stable}`);
}

// -------------------------------------------------- a counter that cannot be written
{
    suite('a counter with no room says so, and does not pretend');

    // The disk refuses the counter and nothing else. This is the state a phone reaches at
    // the very end of a full evening, and it is the one where pretending is worst: the
    // snapshot cannot prove a quiet moment, and the file is the only thing left.
    const held = seed(makeDevice());
    held.setToday('2026-03-01');
    record(held, '2026-03-01', 'w_01', 'p_01');
    // Every key the fence writes, not just the shared one. The evidence is one counter per
    // tab now - farkad:writeTick:tab:<who>:<epoch> - because a single shared number is a
    // read-modify-write another tab can put back. Faulting only the shared key would fault
    // a value nothing consults and leave this suite measuring nothing.
    held.setQuota(key => String(key).indexOf('farkad:writeTick') === 0);

    const landed = record(held, '2026-03-02', 'w_02', 'p_02');
    given('the day itself still reached the disk', landed === true);

    const heldSnap = held.global('Recovery').rawSnapshot();
    check('the counter could not move, so the snapshot does not claim one moment',
        heldSnap.stable === false, `stable ${heldSnap.stable}`);
    check('and the day recorded under that counter is still in the file',
        String(heldSnap.records['scheduleData:v2']).indexOf('2026-03-02') !== -1,
        Object.keys(heldSnap.records).sort().join(' '));

    // RED at this commit. The only writes made while the counter was refused are records
    // the file does not carry, so after the narrowing the counter is never asked to move
    // and there is nothing it failed to prove. Today Store.unfenced latches for the rest
    // of the session and every export afterwards declares itself unstable - on a device
    // whose whole remaining hope is that file.
    const spare = seed(makeDevice());
    spare.setToday('2026-03-01');
    record(spare, '2026-03-01', 'w_01', 'p_01');
    spare.setQuota(key => key === 'farkad:writeTick');

    spare.call('takeDailySnapshot');
    spare.call('pushUndoState', spare.State.schedule);
    spare.Store.set('farkadMessageStyle', 'plain');
    given('the restore point was written even though the counter was refused',
        spare.raw('scheduleData:v2backup') !== null);

    const spareSnap = spare.global('Recovery').rawSnapshot();
    check('a counter refused for a record the file does not carry does not put it in doubt',
        spareSnap.stable === true, `stable ${spareSnap.stable}`);
    check('and either way the file still carries the day',
        String(spareSnap.records['scheduleData:v2']).indexOf('2026-03-01') !== -1,
        Object.keys(spareSnap.records).sort().join(' '));

    // Storage gone entirely is a different failure and must not be answered the same way:
    // there is no disk to be quiet, so there is nothing to prove and nothing to pretend.
    const gone = seed(makeDevice());
    record(gone, '2026-03-01', 'w_01', 'p_01');
    gone.failWrite(() => true);
    gone.Store.set('scheduleData:v2', JSON.stringify(gone.State.schedule));
    const goneSnap = gone.global('Recovery').rawSnapshot();
    same('storage that is gone is reported as unreadable, not as unstable',
        [goneSnap.storageReadable, goneSnap.stable], [false, false]);
}

report();
