// P0-C: the recovery snapshot must never falsely claim to be one moment.
//
//     node fence2.test.mjs          (from anywhere inside the checkout)
//
// Recovery.rawSnapshot brackets its two readings of the disk with Store's write tick, so
// that "moved and came back" can be told from "nothing moved" - a comparison of values
// cannot see a value that left and returned. Every claim of stable:true in a rescue file
// rests on that counter, and on nothing else.
//
// This file asks what the counter is actually worth. It is written against the disk the
// way the app leaves it - two real tabs on ONE localStorage, the app's own Store, the
// app's own Recovery, and for the last two suites the real exportRecoveryData through the
// real anchor press - because every failure below survives a test that reaches past any
// one of those.
//
// Nothing here reads a source file or asserts on the shape of the code. Every claim is
// about what the app returned with the bytes that were on the disk at the time.

import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';

// The suite must run from the scratchpad AND from tests/ once it is copied in, so the
// checkout is found rather than named: a suite that hardcodes a path tests whatever tree
// happened to be at that path.
const HERE = dirname(fileURLToPath(import.meta.url));
function locateTests() {
    const tried = [];
    const walkUp = start => {
        let dir = start;
        for (let step = 0; step < 12; step += 1) {
            tried.push(dir, join(dir, 'tests'));
            const up = dirname(dir);
            if (up === dir) break;
            dir = up;
        }
    };
    // This file's own checkout, and nothing else. An override goes through
    // tests/treecheck.mjs, which binds it to a commit - see tests/blobs.test.mjs - rather
    // than being read here, and process.cwd() is whatever directory somebody happened to
    // type the command in.
    walkUp(HERE);
    const found = tried.find(dir =>
        existsSync(join(dir, 'harness.mjs')) && existsSync(join(dir, 'runner.mjs')));
    if (!found) {
        throw new Error('cannot find the checkout: run from inside it, or set FARKAD_ROOT');
    }
    return found;
}

const TESTS = locateTests();
const { makeDevice, sharedStore, settle } =
    await import(pathToFileURL(join(TESTS, 'harness.mjs')).href);
const { suite, check, given, report } =
    await import(pathToFileURL(join(TESTS, 'runner.mjs')).href);

const TICK = 'farkad:writeTick';
const SCHEDULE = 'scheduleData:v2';
const PENDING = 'farkad:pendingReplace';
const LAST_READ = 'farkad:pendingReplace:v71';   // the last key every reading passes through

console.log(`# running against ${dirname(TESTS)}`);

// ------------------------------------------------------------------ shared seams

const WORKERS = [
    { id: 'w_01', name: 'David', active: true, dailyRate: 400, hourlyRate: 50 },
    { id: 'w_02', name: 'Sara', active: true, dailyRate: 350, hourlyRate: 0 }
];
const PLACES = [
    { id: 'p_01', name: 'Herzliya', active: true },
    { id: 'p_02', name: 'Tel Aviv', active: true }
];

function seed(device) {
    device.State.schedule.workers = WORKERS.map(worker => Object.assign({}, worker));
    device.State.schedule.places = PLACES.map(place => Object.assign({}, place));
    device.State.save({ silent: true });
    return device;
}

// A whole schedule record, the way one lands on the disk.
function document(days) {
    return JSON.stringify({
        schemaVersion: 2,
        workers: WORKERS.map(worker => Object.assign({}, worker)),
        places: PLACES.map(place => Object.assign({}, place)),
        days,
        advances: {},
        updatedAt: '2026-08-11T05:00:00.000Z',
        updatedBy: 'd_B'
    });
}

function record(device, date, workerId, placeId) {
    return device.State.commit(device.call('assignPlace',
        device.State.schedule, date, workerId, 'actual', placeId));
}

// Two tabs of one app on one disk. `disk` is what both of them are given, so a fault
// armed on it is a fault of the DEVICE, which is what a full or lying disk actually is.
function twoTabs(disk) {
    const shared = disk || sharedStore();
    const tabA = seed(makeDevice({ sharedStorage: shared, deviceId: 'd_A' }));
    const tabB = makeDevice({ sharedStorage: shared, deviceId: 'd_B' });
    tabA.setToday('2026-03-01');
    record(tabA, '2026-03-01', 'w_01', 'p_01');
    return { shared, tabA, tabB };
}

