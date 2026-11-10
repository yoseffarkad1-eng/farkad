// The pay book between phones: what arrives, what is held, and what a closure is on the wire.
//
//   node tests/paybook.sync.test.mjs
//
// Two and three devices on the fake Firestore (tests/harness.mjs), which speaks the
// ordering protocol the rules enforce: revision compare-and-set, immutable receipts, a
// refusal that carries the document. tests/paybook.emulator.test.mjs asks the questions
// that matter most again of the PRODUCTION adapter and the real emulator.
//
//   P1   two phones write different pay entries - both arrive on all three, the third of
//        them a phone with the writer OFF
//   P2   the same closure with the same choices from two phones is ONE of everything
//   P3   the same closure with a different PAID amount: the cloud's copy stands everywhere,
//        the loser's is kept beside it, its write is held and never sent - and the phone
//        is not stopped
//   P4   the same closure with different DEDUCTIONS: the ledger's own rule, unweakened -
//        the loser is stopped by Recovery, and nothing of its closure reaches the cloud
//   P5   a phone offline for weeks arrives with pay entries: union
//   P6   a snapshot with no `pay` at all removes nothing - and what the cloud is then left
//        holding, measured
//   P7   pending pay entries survive the adoption of somebody else's snapshot
//   P8   a write whose answer was lost is delivered twice and is one entry
//   P9   a reload in the middle of a flush
//   P10  IS A CLOSURE ALL-OR-NOTHING ON THE WIRE? Measured four ways; the answer is no
//   P11  a restore: from a file with no pay book, and with a payment landing in its window
//
// Every device here is the build with the writer ON unless it says `shipped`.
// Synthetic data only.

import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { makeCloud, settle, settleUntil, deferred } from './harness.mjs';
import { suite, check, same, given, report } from './runner.mjs';
import {
    FORTNIGHT, TODAY, clone, stamp, canonical, payDevice, world, advancesOf, plan, openBook,
    reopen, bookOf, foldOf
} from './paybook.world.mjs';

const TICK = 6;
const SCHEDULE = 'scheduleData:v2';

// ONE RECORD every phone starts from: the crew, a fortnight of days, Khaled's two
// advances, the carry approval and the pay book's opening - built once through the app's
// own doors, then handed to each phone as the bytes on its disk and to the cloud as the
// document it already holds. Two phones that must agree about an advance's id cannot each
// mint their own.
const BASE = (() => {
    const first = world({ advances: [['w_khaled', '2026-10-03', 500], ['w_khaled', '2026-10-06', 400]] });
    openBook(first, undefined, 'd_seed');
    const schedule = clone(first.State.schedule);
    const wire = first.call('cloudDocument', schedule);
    return { schedule, wire, advances: advancesOf(first, 'w_khaled') };
})();
const [K1, K2] = BASE.advances;

const cloudWith = (options = {}) => makeCloud(Object.assign({
    doc: Object.assign(clone(BASE.wire), { protocol: 1, revision: 1, lastOpId: 'op_seed' })
}, options));

function phone(id, cloud, options = {}) {
    const device = payDevice(Object.assign({ deviceId: id,
        storage: options.storage || { [SCHEDULE]: JSON.stringify(BASE.schedule) } }, options));
    device.Sync.pushDelayMs = 5;
    device.State.load();
    if (cloud) device.Sync.connect(cloud.adapter);
    return device;
}

const quiet = device => device.Sync.status === 'synced' && device.Sync.pendingCount() === 0;
const settled = (devices, limit = 8000) => settleUntil(() => devices.every(quiet), limit, 5);
const cloudBook = cloud => canonical((cloud.doc && cloud.doc.pay) || {});
const ledgerOf = source => canonical(((source.ledger || {}).advances) || {});
const payIds = source => Object.keys((source && source.pay) || {}).sort();

// The closures the sections share. Khaled: 4,400 - 500 - 100 = 3,800 net.
const khaled = (device, choices = {}, hour = '10') => plan(device, 'planClosure', 'w_khaled', FORTNIGHT,
    Object.assign({ allocations: { [K1]: 500, [K2]: 100 }, paid: 2000, paidOn: TODAY, method: 'cash' }, choices),
    stamp(TODAY, device.id, hour));
const salim = device => plan(device, 'planClosure', 'w_salim', FORTNIGHT,
    { paid: 3600, paidOn: TODAY, method: 'transfer' }, stamp(TODAY, device.id));
const commit = (device, drawn, what) => {
    given(`${what} is allowed`, drawn.ok === true, JSON.stringify(drawn.reasons));
    const done = device.State.commitPaybook(drawn.changes);
    given(`${what} is committed`, done.ok === true, JSON.stringify(done));
    return drawn;
};
const KHALED_PAY = ['po_open', 'pp_ps_w_khaled_20261002', 'ps_w_khaled_20261002'];
const SALIM_PAY = ['pp_ps_w_salim_20261002', 'ps_w_salim_20261002'];

