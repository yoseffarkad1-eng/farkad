// The rollout order, MEASURED. Eight cells, and the answer is read off them.
//
//   firebase emulators:exec --only firestore "node tests/rollout-matrix.test.mjs"
//
// or, on a private port so it can run beside another emulator job - copy firebase.json to
// firebase.rollout.json, change the three ports, and set singleProjectMode false, since
// this suite deliberately uses two projects:
//
//   FIRESTORE_EMULATOR_HOST=127.0.0.1:8231 npx firebase emulators:exec --only firestore \
//     --project demo-rollout-order --config firebase.rollout.json \
//     "node tests/rollout-matrix.test.mjs"
//
// The rules the emulator loads from firebase.json are NOT what this suite measures: it
// loads both rule sets itself, one per project, through initializeTestEnvironment.
//
// Three documents disagreed about the order of the rollout. docs/rollout-checklist.md
// asked the operator to update all three phones and wait for «מסונכרן» BEFORE publishing
// the rules; docs/firebase-setup.md said an updated phone is REFUSED by the published
// rules. Both cannot be true: the checklist demanded a state its own step forbids. The
// disagreement was settled in prose three times and it stayed, because prose is not
// evidence.
//
// So this suite does not argue. It builds the whole space:
//
//   client    the OLD write path (the adapter at ae6e4cd^, before the protocol) and the
//             NEW one (the PRODUCTION js/sync/firebase-adapter.js, imported here with
//             only its import specifiers rewritten, exactly as tests/cas.emulator.test.mjs
//             does it and asserted the same way)
//   rules     the OLD published shape (docs/firestore.rules.rollback) and the NEW one
//             (firestore.rules)
//   document  a LEGACY document - a real roster, real days, a real advance, and not one
//             ordering field - and one that has ALREADY entered the protocol, carrying a
//             revision and its receipt
//
// Eight cells, one operation each: record one day for one worker, the way that client
// records it. Every cell prints what the server actually answered.
//
// Two questions hang off the matrix and are asked here as well, because the answer to
// each of them is a line in a runbook somebody executes alone:
//
//   ROLLING BACK. Republishing the old rules over a document that has entered the
//   protocol - what can an old phone then do to it?
//
//   PENDING. Is a write still sitting in the outbox evidence that it never reached the
//   server? The server accepts, the answer is lost on the way back. What does the phone
//   believe, and what does the next attempt find?
//
// Nothing here touches the real project. The emulator's port comes from
// FIRESTORE_EMULATOR_HOST so this suite can be run on a private port beside the others.

import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { suite, check, given, report } from './runner.mjs';

const HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
const [EMU_HOST, EMU_PORT] = [HOST.split(':')[0], Number(HOST.split(':')[1])];

const NEW_RULES = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
const OLD_RULES = readFileSync(new URL('../docs/firestore.rules.rollback', import.meta.url), 'utf8');

// ------------------------------------------------------------------ the new client
//
// The shipped module, with four import specifiers moved and nothing else - and the move
// is asserted, because a test that quietly edits the code it is testing proves nothing.
const ADAPTER = fileURLToPath(new URL('../js/sync/firebase-adapter.js', import.meta.url));
const SHIM = fileURLToPath(new URL('./_rollout-adapter.mjs', import.meta.url));
const CONFIG = fileURLToPath(new URL('./_rollout-config.mjs', import.meta.url));

const source = readFileSync(ADAPTER, 'utf8');
const rewritten = source
    .replace('"https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js"', '"firebase/app"')
    .replace('"https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js"', '"firebase/auth"')
    .replace('"https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js"', '"firebase/firestore"')
    .replace("from './firebase-config.js'", "from './_rollout-config.mjs'");

{
    suite('the new client under test is the shipped client');

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
        rewritten.indexOf("from './firebase-config.js'") === -1
        && rewritten.indexOf("from './_rollout-config.mjs'") !== -1,
        'config import redirected');
    check('and the write path itself is untouched',
        rewritten.indexOf('transaction.set(receiptRef(payload.lastOpId), {') !== -1
        && rewritten.indexOf("error.code = 'conflict';") !== -1,
        'receipt write and conflict branch present verbatim');
}

writeFileSync(CONFIG, 'export const firebaseConfig = { apiKey: "", projectId: "" };\n'
    + 'export const SCHEDULE_DOC_PATH = "schedules/current";\n');
