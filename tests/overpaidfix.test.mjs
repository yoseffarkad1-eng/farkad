// «לסדר את המקדמה» (v201, js/ui/reports.js): an over-settled advance, sorted by one button.
//
//   node tests/overpaidfix.test.mjs
//
// The owner's phone, 2026-11-16. One man on 550 a day; one advance of 2,200 and, in
// «היסטוריה מלאה», four lines of it, written in this order:
//
//   1. given     2,200  dated 23/10                      the advance
//   2. repaid    2,200  dated 10/11  «הוחזר במזומן»       the repayment form
//   3. deducted  2,200  dated 29/10  «נוכה מהשכר»         the close of 16/10-29/10, made AFTER it
//   4. reversed  2,200  dated 23/10  «תיקון-היפוך»        the advance-level «תיקון», no target,
//                                                         reason «העובד החזיר» - offered because
//                                                         that button stood on any advance with
//                                                         `given` above zero, settled or not
//
// The fold then says given 0, settled 4,400, over-settled by 4,400; the pay sheet asks for the
// account to be looked at and the closing box refuses ('overpaid') with «תקן קודם». The truth,
// in the owner's words: he owes nothing and is owed nothing. His ruling: make it simple.
//
//   F1  THE OWNER'S STATE, as the screens read it: the warning, the closing box's sentence -
//       and now its button, on the box, on the advance row and on the advances page; the plan
//       names the repayment and the deduction; reading writes nothing.
//   F2  THE PRESS, through the screen's own button: the question in plain words (the advance,
//       the excess, each line by name, nothing deleted, the closed payslip unchanged), «ביטול»
//       focused; on «כן» exactly two corrections - the history row's own writer, the fixed
//       reason - in ONE commit; nothing existing moved by a byte; over-settled by 0 on every
//       advance of his; the next account closes; the judge condemns nothing; the closed
//       period reads figure for figure as before; the warning gone; kept across a reopen;
//       and the second calculator (tests/oracle.mjs) agrees.
//   F3  WHICH LINES: the repayment before the deduction, fewer before more, newest first -
//       and no exact set means no button, one sentence, and nothing written.
//   F4  THE RECORD MOVED between the question and the answer: nothing written, one sentence.
//   F5  NOT SYNCED: refused before the question, and at the answer; nothing written.
//   F6  DOUBLE PRESS: one question, one write.
//   F7  THE GATES SHUT: no button, no plan, nothing written.
//   F8  PREVENTION: no advance-level «תיקון» on an advance with nothing left on it; capped at
//       what is left; the repayment form's own cap, confirmed.
//   F9  THE WORDS, word for word.
//
// Synthetic names and money throughout. No browser, no emulator.

import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeDevice, settleUntil } from './harness.mjs';
import { makeDom } from './moneydom.mjs';
import { suite, check, same, given, report } from './runner.mjs';
import * as oracle from './oracle.mjs';

process.env.TZ = 'Asia/Jerusalem';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = file => readFileSync(join(ROOT, file), 'utf8');
const OPEN = { carryAdvances: true, ledgerWrites: true };
const SHUT = { carryAdvances: false, ledgerWrites: false };
const TODAY = '2026-11-16';
const j = value => JSON.stringify(value);
const plain = text => String(text).replace(/[⁦-⁩‎‏]/g, '');
const clone = value => JSON.parse(JSON.stringify(value));

// The model's own functions, asked of a plain record (no phone needed to build one).
const BUILDER = makeDevice({ flags: OPEN });
const M = name => BUILDER.global(name);

