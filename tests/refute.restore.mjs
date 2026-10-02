// ATTACKS ON THE RESTORE/LEDGER UNION AND ON THE RESTORE FENCING.
//
//   node tests/refute.restore.mjs        (~30s: one check waits out the send claim)
//
// features/restore-ledger/contract.md says an ordinary restore never erases a financial
// event, on any device, and that after it settles every device and the cloud agree on the
// same set of facts. js/sync/restore.js keeps that promise by unioning the current ledger
// into the restore document at prepare time and then FREEZING those bytes, so the stored,
// the sent and the compared-against document are the same.
//
// These are attempts to break it with two operations in flight at once - not A then B.
// Where a guard held, the check says so and is written down so nobody re-attempts it.
// Where it did not, the check is left failing: S1 is the contract's own headline failure,
// reached through a race rather than through an order.

import { makeDevice, makeCloud, settle, settleUntil, deferred } from './harness.mjs';
import { suite, check, same, given, report } from './runner.mjs';

const GATES = { carryAdvances: true, ledgerWrites: true };
const ADVANCE = 'a_omer';

// עומר סעד, one advance of 5,000 already migrated into the ledger. The money gates are
// opened through the test seam and nowhere else; the shipped defaults stay closed.
const SEED = () => ({
    workers: [{ id: 'w_01', name: 'עומר סעד', active: true, dailyRate: 500, hourlyRate: 50 }],
    places: [{ id: 'p_01', name: 'הרצליה', active: true }],
    days: {
        '2026-08-10': { actual: { w_01: {
            entries: [{ placeId: 'p_01' }], rates: { daily: 500, hourly: 50 } } } }
    },
    advances: { [ADVANCE]: {
        id: ADVANCE, workerId: 'w_01', date: '2026-08-10', amount: 5000, note: '' } },
    ledger: { advances: { ['le_mig_' + ADVANCE]: {
        id: 'le_mig_' + ADVANCE, advanceId: ADVANCE, kind: 'given', workerId: 'w_01',
        date: '2026-08-10', amount: 5000, note: '', at: '', by: 'd_seed',
        origin: 'migration' } }, unreadable: {} }
});

function phone(id, cloud, storage) {
    const device = makeDevice({ deviceId: id, flags: GATES, storage });
    device.Sync.pushDelayMs = 5;
    device.setToday('2026-08-26');
    device.ctx.askTell = () => Promise.resolve();
    if (storage) {
        device.State.load();
    } else {
        Object.assign(device.State.schedule, SEED());
        device.State.save({ silent: true });
        const plan = device.call('planCarryMigration', device.State.schedule);
        if (plan.needed) {
            device.State.commit(device.call('recordCarryApproval', device.State.schedule,
                plan, '2026-08-26T08:00:00.000Z', id));
        }
    }
    if (cloud) device.Sync.connect(cloud.adapter);
    return device;
}

// Every financial event a record holds, as a comparable list.
const facts = record => Object.values(((record || {}).ledger || {}).advances || {})
    .map(entry => `${entry.kind}:${entry.amount}`).sort();

const repay = (device, at, by) => device.State.commit(device.call('recordAdvanceRepaid',
    device.State.schedule, ADVANCE, 500, '2026-08-24', 'מזומן', at, by, 'cash'));

const restoreOf = device => device.call('normaliseSchedule',
    JSON.parse(JSON.stringify(device.State.schedule)));

