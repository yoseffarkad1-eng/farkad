// «יום תשלום» (js/ui/payday.js) on devices in Node.
//
//   node tests/payday.test.mjs
//
// The payday desk is a READING: one dialog for the moment before he pays, opened from
// «מקדמות», that works no money out and writes nothing. This suite holds, on real devices of
// this build and on records written by the app's own writers:
//
//   P1  EACH CARD'S THREE FIGURES ARE THE BAND «דוחות» DRAWS for that group on its default -
//       «נצבר», the deduction and «לתשלום», as text, read off the sheet drawn in a Node DOM (the
//       work table's footer, or «סיכום התקופה» where the group has a man with money and no
//       day) - the groups in the sheet's own order; under both readings of the gate.
//   P2  EACH MAN'S FIGURE is moneyOf of the sheet's row; on a Thursday whose period ends today
//       it is also «סגירת שבוע»'s own net at the most it proposes, for every man it offers -
//       except a man with a deduction chosen on the sheet, whose figure is the sheet's under
//       the choice while his card says so (revision 2).
//   P3  «לסגירה» is the close reminder's count of «סגירת שבוע»'s list, and the men it holds -
//       read by the desk itself: the section drawn byte for byte the same with a fresh
//       CLOSE_REMINDER_KEPT and without one (revision 2).
//   P4  EVERY CHECK fires on the fixture made for it and is silent on one that is not; its
//       words word for word; every door - the drawn button itself - only navigates: no
//       commit, no close, no repayment, no financial write, the disk byte for byte; a door
//       to a dialog opens it in the task of the press, a door to anything else runs in the
//       next task (revision 2).
//   P5  A WEEK WALKED DAY BY DAY and a fortnight's Thursday: the groups, «היום, » on the last
//       day, the days recorded ahead, the sentence that two paydays on one date are not added.
//   P6  THE MEMORY AGREES: the reading inside the pay sheet's and «סגירת שבוע»'s scopes equals
//       the bare reading, both gate readings; the report's filter, range and chosen deductions,
//       and every swapped function, are back after a throw inside it.
//   P7  THE GATE: asked at most once a reading; never planned on an approved record.
//   P8  THE COST: on a season closed in order and on one nobody closes (medians printed); a draw
//       of «מקדמות» reads nothing of this file; a second opening of a record that did not move
//       reads nothing; a record that moved under the open desk is read again.
//   P9  GATE SHUT AND UNAPPROVED: the plain bands (the sheet's then), no check of the new
//       arithmetic, «לסגירה» and «אחרי הסגירה» replaced by «מקדמות»'s own sentence.
//   P10 THE DISK BYTE FOR BYTE across the reading, the opening, every door and the closing.
//   P11 THE WORDS: every PROPOSED word pinned, every BORROWED word found in its owner, no
//       Arabic letter, and what the file may not do.
//   P12 THE ROW ON «מקדמות»: the two buttons in one row; the button alone where «סגירת שבוע» is
//       not drawn; and a build without the file draws the page exactly as before.
//   P13 THE TRANSITION SENTENCE only of a stub that weekly pay follows; a stub the fortnight
//       follows shows its dates alone (revision 2).
//
// Synthetic names and money throughout. No browser, no emulator.

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
const PAYDAY = source('js/ui/payday.js');

// The screens the desk reads through, in index.html's order; payday.js after advancereset's
// place (weeklyclose.js) and closereminder.js after it, as in the page.
const UI = ['js/ui/sitecolor.js', 'js/ui/reports.js', 'js/ui/workercard.js', 'js/ui/seder.js', 'js/ui/payslips.js',
    'js/ui/daycheck.js', 'js/ui/monthsummary.js', 'js/ui/owes.js', 'js/ui/weeklyclose.js', 'js/ui/payday.js',
    'js/ui/closereminder.js'];

