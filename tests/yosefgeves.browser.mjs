// עובדי יוסף גבס (v183) in a real browser: the second count on every site card, beside
// רימא; its own list at the end of «לפי אתר»; and everything that was on those two screens
// before it, where it was and saying what it said.
//
//   node tests/yosefgeves.browser.mjs
//
// The model, the sync, the money, the workbook's cells and the older builds are in
// tests/yosefgeves.test.mjs. This is the part only a page can answer: what a finger lands
// on, that the second box costs a card no height and no phone its width, that the list is
// on the screen, on the paper and in the picture as a table of its OWN, last - the owner,
// 2026-11-10: "in print too, but as a separate list that does not enter any other list's
// account" - and that the invoice above it is cell for cell the invoice it was, on all three. It follows tests/rima.browser.mjs
// section by section, less everything that is about billing. Site and worker names are
// Latin so a PDF's text can be matched without bidi guesswork.

import { chromium } from 'playwright';
import { serve } from './serve.mjs';
import { launchLocalBrowser } from './network-guard.mjs';
import { verifyServedAssets, expectedShaFor } from './treecheck.mjs';
import { suite, check, same, given, report } from './runner.mjs';
import { readPdf, pageText } from './pdf.mjs';

const root = new URL('..', import.meta.url).pathname;
const server = await serve(root);
const served = await verifyServedAssets(server.url, root, expectedShaFor(root));
check('the origin served this commit, byte for byte', served.ok,
    `${served.checked} assets; ${(served.wrong || []).slice(0, 3).join(' | ')}`);
const browser = await launchLocalBrowser(chromium, { executablePath: process.env.CHROME_PATH });

// THE PINNED WORDS (law 6). The list's name is the owner's, verbatim; the rest are proposed.
const TITLE = 'עובדי יוסף גבס';
const TOTAL = 'סה״כ עובדי יוסף גבס';
const NOTE = 'עובדי יוסף גבס בלבד. אינם נכללים בשכר ואינם נכללים בחיוב.';
const LABEL = 'יוסף גבס';
const REFUSED = 'אפשר לרשום ליוסף גבס רק מספר שלם בין 0 ל-99.';
const RIMA_TITLE = 'רישום לרימא';
const TEN = Array.from({ length: 10 }, (_, i) => ({
    id: `p_${i}`, name: `Site ${String.fromCharCode(65 + i)}`, active: true }));
const NAMES = ['Dan Levi', 'Omar Saad'];

const reversed = text => text.split('').reverse().join('');
const says = (haystack, phrase) => haystack.includes(phrase) || haystack.includes(reversed(phrase));
const bare = text => String(text || '').replace(/[⁦-⁩]/g, '');
const firstAt = (haystack, phrase) => [haystack.indexOf(phrase), haystack.indexOf(reversed(phrase))]
    .filter(at => at !== -1).reduce((one, two) => Math.min(one, two), Infinity);
const pdfText = async page => readPdf(await page.pdf({ format: 'A4', printBackground: true })).pages.map(pageText).join('\n');

