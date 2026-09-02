// The arithmetic, stated as money rather than as fields.
//
//   node tests/money.test.mjs
//
// Every other suite here asks whether a record survived. This one asks what a person is
// HANDED: the gross on one man's pay slip, the advance taken off it, the net, the count
// of worker-days each client is billed for. The unit is the shekel, and every expected
// value below is a literal - a number somebody could check on paper - never the output
// of the same function called twice.
//
// One crew, one account, recorded through the same doors the app uses: assignPlace and
// markAbsent through State.commit, a rate raised through State.commitRoster, an advance
// through addAdvance. Then the identical shekels are asked for again after the app is
// closed and reopened, on a second phone that adopted the cloud document, through a real
// backup file read by importBackup, and after a whole-document restore.

import { makeDevice, makeCloud, settle } from './harness.mjs';
import { suite, check, same, given, report } from './runner.mjs';

import vm from 'node:vm';
import { readFileSync } from 'node:fs';

// The account the crew is actually paid on: the Friday that ACCOUNT_ANCHOR names in
// js/dates.js, and the thirteen days after it. Not a month - a month boundary is not a
// payday and nobody is ever handed one.
const FROM = '2026-08-07';
const TO = '2026-08-20';

// The two accounts either side, so a day and an advance can be shown landing in exactly
// one of the three.
const PREV = { from: '2026-07-24', to: '2026-08-06' };
const NEXT = { from: '2026-08-21', to: '2026-09-03' };

const TICK = 6;

// One phone with the crew on it. Rates are the money: 400 a day and 50 an hour for דוד,
// 350 a day and NO hourly rate for שרה, and nothing at all for עלי - a man whose rate
// has not been decided is not a man who is owed nothing.
function crew(options = {}) {
    const device = makeDevice(options);
    // The calendar is pinned because the backup filename, the daily archive key and every
    // default range are built from today. A money suite whose numbers depend on the day
    // it is run is a suite that reports a rounding error as a rate bug next August.
    device.setToday('2026-08-20');
    device.State.schedule.workers = [
        { id: 'w_01', name: 'דוד', active: true, dailyRate: 400, hourlyRate: 50 },
        { id: 'w_02', name: 'שרה', active: true, dailyRate: 350, hourlyRate: 0 },
        { id: 'w_03', name: 'עלי', active: true, dailyRate: 0, hourlyRate: 0 }
    ];
    device.State.schedule.places = [
        { id: 'p_01', name: 'הרצליה', active: true },
        { id: 'p_02', name: 'תל אביב', active: true }
    ];
    device.State.save({ silent: true });
    return device;
}

// The fortnight, recorded the way an evening is recorded: one commit per edit, through
// the model function the button calls.
function fill(device) {
    const schedule = () => device.State.schedule;
    const put = (date, workerId, placeId, rate, hours) => device.State.commit(
        device.call('assignPlace', schedule(), date, workerId, 'actual', placeId, rate, hours));

    put('2026-08-07', 'w_01', 'p_01');
    // Two sites on one date. He was there once: one attendance day, one day of pay - and
    // two lines on the invoice, because both clients had a man on site. Counting the
    // entries instead pays him twice for standing in two places.
    put('2026-08-09', 'w_01', 'p_01');
    put('2026-08-09', 'w_01', 'p_02');
    put('2026-08-10', 'w_01', 'p_01', 'double');
    put('2026-08-11', 'w_01', 'p_01', 'extra', 3);
    // Away. Not a site, not a day of pay, and not a deduction either.
    device.State.commit(device.call('markAbsent', schedule(), '2026-08-12', 'w_01', 'actual'));
    put('2026-08-20', 'w_01', 'p_01');

    // One day on each side of the account seam, so the boundary can be shown to be a
    // boundary rather than a filter that happens to pass everything.
    put('2026-08-06', 'w_01', 'p_01');
    put('2026-08-21', 'w_01', 'p_01');

    // Extra hours with no hourly rate on the roster: the day is paid, the hours are not,
    // and the sheet has to say so instead of quietly pricing them at nothing.
    put('2026-08-13', 'w_02', 'p_02', 'extra', 2);
    put('2026-08-14', 'w_02', 'p_02');

    // A day worked by a man with no rate. Unknown, which is not zero.
    put('2026-08-17', 'w_03', 'p_01');

    device.State.commit(device.call('addAdvance', schedule(), 'w_01', '2026-08-10', 500, ''));
    // Handed over on the first day of the NEXT account. It comes off that account, not
    // this one - money taken twice is the failure this record exists to prevent.
    device.State.commit(device.call('addAdvance', schedule(), 'w_01', '2026-08-21', 200, ''));
    // Cash to a man with no daily rate. Real money, whatever the sheet can say about it.
    device.State.commit(device.call('addAdvance', schedule(), 'w_03', '2026-08-17', 300, ''));

    // The raise, AFTER those days were recorded and through the roster door a person
    // presses. Every day above keeps the 400 it was worked at; only what is recorded
    // from here is worth 500.
    schedule().workers.find(worker => worker.id === 'w_01').dailyRate = 500;
    given('the raise was committed durably', device.State.commitRoster() === true);
    put('2026-08-18', 'w_01', 'p_01');
}