const OPEN = { carryAdvances: true, ledgerWrites: true };
const SHUT = { carryAdvances: false, ledgerWrites: false };
const NOWRITE = { carryAdvances: true, ledgerWrites: false };
const TODAY = '2026-11-18';                      // a Wednesday: the week ends tomorrow, the fortnight next Thursday
const j = value => JSON.stringify(value);
const bare = text => String(text === undefined || text === null ? '' : text).replace(/[⁦-⁩‎‏]/g, '');
const addDays = (date, days) => {
    const [y, m, d] = date.split('-').map(Number);
    const at = new Date(y, m - 1, d + days, 12);
    return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`;
};
const weekdays = (from, to) => {
    const out = [];
    for (let date = from; date <= to; date = addDays(date, 1)) {
        if (new Date(`${date}T12:00:00`).getDay() !== 6) out.push(date);
    }
    return out;
};

async function block(name, body) {
    suite(name);
    try {
        await body();
    } catch (error) {
        check(`${name}: the block ran to its end`, false,
            String((error && error.stack) || error).split('\n').slice(0, 4).join(' | '));
    }
}

// ---------------------------------------------------------------- a phone
//
// A device with a DOM that holds text, children and classes (tests/moneydom.mjs), so that
// «דוחות», «מקדמות» and the desk itself can be drawn and READ, and whose buttons keep their
// listeners, so that a drawn door can be pressed. The desk's frame is index.html's.
function frame(dom) {
    const modal = dom.register('paydayModal');
    const content = dom.createElement('div');
    content.className = 'modal-content modal-wide';
    modal.appendChild(content);
    ['paydayTitle', 'paydayBody', 'paydayClose'].forEach(id => content.appendChild(dom.register(id)));
}

function phone({ storage = null, flags = OPEN, today = TODAY, deviceId = 'd_office' } = {}) {
    const options = { deviceId, flags };
    if (storage) options.storage = storage;
    const d = makeDevice(options);
    const dom = makeDom();
    ['reportsView', 'advancesView', 'workerDaysTitle', 'workerDaysMeta', 'workerDaysBody', 'workerDaysModal'].forEach(id => dom.register(id));
    const make = dom.createElement;
    dom.createElement = tag => {
        const node = make(tag);
        node.dataset = {};
        node.listeners = {};
        node.addEventListener = (type, heard) => { (node.listeners[type] = node.listeners[type] || []).push(heard); };
        return node;
    };
    dom.createElementNS = (ns, tag) => dom.createElement(tag);
    frame(dom);
    d.dom = dom;
    d.ctx.document = dom;
    d.run = code => vm.runInContext(code, d.ctx, { filename: 'payday-suite' });
    UI.forEach(file => d.run(source(file)));
    d.run('var currentView = "advances";');
    d.views = [];
    d.ctx.showView = view => { d.views.push(view); d.run(`currentView = ${j(view)}`); };
    d.ctx.askTell = () => Promise.resolve();
    d.ctx.askConfirm = () => Promise.resolve(true);
    d.ctx.openSettings = () => {};
    d.setToday(today);
    if (storage) d.State.load();
    return d;
}

const press = node => (node.listeners && node.listeners.click || []).forEach(heard => heard({ preventDefault() {}, target: node }));
const at = d => `${d.ctx.todayStr()}T15:00:00.000Z`;
const facts = d => d.call('paydayFacts', d.ctx.todayStr(), at(d));
const fresh = d => d.run('OWES_KEPT = null; REPORT_GATE_KEPT = null; PAYDAY_KEPT = null; 1');
const card = (f, key) => f.groups.filter(group => group.key === key)[0] || null;
const fig = (group, kind) => group.figures.filter(one => one.kind === kind)[0].value;
const kinds = f => f.checks.map(one => one.kind);
const disk = d => j(d.dump());

// ---------------------------------------------------------------- seeding through the app's own writers
const PLACES = [{ id: 'p_01', name: 'אתר צפון', active: true }, { id: 'p_02', name: 'אתר דרום', active: true }];
function day(d, id, date, rate, hours) {
    const change = d.call('assignPlace', d.State.schedule, date, id, 'actual', 'p_01', rate || 'normal', hours);
    if (!change || change.refused) throw new Error(`a day for ${id} on ${date}`);
}
function advance(d, id, date, amount) {
    return d.call('recordNewAdvance', d.State.schedule, id, date, amount, '', `${date}T07:00:00.000Z`, 'd_seed', 'cash')[0].value.id;
}
function approve(d) {
    const plan = d.call('planCarryMigration', d.State.schedule);
    if (!d.call('carryMigrationApproved', d.State.schedule, plan)) {
        d.call('recordCarryApproval', d.State.schedule, plan, '2026-10-01T09:00:00.000Z', 'd_person');
    }
}
function byHand(d, id, from, to, deduction, when) {
    const made = d.call('closePeriodChanges', d.State.schedule, id, from, to, when, 'd_seed', deduction);
    if (!Array.isArray(made) || !made.length) throw new Error(`a close for ${id} ${from}..${to}`);
    return made;
}
function kept(d) {
    if (d.State.save({ silent: true }) !== true) throw new Error('the seeded record was not saved');
    return d;
}
// The same disk, opened again by a phone of this build - with other flags where asked.
const reopen = (d, flags = OPEN, today) => phone({ storage: d.dump(), flags, today: today || d.ctx.todayStr() });

// THE CREW THAT HAS EVERYTHING. Eight invented men, days from Friday 30 October:
//   ואליד, באסל  weekly; ואליד takes 600 on Monday 16/11, in his current week
//   פואד         fortnightly; 1,500 on 03/11 in the fortnight that ended 12/11, which nobody
//                closed - the sheet presumes it came off that wage; the ledger says he owes it
//   גסאן         fortnightly; two extra hours on 16/11 and no hourly rate
//   כמאל         fortnightly, NO daily rate, days from 13/11
//   טארק         a boundary on Friday 20/11 (to weekly): his fortnight is cut, a period of his own
//                that ends Thursday 19/11 - the transition
//   עומר         fortnightly; 500 on 16/11, handed back in full TWICE (two phones): over-settled
//   סמיר         fortnightly; worked until 12/11 only; 300 on 16/11: money and no day this period
// `until`: the last day recorded for everybody (today by default).
function everything({ today = TODAY, until = today, flags = OPEN } = {}) {
    const d = phone({ today, flags });
    d.State.schedule.workers = [
        { id: 'w_wa', name: 'ואליד', active: true, dailyRate: 400, hourlyRate: 0, payCycles: '2026-08-07=weekly' },
        { id: 'w_wb', name: 'באסל', active: true, dailyRate: 450, hourlyRate: 0, payCycles: '2026-08-07=weekly' },
        { id: 'w_fa', name: 'פואד', active: true, dailyRate: 500, hourlyRate: 0 },
        { id: 'w_fb', name: 'גסאן', active: true, dailyRate: 450, hourlyRate: 0 },
        { id: 'w_nr', name: 'כמאל', active: true, dailyRate: 0, hourlyRate: 0 },
        { id: 'w_tr', name: 'טארק', active: true, dailyRate: 420, hourlyRate: 0, payCycles: '2026-11-20=weekly' },
        { id: 'w_ov', name: 'עומר', active: true, dailyRate: 420, hourlyRate: 0 },
        { id: 'w_fin', name: 'סמיר', active: true, dailyRate: 430, hourlyRate: 0 }
    ];
    d.State.schedule.places = PLACES;
    weekdays('2026-10-30', until).forEach(date => {
        ['w_wa', 'w_wb', 'w_fa', 'w_tr', 'w_ov'].forEach(id => day(d, id, date));
        if (date === '2026-11-16') day(d, 'w_fb', date, 'extra', 2); else day(d, 'w_fb', date);
        if (date >= '2026-11-13') day(d, 'w_nr', date);
        if (date <= '2026-11-12') day(d, 'w_fin', date);
    });
    advance(d, 'w_wa', '2026-11-16', 600);
    advance(d, 'w_fa', '2026-11-03', 1500);
    const over = advance(d, 'w_ov', '2026-11-16', 500);
    advance(d, 'w_fin', '2026-11-16', 300);
    if (flags.carryAdvances) {
        approve(d);
        d.call('recordAdvanceRepaid', d.State.schedule, over, 500, '2026-11-17', '', '2026-11-17T08:00:00.000Z', 'd_A', 'cash');
        d.call('recordAdvanceRepaid', d.State.schedule, over, 500, '2026-11-17', '', '2026-11-17T08:05:00.000Z', 'd_B', 'cash');
    }
    return kept(d);
}

// THE CLEAN CREW: a weekly man and a fortnightly one, every day priced, no hours, every ended
// period closed in order, the only advance in the current week - nothing for the desk to say.
function clean({ today = TODAY, until = today } = {}) {
    const d = phone({ today });
    d.State.schedule.workers = [
        { id: 'w_c1', name: 'נביל', active: true, dailyRate: 400, hourlyRate: 0, payCycles: '2026-08-07=weekly' },
        { id: 'w_c2', name: 'ראמז', active: true, dailyRate: 500, hourlyRate: 0 }
    ];
    d.State.schedule.places = PLACES;
    weekdays('2026-10-30', until).forEach(date => ['w_c1', 'w_c2'].forEach(id => day(d, id, date)));
    approve(d);
    byHand(d, 'w_c1', '2026-10-30', '2026-11-05', undefined, '2026-11-05T15:00:00.000Z');
    byHand(d, 'w_c1', '2026-11-06', '2026-11-12', undefined, '2026-11-12T15:00:00.000Z');
    byHand(d, 'w_c2', '2026-10-30', '2026-11-12', undefined, '2026-11-12T15:05:00.000Z');
    advance(d, 'w_c1', '2026-11-16', 300);
    return kept(d);
}

// «דוחות» as it opens - «לפי עובד», the default account - drawn in the Node DOM, and each
// group's band read off it: its cycle, its dates (from its heading, where the page names
// them), which band it is, and a cell by its label.
function sheetBands(d) {
    d.run('REPORT_SECTION = "workers"; REPORT_WORKERS = null; REPORT_PRESET = "fortnight"; REPORT_RANGE.from = null; '
        + 'REPORT_RANGE.to = null; REPORT_CARD_GRID = true; INVOICE_PLACE = null; renderReports(); 1');
    const section = d.dom.getElementById('reportsView').querySelectorAll('.report-payroll')[0];
    const groups = [];
    let current = null;
    section.children.forEach(node => {
        if (node.tagName === 'H3' && node.getAttribute('data-cycle')) {
            const m = /(\d\d)\/(\d\d)\/(\d{4}) - (\d\d)\/(\d\d)\/(\d{4})/.exec(bare(node.textContent));
            current = { cycle: node.getAttribute('data-cycle'), span: m ? [`${m[3]}-${m[2]}-${m[1]}`, `${m[6]}-${m[5]}-${m[4]}`] : null, nodes: [] };
            groups.push(current);
        } else if (current) current.nodes.push(node);
    });
    return groups.map(group => {
        const reconcile = group.nodes.filter(node => node.classList.contains('report-reconcile-group'))[0] || null;
        const work = group.nodes.filter(node => node.classList.contains('report-payroll-group'))[0] || null;
        const holder = reconcile || work;
        const foot = holder ? holder.querySelectorAll('TFOOT')[0] : null;
        const cells = foot ? foot.querySelectorAll('TD') : [];
        const cell = label => {
            const found = cells.filter(one => one.getAttribute('data-label') === label)[0];
            return found ? found.textContent : null;
        };
        return { cycle: group.cycle, span: group.span, form: reconcile ? 'reconcile' : (work ? 'work' : 'none'), cell,
            first: cells.length ? cells[0].textContent : null };
    });
}

// The desk's cards held against the sheet's bands, figure by figure, as text. Answers the
// pairs compared, so that the caller can say how many there were.
function bandsAgree(label, d, f) {
    const bands = sheetBands(d).filter(band => band.form !== 'none');
    same(`${label}: the desk's groups are the sheet's, in the sheet's order`,
        f.groups.map(group => [group.cycle, group.from, group.to]),
        bands.map(band => [band.cycle].concat(band.span || [f.groups[0] && f.groups[0].from, f.groups[0] && f.groups[0].to])));
    let compared = 0;
    f.groups.forEach(group => {
        const band = bands.filter(one => one.cycle === group.cycle && (!one.span || (one.span[0] === group.from && one.span[1] === group.to)))[0];
        if (!band) { check(`${label}: ${group.key}: the sheet draws its band`, false); return; }
        const gross = band.cell('נצבר');
        const net = band.cell('לתשלום');
        const taken = band.cell(group.label);
        same(`${label}: ${group.key} (${band.form}): «נצבר» is the band's`, fig(group, 'gross'), gross === null ? '—' : gross);
        same(`${label}: ${group.key} (${band.form}): «לתשלום» is the band's`, fig(group, 'pay'), net === null ? '—' : net);
        if (taken !== null) {
            // The sheet blanks a nought in its cells (reportCell); the desk says 0.
            same(`${label}: ${group.key} (${band.form}): «${group.label}» is the band's`, fig(group, 'taken'), taken === '' ? '0' : taken);
        } else {
            // No such column on the work table (nobody was handed an advance IN the period, while
            // a carried debt still came off): the band's own two printed figures differ by it.
            same(`${label}: ${group.key} (${band.form}, no deduction column): the deduction is «נצבר» less «לתשלום»`,
                group.taken, Math.round((Number(bare(gross)) - Number(bare(net))) * 100) / 100);
        }
        same(`${label}: ${group.key}: the count line is the band's first cell`, group.count, band.first);
        compared += 1;
    });
    return compared;
}

// The sheet's rows on its default and each man's «לתשלום» (moneyOf), as the sheet reads them.
function sheetNets(d) {
    return JSON.parse(d.run(`JSON.stringify(reportReadOnce(() => {
        REPORT_PRESET = "fortnight"; REPORT_WORKERS = null;
        const range = defaultPayrollRange(); REPORT_RANGE.from = range.from; REPORT_RANGE.to = range.to;
        return payrollRows().map(row => [String(row.workerId), moneyOf(row).net]);
    }))`));
}
const deskNets = f => f.groups.reduce((all, group) => all.concat(group.rows.map(row => [row.workerId, row.net])), []);

// ================================================================== P1 the bands
await block('P1 each card\'s three figures are the band «דוחות» draws for that group, under both gate readings', async () => {
    const d = everything();
    const open = reopen(d, OPEN);
    given('the record carries the approval and the gate is open', open.call('carryReportingEnabled', open.State.schedule) === true);
    const f = facts(open);
    same('three groups: the week, the fortnight, the man the boundary cut short', f.groups.map(group => group.key),
        ['weekly|2026-11-13|2026-11-19', 'biweekly|2026-11-13|2026-11-26', 'biweekly|2026-11-13|2026-11-19']);
    const n = bandsAgree('gate open', open, f);
    check('every card was held against a band', n === 3, String(n));
    // The two band forms are both exercised: the work table's footer and «סיכום התקופה».
    const forms = sheetBands(open).map(band => band.form);
    check('the sheet drew both forms of the band here', forms.indexOf('work') !== -1 && forms.indexOf('reconcile') !== -1, j(forms));
    const week = card(f, 'weekly|2026-11-13|2026-11-19');
    // Five days each (Friday, Sunday to Wednesday): 5 x 400 + 5 x 450; ואליד's 600 presumed off in full.
    same('the week: «נצבר», the deduction and «לתשלום» (נוכה מהשכר, presumed in full)', week.figures.map(one => [one.label, bare(one.value)]),
        [['נצבר', '4250'], ['נוכה מהשכר', '-600'], ['לתשלום', '3650']]);

    const shut = reopen(d, SHUT);
    given('the same disk with the carry shut reads the old way', shut.call('carryReportingEnabled', shut.State.schedule) === false);
    const g = facts(shut);
    bandsAgree('gate shut', shut, g);
    same('gate shut: the deduction is called «מקדמות» on every card', g.groups.map(group => group.label), ['מקדמות', 'מקדמות', 'מקדמות']);

    // A deduction chosen on the sheet this session moves the desk with the sheet.
    const chosen = reopen(d, OPEN);
    chosen.run('REPORT_DEDUCTIONS.set(reportDeductionKey("w_wa", "2026-11-13", "2026-11-19"), 200); 1');
    const h = facts(chosen);
    bandsAgree('a deduction chosen on the sheet', chosen, h);
    same('the week with 200 chosen for ואליד instead of 600', card(h, 'weekly|2026-11-13|2026-11-19').figures.map(one => bare(one.value)),
        ['4250', '-200', '4050']);
});

