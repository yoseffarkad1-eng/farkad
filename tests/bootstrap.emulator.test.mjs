// Cutover, through the PRODUCTION write path, against a real Firestore.
//
//   firebase emulators:exec --only firestore "node tests/bootstrap.emulator.test.mjs"
//
// tests/rollout.test.mjs proves the RULES will accept a legacy document's first protocol
// write. It does not prove the client sends a safe one, and it cannot: it builds the
// bootstrap payload from snapshot.data() inside its own transaction, which is a shape
// production never uses. Production prepares a patch BEFORE the authoritative read, out
// of whatever is in its durable queue.
//
// So this file drives the real js/sync/sync.js against the real
// js/sync/firebase-adapter.js against the emulator, and asks the question the other two
// suites fall between:
//
//   the live document is legacy and carries a day another phone corrected this evening;
//   this phone has an OLDER value for that same day sitting in its outbox from before it
//   updated. It comes online. What lands?
//
// Before this suite: the queued value. The first protocol write is accepted at revision 1
// against a base of 0 - it cannot be refused, because a document with no revision has
// nothing to compare - and it carries the business paths with it. The correction is gone,
// nothing is held, nothing is said, and the document now says revision 1 as though the
// ordering had been in force the whole time. Cutover was the one moment the protocol did
// not protect.

import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { makeDevice, settle, settleUntil } from './harness.mjs';
import { suite, check, given, report } from './runner.mjs';

const ADAPTER = fileURLToPath(new URL('../js/sync/firebase-adapter.js', import.meta.url));
const SHIM = fileURLToPath(new URL('../js/sync/_adapter-bootstrap-test.mjs', import.meta.url));
const CONFIG = fileURLToPath(new URL('../js/sync/_bootstrap-test-config.mjs', import.meta.url));

const source = readFileSync(ADAPTER, 'utf8');
const rewritten = source
    .replace('"https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js"', '"firebase/app"')
    .replace('"https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js"', '"firebase/auth"')
    .replace('"https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js"', '"firebase/firestore"')
    .replace("from './firebase-config.js'", "from './_bootstrap-test-config.mjs'");

{
    suite('the module under test is the shipped module');
    const before = source.split('\n');
    const after = rewritten.split('\n');
    const moved = before.map((line, at) => (line === after[at] ? null : at))
        .filter(at => at !== null);
    given('the same number of lines', before.length === after.length,
        `${before.length} vs ${after.length}`);
    check('exactly four lines differ, and every one is an import specifier',
        moved.length === 4 && moved.every(at =>
            before[at].indexOf('gstatic.com') !== -1
            || before[at].indexOf("from './firebase-config.js'") !== -1),
        JSON.stringify(moved.map(at => before[at].trim().slice(0, 60))));
    check('and no real project credential travels into the module under test',
        rewritten.indexOf("from './firebase-config.js'") === -1,
        'config import redirected');
}

writeFileSync(CONFIG, 'export const firebaseConfig = { apiKey: "", projectId: "" };\n'
    + 'export const SCHEDULE_DOC_PATH = "schedules/current";\n');
writeFileSync(SHIM, rewritten);
let firestoreOps;
try {
    ({ firestoreOps } = await import('./../js/sync/_adapter-bootstrap-test.mjs'));
} finally {
    try { unlinkSync(SHIM); } catch (error) { /* best effort */ }
    try { unlinkSync(CONFIG); } catch (error) { /* best effort */ }
}

const { doc, getDoc, setDoc, onSnapshot } = await import('firebase/firestore');

const env = await initializeTestEnvironment({
    projectId: 'farkad-bootstrap-emulator',
    firestore: {
        rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'),
        host: '127.0.0.1',
        port: 8080
    }
});

const ALLOWED = 'yosef.farkad1@gmail.com';
const as = email => env.authenticatedContext(email.replace(/[^a-z0-9]/gi, ''), { email }).firestore();
const PATH = ['schedules', 'current'];
const DAY = '2026-08-12';
const FIELD = `days.${DAY}.actual.w_01`;

