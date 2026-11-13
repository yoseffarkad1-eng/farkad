// «מי חייב כסף», «שים לב» and «סגירות שנרשמו» - the readings of the money record, on devices.
//
//   node tests/owes.test.mjs
//
// js/ui/owes.js shows who owes money, since when, what has and has not come off it, and
// every close already written. It is the sixth surface to show a man's debt, and the first
// whose whole purpose is to say that two of the others DISAGREE: a period nobody closed is
// read by the pay sheet, from the next period on, as though the full deduction had come
// off that wage, while the ledger - which only a close writes to - goes on showing the
// debt. So what this suite holds is:
//
//   1. THE ROOT CAUSE, PINNED. 2,000 handed over, the fortnight left open, the man keeps
//      working: the board says 2,000 (the ledger), the next sheet opens on 0 (the walk),
//      and the board names the period that was left open and what the sheet presumed
//      there. Then the period is closed by hand, and every figure moves with the ledger.
//   2. EVERY FIGURE IS ITS SOURCE FUNCTION'S ANSWER. On the fixtures and on seeded records
//      - both pay cycles, closes in order with whole, part and no deduction, repayments,
//      men who stopped coming - the amount is openAdvanceBalance (and the figure of the
//      list under it on the same page), the dates are the ledger's, each unclosed period is
//      one frozenPeriodFor does not know and payrollReport has a row for, and what the
//      sheet presumed is advanceAccount's own `deducted`.
//   3. THE GATE. With the carry shut, and with it open on a record nobody approved, the
//      board is the sum handed over under «מקדמות רשומות» and nothing of the new
//      arithmetic: no age, no period, no warning, no closures (tests/approval.test.mjs).
//      The predicate is asked at most once per reading and put back, throw or no throw.
//   4. THE CLOSURES. Grouped by the moment and the phone that wrote them; each account's
//      three figures are the closed period's own (advanceAccount, closedPeriods); the text
//      line for line.
//   5. IT WRITES NOTHING. Every key on the disk byte for byte across drawing all of it,
//      with a recorder that is then shown to notice a real write.
//   5b. WHAT IT COSTS (repaired before it was served). The gate's question re-plans the
//      migration, and for a man with a debt and no daily rate the plan walks four thousand
//      fortnights. So the questions are COUNTED: none on a record that carries the
//      approval, one on a record nobody approved, each reader once per reading, nothing
//      at all on a draw of a record that did not move - and after any write, by any door,
//      the figures drawn are the figures of the record as it is now.
//   6. THE WORDS. Each new string word for word; each borrowed one found where its owner
//      keeps it.

import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeDevice } from './harness.mjs';
import { makeDom } from './moneydom.mjs';
import { suite, check, same, given, report } from './runner.mjs';

process.env.TZ = 'Asia/Jerusalem';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = file => readFileSync(join(ROOT, file), 'utf8');
const OWES = source('js/ui/owes.js');

const SHUT = { carryAdvances: false, ledgerWrites: false };
const OPEN = { carryAdvances: true, ledgerWrites: true };

const addDays = (date, days) => {
    const [y, m, d] = date.split('-').map(Number);
    const at = new Date(y, m - 1, d + days, 12);
    return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`;
};
// The fortnights from the account's anchor, and the weeks inside them.
const P = [0, 1, 2, 3, 4, 5].map(n => [addDays('2026-08-07', 14 * n), addDays('2026-08-07', 14 * n + 13)]);
const W = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(n => [addDays('2026-08-07', 7 * n), addDays('2026-08-07', 7 * n + 6)]);
// Five working days of a week that opens on a Friday: Friday, then Sunday to Wednesday.
const FIVE = start => [0, 2, 3, 4, 5].map(n => addDays(start, n));
// A Tuesday in the fourth fortnight: three fortnights, or six weeks, have ended.
const TODAY = '2026-09-22';
const RATE = 610;

// The bidi marks the app pins a name and a range with, taken off so words are words.
const plain = text => String(text).replace(/[⁦-⁩‎‏]/g, '');

// ---------------------------------------------------------------- a phone
//
// The record is written by the app's own writers on one device and REOPENED on another,
// which is what mirrors the advances into the ledger - the state a phone is in every
// morning. js/ui/reports.js and js/ui/owes.js run in the device's own context over a DOM
// that can be read back.
function phone(build, options = {}) {
    const flags = options.flags || OPEN;
    const first = makeDevice({ deviceId: 'd_office', flags });
    const schedule = first.State.schedule;
    schedule.places = [{ id: 'p_x', name: 'חיפה', active: true }];
    schedule.workers = [];
    build({
        man(id, name, extra = {}) {
            schedule.workers.push(Object.assign({ id, name, active: true, dailyRate: RATE, hourlyRate: 0 }, extra));
        },
        work(id, dates) { dates.forEach(date => first.call('assignPlace', schedule, date, id, 'actual', 'p_x')); },
        give(id, date, amount) { first.call('addAdvance', schedule, id, date, amount, ''); }
    });
    first.State.save({ silent: true });

    const device = makeDevice({ deviceId: 'd_office', storage: first.dump(), flags });
    const dom = makeDom();
    ['reportsView', 'advancesView'].forEach(id => dom.register(id));
    const make = dom.createElement;
    dom.createElement = tag => { const node = make(tag); node.dataset = {}; return node; };
    device.ctx.document = dom;
    device.dom = dom;
    device.run = code => vm.runInContext(code, device.ctx, { filename: 'harness:owes' });
    device.run(source('js/ui/sitecolor.js'));
    device.run(source('js/ui/reports.js'));
    device.run(OWES);
    device.views = [];
    device.run('var currentView = "advances";');
    device.ctx.showView = view => { device.views.push(view); device.run(`currentView = ${JSON.stringify(view)}`); };
    device.ctx.askTell = () => Promise.resolve();
    device.ctx.askConfirm = () => Promise.resolve(true);
    device.setToday(options.today || TODAY);
    device.State.load();
    // A person has read the migration's rows and approved them - except where a test is
    // about the phone nobody has pressed the button on.
    if (flags.carryAdvances && options.approve !== false) {
        const plan = device.call('planCarryMigration', device.State.schedule);
        if (plan.needed && !device.call('carryMigrationApproved', device.State.schedule, plan)) {
            device.State.commit(device.call('recordCarryApproval', device.State.schedule, plan, '2026-09-01T09:00:00.000Z', 'd_person'));
        }
    }
    // Closing, the way the app's own button writes it: through saveFinancialAction, which
    // records the approval with the first financial action. `list` is
    // [workerId, from, to, deduction] per account, all at one moment by one phone.
    device.run(`function testClose(list, at, by) {
        return saveFinancialAction(() => list.reduce((all, one) => all.concat(
            closePeriodChanges(State.schedule, one[0], one[1], one[2], at, by, one[3])), []));
    }`);
    device.close = (list, at, by) => device.run(
        `testClose(${JSON.stringify(list)}, ${JSON.stringify(at)}, ${by ? JSON.stringify(by) : 'syncDeviceId()'})`);
    device.read = () => JSON.parse(device.run('JSON.stringify(owesRead(State.schedule, todayStr()))'));
    device.warnings = () => JSON.parse(device.run(
        'JSON.stringify(owesWarnings(owesRead(State.schedule, todayStr())).map(w => Object.assign({ kind: w.kind, workerId: w.row.workerId, span: w.span || null }, owesWarningWords(w, todayStr()))))'));
    device.closures = () => JSON.parse(device.run('JSON.stringify(owesClosures(State.schedule))'));
    device.advanceOf = id => device.call('advancesFor', device.State.schedule, id, '0000-01-01', '9999-12-31');
    device.draw = () => { device.run('renderAdvances()'); return dom.getElementById('advancesView'); };
    device.texts = (root, cls) => root.querySelectorAll(`.${cls}`).map(node => plain(node.textContent));
    return device;
}

// ---------------------------------------------------------------- the instrument
//
// Every figure of a reading, asked again of the function it is read from - in this file's
// own words, with its own walk over the man's periods. Returns the mismatches.
// The gate is asked of the real function ONCE for the whole comparison and its answer
// repeated - the question re-plans the migration, which walks every account of every man,
// and this instrument asks it per man. The record does not change inside one comparison.
function againstSources(device) {
    const real = device.ctx.carryReportingEnabled;
    let answer;
    device.ctx.carryReportingEnabled = schedule => {
        if (schedule !== device.State.schedule) return real(schedule);
        if (answer === undefined) answer = real(schedule);
        return answer;
    };
    try {
        return compareWithSources(device);
    } finally {
        device.ctx.carryReportingEnabled = real;
    }
}

function compareWithSources(device) {
    const wrong = [];
    const schedule = device.State.schedule;
    const today = device.run('todayStr()');
    const read = device.read();
    const call = (name, ...args) => device.call(name, ...args);
    const folded = call('carryReportingEnabled', schedule) === true;
    if (read.folded !== folded) wrong.push(`folded ${read.folded} !== ${folded}`);

    let total = 0;
    schedule.workers.forEach(worker => {
        const open = call('openAdvanceBalance', schedule, worker.id);
        const owes = Boolean(open) && open.total > 0;
        const row = read.rows.filter(one => one.workerId === worker.id)[0];
        if (owes !== Boolean(row)) { wrong.push(`${worker.id}: on the board ${Boolean(row)}, owes ${owes}`); return; }
        if (!row) return;
        total += open.total;
        if (row.amount !== open.total) wrong.push(`${worker.id}: amount ${row.amount} !== openAdvanceBalance ${open.total}`);
        if (!folded) {
            if (Object.keys(row).join() !== 'workerId,name,active,amount') wrong.push(`${worker.id}: an unapproved row says ${Object.keys(row)}`);
            return;
        }
        const listed = device.run(`workerAdvanceSummary(${JSON.stringify(worker.id)}).left`);
        if (row.amount !== listed) wrong.push(`${worker.id}: amount ${row.amount} !== the list's ${listed}`);

        const items = call('advancesFor', schedule, worker.id, '0000-01-01', '9999-12-31');
        const stillOpen = items.filter(item => call('advanceOutstanding', schedule, item.id).left > 0)
            .map(item => item.date).sort();
        if (row.since !== (stillOpen[0] || null)) wrong.push(`${worker.id}: since ${row.since} !== ${stillOpen[0]}`);

        const ids = items.map(item => String(item.id));
        const moves = call('ledgerEntries', schedule).filter(entry =>
            ids.indexOf(String(entry.advanceId)) !== -1 && Number(entry.amount) > 0);
        const last = kind => moves.filter(entry => entry.kind === kind).map(entry => entry.date).sort().pop() || null;
        if (row.lastDeducted !== last('deducted')) wrong.push(`${worker.id}: lastDeducted ${row.lastDeducted} !== ${last('deducted')}`);
        if (row.lastRepaid !== last('repaid')) wrong.push(`${worker.id}: lastRepaid ${row.lastRepaid} !== ${last('repaid')}`);

        // His ended periods from the oldest open advance on, walked here a day at a time.
        const ended = [];
        for (let date = row.since; date < today; ) {
            const period = call('periodRangeFor', worker, date);
            if (period.to >= today) break;
            ended.push(period);
            date = addDays(period.to, 1);
        }
        const moved = period => moves.some(entry => (entry.kind === 'deducted' || entry.kind === 'repaid')
            && entry.date >= period.from && entry.date <= period.to);
        let quiet = 0;
        for (let at = ended.length - 1; at >= 0 && !moved(ended[at]); at -= 1) quiet += 1;
        if (row.quiet !== quiet) wrong.push(`${worker.id}: quiet ${row.quiet} !== ${quiet}`);

        const unclosed = ended.filter(period => {
            const closed = call('frozenPeriodFor', schedule, worker.id, period.from, period.to) !== undefined;
            const line = call('payrollReport', schedule, period.from, period.to)
                .filter(one => String(one.workerId) === String(worker.id))[0];
            const recorded = Boolean(line) && (line.attendanceDays > 0 || line.absent > 0 || Number(line.advances) > 0);
            return recorded && !closed;
        }).map(period => `${period.from}..${period.to}`);
        const said = row.unclosed.map(period => `${period.from}..${period.to}`);
        if (said.join() !== unclosed.join()) wrong.push(`${worker.id}: unclosed ${said} !== ${unclosed}`);
        const presumed = row.unclosed.length
            ? call('advanceAccount', schedule, worker.id, row.unclosed[0].from, row.unclosed[0].to).deducted : 0;
        if (row.presumed !== presumed) wrong.push(`${worker.id}: presumed ${row.presumed} !== advanceAccount ${presumed}`);

        const now = call('periodRangeFor', worker, today);
        if (row.period.from !== now.from || row.period.to !== now.to || row.cycle !== now.cycle) wrong.push(`${worker.id}: period`);
        const days = call('workerDaysReport', schedule, worker, '0000-01-01', today)
            .filter(day => !day.absent && day.entries.length > 0).map(day => day.date);
        const lastWork = days[days.length - 1] || null;
        const idle = !(lastWork && lastWork >= now.from) && !(lastWork && lastWork >= addDays(today, -6));
        if (row.idle !== idle) wrong.push(`${worker.id}: idle ${row.idle} !== ${idle}`);
        if (row.idle && row.lastWork !== lastWork) wrong.push(`${worker.id}: lastWork ${row.lastWork} !== ${lastWork}`);
        if (row.active !== (worker.active !== false)) wrong.push(`${worker.id}: active`);
    });
    if (read.total !== Math.round(total * 100) / 100) wrong.push(`total ${read.total} !== ${total}`);
    read.rows.forEach((row, at) => {
        if (at > 0 && read.rows[at - 1].amount < row.amount) wrong.push(`order: ${read.rows[at - 1].amount} before ${row.amount}`);
    });
    return wrong;
}
const holds = (name, device) => {
    const wrong = againstSources(device);
    check(name, wrong.length === 0, wrong.slice(0, 3).join(' | '));
};