// The three pay slips, as the numbers on them: gross earned, advances taken off, and
// what is left. null is the app's word for "there is no rate, so this is not known" -
// never 0, which reads as "owed nothing".
function payslips(device, from = FROM, to = TO) {
    return device.call('payrollReport', device.State.schedule, from, to)
        .map(row => [row.name, row.amount, row.advances, row.netAmount]);
}

// What each client is billed: worker-days at that client's site. This app bills days,
// not shekels, so these are the numbers that become an invoice.
function billing(device, from = FROM, to = TO) {
    return device.call('invoiceReport', device.State.schedule, from, to)
        .map(row => [row.name, row.workerDays]);
}

// js/ui/reports.js is a classic script like the rest, so the file a bookkeeper opens and
// the message a worker receives are produced HERE, by the shipped functions, with no
// browser and no spreadsheet library.
function reportsIn(device, from = FROM, to = TO) {
    const run = code => vm.runInContext(code, device.ctx, { filename: 'harness:reports' });
    run(readFileSync(new URL('../js/ui/reports.js', import.meta.url), 'utf8'));
    run(`REPORT_RANGE.from = '${from}'; REPORT_RANGE.to = '${to}';`
        + `REPORT_SECTION = 'workers'; INVOICE_PLACE = null;`);
    return run;
}

const THREE_SLIPS = [['דוד', 3050, 500, 2550], ['שרה', 700, 0, 700], ['עלי', null, 300, null]];
const TWO_CLIENTS = [['הרצליה', 7], ['תל אביב', 3]];

