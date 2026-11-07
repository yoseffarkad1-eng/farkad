// רישום לרימא (v166) in a real browser: the field on every site card, the section under
// «לפי אתר» on the screen and on the paper, the picture, and ten sites on a 320px phone.
//
//   node tests/rima.browser.mjs
//
// The model, the sync, the money and the older builds are in tests/rima.test.mjs; this
// is the part that only a page can answer - what a finger lands on, what the eye reads,
// what the printer is handed. Site and worker names are Latin so the PDF's text can be
// matched without bidi guesswork; the pinned Hebrew is matched in either visual order.

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

const TITLE = 'רישום לרימא';
const NOTE = 'עובדי רימא בלבד. אינם נכללים בשכר. בחיוב שלמעלה כל אחד מהם נספר כיום עובד־אתר אחד.';
const TOTAL = 'סה״כ עובדי רימא';
const REFUSED = 'אפשר לרשום לרימא רק מספר שלם בין 0 ל-99.';
// v167, both pinned word for word (law 6): the invoice without Rima's men, titled and
// totalled in words the page already had, and the workbook's note under the Rima sheet.
const NO_RIMA = 'בלי עובדי רימא';
const NO_RIMA_TOTAL = 'סה״כ ימי עובד־אתר';
const SHEET_NOTE = 'עובדי רימא בלבד. אינם נכללים בשכר. בגיליון החיוב כל אחד מהם נספר כיום עובד־אתר אחד.';
const TEN = Array.from({ length: 10 }, (_, i) => ({
    id: `p_${i}`, name: `Site ${String.fromCharCode(65 + i)}`, active: true }));
const NAMES = ['Dan Levi', 'Omar Saad'];

const reversed = text => text.split('').reverse().join('');
const says = (haystack, phrase) => haystack.includes(phrase) || haystack.includes(reversed(phrase));
const bare = text => String(text || '').replace(/[⁦-⁩]/g, '');
const times = (haystack, phrase) => haystack.split(phrase).length - 1;
const firstAt = (haystack, phrase) => [haystack.indexOf(phrase), haystack.indexOf(reversed(phrase))]
    .filter(at => at !== -1).reduce((one, two) => Math.min(one, two), Infinity);

// The Rima table on a printed page, told apart from the invoice grid above it, which bills
// the same sites and dates. Its total line is its own; each site and date it holds is
// printed a second time; and it is printed in its order - heading, total, then the note.
// And its own rows, read between its heading and its total line, where the grid prints
// nothing: every site in its header, and every date followed by that date's counts - a row
// hidden on paper, or its numbers blanked, leaves the rest of it looking whole.
const PAPER_ROWS = [['12/10', '33'], ['13/10', '55']];
function paperCarriesRimaTable(text, which, want = { sites: ['Site B', 'Site H'], dates: ['13/10'], total: ['3', '5', '8'],
    rows: PAPER_ROWS }) {
    const at = firstAt(text, TOTAL);
    check(`${which}: the Rima total line is printed`, at !== Infinity, text.slice(0, 160));
    const line = at === Infinity ? '' : text.slice(Math.max(0, at - 12), at + TOTAL.length + 12);
    const digits = want.total.join('');
    check(`${which}: with its numbers`, line.includes(digits) || line.includes(reversed(digits)), line);
    check(`${which}: every Rima site and date printed in the table as well as in the grid`,
        want.sites.concat(want.dates).every(phrase => times(text, phrase) + times(text, reversed(phrase)) >= 2),
        JSON.stringify(want.sites.concat(want.dates).map(phrase => [phrase, times(text, phrase)])));
    check(`${which}: heading, total line, note - in that order`,
        firstAt(text, TITLE) < at && at < firstAt(text, NOTE.slice(0, 18)),
        JSON.stringify([firstAt(text, TITLE), at, firstAt(text, NOTE.slice(0, 18))]));
    const from = firstAt(text, TITLE);
    const body = from < at && at !== Infinity ? text.slice(from, at) : '';
    check(`${which}: every Rima site in the table's own header`, want.sites.every(site => says(body, site)), body);
    const placeOf = date => [body.indexOf(date), body.indexOf(reversed(date))].filter(where => where !== -1)
        .reduce((one, two) => Math.min(one, two), Infinity);
    const rowsAt = want.rows.map(([date]) => placeOf(date));
    check(`${which}: every Rima row printed, each date with its own counts`, want.rows.every(([date, digits], row) => {
        if (rowsAt[row] === Infinity) return false;
        const later = rowsAt.filter(where => where > rowsAt[row] && where !== Infinity);
        const cells = body.slice(rowsAt[row] + date.length, later.length > 0 ? Math.min(...later) : body.length);
        return cells.includes(digits) || cells.includes(reversed(digits));
    }), body);
}