// ---------------------------------------------------------------- 1. the root cause
{
    suite('2,000 handed over, the fortnight left open: the board says the ledger, and names the period');

    const device = phone(make => {
        make.man('w_d', 'דוד כהן');
        make.work('w_d', FIVE(P[0][0]).concat(FIVE(P[1][0]), FIVE(P[2][0]), ['2026-09-20', '2026-09-21']));
        make.give('w_d', '2026-08-10', 2000);
    });
    const schedule = device.State.schedule;
    given('the record may be read the new way', device.call('carryReportingEnabled', schedule) === true);

    // THE TWO READINGS, side by side - the thing the board exists to show.
    const sheet = fortnight => device.call('advanceAccount', schedule, 'w_d', ...fortnight);
    same('the pay sheet of the first fortnight presumes the whole 2,000 came off the wage', sheet(P[0]).deducted, 2000);
    same('so the next sheet opens on nothing', device.call('advanceCarryInto', schedule, 'w_d', P[1][0]), 0);
    same('and so does the sheet of the fortnight today is in', device.call('advanceCarryInto', schedule, 'w_d', P[3][0]), 0);
    same('and deducts nothing', sheet(P[3]).deducted, 0);
    same('while the ledger - which only a close writes to - still holds the debt',
        device.call('openAdvanceBalance', schedule, 'w_d').total, 2000);

    const read = device.read();
    const row = read.rows[0];
    same('THE BOARD SAYS THE LEDGER: 2,000', row.amount, 2000);
    same('one man owes, and he needs attention', [read.rows.length, read.total, read.attention], [1, 2000, 1]);
    same('it names every fortnight that ended with a record and no close, oldest first',
        row.unclosed.map(period => [period.from, period.to]), [P[0], P[1], P[2]]);
    same('and what the sheet presumed in the oldest of them', row.presumed, 2000);
    same('since the day of the advance', row.since, '2026-08-10');
    same('no deduction and no repayment on the record', [row.lastDeducted, row.lastRepaid], [null, null]);
    same('three of his fortnights have ended with nothing taken', row.quiet, 3);
    same('he is working', [row.idle, row.active], [false, true]);
    holds('and every figure of it is its source function\'s answer', device);

    const warnings = device.warnings();
    same('two warnings: the unclosed account first, then the debt nothing came off',
        warnings.map(warning => warning.kind), ['unclosed', 'quiet']);
    same('the unclosed account, in words', [plain(warnings[0].title)].concat(warnings[0].lines), [
        'חשבון קודם לא נסגר: 07/08 - 20/08 · דוד כהן',
        'הדוח הניח שנוכו 2000 ₪ בתקופה הזאת, אבל הניכוי לא נרשם במקדמות.',
        'במקדמות רשום חוב של 2000 ₪.',
        'ועוד 2 חשבונות שלא נסגרו אחריו. סוגרים מהישן לחדש.'
    ]);
    same('it points at the oldest one', warnings[0].span, { from: P[0][0], to: P[0][1], cycle: 'biweekly' });
    same('the quiet debt, in words', [plain(warnings[1].title)].concat(warnings[1].lines), [
        '3 תקופות בלי ניכוי: דוד כהן · 2000 ₪',
        'המקדמה מ-10/08. מאז לא נוכה ולא הוחזר כלום.'
    ]);

    // Drawn: the board on top of the page, over the list it was always.
    const page = device.draw();
    same('the page: its heading, the board, then what was always there',
        page.children.slice(0, 2).map(node => node.className || node.tagName), ['H2', 'owes']);
    same('the total', device.texts(page, 'owes-total-amount'), ['2000 ₪']);
    same('its label and its count', device.texts(page, 'owes-total-label').concat(device.texts(page, 'owes-total-count')),
        ['חוב פתוח של העובדים', 'עובד אחד חייב · אחד דורש טיפול']);
    same('his row: name, amount, the line, the flags',
        [device.texts(page, 'owes-name'), device.texts(page, 'owes-amount'), device.texts(page, 'owes-line'), device.texts(page, 'owes-flag')],
        [['דוד כהן'], ['2000 ₪'], ['דו־שבועי · מאז 10/08 · הניכוי האחרון: אין'], ['3 תקופות בלי ניכוי', 'חשבון קודם לא נסגר']]);
    same('the board\'s figure is the figure of the list under it',
        device.texts(page, 'advance-worker-card').map(text => text.replace('דוד כהן', '')), ['2000 ₪ נשארו']);
    same('the warnings stand open on this page', page.querySelectorAll('.owes-warnings').map(node => node.open), [true]);
    same('with the one button, worded by the pay sheet\'s own constant and the period\'s dates',
        device.texts(page, 'owes-show'), ['הצג את החשבון 07/08 - 20/08']);
    same('no closure is on the record, so no way into the closures is drawn', page.querySelectorAll('.owes-closures-entry').length, 0);

    // THE BUTTON ONLY NAVIGATES.
    const before = JSON.stringify(device.dump());
    device.run(`owesShowAccount('w_d', { from: '${P[0][0]}', to: '${P[0][1]}' })`);
    same('it goes to the pay sheet', device.views.slice(-1), ['reports']);
    same('pointed at that period, narrowed to that man, on «לפי עובד»',
        JSON.parse(device.run('JSON.stringify([REPORT_RANGE.from, REPORT_RANGE.to, [...REPORT_WORKERS], REPORT_SECTION, REPORT_PRESET])')),
        [P[0][0], P[0][1], ['w_d'], 'workers', 'custom']);
    same('where his row is the open account the warning spoke of',
        JSON.parse(device.run('JSON.stringify(payrollRows().map(row => [row.workerId, row.carry && row.carry.closed, row.carry && row.carry.deducted]))')),
        [['w_d', false, 2000]]);
    check('and the disk is what it was', JSON.stringify(device.dump()) === before);

    // On «דוחות»: the same findings, shut, for the men the report shows.
    device.run('REPORT_WORKERS = null; REPORT_RANGE.from = null; REPORT_PRESET = "fortnight"; renderReports()');
    const reports = device.dom.getElementById('reportsView');
    same('at the head of «דוחות» the warnings are one row, shut', reports.querySelectorAll('.owes-warnings').map(node => node.open), [false]);
    same('the same two', device.texts(reports, 'owes-warning-title'), warnings.map(warning => plain(warning.title)));
    same('and they are outside the section the paper and the picture read',
        reports.querySelectorAll('.report').reduce((count, section) => count + section.querySelectorAll('.owes-warnings').length, 0), 0);
    device.run('REPORT_SECTION = "sites"; renderReports()');
    same('on «לפי אתר» there are none', reports.querySelectorAll('.owes-warnings').length, 0);
    device.run('REPORT_SECTION = "workers"; REPORT_WORKERS = new Set(["w_nobody"]); renderReports()');
    same('nor when the report is narrowed to other men', reports.querySelectorAll('.owes-warnings').length, 0);
    device.run('REPORT_WORKERS = null; showView("advances")');

    // CLOSED BY HAND, with part of it: the ledger moves, and the board with it.
    given('the first fortnight closes with 1,000', device.close([['w_d', P[0][0], P[0][1], 1000]], '2026-09-22T15:00:00.000Z') === true);
    const after = device.read().rows[0];
    same('the board follows the ledger: 1,000', after.amount, 1000);
    same('the deduction is dated on the period\'s last day', after.lastDeducted, P[0][1]);
    same('two fortnights are still open', after.unclosed.map(period => period.from), [P[1][0], P[2][0]]);
    same('and now the sheet presumes the remaining 1,000 came off the second', after.presumed, 1000);
    same('two fortnights with nothing taken since', after.quiet, 2);
    same('said from the last movement', device.warnings()[1].lines, ['התנועה האחרונה: 20/08. מאז לא נוכה ולא הוחזר כלום.']);
    same('the row\'s line', device.texts(device.draw(), 'owes-line'), ['דו־שבועי · מאז 10/08 · נוכה לאחרונה 20/08']);
    holds('every figure again its source\'s', device);
    same('a closure is on the record now, so the way in is drawn', device.texts(device.draw(), 'owes-closures-entry'), ['סגירות שנרשמו']);
}