// ================================================================ P1
{
    suite('P1: two phones write different pay entries - both arrive on all three');

    const cloud = cloudWith();
    const a = phone('d_a1', cloud);
    const b = phone('d_b1', cloud);
    const c = phone('d_c1', cloud, { shipped: true });
    await settled([a, b, c]);
    given('all three start on the same book', bookOf(a) === bookOf(b) && bookOf(b) === bookOf(c) && payIds(a.State.schedule).length === 1);
    given('the third phone is the shipped build, writer off', c.call('paybookWritesEnabled') === false);

    commit(a, khaled(a), 'Khaled\'s closure on A');
    commit(b, salim(b), 'Salim\'s closure on B');
    await settled([a, b, c]);

    same('the cloud holds both statements, both payments and the opening',
        payIds(cloud.doc), KHALED_PAY.concat(SALIM_PAY).sort());
    same('A, B and the phone with the writer off hold exactly the cloud\'s book',
        [bookOf(a), bookOf(b), bookOf(c)], [cloudBook(cloud), cloudBook(cloud), cloudBook(cloud)]);
    same('all three say synced, with nothing pending, nothing beside and nobody blocked',
        [a, b, c].map(d => [d.Sync.status, d.Sync.pendingCount(), d.State.schedule.payConflicted, d.call('farkadWritesBlocked')]),
        Array(3).fill(['synced', 0, undefined, false]));
    same('all three fold the same accounts', [foldOf(b), foldOf(c)], [foldOf(a), foldOf(a)]);
    same('the phone with the writer off reads both men: 1,800 and nothing owed',
        ['w_khaled', 'w_salim'].map(id => c.call('accountFor', c.State.schedule, id, TODAY).wageDue), [1800, 0]);
    same('and after each of them reopens, the same book', [a, b, c].map(d => bookOf(reopen(d, { shipped: d === c }))),
        Array(3).fill(cloudBook(cloud)));
}

// ================================================================ P2
{
    suite('P2: the same closure, the same choices, two phones - ONE of everything, nobody held');

    const cloud = cloudWith();
    // Both offline when they close: neither has heard the other.
    const a = phone('d_a2', null);
    const b = phone('d_b2', null);
    commit(a, khaled(a, {}, '10'), 'the closure on A');
    commit(b, khaled(b, {}, '11'), 'the same closure on B, an hour later');
    given('the two phones signed it with two hands at two moments',
        a.State.schedule.pay.ps_w_khaled_20261002.by !== b.State.schedule.pay.ps_w_khaled_20261002.by);

    a.Sync.connect(cloud.adapter);
    await settled([a]);
    b.Sync.connect(cloud.adapter);
    await settleUntil(() => b.Sync.pendingCount() === 0 && bookOf(b) === cloudBook(cloud), 8000, 5);
    await settle(TICK * 20);

    same('the cloud holds one statement and one payment', payIds(cloud.doc), KHALED_PAY);
    same('signed by the phone that got there first', [cloud.doc.pay.ps_w_khaled_20261002.by, cloud.doc.pay.pp_ps_w_khaled_20261002.by], ['d_a2', 'd_a2']);
    same('NOBODY IS HELD: nothing pending, nothing contested, nothing beside, no Recovery problem, writing not blocked',
        [a, b].map(d => [d.Sync.pendingCount(), d.Sync.heldRecords().length, d.State.schedule.payConflicted,
            d.State.schedule.ledger.conflicted, d.global('Recovery').problems.length, d.call('farkadWritesBlocked')]),
        Array(2).fill([0, 0, undefined, undefined, 0, false]));
    same('the second phone sent NOTHING: one write reached the cloud, and it was the first phone\'s',
        cloud.writes.filter(write => write.kind === 'update').map(write => write.patch.updatedBy), ['d_a2']);
    // MEASURED, NOT INTRODUCED HERE, AND NOT FIXED HERE. The second phone settles its whole
    // batch against the server's copy before anything leaves, so nothing is sent - and
    // nothing then re-asks the status, which was set to «שולח» when the snapshot found the
    // queue not empty. The line stays there, over an empty queue, until the next snapshot.
    // The existing ledger-only closure does exactly the same on v171 (the same two phones,
    // closePeriodChanges instead of a plan); it is in js/sync/send.js, which this phase
    // does not change. Pinned so that the fix moves this check on purpose.
    same('TODAY: the second phone\'s status line still reads sending, over a queue that is empty',
        [a.Sync.status, b.Sync.status, b.Sync.pendingCount()], ['synced', 'sending', 0]);
    given('A records a day', a.State.commit(a.call('assignPlace', a.State.schedule, '2026-10-18', 'w_nasser', 'actual', 'p_a')) === true);
    await settled([a, b]);
    same('and says synced at the next snapshot it hears', [a.Sync.status, b.Sync.status], ['synced', 'synced']);
    same('both phones hold the cloud\'s copy - the second signer\'s phone too', [bookOf(a), bookOf(b)], [cloudBook(cloud), cloudBook(cloud)]);
    same('one deduction per advance on the cloud, not two',
        Object.keys(cloud.doc.ledger.advances).filter(id => id.indexOf('le_close_') === 0).length, 2);
    same('the advances are reduced once: 0 and 300 left, on both',
        [a, b].map(d => [K1, K2].map(id => d.call('advanceOutstanding', d.State.schedule, id).left)), [[0, 300], [0, 300]]);
    same('one payment of 2,000 counted, on both', [a, b].map(d => d.call('paybookFold', d.State.schedule).statements.ps_w_khaled_20261002.paid), [2000, 2000]);
    const b2 = reopen(b);
    same('and B, reopened, is still not held and holds one of everything',
        [bookOf(b2), b2.call('farkadWritesBlocked'), b2.State.schedule.payConflicted], [cloudBook(cloud), false, undefined]);
    // The loser's queue is collected - a settled write does not sit there for ever.
    same('B\'s queue holds no operation for the closure any more',
        Object.keys(b.dump()).filter(key => key.indexOf(':op:') !== -1)
            .filter(key => b.raw(key).indexOf('ps_w_khaled_20261002') !== -1).length, 0);
}