// One crew, ten sites - tests/rima.browser.mjs's own record: work on the 12th and the 14th,
// Rima on the 12th at a site the crew worked and on the 13th with nobody of his. `counts`
// says whether the list's own counts are on it: Site B on the 12th (his man AND Rima's
// there), Site E on the 13th (nobody else at all on that site), Site J on the 15th (a day
// with nothing else on it).
async function open(width, height = 844, options = {}) {
    const context = await browser.newContext(Object.assign({ viewport: { width, height } }, options.context || {}));
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${server.url}/index.html`, { waitUntil: 'load' });
    await page.waitForTimeout(350);
    await page.evaluate(([places, names, counts]) => {
        todayStr = () => '2026-10-20';
        State.schedule.workers = [
            { id: 'w_01', name: names[0], active: true, dailyRate: 400, hourlyRate: 50 },
            { id: 'w_02', name: names[1], active: true, dailyRate: 350, hourlyRate: 0 }];
        State.schedule.places = places;
        assignPlace(State.schedule, '2026-10-12', 'w_01', 'actual', 'p_0');
        assignPlace(State.schedule, '2026-10-12', 'w_02', 'actual', 'p_1');
        assignPlace(State.schedule, '2026-10-14', 'w_01', 'actual', 'p_2');
        setRimaCount(State.schedule, '2026-10-12', 'p_1', 3);
        setRimaCount(State.schedule, '2026-10-13', 'p_7', 5);
        if (counts) {
            setYosefGevesCount(State.schedule, '2026-10-12', 'p_1', 2);
            setYosefGevesCount(State.schedule, '2026-10-13', 'p_4', 6);
            setYosefGevesCount(State.schedule, '2026-10-15', 'p_9', 4);
        }
        State.save();
        REPORT_RANGE.from = '2026-10-02';
        REPORT_RANGE.to = '2026-10-15';
    }, [TEN, NAMES, options.counts !== false]);
    return { page, errors, context };
}
const showDay = (page, date) => page.evaluate(day => { State.date = day; showView('day'); render(); }, date);
const geves = (page, name) => page.locator('.site-grid > .site-card').filter({ hasText: name }).locator('.yosefgeves-input');
const rimaBox = (page, name) => page.locator('.site-grid > .site-card').filter({ hasText: name }).locator('.rima-input');
const stored = (page, date, placeId) => page.evaluate(([day, id]) => yosefGevesCount(State.schedule, day, id), [date, placeId]);

// ---------------------------------------------------------------- the field
{
    suite('every site card carries a second small number field, labelled יוסף גבס, beside רימא');

    const { page, errors, context } = await open(390, 844, { counts: false });
    await showDay(page, '2026-10-14');
    await page.waitForTimeout(250);

    const fields = await page.evaluate(() => [...document.querySelectorAll('.site-grid > .site-card')].map(card => {
        const row = card.querySelector('.site-counts');
        const field = card.querySelector('.yosefgeves-field');
        const rima = card.querySelector('.rima-field');
        const input = field && field.querySelector('input');
        const box = input ? input.getBoundingClientRect() : null;
        const rimaInput = rima && rima.querySelector('input');
        const rimaBox = rimaInput ? rimaInput.getBoundingClientRect() : null;
        return {
            site: (card.querySelector('.site-head .site-name') || {}).textContent,
            label: field ? (field.querySelector('.yosefgeves-label') || {}).textContent : null,
            type: input && input.type, mode: input && input.inputMode, max: input && input.max,
            aria: input && input.getAttribute('aria-label'),
            w: box && Math.round(box.width), h: box && Math.round(box.height),
            font: input ? parseFloat(getComputedStyle(input).fontSize) : 0,
            labelFont: field ? parseFloat(getComputedStyle(field.querySelector('.yosefgeves-label')).fontSize) : 0,
            // One line: the two boxes share a top, and the line is the last thing on the card.
            sameLine: Boolean(box && rimaBox && Math.abs(box.top - rimaBox.top) < 1),
            rowHeight: row ? Math.round(row.getBoundingClientRect().height) : 0,
            last: card.lastElementChild === row,
            order: row ? [...row.children].map(node => node.className.split(' ')[0]) : [],
            // In a right-to-left page רימא is first, so it sits to the RIGHT of the new box.
            rimaFirst: Boolean(box && rimaBox && rimaBox.left > box.right),
            apart: box && rimaBox ? Math.round(rimaBox.left - box.right) : 0,
            anchors: [rima && rima.dataset.anchor, field && field.dataset.anchor]
        };
    }));
    same('all ten cards draw it, the empty ones included',
        [fields.length, fields.filter(f => f.label === LABEL).length], [10, 10]);
    check('it is a number field, with the numeric keypad, capped at 99',
        fields.every(f => f.type === 'number' && f.mode === 'numeric' && f.max === '99'), JSON.stringify(fields[0]));
    check('a finger wide and tall', fields.every(f => f.w >= 44 && f.h >= 44), JSON.stringify(fields.map(f => [f.w, f.h])));
    check('16px in the box, so the phone does not zoom on it', fields.every(f => f.font >= 16),
        JSON.stringify(fields.map(f => f.font)));
    check('and the label is readable', fields.every(f => f.labelFont >= 14), JSON.stringify(fields.map(f => f.labelFont)));
    check('each is named with its own site', fields.every(f => bare(f.aria) === `${LABEL} ב${f.site}`),
        JSON.stringify(fields.map(f => f.aria)));
    check('the two counts are ONE line at the foot of the card: רימא first, this one after it',
        fields.every(f => f.sameLine && f.last && f.rimaFirst && JSON.stringify(f.order) === '["rima-field","yosefgeves-field"]'),
        JSON.stringify(fields.map(f => [f.sameLine, f.last, f.rimaFirst, f.order])));
    check('that line is as tall as the Rima line alone was: the second box costs a card no height',
        fields.every(f => f.rowHeight >= 44 && f.rowHeight <= 46), JSON.stringify(fields.map(f => f.rowHeight)));
    check('the two boxes are far enough apart that a finger on one is not on the other',
        fields.every(f => f.apart >= 44), JSON.stringify(fields.map(f => f.apart)));
    check('each keeps its own place key, so the day holds still under either',
        fields.every(f => f.anchors[0] === `rima:${TEN.find(p => p.name === f.site).id}`
            && f.anchors[1] === `yosefgeves:${TEN.find(p => p.name === f.site).id}`), JSON.stringify(fields.map(f => f.anchors)));
    const wide = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
    check('and the day still does not run off the side', wide);

    suite('typing a count records it, journal first, and it survives a reload');
    await geves(page, 'Site C').fill('4');
    await geves(page, 'Site C').evaluate(node => node.blur());
    await page.waitForTimeout(200);
    same('the count is on the record', await stored(page, '2026-10-14', 'p_2'), 4);
    check('it went into the journal as its one path',
        await page.evaluate(() => FarkadSync.pendingPaths().includes('days.2026-10-14.yosefGeves.p_2')));
    check('and it is on the disk, under its own layer', await page.evaluate(() =>
        JSON.parse(localStorage.getItem('scheduleData:v2')).days['2026-10-14'].yosefGeves.p_2 === 4));
    same('Rima\'s box on that card is as it was: empty, and nothing recorded for her',
        [await rimaBox(page, 'Site C').inputValue(), await page.evaluate(() => rimaCount(State.schedule, '2026-10-14', 'p_2'))], ['', 0]);
    await geves(page, 'Site D').fill('2');
    await geves(page, 'Site D').evaluate(node => node.blur());
    await page.waitForTimeout(200);
    same('a count on a card with none of his men is a count all the same', await stored(page, '2026-10-14', 'p_3'), 2);
    check('and that card is still the empty one - his crew is not there',
        await page.locator('.site-grid > .site-card').filter({ hasText: 'Site D' }).evaluate(n => n.classList.contains('site-card-empty')));
    // Rima's count beside it, on the same site: two fields, each its own.
    await rimaBox(page, 'Site C').fill('7');
    await rimaBox(page, 'Site C').evaluate(node => node.blur());
    await page.waitForTimeout(200);
    same('Rima typed on the same card: both counts, each under its own layer',
        await page.evaluate(() => [State.schedule.days['2026-10-14'].rima, State.schedule.days['2026-10-14'].yosefGeves]),
        [{ p_2: 7 }, { p_2: 4, p_3: 2 }]);
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(400);
    await showDay(page, '2026-10-14');
    await page.waitForTimeout(250);
    same('after a reload the fields show what was typed, each in its own box',
        [await geves(page, 'Site C').inputValue(), await geves(page, 'Site D').inputValue(), await geves(page, 'Site A').inputValue(),
            await rimaBox(page, 'Site C').inputValue(), await rimaBox(page, 'Site D').inputValue()],
        ['4', '2', '', '7', '']);

    suite('a count the model refuses is said out loud and leaves nothing behind');
    await geves(page, 'Site C').fill('150');
    await geves(page, 'Site C').evaluate(node => node.blur());
    await page.waitForTimeout(250);
    check('the refusal is said, in the pinned words', await page.locator('#askModal').isVisible()
        && (await page.locator('#askMessage').textContent()) === REFUSED,
    await page.locator('#askMessage').textContent());
    await page.locator('#askOk').click();
    await page.waitForTimeout(150);
    same('the record still says 4', await stored(page, '2026-10-14', 'p_2'), 4);
    same('and so does the field', await geves(page, 'Site C').inputValue(), '4');
    await geves(page, 'Site C').fill('');
    await geves(page, 'Site C').evaluate(node => node.blur());
    await page.waitForTimeout(200);
    same('an empty field clears the count', await stored(page, '2026-10-14', 'p_2'), 0);
    same('and Rima\'s 7 on that card is untouched by the clear',
        await page.evaluate(() => rimaCount(State.schedule, '2026-10-14', 'p_2')), 7);
    same('no page error on the way', errors, []);
    await context.close();
}

// ---------------------------------------------------------------- ↶ after a count
{
    suite('a count that stands forgets the step behind it: ↶ cannot take back a man\'s day for it');

    const { page, errors, context } = await open(390, 844, { counts: false });
    await showDay(page, '2026-10-14');
    await page.waitForTimeout(250);
    const header = () => page.evaluate(() => {
        const undo = document.getElementById('undoBtn');
        return { armed: Boolean(undo && !undo.disabled), said: undo ? undo.getAttribute('aria-label') : null };
    });
    const omar = () => page.evaluate(() => ({
        sites: entriesFor(State.schedule, '2026-10-14', 'w_02', 'actual').map(entry => entry.placeId),
        pay: payrollReport(State.schedule, '2026-10-14', '2026-10-14').find(row => row.workerId === 'w_02').amount,
        disk: ((JSON.parse(localStorage.getItem('scheduleData:v2')).days['2026-10-14'].actual.w_02)
            || { entries: [] }).entries.map(entry => entry.placeId)
    }));
    await page.evaluate(() => openWorkerPicker('p_3'));
    await page.locator('#workerPickerList .picker-row[data-worker-id="w_02"] button').click();
    await page.evaluate(() => closeWorkerPicker());
    await page.waitForTimeout(150);
    const before = await omar();
    const armed = await header();
    given('Omar is on Site D, paid for it, and ↶ holds that step',
        JSON.stringify(before) === JSON.stringify({ sites: ['p_3'], pay: 350, disk: ['p_3'] })
        && armed.armed && bare(armed.said) === 'בטל: Omar Saad נוסף לSite D', JSON.stringify([before, armed]));

    await geves(page, 'Site A').fill('150');
    await geves(page, 'Site A').evaluate(node => node.blur());
    await page.waitForTimeout(200);
    await page.locator('#askOk').click();
    await page.waitForTimeout(150);
    const refused = await header();
    check('a refused count leaves ↶ holding the step that was there',
        refused.armed && bare(refused.said) === 'בטל: Omar Saad נוסף לSite D', JSON.stringify(refused));

    await geves(page, 'Site A').fill('3');
    await geves(page, 'Site A').evaluate(node => node.blur());
    await page.waitForTimeout(200);
    same('the count stood', await stored(page, '2026-10-14', 'p_0'), 3);
    const after = await header();
    check('and ↶ no longer offers Omar\'s step', !after.armed && after.said === 'אין מה לבטל', JSON.stringify(after));
    check('nor does the bar at the foot of the screen', !(await page.locator('#undoBar').isVisible()));
    await page.evaluate(() => document.getElementById('undoBtn').click());
    await page.waitForTimeout(200);
    same('pressed anyway: Omar is still on Site D, paid 350, and the disk says so', await omar(), before);
    same('and the count is as typed', await stored(page, '2026-10-14', 'p_0'), 3);
    same('no page error on the way', errors, []);
    await context.close();
}

// ---------------------------------------------------------------- a Saturday with a count only
{
    suite('a Saturday holding only a «עובדי יוסף גבס» count is landed on by the arrows');

    const { page, errors, context } = await open(390, 844, { counts: false });
    const fwd = page.getByRole('button', { name: 'יום הבא', exact: true });
    const back = page.getByRole('button', { name: 'יום קודם', exact: true });
    const shown = () => page.evaluate(() => State.date);

    await showDay(page, '2026-10-17');
    await page.waitForTimeout(200);
    await geves(page, 'Site E').fill('3');
    await geves(page, 'Site E').evaluate(node => node.blur());
    await page.waitForTimeout(200);
    given('the Saturday holds a count, nothing of his and nothing of Rima\'s', await page.evaluate(() =>
        yosefGevesCount(State.schedule, '2026-10-17', 'p_4') === 3 && State.schedule.days['2026-10-17'].rima === undefined
        && State.schedule.workers.every(worker => !isAbsent(State.schedule, '2026-10-17', worker.id, 'actual')
            && entriesFor(State.schedule, '2026-10-17', worker.id, 'actual').length === 0)));
    await showDay(page, '2026-10-16');
    await fwd.click();
    await page.waitForTimeout(250);
    same('from Friday, הבא lands on the Saturday with the count', await shown(), '2026-10-17');
    same('and its card shows the count', await geves(page, 'Site E').inputValue(), '3');
    await showDay(page, '2026-10-18');
    await back.click();
    await page.waitForTimeout(250);
    same('from Sunday, קודם lands on it too', await shown(), '2026-10-17');
    await geves(page, 'Site E').fill('');
    await geves(page, 'Site E').evaluate(node => node.blur());
    await page.waitForTimeout(200);
    await showDay(page, '2026-10-16');
    await fwd.click();
    await page.waitForTimeout(250);
    same('cleared, the Saturday is stepped over again', await shown(), '2026-10-18');
    same('no page error on the way', errors, []);
    await context.close();
}

// ---------------------------------------------------------------- from one box to the next
{
    suite('a count typed, another box tapped - either list\'s: that box has the focus, holding only what is stored');

    const { page, errors, context } = await open(390, 844, { counts: false });
    await showDay(page, '2026-10-14');
    await page.waitForTimeout(250);
    const focused = () => page.evaluate(() => {
        const node = document.activeElement;
        return { said: node && node.getAttribute ? node.getAttribute('aria-label') : null,
            value: node && typeof node.value === 'string' ? node.value : null,
            live: Boolean(node && node.isConnected), id: node ? node.id : null };
    });
    await geves(page, 'Site A').click();
    await page.keyboard.type('3');
    await geves(page, 'Site B').click();
    await page.waitForTimeout(150);
    same('Site A\'s count was recorded on the way', await stored(page, '2026-10-14', 'p_0'), 3);
    const onB = await focused();
    check('and the next site\'s box of the same list has the focus, empty',
        onB.live && bare(onB.said) === `${LABEL} בSite B` && onB.value === '', JSON.stringify(onB));
    await page.keyboard.type('5');
    // Across the lists, on one card: from this list's box to Rima's on the same site.
    await rimaBox(page, 'Site B').click();
    await page.waitForTimeout(150);
    same('what was typed is Site B\'s, in this list', await stored(page, '2026-10-14', 'p_1'), 5);
    const onRima = await focused();
    check('and Rima\'s box on the same card takes the focus - not this list\'s box redrawn',
        onRima.live && bare(onRima.said) === 'רימא בSite B' && onRima.value === '', JSON.stringify(onRima));
    await page.keyboard.type('2');
    await geves(page, 'Site C').click();
    await page.waitForTimeout(150);
    const onC = await focused();
    same('Rima\'s 2 went to Rima, and this list\'s 5 on that site is still 5',
        await page.evaluate(() => [rimaCount(State.schedule, '2026-10-14', 'p_1'), yosefGevesCount(State.schedule, '2026-10-14', 'p_1')]), [2, 5]);
    check('and from Rima\'s box back to this list\'s, on the next site', onC.live && bare(onC.said) === `${LABEL} בSite C`,
        JSON.stringify(onC));
    await geves(page, 'Site D').click();
    await page.keyboard.type('150');
    await geves(page, 'Site E').click();
    await page.waitForTimeout(200);
    const told = await focused();
    check('a refused count leaves the focus on the dialog that says why, not in the next box',
        await page.locator('#askModal').isVisible() && told.id === 'askOk', JSON.stringify(told));
    await page.locator('#askOk').click();
    await page.waitForTimeout(150);
    same('and nothing was recorded for it', await stored(page, '2026-10-14', 'p_3'), 0);
    same('no page error on the way', errors, []);
    await context.close();
}

// ---------------------------------------------------------------- a redraw under a box being typed in
{
    suite('a redraw while the box is being typed in commits nothing');

    const { page, errors, context } = await open(390, 844, { counts: false });
    await page.evaluate(() => {
        setYosefGevesCount(State.schedule, '2026-10-14', 'p_1', 12);
        State.save();
        State.date = '2026-10-14'; showView('day'); render();
    });
    await page.waitForTimeout(250);
    const now = () => page.evaluate(() => ({
        b: yosefGevesCount(State.schedule, '2026-10-14', 'p_1'),
        e: yosefGevesCount(State.schedule, '2026-10-14', 'p_4'),
        disk: ((JSON.parse(localStorage.getItem('scheduleData:v2')).days['2026-10-14'] || {}).yosefGeves) || {},
        owed: FarkadSync.pendingPaths().filter(path => path.startsWith('days.2026-10-14.'))
    }));
    const redraw = () => page.evaluate(() => { render(); });
    const before = await now();
    given('Site B holds 12 and nothing is owed for the day', before.b === 12 && before.owed.length === 0, JSON.stringify(before));
    await geves(page, 'Site E').click();
    await page.keyboard.type('1');
    await redraw();
    await page.waitForTimeout(150);
    same('a "1" on its way to a count is not recorded by the redraw', await now(), before);
    same('and the box shows what is stored', await geves(page, 'Site E').inputValue(), '');
    await geves(page, 'Site B').click();
    await page.keyboard.press('End');
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Backspace');
    await redraw();
    await page.waitForTimeout(150);
    same('emptied to be typed again, it is not cleared by the redraw', await now(), before);
    await geves(page, 'Site E').click();
    await page.keyboard.type('4');
    await geves(page, 'Site E').evaluate(node => node.blur());
    await page.waitForTimeout(200);
    const after = await now();
    same('a count typed and left is recorded as ever', [after.e, after.owed], [4, ['days.2026-10-14.yosefGeves.p_4']]);
    same('no page error on the way', errors, []);
    await context.close();
}

// ---------------------------------------------------------------- copying a day in
{
    // Copy-a-day fills in MEN who have nothing recorded (copyDayInto, js/ui/sheet.js). It has
    // never copied a Rima count - a count is a fact about one day - and it does not copy this
    // one either.
    suite('copying yesterday in copies neither count');

    const { page, errors, context } = await open(390, 844, { counts: false });
    await page.evaluate(() => {
        setYosefGevesCount(State.schedule, '2026-10-12', 'p_1', 2);
        State.save();
        State.date = '2026-10-13'; showView('day'); render();
        setRimaCount(State.schedule, '2026-10-13', 'p_7', null);
        copyDayInto('2026-10-12', 'actual', 'אתמול', 'אין מה להעתיק.');
    });
    await page.waitForTimeout(300);
    const copied = await page.evaluate(() => ({
        men: State.schedule.workers.map(worker => entriesFor(State.schedule, '2026-10-13', worker.id, 'actual').map(e => e.placeId)),
        rima: State.schedule.days['2026-10-13'].rima || null,
        geves: State.schedule.days['2026-10-13'].yosefGeves || null,
        source: [State.schedule.days['2026-10-12'].rima, State.schedule.days['2026-10-12'].yosefGeves]
    }));
    same('the men came across, each to his site', copied.men, [['p_0'], ['p_1']]);
    same('and neither count did - Rima\'s as before v183, and this list\'s like it', [copied.rima, copied.geves], [null, null]);
    same('the day they were copied from keeps both', copied.source, [{ p_1: 3 }, { p_1: 2 }]);
    same('no page error on the way', errors, []);
    await context.close();
}

// ---------------------------------------------------------------- the screen
//
// The same record twice - without the list's counts and with them - and everything on the
// reports page read off both. With the list's own section set aside, the two must be the
// same page: every table, every bar, every heading, every hint, in «לפי אתר» and in
// «לפי עובד», for the whole range and for each client. And the same of the two things that
// leave the phone: the PICTURE with the list's own group and note taken out of it, and the
// PAPER - a real PDF - printed with the list's section hidden, against the picture and the
// paper of the record that never had a count.
{
    suite('«לפי אתר»: the list is drawn last, and everything above it is what it was');

    const read = async withCounts => {
        const { page, errors, context } = await open(1100, 844, { counts: withCounts });
        const out = {};
        for (const [name, code] of [
            ['sites', "REPORT_SECTION = 'sites'; INVOICE_PLACE = null;"],
            ['client B', "REPORT_SECTION = 'sites'; INVOICE_PLACE = 'p_1';"],
            ['client H', "REPORT_SECTION = 'sites'; INVOICE_PLACE = 'p_7';"],
            ['workers', "REPORT_SECTION = 'workers'; INVOICE_PLACE = null;"]]) {
            if (!out.week) {
                // And the week grid, which shows neither count: the same table either way.
                out.week = await page.evaluate(() => {
                    State.date = '2026-10-13'; showView('week'); render();
                    return { html: document.getElementById('weekView').innerHTML, picture: 'none' };
                });
            }
            out[name] = await page.evaluate(script => {
                showView('reports');
                // eslint-disable-next-line no-eval
                (0, eval)(script);
                render();
                const view = document.getElementById('reportsView').cloneNode(true);
                view.querySelectorAll('.report-yosefgeves').forEach(node => node.remove());
                const picture = readReportPrintout();
                const whole = JSON.stringify(picture);
                if (picture) {
                    picture.groups = picture.groups.filter(group => group.groupTitle !== 'עובדי יוסף גבס');
                    picture.notes = picture.notes.filter(note => !note.includes('גבס'));
                }
                return { html: view.innerHTML, picture: JSON.stringify(picture), whole };
            }, code);
            // The paper as it is, and the paper with the list's own section taken off it.
            out[name].paper = await pdfText(page);
            const hide = await page.addStyleTag({ content: '.report-yosefgeves { display: none !important; }' });
            out[name].paperWithout = await pdfText(page);
            await hide.evaluate(node => node.remove());
        }
        out.errors = errors;
        return { out, page, context };
    };
    const without = await read(false);
    const withThem = await read(true);
    given('the week grid was drawn', withThem.out.week.html.length > 500 && withThem.out.week.html.includes('Site'),
        String(withThem.out.week.html.length));
    for (const name of ['sites', 'client B', 'client H', 'workers', 'week']) {
        same(`${name}: the page, with the list's own section set aside, is byte for byte the page without the counts`,
            withThem.out[name].html === without.out[name].html, true);
        same(`${name}: and the picture of it, the list's own group and note taken out, is the same picture`,
            withThem.out[name].picture, without.out[name].picture);
        if (name === 'week') continue;
        same(`${name}: and the PAPER, printed with the list's section hidden, is the same paper - a real PDF, every word`,
            withThem.out[name].paperWithout === without.out[name].paper, true);
        check(`${name}: with no count on the record, neither the paper nor the picture carries a word of the list - no empty heading`,
            !says(without.out[name].paper, 'גבס') && !says(without.out[name].paper, 'יוסף')
            && !without.out[name].whole.includes('גבס'), without.out[name].paper.slice(0, 120));
    }
    given('the paper compared is a paper with the invoice and the Rima table printed on it',
        says(without.out.sites.paper, 'לרימא') && without.out.sites.paper.includes('Site B') && without.out.sites.paper.length > 200,
        without.out.sites.paper.slice(0, 160));
    given('the page compared is a page with an invoice and a Rima table on it',
        without.out.sites.html.includes(RIMA_TITLE) && without.out.sites.html.includes('invoice-grid'));
    await without.context.close();

    const page = withThem.page;
    await page.evaluate(() => { showView('reports'); REPORT_SECTION = 'sites'; INVOICE_PLACE = null; render(); });
    const section = await page.evaluate(() => {
        const node = document.querySelector('.report-invoice .report-yosefgeves');
        if (!node) return null;
        const follows = other => Boolean(other && (node.compareDocumentPosition(other) & Node.DOCUMENT_POSITION_PRECEDING));
        return {
            visible: node.offsetParent !== null && node.getBoundingClientRect().height > 0,
            title: node.querySelector('h3').textContent,
            headers: [...node.querySelectorAll('thead th')].map(th => th.textContent),
            rows: [...node.querySelectorAll('tbody tr')].map(tr => [...tr.children].map(td => td.textContent)),
            total: [...node.querySelectorAll('tfoot td')].map(td => td.textContent),
            note: (node.querySelector('.report-yosefgeves-note') || {}).textContent,
            text: node.textContent,
            last: node === node.parentElement.lastElementChild,
            after: [follows(document.querySelector('.report-invoice .invoice-grid')),
                follows(document.querySelector('.report-invoice .report-norima')),
                follows(document.querySelector('.report-invoice .report-rima'))]
        };
    });
    given('the section is drawn', Boolean(section), String(section));
    check('it is on the screen', section.visible);
    same('after the invoice, after «בלי עובדי רימא», after «רישום לרימא» - the last thing on the page',
        [section.after, section.last], [[true, true, true], true]);
    same('titled in the owner\'s words', section.title, TITLE);
    same('its own columns - only the three sites that had a count', section.headers, ['תאריך', 'Site B', 'Site E', 'Site J', 'סה״כ']);
    same('its own dates and counts, blank where a site had none', section.rows,
        [['שני 12/10', '2', '', '', '2'], ['שלישי 13/10', '', '6', '', '6'], ['חמישי 15/10', '', '', '4', '4']]);
    same('its own total line', section.total, [TOTAL, '2', '6', '4', '12']);
    same('and the pinned note under it', section.note, NOTE);
    same('it names nobody', NAMES.filter(name => section.text.includes(name)), []);

    suite('and it is on no invoice: the grid, the bars and the Rima table, cell for cell');
    const above = await page.evaluate(() => {
        const cells = selector => {
            const node = document.querySelector(selector);
            return node ? { headers: [...node.querySelectorAll('thead th')].map(th => th.textContent),
                rows: [...node.querySelectorAll('tbody tr')].map(tr => [...tr.children].map(td => td.textContent)),
                total: [...node.querySelectorAll('tfoot td')].map(td => td.textContent) } : null;
        };
        return { grid: cells('.report-invoice .invoice-grid table'), rima: cells('.report-invoice .report-rima table'),
            bars: [...document.querySelectorAll('.invoice-bar-count')].map(n => n.textContent) };
    });
    // tests/rima.browser.mjs's own pinned figures for this record: not one of them moved.
    same('the invoice bills the four sites it billed - Site E and Site J are not on it', above.grid.headers,
        ['תאריך', 'Site A', 'Site B', 'Site C', 'Site H', 'סה״כ']);
    same('his men plus Rima\'s on each site, and not one of the list\'s twelve', above.grid.rows, [
        ['שני 12/10', '1', '4', '', '', '5'], ['שלישי 13/10', '', '', '', '5', '5'], ['רביעי 14/10', '', '', '1', '', '1']]);
    same('the invoice total is the 11 it was', above.grid.total, ['סה״כ ימי עובד־אתר', '1', '4', '1', '5', '11']);
    same('the bars say the same numbers', above.bars, ['1', '4', '1', '5']);
    same('the Rima table is hers alone', [above.rima.headers, above.rima.total],
        [['תאריך', 'Site B', 'Site H', 'סה״כ'], ['סה״כ עובדי רימא', '3', '5', '8']]);
    check('the 15th, a day with only the list\'s men, is not a billed day', !above.grid.rows.some(row => row[0].includes('15/10')));
    const workers = await page.evaluate(() => { REPORT_SECTION = 'workers'; render();
        return document.querySelector('.report-payroll').textContent; });
    check('«לפי עובד» says nothing about the list', !workers.includes('גבס'));

    // v183 MOVED, on the owner's word (2026-11-10: "I want it in print too, but as a separate
    // list that does not enter any other list's account"). These four checks used to say the
    // opposite - not in the picture, hidden by the print stylesheet, not a word of it in the
    // PDF, its sites not on the paper - and each now says where it IS.
    suite('IN the picture and ON paper: a table of its own, last, under its own title, with its note');
    const picture = await page.evaluate(() => { REPORT_SECTION = 'sites'; render(); return readReportPrintout(); });
    same('the picture is the invoice grid, the Rima table, then the list - three groups, the list last',
        picture.groups.map(group => group.groupTitle), ['', RIMA_TITLE, TITLE]);
    same('its group is its own table: its header, its rows, its total line', [picture.groups[2].headers, picture.groups[2].rows,
        picture.groups[2].totals], [['תאריך', 'Site B', 'Site E', 'Site J', 'סה״כ'],
        [['שני 12/10', '2', '', '', '2'], ['שלישי 13/10', '', '6', '', '6'], ['חמישי 15/10', '', '', '4', '4']],
        [[TOTAL, '2', '6', '4', '12']]]);
    same('the first two groups are the invoice and Rima, with the totals they had',
        [picture.groups[0].totals, picture.groups[1].totals],
        [[['סה״כ ימי עובד־אתר', '1', '4', '1', '5', '11']], [['סה״כ עובדי רימא', '3', '5', '8']]]);
    same('its note travels with it, the last line of the picture', picture.notes.slice(-1), [NOTE]);
    await page.emulateMedia({ media: 'print' });
    same('the print stylesheet shows the list and its note, with the invoice grid and the Rima table', await page.evaluate(() => [
        getComputedStyle(document.querySelector('.report-yosefgeves')).display !== 'none',
        getComputedStyle(document.querySelector('.report-yosefgeves-note')).display !== 'none',
        getComputedStyle(document.querySelector('.report-rima')).display !== 'none',
        getComputedStyle(document.querySelector('.report-invoice .invoice-grid')).display !== 'none',
        getComputedStyle(document.querySelector('.report-norima')).display]), [true, true, true, true, 'none']);
    await page.emulateMedia({ media: null });
    const text = await pdfText(page);
    check('a real printout carries the list\'s heading, its total line and its note',
        says(text, TITLE) && says(text, TOTAL) && says(text, 'ואינם נכללים בחיוב'), text.slice(-300));
    const totalAt = firstAt(text, TOTAL);
    const totalLine = totalAt === Infinity ? '' : text.slice(Math.max(0, totalAt - 12), totalAt + TOTAL.length + 12);
    check('the total line with its numbers', totalLine.includes('26412') || totalLine.includes(reversed('26412')), totalLine);
    check('and the sites only the list was on, which the invoice above does not print',
        text.includes('Site E') && text.includes('Site J'), text.slice(-300));
    check('LAST on the paper: after the Rima total line and the Rima note, heading then total then note',
        firstAt(text, 'סה״כ עובדי רימא') < firstAt(text, TITLE) && firstAt(text, 'עובד־אתר אחד') < firstAt(text, TITLE)
        && firstAt(text, TITLE) < totalAt && totalAt < firstAt(text, 'ואינם נכללים בחיוב'),
        JSON.stringify([firstAt(text, 'סה״כ עובדי רימא'), firstAt(text, TITLE), totalAt, firstAt(text, 'ואינם נכללים בחיוב')]));
    same('it names nobody on the paper', NAMES.filter(name => text.includes(name)), []);
    // The invoice's own figures on that same sheet of paper: the list added nothing to them.
    const billAt = firstAt(text, 'סה״כ ימי עובד־אתר');
    const billLine = billAt === Infinity ? '' : text.slice(Math.max(0, billAt - 14), billAt + 'סה״כ ימי עובד־אתר'.length + 14);
    check('the invoice\'s total line on the paper is the 1, 4, 1, 5 and 11 it was',
        billLine.includes('141511') || billLine.includes(reversed('141511')), billLine);
    check('one client\'s paper: the list narrowed to that client\'s site, as a table of its own',
        says(withThem.out['client B'].paper, TITLE) && !withThem.out['client B'].paper.includes('Site E'),
        withThem.out['client B'].paper.slice(-200));
    check('a client whose site had no count gets no heading of it on paper',
        !says(withThem.out['client H'].paper, 'גבס'), withThem.out['client H'].paper.slice(-200));
    check('«לפי עובד» on paper says nothing of the list', !says(withThem.out.workers.paper, 'גבס'));

    suite('one site chosen on the billing side: the list narrows to it, on the screen');
    same('Site B: its column and the day it had a count', await page.evaluate(() => {
        INVOICE_PLACE = 'p_1'; render();
        const node = document.querySelector('.report-yosefgeves');
        return node ? [[...node.querySelectorAll('thead th')].map(th => th.textContent),
            [...node.querySelectorAll('tfoot td')].map(td => td.textContent)] : null;
    }), [['תאריך', 'Site B', 'סה״כ'], [TOTAL, '2', '2']]);
    same('a client whose site had none gets no such table', await page.evaluate(() => {
        INVOICE_PLACE = 'p_7'; render(); return Boolean(document.querySelector('.report-yosefgeves')); }), false);
    same('and that client\'s file is what it was: no sheet of the list in it', await page.evaluate(() => {
        INVOICE_PLACE = 'p_1'; render(); return Object.keys(reportSheets()); }), ['invoice', 'withoutRima', 'rima']);

    suite('a range with only the list\'s counts: the invoice says it is empty, and the list is drawn under it');
    const alone = await page.evaluate(() => {
        INVOICE_PLACE = null; REPORT_RANGE.from = '2026-10-15'; REPORT_RANGE.to = '2026-10-15'; render();
        const section = document.querySelector('.report-invoice');
        const node = section.querySelector('.report-yosefgeves');
        return { empty: (section.querySelector('.empty-hint') || {}).textContent,
            grid: Boolean(section.querySelector('.invoice-grid')),
            list: node ? [...node.querySelectorAll('tfoot td')].map(td => td.textContent) : null,
            picture: (p => [p.groups.map(group => group.groupTitle), p.empty, p.notes])(readReportPrintout()) };
    });
    // v183 MOVED with the picture: it was no group and the empty sentence; the list is a group now.
    same('the invoice is empty, in the words it always used; the list has its row, and the picture is the list alone', alone,
        { empty: 'אין רישומים בטווח הזה.', grid: false, list: [TOTAL, '4', '4'], picture: [[TITLE], '', [NOTE]] });

    suite('the workbook, written by the shipped library and read back');
    const book = await page.evaluate(async () => {
        REPORT_RANGE.from = '2026-10-02'; REPORT_RANGE.to = '2026-10-15'; INVOICE_PLACE = null; REPORT_SECTION = 'workers'; render();
        if (!(await loadXlsx())) return null;
        let captured = null;
        const write = XLSX.writeFile;
        XLSX.writeFile = (wb, name) => { captured = { bytes: XLSX.write(wb, { type: 'array', bookType: 'xlsx' }), name }; };
        try { await exportReports(); } finally { XLSX.writeFile = write; }
        if (!captured) return null;
        const back = XLSX.read(captured.bytes, { type: 'array' });
        const rows = name => (back.Sheets[name]
            ? JSON.parse(JSON.stringify(XLSX.utils.sheet_to_json(back.Sheets[name], { header: 1, blankrows: true }))) : null);
        return { names: back.SheetNames, own: rows('עובדי יוסף גבס'), bill: rows('חיוב'), rima: rows('רימא') };
    });
    await page.keyboard.press('Escape');
    same('its sheets: the five there were, then the list\'s own, last', book && book.names,
        ['שכר', 'חיוב', 'בלי עובדי רימא', 'פירוט', 'רימא', TITLE]);
    same('the list\'s sheet: full dates, real numbers, the total line, an empty row, the note', book && book.own, [
        ['תאריך', 'Site B', 'Site E', 'Site J', 'סה״כ'],
        ['2026-10-12', 2, 0, 0, 2], ['2026-10-13', 0, 6, 0, 6], ['2026-10-15', 0, 0, 4, 4],
        [TOTAL, 2, 6, 4, 12], [], [NOTE]]);
    same('the חיוב sheet is the one tests/rima.browser.mjs reads: 11 worker-site days', book && book.bill && book.bill.slice(-1),
        [['סה״כ', 1, 4, 1, 5, 11]]);
    same('and the רימא sheet ends as it did', book && book.rima && book.rima.slice(-3)[0], ['סה״כ עובדי רימא', 3, 5, 8]);
    same('no page error on the way', withThem.out.errors, []);
    await withThem.context.close();
}

