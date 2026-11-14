// v196: one draw of the pay sheet asks the carry gate at most once - and no figure moves.
//
//   node tests/reports.speed.test.mjs
//
// THE COST, AS v195 LEFT IT. Every reader of «דוחות» asks carryReportingEnabled for itself,
// and the question re-plans the migration: planAdvanceCarry walks every man's account
// forward, and a man with a debt and NO daily rate to its ceiling of four thousand
// fortnights, each a pay sheet of the whole crew. A draw of «דוחות» ← «לפי עובד» asked it
// 16 to 18 times in Node (about two seconds on fifteen men over half a year; 27 seconds
// with one man who has a debt and no rate) and 27 times in Chromium.
//
// v196 reads each way into js/ui/reports.js inside ONE reading (reportReadOnce): the gate
// answered once - and on a record that carries the approval not planned at all
// (reportGateAnswer) - the pay sheet of a range worked out once, a man's closed periods
// folded once; the readings of js/ui/workercard.js, js/ui/payslips.js and
// js/ui/monthsummary.js are that same reading. What this suite holds:
//
//   1. NO FIGURE MOVED. On seeded records (both pay cycles, closes whole, half and empty,
//      repayments, men who stopped, a man with no rate) under THREE readings - the gates
//      shut, open and approved, open and nobody approved - every node of «דוחות» on both
//      sections over seven ranges (which IS the paper and the picture: both are drawn off
//      these nodes by code v196 does not touch), the workbook's sheets, the pay rows, every
//      man's statement, his days dialog, his closing dialog, «מקדמות» and each man's page
//      there, every worker card, the payslips of both periods and the month's summary of
//      two months - are the SAME BYTES as the pay sheet of v195 draws (b48ac44, out of
//      Git, with workercard.js, payslips.js and monthsummary.js of the same commit).
//   2. THE QUESTIONS ARE COUNTED, per draw and per way in: the plan not at all on an
//      approved record, once on a record that has to be planned and then not again while
//      it does not move, never with the carry shut; no range's pay sheet worked out twice
//      in a draw, no man's closed periods folded twice.
//   3. THE SHORT ANSWER IS THE GATE'S ANSWER in every state, and the model's lines it is
//      read from are pinned.
//   4. NEVER A STALE FIGURE. After an advance, a close, a repayment, a day typed, a rate
//      changed, the approval removed and restored, a change in memory no write carried,
//      and the day turning, the draw is node for node the draw made with every reader
//      asked afresh.
//   5. THE BOUND. On fifteen men over half a year with a man who has a debt and no rate,
//      a draw of a moved record costs less than ONE question of the gate did.
//
// Synthetic data only: invented men, one invented site.

import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeDevice } from './harness.mjs';
import { makeDom } from './moneydom.mjs';
import { suite, check, same, given, report } from './runner.mjs';

process.env.TZ = 'Asia/Jerusalem';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = file => readFileSync(join(ROOT, file), 'utf8');