// ================================================================ P3
{
    suite('P3: the same closure, a DIFFERENT paid amount - both kept, the cloud\'s stands, the phone is not stopped');

    const cloud = cloudWith();
    const a = phone('d_a3', null);
    const b = phone('d_b3', null);
    commit(a, khaled(a, { paid: 2000 }), 'the closure on A, 2,000 handed over');
    commit(b, khaled(b, { paid: 3000 }), 'the same closure on B, 3,000 handed over');

    a.Sync.connect(cloud.adapter);
    await settled([a]);
    const cloudAfterA = canonical(cloud.doc.pay);
    b.Sync.connect(cloud.adapter);
    await settleUntil(() => b.Sync.heldRecords().length > 0, 8000, 5);
    await settle(TICK * 20);

    same('THE CLOUD IS NOT REWRITTEN: its payment is still A\'s 2,000, and its book is byte for byte what A wrote',
        [cloud.doc.pay.pp_ps_w_khaled_20261002.amount, canonical(cloud.doc.pay)], [2000, cloudAfterA]);
    same('ON B, THE CLOUD\'S COPY STANDS', b.State.schedule.pay.pp_ps_w_khaled_20261002.amount, 2000);
    same('and B\'s own 3,000 is kept beside it, whole',
        (b.State.schedule.payConflicted || {}).pp_ps_w_khaled_20261002.map(body => [body.amount, body.by]), [[3000, 'd_b3']]);
    same('B\'s write is HELD, by name, with both sides - and listed where a held write is listed',
        b.Sync.heldRecords().map(row => [row.path, row.mine.amount, row.cloud.amount]), [['pay.pp_ps_w_khaled_20261002', 3000, 2000]]);
    // js/ui/settings.js is not in the harness's load order; loaded over the stub document
    // the way tests/held.test.mjs loads it, so the row is described by the shipped words.
    vm.runInContext(readFileSync(new URL('../js/ui/settings.js', import.meta.url), 'utf8'), b.ctx, { filename: 'js/ui/settings.js' });
    same('⋯ shows it in the ledger\'s own words: a money record the cloud holds differently, kept, not sent, with no button',
        b.Sync.heldRecords().map(row => (said => [said.title, said.note, said.decidable, said.takeable])(
            b.call('describeHeldRecord', row, b.State.schedule))),
        [['רישום כספי', 'רישום כספי שהענן מחזיק אחרת. נשמר כאן ואינו נשלח; אין לו פתרון מהמסך הזה.', false, false]]);
    same('B says so on its status line - contested, not synced and not an error', b.Sync.status, 'contested');
    same('THE PHONE IS NOT STOPPED: no Recovery problem, writing is not blocked',
        [b.global('Recovery').problems.length, b.call('farkadWritesBlocked')], [0, false]);
    same('the fold on B counts what every other phone counts - 2,000 paid - and names the disagreement',
        (fold => [fold.statements.ps_w_khaled_20261002.paid, fold.conflicts])(b.call('paybookFold', b.State.schedule)),
        [2000, [{ id: 'pp_ps_w_khaled_20261002', variants: 1, workerIds: ['w_khaled'] }]]);
    same('Khaled reads `review` on B and every pay planner refuses him',
        [b.call('accountFor', b.State.schedule, 'w_khaled', TODAY).status,
            plan(b, 'planPayment', 'ps_w_khaled_20261002', 100, { paymentId: 'pp_more00000003', date: TODAY }, stamp(TODAY, b.id)).reasons],
        ['review', ['conflict']]);
    same('A never hears of it: synced, nothing beside, 2,000', [a.Sync.status, a.State.schedule.payConflicted,
        a.State.schedule.pay.pp_ps_w_khaled_20261002.amount], ['synced', undefined, 2000]);

    // The rest of B's evening goes out as on any day.
    given('B records a day', b.State.commit(b.call('assignPlace', b.State.schedule, '2026-10-18', 'w_nasser', 'actual', 'p_a')) === true);
    commit(b, salim(b), 'Salim\'s closure on B');
    await settleUntil(() => payIds(cloud.doc).length === 5 && Boolean((cloud.doc.days['2026-10-18'] || {}).actual), 8000, 5);
    same('a day and ANOTHER man\'s closure from the phone in dispute reach the cloud',
        [Boolean(cloud.doc.days['2026-10-18'].actual.w_nasser), payIds(cloud.doc)], [true, KHALED_PAY.concat(SALIM_PAY).sort()]);
    same('and the disputed payment on the cloud is still the 2,000', cloud.doc.pay.pp_ps_w_khaled_20261002.amount, 2000);
    await settleUntil(() => a.Sync.status === 'synced' && payIds(a.State.schedule).length === 5, 8000, 5);
    same('A receives Salim\'s closure from the phone in dispute', payIds(a.State.schedule), KHALED_PAY.concat(SALIM_PAY).sort());

    // Across a reopen, and across every later flush.
    const b2 = phone('d_b3', cloud, { storage: b.dump() });
    await settleUntil(() => b2.Sync.heldRecords().length > 0, 8000, 5);
    await settle(TICK * 20);
    same('REOPENED: the two bodies are still two, the hold still stands, the phone is still not stopped',
        [b2.State.schedule.pay.pp_ps_w_khaled_20261002.amount, b2.State.schedule.payConflicted.pp_ps_w_khaled_20261002.map(v => v.amount),
            b2.Sync.heldRecords().map(row => row.path), b2.call('farkadWritesBlocked')],
        [2000, [3000], ['pay.pp_ps_w_khaled_20261002'], false]);
    same('and the cloud has still never been offered the 3,000',
        [cloud.doc.pay.pp_ps_w_khaled_20261002.amount,
            cloud.attempts.filter(attempt => attempt.payload && attempt.payload['pay.pp_ps_w_khaled_20261002']
                && attempt.payload['pay.pp_ps_w_khaled_20261002'].amount === 3000).length], [2000, 0]);
}

