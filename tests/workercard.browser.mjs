// כרטיס עובד in a real Chromium.
//
//   node tests/workercard.browser.mjs
//
// tests/workercard.test.mjs holds the figures against the sheet on devices in Node. What
// it cannot hold is the glass: that there is one worded control on a crew row and the two
// controls beside it did not move by a pixel; that the card opens as one of the app's
// dialogs - entered at its heading, shut by Escape and by the backdrop, the focus given
// back to the button that opened it, Tab kept inside it; that nothing on it can be typed
// into or switched; that its two buttons land on the screens they name, with the figures
// the card showed; that it fits a 375x667 phone and a 440x956 one, light and dark, and at
// doubled text, with no sideways scroll and every target 44px both ways; that a site is
// drawn in the colour that site has everywhere else; and that the phone's disk is byte for
// byte what it was. NOT a real phone: emulated touch and Chromium's layout.

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

const TODAY = '2026-11-10';

async function phone(width, height, scheme) {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2,
        isMobile: true, hasTouch: true, colorScheme: scheme, serviceWorkers: 'block' });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.clock.setFixedTime(`${TODAY}T10:00:00`);
    await page.goto(server.url);
    await page.waitForFunction(() => typeof openWorkerCard === 'function' && typeof State === 'object');
    // Synthetic names throughout. One fortnightly man with everything on his record, one
    // weekly, one with a long name and no rate, one archived with money left behind.
    await page.evaluate(today => {
        todayStr = () => today;
        State.schedule.workers = [
            { id: 'w_01', name: 'דוגמה אלף', active: true, dailyRate: 450, hourlyRate: 60, phone: '050-0000001' },
            { id: 'w_02', name: 'דוגמה בית', active: true, dailyRate: 400, payCycles: '2026-10-02=weekly' },
            { id: 'w_03', name: 'דוגמה גימל עם שם ארוך במיוחד לבדיקה', active: true },
            { id: 'w_04', name: 'דוגמה דלת', active: false, dailyRate: 380 }];
        State.schedule.places = [
            { id: 'p_01', name: 'אתר צפון', active: true },
            { id: 'p_02', name: 'אתר דרום', active: true },
            { id: 'p_03', name: 'מגדל המרכז עם שם ארוך', active: true }];
        State.commitRoster();
        ['2026-10-29', '2026-10-30', '2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04',
            '2026-11-05', '2026-11-08', '2026-11-09', '2026-11-10'].forEach((date, at) => {
            State.commit(assignPlace(State.schedule, date, 'w_01', 'actual',
                ['p_01', 'p_02', 'p_03'][at % 3], at === 4 ? 'double' : undefined));
            if (at % 2 === 0) State.commit(assignPlace(State.schedule, date, 'w_02', 'actual', 'p_01'));
        });
        State.commit(assignPlace(State.schedule, '2026-11-09', 'w_01', 'actual', 'p_02', 'extra', 2));
        State.commit(markAbsent(State.schedule, '2026-11-06', 'w_01', 'actual'));
        State.commit(assignPlace(State.schedule, '2026-11-09', 'w_03', 'actual', 'p_02'));
        State.commitMany(recordNewAdvance(State.schedule, 'w_01', '2026-11-02', 1500, '',
            '2026-11-02T08:00:00Z', 'd_test', 'cash'));
        State.commitMany(recordNewAdvance(State.schedule, 'w_01', '2026-11-08', 400, '',
            '2026-11-08T08:00:00Z', 'd_test', 'transfer'));
        State.commit(addAdvance(State.schedule, 'w_04', '2026-10-20', 700, ''));
        // The record as the owner's is: the carried reading approved. Without this the
        // archived man's 700 makes the migration needed and the whole record reads the
        // old way - which tests/workercard.test.mjs covers, and which is not the phone
        // this suite is about.
        const plan = planCarryMigration(State.schedule);
        if (plan.needed) {
            State.commit(recordCarryApproval(State.schedule, plan, '2026-11-01T09:00:00.000Z', 'd_test'));
        }
        showView('roster');
    }, TODAY);
    await page.waitForTimeout(250);
    return page;
}

