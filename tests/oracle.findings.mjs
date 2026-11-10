// WHERE THE APP AND THE SECOND CALCULATOR PART, written down and left red.
//
//   node tests/oracle.findings.mjs          exits 1 while the finding stands
//
// THIS FILE IS IN NO GATE, on purpose. tests/oracle.test.mjs compares the shipped app
// with tests/oracle.mjs on a few hundred records and is green; the records on which the
// two are KNOWN to disagree are kept out of that comparison by name (`KNOWN` there) and
// proved here instead, on fixtures small enough to check on paper. A red line in
// `npm test` that everybody has learned to expect is a gate nobody reads, so the red
// lives here, where it is the only thing on the page. tests/gate.integrity.test.mjs pins
// that this file exists and that no script reaches it.
//
// Nothing in js/ was changed to make anything here pass or fail. When a finding is
// repaired its checks go green; they then belong in tests/oracle.test.mjs, and its entry
// in `KNOWN` goes with it.
//
// ------------------------------------------------------------------ FINDING 1
//
// A CLOSED PERIOD CAN CARRY FORWARD LESS THAN NOTHING, and what happens to that credit
// depends on which fortnight the man's next advance falls in.
//
// Where: advanceWalk, js/model/schema.js -
//
//     let balance = agoraRound((Number(carriedIn) || 0) + given - ...);
//     if (balance < 0) balance = 0;                      <- floored
//     ...
//     const live = agoraRound(balance - deducted);       <- not floored
//     ... carriedForward: live
//
// On an open period `deducted` is never more than `balance`, so `live` cannot go below
// zero. On a CLOSED one `deducted` is the record of what came off the wage on the day
// it closed, and the balance goes on moving: a repayment dated into the period by a
// phone that was offline, or a correction dated on the advance's own day. When such an
// entry takes the balance below what was already deducted, `live` is negative, and
// advanceCarryInto hands it to the next period as its opening balance.
//
// The rules, both from docs/architecture.md and the block over that code:
//
//   (B) «An overpayment does not become a negative balance, which would quietly add
//       itself to his next wage as though the firm owed him for it.» / «It is his money
//       and he should have it back, but that is a conversation, not an arithmetic
//       result this app may reach on its own.»
//   (A) «The payslip is frozen and the money still moves, into the period that is
//       open» - a late repayment must not «reduce nothing anywhere».
//
// The second calculator reads (B) and carries zero. Somebody could read (A) the other
// way and say the credit should travel. THE APP DOES NEITHER. The credit travels exactly
// one period: if the man takes a new advance in the very next one it is netted against
// it, and if he takes the same advance a period later the credit has already been
// floored away and he owes all of it. The same cash, handed over to the same man, is a
// different debt depending on the week. That is the check that does not depend on which
// rule is taken, and it is the first one below.
//
// And it is written down: a period closed after that carries the negative figure as the
// opening balance on its frozen payslip, and deducts less than the fold says is owed.
//
// How it is reached without anybody doing anything unusual: see the two fixtures.
//
// ------------------------------------------------------------------ FINDING 2
//
// A CLOSE CAN TAKE HALF AN AGORA MORE THAN THE MAN EARNED, AND THE APP THEN CALLS ITS
// OWN CLOSURE IMPOSSIBLE AND STOPS WRITING.
//
// Where: advanceWalk, js/model/schema.js -
//
//     : agoraRound(Math.min(balance, Math.max(gross, 0))));
//
// and closureFacts / recordPeriodClosed in js/model/ledger.js, which record `gross` as
// payrollReport (js/model/money.js) summed it: unrounded.
//
// A wage is days at the daily rate plus hours at the hourly rate, and nothing rounds it.
// Half an hour at 41.25 is 20.625, so a day at 610 with half an extra hour is a wage of
// 630.625 - finer than an agora. When the man owes at least his wage, the deduction is
// the wage ROUNDED to the agora: 630.63. The closure records gross 630.625 and deducted
// 630.63.
//
// The rule (docs/architecture.md): an account «deducts from the wage only what is left
// - never more than the man earned». And the app's own judge agrees with the rule:
// closureProblems reports «a closure deducting more than the wage it came off» for the
// closure this same build has just written, impossibleClosures names it, and at the next
// open normaliseSchedule holds it aside as unreadable and writing is blocked - on the
// phone that pressed the button, over a fortnight nobody disagreed about.
//
// It needs an hourly rate with an odd number of agorot (41.25, 33.33) or hours finer
// than a half, a wage whose fraction rounds UP, and a debt at least as large as the
// wage. It was not found by the comparison - the second calculator refuses to price a
// wage finer than an agora, because how half an agora is rounded is written down
// nowhere - but at the edge of what it would price.