// ================================================================ P4
{
    suite('P4: the same closure, different DEDUCTIONS - the ledger\'s rule, unweakened');

    const cloud = cloudWith();
    const a = phone('d_a4', null);
    const b = phone('d_b4', null);
    commit(a, khaled(a, { allocations: { [K1]: 500, [K2]: 100 } }), 'the closure on A: 500 and 100');
    commit(b, khaled(b, { allocations: { [K1]: 300, [K2]: 300 } }), 'the closure on B: 300 and 300');

    a.Sync.connect(cloud.adapter);
    await settled([a]);
    const cloudAfterA = [canonical(cloud.doc.pay), ledgerOf(cloud.doc)];
    b.Sync.connect(cloud.adapter);
    await settleUntil(() => b.call('farkadWritesBlocked'), 8000, 5);
    await settle(TICK * 20);

    same('THE SECOND PHONE IS STOPPED BY RECOVERY, exactly as before the pay book existed',
        [b.call('farkadWritesBlocked'), b.global('Recovery').problems.map(problem => problem.key)],
        [true, ['scheduleData:v2:ledger:conflict']]);
    same('with both deductions of each advance kept under ledger.conflicted',
        Object.keys(b.State.schedule.ledger.conflicted || {}).sort(), [`le_close_${K1}_20261002`, `le_close_${K2}_20261002`].sort());
    same('the cloud is byte for byte what A wrote - ledger and pay book', [canonical(cloud.doc.pay), ledgerOf(cloud.doc)], cloudAfterA);
    same('the pay book on B: the cloud\'s statement stands and B\'s is beside it',
        [b.State.schedule.pay.ps_w_khaled_20261002.advanceDeductions.map(row => row.amount),
            b.State.schedule.payConflicted.ps_w_khaled_20261002.map(body => body.advanceDeductions.map(row => row.amount))],
        [[500, 100], [[300, 300]]]);
    same('A is untouched', [a.Sync.status, a.call('farkadWritesBlocked'), a.State.schedule.payConflicted], ['synced', false, undefined]);

    // The person exports, acknowledges, and the phone writes again. Nothing of the losing
    // closure may reach the cloud then either.
    b.global('Recovery').acknowledge();
    given('B records a day after acknowledging', b.State.commit(
        b.call('assignPlace', b.State.schedule, '2026-10-18', 'w_nasser', 'actual', 'p_a')) === true);
    await settleUntil(() => Boolean((cloud.doc.days['2026-10-18'] || {}).actual), 8000, 5);
    await settle(TICK * 20);
    same('after the acknowledgement the day goes out and the closure on the cloud is still A\'s, entry for entry',
        [Boolean(cloud.doc.days['2026-10-18'].actual.w_nasser), canonical(cloud.doc.pay), ledgerOf(cloud.doc)], [true].concat(cloudAfterA));
    same('NO DOUBLE DEDUCTION anywhere: the cloud says 600 came off, once',
        [K1, K2].map(id => a.call('advanceOutstanding', cloud.doc, id).deducted), [500, 100]);
}

// ================================================================ P5
{
    suite('P5: a phone offline for weeks arrives with pay entries of its own');

    const cloud = cloudWith();
    const a = phone('d_a5', cloud);
    const c = phone('d_c5', cloud, { shipped: true });
    const b = phone('d_b5', null);                        // away the whole time
    await settled([a, c]);

    commit(b, salim(b), 'Salim\'s closure on the phone that is away');
    // Meanwhile the others carry on: a closure, a later payment against it, days.
    commit(a, khaled(a), 'Khaled\'s closure on A');
    const later = plan(a, 'planPayment', 'ps_w_khaled_20261002', 800, { paymentId: 'pp_weekslater01', date: TODAY }, stamp(TODAY, a.id));
    commit(a, later, 'a later payment on A');
    for (const date of ['2026-10-18', '2026-10-19', '2026-10-20']) {
        given(`a day is recorded on A (${date})`, a.State.commit(a.call('assignPlace', a.State.schedule, date, 'w_nasser', 'actual', 'p_a')) === true);
    }
    await settled([a, c]);
    given('the cloud has moved on without B', cloud.doc.revision > 1 && payIds(cloud.doc).length === 4,
        JSON.stringify([cloud.doc.revision, payIds(cloud.doc), a.Sync.status, a.Sync.pendingCount(), c.Sync.status]));

    b.Sync.connect(cloud.adapter);
    await settled([a, b, c]);
    const all = KHALED_PAY.concat(SALIM_PAY, ['pp_weekslater01']).sort();
    same('the cloud holds everybody\'s entries', payIds(cloud.doc), all);
    same('and so do all three phones, byte for byte', [bookOf(a), bookOf(b), bookOf(c)], Array(3).fill(cloudBook(cloud)));
    same('nobody is held', [a, b, c].map(d => [d.Sync.status, d.State.schedule.payConflicted, d.call('farkadWritesBlocked')]),
        Array(3).fill(['synced', undefined, false]));
    same('the phone that was away has the days too', Object.keys(b.State.schedule.days).filter(d => d > '2026-10-17').sort(),
        ['2026-10-18', '2026-10-19', '2026-10-20']);
}

// ================================================================ P6
{
    suite('P6: a snapshot that carries no `pay` at all removes nothing');

    const cloud = cloudWith();
    const a = phone('d_a6', cloud);
    await settled([a]);
    commit(a, khaled(a), 'Khaled\'s closure on A');
    await settled([a]);
    const before = bookOf(a);
    given('A and the cloud agree', before === cloudBook(cloud) && payIds(cloud.doc).length === 3);

    // What a phone that has not updated leaves behind when it replaces the whole document:
    // its own copy, which never kept `pay`. Written straight onto the fake cloud at the
    // next revision, the way a restore from that phone would land.
    const without = clone(cloud.doc);
    delete without.pay;
    without.revision += 1;
    without.updatedAt = '2026-10-17T08:00:00.000Z';
    without.updatedBy = 'd_not_updated';
    cloud.doc = without;
    cloud.subscribers.forEach(deliver => deliver(clone(without)));
    await settle(TICK * 20);

    same('A adopted the snapshot (it is the newer document) and STILL holds every pay entry',
        [a.State.schedule.updatedBy, bookOf(a)], ['d_not_updated', before]);
    same('on its disk too', canonical(JSON.parse(a.raw(SCHEDULE)).pay), before);
    same('nobody is told there is a disagreement, because there is none',
        [a.State.schedule.payConflicted, a.call('farkadWritesBlocked'), a.Sync.heldRecords().length], [undefined, false, 0]);
    // MEASURED, AND NOT A GUARANTEE THIS BUILD GIVES: the entries are on the phone and no
    // longer on the cloud, the phone says synced, and nothing puts them back by itself -
    // they were acknowledged long ago and are in no queue. It is the ledger's own exposure
    // (features/restore-ledger/contract.md, «B never sends it back»), and it is why THE
    // ROLLOUT RULE forbids a whole-document restore from a phone that has not updated.
    // Pinned so that the day a later phase heals it, this check moves on purpose.
    same('TODAY: the cloud is left without them, and this phone does not put them back on its own',
        [payIds(cloud.doc), a.Sync.status, a.Sync.pendingCount()], [[], 'synced', 0]);
    const fresh = phone('d_c6', cloud, { shipped: true, storage: {} });
    await settled([fresh]);
    same('a phone that installs now is told nothing of the pay book - which is what that whole-document write cost',
        payIds(fresh.State.schedule), []);
}