// ============================================== S1  a repayment inside the restore's flight
//
// The same two acts in both orders, so the claim under test is convergence rather than
// timing. `hold` keeps the whole-document save open - that is the only thing the test
// arranges; everything else is the app deciding for itself.
async function race(label, repaymentInsideTheFlight) {
    suite(label);

    const cloud = makeCloud({ doc: null });
    const a = phone('d_a', cloud);
    const b = phone('d_b', cloud);
    await settle(500);
    given('both phones hold the advance and nothing else',
        JSON.stringify(facts(a.State.schedule)) === JSON.stringify(['given:5000'])
        && JSON.stringify(facts(b.State.schedule)) === JSON.stringify(['given:5000']),
        `${JSON.stringify(facts(a.State.schedule))} / ${JSON.stringify(facts(b.State.schedule))}`);

    // The backup A is about to put back: the record as it stands, which is the ordinary
    // case - a person restoring yesterday's file over a schedule they wrecked today.
    const backup = restoreOf(a);

    const gate = deferred();
    let saves = 0;
    cloud.hold = kind => {
        if (kind !== 'save') return null;
        saves += 1;
        return saves === 1 ? gate.promise : null;
    };

    const restoring = a.Sync.replaceEverything(backup).catch(error => ({ ok: false, error }));
    await settleUntil(() => saves > 0, 4000, 5);
    given('A\'s whole-document write is open and has not landed',
        saves === 1 && !(cloud.doc && facts(cloud.doc).length === 0), `saves=${saves}`);

    if (repaymentInsideTheFlight) {
        // B is told the man handed 500 back, and records it. B knows nothing about a
        // restore; there is no reason it should wait for one.
        repay(b, '2026-08-24T09:00:00.000Z', 'd_b');
        await settleUntil(() => b.Sync.pendingCount() === 0, 5000, 10);
        given('B\'s repayment reached the cloud while A\'s restore was in flight',
            facts(cloud.doc).indexOf('repaid:500') !== -1, JSON.stringify(facts(cloud.doc)));
    }

    gate.release();
    cloud.hold = null;
    await restoring;

    if (!repaymentInsideTheFlight) {
        repay(b, '2026-08-24T09:00:00.000Z', 'd_b');
    }

    await settleUntil(() => a.Sync.pendingCount() === 0 && b.Sync.pendingCount() === 0
        && !a.Sync.pendingReplace()
        && JSON.stringify(facts(a.State.schedule)) === JSON.stringify(facts(b.State.schedule)),
        20000, 40);
    await settle(600);

    const where = `cloud=${JSON.stringify(facts(cloud.doc))} `
        + `A=${JSON.stringify(facts(a.State.schedule))} `
        + `B=${JSON.stringify(facts(b.State.schedule))} `
        + `statusA=${a.Sync.status} statusB=${b.Sync.status}`;

    check('the repayment is on the record afterwards',
        facts(cloud.doc).indexOf('repaid:500') !== -1, where);
    check('and all three hold the same financial facts',
        JSON.stringify(facts(cloud.doc)) === JSON.stringify(facts(a.State.schedule))
        && JSON.stringify(facts(a.State.schedule)) === JSON.stringify(facts(b.State.schedule)),
        where);
    check('and no phone says synced while it holds a different set from the other',
        !(a.Sync.status === 'synced' && b.Sync.status === 'synced')
        || JSON.stringify(facts(a.State.schedule)) === JSON.stringify(facts(b.State.schedule)),
        where);
    // The balance is the thing a person is actually handed.
    const owedA = a.call('advanceOutstanding', a.State.schedule, ADVANCE);
    const owedB = b.call('advanceOutstanding', b.State.schedule, ADVANCE);
    check('and the two phones owe the man the same money',
        owedA.left === owedB.left, `A left ${owedA.left} / B left ${owedB.left}`);
}

// The order in which A's restore reaches the cloud first. Nothing is racing; this is the
// control, and it is what the contract describes.
await race('S1a: the restore lands, and the repayment follows it', false);
// The order in which the repayment reaches the cloud while the restore is on the wire.
// This is the attack: the union is done at PREPARE, and the envelope is then frozen, so
// an event that arrives between the prepare and the save is in neither. It is caught by
// absorbCloudLedger, which merges the last document the server showed this device into
// the envelope in the same turn as the stamp - and by the pairing of _baseDoc with
// _revision, which makes a write built on a base that has moved refusable rather than
// landable. Both orders have to end in the same place; that is what is asked here.
await race('S1b: the repayment lands while the restore is on the wire', true);

// ============================================== S2  a retry must not double an event
{
    suite('S2: the frozen envelope, re-sent');

    const cloud = makeCloud({ doc: null });
    const a = phone('d_r2', cloud);
    await settle(400);
    repay(a, '2026-08-24T09:00:00.000Z', 'd_r2');
    await settle(400);

    // A backup taken BEFORE the repayment - it carries no ledger at all, which is the
    // shape that made the union necessary in the first place.
    const backup = JSON.parse(JSON.stringify(a.State.schedule));
    delete backup.ledger;

    // The first two attempts never reach the server.
    let refused = 0;
    cloud.reject = kind => {
        if (kind !== 'save' || refused >= 2) return null;
        refused += 1;
        const error = new Error('client is offline');
        error.code = 'unavailable';
        return error;
    };
    const first = await a.Sync.replaceEverything(a.call('normaliseSchedule', backup));
    given('the first attempt was refused by the network',
        first.ok === false && first.stage === 'cloud', JSON.stringify(first.stage));
    cloud.reject = null;
    await settleUntil(() => !a.Sync.pendingReplace(), 20000, 50);
    await settle(400);

    same('S2 the repayment survives the restore exactly once',
        facts(cloud.doc), ['given:5000', 'repaid:500']);
    check('and the device holds what the cloud holds',
        JSON.stringify(facts(a.State.schedule)) === JSON.stringify(facts(cloud.doc)),
        `${JSON.stringify(facts(a.State.schedule))} / ${JSON.stringify(facts(cloud.doc))}`);
    check('and the transaction is over', !a.Sync.pendingReplace() && a.Sync.status === 'synced',
        `${a.Sync.status} pending=${Boolean(a.Sync.pendingReplace())}`);
}

