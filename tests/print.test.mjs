// The print suite: what actually lands on paper.
//
//   node tests/print.test.mjs
//
// Two halves, and neither is a claim about a stylesheet.
//
// The first opens every overlay this app has - the worker's days, the assignment sheet,
// the day drawer, the settings screen - switches the page into PRINT media, and looks at
// the boxes. A modal that is on screen when somebody presses print must not be on the
// paper, and nobody should have to know that in advance.
//
// The second prints a real PDF of a pay sheet long enough to span pages, opens the file,
// and reads it: which text is on which page, what is painted where, how wide the table
// ran. The bug this suite exists for - an open worker-days modal printing its backdrop
// over the pay sheet - produced a grey page and a fragment of one man's days, and both of
// those are facts about a PDF, not about a computed style.

import { serve } from './serve.mjs';
import { verifyServedAssets, expectedShaFor } from './treecheck.mjs';
import { suite, check, same, given, report } from './runner.mjs';
import { readPdf, pageText, heavyFills } from './pdf.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const EXEC = process.env.CHROME_PATH || undefined;

const server = process.env.SMOKE_URL
    ? { url: process.env.SMOKE_URL, close: () => {} }
    : await serve(new URL('..', import.meta.url).pathname);
const BASE = server.url;

// Whatever the ORIGIN handed the browser, hashed against the commit.
//
// SMOKE_URL points this suite at a server somebody is already running. Nothing checked
// what that server served, so an origin rooted at another tree passed every check in this
// file and the count meant nothing. Each shell path is fetched and compared with the Git
// blob at the commit under test - which is also the honest answer to "which bytes did
// these numbers come from".
const SERVED_ROOT = new URL('..', import.meta.url).pathname;
const SERVED_SHA = expectedShaFor(SERVED_ROOT);
const SERVED = await verifyServedAssets(BASE, SERVED_ROOT, SERVED_SHA);
check('the origin served this commit, byte for byte',
    SERVED.ok, `${SERVED.checked} assets; ${SERVED.wrong.slice(0, 3).join(' | ')}`);

const browser = await chromium.launch(EXEC ? { executablePath: EXEC } : {});

// A page in an RTL PDF stores its text in VISUAL order, so a Hebrew phrase comes back
// reversed. Both readings are the same words on the paper.
const reversed = text => text.split('').reverse().join('');
const says = (haystack, phrase) => haystack.includes(phrase) || haystack.includes(reversed(phrase));

// One printed row arrives as a dozen separate text runs sharing a baseline. Grouped by
// that baseline they are the line somebody reads.
function linesOf(page) {
    const rows = new Map();
    page.texts.forEach(item => {
        const key = Math.round(item.y / 3);
        if (!rows.has(key)) rows.set(key, { y: item.y, items: [] });
        rows.get(key).items.push(item);
    });
    return [...rows.values()]
        .sort((a, b) => b.y - a.y)
        .map(row => ({
            y: row.y,
            text: row.items.sort((a, b) => a.x - b.x).map(item => item.text).join('')
        }));
}

async function open(options = {}) {
    // `flags` opens a shut feature gate for THIS page, before the app loads, through the
    // one seam js/model/schema.js reads at definition time - the same thing a build with
    // the flag on would do. The shipped defaults are closed and pinned elsewhere; a suite
    // that prints the carried debt is printing the build somebody would ship with the
    // gates open, and says so by asking for them.
    const { flags, ...contextOptions } = options;
    const context = await browser.newContext(contextOptions);
    const page = await context.newPage();
    if (flags) {
        await page.addInitScript(held => { window.FARKAD_FLAG_OVERRIDES = held; }, flags);
    }
    page.on('dialog', dialog => dialog.accept());
    await page.goto(`${BASE}/index.html`, { waitUntil: 'load' });
    await page.waitForTimeout(350);
    return page;
}

// A crew, a site, and a month of one day's work - enough for a pay sheet with totals.
async function seed(page, workers = 6) {
    await page.evaluate(count => {
        State.schedule.workers = Array.from({ length: count }, (unused, i) => ({
            id: `w_${i + 1}`,
            name: `Worker ${String(i + 1).padStart(2, '0')}`,
            active: true,
            dailyRate: 400,
            hourlyRate: 50
        }));
        State.schedule.places = [{ id: 'p_01', name: 'Site A', active: true }];
        for (let i = 0; i < count; i += 1) {
            assignPlace(State.schedule, '2026-08-10', `w_${i + 1}`, 'actual', 'p_01');
        }
        State.save();
        REPORT_RANGE.from = '2026-08-01';
        REPORT_RANGE.to = '2026-08-31';
        showView('reports');
        render();
    }, workers);
    await page.waitForTimeout(300);
}