// ---------------------------------------------------------------- 2. the weekly man
{
    suite('a man paid by the week: his periods are weeks, and are counted in weeks');

    const device = phone(make => {
        make.man('w_s', 'סאמר ח\'ורי', { payCycles: '2026-08-07=weekly' });
        make.work('w_s', W.slice(0, 6).reduce((all, week) => all.concat(FIVE(week[0])), []).concat(['2026-09-20', '2026-09-21']));
        make.give('w_s', '2026-08-10', 2000);
    });
    const row = device.read().rows[0];
    same('his cycle and the week today is in', [row.cycle, row.period], ['weekly', { from: W[6][0], to: W[6][1] }]);
    same('six weeks ended open, each named', row.unclosed.map(period => [period.from, period.to]), W.slice(0, 6));
    same('six weeks with nothing taken', row.quiet, 6);
    same('the sheet presumed the 2,000 in the first week', row.presumed, 2000);
    holds('every figure its source\'s', device);
    const words = device.warnings();
    same('said in weeks', [plain(words[0].title), words[0].lines[0], words[0].lines[2], plain(words[1].title)], [
        'חשבון קודם לא נסגר: 07/08 - 13/08 · סאמר ח\'ורי',
        'הדוח הניח שנוכו 2000 ₪ בשבוע הזה, אבל הניכוי לא נרשם במקדמות.',
        'ועוד 5 חשבונות שלא נסגרו אחריו. סוגרים מהישן לחדש.',
        '6 שבועות בלי ניכוי: סאמר ח\'ורי · 2000 ₪'
    ]);
    const page = device.draw();
    same('and on his row', [device.texts(page, 'owes-line'), device.texts(page, 'owes-flag')],
        [['שבועי · מאז 10/08 · הניכוי האחרון: אין'], ['6 שבועות בלי ניכוי', 'חשבון קודם לא נסגר']]);
    same('his row carries his pay group, the key of its colour', page.querySelectorAll('.owes-row').map(node => node.dataset.cycle), ['weekly']);
}

// ---------------------------------------------------------------- 3. closed with nothing, week after week
{
    suite('closed three times with no deduction: every period is closed, and the count still runs');

    const device = phone(make => {
        make.man('w_d', 'דוד כהן');
        make.work('w_d', FIVE(P[0][0]).concat(FIVE(P[1][0]), FIVE(P[2][0]), ['2026-09-20', '2026-09-21']));
        make.give('w_d', '2026-08-10', 2000);
    });
    [0, 1, 2].forEach(n => given(`fortnight ${n + 1} closes with 0`,
        device.close([['w_d', P[n][0], P[n][1], 0]], `2026-09-${String(10 + n)}T15:00:00.000Z`) === true));
    const row = device.read().rows[0];
    same('the debt is whole', row.amount, 2000);
    same('nothing is left unclosed', [row.unclosed, row.presumed], [[], 0]);
    same('a close with nothing taken is not a deduction: three periods', [row.quiet, row.lastDeducted], [3, null]);
    same('one warning, the quiet debt', device.warnings().map(warning => warning.kind), ['quiet']);
    same('the sheet agrees with the ledger here - the debt was carried by records',
        device.call('advanceCarryInto', device.State.schedule, 'w_d', P[3][0]), 2000);
    holds('every figure its source\'s', device);
}

// ---------------------------------------------------------------- 4. part deductions, week after week
{
    suite('500 off every week: the board follows each close, and has nothing to warn of');

    const device = phone(make => {
        make.man('w_s', 'סאמר ח\'ורי', { payCycles: '2026-08-07=weekly' });
        make.work('w_s', W.slice(0, 6).reduce((all, week) => all.concat(FIVE(week[0])), []).concat(['2026-09-20', '2026-09-21']));
        make.give('w_s', '2026-08-10', 4000);
    });
    const seen = [];
    W.slice(0, 6).forEach((week, n) => {
        given(`week ${n + 1} closes with 500`, device.close([['w_s', week[0], week[1], 500]], `2026-09-22T1${n}:00:00.000Z`) === true);
        const row = device.read().rows[0];
        seen.push([row.amount, row.lastDeducted, row.unclosed.length]);
        const wrong = againstSources(device);
        given(`after week ${n + 1} every figure is its source's`, wrong.length === 0, wrong.join(' | '));
    });
    same('the amount, the last deduction and the weeks still open, after each close', seen, [
        [3500, W[0][1], 5], [3000, W[1][1], 4], [2500, W[2][1], 3], [2000, W[3][1], 2], [1500, W[4][1], 1], [1000, W[5][1], 0]
    ]);
    const read = device.read();
    same('at the end: 1,000 owed, no period quiet, nobody needing attention', [read.rows[0].amount, read.rows[0].quiet, read.attention], [1000, 0, 0]);
    same('no warning', device.warnings(), []);
    const page = device.draw();
    same('the count line says one man owes and no more', device.texts(page, 'owes-total-count'), ['עובד אחד חייב']);
    same('no flag on his row, and no «שים לב»', [page.querySelectorAll('.owes-flag').length, page.querySelectorAll('.owes-warnings').length], [0, 0]);
}

// ---------------------------------------------------------------- 5. the man who stopped coming
{
    suite('3,000 handed over, one day worked, never again');

    const device = phone(make => {
        make.man('w_j', 'ג\'מאל בשארה');
        make.work('w_j', [P[0][0]]);
        make.give('w_j', '2026-08-10', 3000);
    });
    const row = device.read().rows[0];
    same('the ledger\'s 3,000 - not the 2,390 the sheet carries after presuming one day\'s wage', row.amount, 3000);
    same('the sheet\'s reading, for the record', device.call('advanceCarryInto', device.State.schedule, 'w_j', P[3][0]), 2390);
    same('he is not working, and his last day is said', [row.idle, row.lastWork], [true, P[0][0]]);
    same('the one fortnight with a record is open; the empty ones are not accounts', row.unclosed.map(period => period.from), [P[0][0]]);
    same('where the sheet presumed his one day\'s wage', row.presumed, RATE);
    same('three warnings', device.warnings().map(warning => warning.kind), ['unclosed', 'quiet', 'idle']);
    same('the third in words', [plain(device.warnings()[2].title)].concat(device.warnings()[2].lines),
        ['יש חוב ואין ימי עבודה בתקופה: ג\'מאל בשארה · 3000 ₪', 'יום העבודה האחרון שלו: 07/08.']);
    same('his flags', device.texts(device.draw(), 'owes-flag'), ['3 תקופות בלי ניכוי', 'חשבון קודם לא נסגר', 'לא עבד בתקופה']);
    holds('every figure its source\'s', device);

    // Put away with the debt on him.
    device.State.schedule.workers[0].active = false;
    const off = device.read().rows[0];
    same('switched off, he is still on the board with the whole debt', [off.active, off.amount], [false, 3000]);
    same('said so', [plain(device.warnings()[2].title), device.texts(device.draw(), 'owes-flag')],
        ['יש חוב והעובד כבוי: ג\'מאל בשארה · 3000 ₪', ['3 תקופות בלי ניכוי', 'חשבון קודם לא נסגר', 'כבוי']]);
    holds('every figure its source\'s', device);

    // A man with a debt and no day at all.
    const never = phone(make => { make.man('w_n', 'נועם פרץ'); make.give('w_n', '2026-08-10', 700); });
    same('a man who never worked: said so', never.warnings().filter(warning => warning.kind === 'idle')[0].lines, ['אין לו ימי עבודה רשומים.']);

    // And the first morning of a week is not "stopped working".
    const monday = phone(make => {
        make.man('w_s', 'סאמר ח\'ורי', { payCycles: '2026-08-07=weekly' });
        make.work('w_s', FIVE(W[5][0]));
        make.give('w_s', '2026-09-14', 300);
    }, { today: W[6][0] });
    const fresh = monday.read().rows[0];
    same('on the Friday a week opens, a man who worked on Wednesday is not flagged', [fresh.idle, fresh.period.from], [false, W[6][0]]);
    holds('every figure its source\'s', monday);
}

