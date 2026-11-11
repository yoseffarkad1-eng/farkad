// «חיפוש עובד» in a real Chromium.
//
//   node tests/find.browser.mjs
//
// tests/find.test.mjs holds who is found and where the doors go, on devices in Node. What
// it cannot hold is the glass: that the way in is ONE worded button at the foot of the
// day, beside «בדיקת היום» in its row and adding no height to the day, with the header and
// the dock exactly as they were; that the
// dialog takes the keyboard in its field at once and the field is 16px and more, so iOS
// does not zoom; that the list narrows as letters are typed; that with a keyboard up
// (pushed through js/ui/bars.js's own seam - headless browsers open none) the field and
// the rows stay above the keys and the last row can be reached; that each door lands on
// the screen it names - the card, the sheet of the day ON SCREEN, the advances - and the
// focus comes back to the way in; that it closes like every dialog; that it fits a
// 375x667 phone and a 440x956 one, light and dark, and at doubled text, with no sideways
// scroll and every target 44px both ways; and that the phone's disk is byte for byte
// what it was. NOT a real phone: emulated touch and Chromium's layout.

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
    await page.waitForFunction(() => typeof openFind === 'function' && typeof State === 'object');
    // Synthetic names throughout: fourteen men on the daily list - enough that the list is
    // longer than any phone here - one with a long name, and two turned off.
    await page.evaluate(today => {
        todayStr = () => today;
        const letters = ['אלף', 'בית', 'גימל', 'דלת', 'הא', 'וו', 'זין', 'חית', 'טית', 'יוד', 'כף', 'למד'];
        State.schedule.workers = letters.map((letter, at) => ({ id: `w_${String(at + 1).padStart(2, '0')}`,
            name: `דוגמה ${letter}`, active: true, dailyRate: 400 + at, phone: `050-00000${String(at + 1).padStart(2, '0')}` }))
            .concat([
                { id: 'w_13', name: 'דוגמה עם שם ארוך במיוחד לבדיקה של שורה', active: true },
                { id: 'w_14', name: 'אחר לגמרי', active: true, phone: '052-884-1930' },
                { id: 'w_15', name: 'דוגמה כבוי', active: false, dailyRate: 380 },
                { id: 'w_16', name: 'ישן מאוד', active: false }]);
        State.schedule.places = [
            { id: 'p_01', name: 'אתר צפון', active: true },
            { id: 'p_02', name: 'אתר דרום', active: true }];
        State.commitRoster();
        State.commit(assignPlace(State.schedule, today, 'w_01', 'actual', 'p_01'));
        State.commit(assignPlace(State.schedule, today, 'w_02', 'actual', 'p_02'));
        State.commit(addAdvance(State.schedule, 'w_02', '2026-11-03', 700, ''));
        const plan = planCarryMigration(State.schedule);
        if (plan.needed) State.commit(recordCarryApproval(State.schedule, plan, '2026-11-01T09:00:00.000Z', 'd_test'));
        State.date = today;
        showView('day');
    }, TODAY);
    await page.waitForTimeout(250);
    return page;
}

const disk = page => page.evaluate(() => JSON.stringify(Object.keys(localStorage).sort()
    .map(key => [key, localStorage.getItem(key)])));
const isOpen = page => page.evaluate(() => document.getElementById('findModal').style.display === 'flex');
const rowIds = page => page.evaluate(() => [...document.querySelectorAll('#findList .find-row')]
    .map(row => row.dataset.workerId));
const bare = text => String(text).replace(/[⁦-⁩‎]/g, '');