// ---------------------------------------------------------------- the fortnight
{
    suite('one fortnight, in the shekels each man is handed');

    const device = crew({ deviceId: 'd_money' });
    fill(device);

    // 400 + 400 + 800 + 550 + 500 + 400 = 3050 for דוד, less the 500 he took on the 10th.
    // 350 + 350 for שרה, with her two extra hours unpriced. עלי worked a day nobody can
    // price and was handed 300 in cash.
    same('the three pay slips', payslips(device), THREE_SLIPS);

    const rows = device.call('payrollReport', device.State.schedule, FROM, TO);
    const david = rows.find(row => row.workerId === 'w_01');

    // Two counts, because one cannot answer both questions: six DATES on a site, seven
    // days of PAY. A sheet printing the first beside a total computed from the second is
    // where this split came from.
    same('דוד: six days on site, seven days of pay, one of them double, three extra hours, one away',
        [david.attendanceDays, david.payUnits, david.doubleDays, david.extraHours, david.absent],
        [6, 7, 1, 3, 1]);

    const days = device.call('workerDaysReport', device.State.schedule,
        device.State.schedule.workers[0], FROM, TO);
    same('and every one of his days is priced at what that day was worth',
        days.map(day => [day.date, day.amount]),
        [['2026-08-07', 400], ['2026-08-09', 400], ['2026-08-10', 800], ['2026-08-11', 550],
            ['2026-08-12', 0], ['2026-08-18', 500], ['2026-08-20', 400]]);

    // The one that is somebody's rent: his rate is 500 today, and the six days he worked
    // before the raise are still 400. 7 pay units at today's 500 would be 3500, and that
    // 450 is the difference between paying a man what he agreed to and repaying his past
    // at this month's price.
    check('a raise does not repay the past: 3050, not the 3500 today\'s rate would make',
        david.amount === 3050 && david.dailyRate === 500, `${david.amount} at ${david.dailyRate}`);
    same('the day he worked on the 7th still carries the rate it was worked at',
        device.State.schedule.days['2026-08-07'].actual.w_01.rates, { daily: 400, hourly: 50 });
    check('and the sheet says the rate beside the total is not the whole story',
        david.mixedRates === true, String(david.mixedRates));

    // Two sites, one day. One day of pay at the rate stamped on it.
    check('two sites on one date is one day of pay, not two',
        days.find(day => day.date === '2026-08-09').amount === 400
        && david.siteVisits === 7,
        `${days.find(day => day.date === '2026-08-09').amount} over ${david.siteVisits} visits`);

    // The absence. Nothing earned, nothing deducted: 3050 is the six worked days and the
    // 12th is not one of them.
    const worked = days.filter(day => !day.absent).reduce((sum, day) => sum + day.amount, 0);
    check('the day he was away earns nothing and takes nothing off the rest',
        worked === 3050 && days.find(day => day.date === '2026-08-12').absent === true,
        String(worked));

    const sarah = rows.find(row => row.workerId === 'w_02');
    // 700, not 800: two hours at an hourly rate that was never entered are not worth
    // 350 a day, and they are not worth a guess either.
    check('two extra hours with no hourly rate are not priced, and the row says so',
        sarah.amount === 700 && sarah.extraHours === 2 && sarah.hoursUnpriced === true,
        `${sarah.amount} / ${sarah.extraHours}`);

    const ali = rows.find(row => row.workerId === 'w_03');
    check('a man with no rate is owed an unknown amount, and the 300 he took is still recorded',
        ali.amount === null && ali.netAmount === null && ali.advances === 300,
        JSON.stringify([ali.amount, ali.advances, ali.netAmount]));
}

// ---------------------------------------------------------------- the account seam
{
    suite('the fourteen-day account is where the money stops');

    const device = crew({ deviceId: 'd_seam' });
    fill(device);
    const dayStr = date => device.call('toLocalDateStr',
        device.call('accountStart', device.call('parseLocalDate', date)));

    same('the account containing the 20th opened on the 7th, and the 21st opens the next one',
        [dayStr('2026-08-20'), dayStr('2026-08-21'), dayStr('2026-08-06')],
        [FROM, NEXT.from, PREV.from]);

    // 400 on the 6th, 3050 across the account, 400 on the 21st: every shekel in exactly
    // one account, none of them in two, none of them nowhere.
    const prev = payslips(device, PREV.from, PREV.to).find(slip => slip[0] === 'דוד');
    const next = payslips(device, NEXT.from, NEXT.to).find(slip => slip[0] === 'דוד');
    same('the day before the seam is the previous account\'s money', prev, ['דוד', 400, 0, 400]);
    // The 200 he took on the 21st comes off the account he took it in - deducting it
    // here as well is paying for it twice, and deducting it nowhere is a gift.
    same('and the day and the advance after the seam are the next one\'s', next, ['דוד', 400, 200, 200]);

    const wide = payslips(device, PREV.from, NEXT.to).find(slip => slip[0] === 'דוד');
    same('three accounts laid end to end lose nothing and count nothing twice',
        wide, ['דוד', 3850, 700, 3150]);

    const run = reportsIn(device);
    check('and the app calls this range one whole account, שישי–חמישי',
        run(`wholeAccountRange('${FROM}', '${TO}')`) === true
        && run(`wholeAccountRange('${FROM}', '2026-08-19')`) === false);
}