// ---------------------------------------------------------------- 6. credit and overpayment
{
    suite('money handed back beyond what was owed: the board nets it as the ledger does');

    const build = make => {
        make.man('w_a', 'אחמד זועבי');
        make.man('w_b', 'וליד מנסור');
        make.work('w_a', ['2026-09-20', '2026-09-21']);
        make.work('w_b', ['2026-09-20', '2026-09-21']);
        make.give('w_a', '2026-09-08', 500);
        make.give('w_a', '2026-09-10', 1000);
        make.give('w_b', '2026-09-08', 500);
    };
    const twice = device => {
        // The same 500 handed back, recorded on two phones: both entries are real.
        const first = device.advanceOf('w_a')[0].id;
        ['d_office', 'd_site'].forEach(by => device.State.commit(device.call('recordAdvanceRepaid', device.State.schedule,
            first, 500, '2026-09-12', '', `2026-09-12T10:00:00.000Z`, by, 'cash')));
        const other = device.advanceOf('w_b')[0].id;
        ['d_office', 'd_site'].forEach(by => device.State.commit(device.call('recordAdvanceRepaid', device.State.schedule,
            other, 400, '2026-09-12', '', `2026-09-12T10:00:00.000Z`, by, 'cash')));
    };
    const device = phone(build);
    twice(device);
    given('the record is still read the new way', device.call('carryReportingEnabled', device.State.schedule) === true);
    const read = device.read();
    same('the man in credit and owing nothing is not on the board', read.rows.map(row => row.workerId), ['w_a']);
    same('the other owes his second advance less his credit: 500, and asks to be looked at', [read.rows[0].amount, read.rows[0].review], [500, true]);
    same('the same netting as the list under it', device.run('workerAdvanceSummary("w_a").left'), 500);
    same('his flags: the fortnight his advances were taken in ended open, and the account asks to be looked at',
        device.texts(device.draw(), 'owes-flag'), ['חשבון קודם לא נסגר', 'דורש בדיקה']);
    holds('every figure its source\'s', device);

    const other = phone(build, { flags: Object.assign({ overpaymentCredit: false }, OPEN) });
    twice(other);
    same('under the other ruling - no credit - the same record owes the whole 1,000', other.read().rows.map(row => [row.workerId, row.amount]), [['w_a', 1000]]);
    holds('and every figure is still its source\'s', other);
}

// ---------------------------------------------------------------- 7. the gate
{
    suite('before anybody approved: the sum handed over, and nothing of the new arithmetic');

    const build = make => {
        make.man('w_d', 'דוד כהן');
        make.work('w_d', FIVE(P[0][0]).concat(FIVE(P[1][0]), FIVE(P[2][0]), ['2026-09-20', '2026-09-21']));
        make.give('w_d', '2026-08-10', 2000);
    };
    const shut = phone(build, { flags: SHUT });
    const read = shut.read();
    same('the carry shut: not folded', read.folded, false);
    same('the row is a name and the sum handed over, and has no other field', read.rows,
        [{ workerId: 'w_d', name: 'דוד כהן', active: true, amount: 2000 }]);
    same('nobody is flagged and nothing is warned', [read.attention, shut.warnings()], [0, []]);
    holds('the amount is openAdvanceBalance\'s', shut);
    const page = shut.draw();
    same('the total stands under the crew screen\'s words for a recorded advance', shut.texts(page, 'owes-total-label'), ['מקדמות רשומות']);
    same('with the sentence the advances page already says', shut.texts(page, 'owes-legacy'),
        ['לפני רישום החזרים או קיזוז צריך לבדוק את יתרות המקדמות הקיימות.']);
    same('no line, no flag, no warning, no closures', ['owes-line', 'owes-flag', 'owes-warnings', 'owes-closures-entry']
        .map(cls => page.querySelectorAll(`.${cls}`).length), [0, 0, 0, 0]);
    shut.run('renderReports()');
    same('and nothing at the head of «דוחות»', shut.dom.getElementById('reportsView').querySelectorAll('.owes-warnings').length, 0);
    shut.run('OWES_PAGE = "closures"');
    same('a closures page asked for is not drawn: the list is', [shut.draw().querySelectorAll('.owes-closures').length, shut.run('OWES_PAGE')], [0, null]);

    // Open, on a record whose migration is NEEDED and unapproved: the approval suite's
    // acceptance example - 3,050 earned, 5,000 handed over - and 1,000 of it handed back
    // on another phone.
    const waiting = phone(make => {
        make.man('w_d', 'דוד כהן');
        make.work('w_d', ['2026-08-10', '2026-08-11', '2026-08-12', '2026-08-13', '2026-08-14']);
        make.give('w_d', '2026-08-10', 5000);
    }, { approve: false });
    const schedule = waiting.State.schedule;
    waiting.State.commit(waiting.call('recordAdvanceRepaid', schedule, waiting.advanceOf('w_d')[0].id, 1000,
        '2026-08-12', '', '2026-08-12T10:00:00.000Z', 'd_site', 'cash'));
    const plan = waiting.call('planCarryMigration', schedule);
    given('the migration is needed and nobody approved it', plan.needed === true
        && waiting.call('carryReportingEnabled', schedule) === false);
    same('unapproved: the board says what was handed over, 5,000, and nothing else',
        waiting.read(), { folded: false, today: TODAY, rows: [{ workerId: 'w_d', name: 'דוד כהן', active: true, amount: 5000 }], total: 5000, attention: 0 });
    holds('which is openAdvanceBalance\'s answer there', waiting);
    waiting.State.commit(waiting.call('recordCarryApproval', schedule, plan, '2026-09-01T09:00:00.000Z', 'd_person'));
    given('approved', waiting.call('carryReportingEnabled', schedule) === true);
    const approved = waiting.read();
    same('approved: the fold - 4,000 - and the rest of the reading with it', [approved.folded, approved.rows[0].amount, approved.rows[0].lastRepaid, approved.rows[0].unclosed.length > 0],
        [true, 4000, '2026-08-12', true]);
    holds('every figure its source\'s', waiting);

    // THE GATE'S QUESTION IS COUNTED, because it is not a lookup: it re-plans the migration.
    // MOVED ON PURPOSE (the cost, repaired before v195 was served): this said "one reading
    // asks the gate once". On a record that CARRIES the approval the answer is true whatever
    // the plan says (owesGateAnswer, js/ui/owes.js), so the gate's function - and the plan
    // behind it - is now not asked at all; on a record nobody approved it is asked once.
    const questions = (device, code) => device.run(`(function () {
        const real = carryReportingEnabled; const plan = planAdvanceCarry; let asked = 0; let planned = 0;
        carryReportingEnabled = schedule => { asked += 1; return real(schedule); };
        planAdvanceCarry = schedule => { planned += 1; return plan(schedule); };
        try { ${code}; return [asked, planned, carryReportingEnabled !== real]; }
        finally { carryReportingEnabled = real; planAdvanceCarry = plan; }
    })()`);
    same('approved: one reading asks the gate\'s function not at all, and plans nothing', questions(waiting, 'owesRead(State.schedule, todayStr())').slice(0, 2), [0, 0]);
    const unasked = phone(make => {
        make.man('w_d', 'דוד כהן');
        make.work('w_d', ['2026-08-10', '2026-08-11', '2026-08-12', '2026-08-13', '2026-08-14']);
        make.give('w_d', '2026-08-10', 5000);
    }, { approve: false });
    given('a record whose migration is needed and unapproved', unasked.call('carryReportingEnabled', unasked.State.schedule) === false);
    same('unapproved: one reading asks the gate once and plans once, whatever its readers ask', questions(unasked, 'owesRead(State.schedule, todayStr())').slice(0, 2), [1, 1]);
    same('the carry shut: nothing is planned at all', questions(shut, 'owesRead(State.schedule, todayStr())')[1], 0);
    const restored = waiting.run(`(function () {
        const real = [carryReportingEnabled, payrollReport, closedPeriods]; let threw = false;
        const report = payrollReport;
        payrollReport = () => { throw new Error('a reader fell over'); };
        const mine = payrollReport;
        try { owesRead(State.schedule, todayStr()); } catch (error) { threw = true; }
        const after = [carryReportingEnabled === real[0], payrollReport === mine, closedPeriods === real[2]];
        payrollReport = report;
        return [threw].concat(after);
    })()`);
    same('and the three functions on the page afterwards are the ones that were there, throw or no throw', restored, [true, true, true, true]);

    // THE SHORT WAY TO THE GATE'S ANSWER IS THE GATE'S ANSWER. Every state a record can be
    // in: the flag shut, open and nothing to approve, open and unapproved, open and approved.
    const never = phone(make => { make.man('w_n', 'נועם פרץ'); make.work('w_n', FIVE(P[2][0])); make.give('w_n', '2026-09-08', 100); }, { approve: false });
    const states = [['the carry shut', shut], ['unapproved, needed', unasked], ['approved', waiting], ['nothing to approve, nobody asked', never]];
    given('nothing to approve: no plan row and no approval on the record', never.call('planCarryMigration', never.State.schedule).needed === false
        && !(never.State.schedule.ledger.migrations || {}).cm_carry);
    same('on each of them owesGateAnswer is carryReportingEnabled',
        states.map(([, device]) => device.run('owesGateAnswer(State.schedule, carryReportingEnabled)')),
        states.map(([, device]) => device.call('carryReportingEnabled', device.State.schedule)));
    same('which are the four answers there are', states.map(([, device]) => device.call('carryReportingEnabled', device.State.schedule)), [false, false, true, true]);
    // And the rule it is read from, in the model's own source: a gate that changes fails
    // here by name, before a phone answers from the rule of before.
    const LEDGER = source('js/model/ledger.js');
    const body = name => { const at = LEDGER.indexOf(`function ${name}(`); return LEDGER.slice(at, LEDGER.indexOf('\n}\n', at)).replace(/\/\/[^\n]*/g, ''); };
    check('the gate is the flag and the settled migration', /return advanceCarryEnabled\(\) && carryMigrationSettled\(schedule\);/.test(body('carryReportingEnabled')));
    check('settled is: nothing to restate, or approved', /if \(!plan\.needed\) return true;\s*return carryMigrationApproved\(schedule, plan\);/.test(body('carryMigrationSettled')));
    same('the approval reads one thing of the plan, its id', (body('carryMigrationApproved').match(/plan\.\w+/g) || []).filter((one, at, all) => all.indexOf(one) === at), ['plan.id']);
    check('and the id is one constant', /return 'cm_carry';/.test(body('carryMigrationId')));
}

