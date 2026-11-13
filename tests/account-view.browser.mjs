// v189 in a real Chromium: the pay sheet on its default range, each man in his own period.
//
//   node tests/account-view.browser.mjs
//
// tests/account-view.test.mjs proves the figures against v186's own bytes. This is the
// half that needs a screen, a finger and a sheet of paper: what the owner sees when
// «דוחות» opens (no amber sentence, each group under its own dates), that a tap on a
// weekly man's card opens HIS week and that «סגור את החשבון» there closes exactly that
// week, the one new control (44px, 16px, on the glass at 320), where it takes the page,
// and what the paper, the picture and the file say about a page that holds two periods.
//
// Synthetic men, one invented site. NOT a real phone.

import { chromium } from 'playwright';
import { serve } from './serve.mjs';
import { launchLocalBrowser } from './network-guard.mjs';
import { verifyServedAssets, expectedShaFor } from './treecheck.mjs';
import { readPdf, pageText } from './pdf.mjs';
import { suite, check, same, given, report } from './runner.mjs';

const root = new URL('..', import.meta.url).pathname;
const server = await serve(root);
check('the account view suite uses the named tree',
    (await verifyServedAssets(server.url, root, expectedShaFor(root))).ok);
const browser = await launchLocalBrowser(chromium, { executablePath: process.env.CHROME_PATH });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));

const plain = text => String(text).replace(/[‎‏⁦⁧⁨⁩]/g, '').replace(/ /g, ' ');
const AMBER = 'הטווח שנבחר אינו תקופת התשלום של העובדים האלה';
const FORT = { from: '2026-10-30', to: '2026-11-12' };
const WEEK1 = { from: '2026-10-30', to: '2026-11-05' };
const WEEK2 = { from: '2026-11-06', to: '2026-11-12' };

const seed = () => page.evaluate(() => {
    todayStr = () => '2026-11-11';
    const W = '2026-08-07=weekly';
    State.schedule = emptySchedule();
    State.schedule.workers = [
        { id: 'w_wa', name: 'כרם נסאר', active: true, dailyRate: 450, hourlyRate: 0, payCycles: W },
        { id: 'w_ba', name: 'סאלח מנסור', active: true, dailyRate: 500, hourlyRate: 0 },
        { id: 'w_wb', name: 'נאסר עודה', active: true, dailyRate: 400, hourlyRate: 0, payCycles: W },
        { id: 'w_wc', name: 'זיאד חלבי', active: true, dailyRate: 420, hourlyRate: 0, payCycles: W },
        { id: 'w_bb', name: 'עודי חסן', active: true, dailyRate: 480, hourlyRate: 0 }
    ];
    State.schedule.places = [{ id: 'p_01', name: 'הרצליה', active: true }];
    const work = (id, date, rate) => assignPlace(State.schedule, date, id, 'actual', 'p_01', rate || 'normal');
    // w_wa: three days in week 1; in week 2 a day and a double day, and 300 taken.
    ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-08'].forEach(date => work('w_wa', date));
    work('w_wa', '2026-11-09', 'double');
    addAdvance(State.schedule, 'w_wa', '2026-11-09', 300, '');
    // w_wb: week 2 only. w_wc: week 1 only - nothing in his current week.
    ['2026-11-08', '2026-11-10'].forEach(date => work('w_wb', date));
    work('w_wc', '2026-11-02');
    // Fortnightly: a day in each week; one double day.
    work('w_ba', '2026-11-01'); work('w_ba', '2026-11-09');
    work('w_bb', '2026-11-02', 'double');
    const plan = planCarryMigration(State.schedule);
    if (plan.needed) recordCarryApproval(State.schedule, plan, '2026-10-29T09:00:00.000Z', 'd_person');
    State.save({ silent: true });
    REPORT_RANGE.from = null; REPORT_RANGE.to = null; REPORT_PRESET = 'fortnight';
    REPORT_WORKERS = null; REPORT_SECTION = 'workers'; REPORT_CARD_GRID = true; REPORT_RANGE_OPEN = false;
    REPORT_DEDUCTIONS.clear();
    showView('reports');
});