// ---------------------------------------------------------------- the client's bill
{
    suite('what each client is billed for the same fortnight');

    const device = crew({ deviceId: 'd_bill' });
    fill(device);

    // הרצליה: the 7th, 9th, 10th, 11th, 17th, 18th and 20th. תל אביב: the 9th, 13th and
    // 14th. Ten worker-days between them.
    same('two clients, seven worker-days and three', billing(device), TWO_CLIENTS);

    const grid = device.call('invoiceByDate', device.State.schedule, FROM, TO);
    check('ten worker-days in total', grid.total === 10, String(grid.total));
    // The same date the pay sheet counts once. The man is paid for one day; the two
    // clients are billed for one man each, and neither of them is billed for half of him.
    check('the man who was at two sites on the 9th is billed to both of them',
        grid.countAt('p_01', '2026-08-09') === 1 && grid.countAt('p_02', '2026-08-09') === 1,
        `${grid.countAt('p_01', '2026-08-09')} + ${grid.countAt('p_02', '2026-08-09')}`);
    check('the days outside the account are billed to nobody in it',
        grid.countAt('p_01', '2026-08-06') === 0 && grid.countAt('p_01', '2026-08-21') === 0);

    const run = reportsIn(device);
    same('and the billing grid the client is handed is that, date by date',
        JSON.parse(JSON.stringify(run('invoiceSheetRows()'))),
        [['תאריך', 'הרצליה', 'תל אביב', 'סה״כ'],
            ['2026-08-07', 1, 0, 1], ['2026-08-09', 1, 1, 2], ['2026-08-10', 1, 0, 1],
            ['2026-08-11', 1, 0, 1], ['2026-08-13', 0, 1, 1], ['2026-08-14', 0, 1, 1],
            ['2026-08-17', 1, 0, 1], ['2026-08-18', 1, 0, 1], ['2026-08-20', 1, 0, 1],
            ['סה״כ', 7, 3, 10]]);
}

// ---------------------------------------------------------------- the man's own copy
{
    suite('the numbers the worker receives on his phone');

    const device = crew({ deviceId: 'd_msg' });
    fill(device);
    const run = reportsIn(device);

    const statement = run(`workerStatementText('w_01')`);
    // Pinned exactly, including the invisible LRM in front of the minus: '-500' lays out
    // as '500-' inside a Hebrew line, and a man reading his own advance backwards is the
    // one argument nobody can win afterwards.
    same('דוד is told his days, his gross, his advance and what is left',
        [statement.includes('• שני 10/08 - הרצליה (כפול) - 800'),
            statement.includes('• רביעי 12/08 - נעדר'),
            statement.includes('\nנצבר: 3050'),
            statement.includes('\nמקדמה 10/08: ‎-500'),
            statement.includes('\nנותר לתשלום: 2550')],
        [true, true, true, true, true]);
    // The advance he takes on the 21st belongs to the next message. A worker who is
    // shown it twice is a worker who is told he owes 200 he only ever took once.
    check('and the advance he takes on the 21st is not on this fortnight\'s message',
        !statement.includes('מקדמה 21/08') && !statement.includes('\u200E-200'),
        statement.slice(statement.indexOf('מקדמה')));

    const hers = run(`workerStatementText('w_02')`);
    check('שרה is told her hours were not priced, in the same message as her total',
        hers.includes('\nנצבר: 700')
        && hers.includes('\n* שעות נוספות בלי שכר שעה - לא נכללו בסכום.')
        && hers.includes('\nנותר לתשלום: 700'),
        JSON.stringify(hers.slice(-120)));
}

