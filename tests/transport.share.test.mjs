// הסעות, shared: one plan of the rides on three phones - the client half, in Node.
//
//   node tests/transport.share.test.mjs
//
// The owner, 2026-11-10: "add the feature to the other accounts" - one shared plan. The
// design is docs/transport-spec.md, "Phase 3: shared"; the client is
// js/ui/transport-share.js; the cloud here is the fake in tests/harness.mjs
// (makeTransportCloud), which is written to what tests/transport.emulator.test.mjs
// measured the production adapter and the real rules to do.
//
// What is pinned, block by block:
//   the gate is OPEN in this build (v186) - and SHUT, through the test seam, it is still
//     the app of before byte for byte, so the way back stays measured;
//   open, a phone that never turned הסעות on reads, listens to and writes nothing;
//   a phone with no cloud works as before;
//   a change goes up, the other phone draws it, and neither touches the RECORD's
//     document, outbox or status sentence - whatever the transport cloud does;
//   two phones at once: one lands, the loser holds the winner's plan, its own aside, and
//     the sentence - and a man is never in two seats;
//   a day offline and back; a vehicle kept home against a man seated in it;
//   the first meeting with the cloud, in each of its four cases;
//   the rules of today refusing every path: «עדיין לא משותף», nothing lost;
//   three places the app can be stopped mid-step, and what the next opening makes of each;
//   what stays on the phone (a driver's «נפתח» mark), v174's rule, pruning, a document
//     of a version this build does not know, the backup and the rescue file;
//   and the REAL older builds, out of Git, beside a cloud that holds shared plans.

import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { makeDevice, makeCloud, sharedStore, settle, settleUntil, loadOrder, sourceRoot } from './harness.mjs';
import { suite, check, same, given, report } from './runner.mjs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const SEDER = read('../js/ui/seder.js');
const ENGINE = read('../js/model/transport.js');
const SCREEN = read('../js/ui/transport.js');
const SHARE = read('../js/ui/transport-share.js');
const ADAPTER = read('../js/sync/firebase-adapter.js');
const TICK = 6;

const DAY = '2026-11-10';
const NEXT = '2026-11-11';
const ENABLED = 'farkadTransport:enabled';
const SETTINGS = 'farkadTransport:settings';
const dayKey = date => `farkadTransport:day:${date}`;
const sharedKey = name => `farkadTransport:shared:${name}`;
const asideKey = name => `farkadTransport:aside:${name}`;
const DOC = `day_${DAY}`;

async function block(name, body) {
    suite(name);
    try {
        await body();
    } catch (error) {
        check(`${name}: the block ran to its end`, false,
            String((error && error.stack) || error).split('\n').slice(0, 4).join(' | '));
    }
}

const WORKERS = () => [
    { id: 'w_01', name: 'אחמד', active: true, dailyRate: 400, hourlyRate: 0, phone: '052-884-1930' },
    { id: 'w_02', name: 'מוחמד', active: true, dailyRate: 400, hourlyRate: 0, phone: '0541234567' },
    { id: 'w_03', name: 'יוסי', active: true, dailyRate: 400, hourlyRate: 0, phone: '' },
    { id: 'w_04', name: 'סמיר', active: true, dailyRate: 400, hourlyRate: 0, phone: '0501112233' },
    { id: 'w_06', name: 'Ali Hassan', active: true, dailyRate: 400, hourlyRate: 0, phone: '0587654321' }
];
const PLACES = () => [
    { id: 'p_01', name: 'הרצליה', active: true },
    { id: 'p_02', name: 'חיפה', active: true }
];

function loadScripts(device, withShare = true) {
    vm.runInContext(SEDER, device.ctx, { filename: 'js/ui/seder.js' });
    vm.runInContext(ENGINE, device.ctx, { filename: 'js/model/transport.js' });
    vm.runInContext(SCREEN, device.ctx, { filename: 'js/ui/transport.js' });
    if (withShare) vm.runInContext(SHARE, device.ctx, { filename: 'js/ui/transport-share.js' });
    return device;
}

// A phone. As shipped (no flag at all) the gate is open; `gate: false` shuts it the only
// way a suite can, the test seam - which is what a later build with the line put back to
// false would be. (Before v186 it was the other way round: shut as shipped, opened by
// the seam.) `on` is the phone's own switch; `storage` is a disk carried over.
function phone(id, options = {}) {
    const storage = options.storage || (options.on === false ? undefined : { [ENABLED]: '1' });
    const device = makeDevice({ deviceId: id, storage: options.sharedStorage ? undefined : storage,
        sharedStorage: options.sharedStorage, flags: options.gate === false ? { transportShare: false } : null });
    device.Sync.pushDelayMs = TICK;
    device.setToday(options.today || DAY);
    device.ctx.askTell = () => Promise.resolve();
    device.ctx.askConfirm = () => Promise.resolve(true);
    loadScripts(device, options.share !== false);
    if (options.share !== false) {
        const share = device.global('TransportShare');
        share.flushDelayMs = TICK;
        share.staleGraceMs = TICK;
        share.retryMs = TICK * 3;
        share.retryMaxMs = TICK * 20;
    }
    if (options.storage || options.loadOnly) device.State.load();
    else {
        device.State.schedule.workers = WORKERS();
        device.State.schedule.places = PLACES();
        device.State.save({ silent: true });
        [DAY, NEXT].forEach(date => {
            [['w_01', 'p_01'], ['w_02', 'p_01'], ['w_03', 'p_02'], ['w_04', 'p_02'], ['w_06', 'p_02']].forEach(([w, p]) => {
                device.State.commit(device.call('assignPlace', device.State.schedule, date, w, 'actual', p));
            });
        });
    }
    return device;
}
const shareOf = device => device.global('TransportShare');
const place = (device, worker, vehicle, n, date = DAY) => device.call('transportPlace', date, worker, vehicle, n);
const seats = (device, date = DAY) => {
    const trips = device.call('transportDayOf', date).trips;
    return Object.keys(trips).sort().map(v => `${v}=${trips[v].driver || '?'}+[${trips[v].passengers.join(',')}]`).join(' ');
};
const cloudSeats = (cloud, name = DOC) => {
    const doc = cloud.transport.docs.get(name);
    if (!doc) return null;
    return Object.keys(doc.trips).sort().map(v => `${v}=${doc.trips[v].driver || '?'}+[${doc.trips[v].passengers.join(',')}]`).join(' ');
};
const rev = (cloud, name = DOC) => (cloud.transport.docs.get(name) || { revision: 0 }).revision;
const transportKeys = device => Object.keys(device.dump()).filter(key => /transport/i.test(key)).sort();
// Everyone in a document, each man once or more: the test for "never in two seats".
const everyone = doc => Object.keys(doc.trips).flatMap(v => [doc.trips[v].driver].concat(doc.trips[v].passengers)).filter(Boolean);
const noneTwice = doc => new Set(everyone(doc)).size === everyone(doc).length;
// Settled: nothing owed, every phone says shared, AND every phone's own record of every
// document in the cloud is at the cloud's revision - "owes nothing" alone is also true of
// a phone that has not heard the other's last write yet.
const idle = async (cloud, ...devices) => settleUntil(() => devices.every(device =>
    shareOf(device).owed() === null && shareOf(device).state() === 'shared'
    && [...cloud.transport.docs.entries()].every(([name, doc]) => {
        const raw = device.raw(sharedKey(name));
        return Boolean(raw) && JSON.parse(raw).rev === doc.revision;
    })), 5000);
const stamp = (data, revision, by = 'd_other') => Object.assign({ v: 1, revision, updatedAt: '2026-11-10T05:00:00.000Z', updatedBy: by }, data);
const dayDoc = (trips, revision, extra = {}) => stamp(Object.assign({ date: DAY, unavailable: {}, status: {}, trips }, extra), revision);

// ================================================================== the gate

