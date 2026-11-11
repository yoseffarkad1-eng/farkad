// The reports say the account - on the glass.
//
//   node tests/reportsclarity.browser.mjs
//
// tests/reportsclarity.test.mjs holds every figure of a card to the table cell it is read
// from, on devices in Node. What it cannot hold is what the owner asked for in his own
// words (2026-11-11): that the page is CLEAR, and that the extra hours SHOW. So this
// measures, in a real Chromium, on a 375x667 phone and a 440x956 one, light and dark, and
// with every font doubled:
//
//   - a man's extra hours are on his card, in words and in number, WITHOUT A TAP;
//   - the card reads top to bottom - what he did, what it is worth, what comes off, what is
//     left - and the amount to pay is the largest thing on it;
//   - nothing on a card is under 16px, its counts are 20px and more, and every text on it
//     stands at 7:1 or better against what is behind it;
//   - each card's figures are the detailed table's cells (toggled on the same page);
//   - the group's band on a phone carries the hours, what was earned and what came off;
//   - the days dialog says a day's hours in words, explains its star, and ends in the
//     card's own summary - the same text, because it is the same box;
//   - «לפי אתר»: the counts large, the three lists apart;
//   - the paper and the picture do not carry the cards, and do carry «שעות נוספות» as a
//     headed column with its total;
//   - nothing scrolls sideways, every target is 44px, and the phone's disk is byte for byte
//     what it was.
//
// NOT a real phone: emulated touch and Chromium's layout. Synthetic names throughout.

import { chromium } from 'playwright';
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
const TODAY = '2026-11-11';
const FORT = { from: '2026-10-30', to: '2026-11-12' };

function seed(today, span) {
    todayStr = () => today;
    State.schedule.workers = [
        { id: 'w_a', name: 'דוגמה אלף', active: true, dailyRate: 450, hourlyRate: 60 },
        { id: 'w_c', name: 'דוגמה גימל', active: true },
        { id: 'w_d', name: 'דוגמה דלת', active: true, dailyRate: 500 },
        { id: 'w_e', name: 'דוגמה הא עם שם ארוך במיוחד לבדיקת הרוחב', active: true, dailyRate: 987654.32, hourlyRate: 55 },
        { id: 'w_f', name: 'דוגמה וו', active: true, dailyRate: 380 }];
    State.schedule.places = [
        { id: 'p_1', name: 'אתר צפון', active: true },
        { id: 'p_2', name: 'אתר דרום', active: true }];
    State.commitRoster();
    const put = (date, id, place, rate, hours) =>
        State.commit(assignPlace(State.schedule, date, id, 'actual', place, rate, hours));
    ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-08'].forEach((date, at) => {
        put(date, 'w_a', at % 2 ? 'p_2' : 'p_1', at === 2 ? 'double' : undefined);
        if (at < 3) put(date, 'w_f', 'p_1');
        if (at < 2) put(date, 'w_e', 'p_2');
    });
    put('2026-11-09', 'w_a', 'p_1', 'extra', 2);
    put('2026-11-10', 'w_a', 'p_2', 'extra', 4.5);
    State.commit(markAbsent(State.schedule, '2026-11-06', 'w_a', 'actual'));
    put('2026-11-03', 'w_c', 'p_1');
    put('2026-11-03', 'w_d', 'p_2'); put('2026-11-04', 'w_d', 'p_2', 'extra', 3);
    put('2026-11-09', 'w_e', 'p_1', 'extra', 1.5);
    State.commitMany(recordNewAdvance(State.schedule, 'w_a', '2026-11-02', 1500, '',
        '2026-11-02T08:00:00Z', 'd_test', 'cash'));
    State.commit(setRimaCount(State.schedule, '2026-11-02', 'p_1', 3));
    State.commit(setYosefGevesCount(State.schedule, '2026-11-04', 'p_2', 1));
    const plan = planCarryMigration(State.schedule);
    if (plan.needed) State.commit(recordCarryApproval(State.schedule, plan, '2026-10-29T09:00:00.000Z', 'd_test'));
    REPORT_RANGE.from = span.from; REPORT_RANGE.to = span.to; REPORT_PRESET = 'custom';
    REPORT_WORKERS = null; REPORT_SECTION = 'workers'; REPORT_CARD_GRID = true; REPORT_RANGE_OPEN = false;
    showView('reports');
}

