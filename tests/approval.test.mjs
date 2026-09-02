// No report may move before somebody approves the migration.
//
//   node tests/approval.test.mjs
//
// With both money gates open - the shipped defaults are closed, and this suite opens them
// through the harness seam - what every account says changes. planCarryMigration exists precisely because that change is not the
// app's to make: a fortnight that was already printed and paid must not silently restate
// itself the next time somebody opens the app. So there is a review screen, an approval
// that lives in the record, and a gate - financialWritingEnabled - that stays shut until
// a person has read the rows and pressed the button.
//
// The gate governed WRITING. Nothing governed READING.
//
//     js/ui/reports.js:277    const carrying = advanceCarryEnabled() && wholeAccountRange(...)
//     js/ui/reports.js:1159   if (!advanceCarryEnabled()) return null;
//     js/model/schema.js:1094 const folded = typeof advanceOutstanding === 'function'
//                                            && advanceCarryEnabled();
//
// Three reads of the BUILD's flag where the question is about the RECORD. Measured on the
// tree this file was written against, with the migration needed and nobody having
// approved anything - carryMigrationSettled() false, financialWritingEnabled() false:
//
//   the sheet         נצבר 3050 · מקדמות -3050 · לתשלום 0 · "1950 ₪ עוברים לחשבון הבא"
//   the statement     נוכה מהשכר: 3050 · נותר לתשלום: 0 · חוב פתוח: 1950
//
// Every one of those numbers is the post-migration arithmetic, on a record whose
// migration nobody has approved, in the file the man is handed and the file the
// bookkeeper is paid from. The screen that asks for approval was still asking - while
// every surface behind it had already answered.
//
// The legacy answer, which is what these surfaces must keep saying until a person
// decides: he earned 3,050 and was handed 5,000, so the sheet says -1,950 and somebody
// has to look at it. That is not a nicer number. It is the number this build has always
// printed, and the whole point of the review is that changing it is a decision.
//
// So there is ONE predicate, carryReportingEnabled(schedule), and every surface asks it.

import { makeDevice, settle } from './harness.mjs';
import { suite, check, same, given, report } from './runner.mjs';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const FROM = '2026-08-07';
const TO = '2026-08-20';
// 5 x 610 = 3,050 earned, against 5,000 handed over on the 10th. The numbers are the
// acceptance example, and every one of them can be checked on paper.
const DAYS = ['2026-08-10', '2026-08-11', '2026-08-12', '2026-08-13', '2026-08-14'];
const RATE = 610;
const GROSS = 3050;
const ADVANCE = 5000;
const LEGACY_PAYABLE = GROSS - ADVANCE;      // -1950
const CARRIED_DEBT = ADVANCE - GROSS;        //  1950

// THE GATES, opened through the harness's seam and nowhere else. The shipped defaults are
// closed - tests/data.test.mjs pins both - and this suite measures the build a person
// would ship by opening them the way a build with the flags on would: before the app
// loads, into the frozen FARKAD_FLAGS.
const GATES = { carryAdvances: true, ledgerWrites: true };

function phone(deviceId, storage) {
    const device = makeDevice(storage
        ? { deviceId, storage, flags: GATES } : { deviceId, flags: GATES });
    device.setToday('2026-08-20');
    device.ctx.askTell = () => Promise.resolve();
    device.ctx.askConfirm = () => Promise.resolve(true);
    if (storage) { device.State.load(); return device; }

    device.State.schedule.workers = [
        { id: 'w_01', name: 'דוד', active: true, dailyRate: RATE, hourlyRate: 0 }];
    device.State.schedule.places = [{ id: 'p_01', name: 'הרצליה', active: true }];
    device.State.save({ silent: true });
    DAYS.forEach(date => device.State.commit(device.call('assignPlace',
        device.State.schedule, date, 'w_01', 'actual', 'p_01')));
    device.State.commit(device.call('addAdvance', device.State.schedule,
        'w_01', '2026-08-10', ADVANCE, ''));
    return device;
}

// js/ui/reports.js in the device's own context, which is how money.display.test.mjs
// reaches the same surfaces. The point is to read what the app RENDERS and what it
// WRITES INTO A FILE, not to re-ask the model a question in the test's own words.
function reportsIn(device) {
    const run = code => vm.runInContext(code, device.ctx, { filename: 'harness:reports' });
    run(readFileSync(new URL('../js/ui/sitecolor.js', import.meta.url), 'utf8'));
    run(readFileSync(new URL('../js/ui/reports.js', import.meta.url), 'utf8'));
    run(`REPORT_RANGE.from = '${FROM}'; REPORT_RANGE.to = '${TO}';`
        + `REPORT_SECTION = 'workers'; INVOICE_PLACE = null;`);
    return run;
}