import { makeDevice } from './harness.mjs';
import { suite, check, same, given, report } from './runner.mjs';
import * as oracle from './oracle.mjs';

process.env.TZ = 'Asia/Jerusalem';

const device = makeDevice();
const held = new Map();
const APP = new Proxy({}, { get: (_, name) => {
    if (!held.has(name)) held.set(name, device.global(String(name)));
    return held.get(name);
} });

const clone = value => JSON.parse(JSON.stringify(value));
const shekels = agorot => (agorot === null || agorot === undefined ? agorot : agorot / 100);

// One man on 610 a day, one site, and the carried reading approved - as it is on the
// owner's record since v116.
function base() {
    return {
        schemaVersion: 2,
        workers: [{ id: 'w_d', name: 'דוד', dailyRate: 610, hourlyRate: 0, active: true }],
        places: [{ id: 'p_x', name: 'חיפה', active: true }],
        days: {},
        vehicles: [],
        advances: {},
        ledger: { advances: {}, unreadable: {},
            migrations: { cm_carry: { id: 'cm_carry', kind: 'carry', rows: 0, at: '', by: 'd' } } }
    };
}
function work(record, dates) {
    dates.forEach(date => {
        record.days[date] = { plan: {}, actual: { w_d: { entries: [{ placeId: 'p_x' }],
            rates: { daily: 610, hourly: 0 } } } };
    });
}
function give(record, id, date, amount, at) {
    record.advances[id] = { id, workerId: 'w_d', date, amount, note: '' };
    record.ledger.advances[`le_mig_${id}`] = { id: `le_mig_${id}`, advanceId: id, kind: 'given',
        workerId: 'w_d', date, amount, note: '', at, by: 'd' };
}
function repay(record, id, advanceId, date, amount, at) {
    record.ledger.advances[id] = { id, advanceId, kind: 'repaid', date, amount, note: '', at, by: 'd2' };
}

const P1 = ['2026-08-07', '2026-08-20'];
const P2 = ['2026-08-21', '2026-09-03'];
const P3 = ['2026-09-04', '2026-09-17'];
const FIVE = start => [0, 2, 3, 4, 5].map(n => oracle.addDays(start, n));

// ---------------------------------------------------------------- fixture one
//
// Two phones. דוד earns 3,050 in the account 7-20 August (five days at 610) and takes
// 2,000 on the 10th. On the 15th he hands 500 back to the foreman, whose phone is
// offline. The account is closed on the 20th on the office phone, which has not heard:
// 2,000 comes off his wage and the advance is settled. The foreman's phone syncs on the
// 22nd and the 500 arrives, dated the 15th.
//
// He has now paid 2,500 against 2,000. Both calculators say so: the advance is
// over-settled by 500. What the PERIOD carries forward is the question.
//   by rule (B): 2,000 - 500 = 1,500 owed, 2,000 came off: nothing is owed, and nothing
//   is carried - the 500 is «a conversation».
//   the app: 1,500 - 2,000 = -500, carried into the next account.
{
    suite('finding 1, fixture one: a repayment from an offline phone lands in a closed account');

    const record = base();
    work(record, FIVE(P1[0]));
    give(record, 'a_1', '2026-08-10', 2000, '2026-08-10T09:00:00.000Z');
    const wrote = APP.closePeriodChanges(record, 'w_d', ...P1, '2026-08-20T18:00:00.000Z', 'd');
    given('the account closed, 2,000 off the wage', wrote.length === 2
        && record.ledger.advances.le_close_a_1_20260807.amount === 2000, String(wrote.length));
    repay(record, 'le_late', 'a_1', '2026-08-15', 500, '2026-08-22T08:00:00.000Z');
    given('the record is one the app reads, and no closure on it is called impossible',
        APP.storedScheduleProblems(record).length === 0 && APP.ledgerProblems(record).length === 0
        && APP.impossibleClosures(record).length === 0,
        JSON.stringify(APP.impossibleClosures(record)));

    // What the two agree on first, so that what follows is about one thing only.
    same('both say the advance is over-settled by 500',
        [APP.advanceOutstanding(record, 'a_1').overpaid, shekels(oracle.outstanding(record, 'a_1').overpaid)],
        [500, 500]);
    same('and both keep the closed payslip at 2,000 off and nothing left',
        [APP.advanceAccount(record, 'w_d', ...P1).deducted, APP.advanceAccount(record, 'w_d', ...P1).carriedOut,
            shekels(oracle.accountOf(record, 'w_d', ...P1).deducted),
            shekels(oracle.accountOf(record, 'w_d', ...P1).carriedOut)], [2000, 0, 2000, 0]);

    // He takes 1,500 on the 24th. The same 1,500 taken a fortnight later, on 7 September,
    // is the same debt: nothing else on the record differs.
    const soon = clone(record);
    give(soon, 'a_2', '2026-08-24', 1500, '2026-08-24T09:00:00.000Z');
    const later = clone(record);
    give(later, 'a_2', '2026-09-07', 1500, '2026-09-07T09:00:00.000Z');
    const owedSoon = APP.advanceAccount(soon, 'w_d', ...P3).carriedForward;
    const owedLater = APP.advanceAccount(later, 'w_d', ...P3).carriedForward;
    same('by the second calculator he owes 1,500 either way',
        [shekels(oracle.accountOf(soon, 'w_d', ...P3).carriedForward),
            shekels(oracle.accountOf(later, 'w_d', ...P3).carriedForward)], [1500, 1500]);
    check('THE APP: what he owes on 1,500 does not depend on which fortnight he took it in',
        owedSoon === owedLater, `taken on 24 August: ${owedSoon}; taken on 7 September: ${owedLater}`);

    const closed = APP.advanceAccount(record, 'w_d', ...P1);
    check('THE APP: a closed account does not carry forward less than nothing',
        closed.carriedForward >= 0, `carriedForward ${closed.carriedForward}; by rule 0`);
    check('THE APP: the next account does not open on a credit',
        APP.advanceCarryInto(record, 'w_d', P2[0]) >= 0,
        `opens on ${APP.advanceCarryInto(record, 'w_d', P2[0])}; by rule 0`);
    // The sheet's figure and the advance screen's figure for the same man.
    const fold = APP.openAdvanceBalance(soon, 'w_d');
    check('THE APP: the account and the advances agree on what is still owed after the new 1,500',
        APP.advanceAccount(soon, 'w_d', ...P2).carriedForward === (fold ? fold.total : 0),
        `the account carries ${APP.advanceAccount(soon, 'w_d', ...P2).carriedForward}; the advances add up to ${fold ? fold.total : 0}`);
}

