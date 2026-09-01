// What the money is CALLED, and what happens when the record does not add up.
//
//   node tests/wording.test.mjs
//
// Two faults, both about what leaves this app rather than what it computes.
//
// THE COLUMN CALLED מקדמות. On this branch, with the carry on and the migration approved,
// that column does not hold advances. It holds the DEDUCTION - what came off this
// fortnight's wage - which for an advance bigger than the wage is a different number from
// the advance, and for a man in review is zero while he holds one. The heading has said
// "advances" throughout, on the screen, in the CSV and in the workbook, and a bookkeeper
// adding that column is adding deductions under a heading that names something else.
// LEDGER_KIND_LABELS has had the right word since L2 - נוכה מהשכר - and the sheet never
// used it.
//
// The statement has the same trouble one level down. The opening balance is printed as
//
//     `${LEDGER_KIND_LABELS.given} מחשבון קודם`   ->  "ניתנה מקדמה מחשבון קודם"
//
// which says an advance was GIVEN from a previous account. Nothing was given; a balance
// was carried. יתרת פתיחה is what that is.
//
// AND AN OVERPAID ACCOUNT SAYS NOTHING AT ALL. Two phones, both offline, each record the
// same 500 handed back against one advance of 500. Both entries are real and both are
// kept - that is the whole design - and the fold then reads 1,000 settled against 500
// given. advanceAccount knows: overpaid 500, review true, and it STOPS the automatic
// deduction, which is right. Measured on this tree, for a man who earned 2,000:
//
//     the sheet         נצבר 2000 · מקדמות -500 · לתשלום 1500 · הערה ""
//     the statement     מקדמה 24/08: -500 · נותר לתשלום: 1500
//
// An empty note. Not one word about 1,000 having been handed back against 500, about the
// account needing a person, or about the payment not being final. The one surface that
// knows is the one nobody prints.

import { makeDevice, settle } from './harness.mjs';
import { suite, check, same, given, report } from './runner.mjs';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const B = { from: '2026-08-21', to: '2026-09-03' };
const DAYS = ['2026-08-24', '2026-08-25', '2026-08-26', '2026-08-27'];
const RATE = 500;
const GROSS = 2000;
const ADVANCE = 500;
const EXCESS = 500;             // 1,000 handed back against 500 given

function crew(deviceId, storage) {
    const device = makeDevice(storage
        ? { deviceId, storage, flags: { carryAdvances: true, ledgerWrites: true } }
        : { deviceId, flags: { carryAdvances: true, ledgerWrites: true } });
    device.setToday('2026-09-03');
    device.ctx.askTell = () => Promise.resolve();
    if (storage) { device.State.load(); return device; }
    device.State.schedule.workers = [
        { id: 'w_01', name: 'דוד', active: true, dailyRate: RATE, hourlyRate: 0 }];
    device.State.schedule.places = [{ id: 'p_01', name: 'הרצליה', active: true }];
    device.State.save({ silent: true });
    DAYS.forEach(date => device.State.commit(device.call('assignPlace',
        device.State.schedule, date, 'w_01', 'actual', 'p_01')));
    device.State.commit(device.call('addAdvance', device.State.schedule,
        'w_01', '2026-08-24', ADVANCE, ''));
    return device;
}

// Approved LAST, after every entry is in place: recording a repayment can make the carry
// migration needed where it was not, and an unapproved migration correctly withholds the
// account from every surface - see tests/approval.test.mjs. A fixture that approves too
// early measures a screen with no account on it.
function approve(device) {
    const plan = device.call('planCarryMigration', device.State.schedule);
    if (!plan.needed) return true;
    return device.State.commit(device.call('recordCarryApproval', device.State.schedule,
        plan, '2026-08-06T09:00:00.000Z', 'd_person'));
}

const LOADED = new WeakMap();
function reportsIn(device, range) {
    const run = code => vm.runInContext(code, device.ctx, { filename: 'harness:wording' });
    if (!LOADED.has(device.ctx)) {
        run(readFileSync(new URL('../js/ui/sitecolor.js', import.meta.url), 'utf8'));
        run(readFileSync(new URL('../js/ui/reports.js', import.meta.url), 'utf8'));
        LOADED.set(device.ctx, true);
    }
    const at = range || B;
    run(`REPORT_RANGE.from = '${at.from}'; REPORT_RANGE.to = '${at.to}';`
        + `REPORT_SECTION = 'workers'; INVOICE_PLACE = null;`);
    return run;
}

const advanceIdIn = device => Object.keys(device.State.schedule.advances)[0];

