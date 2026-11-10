// ONE DEBT: an advance from a period nobody closed stays owed until somebody deducts it.
//
//   node tests/debt.ruling.test.mjs
//
// THE OWNER'S RULING, 2026-11-10. Until it, one record gave two answers: the advance's own
// card said «נשאר: 500» (advanceOutstanding - nothing was ever recorded against it) while
// the account walk had counted the 500 as taken from the wage of the fortnight it was given
// in, carried nothing, and refused to let a later closure deduct it. The ruling picks the
// card's answer. It is behind the pay book's gate (advanceDebtStays in js/model/schema.js),
// so what a person has installed still computes the old walk, and this suite runs both
// builds side by side:
//
//   history        the old walk, on a device built exactly as shipped - so the change is visible
//   the ruling     the same record on a device with the gate open: one answer, and the
//                  old advance can be deducted at a later closure, by the existing dialog too
//   one answer     seeded random records: the carry into EVERY account equals the sum of
//                  what advanceOutstanding says was left the day before it opens
//   frozen         a closed account's own figures are the same bytes and the same numbers
//                  under both rules, whenever it was closed and whatever came after
//   the report     planDebtRuling: what it says on a fixture, that it says the same on
//                  either build, and that it writes nothing
//
// Synthetic data only.

import { makeDevice } from './harness.mjs';
import { suite, check, same, given, report } from './runner.mjs';

const clone = value => JSON.parse(JSON.stringify(value));
const SHUT = makeDevice({ deviceId: 'd_shut' });                          // as installed
const OPEN = makeDevice({ deviceId: 'd_open', flags: { paybook: true } });  // the gate open

// 2026-08-07 is a Friday that opens a fortnight; so are 08-21, 09-04, 09-18 and 10-02.
const F1 = { from: '2026-08-07', to: '2026-08-20' };
const F2 = { from: '2026-08-21', to: '2026-09-03' };
const F3 = { from: '2026-09-04', to: '2026-09-17' };
const F4 = { from: '2026-09-18', to: '2026-10-01' };

const step = (day, n) => OPEN.call('advanceDayStep', day, n);

// A record built with the model's own writers on a plain schedule: the roster, a worked
// day at a time through assignPlace, an advance through recordNewAdvance. Nothing here
// goes near a disk - every function under test takes the schedule as its argument.
function record(workers) {
    const S = clone(OPEN.call('emptySchedule'));
    S.workers = workers;
    S.places = [{ id: 'p_a', name: 'אילון', active: true }];
    return S;
}
const work = (S, worker, days) => days.forEach(day =>
    OPEN.call('assignPlace', S, day, worker, 'actual', 'p_a', undefined, 0));
const advance = (S, worker, date, amount) => {
    const made = OPEN.call('recordNewAdvance', S, worker, date, amount, 'בדיקה', `${date}T09:00:00.000Z`, 'd_boss', 'cash');
    given('an advance is recorded', Array.isArray(made) && made.length > 0, JSON.stringify(made));
    const all = OPEN.call('currentAdvances', S);
    return Object.keys(all).filter(id => all[id].workerId === worker && all[id].date === date
        && all[id].amount === amount).sort().pop();
};
const repay = (S, id, amount, date) => given('a repayment is recorded',
    Boolean(OPEN.call('recordAdvanceRepaid', S, id, amount, date, '', `${date}T10:00:00.000Z`, 'd_boss', 'cash')));
const closeWith = (device, S, worker, period, deduction, at) => {
    const made = device.call('closePeriodChanges', S, worker, period.from, period.to,
        at || `${step(period.to, 1)}T08:00:00.000Z`, 'd_boss', deduction);
    return made.length;
};
const left = (S, id) => OPEN.call('advanceOutstanding', S, id).left;
const daysOf = (period, n) => Array.from({ length: n }, (_, at) => step(period.from, at + 2));

const KHALED = { id: 'w_k', name: 'חאלד', active: true, dailyRate: 350, hourlyRate: 0 };
const AHMAD = { id: 'w_a', name: 'אחמד', active: true, dailyRate: 300, hourlyRate: 0, payCycles: '2026-08-07=weekly' };