// ================================================================ P7
{
    suite('P7: pay entries still waiting to go survive the adoption of somebody else\'s snapshot');

    const cloud = cloudWith();
    const a = phone('d_a7', cloud);
    const b = phone('d_b7', cloud);
    await settled([a, b]);

    cloud.online = false;                                  // nothing of A's can leave
    commit(a, khaled(a), 'Khaled\'s closure on A, with no signal');
    await settle(TICK * 10);
    given('A\'s closure is queued and unsent', a.Sync.pendingCount() >= 5 && payIds(cloud.doc).length === 1);
    const mine = bookOf(a);

    // B's day reaches the cloud by another road and is delivered to A while A is still owed.
    const moved = clone(cloud.doc);
    moved.days['2026-10-18'] = { actual: { w_nasser: { entries: [{ placeId: 'p_a' }], rates: { daily: 500, hourly: 0 } } } };
    moved.revision += 1;
    moved.updatedAt = '2026-10-17T09:00:00.000Z';
    moved.updatedBy = 'd_b7';
    cloud.doc = moved;
    a.Sync.receive(clone(moved));
    await settle(TICK * 5);

    same('A adopted the other phone\'s day', Boolean(a.State.schedule.days['2026-10-18'].actual.w_nasser), true);
    same('and its own unsent pay entries are exactly where they were', [bookOf(a), a.State.schedule.payConflicted], [mine, undefined]);
    same('with the closure\'s ledger entries beside them',
        Object.keys(a.State.schedule.ledger.advances).filter(id => /^le_(period|close)_/.test(id)).length, 3);
    same('on the disk as well', canonical(JSON.parse(a.raw(SCHEDULE)).pay), mine);

    cloud.online = true;
    a.Sync.scheduleFlush();
    await settled([a, b]);
    same('when the signal returns they go out, and B receives them', [cloudBook(cloud), bookOf(b)], [mine, mine]);
}

// ================================================================ P8
{
    suite('P8: a write that landed and whose answer was lost is delivered twice - and is one entry');

    // The closure's update LANDS, and the phone is told it failed. `deaf` is whether the
    // snapshot of that write is lost with the answer - a dropped connection loses both; a
    // slow one can deliver the snapshot and still time the answer out.
    const loseTheAnswer = (cloud, deaf) => {
        const real = cloud.adapter.update;
        const state = { lost: 0, restore: () => { cloud.adapter.update = real; } };
        cloud.adapter.update = patch => {
            if (!patch['pay.ps_w_khaled_20261002'] || state.lost > 0) return real(patch);
            state.lost += 1;
            const listening = cloud.subscribers;
            if (deaf) cloud.subscribers = [];
            const landed = real(patch);
            cloud.subscribers = listening;
            return landed.then(() => { throw Object.assign(new Error('the connection dropped'), { code: 'unavailable' }); });
        };
        return state;
    };
    const closureWrites = cloud => cloud.writes.filter(write => write.kind === 'update' && write.patch['pay.ps_w_khaled_20261002']);
    const onCloud = cloud => [payIds(cloud.doc), Object.keys(cloud.doc.ledger.advances).filter(id => id.indexOf('le_close_') === 0).length];

    // --- the answer AND the snapshot are lost: the retry sends the same operation again.
    {
        const cloud = cloudWith();
        const a = phone('d_a8', cloud);
        await settled([a]);
        const fault = loseTheAnswer(cloud, true);
        commit(a, khaled(a), 'Khaled\'s closure on A');
        await settled([a], 20000);
        fault.restore();
        const sent = closureWrites(cloud);
        same('the answer was lost once, and the closure went out twice under ONE operation id',
            [fault.lost, sent.length, new Set(sent.map(write => write.patch.lastOpId)).size], [1, 2, 1]);
        same('the second arrival was answered from its receipt, not applied', sent.map(write => Boolean(write.replayed)), [false, true]);
        same('one statement, one payment, one deduction per advance on the cloud', onCloud(cloud), [KHALED_PAY, 2]);
        same('the phone is synced with nothing pending and holds what the cloud holds',
            [a.Sync.status, a.Sync.pendingCount(), bookOf(a), a.State.schedule.payConflicted], ['synced', 0, cloudBook(cloud), undefined]);
    }

    // --- only the answer is lost: the phone hears its own write come back, and the retry
    // finds every entry already on the server as the same fact. Nothing is sent twice.
    {
        const cloud = cloudWith();
        const a = phone('d_a8b', cloud);
        await settled([a]);
        const fault = loseTheAnswer(cloud, false);
        commit(a, khaled(a), 'Khaled\'s closure on A');
        await settleUntil(() => fault.lost === 1 && a.Sync.pendingCount() === 0, 20000, 5);
        fault.restore();
        same('the answer was lost once, and the closure was NOT sent a second time', [fault.lost, closureWrites(cloud).length], [1, 1]);
        same('one statement, one payment, one deduction per advance on the cloud', onCloud(cloud), [KHALED_PAY, 2]);
        same('nothing is pending, nothing is held, nothing is beside, and the phone holds what the cloud holds',
            [a.Sync.pendingCount(), a.Sync.heldRecords().length, a.State.schedule.payConflicted, bookOf(a)], [0, 0, undefined, cloudBook(cloud)]);
        // The stale status line of P2, reached from the failure side: see the note there.
        same('TODAY: its status line still shows the failure, over a queue that is empty', a.Sync.status, 'error');
        given('a day is recorded', a.State.commit(a.call('assignPlace', a.State.schedule, '2026-10-18', 'w_nasser', 'actual', 'p_a')) === true);
        await settled([a]);
        same('and says synced once anything else goes through', a.Sync.status, 'synced');
    }
}