// The value on the disk, read WITHOUT going through getItem - the interleave hook fires
// on every read, and a test that measures the disk must not disturb what it is measuring.
function onDisk(shared, key) {
    return Object.prototype.hasOwnProperty.call(shared, key) ? shared[key] : null;
}

// A second tab that writes a value and puts the old one back, in the gap between the
// exporter's two readings. Lifted from tests/fence.test.mjs, which is where the shape of
// this was settled: fired off a read of the schedule because every reading passes through
// it, and re-armed inside itself because the snapshot gets five attempts.
function abaDuringSnapshot(shared, exporter, writer, key) {
    const held = writer.Store.durableGet(key);
    let busy = false;
    let fired = 0;
    const hook = readKey => {
        if (!busy && readKey === SCHEDULE) {
            busy = true;
            fired += 1;
            writer.Store.set(key, String(held) + ' B');
            writer.Store.set(key, String(held));
            busy = false;
        }
        shared.interleave(hook);
    };
    shared.interleave(hook);
    const snapshot = exporter.global('Recovery').rawSnapshot();
    shared.interleave(null);
    return {
        stable: snapshot.stable,
        captures: snapshot.captures.length,
        fired,
        restored: writer.Store.durableGet(key) === held
    };
}

// A disk that ACCEPTS a write to `key` and stores nothing - the browser said yes and the
// bytes are not there.
//
// The harness has a seam for a write that throws (__quota, __failWrite) and one for a
// write that lands CHANGED (__corrupt). It has none for a write that is swallowed, and
// setItem on its localStorage is non-writable and non-configurable, so this puts a
// façade in front of the harness's own object rather than replacing or editing it: every
// read, every removal, every stored property and Object.keys() go straight through to the
// real one, and the only thing that differs is that setItem for a matching key returns
// without storing. That is what a swallowed write looks like from inside the page.
function swallowing(disk, matches) {
    const facade = {
        setItem(key, value) {
            if (matches(String(key))) return;
            disk.setItem(key, value);
        }
    };
    return new Proxy({}, {
        get: (_, name) => (Object.prototype.hasOwnProperty.call(facade, name)
            ? facade[name] : Reflect.get(disk, name)),
        has: (_, name) => name in disk,
        set: (_, name, value) => { disk[name] = value; return true; },
        deleteProperty: (_, name) => { delete disk[name]; return true; },
        defineProperty: (_, name, descriptor) => {
            Object.defineProperty(disk, name, descriptor);
            return true;
        },
        ownKeys: () => Reflect.ownKeys(disk),
        getOwnPropertyDescriptor(_, name) {
            const found = Reflect.getOwnPropertyDescriptor(disk, name);
            if (!found) return undefined;
            // Reported configurable because the façade's target does not hold them: the
            // proxy invariants forbid claiming a fixed property the target has not got.
            return {
                value: 'value' in found ? found.value : disk[name],
                writable: true, enumerable: found.enumerable, configurable: true
            };
        }
    });
}

// A restore transaction landing on one disk while another tab exports.
//
// The two records move TOGETHER - the disk holds the schedule and the envelope from
// before it, or the schedule and the envelope from after it. The write order is chosen so
// that the only pair either half is briefly in is (new schedule, old envelope): the cross
// this test is about, (OLD schedule, NEW envelope), never exists on the disk at any
// instant, and every state that does is recorded below and asserted against.
function restoreDuringExport(shared, writer, before, after) {
    const wasOnDisk = [];
    const note = () => wasOnDisk.push(onDisk(shared, SCHEDULE) + ' ' + onDisk(shared, PENDING));
    let busy = false;
    let flips = 0;

    const forward = () => {
        writer.Store.set(SCHEDULE, after.schedule); note();
        writer.Store.set(PENDING, after.pending); note();
    };
    const backward = () => {
        writer.Store.set(PENDING, before.pending); note();
        writer.Store.set(SCHEDULE, before.schedule); note();
    };

    const hook = readKey => {
        if (!busy && readKey === SCHEDULE) {
            busy = true; flips += 1; forward(); busy = false;
        } else if (!busy && readKey === LAST_READ) {
            busy = true; backward(); busy = false;
        }
        shared.interleave(hook);
    };

    return {
        settle() { busy = true; backward(); busy = false; },
        finish() { busy = true; forward(); busy = false; },
        arm() { shared.interleave(hook); },
        stop() { shared.interleave(null); },
        wasOnDisk,
        get flips() { return flips; }
    };
}

