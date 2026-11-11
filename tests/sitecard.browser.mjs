// כרטיס אתר in a real Chromium.
//
//   node tests/sitecard.browser.mjs
//
// tests/sitecard.test.mjs holds every count against the reports on devices in Node. What
// it cannot hold is the glass: that the way in is one worded button on each site's row of
// the crew screen - hidden sites too - and the row is no taller for it, with «עוד ⋯» on
// the pixels it was on; that the card opens as one of the app's dialogs - entered at its
// heading, shut by Escape and by the backdrop, the focus given back to the row's button,
// Tab kept inside it; that the site wears the colour it wears on the crew list; that a day
// goes to the day screen and a man to his own card, whose closing gives the focus back to
// the site's row; that the client's text is on the screen before it can leave, leaves by
// the share sheet, by wa.me and by the clipboard, and is never called sent; that it fits
// a 375x667 phone and a 440x956 one, dark and light, and at doubled text, with no sideways
// scroll, every target 48px both ways and no word under 16px; and that the phone's disk
// is byte for byte what it was. NOT a real phone: emulated touch and Chromium's layout.
//
// SITECARD_SHOTS=<folder> also saves pictures of it there (they assert nothing).

import { chromium } from 'playwright';
import { join } from 'node:path';
import { serve } from './serve.mjs';
import { launchLocalBrowser } from './network-guard.mjs';
import { verifyServedAssets, expectedShaFor } from './treecheck.mjs';
import { suite, check, same, report } from './runner.mjs';

const root = new URL('..', import.meta.url).pathname;
const server = await serve(root);
check('the browser is served the named tree',
    (await verifyServedAssets(server.url, root, expectedShaFor(root))).ok);
const browser = await launchLocalBrowser(chromium, { executablePath: process.env.CHROME_PATH });
const errors = [];
const SHOTS = process.env.SITECARD_SHOTS || '';

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
    await page.waitForFunction(() => typeof openSiteCard === 'function' && typeof State === 'object');
    // Synthetic names throughout. Two sites in use and a third, hidden, with a long name;
    // October one week; November in progress with both counts, a Saturday, a man on two
    // sites in a day, a day billed for Rima alone and one that holds only יוסף גבס.
    await page.evaluate(today => {
        todayStr = () => today;
        State.schedule.workers = [
            { id: 'w_01', name: 'דוגמה אלף', active: true, dailyRate: 400, phone: '0501234567' },
            { id: 'w_02', name: 'דוגמה בית', active: true, dailyRate: 300 },
            { id: 'w_03', name: 'דוגמה גימל עם שם ארוך במיוחד לבדיקה', active: true },
            { id: 'w_04', name: 'דוגמה דלת', active: false, dailyRate: 380 }];
        State.schedule.places = [
            { id: 'p_01', name: 'אתר צפון', active: true },
            { id: 'p_02', name: 'אתר דרום', active: true },
            { id: 'p_03', name: 'מגדל המרכז עם שם ארוך מאוד לבדיקת שבירה', active: false }];
        State.commitRoster();
        const put = (date, worker, place, rate) => State.commit(assignPlace(State.schedule, date, worker, 'actual', place, rate));
        ['2026-10-25', '2026-10-26', '2026-10-27'].forEach(date => { put(date, 'w_01', 'p_01'); put(date, 'w_04', 'p_03'); });
        ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07',
            '2026-11-08', '2026-11-09', '2026-11-10'].forEach((date, at) => {
            put(date, 'w_01', 'p_01');
            if (at % 2 === 0) put(date, 'w_04', 'p_01');
            if (at < 4) put(date, 'w_03', 'p_01');
            put(date, 'w_02', 'p_02');
        });
        put('2026-11-03', 'w_02', 'p_01');
        put('2026-11-04', 'w_01', 'p_03', 'double');
        State.commit(setRimaCount(State.schedule, '2026-11-03', 'p_01', 2));
        State.commit(setRimaCount(State.schedule, '2026-11-11', 'p_01', 12));
        State.commit(setYosefGevesCount(State.schedule, '2026-11-03', 'p_01', 3));
        State.commit(setYosefGevesCount(State.schedule, '2026-11-12', 'p_01', 1));
        showView('roster');
    }, TODAY);
    await page.waitForTimeout(250);
    return page;
}

const disk = page => page.evaluate(() => JSON.stringify(Object.keys(localStorage).sort()
    .map(key => [key, localStorage.getItem(key)])));