// ---------------------------------------------------------------- 8. seeded records
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

const SEEDS = 24;

function seeded(seed) {
    const rand = mulberry(seed);
    const pick = list => list[Math.floor(rand() * list.length)];
    const men = [];
    // Every man here has a daily rate. A man with none never clears a debt out of wages, and
    // the migration's plan - which every gate question re-runs - then walks his account to
    // its ceiling of four thousand periods: seconds per question (measured), and this corpus
    // asks hundreds. A man with no rate is in the closures' fixtures below.
    const device = phone(make => {
        const crew = 3 + Math.floor(rand() * 4);
        for (let n = 1; n <= crew; n += 1) {
            const id = `w_${n}`;
            const weekly = rand() < 0.5;
            const stops = rand() < 0.25 ? addDays(TODAY, -Math.floor(10 + rand() * 30)) : null;
            make.man(id, `עובד ${seed}-${n}`, Object.assign({ dailyRate: pick([380, 450, 610]), active: rand() > 0.15 },
                weekly ? { payCycles: '2026-08-07=weekly' } : {}));
            const dates = [];
            for (let date = P[0][0]; date <= TODAY; date = addDays(date, 1)) {
                if (stops && date >= stops) break;
                if (rand() < 0.6) dates.push(date);
            }
            make.work(id, dates);
            const count = Math.floor(rand() * 3);
            for (let k = 0; k < count; k += 1) make.give(id, addDays(TODAY, -Math.floor(rand() * 45)), pick([200, 500, 1500, 5000, 250.5]));
            men.push({ id, weekly });
        }
    });
    const schedule = device.State.schedule;
    const facts = { closes: 0, repaid: 0 };
    // Where the record may be written, some men are closed IN ORDER from their first
    // advance - whole, half or nothing - and stop somewhere; some hand cash back.
    if (device.call('financialWritingEnabled', schedule)) {
        men.forEach(man => {
            if (rand() < 0.35) return;
            const worker = schedule.workers.filter(one => one.id === man.id)[0];
            const mine = device.advanceOf(man.id);
            if (!mine.length) return;
            if (rand() < 0.4) {
                const of = pick(mine);
                const room = device.call('advanceOutstanding', schedule, of.id).left;
                const sum = Math.min(room, pick([100, 200, 500]));
                if (sum > 0 && device.State.commit(device.call('recordAdvanceRepaid', schedule, of.id, sum,
                    addDays(of.date, 2) < TODAY ? addDays(of.date, 2) : of.date, '', '2026-09-22T08:00:00.000Z', 'd_office', 'cash'))) facts.repaid += 1;
            }
            const upTo = Math.floor(rand() * 4);
            let period = device.call('periodRangeFor', worker, mine[0].date);
            for (let n = 0; n < upTo && period.to < TODAY; n += 1) {
                const proposed = device.call('advanceAccount', schedule, man.id, period.from, period.to).deducted;
                const deduction = Math.floor(proposed * pick([0, 0.5, 1]));
                if (device.close([[man.id, period.from, period.to, deduction]], `2026-09-22T09:${String(10 + facts.closes % 50)}:00.000Z`) === true) facts.closes += 1;
                period = device.call('periodRangeFor', worker, addDays(period.to, 1));
            }
        });
    }
    return { device, facts };
}

{
    suite('seeded records: every figure of every man is its source function\'s answer');

    const tally = { records: 0, rows: 0, unclosed: 0, quiet: 0, idle: 0, closes: 0, repaid: 0, deducted: 0, wrong: [], closureWrong: [], ms: [] };
    for (let seed = 1; seed <= SEEDS; seed += 1) {
        const began = Date.now();
        const { device, facts } = seeded(seed);
        const schedule = device.State.schedule;
        againstSources(device).forEach(line => tally.wrong.push(`seed ${seed}: ${line}`));
        if (device.run('owesGateAnswer(State.schedule, carryReportingEnabled)') !== device.call('carryReportingEnabled', schedule)) tally.wrong.push(`seed ${seed}: the gate's short answer`);
        const read = device.read();
        tally.records += 1;
        tally.rows += read.rows.length;
        if (read.folded) {
            tally.unclosed += read.rows.filter(row => row.unclosed.length > 0).length;
            tally.quiet += read.rows.filter(row => row.quiet >= 2).length;
            tally.idle += read.rows.filter(row => row.idle).length;
            tally.deducted += read.rows.filter(row => row.lastDeducted).length;
        }
        tally.closes += facts.closes;
        tally.repaid += facts.repaid;
        tally.ms.push(Date.now() - began);
        // And the closures of the same record: each account against the closed period's
        // own two readers, each total against its rows.
        if (read.folded) {
            device.closures().forEach(group => {
                group.items.forEach(item => {
                    const account = device.call('advanceAccount', schedule, item.workerId, item.from, item.to);
                    const frozen = device.call('closedPeriods', schedule, item.workerId)[item.from];
                    if (!account.closed || !frozen) { tally.closureWrong.push(`seed ${seed}: ${item.workerId} ${item.from} is not closed`); return; }
                    if (item.deducted !== account.deducted || Math.abs(item.deducted - frozen.deducted) > 0.001) tally.closureWrong.push(`seed ${seed}: deducted`);
                    if (item.net !== account.net) tally.closureWrong.push(`seed ${seed}: net`);
                    if (item.remained !== account.carriedOut || (frozen.balanceAfter !== undefined && item.remained !== frozen.balanceAfter)) tally.closureWrong.push(`seed ${seed}: remained`);
                });
                ['deducted', 'net', 'remained'].forEach(field => {
                    const sum = Math.round(group.items.reduce((all, item) => all + (Number(item[field]) || 0), 0) * 100) / 100;
                    if (group.totals[field] !== sum) tally.closureWrong.push(`seed ${seed}: total ${field}`);
                });
            });
        }
    }
    given('the corpus has what the board is about', tally.rows > 40 && tally.unclosed > 10 && tally.quiet > 10
        && tally.idle > 3 && tally.closes > 20 && tally.repaid > 5 && tally.deducted > 5, JSON.stringify(tally));
    check(`${tally.records} records, ${tally.rows} men who owe: every figure is the source's`, tally.wrong.length === 0, tally.wrong.slice(0, 3).join(' | '));
    check(`${tally.closes} closes written: every account in «סגירות שנרשמו» is the closed period's own figures`,
        tally.closureWrong.length === 0, tally.closureWrong.slice(0, 3).join(' | '));
}