// What is on the disk now, and what a restore is about to put there: the same record with
// one more evening in it. Taken from the bytes the app itself wrote, so nothing here
// depends on a hand-built document being one the app would accept.
function twoStates(device) {
    const before = String(device.Store.durableGet(SCHEDULE));
    const doc = JSON.parse(before);
    doc.days['2026-08-11'] = {
        plan: {},
        actual: { w_02: { entries: [{ placeId: 'p_02' }], rates: { daily: 350, hourly: 0 } } }
    };
    return { before, after: JSON.stringify(doc) };
}
const P0 = JSON.stringify({ phase: 'prepared', version: 2, at: '2026-08-11T05:00:00.000Z' });
const P1 = JSON.stringify({ phase: 'applied', version: 2, at: '2026-08-11T05:00:00.000Z' });

// The dialogs, answered. The harness's document has no elements, so this is the only way
// what the person was TOLD can be read back.
function answering(device) {
    const said = [];
    device.ctx.askTell = message => { said.push(message); return Promise.resolve(); };
    device.ctx.askConfirm = () => Promise.resolve(true);
    device.ctx.askText = () => Promise.resolve('');
    device.ctx.openMigrationModal = () => {};
    return said;
}

const WARNED = 'was taken while something changed';   // filled in from the app below

// ============================================================ F1: the write that threw
{
    suite('F1: the counter is refused in the writing tab, and the exporting tab cannot tell');

    const { shared, tabA, tabB } = twoTabs();
    const started = tabA.Store.readWriteTick();

    // No room for the counter and room for everything else. This is the phone at the end
    // of a long evening, and it is the state where pretending is worst.
    tabB.setQuota(key => key === TICK);

    const seen = abaDuringSnapshot(shared, tabA, tabB, SCHEDULE);

    given('the other tab wrote during the export and put the old value back',
        seen.fired > 0 && seen.restored, `fired ${seen.fired}, restored ${seen.restored}`);
    given('and the counter really could not move',
        tabA.Store.readWriteTick() === started,
        `${started} -> ${tabA.Store.readWriteTick()}`);

    check('a counter write refused for space is known to the tab that is exporting',
        tabA.Store.unfenced === true,
        `writer tab unfenced ${tabB.Store.unfenced}, exporting tab unfenced ${tabA.Store.unfenced}`);

    check('and the snapshot refuses to call itself one moment',
        seen.stable === false,
        `stable ${seen.stable}, ${seen.captures} distinct readings, ${seen.fired} interleavings`);
}

// ======================================================== F2: the write that vanished
{
    suite('F2: the counter write is accepted and stored nowhere');

    const disk = swallowing(sharedStore(), key => key === TICK);
    const { shared, tabA, tabB } = twoTabs(disk);

    given('nothing threw, so no tab was told anything',
        tabA.Store.available === true && tabB.Store.available === true);
    given('and the counter is not on the disk at all', onDisk(shared, TICK) === null,
        JSON.stringify(onDisk(shared, TICK)));

    const seen = abaDuringSnapshot(shared, tabA, tabB, SCHEDULE);
    given('the other tab wrote during the export and put the old value back',
        seen.fired > 0 && seen.restored, `fired ${seen.fired}, restored ${seen.restored}`);

    check('a counter write the disk swallows is noticed by somebody',
        tabA.Store.unfenced === true || tabB.Store.unfenced === true,
        `writer ${tabB.Store.unfenced}, exporter ${tabA.Store.unfenced}, `
        + `readWriteTick() -> ${JSON.stringify(tabA.Store.readWriteTick())}`);

    check('and the snapshot refuses to call itself one moment',
        seen.stable === false,
        `stable ${seen.stable}, ${seen.captures} distinct readings, ${seen.fired} interleavings`);
}