// ---------------------------------------------------------------- history, and the ruling
{
    suite('history: the walk a build with the gate shut still computes');

    // Two days (700) in a fortnight nobody closes, and 500 handed over in it.
    const S = record([clone(KHALED)]);
    work(S, 'w_k', daysOf(F1, 2));
    work(S, 'w_k', daysOf(F2, 4));
    const a1 = advance(S, 'w_k', '2026-08-10', 500);

    same('the shipped flag is shut, and the rule follows it and nothing else',
        [SHUT.call('paybookWritesEnabled'), SHUT.call('advanceDebtStays'), OPEN.call('advanceDebtStays')],
        [false, false, true]);
    same('HISTORY: 500 left on the advance, and nothing carried into the next account',
        [SHUT.call('advanceOutstanding', S, a1).left, SHUT.call('advanceCarryInto', S, 'w_k', F2.from)], [500, 0]);
    const before = SHUT.call('advanceAccount', S, 'w_k', F2.from, F2.to);
    same('HISTORY: so the next account opens on 0, proposes no deduction and nets its whole wage',
        [before.carriedIn, before.deducted, before.net, before.carriedForward], [0, 0, 1400, 0]);
    const refused = SHUT.call('planPeriodClosure', S, 'w_k', F2.from, F2.to, '2026-09-04T08:00:00.000Z', 300);
    same('HISTORY: and a person who wants 300 of it off the later wage is refused',
        [refused.canClose, refused.reasons.includes('deduction')], [false, true]);

    suite('the ruling: the debt stays until somebody deducts it');

    same('one answer: 500 left on the advance and 500 carried into the next account',
        [left(S, a1), OPEN.call('advanceCarryInto', S, 'w_k', F2.from)], [500, 500]);
    const after = OPEN.call('advanceAccount', S, 'w_k', F2.from, F2.to);
    same('the next account opens on 500; what the sheet PROPOSES is the whole of it, off a wage of 1,400',
        [after.carriedIn, after.deducted, after.net, after.carriedForward], [500, 500, 900, 0]);
    const plan = OPEN.call('planPeriodClosure', S, 'w_k', F2.from, F2.to, '2026-09-04T08:00:00.000Z', 300);
    same('the existing dialog lets 300 of the old advance come off the later wage',
        [plan.canClose, plan.reasons, plan.rows.map(row => [row.advanceId === a1, row.amount, row.balanceAfter])],
        [true, [], [[true, 300, 200]]]);
    const closed = clone(S);
    given('the later account closes with 300', closeWith(OPEN, closed, 'w_k', F2, 300) === 2);
    same('after it: 200 left on the advance and 200 carried into the account after that',
        [left(closed, a1), OPEN.call('advanceCarryInto', closed, 'w_k', F3.from)], [200, 200]);
    same('the judge every door applies to an arriving closure finds nothing wrong with it',
        OPEN.call('impossibleClosures', closed), []);
    same('and a build with the gate SHUT judges that same closure sound too - the judge never asked the walk',
        SHUT.call('impossibleClosures', closed), []);

    // CLOSED OUT OF ORDER. The period the advance was given in can still be closed
    // afterwards - and what the later closure already took is not offered a second time.
    // Measured before advanceLiveRoom existed: this plan answered canClose with the whole
    // 500, 800 off a 500 advance.
    const again = OPEN.call('planPeriodClosure', closed, 'w_k', F1.from, F1.to, '2026-09-05T08:00:00.000Z', 500);
    same('the earlier account, closed afterwards, may not take the 500 again',
        [again.canClose, again.reasons.includes('deduction')], [false, true]);
    const rest = OPEN.call('planPeriodClosure', closed, 'w_k', F1.from, F1.to, '2026-09-05T08:00:00.000Z', 200);
    same('it may take the 200 that is still on the advance, and no more is proposed',
        [rest.canClose, rest.rows.map(row => [row.amount, row.balanceAfter]),
            OPEN.call('advanceAccount', closed, 'w_k', F1.from, F1.to).deducted], [true, [[200, 300]], 200]);
    // (300, not 0: the entry's carried balance is the advance as it stood on THAT
    // account's last day - 500 - less the 200, which is the figure the judge recomputes.
    // What is left on the advance today is the fold's answer, below.)
    const both = clone(closed);
    given('the earlier account closes with the 200, on the day it is actually pressed',
        closeWith(OPEN, both, 'w_k', F1, 200, '2026-09-05T08:00:00.000Z') === 2);
    same('after both closures the advance is settled exactly: 500 given, 500 deducted, nothing left, nothing over',
        (state => [state.given, state.deducted, state.left, state.overpaid])(OPEN.call('advanceOutstanding', both, a1)),
        [500, 500, 0, 0]);
    same('and neither build\'s judge holds either closure aside',
        [OPEN.call('impossibleClosures', both), SHUT.call('impossibleClosures', both)], [[], []]);
    // The same order through cash: 300 handed back in September, then August closed.
    const cash = clone(S);
    repay(cash, a1, 300, '2026-08-25');
    const afterCash = OPEN.call('planPeriodClosure', cash, 'w_k', F1.from, F1.to, '2026-09-05T08:00:00.000Z', 500);
    same('and a repayment dated after the account is the same cap: 200 may come off, 500 may not (the shut build still allows the 500)',
        [afterCash.canClose, OPEN.call('advanceAccount', cash, 'w_k', F1.from, F1.to).deducted,
            SHUT.call('planPeriodClosure', cash, 'w_k', F1.from, F1.to, '2026-09-05T08:00:00.000Z', 500).canClose],
        [false, 200, true]);

    // A repayment is the other thing that ends a debt, and it is one answer too.
    const paidBack = clone(S);
    repay(paidBack, a1, 200, '2026-08-25');
    same('200 handed back in the next fortnight: 300 left, and 300 is what that account proposes and the one after carries nothing of',
        [left(paidBack, a1), OPEN.call('advanceAccount', paidBack, 'w_k', F2.from, F2.to).deducted,
            OPEN.call('advanceCarryInto', paidBack, 'w_k', F2.from)], [300, 300, 500]);

    // A man settled every Thursday: stepped in HIS weeks, the same rule.
    const W = record([clone(AHMAD)]);
    work(W, 'w_a', ['2026-08-09', '2026-08-16', '2026-08-23']);
    const w1 = advance(W, 'w_a', '2026-08-09', 400);
    same('a weekly man: 400 from a week nobody closed is carried whole through his next two weeks',
        [left(W, w1), OPEN.call('advanceCarryInto', W, 'w_a', '2026-08-14'), OPEN.call('advanceCarryInto', W, 'w_a', '2026-08-21'),
            SHUT.call('advanceCarryInto', W, 'w_a', '2026-08-14')], [400, 400, 400, 100]);
}