writeFileSync(SHIM, rewritten);
let firestoreOps;
try {
    ({ firestoreOps } = await import('./_rollout-adapter.mjs'));
} finally {
    try { unlinkSync(SHIM); } catch (error) { /* best effort */ }
    try { unlinkSync(CONFIG); } catch (error) { /* best effort */ }
}

const { doc, getDoc, setDoc, updateDoc, FieldPath } = await import('firebase/firestore');

// ------------------------------------------------------------------ the old client
//
// Copied from `git show ae6e4cd^:js/sync/firebase-adapter.js` - the write path as it was
// before the ordering protocol, which is what a phone still on v86 is running. One
// updateDoc with the changed field path and a timestamp; no protocol, no revision, no
// operation id, no receipt, no transaction.
function oldPatchToUpdateArgs(patch) {
    const args = [];
    Object.keys(patch).forEach(path => {
        args.push(new FieldPath(...path.split('.')), patch[path]);
    });
    return args;
}
const oldClientOps = scheduleRef => ({
    update: patch => updateDoc(scheduleRef, ...oldPatchToUpdateArgs(patch)),
    save: data => setDoc(scheduleRef, data)
});

// ----------------------------------------------------------------- the environments
//
// One emulator, two projects. Rules are per project, so the old and the new shape are
// both live at once and no cell has to wait for a redeploy.
const ALLOWED = 'yosef.farkad1@gmail.com';
const PATH = ['schedules', 'current'];

const envNew = await initializeTestEnvironment({
    projectId: 'farkad-order-newrules',
    firestore: { rules: NEW_RULES, host: EMU_HOST, port: EMU_PORT }
});
const envOld = await initializeTestEnvironment({
    projectId: 'farkad-order-oldrules',
    firestore: { rules: OLD_RULES, host: EMU_HOST, port: EMU_PORT }
});

const asUser = env => env.authenticatedContext(
    ALLOWED.replace(/[^a-z0-9]/gi, ''), { email: ALLOWED }).firestore();

const newOpsFor = db => firestoreOps(
    db, doc(db, ...PATH), opId => doc(db, ...PATH, 'receipts', String(opId)));

// THE DEPLOYED SHAPE: a roster, days worked, an advance, and not one ordering field.
const LEGACY = () => ({
    schemaVersion: 2,
    workers: [
        { id: 'w_01', name: 'דוד', active: true, dailyRate: 400, hourlyRate: 50 },
        { id: 'w_02', name: 'שרה', active: true, dailyRate: 350, hourlyRate: 0 }
    ],
    places: [{ id: 'p_01', name: 'הרצליה', active: true }],
    days: {
        '2026-08-10': { actual: { w_01: { entries: [{ placeId: 'p_01' }] } } }
    },
    advances: { a_01: { id: 'a_01', workerId: 'w_01', date: '2026-08-10', amount: 500, note: '' } },
    updatedAt: '2026-08-11T18:00:00.000Z',
    updatedBy: 'd_old'
});

// THE SAME DOCUMENT, one bootstrap later: in the protocol, with the receipt that put it
// there. Nothing a person recorded is different.
const PROTOCOL = () => Object.assign(LEGACY(), {
    protocol: 1,
    revision: 4,
    lastOpId: 'op_seed',
    opFingerprint: 'f_seed',
    updatedAt: '2026-08-11T18:05:00.000Z',
    updatedBy: 'd_new'
});

async function seed(env, shape) {
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async ctx => {
        const db = ctx.firestore();
        await setDoc(doc(db, ...PATH), shape);
        if (shape.revision) {
            await setDoc(doc(db, ...PATH, 'receipts', shape.lastOpId), {
                revision: shape.revision,
                opFingerprint: shape.opFingerprint,
                at: shape.updatedAt,
                by: shape.updatedBy
            });
        }
    });
}

const readDoc = async env => {
    let held = null;
    await env.withSecurityRulesDisabled(async ctx => {
        const snap = await getDoc(doc(ctx.firestore(), ...PATH));
        held = snap.exists() ? snap.data() : null;
    });
    return held;
};