// ================================================================== P2 each man
await block('P2 each man\'s figure is the sheet\'s; on a Thursday it is «סגירת שבוע»\'s own net for every man it offers', async () => {
    for (const [name, flags] of [['gate open', OPEN], ['gate shut', SHUT]]) {
        const d = reopen(everything(), flags);
        const f = facts(d);
        const sheet = {};
        sheetNets(d).forEach(([id, net]) => { sheet[id] = net; });
        const desk = deskNets(f);
        same(`${name}: every man with a row on the sheet has his figure on the desk, and nobody else`,
            desk.map(([id]) => id).sort(), Object.keys(sheet).sort());
        same(`${name}: each man's figure is moneyOf of his row on the sheet`, desk.map(([id, net]) => [id, net]),
            desk.map(([id]) => [id, sheet[id]]));
    }
    const d = reopen(everything(), OPEN);
    const f = facts(d);
    same('a man the sheet cannot price says «—», and his net is unknown, not nought',
        card(f, 'biweekly|2026-11-13|2026-11-26').rows.filter(row => row.workerId === 'w_nr').map(row => [row.net, row.said]), [[null, '—']]);

    // Thursday 19/11, today recorded for everybody: the week and the cut fortnight end today.
    const t = reopen(everything({ today: '2026-11-19' }), OPEN);
    const tf = facts(t);
    const read = t.call('weeklyCloseRead', t.State.schedule, '2026-11-19', at(t));
    const today = tf.groups.filter(group => group.today);
    same('two cards end today: the week and the cut fortnight', today.map(group => group.key),
        ['weekly|2026-11-13|2026-11-19', 'biweekly|2026-11-13|2026-11-19']);
    const offered = read.men.filter(man => !man.held && man.to === '2026-11-19');
    same('«סגירת שבוע» offers the three men of those two periods', offered.map(man => man.id), ['w_wa', 'w_wb', 'w_tr']);
    const net = id => deskNets(tf).filter(([who]) => who === id)[0][1];
    offered.forEach(man => {
        same(`${man.name}: the desk's figure is weeklyCloseFigures(man, man.max).net`, net(man.id),
            t.call('weeklyCloseFigures', man, man.max).net);
    });

    // EXCEPT A MAN WITH A DEDUCTION CHOSEN ON THE SHEET (revision 2). His row follows the sheet's
    // choice; «סגירת שבוע» starts from the full deduction - the two differ by design. For him the
    // desk's figure is the sheet's under the choice, and his card says that a choice is in it.
    const c = reopen(everything({ today: '2026-11-19' }), OPEN);
    c.run('REPORT_DEDUCTIONS.set(reportDeductionKey("w_wa", "2026-11-13", "2026-11-19"), 200); 1');
    const cf = facts(c);
    const chosenRead = c.call('weeklyCloseRead', c.State.schedule, '2026-11-19', at(c));
    const chosenOffered = chosenRead.men.filter(man => !man.held && man.to === '2026-11-19');
    same('200 chosen on the sheet for ואליד: «סגירת שבוע» offers the same three men', chosenOffered.map(man => man.id), ['w_wa', 'w_wb', 'w_tr']);
    const chosenNet = id => deskNets(cf).filter(([who]) => who === id)[0][1];
    chosenOffered.filter(man => man.id !== 'w_wa').forEach(man => {
        same(`${man.name}, nothing chosen for him: still «סגירת שבוע»'s own net`, chosenNet(man.id), c.call('weeklyCloseFigures', man, man.max).net);
    });
    const under = {};
    sheetNets(c).forEach(([id, value]) => { under[id] = value; });
    const wa = chosenOffered.filter(man => man.id === 'w_wa')[0];
    // Six days of 400 (Friday, Sunday to Thursday): 2,400; 200 chosen leaves 2,200, the full 600 1,800.
    same('ואליד: his figure is the sheet\'s under the choice (2,400 less 200)', [chosenNet('w_wa'), under.w_wa], [2200, 2200]);
    same('ואליד: «סגירת שבוע» starts from the full 600 - a different figure, by design', [wa.max, c.call('weeklyCloseFigures', wa, wa.max).net],
        [600, 1800]);
    check('ואליד\'s card says that a deduction chosen on the sheet is in it, and that «סגירת שבוע» starts from the full one',
        card(cf, 'weekly|2026-11-13|2026-11-19').lines.indexOf('לחלק מהעובדים נבחר בדוח ניכוי אחר, והוא כלול כאן. «סגירת שבוע» מתחילה מהניכוי המלא.') !== -1,
        j(card(cf, 'weekly|2026-11-13|2026-11-19').lines));
});

// ================================================================== P3 the count
await block('P3 «לסגירה» is the close reminder\'s count of «סגירת שבוע»\'s list, and the men it holds', async () => {
    for (const [name, make] of [['the crew with everything', () => everything()], ['on its Thursday', () => everything({ today: '2026-11-19' })],
        ['the clean crew', () => clean()], ['Thursday morning, today not written', () => everything({ today: '2026-11-19', until: '2026-11-18' })]]) {
        const d = reopen(make(), OPEN);
        const f = facts(d);
        const read = d.call('weeklyCloseRead', d.State.schedule, d.ctx.todayStr(), at(d));
        same(`${name}: the count is closeReminderCount(weeklyCloseRead)`, f.close.count, d.call('closeReminderCount', read));
        same(`${name}: the men it holds are those with held set, in its order`, f.close.held.map(man => man.id),
            read.men.filter(man => man.held).map(man => man.id));
        same(`${name}: each held man is said in «סגירת שבוע»'s own sentence`, f.close.held.map(man => man.why),
            read.men.filter(man => man.held).map(man => d.call('weeklyCloseHeldText', man)));
    }
    const morning = reopen(everything({ today: '2026-11-19', until: '2026-11-18' }), OPEN);
    const m = facts(morning);
    check('Thursday morning: the men whose week ends today and is not written are held («נגמרת היום»)',
        m.close.held.filter(man => /נגמרת היום/.test(man.why)).map(man => man.id).sort().join() === 'w_tr,w_wa,w_wb', j(m.close.held));
    // Six offered on Wednesday: both weekly men and four fortnightly (כמאל did not work in the
    // fortnight that ended; עומר is held for his over-settled advance).
    same('the line is the owner\'s sentence for that count', facts(reopen(everything(), OPEN)).close.say,
        'יש 6 עובדים שהחשבון שלהם עוד לא נסגר');
    same('the clean crew: nobody to close, «סגירת שבוע»\'s own sentence, and no door', [facts(reopen(clean(), OPEN)).close.say,
        facts(reopen(clean(), OPEN)).close.door], ['אין עכשיו חשבונות לסגור.', null]);

    // REVISION 2: «לסגירה» IS ALWAYS READ BY THE DESK ITSELF, never taken from CLOSE_REMINDER_KEPT
    // (which keeps a count and no men): the same record shows the same held men whatever the
    // reminder happened to read first. The section, drawn, node for node and word for word -
    // with a fresh CLOSE_REMINDER_KEPT on this very record, and without one.
    const shape = node => ({ tag: node.tagName, cls: node.className, data: Object.assign({}, node.dataset || {}),
        attrs: Object.assign({}, node.attributes), text: node._text, kids: node.children.map(shape) });
    const section = d => {
        d.call('openPayday');
        const drawn = d.dom.getElementById('paydayBody').querySelectorAll('.payday-close');
        const out = drawn.length ? j(shape(drawn[0])) : null;
        d.call('closePayday');
        return out;
    };
    for (const [name, make] of [['the crew with everything', () => everything()],
        ['Thursday morning, today not written', () => everything({ today: '2026-11-19', until: '2026-11-18' })],
        ['the clean crew', () => clean()]]) {
        const made = make();
        const disk0 = made.dump();
        const alone = phone({ storage: disk0, flags: OPEN, today: made.ctx.todayStr() });
        given(`${name}: no reminder has read anything on the first phone`, alone.run('CLOSE_REMINDER_KEPT') === null);
        const without = section(alone);
        const after = phone({ storage: disk0, flags: OPEN, today: alone.ctx.todayStr() });
        after.call('closeReminderRefresh', 'boot');
        const keptNow = JSON.parse(after.run('JSON.stringify(CLOSE_REMINDER_KEPT)'));
        given(`${name}: on the second the reminder read first, fresh for this record`, keptNow !== null
            && keptNow.key === after.call('closeReminderKey', after.State.schedule, after.ctx.todayStr()), j(keptNow && keptNow.count));
        const withKept = section(after);
        check(`${name}: «לסגירה» is drawn`, without !== null);
        same(`${name}: «לסגירה» byte for byte the same with a fresh CLOSE_REMINDER_KEPT and without one`, withKept, without);
    }
    check('and payday.js never names CLOSE_REMINDER_KEPT', !/CLOSE_REMINDER_KEPT/.test(PAYDAY.replace(/\/\/[^\n]*/g, '')));
});

// ================================================================== P4 the checks and their doors
//
// THE BORROWED SENTENCES, as their owners have them (P11 finds each in its owner's source).
const NOT_SYNCED = 'סוגרים חשבונות רק כשמופיע «מסונכרן בין המכשירים» - כך שני טלפונים לא יסגרו את אותו חשבון בסכומים שונים.';
const HOURS_NOTE = '* שעות נוספות בלי שכר שעה - לא נכללו בסכום.';
const REVIEW_500 = '⚠️ החשבון דורש בדיקה · ההחזרים עולים על החוב הפתוח ב-500 ₪ · אין לאשר את התשלום אוטומטית';
const CHECK_FIRST = 'לפני רישום החזרים או קיזוז צריך לבדוק את יתרות המקדמות הקיימות.';

// The writers a door must never reach, and the openers of the two screens a door opens,
// recorded; everything else a door calls is the app's own navigation, run for real.
function instrument(d) {
    d.run(`
        var __writes = [];
        var __calls = [];
        var __dayChosen = 0;
        (function () {
            const commit = State.commit;
            const many = State.commitMany;
            State.commit = function () { __writes.push('State.commit'); return commit.apply(State, arguments); };
            State.commitMany = function () { __writes.push('State.commitMany'); return many.apply(State, arguments); };
            ['closePeriodChanges', 'saveFinancialAction', 'recordAdvanceRepaid', 'recordNewAdvance', 'appendLedgerEntry'].forEach(name => {
                const real = window[name];
                window[name] = function () { __writes.push(name); return real.apply(this, arguments); };
            });
            ['openWeeklyClose', 'openPayslips'].forEach(name => {
                window[name] = function () { __calls.push([name].concat([].slice.call(arguments))); return true; };
            });
            window.dayChosenByHand = function () { __dayChosen += 1; };
        })();
        1`);
    return d;
}