// ---------------------------------------------------------------- one answer, on random records
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
    suite('one answer: the carry into every account is what the advances say was left, on seeded random records');

    const FIRST = '2026-08-07';
    const LAST = '2026-10-29';
    let cases = 0;
    let accounts = 0;
    let unclosedWithDebt = 0;
    let closures = 0;
    let lateDeductions = 0;
    const wrong = [];
    const frozenMoved = [];
    const oldAbove = [];
    const judged = [];

    for (let seed = 1; seed <= 60; seed += 1) {
        const rnd = mulberry(seed * 7919);
        const pick = n => Math.floor(rnd() * n);
        const man = seed % 2 === 0 ? clone(AHMAD) : clone(KHALED);
        const S = record([man]);
        const id = man.id;
        const mine = [];
        const frozenAt = {};
        let day = FIRST;
        let period = OPEN.call('periodRangeFor', man, FIRST);
        while (day <= LAST) {
            if (rnd() < 0.6) work(S, id, [day]);
            if (rnd() < 0.12) mine.push(advance(S, id, day, (pick(9) + 1) * 100));
            if (mine.length > 0 && rnd() < 0.08) {
                const target = mine[pick(mine.length)];
                const room = left(S, target);
                if (room >= 50) repay(S, target, Math.min(room, (pick(4) + 1) * 50), day);
            }
            if (day === period.to) {
                // Half the accounts are never closed. The other half close on a figure a
                // person chose: anything from nothing to all the walk allows.
                if (rnd() < 0.5) {
                    const most = OPEN.call('planPeriodClosure', S, id, period.from, period.to,
                        `${step(period.to, 1)}T08:00:00.000Z`, undefined);
                    if (most.canClose) {
                        const chosen = Math.floor(most.deducted * pick(5) / 4);
                        const carried = OPEN.call('advanceCarryInto', S, id, period.from);
                        const given0 = OPEN.call('advancesTotal', S, id, period.from, period.to);
                        if (closeWith(OPEN, S, id, period, chosen) > 0) {
                            closures += 1;
                            if (chosen > given0 && carried > 0) lateDeductions += 1;
                            frozenAt[period.from] = JSON.stringify(
                                (row => [row.carriedIn, row.gross, row.deducted, row.carriedOut, row.net, row.closed])(
                                    OPEN.call('advanceAccount', S, id, period.from, period.to)));
                        }
                    }
                }
                period = OPEN.call('nextPeriodFor', man, period.from);
            }
            day = step(day, 1);
        }
        cases += 1;

        // Every account of his, start to finish, and the one after the last.
        let at = OPEN.call('periodRangeFor', man, FIRST);
        for (let n = 0; n < 40 && at.from <= step(LAST, 14); n += 1) {
            accounts += 1;
            const carry = OPEN.call('advanceCarryInto', S, id, at.from);
            const eve = step(at.from, -1);
            const recorded = Math.round(mine.filter(a => OPEN.call('currentAdvances', S)[a].date < at.from)
                .reduce((sum, a) => sum + OPEN.call('outstandingWithout', S, a, null, eve).left, 0) * 100) / 100;
            if (carry !== recorded) wrong.push([seed, at.from, carry, recorded]);
            const old = OPEN.call('advanceCarryIntoUnder', S, id, at.from, false);
            if (old > carry) oldAbove.push([seed, at.from, old, carry]);
            if (old !== SHUT.call('advanceCarryInto', S, id, at.from)) oldAbove.push([seed, at.from, 'shut build differs']);
            const row = OPEN.call('advanceAccount', S, id, at.from, at.to);
            if (!row.closed && carry + row.given > 0) unclosedWithDebt += 1;
            if (row.closed) {
                const now = JSON.stringify([row.carriedIn, row.gross, row.deducted, row.carriedOut, row.net, row.closed]);
                const shut = (r => JSON.stringify([r.carriedIn, r.gross, r.deducted, r.carriedOut, r.net, r.closed]))(
                    SHUT.call('advanceAccount', S, id, at.from, at.to));
                if (now !== frozenAt[at.from] || shut !== frozenAt[at.from]) frozenMoved.push([seed, at.from, frozenAt[at.from], now, shut]);
            }
            at = OPEN.call('nextPeriodFor', man, at.from);
        }
        const bad = OPEN.call('impossibleClosures', S).concat(SHUT.call('impossibleClosures', S));
        if (bad.length > 0) judged.push([seed, bad]);
    }

    given('the generator produced what the claim is about',
        cases === 60 && closures > 40 && unclosedWithDebt > 100 && lateDeductions > 5,
        JSON.stringify({ cases, accounts, closures, unclosedWithDebt, lateDeductions }));
    same(`the carry into each of ${accounts} accounts equals the sum of advanceOutstanding the day before it opens`, wrong.slice(0, 3), []);
    same('the old walk never carried MORE than the ruling does, and by name it is what the shut build computes', oldAbove.slice(0, 3), []);
    same(`every closed account (${closures} closures) reads the figures it was closed on, on both builds, whatever came after`,
        frozenMoved.slice(0, 2), []);
    same('and no closure written under the ruling is one either build\'s judge would hold aside', judged.slice(0, 2), []);
    check('a deduction of an advance from an earlier, never-closed account happened in these records - the case the ruling exists for',
        lateDeductions > 5, String(lateDeductions));
}

