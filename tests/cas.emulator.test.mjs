// The PRODUCTION adapter's write path, against a real Firestore.
//
//   firebase emulators:exec --only firestore "node tests/cas.emulator.test.mjs"
//
// tests/cas.test.mjs asks whether the client speaks the ordering protocol, against the
// fake cloud in tests/harness.mjs. That suite was green while production was weaker than
// the thing it tested, and the gap was one property:
//
//   the harness threw   { code:'conflict', revision, document }
//   production threw    { code:'conflict', revision }
//
// and js/sync/sync.js read `error.document || this._latestRaw`. _latestRaw is the last
// document onSnapshot delivered - a different channel from the transaction's read, with
// no ordering between them. A refusal that arrived before its snapshot was therefore
// compared against a document one revision behind, where the path another phone had just
// corrected still held the value the refused write was built on: uncontested, rebased,
// and the correction overwritten. Every node suite took the harness branch; every real
// device took the stale one.
//
// So this file runs the REAL js/sync/firebase-adapter.js against the emulator. The module
// imports the Firebase SDK from gstatic URLs, which node cannot resolve, so the three
// import specifiers are rewritten to the installed package - and the suite ASSERTS that
// the rewrite touched only those lines, because a test that quietly edits the code it is
// testing proves nothing.

import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { suite, check, given, report } from './runner.mjs';

const ADAPTER = fileURLToPath(new URL('../js/sync/firebase-adapter.js', import.meta.url));
const SHIM = fileURLToPath(new URL('../js/sync/_adapter-under-test.mjs', import.meta.url));
const CONFIG = fileURLToPath(new URL('../js/sync/_adapter-test-config.mjs', import.meta.url));

const source = readFileSync(ADAPTER, 'utf8');
// FOUR SPECIFIERS, and nothing else.
//
// Three point the SDK at the installed package, because node cannot resolve a gstatic
// URL. The fourth points the project config at an UNCONFIGURED one: the shipped config
// carries a real projectId and apiKey, so importing the module as it stands would run its
// browser branch - initialise the real app, reach the real auth, touch the real project.
// With an empty config isConfigured() is false, that whole branch is skipped, and what is
// left is exactly the write path this suite came for.
const rewritten = source
    .replace('"https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js"', '"firebase/app"')
    .replace('"https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js"', '"firebase/auth"')
    .replace('"https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js"', '"firebase/firestore"')
    .replace("from './firebase-config.js'", "from './_adapter-test-config.mjs'");

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
    // The IMPORT, not the word: the file mentions firebase-config.js in a comment too,
    // and asserting the string is absent failed over prose rather than over code.
    check('and no real project credential travels into the module under test',
        rewritten.indexOf("from './firebase-config.js'") === -1
        && rewritten.indexOf("from './_adapter-test-config.mjs'") !== -1,
        'config import redirected');
    check('and nothing inside the transaction was touched',
        rewritten.indexOf("error.code = 'conflict';") !== -1
        && rewritten.indexOf('error.document = JSON.parse(JSON.stringify(snapshot.data()));') !== -1,
        'conflict branch present verbatim');
}

// An unconfigured project, so the module's browser branch stays shut.
writeFileSync(CONFIG, 'export const firebaseConfig = { apiKey: "", projectId: "" };\n'
    + 'export const SCHEDULE_DOC_PATH = "schedules/current";\n');
writeFileSync(SHIM, rewritten);
let firestoreOps;
try {
    ({ firestoreOps } = await import('./../js/sync/_adapter-under-test.mjs'));
} finally {
    try { unlinkSync(SHIM); } catch (error) { /* best effort */ }
    try { unlinkSync(CONFIG); } catch (error) { /* best effort */ }
}

const { doc, getDoc, setDoc } = await import('firebase/firestore');

const env = await initializeTestEnvironment({
    projectId: 'farkad-cas-emulator',
    firestore: {
        rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'),
        host: '127.0.0.1',
        port: 8080
    }
});

