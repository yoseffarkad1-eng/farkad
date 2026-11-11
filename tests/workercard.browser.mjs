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
//
// THE SECOND PART (the month as a calendar, call and WhatsApp): that each day of the grid
// is what the week screen's own cell draws for that man on that date - renderWeekCell is
// run beside it and the two compared, colour, letter and mark; that a day is a 44px
// button with an 18px letter on every phone here, and a tap on it lands on that date on
// the day screen with the disk untouched; that the month steps under a finger and the
// focus stays on the step; that the two doors are real links to tel: and wa.me, 48px and
// more, and are not drawn for a number the seder would not use.

import { chromium } from 'playwright';
import { serve } from './serve.mjs';
import { launchLocalBrowser } from './network-guard.mjs';
import { verifyServedAssets, expectedShaFor } from './treecheck.mjs';
import { suite, check, same, given, report } from './runner.mjs';
import { censusOnly } from './census.mjs';

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
        // A Saturday with a record, on the man no pinned figure below is about: the grid
        // has no Saturday column, and the day must still be on his card.
        State.commit(assignPlace(State.schedule, '2026-11-07', 'w_03', 'actual', 'p_01', 'double'));
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

// Without the service worker's census of open builds (tests/census.mjs says why).
const disk = page => page.evaluate(() => JSON.stringify(Object.keys(localStorage).sort()
    .filter(key => key !== 'farkad:openBuilds').map(key => [key, localStorage.getItem(key)])));
const cardOpen = page => page.evaluate(() =>
    document.getElementById('workerCardModal').style.display === 'flex');
const rect = (page, selector) => page.evaluate(sel => {
    const box = document.querySelector(sel).getBoundingClientRect();
    return [box.left, box.top, box.width, box.height].map(Math.round);
}, selector);

