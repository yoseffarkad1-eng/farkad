// The rollout, from the document that is actually deployed.
//
//   firebase emulators:exec --only firestore "node tests/rollout.test.mjs"
//
// tests/rules.test.mjs starts from a protocol-native document - one that already carries
// protocol, revision and lastOpId - and proves the ordering holds from there. That is a
// real proof about a state no project is in yet, and it hid a rollout that could not be
// executed in any order:
//
//   the published rules have no receipts subcollection, so a candidate phone - which
//   writes a receipt on every mutation - cannot write under them at all;
//
//   and the new rules demand resource.data.revision + 1, while the live schedule has no
//   revision at all, so the existing document could never take its first protocol write.
//
// Publish first and every phone in the field stops writing that minute. Update every
// phone first and the updated ones cannot write until the rules move. Neither order
// works, which is why "all phones first" was a sentence rather than a plan.
//
// This suite starts where the project starts: a LEGACY document with a real roster, real
// days and real advances, and no protocol, revision, lastOpId or receipt anywhere.

import { initializeTestEnvironment, assertSucceeds, assertFails }
    from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, runTransaction, FieldPath } from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import { suite, check, given, report } from './runner.mjs';

const env = await initializeTestEnvironment({
    projectId: 'farkad-rollout-test',
    firestore: {
        rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'),
        host: '127.0.0.1',
        port: 8080
    }
});

const ALLOWED = 'yosef.farkad1@gmail.com';
const as = email => env.authenticatedContext(email.replace(/[^a-z0-9]/gi, ''), { email }).firestore();
const PATH = ['schedules', 'current'];

// THE DEPLOYED SHAPE. Everything a real project holds, and not one ordering field.
const LEGACY = {
    schemaVersion: 2,
    workers: [
        { id: 'w_01', name: 'דוד', active: true, dailyRate: 400, hourlyRate: 50 },
        { id: 'w_02', name: 'שרה', active: true, dailyRate: 350, hourlyRate: 0 }
    ],
    places: [{ id: 'p_01', name: 'הרצליה', active: true }],
    days: {
        '2026-08-10': { actual: { w_01: { entries: [{ placeId: 'p_01' }] } } },
        '2026-08-11': { actual: { w_02: { entries: [{ placeId: 'p_01' }] } } }
    },
    advances: { a_01: { id: 'a_01', workerId: 'w_01', date: '2026-08-10', amount: 500, note: '' } },
    updatedAt: '2026-08-11T18:00:00.000Z',
    updatedBy: 'd_old'
};

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

// The bootstrap, written the way the client writes it: the whole document it already
// holds, plus the ordering fields, plus the receipt, in one transaction.
function bootstrap(db, opId, extra = {}) {
    const ref = doc(db, ...PATH);
    return runTransaction(db, transaction =>
        transaction.get(ref).then(snapshot => {
            const held = snapshot.data();
            const carried = Object.assign({}, held, {
                protocol: 1,
                revision: 1,
                lastOpId: opId,
                updatedAt: new Date().toISOString(),
                updatedBy: 'd_new'
            }, extra);
            transaction.set(ref, carried);
            transaction.set(doc(db, ...PATH, 'receipts', opId),
                { revision: 1, at: new Date().toISOString(), by: 'd_new' });
        }));
}

// ------------------------------------------------------ the legacy document can move
{
    suite('the deployed legacy document takes its first protocol write');

    await seedLegacy();
    const before = await readDoc();
    given('the seeded document is genuinely legacy',
        before.revision === undefined && before.protocol === undefined
        && before.lastOpId === undefined,
        JSON.stringify(Object.keys(before)));
    given('and carries real work', Object.keys(before.days).length === 2
        && Object.keys(before.advances).length === 1,
        JSON.stringify([Object.keys(before.days), Object.keys(before.advances)]));

    await assertSucceeds(bootstrap(as(ALLOWED), 'op_boot'));

    const after = await readDoc();
    check('the document is now at revision 1', after.revision === 1, String(after.revision));
    check('and speaks the protocol', after.protocol === 1, String(after.protocol));
    // EVERY LEGACY BYTE THAT WAS STILL VALID.
    check('the roster survived', JSON.stringify(after.workers) === JSON.stringify(LEGACY.workers),
        JSON.stringify(after.workers));
    check('the days survived', JSON.stringify(after.days) === JSON.stringify(LEGACY.days),
        JSON.stringify(Object.keys(after.days)));
    check('and the advances survived',
        JSON.stringify(after.advances) === JSON.stringify(LEGACY.advances),
        JSON.stringify(after.advances));

    let receipt = null;
    await env.withSecurityRulesDisabled(async ctx => {
        const snap = await getDoc(doc(ctx.firestore(), ...PATH, 'receipts', 'op_boot'));
        receipt = snap.exists() ? snap.data() : null;
    });
    check('and the receipt landed in the same commit',
        receipt && receipt.revision === 1, JSON.stringify(receipt));
}

// ------------------------------------------------------------ a bootstrap needs its receipt
{
    suite('a bootstrap without its receipt is refused');

    await seedLegacy();
    const db = as(ALLOWED);
    await assertFails(updateDoc(doc(db, ...PATH), {
        protocol: 1, revision: 1, lastOpId: 'op_naked',
        updatedAt: new Date().toISOString(), updatedBy: 'd_new'
    }));
    const after = await readDoc();
    check('the document is untouched, so no revision exists without its receipt',
        after.revision === undefined, String(after.revision));
}

