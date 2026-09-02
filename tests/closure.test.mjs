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

    // AND WHAT IT IS STILL JUDGED BY, said out loud rather than left as a surprise.
    //
    // A closure that records no wage is measured against the live one, because that is
    // the only evidence there is. That has a cost - move a day out of the fortnight and
    // this old closure is accused of deducting more than the wage it came off, which on
    // the day it was written it did not - and the cost is accepted deliberately, because
    // the same check is what holds aside a closure arriving from another phone claiming
    // 4,000 off a wage of 3,050. See L5 in tests/repayment.test.mjs, which is that case.
    //
    // The drift is FIXED FORWARD rather than papered over: every closure this build
    // writes carries the wage it was closed on and is judged against that, so the set of
    // records that can be accused this way is closed and shrinking. Waving the check away
    // for want of a snapshot would open exactly the hole L5 closed, on the one kind of
    // record this app cannot re-derive.
    device.State.commit(device.call('clearWorkerDay', device.State.schedule,
        '2026-08-14', 'w_01', 'actual'));
    check('it is still measured against the live wage, because nothing else is available',
        device.call('closureProblems', device.State.schedule,
            device.State.schedule.ledger.advances[entry.id]).length > 0,
        JSON.stringify(device.call('closureProblems',
            device.State.schedule, device.State.schedule.ledger.advances[entry.id])));

    // While a closure that DOES record its wage, on the same edit, is left alone - which
    // is the whole difference this workstream makes.
    const modern = closed('d_modern');
    modern.State.commit(modern.call('clearWorkerDay', modern.State.schedule,
        '2026-08-14', 'w_01', 'actual'));
    check('and a closure that recorded its wage is not accused by the same edit',
        modern.call('impossibleClosures', modern.State.schedule).length === 0,
        JSON.stringify(modern.call('closureProblems',
            modern.State.schedule, closureIn(modern))));
}

// ------------------------------------------------ the snapshot is money, and it is read
{
    suite('a closure snapshot nobody can read is not folded as a number');

    // WHAT C4 ADDED AND DID NOT GUARD. The closure now carries the fortnight it froze -
    // gross, carriedIn, and the basis it was priced at - and every one of those is money
    // or a count that came off ANOTHER PHONE. closedPeriods reads them like this:
    //
    //     if (at.gross === undefined && entry.gross !== undefined && entry.gross !== null) {
    //         at.gross = Number(entry.gross);
    //     }
    //
    // `Number("not-money")` is NaN, and NaN is not undefined, so it wins the "is it
    // there" test and becomes the fortnight's wage. Measured on the commit this was
    // written against, with one character changed on a closure this device wrote itself:
    //
    //     closedPeriods  { gross: null, ... }          (NaN, through JSON)
    //     advanceAccount  gross NaN, net 0, deducted 3050
    //     ledgerEntryProblems   []          - the entry is called readable
    //     impossibleClosures    []          - and nothing is held aside
    //
    // A wage of NaN on a payslip, from a record every door called clean. ledgerEntryProblems
    // already refuses an unreadable amount and an unreadable balanceAfter on this same
    // entry; the five numbers C4 put beside them were not added to the list.
    const NUMBERS = ['gross', 'carriedIn', 'given', 'repaid', 'reversed', 'net'];
    for (const field of NUMBERS) {
        const device = closed('d_nan_' + field);
        const entry = closureIn(device);
        given(`${field}: the closure carries one`, entry[field] !== undefined,
            JSON.stringify(entry));
        const broken = Object.assign({}, entry, { [field]: 'not-money' });
        check(`${field}: a value that is not money makes the entry unreadable`,
            device.call('ledgerEntryProblems', broken.id, broken).length > 0,
            JSON.stringify(device.call('ledgerEntryProblems', broken.id, broken)));
    }

    // AND THE FOLD NEVER COERCES. Even if such an entry reaches a fold - from a build
    // that wrote it before this check existed - the answer must not be NaN.
    //
    // Delivered the way one really arrives: a snapshot from another phone. Editing this
    // device's own memory and saving would leave the honest entry in the journal, which
    // replays over it at the next load - correctly, and it measures nothing.
    {
        const device = closed('d_nan_fold');
        const entry = closureIn(device);
        const arriving = JSON.parse(JSON.stringify(device.State.schedule));
        arriving.ledger.advances[entry.id].gross = 'not-money';
        arriving.updatedAt = '2026-08-27T10:00:00.000Z';
        arriving.updatedBy = 'd_other';
        device.Sync.receive(arriving);
        const periods = device.call('closedPeriods', device.State.schedule, 'w_01');
        const held = periods[A.from] || {};
        check('a wage that is not money is not adopted as the fortnight\'s wage',
            held.gross === undefined || Number.isFinite(held.gross),
            JSON.stringify(periods));
        const account = device.call('advanceAccount', device.State.schedule, 'w_01',
            A.from, A.to);
        check('and no account anywhere reports a wage of NaN',
            Number.isFinite(account.gross), JSON.stringify(account));
        // AND THE SNAPSHOT IS NOT ADOPTED. A document carrying a closure this build
        // cannot read is not a reason to replace the honest one on this disk, and it is
        // not a reason to say synced either.
        check('the record this device holds is untouched',
            device.State.schedule.ledger.advances[entry.id].gross === GROSS,
            JSON.stringify(device.State.schedule.ledger.advances[entry.id]));
        check('the device does not report itself synced on it',
            device.Sync.status !== 'synced', device.Sync.status);
        check('and it is stopped rather than paying from it',
            device.call('farkadWritesBlocked') === true);

        // AND HELD ASIDE, when the same bytes are what a phone actually opens on. This
        // is the disk of somebody who was already holding it.
        const carried = JSON.parse(JSON.stringify(arriving));
        const cold = makeDevice({ deviceId: 'd_nan_cold',
            flags: { carryAdvances: true, ledgerWrites: true },
            storage: { 'scheduleData:v2': JSON.stringify(carried) } });
        cold.setToday('2026-08-26');
        cold.ctx.askTell = () => Promise.resolve();
        cold.State.load();
        check('a phone that opens on those bytes holds the closure aside',
            Object.keys(cold.State.schedule.ledger.unreadable).indexOf(entry.id) !== -1,
            JSON.stringify(Object.keys(cold.State.schedule.ledger.unreadable)));
        check('it does not fold it as a wage',
            cold.State.schedule.ledger.advances[entry.id] === undefined,
            JSON.stringify(cold.State.schedule.ledger.advances[entry.id]));
        check('and that phone is stopped too',
            cold.call('farkadWritesBlocked') === true);
    }

    // The basis is counts rather than money, and it is read the same way - straight onto
    // a payslip as "6 ימים".
    {
        const device = closed('d_nan_basis');
        const entry = closureIn(device);
        const broken = Object.assign({}, entry,
            { basis: Object.assign({}, entry.basis, { attendanceDays: 'lots' }) });
        check('a basis that is not counts makes the entry unreadable',
            device.call('ledgerEntryProblems', broken.id, broken).length > 0,
            JSON.stringify(device.call('ledgerEntryProblems', broken.id, broken)));
        const notObject = Object.assign({}, entry, { basis: 'six days' });
        check('and neither is a basis that is not a record',
            device.call('ledgerEntryProblems', notObject.id, notObject).length > 0,
            JSON.stringify(device.call('ledgerEntryProblems', notObject.id, notObject)));
    }
}

