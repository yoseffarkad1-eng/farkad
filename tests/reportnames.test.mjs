// The names, the groups and one word on «דוחות» ← «לפי עובד» - held in Node.
//
//   node tests/reportnames.test.mjs
//
// THE OWNER, 2026-11-11, on v190, two requests about the reports page:
//   (a) "can the names show more and be clearer, maybe in another colour, so I don't search
//       much for the name";
//   (b) "there is no need to write the dates for the workers who are paid weekly; it is
//       enough to write שבוע or דו שבועי, distinguishing between them with colours".
// And one word nobody asked about and everybody read: the preview under «כמה לקזז מהשכר
// הפעם?» said «יישארו בסلف» - a Hebrew word with two Arabic letters in it - from v117 on.
//
// What this suite holds, in Node (the glass - sizes, colours, contrast, the paper, the
// picture - is tests/reportnames.browser.mjs):
//
//   - the preview says what is left owed in the confirmation's own words, and no word under
//     js/ mixes Hebrew and Arabic letters again;
//   - a group's heading is its cycle's word, and the dates a page with two periods needs on
//     paper and in the picture are still IN the heading, in a part of it the screen alone
//     leaves out (.report-group-when) - so the paper, the picture and the file say exactly
//     what v190 said, byte for byte;
//   - each group and its heading carry the cycle they are (data-cycle), which is all the
//     stylesheet needs to colour them, and every man is in the group his cycle says;
//   - NOT ONE FIGURE MOVED: every card, every row, every band, every sheet of the file and
//     every statement is v190's (c33461b, out of Git), on the default and on explicit
//     ranges, with the money gates shut and open.
//
// Synthetic data only: invented men, one invented site.

import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeDevice } from './harness.mjs';
import { makeDom, tableText } from './moneydom.mjs';
import { suite, check, same, given, report } from './runner.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPORTS = readFileSync(join(ROOT, 'js/ui/reports.js'), 'utf8');
const SITECOLOR = readFileSync(join(ROOT, 'js/ui/sitecolor.js'), 'utf8');

// The build on the phones when the owner asked: origin/main, served 2026-11-11 19:38 UTC.
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
        given('and its preview is the one the owner read', code.indexOf('יישארו בסلف') !== -1);
        given('and it is not the file under test', code !== REPORTS);
        V190_REPORTS = code;
    }
    return V190_REPORTS;
}

const TODAY = '2026-11-11';
const FORT = { from: '2026-10-30', to: '2026-11-12' };
const WEEK2 = { from: '2026-11-06', to: '2026-11-12' };
const SHUT = { carryAdvances: false, ledgerWrites: false };
const OPEN = { carryAdvances: true, ledgerWrites: true };
const plain = text => String(text).replace(/[‎‏⁦-⁩]/g, '');

// One crew, weekly and fortnightly men on one page:
//   w_wa  weekly: days in both weeks, a double, 500 taken in his week
//   w_wb  weekly: his week only
//   w_wc  weekly: the week before only - an open account the default does not show
//   w_ba  fortnightly: a day in each week, 300 taken
//   w_bb  fortnightly: one double day
//   w_bc  fortnightly: 250 taken and no day - a financial line
function crew(device) {
    const W = '2026-08-07=weekly';
    device.State.schedule.workers = [
        { id: 'w_wa', name: 'כרם נסאר', active: true, dailyRate: 450, hourlyRate: 0, payCycles: W },
        { id: 'w_ba', name: 'סאלח מנסור', active: true, dailyRate: 500, hourlyRate: 0 },
        { id: 'w_wb', name: 'דוגמה הא עם שם ארוך במיוחד לבדיקת הרוחב', active: true, dailyRate: 400, hourlyRate: 0, payCycles: W },
        { id: 'w_bb', name: 'עודי חסן', active: true, dailyRate: 480, hourlyRate: 0 },
        { id: 'w_wc', name: 'זיאד חלבי', active: true, dailyRate: 420, hourlyRate: 0, payCycles: W },
        { id: 'w_bc', name: 'רגא', active: true, dailyRate: 470, hourlyRate: 0 }
    ];
    device.State.schedule.places = [{ id: 'p_01', name: 'פרסדיה', active: true }];
    const work = (id, date, rate) => device.State.commit(device.call('assignPlace',
        device.State.schedule, date, id, 'actual', 'p_01', rate || 'normal'));
    const cash = (id, date, amount) => device.State.commit(device.call('addAdvance',
        device.State.schedule, id, date, amount, ''));
    ['2026-11-01', '2026-11-02', '2026-11-08'].forEach(date => work('w_wa', date));
    work('w_wa', '2026-11-09', 'double');
    cash('w_wa', '2026-11-09', 500);
    ['2026-11-08', '2026-11-10'].forEach(date => work('w_wb', date));
    work('w_wc', '2026-11-02');
    work('w_ba', '2026-11-01'); work('w_ba', '2026-11-09');
    cash('w_ba', '2026-11-03', 300);
    work('w_bb', '2026-11-02', 'double');
    cash('w_bc', '2026-11-04', 250);
}