// ---------------------------------------------------------------- a closed account never changes
{
    suite('frozen: a closure made BEFORE the ruling is not recomputed by it');

    // F1 is never closed and holds a 500 advance; F2 is closed, by a phone with the gate
    // shut, on the old walk: carried in 0, nothing deducted.
    const S = record([clone(KHALED)]);
    work(S, 'w_k', daysOf(F1, 2));
    work(S, 'w_k', daysOf(F2, 4));
    work(S, 'w_k', daysOf(F3, 3));
    const a1 = advance(S, 'w_k', '2026-08-10', 500);
    given('the old build closes the second fortnight with nothing deducted', closeWith(SHUT, S, 'w_k', F2, 0) === 1);
    const artifact = JSON.stringify(S.ledger.advances.le_period_w_k_20260821);
    const figures = row => [row.carriedIn, row.gross, row.deducted, row.carriedOut, row.net, row.closed];
    const then = SHUT.call('advanceAccount', S, 'w_k', F2.from, F2.to);
    const now = OPEN.call('advanceAccount', S, 'w_k', F2.from, F2.to);
    same('the frozen payslip: opened on 0, 1,400 earned, 0 deducted, closed on 0 - under the old rule',
        figures(then), [0, 1400, 0, 0, 1400, true]);
    same('and exactly the same six figures under the ruling', figures(now), figures(then));
    same('the artifact on the record is byte for byte what was written', JSON.stringify(S.ledger.advances.le_period_w_k_20260821), artifact);
    same('what moves is only what was never frozen: the money the NEXT account opens owing - 0 then, 500 now',
        [then.carriedForward, now.carriedForward, SHUT.call('advanceCarryInto', S, 'w_k', F3.from),
            OPEN.call('advanceCarryInto', S, 'w_k', F3.from), left(S, a1)], [0, 500, 0, 500, 500]);
    // KNOWN, and Phase 4's to word: the closed row's note is built from carriedForward -
    // carriedOut, so under the ruling it reads as a movement that arrived after the close.
    same('KNOWN: the closed row\'s "late since close" figure becomes the old debt (0 then, 500 now) - a note to reword, not money',
        [then.lateSinceClose, now.lateSinceClose], [0, 500]);
    const next = OPEN.call('planPeriodClosure', S, 'w_k', F3.from, F3.to, '2026-09-18T08:00:00.000Z', 500);
    same('and the third fortnight can take the 500 off its 1,050', [next.canClose, next.deducted, next.gross], [true, 500, 1050]);
}

