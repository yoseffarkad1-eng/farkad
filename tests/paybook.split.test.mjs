// The split, as a model: what a closed document holds, what would leave the live document,
// what the index keeps - and what the document weighs with and without it. (v175)
//
//   node tests/paybook.split.test.mjs
//
// The whole schedule is one Firestore document and closures are what fill it
// (docs/payroll-closure.md, Capacity). The owner approved moving closed accounts out of it
// (2026-11-10). This suite is about the PURE half of that, in js/model/payroll.js:
//
//   S1   the operation and its closed document: what js/sync/transact.js sends, and the
//        reader that judges a closed document arriving from the server or a file
//   S2   lossless: the closed documents laid back over a record that has dropped them
//        rebuild it byte for byte
//   S3   THE INDEX IS ENOUGH: on seeded random records, the folds from the index equal
//        the folds from the whole history, shekel for shekel - every closed period's
//        frozen figures, what was deducted from every advance, every man's wage balances
//   S4   planHistoryMove: a report that writes nothing, and adds up
//   S5   detail on this phone, or not
//   S6   CAPACITY for 20 men over 5 years, weighed the way Firestore weighs a document:
//        the curve as it is written today, and with the split
//
// WHAT IS NOT HERE, because it is not built: dropping the live copy, and folds that read
// the index instead of the entries. S3 is the proof that they can be built on this index;
// nothing in the app moves an entry out of the live document yet.
//
// Synthetic data only.

import { makeDevice } from './harness.mjs';
import { suite, check, same, given, report } from './runner.mjs';

const clone = value => JSON.parse(JSON.stringify(value));
const canonical = value => {
    if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
    if (value && typeof value === 'object') {
        return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
    }
    return JSON.stringify(value === undefined ? null : value);
};
const D = makeDevice({ deviceId: 'd_split', flags: { paybook: true } });
const F = (name, ...args) => D.call(name, ...args);
const step = (day, n) => F('advanceDayStep', day, n);
const stamp = (today, hour = '10') => ({ at: `${today}T${hour}:00:00.000Z`, by: 'd_boss', today });

const KHALED = { id: 'w_k', name: 'חאלד', active: true, dailyRate: 350, hourlyRate: 50 };
const AHMAD = { id: 'w_a', name: 'אחמד', active: true, dailyRate: 300, hourlyRate: 50, payCycles: '2026-08-07=weekly' };
const FIRST = '2026-08-07';       // a Friday that opens a fortnight
const LAST = '2026-10-29';

function record(workers) {
    const S = clone(F('emptySchedule'));
    S.workers = workers.map(clone);
    S.places = [{ id: 'p_a', name: 'אילון', active: true }, { id: 'p_b', name: 'גבעתיים', active: true }];
    // The carry approval the owner gives once, up front - see T13 in tests/paybook.transact.test.mjs.
    F('recordCarryApproval', S, F('planCarryMigration', S), '2026-08-01T08:00:00.000Z', 'd_boss');
    return S;
}
const work = (S, worker, day, place, hours) => F('assignPlace', S, day, worker, 'actual', place || 'p_a', undefined, hours || 0);
const advance = (S, worker, date, amount) => {
    F('recordNewAdvance', S, worker, date, amount, 'בדיקה', `${date}T09:00:00.000Z`, 'd_boss', 'cash');
    const all = F('currentAdvances', S);
    return Object.keys(all).filter(id => all[id].workerId === worker && all[id].date === date && all[id].amount === amount).sort().pop();
};
const apply = (S, plan, what) => {
    given(`${what} is allowed`, plan.ok === true && plan.changes.length > 0, JSON.stringify(plan.reasons));
    const done = F('paybookApply', S, plan.changes);
    given(`${what} lands whole`, done.refused.length === 0 && done.conflicts.length === 0, JSON.stringify([done.refused, done.conflicts]));
    return done.schedule;
};
const opened = S => apply(S, F('planOpening', S, FIRST, stamp(FIRST)), 'the opening');
const F1 = { from: '2026-08-07', to: '2026-08-20' };
const F2 = { from: '2026-08-21', to: '2026-09-03' };

