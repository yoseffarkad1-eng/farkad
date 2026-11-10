// The pay book against a REAL Firestore: the unchanged rules, and the production adapter.
//
//   firebase emulators:exec --project demo-farkad --only firestore "node tests/paybook.emulator.test.mjs"
//
// tests/paybook.sync.test.mjs asks its questions of a fake cloud that this repository
// wrote. This file asks the ones that matter most again of the two things it did not
// write: firestore.rules, loaded UNCHANGED off the disk, and js/sync/firebase-adapter.js,
// the one file that knows Firebase exists, talking to the local emulator. Never the real
// project: the project id is a demo one and the only host is loopback.
//
//   R   THE RULES, as they are published in this repository today.
//       Do they accept an update that adds `pay.<id>` field paths - from an account on the
//       allowlist, from one that is not, from nobody? And what do they NOT refuse: a pay
//       entry rewritten, a pay entry deleted, a whole document written without the map?
//       Those last three are pinned as «TODAY» - they are what a later phase's rules
//       change has to close, and what this build closes on the client alone.
//
//   A   THE PRODUCTION ADAPTER, carrying a closure batch.
//       One closure is one transaction at one revision. Two phones closing the same man
//       and period at once, with the same choices: exactly one statement, one payment,
//       one deduction per advance. With a different paid amount: the server's copy is
//       never overwritten, the loser is held and not stopped. With different deductions:
//       the ledger's rule, the loser stopped, no double deduction. A write built on a
//       stale revision is rebased when it collides with nothing, and held when it does.
//
// MOVED AT v175, deliberately - WHICH RULES THIS FILE LOADS. It loaded firestore.rules,
// "unchanged", and its premise was that those rules know nothing of the pay book. v175
// changes the rules (payGuard, closed/): a pay path arriving by the ordinary update - the
// only way this suite sends one - is now refused outright, which is the point of that
// change and is measured in tests/paybook.split.emulator.test.mjs. What THIS suite
// measures is still worth having, and still true of what is PUBLISHED: the rules every
// phone is running against today, and what the ordinary queue does to a closure under
// them. So it loads those rules by name - docs/firestore.rules.before-paybook, the
// rollback artifact, asserted there to be byte for byte what main carries - and every
// «TODAY» below is about them. Nothing else in the file moved.
//
// Synthetic data only.

import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { settle, settleUntil } from './harness.mjs';
import { suite, check, same, given, report } from './runner.mjs';
import { emulatorHost } from './emulator-host.mjs';
import {
    FORTNIGHT, TODAY, clone, stamp, canonical, payDevice, world, advancesOf, plan, openBook, bookOf
} from './paybook.world.mjs';

const EMULATOR = emulatorHost();
const RULES_FILE = fileURLToPath(new URL('../docs/firestore.rules.before-paybook', import.meta.url));
const ADAPTER = fileURLToPath(new URL('../js/sync/firebase-adapter.js', import.meta.url));
const SHIM = fileURLToPath(new URL('../js/sync/_adapter-paybook-test.mjs', import.meta.url));
const CONFIG = fileURLToPath(new URL('../js/sync/_paybook-test-config.mjs', import.meta.url));

const source = readFileSync(ADAPTER, 'utf8');
const rewritten = source
    .replace('"https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js"', '"firebase/app"')
    .replace('"https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js"', '"firebase/auth"')
    .replace('"https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js"', '"firebase/firestore"')
    .replace("from './firebase-config.js'", "from './_paybook-test-config.mjs'");

{
    suite('the module under test is the shipped adapter, and the rules are the file as it stands');
    const before = source.split('\n');
    const after = rewritten.split('\n');
    const moved = before.map((line, at) => (line === after[at] ? null : at)).filter(at => at !== null);
    given('the same number of lines', before.length === after.length, `${before.length} vs ${after.length}`);
    check('exactly four lines differ, and every one is an import specifier',
        moved.length === 4 && moved.every(at => before[at].indexOf('gstatic.com') !== -1
            || before[at].indexOf("from './firebase-config.js'") !== -1),
        JSON.stringify(moved.map(at => before[at].trim().slice(0, 50))));
    check('no real project credential travels into the module under test',
        rewritten.indexOf("from './firebase-config.js'") === -1);
    // The rules know nothing about the pay book. That is the premise of section R, so it
    // is checked rather than assumed: the day somebody adds a `pay` rule, R's «TODAY»
    // checks are the ones that must move, and this is what says so first.
    const rules = readFileSync(RULES_FILE, 'utf8');
    check('the published rules (docs/firestore.rules.before-paybook) do not mention the pay book at all - they are what every earlier build ran against',
        !/\bpay\b|paybook|payConflicted/.test(rules.replace(/\/\/.*$/gm, '')));
    given('the emulator is a local one', /^(127\.0\.0\.1|localhost)$/.test(EMULATOR.host), EMULATOR.host);
}