// ---------------------------------------------------------------- phones
//
// Two boxes where there was one, on the narrowest phone the app is measured on and on the
// owner's, in both schemes, and with the text doubled.
for (const [width, height, scheme] of [[320, 740, 'light'], [375, 667, 'dark'], [390, 844, 'light'], [440, 956, 'dark']]) {
    suite(`${width}x${height} ${scheme}: ten site cards, two counts on each, inside the screen`);

    const { page, errors, context } = await open(width, height,
        { context: { colorScheme: scheme, hasTouch: true, deviceScaleFactor: 2 } });
    await showDay(page, '2026-10-12');
    await page.waitForTimeout(300);
    const m = await page.evaluate(() => {
        const cards = [...document.querySelectorAll('.site-grid > .site-card')];
        const inputs = [...document.querySelectorAll('.site-count-input')];
        const boxes = inputs.map(node => node.getBoundingClientRect());
        const rows = cards.map(card => card.querySelector('.site-counts').getBoundingClientRect());
        const overlap = (a, b) => !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
        const labels = [...document.querySelectorAll('.site-count-label')];
        return {
            cards: cards.length, inputs: inputs.length,
            page: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
            inside: boxes.every(box => box.left >= 0 && box.right <= innerWidth),
            small: boxes.filter(box => box.width < 44 || box.height < 44).length,
            fonts: inputs.filter(node => parseFloat(getComputedStyle(node).fontSize) < 16).length,
            rowHeights: [...new Set(rows.map(row => Math.round(row.height)))],
            touching: cards.filter(card => {
                const pair = [...card.querySelectorAll('.site-count-input')].map(node => node.getBoundingClientRect());
                return overlap(pair[0], pair[1]);
            }).length,
            labelsCut: labels.filter(node => node.scrollWidth > node.clientWidth + 1
                || node.getBoundingClientRect().left < 0).length,
            labelsOverBox: cards.filter(card => {
                const label = card.querySelector('.yosefgeves-label').getBoundingClientRect();
                const other = card.querySelector('.rima-input').getBoundingClientRect();
                return overlap(label, other);
            }).length,
            values: cards.map(card => [...card.querySelectorAll('.site-count-input')].map(node => node.value))
                .filter(pair => pair[0] !== '' || pair[1] !== '')
        };
    });
    same('ten cards, two boxes on each', [m.cards, m.inputs], [10, 20]);
    check('the page does not run off the side, and every box is inside the screen', m.page && m.inside, JSON.stringify(m));
    same('every box is a finger wide and tall, 16px inside', [m.small, m.fonts], [0, 0]);
    // 44, or 45 with the rule above it on a card that has men.
    same('the two share one line on every card: the line is one box tall, never two',
        m.rowHeights.filter(height => height < 44 || height > 46), []);
    same('no box touches the other, no label is cut or lies on the other list\'s box', [m.touching, m.labelsCut, m.labelsOverBox], [0, 0, 0]);
    same('and each shows its own count: Site B has Rima\'s 3 and the list\'s 2', m.values, [['3', '2']]);
    same('no page error', errors, []);
    await context.close();
}