try {
    const page = await phone(390, 844, 'light');
    const before = await disk(page);
    await censusOnly(check, page, before);
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
    // MOVED WITH THE CALENDAR AND THE TWO DOORS: this read "nothing in its body can be
    // pressed, typed into or switched", one count of zero. Still nothing to type into or
    // switch; what can be pressed is counted exactly and every one of them navigates.
    same('nothing in its body can be typed into or switched',
        await page.evaluate(() => document.querySelectorAll('#workerCardBody input, '
            + '#workerCardBody select, #workerCardBody textarea, #workerCardBody [contenteditable], '
            + '#workerCardBody [onclick], #workerCardBody summary').length), 0);
    same('what can be pressed in it: his two doors, the two steps of the month, and its days',
        await page.evaluate(() => [[...document.querySelectorAll('#workerCardBody a')].map(node => node.textContent),
            [...document.querySelectorAll('#workerCardBody button:not(.wcard-cal-day)')].map(node => node.textContent),
            document.querySelectorAll('#workerCardBody button.wcard-cal-day').length]),
        [['התקשר', 'וואטסאפ'], ['חודש קודם', 'חודש הבא'], 26]);
    same('the frame holds three buttons: the two screens, and the way out',
        await page.locator('#workerCardModal .modal-actions button').allInnerTexts(),
        ['שכר - לפי עובד', 'מקדמות', 'סגור']);
    // MOVED: Tab used to walk the frame's three buttons and come round. The body has
    // controls now, so from the heading it walks them first, in reading order, and the
    // frame's three are the last; it still comes round and never leaves the dialog.
    const walked = [];
    for (let step = 0; step < 5; step += 1) {
        await page.keyboard.press('Tab');
        walked.push(await page.evaluate(() => document.activeElement.dataset.date || document.activeElement.textContent));
    }
    same('Tab walks his two doors, the steps of the month, then the days from the first', walked,
        ['התקשר', 'וואטסאפ', 'חודש קודם', 'חודש הבא', '2026-11-01']);
    await page.locator('#workerCardModal .modal-actions button').first().focus();
    const frame = ['שכר - לפי עובד'];
    for (let step = 0; step < 3; step += 1) {
        await page.keyboard.press('Tab');
        frame.push(await page.evaluate(() => document.activeElement.textContent));
    }
    same('the frame\'s three buttons are last, and after them Tab comes round to the first', frame,
        ['שכר - לפי עובד', 'מקדמות', 'סגור', 'התקשר']);
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

    suite('the month as a calendar: the week screen\'s own cell, day for day');
    const cal = facts.calendar;
    same('it opens on the month today is in, under the week screen\'s six days',
        [await page.locator('#workerCardBody .wcard-cal-label').innerText(),
            await page.locator('#workerCardBody .wcard-cal-head').allInnerTexts()],
        ['נובמבר 2026', ['ו׳', 'א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳']]);
    same('and those are the days the week screen draws, in its order',
        await page.evaluate(() => { setWeekFromDate(todayStr());
            return weekDates().filter(date => parseLocalDate(date).getDay() !== 6)
                .map(date => HEBREW_DAY_LETTERS[parseLocalDate(date).getDay()]); }), cal.columns);
    // THE WEEK'S CELL, BUILT BESIDE IT. renderWeekCell is the function the week grid is
    // drawn with; for every date of the month its cell for this man is made and read -
    // absent or not, one block per site with its colour, its letter and its mark - and
    // held against the button the calendar drew for that date.
    const sideBySide = await page.evaluate(() => {
        const worker = State.worker('w_01');
        const out = [];
        for (let day = 1; day <= 30; day += 1) {
            const date = `2026-11-${String(day).padStart(2, '0')}`;
            const cell = renderWeekCell(worker, date);
            const week = { absent: cell.classList.contains('cell-absent'),
                blocks: [...cell.querySelectorAll('.cell-line')].map(line => [line.style.background,
                    line.dataset.initial || '', line.classList.contains('cell-double') ? '●'
                        : line.classList.contains('cell-extra') ? '+' : '']) };
            const mine = document.querySelector(`#workerCardBody [data-date="${date}"]`);
            const card = mine ? { absent: mine.querySelectorAll('.wcard-cal-absent').length === 1,
                blocks: [...mine.querySelectorAll('.wcard-cal-site')].map(block => {
                    const text = block.textContent;
                    const mark = /[●+]$/.test(text) ? text.slice(-1) : '';
                    return [block.style.background, mark ? text.slice(0, -1) : text, mark];
                }) } : null;
            out.push({ date, saturday: parseLocalDate(date).getDay() === 6, week, card,
                label: mine ? mine.getAttribute('aria-label') : '',
                weekLabel: cell.getAttribute('aria-label') });
        }
        return out;
    });
    same('every working day of the month is one button, and no Saturday is in the grid',
        [sideBySide.filter(day => !day.saturday && day.card).length, sideBySide.filter(day => day.saturday && day.card).length],
        [26, 0]);
    same('each one draws what the week\'s cell draws for him that day: absent, or each site in its colour with its letter and its mark',
        sideBySide.filter(day => !day.saturday).filter(day => JSON.stringify(day.card) !== JSON.stringify(day.week))
            .map(day => [day.date, day.card, day.week]), []);
    same('and is read aloud as the week\'s cell is, after the day: what is on it',
        sideBySide.filter(day => !day.saturday && (day.week.absent || day.week.blocks.length > 0))
            .filter(day => day.label.split(' · ').slice(1).join(' · ') !== day.weekLabel.split(' · ').slice(2).join(' · '))
            .map(day => [day.label, day.weekLabel]), []);
    given('his month has an absence, a doubled day, extra hours and two sites in one day',
        sideBySide.some(day => day.week.absent) && sideBySide.some(day => day.week.blocks.length === 2)
        && sideBySide.some(day => day.week.blocks.some(block => block[2] === '●'))
        && sideBySide.some(day => day.week.blocks.some(block => block[2] === '+')));
    same('a day with nothing on it says so to a screen reader, and shows only its number',
        await page.evaluate(() => { const day = document.querySelector('#workerCardBody [data-date="2026-11-11"]');
            return [day.getAttribute('aria-label'), day.innerText.trim()]; }),
        ['יום רביעי 11/11/2026 · ללא רישום', '11']);
    same('today, and only today, is marked as today',
        await page.evaluate(() => [...document.querySelectorAll('#workerCardBody [aria-current="date"]')]
            .map(node => node.dataset.date)), [TODAY]);
    same('the block in a day is painted in the colour the site has everywhere else',
        await page.evaluate(() => ['p_01', 'p_02', 'p_03'].map(id => {
            const probe = document.createElement('span');
            probe.style.background = siteColorVar(id);
            document.body.appendChild(probe);
            const want = getComputedStyle(probe).backgroundColor;
            probe.remove();
            const blocks = [...document.querySelectorAll('#workerCardBody .wcard-cal-site')]
                .filter(block => block.style.background === siteColorVar(id));
            return blocks.length > 0 && blocks.every(block => getComputedStyle(block).backgroundColor === want);
        })), [true, true, true]);
    same('under it every colour is named in words with its days, then the two totals in the sheet\'s words',
        await page.evaluate(() => [[...document.querySelectorAll('#workerCardBody .wcard-month-row')]
            .map(row => [row.querySelector('.site-name').textContent, row.querySelector('.wcard-month-days').textContent]).sort(),
        [...document.querySelectorAll('#workerCardBody .wcard-month-totals .wcard-pair')].map(pair => pair.textContent)]),
        [[['אתר דרום', '3'], ['אתר צפון', '3'], ['מגדל המרכז עם שם ארוך', '3']].sort(), ['נוכחות8', 'נעדר1']]);
    check('the marks are explained in the week screen\'s own line, and the tap in one sentence',
        text.indexOf('● = יום כפול · + = שעות נוספות · — = נעדר') !== -1
        && text.indexOf('לחיצה על יום פותחת אותו במסך היום.') !== -1);

    suite('the month steps under a finger, and the focus stays on the step');
    await page.locator('#workerCardBody .wcard-cal-step').first().tap();
    await page.waitForTimeout(150);
    same('one tap back is October, with the way home and the count headed for that month',
        [await page.locator('#workerCardBody .wcard-cal-label').innerText(),
            await page.locator('#workerCardBody .wcard-cal-home').allInnerTexts(),
            await page.evaluate(() => [...document.querySelectorAll('#workerCardBody .wcard-head')]
                .map(node => node.textContent).filter(said => said.indexOf('ימים בכל אתר') === 0))],
        ['אוקטובר 2026', ['חזרה לחודש הנוכחי'], ['ימים בכל אתראוקטובר 2026']]);
    same('October has his two days of it, and thirty-one days less five Saturdays',
        await page.evaluate(() => [document.querySelectorAll('#workerCardBody .wcard-cal-day').length,
            [...document.querySelectorAll('#workerCardBody .wcard-cal-day')].filter(day => day.querySelector('.wcard-cal-site'))
                .map(day => day.dataset.date)]), [26, ['2026-10-29', '2026-10-30']]);
    await page.locator('#workerCardBody .wcard-cal-step').first().focus();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(120);
    same('by keyboard too, and the keyboard is still on «חודש קודם» after the month was drawn again',
        [await page.locator('#workerCardBody .wcard-cal-label').innerText(),
            await page.evaluate(() => document.activeElement.textContent)], ['ספטמבר 2026', 'חודש קודם']);
    await page.locator('#workerCardBody .wcard-cal-home').focus();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(120);
    same('«חזרה לחודש הנוכחי» comes home, is gone, and leaves the keyboard on the first step',
        [await page.locator('#workerCardBody .wcard-cal-label').innerText(),
            await page.locator('#workerCardBody .wcard-cal-home').count(),
            await page.evaluate(() => document.activeElement.textContent)], ['נובמבר 2026', 0, 'חודש קודם']);
    // A snapshot from another phone under a day that has the keyboard.
    await page.locator('#workerCardBody [data-date="2026-11-12"]').focus();
    const daysAsTheyWere = await page.evaluate(() => JSON.stringify(State.schedule.days));
    await page.evaluate(() => { assignPlace(State.schedule, '2026-11-12', 'w_01', 'actual', 'p_03'); render(); });
    same('a day recorded on another phone appears in its cell, and the keyboard is still on that day',
        await page.evaluate(() => [document.activeElement.dataset.date, document.activeElement.isConnected,
            document.querySelector('#workerCardBody [data-date="2026-11-12"] .wcard-cal-site').textContent]),
        ['2026-11-12', true, 'מ']);
    // The other phone's edit was made in memory only, and is taken back whole.
    await page.evaluate(days => { State.schedule.days = JSON.parse(days); render(); }, daysAsTheyWere);
    check('and with that edit taken back the record is the record it was',
        await page.evaluate(() => JSON.stringify(State.schedule)) === record);

    suite('his two doors: a call and a chat, the seder\'s number in both');
    same('«התקשר» dials him and «וואטסאפ» opens his chat with no text - real links, followed by his own tap',
        await page.evaluate(() => [...document.querySelectorAll('#workerCardBody .wcard-contact a')].map(node =>
            [node.textContent, node.getAttribute('href'), node.getAttribute('target'), node.getAttribute('rel'),
                node.getAttribute('aria-label').replace(/[⁨⁩]/g, '')])),
        [['התקשר', 'tel:+972500000001', null, null, 'התקשר אל דוגמה אלף'],
            ['וואטסאפ', 'https://wa.me/972500000001', '_blank', 'noopener noreferrer', 'וואטסאפ אל דוגמה אלף']]);
    same('the number the seder would hand WhatsApp for him is that number',
        await page.evaluate(() => sederWaNumber(State.worker('w_01').phone)), '972500000001');
    same('side by side, 48px and more both ways, their words at 18px and more',
        await page.evaluate(() => [...document.querySelectorAll('#workerCardBody .wcard-contact a')].map(node => {
            const box = node.getBoundingClientRect();
            return [box.width >= 48 && box.height >= 48, parseFloat(getComputedStyle(node).fontSize) >= 18, Math.round(box.top)];
        }).reduce((all, one) => [all[0] && one[0], all[1] && one[1], all[2] === null || all[2] === one[2] ? one[2] : -1],
            [true, true, null]).slice(0, 2)), [true, true]);

    suite('a day of the calendar goes to that day, and writes nothing');
    await page.locator('#workerCardBody [data-date="2026-11-04"]').tap();
    await page.waitForTimeout(300);
    same('the card is gone and the day screen is on that date',
        [await cardOpen(page), await page.locator('#dayView').isVisible(), await page.locator('#rosterView').isVisible(),
            await page.evaluate(() => State.date)], [false, true, false, '2026-11-04']);
    check('the day on screen says so', (await page.locator('#dayView .day-header').innerText()).indexOf('04/11') !== -1,
        (await page.locator('#dayView .day-header').innerText()).slice(0, 80));
    check('every key on the disk holds the bytes it held, and the record is the record it was',
        await disk(page) === before && await page.evaluate(() => JSON.stringify(State.schedule)) === record);
    await page.locator('#tab-roster').click();
    await page.waitForTimeout(200);
    await opener.click();
    await page.waitForTimeout(200);

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
    same('a man with no number has no door, and a Saturday he worked is under his calendar with its mark',
        await page.evaluate(() => { openWorkerCard('w_03');
            const said = [document.querySelectorAll('#workerCardBody a').length,
                [...document.querySelectorAll('#workerCardBody .wcard-sub')].map(node => node.textContent)
                    .filter(text => text.indexOf('שבת') !== -1),
                [...document.querySelectorAll('#workerCardBody .wcard-cal-saturday')].map(node =>
                    [node.dataset.date, node.textContent, node.getAttribute('aria-label').replace(/[⁨⁩]/g, '')]),
                document.querySelector('#workerCardBody .wcard-month-totals').textContent];
            closeWorkerCard(); return said; }),
        [0, ['ימי שבת עם רישום'], [['2026-11-07', '07/11א●', 'יום שבת 07/11/2026 · אתר צפון כפול']], 'נוכחות2נעדר0']);
    same('a number the seder would not use is written out, said to be unusable in the seder\'s words, and has no door',
        await page.evaluate(() => { const worker = State.worker('w_02'); const had = worker.phone;
            worker.phone = '03-1234567'; openWorkerCard('w_02');
            const said = [document.querySelectorAll('#workerCardBody a').length,
                document.querySelector('#workerCardBody .wcard-who').textContent.replace(/[⁦-⁩]/g, '')];
            closeWorkerCard(); if (had === undefined) delete worker.phone; else worker.phone = had;
            return [said[0], said[1].indexOf('03-1234567') !== -1, said[1].indexOf('אין מספר טלפון תקין') !== -1]; }),
        [0, true, true]);
    check('none of which wrote anything', await disk(page) === before);
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
            // Every target: the frame's buttons, the days, the steps - and the two links.
            const buttons = [...content.querySelectorAll('button, a')].map(node => node.getBoundingClientRect());
            const frame = content.querySelectorAll('.modal-actions button').length;
            const fields = [...content.querySelectorAll('input, select, textarea')].length;
            const sizeOf = selector => [...content.querySelectorAll(selector)]
                .map(node => parseFloat(getComputedStyle(node).fontSize));
            const days = [...content.querySelectorAll('.wcard-cal-day')].map(node => node.getBoundingClientRect());
            return {
                page: document.documentElement.scrollWidth <= innerWidth + 1,
                sideways: content.scrollWidth <= content.clientWidth + 1,
                onGlass: box.left >= 0 && box.right <= innerWidth + 1 && box.top >= 0
                    && box.bottom <= innerHeight + 1,
                spill, fields,
                small: buttons.filter(at => at.width < 44 || at.height < 44).length,
                buttons: frame,
                targets: buttons.length,
                day: days.length ? [Math.floor(Math.min(...days.map(at => at.width))),
                    Math.floor(Math.min(...days.map(at => at.height)))] : [0, 0],
                letter: Math.min(...sizeOf('.wcard-cal-site'), ...sizeOf('.wcard-cal-absent')),
                // What this part added, and nothing of it under 16px.
                added: [...content.querySelectorAll('.wcard-contact *, .wcard-contact, .wcard-cal *, .wcard-month-totals *, '
                    + '.wcard-month .wcard-site *, .wcard-month-days, .wcard-bad-phone')]
                    .filter(node => node.children.length === 0 && node.textContent.trim() !== ''
                        && parseFloat(getComputedStyle(node).fontSize) < 16).map(node => node.className),
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
        check(`${tag}: and nothing the calendar, the doors or the totals added is under 16px`, top.added.length === 0,
            JSON.stringify(top.added));
        check(`${tag}: a day of the calendar is 44px both ways, its letter 18px and more`,
            top.day[0] >= 44 && top.day[1] >= 44 && top.letter >= 18, JSON.stringify([top.day, top.letter]));
        check(`${tag}: every target on the card - the days, the steps, the two doors - is 44px both ways`,
            top.small === 0 && top.targets === 3 + 2 + 2 + 26, JSON.stringify([top.small, top.targets]));
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
            await glass.evaluate(() => document.querySelector('#workerCardBody .wcard-cal').scrollIntoView({ block: 'start' }));
            await glass.screenshot({ path: `${process.env.WORKERCARD_SCREENSHOT_DIR}/card-${width}x${height}-${scheme}-calendar.jpg`,
                type: 'jpeg', quality: 82 });
            await glass.evaluate(() => workerCardStepMonth(-1));
            await glass.evaluate(() => document.querySelector('#workerCardBody .wcard-cal').scrollIntoView({ block: 'start' }));
            await glass.screenshot({ path: `${process.env.WORKERCARD_SCREENSHOT_DIR}/card-${width}x${height}-${scheme}-calendar-october.jpg`,
                type: 'jpeg', quality: 82 });
            await glass.evaluate(() => { openWorkerCard('w_03');
                document.querySelector('#workerCardBody .wcard-cal').scrollIntoView({ block: 'start' }); });
            await glass.screenshot({ path: `${process.env.WORKERCARD_SCREENSHOT_DIR}/card-${width}x${height}-${scheme}-saturday.jpg`,
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