// ================================================================ P9
{
    suite('P9: the phone is closed in the middle of the flush that carries a closure');

    const cloud = cloudWith();
    const a = phone('d_a9', cloud);
    await settled([a]);

    const open = deferred();
    cloud.hold = (kind, payload) => (kind === 'update' && payload['pay.ps_w_khaled_20261002'] ? open.promise : null);
    commit(a, khaled(a), 'Khaled\'s closure on A');
    await settleUntil(() => cloud.attempts.some(attempt => attempt.payload && attempt.payload['pay.ps_w_khaled_20261002']), 8000, 5);
    given('the closure\'s write is open and has not landed', payIds(cloud.doc).length === 1);
    const disk = a.dump();                                 // the phone dies here
    a.Sync.adapter = null;

    const a2 = phone('d_a9', null, { storage: disk });
    same('REOPENED mid-flush: the closure is on the phone, whole', payIds(a2.State.schedule), KHALED_PAY);
    same('and still owed to the cloud', a2.Sync.pendingCount() >= 5, true);

    // The write the dead session opened lands after all - and then the new session sends.
    open.release();
    cloud.hold = null;
    await settle(TICK * 10);
    given('the first session\'s write landed', payIds(cloud.doc).length === 3);
    a2.Sync.connect(cloud.adapter);
    await settleUntil(() => a2.Sync.pendingCount() === 0, 20000, 5);
    await settle(TICK * 10);
    // (Its status line is P2's stale «שולח» again - everything was settled against the
    // server's copy and nothing was sent - so the queue is what is asked here.)
    same('one statement and one payment on the cloud, and the reopened phone owes nothing and holds the cloud\'s book',
        [payIds(cloud.doc), a2.Sync.pendingCount(), bookOf(a2)], [KHALED_PAY, 0, cloudBook(cloud)]);
    same('the closure reached the cloud exactly once - the reopened session sent no second copy',
        cloud.writes.filter(write => write.kind === 'update' && write.patch['pay.ps_w_khaled_20261002']).length, 1);
    same('nothing was held and nothing is beside', [a2.Sync.heldRecords().length, a2.State.schedule.payConflicted,
        a2.call('farkadWritesBlocked')], [0, undefined, false]);
    same('the advances were reduced once', [K1, K2].map(id => a2.call('advanceOutstanding', cloud.doc, id).left), [0, 300]);
}