// One small record with everything in it: a closure with two advances, an extra deduction
// and a part payment; a later payment; a void; and a closure made the old way.
const WORLD = (() => {
    let S = record([KHALED, AHMAD]);
    for (let n = 0; n < 12; n += 1) work(S, 'w_k', step(F1.from, n + (n > 5 ? 2 : 0)), n % 2 ? 'p_b' : 'p_a', n === 3 ? 2 : 0);
    for (let n = 0; n < 5; n += 1) work(S, 'w_a', step(F1.from, n + 2));
    for (let n = 0; n < 8; n += 1) work(S, 'w_k', step(F2.from, n + 2));
    const k1 = advance(S, 'w_k', '2026-08-09', 500);
    const k2 = advance(S, 'w_k', '2026-08-12', 400);
    S = opened(S);
    const closure = F('planClosure', S, 'w_k', F1, { allocations: { [k1]: 500, [k2]: 100 },
        extras: [{ amount: 150, category: 'agreed', reason: 'ציוד' }], paid: 2000, paidOn: '2026-08-21', method: 'cash',
        note: 'סגירה ראשונה' }, stamp('2026-08-21'));
    const afterClosure = apply(S, closure, 'the closure');
    const payment = F('planPayment', afterClosure, 'ps_w_k_20260807', 600, { paymentId: 'pp_later0000001', date: '2026-08-25', method: 'transfer' }, stamp('2026-08-25'));
    const afterPayment = apply(afterClosure, payment, 'the later payment');
    const undo = F('planVoid', afterPayment, 'pp_later0000001', { reason: 'נרשם בטעות', date: '2026-08-26' }, stamp('2026-08-26'));
    const afterVoid = apply(afterPayment, undo, 'the void');
    // And Ahmad's first week, closed the way the existing dialog closes one.
    const old = clone(afterVoid);
    given('a week closes the old way', F('closePeriodChanges', old, 'w_a', '2026-08-07', '2026-08-13', '2026-08-14T08:00:00.000Z', 'd_boss', 0).length === 1);
    return { before: S, closure, payment, undo, afterClosure, full: old, k1, k2 };
})();

// ================================================================ S1
{
    suite('S1: the operation and its closed document');

    const op = F('paybookOperation', WORLD.closure);
    same('a closure is one operation, named for its statement, carrying every path of the plan',
        [op.ok, op.kind, op.closedId, op.workerId, op.paths], [true, 'closure', 'ps_w_k_20260807', 'w_k', WORLD.closure.changes.map(change => change.path)]);
    same('its entries are the plan\'s values, byte for byte, and not the plan\'s own objects',
        [canonical(op.entries) === canonical(Object.fromEntries(WORLD.closure.changes.map(c => [c.path, c.value]))),
            op.entries['pay.ps_w_k_20260807'] !== WORLD.closure.changes.find(c => c.path === 'pay.ps_w_k_20260807').value], [true, true]);
    same('a later payment and a void are each their own operation, named for their own entry',
        [F('paybookOperation', WORLD.payment).closedId, F('paybookOperation', WORLD.undo).closedId], ['pp_later0000001', 'pv_pp_later0000001']);
    same('the opening is one too', (o => [o.ok, o.closedId, o.workerId])(F('paybookOperation', F('planOpening', record([KHALED]), FIRST, stamp(FIRST)))),
        [true, 'po_open', null]);
    const refused = F('planClosure', WORLD.afterClosure, 'w_k', F1, {}, stamp('2026-08-21'));
    same('a plan that was refused, a plan already done and nothing at all are not operations',
        [F('paybookOperation', refused).reasons, F('paybookOperation', F('planPayment', WORLD.full, 'ps_w_k_20260807', 600,
            { paymentId: 'pp_later0000001', date: '2026-08-25', method: 'transfer' }, stamp('2026-08-25'))).reasons, F('paybookOperation', null).reasons],
        [['plan'], ['plan'], ['plan']]);
    const ledgerOnly = { ok: true, kind: 'closure', changes: WORLD.closure.changes.filter(change => change.path.indexOf('ledger.') === 0) };
    same('a batch with no pay entry in it is the existing dialog\'s business, not this door\'s', F('paybookOperation', ledgerOnly).reasons, ['no-entry']);
    const strange = { ok: true, kind: 'closure', changes: WORLD.closure.changes.concat([{ path: 'days.2026-08-09.actual.w_k', value: null }]) };
    same('and a batch that reaches outside the pay book and the ledger is refused whole', F('paybookOperation', strange).reasons, ['paths']);

    const closed = F('paybookClosedDocument', op, 'pay1234', 7);
    same('the closed document: version, name, kind, whose, the commit that created it, and the entries',
        [closed.v, closed.id, closed.kind, closed.workerId, closed.opId, closed.revision, canonical(closed.entries) === canonical(op.entries)],
        [1, 'ps_w_k_20260807', 'closure', 'w_k', 'pay1234', 7, true]);
    same('this build\'s reader accepts what this build writes', F('paybookClosedProblems', 'ps_w_k_20260807', closed), []);
    const bad = change => { const next = clone(closed); change(next); return F('paybookClosedProblems', 'ps_w_k_20260807', next).length > 0; };
    same('and refuses: another version, another name, no operation, no revision, nothing in it, a path that is not an entry, an entry no build wrote',
        [bad(doc => { doc.v = 2; }), bad(doc => { doc.id = 'ps_other'; }), bad(doc => { doc.opId = ''; }), bad(doc => { doc.revision = 0; }),
            bad(doc => { doc.entries = {}; }), bad(doc => { doc.entries['days.2026-08-09'] = {}; }),
            bad(doc => { doc.entries['pay.ps_w_k_20260807'].netDue = '3650'; }), F('paybookClosedProblems', 'x', null).length > 0],
        Array(8).fill(true));
}

