// MONEY HANDED BACK BEYOND WHAT WAS OWED, AND A WAGE FINER THAN AN AGORA (v180).
//
//   node tests/overpayment.test.mjs
//
// Two faults were found by putting a second calculator beside the app
// (tests/oracle.test.mjs) and were left red, on fixtures a person can check on paper, in
// tests/oracle.findings.mjs - a file no gate ran. v180 repairs both. Those fixtures are
// here now, green, with the rest of what the repair has to hold:
//
//   1. THE CREDIT. Up to v179 a closed period could carry forward less than nothing - a
//      repayment from a phone that was offline, dated into a fortnight already closed -
//      and that credit lived for exactly one period boundary: 1,500 taken the next
//      fortnight read as 1,000 owed, the same 1,500 taken a fortnight later read as 1,500,
//      and a close made in between froze `carriedIn: -500` onto a payslip. The ruling this
//      build is made to (recommended to the owner 2026-11-10; v180 is a candidate shown to
//      him before anything is served): money a man gave back beyond what he owed STAYS HIS
//      CREDIT until it is used. It comes off whatever advance he takes next, however many
//      periods later; it is its own figure, never a negative debt and never wages.
//
//   2. THE HALF AGORA. A wage of 630.625 (610 a day, half an hour at 41.25) closed against
//      a larger debt had 630.63 taken off it; the app's own judge then called that closure
//      impossible, held it aside at the next open and stopped the phone writing.
//
// AND WHAT A PHONE ALREADY HOLDS. Records written by v179 are made here by v179 itself -
// its own bytes out of Git, the way tests/rima.test.mjs runs v145 and v165 - and then
// opened by this build: a payslip frozen with a negative opening balance, and a phone
// already blocked over its own closure.
//
// Every expected figure is a literal somebody could check on paper, and where the second
// calculator can answer the same question it is asked too.

import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { makeDevice, loadOrder } from './harness.mjs';
import { suite, check, same, given, report } from './runner.mjs';
import * as oracle from './oracle.mjs';

process.env.TZ = 'Asia/Jerusalem';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const clone = value => JSON.parse(JSON.stringify(value));
const shekels = agorot => (agorot === null || agorot === undefined ? agorot : agorot / 100);

// The app as shipped, asked as plain functions of a record.
function appOf(device) {
    const held = new Map();
    return new Proxy({}, { get: (_, name) => {
        if (!held.has(name)) held.set(name, device.global(String(name)));
        return held.get(name);
    } });
}
const APP = appOf(makeDevice());

// ---------------------------------------------------------------- v179, on its own bytes
//
// The build that is on the phones today (merged 17788f8, served 2026-11-10). Everything
// below that says «written by v179» was written by this, not by a description of it.
const V179 = '17788f8e1e5e78be8f105769624f97e7fe051886';
const git = args => execFileSync('git', ['-C', ROOT, ...args],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
let v179Sources = null;
function v179(options = {}) {
    if (v179Sources === null) {
        let sha = '';
        try { sha = git(['rev-parse', '--verify', '--quiet', `${V179}^{commit}`]).trim(); } catch (error) { sha = ''; }
        given('the v179 commit is in this repository', sha === V179, V179);
        v179Sources = loadOrder().map(file => ({ file, code: git(['show', `${sha}:${file}`]) }));
        const stamp = (/const APP_VERSION = '([^']+)'/.exec(git(['show', `${sha}:js/app.js`])) || [])[1];
        given('and it names itself v179', stamp === 'v179', String(stamp));
        given('and it does not know the credit', !v179Sources.some(source =>
            /creditForward|OVERPAYMENT_STAYS_CREDIT|closureWithinRoundedWage/.test(source.code)));
    }
    return makeDevice(Object.assign({ sources: v179Sources, appVersion: 'v179' }, options));
}
const fromV179 = file => git(['show', `${V179}:${file}`]);
// A record on a v179 phone's disk, opened by v179.
function v179Holding(record, today) {
    const device = v179({ deviceId: 'd_old', storage: { 'scheduleData:v2': JSON.stringify(record) } });
    device.setToday(today);
    device.ctx.askTell = () => Promise.resolve();
    device.State.load();
    return device;
}

// ---------------------------------------------------------------- the fixtures
//
// One man on 610 a day, one site, the carried reading approved - as it is on the owner's
// record since v116.
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

// Six of his fortnights, from the named Friday.
const P = [0, 1, 2, 3, 4, 5].map(n => [oracle.addDays('2026-08-07', 14 * n),
    oracle.addDays('2026-08-07', 14 * n + 13)]);
const [P1, P2, P3] = P;
const FIVE = start => [0, 2, 3, 4, 5].map(n => oracle.addDays(start, n));

// A record put on a phone's disk and opened there - every door a record comes in by
// meets in normaliseSchedule, and this is the one a person uses every morning.
function phoneHolding(record, options = {}) {
    const device = makeDevice(Object.assign({ deviceId: 'd_office',
        storage: { 'scheduleData:v2': JSON.stringify(record) } }, options));
    device.setToday(options.today || '2026-11-01');
    device.ctx.askTell = () => Promise.resolve();
    device.State.load();
    return device;
}

// The report code is not in the harness's load order; it is loaded over the device the
// way tests/wording.test.mjs loads it. `read` is where its bytes come from: this checkout,
// or - for a v179 phone - v179.
const LOADED = new WeakMap();
const fromCheckout = file => readFileSync(join(ROOT, file), 'utf8');
function reportsIn(device, range, read = fromCheckout) {
    const run = code => vm.runInContext(code, device.ctx, { filename: 'harness:overpayment' });
    if (!LOADED.has(device.ctx)) {
        run(read('js/ui/sitecolor.js'));
        run(read('js/ui/reports.js'));
        LOADED.set(device.ctx, true);
    }
    run(`REPORT_RANGE.from = '${range[0]}'; REPORT_RANGE.to = '${range[1]}';`
        + `REPORT_SECTION = 'workers'; INVOICE_PLACE = null; REPORT_WORKERS = null;`);
    return run;
}
const sheetOf = run => {
    const rows = run('payrollSheetRows()');
    return { head: rows[0], row: rows.find(line => line[0] === 'דוד') || [] };
};
const cell = (sheet, name) => sheet.row[sheet.head.indexOf(name)];