function phone(flags, source) {
    const device = makeDevice({ deviceId: 'd_names', flags });
    device.setToday(TODAY);
    const dom = makeDom();
    ['reportsView', 'workerDaysTitle', 'workerDaysMeta', 'workerDaysBody', 'workerDaysModal']
        .forEach(id => dom.register(id));
    device.ctx.document = dom;
    vm.runInContext(SITECOLOR, device.ctx, { filename: 'harness:sitecolor' });
    vm.runInContext(source || REPORTS, device.ctx, { filename: 'harness:reports' });
    device.asked = [];
    device.ctx.askTell = () => Promise.resolve();
    device.ctx.askConfirm = options => { device.asked.push(options); return Promise.resolve(false); };
    device.ctx.render = () => {};
    device.run = code => vm.runInContext(code, device.ctx, { filename: 'harness:reports' });
    device.dom = dom;
    crew(device);
    if (flags.carryAdvances) {
        const plan = device.call('planCarryMigration', device.State.schedule);
        if (plan.needed) {
            device.State.commit(device.call('recordCarryApproval', device.State.schedule,
                plan, '2026-10-29T09:00:00.000Z', 'd_person'));
        }
    }
    device.State.save({ silent: true });
    device.run(`(() => { const r = defaultPayrollRange(); REPORT_RANGE.from = r.from; REPORT_RANGE.to = r.to; })();`
        + `REPORT_PRESET='fortnight'; REPORT_SECTION='workers'; REPORT_WORKERS=null; INVOICE_PLACE=null; 1`);
    return device;
}
const byHand = (device, span) => device.run(
    `REPORT_RANGE.from='${span.from}'; REPORT_RANGE.to='${span.to}'; REPORT_PRESET='custom'; 1`);

// ---------------------------------------------------------------- 1. the word
suite('the preview says what is left owed in the confirmation\'s own words');
{
    const device = phone(OPEN);
    // His week is 06/11 - 12/11: 08/11 and the double 09/11, three units at 450 = 1,350;
    // 500 taken on 09/11; 300 chosen to come off this time: 1,050 to him, 200 still owed.
    device.run(`REPORT_DEDUCTIONS.set(reportDeductionKey('w_wa'), 300); 1`);
    const box = device.run(`renderPeriodClosure(State.worker('w_wa'))`);
    given('the closing block is offered for his week', box && box.querySelectorAll('.finance-preview').length === 1);
    const preview = box.querySelectorAll('.finance-preview')[0].textContent;
    same('the preview, word for word (PROPOSED)', preview, 'לתשלום לעובד: 1050 ₪ · יישאר חוב פתוח: 200 ₪');
    check('no Arabic letter is left in it', !/\p{Script=Arabic}/u.test(preview), JSON.stringify(preview));
    const old = phone(OPEN, v190Reports());
    old.run(`REPORT_DEDUCTIONS.set(reportDeductionKey('w_wa'), 300); 1`);
    const was = old.run(`renderPeriodClosure(State.worker('w_wa'))`).querySelectorAll('.finance-preview')[0].textContent;
    same('v190 said the same two figures under the broken word', was, 'לתשלום לעובד: 1050 ₪ · יישארו בסلف: 200 ₪');
    // The question that commits it, asked for the same choice: the same three words.
    device.run(`closeAccountFor(State.worker('w_wa'), planPeriodClosure(State.schedule, 'w_wa', '${WEEK2.from}', '${WEEK2.to}', new Date().toISOString(), 300)); 1`);
    given('the confirmation was asked', device.asked.length === 1);
    check('the confirmation says «ויישאר חוב פתוח 200 ₪», the figure the preview names',
        plain(device.asked[0].message).indexOf('ויישאר חוב פתוח 200 ₪.') !== -1, device.asked[0].message);
    // The other sentence of the preview - before a figure is typed - is v190's.
    const blank = phone(OPEN);
    const before = blank.run(`renderPeriodClosure(State.worker('w_wa'))`).querySelectorAll('.finance-preview')[0].textContent;
    same('with nothing typed the preview is what it was', before,
        'שכר התקופה: 1350 ₪ · ניתן לקזז עד 500 ₪. בחר את הסכום בעצמך.');
}