// ---------------------------------------------------------------- fixture two
//
// One phone's worth of ordinary evenings, nobody over-settled on any advance, and no
// warning anywhere - and the figure reaches a frozen payslip.
//
//   7-20 August    five days (3,050). 1,000 taken on the 10th (advance A). The account
//                  is NOT closed. The sheet shows 1,000 off and nothing carried.
//   21 Aug-3 Sep   five days (3,050). 500 taken on the 24th (advance B). Closed on
//                  3 September: opens on 0, 500 comes off, nothing left. The ledger
//                  writes that 500 against the OLDEST advance with anything on it,
//                  which is A - so B still shows 500 on the advance screen.
//   5 September    he hands back the 500 of B, as the screen invites, and it is written
//                  down dated 30 August, the day he says he gave it.
//   4-17 September five days (3,050). 1,500 taken on the 7th (advance C). Closed.
//
// By rule (B) the last account opens on 0, 1,500 is owed and 1,500 comes off. In the app
// the middle account now carries forward 0 + 500 - 500 - 500 = -500, the last one opens
// on -500, 1,000 comes off, and the payslip it freezes says so.
//
// SAID PLAINLY: under reading (A) 1,000 is a defensible figure here - if the 1,000 the
// open first account showed as deducted really did come off his pay, he has by now
// settled 2,000 of the 3,000 he was handed. What is not defensible under either reading
// is how the app gets there: a negative opening balance frozen onto a payslip, a figure
// that would have been 1,500 had he taken advance C one account later (fixture one
// measures exactly that), and no sentence on any screen saying a credit was applied.
// Which reading is right is the owner's to say; these checks are by (B), and say so.
{
    suite('finding 1, fixture two: nobody over-settled, no warning, and it is written on a payslip');

    const record = base();
    work(record, FIVE(P1[0]).concat(FIVE(P2[0]), FIVE(P3[0])));
    give(record, 'a_A', '2026-08-10', 1000, '2026-08-10T09:00:00.000Z');
    give(record, 'a_B', '2026-08-24', 500, '2026-08-24T09:00:00.000Z');
    const first = APP.closePeriodChanges(record, 'w_d', ...P2, '2026-09-03T18:00:00.000Z', 'd');
    given('the middle account closed: 500 off, written against the oldest advance',
        first.length === 2 && record.ledger.advances.le_close_a_A_20260821.amount === 500,
        JSON.stringify(first.map(change => change.path)));
    repay(record, 'le_back', 'a_B', '2026-08-30', 500, '2026-09-05T08:00:00.000Z');
    give(record, 'a_C', '2026-09-07', 1500, '2026-09-07T09:00:00.000Z');

    given('nobody is over-settled on any advance, to either calculator',
        APP.overpaidAdvances(record, 'w_d').length === 0 && oracle.overpaidBy(record, 'w_d') === 0,
        JSON.stringify(APP.overpaidAdvances(record, 'w_d')));
    const open = APP.advanceAccount(record, 'w_d', ...P3);
    given('and the app raises no review on the open account', open.review === false, String(open.review));

    const want = oracle.closePlan(record, 'w_d', ...P3);
    check('THE APP: the middle account does not carry forward less than nothing',
        APP.advanceAccount(record, 'w_d', ...P2).carriedForward >= 0,
        `carriedForward ${APP.advanceAccount(record, 'w_d', ...P2).carriedForward}; by rule 0`);
    check('THE APP: 1,500 taken, 1,500 owed, 1,500 comes off a wage of 3,050',
        open.deducted === shekels(want.deducted), `the app takes ${open.deducted}; by rule ${shekels(want.deducted)}`);

    const second = APP.closePeriodChanges(record, 'w_d', ...P3, '2026-09-17T18:00:00.000Z', 'd');
    given('the last account closed', second.length > 0, String(second.length));
    const payslip = record.ledger.advances.le_period_w_d_20260904;
    check('THE APP: a frozen payslip does not open on a negative balance',
        payslip.carriedIn >= 0, `carriedIn ${payslip.carriedIn}, written to the record`);
    const off = second.map(change => change.value).filter(entry => entry.kind === 'deducted')
        .map(entry => [entry.advanceId, entry.amount, entry.balanceAfter]);
    same('THE APP: the deductions written are the ones the rules give, oldest advance first', off,
        want.rows.map(row => [row.advanceId, shekels(row.amount), shekels(row.balanceAfter)]));
}