// ================================================================ P10
{
    suite('P10: IS A CLOSURE ALL-OR-NOTHING ON THE WIRE? Measured, four ways');

    // What "whole" means for Khaled's closure with an extra deduction: seven field paths.
    const whole = device => khaled(device, { extras: [{ amount: 150, category: 'agreed', reason: 'ציוד' }], paid: 2000 });
    const closureOn = doc => ({
        artifact: Boolean(doc.ledger.advances.le_period_w_khaled_20261002),
        deducted: Object.keys(doc.ledger.advances).filter(id => id.indexOf('le_close_') === 0).length,
        statement: Boolean((doc.pay || {}).ps_w_khaled_20261002),
        payment: Boolean((doc.pay || {}).pp_ps_w_khaled_20261002),
        extra: Boolean((doc.pay || {}).pd_w_khaled_20261002_1)
    });
    // What each of the four measurements found, for the one sentence at the end.
    const found = {};
    const EVERYTHING = { artifact: true, deducted: 2, statement: true, payment: true, extra: true };

    // --- (1) the ordinary case: one batch, one write.
    {
        const cloud = cloudWith();
        const a = phone('d_a10', cloud);
        await settled([a]);
        const writesBefore = cloud.writes.length;
        commit(a, whole(a), 'the closure');
        await settled([a]);
        const carrying = cloud.writes.slice(writesBefore).filter(write => write.kind === 'update'
            && Object.keys(write.patch).some(path => /^(pay|ledger)\./.test(path)));
        same('(1) AN ORDINARY CLOSURE IS ONE WRITE: all six paths in a single update, at one revision',
            [carrying.length, Object.keys(carrying[0].patch).filter(path => /^(pay|ledger)\./.test(path)).length, closureOn(cloud.doc)],
            [1, 6, EVERYTHING]);
        found.oneWriteWhenItFits = carrying.length === 1;
    }

    // --- (2) a sibling path is contested: the batch is held WHOLE. Nothing new from it lands.
    {
        const cloud = cloudWith();
        const a = phone('d_a10b', null);
        const b = phone('d_b10b', null);
        commit(a, khaled(a, { paid: 2000 }), 'the closure on A, with no extra deduction');
        commit(b, whole(b), 'the closure on B, with an extra deduction of 150');
        a.Sync.connect(cloud.adapter);
        await settled([a]);
        b.Sync.connect(cloud.adapter);
        await settleUntil(() => b.Sync.heldRecords().length > 0, 8000, 5);
        await settle(TICK * 25);
        same('(2) B\'s statement differs from the one on the cloud, so it is held',
            b.Sync.heldRecords().map(row => row.path), ['pay.ps_w_khaled_20261002']);
        same('(2) AND ITS SIBLING IS HELD WITH IT: the extra deduction, which collides with nothing, never reaches the cloud',
            [closureOn(cloud.doc).extra, cloud.attempts.filter(attempt => attempt.payload
                && attempt.payload['pay.pd_w_khaled_20261002_1']).length], [false, 0]);
        found.heldWholeBeforeSending = closureOn(cloud.doc).extra === false;
        same('(2) the cloud holds A\'s closure whole and nothing of B\'s', [closureOn(cloud.doc), cloud.doc.pay.ps_w_khaled_20261002.by],
            [Object.assign({}, EVERYTHING, { extra: false }), 'd_a10b']);
        same('(2) on B the orphaned deduction is on the record, held by the fold, counted by nothing',
            [Boolean(b.State.schedule.pay.pd_w_khaled_20261002_1),
                b.call('paybookFold', b.State.schedule).held.map(row => row.id),
                b.call('paybookFold', b.State.schedule).statements.ps_w_khaled_20261002.owed], [true, ['pd_w_khaled_20261002_1'], 3800]);
    }

    // --- (3) the same, decided by the SERVER: two phones flush at once and one is refused.
    {
        const cloud = cloudWith();
        const a = phone('d_a10c', cloud);
        const b = phone('d_b10c', cloud);
        await settled([a, b]);
        // B's update is held open until A's has landed, so B's is built on a stale revision.
        const gate = deferred();
        cloud.hold = (kind, payload) => (kind === 'update' && payload.updatedBy === 'd_b10c'
            && payload['pay.ps_w_khaled_20261002'] ? gate.promise : null);
        commit(b, whole(b), 'the closure on B, with an extra deduction');
        await settleUntil(() => cloud.attempts.some(attempt => attempt.payload && attempt.payload.updatedBy === 'd_b10c'
            && attempt.payload['pay.ps_w_khaled_20261002']), 8000, 5);
        // A must not adopt B's unsent closure, and B's has not landed: A closes on its own.
        commit(a, khaled(a, { paid: 2000 }), 'the closure on A, with no extra deduction');
        await settleUntil(() => closureOn(cloud.doc).statement, 8000, 5);
        given('A\'s closure landed first', cloud.doc.pay.ps_w_khaled_20261002.by === 'd_a10c');
        gate.release();
        cloud.hold = null;
        await settleUntil(() => b.Sync.heldRecords().length > 0, 8000, 5);
        await settle(TICK * 25);
        same('(3) the server refused B\'s write on its revision, and NOTHING of it was applied',
            [closureOn(cloud.doc), cloud.doc.pay.ps_w_khaled_20261002.by], [Object.assign({}, EVERYTHING, { extra: false }), 'd_a10c']);
        same('(3) the statement is held on B, and the batch with it - the extra deduction is never sent on its own',
            [b.Sync.heldRecords().map(row => row.path),
                cloud.writes.filter(write => write.patch && write.patch['pay.pd_w_khaled_20261002_1']).length],
            [['pay.ps_w_khaled_20261002'], 0]);
        found.heldWholeAfterRefusal = closureOn(cloud.doc).extra === false && b.Sync.heldRecords().length === 1;
    }

    // --- (4) THE CUT. One write carries at most 296 field paths, and the cut does not
    // know what a batch is. A phone that comes back with a long evening queued ahead of
    // a closure sends the closure in TWO writes.
    {
        const cloud = cloudWith();
        const b = phone('d_b10d', null);
        // 293 day paths, queued offline, ahead of the closure in the queue.
        const days = [];
        for (let n = 0; days.length < 293; n += 1) {
            const date = new Date(Date.UTC(2027, 0, 3) + n * 86400000).toISOString().slice(0, 10);
            ['w_ahmad', 'w_khaled', 'w_nasser', 'w_salim'].forEach(worker => { if (days.length < 293) days.push([date, worker]); });
        }
        for (let at = 0; at < days.length; at += 50) {
            const changes = days.slice(at, at + 50).map(([date, worker]) =>
                b.call('assignPlace', b.State.schedule, date, worker, 'actual', 'p_a'));
            given('a block of days is recorded offline', b.State.commitMany(changes) === true);
        }
        commit(b, whole(b), 'the closure, after them');
        given('the queue holds 293 days and the closure\'s seven paths', b.Sync.pendingCount() === 293 + 6,
            String(b.Sync.pendingCount()));

        // The second write is refused, as a dropped connection refuses it.
        let updates = 0;
        cloud.reject = kind => {
            if (kind !== 'update') return null;
            updates += 1;
            return updates >= 2 ? Object.assign(new Error('the connection dropped'), { code: 'unavailable' }) : null;
        };
        b.Sync.connect(cloud.adapter);
        await settleUntil(() => updates >= 2, 10000, 5);
        await settle(TICK * 5);
        const first = cloud.writes.filter(write => write.kind === 'update').pop();
        const half = closureOn(cloud.doc);
        same('(4) the first write carried exactly 296 field paths',
            Object.keys(first.patch).filter(path => /^(days|pay|ledger|roster|advances)\./.test(path)).length, 296);
        check('(4) AND THE CLOUD THEN HOLDS HALF A CLOSURE - the frozen payslip and the deductions, with no statement and no payment',
            half.artifact === true && half.deducted === 2 && half.statement === false && half.payment === false && half.extra === false,
            JSON.stringify(half));
        found.cutInTwo = half.artifact === true && half.statement === false;
        // What every other phone makes of that half, for as long as the second write is away.
        const c = phone('d_c10d', cloud, { shipped: true });
        await settleUntil(() => c.Sync.status === 'synced', 8000, 5);
        same('(4) another phone reads it as a closure nobody recorded a payment for: the advances reduced, no wage owed, payment unknown',
            (account => [[K1, K2].map(id => c.call('advanceOutstanding', c.State.schedule, id).left), account.wageDue,
                account.paymentUnknown.map(row => row.periodFrom)])(c.call('accountFor', c.State.schedule, 'w_khaled', TODAY)),
            [[0, 300], 0, ['2026-10-02']]);

        cloud.reject = null;
        b.Sync.scheduleFlush();
        await settled([b, c], 20000);
        same('(4) when the second write lands the closure is whole, on the cloud and on both phones',
            [closureOn(cloud.doc), bookOf(c) === bookOf(b), c.call('accountFor', c.State.schedule, 'w_khaled', TODAY).wageDue],
            [EVERYTHING, true, 1650]);
    }

    // THE ANSWER, as one sentence a later phase can be held to.
    same('THE ANSWER: no. One write when it fits, held whole when a path of it is contested - and cut in two by the 296-path limit',
        found, { oneWriteWhenItFits: true, heldWholeBeforeSending: true, heldWholeAfterRefusal: true, cutInTwo: true });
}