const readReceipt = async (env, opId) => {
    let held = null;
    await env.withSecurityRulesDisabled(async ctx => {
        const snap = await getDoc(doc(ctx.firestore(), ...PATH, 'receipts', opId));
        held = snap.exists() ? snap.data() : null;
    });
    return held;
};

// The one shape every cell reports: did it land, and if not what did the server say.
const attempt = async run => {
    try {
        const value = await run();
        return { ok: true, code: '', value };
    } catch (error) {
        return {
            ok: false,
            code: (error && typeof error.code === 'string' && error.code) || 'no-code',
            message: (error && error.message) || ''
        };
    }
};

const DAY = '2026-08-12';
const DAY_PATH = `days.${DAY}.actual.w_01`;
const DAY_VALUE = { entries: [{ placeId: 'p_01' }] };

const oldEdit = db => oldClientOps(doc(db, ...PATH)).update({
    [DAY_PATH]: DAY_VALUE,
    updatedAt: new Date().toISOString(),
    updatedBy: 'd_old'
});

// The new client's ordinary edit, at whatever revision the document is actually on. On a
// legacy document there is no revision, so the adapter's own compare-and-set computes
// base 0 and the only revision it will send is 1 - which is what a business write looks
// like when it is sent before the bootstrap.
const newEdit = (db, revision, opId) => newOpsFor(db).update({
    [DAY_PATH]: DAY_VALUE,
    protocol: 1,
    revision,
    lastOpId: opId,
    opFingerprint: `f_${opId}`,
    updatedAt: new Date().toISOString(),
    updatedBy: 'd_new'
});

const newBootstrap = (db, opId) => newOpsFor(db).bootstrap({
    protocol: 1,
    lastOpId: opId,
    updatedAt: new Date().toISOString(),
    updatedBy: 'd_new'
});

// Every cell is recorded here as well as checked, so the suite can print the matrix it
// was written to produce rather than leaving it to be reassembled from PASS lines.
const cells = [];
const cell = (client, rules, document, outcome, detail) => {
    cells.push({ client, rules, document, outcome, detail });
};

// =================================================================== THE EIGHT CELLS

// ---------------------------------------------------------- 1. old client, old rules
{
    suite('cell 1 — OLD client · OLD rules · LEGACY document');

    await seed(envOld, LEGACY());
    const result = await attempt(() => oldEdit(asUser(envOld)));
    const after = await readDoc(envOld);
    check('the write lands', result.ok, result.code);
    check('and the day is on the document', Boolean(after.days[DAY]), JSON.stringify(Object.keys(after.days)));
    check('and the document is still legacy', after.revision === undefined, String(after.revision));
    cell('old', 'old', 'legacy', result.ok ? 'ACCEPTED' : `REFUSED ${result.code}`,
        'ordinary field edit; document stays legacy');
}

// ------------------------------------------------------- 2. old client, old rules, protocol doc
//
// THE ROLLBACK CELL. A document that has entered the protocol, and the old rules put back
// over it.
{
    suite('cell 2 — OLD client · OLD rules · PROTOCOL document');

    await seed(envOld, PROTOCOL());
    const result = await attempt(() => oldEdit(asUser(envOld)));
    const after = await readDoc(envOld);
    check('the write lands', result.ok, result.code);
    check('the day is on the document', Boolean(after.days[DAY]), JSON.stringify(Object.keys(after.days)));
    check('AND THE REVISION DID NOT MOVE — a change with no ordering behind it',
        after.revision === 4, String(after.revision));
    check('and no receipt explains it',
        (await readReceipt(envOld, 'op_seed')).revision === 4
        && after.lastOpId === 'op_seed',
        `lastOpId still ${after.lastOpId}`);
    cell('old', 'old', 'protocol', result.ok ? 'ACCEPTED' : `REFUSED ${result.code}`,
        'business data changed under a revision that did not move: the ordering is bypassed');
}