// ---------------------------------------------------------------- the bookkeeper's file
{
    suite('the pay sheet that leaves the phone');

    const device = crew({ deviceId: 'd_sheet' });
    fill(device);
    const run = reportsIn(device);
    const sheet = JSON.parse(JSON.stringify(run('payrollSheetRows()')));

    // עלי's row moved in the commit that made this file reconcile. He has no daily rate,
    // so his נצבר cannot be computed - but he was handed 300, and a row with money in it
    // has to add up or the money is in a column no total reaches. The 0 is not a claim
    // that he earned nothing; the הערה beside it says so. A man with no rate and no
    // advances still gets three blanks: nothing there needs adding up.
    same('eleven columns, and the same money the screen shows under them',
        sheet,
        [['עובד', 'ימי נוכחות', 'ימי שכר', 'מתוכם כפולים', 'שעות נוספות', 'נעדר',
            'שכר יומי', 'נצבר', 'מקדמות', 'לתשלום', 'הערה'],
            ['דוד', 6, 7, 1, 3, 1, 500, 3050, -500, 2550, ''],
            ['שרה', 2, 2, 0, 2, 0, 350, 700, 0, 700, 'שעות נוספות בלי שכר שעה - לא נכללו'],
            ['עלי', 1, 1, 0, 0, 0, 0, 0, -300, -300,
                'בלי שכר יומי - הנצבר לא חושב']]);

    // Column indices, named once: the file is read by position and a shifted column is a
    // man paid another man's net.
    const GROSS = 7, ADVANCES = 8, NET = 9;
    const sum = index => sheet.slice(1)
        .reduce((total, row) => total + (typeof row[index] === 'number' ? row[index] : 0), 0);

    check('every row that can be added up, adds up',
        sheet.slice(1).filter(row => typeof row[NET] === 'number')
            .every(row => row[GROSS] + row[ADVANCES] === row[NET]),
        JSON.stringify(sheet.slice(1).map(row => [row[0], row[GROSS], row[ADVANCES], row[NET]])));

    // RED. The three money columns are the reconciliation renderPayrollTable states in
    // its own words - נצבר − מקדמות = לתשלום - and down the column they do not: 3750
    // less 800 is 2950, and the לתשלום column adds to 3250. The 300 in the gap is cash
    // that was handed to עלי and appears in one column of this file and in no total of
    // it. There is no totals row here to catch it, so the person who catches it is the
    // bookkeeper, next month, in an argument about 300 shekels.
    check('the file\'s own columns reconcile: לתשלום is נצבר less מקדמות, down the whole column',
        sum(GROSS) + sum(ADVANCES) === sum(NET),
        `${sum(GROSS)} + (${sum(ADVANCES)}) = ${sum(GROSS) + sum(ADVANCES)}, column says ${sum(NET)}`);

    // Half a shekel, arriving the way one really can: the advance form refuses a fraction
    // (js/ui/reports.js, /^\d+$/), and nothing on the wire does - advanceProblems asks
    // only that the amount is a finite number - so a backup, an import or another phone
    // can put one on this disk. Driven through importBackup so the door is the real one.
    const source = crew({ deviceId: 'd_half_src' });
    source.State.commit(source.call('assignPlace',
        source.State.schedule, '2026-08-07', 'w_01', 'actual', 'p_01'));
    source.State.commit(source.call('addAdvance',
        source.State.schedule, 'w_01', '2026-08-07', 250.5, ''));

    const target = crew({ deviceId: 'd_half' });
    target.ctx.askTell = () => Promise.resolve();
    target.ctx.askConfirm = () => Promise.resolve(true);
    target.call('importBackup', target.fileEvent('farkad-2026-08-20.json',
        JSON.stringify(source.State.schedule)));
    await settle(120);
    given('the half-shekel advance is on the target\'s disk',
        JSON.stringify(JSON.parse(target.raw('scheduleData:v2')).advances).includes('250.5'));

    const halfRun = reportsIn(target);
    const halfRow = JSON.parse(JSON.stringify(halfRun('payrollSheetRows()')))[1];
    // RED. 400 earned, 250.5 taken, 149.5 left - and the file rounds all three
    // separately: 400, -251, 150. 400 − 251 is 149. One shekel, printed twice as two
    // different answers on one row, on the row somebody is paid from.
    check('and half a shekel does not break the row it is on',
        halfRow[GROSS] + halfRow[ADVANCES] === halfRow[NET], JSON.stringify(halfRow));
}