async function phone(width, height, scheme) {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2,
        isMobile: true, hasTouch: true, colorScheme: scheme, serviceWorkers: 'block' });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.clock.setFixedTime(`${TODAY}T10:00:00`);
    await page.goto(server.url);
    await page.waitForFunction(() => typeof renderReports === 'function' && typeof State === 'object');
    await page.evaluate(`(${seed})(${JSON.stringify(TODAY)}, ${JSON.stringify(FORT)})`);
    await page.waitForTimeout(250);
    return page;
}

const disk = page => page.evaluate(() => JSON.stringify(Object.keys(localStorage).sort()
    .map(key => [key, localStorage.getItem(key)])));

// Every visible text node under `selector`: its size and its contrast against the first
// opaque background behind it.
const readText = (page, selector) => page.evaluate(sel => {
    const lum = colour => {
        const m = colour.match(/[\d.]+/g).map(Number);
        const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
        return { l: 0.2126 * f(m[0]) + 0.7152 * f(m[1]) + 0.0722 * f(m[2]), a: m[3] === undefined ? 1 : m[3] };
    };
    const behind = node => {
        for (let at = node; at; at = at.parentElement) {
            const colour = getComputedStyle(at).backgroundColor;
            if (lum(colour).a > 0.95) return colour;
        }
        return getComputedStyle(document.body).backgroundColor;
    };
    const out = [];
    document.querySelectorAll(sel).forEach(rootNode => {
        [rootNode, ...rootNode.querySelectorAll('*')].forEach(node => {
            const text = [...node.childNodes].filter(kid => kid.nodeType === 3)
                .map(kid => kid.textContent.trim()).join('');
            if (!text) return;
            const box = node.getBoundingClientRect();
            if (!box.width || !box.height) return;
            const style = getComputedStyle(node);
            const a = lum(style.color).l; const b = lum(behind(node)).l;
            out.push({ cls: String(node.className), text: text.slice(0, 24), size: parseFloat(style.fontSize),
                ratio: Math.round(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)) * 100) / 100 });
        });
    });
    return out;
}, selector);

const doubleFonts = page => page.evaluate(() => {
    const sizes = [...document.querySelectorAll('#reportsView *, #workerDaysModal *')]
        .map(node => [node, parseFloat(getComputedStyle(node).fontSize)]);
    sizes.forEach(([node, size]) => node.style.setProperty('font-size', `${size * 2}px`, 'important'));
});

const cardFacts = page => page.evaluate(() => [...document.querySelectorAll('.report-worker-tile')].map(tile => {
    const metric = kind => {
        const node = tile.querySelector('.report-tile-metric-' + kind);
        return node ? node.querySelector('strong').textContent : null;
    };
    return { id: tile.getAttribute('data-report-worker-id'),
        work: metric('work'), double: metric('double'), hours: metric('hours'), off: metric('off'),
        lines: [...tile.querySelectorAll('.report-tile-line')].map(line => [
            line.querySelector('.report-tile-line-label').textContent,
            line.querySelector('.report-tile-line-number').textContent]),
        payable: tile.querySelector('.report-tile-value').textContent };
}));