// MOVED in v186, deliberately: this block was 'the gate is shut in this build, and shut it
// is today's app byte for byte', and its first check was that the shipped constant says
// false. The build now ships it true. Everything else the block measures is kept, about
// the SHUT path, reached through the seam.
await block('the gate is open in this build - and shut again (the seam) it is the app of before, byte for byte', async () => {
    check('the shipped constant says true', /\nconst TRANSPORT_SHARE = true;\n/.test(SHARE));
    same('a phone as shipped, with no flag of any kind, reads the gate open', shareOf(phone('d_shipped')).on(), true);
    check('and nothing the app ships defines the test seam that opens it',
        !/FARKAD_FLAG_OVERRIDES\s*=[^=]/.test(SHARE + SCREEN + ADAPTER));

    // The same evening on two phones: one built WITHOUT the share file at all, one with
    // it and the gate shut, signed in, and handed a transport cloud.
    const evening = device => {
        place(device, 'w_01', 'tv_01', 1);
        place(device, 'w_02', 'tv_01', 2);
        place(device, 'w_03', 'tv_05', 9);
        device.call('transportSetStatus', DAY, 'w_06', 'private');
        device.call('transportSetAvailable', DAY, 'tv_07', false);
        device.call('transportRenameVehicle', 'tv_02', 'קורולה לבנה');
        device.call('transportSetVehicleSeats', 'tv_06', 7);
        device.call('transportUnseat', DAY, 'w_02');
        device.call('transportPrune', DAY);
    };
    const before = phone('d_same', { gate: false, share: false });
    evening(before);

    const cloud = makeCloud();
    const after = phone('d_same', { gate: false });
    const reads = [];
    const get = after.Store.get.bind(after.Store);
    after.Store.get = key => { reads.push(String(key)); return get(key); };
    after.Sync.connect(cloud.adapter);
    same('the adapter\'s hand-over is declined', shareOf(after).connect(cloud.transport.adapter), false);
    await settleUntil(() => after.Sync.status === 'synced' && after.Sync.pendingCount() === 0, 5000);
    evening(after);
    after.call('openTransport', DAY);
    await settle(TICK * 10);

    same('the gate reads shut', shareOf(after).on(), false);
    same('every transport key on the disk is byte for byte what the build without the file wrote',
        transportKeys(after).map(key => `${key}=${after.raw(key)}`), transportKeys(before).map(key => `${key}=${before.raw(key)}`));
    same('which are the three it always wrote', transportKeys(after), [dayKey(DAY), ENABLED, SETTINGS].sort());
    same('the transport cloud was never called', cloud.transport.attempts.length, 0);
    same('no key of the shared plan was ever read', reads.filter(key => /:shared:|:aside:/.test(key)), []);
    same('it says nothing on the screen', shareOf(after).state(), 'off');
    same('and offers no notice', shareOf(after).notices(DAY).length, 0);
    same('a document handed straight to it is refused', shareOf(after).take(DOC, dayDoc({}, 1)), 'off');
    check('the switch keeps the sentence that says the plan is on this phone only',
        after.global('TRANSPORT_TEXT').switchLead.includes('לא משותף עם הטלפונים האחרים'));
});

await block('the gate open: a phone that never turned הסעות on reads, hears and writes nothing', async () => {
    const cloud = makeCloud();
    cloud.transport.put(DOC, dayDoc({ tv_01: { driver: 'w_01', passengers: [], seats: {} } }, 1));
    const reads = [];
    const device = phone('d_off', { on: false });
    const get = device.Store.get.bind(device.Store);
    device.Store.get = key => { reads.push(String(key)); return get(key); };
    device.Sync.connect(cloud.adapter);
    shareOf(device).connect(cloud.transport.adapter);
    device.call('openTransport', DAY);
    await settle(TICK * 10);
    same('the gate is open', shareOf(device).on(), true);
    same('the cloud was not asked for anything', cloud.transport.attempts.length, 0);
    same('the only transport key read is the switch', [...new Set(reads.filter(key => /transport/i.test(key)))], [ENABLED]);
    same('and no transport key was written', transportKeys(device), []);
    same('nothing is said', shareOf(device).state(), 'off');

    // Turned on, in the same session, it starts; turned off, it stops.
    device.call('transportSetEnabled', true);
    const got = await settleUntil(() => seats(device) === 'tv_01=w_01+[]', 5000);
    check('turned on while signed in, the shared day arrives', got, seats(device));
    device.call('transportSetEnabled', false);
    const calls = cloud.transport.attempts.length;
    cloud.transport.put(DOC, dayDoc({ tv_01: { driver: 'w_02', passengers: [], seats: {} } }, 2));
    await settle(TICK * 10);
    same('turned off, it stops listening', cloud.transport.subscribers.length, 0);
    same('and asks for nothing more', cloud.transport.attempts.length, calls);
    check('the day it had is still on the disk, as it was', JSON.parse(device.raw(dayKey(DAY))).trips.tv_01.driver === 'w_01');
});

await block('a phone with no cloud account works exactly as before', async () => {
    const device = phone('d_local');
    place(device, 'w_01', 'tv_01', 1);
    device.call('transportRenameVehicle', 'tv_02', 'קורולה לבנה');
    device.call('openTransport', DAY);
    await settle(TICK * 10);
    same('its keys are the three', transportKeys(device), [dayKey(DAY), ENABLED, SETTINGS].sort());
    same('and nothing is said about sharing', shareOf(device).state(), 'off');
    same('the plan is the plan', seats(device), 'tv_01=w_01+[]');
});

// ================================================================== shared

await block('a change goes up, the other phone draws it - and the record knows nothing of it', async () => {
    const cloud = makeCloud();
    const a = phone('d_a');
    const b = phone('d_b');
    const lineA = cloud.transport.phone();
    const lineB = cloud.transport.phone();
    a.Sync.connect(cloud.adapter);
    await settleUntil(() => a.Sync.status === 'synced' && a.Sync.pendingCount() === 0, 5000);
    const recordAttempts = cloud.attempts.length;
    const recordDoc = JSON.stringify(cloud.doc);
    const outbox = JSON.stringify(a.Sync.pendingPaths());
    const fence = a.Store.fenceState();
    const disk = a.raw('scheduleData:v2');

    same('connected, before the first answer', (shareOf(a).connect(lineA.adapter), shareOf(a).state()), 'checking');
    shareOf(b).connect(lineB.adapter);
    await settleUntil(() => shareOf(a).state() === 'shared' && shareOf(b).state() === 'shared', 5000);
    same('heard, with nothing owed', [shareOf(a).state(), shareOf(b).state()], ['shared', 'shared']);
    same('a phone that only looked wrote nothing to the cloud', cloud.transport.writes.length, 0);

    place(a, 'w_01', 'tv_01', 1);
    same('the change is on the phone at once', seats(a), 'tv_01=w_01+[]');
    same('and is said to be owed until it is up', shareOf(a).state(), 'waiting');
    place(a, 'w_02', 'tv_01', 2);
    place(a, 'w_03', 'tv_05', 9);
    given('it went up', await idle(cloud, a, b), shareOf(a).state() + '/' + shareOf(b).state());
    same('the cloud holds the day', cloudSeats(cloud), 'tv_01=w_01+[w_02] tv_05=?+[w_03]');
    same('the other phone drew it', seats(b), 'tv_01=w_01+[w_02] tv_05=?+[w_03]');
    same('and holds it on its disk', JSON.parse(b.raw(dayKey(DAY))).trips.tv_01.passengers, ['w_02']);
    same('both know which revision they hold', [JSON.parse(a.raw(sharedKey(DOC))).rev, JSON.parse(b.raw(sharedKey(DOC))).rev],
        [rev(cloud), rev(cloud)]);

    place(b, 'w_04', 'tv_05', 1);
    given('the other way', await idle(cloud, a, b));
    same('the first phone drew the second\'s change', seats(a), 'tv_01=w_01+[w_02] tv_05=w_04+[w_03]');
    check('nobody was put aside and nobody was told anything', a.raw(asideKey(DOC)) === null && b.raw(asideKey(DOC)) === null
        && shareOf(a).notices(DAY).length === 0 && shareOf(b).notices(DAY).length === 0);

    // The list of vehicles: untouched it is not uploaded, changed it is.
    check('a list nobody changed was not uploaded', !cloud.transport.docs.has('settings'));
    a.call('transportRenameVehicle', 'tv_02', 'קורולה לבנה');
    given('the list went up', await idle(cloud, a, b));
    same('the other phone has the new name', b.call('transportSettings').vehicles.find(v => v.id === 'tv_02').name, 'קורולה לבנה');
    same('and all seven', b.call('transportSettings').vehicles.length, 7);

    // NOT THE RECORD: not its document, not its queue, not its fence, not its status.
    same('the schedule document was not written', cloud.attempts.length, recordAttempts);
    same('and is byte for byte what it was', JSON.stringify(cloud.doc), recordDoc);
    check('with no word of transport in it', !/transport|tv_0/i.test(JSON.stringify(cloud.doc)));
    same('nothing was queued in the record\'s outbox', JSON.stringify(a.Sync.pendingPaths()), outbox);
    same('the write fence did not move', a.Store.fenceState(), fence);
    same('the record on the disk is as it was', a.raw('scheduleData:v2'), disk);
    same('and the record still says it is synced', a.Sync.status, 'synced');
    const sent = cloud.transport.writes.map(write => JSON.stringify(write.data)).join('\n');
    check('what went up carries ids and vehicle names, and no man\'s name, phone or site',
        !/אחמד|מוחמד|יוסי|סמיר|Ali|052|054|הרצליה|חיפה|dailyRate|p_0/.test(sent), sent.slice(0, 200));
    check('and no mark of an opened chat', !/marks|openedAt|sig/.test(sent));
    same('every key this phone wrote is a transport key of its own',
        transportKeys(a), [dayKey(DAY), ENABLED, SETTINGS, sharedKey(DOC), sharedKey('settings')].sort());
    check('none of which the rescue file or the queue knows', transportKeys(a).every(key =>
        a.call('isFarkadSnapshotKey', key) === false && a.call('isFarkadRecordKey', key) === false));
});

