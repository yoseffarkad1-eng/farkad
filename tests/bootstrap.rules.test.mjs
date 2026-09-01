// The bootstrap, asked of the SERVER.
//
//   firebase emulators:exec --only firestore "node tests/bootstrap.rules.test.mjs"
//
// Three suites already touch this write and none of them asks this question.
//
//   tests/bootstrap.emulator.test.mjs drives the real client through the real adapter and
//   proves the bootstrap it sends touches five fields and no others. That is a proof
//   about js/sync/firebase-adapter.js, and it passes whether or not the rules require
//   anything at all.
//
//   tests/rollout.test.mjs bootstraps by writing the WHOLE document back with the
//   ordering fields added, then checks the roster and the days survived - which they do,
//   because its own helper copied them forward. It demonstrates the open door and reads
//   as a proof that the door is fine.
//
//   tests/rules.test.mjs starts from a document that is already in the protocol and never
//   reaches the bootstrap branch.
//
// So the invariant lived in exactly one place: the client. Measured against these rules,
// an ordinary allowed user could take the legacy document to revision 1 and, in the same
// accepted write, delete every day worked, every advance, the whole ledger and the entire
// roster. Sixteen mutations of business data were accepted; the two that were refused
// were refused by accident, because deleting `workers` alone left `places` behind and
// tripped the full-replacement shape check.
//
// The bootstrap is the one accepted write with NO compare-and-set behind it - there is no
// prior revision to check it against - so it is the one write that most needs the server
// to say what it may contain. This file is that sentence.

import { initializeTestEnvironment, assertSucceeds }
    from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteField, writeBatch }
    from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import { suite, check, same, given, report } from './runner.mjs';

const env = await initializeTestEnvironment({
    projectId: 'farkad-bootstrap-rules',
    firestore: {
        rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'),
        host: '127.0.0.1',
        port: 8080
    }
});

const ALLOWED = 'yosef.farkad1@gmail.com';
const as = email => env.authenticatedContext(email.replace(/[^a-z0-9]/gi, ''), { email }).firestore();
const PATH = ['schedules', 'current'];

// A genuine legacy document: real work in it, and not one ordering field.
const LEGACY = {
    schemaVersion: 2,
    workers: [
        { id: 'w_01', name: 'דוד', active: true, dailyRate: 400, hourlyRate: 50 },
        { id: 'w_02', name: 'שרה', active: true, dailyRate: 350, hourlyRate: 0 }
    ],
    places: [{ id: 'p_01', name: 'הרצליה', active: true }],
    days: {
        '2026-08-10': { actual: { w_01: { entries: [{ placeId: 'p_01' }],
            rates: { daily: 400, hourly: 50 } } } },
        '2026-08-11': { actual: { w_02: { entries: [{ placeId: 'p_01' }],
            rates: { daily: 350, hourly: 0 } } } }
    },
    advances: { a_01: { id: 'a_01', workerId: 'w_01', date: '2026-08-10', amount: 500, note: '' } },
    ledger: { advances: { le_01: { id: 'le_01', advanceId: 'a_01', kind: 'given',
        workerId: 'w_01', date: '2026-08-10', amount: 500, at: '', by: 'd_old' } } },
    roster: { workers: {}, workerOrder: ['w_01', 'w_02'] },
    updatedAt: '2026-08-11T18:00:00.000Z',
    updatedBy: 'd_old'
};

// The five fields the production bootstrap actually writes - see the transaction.update
// in js/sync/firebase-adapter.js. Everything else in the document is business data.
const PROTOCOL_FIELDS = ['protocol', 'revision', 'lastOpId', 'updatedAt', 'updatedBy'];

// What a document says about WORK, with the ordering fields taken out. Compared deeply
// before and after, because "the bootstrap changed nothing" is a claim about this and
// not about the key count.
function business(document) {
    const out = {};
    Object.keys(document || {}).sort().forEach(key => {
        if (PROTOCOL_FIELDS.indexOf(key) !== -1) return;
        out[key] = document[key];
    });
    return JSON.stringify(out);
}

// Whether the server refused, as a VALUE rather than as a thrown assertion.
//
// assertFails throws, which ends the run at the first row - and the first row is exactly
// the one that used to pass, so a red run said nothing about the other eighteen. Every
// row is asked, every answer is recorded, and the report names all of them at once.
async function refused(promise) {
    try { await promise; return false; } catch (error) { return true; }
}

