// Two phones writing MONEY at the same moment, through the production adapter, against a
// real Firestore.
//
//   firebase emulators:exec --only firestore "node tests/money.concurrency.test.mjs"
//
// tests/concurrency.test.mjs races two tabs of one browser across one disk.
// tests/repayment.test.mjs races two in-memory copies of a schedule and merges them by
// hand. Both are honest about what they are, and neither is two phones: the merge in the
// second one is a line of test code doing what Firestore is being trusted to do.
//
// This file is the other thing. Two devices, each with the real js/sync/sync.js talking to
// the real js/sync/firebase-adapter.js against the emulator, both recording against the
// same man's advance, at the same time. What is asked of every case is the same three
// things, because they are what the money needs:
//
//   every immutable event survives - nothing is dropped to make the arithmetic tidy
//   an over-settled advance is SURFACED, never silently clamped away
//   and what the two phones end up holding is the same record

import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { makeDevice, settle, settleUntil } from './harness.mjs';
import { suite, check, given, report } from './runner.mjs';

const ADAPTER = fileURLToPath(new URL('../js/sync/firebase-adapter.js', import.meta.url));
const SHIM = fileURLToPath(new URL('../js/sync/_adapter-money-test.mjs', import.meta.url));
const CONFIG = fileURLToPath(new URL('../js/sync/_money-test-config.mjs', import.meta.url));

const source = readFileSync(ADAPTER, 'utf8');
const rewritten = source
    .replace('"https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js"', '"firebase/app"')
    .replace('"https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js"', '"firebase/auth"')
    .replace('"https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js"', '"firebase/firestore"')
    .replace("from './firebase-config.js'", "from './_money-test-config.mjs'");

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
        JSON.stringify(moved.map(at => before[at].trim().slice(0, 50))));
    check('and no real project credential travels into the module under test',
        rewritten.indexOf("from './firebase-config.js'") === -1);
}

writeFileSync(CONFIG, 'export const firebaseConfig = { apiKey: "", projectId: "" };\n'
    + 'export const SCHEDULE_DOC_PATH = "schedules/current";\n');
writeFileSync(SHIM, rewritten);
let firestoreOps;
try {
    ({ firestoreOps } = await import('./../js/sync/_adapter-money-test.mjs'));
} finally {
    try { unlinkSync(SHIM); } catch (error) { /* best effort */ }
    try { unlinkSync(CONFIG); } catch (error) { /* best effort */ }
}

const { doc, getDoc, setDoc, onSnapshot } = await import('firebase/firestore');

const env = await initializeTestEnvironment({
    projectId: 'farkad-money-concurrency',
    firestore: {
        rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'),
        host: '127.0.0.1',
        port: 8080
    }
});

const ALLOWED = 'yosef.farkad1@gmail.com';
const as = email => env.authenticatedContext(email.replace(/[^a-z0-9]/gi, ''), { email }).firestore();
const PATH = ['schedules', 'current'];

// עומר סעד, the one worked example: 500 a day and 50 an hour, six pay-days and one hour.
const WORKERS = [{ id: 'w_01', name: 'עומר סעד', active: true, dailyRate: 500, hourlyRate: 50 }];
const PLACES = [{ id: 'p_01', name: 'הרצליה', active: true }];
const A = { from: '2026-08-07', to: '2026-08-20' };
const ADVANCE = 'a_omer';

const SEED = () => ({
    schemaVersion: 2,
    workers: WORKERS.map(w => ({ ...w })),
    places: PLACES.map(p => ({ ...p })),
    days: {
        '2026-08-07': { actual: { w_01: { entries: [{ placeId: 'p_01' }], rates: { daily: 500, hourly: 50 } } } },
        '2026-08-10': { actual: { w_01: { entries: [{ placeId: 'p_01' }], rates: { daily: 500, hourly: 50 } } } },
        '2026-08-11': { actual: { w_01: { entries: [{ placeId: 'p_01' }], rates: { daily: 500, hourly: 50 } } } },
        '2026-08-12': { actual: { w_01: { entries: [{ placeId: 'p_01' }], rates: { daily: 500, hourly: 50 } } } },
        '2026-08-13': { actual: { w_01: { entries: [{ placeId: 'p_01' }], rates: { daily: 500, hourly: 50 } } } },
        // The one hour, so that the gross is the worked example's 3,050 and not 3,000.
        '2026-08-14': { actual: { w_01: { entries: [{ placeId: 'p_01', extraHours: 1 }], rates: { daily: 500, hourly: 50 } } } }
    },
    advances: {
        [ADVANCE]: { id: ADVANCE, workerId: 'w_01', date: '2026-08-10', amount: 5000, note: '' }
    },
    ledger: {
        advances: {
            ['le_mig_' + ADVANCE]: {
                id: 'le_mig_' + ADVANCE, advanceId: ADVANCE, kind: 'given', workerId: 'w_01',
                date: '2026-08-10', amount: 5000, note: '', at: '', by: 'd_seed',
                origin: 'migration'
            }
        },
        unreadable: {}
    },
    updatedAt: '2026-08-15T18:00:00.000Z',
    updatedBy: 'd_seed',
    protocol: 1,
    revision: 1,
    lastOpId: 'op_seed'
});

