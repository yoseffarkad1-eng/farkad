// The reports say the account - held in Node.
//
//   node tests/reportsclarity.test.mjs
//
// THE OWNER, 2026-11-11: "make the reports more organised, clear and understandable - and
// the extra hours do not show clearly; I want them clear too." The phone's card said
// «נותר לתשלום», two counts and «פירוט». It now reads the account top to bottom: what the
// man did (work days, double days, EXTRA HOURS, days off), what it is worth (the daily
// rate, «נצבר»), what comes off (the deduction and his own notes), what is left.
//
// That is a change to the one screen pay is read from, so what this suite holds is that
// it is a change of PRESENTATION and of nothing else:
//
//   - every figure on a card is the text of the table cell the full report prepared for
//     the same man, under the table's own heading - on seeded records, with the money
//     gates shut and open, on the default account view and on explicit ranges;
//   - the extra hours on a card are the pay report's own count for that man, on every card
//     of a group that has any and on none of a group that has none;
//   - a card's notes are that man's own sentences out of the workbook's «הערה», and the
//     «הערה» itself is byte for byte what it was;
//   - NOT ONE NEW HEBREW STRING: every label is a heading or a sentence the app already
//     printed, listed here word for word;
//   - the table, its band, the workbook's sheets, the CSV rows and the man's WhatsApp
//     statement are what v186 (9846d7f, out of Git) writes for the same explicit range -
//     the range where the later account view changes nothing;
//   - the days dialog says a day's hours in words and never as a bare «+N», and explains
//     its own star; the weekly fold carries the hours of a man who has any and adds them up.
//
// The glass - sizes, contrast, the dialog's summary being the card's own box, the band on
// a phone, no sideways scroll - is tests/reportsclarity.browser.mjs.
//
// Synthetic data only: invented men, two invented sites.

import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeDevice } from './harness.mjs';
import { makeDom, tableText } from './moneydom.mjs';
import { suite, check, same, given, report } from './runner.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPORTS = readFileSync(join(ROOT, 'js/ui/reports.js'), 'utf8');
const SITECOLOR = readFileSync(join(ROOT, 'js/ui/sitecolor.js'), 'utf8');

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
        given('and its card is the old one', code.indexOf('report-tile-facts') === -1);
        V186_REPORTS = code;
    }
    return V186_REPORTS;
}

const TODAY = '2026-11-11';
const FORT = { from: '2026-10-30', to: '2026-11-12' };
const WEEK2 = { from: '2026-11-06', to: '2026-11-12' };
const MONTH = { from: '2026-11-01', to: '2026-11-30' };
const SHUT = { carryAdvances: false, ledgerWrites: false };
const OPEN = { carryAdvances: true, ledgerWrites: true };