// Every overlay and every piece of chrome this app draws, by the selector the stylesheet
// has to have caught. Anything with a box on paper is a failure, whatever it is.
const CHROME = [
    '.modal', '.sheet', '#assignSheet', '#workerDaysModal', '#shareModal', '#askModal',
    '#workerFormModal', '#signInModal', '#quickModal', '#migrationModal',
    '#workerPickerModal', '#placePickerModal',
    '.settings-panel', '.drawer-wrap', '.day-drawer', '.drawer-backdrop',
    '.undo-bar', '.day-actions', '.tabs', '.topbar', '.banner', '.storage-notice',
    '.reorder-panel', '.reorder-live', '.reorder-foot'
];

// What is left with a box once the page is in print media.
async function printableChrome(page) {
    return page.evaluate(selectors => {
        const out = [];
        selectors.forEach(selector => {
            document.querySelectorAll(selector).forEach(node => {
                const style = getComputedStyle(node);
                const box = node.getBoundingClientRect();
                const painted = style.display !== 'none'
                    && style.visibility !== 'hidden'
                    && (box.width > 0.5 || box.height > 0.5);
                if (painted) {
                    out.push({
                        selector,
                        id: node.id || '',
                        display: style.display,
                        position: style.position,
                        w: Math.round(box.width),
                        h: Math.round(box.height)
                    });
                }
            });
        });
        return out;
    }, selectors());
}

function selectors() { return CHROME; }

// ---------------------------------------------------------------- overlays open

for (const scenario of [
    {
        name: 'a worker-details modal is open when print is pressed',
        mobile: false,
        arrange: async page => {
            await page.evaluate(() => openWorkerDays('w_1'));
            await page.waitForTimeout(300);
            return '#workerDaysModal';
        }
    },
    {
        name: 'an assignment sheet is open when print is pressed',
        mobile: false,
        arrange: async page => {
            await page.evaluate(() => {
                State.date = '2026-08-10';
                showView('day');
                render();
                openAssignSheet('w_1');
            });
            await page.waitForTimeout(300);
            return '#assignSheet';
        }
    },
    {
        name: 'the day drawer and the mobile dock are up when print is pressed',
        mobile: true,
        arrange: async page => {
            await page.evaluate(() => {
                State.date = '2026-08-10';
                showView('day');
                render();
                openDayDrawer();
            });
            await page.waitForTimeout(300);
            return '#dayDrawer';
        }
    },
    {
        name: 'the settings screen is open when print is pressed',
        mobile: true,
        arrange: async page => {
            await page.evaluate(() => openSettings());
            await page.waitForTimeout(300);
            return '#settingsPanel';
        }
    }
]) {
    suite(scenario.name);

    const page = await open(scenario.mobile
        ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
        : {});
    await seed(page);

    const opened = await scenario.arrange(page);
    const before = await page.evaluate(selector => ({
        open: getComputedStyle(document.querySelector(selector)).display !== 'none',
        view: currentView,
        schedule: JSON.stringify(State.schedule)
    }), opened);
    given('the overlay is genuinely open on screen', before.open === true);

    await page.emulateMedia({ media: 'print' });
    await page.waitForTimeout(250);

    const printable = await printableChrome(page);
    check('nothing the app draws over the page has a box on paper',
        printable.length === 0, JSON.stringify(printable).slice(0, 300));

    // And the thing being printed is still all there.
    const content = await page.evaluate(() => {
        const view = document.getElementById(currentView + 'View');
        const table = document.querySelector('#reportsView .report-payroll table');
        return {
            view: currentView,
            visible: view ? getComputedStyle(view).display !== 'none' : false,
            text: view ? view.textContent : '',
            headers: table ? [...table.querySelectorAll('thead th')].map(th => th.textContent) : [],
            rows: table ? table.querySelectorAll('tbody tr').length : 0,
            totals: table ? (table.querySelector('tfoot') || {}).textContent || '' : ''
        };
    });

    if (content.view === 'reports') {
        check('the pay sheet is still printable', content.visible === true);
        check('with its title and period', content.text.includes('שכר') && content.text.includes('2026'),
            content.text.slice(0, 60));
        check('its column headings', content.headers.length >= 4, JSON.stringify(content.headers));
        check('every worker row', content.rows === 6, String(content.rows));
        check('and its totals', content.totals.includes('סה״כ'), content.totals.slice(0, 40));
    } else {
        check('the screen being printed is still printable', content.visible === true);
        check('and it still has the day on it', content.text.length > 0);
    }

    // Nothing was closed, switched or rewritten to achieve any of that.
    await page.emulateMedia({ media: 'screen' });
    await page.waitForTimeout(250);
    const after = await page.evaluate(selector => ({
        open: getComputedStyle(document.querySelector(selector)).display !== 'none',
        view: currentView,
        schedule: JSON.stringify(State.schedule)
    }), opened);

    check('the overlay is still open afterwards, exactly as it was',
        after.open === true, JSON.stringify(after.open));
    check('the screen is still on the same view', after.view === before.view,
        `${before.view} -> ${after.view}`);
    check('and not one byte of the record was touched',
        after.schedule === before.schedule);

    await page.context().close();
}

