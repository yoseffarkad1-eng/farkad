// «בדיקת היום» in a real Chromium: the one button at the foot of the day, the dialog, what
// it says about a seeded evening, where a name and a site take the person, and the
// rectangles - at 375x667 and 440x956, dark and light, and at doubled text.
//
//   node tests/daycheck.browser.mjs
//   DAYCHECK_SHOTS=<directory> node tests/daycheck.browser.mjs    also writes three JPEGs
//
// What each rule says on which record is measured in tests/daycheck.test.mjs, in Node, on
// records written by hand. This is the part only a page can answer: that there is ONE way
// in and it crowds nothing that was measured before it; that the dialog is one of the
// app's own (entered at its heading, Escape, the Tab trap, the focus given back); that a
// name opens the sheet the name already opens on the day and a site is scrolled to; that
// a name is text and never markup; and that after all of it every key on the disk holds
// the bytes it held.
//
// Chromium only. Nothing here is an iPhone or a Galaxy.

import { chromium } from 'playwright';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { serve } from './serve.mjs';
import { launchLocalBrowser } from './network-guard.mjs';
import { verifyServedAssets, expectedShaFor } from './treecheck.mjs';
import { suite, check, same, given, report } from './runner.mjs';
import { censusOnly } from './census.mjs';

const root = new URL('..', import.meta.url).pathname;
const server = await serve(root);
const served = await verifyServedAssets(server.url, root, expectedShaFor(root));
check('the origin served this commit, byte for byte', served.ok,
    `${served.checked} assets; ${(served.wrong || []).slice(0, 3).join(' | ')}`);
const browser = await launchLocalBrowser(chromium, { executablePath: process.env.CHROME_PATH });
const SHOTS = process.env.DAYCHECK_SHOTS || '';
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const THU = '2026-11-05';
const SUN = '2026-11-08';
const MON = '2026-11-09';

const FSI = '⁨';
const PDI = '⁩';
const named = name => `${FSI}${name}${PDI}`;

// The pinned words - proposed, kept in one block in js/ui/daycheck.js.
const ENTRY = 'בדיקת היום';
const TITLE = 'בדיקת היום';
const CONTEXT = 'יום ראשון 08/11/2026 · בהשוואה ליום חמישי 05/11';
const LEAD = 'הבדיקה רק מראה מה כדאי לבדוק. היא לא משנה ולא שומרת דבר.';
const CLEAN = '✓ לא נמצא דבר שנראה שנשכח.';
const HEAD_CHECK = 'כדאי לבדוק';
const HEAD_INFO = 'לידיעה';
const CLOSE = 'סגור';
const HOSTILE = '<img src=x onerror="window.__pwned=1">';

const WORKERS = [
    { id: 'w_01', name: 'אחמד', active: true, dailyRate: 400, hourlyRate: 50 },
    { id: 'w_02', name: 'מוחמד עבד אל רחמן', active: true, dailyRate: 400, hourlyRate: 50 },
    { id: 'w_03', name: 'יוסי', active: true, dailyRate: 400, hourlyRate: 50 },
    { id: 'w_04', name: 'סמיר', active: true, dailyRate: 400, hourlyRate: 50 },
    { id: 'w_05', name: 'עלי', active: true, dailyRate: 400, hourlyRate: 50 },
    { id: 'w_06', name: 'Dan Levi', active: true, dailyRate: 0, hourlyRate: 0 },
    { id: 'w_07', name: 'ח\'אלד', active: false, dailyRate: 400, hourlyRate: 50 },
    { id: 'w_08', name: HOSTILE, active: true, dailyRate: 400, hourlyRate: 50 },
    { id: 'w_09', name: 'נביל', active: true, dailyRate: 400, hourlyRate: 50 },
    { id: 'w_10', name: 'ראמי', active: true, dailyRate: 400, hourlyRate: 50 }
];
const PLACES = [
    { id: 'p_01', name: 'הרצליה', active: true },
    { id: 'p_02', name: 'חיפה', active: true },
    { id: 'p_03', name: 'פרדסיה', active: true },
    { id: 'p_04', name: 'נתניה', active: true },
    { id: 'p_05', name: 'רעננה - מגדל המשרדים החדש', active: true },
    { id: 'p_06', name: 'כפר סבא', active: true },
    { id: 'p_07', name: 'Rothschild 12', active: true },
    { id: 'p_08', name: 'אשדוד', active: true }
];