// ---------------------------------------------------------------- the report
{
    suite('planDebtRuling: what would change, and nothing written');

    // KHALED: 500 in F1 (700 earned, never closed), 300 in F2 (1,400 earned, never closed),
    //         F3 closed by the old build with 0; today is in F4.
    // AHMAD (weekly): 400 in a week he earned 300 in, never closed.
    // SALIM: an advance in the account that is still open - nothing of his moves.
    const S = record([clone(KHALED), clone(AHMAD), { id: 'w_s', name: 'סלים', active: true, dailyRate: 400, hourlyRate: 0 }]);
    work(S, 'w_k', daysOf(F1, 2));
    work(S, 'w_k', daysOf(F2, 4));
    work(S, 'w_k', daysOf(F3, 3));
    work(S, 'w_k', daysOf(F4, 2));
    work(S, 'w_a', ['2026-09-20']);
    work(S, 'w_s', ['2026-09-22']);
    const k1 = advance(S, 'w_k', '2026-08-10', 500);
    const k2 = advance(S, 'w_k', '2026-08-24', 300);
    const m1 = advance(S, 'w_a', '2026-09-20', 400);
    advance(S, 'w_s', '2026-09-22', 250);
    given('the old build closes the third fortnight', closeWith(SHUT, S, 'w_k', F3, 0) === 1);

    const frozen = value => {
        if (value && typeof value === 'object') { Object.keys(value).forEach(key => frozen(value[key])); Object.freeze(value); }
        return value;
    };
    const bytes = JSON.stringify(S);
    const said = OPEN.call('planDebtRuling', frozen(clone(S)), '2026-09-30');
    same('it writes nothing: the record is the same bytes, a deep-frozen record is read without a throw, and it offers no change',
        [JSON.stringify(S) === bytes, said.changes], [true, []]);
    same('it says the same thing twice', JSON.stringify(OPEN.call('planDebtRuling', S, '2026-09-30')), JSON.stringify(said));
    const shutSaid = SHUT.call('planDebtRuling', S, '2026-09-30');
    same('and the same thing on a build with the gate shut, apart from saying which rule that build runs',
        [JSON.stringify(Object.assign({}, shutSaid, { active: true })) === JSON.stringify(said), shutSaid.active, said.active],
        [true, false, true]);

    same('the men it names: the two whose old advances the walk had silently settled, and not the one with nothing unclosed behind him',
        said.workers.map(row => row.workerId), ['w_k', 'w_a']);
    const K = said.workers[0];
    same('KHALED, per advance: 500 assumed taken in the first fortnight, 300 in the second - both still whole on the record',
        K.advances.map(row => [row.advanceId === k1 ? 'k1' : (row.advanceId === k2 ? 'k2' : '?'), row.given, row.left, row.from, row.to, row.assumed]),
        [['k1', 500, 500, F1.from, F1.to, 500], ['k2', 300, 300, F2.from, F2.to, 300]]);
    same('KHALED, the figures that move, old and new - and none of them is a closed account\'s frozen figure',
        K.figures.map(row => [row.figure, row.from, row.closed, row.old, row.new]), [
            ['deducted', F1.from, false, 500, 0],
            ['net', F1.from, false, 200, 700],
            ['carriedForward', F1.from, false, 0, 500],
            ['carriedIn', F2.from, false, 0, 500],
            ['deducted', F2.from, false, 300, 0],
            ['net', F2.from, false, 1100, 1400],
            ['carriedForward', F2.from, false, 0, 800],
            ['lateSinceClose', F3.from, true, 0, 800],
            ['carriedForward', F3.from, true, 0, 800],
            ['carriedIn', F4.from, false, 0, 800],
            ['deducted', F4.from, false, 0, 700],
            ['net', F4.from, false, 700, 0]
        ]);
    same('KHALED, his debt going into the open account: 0 by the old walk, 800 by the ruling, 800 on the advances themselves',
        K.debt, { asOf: F4.from, old: 0, new: 800, recorded: 800 });
    const A = said.workers[1];
    same('AHMAD (weekly): 300 of his 400 was assumed taken in a week nobody closed; 100 carried then, 400 now',
        [A.advances.map(row => [row.advanceId === m1, row.assumed, row.left, row.from, row.to]), A.debt],
        [[[true, 300, 400, '2026-09-18', '2026-09-24']], { asOf: '2026-09-25', old: 100, new: 400, recorded: 400 }]);
    check('no frozen figure of the closed fortnight appears as moved',
        !K.figures.some(row => row.closed && ['carriedIn', 'gross', 'deducted', 'carriedOut', 'net'].includes(row.figure)));

    const clean = record([clone(KHALED)]);
    work(clean, 'w_k', daysOf(F1, 3));
    advance(clean, 'w_k', '2026-08-10', 500);
    given('his only fortnight is closed with everything deducted', closeWith(OPEN, clean, 'w_k', F1, 500) === 2);
    same('a record where every account with a debt was closed has nothing to report',
        OPEN.call('planDebtRuling', clean, '2026-09-30').workers, []);
    same('with no day given it runs to the last day anything of his is dated, so it is a function of the record alone',
        [OPEN.call('planDebtRuling', S).through, OPEN.call('planDebtRuling', S).workers.map(row => [row.workerId, row.through])],
        [null, [['w_k', '2026-09-21']]]);
    same('(the weekly man\'s week is then his open one: nothing behind it, nothing of his to report)',
        OPEN.call('planDebtRuling', S, '2026-09-20').workers.map(row => row.workerId), ['w_k']);
}

report();
