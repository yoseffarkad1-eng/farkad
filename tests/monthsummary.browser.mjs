// סיכום חודש in a real Chromium.
//
//   node tests/monthsummary.browser.mjs
//
// tests/monthsummary.test.mjs holds every figure against the reports on devices in Node.
// What it cannot hold is the glass: that the way in is one row of «הפקת דוח» and the
// toolbar, the switch and the range picker are on the pixels they were on; that the
// summary opens as one of the app's dialogs - entered at its heading, shut by Escape and
// by the backdrop, the focus given back to the menu's trigger, Tab kept inside it; that
// the two arrows walk the months and keep the focus; that nothing on it can be typed into;
// that a site's bar is the colour that site has on the reports screen; that the text
// leaves by the share sheet, by wa.me and by the clipboard and is never called sent; that
// it fits a 375x667 phone and a 440x956 one, dark and light, and at doubled text, with no
// sideways scroll, every target 48px both ways and no word under 16px; and that the
// phone's disk is byte for byte what it was. NOT a real phone: emulated touch and
// Chromium's layout.
//
// MONTHSUMMARY_SHOTS=<folder> also saves pictures of it there (they assert nothing).

import { chromium } from 'playwright';
import { join } from 'node:path';
import { serve } from './serve.mjs';
import { launchLocalBrowser } from './network-guard.mjs';
import { verifyServedAssets, expectedShaFor } from './treecheck.mjs';
import { suite, check, same, given, report } from './runner.mjs';

const root = new URL('..', import.meta.url).pathname;
const server = await serve(root);
check('the browser is served the named tree',
    (await verifyServedAssets(server.url, root, expectedShaFor(root))).ok);
const browser = await launchLocalBrowser(chromium, { executablePath: process.env.CHROME_PATH });
const errors = [];
const SHOTS = process.env.MONTHSUMMARY_SHOTS || '';

const TODAY = '2026-11-10';
const plain = text => String(text).replace(/[‎⁦-⁩]/g, '');

async function phone(width, height, scheme, options = {}) {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2,
        isMobile: true, hasTouch: true, colorScheme: scheme, serviceWorkers: 'block' });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.clock.setFixedTime(`${TODAY}T10:00:00`);
    if (options.noShare) await page.addInitScript(() => { Object.defineProperty(navigator, 'share', { value: undefined, configurable: true }); });
    await page.goto(server.url);
    await page.waitForFunction(() => typeof openMonthSummary === 'function' && typeof State === 'object');
    // Synthetic names throughout. September one day; October with a raise in it, a double
    // day, extra hours and Rima; November in progress, with both counts, a long site name,
    // a man with no rate, an advance and cash handed back.
    await page.evaluate(today => {
        todayStr = () => today;
        State.schedule.workers = [
            { id: 'w_01', name: 'דוגמה אלף', active: true, dailyRate: 400, hourlyRate: 60 },
            { id: 'w_02', name: 'דוגמה בית', active: true, dailyRate: 300, hourlyRate: 50, payCycles: '2026-08-07=weekly' },
            { id: 'w_03', name: 'דוגמה גימל עם שם ארוך במיוחד לבדיקה', active: true },
            { id: 'w_04', name: 'דוגמה דלת', active: true, dailyRate: 380 }];
        State.schedule.places = [
            { id: 'p_01', name: 'אתר צפון', active: true },
            { id: 'p_02', name: 'אתר דרום', active: true },
            { id: 'p_03', name: 'מגדל המרכז עם שם ארוך מאוד לבדיקת שבירה', active: true }];
        State.commitRoster();
        const put = (date, worker, place, rate, hours) =>
            State.commit(assignPlace(State.schedule, date, worker, 'actual', place, rate, hours));
        put('2026-09-30', 'w_01', 'p_01');
        ['2026-10-01', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08'].forEach(date => {
            put(date, 'w_01', 'p_01'); put(date, 'w_02', 'p_02'); put(date, 'w_04', 'p_01');
        });
        State.schedule.workers[0].dailyRate = 500;
        State.commitRoster();
        ['2026-10-25', '2026-10-26', '2026-10-27'].forEach(date => { put(date, 'w_01', 'p_03'); put(date, 'w_04', 'p_03'); });
        put('2026-10-31', 'w_01', 'p_02', 'double'); put('2026-10-31', 'w_02', 'p_02', 'extra', 2);
        State.commit(setRimaCount(State.schedule, '2026-10-25', 'p_03', 3));
        ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-08', '2026-11-09', '2026-11-10']
            .forEach((date, at) => {
                put(date, 'w_01', ['p_01', 'p_03'][at % 2]);
                put(date, 'w_04', 'p_01');
                if (at % 2 === 0) put(date, 'w_02', 'p_02');
                if (at < 3) put(date, 'w_03', 'p_03');
            });
        put('2026-11-02', 'w_01', 'p_02');
        put('2026-11-09', 'w_04', 'p_03', 'double');
        put('2026-11-10', 'w_02', 'p_02', 'extra', 3.5);
        State.commit(markAbsent(State.schedule, '2026-11-06', 'w_01', 'actual'));
        State.commit(setRimaCount(State.schedule, '2026-11-02', 'p_01', 2));
        State.commit(setRimaCount(State.schedule, '2026-11-07', 'p_03', 4));
        State.commit(setYosefGevesCount(State.schedule, '2026-11-03', 'p_03', 5));
        State.commitMany(recordNewAdvance(State.schedule, 'w_01', '2026-11-04', 1500, '',
            '2026-11-04T08:00:00Z', 'd_test', 'cash'));
        const plan = planCarryMigration(State.schedule);
        // Recorded whether or not it is needed yet - the step the app itself takes with
        // the first financial action (saveFinancialAction), so the repayment below does not
        // turn the reading back.
        State.commit(recordCarryApproval(State.schedule, plan, "2026-11-05T09:00:00.000Z", "d_test"));
        const advance = advancesFor(State.schedule, 'w_01', '2026-11-01', '2026-11-30')[0];
        State.commit(recordAdvanceRepaid(State.schedule, advance.id, 300, '2026-11-08', '',
            '2026-11-08T10:00:00.000Z', 'd_test', 'cash'));
        showView('reports');
    }, TODAY);
    await page.waitForTimeout(250);
    return page;
}