// The man's account, over-settled: one advance of 500, two repayments of 500, from two
// devices that never saw each other.
function overpaid(deviceId) {
    const device = crew(deviceId);
    const id = advanceIdIn(device);
    device.State.commit(device.call('recordAdvanceRepaid', device.State.schedule,
        id, 500, '2026-08-26', '', '2026-08-26T09:00:00.000Z', 'd_one', 'cash'));
    device.State.commit(device.call('recordAdvanceRepaid', device.State.schedule,
        id, 500, '2026-08-27', '', '2026-08-27T09:00:00.000Z', 'd_two', 'cash'));
    approve(device);
    return device;
}

const sheetOf = run => {
    const rows = run('payrollSheetRows()');
    return { head: rows[0], row: rows.find(line => line[0] === 'דוד') || [] };
};
const noteOf = ({ head, row }) => String(row[head.length - 1] || '');

// ------------------------------------------------------------------ the column's own name
{
    suite('the column that holds the deduction is called the deduction');

    const device = crew('d_name');
    approve(device);
    const run = reportsIn(device);
    given('the account is being read the new way',
        run('carryReportingEnabled(State.schedule)') === true
        && run('wholeAccountRange(REPORT_RANGE.from, REPORT_RANGE.to)') === true);

    const { head, row } = sheetOf(run);
    given('and the column holds the deduction, not the advance',
        Math.abs(Number(row[head.indexOf('נוכה מהשכר') !== -1
            ? head.indexOf('נוכה מהשכר') : head.indexOf('מקדמות')]))
            === run("workerAccountFor('w_01')").deducted);

    check('the exported sheet names it נוכה מהשכר',
        head.indexOf('נוכה מהשכר') !== -1, JSON.stringify(head));
    check('and does not call it מקדמות',
        head.indexOf('מקדמות') === -1, JSON.stringify(head));

    // The screen's own table is built by renderPayrollTable against a real document, which
    // this harness does not have. The headings it uses are the ones asserted above -
    // there is one list, in payrollSheetRows and the table builder both - and the screen
    // itself is measured in the browser suite.
}

// -------------------------------------------------------------- the words the record uses
{
    suite('every figure is called what it is');

    // An account with an opening balance: 5,000 taken in the first fortnight against
    // 2,000 earned, so 3,000 opens the next one.
    const device = crew('d_words');
    device.State.commit(device.call('addAdvance', device.State.schedule,
        'w_01', '2026-08-10', 4500, ''));
    approve(device);
    const run = reportsIn(device);
    const account = run("workerAccountFor('w_01')");
    given('the account opens owing something', account.carriedIn > 0,
        JSON.stringify(account));

    const statement = run("workerStatementText('w_01')");
    check('the opening balance is called יתרת פתיחה',
        statement.indexOf('יתרת פתיחה') !== -1,
        JSON.stringify(statement.split('\n').filter(l => l.indexOf('חשבון') !== -1
            || l.indexOf('יתרת') !== -1)));
    check('and never "ניתנה מקדמה מחשבון קודם", which says money changed hands',
        statement.indexOf('ניתנה מקדמה מחשבון קודם') === -1, statement);
    check('what was handed over in this period is called מקדמות חדשות',
        statement.indexOf('מקדמות חדשות') !== -1,
        JSON.stringify(statement.split('\n').slice(-10)));
    check('what came off the wage is called נוכה מהשכר',
        statement.indexOf('נוכה מהשכר') !== -1, statement);
}

// --------------------------------------------------------------------- the overpaid account
{
    suite('an account that has been over-settled says so, on every surface');

    const device = overpaid('d_over');
    const run = reportsIn(device);
    const account = run("workerAccountFor('w_01')");

    given('the record really is over-settled',
        account !== null && account.overpaid === EXCESS && account.review === true,
        JSON.stringify(account));
    given('and the automatic deduction has stopped',
        account.deducted === 0, String(account.deducted));

    const sheet = sheetOf(run);
    const note = noteOf(sheet);
    const statement = run("workerStatementText('w_01')");

    // THE THREE THINGS EVERY OUTPUT HAS TO SAY.
    const saysAll = text => text.indexOf('דורש בדיקה') !== -1
        && text.indexOf(String(EXCESS)) !== -1
        && text.indexOf('אין לאשר') !== -1;

    check('the sheet says the account needs looking at, by how much, and not to pay it out',
        saysAll(note), JSON.stringify(note));
    check('the statement says the same three things',
        saysAll(statement), JSON.stringify(statement.split('\n').slice(-6)));
    check('and the excess is not quietly turned into wages',
        Number(sheet.row[sheet.head.indexOf('לתשלום')]) === GROSS,
        JSON.stringify(sheet.row));
    check('nor into a negative debt',
        account.carriedForward >= 0, String(account.carriedForward));

    // AFTER A REOPEN, and on a SECOND PHONE that only heard it over the wire.
    const again = crew('d_over_r', device.dump());
    check('a reopened phone still says it',
        saysAll(noteOf(sheetOf(reportsIn(again)))),
        JSON.stringify(noteOf(sheetOf(reportsIn(again)))));

    const second = crew('d_over_2', device.dump());
    second.Sync.receive(Object.assign(
        JSON.parse(JSON.stringify(device.State.schedule)),
        { updatedAt: '2026-09-04T10:00:00.000Z', updatedBy: 'd_over' }));
    await settle(30);
    check('and so does a second phone',
        saysAll(noteOf(sheetOf(reportsIn(second)))),
        JSON.stringify(noteOf(sheetOf(reportsIn(second)))));
}