// The two phrases this build adds. PROPOSED - the owner has not read them - and pinned
// here so that changing either is a decision.
const CREDIT = 'יתרת זכות';
const CREDIT_FROM_BEFORE = 'יתרת זכות מחשבון קודם';

// What the app says of an account, as the six figures a person would write down.
const line = account => [account.carriedIn, account.creditIn, account.given, account.deducted,
    account.carriedForward, account.creditForward];
const lineOf = account => [account.carriedIn, account.creditIn, account.given, account.deducted,
    account.carriedForward, account.creditForward].map(shekels);

// ================================================================== 1. THE CREDIT
//
// Two phones. דוד earns 3,050 in the account 7-20 August (five days at 610) and takes
// 2,000 on the 10th. On the 15th he hands 500 back to the foreman, whose phone is offline.
// The account is closed on the 20th on the office phone, which has not heard: 2,000 comes
// off his wage and the advance is settled. The foreman's phone syncs on the 22nd and the
// 500 arrives, dated the 15th. He has now paid 2,500 against 2,000.
function fixtureOne() {
    const record = base();
    work(record, FIVE(P1[0]));
    give(record, 'a_1', '2026-08-10', 2000, '2026-08-10T09:00:00.000Z');
    const wrote = APP.closePeriodChanges(record, 'w_d', ...P1, '2026-08-20T18:00:00.000Z', 'd');
    given('the account closed, 2,000 off the wage', wrote.length === 2
        && record.ledger.advances.le_close_a_1_20260807.amount === 2000, String(wrote.length));
    repay(record, 'le_late', 'a_1', '2026-08-15', 500, '2026-08-22T08:00:00.000Z');
    return record;
}

// (The fixtures are all up here, above the first suite: a `given` inside one of them is a
// precondition of whichever suite calls it, and tests/nonassertions.test.mjs reads the
// file top to bottom.)

// One phone's worth of ordinary evenings, nobody over-settled on any advance, no warning
// anywhere - which is why the credit has to be WRITTEN where it is used.
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
// The middle account: 0 + 500 given - 500 back - 500 off the wage = 500 more settled than
// was owed. That is his credit. The last account opens on it: 1,500 handed over, 500 of it
// already his, 1,000 owed, 1,000 comes off 3,050.
function fixtureTwo(app, closeLast, lastTaken = '2026-09-07') {
    const record = base();
    work(record, FIVE(P1[0]).concat(FIVE(P2[0]), FIVE(P3[0])));
    give(record, 'a_A', '2026-08-10', 1000, '2026-08-10T09:00:00.000Z');
    give(record, 'a_B', '2026-08-24', 500, '2026-08-24T09:00:00.000Z');
    const first = app.closePeriodChanges(record, 'w_d', ...P2, '2026-09-03T18:00:00.000Z', 'd');
    given('the middle account closed: 500 off, written against the oldest advance',
        first.length === 2 && record.ledger.advances.le_close_a_A_20260821.amount === 500,
        JSON.stringify(first.map(change => change.path)));
    repay(record, 'le_back', 'a_B', '2026-08-30', 500, '2026-09-05T08:00:00.000Z');
    give(record, 'a_C', lastTaken, 1500, `${lastTaken}T09:00:00.000Z`);
    if (closeLast) {
        const second = app.closePeriodChanges(record, 'w_d', ...P3, '2026-09-17T18:00:00.000Z', 'd');
        given('the last account closed', second.length > 0, String(second.length));
    }
    return record;
}

// THE HALF AGORA.
//
// Through the doors the buttons use, on a phone, and then the phone is closed and opened.
//
//   דוד: 610 a day, 41.25 an hour. 7 August: one day with half an extra hour.
//        610 + 0.5 x 41.25 = 630.625 - which every sheet prints, and pays, as 630.63.
//   10 August: he takes 5,000. The carried reading is approved. The account is closed.
function halfAgoraPhone(make) {
    const phone = make({ deviceId: 'd_office' });
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
    return phone;
}
const closeIt = phone => phone.State.commitMany(phone.call('closePeriodChanges', phone.State.schedule,
    'w_d', ...P1, '2026-08-20T18:00:00.000Z', 'd_office'));