const isOpen = page => page.evaluate(() => document.getElementById('siteCardModal').style.display === 'flex');
const manOpen = page => page.evaluate(() => document.getElementById('workerCardModal').style.display === 'flex');
const entryOf = (page, id) => page.locator('#placeList .roster-row').nth(['p_01', 'p_02', 'p_03'].indexOf(id)).locator('.site-card-open');
const openIt = async (page, id = 'p_01') => {
    await entryOf(page, id).click();
    await page.waitForTimeout(80);
};
const shot = async (page, name, target) => {
    if (!SHOTS) return;
    const file = join(SHOTS, `${name}.jpg`);
    if (target) await page.locator(target).screenshot({ path: file, type: 'jpeg', quality: 80 });
    else await page.screenshot({ path: file, type: 'jpeg', quality: 80 });
};
const scrollCard = (page, top) => page.evaluate(at => { document.querySelector('#siteCardModal .modal-content').scrollTop = at; }, top);

try {
    // ------------------------------------------------------------ the way in
    for (const [width, height] of [[440, 956], [375, 667]]) {
        suite(`one worded button on each site's row, and the row no taller for it - ${width}x${height}`);
        const page = await phone(width, height, 'dark');
        const rows = () => page.evaluate(() => [...document.querySelectorAll('#placeList .roster-row')].map(row => {
            const box = row.getBoundingClientRect();
            const more = row.querySelector('.crew-edit').getBoundingClientRect();
            const tag = row.querySelector('.tag').getBoundingClientRect();
            return { height: Math.round(box.height), more: [Math.round(more.left), Math.round(more.top - box.top), Math.round(more.width), Math.round(more.height)],
                tagRight: Math.round(tag.right), tagTop: Math.round(tag.top - box.top) };
        }));
        const withIt = await rows();
        same('every site has the one button, the hidden site too',
            await page.locator('#placeList .roster-row').evaluateAll(nodes => nodes.map(row =>
                [...row.querySelectorAll('.site-card-open')].map(node => [node.textContent, node.getAttribute('aria-haspopup')]))),
            [[['כרטיס אתר', 'dialog']], [['כרטיס אתר', 'dialog']], [['כרטיס אתר', 'dialog']]]);
        same('named for the site it opens', (await page.locator('#placeList .site-card-open').evaluateAll(nodes =>
            nodes.map(node => node.getAttribute('aria-label')))).map(plain),
        ['כרטיס אתר של אתר צפון', 'כרטיס אתר של אתר דרום', 'כרטיס אתר של מגדל המרכז עם שם ארוך מאוד לבדיקת שבירה']);
        const boxes = await page.locator('#placeList .site-card-open').evaluateAll(nodes => nodes.map(node => {
            const box = node.getBoundingClientRect();
            return [box.width, box.height, box.left >= 0 && box.right <= innerWidth, parseFloat(getComputedStyle(node).fontSize),
                node.scrollHeight <= node.clientHeight + 1];
        }));
        check('each is 44px both ways, on the glass, 16px, on one line',
            boxes.every(box => box[0] >= 44 && box[1] >= 44 && box[2] && box[3] >= 16 && box[4]) && boxes[0][1] < 46, JSON.stringify(boxes));
        await shot(page, `01-site-rows-${width}-dark`, '#placeList');
        // The same list on a build without the file: the guard in roster.js is typeof.
        await page.evaluate(() => { window.__open = openSiteCard; openSiteCard = undefined; render(); });
        same('a build without the file has the sites list with no such button', await page.locator('#placeList .site-card-open').count(), 0);
        const without = await rows();
        await page.evaluate(() => { openSiteCard = window.__open; render(); });
        same('an ordinary site\'s row is exactly as tall as it was', withIt.slice(0, 2).map(row => row.height), without.slice(0, 2).map(row => row.height));
        same('«עוד ⋯» is on the pixels it was on, on every row', withIt.map(row => row.more), without.map(row => row.more));
        same('and the site\'s name starts where it started', withIt.map(row => [row.tagRight, row.tagTop]), without.map(row => [row.tagRight, row.tagTop]));
        check('the long hidden name still wraps inside its row, which grows by less than one line of it',
            withIt[2].height - without[2].height <= 30, JSON.stringify([withIt[2].height, without[2].height]));
        same('the worker rows above were not touched: each still has its own card button and nothing of this',
            await page.locator('#workerList .roster-row').evaluateAll(nodes => nodes.map(row =>
                [row.querySelectorAll('.worker-card-open').length, row.querySelectorAll('.site-card-open').length])),
            [[1, 0], [1, 0], [1, 0], [1, 0]]);
        await page.context().close();
    }

    const page = await phone(440, 956, 'dark');
    const before = await disk(page);
    const record = await page.evaluate(() => JSON.stringify(State.schedule));

    // ------------------------------------------------------------ the dialog
    suite('it opens as one of the app\'s dialogs');
    const reportsBefore = await page.evaluate(() => JSON.stringify([REPORT_RANGE, REPORT_WORKERS, INVOICE_PLACE, REPORT_SECTION]));
    await openIt(page);
    check('the row\'s button opens it', await isOpen(page));
    same('it is entered at its heading', await page.evaluate(() => document.activeElement.id), 'siteCardTitle');
    same('on the month today is in, for the site of that row', [await page.locator('#siteCardTitle').innerText(),
        await page.locator('#siteCardWho .site-name').innerText(), await page.locator('#siteCardWho .scard-status').innerText(),
        await page.locator('#siteCardMonth').innerText()], ['כרטיס אתר', 'אתר צפון', 'פעיל', 'נובמבר 2026']);
    same('the site wears the colour it wears on the crew list', await page.evaluate(() =>
        getComputedStyle(document.querySelector('#siteCardWho .scard-name')).backgroundColor),
    await page.evaluate(() => getComputedStyle(document.querySelector('#placeList .roster-row .tag')).backgroundColor));
    same('the reports screen\'s range, filter and choice of site were not touched by opening it',
        await page.evaluate(() => JSON.stringify([REPORT_RANGE, REPORT_WORKERS, INVOICE_PLACE, REPORT_SECTION])), reportsBefore);
    await shot(page, '02-card-top-440-dark');

    const facts = await page.evaluate(() => siteCardFacts('p_01', '2026-11'));
    same('the numbers on the glass are the facts\'', await page.locator('#siteCardBody .scard-pair').evaluateAll(nodes =>
        nodes.map(node => [node.dataset.figure, node.children[0].textContent, node.children[1].textContent])),
    facts.numbers.map(line => [line.id, line.label, line.value]));
    same('and they are what this record holds', facts.numbers.map(line => [line.id, line.value]), [
        // November on אתר צפון, by hand: אלף 10 days, דלת 5 (every other day), גימל 4, בית 1 -
        // 20 of his men's days on 10 dates; Rima 2 + 12 = 14; so 34 billed. יוסף גבס 3 + 1.
        ['siteDays', '34'], ['own', '20'], ['rima', '14'], ['workingDays', '10'], ['average', '2'], ['yosef', '4']]);
    // THE SAME NUMBERS ON THE REPORTS SCREEN, with its range on the month and this site
    // chosen for the client - read off the DOM it draws, then put back.
    const sheet = await page.evaluate(() => {
        const held = [REPORT_RANGE.from, REPORT_RANGE.to, REPORT_SECTION, INVOICE_PLACE];
        REPORT_RANGE.from = '2026-11-01'; REPORT_RANGE.to = '2026-11-30'; REPORT_SECTION = 'sites'; INVOICE_PLACE = 'p_01';
        const view = renderInvoiceTable();
        const last = selector => { const cells = [...view.querySelectorAll(`${selector} tr:last-child td`)]; return cells.length ? cells.pop().textContent : null; };
        const got = [view.querySelector('.invoice-bars-total strong').textContent, last('.norima-table'), last('.rima-table'),
            last('.yosefgeves-table'), view.querySelector('h2').textContent,
            [...view.querySelectorAll('.invoice-grid tbody tr')].map(row => [...row.children].slice(0, 2).map(cell => cell.textContent))];
        [REPORT_RANGE.from, REPORT_RANGE.to, REPORT_SECTION, INVOICE_PLACE] = held;
        return got;
    });
    same('the billing total, «בלי עובדי רימא», the Rima total and the יוסף גבס total are the reports screen\'s for that site and month',
        [String(facts.siteDays), String(facts.own), String(facts.rima), String(facts.yosef)], sheet.slice(0, 4));

    suite('the month as a calendar');
    same('six columns from Friday, no Saturday', await page.locator('#siteCardBody .scard-cal-head').evaluateAll(nodes => nodes.map(node => node.textContent)),
        ['ו׳', 'א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳']);
    same('a button for every day of the grid, in order', await page.locator('#siteCardBody .scard-cal-day').evaluateAll(nodes => nodes.map(node => Number(node.dataset.date.slice(8)))),
        [1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13, 15, 16, 17, 18, 19, 20, 22, 23, 24, 25, 26, 27, 29, 30]);
    const cell = date => page.evaluate(at => { const day = document.querySelector(`#siteCardBody [data-date="${at}"]`);
        return [...day.querySelectorAll('.scard-cal-number, .scard-cal-men, .scard-cal-count')].map(node => node.textContent); }, date);
    same('each day: its number, how many of his men, then the two small marks',
        [await cell('2026-11-03'), await cell('2026-11-04'), await cell('2026-11-11'), await cell('2026-11-12'), await cell('2026-11-13')],
        [['3', '4', 'ר2', 'י3'], ['4', '2'], ['11', 'ר12'], ['12', 'י1'], ['13']]);
    same('the Saturday that holds a record is under the grid', await page.locator('#siteCardBody .scard-cal-saturday').evaluateAll(nodes =>
        nodes.map(node => [node.dataset.date, node.textContent])), [['2026-11-07', '07/112']]);
    const sizes = await page.evaluate(() => { const size = selector => parseFloat(getComputedStyle(document.querySelector(`#siteCardBody ${selector}`)).fontSize);
        return [size('.scard-cal-men'), size('.scard-cal-count'), size('.scard-cal-number')]; });
    check('the count of men is large and the marks are not small', sizes[0] >= 24 && sizes[1] >= 16 && sizes[2] >= 16, JSON.stringify(sizes));
    same('the count of men stands in the site\'s own colour', await page.evaluate(() =>
        getComputedStyle(document.querySelector('#siteCardBody .scard-cal-men')).backgroundColor),
    await page.evaluate(() => getComputedStyle(document.querySelector('#siteCardWho .scard-name')).backgroundColor));
    same('today is ringed', await page.locator('#siteCardBody [aria-current="date"]').evaluateAll(nodes => nodes.map(node => node.dataset.date)), [TODAY]);
    same('a day is named in words for a reader', plain(await page.locator('#siteCardBody [data-date="2026-11-03"]').getAttribute('aria-label')),
        'יום שלישי 03/11/2026 · 4 עובדים · רימא 2 · יוסף גבס 3');
    same('who worked there, by days', await page.locator('#siteCardBody .scard-man').evaluateAll(nodes => nodes.map(node =>
        [node.children[0].textContent, node.children[1].textContent])),
    [['דוגמה אלף', '10'], ['דוגמה דלת', '5'], ['דוגמה גימל עם שם ארוך במיוחד לבדיקה', '4'], ['דוגמה בית', '1']]);
    same('nothing on it can be typed into or switched: one field, and it is read-only',
        await page.evaluate(() => [...document.querySelectorAll('#siteCardModal input, #siteCardModal select, #siteCardModal textarea, #siteCardModal [contenteditable]')]
            .map(node => [node.tagName, node.readOnly])), [['TEXTAREA', true]]);

    // ------------------------------------------------------------ keyboard, backdrop, focus
    suite('Escape, the backdrop, Tab and the focus');
    const order = [];
    for (let n = 0; n < 3; n += 1) {
        await page.keyboard.press('Tab');
        order.push(await page.evaluate(() => document.activeElement.id || document.activeElement.dataset.date));
    }
    same('Tab goes to the two arrows and then into the calendar', order, ['siteCardPrev', 'siteCardNext', '2026-11-01']);
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Shift+Tab');
    same('and backwards from the first control it comes round to «סגור», inside the dialog',
        await page.evaluate(() => document.activeElement.id), 'siteCardClose');
    await page.keyboard.press('Escape');
    check('Escape closes it', !(await isOpen(page)));
    same('it forgets which site and which month', await page.evaluate(() => [SITE_CARD_ID, SITE_CARD_MONTH]), [null, null]);
    check('the focus is back on the row\'s button', await entryOf(page, 'p_01').evaluate(node => node === document.activeElement));
    await openIt(page);
    await page.mouse.click(4, 4);
    await page.waitForTimeout(60);
    check('a tap on the backdrop closes it', !(await isOpen(page)));
    await openIt(page);
    await scrollCard(page, 99999);
    await page.locator('#siteCardClose').click();
    check('and so does «סגור»', !(await isOpen(page)));

    // ------------------------------------------------------------ the months
    suite('the arrows walk the months');
    await openIt(page);
    await page.locator('#siteCardPrev').click();
    same('one back is October; the focus stays on the arrow; the way home appears',
        [await page.locator('#siteCardMonth').innerText(), await page.evaluate(() => document.activeElement.id),
            await page.locator('#siteCardHome').isVisible(), await page.locator('#siteCardHome').innerText(),
            await page.locator('#siteCardBody .scard-progress').count()],
        ['אוקטובר 2026', 'siteCardPrev', true, 'חזרה לחודש הנוכחי', 0]);
    same('October is its three days', await page.locator('#siteCardBody .scard-pair').evaluateAll(nodes =>
        nodes.map(node => [node.dataset.figure, node.children[1].textContent])), [['siteDays', '3'], ['workingDays', '3'], ['average', '1']]);
    await page.locator('#siteCardPrev').click();
    same('September has nothing on the site: said once, a calendar of empty days, nobody',
        [await page.locator('#siteCardMonth').innerText(), await page.locator('#siteCardBody .scard-numbers .empty-hint').innerText(),
            await page.locator('#siteCardBody .scard-men .empty-hint').innerText(), await page.locator('#siteCardBody .scard-cal-men').count(),
            await page.locator('#siteCardBody .scard-cal-day').count()],
        ['ספטמבר 2026', 'אין רישומים בחודש הזה.', 'אין ימי עבודה בתקופה הזו.', 0, 26]);
    await shot(page, '06-empty-month-440-dark');
    await page.locator('#siteCardHome').click();
    same('home is November; the button that went is not left holding the focus',
        [await page.locator('#siteCardMonth').innerText(), await page.locator('#siteCardHome').isVisible(),
            await page.evaluate(() => document.activeElement.id)], ['נובמבר 2026', false, 'siteCardPrev']);
    await page.locator('#siteCardNext').click();
    same('one forward is December', await page.locator('#siteCardMonth').innerText(), 'דצמבר 2026');
    await page.locator('#siteCardHome').click();

    // ------------------------------------------------------------ for the client
    suite('for the client: shown first, then out by the day message\'s own two doors');
    await page.evaluate(() => {
        window.__out = [];
        Object.defineProperty(navigator, 'share', { configurable: true, value: data => { window.__out.push(['share', data.text]); return Promise.resolve(); } });
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: text => { window.__out.push(['copy', text]); return Promise.resolve(); } } });
    });
    check('until asked for, the field and its two doors are not on the screen', !(await page.locator('#siteCardText').isVisible())
        && !(await page.locator('#siteCardSend').isVisible()) && !(await page.locator('#siteCardCopy').isVisible())
        && await page.locator('#siteCardClientOpen').getAttribute('aria-expanded') === 'false');
    await scrollCard(page, 99999);
    same('the one button says what it shows', await page.locator('#siteCardClientOpen').innerText(), 'סיכום החודש ללקוח');
    await page.locator('#siteCardClientOpen').click();
    await scrollCard(page, 99999);
    const text = await page.locator('#siteCardText').inputValue();
    same('it shows the month for the client in a read-only field', [await page.locator('#siteCardText').isVisible(),
        await page.locator('#siteCardText').evaluate(node => node.readOnly), await page.locator('#siteCardClientOpen').getAttribute('aria-expanded'),
        text === facts.text], [true, true, 'true', true]);
    same('the text, line for line', plain(text).split('\n'), [
        'חיוב - אתר צפון', 'נובמבר 2026 · 01/11/2026 - 30/11/2026', '',
        'ראשון 01/11: 3 עובדים', 'שני 02/11: 2 עובדים', 'שלישי 03/11: 6 עובדים', 'רביעי 04/11: 2 עובדים', 'חמישי 05/11: 2 עובדים',
        'שישי 06/11: עובד אחד', 'שבת 07/11: 2 עובדים', 'ראשון 08/11: עובד אחד', 'שני 09/11: 2 עובדים', 'שלישי 10/11: עובד אחד',
        'רביעי 11/11: 12 עובדים', 'סה״כ ימי עובד־אתר: 34', '',
        'רישום לרימא', 'שלישי 03/11: 2 עובדים', 'רביעי 11/11: 12 עובדים', 'סה״כ עובדי רימא: 14',
        'עובדי רימא בלבד. אינם נכללים בשכר. בחיוב שלמעלה כל אחד מהם נספר כיום עובד־אתר אחד.']);
    same('its heading and its dated lines are the client\'s own page on the reports screen',
        [plain(text).split('\n')[0], plain(text).split('\n').slice(3, 14).map(line => line.replace(/: (\d+) עובדים$/, '|$1').replace(/: עובד אחד$/, '|1'))],
        [plain(sheet[4]), sheet[5].map(row => row.join('|'))]);
    check('«עובדי יוסף גבס» is on the card and nowhere in the text; no price either',
        (await page.locator('#siteCardBody').innerText()).indexOf('סה״כ עובדי יוסף גבס') !== -1 && !/יוסף|גבס|₪/.test(text));
    await shot(page, '05-client-text-440-dark');
    await page.locator('#siteCardSend').click();
    await page.waitForTimeout(60);
    same('the share sheet is handed exactly the field\'s words', await page.evaluate(() => window.__out), [['share', text]]);
    check('and the card stays open behind it', await isOpen(page));
    await page.locator('#siteCardCopy').click();
    await page.waitForTimeout(60);
    same('the copy is handed the same words and says what happened',
        [await page.evaluate(() => window.__out[1]), await page.locator('#siteCardStatus').innerText()], [['copy', text], '✔️ הועתק']);
    check('nothing on the card says «נשלח»', (await page.locator('#siteCardModal').innerText()).indexOf('נשלח') === -1);
    await page.locator('#siteCardClientOpen').click();
    check('the same button folds it away again', !(await page.locator('#siteCardText').isVisible()));

    // ------------------------------------------------------------ a man, and a day
    suite('a man goes to his own card; a day goes to the day screen');
    await page.locator('#siteCardPrev').click();
    await page.locator('#siteCardBody .scard-man').first().click();
    await page.waitForTimeout(80);
    same('this card closed and his opened, on the month this one was on',
        [await isOpen(page), await manOpen(page), plain(await page.locator('#workerCardTitle').innerText()),
            await page.locator('#workerCardBody .wcard-cal-label').innerText()], [false, true, 'כרטיס עובד · דוגמה אלף', 'אוקטובר 2026']);
    same('his card is entered at its heading', await page.evaluate(() => document.activeElement.id), 'workerCardTitle');
    await page.keyboard.press('Tab');
    check('and Tab stays inside it', await page.evaluate(() => document.getElementById('workerCardModal').contains(document.activeElement)));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(60);
    same('closing his card leaves no card open, on the crew screen', [await manOpen(page), await isOpen(page),
        await page.locator('#rosterView').isVisible()], [false, false, true]);
    check('and the focus is back on the site\'s row, where it all started', await entryOf(page, 'p_01').evaluate(node => node === document.activeElement));

    same('all of that - opening, stepping, both doors, a man\'s card - wrote nothing: every key on the disk', await disk(page), before);
    same('and the record in memory', await page.evaluate(() => JSON.stringify(State.schedule)), record);

    // A CHANGE ARRIVING UNDER IT MOVES ITS COUNTS. (These write or navigate, so they come last.)
    await openIt(page);
    await scrollCard(page, 140);
    await page.locator('#siteCardBody [data-date="2026-11-09"]').focus();
    await page.evaluate(() => State.commit(assignPlace(State.schedule, '2026-11-10', 'w_02', 'actual', 'p_01')));
    await page.waitForTimeout(80);
    same('a day recorded while it is open is on it at once; the reader keeps his place and the focus its day',
        [await page.locator('#siteCardBody [data-figure="siteDays"] .scard-value').innerText(),
            await page.evaluate(() => document.querySelector('#siteCardModal .modal-content').scrollTop),
            await page.evaluate(() => [document.activeElement.dataset.date, document.activeElement.isConnected])], ['35', 140, ['2026-11-09', true]]);
    const diskNow = await disk(page);
    await page.locator('#siteCardBody [data-date="2026-11-04"]').click();
    await page.waitForTimeout(120);
    same('a day closes the card and opens that date on the day screen',
        [await isOpen(page), await page.locator('#dayView').isVisible(), await page.locator('#rosterView').isVisible(),
            await page.evaluate(() => State.date)], [false, true, false, '2026-11-04']);
    check('the day on screen says so', (await page.locator('#dayView .day-header').innerText()).indexOf('04/11') !== -1);
    same('and going there edited nothing', await disk(page), diskNow);
    await shot(page, '07-day-opened-440-dark');
    await page.context().close();

    // ------------------------------------------------------------ the hidden site
    {
        suite('a hidden site has its card too');
        const hidden = await phone(440, 956, 'dark');
        await openIt(hidden, 'p_03');
        same('named, and called what the crew list calls it', [await hidden.locator('#siteCardWho .site-name').innerText(),
            await hidden.locator('#siteCardWho .scard-status').innerText()], ['מגדל המרכז עם שם ארוך מאוד לבדיקת שבירה', 'לא פעיל']);
        same('a double day there is one man', await hidden.locator('#siteCardBody .scard-pair').evaluateAll(nodes =>
            nodes.map(node => [node.dataset.figure, node.children[1].textContent])), [['siteDays', '1'], ['workingDays', '1'], ['average', '1']]);
        const who = await hidden.evaluate(() => { const box = document.querySelector('#siteCardWho .scard-name').getBoundingClientRect();
            const inside = document.querySelector('#siteCardModal .modal-content').getBoundingClientRect();
            return box.left >= inside.left && box.right <= inside.right; });
        check('the long name wraps inside the card', who);
        await shot(hidden, '08-hidden-site-440-dark');
        await hidden.context().close();
    }

    // ------------------------------------------------------------ a phone with no share sheet
    {
        suite('where there is no share sheet, WhatsApp is opened with the words and nothing is called sent');
        const desk = await phone(440, 956, 'light', { noShare: true });
        await desk.evaluate(() => { window.__opened = []; window.open = (url, target) => { window.__opened.push([url, target]); return null; }; });
        await openIt(desk);
        await desk.locator('#siteCardClientOpen').click();
        const words = await desk.locator('#siteCardText').inputValue();
        await desk.locator('#siteCardSend').click();
        same('wa.me with no number, carrying the text', await desk.evaluate(() => window.__opened),
            [[`https://wa.me/?text=${encodeURIComponent(words)}`, '_blank']]);
        same('the line says it is opening WhatsApp', await desk.locator('#siteCardStatus').innerText(), 'פותח וואטסאפ…');
        check('and the card is still on the screen', await isOpen(desk));
        await desk.context().close();
    }

    // ------------------------------------------------------------ the phones, and big text
    for (const [width, height, scheme, scale] of [[375, 667, 'dark', 1], [440, 956, 'dark', 1], [375, 667, 'light', 1],
        [440, 956, 'light', 1], [375, 667, 'dark', 2], [440, 956, 'dark', 2], [320, 568, 'light', 1]]) {
        const tag = `${width}x${height} ${scheme}${scale === 2 ? ' 200% text' : ''}`;
        suite(`rectangles - ${tag}`);
        const glass = await phone(width, height, scheme);
        await openIt(glass);
        await glass.locator('#siteCardPrev').click();
        await glass.locator('#siteCardNext').click();
        await glass.locator('#siteCardNext').click();
        // December: the way home is drawn, so every control the frame has is measured. Then
        // back to November for the body.
        const home = await glass.locator('#siteCardHome').boundingBox();
        await glass.locator('#siteCardPrev').click();
        await glass.evaluate(() => siteCardShowClient(true));
        if (scale === 2) {
            await glass.evaluate(() => {
                const sizes = [...document.querySelectorAll('#siteCardModal *')]
                    .map(node => [node, parseFloat(getComputedStyle(node).fontSize)]);
                sizes.forEach(([node, size]) => node.style.setProperty('font-size', `${size * 2}px`, 'important'));
            });
        }
        const seen = await glass.evaluate(() => {
            const modal = document.getElementById('siteCardModal');
            const content = modal.querySelector('.modal-content');
            const visible = node => node.offsetParent !== null;
            const targets = [...modal.querySelectorAll('button')].filter(visible);
            const texts = [...modal.querySelectorAll('*')].filter(visible)
                .filter(node => [...node.childNodes].some(child => child.nodeType === 3 && child.textContent.trim() !== ''));
            const box = content.getBoundingClientRect();
            const clipped = [...modal.querySelectorAll('.scard-cal-day, .scard-man, .scard-pair, .scard-nav button, .scard-client button, .scard-name')]
                .filter(visible).filter(node => node.scrollHeight > node.clientHeight + 1 || node.scrollWidth > node.clientWidth + 1)
                .map(node => node.className || node.id);
            return {
                page: document.documentElement.scrollWidth <= innerWidth + 1,
                sideways: content.scrollWidth <= content.clientWidth + 1,
                inside: box.left >= 0 && box.right <= innerWidth + 1 && box.top >= 0 && box.bottom <= innerHeight + 1,
                small: targets.filter(node => { const at = node.getBoundingClientRect(); return at.width < 48 || at.height < 48; })
                    .map(node => `${node.id || node.dataset.date || node.textContent}: ${Math.round(node.getBoundingClientRect().width)}x${Math.round(node.getBoundingClientRect().height)}`),
                narrowest: Math.min(...[...modal.querySelectorAll('.scard-cal-day')].map(node => node.getBoundingClientRect().width)),
                targets: targets.length,
                tiny: texts.filter(node => parseFloat(getComputedStyle(node).fontSize) < 16)
                    .map(node => `${node.className || node.id}: ${getComputedStyle(node).fontSize}`),
                wide: [...modal.querySelectorAll('.modal-content *')].filter(visible)
                    .filter(node => { const at = node.getBoundingClientRect(); return at.right > box.right + 1 || at.left < box.left - 1; })
                    .map(node => node.className || node.id),
                clipped,
                field: parseFloat(getComputedStyle(document.getElementById('siteCardText')).fontSize),
                men: parseFloat(getComputedStyle(modal.querySelector('.scard-cal-men')).fontSize),
                value: parseFloat(getComputedStyle(modal.querySelector('.scard-value')).fontSize),
                name: parseFloat(getComputedStyle(modal.querySelector('.scard-name')).fontSize)
            };
        });
        check(`${tag}: neither the page nor the card scrolls sideways`, seen.page && seen.sideways, JSON.stringify(seen));
        check(`${tag}: the card is wholly on the glass`, seen.inside, JSON.stringify(seen));
        check(`${tag}: nothing in it reaches past its edge`, seen.wide.length === 0, JSON.stringify(seen.wide));
        check(`${tag}: no word is cut off inside its box`, seen.clipped.length === 0, JSON.stringify(seen.clipped));
        // 26 days, the Saturday, 4 men, the two arrows, the client's button and its two
        // doors, «סגור» - and, measured a step earlier, the way home.
        if (width >= 375) {
            check(`${tag}: every one of the ${seen.targets} targets is 48px both ways`, seen.small.length === 0 && seen.targets === 37
                && home.width >= 48 && home.height >= 48, JSON.stringify([seen.small, seen.targets, home]));
        } else {
            // On the 320px floor six columns leave a day 45px across: over the law's 44, under the 48 asked of the two phones.
            check(`${tag}: every target is 44px both ways on the 320px floor`, seen.narrowest >= 44 && seen.targets === 37
                && seen.small.every(item => /^2026-/.test(item)), JSON.stringify([seen.small, seen.narrowest]));
        }
        check(`${tag}: no word on it is under 16px, the field included`, seen.tiny.length === 0 && seen.field >= 16,
            JSON.stringify([seen.tiny, seen.field]));
        check(`${tag}: the site's name, the day's men and the month's counts are large`,
            seen.name >= 24 * scale && seen.men >= 24 * scale && seen.value >= 26 * scale, JSON.stringify([seen.name, seen.men, seen.value]));
        const reach = await glass.evaluate(() => {
            const close = document.getElementById('siteCardClose');
            close.scrollIntoView({ block: 'end' });
            const at = close.getBoundingClientRect();
            return at.bottom <= innerHeight + 1 && at.top >= 0;
        });
        check(`${tag}: «סגור» can be scrolled to and is then on the glass`, reach);
        if (width === 440 && scheme === 'dark' && scale === 1) {
            await glass.evaluate(() => siteCardShowClient(false));
            await scrollCard(glass, 0);
            await shot(glass, '03-card-calendar-440-dark');
            await scrollCard(glass, 760);
            await shot(glass, '04-card-numbers-and-men-440-dark');
            await scrollCard(glass, 99999);
            await shot(glass, '04b-card-end-440-dark');
        }
        if (width === 375 && scale === 1 && scheme === 'dark') {
            await glass.evaluate(() => siteCardShowClient(false));
            await scrollCard(glass, 0);
            await shot(glass, '09-card-375-dark');
        }
        if (scale === 2 && width === 375) { await scrollCard(glass, 0); await shot(glass, '10-card-375-dark-doubled-text'); }
        if (width === 440 && scheme === 'light') {
            await glass.evaluate(() => siteCardShowClient(false));
            await scrollCard(glass, 0);
            await shot(glass, '11-card-440-light');
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