// ================================================================ S2
const bundlesOf = S => F('planHistoryMove', S).bundles;
const read = (S, path) => (path.indexOf('pay.') === 0 ? S.pay[path.split('.')[1]] : S.ledger.advances[path.split('.')[2]]);
function splitOf(S) {
    const live = clone(S);
    const closed = {};
    bundlesOf(S).forEach(bundle => {
        const entries = {};
        bundle.paths.forEach(path => {
            entries[path] = clone(read(S, path));
            if (path.indexOf('pay.') === 0) delete live.pay[path.split('.')[1]];
            else delete live.ledger.advances[path.split('.')[2]];
        });
        closed[bundle.closedId] = { v: 1, id: bundle.closedId, kind: 'closure', workerId: bundle.workerId, opId: 'op', revision: 1, entries };
    });
    return { live, closed };
}
function rejoin(live, closed) {
    const whole = clone(live);
    Object.keys(closed).forEach(id => Object.keys(closed[id].entries).forEach(path => {
        if (path.indexOf('pay.') === 0) whole.pay[path.split('.')[1]] = clone(closed[id].entries[path]);
        else whole.ledger.advances[path.split('.')[2]] = clone(closed[id].entries[path]);
    }));
    return whole;
}
{
    suite('S2: lossless - what leaves and what stays are, together, the record');

    const { live, closed } = splitOf(WORLD.full);
    same('two closed periods, two bundles: the pay book\'s, named for its statement, and the old one, named for its payslip',
        bundlesOf(WORLD.full).map(bundle => [bundle.closedId, bundle.source, bundle.paths.length]),
        [['ps_w_k_20260807', 'statement', 8], ['le_period_w_a_20260807', 'artifact', 1]]);
    same('the statement\'s bundle holds the payslip, both deductions, the statement, the extra, both payments and the void',
        bundlesOf(WORLD.full)[0].paths.slice().sort(), ['ledger.advances.le_period_w_k_20260807',
            `ledger.advances.le_close_${WORLD.k1}_20260807`, `ledger.advances.le_close_${WORLD.k2}_20260807`,
            'pay.ps_w_k_20260807', 'pay.pd_w_k_20260807_1', 'pay.pp_ps_w_k_20260807', 'pay.pp_later0000001',
            'pay.pv_pp_later0000001'].sort());
    same('what stays in the live document: the opening, the advances and their origins, and no closure',
        [Object.keys(live.pay), Object.keys(live.ledger.advances).filter(id => /^le_(period|close)_/.test(id))], [['po_open'], []]);
    same('laid back, the closed documents rebuild the record byte for byte', canonical(rejoin(live, closed)), canonical(WORLD.full));
    same('and every one of them is a closed document this build reads',
        Object.keys(closed).map(id => F('paybookClosedProblems', id, closed[id]).length), [0, 0]);
}