// ------------------------------------------- the whole artifact, not only its money half
{
    suite('a closed fortnight freezes its counts and its days, not only its shekels');

    // C4 froze the MONEY columns and stopped there. The counts and the day list beside
    // them are still recomputed from the live schedule every time somebody looks, so the
    // payslip's three shekel figures hold while the sentence next to them changes:
    //
    //   at closure                   6 ימים · נצבר 3050 · six detail rows
    //   one historical day removed   5 ימים · נצבר 3050 · five detail rows
    //
    // and the worker's own statement, which computes its total from those same live days
    // rather than from the account, prints a DIFFERENT wage from the sheet he is paid
    // against - the one thing tests/money.display.test.mjs exists to prevent.
    const device = closed('d_whole');
    const row = () => device.call('payrollReport', device.State.schedule, A.from, A.to)
        .find(item => item.workerId === 'w_01');
    const detail = () => device.call('workerDaysReport', device.State.schedule,
        device.State.schedule.workers[0], A.from, A.to);
    const statement = () => {
        const run = reportsIn(device);
        return run(`workerStatementText('w_01')`);
    };

    const daysAtClose = detail().length;
    const countAtClose = row().attendanceDays;
    const unitsAtClose = row().payUnits;
    given('the closed fortnight is five days and five pay units',
        daysAtClose === 5 && countAtClose === 5 && unitsAtClose === 5,
        JSON.stringify([daysAtClose, countAtClose, unitsAtClose]));
    const saidAtClose = statement();
    given('and the statement says what the sheet says',
        saidAtClose.indexOf(String(GROSS)) !== -1, saidAtClose.slice(0, 200));

    device.State.commit(device.call('clearWorkerDay', device.State.schedule,
        '2026-08-14', 'w_01', 'actual'));

    check('the days it was paid for do not change',
        row().attendanceDays === countAtClose,
        `${countAtClose} -> ${row().attendanceDays}`);
    check('nor the units it was priced on',
        row().payUnits === unitsAtClose, `${unitsAtClose} -> ${row().payUnits}`);
    check('nor the detail behind them',
        detail().length === daysAtClose, `${daysAtClose} -> ${detail().length}`);
    check('and the wage on the row is the one it was closed on',
        row().amount === GROSS, `${GROSS} -> ${row().amount}`);
    // THE WHOLE DOCUMENT, byte for byte. Looking for one number in it would pass on a
    // statement that had lost a day and kept the total, and the day list is half of what
    // the man is being asked to agree with.
    check('the statement he was handed is the statement he is handed again',
        statement() === saidAtClose,
        JSON.stringify([saidAtClose.slice(0, 240), statement().slice(0, 240)]));
}