async function reseed() {
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async ctx => {
        await setDoc(doc(ctx.firestore(), ...PATH), SEED());
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

function adapterFor(db) {
    const ops = firestoreOps(db, doc(db, ...PATH), id => doc(db, ...PATH, 'receipts', String(id)));
    // Across the realm boundary: the device runs in its own V8 context, so its objects are
    // instances of that context's Object and the SDK refuses them. A JSON round-trip is
    // what the wire does anyway.
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
                snap => onNext(snap.exists() ? snap.data() : null),
                error => onError(error));
            return () => stop();
        }
    };
}

// A phone holding the seeded record, with both gates open and the carry migration already
// approved - this file is about concurrency, and L3 measures the approval on its own.
function phone(id) {
    const device = makeDevice({ deviceId: id,
        flags: { carryAdvances: true, ledgerWrites: true } });
    device.Sync.pushDelayMs = 5;
    device.setToday('2026-08-26');
    device.ctx.askTell = () => Promise.resolve();
    const seed = SEED();
    device.State.schedule.workers = seed.workers;
    device.State.schedule.places = seed.places;
    device.State.schedule.days = seed.days;
    device.State.schedule.advances = seed.advances;
    device.State.schedule.ledger = seed.ledger;
    device.State.save({ silent: true });
    const plan = device.call('planCarryMigration', device.State.schedule);
    if (plan.needed) {
        device.State.commit(device.call('recordCarryApproval', device.State.schedule,
            plan, '2026-08-26T08:00:00.000Z', id));
    }
    device.Sync.connect(adapterFor(as(ALLOWED)));
    return device;
}

const entriesOf = raw => Object.values(((raw || {}).ledger || {}).advances || {});
const kindsOf = raw => entriesOf(raw).map(e => `${e.kind}:${e.amount}`).sort();

// Both phones quiet AND holding the same document.
//
// An empty queue is only half of it: the phone that wrote last has nothing pending the
// moment its own write lands, while the other one has not been handed the snapshot yet.
// Comparing the two records at that moment compares one phone against the past, and the
// comparison passes or fails on timing rather than on behaviour. The revision is the
// server's own count of accepted writes, so equal revisions on both phones is the only
// statement that both have seen the same record.
const recordOf = device => JSON.stringify([kindsOf(device.State.schedule),
    Object.keys(device.State.schedule.days || {}).sort()]);

async function bothSettled(a, b) {
    await settleUntil(() => a.Sync.pendingCount() === 0 && b.Sync.pendingCount() === 0
        && recordOf(a) === recordOf(b), 20000, 40);
    await settle(400);
}