const addDays = (date, days) => {
    const [y, m, d] = date.split('-').map(Number);
    const at = new Date(y, m - 1, d + days, 12);
    return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`;
};

// ---------------------------------------------------------------- the record
function base({ approved = true } = {}) {
    const record = {
        schemaVersion: 2,
        workers: [{ id: 'w_s', name: 'סאמר', dailyRate: 550, hourlyRate: 0, active: true }],
        places: [{ id: 'p_x', name: 'אתר מערב', active: true }],
        days: {}, vehicles: [], advances: {},
        ledger: { advances: {}, unreadable: {}, migrations: {} }
    };
    if (approved) record.ledger.migrations.cm_carry = { id: 'cm_carry', kind: 'carry', rows: 0, at: '', by: 'd' };
    // Every day but Saturday, 16 October to 15 November: the closed fortnight, the next one
    // (ended), and the first days of the one holding today.
    for (let date = '2026-10-16'; date <= '2026-11-15'; date = addDays(date, 1)) {
        if (new Date(`${date}T12:00:00`).getDay() === 6) continue;
        record.days[date] = { plan: {}, actual: { w_s: { entries: [{ placeId: 'p_x' }], rates: { daily: 550, hourly: 0 } } } };
    }
    return record;
}
const give = (record, date, amount, at) =>
    M('recordNewAdvance')(record, 'w_s', date, amount, '', at, 'd_owner', 'cash')[0].value.id;
const repay = (record, advanceId, amount, date, at) => {
    const made = M('recordAdvanceRepaid')(record, advanceId, amount, date, '', at, 'd_owner', 'cash');
    given('a seeded repayment was written', Boolean(made), `${advanceId} ${amount}`);
    return made.value.id;
};
const close = (record, from, to, deduction, at) => {
    const made = M('closePeriodChanges')(record, 'w_s', from, to, at, 'd_owner', deduction);
    given('a seeded close was written', made.length > 0, `${from} ${deduction}`);
    return made;
};

// THE OWNER'S FOUR LINES, in the order they were written.
function ownersRecord(options) {
    const record = base(options);
    const a1 = give(record, '2026-10-23', 2200, '2026-10-23T07:00:00.000Z');
    const repaid = repay(record, a1, 2200, '2026-11-10', '2026-11-10T15:00:00.000Z');
    const closed = close(record, '2026-10-16', '2026-10-29', 2200, '2026-11-11T10:00:00.000Z');
    const deducted = closed.filter(change => change.value.kind === 'deducted')[0].value.id;
    given('the advance-level reversal was written', Boolean(M('recordAdvanceReversed')(record, a1, 2200,
        '2026-10-23', 'העובד החזיר', '2026-11-12T10:00:00.000Z', 'd_owner')));
    return { record, a1, repaid, deducted };
}

// ---------------------------------------------------------------- a phone holding it
function phone(record, { flags = OPEN, synced = true } = {}) {
    const d = makeDevice({ deviceId: 'd_owner', flags, storage: { 'scheduleData:v2': JSON.stringify(record) } });
    d.setToday(TODAY);
    d.Sync.pushDelayMs = 5;
    const dom = makeDom();
    const make = dom.createElement;
    // Nodes that keep their listeners, so a button on the screen can be PRESSED.
    dom.createElement = tag => {
        const node = make(tag);
        node.dataset = {};
        node.listeners = {};
        node.addEventListener = (type, heard) => { (node.listeners[type] = node.listeners[type] || []).push(heard); };
        return node;
    };
    ['reportsView', 'advancesView', 'workerDaysTitle', 'workerDaysMeta', 'workerDaysBody', 'workerDaysModal']
        .forEach(id => dom.register(id));
    d.ctx.document = dom;
    d.dom = dom;
    d.run = code => vm.runInContext(code, d.ctx, { filename: 'harness:overpaidfix' });
    ['js/ui/sitecolor.js', 'js/ui/reports.js', 'js/ui/daycheck.js', 'js/ui/owes.js', 'js/ui/weeklyclose.js']
        .forEach(file => d.run(source(file)));
    d.told = [];
    d.asked = [];
    d.answers = [];
    d.ctx.askTell = said => { d.told.push(typeof said === 'string' ? said : (said && said.message)); return Promise.resolve(true); };
    // Each question waits for the suite to answer it (d.answer), so a suite can move the
    // record while the question is on the screen.
    d.ctx.askConfirm = question => {
        d.asked.push(question);
        return new Promise(resolve => d.answers.push(resolve));
    };
    d.answer = value => { const resolve = d.answers.shift(); given('a question is waiting for its answer', Boolean(resolve)); resolve(value); };
    d.views = [];
    d.run('var currentView = "reports";');
    d.ctx.showView = view => { d.views.push(view); d.run(`currentView = ${JSON.stringify(view)}`); };
    d.ctx.openSettings = () => {};
    if (synced) d.run('weeklyCloseShared = () => true;');
    // js/ui/day.js is not loaded here; its double-tap guard is, with the app's own number.
    d.run(`var DOUBLE_TAP_GUARD_MS = ${/const DOUBLE_TAP_GUARD_MS = (\d+);/.exec(source('js/ui/day.js'))[1]};`);
    d.State.load();
    // «דוחות» as it opens: the account holding today, read per man (v189).
    d.run('var r = defaultPayrollRange(); REPORT_RANGE.from = r.from; REPORT_RANGE.to = r.to; REPORT_PRESET = "fortnight";');
    // Every commit counted, at the one door a commit goes through.
    d.commits = 0;
    d.run('var realCommitMany = State.commitMany; var realCommit = State.commit;');
    d.ctx.__count = () => { d.commits += 1; };
    d.run('State.commitMany = function () { __count(); return realCommitMany.apply(this, arguments); };'
        + 'State.commit = function () { __count(); return realCommit.apply(this, arguments); };');
    d.ledger = () => (d.State.schedule.ledger || {}).advances || {};
    d.disk = () => {
        const out = d.dump();
        Object.keys(out).forEach(key => { if (key.indexOf('farkad:writeTick') === 0) delete out[key]; });
        return j(out);
    };
    d.days = () => { d.run('openWorkerDays("w_s")'); return d.dom.getElementById('workerDaysBody'); };
    d.advancesPage = () => { d.run('ADVANCE_WORKER = "w_s"; currentView = "advances"; renderAdvances(); currentView = "reports";'); return d.dom.getElementById('advancesView'); };
    d.plan = advanceId => JSON.parse(d.run(`JSON.stringify(overpaidFixPlan(State.schedule, "w_s"${advanceId ? `, ${j(advanceId)}` : ''}))`));
    d.idle = () => settleUntil(() => d.run('!OVERPAID_FIX_BUSY'), 20000, 5);
    return d;
}
const fixButtons = root => root.querySelectorAll('.overpaid-fix');
const press = node => (node.listeners.click || []).forEach(heard => heard({ preventDefault() {}, target: node }));
const texts = root => plain(root.textContent);
const buttonsSaying = (root, words) => root.querySelectorAll('button').filter(node => plain(node.textContent) === words);
const T = d => JSON.parse(d.run('JSON.stringify(OVERPAID_FIX_TEXT, (k, v) => typeof v === "function" ? String(v) : v)'));
const word = (d, name, ...args) => d.run(`OVERPAID_FIX_TEXT.${name}(${args.map(a => j(a)).join(', ')})`);

const OVERPAID_SENTENCE = 'יש עודף בהחזרי המקדמות של העובד הזה. אי אפשר לסגור חשבון שלא מסתדר - תקן קודם, ואז סגור.';
const CLOSED = ['2026-10-16', '2026-10-29'];
const NEXT = ['2026-10-30', '2026-11-12'];
const AT_NOW = '2026-11-16T09:00:00.000Z';
const freeze = (d, iso) => {
    const Real = Date;
    class Fixed extends Real {
        constructor(...args) { if (args.length) super(...args); else super(iso); }
        static now() { return new Real(iso).getTime(); }
    }
    d.ctx.Date = Fixed;
};
const account = (d, span) => d.call('advanceAccount', d.State.schedule, 'w_s', ...span);
const overpaidAll = d => d.call('overpaidAdvances', d.State.schedule, 'w_s').map(state => [state.id, state.overpaid]);
const sameMoney = (app, agorot) => Math.round(Number(app) * 100) === Math.round(Number(agorot));

// ================================================================== F1 the owner's state
{
    suite('F1 the owner\'s four lines: the warning, the refusal - and now the button, on three screens; reading writes nothing');
    const { record, a1, repaid, deducted } = ownersRecord();
    const d = phone(record);
    const before = d.disk();
    const state = d.call('advanceOutstanding', d.State.schedule, a1);
    same('the fold as the owner\'s phone reads it', [state.given, state.settled, state.overpaid, state.left], [0, 4400, 4400, 0]);
    const next = d.call('planPeriodClosure', d.State.schedule, 'w_s', ...NEXT, AT_NOW);
    check('the next account is refused, over-settled', next.reasons.indexOf('overpaid') !== -1 && !next.canClose, j(next.reasons));
    const plan = d.plan();
    same('the plan: this advance, the excess, and exactly the repayment and the deduction (newest first)',
        [plan.fixable.length, plan.fixable[0].advanceId, plan.fixable[0].overpaid, plan.fixable[0].given,
            plan.fixable[0].date, plan.fixable[0].picks.map(pick => [pick.id, pick.kind, pick.amount]), plan.stuck],
        [1, a1, 4400, 2200, '2026-10-23', [[deducted, 'deducted', 2200], [repaid, 'repaid', 2200]], []]);
    const days = d.days();
    check('the closing box still says why', texts(days).indexOf(OVERPAID_SENTENCE) !== -1);
    const boxButtons = days.querySelectorAll('.period-closure').map(box => fixButtons(box).length);
    same('and, under it, ONE button «לסדר את המקדמה»', [boxButtons, fixButtons(days).map(node => plain(node.textContent))],
        [[1], ['לסדר את המקדמה']]);
    const page = d.advancesPage();
    check('the advances page says it is over-settled', texts(page).indexOf('נרשמו החזרים עודפים של 4400 ₪') !== -1, texts(page).slice(0, 200));
    same('and the over-settled card carries the button', fixButtons(page).length, 1);
    check('no «תיקון טעות» on that card (nothing is left on it)', buttonsSaying(page, 'תיקון טעות').length === 0);
    check('drawing the three screens wrote nothing', d.disk() === before);
    same('and committed nothing', d.commits, 0);

    // The advance row of the days dialog, on a range that holds the advance.
    d.run('REPORT_RANGE.from = "2026-10-16"; REPORT_RANGE.to = "2026-10-29"; REPORT_PRESET = "custom";');
    const row = d.days().querySelectorAll('.wday-advance')[0];
    given('the advance row is on the dialog of its own fortnight', Boolean(row));
    check('the row says «טעון בדיקה»', texts(row).indexOf('טעון בדיקה') !== -1, texts(row));
    same('and carries the button, and no advance-level «תיקון»', [fixButtons(row).length, buttonsSaying(row, 'תיקון').length], [1, 0]);
    d.run('r = defaultPayrollRange(); REPORT_RANGE.from = r.from; REPORT_RANGE.to = r.to; REPORT_PRESET = "fortnight";');
}

// ================================================================== F2 the press
{
    suite('F2 the press: one plain question, two corrections in ONE commit, nothing existing moved, the account closes');
    const { record, a1, repaid, deducted } = ownersRecord();
    const d = phone(record);
    freeze(d, AT_NOW);
    const oldLedger = clone(d.ledger());
    // What the closed fortnight's payslip says: frozen by the close, and the same after.
    const FROZEN = ['from', 'to', 'carriedIn', 'creditIn', 'given', 'repaid', 'gross', 'deducted', 'carriedOut',
        'carriedForward', 'net', 'closed'];
    const frozenOf = one => FROZEN.map(field => [field, one[field]]);
    const closedBefore = account(d, CLOSED);
    given('before: the closed fortnight hands on the 2,200 credit the owner was shown',
        closedBefore.creditForward === 2200 && closedBefore.overpaid === 4400, j(closedBefore));
    const payslipBefore = j(d.call('closedPeriods', d.State.schedule, 'w_s'));
    const button = fixButtons(d.days())[0];
    given('the button is on the screen', Boolean(button));
    press(button);
    await settleUntil(() => d.asked.length === 1, 5000, 5);
    const question = d.asked[0];
    same('the question, word for word', [question.title, plain(question.message), question.names.map(plain), question.footer, question.ok],
        ['לסדר את המקדמה?',
            'המקדמה של 2200 ₪ מ-23/10/2026 נרשמה כמוחזרת יותר מפעם אחת, ולכן יש עודף של 4400 ₪. כדי לסדר, יבוטלו:',
            ['נוכה מהשכר · 29/10/2026 · 2200 ₪', 'הוחזר במזומן · 10/11/2026 · 2200 ₪'],
            'שום דבר לא נמחק: לצד כל רישום נכתב תיקון. התלוש של חשבון שכבר נסגר לא משתנה.',
            'כן, לסדר']);
    same('the destructive kind: «ביטול» holds the focus, the answer held for a double tap', [question.danger, question.hold], [true, 700]);
    same('asking wrote nothing', [j(d.ledger()) === j(oldLedger), d.commits], [true, 0]);
    d.answer(true);
    await d.idle();
    same('ONE commit', d.commits, 1);
    const ledger = d.ledger();
    const added = Object.keys(ledger).filter(id => !Object.prototype.hasOwnProperty.call(oldLedger, id));
    same('exactly two new lines, both corrections, one of the repayment and one of the deduction',
        added.map(id => [ledger[id].kind, ledger[id].targetId, ledger[id].targetKind, ledger[id].amount, ledger[id].date]).sort(),
        [['reversed', deducted, 'deducted', 2200, '2026-10-29'], ['reversed', repaid, 'repaid', 2200, '2026-11-10']].sort());
    same('each carries the fixed reason, this phone, this moment',
        added.map(id => [ledger[id].reason, ledger[id].by, ledger[id].at]),
        added.map(() => ['נרשם יותר מפעם אחת - סודר אוטומטית', 'd_owner', AT_NOW]));
    check('every line that was there is there, byte for byte (append-only)',
        Object.keys(oldLedger).every(id => j(ledger[id]) === j(oldLedger[id])), '');
    same('over-settled by nothing, on every advance of his', overpaidAll(d), []);
    const fold = d.call('advanceOutstanding', d.State.schedule, a1);
    same('the advance: nothing left, nothing over', [fold.left, fold.overpaid], [0, 0]);
    const nextPlan = d.call('planPeriodClosure', d.State.schedule, 'w_s', ...NEXT, AT_NOW);
    same('the next account closes, with no reason against it', [nextPlan.canClose, nextPlan.reasons], [true, []]);
    const judged = Object.values(ledger).filter(entry => entry.kind === 'closed' || entry.kind === 'deducted')
        .map(entry => [entry.id, d.call('closureProblems', d.State.schedule, entry)]);
    check('the judge condemns no closure line', judged.length >= 2 && judged.every(one => one[1].length === 0), j(judged));
    same('and nothing is impossible', d.call('impossibleClosures', d.State.schedule).length, 0);
    const closedAfter = account(d, CLOSED);
    same('the closed fortnight\'s payslip figures read figure for figure as before', frozenOf(closedAfter), frozenOf(closedBefore));
    same('and it hands nothing on any more: no credit, nothing over, nothing late',
        [closedAfter.creditForward, closedAfter.position, closedAfter.overpaid, closedAfter.lateSinceClose, closedAfter.excess],
        [0, 0, 0, 0, 0]);
    same('its frozen payslip unchanged', j(d.call('closedPeriods', d.State.schedule, 'w_s')), payslipBefore);
    const owed = d.call('openAdvanceBalance', d.State.schedule, 'w_s');
    same('he owes nothing on the ledger', owed ? owed.total : 0, 0);
    const now = account(d, NEXT);
    same('and the next account opens on nothing either way', [now.carriedIn, now.creditIn, now.overpaid, now.review], [0, 0, 0, false]);

    // The screen, redrawn by the press.
    const days = d.dom.getElementById('workerDaysBody');
    check('the closing box no longer refuses', texts(days).indexOf(OVERPAID_SENTENCE) === -1, texts(days).slice(0, 300));
    same('and the button is gone', fixButtons(days).length, 0);
    d.run('REPORT_RANGE.from = "2026-10-30"; REPORT_RANGE.to = "2026-11-12"; REPORT_PRESET = "custom";');
    const sheet = j(d.run('payrollSheetRows()'));
    check('the pay sheet asks nothing to be looked at', sheet.indexOf('דורש בדיקה') === -1 && sheet.indexOf('יתרת זכות') === -1, sheet.slice(0, 400));
    const box = d.days().querySelectorAll('.period-closure')[0];
    check('the account that ended on the 12th offers its close', Boolean(box) && texts(box).indexOf('כמה לקזז מהשכר הפעם?') !== -1,
        box ? texts(box) : 'no box');
    same('the advances page: no warning, no button', (() => { const page = d.advancesPage(); return [texts(page).indexOf('נרשמו החזרים עודפים') === -1, fixButtons(page).length]; })(), [true, 0]);
    same('nothing told', d.told, []);

    // Kept: the same record after the app is closed and opened again.
    const again = makeDevice({ deviceId: 'd_owner', flags: OPEN, storage: d.dump() });
    again.setToday(TODAY);
    again.State.load();
    same('across a reopen: the two corrections are on the disk, nothing over-settled',
        [Object.keys(again.State.schedule.ledger.advances).length, again.call('overpaidAdvances', again.State.schedule, 'w_s').length],
        [Object.keys(oldLedger).length + 2, 0]);

    // THE SECOND CALCULATOR, on the record as it is now.
    const after = clone(d.State.schedule);
    same('the second calculator: over-settled by nothing', oracle.overpaidBy(after, 'w_s'), 0);
    same('and owed nothing', oracle.openBalance(after, 'w_s').total, 0);
    const fields = ['carriedIn', 'creditIn', 'given', 'repaid', 'deducted', 'carriedForward', 'creditForward', 'overpaid'];
    [CLOSED, NEXT].forEach(span => {
        const app = account(d, span);
        const want = oracle.accountOf(after, 'w_s', ...span);
        const off = fields.filter(field => !sameMoney(app[field], want[field]));
        check(`and agrees on the account ${span.join('..')}, field by field`, off.length === 0,
            off.map(field => `${field} app ${app[field]} rule ${want[field]}`).join('; '));
    });
    same('and says the next account closes', oracle.closePlan(after, 'w_s', ...NEXT).reasons, []);
}

// ================================================================== F3 which lines
{
    suite('F3 which lines: the repayment before the deduction, fewer before more, newest first; no exact set, no button');
    // Repaid in cash AND taken off the wage: either line is the double one, and the
    // repayment is the one corrected - a deduction is on a payslip somebody was handed.
    const record = base();
    const a = give(record, '2026-10-20', 1000, '2026-10-20T07:00:00.000Z');
    close(record, ...CLOSED, 1000, '2026-10-30T10:00:00.000Z');
    const cash = repay(record, a, 1000, '2026-11-02', '2026-11-02T15:00:00.000Z');
    const d = phone(record);
    same('over-settled by one line\'s worth: the repayment is chosen', d.plan().fixable[0].picks.map(pick => [pick.id, pick.kind]),
        [[cash, 'repaid']]);

    // The pure rule, on lines laid out by hand (newest first, as the candidates come).
    const pick = (lines, cents) => {
        const chosen = d.call('overpaidFixSubset', lines, cents);
        return chosen ? chosen.map(line => line.id) : null;
    };
    const L = (id, kind, amount) => ({ id, kind, amount, date: '2026-11-01', at: '' });
    same('fewer lines before more', pick([L('r1', 'repaid', 300), L('r2', 'repaid', 200), L('r3', 'repaid', 500)], 50000), ['r3']);
    same('repayments before deductions, even at more lines', pick([L('d1', 'deducted', 500), L('r1', 'repaid', 300), L('r2', 'repaid', 200)], 50000), ['r1', 'r2']);
    same('of equals, the newest', pick([L('new', 'repaid', 500), L('old', 'repaid', 500)], 50000), ['new']);
    same('exact in agorot, never close enough', pick([L('r1', 'repaid', 412.5), L('r2', 'repaid', 300)], 41249), null);
    same('an agora-exact sum is found', pick([L('r1', 'repaid', 412.5), L('r2', 'repaid', 300)], 71250), ['r1', 'r2']);

    // NO EXACT SET: 1,000 handed back in full, then 300 of the advance reversed - over by
    // 300, and the only line that settles it is 1,000.
    const odd = base();
    const b = give(odd, '2026-10-20', 1000, '2026-10-20T07:00:00.000Z');
    repay(odd, b, 1000, '2026-10-25', '2026-10-25T15:00:00.000Z');
    given('the partial reversal was written', Boolean(M('recordAdvanceReversed')(odd, b, 300, '2026-10-20', 'סיבה', '2026-10-26T10:00:00.000Z', 'd_owner')));
    const e = phone(odd);
    const before = e.disk();
    const plan = e.plan();
    same('no exact set: nothing fixable, the advance named as stuck', [plan.fixable.length, plan.stuck.map(one => [one.advanceId, one.overpaid])],
        [0, [[b, 300]]]);
    const page = e.advancesPage();
    same('no button on the advances page', fixButtons(page).length, 0);
    check('one sentence instead, the app\'s own', texts(page).indexOf('את העודף הזה האפליקציה לא יכולה לסדר לבד. פתח את «היסטוריה מלאה» ותקן ידנית את הרישום הכפול.') !== -1);
    const days = e.days();
    same('no button in the closing box either', [fixButtons(days).length, days.querySelectorAll('.overpaid-fix-cannot').length], [0, 1]);
    e.run('sortOverpaidAdvance("w_s")');
    await e.idle();
    same('pressed anyway (a stale screen): told, not asked, nothing written',
        [e.told, e.asked.length, e.commits, e.disk() === before], [['את העודף הזה האפליקציה לא יכולה לסדר לבד. פתח את «היסטוריה מלאה» ותקן ידנית את הרישום הכפול.'], 0, 0, true]);

    // Two over-settled advances: the box sorts both in one question and one commit.
    const two = base();
    const x = give(two, '2026-10-17', 500, '2026-10-17T07:00:00.000Z');
    const y = give(two, '2026-10-20', 700, '2026-10-20T07:00:00.000Z');
    close(two, ...CLOSED, 1200, '2026-10-30T10:00:00.000Z');
    repay(two, x, 500, '2026-11-02', '2026-11-02T15:00:00.000Z');
    repay(two, y, 700, '2026-11-03', '2026-11-03T15:00:00.000Z');
    const f = phone(two);
    freeze(f, AT_NOW);
    press(fixButtons(f.days())[0]);
    await settleUntil(() => f.asked.length === 1, 5000, 5);
    same('two advances: the many-sentence', plain(f.asked[0].message), '2 מקדמות נרשמו כמוחזרות יותר מפעם אחת, ולכן יש עודף של 1200 ₪. כדי לסדר, יבוטלו:');
    same('every repayment named', f.asked[0].names.map(plain).sort(), ['הוחזר במזומן · 02/11/2026 · 500 ₪', 'הוחזר במזומן · 03/11/2026 · 700 ₪']);
    f.answer(true);
    await f.idle();
    same('one commit, nothing over-settled', [f.commits, overpaidAll(f)], [1, []]);
}

// ================================================================== F4 the record moved
{
    suite('F4 the record moved between the question and the answer: nothing written');
    const { record } = ownersRecord();
    const d = phone(record);
    press(fixButtons(d.days())[0]);
    await settleUntil(() => d.asked.length === 1, 5000, 5);
    // Another advance lands for him while the question is open (the other phone, adopted).
    const made = d.call('recordNewAdvance', d.State.schedule, 'w_s', '2026-11-14', 300, '', '2026-11-16T08:30:00.000Z', 'd_other', 'cash');
    given('the other phone\'s advance was committed', d.State.commitMany(made) === true);
    d.commits = 0;
    const before = d.disk();
    d.answer(true);
    await d.idle();
    same('told, and nothing written', [d.told, d.commits, d.disk() === before],
        [['הרישום השתנה מאז השאלה. לא נרשם דבר. בדוק שוב.'], 0, true]);
    same('still over-settled, as it was', overpaidAll(d).map(one => one[1]), [4400]);
}

// ================================================================== F5 not synced
{
    suite('F5 not synced: refused before the question, and at the answer');
    const { record } = ownersRecord();
    const d = phone(record, { synced: false });
    const before = d.disk();
    press(fixButtons(d.days())[0]);
    await d.idle();
    same('refused before asking, in one sentence', [d.told, d.asked.length, d.commits, d.disk() === before],
        [['מסדרים מקדמה רק כשמופיע «מסונכרן בין המכשירים». לא נרשם דבר.'], 0, 0, true]);

    const e = phone(ownersRecord().record);
    const beforeE = e.disk();
    press(fixButtons(e.days())[0]);
    await settleUntil(() => e.asked.length === 1, 5000, 5);
    e.run('weeklyCloseShared = () => false;');
    e.answer(true);
    await e.idle();
    same('synced at the question, not at the answer: refused, nothing written', [e.told, e.commits, e.disk() === beforeE],
        [['מסדרים מקדמה רק כשמופיע «מסונכרן בין המכשירים». לא נרשם דבר.'], 0, true]);

    const f = phone(ownersRecord().record);
    f.run('Store.available = false;');
    f.run('sortOverpaidAdvance("w_s")');
    await f.idle();
    same('a phone that cannot keep a write: its own sentence', [f.told, f.asked.length], [['הטלפון הזה לא מצליח כרגע לשמור את הרישום. לא נרשם דבר.'], 0]);
}

// ================================================================== F6 double press
{
    suite('F6 a double press is one question and one write');
    const { record } = ownersRecord();
    const d = phone(record);
    const button = fixButtons(d.days())[0];
    press(button);
    press(button);
    await settleUntil(() => d.asked.length >= 1, 5000, 5);
    same('one question', d.asked.length, 1);
    const before = Object.keys(d.ledger()).length;
    d.answer(true);
    press(button);
    await d.idle();
    press(button);
    await d.idle();
    same('one commit, two lines', [d.commits, Object.keys(d.ledger()).length - before], [1, 2]);
    same('and no second question (nothing left to sort)', d.asked.length, 1);
    same('nothing told', d.told, []);
    // «ביטול» writes nothing.
    const e = phone(ownersRecord().record);
    const beforeE = e.disk();
    press(fixButtons(e.days())[0]);
    await settleUntil(() => e.asked.length === 1, 5000, 5);
    e.answer(false);
    await e.idle();
    same('«ביטול»: nothing written, the button still there', [e.commits, e.disk() === beforeE, fixButtons(e.days()).length], [0, true, 1]);
}

// ================================================================== F7 the gates
{
    suite('F7 the gates shut: no button, no plan, nothing written');
    const d = phone(ownersRecord().record, { flags: SHUT });
    same('both flags shut: no plan', d.plan(), { fixable: [], stuck: [] });
    same('no button on the days dialog or the advances page', [fixButtons(d.days()).length, fixButtons(d.advancesPage()).length], [0, 0]);
    const before = d.disk();
    d.run('sortOverpaidAdvance("w_s")');
    await d.idle();
    same('pressed anyway: nothing asked, nothing written', [d.asked.length, d.commits, d.disk() === before], [0, 0, true]);

    // The record nobody has approved the carry on: whether the gate opens is the model's
    // question (financialWritingEnabled), and the button follows it exactly.
    const e = phone(ownersRecord({ approved: false }).record);
    const open = e.call('financialWritingEnabled', e.State.schedule);
    const plan = e.plan();
    same('migration unapproved: the button exactly when the gate is open', [open, plan.fixable.length > 0, fixButtons(e.days()).length > 0],
        [open, open, open]);
    if (!open) same('and with it shut, nothing at all', plan, { fixable: [], stuck: [] });
}

// ================================================================== F8 prevention
{
    suite('F8 prevention: no advance-level «תיקון» on a settled advance; capped at what is left');
    // Inside the account holding today (13/11-26/11), so the days dialog's own range has it.
    const record = base();
    const full = give(record, '2026-11-13', 1000, '2026-11-13T07:00:00.000Z');
    repay(record, full, 1000, '2026-11-14', '2026-11-14T15:00:00.000Z');
    const part = give(record, '2026-11-14', 1000, '2026-11-14T08:00:00.000Z');
    repay(record, part, 600, '2026-11-15', '2026-11-15T15:00:00.000Z');
    const d = phone(record);
    const rows = () => d.days().querySelectorAll('.wday-advance');
    const rowOf = id => rows().filter(row => texts(row).indexOf('חוב פתוח 0 ₪') !== -1 === (id === full))[0];
    same('two advance rows', rows().length, 2);
    same('repaid in full: no «תיקון» on its row', buttonsSaying(rowOf(full), 'תיקון').length, 0);
    same('400 still owed: «תיקון» there', buttonsSaying(rowOf(part), 'תיקון').length, 1);
    const page = d.advancesPage();
    const cards = page.querySelectorAll('.advance-card');
    same('the advances page: «תיקון טעות» only on the card with something left',
        cards.map(card => [texts(card).indexOf('נשאר: 400 ₪') !== -1, buttonsSaying(card, 'תיקון טעות').length]).sort(),
        [[false, 0], [true, 1]]);

    // The form, opened from the row: its ceiling is what is left owed.
    const row = rowOf(part);
    press(buttonsSaying(row, 'תיקון')[0]);
    const form = row.parentNode.querySelectorAll('.advance-form')[0];
    given('the correction form opened', Boolean(form));
    same('its title and its amount say 400, not 1,000', [plain(form.querySelectorAll('.advance-form-title')[0].textContent),
        form.querySelectorAll('input')[0].value], ['תיקון-היפוך · אפשר לתקן עד 400 ₪', '400']);
    const [amount, reason] = form.querySelectorAll('input');
    const save = buttonsSaying(form, 'שמור תיקון')[0];
    amount.value = '500'; reason.value = 'נרשם בטעות';
    const before = d.disk();
    press(save);
    same('500 refused, in the form\'s own words; nothing written',
        [plain(form.querySelectorAll('.field-error')[0].textContent), d.commits, d.disk() === before],
        ['אפשר לתקן עד 400 ₪ מהמקדמה הזו.', 0, true]);
    // A repayment of the rest lands while the form is open: nothing is left to reverse.
    const landed = d.call('recordAdvanceRepaid', d.State.schedule, part, 400, '2026-11-16', '', '2026-11-16T08:00:00.000Z', 'd_other', 'cash');
    given('the other phone\'s repayment was committed', d.State.commit(landed) === true);
    d.commits = 0;
    amount.value = '400';
    const settled = d.disk();
    press(save);
    same('nothing left owed any more: refused, said plainly, nothing written',
        [plain(form.querySelectorAll('.field-error')[0].textContent), d.commits, d.disk() === settled],
        ['על המקדמה הזו לא נשאר חוב. אם נרשם החזר או ניכוי בטעות, תקן אותו ב«היסטוריה מלאה».', 0, true]);
    same('and nothing over-settled', overpaidAll(d), []);

    // A fresh phone: 400 left, reversed 400 - written, and settled exactly.
    const record2 = base();
    const c = give(record2, '2026-11-14', 1000, '2026-11-14T08:00:00.000Z');
    repay(record2, c, 600, '2026-11-15', '2026-11-15T15:00:00.000Z');
    const e = phone(record2);
    const row2 = e.days().querySelectorAll('.wday-advance')[0];
    press(buttonsSaying(row2, 'תיקון')[0]);
    const form2 = row2.parentNode.querySelectorAll('.advance-form')[0];
    const inputs = form2.querySelectorAll('input');
    inputs[0].value = '400'; inputs[1].value = 'נרשם בטעות';
    press(buttonsSaying(form2, 'שמור תיקון')[0]);
    const after = e.call('advanceOutstanding', e.State.schedule, c);
    same('400 of 400 left: written, nothing left, nothing over', [e.commits, after.left, after.overpaid], [1, 0, 0]);

    // The simple form on the advances page: the same ceiling.
    const record3 = base();
    const s = give(record3, '2026-11-14', 1000, '2026-11-14T08:00:00.000Z');
    repay(record3, s, 600, '2026-11-15', '2026-11-15T15:00:00.000Z');
    const f = phone(record3);
    const card = f.advancesPage().querySelectorAll('.advance-card')[0];
    press(buttonsSaying(card, 'תיקון טעות')[0]);
    const simple = card.parentNode.querySelectorAll('.advance-form')[0];
    const fields = simple.querySelectorAll('input');
    fields[0].value = '700'; fields[1].value = 'נרשם בטעות';
    press(buttonsSaying(simple, 'שמור תיקון')[0]);
    same('the simple form: 700 against 400 left is refused, nothing written',
        [plain(simple.querySelectorAll('.field-error')[0].textContent), f.commits], ['אפשר לתקן עד 400 ₪ מהמקדמה הזו.', 0]);

    // The repayment form already stops at what is left (confirmed, not changed).
    const g = phone((() => { const r = base(); const id = give(r, '2026-11-14', 1000, '2026-11-14T08:00:00.000Z'); repay(r, id, 600, '2026-11-15', '2026-11-15T15:00:00.000Z'); return r; })());
    const row3 = g.days().querySelectorAll('.wday-advance')[0];
    press(buttonsSaying(row3, 'החזר')[0]);
    const pay = row3.parentNode.querySelectorAll('.advance-form')[0];
    same('the repayment form opens on what is left', pay.querySelectorAll('input')[0].value, '400');
    pay.querySelectorAll('input')[0].value = '500';
    press(buttonsSaying(pay, 'שמור')[0]);
    same('and refuses more than that', [plain(pay.querySelectorAll('.field-error')[0].textContent), g.commits],
        ['אי אפשר להחזיר יותר מהחוב הפתוח - 400 ₪.', 0]);
}

// ================================================================== F9 the words
{
    suite('F9 the words, word for word (proposed; changing one is a decision)');
    const d = phone(ownersRecord().record);
    const t = T(d);
    same('the fixed sentences', [t.button, t.title, t.footer, t.ok, t.reason, t.cannot, t.notSynced, t.noDisk, t.moved, t.notWritten], [
        'לסדר את המקדמה',
        'לסדר את המקדמה?',
        'שום דבר לא נמחק: לצד כל רישום נכתב תיקון. התלוש של חשבון שכבר נסגר לא משתנה.',
        'כן, לסדר',
        'נרשם יותר מפעם אחת - סודר אוטומטית',
        'את העודף הזה האפליקציה לא יכולה לסדר לבד. פתח את «היסטוריה מלאה» ותקן ידנית את הרישום הכפול.',
        'מסדרים מקדמה רק כשמופיע «מסונכרן בין המכשירים». לא נרשם דבר.',
        'הטלפון הזה לא מצליח כרגע לשמור את הרישום. לא נרשם דבר.',
        'הרישום השתנה מאז השאלה. לא נרשם דבר. בדוק שוב.',
        'לא נשמר דבר. נסה שוב.'
    ]);
    same('the sentences with figures', [word(d, 'message', '2200', '23/10/2026', '4400'), word(d, 'messageMany', 3, '900'),
        word(d, 'item', 'הוחזר במזומן', '10/11/2026', '2200')], [
        'המקדמה של 2200 ₪ מ-23/10/2026 נרשמה כמוחזרת יותר מפעם אחת, ולכן יש עודף של 4400 ₪. כדי לסדר, יבוטלו:',
        '3 מקדמות נרשמו כמוחזרות יותר מפעם אחת, ולכן יש עודף של 900 ₪. כדי לסדר, יבוטלו:',
        'הוחזר במזומן · 10/11/2026 · 2200 ₪'
    ]);
    same('the correction form\'s new refusal', d.run('REVERSAL_NOTHING_LEFT'),
        'על המקדמה הזו לא נשאר חוב. אם נרשם החזר או ניכוי בטעות, תקן אותו ב«היסטוריה מלאה».');
    same('every key of the block is pinned above', Object.keys(t).sort(),
        ['button', 'cannot', 'footer', 'item', 'message', 'messageMany', 'moved', 'noDisk', 'notSynced', 'notWritten', 'ok', 'reason', 'title'].sort());
}

report();