// ================================================================ P11
{
    suite('P11: a restore - from a document with no pay book, and with a payment landing in its window');

    const cloud = cloudWith();
    const a = phone('d_a11', cloud);
    const b = phone('d_b11', cloud);
    await settled([a, b]);
    commit(a, khaled(a), 'Khaled\'s closure on A');
    await settled([a, b]);
    const book = cloudBook(cloud);

    // The backup: the record as it was BEFORE the pay book, a day short.
    const backup = clone(BASE.schedule);
    delete backup.pay;
    delete backup.days['2026-10-15'];

    // --- sequential: the restore goes out with nothing in its way.
    {
        const result = await a.Sync.replaceEverything(a.call('normaliseSchedule', clone(backup)));
        await settled([a, b], 20000);
        same('the restore finished', result.ok, true);
        same('the work record IS replaced, on the cloud and on both phones',
            [cloud.doc.days['2026-10-15'], a.State.schedule.days['2026-10-15'], b.State.schedule.days['2026-10-15']], [undefined, undefined, undefined]);
        same('AND THE PAY BOOK IS NOT: the cloud and both phones still hold every entry',
            [cloudBook(cloud), bookOf(a), bookOf(b)], [book, book, book]);
        same('nor the closure\'s ledger entries',
            Object.keys(cloud.doc.ledger.advances).filter(id => /^le_(period|close)_/.test(id)).length, 3);
        same('nothing is beside, nobody is held', [a, b].map(d => [d.State.schedule.payConflicted, d.call('farkadWritesBlocked'), d.Sync.status]),
            [[undefined, false, 'synced'], [undefined, false, 'synced']]);
    }

    // --- overlapping: B records a payment while A's restore is open on the wire.
    {
        const open = deferred();
        cloud.hold = kind => (kind === 'save' ? open.promise : null);
        const restoring = a.Sync.replaceEverything(a.call('normaliseSchedule', clone(backup)));
        await settleUntil(() => cloud.attempts.filter(attempt => attempt.kind === 'save').length >= 2, 8000, 5);
        given('A\'s second restore is in flight', cloud.writes.filter(write => write.kind === 'save').length === 1);

        const later = plan(b, 'planPayment', 'ps_w_khaled_20261002', 800, { paymentId: 'pp_inwindow0001', date: TODAY }, stamp(TODAY, b.id));
        commit(b, later, 'a later payment on B, while the restore is open');
        await settleUntil(() => Boolean((cloud.doc.pay || {}).pp_inwindow0001), 8000, 5);
        given('the payment is on the cloud while the restore is still open', Boolean(cloud.doc.pay.pp_inwindow0001));

        open.release();
        cloud.hold = null;
        await restoring.catch(() => {});
        await settled([a, b], 25000);
        same('THE PAYMENT IS NOT ERASED BY THE RESTORE THAT WAS ALREADY ON ITS WAY: the cloud still holds it',
            [Boolean(cloud.doc.pay.pp_inwindow0001), cloud.doc.pay.pp_inwindow0001.amount], [true, 800]);
        same('and so do both phones - the one that restored included', [a, b].map(d => (d.State.schedule.pay.pp_inwindow0001 || {}).amount), [800, 800]);
        same('both fold 1,000 still owed to him', [a, b].map(d => d.call('accountFor', d.State.schedule, 'w_khaled', TODAY).wageDue), [1000, 1000]);
        same('the two phones hold the same book as the cloud', [bookOf(a), bookOf(b)], [cloudBook(cloud), cloudBook(cloud)]);
    }

    // --- a file that holds an OLDER BODY for an id: what is live stands, the file's is beside.
    {
        const stale = clone(BASE.schedule);
        stale.pay = clone(cloud.doc.pay);
        stale.pay.pp_ps_w_khaled_20261002 = Object.assign({}, stale.pay.pp_ps_w_khaled_20261002, { amount: 1 });
        const result = await a.Sync.replaceEverything(a.call('normaliseSchedule', stale));
        await settled([a, b], 20000);
        same('a restore never REWRITES an entry: the cloud\'s payment is still 2,000 after a file that says 1',
            [result.ok, cloud.doc.pay.pp_ps_w_khaled_20261002.amount, a.State.schedule.pay.pp_ps_w_khaled_20261002.amount], [true, 2000, 2000]);
        same('the file\'s body is kept beside it, and travels - both phones are told',
            [a, b].map(d => ((d.State.schedule.payConflicted || {}).pp_ps_w_khaled_20261002 || []).map(body => body.amount)), [[1], [1]]);
        same('neither phone is stopped by it', [a, b].map(d => d.call('farkadWritesBlocked')), [false, false]);
    }
}

report();