// Everything a person can be shown or handed, in one object, so a check can say "no
// surface moved" rather than naming four and forgetting the fifth.
function surfaces(device, run) {
    const sheet = run('payrollSheetRows()');
    const heads = sheet[0];
    const row = sheet.find(line => line[0] === 'דוד') || [];
    const at = name => heads.indexOf(name);
    const rows = run('payrollRows()');
    return {
        // The XLSX/CSV summary sheet: the three columns a bookkeeper adds up.
        earned: row[at('נצבר')],
        deductionColumn: row[at('מקדמות') !== -1 ? at('מקדמות') : at('נוכה מהשכר')],
        payable: row[at('לתשלום')],
        note: String(row[heads.length - 1] || ''),
        // The payroll row the screen draws from.
        carry: (rows.find(line => line.workerId === 'w_01') || {}).carry || null,
        payableCell: row[at('לתשלום')],
        // The message the man himself receives.
        statement: run("workerStatementText('w_01')"),
        // The sentence the archive dialog puts in front of somebody.
        archive: device.call('openAdvanceBalance', device.State.schedule, 'w_01')
    };
}

const LEGACY = 'the numbers this build has always printed';
const CARRIED = 'the numbers the migration would produce';

function readsLegacy(label, seen) {
    check(`${label}: the sheet's earned column is the wage`, seen.earned === GROSS,
        String(seen.earned));
    check(`${label}: its deduction column is the ADVANCE, not the wage`,
        Math.abs(Number(seen.deductionColumn)) === ADVANCE, String(seen.deductionColumn));
    check(`${label}: and the payable column is negative, so somebody looks`,
        Number(seen.payable) === LEGACY_PAYABLE, String(seen.payable));
    check(`${label}: no carried debt is announced on the sheet`,
        seen.note.indexOf(String(CARRIED_DEBT)) === -1, seen.note);
    check(`${label}: the row carries no account`, !seen.carry,
        JSON.stringify(seen.carry));
    check(`${label}: the man's own message says he is owed the difference`,
        seen.statement.indexOf(`נותר לתשלום: \u200e${LEGACY_PAYABLE}`) !== -1,
        seen.statement.split('\n').slice(-4).join(' | '));
    check(`${label}: and does not report a deduction nobody approved`,
        seen.statement.indexOf('נוכה מהשכר') === -1,
        seen.statement.split('\n').slice(-4).join(' | '));
    check(`${label}: nor an open debt`, seen.statement.indexOf('חוב פתוח') === -1,
        seen.statement.split('\n').slice(-4).join(' | '));
    // The archive sentence is NOT asserted here. In this fixture nothing has been
    // repaid, so the folded and unfolded answers are the same 5,000 and a check on it
    // would pass whatever the gate did. It gets a fixture that can tell them apart,
    // further down.
}

function readsCarried(label, seen) {
    check(`${label}: the deduction column is what came off the wage`,
        Math.abs(Number(seen.deductionColumn)) === GROSS, String(seen.deductionColumn));
    check(`${label}: the payable column is nil`, Number(seen.payable) === 0,
        String(seen.payable));
    check(`${label}: the sheet names the debt that carries`,
        seen.note.indexOf(String(CARRIED_DEBT)) !== -1, seen.note);
    check(`${label}: the row carries the account`,
        seen.carry !== null && seen.carry.deducted === GROSS
        && seen.carry.carriedForward === CARRIED_DEBT, JSON.stringify(seen.carry));
    check(`${label}: the man's message reports the deduction`,
        seen.statement.indexOf(`נוכה מהשכר: ${GROSS}`) !== -1,
        seen.statement.split('\n').slice(-4).join(' | '));
    check(`${label}: and the debt he still carries`,
        seen.statement.indexOf(`חוב פתוח: ${CARRIED_DEBT}`) !== -1,
        seen.statement.split('\n').slice(-4).join(' | '));
}

const approve = device => {
    const plan = device.call('planCarryMigration', device.State.schedule);
    return device.State.commit(device.call('recordCarryApproval', device.State.schedule,
        plan, '2026-08-25T09:00:00.000Z', 'd_person'));
};

