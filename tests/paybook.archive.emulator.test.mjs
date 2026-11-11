// tests/paybook.archive.emulator.test.mjs
//
// PHASE 5 against the real thing: the rules of this branch on the Firestore emulator, the
// PRODUCTION adapter's archiveClosed, and three older builds out of Git.
//
//   X1  the rules, written to by hand: what a drop must carry, and every way of leaving
//       one half out
//   X2  the production adapter: the move, confirmed inside its own transaction
//   X3  two phones moving the same closures at the same instant
//   X4  a phone installed after the move, and a restore from this build
//   X5  v167, v171 and v172 once an index exists: they may not write, and their restore
//       cannot erase it
//
// Never touches a real project: the emulator host is asserted local, the project ids are
// demo- ones, and the shims are written beside the adapter and removed.

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
// THE RULES LIVE TODAY are main's firestore.rules at v186 (9846d7f): the rules of v184 plus
// the shared rides' block, which the owner reported pasting on 2026-11-10 (reported - not
// read off the console from here). docs/firestore.rules.before-paybook is that file.
const RULES_LIVE = '9846d7f';
// The older builds, by the commit each was served or merged from - the same three
// tests/paybook.oldbuilds.test.mjs measures on the fake cloud, with v172 (main) for v169.
const OLDER = [['v167', 'a25566f'], ['v171', '0acaceb'], ['v172', MAIN]];
const NEW_HERE = ['js/model/payroll.js', 'js/sync/transact.js', 'js/sync/closed.js',
    'js/model/months.js', 'js/sync/months.js', 'js/cold.js'];

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
    check('the new rules speak of the pay book, of closed documents and of the index of what has left',
        /function payGuard\(docId\)/.test(NEW_RULES) && /match \/closed\/\{entryId\}/.test(NEW_RULES)
        && /function archivesOne\(docId\)/.test(NEW_RULES) && /function indexedNeedsPaybook\(\)/.test(NEW_RULES));
    // v190 MOVED: asked of 8c943fa (v172) until the shared rides' block went live; the
    // file is now main's at v186, and it is asked of that commit.
    same('docs/firestore.rules.before-paybook is, byte for byte, the rules main carries at v186 - what is live today',
        OLD_RULES === git(['show', `${RULES_LIVE}:firestore.rules`]).toString('utf8'), true);
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

const envNew = await initializeTestEnvironment({ projectId: 'demo-farkad-archive-new',
    firestore: { rules: NEW_RULES, host: EMULATOR.host, port: EMULATOR.port } });