const ALLOWED = 'yosef.farkad1@gmail.com';
const as = email => env.authenticatedContext(email.replace(/[^a-z0-9]/gi, ''), { email }).firestore();

const PATH = ['schedules', 'current'];
const opsFor = db => firestoreOps(
    db,
    doc(db, ...PATH),
    opId => doc(db, ...PATH, 'receipts', String(opId))
);

const base = (extra = {}) => ({
    schemaVersion: 2,
    workers: [{ id: 'w_01', name: 'דוד', active: true, dailyRate: 400, hourlyRate: 0 }],
    places: [{ id: 'p_01', name: 'הרצליה', active: true }],
    days: {},
    advances: {},
    updatedAt: new Date().toISOString(),
    updatedBy: 'd_seed',
    protocol: 1,
    revision: 1,
    lastOpId: 'op_seed',
    opFingerprint: 'f_op_seed',
    ...extra
});

async function reset() {
    await env.clearFirestore();
    const db = as(ALLOWED);
    await opsFor(db).create(base());
}

const readDoc = async () => {
    let held = null;
    await env.withSecurityRulesDisabled(async ctx => {
        const snap = await getDoc(doc(ctx.firestore(), ...PATH));
        held = snap.exists() ? snap.data() : null;
    });
    return held;
};

const conflictOf = async promise => {
    try { await promise; return null; }
    catch (error) { return error; }
};

// ------------------------------------------------ the conflict carries the document
{
    suite('a production conflict hands back the document the transaction read');

    await reset();
    const a = opsFor(as(ALLOWED));
    const b = opsFor(as(ALLOWED));

    // A lands a change to one field.
    await a.update({ 'days.2026-08-12.actual.w_01': { entries: [{ placeId: 'p_01' }] },
        protocol: 1, revision: 2, lastOpId: 'op_a', opFingerprint: 'f_op_a', updatedBy: 'd_a' });

    // B was built against revision 1 and writes the SAME field.
    const error = await conflictOf(b.update({
        'days.2026-08-12.actual.w_01': { entries: [{ placeId: 'p_02' }] },
        protocol: 1, revision: 2, lastOpId: 'op_b', opFingerprint: 'f_op_b', updatedBy: 'd_b' }));

    given('B was refused', Boolean(error), String(error && error.message));
    check('the refusal is a conflict', error && error.code === 'conflict',
        String(error && error.code));
    check('it names the revision the document is actually at',
        error && error.revision === 2, String(error && error.revision));
    // THE PROPERTY THAT WAS MISSING.
    check('and it carries the authoritative document, not nothing',
        error && error.document && typeof error.document === 'object',
        JSON.stringify(error && error.document ? Object.keys(error.document) : null));
    check('which is the document as the transaction read it, at that revision',
        error && error.document && error.document.revision === 2,
        String(error && error.document && error.document.revision));
    check('and it shows the field A actually wrote, so a contest is visible',
        error && error.document
        && JSON.stringify(error.document.days['2026-08-12'].actual.w_01.entries)
            === JSON.stringify([{ placeId: 'p_01' }]),
        JSON.stringify(error && error.document
            && error.document.days && error.document.days['2026-08-12']));
    // Not a live handle into the SDK's cache.
    check('the document is a plain copy the client can keep',
        error && error.document && Object.getPrototypeOf(error.document) === Object.prototype,
        'plain object');

    const held = await readDoc();
    check('and B did not overwrite A',
        JSON.stringify(held.days['2026-08-12'].actual.w_01.entries)
            === JSON.stringify([{ placeId: 'p_01' }]),
        JSON.stringify(held.days['2026-08-12']));
}