async function seedLegacy() {
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async ctx => {
        await setDoc(doc(ctx.firestore(), ...PATH), LEGACY);
    });
}

const readDoc = async () => {
    let held = null;
    await env.withSecurityRulesDisabled(async ctx => {
        const snap = await getDoc(doc(ctx.firestore(), ...PATH));
        held = snap.exists() ? snap.data() : null;
    });
    return held;
};

// The bootstrap as the production adapter writes it: a TARGETED update of the five
// ordering fields, plus the receipt, in one atomic batch. `extra` is whatever a buggy or
// hostile client would try to smuggle alongside it.
function bootstrapWrite(db, opId, extra = {}, options = {}) {
    const batch = writeBatch(db);
    batch.update(doc(db, ...PATH), Object.assign({
        protocol: 1,
        revision: 1,
        lastOpId: opId,
        updatedAt: new Date().toISOString(),
        updatedBy: 'd_new'
    }, extra));
    if (options.receipt !== false) {
        batch.set(doc(db, ...PATH, 'receipts', opId), Object.assign({
            revision: 1, at: new Date().toISOString(), by: 'd_new'
        }, options.receiptExtra || {}));
    }
    return batch.commit();
}

// ------------------------------------------------ the write the client actually makes
{
    suite('a protocol-only bootstrap is accepted, and changes nothing that is work');

    await seedLegacy();
    const before = await readDoc();
    given('the seeded document is genuinely legacy',
        before.revision === undefined && before.protocol === undefined
        && before.lastOpId === undefined, JSON.stringify(Object.keys(before).sort()));
    given('and carries real work',
        Object.keys(before.days).length === 2 && Object.keys(before.advances).length === 1,
        JSON.stringify([Object.keys(before.days), Object.keys(before.advances)]));

    await assertSucceeds(bootstrapWrite(as(ALLOWED), 'op_boot'));

    const after = await readDoc();
    check('the document is now at revision 1 and speaks the protocol',
        after.revision === 1 && after.protocol === 1,
        JSON.stringify([after.revision, after.protocol]));
    // DEEPLY IDENTICAL, not "the keys are still there". A bootstrap that kept every key
    // and changed a stamped daily rate inside one of them would pass a key count.
    same('and every byte that is about work is the byte that was there',
        business(after), business(before));
}

// ------------------------------------------------------------ and nothing else at all
{
    suite('a bootstrap may not carry business data');

    // Each row is one thing a bootstrap could try to smuggle: a whole family deleted, a
    // family replaced, a single value altered deep inside one, a family appended to, and
    // a field this build has never heard of. Every one of them is somebody's money or
    // somebody's name, and none of them is ordering.
    const smuggled = [
        ['the days deleted', { days: deleteField() }],
        ['the days replaced', { days: { '2026-08-10': { actual: {} } } }],
        ['one stamped daily rate altered',
            { 'days.2026-08-10.actual.w_01.rates.daily': 1 }],
        ['a day appended', { 'days.2026-08-12': { actual: {} } }],
        ['the advances deleted', { advances: deleteField() }],
        ['one advance amount altered', { 'advances.a_01.amount': 5 }],
        ['an advance appended', { 'advances.a_forged': { id: 'a_forged', amount: 900 } }],
        ['the ledger deleted', { ledger: deleteField() }],
        ['a ledger entry appended', { 'ledger.advances.le_forged': { id: 'le_forged' } }],
        ['the workers replaced',
            { workers: [{ id: 'w_01', name: 'דוד', active: true, dailyRate: 40 }] }],
        ['the places replaced', { places: [{ id: 'p_09', name: 'אחר', active: true }] }],
        ['the whole roster erased',
            { workers: deleteField(), places: deleteField() }],
        ['workers alone deleted', { workers: deleteField() }],
        ['places alone deleted', { places: deleteField() }],
        ['the roster map deleted', { roster: deleteField() }],
        ['the roster map altered', { 'roster.workerOrder': ['w_02'] }],
        ['schemaVersion deleted', { schemaVersion: deleteField() }],
        ['schemaVersion altered', { schemaVersion: 1 }],
        ['an unknown business field added', { somethingLater: { note: 'x' } }]
    ];

    for (const [what, extra] of smuggled) {
        await seedLegacy();
        const before = await readDoc();
        const denied = await refused(bootstrapWrite(as(ALLOWED), 'op_boot', extra));
        const after = await readDoc();
        // BOTH: the server said no, AND the document is untouched. Either alone can be
        // true for the wrong reason - a write refused for its shape while a different
        // clause let an earlier one through, or a mutation that happened to be a no-op.
        check(`refused: ${what}`,
            denied && business(after) === business(before),
            denied ? business(after).slice(0, 160) : 'ALLOWED');
    }
}