{
    suite('1a. a repayment from an offline phone lands in a closed account: the credit');

    const record = fixtureOne();
    given('the record is one the app reads, and no closure on it is called impossible',
        APP.storedScheduleProblems(record).length === 0 && APP.ledgerProblems(record).length === 0
        && APP.impossibleClosures(record).length === 0);

    const closed = APP.advanceAccount(record, 'w_d', ...P1);
    same('the closed payslip is not restated: opened on 0, 2,000 given, 2,000 off, closed on 0',
        [closed.carriedIn, closed.given, closed.deducted, closed.carriedOut, closed.gross, closed.net,
            closed.closed], [0, 2000, 2000, 0, 3050, 1050, true]);
    same('what it hands forward is no debt, and a credit of 500 - two figures, neither below zero',
        [closed.carriedForward, closed.creditForward], [0, 500]);
    same('and the second calculator says the same of it', lineOf(oracle.accountOf(record, 'w_d', ...P1)),
        line(closed));
    same('the late movement is named whole: 500 moved after the close',
        [closed.lateSinceClose, shekels(oracle.accountOf(record, 'w_d', ...P1).lateSinceClose)], [-500, -500]);
    same('the next account opens owing nothing and 500 in credit',
        [APP.advanceCarryInto(record, 'w_d', P2[0]), APP.advanceCreditInto(record, 'w_d', P2[0])], [0, 500]);

    // THE CHECK THAT DOES NOT DEPEND ON WHICH FORTNIGHT. He takes 1,500: in the very next
    // account, one account later, or four accounts later. It is the same 1,500, handed to
    // the same man with the same 500 in credit, and it is the same debt.
    const taken = {};
    [['the next account', P2, '2026-08-24'], ['one account later', P3, '2026-09-07'],
        ['four accounts later', P[5], '2026-10-19']].forEach(([when, period, date]) => {
        const later = clone(record);
        give(later, 'a_2', date, 1500, `${date}T09:00:00.000Z`);
        const account = APP.advanceAccount(later, 'w_d', ...period);
        const last = APP.advanceAccount(later, 'w_d', ...P[5]);
        taken[when] = last.carriedForward;
        same(`1,500 taken in ${when}: 500 of it is covered by his credit, 1,000 is owed`,
            [account.creditIn, account.given, account.carriedForward, account.creditForward],
            [500, 1500, 1000, 0]);
        same(`- and the second calculator agrees, there and at the end of the season`,
            [lineOf(oracle.accountOf(later, 'w_d', ...period)), shekels(oracle.accountOf(later, 'w_d', ...P[5]).carriedForward)],
            [line(account), last.carriedForward]);
        // What the advances add up to is what the account carries.
        const fold = APP.openAdvanceBalance(later, 'w_d');
        same(`- and the advances add up to the same 1,000 the account carries`,
            [fold ? fold.total : 0, shekels(oracle.openBalance(later, 'w_d').total)], [1000, 1000]);
    });
    same('so what he owes on 1,500 does not depend on which fortnight he took it in',
        taken, { 'the next account': 1000, 'one account later': 1000, 'four accounts later': 1000 });

    // IT IS NEVER WAGES. With nothing taken, his credit changes no wage and no net in any
    // account after it, however long it waits.
    const idle = clone(record);
    work(idle, FIVE(P3[0]));
    const quiet = APP.advanceAccount(idle, 'w_d', ...P3);
    same('a credit with nothing to come off raises no wage: 3,050 earned, 0 off, 3,050 to pay',
        [quiet.gross, quiet.deducted, quiet.net, quiet.carriedForward, quiet.creditIn, quiet.creditForward],
        [3050, 0, 3050, 0, 500, 500]);
    const row = APP.payrollReport(idle, ...P3).find(item => item.workerId === 'w_d');
    same('and the pay sheet row is the wage and nothing else', [row.amount, row.netAmount], [3050, 3050]);

    // WHERE THE OLDER MECHANISM STILL DECIDES, said rather than hidden. This man's one
    // advance is settled beyond what was handed over, and tests/wording.test.mjs pins
    // what that does: the account says it needs looking at and the automatic deduction
    // stops on every open period. v180 does not change that. So the 1,000 above is what
    // he OWES, in every fortnight alike - and none of it comes off his wage until a
    // person has looked. (docs/releases.md, v180, «what the owner has to decide».)
    const soon = clone(record);
    give(soon, 'a_2', '2026-08-24', 1500, '2026-08-24T09:00:00.000Z');
    work(soon, FIVE(P2[0]));
    const held = APP.advanceAccount(soon, 'w_d', ...P2);
    same('an over-settled advance still stops the automatic deduction, as it always has',
        [held.overpaid, held.review, held.deducted, held.net, held.carriedForward],
        [500, true, 0, 3050, 1000]);
    same('and a close is still refused for it',
        APP.planPeriodClosure(soon, 'w_d', ...P2, '2026-09-03T18:00:00.000Z').reasons, ['overpaid']);

    // The figure at the top of his advances, which is the one a person reads first.
    const screen = phoneHolding(soon, { today: '2026-09-03' });
    const summary = reportsIn(screen, P2)("workerAdvanceSummary('w_d')");
    same('the sum over his advances is the same 1,000, and still says one of them was over-settled by 500',
        [summary.left, summary.overpaid, summary.given], [1000, 500, 3500]);
    const run = reportsIn(screen, P2);
    check('and the statement carries the warning it always carried, beside the 1,000',
        run("workerStatementText('w_d')").indexOf('דורש בדיקה') !== -1
        && run("workerStatementText('w_d')").split('\n').indexOf('חוב פתוח: 1000') !== -1,
        JSON.stringify(run("workerStatementText('w_d')").split('\n').slice(-8)));
}

