// The pay book's server-first door: one closure, one transaction, or nothing. (v175)
//
//   node tests/paybook.transact.test.mjs
//
// tests/paybook.sync.test.mjs measured what the ORDINARY queue does to a closure: it
// accepts one with no signal, and cuts one in two at the 296-path limit. This suite is
// about the door that replaces it for the pay book - js/sync/transact.js - on the fake
// cloud, which models the production adapter's `transact` and what firestore.rules ask of
// it (tests/paybook.split.emulator.test.mjs asks the same of the real ones).
//
//   T1   a closure is ONE write: the schedule's paths and the closed document together;
//        «closed» means committed, read back and adopted; nothing goes near the queue
//   T2   no signal: refused, nothing stored, nothing queued, nothing to send later
//   T3   this phone holds work the server has not: refused until the queue has drained
//   T4   a stale account - the other phone closed it first: one closed document, one
//        statement, no double deduction, the loser told and brought up to date
//   T5   the document moved for an unrelated reason: the same operation, re-aimed
//   T6   a double tap is one operation
//   T7   the answer is lost and the write landed: settled by the receipt, never sent twice
//   T8   the answer is lost and the server cannot be asked: «unknown», everything else
//        refused until it is settled, and settled at the next signal
//   T9   a reload mid-flight, all three ways it can end
//   T10  a payment and a void: each one transaction, each its own closed document
//   T11  the ordinary queue never carries a pay path
//   T12  an intent that cannot be read stops the door and is not deleted
//   T13  the carry approval: a code a screen can act on, never a bare `gate`
//
// Synthetic data only.

import { makeCloud, settle, settleUntil } from './harness.mjs';
import { suite, check, same, given, report } from './runner.mjs';
import {
    FORTNIGHT, TODAY, clone, stamp, canonical, payDevice, world, advancesOf, plan, openBook,
    reopen, bookOf, batchKeys, SERVER_FIRST
} from './paybook.world.mjs';

const SCHEDULE = 'scheduleData:v2';
const INTENT = 'farkad:payIntent';
const OUTCOME = 'farkad:payOutcome';

// ONE RECORD every phone starts from - see BASE in tests/paybook.sync.test.mjs. Built with
// the old door open (it is the only way to seed an opening without a cloud); every phone
// below is the build that ships with the pay book open: the writer on, the queue door shut.
const BASE = (() => {
    const first = world({ advances: [['w_khaled', '2026-10-03', 500], ['w_khaled', '2026-10-06', 400]] });
    openBook(first, undefined, 'd_seed');
    const schedule = clone(first.State.schedule);
    return { schedule, wire: first.call('cloudDocument', schedule), advances: advancesOf(first, 'w_khaled') };
})();
const [K1, K2] = BASE.advances;

const cloudWith = (options = {}) => makeCloud(Object.assign({
    doc: Object.assign(clone(BASE.wire), { protocol: 2, revision: 1, lastOpId: 'op_seed' })
}, options));

function phone(id, cloud, options = {}) {
    const device = payDevice(Object.assign({ deviceId: id, flags: { paybookQueue: false },
        storage: options.storage || { [SCHEDULE]: JSON.stringify(BASE.schedule) } }, options));
    device.Sync.pushDelayMs = 5;
    device.State.load();
    if (cloud) device.Sync.connect(cloud.adapter);
    return device;
}
const again = (device, cloud) => {
    const next = payDevice({ storage: device.dump(), deviceId: device.id, flags: { paybookQueue: false } });
    next.Sync.pushDelayMs = 5;
    next.State.load();
    if (cloud) next.Sync.connect(cloud.adapter);
    return next;
};