// ------------------------------------------------------------------ and it is bound
{
    suite('a bootstrap without a bound receipt is not a bootstrap');

    await seedLegacy();
    const noReceipt = await refused(bootstrapWrite(as(ALLOWED), 'op_boot', {}, { receipt: false }));
    check('a bootstrap with no receipt at all is refused',
        noReceipt && (await readDoc()).revision === undefined);

    await seedLegacy();
    const wrongReceipt = await refused(bootstrapWrite(as(ALLOWED), 'op_boot', {},
        { receiptExtra: { revision: 2 } }));
    check('a receipt claiming a revision the document did not reach is refused',
        wrongReceipt && (await readDoc()).revision === undefined);

    // The receipt alone, with nothing moving the schedule. It is the oldest shape of this
    // fault: a record that says an operation landed, written by nobody landing it.
    await seedLegacy();
    const alone = await refused(setDoc(doc(as(ALLOWED), ...PATH, 'receipts', 'op_never'),
        { revision: 1, at: new Date().toISOString(), by: 'd_new' }));
    check('a standalone receipt is refused',
        alone && (await readDoc()).revision === undefined);
}

// ----------------------------------------------------- and the rest of the rollout
{
    suite('the paths either side of the bootstrap still work');

    await seedLegacy();
    // BEFORE CUTOVER a phone that has never heard of the protocol still records days.
    await assertSucceeds(updateDoc(doc(as(ALLOWED), ...PATH), {
        'days.2026-08-12': { actual: { w_01: { entries: [{ placeId: 'p_01' }] } } },
        updatedAt: new Date().toISOString(), updatedBy: 'd_old'
    }));
    check('a legacy write lands while the document has no revision',
        Boolean((await readDoc()).days['2026-08-12']));

    await assertSucceeds(bootstrapWrite(as(ALLOWED), 'op_boot2'));

    // AFTER CUTOVER the same write is refused, loudly, which is the whole cost of the
    // rollout and the reason every phone has to be updated before the rules move.
    const afterCutover = await refused(updateDoc(doc(as(ALLOWED), ...PATH), {
        'days.2026-08-13': { actual: { w_01: { entries: [{ placeId: 'p_01' }] } } },
        updatedAt: new Date().toISOString(), updatedBy: 'd_old'
    }));
    check('and is refused once the document is in the protocol',
        afterCutover && (await readDoc()).days['2026-08-13'] === undefined);

    // An ordinary revision N -> N+1, which the bootstrap clause must not have narrowed.
    const opId = 'op_next';
    const batch = writeBatch(as(ALLOWED));
    batch.update(doc(as(ALLOWED), ...PATH), {
        'days.2026-08-14': { actual: { w_01: { entries: [{ placeId: 'p_01' }] } } },
        protocol: 1, revision: 2, lastOpId: opId,
        updatedAt: new Date().toISOString(), updatedBy: 'd_new'
    });
    batch.set(doc(as(ALLOWED), ...PATH, 'receipts', opId),
        { revision: 2, at: new Date().toISOString(), by: 'd_new' });
    await assertSucceeds(batch.commit());
    check('an ordinary next-revision write still carries business data',
        Boolean((await readDoc()).days['2026-08-14']));

    // And the first write of an empty project is its own path, untouched by any of this.
    await env.clearFirestore();
    await assertSucceeds(setDoc(doc(as(ALLOWED), ...PATH), Object.assign({}, LEGACY, {
        protocol: 1, revision: 1, lastOpId: 'op_first',
        updatedAt: new Date().toISOString(), updatedBy: 'd_new'
    })));
    check('a project created for the first time still starts at revision 1',
        (await readDoc()).revision === 1);
}

await env.cleanup();
report();