// ---------------------------------------------------------------- the PDF itself

{
    suite('a pay sheet long enough to need pages, printed with a modal open');

    const page = await open();
    await seed(page, 30);
    await page.evaluate(() => openWorkerDays('w_1'));
    await page.waitForTimeout(400);

    const modalText = await page.evaluate(() =>
        document.getElementById('workerDaysModal').textContent.replace(/\s+/g, ' ').trim());
    given('the modal really is open, with words of its own on it',
        modalText.length > 10, modalText.slice(0, 60));

    const buffer = await page.pdf({ format: 'A4', printBackground: true });
    const pdf = readPdf(buffer);
    const pages = pdf.pages;
    const texts = pages.map(pageText);

    given('the print produced a real PDF', buffer.length > 2000, `${buffer.length} bytes`);
    check('and it runs to more than one page', pages.length >= 2, String(pages.length));

    // The failure this suite is named after.
    check('no page carries the modal\'s heading',
        !texts.some(text => says(text, 'פירוט הימים')), texts.map(t => t.slice(0, 40)).join(' | '));
    check('no page carries the sheet\'s wording',
        !texts.some(text => says(text, 'נשמרת מיד') || says(text, 'דלג')),
        texts.map(t => t.slice(0, 40)).join(' | '));
    check('no page carries the tab bar',
        !texts.some(text => says(text, 'עובדים ואתרים') || says(text, 'דוחות') && says(text, 'שבוע')),
        '');

    // A page with nothing on it is a page somebody prints, looks at, and throws away.
    const empty = pages.filter(item => pageText(item).trim().length === 0);
    check('no blank page', empty.length === 0, JSON.stringify(empty.map(item => item.index)));

    // The grey page: a full-sheet fill in anything but white.
    const grey = pages.map(item => heavyFills(item)).flat();
    check('nothing is painted across a whole sheet', grey.length === 0,
        JSON.stringify(grey.slice(0, 3)));

    // The pay sheet's own pages, and the headings that have to be on all of them.
    const payrollPages = pages.filter(item => says(pageText(item), 'ימי נוכחות'));
    check('the pay sheet spans more than one page', payrollPages.length >= 2,
        String(payrollPages.length));
    check('and its column headings are repeated on every one of them',
        payrollPages.every(item => says(pageText(item), 'עובד')
            && says(pageText(item), 'ימי שכר')),
        JSON.stringify(payrollPages.map(item => item.index)));

    // Every worker reached the paper, and the totals are whole.
    const all = texts.join('');
    const missing = [];
    for (let i = 1; i <= 30; i += 1) {
        if (!all.includes(`Worker ${String(i).padStart(2, '0')}`)) missing.push(i);
    }
    check('every one of the thirty men is on the paper', missing.length === 0,
        JSON.stringify(missing));

    // Which side of the paper the table starts on.
    //
    // The whole report is Hebrew, so the first column is עובד and it belongs on the RIGHT.
    // Nothing in the app says so out loud - the page is dir="rtl" and the PDF comes out of
    // it - which is exactly why it is worth an assertion: the print stylesheet is a large
    // block of overrides, and a direction inherited rather than declared is the kind of
    // thing a later rule takes away without anybody noticing until a bookkeeper says the
    // table reads backwards.
    //
    // Measured as positions rather than read as text: the heading row's rightmost run
    // must be the worker column, and the leftmost must be the money.
    const headingLine = linesOf(payrollPages[0])
        .filter(line => says(line.text, 'ימי נוכחות')).shift();
    check('the pay sheet has a heading row on the paper', Boolean(headingLine),
        JSON.stringify(linesOf(payrollPages[0]).slice(0, 3).map(l => l.text.slice(0, 40))));

    if (headingLine) {
        const runs = payrollPages[0].texts
            .filter(item => Math.abs(item.y - headingLine.y) < 3)
            .sort((a, b) => a.x - b.x);
        const width = payrollPages[0].width;

        // WHICH heading is where, not merely that something reaches both edges - a table
        // spans the page in either direction, so the weaker version of this passes just
        // as well upside down.
        const join = items => items.map(item => item.text).join('');
        const rightThird = join(runs.filter(item => item.x > width * 0.62));
        const leftThird = join(runs.filter(item => item.x < width * 0.28));

        check('the column that names the worker is on the right, where Hebrew starts',
            says(rightThird, 'עובד'), JSON.stringify(rightThird.slice(0, 30)));
        check('and what he is owed is on the left, where the line ends',
            says(leftThird, 'לתשלום'), JSON.stringify(leftThird.slice(0, 30)));

        // The rows under the heading have to follow it, or the columns are right-to-left
        // and what sits in them is not. Said as "name on the right, money on the left"
        // rather than by looking for Hebrew letters: the crew in this fixture is called
        // Worker 1 to Worker 30, and a Latin name in an RTL table belongs in exactly the
        // same column as a Hebrew one.
        const firstRow = linesOf(payrollPages[0])
            .filter(line => line.y < headingLine.y - 5 && /\d/.test(line.text))[0];
        check('the pay sheet has a row under the heading', Boolean(firstRow),
            JSON.stringify(linesOf(payrollPages[0]).slice(0, 4).map(l => l.text.slice(0, 30))));

        if (firstRow) {
            const cells = payrollPages[0].texts
                .filter(item => Math.abs(item.y - firstRow.y) < 3)
                .sort((a, b) => a.x - b.x);
            const name = cells[cells.length - 1];
            const money = cells[0];
            check('a worker\'s name is on the right, under the column that names it',
                name.x > width * 0.6 && !/^[\d,.\s]+$/.test(name.text),
                JSON.stringify({ text: name.text, x: Math.round(name.x) }));
            check('and his money is on the left, under the column that totals it',
                money.x < width * 0.4 && /\d/.test(money.text),
                JSON.stringify({ text: money.text, x: Math.round(money.x) }));
        }
    }

    // The PAY SHEET's totals, on the pay sheet's own last page - not the invoice's, which
    // is a different table with a different total further on.
    const totalsPage = payrollPages.filter(item => says(pageText(item), 'סה״כ')).pop();
    check('the totals row is printed', Boolean(totalsPage),
        JSON.stringify(payrollPages.map(item => pageText(item).slice(-30))));

    if (totalsPage) {
        // Grouped into lines by their baseline, because a printed row arrives as a dozen
        // separate runs and the label is not one of them on its own.
        const lines = linesOf(totalsPage);
        const totalsLine = lines.filter(line => says(line.text, 'סה״כ')).pop();

        check('the totals row is one line on the page', Boolean(totalsLine),
            JSON.stringify(lines.slice(-3).map(line => line.text.slice(0, 40))));

        if (totalsLine) {
            check('and it is inside the page rather than clipped at the edge',
                totalsLine.y > 8 && totalsLine.y < totalsPage.height - 8,
                JSON.stringify({ y: Math.round(totalsLine.y),
                    height: Math.round(totalsPage.height) }));

            // The numbers beside the label: a totals row cut off part way down the page
            // prints its heading and none of what it totals.
            check('with its numbers beside it', /\d{2,}/.test(totalsLine.text),
                totalsLine.text.slice(0, 80));
            check('and the money it adds up to', /12000/.test(totalsLine.text),
                totalsLine.text.slice(0, 80));
        }
    }

    // The wording that belongs to an overlay and to nothing else, swept across every
    // page of the file.
    //
    // Worth being exact about what this catches and what it does not. Headless Chromium
    // does not paint a fixed overlay into page.pdf() at all, so on THIS engine these
    // phrases are absent either way - the leak the audit found is a real browser's
    // Ctrl+P behaviour, and the assertion that catches it is the print-media one above,
    // which goes red without the stylesheet fix. This one holds the same line from the
    // other direction, on the engines that do paint them.
    const overlayWords = [
        ['the worker-days modal', 'יום נוכחות אחד'],
        ['the worker-days modal', 'שלח לעובד'],
        ['the assignment sheet', 'נשמרת מיד'],
        ['the day drawer', 'לאיזה יום'],
        ['the settings screen', 'הגדרות וכלים'],
        ['the tab bar', 'עובדים ואתרים'],
        ['the day dock', 'מהיום הקודם'],
        ['the storage notice', 'נשמרים במכשיר']
    ];
    const leaked = overlayWords.filter(([, phrase]) => texts.some(text => says(text, phrase)));
    check('no page carries the wording of anything that floats over the app',
        leaked.length === 0, JSON.stringify(leaked));

    // Nothing ran off the edge, and the table is not squeezed into a corner.
    const widest = pages.map(item => {
        const xs = item.texts.map(text => text.x);
        return {
            index: item.index,
            min: Math.min(...xs),
            max: Math.max(...xs),
            width: item.width
        };
    });
    check('no text is printed outside the page',
        widest.every(item => item.min > -1 && item.max < item.width + 1),
        JSON.stringify(widest));
    check('and the table uses the width of the paper rather than a corner of it',
        widest.every(item => (item.max - item.min) > item.width * 0.5),
        JSON.stringify(widest.map(item => ({
            page: item.index,
            spread: Math.round(((item.max - item.min) / item.width) * 100) + '%'
        }))));

    await page.context().close();
}