// ------------------------------------------- the hours a frozen day was priced with
{
    suite('a closed fortnight\'s frozen days carry the extra hours they were priced with');

    // The frozen day list is the evidence for the man's statement, and it froze without
    // its hours. closureFacts read `one.hours` off the live entries workerDaysReport
    // handed it, and the live field is `extraHours` - makeEntry writes it, entryExtraHours
    // reads it - so every frozen entry lost its hours, the frozen branch summed them to
    // nothing, and a statement printed after the close showed a day priced at
    // 610 + 2 × 50 = 710 beside a work-units line with no hours in it. Not money: the wage
    // and the day's amount are frozen whole. The reason for the number, on the one
    // document the man is asked to agree with, and it went missing at the very moment the
    // number stopped being recomputable.
    const HOURLY = 50;
    const HOURS = 2;
    const PRICED = RATE + HOURLY * HOURS;
    const device = makeDevice({ deviceId: 'd_hours',
        flags: { carryAdvances: true, ledgerWrites: true } });
    device.setToday('2026-08-26');
    device.ctx.askTell = () => Promise.resolve();
    device.State.schedule.workers = [
        { id: 'w_01', name: 'דוד', active: true, dailyRate: RATE, hourlyRate: HOURLY }];
    device.State.schedule.places = [{ id: 'p_01', name: 'הרצליה', active: true }];
    device.State.save({ silent: true });
    DAYS.forEach(date => device.State.commit(device.call('assignPlace',
        device.State.schedule, date, 'w_01', 'actual', 'p_01', undefined,
        date === '2026-08-12' ? HOURS : undefined)));
    const detail = () => device.call('workerDaysReport', device.State.schedule,
        device.State.schedule.workers[0], A.from, A.to);
    const onThe12th = () => detail().find(day => day.date === '2026-08-12') || {};
    given('the live day carries its two hours and is priced with them',
        onThe12th().extraHours === HOURS && onThe12th().amount === PRICED
            && onThe12th().entries[0].extraHours === HOURS,
        JSON.stringify(onThe12th()));
    // The statement's own wording for the hours, from the function that writes it.
    const run = reportsIn(device);
    const hoursLine = run(`countedIn(${HOURS}, 'שעה נוספת אחת', 'שעות נוספות')`);
    const statement = () => run(`workerStatementText('w_01')`);
    given('and the statement says so', statement().indexOf(hoursLine) !== -1,
        JSON.stringify([hoursLine, statement().slice(0, 240)]));

    const changes = device.call('closePeriodChanges', device.State.schedule, 'w_01',
        A.from, A.to, '2026-08-20T18:00:00.000Z', 'd_hours');
    given('the fortnight closes', changes.length > 0 && device.State.commitMany(changes) !== false,
        JSON.stringify(changes.map(change => change && change.value && change.value.kind)));
    const closure = closureIn(device);
    given('and the closure carries its days', closure !== null && Array.isArray(closure.days)
        && closure.days.length === DAYS.length, JSON.stringify(closure && closure.days));

    // THE RECORD. Hours where they were worked, no key where they were not - the shape
    // the frozen reader asks for, and the shape that is its own JSON.
    const frozen12th = closure.days.find(day => day.date === '2026-08-12') || {};
    check('the frozen day carries the hours it was priced with',
        Array.isArray(frozen12th.entries) && frozen12th.entries.length === 1
            && frozen12th.entries[0].hours === HOURS,
        JSON.stringify(frozen12th));
    check('and the frozen amount is the priced one', frozen12th.amount === PRICED,
        JSON.stringify(frozen12th));
    check('a day with no extra hours carries no hours key at all',
        closure.days.filter(day => day.date !== '2026-08-12')
            .every(day => day.entries.every(entry =>
                !Object.prototype.hasOwnProperty.call(entry, 'hours'))),
        JSON.stringify(closure.days.map(day => day.entries)));
    check('nor a rate key for an ordinary day',
        closure.days.every(day => day.entries.every(entry =>
            !Object.prototype.hasOwnProperty.call(entry, 'rate'))),
        JSON.stringify(closure.days.map(day => day.entries)));

    // THE READER. The frozen branch of workerDaysReport is what the statement and the
    // detail screen print from now on.
    check('the frozen detail shows the hours', onThe12th().extraHours === HOURS
        && onThe12th().entries[0].hours === HOURS, JSON.stringify(onThe12th()));
    check('and the statement still says so', statement().indexOf(hoursLine) !== -1,
        JSON.stringify([hoursLine, statement().slice(0, 240)]));

    // THE EVIDENCE OUTLIVES THE DAY. The live day goes; the frozen one keeps its hours.
    device.State.commit(device.call('clearWorkerDay', device.State.schedule,
        '2026-08-12', 'w_01', 'actual'));
    check('after the live day is cleared the frozen day still carries its hours',
        onThe12th().extraHours === HOURS && onThe12th().amount === PRICED,
        JSON.stringify(onThe12th()));
    check('and the statement he is handed still explains the number',
        statement().indexOf(hoursLine) !== -1, JSON.stringify(statement().slice(0, 240)));
}