{
    suite('320px with the text doubled: the line wraps rather than running off the side');
    const { page, errors, context } = await open(320, 740, { context: { hasTouch: true, deviceScaleFactor: 2 } });
    await showDay(page, '2026-10-12');
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    await page.waitForTimeout(300);
    const m = await page.evaluate(() => {
        const boxes = [...document.querySelectorAll('.site-count-input')].map(node => node.getBoundingClientRect());
        return { page: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
            inside: boxes.every(box => box.left >= 0 && box.right <= innerWidth),
            small: boxes.filter(box => box.width < 44 || box.height < 44).length };
    });
    check('nothing runs off the side and every box is still a finger', m.page && m.inside && m.small === 0, JSON.stringify(m));
    same('no page error', errors, []);
    await context.close();
}

for (const [width, everywhere] of [[320, false], [390, false], [320, true]]) {
    suite(`${width}px, the list on ${everywhere ? 'all ten sites' : 'three of ten'}: readable, and only what was recorded`);

    const { page, errors, context } = await open(width, 740);
    if (everywhere) {
        await page.evaluate(() => {
            State.schedule.places.forEach((place, i) => setYosefGevesCount(State.schedule, '2026-10-13', place.id, i + 1));
            State.save();
        });
    }
    await page.evaluate(() => { showView('reports'); REPORT_SECTION = 'sites'; INVOICE_PLACE = null; render(); });
    await page.waitForTimeout(250);
    const m = await page.evaluate(() => {
        const node = document.querySelector('.report-yosefgeves');
        const cards = [...node.querySelectorAll('tbody tr')].map(tr => [...tr.children]
            .filter(td => getComputedStyle(td).display !== 'none')
            .map((td, i) => (i === 0 ? td.textContent : td.getAttribute('data-label'))));
        const small = [...node.querySelectorAll('*')].filter(n => n.offsetParent !== null
            && [...n.childNodes].some(c => c.nodeType === 3 && /[\p{L}\p{N}]/u.test(c.textContent))
            && parseFloat(getComputedStyle(n).fontSize) < 14).map(n => n.textContent.slice(0, 16));
        const box = node.getBoundingClientRect();
        return {
            page: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
            inside: box.left >= -1 && box.right <= innerWidth + 1,
            columns: node.querySelectorAll('thead th').length,
            cards, small
        };
    });
    check('the page does not run off the side', m.page && m.inside, JSON.stringify(m));
    same('columns: the date, the sites that had a count, the total', m.columns, everywhere ? 12 : 5);
    check('a day card lists only the sites that had a count that day',
        everywhere ? m.cards[1].length === 12 : JSON.stringify(m.cards[1]) === JSON.stringify(['שלישי 13/10', 'Site E', 'סה״כ']),
        JSON.stringify(m.cards));
    same('nothing in it is too small to read', m.small, []);
    same('no page error', errors, []);
    await context.close();
}

await browser.close();
server.close();
report();