{
    suite('the site report on paper still names no worker');

    const page = await open();
    await seed(page, 8);

    // Selected, not merely rendered. This suite used to print without choosing, and got
    // the invoice on the paper because BOTH reports printed - which was the leak. Asking
    // for the client's report is now the only way to get it, and is what the person
    // sending one actually does.
    await page.evaluate(() => {
        if (typeof REPORT_SECTION !== 'undefined') REPORT_SECTION = 'sites';
        render();
    });
    await page.waitForTimeout(300);

    const buffer = await page.pdf({ format: 'A4', printBackground: true });
    const pdf = readPdf(buffer);

    // The invoice is the page handed to the client. Who was on the site is the
    // employer's business.
    const invoicePages = pdf.pages.filter(item => says(pageText(item), 'לפי אתר'));
    given('the invoice reached the paper', invoicePages.length >= 1,
        JSON.stringify(pdf.pages.map(item => pageText(item).slice(0, 30))));

    const named = [];
    invoicePages.forEach(item => {
        const text = pageText(item);
        for (let i = 1; i <= 8; i += 1) {
            const name = `Worker ${String(i).padStart(2, '0')}`;
            if (text.includes(name)) named.push({ page: item.index, name });
        }
    });
    check('and it names nobody', named.length === 0, JSON.stringify(named));

    await page.context().close();
}