// One crew, each man one case:
//   w_a  fortnightly, 450/60: six plain days, one double, 2 + 4.5 extra hours, a day off, 1,900 taken
//   w_b  weekly, 400/50: days in both weeks, 3 extra hours in week 2, 300 taken
//   w_c  no daily rate: two days
//   w_d  500 and NO hourly rate: two days, 3 extra hours - the starred amount
//   w_e  420/55: took 3,000 in the previous account against two days - a balance carried in
//   w_f  380, no hours at all, fortnightly
//   w_g  weekly, 400/45: a double day and a day off, no hours
function crew(device) {
    device.State.schedule.workers = [
        { id: 'w_a', name: 'דוגמה אלף', active: true, dailyRate: 450, hourlyRate: 60 },
        { id: 'w_b', name: 'דוגמה בית', active: true, dailyRate: 400, hourlyRate: 50, payCycles: '2026-08-07=weekly' },
        { id: 'w_c', name: 'דוגמה גימל', active: true, dailyRate: 0, hourlyRate: 0 },
        { id: 'w_d', name: 'דוגמה דלת', active: true, dailyRate: 500, hourlyRate: 0 },
        { id: 'w_e', name: 'דוגמה הא', active: true, dailyRate: 420, hourlyRate: 55 },
        { id: 'w_f', name: 'דוגמה וו', active: true, dailyRate: 380, hourlyRate: 0 },
        { id: 'w_g', name: 'דוגמה זין', active: true, dailyRate: 400, hourlyRate: 45, payCycles: '2026-08-07=weekly' }
    ];
    device.State.schedule.places = [
        { id: 'p_1', name: 'אתר צפון', active: true },
        { id: 'p_2', name: 'אתר דרום', active: true }];
    const put = (date, id, place, rate, hours) => device.State.commit(device.call('assignPlace',
        device.State.schedule, date, id, 'actual', place, rate || 'normal', hours));
    const off = (date, id) => device.State.commit(device.call('markAbsent', device.State.schedule, date, id, 'actual'));
    const cash = (id, date, amount) => device.State.commit(device.call('addAdvance',
        device.State.schedule, id, date, amount, ''));
    put('2026-10-20', 'w_e', 'p_1'); put('2026-10-21', 'w_e', 'p_1');
    ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-08'].forEach((date, at) => {
        put(date, 'w_a', at % 2 ? 'p_2' : 'p_1', at === 2 ? 'double' : 'normal');
        put(date, 'w_b', 'p_1');
        if (at < 4) put(date, 'w_e', 'p_2');
        if (at < 3) put(date, 'w_f', 'p_1');
        put(date, 'w_g', 'p_2', at === 5 ? 'double' : 'normal');
    });
    put('2026-11-09', 'w_a', 'p_1', 'extra', 2);
    put('2026-11-10', 'w_a', 'p_2', 'extra', 4.5);
    off('2026-11-06', 'w_a');
    put('2026-11-09', 'w_b', 'p_2', 'extra', 3);
    put('2026-11-03', 'w_c', 'p_1'); put('2026-11-04', 'w_c', 'p_1');
    put('2026-11-03', 'w_d', 'p_2'); put('2026-11-04', 'w_d', 'p_2', 'extra', 3);
    put('2026-11-09', 'w_e', 'p_1', 'extra', 1.5);
    off('2026-11-10', 'w_g');
    cash('w_a', '2026-11-02', 1500); cash('w_a', '2026-11-08', 400);
    cash('w_e', '2026-10-21', 3000);
    cash('w_b', '2026-11-09', 300);
    device.State.commit(device.call('setRimaCount', device.State.schedule, '2026-11-02', 'p_1', 3));
    device.State.commit(device.call('setYosefGevesCount', device.State.schedule, '2026-11-04', 'p_2', 1));
}