writeFileSync(CONFIG, 'export const firebaseConfig = { apiKey: "", projectId: "" };\n'
    + 'export const SCHEDULE_DOC_PATH = "schedules/current";\n');
writeFileSync(SHIM, rewritten);
let firestoreOps;
try {
    ({ firestoreOps } = await import('./../js/sync/_adapter-paybook-test.mjs'));
} finally {
    try { unlinkSync(SHIM); } catch (error) { /* best effort */ }
    try { unlinkSync(CONFIG); } catch (error) { /* best effort */ }
}

const { doc, getDoc, setDoc, updateDoc, deleteField, runTransaction, onSnapshot } = await import('firebase/firestore');

const env = await initializeTestEnvironment({
    projectId: 'demo-farkad-paybook',
    firestore: { rules: readFileSync(RULES_FILE, 'utf8'), host: EMULATOR.host, port: EMULATOR.port }
});

const ALLOWED = 'yosef.farkad1@gmail.com';
const as = email => env.authenticatedContext(email.replace(/[^a-z0-9]/gi, ''), { email }).firestore();
const anonymous = () => env.unauthenticatedContext().firestore();
const PATH = ['schedules', 'current'];

// ONE RECORD everybody starts from - see BASE in tests/paybook.sync.test.mjs.
const BASE = (() => {
    const first = world({ advances: [['w_khaled', '2026-10-03', 500], ['w_khaled', '2026-10-06', 400]] });
    openBook(first, undefined, 'd_seed');
    const schedule = clone(first.State.schedule);
    return { schedule, wire: first.call('cloudDocument', schedule), advances: advancesOf(first, 'w_khaled'), calc: first };
})();
const [K1, K2] = BASE.advances;
const SEED = () => Object.assign(clone(BASE.wire), { protocol: 1, revision: 1, lastOpId: 'op_seed' });
// (`protocol: 1` on the seed is what a document written before v175 carries. This build
// sends 2 since v175; the published rules ask only for one or more.)

async function reseed() {
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async ctx => { await setDoc(doc(ctx.firestore(), ...PATH), SEED()); });
}
const readDoc = async () => {
    let held = null;
    await env.withSecurityRulesDisabled(async ctx => {
        const snap = await getDoc(doc(ctx.firestore(), ...PATH));
        held = snap.exists() ? snap.data() : null;
    });
    return held;
};
const receiptCount = async () => {
    const { collection, getDocs } = await import('firebase/firestore');
    let count = 0;
    await env.withSecurityRulesDisabled(async ctx => {
        count = (await getDocs(collection(ctx.firestore(), ...PATH, 'receipts'))).size;
    });
    return count;
};