const disk = page => page.evaluate(() => JSON.stringify(Object.keys(localStorage).sort()
    .map(key => [key, localStorage.getItem(key)])));
const isOpen = page => page.evaluate(() => document.getElementById('monthSummaryModal').style.display === 'flex');
const openIt = async page => {
    if (!(await page.locator('.report-output-actions').evaluate(node => node.open))) {
        await page.locator('.report-output-actions > summary').click();
    }
    await page.locator('#monthSummaryOpen').click();
    await page.waitForTimeout(80);
};
const shot = async (page, name, target) => {
    if (!SHOTS) return;
    const file = join(SHOTS, `${name}.jpg`);
    if (target) await page.locator(target).screenshot({ path: file, type: 'jpeg', quality: 80 });
    else await page.screenshot({ path: file, type: 'jpeg', quality: 80 });
};

try {
    const page = await phone(440, 956, 'dark');
    const before = await disk(page);
    const record = await page.evaluate(() => JSON.stringify(State.schedule));

    // ------------------------------------------------------------ the way in
    suite('one row in «הפקת דוח», and nothing on the reports screen moved');
    given('the record on this phone may be read the new way, as the owner\'s may',
        await page.evaluate(() => carryReportingEnabled(State.schedule)) === true);
    const layout = () => page.evaluate(() => ['.reports-toolbar', '.reports-heading', '.report-output-actions > summary',
        '.report-section-toggle', '.range-wrap', '.report-payroll'].map(selector => {
        const box = document.querySelector(selector).getBoundingClientRect();
        return [selector, Math.round(box.left), Math.round(box.top), Math.round(box.width), Math.round(box.height)];
    }));
    const withIt = await layout();
    check('the menu is shut, and its rows with it', !(await page.locator('#monthSummaryOpen').isVisible()));
    await page.evaluate(() => { window.__entry = monthSummaryEntry; monthSummaryEntry = undefined; render(); });
    same('a build without the file has the three outputs it always had',
        await page.locator('.report-output-actions button').count(), 3);
    const without = await layout();
    await page.evaluate(() => { monthSummaryEntry = window.__entry; render(); });
    same('the toolbar, the heading, the trigger, the switch, the range and the sheet are on the pixels they were on',
        withIt, without);
    await page.locator('.report-output-actions > summary').click();
    same('opened, the menu has the three outputs and then this row',
        await page.locator('.report-output-actions button:visible').evaluateAll(nodes => nodes.map(node => node.textContent.replace(/^[^א-ת]*/, ''))),
        ['הדפסה', 'שיתוף כתמונה', 'יצוא', 'סיכום חודש']);
    const entryBox = await page.locator('#monthSummaryOpen').boundingBox();
    check('the row is 44px both ways and wholly on the glass', entryBox.height >= 44 && entryBox.width >= 44
        && entryBox.x >= 0 && entryBox.x + entryBox.width <= 441, JSON.stringify(entryBox));
    await shot(page, '01-entry-in-menu-440-dark');

    // ------------------------------------------------------------ the dialog
    suite('it opens as one of the app\'s dialogs');
    await page.locator('#monthSummaryOpen').click();
    await page.waitForTimeout(80);
    check('the row opens it', await isOpen(page));
    check('the menu shut behind it', !(await page.locator('.report-output-actions').evaluate(node => node.open)));
    same('it is entered at its heading', await page.evaluate(() => document.activeElement.id), 'monthSummaryTitle');
    same('on the month today is in', [await page.locator('#monthSummaryTitle').innerText(),
        await page.locator('#monthSummaryMonth').innerText()], ['סיכום חודש', 'נובמבר 2026']);
    same('the report\'s own range and filter were not touched by opening it', await page.evaluate(() =>
        [REPORT_RANGE.from, REPORT_RANGE.to, REPORT_WORKERS]), ['2026-10-30', '2026-11-12', null]);
    await shot(page, '02-november-top-440-dark');

    const facts = await page.evaluate(() => monthSummaryFacts('2026-11'));
    same('the four tiles are the four figures, each with its step from October in words',
        await page.locator('.msum-tile').evaluateAll(nodes => nodes.map(node => [...node.children].map(child => child.textContent))),
        facts.headline.map(item => [item.label, item.text, item.delta.text]));
    same('and they are what this record holds', facts.headline.map(item => [item.id, item.value, plain(item.delta.text)]), [
        // November, by hand: אלף 8 days at 500 = 4,000 · דלת 8 days, one of them double, at
        // 380 = 3,420 · בית 5 days at 300 and 3.5 hours at 50 = 1,675 · גימל 3 days, no rate.
        // October: אלף 6 at 400, 3 at 500 and a double = 4,900 · בית 7 at 300 and 2 hours =
        // 2,200 · דלת 9 at 380 = 3,420 - 26 days, 10,520.
        ['attendance', 24, '↓ 2 פחות מאוקטובר'], ['workingDays', 8, '↓ 2 פחות מאוקטובר'],
        ['gross', 9095, '↓ 1425 ₪ פחות מאוקטובר'], ['rima', 6, '↑ 3 יותר מאוקטובר']]);
    same('the month is not over, and the screen says so',
        await page.locator('.msum-progress').innerText(), 'החודש עוד לא נגמר. המספרים הם של מה שנרשם עד עכשיו, וההשוואה היא מול חודש שלם.');
    same('a bar per site, longest first, the number beside it',
        await page.locator('.msum-bar-row').evaluateAll(nodes => nodes.map(node =>
            [node.querySelector('.site-name').textContent, node.querySelector('.msum-bar-count').textContent])),
        facts.work.sites.map(site => [site.name, String(site.days)]));
    const widths = await page.locator('.msum-bar-fill').evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().width));
    check('the bars are drawn in proportion: the first the longest, none of them nothing',
        widths.every((width, at) => width > 4 && (at === 0 || width <= widths[at - 1] + 1)), JSON.stringify(widths));
    // THE SITE'S COLOUR IS THE ONE IT HAS ON THE REPORTS SCREEN.
    const colours = await page.evaluate(() => {
        const held = [REPORT_RANGE.from, REPORT_RANGE.to, REPORT_SECTION];
        REPORT_RANGE.from = '2026-11-01'; REPORT_RANGE.to = '2026-11-30'; REPORT_SECTION = 'sites';
        render();
        const read = (rows, name, swatch, fill) => { const out = {}; document.querySelectorAll(rows).forEach(row => {
            out[row.querySelector(name).textContent] = [getComputedStyle(row.querySelector(swatch)).backgroundColor,
                getComputedStyle(row.querySelector(fill)).backgroundColor]; });
            return Object.keys(out).sort().map(key => [key, out[key]]); };
        const got = [read('.msum-bar-row', '.site-name', '.msum-swatch', '.msum-bar-fill'),
            read('.invoice-bar-row', '.site-name', '.invoice-swatch', '.invoice-bar-fill')];
        [REPORT_RANGE.from, REPORT_RANGE.to, REPORT_SECTION] = held;
        render();
        return got;
    });
    same('each site\'s swatch and bar are the colour that site has on the billing bars', colours[0], colours[1]);
    check('and three sites are three colours', new Set(colours[0].map(pair => pair[1][0])).size === 3, JSON.stringify(colours[0]));
    same('the two counts are apart, each under its own name, with its own total and its own note',
        await page.evaluate(() => ['.msum-rima', '.msum-yosefgeves'].map(selector => { const block = document.querySelector(selector);
            return [block.querySelector('.msum-head').textContent, block.querySelector('.msum-total').textContent,
                block.querySelector('.msum-note').textContent]; })),
        [['רישום לרימא', 'סה״כ עובדי רימא6', 'עובדי רימא בלבד. אינם נכללים בשכר. בחיוב כל אחד מהם נספר כיום עובד־אתר אחד.'],
            ['עובדי יוסף גבס', 'סה״כ עובדי יוסף גבס5', 'עובדי יוסף גבס בלבד. אינם נכללים בשכר ואינם נכללים בחיוב.']]);
    same('the money is in the sheet\'s and the ledger\'s words, and the man with no rate is named',
        [await page.locator('.msum-money .msum-line').evaluateAll(nodes => nodes.map(node => [...node.children].map(child => child.textContent))),
            plain(await page.locator('.msum-money .msum-warn').innerText())],
        [[['נצבר', '9095 ₪'], ['מקדמות', '1500 ₪'], ['הוחזר במזומן', '300 ₪']],
            '⚠️ 1 עובדים בלי שכר יומי, ולכן הסכום חסר אותם: דוגמה גימל עם שם ארוך במיוחד לבדיקה. הוסף להם שכר במסך "עובדים ואתרים".']);
    // The same numbers on the reports screen, with its range on the month, off the DOM.
    const sheet = await page.evaluate(() => {
        const held = [REPORT_RANGE.from, REPORT_RANGE.to, REPORT_SECTION];
        REPORT_RANGE.from = '2026-11-01'; REPORT_RANGE.to = '2026-11-30'; REPORT_SECTION = 'sites';
        render();
        const total = document.querySelector('.invoice-bars-total strong').textContent;
        const rima = [...document.querySelectorAll('.rima-table tfoot td, .rima-table tr:last-child td')].pop().textContent;
        const yosef = [...document.querySelectorAll('.yosefgeves-table tr:last-child td')].pop().textContent;
        const file = payrollSheetRows();
        const at = file[0].indexOf('נצבר');
        const gross = file.slice(1).reduce((sum, row) => sum + (typeof row[at] === 'number' ? row[at] : 0), 0);
        [REPORT_RANGE.from, REPORT_RANGE.to, REPORT_SECTION] = held;
        render();
        return [total, rima, yosef, gross];
    });
    same('the billing total, the Rima total, the יוסף גבס total and the wages are the reports screen\'s for that month',
        [String(facts.work.total), String(facts.rima.total), String(facts.yosef.total), facts.money.gross], sheet);

    same('nothing on it can be typed into or switched: one field, and it is read-only',
        await page.evaluate(() => [...document.querySelectorAll('#monthSummaryModal input, #monthSummaryModal select, #monthSummaryModal textarea, #monthSummaryModal [contenteditable]')]
            .map(node => [node.tagName, node.readOnly])), [['TEXTAREA', true]]);

    // ------------------------------------------------------------ keyboard, backdrop, focus
    suite('Escape, the backdrop, Tab and the focus');
    const order = [];
    for (let n = 0; n < 7; n += 1) {
        await page.keyboard.press('Tab');
        order.push(await page.evaluate(() => document.activeElement.id || document.activeElement.tagName));
    }
    same('Tab walks the arrows, the fold and the three buttons, and comes round inside the dialog', order,
        ['monthSummaryPrev', 'monthSummaryNext', 'monthSummaryFoldLabel', 'monthSummarySend', 'monthSummaryCopy',
            'monthSummaryClose', 'monthSummaryPrev']);
    await page.keyboard.press('Escape');
    check('Escape closes it', !(await isOpen(page)));
    same('and it forgets which month it was', await page.evaluate(() => MONTH_SUMMARY_KEY), null);
    // Given back a moment after closing (closeMonthSummary), once the dialogs' own return has run.
    await page.waitForTimeout(80);
    same('the focus is back on the menu\'s trigger', await page.evaluate(() =>
        [document.activeElement.tagName, document.activeElement.parentElement.className]), ['SUMMARY', 'report-output-actions']);
    await openIt(page);
    await page.mouse.click(4, 4);
    await page.waitForTimeout(60);
    check('a tap on the backdrop closes it', !(await isOpen(page)));
    await openIt(page);
    await page.locator('#monthSummaryClose').click();
    check('and so does «סגור»', !(await isOpen(page)));

    // ------------------------------------------------------------ the arrows
    suite('the two arrows walk the months');
    await openIt(page);
    await page.locator('#monthSummaryPrev').click();
    same('one back is October, and the focus stays on the arrow', [await page.locator('#monthSummaryMonth').innerText(),
        await page.evaluate(() => document.activeElement.id), await page.locator('.msum-progress').count()],
        ['אוקטובר 2026', 'monthSummaryPrev', 0]);
    same('October\'s tiles: a raise mid-month, a double day, each against September',
        (await page.locator('.msum-tile').evaluateAll(nodes => nodes.map(node => [...node.children].map(child => child.textContent)))).map(row => row.map(plain)),
        [['ימי נוכחות', '26', '↑ 25 יותר מספטמבר'], ['ימי עבודה', '10', '↑ 9 יותר מספטמבר'],
            ['נצבר', '10520 ₪', '↑ 10120 ₪ יותר מספטמבר'], ['סה״כ עובדי רימא', '3', '↑ 3 יותר מספטמבר']]);
    await shot(page, '03-october-440-dark');
    await page.locator('#monthSummaryPrev').click();
    same('September has nothing before it and says so once',
        [await page.locator('#monthSummaryMonth').innerText(), await page.locator('.msum-delta').count(),
            await page.locator('.msum-compare').innerText()], ['ספטמבר 2026', 0, 'אין רישומים באוגוסט, ולכן אין השוואה.']);
    await page.locator('#monthSummaryPrev').click();
    same('August has no record: one sentence, no tile, no bar, and the arrows still there',
        [await page.locator('#monthSummaryMonth').innerText(), await page.locator('#monthSummaryBody .empty-hint').innerText(),
            await page.locator('.msum-tile, .msum-bar-row, .msum-block').count(),
            await page.locator('#monthSummaryPrev').isVisible(), await page.locator('#monthSummaryNext').isVisible()],
        ['אוגוסט 2026', 'אין רישומים בחודש הזה.', 0, true, true]);
    await shot(page, '04-empty-month-440-dark');
    for (let n = 0; n < 4; n += 1) await page.locator('#monthSummaryNext').click();
    same('four forward is December, which has none either', [await page.locator('#monthSummaryMonth').innerText(),
        await page.locator('#monthSummaryBody .empty-hint').count()], ['דצמבר 2026', 1]);
    await page.locator('#monthSummaryPrev').click();

    // ------------------------------------------------------------ the two doors
    suite('the text leaves by the day message\'s own two doors');
    await page.evaluate(() => {
        window.__out = [];
        Object.defineProperty(navigator, 'share', { configurable: true, value: data => { window.__out.push(['share', data.text]); return Promise.resolve(); } });
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: text => { window.__out.push(['copy', text]); return Promise.resolve(); } } });
    });
    const text = await page.evaluate(() => monthSummaryFacts('2026-11').text);
    await page.locator('#monthSummarySend').click();
    await page.waitForTimeout(60);
    same('the share sheet is handed the month\'s words', await page.evaluate(() => window.__out), [['share', text]]);
    check('and the summary stays open behind it', await isOpen(page));
    check('the field is folded away until asked for', !(await page.locator('#monthSummaryText').isVisible())
        && await page.locator('#monthSummaryFoldLabel').getAttribute('aria-expanded') === 'false');
    await page.locator('#monthSummaryCopy').click();
    await page.waitForTimeout(60);
    same('the copy is handed the same words, opens the field, and says what happened',
        [await page.evaluate(() => window.__out[1]), await page.locator('#monthSummaryText').isVisible(),
            await page.locator('#monthSummaryStatus').innerText(), await page.locator('#monthSummaryText').inputValue()],
        [['copy', text], true, '✔️ הועתק', text]);
    check('the words name the sites, the two counts and the money, and never say «נשלח»',
        ['אתר צפון', 'רישום לרימא', 'עובדי יוסף גבס', 'נצבר: 9095 ₪', 'הוחזר במזומן: 300 ₪'].every(part => plain(text).indexOf(part) !== -1)
        && text.indexOf('נשלח') === -1 && (await page.locator('#monthSummaryModal').innerText()).indexOf('נשלח') === -1);
    await shot(page, '05-november-text-and-doors-440-dark');

    // ------------------------------------------------------------ it wrote nothing
    suite('a reading: the disk is byte for byte what it was');
    await page.locator('#monthSummaryClose').click();
    same('every key', await disk(page), before);
    same('and the record in memory', await page.evaluate(() => JSON.stringify(State.schedule)), record);

    // A CHANGE ARRIVING UNDER IT MOVES ITS FIGURES. (This one writes, so it comes last.)
    await openIt(page);
    await page.evaluate(() => { document.querySelector('#monthSummaryModal .modal-content').scrollTop = 120; });
    await page.evaluate(() => State.commit(assignPlace(State.schedule, '2026-11-10', 'w_03', 'actual', 'p_01')));
    await page.waitForTimeout(80);
    same('a day recorded while it is open is on it at once, and the reader keeps his place',
        [await page.locator('.msum-tile[data-figure="attendance"] .msum-value').innerText(),
            await page.evaluate(() => document.querySelector('#monthSummaryModal .modal-content').scrollTop)], ['25', 120]);
    await page.context().close();

    // ------------------------------------------------------------ a phone with no share sheet
    {
        suite('where there is no share sheet, WhatsApp is opened with the words and nothing is called sent');
        const desk = await phone(440, 956, 'light', { noShare: true });
        await desk.evaluate(() => { window.__opened = []; window.open = (url, target) => { window.__opened.push([url, target]); return null; }; });
        await openIt(desk);
        const words = await desk.evaluate(() => monthSummaryFacts('2026-11').text);
        await desk.locator('#monthSummarySend').click();
        same('wa.me with no number, carrying the text', await desk.evaluate(() => window.__opened),
            [[`https://wa.me/?text=${encodeURIComponent(words)}`, '_blank']]);
        same('the line says it is opening WhatsApp', await desk.locator('#monthSummaryStatus').innerText(), 'פותח וואטסאפ…');
        check('and the summary is still on the screen', await isOpen(desk));
        await desk.context().close();
    }

    // ------------------------------------------------------------ the phones, and big text
    for (const [width, height, scheme, scale] of [[375, 667, 'dark', 1], [440, 956, 'dark', 1], [375, 667, 'light', 1],
        [440, 956, 'light', 1], [375, 667, 'dark', 2], [320, 568, 'light', 1]]) {
        const tag = `${width}x${height} ${scheme}${scale === 2 ? ' 200% text' : ''}`;
        suite(`rectangles - ${tag}`);
        const glass = await phone(width, height, scheme);
        await openIt(glass);
        await glass.locator('#monthSummaryFoldLabel').click();
        if (scale === 2) {
            await glass.evaluate(() => {
                const sizes = [...document.querySelectorAll('#monthSummaryModal *')]
                    .map(node => [node, parseFloat(getComputedStyle(node).fontSize)]);
                sizes.forEach(([node, size]) => node.style.setProperty('font-size', `${size * 2}px`, 'important'));
            });
        }
        const seen = await glass.evaluate(() => {
            const modal = document.getElementById('monthSummaryModal');
            const content = modal.querySelector('.modal-content');
            const visible = node => node.offsetParent !== null;
            const targets = [...modal.querySelectorAll('button')].filter(visible);
            const texts = [...modal.querySelectorAll('*')].filter(visible)
                .filter(node => [...node.childNodes].some(child => child.nodeType === 3 && child.textContent.trim() !== ''));
            const box = content.getBoundingClientRect();
            return {
                page: document.documentElement.scrollWidth <= innerWidth + 1,
                sideways: content.scrollWidth <= content.clientWidth + 1,
                inside: box.left >= 0 && box.right <= innerWidth + 1 && box.top >= 0 && box.bottom <= innerHeight + 1,
                small: targets.filter(node => { const at = node.getBoundingClientRect(); return at.width < 48 || at.height < 48; })
                    .map(node => node.id || node.textContent),
                targets: targets.length,
                tiny: texts.filter(node => parseFloat(getComputedStyle(node).fontSize) < 16)
                    .map(node => `${node.className || node.id}: ${getComputedStyle(node).fontSize}`),
                wide: [...modal.querySelectorAll('.msum-block *, .msum-tiles *, .msum-nav *')].filter(visible)
                    .filter(node => { const at = node.getBoundingClientRect(); return at.right > box.right + 1 || at.left < box.left - 1; })
                    .map(node => node.className),
                field: parseFloat(getComputedStyle(document.getElementById('monthSummaryText')).fontSize),
                figure: parseFloat(getComputedStyle(modal.querySelector('.msum-tile .msum-value')).fontSize),
                count: parseFloat(getComputedStyle(modal.querySelector('.msum-bar-count')).fontSize),
                scrolls: content.scrollHeight > content.clientHeight
            };
        });
        check(`${tag}: neither the page nor the dialog scrolls sideways`, seen.page && seen.sideways, JSON.stringify(seen));
        check(`${tag}: the dialog is wholly on the glass`, seen.inside, JSON.stringify(seen));
        check(`${tag}: nothing in it reaches past its edge`, seen.wide.length === 0, JSON.stringify(seen.wide));
        check(`${tag}: the two arrows, the fold and the three buttons are 48px both ways`,
            seen.small.length === 0 && seen.targets === 6, JSON.stringify([seen.small, seen.targets]));
        check(`${tag}: no word on it is under 16px, the field included`, seen.tiny.length === 0 && seen.field >= 16,
            JSON.stringify([seen.tiny, seen.field]));
        check(`${tag}: the key numbers are large`, seen.figure >= 28 * scale && seen.count >= 26 * scale, JSON.stringify([seen.figure, seen.count]));
        // The last button can be reached: scrolled to, it is inside the dialog's own box.
        const reach = await glass.evaluate(() => {
            const close = document.getElementById('monthSummaryClose');
            close.scrollIntoView({ block: 'end' });
            const at = close.getBoundingClientRect();
            return at.bottom <= innerHeight + 1 && at.top >= 0;
        });
        check(`${tag}: «סגור» can be scrolled to and is then on the glass`, reach);
        if (width === 440 && scheme === 'dark') {
            await glass.evaluate(() => { document.querySelector('#monthSummaryModal .modal-content').scrollTop = 0; monthSummaryShowText(false); });
            await shot(glass, '06-november-440-dark');
            for (const [name, top] of [['07-november-middle-440-dark', 780], ['07b-november-end-440-dark', 99999]]) {
                await glass.evaluate(at => { document.querySelector('#monthSummaryModal .modal-content').scrollTop = at; }, top);
                await shot(glass, name);
            }
        }
        if (width === 375 && scale === 1 && scheme === 'dark') {
            await glass.evaluate(() => { document.querySelector('#monthSummaryModal .modal-content').scrollTop = 0; monthSummaryShowText(false); });
            await shot(glass, '08-november-375-dark');
        }
        if (scale === 2) {
            await glass.evaluate(() => { document.querySelector('#monthSummaryModal .modal-content').scrollTop = 0; });
            await shot(glass, '09-november-375-dark-doubled-text');
        }
        if (width === 440 && scheme === 'light') {
            await glass.evaluate(() => { document.querySelector('#monthSummaryModal .modal-content').scrollTop = 0; monthSummaryShowText(false); });
            await shot(glass, '10-november-440-light');
        }
        await glass.context().close();
    }

    suite('the browser');
    check('no uncaught browser errors', errors.length === 0, JSON.stringify(errors));
} finally {
    await browser.close();
    await server.close();
}

report();
