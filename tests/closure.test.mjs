// A closed fortnight is a record. Records do not change.
//
//   node tests/closure.test.mjs
//
// L5 taught a closure to be judged against accounting reality, and freezing arrived
// half-done. recordPeriodClosed writes two numbers - what came off the wage, and the
// balance the period closed on:
//
//     { advanceId, kind: 'deducted', workerId, balanceAfter, date,
//       periodFrom, periodTo, amount, at, by }
//
// Everything else about that fortnight is recomputed from the LIVE schedule every time
// somebody looks. The wage is `payrollReport(schedule, from, to)`, which is days times
// rates as they stand today. So the moment anything historical moves - a day corrected
// off, a rate fixed, an import from a phone that was in a tunnel - a fortnight that was
// printed, signed and paid prints different numbers.
//
// Measured on this tree. A man on 610 a day, five days, 3,050 earned, 5,000 advanced,
// closed with 3,050 deducted and 1,950 carried:
//
//   at closure                        נצבר 3050 · מקדמות -3050 · לתשלום 0
//   one historical day removed        נצבר 2440 · מקדמות -3050 · לתשלום -610
//
// The payslip now says the firm owes him -610 for a fortnight it already paid him 0 for,
// and the deduction column still says 3,050 because that half IS frozen. The row does not
// even add up any more.
//
// AND THE HONEST CLOSURE BECOMES A LIE. closureProblems judges the deduction against the
// live wage, so the same edit makes it report
//
//   "a closure deducting more than the wage it came off"
//   "a closure leaving a wage below zero"
//
// and impossibleClosures names it. A closure that was exactly right on the day it was
// written is condemned because the schedule moved underneath it - and on this branch
// that list is what a person is shown when they are asked whether their books are sound.
//
// WHAT IS ALREADY RIGHT, and must stay right: late money. A repayment of 400 dated into
// the closed period leaves the payslip's 1,950 alone and moves the live debt to 1,550,
// and the sheet says both with "הגיעה תנועה אחרי סגירת התקופה". Those are two different
// facts about two different moments. Neither may ever replace the other.

import { makeDevice, settle } from './harness.mjs';
import { suite, check, same, given, report } from './runner.mjs';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const A = { from: '2026-08-07', to: '2026-08-20' };
const DAYS = ['2026-08-10', '2026-08-11', '2026-08-12', '2026-08-13', '2026-08-14'];
const RATE = 610;
const GROSS = 3050;         // 5 x 610
const ADVANCE = 5000;
const DEDUCTED = 3050;
const CLOSING = 1950;       // 5000 - 3050

function crew(deviceId) {
    const device = makeDevice({ deviceId,
        flags: { carryAdvances: true, ledgerWrites: true } });
    device.setToday('2026-08-26');
    device.ctx.askTell = () => Promise.resolve();
    device.State.schedule.workers = [
        { id: 'w_01', name: 'דוד', active: true, dailyRate: RATE, hourlyRate: 0 }];
    device.State.schedule.places = [{ id: 'p_01', name: 'הרצליה', active: true }];
    device.State.save({ silent: true });
    DAYS.forEach(date => device.State.commit(device.call('assignPlace',
        device.State.schedule, date, 'w_01', 'actual', 'p_01')));
    device.State.commit(device.call('addAdvance', device.State.schedule,
        'w_01', '2026-08-10', ADVANCE, ''));
    const plan = device.call('planCarryMigration', device.State.schedule);
    if (plan.needed) {
        device.State.commit(device.call('recordCarryApproval', device.State.schedule,
            plan, '2026-08-06T09:00:00.000Z', 'd_person'));
    }
    return device;
}

const advanceIdIn = device => Object.keys(device.State.schedule.advances)[0];

function closed(deviceId) {
    const device = crew(deviceId);
    device.State.commit(device.call('recordPeriodClosed', device.State.schedule,
        advanceIdIn(device), 'w_01', A.from, A.to, DEDUCTED,
        '2026-08-20T18:00:00.000Z', deviceId, CLOSING));
    return device;
}

const closureIn = device => Object.keys(device.State.schedule.ledger.advances)
    .map(id => device.State.schedule.ledger.advances[id])
    .find(entry => String(entry.periodFrom) === A.from) || null;

