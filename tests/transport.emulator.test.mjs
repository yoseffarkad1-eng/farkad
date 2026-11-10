// הסעות, shared - against a REAL Firestore: the rules, the production adapter, and two
// phones running the shipped client at once.
//
//   firebase emulators:exec --only firestore "node tests/transport.emulator.test.mjs"
//
// tests/transport.share.test.mjs proves the client against a fake cloud. A fake is only
// as true as what it was copied from, so this file is the original: firestore.rules as
// they would be pasted, js/sync/firebase-adapter.js as it is shipped (its transportOps,
// imported the way tests/cas.emulator.test.mjs imports firestoreOps), and
// js/ui/transport-share.js running in two devices wired to them.
//
//   R   the rules for schedules/<doc>/transport/<name>: who, what shape, which revision
//   A   the adapter: the compare-and-set, what a refusal carries, what a listener hears
//   P   two phones: the same seat, the same man in two cars, a day offline, a vehicle
//       kept home against a man seated in it
//   S   the schedule document: not a byte of it moves for any of this
//   ADD the new rules file is main's file plus one block, and nothing else
//   OLD this build under the rules in the field today: «עדיין לא משותף», the record syncs
//
// Never the real project: the emulator, synthetic names, and an unconfigured adapter.

import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { suite, check, same, given, report } from './runner.mjs';
import { makeDevice, settle, settleUntil, sourceRoot } from './harness.mjs';
import { emulatorHost } from './emulator-host.mjs';

const EMULATOR = emulatorHost();
const ADAPTER = fileURLToPath(new URL('../js/sync/firebase-adapter.js', import.meta.url));
const SHIM = fileURLToPath(new URL('../js/sync/_adapter-transport-test.mjs', import.meta.url));
const CONFIG = fileURLToPath(new URL('../js/sync/_adapter-transport-config.mjs', import.meta.url));
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

const source = readFileSync(ADAPTER, 'utf8');
const rewritten = source
    .replace('"https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js"', '"firebase/app"')
    .replace('"https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js"', '"firebase/auth"')
    .replace('"https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js"', '"firebase/firestore"')
    .replace("from './firebase-config.js'", "from './_adapter-transport-config.mjs'");

{
    suite('the module under test is the shipped module');
    const before = source.split('\n');
    const after = rewritten.split('\n');
    const moved = before.map((line, at) => (line === after[at] ? null : at)).filter(at => at !== null);
    check('exactly four lines differ, and every one is an import specifier',
        before.length === after.length && moved.length === 4 && moved.every(at =>
            before[at].indexOf('gstatic.com') !== -1 || before[at].indexOf("from './firebase-config.js'") !== -1),
        JSON.stringify(moved.map(at => before[at].trim().slice(0, 60))));
}

writeFileSync(CONFIG, 'export const firebaseConfig = { apiKey: "", projectId: "" };\n'
    + 'export const SCHEDULE_DOC_PATH = "schedules/current";\n');
writeFileSync(SHIM, rewritten);
let transportOps;
let firestoreOps;
try {
    ({ transportOps, firestoreOps } = await import('./../js/sync/_adapter-transport-test.mjs'));
} finally {
    try { unlinkSync(SHIM); } catch (error) { /* best effort */ }
    try { unlinkSync(CONFIG); } catch (error) { /* best effort */ }
}

const { doc, collection, getDoc, getDocs, setDoc, updateDoc, deleteDoc, onSnapshot, query, where, documentId,
    disableNetwork, enableNetwork } = await import('firebase/firestore');