// ---------------------------------------------------------- what a correction has to carry
{
    suite('a correction can be answered for: what, against what, and why');

    const device = crew('d_fix');
    const id = advanceIdIn(device);
    const repay = device.call('recordAdvanceRepaid', device.State.schedule,
        id, 500, '2026-08-26', '', '2026-08-26T09:00:00.000Z', 'd_one', 'cash');
    device.State.commit(repay);
    device.State.commit(device.call('recordEventReversed', device.State.schedule,
        repay.value.id, 500, '2026-08-26', 'נרשם על האדם הלא נכון',
        '2026-08-28T11:00:00.000Z', 'd_manager'));
    approve(device);

    const entry = device.State.schedule.ledger.advances['le_rev_' + repay.value.id];
    given('the correction is on the record', Boolean(entry), JSON.stringify(entry));

    // EVERY FIELD A MANAGER NEEDS TO ANSWER FOR IT.
    const wanted = {
        id: 'le_rev_' + repay.value.id,
        targetId: repay.value.id,
        targetKind: 'repaid',
        targetDate: '2026-08-26',
        targetAmount: 500,
        reason: 'נרשם על האדם הלא נכון',
        date: '2026-08-26',
        at: '2026-08-28T11:00:00.000Z',
        by: 'd_manager'
    };
    const missing = Object.keys(wanted).filter(field =>
        String((entry || {})[field]) !== String(wanted[field]));
    same('it names itself, its target, and who corrected it when', missing, []);

    // AND IT IS VISIBLE, in the words a person reads.
    const run = reportsIn(device);
    const statement = run("workerStatementText('w_01')");
    check('the statement names the correction',
        statement.indexOf('תיקון-היפוך') !== -1, statement);
    check('and gives its reason, not just its amount',
        statement.indexOf('נרשם על האדם הלא נכון') !== -1,
        JSON.stringify(statement.split('\n').slice(-8)));

    const note = noteOf(sheetOf(run));
    check('the exported sheet carries the reason too',
        note.indexOf('נרשם על האדם הלא נכון') !== -1, JSON.stringify(note));

    // THE BACKUP AND THE RESCUE FILE, which are what an audit is actually done from.
    const backup = JSON.stringify(device.State.schedule);
    check('the backup carries every audit field',
        backup.indexOf('נרשם על האדם הלא נכון') !== -1
        && backup.indexOf('d_manager') !== -1
        && backup.indexOf('2026-08-28T11:00:00.000Z') !== -1);
    const rescue = JSON.stringify(device.global('Recovery').rawRecords())
        + JSON.stringify(device.dump());
    check('and so does the rescue export', rescue.indexOf('d_manager') !== -1);
}

// -------------------------------------------------------- and the stale name is gone
{
    suite('nothing shipped still calls the ledger "פנקס v80"');

    // A version number in a sentence a person reads is a promise about what they are
    // looking at, and v80 has not been the build for a long time. This is a check on the
    // shipped bytes rather than on a render, because the string must not exist at all.
    const settings = readFileSync(new URL('../js/ui/settings.js', import.meta.url), 'utf8');
    check('js/ui/settings.js does not mention v80',
        settings.indexOf('v80') === -1,
        JSON.stringify((settings.match(/.{0,40}v80.{0,40}/g) || []).slice(0, 3)));
    check('nor calls anything a פנקס',
        settings.indexOf('פנקס') === -1,
        JSON.stringify((settings.match(/.{0,40}פנקס.{0,40}/g) || []).slice(0, 3)));
}

report();