// ---------------------------------------------------------------- 2. the groups
const headingsOf = section => section.querySelectorAll('.report-group')
    .filter(node => String(node.id || '').indexOf('report-cycle-') === 0);
// What the SCREEN shows of a heading: its own text, without the part css/app.css hides there.
const onScreen = heading => heading._text + heading.children
    .filter(kid => !kid.classList.contains('report-group-when')).map(kid => kid.textContent).join('');
const rowOf = (device, id) => JSON.parse(device.run('JSON.stringify(payrollRows())'))
    .filter(row => String(row.workerId) === String(id))[0];

suite('the app\'s own words for the two cycles are the ones the owner wrote');
{
    const device = phone(OPEN);
    same('«שבועי» and «דו־שבועי» (with its maqaf) - the reports\' and the roster\'s, unchanged',
        JSON.parse(device.run('JSON.stringify(PAY_CYCLE_LABELS)')), { weekly: 'שבועי', biweekly: 'דו־שבועי' });
    check('and the roster says the same two words', /const PAY_CYCLE_NAMES = \{ weekly: 'שבועי', biweekly: 'דו־שבועי' \};/
        .test(readFileSync(join(ROOT, 'js/ui/roster.js'), 'utf8')));
}

[['gates shut', SHUT], ['gates open', OPEN]].forEach(([reading, flags]) => {
    suite(`${reading}, the default: each heading is its cycle's word on the screen, and keeps its dates for the paper`);
    const device = phone(flags);
    const old = phone(flags, v190Reports());
    const section = device.run('renderPayrollTable()');
    const heads = headingsOf(section);
    same('two groups, weekly first, each keyed for its colour',
        heads.map(node => [node.id, node.getAttribute('data-cycle')]),
        [['report-cycle-weekly', 'weekly'], ['report-cycle-biweekly', 'biweekly']]);
    same('the screen shows the cycle\'s word and nothing else', heads.map(onScreen), ['שבועי', 'דו־שבועי']);
    same('the dates are the one part the screen leaves out, one left-to-right run each',
        heads.map(node => node.children.map(kid => [kid.className, kid.textContent])),
        [[['report-group-when', ' · ⁦06/11/2026 - 12/11/2026⁩']],
            [['report-group-when', ' · ⁦30/10/2026 - 12/11/2026⁩']]]);
    same('so each heading\'s text - what the paper prints and the picture reads - is v190\'s, byte for byte',
        heads.map(node => node.textContent), headingsOf(old.run('renderPayrollTable()')).map(node => node.textContent));
    const groups = section.querySelectorAll('.report-payroll-group');
    same('each group of men is keyed for the same colour as its heading',
        groups.map(group => group.getAttribute('data-cycle')), ['weekly', 'biweekly']);
    check('every man is in the group his own cycle says', groups.every(group => group.querySelectorAll('.report-worker-tile')
        .every(tile => (rowOf(device, tile.getAttribute('data-report-worker-id')).payCycle === 'weekly')
            === (group.getAttribute('data-cycle') === 'weekly'))));
    given('and both groups have men', groups.every(group => group.querySelectorAll('.report-worker-tile').length >= 2));
    same('the way to each group, in the row above, wears its colour too',
        section.querySelectorAll('.report-cycle-nav')[0].children.map(go => [go.textContent, go.getAttribute('data-cycle')]),
        [['שבועי · 2', 'weekly'], ['דו־שבועי · 3', 'biweekly']]);
    given('the page has headings that are not a group\'s (the money, the band)',
        section.querySelectorAll('.report-group').length > heads.length);
    same('no other heading of the page is keyed: the money and the band keep their look',
        section.querySelectorAll('.report-group').filter(node => headingsOf(section).indexOf(node) === -1)
            .map(node => [node.textContent, node.getAttribute('data-cycle')]),
        section.querySelectorAll('.report-group').filter(node => headingsOf(section).indexOf(node) === -1)
            .map(node => [node.textContent, null]));
    // The file is the third surface that leaves the phone, and it never read the heading.
    same('the file says each weekly man\'s dates, as v190\'s did', device.run('JSON.stringify(payrollSheetRows())'),
        old.run('JSON.stringify(payrollSheetRows())'));
    check('and it does say them', JSON.parse(device.run('JSON.stringify(payrollSheetRows())'))
        .some(row => row[row.length - 1] === 'שבועי · 06/11/2026 עד 12/11/2026'));
});