// ------------------------------------------------------------------ before anybody looks
{
    suite('an unapproved migration leaves every surface as it was');

    const device = phone('d_before');
    const run = reportsIn(device);

    // THE PRECONDITIONS, asserted rather than assumed. A green run of this suite against
    // a record that needed no migration would prove nothing at all.
    given('both gates are open, through the seam',
        device.call('advanceCarryEnabled') === true
        && device.call('ledgerWritesEnabled') === true);
    given('the migration is genuinely needed',
        device.call('planCarryMigration', device.State.schedule).needed === true);
    given('and genuinely unapproved',
        device.call('carryMigrationSettled', device.State.schedule) === false
        && Object.keys((device.State.schedule.ledger || {}).migrations || {}).length === 0);
    given('so nothing financial may be written',
        device.call('financialWritingEnabled', device.State.schedule) === false);

    // THE ACCEPTANCE EXAMPLE, spelled out here rather than only inside the helper, so a
    // reader can see the three numbers this whole suite is about without following a
    // call: he earned 3,050, he was handed 5,000, the sheet owes him -1,950.
    const seen = surfaces(device, run);
    same('the sheet reads 3,050 earned, 5,000 advanced, -1,950 payable',
        [seen.earned, Number(seen.deductionColumn), Number(seen.payable)],
        [GROSS, -ADVANCE, LEGACY_PAYABLE]);

    readsLegacy(LEGACY, seen);
}

// ----------------------------------------------------------------- and after somebody has
{
    suite('a durable approval is what moves them, and it moves all of them');

    const device = phone('d_after');
    const run = reportsIn(device);
    readsLegacy('before the button', surfaces(device, run));

    const committed = approve(device);
    given('the approval committed durably', committed === true
        && Object.keys(device.State.schedule.ledger.migrations).length === 1);
    given('and the record now reads as settled',
        device.call('carryMigrationSettled', device.State.schedule) === true);

    // The same three numbers, the other side of the decision: 3,050 came off the wage,
    // nothing is payable, and 1,950 is carried into the next account.
    const after = surfaces(device, run);
    same('and now reads 3,050 earned, 3,050 deducted, nothing payable',
        [after.earned, Number(after.deductionColumn), Number(after.payable)],
        [GROSS, -GROSS, 0]);

    readsCarried(CARRIED, after);
}

// ------------------------------------------------------- an approval that never landed
{
    suite('an approval the disk refused changes nothing');

    const device = phone('d_refused');
    const run = reportsIn(device);
    const before = JSON.stringify(surfaces(device, run));

    // The disk says no. State.commit is built to roll memory back and say so; what this
    // asks is whether a REPORT can be moved by an approval that was never written down.
    device.setQuota(key => key === 'scheduleData:v2'
        || key.startsWith('scheduleData:v2:') || key.startsWith('farkad:outbox'));
    const committed = approve(device);
    device.setQuota(() => false);

    check('the commit reported failure', committed === false, String(committed));
    check('and not one surface moved', JSON.stringify(surfaces(device, run)) === before,
        JSON.stringify(surfaces(device, run)).slice(0, 200));
    readsLegacy('after a refused approval', surfaces(device, run));

    const again = phone('d_refused_r', device.dump());
    const runAgain = reportsIn(again);
    check('and a reopened phone has no approval either',
        again.call('carryMigrationSettled', again.State.schedule) === false);
    readsLegacy('after a refused approval, reopened', surfaces(again, runAgain));
}

// ------------------------------------------------------ an approval that is only in memory
{
    suite('an approval held only in memory moves nothing');

    const device = phone('d_memory');
    const run = reportsIn(device);

    // recordCarryApproval MUTATES the schedule and returns the change; State.commit is
    // what makes it durable. Calling the first without the second is exactly the state a
    // failed commit must not leave behind, and it is what a future caller will write by
    // accident.
    const plan = device.call('planCarryMigration', device.State.schedule);
    device.call('recordCarryApproval', device.State.schedule, plan,
        '2026-08-25T09:00:00.000Z', 'd_person');
    given('the approval is in memory', Object.keys(
        device.State.schedule.ledger.migrations).length === 1);
    given('and nowhere on the disk',
        JSON.stringify(JSON.parse(device.dump()['scheduleData:v2'] || '{}').ledger || {})
            .indexOf('"migrations":{"cm_') === -1);

    // The reopened phone's OWN schedule, read off its OWN disk. Asking it about the
    // in-memory object that still carries the approval would be asking the wrong phone.
    const again = phone('d_memory_r', device.dump());
    check('a reopened phone does not read it as approved',
        again.call('carryMigrationSettled', again.State.schedule) === false,
        JSON.stringify((again.State.schedule.ledger || {}).migrations || {}));
    check('and it holds no approval at all',
        Object.keys((again.State.schedule.ledger || {}).migrations || {}).length === 0,
        JSON.stringify((again.State.schedule.ledger || {}).migrations || {}));
}

