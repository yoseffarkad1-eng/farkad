// tests/months.emulator.test.mjs
//
// PHASE 6 against the real thing: the rules of this branch on the Firestore emulator, the
// PRODUCTION adapter's copyMonth / archiveMonth / readMonth, and three older builds out
// of Git.
//
//   Y1  the production adapter: a month leaves, confirmed inside its own transaction;
//       a phone that watched, a phone installed afterwards, a restore from this build
//   Y2  the rules, written to by hand: what a month document and a drop must carry, and
//       every way of getting one wrong; what no write may do to an archived date
//   Y3  the adapter's own confirmation: a copy that does not hold the days as they are
//   Y4  two phones moving the same months at the same instant
//   Y5  the rules as PUBLISHED TODAY: the move is refused whole and nothing is lost
//   Y6  THE ROLLOUT TABLE: v167, v171 and v172 x the new rules x a document with and
//       without archived months
//   Y7  ten years on: the rules still answer over an index of 120 months and 3,650 dates
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
    FORTNIGHT, WEEK1, WEEK2, TODAY, clone, stamp, canonical, payDevice, world, plan, openBook
} from './paybook.world.mjs';

const EMULATOR = emulatorHost();
const ROOT = sourceRoot();
const git = args => execFileSync('git', ['-C', ROOT].concat(args), { maxBuffer: 64 * 1024 * 1024 });
const NEW_RULES = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
const OLD_RULES = readFileSync(new URL('../docs/firestore.rules.before-paybook', import.meta.url), 'utf8');
const ADAPTER = fileURLToPath(new URL('../js/sync/firebase-adapter.js', import.meta.url));
const CONFIG = fileURLToPath(new URL('../js/sync/_split-test-config.mjs', import.meta.url));
const shimFile = name => fileURLToPath(new URL(`../js/sync/_adapter-months-${name}-test.mjs`, import.meta.url));

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
const OLDER = [['v167', 'a25566f'], ['v171', '0acaceb'], ['v172', MAIN]];
const NEW_HERE = ['js/model/payroll.js', 'js/sync/transact.js', 'js/sync/closed.js',
    'js/model/months.js', 'js/sync/months.js', 'js/cold.js'];
const FLAGS = { paybookQueue: false, months: true };
const SEP = '2026-09';
const OCT = '2026-10';
const NOV = '2026-11';
const LATER = '2027-05-01';
const SCHEDULE = 'scheduleData:v2';

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

{
    suite('what is under test: the shipped adapter, the rules of this branch, and the rules as published today');
    check('the adapter differs from the shipped file in exactly four import specifiers', fourLines(source, rewrite(source)));
    check('the new rules speak of the pay book AND of the months that have left - one file for both',
        /function payGuard\(docId\)/.test(NEW_RULES) && /function archivesOne\(docId\)/.test(NEW_RULES)
        && /function archivesMonth\(docId\)/.test(NEW_RULES) && /function daysGuard\(\)/.test(NEW_RULES)
        && /function monthsNeedPaybook\(\)/.test(NEW_RULES) && /match \/months\/\{monthId\}/.test(NEW_RULES));
    // v187 MOVED: asked of 8c943fa (v172) until the shared rides' block went live; the
    // file is now main's at v186, and it is asked of that commit.
    same('docs/firestore.rules.before-paybook is, byte for byte, the rules main carries at v186 - what is live today',
        OLD_RULES === git(['show', `${RULES_LIVE}:firestore.rules`]).toString('utf8'), true);
    given('the emulator is a local one', /^(127\.0\.0\.1|localhost)$/.test(EMULATOR.host), EMULATOR.host);
}

writeFileSync(CONFIG, 'export const firebaseConfig = { apiKey: "", projectId: "" };\n'
    + 'export const SCHEDULE_DOC_PATH = "schedules/current";\n');
const opsOf = {};
try {
    writeFileSync(shimFile('new'), rewrite(source));
    opsOf.new = (await import('./../js/sync/_adapter-months-new-test.mjs'));
    for (const [name, sha] of OLDER) {
        const old = git(['show', `${sha}:js/sync/firebase-adapter.js`]).toString('utf8');
        given(`${name}'s own adapter is rewritten in its import specifiers only`, fourLines(old, rewrite(old)));
        writeFileSync(shimFile(name), rewrite(old));
        opsOf[name] = await import(`./../js/sync/_adapter-months-${name}-test.mjs`);
    }
} finally {
    ['new'].concat(OLDER.map(one => one[0])).forEach(name => {
        try { unlinkSync(shimFile(name)); } catch (error) { /* best effort */ }
    });
    try { unlinkSync(CONFIG); } catch (error) { /* best effort */ }
}

const { doc, getDoc, getDocs, collection, setDoc, updateDoc, deleteDoc, runTransaction, onSnapshot, FieldPath, deleteField }
    = await import('firebase/firestore');

const envNew = await initializeTestEnvironment({ projectId: 'demo-farkad-months-new',
    firestore: { rules: NEW_RULES, host: EMULATOR.host, port: EMULATOR.port } });
const envOld = await initializeTestEnvironment({ projectId: 'demo-farkad-months-old',
    firestore: { rules: OLD_RULES, host: EMULATOR.host, port: EMULATOR.port } });