// ---------------------------------------------------------------- what the client may see
//
// The leak this file existed to catch and did not.
//
// Both reports are always in the document; the one not being looked at carries
// .report-offscreen. That class was hidden under @media screen ONLY, so selecting a
// client's report and pressing print produced a PDF whose second page was the PAYROLL -
// every worker's name, every daily rate, the gross and the net - addressed to the client.
//
// It survived because the assertions here searched the pages they had already classified
// as invoice pages. The leaked page is a payroll page, so it was never in the set being
// searched. A privacy test that only looks where it expects the answer is not a privacy
// test: this one reads EVERY page of the document and fails on anything that belongs to
// the crew rather than to the client.
{
    suite('a client\'s report carries nothing about the crew');

    const page = await open();
    await page.evaluate(() => {
        // Names and rates chosen to be unmistakable in a text dump: nothing else in the
        // app produces them, so a match is the leak and not a coincidence.
        State.schedule.workers = [
            { id: 'w_01', name: 'זהבצחוקי', active: true, dailyRate: 777, hourlyRate: 55 },
            { id: 'w_02', name: 'קרמבולה', active: true, dailyRate: 888, hourlyRate: 60 }
        ];
        State.schedule.places = [{ id: 'p_01', name: 'הרצליה', active: true }];
        ['2026-08-10', '2026-08-11', '2026-08-12'].forEach(date => {
            assignPlace(State.schedule, date, 'w_01', 'actual', 'p_01');
            assignPlace(State.schedule, date, 'w_02', 'actual', 'p_01');
        });
        State.schedule.advances = { w_01: [{ id: 'a1', date: '2026-08-05', amount: 512, note: '' }] };
        State.save();
        showView('reports');
        REPORT_RANGE.from = '2026-08-01';
        REPORT_RANGE.to = '2026-08-31';
        if (typeof REPORT_SECTION !== 'undefined') REPORT_SECTION = 'sites';
        render();
    });
    await page.waitForTimeout(500);

    // The user's route, dialog and all: a detail modal left open is the ordinary state of
    // somebody who checked a number before printing.
    const opened = await page.evaluate(() => {
        if (typeof openWorkerDays === 'function') { openWorkerDays('w_01'); return true; }
        return false;
    });
    await page.waitForTimeout(300);

    const buffer = await page.pdf({ format: 'A4', printBackground: true });
    const { pages } = readPdf(buffer);
    // Every page. Not the pages already believed to be the client's.
    const whole = pages.map(pageText).join('\n');
    const shows = phrase => says(whole, phrase);

    check('the client gets the report he was sent', shows('חיוב'),
        JSON.stringify(pages.map(item => pageText(item).slice(0, 24))));

    check('and not a worker\'s name', !shows('זהבצחוקי') && !shows('קרמבולה'),
        JSON.stringify(pages.map((item, i) => shows('זהבצחוקי') ? i : null).filter(i => i !== null)));
    check('nor the payroll\'s title', !shows('שכר - לפי עובד'), '');
    check('nor a daily rate', !whole.includes('777') && !whole.includes('888'), '');
    check('nor an advance handed over in cash', !whole.includes('512'), '');
    check('nor the words the pay sheet totals with', !shows('לתשלום'), '');

    if (opened) {
        // And the modal that was open over it is not on the paper either.
        check('nor the dialog that was open while he pressed print',
            !shows('ימים של'), '');
    }

    await page.context().close();
}