// ============================================== S3  a cancel, then the same restore again
{
    suite('S3: the prepare that could not be stored, and the retry after it');

    const cloud = makeCloud({ doc: null });
    const a = phone('d_r3', cloud);
    await settle(400);
    repay(a, '2026-08-24T09:00:00.000Z', 'd_r3');
    await settle(400);
    const backup = JSON.parse(JSON.stringify(a.State.schedule));
    delete backup.ledger;

    a.setQuota(key => key === 'scheduleData:v2');
    const refusedRun = await a.Sync.replaceEverything(a.call('normaliseSchedule', backup));
    check('S3 a restore that cannot be stored changes nothing and says so',
        refusedRun.ok === false && refusedRun.stage === 'local'
        && refusedRun.cancelled === true
        && JSON.stringify(facts(a.State.schedule)) === JSON.stringify(['given:5000', 'repaid:500']),
        `${JSON.stringify(refusedRun)} ${JSON.stringify(facts(a.State.schedule))}`);
    check('and it leaves no intent behind for the next session to finish',
        !a.Sync.pendingReplace(), String(Boolean(a.Sync.pendingReplace())));

    a.setQuota(null);
    const again = await a.Sync.replaceEverything(a.call('normaliseSchedule', backup));
    await settleUntil(() => !a.Sync.pendingReplace(), 15000, 40);
    await settle(400);
    same('and the retry lands the event exactly once, not twice and not never',
        facts(cloud.doc), ['given:5000', 'repaid:500']);
    check('and the retry is reported as done',
        again.ok === true && again.stage === 'done', JSON.stringify(again));
}

// ============================================== S4  a conflicted restore across a reopen
{
    suite('S4: the conflict, and what survives closing the app');

    const cloud = makeCloud({ doc: null });
    const a = phone('d_r4', cloud);
    const b = phone('d_r4b', cloud);
    await settle(500);
    const backup = restoreOf(a);

    const gate = deferred();
    let saves = 0;
    cloud.hold = kind => (kind === 'save' && ++saves === 1) ? gate.promise : null;
    const restoring = a.Sync.replaceEverything(backup).catch(error => ({ ok: false, error }));
    await settleUntil(() => saves > 0, 4000, 5);
    repay(b, '2026-08-24T09:00:00.000Z', 'd_r4b');
    await settleUntil(() => b.Sync.pendingCount() === 0, 5000, 10);
    gate.release();
    const outcome = await restoring;

    check('S4 a restore refused for a conflict is not reported as done',
        outcome.ok === false && outcome.stage === 'cloud'
        && outcome.error && outcome.error.code === 'conflict',
        JSON.stringify({ ok: outcome.ok, stage: outcome.stage,
            code: outcome.error && outcome.error.code }));
    check('and the phone does not say synced over it',
        a.Sync.status !== 'synced', String(a.Sync.status));

    // Close the app and open it again. The intent has to still be there, and it has to
    // still be the same transaction - a retry that could clear it without proof is how a
    // half-done restore becomes a silent one.
    // The RECORD, without the ordering stamp. stampProtocol writes protocol, revision,
    // lastOpId and opFingerprint onto the document it is about to send, in place, so the
    // envelope in memory carries the failed attempt's stamp and the one on the disk does
    // not. That difference is per-attempt and is correct; what has to survive is the
    // schedule, the transaction's name, and the money in it.
    const withoutStamp = document => {
        const copy = JSON.parse(JSON.stringify(document || null));
        ['protocol', 'revision', 'lastOpId', 'opFingerprint'].forEach(field => {
            if (copy) delete copy[field];
        });
        return JSON.stringify(copy);
    };
    const held = a.Sync.pendingReplace();
    const frozen = withoutStamp(held && held.document);
    const reopened = phone('d_r4', null, a.dump());
    const carried = reopened.Sync.pendingReplace();
    const kept = withoutStamp(carried && carried.document);
    check('and the intent survives a reopen, unchanged and with its own name',
        Boolean(carried) && Boolean(held)
        && carried.transactionId === held.transactionId
        && kept === frozen,
        `${held && held.transactionId} -> ${carried && carried.transactionId}; `
        + `bytes ${frozen.length} -> ${kept.length}`);
    check('and the reopened device agrees the replacement is already on its disk',
        reopened.Sync.localDurableHolds(carried) === true,
        String(reopened.Sync.localDurableHolds(carried)));
}

