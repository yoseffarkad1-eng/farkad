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

// ---------------------------------------------------------------- writing the way the client does
//
// Every write to the schedule now carries the ordering envelope: a protocol version, the
// next revision, and the id of the operation it applies - whose immutable receipt has to
// land in the same commit. See docs/sync-protocol.md and the protocol suites at the end of
// this file for what each part is for.
//
// These helpers exist so the suites above them keep asking their own questions. A test
// about the allowlist should fail because the address is not listed, not because it forgot
// a revision, and before these helpers every one of them was writing in the shape the
// released build sends - which the rules now refuse on purpose.
let opSeq = 0;
const nextOp = () => `op_${opSeq += 1}`;

const envelope = (data, revision, opId) =>
    Object.assign({}, data, { protocol: 1, revision, lastOpId: opId });

// A first write and its receipt, in one commit.
function createProtocol(db, path, data) {
    const opId = nextOp();
    return runTransaction(db, async transaction => {
        transaction.set(doc(db, path), envelope(data || schedule(), 1, opId));
        transaction.set(doc(db, `${path}/receipts/${opId}`),
            { revision: 1, at: new Date().toISOString(), by: 'd_test' });
    });
}

// An ordinary edit at the next revision. The base is READ, never assumed - which is the
// compare-and-set: if another device wrote between the read and this commit, the rule
// refuses it rather than letting it overwrite.
async function editProtocol(db, path, patch) {
    const snapshot = await getDoc(doc(db, path));
    const revision = ((snapshot.data() || {}).revision || 0) + 1;
    const opId = nextOp();
    return runTransaction(db, async transaction => {
        transaction.update(doc(db, path), envelope(patch, revision, opId));
        transaction.set(doc(db, `${path}/receipts/${opId}`),
            { revision, at: new Date().toISOString(), by: 'd_test' });
    });
}

// A whole-document replacement at the next revision - a restore, or the v71 upgrade.
async function editProtocolReplace(db, path, data) {
    const snapshot = await getDoc(doc(db, path));
    const revision = ((snapshot.data() || {}).revision || 0) + 1;
    const opId = nextOp();
    return runTransaction(db, async transaction => {
        transaction.set(doc(db, path), envelope(data, revision, opId));
        transaction.set(doc(db, `${path}/receipts/${opId}`),
            { revision, at: new Date().toISOString(), by: 'd_test' });
    });
}