{
    suite('and the pay sheet carries nothing about the client');

    // The same failure in the other direction: printing payroll must not append the
    // client's report to the back of it.
    const page = await open();
    await page.evaluate(() => {
        State.schedule.workers = [{ id: 'w_01', name: 'זהבצחוקי', active: true, dailyRate: 777 }];
        State.schedule.places = [{ id: 'p_01', name: 'קוממיות', active: true }];
        assignPlace(State.schedule, '2026-08-12', 'w_01', 'actual', 'p_01');
        State.save();
        showView('reports');
        REPORT_RANGE.from = '2026-08-01';
        REPORT_RANGE.to = '2026-08-31';
        if (typeof REPORT_SECTION !== 'undefined') REPORT_SECTION = 'workers';
        render();
    });
    await page.waitForTimeout(500);

    const { pages } = readPdf(await page.pdf({ format: 'A4', printBackground: true }));
    const whole = pages.map(pageText).join('\n');

    check('the pay sheet is what was printed', says(whole, 'שכר - לפי עובד'), '');
    check('and the client\'s report is not behind it', !says(whole, 'חיוב - לפי אתר'),
        JSON.stringify(pages.map(item => pageText(item).slice(0, 24))));

    await page.context().close();
}

// ------------------------------------------------- the warning has to reach the paper
//
// A pay sheet's warnings are not decoration. "שעות נוספות בלי שכר שעה - לא נכללו" says a
// man worked hours this sheet did NOT pay him for, and it is the one line that stops the
// total being read as the whole story. The print stylesheet hides almost everything by
// default and lifts this class back out by name - a cascade that is correct today and
// that nothing measured, so a later `display: none` on a parent would have taken the
// warning off the paper and left the number that needs it.
{
    suite('a pay sheet that is missing hours says so on the paper too');

    const page = await open();
    await page.evaluate(() => {
        // One man with hours and NO hourly rate: the case the warning exists for. His
        // three extra hours cannot be priced, so they are not in his total.
        State.schedule.workers = [
            { id: 'w_1', name: 'Worker 01', active: true, dailyRate: 400, hourlyRate: 0 }];
        State.schedule.places = [{ id: 'p_01', name: 'Site A', active: true }];
        assignPlace(State.schedule, '2026-08-10', 'w_1', 'actual', 'p_01', RATE_EXTRA, 3);
        State.save();
        REPORT_RANGE.from = '2026-08-01';
        REPORT_RANGE.to = '2026-08-31';
        showView('reports');
        render();
    });
    await page.waitForTimeout(300);

    const onScreen = await page.evaluate(() =>
        document.getElementById('reportsView').textContent);
    given('the screen carries the warning to begin with',
        onScreen.indexOf('שעות נוספות בלי שכר שעה') !== -1,
        onScreen.replace(/\s+/g, ' ').slice(0, 120));

    const buffer = await page.pdf({ format: 'A4', printBackground: true });
    const pdf = readPdf(buffer);
    const texts = pdf.pages.map(pageText);
    given('the print produced a real PDF', buffer.length > 2000, `${buffer.length} bytes`);

    check('the warning is on the printed page, not only on the screen',
        texts.some(text => says(text, 'שעות נוספות בלי שכר שעה')),
        texts.map(t => t.replace(/\s+/g, ' ').slice(0, 80)).join(' | '));

    await page.context().close();
}