await block('whatever the transport cloud does, the record syncs and says so', async () => {
    const cloud = makeCloud();
    const device = phone('d_iso');
    device.Sync.connect(cloud.adapter);
    await settleUntil(() => device.Sync.status === 'synced' && device.Sync.pendingCount() === 0, 5000);

    // 1. an adapter that throws where it stands
    shareOf(device).connect({ write() { throw new Error('boom'); }, subscribe() { throw new Error('boom'); } });
    place(device, 'w_01', 'tv_01', 1);
    await settle(TICK * 10);
    same('a thrown listener: the record is synced', device.Sync.status, 'synced');
    same('and the plan is on the phone', seats(device), 'tv_01=w_01+[]');

    // 2. a cloud that refuses every transport call
    cloud.transport.reject = () => Object.assign(new Error('no'), { code: 'permission-denied' });
    shareOf(device).connect(cloud.transport.adapter);
    place(device, 'w_02', 'tv_01', 2);
    await settleUntil(() => shareOf(device).state() === 'notShared', 5000);
    same('refused: transport says it is not shared', shareOf(device).state(), 'notShared');
    device.State.commit(device.call('assignPlace', device.State.schedule, '2026-11-12', 'w_01', 'actual', 'p_02'));
    const went = await settleUntil(() => device.Sync.pendingCount() === 0 && device.Sync.status === 'synced', 5000);
    check('while an edit of the record goes up and is synced', went, device.Sync.status);
    same('the record\'s error is nobody\'s', device.Sync.lastError || null, null);

    // 3. a transport write that never answers
    cloud.transport.reject = null;
    cloud.transport.hold = () => new Promise(() => {});
    shareOf(device).connect(cloud.transport.adapter);
    await settleUntil(() => cloud.transport.attempts.some(one => one.kind === 'write'), 5000);
    device.State.commit(device.call('assignPlace', device.State.schedule, '2026-11-13', 'w_01', 'actual', 'p_02'));
    const again = await settleUntil(() => device.Sync.pendingCount() === 0 && device.Sync.status === 'synced', 5000);
    check('a transport write hanging open holds no write of the record', again, device.Sync.status);
    same('and transport says its change is not up yet', shareOf(device).state(), 'waiting');

    // The file itself.
    const code = SHARE.split('\n').filter(line => !/^\s*\/\//.test(line)).join('\n').replace(/\/\/.*$/gm, '');
    check('the share file never names the record\'s sync, commits, saves or raises Recovery',
        !/FarkadSync|State\.(commit|commitMany|save|persist)|Recovery\.|farkadWritesBlocked|setStatus|refreshStatus/.test(code));
    check('never asks with the browser\'s own dialogs', !/\b(alert|confirm|prompt)\s*\(/.test(code.replace(/askConfirm\(/g, '')));
    check('never prints, and never says a thing was sent', !/window\.print|נשלח/.test(SHARE));
    same('and has no Hebrew in its code: every word is in the screen\'s one block', code.match(/[֐-׿]+/g) || [], []);
    check('the screen\'s file still never names the record\'s sync',
        !/State\.(commit|commitMany|save|persist)\s*\(|FarkadSync\.|Recovery\./.test(SCREEN));
    same('the screen reaches the share file at five marked places and no others',
        (SCREEN.match(/transportShareTell\('(\w+)'/g) || []).map(hit => hit.slice(20, -1)).sort(),
        ['changed', 'draw', 'on', 'opened', 'switched']);
    check('the adapter hands transport over after the record, inside a try',
        ADAPTER.indexOf('window.FarkadTransportShare.connect(') > ADAPTER.indexOf('window.FarkadSync.connect({')
        && /try \{\s*if \(window\.FarkadTransportShare\) \{/.test(ADAPTER));
    same('and what it hands over can write and listen, and nothing else - there is no delete',
        Object.keys(cloud.transport.adapter).sort(), ['subscribe', 'write']);
});

// ================================================================== two people at once

// Two phones that both hold revision 1 of the day: w_01 drives tv_01.
async function pair() {
    const cloud = makeCloud();
    const a = phone('d_a');
    const b = phone('d_b');
    const lineA = cloud.transport.phone();
    const lineB = cloud.transport.phone();
    shareOf(a).connect(lineA.adapter);
    shareOf(b).connect(lineB.adapter);
    place(a, 'w_01', 'tv_01', 1);
    given('both phones hold the same day', await idle(cloud, a, b) && seats(b) === 'tv_01=w_01+[]', seats(b));
    return { cloud, a, b, lineA, lineB };
}

await block('two phones on the same seat: one lands, the other is shown it and told', async () => {
    const { cloud, a, b } = await pair();
    const base = rev(cloud);
    // The refusal arrives BEFORE the snapshot that would explain it.
    cloud.transport.muted = true;
    place(a, 'w_02', 'tv_01', 2);
    place(b, 'w_03', 'tv_01', 2);
    same('each phone shows its own man at once', [seats(a), seats(b)], ['tv_01=w_01+[w_02]', 'tv_01=w_01+[w_03]']);
    await settleUntil(() => shareOf(a).owed() === null && shareOf(b).owed() === null, 5000);
    cloud.transport.muted = false;
    cloud.transport.publish();
    given('both settle', await idle(cloud, a, b));

    same('exactly one write landed on that revision', rev(cloud), base + 1);
    const won = cloudSeats(cloud);
    check('one of the two men is in the seat', won === 'tv_01=w_01+[w_02]' || won === 'tv_01=w_01+[w_03]', won);
    same('both phones show the plan that won', [seats(a), seats(b)], [won, won]);
    const loser = won === 'tv_01=w_01+[w_02]' ? b : a;
    const winner = loser === a ? b : a;
    const aside = JSON.parse(loser.raw(asideKey(DOC)));
    same('the loser\'s own plan is aside on its disk, whole', Object.keys(JSON.parse(aside.text).trips.tv_01.seats),
        [loser === b ? 'w_03' : 'w_02']);
    same('marked as a change that lost', aside.why, 'changed');
    same('and the loser is told, about that day', shareOf(loser).notices(DAY), [{ name: DOC, why: 'changed' }]);
    same('not about any other day', shareOf(loser).notices(NEXT), []);
    same('the winner is told nothing', [shareOf(winner).notices(DAY).length, winner.raw(asideKey(DOC))], [0, null]);
    check('nobody is in two seats', noneTwice(cloud.transport.docs.get(DOC)));

    // "Use mine" is an ordinary change through the same check.
    same('use mine: the loser\'s plan is its plan again', (shareOf(loser).useMine(DOC), seats(loser)),
        loser === b ? 'tv_01=w_01+[w_03]' : 'tv_01=w_01+[w_02]');
    same('the copy aside is gone', loser.raw(asideKey(DOC)), null);
    given('it goes up', await idle(cloud, a, b));
    same('as the next revision, not over anything', rev(cloud), base + 2);
    same('and the other phone draws it, clean, with no notice', [seats(winner), shareOf(winner).notices(DAY).length],
        [seats(loser), 0]);
});

await block('the snapshot arrives first: the same loss, the same sentence, no second one', async () => {
    const { cloud, a, b } = await pair();
    shareOf(b).flushDelayMs = 100000;      // B has a change it has not sent yet
    place(b, 'w_03', 'tv_01', 2);
    place(a, 'w_02', 'tv_01', 2);
    await settleUntil(() => seats(b) === 'tv_01=w_01+[w_02]', 5000);
    same('B shows A\'s plan', seats(b), 'tv_01=w_01+[w_02]');
    same('B\'s plan is aside', JSON.parse(JSON.parse(b.raw(asideKey(DOC))).text).trips.tv_01.passengers, ['w_03']);
    same('B owes nothing now', shareOf(b).owed(), null);
    shareOf(b).flush();
    await settle(TICK * 10);
    same('and sent nothing over the winner', cloudSeats(cloud), 'tv_01=w_01+[w_02]');
    same('keep the shared one: the copy aside goes', (shareOf(b).keepShared(DOC), b.raw(asideKey(DOC))), null);
    same('and the notice with it', shareOf(b).notices(DAY), []);
});

await block('the same man into two cars: he is in one', async () => {
    const { cloud, a, b } = await pair();
    cloud.transport.muted = true;
    place(a, 'w_02', 'tv_02', 1);
    place(b, 'w_02', 'tv_05', 1);
    await settleUntil(() => shareOf(a).owed() === null && shareOf(b).owed() === null, 5000);
    cloud.transport.muted = false;
    cloud.transport.publish();
    given('both settle', await idle(cloud, a, b));
    const doc = cloud.transport.docs.get(DOC);
    check('on the server he is in exactly one seat', everyone(doc).filter(id => id === 'w_02').length === 1, cloudSeats(cloud));
    same('and on both phones in the same one', seats(a), seats(b));
    same('one phone holds its own version aside', [a, b].filter(device => device.raw(asideKey(DOC)) !== null).length, 1);
});

await block('a vehicle kept home on one phone while the other seats a man in it', async () => {
    const { cloud, a, b } = await pair();
    cloud.transport.muted = true;
    a.call('transportSetAvailable', DAY, 'tv_05', false);
    place(b, 'w_02', 'tv_05', 1);
    await settleUntil(() => shareOf(a).owed() === null && shareOf(b).owed() === null, 5000);
    cloud.transport.muted = false;
    cloud.transport.publish();
    given('both settle', await idle(cloud, a, b));
    const doc = cloud.transport.docs.get(DOC);
    check('the server holds one of the two plans, never a man in a vehicle that stays home',
        !(doc.unavailable.tv_05 && doc.trips.tv_05), JSON.stringify(doc));
    same('and both phones hold that one', [seats(a), JSON.stringify(a.call('transportDayOf', DAY).unavailable)],
        [seats(b), JSON.stringify(b.call('transportDayOf', DAY).unavailable)]);
    same('the loser was told', [a, b].filter(device => shareOf(device).notices(DAY).length === 1).length, 1);
});

await block('a phone offline for a day, and back', async () => {
    const { cloud, a, b, lineB } = await pair();
    lineB.setOnline(false);
    await settleUntil(() => shareOf(b).state() === 'unchecked', 5000);
    same('offline with nothing owed: it cannot be checked', shareOf(b).state(), 'unchecked');
    place(b, 'w_03', 'tv_02', 1);
    place(b, 'w_04', 'tv_02', 2);
    place(b, 'w_02', 'tv_05', 1, NEXT);          // a day nobody else touches
    same('its changes are on the phone at once', seats(b), 'tv_01=w_01+[] tv_02=w_03+[w_04]');
    same('and said to be owed', shareOf(b).state(), 'waiting');
    place(a, 'w_02', 'tv_01', 2);
    place(a, 'w_06', 'tv_01', 3);
    await settleUntil(() => shareOf(a).owed() === null, 5000);
    const writes = cloud.transport.writes.length;
    await settle(TICK * 20);
    same('offline, nothing of B\'s reached the cloud', cloud.transport.writes.length, writes);

    lineB.setOnline(true);
    given('back, it settles', await idle(cloud, a, b), shareOf(b).state());
    same('the day both touched: the plan in the cloud won', seats(b), 'tv_01=w_01+[w_02,w_06]');
    same('B\'s day of work is aside, whole', Object.keys(JSON.parse(JSON.parse(b.raw(asideKey(DOC))).text).trips).sort(), ['tv_01', 'tv_02']);
    same('and B is told', shareOf(b).notices(DAY), [{ name: DOC, why: 'changed' }]);
    same('the day only B touched went up as it was', cloudSeats(cloud, `day_${NEXT}`), 'tv_05=w_02+[]');
    same('and A has it', seats(a, NEXT), 'tv_05=w_02+[]');
    same('A was told nothing', shareOf(a).notices(DAY).concat(shareOf(a).notices(NEXT)), []);
});

await block('the cache speaking first is not «אין חיבור»: only a silence after it is', async () => {
    const device = phone('d_grace');
    let deliver = null;
    shareOf(device).staleGraceMs = 60;
    shareOf(device).connect({ write: () => Promise.resolve({ revision: 1 }), subscribe(from, onDocs) { deliver = onDocs; return () => {}; } });
    const said = [];
    deliver([], { live: false });
    said.push(shareOf(device).state());
    deliver([], { live: true });
    said.push(shareOf(device).state());
    await settle(120);
    said.push(shareOf(device).state());
    same('cached then live, a moment apart: checking, then shared, and never "cannot check"', said, ['checking', 'shared', 'shared']);
    deliver([], { live: false });
    said.length = 0;
    said.push(shareOf(device).state());
    await settle(120);
    said.push(shareOf(device).state());
    same('cached and then nothing: after the grace it says it cannot check', said, ['shared', 'unchecked']);
    deliver([], { live: true });
    same('and a live answer takes it back', shareOf(device).state(), 'shared');
});

// ================================================================== the first meeting

await block('the first time each phone meets the cloud', async () => {
    const cloud = makeCloud();
    // The owner's phone: a list he edited and two days planned, before any sharing.
    const owner = phone('d_owner');
    owner.call('transportRenameVehicle', 'tv_02', 'קורולה לבנה');
    place(owner, 'w_01', 'tv_01', 1);
    place(owner, 'w_02', 'tv_01', 2);
    place(owner, 'w_03', 'tv_02', 1, NEXT);
    // A day that was opened and holds nothing is nothing to share.
    owner.putRaw(dayKey('2026-11-12'), JSON.stringify({ version: 1, unavailable: {}, status: {}, trips: {}, marks: {} }));
    const ownerDisk = owner.raw(dayKey(DAY));
    shareOf(owner).connect(cloud.transport.phone().adapter);
    given('it settles', await idle(cloud, owner));
    same('an empty cloud takes his list and his days', [...cloud.transport.docs.keys()].sort(), [DOC, `day_${NEXT}`, 'settings']);
    same('each at revision 1', [rev(cloud), rev(cloud, `day_${NEXT}`), rev(cloud, 'settings')], [1, 1, 1]);
    same('his own bytes were not rewritten for it', owner.raw(dayKey(DAY)), ownerDisk);
    same('and he is told nothing', shareOf(owner).notices(DAY), []);

    // A phone that never touched anything: adopts, silently.
    const quiet = phone('d_quiet');
    same('before: the seven as seeded, in memory only', [quiet.raw(SETTINGS), quiet.call('transportSettings').vehicles[1].name],
        [null, 'טויוטה קורולה 2016']);
    shareOf(quiet).connect(cloud.transport.phone().adapter);
    given('it settles', await idle(cloud, quiet));
    same('it has the owner\'s list', quiet.call('transportSettings').vehicles[1].name, 'קורולה לבנה');
    same('and his days', [seats(quiet), seats(quiet, NEXT)], ['tv_01=w_01+[w_02]', 'tv_02=w_03+[]']);
    same('with nothing aside and nothing said', [transportKeys(quiet).filter(key => /aside/.test(key)), shareOf(quiet).notices(DAY)], [[], []]);
    same('and it wrote nothing to the cloud', cloud.transport.writes.filter(write => write.data.updatedBy === 'd_quiet').length, 0);

    // A phone with its OWN edited list and its own plan for the same day.
    const other = phone('d_third');
    other.call('transportRenameVehicle', 'tv_03', 'ביוואידי אפור');
    place(other, 'w_04', 'tv_03', 1);
    const mine = seats(other);
    shareOf(other).connect(cloud.transport.phone().adapter);
    given('it settles', await idle(cloud, other));
    same('the cloud\'s day is drawn', seats(other), 'tv_01=w_01+[w_02]');
    same('the cloud\'s list is the list', other.call('transportSettings').vehicles.slice(1, 3).map(v => v.name), ['קורולה לבנה', 'BYD סיל U 2025']);
    same('its own day is aside, marked as a first meeting', [JSON.parse(other.raw(asideKey(DOC))).why,
        Object.keys(JSON.parse(JSON.parse(other.raw(asideKey(DOC))).text).trips)], ['first', ['tv_03']]);
    same('so is its own list', JSON.parse(JSON.parse(other.raw(asideKey('settings'))).text).vehicles[2].name, 'ביוואידי אפור');
    same('and it is told of both, once each', shareOf(other).notices(DAY), [{ name: 'settings', why: 'first' }, { name: DOC, why: 'first' }]);
    same('nothing of the owner\'s was overwritten', [rev(cloud), rev(cloud, 'settings')], [1, 1]);

    same('use mine, for the day', (shareOf(other).useMine(DOC), seats(other)), mine);
    given('it goes up', await idle(cloud, other, owner, quiet));
    same('as revision 2', rev(cloud), 2);
    same('and the owner\'s phone draws it, with no notice', [seats(owner), shareOf(owner).notices(DAY)], [mine, []]);
    same('keep the shared list', (shareOf(other).keepShared('settings'), shareOf(other).notices(DAY)), []);

    // A phone with an untouched list meeting an EMPTY cloud does not become its author.
    const empty = makeCloud();
    const first = phone('d_first');
    first.call('openTransport', DAY);
    shareOf(first).connect(empty.transport.phone().adapter);
    given('it settles', await idle(empty, first));
    same('an untouched list is not uploaded', empty.transport.writes.length, 0);
});

// ================================================================== the rules of today

await block('under the rules in the field today: not shared yet, and nothing lost', async () => {
    const cloud = makeCloud({ transport: { rules: 'old' } });
    const device = phone('d_old_rules');
    device.Sync.connect(cloud.adapter);
    await settleUntil(() => device.Sync.status === 'synced' && device.Sync.pendingCount() === 0, 5000);
    shareOf(device).connect(cloud.transport.adapter);
    place(device, 'w_01', 'tv_01', 1);
    await settleUntil(() => shareOf(device).state() === 'notShared', 5000);
    same('it says the plan is not shared yet', shareOf(device).state(), 'notShared');
    same('in these words', device.global('TRANSPORT_TEXT').shareNotShared,
        'השיבוץ עדיין לא משותף: הענן אינו מאפשר זאת כרגע. הוא שמור במכשיר הזה בלבד.');
    same('the plan is on the phone', seats(device), 'tv_01=w_01+[]');
    same('not one write was tried: it never heard what is there', cloud.transport.attempts.filter(one => one.kind === 'write').length, 0);
    same('the record is synced, with no error', [device.Sync.status, device.Sync.lastError || null], ['synced', null]);
    device.State.commit(device.call('assignPlace', device.State.schedule, '2026-11-12', 'w_01', 'actual', 'p_02'));
    check('and an edit of the record still goes up', await settleUntil(() => device.Sync.pendingCount() === 0 && device.Sync.status === 'synced', 5000));

    // The owner pastes the new rules. Nothing else is done to the phone.
    cloud.transport.rules = 'new';
    given('it finds out by itself', await settleUntil(() => shareOf(device).state() === 'shared', 5000), shareOf(device).state());
    same('and the plan made meanwhile goes up', cloudSeats(cloud), 'tv_01=w_01+[]');
});

// ================================================================== stopped mid-step

await block('the app closed while a write was on its way: its own echo is not another phone\'s change', async () => {
    const cloud = makeCloud();
    const a = phone('d_a');
    shareOf(a).connect(cloud.transport.phone().adapter);
    place(a, 'w_01', 'tv_01', 1);
    given('revision 1 is up', await idle(cloud, a));
    let release = null;
    cloud.transport.hold = () => new Promise(resolve => { release = resolve; });
    place(a, 'w_02', 'tv_01', 2);
    await settleUntil(() => release !== null, 5000);
    const disk = a.dump();                       // the app is closed here
    shareOf(a).disconnect();
    cloud.transport.hold = null;
    release();
    await settleUntil(() => rev(cloud) === 2, 5000);
    same('the request landed after the app was gone', cloudSeats(cloud), 'tv_01=w_01+[w_02]');

    const again = phone('d_a', { storage: disk });
    place(again, 'w_03', 'tv_01', 3);            // and the person goes on, before any signal
    shareOf(again).connect(cloud.transport.phone().adapter);
    given('it settles', await idle(cloud, again), shareOf(again).state());
    same('nothing was put aside', again.raw(asideKey(DOC)), null);
    same('nobody was told anything', shareOf(again).notices(DAY), []);
    same('and the later change went up on top', [rev(cloud), cloudSeats(cloud)], [3, 'tv_01=w_01+[w_02,w_03]']);
});

await block('stopped between adopting a plan and noting its revision: the next opening agrees with the cloud', async () => {
    const cloud = makeCloud();
    const a = phone('d_a');
    const b = phone('d_b');
    shareOf(a).connect(cloud.transport.phone().adapter);
    shareOf(b).connect(cloud.transport.phone().adapter);
    place(a, 'w_01', 'tv_01', 1);
    given('both hold revision 1', await idle(cloud, a, b));
    // B's disk takes the day and refuses the share record.
    b.setQuota(key => String(key).indexOf('farkadTransport:shared:') === 0);
    place(a, 'w_02', 'tv_01', 2);
    await settleUntil(() => seats(b) === 'tv_01=w_01+[w_02]', 5000);
    same('B holds the new plan with the old record of it', JSON.parse(b.raw(sharedKey(DOC))).rev, 1);
    const disk = b.dump();
    const again = phone('d_b', { storage: disk });
    shareOf(again).connect(cloud.transport.phone().adapter);
    given('it settles', await idle(cloud, again), shareOf(again).state());
    same('the cloud was not written to', rev(cloud), 2);
    same('nothing is aside', again.raw(asideKey(DOC)), null);
    same('and the phone knows its revision', JSON.parse(again.raw(sharedKey(DOC))).rev, 2);
});

await block('no room to put this phone\'s copy aside: the shared plan is not drawn over it', async () => {
    const { cloud, a, b } = await pair();
    shareOf(b).flushDelayMs = 100000;
    place(b, 'w_03', 'tv_01', 2);
    b.setQuota(key => String(key).indexOf('farkadTransport:aside:') === 0);
    place(a, 'w_02', 'tv_01', 2);
    await settleUntil(() => shareOf(b).state() === 'noRoom', 5000);
    same('it says so', shareOf(b).state(), 'noRoom');
    same('this phone\'s plan is still its plan', seats(b), 'tv_01=w_01+[w_03]');
    same('on the disk too', JSON.parse(b.raw(dayKey(DAY))).trips.tv_01.passengers, ['w_03']);
    shareOf(b).flush();
    await settle(TICK * 10);
    same('and it is not sent over the winner', cloudSeats(cloud), 'tv_01=w_01+[w_02]');
    // Room again: the next word from the cloud settles it the ordinary way.
    b.setQuota(null);
    cloud.transport.publish();
    await settleUntil(() => b.raw(asideKey(DOC)) !== null, 5000);
    same('with room, the copy goes aside and the shared plan is drawn', [seats(b), shareOf(b).notices(DAY).length], ['tv_01=w_01+[w_02]', 1]);
});

await block('two windows of the app on one phone: the window that did not adopt does not send its old copy', async () => {
    const cloud = makeCloud();
    const other = phone('d_other');
    shareOf(other).connect(cloud.transport.phone().adapter);
    place(other, 'w_01', 'tv_01', 1);
    given('revision 1 is up', await idle(cloud, other));
    // One disk, two windows. Window 1 is connected and adopts; window 2 has the day open
    // in its own memory and is told by the browser that the disk changed.
    const disk = sharedStore({ [ENABLED]: '1' });
    const one = phone('d_tabs', { sharedStorage: disk });
    const two = phone('d_tabs', { sharedStorage: disk, loadOnly: true });
    shareOf(one).connect(cloud.transport.phone().adapter);
    given('window 1 holds the shared day', await idle(cloud, one) && seats(one) === 'tv_01=w_01+[]');
    same('window 2 reads it off the disk', seats(two), 'tv_01=w_01+[]');
    place(other, 'w_02', 'tv_01', 2);
    given('window 1 adopted revision 2', await settleUntil(() => seats(one) === 'tv_01=w_01+[w_02]', 5000));
    same('window 2 still holds the older copy in its memory', seats(two), 'tv_01=w_01+[]');
    same('told the disk changed, it drops it', shareOf(two).diskChanged(dayKey(DAY)), true);
    same('and reads what window 1 adopted', seats(two), 'tv_01=w_01+[w_02]');
    place(two, 'w_03', 'tv_01', 3);
    same('window 1, told in its turn, sees window 2\'s change', (shareOf(one).diskChanged(dayKey(DAY)), seats(one)), 'tv_01=w_01+[w_02,w_03]');
    given('it goes up', await idle(cloud, one, other));
    same('a change made in window 2 is a change to the plan that won, not to the one before it',
        [rev(cloud), cloudSeats(cloud)], [3, 'tv_01=w_01+[w_02,w_03]']);
    same('and nobody was put aside', [one.raw(asideKey(DOC)), other.raw(asideKey(DOC))], [null, null]);
    same('a key that is not transport\'s is none of its business', shareOf(two).diskChanged('scheduleData:v2'), false);
});

// ================================================================== a vehicle turned off
//
// The lasting switch (v184): `off: '<date>'` on the vehicle, in the list. It is a field of
// the LIST, the list's reader keeps it (transportReadVehicle), and both sides of every
// comparison here go through that reader - so it is shared with the list and by nothing
// written for it.
await block('a vehicle turned off on one phone is off on the other - by the list alone, and no day is written anywhere', async () => {
    const { cloud, a, b } = await pair();
    place(a, 'w_02', 'tv_05', 1);
    place(a, 'w_03', 'tv_05', 2);
    given('both hold the day with two men in the nine-seater', await idle(cloud, a, b) && seats(b) === 'tv_01=w_01+[] tv_05=w_02+[w_03]', seats(b));
    const dayA = a.raw(dayKey(DAY));
    const dayB = b.raw(dayKey(DAY));
    const dayRev = rev(cloud);
    const dayWrites = cloud.transport.writes.filter(write => write.name !== 'settings').length;
    const cars = device => device.call('transportContext', DAY).vehicles.map(v => v.id);
    given('it is one of the day\'s vehicles on both', cars(a).includes('tv_05') && cars(b).includes('tv_05'));

    same('turned off on A, from that day', a.call('transportSetVehicleOff', 'tv_05', DAY), true);
    given('it settles', await idle(cloud, a, b));
    same('the list went up, and says off from that day', cloud.transport.docs.get('settings').vehicles.find(v => v.id === 'tv_05').off, DAY);
    same('on B the vehicle is off from that day, with nobody touching B', b.call('transportSettings').vehicles.find(v => v.id === 'tv_05').off, DAY);
    same('and is not one of the day\'s vehicles on either', [cars(a).includes('tv_05'), cars(b).includes('tv_05')], [false, false]);
    same('its men are waiting on B, by a reading', b.call('transportContext', DAY) && Object.keys(b.global('TransportEngine')
        .layout(JSON.parse(JSON.stringify(b.call('transportContext', DAY))), JSON.parse(JSON.stringify(b.call('transportDayOf', DAY)))).where).sort(), ['w_01']);
    same('A\'s day on the disk was not rewritten', a.raw(dayKey(DAY)), dayA);
    same('nor was B\'s', b.raw(dayKey(DAY)), dayB);
    same('no day document was written in the cloud', cloud.transport.writes.filter(write => write.name !== 'settings').length, dayWrites);
    same('and the day is at the revision it was', rev(cloud), dayRev);
    same('B was told nothing: it had changed nothing', [shareOf(b).notices(DAY), b.raw(asideKey('settings'))], [[], null]);
    // A day BEFORE the day it is off from is history, on the other phone too.
    same('the day before, it is still that day\'s vehicle on B', b.call('transportContext', '2026-11-09').vehicles.some(v => v.id === 'tv_05'), true);

    same('turned on again, on B', b.call('transportSetVehicleOff', 'tv_05', null), true);
    given('it settles', await idle(cloud, a, b));
    same('it is on on A', [a.call('transportSettings').vehicles.find(v => v.id === 'tv_05').off, cars(a).includes('tv_05')], [undefined, true]);
    same('and its men are in their seats again on A, as stored', a.raw(dayKey(DAY)), dayA);
    same('still no day document written', [cloud.transport.writes.filter(write => write.name !== 'settings').length, rev(cloud)], [dayWrites, dayRev]);
    check('the field is nowhere in the list in the cloud now', !/"off"/.test(JSON.stringify(cloud.transport.docs.get('settings'))));
});

// A BUILD THAT DOES NOT KNOW THE FIELD (v180, its real bytes out of Git) is run on a disk
// this build shares the list from - an older window left open, or the phone taken back a
// build. It reads the list, drops `off` (its reader has never heard of it), and at its
// next write of the list the field is gone from the disk. THIS BUILD CANNOT TELL THAT
// FROM A PERSON TURNING THE VEHICLE ON: the list on the disk differs from the list it
// last agreed with the cloud, by exactly that. So it is seen for what it is on this
// side - a change of this phone's - and goes up as the next revision, through the
// compare-and-set, and the vehicle is on again for everybody. Pinned so that nobody takes
// it for a merge or a loss: docs/releases.md (v185) says it in the rollout rule.
await block('an older build that drops the off field on a shared disk: it goes up as this phone\'s change, not as a loss', async () => {
    const git = (...args) => execFileSync('git', args, { cwd: sourceRoot(), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    const show = file => git('show', `ac684f8:${file}`);
    const { cloud, a, b } = await pair();
    a.call('transportSetVehicleOff', 'tv_05', DAY);
    given('off is shared', await idle(cloud, a, b) && b.call('transportSettings').vehicles.find(v => v.id === 'tv_05').off === DAY);
    const listRev = rev(cloud, 'settings');
    shareOf(a).disconnect();

    // v180 on A's disk.
    const old = makeDevice({ deviceId: 'd_a', storage: a.dump(), appVersion: 'v180',
        sources: loadOrder().map(file => ({ file, code: show(file) })) });
    old.setToday(DAY);
    old.ctx.askTell = () => Promise.resolve();
    ['js/ui/seder.js', 'js/model/transport.js', 'js/ui/transport.js'].forEach(file =>
        vm.runInContext(show(file), old.ctx, { filename: `v180:${file}` }));
    old.State.load();
    given('v180 reads the list and does not see the field', old.call('transportSettings').vehicles.find(v => v.id === 'tv_05').off === undefined);
    old.call('transportRenameVehicle', 'tv_06', 'סוואנה ישנה');
    same('at its next write of the list the field is gone from the disk', /"off"/.test(old.raw(SETTINGS)), false);
    same('v180 made no call to the cloud', cloud.transport.attempts.filter(one => one.data && one.data.updatedBy === 'd_a'
        && one.data.vehicles && one.data.vehicles.some(v => v.name === 'סוואנה ישנה')).length, 0);

    // This build again, on that disk.
    const again = phone('d_a', { storage: old.dump() });
    same('this build finds the list changed since it last agreed with the cloud', shareOf(again).owed(), 'settings');
    shareOf(again).connect(cloud.transport.phone().adapter);
    given('it settles', await idle(cloud, again, b));
    same('it went up as the next revision of the list', rev(cloud, 'settings'), listRev + 1);
    same('carrying v180\'s rename, and without the field', [cloud.transport.docs.get('settings').vehicles.find(v => v.id === 'tv_06').name,
        cloud.transport.docs.get('settings').vehicles.find(v => v.id === 'tv_05').off], ['סוואנה ישנה', undefined]);
    same('so the vehicle is on again on the other phone', b.call('transportSettings').vehicles.find(v => v.id === 'tv_05').off, undefined);
    same('nothing was put aside and nobody was told: to both phones it is an ordinary change',
        [again.raw(asideKey('settings')), b.raw(asideKey('settings')), shareOf(b).notices(DAY)], [null, null, []]);
});

// ================================================================== what stays on the phone

await block('a driver\'s «נפתח» mark is this phone\'s own, and an adopted day leaves the other days alone', async () => {
    const { cloud, a, b } = await pair();
    b.call('transportMarkOpened', DAY, 'tv_01');
    const mark = JSON.stringify(JSON.parse(b.raw(dayKey(DAY))).marks);
    given('B marked the driver\'s chat as opened', mark.includes('tv_01'), mark);
    await settle(TICK * 10);
    same('a mark is not a change to the shared plan', rev(cloud), 1);
    // A v171-shaped day on B's disk for tomorrow, saying what the cloud will say.
    const v171 = JSON.stringify({ version: 1, unavailable: {}, status: {}, workerLocks: { w_02: true }, accepted: [{ n: 1 }],
        trips: { tv_02: { driver: 'w_03', passengers: [], seats: {}, locked: true, area: 'ta_1' } }, marks: {} });
    b.putRaw(dayKey(NEXT), v171);
    place(a, 'w_03', 'tv_02', 1, NEXT);
    place(a, 'w_02', 'tv_01', 2);
    given('both settle', await idle(cloud, a, b));
    same('B adopted today\'s plan', seats(b), 'tv_01=w_01+[w_02]');
    same('and kept its own mark on it', JSON.stringify(JSON.parse(b.raw(dayKey(DAY))).marks), mark);
    same('the mark never reached the cloud', /marks|openedAt/.test(JSON.stringify([...cloud.transport.docs.values()])), false);
    same('a shared day that says what the phone already holds rewrites nothing: v171\'s bytes are as they were', b.raw(dayKey(NEXT)), v171);
    same('though the phone now knows its revision', JSON.parse(b.raw(sharedKey(`day_${NEXT}`))).rev, 1);
});

await block('share records and copies aside are pruned with their days; the cloud\'s documents are not', async () => {
    const cloud = makeCloud();
    const old = '2026-09-01';
    cloud.transport.put(`day_${old}`, stamp({ date: old, unavailable: {}, status: {}, trips: {} }, 1));
    const device = phone('d_prune');
    device.putRaw(sharedKey(`day_${old}`), JSON.stringify({ rev: 1, base: '{}' }));
    device.putRaw(asideKey(`day_${old}`), JSON.stringify({ v: 1, why: 'changed', text: '{}', at: 1 }));
    device.putRaw(sharedKey(DOC), JSON.stringify({ rev: 1, base: '{}' }));
    shareOf(device).connect(cloud.transport.adapter);
    // What opening the screen tells the share file (a device here has no panel to open).
    device.call('transportShareTell', 'opened');
    await settle(TICK * 10);
    same('older than five weeks: both gone from the phone', [device.raw(sharedKey(`day_${old}`)), device.raw(asideKey(`day_${old}`))], [null, null]);
    check('this week\'s stays', device.raw(sharedKey(DOC)) !== null);
    check('the old day is still in the cloud', cloud.transport.docs.has(`day_${old}`));
    same('and the phone did not ask for it: it listens from five weeks back',
        cloud.transport.attempts.filter(one => one.kind === 'subscribe').map(one => one.name), ['day_2026-10-06']);
    check('which still takes the list of vehicles', 'settings' >= 'day_2026-10-06');
});

await block('a document of a version this build does not know is neither drawn nor written over', async () => {
    const cloud = makeCloud();
    const device = phone('d_v2');
    place(device, 'w_01', 'tv_01', 1);
    const future = { v: 2, revision: 4, date: DAY, seats: [['tv_01', 1, 'w_09']], updatedAt: 'x', updatedBy: 'y' };
    cloud.transport.docs.set(DOC, future);
    shareOf(device).connect(cloud.transport.adapter);
    await settleUntil(() => shareOf(device).state() === 'unchecked', 5000);
    same('handed over, it is refused', shareOf(device).take(DOC, future), 'blocked');
    same('the phone keeps its own plan', seats(device), 'tv_01=w_01+[]');
    same('says it cannot check', shareOf(device).state(), 'unchecked');
    same('and writes nothing over it', [cloud.transport.attempts.filter(one => one.kind === 'write').length,
        JSON.stringify(cloud.transport.docs.get(DOC))], [0, JSON.stringify(future)]);
    same('a document with no revision, the wrong day or a bad name the same',
        [shareOf(device).take(DOC, { v: 1, date: DAY, unavailable: {}, status: {}, trips: {} }),
            shareOf(device).take(DOC, dayDoc({}, 1, { date: NEXT })), shareOf(device).take('day_2026-13-45', dayDoc({}, 1)),
            shareOf(device).take('__proto__', dayDoc({}, 1))], ['blocked', 'blocked', 'ignored', 'ignored']);
    // What is INSIDE a document is read by the screen's own readers.
    const poisoned = dayDoc(JSON.parse('{"tv_01":{"driver":"w_01","passengers":["w_02","__proto__","a.b"],"seats":{"__proto__":2}},"__proto__":{"driver":"w_03"}}'), 9,
        { status: { w_04: 'waiting', w_06: 'private' } });
    cloud.transport.docs.set(DOC, poisoned);
    const clean = phone('d_poison');
    shareOf(clean).connect(cloud.transport.adapter);
    await settleUntil(() => seats(clean) !== '', 5000);
    same('an id that could land on a prototype, and a status nobody offers, are dropped on the way in',
        [seats(clean), JSON.stringify(clean.call('transportDayOf', DAY).status)], ['tv_01=w_01+[w_02]', '{"w_06":"private"}']);
});

await block('the backup, the restore points and the rescue file carry none of it, shared or not', async () => {
    const { a } = await pair();
    a.putRaw(asideKey(DOC), JSON.stringify({ v: 1, why: 'changed', text: '{"trips":{"tv_09":{}}}', at: 1 }));
    const foreign = text => /farkadTransport|tv_0\d|"passengers"|"unavailable"|"vehicles":\[\{"id":"tv/.test(String(text));
    given('the detector would see a plan', foreign(a.raw(dayKey(DAY))) && foreign(a.raw(sharedKey(DOC))) && foreign(a.raw(asideKey(DOC))));
    a.call('exportBackup');
    const backup = a.downloads[a.downloads.length - 1];
    same('the backup is the record and only the record', JSON.parse(backup.text), JSON.parse(JSON.stringify(a.State.schedule)));
    a.call('takeDailySnapshot');
    const points = Object.keys(a.dump()).filter(key => key.startsWith('scheduleData:snap:'));
    check('no restore point carries anything of it', points.length >= 1 && points.every(key => !foreign(a.raw(key))));
    a.call('exportRecoveryData');
    const rescue = a.downloads[a.downloads.length - 1];
    check('nor does the rescue file', Boolean(rescue && rescue.text.includes('farkad-recovery')) && !foreign(rescue.text));
});

await block('how big a shared document is: a thousandth of the ceiling, and none of it in the schedule', async () => {
    const cloud = makeCloud();
    const device = phone('d_size');
    // Twenty men on the roster, all at work, all seated: every vehicle but one, full.
    const men = Array.from({ length: 20 }, (_, i) => ({ id: device.call('newEntityId', 'w'), name: `עובד ${i}`, active: true, dailyRate: 400, hourlyRate: 0 }));
    device.State.schedule.workers = men;
    device.State.save({ silent: true });
    men.forEach(man => device.State.commit(device.call('assignPlace', device.State.schedule, DAY, man.id, 'actual', 'p_01')));
    shareOf(device).connect(cloud.transport.adapter);
    let at = 0;
    device.call('transportSettings').vehicles.slice(0, 6).forEach(vehicle => {
        for (let n = 1; n <= vehicle.seats && at < men.length; n += 1) { place(device, men[at].id, vehicle.id, n); at += 1; }
    });
    device.call('transportSetAvailable', DAY, 'tv_07', false);
    device.call('transportRenameVehicle', 'tv_02', 'קורולה לבנה');
    given('it settles', await idle(cloud, device));
    const dayBytes = Buffer.byteLength(JSON.stringify(cloud.transport.docs.get(DOC)));
    const listBytes = Buffer.byteLength(JSON.stringify(cloud.transport.docs.get('settings')));
    same('all twenty are seated in the shared day', everyone(cloud.transport.docs.get(DOC)).length, 20);
    check('a full evening for twenty men is under 2 KB', dayBytes > 300 && dayBytes < 2048, `${dayBytes} bytes`);
    check('the list of seven vehicles is under 1 KB', listBytes > 300 && listBytes < 1024, `${listBytes} bytes`);
    check('a year of them - 366 days and the list - is under 1 MB in all, in 367 documents', 366 * dayBytes + listBytes < 1024 * 1024,
        `${366 * dayBytes + listBytes} bytes`);
    same('and the schedule document was not written for any of it', cloud.attempts.length, 0);
});

// ================================================================== the words

await block('what the line says, state by state', async () => {
    const T = phone('d_words').global('TRANSPORT_TEXT');
    const said = {
        shareChecking: 'בודק את השיבוץ המשותף…',
        shareShared: 'השיבוץ משותף עם הטלפונים האחרים ומעודכן.',
        shareWaiting: 'השינוי שמור במכשיר הזה ועדיין לא התעדכן בענן.',
        shareUnchecked: 'אין חיבור: לא ניתן לבדוק אם השיבוץ מעודכן. מוצג מה ששמור במכשיר הזה.',
        shareNotShared: 'השיבוץ עדיין לא משותף: הענן אינו מאפשר זאת כרגע. הוא שמור במכשיר הזה בלבד.',
        shareNoRoom: 'אין מקום במכשיר לשמור בצד את השיבוץ שלך, ולכן השיבוץ המשותף לא הוצג. מוצג מה ששמור במכשיר הזה.',
        shareChangedDay: 'השיבוץ של היום הזה שונה בטלפון אחר. מוצג השיבוץ המשותף, והשיבוץ שלך נשמר בצד.',
        shareChangedList: 'רשימת הרכבים שונתה בטלפון אחר. מוצגת הרשימה המשותפת, והרשימה שלך נשמרה בצד.',
        shareFirstDay: 'במכשיר הזה היה ליום הזה שיבוץ שונה מהמשותף. מוצג השיבוץ המשותף, והשיבוץ של המכשיר נשמר בצד.',
        shareFirstList: 'במכשיר הזה הייתה רשימת רכבים שונה מהמשותפת. מוצגת הרשימה המשותפת, והרשימה של המכשיר נשמרה בצד.',
        shareUseMineDay: 'להשתמש בשיבוץ שלי',
        shareUseMineList: 'להשתמש ברשימה שלי',
        shareKeepShared: 'להשאיר את המשותף',
        shareUseMineDayTitle: 'להחליף את השיבוץ המשותף בשיבוץ שלך?',
        shareUseMineListTitle: 'להחליף את רשימת הרכבים המשותפת ברשימה שלך?',
        shareUseMineLead: 'הטלפונים האחרים יראו את שלך במקום מה שמוצג עכשיו.',
        shareUseMineOk: 'להחליף',
        switchLeadShared: 'שיבוץ העובדים לרכבים והודעה לכל נהג. מופעל בכל מכשיר בנפרד. במכשיר שמחובר לענן, השיבוץ ורשימת הרכבים משותפים עם הטלפונים האחרים שהפעילו הסעות. לא נכלל בגיבוי.'
    };
    same('the words of sharing are exactly these keys', Object.keys(T).filter(key => /^share|Shared$/.test(key)).sort(), Object.keys(said).sort());
    Object.keys(said).forEach(key => same(key, T[key], said[key]));
    const all = Object.keys(said).map(key => T[key]).join('\n');
    check('none says «נשלח», none says «מסונכרן» (the record\'s word), none says «ממתין»',
        !/נשלח|מסונכרן|ממתין/.test(all));
});

// ================================================================== the real older builds
//
// A phone that has not updated runs the files it was served. Those files, out of Git,
// beside a cloud that holds shared plans: they must not be able to touch them, and the
// measurement is that they never call - not that a call of theirs is refused.
await block('builds without sharing, out of Git: they cannot reach the shared documents', async () => {
    const git = (...args) => execFileSync('git', args, { cwd: sourceRoot(), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    const has = revision => { try { git('cat-file', '-e', `${revision}^{commit}`); return true; } catch (error) { return false; } };
    const builds = [['v179', '6a063c5'], ['v180', 'ac684f8'], ['v181', '98648d9'], ['v182', '61d9416']].filter(([, revision]) => has(revision));
    given('at least the v180 tree is in this clone', builds.some(([name]) => name === 'v180'), builds.map(one => one[0]).join(','));
    for (const [name, revision] of builds) {
        const show = file => git('show', `${revision}:${file}`);
        const stampOf = (/const APP_VERSION = '([^']+)'/.exec(show('js/app.js')) || [])[1];
        const cloud = makeCloud();
        cloud.transport.put(DOC, dayDoc({ tv_01: { driver: 'w_02', passengers: ['w_03'], seats: { w_03: 2 } } }, 1));
        cloud.transport.put('settings', stamp({ vehicles: [{ id: 'tv_01', name: 'רכב משותף', seats: 5, active: true }] }, 1));
        const held = JSON.stringify([...cloud.transport.docs.entries()]);
        const device = makeDevice({ deviceId: `d_${name}`, storage: { [ENABLED]: '1' }, appVersion: stampOf,
            sources: loadOrder().map(file => ({ file, code: show(file) })) });
        device.Sync.pushDelayMs = TICK;
        device.setToday(DAY);
        device.ctx.askTell = () => Promise.resolve();
        ['js/ui/seder.js', 'js/model/transport.js', 'js/ui/transport.js'].forEach(file =>
            vm.runInContext(show(file), device.ctx, { filename: `${name}:${file}` }));
        device.State.schedule.workers = WORKERS();
        device.State.schedule.places = PLACES();
        device.State.save({ silent: true });
        device.State.commit(device.call('assignPlace', device.State.schedule, DAY, 'w_01', 'actual', 'p_01'));
        device.Sync.connect(cloud.adapter);
        await settleUntil(() => device.Sync.status === 'synced' && device.Sync.pendingCount() === 0, 5000);
        device.call('transportPlace', DAY, 'w_01', 'tv_01', 1);
        device.call('transportRenameVehicle', 'tv_02', 'שם אחר');
        device.call('transportSetAvailable', DAY, 'tv_07', false);
        device.call('openTransport', DAY);
        await settle(TICK * 10);
        same(`${name} (${stampOf}): its own plan is on its own disk`, JSON.parse(device.raw(dayKey(DAY))).trips.tv_01.driver, 'w_01');
        same(`${name}: it made no call to the transport documents`, cloud.transport.attempts.length, 0);
        same(`${name}: which are byte for byte what they were`, JSON.stringify([...cloud.transport.docs.entries()]), held);
        check(`${name}: its adapter has no word of them`, !/['"]transport['"]|transportOps|FarkadTransportShare/.test(show('js/sync/firebase-adapter.js')));
        check(`${name}: and the record it synced has none either`, !/transport|tv_0/i.test(JSON.stringify(cloud.doc)));
    }
});

report();
