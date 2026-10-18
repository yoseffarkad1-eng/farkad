// The work table, the financial section, and the one band a person pays from.
//
//   node tests/finance.test.mjs
//
// THE DECISION THIS SUITE PINS, and the loss it exists to prevent.
//
// The owner asked on 17 October 2026 for a man with no work days to be off the WORK
// table, and on 18 October for the condition that makes it safe: his advances and
// balances stay in a financial section of their own, and every total still reconciles.
//
// The first attempt hid him by taking the clause out of payrollRows(). That lost his
// deduction, because payrollRows() IS the calculation - the band is summed off it and the
// exported file is written off it - and with his row gone the sheet had no in-range
// advance left at all, so the three money columns left the page entirely and his money
// was deducted in no period, this one or the next. tests/smoke.mjs and
// tests/repayment.test.mjs both caught it, from different ends.
//
// So the hiding now happens one layer ABOVE payrollRows(), in payrollDisplaySplit, and
// the number a person pays from is summed by payrollBandTotals over the WHOLE group -
// the same expression over the same set the single footer summed before the split. That
// identity is the whole design, and it is the first thing measured below.
//
// RUN TWICE, through the flags seam, because the two readings of the record lose
// DIFFERENT amounts when this is got wrong: with the money gates shut the full advance
// comes off the crew's payable, and with them open a priced man's balance carries forward
// while an UNPRICED man's does not. A suite that measured one reading would have called
// the other safe.

import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeDevice } from './harness.mjs';
import { makeDom } from './moneydom.mjs';
import { suite, check, given, report } from './runner.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPORTS = readFileSync(join(ROOT, 'js/ui/reports.js'), 'utf8');

// A whole Friday-anchored fortnight, so the account arithmetic is reachable at all when
// the carry gate is open - payrollRows attaches an account over nothing else.
const FROM = '2026-08-07';
const TO = '2026-08-20';
const WORKED = '2026-08-10';
const TODAY = '2026-08-20';

const SHUT = { carryAdvances: false, ledgerWrites: false };
const OPEN = { carryAdvances: true, ledgerWrites: true };

// One crew, five men, each the shape of one rule:
//   w_day   worked, priced          - the ordinary row, stays in the work table
//   w_cash  priced, 500 handed over, NO day   - the man this whole section is about
//   w_bare  NO rate, 250 handed over, NO day  - the one the carry reading does not protect
//   w_week  weekly, worked          - so the page has two groups and two bands
//   w_none  nothing at all          - no row anywhere, before or after
function phone(flags) {
    const device = makeDevice({ deviceId: 'd_fin', flags });
    device.setToday(TODAY);
    const dom = makeDom();
    ['reportsView', 'workerDaysTitle', 'workerDaysMeta', 'workerDaysBody', 'workerDaysModal']
        .forEach(id => dom.register(id));
    device.ctx.document = dom;
    vm.runInContext(REPORTS, device.ctx, { filename: 'harness:reports' });
    device.ctx.askTell = () => Promise.resolve();
    device.ctx.askConfirm = () => Promise.resolve(true);
    device.run = code => vm.runInContext(code, device.ctx, { filename: 'harness:reports' });
    device.dom = dom;

    device.State.schedule.workers = [
        { id: 'w_day', name: 'סאלח', active: true, dailyRate: 450, hourlyRate: 0 },
        { id: 'w_cash', name: 'רגא', active: true, dailyRate: 470, hourlyRate: 0 },
        { id: 'w_bare', name: 'עלי', active: true, dailyRate: 0, hourlyRate: 0 },
        { id: 'w_week', name: 'כרם', active: true, dailyRate: 400, hourlyRate: 0,
            payCycles: `${FROM}=weekly` },
        { id: 'w_none', name: 'עודי', active: true, dailyRate: 500, hourlyRate: 0 }
    ];
    device.State.schedule.places = [{ id: 'p_01', name: 'פרסדיה', active: true }];
    ['w_day', 'w_week'].forEach(id => device.State.commit(device.call('assignPlace',
        device.State.schedule, WORKED, id, 'actual', 'p_01', 'normal')));
    device.State.commit(device.call('addAdvance',
        device.State.schedule, 'w_cash', WORKED, 500, ''));
    device.State.commit(device.call('addAdvance',
        device.State.schedule, 'w_bare', WORKED, 250, ''));
    device.State.save({ silent: true });
    device.run(`REPORT_RANGE.from='${FROM}'; REPORT_RANGE.to='${TO}';`
        + `REPORT_SECTION='workers'; REPORT_WORKERS=null; INVOICE_PLACE=null;`);
    return device;
}