{
    suite('1b. nobody over-settled, no warning: the credit is used, and written on the payslip');

    const record = fixtureTwo(APP, false);
    given('nobody is over-settled on any advance, to either calculator',
        APP.overpaidAdvances(record, 'w_d').length === 0 && oracle.overpaidBy(record, 'w_d') === 0);

    const middle = APP.advanceAccount(record, 'w_d', ...P2);
    same('the middle account carries forward no debt and a credit of 500',
        [middle.carriedForward, middle.creditForward, middle.carriedOut], [0, 500, 0]);
    const open = APP.advanceAccount(record, 'w_d', ...P3);
    same('the last account: opens 500 in credit, 1,500 given, 1,000 off a wage of 3,050, nothing left',
        [open.carriedIn, open.creditIn, open.given, open.gross, open.deducted, open.net,
            open.carriedForward, open.creditForward, open.review],
        [0, 500, 1500, 3050, 1000, 2050, 0, 0, false]);
    const want = oracle.closePlan(record, 'w_d', ...P3);
    same('and the second calculator plans the same close',
        [want.carriedIn, want.creditIn, want.deducted, want.net, want.carriedForward].map(shekels)
            .concat([want.reasons]), [0, 500, 1000, 2050, 0, []]);

    const second = APP.closePeriodChanges(record, 'w_d', ...P3, '2026-09-17T18:00:00.000Z', 'd');
    given('the last account closed', second.length === 3, String(second.length));
    const payslip = record.ledger.advances.le_period_w_d_20260904;
    same('the frozen payslip opens on 0 with the credit beside it - it adds up, and nothing on it is below zero',
        [payslip.carriedIn, payslip.creditIn, payslip.given, payslip.gross, payslip.net, payslip.balanceAfter],
        [0, 500, 1500, 3050, 2050, 0]);
    const off = second.map(change => change.value).filter(entry => entry.kind === 'deducted')
        .map(entry => [entry.advanceId, entry.amount, entry.balanceAfter]);
    same('the deductions written are the ones the rules give, oldest advance first', off,
        want.rows.map(item => [item.advanceId, shekels(item.amount), shekels(item.balanceAfter)]));
    same('- 500 off A, 500 off C', off, [['a_A', 500, 0], ['a_C', 500, 1000]]);
    check('and the judge accepts every closure on the record',
        APP.impossibleClosures(record).length === 0, JSON.stringify(APP.impossibleClosures(record)));

    // A payslip with NO credit is byte for byte what it always was: the field is absent.
    const plain = base();
    work(plain, FIVE(P1[0]));
    give(plain, 'a_1', '2026-08-10', 1000, '2026-08-10T09:00:00.000Z');
    APP.closePeriodChanges(plain, 'w_d', ...P1, '2026-08-20T18:00:00.000Z', 'd');
    check('a payslip with no credit carries no such field at all',
        Object.values(plain.ledger.advances).every(entry => !('creditIn' in entry)));

    // On a phone, after it is closed and opened again.
    const phone = phoneHolding(record, { today: '2026-09-18' });
    same('on a phone: nothing held aside, writing not blocked',
        [Object.keys(phone.State.schedule.ledger.unreadable || {}), phone.call('farkadWritesBlocked')],
        [[], false]);
    same('and the payslip on the disk is the payslip that was written',
        phone.State.schedule.ledger.advances.le_period_w_d_20260904, clone(payslip));

    // WHAT THE MAN AND THE BOOKKEEPER ARE SHOWN, where the credit is used.
    const run = reportsIn(phone, P3);
    const account = run("workerAccountFor('w_d')");
    same('the report reads the frozen account: 0 in, 500 credit, 1,000 off',
        [account.carriedIn, account.creditIn, account.deducted, account.closed], [0, 500, 1000, true]);
    const statement = run("workerStatementText('w_d')").split('\n');
    check('the statement names his credit in the proposed words, with the amount',
        statement.indexOf(`${CREDIT_FROM_BEFORE}: 500`) !== -1, JSON.stringify(statement.slice(-12)));
    check('- beside 1,500 handed over and 1,000 off the wage, so the three add up on his own copy',
        statement.indexOf('מקדמות חדשות: 1500') !== -1 && statement.indexOf('נוכה מהשכר: 1000') !== -1,
        JSON.stringify(statement.slice(-12)));
    const sheet = sheetOf(run);
    same('the sheet: 3,050 earned, 1,000 off, 2,050 to pay',
        [cell(sheet, 'נצבר'), cell(sheet, 'לתשלום')], [3050, 2050]);
    check('and its note names the credit the same way',
        String(cell(sheet, 'הערה')).split(' · ').indexOf(`500 ₪ ${CREDIT_FROM_BEFORE}`) !== -1,
        String(cell(sheet, 'הערה')));
    // (An advance is listed with a minus on his copy - «מקדמה 07/09: -1500» - and always
    // was. A BALANCE is what must never carry one.)
    check('no balance on the statement and nothing in the note is below zero',
        statement.filter(text => /^(יתרת|חוב)/.test(text)).every(text => text.indexOf('-') === -1)
        && statement.filter(text => /^(יתרת|חוב)/.test(text)).length === 1
        && !/-\d/.test(String(cell(sheet, 'הערה'))),
        JSON.stringify([statement, cell(sheet, 'הערה')]));

    // The middle account, read after the fact: it says a movement arrived, and his credit.
    const before = reportsIn(phone, P2);
    const note = String(cell(sheetOf(before), 'הערה')).split(' · ');
    check('the middle account\'s note says a movement arrived after the close, and owes 0 - not minus 500',
        note.indexOf('הגיעה תנועה אחרי סגירת התקופה') !== -1 && note.indexOf('חוב פתוח 0 ₪') !== -1,
        JSON.stringify(note));
    check('and names the credit he goes out with', note.indexOf(`${CREDIT} 500 ₪`) !== -1,
        JSON.stringify(note));
    check('and his statement for it ends on the same credit',
        before("workerStatementText('w_d')").split('\n').indexOf(`${CREDIT}: 500`) !== -1);

    // And a man with no credit sees neither phrase, anywhere.
    const ordinary = phoneHolding(plain, { today: '2026-08-21' });
    const plainRun = reportsIn(ordinary, P1);
    check('a man with no credit is shown neither phrase',
        plainRun("workerStatementText('w_d')").indexOf(CREDIT) === -1
        && String(cell(sheetOf(plainRun), 'הערה')).indexOf(CREDIT) === -1);
}

