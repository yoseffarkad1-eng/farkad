// Turning the pay book on for one record, against a REAL Firestore: the rules of this
// branch, the rules as published today, the PRODUCTION adapter, and three builds that
// have not updated - v180, v183, v184 and v186, their real bytes out of Git. (Phase 8)
//
// v187: the rules live today carry the shared rides' block (v185), and v186 - the build
// every phone is on, or should be - shares rides. So the table is asked of v186 too,
// against the live file WITH that block, and section R asks what nothing else here did:
// what the rides' documents may do beside a record that is on.
//
//   firebase emulators:exec --project demo-farkad --only firestore "node tests/activation.emulator.test.mjs"
//
// tests/activation.test.mjs asks its questions of a fake cloud this repository wrote. This
// file asks the ones that decide whether the owner may press the button:
//
//   P   WHICH RULES ARE THESE - the probe. A read the rules of this branch allow and the
//       rules published today refuse; never a write, never for a stranger.
//   T   THE BUILD AS IT SHIPS, under the rules PUBLISHED TODAY: the step is refused by
//       asking, and refused whole by the server if it is sent anyway. Nothing is lost.
//   N   THE BUILD AS IT SHIPS, under the NEW rules, on a document as the real one is today
//       (no pay book, protocol 1): the carry approval, the opening, one transaction - and
//       the second phone is on. Two phones at the same moment: one opening.
//   O   A BUILD FROM BEFORE THE PAY BOOK, real bytes and its own adapter: under the new
//       rules BEFORE the record is on it records and restores as ever (so the rules may
//       be published first); AFTER, its day and its restore are REFUSED, the server's
//       document does not move, and the phone does not say synced.
//   W   THE WAY BACK: this build with the step not offered, on the activated record.
//
// Never the real project: demo project ids, loopback only. Synthetic data only.

import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { makeDevice, settle, settleUntil, loadOrder, sourceRoot } from './harness.mjs';
import { suite, check, same, given, report } from './runner.mjs';
import { emulatorHost } from './emulator-host.mjs';
import { CREW, SITES, W1, W2, FORTNIGHT, clone, stamp, canonical } from './paybook.world.mjs';

const EMULATOR = emulatorHost();
const ROOT = sourceRoot();
const git = args => execFileSync('git', ['-C', ROOT].concat(args), { maxBuffer: 64 * 1024 * 1024 });
const NEW_RULES = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
const OLD_RULES = readFileSync(new URL('../docs/firestore.rules.before-paybook', import.meta.url), 'utf8');
const ADAPTER = fileURLToPath(new URL('../js/sync/firebase-adapter.js', import.meta.url));
const CONFIG = fileURLToPath(new URL('../js/sync/_activation-test-config.mjs', import.meta.url));
const shimFile = name => fileURLToPath(new URL(`../js/sync/_adapter-activation-${name}-test.mjs`, import.meta.url));
const TODAY = '2026-10-16';
const OPENING = '2026-10-02';
const SCHEDULE = 'scheduleData:v2';
const PATH = ['schedules', 'current'];

const rewrite = text => text
    .replace('"https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js"', '"firebase/app"')
    .replace('"https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js"', '"firebase/auth"')
    .replace('"https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js"', '"firebase/firestore"')
    .replace("from './firebase-config.js'", "from './_activation-test-config.mjs'");
const fourLines = (before, after) => {
    const one = before.split('\n');
    const two = after.split('\n');
    const moved = one.map((line, at) => (line === two[at] ? null : at)).filter(at => at !== null);
    return one.length === two.length && moved.length === 4 && moved.every(at =>
        one[at].indexOf('gstatic.com') !== -1 || one[at].indexOf("from './firebase-config.js'") !== -1);
};

const source = readFileSync(ADAPTER, 'utf8');
// THE RULES LIVE TODAY are main's firestore.rules at v186 (9846d7f): the rules of v184 plus
// the shared rides' block, which the owner reported pasting on 2026-11-10 (reported - not
// read off the console from here). docs/firestore.rules.before-paybook is that file.
const RULES_LIVE = '9846d7f';
// The builds a phone may still be on when the owner presses the button: all four were
// served on 2026-11-10, and v186 is the build v187 is made on top of.
const OLDER = [['v180', 'd3103d6'], ['v183', '1af6729'], ['v184', '990f5b4'], ['v186', RULES_LIVE]];
const NOT_ON_MAIN = ['js/model/payroll.js', 'js/sync/transact.js', 'js/sync/closed.js',
    'js/model/months.js', 'js/sync/months.js', 'js/cold.js'];

