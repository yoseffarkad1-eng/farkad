// The security rules, run against the real firestore.rules by the Firestore emulator.
//
//   npm run test:rules
//
// These rules are not a formality: the web config in firebase-config.js is public, so
// this file is the only thing standing between the schedule and anyone who finds the
// URL. It is also where the first-sync failure actually lived - a write with no
// updatedAt is denied, and the adapter used to answer a missing document by sending {}.
// That is asserted here rather than reasoned about.

import {
    initializeTestEnvironment,
    assertSucceeds,
    assertFails
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, runTransaction, FieldPath } from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import { suite, check, report } from './runner.mjs';

const ALLOWED = 'yosef.farkad1@gmail.com';
const ALSO_ALLOWED = 'farkad1963@gmail.com';
const STRANGER = 'someone.else@gmail.com';
const PATH = 'schedules/current';

const env = await initializeTestEnvironment({
    projectId: 'farkad-rules-test',
    firestore: {
        rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'),
        host: '127.0.0.1',
        port: 8080
    }
});

const as = email => env.authenticatedContext(email.replace(/[^a-z0-9]/gi, ''), { email }).firestore();
const anonymous = () => env.unauthenticatedContext().firestore();

// A document of the shape the app actually creates.
const schedule = (extra = {}) => ({
    schemaVersion: 2,
    workers: [{ id: 'w_01', name: 'דוד', active: true, dailyRate: 400, hourlyRate: 50 }],
    places: [{ id: 'p_01', name: 'הרצליה', active: true }],
    days: {},
    advances: {},
    updatedAt: new Date().toISOString(),
    updatedBy: 'd_test',
    ...extra
});

async function passes(name, promise) {
    try { await assertSucceeds(promise); check(name, true); }
    catch (error) { check(name, false, String(error.message || error).slice(0, 120)); }
}

async function denied(name, promise) {
    try { await assertFails(promise); check(name, true); }
    catch (error) { check(name, false, String(error.message || error).slice(0, 120)); }
}

// ---------------------------------------------------------------- who gets in
{
    suite('the allowlist is the whole access control');

    await env.clearFirestore();

    await passes('a listed address can create the schedule',
        setDoc(doc(as(ALLOWED), PATH), schedule()));
    await passes('and read it back',
        getDoc(doc(as(ALLOWED), PATH)));
    await passes('a second listed address can write to the same document',
        updateDoc(doc(as(ALSO_ALLOWED), PATH), { updatedAt: new Date().toISOString() }));

    await denied('an address nobody listed cannot read it',
        getDoc(doc(as(STRANGER), PATH)));
    await denied('nor write to it',
        setDoc(doc(as(STRANGER), PATH), schedule()));
    await denied('and neither can somebody with no account at all',
        getDoc(doc(anonymous(), PATH)));

    // The token's email arrives lower-cased, and the list is lower case for that reason.
    // A capital in the list would match nobody, which reads on the phone as "permission
    // denied" with nothing to say why.
    await denied('an address is matched exactly, not case-insensitively',
        getDoc(doc(as('YOSEF.FARKAD1@GMAIL.COM'), PATH)));
}

// ---------------------------------------------------------------- the first write
{
    suite('the shape a first write has to have');

    await env.clearFirestore();

    // This is the bug, stated as a rule: the adapter used to answer a missing document
    // by writing {} and then updating it. The write below is that {}.
    await denied('an empty document is refused - this is what the first sync used to send',
        setDoc(doc(as(ALLOWED), PATH), {}, { merge: true }));

    await denied('so is a document with a roster but no timestamp',
        setDoc(doc(as(ALLOWED), PATH), { workers: [], places: [] }));

    await denied('and a full write missing the roster',
        setDoc(doc(as(ALLOWED), PATH), { workers: [], updatedAt: new Date().toISOString() }));

    await passes('a complete stamped document is accepted',
        setDoc(doc(as(ALLOWED), PATH), schedule()));

    // A field-level edit carries only the path it changed, so it is exempt from the
    // shape check - requiring the roster there would reject every ordinary write.
    await passes('a single field edit needs only its own path and a stamp',
        updateDoc(doc(as(ALLOWED), PATH), {
            'days.2026-08-12.actual.w_01': { entries: [{ placeId: 'p_01' }] },
            updatedAt: new Date().toISOString()
        }));

    // Worth being exact about, because it is not what the rule looks like it says. In an
    // UPDATE, request.resource.data is the document as it would be AFTER the merge - so
    // it still carries the stored updatedAt, and `updatedAt is string` passes even when
    // the write itself brought no stamp. The rules cannot catch this; the client is what
    // has to carry a stamp on every write, and that is asserted in the data suite under
    // "every write carries a stamp".
    //
    // Tightening the rule to demand a CHANGED timestamp was the other option and is the
    // wrong one: it would turn a retry after a failed send into a permission error, which
    // is the worst possible answer to a write that has already failed once.
    await passes('an unstamped edit is not caught here - the merged document still has one',
        updateDoc(doc(as(ALLOWED), PATH), {
            'days.2026-08-13.actual.w_01': { entries: [{ placeId: 'p_01' }] }
        }));
}

