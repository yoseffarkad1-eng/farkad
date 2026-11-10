// Worker accounts: closure, payment and the balances between them - the pure model.
//
//   node tests/payroll.test.mjs
//
// js/model/payroll.js is shipped SHUT since v173: every device in the harness loads it,
// and its writer is behind FARKAD_FLAGS.paybook, which is false in what a person installs.
// This suite is about the model with the writer OPEN, so every device here is built with
// the flag on through the test seam - the same thing a build with the gate open would do.
// (Until v173 the file was loaded by this suite alone, into a device that did not have it;
// that second load would now declare every const twice.) What the shut gate does is
// tests/paybook.store.test.mjs's business. Synthetic data only.
//
// PHASE 0 comes first and asserts nothing about the new file. It pins what the app does
// TODAY in the three places the owner called wrong or the audit found open, so that the
// phase which changes each of them has to move a named check and say why.
//
// PHASE 1 is the owner's list, case by case, at the level of the model:
//   the records      validators as strict as the ledger's, ids that cannot poison a map
//   weekly           the running account is the open week and nothing else - 2,000, never 3,800
//   biweekly         2,100 + 2,300 = 4,400; missing days; full and partial; advances over the wage
//   advances         the person's split, per advance; remaining exact; never twice; never a payment
//   extra deductions separate from advances in every fold, capped with the wage
//   payment          3,000 net, 2,000 paid, 1,000 owed, 600 later, 400 left; two balances, never netted
//   group            one independent plan per man; resume; one refuses; a retry skips the done
//   two devices      one id for one fact; a disagreement is reported, never chosen between
//   purity           no input mutated, the same answer twice, every refusal a stable code
//   migration        a report that writes nothing
//   agreement        with no `pay` records at all, nothing here contradicts what the app already says

import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeDevice, sourceRoot, loadOrder } from './harness.mjs';
import { suite, check, same, given, report } from './runner.mjs';

const PAYROLL = readFileSync(join(sourceRoot(), 'js/model/payroll.js'), 'utf8');