// ========================================================= F3: the write that changed
{
    suite('F3: the counter write lands, changed');

    const { shared, tabA, tabB } = twoTabs();
    const before = tabA.Store.readWriteTick();

    // The disk takes the write and hands back something else. Nothing throws; the only
    // way to find out is to read it back.
    tabB.corruptWhen(key => key === TICK);
    tabB.Store.set(SCHEDULE, String(tabB.Store.durableGet(SCHEDULE)));

    given('the counter on the disk is no longer a number',
        /[^0-9]/.test(String(onDisk(shared, TICK))),
        JSON.stringify(onDisk(shared, TICK)));

    check('a counter that came back corrupted is not read as the number zero',
        tabA.Store.readWriteTick() !== 0,
        `on disk ${JSON.stringify(onDisk(shared, TICK))}, `
        + `readWriteTick() -> ${JSON.stringify(tabA.Store.readWriteTick())}, was ${before}`);

    check('and somebody was told the fence stopped working',
        tabA.Store.unfenced === true || tabB.Store.unfenced === true,
        `writer ${tabB.Store.unfenced}, exporter ${tabA.Store.unfenced}`);

    const seen = abaDuringSnapshot(shared, tabA, tabB, SCHEDULE);
    given('the other tab wrote during the export and put the old value back',
        seen.fired > 0 && seen.restored, `fired ${seen.fired}, restored ${seen.restored}`);
    check('the snapshot refuses to call itself one moment',
        seen.stable === false,
        `stable ${seen.stable}, ${seen.captures} distinct readings, ${seen.fired} interleavings`);
}

// ====================================================== F4: the counter is not a number
{
    suite('F4: bytes that are not a counter are not a counter');

    const NONSENSE = [
        ['letters', 'abc'],
        ['nothing at all', ''],
        ['an object', '{}'],
        ['a null literal', 'null'],
        ['half a number', '1e']
    ];

    NONSENSE.forEach(([label, bytes]) => {
        const { tabA } = twoTabs();
        tabA.putRaw(TICK, bytes);
        const read = tabA.Store.readWriteTick();
        check(`a counter of ${label} does not read as the number zero`,
            read !== 0, `readWriteTick() -> ${JSON.stringify(read)} for ${JSON.stringify(bytes)}`);

        const snapshot = tabA.global('Recovery').rawSnapshot();
        check(`and a snapshot taken over a counter of ${label} does not claim one moment`,
            snapshot.stable === false, `stable ${snapshot.stable}`);
    });

    // Numeric bytes that CANNOT be incremented: past 2^53 an integer plus one is itself,
    // and four hundred digits is Infinity. The counter is then frozen for good - it reads
    // the same before and after every write anybody makes, for the life of the device.
    const STUCK = [
        ['a counter past the integers', String(Number.MAX_SAFE_INTEGER + 3)],
        ['a counter of four hundred digits', '9'.repeat(400)]
    ];

    STUCK.forEach(([label, bytes]) => {
        const { shared, tabA, tabB } = twoTabs();
        tabA.putRaw(TICK, bytes);
        const held = String(tabB.Store.durableGet(SCHEDULE));
        const before = tabA.Store.readWriteTick();

        tabB.Store.set(SCHEDULE, held + ' ');
        const mid = tabA.Store.readWriteTick();
        tabB.Store.set(SCHEDULE, held);
        const after = tabA.Store.readWriteTick();
        check(`${label}: every durable write to a record the file carries moves it`,
            mid !== before && after !== mid,
            `${String(before)} -> ${String(mid)} -> ${String(after)}, `
            + `on disk ${String(onDisk(shared, TICK)).slice(0, 24)}`);

        const seen = abaDuringSnapshot(shared, tabA, tabB, SCHEDULE);
        given(`${label}: the other tab wrote and put the old value back`,
            seen.fired > 0 && seen.restored);
        check(`${label}: the snapshot refuses to call itself one moment`,
            seen.stable === false,
            `stable ${seen.stable}, ${seen.captures} distinct readings, ${seen.fired} interleavings`);
    });
}