suite('an explicit range: the heading is the word alone - in the DOM too - and the amber sentence says the rest');
{
    const device = phone(OPEN);
    byHand(device, FORT);
    const section = device.run('renderPayrollTable()');
    const heads = headingsOf(section);
    same('the word, and no part held back for paper: the page\'s range is the period', heads.map(node =>
        [node.textContent, node.children.length, node.getAttribute('data-cycle')]),
    [['שבועי', 0, 'weekly'], ['דו־שבועי', 0, 'biweekly']]);
    check('the weekly men, looked at over a fortnight, are told so under their heading', section.querySelectorAll('.hint-warn')
        .some(node => node.textContent.indexOf('הטווח שנבחר אינו תקופת התשלום של העובדים האלה') === 0));
    same('and the page names its range on paper', plain(section.querySelectorAll('.report-period')[0].textContent),
        '30/10/2026 - 12/11/2026 · שישי–חמישי');
}

suite('a man a boundary cut short: his own group, the same word and colour, told apart by its sentence');
{
    // Weekly from the second Friday of the fortnight; on 04/11 he stands in the seven days
    // the boundary left him, which is nobody else's period.
    const device = phone(OPEN);
    device.State.schedule.workers.push({ id: 'w_cut', name: 'ג׳מאל', active: true, dailyRate: 440, hourlyRate: 0,
        payCycles: `${WEEK2.from}=weekly` });
    device.State.commit(device.call('assignPlace', device.State.schedule, '2026-11-02', 'w_cut', 'actual', 'p_01', 'normal'));
    device.setToday('2026-11-04');
    device.run(`(() => { const r = defaultPayrollRange(); REPORT_RANGE.from = r.from; REPORT_RANGE.to = r.to; })(); 1`);
    const section = device.run('renderPayrollTable()');
    const heads = headingsOf(section);
    const his = heads.filter(node => node.id === `report-cycle-biweekly-${FORT.from}`)[0];
    given('he has a group of his own', Boolean(his), heads.map(node => node.id).join());
    same('its heading on the screen is the cycle\'s word, its colour the cycle\'s', [onScreen(his), his.getAttribute('data-cycle')],
        ['דו־שבועי', 'biweekly']);
    same('and its dates are kept for the paper', plain(his.textContent), 'דו־שבועי · 30/10/2026 - 05/11/2026');
    const after = section.children.slice(section.children.indexOf(his) + 1);
    check('the sentence under it says what his period is', after.length > 0
        && after[0].textContent === 'תקופת מעבר: הימים שנשארו מהמחזור הקודם, לפני המעבר לתשלום שבועי.', after[0] && after[0].textContent);
}

suite('no word under js/ mixes Hebrew and Arabic letters');
{
    const files = [];
    const walk = dir => readdirSync(dir).forEach(name => {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.m?js$/.test(name)) files.push(path);
    });
    walk(join(ROOT, 'js'));
    given('the app\'s scripts are found', files.length > 30, String(files.length));
    const HEBREW = /\p{Script=Hebrew}/u;
    const ARABIC_LETTER = /(?=\p{Script=Arabic})\p{L}/u;
    const mixed = [];
    const codeLines = [];
    files.forEach(file => readFileSync(file, 'utf8').split('\n').forEach((line, at) => {
        const where = `${relative(ROOT, file)}:${at + 1}`;
        (line.match(/[\p{L}\p{M}]+/gu) || []).forEach(word => {
            if (HEBREW.test(word) && ARABIC_LETTER.test(word)) mixed.push(`${where} ${word}`);
        });
        // A line of CODE (not a comment) holding Hebrew text and an Arabic letter: a
        // string the screen shows, in two scripts. The owner's own words, quoted in Arabic
        // in comments beside the code they decided, are not on any screen.
        const trimmed = line.trim();
        const comment = trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*');
        if (!comment && HEBREW.test(line) && ARABIC_LETTER.test(line)) codeLines.push(where);
    }));
    same('not one word, in code or in a comment', mixed, []);
    same('and no line of code holds Hebrew beside an Arabic letter', codeLines, []);
    check('the scan would have found the word v190 shipped',
        (v190Reports().match(/[\p{L}\p{M}]+/gu) || []).some(word => HEBREW.test(word) && ARABIC_LETTER.test(word)));
}

report();