{
    suite('a carried debt and a correction, on the paper');

    // The pay sheet is what somebody is handed and paid from, and paper wins every
    // argument. Two numbers on it are only ever right with the gates open: a deduction
    // capped at the wage, with the rest of a real advance carrying to the next account,
    // and money returned by a CORRECTION rather than by a man handing cash back. Both are
    // read off a real PDF here, printed by the real page.
    //
    // Both money gates are opened for this page through the seam: the shipped defaults
    // are closed, and this is the build a person would ship by opening them.
    const page = await open({ flags: { carryAdvances: true, ledgerWrites: true } });
    await page.evaluate(() => {
        State.schedule.workers = [{ id: 'w_1', name: 'Worker 01', active: true,
            dailyRate: 500, hourlyRate: 50 }];
        State.schedule.places = [{ id: 'p_01', name: 'Site A', active: true }];
        State.commitMany(recordNewAdvance(State.schedule, 'w_1', '2026-08-10', 5000, '',
            '2026-08-10T09:00:00.000Z', 'd_print', 'cash'));
        ['2026-08-07', '2026-08-10', '2026-08-11', '2026-08-12', '2026-08-13']
            .forEach(date => State.commit(assignPlace(State.schedule, date, 'w_1',
                'actual', 'p_01')));
        State.commit(assignPlace(State.schedule, '2026-08-14', 'w_1', 'actual', 'p_01',
            RATE_EXTRA, 1));
        const plan = planCarryMigration(State.schedule);
        if (plan.needed) {
            State.commit(recordCarryApproval(State.schedule, plan,
                '2026-08-15T08:00:00.000Z', 'd_print'));
        }
        const repay = recordAdvanceRepaid(State.schedule,
            Object.keys(State.schedule.advances)[0], 400, '2026-08-16', '',
            '2026-08-16T09:00:00.000Z', 'd_print', 'cash');
        State.commit(repay);
        State.commit(recordEventReversed(State.schedule, repay.value.id, 400,
            '2026-08-17', 'wrong man', '2026-08-17T09:00:00.000Z', 'd_print'));
        REPORT_RANGE.from = '2026-08-07';
        REPORT_RANGE.to = '2026-08-20';
        showView('reports');
        render();
    });
    await page.waitForTimeout(300);

    const account = await page.evaluate(() =>
        advanceAccount(State.schedule, 'w_1', '2026-08-07', '2026-08-20'));
    given('the record the page is drawing: 3,050 off, 1,950 carried, 400 corrected',
        account.deducted === 3050 && account.carriedForward === 1950
        && account.reversed === 400,
        JSON.stringify(account));

    // THE THREE MONEY CELLS, off the rendered table rather than out of the PDF's text
    // stream, because what has to hold is that they RECONCILE and a bag of numbers in
    // reading order cannot say which cell is which.
    const table = await page.evaluate(() => {
        const head = [...document.querySelectorAll('#reportsView thead th')]
            .map(th => th.textContent.trim());
        const cells = tr => [...tr.children].map(td => td.textContent.trim());
        const body = [...document.querySelectorAll('#reportsView tbody tr')].map(cells);
        const foot = [...document.querySelectorAll('#reportsView tfoot tr')].map(cells);
        return { head, body, foot: foot.length ? foot : body.slice(-1) };
    });
    const number = text => Number(String(text).replace(/[^0-9.-]/g, '')) || 0;
    const at = name => table.head.indexOf(name);
    // THE COLUMN IS NAMED AFTER WHAT IS IN IT, which is C6's decision and is why this
    // no longer looks for מקדמות. This fixture approves the carry migration - the given
    // above it reads 3,050 deducted, which only happens once somebody has - so the cell
    // holds the DEDUCTION and the heading says so. Before approval it would be the
    // advances and would be called מקדמות; see deductionColumnName in js/ui/reports.js
    // and tests/wording.test.mjs for the rule, and tests/smoke.mjs for both sides of it.
    const DEDUCTED = 'נוכה מהשכר';
    given('the sheet drew its three money columns',
        at('נצבר') !== -1 && at(DEDUCTED) !== -1 && at('לתשלום') !== -1,
        JSON.stringify(table.head));
    given('and named the money column after the deduction it holds, not the advance',
        at('מקדמות') === -1, JSON.stringify(table.head));

    const worker = table.body.find(cells => cells[0].indexOf('Worker 01') !== -1);
    given('his row is on the sheet', Array.isArray(worker), JSON.stringify(table.body));
    // The column holds a DEDUCTION, and the deduction and the advance are the same
    // number only while an advance is smaller than the wage. Printed as the 5,000 handed
    // over, beside a net of 0 computed from the 3,050 actually taken, the row said
    // 3050 − 5000 = 0 - and the band under it then totalled -1,950 as לתשלום: a negative
    // wage, on the sheet the man is paid from, for a fortnight in which he was owed
    // nothing and paid nothing.
    same('the row reconciles: נצבר less the deduction is לתשלום',
        number(worker[at('נצבר')]) + number(worker[at(DEDUCTED)]),
        number(worker[at('לתשלום')]),
        JSON.stringify(worker));
    same('and it is the deduction in the column, as it is in the exported file',
        [number(worker[at('נצבר')]), number(worker[at(DEDUCTED)]),
            number(worker[at('לתשלום')])], [3050, -3050, 0]);
    const band = table.foot[table.foot.length - 1];
    same('the band under it adds up the same way',
        number(band[at('נצבר')]) + number(band[at(DEDUCTED)]),
        number(band[at('לתשלום')]), JSON.stringify(band));

    const buffer = await page.pdf({ format: 'A4', printBackground: true });
    const pdf = readPdf(buffer);
    const texts = pdf.pages.map(pageText);
    given('the print produced a real PDF', buffer.length > 2000, `${buffer.length} bytes`);

    // THE NUMBER THAT WOULD OTHERWISE VANISH. 1,950 of an advance he was handed is still
    // owed, this fortnight's paper is the last document that mentions it, and the column
    // it used to sit in now correctly shows something else.
    check('the paper says what is still owed after the deduction',
        texts.some(text => says(text, 'ועוברות לחשבון הבא')),
        texts.map(t => t.replace(/\s+/g, ' ').slice(0, 300)).join(' | '));
    check('and names the correction, so 400 is not read as cash he settled',
        texts.some(text => says(text, 'תיקון-היפוך')),
        texts.map(t => t.replace(/\s+/g, ' ').slice(0, 300)).join(' | '));

    await page.context().close();
}