const WORKERS = [{ id: 'w_01', name: 'דוד', active: true, dailyRate: 400, hourlyRate: 0 }];
const PLACES = [
    { id: 'p_01', name: 'הרצליה', active: true },
    { id: 'p_02', name: 'רעננה', active: true }
];

// THE DOCUMENT THAT IS ACTUALLY UP THERE: a roster, days and an advance, written by
// builds that had never heard of a revision. No protocol, no revision, no lastOpId, no
// receipt.
const LEGACY = () => ({
    schemaVersion: 2,
    workers: WORKERS.map(w => ({ ...w })),
    places: PLACES.map(p => ({ ...p })),
    days: {
        '2026-08-10': { actual: { w_01: { entries: [{ placeId: 'p_01' }], rates: { daily: 400, hourly: 0 } } } }
    },
    advances: { a_old: { id: 'a_old', workerId: 'w_01', date: '2026-08-05', amount: 300, note: '' } },
    updatedAt: '2026-08-11T18:00:00.000Z',
    updatedBy: 'd_old'
});

// The correction the OTHER phone made this evening, while still on the old build. A
// legacy write: no protocol, and the rules take it because the document has no revision.
const CORRECTION = { entries: [{ placeId: 'p_02' }], rates: { daily: 400, hourly: 0 } };

async function seedLegacy() {
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async ctx => {
        await setDoc(doc(ctx.firestore(), ...PATH), LEGACY());
    });
}

async function oldPhoneCorrects() {
    const db = as(ALLOWED);
    const raw = await readDoc();
    const next = JSON.parse(JSON.stringify(raw));
    next.days[DAY] = { actual: { w_01: CORRECTION } };
    next.updatedAt = '2026-08-12T19:00:00.000Z';
    next.updatedBy = 'd_oldphone';
    // Straight through the rules as a legacy write - which is what an un-updated phone
    // does, and what legacyWrite() in firestore.rules is there to allow before cutover.
    await setDoc(doc(db, ...PATH), next);
}

const readDoc = async () => {
    let held = null;
    await env.withSecurityRulesDisabled(async ctx => {
        const snap = await getDoc(doc(ctx.firestore(), ...PATH));
        held = snap.exists() ? snap.data() : null;
    });
    return held;
};

const valueAt = (raw, path) => String(path).split('.').reduce(
    (node, part) => (node && typeof node === 'object' ? node[part] : undefined), raw);

// An adapter with production's write path and a subscription this test can hold shut.
//
// Holding it shut is not a contrivance: it is the ordinary shape of coming back into
// signal. The queue flushes on connect, and the first snapshot arrives when the network
// gets round to it - so a device can and does send before it has been told anything.
function adapterFor(db, options = {}) {
    const ops = firestoreOps(db, doc(db, ...PATH), id => doc(db, ...PATH, 'receipts', String(id)));
    // ACROSS THE REALM BOUNDARY. The device runs in its own V8 context, so the objects in
    // its patch are instances of that context's Object - and the Firestore SDK refuses
    // them as "a custom Object object". On a real phone there is no boundary; the values
    // are ordinary objects and then JSON on the wire. A JSON round-trip here is what the
    // wire does anyway, and it is the only thing this wrapper changes.
    const plain = value => JSON.parse(JSON.stringify(value));
    let release = null;
    const gate = options.holdSubscription
        ? new Promise(resolve => { release = resolve; })
        : Promise.resolve();
    return {
        ops,
        releaseSubscription() { if (release) release(); },
        adapter: {
            update: patch => ops.update(plain(patch)),
            save: data => ops.save(plain(data)),
            create: data => ops.create(plain(data)),
            bootstrap: ops.bootstrap ? (payload => ops.bootstrap(plain(payload))) : undefined,
            read: async () => {
                const snap = await getDoc(doc(db, ...PATH));
                return snap.exists() ? snap.data() : null;
            },
            subscribe(onNext, onError) {
                let stop = null;
                gate.then(() => {
                    stop = onSnapshot(doc(db, ...PATH),
                        snap => onNext(snap.exists() ? snap.data() : null),
                        error => onError(error));
                });
                return () => { if (stop) stop(); };
            }
        }
    };
}