function sourcesOf(name, sha) {
    const order = loadOrder().filter(file => NOT_ON_MAIN.indexOf(file) === -1);
    const files = order.filter(file => {
        try { git(['cat-file', '-e', `${sha}:${file}`]); return true; } catch (error) { return false; }
    });
    given(`${name} has every file this build loads that it could have had`, files.length === order.length,
        `${files.length} of ${order.length}`);
    const said = (/const APP_VERSION = '([^']+)'/.exec(git(['show', `${sha}:js/app.js`]).toString('utf8')) || [])[1];
    given(`the older build names itself ${name}`, said === name, String(said));
    return files.map(file => ({ file, code: git(['show', `${sha}:${file}`]).toString('utf8') }));
}

{
    suite('what is under test: the shipped adapter, the rules of this branch, and the rules as published today');
    check('the adapter differs from the shipped file in exactly four import specifiers', fourLines(source, rewrite(source)));
    check('the new rules stop a protocol-1 writer once a pay book exists, and say which rules they are',
        /function activatedNeedsPaybook\(\)/.test(NEW_RULES) && /&& activatedNeedsPaybook\(\)/.test(NEW_RULES)
        && /match \/probe\/\{generation\}/.test(NEW_RULES) && /generation == 'paybook-8'/.test(NEW_RULES));
    // v187 MOVED: asked of 990f5b4 (v184) until the shared rides' block went live.
    same('docs/firestore.rules.before-paybook is, byte for byte, the rules main carries at v186 - what is live today',
        OLD_RULES === git(['show', `${RULES_LIVE}:firestore.rules`]).toString('utf8'), true);
    check('and those rules have no probe and no closed documents', !/probe|closed\//.test(OLD_RULES.replace(/\/\/.*$/gm, '')));
    check('they DO have the shared rides\' block, and so do the new ones', /match \/transport\/\{name\} \{/.test(OLD_RULES)
        && /match \/transport\/\{name\} \{/.test(NEW_RULES));
    given('the emulator is a local one', /^(127\.0\.0\.1|localhost)$/.test(EMULATOR.host), EMULATOR.host);
}

writeFileSync(CONFIG, 'export const firebaseConfig = { apiKey: "", projectId: "" };\n'
    + 'export const SCHEDULE_DOC_PATH = "schedules/current";\n');
const opsOf = {};
try {
    writeFileSync(shimFile('new'), rewrite(source));
    opsOf.new = (await import('./../js/sync/_adapter-activation-new-test.mjs'));
    for (const [name, sha] of OLDER) {
        const old = git(['show', `${sha}:js/sync/firebase-adapter.js`]).toString('utf8');
        given(`${name}'s own adapter is rewritten in its import specifiers only`, fourLines(old, rewrite(old)));
        writeFileSync(shimFile(name), rewrite(old));
        opsOf[name] = await import(`./../js/sync/_adapter-activation-${name}-test.mjs`);
    }
} finally {
    ['new'].concat(OLDER.map(one => one[0])).forEach(name => {
        try { unlinkSync(shimFile(name)); } catch (error) { /* best effort */ }
    });
    try { unlinkSync(CONFIG); } catch (error) { /* best effort */ }
}

const { doc, getDoc, getDocs, collection, setDoc, runTransaction, onSnapshot, FieldPath } = await import('firebase/firestore');

const envNew = await initializeTestEnvironment({ projectId: 'demo-farkad-activation-new',
    firestore: { rules: NEW_RULES, host: EMULATOR.host, port: EMULATOR.port } });
const envOld = await initializeTestEnvironment({ projectId: 'demo-farkad-activation-old',
    firestore: { rules: OLD_RULES, host: EMULATOR.host, port: EMULATOR.port } });

const ALLOWED = 'yosef.farkad1@gmail.com';
const SECOND = 'farkad1963@gmail.com';
const as = (env, email) => env.authenticatedContext(email.replace(/[^a-z0-9]/gi, ''), { email }).firestore();

// THE RECORD AS IT IS TODAY: written by a build as it ships, no pay book, the carry
// approved long ago, Khaled's 500 from a fortnight nobody closed.
function shipped(id, options = {}) {
    const device = makeDevice(Object.assign({ deviceId: id }, options, { flags: options.flags === undefined ? null : options.flags }));
    device.setToday(TODAY);
    device.ctx.askTell = () => Promise.resolve();
    device.ctx.askConfirm = () => Promise.resolve(false);
    device.Sync.pushDelayMs = 5;
    return device;
}
const BASE = (() => {
    const d = shipped('d_seed');
    d.State.schedule.workers = CREW();
    d.State.schedule.places = SITES();
    given('the roster is committed', d.State.commitRoster() === true);
    const put = (worker, day, place, hours) => given(`a day is recorded (${worker} ${day})`,
        d.State.commit(d.call('assignPlace', d.State.schedule, day, worker, 'actual', place, undefined, hours || 0)) === true);
    ['2026-09-06', '2026-09-07'].forEach(day => put('w_khaled', day, 'p_a'));
    W1.forEach(day => ['w_ahmad', 'w_khaled', 'w_nasser', 'w_salim'].forEach(w => put(w, day, 'p_a')));
    W2.forEach((day, n) => { put('w_ahmad', day, 'p_a', n === 0 ? 4 : 0); put('w_khaled', day, 'p_a'); });
    given('the advance is recorded', d.State.commitMany(d.call('recordNewAdvance', d.State.schedule, 'w_khaled',
        '2026-09-06', 500, 'בדיקה', '2026-09-06T09:00:00.000Z', d.id, 'cash')) === true);
    given('the carry is approved', d.State.commitMany([d.call('recordCarryApproval', d.State.schedule,
        d.call('planCarryMigration', d.State.schedule), '2026-09-01T08:00:00.000Z', d.id)]) === true);
    const schedule = clone(d.State.schedule);
    return { schedule, wire: Object.assign(clone(d.call('cloudDocument', schedule)), { protocol: 1, revision: 1, lastOpId: 'op_seed' }) };
})();

async function reseed(env) {
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async ctx => { await setDoc(doc(ctx.firestore(), ...PATH), clone(BASE.wire)); });
}
const server = async (env, ...more) => {
    let held = null;
    await env.withSecurityRulesDisabled(async ctx => {
        const snap = await getDoc(doc(ctx.firestore(), ...PATH, ...more));
        held = snap.exists() ? snap.data() : null;
    });
    return held;
};
const names = async (env, sub) => {
    let ids = [];
    await env.withSecurityRulesDisabled(async ctx => {
        ids = (await getDocs(collection(ctx.firestore(), ...PATH, sub))).docs.map(one => one.id).sort();
    });
    return ids;
};

function adapterFor(db, module) {
    const ops = module.firestoreOps(db, doc(db, ...PATH), id => doc(db, ...PATH, 'receipts', String(id)),
        id => doc(db, ...PATH, 'closed', String(id)), id => doc(db, ...PATH, 'months', String(id)),
        generation => doc(db, ...PATH, 'probe', String(generation)));
    const plain = value => JSON.parse(JSON.stringify(value));
    const adapter = {
        update: patch => ops.update(plain(patch)),
        save: data => ops.save(plain(data)),
        create: data => ops.create(plain(data)),
        bootstrap: payload => ops.bootstrap(plain(payload)),
        read: async () => {
            const snap = await getDoc(doc(db, ...PATH));
            return snap.exists() ? snap.data() : null;
        },
        subscribe(onNext, onError) {
            const stop = onSnapshot(doc(db, ...PATH),
                snap => onNext(snap.exists() ? snap.data() : null), error => onError(error));
            return () => stop();
        }
    };
    if (typeof ops.transact === 'function') {
        adapter.transact = (patch, closed) => ops.transact(plain(patch), plain(closed));
        adapter.readClosed = id => ops.readClosed(id);
        adapter.readReceipt = id => ops.readReceipt(id);
    }
    if (typeof ops.probeRules === 'function') adapter.probeRules = generation => ops.probeRules(generation);
    return adapter;
}
function phone(id, env, options = {}) {
    const device = shipped(id, Object.assign({ storage: { [SCHEDULE]: JSON.stringify(BASE.schedule) } }, options));
    device.State.load();
    device.Sync.connect(adapterFor(as(env, options.email || ALLOWED), opsOf.new));
    return device;
}
function oldPhone(name, sources, id, env) {
    const device = makeDevice({ sources, appVersion: name, deviceId: id, storage: { [SCHEDULE]: JSON.stringify(BASE.schedule) } });
    device.setToday(TODAY);
    device.ctx.askTell = () => Promise.resolve();
    device.ctx.askConfirm = () => Promise.resolve(true);
    device.Sync.pushDelayMs = 5;
    device.State.load();
    device.Sync.connect(adapterFor(as(env, SECOND), opsOf[name]));
    return device;
}
const quiet = device => device.Sync.status === 'synced' && device.Sync.pendingCount() === 0;
async function reached(ready, limit = 20000, step = 10) {
    const arrived = await settleUntil(ready, limit, step);
    if (!arrived) throw new Error('a barrier timed out waiting for: ' + String(ready).replace(/\s+/g, ' ').slice(0, 200));
}
const S = device => device.State.schedule;
const at = (device, hour = '10') => stamp(TODAY, device.id, hour);
const on = device => device.call('paybookOn', S(device));
const day = (device, worker, date) => given(`a day is recorded (${worker} ${date})`,
    device.State.commit(device.call('assignPlace', S(device), date, worker, 'actual', 'p_a', undefined, 0)) === true);
const dayOn = (raw, date, worker) => Boolean(raw && raw.days && raw.days[date] && raw.days[date].actual && raw.days[date].actual[worker]);

// The step, as js/ui/accounts.js runs it.
async function activate(device, date = OPENING, hour = '10') {
    const refused = await device.Sync.activationRefusal();
    if (refused) return { ok: false, state: 'refused', reasons: [refused] };
    const drawn = device.call('planActivation', S(device), date, at(device, hour));
    if (drawn.state !== 'offered') return { ok: false, state: drawn.state, reasons: drawn.reasons };
    const plan = device.call('planOpening', S(device), date, at(device, hour));
    if (!plan.ok) return { ok: false, state: 'plan', reasons: plan.reasons };
    return device.Sync.transactPaybook(plan);
}
async function passes(name, promise) {
    try { await assertSucceeds(promise); check(name, true); }
    catch (error) { check(name, false, String(error.message || error).slice(0, 160)); }
}
async function denied(name, promise) {
    try { await assertFails(promise); check(name, true); }
    catch (error) { check(name, false, String(error.message || error).slice(0, 160)); }
}
let seq = 0;
function pathWrite(db, fields, protocol) {
    seq += 1;
    const opId = `op_hand_${seq}`;
    return runTransaction(db, async tx => {
        const snap = await tx.get(doc(db, ...PATH));
        const all = Object.assign({}, fields, { updatedAt: '2026-10-16T10:00:00.000Z', updatedBy: 'd_hand',
            protocol, revision: snap.data().revision + 1, lastOpId: opId, opFingerprint: 'f_' + opId });
        const args = [];
        Object.keys(all).forEach(path => args.push(new FieldPath(...path.split('.')), all[path]));
        tx.update(doc(db, ...PATH), ...args);
        tx.set(doc(db, ...PATH, 'receipts', opId), { revision: all.revision, opFingerprint: all.opFingerprint, at: 'now', by: 'd_hand' });
    });
}

// The shared rides' documents, by the adapter's own transportOps (section R; and one
// question in T).
const rideOps = (module, db) => module.transportOps(db, () => collection(db, ...PATH, 'transport'), name => doc(db, ...PATH, 'transport', name));
const rideStamp = (data, revision, by) => Object.assign({ v: 1, revision, updatedAt: '2026-10-16T05:00:00.000Z', updatedBy: by }, data);
const rideDay = (trips, revision, by) => rideStamp({ date: TODAY, unavailable: {}, status: {}, trips }, revision, by);
const rideList = (revision, by) => rideStamp({ vehicles: [{ id: 'tv_01', name: 'רכב', seats: 5, active: true }] }, revision, by);
const tried = async promise => { try { await promise; return 'accepted'; } catch (error) { return error.code || String(error); } };

// ================================================================ P
{
    suite('P: which rules are these - a read the new rules allow and the published ones refuse');

    await reseed(envNew);
    await reseed(envOld);
    const mine = as(envNew, ALLOWED);
    await passes('NEW RULES: a person on the list may get probe/paybook-8 (it holds nothing)', getDoc(doc(mine, ...PATH, 'probe', 'paybook-8')));
    await denied('- but no other name under probe/', getDoc(doc(mine, ...PATH, 'probe', 'paybook-7')));
    await denied('- may not list it', getDocs(collection(mine, ...PATH, 'probe')));
    await denied('- may not write it', setDoc(doc(mine, ...PATH, 'probe', 'paybook-8'), { x: 1 }));
    await denied('- and a signed-in stranger may not read it', getDoc(doc(as(envNew, 'stranger@example.com'), ...PATH, 'probe', 'paybook-8')));
    await denied('THE RULES PUBLISHED TODAY refuse the same read', getDoc(doc(as(envOld, ALLOWED), ...PATH, 'probe', 'paybook-8')));
    const ask = env => adapterFor(as(env, ALLOWED), opsOf.new).probeRules('paybook-8');
    same('THE PRODUCTION ADAPTER\'S ANSWER: true under the new rules, false under the published ones', [await ask(envNew), await ask(envOld)], [true, false]);
    same('nothing was created by asking', [await names(envNew, 'probe'), await names(envOld, 'probe')], [[], []]);
}

// ================================================================ T
const BEFORE_RULES = {};
{
    suite('T: the build as it ships under the rules PUBLISHED TODAY - refused by asking, and refused whole if sent');

    await reseed(envOld);
    const t = phone('d_t', envOld);
    await reached(() => quiet(t));
    const before = canonical(await server(envOld));
    same('it works as ever under those rules: a day is recorded', (day(t, 'w_nasser', '2026-10-18'), await reached(() => quiet(t)),
        dayOn(await server(envOld), '2026-10-18', 'w_nasser')), true);
    const stood = canonical(await server(envOld));
    const asked = (await activate(t)).reasons;
    same('THE STEP IS REFUSED BY ASKING: `rules`', asked, ['rules']);
    const sent = await t.Sync.transactPaybook(t.call('planOpening', S(t), OPENING, at(t)));
    await settle(1500);
    BEFORE_RULES.asked = asked.join();
    BEFORE_RULES.sent = `${sent.state}:${sent.reasons.join()}`;
    BEFORE_RULES.closed = (await names(envOld, 'closed')).length;
    same('SENT ANYWAY, the opening is refused whole by those rules: `server`, nothing in doubt, nothing queued',
        [sent.state, sent.reasons, t.Sync.payIntent(), t.Sync.pendingCount()], ['refused', ['server'], null, 0]);
    same('the server\'s document is exactly what it was, there is no closed document, and the record is not on',
        [canonical(await server(envOld)) === stood, await names(envOld, 'closed'), on(t), stood !== before], [true, [], false, true]);
    day(t, 'w_salim', '2026-10-19');
    await reached(() => quiet(t));
    same('and the phone goes on recording', dayOn(await server(envOld), '2026-10-19', 'w_salim'), true);
    // The rules live today carry the shared rides' block: this build under them shares
    // rides as v186 does, whatever the pay book was told.
    same('and its ride plan is accepted under those rules, as v186\'s is',
        await tried(rideOps(opsOf.new, as(envOld, ALLOWED)).write(`day_${TODAY}`, 0, rideDay({ tv_01: { driver: 'w_ahmad', passengers: [], seats: {} } }, 1, 'd_t'))),
        'accepted');
}

// ================================================================ N
{
    suite('N: the build as it ships under the NEW rules, on the document as it is today - turned on');

    await reseed(envNew);
    const a = phone('d_owner', envNew);
    const b = phone('d_fore', envNew, { email: SECOND });
    await reached(() => quiet(a) && quiet(b));
    same('before: protocol 1, no pay book, nobody on', [(await server(envNew)).protocol, Object.keys((await server(envNew)).pay || {}), on(a), on(b)], [1, [], false, false]);
    const answer = await activate(a);
    await reached(() => quiet(a) && quiet(b) && on(b));
    const live = await server(envNew);
    same('THE ANSWER IS `closed`, and the server holds the opening, at protocol 2, with its closed document',
        [answer.state, Object.keys(live.pay), live.pay.po_open.date, live.protocol, await names(envNew, 'closed')],
        ['closed', ['po_open'], OPENING, 2, ['po_open']]);
    same('BOTH PHONES ARE ON, with one arithmetic: Khaled owes 500 going into the open fortnight',
        [a, b].map(d => [on(d), d.call('advanceCarryInto', S(d), 'w_khaled', FORTNIGHT.from)]), [[true, 500], [true, 500]]);
    const closing = b.call('planClosure', S(b), 'w_nasser', FORTNIGHT, { allocations: {}, paid: 3000, paidOn: TODAY, method: 'cash' }, at(b, '11'));
    given('the other phone can plan a closure', closing.ok === true, JSON.stringify(closing.reasons));
    same('and the other phone closes an account through the pay book', (await b.Sync.transactPaybook(closing)).state, 'closed');
    await reached(() => quiet(a) && quiet(b));
    same('which both phones and the server then hold', [Object.keys((await server(envNew)).pay).sort(), Object.keys(S(a).pay).sort()],
        [['po_open', 'pp_ps_w_nasser_20261002', 'ps_w_nasser_20261002'], ['po_open', 'pp_ps_w_nasser_20261002', 'ps_w_nasser_20261002']]);

    // Two phones, the same moment.
    await reseed(envNew);
    const c = phone('d_c', envNew);
    const d = phone('d_d', envNew, { email: SECOND });
    await reached(() => quiet(c) && quiet(d));
    const [one, two] = await Promise.all([activate(c, OPENING, '10'), activate(d, '2026-09-18', '11')]);
    await reached(() => quiet(c) && quiet(d) && on(c) && on(d));
    same('TWO PHONES AT THE SAME MOMENT, different days: one is `closed`, the other is told',
        [[one.state, two.state].sort(), (one.state === 'stale' ? one : two).reasons.indexOf('opened') !== -1], [['closed', 'stale'], true]);
    same('ONE opening on the server, one closed document, and both phones hold that opening',
        [Object.keys((await server(envNew)).pay), await names(envNew, 'closed'), canonical(S(c).pay) === canonical(S(d).pay),
            [c, d].map(x => [x.Sync.payIntent(), x.Sync.pendingCount()])], [['po_open'], ['po_open'], true, [[null, 0], [null, 0]]]);
}

// ================================================================ O
const found = {};
for (const [name, sha] of OLDER) {
    const sources = sourcesOf(name, sha);
    const cell = found[name] = {};

    suite(`O / ${name}, its real bytes and its own adapter, under the NEW rules - BEFORE the record is on`);
    {
        await reseed(envNew);
        const old = oldPhone(name, sources, `d_o_${name}`, envNew);
        await reached(() => quiet(old));
        day(old, 'w_nasser', '2026-10-18');
        await reached(() => old.Sync.pendingCount() === 0);
        cell.dayBefore = dayOn(await server(envNew), '2026-10-18', 'w_nasser');
        const result = await old.Sync.replaceEverything(old.call('normaliseSchedule', clone(S(old))));
        await reached(() => quiet(old));
        cell.restoreBefore = result.ok === true && (await server(envNew)).updatedBy === old.id;
        same('IT RECORDS A DAY AND RESTORES AS EVER: publishing these rules first stops no phone', [cell.dayBefore, cell.restoreBefore, old.Sync.status], [true, true, 'synced']);
    }

    suite(`O / ${name} under the rules LIVE TODAY, on the record as it is today - the cell every phone is in now`);
    {
        await envOld.clearFirestore();
        await envOld.withSecurityRulesDisabled(async ctx => { await setDoc(doc(ctx.firestore(), ...PATH), clone(BASE.wire)); });
        const old = oldPhone(name, sources, `d_o0_${name}`, envOld);
        await reached(() => quiet(old));
        day(old, 'w_nasser', '2026-10-18');
        await reached(() => old.Sync.pendingCount() === 0);
        cell.liveDay = dayOn(await server(envOld), '2026-10-18', 'w_nasser') && old.Sync.status === 'synced';
        same('it records a day and says synced', cell.liveDay, true);
        old.Sync.disconnect();
    }

    suite(`O / ${name} - AFTER the record is on`);
    {
        await reseed(envNew);
        const n = phone(`d_n_${name}`, envNew);
        const old = oldPhone(name, sources, `d_o2_${name}`, envNew);
        await reached(() => quiet(n) && quiet(old));
        given('this build turns the record on', (await activate(n)).state === 'closed');
        await reached(() => quiet(n));
        await settle(800);
        const stood = await server(envNew);
        cell.oldAdopts = old.Sync.status;
        cell.oldKeepsOpening = Boolean(S(old).pay && S(old).pay.po_open);
        // What the old phone SHOWS cannot be changed from here: it is on the old walk.
        cell.oldWalk = old.call('advanceCarryInto', S(old), 'w_khaled', FORTNIGHT.from);
        same('MEASURED, what cannot be changed from here: the old build adopts the document, drops the pay book from its own copy, and still reads the old arithmetic (Khaled carries 0)',
            [cell.oldKeepsOpening, cell.oldWalk], [false, 0]);

        day(old, 'w_nasser', '2026-10-18');
        await settle(3500);
        const afterDay = await server(envNew);
        cell.dayRefused = !dayOn(afterDay, '2026-10-18', 'w_nasser') && afterDay.revision === stood.revision;
        cell.statusAfterDay = old.Sync.status;
        check('ITS DAY IS REFUSED: not on the server, and the revision has not moved', cell.dayRefused, JSON.stringify([afterDay.revision, stood.revision]));
        check('IT DOES NOT SAY SYNCED - the phone shows its sync error and holds the day', old.Sync.status !== 'synced' && old.Sync.pendingCount() > 0,
            `${old.Sync.status} / ${old.Sync.pendingCount()}`);
        same('the day is on that phone\'s own disk: nothing was lost', Boolean(S(old).days['2026-10-18'].actual.w_nasser), true);

        // The closure it could still make the old way, with no signal, and send later.
        const oldClose = old.call('closePeriodChanges', S(old), 'w_salim', FORTNIGHT.from, FORTNIGHT.to, '2026-10-16T12:00:00.000Z', old.id, 0);
        if (oldClose.length > 0) old.State.commitMany(oldClose);
        await settle(2500);
        const afterClose = await server(envNew);
        cell.closeRefused = !Object.keys(afterClose.ledger.advances).some(id => /^le_period_w_salim/.test(id)) && afterClose.revision === stood.revision;
        check('A CLOSURE MADE THE OLD WAY ON IT never reaches the server', cell.closeRefused, JSON.stringify(Object.keys(afterClose.ledger.advances)));

        const restoring = old.Sync.replaceEverything(old.call('normaliseSchedule', clone(S(old))));
        await Promise.race([restoring.catch(() => null), settle(6000)]);
        await settle(1500);
        const kept = await server(envNew);
        cell.restoreRefused = canonical(kept.pay) === canonical(stood.pay) && kept.revision === stood.revision;
        check('ITS RESTORE IS REFUSED: the opening and the revision are exactly where they were', cell.restoreRefused, JSON.stringify([Object.keys(kept.pay || {}), kept.revision]));
        same('the closed document is untouched, and this build beside it goes on recording',
            [await names(envNew, 'closed'), (day(n, 'w_salim', '2026-10-19'), await reached(() => quiet(n)), dayOn(await server(envNew), '2026-10-19', 'w_salim'))],
            [['po_open'], true]);
        cell.statusAtEnd = old.Sync.status;
    }

    suite(`O / ${name} under the rules AS PUBLISHED TODAY, on a record that is on - the hazard the rules exist for`);
    {
        await reseed(envNew);
        const n = phone(`d_n3_${name}`, envNew);
        await reached(() => quiet(n));
        given('turned on', (await activate(n)).state === 'closed');
        const activated = await server(envNew);
        await envOld.clearFirestore();
        await envOld.withSecurityRulesDisabled(async ctx => { await setDoc(doc(ctx.firestore(), ...PATH), activated); });
        const old = oldPhone(name, sources, `d_o3_${name}`, envOld);
        await reached(() => quiet(old));
        const result = await old.Sync.replaceEverything(old.call('normaliseSchedule', clone(S(old))));
        await reached(() => quiet(old));
        cell.oldRulesErase = result.ok === true && (await server(envOld)).pay === undefined;
        check('MEASURED: under the published rules its restore is accepted and the opening is GONE - so the new rules are never rolled back once a closure exists',
            cell.oldRulesErase, JSON.stringify(Object.keys((await server(envOld)).pay || {})));
    }
}

// ================================================================ R: the shared rides beside a record that is on
//
// `activatedNeedsPaybook` is a condition of the SCHEDULE document's update. The rides'
// documents are schedules/<doc>/transport/<name>, matched by a block of their own that
// asks who is writing, the shape and the next revision - and never the protocol, which a
// transport write does not carry. So a phone on v186 that has not updated is refused its
// DAYS on a record that is on, and is NOT refused its ride plans. Measured here with
// v186's own transportOps, out of Git, on the real rules - not argued from the text.
{
    suite('R: the shared rides\' documents on a record that is on - v186\'s own adapter, the real rules');

    given('v186\'s adapter, out of Git, has the rides\' operations', typeof opsOf.v186.transportOps === 'function');

    await reseed(envNew);
    const n = phone('d_r_new', envNew);
    const old = oldPhone('v186', sourcesOf('v186', RULES_LIVE), 'd_r_v186', envNew);
    await reached(() => quiet(n) && quiet(old));
    const oldRides = rideOps(opsOf.v186, as(envNew, SECOND));
    const newRides = rideOps(opsOf.new, as(envNew, ALLOWED));
    same('BEFORE the record is on, under the new rules: a v186 phone writes the list of vehicles and a day\'s plan',
        [await tried(oldRides.write('settings', 0, rideList(1, 'd_r_v186'))),
            await tried(oldRides.write(`day_${TODAY}`, 0, rideDay({ tv_01: { driver: 'w_ahmad', passengers: [], seats: {} } }, 1, 'd_r_v186')))],
        ['accepted', 'accepted']);

    given('this build turns the record on', (await activate(n)).state === 'closed');
    await reached(() => quiet(n));
    await settle(800);
    const stood = await server(envNew);
    day(old, 'w_nasser', '2026-10-18');
    await settle(3500);
    const afterDay = await server(envNew);
    check('AFTER: the v186 phone\'s DAY is refused - not on the server, the record\'s revision where it was, the phone not saying synced',
        !dayOn(afterDay, '2026-10-18', 'w_nasser') && afterDay.revision === stood.revision && old.Sync.status !== 'synced' && old.Sync.pendingCount() > 0,
        `${old.Sync.status} / ${old.Sync.pendingCount()}`);
    same('AFTER, MEASURED: the same phone SEATS A MAN and the plan is ACCEPTED - the rides\' documents are not caught by the rule that stops its days',
        await tried(oldRides.write(`day_${TODAY}`, 1, rideDay({ tv_01: { driver: 'w_ahmad', passengers: ['w_khaled'], seats: { w_khaled: 2 } } }, 2, 'd_r_v186'))),
        'accepted');
    same('and its change to the list of vehicles too', await tried(oldRides.write('settings', 1, rideList(2, 'd_r_v186'))), 'accepted');
    same('this build reads that plan and writes the next one over it', [((await server(envNew, 'transport', `day_${TODAY}`)) || {}).revision,
        await tried(newRides.write(`day_${TODAY}`, 2, rideDay({ tv_01: { driver: 'w_khaled', passengers: [], seats: {} } }, 3, 'd_r_new')))], [2, 'accepted']);
    same('the compare-and-set of the rides is what it was: a write built on a revision that has moved is told `conflict`',
        await tried(oldRides.write(`day_${TODAY}`, 2, rideDay({}, 3, 'd_r_v186'))), 'conflict');
    same('a stranger is refused the rides as before', await tried(rideOps(opsOf.new, as(envNew, 'somebody.else@gmail.com'))
        .write(`day_${TODAY}`, 3, rideDay({}, 4, 'd_x'))), 'permission-denied');
    const after = await server(envNew);
    same('not one of those writes moved the record: its revision, its pay book and its closed document are where they were',
        [after.revision, canonical(after.pay) === canonical(stood.pay), await names(envNew, 'closed'), /transport|tv_0/.test(JSON.stringify(after))],
        [stood.revision, true, ['po_open'], false]);
    same('and the rides\' documents are the two that were written', await names(envNew, 'transport'), [`day_${TODAY}`, 'settings']);
    found.v186.ridesAfter = true;
    old.Sync.disconnect();
    n.Sync.disconnect();
}

// ================================================================ W, and the hand-written writes
{
    suite('W: the way back - this build with the step not offered, on the activated record; and protocol 1 by hand');

    await reseed(envNew);
    const n = phone('d_w_on', envNew);
    await reached(() => quiet(n));
    const before = n.call('advanceCarryInto', S(n), 'w_khaled', FORTNIGHT.from);
    await passes('BEFORE: a protocol-1 day written by hand is accepted', pathWrite(as(envNew, SECOND), { 'days.2026-10-17.actual.w_salim': { entries: [{ placeId: 'p_a' }] } }, 1));
    await reached(() => quiet(n));
    given('turned on', (await activate(n)).state === 'closed');
    await reached(() => quiet(n));
    await denied('AFTER: a protocol-1 day written by hand is refused', pathWrite(as(envNew, SECOND), { 'days.2026-10-20.actual.w_salim': { entries: [{ placeId: 'p_a' }] } }, 1));
    await passes('and a protocol-2 day is accepted', pathWrite(as(envNew, SECOND), { 'days.2026-10-20.actual.w_salim': { entries: [{ placeId: 'p_a' }] } }, 2));
    await reached(() => quiet(n));

    const back = phone('d_w_back', envNew, { flags: { paybookActivation: false } });
    await reached(() => quiet(back));
    same('THE WAY-BACK BUILD on the activated record: not on, the old walk, and it KEEPS the opening in its own copy',
        [on(back), back.call('advanceCarryInto', S(back), 'w_khaled', FORTNIGHT.from) === before, Object.keys(S(back).pay || {})], [false, true, ['po_open']]);
    day(back, 'w_nasser', '2026-10-21');
    await reached(() => quiet(back) && quiet(n));
    same('it records a day under these rules (it speaks protocol 2), and the server\'s pay book is untouched',
        [dayOn(await server(envNew), '2026-10-21', 'w_nasser'), Object.keys((await server(envNew)).pay), await names(envNew, 'closed')], [true, ['po_open'], ['po_open']]);
    same('while the build as it ships, beside it, is still on', on(n), true);
}

// ================================================================ the order
{
    suite('THE ORDER - derived from the cells above, not argued');

    const olds = OLDER.map(([name]) => found[name]);
    same('every older build answers every question the same way',
        olds.map(cell => [cell.liveDay, cell.dayBefore, cell.restoreBefore, cell.dayRefused, cell.closeRefused, cell.restoreRefused, cell.oldRulesErase]),
        OLDER.map(() => [true, true, true, true, true, true, true]));
    check('1. the new rules can be published while every phone is still on an older build: nobody working is refused',
        olds.every(cell => cell.dayBefore && cell.restoreBefore));
    same('2. the record cannot be turned on before the rules are published: the step asks and is told `rules`, and sent anyway it is refused whole',
        BEFORE_RULES, { asked: 'rules', sent: 'refused:server', closed: 0 });
    check('3. from the moment it is on, a phone that has not updated can write NOTHING - not a day, not an old-style closure, not a restore',
        olds.every(cell => cell.dayRefused && cell.closeRefused && cell.restoreRefused));
    check('4. and the published rules must never come back once it is on: under them an older build\'s restore erases the opening',
        olds.every(cell => cell.oldRulesErase));
    console.log('\n  measured, per older build: ' + JSON.stringify(found));
}

await envNew.cleanup();
await envOld.cleanup();
report();