// ------------------------------------------------------------- two phones racing it
{
    suite('two updated phones racing the bootstrap: exactly one wins');

    await seedLegacy();
    const one = as(ALLOWED);
    const two = as(ALLOWED);

    const results = await Promise.allSettled([
        bootstrap(one, 'op_race_a'),
        bootstrap(two, 'op_race_b')
    ]);
    const won = results.filter(r => r.status === 'fulfilled').length;
    check('exactly one bootstrap landed', won === 1,
        JSON.stringify(results.map(r => r.status)));

    const after = await readDoc();
    check('and the document is at revision 1, not 2', after.revision === 1,
        String(after.revision));

    // The loser rereads and writes the ordinary next revision. Nothing is lost.
    await assertSucceeds(runTransaction(two, transaction => {
        const ref = doc(two, ...PATH);
        return transaction.get(ref).then(snapshot => {
            const held = snapshot.data();
            transaction.update(ref, new FieldPath('days', '2026-08-12', 'actual', 'w_01'),
                { entries: [{ placeId: 'p_01' }] },
                new FieldPath('protocol'), 1,
                new FieldPath('revision'), held.revision + 1,
                new FieldPath('lastOpId'), 'op_race_after',
                new FieldPath('updatedAt'), new Date().toISOString(),
                new FieldPath('updatedBy'), 'd_two');
            transaction.set(doc(two, ...PATH, 'receipts', 'op_race_after'),
                { revision: held.revision + 1, at: new Date().toISOString(), by: 'd_two' });
        });
    }));
    const settled = await readDoc();
    check('the loser\'s day is in the document once it rebased',
        Boolean(settled.days['2026-08-12']), JSON.stringify(Object.keys(settled.days)));
}

// --------------------------------------------------- the exception cannot be reused
{
    suite('the bootstrap exception is exactly one write wide');

    await seedLegacy();
    await assertSucceeds(bootstrap(as(ALLOWED), 'op_once'));

    // A second write claiming revision 1 over a document that now has one.
    const db = as(ALLOWED);
    await assertFails(runTransaction(db, transaction => {
        const ref = doc(db, ...PATH);
        return transaction.get(ref).then(() => {
            transaction.update(ref,
                new FieldPath('protocol'), 1,
                new FieldPath('revision'), 1,
                new FieldPath('lastOpId'), 'op_again',
                new FieldPath('updatedAt'), new Date().toISOString(),
                new FieldPath('updatedBy'), 'd_bad');
            transaction.set(doc(db, ...PATH, 'receipts', 'op_again'),
                { revision: 1, at: new Date().toISOString(), by: 'd_bad' });
        });
    }));
    const after = await readDoc();
    check('the revision did not reset', after.revision === 1, String(after.revision));
    check('and the winning operation is still the one named',
        after.lastOpId === 'op_once', String(after.lastOpId));
}

// ------------------------------------------------ old phones, before and after cutover
{
    suite('a phone that has not updated yet');

    await seedLegacy();
    const old = as(ALLOWED);

    // BEFORE the bootstrap: it must keep working, or publishing the rules is what breaks
    // the crew's evening.
    await assertSucceeds(updateDoc(doc(old, ...PATH),
        new FieldPath('days', '2026-08-13', 'actual', 'w_01'), { entries: [{ placeId: 'p_01' }] },
        new FieldPath('updatedAt'), new Date().toISOString(),
        new FieldPath('updatedBy'), 'd_old'));
    const during = await readDoc();
    check('an un-updated phone still records a day while the document is legacy',
        Boolean(during.days['2026-08-13']), JSON.stringify(Object.keys(during.days)));

    // AFTER the bootstrap: it must not be able to flatten the ordering fields.
    await assertSucceeds(bootstrap(as(ALLOWED), 'op_cut'));
    await assertFails(updateDoc(doc(old, ...PATH),
        new FieldPath('days', '2026-08-14', 'actual', 'w_01'), { entries: [{ placeId: 'p_01' }] },
        new FieldPath('updatedAt'), new Date().toISOString(),
        new FieldPath('updatedBy'), 'd_old'));
    const after = await readDoc();
    check('after cutover an un-updated phone is refused',
        after.days['2026-08-14'] === undefined, JSON.stringify(Object.keys(after.days)));
    check('and the ordering fields it does not know about are intact',
        after.revision === 1 && after.protocol === 1 && after.lastOpId === 'op_cut',
        JSON.stringify([after.revision, after.protocol, after.lastOpId]));
}

// ------------------------------------------- creation and migration are separate paths
{
    suite('a missing document and a legacy document are different roads');

    // No document at all: the create path, which has always required revision 1.
    await env.clearFirestore();
    const db = as(ALLOWED);
    await assertSucceeds(runTransaction(db, transaction => {
        const ref = doc(db, ...PATH);
        return transaction.get(ref).then(() => {
            transaction.set(ref, Object.assign({}, LEGACY, {
                protocol: 1, revision: 1, lastOpId: 'op_create',
                updatedAt: new Date().toISOString(), updatedBy: 'd_new'
            }));
            transaction.set(doc(db, ...PATH, 'receipts', 'op_create'),
                { revision: 1, at: new Date().toISOString(), by: 'd_new' });
        });
    }));
    const made = await readDoc();
    check('a fresh project is created at revision 1 with its receipt',
        made.revision === 1 && made.lastOpId === 'op_create',
        JSON.stringify([made.revision, made.lastOpId]));

    // And a create over an existing document is still refused, so the bootstrap road is
    // the only way an existing project enters the protocol.
    await assertFails(setDoc(doc(db, ...PATH), Object.assign({}, LEGACY, {
        protocol: 1, revision: 1, lastOpId: 'op_clobber',
        updatedAt: new Date().toISOString(), updatedBy: 'd_bad'
    })));
    const still = await readDoc();
    check('and a create cannot be used to overwrite one that exists',
        still.lastOpId === 'op_create', String(still.lastOpId));
}

await env.cleanup();
report();