// THE EVENING. Thursday: אחמד and מוחמד at הרצליה, יוסי and סמיר at חיפה, the man with the
// hostile name at אשדוד (the last card on the day), ח'אלד (archived) at חיפה; Rima 3 at
// הרצליה, 2 at חיפה and 4 at אשדוד.
// Sunday, the day on screen and today: יוסי at חיפה with «שעות נוספות» and no hours; Dan
// Levi (no daily rate) and עלי (a double day) at פרדסיה; Rima 2 at חיפה. Nothing else.
// So the check has, in this order:
//   הרצליה empty, אחמד and מוחמד with no record;  אשדוד empty, the hostile name;
//   סמיר not recorded;  Rima missing at הרצליה and אשדוד;  יוסי's hours;  Dan Levi's rate;
//   and for information עלי's double day.
// `mode` 'clean' answers all of it instead; 'info' leaves only the double day.
async function open(width, height, scheme = 'dark', mode = 'findings', device = {}) {
    const context = await browser.newContext({ viewport: { width, height }, colorScheme: scheme, ...device });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${server.url}/index.html`, { waitUntil: 'load' });
    await page.waitForTimeout(350);
    await page.evaluate(([workers, places, thu, sun, mode]) => {
        todayStr = () => sun;
        State.schedule.workers = workers;
        State.schedule.places = places;
        const work = (date, id, place, rate, hours) => assignPlace(State.schedule, date, id, 'actual', place, rate, hours);
        work(thu, 'w_01', 'p_01');
        work(thu, 'w_02', 'p_01');
        work(thu, 'w_03', 'p_02');
        work(thu, 'w_04', 'p_02');
        work(thu, 'w_07', 'p_02');
        work(thu, 'w_08', 'p_08');
        setRimaCount(State.schedule, thu, 'p_01', 3);
        setRimaCount(State.schedule, thu, 'p_02', 2);
        setRimaCount(State.schedule, thu, 'p_08', 4);
        if (mode === 'findings') {
            work(sun, 'w_03', 'p_02', 'extra');
            work(sun, 'w_06', 'p_03');
            work(sun, 'w_05', 'p_03', 'double');
            setRimaCount(State.schedule, sun, 'p_02', 2);
        } else {
            work(sun, 'w_01', 'p_01');
            work(sun, 'w_02', 'p_01');
            work(sun, 'w_03', 'p_02');
            work(sun, 'w_08', 'p_08');
            markAbsent(State.schedule, sun, 'w_04', 'actual');
            if (mode === 'info') work(sun, 'w_05', 'p_03', 'double');
            setRimaCount(State.schedule, sun, 'p_01', 3);
            setRimaCount(State.schedule, sun, 'p_02', 2);
            setRimaCount(State.schedule, sun, 'p_08', 4);
        }
        State.save();
        State.date = sun;
        showView('day');
        render();
    }, [WORKERS, PLACES, THU, SUN, mode]);
    await page.waitForTimeout(250);
    return { page, errors, context };
}

const disk = page => page.evaluate(() => {
    const out = {};
    // Without the service worker's census of open builds (tests/census.mjs says why).
    Object.keys(localStorage).sort().filter(key => key !== 'farkad:openBuilds')
        .forEach(key => { out[key] = localStorage.getItem(key); });
    return JSON.stringify(out);
});
const entryOf = page => page.locator('#dayView').getByRole('button', { name: ENTRY, exact: true });
const dialog = page => page.locator('#dayCheckModal');
const shown = page => page.evaluate(() => document.getElementById('dayCheckModal').style.display === 'flex');
async function openCheck(page) {
    await entryOf(page).scrollIntoViewIfNeeded();
    await entryOf(page).click();
    await page.waitForTimeout(200);
}
// What the dialog says, as it is drawn: each group's heading, and under it each finding's
// sentence and its chips, with the bidi isolates left in.
const reading = page => page.evaluate(() => ({
    title: document.getElementById('dayCheckTitle').textContent,
    context: document.getElementById('dayCheckContext').textContent,
    lead: document.getElementById('dayCheckLead').textContent,
    close: document.getElementById('dayCheckClose').textContent,
    clean: [...document.querySelectorAll('#dayCheckList .daycheck-clean')].map(node => node.textContent),
    groups: [...document.querySelectorAll('#dayCheckList .daycheck-group')].map(group => ({
        head: group.querySelector('.daycheck-head').textContent,
        findings: [...group.querySelectorAll('.daycheck-finding')].map(finding => ({
            kind: finding.dataset.kind,
            say: finding.querySelector('.daycheck-say').textContent,
            chips: [...finding.querySelectorAll('.daycheck-chips > *')].map(chip => ({
                text: chip.textContent, button: chip.tagName === 'BUTTON', label: chip.getAttribute('aria-label') }))
        }))
    }))
}));
// Every rectangle the dialog owes a finger and an eye.
const measure = page => page.evaluate(() => {
    const modal = document.getElementById('dayCheckModal');
    const content = modal.querySelector('.modal-content');
    const box = content.getBoundingClientRect();
    const buttons = [...modal.querySelectorAll('button')];
    return {
        small: buttons.map(node => [node.textContent, node.getBoundingClientRect()])
            .filter(([, r]) => r.width < 44 || r.height < 44).map(([text, r]) => `${text} ${Math.round(r.width)}x${Math.round(r.height)}`),
        tiny: buttons.filter(node => parseFloat(getComputedStyle(node).fontSize) < 16).map(node => node.textContent),
        outside: [...modal.querySelectorAll('.daycheck-chips > *, .daycheck-say, .daycheck-head, .daycheck-clean, h3, p, button')]
            .map(node => [node.textContent.slice(0, 24), node.getBoundingClientRect()])
            .filter(([, r]) => r.width > 0 && (r.left < box.left - 1 || r.right > box.right + 1)).map(([text]) => text),
        sideways: content.scrollWidth > content.clientWidth + 1,
        pageSideways: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        inGlass: box.top >= 0 && box.bottom <= innerHeight + 1 && box.left >= 0 && box.right <= innerWidth + 1,
        rtl: getComputedStyle(content).direction,
        inputs: modal.querySelectorAll('input, select, textarea').length,
        filled: buttons.filter(node => /btn-add|btn-success|chip-on/.test(node.className)).length
    };
});

async function stop(...contexts) {
    for (const context of contexts) await context.close();
    await browser.close();
    await server.close();
    report();
}

// ================================================================== the way in

const { page, errors, context } = await open(440, 956);
const diskBefore = await disk(page);
await censusOnly(check, page, diskBefore);
const queuedBefore = await page.evaluate(() => JSON.stringify(FarkadSync.pendingPaths()));
const recordBefore = await page.evaluate(() => JSON.stringify(State.schedule));

{
    suite('the way in is one button at the foot of the day, and nothing measured before it moved');

    const found = await entryOf(page).count();
    check('the day has one button for it', found === 1, String(found));
    if (found !== 1) await stop(context);
    same('and no second element says it anywhere on the page',
        await page.locator('button', { hasText: ENTRY }).count(), 1);
    same('the dock still has its two buttons and no more', await page.locator('.day-actions button').count(), 2);
    same('the header has the controls it had: ☰, קודם, the date, הבא, בטל, שוב and the row of ways to look at the day',
        await page.evaluate(() => [...document.querySelectorAll('#dayView .day-header button')]
            .filter(node => node.checkVisibility()).map(node => node.getAttribute('aria-label') || node.textContent.trim())),
        ['בחר יום', 'יום קודם', 'בחר תאריך', 'יום הבא', 'אין מה לבטל', 'אין מה לבצע שוב', 'לפי עובדים', 'לפי אתרים',
            'רשום חופש לעובדים בלי רישום ביום הנבחר', await page.evaluate(() => `פעולות מרוכזות (${State.unrecorded().length})`),
            await page.evaluate(() => `נרשמו ${State.activeWorkers().length - State.unrecorded().length} מתוך ${State.activeWorkers().length} - המשך אל הבא שטרם נרשם`)]);
    same('nothing in the WhatsApp dialog offers it', await page.locator('#shareModal').getByText(ENTRY).count(), 0);

    const place = await page.evaluate(() => {
        const entry = document.getElementById('dayCheckEntry');
        const view = document.getElementById('dayView');
        const row = entry.closest('.daycheck-row');
        window.scrollTo(0, document.documentElement.scrollHeight);
        const box = entry.getBoundingClientRect();
        const dock = document.querySelector('.day-actions').getBoundingClientRect();
        const trays = [...view.querySelectorAll('.tray')].map(tray => tray.getBoundingClientRect().bottom);
        return {
            last: view.lastElementChild === row,
            underTrays: trays.length >= 2 && trays.every(bottom => bottom <= box.top + 1),
            aboveDock: box.bottom <= dock.top + 1,
            w: box.width, h: box.height, font: parseFloat(getComputedStyle(entry).fontSize),
            sideways: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
        };
    });
    check('it is the last thing in the day\'s list, under both trays', place.last && place.underTrays, JSON.stringify(place));
    check('scrolled to, it stands whole above the dock', place.aboveDock, JSON.stringify(place));
    check('a finger wide and tall, in words of 16px', place.w >= 44 && place.h >= 44 && place.font >= 16, JSON.stringify(place));
    check('and the day does not scroll sideways for it', !place.sideways);
    if (SHOTS) await page.screenshot({ path: join(SHOTS, 'day-entry-440-dark.jpg'), type: 'jpeg', quality: 80 });
}

// ================================================================== the dialog

{
    suite('it opens the app\'s own dialog, entered at its heading');

    await openCheck(page);
    check('the dialog is open', await shown(page));
    same('the keyboard is on its heading', await page.evaluate(() => document.activeElement.id), 'dayCheckTitle');
    same('no other dialog opened with it', await page.evaluate(() =>
        [...document.querySelectorAll('.modal')].filter(modal => modal.style.display === 'flex').map(modal => modal.id)),
    ['dayCheckModal']);
    if (SHOTS) await page.screenshot({ path: join(SHOTS, 'dialog-findings-440-dark.jpg'), type: 'jpeg', quality: 80 });

    suite('what it says about the evening, word for word');
    const read = await reading(page);
    same('its title', read.title, TITLE);
    same('the day it is about, and the day it is compared with', read.context, CONTEXT);
    same('the line that says it changes nothing', read.lead, LEAD);
    same('its one button', read.close, CLOSE);
    same('no calm line while there is something to check', read.clean, []);
    same('two groups, in this order', read.groups.map(group => group.head), [HEAD_CHECK, HEAD_INFO]);
    const man = name => ({ text: name, button: true, label: `פתח את הרישום של ${named(name)}` });
    const site = name => ({ text: name, button: true, label: `הצג את האתר ${named(name)}` });
    same('what to check', read.groups[0].findings, [
        { kind: 'emptySite', say: `ב${named('הרצליה')} אין אף עובד. עבדו שם ביום חמישי 05/11 ועדיין לא נרשמו:`,
            chips: [site('הרצליה'), man('אחמד'), man('מוחמד עבד אל רחמן')] },
        { kind: 'emptySite', say: `ב${named('אשדוד')} אין אף עובד. עבד שם ביום חמישי 05/11 ועדיין לא נרשם:`,
            chips: [site('אשדוד'), man(HOSTILE)] },
        { kind: 'forgot', say: 'עבד ביום חמישי 05/11 ועדיין לא נרשם:', chips: [man('סמיר')] },
        { kind: 'rima', say: 'רימא: היה רישום ביום חמישי 05/11, ואין רישום ביום הזה:', chips: [site('הרצליה'), site('אשדוד')] },
        { kind: 'extraNoHours', say: 'שעות נוספות בלי מספר שעות - ישולם יום רגיל:', chips: [man('יוסי')] },
        { kind: 'noDaily', say: 'בלי שכר יומי - היום הזה לא יחושב בשכר:', chips: [man('Dan Levi')] }
    ]);
    same('and what is only for information', read.groups[1].findings, [
        { kind: 'unusual', say: 'לא יום רגיל - לאישור:',
            chips: [{ text: `${named('עלי')} · יום כפול`, button: true,
                label: `${named('עלי')} · יום כפול - פתח את הרישום של ${named('עלי')}` }] }
    ]);
    check('the archived man, who worked on Thursday, is nowhere in it',
        !JSON.stringify(read).includes('ח\'אלד'));
    check('nor the two men who have never had a site', !/נביל|ראמי/.test(JSON.stringify(read)));

    suite('a name is text, never markup');
    const hostile = await page.evaluate(() => ({
        images: document.querySelectorAll('#dayCheckModal img').length,
        ran: window.__pwned === undefined ? 'no' : 'yes'
    }));
    same('a name written as an image tag is drawn as its letters', hostile, { images: 0, ran: 'no' });

    suite('every control is a finger wide and tall; nothing zooms; it reads right to left');
    const m = await measure(page);
    same('no button under 44px either way', m.small, []);
    same('no button under 16px', m.tiny, []);
    same('nothing drawn outside the dialog', m.outside, []);
    check('no sideways scroll, in the dialog or behind it', !m.sideways && !m.pageSideways, JSON.stringify(m));
    check('the dialog is whole on the glass', m.inGlass, JSON.stringify(m));
    same('right to left', m.rtl, 'rtl');
    same('it has no field to type in and no filled button: there is nothing to save in it', [m.inputs, m.filled], [0, 0]);
}

{
    suite('the keyboard: Tab stays inside, Escape closes, and the focus goes back to the button');

    const inside = [];
    for (let i = 0; i < 14; i += 1) {
        await page.keyboard.press('Tab');
        inside.push(await page.evaluate(() => document.getElementById('dayCheckModal').contains(document.activeElement)));
    }
    check('fourteen Tabs, past the last control and round again, never leave the dialog', inside.every(Boolean),
        JSON.stringify(inside));
    await page.keyboard.press('Shift+Tab');
    check('nor does Shift+Tab', await page.evaluate(() =>
        document.getElementById('dayCheckModal').contains(document.activeElement)));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    check('Escape closes it', !(await shown(page)));
    same('and the keyboard is back on «בדיקת היום»', await page.evaluate(() => document.activeElement.id), 'dayCheckEntry');

    await openCheck(page);
    await page.locator('#dayCheckClose').click();
    await page.waitForTimeout(200);
    check('«סגור» closes it too', !(await shown(page)));

    await openCheck(page);
    await page.mouse.click(4, 4);
    await page.waitForTimeout(200);
    check('and so does a press on the backdrop, like every dialog of the app', !(await shown(page)));
}

// ================================================================== a name and a site only navigate

{
    suite('a name opens the sheet that name already opens on the day');

    await openCheck(page);
    await dialog(page).getByRole('button', { name: `פתח את הרישום של ${named('סמיר')}`, exact: true }).click();
    await page.waitForTimeout(250);
    check('the check stepped aside', !(await shown(page)));
    same('the assign sheet is open, on him', await page.evaluate(() => [
        document.getElementById('assignSheet').style.display,
        document.getElementById('assignSheetTitle').textContent]), ['flex', 'סמיר']);
    check('and it is the sheet that stays on him - no «דלג», nobody next',
        await page.locator('#assignSheet .sheet-fwd').count() === 0);
    same('nothing was recorded for him by getting there',
        await page.evaluate(() => JSON.stringify(workerDay(State.schedule, State.date, 'w_04', 'actual'))), 'null');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
    check('Escape closes the sheet', await page.evaluate(() => document.getElementById('assignSheet').style.display) === 'none');

    suite('a site is scrolled to, on the day');
    await page.evaluate(() => window.scrollTo(0, 0));
    await openCheck(page);
    const before = await page.evaluate(() => window.scrollY);
    await dialog(page).getByRole('button', { name: `הצג את האתר ${named('אשדוד')}`, exact: true }).first().click();
    await page.waitForTimeout(300);
    check('the check closed', !(await shown(page)));
    const landed = await page.evaluate(() => {
        const head = [...document.querySelectorAll('#dayView [data-anchor]')].find(node => node.dataset.anchor === 'head:p_08');
        const card = head.closest('.site-card').getBoundingClientRect();
        const header = document.querySelector('#dayView .day-header').getBoundingClientRect();
        const dock = document.querySelector('.day-actions').getBoundingClientRect();
        return { top: card.top, bottom: card.bottom, floor: header.bottom, dock: dock.top, y: window.scrollY,
            focus: document.activeElement.getAttribute('aria-label') };
    });
    check('the site\'s card is whole between the pinned header and the dock',
        landed.top >= landed.floor - 1 && landed.bottom <= landed.dock + 1, JSON.stringify(landed));
    check('the page really moved to get there', Math.abs(landed.y - before) > 50, JSON.stringify([before, landed.y]));
    same('and the keyboard is on that card\'s first control', landed.focus, `הוסף עובד ל${named('אשדוד')}`);
}

// ================================================================== it wrote nothing

{
    suite('after all of it, every key on the disk holds the bytes it held');

    same('the whole of localStorage, byte for byte', await disk(page), diskBefore);
    same('the record in memory', await page.evaluate(() => JSON.stringify(State.schedule)), recordBefore);
    same('nothing queued for the cloud', await page.evaluate(() => JSON.stringify(FarkadSync.pendingPaths())), queuedBefore);
    same('no session storage either', await page.evaluate(() => sessionStorage.length), 0);
    check('nothing threw', errors.length === 0, errors.join(' | '));
}

// ================================================================== it follows the record

{
    suite('open over the day, it follows a record that changes under it');

    await openCheck(page);
    const chip = dialog(page).getByRole('button', { name: `פתח את הרישום של ${named('Dan Levi')}`, exact: true });
    await chip.focus();
    // What a snapshot from another phone does: the record changes and the day is drawn again.
    await page.evaluate(() => {
        State.commit(markAbsent(State.schedule, State.date, 'w_04', 'actual'));
        render();
    });
    await page.waitForTimeout(200);
    const after = await reading(page);
    check('still open', await shown(page));
    same('the man who was just answered has left the list',
        after.groups[0].findings.map(finding => finding.kind), ['emptySite', 'emptySite', 'rima', 'extraNoHours', 'noDaily']);
    same('and the chip that had the keyboard still has it',
        await page.evaluate(() => document.activeElement.getAttribute('aria-label')), `פתח את הרישום של ${named('Dan Levi')}`);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    // The day was drawn again under the open dialog, so the button that opened it is gone
    // from the page; the one standing in its place takes the keyboard.
    same('closed after that, the keyboard is on the «בדיקת היום» that is on the page now',
        await page.evaluate(() => [document.activeElement.id, document.activeElement.isConnected]), ['dayCheckEntry', true]);
}

// ================================================================== by worker

{
    suite('in the by-worker view a site is a name, not a button, and the way in is still one and still last');

    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(150);
    await page.locator('#dayView').getByRole('button', { name: 'לפי עובדים', exact: true }).click();
    await page.waitForTimeout(200);
    same('one button', await entryOf(page).count(), 1);
    check('the last thing in the list', await page.evaluate(() =>
        document.getElementById('dayView').lastElementChild === document.getElementById('dayCheckEntry').parentElement));
    await openCheck(page);
    const read = await reading(page);
    const sites = read.groups[0].findings.flatMap(finding => finding.chips).filter(chip => ['הרצליה', 'אשדוד'].includes(chip.text));
    given('the sites are still named', sites.length === 4, JSON.stringify(sites));
    same('with no site card to show, a site is not something to press', sites.map(chip => chip.button), [false, false, false, false]);
    same('the men still are', read.groups[0].findings[0].chips.filter(chip => chip.button).map(chip => chip.text),
        ['אחמד', 'מוחמד עבד אל רחמן']);
    const prefs = await page.evaluate(() => localStorage.getItem('farkadDayMode'));
    same('and the check did not change the view to show one', prefs, 'workers');
    const m = await measure(page);
    check('44px, 16px, nothing outside, no sideways scroll', m.small.length === 0 && m.tiny.length === 0
        && m.outside.length === 0 && !m.sideways && !m.pageSideways, JSON.stringify(m));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
    check('nothing threw', errors.length === 0, errors.join(' | '));
}
// ================================================================== the two doors

{
    suite('another screen can embed it: renderDayCheckInto(container, date) draws the dialog\'s own list');

    const before = await disk(page);
    await openCheck(page);
    const embedded = await page.evaluate(() => {
        const box = document.createElement('div');
        box.id = 'embedHere';
        box.textContent = 'what was here before';
        document.body.appendChild(box);
        const count = renderDayCheckInto(box, State.date);
        return { count, list: dayCheckFindings(State.date).length, html: box.innerHTML,
            dialog: document.getElementById('dayCheckList').innerHTML,
            texts: dayCheckFindings(State.date).every(finding => typeof finding.kind === 'string' && finding.text.length > 0) };
    });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    check('it answers with the number of findings it drew, which is dayCheckFindings(date).length',
        embedded.count === embedded.list && embedded.count >= 5 && embedded.texts, JSON.stringify([embedded.count, embedded.list]));
    check('and what it drew is, node for node, what the dialog shows - the container emptied first',
        embedded.html === embedded.dialog && embedded.html.length > 500, String(embedded.html.length));

    await page.evaluate(() => [...document.querySelectorAll('#embedHere button')]
        .find(node => node.textContent === 'Dan Levi').click());
    await page.waitForTimeout(250);
    same('a name in it navigates the same way: the assign sheet, on him', await page.evaluate(() => [
        document.getElementById('assignSheet').style.display,
        document.getElementById('assignSheetTitle').textContent]), ['flex', 'Dan Levi']);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);

    const other = await page.evaluate(day => {
        const box = document.getElementById('embedHere');
        const count = renderDayCheckInto(box, day);
        return { count, list: dayCheckFindings(day).length, buttons: box.querySelectorAll('button').length,
            names: box.querySelectorAll('.daycheck-plain').length, clean: box.querySelectorAll('.daycheck-clean').length };
    }, MON);
    check('for a date that is not the day on screen it draws that date\'s findings as names, with nothing to press',
        other.count === other.list && other.count >= 1 && other.buttons === 0 && other.names >= 1, JSON.stringify(other));

    const nothing = await page.evaluate(() => {
        const box = document.getElementById('embedHere');
        const count = renderDayCheckInto(box, '2026-10-01');
        const text = box.textContent;
        box.remove();
        return { count, text, list: dayCheckFindings('2026-10-01') };
    });
    same('with nothing found: 0, an empty array, and the calm line in the container', nothing,
        { count: 0, text: CLEAN, list: [] });
    same('and none of it wrote a byte', await disk(page), before);
    check('nothing threw', errors.length === 0, errors.join(' | '));
}
await context.close();

// ================================================================== nothing found

{
    suite('a day with nothing forgotten says so in one calm line');

    const clean = await open(440, 956, 'dark', 'clean');
    const cleanDisk = await disk(clean.page);
    await openCheck(clean.page);
    const read = await reading(clean.page);
    same('the line', read.clean, [CLEAN]);
    same('and no group under it', read.groups, []);
    same('the title, the day and the line that says it changes nothing are still there',
        [read.title, read.context, read.lead], [TITLE, CONTEXT, LEAD]);
    const m = await measure(clean.page);
    check('44px, 16px, whole on the glass', m.small.length === 0 && m.tiny.length === 0 && m.inGlass, JSON.stringify(m));
    if (SHOTS) await clean.page.screenshot({ path: join(SHOTS, 'dialog-clean-440-dark.jpg'), type: 'jpeg', quality: 80 });
    await clean.page.keyboard.press('Escape');
    same('the disk is what it was', await disk(clean.page), cleanDisk);
    check('nothing threw', clean.errors.length === 0, clean.errors.join(' | '));
    await clean.context.close();

    const info = await open(440, 956, 'dark', 'info');
    await openCheck(info.page);
    const both = await reading(info.page);
    same('with only something for information, the calm line is still said', both.clean, [CLEAN]);
    same('over the «לידיעה» group alone', both.groups.map(group => [group.head, group.findings.map(f => f.kind)]),
        [[HEAD_INFO, ['unusual']]]);
    await info.context.close();
}

{
    suite('a day with nothing before it, and an app with nobody in it');

    const first = await open(440, 956, 'dark', 'clean');
    await first.page.evaluate(day => { State.date = day; render(); }, '2026-10-01');
    await first.page.waitForTimeout(150);
    await openCheck(first.page);
    const read = await reading(first.page);
    same('says there is no working day near to compare with', read.context,
        'יום חמישי 01/10/2026 · אין יום עבודה קרוב להשוות אליו.');
    same('and finds nothing', [read.clean, read.groups], [[CLEAN], []]);
    await first.context.close();

    const empty = await browser.newContext({ viewport: { width: 440, height: 956 } });
    const blank = await empty.newPage();
    await blank.goto(`${server.url}/index.html`, { waitUntil: 'load' });
    await blank.waitForTimeout(350);
    given('the empty app shows its welcome card', await blank.locator('#dayView .setup-card').count() === 1);
    same('an app with no workers has no check to offer', await blank.locator('#dayCheckEntry').count(), 0);
    await empty.close();
}

// ================================================================== the phones

for (const [width, height] of [[375, 667], [440, 956]]) {
    for (const scheme of ['dark', 'light']) {
        suite(`${width}x${height}, ${scheme}`);
        const phone = await open(width, height, scheme, 'findings', { isMobile: true, hasTouch: true });
        const where = await phone.page.evaluate(() => {
            const entry = document.getElementById('dayCheckEntry');
            window.scrollTo(0, document.documentElement.scrollHeight);
            const box = entry.getBoundingClientRect();
            const dock = document.querySelector('.day-actions').getBoundingClientRect();
            return { w: box.width, h: box.height, font: parseFloat(getComputedStyle(entry).fontSize),
                aboveDock: box.bottom <= dock.top + 1,
                sideways: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1 };
        });
        check('the way in: 44px both ways, 16px, whole above the dock, no sideways scroll',
            where.w >= 44 && where.h >= 44 && where.font >= 16 && where.aboveDock && !where.sideways, JSON.stringify(where));
        await phone.page.locator('#dayCheckEntry').tap();
        await phone.page.waitForTimeout(250);
        given('a tap opens the dialog', await shown(phone.page));
        const m = await measure(phone.page);
        same('no button under 44px either way', m.small, []);
        same('no button under 16px', m.tiny, []);
        same('nothing drawn outside the dialog', m.outside, []);
        check('no sideways scroll; the dialog whole on the glass', !m.sideways && !m.pageSideways && m.inGlass, JSON.stringify(m));

        // The colours: each kind of text against what is behind it.
        const contrast = await phone.page.evaluate(() => {
            const rgb = text => (text.match(/[\d.]+/g) || []).map(Number);
            const lum = ([r, g, b]) => [r, g, b].map(v => v / 255)
                .map(v => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)))
                .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
            const ground = node => {
                for (let at = node; at; at = at.parentElement) {
                    const bg = rgb(getComputedStyle(at).backgroundColor);
                    if (bg.length === 3 || (bg.length === 4 && bg[3] === 1)) return bg;
                }
                return [255, 255, 255];
            };
            const ratio = node => {
                const a = lum(rgb(getComputedStyle(node).color));
                const b = lum(ground(node));
                return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
            };
            const pick = selector => document.querySelector(`#dayCheckModal ${selector}`);
            return {
                sentence: ratio(pick('.daycheck-say')), chip: ratio(pick('.daycheck-go')),
                headCheck: ratio(pick('.daycheck-check .daycheck-head')), headInfo: ratio(pick('.daycheck-info .daycheck-head')),
                lead: ratio(pick('.daycheck-lead')), close: ratio(pick('#dayCheckClose'))
            };
        });
        const low = Object.entries(contrast).filter(([, ratio]) => ratio < 4.5).map(([what, ratio]) => `${what} ${ratio.toFixed(2)}`);
        same('every kind of text in it is at least 4.5:1 on its ground', low, []);

        // The last finding can be reached: the dialog scrolls inside itself and «סגור» stays under the thumb.
        const foot = await phone.page.evaluate(() => {
            const content = document.querySelector('#dayCheckModal .modal-content');
            content.scrollTop = content.scrollHeight;
            const close = document.getElementById('dayCheckClose').getBoundingClientRect();
            const last = [...document.querySelectorAll('#dayCheckModal .daycheck-go')].pop().getBoundingClientRect();
            const box = content.getBoundingClientRect();
            return { closeIn: close.top >= box.top && close.bottom <= box.bottom + 1 && close.bottom <= innerHeight,
                lastAbove: last.bottom <= close.top + 1 };
        });
        check('scrolled to its end, the last name stands above «סגור», which is on the glass',
            foot.closeIn && foot.lastAbove, JSON.stringify(foot));

        // 200% TEXT - text zoom, not geometric zoom: the words double and the boxes make room.
        const big = await phone.page.evaluate(() => {
            const modal = document.getElementById('dayCheckModal');
            [...modal.querySelectorAll('*')].map(node => [node, parseFloat(getComputedStyle(node).fontSize)])
                .forEach(([node, size]) => node.style.setProperty('font-size', `${size * 2}px`, 'important'));
            const content = modal.querySelector('.modal-content');
            const box = content.getBoundingClientRect();
            return {
                sideways: content.scrollWidth > content.clientWidth + 1,
                pageSideways: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
                outside: [...modal.querySelectorAll('.daycheck-chips > *, .daycheck-say, .daycheck-head, h3, p, button')]
                    .map(node => [node.textContent.slice(0, 24), node.getBoundingClientRect()])
                    .filter(([, r]) => r.width > 0 && (r.left < box.left - 1 || r.right > box.right + 1)).map(([text]) => text),
                clipped: [...modal.querySelectorAll('.daycheck-go, .daycheck-say, h3')]
                    .filter(node => node.scrollWidth > node.clientWidth + 1).map(node => node.textContent.slice(0, 24)),
                small: [...modal.querySelectorAll('button')].filter(node =>
                    node.getBoundingClientRect().width < 44 || node.getBoundingClientRect().height < 44).length
            };
        });
        same('at doubled text nothing is pushed out of the dialog or cut', [big.outside, big.clipped], [[], []]);
        check('and nothing scrolls sideways; every target still 44px',
            !big.sideways && !big.pageSideways && big.small === 0, JSON.stringify(big));
        check('nothing threw', phone.errors.length === 0, phone.errors.join(' | '));
        await phone.context.close();
    }
}

// The day's own entry at doubled text, on the small phone.
{
    suite('the way in at doubled text on the small phone');
    const phone = await open(375, 667, 'dark', 'findings', { isMobile: true, hasTouch: true });
    const big = await phone.page.evaluate(() => {
        const entry = document.getElementById('dayCheckEntry');
        entry.style.setProperty('font-size', `${parseFloat(getComputedStyle(entry).fontSize) * 2}px`, 'important');
        window.scrollTo(0, document.documentElement.scrollHeight);
        const box = entry.getBoundingClientRect();
        return { inside: box.left >= 0 && box.right <= innerWidth + 1, cut: entry.scrollWidth > entry.clientWidth + 1,
            sideways: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1 };
    });
    check('its two words fit, uncut, and the day does not scroll sideways', big.inside && !big.cut && !big.sideways,
        JSON.stringify(big));
    await phone.context.close();
}

await browser.close();
await server.close();
report();