// ---------------------------------------------------------------- finding 2
//
// Through the doors the buttons use, on a phone, and then the phone is closed and
// opened again.
//
//   דוד: 610 a day, 41.25 an hour. 7 August: one day with half an extra hour.
//        610 + 0.5 x 41.25 = 630.625.
//   10 August: he takes 5,000. The carried reading is approved. The account is closed.
//
// By the rule 630.62 is the most that can come off - he did not earn 630.63 - and
// whatever comes off, the closure must be one the app can read back.
{
    suite('finding 2: a wage finer than an agora, closed, and the phone opened again');

    const phone = makeDevice({ deviceId: 'd_office' });
    phone.setToday('2026-08-20');
    const live = () => phone.State.schedule;
    live().workers = [{ id: 'w_d', name: 'דוד', active: true, dailyRate: 610, hourlyRate: 41.25 }];
    live().places = [{ id: 'p_x', name: 'חיפה', active: true }];
    given('the roster was saved', phone.State.save({ silent: true }) === true);
    given('the day was recorded', phone.State.commit(phone.call('assignPlace', live(),
        '2026-08-07', 'w_d', 'actual', 'p_x', 'extra', 0.5)) === true);
    given('the advance was recorded', phone.State.commitMany(phone.call('recordNewAdvance', live(),
        'w_d', '2026-08-10', 5000, '', '2026-08-10T09:00:00.000Z', 'd_office')) === true);
    given('the carried reading was approved', phone.State.commit(phone.call('recordCarryApproval',
        live(), phone.call('planCarryMigration', live()), '2026-08-11T09:00:00.000Z', 'd_office')) === true);

    const plan = phone.call('planPeriodClosure', live(), 'w_d', ...P1, '2026-08-20T18:00:00.000Z');
    given('the app offers the close, with nothing against it', plan.canClose === true,
        JSON.stringify(plan.reasons));
    same('the wage is 630.625, and nothing rounded it', plan.gross, 630.625);
    given('the close was committed', phone.State.commitMany(phone.call('closePeriodChanges', live(),
        'w_d', ...P1, '2026-08-20T18:00:00.000Z', 'd_office')) === true);

    const taken = Object.values(live().ledger.advances).find(entry => entry.kind === 'deducted');
    check('THE APP: a close never takes more off than the man earned',
        taken.amount <= taken.gross, `took ${taken.amount} off a wage of ${taken.gross}`);
    check('THE APP: its own judge accepts the closure it has just written',
        phone.call('impossibleClosures', live()).length === 0,
        `${JSON.stringify(phone.call('impossibleClosures', live()))}: ${JSON.stringify(phone.call('closureProblems', live(), taken))}`);

    const again = makeDevice({ storage: phone.dump(), deviceId: 'd_office' });
    again.setToday('2026-08-21');
    again.State.load();
    const aside = Object.keys(again.State.schedule.ledger.unreadable || {});
    check('THE APP: after a close and a reopen, nothing on the ledger is held aside as unreadable',
        aside.length === 0, JSON.stringify(aside));
    check('THE APP: and the phone that closed the account can still write',
        again.call('farkadWritesBlocked') === false, `farkadWritesBlocked() is ${again.call('farkadWritesBlocked')}`);
}

report();