// ---------------------------------------------------------------- 9. the closures
{
    suite('«סגירות שנרשמו»: grouped by the moment and the phone, each account the closed period\'s own');

    const device = phone(make => {
        make.man('w_m', 'מחמוד עיסא', { payCycles: '2026-08-07=weekly' });
        make.man('w_r', 'ראמי עודה');
        make.man('w_y', 'יוסף נסאר', { payCycles: '2026-08-07=weekly' });
        make.work('w_m', FIVE(W[0][0]).concat(FIVE(W[1][0]), ['2026-09-20', '2026-09-21']));
        make.work('w_r', FIVE(P[0][0]).concat(FIVE(W[1][0]), ['2026-09-20', '2026-09-21']));
        make.work('w_y', FIVE(W[0][0]).concat(['2026-09-20', '2026-09-21']));
        make.give('w_m', '2026-08-10', 2000);
        make.give('w_r', '2026-08-11', 4000);
    });
    const schedule = device.State.schedule;
    same('no closure yet', device.closures(), []);

    // One press for three men, the way a pass would write it: one moment, one phone.
    given('three accounts close at one moment', device.close([
        ['w_m', W[0][0], W[0][1], 600], ['w_r', P[0][0], P[0][1], 2000], ['w_y', W[0][0], W[0][1], 0]
    ], '2026-09-22T14:40:00.000Z') === true);
    // And one more, later, from another phone.
    given('a fourth closes later, on another phone', device.close([['w_m', W[1][0], W[1][1], 400]], '2026-09-22T16:05:00.000Z', 'd_site') === true);

    const groups = device.closures();
    same('two closes, the newest first', groups.map(group => [group.at, group.by, group.items.length]),
        [['2026-09-22T16:05:00.000Z', 'd_site', 1], ['2026-09-22T14:40:00.000Z', 'd_office', 3]]);
    const pass = groups[1];
    same('the three accounts, by name, with what was deducted, what was left to pay and what remained', pass.items, [
        { workerId: 'w_y', name: 'יוסף נסאר', from: W[0][0], to: W[0][1], deducted: 0, net: 3050, remained: 0 },
        { workerId: 'w_m', name: 'מחמוד עיסא', from: W[0][0], to: W[0][1], deducted: 600, net: 2450, remained: 1400 },
        { workerId: 'w_r', name: 'ראמי עודה', from: P[0][0], to: P[0][1], deducted: 2000, net: 4100, remained: 2000 }
    ]);
    same('and the totals', pass.totals, { deducted: 2600, net: 9600, remained: 3400 });
    const wrong = [];
    groups.forEach(group => group.items.forEach(item => {
        const account = device.call('advanceAccount', schedule, item.workerId, item.from, item.to);
        const frozen = device.call('closedPeriods', schedule, item.workerId)[item.from];
        if (!account.closed || item.deducted !== account.deducted || item.net !== account.net || item.remained !== account.carriedOut
            || item.deducted !== frozen.deducted || item.remained !== frozen.balanceAfter) wrong.push(`${item.workerId} ${item.from}`);
    }));
    check('each of them is the closed period\'s own record, by both of its readers', wrong.length === 0, wrong.join(', '));

    same('the close as text, line for line', plain(device.run(`owesClosureText(owesClosures(State.schedule)[1])`)).split('\n'), [
        'סגירה · 22/09/2026',
        'יום שלישי, 17:40 · בטלפון הזה · 3 חשבונות',
        '',
        'יוסף נסאר · 07/08 - 13/08',
        'נוכה 0 ₪ · לתשלום 3050 ₪ · נשאר 0 ₪',
        'מחמוד עיסא · 07/08 - 13/08',
        'נוכה 600 ₪ · לתשלום 2450 ₪ · נשאר 1400 ₪',
        'ראמי עודה · 07/08 - 20/08',
        'נוכה 2000 ₪ · לתשלום 4100 ₪ · נשאר 2000 ₪',
        '',
        'סה״כ: נוכה 2600 ₪ · לתשלום 9600 ₪ · נשאר 3400 ₪'
    ]);
    same('the other one says whose phone', plain(device.run(`owesClosureMeta(owesClosures(State.schedule)[0])`)), 'יום שלישי, 19:05 · בטלפון אחר · חשבון אחד');

    // Drawn: the list, then one close.
    device.run('owesOpenPage("closures")');
    let page = device.draw();
    same('the list: the way back, the heading, what it cannot know', [device.texts(page, 'owes-closures').length,
        page.querySelectorAll('H2').map(node => node.textContent), device.texts(page, 'hint')],
    [1, ['סגירות שנרשמו'], ['כאן רשומים רק חשבונות שנסגרו. מי שלא נסגר באותו יום לא רשום כאן - הוא מופיע ב«מי חייב כסף».']]);
    same('one card per close', device.texts(page, 'owes-closure-card'), [
        'יום שלישי 22/09/2026חשבון אחד · נוכו 400 ₪ · לתשלום 2650 ₪',
        'יום שלישי 22/09/20263 חשבונות · נוכו 2600 ₪ · לתשלום 9600 ₪'
    ]);
    same('the board is not on this page', page.querySelectorAll('.owes').length, 0);
    device.run(`owesOpenPage(${JSON.stringify(pass.key)})`);
    page = device.draw();
    same('one close: its heading and who and when', [page.querySelectorAll('H2').map(node => node.textContent), device.texts(page, 'owes-closure-meta')],
        [['סגירה · 22/09/2026'], ['יום שלישי, 17:40 · בטלפון הזה · 3 חשבונות']]);
    same('its rows, each with the three figures under their words, and the sum last', device.texts(page, 'owes-closure-row'), [
        'יוסף נסאר07/08 - 13/08נוכה0 ₪לתשלום3050 ₪נשאר0 ₪',
        'מחמוד עיסא07/08 - 13/08נוכה600 ₪לתשלום2450 ₪נשאר1400 ₪',
        'ראמי עודה07/08 - 20/08נוכה2000 ₪לתשלום4100 ₪נשאר2000 ₪',
        'סה״כנוכה2600 ₪לתשלום9600 ₪נשאר3400 ₪'
    ]);
    same('the field holds the text that leaves', page.querySelectorAll('TEXTAREA').map(node => node.value), [device.run(`owesClosureText(owesClosures(State.schedule)[1])`)]);
    same('a man\'s advances asked for from elsewhere win over an open closure',
        [device.run('showWorkerAdvances("w_m"); renderAdvances(); OWES_PAGE'), device.dom.getElementById('advancesView').querySelectorAll('H2').map(node => node.textContent)],
        [null, ['מקדמות · מחמוד עיסא']]);
    device.run('showWorkerAdvances(null)');

    // A man with no daily rate cannot be closed by this build at all (planPeriodClosure's
    // 'unpriced'), so no closure of his can be written here. A closure that arrives without
    // a wage - from an older build, from another phone - is still said, and not as a zero.
    const norate = phone(make => {
        make.man('w_z', 'בלי שכר', { dailyRate: 0 });
        make.work('w_z', FIVE(P[0][0]));
        make.give('w_z', '2026-08-10', 300);
    });
    same('his fortnight is refused a close', [norate.close([['w_z', P[0][0], P[0][1], 0]], '2026-09-22T14:40:00.000Z'), norate.closures()], [false, []]);
    same('a wage nobody knows is not zero', [norate.run('owesNet({ net: null })'), norate.run('owesNet({ net: 0 })')], ['בלי שכר יומי', '0 ₪']);
}