// ================================================ F5: a pair that was never on the disk
{
    suite('F5: two records, and a combination of them the disk was never in');

    const { shared, tabA, tabB } = twoTabs();
    const { before: S0, after: S1 } = twoStates(tabA);
    tabB.corruptWhen(key => key === TICK);       // the fence, broken the quietest way

    const restore = restoreDuringExport(shared, tabB, { schedule: S0, pending: P0 },
        { schedule: S1, pending: P1 });
    restore.settle();
    given('the disk starts before the restore',
        onDisk(shared, SCHEDULE) === S0 && onDisk(shared, PENDING) === P0);

    restore.arm();
    const snapshot = tabA.global('Recovery').rawSnapshot();
    restore.stop();

    given('the restore did land between the exporter reads', restore.flips > 0,
        `${restore.flips} flips`);

    const got = snapshot.records[SCHEDULE] + ' ' + snapshot.records[PENDING];
    const everHeld = new Set(restore.wasOnDisk);
    given('what came out is the old schedule beside the new envelope',
        snapshot.records[SCHEDULE] === S0 && snapshot.records[PENDING] === P1,
        `schedule ${snapshot.records[SCHEDULE] === S0 ? 'old' : 'new'}, `
        + `envelope ${snapshot.records[PENDING] === P1 ? 'new' : 'old'}`);
    given('and the disk was never in that state, at any instant',
        !everHeld.has(got), `${everHeld.size} distinct states passed through`);

    check('the snapshot does not call a pair that never coexisted one moment',
        snapshot.stable === false,
        `stable ${snapshot.stable}, ${snapshot.captures.length} distinct readings`);

    check('and if it will not say so, it carries more than the one reading',
        snapshot.stable === false || snapshot.captures.length > 1,
        `stable ${snapshot.stable}, ${snapshot.captures.length} readings`);
}

// ============================================== F6: a counter that is read, then written
{
    suite('F6: a paused writer puts the counter back');

    const shared = sharedStore();
    const tabA = seed(makeDevice({ sharedStorage: shared, deviceId: 'd_A' }));
    const tabB = makeDevice({ sharedStorage: shared, deviceId: 'd_B' });
    const tabC = makeDevice({ sharedStorage: shared, deviceId: 'd_C' });
    tabA.setToday('2026-03-01');
    record(tabA, '2026-03-01', 'w_01', 'p_01');

    const start = tabA.Store.readWriteTick();
    const bytes = String(tabB.Store.durableGet(SCHEDULE));
    let stale = null;
    let peak = start;

    // Tab B is preempted between reading the counter and writing it back - the one moment
    // two tabs make possible and one tab cannot. Everything inside the hook happens while
    // B holds a number that is already out of date. The hook is one-shot, so it re-arms
    // itself until the read it is waiting for.
    const waitForTick = () => shared.interleave((key, value) => {
        if (key !== TICK) { waitForTick(); return; }
        stale = value;
        tabC.Store.set('farkad:provenance:v1', '{"mine":["w_01"]}');
        tabC.Store.set('farkad:provenance:v1', '{"mine":["w_01","w_02"]}');
        peak = tabA.Store.readWriteTick();
    });
    waitForTick();
    tabB.Store.set(SCHEDULE, bytes);
    shared.interleave(null);

    const landed = tabA.Store.readWriteTick();
    given('the paused tab really did read an out-of-date counter',
        stale !== null && Number(stale) === Number(start), `read ${JSON.stringify(stale)}`);
    given('and other contexts moved it on while it was paused', peak > Number(start),
        `${start} -> ${peak}`);

    check('the fence never goes backwards',
        landed >= peak, `read ${stale}, others reached ${peak}, ended at ${landed}`);

    // What that costs, in the exact order rawSnapshot does it: the counter is read, the
    // records are read twice with another tab writing in between, the counter is read
    // again. The verdict below is the app's own - Store's counter, Recovery's own
    // sameRecordMap, Store.unfenced - with only the ORDER supplied by the test, because
    // the paused tab's write has to land between the second reading and the second look
    // at the counter, and no seam here can suspend a tab across a function return.
    const shared2 = sharedStore();
    const exporter = seed(makeDevice({ sharedStorage: shared2, deviceId: 'd_X' }));
    const paused = makeDevice({ sharedStorage: shared2, deviceId: 'd_Y' });
    const other = makeDevice({ sharedStorage: shared2, deviceId: 'd_Z' });
    exporter.setToday('2026-03-01');
    record(exporter, '2026-03-01', 'w_01', 'p_01');

    const original = String(paused.Store.durableGet(SCHEDULE));
    const bracket = {};
    shared2.interleave((key, value) => {
        if (key !== TICK) return;
        bracket.stale = value;
        // One durable write by somebody else, so the exporter's first look at the counter
        // is one ahead of the number the paused tab is holding.
        other.Store.set('farkad:provenance:v1', '{"mine":["w_01"]}');

        bracket.before = exporter.Store.readWriteTick();
        bracket.first = exporter.global('Recovery').rawRecords();
        // The disk holds something else, and puts it back: the ABA the counter exists for.
        other.Store.set(SCHEDULE, original + ' ');
        other.Store.set(SCHEDULE, original);
        bracket.second = exporter.global('Recovery').rawRecords();
    });
    // The paused tab's own write: the same bytes back, so no reading can see it by value.
    paused.Store.set(SCHEDULE, original);
    shared2.interleave(null);
    bracket.after = exporter.Store.readWriteTick();

    const sameRecordMap = exporter.global('sameRecordMap');
    const quiet = bracket.before !== null && bracket.after !== null
        && bracket.before === bracket.after && !exporter.Store.unfenced;
    const verdict = quiet && sameRecordMap(bracket.first, bracket.second);

    given('the bracket ran while the paused tab was holding a stale counter',
        bracket.before !== undefined && bracket.stale !== undefined,
        JSON.stringify({ stale: bracket.stale, before: bracket.before }));
    given('and both readings saw the same bytes, so only the counter could refuse them',
        bracket.first[SCHEDULE] === original && bracket.second[SCHEDULE] === original);

    check('the quiet test is not satisfied by a counter that was put back',
        verdict === false,
        `counter ${bracket.before} -> ${bracket.after} (paused tab held ${bracket.stale}), `
        + `readings equal ${sameRecordMap(bracket.first, bracket.second)}, verdict ${verdict}`);
}