// Opens the desk, presses its n-th door, and says what happened - in the task of the press
// (`soon`: what had been called before that task ended) and once the next task has run.
// Revision 2: a door to a DIALOG opens it in the same task (js/ui/modal.js must never see a
// moment with no dialog open); a door to anything else runs one task later, after modal.js has
// given the keyboard back, so that what the target focuses keeps the focus.
const nextTask = () => new Promise(resolve => setTimeout(resolve, 5));
async function pressDoor(d, n) {
    d.run('currentView = "advances"; REPORT_WORKERS = null; ADVANCE_WORKER = null; OWES_PAGE = null; __writes = []; __calls = []; __dayChosen = 0; 1');
    d.views.length = 0;
    const before = disk(d);
    given('the desk opens', d.call('openPayday') === true && d.call('paydayIsOpen') === true);
    const doors = d.dom.getElementById('paydayBody').querySelectorAll('.payday-door');
    const door = doors[n];
    const words = bare(door.textContent);
    const where = () => d.run('JSON.stringify({ owesPage: OWES_PAGE, advanceWorker: ADVANCE_WORKER, date: State.date, workers: REPORT_WORKERS ? [...REPORT_WORKERS] : null })');
    const was = where();
    press(door);
    const soon = { open: d.call('paydayIsOpen'), views: d.views.slice(), calls: JSON.parse(d.run('JSON.stringify(__calls)')),
        dayChosen: d.global('__dayChosen'), moved: where() !== was };
    await nextTask();
    return {
        words,
        soon,
        open: d.call('paydayIsOpen'),
        views: d.views.slice(),
        writes: d.global('__writes').slice(),
        calls: JSON.parse(d.run('JSON.stringify(__calls)')),
        dayChosen: d.global('__dayChosen'),
        state: JSON.parse(d.run('JSON.stringify({ workers: REPORT_WORKERS ? [...REPORT_WORKERS] : null, range: [REPORT_RANGE.from, REPORT_RANGE.to], '
            + 'section: REPORT_SECTION, advanceWorker: ADVANCE_WORKER, owesPage: OWES_PAGE, date: State.date })')),
        unmoved: disk(d) === before
    };
}

await block('P4 every check fires on the fixture made for it, is silent elsewhere, says its words, and its door only navigates', async () => {
    const d = reopen(everything(), OPEN);
    const f = facts(d);
    const of = (g, kind) => g.checks.filter(one => one.kind === kind)[0];
    same('the crew with everything on Wednesday: a, b, c, e and f, in that order, and no d (no period ends today)',
        kinds(f), ['notReady', 'unclosed', 'unpriced', 'review', 'hoursUnpriced']);
    // a
    same('a: «סגירת שבוע»\'s own sentence on this phone (no cloud), word for word, with no door',
        [of(f, 'notReady').say, of(f, 'notReady').door], [NOT_SYNCED, null]);
    same('a: it is weeklyCloseReadyWord()\'s answer', of(f, 'notReady').say, d.call('weeklyCloseReadyWord'));
    // b
    same('b: «שים לב»\'s finding about פואד, in its own words', [bare(of(f, 'unclosed').say), of(f, 'unclosed').lines],
        ['חשבון קודם לא נסגר: 30/10 - 12/11 · פואד',
            ['הדוח הניח שנוכו 1500 ₪ בתקופה הזאת, אבל הניכוי לא נרשם במקדמות.', 'במקדמות רשום חוב של 1500 ₪.']]);
    same('b: its door is v195\'s, pointing at that period', [bare(of(f, 'unclosed').door.words), of(f, 'unclosed').door.go, of(f, 'unclosed').door.args],
        ['הצג את החשבון 30/10 - 12/11', 'account', ['w_fa', '2026-10-30', '2026-11-12']]);
    // c
    same('c: the sheet\'s sentence for a wage it cannot price, and the roster', [of(f, 'unpriced').say, of(f, 'unpriced').door.words, of(f, 'unpriced').door.go],
        ['⚠️ 1 עובדים בלי שכר יומי, ולכן הסכום חסר אותם: ⁨כמאל⁩. הוסף להם שכר במסך "עובדים ואתרים".', 'עובדים ואתרים', 'roster']);
    // e
    same('e: the sheet\'s own sentence for an over-settled account, his name, and his advances',
        [of(f, 'review').who, of(f, 'review').say, bare(of(f, 'review').door.words), of(f, 'review').door.go, of(f, 'review').door.args],
        ['עומר', REVIEW_500, 'המקדמות של עומר', 'advancesOf', ['w_ov']]);
    // f
    // Revision 2: borrowed WITHOUT its leading «* » - on the sheet the star points at the starred
    // amount, and the desk stars no figure.
    same('f: the sheet\'s sentence without its star, the men, and the roster', [of(f, 'hoursUnpriced').say, of(f, 'hoursUnpriced').lines.map(bare), of(f, 'hoursUnpriced').door.go],
        ['שעות נוספות בלי שכר שעה - לא נכללו בסכום.', ['גסאן'], 'roster']);
    same('f: and it is the sheet\'s own sentence, the star and its space taken off', of(f, 'hoursUnpriced').say, HOURS_NOTE.slice(2));
    // h, and «אין מה לסדר»
    same('h: always last, quiet, and its door is «מקדמות»', [f.forgotten.say, f.forgotten.door.words, f.forgotten.door.go],
        ['מקדמה שניתנה ולא נרשמה לא תנוכה. רושמים אותה לפני שסוגרים.', 'מקדמות', 'advances']);
    check('«אין מה לסדר» is not said while there is something', f.nothing === false);

    // SILENT: the clean crew - every check silent (a too: nothing to close and no period ends today).
    const c = reopen(clean(), OPEN);
    const cf = facts(c);
    same('the clean crew: no check at all', kinds(cf), []);
    check('and «אין מה לסדר לפני הסגירה.» is said - with h still after it', cf.nothing === true && cf.forgotten !== null);
    // a silent on a phone that may close (the predicate itself is tests/weeklyclose.test.mjs W6's)
    const ready = reopen(everything(), OPEN);
    ready.run('weeklyCloseReadyWord = () => null; 1');
    same('a phone that may close: no a, the rest as before', kinds(facts(ready)), ['unclosed', 'unpriced', 'review', 'hoursUnpriced']);
    // a said on the day a period ends, even when nobody can be offered yet
    const morningClean = reopen(clean({ today: '2026-11-19', until: '2026-11-18' }), OPEN);
    const mc = facts(morningClean);
    same('the clean crew on Thursday morning: nobody offered, but a period ends today - a and d', [mc.close.count, kinds(mc)], [0, ['notReady', 'endsToday']]);

    // d: Thursday morning, today not written
    const morning = reopen(everything({ today: '2026-11-19', until: '2026-11-18' }), OPEN);
    const mf = facts(morning);
    same('d: Thursday morning - the three men whose period ends today, in the roster\'s order, in one sentence',
        bare(of(mf, 'endsToday').say), 'התקופות של 3 עובדים נגמרות היום, והיום עוד לא נרשם להם: ואליד, באסל, טארק.');
    same('d: its door goes to today\'s day', [of(mf, 'endsToday').door.words, of(mf, 'endsToday').door.go, of(mf, 'endsToday').door.args],
        ['לרישום היום', 'day', ['2026-11-19']]);
    same('d names exactly the men «סגירת שבוע» holds for «נגמרת היום»', ['w_wa', 'w_wb', 'w_tr'],
        mf.close.held.filter(man => /נגמרת היום/.test(man.why)).map(man => man.id));
    morning.State.commitMany(['w_wa', 'w_wb'].map(id => morning.call('assignPlace', morning.State.schedule, '2026-11-19', id, 'actual', 'p_01')));
    same('d: today written for two of them - the one left, in the singular', bare(of(facts(morning), 'endsToday').say),
        'התקופה של טארק נגמרת היום, והיום עוד לא נרשם לו.');
    const evening = reopen(everything({ today: '2026-11-19' }), OPEN);
    check('d: silent once today is written for everybody', kinds(facts(evening)).indexOf('endsToday') === -1, j(kinds(facts(evening))));

    // THE DOORS, the drawn buttons themselves.
    const w = instrument(reopen(everything(), OPEN));
    const doors = w.dom.getElementById('paydayBody');
    w.call('openPayday');
    const words = doors.querySelectorAll('.payday-door').map(node => bare(node.textContent));
    same('the Wednesday desk\'s doors, in the order they stand', words,
        ['הצג את החשבון 30/10 - 12/11', 'עובדים ואתרים', 'המקדמות של עומר', 'עובדים ואתרים', 'מקדמות', 'לסגירת שבוע', '💬 תלוש לכל עובד']);
    w.call('closePayday');
    const pressed = [];
    for (let n = 0; n < words.length; n += 1) pressed.push(await pressDoor(w, n));
    const nothingWritten = pressed.filter(one => one.writes.length || !one.unmoved || one.open);
    same('every door shut the desk, called no writer and left the disk byte for byte', nothingWritten.map(one => one.words), []);
    same('b: the pay sheet, narrowed to פואד, at his open fortnight', [pressed[0].views, pressed[0].state.workers, pressed[0].state.range, pressed[0].state.section],
        [['reports'], ['w_fa'], ['2026-10-30', '2026-11-12'], 'workers']);
    same('c and f: the roster', [pressed[1].views, pressed[3].views], [['roster'], ['roster']]);
    same('e: עומר\'s advances', [pressed[2].views, pressed[2].state.advanceWorker], [['advances'], 'w_ov']);
    same('h: the list of «מקדמות»', [pressed[4].views, pressed[4].state.advanceWorker, pressed[4].state.owesPage], [['advances'], null, null]);
    same('«לסגירה»: «סגירת שבוע»\'s own opener, and nothing else', [pressed[5].calls, pressed[5].views], [[['openWeeklyClose']], []]);
    same('«אחרי הסגירה»: the payslips, of the period before (no period ends today)', [pressed[6].calls, pressed[6].views],
        [[['openPayslips', 'previous']], []]);
    // REVISION 2: WHEN each door runs. js/ui/modal.js gives the keyboard back at the microtask
    // after the block that shut the last dialog, so a door to a view runs one task later (what the
    // target focuses then keeps the focus), and a door to a dialog opens it in the same task.
    const dialogs = ['לסגירת שבוע', '💬 תלוש לכל עובד'];
    check('every door shut the desk in the task of the press', pressed.every(one => one.soon.open === false), j(pressed.map(one => one.soon.open)));
    same('a door to a view: nothing of its target had run when the task of the press ended - it ran in the next',
        pressed.filter(one => dialogs.indexOf(one.words) === -1 && (one.soon.views.length || one.soon.dayChosen || one.soon.moved || one.soon.calls.length))
            .map(one => one.words), []);
    given('and in the next task each of them had arrived', pressed.filter(one => dialogs.indexOf(one.words) === -1).every(one => one.views.length > 0),
        j(pressed.map(one => one.views)));
    same('a door to a dialog: its opener called in the task of the press', pressed.filter(one => dialogs.indexOf(one.words) !== -1)
        .map(one => [one.words, one.soon.calls]), [['לסגירת שבוע', [['openWeeklyClose']]], ['💬 תלוש לכל עובד', [['openPayslips', 'previous']]]]);

    const k = instrument(reopen(clean(), OPEN));
    k.call('openPayday');
    const cleanWords = k.dom.getElementById('paydayBody').querySelectorAll('.payday-door').map(node => bare(node.textContent));
    k.call('closePayday');
    same('the clean desk\'s doors: h, the payslips and the closes on record (there are some)', cleanWords,
        ['מקדמות', '💬 תלוש לכל עובד', 'סגירות שנרשמו']);
    const closures = await pressDoor(k, 2);
    same('«סגירות שנרשמו»: that page of «מקדמות», nothing written', [closures.state.owesPage, closures.writes, closures.unmoved], ['closures', [], true]);
    check('«סגירות שנרשמו»: a page of «מקדמות», so one task later - nothing of it in the task of the press', closures.soon.moved === false && closures.soon.views.length === 0);

    const m = instrument(reopen(everything({ today: '2026-11-19', until: '2026-11-18' }), OPEN));
    m.call('openPayday');
    const mWords = m.dom.getElementById('paydayBody').querySelectorAll('.payday-door').map(node => bare(node.textContent));
    m.call('closePayday');
    const dayDoor = await pressDoor(m, mWords.indexOf('לרישום היום'));
    same('d: «לרישום היום» - today on the day screen, chosen by hand, nothing written',
        [dayDoor.views, dayDoor.state.date, dayDoor.dayChosen, dayDoor.writes, dayDoor.unmoved], [['day'], '2026-11-19', 1, [], true]);
    same('d: and none of it in the task of the press', [dayDoor.soon.views, dayDoor.soon.dayChosen, dayDoor.soon.moved], [[], 0, false]);
    const slipDoor = await pressDoor(m, mWords.indexOf('💬 תלוש לכל עובד'));
    same('on a Thursday whose period ends today the payslips open on the current period - in the task of the press',
        [slipDoor.soon.calls, slipDoor.calls], [[['openPayslips', 'current']], [['openPayslips', 'current']]]);
});