// Loaded ONCE per device context. These files declare consts at their top level, so a
// second load into the same context throws on the first of them - and the throw happens
// inside whatever check called it, which is a confusing way to learn you loaded twice.
const LOADED = new WeakMap();
function reportsIn(device) {
    const run = code => vm.runInContext(code, device.ctx, { filename: 'harness:closure' });
    if (!LOADED.has(device.ctx)) {
        run(readFileSync(new URL('../js/ui/sitecolor.js', import.meta.url), 'utf8'));
        run(readFileSync(new URL('../js/ui/reports.js', import.meta.url), 'utf8'));
        LOADED.set(device.ctx, true);
    }
    run(`REPORT_RANGE.from = '${A.from}'; REPORT_RANGE.to = '${A.to}';`
        + `REPORT_SECTION = 'workers'; INVOICE_PLACE = null;`);
    return run;
}

// THE CLOSED ARTIFACTS: the three money columns of the payslip, the frozen balance, and
// the statement's own two lines. Everything a person was handed.
function payslip(device) {
    const run = reportsIn(device);
    const sheet = run('payrollSheetRows()');
    const head = sheet[0];
    const row = sheet.find(line => line[0] === 'דוד') || [];
    const account = device.call('advanceAccount', device.State.schedule, 'w_01',
        A.from, A.to);
    return {
        earned: row[head.indexOf('נצבר')],
        deduction: row[head.indexOf('מקדמות') !== -1
            ? head.indexOf('מקדמות') : head.indexOf('נוכה מהשכר')],
        payable: row[head.indexOf('לתשלום')],
        gross: account.gross,
        deducted: account.deducted,
        net: account.net,
        carriedOut: account.carriedOut,
        closed: account.closed
    };
}

const reopen = (device, id) => {
    const again = makeDevice({ deviceId: id, storage: device.dump(),
        flags: { carryAdvances: true, ledgerWrites: true } });
    again.setToday('2026-08-26');
    again.ctx.askTell = () => Promise.resolve();
    again.State.load();
    return again;
};

// ------------------------------------------------------- what a closure has to write down
{
    suite('a closure records the fortnight it closed, not just two numbers of it');

    const device = closed('d_fields');
    const entry = closureIn(device);
    given('the closure is there', entry !== null, JSON.stringify(entry));

    // Every fact a payslip is made of. Without them the payslip is a recomputation, and
    // a recomputation is only as stable as the schedule underneath it.
    const wanted = ['gross', 'carriedIn', 'given', 'repaid', 'reversed', 'deducted',
        'net', 'closingBalance', 'periodFrom', 'periodTo', 'workerId', 'at', 'by'];
    const missing = wanted.filter(field =>
        (entry || {})[field] === undefined
        // deducted and closingBalance already exist under their older names.
        && !(field === 'deducted' && entry.amount !== undefined)
        && !(field === 'closingBalance' && entry.balanceAfter !== undefined));
    same('it carries every close-time fact', missing, []);

    check('and the monetary basis it was worked out from',
        entry !== null && entry.basis !== undefined
        && Number((entry.basis || {}).dailyRate) === RATE,
        JSON.stringify((entry || {}).basis));
    check('the numbers it recorded are the numbers of that day',
        entry !== null && Number(entry.gross) === GROSS
        && Number(entry.amount) === DEDUCTED
        && Number(entry.balanceAfter) === CLOSING,
        JSON.stringify([entry && entry.gross, entry && entry.amount,
            entry && entry.balanceAfter]));
}