// ------------------------------------------------------------------- and it stays approved
{
    suite('an approval survives two reopens, reaches a second phone, and outlives an old snapshot');

    const device = phone('d_keeps');
    const beforeApproval = device.dump();
    approve(device);
    const stamp = JSON.stringify(device.State.schedule.ledger.migrations);

    const once = phone('d_keeps_1', device.dump());
    check('after one reopen', once.call('carryMigrationSettled', once.State.schedule) === true);
    const twice = phone('d_keeps_2', once.dump());
    check('after two', twice.call('carryMigrationSettled', twice.State.schedule) === true);
    check('and it is the same approval, byte for byte, with the original hand on it',
        JSON.stringify(twice.State.schedule.ledger.migrations) === stamp
        && stamp.indexOf('d_person') !== -1 && stamp.indexOf('2026-08-25T09:00:00.000Z') !== -1,
        stamp);

    // A SECOND PHONE, through the ordinary door: the approval is a record, so it travels
    // with the record. It is built from the FIRST phone's disk as it was before the
    // approval - two phones sharing one record, which is what this app is - rather than
    // seeded again, which would mint a second advance with its own id and quietly double
    // the money the assertions below are about.
    const other = phone('d_other', beforeApproval);
    const runOther = reportsIn(other);
    readsLegacy('the second phone, before it hears', surfaces(other, runOther));
    other.Sync.receive(Object.assign(
        JSON.parse(JSON.stringify(twice.State.schedule)),
        { updatedAt: '2026-08-26T10:00:00.000Z', updatedBy: 'd_keeps' }));
    await settle(30);
    check('the second phone reads the approval it never made',
        other.call('carryMigrationSettled', other.State.schedule) === true);
    readsCarried('the second phone, after', surfaces(other, runOther));

    // AND AN OLDER SNAPSHOT DOES NOT TAKE IT AWAY. A phone that has been in a tunnel
    // sends what it had; the approval is append-only and an absence is not a retraction.
    const stale = JSON.parse(JSON.stringify(device.State.schedule));
    stale.ledger.migrations = {};
    stale.updatedAt = '2026-08-24T10:00:00.000Z';
    stale.updatedBy = 'd_tunnel';
    other.Sync.receive(stale);
    await settle(30);
    check('an older snapshot with no approval on it does not un-approve anything',
        other.call('carryMigrationSettled', other.State.schedule) === true,
        JSON.stringify(other.State.schedule.ledger.migrations));
    readsCarried('after the stale snapshot', surfaces(other, runOther));
}

// ---------------------------------------------------- the sentence before somebody is put away
{
    suite('the archive warning reads the record, not the build flag');

    // A REPAYMENT ALREADY ON THE RECORD, which is what makes this fixture able to tell
    // the two answers apart. Without one, folded and unfolded both say 5,000 and a check
    // here would pass whatever the gate did.
    //
    // It is written straight onto the ledger rather than through a recorder because on
    // this phone no recorder may run - financialWritingEnabled is false until somebody
    // approves. A phone that HAS approved recorded it, and it arrived here with the
    // record. That is exactly the state this check is about.
    const device = phone('d_archive');
    const advanceId = Object.keys(device.State.schedule.advances)[0];
    given('there is one advance to repay against', Boolean(advanceId), String(advanceId));
    device.State.schedule.ledger = device.State.schedule.ledger || {};
    device.State.schedule.ledger.advances = device.State.schedule.ledger.advances || {};
    device.State.schedule.ledger.advances.le_given = {
        id: 'le_given', advanceId, kind: 'given', workerId: 'w_01',
        date: '2026-08-10', amount: ADVANCE, note: '',
        at: '2026-08-10T09:00:00.000Z', by: 'd_elsewhere' };
    device.State.schedule.ledger.advances.le_back = {
        id: 'le_back', advanceId, kind: 'repaid', workerId: 'w_01',
        date: '2026-08-18', amount: 1000, note: '', method: 'cash',
        at: '2026-08-18T09:00:00.000Z', by: 'd_elsewhere' };
    device.State.save({ silent: true });

    given('the two answers really do differ here',
        device.call('advanceOutstanding', device.State.schedule, advanceId).left === 4000,
        JSON.stringify(device.call('advanceOutstanding', device.State.schedule, advanceId)));
    given('and the migration is still unapproved',
        device.call('carryMigrationSettled', device.State.schedule) === false);

    check('before approval it says what was handed over',
        (device.call('openAdvanceBalance', device.State.schedule, 'w_01') || {}).total
            === ADVANCE,
        JSON.stringify(device.call('openAdvanceBalance', device.State.schedule, 'w_01')));

    approve(device);
    check('and after it, what is still owed',
        (device.call('openAdvanceBalance', device.State.schedule, 'w_01') || {}).total
            === 4000,
        JSON.stringify(device.call('openAdvanceBalance', device.State.schedule, 'w_01')));
}

report();