// ================================================================== P5 the week, walked
await block('P5 a week walked day by day, and a fortnight\'s Thursday', async () => {
    const d = phone({ today: '2026-11-13' });
    d.State.schedule.workers = [
        { id: 'w_w1', name: 'מאהר', active: true, dailyRate: 400, hourlyRate: 0, payCycles: '2026-08-07=weekly' },
        { id: 'w_b1', name: 'וסים', active: true, dailyRate: 500, hourlyRate: 0 }
    ];
    d.State.schedule.places = PLACES;
    weekdays('2026-10-30', '2026-11-12').forEach(date => ['w_w1', 'w_b1'].forEach(id => day(d, id, date)));
    approve(d);
    kept(d);
    const T = { soFar: 'לפי מה שנרשם עד עכשיו. ימים ומקדמות שעוד לא נרשמו - לא נכללים.',
        full: 'הסכום לתשלום הוא אחרי כל הניכוי שהדוח מציע. ניכוי קטן יותר בסגירה - יותר לתשלום, עד הנצבר.' };
    const write = (date, ids) => {
        const changes = ids.filter(id => d.call('entriesFor', d.State.schedule, date, id, 'actual').length === 0)
            .map(id => d.call('assignPlace', d.State.schedule, date, id, 'actual', 'p_01'));
        if (changes.length) d.State.commitMany(changes);
    };
    const seen = [];
    for (const date of ['2026-11-13', '2026-11-14', '2026-11-15', '2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19']) {
        d.setToday(date);
        if (new Date(`${date}T12:00:00`).getDay() !== 6) write(date, ['w_w1', 'w_b1']);
        if (date === '2026-11-16') d.State.commitMany(d.call('recordNewAdvance', d.State.schedule, 'w_w1', date, 200, '', `${date}T07:00:00.000Z`, 'd_seed', 'cash'));
        // Wednesday evening: Thursday's seder written ahead for מאהר.
        if (date === '2026-11-18') write('2026-11-19', ['w_w1']);
        const f = facts(d);
        seen.push([date, f.groups.map(group => [group.key, bare(group.heading),
            group.lines.filter(line => line !== T.soFar).map(line => (line === T.full ? 'FULL' : bare(line)))])]);
        check(`${date}: every card says it is what was recorded so far`, f.groups.every(group => group.lines[0] === T.soFar));
    }
    const week = (heading, lines) => ['weekly|2026-11-13|2026-11-19', heading, lines];
    const fortnight = ['biweekly|2026-11-13|2026-11-26', 'יום חמישי 26/11 · דו־שבועי', []];
    same('Friday to Thursday: the week and the fortnight every day; «היום, » only on Thursday; the advance\'s line from Monday; '
        + 'Thursday written ahead on Wednesday night', seen, [
        ['2026-11-13', [week('יום חמישי 19/11 · שבועי', []), fortnight]],
        ['2026-11-14', [week('יום חמישי 19/11 · שבועי', []), fortnight]],
        ['2026-11-15', [week('יום חמישי 19/11 · שבועי', []), fortnight]],
        ['2026-11-16', [week('יום חמישי 19/11 · שבועי', ['FULL']), fortnight]],
        ['2026-11-17', [week('יום חמישי 19/11 · שבועי', ['FULL']), fortnight]],
        ['2026-11-18', [week('יום חמישי 19/11 · שבועי', ['FULL', 'כולל ימים שכבר נרשמו מראש: 19/11.']), fortnight]],
        ['2026-11-19', [week('היום, יום חמישי 19/11 · שבועי', ['FULL']), fortnight]]]);

    // The fortnight's Thursday: both paydays today, and the second card says they are not added.
    weekdays('2026-11-20', '2026-11-26').forEach(date => { d.setToday(date); write(date, ['w_w1', 'w_b1']); });
    d.setToday('2026-11-26');
    const f = facts(d);
    same('Thursday 26/11: the week and the fortnight both end today; the second card says the two are not added',
        f.groups.map(group => [group.key, bare(group.heading), group.lines.filter(line => line !== T.soFar).map(bare)]), [
            ['weekly|2026-11-20|2026-11-26', 'היום, יום חמישי 26/11 · שבועי', []],
            ['biweekly|2026-11-13|2026-11-26', 'היום, יום חמישי 26/11 · דו־שבועי',
                ['ביום הזה משלמים לשתי הקבוצות. לכל קבוצה הסכום שלה - הם לא מחוברים כאן.']]]);
    // The transition man's stub and the week, one date, from the crew with everything.
    const e = facts(reopen(everything(), OPEN));
    same('the cut fortnight ends with the week: the sheet\'s note on it, and the sentence under it', [card(e, 'biweekly|2026-11-13|2026-11-19').note,
        card(e, 'biweekly|2026-11-13|2026-11-19').lines.slice(-1)[0], card(e, 'biweekly|2026-11-13|2026-11-19').transition],
    ['תקופת מעבר: הימים שנשארו מהמחזור הקודם, לפני המעבר לתשלום שבועי.', 'ביום הזה משלמים לשתי הקבוצות. לכל קבוצה הסכום שלה - הם לא מחוברים כאן.', true]);
    same('a deduction chosen on the sheet is said under its card', (() => {
        const x = reopen(everything(), OPEN);
        x.run('REPORT_DEDUCTIONS.set(reportDeductionKey("w_wa", "2026-11-13", "2026-11-19"), 200); 1');
        return card(facts(x), 'weekly|2026-11-13|2026-11-19').lines.slice(-1)[0];
    })(), 'לחלק מהעובדים נבחר בדוח ניכוי אחר, והוא כלול כאן. «סגירת שבוע» מתחילה מהניכוי המלא.');
});

// ================================================================== P6 the memory agrees
await block('P6 the reading inside the two scopes is the bare reading; everything is put back after a throw', async () => {
    for (const [name, flags] of [['gate open', OPEN], ['gate shut', SHUT]]) {
        for (const [what, make] of [['the crew with everything', () => everything()], ['its Thursday morning', () => everything({ today: '2026-11-19', until: '2026-11-18' })]]) {
            const d = reopen(make(), flags);
            fresh(d);
            const inside = j(facts(d));
            fresh(d);
            const outside = d.run(`JSON.stringify(paydayScope(() => paydayRead(State.schedule, todayStr(), ${j(at(d))})))`);
            check(`${name}, ${what}: inside reportReadOnce and weeklyCloseOnce = the bare reading, as JSON`, inside === outside,
                `${inside.length} / ${outside.length} chars`);
        }
    }
    const d = reopen(everything(), OPEN);
    d.run('REPORT_WORKERS = new Set(["w_wa"]); REPORT_RANGE.from = "2026-10-01"; REPORT_RANGE.to = "2026-10-31"; '
        + 'REPORT_DEDUCTIONS.set(reportDeductionKey("w_fa", "2026-11-13", "2026-11-26"), 100); 1');
    const held = () => d.run('JSON.stringify([[...REPORT_WORKERS], REPORT_RANGE.from, REPORT_RANGE.to, [...REPORT_DEDUCTIONS.entries()]])');
    const before = held();
    const swapped = ['carryReportingEnabled', 'payrollReport', 'closedPeriods', 'ledgerEntries', 'foldLedger', 'advanceHistory',
        'appendLedgerEntry', 'planCarryMigration'];
    d.run(`var __real = [${swapped.join(', ')}]; var __band = payrollBandTotals; payrollBandTotals = () => { throw new Error('inside the reading'); }; 1`);
    let threw = '';
    try { facts(d); } catch (error) { threw = String(error && error.message); }
    d.run('payrollBandTotals = __band; 1');
    same('a reader that throws inside the reading throws out of it', threw, 'inside the reading');
    same('the report\'s filter, range and chosen deductions are back', held(), before);
    check('every function the scopes swapped is the real one again', d.run(`[${swapped.join(', ')}].every((fn, i) => fn === __real[i])`) === true);
    check('and no reading is left open', d.run('REPORT_ONCE === null') === true);
    same('the reading of everybody does not depend on the filter the sheet was left with', j(facts(d).groups.map(group => group.rows.length)),
        j(facts(reopen(everything(), OPEN)).groups.map(group => group.rows.length)));
});

// A record nobody approved, whose migration has to be planned (tests/closereminder.test.mjs R1's).
function unapproved() {
    const u = phone();
    u.State.schedule.workers = [{ id: 'w_u', name: 'עומרי', active: true, dailyRate: 400, hourlyRate: 0 }];
    u.State.schedule.places = PLACES;
    weekdays('2026-08-07', TODAY).forEach(date => day(u, 'w_u', date));
    u.call('addAdvance', u.State.schedule, 'w_u', '2026-10-19', 9000, '');
    kept(u);
    return reopen(u, OPEN);
}

