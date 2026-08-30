// P0-B2: what is left of the cross-tab send claim after the first three fixes.
//
//   node sendclaim2.test.mjs
//
// A previous round closed three holes in js/sync/sync.js: bytes that will not parse are
// no longer read as an unclaimed cloud, the claim is asked for again in the instant
// before the request is handed to the adapter, and an owner that is still working says so
// on a timer so it is not mistaken for one that is gone.
//
// Everything below is a hole those three did not close. Two families:
//
//   * A record that PARSES but does not say what it appears to say. readSendClaim()
//     coerces `at` and `beat` with Number() and asks only isFinite(), so null, false, [],
//     '' and a negative number all become a real, ancient timestamp - and an ancient
//     timestamp is a claim that is free for the taking, over a live token, with a request
//     still open. The shape fix guards the PARSER; nothing guards the numbers.
//   * A write whose result is never read. quarantineSendClaim() and the heartbeat both
//     call Store.setVerified and throw the answer away, on a disk this app otherwise
//     never trusts without reading back.
//
// And one question that is not a bug in either family: a claim record that stays
// unreadable is never free again - correctly - and also never anything else. The last
// suite asks what a person sees on a device in that state.
//
// THE SEAMS, all three borrowed or built rather than reached past:
//   * a per-tab clock, replacing that context's `Date` with a subclass whose static now()
//     is offset. No test here sleeps for the twenty-second lease.
//   * a per-tab `setInterval`, so the heartbeat's callback can be fired by hand, or NOT
//     fired at all - which is what a backgrounded tab is.
//   * localStorage's `interleave` hook, which fires between a read and the write that
//     depends on it. That is the whole of the check-then-act gap in the restore path.

import { existsSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

// The repository, found rather than spelled: this file runs from inside tests/ and from a
// scratch directory beside the checkout, so nothing here names a path. It walks up from
// itself, then up from wherever it was started, and takes the first directory that holds
// tests/harness.mjs. FARKAD_ROOT overrides.
function findRoot() {
    const seen = [];
    const climb = start => {
        let at = start;
        for (;;) {
            seen.push(at);
            const up = dirname(at);
            if (up === at) return;
            at = up;
        }
    };
    if (process.env.FARKAD_ROOT) seen.push(resolve(process.env.FARKAD_ROOT));
    climb(dirname(fileURLToPath(import.meta.url)));
    climb(resolve(process.cwd()));
    const found = seen.find(dir => existsSync(join(dir, 'tests', 'harness.mjs')));
    if (!found) throw new Error('cannot find the farkad checkout: set FARKAD_ROOT');
    return found;
}

const TESTS = join(findRoot(), 'tests');
const from = name => pathToFileURL(join(TESTS, name)).href;

const { makeDevice, makeCloud, settle, sharedStore, deferred } = await import(from('harness.mjs'));
const { suite, check, same, given, report } = await import(from('runner.mjs'));

const TICK = 6;
const DATE = '2026-08-10';
const PATH = `days.${DATE}.actual.w_01`;
const KEY = 'farkad:sendClaim';
const DAMAGED = KEY + ':damaged';

// Longer than SEND_CLAIM_STALE_MS (20000) in js/sync/sync.js.
const PAST_THE_LEASE = 25000;
// SEND_CLAIM_BEAT_MS in js/sync/sync.js, asserted rather than assumed - a build that
// changes it changes what "suspended past the lease" means.
const BEAT_MS = 4000;
const TEN_YEARS = 315360000000;

const WORKERS = [
    { id: 'w_01', name: 'דוד', active: true, dailyRate: 400, hourlyRate: 50 },
    { id: 'w_02', name: 'שרה', active: true, dailyRate: 350, hourlyRate: 0 }
];
const PLACES = [
    { id: 'p_01', name: 'הרצליה', active: true },
    { id: 'p_02', name: 'תל אביב', active: true }
];

function seed(device) {
    device.State.schedule.workers = WORKERS.map(worker => Object.assign({}, worker));
    device.State.schedule.places = PLACES.map(place => Object.assign({}, place));
    device.State.save({ silent: true });
    return device;
}

// One site on a day, REPLACING whatever was there.
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

const placeOf = record => {
    const entries = (record && record.entries) || [];
    return entries.length > 0 ? entries[0].placeId : null;
};
const screenPlace = (device, date = DATE, workerId = 'w_01') => placeOf(
    ((device.State.schedule.days[date] || {}).actual || {})[workerId]);
const cloudPlace = (cloud, date = DATE, workerId = 'w_01') => placeOf(
    (((cloud.doc || {}).days || {})[date] || {}).actual
        ? cloud.doc.days[date].actual[workerId] : null);

const connected = async (device, cloud) => {
    device.Sync.pushDelayMs = TICK;
    device.Sync.connect(cloud.adapter);
    await settle(TICK * 30);
};

// Two tabs on one disk, both connected, both up to date. `prepare` runs on each device
// the moment it exists and before anything is asked of it - the beat seam has to be
// installed before the first claim is ever taken.
async function twoTabsOnOneCloud(cloud, prepare) {
    const shared = sharedStore();
    const tabA = makeDevice({ sharedStorage: shared, deviceId: 'd_a' });
    if (prepare) prepare(tabA, 'a');
    seed(tabA);
    const tabB = makeDevice({ sharedStorage: shared, deviceId: 'd_b' });
    if (prepare) prepare(tabB, 'b');
    tabB.State.load();
    tabB.Sync.pendingCount();
    await connected(tabA, cloud);
    await connected(tabB, cloud);
    await settle(TICK * 30);
    return { shared, tabA, tabB };
}

// Twenty-five seconds passing, for ONE tab. The app reads `Date` off its context's global
// object at every call site, so replacing it here is the whole of the seam.
function skewClock(device, ms) {
    const Real = Date;
    class Skewed extends Real {
        constructor(...args) {
            if (args.length === 0) super(Real.now() + ms);
            else super(...args);
        }
        static now() { return Real.now() + ms; }
    }
    device.ctx.Date = Skewed;
    return () => { device.ctx.Date = Real; };
}

// The heartbeat's timer, held rather than run. startClaimBeat() calls setInterval on the
// context's global object, so replacing it captures the callback: fire() is a beat that
// happened, and never calling it is a tab the phone put to sleep.
function beatSeam(device) {
    const seam = {
        fn: null, ms: 0, fired: 0, cleared: 0,
        fire() { if (seam.fn) { seam.fired += 1; seam.fn(); } }
    };
    device.ctx.setInterval = (fn, ms) => { seam.fn = fn; seam.ms = ms; return { __seam: true }; };
    device.ctx.clearInterval = handle => {
        if (handle && handle.__seam) { seam.cleared += 1; seam.fn = null; }
    };
    return seam;
}

// Hold every update this device signs, and nothing else.
function holdWritesFrom(cloud, deviceId, gate) {
    cloud.hold = (kind, payload) => {
        if (kind !== 'update') return null;
        if (!payload || payload.updatedBy !== deviceId) return null;
        return gate.promise;
    };
}

// Ask a tab whether it would take the claim, and put the disk back exactly as it was.
// takeSendClaim() WRITES when it answers true, so asking the question changes the answer
// to the next one.
async function probeClaim(tab) {
    const before = tab.raw(KEY);
    const got = await tab.Sync.takeSendClaim();
    tab.Sync.stopClaimBeat();
    tab.Sync._claimToken = null;
    if (before === null) tab.Store.remove(KEY);
    else tab.putRaw(KEY, before);
    tab.Store.forget(KEY);
    return got;
}

// A read hook that re-arms itself. localStorage's `interleave` fires once, AFTER the
// value has been taken and BEFORE the caller can act on it - which is the only way to
// spell "the other tab wrote in the gap". `want` returns true to stop.
function onEveryRead(shared, want) {
    const arm = () => shared.interleave((key, value) => {
        let done = false;
        try { done = want(key, value); } catch (error) { done = true; }
        if (!done) arm();
    });
    arm();
}

// What a session that opens these bytes would hold.
function shapeOf(device) {
    return JSON.stringify({ days: device.State.schedule.days, pending: device.Sync.pendingCount() });
}

function twoReopens(label, dump, expected) {
    const one = makeDevice({ storage: dump, deviceId: 'd_reopen1' });
    one.State.load();
    const two = makeDevice({ storage: dump, deviceId: 'd_reopen2' });
    two.State.load();
    const agreed = shapeOf(one) === shapeOf(two);
    check(`${label}: two reopens of these bytes agree about the record`,
        agreed, agreed ? '' : shapeOf(one) + '  !==  ' + shapeOf(two));
    check(`${label}: a reopen holds the correction, not the value it corrected`,
        screenPlace(one) === expected,
        JSON.stringify({ reopened: screenPlace(one), wanted: expected }));
    return one;
}

async function thirdDevice(cloud) {
    const fresh = makeDevice({ deviceId: 'd_c' });
    fresh.State.load();
    await connected(fresh, cloud);
    await settle(TICK * 30);
    return fresh;
}

// The status line a person actually reads. render() calls updateSyncNotice() after every
// commit (js/app.js:105), and the notice is the one element it writes to - so giving the
// device that element and calling the function is what is on screen, not a paraphrase.
function noticeOn(device) {
    const node = { textContent: '' };
    const banner = {
        style: {}, dataset: {}, textContent: '',
        appendChild: () => {}, removeChild: () => {}
    };
    device.ctx.document.getElementById = id => {
        if (id === 'storageNotice') return node;
        if (id === 'storageBanner') return banner;
        return null;
    };
    return {
        node,
        banner,
        read() { device.call('updateSyncNotice'); return node.textContent; }
    };
}

// ================================================================ T0
//
// The two constants the suites below are written against, taken off the record this
// build actually writes rather than off a comment. If either moves, the tests that spell
// "past the lease" and "the beat did not fire" are measuring something else.
{
    suite('T0: the lease and the beat, as this build writes them');

    const device = makeDevice({ deviceId: 'd_const' });
    const seam = beatSeam(device);
    const took = await device.Sync.takeSendClaim();
    given('a device with an empty disk takes the claim', took === true, String(took));
    const claim = JSON.parse(device.raw(KEY) || '{}');
    check('the claim this build writes carries a beat as well as an acquisition time',
        typeof claim.at === 'number' && typeof claim.beat === 'number',
        JSON.stringify(claim));
    same('the heartbeat interval is the one these tests are written against',
        seam.ms, BEAT_MS);
    device.Sync.releaseSendClaim();
}

// ================================================================ T1
//
// The parser now refuses bytes it cannot read. It does not refuse bytes it CAN read that
// do not mean anything: `at` and `beat` go through Number() and are asked only isFinite,
// so null, false, [], '' and ' ' are all the number 0 - fifty-six years ago - and a
// negative number is older still. Every one of them is a LIVE token with an ancient
// heartbeat, which is precisely the shape "the owner is gone" is spelled in.
{
    suite('T1: a timestamp that is not a timestamp reads as an ancient one');

    const shared = sharedStore();
    const owner = makeDevice({ sharedStorage: shared, deviceId: 'd_a' });
    seed(owner);
    const other = makeDevice({ sharedStorage: shared, deviceId: 'd_b' });
    other.State.load();

    const live = 'tok_live';
    const now = Date.now();
    const cases = [
        ['at and beat are both null', JSON.stringify({ by: 'd_a', token: live, at: null, beat: null })],
        ['the beat alone is null', JSON.stringify({ by: 'd_a', token: live, at: now, beat: null })],
        ['the acquisition time alone is null', JSON.stringify({ by: 'd_a', token: live, at: null })],
        ['both are negative', JSON.stringify({ by: 'd_a', token: live, at: -1, beat: -1 })],
        ['the beat is negative', JSON.stringify({ by: 'd_a', token: live, at: now, beat: -now })],
        ['both are false', JSON.stringify({ by: 'd_a', token: live, at: false, beat: false })],
        ['both are empty arrays', JSON.stringify({ by: 'd_a', token: live, at: [], beat: [] })]
    ];

    for (const [name, bytes] of cases) {
        other.putRaw(KEY, bytes);
        other.Sync.stopClaimBeat();
        other.Sync._claimToken = null;
        const took = await other.Sync.takeSendClaim();
        check(`a live token whose ${name} is not an unclaimed cloud`,
            took === false, `takeSendClaim() -> ${took}; on disk: ${bytes}`);
        check(`a live token whose ${name} is kept, not written over`,
            other.raw(KEY) === bytes,
            JSON.stringify({ before: bytes, after: other.raw(KEY) }));
        other.Sync.stopClaimBeat();
        other.Sync._claimToken = null;
    }

    // The record this app writes must still be readable, or the checks above are passing
    // by breaking everything.
    other.Store.remove(KEY);
    other.Sync._claimToken = null;
    const free = await other.Sync.takeSendClaim();
    check('an absent claim is still free to take', free === true, `takeSendClaim() -> ${free}`);
    other.Sync.releaseSendClaim();

    const past = JSON.stringify({ by: 'd_a', token: live, at: now - PAST_THE_LEASE,
        beat: now - PAST_THE_LEASE });
    other.putRaw(KEY, past);
    other.Sync._claimToken = null;
    const expired = await other.Sync.takeSendClaim();
    check('an owner that stopped beating a lease ago is still taken over',
        expired === true, `takeSendClaim() -> ${expired}`);
    other.Sync.releaseSendClaim();
}

// ================================================================ T2
//
// The same coercion seen from the other side: `at` and `beat` as decimal STRINGS. Nothing
// this app has ever written puts a string there, so a string means the bytes came from
// somewhere else - a half-overwritten record, another program on the origin, a shape from
// a build that does not exist yet. A live-looking string is refused, which is the right
// answer arrived at by accident: it is refused as DATA, not as damage, so no copy is kept
// and nothing anywhere records that the record was the wrong shape. An empty string is
// the number 0 and is not refused at all.
{
    suite('T2: numeric strings where this app writes numbers');

    const shared = sharedStore();
    const owner = makeDevice({ sharedStorage: shared, deviceId: 'd_a' });
    seed(owner);
    const other = makeDevice({ sharedStorage: shared, deviceId: 'd_b' });
    other.State.load();

    const live = 'tok_live';
    const now = Date.now();
    const cases = [
        ['a decimal string for both', `{"by":"d_a","token":"${live}","at":"${now}","beat":"${now}"}`],
        ['a decimal string for the beat', `{"by":"d_a","token":"${live}","at":${now},"beat":"${now}"}`],
        ['an empty string for both', `{"by":"d_a","token":"${live}","at":"","beat":""}`],
        ['a blank string for the beat', `{"by":"d_a","token":"${live}","at":${now},"beat":" "}`]
    ];

    for (const [name, bytes] of cases) {
        other.putRaw(KEY, bytes);
        other.Store.remove(DAMAGED);
        other.Sync.stopClaimBeat();
        other.Sync._claimToken = null;
        other.Sync._claimQuarantined = false;
        const took = await other.Sync.takeSendClaim();
        check(`${name} does not read as an unclaimed cloud`,
            took === false, `takeSendClaim() -> ${took}; on disk: ${bytes}`);
        check(`${name} is treated as damage, so a copy is kept of what could not be read`,
            other.raw(DAMAGED) !== null,
            JSON.stringify({ onDisk: bytes, quarantined: other.raw(DAMAGED) }));
        other.Sync.stopClaimBeat();
        other.Sync._claimToken = null;
    }
}

// ================================================================ T3
//
// A phone whose clock is wrong writes a claim in the future. Staleness is `Date.now() -
// beat`, which is negative for as long as the future lasts, so the claim never expires -
// on that disk, for every tab, across every reopen, for ten years. Nothing removes it:
// releaseSendClaim only removes a claim whose token this tab minted.
{
    suite('T3: a claim written by a phone whose clock is ten years fast');

    const shared = sharedStore();
    const owner = makeDevice({ sharedStorage: shared, deviceId: 'd_a' });
    seed(owner);
    const other = makeDevice({ sharedStorage: shared, deviceId: 'd_b' });
    other.State.load();

    const future = Date.now() + TEN_YEARS;
    const bytes = JSON.stringify({ by: 'd_gone', token: 'tok_future', at: future, beat: future });
    other.putRaw(KEY, bytes);
    other.Sync._claimToken = null;

    const took = await other.Sync.takeSendClaim();
    given('a claim ten years in the future is not takeable now', took === false,
        `takeSendClaim() -> ${took}`);

    // A lease is a promise that the right to send comes BACK. Twenty-five seconds later,
    // and a full lease after that, it has not.
    const undo = skewClock(other, PAST_THE_LEASE);
    other.Sync._claimToken = null;
    const later = await other.Sync.takeSendClaim();
    undo();
    check('a claim in the future is released by waiting out the lease',
        later === true, `takeSendClaim() a lease later -> ${later}`);

    // And every device that opens this disk afterwards is in the same position.
    const reopened = makeDevice({ storage: other.dump(), deviceId: 'd_reopen' });
    reopened.State.load();
    const afterReopen = await reopened.Sync.takeSendClaim();
    check('closing and reopening the app clears a claim that can never expire',
        afterReopen === true, `takeSendClaim() after a reopen -> ${afterReopen}`);

    check('a claim dated in the future is treated as the damage it is',
        reopened.raw(DAMAGED) !== null,
        JSON.stringify({ onDisk: reopened.raw(KEY), quarantined: reopened.raw(DAMAGED) }));
}

// ================================================================ T4
//
// Truncated JSON, opened and reopened. The parser refuses it every time - which is the
// fix working, and is asserted here so that a later change cannot quietly undo it. What
// the same loop shows is the other half: the bytes are still there on the tenth reopen,
// the claim is still refused, and nothing about the device says why.
{
    suite('T4: truncated JSON, across ten close-and-reopens');

    const first = makeDevice({ deviceId: 'd_trunc' });
    seed(first);
    first.putRaw(KEY, '{"by":"d_a","token":"tok_live","at":1788056047853,"beat":178805');

    let dump = first.dump();
    let everFree = -1;
    let quarantineCount = 0;
    for (let n = 0; n < 10; n += 1) {
        const device = makeDevice({ storage: dump, deviceId: `d_trunc${n}` });
        device.State.load();
        const took = await device.Sync.takeSendClaim();
        if (took && everFree === -1) everFree = n;
        const copies = Object.keys(device.dump()).filter(key => key.indexOf(DAMAGED) === 0);
        quarantineCount = copies.length;
        dump = device.dump();
    }

    check('a truncated claim never reads as free, at any reopen',
        everFree === -1, everFree === -1 ? '' : `free at reopen #${everFree}`);
    check('ten reopens leave one copy of the damage, not ten',
        quarantineCount === 1, `copies: ${quarantineCount}`);

    // The other half. Ten sessions have now each refused to send, and the record that
    // refuses them is unchanged.
    const last = makeDevice({ storage: dump, deviceId: 'd_trunc_last' });
    last.State.load();
    check('a claim record no session can read is eventually cleared or repaired',
        last.raw(KEY) === null || (() => {
            try { JSON.parse(last.raw(KEY)); return true; } catch (error) { return false; }
        })(),
        JSON.stringify(last.raw(KEY)));
}

// ================================================================ T5
//
// The quarantine is the one thing standing between a person and a guess about why an
// evening did not sync, and it is written with Store.setVerified - the call whose whole
// purpose is that its answer is READ. quarantineSendClaim throws the answer away, and
// marks itself done BEFORE the write, so a refusal is never retried.
{
    suite('T5: the quarantine write, refused and corrupted');

    // Refused for space.
    {
        const device = makeDevice({ deviceId: 'd_q1' });
        seed(device);
        device.putRaw(KEY, '{"by":"d_a","token":"tok');
        device.setQuota(key => key === DAMAGED);
        const took = await device.Sync.takeSendClaim();
        given('the claim is still refused when the copy cannot be made', took === false,
            `takeSendClaim() -> ${took}`);
        check('a quarantine the disk refused is not recorded as a quarantine that happened',
            device.Sync._claimQuarantined === false || device.raw(DAMAGED) !== null,
            JSON.stringify({ flagged: device.Sync._claimQuarantined,
                onDisk: device.raw(DAMAGED) }));

        device.setQuota(null);
        device.Sync.stopClaimBeat();
        device.Sync._claimToken = null;
        await device.Sync.takeSendClaim();
        check('and it is tried again once there is room',
            device.raw(DAMAGED) !== null, JSON.stringify(device.raw(DAMAGED)));
    }

    // Accepted, and handed back as something else. Nothing throws; the only way to know
    // is to read it back, which is what setVerified is for and what its answer says.
    {
        const device = makeDevice({ deviceId: 'd_q2' });
        seed(device);
        const bytes = '{"by":"d_a","token":"tok';
        device.putRaw(KEY, bytes);
        device.corruptOnWrite(DAMAGED);
        await device.Sync.takeSendClaim();
        device.corruptWhen(() => false);
        check('the kept copy is the bytes that were on the disk, not the disk\'s idea of them',
            device.raw(DAMAGED) === bytes,
            JSON.stringify({ wanted: bytes, kept: device.raw(DAMAGED) }));

        device.Sync.stopClaimBeat();
        device.Sync._claimToken = null;
        await device.Sync.takeSendClaim();
        check('a copy that came back wrong is written again while the original is still there',
            device.raw(DAMAGED) === bytes,
            JSON.stringify({ wanted: bytes, kept: device.raw(DAMAGED) }));
    }

    // A refused quarantine must not turn into a device that proceeds as though the
    // record were readable.
    {
        const device = makeDevice({ deviceId: 'd_q3' });
        seed(device);
        device.putRaw(KEY, 'not json at all');
        device.failWrite(key => key === DAMAGED);
        const took = await device.Sync.takeSendClaim();
        check('a quarantine the browser refuses does not let the send proceed',
            took === false, `takeSendClaim() -> ${took}; Store.available -> ${device.Store.available}`);

        // And the attempt after it. The refusal took storage away for the rest of the
        // session (Store.fallback), and takeSendClaim answers true when there is no
        // storage - so the unreadable record that stopped the first send is not read at
        // all on the second, and the send goes out uncoordinated over bytes that may be
        // another tab's live claim.
        device.Sync.stopClaimBeat();
        device.Sync._claimToken = null;
        const again = await device.Sync.takeSendClaim();
        check('and the attempt after it does not go out uncoordinated over the same bytes',
            again === false,
            `takeSendClaim() -> ${again}; Store.available -> ${device.Store.available}; `
            + `on disk: ${device.raw(DAMAGED) === null ? device.raw(KEY) : device.raw(KEY)}`);
    }
}

// ================================================================ T6
//
// The heartbeat is the whole of the fix that keeps a live owner from being taken over.
// It is a Store.setVerified whose answer is thrown away, on a timer. Two ways for it to
// fail, and neither is noticed by the tab that owns the claim.
{
    suite('T6: the heartbeat write, refused and corrupted');

    // Refused for space. The beat does not land, the record on the disk keeps its old
    // beat, and the owner goes on believing it owns the claim.
    {
        const shared = sharedStore();
        const owner = makeDevice({ sharedStorage: shared, deviceId: 'd_a' });
        const seam = beatSeam(owner);
        seed(owner);
        const took = await owner.Sync.takeSendClaim();
        given('the owner holds the claim', took === true, String(took));
        const before = JSON.parse(owner.raw(KEY));

        // The disk is full for the length of one beat, and has room again afterwards.
        // The moment passes; the beat it swallowed does not come back.
        owner.setQuota(key => key === KEY);
        seam.fire();
        owner.setQuota(null);
        const after = JSON.parse(owner.raw(KEY));

        check('a heartbeat the disk refused is not counted as a heartbeat that happened',
            owner.Sync._claimToken === null || after.beat > before.beat,
            JSON.stringify({ stillOwned: owner.Sync._claimToken === before.token,
                beatBefore: before.beat, beatAfter: after.beat }));

        // And the consequence, spelled out: the other tab measures staleness off the
        // beat that never moved.
        const other = makeDevice({ sharedStorage: shared, deviceId: 'd_b' });
        other.State.load();
        const undo = skewClock(other, PAST_THE_LEASE);
        const stolen = await probeClaim(other);
        undo();
        check('a claim whose beats the disk is refusing is not handed to another tab',
            stolen === false, `takeSendClaim() -> ${stolen}`);
        check('and the tab whose beats are being refused knows it has stopped owning it',
            stolen === false || owner.Sync.stillOwnsSendClaim() === false,
            JSON.stringify({ stolen, ownerStillThinksItOwnsIt: owner.Sync.stillOwnsSendClaim() }));
    }

    // Accepted and handed back wrong. One beat is enough to leave bytes on the disk that
    // no tab on this origin will ever read again.
    {
        const shared = sharedStore();
        const owner = makeDevice({ sharedStorage: shared, deviceId: 'd_a' });
        const seam = beatSeam(owner);
        seed(owner);
        given('the owner holds the claim', await owner.Sync.takeSendClaim() === true);

        owner.corruptOnWrite(KEY);
        seam.fire();
        owner.corruptWhen(() => false);

        check('a heartbeat that came back wrong is repaired, not left on the disk',
            (() => { try { JSON.parse(owner.raw(KEY)); return true; }
                catch (error) { return false; } })(),
            JSON.stringify(owner.raw(KEY)));

        const other = makeDevice({ sharedStorage: shared, deviceId: 'd_b' });
        other.State.load();
        const undo = skewClock(other, PAST_THE_LEASE * 4);
        const took = await other.Sync.takeSendClaim();
        undo();
        check('one corrupted heartbeat does not lock every tab on the disk out for good',
            took === true, `takeSendClaim(), four leases later -> ${took}`);

        const reopened = makeDevice({ storage: other.dump(), deviceId: 'd_reopen' });
        reopened.State.load();
        const afterReopen = await reopened.Sync.takeSendClaim();
        check('and closing the app clears it',
            afterReopen === true, `takeSendClaim() after a reopen -> ${afterReopen}`);
    }
}

// ================================================================ T7
//
// The phone puts the tab to sleep. Timers stop; the request that is already open does
// not. This is the exact condition the heartbeat was added to survive, and the heartbeat
// is a timer.
{
    suite('T7: the owner is backgrounded and its beat never fires');

    const cloud = makeCloud();
    let seam = null;
    const { tabA, tabB } = await twoTabsOnOneCloud(cloud, (device, which) => {
        if (which === 'a') seam = beatSeam(device);
    });
    put(tabA, PATH, 'p_00_seed');
    await settle(TICK * 40);
    given('both tabs are up to date and the day is in the cloud',
        tabA.Sync.pendingCount() === 0 && tabB.Sync.pendingCount() === 0
        && cloudPlace(cloud) === 'p_00_seed',
        JSON.stringify([tabA.Sync.pendingCount(), tabB.Sync.pendingCount(), cloudPlace(cloud)]));

    const open = deferred();
    holdWritesFrom(cloud, 'd_a', open);
    const mark = cloud.writes.length;
    put(tabA, PATH, 'p_01');
    tabA.Sync.flush();
    await settle(TICK * 10);

    const claim = JSON.parse(tabA.raw(KEY) || '{}');
    given('the first tab holds the claim with its write still open',
        claim.by === 'd_a' && String(claim.token || '') !== '' && cloud.writes.length === mark,
        JSON.stringify({ claim, landed: cloud.writes.length - mark }));
    given('its heartbeat is on a timer that has not fired',
        seam !== null && seam.fn !== null && seam.fired === 0,
        JSON.stringify({ captured: seam && seam.fn !== null, fired: seam && seam.fired }));

    // The tab sleeps for longer than the lease. Its socket is still open; its timers are
    // not running.
    skewClock(tabB, PAST_THE_LEASE);
    const stolen = await probeClaim(tabB);
    check('a suspended owner whose request is still open does not lose the claim',
        stolen === false, `takeSendClaim() -> ${stolen}; beats fired: ${seam.fired}`);

    tabB.State.load();
    put(tabB, PATH, 'p_02');
    tabB.Sync.flush();
    await settle(TICK * 30);
    const duringHold = cloud.writes.slice(mark).map(w => w.kind);
    check('nothing goes out while a suspended tab still has a request open',
        duringHold.length === 0, JSON.stringify(duringHold));

    open.release();
    cloud.hold = null;
    await settle(TICK * 80);

    check('the cloud holds the correction, not the value it corrected',
        cloudPlace(cloud) === 'p_02', String(cloudPlace(cloud)));
    const owed = tabA.Sync.pendingCount() + tabB.Sync.pendingCount();
    check('pending work remains while the cloud does not hold the correction',
        cloudPlace(cloud) === 'p_02' || owed > 0,
        JSON.stringify({ cloud: cloudPlace(cloud), owed }));

    const third = await thirdDevice(cloud);
    check('a device that opens the cloud afterwards is given the correction',
        screenPlace(third) === 'p_02', String(screenPlace(third)));

    twoReopens('T7', tabA.dump(), 'p_02');
}

// ================================================================ T8
//
// The fleet is not one build. CLAUDE.md says so plainly: a build already on somebody's
// phone cannot be given new code, and the catch-up only holds from v87 forward. A v86 tab
// writes { by, token, at } and never beats - readSendClaim reads its beat as its
// acquisition time, which is exactly the old behaviour, and the old behaviour is what the
// heartbeat was added because it was not enough.
{
    suite('T8: a v86 owner, which writes no heartbeat at all');

    const cloud = makeCloud();
    const { tabA, tabB } = await twoTabsOnOneCloud(cloud);
    put(tabA, PATH, 'p_00_seed');
    await settle(TICK * 40);
    given('the day is in the cloud', cloudPlace(cloud) === 'p_00_seed');

    const open = deferred();
    holdWritesFrom(cloud, 'd_a', open);
    const mark = cloud.writes.length;
    put(tabA, PATH, 'p_01');
    tabA.Sync.flush();
    await settle(TICK * 10);

    // The record the old build leaves: no beat field, and nothing that will ever add one.
    const live = JSON.parse(tabA.raw(KEY) || '{}');
    given('the first tab holds the claim with its write still open',
        String(live.token || '') !== '' && cloud.writes.length === mark,
        JSON.stringify({ live, landed: cloud.writes.length - mark }));
    tabA.putRaw(KEY, JSON.stringify({ by: live.by, token: live.token, at: live.at }));
    tabA.Store.forget(KEY);
    given('the claim on the disk is the shape a v86 tab writes',
        JSON.parse(tabA.raw(KEY)).beat === undefined, String(tabA.raw(KEY)));

    skewClock(tabB, PAST_THE_LEASE);
    const stolen = await probeClaim(tabB);
    check('a v86 owner with a request still open does not lose the claim after a lease',
        stolen === false, `takeSendClaim() -> ${stolen}; on disk: ${tabA.raw(KEY)}`);

    tabB.State.load();
    put(tabB, PATH, 'p_02');
    tabB.Sync.flush();
    await settle(TICK * 30);
    const duringHold = cloud.writes.slice(mark).length;
    check('nothing goes out while the v86 tab still has a request open',
        duringHold === 0, String(duringHold));

    open.release();
    cloud.hold = null;
    await settle(TICK * 80);

    check('the cloud holds the correction, not the value it corrected',
        cloudPlace(cloud) === 'p_02', String(cloudPlace(cloud)));
    const third = await thirdDevice(cloud);
    check('a device that opens the cloud afterwards is given the correction',
        screenPlace(third) === 'p_02', String(screenPlace(third)));

    twoReopens('T8', tabB.dump(), 'p_02');
}

// ================================================================ T9
//
// stillOwnsSendClaim() is a READ, and what follows it is an ACT: markSent, then
// cloudWrite, whose task runs off a promise - a microtask later at the very least. Two
// tabs are two processes sharing one localStorage, and the other one can write in that
// gap. The restore is the write where being wrong costs the most: it replaces the whole
// document for all three phones at once.
{
    suite('T9: the claim moves between the last check and the restore leaving');

    const cloud = makeCloud();
    let seam = null;
    const { shared, tabA, tabB } = await twoTabsOnOneCloud(cloud, (device, which) => {
        if (which === 'a') seam = beatSeam(device);
    });
    put(tabA, PATH, 'p_00_seed');
    await settle(TICK * 40);
    given('the day is in the cloud and nothing is owed',
        cloudPlace(cloud) === 'p_00_seed' && tabA.Sync.pendingCount() === 0,
        JSON.stringify([cloudPlace(cloud), tabA.Sync.pendingCount()]));

    const saves = [];
    const real = tabA.Sync.adapter;
    tabA.Sync.adapter = Object.assign(Object.create(real), {
        save: data => {
            saves.push(JSON.parse(tabA.raw(KEY) || 'null'));
            return real.save(data);
        }
    });

    // The other tab's claim, as it would be on the disk a moment after it took it. It is
    // there legitimately: tab A is backgrounded, its beat never fires (see T7), so from
    // tab B's side the claim was expired and free.
    const otherClaim = JSON.stringify({
        by: 'd_b', token: 'tok_b', at: Date.now(), beat: Date.now()
    });

    // Armed on the read itself. The claim is read three times on the way through
    // takeSendClaim; the one that matters is the read AFTER a token has been recorded,
    // which is the last look before the request is handed over.
    let swapped = false;
    onEveryRead(shared, key => {
        if (key !== KEY) return false;
        if (!tabA.Sync._claimToken) return false;
        tabA.putRaw(KEY, otherClaim);
        swapped = true;
        return true;
    });

    tabA.State.load();
    const restored = JSON.parse(JSON.stringify(tabA.State.schedule));
    delete restored.days[DATE];
    const result = await tabA.Sync.replaceEverything(restored).then(
        value => ({ ok: true, value }), error => ({ ok: false, error: String(error.message) }));
    await settle(TICK * 40);

    given('the other tab took the claim in the gap', swapped === true, String(swapped));
    check('a whole-document restore is not handed over after the claim moved to another tab',
        saves.length === 0,
        JSON.stringify({ saves, claimAtTheCall: saves[0], mine: 'd_a' }));
    check('and the tab is not told the restore was sent when another tab held the claim',
        saves.length === 0 || result.ok === false, JSON.stringify(result));
    check('the day the restore removed did not come back through a second tab\'s claim',
        saves.length === 0 || cloudPlace(cloud) === null,
        JSON.stringify({ cloud: cloudPlace(cloud) }));
}

// ================================================================ T10
//
// The requirement that is not about correctness. Refusing to send over a record nobody
// can read is right; a device that refuses for ever, silently, is its own failure - the
// evening is recorded on one phone, the other two never see it, and the status line says
// the same thing a weak signal says.
//
// Nothing here asks for a particular remedy. It asks whether the device says ANYTHING a
// person could act on.
{
    suite('T10: what a person sees on a device that can never take the claim again');

    const cloud = makeCloud();
    const device = makeDevice({ deviceId: 'd_stuck' });
    const notice = noticeOn(device);
    seed(device);
    await connected(device, cloud);
    await settle(TICK * 40);
    const healthy = notice.read();
    given('the device is connected and says so', device.Sync.status === 'synced',
        `${device.Sync.status} — ${healthy}`);

    // From here on the claim record is unreadable, for ever. Nothing in this app rewrites
    // it: the writer refuses to take it, and only a tab that minted the token removes it.
    const mark = cloud.writes.length;
    device.putRaw(KEY, '{"by":"d_a","token":"tok');

    for (let n = 0; n < 6; n += 1) {
        put(device, `days.2026-08-1${n}.actual.w_01`, 'p_01');
        await settle(TICK * 12);
    }
    await settle(TICK * 60);

    const pending = device.Sync.pendingCount();
    const line = notice.read();
    given('six edits are written down and none of them has been sent',
        pending >= 6 && cloud.writes.length === mark,
        JSON.stringify({ pending, sinceTheDamage: cloud.writes.length - mark }));

    check('a device that cannot take the claim does not go on saying it is connecting',
        device.Sync.status !== 'connecting',
        JSON.stringify({ status: device.Sync.status, line }));
    check('the failure is reported as a failure somewhere the app can read it',
        device.Sync.status === 'error' || device.Sync.lastError !== null
        || device.global('Recovery').blocked() === true
        || device.global('Recovery').problems.length > 0,
        JSON.stringify({ status: device.Sync.status, lastError: String(device.Sync.lastError),
            recoveryProblems: device.global('Recovery').problems.length }));
    check('the status line says something a weak signal would not also say',
        line !== healthy && line.indexOf('מתחבר לענן') === -1,
        JSON.stringify(line));
    check('the person is pointed at the thing that is wrong, not left with a spinner',
        notice.banner.textContent !== '' || notice.banner.style.display === '',
        JSON.stringify({ banner: notice.banner.textContent,
            display: notice.banner.style.display }));

    // And it survives the one thing a person in trouble actually does.
    const reopened = makeDevice({ storage: device.dump(), deviceId: 'd_stuck2' });
    const reopenedNotice = noticeOn(reopened);
    reopened.State.load();
    await connected(reopened, cloud);
    await settle(TICK * 40);
    put(reopened, `days.2026-08-19.actual.w_01`, 'p_01');
    await settle(TICK * 60);
    check('closing and reopening the app does not silently resume the same silence',
        cloud.writes.length > mark || reopened.Sync.status === 'error'
        || reopened.global('Recovery').problems.length > 0,
        JSON.stringify({ writesSinceTheDamage: cloud.writes.length - mark,
            status: reopened.Sync.status,
            line: reopenedNotice.read(), pending: reopened.Sync.pendingCount() }));

    // The one thing that IS kept: a copy of the bytes, which the rescue file carries.
    // Stated as a check so that a fix which removes it is caught here.
    check('a copy of the unreadable bytes is kept for whoever eventually asks',
        device.raw(DAMAGED) !== null, JSON.stringify(device.raw(DAMAGED)));
}

report();