// ============================================================ two repayments at once
{
    suite('two phones recording the same repayment');

    await reseed();
    const a = phone('d_a');
    const b = phone('d_b');
    await settle(700);

    // Both are told the man handed back 500. Both record it. Both are RIGHT to record it -
    // an append-only ledger that dropped one would be losing the evidence needed to work
    // out which of them is the mistake.
    a.State.commit(a.call('recordAdvanceRepaid', a.State.schedule, ADVANCE, 500,
        '2026-08-24', 'מזומן', '2026-08-24T09:00:00.000Z', 'd_a', 'cash'));
    b.State.commit(b.call('recordAdvanceRepaid', b.State.schedule, ADVANCE, 500,
        '2026-08-24', 'מזומן', '2026-08-24T09:00:01.000Z', 'd_b', 'cash'));
    await bothSettled(a, b);

    const cloud = await readDoc();
    const repayments = entriesOf(cloud).filter(e => e.kind === 'repaid');
    check('both repayments are in the cloud', repayments.length === 2,
        JSON.stringify(kindsOf(cloud)));
    check('and the origin is still there under them',
        entriesOf(cloud).some(e => e.kind === 'given' && e.amount === 5000),
        JSON.stringify(kindsOf(cloud)));

    // The one thing that must not happen: 1,000 settled against 5,000 given is not a
    // problem, but 1,000 settled against 500 given would be - and either way the app may
    // not quietly average it. Here the advance is large enough that both are ordinary.
    const owed = a.call('advanceOutstanding', a.State.schedule, ADVANCE);
    check('the debt is what the record says, not what one phone saw',
        owed.repaid === 1000 && owed.left === 4000, JSON.stringify(owed));
    check('and neither phone is left holding work',
        a.Sync.pendingCount() === 0 && b.Sync.pendingCount() === 0,
        `A ${a.Sync.pendingCount()} / B ${b.Sync.pendingCount()}`);
    check('nor claiming to be synced while it is',
        a.Sync.status === 'synced' && b.Sync.status === 'synced',
        `${a.Sync.status} / ${b.Sync.status}`);
}

// ============================================================ over-settling, surfaced
{
    suite('two repayments that together exceed the advance are surfaced, not clamped');

    await reseed();
    const a = phone('d_over_a');
    const b = phone('d_over_b');
    await settle(700);

    // The whole advance, twice. This is the case the app must never tidy away: both
    // entries are real records of something somebody said, and which of them is the
    // mistake is a question for a person.
    a.State.commit(a.call('recordAdvanceRepaid', a.State.schedule, ADVANCE, 5000,
        '2026-08-24', '', '2026-08-24T09:00:00.000Z', 'd_over_a', 'cash'));
    b.State.commit(b.call('recordAdvanceRepaid', b.State.schedule, ADVANCE, 5000,
        '2026-08-24', '', '2026-08-24T09:00:01.000Z', 'd_over_b', 'cash'));
    await bothSettled(a, b);

    const cloud = await readDoc();
    check('both entries survived',
        entriesOf(cloud).filter(e => e.kind === 'repaid').length === 2,
        JSON.stringify(kindsOf(cloud)));

    const owed = a.call('advanceOutstanding', a.State.schedule, ADVANCE);
    check('the debt is zero and never a negative number', owed.left === 0,
        JSON.stringify(owed));
    check('the surplus is named rather than swallowed', owed.overpaid === 5000,
        JSON.stringify(owed));
    const flagged = a.call('overpaidAdvances', a.State.schedule, 'w_01');
    check('and the advance is flagged for a person to look at',
        flagged.length === 1 && flagged[0].id === ADVANCE, JSON.stringify(flagged));

    // AND NOTHING COMES OFF HIS WAGE WHILE IT STANDS.
    const walk = a.call('advanceAccount', a.State.schedule, 'w_01', A.from, A.to);
    check('the automatic deduction is held', walk.deducted === 0 && walk.review === true,
        JSON.stringify(walk));

    // Both phones hold the same record, which is the point of doing this against a real
    // server rather than merging two objects by hand.
    check('the two phones agree, entry for entry',
        JSON.stringify(kindsOf(a.State.schedule)) === JSON.stringify(kindsOf(b.State.schedule)),
        JSON.stringify([kindsOf(a.State.schedule), kindsOf(b.State.schedule)]));
}