// ============================================ F7: the real file, through the real press
{
    suite('F7: the rescue file a person is actually holding');

    const shared = sharedStore();
    const tabA = seed(makeDevice({ sharedStorage: shared, deviceId: 'd_A' }));
    const tabB = makeDevice({ sharedStorage: shared, deviceId: 'd_B' });
    tabA.setToday('2026-08-10');
    record(tabA, '2026-08-10', 'w_01', 'p_01');
    const { before: S0, after: S1 } = twoStates(tabA);
    const said = answering(tabA);
    tabB.corruptWhen(key => key === TICK);

    const restore = restoreDuringExport(shared, tabB, { schedule: S0, pending: P0 },
        { schedule: S1, pending: P1 });
    restore.settle();
    given('the exporting tab is showing the evening of the tenth',
        Object.keys(tabA.State.schedule.days || {}).join() === '2026-08-10',
        JSON.stringify(Object.keys(tabA.State.schedule.days || {})));

    restore.arm();
    tabA.call('exportRecoveryData');
    restore.stop();
    // The restore finishes a moment after the export, which is where the phone is left.
    restore.finish();

    given('a file was handed to the browser', tabA.downloads.length === 1,
        JSON.stringify(tabA.downloads.map(file => file.name)));
    const file = JSON.parse(tabA.downloads[0].text);
    given('the restore landed between the exporter reads', restore.flips > 0,
        `${restore.flips} flips`);

    const pair = file.records[SCHEDULE] + ' ' + file.records[PENDING];
    const everHeld = new Set(restore.wasOnDisk);
    given('the file carries the old schedule beside the new envelope',
        file.records[SCHEDULE] === S0 && file.records[PENDING] === P1,
        JSON.stringify({
            schedule: file.records[SCHEDULE] === S0 ? 'old' : 'new',
            envelope: file.records[PENDING] === P1 ? 'new' : 'old'
        }));
    given('and the disk was never in that state, at any instant', !everHeld.has(pair),
        `${everHeld.size} distinct states passed through`);

    // Reported the way tests/adversarial.test.mjs E10 and E11 report it, because that is
    // where a run of this failure is read from: `captures` is not a number in the file
    // and never can be - it is an array when the readings would not settle and ABSENT
    // when the file called itself stable - so a claim of stable:true prints as
    // {"stable":true,"captures":0} through those two detail lines.
    const asReported = JSON.stringify({
        stable: file.stable, captures: (file.captures || []).length
    });
    check('the file does not say it is one moment of the phone',
        file.stable === false,
        `${asReported}  (the captures key is `
        + `${file.captures === undefined ? 'absent from the file' : 'present'})`);

    check('and it carries the readings it took, rather than dropping them',
        Array.isArray(file.captures) && file.captures.length >= 1, asReported);

    check('the person is told the file was taken while something was changing',
        said.some(message => String(message && message.title).indexOf('נלקח בזמן שמשהו השתנה') !== -1),
        JSON.stringify(said.map(message => message && message.title)));

    // The far side. What a rescue file is FOR is the week it rebuilds on another phone.
    const rescuer = seed(makeDevice({ deviceId: 'd_rescuer' }));
    answering(rescuer);
    rescuer.call('importBackup', rescuer.fileEvent(tabA.downloads[0].name, tabA.downloads[0].text));
    await settle(80);

    const rebuilt = Object.keys(rescuer.State.schedule.days || {}).sort();
    const onPhone = (() => {
        const reopened = makeDevice({ storage: tabA.dump(), deviceId: 'd_reopened' });
        reopened.State.load();
        return Object.keys(reopened.State.schedule.days || {}).sort();
    })();
    check('what the file rebuilds is what the phone actually holds',
        rebuilt.join() === onPhone.join(),
        JSON.stringify({ file: rebuilt, phone: onPhone, stable: file.stable }));
}