// ---------------------------------------------------------------- 10. it writes nothing
{
    suite('drawing all of it leaves every byte on the disk where it was');

    const { device } = seeded(7);
    const schedule = device.State.schedule;
    given('there is money, a man who owes and a close on the record', device.read().rows.length > 0
        && device.read().folded && device.closures().length > 0, JSON.stringify([device.read().rows.length, device.closures().length]));

    const disk = JSON.stringify(device.dump());
    const record = JSON.stringify(schedule);
    const outbox = Object.keys(device.dump()).filter(key => key.indexOf('farkad:outbox') === 0).length;
    const touched = [];
    device.setQuota(key => { touched.push(`set ${key}`); return false; });
    device.blockRemoval(key => { touched.push(`remove ${key}`); return false; });

    device.run(`(function () {
        const read = owesRead(State.schedule, todayStr());
        owesWarnings(read).forEach(warning => owesWarningWords(warning, todayStr()));
        showWorkerAdvances(null); renderAdvances();
        REPORT_SECTION = 'workers'; REPORT_WORKERS = null; renderReports();
        owesOpenPage('closures'); renderAdvances();
        owesClosures(State.schedule).forEach(group => { owesOpenPage(group.key); renderAdvances(); owesClosureText(group); });
        owesOpenPage(null); renderAdvances();
        read.rows.forEach(row => (row.unclosed || []).slice(0, 1).forEach(span => { owesShowAccount(row.workerId, span); renderReports(); }));
        read.rows.forEach(row => { showWorkerAdvances(row.workerId); renderAdvances(); });
        showWorkerAdvances(null);
    })()`);

    check('not one write reached the disk', touched.length === 0, touched.slice(0, 5).join(', '));
    check('every key holds the bytes it held', JSON.stringify(device.dump()) === disk);
    check('the record in memory is the record it was', JSON.stringify(device.State.schedule) === record);
    same('nothing was queued for the cloud', Object.keys(device.dump()).filter(key => key.indexOf('farkad:outbox') === 0).length, outbox);

    device.State.commit(device.call('assignPlace', schedule, TODAY, schedule.workers[0].id, 'actual', 'p_x'));
    check('the same recorder notices a real commit', touched.length > 0 && JSON.stringify(device.dump()) !== disk, String(touched.length));

    // And in its code: nothing that commits, stores, queues or sends. Comments are taken
    // out first - the file's header names several of these to say it avoids them.
    // MOVED ON PURPOSE (the cost): the file now READS one thing of the Store, its write
    // tick, in one function - part of the key a kept reading is held under. That one
    // expression is taken out, whole, and the scan is what it was: no other word of Store.
    const TICK = 'return typeof Store === \'object\' && Store ? Store.tick : 0;';
    same('the Store is named in one expression, a read of its counter', OWES.replace(/\/\/[^\n]*/g, '').split(TICK).length - 1, 1);
    const code = OWES.replace(/\/\/[^\n]*/g, '').replace(TICK, '');
    check('the file has no writer in it', !/\bStore\b|localStorage|sessionStorage|indexedDB|State\.(commit|commitMany|save|persist)|saveFinancialAction|appendLedgerEntry|record[A-Z]\w*\(|closePeriodChanges|FarkadSync|syncEnqueue/.test(code));
    check('and calls no dialog of the browser (law 11)', !/\b(alert|confirm|prompt)\s*\(/.test(code));
    check('it multiplies no rate and subtracts no wage: the only sums are of balances already read',
        !/dailyRate|hourlyRate|\.gross\s*[-+*]/.test(code));
}

// ---------------------------------------------------------------- 11. the cost
//
// REPAIRED BEFORE IT WAS SERVED. As first written the board asked the gate once per draw
// of «מקדמות» and once per draw of «דוחות», and the question re-plans the migration: on
// this season 259 ms a reading in Node by its author's measure, and SECONDS on a record
// with a man who has a debt and no daily rate - the plan walks his account to its ceiling
// of four thousand fortnights (to the year 2180), each of them a pay sheet of the whole
// crew. What is held here is counted, not timed, wherever it can be:
//
//   the plan           not at all on an approved record; once on an unapproved one
//   each reader        once per reading: the pay sheet once per range, a man's closed
//                      periods once per man
//   a draw of a record that did not move      reads nothing
//   a draw after ANY change, by any door      reads the record as it is
//   «דוחות» with the board                    within 1.5x of «דוחות» without it
{
    suite('a season: fifteen men, twenty-six weeks, nothing ever closed');

    const season = [];
    for (let date = addDays(TODAY, -182); date <= TODAY; date = addDays(date, 1)) {
        if (new Date(`${date}T12:00:00`).getDay() !== 6) season.push(date);
    }
    const device = phone(make => {
        for (let n = 1; n <= 15; n += 1) {
            make.man(`w_${n}`, `עובד ${n}`, n % 2 ? { payCycles: '2026-01-02=weekly' } : {});
            make.work(`w_${n}`, season);
            make.give(`w_${n}`, addDays(TODAY, -170 + n), 1000 + 100 * n);
            make.give(`w_${n}`, addDays(TODAY, -30 + n), 500);
        }
    });
    given('readable the new way', device.call('carryReportingEnabled', device.State.schedule) === true);
    const started = Date.now();
    const read = device.read();
    const took = Date.now() - started;
    same('fifteen men on the board', read.rows.length, 15);
    check(`one reading of it in Node: ${took}ms (the ceiling is a guard against a walk that grew, not a promise about a phone)`, took < 4000, `${took}ms`);
    holds('and every figure its source\'s', device);

    // The instrument: every REAL call of the three readers and of the plan, by argument.
    device.run(`var COST = null; (function () {
        const real = { plan: planAdvanceCarry, sheet: payrollReport, closed: closedPeriods, read: owesRead };
        planAdvanceCarry = function (schedule) { if (COST) COST.plans += 1; return real.plan.apply(this, arguments); };
        payrollReport = function (schedule, from, to) { if (COST) COST.sheets.push(from + '..' + to); return real.sheet.apply(this, arguments); };
        closedPeriods = function (schedule, id) { if (COST) COST.closed.push(String(id)); return real.closed.apply(this, arguments); };
        owesRead = function () { if (COST) COST.reads += 1; return real.read.apply(this, arguments); };
    })();
    function cost(work) {
        COST = { plans: 0, sheets: [], closed: [], reads: 0 };
        try { work(); } finally { var out = COST; COST = null; }
        const twice = list => list.filter((one, at) => list.indexOf(one) !== at).length;
        return { plans: out.plans, reads: out.reads, sheets: out.sheets.length, sheetsTwice: twice(out.sheets),
            closed: out.closed.length, closedTwice: twice(out.closed) };
    }`);
    const cost = code => JSON.parse(device.run(`JSON.stringify(cost(() => { ${code} }))`));
    const drawList = 'ADVANCE_WORKER = null; OWES_PAGE = null; clear(document.getElementById("advancesView")); renderAdvances();';
    const drawSheet = 'REPORT_SECTION = "workers"; REPORT_WORKERS = null; renderReports();';

    // This season needs no migration (every wage covers its advances) and nobody has
    // pressed a financial button on it, so the record carries no approval: the one state
    // besides "unapproved" in which the gate has to plan. Once, however many readers ask.
    given('nothing to approve, and no approval on the record', device.call('planCarryMigration', device.State.schedule).needed === false
        && !((device.State.schedule.ledger || {}).migrations || {}).cm_carry);
    same('a record with nothing to approve and no approval: one reading plans once', cost('owesRead(State.schedule, todayStr())').plans, 1);
    // The first financial action records that decision with itself (saveFinancialAction,
    // js/ui/reports.js). From then on the record carries it.
    given('the approval is recorded, as the first financial action records it', device.State.commit(device.call('recordCarryApproval',
        device.State.schedule, device.call('planCarryMigration', device.State.schedule), '2026-09-01T09:00:00.000Z', 'd_office')) !== false);
    const one = cost('owesRead(State.schedule, todayStr())');
    same('one reading: the migration is not planned (the record carries the approval)', one.plans, 0);
    same('the pay sheet of no range is asked twice, and no man\'s closed periods are folded twice', [one.sheetsTwice, one.closedTwice], [0, 0]);
    check(`and what it asks is bounded by the men and their periods: ${one.sheets} pay sheets, ${one.closed} folds`,
        one.sheets > 0 && one.sheets <= 26 + 13 + 4 && one.closed === 15, JSON.stringify(one));

    // THE DRAWS. The first draw of «מקדמות» reads the record once; a second draw of the
    // same record reads nothing; «דוחות» drawn after it adds nothing of the board's - its
    // row comes from the same reading.
    device.run('OWES_KEPT = null');
    const first = cost(drawList);
    same('the first draw of «מקדמות»: one reading, no plan', [first.reads, first.plans], [1, 0]);
    same('a second draw of the same record: no reading, no plan, no pay sheet, no fold', cost(drawList), { plans: 0, reads: 0, sheets: 0, sheetsTwice: 0, closed: 0, closedTwice: 0 });
    device.run('var BOARD = [renderOwesInto, renderOwesWarningsInto];');
    const sheetWith = cost(drawSheet);
    check('the row is at the head of «דוחות»', device.dom.getElementById('reportsView').querySelectorAll('.owes-warnings').length === 1);
    device.run('renderOwesInto = () => {}; renderOwesWarningsInto = () => {};');
    const sheetWithout = cost(drawSheet);
    device.run('renderOwesInto = BOARD[0]; renderOwesWarningsInto = BOARD[1];');
    same('«דוחות» with the row at its head asks exactly what «דוחות» asks without it: no reading, and not one question more',
        [sheetWith.reads, sheetWith.plans, sheetWith.sheets, sheetWith.closed], [0, sheetWithout.plans, sheetWithout.sheets, sheetWithout.closed]);
    // On a record nobody approved the reading costs ONE plan, once, and the next draws none.
    {
        const waiting = phone(make => {
            make.man('w_d', 'דוד כהן'); make.work('w_d', FIVE(P[0][0])); make.give('w_d', '2026-08-10', 5000);
        }, { approve: false });
        const plans = code => waiting.run(`(function () { const plan = planAdvanceCarry; let n = 0;
            planAdvanceCarry = schedule => { n += 1; return plan(schedule); };
            try { ${code} } finally { planAdvanceCarry = plan; } return n; })()`);
        given('unapproved', waiting.call('carryReportingEnabled', waiting.State.schedule) === false);
        same('unapproved: the first draw of «מקדמות» plans once, the second not at all', [plans(drawList), plans(drawList)], [1, 0]);
    }

    // FRESH AFTER ANY WRITE. What is drawn is compared with a reading made from nothing,
    // after each door a record changes by.
    const fresh = () => device.run('JSON.stringify(owesReadNow()) === JSON.stringify(owesRead(State.schedule, todayStr()))');
    const drawnTotal = () => plain(device.draw().querySelectorAll('.owes-total-amount')[0].textContent);
    const money = value => plain(device.run(`owesMoney(${value})`));
    device.run(drawList);
    const before = device.read();
    same('before: the page says the reading\'s total', drawnTotal(), money(before.total));
    check('the reading of a record that did not move is the SAME reading, kept', device.run('owesReadNow() === owesReadNow()') === true);

    // 1. an advance is written, the way the form writes it
    const tickWas = device.run('Store.tick');
    given('an advance of 700 is written the way the form writes it (recordNewAdvance, State.commitMany)',
        device.State.commitMany(device.call('recordNewAdvance', device.State.schedule, 'w_2', TODAY, 700, '',
            `${TODAY}T10:00:00.000Z`, 'd_office', 'cash')) !== false);
    const afterAdvance = device.run('JSON.parse(JSON.stringify(owesRead(State.schedule, todayStr())))');
    given('the record\'s total moved by 700 and the tick went forward', afterAdvance.total === before.total + 700 && device.run('Store.tick') > tickWas,
        JSON.stringify([before.total, afterAdvance.total]));
    same('after an advance: the next draw says the new total', drawnTotal(), money(afterAdvance.total));
    check('and the kept reading is the record\'s', fresh());

    // 2. a period is closed with a deduction
    const man = afterAdvance.rows.filter(row => row.workerId === 'w_2')[0];
    given('he has an account nobody closed', man.unclosed.length > 0);
    const span = man.unclosed[0];
    given('his oldest open account closes with 300 off', device.close([['w_2', span.from, span.to, 300]], `${TODAY}T11:00:00.000Z`) === true);
    const afterClose = JSON.parse(device.run('JSON.stringify(owesReadNow())'));
    const closedMan = afterClose.rows.filter(row => row.workerId === 'w_2')[0];
    same('after a close: 300 less, the deduction dated, and that account no longer named',
        [closedMan.amount, closedMan.lastDeducted, closedMan.unclosed.some(one => one.from === span.from)], [man.amount - 300, span.to, false]);
    same('and the page says it', drawnTotal(), money(afterAdvance.total - 300));
    check('the kept reading is the record\'s', fresh());
    same('«סגירות שנרשמו» has the close', device.closures().length, 1);
    check('and its way in is drawn', device.draw().querySelectorAll('.owes-closures-entry').length === 1);

    // 3. money handed back
    given('200 is handed back', device.State.commit(device.call('recordAdvanceRepaid', device.State.schedule,
        device.advanceOf('w_3')[0].id, 200, TODAY, '', `${TODAY}T12:00:00.000Z`, 'd_office', 'cash')) !== false);
    same('after a repayment: the page says 200 less', drawnTotal(), money(afterAdvance.total - 500));
    check('the kept reading is the record\'s', fresh());

    // 4. THE RECORD MOVES AND THE TICK DOES NOT: memory changed by no write at all (a
    // record held in memory by a suite, a disk that refuses the counter). The key is the
    // record, so the reading is still the record's.
    const tick = device.run('Store.tick');
    device.run('State.schedule.workers.filter(one => one.id === "w_4")[0].active = false');
    given('the tick did not move', device.run('Store.tick') === tick);
    check('a man switched off in memory is switched off on the next reading', JSON.parse(device.run('JSON.stringify(owesReadNow())')).rows.filter(row => row.workerId === 'w_4')[0].active === false);
    check('the kept reading is the record\'s', fresh());
    device.run('State.schedule.workers.filter(one => one.id === "w_4")[0].active = true');
    check('and switched back, it is read back', JSON.parse(device.run('JSON.stringify(owesReadNow())')).rows.filter(row => row.workerId === 'w_4')[0].active === true);

    // 5. the day turns: every period is counted from today
    device.setToday(addDays(TODAY, 14));
    same('a fortnight later the reading is of that day', JSON.parse(device.run('JSON.stringify(owesReadNow())')).today, addDays(TODAY, 14));
    check('the kept reading is the record\'s', fresh());
    device.setToday(TODAY);

    // 6. the gate turns: the approval is part of the record
    device.run('var APPROVAL = State.schedule.ledger.migrations; State.schedule.ledger.migrations = {};');
    given('with the approval gone the record may not be read the new way', device.call('carryReportingEnabled', device.State.schedule) === false);
    same('and the next reading is not folded', JSON.parse(device.run('JSON.stringify(owesReadNow())')).folded, false);
    device.run('State.schedule.ledger.migrations = APPROVAL;');
    same('put back, it is folded again', JSON.parse(device.run('JSON.stringify(owesReadNow())')).folded, true);
    check('the key names both gates of this build', /advanceCarryEnabled\(\)/.test(OWES.slice(OWES.indexOf('function owesKey('), OWES.indexOf('function owesKeptNow(')))
        && /ledgerWritesEnabled\(\)/.test(OWES.slice(OWES.indexOf('function owesKey('), OWES.indexOf('function owesKeptNow('))));

    // THE FACTOR. «דוחות» ← «לפי עובד» drawn with the row at its head and without, each
    // time on a record that MOVED since the last draw (so nothing is kept and the board
    // is read in full, inside the draw - the suites' devices have no frame to wait for,
    // which is the worst case: on a phone the reading is made after the page has painted).
    // The best of three each, taken in turns.
    const timed = code => { const began = performance.now(); device.run(code); return performance.now() - began; };
    const move = 'State.schedule.workers[0].note = String(Math.random()); ';
    const times = { on: [], off: [] };
    for (let round = 0; round < 3; round += 1) {
        times.on.push(timed(move + drawSheet));
        device.run('renderOwesInto = () => {}; renderOwesWarningsInto = () => {};');
        times.off.push(timed(move + drawSheet));
        device.run('renderOwesInto = BOARD[0]; renderOwesWarningsInto = BOARD[1];');
    }
    const best = list => Math.min(...list);
    check(`«דוחות» with the board, the record having moved: ${best(times.on).toFixed(0)}ms against ${best(times.off).toFixed(0)}ms without - within 1.5x`,
        best(times.on) <= best(times.off) * 1.5, JSON.stringify(times));
    device.run('delete State.schedule.workers[0].note');
}

// ---------------------------------------------------------------- 12. the words
{
    suite('every new word, as proposed; every borrowed word, where its owner keeps it');

    const device = phone(make => { make.man('w_d', 'דוד'); });
    const said = JSON.parse(device.run(`JSON.stringify(Object.keys(OWES_TEXT).reduce((out, key) => {
        const value = OWES_TEXT[key];
        out[key] = typeof value === 'function' ? value('<>') : value;
        return out;
    }, {}))`));
    same('the block, word for word', said, {
        total: 'חוב פתוח של העובדים',
        board: 'מי חייב כסף',
        order: 'מהחוב הגדול לקטן',
        none: 'אף עובד לא חייב כסף כרגע.',
        oneOwes: 'עובד אחד חייב',
        manyOwe: '<> עובדים חייבים',
        oneAttention: 'אחד דורש טיפול',
        manyAttention: '<> דורשים טיפול',
        since: 'מאז <>',
        lastDeducted: 'נוכה לאחרונה <>',
        neverDeducted: 'הניכוי האחרון: אין',
        quietWeeks: '<> שבועות בלי ניכוי',
        quietPeriods: '<> תקופות בלי ניכוי',
        idleWeek: 'לא עבד השבוע',
        idlePeriod: 'לא עבד בתקופה',
        unclosed: 'חשבון קודם לא נסגר',
        attention: 'שים לב',
        oneThing: 'דבר אחד',
        things: '<> דברים',
        sinceAdvance: 'המקדמה מ-<>. מאז לא נוכה ולא הוחזר כלום.',
        sinceMove: 'התנועה האחרונה: <>. מאז לא נוכה ולא הוחזר כלום.',
        idleWeekTitle: 'יש חוב ואין ימי עבודה השבוע',
        idlePeriodTitle: 'יש חוב ואין ימי עבודה בתקופה',
        offTitle: 'יש חוב והעובד כבוי',
        lastWork: 'יום העבודה האחרון שלו: <>.',
        neverWorked: 'אין לו ימי עבודה רשומים.',
        presumedWeek: 'הדוח הניח שנוכו <> ₪ בשבוע הזה, אבל הניכוי לא נרשם במקדמות.',
        presumedPeriod: 'הדוח הניח שנוכו <> ₪ בתקופה הזאת, אבל הניכוי לא נרשם במקדמות.',
        recorded: 'במקדמות רשום חוב של <> ₪.',
        oneMore: 'ועוד חשבון אחד שלא נסגר אחריו. סוגרים מהישן לחדש.',
        more: 'ועוד <> חשבונות שלא נסגרו אחריו. סוגרים מהישן לחדש.',
        closures: 'סגירות שנרשמו',
        closuresNone: 'עוד לא נרשמה אף סגירה.',
        closuresLimit: 'כאן רשומים רק חשבונות שנסגרו. מי שלא נסגר באותו יום לא רשום כאן - הוא מופיע ב«מי חייב כסף».',
        closure: 'סגירה · <>',
        backToClosures: 'חזרה לסגירות שנרשמו',
        oneAccount: 'חשבון אחד',
        accounts: '<> חשבונות',
        deductedTotal: 'נוכו <> ₪',
        thisPhone: 'בטלפון הזה',
        otherPhone: 'בטלפון אחר',
        noTime: 'בלי שעת רישום',
        who: 'עובד · תקופה',
        deducted: 'נוכה',
        remained: 'נשאר',
        sum: 'סה״כ',
        noWage: 'בלי שכר יומי',
        history: 'כל ניכוי כאן רשום גם בהיסטוריה של העובד בעמוד המקדמות שלו - ושם אפשר לרשום תיקון לצידו.',
        textLabel: 'הסגירה כטקסט'
    });
    same('the owner\'s number: flagged after two periods', device.run('OWES_QUIET_PERIODS'), 2);

    const reused = JSON.parse(device.run('JSON.stringify(OWES_REUSED)'));
    const owners = {
        advances: 'js/ui/reports.js', recorded: 'js/ui/roster.js', off: 'js/ui/reports.js', review: 'js/ui/reports.js',
        checkFirst: 'js/ui/reports.js', back: 'js/ui/reports.js', toPay: 'js/ui/reports.js', send: 'index.html', copy: 'index.html'
    };
    same('every borrowed word has an owner named here', Object.keys(reused).sort(), Object.keys(owners).sort());
    Object.keys(owners).forEach(key => check(`«${reused[key]}» is in ${owners[key]}`, source(owners[key]).includes(reused[key])));
    same('and two are read, not repeated', [device.run('OTHER_ACCOUNT_SHOW'), device.run('JSON.stringify(PAY_CYCLE_LABELS)')],
        ['הצג את החשבון', '{"weekly":"שבועי","biweekly":"דו־שבועי"}']);

    // The quiet page.
    const page = device.draw();
    same('a phone on which nobody owes: one sentence, and no board', [device.texts(page, 'owes-none'), page.querySelectorAll('.owes-row').length, page.querySelectorAll('.owes-total').length],
        [['אף עובד לא חייב כסף כרגע.'], 0, 0]);

    // The page and the worker know of it.
    const html = source('index.html');
    const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map(match => match[1]);
    check('the page loads it after the pay sheet and the two doors, and before the app boots',
        scripts.indexOf('js/ui/owes.js') > scripts.indexOf('js/ui/reports.js')
        && scripts.indexOf('js/ui/owes.js') > scripts.indexOf('js/ui/share.js')
        && scripts.indexOf('js/ui/owes.js') < scripts.indexOf('js/app.js'));
    check('as a classic script', /<script src="js\/ui\/owes\.js"><\/script>/.test(html));
    check('and the worker\'s shell carries it', source('sw.js').includes("'./js/ui/owes.js'"));
}

report();