// ================================================================== P7 the gate
await block('P7 the gate: asked at most once a reading, and never planned on an approved record', async () => {
    const count = d => d.run(`var __gate = 0, __plan = 0; (function () { const g = carryReportingEnabled, p = planCarryMigration;
        carryReportingEnabled = function () { __gate += 1; return g.apply(this, arguments); };
        planCarryMigration = function () { __plan += 1; return p.apply(this, arguments); }; })(); REPORT_GATE_KEPT = null; OWES_KEPT = null; 1`);
    const asked = d => [d.global('__gate'), d.global('__plan')];
    const a = reopen(everything(), OPEN);
    count(a);
    facts(a);
    same('an approved record: the gate\'s own function is not asked, the migration not planned', asked(a), [0, 0]);
    const u = unapproved();
    given('a record nobody approved, with a migration to plan, reads the old way', u.call('carryReportingEnabled', u.State.schedule) === false);
    count(u);
    const f = facts(u);
    same('a record nobody approved: the gate asked once, the migration planned once', asked(u), [1, 1]);
    facts(u);
    same('and a second reading of it, unmoved, asks nothing more (kept under the record)', asked(u), [1, 1]);
    check('and it reads the old way', f.gate === false);
    const s = reopen(everything(), SHUT);
    count(s);
    facts(s);
    same('the carry shut: nothing asked at all', asked(s), [0, 0]);
});

// ================================================================== P8 the cost
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
// A SEASON (scout-api 7.2): 40 men (16 weekly) on six sites, 1 January to Thursday 19 November
// without Saturdays, about 85% attendance, doubles and extra hours. "D": advances only in the last
// 70 days and every period since CLOSED in order (the owner's regime since «איפוס מקדמות»); "B":
// advances every two to four weeks all year and nothing closed. The approval recorded.
function season(kind) {
    const today = '2026-11-19';
    const rand = mulberry(20261119);
    const pick = list => list[Math.floor(rand() * list.length)];
    const first = phone({ today });
    const s = first.State.schedule;
    s.places = [1, 2, 3, 4, 5, 6].map(n => ({ id: `p_${n}`, name: `אתר ${n}`, active: true }));
    s.workers = [];
    const days = weekdays('2026-01-01', today);
    const from = kind === 'D' ? addDays(today, -70) : '2026-01-01';
    for (let n = 1; n <= 40; n += 1) {
        const id = `w_${String(n).padStart(2, '0')}`;
        s.workers.push(Object.assign({ id, name: `עובד ${n}`, active: true, dailyRate: pick([380, 420, 450, 500, 550, 610, 650]),
            hourlyRate: pick([0, 0, 45, 50]) }, n <= 16 ? { payCycles: '2026-01-02=weekly' } : {}));
        const home = `p_${1 + (n % 6)}`;
        days.forEach(date => {
            if (rand() > 0.85) return;
            if (rand() < 0.02) { first.call('markAbsent', s, date, id, 'actual'); return; }
            const r = rand();
            if (r < 0.03) first.call('assignPlace', s, date, id, 'actual', home, 'double');
            else if (r < 0.08) first.call('assignPlace', s, date, id, 'actual', home, 'extra', 1 + Math.floor(rand() * 3));
            else first.call('assignPlace', s, date, id, 'actual', home, 'normal');
        });
        for (let date = addDays(from, Math.floor(rand() * 20)); date <= today; date = addDays(date, 14 + Math.floor(rand() * 14))) {
            first.call('addAdvance', s, id, date, pick([200, 300, 500, 800, 1000, 1500, 2000, 3000]), '');
        }
    }
    kept(first);
    const d = reopen(first, OPEN, today);
    d.State.commit(d.call('recordCarryApproval', d.State.schedule, { id: d.call('carryMigrationId'), rows: [] }, '2026-01-01T09:00:00.000Z', 'd_person'));
    let closes = 0;
    if (kind === 'D') {
        // Closed by the per-man close's own writer, oldest first, the deduction the sheet proposes.
        d.State.schedule.workers.forEach(worker => {
            const mine = d.call('advancesFor', d.State.schedule, worker.id, '0000-01-01', '9999-12-31');
            if (!mine.length) return;
            let period = d.call('periodRangeFor', worker, mine[0].date);
            while (period.to < today) {
                const made = d.run(`weeklyCloseOnce(() => closePeriodChanges(State.schedule, ${j(worker.id)}, ${j(period.from)}, ${j(period.to)}, ${j(`${period.to}T15:00:00.000Z`)}, 'd_office'))`);
                if (Array.isArray(made) && made.length) closes += 1;
                period = d.call('periodRangeFor', worker, addDays(period.to, 1));
            }
        });
        kept(d);
    }
    return { d, closes, advances: Object.keys(d.State.schedule.advances).length };
}
const median = list => list.slice().sort((a, b) => a - b)[Math.floor(list.length / 2)];
function timed(d) {
    const times = [];
    for (let n = 0; n < 3; n += 1) {
        fresh(d);
        const began = performance.now();
        facts(d);
        times.push(performance.now() - began);
    }
    return times;
}

await block('P8 the cost: two seasons within budget, «מקדמות» reading nothing of this file, an unmoved record read once', async () => {
    const D = season('D');
    given('season D: periods closed in order since the advances began', D.closes > 150, `${D.closes} closes, ${D.advances} advances`);
    const dTimes = timed(D.d);
    console.log(`        (season D: 40 men, ${D.advances} advances, ${D.closes} closes - paydayFacts ${dTimes.map(t => t.toFixed(0)).join(', ')} ms, median ${median(dTimes).toFixed(0)})`);
    check('season D (closed in order): paydayFacts within 600 ms (median of 3)', median(dTimes) <= 600, `${median(dTimes).toFixed(0)} ms`);
    const B = season('B');
    given('season B: hundreds of advances and nothing closed', B.advances > 500 && B.closes === 0, `${B.advances} advances`);
    const bTimes = timed(B.d);
    console.log(`        (season B: 40 men, ${B.advances} advances, nothing closed - paydayFacts ${bTimes.map(t => t.toFixed(0)).join(', ')} ms, median ${median(bTimes).toFixed(0)})`);
    check('season B (nobody closes): paydayFacts within 8,000 ms (median of 3)', median(bTimes) <= 8000, `${median(bTimes).toFixed(0)} ms`);

    // A DRAW OF «מקדמות» READS NOTHING OF THIS FILE - ten of them, the record moved between.
    const d = reopen(everything(), OPEN);
    d.run(`var __facts = 0, __rows = 0; (function () { const f = paydayFacts, r = payrollRowsOver;
        paydayFacts = function () { __facts += 1; return f.apply(this, arguments); };
        payrollRowsOver = function () { __rows += 1; return r.apply(this, arguments); }; })(); 1`);
    let drawn = 0;
    for (let n = 0; n < 10; n += 1) {
        if (n % 2) d.State.commit(d.call('assignPlace', d.State.schedule, addDays('2026-11-02', n), 'w_nr', 'actual', 'p_02'));
        d.run('ADVANCE_WORKER = null; OWES_PAGE = null; clear(document.getElementById("advancesView")); renderAdvances(); 1');
        if (d.dom.getElementById('advancesView').querySelectorAll('.payday-entry').length === 1) drawn += 1;
    }
    same('ten draws of «מקדמות», the button on each, and not one call to paydayFacts or payrollRowsOver', [drawn, d.global('__facts'), d.global('__rows')], [10, 0, 0]);

    // A SECOND OPENING OF A RECORD THAT DID NOT MOVE READS NOTHING.
    const o = reopen(everything(), OPEN);
    o.run(`var __reads = { rows: 0, weekly: 0, owes: 0 }; (function () { const r = payrollRowsOver, w = weeklyCloseRead, ow = owesRead;
        payrollRowsOver = function () { __reads.rows += 1; return r.apply(this, arguments); };
        weeklyCloseRead = function () { __reads.weekly += 1; return w.apply(this, arguments); };
        owesRead = function () { __reads.owes += 1; return ow.apply(this, arguments); }; })(); 1`);
    o.call('openPayday');
    const first = JSON.parse(o.run('JSON.stringify(__reads)'));
    o.call('closePayday');
    o.run('__reads = { rows: 0, weekly: 0, owes: 0 }; 1');
    o.call('openPayday');
    same('the first opening read (rows, «סגירת שבוע»\'s list and the board)', [first.rows > 0, first.weekly, first.owes], [true, 1, 1]);
    same('a second opening of the record unmoved reads none of them', JSON.parse(o.run('JSON.stringify(__reads)')), { rows: 0, weekly: 0, owes: 0 });
    check('and draws the figures at once', /יום התשלום הבא/.test(o.dom.getElementById('paydayBody').textContent));
    o.call('closePayday');

    // A RECORD THAT MOVED UNDER THE OPEN DESK: the placeholder at once, never the old figures,
    // and the new figures once the draws have stopped.
    o.call('openPayday');
    const before = card(o.global('PAYDAY_KEPT').facts, 'weekly|2026-11-13|2026-11-19').figures.map(one => one.value);
    o.State.commit(o.call('assignPlace', o.State.schedule, '2026-11-19', 'w_wa', 'actual', 'p_01'));
    o.call('renderPaydayIfOpen');
    same('moved: the placeholder in the figures\' place, and no figure', [o.global('PAYDAY').state, o.dom.getElementById('paydayBody').textContent],
        ['stale', 'מחשב את החשבונות…']);
    o.call('renderPaydayIfOpen');
    await new Promise(done => setTimeout(done, 1700));
    const after = card(o.global('PAYDAY_KEPT').facts, 'weekly|2026-11-13|2026-11-19').figures.map(one => one.value);
    same('read again once the draws stopped: the day written in advance is in «נצבר»', [o.global('PAYDAY').state, before[0] !== after[0],
        Number(after[0]) - Number(before[0])], ['shown', true, 400]);
    check('and drawn', o.dom.getElementById('paydayBody').textContent.indexOf(after[0]) !== -1);
    o.call('closePayday');
});