// ---------------------------------------------------------------- who gets in
{
    suite('the allowlist is the whole access control');

    await env.clearFirestore();

    await passes('a listed address can create the schedule',
        createProtocol(as(ALLOWED), PATH));
    await passes('and read it back',
        getDoc(doc(as(ALLOWED), PATH)));
    await passes('a second listed address can write to the same document',
        editProtocol(as(ALSO_ALLOWED), PATH, { updatedAt: new Date().toISOString() }));

    await denied('an address nobody listed cannot read it',
        getDoc(doc(as(STRANGER), PATH)));
    await denied('nor write to it',
        createProtocol(as(STRANGER), PATH));
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
        createProtocol(as(ALLOWED), PATH));

    // A field-level edit carries only the path it changed, so it is exempt from the
    // shape check - requiring the roster there would reject every ordinary write.
    await passes('a single field edit needs only its own path and a stamp',
        editProtocol(as(ALLOWED), PATH, {
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
        editProtocol(as(ALLOWED), PATH, {
            'days.2026-08-13.actual.w_01': { entries: [{ placeId: 'p_01' }] }
        }));
}

// ---------------------------------------------------------------- the race
{
    suite('two devices creating the first document at the same moment');

    await env.clearFirestore();

    const one = as(ALLOWED);
    const two = as(ALSO_ALLOWED);

    // The first write, with its receipt, both inside the transaction that checks the
    // document is not there yet. The receipt id has to be distinct per attempt or the two
    // racers would be writing the same receipt - which is the one document a retry is
    // allowed to find, and would make the loser look like a duplicate of the winner.
    const create = db => {
        const opId = nextOp();
        return runTransaction(db, async transaction => {
            const snapshot = await transaction.get(doc(db, PATH));
            if (snapshot.exists()) {
                const error = new Error('already-exists');
                error.code = 'already-exists';
                throw error;
            }
            transaction.set(doc(db, PATH), envelope(
                schedule({ updatedBy: db === one ? 'd_one' : 'd_two' }), 1, opId));
            transaction.set(doc(db, `${PATH}/receipts/${opId}`),
                { revision: 1, at: new Date().toISOString(), by: 'd_test' });
        });
    };

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
        editProtocol(two, PATH, {
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

    await passes('the project exists first', createProtocol(db, PATH));

    // This is why the upgrade stamps it. Sent as it stands, the rules refuse it - and
    // they refuse it again on every retry, for as long as the record exists.
    await denied('the record as v71 left it is refused, and always would be',
        setDoc(doc(db, PATH), v71));

    // What freezeLegacyReplacement makes of it. It also has to carry the ordering
    // envelope now - a whole-document replacement is a write like any other, and the
    // revision it claims has to be the one after what is there.
    const upgraded = { ...v71, updatedAt: new Date().toISOString(), updatedBy: 'd_here' };
    await passes('the upgraded document is accepted',
        editProtocolReplace(db, PATH, upgraded));

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
    await passes('the document exists first', createProtocol(db, PATH, schedule({
        roster: {
            workers: { w_01: { id: 'w_01', name: 'דוד', active: true, dailyRate: 400, hourlyRate: 50 } },
            places: { p_01: { id: 'p_01', name: 'הרצליה', active: true } },
            workerOrder: ['w_01'],
            placeOrder: ['p_01']
        }
    })));

    // Through the same FieldPath the adapter builds, and with the envelope beside it - a
    // dotted string would throw on days.2026-08-12, which is why the adapter constructs
    // segments in the first place.
    const tombstoneOp = nextOp();
    await passes('a null at roster.workers.<id> is accepted',
        runTransaction(db, async transaction => {
            const snapshot = await transaction.get(doc(db, PATH));
            const revision = ((snapshot.data() || {}).revision || 0) + 1;
            transaction.update(doc(db, PATH),
                new FieldPath('roster', 'workers', 'w_01'), null,
                new FieldPath('updatedAt'), '2026-08-12T10:00:00.000Z',
                new FieldPath('protocol'), 1,
                new FieldPath('revision'), revision,
                new FieldPath('lastOpId'), tombstoneOp);
            transaction.set(doc(db, `${PATH}/receipts/${tombstoneOp}`),
                { revision, at: new Date().toISOString(), by: 'd_test' });
        }));

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

// ---------------------------------------------------------------- the ordering protocol
//
// Three phones share one document and the client-side send claim is a localStorage lease -
// it coordinates tabs of one browser profile and has never been able to order writes
// across phones, which share no storage. The ordering has to be enforced by the only party
// all three can agree with, which is this file.
//
// The protocol, in the shape the rules can check (see docs/sync-protocol.md):
//
//   protocol   an integer, the version the writer speaks. A write without one is refused,
//              which is how a build that predates the protocol is noticed LOUDLY instead
//              of diverging quietly.
//   revision   an integer that goes up by exactly one per accepted write. This is the
//              compare-and-set: two phones that both read revision 5 both try to write 6,
//              and the second one's 6 is no longer old + 1, so it is refused rather than
//              silently overwriting the first.
//   lastOpId   the operation this write carries, which must have an immutable receipt
//              created in the same commit. getAfter() is what makes that atomic: the rule
//              can only be satisfied if both documents land together.
//
// Receipts are what make a retry safe. A request that may still land can be retried
// because the second attempt finds its own receipt and stops.
{
    suite('the write protocol: a version on every write');

    const db = as(ALLOWED);
    const P = 'schedules/protocol';

    await denied('a document created without a protocol version is refused',
        setDoc(doc(db, P), schedule({ revision: 1 })));
    await denied('and one without a revision is refused too',
        setDoc(doc(db, P), schedule({ protocol: 1 })));
    await denied('a first write whose revision is not one is refused',
        setDoc(doc(db, P), schedule({ protocol: 1, revision: 7, lastOpId: 'op_a' })));

    // A v86 phone writes neither field. It is refused, visibly, which is the requirement:
    // a legacy writer cannot bypass the protocol unnoticed.
    await denied('a write in the shape the released build sends is refused',
        setDoc(doc(db, P), schedule()));
}

{
    suite('the write protocol: one step at a time');

    const db = as(ALLOWED);
    const P = 'schedules/cas';
    const receipt = (base, opId) => doc(db, `${P}/receipts/${opId}`);

    // The first write of a document, with its receipt, in one commit.
    await passes('a first write lands with its receipt',
        (async () => {
            const batch = [];
            await runTransaction(db, async transaction => {
                transaction.set(doc(db, P), schedule({ protocol: 1, revision: 1, lastOpId: 'op_1' }));
                transaction.set(receipt(0, 'op_1'), { revision: 1, at: 'x', by: 'd_a' });
            });
            return batch;
        })());

    await denied('a write with no receipt beside it is refused',
        updateDoc(doc(db, P), {
            protocol: 1, revision: 2, lastOpId: 'op_2',
            'days.2026-08-12.actual.w_01': { entries: [] },
            updatedAt: new Date().toISOString()
        }));

    await denied('a write that skips a revision is refused',
        runTransaction(db, async transaction => {
            transaction.update(doc(db, P), {
                protocol: 1, revision: 9, lastOpId: 'op_9',
                updatedAt: new Date().toISOString()
            });
            transaction.set(receipt(1, 'op_9'), { revision: 9, at: 'x', by: 'd_a' });
        }));

    await denied('a write that repeats the revision it read is refused',
        runTransaction(db, async transaction => {
            transaction.update(doc(db, P), {
                protocol: 1, revision: 1, lastOpId: 'op_1b',
                updatedAt: new Date().toISOString()
            });
            transaction.set(receipt(0, 'op_1b'), { revision: 1, at: 'x', by: 'd_a' });
        }));

    await passes('the next write in order lands',
        runTransaction(db, async transaction => {
            transaction.update(doc(db, P), {
                protocol: 1, revision: 2, lastOpId: 'op_2',
                'days.2026-08-12.actual.w_01': { entries: [{ placeId: 'p_01' }] },
                updatedAt: new Date().toISOString()
            });
            transaction.set(receipt(1, 'op_2'), { revision: 2, at: 'x', by: 'd_a' });
        }));

    await denied('a receipt whose revision disagrees with the document is refused',
        runTransaction(db, async transaction => {
            transaction.update(doc(db, P), {
                protocol: 1, revision: 3, lastOpId: 'op_3',
                updatedAt: new Date().toISOString()
            });
            transaction.set(receipt(2, 'op_3'), { revision: 99, at: 'x', by: 'd_a' });
        }));
}

{
    suite('a receipt is never creatable on its own');

    // WHAT THIS SUITE EXISTS FOR, reproduced before it was closed:
    //
    //   schedules/current/receipts/op_never_applied   { revision: 999 }
    //
    // created by anybody on the list, with no schedule write anywhere near it, and
    // accepted - the rule asked only that the revision be an integer of one or more.
    //
    // The client treats an existing receipt as proof that its operation landed. That is
    // the whole point of a receipt and it is what makes a retry safe. So a receipt for an
    // operation nothing applied is a lie this client is built to believe: it finds it,
    // answers success, acknowledges, and prunes the queue. An evening off somebody's
    // phone on the strength of a record that nothing wrote.
    const db = as(ALLOWED);
    const P = 'schedules/orphan';
    const receipt = opId => doc(db, `${P}/receipts/${opId}`);

    await denied('a receipt for a document that does not exist is refused',
        setDoc(receipt('op_never_applied'), { revision: 999, at: 'x', by: 'd_a' }));

    // A real document, so the rest of the refusals are about the receipt and not about
    // the document being missing.
    await passes('a first write lands with its receipt',
        runTransaction(db, async transaction => {
            transaction.set(doc(db, P), schedule({ protocol: 1, revision: 1, lastOpId: 'op_1' }));
            transaction.set(receipt('op_1'), { revision: 1, at: 'x', by: 'd_a' });
        }));

    await denied('a receipt beside a document that is not moving is refused',
        setDoc(receipt('op_never_applied'), { revision: 999, at: 'x', by: 'd_a' }));
    await denied('and one claiming the revision the document already holds is refused too',
        setDoc(receipt('op_alone'), { revision: 1, at: 'x', by: 'd_a' }));

    // NAMING SOMEBODY ELSE'S WRITE. The schedule moves, and the receipt created beside it
    // carries a different operation id - so a retry of op_wrong would find a receipt and
    // stop, for a write that applied op_right.
    await denied('a receipt whose operation id is not the one the document applied is refused',
        runTransaction(db, async transaction => {
            transaction.update(doc(db, P), {
                protocol: 1, revision: 2, lastOpId: 'op_right',
                updatedAt: new Date().toISOString()
            });
            transaction.set(receipt('op_wrong'), { revision: 2, at: 'x', by: 'd_a' });
        }));

    await denied('a receipt whose revision is not the one the document reached is refused',
        runTransaction(db, async transaction => {
            transaction.update(doc(db, P), {
                protocol: 1, revision: 2, lastOpId: 'op_two',
                updatedAt: new Date().toISOString()
            });
            transaction.set(receipt('op_two'), { revision: 7, at: 'x', by: 'd_a' });
        }));

    await passes('the pair that agrees with itself lands',
        runTransaction(db, async transaction => {
            transaction.update(doc(db, P), {
                protocol: 1, revision: 2, lastOpId: 'op_two',
                'days.2026-08-12.actual.w_01': { entries: [{ placeId: 'p_01' }] },
                updatedAt: new Date().toISOString()
            });
            transaction.set(receipt('op_two'), { revision: 2, at: 'x', by: 'd_a' });
        }));
}

{
    suite('receipts are immutable, which is what makes a retry safe');

    const db = as(ALLOWED);
    const P = 'schedules/receipts-immutable';

    await passes('a receipt is created with its write',
        runTransaction(db, async transaction => {
            transaction.set(doc(db, P), schedule({ protocol: 1, revision: 1, lastOpId: 'op_r' }));
            transaction.set(doc(db, `${P}/receipts/op_r`), { revision: 1, at: 'x', by: 'd_a' });
        }));

    await denied('and can never be changed afterwards',
        updateDoc(doc(db, `${P}/receipts/op_r`), { revision: 2 }));
    await denied('nor deleted',
        deleteDoc(doc(db, `${P}/receipts/op_r`)));
    await passes('but it can be read, which is how a retry knows it already succeeded',
        getDoc(doc(db, `${P}/receipts/op_r`)));
    await denied('and a stranger cannot read it',
        getDoc(doc(as(STRANGER), `${P}/receipts/op_r`)));
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