// ================================================================== what v179 already wrote
{
    suite('1c. a record written by v179: a payslip frozen with carriedIn -500');

    const old = appOf(v179());
    const record = fixtureTwo(old, true);
    const written = clone(record.ledger.advances);
    const payslip = written.le_period_w_d_20260904;
    given('v179 really did freeze a negative opening balance, and took 1,000 off',
        payslip.carriedIn === -500 && payslip.creditIn === undefined
        && written.le_close_a_C_20260904.amount === 500 && written.le_close_a_A_20260904.amount === 500,
        JSON.stringify([payslip.carriedIn, payslip.creditIn]));
    given('and v179 carried the middle account forward as minus 500',
        old.advanceAccount(record, 'w_d', ...P2).carriedForward === -500);
    const oldNote = String(cell(sheetOf(reportsIn(v179Holding(record, '2026-09-18'), P2, fromV179)), 'הערה'));
    given('and printed it so, in the note of the sheet', oldNote.split(' · ').indexOf('חוב פתוח -500 ₪') !== -1,
        oldNote);

    const phone = phoneHolding(record, { today: '2026-09-18' });
    const live = phone.State.schedule;
    same('this build opens it: nothing held aside, writing not blocked, no closure called impossible',
        [Object.keys(live.ledger.unreadable || {}), phone.call('farkadWritesBlocked'),
            phone.call('impossibleClosures', live)], [[], false, []]);
    same('not one byte of what v179 wrote has changed - the ledger is append-only',
        clone(live.ledger.advances), written);

    const last = phone.call('advanceAccount', live, 'w_d', ...P3);
    same('the frozen account is read as what it was: opened on no debt and 500 in credit, 1,000 off, closed on 0',
        [last.carriedIn, last.creditIn, last.given, last.gross, last.deducted, last.net, last.carriedOut,
            last.carriedForward, last.creditForward, last.closed],
        [0, 500, 1500, 3050, 1000, 2050, 0, 0, 0, true]);
    const middle = phone.call('advanceAccount', live, 'w_d', ...P2);
    same('and the account before it now hands on 0 owed and 500 in credit, where v179 said minus 500',
        [middle.carriedForward, middle.creditForward, middle.carriedOut, middle.deducted], [0, 500, 0, 500]);

    const run = reportsIn(phone, P3);
    const statement = run("workerStatementText('w_d')").split('\n');
    const sheet = sheetOf(run);
    check('his statement and the sheet name the credit; neither prints minus 500 as a balance',
        statement.indexOf(`${CREDIT_FROM_BEFORE}: 500`) !== -1
        && String(cell(sheet, 'הערה')).split(' · ').indexOf(`500 ₪ ${CREDIT_FROM_BEFORE}`) !== -1
        && statement.join('\n').indexOf('-500') === -1 && String(cell(sheet, 'הערה')).indexOf('-500') === -1,
        JSON.stringify([statement.slice(-10), cell(sheet, 'הערה')]));
    same('the money columns are the ones the payslip was closed on',
        [cell(sheet, 'נצבר'), cell(sheet, 'לתשלום')], [3050, 2050]);

    // The same record where v179 had NOT yet closed the last account: v179 showed 1,000
    // owed only because the advance fell in the very next fortnight. This build shows
    // 1,000 too - and would have shown it in any fortnight.
    const unclosed = fixtureTwo(old, false);
    same('an open account v179 showed as 1,000 owed is still 1,000 owed here',
        [old.advanceAccount(unclosed, 'w_d', ...P3).deducted,
            APP.advanceAccount(unclosed, 'w_d', ...P3).deducted], [1000, 1000]);

    // The same evenings with advance C taken one account LATER (21 September): v179 had
    // forgotten the 500 by then and took all 1,500 off; this build takes 1,000, as above.
    const oneLater = fixtureTwo(old, false, '2026-09-21');
    work(oneLater, FIVE(P[3][0]));
    same('the same 1,500 taken one account later: v179 took 1,500 off the wage, this build takes 1,000',
        [old.advanceAccount(oneLater, 'w_d', ...P[3]).deducted,
            APP.advanceAccount(oneLater, 'w_d', ...P[3]).deducted,
            shekels(oracle.accountOf(oneLater, 'w_d', ...P[3]).deducted)], [1500, 1000, 1000]);

    // And the one that CHANGES on a phone: v179 dropped the credit after one boundary.
    const late = fixtureOne();
    give(late, 'a_2', '2026-09-07', 1500, '2026-09-07T09:00:00.000Z');
    same('1,500 taken one account later: v179 said 1,500 owed, this build says 1,000 - the figure that moves',
        [old.advanceAccount(late, 'w_d', ...P3).carriedForward,
            APP.advanceAccount(late, 'w_d', ...P3).carriedForward], [1500, 1000]);
}