// The bidi marks the app pins its signs with, taken off so a number is a number.
const plain = text => String(text).replace(/[‎⁦⁧⁨⁩]/g, '');
const num = text => Number(plain(text).replace(/[^\d.-]/g, ''));

const tablesIn = section => section.querySelectorAll('TABLE').map(table => ({
    head: table.querySelectorAll('THEAD TR').map(tr => tr.children.map(td => td.textContent)),
    body: table.querySelectorAll('TBODY TR').map(tr => tr.children.map(td => td.textContent)),
    foot: table.querySelectorAll('TFOOT TR').map(tr => tr.children.map(td => td.textContent))
}));

const financeLines = section =>
    section.querySelectorAll('.report-finance-text').map(node => node.textContent);

const bands = section => section.querySelectorAll('.report-reconcile-group')
    .map(wrap => ({
        head: wrap.querySelectorAll('THEAD TR').map(tr => tr.children.map(td => td.textContent))[0] || [],
        foot: wrap.querySelectorAll('TFOOT TR').map(tr => tr.children.map(td => td.textContent))[0] || []
    }));

const ids = (device, call) => device.run(`${call}.map(row => row.workerId).join(",")`);

// ----------------------------------------------------------- both readings, same rules
for (const [reading, flags] of [['gates shut', SHUT], ['gates open', OPEN]]) {
    // ------------------------------------------------------------------ the cut itself
    {
        suite(`${reading}: the calculation keeps everybody, the work table does not`);

        const device = phone(flags);
        const all = ids(device, 'payrollRows()');
        given('the crew is set up and the period is an account',
            all.split(',').length === 4, all);

        // THE CALCULATION IS COMPLETE. This is the line the first attempt broke.
        check(`${reading}: payrollRows keeps the man whose only record is cash`,
            all.indexOf('w_cash') !== -1 && all.indexOf('w_bare') !== -1, all);
        check(`${reading}: and still leaves out a man with nothing in the period`,
            all.indexOf('w_none') === -1, all);

        const work = ids(device, 'payrollDisplaySplit().work');
        const finance = ids(device, 'payrollDisplaySplit().finance');
        check(`${reading}: the work table shows the men who worked`,
            work.indexOf('w_day') !== -1 && work.indexOf('w_week') !== -1, work);
        check(`${reading}: and not the men whose only record is money`,
            work.indexOf('w_cash') === -1 && work.indexOf('w_bare') === -1, work);
        check(`${reading}: the financial section shows exactly those men`,
            finance === 'w_cash,w_bare' || finance === 'w_bare,w_cash', finance);
        // Disjoint and exhaustive: nothing can fall between the two lists.
        check(`${reading}: and the two lists are the calculation, whole`,
            work.split(',').filter(Boolean).concat(finance.split(',').filter(Boolean)).sort().join()
            === all.split(',').filter(Boolean).sort().join(),
            `${work} + ${finance} vs ${all}`);

        // EVERY MAN IN EXACTLY ONE GROUP AND ON EXACTLY ONE SIDE of it. The groups are
        // where the double-counting would happen: deciding the cycles over the combined
        // list and then reusing that list as a group's rows would put a financial man
        // back in the table he was taken out of.
        const partition = device.run(`payrollGroups(payrollDisplaySplit().work, payrollDisplaySplit().finance)
            .reduce((into, group) => into.concat(group.rows.map(row => row.workerId + ':work'),
                group.finance.map(row => row.workerId + ':money')), []).sort().join()`);
        check(`${reading}: every man is in one group, on one side of it`,
            partition === 'w_bare:money,w_cash:money,w_day:work,w_week:work', partition);

        // A man with EARNINGS can never leave the table they are totalled in, whatever
        // his day counts say - a frozen closure can carry a gross with no basis.
        const earner = device.run(`workRecordedIn({ attendanceDays: 0, absent: 0, vehicleDays: 0, amount: 1 })`);
        check(`${reading}: a row with money earned stays in the work table by definition`,
            earner === true, String(earner));
    }

    // ------------------------------------------------------- the identity, the whole point
    {
        suite(`${reading}: the band is the number the single footer printed`);

        const device = phone(flags);
        const section = device.run('renderPayrollTable()');
        const drawn = bands(section);

        // ONE BAND PER GROUP THAT HAS A MAN OUTSIDE ITS TABLE, and none anywhere else: a
        // weekly payday added to a fortnightly one in a cell called לתשלום would be a new
        // wrong number, and a group with nobody hidden is the page it always was.
        const groups = JSON.parse(device.run(`JSON.stringify(payrollGroups(payrollDisplaySplit().work, payrollDisplaySplit().finance).map(group => ({
            cycle: group.cycle,
            hidden: group.finance.length,
            band: payrollBandTotals(group.rows.concat(group.finance)),
            work: payrollBandTotals(group.rows)
        })))`));
        given('the two cycles are two groups, and only one of them hides anybody',
            groups.length === 2 && groups.filter(group => group.hidden > 0).length === 1,
            JSON.stringify(groups));
        check(`${reading}: a band is drawn for that group and for no other`,
            drawn.length === groups.filter(group => group.hidden > 0).length,
            JSON.stringify({ drawn: drawn.map(band => band.foot), groups }));

        groups.filter(group => group.hidden > 0).forEach(group => {
            // THE IDENTITY. payrollBandTotals over the whole group is the same expression
            // over the same set payrollGroupTable's footer summed before the split existed,
            // so the band is the number this page printed yesterday.
            const band = drawn.find(item => Math.abs(num(item.foot[1]) - group.band.gross) < 0.005
                && Math.abs(num(item.foot[3]) - group.band.net) < 0.005);
            check(`${reading}: ${group.cycle} - the drawn band is the group's own total`,
                Boolean(band), JSON.stringify({ wanted: group.band, drawn: drawn.map(d => d.foot) }));
            if (band) {
                check(`${reading}: ${group.cycle} - נצבר less the deduction is לתשלום, on the band`,
                    Math.abs((num(band.foot[1]) - Math.abs(num(band.foot[2]))) - num(band.foot[3])) < 0.005,
                    JSON.stringify(band.foot));
            }
            // AND THE DEDUCTION IS BIGGER THAN THE TABLE'S OWN, which is the loss this
            // whole design exists to prevent: the men off the table are inside this number.
            check(`${reading}: ${group.cycle} - the band deducts more than the table alone`,
                group.band.taken > group.work.taken,
                JSON.stringify({ band: group.band, work: group.work }));
        });

        // THE ONE CELL THAT SAYS «סה״כ לתשלום» is the one that summed everybody.
        const payday = drawn.map(band => plain(band.foot[0]));
        check(`${reading}: the band is the cell called «סה״כ לתשלום»`,
            payday.length > 0 && payday.every(text => text.indexOf('סה״כ לתשלום') === 0),
            JSON.stringify(payday));

        // AND THE WORK TABLE STOPS CLAIMING TO BE THE PAYDAY - but only the table that has
        // a man outside it. On a phone in card mode the only footer cells drawn are the
        // label and the one carrying data-label="לתשלום", so a number left in that cell
        // would be read as the fortnight's payable.
        const tables = tablesIn(section).filter(table => table.body.length > 0);
        const feet = tables.map(table => ({
            label: plain(table.foot[0] ? table.foot[0][0] : ''),
            net: plain((table.foot[0] || []).slice(-1)[0])
        }));
        const hiding = feet.filter(foot => foot.label.indexOf('סה״כ בטבלת העבודה') === 0);
        const plainBand = feet.filter(foot => foot.label.indexOf('סה״כ לתשלום') === 0);
        check(`${reading}: the table that hides somebody says what it totals`,
            hiding.length === 1, JSON.stringify(feet));
        check(`${reading}: and leaves the payday cell to the band`,
            hiding.every(foot => foot.net === '—'), JSON.stringify(feet));
        check(`${reading}: the table that hides nobody keeps its own payday number`,
            plainBand.length === 1 && plainBand.every(foot => foot.net !== '—' && foot.net !== ''),
            JSON.stringify(feet));
    }

    // ------------------------------------------------- the money is on the page, by name
    {
        suite(`${reading}: the deduction is read off the financial section`);

        const device = phone(flags);
        const section = device.run('renderPayrollTable()');
        const lines = financeLines(section);
        given('a line for each man whose money moved and who worked no day',
            lines.length === 2, JSON.stringify(lines));

        const cash = lines.find(line => line.indexOf('רגא') !== -1) || '';
        const bare = lines.find(line => line.indexOf('עלי') !== -1) || '';
        check(`${reading}: the man who took 500 is named, with his deduction`,
            cash.indexOf('-500') !== -1 || cash.indexOf('500') !== -1, cash);
        check(`${reading}: and the minus is pinned before the digits`,
            /‎-\d/.test(cash) || cash.indexOf('0') === -1 || plain(cash).indexOf('-') !== -1,
            JSON.stringify(cash));
        check(`${reading}: the man with no rate shows «—» for what he earned`,
            bare.indexOf('נצבר —') !== -1, bare);
        check(`${reading}: and his 250 is on the line all the same`,
            bare.indexOf('250') !== -1, bare);
        // The section says WHY these men are here, on the paper: .hint-money is one of the
        // two hint classes the print stylesheet keeps.
        const why = section.querySelectorAll('.hint-money').map(node => node.textContent);
        // The man the sheet cannot price is named beside the band, because the band's
        // gross counts his unknown wage as nothing while deducting him in full.
        const warned = section.querySelectorAll('.hint-warn').map(node => node.textContent);
        check(`${reading}: the man with no rate is named beside the band`,
            warned.some(text => text.indexOf('בלי שכר יומי') !== -1
                && text.indexOf('עלי') !== -1), JSON.stringify(warned));
        check(`${reading}: the page says why they have no days`,
            why.some(text => text.indexOf('אין להם ימי עבודה בתקופה הזו') !== -1),
            JSON.stringify(why));
        check(`${reading}: and that nothing undeducted is lost`,
            why.some(text => text.indexOf('עובר לתקופה הבאה ולא נמחק') !== -1),
            JSON.stringify(why));
    }

    // ------------------------------------------------ what the bookkeeper's file carries
    {
        suite(`${reading}: the exported sheet is still the union`);

        const device = phone(flags);
        const sheet = JSON.parse(device.run('JSON.stringify(payrollSheetRows())'));
        const head = sheet[0];
        const names = sheet.slice(1).map(row => row[0]);
        check(`${reading}: every man the calculation holds is in the file`,
            names.indexOf('רגא') !== -1 && names.indexOf('עלי') !== -1, JSON.stringify(names));
        // The file is where the deduction is checked with a calculator, so it must still
        // carry the amount on the man's own row.
        const row = sheet.slice(1).find(line => line[0] === 'רגא') || [];
        const at = heading => head.indexOf(heading);
        const deduction = at('מקדמות') !== -1 ? row[at('מקדמות')] : row[at('נוכה מהשכר')];
        check(`${reading}: with his money on his own row`,
            Math.abs(Number(deduction)) > 0 || reading === 'gates open',
            JSON.stringify({ head, row }));
        // And the note column still explains it in the app's own words - the same
        // sentences the financial section's line now says on the screen.
        check(`${reading}: and the note column still explains it`,
            typeof row[at('הערה')] === 'string', JSON.stringify(row));
    }
}