const envOld = await initializeTestEnvironment({ projectId: 'demo-farkad-archive-old',
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
    if (typeof ops.archiveClosed === 'function') {
        adapter.archiveClosed = (patch, removals, ids) => ops.archiveClosed(plain(patch), plain(removals), plain(ids));
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

// One closure through the real door, paid in full. (Above the two helpers that check, so
// that what it takes for granted is seen to protect something - tests/nonassertions.)
async function close(device, worker, choices = {}) {
    const draw = paid => plan(device, 'planClosure', worker, FORTNIGHT,
        Object.assign({ method: 'cash' }, choices, paid === null ? {} : { paid, paidOn: TODAY }), stamp(TODAY, device.id));
    const first = draw(null);
    given(`the closure of ${worker} is allowed`, first.ok === true, JSON.stringify(first.reasons));
    const drawn = draw(first.review.netDue);
    const answer = await device.Sync.transactPaybook(drawn);
    given(`the closure of ${worker} is on the server`, answer.state === 'closed', JSON.stringify(answer));
}

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

const { deleteField } = await import('firebase/firestore');

const SALIM = 'ps_w_salim_20261002';
const KHALED = 'ps_w_khaled_20261002';
const NASSER = 'ps_w_nasser_20261002';
const rowsOf = raw => Object.keys(((raw && raw.payIndex) || {}).rows || {}).sort();
const KHALED_PATHS = Object.keys(DRAWN.entries).sort();
const at = (root, path) => path.split('.').reduce((node, key) =>
    (node && typeof node === 'object' && Object.prototype.hasOwnProperty.call(node, key) ? node[key] : undefined), root);

// Everything a person is paid from, as one string (the same fold tests/paybook.archive.test.mjs uses).
const money = device => {
    const S = device.State.schedule;
    return canonical({
        accounts: device.call('accountsList', S, TODAY),
        history: device.call('closureHistory', S, {}),
        advances: Object.keys(device.call('currentAdvances', S)).sort().map(id => device.call('advanceOutstanding', S, id)),
        closed: S.workers.map(man => [man.id, device.call('closedPeriods', S, man.id)]),
        payroll: device.call('payrollReport', S, '2026-10-02', '2026-10-15'),
        pay: S.pay,
        ledger: S.ledger.advances
    });
};

// A row as this build would write it - the rules do not read inside one.
const ROW = { w: 'w_khaled', f: '2026-10-02', t: '2026-10-15', g: 4400, a: {}, s: 'statement', o: 3800, p: 3800 };

// A drop written by hand: the schedule loses `remove`, gains `rows`, names `archivedId`,
// and carries its receipt - every part of it optional, to leave one out.
function dropWrite(db, options = {}) {
    seq += 1;
    const opId = `op_drop_${seq}`;
    return runTransaction(db, async tx => {
        const snap = await tx.get(doc(db, ...PATH));
        const revision = snap.data().revision + 1;
        const fields = { updatedAt: '2026-10-16T12:00:00.000Z', updatedBy: 'd_rules',
            protocol: options.protocol === undefined ? 2 : options.protocol, revision, lastOpId: opId, opFingerprint: 'f_' + opId };
        if (options.archivedId !== null) fields.archivedId = options.archivedId || KHALED;
        const args = [];
        Object.keys(fields).forEach(path => args.push(new FieldPath(path), fields[path]));
        const rows = options.rows === undefined ? { [KHALED]: ROW } : options.rows;
        Object.keys(rows).forEach(id => args.push(new FieldPath('payIndex', 'rows', id), rows[id]));
        (options.remove === undefined ? KHALED_PATHS : options.remove)
            .forEach(path => args.push(new FieldPath(...path.split('.')), deleteField()));
        Object.keys(options.add || {}).forEach(path => args.push(new FieldPath(...path.split('.')), options.add[path]));
        tx.update(doc(db, ...PATH), ...args);
        tx.set(doc(db, ...PATH, 'receipts', opId), { revision, opFingerprint: 'f_' + opId, at: 'now', by: 'd_rules' });
    });
}
// A whole document written by hand, with its receipt.
function wholeWrite(db, change, options = {}) {
    seq += 1;
    const opId = `op_whole_${seq}`;
    return runTransaction(db, async tx => {
        const snap = await tx.get(doc(db, ...PATH));
        const data = snap.exists() ? snap.data() : clone(WITH_PAY());
        const revision = snap.exists() ? data.revision + 1 : 1;
        change(data);
        Object.assign(data, { updatedAt: '2026-10-16T13:00:00.000Z', updatedBy: 'd_rules',
            protocol: options.protocol === undefined ? 2 : options.protocol, revision, lastOpId: opId, opFingerprint: 'f_' + opId });
        tx.set(doc(db, ...PATH), data);
        tx.set(doc(db, ...PATH, 'receipts', opId), { revision, opFingerprint: 'f_' + opId, at: 'now', by: 'd_rules' });
    });
}
function dayWrite(db, date, protocol) {
    seq += 1;
    const opId = `op_day_${seq}`;
    return runTransaction(db, async tx => {
        const snap = await tx.get(doc(db, ...PATH));
        const revision = snap.data().revision + 1;
        tx.update(doc(db, ...PATH), new FieldPath('days', date, 'actual', 'w_nasser'), { place: 'p_a' },
            'updatedAt', '2026-10-16T14:00:00.000Z', 'updatedBy', 'd_rules', 'protocol', protocol, 'revision', revision,
            'lastOpId', opId, 'opFingerprint', 'f_' + opId);
        tx.set(doc(db, ...PATH, 'receipts', opId), { revision, opFingerprint: 'f_' + opId, at: 'now', by: 'd_rules' });
    });
}

{
    suite('X1: the rules - an entry leaves the schedule only in the one write that names its row, after its closed document exists');

    await reseed(envNew);
    const me = as(envNew, ALLOWED);
    await passes('a closure lands, with its closed document', pairWrite(me));
    const stood = async () => { const live = await server(envNew); return [payIds(live), rowsOf(live), live.revision]; };
    const start = await stood();

    await denied('a drop that names NO row is refused', dropWrite(me, { archivedId: null }));
    await denied('a drop naming a closed document that DOES NOT EXIST is refused',
        dropWrite(me, { archivedId: 'ps_ghost', rows: { ps_ghost: ROW }, remove: [] }));
    await denied('and so is one that takes real entries out under that name',
        dropWrite(me, { archivedId: 'ps_ghost', rows: { ps_ghost: ROW } }));
    await denied('a drop from a writer that speaks protocol 1 is refused', dropWrite(me, { protocol: 1 }));
    await denied('two rows in one write are refused', dropWrite(me, { rows: { [KHALED]: ROW, ps_other: ROW } }));
    await denied('pay entries removed with NO row arriving are refused', dropWrite(me, { rows: {} }));
    await denied('a drop that also ADDS a pay entry is refused',
        dropWrite(me, { add: { 'pay.pp_slipped_in': { id: 'pp_slipped_in', kind: 'payment', amount: 1 } } }));
    await denied('a drop that also CHANGES one is refused',
        dropWrite(me, { remove: KHALED_PATHS.filter(path => path !== 'pay.pp_' + KHALED),
            add: { ['pay.pp_' + KHALED]: Object.assign({}, DRAWN.entries['pay.pp_' + KHALED], { amount: 1 }) } }));
    await denied('a stranger may not do it at all', dropWrite(as(envNew, 'stranger@example.com')));
    same('none of those left anything behind: the pay book, the index and the revision are where they were', await stood(), start);

    await passes('THE DROP: the entries leave, the row arrives, the write names it, its closed document already exists', dropWrite(me));
    const after = await server(envNew);
    same('the schedule holds the row and none of the closure\'s entries',
        [payIds(after), rowsOf(after), KHALED_PATHS.map(path => at(after, path)).filter(value => value !== undefined).length, after.archivedId],
        [['po_open'], [KHALED], 0, KHALED]);
    same('and the closed document is byte for byte what it was', canonical((await server(envNew, 'closed', KHALED)).entries), canonical(DRAWN.entries));

    suite('X1: the index only grows');

    const indexed = await stood();
    await denied('a row cannot be REMOVED - by a field path',
        dropWrite(me, { rows: {}, remove: ['payIndex.rows.' + KHALED] }));
    await denied('nor CHANGED', dropWrite(me, { rows: { [KHALED]: Object.assign({}, ROW, { p: 1 }) }, remove: [] }));
    await denied('nor may another pay entry leave under the name of a row that is already there',
        dropWrite(me, { rows: {}, remove: ['pay.po_open'] }));
    await denied('a WHOLE document with no index is refused - protocol 2 and all',
        wholeWrite(me, data => { delete data.payIndex; }));
    await denied('a whole document from a build that knows neither the pay book nor the index (protocol 1) is refused',
        wholeWrite(me, data => { delete data.payIndex; delete data.pay; }, { protocol: 1 }));
    await denied('a whole document that puts the entries BACK is refused (a pay entry arrives with no closed document)',
        wholeWrite(me, data => { KHALED_PATHS.filter(path => path.indexOf('pay.') === 0)
            .forEach(path => { data.pay[path.split('.')[1]] = DRAWN.entries[path]; }); }));
    await denied('ONCE THERE IS AN INDEX a protocol-1 writer may not record even a day', dayWrite(me, '2026-10-18', 1));
    same('none of those moved anything', await stood(), indexed);
    await passes('a protocol-2 day is recorded as ever', dayWrite(me, '2026-10-18', 2));
    await passes('a whole document that carries the index and the pay book as they are - a restore from this build - is accepted',
        wholeWrite(me, data => { data.days['2026-10-19'] = { actual: {} }; }));
    await passes('and the next closure lands: the pay book still grows the way it always did',
        pairWrite(me, { closedId: 'ps_w_other_20261002', entries: { 'pay.ps_w_other_20261002': { id: 'ps_w_other_20261002', kind: 'statement' } } }));
    same('after which the index is exactly what it was', rowsOf(await server(envNew)), [KHALED]);

    await envNew.clearFirestore();
    await denied('a project may not BEGIN with an index',
        wholeWrite(me, data => { data.pay = {}; data.payIndex = { v: 1, rows: { [KHALED]: ROW } }; }));
    await passes('- it begins without one', wholeWrite(me, data => { data.pay = {}; }));
}

{
    suite('X2: the production adapter - the move, confirmed inside its own transaction');

    await reseed(envNew);
    const a = phone('d_xa', envNew);
    const b = phone('d_xb', envNew, { email: SECOND });
    await reached(() => quiet(a) && quiet(b));
    await close(a, 'w_khaled', { allocations: { [K1]: 500, [K2]: 100 } });
    await close(a, 'w_salim', { method: 'transfer' });
    await close(a, 'w_nasser');
    await reached(() => quiet(a) && quiet(b) && payIds(b.State.schedule).length === 7);
    const before = { a: money(a), b: money(b), closed: await names(envNew, 'closed'),
        size: JSON.stringify(await server(envNew)).length };

    // The adapter's own transaction, asked directly to drop Nasser's closure on the
    // strength of documents that do not hold it.
    const ops = adapterFor(as(envNew, ALLOWED), opsOf.new);
    const drawn = a.call('planArchive', a.State.schedule, TODAY).bundles.find(bundle => bundle.rowId === NASSER);
    given('Nasser\'s closure is ready to move', drawn && drawn.state === 'ready', JSON.stringify(drawn && [drawn.state, drawn.why]));
    const envelope = async name => { const live = await server(envNew); return { updatedAt: new Date().toISOString(), updatedBy: 'd_direct',
        protocol: 2, lastOpId: name, opFingerprint: 'f_' + name, revision: live.revision + 1, archivedId: NASSER,
        'payIndex.v': 1, ['payIndex.rows.' + NASSER]: drawn.row }; };
    const tried = async (name, ids) => ops.archiveClosed(await envelope(name), drawn.paths, ids).then(() => 'accepted', error => error.code);
    same('the adapter refuses to drop on the strength of a closed document that does not hold the entries',
        await tried('op_wrong_doc', [SALIM]), 'closed-unconfirmed');
    same('or of one that does not exist', await tried('op_no_doc', ['ps_ghost']), 'closed-unconfirmed');
    same('or of none', await tried('op_none', []), 'no-closed-document');
    same('and nothing left the schedule', [rowsOf(await server(envNew)), payIds(await server(envNew)).length], [[], 7]);

    const result = await a.Sync.archiveClosed({ today: TODAY });
    same('the move: three closures, none failed', [result.ok, result.moved.slice().sort(), result.failed], [true, [KHALED, NASSER, SALIM].sort(), []]);
    await reached(() => quiet(a) && quiet(b) && rowsOf(b.State.schedule).length === 3);
    const live = await server(envNew);
    same('the server\'s schedule names them and holds only the opening', [rowsOf(live), payIds(live),
        Object.keys(live.ledger.advances).filter(id => /^le_(period|close)_/.test(id))], [[KHALED, NASSER, SALIM].sort(), ['po_open'], []]);
    check('it is smaller', JSON.stringify(live).length < before.size, `${before.size} -> ${JSON.stringify(live).length}`);
    same('the closed documents are the ones that were there: nothing created, nothing changed', await names(envNew, 'closed'), before.closed);
    same('the phone that moved them and the phone that watched pay from the same figures as before',
        [money(a) === before.a, money(b) === before.b, money(a) === money(b)], [true, true, true]);
    const again = await b.Sync.archiveClosed({ today: TODAY });
    same('run again from the other phone: nothing to do, and the revision does not move',
        [again.ok, again.moved, (await server(envNew)).revision], [true, [], live.revision]);

    suite('X4: a phone installed after the move, and a restore from this build');

    const fresh = phone('d_xnew', envNew, { storage: {} });
    await reached(() => quiet(fresh));
    same('a phone installed after the move reads the closed documents and holds the whole record',
        [money(fresh) === before.a, canonical(fresh.State.schedule.pay) === canonical(a.State.schedule.pay)], [true, true]);
    const restored = await fresh.Sync.replaceEverything(fresh.call('normaliseSchedule', clone(BASE.schedule)));
    await reached(() => quiet(a) && quiet(b) && quiet(fresh), 30000);
    const kept = await server(envNew);
    same('its whole-document restore, from a file that never held a closure, is ACCEPTED by the real rules - and erases nothing',
        [restored.ok, rowsOf(kept), payIds(kept), await names(envNew, 'closed'), kept.revision > live.revision,
            Boolean(kept.days && kept.days['2026-10-02'])],
        [true, [KHALED, NASSER, SALIM].sort(), ['po_open'], before.closed, true, true]);
    same('and all three phones still pay from the same figures', [money(a) === before.a, money(b) === before.a, money(fresh) === before.a], [true, true, true]);
}

{
    suite('X3: two phones moving the same closures at the same instant');

    await reseed(envNew);
    const a = phone('d_ya', envNew);
    const b = phone('d_yb', envNew, { email: SECOND });
    await reached(() => quiet(a) && quiet(b));
    await close(a, 'w_khaled', { allocations: { [K1]: 500, [K2]: 100 } });
    await close(a, 'w_salim', { method: 'transfer' });
    await reached(() => quiet(a) && quiet(b) && payIds(b.State.schedule).length === 5);
    const before = money(a);
    const [one, two] = await Promise.all([a.Sync.archiveClosed({ today: TODAY }), b.Sync.archiveClosed({ today: TODAY })]);
    await reached(() => quiet(a) && quiet(b) && rowsOf(a.State.schedule).length === 2 && rowsOf(b.State.schedule).length === 2);
    const live = await server(envNew);
    same('both end done; each row is stored once; nothing of either closure is left in the schedule',
        [one.ok, two.ok, rowsOf(live), payIds(live)], [true, true, [KHALED, SALIM].sort(), ['po_open']]);
    same('and both phones pay from the same figures as before', [money(a) === before, money(b) === before], [true, true]);
}

for (const [name, sha] of OLDER) {
    const sources = sourcesOf(name, sha);
    const cell = found[name] = {};

    suite(`X5 / ${name} once a closure has left the schedule`);

    await reseed(envNew);
    const n = phone(`d_zn_${name}`, envNew);
    await reached(() => quiet(n));
    await close(n, 'w_salim', { method: 'transfer' });
    given('this build moves the closure', (await n.Sync.archiveClosed({ today: TODAY })).ok === true);
    const before = await server(envNew);
    const stood = raw => [rowsOf(raw), payIds(raw), raw.revision];

    const old = oldPhone(name, sources, `d_zo_${name}`, envNew);
    await settleUntil(() => old.State.schedule.workers.length > 0 && old.Sync.status === 'synced', 15000, 20);
    // THE HAZARD the rule exists for, measured: this copy of the older build never held
    // the closure, and the schedule no longer carries it.
    cell.readsAsOpen = Object.keys(old.call('closedPeriods', old.State.schedule, 'w_salim')).length === 0;
    check('MEASURED: an older build installed after the move reads that account as never closed', cell.readsAsOpen);
    day(old, 'w_nasser', '2026-10-18');
    await settle(4000);
    const afterDay = await server(envNew);
    cell.dayRefused = !dayOn(afterDay) && canonical(stood(afterDay)) === canonical(stood(before));
    check('so IT MAY NOT WRITE: the day it records does not reach the server, and the revision does not move',
        cell.dayRefused, JSON.stringify([dayOn(afterDay), stood(afterDay)]));
    cell.saysAfterDay = old.Sync.status;
    check('it does not say synced', old.Sync.status !== 'synced', old.Sync.status);
    same('the day is still on that phone', Boolean(old.State.schedule.days['2026-10-18'].actual.w_nasser), true);
    const restoring = old.Sync.replaceEverything(old.call('normaliseSchedule', clone(old.State.schedule)));
    await Promise.race([restoring.catch(() => null), settle(6000)]);
    await settle(1500);
    const afterRestore = await server(envNew);
    cell.restoreRefused = canonical(stood(afterRestore)) === canonical(stood(before));
    check('ITS RESTORE CANNOT ERASE THE INDEX: refused, the rows, the pay book and the revision exactly where they were',
        cell.restoreRefused, JSON.stringify(stood(afterRestore)));
    same('and the closed document is untouched', await names(envNew, 'closed'), [SALIM]);
    same('this build goes on working beside it', await (async () => {
        day(n, 'w_khaled', '2026-10-19');
        await reached(() => n.Sync.pendingCount() === 0 && quiet(n), 20000);
        const live = await server(envNew);
        return [Boolean(live.days['2026-10-19']), rowsOf(live)];
    })(), [true, [SALIM]]);
}

{
    suite('X5: every older build answers the same way');
    same('reads the moved account as open; its day is refused; its restore is refused',
        OLDER.map(([name]) => [found[name].readsAsOpen, found[name].dayRefused, found[name].restoreRefused]), OLDER.map(() => [true, true, true]));
    console.log('\n  measured, per older build: ' + JSON.stringify(found));
}

await envNew.cleanup();
await envOld.cleanup();
report();