// ---------------------------------------------------------------- the race
{
    suite('two devices creating the first document at the same moment');

    await env.clearFirestore();

    const one = as(ALLOWED);
    const two = as(ALSO_ALLOWED);

    const create = db => runTransaction(db, async transaction => {
        const snapshot = await transaction.get(doc(db, PATH));
        if (snapshot.exists()) {
            const error = new Error('already-exists');
            error.code = 'already-exists';
            throw error;
        }
        transaction.set(doc(db, PATH), schedule({ updatedBy: db === one ? 'd_one' : 'd_two' }));
    });

    const outcomes = await Promise.allSettled([create(one), create(two)]);
    const won = outcomes.filter(o => o.status === 'fulfilled').length;

    check('exactly one of them created it', won === 1,
        JSON.stringify(outcomes.map(o => o.status)));

    const after = await getDoc(doc(one, PATH));
    check('and the document that exists is a complete one',
        after.exists() && Array.isArray(after.data().workers)
        && typeof after.data().updatedAt === 'string');

    // The loser's work is not lost: its edits become an ordinary field merge, which is
    // what they were always going to be.
    await passes('the device that lost the race can still write its day',
        updateDoc(doc(two, PATH), {
            'days.2026-08-13.actual.w_01': { entries: [{ placeId: 'p_01' }] },
            updatedAt: new Date().toISOString()
        }));

    const merged = await getDoc(doc(one, PATH));
    check('and both devices\' work is in the document',
        Boolean(merged.data().days && merged.data().days['2026-08-13']));
}

// ---------------------------------------------------------------- the backup
{
    suite('the daily copies are a backup, not another mirror');

    await env.clearFirestore();
    const db = as(ALLOWED);

    await passes('a day\'s copy can be created',
        setDoc(doc(db, 'history/2026-08-12'), schedule()));
    await passes('and read',
        getDoc(doc(db, 'history/2026-08-12')));

    // This is the whole reason it counts as a backup: a later, already-damaged state
    // cannot overwrite it, and no careless tap or bug in the client can remove it.
    await denied('but never overwritten',
        setDoc(doc(db, 'history/2026-08-12'), schedule({ workers: [] })));
    await denied('nor updated in place',
        updateDoc(doc(db, 'history/2026-08-12'), { updatedAt: new Date().toISOString() }));
    await denied('nor deleted',
        deleteDoc(doc(db, 'history/2026-08-12')));

    await denied('and a stranger cannot read the copies either',
        getDoc(doc(as(STRANGER), 'history/2026-08-12')));
}