// ============================================== S5  the response nobody heard
{
    suite('S5: the save that landed while the phone was dying');

    const cloud = makeCloud({ doc: null });
    const a = phone('d_r5', cloud);
    await settle(400);
    repay(a, '2026-08-24T09:00:00.000Z', 'd_r5');
    await settle(400);
    const backup = JSON.parse(JSON.stringify(a.State.schedule));
    delete backup.ledger;

    const gate = deferred();
    let saves = 0;
    cloud.hold = kind => (kind === 'save' && ++saves === 1) ? gate.promise : null;
    a.Sync.replaceEverything(a.call('normaliseSchedule', backup)).catch(() => {});
    await settleUntil(() => saves > 0, 4000, 5);

    // The phone dies with the request open. Its disk is all that is left of it.
    const disk = a.dump();
    gate.release();
    cloud.hold = null;
    await settle(300);
    given('the write landed anyway, and nobody was told',
        cloud.writes.filter(write => write.kind === 'save').length === 1,
        JSON.stringify(facts(cloud.doc)));

    // Reopened, it finds the transaction still owed. The send claim its dead session took
    // is still on the disk, so it waits the claim out before it may try - twenty seconds,
    // which is what most of this suite's running time is.
    const again = phone('d_r5', cloud, disk);
    await settleUntil(() => !again.Sync.pendingReplace(), 40000, 250);
    await settle(500);

    const sends = cloud.writes.filter(write => write.kind === 'save');
    check('S5 the second attempt is answered from the receipt, not applied again',
        sends.length === 2 && sends[0].replayed !== true && sends[1].replayed === true,
        JSON.stringify(sends.map(write => Boolean(write.replayed))));
    same('and the money is what it was, once', facts(cloud.doc), ['given:5000', 'repaid:500']);
    check('and the transaction is finished rather than abandoned',
        !again.Sync.pendingReplace() && again.Sync.status === 'synced',
        `${again.Sync.status} pending=${Boolean(again.Sync.pendingReplace())}`);
}

// ============================================== S6  the invariant against the disk
{
    suite('S6: localDurableHolds against what the next session would read');

    const cloud = makeCloud({ doc: null });
    const a = phone('d_r6', cloud);
    await settle(400);
    // Work done after the restore was asked for is still owed, and the invariant has to
    // count it. A queue entry that cannot be removed is the shape that makes the two
    // sides disagree if either of them reads memory instead of the disk.
    // Offline, so the repayment stays in the queue and the restore has something to
    // supersede - which is the only way the prune can be the half that fails.
    cloud.online = false;
    repay(a, '2026-08-24T09:00:00.000Z', 'd_r6');
    await settle(120);
    given('the repayment is still queued', a.Sync.pendingCount() > 0,
        String(a.Sync.pendingCount()));
    const backup = JSON.parse(JSON.stringify(a.State.schedule));
    delete backup.ledger;

    a.throwOnRemove(key => String(key).indexOf('farkad:outbox:op:') === 0);
    const run = await a.Sync.replaceEverything(a.call('normaliseSchedule', backup));
    check('S6 a restore whose queue could not be finished is not reported as done',
        run.ok === false && run.stage === 'queue', JSON.stringify(run));

    const envelope = a.Sync.pendingReplace();
    // The next session, computed rather than asserted: a fresh device on these bytes.
    const next = phone('d_r6', null, a.dump());
    check('and the invariant answers what the next session actually computes',
        Boolean(envelope)
        && a.Sync.localDurableHolds(envelope) === next.Sync.localDurableHolds(envelope),
        `here=${envelope && a.Sync.localDurableHolds(envelope)} `
        + `next=${envelope && next.Sync.localDurableHolds(envelope)}`);
    check('and no financial event was lost by the half-done transaction',
        JSON.stringify(facts(next.State.schedule)) === JSON.stringify(['given:5000', 'repaid:500']),
        JSON.stringify(facts(next.State.schedule)));
}

report();