try {
    for (const [width, height, scheme] of [[375, 667, 'dark'], [375, 667, 'light'], [440, 956, 'dark'], [440, 956, 'light']]) {
        const label = `${width}x${height} ${scheme}`;
        const page = await phone(width, height, scheme);
        given(`${label}: the seeded page drew its cards`, await page.locator('.report-worker-tile').count() === 5);
        const before = await disk(page);
        const record = await page.evaluate(() => JSON.stringify(State.schedule));

        suite(`${label}: the extra hours are on the card, without a tap`);
        const hours = page.locator('[data-report-worker-id="w_a"] .report-tile-metric-hours');
        check('they are drawn', await hours.isVisible());
        same('in number and in words', await hours.evaluate(node => [node.querySelector('strong').textContent,
            node.querySelector('.report-tile-label').textContent]), ['6.5', 'שעות נוספות']);
        const look = await hours.evaluate(node => ({ number: parseFloat(getComputedStyle(node.querySelector('strong')).fontSize),
            word: parseFloat(getComputedStyle(node.querySelector('.report-tile-label')).fontSize),
            marked: getComputedStyle(node).boxShadow !== 'none',
            plain: getComputedStyle(node.parentElement.querySelector('.report-tile-metric-work')).boxShadow === 'none' }));
        check('the number at 20px or more, the word at 16px or more', look.number >= 20 && look.word >= 16, JSON.stringify(look));
        check('and set apart from the other counts', look.marked && look.plain, JSON.stringify(look));
        same('the man with none, in a group that has some, reads a quiet 0 and is not marked',
            await page.locator('[data-report-worker-id="w_f"] .report-tile-metric-hours').evaluate(node =>
                [node.querySelector('strong').textContent, node.classList.contains('report-tile-zero'),
                    getComputedStyle(node).boxShadow]), ['0', true, 'none']);
        same('hours with no hourly rate: the star and its sentence are on that card',
            await page.locator('[data-report-worker-id="w_d"]').evaluate(tile => [
                tile.querySelector('.report-tile-value').textContent,
                [...tile.querySelectorAll('.report-tile-warn')].map(node => node.textContent)]),
            ['1000 *', ['* שעות נוספות בלי שכר שעה - לא נכללו בסכום.']]);
        same('no daily rate: unknown, and why, on that card',
            await page.locator('[data-report-worker-id="w_c"]').evaluate(tile => [
                tile.querySelector('.report-tile-value').textContent,
                [...tile.querySelectorAll('.report-tile-warn')].map(node => node.textContent)]),
            ['—', ['בלי שכר יומי - הנצבר לא חושב']]);

        suite(`${label}: the card reads top to bottom, and the amount to pay is the largest thing on it`);
        const shape = await page.locator('[data-report-worker-id="w_a"]').evaluate(tile => {
            const top = sel => Math.round(tile.querySelector(sel).getBoundingClientRect().top);
            const sizes = [...tile.querySelectorAll('*')].filter(node => [...node.childNodes].some(kid =>
                kid.nodeType === 3 && kid.textContent.trim())).map(node => parseFloat(getComputedStyle(node).fontSize));
            return { tops: ['.report-tile-name', '.report-tile-metrics', '.report-tile-lines', '.report-tile-notes',
                '.report-tile-amount', '.report-tile-open'].map(top),
            largest: Math.max(...sizes), payable: parseFloat(getComputedStyle(tile.querySelector('.report-tile-value')).fontSize),
            lineLabels: [...tile.querySelectorAll('.report-tile-line-label')].map(node => node.textContent),
            fits: tile.scrollWidth <= tile.clientWidth + 1, height: Math.round(tile.getBoundingClientRect().height),
            width: Math.round(tile.getBoundingClientRect().width) };
        });
        check('who, what he did, worth and off, his notes, what is left, the way in',
            shape.tops.every((top, at) => at === 0 || top > shape.tops[at - 1]), JSON.stringify(shape.tops));
        same('the money lines: the daily rate, what was earned, what came off', shape.lineLabels, ['שכר יומי', 'נצבר', 'נוכה מהשכר']);
        check('the payable is the largest type on the card, alone', shape.payable === shape.largest && shape.payable >= 30,
            JSON.stringify(shape));
        check('the card is the whole width and holds its text', shape.fits && shape.width >= width - 40
            && shape.height >= 44, JSON.stringify(shape));
        const words = await readText(page, '.report-worker-tile');
        given('there is text to read', words.length > 40, String(words.length));
        same('nothing on any card is under 16px', words.filter(word => word.size < 16), []);
        same('every count is 20px or more', (await page.evaluate(() => [...document.querySelectorAll(
            '.report-tile-metric strong, .report-tile-line-number, .report-tile-value')]
            .map(node => parseFloat(getComputedStyle(node).fontSize)))).filter(size => size < 20), []);
        same('every text on a card stands at 7:1 or better', words.filter(word => word.ratio < 7), []);
        same('digits are tabular', await page.evaluate(() => [...new Set([...document.querySelectorAll(
            '.report-tile-metric strong, .report-tile-line-value, .report-tile-value')]
            .map(node => getComputedStyle(node).fontVariantNumeric))]), ['tabular-nums']);
        check('nothing scrolls sideways', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));

        suite(`${label}: the band of the group carries the hours and the working`);
        const band = await page.evaluate(() => [...document.querySelectorAll('.report-payroll-group tfoot td')]
            .filter(cell => cell.getBoundingClientRect().height > 0)
            .map(cell => [cell.getAttribute('data-label'), cell.textContent.replace(/[‎]/g, ''),
                parseFloat(getComputedStyle(cell).fontSize)]));
        same('its cells, in order', band.map(cell => cell.slice(0, 2)), [['עובד', 'סה״כ לתשלום · 4 עובדים'],
            ['שעות נוספות', '11'], ['נצבר', '2969625.46'], ['נוכה מהשכר', '-1500'], ['לתשלום', '2968125.46']]);
        check('each at 16px or more, the payable the largest', band.every(cell => cell[2] >= 16)
            && band[4][2] === Math.max(...band.map(cell => cell[2])), JSON.stringify(band));
        same('7:1 or better', (await readText(page, '.report-payroll-group tfoot')).filter(word => word.ratio < 7), []);

        suite(`${label}: each card's figures are the detailed table's cells`);
        const cards = await cardFacts(page);
        await page.locator('.report-layout-toggle').click();
        const table = await page.evaluate(() => [...document.querySelectorAll('.report-payroll tbody tr')].map(tr => {
            const cell = name => { const td = tr.querySelector(`td[data-label="${name}"]`); return td ? td.textContent : null; };
            return { work: cell('ימי שכר') || '0', double: cell('כפולים') || '0', hours: cell('שעות נוספות') || '0',
                off: cell('נעדר') || '0', lines: [['שכר יומי', cell('שכר יומי') || '—'], ['נצבר', cell('נצבר') || '0'],
                    ['נוכה מהשכר', cell('נוכה מהשכר') || '0']], payable: tr.querySelector('.cell-net').textContent };
        }));
        check('the detailed rows are on screen now and the cards are not',
            await page.locator('.report-payroll tbody tr').first().isVisible()
            && !(await page.locator('.report-worker-tile').first().isVisible()));
        same('man for man, figure for figure', cards.map(card => { const copy = Object.assign({}, card); delete copy.id; return copy; }), table);
        const cell = await page.locator('.report-payroll tbody tr').first().locator('td[data-label="שעות נוספות"]')
            .evaluate(node => ({ text: node.textContent, size: parseFloat(getComputedStyle(node).fontSize),
                weight: Number(getComputedStyle(node).fontWeight), marked: getComputedStyle(node).boxShadow !== 'none',
                label: getComputedStyle(node, '::before').content }));
        check('in the detailed view the hours are a figure too: 18px, heavy, marked, named',
            cell.text === '6.5' && cell.size >= 18 && cell.weight >= 700 && cell.marked && cell.label.includes('שעות נוספות'),
            JSON.stringify(cell));
        check('and the detailed view does not scroll sideways', await page.evaluate(() =>
            document.documentElement.scrollWidth <= innerWidth + 1
            && [...document.querySelectorAll('#reportsView .table-scroll')].every(box => box.scrollWidth <= box.clientWidth + 1)));
        await page.locator('.report-layout-toggle').click();

        suite(`${label}: the days of one man - hours in words, the star explained, the card's own summary`);
        const factsText = await page.locator('[data-report-worker-id="w_a"] .report-tile-facts').evaluate(node => node.textContent);
        await page.locator('[data-report-worker-id="w_a"]').click();
        check('the card opens his days', await page.locator('#workerDaysModal').isVisible());
        const tags = await page.locator('#workerDaysBody .wday-extra').evaluateAll(nodes => nodes.map(node => ({
            text: node.textContent, size: parseFloat(getComputedStyle(node).fontSize),
            after: node.previousElementSibling && node.previousElementSibling.className })));
        same('two days with hours, each said in words', tags.map(tag => tag.text), ['2 שעות נוספות', '4.5 שעות נוספות']);
        check('at 16px or more, beside the site', tags.every(tag => tag.size >= 16 && /tag-place/.test(tag.after)), JSON.stringify(tags));
        check('no bare plus is left in the days', !(await page.locator('#workerDaysBody').innerText()).replace(/[‎]/g, '').includes('+2'));
        const summary = page.locator('#workerDaysBody .wday-summary');
        same('the days end in one summary, under the band\'s own heading',
            [await summary.count(), await summary.locator('.wday-summary-head').textContent()], [1, 'סיכום התקופה']);
        same('and it is the card\'s own text, whole', await summary.locator('.report-tile-facts').evaluate(node => node.textContent), factsText);
        check('it stands after the days and the advances, before the closing block and the history',
            await page.evaluate(() => {
                const top = sel => { const node = document.querySelector('#workerDaysBody ' + sel); return node ? node.getBoundingClientRect().top : null; };
                const at = top('.wday-summary');
                return at > top('.wday-total') && at > top('.wday-net') && (top('.wday-ledger') === null || at < top('.wday-ledger'))
                    && at < top('.wday-actions');
            }));
        const dialogWords = await readText(page, '#workerDaysBody .wday, #workerDaysBody .wday-summary, #workerDaysBody .wday-chips');
        same('no line of the days or of the summary is under 16px', dialogWords.filter(word => word.size < 16), []);
        same('the summary and the hours stand at 7:1', (await readText(page, '#workerDaysBody .wday-summary, #workerDaysBody .wday-extra'))
            .filter(word => word.ratio < 7), []);
        check('the dialog does not scroll sideways', await page.locator('#workerDaysModal .modal-content')
            .evaluate(node => node.scrollWidth <= node.clientWidth + 1));
        await page.evaluate(() => { closeWorkerDays(); openWorkerDays('w_d'); });
        same('hours with no hourly rate: the star\'s sentence is in the dialog, once',
            await page.locator('#workerDaysBody .wday-unpriced').allTextContents(), ['* שעות נוספות בלי שכר שעה - לא נכללו בסכום.']);
        await page.evaluate(() => closeWorkerDays());

        suite(`${label}: «לפי אתר» - the counts large, the three lists apart`);
        await page.getByRole('button', { name: 'לפי אתר', exact: true }).click();
        const sites = await page.evaluate(() => ({
            counts: [...document.querySelectorAll('.invoice-bar-count')].map(node => [node.textContent, parseFloat(getComputedStyle(node).fontSize)]),
            total: [document.querySelector('.invoice-bars-total strong').textContent,
                parseFloat(getComputedStyle(document.querySelector('.invoice-bars-total strong')).fontSize)],
            heads: [...document.querySelectorAll('.report-invoice .report-group')].map(node => node.textContent),
            ruled: ['.report-norima', '.report-rima', '.report-yosefgeves'].map(sel =>
                parseFloat(getComputedStyle(document.querySelector(sel)).borderTopWidth)),
            notes: ['.report-rima-note', '.report-yosefgeves-note'].map(sel => [document.querySelector(sel).textContent,
                parseFloat(getComputedStyle(document.querySelector(sel)).fontSize)]),
            across: document.documentElement.scrollWidth <= innerWidth + 1 }));
        check('each site\'s worker-site days at 20px or more, the total the largest',
            sites.counts.length === 2 && sites.counts.every(count => count[1] >= 20) && sites.total[1] > sites.counts[0][1],
            JSON.stringify(sites));
        same('the total is the sites\' sum', Number(sites.total[0]), sites.counts.reduce((sum, count) => sum + Number(count[0]), 0));
        same('the three lists under their own names, in their order', sites.heads, ['בלי עובדי רימא', 'רישום לרימא', 'עובדי יוסף גבס']);
        check('each ruled off from what is above it', sites.ruled.every(rule => rule >= 2), JSON.stringify(sites.ruled));
        same('their notes word for word, at 16px', sites.notes, [
            ['עובדי רימא בלבד. אינם נכללים בשכר. בחיוב שלמעלה כל אחד מהם נספר כיום עובד־אתר אחד.', 16],
            ['עובדי יוסף גבס בלבד. אינם נכללים בשכר ואינם נכללים בחיוב.', 16]]);
        same('nothing under «לפי אתר» is under 16px but the top controls', (await readText(page, '.report-invoice'))
            .filter(word => word.size < 16), []);
        check('nothing scrolls sideways', sites.across);
        await page.getByRole('button', { name: 'לפי עובד', exact: true }).click();

        suite(`${label}: a finger, and a reading`);
        same('every button, input and fold of the page is 44px both ways',
            await page.evaluate(() => [...document.querySelectorAll('#reportsView button, #reportsView input, #reportsView summary')]
                .filter(node => node.offsetParent !== null).filter(node => { const box = node.getBoundingClientRect(); return box.width < 44 || box.height < 44; })
                .map(node => node.textContent.slice(0, 20))), []);
        same('the record is what it was', await page.evaluate(() => JSON.stringify(State.schedule)), record);
        same('and so is the phone\'s disk, byte for byte', await disk(page), before);

        if (scheme === 'dark') {
            suite(`${label}: with every font doubled`);
            await doubleFonts(page);
            const big = await page.evaluate(() => ({ across: document.documentElement.scrollWidth <= innerWidth + 1,
                cards: [...document.querySelectorAll('.report-worker-tile')].map(tile => tile.scrollWidth <= tile.clientWidth + 1),
                spill: [...document.querySelectorAll('.report-tile-metric, .report-tile-line, .report-tile-amount, .report-tile-note')]
                    .filter(node => node.scrollWidth > node.clientWidth + 1).map(node => node.textContent.slice(0, 30)),
                hours: document.querySelector('[data-report-worker-id="w_a"] .report-tile-metric-hours').getBoundingClientRect().width > 0 }));
            check('the page does not scroll sideways', big.across, JSON.stringify(big));
            check('every card still holds its text', big.cards.every(Boolean) && big.spill.length === 0, JSON.stringify(big));
            check('and the hours are still on it', big.hours);
            await page.locator('[data-report-worker-id="w_a"]').click();
            await doubleFonts(page);
            check('the days dialog does not scroll sideways either', await page.locator('#workerDaysModal .modal-content')
                .evaluate(node => node.scrollWidth <= node.clientWidth + 1));
            await page.evaluate(() => closeWorkerDays());
        }
        await page.context().close();
    }

    suite('the paper and the picture: no card, and «שעות נוספות» a headed column with its total');
    {
        const page = await phone(440, 956, 'light');
        const picture = await page.evaluate(() => JSON.parse(JSON.stringify(readReportPrintout())));
        same('the picture\'s one group: its headings', picture.groups.map(group => group.headers),
            [['עובד', 'נוכחות', 'ימי שכר', 'כפולים', 'שעות נוספות', 'נעדר', 'שכר יומי', 'נצבר', 'נוכה מהשכר', 'לתשלום']]);
        same('its first man and its totals', [picture.groups[0].rows[0].map(text => text.replace(/[‎]/g, '')),
            picture.groups[0].totals[0].map(text => text.replace(/[‎]/g, ''))],
        [['דוגמה אלף', '8', '9', '1', '6.5', '1', '450', '4440', '-1500', '2940'],
            ['סה״כ לתשלום · 4 עובדים', '17', '18', '1', '11', '1', '', '2969625.46', '-1500', '2968125.46']]);
        check('no word of a card is in the picture', JSON.stringify(picture).indexOf('ימי עבודה') === -1
            && JSON.stringify(picture).indexOf('חופש') === -1);
        await page.emulateMedia({ media: 'print' });
        const paper = await page.evaluate(() => ({
            cards: [...document.querySelectorAll('.report-worker-tile')].filter(node => node.getBoundingClientRect().height > 0).length,
            heads: [...document.querySelectorAll('.report-payroll thead th')].map(node => node.textContent),
            hours: [...document.querySelectorAll('.report-payroll td[data-label="שעות נוספות"]')].map(node => node.textContent),
            headVisible: document.querySelector('.report-payroll thead').getBoundingClientRect().height > 0 }));
        same('on paper: no card', paper.cards, 0);
        check('the table with its headings', paper.headVisible && paper.heads.indexOf('שעות נוספות') === 4, JSON.stringify(paper.heads));
        same('the hours column, man by man, and its total', paper.hours, ['6.5', '', '3', '1.5', '', '11']);
        await page.context().close();
    }

    check('no uncaught browser errors', errors.length === 0, JSON.stringify(errors));
} finally { await browser.close(); await server.close(); }
report();