// ============================================================ a repayment racing a closure
{
    suite('a repayment racing the wage deduction that closes the period');

    await reseed();
    const a = phone('d_race_close');
    const b = phone('d_race_pay');
    await settle(700);

    // One phone closes the fortnight; the other records cash handed back, at the same
    // moment. Neither knows about the other.
    const changes = a.call('closePeriodChanges', a.State.schedule, 'w_01', A.from, A.to,
        '2026-08-20T18:00:00.000Z', 'd_race_close');
    given('there is a closure to write', changes.length === 1, String(changes.length));
    a.State.commitMany(changes);
    // DATED INTO THE CLOSED FORTNIGHT, which is the case worth racing: money handed back
    // on the 18th, recorded while the other phone is closing the period it falls in. A
    // repayment dated after the period would move nothing in it and prove nothing here.
    b.State.commit(b.call('recordAdvanceRepaid', b.State.schedule, ADVANCE, 400,
        '2026-08-18', '', '2026-08-24T09:00:00.000Z', 'd_race_pay', 'cash'));
    await bothSettled(a, b);

    const cloud = await readDoc();
    check('both the closure and the repayment are on the record',
        entriesOf(cloud).some(e => e.kind === 'deducted')
        && entriesOf(cloud).some(e => e.kind === 'repaid'),
        JSON.stringify(kindsOf(cloud)));
    check('the two phones agree',
        JSON.stringify(kindsOf(a.State.schedule)) === JSON.stringify(kindsOf(b.State.schedule)),
        JSON.stringify([kindsOf(a.State.schedule), kindsOf(b.State.schedule)]));

    // THE PAYSLIP IS NOT REWRITTEN by a repayment that arrived after it closed. It is the
    // rule the whole feature rests on, and a race is where it would break.
    const walk = a.call('advanceAccount', a.State.schedule, 'w_01', A.from, A.to);
    check('the closed period reports what it was closed on',
        walk.closed === true && walk.carriedOut === 1950, JSON.stringify(walk));
    check('and the late repayment is not lost - it moves the live balance instead',
        walk.carriedForward === 1550 && walk.lateSinceClose === -400, JSON.stringify(walk));
}

// ============================================================ two closures at once
{
    suite('two phones closing the same account');

    await reseed();
    const a = phone('d_close_a');
    const b = phone('d_close_b');
    await settle(700);

    a.State.commitMany(a.call('closePeriodChanges', a.State.schedule, 'w_01', A.from, A.to,
        '2026-08-20T18:00:00.000Z', 'd_close_a'));
    b.State.commitMany(b.call('closePeriodChanges', b.State.schedule, 'w_01', A.from, A.to,
        '2026-08-20T18:00:05.000Z', 'd_close_b'));
    await bothSettled(a, b);

    const cloud = await readDoc();
    const closures = entriesOf(cloud).filter(e => e.kind === 'deducted');
    check('the record holds ONE closure, not two', closures.length === 1,
        JSON.stringify(closures.map(c => [c.amount, c.balanceAfter, c.by])));
    check('carrying the money it was closed on whichever phone wrote it',
        closures[0].amount === 3050 && closures[0].balanceAfter === 1950,
        JSON.stringify(closures[0]));

    const walk = a.call('advanceAccount', a.State.schedule, 'w_01', A.from, A.to);
    check('so the payslip is 3,050 off and 1,950 left, not 6,100 and 3,900',
        walk.deducted === 3050 && walk.carriedOut === 1950, JSON.stringify(walk));
    check('and nothing is held aside as impossible',
        a.call('impossibleClosures', a.State.schedule).length === 0,
        JSON.stringify(a.call('impossibleClosures', a.State.schedule)));
}

// ============================================================ two corrections at once
{
    suite('two phones correcting the same transaction');

    await reseed();
    const a = phone('d_fix_a');
    const b = phone('d_fix_b');
    await settle(700);

    // A repayment that never happened, on the record and on both phones.
    const repay = a.call('recordAdvanceRepaid', a.State.schedule, ADVANCE, 400,
        '2026-08-24', '', '2026-08-24T09:00:00.000Z', 'd_fix_a', 'cash');
    a.State.commit(repay);
    await settleUntil(() => Boolean(b.State.schedule.ledger.advances[repay.value.id]),
        10000, 40);
    given('both phones can see the repayment',
        Boolean(b.State.schedule.ledger.advances[repay.value.id]));

    a.State.commit(a.call('recordEventReversed', a.State.schedule, repay.value.id, 400,
        '2026-08-25', 'לא הוחזר בפועל', '2026-08-25T09:00:00.000Z', 'd_fix_a'));
    b.State.commit(b.call('recordEventReversed', b.State.schedule, repay.value.id, 400,
        '2026-08-25', 'לא הוחזר בפועל', '2026-08-25T09:00:05.000Z', 'd_fix_b'));
    await bothSettled(a, b);

    const cloud = await readDoc();
    const fixes = entriesOf(cloud).filter(e => e.kind === 'reversed');
    check('the record holds ONE correction, not two', fixes.length === 1,
        JSON.stringify(fixes.map(f => [f.amount, f.targetId, f.by])));
    check('naming the transaction it corrects',
        fixes[0].targetId === repay.value.id && fixes[0].targetKind === 'repaid',
        JSON.stringify(fixes[0]));
    check('and the repayment it corrects is still on the record',
        entriesOf(cloud).some(e => e.id === repay.value.id), JSON.stringify(kindsOf(cloud)));

    // THE MONEY MOVED ONCE. Two corrections of one repayment would push the debt up
    // twice, for cash that was wrong once.
    const owed = a.call('advanceOutstanding', a.State.schedule, ADVANCE);
    check('the debt is back to the whole advance, once',
        owed.left === 5000 && owed.repaid === 0, JSON.stringify(owed));
    check('and no overpayment was invented', owed.overpaid === 0, JSON.stringify(owed));
}