// ------------------------------------------------------------ disjoint edits merge
{
    suite('disjoint fields still both survive');

    await reset();
    const a = opsFor(as(ALLOWED));
    const b = opsFor(as(ALLOWED));

    await a.update({ 'days.2026-08-12.actual.w_01': { entries: [{ placeId: 'p_01' }] },
        protocol: 1, revision: 2, lastOpId: 'op_a2', opFingerprint: 'f_op_a2', updatedBy: 'd_a' });
    const error = await conflictOf(b.update({
        'days.2026-08-13.actual.w_01': { entries: [{ placeId: 'p_01' }] },
        protocol: 1, revision: 2, lastOpId: 'op_b2', opFingerprint: 'f_op_b2', updatedBy: 'd_b' }));

    given('B is still refused - the revision moved, whatever the field',
        Boolean(error) && error.code === 'conflict', String(error && error.code));
    check('but the document it is handed shows B\'s own path untouched',
        error.document && error.document.days['2026-08-13'] === undefined,
        JSON.stringify(Object.keys(error.document.days || {})));

    // Which is what lets the client rebase. Replayed at the revision it was told.
    await b.update({ 'days.2026-08-13.actual.w_01': { entries: [{ placeId: 'p_01' }] },
        protocol: 1, revision: 3, lastOpId: 'op_b3', opFingerprint: 'f_op_b3', updatedBy: 'd_b' });

    const held = await readDoc();
    check('and both days are in the document',
        Boolean(held.days['2026-08-12']) && Boolean(held.days['2026-08-13']),
        JSON.stringify(Object.keys(held.days)));
}

// ------------------------------------------------------------- the receipt is the proof
{
    suite('an operation is acknowledged only by its own receipt');

    await reset();
    const a = opsFor(as(ALLOWED));

    await a.update({ 'days.2026-08-14.actual.w_01': { entries: [{ placeId: 'p_01' }] },
        protocol: 1, revision: 2, lastOpId: 'op_once', opFingerprint: 'f_op_once', updatedBy: 'd_a' });

    let receipt = null;
    await env.withSecurityRulesDisabled(async ctx => {
        const snap = await getDoc(doc(ctx.firestore(), ...PATH, 'receipts', 'op_once'));
        receipt = snap.exists() ? snap.data() : null;
    });
    check('the receipt landed with the write it names',
        receipt && receipt.revision === 2, JSON.stringify(receipt));

    // The same operation again - what a client does when it cannot tell whether its
    // request landed. It must be answered as success and must not apply twice.
    const again = await conflictOf(a.update({
        'days.2026-08-14.actual.w_01': { entries: [{ placeId: 'p_01' }] },
        protocol: 1, revision: 2, lastOpId: 'op_once', opFingerprint: 'f_op_once', updatedBy: 'd_a' }));
    check('replaying it is answered as success, not as a conflict',
        again === null, String(again && again.code));

    const held = await readDoc();
    check('and the revision did not move a second time',
        held.revision === 2, String(held.revision));
}

// ------------------------------------------------------- one contract, both adapters
{
    suite('the harness and the production adapter refuse in the same shape');

    const { makeCloud } = await import('./harness.mjs');
    const cloud = makeCloud();
    await cloud.adapter.create(base());
    await cloud.adapter.update({ 'days.2026-08-12.actual.w_01': { entries: [] },
        protocol: 1, revision: 2, lastOpId: 'op_h1', opFingerprint: 'f_op_h1', updatedBy: 'd_a' });
    const fake = await conflictOf(cloud.adapter.update({
        'days.2026-08-12.actual.w_01': { entries: [] },
        protocol: 1, revision: 2, lastOpId: 'op_h2', opFingerprint: 'f_op_h2', updatedBy: 'd_b' }));

    await reset();
    const real = await conflictOf(opsFor(as(ALLOWED)).update({
        'days.2026-08-12.actual.w_01': { entries: [] },
        protocol: 1, revision: 5, lastOpId: 'op_r1', opFingerprint: 'f_op_r1', updatedBy: 'd_b' }));

    given('both refused', Boolean(fake) && Boolean(real),
        JSON.stringify([fake && fake.code, real && real.code]));
    const shapeOf = error => ['code', 'revision', 'document']
        .filter(key => error[key] !== undefined).sort().join(',');
    check('the same properties, named the same way',
        shapeOf(fake) === shapeOf(real), `${shapeOf(fake)} vs ${shapeOf(real)}`);
    check('both name a conflict', fake.code === 'conflict' && real.code === 'conflict',
        JSON.stringify([fake.code, real.code]));
    check('both carry an integer revision',
        Number.isInteger(fake.revision) && Number.isInteger(real.revision),
        JSON.stringify([fake.revision, real.revision]));
    check('and both carry a document with a revision in it',
        Number.isInteger(fake.document.revision) && Number.isInteger(real.document.revision),
        JSON.stringify([fake.document.revision, real.document.revision]));
}