// A phone that updated, and has an edit in its outbox from before it did.
function updatedPhone(id) {
    const device = makeDevice({ deviceId: id });
    device.Sync.pushDelayMs = 5;
    device.setToday('2026-08-20');
    device.ctx.askTell = () => Promise.resolve();
    device.State.schedule.workers = WORKERS.map(w => ({ ...w }));
    device.State.schedule.places = PLACES.map(p => ({ ...p }));
    device.State.save({ silent: true });
    return device;
}

// ------------------------------------------------ the reproduction
{
    suite('cutover: a stale queued edit must not overwrite a newer correction');

    await seedLegacy();
    await oldPhoneCorrects();
    const before = await readDoc();
    given('the cloud holds the other phone\'s correction',
        JSON.stringify(valueAt(before, `days.${DAY}.actual.w_01`)) === JSON.stringify(CORRECTION),
        JSON.stringify(valueAt(before, `days.${DAY}.actual.w_01`)));
    given('and the document is still legacy - no revision anywhere',
        before.revision === undefined && before.protocol === undefined,
        JSON.stringify({ revision: before.revision, protocol: before.protocol }));

    // OFFLINE, and older. This phone recorded p_01 for that day before it updated and
    // before the other phone corrected it; the edit has been sitting in its outbox since.
    const phone = updatedPhone('d_updated');
    phone.State.commit(phone.call('assignPlace', phone.State.schedule, DAY, 'w_01',
        'actual', 'p_01'));
    given('the phone is holding that edit durably',
        phone.Sync.pendingCount() > 0, `${phone.Sync.pendingCount()} pending`);

    const wired = adapterFor(as(ALLOWED), { holdSubscription: true });
    phone.Sync.connect(wired.adapter);
    await settleUntil(async () => {
        const raw = await readDoc();
        return Number.isInteger(raw && raw.revision);
    }, 8000, 100);
    await settle(400);

    const after = await readDoc();
    const landed = valueAt(after, `days.${DAY}.actual.w_01`);

    check('the correction another phone made is still there',
        JSON.stringify(landed) === JSON.stringify(CORRECTION),
        JSON.stringify(landed));
    check('the bootstrap wrote protocol fields and nothing else',
        after.revision === 1 && after.protocol === 1
        && typeof after.lastOpId === 'string',
        JSON.stringify({ revision: after.revision, protocol: after.protocol }));
    check('every other legacy byte survived',
        JSON.stringify(after.workers) === JSON.stringify(LEGACY().workers)
        && JSON.stringify(after.advances) === JSON.stringify(LEGACY().advances)
        && Boolean(after.days['2026-08-10']),
        JSON.stringify(Object.keys(after.days)));
    check('and the phone is still holding its own edit rather than having landed it',
        phone.Sync.pendingCount() > 0, `${phone.Sync.pendingCount()} pending`);
    check('and does not claim to be synced', phone.Sync.status !== 'synced',
        phone.Sync.status);

    wired.releaseSubscription();
    await settle(300);
    phone.Sync.disconnect && phone.Sync.disconnect();
}