function adapterFor(db) {
    const ops = firestoreOps(db, doc(db, ...PATH), id => doc(db, ...PATH, 'receipts', String(id)));
    const plain = value => JSON.parse(JSON.stringify(value));
    return {
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
}

function phone(id, options = {}) {
    const device = payDevice(Object.assign({ deviceId: id,
        storage: { 'scheduleData:v2': JSON.stringify(BASE.schedule) } }, options));
    device.Sync.pushDelayMs = 5;
    device.State.load();
    if (options.connect !== false) device.Sync.connect(adapterFor(as(ALLOWED)));
    return device;
}
const payIds = source => Object.keys((source && source.pay) || {}).sort();
const closureEntries = raw => Object.keys(((raw || {}).ledger || {}).advances || {})
    .filter(id => /^le_(period|close)_/.test(id)).sort();
const khaled = (device, choices = {}, hour = '10') => plan(device, 'planClosure', 'w_khaled', FORTNIGHT,
    Object.assign({ allocations: { [K1]: 500, [K2]: 100 }, paid: 2000, paidOn: TODAY, method: 'cash' }, choices),
    stamp(TODAY, device.id, hour));
const commit = (device, drawn, what) => {
    given(`${what} is allowed`, drawn.ok === true, JSON.stringify(drawn.reasons));
    given(`${what} is committed`, device.State.commitPaybook(drawn.changes).ok === true);
    return drawn;
};
const KHALED_PAY = ['po_open', 'pp_ps_w_khaled_20261002', 'ps_w_khaled_20261002'];
const owed = devices => devices.reduce((sum, device) => sum + device.Sync.pendingCount(), 0);

// A BARRIER THAT TIMED OUT SAYS SO. settleUntil answers false when the state never came,
// and everything asserted after a discarded false is measured on a state that did not
// arrive - on the one kind of suite where two real clients meet. So the answer is read,
// here, once, for every wait in this file: a wait that gave up stops the run and names
// the condition it was waiting for.
async function reached(ready, limit, step) {
    const arrived = await settleUntil(ready, limit, step);
    if (!arrived) throw new Error('a barrier timed out waiting for: ' + String(ready).replace(/\s+/g, ' ').slice(0, 200));
}

async function passes(name, promise) {
    try { await assertSucceeds(promise); check(name, true); }
    catch (error) { check(name, false, String(error.message || error).slice(0, 160)); }
}
async function denied(name, promise) {
    try { await assertFails(promise); check(name, true); }
    catch (error) { check(name, false, String(error.message || error).slice(0, 160)); }
}

// A statement and a payment as the planner draws them, for the raw-rules section.
const DRAWN = (() => {
    const d = payDevice({ storage: { 'scheduleData:v2': JSON.stringify(BASE.schedule) }, deviceId: 'd_rules' });
    d.State.load();
    const drawn = khaled(d);
    if (drawn.ok !== true) throw new Error('the fixture closure was refused: ' + JSON.stringify(drawn.reasons));
    const patch = {};
    drawn.changes.forEach(change => { patch[change.path] = clone(change.value); });
    return { changes: drawn.changes, patch };
})();
// The ordering envelope a protocol write carries, written by hand - this section is about
// the RULES, so the fixture is the smallest thing they accept (tests/rules.test.mjs).
let opSeq = 0;
async function protocolUpdate(db, patch) {
    const snapshot = await getDoc(doc(db, ...PATH));
    const revision = ((snapshot.data() || {}).revision || 0) + 1;
    const opId = `op_rules_${opSeq += 1}`;
    const print = `f_${opId}`;
    return runTransaction(db, async transaction => {
        transaction.update(doc(db, ...PATH), Object.assign({}, patch,
            { protocol: 1, revision, lastOpId: opId, opFingerprint: print, updatedAt: new Date().toISOString() }));
        transaction.set(doc(db, ...PATH, 'receipts', opId),
            { opFingerprint: print, revision, at: new Date().toISOString(), by: 'd_rules' });
    });
}

// ==================================================================================== R
{
    suite('R: the UNCHANGED rules and a write that adds pay.<id> field paths');

    await reseed();
    await passes('an account on the allowlist: a protocol update adding the closure\'s six field paths is ACCEPTED',
        protocolUpdate(as(ALLOWED), DRAWN.patch));
    const landed = await readDoc();
    same('and the document then holds the statement and the payment beside the opening', payIds(landed), KHALED_PAY);
    same('exactly as they were sent', canonical(landed.pay.ps_w_khaled_20261002),
        canonical(DRAWN.patch['pay.ps_w_khaled_20261002']));

    await reseed();
    await denied('an account that is signed in and NOT on the allowlist: the same write is refused',
        protocolUpdate(as('somebody.else@gmail.com'), DRAWN.patch));
    await denied('and so is the bare update, without the read a transaction would make first',
        updateDoc(doc(as('somebody.else@gmail.com'), ...PATH), Object.assign({}, DRAWN.patch,
            { protocol: 1, revision: 2, lastOpId: 'op_x', opFingerprint: 'f_x', updatedAt: new Date().toISOString() })));
    await denied('nobody at all (not signed in): refused',
        updateDoc(doc(anonymous(), ...PATH), Object.assign({}, DRAWN.patch,
            { protocol: 1, revision: 2, lastOpId: 'op_y', opFingerprint: 'f_y', updatedAt: new Date().toISOString() })));
    await denied('nor may either of them read the document', getDoc(doc(anonymous(), ...PATH)));
    same('none of the three refused writes left a pay entry behind', payIds(await readDoc()), ['po_open']);

    await denied('an allowlisted write that speaks NO protocol is refused on a document that has one - an old build cannot add a pay entry by the back door',
        updateDoc(doc(as(ALLOWED), ...PATH), Object.assign({}, DRAWN.patch, { updatedAt: new Date().toISOString() })));
    const staleDb = as(ALLOWED);
    await denied('an allowlisted write at a STALE revision is refused',
        runTransaction(staleDb, async transaction => {
            transaction.update(doc(staleDb, ...PATH), Object.assign({}, DRAWN.patch,
                { protocol: 1, revision: 1, lastOpId: 'op_stale', opFingerprint: 'f_stale', updatedAt: new Date().toISOString() }));
            transaction.set(doc(staleDb, ...PATH, 'receipts', 'op_stale'),
                { opFingerprint: 'f_stale', revision: 1, at: 'x', by: 'd_rules' });
        }));
    same('and neither of those two left a pay entry behind', payIds(await readDoc()), ['po_open']);

    // WHAT THE RULES DO NOT REFUSE. They look at who writes, at the envelope and at the
    // receipt, and at nothing inside the document - so "append-only" is a promise the
    // CLIENT keeps (the journal, the pre-send hold) and the server does not.
    suite('R: what the unchanged rules do NOT enforce about the pay book - TODAY');
    await reseed();
    await protocolUpdate(as(ALLOWED), DRAWN.patch);
    const rewrittenPayment = Object.assign({}, DRAWN.patch['pay.pp_ps_w_khaled_20261002'], { amount: 9999 });
    await passes('TODAY: an allowlisted account may REWRITE an existing pay entry - the rules accept it',
        protocolUpdate(as(ALLOWED), { 'pay.pp_ps_w_khaled_20261002': rewrittenPayment }));
    same('TODAY: and the server then holds the rewritten amount', (await readDoc()).pay.pp_ps_w_khaled_20261002.amount, 9999);
    await passes('TODAY: an allowlisted account may DELETE a pay entry - the rules accept it',
        protocolUpdate(as(ALLOWED), { 'pay.pp_ps_w_khaled_20261002': deleteField() }));
    same('TODAY: and it is gone from the server', payIds(await readDoc()), ['po_open', 'ps_w_khaled_20261002']);
    const bare = SEED();
    delete bare.pay;
    await passes('TODAY: a whole-document write that carries no `pay` at all is accepted - which is what a restore from an older build sends',
        (async () => {
            const db = as(ALLOWED);
            const revision = (await getDoc(doc(db, ...PATH))).data().revision + 1;
            await runTransaction(db, async transaction => {
                transaction.set(doc(db, ...PATH), Object.assign({}, bare,
                    { revision, lastOpId: 'op_whole', opFingerprint: 'f_whole', updatedAt: new Date().toISOString() }));
                transaction.set(doc(db, ...PATH, 'receipts', 'op_whole'),
                    { opFingerprint: 'f_whole', revision, at: 'x', by: 'd_rules' });
            });
        })());
    same('TODAY: and the pay book is then gone from the server entirely', (await readDoc()).pay, undefined);
}

// ==================================================================================== A1
{
    suite('A1: the production adapter carries a closure as ONE transaction');

    await reseed();
    const a = phone('d_e1');
    await reached(() => a.Sync.status === 'synced', 15000, 40);
    const before = { revision: (await readDoc()).revision, receipts: await receiptCount() };
    commit(a, khaled(a, { extras: [{ amount: 150, category: 'agreed', reason: 'ציוד' }] }), 'the closure');
    await reached(() => a.Sync.pendingCount() === 0 && a.Sync.status === 'synced', 20000, 40);
    await settle(300);
    const cloud = await readDoc();
    same('all seven entries of the closure are on the server',
        [payIds(cloud), closureEntries(cloud).length],
        [KHALED_PAY.concat(['pd_w_khaled_20261002_1']).sort(), 3]);
    same('they arrived at ONE revision, with ONE receipt: a single transaction',
        [cloud.revision - before.revision, (await receiptCount()) - before.receipts], [1, 1]);
    same('byte for byte what the phone committed', canonical(cloud.pay), bookOf(a));
    same('the phone is synced and owes nothing', [a.Sync.status, a.Sync.pendingCount(), a.call('farkadWritesBlocked')], ['synced', 0, false]);
}

// ==================================================================================== A2
{
    suite('A2: two phones close the same man and period at once, with the SAME choices');

    await reseed();
    const a = phone('d_e2a');
    const b = phone('d_e2b');
    await reached(() => a.Sync.status === 'synced' && b.Sync.status === 'synced', 15000, 40);

    commit(a, khaled(a, {}, '10'), 'the closure on A');
    commit(b, khaled(b, {}, '11'), 'the same closure on B');
    await reached(() => owed([a, b]) === 0 && bookOf(a) === bookOf(b) && payIds(a.State.schedule).length === 3, 25000, 40);
    await settle(500);

    const cloud = await readDoc();
    same('EXACTLY ONE STATEMENT and one payment on the server', payIds(cloud), KHALED_PAY);
    same('one frozen payslip and one deduction per advance', closureEntries(cloud).length, 3);
    same('NO DOUBLE DEDUCTION: 500 and 100 came off, once', [K1, K2].map(id => BASE.calc.call('advanceOutstanding', cloud, id).deducted), [500, 100]);
    same('one payment of 2,000 counted', BASE.calc.call('paybookFold', cloud).statements.ps_w_khaled_20261002.paid, 2000);
    same('the statement and its payment carry ONE signer - whoever the server heard first',
        new Set([cloud.pay.ps_w_khaled_20261002.by, cloud.pay.pp_ps_w_khaled_20261002.by]).size, 1);
    same('both phones hold the server\'s copy', [bookOf(a), bookOf(b)], [canonical(cloud.pay), canonical(cloud.pay)]);
    same('NOBODY IS HELD: nothing pending, nothing contested, nothing beside, no Recovery problem, not blocked',
        [a, b].map(d => [d.Sync.pendingCount(), d.Sync.heldRecords().length, d.State.schedule.payConflicted,
            d.State.schedule.ledger.conflicted, d.global('Recovery').problems.length, d.call('farkadWritesBlocked')]),
        Array(2).fill([0, 0, undefined, undefined, 0, false]));
}

// ==================================================================================== A3
{
    suite('A3: two phones close the same man and period at once, with a DIFFERENT paid amount');

    await reseed();
    const a = phone('d_e3a');
    const b = phone('d_e3b');
    await reached(() => a.Sync.status === 'synced' && b.Sync.status === 'synced', 15000, 40);

    commit(a, khaled(a, { paid: 2000 }), 'the closure on A, 2,000 handed over');
    commit(b, khaled(b, { paid: 3000 }), 'the same closure on B, 3,000 handed over');
    await reached(() => a.Sync.heldRecords().length + b.Sync.heldRecords().length === 1, 25000, 40);
    await settle(800);

    const cloud = await readDoc();
    const stood = cloud.pay.pp_ps_w_khaled_20261002.amount;
    given('the server kept one of the two amounts', stood === 2000 || stood === 3000, String(stood));
    const [winner, loser] = stood === 2000 ? [a, b] : [b, a];
    const lost = stood === 2000 ? 3000 : 2000;
    console.log(`        the server heard ${winner.id} first: its ${stood} stands`);

    same('exactly one statement and one payment on the server', payIds(cloud), KHALED_PAY);
    same('the winner\'s payment is the server\'s, signed by the winner', cloud.pay.pp_ps_w_khaled_20261002.by, winner.id);
    same('THE LOSER HOLDS THE SERVER\'S COPY as the entry that stands, and its own beside it',
        [loser.State.schedule.pay.pp_ps_w_khaled_20261002.amount,
            (loser.State.schedule.payConflicted || {}).pp_ps_w_khaled_20261002.map(body => body.amount)], [stood, [lost]]);
    same('its write is held by name, with both sides', loser.Sync.heldRecords().map(row => [row.path, row.mine.amount, row.cloud.amount]),
        [['pay.pp_ps_w_khaled_20261002', lost, stood]]);
    same('THE LOSER IS NOT STOPPED: no Recovery problem, writing not blocked, status contested',
        [loser.global('Recovery').problems.length, loser.call('farkadWritesBlocked'), loser.Sync.status], [0, false, 'contested']);
    same('the winner is untouched', [winner.Sync.heldRecords().length, winner.State.schedule.payConflicted, winner.call('farkadWritesBlocked')],
        [0, undefined, false]);
    same('one deduction per advance on the server - the two closures\' ledger halves were one fact',
        [closureEntries(cloud).length, [K1, K2].map(id => BASE.calc.call('advanceOutstanding', cloud, id).deducted)], [3, [500, 100]]);

    // And everything the loser does afterwards: the server's payment is never overwritten.
    given('the loser records a day', loser.State.commit(loser.call('assignPlace', loser.State.schedule, '2026-10-18', 'w_nasser', 'actual', 'p_a')) === true);
    await reached(async () => Boolean(((await readDoc()).days['2026-10-18'] || {}).actual), 20000, 60);
    await settle(600);
    const later = await readDoc();
    same('its day reaches the server, and the payment there is still the winner\'s amount',
        [Boolean(later.days['2026-10-18'].actual.w_nasser), later.pay.pp_ps_w_khaled_20261002.amount, later.pay.pp_ps_w_khaled_20261002.by],
        [true, stood, winner.id]);
}

// ==================================================================================== A4
{
    suite('A4: two phones close the same man and period at once, with DIFFERENT deductions');

    await reseed();
    const a = phone('d_e4a');
    const b = phone('d_e4b');
    await reached(() => a.Sync.status === 'synced' && b.Sync.status === 'synced', 15000, 40);

    commit(a, khaled(a, { allocations: { [K1]: 500, [K2]: 100 } }), 'the closure on A: 500 and 100');
    commit(b, khaled(b, { allocations: { [K1]: 300, [K2]: 300 } }), 'the closure on B: 300 and 300');
    await reached(() => a.call('farkadWritesBlocked') || b.call('farkadWritesBlocked'), 25000, 40);
    await settle(800);

    const cloud = await readDoc();
    const split = [K1, K2].map(id => BASE.calc.call('advanceOutstanding', cloud, id).deducted);
    given('the server kept one of the two splits whole', canonical(split) === canonical([500, 100]) || canonical(split) === canonical([300, 300]),
        JSON.stringify(split));
    const [winner, loser] = split[0] === 500 ? [a, b] : [b, a];
    console.log(`        the server heard ${winner.id} first: its split ${JSON.stringify(split)} stands`);

    same('EXACTLY ONE STATEMENT, one payment, one payslip and one deduction per advance on the server',
        [payIds(cloud), closureEntries(cloud).length], [KHALED_PAY, 3]);
    same('NO DOUBLE DEDUCTION: 600 came off in all, once', split[0] + split[1], 600);
    same('the statement on the server agrees with the ledger entries beside it - one closure, the winner\'s, whole',
        [cloud.pay.ps_w_khaled_20261002.by, cloud.pay.ps_w_khaled_20261002.advanceDeductions.map(row => row.amount),
            BASE.calc.call('paybookFold', cloud).held], [winner.id, split, []]);
    same('THE LOSER IS STOPPED BY RECOVERY, as a ledger disagreement always was',
        [loser.call('farkadWritesBlocked'), loser.global('Recovery').problems.map(problem => problem.key)],
        [true, ['scheduleData:v2:ledger:conflict']]);
    same('with both bodies of each disputed deduction kept, and both statements',
        [Object.keys(loser.State.schedule.ledger.conflicted || {}).length,
            ((loser.State.schedule.payConflicted || {}).ps_w_khaled_20261002 || []).length], [2, 1]);
    same('the winner is untouched', [winner.call('farkadWritesBlocked'), winner.State.schedule.payConflicted, winner.Sync.heldRecords().length],
        [false, undefined, 0]);

    // Acknowledged, the loser writes again - and still nothing of its closure lands.
    const frozen = [canonical(cloud.pay), canonical(Object.fromEntries(closureEntries(cloud).map(id => [id, cloud.ledger.advances[id]])))];
    loser.global('Recovery').acknowledge();
    given('the loser records a day after acknowledging', loser.State.commit(
        loser.call('assignPlace', loser.State.schedule, '2026-10-18', 'w_nasser', 'actual', 'p_a')) === true);
    await reached(async () => Boolean(((await readDoc()).days['2026-10-18'] || {}).actual), 20000, 60);
    await settle(800);
    const later = await readDoc();
    same('after the acknowledgement its day goes out, and the closure on the server is entry for entry the winner\'s',
        [canonical(later.pay), canonical(Object.fromEntries(closureEntries(later).map(id => [id, later.ledger.advances[id]])))], frozen);
}

// ==================================================================================== A5
{
    suite('A5: a write built on a stale revision is rebased when it collides with nothing');

    await reseed();
    const a = phone('d_e5a');
    const b = phone('d_e5b');
    await reached(() => a.Sync.status === 'synced' && b.Sync.status === 'synced', 15000, 40);
    commit(a, khaled(a), 'Khaled\'s closure on A');
    await reached(() => owed([a, b]) === 0 && payIds(b.State.schedule).length === 3, 20000, 40);
    const before = (await readDoc()).revision;

    // At the same moment, on the same base revision: a payment on one phone, a different
    // man's closure on the other, a day on each. Four writers' worth of paths, none shared.
    const later = plan(a, 'planPayment', 'ps_w_khaled_20261002', 800, { paymentId: 'pp_atonce000001', date: TODAY }, stamp(TODAY, a.id));
    commit(a, later, 'a later payment on A');
    commit(b, plan(b, 'planClosure', 'w_salim', FORTNIGHT, { paid: 3600, paidOn: TODAY, method: 'transfer' }, stamp(TODAY, b.id)), 'Salim\'s closure on B');
    given('a day on each', a.State.commit(a.call('assignPlace', a.State.schedule, '2026-10-18', 'w_nasser', 'actual', 'p_a')) === true
        && b.State.commit(b.call('assignPlace', b.State.schedule, '2026-10-19', 'w_nasser', 'actual', 'p_b')) === true);
    await reached(() => owed([a, b]) === 0 && bookOf(a) === bookOf(b) && payIds(a.State.schedule).length === 6, 25000, 40);
    await settle(500);

    const cloud = await readDoc();
    same('everything from both phones is on the server',
        [payIds(cloud), Boolean(cloud.days['2026-10-18'].actual.w_nasser), Boolean(cloud.days['2026-10-19'].actual.w_nasser)],
        [KHALED_PAY.concat(['pp_atonce000001', 'pp_ps_w_salim_20261002', 'ps_w_salim_20261002']).sort(), true, true]);
    check('the server\'s revision moved once per accepted transaction - no write went round the compare-and-set',
        cloud.revision > before && (await receiptCount()) >= cloud.revision - 1, `${before} -> ${cloud.revision}`);
    same('nobody is held, nothing is beside, both phones hold the server\'s book',
        [a, b].map(d => [d.Sync.heldRecords().length, d.State.schedule.payConflicted, d.call('farkadWritesBlocked'), bookOf(d) === canonical(cloud.pay)]),
        Array(2).fill([0, undefined, false, true]));
    same('Khaled is owed 1,000 on both, and Salim nothing',
        [a, b].map(d => ['w_khaled', 'w_salim'].map(id => d.call('accountFor', d.State.schedule, id, TODAY).wageDue)), [[1000, 0], [1000, 0]]);
}

// ==================================================================================== L
{
    suite('L: the document-size limit, asked of the emulator itself');

    // tests/paybook.store.test.mjs weighs a year of closures by Firestore's documented
    // count and finds it over 1 MiB. Whether a document that size is actually REFUSED is
    // a separate fact, and the emulator is the nearest thing to the server this
    // repository may talk to - so it is asked, and the answer is pinned: the limit is
    // real, it is enforced on the write, and what it refuses is the whole schedule.
    await env.clearFirestore();
    const big = SEED();
    big.pay = {};
    const filler = 'x'.repeat(1000);
    for (let n = 0; n < 1200; n += 1) big.pay['pp_fill' + String(n).padStart(8, '0')] = { note: filler };
    let refused = null;
    await env.withSecurityRulesDisabled(async ctx => {
        try { await setDoc(doc(ctx.firestore(), ...PATH), big); refused = false; }
        catch (error) { refused = String(error.code || error.message || error).slice(0, 80); }
    });
    console.log(`        a document of about 1.2 MiB written to the emulator: ${refused === false ? 'ACCEPTED' : 'refused (' + refused + ')'}`);
    same('A SCHEDULE DOCUMENT OVER 1 MiB IS REFUSED BY FIRESTORE - with rules off, so it is the store and not a rule',
        refused, 'invalid-argument');
    same('and nothing of it was stored', await readDoc(), null);
    // Just under the line it is taken - so the refusal above is the size and nothing else.
    const under = SEED();
    under.pay = {};
    for (let n = 0; n < 900; n += 1) under.pay['pp_fill' + String(n).padStart(8, '0')] = { note: filler };
    let took = null;
    await env.withSecurityRulesDisabled(async ctx => {
        try { await setDoc(doc(ctx.firestore(), ...PATH), under); took = true; }
        catch (error) { took = String(error.code || error.message || error).slice(0, 80); }
    });
    same('a document of about 0.9 MiB is accepted', took, true);
}

await env.cleanup();
report();