// ---------------------------------------------- the schedule moves, the payslip does not
{
    suite('nothing done to the live schedule afterwards moves a closed payslip');

    const AT_CLOSE = {
        earned: GROSS, deduction: -DEDUCTED, payable: 0,
        gross: GROSS, deducted: DEDUCTED, net: 0, carriedOut: CLOSING, closed: true
    };

    const mutations = [
        ['a historical workday is removed', device => device.State.commit(
            device.call('clearWorkerDay', device.State.schedule,
                '2026-08-14', 'w_01', 'actual'))],
        ['a historical workday is added', device => device.State.commit(
            device.call('assignPlace', device.State.schedule,
                '2026-08-17', 'w_01', 'actual', 'p_01'))],
        ['a historical rate is changed', device => {
            device.State.schedule.workers[0].dailyRate = 300;
            device.State.save({ silent: true });
        }],
        ['a late repayment is dated inside it', device => device.State.commit(
            device.call('recordAdvanceRepaid', device.State.schedule,
                advanceIdIn(device), 400, '2026-08-18', '',
                '2026-08-25T09:00:00.000Z', 'd_late', 'cash'))],
        ['a later correction is dated inside it', device => {
            const repay = device.call('recordAdvanceRepaid', device.State.schedule,
                advanceIdIn(device), 400, '2026-08-18', '',
                '2026-08-25T09:00:00.000Z', 'd_late', 'cash');
            device.State.commit(repay);
            device.State.commit(device.call('recordEventReversed', device.State.schedule,
                repay.value.id, 400, '2026-08-18', 'נרשם על האדם הלא נכון',
                '2026-08-26T09:00:00.000Z', 'd_late'));
        }]
    ];

    for (const [what, mutate] of mutations) {
        const tag = what.replace(/\W/g, '').slice(0, 14);
        const device = closed('d_m_' + tag);
        given(`${what}: the payslip starts as it was closed`,
            JSON.stringify(payslip(device)) === JSON.stringify(AT_CLOSE),
            JSON.stringify(payslip(device)));

        // THE SAME RECORD, captured before the mutation. Both the stale snapshot and the
        // second phone below have to be this record - a separately seeded device mints
        // its own advance id, and the union then holds TWO advances and TWO closures,
        // which measures nothing about freezing.
        const atClose = JSON.parse(JSON.stringify(device.State.schedule));
        const closedDisk = device.dump();

        mutate(device);

        same(`${what}: the payslip is unchanged`, payslip(device), AT_CLOSE);
        // AND THE CLOSURE IS STILL AN HONEST ONE. A record that becomes impossible
        // because the world moved is a record this app would then ask a person to
        // explain, about a fortnight that was right when it was written.
        check(`${what}: and the closure is not called impossible`,
            device.call('impossibleClosures', device.State.schedule).length === 0,
            JSON.stringify(device.call('closureProblems',
                device.State.schedule, closureIn(device))));

        // FIVE MORE READINGS OF THE SAME RECORD.
        const once = reopen(device, 'd_m1_' + tag);
        same(`${what}: after a reopen`, payslip(once), AT_CLOSE);
        const twice = reopen(once, 'd_m2_' + tag);
        same(`${what}: after a second reopen`, payslip(twice), AT_CLOSE);

        // An OLDER snapshot arriving - a phone that has been out of signal - and then the
        // current one. Neither may restate the payslip.
        const stale = JSON.parse(JSON.stringify(atClose));
        stale.updatedAt = '2026-08-19T10:00:00.000Z';
        stale.updatedBy = 'd_tunnel';
        twice.Sync.receive(stale);
        same(`${what}: after an older snapshot`, payslip(twice), AT_CLOSE);

        const current = JSON.parse(JSON.stringify(device.State.schedule));
        current.updatedAt = '2026-08-27T10:00:00.000Z';
        current.updatedBy = 'd_other';
        twice.Sync.receive(current);
        same(`${what}: after the current snapshot`, payslip(twice), AT_CLOSE);

        // AND A SECOND PHONE holding the same record - the closed disk carried onto
        // another device - which then hears the mutation over the wire.
        const second = makeDevice({ deviceId: 'd_second_' + tag, storage: closedDisk,
            flags: { carryAdvances: true, ledgerWrites: true } });
        second.setToday('2026-08-26');
        second.ctx.askTell = () => Promise.resolve();
        second.State.load();
        second.Sync.receive(Object.assign(
            JSON.parse(JSON.stringify(device.State.schedule)),
            { updatedAt: '2026-08-28T10:00:00.000Z', updatedBy: 'd_first' }));
        same(`${what}: and on a second phone`, payslip(second), AT_CLOSE);
    }
}