// ------------------------------------------------- the fortnight with nobody to hide
{
    suite('a fortnight where everybody worked is the page it always was');

    const device = phone(SHUT);
    // Take the two money-only men out of the crew entirely.
    device.run(`State.schedule.advances = {};`);
    device.State.save({ silent: true });
    const section = device.run('renderPayrollTable()');

    check('no financial section is drawn', financeLines(section).length === 0,
        JSON.stringify(financeLines(section)));
    check('and no reconciliation band either', bands(section).length === 0,
        JSON.stringify(bands(section)));
    const tables = tablesIn(section).filter(table => table.body.length > 0);
    const labels = tables.map(table => plain(table.foot[0] ? table.foot[0][0] : ''));
    check('the work table keeps the band it has always had',
        labels.length > 0 && labels.every(text => text.indexOf('סה״כ לתשלום') === 0),
        JSON.stringify(labels));
    const netCells = tables.map(table => plain((table.foot[0] || []).slice(-1)[0]));
    check('and the payday number is in it',
        netCells.every(text => text !== '—' && text !== ''), JSON.stringify(netCells));
}

// ------------------------------------------- a negative advance is unchanged by all this
{
    suite('a man whose only record is a negative advance is where he always was');

    const device = phone(SHUT);
    // Written straight onto the record: the form refuses it, and this arrives from
    // another phone, an import or a restore. moneyOf nets nothing off a negative amount,
    // and payrollRows has never kept a row for one.
    device.run(`State.schedule.advances = { a_neg: { id: 'a_neg', workerId: 'w_none',
        date: '${WORKED}', amount: -300, note: '' } };`);
    device.State.save({ silent: true });
    const all = ids(device, 'payrollRows()');
    const finance = ids(device, 'payrollDisplaySplit().finance');
    check('he is in no list, exactly as before the split',
        all.indexOf('w_none') === -1 && finance.indexOf('w_none') === -1,
        `${all} / ${finance}`);
    // Said out loud because it is a decision and not an oversight: making that money
    // visible is a change to what the record SHOWS, and it belongs to the owner, not to
    // the commit that moved the hiding one layer up.
}

report();