const quiet = device => device.Sync.status === 'synced' && device.Sync.pendingCount() === 0;
const settled = (devices, limit = 8000) => settleUntil(() => devices.every(quiet), limit, 5);
const payIds = source => Object.keys((source && source.pay) || {}).sort();
const closedIds = cloud => [...cloud.closed.keys()].sort();
const landed = cloud => cloud.writes.filter(write => write.kind === 'transact' && !write.replayed);
const tried = cloud => cloud.attempts.filter(attempt => attempt.kind === 'transact');
const intentOf = device => device.dump()[INTENT] || null;
const queuedPay = device => batchKeys(device).filter(key => /"path":"pay\./.test(device.dump()[key]));
const deductions = source => Object.keys(((source.ledger || {}).advances) || {})
    .filter(id => id.indexOf('le_close_') === 0).sort();

// Khaled: 4,400 - 500 - 100 = 3,800 net, 2,000 handed over.
const khaled = (device, choices = {}, hour = '10') => plan(device, 'planClosure', 'w_khaled', FORTNIGHT,
    Object.assign({ allocations: { [K1]: 500, [K2]: 100 }, paid: 2000, paidOn: TODAY, method: 'cash' }, choices),
    stamp(TODAY, device.id, hour));
const salim = device => plan(device, 'planClosure', 'w_salim', FORTNIGHT,
    { paid: 3600, paidOn: TODAY, method: 'transfer' }, stamp(TODAY, device.id));
const KHALED_PAY = ['po_open', 'pp_ps_w_khaled_20261002', 'ps_w_khaled_20261002'];
const KHALED_PATHS = ['ledger.advances.le_period_w_khaled_20261002',
    `ledger.advances.le_close_${K1}_20261002`, `ledger.advances.le_close_${K2}_20261002`,
    'pay.ps_w_khaled_20261002', 'pay.pp_ps_w_khaled_20261002'].sort();
const day = (device, worker, date) => given(`a day is recorded (${worker} ${date})`,
    device.State.commit(device.call('assignPlace', device.State.schedule, date, worker, 'actual', 'p_a', undefined, 0)) === true);
// A phone that stops hearing the cloud without knowing it: the first subscriber is taken out.
const deafen = cloud => cloud.subscribers.splice(0, 1);

// ================================================================ T1
{
    suite('T1: a closure is one write - the schedule and its closed document, committed, read back, adopted');

    const cloud = cloudWith();
    const a = phone('d_a1', cloud);
    const b = phone('d_b1', cloud);
    const c = phone('d_c1', cloud, { shipped: true });
    await settled([a, b, c]);
    given('the build under test has the writer on and the queue door shut',
        a.call('paybookWritesEnabled') === true && a.call('paybookQueueEnabled') === false);
    const drawn = khaled(a);
    given('the closure is allowed', drawn.ok === true, JSON.stringify(drawn.reasons));
    const journalBefore = batchKeys(a).length;
    const revisionBefore = cloud.doc.revision;

    const answer = await a.Sync.transactPaybook(drawn);
    same('the answer is «closed», and names the closed document', [answer.ok, answer.state, answer.reasons, answer.closedId],
        [true, 'closed', [], 'ps_w_khaled_20261002']);
    same('it was one write and one revision', [landed(cloud).length, tried(cloud).length, cloud.doc.revision - revisionBefore], [1, 1, 1]);
    same('carrying every path of the closure and nothing else of business',
        Object.keys(landed(cloud)[0].patch).filter(path => /^(pay|ledger)\./.test(path)).sort(), KHALED_PATHS);
    same('the cloud\'s account holds the statement and the payment', payIds(cloud.doc), KHALED_PAY);
    same('and beside it ONE closed document, named for the statement', closedIds(cloud), ['ps_w_khaled_20261002']);
    const closed = cloud.closed.get('ps_w_khaled_20261002');
    same('which holds exactly what the plan would write, path for path, byte for byte',
        canonical(closed.entries), canonical(Object.fromEntries(drawn.changes.map(change => [change.path, change.value]))));
    same('and names the operation and the revision that created it - the same ones the schedule now carries',
        [closed.opId === cloud.doc.lastOpId, closed.revision === cloud.doc.revision, cloud.doc.closedId, cloud.doc.protocol],
        [true, true, 'ps_w_khaled_20261002', 2]);
    same('the receipt of that operation is there', cloud.receipts.has(closed.opId), true);
    same('this build\'s own reader finds nothing wrong with the closed document',
        a.call('paybookClosedProblems', 'ps_w_khaled_20261002', closed), []);

    same('NOTHING WENT NEAR THE QUEUE: no journal batch was written, nothing is pending, no intent is left',
        [batchKeys(a).length - journalBefore, a.Sync.pendingCount(), intentOf(a), queuedPay(a)], [0, 0, null, []]);
    same('A\'s own record holds the closure - adopted from the server\'s document',
        [payIds(a.State.schedule), deductions(a.State.schedule).length], [KHALED_PAY, 2]);
    same('and still holds it after the app is closed and opened', payIds(again(a, null).State.schedule), KHALED_PAY);
    await settled([a, b, c]);
    same('the other two phones - one of them with the writer off - hold the same book',
        [bookOf(b), bookOf(c)], [bookOf(a), bookOf(a)]);
    same('1,800 of wage is owed to him on all three', [a, b, c].map(d => d.call('accountFor', d.State.schedule, 'w_khaled', TODAY).wageDue),
        [1800, 1800, 1800]);
    same('nobody is blocked and nothing is held beside', [a, b, c].map(d => [d.call('farkadWritesBlocked'), d.State.schedule.payConflicted]),
        Array(3).fill([false, undefined]));
    const second = await a.Sync.transactPaybook(drawn);
    same('pressed again afterwards, the same plan is stale - the account is closed - and writes nothing',
        [second.ok, second.state, second.reasons.includes('closed'), landed(cloud).length], [false, 'stale', true, 1]);
}

// ================================================================ T2
{
    suite('T2: no signal - refused, and nothing is kept to send later');

    const cloud = cloudWith();
    const a = phone('d_a2', cloud);
    await settled([a]);
    cloud.online = false;
    const drawn = khaled(a);
    const before = canonical(a.dump());
    const answer = await a.Sync.transactPaybook(drawn);
    same('refused, with the reason', [answer.ok, answer.state, answer.reasons], [false, 'refused', ['offline']]);
    same('the cloud is untouched', [payIds(cloud.doc), closedIds(cloud), landed(cloud).length], [['po_open'], [], 0]);
    same('the phone\'s disk is byte for byte what it was: no intent, no journal batch, no queued path',
        [canonical(a.dump()) === before, intentOf(a), a.Sync.pendingCount()], [true, null, 0]);
    same('and the account is not closed on this phone', payIds(a.State.schedule), ['po_open']);
    cloud.online = true;
    await settle(60);
    same('when the signal returns nothing is sent by itself - there was nothing waiting', [landed(cloud).length, payIds(cloud.doc)], [0, ['po_open']]);

    const alone = phone('d_alone2', null);
    const never = await alone.Sync.transactPaybook(khaled(alone));
    same('a phone with no cloud at all is refused the same way', [never.state, never.reasons, intentOf(alone)], ['refused', ['offline'], null]);
    const fresh = phone('d_fresh2', cloudWith({ online: false }));
    const unheard = await fresh.Sync.transactPaybook(khaled(fresh));
    same('and so is one that is connected but has not yet heard the server\'s document',
        [unheard.state, unheard.reasons], ['refused', ['offline']]);
}

// ================================================================ T3
{
    suite('T3: this phone holds work the server has not - the queue drains first');

    const cloud = cloudWith();
    const a = phone('d_a3', cloud);
    await settled([a]);
    cloud.reject = kind => (kind === 'update' ? Object.assign(new Error('held'), { code: 'unavailable', unsent: true }) : null);
    day(a, 'w_nasser', '2026-10-18');
    await settle(40);
    given('a day is waiting in the queue', a.Sync.pendingCount() > 0);
    const answer = await a.Sync.transactPaybook(khaled(a));
    same('refused: a closure may not be priced from days the cloud has never seen',
        [answer.state, answer.reasons, landed(cloud).length, intentOf(a)], ['refused', ['unsent-work'], 0, null]);
    cloud.reject = null;
    await a.Sync.flush();
    await settled([a]);
    const then = await a.Sync.transactPaybook(khaled(a));
    same('once the day has reached the cloud, the closure goes through', [then.state, payIds(cloud.doc)], ['closed', KHALED_PAY]);
}

// ================================================================ T4
{
    suite('T4: two phones close the same man and period at once - one closed document, and the loser is told');

    const cloud = cloudWith();
    const a = phone('d_a4', cloud);
    const b = phone('d_b4', cloud);
    await settled([a, b]);
    const onA = khaled(a, {}, '10');
    const onB = khaled(b, { allocations: { [K1]: 300, [K2]: 0 }, paid: 1000 }, '11');
    given('both plans are allowed, and they differ', onA.ok && onB.ok && canonical(onA.changes) !== canonical(onB.changes));
    deafen(cloud);                       // A stops hearing, and does not know it
    const won = await b.Sync.transactPaybook(onB);
    given('B closed it', won.state === 'closed', JSON.stringify(won));
    given('A has not heard', payIds(a.State.schedule).length === 1);

    const lost = await a.Sync.transactPaybook(onA);
    same('A is told the account changed, and why: it is already closed',
        [lost.ok, lost.state, lost.reasons.includes('stale'), lost.reasons.includes('closed') || lost.reasons.includes('statement')],
        [false, 'stale', true, true]);
    same('exactly one closure landed, in one write', [landed(cloud).length, closedIds(cloud)], [1, ['ps_w_khaled_20261002']]);
    same('the cloud holds B\'s closure and nothing of A\'s: one statement, B\'s deductions, B\'s payment',
        [cloud.doc.pay.ps_w_khaled_20261002.by, cloud.doc.pay.ps_w_khaled_20261002.advanceDeducted,
            cloud.doc.pay.pp_ps_w_khaled_20261002.amount, deductions(cloud.doc)],
        ['d_b4', 300, 1000, [`le_close_${K1}_20261002`]]);
    same('NO DOUBLE DEDUCTION: 300 came off the first advance once, and nothing off the second',
        [a.call('advanceOutstanding', cloud.doc, K1).left, a.call('advanceOutstanding', cloud.doc, K2).left], [200, 400]);
    same('A was brought up to date by the refusal itself: its record is the cloud\'s, with no entry of its own closure',
        [bookOf(a), deductions(a.State.schedule), intentOf(a), a.Sync.pendingCount()],
        [canonical(cloud.doc.pay), [`le_close_${K1}_20261002`], null, 0]);
    same('A is not stopped and holds no disagreement', [a.call('farkadWritesBlocked'), a.State.schedule.payConflicted], [false, undefined]);

    // The same choices on both phones is the same fact, and nobody is refused.
    const twin = cloudWith();
    const c = phone('d_c4', twin);
    const d = phone('d_d4', twin);
    await settled([c, d]);
    const onC = khaled(c, {}, '10');
    const onD = khaled(d, {}, '11');
    deafen(twin);
    given('D closed it', (await d.Sync.transactPaybook(onD)).state === 'closed');
    const same4 = await c.Sync.transactPaybook(onC);
    same('with the SAME choices the second phone is told it is already closed, and one closure stands',
        [same4.ok, same4.state, landed(twin).length, closedIds(twin), twin.doc.pay.ps_w_khaled_20261002.by],
        [false, 'stale', 1, ['ps_w_khaled_20261002'], 'd_d4']);
}

// ================================================================ T5
{
    suite('T5: the document moved for somebody else\'s reason - the same operation, re-aimed');

    const cloud = cloudWith();
    const a = phone('d_a5', cloud);
    const b = phone('d_b5', cloud);
    await settled([a, b]);
    const drawn = khaled(a);
    deafen(cloud);
    day(b, 'w_nasser', '2026-10-18');      // nothing of Khaled's
    await settled([b]);
    given('the document has moved and A has not heard', cloud.doc.revision === 2 && a.Sync._revision === 1);
    const answer = await a.Sync.transactPaybook(drawn);
    same('closed, on the second aim', [answer.state, tried(cloud).length, landed(cloud).length, cloud.doc.revision], ['closed', 2, 1, 3]);
    same('under ONE name both times', new Set(tried(cloud).map(attempt => attempt.payload.lastOpId)).size, 1);
    same('B\'s day is still there, and the closure with it',
        [Boolean(cloud.doc.days['2026-10-18'].actual.w_nasser), payIds(cloud.doc), closedIds(cloud)],
        [true, KHALED_PAY, ['ps_w_khaled_20261002']]);
    same('and A holds both', [Boolean(a.State.schedule.days['2026-10-18'].actual.w_nasser), payIds(a.State.schedule)], [true, KHALED_PAY]);

    // A day INSIDE the account is not somebody else's reason: the wage moved.
    const cloud2 = cloudWith();
    const c = phone('d_c5', cloud2);
    const d = phone('d_d5', cloud2);
    await settled([c, d]);
    const stale = plan(c, 'planClosure', 'w_nasser', FORTNIGHT, { paid: 0 }, stamp(TODAY, c.id));
    given('Nasser\'s closure is allowed', stale.ok === true, JSON.stringify(stale.reasons));
    deafen(cloud2);
    day(d, 'w_nasser', '2026-10-12');
    await settled([d]);
    const refused = await c.Sync.transactPaybook(stale);
    same('a day recorded inside the account is a stale review: nothing is written, the fresh wage is handed back',
        [refused.state, refused.reasons[0], landed(cloud2).length, refused.fresh && refused.fresh.review.gross], ['stale', 'stale', 0, 3500]);
}

// ================================================================ T6
{
    suite('T6: a double tap is one operation');

    const cloud = cloudWith();
    const a = phone('d_a6', cloud);
    await settled([a]);
    const first = a.Sync.transactPaybook(khaled(a, {}, '10'));
    const second = a.Sync.transactPaybook(khaled(a, {}, '10'));
    const [one, two] = await Promise.all([first, second]);
    same('the first tap closes; the second is told one is in flight', [one.state, two.state, two.reasons], ['closed', 'refused', ['busy']]);
    same('one write, one closed document, one statement', [landed(cloud).length, tried(cloud).length, closedIds(cloud), payIds(cloud.doc)],
        [1, 1, ['ps_w_khaled_20261002'], KHALED_PAY]);
}

// ================================================================ T7
{
    suite('T7: the write landed and the answer was lost - settled by the receipt, never sent twice');

    const cloud = cloudWith({ loseAnswer: kind => kind === 'transact' });
    const a = phone('d_a7', cloud);
    await settled([a]);
    const answer = await a.Sync.transactPaybook(khaled(a));
    same('the phone asked instead of guessing, and says closed', [answer.ok, answer.state, answer.resolved], [true, 'closed', true]);
    same('ONE write landed and nothing was sent a second time', [landed(cloud).length, tried(cloud).length, closedIds(cloud)],
        [1, 1, ['ps_w_khaled_20261002']]);
    same('the record holds it, nothing is pending and no intent is left',
        [payIds(a.State.schedule), a.Sync.pendingCount(), intentOf(a)], [KHALED_PAY, 0, null]);
}

// ================================================================ T8
{
    suite('T8: the answer was lost and the server cannot be asked - «unknown», and nothing else may be sent');

    const cloud = cloudWith();
    cloud.loseAnswer = kind => { if (kind === 'transact') { cloud.online = false; return true; } return false; };
    const a = phone('d_a8', cloud);
    await settled([a]);
    const answer = await a.Sync.transactPaybook(khaled(a));
    same('it does not say closed and does not say refused', [answer.ok, answer.state, answer.reasons], [false, 'unknown', ['unconfirmed']]);
    check('the intent is still on the disk, by name', intentOf(a) !== null && JSON.parse(intentOf(a)).closedId === 'ps_w_khaled_20261002');
    const next = await a.Sync.transactPaybook(salim(a));
    same('another closure is refused while that one is in doubt', [next.state, next.reasons], ['refused', ['pending']]);
    cloud.loseAnswer = null;
    cloud.online = true;
    const outcome = await a.Sync.resolvePayIntent();
    same('at the next signal it is settled by looking: committed', outcome, 'committed');
    same('one write ever landed; the record holds it; the intent is gone; the outcome is kept for a screen to show',
        [landed(cloud).length, tried(cloud).length, payIds(a.State.schedule), intentOf(a), JSON.parse(a.dump()[OUTCOME]).outcome],
        [1, 1, KHALED_PAY, null, 'committed']);
    const then = await a.Sync.transactPaybook(salim(a));
    same('and the next closure goes through', then.state, 'closed');
}

// ================================================================ T9
{
    suite('T9: the app is reloaded while the closure is in flight - each of the three ways it can end');

    // (a) the request had reached the server: it commits after the reload.
    {
        let release = null;
        const cloud = cloudWith({ hold: kind => (kind === 'transact' ? new Promise(resolve => { release = resolve; }) : null) });
        const a = phone('d_a9', cloud);
        await settled([a]);
        a.Sync.transactPaybook(khaled(a));
        await settle(20);
        given('the request is open and the intent is on the disk', typeof release === 'function' && intentOf(a) !== null);
        const disk = a.dump();
        deafen(cloud);                                   // the old page is gone
        release();
        await settle(20);
        given('it committed on the server after the page was gone', payIds(cloud.doc).length === 3);
        cloud.hold = null;
        const reborn = payDevice({ storage: disk, deviceId: 'd_a9', flags: { paybookQueue: false } });
        reborn.State.load();
        given('the reopened phone knows nothing of the closure yet, and holds the intent',
            payIds(reborn.State.schedule).length === 1 && intentOf(reborn) !== null);
        reborn.Sync.connect(cloud.adapter);
        await settleUntil(() => intentOf(reborn) === null, 4000, 5);
        same('(a) COMMITTED: found by its receipt, adopted, and said',
            [payIds(reborn.State.schedule), intentOf(reborn), JSON.parse(reborn.dump()[OUTCOME]).outcome, landed(cloud).length],
            [KHALED_PAY, null, 'committed', 1]);
    }

    // (b) the request died, and the document has moved since.
    {
        const cloud = cloudWith({ hold: kind => (kind === 'transact' ? new Promise(() => {}) : null) });
        const a = phone('d_b9', cloud);
        const other = phone('d_o9', cloud);
        await settled([a, other]);
        a.Sync.transactPaybook(khaled(a));
        await settle(20);
        const disk = a.dump();
        cloud.subscribers.splice(0, 1);
        cloud.hold = null;
        day(other, 'w_nasser', '2026-10-18');
        await settled([other]);
        const reborn = payDevice({ storage: disk, deviceId: 'd_b9', flags: { paybookQueue: false } });
        reborn.State.load();
        reborn.Sync.connect(cloud.adapter);
        await settleUntil(() => intentOf(reborn) === null, 4000, 5);
        same('(b) NOT COMMITTED, the document moved: nothing happened, and the phone says so',
            [payIds(reborn.State.schedule), payIds(cloud.doc), closedIds(cloud), intentOf(reborn),
                JSON.parse(reborn.dump()[OUTCOME]).outcome, landed(cloud).length],
            [['po_open'], ['po_open'], [], null, 'nothing', 0]);
        same('and the outcome is cleared once a screen has shown it',
            (reborn.Sync.acknowledgePayOutcome(), reborn.dump()[OUTCOME] === undefined), true);
    }

    // (c) the request is still somewhere on the way, and the document has not moved.
    {
        let release = null;
        const cloud = cloudWith({ hold: kind => (kind === 'transact' ? new Promise(resolve => { release = resolve; }) : null) });
        const a = phone('d_c9', cloud);
        await settled([a]);
        const flying = a.Sync.transactPaybook(khaled(a));
        await settle(20);
        const disk = a.dump();
        deafen(cloud);
        // THE OLD PAGE IS GONE; only its request is still on the wire. The harness keeps
        // the old context alive, so what that page would have done with an answer is
        // switched off here - a page that no longer exists re-aims nothing.
        a.Sync.failedPayIntent = () => ({ ok: false, state: 'page-gone', reasons: [] });
        const reborn = payDevice({ storage: disk, deviceId: 'd_c9', flags: { paybookQueue: false } });
        reborn.State.load();
        reborn.Sync.connect(cloud.adapter);
        await settleUntil(() => intentOf(reborn) === null, 4000, 5);
        same('(c) STILL IN FLIGHT: the revision it was aimed at is spent on purpose, and the phone says nothing happened',
            [JSON.parse(reborn.dump()[OUTCOME]).outcome, cloud.doc.revision, payIds(cloud.doc)], ['nothing', 2, ['po_open']]);
        release();                                       // and now the old request arrives
        await settle(40);
        await flying.catch(() => undefined);
        same('when the old request finally arrives it is refused: no statement, no closed document, no write',
            [payIds(cloud.doc), closedIds(cloud), landed(cloud).length], [['po_open'], [], 0]);
        same('so "nothing happened" was true, and stays true', payIds(reborn.State.schedule), ['po_open']);
    }
}

// ================================================================ T10
{
    suite('T10: a payment and a void - each one transaction, each its own closed document');

    const cloud = cloudWith();
    const a = phone('d_a10', cloud);
    const b = phone('d_b10', cloud);
    await settled([a, b]);
    given('the account is closed with 2,000 of 3,800 paid', (await a.Sync.transactPaybook(khaled(a))).state === 'closed');
    const paymentId = 'pp_later0000001';
    const pay = plan(a, 'planPayment', 'ps_w_khaled_20261002', 600, { paymentId, date: TODAY, method: 'transfer' }, stamp(TODAY, a.id, '12'));
    const paid = await a.Sync.transactPaybook(pay);
    same('the later payment is its own write and its own closed document',
        [paid.state, paid.closedId, landed(cloud).length, closedIds(cloud)],
        ['closed', paymentId, 2, [paymentId, 'ps_w_khaled_20261002'].sort()]);
    same('1,200 is still owed to him, on both phones',
        (await settled([a, b]), [a, b].map(d => d.call('accountFor', d.State.schedule, 'w_khaled', TODAY).wageDue)), [1200, 1200]);
    const twice = await a.Sync.transactPaybook(pay);
    same('the same payment pressed again is done, not paid twice', [twice.ok, twice.state, landed(cloud).length], [true, 'done', 2]);
    const undo = plan(b, 'planVoid', paymentId, { reason: 'נרשם בטעות', date: TODAY }, stamp(TODAY, b.id, '13'));
    const voided = await b.Sync.transactPaybook(undo);
    same('a void, from the other phone, is one more write and one more closed document',
        [voided.state, voided.closedId, landed(cloud).length, closedIds(cloud).length], ['closed', `pv_${paymentId}`, 3, 3]);
    await settled([a, b]);
    same('and 1,800 is owed again on both', [a, b].map(d => d.call('accountFor', d.State.schedule, 'w_khaled', TODAY).wageDue), [1800, 1800]);
    same('every closed document on the server is one this build reads',
        closedIds(cloud).map(id => a.call('paybookClosedProblems', id, cloud.closed.get(id)).length), [0, 0, 0]);
}

// ================================================================ T11
{
    suite('T11: the ordinary queue never carries a pay path');

    const cloud = cloudWith();
    const a = phone('d_a11', cloud);
    await settled([a]);
    const drawn = khaled(a);
    const before = canonical(a.dump());
    const viaQueue = a.State.commitPaybook(drawn.changes);
    same('the old door answers `server-first` and writes nothing', [viaQueue.ok, viaQueue.reasons, canonical(a.dump()) === before],
        [false, ['server-first'], true]);
    const statement = drawn.changes.filter(change => change.path === 'pay.ps_w_khaled_20261002');
    const forced = a.State.commitMany(clone(statement));
    same('and a pay path handed straight to the journal is refused by the queue\'s own minting path',
        [forced, a.Sync.pendingCount(), queuedPay(a), payIds(cloud.doc)], [false, 0, [], ['po_open']]);
    given('after the refusal the record is what the disk holds', payIds(again(a, null).State.schedule).length === 1);
    const b = phone('d_b11', cloud);
    await settled([b]);
    await b.Sync.transactPaybook(khaled(b));
    day(b, 'w_nasser', '2026-10-18');
    await settled([b]);
    same('across a closure and an ordinary day, no update the cloud ever received from the queue names a pay path',
        cloud.attempts.filter(attempt => attempt.kind !== 'transact')
            .filter(attempt => Object.keys(attempt.payload).some(path => path.indexOf('pay.') === 0 || path === 'pay')).length, 0);
    const shipped = phone('d_s11', cloud, { shipped: true });
    await settled([shipped]);
    const shut = await shipped.Sync.transactPaybook(drawn);
    same('and the SHIPPED build - the gate shut - draws no plan and sends none',
        [plan(shipped, 'planClosure', 'w_salim', FORTNIGHT, {}, stamp(TODAY, shipped.id)).reasons, shut.state, shut.reasons.includes('stale')],
        [['gate'], 'stale', true]);
}

// ================================================================ T12
{
    suite('T12: an intent that cannot be read stops the door, and is not deleted');

    const cloud = cloudWith();
    const a = phone('d_a12', cloud, { storage: { [SCHEDULE]: JSON.stringify(BASE.schedule), [INTENT]: '{"id":' } });
    await settled([a]);
    const answer = await a.Sync.transactPaybook(khaled(a));
    same('refused as pending, and the bytes are still there', [answer.state, answer.reasons, intentOf(a)], ['refused', ['pending'], '{"id":']);
    same('resolving it answers «unknown» - nothing is guessed about an operation nobody can name',
        await a.Sync.resolvePayIntent(), 'unknown');
}

// ================================================================ T13
{
    suite('T13: the carry approval - one code a screen can act on, and the approval offered on the spot');

    // A record nobody approved the carry on. Nothing needs approving yet.
    const bare = world({ approveCarry: false, advances: [['w_khaled', '2026-10-03', 500]], device: { flags: { paybookQueue: false } } });
    const S0 = clone(bare.State.schedule);
    const [only] = advancesOf(bare, 'w_khaled');
    const F = (name, ...args) => bare.call(name, ...args);
    const st = stamp(TODAY, 'd_boss');
    const opened = F('paybookApply', S0, F('planOpening', S0, '2026-10-02', stamp('2026-10-09', 'd_boss')).changes).schedule;
    same('before any partial deduction: no approval is needed and none exists',
        (state => [state.needed, state.approved, state.rows.length])(F('paybookCarryApproval', opened)), [false, false, 0]);
    const whole = F('planClosure', opened, 'w_khaled', FORTNIGHT, { allocations: { [only]: 500 } }, st);
    same('deducting exactly what was given in the fortnight locks nothing and is allowed', [whole.ok, whole.reasons], [true, []]);
    const partial = F('planClosure', opened, 'w_khaled', FORTNIGHT, { allocations: { [only]: 200 } }, st);
    same('a PARTIAL deduction would lock every financial control behind it - so it is refused first, by name',
        [partial.ok, partial.reasons, partial.changes.length], [false, ['carry-approval-needed'], 0]);
    same('with what a screen needs to offer the approval: the id, that it is needed, and the row it is about',
        [partial.carryApproval.id, partial.carryApproval.needed, partial.carryApproval.approved,
            partial.carryApproval.rows.map(row => [row.workerId, row.from, row.now, row.after])],
        ['cm_carry', true, false, [['w_khaled', FORTNIGHT.from, 500, 200]]]);
    const approval = F('planCarryApproval', opened, st);
    same('the approval is one field path, the one the existing dialog writes',
        [approval.ok, approval.already, approval.changes.map(change => change.path)], [true, false, ['ledger.migrations.cm_carry']]);
    same('which the journal\'s own grammar accepts as an ordinary edit - it is not a pay entry and needs no transaction',
        F('journalEntryProblems', approval.changes[0].path, approval.changes[0].value), []);
    const approved = clone(opened);
    approved.ledger.migrations = { cm_carry: clone(approval.changes[0].value) };
    const after = F('planClosure', approved, 'w_khaled', FORTNIGHT, { allocations: { [only]: 200 } }, st);
    same('once approved, the same partial deduction is allowed', [after.ok, after.reasons], [true, []]);
    same('and asking to approve again is not a refusal: already',
        (again2 => [again2.ok, again2.already, again2.changes])(F('planCarryApproval', approved, st)), [true, true, []]);

    // A record that is ALREADY locked: the old writer made the partial closure.
    const locked = world({ approveCarry: false, advances: [['w_khaled', '2026-10-03', 500]], device: { flags: { paybookQueue: false } } });
    given('a partial closure is written the existing way', locked.State.commitMany(locked.call('closePeriodChanges',
        locked.State.schedule, 'w_khaled', FORTNIGHT.from, FORTNIGHT.to, '2026-10-16T08:00:00.000Z', locked.id, 200)) === true);
    given('the financial gate is shut on that record', locked.call('financialWritingEnabled', locked.State.schedule) === false);
    const L = clone(locked.State.schedule);
    same('every planner answers `carry-approval-needed`, not `gate`',
        [locked.call('planOpening', L, '2026-10-02', stamp('2026-10-09', 'd_boss')).reasons,
            locked.call('planClosure', L, 'w_salim', FORTNIGHT, {}, st).reasons.includes('carry-approval-needed'),
            locked.call('planClosure', L, 'w_salim', FORTNIGHT, {}, st).reasons.includes('gate'),
            locked.call('planClosure', L, 'w_salim', FORTNIGHT, {}, st).carryApproval.needed],
        [['carry-approval-needed'], true, false, true]);
    same('and the approval can be planned on the locked record itself', locked.call('planCarryApproval', L, st).ok, true);
    const shipped = payDevice({ shipped: true });
    same('a build with the pay book shut still answers `gate` - there is nothing for a person to approve',
        [shipped.call('planClosure', L, 'w_salim', FORTNIGHT, {}, st).reasons.filter(code => code === 'gate' || code === 'carry-approval-needed'),
            shipped.call('planCarryApproval', L, st).reasons],
        [['gate'], ['gate']]);
}

report();