// ------------------------------------------------- a fortnight with no advances in it
{
    suite('a fortnight can be closed whether or not anybody took an advance');

    // MOST MEN HAVE NO ADVANCE. recordPeriodClosed takes an advanceId and
    // closePeriodChanges writes one entry per advance the close would touch, so a worker
    // who never borrowed has nothing to hang a closure on:
    //
    //     planPeriodClosure  { canClose: false, rows: [] }
    //     closePeriodChanges []
    //
    // and his fortnight can never be frozen. Every payslip he is handed goes on being
    // recomputed from the live schedule for ever - which is the same fault the suite
    // above this one is about, for the majority of the crew rather than a minority.
    const device = crew('d_noadv');
    // The advance the fixture adds, taken back out: this man borrowed nothing.
    delete device.State.schedule.advances[advanceIdIn(device)];
    device.State.schedule.ledger.advances = {};
    device.State.save({ silent: true });
    given('he has no advances at all',
        Object.keys(device.State.schedule.advances).length === 0,
        JSON.stringify(device.State.schedule.advances));

    const plan = device.call('planPeriodClosure', device.State.schedule, 'w_01',
        A.from, A.to);
    check('the fortnight can still be closed', plan.canClose === true,
        JSON.stringify(plan));

    const changes = device.call('closePeriodChanges', device.State.schedule, 'w_01',
        A.from, A.to, '2026-08-20T18:00:00.000Z', 'd_noadv');
    check('and closing it writes something', changes.length > 0,
        JSON.stringify(changes));
    device.State.commitMany(changes);

    const account = device.call('advanceAccount', device.State.schedule, 'w_01',
        A.from, A.to);
    check('the fortnight reads as closed', account.closed === true,
        JSON.stringify(account));
    check('with the wage it was closed on', account.gross === GROSS,
        JSON.stringify(account));
    check('and nothing was deducted, because nothing was owed',
        account.deducted === 0 && account.net === GROSS, JSON.stringify(account));

    // AND IT IS FROZEN, which is the whole point of writing it.
    const before = device.call('payrollReport', device.State.schedule, A.from, A.to)
        .find(item => item.workerId === 'w_01');
    device.State.commit(device.call('clearWorkerDay', device.State.schedule,
        '2026-08-14', 'w_01', 'actual'));
    const after = device.call('payrollReport', device.State.schedule, A.from, A.to)
        .find(item => item.workerId === 'w_01');
    same('his payslip does not move either', [after.amount, after.attendanceDays],
        [before.amount, before.attendanceDays]);

    check('the closure is not called impossible',
        device.call('impossibleClosures', device.State.schedule).length === 0,
        JSON.stringify(device.call('impossibleClosures', device.State.schedule)));
    check('and a reopen reads it back the same way',
        reopen(device, 'd_noadv2').call('advanceAccount',
            reopen(device, 'd_noadv3').State.schedule, 'w_01', A.from, A.to).closed === true);
}

// ------------------------------------------- the statement says both numbers, or neither
{
    suite('a man whose fortnight closed and then moved is told both figures');

    // TWO NUMBERS, AND THE MAN GETS ONE OF THEM. advanceWalk has said this since C4:
    // carriedOut is the figure the payslip was closed on and says forever, carriedForward
    // is what he actually still owes today. The pay sheet prints both - "יתרת סגירה" on
    // the row and "הגיעה תנועה אחרי סגירת התקופה · חוב פתוח" beside it. The statement HE
    // is sent prints only the first:
    //
    //     if (account && account.closed && account.carriedOut > 0) {
    //         lines.push(`יתרת סגירה: ...`);
    //     } else if (account && account.carriedForward > 0) {
    //         lines.push(`חוב פתוח: ...`);
    //     }
    //
    // So a man who handed back 400 after his fortnight shut is handed a document saying
    // he still owes 1,950. He owes 1,550. The one figure he can check is the one that
    // does not include the money he paid, and the sheet the office reads says otherwise -
    // which is the two-surfaces-one-number fault, on the two documents that meet.
    const device = closed('d_says_both');
    device.State.commit(device.call('recordAdvanceRepaid', device.State.schedule,
        advanceIdIn(device), 400, '2026-08-18', '',
        '2026-08-25T09:00:00.000Z', 'd_says_both', 'cash'));

    const account = device.call('advanceAccount', device.State.schedule, 'w_01',
        A.from, A.to);
    given('the payslip is frozen at 1,950 and he actually owes 1,550',
        account.closed === true && account.carriedOut === 1950
        && account.carriedForward === 1550, JSON.stringify(account));

    const run = reportsIn(device);
    const said = run(`workerStatementText('w_01')`);
    check('his statement still reports the balance the period closed on',
        said.indexOf('יתרת סגירה') !== -1, said.slice(-200));
    check('and says what he owes now, separately and by its own name',
        said.indexOf('חוב פתוח כולל') !== -1, said.slice(-200));
    check('with the two figures beside their own labels',
        /יתרת סגירה: [^\n]*1,?950/.test(said)
        && /חוב פתוח כולל: [^\n]*1,?550/.test(said), said.slice(-200));

    // AND NEITHER LABEL EVER MEANS THE OTHER. A closed period with nothing after it has
    // one figure and says it once.
    const quiet = closed('d_says_one');
    const quietSaid = reportsIn(quiet)(`workerStatementText('w_01')`);
    check('a closed period nothing arrived after says only its closing balance',
        quietSaid.indexOf('יתרת סגירה') !== -1
        && quietSaid.indexOf('חוב פתוח כולל') === -1, quietSaid.slice(-160));

    // And an OPEN period is unchanged: it has no closing balance to report.
    const open = crew('d_says_open');
    const openSaid = reportsIn(open)(`workerStatementText('w_01')`);
    check('an open period says חוב פתוח and nothing about a closing balance',
        openSaid.indexOf('חוב פתוח') !== -1
        && openSaid.indexOf('יתרת סגירה') === -1, openSaid.slice(-160));
}