// ------------------------------------------------------------ and the late money survives
{
    suite('the frozen balance and the live debt are two numbers, and both are kept');

    const device = closed('d_late_money');
    device.State.commit(device.call('recordAdvanceRepaid', device.State.schedule,
        advanceIdIn(device), 400, '2026-08-18', '',
        '2026-08-25T09:00:00.000Z', 'd_late_money', 'cash'));

    const account = device.call('advanceAccount', device.State.schedule, 'w_01',
        A.from, A.to);
    same('the payslip says 1,950 and the open debt says 1,550',
        [account.carriedOut, account.carriedForward, account.lateSinceClose],
        [CLOSING, 1550, -400]);

    const run = reportsIn(device);
    const sheet = run('payrollSheetRows()');
    const note = String((sheet.find(line => line[0] === 'דוד') || [])[sheet[0].length - 1]);
    check('and the sheet prints both, and says why they differ',
        note.indexOf('1950') !== -1 && note.indexOf('1550') !== -1
        && note.indexOf('הגיעה תנועה אחרי סגירת התקופה') !== -1, note);
    check('the 400 that came back is named, not swallowed',
        note.indexOf('400') !== -1, note);
}

// ------------------------------------------------------------- and an old closure is fine
{
    suite('a closure written before any of this stays readable and unaccused');

    // Every closure on every device today: two numbers and no snapshot. It must not be
    // quarantined, it must not be called impossible, and nothing may be invented for it.
    const device = closed('d_old');
    const entry = closureIn(device);
    const bare = {};
    ['id', 'advanceId', 'kind', 'workerId', 'balanceAfter', 'date',
        'periodFrom', 'periodTo', 'amount', 'at', 'by'].forEach(field => {
            bare[field] = entry[field];
        });
    device.State.schedule.ledger.advances[entry.id] = bare;
    device.State.save({ silent: true });

    given('this closure carries no snapshot',
        device.State.schedule.ledger.advances[entry.id].gross === undefined,
        JSON.stringify(Object.keys(device.State.schedule.ledger.advances[entry.id])));

    check('it is readable and reports its own two numbers',
        device.call('advanceAccount', device.State.schedule, 'w_01', A.from, A.to)
            .carriedOut === CLOSING);
    check('nothing was invented for the facts it does not carry',
        device.State.schedule.ledger.advances[entry.id].gross === undefined
        && device.State.schedule.ledger.advances[entry.id].basis === undefined,
        JSON.stringify(device.State.schedule.ledger.advances[entry.id]));
    check('it is not called impossible',
        device.call('impossibleClosures', device.State.schedule).length === 0,
        JSON.stringify(device.call('closureProblems',
            device.State.schedule, device.State.schedule.ledger.advances[entry.id])));
    check('and the device is not held',
        device.call('farkadWritesBlocked') === false);

    // Even after the schedule moves under it - which is the case that condemned it.
    device.State.commit(device.call('clearWorkerDay', device.State.schedule,
        '2026-08-14', 'w_01', 'actual'));
    check('still not impossible once the schedule moves under it',
        device.call('impossibleClosures', device.State.schedule).length === 0,
        JSON.stringify(device.call('closureProblems',
            device.State.schedule, device.State.schedule.ledger.advances[entry.id])));
}

// ------------------------------------------------- a closure that was wrong is still wrong
{
    suite('freezing does not make a false closure true');

    // The control. L5 exists because a closure can be written that cannot be true, and
    // recording MORE facts on the entry must not turn that check off - a closure carrying
    // a snapshot that disagrees with its own arithmetic is the easiest lie to write.
    const device = closed('d_false');
    const entry = closureIn(device);
    entry.balanceAfter = 400;           // the record leaves 1,950
    device.State.save({ silent: true });
    check('a carried balance that is not the arithmetic is still caught',
        device.call('closureProblems', device.State.schedule, entry).length > 0,
        JSON.stringify(device.call('closureProblems', device.State.schedule, entry)));

    const other = closed('d_false2');
    const wrong = closureIn(other);
    wrong.periodFrom = '2026-08-09';    // not an account's opening Friday
    other.State.save({ silent: true });
    check('a period that is not an account is still caught',
        other.call('closureProblems', other.State.schedule, wrong).length > 0,
        JSON.stringify(other.call('closureProblems', other.State.schedule, wrong)));
}

report();