const ALLOWED = 'yosef.farkad1@gmail.com';
const SECOND = 'farkad1963@gmail.com';
const as = (env, email) => env.authenticatedContext(email.replace(/[^a-z0-9]/gi, ''), { email }).firestore();
const PATH = ['schedules', 'current'];

// The record of tests/months.test.mjs: the pay book's fortnight, a Rima count inside it,
// a Rima count alone in September, and one November day nobody closes.
const BASE = (() => {
    const first = world();
    openBook(first, undefined, 'd_seed');
    const put = change => given('a base edit is committed', first.State.commit(change) === true, JSON.stringify(change));
    put(first.call('setRimaCount', first.State.schedule, '2026-10-05', 'p_a', 3));
    // v183's second count rides on the same days: «every layer» is measured, not argued.
    put(first.call('setYosefGevesCount', first.State.schedule, '2026-10-05', 'p_a', 4));
    put(first.call('setRimaCount', first.State.schedule, '2026-09-28', 'p_b', 2));
    put(first.call('setYosefGevesCount', first.State.schedule, '2026-09-28', 'p_b', 1));
    put(first.call('assignPlace', first.State.schedule, '2026-11-02', 'w_salim', 'actual', 'p_a', undefined, 0));
    const schedule = clone(first.State.schedule);
    const bare = clone(schedule);
    delete bare.pay;
    return { schedule, bare, wire: first.call('cloudDocument', schedule) };
})();
const WITH_PAY = () => Object.assign(clone(BASE.wire), { protocol: 2, revision: 1, lastOpId: 'op_seed' });
// The document as it is today: no pay book, no index, protocol 1.
const TODAYS = () => { const seed = WITH_PAY(); delete seed.pay; seed.protocol = 1; return seed; };

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
const monthsOut = raw => Object.keys(((raw && raw.monthIndex) || {}).rows || {}).sort();
const daysIn = (raw, month) => Object.keys((raw && raw.days) || {}).filter(date => date.slice(0, 7) === month).sort();
const datesOf = raw => (((raw && raw.monthIndex) || {}).dates || []).length;

function adapterFor(db, module) {
    const ops = module.firestoreOps(db, doc(db, ...PATH), id => doc(db, ...PATH, 'receipts', String(id)),
        id => doc(db, ...PATH, 'closed', String(id)), id => doc(db, ...PATH, 'months', String(id)));
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
    if (typeof ops.archiveMonth === 'function') {
        adapter.copyMonth = (patch, month) => ops.copyMonth(plain(patch), plain(month));
        adapter.archiveMonth = (patch, month, id) => ops.archiveMonth(plain(patch), month, id);
        adapter.readMonth = id => ops.readMonth(id);
    }
    return adapter;
}