// ================================================================== the other ruling
//
// «No credit at all: the excess is only flagged for review.» One line of
// js/model/schema.js (OVERPAYMENT_STAYS_CREDIT), reached here through the test seam so
// that the alternative is a build that has been run and not a sentence in a report.
{
    suite('1d. the switch: with the credit off, nothing is carried and the excess is flagged');

    const off = appOf(makeDevice({ flags: { overpaymentCredit: false } }));
    given('the seam is read', off.overpaymentStaysCredit() === false
        && APP.overpaymentStaysCredit() === true);

    const record = fixtureOne();
    const closed = off.advanceAccount(record, 'w_d', ...P1);
    same('the closed account hands forward nothing at all, and names the 500 it dropped',
        [closed.carriedForward, closed.creditForward, closed.position, closed.excess], [0, 0, 0, 500]);
    const owed = [['2026-08-24'], ['2026-09-07'], ['2026-10-19']].map(([date]) => {
        const later = clone(record);
        give(later, 'a_2', date, 1500, `${date}T09:00:00.000Z`);
        const fold = off.openAdvanceBalance(later, 'w_d');
        return [off.advanceAccount(later, 'w_d', ...P[5]).carriedForward, fold ? fold.total : 0];
    });
    same('1,500 taken is 1,500 owed in whichever fortnight, by the account and by the advances',
        owed, [[1500, 1500], [1500, 1500], [1500, 1500]]);

    // The case with nobody over-settled on any advance: an OPEN period in which more came
    // back than was owed. With the credit on it is carried and says nothing; with it off
    // it is dropped, so it is flagged.
    const quiet = base();
    work(quiet, FIVE(P1[0]).concat(FIVE(P2[0])));
    give(quiet, 'a_A', '2026-08-10', 1000, '2026-08-10T09:00:00.000Z');
    repay(quiet, 'le_back', 'a_A', '2026-08-25', 400, '2026-08-25T08:00:00.000Z');
    given('nobody is over-settled on an advance', off.overpaidAdvances(quiet, 'w_d').length === 0);
    const flagged = off.advanceAccount(quiet, 'w_d', ...P2);
    const carried = APP.advanceAccount(quiet, 'w_d', ...P2);
    same('off: nothing carried, 400 named, the account marked for review',
        [flagged.carriedForward, flagged.creditForward, flagged.excess, flagged.review], [0, 0, 400, true]);
    same('on: the same 400 is his credit, and nothing is marked',
        [carried.carriedForward, carried.creditForward, carried.excess, carried.review], [0, 400, 400, false]);

    // And it is SAID, in the sentence the app already has for an account that does not
    // add up - on the sheet and on the man's copy - and a close is refused for it.
    const offPhone = phoneHolding(quiet, { today: '2026-09-03', flags: { overpaymentCredit: false } });
    const offRun = reportsIn(offPhone, P2);
    const WARNING = '⚠️ החשבון דורש בדיקה · ההחזרים עולים על החוב הפתוח ב-400 ₪ · אין לאשר את התשלום אוטומטית';
    check('off: the statement and the sheet say the account needs looking at, by 400, in the existing sentence',
        offRun("workerStatementText('w_d')").split('\n').indexOf(WARNING) !== -1
        && String(cell(sheetOf(offRun), 'הערה')).indexOf(WARNING) !== -1,
        JSON.stringify([offRun("workerStatementText('w_d')").split('\n').slice(-5), cell(sheetOf(offRun), 'הערה')]));
    check('off: and neither names a credit', offRun("workerStatementText('w_d')").indexOf(CREDIT) === -1
        && String(cell(sheetOf(offRun), 'הערה')).indexOf(CREDIT) === -1);
    same('off: a close of that fortnight is refused, for the reason the app already gives',
        off.planPeriodClosure(quiet, 'w_d', ...P2, '2026-09-03T18:00:00.000Z').reasons, ['overpaid']);
    const onRun = reportsIn(phoneHolding(quiet, { today: '2026-09-03' }), P2);
    check('on: no warning for the same record - his 400 is named as a credit instead',
        onRun("workerStatementText('w_d')").indexOf('דורש בדיקה') === -1
        && onRun("workerStatementText('w_d')").split('\n').indexOf(`${CREDIT}: 400`) !== -1);

    // A late repayment into a CLOSED fortnight is a movement after the close under either
    // ruling, and the sheet's existing note says so under both.
    same('either way the closed fortnight reports the whole 500 as moved after the close',
        [closed.lateSinceClose, APP.advanceAccount(record, 'w_d', ...P1).lateSinceClose], [-500, -500]);
}

// ================================================================== 2. THE HALF AGORA
{
    suite('2a. a wage finer than an agora, closed, and the phone opened again');

    const phone = halfAgoraPhone(makeDevice);
    const live = () => phone.State.schedule;
    same('the days still add up to 630.625 - nothing rounds a day or the sum of them',
        phone.call('payrollReport', live(), ...P1).find(item => item.workerId === 'w_d').amount, 630.625);
    const plan = phone.call('planPeriodClosure', live(), 'w_d', ...P1, '2026-08-20T18:00:00.000Z');
    given('the app offers the close, with nothing against it', plan.canClose === true,
        JSON.stringify(plan.reasons));
    same('the wage of the ACCOUNT is the wage as paid: 630.63, and that is the most that can come off',
        [plan.gross, plan.deducted, plan.carriedForward], [630.63, 630.63, 4369.37]);
    same('the second calculator rounds it the same way, once',
        [oracle.accountOf(clone(live()), 'w_d', ...P1).gross, oracle.accountOf(clone(live()), 'w_d', ...P1).deducted]
            .map(shekels), [630.63, 630.63]);

    // ONE FIGURE ON EVERY SURFACE, before the close and after it.
    const surfaces = device => {
        const run = reportsIn(device, P1);
        const sheet = sheetOf(run);
        const statement = run("workerStatementText('w_d')").split('\n');
        return [cell(sheet, 'נצבר'), cell(sheet, 'לתשלום'),
            statement.find(text => text.indexOf('נצבר: ') === 0),
            statement.find(text => text.indexOf('נוכה מהשכר: ') === 0),
            statement.find(text => text.indexOf('נותר לתשלום: ') === 0).replace(/[^\d.:א-ת ]/g, '')];
    };
    const SHOWN = [630.63, 0, 'נצבר: 630.63', 'נוכה מהשכר: 630.63', 'נותר לתשלום: 0'];
    same('open: the sheet and the statement show 630.63 earned, 630.63 off, 0 to pay', surfaces(phone), SHOWN);

    given('the close was committed', closeIt(phone) === true);
    const taken = Object.values(live().ledger.advances).find(entry => entry.kind === 'deducted');
    same('the closure records 630.63 off a wage of 630.63, and 4,369.37 left',
        [taken.amount, taken.gross, taken.net, taken.balanceAfter], [630.63, 630.63, 0, 4369.37]);
    check('a close never takes more off than the man earned', taken.amount <= taken.gross,
        `took ${taken.amount} off a wage of ${taken.gross}`);
    check('its own judge accepts the closure it has just written',
        phone.call('impossibleClosures', live()).length === 0,
        JSON.stringify(phone.call('closureProblems', live(), taken)));
    same('closed: every surface still shows the same figures', surfaces(phone), SHOWN);

    const again = makeDevice({ storage: phone.dump(), deviceId: 'd_office' });
    again.setToday('2026-08-21');
    again.State.load();
    same('after a close and a reopen, nothing on the ledger is held aside as unreadable',
        Object.keys(again.State.schedule.ledger.unreadable || {}), []);
    check('and the phone that closed the account can still write',
        again.call('farkadWritesBlocked') === false);
    same('and still shows the same figures', surfaces(again), SHOWN);
}