// ================================================================ S3
function mulberry(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
{
    suite('S3: the index is enough - folds from the index equal folds from the whole history, on seeded random records');

    const counts = { records: 0, statements: 0, oldClosures: 0, answered: 0, payments: 0, voids: 0, adjustments: 0, extras: 0,
        advances: 0, deductions: 0, unpaid: 0, unknown: 0 };
    const wrong = { closed: [], deducted: [], wage: [], lossless: [] };

    // Thirty records of twelve weeks; the `given` below says what they held.
    const RECORDS = 30;
    const UNTIL = LAST;
    for (let seed = 1; seed <= RECORDS; seed += 1) {
        const rnd = mulberry(seed * 104729);
        const pick = n => Math.floor(rnd() * n);
        let S = record([KHALED, AHMAD]);
        S = opened(S);
        const men = S.workers;
        const mine = { w_k: [], w_a: [] };
        const periods = { w_k: F('periodRangeFor', men[0], FIRST), w_a: F('periodRangeFor', men[1], FIRST) };
        let payments = 0;
        for (let day = FIRST; day <= UNTIL; day = step(day, 1)) {
            men.forEach(man => {
                const id = man.id;
                if (rnd() < 0.65) work(S, id, day, pick(2) ? 'p_a' : 'p_b', rnd() < 0.1 ? 2 : 0);
                if (rnd() < 0.1) { mine[id].push(advance(S, id, day, (pick(8) + 1) * 100)); counts.advances += 1; }
                if (day !== periods[id].to) return;
                const period = periods[id];
                periods[id] = F('nextPeriodFor', man, period.from);
                const roll = rnd();
                const when = stamp(step(period.to, 1));
                if (roll < 0.15) return;                                   // never closed
                if (roll < 0.3) {                                          // closed the old way
                    const made = F('closePeriodChanges', S, id, period.from, period.to, when.at, 'd_boss', 0);
                    if (made.length > 0) {
                        counts.oldClosures += 1;
                        if (rnd() < 0.5) {
                            const net = F('closedPeriods', S, id)[period.from].gross || 0;
                            const due = net > 0 && rnd() < 0.5 ? Math.floor(net / 2) : 0;
                            const answer = F('planLegacy', S, id, period.from, due > 0 ? { state: 'due', due } : { state: 'paid' }, when);
                            if (answer.ok) { S = apply(S, answer, 'a legacy answer'); counts.answered += 1; }
                        }
                    }
                    return;
                }
                const probe = F('planClosure', S, id, period, { allocations: {} }, when);
                if (!probe.review || probe.review.gross === null) return;
                let room = probe.review.gross;
                const extras = [];
                if (rnd() < 0.3 && room >= 100) { extras.push({ amount: 50, category: 'other', reason: 'ניכוי' }); room -= 50; }
                const allocations = {};
                probe.review.advances.forEach(row => {
                    const chosen = Math.min(room, Math.floor(row.left * pick(5) / 4));
                    allocations[row.advanceId] = chosen;
                    room -= chosen;
                });
                const net = room;
                const paid = [0, Math.floor(net / 2), net][pick(3)];
                const drawn = F('planClosure', S, id, period, { allocations, extras, paid, paidOn: when.today, method: 'cash' }, when);
                if (!drawn.ok) return;
                S = apply(S, drawn, 'a closure');
                counts.statements += 1;
                counts.extras += extras.length;
                counts.deductions += Object.keys(allocations).filter(key => allocations[key] > 0).length;
            });
            // Now and then, somebody pays part of what is owed, or corrects something.
            if (rnd() < 0.12) {
                const fold = F('paybookFold', S);
                const owing = Object.keys(fold.statements).filter(id => fold.statements[id].due > 0);
                if (owing.length > 0) {
                    const target = owing[pick(owing.length)];
                    const amount = Math.max(1, Math.floor(fold.statements[target].due * (pick(4) + 1) / 4));
                    payments += 1;
                    const paymentId = `pp_s${seed}n${String(payments).padStart(6, '0')}`;
                    const pay = F('planPayment', S, target, amount, { paymentId, date: day, method: 'transfer' }, stamp(day, '12'));
                    if (pay.ok && !pay.already) {
                        S = apply(S, pay, 'a payment');
                        counts.payments += 1;
                        if (rnd() < 0.2) {
                            const undo = F('planVoid', S, paymentId, { reason: 'טעות', date: day }, stamp(day, '13'));
                            if (undo.ok) { S = apply(S, undo, 'a void'); counts.voids += 1; }
                        }
                    }
                }
            }
            if (rnd() < 0.03) {
                const ids = Object.keys(F('paybookFold', S).statements);
                if (ids.length > 0) {
                    const adjust = F('planAdjustment', S, ids[pick(ids.length)], 25, { reason: 'תיקון', date: day }, stamp(day, '14'));
                    if (adjust.ok) { S = apply(S, adjust, 'an adjustment'); counts.adjustments += 1; }
                }
            }
        }
        counts.records += 1;

        const index = F('paybookIndexFrom', S);
        const folds = F('paybookIndexFolds', index);
        const today = step(UNTIL, 3);
        men.forEach(man => {
            const id = man.id;
            // --- every closed period's frozen figures
            const full = F('closedPeriods', S, id) || {};
            const lean = folds.closed[id] || {};
            const shape = period => [period.periodTo, Math.round((period.deducted || 0) * 100), period.gross, period.carriedIn, period.balanceAfter];
            if (canonical(Object.keys(full).sort().map(from => [from].concat(shape(full[from]))))
                !== canonical(Object.keys(lean).sort().map(from => [from].concat(shape(lean[from]))))) wrong.closed.push([seed, id]);
            // --- what came off every advance at a closure
            mine[id].forEach(advanceId => {
                const whole = F('advanceOutstanding', S, advanceId).deductedGross;
                const fromIndex = folds.deducted[advanceId] || 0;
                if (whole !== fromIndex) wrong.deducted.push([seed, advanceId, whole, fromIndex]);
            });
            // --- his wage balances
            const account = F('accountFor', S, id, today);
            const wage = folds.wage[id] || { wageDue: 0, wageOverpaid: 0, unpaid: [], paymentUnknown: [] };
            const one = [account.wageDue, account.wageOverpaid, account.unpaid.map(row => [row.statementId, row.due]).sort(),
                account.paymentUnknown.map(row => row.periodFrom).sort()];
            const two = [wage.wageDue, wage.wageOverpaid, wage.unpaid.map(row => [row.statementId, row.due]).sort(),
                wage.paymentUnknown.slice().sort()];
            if (canonical(one) !== canonical(two)) wrong.wage.push([seed, id, one, two]);
            counts.unpaid += account.unpaid.length;
            counts.unknown += account.paymentUnknown.length;
        });
        const parts = splitOf(S);
        if (canonical(rejoin(parts.live, parts.closed)) !== canonical(S)) wrong.lossless.push(seed);
    }

    given('the generator produced every kind of thing the claim is about',
        counts.records === RECORDS && counts.statements > 100 && counts.oldClosures > 20 && counts.answered > 8 && counts.payments > 40
        && counts.voids > 3 && counts.adjustments > 10 && counts.extras > 20 && counts.deductions > 40 && counts.unpaid > 30 && counts.unknown > 8,
        JSON.stringify(counts));
    console.log('        ' + JSON.stringify(counts));
    same(`every closed period (${counts.statements + counts.oldClosures}) reads the same from the index: its last day, what was deducted, its wage, the balance it opened and closed on`,
        wrong.closed.slice(0, 3), []);
    same(`what was deducted from each of ${counts.advances} advances at closures is the same from the index as from the ledger`, wrong.deducted.slice(0, 3), []);
    same('every man\'s «יתרת שכר לתשלום», what is overpaid, each statement still owing and each closure with payment unknown: the same', wrong.wage.slice(0, 2), []);
    same('and on every one of those records the closed documents laid back rebuild it byte for byte', wrong.lossless, []);
}

// ================================================================ S4
{
    suite('S4: planHistoryMove - a report that writes nothing, and adds up');

    const frozen = value => {
        if (value && typeof value === 'object') { Object.keys(value).forEach(key => frozen(value[key])); Object.freeze(value); }
        return value;
    };
    const bytes = JSON.stringify(WORLD.full);
    const said = F('planHistoryMove', frozen(clone(WORLD.full)));
    same('the record is the same bytes afterwards, a deep-frozen record is read without a throw, and no change is offered',
        [JSON.stringify(WORLD.full) === bytes, said.changes], [true, []]);
    same('it says the same thing twice', JSON.stringify(F('planHistoryMove', WORLD.full)), JSON.stringify(said));
    const sum = list => list.reduce((total, n) => total + n, 0);
    same('the totals are the bundles added up, and the document afterwards is the document less what moved plus the index',
        [said.totals.bundles, said.totals.entries, said.totals.bytes === sum(said.bundles.map(bundle => bundle.bytes)),
            said.totals.freed === said.totals.bytes - said.totals.indexBytes,
            said.totals.documentBytesAfter === said.totals.documentBytes - said.totals.bytes + said.totals.indexBytes],
        [2, 9, true, true, true]);
    const { live } = splitOf(WORLD.full);
    check('and that arithmetic is true of the record: what is left after the split, plus the index, weighs what the report says (to the map\'s own punctuation)',
        Math.abs(JSON.stringify(live).length + said.totals.indexBytes - said.totals.documentBytesAfter) < 16 * said.totals.entries,
        JSON.stringify([JSON.stringify(live).length, said.totals.indexBytes, said.totals.documentBytesAfter]));
    same('SETTLED is said per bundle: Khaled\'s statement still owes him 1,550, and nobody has answered for Ahmad\'s old closure - neither may move yet',
        said.bundles.map(bundle => [bundle.closedId, bundle.settled]), [['ps_w_k_20260807', false], ['le_period_w_a_20260807', false]]);
    const stillDue = F('paybookFold', WORLD.full).statements.ps_w_k_20260807.due;
    given('Khaled is still owed 1,550', stillDue === 1550, String(stillDue));
    const paid = apply(WORLD.full, F('planPayment', WORLD.full, 'ps_w_k_20260807', stillDue, { paymentId: 'pp_final0000001', date: '2026-08-27' }, stamp('2026-08-27')), 'the last payment');
    const answered = apply(paid, F('planLegacy', paid, 'w_a', '2026-08-07', { state: 'paid' }, stamp('2026-08-27')), 'the answer');
    same('paid in full, and answered for: both are settled, and the old closure\'s bundle now carries the answer',
        F('planHistoryMove', answered).bundles.map(bundle => [bundle.source, bundle.settled, bundle.paths.length]),
        [['statement', true, 9], ['legacy', true, 2]]);
    same('a record with no closure has nothing to move', (none => [none.bundles, none.totals.bytes, none.totals.freed])(F('planHistoryMove', WORLD.before)),
        [[], 0, 0]);
    console.log('        on this fixture: ' + JSON.stringify(said.totals));
}

// ================================================================ S5
{
    suite('S5: is the detail of a closure on this phone');

    const { live, closed } = splitOf(WORLD.full);
    same('while the entries are in the record: «record»', F('paybookDetail', WORLD.full, {}, 'ps_w_k_20260807').state, 'record');
    same('after they have left it, with the closed document on the phone: «fetched», and the entries are handed over',
        (found => [found.state, Object.keys(found.entries).length])(F('paybookDetail', live, closed, 'ps_w_k_20260807')), ['fetched', 8]);
    same('and without it: «absent» - the screen says so, and shows no day list rather than a live one',
        (found => [found.state, found.entries])(F('paybookDetail', live, {}, 'ps_w_k_20260807')), ['absent', null]);
    const damaged = clone(closed);
    damaged.ps_w_k_20260807.entries['pay.ps_w_k_20260807'].netDue = 'x';
    same('a closed document this build cannot read is not detail: «absent»', F('paybookDetail', live, damaged, 'ps_w_k_20260807').state, 'absent');
    const index = F('paybookIndexFrom', WORLD.full);
    same('the balances never depended on it: from the index alone, Khaled is owed 1,550 and Ahmad\'s closure is payment-unknown',
        (folds => [folds.wage.w_k.wageDue, folds.wage.w_a.paymentUnknown, folds.deducted[WORLD.k1], folds.deducted[WORLD.k2]])(F('paybookIndexFolds', index)),
        [1550, ['2026-08-07'], 500, 100]);
}

// ================================================================ S6
{
    suite('S6: CAPACITY - 20 men, 5 years, weighed the way Firestore weighs a document');

    // The method is Phase 2's (tests/paybook.store.test.mjs): every entry is produced by the
    // shipped writers on a real record; a year is those entries repeated under fresh ids in
    // a document of the size the app would hold; and the DOCUMENT is weighed. What is new:
    // the crew is the owner's figure (about 20 men, 2026-11-10), the horizon is five years,
    // advances are counted (they stay in the live document either way), and there is a
    // third way to hold a closure - the index row, with the entries in closed documents.
    //
    // ASSUMPTIONS, said: six days a week every week; one closure in four deducts an advance
    // and that advance was given in the same period; every closure has a statement and one
    // payment. The real document is about 185 KB today (the owner's backup file) - the curve
    // below starts from an empty record, and the last line adds that back.
    const MIB = 1024 * 1024;
    const utf8 = text => Buffer.byteLength(String(text), 'utf8');
    const firestoreSize = value => {
        if (value === null || typeof value === 'boolean') return 1;
        if (typeof value === 'number') return 8;
        if (typeof value === 'string') return utf8(value) + 1;
        if (Array.isArray(value)) return value.reduce((sum, item) => sum + firestoreSize(item), 0);
        return Object.keys(value).reduce((sum, key) => sum + utf8(key) + 1 + firestoreSize(value[key]), 0);
    };
    const documentSize = doc => utf8('schedules') + 1 + utf8('current') + 1 + 16 + firestoreSize(doc) + 32;

    // The templates: one real closed week and one real closed fortnight, each touching an advance.
    let T = record([KHALED, AHMAD]);
    [0, 2, 3, 4, 5, 6].forEach(n => { work(T, 'w_a', step(F1.from, n)); work(T, 'w_k', step(F1.from, n)); work(T, 'w_k', step(F1.from, n + 7)); });
    const a1 = advance(T, 'w_a', '2026-08-09', 500);
    const k1 = advance(T, 'w_k', '2026-08-09', 500);
    T = opened(T);
    const weekly = F('planClosure', T, 'w_a', { from: '2026-08-07', to: '2026-08-13' }, { allocations: { [a1]: 500 }, paid: 1300, paidOn: '2026-08-14', method: 'cash' }, stamp('2026-08-14'));
    const fortnightly = F('planClosure', T, 'w_k', F1, { allocations: { [k1]: 500 }, paid: 3700, paidOn: '2026-08-21', method: 'cash' }, stamp('2026-08-21'));
    const closedT = apply(apply(T, weekly, 'a weekly closure'), fortnightly, 'a fortnightly closure');
    const rows = F('paybookIndexFrom', closedT).rows;
    const kindOf = (changes, kind) => clone(changes.filter(change => change.value.kind === kind)[0].value);
    const TEMPLATE = {
        day: clone(T.days['2026-08-09'].actual.w_a),
        advance: clone(T.advances[a1]),
        given: clone(Object.values(T.ledger.advances).find(entry => entry.kind === 'given' && entry.advanceId === a1)),
        weekly: { artifact: kindOf(weekly.changes, 'closed'), deducted: kindOf(weekly.changes, 'deducted'),
            statement: kindOf(weekly.changes, 'statement'), payment: kindOf(weekly.changes, 'payment'), row: clone(rows.ps_w_a_20260807) },
        biweekly: { artifact: kindOf(fortnightly.changes, 'closed'), deducted: kindOf(fortnightly.changes, 'deducted'),
            statement: kindOf(fortnightly.changes, 'statement'), payment: kindOf(fortnightly.changes, 'payment'), row: clone(rows.ps_w_k_20260807) }
    };
    const bytes = value => utf8(JSON.stringify(value));
    const sizes = { workerDay: bytes(TEMPLATE.day), advance: bytes(TEMPLATE.advance), given: bytes(TEMPLATE.given) };
    ['weekly', 'biweekly'].forEach(cycle => Object.keys(TEMPLATE[cycle]).forEach(kind => { sizes[`${cycle}.${kind}`] = bytes(TEMPLATE[cycle][kind]); }));
    console.log('        one entry, JSON bytes: ' + JSON.stringify(sizes));
    const bundle = cycle => sizes[`${cycle}.artifact`] + sizes[`${cycle}.deducted`] + sizes[`${cycle}.statement`] + sizes[`${cycle}.payment`];
    check('an index row weighs less than a twelfth of the closure it stands for - week and fortnight',
        sizes['weekly.row'] * 12 < bundle('weekly') && sizes['biweekly.row'] * 12 < bundle('biweekly'),
        JSON.stringify([sizes['weekly.row'], bundle('weekly'), sizes['biweekly.row'], bundle('biweekly')]));

    const dayAfter = (date, n) => new Date(Date.parse(date + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
    // `closures`: false, or the cycle everybody is settled on. `how`: 'entries' - in the live
    // document, as the app writes a closure today plus the pay book - or 'index'.
    const build = (men, weeks, options) => {
        const doc = clone(F('emptySchedule'));
        doc.places = clone(T.places);
        doc.ledger = { advances: {}, unreadable: {}, migrations: clone(T.ledger.migrations || {}), unreadableMigrations: {} };
        doc.pay = options.closures ? { po_open: clone(closedT.pay.po_open) } : {};
        if (options.how === 'index') doc.payIndex = { v: 1, rows: {} };
        for (let m = 1; m <= men; m += 1) {
            doc.workers.push({ id: 'w_' + String(m).padStart(2, '0'), name: 'עובד מספר ' + m, idNumber: '',
                phone: '050-000-00' + String(m).padStart(2, '0'), dailyRate: 400, hourlyRate: 50,
                payCycles: options.closures === 'weekly' ? '2026-08-07=weekly' : '', active: true });
        }
        for (let week = 0; week < weeks; week += 1) {
            const friday = dayAfter('2026-08-07', week * 7);
            [0, 2, 3, 4, 5, 6].forEach(offset => {
                const date = dayAfter(friday, offset);
                doc.days[date] = { plan: {}, actual: {} };
                doc.workers.forEach(worker => { doc.days[date].actual[worker.id] = TEMPLATE.day; });
            });
            const closing = options.closures && !(options.closures === 'biweekly' && week % 2 === 1);
            const key = friday.replace(/-/g, '');
            doc.workers.forEach((worker, at) => {
                // One man in four takes an advance each fortnight - closed or not, it is on the record.
                const withAdvance = (at % 4) === 0 && week % 2 === 0;
                const advanceId = `a_${worker.id.slice(2)}${key}`;
                if (withAdvance) {
                    doc.advances[advanceId] = Object.assign({}, TEMPLATE.advance, { id: advanceId, workerId: worker.id });
                    doc.ledger.advances['le_given_' + advanceId] = Object.assign({}, TEMPLATE.given, { id: 'le_given_' + advanceId, advanceId, workerId: worker.id });
                }
                if (!closing) return;
                const made = TEMPLATE[options.closures];
                const statementId = `ps_${worker.id}_${key}`;
                if (options.how === 'index') {
                    doc.payIndex.rows[statementId] = Object.assign({}, made.row, { w: worker.id, a: withAdvance ? [[advanceId, 500, 0]] : [] });
                    return;
                }
                const artifactId = `le_period_${worker.id}_${key}`;
                doc.ledger.advances[artifactId] = Object.assign({}, made.artifact, { id: artifactId, workerId: worker.id });
                if (withAdvance) {
                    const entryId = `le_close_${advanceId}_${key}`;
                    doc.ledger.advances[entryId] = Object.assign({}, made.deducted, { id: entryId, advanceId, workerId: worker.id });
                }
                doc.pay[statementId] = Object.assign({}, made.statement, { id: statementId, workerId: worker.id, artifactId,
                    advanceDeductions: withAdvance ? made.statement.advanceDeductions : [] });
                doc.pay['pp_' + statementId] = Object.assign({}, made.payment, { id: 'pp_' + statementId, workerId: worker.id, statementId });
            });
        }
        return doc;
    };
    const weigh = (men, weeks, options) => {
        const doc = build(men, weeks, options);
        const wire = Object.assign(F('cloudDocument', doc), doc.payIndex ? { payIndex: doc.payIndex } : {});
        return { firestore: documentSize(wire), days: firestoreSize(doc.days), ledger: firestoreSize(doc.ledger),
            advances: firestoreSize(doc.advances), pay: firestoreSize(doc.pay), index: doc.payIndex ? firestoreSize(doc.payIndex) : 0 };
    };
    const SCENARIOS = [
        ['days and advances only - nobody ever closes', { closures: false }],
        ['closed every fortnight, IN the live document (as written today, with the pay book)', { closures: 'biweekly', how: 'entries' }],
        ['closed every week, IN the live document', { closures: 'weekly', how: 'entries' }],
        ['closed every fortnight, WITH THE SPLIT - an index row stays, the entries are closed documents', { closures: 'biweekly', how: 'index' }],
        ['closed every week, WITH THE SPLIT', { closures: 'weekly', how: 'index' }]
    ];
    const MEN = 20;
    const KB = n => (n / 1024).toFixed(0) + ' KB';
    const curve = {};
    SCENARIOS.forEach(([label, options]) => {
        const base = weigh(MEN, 0, options).firestore;
        const years = [1, 2, 3, 4, 5].map(year => weigh(MEN, 52 * year, options));
        const perWeek = (years[0].firestore - base) / 52;
        curve[label] = { base, years, perWeek, full: (MIB - base) / perWeek, fromToday: (MIB - 185 * 1024) / perWeek };
        console.log(`        ${label}:`);
        console.log('            ' + years.map((y, at) => `year ${at + 1}: ${KB(y.firestore)} (${(y.firestore / MIB * 100).toFixed(0)}%)`).join(' · '));
        console.log(`            after 5 years - days ${KB(years[4].days)}, advances and their ledger ${KB(years[4].advances + years[4].ledger)}`
            + `${years[4].pay > 200 ? ', pay book ' + KB(years[4].pay) : ''}${years[4].index ? ', index ' + KB(years[4].index) : ''};`
            + ` ${Math.round(perWeek)} B a week; full after ${(curve[label].full / 52).toFixed(1)} years from empty,`
            + ` ${(curve[label].fromToday / 52).toFixed(1)} years from today's 185 KB`);
    });
    const at = label => curve[SCENARIOS.filter(row => row[0].indexOf(label) === 0)[0][0]];

    check('IN the live document, 20 men closed every fortnight fill it inside a year from today; closed every week, inside eight months',
        at('closed every fortnight, IN').fromToday < 52 && at('closed every week, IN').fromToday < 35,
        JSON.stringify([at('closed every fortnight, IN').fromToday.toFixed(0), at('closed every week, IN').fromToday.toFixed(0)]));
    check('WITH THE SPLIT a week of closing weighs under a third of what it weighs in the live document - weekly and fortnightly',
        at('closed every week, WITH').perWeek * 3 < at('closed every week, IN').perWeek
        && at('closed every fortnight, WITH').perWeek * 2.9 < at('closed every fortnight, IN').perWeek,
        JSON.stringify([Math.round(at('closed every week, WITH').perWeek), Math.round(at('closed every week, IN').perWeek),
            Math.round(at('closed every fortnight, WITH').perWeek), Math.round(at('closed every fortnight, IN').perWeek)]));
    check('closing every fortnight then costs under a quarter more a week than never closing; every week, under a half',
        at('closed every fortnight, WITH').perWeek < at('days and advances').perWeek * 1.25
        && at('closed every week, WITH').perWeek < at('days and advances').perWeek * 1.5,
        JSON.stringify([Math.round(at('days and advances').perWeek), Math.round(at('closed every fortnight, WITH').perWeek), Math.round(at('closed every week, WITH').perWeek)]));
    // MEASURED, AND NOT WHAT WAS HOPED: one row per closure is itself not bounded. Five
    // years of rows for 20 men are 435 KB closed fortnightly and 851 KB closed weekly -
    // most of a document on their own. The row as designed (176 bytes of JSON) is the
    // index of the RECENT past; rows of settled closures older than some horizon have to
    // fold into one per-man checkpoint before the index can be called bounded. Pinned so
    // that nobody reads "with the split" as "solved".
    check('MEASURED: the index itself grows without bound - five years of rows are over 400 KB fortnightly and over 800 KB weekly',
        at('closed every fortnight, WITH').years[4].index > 400 * 1024 && at('closed every week, WITH').years[4].index > 800 * 1024,
        JSON.stringify([KB(at('closed every week, WITH').years[4].index), KB(at('closed every fortnight, WITH').years[4].index)]));
    // THE HONEST HALF. The split bounds what CLOSURES cost. It does not bound the document:
    // the days themselves fill it, and they are still in it.
    check('AND THE DOCUMENT IS STILL NOT BOUNDED: with the split, 20 men\'s DAYS alone fill it in under two and a half years from today',
        at('closed every fortnight, WITH').fromToday < 130 && at('days and advances').fromToday < 130
        && at('closed every fortnight, WITH').years[4].firestore > MIB,
        JSON.stringify([(at('days and advances').fromToday / 52).toFixed(1), (at('closed every fortnight, WITH').fromToday / 52).toFixed(1)]));
    check('so the writer stays shut in what is shipped', makeDevice().global('FARKAD_FLAGS').paybook === false);
}

report();
