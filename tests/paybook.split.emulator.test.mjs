// The pay book's server-first door and the closed documents, against a REAL Firestore:
// the NEW rules, the PRODUCTION adapter, and three builds that have not updated. (v175)
//
//   firebase emulators:exec --project demo-farkad --only firestore "node tests/paybook.split.emulator.test.mjs"
//
// tests/paybook.transact.test.mjs asks its questions of a fake cloud this repository wrote.
// This file asks the ones that decide a rollout of the two things it did not write:
// firestore.rules as it stands on this branch, and js/sync/firebase-adapter.js, talking to
// the local emulator. Never the real project: demo project ids, loopback only.
//
//   R   THE RULES. A closed document is created once, with the schedule write it belongs
//       to and never alone; never updated, never deleted - by anyone. The pay map only
//       grows, only at protocol 2, only with its closed copy in the same commit. And each
//       half of that pair failing takes the other half with it.
//
//   A   THE PRODUCTION ADAPTER, through js/sync/transact.js. One closure is one commit of
//       three documents. Two phones closing the same man and period at the same moment:
//       exactly one closed document, one statement, no double deduction, the loser told.
//
//   O   THE ROLLOUT, MEASURED - the way tests/rollout-matrix.test.mjs does it. Three real
//       older builds out of Git (v167, v171, v172: their own files and their own adapter),
//       this build, the rules as they are published today (docs/firestore.rules.before-paybook)
//       and the new ones, a document with a pay book and one without. Can the old phone
//       still record a day? Is its restore refused instead of erasing? Can this build
//       close an account before the rules are published? The answers ARE the rollout
//       order, and the last section derives it from them.
//
// Synthetic data only.

import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { makeDevice, settle, settleUntil, loadOrder, sourceRoot } from './harness.mjs';
import { suite, check, same, given, report } from './runner.mjs';
import { emulatorHost } from './emulator-host.mjs';
import {
    FORTNIGHT, TODAY, clone, stamp, canonical, payDevice, world, advancesOf, plan, openBook, bookOf
} from './paybook.world.mjs';

const EMULATOR = emulatorHost();
const ROOT = sourceRoot();
const git = args => execFileSync('git', ['-C', ROOT].concat(args), { maxBuffer: 64 * 1024 * 1024 });
const NEW_RULES = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
const OLD_RULES = readFileSync(new URL('../docs/firestore.rules.before-paybook', import.meta.url), 'utf8');
const ADAPTER = fileURLToPath(new URL('../js/sync/firebase-adapter.js', import.meta.url));
const CONFIG = fileURLToPath(new URL('../js/sync/_split-test-config.mjs', import.meta.url));
const shimFile = name => fileURLToPath(new URL(`../js/sync/_adapter-split-${name}-test.mjs`, import.meta.url));

const rewrite = text => text
    .replace('"https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js"', '"firebase/app"')
    .replace('"https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js"', '"firebase/auth"')
    .replace('"https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js"', '"firebase/firestore"')
    .replace("from './firebase-config.js'", "from './_split-test-config.mjs'");
const fourLines = (before, after) => {
    const one = before.split('\n');
    const two = after.split('\n');
    const moved = one.map((line, at) => (line === two[at] ? null : at)).filter(at => at !== null);
    return one.length === two.length && moved.length === 4 && moved.every(at =>
        one[at].indexOf('gstatic.com') !== -1 || one[at].indexOf("from './firebase-config.js'") !== -1);
};

const source = readFileSync(ADAPTER, 'utf8');
const MAIN = '8c943fa';
// The older builds, by the commit each was served or merged from - the same three
// tests/paybook.oldbuilds.test.mjs measures on the fake cloud, with v172 (main) for v169.
const OLDER = [['v167', 'a25566f'], ['v171', '0acaceb'], ['v172', MAIN]];
const NEW_HERE = ['js/model/payroll.js', 'js/sync/transact.js', 'js/sync/closed.js'];

// The older builds, built out of Git: their own files, in this build's load order less
// what they never had. Used by section O.
const found = {};
function sourcesOf(name, sha) {
    const order = loadOrder().filter(file => NEW_HERE.indexOf(file) === -1);
    const files = order.filter(file => {
        try { git(['cat-file', '-e', `${sha}:${file}`]); return true; } catch (error) { return false; }
    });
    given(`${name} has every file this build loads that it could have had`, files.length === order.length,
        `${files.length} of ${order.length}`);
    const said = (/const APP_VERSION = '([^']+)'/.exec(git(['show', `${sha}:js/app.js`]).toString('utf8')) || [])[1];
    given(`the older build names itself ${name}`, said === name, String(said));
    return files.map(file => ({ file, code: git(['show', `${sha}:${file}`]).toString('utf8') }));
}
function oldPhone(name, sources, id, env) {
    const device = makeDevice({ sources, appVersion: name, deviceId: id, storage: { [SCHEDULE]: JSON.stringify(BASE.bare) } });
    device.setToday(TODAY);
    device.ctx.askTell = () => Promise.resolve();
    device.ctx.askConfirm = () => Promise.resolve(true);
    device.Sync.pushDelayMs = 5;
    device.State.load();
    device.Sync.connect(adapterFor(as(env, SECOND), opsOf[name]));
    return device;
}
const dayOn = raw => Boolean(raw && raw.days && raw.days['2026-10-18'] && raw.days['2026-10-18'].actual
    && raw.days['2026-10-18'].actual.w_nasser);