// 2026-10-02 is a Friday and opens a fortnight (ACCOUNT_ANCHOR + 56 days).
const W1 = ['2026-10-02', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08'];
const W2 = ['2026-10-09', '2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15'];
const WEEK1 = { from: '2026-10-02', to: '2026-10-08' };
const WEEK2 = { from: '2026-10-09', to: '2026-10-15' };
const FORTNIGHT = { from: '2026-10-02', to: '2026-10-15' };
const OPENING = '2026-10-02';

const clone = value => JSON.parse(JSON.stringify(value));
const stamp = (today, by = 'd_boss', hour = '10') => ({ at: `${today}T${hour}:00:00.000Z`, by, today });

let devices = 0;
function device(options = {}) {
    devices += 1;
    return makeDevice(Object.assign({ deviceId: `d_pay${devices}` }, options,
        { flags: Object.assign({ paybook: true }, options.flags || {}) }));
}

// The crew, recorded through the app's own doors: the roster by commitRoster, every day
// by State.commit, every advance by recordNewAdvance + commitMany - so the schedule the
// model is handed is one the shipped journal produced, not one this file imagined.
//
//   AHMAD   weekly     300 a day, 50 an hour   week 1 = 1,800   week 2 = 1,800 + 4h = 2,000
//   KHALED  biweekly   350 a day, 50 an hour   2,100 + 2,300 = 4,400
//   NASSER  biweekly   500 a day               week 1 only = 3,000
//   SALIM   biweekly   400 a day               9 days = 3,600, and away on the 13th
function world(options = {}) {
    const d = device(options.device || {});
    d.setToday(options.today || '2026-10-16');
    const S = d.State.schedule;
    S.workers = [
        { id: 'w_ahmad', name: 'אחמד', active: true, dailyRate: 300, hourlyRate: 50,
            payCycles: '2026-09-11=weekly' },
        { id: 'w_khaled', name: 'חאלד', active: true, dailyRate: 350, hourlyRate: 50 },
        { id: 'w_nasser', name: 'נאסר', active: true, dailyRate: 500, hourlyRate: 0 },
        { id: 'w_salim', name: 'סלים', active: true, dailyRate: 400, hourlyRate: 0 }
    ].concat(options.workers || []);
    S.places = [{ id: 'p_a', name: 'אילון', active: true }, { id: 'p_b', name: 'גבעתיים', active: true }];
    given('the roster is committed', d.State.commitRoster() === true);
    const put = (worker, day, place, hours) => {
        const change = d.call('assignPlace', d.State.schedule, day, worker, 'actual', place, undefined, hours);
        given(`a day is recorded (${worker} ${day})`, d.State.commit(change) === true);
    };
    W1.forEach(day => ['w_ahmad', 'w_khaled', 'w_nasser', 'w_salim'].forEach(w => put(w, day, 'p_a', 0)));
    W2.forEach((day, at) => {
        put('w_ahmad', day, at < 3 ? 'p_a' : 'p_b', at === 0 ? 4 : 0);
        put('w_khaled', day, 'p_a', at === 0 ? 4 : 0);
        if (at < 3) put('w_salim', day, 'p_b', 0);
    });
    given('an absence is recorded', d.State.commit(
        d.call('markAbsent', d.State.schedule, '2026-10-13', 'w_salim', 'actual')) === true);
    (options.days || []).forEach(([worker, day, hours]) => put(worker, day, 'p_a', hours || 0));
    (options.advances || []).forEach(([worker, date, amount]) => {
        const made = d.call('recordNewAdvance', d.State.schedule, worker, date, amount, 'בדיקה',
            `${date}T09:00:00.000Z`, d.id, 'cash');
        given(`an advance is recorded (${worker} ${amount})`, d.State.commitMany(made) === true);
    });
    // The carry approval the owner gives once (v116), given here up front. Without it the
    // financial gate shuts on any record where a deduction differs from the advance given
    // in that fortnight - which is every partial deduction; see the Phase 0 pin.
    if (options.approveCarry !== false) {
        const approval = d.call('recordCarryApproval', d.State.schedule,
            d.call('planCarryMigration', d.State.schedule), '2026-10-01T08:00:00.000Z', d.id);
        given('the carry is approved', d.State.commitMany([approval]) === true);
    }
    given('the financial gate is open on this record',
        d.call('financialWritingEnabled', d.State.schedule) === true);
    return d;
}

// One device does every pure call below: the model takes the schedule as an argument, so
// which phone computes is irrelevant - and the two-device section proves exactly that.
const calc = device();
const F = (name, ...args) => calc.call(name, ...args);

const applied = (S, plan, what) => {
    given(`${what || 'a plan'} is allowed`, plan.ok === true && plan.changes.length > 0,
        JSON.stringify(plan.reasons));
    const done = F('paybookApply', S, plan.changes);
    given(`${what || 'a plan'} lands whole`, done.refused.length === 0 && done.conflicts.length === 0,
        JSON.stringify([done.refused, done.conflicts]));
    return done.schedule;
};
const opened = (d, date = OPENING) => applied(clone(d.State.schedule),
    F('planOpening', clone(d.State.schedule), date, stamp('2026-10-09')), 'the opening');
const advancesOf = (S, worker) => {
    const all = F('currentAdvances', S);
    return Object.keys(all).filter(id => all[id].workerId === worker)
        .sort((a, b) => (all[a].date < all[b].date ? -1 : (all[a].date > all[b].date ? 1 : (a < b ? -1 : 1))));
};
const leftOf = (S, id) => F('advanceOutstanding', S, id).left;
const rowOf = (S, from, to, worker) => F('payrollReport', S, from, to).find(row => row.workerId === worker);
const without = (record, fields) => {
    const out = clone(record);
    fields.forEach(field => { delete out[field]; });
    return out;
};

// =====================================================================================
// PHASE 0 - what the app does today, pinned so that changing it is deliberate
// =====================================================================================
{
    suite('PHASE 0: today\'s behaviour, pinned before anything changes it');

    const d = world({ today: '2026-10-12', advances: [['w_khaled', '2026-10-03', 500],
        ['w_khaled', '2026-10-06', 400], ['w_khaled', '2026-10-10', 300], ['w_ahmad', '2026-10-03', 500]] });
    const S = d.State.schedule;

    same('the weekly man\'s week 1 is 1,800 and his week 2 is 2,000',
        [rowOf(S, WEEK1.from, WEEK1.to, 'w_ahmad').amount, rowOf(S, WEEK2.from, WEEK2.to, 'w_ahmad').amount],
        [1800, 2000]);

    // Close his week 1 the way the one button in the app does: closePeriodChanges, then
    // one journal batch.
    const closing = d.call('closePeriodChanges', S, 'w_ahmad', WEEK1.from, WEEK1.to,
        '2026-10-09T08:00:00.000Z', d.id, 0);
    given('week 1 closes through the existing writer', d.State.commitMany(closing) === true);

    // THE PRESENT BEHAVIOUR THE OWNER CALLED WRONG. A man settled every Thursday, week 1
    // closed, week 2 open: his running account is 2,000. The pay report opened on the
    // fortnight - which is the reports tab's default range - still adds the closed week
    // back in. This check asserts the CURRENT value. It is not a guarantee: default (1) in
    // PAYBOOK_RULES leaves the «לפי עובד» sheet alone in this phase, and the phase that
    // builds the accounts list (Phase 2 in docs/payroll-closure.md) is where the owner
    // decides whether this sheet follows. When it does, this number moves, here, on purpose.
    same('TODAY: the fortnight pay report shows 3,800 for the weekly man whose week 1 is closed',
        [rowOf(S, FORTNIGHT.from, FORTNIGHT.to, 'w_ahmad').amount,
            rowOf(S, FORTNIGHT.from, FORTNIGHT.to, 'w_ahmad').attendanceDays], [3800, 12]);
    same('and his closed week on its own still reads its frozen 1,800',
        rowOf(S, WEEK1.from, WEEK1.to, 'w_ahmad').amount, 1800);

    // THE HOLE THE AUDIT MEASURED. The existing planner lets a FORTNIGHT be closed for the
    // weekly man over the week that is already closed, because the two open on one Friday
    // and overlappingClosures takes that to mean they are one period. The screen cannot
    // reach it; a second phone or an import can. Pinned as it is: js/model/ledger.js is
    // not changed in this phase, and the new planner refuses the same request (below).
    const hole = d.call('planPeriodClosure', S, 'w_ahmad', FORTNIGHT.from, FORTNIGHT.to,
        '2026-10-16T08:00:00.000Z', 300);
    same('TODAY: the existing planner would close a fortnight over the weekly man\'s closed week',
        [hole.canClose, hole.reasons, hole.gross], [true, [], 3800]);
    same('although that fortnight is not a period he is settled on',
        d.call('isPeriodFor', d.State.worker('w_ahmad'), FORTNIGHT.from, FORTNIGHT.to), false);

    // WHO CHOOSES THE SPLIT TODAY: the person names one total and the app spends it oldest
    // advance first. 700 against 500 / 400 / 300 is 500 + 200 + nothing.
    const split = d.call('planPeriodClosure', S, 'w_khaled', FORTNIGHT.from, FORTNIGHT.to,
        '2026-10-16T08:00:00.000Z', 700);
    same('TODAY: one chosen total of 700 is split by the app, oldest first',
        split.rows.map(row => [row.amount, row.balanceAfter]), [[500, 0], [200, 200]]);

    // AND NOTHING ANYWHERE SAYS "PAID". No entry kind, and nothing in the pay book.
    //
    // MOVED AT v173, deliberately: this read `S.pay === undefined`. The record now carries
    // the map (emptySchedule names it, so that normaliseSchedule keeps what another phone
    // wrote), so the fact being pinned is spelled as what it always meant - the existing
    // closure writes nothing into it. An empty map is still "no notion of a payment".
    const kinds = Object.values(S.ledger.advances).map(entry => entry.kind);
    check('TODAY: the existing closure records no payment - it says what was deducted and no more',
        kinds.every(kind => ['given', 'closed', 'deducted', 'repaid', 'reversed', 'corrected', 'cancelled'].includes(kind))
        && JSON.stringify(S.pay) === '{}', JSON.stringify([[...new Set(kinds)], S.pay]));

    // AN ADVANCE WHOSE OWN PERIOD WAS NEVER CLOSED: two folds, two answers. Found while
    // building the planner, on unchanged code. advanceOutstanding says 500 is still owed -
    // nothing was ever recorded against it. The account walk has already counted it as
    // taken from the wage of the fortnight it was given in, so nothing carries, and the
    // existing dialog refuses to deduct any of it later.
    const old = world({ today: '2026-10-16', days: [['w_khaled', '2026-09-20'], ['w_khaled', '2026-09-21']],
        advances: [['w_khaled', '2026-09-20', 500]] });
    const oldId = advancesOf(old.State.schedule, 'w_khaled')[0];
    const later = old.call('planPeriodClosure', old.State.schedule, 'w_khaled', FORTNIGHT.from, FORTNIGHT.to,
        '2026-10-16T08:00:00.000Z', 300);
    same('TODAY: 500 from a fortnight nobody closed is "500 left" to one fold and "nothing carried" to the other',
        [leftOf(old.State.schedule, oldId), old.call('advanceCarryInto', old.State.schedule, 'w_khaled', FORTNIGHT.from)],
        [500, 0]);
    check('TODAY: and the existing closure refuses to deduct it from a later wage',
        later.canClose === false && later.reasons.includes('deduction'), JSON.stringify(later.reasons));

    // A PARTIAL DEDUCTION SHUTS THE FINANCIAL GATE ON A RECORD NOBODY APPROVED THE CARRY ON.
    // Also found on unchanged code. planAdvanceCarry lists every fortnight whose deduction
    // is not the advance given in it; a chosen deduction of 200 against 500 is such a row,
    // so the carry "migration" becomes needed AFTER the closure, and until cm_carry is
    // approved financialWritingEnabled answers false - for every financial control. A
    // record that was approved once stays approved; this is what the first partial closure
    // does on one that never was. Every fixture below approves up front for that reason.
    const bare = world({ approveCarry: false, advances: [['w_khaled', '2026-10-03', 500]] });
    const gateBefore = bare.call('financialWritingEnabled', bare.State.schedule);
    given('a partial closure is written the existing way', bare.State.commitMany(bare.call('closePeriodChanges',
        bare.State.schedule, 'w_khaled', FORTNIGHT.from, FORTNIGHT.to, '2026-10-16T08:00:00.000Z', bare.id, 200)) === true);
    same('TODAY: a partial deduction on a record with no carry approval shuts the financial gate behind it',
        [gateBefore, bare.call('financialWritingEnabled', bare.State.schedule),
            bare.call('planCarryMigration', bare.State.schedule).rows.length], [true, false, 1]);
}

// =====================================================================================
// PHASE 1
// =====================================================================================

// ---------------------------------------------------------------- the records
{
    suite('the records: only what this build could have written is an entry');

    const d = world({ advances: [['w_khaled', '2026-10-03', 500]] });
    const S0 = opened(d);
    const adv = advancesOf(S0, 'w_khaled')[0];
    const plan = F('planClosure', S0, 'w_khaled', FORTNIGHT, {
        allocations: { [adv]: 200 },
        extras: [{ amount: 150, category: 'agreed', reason: 'ציוד' }],
        paid: 1000, method: 'cash'
    }, stamp('2026-10-16'));
    const S1 = applied(S0, plan, 'a closure');
    const pay = S1.pay;

    same('a closure writes the artifact, the per-advance deduction, the extra, the statement and the payment, in that order',
        plan.changes.map(change => change.path), [
            'ledger.advances.le_period_w_khaled_20261002',
            `ledger.advances.le_close_${adv}_20261002`,
            'pay.pd_w_khaled_20261002_1',
            'pay.ps_w_khaled_20261002',
            'pay.pp_ps_w_khaled_20261002'
        ]);
    check('every entry the planners write is read back clean by the validator',
        Object.keys(pay).every(id => F('payEntryProblems', id, pay[id]).length === 0),
        JSON.stringify(Object.keys(pay).map(id => F('payEntryProblems', id, pay[id]))));
    same('the kinds on the record', Object.keys(pay).sort().map(id => pay[id].kind),
        ['deduction', 'opening', 'payment', 'statement']);

    const statement = pay.ps_w_khaled_20261002;
    const payment = pay.pp_ps_w_khaled_20261002;
    const extra = pay.pd_w_khaled_20261002_1;
    const refused = (id, value) => F('payEntryProblems', id, value);
    const bad = (name, id, value) => check(name, refused(id, value).length > 0, JSON.stringify(refused(id, value)));

    bad('null is refused: an entry is never deleted', statement.id, null);
    bad('a list is not an entry', statement.id, [statement]);
    bad('an id that does not match its path is refused', 'ps_w_khaled_20261009', statement);
    bad('a kind nobody wrote is refused', payment.id, Object.assign({}, payment, { kind: 'bonus' }));
    bad('a field nobody wrote is refused', payment.id, Object.assign({}, payment, { paidInFull: true }));
    bad('an entry with no moment is refused', payment.id, without(payment, ['at']));
    bad('an entry with no signer is refused', payment.id, Object.assign({}, payment, { by: '' }));
    bad('an entry on a day that never happened is refused', payment.id, Object.assign({}, payment, { date: '2026-02-30' }));

    // The poison names. An id of `__proto__` does not store a value in a plain object - it
    // re-parents the map, and the entry is then in no map anybody reads.
    ['__proto__', 'constructor', 'prototype', 'pp_a.b', 'pp_a/b', 'pp_[x]', ' pp_abcdef', ''].forEach(id => {
        bad(`an entry under the id ${JSON.stringify(id)} is refused`, id, Object.assign({}, payment, { id }));
    });
    bad('a payment to a man named __proto__ is refused', payment.id, Object.assign({}, payment, { workerId: '__proto__' }));
    bad('a payment under an id nobody could have minted is refused', 'pp_x',
        Object.assign({}, payment, { id: 'pp_x' }));
    bad('a payment against another man\'s statement is refused', payment.id,
        Object.assign({}, payment, { statementId: 'ps_w_nasser_20261002' }));

    // Money is a finite, non-negative number of whole agorot, and nothing is coerced.
    [NaN, Infinity, -1, 0, '500', null, 0.001, 33.333, 10000000.01].forEach(amount => {
        bad(`a payment of ${JSON.stringify(amount)} is refused`, payment.id, Object.assign({}, payment, { amount }));
    });
    check('a payment of 0.29 is accepted - 0.29 * 100 is 28.999999999999996 and is still an agora',
        refused(payment.id, Object.assign({}, payment, { amount: 0.29 })).length === 0);
    bad('a payment by a method nobody wrote is refused', payment.id, Object.assign({}, payment, { method: 'bit' }));
    check('a payment that names no method is accepted, and none is invented for it',
        refused(payment.id, without(payment, ['method'])).length === 0);

    bad('an extra deduction with no reason is refused', extra.id, Object.assign({}, extra, { reason: '   ' }));
    bad('an extra deduction of a category nobody wrote is refused', extra.id, Object.assign({}, extra, { category: 'fine' }));
    bad('an extra deduction whose id is not its statement\'s is refused', 'pd_w_khaled_20261009_1',
        Object.assign({}, extra, { id: 'pd_w_khaled_20261009_1' }));

    // The statement has to add up on its own.
    bad('a statement whose net is not its wage less its deductions is refused', statement.id,
        Object.assign({}, statement, { netDue: statement.netDue + 1 }));
    bad('a statement whose advance deductions do not add up is refused', statement.id,
        Object.assign({}, statement, { advanceDeducted: 300, netDue: statement.netDue - 100 }));
    bad('a statement deducting from ONE advance twice is refused', statement.id,
        Object.assign({}, statement, {
            advanceDeductions: [statement.advanceDeductions[0], statement.advanceDeductions[0]],
            advanceDeducted: 400, netDue: statement.netDue - 200 }));
    bad('a statement whose deduction does not leave what it says is refused', statement.id,
        Object.assign({}, statement, { advanceDeductions: [Object.assign({}, statement.advanceDeductions[0], { after: 250 })] }));
    bad('a statement over a hand-picked window is refused', 'ps_w_khaled_20261003',
        Object.assign({}, statement, { id: 'ps_w_khaled_20261003', periodFrom: '2026-10-03',
            artifactId: 'le_period_w_khaled_20261003' }));
    bad('a statement leaving a wage below zero is refused', statement.id,
        Object.assign({}, statement, { extraDeducted: 9000, netDue: statement.gross - 200 - 9000 }));
    bad('a statement naming another period\'s closure is refused', statement.id,
        Object.assign({}, statement, { artifactId: 'le_period_w_khaled_20261016' }));

    const voided = F('planVoid', S1, extra.id, { reason: 'נרשם בטעות' }, stamp('2026-10-17'));
    const adjusted = F('planAdjustment', S1, statement.id, 350, { reason: 'יום שנשכח' }, stamp('2026-10-17'));
    given('a void and an adjustment can be planned', voided.ok && adjusted.ok,
        JSON.stringify([voided.reasons, adjusted.reasons]));
    same('a void is named after what it voids, an adjustment after its statement',
        [voided.changes[0].path, adjusted.changes[0].path],
        ['pay.pv_pd_w_khaled_20261002_1', 'pay.pa_ps_w_khaled_20261002_1']);
    bad('a void with no reason is refused', voided.changes[0].value.id,
        Object.assign({}, voided.changes[0].value, { reason: '' }));
    bad('a void whose target is not the kind it says is refused', voided.changes[0].value.id,
        Object.assign({}, voided.changes[0].value, { targetKind: 'payment' }));
    bad('an adjustment of nothing is refused', adjusted.changes[0].value.id,
        Object.assign({}, adjusted.changes[0].value, { delta: 0 }));
    bad('an adjustment with no reason is refused', adjusted.changes[0].value.id,
        without(adjusted.changes[0].value, ['reason']));
    bad('an opening under any other name is refused', 'po_second',
        Object.assign({}, pay.po_open, { id: 'po_second' }));

    // AND THE FOLD HOLDS WHAT IT CANNOT READ - it neither drops it nor counts it.
    const dirty = clone(S1);
    dirty.pay.pp_zzzzzzzz = Object.assign({}, payment, { id: 'pp_zzzzzzzz', amount: -500 });
    dirty.pay.pp_orphan01 = Object.assign({}, payment, { id: 'pp_orphan01', statementId: 'ps_w_khaled_20261016' });
    const fold = F('paybookFold', dirty);
    same('a malformed payment and a payment whose statement is not there are both held, by id',
        fold.held.map(row => row.id).sort(), ['pp_orphan01', 'pp_zzzzzzzz']);
    same('and neither moves what he is owed', fold.statements[statement.id].due,
        F('paybookFold', S1).statements[statement.id].due);
    same('the account says something of his needs looking at',
        F('accountFor', dirty, 'w_khaled', '2026-10-16').status, 'review');

    // A statement is judged against the record it claims to describe.
    const forged = clone(S1);
    forged.ledger.advances.le_period_w_khaled_20261002.gross = 4000;
    check('a statement whose wage is not the wage its closure froze is held, not folded',
        F('paybookFold', forged).held.some(row => row.id === statement.id)
        && F('paybookFold', forged).statements[statement.id] === undefined);

    same('the five owner-given status labels, word for word', F('paybookClone', calc.global('PAYBOOK_STATUS_LABELS')),
        { waiting: 'ממתין לסגירה', closed: 'נסגר', paid: 'שולם', partial: 'שולם חלקית', open: 'יתרה פתוחה' });
    same('the eight defaults, each one constant', F('paybookClone', calc.global('PAYBOOK_RULES')), {
        legacyReportFollowsAccounts: false, earlierUnclosedSummed: false, closeWithNothingPaid: true,
        closeBeforeLastDay: false, deductionsMayExceedWage: false, offerLaterDatedAdvances: false,
        trackingFromActivationPeriod: true, whoMayClose: null, unlistedAdvanceMeansZero: false });
}

// ---------------------------------------------------------------- the weekly worker
{
    suite('weekly worker: his running account is his open week and nothing else');

    const d = world({ today: '2026-10-12' });
    const S0 = opened(d);

    // Week 1 unclosed, the day is in week 2.
    const before = F('accountFor', S0, 'w_ahmad', '2026-10-12');
    same('he is a weekly worker and his current period is his own week',
        [before.cycle, before.current.from, before.current.to], ['weekly', WEEK2.from, WEEK2.to]);
    same('week 1 unclosed: the running account is week 2 alone', before.running, 2000);
    same('week 1 unclosed: it is listed apart, with its own amount, waiting to be closed',
        before.pending.map(wage => [wage.from, wage.to, wage.gross]), [[WEEK1.from, WEEK1.to, 1800]]);
    same('and the status says so', before.status, 'waiting');
    check('3,800 appears nowhere in his account', !JSON.stringify(before).includes('3800'));

    // Week 1 closed, nothing paid yet.
    const close1 = F('planClosure', S0, 'w_ahmad', WEEK1, {}, stamp('2026-10-12'));
    same('week 1 closes on 1,800, six days on one site',
        [close1.ok, close1.review.gross, close1.review.netDue, close1.review.counts.attendanceDays,
            close1.review.sites.map(site => [site.placeId, site.name, site.days])],
        [true, 1800, 1800, 6, [['p_a', 'אילון', 6]]]);
    const S1 = applied(S0, close1, 'week 1');
    const after = F('accountFor', S1, 'w_ahmad', '2026-10-12');
    same('week 1 closed, week 2 open: the running account is 2,000 - never 3,800', after.running, 2000);
    same('the closed week is no longer waiting', after.pending, []);
    same('its wage went to «יתרת שכר לתשלום» - its own balance, not the current days',
        [after.wageDue, after.unpaid.map(row => [row.periodFrom, row.due, row.status])],
        [1800, [[WEEK1.from, 1800, 'closed']]]);
    same('while the existing fortnight report still adds the two (Phase 0)',
        rowOf(S1, FORTNIGHT.from, FORTNIGHT.to, 'w_ahmad').amount, 3800);

    // A fortnight-wide list: every man by HIS cycle.
    const list = F('accountsList', S1, '2026-10-12', { cycle: 'all' });
    same('a fortnight-wide list shows the weekly man his week and the others their fortnight',
        list.rows.map(row => [row.workerId, row.cycle, row.current.from, row.current.to, row.running]), [
            ['w_ahmad', 'weekly', WEEK2.from, WEEK2.to, 2000],
            ['w_khaled', 'biweekly', FORTNIGHT.from, FORTNIGHT.to, 4400],
            ['w_nasser', 'biweekly', FORTNIGHT.from, FORTNIGHT.to, 3000],
            ['w_salim', 'biweekly', FORTNIGHT.from, FORTNIGHT.to, 3600]
        ]);
    same('its totals are three separate figures', list.totals, { running: 13000, wageDue: 1800, debt: 0 });
    same('filtered to weekly workers', F('accountsList', S1, '2026-10-12', { cycle: 'weekly' }).rows.map(row => row.workerId), ['w_ahmad']);
    same('filtered to biweekly workers', F('accountsList', S1, '2026-10-12', { cycle: 'biweekly' }).rows.map(row => row.workerId),
        ['w_khaled', 'w_nasser', 'w_salim']);

    // A fortnight is not his period, closed week or not.
    const wide = F('planClosure', S1, 'w_ahmad', FORTNIGHT, {}, stamp('2026-10-16'));
    check('a fortnight over his closed week is refused: not his period, and it overlaps a closed one',
        wide.ok === false && wide.reasons.includes('period') && wide.reasons.includes('overlap')
        && wide.changes.length === 0, JSON.stringify(wide.reasons));
    const wideOpen = F('planClosure', S0, 'w_ahmad', FORTNIGHT, {}, stamp('2026-10-16'));
    check('and with nothing closed it is still refused: a weekly man has no fortnight',
        wideOpen.ok === false && wideOpen.reasons.includes('period'), JSON.stringify(wideOpen.reasons));

    // Week 1 is never recounted: the next Friday, week 2 is the one waiting.
    const friday = F('accountFor', S1, 'w_ahmad', '2026-10-16');
    same('the next Friday: a new week with nothing in it, week 2 waiting, week 1 not back',
        [friday.current.from, friday.running, friday.pending.map(wage => [wage.from, wage.gross]), friday.wageDue],
        ['2026-10-16', 0, [[WEEK2.from, 2000]], 1800]);
    const close2 = F('planClosure', S1, 'w_ahmad', WEEK2, { paid: 2000 }, stamp('2026-10-16'));
    same('closing week 2 shows the old unpaid wage beside it, added to nothing',
        [close2.ok, close2.review.gross, close2.review.netDue, close2.review.wageDueBefore,
            close2.review.balanceAfter, close2.review.wageDueAfter],
        [true, 2000, 2000, 1800, 0, 1800]);
    const S2 = applied(S1, close2, 'week 2');
    const settled = F('accountFor', S2, 'w_ahmad', '2026-10-16');
    same('both weeks closed: nothing running, nothing waiting, and the 1,800 from week 1 still his',
        [settled.running, settled.pending, settled.wageDue, settled.status], [0, [], 1800, 'open']);
    same('each closed week kept its own figure', F('closureHistory', S2, { workerId: 'w_ahmad' })
        .map(row => [row.periodFrom, row.gross, row.netDue, row.paid, row.due, row.status]),
    [[WEEK2.from, 2000, 2000, 2000, 0, 'paid'], [WEEK1.from, 1800, 1800, 0, 1800, 'closed']]);

    // Not before its last day.
    const early = F('planClosure', S0, 'w_ahmad', WEEK2, {}, stamp('2026-10-14'));
    check('a week is not closed before its last day', early.ok === false && early.reasons.includes('early'),
        JSON.stringify(early.reasons));
    same('and it is closable on that last day', F('planClosure', S0, 'w_ahmad', WEEK2, {}, stamp('2026-10-15')).ok, true);

    // A man who moves from weekly back to fortnightly on the second Friday: the week
    // behind him stays a week, and the days after the change are a short period of their
    // own - neither is folded into the other.
    const moving = clone(S1);
    moving.workers.find(worker => worker.id === 'w_ahmad').payCycles = '2026-09-11=weekly;2026-10-09=biweekly';
    const stub = F('accountFor', moving, 'w_ahmad', '2026-10-12');
    same('a cycle change mid-fortnight: his current period is the cut one, and the closed week stays closed',
        [stub.cycle, stub.current.from, stub.current.to, stub.current.transition, stub.running, stub.pending, stub.wageDue],
        ['biweekly', WEEK2.from, WEEK2.to, true, 2000, [], 1800]);
    const cut = F('planClosure', moving, 'w_ahmad', WEEK2, {}, stamp('2026-10-16'));
    same('and that cut period closes as what it is', [cut.ok, cut.review.cycle, cut.review.transition, cut.review.gross,
        cut.changes[cut.changes.length - 1].value.transition], [true, 'biweekly', true, 2000, true]);
}

// ---------------------------------------------------------------- the biweekly worker
{
    suite('biweekly worker: his fortnight, whole');

    const d = world({ advances: [['w_salim', '2026-10-03', 5000]] });
    const S0 = opened(d);

    const khaled = F('accountFor', S0, 'w_khaled', '2026-10-15');
    same('two full weeks: 2,100 + 2,300 is one running account of 4,400',
        [rowOf(S0, WEEK1.from, WEEK1.to, 'w_khaled').amount, rowOf(S0, WEEK2.from, WEEK2.to, 'w_khaled').amount,
            khaled.cycle, khaled.current.from, khaled.current.to, khaled.running, khaled.pending],
        [2100, 2300, 'biweekly', FORTNIGHT.from, FORTNIGHT.to, 4400, []]);

    const salim = F('accountFor', S0, 'w_salim', '2026-10-15');
    same('missing days: nine days worked and one away is 3,600, and the absence is counted as one',
        [salim.running, salim.current.attendanceDays, salim.current.absent], [3600, 9, 1]);

    // Full closure, paid in full.
    const full = F('planClosure', S0, 'w_khaled', FORTNIGHT, { paid: 4400 }, stamp('2026-10-16'));
    same('the review page: days, sites, regular and double days, extra hours, wage',
        [full.review.days.length, full.review.sites.map(site => [site.placeId, site.days]),
            full.review.counts.normalDays, full.review.counts.doubleDays, full.review.counts.extraHours,
            full.review.gross, full.review.netDue, full.review.paid, full.review.balanceAfter],
        [12, [['p_a', 12]], 12, 0, 4, 4400, 4400, 4400, 0]);
    const S1 = applied(S0, full, 'a full closure');
    const paid = F('accountFor', S1, 'w_khaled', '2026-10-16');
    same('full closure, paid in full: nothing running, nothing owed either way, status paid',
        [paid.running, paid.wageDue, paid.debt, paid.status], [0, 0, 0, 'paid']);

    // Closure with a partial payment.
    const part = F('planClosure', S0, 'w_khaled', FORTNIGHT, { paid: 3000 }, stamp('2026-10-16'));
    const S2 = applied(S0, part, 'a partly paid closure');
    const partial = F('accountFor', S2, 'w_khaled', '2026-10-16');
    same('closure with a partial payment: 4,400 net, 3,000 paid, 1,400 still his',
        [part.review.balanceAfter, partial.wageDue, partial.status, partial.running], [1400, 1400, 'partial', 0]);

    // Advances larger than the wage.
    const adv = advancesOf(S0, 'w_salim')[0];
    const all = F('planClosure', S0, 'w_salim', FORTNIGHT, { allocations: { [adv]: 3600 } }, stamp('2026-10-16'));
    same('advances larger than the wage: the whole wage may go, the net is zero, 1,400 of debt remains',
        [all.ok, all.review.gross, all.review.advanceDeducted, all.review.netDue, all.review.debtAfter],
        [true, 3600, 3600, 0, 1400]);
    const over = F('planClosure', S0, 'w_salim', FORTNIGHT, { allocations: { [adv]: 3600.01 } }, stamp('2026-10-16'));
    check('one agora more than the wage is refused', over.ok === false && over.reasons.includes('over-wage')
        && over.changes.length === 0, JSON.stringify(over.reasons));
    const S3 = applied(S0, all, 'a closure that takes the whole wage');
    const owing = F('accountFor', S3, 'w_salim', '2026-10-16');
    same('closure never erases debt: 1,400 is still on the advance and opens the next account',
        [leftOf(S3, adv), F('advanceCarryInto', S3, 'w_salim', '2026-10-16'), owing.debt, owing.wageDue, owing.status],
        [1400, 1400, 1400, 0, 'open']);
    same('and the existing judges agree the closure is true', F('impossibleClosures', S3), []);
}

// ---------------------------------------------------------------- advances
{
    suite('advances: the person chooses, per advance');

    const d = world({ advances: [['w_khaled', '2026-10-03', 500], ['w_khaled', '2026-10-06', 400],
        ['w_khaled', '2026-10-10', 300], ['w_ahmad', '2026-10-03', 500], ['w_nasser', '2026-10-05', 800]] });
    const S0 = opened(d);
    const [k1, k2, k3] = advancesOf(S0, 'w_khaled');
    const a1 = advancesOf(S0, 'w_ahmad')[0];

    // One advance, in two bites: partial, then full.
    const bite1 = F('planClosure', S0, 'w_ahmad', WEEK1, { allocations: { [a1]: 200 } }, stamp('2026-10-12'));
    same('one advance, PARTIAL: 200 of 500 comes off week 1, 300 remains',
        [bite1.ok, bite1.review.advances.map(row => [row.left, row.chosen, row.after]), bite1.review.netDue],
        [true, [[500, 200, 300]], 1600]);
    const A1 = applied(S0, bite1, 'week 1 with 200 off');
    same('and 300 is what the one fold says is left', leftOf(A1, a1), 300);
    const bite2 = F('planClosure', A1, 'w_ahmad', WEEK2, { allocations: { [a1]: 300 } }, stamp('2026-10-16'));
    const A2 = applied(A1, bite2, 'week 2 with the rest off');
    same('one advance, FULL: the remaining 300 comes off week 2 and nothing is left',
        [bite2.review.advances.map(row => [row.left, row.chosen, row.after]), bite2.review.netDue, leftOf(A2, a1),
            F('accountFor', A2, 'w_ahmad', '2026-10-16').debt], [[[300, 300, 0]], 1700, 0, 0]);
    same('the advance itself was never rewritten: same id, same date, same amount, its history only grew',
        [A2.advances[a1].date, A2.advances[a1].amount, F('advanceHistory', A2, a1).map(entry => entry.kind)],
        ['2026-10-03', 500, ['given', 'deducted', 'deducted']]);

    // Several: 500 / 400 / 300, 700 chosen across them, NOT oldest first.
    const choice = { [k1]: 100, [k2]: 300, [k3]: 300 };
    const plan = F('planClosure', S0, 'w_khaled', FORTNIGHT, { allocations: choice }, stamp('2026-10-16'));
    same('several advances: 700 chosen as 100 / 300 / 300 - the person\'s split, not oldest first',
        [plan.ok, plan.review.advances.map(row => [row.given, row.left, row.chosen, row.after]),
            plan.review.advanceDeducted, plan.review.netDue, plan.review.debtBefore, plan.review.debtAfter],
        [true, [[500, 500, 100, 400], [400, 400, 300, 100], [300, 300, 300, 0]], 700, 3700, 1200, 500]);
    same('it is written as one existing `deducted` entry per advance, with the person\'s amounts',
        plan.changes.filter(change => change.value.kind === 'deducted')
            .map(change => [change.value.advanceId, change.value.amount, change.value.balanceAfter]),
        [[k1, 100, 400], [k2, 300, 100], [k3, 300, 0]]);
    const K1 = applied(S0, plan, 'the 100/300/300 closure');
    same('remaining balances, exact: 400, 100, 0 - and 500 carries into the next account',
        [leftOf(K1, k1), leftOf(K1, k2), leftOf(K1, k3), F('advanceCarryInto', K1, 'w_khaled', '2026-10-16'),
            F('accountFor', K1, 'w_khaled', '2026-10-16').debt], [400, 100, 0, 500, 500]);
    same('the statement keeps which advance, how much, and how much remained',
        K1.pay.ps_w_khaled_20261002.advanceDeductions.map(row => [row.advanceId, row.amount, row.before, row.after]),
        [[k1, 100, 500, 400], [k2, 300, 400, 100], [k3, 300, 300, 0]]);
    same('the existing judges call the split true', F('impossibleClosures', K1), []);
    same('and the existing readers freeze it: gross, deducted, net, carried',
        (walk => [walk.gross, walk.deducted, walk.net, walk.carriedOut, walk.closed])(
            F('advanceAccount', K1, 'w_khaled', FORTNIGHT.from, FORTNIGHT.to)), [4400, 700, 3700, 500, true]);

    // The same choice as ONE total, split oldest-first, is exactly what the old planner writes.
    const oldest = { [k1]: 500, [k2]: 200, [k3]: 0 };
    const mine = F('planClosure', S0, 'w_khaled', FORTNIGHT, { allocations: oldest }, stamp('2026-10-16', 'd_boss', '08'));
    const theirs = F('closePeriodChanges', clone(S0), 'w_khaled', FORTNIGHT.from, FORTNIGHT.to,
        '2026-10-16T08:00:00.000Z', 'd_boss', 700);
    same('for an oldest-first split the ledger half is byte for byte what closePeriodChanges writes today',
        mine.changes.filter(change => change.path.startsWith('ledger.')), theirs);

    // Refusals.
    const reasons = choices => F('planClosure', S0, 'w_khaled', FORTNIGHT, choices, stamp('2026-10-16'));
    const refusedFor = (name, choices, code) => {
        const answer = reasons(choices);
        check(name, answer.ok === false && answer.reasons.includes(code) && answer.changes.length === 0,
            JSON.stringify(answer.reasons));
    };
    refusedFor('more than an advance has left is refused: 300.01 off an advance of 300',
        { allocations: { [k1]: 0, [k2]: 0, [k3]: 300.01 } }, 'over-advance');
    refusedFor('a negative deduction is refused', { allocations: { [k1]: -1, [k2]: 0, [k3]: 0 } }, 'allocation');
    refusedFor('a deduction that is not a number is refused', { allocations: { [k1]: NaN, [k2]: 0, [k3]: 0 } }, 'allocation');
    refusedFor('a deduction typed as text is refused', { allocations: { [k1]: '100', [k2]: 0, [k3]: 0 } }, 'allocation');
    refusedFor('a deduction finer than an agora is refused', { allocations: { [k1]: 0.001, [k2]: 0, [k3]: 0 } }, 'allocation');
    refusedFor('an advance the person gave no answer for is a missing answer, not a zero',
        { allocations: { [k1]: 100, [k2]: 300 } }, 'allocation-missing');
    refusedFor('another man\'s advance cannot be deducted from this wage',
        { allocations: { [k1]: 0, [k2]: 0, [k3]: 0, [a1]: 100 } }, 'allocation');
    refusedFor('an advance that does not exist cannot be deducted',
        { allocations: { [k1]: 0, [k2]: 0, [k3]: 0, a_nothing: 100 } }, 'allocation');
    same('choosing zero for every advance is a legal choice: the wage is whole and the debt carries',
        (answer => [answer.ok, answer.review.netDue, answer.review.debtAfter,
            answer.changes.filter(change => change.value.kind === 'deducted').length])(
            reasons({ allocations: { [k1]: 0, [k2]: 0, [k3]: 0 } })), [true, 4400, 1200, 0]);

    // The same deduction twice.
    const again = F('planClosure', K1, 'w_khaled', FORTNIGHT, { allocations: choice }, stamp('2026-10-16'));
    check('the same closure a second time is refused: the period is closed and has its statement',
        again.ok === false && again.reasons.includes('closed') && again.reasons.includes('statement')
        && again.changes.length === 0, JSON.stringify(again.reasons));
    const twice = F('paybookApply', K1, plan.changes);
    same('and the same changes delivered twice change nothing: every path is the same fact',
        [twice.applied, twice.same.length, twice.conflicts, leftOf(twice.schedule, k1),
            F('closedPeriods', twice.schedule, 'w_khaled')[FORTNIGHT.from].deducted],
        [[], plan.changes.length, [], 400, 700]);
    const nextPeriod = { from: '2026-10-16', to: '2026-10-29' };
    const drained = F('planClosure', K1, 'w_khaled', nextPeriod, { allocations: { [k1]: 400, [k2]: 100.01 } },
        stamp('2026-10-29'));
    check('a later closure can take only what the first one left: 100.01 off the 100 that remains is refused',
        drained.ok === false && drained.reasons.includes('over-advance'), JSON.stringify(drained.reasons));

    // An advance dated after the period's end is shown, and not offered.
    const late = clone(S0);
    F('recordNewAdvance', late, 'w_khaled', '2026-10-16', 250, 'אחרי', '2026-10-16T07:00:00.000Z', 'd_boss', 'cash');
    const lateId = advancesOf(late, 'w_khaled')[3];
    const shown = F('planClosure', late, 'w_khaled', FORTNIGHT, { allocations: choice }, stamp('2026-10-16'));
    same('an advance dated after the period is listed apart and not offered',
        [shown.ok, shown.review.advances.length, shown.review.laterAdvances.map(row => [row.advanceId, row.left, row.offered])],
        [true, 3, [[lateId, 250, false]]]);
    check('and choosing it anyway is refused', (answer => answer.ok === false && answer.reasons.includes('allocation'))(
        F('planClosure', late, 'w_khaled', FORTNIGHT, { allocations: Object.assign({ [lateId]: 50 }, choice) },
            stamp('2026-10-16'))));

    // A NEW ADVANCE IS NEVER A WAGE PAYMENT.
    const due = F('paybookFold', K1).statements.ps_w_khaled_20261002;
    const handed = clone(K1);
    F('recordNewAdvance', handed, 'w_khaled', '2026-10-17', 1000, 'מקדמה חדשה', '2026-10-17T07:00:00.000Z', 'd_boss', 'cash');
    const after = F('accountFor', handed, 'w_khaled', '2026-10-17');
    same('before it: 3,700 of wage owed to him, nothing paid', [due.due, due.paid, due.status], [3700, 0, 'closed']);
    same('a new advance of 1,000 pays none of it: the wage owed is still 3,700 and unpaid, the debt is 1,500',
        [after.wageDue, after.unpaid[0].paid, after.unpaid[0].status, after.debt], [3700, 0, 'closed', 1500]);
    check('and there is no field anywhere in his account holding the difference of the two',
        !/\b2200\b/.test(JSON.stringify(after)), JSON.stringify(after).slice(0, 200));

    // An advance whose own period was never closed (Phase 0's two folds): refused, with both figures.
    const old = world({ days: [['w_khaled', '2026-09-20'], ['w_khaled', '2026-09-21']],
        advances: [['w_khaled', '2026-09-20', 500]] });
    const O0 = opened(old);
    const oldId = advancesOf(O0, 'w_khaled')[0];
    const stuck = F('planClosure', O0, 'w_khaled', FORTNIGHT, { allocations: { [oldId]: 300 } }, stamp('2026-10-16'));
    same('an advance from a fortnight nobody closed: 500 left on it, nothing the account walk will let come off',
        [stuck.ok, stuck.reasons, stuck.review.advances[0].left, stuck.review.walkRoom], [false, ['deduction'], 500, 0]);
    same('the migration report names the disagreement instead of settling it',
        F('planPayMigration', O0, '2026-10-16').debtDisagreements,
        [{ workerId: 'w_khaled', name: 'חאלד', byAdvance: 500, byAccountWalk: 0 }]);
}

// ---------------------------------------------------------------- extra deductions
{
    suite('extra deductions: off the wage, and never an advance');

    const d = world({ advances: [['w_khaled', '2026-10-03', 500], ['w_khaled', '2026-10-06', 400],
        ['w_khaled', '2026-10-10', 300]] });
    const S0 = opened(d);
    const [k1, k2, k3] = advancesOf(S0, 'w_khaled');
    const allocations = { [k1]: 100, [k2]: 300, [k3]: 300 };
    const extras = [{ amount: 150, category: 'agreed', reason: 'ציוד שאבד' }, { amount: 50.5, category: 'other', reason: 'קנס חניה' }];
    const plan = F('planClosure', S0, 'w_khaled', FORTNIGHT, { allocations, extras }, stamp('2026-10-16'));

    same('two extra deductions are kept apart from the advances on the review, and both come off the net',
        [plan.ok, plan.review.advanceDeducted, plan.review.extraDeducted, plan.review.netDue,
            plan.review.extras.map(extra => [extra.amount, extra.category, extra.reason])],
        [true, 700, 200.5, 3499.5, [[150, 'agreed', 'ציוד שאבד'], [50.5, 'other', 'קנס חניה']]]);
    const S1 = applied(S0, plan, 'a closure with extras');
    same('each is recorded with its amount, reason, date, worker and the closure it belongs to',
        ['pd_w_khaled_20261002_1', 'pd_w_khaled_20261002_2'].map(id => (entry => [entry.kind, entry.amount,
            entry.reason, entry.date, entry.workerId, entry.statementId, entry.category])(S1.pay[id])),
        [['deduction', 150, 'ציוד שאבד', '2026-10-15', 'w_khaled', 'ps_w_khaled_20261002', 'agreed'],
            ['deduction', 50.5, 'קנס חניה', '2026-10-15', 'w_khaled', 'ps_w_khaled_20261002', 'other']]);
    same('they are not advances: no advance moved because of them, and the debt is the advances\' alone',
        [leftOf(S1, k1), leftOf(S1, k2), leftOf(S1, k3), F('accountFor', S1, 'w_khaled', '2026-10-16').debt,
            Object.keys(S1.ledger.advances).filter(id => S1.ledger.advances[id].kind === 'deducted').length],
        [400, 100, 0, 500, 3]);
    const row = F('closureHistory', S1, { workerId: 'w_khaled' })[0];
    same('the history lists the two families side by side, never as one sum',
        [row.advanceDeducted, row.advanceDeductions.map(one => one.amount).sort((a, b) => a - b), row.extraDeducted,
            row.extras.map(one => [one.id, one.amount, one.reason]), row.netDue],
        [700, [100, 300, 300], 200.5, [['pd_w_khaled_20261002_1', 150, 'ציוד שאבד'],
            ['pd_w_khaled_20261002_2', 50.5, 'קנס חניה']], 3499.5]);
    same('the old readers see the closure they understand: the wage and the advance deductions',
        (walk => [walk.gross, walk.deducted, walk.closed])(F('advanceAccount', S1, 'w_khaled', FORTNIGHT.from, FORTNIGHT.to)),
        [4400, 700, true]);

    const refusedFor = (name, choices, code) => {
        const answer = F('planClosure', S0, 'w_khaled', FORTNIGHT, choices, stamp('2026-10-16'));
        check(name, answer.ok === false && answer.reasons.includes(code) && answer.changes.length === 0,
            JSON.stringify(answer.reasons));
    };
    refusedFor('capped with the wage: advances 700 + extras 3,700.01 is one agora over 4,400',
        { allocations, extras: [{ amount: 3700.01, category: 'other', reason: 'x' }] }, 'over-wage');
    same('and exactly the wage is allowed: the net is zero',
        (answer => [answer.ok, answer.review.netDue])(F('planClosure', S0, 'w_khaled', FORTNIGHT,
            { allocations, extras: [{ amount: 3700, category: 'other', reason: 'x' }] }, stamp('2026-10-16'))), [true, 0]);
    refusedFor('an extra deduction with no reason is refused', { allocations, extras: [{ amount: 50, category: 'other', reason: ' ' }] }, 'extra');
    refusedFor('an extra deduction of no category is refused', { allocations, extras: [{ amount: 50, reason: 'x' }] }, 'extra');
    refusedFor('an extra deduction of nothing is refused', { allocations, extras: [{ amount: 0, category: 'other', reason: 'x' }] }, 'extra');
    refusedFor('a negative extra deduction is refused', { allocations, extras: [{ amount: -50, category: 'other', reason: 'x' }] }, 'extra');

    // A deduction recorded in error is voided beside itself, and the money is his again.
    const undo = F('planVoid', S1, 'pd_w_khaled_20261002_1', { reason: 'הציוד נמצא' }, stamp('2026-10-18'));
    const S2 = applied(S1, undo, 'a void of an extra deduction');
    same('voiding an extra deduction gives the 150 back to his wage, linked to what it corrects, and touches no advance',
        [F('paybookFold', S1).statements.ps_w_khaled_20261002.due, F('paybookFold', S2).statements.ps_w_khaled_20261002.due,
            S2.pay.pv_pd_w_khaled_20261002_1.targetId, S2.pay.pv_pd_w_khaled_20261002_1.reason,
            S2.pay.pd_w_khaled_20261002_1.amount, leftOf(S2, k1)],
        [3499.5, 3649.5, 'pd_w_khaled_20261002_1', 'הציוד נמצא', 150, 400]);
    check('a void with no reason is refused', (answer => answer.ok === false && answer.reasons.includes('reason'))(
        F('planVoid', S1, 'pd_w_khaled_20261002_1', {}, stamp('2026-10-18'))));
    check('a second, different void of the same entry is refused',
        (answer => answer.ok === false && answer.reasons.includes('voided'))(
            F('planVoid', S2, 'pd_w_khaled_20261002_1', { reason: 'שוב', amount: 100 }, stamp('2026-10-19'))));

    // AN ADVANCE DEDUCTION UNDONE through the ledger's own correction: the debt returns
    // there, and the same shekels are wage owed again here. One correction, two folds.
    const reversed = clone(S1);
    given('the ledger\'s own correction is written', Boolean(F('recordEventReversed', reversed,
        `le_close_${k2}_20261002`, 300, '2026-10-18', 'נוכה בטעות', '2026-10-18T10:00:00.000Z', 'd_boss')));
    same('an advance deduction reversed in the ledger: the advance owes 300 more and the wage owes him 300 more',
        [leftOf(reversed, k2), F('paybookFold', reversed).statements.ps_w_khaled_20261002.due,
            F('accountFor', reversed, 'w_khaled', '2026-10-18').debt], [400, 3799.5, 800]);
}

// ---------------------------------------------------------------- payment
{
    suite('payment: what actually reached him, apart from what the closure fixed');

    const d = world({ advances: [['w_nasser', '2026-10-05', 800]] });
    const S0 = opened(d);
    const adv = advancesOf(S0, 'w_nasser')[0];
    const choices = paid => ({ allocations: { [adv]: 0 }, paid });
    const ST = 'ps_w_nasser_20261002';
    const due = S => F('paybookFold', S).statements[ST];

    // not yet / partial / full
    const none = applied(S0, F('planClosure', S0, 'w_nasser', FORTNIGHT, choices(undefined), stamp('2026-10-16')), 'closed, unpaid');
    same('NOT YET: an account may close with nothing paid; the whole net waits for him',
        [due(none).owed, due(none).paid, due(none).due, due(none).status, Object.keys(none.pay).filter(id => none.pay[id].kind === 'payment')],
        [3000, 0, 3000, 'closed', []]);
    const full = applied(S0, F('planClosure', S0, 'w_nasser', FORTNIGHT, choices(3000), stamp('2026-10-16')), 'closed, paid in full');
    same('FULL: net 3,000, paid 3,000, nothing owed', [due(full).paid, due(full).due, due(full).status], [3000, 0, 'paid']);
    check('more than the net is refused at the closing', (answer => answer.ok === false && answer.reasons.includes('overpay'))(
        F('planClosure', S0, 'w_nasser', FORTNIGHT, choices(3000.01), stamp('2026-10-16'))));
    check('a negative paid amount is refused', (answer => answer.ok === false && answer.reasons.includes('paid'))(
        F('planClosure', S0, 'w_nasser', FORTNIGHT, choices(-1), stamp('2026-10-16'))));

    const closing = F('planClosure', S0, 'w_nasser', FORTNIGHT, choices(2000), stamp('2026-10-16'));
    same('PARTIAL: net 3,000, paid 2,000 -> 1,000 owed to the worker',
        [closing.review.netDue, closing.review.paid, closing.review.balanceAfter], [3000, 2000, 1000]);
    const S1 = applied(S0, closing, 'closed, 2,000 paid');
    same('the fold says the same', [due(S1).owed, due(S1).paid, due(S1).due, due(S1).status], [3000, 2000, 1000, 'partial']);

    // Debt and wage owed, at once.
    const both = F('accountFor', S1, 'w_nasser', '2026-10-16');
    same('he is owed 1,000 of wage AND owes 800 of advance: two balances, both shown',
        [both.wageDue, both.debt, both.advances.map(row => [row.advanceId, row.left])], [1000, 800, [[adv, 800]]]);
    check('and never netted: no 200 and no 1,800 anywhere in his account',
        !/\b(200|1800)\b/.test(JSON.stringify(both)), JSON.stringify(both).slice(0, 200));
    same('the advance is untouched by the wage owed', leftOf(S1, adv), 800);

    // A later payment.
    const statementBytes = JSON.stringify(S1.pay[ST]);
    const artifactBytes = JSON.stringify(S1.ledger.advances.le_period_w_nasser_20261002);
    const pay600 = F('planPayment', S1, ST, 600, { paymentId: 'pp_later000001', method: 'transfer' }, stamp('2026-10-20'));
    same('a later payment of 600 leaves 400', [pay600.ok, pay600.due, pay600.dueAfter, pay600.changes.map(change => change.path)],
        [true, 1000, 400, ['pay.pp_later000001']]);
    const S2 = applied(S1, pay600, 'a later payment');
    same('1,000 owed - 600 paid -> 400', [due(S2).paid, due(S2).due, due(S2).status], [2600, 400, 'partial']);
    check('a payment never edits the statement or the frozen payslip',
        JSON.stringify(S2.pay[ST]) === statementBytes
        && JSON.stringify(S2.ledger.advances.le_period_w_nasser_20261002) === artifactBytes);
    check('paying more than is owed is refused: 400.01 against 400',
        (answer => answer.ok === false && answer.reasons.includes('overpay') && answer.changes.length === 0)(
            F('planPayment', S2, ST, 400.01, { paymentId: 'pp_later000002' }, stamp('2026-10-21'))));
    const refusals = [
        ['a payment of nothing', 0, {}, 'amount'], ['a negative payment', -5, {}, 'amount'],
        ['a payment that is not a number', NaN, {}, 'amount'], ['a payment typed as text', '100', {}, 'amount'],
        ['a payment dated tomorrow', 100, { date: '2026-10-22' }, 'date'],
        ['a payment by an unknown method', 100, { method: 'bit' }, 'method']
    ];
    refusals.forEach(([name, amount, options, code]) => {
        const answer = F('planPayment', S2, ST, amount, Object.assign({ paymentId: 'pp_later000003' }, options), stamp('2026-10-21'));
        check(`${name} is refused`, answer.ok === false && answer.reasons.includes(code) && answer.changes.length === 0,
            JSON.stringify(answer.reasons));
    });
    check('a payment with an id made up at press time is refused',
        (answer => answer.ok === false && answer.reasons.includes('payment-id'))(
            F('planPayment', S2, ST, 100, { paymentId: 'x' }, stamp('2026-10-21'))));
    check('a payment against a statement that is not there is refused',
        (answer => answer.ok === false && answer.reasons.includes('target'))(
            F('planPayment', S2, 'ps_w_nasser_20261016', 100, { paymentId: 'pp_later000004' }, stamp('2026-10-21'))));

    const S3 = applied(S2, F('planPayment', S2, ST, 400, { paymentId: 'pp_later000005' }, stamp('2026-10-22')), 'the last 400');
    const done = F('accountFor', S3, 'w_nasser', '2026-10-22');
    same('the last 400: the wage is paid; the advance he owes is exactly where it was',
        [due(S3).due, due(S3).status, done.wageDue, done.debt, done.status], [0, 'paid', 0, 800, 'open']);
    same('the history shows every payment under the closure it paid',
        F('closureHistory', S3, { workerId: 'w_nasser' })[0].payments.map(row => [row.id, row.date, row.amount, row.method]),
        [['pp_later000001', '2026-10-20', 600, 'transfer'], ['pp_later000005', '2026-10-22', 400, undefined],
            ['pp_ps_w_nasser_20261002', '2026-10-16', 2000, undefined]].sort((a, b) => (a[0] < b[0] ? -1 : 1)));

    // A payment recorded in error is voided beside itself.
    const wrong = F('planVoid', S2, 'pp_later000001', { reason: 'נרשם פעמיים' }, stamp('2026-10-21'));
    const S4 = applied(S2, wrong, 'a void of a payment');
    same('a payment voided: the 600 is owed again, the payment is still on the record',
        [due(S4).paid, due(S4).due, S4.pay.pp_later000001.amount, S4.pay.pv_pp_later000001.targetId], [2000, 1000, 600, 'pp_later000001']);
    check('a void larger than what it voids is refused', (answer => answer.ok === false && answer.reasons.includes('over-target'))(
        F('planVoid', S2, 'pp_later000001', { reason: 'x', amount: 600.01 }, stamp('2026-10-21'))));
    check('a void of nothing on the record is refused', (answer => answer.ok === false && answer.reasons.includes('target'))(
        F('planVoid', S2, 'pp_nothing00001', { reason: 'x' }, stamp('2026-10-21'))));

    // The closed net itself was wrong: an adjustment beside it.
    const more = F('planAdjustment', S2, ST, 500, { reason: 'יום שנשכח' }, stamp('2026-10-21'));
    const S5 = applied(S2, more, 'an adjustment');
    same('an adjustment of +500 stands under the statement; the statement is not edited',
        [due(S5).owed, due(S5).due, JSON.stringify(S5.pay[ST]) === statementBytes, more.changes[0].path],
        [3500, 900, true, `pay.pa_${ST}_1`]);
    check('an adjustment that would take back money already paid is refused',
        (answer => answer.ok === false && answer.reasons.includes('below-zero'))(
            F('planAdjustment', S2, ST, -400.01, { reason: 'x' }, stamp('2026-10-21'))));
    check('an adjustment with no reason is refused', (answer => answer.ok === false && answer.reasons.includes('reason'))(
        F('planAdjustment', S2, ST, 100, {}, stamp('2026-10-21'))));
    check('an adjustment of nothing is refused', (answer => answer.ok === false && answer.reasons.includes('delta'))(
        F('planAdjustment', S2, ST, 0, { reason: 'x' }, stamp('2026-10-21'))));

    // Two phones offline, each recording the same 400 under its own id: both land.
    const twoA = applied(S2, F('planPayment', S2, ST, 400, { paymentId: 'pp_phoneA00001' }, stamp('2026-10-22', 'd_a')), 'phone A');
    const twoB = F('paybookApply', twoA, F('planPayment', S2, ST, 400, { paymentId: 'pp_phoneB00001' }, stamp('2026-10-22', 'd_b')).changes).schedule;
    const overA = F('accountFor', twoB, 'w_nasser', '2026-10-22');
    same('two phones each record the last 400: both entries stay, the surplus is named, and a person is asked',
        [due(twoB).paid, due(twoB).due, due(twoB).overpaid, due(twoB).status, overA.wageOverpaid, overA.status, overA.debt],
        [3400, 0, 400, 'review', 400, 'review', 800]);
}

// ---------------------------------------------------------------- group closure
{
    suite('group closure: one independent plan per man');

    const d = world({ advances: [['w_khaled', '2026-10-03', 500], ['w_nasser', '2026-10-05', 800]] });
    const S0 = opened(d);
    const kAdv = advancesOf(S0, 'w_khaled')[0];
    const nAdv = advancesOf(S0, 'w_nasser')[0];
    const crew = ['w_ahmad', 'w_khaled', 'w_nasser', 'w_salim'];
    const scope = { date: '2026-10-08' };
    const choices = {
        w_khaled: { allocations: { [kAdv]: 500 }, paid: 3000 },
        w_nasser: { allocations: { [nAdv]: 300 }, paid: 1000 },
        w_salim: {}
        // Ahmad: no choices at all - he has no advance, so nothing is missing; closed unpaid.
    };
    const today = stamp('2026-10-16');
    const statuses = S => F('accountsList', S, '2026-10-16', {}).rows.map(row => [row.workerId, row.status]);
    const outcomes = run => run.results.map(row => [row.workerId, row.outcome, row.reasons]);

    const first = F('planGroupClosure', S0, crew, scope, choices, today);
    same('each man is planned on HIS period: the weekly man\'s week, the others\' fortnight',
        first.results.map(row => [row.workerId, row.period.from, row.period.to]),
        [['w_ahmad', WEEK1.from, WEEK1.to], ['w_khaled', FORTNIGHT.from, FORTNIGHT.to],
            ['w_nasser', FORTNIGHT.from, FORTNIGHT.to], ['w_salim', FORTNIGHT.from, FORTNIGHT.to]]);
    same('all four would write', [outcomes(first), first.counts],
        [crew.map(id => [id, 'write', []]), { write: 4, done: 0, skip: 0, refuse: 0 }]);
    same('before anything: all four are waiting', statuses(S0), crew.map(id => [id, 'waiting']));

    // Close one, leave the rest.
    const S1 = applied(S0, first.results[1].plan, 'Khaled alone');
    same('close one, leave the others: only his status moved',
        statuses(S1), [['w_ahmad', 'waiting'], ['w_khaled', 'partial'], ['w_nasser', 'waiting'], ['w_salim', 'waiting']]);
    check('his statement, his deduction and his payment are his alone - no other man\'s id is in them',
        first.results[1].plan.changes.every(change => /w_khaled|a_/.test(change.path))
        && !first.results[1].plan.changes.some(change => /w_ahmad|w_nasser|w_salim/.test(JSON.stringify(change))));

    // Resume later: the same request over the record as it now stands.
    const second = F('planGroupClosure', S1, crew, scope, choices, stamp('2026-10-17'));
    same('resume later: the one already closed is done, the other three still plan',
        [outcomes(second), second.counts],
        [[['w_ahmad', 'write', []], ['w_khaled', 'done', []], ['w_nasser', 'write', []], ['w_salim', 'write', []]],
            { write: 3, done: 1, skip: 0, refuse: 0 }]);

    // One refuses, the others still plan.
    const broken = Object.assign({}, choices, { w_nasser: { allocations: { [nAdv]: 800.01 }, paid: 1000 } });
    const third = F('planGroupClosure', S1, crew, scope, broken, stamp('2026-10-17'));
    // Both reasons are true and both are said: one agora more than the advance has left
    // is also one agora more than the account walk allows.
    same('one refuses - with its own reasons - and the others still plan',
        [outcomes(third), third.counts],
        [[['w_ahmad', 'write', []], ['w_khaled', 'done', []], ['w_nasser', 'refuse', ['over-advance', 'deduction']], ['w_salim', 'write', []]],
            { write: 2, done: 1, skip: 0, refuse: 1 }]);
    let S2 = S1;
    third.results.filter(row => row.outcome === 'write').forEach(row => { S2 = applied(S2, row.plan, row.workerId); });
    same('after writing the two that planned: three closed, the refused one still waiting',
        statuses(S2), [['w_ahmad', 'waiting'], ['w_khaled', 'partial'], ['w_nasser', 'waiting'], ['w_salim', 'closed']]);
    same('(the weekly man is "waiting" again only because his next week has work in it)',
        (account => [account.pending.map(wage => wage.from), account.unpaid.map(row => [row.periodFrom, row.status])])(
            F('accountFor', S2, 'w_ahmad', '2026-10-16')), [[WEEK2.from], [[WEEK1.from, 'closed']]]);

    // Retry: exactly the done ones are skipped.
    const retry = F('planGroupClosure', S2, crew, scope, choices, stamp('2026-10-17'));
    same('a retry skips exactly the ones that are done and plans exactly the one that is not',
        [outcomes(retry), retry.counts],
        [[['w_ahmad', 'done', []], ['w_khaled', 'done', []], ['w_nasser', 'write', []], ['w_salim', 'done', []]],
            { write: 1, done: 3, skip: 0, refuse: 0 }]);
    const S3 = applied(S2, retry.results[2].plan, 'Nasser on the retry');
    same('after the retry every statement exists once',
        Object.keys(S3.pay).filter(id => S3.pay[id].kind === 'statement').sort(),
        ['ps_w_ahmad_20261002', 'ps_w_khaled_20261002', 'ps_w_nasser_20261002', 'ps_w_salim_20261002']);
    same('and a third run has nothing left to write', F('planGroupClosure', S3, crew, scope, choices, stamp('2026-10-18')).counts,
        { write: 0, done: 4, skip: 0, refuse: 0 });
    same('the independent plans, written one at a time in a different order, land on the same record',
        (order => {
            let S = S0;
            order.forEach(at => { S = applied(S, first.results[at].plan, 'in another order'); });
            return [1, 0, 2, 3].map(at => first.results[at].plan.changes).flat()
                .every(change => JSON.stringify(change.path.startsWith('pay.') ? S.pay[change.value.id]
                    : S.ledger.advances[change.value.id]) === JSON.stringify(change.value));
        })([3, 2, 0, 1]), true);

    // Scope.
    const weeklyOnly = F('planGroupClosure', S0, crew, { date: '2026-10-08', cycle: 'weekly' }, choices, today);
    same('a scope of weekly workers takes the weekly man and skips the rest by name',
        outcomes(weeklyOnly), [['w_ahmad', 'write', []], ['w_khaled', 'skip', ['cycle']],
            ['w_nasser', 'skip', ['cycle']], ['w_salim', 'skip', ['cycle']]]);
    const fixed = F('planGroupClosure', S0, crew, FORTNIGHT, choices, today);
    same('a fixed fortnight refuses the weekly man - it is not his period - and plans the others',
        fixed.results.map(row => [row.workerId, row.outcome, row.reasons.includes('period')]),
        [['w_ahmad', 'refuse', true], ['w_khaled', 'write', false], ['w_nasser', 'write', false], ['w_salim', 'write', false]]);
    same('a man named twice is planned once, and somebody not on the roster is refused by name',
        outcomes(F('planGroupClosure', S0, ['w_salim', 'w_salim', 'w_ghost'], scope, choices, today)),
        [['w_salim', 'write', []], ['w_salim', 'skip', ['twice']], ['w_ghost', 'refuse', ['worker']]]);
    same('a man with an open advance and no answer for it is refused; nobody decides for the person',
        outcomes(F('planGroupClosure', S0, ['w_khaled'], scope, {}, today)), [['w_khaled', 'refuse', ['allocation-missing']]]);
}

// ---------------------------------------------------------------- two devices, one account
{
    suite('idempotency and concurrency, at the level of the model');

    const d = world({ advances: [['w_khaled', '2026-10-03', 500], ['w_khaled', '2026-10-06', 400]] });
    const S0 = opened(d);
    const [k1, k2] = advancesOf(S0, 'w_khaled');
    const phoneA = device();
    const phoneB = device();
    const same700 = { allocations: { [k1]: 300, [k2]: 400 }, extras: [{ amount: 100, category: 'agreed', reason: 'ציוד' }], paid: 2000 };

    // Identical choices.
    const planA = phoneA.call('planClosure', S0, 'w_khaled', FORTNIGHT, same700, stamp('2026-10-16', 'd_a', '10'));
    const planB = phoneB.call('planClosure', S0, 'w_khaled', FORTNIGHT, same700, stamp('2026-10-16', 'd_b', '11'));
    same('two devices planning the same closure with the same choices mint the same ids',
        planA.changes.map(change => change.path), planB.changes.map(change => change.path));
    same('and the same changes, to the byte, once the signer and the moment are set aside',
        planA.changes.map(change => without(change.value, ['at', 'by'])),
        planB.changes.map(change => without(change.value, ['at', 'by'])));
    same('with the same signer and moment they are the same bytes outright',
        phoneB.call('planClosure', S0, 'w_khaled', FORTNIGHT, same700, stamp('2026-10-16', 'd_a', '10')).changes, planA.changes);
    const afterA = applied(S0, planA, 'phone A\'s closure');
    const merged = F('paybookApply', afterA, planB.changes);
    same('landing the second on top of the first writes nothing new and reports no conflict',
        [merged.applied, merged.same.length, merged.conflicts], [[], planB.changes.length, []]);
    same('the first signer stands', [merged.schedule.pay.ps_w_khaled_20261002.by,
        merged.schedule.ledger.advances.le_period_w_khaled_20261002.by], ['d_a', 'd_a']);
    same('one closure, one payment: 2,000 paid once, not 4,000',
        (of => [of.paid, of.due, of.payments.length])(F('paybookFold', merged.schedule).statements.ps_w_khaled_20261002),
        [2000, 1600, 1]);

    // Different choices: the ids collide.
    const other = { allocations: { [k1]: 500, [k2]: 0 }, paid: 1000 };
    const planC = phoneB.call('planClosure', S0, 'w_khaled', FORTNIGHT, other, stamp('2026-10-16', 'd_b', '11'));
    const clash = F('paybookApply', afterA, planC.changes);
    check('two devices closing one account with DIFFERENT choices collide on the same ids',
        clash.conflicts.includes('pay.ps_w_khaled_20261002') && clash.conflicts.includes('pay.pp_ps_w_khaled_20261002')
        && clash.conflicts.includes('ledger.advances.le_period_w_khaled_20261002'), JSON.stringify(clash.conflicts));
    const stood = F('paybookFold', clash.schedule);
    same('the fold reports the conflict and chooses nothing: the first closure stands exactly as it was',
        [stood.conflicts.map(row => [row.id, row.workerIds]),
            JSON.stringify(clash.schedule.pay.ps_w_khaled_20261002) === JSON.stringify(afterA.pay.ps_w_khaled_20261002),
            stood.statements.ps_w_khaled_20261002.paid],
        [[['pp_ps_w_khaled_20261002', ['w_khaled']], ['ps_w_khaled_20261002', ['w_khaled']]], true, 2000]);
    same('the other phone\'s version is kept beside it, whole',
        clash.schedule.payConflicted.ps_w_khaled_20261002.map(entry => [entry.by, entry.advanceDeducted]), [['d_b', 500]]);
    same('his account says a person has to look', F('accountFor', clash.schedule, 'w_khaled', '2026-10-16').status, 'review');
    check('and nothing more is written against it until somebody does',
        (answer => answer.ok === false && answer.reasons.includes('conflict'))(
            F('planPayment', clash.schedule, 'ps_w_khaled_20261002', 100, { paymentId: 'pp_after000001' }, stamp('2026-10-17'))));

    // A double tap.
    const options = { paymentId: 'pp_formopen001', method: 'cash' };
    const tap1 = F('planPayment', afterA, 'ps_w_khaled_20261002', 700, options, stamp('2026-10-17'));
    const tap2 = F('planPayment', afterA, 'ps_w_khaled_20261002', 700, options, stamp('2026-10-17'));
    same('a double tap carries one id minted when the form opened', tap1.changes, tap2.changes);
    const tapped = F('paybookApply', applied(afterA, tap1, 'the first tap'), tap2.changes);
    same('so it is one payment: 700 once', [tapped.applied, tapped.same, tapped.conflicts,
        F('paybookFold', tapped.schedule).statements.ps_w_khaled_20261002.paid], [[], ['pay.pp_formopen001'], [], 2700]);
    const tap3 = F('planPayment', tapped.schedule, 'ps_w_khaled_20261002', 700, options, stamp('2026-10-17', 'd_boss', '11'));
    same('a third press after it landed is told it is already recorded, and writes nothing',
        [tap3.ok, tap3.already, tap3.changes, tap3.reasons], [true, true, [], []]);
    check('the same id with different money is a conflict, not a second payment',
        (answer => answer.ok === false && answer.reasons.includes('conflict'))(
            F('planPayment', tapped.schedule, 'ps_w_khaled_20261002', 300, options, stamp('2026-10-17'))));
    const ids = [phoneA.call('newPaymentId'), phoneA.call('newPaymentId'), phoneB.call('newPaymentId')];
    check('a minted payment id is a safe path segment and no two are alike',
        ids.every(id => /^pp_[a-z0-9]{6,40}$/i.test(id) && F('isSafeId', id)) && new Set(ids).size === 3, JSON.stringify(ids));

    // A stale plan.
    same('a plan re-checked against the record it was drawn from is still valid',
        (answer => [answer.ok, answer.reasons])(F('stillValid', S0, planA)), [true, []]);
    const elsewhere = clone(S0);
    F('assignPlace', elsewhere, '2026-10-16', 'w_salim', 'actual', 'p_a');
    same('another man\'s day does not make it stale', F('stillValid', elsewhere, planA).ok, true);
    const repaid = clone(S0);
    given('a repayment lands on another phone', Boolean(F('recordAdvanceRepaid', repaid, k1, 250, '2026-10-14', 'מזומן',
        '2026-10-16T09:00:00.000Z', 'd_other', 'cash')));
    const stale = F('stillValid', repaid, planA);
    check('a repayment on one of his advances while the review was open makes the plan stale',
        stale.ok === false && stale.reasons[0] === 'stale' && stale.reasons.includes('over-advance'),
        JSON.stringify(stale.reasons));
    same('the stale answer carries the fresh review, so the page can be redrawn: 250 is what is left now',
        stale.fresh.review.advances[0].left, 250);
    const closedElsewhere = F('stillValid', afterA, planB);
    check('a plan confirmed after the statement already exists is refused: stale, closed, has its statement',
        closedElsewhere.ok === false && closedElsewhere.reasons[0] === 'stale'
        && closedElsewhere.reasons.includes('closed') && closedElsewhere.reasons.includes('statement'),
        JSON.stringify(closedElsewhere.reasons));
    same('a payment plan re-checked after it landed is "done", not "stale"',
        F('stillValid', tapped.schedule, tap1).reasons, ['done']);
    const paidElsewhere = applied(afterA, F('planPayment', afterA, 'ps_w_khaled_20261002', 1500, { paymentId: 'pp_otherphone1' },
        stamp('2026-10-17', 'd_b')), 'a payment on the other phone');
    check('a payment planned against 1,600 owed is stale once the other phone has paid 1,500 of it',
        (answer => answer.ok === false && answer.reasons[0] === 'stale' && answer.reasons.includes('overpay'))(
            F('stillValid', paidElsewhere, tap1)));
    check('a plan with its inputs stripped off is never valid',
        F('stillValid', S0, { kind: 'closure', ok: true, changes: planA.changes }).ok === false);

    // The opening is one decision.
    same('two phones activating on the same day are one activation',
        (answer => [answer.ok, answer.already, answer.changes])(F('planOpening', S0, OPENING, stamp('2026-10-10', 'd_b'))), [true, true, []]);
    check('and a second activation on another day is refused', (answer => answer.ok === false && answer.reasons.includes('opened'))(
        F('planOpening', S0, '2026-09-18', stamp('2026-10-10', 'd_b'))));
}

// ---------------------------------------------------------------- purity, determinism, codes, rounding
{
    suite('purity, determinism, stable reason codes, and no float drift');

    const d = world({ advances: [['w_khaled', '2026-10-03', 500], ['w_khaled', '2026-10-06', 400],
        ['w_nasser', '2026-10-05', 800]],
    workers: [{ id: 'w_round', name: 'עגול', active: true, dailyRate: 100.1, hourlyRate: 33.33 },
        { id: 'w_norate', name: 'בלי תעריף', active: true, dailyRate: 0, hourlyRate: 0 }],
    days: W1.map((day, at) => ['w_round', day, at === 0 ? 7 : 6]).concat([['w_norate', '2026-10-04']]) });
    const S0 = opened(d);
    const [k1, k2] = advancesOf(S0, 'w_khaled');
    const choices = { allocations: { [k1]: 300, [k2]: 400 }, extras: [{ amount: 100, category: 'agreed', reason: 'ציוד' }], paid: 2000 };
    const closing = F('planClosure', S0, 'w_khaled', FORTNIGHT, choices, stamp('2026-10-16'));
    const S1 = applied(S0, closing, 'a closure');

    // Every function, over the record before and after a closure: the input is not touched.
    const deepFreeze = value => {
        if (value && typeof value === 'object') { Object.values(value).forEach(deepFreeze); Object.freeze(value); }
        return value;
    };
    const calls = S => ({
        accountFor: () => F('accountFor', S, 'w_khaled', '2026-10-16'),
        accountsList: () => F('accountsList', S, '2026-10-16', { cycle: 'all' }),
        planClosure: () => F('planClosure', S, 'w_khaled', FORTNIGHT, choices, stamp('2026-10-16')),
        planClosureRefused: () => F('planClosure', S, 'w_ahmad', FORTNIGHT, {}, stamp('2026-10-16')),
        planPayment: () => F('planPayment', S, 'ps_w_khaled_20261002', 100, { paymentId: 'pp_pure0000001' }, stamp('2026-10-17')),
        planVoid: () => F('planVoid', S, 'pd_w_khaled_20261002_1', { reason: 'x' }, stamp('2026-10-17')),
        planAdjustment: () => F('planAdjustment', S, 'ps_w_khaled_20261002', 50, { reason: 'x' }, stamp('2026-10-17')),
        planOpening: () => F('planOpening', S, OPENING, stamp('2026-10-10')),
        planLegacy: () => F('planLegacy', S, 'w_khaled', FORTNIGHT.from, { state: 'paid' }, stamp('2026-10-17')),
        planGroupClosure: () => F('planGroupClosure', S, ['w_ahmad', 'w_khaled', 'w_nasser'], { date: '2026-10-08' },
            { w_khaled: choices }, stamp('2026-10-16')),
        planPayMigration: () => F('planPayMigration', S, '2026-10-16'),
        closureHistory: () => F('closureHistory', S, {}),
        stillValid: () => F('stillValid', S, closing),
        paybookFold: () => F('paybookFold', S),
        paybookApply: () => F('paybookApply', S, closing.changes)
    });
    [['before a closure', S0], ['after a closure', S1]].forEach(([when, S]) => {
        const bytes = JSON.stringify(S);
        const run = calls(S);
        const first = {};
        Object.keys(run).forEach(name => { first[name] = JSON.stringify(run[name]()); });
        same(`no function mutates the schedule it is handed (${when})`, JSON.stringify(S) === bytes, true);
        const repeat = Object.keys(run).filter(name => JSON.stringify(run[name]()) !== first[name]);
        same(`the same input gives the same output, every function (${when})`, repeat, []);
        const frozen = deepFreeze(clone(S));
        const cold = calls(frozen);
        const differs = Object.keys(cold).filter(name => {
            try { return JSON.stringify(cold[name]()) !== first[name]; } catch (error) { return true; }
        });
        same(`a deep-frozen schedule gives the same answers, so nothing depended on writing into it (${when})`, differs, []);
    });
    const choiceBytes = JSON.stringify(choices);
    F('planClosure', S0, 'w_khaled', FORTNIGHT, choices, stamp('2026-10-16'));
    same('nor the choices it is handed', JSON.stringify(choices), choiceBytes);

    // Every refusal is a stable code. Each is produced here at least once, by name.
    const seen = new Set();
    const expect = (name, answer, code) => {
        (answer.reasons || []).forEach(reason => seen.add(reason));
        check(`refusal «${code}»: ${name}`, answer.ok === false && answer.reasons.includes(code)
            && (answer.changes || []).length === 0, JSON.stringify(answer.reasons));
    };
    const st = stamp('2026-10-16');
    const zero = { allocations: { [k1]: 0, [k2]: 0 } };
    const C = (S, worker, period, picked, when) => F('planClosure', S, worker, period, picked, when || st);
    const raw = clone(d.State.schedule);
    expect('a man who is not on the roster', C(S0, 'w_ghost', FORTNIGHT, {}), 'worker');
    expect('no signer', C(S0, 'w_salim', FORTNIGHT, {}, { at: st.at, by: '', today: st.today }), 'stamp');
    expect('no moment', C(S0, 'w_salim', FORTNIGHT, {}, { by: 'd', today: st.today }), 'stamp');
    expect('a today that is not a day', C(S0, 'w_salim', FORTNIGHT, {}, { at: st.at, by: 'd', today: '2026-13-01' }), 'stamp');
    expect('tracking never activated', C(raw, 'w_salim', FORTNIGHT, {}), 'inactive');
    expect('a period that ended before tracking began',
        C(applied(raw, F('planOpening', raw, '2026-10-16', st), 'a late opening'), 'w_salim', FORTNIGHT, {}), 'before-tracking');
    expect('a window that is not his period', C(S0, 'w_salim', { from: '2026-10-02', to: '2026-10-10' }, {}), 'period');
    expect('a period that is not two dates', C(S0, 'w_salim', { from: '2026-10-02' }, {}), 'period');
    expect('a period already closed', C(S1, 'w_khaled', FORTNIGHT, choices), 'closed');
    expect('a statement already there', C(S1, 'w_khaled', FORTNIGHT, choices), 'statement');
    expect('a period before its last day', C(S0, 'w_salim', FORTNIGHT, {}, stamp('2026-10-14')), 'early');
    expect('a worked day with no rate', C(S0, 'w_norate', FORTNIGHT, {}), 'unpriced');
    expect('an advance answered with text', C(S0, 'w_khaled', FORTNIGHT, { allocations: { [k1]: 'x', [k2]: 0 } }), 'allocation');
    expect('an advance with no answer', C(S0, 'w_khaled', FORTNIGHT, { allocations: { [k1]: 0 } }), 'allocation-missing');
    expect('more than an advance has left', C(S0, 'w_khaled', FORTNIGHT, { allocations: { [k1]: 500.01, [k2]: 0 } }), 'over-advance');
    expect('deductions above the wage', C(S0, 'w_khaled', FORTNIGHT,
        Object.assign({ extras: [{ amount: 4400.01, category: 'other', reason: 'x' }] }, zero)), 'over-wage');
    expect('an extra deduction with no reason', C(S0, 'w_khaled', FORTNIGHT,
        Object.assign({ extras: [{ amount: 5, category: 'other' }] }, zero)), 'extra');
    expect('a paid amount that is not money', C(S0, 'w_khaled', FORTNIGHT, Object.assign({ paid: NaN }, zero)), 'paid');
    expect('more paid than the net', C(S0, 'w_khaled', FORTNIGHT, Object.assign({ paid: 4400.01 }, zero)), 'overpay');
    expect('a note that is not a note', C(S0, 'w_khaled', FORTNIGHT, Object.assign({ note: 7 }, zero)), 'note');

    // overlap: a weekly man moved back to fortnightly; the fortnight covers a week already closed.
    const moved = clone(S0);
    const week1 = C(moved, 'w_ahmad', WEEK1, {});
    const movedClosed = applied(moved, week1, 'his week');
    movedClosed.workers.find(worker => worker.id === 'w_ahmad').payCycles = '';
    expect('a period sharing a day with a closed one', C(movedClosed, 'w_ahmad', FORTNIGHT, {}), 'overlap');

    // overpaid: the same 500 handed back twice.
    const twiceBack = clone(S0);
    F('recordAdvanceRepaid', twiceBack, k1, 500, '2026-10-10', 'א', '2026-10-10T09:00:00.000Z', 'd_a', 'cash');
    F('recordAdvanceRepaid', twiceBack, k1, 500, '2026-10-10', 'ב', '2026-10-10T09:05:00.000Z', 'd_b', 'cash');
    expect('an advance settled twice over', C(twiceBack, 'w_khaled', FORTNIGHT, { allocations: { [k2]: 0 } }), 'overpaid');

    // clock: a repayment written down AFTER this closure's own moment, dated inside the period.
    const behind = clone(S0);
    F('recordAdvanceRepaid', behind, k1, 100, '2026-10-14', 'מזומן', '2026-10-16T12:00:00.000Z', 'd_other', 'cash');
    expect('a phone whose clock is behind another\'s entry', C(behind, 'w_khaled', FORTNIGHT, { allocations: { [k1]: 400, [k2]: 0 } }), 'clock');

    // gate: a build with the writer shut.
    const shut = device({ flags: { ledgerWrites: false } });
    expect('the financial gate shut on this build', shut.call('planClosure', S0, 'w_salim', FORTNIGHT, {}, st), 'gate');
    expect('the gate shut, for a payment', shut.call('planPayment', S1, 'ps_w_khaled_20261002', 10, { paymentId: 'pp_gate00000001' }, st), 'gate');

    // unsafe-id: an id this closure would mint cannot be a field path.
    const long = clone(S0);
    long.workers.push({ id: 'w_' + 'x'.repeat(95), name: 'ארוך', active: true, dailyRate: 100, hourlyRate: 0 });
    expect('a worker id too long to derive ids from', C(long, 'w_' + 'x'.repeat(95), FORTNIGHT, {}), 'unsafe-id');

    // conflict
    const disputed = F('paybookApply', S1, F('planClosure', S0, 'w_khaled', FORTNIGHT,
        Object.assign({ paid: 5 }, zero), stamp('2026-10-16', 'd_b')).changes).schedule;
    expect('an unsettled disagreement on his account', C(disputed, 'w_khaled', { from: '2026-10-16', to: '2026-10-29' },
        { allocations: { [k1]: 0 } }, stamp('2026-10-29')), 'conflict');

    // deduction: see the advances section; produced again here so the list below is complete.
    // One day at 350 in a fortnight nobody closed, and 500 handed over in it: the walk
    // counts 350 as taken there and carries 150, so 150 may come off now and 150.01 may not.
    const oldWorld = world({ days: [['w_khaled', '2026-09-20']], advances: [['w_khaled', '2026-09-20', 500]] });
    const O0 = opened(oldWorld);
    const oldAdvance = advancesOf(O0, 'w_khaled')[0];
    expect('the account walk allowing less than was chosen',
        C(O0, 'w_khaled', FORTNIGHT, { allocations: { [oldAdvance]: 150.01 } }), 'deduction');
    same('and exactly what the walk carries is allowed',
        (answer => [answer.ok, answer.review.walkRoom, answer.review.advances[0].left])(
            C(O0, 'w_khaled', FORTNIGHT, { allocations: { [oldAdvance]: 150 } })), [true, 150, 500]);

    // the other planners
    const P = (...args) => F('planPayment', ...args);
    expect('payment: no such statement', P(S1, 'ps_nobody', 5, { paymentId: 'pp_code00000001' }, st), 'target');
    expect('payment: an id nobody minted', P(S1, 'ps_w_khaled_20261002', 5, { paymentId: 'pay' }, st), 'payment-id');
    expect('payment: nothing', P(S1, 'ps_w_khaled_20261002', 0, { paymentId: 'pp_code00000001' }, st), 'amount');
    expect('payment: more than is owed', P(S1, 'ps_w_khaled_20261002', 1600.01, { paymentId: 'pp_code00000001' }, st), 'overpay');
    expect('payment: not yet', P(S1, 'ps_w_khaled_20261002', 5, { paymentId: 'pp_code00000001', date: '2026-10-17' }, st), 'date');
    expect('payment: an unknown method', P(S1, 'ps_w_khaled_20261002', 5, { paymentId: 'pp_code00000001', method: 'x' }, st), 'method');
    expect('payment: a note that is not a note', P(S1, 'ps_w_khaled_20261002', 5, { paymentId: 'pp_code00000001', note: 5 }, st), 'note');
    expect('payment: no stamp', F('planPayment', S1, 'ps_w_khaled_20261002', 5, { paymentId: 'pp_code00000001' }, null), 'stamp');
    expect('void: nothing by that id', F('planVoid', S1, 'pp_nothing00001', { reason: 'x' }, st), 'target');
    expect('void: no reason', F('planVoid', S1, 'pp_ps_w_khaled_20261002', {}, st), 'reason');
    expect('void: not money', F('planVoid', S1, 'pp_ps_w_khaled_20261002', { reason: 'x', amount: -1 }, st), 'amount');
    expect('void: more than the target', F('planVoid', S1, 'pp_ps_w_khaled_20261002', { reason: 'x', amount: 2000.01 }, st), 'over-target');
    expect('void: not yet', F('planVoid', S1, 'pp_ps_w_khaled_20261002', { reason: 'x', date: '2026-10-17' }, st), 'date');
    const voidedOnce = applied(S1, F('planVoid', S1, 'pp_ps_w_khaled_20261002', { reason: 'x' }, st), 'a void');
    expect('void: already voided differently', F('planVoid', voidedOnce, 'pp_ps_w_khaled_20261002', { reason: 'y', amount: 5 }, st), 'voided');
    expect('adjustment: no such statement', F('planAdjustment', S1, 'ps_nobody', 5, { reason: 'x' }, st), 'target');
    expect('adjustment: nothing', F('planAdjustment', S1, 'ps_w_khaled_20261002', 0, { reason: 'x' }, st), 'delta');
    expect('adjustment: no reason', F('planAdjustment', S1, 'ps_w_khaled_20261002', 5, {}, st), 'reason');
    expect('adjustment: below what was paid', F('planAdjustment', S1, 'ps_w_khaled_20261002', -1600.01, { reason: 'x' }, st), 'below-zero');
    expect('adjustment: not yet', F('planAdjustment', S1, 'ps_w_khaled_20261002', 5, { reason: 'x', date: '2026-10-17' }, st), 'date');
    expect('opening: a day that has not come', F('planOpening', raw, '2026-10-17', st), 'date');
    expect('opening: already opened on another day', F('planOpening', S0, '2026-10-09', st), 'opened');
    // A closure made the old way, for the legacy answers.
    const olden = clone(S0);
    F('closePeriodChanges', olden, 'w_salim', FORTNIGHT.from, FORTNIGHT.to, '2026-10-16T08:00:00.000Z', 'd_boss', 0);
    expect('legacy: no closure to answer for', F('planLegacy', S0, 'w_salim', FORTNIGHT.from, { state: 'paid' }, st), 'target');
    expect('legacy: neither paid nor owed', F('planLegacy', olden, 'w_salim', FORTNIGHT.from, { state: 'maybe' }, st), 'state');
    expect('legacy: owed more than that closure\'s net', F('planLegacy', olden, 'w_salim', FORTNIGHT.from, { state: 'due', due: 3600.01 }, st), 'due');
    expect('legacy: a note that is not a note', F('planLegacy', olden, 'w_salim', FORTNIGHT.from, { state: 'paid', note: 1 }, st), 'note');
    const answered = applied(olden, F('planLegacy', olden, 'w_salim', FORTNIGHT.from, { state: 'paid' }, st), 'an answer');
    expect('legacy: already answered differently', F('planLegacy', answered, 'w_salim', FORTNIGHT.from, { state: 'due', due: 100 }, st), 'answered');
    F('stillValid', S1, closing).reasons.forEach(reason => seen.add(reason));

    // The whole vocabulary. `permission`, `unpaid` and `rejected` are the three that the
    // shipped defaults cannot produce: the first two are behind rules (8) and (3) and are
    // produced below with each rule flipped; the third fires only if this file and
    // js/model/ledger.js disagree about an entry, and no input here can make them.
    const vocabulary = ['worker', 'stamp', 'gate', 'inactive', 'before-tracking', 'period', 'closed', 'overlap',
        'statement', 'conflict', 'early', 'unpriced', 'overpaid', 'allocation', 'allocation-missing', 'over-advance',
        'over-wage', 'deduction', 'clock', 'extra', 'paid', 'overpay', 'note', 'unsafe-id',
        'target', 'payment-id', 'amount', 'date', 'method', 'reason', 'over-target', 'voided', 'delta', 'below-zero',
        'opened', 'state', 'due', 'answered', 'stale'];
    same('every refusal code in the vocabulary was produced above, by name', vocabulary.filter(code => !seen.has(code)), []);
    same('and nothing outside the vocabulary was ever answered', [...seen].filter(code => !vocabulary.includes(code)).sort(), []);
    check('a refusal never carries a change', [C(S0, 'w_ghost', FORTNIGHT, {}), C(S1, 'w_khaled', FORTNIGHT, choices)]
        .every(answer => answer.changes.length === 0 && answer.canClose === false));

    // EACH DEFAULT IS ONE LINE. The same file with one constant flipped, loaded into its own
    // device: the behaviour follows the constant and nothing else had to be touched.
    const flipped = (line, replacement) => {
        given(`the rule is spelled once in the file (${line})`, PAYROLL.split(line).length === 2);
        // The whole app, with that one file's one line changed - through the harness's
        // own door for running a device on other bytes, since the file is in the load
        // order now and cannot be loaded a second time beside itself.
        const sources = loadOrder().map(file => ({
            file,
            code: file === 'js/model/payroll.js' ? PAYROLL.replace(line, replacement)
                : readFileSync(join(sourceRoot(), file), 'utf8')
        }));
        const other = makeDevice({ deviceId: `d_flip${++devices}`, sources, flags: { paybook: true } });
        return (name, ...args) => other.call(name, ...args);
    };
    const week1Open = clone(S0);
    same('default (2) flipped: earlier unclosed periods are summed into the running figure - the 3,800',
        [F('accountFor', week1Open, 'w_ahmad', '2026-10-12').running,
            flipped('earlierUnclosedSummed: false', 'earlierUnclosedSummed: true')('accountFor', week1Open, 'w_ahmad', '2026-10-12').running],
        [2000, 3800]);
    same('default (3) flipped: a closure that names no payment is refused',
        [C(S0, 'w_salim', FORTNIGHT, {}).ok,
            flipped('closeWithNothingPaid: true', 'closeWithNothingPaid: false')('planClosure', S0, 'w_salim', FORTNIGHT, {}, st).reasons],
        [true, ['unpaid']]);
    same('default (4) flipped: a period may close before its last day',
        [C(S0, 'w_salim', FORTNIGHT, {}, stamp('2026-10-14')).reasons,
            flipped('closeBeforeLastDay: false', 'closeBeforeLastDay: true')('planClosure', S0, 'w_salim', FORTNIGHT, {}, stamp('2026-10-14')).ok],
        [['early'], true]);
    const overWage = { extras: [{ amount: 3600.01, category: 'other', reason: 'x' }] };
    same('default (5) flipped: deductions may exceed the wage and the net goes below zero',
        [C(S0, 'w_salim', FORTNIGHT, overWage).reasons,
            (answer => [answer.ok, answer.review.netDue])(flipped('deductionsMayExceedWage: false', 'deductionsMayExceedWage: true')(
                'planClosure', S0, 'w_salim', FORTNIGHT, overWage, st))],
        [['over-wage'], [true, -0.01]]);
    const lateAdvance = clone(S0);
    F('recordNewAdvance', lateAdvance, 'w_salim', '2026-10-16', 250, 'אחרי', '2026-10-16T07:00:00.000Z', 'd_boss', 'cash');
    same('default (6) flipped: a later-dated advance is offered - and the account walk still refuses to deduct it',
        [C(lateAdvance, 'w_salim', FORTNIGHT, {}).review.advances.length,
            (answer => [answer.review.advances.map(row => row.offered), answer.reasons])(
                flipped('offerLaterDatedAdvances: false', 'offerLaterDatedAdvances: true')('planClosure', lateAdvance, 'w_salim', FORTNIGHT,
                    { allocations: { [advancesOf(lateAdvance, 'w_salim')[0]]: 100 } }, st))],
        [0, [[true], ['deduction']]]);
    same('default (7) flipped: tracking covers all history and needs no activation',
        [C(raw, 'w_salim', FORTNIGHT, {}).reasons,
            flipped('trackingFromActivationPeriod: true', 'trackingFromActivationPeriod: false')('planClosure', raw, 'w_salim', FORTNIGHT, {}, st).ok],
        [['inactive'], true]);
    const named = flipped('whoMayClose: null', 'whoMayClose: [\'d_owner\']');
    same('default (8) flipped: only the named accounts may close',
        [named('planClosure', S0, 'w_salim', FORTNIGHT, {}, st).reasons,
            named('planClosure', S0, 'w_salim', FORTNIGHT, {}, stamp('2026-10-16', 'd_owner')).ok], [['permission'], true]);
    same('and the ninth: an advance the person did not answer for may be read as zero',
        [C(S0, 'w_khaled', FORTNIGHT, { allocations: { [k1]: 0 } }).reasons,
            flipped('unlistedAdvanceMeansZero: false', 'unlistedAdvanceMeansZero: true')('planClosure', S0, 'w_khaled', FORTNIGHT,
                { allocations: { [k1]: 0 } }, st).ok], [['allocation-missing'], true]);

    // Rounding.
    same('0.1 + 0.2 is 0.3', F('paybookSum', [0.1, 0.2]), 0.3);
    same('thirty-seven times 33.33 is 1,233.21', F('paybookSum', Array(37).fill(33.33)), 1233.21);
    check('where plain float addition is not: 0.1 + 0.2 is not 0.3 to a computer', 0.1 + 0.2 !== 0.3);
    same('a thousand tenths are exactly 100', F('paybookSum', Array(1000).fill(0.1)), 100);
    check('which a running float total is not', Array(1000).fill(0.1).reduce((sum, value) => sum + value, 0) !== 100);
    // 6 days at 100.10 and 37 hours at 33.33: 600.60 + 1,233.21.
    const round = F('planClosure', S0, 'w_round', FORTNIGHT, {
        extras: [{ amount: 0.1, category: 'other', reason: 'א' }, { amount: 0.2, category: 'other', reason: 'ב' }], paid: 33.33
    }, stamp('2026-10-16'));
    same('a wage built from 37 hours at 33.33 closes on whole agorot',
        [round.ok, round.review.counts.extraHours, round.review.gross, round.review.extraDeducted, round.review.netDue,
            round.review.balanceAfter], [true, 37, 1833.81, 0.3, 1833.51, 1800.18]);
    let R = applied(S0, round, 'the rounding closure');
    for (let n = 1; n <= 36; n += 1) {
        R = applied(R, F('planPayment', R, 'ps_w_round_20261002', 33.33,
            { paymentId: 'pp_small' + String(n).padStart(6, '0') }, stamp('2026-10-17')), `small payment ${n}`);
    }
    const rounded = F('paybookFold', R).statements.ps_w_round_20261002;
    same('thirty-seven payments of 33.33 are 1,233.21 paid and 600.30 owed - to the agora',
        [rounded.payments.length, rounded.paid, rounded.due, rounded.overpaid], [37, 1233.21, 600.3, 0]);
    same('and the last 600.30 pays it off exactly',
        (answer => [answer.ok, answer.dueAfter])(F('planPayment', R, 'ps_w_round_20261002', 600.3, { paymentId: 'pp_smalllast01' },
            stamp('2026-10-18'))), [true, 0]);
    check('every figure the fold reports is a whole number of agorot',
        [rounded.owed, rounded.paid, rounded.due].every(value => Math.round(value * 100) / 100 === value));
}

// ---------------------------------------------------------------- the migration report
{
    suite('the migration: a report that writes nothing');

    const d = world({ today: '2026-10-16',
        days: [['w_nasser', '2026-09-20'], ['w_nasser', '2026-09-21']],
        advances: [['w_khaled', '2026-10-03', 500]] });
    // A closure made the way the app makes one today, before any of this existed.
    given('an old-style closure is written through the journal', d.State.commitMany(d.call('closePeriodChanges',
        d.State.schedule, 'w_khaled', FORTNIGHT.from, FORTNIGHT.to, '2026-10-16T08:00:00.000Z', d.id, 200)) === true);
    const S = clone(d.State.schedule);
    // An advance only the old field knows (another phone, not yet mirrored), and one the
    // boot mirror migrated: its origin says `at: ''` because nobody knows when it was written.
    S.advances.a_onlyfield = { id: 'a_onlyfield', workerId: 'w_salim', date: '2026-10-05', amount: 300, note: '' };
    S.advances.a_migrated1 = { id: 'a_migrated1', workerId: 'w_salim', date: '2026-09-01', amount: 200, note: '' };
    S.ledger.advances.le_mig_a_migrated1 = { id: 'le_mig_a_migrated1', advanceId: 'a_migrated1', kind: 'given',
        workerId: 'w_salim', date: '2026-09-01', amount: 200, note: '', at: '', by: 'd_old', origin: 'migration' };
    const recorded = advancesOf(S, 'w_khaled')[0];

    const bytes = JSON.stringify(S);
    const reportNow = F('planPayMigration', S, '2026-10-16');
    same('the report changes no byte of the schedule', JSON.stringify(S) === bytes, true);
    same('it says so itself: no changes, no writes', [reportNow.changes, reportNow.writes], [[], 0]);
    check('and there is no function that applies it', ['applyPayMigration', 'runPayMigration', 'migratePay', 'payMigrate']
        .every(name => calc.ctx[name] === undefined) && !/function\s+\w*apply\w*Migration/i.test(PAYROLL));

    same('an existing closure is "payment unknown" - never read as paid, never as owed',
        reportNow.closures.map(row => [row.workerId, row.periodFrom, row.periodTo, row.gross, row.deducted, row.net, row.payment, row.answerable]),
        [['w_khaled', FORTNIGHT.from, FORTNIGHT.to, 4400, 200, 4200, 'unknown', true]]);
    same('it is on the review list', reportNow.paymentUnknown.map(row => row.artifactId), ['le_period_w_khaled_20261002']);
    const account = F('accountFor', S, 'w_khaled', '2026-10-16');
    same('and in his account it is neither wage owed nor a status of paid',
        [account.wageDue, account.paymentUnknown.map(row => [row.periodFrom, row.gross, row.deducted]), account.status],
        [0, [[FORTNIGHT.from, 4400, 200]], 'open']);
    same('with no activation, every unclosed period is "before tracking" and nothing is called waiting',
        [reportNow.opening, reportNow.unclosed.filter(row => row.tracking === 'inside').length,
            reportNow.unclosed.map(row => [row.workerId, row.from, row.gross])],
        [null, 0, [['w_ahmad', WEEK1.from, 1800], ['w_ahmad', WEEK2.from, 2000], ['w_nasser', '2026-09-18', 1000],
            ['w_nasser', FORTNIGHT.from, 3000], ['w_salim', FORTNIGHT.from, 3600]]]);
    same('advances: what the record can say about each',
        reportNow.advances.map(row => [row.advanceId, row.given, row.left, row.history, row.allocation]),
        [['a_migrated1', 200, 200, 'migrated', 'untouched'], ['a_onlyfield', 300, 300, 'unmirrored', 'untouched'],
            [recorded, 500, 300, 'recorded', 'recorded']].sort((a, b) => (a[0] < b[0] ? -1 : 1)));
    same('the existing checks ride along unchanged', [reportNow.impossibleClosures, reportNow.advancesWithoutOrigin], [[], []]);

    // Activated: the classification moves, the old closure does not.
    const active = applied(S, F('planOpening', S, OPENING, stamp('2026-10-16')), 'the activation');
    const reportThen = F('planPayMigration', active, '2026-10-16');
    same('once activated: periods from the activation period on are inside tracking, older ones stay before it',
        reportThen.unclosed.map(row => [row.workerId, row.from, row.tracking]),
        [['w_ahmad', WEEK1.from, 'inside'], ['w_ahmad', WEEK2.from, 'inside'], ['w_nasser', FORTNIGHT.from, 'inside'],
            ['w_nasser', '2026-09-18', 'before'], ['w_salim', FORTNIGHT.from, 'inside']]);
    same('the closure made before is still "payment unknown"', reportThen.paymentUnknown.length, 1);
    check('a period before tracking is not closable through the new path',
        (answer => answer.ok === false && answer.reasons.includes('before-tracking'))(
            F('planClosure', active, 'w_nasser', { from: '2026-09-18', to: '2026-10-01' }, {}, stamp('2026-10-16'))));

    // The owner answers, one closure at a time.
    const owed = applied(active, F('planLegacy', active, 'w_khaled', FORTNIGHT.from, { state: 'due', due: 1200, note: 'נשאר חייב' },
        stamp('2026-10-17')), 'an answer: still owed 1,200');
    const answered = F('accountFor', owed, 'w_khaled', '2026-10-17');
    same('"still owes 1,200" becomes wage owed, by a person\'s word and no other way',
        [answered.wageDue, answered.paymentUnknown, answered.unpaid.map(row => [row.statementId, row.due, row.status])],
        [1200, [], [['pl_le_period_w_khaled_20261002', 1200, 'legacy-due']]]);
    const settled = applied(owed, F('planPayment', owed, 'pl_le_period_w_khaled_20261002', 1200, { paymentId: 'pp_legacy000001' },
        stamp('2026-10-18')), 'paying the old debt');
    same('and it can then be paid like any other', [F('accountFor', settled, 'w_khaled', '2026-10-18').wageDue,
        F('planPayMigration', settled, '2026-10-18').closures[0].payment], [0, 'answered-due']);
    const paidWord = applied(active, F('planLegacy', active, 'w_khaled', FORTNIGHT.from, { state: 'paid' }, stamp('2026-10-17')), 'an answer: paid');
    same('"paid" clears it from the review list and adds nothing to anything',
        [F('accountFor', paidWord, 'w_khaled', '2026-10-17').wageDue, F('planPayMigration', paidWord, '2026-10-17').paymentUnknown,
            F('closureHistory', paidWord, { workerId: 'w_khaled' })[0].status], [0, [], 'legacy-paid']);
}

// ---------------------------------------------------------------- agreement with what exists
{
    suite('with no pay records at all, the new model says what the app already says');

    const d = world({ advances: [['w_khaled', '2026-10-03', 500], ['w_khaled', '2026-10-06', 400],
        ['w_ahmad', '2026-10-03', 500], ['w_nasser', '2026-10-05', 800]] });
    // Two closures the app's own way, and a repayment.
    given('the weekly man\'s week 1 is closed the existing way', d.State.commitMany(d.call('closePeriodChanges', d.State.schedule,
        'w_ahmad', WEEK1.from, WEEK1.to, '2026-10-09T08:00:00.000Z', d.id, 200)) === true);
    given('a fortnight is closed the existing way', d.State.commitMany(d.call('closePeriodChanges', d.State.schedule,
        'w_khaled', FORTNIGHT.from, FORTNIGHT.to, '2026-10-16T08:00:00.000Z', d.id, 700)) === true);
    const repaidId = advancesOf(d.State.schedule, 'w_nasser')[0];
    given('a repayment is recorded', d.State.commitMany([d.call('recordAdvanceRepaid', d.State.schedule, repaidId, 300,
        '2026-10-12', 'מזומן', '2026-10-12T09:00:00.000Z', d.id, 'cash')]) === true);
    const S = clone(d.State.schedule);
    // v173: the map exists on every record and is empty on this one - see the Phase 0 pin.
    given('the record carries no pay entry', JSON.stringify(S.pay) === '{}' && S.payConflicted === undefined);

    const workers = ['w_ahmad', 'w_khaled', 'w_nasser', 'w_salim'];
    const days = ['2026-10-05', '2026-10-08', '2026-10-12', '2026-10-15', '2026-10-16', '2026-10-30'];
    const disagreements = [];
    days.forEach(today => workers.forEach(workerId => {
        const account = F('accountFor', S, workerId, today);
        const worker = S.workers.find(item => item.id === workerId);
        const period = F('periodRangeFor', worker, today);
        const row = rowOf(S, period.from, period.to, workerId);
        const walk = F('advanceAccount', S, workerId, period.from, period.to);
        const debt = advancesOf(S, workerId).reduce((sum, id) => sum + leftOf(S, id), 0);
        const said = F('openAdvanceBalance', S, workerId);
        const mine = [account.current.from, account.current.to, account.cycle, account.current.gross,
            account.current.attendanceDays, account.current.closed, account.debt,
            account.running, account.wageDue, account.unpaid.length];
        const theirs = [period.from, period.to, period.cycle, row.amount, row.attendanceDays, walk.closed, debt,
            walk.closed ? 0 : row.amount, 0, 0];
        if (JSON.stringify(mine) !== JSON.stringify(theirs)
            || (said ? said.total : 0) !== account.debt) {
            disagreements.push({ today, workerId, mine, theirs, said });
        }
    }));
    same('for every man on six different days: period, cycle, wage, days, closed, debt - shekel for shekel',
        disagreements, []);

    const history = F('closureHistory', S, {});
    same('every existing closure is in the history with the figures its artifact froze',
        history.map(row => [row.workerId, row.periodFrom, row.periodTo, row.gross, row.advanceDeducted, row.netDue,
            row.debtAfter, row.status, row.source]),
        [['w_ahmad', WEEK1.from, WEEK1.to, 1800, 200, 1600, 300, 'unknown', 'artifact'],
            ['w_khaled', FORTNIGHT.from, FORTNIGHT.to, 4400, 700, 3700, 200, 'unknown', 'artifact']]);
    same('the history\'s figures are the existing readers\' figures',
        history.map(row => (walk => [row.gross === walk.gross, row.advanceDeducted === walk.deducted,
            row.netDue === walk.net, row.debtAfter === walk.carriedOut])(
            F('advanceAccount', S, row.workerId, row.periodFrom, row.periodTo))),
        [[true, true, true, true], [true, true, true, true]]);
    same('how the app split the 700 it was given (oldest first) is readable per advance',
        history.find(row => row.workerId === 'w_khaled').advanceDeductions.map(one => [one.amount, one.before, one.after])
            .sort((a, b) => b[0] - a[0]), [[500, 500, 0], [200, 400, 200]]);
    same('nothing is counted as paid and nothing as owed', history.map(row => [row.paid, row.due]), [[null, null], [null, null]]);
    same('the list totals agree with the sum of what the report and the one fold say',
        F('accountsList', S, '2026-10-12', {}).totals,
        { running: 2000 + 0 + 3000 + 3600, wageDue: 0, debt: 300 + 200 + 500 });

    // THE LEDGER HALF OF A NEW CLOSURE IS ACCEPTED BY TODAY'S JOURNAL AND TODAY'S READERS.
    // The `pay.*` half is stored since v173 and is tests/paybook.store.test.mjs's subject;
    // this is the part every phone in the field already reads, through today's own doors.
    const live = world({ advances: [['w_khaled', '2026-10-03', 500], ['w_khaled', '2026-10-06', 400], ['w_khaled', '2026-10-10', 300]] });
    const L0 = opened(live);
    const [k1, k2, k3] = advancesOf(L0, 'w_khaled');
    const plan = F('planClosure', L0, 'w_khaled', FORTNIGHT, { allocations: { [k1]: 100, [k2]: 300, [k3]: 300 } }, stamp('2026-10-16'));
    const ledgerHalf = plan.changes.filter(change => change.path.startsWith('ledger.'));
    given('the plan is allowed', plan.ok === true && ledgerHalf.length === 4);
    same('today\'s journal takes the person\'s per-advance split in one batch', live.State.commitMany(clone(ledgerHalf)), true);
    const reopened = makeDevice({ storage: live.dump() });
    reopened.State.load();
    same('and after a reopen - on a device with the SHIPPED flags - the phone is not blocked, holds nothing unreadable and calls no closure impossible',
        [reopened.call('farkadWritesBlocked'), Object.keys(reopened.State.schedule.ledger.unreadable || {}),
            reopened.call('impossibleClosures', reopened.State.schedule),
            [k1, k2, k3].map(id => reopened.call('advanceOutstanding', reopened.State.schedule, id).left)],
        [false, [], [], [400, 100, 0]]);
}

// ---------------------------------------------------------------- the history
{
    suite('closure history: every closure, searchable, and nothing in it edited');

    const d = world({ advances: [['w_khaled', '2026-10-03', 500], ['w_ahmad', '2026-10-03', 500]] });
    const S0 = opened(d);
    const kAdv = advancesOf(S0, 'w_khaled')[0];
    const aAdv = advancesOf(S0, 'w_ahmad')[0];
    let S = applied(S0, F('planClosure', S0, 'w_ahmad', WEEK1, { allocations: { [aAdv]: 200 }, paid: 1600 },
        stamp('2026-10-09', 'd_boss', '12')), 'Ahmad week 1');
    S = applied(S, F('planClosure', S, 'w_ahmad', WEEK2, { allocations: { [aAdv]: 0 } }, stamp('2026-10-16', 'd_boss', '12')), 'Ahmad week 2');
    S = applied(S, F('planClosure', S, 'w_khaled', FORTNIGHT, { allocations: { [kAdv]: 500 },
        extras: [{ amount: 90, category: 'settlement', reason: 'הסדר' }], paid: 1000 }, stamp('2026-10-17', 'd_other', '12')), 'Khaled');
    S = applied(S, F('planClosure', S, 'w_salim', FORTNIGHT, {}, stamp('2026-10-18', 'd_boss', '12')), 'Salim');

    const keys = rows => rows.map(row => `${row.workerId}:${row.periodFrom}`);
    same('every closure, newest period first and by name within a period',
        keys(F('closureHistory', S, {})), ['w_ahmad:2026-10-09', 'w_ahmad:2026-10-02', 'w_khaled:2026-10-02', 'w_salim:2026-10-02']);
    same('by worker', keys(F('closureHistory', S, { workerId: 'w_ahmad' })), ['w_ahmad:2026-10-09', 'w_ahmad:2026-10-02']);
    same('by part of a name', keys(F('closureHistory', S, { text: 'אלד' })), ['w_khaled:2026-10-02']);
    same('by cycle type', [keys(F('closureHistory', S, { cycle: 'weekly' })), F('closureHistory', S, { cycle: 'biweekly' }).length],
        [['w_ahmad:2026-10-09', 'w_ahmad:2026-10-02'], 2]);
    same('by the day the closure was made', keys(F('closureHistory', S, { closedFrom: '2026-10-17', closedTo: '2026-10-17' })),
        ['w_khaled:2026-10-02']);
    same('by a range of closing days', F('closureHistory', S, { closedFrom: '2026-10-16' }).length, 3);
    same('by work period', keys(F('closureHistory', S, { periodFrom: '2026-10-09', periodTo: '2026-10-15' })).sort(),
        ['w_ahmad:2026-10-09', 'w_khaled:2026-10-02', 'w_salim:2026-10-02']);
    same('by payment status', ['paid', 'partial', 'closed', 'unknown'].map(status => keys(F('closureHistory', S, { status })).sort()),
        [['w_ahmad:2026-10-02'], ['w_khaled:2026-10-02'], ['w_ahmad:2026-10-09', 'w_salim:2026-10-02'], []]);
    same('searches combine', keys(F('closureHistory', S, { cycle: 'weekly', status: 'closed' })), ['w_ahmad:2026-10-09']);

    const row = F('closureHistory', S, { workerId: 'w_khaled' })[0];
    same('one closure\'s full summary: which advance, how much came off it, how much remained, and the rest',
        [row.name, row.cycle, row.periodFrom, row.periodTo, row.closedOn, row.closedBy, row.gross,
            row.advanceDeductions.map(one => [one.advanceId, one.amount, one.before, one.after, one.leftNow]),
            row.extras.map(one => [one.amount, one.category, one.reason]), row.netDue,
            row.payments.map(one => [one.date, one.amount]), row.paid, row.due, row.debtAfter, row.status, row.source],
        ['חאלד', 'biweekly', FORTNIGHT.from, FORTNIGHT.to, '2026-10-17', 'd_other', 4400,
            [[kAdv, 500, 500, 0, 0]], [[90, 'settlement', 'הסדר']], 3810, [['2026-10-17', 1000]], 1000, 2810, 0, 'partial', 'statement']);
    same('the weekly man\'s partial deduction: 200 came off at week 1 and 300 remained; week 2 took nothing',
        F('closureHistory', S, { workerId: 'w_ahmad' }).map(one => [one.periodFrom,
            one.advanceDeductions.map(item => [item.amount, item.after]), one.debtAfter]),
        [[WEEK2.from, [], 300], [WEEK1.from, [[200, 300]], 300]]);

    // "Reset" deletes nothing: across everything above, no entry was removed or rewritten.
    const before = clone(S0);
    const kept = Object.keys(before.ledger.advances).every(id =>
        JSON.stringify(S.ledger.advances[id]) === JSON.stringify(before.ledger.advances[id]))
        && Object.keys(before.pay).every(id => JSON.stringify(S.pay[id]) === JSON.stringify(before.pay[id]))
        && JSON.stringify(S.days) === JSON.stringify(before.days)
        && JSON.stringify(S.advances) === JSON.stringify(before.advances);
    check('closing and "resetting" four accounts deleted nothing and rewrote nothing: every earlier entry, day and advance is byte-identical',
        kept && Object.keys(S.ledger.advances).length > Object.keys(before.ledger.advances).length);
    same('paybookApply refuses a deletion and a path it does not know, and says which',
        F('paybookApply', S, [{ path: 'pay.ps_w_khaled_20261002', value: null },
            { path: 'days.2026-10-02.actual.w_khaled', value: null }, { path: 'pay.__proto__', value: { id: '__proto__' } }]).refused,
        ['pay.ps_w_khaled_20261002', 'days.2026-10-02.actual.w_khaled', 'pay.__proto__']);
}

report();