// ---------------------------------------------------------------- the v71 upgrade
{
    suite('a restore left behind by v71 can actually be sent');

    await env.clearFirestore();
    const db = as(ALLOWED);

    // The record exactly as v71 wrote one: the bare cloud document, captured before
    // State.save had stamped it - so updatedAt is null. Frozen here rather than built
    // with today's helpers, because the question is whether a record from a build that
    // no longer exists still works.
    const v71 = {
        schemaVersion: 2,
        workers: [{ id: 'w_01', name: 'דוד', active: true, dailyRate: 400, hourlyRate: 50 }],
        places: [{ id: 'p_01', name: 'הרצליה', active: true }],
        days: { '2026-07-01': { plan: {}, actual: { w_01: { entries: [{ placeId: 'p_01' }] } } } },
        advances: {},
        updatedAt: null,
        updatedBy: null,
        roster: {
            workers: { w_01: { id: 'w_01', name: 'דוד', active: true, dailyRate: 400, hourlyRate: 50 } },
            places: { p_01: { id: 'p_01', name: 'הרצליה', active: true } },
            workerOrder: ['w_01'],
            placeOrder: ['p_01']
        }
    };

    await passes('the project exists first', setDoc(doc(db, PATH), schedule()));

    // This is why the upgrade stamps it. Sent as it stands, the rules refuse it - and
    // they refuse it again on every retry, for as long as the record exists.
    await denied('the record as v71 left it is refused, and always would be',
        setDoc(doc(db, PATH), v71));

    // What freezeLegacyReplacement makes of it.
    const upgraded = { ...v71, updatedAt: new Date().toISOString(), updatedBy: 'd_here' };
    await passes('the upgraded document is accepted',
        setDoc(doc(db, PATH), upgraded));

    const after = await getDoc(doc(db, PATH));
    check('and it lands whole, roster and all',
        Boolean(after.data().days['2026-07-01'])
        && Boolean(after.data().roster.workers.w_01),
        JSON.stringify(Object.keys(after.data())));
}

// ---------------------------------------------------------------- the tombstone itself
{
    suite('a tombstone written the way the adapter writes it is a stored null');

    // The whole removal protocol rests on one claim about Firestore that the app has
    // never actually asked Firestore to confirm: updateDoc(ref, path, null) STORES a null
    // at that path, it does not remove the field. deleteField() removes fields, and this
    // app has never sent one.
    //
    // If that claim were wrong the tombstone would evaporate on the way to the server,
    // the stale whole array would be the last word on that man, and he would come back on
    // every phone - with the node suite passing, because the fake would be modelling the
    // belief rather than the database. So it is asked here, of the real thing, through the
    // same FieldPath the adapter builds: a dotted string would throw on days.2026-08-12,
    // which is why the adapter constructs segments in the first place.
    const db = as(ALLOWED);
    await env.clearFirestore();
    await passes('the document exists first', setDoc(doc(db, PATH), schedule({
        roster: {
            workers: { w_01: { id: 'w_01', name: 'דוד', active: true, dailyRate: 400, hourlyRate: 50 } },
            places: { p_01: { id: 'p_01', name: 'הרצליה', active: true } },
            workerOrder: ['w_01'],
            placeOrder: ['p_01']
        }
    })));

    await passes('a null at roster.workers.<id> is accepted',
        updateDoc(doc(db, PATH),
            new FieldPath('roster', 'workers', 'w_01'), null,
            new FieldPath('updatedAt'), '2026-08-12T10:00:00.000Z'));

    const after = await getDoc(doc(db, PATH));
    const roster = after.data().roster.workers;
    check('the field is still THERE after the round trip',
        Object.prototype.hasOwnProperty.call(roster, 'w_01'),
        JSON.stringify(Object.keys(roster)));
    check('and its value is null, not undefined and not missing',
        roster.w_01 === null, JSON.stringify(roster.w_01));
    check('while the site map beside it is untouched',
        Boolean(after.data().roster.places.p_01),
        JSON.stringify(Object.keys(after.data().roster.places)));

    // And a second phone reading the document back sees the same thing, which is what
    // mergeRoster is handed.
    const second = await getDoc(doc(as(ALSO_ALLOWED), PATH));
    check('a second device reads the same stored null',
        Object.prototype.hasOwnProperty.call(second.data().roster.workers, 'w_01')
        && second.data().roster.workers.w_01 === null,
        JSON.stringify(second.data().roster.workers));
}

// ---------------------------------------------------------------- everything else
{
    suite('anything not named is denied');

    const db = as(ALLOWED);
    await denied('a collection nobody wrote a rule for is closed',
        setDoc(doc(db, 'somethingElse/x'), { updatedAt: 'now' }));
}

await env.cleanup();
report();