const disk = page => page.evaluate(() => JSON.stringify(Object.keys(localStorage).sort()
    .map(key => [key, localStorage.getItem(key)])));
const cardOpen = page => page.evaluate(() =>
    document.getElementById('workerCardModal').style.display === 'flex');
const rect = (page, selector) => page.evaluate(sel => {
    const box = document.querySelector(sel).getBoundingClientRect();
    return [box.left, box.top, box.width, box.height].map(Math.round);
}, selector);

try {
    const page = await phone(390, 844, 'light');
    const before = await disk(page);
    const record = await page.evaluate(() => JSON.stringify(State.schedule));

    suite('one worded control on every crew row, and nothing beside it moved');
    given('the record on this phone may be read the new way, as the owner\'s may',
        await page.evaluate(() => carryReportingEnabled(State.schedule)) === true);
    same('every row has exactly one, the archived man\'s too',
        await page.evaluate(() => [...document.querySelectorAll('#workerList .roster-row')]
            .map(row => [row.dataset.workerId, row.querySelectorAll('.worker-card-open').length])),
        [['w_01', 1], ['w_02', 1], ['w_03', 1], ['w_04', 1]]);
    same('it says what it opens',
        await page.locator('[data-worker-id="w_01"] .worker-card-open').innerText(), 'כרטיס עובד');
    same('and is named for the man',
        (await page.locator('[data-worker-id="w_01"] .worker-card-open').getAttribute('aria-label'))
            .replace(/[⁨⁩]/g, ''), 'כרטיס עובד של דוגמה אלף');
    // THE ROWS AS THEY WERE, measured with the new control and then without it: every
    // switch and every «עוד ⋯», the height of every row, and the width the line with the
    // phone and the rates is given.
    const layout = () => page.evaluate(() => [...document.querySelectorAll('#workerList .roster-row')]
        .filter(row => row.offsetParent !== null).map(row => {
            const box = node => { const at = node.getBoundingClientRect();
                return [at.left, at.top, at.width, at.height].map(Math.round); };
            const lines = row.querySelectorAll('.roster-details > .roster-meta');
            return { id: row.dataset.workerId, toggle: box(row.querySelector('.worker-active-toggle')),
                more: box(row.querySelector('.crew-edit')), height: box(row)[3],
                meta: Math.round(lines[lines.length - 1].getBoundingClientRect().width) };
        }));
    const withIt = await layout();
    await page.evaluate(() => document.querySelectorAll('.worker-card-open')
        .forEach(node => { node.style.display = 'none'; }));
    const without = await layout();
    await page.evaluate(() => document.querySelectorAll('.worker-card-open')
        .forEach(node => { node.style.display = ''; }));
    given('the active rows were measured', withIt.length > 2, String(withIt.length));
    same('every switch and every «עוד ⋯» is on the pixels it was on before the card existed',
        withIt.map(row => [row.id, row.toggle, row.more]), without.map(row => [row.id, row.toggle, row.more]));
    same('no row is taller', withIt.map(row => [row.id, row.height]), without.map(row => [row.id, row.height]));
    same('and the line with the phone and the rates keeps its whole width',
        withIt.map(row => [row.id, row.meta]), without.map(row => [row.id, row.meta]));
    // w_02 is the ordinary row: a name, a cycle, one line of details. (w_01's phone and
    // two rates wrap onto a second line at this width with or without the card.)
    check('an ordinary row is still inside the 125px tests/roster.browser.mjs holds it to',
        withIt.filter(row => row.id === 'w_02').every(row => row.height <= 125)
        && withIt.some(row => row.id === 'w_02'), JSON.stringify(withIt.map(row => row.height)));
    same('«עוד ⋯» still opens the same menu, with the card not among its choices',
        await (async () => {
            await page.locator('[data-worker-id="w_01"] .crew-edit').click();
            const choices = await page.locator('#askChoices button').allInnerTexts();
            await page.evaluate(() => askCancel());
            return choices.filter(text => text !== 'מחיקת עובד');
        })(), ['עריכת פרטים', 'סגור']);

    suite('it opens as one of the app\'s dialogs and closes like one');
    const opener = page.locator('[data-worker-id="w_01"] .worker-card-open');
    await opener.focus();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(250);
    check('the control opens the card', await cardOpen(page));
    same('headed by the words and the man',
        await page.locator('#workerCardTitle').innerText(), 'כרטיס עובד · דוגמה אלף');
    same('entered at its heading, at the top',
        await page.evaluate(() => [document.activeElement.id,
            document.querySelector('#workerCardModal .modal-content').scrollTop]),
        ['workerCardTitle', 0]);
    same('nothing in its body can be pressed, typed into or switched',
        await page.evaluate(() => document.querySelectorAll('#workerCardBody button, '
            + '#workerCardBody input, #workerCardBody select, #workerCardBody textarea, '
            + '#workerCardBody a, #workerCardBody [contenteditable], #workerCardBody [onclick], '
            + '#workerCardBody summary').length), 0);
    same('the frame holds three buttons: the two screens, and the way out',
        await page.locator('#workerCardModal .modal-actions button').allInnerTexts(),
        ['שכר - לפי עובד', 'מקדמות', 'סגור']);
    // Tab stays inside: three controls, so the fourth Tab is the first again.
    const walked = [];
    for (let step = 0; step < 4; step += 1) {
        await page.keyboard.press('Tab');
        walked.push(await page.evaluate(() => document.activeElement.textContent));
    }
    same('Tab walks its three buttons and comes round', walked,
        ['שכר - לפי עובד', 'מקדמות', 'סגור', 'שכר - לפי עובד']);
    await page.keyboard.press('Shift+Tab');
    same('and Shift+Tab goes back round, never out to the page behind',
        await page.evaluate(() => document.activeElement.textContent), 'סגור');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
    check('Escape closes it', !(await cardOpen(page)));
    check('and the focus is back on the button that opened it',
        await opener.evaluate(node => node === document.activeElement));
    await opener.click();
    await page.waitForTimeout(200);
    await page.mouse.click(4, 4);
    await page.waitForTimeout(250);
    check('a tap on the backdrop closes it', !(await cardOpen(page)));
    await opener.click();
    await page.waitForTimeout(200);
    await page.locator('#workerCardModal .modal-actions').getByRole('button', { name: 'סגור', exact: true }).click();
    check('and so does its own button', !(await cardOpen(page)));

    suite('what is on it');
    await opener.click();
    await page.waitForTimeout(200);
    const facts = await page.evaluate(() => workerCardFacts('w_01'));
    const text = await page.locator('#workerCardBody').innerText();
    same('his period, his cycle, his phone and his rates',
        [facts.period.from, facts.period.to, facts.cycle, facts.phone, facts.dailyRate, facts.hourlyRate],
        ['2026-10-30', '2026-11-12', 'תשלום כל שבועיים', '050-0000001', '450', '60']);
    check('all drawn', ['30/10/2026 - 12/11/2026', 'תשלום כל שבועיים', '050-0000001',
        'שכר יומי: 450', 'שכר לשעה נוספת: 60'].every(piece => text.replace(/[⁦-⁩‎]/g, '')
        .indexOf(piece) !== -1), text.slice(0, 200));
    // 9 dates on site in the period, one of them double: ten days of pay at 450, and two
    // extra hours at 60. 1,900 was handed over in it.
    same('the period\'s cells, as the sheet prints them',
        await page.evaluate(() => [...document.querySelectorAll('#workerCardBody .wcard-figures .wcard-pair')]
            .map(pair => [pair.querySelector('.wcard-label').textContent,
                pair.querySelector('.wcard-value').textContent.replace('‎', '')])),
        [['נוכחות', '9'], ['ימי שכר', '10'], ['כפולים', '1'], ['שעות נוספות', '2'], ['נעדר', '1'],
            ['שכר יומי', '450'], ['נצבר', '4620'], ['נוכה מהשכר', '-1900'], ['לתשלום', '2720']]);
    same('what he owes, and the last movements newest first',
        await page.evaluate(() => [[...document.querySelectorAll('#workerCardBody .wcard-owed')]
            .map(node => node.textContent),
        [...document.querySelectorAll('#workerCardBody .wcard-move')].map(node => node.textContent)]),
        [['נשאר להחזיר1900 ₪'], ['ניתנה מקדמה08/11/2026400 ₪', 'ניתנה מקדמה02/11/20261500 ₪']]);
    same('fourteen days, today first',
        await page.evaluate(() => { const days = [...document.querySelectorAll('#workerCardBody .wcard-day-when')]
            .map(node => node.textContent); return [days.length, days[0], days[13]]; }),
        [14, 'ג׳ 10/11', 'ד׳ 28/10']);
    same('an absence in its own word, a day with nothing as a dash, two sites as two',
        await page.evaluate(() => { const days = [...document.querySelectorAll('#workerCardBody .wcard-day')];
            const of = when => days.filter(day => day.textContent.indexOf(when) !== -1)[0];
            return [of('06/11').querySelector('.wcard-day-where').textContent,
                of('07/11').querySelector('.wcard-day-where').textContent,
                of('09/11').querySelectorAll('.wcard-site').length]; }),
        ['נעדר', '—', 2]);
    same('and this month site by site',
        await page.evaluate(() => [...document.querySelectorAll('#workerCardBody .wcard-month-row')]
            .map(row => [row.querySelector('.site-name').textContent,
                row.querySelector('.wcard-month-days').textContent]).sort()),
        [['אתר דרום', '3'], ['אתר צפון', '3'], ['מגדל המרכז עם שם ארוך', '3']].sort());
    // A SITE'S COLOUR IS THE SITE'S: the chip against a probe painted by the same variable
    // the day screen paints with.
    same('each site in the colour it has everywhere else',
        await page.evaluate(() => ['p_01', 'p_02', 'p_03'].map(id => {
            const probe = document.createElement('span');
            probe.style.background = siteColorVar(id);
            document.body.appendChild(probe);
            const want = getComputedStyle(probe).backgroundColor;
            probe.remove();
            const name = State.schedule.places.filter(place => place.id === id)[0].name;
            const chips = [...document.querySelectorAll('#workerCardBody .wcard-site')]
                .filter(chip => chip.textContent === name);
            return chips.length > 0 && chips.every(chip => getComputedStyle(chip).backgroundColor === want);
        })), [true, true, true]);

    suite('its two buttons go where they say, and the figures are there');
    const cells = facts.pay.map(cell => [cell.label, cell.value]);
    await page.locator('#workerCardReport').click();
    await page.waitForTimeout(300);
    check('the card is gone and the reports are on screen', !(await cardOpen(page))
        && await page.locator('#reportsView').isVisible()
        && !(await page.locator('#rosterView').isVisible()));
    same('the sheet, on his period and on him alone',
        await page.evaluate(() => [REPORT_RANGE.from, REPORT_RANGE.to, [...REPORT_WORKERS], REPORT_SECTION,
            document.querySelector('.report-payroll h2').textContent]),
        ['2026-10-30', '2026-11-12', ['w_01'], 'workers', 'שכר - לפי עובד']);
    same('and its one row is the card, cell for cell',
        await page.evaluate(() => { const table = document.querySelector('.report-payroll .report-table');
            const heads = [...table.querySelectorAll('thead th')].map(node => node.textContent);
            return [...table.querySelector('tbody tr').children]
                .map((cell, at) => [heads[at], cell.textContent]).slice(1); }), cells);
    await page.locator('#tab-roster').click();
    await page.waitForTimeout(200);
    await page.locator('[data-worker-id="w_01"] .worker-card-open').click();
    await page.waitForTimeout(200);
    await page.locator('#workerCardAdvances').click();
    await page.waitForTimeout(300);
    check('the other one lands on his advances', !(await cardOpen(page))
        && await page.locator('#advancesView').isVisible());
    same('headed by his name, with the figure the card showed',
        [await page.locator('#advancesView h2').innerText(),
            await page.locator('.advance-balance span').innerText(),
            await page.locator('.advance-balance strong').innerText()],
        ['מקדמות · דוגמה אלף', facts.owed.label, facts.owed.amount]);

    suite('it wrote nothing');
    await page.locator('#tab-roster').click();
    await page.waitForTimeout(200);
    for (const id of ['w_01', 'w_02', 'w_03', 'w_04']) {
        await page.locator(`[data-worker-id="${id}"] .worker-card-open`).click();
        await page.waitForTimeout(120);
        given(`${id}: his card opened`, await cardOpen(page));
        await page.keyboard.press('Escape');
        await page.waitForTimeout(120);
    }
    check('every key on the disk holds the bytes it held before the first card was opened',
        await disk(page) === before);
    check('and the record in memory is the record it was',
        await page.evaluate(() => JSON.stringify(State.schedule)) === record);
    same('the archived man\'s card says what he left with, and that he is not active',
        await page.evaluate(() => { openWorkerCard('w_04');
            const said = [document.querySelector('#workerCardBody .badge').textContent,
                document.querySelector('#workerCardBody .wcard-owed').textContent];
            closeWorkerCard(); return said; }), ['לא פעיל', 'נשאר להחזיר700 ₪']);
    same('and a man with no rate and no phone is told apart from a man with a zero',
        await page.evaluate(() => { openWorkerCard('w_03');
            const said = document.querySelector('#workerCardBody .wcard-who').textContent;
            closeWorkerCard(); return [said.indexOf('בלי טלפון') !== -1, said.indexOf('שכר יומי: —') !== -1]; }),
        [true, true]);
    suite('a record that changes under an open card changes the card');
    await page.locator('#tab-roster').click();
    await page.locator('[data-worker-id="w_02"] .worker-card-open').click();
    await page.waitForTimeout(200);
    const dayCount = () => page.evaluate(() => [...document.querySelectorAll('#workerCardBody .wcard-pair')]
        .filter(pair => pair.querySelector('.wcard-label').textContent === 'נוכחות')
        .map(pair => pair.querySelector('.wcard-value').textContent)[0]);
    const had = Number(await dayCount());
    await page.locator('#workerCardAdvances').focus();
    // What another phone's edit does on this one: the record moves and render() runs.
    await page.evaluate(() => { assignPlace(State.schedule, '2026-11-07', 'w_02', 'actual', 'p_02'); render(); });
    same('the day is on it without closing anything', Number(await dayCount()), had + 1);
    same('and the focus is where it was', await page.evaluate(() => document.activeElement.id),
        'workerCardAdvances');
    await page.evaluate(() => { clearWorkerDay(State.schedule, '2026-11-07', 'w_02', 'actual');
        render(); closeWorkerCard(); });

    await page.context().close();

    // ------------------------------------------------------------ the two phones, and big text
    for (const [width, height, scheme, scale] of [[375, 667, 'light', 1], [440, 956, 'dark', 1],
        [375, 667, 'dark', 2], [320, 568, 'light', 1]]) {
        const tag = `${width}x${height} ${scheme}${scale === 2 ? ' 200% text' : ''}`;
        suite(`rectangles - ${tag}`);
        const glass = await phone(width, height, scheme);
        const doubleText = scope => glass.evaluate(sel => {
            const sizes = [...document.querySelectorAll(sel)]
                .map(node => [node, parseFloat(getComputedStyle(node).fontSize)]);
            sizes.forEach(([node, size]) => node.style.setProperty('font-size', `${size * 2}px`, 'important'));
        }, scope);
        if (scale === 2) await doubleText('#rosterView *');
        const row = await glass.evaluate(() => {
            const small = [...document.querySelectorAll('#rosterView button, #rosterView input')]
                .filter(node => node.offsetParent !== null).filter(node => {
                    const box = node.getBoundingClientRect(); return box.width < 44 || box.height < 44;
                }).map(node => node.textContent);
            const cards = [...document.querySelectorAll('.worker-card-open')].map(node => node.getBoundingClientRect());
            return { small, overflow: document.documentElement.scrollWidth > innerWidth + 1,
                inside: cards.every(box => box.left >= 0 && box.right <= innerWidth + 1),
                count: cards.length };
        });
        check(`${tag}: the crew screen does not scroll sideways`, !row.overflow, JSON.stringify(row));
        check(`${tag}: every control on it is 44px both ways, the new one included`,
            row.small.length === 0 && row.count === 4, JSON.stringify(row));
        check(`${tag}: the new control is wholly on the glass`, row.inside, JSON.stringify(row));

        await glass.locator('[data-worker-id="w_01"] .worker-card-open').click();
        await glass.waitForTimeout(250);
        if (scale === 2) await doubleText('#workerCardModal *');
        const measure = () => glass.evaluate(() => {
            const content = document.querySelector('#workerCardModal .modal-content');
            const box = content.getBoundingClientRect();
            const spill = [...content.querySelectorAll('*')].filter(node => {
                const at = node.getBoundingClientRect();
                return at.width > 0 && (at.left < box.left - 1 || at.right > box.right + 1);
            }).map(node => node.className || node.tagName);
            const buttons = [...content.querySelectorAll('button')].map(node => node.getBoundingClientRect());
            const fields = [...content.querySelectorAll('input, select, textarea')].length;
            return {
                page: document.documentElement.scrollWidth <= innerWidth + 1,
                sideways: content.scrollWidth <= content.clientWidth + 1,
                onGlass: box.left >= 0 && box.right <= innerWidth + 1 && box.top >= 0
                    && box.bottom <= innerHeight + 1,
                spill, fields,
                small: buttons.filter(at => at.width < 44 || at.height < 44).length,
                buttons: buttons.length,
                last: buttons.length ? buttons[buttons.length - 1].bottom <= innerHeight + 1 : false,
                rtl: getComputedStyle(content).direction,
                tiny: [...content.querySelectorAll('*')].filter(node => node.children.length === 0
                    && node.textContent.trim() !== '' && parseFloat(getComputedStyle(node).fontSize) < 14)
                    .map(node => node.className)
            };
        });
        const top = await measure();
        check(`${tag}: the card is wholly on the glass`, top.onGlass && top.page, JSON.stringify(top));
        check(`${tag}: and nothing in it reaches past its own edge`, top.sideways && top.spill.length === 0,
            JSON.stringify(top.spill.slice(0, 5)));
        same(`${tag}: it reads right to left`, top.rtl, 'rtl');
        check(`${tag}: no text on it is under 14px`, top.tiny.length === 0, JSON.stringify(top.tiny));
        await glass.evaluate(() => { const content = document.querySelector('#workerCardModal .modal-content');
            content.scrollTop = content.scrollHeight; });
        await glass.waitForTimeout(150);
        const foot = await measure();
        check(`${tag}: scrolled to its foot, the three buttons are 44px both ways and on the glass`,
            foot.buttons === 3 && foot.small === 0 && foot.last && foot.sideways, JSON.stringify(foot));
        same(`${tag}: and there is no field on it to be 16px`, foot.fields, 0);
        if (process.env.WORKERCARD_SCREENSHOT_DIR && scale === 1) {
            await glass.evaluate(() => { document.querySelector('#workerCardModal .modal-content').scrollTop = 0; });
            await glass.screenshot({ path: `${process.env.WORKERCARD_SCREENSHOT_DIR}/card-${width}x${height}-${scheme}.jpg`,
                type: 'jpeg', quality: 82 });
            await glass.evaluate(() => { const content = document.querySelector('#workerCardModal .modal-content');
                content.scrollTop = content.scrollHeight; });
            await glass.screenshot({ path: `${process.env.WORKERCARD_SCREENSHOT_DIR}/card-${width}x${height}-${scheme}-foot.jpg`,
                type: 'jpeg', quality: 82 });
            await glass.evaluate(() => closeWorkerCard());
            await glass.screenshot({ path: `${process.env.WORKERCARD_SCREENSHOT_DIR}/crew-${width}x${height}-${scheme}.jpg`,
                type: 'jpeg', quality: 82 });
        }
        await glass.context().close();
    }

    suite('and nothing threw');
    check('no uncaught browser errors', errors.length === 0, JSON.stringify(errors));
} finally {
    await browser.close();
    await server.close();
}
report();