const NEW_RULES = read('../firestore.rules');
// The rules in the field BEFORE the transport block. The owner pastes rules by hand, and
// what was live on 2026-11-10 was verified byte-identical to main's file of that morning
// (d3103d6; v184's 990f5b4 carries the same bytes). NOT origin/main: since v185 was merged
// main's file HAS the block - merging it published nothing - and reading "the rules of
// before" from there made this suite compare the new rules with themselves (seen the first
// time it was run on top of v185: the phone under "the old rules" said shared).
const git = (...args) => execFileSync('git', args, { cwd: sourceRoot(), encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
const oldRulesFrom = ['d3103d6', '990f5b4', 'e2fd07a'].find(revision => {
    try { git('cat-file', '-e', `${revision}:firestore.rules`); return true; } catch (error) { return false; }
});
const OLD_RULES = oldRulesFrom ? git('show', `${oldRulesFrom}:firestore.rules`) : null;

const env = await initializeTestEnvironment({
    projectId: 'farkad-transport-emulator',
    firestore: { rules: NEW_RULES, host: EMULATOR.host, port: EMULATOR.port }
});

const OWNER = 'yosef.farkad1@gmail.com';
const SECOND = 'farkad1963@gmail.com';
const THIRD = 'mu.mahameed1992@gmail.com';
const STRANGER = 'somebody.else@gmail.com';
const dbOf = (in_, email) => in_.authenticatedContext(email.replace(/[^a-z0-9]/gi, '') + Math.random().toString(36).slice(2, 8), { email }).firestore();
const as = email => dbOf(env, email);
const PATH = ['schedules', 'current'];
const DAY = '2026-11-10';
const NEXT = '2026-11-11';
const DOC = `day_${DAY}`;
const tdoc = (db, name) => doc(db, ...PATH, 'transport', name);
const stamp = (data, revision) => Object.assign({ v: 1, revision, updatedAt: '2026-11-10T05:00:00.000Z', updatedBy: 'd_test' }, data);
const day = (trips, revision, extra = {}) => stamp(Object.assign({ date: DAY, unavailable: {}, status: {}, trips }, extra), revision);
const settings = (vehicles, revision) => stamp({ vehicles }, revision);
const TRIP = { tv_01: { driver: 'w_01', passengers: ['w_02'], seats: { w_02: 2 } } };
const readRaw = async (in_, ...segments) => {
    let held = null;
    await in_.withSecurityRulesDisabled(async ctx => {
        const snap = await getDoc(doc(ctx.firestore(), ...segments));
        held = snap.exists() ? snap.data() : null;
    });
    return held;
};
const listRaw = async (in_, ...segments) => {
    let names = [];
    await in_.withSecurityRulesDisabled(async ctx => {
        names = (await getDocs(collection(ctx.firestore(), ...segments))).docs.map(one => one.id).sort();
    });
    return names;
};
const SCHEDULE = () => ({
    schemaVersion: 2,
    workers: [{ id: 'w_01', name: 'דוד', active: true, dailyRate: 400, hourlyRate: 0 }],
    places: [{ id: 'p_01', name: 'הרצליה', active: true }],
    days: { [DAY]: { actual: { w_01: { entries: [{ placeId: 'p_01' }], rates: { daily: 400, hourly: 0 } } } } },
    advances: {},
    updatedAt: '2026-11-09T18:00:00.000Z', updatedBy: 'd_seed',
    protocol: 1, revision: 1, lastOpId: 'op_seed', opFingerprint: 'f_op_seed'
});
const scheduleOps = db => firestoreOps(db, doc(db, ...PATH), id => doc(db, ...PATH, 'receipts', String(id)));

async function block(name, body) {
    suite(name);
    try {
        await body();
    } catch (error) {
        check(`${name}: the block ran to its end`, false,
            String((error && error.stack) || error).split('\n').slice(0, 4).join(' | '));
    }
}
// One rule, one answer, kept until the sentence that names the group is said: `tally`
// passes only if there was at least one and every one of them went the way it was asked.
const got = [];
const allow = async promise => { try { await assertSucceeds(promise); return true; } catch (error) { return false; } };
const deny = async promise => { try { await assertFails(promise); return true; } catch (error) { return false; } };
const tally = name => {
    const list = got.splice(0);
    check(name, list.length > 0 && list.every(Boolean), JSON.stringify(list));
};
const refused = async promise => {
    try { await promise; return null; } catch (error) { return error.code || String(error); }
};

// ================================================================== ADD

await block('ADD: the new rules are the rules of before plus one block', async () => {
    given('the rules in the field could be read out of Git', OLD_RULES !== null, String(oldRulesFrom));
    const from = NEW_RULES.indexOf('\n\n      // הסעות, shared: who rides to work in which vehicle.');
    const to = NEW_RULES.indexOf('\n    }\n\n    // One copy of the schedule per day');
    given('the block is where it is expected', from !== -1 && to > from);
    same('with that one block taken out, the file is today\'s file byte for byte',
        NEW_RULES.slice(0, from) + NEW_RULES.slice(to), OLD_RULES);
    const added = NEW_RULES.slice(from, to);
    check('the block allows nothing outside schedules/<doc>/transport', (added.match(/\n\s+match \//g) || []).length === 1
        && added.includes('match /transport/{name} {'));
    check('and never allows a delete', /allow delete: if false;/.test(added) && !/allow (write|delete)[^;]*allowed\(\)/.test(added));
});

// ================================================================== R

await block('R: who may read and write a transport document', async () => {
    await env.clearFirestore();
    const owner = as(OWNER);
    got.push(await allow(setDoc(tdoc(owner, DOC), day(TRIP, 1))));
    got.push(await allow(setDoc(tdoc(as(SECOND), 'settings'), settings([{ id: 'tv_01', name: 'רכב', seats: 5, active: true }], 1))));
    got.push(await allow(getDoc(tdoc(as(THIRD), DOC))));
    got.push(await allow(getDocs(query(collection(as(THIRD), ...PATH, 'transport'), where(documentId(), '>=', 'day_2026-10-06')))));
    tally('each of the three on the list reads, writes and lists');
    const stranger = as(STRANGER);
    got.push(await deny(getDoc(tdoc(stranger, DOC))));
    got.push(await deny(getDocs(collection(stranger, ...PATH, 'transport'))));
    got.push(await deny(setDoc(tdoc(stranger, `day_${NEXT}`), day({}, 1, { date: NEXT }))));
    got.push(await deny(setDoc(tdoc(stranger, DOC), day(TRIP, 2))));
    const nobody = env.unauthenticatedContext().firestore();
    got.push(await deny(getDoc(tdoc(nobody, DOC))));
    got.push(await deny(setDoc(tdoc(nobody, `day_${NEXT}`), day({}, 1, { date: NEXT }))));
    tally('a signed-in stranger and nobody at all are refused every one of them');
    got.push(await deny(setDoc(doc(owner, 'transport', DOC), day(TRIP, 1))));
    got.push(await deny(setDoc(doc(owner, ...PATH, 'transport', DOC, 'more', 'x'), day(TRIP, 1))));
    got.push(await deny(setDoc(doc(owner, ...PATH, 'rides', DOC), day(TRIP, 1))));
    tally('and no other path opened: not a top-level collection, not a deeper one, not a sibling');
});

await block('R: the revision is a compare-and-set, and nothing is deleted', async () => {
    await env.clearFirestore();
    const owner = as(OWNER);
    got.push(await deny(setDoc(tdoc(owner, DOC), day(TRIP, 2))));
    got.push(await deny(setDoc(tdoc(owner, DOC), day(TRIP, 0))));
    got.push(await allow(setDoc(tdoc(owner, DOC), day(TRIP, 1))));
    tally('a document is born at revision 1 and no other');
    got.push(await deny(setDoc(tdoc(owner, DOC), day({}, 1))));
    got.push(await deny(setDoc(tdoc(owner, DOC), day({}, 3))));
    got.push(await deny(updateDoc(tdoc(owner, DOC), { trips: {} })));
    got.push(await allow(setDoc(tdoc(owner, DOC), day({}, 2))));
    got.push(await deny(setDoc(tdoc(as(SECOND), DOC), day(TRIP, 2))));
    got.push(await allow(setDoc(tdoc(as(SECOND), DOC), day(TRIP, 3))));
    tally('and moves by exactly one: the same revision again, a skipped one and a write with none are refused');
    got.push(await deny(deleteDoc(tdoc(owner, DOC))));
    check('nothing deletes it', (await readRaw(env, ...PATH, 'transport', DOC)).revision === 3);
});

await block('R: the shape, as far as rules can check one', async () => {
    await env.clearFirestore();
    const owner = as(OWNER);
    const bad = async (name, data) => got.push(await deny(setDoc(tdoc(owner, name), data)));
    await bad(DOC, Object.assign(day(TRIP, 1), { v: 2 }));
    await bad(DOC, (({ v, ...rest }) => rest)(day(TRIP, 1)));
    await bad(DOC, (({ updatedAt, ...rest }) => rest)(day(TRIP, 1)));
    await bad(DOC, (({ updatedBy, ...rest }) => rest)(day(TRIP, 1)));
    await bad(DOC, Object.assign(day(TRIP, 1), { updatedBy: 'x'.repeat(128) }));
    await bad(DOC, Object.assign(day(TRIP, 1), { revision: '1' }));
    tally('a version, a stamp and a signature, of the right kinds');
    await bad(DOC, Object.assign(day(TRIP, 1), { workers: [] }));
    await bad(DOC, Object.assign(day(TRIP, 1), { marks: {} }));
    await bad(DOC, Object.assign(day(TRIP, 1), { days: {} }));
    await bad('settings', Object.assign(settings([], 1), { trips: {} }));
    await bad('settings', Object.assign(settings([], 1), { workers: {} }));
    tally('no key a plan does not have: not a roster, not a mark, not a day of the record');
    await bad(DOC, day(TRIP, 1, { date: NEXT }));
    await bad(`day_${NEXT}`, day(TRIP, 1));
    await bad('day_2026-11-1', day(TRIP, 1, { date: '2026-11-1' }));
    await bad('today', day(TRIP, 1, { date: 'today' }));
    await bad('receipts', day(TRIP, 1));
    await bad('Settings', settings([], 1));
    tally('a day\'s name is its date, and there is no third kind of name');
    await bad(DOC, day([], 1));
    await bad(DOC, day(TRIP, 1, { unavailable: [] }));
    await bad(DOC, day(TRIP, 1, { status: 'private' }));
    await bad('settings', settings({ tv_01: {} }, 1));
    const many = n => Object.fromEntries(Array.from({ length: n }, (_, i) => [`k_${i}`, true]));
    await bad(DOC, day(many(61), 1));
    await bad(DOC, day(TRIP, 1, { unavailable: many(61) }));
    await bad(DOC, day(TRIP, 1, { status: many(301) }));
    await bad('settings', settings(Array.from({ length: 61 }, (_, i) => ({ id: `tv_${i}` })), 1));
    tally('maps are maps, the list is a list, and each is capped');
    got.push(await allow(setDoc(tdoc(owner, DOC), day(many(60), 1, { unavailable: many(60), status: many(300) }))));
    got.push(await allow(setDoc(tdoc(owner, 'settings'), settings(Array.from({ length: 60 }, (_, i) => ({ id: `tv_${i}`, name: 'x', seats: 5 })), 1))));
    tally('at the caps it is accepted');
});

// ================================================================== S

await block('S: the schedule document does not move, and transport needs none', async () => {
    await env.clearFirestore();
    const owner = as(OWNER);
    got.push(await allow(setDoc(tdoc(owner, DOC), day(TRIP, 1))));
    check('a plan can be shared before any schedule document exists', (await readRaw(env, ...PATH)) === null);
    await env.clearFirestore();
    await scheduleOps(owner).create(SCHEDULE());
    const before = JSON.stringify(await readRaw(env, ...PATH));
    const ops = transportOps(owner, () => collection(owner, ...PATH, 'transport'), name => tdoc(owner, name));
    await ops.write(DOC, 0, day(TRIP, 1));
    await ops.write(DOC, 1, day({}, 2));
    await ops.write('settings', 0, settings([{ id: 'tv_01', name: 'רכב', seats: 5, active: true }], 1));
    same('after three transport writes the schedule is byte for byte what it was', JSON.stringify(await readRaw(env, ...PATH)), before);
    same('its receipts are the one it had', await listRaw(env, ...PATH, 'receipts'), ['op_seed']);
    same('and the plans are documents of their own beside it', await listRaw(env, ...PATH, 'transport'), [DOC, 'settings']);
    // And the other way: the record's own protocol write still lands, at its own revision.
    await scheduleOps(owner).update({ 'days.2026-11-11.actual.w_01': { entries: [{ placeId: 'p_01' }] },
        updatedAt: new Date().toISOString(), updatedBy: 'd_a', protocol: 1, revision: 2, lastOpId: 'op_two', opFingerprint: 'f_two' });
    same('an edit of the record lands at ITS next revision, untouched by the plans\' revisions',
        (await readRaw(env, ...PATH)).revision, 2);
    same('and moves no plan', (await readRaw(env, ...PATH, 'transport', DOC)).revision, 2);
});

// ================================================================== A

await block('A: the production adapter - the compare-and-set and what a refusal carries', async () => {
    await env.clearFirestore();
    const one = as(OWNER);
    const two = as(SECOND);
    const opsOf = db => transportOps(db, () => collection(db, ...PATH, 'transport'), name => tdoc(db, name));
    same('a first write answers its revision', await opsOf(one).write(DOC, 0, day(TRIP, 1)), { revision: 1 });
    let error = null;
    try { await opsOf(two).write(DOC, 0, day({}, 1)); } catch (caught) { error = caught; }
    same('a second "first" write is a conflict', error && error.code, 'conflict');
    same('carrying the revision that is there', error && error.revision, 1);
    same('and the document that won, whole', error && error.document && error.document.trips, TRIP);
    // Two phones that both built on revision 1, at the same moment.
    const both = await Promise.allSettled([
        opsOf(one).write(DOC, 1, day({ tv_01: { driver: 'w_01', passengers: ['w_03'], seats: { w_03: 2 } } }, 2)),
        opsOf(two).write(DOC, 1, day({ tv_01: { driver: 'w_01', passengers: ['w_04'], seats: { w_04: 2 } } }, 2))
    ]);
    same('of two writes built on the same revision exactly one lands', both.filter(one_ => one_.status === 'fulfilled').length, 1);
    const lost = both.find(one_ => one_.status === 'rejected');
    // What the SERVER says to the one that lost at the commit is `permission-denied` (its
    // write is judged against the document the winner left); the adapter reads again and
    // says what happened. Asked of the raw SDK just below, so this stays a measurement.
    same('the other is a conflict', lost && lost.reason.code, 'conflict');
    const held = await readRaw(env, ...PATH, 'transport', DOC);
    same('handed the very document the server holds', lost && lost.reason.document, held);
    same('at revision 2', held.revision, 2);
    const rawRace = await Promise.allSettled([one, two].map((db, i) => setDoc(tdoc(db, DOC), day({ tv_02: { driver: `w_0${i + 5}`, passengers: [], seats: {} } }, 3))));
    same('the server\'s own word for a write that lost the revision is permission-denied - which is why the adapter looks again',
        rawRace.filter(one_ => one_.status === 'rejected').map(one_ => one_.reason.code), ['permission-denied']);
    same('a write that does not say base + 1 is refused before it is sent',
        await refused(opsOf(one).write(DOC, 3, day({}, 5))), 'conflict');
    same('a malformed document is refused by the rules, not by the adapter - and stays permission-denied after the second look',
        await refused(opsOf(one).write(DOC, 3, Object.assign(day({}, 4), { marks: {} }))), 'permission-denied');
    same('a stranger is refused at the read the transaction begins with',
        await refused(opsOf(as(STRANGER)).write(DOC, 3, day({}, 4))), 'permission-denied');
    same('and none of those moved it', (await readRaw(env, ...PATH, 'transport', DOC)).revision, 3);
});

await block('A: the production adapter - what a listener hears, and when it is the cache speaking', async () => {
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async ctx => {
        const db = ctx.firestore();
        await setDoc(tdoc(db, 'day_2026-09-01'), stamp({ date: '2026-09-01', unavailable: {}, status: {}, trips: {} }, 1));
        await setDoc(tdoc(db, DOC), day(TRIP, 1));
        await setDoc(tdoc(db, 'settings'), settings([{ id: 'tv_01', name: 'רכב', seats: 5, active: true }], 1));
    });
    const db = as(OWNER);
    const ops = transportOps(db, () => collection(db, ...PATH, 'transport'), name => tdoc(db, name));
    const heard = [];
    const stop = ops.subscribe('day_2026-10-06', (docs, info) => heard.push({ names: docs.map(one => one.name), live: info.live, docs }), () => {});
    given('the listener answered', await settleUntil(() => heard.some(one => one.live), 8000, 20));
    const first = heard.find(one => one.live);
    same('from five weeks back: the day and the list, not the old day', first && first.names, [DOC, 'settings']);
    same('with the data as plain objects', first && first.docs[0].data.trips, TRIP);
    const other = as(SECOND);
    await setDoc(tdoc(other, DOC), day({}, 2));
    given('the write was heard', await settleUntil(() => heard.some(one => one.live && one.docs[0].data.revision === 2), 8000, 20));
    check('another phone\'s write is heard, live', heard.some(one => one.live && one.docs[0].data.revision === 2));
    const count = heard.length;
    await disableNetwork(db);
    given('the listener spoke again', await settleUntil(() => heard.length > count, 8000, 20));
    same('the signal gone, it says so: the same list, marked as not live',
        heard.slice(count).map(one => one.live).includes(false), true);
    await setDoc(tdoc(other, DOC), day(TRIP, 3));
    await enableNetwork(db);
    given('it heard revision 3', await settleUntil(() => heard.some(one => one.live && one.docs[0].data.revision === 3), 8000, 20));
    check('and back, it hears what it missed, live', heard.some(one => one.live && one.docs[0].data.revision === 3));
    stop();
    let failure = null;
    const strangerDb = as(STRANGER);
    transportOps(strangerDb, () => collection(strangerDb, ...PATH, 'transport'), name => tdoc(strangerDb, name))
        .subscribe('day_2026-10-06', () => { failure = 'delivered'; }, error => { failure = error.code; });
    given('the stranger\'s listener was answered', await settleUntil(() => failure !== null, 8000, 20));
    same('a listener the rules refuse is told so, and hears nothing', failure, 'permission-denied');
});

// ================================================================== P: two phones

const SEDER = read('../js/ui/seder.js');
const ENGINE = read('../js/model/transport.js');
const SCREEN = read('../js/ui/transport.js');
const SHARE = read('../js/ui/transport-share.js');
const WORKERS = () => ['w_01', 'w_02', 'w_03', 'w_04', 'w_06'].map((id, i) => (
    { id, name: `עובד ${i + 1}`, active: true, dailyRate: 400, hourlyRate: 0, phone: '' }));
const PLACES = () => [{ id: 'p_01', name: 'אתר א', active: true }, { id: 'p_02', name: 'אתר ב', active: true }];
const plain = value => JSON.parse(JSON.stringify(value));

// A device running the shipped client, its transport wired to the PRODUCTION adapter on
// the emulator. Across the realm boundary a document is JSON, as on the wire.
function phone(id, in_, email, options = {}) {
    const device = makeDevice({ deviceId: id, storage: options.storage || { 'farkadTransport:enabled': '1' } });   // no flag: the gate as this commit ships it
    device.Sync.pushDelayMs = 5;
    device.setToday(DAY);
    device.ctx.askTell = () => Promise.resolve();
    device.ctx.askConfirm = () => Promise.resolve(true);
    [['js/ui/seder.js', SEDER], ['js/model/transport.js', ENGINE], ['js/ui/transport.js', SCREEN], ['js/ui/transport-share.js', SHARE]]
        .forEach(([file, code]) => vm.runInContext(code, device.ctx, { filename: file }));
    device.State.schedule.workers = WORKERS();
    device.State.schedule.places = PLACES();
    device.State.save({ silent: true });
    [DAY, NEXT].forEach(date => WORKERS().forEach((worker, i) => device.State.commit(
        device.call('assignPlace', device.State.schedule, date, worker.id, 'actual', i < 2 ? 'p_01' : 'p_02'))));
    const db = dbOf(in_, email);
    const ops = transportOps(db, () => collection(db, ...PATH, 'transport'), name => tdoc(db, name));
    const share = device.global('TransportShare');
    share.flushDelayMs = options.flushDelayMs === undefined ? 20 : options.flushDelayMs;
    share.retryMs = 150;
    share.staleGraceMs = 150;
    share.retryMaxMs = 1000;
    return { device, db, share,
        adapter: { write: (name, base, data) => ops.write(name, base, plain(data)), subscribe: ops.subscribe },
        connect() { return share.connect(this.adapter); },
        place: (worker, vehicle, n, date = DAY) => device.call('transportPlace', date, worker, vehicle, n),
        seats(date = DAY) {
            const trips = device.call('transportDayOf', date).trips;
            return Object.keys(trips).sort().map(v => `${v}=${trips[v].driver || '?'}+[${trips[v].passengers.join(',')}]`).join(' ');
        },
        aside: (name = DOC) => { const raw = device.raw(`farkadTransport:aside:${name}`); return raw ? JSON.parse(raw) : null; } };
}
const seatsOf = held => (held ? Object.keys(held.trips).sort().map(v => `${v}=${held.trips[v].driver || '?'}+[${held.trips[v].passengers.join(',')}]`).join(' ') : null);
const everyone = held => Object.keys(held.trips).flatMap(v => [held.trips[v].driver].concat(held.trips[v].passengers)).filter(Boolean);
// SETTLED IS NOT "NOTHING OWED". A phone that owes nothing and says «משותף» may simply not
// have HEARD the other's last write yet - the listener is a second channel - and a barrier
// that asked only the first question let a check read a phone one snapshot early (seen
// once, on a loaded machine: both phones "shared", and one of them still drawing nothing).
// So: nothing owed, both say shared, AND each phone's own record of every document on the
// server is at the server's revision.
const quiet = (...phones) => settleUntil(async () => {
    if (!phones.every(one => one.share.owed() === null && one.share.state() === 'shared')) return false;
    for (const name of await listRaw(env, ...PATH, 'transport')) {
        const held = await readRaw(env, ...PATH, 'transport', name);
        const level = phones.every(one => {
            const raw = one.device.raw(`farkadTransport:shared:${name}`);
            return Boolean(raw) && JSON.parse(raw).rev === held.revision;
        });
        if (!level) return false;
    }
    return true;
}, 20000, 25);

async function pair() {
    await env.clearFirestore();
    const a = phone('d_a', env, OWNER);
    const b = phone('d_b', env, SECOND);
    a.connect();
    b.connect();
    a.place('w_01', 'tv_01', 1);
    given('both phones hold the same day', await quiet(a, b) && b.seats() === 'tv_01=w_01+[]', `${a.share.state()}/${b.share.state()} ${b.seats()}`);
    return { a, b };
}

await block('P: two phones seat different men on the same seat', async () => {
    const { a, b } = await pair();
    a.place('w_02', 'tv_01', 2);
    b.place('w_03', 'tv_01', 2);
    same('each sees its own man at once', [a.seats(), b.seats()], ['tv_01=w_01+[w_02]', 'tv_01=w_01+[w_03]']);
    given('both settle', await quiet(a, b), `${a.share.state()}/${b.share.state()}`);
    const held = await readRaw(env, ...PATH, 'transport', DOC);
    same('exactly one of the two writes landed', held.revision, 2);
    const won = seatsOf(held);
    check('one of the two men has the seat', won === 'tv_01=w_01+[w_02]' || won === 'tv_01=w_01+[w_03]', won);
    same('both phones show the plan that won', [a.seats(), b.seats()], [won, won]);
    const loser = won === 'tv_01=w_01+[w_02]' ? b : a;
    const winner = loser === a ? b : a;
    same('the loser\'s own plan is aside on its disk', seatsOf(JSON.parse(loser.aside().text)),
        loser === b ? 'tv_01=w_01+[w_03]' : 'tv_01=w_01+[w_02]');
    same('and it is told, once', loser.share.notices(DAY), [{ name: DOC, why: 'changed' }]);
    same('the winner has nothing aside and is told nothing', [winner.aside(), winner.share.notices(DAY)], [null, []]);
    // Use mine: an ordinary change, through the same check.
    loser.share.useMine(DOC);
    given('it goes up', await quiet(a, b));
    const after = await readRaw(env, ...PATH, 'transport', DOC);
    same('the loser\'s plan is the next revision', [after.revision, seatsOf(after)],
        [3, loser === b ? 'tv_01=w_01+[w_03]' : 'tv_01=w_01+[w_02]']);
    same('and the other phone draws it with nothing said', [winner.seats(), winner.share.notices(DAY)], [seatsOf(after), []]);
});

await block('P: the same man put in two cars', async () => {
    const { a, b } = await pair();
    a.place('w_02', 'tv_02', 1);
    b.place('w_02', 'tv_05', 1);
    given('both settle', await quiet(a, b));
    const held = await readRaw(env, ...PATH, 'transport', DOC);
    same('on the server he is in exactly one seat', everyone(held).filter(id => id === 'w_02').length, 1);
    same('nobody at all is in two', new Set(everyone(held)).size, everyone(held).length);
    same('both phones hold that plan', [a.seats(), b.seats()], [seatsOf(held), seatsOf(held)]);
    same('one phone holds its own aside and is told', [a, b].filter(one => one.aside() && one.share.notices(DAY).length === 1).length, 1);
});

await block('P: a vehicle kept home on one phone while the other seats a man in it', async () => {
    const { a, b } = await pair();
    a.device.call('transportSetAvailable', DAY, 'tv_05', false);
    b.place('w_02', 'tv_05', 1);
    given('both settle', await quiet(a, b));
    const held = await readRaw(env, ...PATH, 'transport', DOC);
    check('the server holds one plan or the other - never a man in a vehicle that stays home',
        !(held.unavailable.tv_05 && held.trips.tv_05), JSON.stringify(held));
    same('both phones hold it', [a.seats(), JSON.stringify(a.device.call('transportDayOf', DAY).unavailable)],
        [b.seats(), JSON.stringify(b.device.call('transportDayOf', DAY).unavailable)]);
    same('the loser was told', [a, b].filter(one => one.share.notices(DAY).length === 1).length, 1);
});

await block('P: a phone offline for a day, and back', async () => {
    const { a, b } = await pair();
    await disableNetwork(b.db);
    given('B noticed the signal went', await settleUntil(() => b.share.state() === 'unchecked', 8000, 25), b.share.state());
    same('offline with nothing owed, it says it cannot check', b.share.state(), 'unchecked');
    b.place('w_03', 'tv_02', 1);
    b.place('w_04', 'tv_02', 2);
    b.place('w_02', 'tv_05', 1, NEXT);
    same('its changes are on the phone at once', b.seats(), 'tv_01=w_01+[] tv_02=w_03+[w_04]');
    same('and are said to be owed', b.share.state(), 'waiting');
    a.place('w_02', 'tv_01', 2);
    a.place('w_06', 'tv_01', 3);
    given('A\'s changes went up', await settleUntil(() => a.share.owed() === null, 8000, 25));
    await settle(400);
    same('offline, nothing of B\'s reached the server', seatsOf(await readRaw(env, ...PATH, 'transport', DOC)), 'tv_01=w_01+[w_02,w_06]');
    same('nor its other day', await readRaw(env, ...PATH, 'transport', `day_${NEXT}`), null);
    await enableNetwork(b.db);
    given('back, it settles', await quiet(a, b), `${a.share.state()}/${b.share.state()}`);
    same('the day both touched: the server\'s plan is drawn on B', b.seats(), 'tv_01=w_01+[w_02,w_06]');
    same('B\'s day of work is aside, whole', seatsOf(JSON.parse(b.aside().text)), 'tv_01=w_01+[] tv_02=w_03+[w_04]');
    same('and B is told', b.share.notices(DAY), [{ name: DOC, why: 'changed' }]);
    same('the server still holds A\'s plan, untouched by B', seatsOf(await readRaw(env, ...PATH, 'transport', DOC)), 'tv_01=w_01+[w_02,w_06]');
    same('the day only B touched went up as B made it', seatsOf(await readRaw(env, ...PATH, 'transport', `day_${NEXT}`)), 'tv_05=w_02+[]');
    same('and A draws it', a.seats(NEXT), 'tv_05=w_02+[]');
});

await block('P: a vehicle turned off (the lasting switch) travels with the list, and writes no day', async () => {
    const { a, b } = await pair();
    a.place('w_02', 'tv_05', 1);
    given('both hold the day', await quiet(a, b) && b.seats() === 'tv_01=w_01+[] tv_05=w_02+[]', b.seats());
    const before = await readRaw(env, ...PATH, 'transport', DOC);
    const diskB = b.device.raw(`farkadTransport:day:${DAY}`);
    same('turned off on A', a.device.call('transportSetVehicleOff', 'tv_05', DAY), true);
    given('it settles', await quiet(a, b));
    same('the rules take the field: the list on the server says off from that day',
        (await readRaw(env, ...PATH, 'transport', 'settings')).vehicles.find(v => v.id === 'tv_05').off, DAY);
    same('on B it is off, and not one of that day\'s vehicles',
        [b.device.call('transportSettings').vehicles.find(v => v.id === 'tv_05').off,
            b.device.call('transportContext', DAY).vehicles.some(v => v.id === 'tv_05')], [DAY, false]);
    same('the day document on the server did not move', await readRaw(env, ...PATH, 'transport', DOC), before);
    same('and B\'s day on its disk was not rewritten', b.device.raw(`farkadTransport:day:${DAY}`), diskB);
    same('still exactly one day and the list', await listRaw(env, ...PATH, 'transport'), [DOC, 'settings']);
});

await block('P: the first meeting - the owner\'s list and plans, then a phone with its own', async () => {
    await env.clearFirestore();
    const owner = phone('d_owner', env, OWNER);
    owner.device.call('transportRenameVehicle', 'tv_02', 'קורולה לבנה');
    owner.place('w_01', 'tv_01', 1);
    owner.connect();
    given('the owner\'s phone settles', await quiet(owner));
    same('an empty cloud takes his list and his day, each at revision 1',
        [(await readRaw(env, ...PATH, 'transport', 'settings')).revision, (await readRaw(env, ...PATH, 'transport', DOC)).revision], [1, 1]);
    const other = phone('d_third', env, THIRD);
    other.device.call('transportRenameVehicle', 'tv_03', 'ביוואידי אפור');
    other.place('w_04', 'tv_03', 1);
    other.connect();
    given('the other phone settles', await quiet(other));
    same('it draws the shared day and the shared list',
        [other.seats(), other.device.call('transportSettings').vehicles.slice(1, 3).map(v => v.name)],
        ['tv_01=w_01+[]', ['קורולה לבנה', 'BYD סיל U 2025']]);
    same('its own are aside, as a first meeting', [other.aside().why, other.aside('settings').why], ['first', 'first']);
    same('and nothing of the owner\'s was written over',
        [(await readRaw(env, ...PATH, 'transport', 'settings')).revision, (await readRaw(env, ...PATH, 'transport', DOC)).revision], [1, 1]);
});

// ================================================================== older builds, new rules
//
// The other half of the rollout: the new rules published while every phone is still on a
// build that has never heard of them. The older build is ITS OWN FILES AND ITS OWN
// ADAPTER, out of Git - not this checkout pretending. (tests/rollout-matrix.test.mjs and
// the other emulator suites, run unchanged under the new file, are the wider answer for
// the record's own protocol; this asks the one thing they do not: does an older build
// come anywhere near the new documents.)
await block('NEW RULES, OLDER BUILDS: they record as before and never touch the shared plans', async () => {
    const has = revision => { try { git('cat-file', '-e', `${revision}^{commit}`); return true; } catch (error) { return false; } };
    const builds = [['v180', 'ac684f8'], ['v182', '61d9416']].filter(([, revision]) => has(revision));
    given('the v180 tree is in this clone', builds.some(([name]) => name === 'v180'), builds.map(one => one[0]).join(','));
    const { loadOrder } = await import('./harness.mjs');
    for (const [name, revision] of builds) {
        const show = file => git('show', `${revision}:${file}`);
        const oldSource = show('js/sync/firebase-adapter.js');
        const oldShim = fileURLToPath(new URL(`../js/sync/_adapter-transport-${name}.mjs`, import.meta.url));
        writeFileSync(CONFIG, 'export const firebaseConfig = { apiKey: "", projectId: "" };\n'
            + 'export const SCHEDULE_DOC_PATH = "schedules/current";\n');
        writeFileSync(oldShim, oldSource
            .replace('"https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js"', '"firebase/app"')
            .replace('"https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js"', '"firebase/auth"')
            .replace('"https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js"', '"firebase/firestore"')
            .replace("from './firebase-config.js'", "from './_adapter-transport-config.mjs'"));
        let oldOps = null;
        try { oldOps = (await import(`./../js/sync/_adapter-transport-${name}.mjs`)).firestoreOps; } finally {
            try { unlinkSync(oldShim); } catch (error) { /* best effort */ }
            try { unlinkSync(CONFIG); } catch (error) { /* best effort */ }
        }
        check(`${name}: its adapter knows no transport document`, typeof oldOps === 'function'
            && !/['"]transport['"]|transportOps|FarkadTransportShare/.test(oldSource));

        await env.clearFirestore();
        await env.withSecurityRulesDisabled(async ctx => {
            const admin = ctx.firestore();
            await setDoc(doc(admin, ...PATH), SCHEDULE());
            await setDoc(tdoc(admin, DOC), day(TRIP, 1));
            await setDoc(tdoc(admin, 'settings'), settings([{ id: 'tv_01', name: 'רכב משותף', seats: 5, active: true }], 1));
        });
        const plansBefore = JSON.stringify([await readRaw(env, ...PATH, 'transport', DOC), await readRaw(env, ...PATH, 'transport', 'settings')]);
        const stampOf = (/const APP_VERSION = '([^']+)'/.exec(show('js/app.js')) || [])[1];
        const device = makeDevice({ deviceId: `d_${name}`, storage: { 'farkadTransport:enabled': '1' }, appVersion: stampOf,
            sources: loadOrder().map(file => ({ file, code: show(file) })) });
        device.Sync.pushDelayMs = 5;
        device.setToday(DAY);
        device.ctx.askTell = () => Promise.resolve();
        ['js/ui/seder.js', 'js/model/transport.js', 'js/ui/transport.js'].forEach(file =>
            vm.runInContext(show(file), device.ctx, { filename: `${name}:${file}` }));
        const db = as(SECOND);
        const ops = oldOps(db, doc(db, ...PATH), id => doc(db, ...PATH, 'receipts', String(id)));
        device.Sync.connect({
            update: patch => ops.update(plain(patch)), save: data => ops.save(plain(data)),
            create: data => ops.create(plain(data)), bootstrap: payload => ops.bootstrap(plain(payload)), read: ops.read,
            subscribe(onNext, onError) {
                return onSnapshot(doc(db, ...PATH), snap => onNext(snap.exists() ? snap.data()
                    : { workers: [], places: [], days: {}, updatedAt: null }), onError);
            }
        });
        given(`${name}: it adopts the record under the new rules`, await settleUntil(() => device.Sync.status === 'synced'
            && device.State.schedule.workers.length === 1, 15000, 25), device.Sync.status);
        device.State.commit(device.call('assignPlace', device.State.schedule, '2026-11-12', 'w_01', 'actual', 'p_01'));
        device.call('transportPlace', DAY, 'w_01', 'tv_02', 1);
        device.call('transportRenameVehicle', 'tv_03', 'שם אחר');
        const went = await settleUntil(() => device.Sync.pendingCount() === 0 && device.Sync.status === 'synced', 15000, 25);
        check(`${name} (${stampOf}): it records a day under the new rules, and is synced`, went, device.Sync.status);
        const record = await readRaw(env, ...PATH);
        same(`${name}: the day is on the server, at the record's next revision`,
            [Boolean(record.days['2026-11-12'] && record.days['2026-11-12'].actual.w_01), record.revision], [true, 2]);
        same(`${name}: its own ride plan is on its own disk`, JSON.parse(device.raw(`farkadTransport:day:${DAY}`)).trips.tv_02.driver, 'w_01');
        same(`${name}: the shared plans are byte for byte what they were`,
            JSON.stringify([await readRaw(env, ...PATH, 'transport', DOC), await readRaw(env, ...PATH, 'transport', 'settings')]), plansBefore);
        same(`${name}: and there are still exactly two of them`, await listRaw(env, ...PATH, 'transport'), [DOC, 'settings']);
        device.Sync.disconnect();
    }
});

// ================================================================== OLD

await block('OLD: this build under the rules in the field today', async () => {
    given('the rules in the field could be read out of Git', OLD_RULES !== null);
    const old = await initializeTestEnvironment({
        projectId: 'farkad-transport-oldrules',
        firestore: { rules: OLD_RULES, host: EMULATOR.host, port: EMULATOR.port }
    });
    try {
        await old.clearFirestore();
        const one = phone('d_new_build', old, OWNER);
        // The record, through the production adapter, as the browser wires it.
        const recordOps = scheduleOps(one.db);
        one.device.Sync.connect({
            update: patch => recordOps.update(plain(patch)), save: data => recordOps.save(plain(data)),
            create: data => recordOps.create(plain(data)), bootstrap: payload => recordOps.bootstrap(plain(payload)),
            read: recordOps.read,
            subscribe(onNext, onError) {
                return onSnapshot(doc(one.db, ...PATH), snap => onNext(snap.exists() ? snap.data()
                    : { workers: [], places: [], days: {}, updatedAt: null }), onError);
            }
        });
        given('the record syncs under today\'s rules', await settleUntil(() => one.device.Sync.status === 'synced'
            && one.device.Sync.pendingCount() === 0, 15000, 25), one.device.Sync.status);
        one.connect();
        one.place('w_01', 'tv_01', 1);
        given('transport was answered', await settleUntil(() => one.share.state() === 'notShared', 8000, 25), one.share.state());
        same('transport says it is not shared yet', one.share.state(), 'notShared');
        same('the plan is on the phone', one.seats(), 'tv_01=w_01+[]');
        same('a write tried directly is refused', await refused(one.adapter.write(DOC, 0, day(TRIP, 1))), 'permission-denied');
        same('nothing exists under the transport path', await listRaw(old, ...PATH, 'transport'), []);
        // The record, meanwhile.
        const revisionBefore = (await readRaw(old, ...PATH)).revision;
        one.device.State.commit(one.device.call('assignPlace', one.device.State.schedule, '2026-11-12', 'w_01', 'actual', 'p_02'));
        const went = await settleUntil(() => one.device.Sync.pendingCount() === 0 && one.device.Sync.status === 'synced', 15000, 25);
        check('an edit of the record goes up and is synced', went, one.device.Sync.status);
        same('with no error on the record\'s line', one.device.Sync.lastError || null, null);
        const record = await readRaw(old, ...PATH);
        same('at the record\'s next revision', record.revision, revisionBefore + 1);
        check('and the record has no word of transport', !/transport|tv_0/.test(JSON.stringify(record)));
        same('transport still says not shared - it did not borrow the record\'s success', one.share.state(), 'notShared');

        // THE OWNER PASTES THE NEW RULES - later, with this phone open and nobody touching
        // it. The same project, the same signed-in connection, no reload: publishing rules
        // is the one thing done.
        const attemptsBefore = one.share.state();
        await initializeTestEnvironment({
            projectId: 'farkad-transport-oldrules',
            firestore: { rules: NEW_RULES, host: EMULATOR.host, port: EMULATOR.port }
        });
        const started = await settleUntil(async () => one.share.state() === 'shared' && one.share.owed() === null
            && (await readRaw(old, ...PATH, 'transport', DOC)) !== null, 30000, 50);
        check('the phone finds out by itself and says shared - it was saying not shared a moment before', started && attemptsBefore === 'notShared',
            `${attemptsBefore} -> ${one.share.state()}`);
        same('and the plan it made under the old rules is on the server', seatsOf(await readRaw(old, ...PATH, 'transport', DOC)), 'tv_01=w_01+[]');
        same('at revision 1, as a document of its own', [(await readRaw(old, ...PATH, 'transport', DOC)).revision, await listRaw(old, ...PATH, 'transport')], [1, [DOC]]);
        same('an untouched list of seven was not uploaded with it', await readRaw(old, ...PATH, 'transport', 'settings'), null);
        const recordThen = await readRaw(old, ...PATH);
        check('the record did not move for it', recordThen.revision === record.revision && !/transport|tv_0/.test(JSON.stringify(recordThen)));
        same('and still says synced', one.device.Sync.status, 'synced');
        one.share.disconnect();
        one.device.Sync.disconnect();
    } finally {
        await old.cleanup();
    }
});

await env.cleanup();
report();
