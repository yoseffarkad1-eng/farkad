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
import { suite, check, given, report } from './runner.mjs';
import { readPdf, pageText, heavyFills } from './pdf.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const EXEC = process.env.CHROME_PATH || undefined;

const server = process.env.SMOKE_URL
    ? { url: process.env.SMOKE_URL, close: () => {} }
    : await serve(new URL('..', import.meta.url).pathname);
const BASE = server.url;
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
    const context = await browser.newContext(options);
    const page = await context.newPage();
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
    '.reorder-live', '.reorder-foot'
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
    await page.waitForTimeout(200);

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

await browser.close();
server.close();
report();