// ---------------------------------------------------------------- and it stays the same
//
// The record is worth nothing if the number changes on the way through a door. Each of
// the four below asks for the SAME literal shekels, on the far side of a real one.
{
    suite('the same shekels after the app is closed and opened');

    const device = crew({ deviceId: 'd_reopen' });
    fill(device);

    // The bytes, and nothing else: a new V8 context booting from this disk is what the
    // second morning is.
    const again = makeDevice({ storage: device.dump(), deviceId: 'd_reopen' });
    again.setToday('2026-08-20');
    again.State.load();

    same('the three pay slips', payslips(again), THREE_SLIPS);
    same('and the two clients', billing(again), TWO_CLIENTS);
    // The rate on the roster is 500 and six of his days are 400. If the stamps had not
    // survived the write and the read back, this row would say 3500 and nothing else in
    // the app would look wrong.
    same('and the days he worked before the raise are still worth 400',
        again.State.schedule.days['2026-08-07'].actual.w_01.rates, { daily: 400, hourly: 50 });
}

{
    suite('the same shekels on the second phone');

    const device = crew({ deviceId: 'd_cloud_a' });
    fill(device);

    const cloud = makeCloud();
    device.Sync.pushDelayMs = TICK;
    device.Sync.connect(cloud.adapter);
    await settle(TICK * 60);
    given('the fortnight reached the cloud', Boolean(cloud.doc && cloud.doc.days));

    // A phone that has never seen any of this: it adopts the document and prices the
    // fortnight itself. Its own roster is empty until the snapshot arrives, so every
    // number here came off the wire.
    const other = makeDevice({ deviceId: 'd_cloud_b' });
    other.setToday('2026-08-20');
    other.Sync.pushDelayMs = TICK;
    other.Sync.connect(cloud.adapter);
    await settle(TICK * 80);

    same('the three pay slips', payslips(other), THREE_SLIPS);
    same('and the two clients', billing(other), TWO_CLIENTS);
    same('and the stamped rate travelled with the day, not with the roster',
        other.State.schedule.days['2026-08-07'].actual.w_01.rates, { daily: 400, hourly: 50 });
}

{
    suite('the same shekels through a backup file');

    const device = crew({ deviceId: 'd_backup' });
    fill(device);
    device.ctx.askTell = () => Promise.resolve();
    device.ctx.askConfirm = () => Promise.resolve(true);

    // The real export: the bytes the browser was handed when the link was pressed.
    device.call('exportBackup');
    const file = device.downloads[device.downloads.length - 1];
    given('a file came off the press', Boolean(file && file.text));

    const target = crew({ deviceId: 'd_backup_in' });
    target.ctx.askTell = () => Promise.resolve();
    target.ctx.askConfirm = () => Promise.resolve(true);
    target.call('importBackup', target.fileEvent(file.name, file.text));
    await settle(150);

    same('the three pay slips', payslips(target), THREE_SLIPS);
    same('and the two clients', billing(target), TWO_CLIENTS);
    check('and the man\'s own message off the imported file says the same net',
        reportsIn(target)(`workerStatementText('w_01')`).includes('\nנותר לתשלום: 2550'));
}

{
    suite('the same shekels after a restore');

    const device = crew({ deviceId: 'd_restore_src' });
    fill(device);

    const target = crew({ deviceId: 'd_restore' });
    const result = await target.Sync.replaceEverything(
        target.call('normaliseSchedule', JSON.parse(JSON.stringify(device.State.schedule))));
    // given() takes a condition and nothing else - a detail argument is discarded by the
    // runner - so what went wrong is printed here before the run is stopped.
    if (result.ok !== true) console.error('restore:', JSON.stringify(result));
    given('the restore finished', result.ok === true);

    same('the three pay slips', payslips(target), THREE_SLIPS);
    same('and the two clients', billing(target), TWO_CLIENTS);

    // A restore that is only in memory is a restore that has not happened. The numbers
    // have to come back off the disk it wrote.
    const after = makeDevice({ storage: target.dump(), deviceId: 'd_restore' });
    after.setToday('2026-08-20');
    after.State.load();
    same('and they are still there when the app is opened again', payslips(after), THREE_SLIPS);
    check('with nothing in the record this build cannot read',
        after.global('Recovery').problems.length === 0,
        JSON.stringify(after.global('Recovery').problems.map(problem => problem.key)));
}

report();