{
    suite('what is under test: the shipped adapter, the rules of this branch, and the rules as published today');
    check('the adapter differs from the shipped file in exactly four import specifiers', fourLines(source, rewrite(source)));
    check('the new rules speak of the pay book and of closed documents',
        /function payGuard\(docId\)/.test(NEW_RULES) && /match \/closed\/\{entryId\}/.test(NEW_RULES));
    same('docs/firestore.rules.before-paybook is, byte for byte, the rules main carries - the rollback artifact',
        OLD_RULES === git(['show', `${MAIN}:firestore.rules`]).toString('utf8'), true);
    check('and those rules know nothing of the pay book', !/\bpay\b|closed\//.test(OLD_RULES.replace(/\/\/.*$/gm, '')));
    given('the emulator is a local one', /^(127\.0\.0\.1|localhost)$/.test(EMULATOR.host), EMULATOR.host);
}

writeFileSync(CONFIG, 'export const firebaseConfig = { apiKey: "", projectId: "" };\n'
    + 'export const SCHEDULE_DOC_PATH = "schedules/current";\n');
const opsOf = {};
try {
    writeFileSync(shimFile('new'), rewrite(source));
    opsOf.new = (await import('./../js/sync/_adapter-split-new-test.mjs'));
    for (const [name, sha] of OLDER) {
        const old = git(['show', `${sha}:js/sync/firebase-adapter.js`]).toString('utf8');
        given(`${name}'s own adapter is rewritten in its import specifiers only`, fourLines(old, rewrite(old)));
        writeFileSync(shimFile(name), rewrite(old));
        opsOf[name] = await import(`./../js/sync/_adapter-split-${name}-test.mjs`);
    }
} finally {
    ['new'].concat(OLDER.map(one => one[0])).forEach(name => {
        try { unlinkSync(shimFile(name)); } catch (error) { /* best effort */ }
    });
    try { unlinkSync(CONFIG); } catch (error) { /* best effort */ }
}

const { doc, getDoc, getDocs, collection, setDoc, deleteDoc, runTransaction, onSnapshot, FieldPath } = await import('firebase/firestore');

const envNew = await initializeTestEnvironment({ projectId: 'demo-farkad-split-new',
    firestore: { rules: NEW_RULES, host: EMULATOR.host, port: EMULATOR.port } });
const envOld = await initializeTestEnvironment({ projectId: 'demo-farkad-split-old',
    firestore: { rules: OLD_RULES, host: EMULATOR.host, port: EMULATOR.port } });

const ALLOWED = 'yosef.farkad1@gmail.com';
const SECOND = 'farkad1963@gmail.com';
const as = (env, email) => env.authenticatedContext(email.replace(/[^a-z0-9]/gi, ''), { email }).firestore();
const PATH = ['schedules', 'current'];
const SCHEDULE = 'scheduleData:v2';

// ONE RECORD everybody starts from - see BASE in tests/paybook.sync.test.mjs.
const BASE = (() => {
    const first = world({ advances: [['w_khaled', '2026-10-03', 500], ['w_khaled', '2026-10-06', 400]] });
    openBook(first, undefined, 'd_seed');
    const schedule = clone(first.State.schedule);
    const bare = clone(schedule);
    delete bare.pay;
    return { schedule, bare, wire: first.call('cloudDocument', schedule), advances: advancesOf(first, 'w_khaled') };
})();
const [K1, K2] = BASE.advances;
const WITH_PAY = () => Object.assign(clone(BASE.wire), { protocol: 2, revision: 1, lastOpId: 'op_seed' });
const WITHOUT_PAY = () => { const seed = WITH_PAY(); delete seed.pay; seed.protocol = 1; return seed; };

async function reseed(env, shape) {
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async ctx => { await setDoc(doc(ctx.firestore(), ...PATH), shape || WITH_PAY()); });
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
const payIds = raw => Object.keys((raw && raw.pay) || {}).sort();
const deductions = raw => Object.keys(((raw || {}).ledger || {}).advances || {}).filter(id => id.indexOf('le_close_') === 0).sort();

function adapterFor(db, module) {
    const ops = module.firestoreOps(db, doc(db, ...PATH), id => doc(db, ...PATH, 'receipts', String(id)),
        id => doc(db, ...PATH, 'closed', String(id)));
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
    return adapter;
}

function phone(id, env, options = {}) {
    const device = payDevice(Object.assign({ deviceId: id, flags: { paybookQueue: false },
        storage: { [SCHEDULE]: JSON.stringify(options.bare ? BASE.bare : BASE.schedule) } }, options));
    device.Sync.pushDelayMs = 5;
    device.State.load();
    device.Sync.connect(adapterFor(as(env, options.email || ALLOWED), opsOf.new));
    return device;
}
const quiet = device => device.Sync.status === 'synced' && device.Sync.pendingCount() === 0;
async function reached(ready, limit = 20000, step = 10) {
    const arrived = await settleUntil(ready, limit, step);
    if (!arrived) throw new Error('a barrier timed out waiting for: ' + String(ready).replace(/\s+/g, ' ').slice(0, 200));
}
const khaled = (device, choices = {}, hour = '10') => plan(device, 'planClosure', 'w_khaled', FORTNIGHT,
    Object.assign({ allocations: { [K1]: 500, [K2]: 100 }, paid: 2000, paidOn: TODAY, method: 'cash' }, choices),
    stamp(TODAY, device.id, hour));
const KHALED_PAY = ['po_open', 'pp_ps_w_khaled_20261002', 'ps_w_khaled_20261002'];
const day = (device, worker, date) => given(`a day is recorded (${worker} ${date})`,
    device.State.commit(device.call('assignPlace', device.State.schedule, date, worker, 'actual', 'p_a', undefined, 0)) === true);

async function passes(name, promise) {
    try { await assertSucceeds(promise); check(name, true); }
    catch (error) { check(name, false, String(error.message || error).slice(0, 160)); }
}
async function denied(name, promise) {
    try { await assertFails(promise); check(name, true); }
    catch (error) { check(name, false, String(error.message || error).slice(0, 160)); }
}

// One closure as the planner draws it, for the raw-rules section.
const DRAWN = (() => {
    const d = payDevice({ storage: { [SCHEDULE]: JSON.stringify(BASE.schedule) }, deviceId: 'd_rules' });
    d.State.load();
    const drawn = khaled(d);
    if (drawn.ok !== true) throw new Error('the fixture closure was refused: ' + JSON.stringify(drawn.reasons));
    const entries = {};
    drawn.changes.forEach(change => { entries[change.path] = clone(change.value); });
    return { entries };
})();

// The pair, written by hand: the schedule's paths, its receipt, and the closed document -
// one Firestore transaction, with every field a test may want to get wrong.
let seq = 0;
function pairWrite(db, options = {}) {
    seq += 1;
    const opId = options.opId || `op_pair_${seq}`;
    const closedId = options.closedId === undefined ? 'ps_w_khaled_20261002' : options.closedId;
    const entries = options.entries || DRAWN.entries;
    return runTransaction(db, async tx => {
        const snap = await tx.get(doc(db, ...PATH));
        const revision = options.revision !== undefined ? options.revision : snap.data().revision + 1;
        const fields = Object.assign({}, entries, { updatedAt: '2026-10-16T10:00:00.000Z', updatedBy: 'd_rules',
            protocol: options.protocol === undefined ? 2 : options.protocol, revision, lastOpId: opId,
            opFingerprint: 'f_' + opId });
        if (closedId !== null && options.nameClosed !== false) fields.closedId = closedId;
        const args = [];
        Object.keys(fields).forEach(path => args.push(new FieldPath(...path.split('.')), fields[path]));
        tx.update(doc(db, ...PATH), ...args);
        tx.set(doc(db, ...PATH, 'receipts', opId), { revision, opFingerprint: 'f_' + opId, at: 'now', by: 'd_rules' });
        if (closedId !== null && options.writeClosed !== false) {
            tx.set(doc(db, ...PATH, 'closed', closedId), Object.assign({ v: 1, id: closedId, kind: 'closure',
                workerId: 'w_khaled', opId, revision, entries }, options.closedData || {}));
        }
    });
}

// ================================================================ R
{
    suite('R: the rules - a closed document is created once, with its schedule write, and never alone');

    await reseed(envNew);
    const me = as(envNew, ALLOWED);
    await passes('the pair is accepted: the schedule gains the closure and the closed document is created, in one commit', pairWrite(me));
    same('the schedule holds the statement, the closed document exists, and each names the same operation and revision',
        await (async () => {
            const live = await server(envNew);
            const closed = await server(envNew, 'closed', 'ps_w_khaled_20261002');
            return [payIds(live), closed.opId === live.lastOpId, closed.revision === live.revision, live.closedId];
        })(), [KHALED_PAY, true, true, 'ps_w_khaled_20261002']);

    await denied('a closed document cannot be UPDATED - not by an account on the list',
        setDoc(doc(me, ...PATH, 'closed', 'ps_w_khaled_20261002'), { v: 1, tampered: true }, { merge: true }));
    await denied('nor replaced whole', setDoc(doc(me, ...PATH, 'closed', 'ps_w_khaled_20261002'), { v: 1, opId: 'x', revision: 2 }));
    await denied('nor DELETED', deleteDoc(doc(me, ...PATH, 'closed', 'ps_w_khaled_20261002')));
    await denied('nor by the second account on the list', deleteDoc(doc(as(envNew, SECOND), ...PATH, 'closed', 'ps_w_khaled_20261002')));
    same('after all of that the closed document is byte for byte what was created',
        canonical((await server(envNew, 'closed', 'ps_w_khaled_20261002')).entries), canonical(DRAWN.entries));
    await passes('an account on the list may read it', getDoc(doc(me, ...PATH, 'closed', 'ps_w_khaled_20261002')));
    await denied('a signed-in account that is not on the list may not',
        getDoc(doc(as(envNew, 'stranger@example.com'), ...PATH, 'closed', 'ps_w_khaled_20261002')));
    await denied('and nobody at all may not',
        getDoc(doc(envNew.unauthenticatedContext().firestore(), ...PATH, 'closed', 'ps_w_khaled_20261002')));

    await reseed(envNew);
    const live0 = await server(envNew);
    await denied('a closed document ALONE - no schedule write beside it - is refused',
        setDoc(doc(me, ...PATH, 'closed', 'ps_alone'), { v: 1, id: 'ps_alone', opId: live0.lastOpId, revision: 7, entries: {} }));
    await denied('and one that names the operation the schedule is already at is refused too: that operation is not creating it',
        setDoc(doc(me, ...PATH, 'closed', 'ps_alone'), { v: 1, id: 'ps_alone', opId: live0.lastOpId, revision: live0.revision, entries: {} }));

    suite('R: the pay map - only grows, only at protocol 2, only with its closed copy');

    await reseed(envNew);
    await denied('pay entries with NO closed document named are refused', pairWrite(me, { nameClosed: false, writeClosed: false }));
    await denied('pay entries naming a closed document that the commit does not create are refused', pairWrite(me, { writeClosed: false }));
    await denied('pay entries from a writer that speaks protocol 1 are refused, closed copy and all', pairWrite(me, { protocol: 1 }));
    same('none of those four left anything behind: the pay book, the closed collection and the receipts are as seeded',
        [payIds(await server(envNew)), await names(envNew, 'closed'), await names(envNew, 'receipts'), (await server(envNew)).revision],
        [['po_open'], [], [], 1]);

    suite('R: each half failing takes the other with it');

    await denied('THE CLOSED HALF WRONG - it names another operation: the whole commit is refused',
        pairWrite(me, { closedData: { opId: 'op_somebody_else' } }));
    same('and the schedule half did not land without it: no statement, no receipt, the revision where it was',
        [payIds(await server(envNew)), await names(envNew, 'receipts'), await names(envNew, 'closed'), (await server(envNew)).revision],
        [['po_open'], [], [], 1]);
    await denied('the closed half claiming another revision: refused whole', pairWrite(me, { closedData: { revision: 9 } }));
    await denied('THE SCHEDULE HALF WRONG - a stale revision: the whole commit is refused', pairWrite(me, { revision: 7 }));
    same('and the closed half did not land without it', [await names(envNew, 'closed'), payIds(await server(envNew))], [[], ['po_open']]);

    suite('R: an entry of the pay book is never rewritten and never removed - on the server');

    await passes('the closure lands', pairWrite(me));
    const rewritten = clone(DRAWN.entries);
    rewritten['pay.pp_ps_w_khaled_20261002'].amount = 5;
    await denied('REWRITING a payment that is there is refused - protocol 2, a fresh closed document and all',
        pairWrite(me, { entries: { 'pay.pp_ps_w_khaled_20261002': rewritten['pay.pp_ps_w_khaled_20261002'] }, closedId: 'pp_rewrite' }));
    await denied('DELETING one is refused', runTransaction(me, async tx => {
        const snap = await tx.get(doc(me, ...PATH));
        const pay = clone(snap.data().pay);
        delete pay.pp_ps_w_khaled_20261002;
        tx.update(doc(me, ...PATH), 'pay', pay, 'updatedAt', 'x', 'updatedBy', 'd', 'protocol', 2,
            'revision', snap.data().revision + 1, 'lastOpId', 'op_del', 'opFingerprint', 'f_op_del', 'closedId', 'pp_del');
        tx.set(doc(me, ...PATH, 'receipts', 'op_del'), { revision: snap.data().revision + 1, opFingerprint: 'f_op_del' });
        tx.set(doc(me, ...PATH, 'closed', 'pp_del'), { v: 1, id: 'pp_del', opId: 'op_del', revision: snap.data().revision + 1, entries: {} });
    }));
    const wholeWithout = async protocol => runTransaction(me, async tx => {
        const snap = await tx.get(doc(me, ...PATH));
        const next = clone(snap.data());
        delete next.pay;
        delete next.closedId;
        Object.assign(next, { protocol, revision: snap.data().revision + 1, lastOpId: `op_whole_${protocol}`,
            opFingerprint: `f_whole_${protocol}`, updatedAt: 'x' });
        tx.set(doc(me, ...PATH), next);
        tx.set(doc(me, ...PATH, 'receipts', next.lastOpId), { revision: next.revision, opFingerprint: next.opFingerprint });
    });
    await denied('A WHOLE DOCUMENT WITH NO PAY BOOK - what a build from before it restores - is refused at protocol 1', wholeWithout(1));
    await denied('and at protocol 2 as well: nothing removes an entry', wholeWithout(2));
    same('the pay book is whole after every one of those', payIds(await server(envNew)), KHALED_PAY);
    await passes('a whole document that KEEPS the pay book as it is - this build\'s restore - is accepted, with no closed document needed',
        runTransaction(me, async tx => {
            const snap = await tx.get(doc(me, ...PATH));
            const next = Object.assign(clone(snap.data()), { protocol: 2, revision: snap.data().revision + 1,
                lastOpId: 'op_keep', opFingerprint: 'f_keep', updatedAt: 'y' });
            tx.set(doc(me, ...PATH), next);
            tx.set(doc(me, ...PATH, 'receipts', 'op_keep'), { revision: next.revision, opFingerprint: 'f_keep' });
        }));
    await passes('and an ordinary day, sent at protocol 1 by a phone that has not updated, is accepted beside a pay book',
        runTransaction(me, async tx => {
            const snap = await tx.get(doc(me, ...PATH));
            tx.update(doc(me, ...PATH), new FieldPath('days', '2026-10-18', 'actual', 'w_nasser'), { entries: [{ placeId: 'p_a' }] },
                'updatedAt', 'z', 'updatedBy', 'd_old', 'protocol', 1, 'revision', snap.data().revision + 1,
                'lastOpId', 'op_day', 'opFingerprint', 'f_day');
            tx.set(doc(me, ...PATH, 'receipts', 'op_day'), { revision: snap.data().revision + 1, opFingerprint: 'f_day' });
        }));
}

// ================================================================ A
{
    suite('A1: the production adapter - one closure is one commit of three documents');

    await reseed(envNew);
    const a = phone('d_ea1', envNew);
    const b = phone('d_eb1', envNew, { email: SECOND });
    await reached(() => quiet(a) && quiet(b));
    const drawn = khaled(a);
    const answer = await a.Sync.transactPaybook(drawn);
    check('closed, by name', answer.ok === true && answer.state === 'closed' && answer.closedId === 'ps_w_khaled_20261002',
        JSON.stringify(answer));
    const live = await server(envNew);
    const closed = await server(envNew, 'closed', 'ps_w_khaled_20261002');
    same('the schedule moved one revision and holds the closure', [live.revision, payIds(live), deductions(live).length], [2, KHALED_PAY, 2]);
    same('the closed document holds exactly the plan\'s entries and names the commit',
        [canonical(closed.entries) === canonical(Object.fromEntries(drawn.changes.map(change => [change.path, change.value]))),
            closed.opId === live.lastOpId, closed.revision === live.revision], [true, true, true]);
    same('one receipt, one closed document', [(await names(envNew, 'receipts')).length, await names(envNew, 'closed')], [1, ['ps_w_khaled_20261002']]);
    await reached(() => bookOf(b) === bookOf(a) && quiet(b));
    same('nothing waited in a queue on either phone, and the other phone holds the same book',
        [a.Sync.pendingCount(), b.Sync.pendingCount(), bookOf(b) === canonical(live.pay)], [0, 0, true]);

    suite('A2: two phones close the same man and period AT THE SAME MOMENT');

    await reseed(envNew);
    const c = phone('d_ec2', envNew);
    const d = phone('d_ed2', envNew, { email: SECOND });
    await reached(() => quiet(c) && quiet(d));
    const onC = khaled(c, {}, '10');
    const onD = khaled(d, { allocations: { [K1]: 300, [K2]: 0 }, paid: 1000 }, '11');
    given('two different closures of one account are drawn', onC.ok && onD.ok);
    const [one, two] = await Promise.all([c.Sync.transactPaybook(onC), d.Sync.transactPaybook(onD)]);
    const states = [one.state, two.state].sort();
    same('exactly one of them closed it; the other is told the account changed', states, ['closed', 'stale']);
    const winner = one.state === 'closed' ? c : d;
    const loser = one.state === 'closed' ? d : c;
    const lost = one.state === 'closed' ? two : one;
    const after = await server(envNew);
    same('EXACTLY ONE closed document, one statement, one receipt for it', [await names(envNew, 'closed'), payIds(after),
        (await names(envNew, 'receipts')).length], [['ps_w_khaled_20261002'], KHALED_PAY, 1]);
    same('the statement is the winner\'s, entire - nothing of the loser\'s is mixed into it',
        [after.pay.ps_w_khaled_20261002.by, canonical((await server(envNew, 'closed', 'ps_w_khaled_20261002')).entries['pay.ps_w_khaled_20261002'])
            === canonical(after.pay.ps_w_khaled_20261002)], [winner.id, true]);
    const off = winner === c ? [500, 100] : [300, 0];
    same('NO DOUBLE DEDUCTION: each advance was reduced once, by the winner\'s figure',
        [c.call('advanceOutstanding', after, K1).left, c.call('advanceOutstanding', after, K2).left], [500 - off[0], 400 - off[1]]);
    check('the loser is told plainly: stale, and the account is already closed',
        lost.ok === false && lost.reasons.includes('stale') && (lost.reasons.includes('closed') || lost.reasons.includes('statement')),
        JSON.stringify(lost));
    await reached(() => bookOf(loser) === canonical(after.pay));
    same('the loser holds the winner\'s closure, no intent, nothing queued, nothing beside, and is not stopped',
        [bookOf(loser) === canonical(after.pay), loser.dump()['farkad:payIntent'] === undefined, loser.Sync.pendingCount(),
            loser.State.schedule.payConflicted, loser.call('farkadWritesBlocked')], [true, true, 0, undefined, false]);

    suite('A3: the adapter\'s two documents - each half failing, through the shipped transaction');

    await reseed(envNew);
    const db = as(envNew, ALLOWED);
    const ops = adapterFor(db, opsOf.new);
    const envelope = (opId, revision) => Object.assign(clone(DRAWN.entries), { closedId: 'ps_w_khaled_20261002',
        updatedAt: '2026-10-16T10:00:00.000Z', updatedBy: 'd_x', protocol: 2, lastOpId: opId, opFingerprint: 'f_' + opId, revision });
    const body = (opId, revision) => ({ v: 1, id: 'ps_w_khaled_20261002', kind: 'closure', workerId: 'w_khaled', opId, revision, entries: DRAWN.entries });
    const outcome = promise => promise.then(() => 'landed', error => error.code || String(error.message).slice(0, 60));
    same('the closed half naming another operation: the server refuses the commit',
        await outcome(ops.transact(envelope('op_a3a', 2), [{ id: 'ps_w_khaled_20261002', data: body('op_other', 2) }])), 'permission-denied');
    same('and NEITHER half is there', [payIds(await server(envNew)), await names(envNew, 'closed'), await names(envNew, 'receipts')],
        [['po_open'], [], []]);
    same('the schedule half built on a stale revision: a conflict, carrying the document',
        await outcome(ops.transact(envelope('op_a3b', 5), [{ id: 'ps_w_khaled_20261002', data: body('op_a3b', 5) }])), 'conflict');
    same('and NEITHER half is there', [payIds(await server(envNew)), await names(envNew, 'closed')], [['po_open'], []]);
    same('with no closed document at all the adapter does not even open a transaction',
        await outcome(ops.transact(envelope('op_a3c', 2), [])), 'no-closed-document');
    same('both halves right: it lands', await outcome(ops.transact(envelope('op_a3d', 2),
        [{ id: 'ps_w_khaled_20261002', data: body('op_a3d', 2) }])), 'landed');
    same('the same operation again is answered from its receipt and writes nothing',
        [JSON.stringify(await ops.transact(envelope('op_a3d', 2), [{ id: 'ps_w_khaled_20261002', data: body('op_a3d', 2) }])),
            (await server(envNew)).revision], ['{"replayed":true,"revision":2}', 2]);
    const second = { 'pay.pp_later0000001': { id: 'pp_later0000001', kind: 'payment', workerId: 'w_khaled',
        statementId: 'ps_w_khaled_20261002', date: TODAY, amount: 100, at: `${TODAY}T12:00:00.000Z`, by: 'd_x' } };
    same('ANOTHER operation aimed at a closed document that already exists is told so, in words - not "permission denied"',
        await outcome(ops.transact(Object.assign({}, second, { closedId: 'ps_w_khaled_20261002', updatedAt: 'x', updatedBy: 'd_x',
            protocol: 2, lastOpId: 'op_a3e', opFingerprint: 'f_op_a3e', revision: 3 }),
        [{ id: 'ps_w_khaled_20261002', data: { v: 1, id: 'ps_w_khaled_20261002', opId: 'op_a3e', revision: 3, entries: second } }])),
        'closed-exists');
    same('and the first closed document is untouched', (await server(envNew, 'closed', 'ps_w_khaled_20261002')).opId, 'op_a3d');
    same('the receipt can be read back by name, and one that was never written reads as nothing',
        [(await ops.readReceipt('op_a3d')).revision, await ops.readReceipt('op_never')], [2, null]);
}

// ================================================================ O
for (const [name, sha] of OLDER) {
    const sources = sourcesOf(name, sha);
    const cell = found[name] = {};

    suite(`O / ${name} under the NEW rules, a document WITH a pay book`);
    {
        await reseed(envNew, WITH_PAY());
        const n = phone(`d_n_${name}`, envNew);
        await reached(() => quiet(n));
        given('this build closes Khaled\'s account', (await n.Sync.transactPaybook(khaled(n))).state === 'closed');
        const before = canonical((await server(envNew)).pay);
        const old = oldPhone(name, sources, `d_o_${name}`, envNew);
        await reached(() => quiet(old));
        day(old, 'w_nasser', '2026-10-18');
        await reached(() => old.Sync.pendingCount() === 0, 20000);
        const landed = await server(envNew);
        cell.dayUnderNew = dayOn(landed) && canonical(landed.pay) === before;
        check('IT STILL RECORDS A DAY: the day is on the server, signed by it, and the pay book is byte for byte unchanged',
            cell.dayUnderNew && landed.updatedBy === old.id, JSON.stringify([dayOn(landed), landed.updatedBy]));
        same('and it says synced', old.Sync.status, 'synced');

        const revision = landed.revision;
        const restoring = old.Sync.replaceEverything(old.call('normaliseSchedule', clone(old.State.schedule)));
        await Promise.race([restoring.catch(() => null), settle(6000)]);
        await settle(1500);
        const kept = await server(envNew);
        cell.restoreRefused = canonical(kept.pay) === before && kept.revision === revision;
        check('ITS RESTORE IS REFUSED INSTEAD OF ERASING: the pay book and the revision are exactly where they were',
            cell.restoreRefused, JSON.stringify([payIds(kept), kept.revision, revision]));
        same('the closed document is untouched', await names(envNew, 'closed'), ['ps_w_khaled_20261002']);
        cell.oldSaysAfterRefusal = old.Sync.status;
        check('and the old phone does NOT say synced about a restore the server refused', old.Sync.status !== 'synced', old.Sync.status);
        // What that phone can do afterwards, measured rather than assumed.
        day(old, 'w_salim', '2026-10-19');
        await settle(2500);
        const later = await server(envNew);
        cell.oldRecordsAfterRefusedRestore = Boolean(later.days['2026-10-19'] && later.days['2026-10-19'].actual
            && later.days['2026-10-19'].actual.w_salim);
        same('MEASURED: after its refused restore, a day it records does NOT reach the server - it waits on that phone, behind the restore, until the phone is updated',
            cell.oldRecordsAfterRefusedRestore, false);
        same('that day is on the old phone\'s own disk, and nothing of the pay book moved',
            [Boolean(old.State.schedule.days['2026-10-19'].actual.w_salim), canonical(later.pay) === before], [true, true]);
    }

    suite(`O / ${name} under the NEW rules, a document with NO pay book (the real one, today)`);
    {
        await reseed(envNew, WITHOUT_PAY());
        const old = oldPhone(name, sources, `d_o2_${name}`, envNew);
        await reached(() => quiet(old));
        day(old, 'w_nasser', '2026-10-18');
        await reached(() => old.Sync.pendingCount() === 0, 20000);
        cell.dayNoPay = dayOn(await server(envNew));
        const result = await old.Sync.replaceEverything(old.call('normaliseSchedule', clone(old.State.schedule)));
        await reached(() => quiet(old), 20000);
        const after = await server(envNew);
        cell.restoreNoPay = result.ok === true && after.updatedBy === old.id && dayOn(after);
        same('it records a day, and its restore is ACCEPTED - there is no pay book for it to erase, so nothing is refused',
            [cell.dayNoPay, cell.restoreNoPay, old.Sync.status], [true, true, 'synced']);
    }

    suite(`O / ${name} under the rules AS PUBLISHED TODAY, a document with a pay book - the hazard, on the real rules`);
    {
        await reseed(envOld, WITH_PAY());
        const old = oldPhone(name, sources, `d_o3_${name}`, envOld);
        await reached(() => quiet(old));
        const result = await old.Sync.replaceEverything(old.call('normaliseSchedule', clone(old.State.schedule)));
        await reached(() => quiet(old), 20000);
        const after = await server(envOld);
        cell.oldRulesErase = result.ok === true && after.pay === undefined;
        check('its restore is ACCEPTED and the pay book is GONE from the server - which is why the rules are published first',
            cell.oldRulesErase, JSON.stringify(payIds(after)));
    }
}

{
    suite('O / this build under the rules AS PUBLISHED TODAY');

    await reseed(envOld, WITHOUT_PAY());
    const n = phone('d_n_oldrules', envOld, { bare: true });
    await reached(() => quiet(n));
    day(n, 'w_nasser', '2026-10-18');
    await reached(() => n.Sync.pendingCount() === 0, 20000);
    const landed = await server(envOld);
    found.newDayUnderOld = dayOn(landed) && landed.protocol === 2;
    check('an ordinary day from this build - protocol 2 - is accepted by the rules of today', found.newDayUnderOld,
        JSON.stringify([dayOn(landed), landed.protocol]));

    await reseed(envOld, WITH_PAY());
    const m = phone('d_m_oldrules', envOld);
    await reached(() => quiet(m));
    const answer = await m.Sync.transactPaybook(khaled(m));
    const after = await server(envOld);
    found.newCloseUnderOld = answer.state;
    same('a CLOSURE from this build is refused by them, whole: there is no closed/ in those rules, so neither half lands',
        [answer.ok, answer.state, answer.reasons, payIds(after), await names(envOld, 'closed'), after.revision],
        [false, 'refused', ['server'], ['po_open'], [], 1]);
    same('nothing is left queued or in doubt on that phone, and its record is not closed',
        [m.Sync.pendingCount(), m.dump()['farkad:payIntent'] === undefined, payIds(m.State.schedule)], [0, true, ['po_open']]);

    suite('O / this build under the NEW rules, the document as it is today (no pay book, protocol 1)');
    await reseed(envNew, WITHOUT_PAY());
    const p = phone('d_p_newrules', envNew, { bare: true });
    await reached(() => quiet(p));
    day(p, 'w_nasser', '2026-10-18');
    await reached(() => p.Sync.pendingCount() === 0, 20000);
    found.newDayUnderNew = dayOn(await server(envNew));
    const restored = await p.Sync.replaceEverything(p.call('normaliseSchedule', clone(p.State.schedule)));
    await reached(() => quiet(p), 20000);
    found.newRestoreUnderNew = restored.ok === true;
    same('a day and a whole-document restore from this build are both accepted', [found.newDayUnderNew, found.newRestoreUnderNew], [true, true]);
}

// ================================================================ the order, derived
{
    suite('THE ROLLOUT ORDER - derived from the cells above, not argued');

    const olds = OLDER.map(([name]) => found[name]);
    same('every older build answers every question the same way',
        olds.map(cell => [cell.dayUnderNew, cell.restoreRefused, cell.dayNoPay, cell.restoreNoPay, cell.oldRulesErase]),
        OLDER.map(() => [true, true, true, true, true]));
    // 1. Publishing the new rules FIRST breaks no phone: an older build records days under
    //    them with or without a pay book on the document, and restores as before while
    //    there is none.
    check('1. the new rules can be published while every phone is still on an older build: nobody working is refused',
        olds.every(cell => cell.dayUnderNew && cell.dayNoPay && cell.restoreNoPay));
    // 2. This build works under either set of rules for everything but the pay book.
    check('2. the phones can then update in any order: this build records and restores under the old rules and the new',
        found.newDayUnderOld && found.newDayUnderNew && found.newRestoreUnderNew);
    // 3. The pay book cannot be written before the rules: the closure is refused whole.
    same('3. no closure can land before the rules are published - the old rules refuse it whole', found.newCloseUnderOld, 'refused');
    // 4. Once they are published, an older build can no longer erase one.
    check('4. and from the moment they are published, no restore from an older build can erase a pay book',
        olds.every(cell => cell.restoreRefused));
    // The reverse order is the one that loses money, and it is measured too.
    check('THE WRONG ORDER, measured: a pay book on the server under the rules of today is erased by any older build\'s restore',
        olds.every(cell => cell.oldRulesErase));
    console.log('\n  measured, per older build: ' + JSON.stringify(found));
}

await envNew.cleanup();
await envOld.cleanup();
report();