// ================================================================== P9 the gate shut, and a record nobody approved
await block('P9 gate shut or unapproved: the plain bands, no check of the new arithmetic, the two last sections «מקדמות»\'s sentence', async () => {
    for (const [name, make] of [['the carry shut', () => reopen(everything(), SHUT)], ['a record nobody approved', unapproved]]) {
        const d = make();
        const f = facts(d);
        check(`${name}: the reading says so`, f.gate === false);
        check(`${name}: no a, b or e (they are the new arithmetic)`, kinds(f).every(kind => ['unpriced', 'endsToday', 'hoursUnpriced'].indexOf(kind) !== -1), j(kinds(f)));
        same(`${name}: no «לסגירה» and no «אחרי הסגירה»`, [f.close, f.after], [null, null]);
        bandsAgree(name, d, f);
        d.call('openPayday');
        const body = d.dom.getElementById('paydayBody');
        same(`${name}: drawn, «מקדמות»'s own sentence in their place`, body.querySelectorAll('.payday-gate').map(node => node.textContent), [CHECK_FIRST]);
        same(`${name}: and no section of them`, [body.querySelectorAll('.payday-close').length, body.querySelectorAll('.payday-after').length], [0, 0]);
        d.call('closePayday');
    }
    const s = facts(reopen(everything(), SHUT));
    same('the carry shut, the crew with everything: c and f are still said', kinds(s), ['unpriced', 'hoursUnpriced']);
    check('and no card says the deduction line of the new arithmetic',
        s.groups.every(group => group.lines.indexOf('הסכום לתשלום הוא אחרי כל הניכוי שהדוח מציע. ניכוי קטן יותר בסגירה - יותר לתשלום, עד הנצבר.') === -1));
});

// ================================================================== P10 the disk
await block('P10 the whole disk byte for byte across the reading, the opening, a redraw, the doors and the closing', async () => {
    for (const [name, make] of [['gate open', () => reopen(everything(), OPEN)], ['gate shut', () => reopen(everything(), SHUT)],
        ['Thursday morning', () => reopen(everything({ today: '2026-11-19', until: '2026-11-18' }), OPEN)]]) {
        const d = make();
        const before = disk(d);
        facts(d);
        check(`${name}: the reading`, disk(d) === before);
        d.call('openPayday');
        check(`${name}: the opening`, disk(d) === before);
        d.call('renderPaydayIfOpen');
        check(`${name}: a redraw`, disk(d) === before);
        d.call('closePayday');
        check(`${name}: the closing`, disk(d) === before);
        instrument(d);
        d.call('openPayday');
        const count = d.dom.getElementById('paydayBody').querySelectorAll('.payday-door').length;
        d.call('closePayday');
        const moved = [];
        for (let n = 0; n < count; n += 1) {
            const one = await pressDoor(d, n);
            if (!one.unmoved || one.writes.length) moved.push(one.words);
        }
        same(`${name}: each of its ${count} doors`, moved, []);
        check(`${name}: and the disk after all of it is the disk before`, disk(d) === before);
    }
});