// ============================================================ the migration racing a write
{
    suite('one phone approving the migration while the other records a day');

    await reseed();
    const a = phone('d_mig_a');
    const b = phone('d_mig_b');
    await settle(700);

    // A is on the review screen; B is recording an evening. Neither is waiting for the
    // other, and neither should have to.
    const plan = a.call('planCarryMigration', a.State.schedule);
    if (plan.needed) {
        a.State.commit(a.call('recordCarryApproval', a.State.schedule, plan,
            '2026-08-26T09:00:00.000Z', 'd_mig_a'));
    }
    b.State.commit(b.call('assignPlace', b.State.schedule, '2026-08-17', 'w_01',
        'actual', 'p_01'));
    await bothSettled(a, b);

    const cloud = await readDoc();
    check('the day landed', Boolean((cloud.days || {})['2026-08-17']),
        JSON.stringify(Object.keys(cloud.days || {})));
    check('and the approval is on the record too, where both phones read it',
        Object.keys(((cloud.ledger || {}).migrations) || {}).length === 1
        && a.call('carryMigrationSettled', a.State.schedule) === true
        && b.call('carryMigrationSettled', b.State.schedule) === true,
        JSON.stringify(((cloud.ledger || {}).migrations) || {}));
    check('neither phone is holding work',
        a.Sync.pendingCount() === 0 && b.Sync.pendingCount() === 0,
        `A ${a.Sync.pendingCount()} / B ${b.Sync.pendingCount()}`);
}

// ============================================================ close and reopen after a race
{
    suite('close and reopen after a race, on the phone that lost it');

    await reseed();
    const a = phone('d_reopen_a');
    const b = phone('d_reopen_b');
    await settle(700);

    a.State.commitMany(a.call('closePeriodChanges', a.State.schedule, 'w_01', A.from, A.to,
        '2026-08-20T18:00:00.000Z', 'd_reopen_a'));
    b.State.commit(b.call('recordAdvanceRepaid', b.State.schedule, ADVANCE, 300,
        '2026-08-24', '', '2026-08-24T09:00:00.000Z', 'd_reopen_b', 'cash'));
    await bothSettled(a, b);

    // Whatever each phone was holding, it is on its disk. Reopen from that disk and the
    // record has to be the same one.
    const again = makeDevice({ deviceId: 'd_reopen_b', storage: b.dump(),
        flags: { carryAdvances: true, ledgerWrites: true } });
    again.State.load();

    check('the reopened phone holds every event',
        JSON.stringify(kindsOf(again.State.schedule)) === JSON.stringify(kindsOf(b.State.schedule)),
        JSON.stringify([kindsOf(again.State.schedule), kindsOf(b.State.schedule)]));
    check('and the same money as the phone that won the race',
        JSON.stringify(again.call('advanceOutstanding', again.State.schedule, ADVANCE))
            === JSON.stringify(a.call('advanceOutstanding', a.State.schedule, ADVANCE)),
        JSON.stringify([again.call('advanceOutstanding', again.State.schedule, ADVANCE),
            a.call('advanceOutstanding', a.State.schedule, ADVANCE)]));
    check('nothing is held aside as impossible on either of them',
        again.call('impossibleClosures', again.State.schedule).length === 0
        && a.call('impossibleClosures', a.State.schedule).length === 0);
    check('and no second edit was needed to get there',
        again.Sync.pendingCount() === 0, String(again.Sync.pendingCount()));
}

await env.cleanup();
report();