// ------------------------------------------------ a receipt is only proof if it is true
{
    suite('a poisoned receipt is refused, not believed');

    // The rules refuse to create a receipt on its own now (receiptMatchesSchedule in
    // firestore.rules). This suite is about the one they cannot reach: a receipt already
    // sitting in the project from before those rules were published.
    //
    // The client is built to believe a receipt - that is what makes a retry safe - so it
    // would find this one, answer success, acknowledge, and prune the queue. An evening
    // off somebody's phone on the strength of a record that nothing wrote. So the client
    // asks the document too, and a receipt claiming a revision the schedule never reached
    // is not proof of anything.
    await reset();
    const db = as(ALLOWED);
    const ops = opsFor(db);

    const held = await readDoc();
    given('the document is at revision 1', held.revision === 1, String(held.revision));

    // Written with the rules switched off, which is the only way it can exist at all -
    // and exactly how one from before the rules would have got there.
    await env.withSecurityRulesDisabled(async ctx => {
        await setDoc(doc(ctx.firestore(), ...PATH, 'receipts', 'op_never_applied'),
            { revision: 999, at: 'x', by: 'nobody' });
    });

    const refused = await conflictOf(ops.update({
        'days.2026-08-12.actual.w_01': { entries: [{ placeId: 'p_01' }] },
        updatedAt: new Date().toISOString(),
        updatedBy: 'd_a',
        protocol: 1,
        revision: 2,
        lastOpId: 'op_never_applied',
        opFingerprint: 'f_op_never_applied'
    }));
    check('the write is refused rather than answered as already applied',
        Boolean(refused), refused ? refused.code : 'accepted');
    check('and it is refused for the reason it actually is',
        refused && refused.code === 'receipt-mismatch',
        refused ? `${refused.code}: ${refused.message}` : 'accepted');

    const after = await readDoc();
    check('nothing was written to the document',
        after.revision === 1 && !after.days['2026-08-12'],
        JSON.stringify({ revision: after.revision, days: Object.keys(after.days || {}) }));

    // AND THE HONEST CASE STILL WORKS, which is the whole point of receipts. A receipt
    // whose revision the document has actually reached is proof, and the retry that finds
    // it stops without applying anything twice.
    const opId = 'op_real';
    await ops.update({
        'days.2026-08-13.actual.w_01': { entries: [{ placeId: 'p_01' }] },
        updatedAt: new Date().toISOString(),
        updatedBy: 'd_a',
        protocol: 1,
        revision: 2,
        lastOpId: opId,
        opFingerprint: 'f_' + opId
    });
    const landed = await readDoc();
    given('a real write landed at revision 2', landed.revision === 2, String(landed.revision));

    const replay = await conflictOf(ops.update({
        'days.2026-08-13.actual.w_01': { entries: [{ placeId: 'p_01' }] },
        updatedAt: new Date().toISOString(),
        updatedBy: 'd_a',
        protocol: 1,
        revision: 2,
        lastOpId: opId,
        opFingerprint: 'f_' + opId
    }));
    check('replaying it is still answered as success', replay === null,
        replay ? `${replay.code}: ${replay.message}` : 'accepted');
    const twice = await readDoc();
    check('and the revision did not move for the replay', twice.revision === 2,
        String(twice.revision));
}

await env.cleanup();
report();