// The pay sheet as v195 served it: origin/main when this was written.
const V195 = 'b48ac44';
const SCREENS = ['js/ui/reports.js', 'js/ui/workercard.js', 'js/ui/seder.js', 'js/ui/payslips.js', 'js/ui/monthsummary.js', 'js/ui/owes.js'];
const NOW_ONLY = ['js/ui/daycheck.js', 'js/ui/weeklyclose.js'];
const NOW = {};
const OLD = {};
SCREENS.forEach(file => { NOW[file] = source(file); });
{
    let missing = '';
    SCREENS.forEach(file => {
        try {
            OLD[file] = execFileSync('git', ['-C', ROOT, 'show', `${V195}:${file}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
        } catch (error) { missing = file; }
    });
    given('the v195 commit is in this repository', missing === '', missing);
    given('and its pay sheet does not know the one reading', !/reportReadOnce/.test(OLD['js/ui/reports.js']));
    given('and it is not the file under test', OLD['js/ui/reports.js'] !== NOW['js/ui/reports.js']);
}

const SHUT = { carryAdvances: false, ledgerWrites: false };
const OPEN = { carryAdvances: true, ledgerWrites: true };

const addDays = (date, days) => {
    const [y, m, d] = date.split('-').map(Number);
    const at = new Date(y, m - 1, d + days);
    return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`;
};
// A Tuesday in the fourth fortnight from the account's anchor.
const TODAY = '2026-09-22';
const ANCHOR = '2026-08-07';

// ---------------------------------------------------------------- a phone
//
// The record is written by the app's own writers on one device; every reading below is
// a device REOPENED on its disk (which is what mirrors the advances into the ledger), with
// the pay sheet of one build or the other.
function opened(storage, flags, files) {
    const device = makeDevice({ deviceId: 'd_office', storage, flags });
    const dom = makeDom();
    ['reportsView', 'advancesView', 'workerDaysTitle', 'workerDaysMeta', 'workerDaysBody', 'workerDaysModal'].forEach(id => dom.register(id));
    const make = dom.createElement;
    dom.createElement = tag => { const node = make(tag); node.dataset = {}; return node; };
    device.ctx.document = dom;
    device.dom = dom;
    device.run = code => vm.runInContext(code, device.ctx, { filename: 'harness:reports.speed' });
    device.run(source('js/ui/sitecolor.js'));
    SCREENS.forEach(file => device.run(files[file]));
    // v197: «סגירת שבוע» on the build under test - its button in the draw of «דוחות» and of
    // «מקדמות», and its list read as one more way in. v195 had no such file.
    if (files === NOW) NOW_ONLY.forEach(file => device.run(source(file)));
    device.run('var currentView = "reports";');
    device.ctx.showView = view => device.run(`currentView = ${JSON.stringify(view)}`);
    device.ctx.askTell = () => Promise.resolve();
    device.ctx.askConfirm = () => Promise.resolve(true);
    device.ctx.render = () => {};
    device.ctx.openSettings = () => {};
    device.setToday(TODAY);
    device.State.load();
    return device;
}

// Write a record the app's way and hand back its disk.
function written(build) {
    const first = makeDevice({ deviceId: 'd_office', flags: OPEN });
    const schedule = first.State.schedule;
    schedule.places = [{ id: 'p_x', name: 'חיפה', active: true }];
    schedule.workers = [];
    build({
        man(id, name, extra = {}) {
            schedule.workers.push(Object.assign({ id, name, active: true, dailyRate: 610, hourlyRate: 0 }, extra));
        },
        work(id, dates, rate) { dates.forEach(date => first.call('assignPlace', schedule, date, id, 'actual', 'p_x', rate || 'normal')); },
        give(id, date, amount) { first.call('addAdvance', schedule, id, date, amount, ''); }
    });
    first.State.save({ silent: true });
    return first.dump();
}

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

// A seeded record, then its money written through the app's own financial writers:
// repayments, and men closed IN ORDER from their first advance - whole, half or nothing.
// `noRate`: one more man with a debt and no daily rate, the walk to the year 2180.
function seeded(seed, noRate) {
    const rand = mulberry(seed);
    const pick = list => list[Math.floor(rand() * list.length)];
    const men = [];
    const disk = written(make => {
        const crew = 3 + Math.floor(rand() * 3);
        for (let n = 1; n <= crew; n += 1) {
            const id = `w_${n}`;
            const weekly = rand() < 0.5;
            const stops = rand() < 0.25 ? addDays(TODAY, -Math.floor(10 + rand() * 30)) : null;
            make.man(id, `עובד ${seed}-${n}`, Object.assign({ dailyRate: pick([380, 450, 610]), hourlyRate: pick([0, 0, 45]),
                active: rand() > 0.15 }, weekly ? { payCycles: `${ANCHOR}=weekly` } : {}));
            const dates = [];
            for (let date = ANCHOR; date <= TODAY; date = addDays(date, 1)) {
                if (stops && date >= stops) break;
                if (rand() < 0.6) dates.push(date);
            }
            make.work(id, dates.filter(() => rand() < 0.85));
            make.work(id, dates.filter(() => rand() < 0.08), 'double');
            const count = Math.floor(rand() * 3);
            for (let k = 0; k < count; k += 1) make.give(id, addDays(TODAY, -Math.floor(rand() * 45)), pick([200, 500, 1500, 5000, 250.5]));
            men.push(id);
        }
        if (noRate) {
            make.man('w_nr', `בלי שכר ${seed}`, { dailyRate: 0 });
            make.work('w_nr', [addDays(TODAY, -9), addDays(TODAY, -8), addDays(TODAY, -2)]);
            make.give('w_nr', addDays(TODAY, -8), 1000);
        }
    });
    const device = opened(disk, OPEN, NOW);
    const schedule = device.State.schedule;
    const facts = { closes: 0, repaid: 0 };
    // A person has read the migration's rows and approved them - the record every reading
    // but "nobody approved" is about.
    const plan = device.call('planCarryMigration', schedule);
    if (plan.needed) device.State.commit(device.call('recordCarryApproval', schedule, plan, '2026-09-01T09:00:00.000Z', 'd_person'));
    device.run(`function testClose(list, at) {
        return saveFinancialAction(() => list.reduce((all, one) => all.concat(
            closePeriodChanges(State.schedule, one[0], one[1], one[2], at, 'd_office', one[3])), []));
    }`);
    men.forEach(id => {
        if (rand() < 0.3) return;
        const worker = schedule.workers.filter(one => one.id === id)[0];
        const mine = device.call('advancesFor', schedule, id, '0000-01-01', '9999-12-31');
        if (!mine.length) return;
        if (rand() < 0.4) {
            const of = pick(mine);
            const room = device.call('advanceOutstanding', schedule, of.id).left;
            const sum = Math.min(room, pick([100, 200, 500]));
            if (sum > 0 && device.run(`saveFinancialAction(() => recordAdvanceRepaid(State.schedule, ${JSON.stringify(of.id)}, ${sum}, ${JSON.stringify(of.date)}, '', '2026-09-22T08:00:00.000Z', 'd_office', 'cash'))`) === true) facts.repaid += 1;
        }
        const upTo = Math.floor(rand() * 4);
        let period = device.call('periodRangeFor', worker, mine[0].date);
        for (let n = 0; n < upTo && period.to < TODAY; n += 1) {
            const proposed = device.call('advanceAccount', schedule, id, period.from, period.to).deducted;
            const deduction = Math.floor(proposed * pick([0, 0.5, 1]));
            if (device.run(`testClose(${JSON.stringify([[id, period.from, period.to, deduction]])}, '2026-09-22T09:${String(10 + facts.closes % 50)}:00.000Z')`) === true) facts.closes += 1;
            period = device.call('periodRangeFor', worker, addDays(period.to, 1));
        }
    });
    return { disk: device.dump(), men: schedule.workers.map(worker => worker.id), facts };
}

// ---------------------------------------------------------------- the instrument
//
// A node as everything a person, a printer or the picture can be told about it: its tag,
// class, attributes, the state a control carries, and its text or its children.
function snap(node) {
    const out = { tag: node.tagName, cls: node.className || '' };
    const attrs = Object.keys(node.attributes || {}).sort();
    if (attrs.length) out.attrs = attrs.map(key => [key, node.attributes[key]]);
    const data = Object.keys(node.dataset || {}).sort();
    if (data.length) out.data = data.map(key => [key, node.dataset[key]]);
    ['hidden', 'disabled', 'open', 'checked', 'value', 'type', 'placeholder', 'title'].forEach(key => {
        if (node[key] !== undefined && node[key] !== '' && node[key] !== false) out[key] = node[key];
    });
    const style = Object.keys(node.style || {}).sort();
    if (style.length) out.style = style.map(key => [key, node.style[key]]);
    if (node.children.length === 0) out.text = node.textContent;
    else out.kids = node.children.map(snap);
    return out;
}
// v197: «סגירת שבוע»'s one button (js/ui/weeklyclose.js) is drawn by the build under test
// beside the pay sheet and outside its section, and v195 had no such file. It is taken out
// of the comparison here - and COUNTED, per draw, so that suite 1 says where it was drawn:
// on «לפי עובד» and on top of «מקדמות» exactly when this record may be closed, and nowhere
// else.
const WEEKLY_ENTRY = /(^|\s)weekly-close-entry(\s|$)/;
const withoutWeekly = (device, nodes) => nodes.filter(node => {
    if (!WEEKLY_ENTRY.test(node.className || '')) return true;
    device.weeklyEntries = (device.weeklyEntries || 0) + 1;
    return false;
}).map(node => (node.children.length ? Object.assign(snap(node), { kids: withoutWeekly(device, node.children) }) : snap(node)));
const drawnIn = (device, id) => JSON.stringify(withoutWeekly(device, device.dom.getElementById(id).children));

// THE OLD BUILD IS ANSWERED THE GATE ONCE PER RECORD STATE, by its own function. It asks
// the question a dozen times a draw and plans every time; nothing in a record moves while
// its readings are taken, so the real function is asked once per record text and its
// answer handed back - by the real function's name, so every reader of the old pay sheet
// still goes through the gate. The build under test is given nothing: it is measured as
// it runs.
const GATE_PER_RECORD = `(function () {
    const real = carryReportingEnabled;
    const known = new Map();
    carryReportingEnabled = schedule => {
        const key = JSON.stringify(schedule);
        if (!known.has(key)) known.set(key, real(schedule));
        return known.get(key);
    };
})(); 1`;

const RANGES = [
    ['the default account', 'REPORT_PRESET = "fortnight"; REPORT_RANGE.from = null; REPORT_RANGE.to = null; (() => { const r = defaultPayrollRange(); REPORT_RANGE.from = r.from; REPORT_RANGE.to = r.to; })();'],
    ['the same fortnight picked by hand', 'REPORT_PRESET = "custom"; (() => { const r = defaultPayrollRange(); REPORT_RANGE.from = r.from; REPORT_RANGE.to = r.to; })();'],
    ['the fortnight before', 'REPORT_PRESET = "custom"; (() => { const r = defaultPayrollRange(); REPORT_RANGE.from = shiftDate(r.from, -14); REPORT_RANGE.to = shiftDate(r.to, -14); })();'],
    ['this week', 'REPORT_PRESET = "weekly"; setWeeklyReportRange(0);'],
    ['last week', 'REPORT_PRESET = "lastweek"; setWeeklyReportRange(-1);'],
    ['this month', 'REPORT_PRESET = "month"; setMonthRange(0);'],
    ['last month', 'REPORT_PRESET = "lastmonth"; setMonthRange(-1);']
];

// Everything the pay sheet and the screens that read it say about one record, as text.
function everything(device, men) {
    const out = {};
    device.weeklyDrawn = [];
    const json = code => device.run(`JSON.stringify(${code})`);
    device.run('REPORT_DEDUCTIONS.clear(); REPORT_WORKERS = null; INVOICE_PLACE = null; REPORT_CARD_GRID = true;');
    RANGES.forEach(([name, set]) => {
        device.run(set);
        device.run('REPORT_SECTION = "workers"; renderReports();');
        device.weeklyEntries = 0;
        out[`${name}: «לפי עובד»`] = drawnIn(device, 'reportsView');
        device.weeklyDrawn.push(['workers', device.weeklyEntries]);
        device.run('REPORT_SECTION = "sites"; renderReports();');
        device.weeklyEntries = 0;
        out[`${name}: «לפי אתר»`] = drawnIn(device, 'reportsView');
        device.weeklyDrawn.push(['sites', device.weeklyEntries]);
        device.run('REPORT_SECTION = "workers";');
        out[`${name}: the pay rows`] = json('payrollRows()');
        out[`${name}: the workbook`] = json('reportSheets()');
        men.forEach(id => {
            const range = device.run('REPORT_RANGE.from + ".." + REPORT_RANGE.to + "|" + REPORT_PRESET');
            out[`${name}: ${id}: his statement`] = json(`workerStatementText(${JSON.stringify(id)})`);
            device.run(`openWorkerDays(${JSON.stringify(id)})`);
            out[`${name}: ${id}: his days`] = ['workerDaysTitle', 'workerDaysMeta', 'workerDaysBody'].map(at => drawnIn(device, at)).join('|')
                + device.dom.getElementById('workerDaysTitle').textContent + device.dom.getElementById('workerDaysMeta').textContent;
            device.run(`openWorkerSettlement(${JSON.stringify(id)})`);
            out[`${name}: ${id}: his closing`] = drawnIn(device, 'workerDaysBody') + device.dom.getElementById('workerDaysTitle').textContent
                + device.dom.getElementById('workerDaysMeta').textContent + '|' + device.run('REPORT_RANGE.from + ".." + REPORT_RANGE.to');
            // The closing dialog points the picker on an explicit range; put it back.
            const [span, preset] = range.split('|');
            device.run(`REPORT_RANGE.from = ${JSON.stringify(span.split('..')[0])}; REPORT_RANGE.to = ${JSON.stringify(span.split('..')[1])}; REPORT_PRESET = ${JSON.stringify(preset)};`);
        });
    });
    device.run('ADVANCE_WORKER = null; OWES_PAGE = null; ADVANCE_ORDER_DRAFT = null; clear(document.getElementById("advancesView")); renderAdvances();');
    device.weeklyEntries = 0;
    out['«מקדמות»'] = drawnIn(device, 'advancesView');
    device.weeklyDrawn.push(['advances', device.weeklyEntries]);
    men.forEach(id => {
        device.run(`ADVANCE_WORKER = ${JSON.stringify(id)}; clear(document.getElementById("advancesView")); renderAdvances();`);
        device.weeklyEntries = 0;
        out[`«מקדמות»: ${id}`] = drawnIn(device, 'advancesView');
        device.weeklyDrawn.push(['a man', device.weeklyEntries]);
        out[`${id}: his card`] = json(`workerCardFacts(${JSON.stringify(id)})`);
    });
    device.run('ADVANCE_WORKER = null;');
    out['the payslips, this period'] = json('payslipsFacts("current")');
    out['the payslips, the period before'] = json('payslipsFacts("previous")');
    out['the month'] = json(`monthSummaryFacts(${JSON.stringify(TODAY.slice(0, 7))})`);
    out['the month before'] = json(`monthSummaryFacts(${JSON.stringify(addDays(TODAY, -31).slice(0, 7))})`);
    return out;
}

function differences(before, after) {
    const keys = Object.keys(before);
    const wrong = keys.filter(key => before[key] !== after[key]);
    if (Object.keys(after).length !== keys.length) wrong.push('the set of readings');
    return wrong;
}

// The three readings of one disk. `unapproved`: the approval taken off in memory before
// anything is drawn - what a phone whose migration nobody approved reads.
const READINGS = [
    ['the gates shut', SHUT, false],
    ['the gates open', OPEN, false],
    ['the gates open, nobody approved', OPEN, true]
];

// ---------------------------------------------------------------- 1. no figure moved
{
    suite('every figure of the pay sheet and the screens that read it is v195\'s, byte for byte');

    const tally = { records: 0, readings: 0, compared: 0, states: {}, closes: 0, repaid: 0, wrong: [], weekly: { may: 0, mayNot: 0 }, weeklyWrong: [] };
    const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
    for (const seed of SEEDS) {
        const record = seeded(seed, seed % 4 === 0);
        tally.records += 1;
        tally.closes += record.facts.closes;
        tally.repaid += record.facts.repaid;
        for (const [name, flags, unapproved] of READINGS) {
            const pair = [OLD, NOW].map(files => {
                const device = opened(record.disk, flags, files);
                if (unapproved) device.run('State.schedule.ledger.migrations = {}; 1');
                return device;
            });
            pair[0].run(GATE_PER_RECORD);
            const gate = pair[1].call('carryReportingEnabled', pair[1].State.schedule);
            const planned = flags.carryAdvances ? pair[1].call('planCarryMigration', pair[1].State.schedule).needed : null;
            const state = `${name}: ${gate ? 'read the new way' : 'read the old way'}${planned === true ? ', a migration on the record' : ''}`;
            tally.states[state] = (tally.states[state] || 0) + 1;
            const before = everything(pair[0], record.men);
            const after = everything(pair[1], record.men);
            tally.readings += 1;
            tally.compared += Object.keys(before).length;
            differences(before, after).forEach(key => tally.wrong.push(`seed ${seed}, ${name}: ${key}`));
            // «סגירת שבוע»'s button: never in v195; in this build once per draw of «לפי עובד»
            // and of the board on top of «מקדמות», exactly when the record may be closed (the
            // per-man box's own gate), and never on «לפי אתר» or a man's own page.
            const may = pair[1].call('weeklyCloseGateNow') === true;
            const drawn = pair[1].weeklyDrawn;
            tally.weekly[may ? 'may' : 'mayNot'] += 1;
            if ((pair[0].weeklyEntries || 0) !== 0
                || !drawn.every(([section, count]) => count === ((section === 'workers' || section === 'advances') && may ? 1 : 0))) {
                tally.weeklyWrong.push(`seed ${seed}, ${name}: ${JSON.stringify(drawn)}`);
            }
        }
    }
    given('the corpus has closes, repayments and every reading of the gate', tally.closes > 10 && tally.repaid > 3
        && Object.keys(tally.states).some(key => /new way/.test(key)) && Object.keys(tally.states).some(key => /shut.*old way/.test(key))
        && Object.keys(tally.states).some(key => /nobody approved: read the old way/.test(key)), JSON.stringify(tally.states));
    check(`${tally.records} records x ${READINGS.length} readings, ${tally.compared} readings of a screen: every one v195's bytes`,
        tally.wrong.length === 0, tally.wrong.slice(0, 4).join(' | '));
    console.log(`        (${JSON.stringify(tally.states)}; ${tally.closes} closes, ${tally.repaid} repayments)`);
    check(`«סגירת שבוע»'s one button: on «לפי עובד» and «מקדמות» once a draw where the record may be closed (${tally.weekly.may} readings), nowhere where it may not (${tally.weekly.mayNot}), never on «לפי אתר» or a man's page - the only thing taken out of the comparison`,
        tally.weekly.may > 0 && tally.weekly.mayNot > 0 && tally.weeklyWrong.length === 0, tally.weeklyWrong.slice(0, 4).join(' | '));
}

// ---------------------------------------------------------------- a season
//
// Fifteen men over twenty-six weeks, half of them weekly, two advances each - and, where
// asked, one more man with a debt and no daily rate.
function season(noRate) {
    const days = [];
    for (let date = addDays(TODAY, -182); date <= TODAY; date = addDays(date, 1)) {
        if (new Date(`${date}T12:00:00`).getDay() !== 6) days.push(date);
    }
    const disk = written(make => {
        for (let n = 1; n <= 15; n += 1) {
            make.man(`w_${n}`, `עובד ${n}`, n % 2 ? { payCycles: '2026-01-02=weekly' } : {});
            make.work(`w_${n}`, days);
            make.give(`w_${n}`, addDays(TODAY, -170 + n), 1000 + 100 * n);
            make.give(`w_${n}`, addDays(TODAY, -30 + n), 500);
        }
        if (noRate) {
            make.man('w_nr', 'בלי שכר', { dailyRate: 0 });
            make.work('w_nr', days.slice(-20));
            make.give('w_nr', addDays(TODAY, -20), 1000);
        }
    });
    return disk;
}
const approve = device => {
    const plan = device.call('planCarryMigration', device.State.schedule);
    return device.State.commit(device.call('recordCarryApproval', device.State.schedule, plan, '2026-09-01T09:00:00.000Z', 'd_person')) !== false;
};

// The instrument: every REAL call of the plan, the pay sheet and the fold, by argument.
const COUNTER = `var COST = null; (function () {
    const real = { plan: planAdvanceCarry, gate: carryMigrationSettled, sheet: payrollReport, closed: closedPeriods };
    planAdvanceCarry = function () { if (COST) COST.plans += 1; return real.plan.apply(this, arguments); };
    carryMigrationSettled = function () { if (COST) COST.questions += 1; return real.gate.apply(this, arguments); };
    payrollReport = function (schedule, from, to) { if (COST && schedule === State.schedule) COST.sheets.push(from + '..' + to); return real.sheet.apply(this, arguments); };
    closedPeriods = function (schedule, id) { if (COST && schedule === State.schedule) COST.closed.push(String(id)); return real.closed.apply(this, arguments); };
})();
function cost(work) {
    COST = { plans: 0, questions: 0, sheets: [], closed: [] };
    try { work(); } finally { var out = COST; COST = null; }
    const twice = list => list.filter((one, at) => list.indexOf(one) !== at).length;
    return { questions: out.questions, plans: out.plans, sheets: out.sheets.length, sheetsTwice: twice(out.sheets),
        closed: out.closed.length, closedTwice: twice(out.closed) };
} 1`;
const DRAW_SHEET = 'REPORT_SECTION = "workers"; REPORT_WORKERS = null; REPORT_PRESET = "fortnight"; REPORT_RANGE.from = null; REPORT_RANGE.to = null; renderReports();';
const MOVE = 'State.schedule.workers[0].note = String(Math.random()); ';
const WAYS_IN = [
    ['a draw of «דוחות» ← «לפי עובד»', DRAW_SHEET],
    ['a draw of «דוחות» ← «לפי אתר»', 'REPORT_SECTION = "sites"; renderReports(); REPORT_SECTION = "workers";'],
    ['a draw of «מקדמות»', 'ADVANCE_WORKER = null; OWES_PAGE = null; clear(document.getElementById("advancesView")); renderAdvances();'],
    ['a man\'s page of «מקדמות»', 'ADVANCE_WORKER = "w_2"; clear(document.getElementById("advancesView")); renderAdvances(); ADVANCE_WORKER = null;'],
    ['the workbook', 'reportSheets();'],
    ['a man\'s days', 'openWorkerDays("w_2");'],
    ['a man\'s closing', 'openWorkerSettlement("w_2");'],
    ['a man\'s statement', 'workerStatementText("w_2");'],
    ['a worker card', 'workerCardFacts("w_2");'],
    ['the payslips', 'payslipsFacts("current");'],
    ['the month', `monthSummaryFacts("${TODAY.slice(0, 7)}");`],
    // v197: «סגירת שבוע»'s list (js/ui/weeklyclose.js) is read inside the same one reading -
    // the same gate answer, kept under the record between draws - with its own scope inside.
    ['«סגירת שבוע»\'s list', `weeklyCloseRead(State.schedule, todayStr(), "${TODAY}T15:00:00.000Z");`]
];

// ---------------------------------------------------------------- 2. the questions, counted
{
    suite('a draw asks the gate at most once - not at all on an approved record - and each reader once');

    const device = opened(season(false), OPEN, NOW);
    device.run(COUNTER);
    const cost = code => JSON.parse(device.run(`JSON.stringify(cost(() => { ${code} }))`));
    device.run(DRAW_SHEET);

    // Nothing to approve and nothing approved: the gate has to plan. Once a draw, and not
    // again while the record does not move.
    given('this season needs no migration and carries no approval', device.call('planCarryMigration', device.State.schedule).needed === false
        && !((device.State.schedule.ledger || {}).migrations || {}).cm_carry);
    WAYS_IN.forEach(([name, code]) => {
        const moved = cost(MOVE + code);
        same(`nothing approved, the record moved: ${name} plans once at most`, moved.plans <= 1 && moved.questions <= 1, true);
        same(`and drawn again unmoved, not at all`, cost(code).plans, 0);
    });

    check('the approval is recorded', approve(device));
    WAYS_IN.forEach(([name, code]) => {
        const one = cost(MOVE + code);
        same(`approved: ${name} asks the gate's plan not at all`, [one.questions, one.plans], [0, 0]);
        same(`and works out no range's pay sheet twice, and folds no man's closed periods twice`, [one.sheetsTwice, one.closedTwice], [0, 0]);
        if (one.sheetsTwice || one.closedTwice) console.log('        ', name, JSON.stringify(one));
    });
    // What a draw of «לפי עובד» asks is bounded by the men and their periods: the sheet's
    // own ranges, and - in a device with no frame to wait for - the reading of «שים לב» at
    // its head, made in the draw (js/ui/owes.js), whose readers are the same two.
    const sheet = cost(MOVE + DRAW_SHEET);
    check(`a draw of «לפי עובד» on fifteen men: ${sheet.sheets} pay sheets, ${sheet.closed} folds, none twice`,
        sheet.sheets > 0 && sheet.sheets <= 26 + 13 + 6 && sheet.closed <= 15 && sheet.sheetsTwice === 0 && sheet.closedTwice === 0, JSON.stringify(sheet));

    // Before v196 the same draw asked the question over and over.
    const old = opened(device.dump(), OPEN, OLD);
    old.run(COUNTER);
    const was = JSON.parse(old.run(`JSON.stringify(cost(() => { ${MOVE + DRAW_SHEET} }))`));
    check(`v195 asked it ${was.questions} times for the same draw, and planned ${was.plans} times`, was.questions >= 10 && was.plans === was.questions, JSON.stringify(was));

    // The carry shut: nothing is planned at all, by any way in.
    const shut = opened(device.dump(), SHUT, NOW);
    shut.run(COUNTER);
    WAYS_IN.forEach(([name, code]) => {
        same(`the carry shut: ${name} plans nothing`, JSON.parse(shut.run(`JSON.stringify(cost(() => { ${MOVE + code} }))`)).plans, 0);
    });

    // A migration on the record and nobody approved it: once per draw of a moved record.
    const waiting = opened(written(make => {
        make.man('w_d', 'דוד כהן');
        make.work('w_d', ['2026-08-10', '2026-08-11', '2026-08-12']);
        make.give('w_d', '2026-08-10', 5000);
        make.man('w_2', 'יוסי לוי');
        make.work('w_2', ['2026-09-20', '2026-09-21']);
    }), OPEN, NOW);
    waiting.run(COUNTER);
    given('a record whose migration is needed and unapproved', waiting.call('carryReportingEnabled', waiting.State.schedule) === false
        && waiting.call('planCarryMigration', waiting.State.schedule).needed === true);
    same('unapproved, the record moved: a draw of «לפי עובד» plans exactly once',
        JSON.parse(waiting.run(`JSON.stringify(cost(() => { ${MOVE + DRAW_SHEET} }))`)).plans, 1);
    WAYS_IN.forEach(([name, code]) => {
        const moved = JSON.parse(waiting.run(`JSON.stringify(cost(() => { ${MOVE + code} }))`));
        same(`unapproved, the record moved: ${name} plans once at most`, moved.plans <= 1, true);
        same('and drawn again unmoved, not at all', JSON.parse(waiting.run(`JSON.stringify(cost(() => { ${code} }))`)).plans, 0);
    });

    // The functions on the page afterwards are the ones that were there, throw or no throw;
    // and another schedule is never answered from memory.
    const restored = device.run(`(function () {
        const real = [carryReportingEnabled, payrollReport, closedPeriods];
        const rows = payrollRows;
        payrollRows = () => { throw new Error('planted'); };
        let threw = false;
        try { renderReports(); } catch (error) { threw = error.message === 'planted'; }
        payrollRows = rows;
        return [threw, carryReportingEnabled === real[0], payrollReport === real[1], closedPeriods === real[2], REPORT_ONCE === null];
    })()`);
    same('a reader that throws: the three functions on the page afterwards are the ones that were there, and no reading is left open', restored, [true, true, true, true, true]);
    const other = JSON.parse(JSON.stringify(device.State.schedule));
    other.ledger.migrations = {};
    other.advances.a_big = { id: 'a_big', workerId: 'w_1', date: '2026-09-01', amount: 99999, note: '' };
    same('inside a reading, another schedule is asked of the real functions',
        device.run(`(function (other) {
            return reportReadOnce(() => [carryReportingEnabled(State.schedule), carryReportingEnabled(other),
                payrollReport(other, '2026-08-28', '2026-09-10') !== payrollReport(other, '2026-08-28', '2026-09-10'),
                payrollReport(State.schedule, '2026-08-28', '2026-09-10') === payrollReport(State.schedule, '2026-08-28', '2026-09-10')]).join(',');
        })(${JSON.stringify(other)})`), `true,${device.call('carryReportingEnabled', other)},true,true`);
}

// ---------------------------------------------------------------- 3. the short answer
{
    suite('the short answer is the gate\'s answer in every state, and the rule it is read from');

    const shut = opened(season(false), SHUT, NOW);
    const never = opened(season(false), OPEN, NOW);
    const approved = opened(season(false), OPEN, NOW);
    approve(approved);
    const waiting = opened(written(make => {
        make.man('w_d', 'דוד כהן');
        make.work('w_d', ['2026-08-10', '2026-08-11']);
        make.give('w_d', '2026-08-10', 5000);
    }), OPEN, NOW);
    const states = [shut, waiting, approved, never];
    const shortly = device => device.run('REPORT_GATE_KEPT = null; reportGateAnswer(State.schedule, carryReportingEnabled)');
    same('on each of them reportGateAnswer is carryReportingEnabled', states.map(shortly),
        states.map(device => device.call('carryReportingEnabled', device.State.schedule)));
    same('which are the four answers there are', states.map(device => device.call('carryReportingEnabled', device.State.schedule)), [false, false, true, true]);
    same('and it is owesGateAnswer\'s answer too', states.map(device => device.run('owesGateAnswer(State.schedule, carryReportingEnabled)')), states.map(shortly));
    const LEDGER = source('js/model/ledger.js');
    const body = name => { const at = LEDGER.indexOf(`function ${name}(`); return LEDGER.slice(at, LEDGER.indexOf('\n}\n', at)).replace(/\/\/[^\n]*/g, ''); };
    check('the gate is the flag and the settled migration', /return advanceCarryEnabled\(\) && carryMigrationSettled\(schedule\);/.test(body('carryReportingEnabled')));
    check('settled is: nothing to restate, or approved', /if \(!plan\.needed\) return true;\s*return carryMigrationApproved\(schedule, plan\);/.test(body('carryMigrationSettled')));
    same('the approval reads one thing of the plan, its id', (body('carryMigrationApproved').match(/plan\.\w+/g) || []).filter((one, at, all) => all.indexOf(one) === at), ['plan.id']);
    check('and the id is one constant', /return 'cm_carry';/.test(body('carryMigrationId')));
    const REPORTS = NOW['js/ui/reports.js'];
    const key = REPORTS.slice(REPORTS.indexOf('function reportGateKey('), REPORTS.indexOf('\n}\n', REPORTS.indexOf('function reportGateKey(')));
    check('the kept answer\'s key is the tick, today, the flags and the whole record as text',
        /Store\.tick/.test(key) && /todayStr\(\)/.test(key) && /JSON\.stringify\(FARKAD_FLAGS\)/.test(key) && /JSON\.stringify\(schedule\)/.test(key));
}

// ---------------------------------------------------------------- 4. never a stale figure
{
    suite('after every kind of write, the draw is the draw made with every reader asked afresh');

    const device = opened(season(false), OPEN, NOW);
    // A draw with every reader asked afresh: a reading marked open BEFORE the draw, so the
    // entry points run on the real functions, with nothing kept and nothing shared.
    const afresh = code => device.run(`(function () { const was = REPORT_ONCE; REPORT_ONCE = { schedule: State.schedule };
        try { ${code} } finally { REPORT_ONCE = was; } })(); 1`);
    const both = (name, code, ids) => {
        device.run(code);
        const kept = ids.map(id => drawnIn(device, id)).join('|');
        afresh(code);
        const fresh = ids.map(id => drawnIn(device, id)).join('|');
        check(name, kept === fresh, kept === fresh ? '' : 'the draw differs from a fresh one');
        return kept;
    };
    const sheetCode = DRAW_SHEET;
    const listCode = 'ADVANCE_WORKER = null; OWES_PAGE = null; clear(document.getElementById("advancesView")); renderAdvances();';
    const all = name => {
        const sheet = both(`${name}: «דוחות» is the record's`, sheetCode, ['reportsView']);
        both(`${name}: «מקדמות» is the record's`, listCode, ['advancesView']);
        both(`${name}: a man's days are the record's`, 'openWorkerDays("w_3");', ['workerDaysTitle', 'workerDaysMeta', 'workerDaysBody']);
        const card = device.run('JSON.stringify(workerCardFacts("w_3"))');
        const freshCard = device.run('(function () { const was = REPORT_ONCE; REPORT_ONCE = { schedule: State.schedule }; try { return JSON.stringify(workerCardFacts("w_3")); } finally { REPORT_ONCE = was; } })()');
        check(`${name}: his card is the record's`, card === freshCard);
        return sheet;
    };
    const first = all('before anything');

    // Nothing approved yet: the gate's answer is kept between draws, under the record.
    given('nothing approved on the record', !((device.State.schedule.ledger || {}).migrations || {}).cm_carry);
    const dayDrawn = all('before a day is typed');
    given('a day is typed', device.State.commit(device.call('assignPlace', device.State.schedule, TODAY, 'w_3', 'actual', 'p_x', 'double')) !== false);
    check('a day typed: the sheet moved', all('a day typed') !== dayDrawn);

    // THE KEPT ANSWER, MOVED UNDER IT WITHOUT A WRITE. Nothing approved, so the gate's answer
    // is the plan's, kept between draws: an advance larger than any wage put on the record in
    // memory - no write, no tick - puts a migration on it and the gate shuts. The kept answer
    // is the record's.
    const tickNow = device.run('Store.tick');
    given('the gate is open before', device.call('carryReportingEnabled', device.State.schedule) === true);
    device.run(`State.schedule.advances.a_memory = { id: 'a_memory', workerId: 'w_1', date: '${addDays(TODAY, -20)}', amount: 50000, note: '' }; 1`);
    given('with it, in memory only, the gate shuts and the tick stays', device.call('carryReportingEnabled', device.State.schedule) === false
        && device.run('Store.tick') === tickNow);
    all('an advance put in memory, nothing approved');
    device.run('delete State.schedule.advances.a_memory; 1');
    all('and taken out');

    given('an advance is written the way the form writes it', device.State.commitMany(device.call('recordNewAdvance', device.State.schedule, 'w_3', TODAY, 700, '',
        `${TODAY}T10:00:00.000Z`, 'd_office', 'cash')) !== false);
    all('an advance');

    const worker = device.State.schedule.workers.filter(one => one.id === 'w_3')[0];
    // The account his second advance was handed over in.
    const span = device.call('periodRangeFor', worker, addDays(TODAY, -27));
    device.run(`function testClose(list, at) {
        return saveFinancialAction(() => list.reduce((all, one) => all.concat(
            closePeriodChanges(State.schedule, one[0], one[1], one[2], at, 'd_office', one[3])), []));
    }`);
    given('that account is closed with 300 off (which records the approval with it)',
        device.run(`testClose(${JSON.stringify([['w_3', span.from, span.to, 300]])}, '${TODAY}T11:00:00.000Z')`) === true,
        JSON.stringify(device.call('planPeriodClosure', device.State.schedule, 'w_3', span.from, span.to, `${TODAY}T11:00:00.000Z`, 300).reasons));
    all('a close');

    const advance = device.call('advancesFor', device.State.schedule, 'w_3', '0000-01-01', '9999-12-31')[0];
    given('200 is handed back', device.run(`saveFinancialAction(() => recordAdvanceRepaid(State.schedule, ${JSON.stringify(advance.id)}, 200, '${TODAY}', '', '${TODAY}T12:00:00.000Z', 'd_office', 'cash'))`) === true);
    all('a repayment');

    // The roster's own way: the man changed, then State.commitRoster (js/ui/roster.js).
    given('his daily rate changes, the way the roster writes it', (() => { worker.dailyRate = 700; return device.State.commitRoster() !== false; })());
    all('a rate changed');

    const tick = device.run('Store.tick');
    device.run('State.schedule.workers.filter(one => one.id === "w_4")[0].dailyRate = 0; 1');
    given('memory changed by no write: the tick did not move', device.run('Store.tick') === tick);
    all('a change in memory no write carried');
    device.run('State.schedule.workers.filter(one => one.id === "w_4")[0].dailyRate = 610; 1');

    device.run('var APPROVAL = State.schedule.ledger.migrations; State.schedule.ledger.migrations = {}; 1');
    all('the approval removed');
    device.run('State.schedule.ledger.migrations = APPROVAL; 1');
    all('the approval restored');

    device.setToday(addDays(TODAY, 15));
    const turned = all('the day turned');
    check('and a fortnight later the default account is another one', turned !== first);
    device.setToday(TODAY);
}

// ---------------------------------------------------------------- 5. the bound
{
    suite('a draw of a moved record costs less than one question of the gate did');

    const device = opened(season(true), OPEN, NOW);
    check('the approval is recorded', approve(device));
    device.run(DRAW_SHEET);
    const timed = code => { const began = performance.now(); device.run(code); return performance.now() - began; };
    const question = timed('planCarryMigration(State.schedule)');
    const draws = [0, 1, 2].map(() => timed(MOVE + DRAW_SHEET));
    const best = Math.min(...draws);
    check(`with a man who has a debt and no rate: one question ${question.toFixed(0)}ms, a draw of «דוחות» ${best.toFixed(0)}ms (v195 asked the question 16 times a draw)`,
        best < question, JSON.stringify(draws));
}

report();