// ------------------------------------------------ the bootstrap touched nothing else
{
    suite('cutover: the bootstrap write changes five fields and no others');

    await seedLegacy();
    const before = await readDoc();

    const phone = updatedPhone('d_only');
    phone.State.commit(phone.call('assignPlace', phone.State.schedule, '2026-08-19', 'w_01',
        'actual', 'p_01'));
    const wired = adapterFor(as(ALLOWED), { holdSubscription: true });
    phone.Sync.connect(wired.adapter);
    await settleUntil(async () => {
        const raw = await readDoc();
        return Number.isInteger(raw && raw.revision);
    }, 8000, 100);
    await settle(400);

    const after = await readDoc();
    // Field by field, against the document as it was. Only the five the bootstrap is
    // allowed to write may differ; the ones a person recorded must be identical.
    const PROTOCOL_FIELDS = ['protocol', 'revision', 'lastOpId', 'updatedAt', 'updatedBy'];
    const businessBefore = {};
    const businessAfter = {};
    Object.keys(before).forEach(key => {
        if (PROTOCOL_FIELDS.indexOf(key) !== -1) return;
        businessBefore[key] = before[key];
    });
    Object.keys(after).forEach(key => {
        if (PROTOCOL_FIELDS.indexOf(key) !== -1) return;
        businessAfter[key] = after[key];
    });
    // 2026-08-19 is a path the legacy document has nothing at, so it is disjoint and is
    // allowed to merge afterwards - which is a different write. Judge the bootstrap by
    // the fields it may not touch.
    delete businessAfter.days['2026-08-19'];

    const differing = Object.keys(businessBefore).filter(key =>
        JSON.stringify(businessAfter[key]) !== JSON.stringify(businessBefore[key]));
    check('every business field is byte-for-byte what it was', differing.length === 0,
        JSON.stringify(differing.map(key => ({
            key,
            before: JSON.stringify(businessBefore[key]).slice(0, 90),
            after: JSON.stringify(businessAfter[key]).slice(0, 90)
        }))));
    check('no business key appeared or disappeared',
        JSON.stringify(Object.keys(businessAfter).sort())
            === JSON.stringify(Object.keys(businessBefore).sort()),
        JSON.stringify(Object.keys(businessAfter).sort()));
    check('and the document is in the protocol',
        after.protocol === 1 && Number.isInteger(after.revision) && after.revision >= 1,
        JSON.stringify({ protocol: after.protocol, revision: after.revision }));

    wired.releaseSubscription();
    await settle(300);
}

// ------------------------------------------------ a disjoint queued edit still merges
{
    suite('cutover: an edit nobody contested lands, and the correction stays');

    await seedLegacy();
    await oldPhoneCorrects();

    // A DIFFERENT day from the one the other phone corrected. This is the ordinary case -
    // two people filling in one week - and it must not be collateral damage of the fix.
    const phone = updatedPhone('d_disjoint');
    phone.State.commit(phone.call('assignPlace', phone.State.schedule, '2026-08-18', 'w_01',
        'actual', 'p_01'));
    const wired = adapterFor(as(ALLOWED), { holdSubscription: true });
    phone.Sync.connect(wired.adapter);
    await settleUntil(async () => {
        const raw = await readDoc();
        return Boolean(raw && raw.days && raw.days['2026-08-18']);
    }, 10000, 100);
    await settle(500);

    const after = await readDoc();
    check('the disjoint day landed', Boolean(after.days['2026-08-18']),
        JSON.stringify(Object.keys(after.days)));
    check('the other phone\'s correction is untouched',
        JSON.stringify(valueAt(after, `days.${DAY}.actual.w_01`)) === JSON.stringify(CORRECTION),
        JSON.stringify(valueAt(after, `days.${DAY}.actual.w_01`)));
    check('the revision counts the bootstrap and the merge, in order',
        after.revision === 2, String(after.revision));
    check('and the phone has nothing left owing',
        phone.Sync.pendingCount() === 0, `${phone.Sync.pendingCount()} pending`);

    wired.releaseSubscription();
    await settle(300);
}