// One crew, ten sites. Work on the 12th and the 14th; Rima on the 12th at a site the crew
// worked, and on the 13th - a day with none of the owner's men at all.
async function open(width, height = 844) {
    const context = await browser.newContext({ viewport: { width, height } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${server.url}/index.html`, { waitUntil: 'load' });
    await page.waitForTimeout(350);
    await page.evaluate(([places, names]) => {
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
        State.save();
        REPORT_RANGE.from = '2026-10-02';
        REPORT_RANGE.to = '2026-10-15';
    }, [TEN, NAMES]);
    return { page, errors, context };
}

// ---------------------------------------------------------------- the field
{
    suite('every site card carries a small number field labelled רימא');

    const { page, errors, context } = await open(390);
    await page.evaluate(() => { State.date = '2026-10-14'; showView('day'); render(); });
    await page.waitForTimeout(250);

    const fields = await page.evaluate(() => [...document.querySelectorAll('.site-grid > .site-card')].map(card => {
        const field = card.querySelector('.rima-field');
        const input = field && field.querySelector('input');
        const box = input ? input.getBoundingClientRect() : null;
        return {
            site: (card.querySelector('.site-head .site-name') || {}).textContent,
            label: field ? (field.querySelector('.rima-label') || {}).textContent : null,
            type: input && input.type, mode: input && input.inputMode,
            aria: input && input.getAttribute('aria-label'),
            w: box && Math.round(box.width), h: box && Math.round(box.height),
            font: input ? parseFloat(getComputedStyle(input).fontSize) : 0,
            labelFont: field ? parseFloat(getComputedStyle(field.querySelector('.rima-label')).fontSize) : 0,
            empty: card.classList.contains('site-card-empty')
        };
    }));
    same('all ten cards draw it, the empty ones included',
        [fields.length, fields.filter(f => f.label === 'רימא').length, fields.filter(f => f.empty).length], [10, 10, 9]);
    check('it is a number field, with the numeric keypad',
        fields.every(f => f.type === 'number' && f.mode === 'numeric'), JSON.stringify(fields[0]));
    check('a finger wide and tall', fields.every(f => f.w >= 44 && f.h >= 44),
        JSON.stringify(fields.map(f => [f.w, f.h])));
    check('16px in the box, so the phone does not zoom on it', fields.every(f => f.font >= 16),
        JSON.stringify(fields.map(f => f.font)));
    check('and the label is readable', fields.every(f => f.labelFont >= 14), JSON.stringify(fields.map(f => f.labelFont)));
    check('each is named with its own site', fields.every(f => bare(f.aria) === `רימא ב${f.site}`),
        JSON.stringify(fields.map(f => f.aria)));
    const wide = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
    check('and the day still does not run off the side', wide);

    suite('typing a count records it, journal first, and it survives a reload');
    const field = name => page.locator('.site-grid > .site-card').filter({ hasText: name }).locator('.rima-input');
    await field('Site C').fill('4');
    await field('Site C').evaluate(node => node.blur());
    await page.waitForTimeout(200);
    same('the count is on the record', await page.evaluate(() => rimaCount(State.schedule, '2026-10-14', 'p_2')), 4);
    check('it went into the journal as its one path',
        await page.evaluate(() => FarkadSync.pendingPaths().includes('days.2026-10-14.rima.p_2')));
    check('and it is on the disk', await page.evaluate(() =>
        JSON.parse(localStorage.getItem('scheduleData:v2')).days['2026-10-14'].rima.p_2 === 4));
    // A site with nobody of his on it that day - Rima alone is a record.
    await field('Site D').fill('2');
    await field('Site D').evaluate(node => node.blur());
    await page.waitForTimeout(200);
    same('a count on a card with none of his men is a count all the same',
        await page.evaluate(() => rimaCount(State.schedule, '2026-10-14', 'p_3')), 2);
    check('and that card is still the empty one - his crew is not there',
        await page.locator('.site-grid > .site-card').filter({ hasText: 'Site D' }).evaluate(n => n.classList.contains('site-card-empty')));
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(400);
    await page.evaluate(() => { State.date = '2026-10-14'; showView('day'); render(); });
    await page.waitForTimeout(250);
    same('after a reload the fields show what was typed',
        [await field('Site C').inputValue(), await field('Site D').inputValue(), await field('Site A').inputValue()],
        ['4', '2', '']);

    suite('a count the model refuses is said out loud and leaves nothing behind');
    await field('Site C').fill('150');
    await field('Site C').evaluate(node => node.blur());
    await page.waitForTimeout(250);
    check('the refusal is said, in the pinned words', await page.locator('#askModal').isVisible()
        && (await page.locator('#askMessage').textContent()) === REFUSED,
    await page.locator('#askMessage').textContent());
    await page.locator('#askOk').click();
    await page.waitForTimeout(150);
    same('the record still says 4', await page.evaluate(() => rimaCount(State.schedule, '2026-10-14', 'p_2')), 4);
    same('and so does the field', await field('Site C').inputValue(), '4');
    await field('Site C').fill('');
    await field('Site C').evaluate(node => node.blur());
    await page.waitForTimeout(200);
    same('an empty field clears the count', await page.evaluate(() => rimaCount(State.schedule, '2026-10-14', 'p_2')), 0);
    same('no page error on the way', errors, []);
    await context.close();
}

// ---------------------------------------------------------------- ↶ after a count
{
    // The header's ↶ holds the last step that offered an undo - here a man put on a site
    // through its picker. A count offers none of its own, so ↶ pressed over a count took
    // back HIS day instead: 350 on the pay sheet became 0 and the removal was queued for the
    // cloud, while the count stayed as typed. A count that stands forgets the step behind
    // it, the way leaving the day does.
    suite('a count that stands forgets the step behind it: ↶ cannot take back a man\'s day for it');

    const { page, errors, context } = await open(390);
    await page.evaluate(() => { State.date = '2026-10-14'; showView('day'); render(); });
    await page.waitForTimeout(250);
    const box = name => page.locator('.site-grid > .site-card').filter({ hasText: name }).locator('.rima-input');
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

    // Omar onto Site D through the site's own picker - a door that arms ↶.
    await page.evaluate(() => openWorkerPicker('p_3'));
    await page.locator('#workerPickerList .picker-row[data-worker-id="w_02"] button').click();
    await page.evaluate(() => closeWorkerPicker());
    await page.waitForTimeout(150);
    const before = await omar();
    const armed = await header();
    given('Omar is on Site D, paid for it, and ↶ holds that step',
        JSON.stringify(before) === JSON.stringify({ sites: ['p_3'], pay: 350, disk: ['p_3'] })
        && armed.armed && bare(armed.said) === 'בטל: Omar Saad נוסף לSite D', JSON.stringify([before, armed]));

    // A count the model refuses is not a step: nothing stood, so ↶ is left as it was.
    await box('Site A').fill('150');
    await box('Site A').evaluate(node => node.blur());
    await page.waitForTimeout(200);
    await page.locator('#askOk').click();
    await page.waitForTimeout(150);
    const refused = await header();
    check('a refused count leaves ↶ holding the step that was there',
        refused.armed && bare(refused.said) === 'בטל: Omar Saad נוסף לSite D', JSON.stringify(refused));

    await box('Site A').fill('3');
    await box('Site A').evaluate(node => node.blur());
    await page.waitForTimeout(200);
    same('the count stood', await page.evaluate(() => rimaCount(State.schedule, '2026-10-14', 'p_0')), 3);
    const after = await header();
    check('and ↶ no longer offers Omar\'s step', !after.armed && after.said === 'אין מה לבטל',
        JSON.stringify(after));
    check('nor does the bar at the foot of the screen', !(await page.locator('#undoBar').isVisible()));

    // Pressed anyway, the way a thumb reaches for it to take the count back.
    await page.evaluate(() => document.getElementById('undoBtn').click());
    await page.waitForTimeout(200);
    same('Omar is still on Site D, paid 350, and the disk says so', await omar(), before);
    same('and the count is as typed', await page.evaluate(() => rimaCount(State.schedule, '2026-10-14', 'p_0')), 3);

    // The step after a count is a step like any other: ↶ takes it back, and only it.
    await page.locator('.site-grid > .site-card').filter({ hasText: 'Site C' }).locator('.assign-row')
        .filter({ hasText: 'Dan Levi' }).locator('button.btn-icon').click();
    await page.waitForTimeout(200);
    given('Dan came off Site C', await page.evaluate(() =>
        entriesFor(State.schedule, '2026-10-14', 'w_01', 'actual').length === 0));
    const next = await header();
    check('the step after a count is offered on ↶ like any other', next.armed
        && bare(next.said) === 'בטל: Dan Levi הוסר מSite C', JSON.stringify(next));
    await page.evaluate(() => document.getElementById('undoBtn').click());
    await page.waitForTimeout(200);
    same('and ↶ takes it back', await page.evaluate(() =>
        entriesFor(State.schedule, '2026-10-14', 'w_01', 'actual').map(entry => entry.placeId)), ['p_2']);
    same('no page error on the way', errors, []);
    await context.close();
}

// ---------------------------------------------------------------- a Saturday with Rima only
{
    // The arrows step over an EMPTY Saturday and land on one with anything recorded on it
    // (stepDay, js/ui/day.js). They asked every worker about every layer, and a count is
    // keyed by site - so a Saturday with Rima's men and none of his read as empty, and a
    // day billed to the client was a day the arrows walked past.
    suite('a Saturday holding only a Rima count is landed on by the arrows');

    const { page, errors, context } = await open(390);
    const box = name => page.locator('.site-grid > .site-card').filter({ hasText: name }).locator('.rima-input');
    const fwd = page.getByRole('button', { name: 'יום הבא', exact: true });
    const back = page.getByRole('button', { name: 'יום קודם', exact: true });
    const go = date => page.evaluate(day => { State.date = day; showView('day'); render(); }, date);
    const shown = () => page.evaluate(() => ({ date: State.date,
        name: (document.querySelector('.day-nav .day-label strong') || {}).textContent || '' }));

    // 2026-10-17 is a Saturday: opened on purpose, and three of Rima's men typed at Site E.
    await go('2026-10-17');
    await page.waitForTimeout(200);
    await box('Site E').fill('3');
    await box('Site E').evaluate(node => node.blur());
    await page.waitForTimeout(200);
    given('the Saturday holds a count and nothing of his', await page.evaluate(() =>
        rimaCount(State.schedule, '2026-10-17', 'p_4') === 3
        && State.schedule.workers.every(worker => !isAbsent(State.schedule, '2026-10-17', worker.id, 'actual')
            && entriesFor(State.schedule, '2026-10-17', worker.id, 'actual').length === 0)));

    await go('2026-10-16');
    await fwd.click();
    await page.waitForTimeout(250);
    const fromFriday = await shown();
    check('from Friday, הבא lands on the Saturday with the count',
        fromFriday.date === '2026-10-17' && fromFriday.name === 'יום שבת', JSON.stringify(fromFriday));
    same('and its card shows the count', await box('Site E').inputValue(), '3');
    await go('2026-10-18');
    await back.click();
    await page.waitForTimeout(250);
    const fromSunday = await shown();
    check('from Sunday, קודם lands on it too', fromSunday.date === '2026-10-17', JSON.stringify(fromSunday));

    // Cleared, it is an empty Saturday again - a day record with nothing in it - and the
    // arrows step over it as they always did.
    await go('2026-10-17');
    await page.waitForTimeout(150);
    await box('Site E').fill('');
    await box('Site E').evaluate(node => node.blur());
    await page.waitForTimeout(200);
    given('the count is cleared, and the day record is still there', await page.evaluate(() =>
        rimaCount(State.schedule, '2026-10-17', 'p_4') === 0 && Boolean(State.schedule.days['2026-10-17'])));
    await go('2026-10-16');
    await fwd.click();
    await page.waitForTimeout(250);
    const cleared = await shown();
    check('cleared, the Saturday is stepped over again', cleared.date === '2026-10-18', JSON.stringify(cleared));

    // A count on a site archived since is still a billed day (invoiceReport walks every
    // site, archived ones included), so its Saturday is still a day the arrows land on -
    // even though the day screen, drawing active sites only, no longer shows that card.
    suite('a Saturday whose only count is on a site archived since is still landed on');
    await go('2026-10-24');
    await page.waitForTimeout(150);
    await box('Site F').fill('2');
    await box('Site F').evaluate(node => node.blur());
    await page.waitForTimeout(200);
    await page.evaluate(() => { togglePlaceActive('p_5'); });
    await page.waitForTimeout(150);
    await page.locator('#askOk').click();
    await page.waitForTimeout(200);
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(400);
    given('the Saturday holds a count on Site F, and Site F is archived', await page.evaluate(() =>
        rimaCount(State.schedule, '2026-10-24', 'p_5') === 2 && State.place('p_5').active === false
        && State.schedule.workers.every(worker =>
            entriesFor(State.schedule, '2026-10-24', worker.id, 'actual').length === 0)));
    await go('2026-10-23');
    await fwd.click();
    await page.waitForTimeout(250);
    const fromArchivedFriday = await shown();
    check('from Friday, הבא lands on it', fromArchivedFriday.date === '2026-10-24', JSON.stringify(fromArchivedFriday));
    await go('2026-10-25');
    await back.click();
    await page.waitForTimeout(250);
    const fromArchivedSunday = await shown();
    check('and from Sunday, קודם lands on it', fromArchivedSunday.date === '2026-10-24', JSON.stringify(fromArchivedSunday));
    same('no page error on the way', errors, []);
    await context.close();
}

// ---------------------------------------------------------------- from one site's box to the next
{
    // Counts are typed one site after another. `change` fires while the focus is on its way
    // to the next box, the commit redraws every card, and the box the finger landed on was
    // gone before it could take the focus: the keyboard dropped, the bars came back, and
    // every site after the first needed a second tap.
    suite('a count typed, the next site\'s box tapped: that box has the focus, holding only what is stored');

    const { page, errors, context } = await open(390);
    await page.evaluate(() => { State.date = '2026-10-14'; showView('day'); render(); });
    await page.waitForTimeout(250);
    const box = name => page.locator('.site-grid > .site-card').filter({ hasText: name }).locator('.rima-input');
    const count = placeId => page.evaluate(id => rimaCount(State.schedule, '2026-10-14', id), placeId);
    const focused = () => page.evaluate(() => {
        const node = document.activeElement;
        return {
            rima: Boolean(node && node.classList && node.classList.contains('rima-input')),
            said: node && node.getAttribute ? node.getAttribute('aria-label') : null,
            value: node && typeof node.value === 'string' ? node.value : null,
            live: Boolean(node && node.isConnected),
            id: node ? node.id : null
        };
    });

    await box('Site A').click();
    await page.keyboard.type('3');
    await box('Site B').click();
    await page.waitForTimeout(150);
    same('Site A\'s count was recorded on the way', await count('p_0'), 3);
    const onB = await focused();
    check('and the box tapped has the focus', onB.rima && onB.live && bare(onB.said) === 'רימא בSite B',
        JSON.stringify(onB));
    same('holding only what is stored for it, which is nothing', onB.value, '');
    await page.keyboard.type('5');
    await box('Site C').click();
    await page.waitForTimeout(150);
    same('so what is typed next is Site B\'s', await count('p_1'), 5);
    const onC = await focused();
    check('and the box after that takes the focus in its turn',
        onC.rima && onC.live && bare(onC.said) === 'רימא בSite C', JSON.stringify(onC));
    await page.keyboard.type('2');
    await box('Site C').evaluate(node => node.blur());
    await page.waitForTimeout(150);
    same('three sites, three counts, one tap each', [await count('p_0'), await count('p_1'), await count('p_2')], [3, 5, 2]);

    // A count the model refuses keeps the person on the sentence that says why.
    await box('Site D').click();
    await page.keyboard.type('150');
    await box('Site E').click();
    await page.waitForTimeout(200);
    const told = await focused();
    check('a refused count leaves the focus on the dialog that says why, not in the next box',
        await page.locator('#askModal').isVisible() && told.id === 'askOk', JSON.stringify(told));
    await page.locator('#askOk').click();
    await page.waitForTimeout(150);
    same('and nothing was recorded for it', await count('p_3'), 0);
    same('no page error on the way', errors, []);
    await context.close();
}

// ---------------------------------------------------------------- a redraw under a box being typed in
{
    // A count is saved on `change` - the box left - and not on every key: "1" on its way to
    // "12" is not a count anybody recorded. But in Chromium (the Galaxy) taking a focused,
    // edited box out of the page fires its `change`, and every render rebuilds the day: a
    // snapshot from the other phone, a late echo of this phone's own count. So whatever
    // was half-typed was COMMITTED - the 1 of a 12, or, deleting to retype, a clear - and
    // sent, and billed, and could replace the other phone's count with nothing held. The
    // redraw now takes the box away without a word: the digits go, as they always did on
    // the iPhone, and what is shown is what is stored.
    suite('a redraw while a Rima box is being typed in commits nothing');

    const { page, errors, context } = await open(390);
    await page.evaluate(() => {
        setRimaCount(State.schedule, '2026-10-14', 'p_1', 12);
        setRate(State.schedule, '2026-10-14', 'w_01', 'actual', 'p_2', RATE_EXTRA, 2);
        State.save();
        State.date = '2026-10-14'; showView('day'); render();
    });
    await page.waitForTimeout(250);
    const box = name => page.locator('.site-grid > .site-card').filter({ hasText: name }).locator('.rima-input');
    const stored = () => page.evaluate(() => ({
        b: rimaCount(State.schedule, '2026-10-14', 'p_1'),
        e: rimaCount(State.schedule, '2026-10-14', 'p_4'),
        disk: ((JSON.parse(localStorage.getItem('scheduleData:v2')).days['2026-10-14'] || {}).rima) || {},
        hours: entryExtraHours(entriesFor(State.schedule, '2026-10-14', 'w_01', 'actual')[0]),
        owed: FarkadSync.pendingPaths().filter(path => path.startsWith('days.2026-10-14.'))
    }));
    const redraw = () => page.evaluate(() => { render(); });
    const before = await stored();
    given('Site B holds 12, Dan has 2 extra hours at Site C, and nothing is owed for the day',
        before.b === 12 && before.hours === 2 && before.owed.length === 0, JSON.stringify(before));

    await box('Site E').click();
    await page.keyboard.type('1');
    await redraw();
    await page.waitForTimeout(150);
    same('a "1" on its way to a count is not recorded by the redraw', await stored(), before);
    same('and the box shows what is stored', await box('Site E').inputValue(), '');

    await box('Site B').click();
    await page.keyboard.press('End');
    await page.keyboard.press('Backspace');
    await redraw();
    await page.waitForTimeout(150);
    same('12 being corrected, one digit gone, is still 12', await stored(), before);
    same('and its box says 12', await box('Site B').inputValue(), '12');

    await box('Site B').click();
    await page.keyboard.press('End');
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Backspace');
    await redraw();
    await page.waitForTimeout(150);
    same('emptied to be typed again, it is not cleared by the redraw', await stored(), before);

    // And the box is a box: typed and left, it records.
    await box('Site E').click();
    await page.keyboard.type('4');
    await box('Site E').evaluate(node => node.blur());
    await page.waitForTimeout(200);
    const after = await stored();
    same('a count typed and left is recorded as ever', [after.e, after.owed], [4, ['days.2026-10-14.rima.p_4']]);

    // v167 MOVED THIS ONE, and to the end of the block: the hours box left the row with the
    // rate select (the declutter) and lives in the assign sheet Dan's name opens. A redraw of
    // the day while it holds half-typed hours still records nothing. Last, because the sheet
    // is left open on the box: closing it would be leaving the box, which records.
    await page.locator('.site-grid > .site-card').filter({ hasText: 'Site C' }).locator('.assign-row')
        .filter({ hasText: 'Dan Levi' }).locator('.assign-main').click();
    await page.waitForTimeout(800);
    const hours = page.locator('#assignSheet .rate-hours');
    await hours.click();
    await page.keyboard.press('End');
    await page.keyboard.type('5');
    await redraw();
    await page.waitForTimeout(150);
    same('nor are extra hours half-typed in his sheet - the pay record is as it was', await stored(), after);
    same('no page error on the way', errors, []);
    await context.close();
}

// ---------------------------------------------------------------- ↶ after a count another window got to first
{
    // Two windows of this build on one phone share its disk. The stale one's count for a
    // site the other window has just written is kept in the journal and held - the disk
    // guard - and the person is told it is kept. It did not STAND, so the F5 rule never
    // reached it: ↶ still held the step before it, a man put on a site, and pressed to take
    // the count back it took back his day. A count that was kept forgets the step too; so
    // does a worker's edit kept the same way, which had the same gap.
    suite('a count kept in the journal by the disk guard forgets the step behind it too');

    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const errors = [];
    const seeded = await context.newPage();
    seeded.on('pageerror', error => errors.push(error.message));
    await seeded.goto(`${server.url}/index.html`, { waitUntil: 'load' });
    await seeded.waitForTimeout(350);
    await seeded.evaluate(([places, names]) => {
        State.schedule.workers = [
            { id: 'w_01', name: names[0], active: true, dailyRate: 400, hourlyRate: 50 },
            { id: 'w_02', name: names[1], active: true, dailyRate: 350, hourlyRate: 0 }];
        State.schedule.places = places;
        assignPlace(State.schedule, '2026-10-14', 'w_01', 'actual', 'p_2');
        State.save();
    }, [TEN, NAMES]);
    const stale = await context.newPage();
    stale.on('pageerror', error => errors.push(error.message));
    await stale.goto(`${server.url}/index.html`, { waitUntil: 'load' });
    await stale.waitForTimeout(350);
    for (const page of [seeded, stale]) {
        await page.evaluate(() => { todayStr = () => '2026-10-20'; State.date = '2026-10-14'; showView('day'); render(); });
    }
    await stale.waitForTimeout(250);
    const box = (page, name) => page.locator('.site-grid > .site-card').filter({ hasText: name }).locator('.rima-input');
    const header = page => page.evaluate(() => {
        const undo = document.getElementById('undoBtn');
        return { armed: Boolean(undo && !undo.disabled), said: undo ? undo.getAttribute('aria-label') : null };
    });
    const omar = () => stale.evaluate(() => ({
        sites: entriesFor(State.schedule, '2026-10-14', 'w_02', 'actual').map(entry => entry.placeId),
        disk: ((JSON.parse(localStorage.getItem('scheduleData:v2')).days['2026-10-14'].actual.w_02)
            || { entries: [] }).entries.map(entry => entry.placeId)
    }));

    // In the second window: Omar onto Site D through the site's picker, which arms ↶.
    await stale.evaluate(() => openWorkerPicker('p_3'));
    await stale.locator('#workerPickerList .picker-row[data-worker-id="w_02"] button').click();
    await stale.evaluate(() => closeWorkerPicker());
    await stale.waitForTimeout(150);
    const armed = await header(stale);
    given('Omar is on Site D, and ↶ in this window holds that step',
        JSON.stringify(await omar()) === JSON.stringify({ sites: ['p_3'], disk: ['p_3'] })
        && armed.armed && bare(armed.said) === 'בטל: Omar Saad נוסף לSite D', JSON.stringify(armed));

    // The first window, which has not seen Omar, records 3 at Site A; then the second
    // window, which has not seen that, records 4 there.
    await box(seeded, 'Site A').fill('3');
    await box(seeded, 'Site A').evaluate(node => node.blur());
    await seeded.waitForTimeout(200);
    await box(stale, 'Site A').fill('4');
    await box(stale, 'Site A').evaluate(node => node.blur());
    await stale.waitForTimeout(250);
    const told = await stale.locator('#askMessage').textContent();
    given('the second window\'s count was kept in the journal, and it was told so',
        await stale.locator('#askModal').isVisible() && told.startsWith('השינוי נשמר ברשימת ההמתנה ולא אבד'), told);
    await stale.locator('#askOk').click();
    await stale.waitForTimeout(150);
    const kept = await header(stale);
    check('and ↶ no longer offers Omar\'s step', !kept.armed && kept.said === 'אין מה לבטל', JSON.stringify(kept));
    await stale.evaluate(() => document.getElementById('undoBtn').click());
    await stale.waitForTimeout(200);
    same('pressed anyway, Omar is still on Site D, on the screen and on the disk', await omar(),
        { sites: ['p_3'], disk: ['p_3'] });

    // The same road through a worker's own edit: Dan moved in the first window, then
    // moved differently in the second.
    await stale.evaluate(() => { State.date = '2026-10-15'; render(); State.date = '2026-10-14'; render(); });
    await stale.evaluate(() => openWorkerPicker('p_4'));
    await stale.locator('#workerPickerList .picker-row[data-worker-id="w_02"] button').click();
    await stale.evaluate(() => closeWorkerPicker());
    await stale.waitForTimeout(150);
    const armedAgain = await header(stale);
    given('↶ in the second window holds Omar\'s step onto Site E', armedAgain.armed
        && bare(armedAgain.said) === 'בטל: Omar Saad נוסף לSite E', JSON.stringify(armedAgain));
    await seeded.evaluate(() => {
        editWithUndo('w_01', 'moved', () => assignPlace(State.schedule, '2026-10-14', 'w_01', 'actual', 'p_6'));
    });
    await seeded.waitForTimeout(150);
    const stood = await stale.evaluate(() => editWithUndo('w_01', 'moved',
        () => assignPlace(State.schedule, '2026-10-14', 'w_01', 'actual', 'p_8')));
    await stale.waitForTimeout(200);
    given('the second window\'s edit of Dan did not stand: it was kept, and said so',
        stood === false && await stale.locator('#askModal').isVisible(), String(stood));
    await stale.locator('#askOk').click();
    await stale.waitForTimeout(150);
    const keptWorker = await header(stale);
    check('and ↶ no longer offers Omar\'s step there either', !keptWorker.armed, JSON.stringify(keptWorker));
    same('no page error on the way', errors, []);
    await context.close();
}

// ---------------------------------------------------------------- the bulk edits, kept the same way
{
    // Filling every unrecorded man into one site, copying a day in, emptying a site: worker
    // edits too, committed through commitMany. Kept in the journal by the disk guard the same
    // way, each left ↶ on the step before it, and pressed it took back that man's day. Each
    // road on two fresh windows: a window that has had an edit kept goes on keeping the next
    // one until it has caught up with the disk, which is the guard doing its work.
    suite('a bulk edit kept in the journal by the disk guard forgets the step behind it too');
    const DATE = '2026-10-15';
    const errors = [];
    const dayOf = page => page.evaluate(date => ({
        dan: entriesFor(State.schedule, date, 'w_01', 'actual').map(entry => entry.placeId),
        omar: entriesFor(State.schedule, date, 'w_02', 'actual').map(entry => entry.placeId)
    }), DATE);
    const header = page => page.evaluate(() => {
        const undo = document.getElementById('undoBtn');
        return { armed: Boolean(undo && !undo.disabled), said: undo ? undo.getAttribute('aria-label') : null };
    });
    const pick = (page, workerId) =>
        page.locator(`#workerPickerList .picker-row[data-worker-id="${workerId}"] button`).click();
    for (const [what, run] of [
        ['filling every unrecorded man into one site', stale => stale.evaluate(() => bulkAssign(State.place('p_1')))],
        ['copying a day in',
            stale => stale.evaluate(() => copyDayInto('2026-10-14', 'actual', 'copied', 'nothing to copy', {}))],
        ['emptying a site', async stale => {
            await stale.evaluate(() => { openWorkerPicker('p_3'); clearWorkerPicker(); });
            await stale.waitForTimeout(150);
            await stale.locator('#askOk').click();
        }]]) {
        const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
        const seeded = await context.newPage();
        seeded.on('pageerror', error => errors.push(error.message));
        await seeded.goto(`${server.url}/index.html`, { waitUntil: 'load' });
        await seeded.waitForTimeout(350);
        await seeded.evaluate(([places, names]) => {
            State.schedule.workers = [
                { id: 'w_01', name: names[0], active: true, dailyRate: 400, hourlyRate: 50 },
                { id: 'w_02', name: names[1], active: true, dailyRate: 350, hourlyRate: 0 }];
            State.schedule.places = places;
            assignPlace(State.schedule, '2026-10-14', 'w_01', 'actual', 'p_2');
            State.save();
        }, [TEN, NAMES]);
        const stale = await context.newPage();
        stale.on('pageerror', error => errors.push(error.message));
        await stale.goto(`${server.url}/index.html`, { waitUntil: 'load' });
        await stale.waitForTimeout(350);
        for (const page of [seeded, stale]) {
            await page.evaluate(date => { todayStr = () => '2026-10-20'; State.date = date; showView('day'); render(); }, DATE);
        }
        await stale.waitForTimeout(250);
        // In the second window: Omar onto Site D through the site's picker, which arms ↶ -
        // and, so that there is somebody to empty the site of, Dan there first.
        await stale.evaluate(() => openWorkerPicker('p_3'));
        if (what === 'emptying a site') {
            await pick(stale, 'w_01');
            await stale.waitForTimeout(100);
        }
        await pick(stale, 'w_02');
        await stale.evaluate(() => closeWorkerPicker());
        await stale.waitForTimeout(150);
        const before = await header(stale);
        given(`${what}: ↶ in the second window holds Omar's step onto Site D`, before.armed
            && bare(before.said) === 'בטל: Omar Saad נוסף לSite D', JSON.stringify(before));
        // The first window, opened again so that its own edit stands, records Dan that day
        // differently; the second has not seen that.
        await seeded.reload({ waitUntil: 'load' });
        await seeded.waitForTimeout(350);
        await seeded.evaluate(date => {
            todayStr = () => '2026-10-20'; State.date = date; showView('day'); render();
            editWithUndo('w_01', 'moved', () => assignPlace(State.schedule, date, 'w_01', 'actual', 'p_6'));
        }, DATE);
        await seeded.waitForTimeout(150);
        await run(stale);
        await stale.waitForTimeout(250);
        const told = await stale.locator('#askMessage').textContent();
        given(`${what}: the second window's edit was kept in the journal, and it was told so`,
            await stale.locator('#askModal').isVisible() && told.startsWith('השינוי נשמר ברשימת ההמתנה ולא אבד'), told);
        await stale.locator('#askOk').click();
        await stale.evaluate(() => closeWorkerPicker());
        await stale.waitForTimeout(150);
        const after = await header(stale);
        check(`${what}: and ↶ no longer offers Omar's step`, !after.armed && after.said === 'אין מה לבטל',
            JSON.stringify(after));
        const omarBefore = (await dayOf(stale)).omar;
        await stale.evaluate(() => document.getElementById('undoBtn').click());
        await stale.waitForTimeout(200);
        same(`${what}: pressed anyway, Omar's day is as it was`, (await dayOf(stale)).omar, omarBefore);
        await context.close();
    }
    same('no page error on the way', errors, []);
}

// ---------------------------------------------------------------- ↶ after a restore
{
    // A restore replaces the whole record, and ↶ still held the step made before it: Dan
    // put on Site D. Pressed after a restore point had put him on Site B, it put back his
    // day from before that step - nothing - over the restored one, and his restored day was
    // gone from the screen and the disk with nothing said. Every restore door ends in
    // tellRestoreResult (js/ui/backup.js), and that is where the step is forgotten.
    suite('a restore point restored over an armed ↶ forgets the step: ↶ cannot erase the restored day');
    const { page, errors, context } = await open(390);
    const DATE = '2026-10-15';
    await page.evaluate(date => { State.date = date; showView('day'); render(); }, DATE);
    await page.waitForTimeout(200);
    const dan = () => page.evaluate(date => ({
        sites: entriesFor(State.schedule, date, 'w_01', 'actual').map(entry => entry.placeId),
        disk: ((JSON.parse(localStorage.getItem('scheduleData:v2')).days[date] || {}).actual || {}).w_01
            ? JSON.parse(localStorage.getItem('scheduleData:v2')).days[date].actual.w_01.entries.map(entry => entry.placeId) : []
    }), DATE);
    // A restore point that has Dan on Site B that day.
    await page.evaluate(date => {
        const point = JSON.parse(JSON.stringify(State.schedule));
        assignPlace(point, date, 'w_01', 'actual', 'p_1');
        Store.set(SNAPSHOT_PREFIX + '2026-10-19', JSON.stringify(point));
    }, DATE);
    await page.evaluate(() => openWorkerPicker('p_3'));
    await page.locator('#workerPickerList .picker-row[data-worker-id="w_01"] button').click();
    await page.evaluate(() => closeWorkerPicker());
    await page.waitForTimeout(150);
    const header = () => page.evaluate(() => {
        const undo = document.getElementById('undoBtn');
        return { armed: Boolean(undo && !undo.disabled), said: undo ? undo.getAttribute('aria-label') : null };
    });
    const armed = await header();
    given('Dan is on Site D, and ↶ holds that step', armed.armed && bare(armed.said) === 'בטל: Dan Levi נוסף לSite D'
        && JSON.stringify((await dan()).sites) === JSON.stringify(['p_3']), JSON.stringify(armed));
    await page.evaluate(() => { restoreSnapshot('2026-10-19'); });
    await page.waitForTimeout(150);
    await page.locator('#askOk').click();
    await page.waitForTimeout(400);
    const told = await page.locator('#askMessage').textContent();
    given('the restore point was restored, and it was said', await page.locator('#askModal').isVisible() && told === 'שוחזר.', told);
    await page.locator('#askOk').click();
    await page.waitForTimeout(150);
    same('Dan\'s day is the restored one, on the screen and on the disk', await dan(), { sites: ['p_1'], disk: ['p_1'] });
    const after = await header();
    check('and ↶ no longer offers the step from before the restore', !after.armed && after.said === 'אין מה לבטל',
        JSON.stringify(after));
    await page.evaluate(() => document.getElementById('undoBtn').click());
    await page.waitForTimeout(200);
    same('pressed anyway, the restored day stands', await dan(), { sites: ['p_1'], disk: ['p_1'] });
    same('no page error on the way', errors, []);
    await context.close();
}

// ---------------------------------------------------------------- the screen
{
    suite('under «לפי אתר»: the invoice counts Rima\'s men, then רישום לרימא with its own total');

    const { page, errors, context } = await open(1100);
    await page.evaluate(() => { showView('reports'); REPORT_SECTION = 'sites'; render(); });
    const section = await page.evaluate(() => {
        const node = document.querySelector('.report-invoice .report-rima');
        if (!node) return null;
        return {
            visible: node.offsetParent !== null,
            title: node.querySelector('h3').textContent,
            headers: [...node.querySelectorAll('thead th')].map(th => th.textContent),
            rows: [...node.querySelectorAll('tbody tr')].map(tr => [...tr.children].map(td => td.textContent)),
            total: [...node.querySelectorAll('tfoot td')].map(td => td.textContent),
            note: (node.querySelector('.report-rima-note') || {}).textContent,
            text: node.textContent,
            afterInvoice: Boolean(node.compareDocumentPosition(document.querySelector('.report-invoice .invoice-grid'))
                & Node.DOCUMENT_POSITION_PRECEDING)
        };
    });
    given('the section is drawn', Boolean(section), String(section));
    check('it is on the screen, under the invoice', section.visible && section.afterInvoice);
    same('titled in the pinned words', section.title, TITLE);
    same('two columns - only the two sites that had Rima', section.headers, ['תאריך', 'Site B', 'Site H', 'סה״כ']);
    same('its own dates: the Rima-only day is a row', section.rows.map(r => r[0]), ['שני 12/10', 'שלישי 13/10']);
    same('the counts, blank where a site had none', section.rows, [['שני 12/10', '3', '', '3'], ['שלישי 13/10', '', '5', '5']]);
    same('its own total line', section.total, [TOTAL, '3', '5', '8']);
    same('and the pinned note under it', section.note, NOTE);
    same('it names nobody', NAMES.filter(name => section.text.includes(name)), []);
    // The owner's ruling: on the client's invoice each of Rima's men is one worker-site day,
    // like his own. Site B on the 12th had one of his and three of Rima's; Site H on the
    // 13th had five of Rima's and nobody of his.
    const grid = await page.evaluate(() => {
        const node = document.querySelector('.report-invoice .invoice-grid table');
        return {
            headers: [...node.querySelectorAll('thead th')].map(th => th.textContent),
            rows: [...node.querySelectorAll('tbody tr')].map(tr => [...tr.children].map(td => td.textContent)),
            total: [...node.querySelectorAll('tfoot td')].map(td => td.textContent)
        };
    });
    same('the invoice bills every site that had anybody, Rima\'s men included',
        grid.headers, ['תאריך', 'Site A', 'Site B', 'Site C', 'Site H', 'סה״כ']);
    same('his men plus Rima\'s on each site, and the Rima-only day billed', grid.rows, [
        ['שני 12/10', '1', '4', '', '', '5'],
        ['שלישי 13/10', '', '', '', '5', '5'],
        ['רביעי 14/10', '', '', '1', '', '1']]);
    same('and the invoice total carries them', grid.total, ['סה״כ ימי עובד־אתר', '1', '4', '1', '5', '11']);
    const bars = await page.evaluate(() => [...document.querySelectorAll('.invoice-bar-count')].map(n => n.textContent));
    same('the bars on the screen say the same numbers', bars, ['1', '4', '1', '5']);
    const workers = await page.evaluate(() => { REPORT_SECTION = 'workers'; render();
        return document.querySelector('.report-payroll').textContent; });
    check('«לפי עובד» says nothing about Rima', !workers.includes('רימא'));

    suite('the picture reads the Rima table as a group of its own');
    const picture = await page.evaluate(() => { REPORT_SECTION = 'sites'; render(); return readReportPrintout(); });
    same('two groups: the invoice grid, then Rima', picture.groups.length, 2);
    same('the second is titled רישום לרימא', picture.groups[1].groupTitle, TITLE);
    same('with the same header the screen has', picture.groups[1].headers, ['תאריך', 'Site B', 'Site H', 'סה״כ']);
    same('and the same total', picture.groups[1].totals, [[TOTAL, '3', '5', '8']]);
    check('the note travels with it', picture.notes.includes(NOTE), JSON.stringify(picture.notes));

    suite('on paper, exactly the same');
    const pdf = readPdf(await page.pdf({ format: 'A4', printBackground: true }));
    const text = pdf.pages.map(pageText).join('\n');
    check('the heading is printed', says(text, 'לרימא'), text.slice(0, 120));
    // The invoice grid above prints the same sites and the same Rima-only day - it bills
    // them - and the note says עובדי too, so the Rima TABLE is asked for by what only it
    // carries: its total line, a second copy of its sites and dates, in its own order.
    paperCarriesRimaTable(text, 'the whole range');
    check('the note is printed - it is not a hint the paper drops', says(text, 'נכללים'), '');
    same('and no worker\'s name is on the client\'s paper', NAMES.filter(name => text.includes(name)), []);
    const printed = await page.evaluate(() => {
        const node = document.querySelector('.report-rima');
        return node ? getComputedStyle(node).display : 'none';
    });
    await page.emulateMedia({ media: 'print' });
    const onPaper = await page.evaluate(() => ({
        section: getComputedStyle(document.querySelector('.report-rima')).display,
        note: getComputedStyle(document.querySelector('.report-rima-note')).display
    }));
    check('the section and its note are not hidden on paper',
        printed !== 'none' && onPaper.section !== 'none' && onPaper.note !== 'none', JSON.stringify(onPaper));
    await page.emulateMedia({ media: 'screen' });

    suite('one client chosen for printing: that site\'s Rima only');
    const scoped = await page.evaluate(() => {
        INVOICE_PLACE = 'p_1'; render();
        const node = document.querySelector('.report-rima');
        return node ? [...node.querySelectorAll('thead th')].map(th => th.textContent) : null;
    });
    same('the Rima table narrows to the chosen client\'s site', scoped, ['תאריך', 'Site B', 'סה״כ']);
    const none = await page.evaluate(() => { INVOICE_PLACE = 'p_0'; render(); return Boolean(document.querySelector('.report-rima')); });
    check('a client whose site had no Rima gets no Rima table', none === false);
    const rimaOnly = await page.evaluate(() => {
        INVOICE_PLACE = 'p_7'; render();
        return { client: scopedExportPlace() ? scopedExportPlace().name : null,
            heading: document.querySelector('.report-invoice h2').textContent,
            sheets: Object.keys(reportSheets()) };
    });
    // v167 MOVED: the client's file gains the billing grid without Rima, right after it.
    same('a site billed only for Rima\'s men can be chosen and printed for its client',
        rimaOnly, { client: 'Site H', heading: 'חיוב - Site H', sheets: ['invoice', 'withoutRima', 'rima'] });
    // On that client's paper too. Back to the printer's own media first: the screen
    // emulated above would print the screen, where the grid is hidden and the table shown.
    await page.emulateMedia({ media: null });
    const clientText = readPdf(await page.pdf({ format: 'A4', printBackground: true })).pages.map(pageText).join('\n');
    paperCarriesRimaTable(clientText, 'the Rima-only client',
        { sites: ['Site H'], dates: ['13/10'], total: ['5', '5'], rows: [['13/10', '55']] });
    await page.evaluate(() => { INVOICE_PLACE = null; render(); });
    same('no page error on the way', errors, []);
    await context.close();
}

// ---------------------------------------------------------------- בלי עובדי רימא (v167)
//
// The owner, 2026-11-07: "a list without Rima's men on the same page" - the invoice's own
// grid, his men only. Screen and workbook only («شاشة وإكسل بس»): not on the paper and not
// in the picture, which are the client's. Only when the range in scope has Rima.
{
    suite('בלי עובדי רימא on the screen: the invoice, then it, then רישום לרימא');

    const { page, errors, context } = await open(1100);
    await page.evaluate(() => { showView('reports'); REPORT_SECTION = 'sites'; INVOICE_PLACE = null; render(); });
    const table = () => page.evaluate(() => {
        const node = document.querySelector('.report-invoice .report-norima');
        if (!node) return null;
        const precedes = (a, b) => Boolean(a && b && (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING));
        return {
            visible: node.offsetParent !== null && node.getBoundingClientRect().height > 0,
            title: (node.querySelector('h3') || {}).textContent,
            headers: [...node.querySelectorAll('thead th')].map(th => th.textContent),
            rows: [...node.querySelectorAll('tbody tr')].map(tr => [...tr.children].map(td => td.textContent)),
            total: [...node.querySelectorAll('tfoot td')].map(td => td.textContent),
            order: [precedes(document.querySelector('.report-invoice .invoice-grid'), node),
                precedes(node, document.querySelector('.report-invoice .report-rima'))]
        };
    });
    const shown = await table();
    check('it is drawn and on the screen', Boolean(shown && shown.visible), JSON.stringify(shown));
    same('under the invoice and above רישום לרימא', shown && shown.order, [true, true]);
    same('titled in the pinned words', shown && shown.title, NO_RIMA);
    same('the invoice\'s own columns', shown && shown.headers, ['תאריך', 'Site A', 'Site B', 'Site C', 'Site H', 'סה״כ']);
    same('his men only, on the invoice\'s own days - the Rima-only day empty', shown && shown.rows, [
        ['שני 12/10', '1', '1', '', '', '2'],
        ['שלישי 13/10', '', '', '', '', ''],
        ['רביעי 14/10', '', '', '1', '', '1']]);
    same('its total line, in the invoice\'s words', shown && shown.total, [NO_RIMA_TOTAL, '1', '1', '1', '', '3']);
    same('on the screen, cell by cell: it plus רישום לרימא is the invoice', await page.evaluate(() => {
        const read = selector => {
            const node = document.querySelector(selector);
            if (!node) return null;
            const heads = [...node.querySelectorAll('thead th')].map(th => th.textContent);
            const out = {};
            [...node.querySelectorAll('tbody tr')].forEach(tr => [...tr.children].forEach((td, i) => {
                if (i === 0 || i === heads.length - 1) return;
                out[`${tr.children[0].textContent}|${heads[i]}`] = Number(td.textContent || 0);
            }));
            return out;
        };
        const bill = read('.report-invoice .invoice-grid table');
        const own = read('.report-invoice .report-norima table');
        const rima = read('.report-invoice .report-rima table');
        if (!bill || !own || !rima) return 'missing';
        return Object.keys(bill).filter(key => (own[key] || 0) + (rima[key] || 0) !== bill[key]);
    }), []);
    same('it names nobody', await page.evaluate(names => {
        const node = document.querySelector('.report-norima');
        return node ? names.filter(name => node.textContent.includes(name)) : null;
    }, NAMES), []);

    suite('בלי עובדי רימא is not in the picture');
    const picture = await page.evaluate(() => readReportPrintout());
    same('the picture is still the invoice grid and the Rima table, nothing between',
        picture.groups.map(group => group.groupTitle), ['', TITLE]);
    same('no group in it carries the table\'s title or a second worker-site-day total line',
        picture.groups.filter(group => group.groupTitle === NO_RIMA
            || (group.totals[0] || [])[0] === NO_RIMA_TOTAL).length, 1);

    suite('בלי עובדי רימא is not on paper');
    await page.emulateMedia({ media: 'print' });
    const onPaper = await page.evaluate(() => ({
        own: (n => (n ? getComputedStyle(n).display : 'absent'))(document.querySelector('.report-norima')),
        rima: getComputedStyle(document.querySelector('.report-rima')).display,
        grid: getComputedStyle(document.querySelector('.report-invoice .invoice-grid')).display
    }));
    same('the print stylesheet hides it, and leaves the invoice grid and the Rima table',
        [onPaper.own, onPaper.rima !== 'none', onPaper.grid !== 'none'], ['none', true, true]);
    await page.emulateMedia({ media: null });
    const text = readPdf(await page.pdf({ format: 'A4', printBackground: true })).pages.map(pageText).join('\n');
    check('a real printout does not carry its title', says(text, 'לרימא') && !says(text, NO_RIMA), text.slice(0, 160));
    same('and carries the worker-site-day total line once - the invoice\'s own',
        times(text, NO_RIMA_TOTAL) + times(text, reversed(NO_RIMA_TOTAL)), 1);
    paperCarriesRimaTable(text, 'with the table hidden, the paper as it was');

    suite('בלי עובדי רימא follows the client\'s site, and is not there without Rima');
    const narrowed = await page.evaluate(() => { INVOICE_PLACE = 'p_1'; render(); return true; }) && await table();
    same('one client\'s site: that column and the days it was billed',
        narrowed && [narrowed.headers, narrowed.rows, narrowed.total],
        [['תאריך', 'Site B', 'סה״כ'], [['שני 12/10', '1', '1']], [NO_RIMA_TOTAL, '1', '1']]);
    const rimaOnly = await page.evaluate(() => { INVOICE_PLACE = 'p_7'; render(); return true; }) && await table();
    same('a site billed only for Rima\'s men: its column, empty', rimaOnly && [rimaOnly.headers, rimaOnly.rows],
        [['תאריך', 'Site H', 'סה״כ'], [['שלישי 13/10', '', '']]]);
    same('a client whose site had no Rima: no such table, and no Rima table',
        await page.evaluate(() => { INVOICE_PLACE = 'p_0'; render();
            return [Boolean(document.querySelector('.report-norima')), Boolean(document.querySelector('.report-rima'))]; }),
        [false, false]);
    same('a range with no Rima in it: the invoice alone',
        await page.evaluate(() => { INVOICE_PLACE = null; REPORT_RANGE.from = '2026-10-14'; REPORT_RANGE.to = '2026-10-15'; render();
            return [Boolean(document.querySelector('.report-invoice .invoice-grid')),
                Boolean(document.querySelector('.report-norima')), Boolean(document.querySelector('.report-rima'))]; }),
        [true, false, false]);

    suite('the workbook, written by the shipped library and read back');
    const book = await page.evaluate(async () => {
        REPORT_RANGE.from = '2026-10-02'; REPORT_RANGE.to = '2026-10-15'; INVOICE_PLACE = null; render();
        if (!(await loadXlsx())) return null;
        let captured = null;
        const write = XLSX.writeFile;
        XLSX.writeFile = (wb, name) => { captured = { bytes: XLSX.write(wb, { type: 'array', bookType: 'xlsx' }), name }; };
        try { await exportReports(); } finally { XLSX.writeFile = write; }
        if (!captured) return null;
        const back = XLSX.read(captured.bytes, { type: 'array' });
        const rows = name => (back.Sheets[name]
            ? JSON.parse(JSON.stringify(XLSX.utils.sheet_to_json(back.Sheets[name], { header: 1, blankrows: true }))) : null);
        return { names: back.SheetNames, own: rows('בלי עובדי רימא'), rima: rows('רימא') };
    });
    // The hand-over dialog that follows the file; closed, it writes nothing (askChoice).
    await page.keyboard.press('Escape');
    same('its sheets: בלי עובדי רימא right after חיוב, רימא last', book && book.names,
        ['שכר', 'חיוב', 'בלי עובדי רימא', 'פירוט', 'רימא']);
    same('the sheet without Rima: the billing grid\'s days and sites, his men only, as numbers', book && book.own, [
        ['תאריך', 'Site A', 'Site B', 'Site C', 'Site H', 'סה״כ'],
        ['2026-10-12', 1, 1, 0, 0, 2], ['2026-10-13', 0, 0, 0, 0, 0], ['2026-10-14', 0, 0, 1, 0, 1],
        [NO_RIMA_TOTAL, 1, 1, 1, 0, 3]]);
    same('the רימא sheet: its total line, an empty row, then the note word for word', book && book.rima && book.rima.slice(-3),
        [[TOTAL, 3, 5, 8], [], [SHEET_NOTE]]);
    same('no page error on the way', errors, []);
    await context.close();
}

// ---------------------------------------------------------------- ten sites on a phone
for (const [width, everywhere] of [[320, false], [390, false], [320, true]]) {
    suite(`${width}px, Rima on ${everywhere ? 'all ten sites' : 'two of ten'}: readable, and only what was recorded`);

    const { page, errors, context } = await open(width, 740);
    if (everywhere) {
        await page.evaluate(() => {
            State.schedule.places.forEach((place, i) => setRimaCount(State.schedule, '2026-10-13', place.id, i + 1));
            State.save();
        });
    }
    await page.evaluate(() => { showView('reports'); REPORT_SECTION = 'sites'; INVOICE_PLACE = null; render(); });
    await page.waitForTimeout(250);
    const m = await page.evaluate(() => {
        const node = document.querySelector('.report-rima');
        // A card is its date, then the label of every cell still shown on it.
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
    same('the table without Rima is drawn, and inside the screen', await page.evaluate(() => {
        const node = document.querySelector('.report-norima');
        if (!node) return null;
        const box = node.getBoundingClientRect();
        return box.left >= -1 && box.right <= innerWidth + 1;
    }), true);
    same('columns: the date, the sites that had Rima, the total', m.columns, everywhere ? 12 : 4);
    check('a day card lists only the sites that had Rima that day',
        everywhere ? m.cards[1].length === 12 : JSON.stringify(m.cards[1]) === JSON.stringify(['שלישי 13/10', 'Site H', 'סה״כ']),
        JSON.stringify(m.cards));
    same('nothing in it is too small to read', m.small, []);
    same('no page error', errors, []);
    await context.close();
}

await browser.close();
server.close();
report();