// -------------------------------------------- 2b. the same rollback, the whole document
{
    suite('cell 2b — OLD client · OLD rules · PROTOCOL document · whole-document write');

    await seed(envOld, PROTOCOL());
    const whole = LEGACY();                       // what an old phone holds: no ordering fields
    whole.updatedAt = new Date().toISOString();
    const result = await attempt(() => oldClientOps(doc(asUser(envOld), ...PATH)).save(whole));
    const after = await readDoc(envOld);
    check('the write lands', result.ok, result.code);
    check('AND THE DOCUMENT IS BACK OUT OF THE PROTOCOL',
        after.revision === undefined && after.protocol === undefined
        && after.lastOpId === undefined,
        JSON.stringify({ revision: after.revision, protocol: after.protocol }));
    check('while the receipt for revision 4 is still there, now naming nothing',
        (await readReceipt(envOld, 'op_seed')) !== null, 'receipts are immutable');
    cell('old', 'old', 'protocol (restore/save)',
        result.ok ? 'ACCEPTED' : `REFUSED ${result.code}`,
        'the ordering fields are stripped off; orphan receipts remain');
}

// ------------------------------ 2c. what the rollback LEAVES, when the rules come back
//
// The old phone above knocked the document out of the protocol, and receipts are
// immutable so its receipt is still there claiming revision 4. Publish the new rules
// again and an updated phone retries an operation whose receipt survived - it is built to
// BELIEVE a receipt, and this is the one case where believing it would be a lie.
{
    suite('cell 2c — the wreckage a rollback leaves behind');

    // The document as cell 2b left it: legacy again, with a receipt claiming revision 4.
    await envNew.clearFirestore();
    await envNew.withSecurityRulesDisabled(async ctx => {
        const db = ctx.firestore();
        await setDoc(doc(db, ...PATH), LEGACY());
        await setDoc(doc(db, ...PATH, 'receipts', 'op_seed'),
            { revision: 4, opFingerprint: 'f_seed', at: '2026-08-11T18:05:00.000Z', by: 'd_new' });
    });

    const retry = await attempt(() => newEdit(asUser(envNew), 1, 'op_seed'));
    check('an updated phone retrying an operation whose receipt outlived the rollback '
        + 'is stopped', !retry.ok, retry.code);
    check('with receipt-mismatch — the client refuses to believe a receipt the document '
        + 'cannot support', retry.code === 'receipt-mismatch', retry.code);

    const boot = await attempt(() => newBootstrap(asUser(envNew), 'op_boot2'));
    check('a fresh bootstrap still lands', boot.ok, boot.code);
    const after = await readDoc(envNew);
    check('and the document is at revision 1 again', after.revision === 1, String(after.revision));
    const again = await attempt(() => newEdit(asUser(envNew), 1, 'op_seed'));
    check('but the orphan receipt is permanently poisonous: revision 4 is claimed and '
        + 'the document is at 1', !again.ok && again.code === 'receipt-mismatch', again.code);
    cell('new', 'new (rules republished after a rollback)', 'legacy + orphan receipt',
        `REFUSED ${retry.code}`,
        'receipts are immutable, so a rollback leaves receipts no document can ever support');
}

// ---------------------------------------------------------- 3. old client, new rules
{
    suite('cell 3 — OLD client · NEW rules · LEGACY document');

    await seed(envNew, LEGACY());
    const result = await attempt(() => oldEdit(asUser(envNew)));
    const after = await readDoc(envNew);
    check('the write lands — legacyWrite() holds the door open',
        result.ok, result.code);
    check('and the document is still legacy', after.revision === undefined, String(after.revision));
    cell('old', 'new', 'legacy', result.ok ? 'ACCEPTED' : `REFUSED ${result.code}`,
        'legacyWrite(): a phone that has not updated keeps working until cutover');
}

// ----------------------------------------------- 4. old client, new rules, protocol doc
{
    suite('cell 4 — OLD client · NEW rules · PROTOCOL document');

    await seed(envNew, PROTOCOL());
    const result = await attempt(() => oldEdit(asUser(envNew)));
    const after = await readDoc(envNew);
    check('the write is REFUSED', !result.ok, result.code);
    check('with permission-denied', result.code === 'permission-denied', result.code);
    check('and nothing on the document moved', after.days[DAY] === undefined,
        JSON.stringify(Object.keys(after.days)));
    cell('old', 'new', 'protocol', result.ok ? 'ACCEPTED' : `REFUSED ${result.code}`,
        'cutover has happened: an un-updated phone is refused and holds its queue');
}