{
    suite('2b. a phone that already holds the closure v179 wrote');

    // (i) v179 closed it and the app has not been opened since: the closure is in the
    //     ledger, as written.
    const first = halfAgoraPhone(v179);
    given('v179 closed the account', closeIt(first) === true);
    const id = Object.keys(first.State.schedule.ledger.advances).find(key => key.indexOf('le_close_') === 0);
    const wrote = clone(first.State.schedule.ledger.advances[id]);
    given('v179 wrote 630.63 off a recorded wage of 630.625, and 4,369.37 left',
        wrote.amount === 630.63 && wrote.gross === 630.625 && wrote.balanceAfter === 4369.37,
        JSON.stringify([wrote.amount, wrote.gross, wrote.balanceAfter]));
    const closedDisk = first.dump();

    // (ii) v179 was opened again, held its own closure aside and blocked; the person was
    //      told, acknowledged, and went on working - so the disk now has it held.
    const blocked = v179({ storage: closedDisk, deviceId: 'd_office' });
    blocked.setToday('2026-08-21');
    blocked.State.load();
    given('v179, reopened, holds its own closure aside and blocks writing',
        Object.keys(blocked.State.schedule.ledger.unreadable).join() === id
        && blocked.call('farkadWritesBlocked') === true);
    blocked.global('Recovery').acknowledge();
    given('the person acknowledged and recorded the next day', blocked.State.commit(blocked.call('assignPlace',
        blocked.State.schedule, '2026-08-21', 'w_d', 'actual', 'p_x')) === true);
    const heldDisk = blocked.dump();
    given('the disk now holds the closure under ledger.unreadable',
        Object.keys((JSON.parse(heldDisk['scheduleData:v2']).ledger || {}).unreadable || {}).join() === id);
    const again179 = v179({ storage: heldDisk, deviceId: 'd_office' });
    again179.State.load();
    given('and v179 would have blocked again at every open, for ever',
        again179.call('farkadWritesBlocked') === true);

    // (iii) and once the write that carried the closure has left the queue, the held copy
    //       is the only one this phone has: the record alone, with the closure under
    //       ledger.unreadable and nowhere else.
    const heldOnlyDoc = JSON.parse(heldDisk['scheduleData:v2']);
    delete heldOnlyDoc.ledger.advances[id];
    const heldOnly = { 'scheduleData:v2': JSON.stringify(heldOnlyDoc) };
    const only179 = v179({ storage: heldOnly, deviceId: 'd_office' });
    only179.State.load();
    given('which v179 also blocks on, with the deduction counted nowhere',
        only179.call('farkadWritesBlocked') === true
        && only179.call('advanceOutstanding', only179.State.schedule, wrote.advanceId).left === 5000);

    [['never reopened by v179', closedDisk], ['held aside by v179, acknowledged, saved', heldDisk],
        ['held aside, and the held copy is the only copy', heldOnly]]
        .forEach(([state, disk]) => {
            const now = makeDevice({ storage: disk, deviceId: 'd_office' });
            now.setToday('2026-08-22');
            now.State.load();
            const live = now.State.schedule;
            same(`${state}: this build holds nothing aside and does not block`,
                [Object.keys(live.ledger.unreadable || {}), now.call('farkadWritesBlocked'),
                    now.call('impossibleClosures', live)], [[], false, []]);
            same(`- the closure is in the ledger exactly as v179 wrote it, unrounded wage and all`,
                clone(live.ledger.advances[id]), wrote);
            const state179 = now.call('advanceOutstanding', live, wrote.advanceId);
            same(`- and it counts: 630.63 came off, 4,369.37 is left on the advance and carried`,
                [state179.deducted, state179.left, now.call('advanceAccount', live, 'w_d', ...P1).carriedForward],
                [630.63, 4369.37, 4369.37]);
            const sheet = sheetOf(reportsIn(now, P1));
            same(`- and the sheet prints what it always printed: 630.63 earned, 0 to pay`,
                [cell(sheet, 'נצבר'), cell(sheet, 'לתשלום')], [630.63, 0]);
            check(`- and the phone records the next thing it is asked to`,
                now.State.commit(now.call('assignPlace', live, '2026-08-23', 'w_d', 'actual', 'p_x')) === true);
            const reopened = makeDevice({ storage: now.dump(), deviceId: 'd_office' });
            reopened.State.load();
            same(`- and stays that way at the next open`,
                [Object.keys(reopened.State.schedule.ledger.unreadable || {}), reopened.call('farkadWritesBlocked')],
                [[], false]);
        });

    // WHAT THE JUDGE STILL REFUSES. The allowance is one thing: a deduction equal to the
    // wage as printed. A real over-deduction is refused exactly as before, at the door
    // and when it is already held.
    const doc = JSON.parse(heldDisk['scheduleData:v2']);
    const forged = (amount, gross) => {
        const copy = clone(doc);
        const entry = Object.assign({}, wrote, { amount, gross,
            balanceAfter: Math.round((5000 - amount) * 100) / 100 });
        delete copy.ledger.unreadable[id];
        copy.ledger.advances[id] = entry;
        return { copy, entry };
    };
    [['one agora more than the printed wage', 630.64, 630.625],
        ['an agora more than a wage that was whole agorot', 630.63, 630.62],
        ['a shekel more', 631.63, 630.625]].forEach(([what, amount, gross]) => {
        const { copy, entry } = forged(amount, gross);
        same(`the judge refuses ${what}: ${amount} off ${gross}`,
            APP.closureProblems(copy, entry).slice(0, 1), ['a closure deducting more than the wage it came off']);
        const arriving = phoneHolding(copy, { today: '2026-08-22' });
        same(`- and a phone it arrives on holds it aside and stops writing`,
            [Object.keys(arriving.State.schedule.ledger.unreadable || {}), arriving.call('farkadWritesBlocked')],
            [[id], true]);
        // And one that is ALREADY held is not taken back.
        const kept = clone(doc);
        kept.ledger.unreadable[id] = entry;
        delete kept.ledger.advances[id];
        const holding = phoneHolding(kept, { today: '2026-08-22' });
        same(`- and one already held aside stays held`,
            [Object.keys(holding.State.schedule.ledger.unreadable || {}), holding.call('farkadWritesBlocked')],
            [[id], true]);
    });
    same('and the exact v179 shape is the only thing the allowance names',
        [APP.closureWithinRoundedWage(wrote), APP.closureWithinRoundedWage(forged(630.64, 630.625).entry),
            APP.closureWithinRoundedWage(forged(630.63, 630.62).entry),
            APP.closureWithinRoundedWage(forged(630.63, 630.63).entry),
            APP.closureWithinRoundedWage(Object.assign({}, wrote, { kind: 'repaid' }))],
        [true, false, false, false, false]);

    // A HELD CLOSURE THAT HAS BEEN BUILT ON IS LEFT HELD. The phone carried on without the
    // deduction: a later fortnight (two days, 1,220) was closed against a debt of 5,000,
    // not 4,369.37, and wrote 3,780 left.
    // Taking the old closure back now would make the LATER one the impossible one, so
    // nothing moves and a person has to look - exactly as before this build.
    const carriedOn = v179({ storage: heldOnly, deviceId: 'd_office' });
    carriedOn.setToday('2026-09-03');
    carriedOn.State.load();
    carriedOn.global('Recovery').acknowledge();
    given('v179 recorded a day in the next fortnight', carriedOn.State.commit(carriedOn.call('assignPlace',
        carriedOn.State.schedule, '2026-08-24', 'w_d', 'actual', 'p_x')) === true);
    given('and closed that fortnight too, against the whole 5,000',
        carriedOn.State.commitMany(carriedOn.call('closePeriodChanges', carriedOn.State.schedule,
            'w_d', ...P2, '2026-09-03T18:00:00.000Z', 'd_office')) === true
        && Object.values(carriedOn.State.schedule.ledger.advances)
            .some(entry => entry.kind === 'deducted' && entry.periodFrom === P2[0]
                && entry.amount === 1220 && entry.balanceAfter === 3780));
    const builtOn = makeDevice({ storage: carriedOn.dump(), deviceId: 'd_office' });
    builtOn.setToday('2026-09-04');
    builtOn.State.load();
    same('a held closure that a later close was built without stays held, and the later close stays read',
        [Object.keys(builtOn.State.schedule.ledger.unreadable || {}), builtOn.call('farkadWritesBlocked'),
            builtOn.call('impossibleClosures', builtOn.State.schedule)], [[id], true, []]);
}