try {
    const page = await phone(390, 844, 'light');
    const before = await disk(page);
    const record = await page.evaluate(() => JSON.stringify(State.schedule));

    suite('the way in is one button at the foot of the day, and nothing measured moved');
    same('the day has one button for it, worded',
        [await page.locator('#findEntry').count(), await page.locator('#findEntry').innerText(),
            await page.locator('#findEntry').getAttribute('aria-haspopup')], [1, 'חיפוש עובד', 'dialog']);
    same('the dock still has its two buttons and no more', await page.locator('.day-actions button').count(), 2);
    same('the header has no new control: the same ones, with and without the finder\'s file',
        await page.evaluate(() => [...document.querySelectorAll('#dayView .day-header button')]
            .filter(node => node.checkVisibility()).map(node => node.className)
            .filter(name => /find/.test(name)).length), 0);
    const place = await page.evaluate(() => {
        const entry = document.getElementById('findEntry');
        const view = document.getElementById('dayView');
        const row = entry.closest('.daycheck-row');
        const tall = row.getBoundingClientRect().height;
        entry.style.display = 'none';
        const without = row.getBoundingClientRect().height;
        entry.style.display = '';
        window.scrollTo(0, document.documentElement.scrollHeight);
        const box = entry.getBoundingClientRect();
        const check = document.getElementById('dayCheckEntry').getBoundingClientRect();
        const dock = document.querySelector('.day-actions').getBoundingClientRect();
        const trays = [...view.querySelectorAll('.tray')].map(tray => tray.getBoundingClientRect().bottom);
        return { order: [...row.children].map(node => node.id), tall, without,
            next: Math.round(box.top) === Math.round(check.top) && box.left >= check.right,
            last: view.lastElementChild === row,
            underTrays: trays.every(bottom => bottom <= box.top + 1), aboveCheck: true,
            aboveDock: check.bottom <= dock.top + 1, w: box.width, h: box.height,
            font: parseFloat(getComputedStyle(entry).fontSize),
            sideways: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1 };
    });
    same('it is first in the row «בדיקת היום» stands in - on its right, level with it - and that row is still the last thing in the day',
        [place.order, place.next, place.last], [['findEntry', 'dayCheckEntry'], true, true]);
    same('the foot of the day is not a pixel taller for it', place.tall, place.without);
    check('under the trays, above the dock, 48px high, 16px, and the day does not scroll sideways',
        place.underTrays && place.aboveDock && place.h >= 48 && place.w >= 120 && place.font >= 16
        && !place.sideways, JSON.stringify(place));
    await page.evaluate(() => setDayMode('workers'));
    await page.waitForTimeout(150);
    same('it is there in the other view of the day too, in the same place',
        await page.evaluate(() => [...document.getElementById('dayView').lastElementChild.children].map(node => node.id)),
        ['findEntry', 'dayCheckEntry']);
    await page.evaluate(() => setDayMode('sites'));
    await page.waitForTimeout(150);
    same('no other screen offers it', await page.evaluate(() => { const seen = [];
        ['week', 'roster', 'advances', 'reports'].forEach(view => { showView(view);
            if (document.getElementById('findEntry') && document.getElementById('findEntry').offsetParent !== null) seen.push(view); });
        showView('day'); return seen; }), []);
    check('none of which wrote a preference: the disk is as it was but for the day\'s own view choice',
        await page.evaluate(before => {
            const now = Object.keys(localStorage).sort().filter(key => key !== 'farkadDayMode')
                .map(key => [key, localStorage.getItem(key)]);
            return JSON.stringify(now) === JSON.stringify(JSON.parse(before).filter(pair => pair[0] !== 'farkadDayMode'));
        }, before));
    const disk0 = await disk(page);

    suite('it opens as one of the app\'s dialogs, with the keyboard in its field');
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.locator('#findEntry').tap();
    await page.waitForTimeout(250);
    check('a tap opens it', await isOpen(page));
    same('headed by the crew screen\'s words, the field holding the keyboard, empty, and named by the heading',
        await page.evaluate(() => [document.getElementById('findTitle').textContent, document.activeElement.id,
            document.getElementById('findInput').value, document.getElementById('findInput').getAttribute('aria-labelledby'),
            document.getElementById('findInput').placeholder]),
        ['חיפוש עובד', 'findInput', '', 'findTitle', 'חיפוש לפי שם, טלפון או זהות']);
    check('the field is 16px or more - iOS does not zoom the page on it - and 48px high',
        await page.evaluate(() => { const field = document.getElementById('findInput');
            return parseFloat(getComputedStyle(field).fontSize) >= 16 && field.getBoundingClientRect().height >= 48; }));
    same('before a letter is typed every man is there: the daily list in its order, then the two turned off under their heading',
        [await rowIds(page), await page.locator('#findList .find-group').allInnerTexts(),
            await page.locator('#findStatus').isVisible(), await page.locator('#findClear').isVisible()],
        [['w_01', 'w_02', 'w_03', 'w_04', 'w_05', 'w_06', 'w_07', 'w_08', 'w_09', 'w_10', 'w_11', 'w_12', 'w_13', 'w_14',
            'w_15', 'w_16'], ['עובדים כבויים (2)'], false, false]);
    same('a man on the daily list has three doors by their words; a man turned off has two and the badge',
        await page.evaluate(() => ['w_01', 'w_15'].map(id => { const row = document.querySelector(`#findList [data-worker-id="${id}"]`);
            return [[...row.querySelectorAll('.find-door')].map(node => node.textContent),
                [...row.querySelectorAll('.badge')].map(node => node.textContent)]; })),
        [[['כרטיס עובד', 'שיבוץ להיום', 'מקדמות'], []], [['כרטיס עובד', 'מקדמות'], ['לא פעיל']]]);

    suite('results as it is typed');
    await page.keyboard.type('דוגמה ב');
    await page.waitForTimeout(120);
    same('typed on the keyboard, letter by letter, the list narrows: any part of a name counts',
        [await rowIds(page), await page.locator('#findStatus').innerText(), await page.locator('#findClear').isVisible()],
        [['w_02', 'w_13', 'w_15'], 'נמצאו 3 עובדים', true]);
    await page.keyboard.type('ית');
    await page.waitForTimeout(120);
    same('and two letters more leave him alone',
        [await rowIds(page), await page.locator('#findStatus').innerText()], [['w_02'], 'נמצאו 1 עובדים']);
    await page.locator('#findInput').fill('כבוי');
    same('a man turned off is found, under his own heading', [await rowIds(page),
        await page.locator('#findList .find-group').allInnerTexts()], [['w_15'], ['עובדים כבויים (1)']]);
    await page.locator('#findInput').fill('לגמרי אחר');
    same('the words in any order', await rowIds(page), ['w_14']);
    await page.locator('#findInput').fill('+972 52 884');
    same('a phone number however it is written', await rowIds(page), ['w_14']);
    await page.locator('#findInput').fill('זזז');
    same('nobody: the crew screen\'s sentence', [await rowIds(page), await page.locator('#findList').innerText()],
        [[], 'לא נמצאו עובדים. נסה שם או מספר אחר.']);
    await page.locator('#findClear').tap();
    same('«נקה» empties the field, brings everyone back and leaves the keyboard in the field',
        [await page.locator('#findInput').inputValue(), (await rowIds(page)).length,
            await page.evaluate(() => document.activeElement.id)], ['', 16, 'findInput']);
    // A name is text.
    await page.evaluate(() => { State.schedule.workers.push({ id: 'w_17', name: '<img src=x onerror=window.__hit=1> B7', active: true }); render(); });
    await page.locator('#findInput').fill('b7');
    same('a name that looks like markup is drawn as the text it is, and found',
        [await rowIds(page), await page.locator('#findList .find-name').allInnerTexts(),
            await page.evaluate(() => [document.querySelectorAll('#findList img').length, window.__hit === undefined])],
        [['w_17'], ['<img src=x onerror=window.__hit=1> B7'], [0, true]]);
    same('the record changing under it redrew the list and kept the field and the keyboard',
        await page.evaluate(() => [document.getElementById('findInput').value, document.activeElement.id]), ['b7', 'findInput']);
    await page.evaluate(() => { State.schedule.workers = State.schedule.workers.filter(worker => worker.id !== 'w_17'); render(); });
    check('and with him gone again the record is the record it was',
        await page.evaluate(() => JSON.stringify(State.schedule)) === record);
    await page.locator('#findInput').fill('');

    suite('with the keyboard up, the field and the rows stay above the keys');
    // js/ui/bars.js's own seam: what it does when the visual viewport loses a keyboard's height.
    await page.evaluate(() => applyKeyboardInset(300));
    const kb = await page.evaluate(() => {
        const line = innerHeight - 300;
        const box = node => node.getBoundingClientRect();
        const content = box(document.querySelector('#findModal .find-content'));
        const field = box(document.getElementById('findInput'));
        const list = document.getElementById('findList');
        const listBox = box(list);
        list.scrollTop = 0;
        const firstRow = box(list.querySelector('.find-row'));
        list.scrollTop = list.scrollHeight;
        const doors = [...list.querySelectorAll('.find-door')];
        const lastDoor = box(doors[doors.length - 1]);
        return { line, content: [Math.round(content.top), Math.round(content.bottom)],
            field: [Math.round(field.top), Math.round(field.bottom)],
            list: [Math.round(listBox.top), Math.round(listBox.bottom)], room: Math.round(listBox.height),
            row: Math.round(firstRow.height), scrolls: list.scrollHeight > list.clientHeight + 1,
            lastDoor: Math.round(lastDoor.bottom), close: Math.round(box(document.getElementById('findClose')).bottom) };
    });
    check('the dialog ends above the keys', kb.content[0] >= 0 && kb.content[1] <= kb.line, JSON.stringify(kb));
    check('the field and «סגור» are in sight above them', kb.field[0] >= 0 && kb.field[1] <= kb.line && kb.close <= kb.line,
        JSON.stringify(kb));
    check('the list has room for a whole man and his doors, and scrolls inside itself',
        kb.list[1] <= kb.line && kb.room >= kb.row && kb.scrolls, JSON.stringify(kb));
    check('the last man\'s doors can be brought above the keys', kb.lastDoor <= kb.line, JSON.stringify(kb));
    await page.evaluate(() => applyKeyboardInset(0));
    same('and with the keys gone it takes the screen back, never past it',
        await page.evaluate(() => { const box = document.querySelector('#findModal .find-content').getBoundingClientRect();
            return [box.top >= 0, box.bottom <= innerHeight, box.height > innerHeight - 340]; }), [true, true, true]);

    suite('it closes like every dialog, and the focus goes back to the way in');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
    same('Escape closes it, with the focus on «חיפוש עובד» and nothing kept of what was typed',
        [await isOpen(page), await page.evaluate(() => document.activeElement.id), await page.locator('#findInput').inputValue()],
        [false, 'findEntry', '']);
    await page.locator('#findEntry').focus();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);
    given('Enter on the way in opens it', await isOpen(page));
    const walked = [];
    for (let step = 0; step < 4; step += 1) {
        await page.keyboard.press('Tab');
        walked.push(await page.evaluate(() => document.activeElement.textContent));
    }
    same('Tab goes from the field down the first man\'s doors', walked, ['כרטיס עובד', 'שיבוץ להיום', 'מקדמות', 'כרטיס עובד']);
    await page.locator('#findInput').focus();
    await page.keyboard.press('Shift+Tab');
    same('Shift+Tab from the field reaches «סגור», and once more comes round to the last door - never the page behind',
        [await page.evaluate(() => document.activeElement.id), await (async () => { await page.keyboard.press('Shift+Tab');
            return page.evaluate(() => [document.activeElement.textContent,
                document.getElementById('findModal').contains(document.activeElement)]); })()],
        ['findClose', ['מקדמות', true]]);
    await page.mouse.click(3, 420);
    await page.waitForTimeout(250);
    check('a tap on the backdrop closes it', !(await isOpen(page)));
    await page.locator('#findEntry').tap();
    await page.waitForTimeout(200);
    await page.locator('#findClose').tap();
    await page.waitForTimeout(200);
    check('and so does its own «סגור»', !(await isOpen(page)));
    check('opening, typing and closing wrote nothing', await disk(page) === disk0
        && await page.evaluate(() => JSON.stringify(State.schedule)) === record);

    suite('the three doors');
    const open = async text => { await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        await page.locator('#findEntry').tap(); await page.waitForTimeout(200);
        if (text) await page.locator('#findInput').fill(text); };
    await open('דוגמה ב');
    await page.locator('#findList [data-worker-id="w_02"] [data-find-door="card"]').tap();
    await page.waitForTimeout(250);
    same('«כרטיס עובד» closes the finder and opens his card over the day, entered at its heading',
        [await isOpen(page), await page.evaluate(() => document.getElementById('workerCardModal').style.display),
            await page.locator('#workerCardTitle').innerText(), await page.evaluate(() => document.activeElement.id),
            await page.locator('#dayView').isVisible()],
        [false, 'flex', 'כרטיס עובד · דוגמה בית', 'workerCardTitle', true]);
    await page.keyboard.press('Tab');
    check('Tab stays inside the card', await page.evaluate(() =>
        document.getElementById('workerCardModal').contains(document.activeElement)));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
    same('Escape closes the card and the focus is back on the way in',
        [await page.evaluate(() => document.getElementById('workerCardModal').style.display),
            await page.evaluate(() => document.activeElement.id)], ['none', 'findEntry']);

    await open('דוגמה ג');
    same('the door to the day says today while today is on the screen',
        await page.locator('#findList [data-worker-id="w_03"] [data-find-door="sheet"]').innerText(), 'שיבוץ להיום');
    await page.locator('#findList [data-worker-id="w_03"] [data-find-door="sheet"]').tap();
    await page.waitForTimeout(300);
    same('it closes the finder and opens the day\'s own sheet on him, on the day that was on screen',
        [await isOpen(page), await page.evaluate(() => document.getElementById('assignSheet').style.display),
            await page.evaluate(() => sheetWorkerId), await page.evaluate(() => State.date),
            bare(await page.locator('#assignSheet').innerText()).indexOf('דוגמה גימל') !== -1],
        [false, 'flex', 'w_03', TODAY, true]);
    await page.evaluate(() => closeAssignSheet());
    await page.waitForTimeout(150);
    check('looking at his sheet and shutting it wrote nothing', await disk(page) === disk0);

    // ANOTHER DAY ON SCREEN: the evening before, building tomorrow.
    await page.evaluate(() => { State.date = '2026-11-12'; render(); });
    await page.waitForTimeout(150);
    await open('דוגמה ג');
    same('with another day on the screen the door names that day',
        [await page.locator('#findList [data-worker-id="w_03"] [data-find-door="sheet"]').innerText(),
            bare(await page.locator('#findList [data-worker-id="w_03"] [data-find-door="sheet"]').getAttribute('aria-label'))],
        ['שיבוץ ליום חמישי 12/11', 'שיבוץ ליום חמישי 12/11 · דוגמה גימל']);
    await page.locator('#findList [data-worker-id="w_03"] [data-find-door="sheet"]').tap();
    await page.waitForTimeout(300);
    same('and opens his sheet on that day - the finder never moves the date',
        [await page.evaluate(() => document.getElementById('assignSheet').style.display),
            await page.evaluate(() => sheetWorkerId), await page.evaluate(() => State.date)], ['flex', 'w_03', '2026-11-12']);
    // The sheet is the day's real one: a site chosen in it is recorded for THAT day.
    const dayBefore = await page.evaluate(() => JSON.stringify(State.schedule.days));
    await page.evaluate(() => closeAssignSheet());
    await page.evaluate(() => { State.date = todayStr(); render(); });
    await page.waitForTimeout(150);
    given('nothing was recorded by opening it', await page.evaluate(() => JSON.stringify(State.schedule.days)) === dayBefore);

    await open('דוגמה ב');
    await page.locator('#findList [data-worker-id="w_02"] [data-find-door="advances"]').tap();
    await page.waitForTimeout(300);
    same('«מקדמות» closes the finder and lands on his advances',
        [await isOpen(page), await page.locator('#advancesView').isVisible(), await page.locator('#advancesView h2').innerText()],
        [false, true, 'מקדמות · דוגמה בית']);
    await page.locator('#tab-day').click();
    await page.waitForTimeout(200);
    await open('כבוי');
    await page.locator('#findList [data-worker-id="w_15"] [data-find-door="card"]').tap();
    await page.waitForTimeout(250);
    same('a man turned off is reached too: his card says he is not active',
        [await page.locator('#workerCardTitle').innerText(), await page.locator('#workerCardBody .badge').first().innerText()],
        ['כרטיס עובד · דוגמה כבוי', 'לא פעיל']);
    // From the card, a day of his calendar - the whole way round without the crew screen.
    await page.evaluate(() => { openWorkerCard('w_01'); });
    await page.locator('#workerCardBody [data-date="2026-11-05"]').tap();
    await page.waitForTimeout(300);
    same('and from a card opened here, a day of the calendar lands on that day of the day screen',
        [await page.evaluate(() => document.getElementById('workerCardModal').style.display),
            await page.locator('#dayView').isVisible(), await page.evaluate(() => State.date)], ['none', true, '2026-11-05']);
    await page.evaluate(() => { State.date = todayStr(); render(); });

    suite('it wrote nothing');
    check('every key on the disk holds the bytes it held before the first search', await disk(page) === disk0);
    check('and the record in memory is the record it was',
        await page.evaluate(() => JSON.stringify(State.schedule)) === record);
    same('no key of its own exists', await page.evaluate(() => Object.keys(localStorage).filter(key => /find/i.test(key))), []);
    await page.context().close();

    // ------------------------------------------------------------ the phones, and big text
    for (const [width, height, scheme, scale] of [[375, 667, 'light', 1], [375, 667, 'dark', 1], [440, 956, 'dark', 1],
        [440, 956, 'light', 1], [375, 667, 'dark', 2], [320, 568, 'light', 1]]) {
        const tag = `${width}x${height} ${scheme}${scale === 2 ? ' 200% text' : ''}`;
        suite(`rectangles - ${tag}`);
        const glass = await phone(width, height, scheme);
        const doubleText = scope => glass.evaluate(sel => {
            const sizes = [...document.querySelectorAll(sel)].map(node => [node, parseFloat(getComputedStyle(node).fontSize)]);
            sizes.forEach(([node, size]) => node.style.setProperty('font-size', `${size * 2}px`, 'important'));
        }, scope);
        if (scale === 2) await doubleText('.daycheck-row *');
        const way = await glass.evaluate(() => {
            window.scrollTo(0, document.documentElement.scrollHeight);
            const entry = document.getElementById('findEntry');
            const box = entry.getBoundingClientRect();
            const dock = document.querySelector('.day-actions').getBoundingClientRect();
            return { w: box.width, h: box.height, inside: box.left >= 0 && box.right <= innerWidth + 1,
                cut: entry.scrollWidth > entry.clientWidth + 1, aboveDock: box.bottom <= dock.top + 1,
                font: parseFloat(getComputedStyle(entry).fontSize),
                sideways: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1 };
        });
        check(`${tag}: the way in is 48px high, 16px, whole, above the dock, and the day does not scroll sideways`,
            way.h >= 48 && way.w >= 44 && way.font >= 16 && way.inside && !way.cut && way.aboveDock && !way.sideways,
            JSON.stringify(way));

        await glass.locator('#findEntry').tap();
        await glass.waitForTimeout(250);
        if (scale === 2) await doubleText('#findModal *');
        const measure = () => glass.evaluate(() => {
            const content = document.querySelector('#findModal .find-content');
            const box = content.getBoundingClientRect();
            const list = document.getElementById('findList');
            const spill = [...content.querySelectorAll('*')].filter(node => {
                const at = node.getBoundingClientRect();
                return at.width > 0 && (at.left < box.left - 1 || at.right > box.right + 1);
            }).map(node => node.className || node.tagName);
            const targets = [...content.querySelectorAll('button:not([hidden]), input')].map(node => node.getBoundingClientRect())
                .filter(at => at.width > 0);
            const doors = [...content.querySelectorAll('.find-door')].map(node => node.getBoundingClientRect());
            const size = selector => Math.min(...[...content.querySelectorAll(selector)]
                .map(node => parseFloat(getComputedStyle(node).fontSize)));
            return { page: document.documentElement.scrollWidth <= innerWidth + 1,
                sideways: content.scrollWidth <= content.clientWidth + 1 && list.scrollWidth <= list.clientWidth + 1,
                onGlass: box.left >= 0 && box.right <= innerWidth + 1 && box.top >= 0 && box.bottom <= innerHeight + 1,
                spill, small: targets.filter(at => at.width < 44 || at.height < 44).length, targets: targets.length,
                door: Math.floor(Math.min(...doors.map(at => at.height))), field: size('#findInput'), name: size('.find-name'),
                rtl: getComputedStyle(content).direction,
                tiny: [...content.querySelectorAll('*')].filter(node => node.children.length === 0
                    && node.textContent.trim() !== '' && node.offsetParent !== null
                    && parseFloat(getComputedStyle(node).fontSize) < 16).map(node => node.className || node.tagName),
                cut: [...content.querySelectorAll('.find-door, .find-name, #findClose')]
                    .filter(node => node.scrollWidth > node.clientWidth + 1).length };
        });
        const top = await measure();
        check(`${tag}: the dialog is wholly on the glass, right to left, and nothing scrolls sideways`,
            top.onGlass && top.page && top.sideways && top.rtl === 'rtl', JSON.stringify(top));
        check(`${tag}: nothing in it reaches past its own edge or is cut`, top.spill.length === 0 && top.cut === 0,
            JSON.stringify([top.spill.slice(0, 5), top.cut]));
        check(`${tag}: every target is 44px both ways, a door 48px high`, top.small === 0 && top.targets > 40 && top.door >= 48,
            JSON.stringify([top.small, top.targets, top.door]));
        check(`${tag}: the field is 16px or more, a name 18px or more, and no text on it is under 16px`,
            top.field >= 16 && top.name >= 18 && top.tiny.length === 0, JSON.stringify([top.field, top.name, top.tiny.slice(0, 5)]));
        // The keys up, on this phone.
        await glass.evaluate(() => applyKeyboardInset(Math.round(innerHeight * 0.4)));
        const keys = await glass.evaluate(() => {
            const line = innerHeight - Math.round(innerHeight * 0.4);
            const content = document.querySelector('#findModal .find-content').getBoundingClientRect();
            const field = document.getElementById('findInput').getBoundingClientRect();
            const list = document.getElementById('findList');
            list.scrollTop = list.scrollHeight;
            const doors = [...list.querySelectorAll('.find-door')];
            return { line, bottom: Math.round(content.bottom), field: Math.round(field.bottom),
                room: Math.round(list.getBoundingClientRect().height),
                last: Math.round(doors[doors.length - 1].getBoundingClientRect().bottom) };
        });
        check(`${tag}: with the keys up the dialog, its field and the last man's doors are all above them`,
            keys.bottom <= keys.line && keys.field <= keys.line && keys.last <= keys.line
            && (scale === 2 || keys.room >= 96), JSON.stringify(keys));
        await glass.evaluate(() => applyKeyboardInset(0));
        if (process.env.FIND_SCREENSHOT_DIR && scale === 1) {
            const shot = name => glass.screenshot({ path: `${process.env.FIND_SCREENSHOT_DIR}/find-${width}x${height}-${scheme}-${name}.jpg`,
                type: 'jpeg', quality: 82 });
            await glass.evaluate(() => { document.getElementById('findList').scrollTop = 0; });
            await shot('open');
            await glass.locator('#findInput').fill('דוגמה ב');
            await shot('typed');
            await glass.locator('#findInput').fill('כבוי');
            await shot('turned-off');
            await glass.locator('#findInput').fill('זזז');
            await shot('nobody');
            await glass.evaluate(() => { closeFind(); State.date = '2026-11-12'; render(); });
            await glass.evaluate(() => { openFind(); });
            await glass.waitForTimeout(400);
            await shot('another-day');
            await glass.evaluate(() => { closeFind(); State.date = todayStr(); render();
                window.scrollTo(0, document.documentElement.scrollHeight); });
            await glass.waitForTimeout(200);
            await shot('day-foot');
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