// ------------------------------------------------ two phones racing the cutover
{
    suite('cutover: two updated phones racing, and only one bootstrap');

    await seedLegacy();
    const a = updatedPhone('d_race_a');
    const b = updatedPhone('d_race_b');
    a.State.commit(a.call('assignPlace', a.State.schedule, '2026-08-17', 'w_01', 'actual', 'p_01'));
    b.State.commit(b.call('assignPlace', b.State.schedule, '2026-08-18', 'w_01', 'actual', 'p_02'));

    const wiredA = adapterFor(as(ALLOWED), { holdSubscription: true });
    const wiredB = adapterFor(as(ALLOWED), { holdSubscription: true });
    a.Sync.connect(wiredA.adapter);
    b.Sync.connect(wiredB.adapter);
    await settleUntil(async () => {
        const raw = await readDoc();
        return Boolean(raw && raw.days && raw.days['2026-08-17'] && raw.days['2026-08-18']);
    }, 15000, 150);
    await settle(700);

    const after = await readDoc();
    check('both phones\' days are in the document',
        Boolean(after.days['2026-08-17']) && Boolean(after.days['2026-08-18']),
        JSON.stringify(Object.keys(after.days)));
    check('the legacy day is still there too', Boolean(after.days['2026-08-10']),
        JSON.stringify(Object.keys(after.days)));

    // EXACTLY ONE BOOTSTRAP. The loser's is refused because the document now carries a
    // revision, and it rebases its own edit onto it - so the count of receipts whose
    // revision is 1 is one, whichever phone got there first.
    let firsts = 0;
    await env.withSecurityRulesDisabled(async ctx => {
        const { getDocs, collection } = await import('firebase/firestore');
        const snap = await getDocs(collection(ctx.firestore(), ...PATH, 'receipts'));
        snap.forEach(entry => { if (entry.data().revision === 1) firsts += 1; });
    });
    check('exactly one write claimed revision 1', firsts === 1, `${firsts} receipts at revision 1`);
    check('and neither phone is left holding work',
        a.Sync.pendingCount() === 0 && b.Sync.pendingCount() === 0,
        `A ${a.Sync.pendingCount()} pending / ${a.Sync.status}; `
        + `B ${b.Sync.pendingCount()} pending / ${b.Sync.status}`);

    wiredA.releaseSubscription();
    wiredB.releaseSubscription();
    await settle(300);
}

// ------------------------------------------------ process death across the boundary
{
    suite('cutover: killed mid-flight, reopened, and it converges with no second edit');

    await seedLegacy();
    await oldPhoneCorrects();

    const first = updatedPhone('d_death');
    first.State.commit(first.call('assignPlace', first.State.schedule, DAY, 'w_01',
        'actual', 'p_01'));
    const disk = first.dump();
    given('the edit is on the disk before anything is sent',
        first.Sync.pendingCount() > 0, `${first.Sync.pendingCount()} pending`);

    // The process dies here. Nothing was sent; the queue is on the disk.
    const reopened = makeDevice({ deviceId: 'd_death', storage: disk });
    reopened.Sync.pushDelayMs = 5;
    reopened.setToday('2026-08-20');
    reopened.ctx.askTell = () => Promise.resolve();
    reopened.State.load();

    const wired = adapterFor(as(ALLOWED), { holdSubscription: true });
    reopened.Sync.connect(wired.adapter);
    await settleUntil(async () => {
        const raw = await readDoc();
        return Number.isInteger(raw && raw.revision);
    }, 10000, 100);
    await settle(500);

    const after = await readDoc();
    check('the reopened device still did not overwrite the correction',
        JSON.stringify(valueAt(after, `days.${DAY}.actual.w_01`)) === JSON.stringify(CORRECTION),
        JSON.stringify(valueAt(after, `days.${DAY}.actual.w_01`)));
    check('its own edit is still on its own disk',
        Boolean(reopened.State.schedule.days[DAY]),
        JSON.stringify(Object.keys(reopened.State.schedule.days)));
    check('still held rather than acknowledged', reopened.Sync.pendingCount() > 0,
        `${reopened.Sync.pendingCount()} pending`);
    check('and it does not say synced', reopened.Sync.status !== 'synced',
        reopened.Sync.status);

    // AND NOT TWICE. Reopening must not turn one held edit into two operations, or the
    // person who eventually resolves the conflict resolves it twice.
    const opKeys = Object.keys(reopened.dump()).filter(key => key.indexOf('farkad:outbox:op:') === 0);
    check('one queued operation, not two', opKeys.length === 1, JSON.stringify(opKeys));

    wired.releaseSubscription();
    await settle(300);
}

report();