// ================================================================== 3. two builds at once
//
// The phones do not update together. What a v179 phone makes of what v180 wrote, and what
// happens when the two close the same account.
{
    suite('3. a phone still on v179, beside one on v180');

    // The payslip v180 writes on a credit carries a field v179 has never heard of.
    const credit = fixtureTwo(APP, true);
    given('v180 wrote the credit on the payslip',
        credit.ledger.advances.le_period_w_d_20260904.creditIn === 500);
    const reads = v179Holding(credit, '2026-09-18');
    same('v179 opens a record with v180\'s credit payslip on it: nothing held aside, not blocked',
        [Object.keys(reads.State.schedule.ledger.unreadable || {}), reads.call('farkadWritesBlocked'),
            reads.call('impossibleClosures', reads.State.schedule)], [[], false, []]);
    same('- and keeps the field it does not know, to the byte',
        clone(reads.State.schedule.ledger.advances.le_period_w_d_20260904),
        clone(credit.ledger.advances.le_period_w_d_20260904));

    // The half-agora closure as v180 writes it: 630.63 off 630.63.
    const mine = halfAgoraPhone(makeDevice);
    given('v180 closed the account', closeIt(mine) === true);
    const theirs = v179({ storage: mine.dump(), deviceId: 'd_office' });
    theirs.setToday('2026-08-21');
    theirs.State.load();
    same('v179 opens v180\'s closure of the half-agora wage: nothing held aside, not blocked',
        [Object.keys(theirs.State.schedule.ledger.unreadable || {}), theirs.call('farkadWritesBlocked')],
        [[], false]);

    // BOTH CLOSING THE SAME ACCOUNT. A closure's id is its period, so the two write one
    // field - and here they write different bytes in it. That is two bodies under one
    // id, which no merge resolves: it is why every phone has to be on v180 before the
    // next account is closed.
    const older = halfAgoraPhone(v179);
    given('and v179 closed the same account on its own phone', closeIt(older) === true);
    const arriving = clone(older.State.schedule);
    const conflicts = [];
    APP.mergeLedgerInto(arriving, clone(mine.State.schedule), conflicts);
    const ids = conflicts.map(one => one.id).sort();
    check('the same account closed by a v179 phone and a v180 phone is two bodies under one id',
        // (The payslip. Each phone here made its own advance, so the two deductions have
        // different ids; on one shared record they would be a second pair.)
        ids.join() === 'le_period_w_d_20260807',
        JSON.stringify(conflicts.map(one => [one.id, one.mine.gross, one.theirs.gross])));
    // And where neither the credit nor the half agora is in it, the two write one fact.
    const plainOld = base();
    const plainNew = base();
    [[plainOld, appOf(v179())], [plainNew, APP]].forEach(([record, app]) => {
        work(record, FIVE(P1[0]));
        give(record, 'a_1', '2026-08-10', 1000, '2026-08-10T09:00:00.000Z');
        app.closePeriodChanges(record, 'w_d', ...P1, '2026-08-20T18:00:00.000Z', 'd');
    });
    same('an ordinary account closed by the two builds is the same bytes, entry for entry',
        clone(plainNew.ledger.advances), clone(plainOld.ledger.advances));
}

report();