// ---------------------------------------------------------- 5. new client, old rules
{
    suite('cell 5 — NEW client · OLD rules · LEGACY document');

    await seed(envOld, LEGACY());
    const boot = await attempt(() => newBootstrap(asUser(envOld), 'op_boot'));
    const edit = await attempt(() => newEdit(asUser(envOld), 1, 'op_edit'));
    const after = await readDoc(envOld);
    check('the bootstrap is REFUSED', !boot.ok, boot.code);
    check('and so is an ordinary edit', !edit.ok, edit.code);
    check('both with permission-denied',
        boot.code === 'permission-denied' && edit.code === 'permission-denied',
        `${boot.code} / ${edit.code}`);
    check('and the document did not move',
        after.revision === undefined && after.days[DAY] === undefined,
        JSON.stringify(Object.keys(after.days)));
    cell('new', 'old', 'legacy',
        `REFUSED ${boot.code} (bootstrap) / ${edit.code} (edit)`,
        'the old rules have no receipts subcollection: the transaction cannot even read one');
}

// ----------------------------------------------- 6. new client, old rules, protocol doc
{
    suite('cell 6 — NEW client · OLD rules · PROTOCOL document');

    await seed(envOld, PROTOCOL());
    const result = await attempt(() => newEdit(asUser(envOld), 5, 'op_edit6'));
    const after = await readDoc(envOld);
    check('the write is REFUSED', !result.ok, result.code);
    check('with permission-denied', result.code === 'permission-denied', result.code);
    check('and nothing moved', after.revision === 4 && after.days[DAY] === undefined,
        String(after.revision));
    cell('new', 'old', 'protocol', result.ok ? 'ACCEPTED' : `REFUSED ${result.code}`,
        'rolling the rules back stops every UPDATED phone dead');
}

// ---------------------------------------------------------- 7. new client, new rules
{
    suite('cell 7 — NEW client · NEW rules · LEGACY document');

    await seed(envNew, LEGACY());
    // First, the thing the client is built NOT to do: business data as the first
    // protocol write. The rules refuse it, which is the whole reason the bootstrap is
    // its own operation.
    const early = await attempt(() => newEdit(asUser(envNew), 1, 'op_early'));
    check('a business write as the FIRST protocol write is refused',
        !early.ok && early.code === 'permission-denied', early.code);

    await seed(envNew, LEGACY());
    const boot = await attempt(() => newBootstrap(asUser(envNew), 'op_boot'));
    check('the bootstrap lands', boot.ok, boot.code);
    const mid = await readDoc(envNew);
    check('the document is at revision 1', mid.revision === 1, String(mid.revision));
    check('and NOT ONE BYTE of work changed',
        Object.keys(mid.days).length === 1 && mid.days['2026-08-10'] !== undefined
        && mid.advances.a_01.amount === 500 && mid.workers.length === 2,
        JSON.stringify([Object.keys(mid.days), mid.advances.a_01.amount]));

    const edit = await attempt(() => newEdit(asUser(envNew), 2, 'op_after_boot'));
    const after = await readDoc(envNew);
    check('and the ordinary edit then lands', edit.ok, edit.code);
    check('at revision 2, with its receipt',
        after.revision === 2 && (await readReceipt(envNew, 'op_after_boot')).revision === 2,
        String(after.revision));
    cell('new', 'new', 'legacy',
        boot.ok && edit.ok ? 'ACCEPTED (bootstrap first, then the edit)' : 'REFUSED',
        'a business write BEFORE the bootstrap is refused: permission-denied');
}

// ----------------------------------------------- 8. new client, new rules, protocol doc
{
    suite('cell 8 — NEW client · NEW rules · PROTOCOL document');

    await seed(envNew, PROTOCOL());
    const result = await attempt(() => newEdit(asUser(envNew), 5, 'op_edit8'));
    const after = await readDoc(envNew);
    check('the write lands', result.ok, result.code);
    check('at revision 5', after.revision === 5, String(after.revision));
    check('with a receipt naming the operation and what it did',
        (await readReceipt(envNew, 'op_edit8')).opFingerprint === 'f_op_edit8',
        'receipt carries the fingerprint');
    cell('new', 'new', 'protocol', result.ok ? 'ACCEPTED' : `REFUSED ${result.code}`,
        'the steady state');
}