// ------------------------------------------ the legacy policy, decided once and for all
{
    suite('a closure with no snapshot is judged the same way on every later read');

    // THE FALLBACK IS A POLICY, and a policy that changes between two readings of one
    // record is not a policy. A closure that records no wage is measured against the live
    // one - stated out loud in closureProblems, with the cost accepted - and every route
    // into this app has to reach the same verdict: the boot, the reopen, a snapshot
    // arriving from another phone, and a second phone opening the same disk. If any of
    // them differed, whether a man's books are called sound would depend on which door
    // he came through.
    // BUILT AS A DISK, not by editing a live device's memory. A device that wrote the
    // closure itself has it in its journal, and the journal replays over the edit at the
    // next load - correctly, and it would measure the journal rather than the policy.
    // This is somebody's phone, opened for the first time on this build.
    const source = closed('d_policy_seed');
    const seedEntry = closureIn(source);
    const legacy = JSON.parse(source.dump()['scheduleData:v2']);
    const bare = {};
    ['id', 'advanceId', 'kind', 'workerId', 'balanceAfter', 'date',
        'periodFrom', 'periodTo', 'amount', 'at', 'by'].forEach(field => {
            bare[field] = seedEntry[field];
        });
    legacy.ledger.advances = { [seedEntry.id]: bare };
    const LEGACY_DISK = JSON.stringify(legacy);
    const openLegacy = id => {
        const made = makeDevice({ deviceId: id,
            flags: { carryAdvances: true, ledgerWrites: true },
            storage: { 'scheduleData:v2': LEGACY_DISK } });
        made.setToday('2026-08-26');
        made.ctx.askTell = () => Promise.resolve();
        made.State.load();
        return made;
    };

    const device = openLegacy('d_policy');
    const entry = { id: seedEntry.id };

    // The boot mirror writes the advance's origin entry, as it does on every device;
    // what must not be there is a snapshot on the closure or a period artifact beside it.
    given('the closure carries no snapshot and no artifact stands beside it',
        device.State.schedule.ledger.advances[entry.id].gross === undefined
        && Object.keys(device.State.schedule.ledger.advances)
            .every(id => String(id).indexOf('le_period_') !== 0),
        JSON.stringify(Object.keys(device.State.schedule.ledger.advances)));

    const verdict = who => JSON.stringify(who.call('impossibleClosures', who.State.schedule));
    const payslipOf = who => JSON.stringify(who.call('advanceAccount', who.State.schedule,
        'w_01', A.from, A.to));

    const atBoot = verdict(device);
    const paidAtBoot = payslipOf(device);
    given('at boot it is unaccused', atBoot === '[]', atBoot);

    const once = openLegacy('d_policy1');
    same('a second phone opening the same disk reaches the same verdict',
        verdict(once), atBoot);
    same('and reads the same payslip', payslipOf(once), paidAtBoot);

    const twice = reopen(once, 'd_policy2');
    same('and so does a reopen of that one', verdict(twice), atBoot);

    const arriving = JSON.parse(JSON.stringify(device.State.schedule));
    arriving.updatedAt = '2026-08-28T10:00:00.000Z';
    arriving.updatedBy = 'd_far';
    twice.Sync.receive(arriving);
    same('a snapshot of the same record does not change it', verdict(twice), atBoot);
    same('nor the payslip it reports', payslipOf(twice), paidAtBoot);

    // AND THE COST STAYS THE COST, on every route. Move a day out of the fortnight and
    // the live wage is the only evidence there is, so the accusation appears - and it
    // appears identically everywhere, rather than on some doors and not others.
    // Built as a disk again, for the same reason: this is what the record looks like on
    // a phone where that day was never recorded.
    const moved = JSON.parse(LEGACY_DISK);
    delete moved.days['2026-08-14'];
    const openMoved = id => {
        const made = makeDevice({ deviceId: id,
            flags: { carryAdvances: true, ledgerWrites: true },
            storage: { 'scheduleData:v2': JSON.stringify(moved) } });
        made.setToday('2026-08-26');
        made.ctx.askTell = () => Promise.resolve();
        made.State.load();
        return made;
    };
    const held = openMoved('d_policy3');
    check('a record whose live wage disagrees holds the closure aside',
        Object.keys(held.State.schedule.ledger.unreadable).indexOf(entry.id) !== -1,
        JSON.stringify(Object.keys(held.State.schedule.ledger.unreadable)));
    check('and stops the phone rather than paying from it',
        held.call('farkadWritesBlocked') === true);
    const heldPayslip = payslipOf(held);
    same('a second phone on the same disk reaches the same state',
        [Object.keys(openMoved('d_policy4').State.schedule.ledger.unreadable),
            openMoved('d_policy5').call('farkadWritesBlocked'),
            payslipOf(openMoved('d_policy6'))],
        [[entry.id], true, heldPayslip]);
    same('and a reopen of the held phone does not change its mind',
        [Object.keys(reopen(held, 'd_policy7').State.schedule.ledger.unreadable),
            reopen(held, 'd_policy8').call('farkadWritesBlocked')],
        [[entry.id], true]);
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

// ------------------------------------- the phone that never wrote a closure still reads it
{
    suite('a fortnight closed on one phone is frozen on a phone whose gate is shut');

    // THREE PHONES DO NOT UPDATE TOGETHER, and the flip is per phone. The day the first
    // phone closes a fortnight with the gate open, the other two are still reading the
    // same record with both flags off - which is what a person installs today - and the
    // sheet they print is the sheet the crew is paid from. closedPeriods is read by the
    // walk with no gate in front of it, deliberately: the closure is a fact about the
    // record, not about this build, and a phone that recomputed the live wage where the
    // closing phone printed the frozen one would be two phones printing different money
    // for one fortnight. Pinned here so that gating it later is a decision, not a drift.
    const closer = closed('d_gate_open');
    const disk = closer.dump();

    const shut = makeDevice({ deviceId: 'd_gate_shut', storage: disk });
    shut.setToday('2026-08-26');
    shut.ctx.askTell = () => Promise.resolve();
    shut.State.load();
    given('the shut phone is what a person installs',
        shut.call('advanceCarryEnabled') === false
            && shut.call('ledgerWritesEnabled') === false,
        JSON.stringify([shut.call('advanceCarryEnabled'), shut.call('ledgerWritesEnabled')]));
    given('and it read the closure off the shared record', closureIn(shut) !== null,
        JSON.stringify(Object.keys(shut.State.schedule.ledger.advances)));

    const row = () => shut.call('payrollReport', shut.State.schedule, A.from, A.to)
        .find(line => line.workerId === 'w_01') || {};
    const days = () => shut.call('workerDaysReport', shut.State.schedule,
        shut.State.schedule.workers[0], A.from, A.to);
    given('the closed fortnight starts as it was closed',
        Number(row().amount) === GROSS && days().length === DAYS.length,
        JSON.stringify([row().amount, days().length]));

    // The same day removed that moves the open build's payslip 3,050 -> 2,440.
    shut.State.commit(shut.call('clearWorkerDay', shut.State.schedule,
        '2026-08-14', 'w_01', 'actual'));
    check('the wage stays the wage it was closed on', Number(row().amount) === GROSS,
        JSON.stringify(row()));
    check('and the days are the days it was closed on',
        days().length === DAYS.length
            && days().map(day => day.date).join(',') === DAYS.join(','),
        JSON.stringify(days().map(day => day.date)));

    // And across a reopen with the gate still shut - the ordinary next morning.
    const morning = makeDevice({ deviceId: 'd_gate_shut2', storage: shut.dump() });
    morning.setToday('2026-08-27');
    morning.ctx.askTell = () => Promise.resolve();
    morning.State.load();
    check('the next morning, still', Number((morning.call('payrollReport',
        morning.State.schedule, A.from, A.to).find(line => line.workerId === 'w_01')
        || {}).amount) === GROSS,
        JSON.stringify(morning.call('payrollReport', morning.State.schedule, A.from, A.to)));
}


// ------------------------------------------- the writer and the judge, one arithmetic
{
    suite('a fortnight closed after the man has already repaid something');

    // THE ORDINARY LATE CLOSE, and it needed no race and no clock skew to break.
    //
    // The man repays 400 on the 24th. The boss closes the 07-20 fortnight on the 26th,
    // which is when a fortnight actually gets closed - after it has ended, with a cheque
    // to write. planPeriodClosure computed the carried balance from the WHOLE record, so
    // it counted the 400; closureProblems judges a closure as of the period's end, so it
    // did not. The closure was written, accepted, and then condemned by this app's own
    // reader: impossibleClosures named it and the phone blocked its own writes on the
    // next boot. Measured on 4a4d277 - the rule saw 5,000 left, the plan computed from
    // 4,600.
    //
    // Money dated after the period is late money. advanceWalk has carried it into the
    // next account since v80 and calls it lateSinceClose; it never belonged in the frozen
    // figure, and the writer is the half that was wrong.
    const device = crew('d_late');
    const advanceId = advanceIdIn(device);
    device.State.commit(device.call('recordAdvanceRepaid', device.State.schedule,
        advanceId, 400, '2026-08-24', '', '2026-08-24T09:00:00.000Z', 'd_late', 'cash'));
    given('the repayment is on the record before the close, dated after the period',
        device.call('advanceOutstanding', device.State.schedule, advanceId).repaid === 400,
        JSON.stringify(device.call('advanceOutstanding', device.State.schedule, advanceId)));

    const plan = device.call('planPeriodClosure', device.State.schedule, 'w_01',
        A.from, A.to, '2026-08-26T10:00:00.000Z');
    check('the fortnight can still be closed', plan.canClose === true,
        JSON.stringify(plan.reasons));
    check('and the balance it will carry is the period\'s, not the record\'s',
        plan.rows.length === 1 && plan.rows[0].balanceAfter === CLOSING,
        JSON.stringify(plan.rows));

    const changes = device.call('closePeriodChanges', device.State.schedule, 'w_01',
        A.from, A.to, '2026-08-26T10:00:00.000Z', 'd_late');
    given('the close wrote its entries', changes.length > 0, String(changes.length));
    given('and they committed', device.State.commitMany(changes) === true, 'commitMany');

    // THE DEDUCTION, by name. closureIn takes whichever entry of this period comes first,
    // and closureProblems returns from an artifact before it asks the money questions -
    // so judging the artifact here would pass on a closure nobody had checked.
    const closure = Object.values(device.State.schedule.ledger.advances)
        .find(entry => entry.kind === 'deducted' && entry.periodFrom === A.from);
    given('the deduction is the entry under test', Boolean(closure),
        JSON.stringify(Object.values(device.State.schedule.ledger.advances)
            .map(entry => entry.kind)));
    check('the closure this app wrote is one this app can read',
        device.call('closureProblems', device.State.schedule, closure).length === 0,
        JSON.stringify(device.call('closureProblems', device.State.schedule, closure)));
    check('nothing is impossible about it',
        device.call('impossibleClosures', device.State.schedule).length === 0,
        JSON.stringify(device.call('impossibleClosures', device.State.schedule)));

    // AND THE PHONE IS NOT IN RECOVERY THE NEXT MORNING. This is what the defect cost:
    // not a wrong number on a screen, but a phone that will not record a day.
    const morning = reopen(device, 'd_late2');
    check('and the phone that wrote it can still record work tomorrow',
        morning.call('farkadWritesBlocked') === false,
        JSON.stringify(morning.call('impossibleClosures', morning.State.schedule)));

    // The 400 is not lost and not in the frozen figure: it is late money, which is the
    // whole of the two-balance design.
    const account = morning.call('advanceAccount', morning.State.schedule, 'w_01',
        A.from, A.to);
    check('the frozen balance is the period\'s', account.carriedOut === CLOSING,
        JSON.stringify(account));
    check('and the 400 is carried as money that arrived after the close',
        morning.call('advanceOutstanding', morning.State.schedule, advanceId).left
            === CLOSING - 400,
        JSON.stringify(morning.call('advanceOutstanding', morning.State.schedule, advanceId)));
}

// ------------------------------------------------------- a clock that is behind refuses
{
    suite('a phone whose clock is behind is told, not allowed to move money quietly');

    // The other phone recorded a repayment INSIDE the fortnight at 19:00. This phone's
    // clock says 18:00, so the closure it would write excludes an entry that was really
    // recorded before it - and the 400 would land in the next fortnight instead of this
    // one, on a payslip, because a phone is wrong about the time. No money is lost either
    // way, which is exactly why it would never be noticed.
    //
    // Refusing is reversible. «סגירה היא סופית» - a frozen payslip is not.
    const device = crew('d_slow');
    const advanceId = advanceIdIn(device);
    device.State.commit(device.call('recordAdvanceRepaid', device.State.schedule,
        advanceId, 400, '2026-08-12', '', '2026-08-20T19:00:00.000Z', 'd_fast', 'cash'));

    const before = JSON.stringify(device.State.schedule.ledger.advances);
    const plan = device.call('planPeriodClosure', device.State.schedule, 'w_01',
        A.from, A.to, '2026-08-20T18:00:00.000Z');
    check('the close is refused', plan.canClose === false, JSON.stringify(plan.reasons));
    check('and it says why, in a word the screen can act on',
        plan.reasons.indexOf('clock') !== -1, JSON.stringify(plan.reasons));

    const changes = device.call('closePeriodChanges', device.State.schedule, 'w_01',
        A.from, A.to, '2026-08-20T18:00:00.000Z', 'd_slow');
    check('nothing is written', changes.length === 0, JSON.stringify(changes));
    check('and the record is exactly as it was',
        JSON.stringify(device.State.schedule.ledger.advances) === before, 'unchanged');

    // AND THE SAME PHONE, ONCE ITS CLOCK HAS CAUGHT UP, CLOSES NORMALLY. The refusal is
    // about one moment, not about this phone for ever.
    //
    // Asked of a device the refusal never touched: closePeriodChanges APPENDS its entries
    // to the schedule as it plans them, so the call above has already put this fortnight's
    // artifact on `device` even though nothing was committed.
    const caught = crew('d_caught');
    caught.State.commit(caught.call('recordAdvanceRepaid', caught.State.schedule,
        advanceIdIn(caught), 400, '2026-08-12', '', '2026-08-20T19:00:00.000Z',
        'd_fast', 'cash'));
    const later = caught.call('planPeriodClosure', caught.State.schedule, 'w_01',
        A.from, A.to, '2026-08-20T19:30:00.000Z');
    check('with the clock caught up it closes', later.canClose === true,
        JSON.stringify(later.reasons));
    check('and the 400 is inside the fortnight it was recorded in',
        later.rows.length === 1 && later.rows[0].balanceAfter === CLOSING - 400,
        JSON.stringify(later.rows));

    // An entry excluded for its DATE is ordinary late money and refuses nothing - the
    // suite above closes on exactly that and must not be caught by this rule.
    const dated = crew('d_dated');
    dated.State.commit(dated.call('recordAdvanceRepaid', dated.State.schedule,
        advanceIdIn(dated), 400, '2026-08-24', '', '2026-08-24T09:00:00.000Z',
        'd_dated', 'cash'));
    check('late money does not refuse a close',
        dated.call('planPeriodClosure', dated.State.schedule, 'w_01', A.from, A.to,
            '2026-08-26T10:00:00.000Z').canClose === true,
        JSON.stringify(dated.call('planPeriodClosure', dated.State.schedule, 'w_01',
            A.from, A.to, '2026-08-26T10:00:00.000Z').reasons));
}


// ------------------------------------- a frozen fortnight belongs to the fortnight, only
{
    suite('a closed fortnight is frozen for its own period and no other');

    // KEYED ON THE START DATE ALONE, which is not what a closure is.
    //
    // closedPeriods folds its answers under periodFrom and throws periodTo away, and the
    // three readers - payrollReport, workerDaysReport and advanceWalk - then apply the
    // frozen payslip to ANY range that happens to begin on that Friday, whatever it ends
    // on. A closure is a record of [periodFrom, periodTo]; half of that is not an
    // account.
    //
    // It needs no hand-picked range to reach. Some months open on an account start -
    // 2026-05-01, 2027-10-01, 2028-09-01, 2030-02-01, 2030-03-01, 2031-08-01 - and on
    // those the ordinary «החודש» preset starts on the same Friday as the fortnight. The
    // boss closes the first fortnight, presses החודש, and the sheet he prints and exports
    // shows the man half his month: measured at 10 days and 5,000 where the crew worked
    // 20 for 10,000, with the invoice in the same workbook still billing all twenty.
    //
    // And the same fault prices a day TWICE: read this fortnight as two halves that do
    // not overlap and the first answers with the whole frozen fortnight while the second
    // answers live, so the 14th is counted in both and the two add to more than the
    // fortnight is worth.
    const device = closed('d_range');
    const worker = () => device.State.schedule.workers[0];
    const payrollAt = (from, to) => device.call('payrollReport', device.State.schedule,
        from, to).find(row => row.workerId === 'w_01') || {};
    const daysAt = (from, to) => device.call('workerDaysReport', device.State.schedule,
        worker(), from, to);

    given('the account itself is frozen, which is the behaviour that must not move',
        payrollAt(A.from, A.to).amount === GROSS
            && daysAt(A.from, A.to).length === DAYS.length,
        JSON.stringify([payrollAt(A.from, A.to).amount, daysAt(A.from, A.to).length]));

    // FOUR WEEKS starting on the same Friday, with work in them AFTER the fortnight
    // closed - which is the ordinary case and the one that makes this check bite. Two
    // more days at the same rate, outside the closed period entirely.
    ['2026-08-24', '2026-08-25'].forEach(date => device.State.commit(device.call(
        'assignPlace', device.State.schedule, date, 'w_01', 'actual', 'p_01')));
    given('there is work after the closed fortnight',
        device.State.schedule.days['2026-08-24'] !== undefined, '2026-08-24');
    const wide = payrollAt(A.from, '2026-09-03');
    check('a longer range that merely starts on that Friday is not the frozen period',
        wide.amount === GROSS + 2 * RATE
            && daysAt(A.from, '2026-09-03').length === DAYS.length + 2,
        JSON.stringify({ amount: wide.amount, expected: GROSS + 2 * RATE,
            days: daysAt(A.from, '2026-09-03').length }));

    // ONE WEEK, the first half. Four of the five days are in it; the fifth is not.
    const half = payrollAt(A.from, '2026-08-13');
    check('a shorter range that starts on that Friday is priced on its own days',
        half.amount === 4 * RATE, JSON.stringify(half));
    check('and it lists only the days inside it',
        daysAt(A.from, '2026-08-13').map(day => day.date).join(',')
            === DAYS.slice(0, 4).join(','),
        JSON.stringify(daysAt(A.from, '2026-08-13').map(day => day.date)));

    // THE TWO HALVES ADD TO THE FORTNIGHT. This is the double-pricing test: they do not
    // overlap, so their sum is the whole account and not a penny more.
    const second = payrollAt('2026-08-14', A.to);
    check('two halves that do not overlap add to exactly the fortnight',
        half.amount + second.amount === GROSS,
        JSON.stringify({ first: half.amount, second: second.amount, whole: GROSS }));

    // And the day list does not repeat one day across the two halves.
    const firstDays = daysAt(A.from, '2026-08-13').map(day => day.date);
    const secondDays = daysAt('2026-08-14', A.to).map(day => day.date);
    check('and no day is listed in both halves',
        firstDays.every(date => secondDays.indexOf(date) === -1)
            && firstDays.length + secondDays.length === DAYS.length,
        JSON.stringify([firstDays, secondDays]));
}

report();