const pageFacts = () => page.evaluate(() => ({
    range: { ...REPORT_RANGE },
    preset: REPORT_PRESET,
    headings: [...document.querySelectorAll('#reportsView .report-payroll h3.report-group[id]')].map(node => node.textContent),
    // What the glass shows of each (the owner, 2026-11-11: the word alone).
    shown: [...document.querySelectorAll('#reportsView .report-payroll h3.report-group[id]')].map(node => node.innerText.trim()),
    warn: [...document.querySelectorAll('#reportsView .report-payroll .hint-warn')]
        .filter(node => node.offsetParent !== null).map(node => node.textContent),
    tiles: [...document.querySelectorAll('#reportsView .report-worker-tile')].map(tile => ({
        id: tile.getAttribute('data-report-worker-id'),
        net: tile.querySelector('.report-tile-value').textContent,
        days: tile.querySelector('.report-tile-metrics strong').textContent
    })),
    chips: [...document.querySelectorAll('.report-cycle-nav button')].map(node => node.textContent)
}));

try {
    await page.goto(server.url);
    await seed();

    suite('the page as it opens: each group in its own period, and no amber sentence');
    const facts = await pageFacts();
    same('it opens on the fortnight containing today', facts.range, FORT);
    // MOVED ON PURPOSE (the owner, 2026-11-11: «שבועי» or «דו־שבועי» is enough, told apart
    // by colour): the glass shows each heading's word and nothing else. The heading's TEXT -
    // what the paper prints and the picture titles a table with - still says its own dates.
    same('on the glass each group is its cycle\'s word, and nothing else', facts.shown, ['שבועי', 'דו־שבועי']);
    same('the weekly group under its week, the fortnightly under its fortnight - in the text the paper and the picture read',
        facts.headings.map(plain), ['שבועי · 06/11/2026 - 12/11/2026', 'דו־שבועי · 30/10/2026 - 12/11/2026']);
    same('no amber sentence is on the screen', facts.warn.filter(text => text.includes(AMBER)), []);
    // LITERALS, worked by hand: w_wa week 2 = 450 + 2x450 = 1,350, less 300 = 1,050, three
    // pay days; w_wb 2 x 400 = 800; w_ba 2 x 500 = 1,000 over the fortnight; w_bb 2 x 480.
    same('every card is that man\'s own account', facts.tiles, [
        { id: 'w_wa', net: '1050', days: '3' },
        { id: 'w_wb', net: '800', days: '2' },
        { id: 'w_ba', net: '1000', days: '2' },
        { id: 'w_bb', net: '960', days: '2' }]);
    same('the two jump buttons count the men on the page', facts.chips, ['שבועי · 2', 'דו־שבועי · 2']);
    await page.locator('.report-cycle-nav button').last().click();
    same('and still jump to their group', await page.evaluate(() => document.activeElement.id), 'report-cycle-biweekly');
    await page.locator('.report-layout-toggle').click();
    same('«תצוגה מפורטת» shows the same rows, in two tables',
        await page.evaluate(() => [...document.querySelectorAll('#reportsView .report-payroll-group')].map(group =>
            [...group.querySelectorAll('tbody tr')].filter(tr => tr.offsetParent !== null)
                .map(tr => [tr.children[0].textContent, tr.lastElementChild.textContent.replace(/[^\d-]/g, '')]))),
        [[['כרם נסאר', '1050'], ['נאסר עודה', '800']], [['סאלח מנסור', '1000'], ['עודי חסן', '960']]]);
    same('each table\'s band adds up its own period',
        await page.evaluate(() => [...document.querySelectorAll('#reportsView .report-payroll-group tfoot tr')]
            .map(tr => tr.lastElementChild.textContent.replace(/[^\d-]/g, ''))), ['1850', '1960']);
    await page.locator('.report-layout-toggle').click();

    suite('the open account the default does not show');
    const other = page.locator('.report-other-account');
    same('one line, under the weekly group', await other.count(), 1);
    same('the sentence (PROPOSED)', plain(await other.locator('p').textContent()),
        'חשבון פתוח נוסף, שאינו כלול בסכומים כאן: 30/10/2026 - 05/11/2026 · כרם נסאר, זיאד חלבי.');
    same('the button (PROPOSED)', plain(await other.locator('button').textContent()), 'הצג את החשבון 30/10 - 05/11');
    check('it sits between the weekly group and the fortnightly heading', await page.evaluate(() => {
        const top = selector => document.querySelector(selector).getBoundingClientRect().top;
        return top('#report-cycle-weekly') < top('.report-other-account')
            && top('.report-other-account') < top('#report-cycle-biweekly');
    }));
    for (const [width, height, scheme, scale] of [[320, 568, 'light', 1], [375, 667, 'dark', 1], [440, 956, 'dark', 1], [320, 568, 'light', 2]]) {
        await page.setViewportSize({ width, height });
        await page.emulateMedia({ colorScheme: scheme });
        await page.evaluate(value => { document.documentElement.style.fontSize = value === 1 ? '' : `${16 * value}px`; }, scale);
        const box = await other.locator('button').evaluate(node => {
            const rect = node.getBoundingClientRect();
            return { w: rect.width, h: rect.height, left: rect.left, right: rect.right,
                font: parseFloat(getComputedStyle(node).fontSize) };
        });
        const name = `${width}x${height} ${scheme}${scale === 2 ? ' doubled text' : ''}`;
        check(`${name}: the button is 44px both ways`, box.w >= 44 && box.h >= 44, JSON.stringify(box));
        check(`${name}: its words are 16px or more`, box.font >= 16, String(box.font));
        check(`${name}: it is wholly on the glass`, box.left >= 0 && box.right <= width + 0.5, JSON.stringify(box));
        check(`${name}: the page does not scroll sideways`,
            await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
        check(`${name}: a heading with its dates stays inside the page`, await page.evaluate(() =>
            [...document.querySelectorAll('#reportsView .report-payroll h3.report-group[id]')].every(node => {
                const rect = node.getBoundingClientRect();
                return rect.left >= 0 && rect.right <= document.documentElement.clientWidth + 0.5;
            })));
        // Every pair of dates ON THE GLASS - the open account's sentence - goes to a new line
        // WHOLE. At doubled text on 320px no line can hold one, and there it may wrap
        // inside its own block; the floor that holds there is the one above.
        // MOVED ON PURPOSE (2026-11-11): a heading's dates are no longer on the glass - they
        // are the paper's and the picture's (below) - so they are held to being absent here.
        if (scale === 1) {
            check(`${name}: no pair of dates on the glass is broken across lines`, await page.evaluate(() => {
                const shown = [...document.querySelectorAll('#reportsView .report-payroll .report-dates')]
                    .filter(node => !node.closest('.report-group-when'));
                return shown.length > 0 && shown.every(node => {
                    const range = document.createRange();
                    range.selectNodeContents(node);
                    const rects = [...range.getClientRects()].filter(rect => rect.width > 0);
                    return rects.length > 0 && rects.every(rect => Math.abs(rect.top - rects[0].top) < 2);
                });
            }));
        }
        same(`${name}: and no heading's dates are on the glass`, await page.evaluate(() =>
            [...document.querySelectorAll('#reportsView .report-payroll .report-group-when')]
                .map(node => [getComputedStyle(node).display, node.getBoundingClientRect().width])), [['none', 0], ['none', 0]]);
    }
    await page.evaluate(() => { document.documentElement.style.fontSize = ''; });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ colorScheme: 'light' });

    suite('the paper, the picture and the file say which period is which');
    const picture = await page.evaluate(() => readReportPrintout());
    same('the picture titles each table with its own dates',
        picture.groups.map(group => plain(group.groupTitle)), ['שבועי · 06/11/2026 - 12/11/2026', 'דו־שבועי · 30/10/2026 - 12/11/2026']);
    check('and carries the sentence about the open account',
        picture.notes.some(note => plain(note).startsWith('חשבון פתוח נוסף, שאינו כלול בסכומים כאן: 30/10/2026 - 05/11/2026')),
        JSON.stringify(picture.notes));
    check('and no amber sentence', picture.notes.every(note => !note.includes(AMBER)));
    same('the picture\'s rows are the screen\'s cards',
        picture.groups.map(group => group.rows.map(row => [row[0], String(row[row.length - 1]).replace(/[^\d-]/g, '')])),
        [[['כרם נסאר', '1050'], ['נאסר עודה', '800']], [['סאלח מנסור', '1000'], ['עודי חסן', '960']]]);

    await page.emulateMedia({ media: 'print' });
    same('on paper: both headings, the sentence, and not the button', await page.evaluate(() => [
        [...document.querySelectorAll('#reportsView .report-payroll h3.report-group[id]')]
            .every(node => getComputedStyle(node).display !== 'none'),
        getComputedStyle(document.querySelector('.report-other-account p')).display !== 'none',
        getComputedStyle(document.querySelector('.report-other-account button')).display]), [true, true, 'none']);
    // The part of each heading the glass leaves out (2026-11-11) is on the paper.
    same('on paper each heading says its own dates', await page.evaluate(() =>
        [...document.querySelectorAll('#reportsView .report-payroll h3.report-group[id]')].map(node =>
            node.innerText.replace(/[‎⁦-⁩]/g, '').replace(/\s+/g, ' ').trim())),
    ['שבועי · 06/11/2026 - 12/11/2026', 'דו־שבועי · 30/10/2026 - 12/11/2026']);
    await page.emulateMedia({ media: null });
    const paper = readPdf(await page.pdf({ format: 'A4', printBackground: true })).pages.map(pageText).join('\n');
    const reversed = text => [...text].reverse().join('');
    const says = text => paper.includes(text) || paper.includes(reversed(text));
    check('a real printout carries the week\'s dates and the fortnight\'s',
        says('06/11/2026') && says('30/10/2026') && says('12/11/2026') && says('05/11/2026'), paper.slice(0, 400));
    check('and each man\'s own net', ['1050', '800', '1000', '960'].every(says), paper.slice(0, 600));
    check('and not the amber sentence', !says('אינו תקופת התשלום'), paper.slice(0, 600));
    // The weekly band on paper is the week's: 1,350 + 800 earned, 300 off, 1,850 to pay.
    check('the weekly table\'s band on paper is the week\'s', says('1850') && says('2150'), paper.slice(0, 600));

    const sheets = await page.evaluate(() => reportSheets());
    const head = sheets.payroll[0];
    const col = name => head.indexOf(name);
    same('the workbook\'s pay sheet: every man\'s net and whose days they are',
        sheets.payroll.slice(1).map(row => [row[0], row[col('ימי שכר')], row[col('לתשלום')], row[col('מחזור תשלום')]]), [
            ['כרם נסאר', 3, 1050, 'שבועי · 06/11/2026 עד 12/11/2026'],
            ['סאלח מנסור', 2, 1000, 'דו־שבועי'],
            ['נאסר עודה', 2, 800, 'שבועי · 06/11/2026 עד 12/11/2026'],
            ['עודי חסן', 2, 960, 'דו־שבועי'],
            ['זיאד חלבי', '', '', 'שבועי · 06/11/2026 עד 12/11/2026']]);
    check('the open week is in the note of each man it belongs to',
        ['כרם נסאר', 'זיאד חלבי'].every(name => String(sheets.payroll.filter(row => row[0] === name)[0][col('הערה')])
            .includes('חשבון פתוח נוסף, שאינו כלול בסכומים כאן: 30/10/2026 עד 05/11/2026'))
        && !String(sheets.payroll.filter(row => row[0] === 'נאסר עודה')[0][col('הערה')]).includes('חשבון פתוח נוסף'));
    same('the days sheet lists a weekly man\'s week and a fortnightly man\'s fortnight',
        sheets.detail.slice(1).map(row => `${row[2]} ${row[0]}`), [
            'כרם נסאר 2026-11-08', 'כרם נסאר 2026-11-09',
            'סאלח מנסור 2026-11-01', 'סאלח מנסור 2026-11-09',
            'נאסר עודה 2026-11-08', 'נאסר עודה 2026-11-10',
            'עודי חסן 2026-11-02']);
    check('the client\'s sheet still covers the whole range',
        sheets.invoice.some(row => String(row[0]).includes('2026-11-01') || String(row[0]).includes('01/11')), JSON.stringify(sheets.invoice.slice(0, 3)));

    suite('a tap on a weekly man opens his week, and a close there closes that week');
    const before = await page.evaluate(() => JSON.stringify(State.schedule));
    await page.locator('[data-report-worker-id="w_wa"]').click();
    same('the dialog is his week', plain(await page.locator('#workerDaysMeta').textContent()), '06/11/2026 - 12/11/2026');
    same('with that week\'s days and no others',
        await page.locator('#workerDaysBody .attendance-chip, #workerDaysBody .wday:not(.wday-total)').count() > 0
            && await page.evaluate(() => [...document.querySelectorAll('#workerDaysBody .wday:not(.wday-total) .wday-date')]
                .map(node => node.textContent.replace(/[^\d/]/g, '')).filter(Boolean)),
        // The day, the double day, and the advance taken on it.
        ['08/11/2026', '09/11/2026', '09/11/2026']);
    same('opening it wrote nothing', await page.evaluate(() => JSON.stringify(State.schedule)), before);
    const closure = page.locator('#workerDaysBody .period-closure');
    given('the closing block is offered on the default', await closure.count() === 1);
    await closure.locator('input').fill('300');
    await closure.getByRole('button', { name: 'סגירת חשבון התקופה' }).click();
    await page.locator('#askOk').click();
    await page.waitForFunction(() => Object.keys(closedPeriods(State.schedule, 'w_wa')).length > 0);
    same('exactly his week was closed', await page.evaluate(() => {
        const closed = closedPeriods(State.schedule, 'w_wa');
        return Object.keys(closed).map(from => [from, closed[from].periodTo]);
    }), [[WEEK2.from, WEEK2.to]]);
    same('and nobody else\'s', await page.evaluate(() =>
        ['w_ba', 'w_wb', 'w_wc', 'w_bb'].map(id => Object.keys(closedPeriods(State.schedule, id)).length)), [0, 0, 0, 0]);
    await page.evaluate(() => closeWorkerDays());
    const after = await pageFacts();
    same('the page is still on its default, with the same cards', [after.range, after.tiles], [FORT, facts.tiles]);

    suite('a fortnightly man\'s dialog is his fortnight');
    await page.locator('[data-report-worker-id="w_ba"]').click();
    same('the dialog is the fortnight', plain(await page.locator('#workerDaysMeta').textContent()), '30/10/2026 - 12/11/2026');
    await page.evaluate(() => closeWorkerDays());

    suite('the button points the page at the open week, as an explicit range');
    await other.locator('button').click();
    const week = await pageFacts();
    same('the page is on that week', week.range, WEEK1);
    same('with «שבוע קודם» lit', await page.evaluate(() =>
        [...document.querySelectorAll('.range-chips button')].filter(node => node.getAttribute('aria-pressed') === 'true').map(node => node.textContent)),
        ['שבוע קודם']);
    same('the weekly men of that week, each with that week\'s account', week.tiles.filter(tile => tile.id.startsWith('w_w')),
        [{ id: 'w_wa', net: '1350', days: '3' }, { id: 'w_wc', net: '420', days: '1' }]);
    same('headings are the plain ones again', week.headings, ['שבועי', 'דו־שבועי']);
    check('and the fortnightly men, looked at over a week, are told so - word for word',
        week.warn.filter(text => text === 'הטווח שנבחר אינו תקופת התשלום של העובדים האלה, ולכן זאת תצוגה של ימים ולא '
            + 'חשבון לתשלום: אין כאן יתרה מועברת ואי אפשר לסגור מכאן.').length === 1, JSON.stringify(week.warn));
    check('keyboard focus went to the first group', await page.evaluate(() => document.activeElement.id === 'report-cycle-weekly'));
    if (!(await page.locator('.range-wrap').evaluate(node => node.open))) await page.locator('.report-range-heading').click();
    await page.getByRole('button', { name: 'תקופת החשבון', exact: true }).click();
    const back = await pageFacts();
    same('«תקופת החשבון» is the default again', [back.range, back.headings.map(plain), back.tiles],
        [FORT, ['שבועי · 06/11/2026 - 12/11/2026', 'דו־שבועי · 30/10/2026 - 12/11/2026'], facts.tiles]);

    suite('the same fourteen days typed by hand are a way of looking, as before');
    await page.evaluate(() => { REPORT_PRESET = 'custom'; render(); });
    const typed = await pageFacts();
    same('the range has not moved', typed.range, FORT);
    check('the weekly men are shown the fortnight, with the amber sentence',
        typed.warn.some(text => text.includes(AMBER)) && typed.headings[0] === 'שבועי'
        && typed.tiles.filter(tile => tile.id === 'w_wa')[0].days === '6', JSON.stringify(typed.tiles));
    check('and no other-account line: every day is on the page', await other.count() === 0);

    suite('«לפי אתר» is not touched by any of it');
    const sitesOf = () => page.evaluate(() => JSON.stringify([invoiceRows(), invoiceSheetRows()]));
    await page.evaluate(() => { REPORT_PRESET = 'fortnight'; render(); });
    const sitesDefault = await sitesOf();
    await page.evaluate(() => { REPORT_PRESET = 'custom'; render(); });
    same('the sites report is the same on the default and on the typed range', await sitesOf(), sitesDefault);

    same('no page error', errors, []);
} finally {
    await browser.close();
    server.close();
}
report();
