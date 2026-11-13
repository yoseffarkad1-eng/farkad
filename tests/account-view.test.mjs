// v189: on its default range the pay sheet reads each man over HIS OWN period.
//
//   node tests/account-view.test.mjs
//
// THE OWNER, 2026-11-11, from his phone, on v186: «דוחות» → «לפי עובד», the range left
// where the page opens (30/10/2026 - 12/11/2026, the fortnight). Under «שבועי» the four
// weekly men each showed «נותר לתשלום» for fourteen days, under an amber sentence saying
// the range was not their period. His words: the weekly men show a two-week account -
// why? He had already ruled it in writing: a weekly man is shown his current week, a
// fortnightly man his fortnight.
//
// The page knew. It refused those men their carry and their closing button and said so,
// and opened on that range all the same. v189 changes WHICH period a man is read over
// while the page is on its default, and nothing else - so this suite is mostly one
// kind of claim, made against the bytes of the build that was served (9846d7f, v186,
// out of Git): for the same record
//
//   - every weekly man's row, table, cards, notes, dialog, statement and sheet cells on
//     the new default are what v186 draws when his week is picked by hand; and
//   - every fortnightly man's are what v186 draws on its default.
//
// No figure for a (man, period) pair is worked out a new way, so there is no new figure
// to pin: the proof is equality with the old build, cell for cell, under both readings of
// the money gates.
//
// And the things the old default existed to protect, each held here:
//   - nothing counted twice and nothing dropped: a man's periods inside the fortnight
//     add up to the row v186 drew for the fortnight, and each of them is either the one
//     shown, or named as an open account, or closed;
//   - the amber sentence, word for word, for the case it was written for - an explicit
//     range that is not the men's period;
//   - a close from the page closes exactly the period the page showed for that man.
//
// Synthetic data only: invented men, one invented site, no real record is read.

import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeDevice } from './harness.mjs';
import { makeDom } from './moneydom.mjs';
import { suite, check, same, given, report } from './runner.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPORTS = readFileSync(join(ROOT, 'js/ui/reports.js'), 'utf8');
const SITECOLOR = readFileSync(join(ROOT, 'js/ui/sitecolor.js'), 'utf8');