function phone(id, env, options = {}) {
    const device = payDevice(Object.assign({ deviceId: id, flags: FLAGS,
        storage: options.storage || { [SCHEDULE]: JSON.stringify(BASE.schedule) } }, options));
    device.Sync.pushDelayMs = 5;
    device.State.load();
    device.Sync.connect(adapterFor(as(env, options.email || ALLOWED), opsOf.new));
    return device;
}
// AN OLDER BUILD'S OWN COPY NEVER HELD «עובדי יוסף גבס» (v183): it drops the layer from what
// it adopts and reads a disk that holds one as damaged (tests/yosefgeves.test.mjs). The
// record these suites start from carries the count since Phase 8, so the copy handed to
// an older phone - its disk, and the file it restores - is that record less the layer.
// The SERVER's documents keep it; that is what the newer phones in this file measure.
const withoutSecondCount = record => {
    const out = clone(record);
    Object.keys(out.days || {}).forEach(date => { delete out.days[date].yosefGeves; });
    return out;
};
function oldPhone(name, sources, id, env, storage) {
    const device = makeDevice({ sources, appVersion: name, deviceId: id, storage });
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
const day = (device, worker, date) => given(`a day is recorded (${worker} ${date})`,
    device.State.commit(device.call('assignPlace', device.State.schedule, date, worker, 'actual', 'p_a', undefined, 0)) === true);

async function close(device, worker, period, hour = '10') {
    const draw = paid => plan(device, 'planClosure', worker, period,
        Object.assign({ method: 'cash' }, paid === null ? {} : { paid, paidOn: TODAY }), stamp(TODAY, device.id, hour));
    const first = draw(null);
    given(`the closure of ${worker} is allowed`, first.ok === true, JSON.stringify(first.reasons));
    const answer = await device.Sync.transactPaybook(draw(first.review.netDue));
    given(`the closure of ${worker} is on the server`, answer.state === 'closed', JSON.stringify(answer));
}
// Every man's October closed and paid in full, through the real door.
async function closeAll(device) {
    await close(device, 'w_khaled', FORTNIGHT);
    await close(device, 'w_salim', FORTNIGHT);
    await close(device, 'w_nasser', FORTNIGHT);
    await close(device, 'w_ahmad', WEEK1);
    await close(device, 'w_ahmad', WEEK2, '11');
    await reached(() => quiet(device));
}

async function passes(name, promise) {
    try { await assertSucceeds(promise); check(name, true); }
    catch (error) { check(name, false, String(error.message || error).slice(0, 200)); }
}
async function denied(name, promise) {
    try { await assertFails(promise); check(name, true); }
    catch (error) { check(name, false, String(error.message || error).slice(0, 200)); }
}

const RANGE = ['2026-09-01', '2026-11-30'];
const figures = device => {
    const S = device.State.schedule;
    return canonical({
        payroll: device.call('payrollReport', S, RANGE[0], RANGE[1]),
        invoice: device.call('invoiceReport', S, RANGE[0], RANGE[1]),
        each: S.workers.map(man => device.call('workerDaysReport', S, man, RANGE[0], RANGE[1])),
        rima: device.call('rimaReport', S, RANGE[0], RANGE[1]),
        geves: device.call('yosefGevesReport', S, RANGE[0], RANGE[1]),
        days: S.days
    });
};

// A helper device for the model's own functions (the document, the row, the calendar).
const model = payDevice({ storage: { [SCHEDULE]: JSON.stringify(BASE.schedule) }, deviceId: 'd_model', flags: FLAGS });
model.State.load();

// A month copy written by hand: the envelope, its receipt and the month document - one
// transaction, with every field a test may want to get wrong.
let seq = 0;
function copyWrite(db, month, days, options = {}) {
    seq += 1;
    const opId = `op_mcopy_${seq}`;
    return runTransaction(db, async tx => {
        const snap = await tx.get(doc(db, ...PATH));
        const revision = snap.data().revision + 1;
        const made = model.call('monthDocument', month, days, options.docOp || opId,
            options.docRevision === undefined ? revision : options.docRevision);
        const data = clone(Object.assign(made, options.data || {}));
        const id = options.id || `${data.month}_${data.digest}`;
        if (options.scheduleWrite !== false) {
            tx.update(doc(db, ...PATH), new FieldPath('updatedAt'), '2027-05-01T10:00:00.000Z', new FieldPath('updatedBy'), 'd_rules',
                new FieldPath('protocol'), options.protocol === undefined ? 2 : options.protocol, new FieldPath('revision'), revision,
                new FieldPath('lastOpId'), opId, new FieldPath('opFingerprint'), 'f_' + opId);
            tx.set(doc(db, ...PATH, 'receipts', opId), { revision, opFingerprint: 'f_' + opId, at: 'now', by: 'd_rules' });
        }
        tx.set(doc(db, ...PATH, 'months', id), data);
        return id;
    });
}
// A drop written by hand: every part of it optional, to get one wrong.
function dropWrite(db, month, docId, options = {}) {
    seq += 1;
    const opId = `op_mdrop_${seq}`;
    return runTransaction(db, async tx => {
        const snap = await tx.get(doc(db, ...PATH));
        const live = snap.data();
        const revision = live.revision + 1;
        const copy = (await tx.get(doc(db, ...PATH, 'months', options.readDoc || docId))).data() || { days: {}, dates: [] };
        const fields = { updatedAt: '2027-05-01T12:00:00.000Z', updatedBy: 'd_rules',
            protocol: options.protocol === undefined ? 2 : options.protocol, revision, lastOpId: opId, opFingerprint: 'f_' + opId };
        if (options.archivedMonth !== null) fields.archivedMonth = options.archivedMonth || month;
        if (options.monthDoc !== null) fields.monthDoc = options.monthDoc || docId;
        const args = [];
        Object.keys(fields).forEach(path => args.push(new FieldPath(path), fields[path]));
        const row = Object.assign({ d: docId, h: copy.digest, n: Object.keys(copy.days).length }, options.row || {});
        const rows = options.rows === undefined ? { [month]: row } : options.rows;
        Object.keys(rows).forEach(key => args.push(new FieldPath('monthIndex', 'rows', key), rows[key]));
        const already = ((live.monthIndex || {}).dates || []);
        args.push(new FieldPath('monthIndex', 'dates'), options.dates === undefined ? already.concat(copy.dates) : options.dates(already, copy.dates));
        (options.remove === undefined ? Object.keys(copy.days) : options.remove)
            .forEach(date => args.push(new FieldPath('days', date), deleteField()));
        Object.keys(options.add || {}).forEach(path => args.push(new FieldPath(...path.split('.')), options.add[path]));
        tx.update(doc(db, ...PATH), ...args);
        tx.set(doc(db, ...PATH, 'receipts', opId), { revision, opFingerprint: 'f_' + opId, at: 'now', by: 'd_rules' });
    });
}
// An ordinary field-path write, with its receipt.
function pathWrite(db, changes, options = {}) {
    seq += 1;
    const opId = `op_path_${seq}`;
    return runTransaction(db, async tx => {
        const snap = await tx.get(doc(db, ...PATH));
        const revision = snap.data().revision + 1;
        const fields = Object.assign({ updatedAt: '2027-05-02T10:00:00.000Z', updatedBy: 'd_rules',
            protocol: options.protocol === undefined ? 2 : options.protocol, revision, lastOpId: opId, opFingerprint: 'f_' + opId }, changes);
        const args = [];
        Object.keys(fields).forEach(path => args.push(new FieldPath(...path.split('.')), fields[path] === undefined ? deleteField() : fields[path]));
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
        const data = clone(snap.data());
        change(data);
        Object.assign(data, { updatedAt: '2027-05-02T11:00:00.000Z', updatedBy: 'd_rules', revision: snap.data().revision + 1,
            lastOpId: opId, opFingerprint: 'f_' + opId, protocol: options.protocol === undefined ? 2 : options.protocol });
        tx.set(doc(db, ...PATH), data);
        tx.set(doc(db, ...PATH, 'receipts', opId), { revision: data.revision, opFingerprint: 'f_' + opId, at: 'now', by: 'd_rules' });
    });
}

// ------------------------------------------------------------------------------------
let wholeFigures = null;
{
    suite('Y1: the production adapter - a month leaves, confirmed inside its own transaction');

    await reseed(envNew);
    const a = phone('d_ya', envNew);
    const b = phone('d_yb', envNew, { email: SECOND });
    await reached(() => quiet(a) && quiet(b));
    await closeAll(a);
    await reached(() => quiet(b) && Object.keys(b.State.schedule.pay || {}).length === Object.keys(a.State.schedule.pay || {}).length);
    wholeFigures = figures(a);
    given('both phones read the same before', figures(b) === wholeFigures);
    const before = await server(envNew);

    const answer = await a.Sync.archiveMonths({ today: LATER, only: [SEP] });
    await reached(() => quiet(a) && quiet(b) && monthsOut(b.State.schedule).length === 1);
    const live = await server(envNew);
    same('September leaves through the real adapter under the real rules', [answer.ok, answer.moved, answer.failed], [true, [SEP], []]);
    same('THE SERVER\'S DOCUMENT holds no day of it, a row for it, and its thirty calendar dates',
        [daysIn(live, SEP), monthsOut(live), datesOf(live), daysIn(live, OCT).length], [[], [SEP], 30, 12]);
    const docs = await names(envNew, 'months');
    same('one month document, named by month and digest', [docs.length, docs[0].slice(0, 8), docs[0] === live.monthIndex.rows[SEP].d], [1, SEP + '_', true]);
    const held = await server(envNew, 'months', docs[0]);
    same('holding the month\'s days exactly as the schedule held them - the Rima count included',
        [canonical(held.days) === canonical(model.call('monthDaysOf', before, SEP)), held.days['2026-09-28'].rima.p_b, held.month], [true, 2, SEP]);
    same('and v183\'s second count, «עובדי יוסף גבס», beside it under its own layer - through the real adapter',
        held.days['2026-09-28'].yosefGeves, { p_b: 1 });
    same('and it is a document this build reads back: its digest is the digest of its days after the round trip through Firestore',
        model.call('monthDocumentProblems', docs[0], held), []);
    same('both phones hold every day and read every report as before', [figures(a) === wholeFigures, figures(b) === wholeFigures], [true, true]);

    const fresh = phone('d_yfresh', envNew, { storage: {}, email: SECOND });
    await reached(() => quiet(fresh));
    same('A PHONE INSTALLED AFTERWARDS fetches the month document and reads the same', [figures(fresh) === wholeFigures, monthsOut(fresh.State.schedule)], [true, [SEP]]);

    // An edit of the archived day never leaves the phone; a day in an open month does.
    same('an edit of an archived day is refused on the phone', a.State.commit(a.call('setRimaCount', a.State.schedule, '2026-09-28', 'p_b', 9)), false);
    day(b, 'w_khaled', '2026-11-03');
    await reached(() => quiet(b) && quiet(a) && Boolean(a.State.schedule.days['2026-11-03']));
    same('and a day in a month that has not left is recorded by a protocol-2 phone as ever', Boolean((await server(envNew)).days['2026-11-03']), true);

    // A restore from this build, of a file from before the move.
    const file = clone(BASE.schedule);
    file.days['2026-09-28'].rima.p_b = 1;        // the file disagrees with the archive
    const result = await b.Sync.replaceEverything(b.call('normaliseSchedule', file));
    await reached(() => quiet(a) && quiet(b));
    const after = await server(envNew);
    same('A RESTORE FROM THIS BUILD is accepted by the real rules, and the archived month is exactly what it was',
        [result.ok, monthsOut(after), daysIn(after, SEP), datesOf(after), await names(envNew, 'months'),
            a.State.schedule.days['2026-09-28'].rima.p_b, b.State.schedule.days['2026-09-28'].rima.p_b],
        [true, [SEP], [], 30, docs, 2, 2]);
}

// ------------------------------------------------------------------------------------
{
    suite('Y2: the rules, written to by hand - October, with September already out');

    const db = as(envNew, ALLOWED);
    const live0 = await server(envNew);
    const oct = model.call('monthDaysOf', live0, OCT);
    given('October is whole in the live document', Object.keys(oct).length === 12);

    // the month document
    await denied('REFUSED: a month document created ALONE, with no schedule write', copyWrite(db, OCT, oct, { scheduleWrite: false }));
    await denied('REFUSED: one that names another operation', copyWrite(db, OCT, oct, { docOp: 'op_other' }));
    await denied('REFUSED: one that names another revision', copyWrite(db, OCT, oct, { docRevision: 1 }));
    await denied('REFUSED: one filed under a name its month and digest do not give it', copyWrite(db, OCT, oct, { id: '2026-10_0000000000000000' }));
    await denied('REFUSED: one from a protocol-1 writer', copyWrite(db, OCT, oct, { protocol: 1 }));
    await denied('REFUSED: one holding a day that is not among its dates', copyWrite(db, OCT, Object.assign({}, oct, { '2026-11-02': live0.days['2026-11-02'] })));
    await denied('REFUSED: one with no day in it', copyWrite(db, OCT, {}));
    await denied('REFUSED: a stranger', copyWrite(envNew.authenticatedContext('stranger', { email: 'someone@example.com' }).firestore(), OCT, oct));
    let octId = null;
    await passes('ACCEPTED: the copy, in a commit that moves the revision and changes no business field',
        copyWrite(db, OCT, oct).then(id => { octId = id; }));
    const afterCopy = await server(envNew);
    same('the schedule still holds every day of October, and the index is unchanged', [daysIn(afterCopy, OCT).length, monthsOut(afterCopy)], [12, [SEP]]);
    await denied('REFUSED: changing a month document', updateDoc(doc(db, ...PATH, 'months', octId), { n: 1 }));
    await denied('REFUSED: deleting one', deleteDoc(doc(db, ...PATH, 'months', octId)));
    await denied('REFUSED: a stranger reading one', getDoc(doc(envNew.authenticatedContext('stranger', { email: 'someone@example.com' }).firestore(), ...PATH, 'months', octId)));

    // a second, stale copy: October as it was before somebody changed one count
    const stale = clone(oct);
    stale['2026-10-05'].rima.p_a = 1;
    let staleId = null;
    await passes('ACCEPTED: a second copy of the same month with different days - named by content, it collides with nothing',
        copyWrite(db, OCT, stale).then(id => { staleId = id; }));

    // the drop
    const all = Object.keys(oct);
    await denied('REFUSED: a drop that names a month document that does not exist', dropWrite(db, OCT, '2026-10_ffffffffffffffff', { readDoc: octId }));
    await denied('REFUSED: a drop from a protocol-1 writer', dropWrite(db, OCT, octId, { protocol: 1 }));
    await denied('REFUSED: a drop that does not name its month', dropWrite(db, OCT, octId, { archivedMonth: null }));
    await denied('REFUSED: a drop that does not name its document', dropWrite(db, OCT, octId, { monthDoc: null }));
    await denied('REFUSED: a drop whose row names another document than the write does', dropWrite(db, OCT, octId, { row: { d: staleId } }));
    await denied('REFUSED: a drop whose row carries another digest than the document', dropWrite(db, OCT, octId, { row: { h: '0000000000000000' } }));
    await denied('REFUSED: a drop on the strength of a document of ANOTHER month', dropWrite(db, OCT, live0.monthIndex.rows[SEP].d));
    await denied('REFUSED: A DROP THAT LEAVES ONE OF THE COPY\'S DAYS BEHIND', dropWrite(db, OCT, octId, { remove: all.slice(1) }));
    await denied('REFUSED: A DROP THAT TAKES A DAY THE COPY DOES NOT HOLD', dropWrite(db, OCT, octId, { remove: all.concat(['2026-11-02']) }));
    await denied('REFUSED: a drop that removes no day at all', dropWrite(db, OCT, octId, { remove: [] }));
    await denied('REFUSED: a drop that also changes a day', dropWrite(db, OCT, octId, { add: { 'days.2026-11-02.rima.p_a': 4 } }));
    await denied('REFUSED: a drop that also adds a day', dropWrite(db, OCT, octId, { add: { 'days.2026-11-20': { plan: {}, actual: {} } } }));
    await denied('REFUSED: a drop that adds no dates', dropWrite(db, OCT, octId, { dates: already => already }));
    await denied('REFUSED: a drop that adds only some of the document\'s dates', dropWrite(db, OCT, octId, { dates: (already, mine) => already.concat(mine.slice(0, 20)) }));
    await denied('REFUSED: a drop that adds dates the document does not list', dropWrite(db, OCT, octId, { dates: (already, mine) => already.concat(mine.slice(0, 30)).concat(['2026-11-30']) }));
    await denied('REFUSED: a drop that takes an earlier date away', dropWrite(db, OCT, octId, { dates: (already, mine) => already.slice(1).concat(mine).concat(['2026-12-01']) }));
    await denied('REFUSED: two rows at once', dropWrite(db, OCT, octId, { rows: { [OCT]: { d: octId, h: 'x', n: 12 }, [NOV]: { d: 'y', h: 'y', n: 1 } } }));
    await denied('REFUSED: a drop that also rewrites the row of a month already out', dropWrite(db, OCT, octId, { rows: { [OCT]: { d: octId, h: 'x', n: 12 }, [SEP]: { d: 'y', h: 'y', n: 1 } } }));
    await denied('REFUSED: a stranger', dropWrite(envNew.authenticatedContext('stranger', { email: 'someone@example.com' }).firestore(), OCT, octId));
    const untouched = await server(envNew);
    same('after all of that the schedule is exactly where the copy left it', [daysIn(untouched, OCT).length, monthsOut(untouched), datesOf(untouched), untouched.revision],
        [12, [SEP], 30, afterCopy.revision + 1]);

    await passes('ACCEPTED: the drop - the days leave, the row and the dates arrive', dropWrite(db, OCT, octId));
    const out = await server(envNew);
    same('October is out: no day of it in the schedule, sixty-one dates in the index', [daysIn(out, OCT), monthsOut(out), datesOf(out), daysIn(out, NOV).length > 0], [[], [SEP, OCT], 61, true]);

    // what no write may do afterwards
    await denied('REFUSED: a field-path write to a day of an archived month', pathWrite(db, { 'days.2026-10-05.rima.p_a': 6 }));
    await denied('REFUSED: a field-path write of «עובדי יוסף גבס» (v183) to a day of an archived month', pathWrite(db, { 'days.2026-10-05.yosefGeves.p_a': 6 }));
    await denied('REFUSED: a field-path write to a date of that month that held nothing', pathWrite(db, { 'days.2026-10-20.actual.w_salim': { entries: [] } }));
    await denied('REFUSED: removing a row', pathWrite(db, { ['monthIndex.rows.' + OCT]: undefined }));
    await denied('REFUSED: changing a row', pathWrite(db, { ['monthIndex.rows.' + OCT + '.n']: 3 }));
    await denied('REFUSED: shortening the list of dates', pathWrite(db, { 'monthIndex.dates': out.monthIndex.dates.slice(0, 40) }));
    await denied('REFUSED: adding a row with no archive behind it', pathWrite(db, { ['monthIndex.rows.' + NOV]: { d: 'x', h: 'y', n: 1 } }));
    await denied('REFUSED: A WHOLE DOCUMENT THAT PUTS AN ARCHIVED DAY BACK', wholeWrite(db, data => { data.days['2026-10-05'] = oct['2026-10-05']; }));
    await denied('REFUSED: a whole document with no month index', wholeWrite(db, data => { delete data.monthIndex; }));
    await denied('REFUSED: a whole document that takes a row away', wholeWrite(db, data => { delete data.monthIndex.rows[OCT]; }));
    await denied('REFUSED: a day recorded by a protocol-1 writer once a month has left', pathWrite(db, { 'days.2026-11-09.actual.w_salim': { entries: [] } }, { protocol: 1 }));
    await denied('REFUSED: a whole document from a protocol-1 writer that knows neither the pay book nor the months',
        wholeWrite(db, data => { delete data.monthIndex; delete data.pay; delete data.payIndex; }, { protocol: 1 }));
    await passes('ACCEPTED: a protocol-2 day in a month that has not left', pathWrite(db, { 'days.2026-11-09.actual.w_salim': { entries: [] } }));
    await passes('ACCEPTED: a whole document that carries the index and the open months as they are', wholeWrite(db, () => undefined));
    const end = await server(envNew);
    same('and the archive is exactly what it was', [monthsOut(end), datesOf(end), daysIn(end, OCT), (await names(envNew, 'months')).length], [[SEP, OCT], 61, [], 3]);

    await envNew.clearFirestore();
    const born = Object.assign(clone(end), { revision: 1, lastOpId: 'op_born', opFingerprint: 'f_born' });
    delete born.pay; delete born.payIndex;
    await denied('REFUSED: a project created with a month index', runTransaction(db, async tx => {
        tx.set(doc(db, ...PATH), born);
        tx.set(doc(db, ...PATH, 'receipts', 'op_born'), { revision: 1, opFingerprint: 'f_born', at: 'now', by: 'd_rules' });
    }));
}

// ------------------------------------------------------------------------------------
{
    suite('Y3: the adapter\'s own confirmation - the VALUES, which the rules cannot compare');

    await reseed(envNew);
    const a = phone('d_y3', envNew);
    await reached(() => quiet(a));
    await closeAll(a);
    const db = as(envNew, ALLOWED);
    const live = await server(envNew);
    const oct = model.call('monthDaysOf', live, OCT);
    const stale = clone(oct);
    stale['2026-10-05'].rima.p_a = 1;            // the same dates, one value different
    const staleId = await copyWrite(db, OCT, stale);
    const adapter = adapterFor(db, opsOf.new);
    const envelope = id => ({ updatedAt: new Date().toISOString(), updatedBy: 'd_y3x', protocol: 2, lastOpId: 'op_y3_' + (seq += 1),
        opFingerprint: 'f', archivedMonth: OCT, monthDoc: id, 'monthIndex.v': 1,
        ['monthIndex.rows.' + OCT]: { d: id, h: id.slice(8), n: 12 } });
    const tried = async id => {
        const now = await server(envNew);
        return adapter.archiveMonth(Object.assign(envelope(id), { revision: now.revision + 1 }), OCT, id).then(() => 'accepted', error => error.code);
    };
    same('THE PRODUCTION ADAPTER REFUSES A DROP ON A COPY WHOSE DAYS ARE NOT THE SCHEDULE\'S, inside the transaction: nothing is written',
        [await tried(staleId), daysIn(await server(envNew), OCT).length, monthsOut(await server(envNew))], ['month-unconfirmed', 12, []]);
    same('and one that names a document that does not exist', await tried('2026-10_ffffffffffffffff'), 'month-unconfirmed');
    // By hand, past the adapter: the stale copy has the right DATES, and the rules cannot
    // compare values. This is the limit of what the server enforces, measured.
    let byHand = 'accepted';
    try { await dropWrite(db, OCT, staleId); } catch (error) { byHand = String(error.code || error.message); }
    same('SAID PLAINLY, AND MEASURED: the rules compare the dates of the days that leave, not their values - a drop written by hand, around the adapter, on that copy is',
        byHand, 'accepted');
}

// ------------------------------------------------------------------------------------
{
    suite('Y4: two phones moving the same months at the same instant');

    await reseed(envNew);
    const a = phone('d_y4a', envNew);
    const b = phone('d_y4b', envNew, { email: SECOND });
    await reached(() => quiet(a) && quiet(b));
    await closeAll(a);
    await reached(() => quiet(b) && Object.keys(b.State.schedule.pay || {}).length === Object.keys(a.State.schedule.pay || {}).length);
    const whole = figures(a);
    const [one, two] = await Promise.all([a.Sync.archiveMonths({ today: LATER }), b.Sync.archiveMonths({ today: LATER })]);
    await reached(() => quiet(a) && quiet(b) && monthsOut(a.State.schedule).length === 2 && monthsOut(b.State.schedule).length === 2, 30000);
    const live = await server(envNew);
    same('both end with both months out: one row each, sixty-one dates, no day of either in the schedule',
        [one.ok, two.ok, monthsOut(live), datesOf(live), daysIn(live, SEP).concat(daysIn(live, OCT))], [true, true, [SEP, OCT], 61, []]);
    same('one month document per month', (await names(envNew, 'months')).map(id => id.slice(0, 7)), [SEP, OCT]);
    same('and both phones hold the whole record', [figures(a) === whole, figures(b) === whole], [true, true]);
}

// ------------------------------------------------------------------------------------
{
    suite('Y5: under the rules as PUBLISHED TODAY the move is refused whole, and nothing is lost');

    // The pay book cannot exist under those rules through this build's door, so the
    // closures are seeded as a document: what matters here is only what the month move does.
    await reseed(envNew);
    const seedPhone = phone('d_y5seed', envNew);
    await reached(() => quiet(seedPhone));
    await closeAll(seedPhone);
    const closed = await server(envNew);
    await envOld.clearFirestore();
    await envOld.withSecurityRulesDisabled(async ctx => { await setDoc(doc(ctx.firestore(), ...PATH), closed); });
    const a = payDevice({ deviceId: 'd_y5', flags: FLAGS, storage: seedPhone.dump() });
    a.Sync.pushDelayMs = 5;
    a.State.load();
    a.Sync.connect(adapterFor(as(envOld, ALLOWED), opsOf.new));
    await reached(() => quiet(a));
    const answer = await a.Sync.archiveMonths({ today: LATER });
    const live = await server(envOld);
    same('the copy is refused (those rules have no months/), so nothing ever reaches the drop',
        [answer.ok, answer.moved, answer.failed.map(one => one.reason), monthsOut(live), daysIn(live, OCT).length, (await names(envOld, 'months')).length],
        [false, [], ['server'], [], 12, 0]);
    day(a, 'w_khaled', '2026-11-04');
    await reached(() => quiet(a));
    same('and the phone goes on recording under them', Boolean((await server(envOld)).days['2026-11-04']), true);
}

// ------------------------------------------------------------------------------------
const found = {};
for (const [name, sha] of OLDER) {
    const sources = sourcesOf(name, sha);
    const cell = found[name] = {};

    suite(`Y6 / ${name} x the new rules x TODAY'S document (no pay book, no month out): publishing the rules first`);
    await reseed(envNew, TODAYS());
    const first = oldPhone(name, sources, `d_r1_${name}`, envNew, { [SCHEDULE]: JSON.stringify(withoutSecondCount(BASE.bare)) });
    await reached(() => first.Sync.status === 'synced', 15000, 20);
    day(first, 'w_nasser', '2026-11-10');
    await reached(() => first.Sync.pendingCount() === 0 && first.Sync.status === 'synced', 15000, 20);
    const one = await server(envNew);
    cell.recordsToday = Boolean(one.days['2026-11-10']);
    check('it RECORDS A DAY', cell.recordsToday, first.Sync.status);
    const file = withoutSecondCount(BASE.bare);
    file.days['2026-11-02'].actual.w_salim.entries[0].placeId = 'p_b';
    const restored = await Promise.race([first.Sync.replaceEverything(first.call('normaliseSchedule', file)).catch(error => ({ ok: false, error })), settle(8000).then(() => ({ ok: false, timeout: true }))]);
    await settle(500);
    const two = await server(envNew);
    cell.restoresToday = restored.ok === true && two.days['2026-11-02'].actual.w_salim.entries[0].placeId === 'p_b';
    check('it RESTORES', cell.restoresToday, JSON.stringify(restored).slice(0, 200));

    suite(`Y6 / ${name} x the new rules x a document with months out`);
    await reseed(envNew);
    const n = phone(`d_r2n_${name}`, envNew);
    await reached(() => quiet(n));
    await closeAll(n);
    given('this build moves the months', (await n.Sync.archiveMonths({ today: LATER })).ok === true);
    await reached(() => quiet(n));
    const before = await server(envNew);
    const stood = raw => [monthsOut(raw), datesOf(raw), daysIn(raw, OCT), raw.revision];

    // A phone that held the whole record on the older build all along.
    const old = oldPhone(name, sources, `d_r2o_${name}`, envNew, { [SCHEDULE]: JSON.stringify(withoutSecondCount(BASE.bare)) });
    await reached(() => old.Sync.status === 'synced' || old.Sync.status === 'error', 15000, 20);
    await settle(500);
    cell.statusOnOpen = old.Sync.status;
    cell.octoberDaysAfterAdopting = daysIn(old.State.schedule, OCT).length;
    check('MEASURED: an older build that adopts the document LOSES the archived months from its own copy - it reads October as empty',
        cell.octoberDaysAfterAdopting === 0, String(cell.octoberDaysAfterAdopting));
    day(old, 'w_nasser', '2026-11-11');
    await settle(4000);
    const afterDay = await server(envNew);
    cell.dayRefused = !(afterDay.days['2026-11-11']) && canonical(stood(afterDay)) === canonical(stood(before));
    check('so IT MAY NOT WRITE: the day it records does not reach the server, and the revision does not move', cell.dayRefused, JSON.stringify(stood(afterDay)));
    check('it does not say synced', old.Sync.status !== 'synced', old.Sync.status);
    same('the day is still on that phone', Boolean(old.State.schedule.days['2026-11-11'].actual.w_nasser), true);
    const restoring = old.Sync.replaceEverything(old.call('normaliseSchedule', withoutSecondCount(BASE.bare)));
    await Promise.race([restoring.catch(() => null), settle(6000)]);
    await settle(1500);
    const afterRestore = await server(envNew);
    cell.restoreRefused = canonical(stood(afterRestore)) === canonical(stood(before));
    check('ITS RESTORE - a whole document holding October again, and no index - IS REFUSED: the index, the dates, the days and the revision exactly where they were',
        cell.restoreRefused, JSON.stringify(stood(afterRestore)));
    same('and the month documents are untouched', (await names(envNew, 'months')).map(id => id.slice(0, 7)), [SEP, OCT]);
    same('this build goes on working beside it', await (async () => {
        day(n, 'w_khaled', '2026-11-12');
        await reached(() => n.Sync.pendingCount() === 0 && quiet(n), 20000);
        const live = await server(envNew);
        return [Boolean(live.days['2026-11-12']), monthsOut(live)];
    })(), [true, [SEP, OCT]]);
}

{
    suite('Y6: every older build answers the same way');
    same('today\'s document under the new rules: records, restores. With months out: reads them as empty, its day refused, its restore refused',
        OLDER.map(([name]) => [found[name].recordsToday, found[name].restoresToday, found[name].octoberDaysAfterAdopting, found[name].dayRefused, found[name].restoreRefused]),
        OLDER.map(() => [true, true, 0, true, true]));
    console.log('\n  measured, per older build: ' + JSON.stringify(found));
}

// ------------------------------------------------------------------------------------
{
    suite('Y7: ten years on - the rules still answer over an index of 120 months and their 3,652 dates');

    // The list of dates is what daysGuard asks, on EVERY write, for as long as the app
    // lives. A rule that works over sixty-one dates and is refused for its cost over
    // three thousand would stop every phone on some ordinary morning years from now.
    const seed = WITH_PAY();
    const index = { v: 1, rows: {}, dates: [] };
    for (let n = 0; n < 120; n += 1) {
        const month = `${2014 + Math.floor(n / 12)}-${String((n % 12) + 1).padStart(2, '0')}`;
        index.rows[month] = { d: `${month}_0123456789abcdef`, h: '0123456789abcdef', n: 26, b: 34000, at: '2026-01-01T00:00:00.000Z' };
        index.dates = index.dates.concat(clone(model.call('monthCalendar', month)));
    }
    seed.monthIndex = index;
    await reseed(envNew, seed);
    const db = as(envNew, ALLOWED);
    same('the index holds ten years', [Object.keys(index.rows).length, index.dates.length], [120, 3652]);
    await passes('ACCEPTED: an ordinary day, in a month that has not left', pathWrite(db, { 'days.2026-11-09.actual.w_salim': { entries: [] } }));
    await denied('REFUSED: a write to a date ten years back', pathWrite(db, { 'days.2014-03-05.actual.w_salim': { entries: [] } }));
    await denied('REFUSED: a write to the last archived date', pathWrite(db, { 'days.2023-12-31.rima.p_a': 2 }));
    await passes('ACCEPTED: a whole document that carries that index as it is', wholeWrite(db, () => undefined));
    await denied('REFUSED: a whole document that adds a day ten years back', wholeWrite(db, data => { data.days['2015-06-01'] = { plan: {}, actual: {} }; }));
    // And the 121st month leaves, through the production adapter.
    const a = phone('d_y7', envNew, { storage: {} });
    await settle(1500);
    same('MEASURED: a phone handed an index it has no month documents for does not adopt, and says what it waits for',
        [a.State.schedule.workers.length, (a.Sync.closedWaiting() || { months: [] }).months.length], [0, 120]);
}

await envNew.cleanup();
await envOld.cleanup();
report();