// ================================================================== P11 the words
await block('P11 every proposed word pinned, every borrowed word in its owner, and what the file may not do', async () => {
    const d = reopen(everything(), OPEN);
    const T = JSON.parse(d.run(`JSON.stringify(Object.assign({}, PAYDAY_TEXT, {
        heading: PAYDAY_TEXT.heading('יום חמישי', '19/11', 'שבועי'),
        ahead: PAYDAY_TEXT.ahead('19/11, 20/11'),
        endsTodayOne: PAYDAY_TEXT.endsTodayOne('אחמד'),
        endsTodayMany: PAYDAY_TEXT.endsTodayMany(3, 'אחמד, באסל, טארק') }))`));
    same('PAYDAY_TEXT, word for word (PROPOSED)', T, {
        entry: 'יום תשלום',
        title: 'יום תשלום',
        lead: 'כמה לשלם ביום התשלום הבא לפי מה שנרשם עד עכשיו, ומה כדאי לסדר לפני שסוגרים. המסך הזה רק מראה - שום דבר לא נרשם ממנו.',
        next: 'יום התשלום הבא',
        none: 'עוד אין רישומים בתקופה הנוכחית.',
        heading: 'יום חמישי 19/11 · שבועי',
        today: 'היום, ',
        soFar: 'לפי מה שנרשם עד עכשיו. ימים ומקדמות שעוד לא נרשמו - לא נכללים.',
        fullDeduction: 'הסכום לתשלום הוא אחרי כל הניכוי שהדוח מציע. ניכוי קטן יותר בסגירה - יותר לתשלום, עד הנצבר.',
        ahead: 'כולל ימים שכבר נרשמו מראש: 19/11, 20/11.',
        chosen: 'לחלק מהעובדים נבחר בדוח ניכוי אחר, והוא כלול כאן. «סגירת שבוע» מתחילה מהניכוי המלא.',
        bothGroups: 'ביום הזה משלמים לשתי הקבוצות. לכל קבוצה הסכום שלה - הם לא מחוברים כאן.',
        before: 'לפני שסוגרים',
        endsTodayOne: 'התקופה של אחמד נגמרת היום, והיום עוד לא נרשם לו.',
        endsTodayMany: 'התקופות של 3 עובדים נגמרות היום, והיום עוד לא נרשם להם: אחמד, באסל, טארק.',
        toToday: 'לרישום היום',
        nothing: 'אין מה לסדר לפני הסגירה.',
        forgotten: 'מקדמה שניתנה ולא נרשמה לא תנוכה. רושמים אותה לפני שסוגרים.',
        toClose: 'לסגירה',
        after: 'אחרי הסגירה'
    });
    same('PAYDAY_TEXT has nothing else in it', Object.keys(T).length, 20);
    // Revision 2: check d is built on «סגירת שבוע»'s own sentence for the same fact - its first
    // sentence, with the man's name where it says «שלו» - and its plural is plural throughout.
    const held = d.run('WEEKLY_CLOSE_TEXT.heldEndsToday');
    same('«סגירת שבוע»\'s sentence for the same fact, on this build', held, 'התקופה שלו נגמרת היום, והיום עוד לא נרשם לו. רשום את היום ואז סגור.');
    same('d, for one man, is its first sentence with his name in it', T.endsTodayOne, `${held.split('. ')[0].replace('התקופה שלו', 'התקופה של אחמד')}.`);
    const R = JSON.parse(d.run('JSON.stringify(PAYDAY_REUSED)'));
    const reports = source('js/ui/reports.js');
    const page = source('index.html');
    const owners = {
        gross: [reports, `'נצבר'`],
        toPay: [reports, `'לתשלום'`],
        band: [reports, "`סה״כ לתשלום · ${countedIn(paid, 'עובד אחד', 'עובדים')}`"],
        oneMan: [reports, `'עובד אחד'`],
        manyMen: [reports, `'עובדים'`],
        byWorker: [reports, `sectionButton('workers', 'לפי עובד')`],
        transition: [reports, `'תקופת מעבר: הימים שנשארו מהמחזור הקודם, לפני המעבר לתשלום שבועי.'`],
        roster: [page, '<span class="tab-long">עובדים ואתרים</span>'],
        advances: [page, '<span>מקדמות</span></button>'],
        close: [page, 'onclick="closeWorkerCard()">סגור</button>'],
        shekel: [reports, `el('span', 'report-tile-currency', '₪')`],
        unknown: [reports, `money.gross === null ? '—'`]
    };
    const lost = Object.keys(owners).filter(key => owners[key][0].indexOf(owners[key][1]) === -1 || owners[key][1].indexOf(R[key]) === -1);
    same('every borrowed word of PAYDAY_REUSED stands in its owner, spelled as it is here', lost, []);
    same('and nothing is borrowed that is not checked', Object.keys(R).sort(), Object.keys(owners).sort());
    // The owners' constants are READ, not repeated: the desk's sentences are theirs.
    const read = name => new RegExp(`\\b${name.replace('.', '\\.')}\\b`).test(PAYDAY);
    same('the owners\' constants the desk reads by name', ['WEEKLY_CLOSE_TEXT.reading', 'WEEKLY_CLOSE_TEXT.nobody', 'WEEKLY_CLOSE_TEXT.stateHeld',
        'CLOSE_REMINDER_TEXT.line', 'CLOSE_REMINDER_TEXT.open', 'MONTH_SUMMARY_TEXT.unpriced', 'PAYSLIPS_TEXT.entry', 'OWES_TEXT.closures',
        'OWES_TEXT.advancesOf', 'OWES_REUSED.checkFirst', 'OTHER_ACCOUNT_SHOW', 'HOURS_UNPRICED_NOTE', 'PAY_CYCLE_LABELS'].filter(name => !read(name)), []);
    same('and what they say on this build', JSON.parse(d.run(`JSON.stringify([WEEKLY_CLOSE_TEXT.reading, WEEKLY_CLOSE_TEXT.nobody,
        WEEKLY_CLOSE_TEXT.stateHeld, CLOSE_REMINDER_TEXT.line(1), CLOSE_REMINDER_TEXT.open, PAYSLIPS_TEXT.entry, OWES_TEXT.closures,
        OWES_REUSED.checkFirst, OTHER_ACCOUNT_SHOW, HOURS_UNPRICED_NOTE, PAY_CYCLE_LABELS])`)), ['מחשב את החשבונות…', 'אין עכשיו חשבונות לסגור.',
        'לא ייסגר', 'יש עובד אחד שהחשבון שלו עוד לא נסגר', 'לסגירת שבוע', '💬 תלוש לכל עובד', 'סגירות שנרשמו', CHECK_FIRST,
        'הצג את החשבון', HOURS_NOTE, { weekly: 'שבועי', biweekly: 'דו־שבועי' }]);

    // The words never said: the app does not record wages handed over.
    const strings = [...PAYDAY.matchAll(/'([^'\n]*)'|`([^`]*)`/g)].map(m => m[1] || m[2] || '').join('\n');
    same('no word that claims money was handed over or a message sent', ['נשלח', 'שולם', 'נמסר', 'שילמת'].filter(word => strings.indexOf(word) !== -1), []);
    check('no Arabic letter anywhere in the file (a word mixing two scripts reads as nonsense)', !/[؀-ۿ]/.test(PAYDAY));
    const code = PAYDAY.replace(/\/\/[^\n]*/g, '');
    same('it writes nothing: no Store, no storage, no commit, no close, no repayment, no browser dialog, no print',
        ['Store.set', 'Store.setVerified', 'Store.remove', 'localStorage', 'State.commit', 'State.save', 'closePeriodChanges',
            'saveFinancialAction', 'recordAdvance', 'appendLedgerEntry', 'alert(', 'confirm(', 'prompt(', 'window.print']
            .filter(word => code.indexOf(word) !== -1), []);
    check('its frame is in index.html: the dialog, its title first and entered at it, the body, «סגור»',
        /<div class="modal" id="paydayModal">\s*<div class="modal-content modal-wide">\s*<h3 id="paydayTitle" tabindex="-1"><\/h3>\s*<div id="paydayBody" class="payday-body"><\/div>\s*<div class="modal-actions">\s*<button type="button" class="btn-secondary" id="paydayClose" onclick="closePayday\(\)"><\/button>/.test(page));
    const scripts = [...page.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
    same('its script stands straight after advancereset.js, and after every file it reads at a tap', scripts.slice(scripts.indexOf('js/ui/advancereset.js'), scripts.indexOf('js/ui/advancereset.js') + 2),
        ['js/ui/advancereset.js', 'js/ui/payday.js']);
    check('and in the offline shell, after advancereset.js', /'\.\/js\/ui\/advancereset\.js',\s*'\.\/js\/ui\/payday\.js',/.test(source('sw.js')));
    check('Escape closes it through its own function', /paydayModal: \(\) => closePayday\(\)/.test(source('js/ui/modal.js')));
    check('render() asks it, through typeof', /if \(typeof renderPaydayIfOpen === 'function'\) renderPaydayIfOpen\(\);/.test(source('js/app.js')));

    // The screen, drawn: its sections in their order, under their words.
    d.call('openPayday');
    const body = d.dom.getElementById('paydayBody');
    same('the title and «סגור» are the frame\'s', [d.dom.getElementById('paydayTitle').textContent, d.dom.getElementById('paydayClose').textContent],
        ['יום תשלום', 'סגור']);
    same('drawn: the lead, then the four sections, in order', [body.querySelectorAll('.payday-lead')[0].textContent,
        body.querySelectorAll('.payday-section-head').map(node => node.textContent)],
    [T.lead, ['יום התשלום הבא', 'לפני שסוגרים', 'לסגירה', 'אחרי הסגירה']]);
    same('each card: its payday, its period, «נצבר», the deduction and «לתשלום» - label over value - and «לפי עובד»',
        body.querySelectorAll('.payday-card').map(node => [bare(node.querySelectorAll('.payday-card-head')[0].textContent),
            bare(node.querySelectorAll('.payday-card-range')[0].textContent),
            node.querySelectorAll('.payday-figure').map(cell => [cell.children[0].textContent, bare(cell.children[1].children[0].textContent)]),
            node.querySelectorAll('.payday-fold')[0].textContent]), facts(d).groups.map(group => [bare(group.heading), bare(group.range),
            group.figures.map(one => [one.label, bare(one.value)]), 'לפי עובד']));
    same('«לפי עובד» is shut when the desk opens, and says so', body.querySelectorAll('.payday-fold').map(node => node.getAttribute('aria-expanded')),
        ['false', 'false', 'false']);
    same('under it, each man in the roster\'s order with his figure, or «—»', body.querySelectorAll('.payday-man').map(node =>
        [node.dataset.worker, bare(node.children[1].children[0].textContent)]),
    facts(d).groups.reduce((all, group) => all.concat(group.rows.map(row => [row.workerId, bare(row.said)])), []));
    same('«לסגירה»: the owner\'s sentence, the held man under «לא ייסגר» with «סגירת שבוע»\'s reason',
        [body.querySelectorAll('.payday-close-say')[0].textContent, body.querySelectorAll('.payday-held-head')[0].textContent,
            body.querySelectorAll('.payday-held-man').map(node => bare(node.textContent))],
        ['יש 6 עובדים שהחשבון שלהם עוד לא נסגר', 'לא ייסגר',
            ['עומר · יש עודף בהחזרי המקדמות של העובד הזה. אי אפשר לסגור חשבון שלא מסתדר - תקן קודם, ואז סגור.']]);
    d.call('closePayday');
});

// ================================================================== P12 the row on «מקדמות»
await block('P12 the row on «מקדמות»: two buttons in one, one alone where «סגירת שבוע» is not, and a build without the file as before', async () => {
    const shape = node => ({ tag: node.tagName, cls: node.className, text: node.children.length ? undefined : node.textContent,
        kids: node.children.length ? node.children.map(shape) : undefined });
    const board = d => {
        d.run('ADVANCE_WORKER = null; OWES_PAGE = null; clear(document.getElementById("advancesView")); renderAdvances(); 1');
        return d.dom.getElementById('advancesView').querySelectorAll('.owes')[0];
    };
    const d = reopen(everything(), OPEN);
    const row = board(d).querySelectorAll('.owes-actions');
    same('one row, first in the board: «יום תשלום», then «סגירת שבוע»', [row.length, board(d).children[0].className,
        row[0].children.map(node => [node.className, node.textContent, node.id || ''])],
    [1, 'owes-actions', [['btn-secondary payday-entry', 'יום תשלום', 'paydayEntry'], ['btn-secondary weekly-close-entry', 'סגירת שבוע', '']]]);
    press(board(d).querySelectorAll('.payday-entry')[0]);
    check('the button opens the desk', d.call('paydayIsOpen') === true);
    d.call('closePayday');
    const w = reopen(everything(), NOWRITE);
    same('a build whose writer is shut: «סגירת שבוע» is not drawn, and «יום תשלום» stands alone in the row',
        board(w).querySelectorAll('.owes-actions')[0].children.map(node => node.textContent), ['יום תשלום']);
    // A build without the file: the same disk on a phone that never loaded js/ui/payday.js.
    const without = reopen(everything(), OPEN);
    without.run('paydayEntryButton = undefined; 1');
    const old = phone({ storage: everything().dump(), flags: OPEN });
    const before = UI.filter(file => file !== 'js/ui/payday.js');
    const plain = makeDevice({ deviceId: 'd_office', storage: everything().dump(), flags: OPEN });
    const dom = makeDom();
    ['reportsView', 'advancesView'].forEach(id => dom.register(id));
    const make = dom.createElement;
    dom.createElement = tag => { const node = make(tag); node.dataset = {}; return node; };
    plain.ctx.document = dom;
    plain.run = code => vm.runInContext(code, plain.ctx, { filename: 'payday-suite:without' });
    before.forEach(file => plain.run(source(file)));
    plain.run('var currentView = "advances";');
    plain.ctx.showView = () => {};
    plain.setToday(TODAY);
    plain.State.load();
    plain.dom = dom;
    given('the phone without the file has no such function', plain.run('typeof paydayEntryButton') === 'undefined' && old.run('typeof paydayEntryButton') === 'function');
    same('with paydayEntryButton undefined «מקדמות» is drawn node for node as by a build without the file',
        j(shape(board(without))), j(shape(board(plain))));
    check('and there «סגירת שבוע» is the board\'s first child, at full width, as before',
        board(plain).children[0].className === 'btn-secondary weekly-close-entry' && board(plain).querySelectorAll('.owes-actions').length === 0);
});

// ================================================================== P13 the transition sentence
//
// Revision 2. The sheet's sentence for a period a boundary cut short names the move TO WEEKLY
// pay («…לפני המעבר לתשלום שבועי.», js/ui/reports.js). The desk says it only of a stub that
// weekly pay follows; of a man going back to the fortnight it would be untrue, and there the
// period's dates stand alone.
await block('P13 the transition sentence only before weekly pay; any other stub shows its dates alone', async () => {
    const TRANSITION = 'תקופת מעבר: הימים שנשארו מהמחזור הקודם, לפני המעבר לתשלום שבועי.';
    const drawnCards = d => {
        d.call('openPayday');
        const out = d.dom.getElementById('paydayBody').querySelectorAll('.payday-card').map(node => [node.dataset.group,
            node.querySelectorAll('.payday-card-note').map(note => note.textContent), bare(node.querySelectorAll('.payday-card-range')[0].textContent)]);
        d.call('closePayday');
        return out;
    };

    // TO WEEKLY: טארק of the crew with everything, his fortnight cut by Friday 20/11.
    const e = reopen(everything(), OPEN);
    const ef = facts(e);
    const cut = card(ef, 'biweekly|2026-11-13|2026-11-19');
    given('טארק\'s period on 18/11 is the cut fortnight, and the week follows it',
        e.call('periodRangeFor', e.State.schedule.workers[5], '2026-11-20').cycle === 'weekly');
    same('a stub that weekly pay follows: a transition, toWeekly, and the sheet\'s sentence', [cut.transition, cut.toWeekly, cut.note],
        [true, true, TRANSITION]);
    same('no other card of that desk is a transition', ef.groups.filter(group => group !== cut).map(group => [group.key, group.transition, group.toWeekly, group.note]),
        [['weekly|2026-11-13|2026-11-19', false, false, null], ['biweekly|2026-11-13|2026-11-26', false, false, null]]);
    same('drawn: the note on that card, and on no other', drawnCards(e).map(([key, notes]) => [key, notes]),
        [['weekly|2026-11-13|2026-11-19', []], ['biweekly|2026-11-13|2026-11-26', []], ['biweekly|2026-11-13|2026-11-19', [TRANSITION]]]);

    // BACK TO THE FORTNIGHT: a weekly man who returns to fortnightly pay on Friday 20/11, the
    // second Friday of the fortnight 13/11-26/11 - from that day his period is a stub of that
    // fortnight (js/dates.js), and the full fortnight follows it.
    const b = phone({ today: '2026-11-22' });
    b.State.schedule.workers = [
        { id: 'w_bk', name: 'ראיד', active: true, dailyRate: 400, hourlyRate: 0, payCycles: '2026-08-07=weekly;2026-11-20=biweekly' },
        { id: 'w_st', name: 'נאדר', active: true, dailyRate: 450, hourlyRate: 0 }
    ];
    b.State.schedule.places = PLACES;
    weekdays('2026-11-13', '2026-11-22').forEach(date => ['w_bk', 'w_st'].forEach(id => day(b, id, date)));
    approve(b);
    kept(b);
    const back = reopen(b, OPEN);
    const his = JSON.parse(back.run('JSON.stringify([periodRangeFor(State.schedule.workers[0], "2026-11-22"), periodRangeFor(State.schedule.workers[0], "2026-11-27")])'));
    given('ראיד on 22/11: the stub 20/11-26/11 of the fortnight, cut short, and a full fortnight after it',
        his[0].from === '2026-11-20' && his[0].to === '2026-11-26' && his[0].transition === true && his[1].cycle === 'biweekly' && his[1].transition === false, j(his));
    const bf = facts(back);
    const stub = card(bf, 'biweekly|2026-11-20|2026-11-26');
    same('a stub the fortnight follows: a transition, not toWeekly, and no sentence', [stub.transition, stub.toWeekly, stub.note], [true, false, null]);
    same('drawn: its card has no note - its dates alone - and נאדר\'s full fortnight none either', drawnCards(back),
        [['biweekly|2026-11-13|2026-11-26', [], '13/11 - 26/11'], ['biweekly|2026-11-20|2026-11-26', [], '20/11 - 26/11']]);
});

report();