// ====================================================== READ, WHICH IS A DIFFERENT STEP
//
// "Install the new version on a phone" and "let that version write" are two steps, and
// the docs blurred them. Reading is what an installed-but-not-yet-writing phone does.
{
    suite('reading is allowed in every one of the four combinations');

    await seed(envOld, PROTOCOL());
    const oldRulesRead = await attempt(() => getDoc(doc(asUser(envOld), ...PATH)));
    await seed(envNew, PROTOCOL());
    const newRulesRead = await attempt(() => getDoc(doc(asUser(envNew), ...PATH)));
    check('the schedule reads under the OLD rules', oldRulesRead.ok, oldRulesRead.code);
    check('the schedule reads under the NEW rules', newRulesRead.ok, newRulesRead.code);

    const oldRulesReceipt = await attempt(() =>
        getDoc(doc(asUser(envOld), ...PATH, 'receipts', 'op_seed')));
    const newRulesReceipt = await attempt(() =>
        getDoc(doc(asUser(envNew), ...PATH, 'receipts', 'op_seed')));
    check('but a RECEIPT cannot be read under the old rules',
        !oldRulesReceipt.ok && oldRulesReceipt.code === 'permission-denied',
        oldRulesReceipt.code);
    check('and can under the new ones', newRulesReceipt.ok, newRulesReceipt.code);
    check('WHICH IS WHY the new client is refused by the old rules: its every write '
        + 'begins by reading its own receipt',
        !oldRulesReceipt.ok, 'the refusal is at the read, before any write is attempted');
}

// ============================================ IS `pending` EVIDENCE OF A LOST OPERATION?
//
// The server accepts the write and the answer never comes back - a tunnel, a backgrounded
// tab, a phone that locked. The queue is only pruned by js/sync/send.js AFTER an answer
// (`this.acknowledge(sent)` runs inside the `.then`), so the edit stays in the outbox and
// the line goes on saying «ממתינים לשליחה». This measures what is actually on the server
// at that moment, and what the next attempt is told.
{
    suite('a write in the outbox may already be on the server');

    await seed(envNew, PROTOCOL());
    const payload = {
        [DAY_PATH]: DAY_VALUE,
        protocol: 1,
        revision: 5,
        lastOpId: 'op_lost',
        opFingerprint: 'f_op_lost',
        updatedAt: new Date().toISOString(),
        updatedBy: 'd_new'
    };
    const landed = await attempt(() => newOpsFor(asUser(envNew)).update(payload));
    check('the server accepted it', landed.ok, landed.code);

    const server = await readDoc(envNew);
    check('the day is on the server', Boolean(server.days[DAY]), 'server holds the edit');
    check('at revision 5, with its receipt', server.revision === 5
        && (await readReceipt(envNew, 'op_lost')).revision === 5, String(server.revision));

    // Now the answer is lost. The phone knows nothing, keeps the entry, retries the SAME
    // operation - same id, same fingerprint - which is the only thing that makes a retry
    // safe.
    const retry = await attempt(() => newOpsFor(asUser(envNew)).update(payload));
    check('the retry is answered, not refused', retry.ok, retry.code);
    check('and it is answered AS A REPLAY, at the revision the operation reached',
        retry.value && retry.value.replayed === true && retry.value.revision === 5,
        JSON.stringify(retry.value));

    const settled = await readDoc(envNew);
    check('and the retry wrote nothing a second time',
        settled.revision === 5, String(settled.revision));

    // The other half: the same NAME carrying a different operation is caught rather than
    // believed, which is what stops a replay from acknowledging somebody else's write.
    const forged = await attempt(() => newOpsFor(asUser(envNew)).update(
        Object.assign({}, payload, {
            [DAY_PATH]: { entries: [{ placeId: 'p_02' }] },
            opFingerprint: 'f_something_else'
        })));
    check('a retry whose operation is NOT the one the receipt names is refused',
        !forged.ok && forged.code === 'receipt-mismatch', forged.code);
}

// ============================================================== THE MATRIX, PRINTED
{
    suite('the matrix');

    check('every cell was measured', cells.length === 10, `${cells.length} rows`);

    console.log('\n  | client | rules | document | result |');
    console.log('  |---|---|---|---|');
    cells.forEach(row => {
        console.log(`  | ${row.client} | ${row.rules} | ${row.document} | ${row.outcome} — ${row.detail} |`);
    });
    console.log('');
}

await envNew.cleanup();
await envOld.cleanup();
report();