// ---------------------------------------------------------------- a range on the paper

{
    suite('a range on the paper reads from left to right');

    // "01/08/2026 - 31/08/2026" is two left-to-right runs around a neutral hyphen, and in
    // a right-to-left paragraph the RUNS lay out right to left: the later date lands on
    // the left, and the period printed under the report's heading reads backwards to an
    // eye that reads a date left to right. The PDF keeps every glyph's x, so the paper
    // is measured, not the stylesheet: the earlier date's digits sit at the smaller x.
    const page = await open();
    await seed(page);
    const buffer = await page.pdf({ format: 'A4', printBackground: true });
    const pdf = readPdf(buffer);
    given('the print produced a real PDF', buffer.length > 2000, `${buffer.length} bytes`);

    // Each baseline's digits in x order, with where each digit starts. The slashes come
    // back as their own runs or not at all, depending on the font; the digits are what
    // tells the two dates apart and they always do.
    const digitLines = page0 => {
        const rows = new Map();
        page0.texts.forEach(item => {
            const key = Math.round(item.y / 3);
            if (!rows.has(key)) rows.set(key, []);
            rows.get(key).push(item);
        });
        return [...rows.values()].map(items => {
            const sorted = items.sort((a, b) => a.x - b.x);
            let digits = '';
            const xs = [];
            sorted.forEach(item => {
                for (const ch of item.text) {
                    if (/\d/.test(ch)) { digits += ch; xs.push(item.x); }
                }
            });
            return { digits, xs };
        });
    };
    const ranges = pdf.pages.flatMap(digitLines)
        .map(line => ({ from: line.digits.indexOf('01082026'), to: line.digits.indexOf('31082026'), line }))
        .filter(found => found.from >= 0 && found.to >= 0)
        .map(found => ({ fromX: Math.round(found.line.xs[found.from]), toX: Math.round(found.line.xs[found.to]) }));
    given('the paper carries the period, under each report\'s heading',
        ranges.length >= 1, JSON.stringify(ranges));
    check('and every one of them has the earlier date at the smaller x - on the left',
        ranges.length >= 1 && ranges.every(found => found.fromX < found.toX), JSON.stringify(ranges));
    await page.context().close();
}

// ---------------------------------------------------------------- no blank first page
//
// The invoice starts on a fresh page so that it never shares a sheet with the pay sheet
// in front of it. With «לפי אתר» chosen there is no pay sheet on the paper - it is set
// aside with .report-offscreen - but it is still the invoice's preceding sibling in the
// document, so the invoice was not :first-child and the break stayed. The client's
// report came out of the printer behind an empty sheet, and on a phone's print preview
// the first page shown was a blank one.
{
    suite('the client\'s report does not start behind a blank page');

    const page = await open();
    await seed(page, 8);

    // The person's route: the real toggle, not the variable behind it.
    const paged = async () => {
        const { pages } = readPdf(await page.pdf({ format: 'A4', printBackground: true }));
        return pages.map(item => pageText(item).replace(/\s+/g, ' ').trim());
    };

    const workers = await paged();
    given('the pay sheet prints with text on its first page',
        workers.length >= 1 && workers[0].length > 0, JSON.stringify(workers.map(t => t.slice(0, 24))));
    check('and no page of it is blank', workers.every(text => text.length > 0),
        JSON.stringify(workers.map(t => t.length)));

    await page.locator('.report-section-toggle button', { hasText: 'לפי אתר' }).click();
    await page.waitForTimeout(300);
    given('«לפי אתר» is now the section on screen',
        await page.evaluate(() => REPORT_SECTION === 'sites'
            && getComputedStyle(document.querySelector('.report-payroll')).display === 'none'), '');

    const sites = await paged();
    check('the client\'s report starts on the first page',
        sites.length >= 1 && says(sites[0], 'לפי אתר'), JSON.stringify(sites.map(t => t.slice(0, 24))));
    check('and no page of it is blank', sites.every(text => text.length > 0),
        JSON.stringify(sites.map(t => t.length)));
    // One report, one sheet: the page that used to be empty is gone, and nothing else
    // moved - the pay sheet's own count is what the client's report is measured against.
    check('one report is one sheet, the same as the pay sheet',
        sites.length === workers.length, `${sites.length} vs ${workers.length}`);

    // Back the same way, and the pay sheet is what it was.
    await page.locator('.report-section-toggle button', { hasText: 'לפי עובד' }).click();
    await page.waitForTimeout(300);
    const again = await paged();
    check('switching back changes nothing on the pay sheet',
        again.length === workers.length && again.every(text => text.length > 0)
            && says(again[0], 'לפי עובד'),
        JSON.stringify(again.map(t => t.slice(0, 24))));

    await page.context().close();
}

await browser.close();
server.close();
report();