function phone(flags, source) {
    const device = makeDevice({ deviceId: 'd_clear', flags });
    device.setToday(TODAY);
    const dom = makeDom();
    ['reportsView', 'workerDaysTitle', 'workerDaysMeta', 'workerDaysBody', 'workerDaysModal']
        .forEach(id => dom.register(id));
    device.ctx.document = dom;
    vm.runInContext(SITECOLOR, device.ctx, { filename: 'harness:sitecolor' });
    vm.runInContext(source || REPORTS, device.ctx, { filename: 'harness:reports' });
    device.ctx.askTell = () => Promise.resolve();
    device.ctx.askConfirm = () => Promise.resolve(true);
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

const plain = text => String(text).replace(/[‎‏⁦⁧⁨⁩]/g, '');
const first = (node, cls) => node.querySelectorAll('.' + cls)[0] || null;

// One card as the facts a person reads off it.
function readCard(tile) {
    const metric = kind => {
        const node = first(tile, 'report-tile-metric-' + kind);
        if (!node) return null;
        return { count: node.querySelectorAll('STRONG')[0].textContent,
            label: first(node, 'report-tile-label').textContent,
            quiet: node.classList.contains('report-tile-zero') };
    };
    return {
        id: tile.getAttribute('data-report-worker-id'),
        name: first(tile, 'report-tile-name').textContent,
        order: tile.querySelectorAll('.report-tile-metric')
            .map(node => first(node, 'report-tile-label').textContent),
        work: metric('work'), double: metric('double'), hours: metric('hours'), off: metric('off'),
        lines: tile.querySelectorAll('.report-tile-line').map(line => ({
            label: first(line, 'report-tile-line-label').textContent,
            text: first(line, 'report-tile-line-number').textContent,
            shekel: line.querySelectorAll('.report-tile-line-currency').length })),
        notes: tile.querySelectorAll('.report-tile-note').map(note => ({ text: note.textContent,
            warn: note.classList.contains('report-tile-warn') })),
        payable: first(tile, 'report-tile-value').textContent,
        payableLabel: first(first(tile, 'report-tile-amount'), 'report-tile-label').textContent,
        shekel: first(tile, 'report-tile-amount').querySelectorAll('.report-tile-currency').length,
        open: first(tile, 'report-tile-open').textContent,
        // The order of the blocks, top to bottom.
        blocks: first(tile, 'report-tile-facts').children.map(node => node.className)
    };
}

// Every table group of the pay section with its cards beside its rows.
function groupsWithCards(device) {
    const section = device.run('renderPayrollTable()');
    return section.querySelectorAll('.report-payroll-group').map(group => {
        const table = group.querySelectorAll('TABLE')[0];
        return {
            heads: table.querySelectorAll('THEAD TR')[0].children.map(cell => cell.textContent),
            rows: table.querySelectorAll('TBODY TR').map(tr => tr.children.map(cell => cell.textContent)),
            foot: table.querySelectorAll('TFOOT TR')[0].children.map(cell => cell.textContent),
            cards: group.querySelectorAll('.report-worker-tile').map(readCard)
        };
    });
}

const DAY_HEADS = ['נוכחות', 'ימי שכר', 'כפולים', 'שעות נוספות', 'נעדר'];
const DEDUCTION_HEADS = ['מקדמות', 'נוכה מהשכר', 'מקדמות / ניכוי'];

// ---------------------------------------------------------------- 1. the words
suite('not one new Hebrew string: every word on the card is one the app already printed');
{
    check('the starred sentence is the pay sheet\'s and the statement\'s, written once',
        (REPORTS.match(/\* שעות נוספות בלי שכר שעה - לא נכללו בסכום\./g) || []).length === 1
        && /const HOURS_UNPRICED_NOTE = '\* שעות נוספות בלי שכר שעה - לא נכללו בסכום\.';/.test(REPORTS));
    check('the no-rate sentence is the workbook note\'s, written once',
        (REPORTS.match(/בלי שכר יומי - הנצבר לא חושב/g) || []).length === 1
        && /const NO_DAILY_RATE_NOTE = 'בלי שכר יומי - הנצבר לא חושב';/.test(REPORTS));
    const old = v186Reports();
    ['* שעות נוספות בלי שכר שעה - לא נכללו בסכום.', 'בלי שכר יומי - הנצבר לא חושב', 'ימי עבודה', 'חופש',
        'כפולים', 'שעות נוספות', 'שכר יומי', 'נצבר', 'נותר לתשלום', 'פירוט', 'סיכום התקופה',
        'שעה נוספת אחת'].forEach(text => check(`«${text}» stood in v186`, old.indexOf(text) !== -1));
    // Every Hebrew literal of the new card's code is one of those.
    const from = REPORTS.indexOf('function reportTileLine(');
    const to = REPORTS.indexOf('// `options` is display only');
    given('the card\'s code is found', from > 0 && to > from);
    const literals = (REPORTS.slice(from, to).match(/'[^'\n]*[א-ת][^'\n]*'/g) || [])
        .map(text => text.slice(1, -1));
    same('the Hebrew literals of the card', [...new Set(literals)].sort(),
        ['ימי עבודה', 'ימי שכר', 'כפולים', 'שעות נוספות', 'חופש', 'נעדר', 'שכר יומי', 'נצבר',
            'נותר לתשלום', 'לתשלום', 'פירוט'].sort());
}

// ---------------------------------------------------------------- 2. the card is the row
[['gates shut', SHUT], ['gates open', OPEN]].forEach(([reading, flags]) => {
    [['the default account view', null], ['the fortnight picked by hand', FORT],
        ['a week picked by hand', WEEK2], ['the month', MONTH]].forEach(([view, span]) => {
        suite(`${reading}, ${view}: every figure on a card is its row's cell`);
        const device = phone(flags);
        if (span) byHand(device, span);
        const rows = JSON.parse(device.run('JSON.stringify(payrollRows())'));
        const groups = groupsWithCards(device);
        given('the page has cards', groups.length > 0 && groups.every(group => group.cards.length > 0),
            String(groups.length));
        let cards = 0;
        groups.forEach(group => {
            same('one card per row of the table', group.cards.length, group.rows.length);
            const at = label => group.heads.indexOf(label);
            const deduction = group.heads.filter(head => DEDUCTION_HEADS.indexOf(head) !== -1)[0] || null;
            group.cards.forEach((card, index) => {
                cards += 1;
                const cells = group.rows[index];
                const row = rows.filter(item => String(item.workerId) === card.id)[0];
                const cell = (label, blank) => (at(label) === -1 ? null : (cells[at(label)] || blank));
                given(`${card.id}: the card and the row are the same man`, plain(cells[0]).indexOf(plain(card.name)) === 0
                    && Boolean(row), `${cells[0]} / ${card.name}`);
                // What he did.
                same(`${card.id}: «ימי עבודה» is the «ימי שכר» cell`, card.work, { count: cell('ימי שכר', '0'),
                    label: 'ימי עבודה', quiet: cell('ימי שכר', '0') === '0' });
                same(`${card.id}: «חופש» is the «נעדר» cell`, card.off && card.off.count, cell('נעדר', '0') || '0');
                same(`${card.id}: «כפולים» is on the card exactly when the table has the column`,
                    card.double === null, at('כפולים') === -1);
                if (card.double) same(`${card.id}: and is its cell`, card.double.count, cell('כפולים', '0'));
                same(`${card.id}: «שעות נוספות» is on the card exactly when the table has the column`,
                    card.hours === null, at('שעות נוספות') === -1);
                if (card.hours) {
                    same(`${card.id}: the hours are the cell`, card.hours.count, cell('שעות נוספות', '0'));
                    same(`${card.id}: and the pay report's own count`, card.hours.count, String(row.extraHours));
                    same(`${card.id}: named in words`, card.hours.label, 'שעות נוספות');
                    same(`${card.id}: quiet only at nought`, card.hours.quiet, row.extraHours === 0);
                }
                same(`${card.id}: the counts in the paymaster's order`, card.order,
                    ['ימי עבודה'].concat(at('כפולים') === -1 ? [] : ['כפולים'],
                        at('שעות נוספות') === -1 ? [] : ['שעות נוספות'], ['חופש']));
                // What it is worth, what comes off.
                const want = [];
                if (at('שכר יומי') !== -1) want.push(['שכר יומי', cell('שכר יומי', '—')]);
                if (at('נצבר') !== -1) want.push(['נצבר', cell('נצבר', '0')]);
                if (deduction) want.push([deduction, cell(deduction, '0')]);
                same(`${card.id}: the money lines are the cells, under the table's headings`,
                    card.lines.map(line => [line.label, line.text]), want);
                check(`${card.id}: a known figure has its ₪ and an unknown one has none`,
                    card.lines.every(line => line.shekel === (line.text === '—' ? 0 : 1)),
                    JSON.stringify(card.lines));
                // What is left.
                same(`${card.id}: «נותר לתשלום» is the «לתשלום» cell`, [card.payableLabel, card.payable],
                    ['נותר לתשלום', cell('לתשלום', '—') || '—']);
                same(`${card.id}: and its ₪ follows the same rule`, card.shekel, card.payable === '—' ? 0 : 1);
                same(`${card.id}: the blocks top to bottom: did, worth and off, notes, left`, card.blocks,
                    ['report-tile-metrics'].concat(want.length ? ['report-tile-lines'] : [],
                        card.notes.length ? ['report-tile-notes'] : [], ['report-tile-amount']));
                // His notes.
                const parts = JSON.parse(device.run(
                    `JSON.stringify(moneyNoteParts(payrollRows().filter(r => String(r.workerId) === '${card.id}')[0]))`));
                const whole = JSON.parse(device.run(
                    `JSON.stringify(moneyNotes(payrollRows().filter(r => String(r.workerId) === '${card.id}')[0]))`));
                same(`${card.id}: the workbook's note is its three parts, in the order it was always written`,
                    whole, parts.range.concat(parts.account, parts.gaps));
                const said = parts.account.map(text => ({ text, warn: text.indexOf('⚠️') === 0 }))
                    .concat(row.amount === null ? [{ text: 'בלי שכר יומי - הנצבר לא חושב', warn: true }] : [],
                        row.hoursUnpriced ? [{ text: '* שעות נוספות בלי שכר שעה - לא נכללו בסכום.', warn: true }] : []);
                same(`${card.id}: his card says his own account notes, then what the figures could not include`,
                    card.notes, said);
                if (row.hoursUnpriced) {
                    check(`${card.id}: the star on his amounts and its sentence are on the same card`,
                        card.payable.indexOf('*') !== -1
                        && card.notes.some(note => note.text.indexOf('* ') === 0 && note.warn));
                }
            });
            // A figure is on every card of a group or on none.
            same('every card of the group has the same counts', [...new Set(group.cards.map(card =>
                card.order.join('|')))].length, 1);
        });
        same('every row of the pay report that has a table row has a card', cards,
            JSON.parse(device.run('JSON.stringify(payrollDisplaySplit(payrollRows()).work.length)')));
    });
});

// ---------------------------------------------------------------- 3. the figures, as literals
suite('gates open, the fortnight by hand: the seeded men, as a person reads their cards');
{
    const device = phone(OPEN);
    byHand(device, FORT);
    const cards = {};
    groupsWithCards(device).forEach(group => group.cards.forEach(card => { cards[card.id] = card; }));
    const facts = id => [cards[id].work.count, cards[id].double && cards[id].double.count,
        cards[id].hours && cards[id].hours.count, cards[id].off.count, cards[id].payable];
    same('w_a: 9 pay days, 1 double, 6.5 extra hours, 1 day off, 2,540 left', facts('w_a'), ['9', '1', '6.5', '1', '2540']);
    same('w_a: 450 a day, 4,440 earned, 1,900 off', cards.w_a.lines.map(line => plain(line.text)), ['450', '4440', '-1900']);
    same('w_d: 3 hours with no hourly rate - the amount starred', facts('w_d'), ['2', '0', '3', '0', '1000 *']);
    same('w_d: and why, on his card', cards.w_d.notes, [{ text: '* שעות נוספות בלי שכר שעה - לא נכללו בסכום.', warn: true }]);
    same('w_c: no daily rate - unknown, not nought', [cards.w_c.payable, cards.w_c.lines[0].text, cards.w_c.lines[1].text],
        ['—', '—', '—']);
    same('w_c: and why, on his card', cards.w_c.notes, [{ text: 'בלי שכר יומי - הנצבר לא חושב', warn: true }]);
    same('w_f: no hours, in a group that has some - a quiet 0, never a gap',
        [cards.w_f.hours.count, cards.w_f.hours.quiet], ['0', true]);
    same('w_e: 1.5 hours, and the balance he carried in is on his own card',
        [cards.w_e.hours.count, cards.w_e.notes.map(note => note.text)], ['1.5', ['2160 ₪ מקדמה מחשבון קודם']]);
    same('w_b: a weekly man read over a fortnight: 3 hours', cards.w_b.hours.count, '3');
    same('w_g: his group has hours (w_b\'s), so his card says 0', [cards.w_g.hours.count, cards.w_g.double.count], ['0', '1']);
    // The band of each group carries the hours' total, which is the rows' own sum.
    groupsWithCards(device).forEach(group => {
        const at = group.heads.indexOf('שעות נוספות');
        const sum = group.cards.reduce((total, card) => total + Number(card.hours.count), 0);
        same(`the band's «שעות נוספות» (${group.foot[at]}) is the cards' hours added up`, Number(group.foot[at]), sum);
    });
}

suite('a group where nobody has extra hours says nothing about them, on any card');
{
    const device = phone(OPEN);
    device.run(`REPORT_WORKERS = new Set(['w_f', 'w_c']); 1`);
    byHand(device, FORT);
    const groups = groupsWithCards(device);
    same('two men, one group', groups.map(group => group.cards.length), [2]);
    check('the table has no hours column', groups[0].heads.indexOf('שעות נוספות') === -1);
    same('and no card has the count', groups[0].cards.map(card => card.hours), [null, null]);
    same('the counts are the two the card always had', groups[0].cards[0].order, ['ימי עבודה', 'חופש']);
}

// ---------------------------------------------------------------- 4. nothing else moved
[['gates shut', SHUT], ['gates open', OPEN]].forEach(([reading, flags]) => {
    [['the fortnight', FORT], ['a week', WEEK2], ['the month', MONTH]].forEach(([view, span]) => {
        suite(`${reading}, ${view} by hand: the table, the files and the statement are v186's, byte for byte`);
        const now = phone(flags);
        const old = phone(flags, v186Reports());
        byHand(now, span); byHand(old, span);
        const tables = device => device.run('renderPayrollTable()').querySelectorAll('.report-payroll-group')
            .map(group => tableText(group));
        same('every pay table: headings, rows and band (what the paper and the picture read)',
            tables(now), tables(old));
        same('the workbook\'s sheets and the CSV rows, every cell',
            now.run('JSON.stringify(reportSheets())'), old.run('JSON.stringify(reportSheets())'));
        const heads = JSON.parse(now.run('JSON.stringify(reportSheets())'));
        check('«שכר» carries the hours as a count and no money for them', heads.payroll[0].indexOf('שעות נוספות') === 4
            && heads.payroll[0].filter(head => /שעות|שעה/.test(head)).length === 1);
        check('«פירוט» carries a day\'s hours in its own column', heads.detail[0].indexOf('שעות נוספות') === 5);
        ['w_a', 'w_b', 'w_c', 'w_d', 'w_e', 'w_f', 'w_g'].forEach(id => same(`${id}: his WhatsApp statement`,
            now.run(`workerStatementText('${id}')`), old.run(`workerStatementText('${id}')`)));
        same('every row\'s «הערה»', now.run('JSON.stringify(payrollRows().map(moneyNotes))'),
            old.run('JSON.stringify(payrollRows().map(moneyNotes))'));
        same('the financial lines', now.run('JSON.stringify(payrollRows().map(row => financeLineText(row, deductionColumnName())))'),
            old.run('JSON.stringify(payrollRows().map(row => financeLineText(row, deductionColumnName())))'));
    });
});

suite('the statement still says a day\'s hours its own way - a sent text is not this change\'s to move');
{
    const device = phone(OPEN);
    byHand(device, FORT);
    const text = plain(device.run(`workerStatementText('w_a')`));
    check('«(+2 ש׳)» on the day', text.indexOf('אתר צפון (+2 ש׳) - 570') !== -1, text);
    check('«6.5 שעות נוספות» in the summary', text.indexOf('9 ימי שכר · מתוכם יום כפול אחד · 6.5 שעות נוספות') !== -1);
}

// ---------------------------------------------------------------- 5. the days dialog
suite('the days dialog: a day\'s extra hours in words, never a bare plus');
{
    const device = phone(OPEN);
    byHand(device, FORT);
    const body = id => { device.run(`openWorkerDays('${id}')`); return device.dom.getElementById('workerDaysBody'); };
    const a = body('w_a');
    same('w_a: the two days with hours, in words',
        a.querySelectorAll('.wday-extra').map(node => node.textContent), ['2 שעות נוספות', '4.5 שעות נוספות']);
    check('no «+» anywhere in his days', a.querySelectorAll('.wday').every(row => plain(row.textContent).indexOf('+') === -1
        || row.classList.contains('wday-total')),
        a.querySelectorAll('.wday').map(row => plain(row.textContent)).filter(text => text.indexOf('+') !== -1).join(' | '));
    check('the double day still says «כפול» in its site tag',
        a.querySelectorAll('.tag-rate').map(node => node.textContent).join(',') === 'כפול');
    check('the words sit in the day\'s row, right after the site they were worked at',
        a.querySelectorAll('.wday').filter(row => row.querySelectorAll('.wday-extra').length === 1)
            .every(row => {
                const what = first(row, 'wday-what').children;
                const at = what.findIndex(node => node.classList.contains('wday-extra'));
                return at > 0 && what[at - 1].classList.contains('tag-place');
            }));
    same('the total line under the days names the same thing the same way',
        plain(first(first(a, 'wday-total'), 'wday-what').children[0].textContent),
        '9 ימי שכר · מתוכם יום כפול אחד · 6.5 שעות נוספות');
    same('a man with an hourly rate: no star, no sentence', a.querySelectorAll('.wday-unpriced').length, 0);

    const one = phone(OPEN);
    one.State.commit(one.call('assignPlace', one.State.schedule, '2026-11-10', 'w_f', 'actual', 'p_1', 'extra', 1));
    byHand(one, FORT);
    one.run(`openWorkerDays('w_f')`);
    same('one hour is said the way the summary says it',
        one.dom.getElementById('workerDaysBody').querySelectorAll('.wday-extra').map(node => node.textContent),
        ['שעה נוספת אחת']);

    const d = body('w_d');
    same('w_d: three hours with no hourly rate', d.querySelectorAll('.wday-extra').map(node => node.textContent), ['3 שעות נוספות']);
    check('the day\'s amount is starred', d.querySelectorAll('.wday-money').some(node => node.textContent === '500 *'));
    same('and the dialog now says what the star means, once, in the sheet\'s own sentence',
        d.querySelectorAll('.wday-unpriced').map(node => [node.textContent, node.className]),
        [['* שעות נוספות בלי שכר שעה - לא נכללו בסכום.', 'hint hint-warn wday-unpriced']]);

    // A day marked «שעות נוספות» with no number keeps the word it had.
    const bare = phone(OPEN);
    bare.State.commit(bare.call('assignPlace', bare.State.schedule, '2026-11-10', 'w_f', 'actual', 'p_1', 'extra'));
    byHand(bare, FORT);
    bare.run(`openWorkerDays('w_f')`);
    const rows = bare.dom.getElementById('workerDaysBody');
    same('a day marked extra with no hours typed keeps «נוספות»',
        [rows.querySelectorAll('.wday-extra').length, rows.querySelectorAll('.tag-rate').map(node => node.textContent)],
        [0, ['נוספות']]);
}

// ---------------------------------------------------------------- 6. the weekly fold
suite('the weekly fold: the hours of a man who has any, week by week, and their sum');
{
    const device = phone(OPEN);
    byHand(device, FORT);
    const fold = device.run('renderPayrollTable()').querySelectorAll('.report-weekly-breakdown')[0];
    given('the weekly men inside a fortnight get their fold', Boolean(fold));
    const lines = fold.querySelectorAll('.report-weekly-line').map(line => ({
        total: line.classList.contains('report-weekly-total'),
        facts: line.querySelectorAll('.report-weekly-fact').map(fact => [
            first(fact, 'report-weekly-label').textContent, first(fact, 'report-weekly-value').textContent]) }));
    // Two men, three lines each: w_b (3 hours in week 2), then w_g (none).
    same('w_b: every line of his carries «שעות נוספות», between כפולים and נצבר',
        lines.slice(0, 3).map(line => line.facts.map(fact => fact[0]).join('|')),
        Array(3).fill('נוכחות|ימי שכר|כפולים|שעות נוספות|נצבר'));
    same('w_b: nought in week 1, three in week 2, three for the range',
        lines.slice(0, 3).map(line => line.facts[3][1]), ['0', '3', '3']);
    same('and the range\'s hours are his row\'s', lines[2].facts[3][1],
        String(JSON.parse(device.run('JSON.stringify(payrollRows())')).filter(row => row.workerId === 'w_b')[0].extraHours));
    same('w_g, who has none: his lines are what they always were',
        lines.slice(3, 6).map(line => line.facts.map(fact => fact[0]).join('|')),
        Array(3).fill('נוכחות|ימי שכר|כפולים|נצבר'));
    const old = phone(OPEN, v186Reports());
    byHand(old, FORT);
    const oldFold = old.run('renderPayrollTable()').querySelectorAll('.report-weekly-breakdown')[0];
    same('and word for word v186\'s', fold.querySelectorAll('.report-weekly-line').slice(3, 6).map(line => line.textContent),
        oldFold.querySelectorAll('.report-weekly-line').slice(3, 6).map(line => line.textContent));
    same('the weeks\' answer still carries the two marks the fold reads',
        [device.run(`weeklyBreakdownFor('w_b', '${FORT.from}', '${FORT.to}').complete`),
            device.run(`weeklyBreakdownFor('w_b', '${FORT.from}', '${FORT.to}').coveredTo`)], [true, FORT.to]);
}

// ---------------------------------------------------------------- 7. it is a reading
suite('drawing all of it writes nothing');
{
    const device = phone(OPEN);
    const disk = () => JSON.stringify(device.dump());
    const record = JSON.stringify(device.State.schedule);
    const before = disk();
    device.run('renderPayrollTable()');
    byHand(device, MONTH);
    device.run('renderPayrollTable()');
    ['w_a', 'w_d', 'w_c'].forEach(id => device.run(`openWorkerDays('${id}')`));
    same('the record', JSON.stringify(device.State.schedule), record);
    same('the phone\'s disk', disk(), before);
    check('the model is not this change\'s: no file of js/model, js/sync, the store or the state is named by the card',
        !/payrollReport|ratesForDay|hourlyRate/.test(REPORTS.slice(REPORTS.indexOf('function reportTileLine('),
            REPORTS.indexOf('// `options` is display only'))));
}

report();