// ========================= F8: the bytes always leave, and every reading goes with them
{
    suite('F8: the raw export is never blocked, and never quietly loses a reading');

    // A disk that will not settle: every reading of it is different. This is the device
    // the rescue file exists for, and the export is the only way its bytes leave.
    const shared = sharedStore();
    const tabA = seed(makeDevice({ sharedStorage: shared, deviceId: 'd_hurt' }));
    const tabB = makeDevice({ sharedStorage: shared, deviceId: 'd_hurt_b' });
    const said = answering(tabA);
    tabA.setToday('2026-03-01');
    record(tabA, '2026-03-01', 'w_01', 'p_01');

    // A record that will not parse, quarantined, with the device HELD: writes are blocked
    // from here on and the only way those bytes leave is this button.
    tabA.putRaw('scheduleData:migrationIssues', '[{"date":"2026-03-0');
    tabA.global('Recovery').damaged('scheduleData:migrationIssues',
        '[{"date":"2026-03-0', 'unreadable', true);
    given('the device is held', tabA.global('Recovery').blocked() === true);

    let n = 0;
    const hook = readKey => {
        if (readKey === SCHEDULE) {
            n += 1;
            tabB.Store.set(PENDING, JSON.stringify({ phase: 'prepared', n }));
        }
        shared.interleave(hook);
    };
    shared.interleave(hook);
    tabA.call('exportRecoveryData');
    shared.interleave(null);

    check('the file is handed over anyway', tabA.downloads.length === 1,
        JSON.stringify(tabA.downloads.map(file => file.name)));
    const file = JSON.parse(tabA.downloads[0].text);

    check('and the bytes that would not parse are in it',
        file.records['scheduleData:migrationIssues'] === '[{"date":"2026-03-0',
        JSON.stringify(Object.keys(file.records || {}).sort()));

    check('a disk that would not settle is reported as one that would not settle',
        file.stable === false, `stable ${JSON.stringify(file.stable)}`);

    const readings = Array.isArray(file.captures) ? file.captures : [];
    const distinct = new Set(readings.map(records => JSON.stringify(records)));
    check('every distinct reading is in the file',
        readings.length >= 2 && distinct.size === readings.length,
        `${readings.length} readings carried, ${distinct.size} distinct, ${n} interleavings`);

    check('and the differences between them are still there to be read',
        new Set(readings.map(records => records[PENDING])).size >= 2,
        JSON.stringify(readings.map(records => records[PENDING])));

    check('the person is told the file was taken while something was changing',
        said.some(message => String(message && message.title).indexOf('נלקח בזמן שמשהו השתנה') !== -1),
        JSON.stringify(said.map(message => message && message.title)));
}

report();