// The build the owner was holding: merged as 9846d7f, served 2026-11-10.
const V186 = '9846d7f';
let V186_REPORTS = null;
function v186Reports() {
    if (V186_REPORTS === null) {
        let code = '';
        try {
            code = execFileSync('git', ['-C', ROOT, 'show', `${V186}:js/ui/reports.js`],
                { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
        } catch (error) { code = ''; }
        given('the v186 commit is in this repository', code.length > 0, V186);
        given('and its pay sheet does not know the account view',
            !/reportAccountView|reportSpanFor/.test(code));
        given('and it is not the file under test', code !== REPORTS);
        V186_REPORTS = code;
    }
    return V186_REPORTS;
}

// The build on the phones when the owner asked for the names and the groups' colours
// (2026-11-11): origin/main, c33461b, v190. See the section about them below.
const V190 = 'c33461b';
let V190_REPORTS = null;
function v190Reports() {
    if (V190_REPORTS === null) {
        let code = '';
        try {
            code = execFileSync('git', ['-C', ROOT, 'show', `${V190}:js/ui/reports.js`],
                { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
        } catch (error) { code = ''; }
        given('the v190 commit is in this repository', code.length > 0, V190);
        given('and its headings carry no colour of their own', code.indexOf('data-cycle') === -1);
        V190_REPORTS = code;
    }
    return V190_REPORTS;
}

// Wednesday. The fortnight the page opens on, and its two weeks.
const TODAY = '2026-11-11';
const FORT = { from: '2026-10-30', to: '2026-11-12' };
const WEEK1 = { from: '2026-10-30', to: '2026-11-05' };
const WEEK2 = { from: '2026-11-06', to: '2026-11-12' };
const WEEKLY_SINCE = '2026-08-07';

const SHUT = { carryAdvances: false, ledgerWrites: false };
const OPEN = { carryAdvances: true, ledgerWrites: true };

const WEEKLY = ['w_wa', 'w_wb', 'w_wc', 'w_wd'];
const FORTNIGHTLY = ['w_ba', 'w_bb', 'w_bc'];

// One crew, each man the shape of one case:
//   w_wa  weekly: three days in week 1, two in week 2 (one double), 300 taken in week 2
//   w_wb  weekly: week 2 only, with an absence
//   w_wc  weekly: week 1 ONLY - nothing recorded in his current week
//   w_wd  weekly: 200 taken in week 2 and no day - a financial line
//   w_ba  fortnightly: a day in each week, 500 taken in week 1
//   w_bb  fortnightly: one double day
//   w_bc  fortnightly: 250 taken and no day - a financial line
//   w_no  nothing at all
function crew(device, extra) {
    device.State.schedule.workers = [
        { id: 'w_wa', name: 'כרם', active: true, dailyRate: 450, hourlyRate: 0, payCycles: `${WEEKLY_SINCE}=weekly` },
        { id: 'w_ba', name: 'סאלח', active: true, dailyRate: 500, hourlyRate: 0 },
        { id: 'w_wb', name: 'נאסר', active: true, dailyRate: 400, hourlyRate: 0, payCycles: `${WEEKLY_SINCE}=weekly` },
        { id: 'w_bb', name: 'עודי', active: true, dailyRate: 480, hourlyRate: 0 },
        { id: 'w_wc', name: 'זיאד', active: true, dailyRate: 420, hourlyRate: 0, payCycles: `${WEEKLY_SINCE}=weekly` },
        { id: 'w_wd', name: 'מאהר', active: true, dailyRate: 430, hourlyRate: 0, payCycles: `${WEEKLY_SINCE}=weekly` },
        { id: 'w_bc', name: 'רגא', active: true, dailyRate: 470, hourlyRate: 0 },
        { id: 'w_no', name: 'עלי', active: true, dailyRate: 410, hourlyRate: 0 }
    ].concat(extra || []);
    device.State.schedule.places = [{ id: 'p_01', name: 'פרסדיה', active: true }];
    const work = (id, date, rate) => device.State.commit(device.call('assignPlace',
        device.State.schedule, date, id, 'actual', 'p_01', rate || 'normal'));
    const cash = (id, date, amount) => device.State.commit(device.call('addAdvance',
        device.State.schedule, id, date, amount, ''));
    ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-08'].forEach(date => work('w_wa', date));
    work('w_wa', '2026-11-09', 'double');
    cash('w_wa', '2026-11-09', 300);
    ['2026-11-08', '2026-11-10'].forEach(date => work('w_wb', date));
    device.State.commit(device.call('markAbsent', device.State.schedule, '2026-11-09', 'w_wb', 'actual'));
    work('w_wc', '2026-11-02');
    cash('w_wd', '2026-11-10', 200);
    work('w_ba', '2026-11-01');
    work('w_ba', '2026-11-09');
    cash('w_ba', '2026-11-03', 500);
    work('w_bb', '2026-11-02', 'double');
    cash('w_bc', '2026-11-04', 250);
    return { work, cash };
}

function phone(flags, source, options = {}) {
    const device = makeDevice({ deviceId: 'd_view', flags });
    device.setToday(options.today || TODAY);
    const dom = makeDom();
    ['reportsView', 'workerDaysTitle', 'workerDaysMeta', 'workerDaysBody', 'workerDaysModal']
        .forEach(id => dom.register(id));
    device.ctx.document = dom;
    // The days dialog borrows appendSiteName from js/ui/sitecolor.js, which index.html
    // loads before the pay sheet (tests/money.display.test.mjs does the same).
    vm.runInContext(SITECOLOR, device.ctx, { filename: 'harness:sitecolor' });
    vm.runInContext(source || REPORTS, device.ctx, { filename: 'harness:reports' });
    // The three screens that read the sheet by POINTING its range (v184, v187, v188), over
    // whichever pay sheet this phone was given - see the section about them below.
    if (options.screens) {
        ['js/ui/seder.js', 'js/ui/workercard.js', 'js/ui/monthsummary.js', 'js/ui/payslips.js']
            .forEach(file => vm.runInContext(readFileSync(join(ROOT, file), 'utf8'), device.ctx,
                { filename: `harness:${file}` }));
    }
    device.ctx.askTell = () => Promise.resolve();
    device.ctx.askConfirm = () => Promise.resolve(true);
    device.ctx.render = () => {};
    device.run = code => vm.runInContext(code, device.ctx, { filename: 'harness:reports' });
    device.dom = dom;
    device.seed = (options.crew || crew)(device, options.extra);
    if (options.after) options.after(device);
    // "Gates open" means a record that may actually be READ the new way: the build's flag
    // and, where the record needs one, somebody's approval (tests/closure.test.mjs does
    // the same). Without it both readings below would be the shut one twice.
    if (flags && flags.carryAdvances) {
        const plan = device.call('planCarryMigration', device.State.schedule);
        if (plan.needed) {
            device.State.commit(device.call('recordCarryApproval', device.State.schedule,
                plan, '2026-10-29T09:00:00.000Z', 'd_person'));
        }
    }
    device.State.save({ silent: true });
    // THE GATE IS ASKED ONCE PER PHONE HERE, by the gate's own function. Every reader on
    // the pay sheet asks carryReportingEnabled for itself, and with an approval on the
    // record each asking re-plans the migration (js/ui/workercard.js measures it and
    // does the same inside one reading). No section below changes what it answers after
    // this line - nothing is approved or revoked later - and both builds are given the
    // same model's answer, so this costs the comparison nothing and saves it minutes.
    device.run(`(() => { const real = carryReportingEnabled; const asked = State.schedule; let known; let answer;
        carryReportingEnabled = schedule => {
            if (schedule !== asked) return real(schedule);
            if (!known) { answer = real(schedule); known = true; }
            return answer;
        }; })(); 1`);
    // The page as it OPENS: renderReports sets the range when there is none. The harness
    // has no reportsView to draw into, so the same two lines are run here.
    device.run(`(() => { const r = defaultPayrollRange(); REPORT_RANGE.from = r.from; REPORT_RANGE.to = r.to; })();`
        + `REPORT_PRESET='fortnight'; REPORT_SECTION='workers'; REPORT_WORKERS=null; INVOICE_PLACE=null; 1`);
    return device;
}
const byHand = (device, span, preset) => device.run(
    `REPORT_RANGE.from='${span.from}'; REPORT_RANGE.to='${span.to}'; REPORT_PRESET='${preset || 'custom'}'; 1`);

// ------------------------------------------------------------------ reading the page
const plain = text => String(text).replace(/[‎‏⁦⁧⁨⁩]/g, '');

// A node as everything a person or a stylesheet can tell about it.
//
// MOVED ON PURPOSE (the card that tells the account, 2026-11-11): the phone's CARDS are no
// longer v186's - they now carry the working, the extra hours and the man's own notes -
// so they are left out of the node-for-node comparison and read by `tiles` below instead.
// Everything else under a group - the table, its band, the notes, the fold, the financial
// lines - is still held to v186 node for node, and tests/reportsclarity.test.mjs holds
// every figure of a card to the table cell it is read from.
//
// MOVED ON PURPOSE (the groups' colours, the owner, 2026-11-11): data-cycle - the one
// attribute that says which pay group a heading, a group's table and cards, and its button
// in the row above belong to, for the stylesheet to colour - is a look and is left out of
// the node-for-node comparison here. tests/reportnames.test.mjs holds the attribute itself,
// and every text and every other attribute below is still held to v186.
function snap(node) {
    const out = { tag: node.tagName, cls: node.className || '' };
    const attrs = Object.keys(node.attributes || {}).filter(key => key !== 'id' && key !== 'data-cycle');
    if (attrs.length) out.attrs = attrs.sort().map(key => [key, node.attributes[key]]);
    const kids = node.children.filter(kid => kid.className !== 'report-worker-cards');
    if (node.children.length === 0) out.text = node.textContent;
    else out.kids = kids.map(snap);
    return out;
}

// The groups of the pay section: each heading that carries a cycle's anchor, and every
// node under it up to the next one. The financial block and the reconciliation band have
// headings of the same class and no anchor, so they stay inside their group.
function groupsOf(section) {
    const groups = [];
    let current = null;
    section.children.forEach(node => {
        const anchor = typeof node.id === 'string' && node.id.indexOf('report-cycle-') === 0;
        if (anchor) {
            current = { id: node.id, heading: node.textContent,
                workers: node.getAttribute('data-workers'), nodes: [] };
            groups.push(current);
        } else if (current) {
            current.nodes.push(node);
        }
    });
    return groups;
}
const pageOf = device => groupsOf(device.run('renderPayrollTable()'));
const groupOf = (device, id) => pageOf(device).filter(group => group.id === id)[0] || null;
// The group as drawn, without the one thing only the new default has under it.
const drawn = group => JSON.stringify(group.nodes
    .filter(node => node.className !== 'report-other-account').map(snap));
const classTexts = (group, cls) => group.nodes
    .reduce((all, node) => all.concat(node.classList.contains(cls) ? [node] : [],
        node.querySelectorAll('.' + cls)), [])
    .map(node => node.textContent);
// A card AS v186 SAID IT: the name, «נותר לתשלום» and its figure, the pay days, the days off,
// «פירוט». v186's card is exactly that text; this build's card says more between them, so
// the same six things are picked out of it by class and laid in v186's order - which keeps
// every comparison below a comparison of the figures a person was already shown.
const first = (node, cls) => node.querySelectorAll('.' + cls)[0];
function tileAsV186(tile) {
    if (!first(tile, 'report-tile-facts')) return tile.textContent;
    return first(tile, 'report-tile-name').textContent + 'נותר לתשלום'
        + first(tile, 'report-tile-figure').textContent
        + first(tile, 'report-tile-metric-work').textContent
        + first(tile, 'report-tile-metric-off').textContent + 'פירוט';
}
const tiles = group => group.nodes
    .reduce((all, node) => all.concat(node.querySelectorAll('.report-worker-tile')), [])
    .map(tile => ({ id: tile.getAttribute('data-report-worker-id'), text: plain(tileAsV186(tile)) }));

const AMBER = 'הטווח שנבחר אינו תקופת התשלום של העובדים האלה, ולכן זאת תצוגה של ימים ולא '
    + 'חשבון לתשלום: אין כאן יתרה מועברת ואי אפשר לסגור מכאן.';
const WHOLE = 'זאת תקופת התשלום המלאה של העובדים האלה.';

const rowsOf = (device, strip) => JSON.parse(device.run('JSON.stringify(payrollRows())'))
    .map(row => {
        const copy = Object.assign({}, row);
        if (strip) { delete copy.spanFrom; delete copy.spanTo; }
        return copy;
    });
const pick = (rows, ids) => rows.filter(row => ids.indexOf(row.workerId) !== -1);

const dialogOf = (device, id) => {
    device.run(`openWorkerDays('${id}')`);
    return {
        title: device.dom.getElementById('workerDaysTitle').textContent,
        meta: device.dom.getElementById('workerDaysMeta').textContent,
        body: JSON.stringify(device.dom.getElementById('workerDaysBody').children.map(snap))
    };
};

for (const [reading, flags] of [['gates shut', SHUT], ['gates open', OPEN]]) {
    // -------------------------------------------------------------- what the page is
    {
        suite(`${reading}: the page opens on each man's own period`);

        const device = phone(flags);
        given('the page opens on the fortnight containing today',
            device.run('JSON.stringify(REPORT_RANGE)') === JSON.stringify(FORT),
            device.run('JSON.stringify(REPORT_RANGE)'));
        check('the default is the account view', device.run('reportAccountView()') === true);
        same('a weekly man is read over his current week',
            JSON.parse(device.run(`JSON.stringify(reportSpanFor('w_wa'))`)), WEEK2);
        same('a fortnightly man over his fortnight',
            JSON.parse(device.run(`JSON.stringify(reportSpanFor('w_ba'))`)), FORT);
        same('and somebody the roster does not know over the range itself',
            JSON.parse(device.run(`JSON.stringify(reportSpanFor('w_gone'))`)), FORT);

        const page = pageOf(device);
        same('two groups, weekly first',
            page.map(group => group.id), ['report-cycle-weekly', 'report-cycle-biweekly']);
        // PINNED: each heading's TEXT - what the paper prints and the picture titles its table
        // with - says its own dates. MOVED ON PURPOSE (the owner, 2026-11-11: «שבועי» or
        // «דו־שבועי» is enough on the screen): the dates are the heading's .report-group-when,
        // which the screen alone leaves out (css/app.css), so the glass reads the cycle's word
        // and nothing else. tests/reportnames.browser.mjs measures the glass and the paper.
        same('the weekly heading says the week', plain(page[0].heading), 'שבועי · 06/11/2026 - 12/11/2026');
        same('the fortnightly heading says the fortnight', plain(page[1].heading), 'דו־שבועי · 30/10/2026 - 12/11/2026');
        check('the dates in a heading are one left-to-right run',
            page[0].heading === 'שבועי · ⁦06/11/2026 - 12/11/2026⁩', JSON.stringify(page[0].heading));
        const headings = device.run('renderPayrollTable()').querySelectorAll('.report-group')
            .filter(node => String(node.id || '').indexOf('report-cycle-') === 0);
        same('on the screen each heading is its cycle\'s word: the dates are the part the screen leaves out',
            headings.map(node => [node._text, node.children.map(kid => kid.className)]),
            [['שבועי', ['report-group-when']], ['דו־שבועי', ['report-group-when']]]);
        same('and each heading says which group it is, for its colour',
            headings.map(node => node.getAttribute('data-cycle')), ['weekly', 'biweekly']);
        same('the weekly count is the men with something in their week', page[0].workers, '3 עובדים');
        same('the fortnightly count is unchanged', page[1].workers, '3 עובדים');

        // THE AMBER SENTENCE IS GONE FROM THE DEFAULT - and nothing else took its place.
        const section = device.run('renderPayrollTable()');
        const warned = section.querySelectorAll('.hint-warn').map(node => node.textContent);
        check('no amber sentence about the range on the default',
            warned.every(text => text.indexOf('אינו תקופת התשלום') === -1), JSON.stringify(warned));
        same('the weekly group says it is their whole period',
            classTexts(page[0], 'hint').filter(text => text === WHOLE || text === AMBER), [WHOLE]);
        same('and so does the fortnightly group',
            classTexts(page[1], 'hint').filter(text => text === WHOLE || text === AMBER), [WHOLE]);
        check('no week-by-week fold: a week is one period',
            section.querySelectorAll('.report-weekly-breakdown').length === 0);
        same('the line at the head still names the range that holds both',
            plain(section.querySelectorAll('.report-period')[0].textContent),
            '30/10/2026 - 12/11/2026 · שישי–חמישי');

        const rows = rowsOf(device);
        same('one row a man, in the roster\'s order',
            rows.map(row => row.workerId), ['w_wa', 'w_ba', 'w_wb', 'w_bb', 'w_wd', 'w_bc']);
        check('every weekly row was read over the week', pick(rows, WEEKLY).every(row =>
            row.spanFrom === WEEK2.from && row.spanTo === WEEK2.to
            && row.periodFrom === WEEK2.from && row.periodTo === WEEK2.to && row.payCycle === 'weekly'),
            JSON.stringify(pick(rows, WEEKLY).map(row => [row.workerId, row.spanFrom, row.spanTo])));
        check('every fortnightly row over the fortnight', pick(rows, FORTNIGHTLY).every(row =>
            row.spanFrom === FORT.from && row.spanTo === FORT.to && row.payCycle === 'biweekly'),
            JSON.stringify(pick(rows, FORTNIGHTLY).map(row => [row.workerId, row.spanFrom, row.spanTo])));
        if (flags === OPEN) {
            check('gates open: a weekly man now HAS his account on the default',
                pick(rows, ['w_wa'])[0].carry && typeof pick(rows, ['w_wa'])[0].carry.deducted === 'number',
                JSON.stringify(pick(rows, ['w_wa'])[0].carry));
        }
    }

    // ------------------------------------------------- equality with the served build
    {
        suite(`${reading}: a weekly man on the default is v186's week picked by hand, cell for cell`);

        const now = phone(flags);
        const old = phone(flags, v186Reports());
        byHand(old, WEEK2, 'weekly');
        given('v186 with the week picked by hand settles the weekly men',
            classTexts(groupOf(old, 'report-cycle-weekly'), 'hint').indexOf(WHOLE) !== -1);

        const mine = groupOf(now, 'report-cycle-weekly');
        const theirs = groupOf(old, 'report-cycle-weekly');
        check('the weekly group - table, cards, band, notes, financial lines - is identical',
            drawn(mine) === drawn(theirs), `${drawn(mine).length} vs ${drawn(theirs).length} bytes`);
        given('and that comparison holds something',
            tiles(mine).length === 2 && drawn(mine).indexOf('report-finance-text') !== -1,
            JSON.stringify(tiles(mine)));
        same('every weekly card, as read', tiles(mine), tiles(theirs));
        same('every weekly row of the calculation',
            pick(rowsOf(now, true), WEEKLY), pick(rowsOf(old), WEEKLY));

        // And against THIS build with the week picked by hand, so the claim does not rest
        // on Git alone.
        const self = phone(flags);
        byHand(self, WEEK2, 'weekly');
        check('and identical to this build with the week picked by hand',
            drawn(mine) === drawn(groupOf(self, 'report-cycle-weekly')));

        WEEKLY.forEach(id => {
            const a = dialogOf(now, id);
            const b = dialogOf(old, id);
            check(`${id}: the days under his card are that week's, as v186 draws them`,
                a.body === b.body && a.title === b.title && plain(a.meta) === plain(b.meta),
                `${plain(a.meta)} vs ${plain(b.meta)}`);
            same(`${id}: his own statement`, now.run(`workerStatementText('${id}')`),
                old.run(`workerStatementText('${id}')`));
        });
        same('the dialog names the week', plain(dialogOf(now, 'w_wa').meta), '06/11/2026 - 12/11/2026');
    }

    {
        suite(`${reading}: a fortnightly man on the default is v186's default, cell for cell`);

        const now = phone(flags);
        const old = phone(flags, v186Reports());
        const mine = groupOf(now, 'report-cycle-biweekly');
        const theirs = groupOf(old, 'report-cycle-biweekly');
        given('v186 opens on the same fortnight',
            old.run('JSON.stringify(REPORT_RANGE)') === JSON.stringify(FORT));
        check('the fortnightly group is identical', drawn(mine) === drawn(theirs),
            `${drawn(mine).length} vs ${drawn(theirs).length} bytes`);
        given('and that comparison holds something',
            tiles(mine).length === 2 && drawn(mine).indexOf('report-finance-text') !== -1);
        same('every fortnightly card, as read', tiles(mine), tiles(theirs));
        same('every fortnightly row of the calculation',
            pick(rowsOf(now, true), FORTNIGHTLY), pick(rowsOf(old), FORTNIGHTLY));
        FORTNIGHTLY.forEach(id => {
            const a = dialogOf(now, id);
            const b = dialogOf(old, id);
            check(`${id}: his days dialog is unchanged`, a.body === b.body && a.meta === b.meta);
            same(`${id}: his own statement`, now.run(`workerStatementText('${id}')`),
                old.run(`workerStatementText('${id}')`));
        });
    }

    {
        suite(`${reading}: a crew paid fortnightly sees the page it always saw`);

        const only = device => {
            device.State.schedule.workers.forEach(worker => { delete worker.payCycles; });
        };
        const now = phone(flags, null, { after: only });
        const old = phone(flags, v186Reports(), { after: only });
        const a = now.run('renderPayrollTable()');
        const b = old.run('renderPayrollTable()');
        check('the whole pay section is identical, heading and all',
            JSON.stringify(snap(a)) === JSON.stringify(snap(b)));
        same('its heading carries no dates', a.querySelectorAll('.report-group')[0].textContent, 'דו־שבועי');
        same('and the sheet is the sheet',
            now.run('JSON.stringify(payrollSheetRows())'), old.run('JSON.stringify(payrollSheetRows())'));
        same('and the days', now.run('JSON.stringify(detailRows())'), old.run('JSON.stringify(detailRows())'));
    }

    // -------------------------------------------- nothing twice, nothing dropped
    {
        suite(`${reading}: a man's periods inside the fortnight are each accounted for, once`);

        const now = phone(flags);
        const old = phone(flags, v186Reports());
        const whole = rowsOf(old);     // v186's default: every man over fourteen days
        const report = (span, id) => now.call('payrollReport', now.State.schedule, span.from, span.to)
            .filter(row => row.workerId === id)[0];
        WEEKLY.forEach(id => {
            const was = pick(whole, [id])[0];
            const one = report(WEEK1, id);
            const two = report(WEEK2, id);
            check(`${id}: week 1 + week 2 is the fortnight v186 showed, to the day and the shekel`,
                one.attendanceDays + two.attendanceDays === was.attendanceDays
                && one.payUnits + two.payUnits === was.payUnits
                && one.absent + two.absent === was.absent
                && Number(one.advances) + Number(two.advances) === Number(was.advances)
                && Math.abs((one.amount || 0) + (two.amount || 0) - (was.amount || 0)) < 0.005,
                JSON.stringify([one.payUnits, two.payUnits, was.payUnits, one.amount, two.amount, was.amount]));
        });
        const others = JSON.parse(now.run('JSON.stringify(reportOtherOpenAccounts())'));
        same('the men with a recorded, unclosed week 1 are exactly the ones named',
            others.map(item => [item.workerId, item.from, item.to]),
            [['w_wa', WEEK1.from, WEEK1.to], ['w_wc', WEEK1.from, WEEK1.to]]);
        check('a man with nothing in week 1 is not named',
            others.every(item => item.workerId !== 'w_wb' && item.workerId !== 'w_wd'));
        check('a fortnightly man has no other period to name',
            others.every(item => FORTNIGHTLY.indexOf(item.workerId) === -1));
        const shownTwice = rowsOf(now).map(row => row.workerId)
            .filter((id, index, list) => list.indexOf(id) !== index);
        same('no man has two rows', shownTwice, []);

        // AS DRAWN, and word for word.
        const group = groupOf(now, 'report-cycle-weekly');
        const boxes = group.nodes.filter(node => node.className === 'report-other-account');
        same('one line for the one other period', boxes.length, 1);
        same('the sentence (PROPOSED), naming the dates and the men',
            plain(boxes[0].children[0].textContent),
            'חשבון פתוח נוסף, שאינו כלול בסכומים כאן: 30/10/2026 - 05/11/2026 · כרם, זיאד.');
        same('it is money: it reaches the paper and the picture', boxes[0].children[0].className, 'hint hint-money');
        same('the button (PROPOSED)', plain(boxes[0].children[1].textContent), 'הצג את החשבון 30/10 - 05/11');
        same('and it is a button', boxes[0].children[1].tagName, 'BUTTON');
        check('it comes before the financial lines of the week',
            group.nodes.indexOf(boxes[0]) < group.nodes.findIndex(node =>
                node.classList.contains('report-finance-line')));

        // PRESSED: the page is pointed at that week, as the chip «שבוע קודם» would.
        now.run(`showOtherAccount({ from: '${WEEK1.from}', to: '${WEEK1.to}' })`);
        same('the button points the page at that week', JSON.parse(now.run('JSON.stringify(REPORT_RANGE)')), WEEK1);
        same('with the chip that names it lit', now.run('REPORT_PRESET'), 'lastweek');
        check('which is an explicit range from then on', now.run('reportAccountView()') === false);
        byHand(old, WEEK1, 'lastweek');
        check('and what it shows there is v186\'s week 1, cell for cell',
            drawn(groupOf(now, 'report-cycle-weekly')) === drawn(groupOf(old, 'report-cycle-weekly')));
        same('with week 1\'s men on it', tiles(groupOf(now, 'report-cycle-weekly')).map(tile => tile.id), ['w_wa', 'w_wc']);
    }

    // ---------------------------------------------------- the files that leave the phone
    {
        suite(`${reading}: the exported sheets say what the screen says`);

        const now = phone(flags);
        const oldWeek = phone(flags, v186Reports());
        byHand(oldWeek, WEEK2, 'weekly');
        const oldFort = phone(flags, v186Reports());

        const sheet = JSON.parse(now.run('JSON.stringify(payrollSheetRows())'));
        const week = JSON.parse(oldWeek.run('JSON.stringify(payrollSheetRows())'));
        const fort = JSON.parse(oldFort.run('JSON.stringify(payrollSheetRows())'));
        const head = sheet[0];
        const noteAt = head.indexOf('הערה');
        const cycleAt = head.indexOf('מחזור תשלום');
        same('no column was added or moved (the third heading names what the column holds)',
            head.filter((cell, at) => at !== 8), fort[0].filter((cell, at) => at !== 8));
        given('the note and the cycle are where they were', noteAt === head.length - 2 && cycleAt === head.length - 1);
        const named = name => rows => rows.filter(row => row[0] === name)[0];
        [['כרם', 'w_wa'], ['נאסר', 'w_wb'], ['מאהר', 'w_wd']].forEach(([name, id]) => {
            const mine = named(name)(sheet);
            const theirs = named(name)(week);
            same(`${id}: every figure of his row is v186's week picked by hand`,
                mine.slice(1, noteAt), theirs.slice(1, noteAt));
            same(`${id}: and his row says whose days they are`,
                mine[cycleAt], 'שבועי · 06/11/2026 עד 12/11/2026');
        });
        same('w_wb: his note is what it was', named('נאסר')(sheet)[noteAt], named('נאסר')(week)[noteAt]);
        same('w_wa: his note keeps what it said and adds the open week (PROPOSED)',
            named('כרם')(sheet)[noteAt],
            [named('כרם')(week)[noteAt], 'חשבון פתוח נוסף, שאינו כלול בסכומים כאן: 30/10/2026 עד 05/11/2026']
                .filter(Boolean).join(' · '));
        [['סאלח', 'w_ba'], ['עודי', 'w_bb'], ['רגא', 'w_bc']].forEach(([name, id]) => {
            const mine = named(name)(sheet);
            const theirs = named(name)(fort);
            same(`${id}: a fortnightly row is v186's default row, whole`,
                mine.filter((cell, at) => at !== noteAt), theirs.filter((cell, at) => at !== noteAt));
            // v186 said in his note that a fortnight is not the WEEKLY men's period only on
            // their rows; his own note is untouched.
            same(`${id}: note included`, mine[noteAt], theirs[noteAt]);
        });
        // The man with an open week and no row: named, with no figure at all.
        const rowless = named('זיאד')(sheet);
        check('w_wc: a man with an open week and nothing this week is named after everybody else',
            rowless && sheet.indexOf(rowless) === sheet.length - 1, JSON.stringify(sheet.map(row => row[0])));
        same('w_wc: with no figure - blank is not nought',
            rowless.slice(1, noteAt), rowless.slice(1, noteAt).map(() => ''));
        same('w_wc: and the sentence',
            rowless[noteAt], 'חשבון פתוח נוסף, שאינו כלול בסכומים כאן: 30/10/2026 עד 05/11/2026');
        same('w_wc: and his own period', rowless[cycleAt], 'שבועי · 06/11/2026 עד 12/11/2026');
        same('every row has the heading\'s width', sheet.filter(row => row.length !== head.length), []);

        // The sheet's figures against the SCREEN's cards, man by man.
        const cards = pageOf(now).reduce((all, group) => all.concat(tiles(group)), []);
        const netAt = head.indexOf('לתשלום');
        const unitsAt = head.indexOf('ימי שכר');
        cards.forEach(card => {
            const worker = now.State.schedule.workers.filter(item => item.id === card.id)[0];
            const row = named(worker.name)(sheet);
            check(`${card.id}: the card's pay days and net are the sheet's`,
                card.text.indexOf(`${row[unitsAt]}ימי עבודה`) !== -1
                && Number(card.text.replace(/,/g, '').match(/נותר לתשלום(-?[\d.]+)/)[1]) === Number(row[netAt]),
                `${card.text} vs ${row[unitsAt]}, ${row[netAt]}`);
        });

        // The days sheet lists exactly the days the pay sheet counted.
        const detail = JSON.parse(now.run('JSON.stringify(detailRows())'));
        const weekDetail = JSON.parse(oldWeek.run('JSON.stringify(detailRows())'));
        const fortDetail = JSON.parse(oldFort.run('JSON.stringify(detailRows())'));
        const weeklyNames = ['כרם', 'נאסר', 'זיאד', 'מאהר'];
        same('a weekly man\'s days in the file are his week\'s',
            detail.slice(1).filter(row => weeklyNames.indexOf(row[2]) !== -1),
            weekDetail.slice(1).filter(row => weeklyNames.indexOf(row[2]) !== -1));
        same('a fortnightly man\'s are his fortnight\'s',
            detail.slice(1).filter(row => weeklyNames.indexOf(row[2]) === -1),
            fortDetail.slice(1).filter(row => weeklyNames.indexOf(row[2]) === -1));
        check('no weekly day outside the week is in the file',
            detail.slice(1).filter(row => weeklyNames.indexOf(row[2]) !== -1)
                .every(row => row[0] >= WEEK2.from && row[0] <= WEEK2.to));
        // The client's sheet is the range's, untouched.
        same('the client invoice sheet does not move',
            now.run('JSON.stringify(invoiceSheetRows())'), oldFort.run('JSON.stringify(invoiceSheetRows())'));
        same('nor the sites report', now.run('JSON.stringify(invoiceRows())'), oldFort.run('JSON.stringify(invoiceRows())'));
    }

    // ------------------------------------------ the amber sentence, where it belongs
    {
        suite(`${reading}: an explicit range that is not the men's period still says so, word for word`);

        const now = phone(flags);
        const old = phone(flags, v186Reports());

        // The same fourteen days, typed by hand: a way of looking at days.
        byHand(now, FORT, 'custom');
        check('the same dates typed by hand are not the account view', now.run('reportAccountView()') === false);
        const typed = groupOf(now, 'report-cycle-weekly');
        same('the weekly group carries the sentence', classTexts(typed, 'hint-warn').filter(text => text === AMBER), [AMBER]);
        same('its heading is the plain one', typed.heading, 'שבועי');
        check('and the page is v186\'s default, node for node',
            JSON.stringify(snap(now.run('renderPayrollTable()')))
            === JSON.stringify(snap(old.run('renderPayrollTable()'))));
        same('and so is the sheet', now.run('JSON.stringify(payrollSheetRows())'), old.run('JSON.stringify(payrollSheetRows())'));
        check('with no other-account line: every day of the range is on the page',
            now.run('reportOtherOpenAccounts().length') === 0);

        // A month, the week before last, and a past fortnight under the default chip.
        [[{ from: '2026-11-01', to: '2026-11-30' }, 'month'],
            [WEEK1, 'lastweek'],
            [{ from: '2026-10-16', to: '2026-10-29' }, 'fortnight']].forEach(([span, preset]) => {
            byHand(now, span, preset);
            byHand(old, span, preset);
            check(`${preset} ${span.from}: explicit, and v186's page node for node`,
                now.run('reportAccountView()') === false
                && JSON.stringify(snap(now.run('renderPayrollTable()')))
                    === JSON.stringify(snap(old.run('renderPayrollTable()'))));
            same(`${preset} ${span.from}: v186's sheet`,
                now.run('JSON.stringify(payrollSheetRows())'), old.run('JSON.stringify(payrollSheetRows())'));
        });
        byHand(now, { from: '2026-11-01', to: '2026-11-30' }, 'month');
        check('a month says it to every group',
            pageOf(now).every(group => classTexts(group, 'hint-warn').indexOf(AMBER) !== -1));

        // And back: the chip «תקופת החשבון» is the default again.
        byHand(now, FORT, 'fortnight');
        check('the account chip on today\'s fortnight is the account view', now.run('reportAccountView()') === true);
    }
}

// ----------------------------------------------------------------- closing an account
{
    suite('a close from the page closes exactly the period the page showed');

    const device = phone(OPEN);
    // What the dialog plans, recorded at the model's own door.
    device.run(`var PLANNED = []; (() => { const real = planPeriodClosure;
        planPeriodClosure = function (schedule, id, from, to) { PLANNED.push([id, from, to]); return real.apply(null, arguments); }; })(); 1`);
    device.run(`openWorkerDays('w_wa')`);
    const planned = JSON.parse(device.run('JSON.stringify(PLANNED)'));
    check('the closing block under a weekly man plans his week and nothing else',
        planned.length > 0 && planned.every(item => item[0] === 'w_wa' && item[1] === WEEK2.from && item[2] === WEEK2.to),
        JSON.stringify(planned));
    const body = device.dom.getElementById('workerDaysBody');
    check('and the block is offered - v186 offered none on the default',
        body.querySelectorAll('.period-closure').length === 1);
    const old = phone(OPEN, v186Reports());
    old.run(`openWorkerDays('w_wa')`);
    given('v186 offered no close to a weekly man on its default',
        old.dom.getElementById('workerDaysBody').querySelectorAll('.period-closure').length === 0);

    device.run('PLANNED.length = 0; 1');
    device.run(`openWorkerDays('w_ba')`);
    const fortnight = JSON.parse(device.run('JSON.stringify(PLANNED)'));
    check('a fortnightly man\'s plans his fortnight',
        fortnight.length > 0 && fortnight.every(item => item[1] === FORT.from && item[2] === FORT.to),
        JSON.stringify(fortnight));

    // «בחירת קיזוז מהשכר» on the default does not move the page off it.
    device.run(`openWorkerSettlement('w_wa')`);
    same('opening a weekly man\'s settlement leaves the range alone', JSON.parse(device.run('JSON.stringify(REPORT_RANGE)')), FORT);
    check('and the page is still the account view', device.run('reportAccountView()') === true);
    same('the settlement names his week', plain(device.dom.getElementById('workerDaysMeta').textContent), '06/11/2026 - 12/11/2026');

    // A deduction chosen for his week is the one his row on the default reads.
    device.run(`REPORT_DEDUCTIONS.set(reportDeductionKey('w_wa', '${WEEK2.from}', '${WEEK2.to}'), 100); 1`);
    same('the default row reads the deduction chosen for the week',
        rowsOf(device).filter(row => row.workerId === 'w_wa')[0].carry.deducted, 100);
    same('the key with no dates is his period\'s',
        device.run(`reportDeductionKey('w_wa')`), device.run(`reportDeductionKey('w_wa', '${WEEK2.from}', '${WEEK2.to}')`));
    device.run('REPORT_DEDUCTIONS.clear(); 1');

    // Closed through the app's own door, on the page's default.
    const plan = device.call('planPeriodClosure', device.State.schedule, 'w_wa', WEEK2.from, WEEK2.to, '2026-11-11T16:00:00.000Z', 300);
    given('his week can be closed', plan.canClose === true, JSON.stringify(plan.reasons));
    await device.run(`closeAccountFor(State.worker('w_wa'), planPeriodClosure(State.schedule, 'w_wa', '${WEEK2.from}', '${WEEK2.to}', new Date().toISOString(), 300))`);
    const closed = device.call('closedPeriods', device.State.schedule, 'w_wa');
    same('exactly one closure was written, and it opens on his week', Object.keys(closed), [WEEK2.from]);
    same('and ends on it', closed[WEEK2.from].periodTo, WEEK2.to);
    const row = rowsOf(device).filter(item => item.workerId === 'w_wa')[0];
    check('the default page then reads that week as closed', row.carry && row.carry.closed === true, JSON.stringify(row.carry));
    check('a fortnightly man is not closed by it',
        Object.keys(device.call('closedPeriods', device.State.schedule, 'w_ba')).length === 0);
}

{
    suite('a week that was closed is settled, and is not named again');

    const device = phone(OPEN);
    const before = JSON.parse(device.run('JSON.stringify(reportOtherOpenAccounts().map(item => item.workerId))'));
    given('both men are named before anything is closed', before.join() === 'w_wa,w_wc', before.join());
    const changes = device.call('closePeriodChanges', device.State.schedule, 'w_wa',
        WEEK1.from, WEEK1.to, '2026-11-05T18:00:00.000Z', 'd_view');
    given('week 1 closes', changes.length > 0);
    device.State.commitMany(changes);
    same('the closed week is no longer named; the open one still is',
        JSON.parse(device.run('JSON.stringify(reportOtherOpenAccounts().map(item => item.workerId))')), ['w_wc']);
    const box = groupOf(device, 'report-cycle-weekly').nodes.filter(node => node.className === 'report-other-account')[0];
    same('and the sentence names only him', plain(box.children[0].textContent),
        'חשבון פתוח נוסף, שאינו כלול בסכומים כאן: 30/10/2026 - 05/11/2026 · זיאד.');
}

// ------------------------------------------------------------------ the other days
for (const [reading, flags] of [['gates shut', SHUT], ['gates open', OPEN]]) {
    suite(`${reading}: the first morning of a new week, when everything owed is in the week just ended`);

    // Friday 6 November: nothing recorded in the new week yet.
    const early = device => {
        Object.keys(device.State.schedule.days).filter(date => date >= WEEK2.from)
            .forEach(date => { delete device.State.schedule.days[date]; });
        Object.keys(device.State.schedule.advances).forEach(id => {
            if (device.State.schedule.advances[id].date >= WEEK2.from) delete device.State.schedule.advances[id];
        });
        if (device.State.schedule.ledger && device.State.schedule.ledger.advances) {
            Object.keys(device.State.schedule.ledger.advances).forEach(id => {
                if (!device.State.schedule.advances[id]) delete device.State.schedule.ledger.advances[id];
            });
        }
    };
    const device = phone(flags, null, { today: '2026-11-06', after: early });
    given('the fortnight is the same one', device.run('JSON.stringify(REPORT_RANGE)') === JSON.stringify(FORT));
    given('no weekly man has a row in the new week',
        rowsOf(device).every(row => WEEKLY.indexOf(row.workerId) === -1));
    const page = pageOf(device);
    const weekly = page.filter(group => group.id === 'report-cycle-weekly')[0];
    check('the weekly group is still on the page', Boolean(weekly), JSON.stringify(page.map(group => group.id)));
    same('under its own week', plain(weekly.heading), 'שבועי · 06/11/2026 - 12/11/2026');
    same('saying there are no days in it yet', classTexts(weekly, 'hint-money')[0], 'אין ימי עבודה בתקופה הזו.');
    same('and naming the week that is owed',
        plain(classTexts(weekly, 'hint-money')[1]),
        'חשבון פתוח נוסף, שאינו כלול בסכומים כאן: 30/10/2026 - 05/11/2026 · כרם, זיאד.');
    // With only weekly men chosen there is no row at all - and the page is not "empty".
    device.run(`REPORT_WORKERS = new Set(${JSON.stringify(WEEKLY)}); 1`);
    const section = device.run('renderPayrollTable()');
    check('with no row at all the page does not say there is nothing',
        section.querySelectorAll('.empty-hint').length === 0
        && section.querySelectorAll('.report-other-account').length === 1);
    same('and its head names the one period on it',
        plain(section.querySelectorAll('.report-period')[0].textContent), '06/11/2026 - 12/11/2026 · שישי–חמישי');
    const sheet = JSON.parse(device.run('JSON.stringify(payrollSheetRows())'));
    same('the file names both men, with no figure', sheet.slice(1).map(row => [row[0], row[1], row[sheet[0].indexOf('לתשלום')]]),
        [['כרם', '', ''], ['זיאד', '', '']]);
}

{
    suite('the first week of the fortnight: a weekly man is read over week 1');

    const device = phone(OPEN, null, { today: '2026-11-04' });
    same('his period is week 1', JSON.parse(device.run(`JSON.stringify(reportSpanFor('w_wa'))`)), WEEK1);
    same('the heading says so', plain(groupOf(device, 'report-cycle-weekly').heading), 'שבועי · 30/10/2026 - 05/11/2026');
    // The seed already holds days dated after "today": they are the other account.
    same('days already recorded in the week ahead are named, not dropped',
        JSON.parse(device.run('JSON.stringify(reportOtherOpenAccounts().map(item => [item.workerId, item.from]))')),
        [['w_wa', WEEK2.from], ['w_wb', WEEK2.from], ['w_wd', WEEK2.from]]);
    device.run(`showOtherAccount({ from: '${WEEK2.from}', to: '${WEEK2.to}' })`);
    same('a week that is not «שבוע קודם» opens as two dates', device.run('REPORT_PRESET'), 'custom');
}

{
    suite('a crew paid weekly: one period on the page, and the page names it');

    const all = device => device.State.schedule.workers.forEach(worker => {
        worker.payCycles = `${WEEKLY_SINCE}=weekly`;
    });
    const device = phone(OPEN, null, { after: all });
    const section = device.run('renderPayrollTable()');
    same('the head of the page is the week',
        plain(section.querySelectorAll('.report-period')[0].textContent), '06/11/2026 - 12/11/2026 · שישי–חמישי');
    same('one group', pageOf(device).map(group => plain(group.heading)), ['שבועי · 06/11/2026 - 12/11/2026']);
    const old = phone(OPEN, v186Reports(), { after: all });
    byHand(old, WEEK2, 'weekly');
    check('and it is v186\'s week picked by hand, cell for cell',
        drawn(pageOf(device)[0]) === drawn(pageOf(old)[0]));
}

{
    suite('a man a boundary cut short stands in a period of his own');

    // Weekly from the SECOND Friday of this fortnight: seven days behind him under the
    // old cycle, nobody's whole fortnight and nobody's week.
    const cut = [{ id: 'w_cut', name: 'ג׳מאל', active: true, dailyRate: 440, hourlyRate: 0,
        payCycles: `${WEEK2.from}=weekly` }];
    const seeded = device => {
        device.seed.work('w_cut', '2026-11-02');
        device.seed.work('w_cut', '2026-11-09');
    };
    const device = phone(OPEN, null, { extra: cut, after: seeded });
    same('today he is read over his first week', JSON.parse(device.run(`JSON.stringify(reportSpanFor('w_cut'))`)), WEEK2);
    check('and the seven days behind him are named as an open account',
        JSON.parse(device.run('JSON.stringify(reportOtherOpenAccounts())'))
            .some(item => item.workerId === 'w_cut' && item.from === WEEK1.from && item.to === WEEK1.to));

    // The week before: he is IN the stub, and it is not the others' fortnight.
    const stub = phone(OPEN, null, { extra: cut, after: seeded, today: '2026-11-04' });
    same('in the first week his period is the seven days the boundary left',
        JSON.parse(stub.run(`JSON.stringify(reportSpanFor('w_cut'))`)), WEEK1);
    const page = pageOf(stub);
    const ids = page.map(group => group.id);
    same('he has a group of his own under his cycle\'s title, with its own anchor',
        ids, ['report-cycle-weekly', 'report-cycle-biweekly', `report-cycle-biweekly-${FORT.from}`].sort((a, b) => ids.indexOf(a) - ids.indexOf(b)));
    check('no two anchors are the same', ids.filter((id, at) => ids.indexOf(id) !== at).length === 0, ids.join());
    const his = page.filter(group => tiles(group).some(tile => tile.id === 'w_cut'))[0];
    same('headed with his dates', plain(his.heading), 'דו־שבועי · 30/10/2026 - 05/11/2026');
    same('alone in it', tiles(his).map(tile => tile.id), ['w_cut']);
    check('and called what it is', classTexts(his, 'hint')
        .indexOf('תקופת מעבר: הימים שנשארו מהמחזור הקודם, לפני המעבר לתשלום שבועי.') !== -1,
        JSON.stringify(classTexts(his, 'hint')));
}

// ------------------------------------------- the screens that point the sheet's range
//
// Three screens read the pay sheet by assigning REPORT_RANGE inside one synchronous step
// and putting it back: the worker's card (workerCardScope), the month's summary
// (monthSummaryScope) and the payslips (payslipsScope). None of them touches the chip, so
// on a page that has never left its default each of them points a range while the chip
// still says «תקופת החשבון» - and the account view asks exactly that chip.
//
// What keeps them reading what they read: a month is never the fortnight; and a card or a
// payslip group points at a man's OWN period, which is either not the fortnight (explicit,
// read as ever) or IS the fortnight because it is his period - and then reportSpanFor
// answers that same range. So for every man a pointed reading is about, the range he is
// read over is the range that was pointed. That is the invariant, and it is measured at
// the sheet's own door, on every call these screens make - then the screens' whole
// answers are held against the same screens over v186's pay sheet.
for (const [reading, flags] of [['gates shut', SHUT], ['gates open', OPEN]]) {
    suite(`${reading}: the card, the month and the payslips read what they read before`);

    const watch = device => device.run(`var POINTED = { calls: 0, wrong: [] }; (() => {
        const real = payrollRows;
        payrollRows = function () {
            POINTED.calls += 1;
            if (typeof reportSpanFor === 'function') {
                const ids = REPORT_WORKERS === null ? State.schedule.workers.map(w => String(w.id)) : [...REPORT_WORKERS];
                const pointedAway = !(REPORT_RANGE.from === '${FORT.from}' && REPORT_RANGE.to === '${FORT.to}');
                if (pointedAway && reportAccountView()) POINTED.wrong.push('account view on ' + REPORT_RANGE.from);
                if (REPORT_WORKERS !== null || pointedAway) ids.forEach(id => {
                    const span = reportSpanFor(id);
                    if (span.from !== REPORT_RANGE.from || span.to !== REPORT_RANGE.to) {
                        POINTED.wrong.push(id + ' read over ' + span.from + '..' + span.to
                            + ' under ' + REPORT_RANGE.from + '..' + REPORT_RANGE.to);
                    }
                });
            }
            return real.apply(this, arguments);
        }; })(); 1`);
    const now = phone(flags, null, { screens: true });
    const old = phone(flags, v186Reports(), { screens: true });
    watch(now); watch(old);
    const ask = (device, code) => device.run(`JSON.stringify(${code})`);
    const everyone = now.State.schedule.workers.map(worker => worker.id);

    everyone.forEach(id => same(`${id}: his card, whole, is the card over v186's sheet`,
        ask(now, `workerCardFacts('${id}')`), ask(old, `workerCardFacts('${id}')`)));
    ['2026-11', '2026-10'].forEach(key => {
        same(`${key}: the month's summary, whole`, ask(now, `monthSummaryFacts('${key}')`), ask(old, `monthSummaryFacts('${key}')`));
        same(`${key}: and its text`, now.run(`monthSummaryText(monthSummaryFacts('${key}'))`),
            old.run(`monthSummaryText(monthSummaryFacts('${key}'))`));
    });
    ['current', 'previous'].forEach(which => same(`payslips, ${which}: every man's text and figure`,
        ask(now, `payslipsFacts('${which}')`), ask(old, `payslipsFacts('${which}')`)));
    given('those answers hold something', JSON.parse(ask(now, `payslipsFacts('current')`)).rows.length >= 5
        && JSON.parse(ask(now, `workerCardFacts('w_wa')`)) !== null);

    const pointed = JSON.parse(ask(now, 'POINTED'));
    given('the screens did ask the sheet', pointed.calls >= 10, String(pointed.calls));
    same('every pointed reading read each of its men over the range that was pointed', pointed.wrong, []);
    same('and the page is where it was: range, chip and filter',
        JSON.parse(ask(now, '[REPORT_RANGE, REPORT_PRESET, REPORT_WORKERS]')), [FORT, 'fortnight', null]);

    // THE PAYSLIP AND THE DEFAULT CARD ARE NOW THE SAME ACCOUNT. Until v189 the list read
    // a weekly man over his week while the page under it showed him a fortnight; both are
    // his period now, so the figure on his slip is the figure on his card - every man's.
    const slips = JSON.parse(ask(now, `payslipsFacts('current')`)).rows;
    const cards = pageOf(now).reduce((all, group) => all.concat(group.nodes
        .reduce((found, node) => found.concat(node.querySelectorAll('.report-worker-tile')), [])), [])
        .map(tile => ({ id: tile.getAttribute('data-report-worker-id'),
            net: plain(tile.querySelectorAll('.report-tile-value')[0].textContent).replace(/\s*\*$/, '').trim() }));
    given('there are cards for weekly and fortnightly men', cards.some(card => card.id === 'w_wa') && cards.some(card => card.id === 'w_ba'));
    cards.forEach(card => {
        const slip = slips.filter(row => row.workerId === card.id)[0];
        check(`${card.id}: the figure on his payslip is the figure on his card`,
            slip && now.run(`payslipsBare(${JSON.stringify(slip.figure)})`) === card.net,
            `${slip && slip.figure} vs ${card.net}`);
        const span = JSON.parse(ask(now, `reportSpanFor('${card.id}')`));
        check(`${card.id}: and both are over the same period`,
            slip && slip.period && slip.period.from === span.from && slip.period.to === span.to,
            JSON.stringify(slip && slip.period));
        same(`${card.id}: and the slip's text is the statement the card's dialog sends`,
            slip && slip.text, now.run(`workerStatementText('${card.id}')`));
    });
    // The rows of the calculation, man for man: the list's own reading against the page's.
    const rowsNow = rowsOf(now);
    same('the men with a slip are the men with a row on the default page',
        slips.map(row => row.workerId), rowsNow.map(row => row.workerId));
}

{
    suite('the account view is derived, never stored');

    const device = phone(OPEN);
    const before = device.run('JSON.stringify(REPORT_RANGE)');
    device.run('renderPayrollTable(); payrollSheetRows(); detailRows(); reportOtherOpenAccounts(); 1');
    device.run(`openWorkerDays('w_wa'); workerStatementText('w_wa'); 1`);
    same('reading the page moves the range nowhere', device.run('JSON.stringify(REPORT_RANGE)'), before);
    same('nor the chip', device.run('REPORT_PRESET'), 'fortnight');
    // The worker's card points the sheet at one man by assigning the range (js/ui/
    // workercard.js). A week assigned that way is an explicit range, read as it always was.
    byHand(device, WEEK2, 'fortnight');
    check('a range that is not today\'s fortnight is explicit whatever the chip says',
        device.run('reportAccountView()') === false);
    same('and every man is then read over it',
        JSON.parse(device.run(`JSON.stringify(reportSpanFor('w_ba'))`)), WEEK2);
    // Midnight: the fortnight moves on, and a page still holding the old range is explicit.
    byHand(device, FORT, 'fortnight');
    device.setToday('2026-11-13');
    check('after the fortnight ends the same range is no longer the default', device.run('reportAccountView()') === false);
    // Before the page has ever opened there is no range, and no view.
    device.run('REPORT_RANGE.from = null; REPORT_RANGE.to = null; 1');
    check('no range, no account view', device.run('reportAccountView()') === false);
}

// ------------------------------- the names and the groups' colours moved no figure
//
// The owner, 2026-11-11, on v190: the names clearer, and the groups told by their word and a
// colour rather than by dates. A change of LOOK on the one page pay is read from, so it is
// held here to the build he was holding - v190, c33461b, out of Git - on this suite's own
// crew: every card as a person reads it, every row of every table, every band, the whole
// text of the pay section (the headings' dates included, which the paper and the picture
// print), every sheet of the file, every row of the calculation and every man's statement,
// on the default and on three explicit ranges, under both readings of the money gates.
// (v190Reports, beside v186Reports at the top of this file, reads it.)
const figuresOf = device => {
    const section = device.run('renderPayrollTable()');
    return {
        cards: section.querySelectorAll('.report-worker-tile').map(tile =>
            [tile.getAttribute('data-report-worker-id'), tile.textContent]),
        tables: section.querySelectorAll('.report-payroll-group').map(group => {
            const table = group.querySelectorAll('TABLE')[0];
            const rows = tag => table.querySelectorAll(tag + ' TR').map(tr => tr.children.map(cell => cell.textContent));
            return { head: rows('THEAD'), body: rows('TBODY'), foot: rows('TFOOT') };
        }),
        headings: section.querySelectorAll('.report-group').map(node => [node.textContent, node.getAttribute('data-workers')]),
        text: section.textContent
    };
};
for (const [reading, flags] of [['gates shut', SHUT], ['gates open', OPEN]]) {
    for (const [view, span, preset] of [['the default', null, null], ['the fortnight by hand', FORT, 'custom'],
        ['a week by hand', WEEK2, 'weekly'], ['the month', { from: '2026-11-01', to: '2026-11-30' }, 'month']]) {
        suite(`${reading}, ${view}: every figure of every card and row is v190's`);
        const now = phone(flags);
        const old = phone(flags, v190Reports());
        if (span) { byHand(now, span, preset); byHand(old, span, preset); }
        const a = figuresOf(now);
        const b = figuresOf(old);
        given('the page holds cards and rows', a.cards.length >= 3 && a.tables.length >= 1, String(a.cards.length));
        same('every card, man by man, word for word', a.cards, b.cards);
        same('every table: its heads, its rows and its band', a.tables, b.tables);
        same('every heading\'s text and count (the dates the paper and the picture print)', a.headings, b.headings);
        check('the whole text of the pay section', a.text === b.text, `${a.text.length} vs ${b.text.length} chars`);
        same('every sheet of the file', now.run('JSON.stringify(reportSheets())'), old.run('JSON.stringify(reportSheets())'));
        same('every row of the calculation', rowsOf(now), rowsOf(old));
        now.State.schedule.workers.forEach(worker => same(`${worker.id}: his statement`,
            now.run(`workerStatementText('${worker.id}')`), old.run(`workerStatementText('${worker.id}')`)));
        ['w_wa', 'w_ba'].forEach(id => {
            const x = dialogOf(now, id);
            const y = dialogOf(old, id);
            check(`${id}: his days dialog, title and all`, x.title === y.title && x.meta === y.meta && x.body === y.body);
        });
    }
}

{
    suite('the shipped source: the words are in one place');

    const names = ['OTHER_ACCOUNT_OPEN', 'OTHER_ACCOUNT_SHOW'];
    names.forEach(name => check(`${name} is declared once`,
        REPORTS.split(`const ${name} =`).length === 2));
    check('the amber sentence is in the source word for word', REPORTS.indexOf(
        "'הטווח שנבחר אינו תקופת התשלום של העובדים האלה, ולכן זאת תצוגה של ימים ולא '") !== -1);
    check('the pay sheet does not call window.print, confirm, alert or prompt for any of this',
        !/\b(?:window\.)?(?:confirm|alert|prompt)\(/.test(REPORTS.replace(/askConfirm\(/g, '')));
}

report();
