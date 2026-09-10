// The workbook, built by a phone that is ACTUALLY OFFLINE - in a real browser, off a
// real service worker, and read back out of the bytes it produced.
//
//   node tests/exports-proof.offline.mjs
//
// The claim this exists for is on the front page of CLAUDE.md: "SheetJS is not fetched at
// all any more: vendor/xlsx-0.18.5.min.js is in the service worker's shell, so the export
// works in a tunnel." Everything that measured it measured something adjacent.
//
//   tests/exports-proof.xlsx.mjs proves the export touches no network door, but the
//   library is already in the V8 context when it runs, and the "cold phone" half asserts
//   which URL a <script> tag was pointed at - not that anything answered it.
//
//   tests/smoke.mjs proves the shell list includes the file and that the cache holds it.
//   A file in a cache is not a file a <script> tag gets: the service worker has to be
//   controlling the page, the request has to reach its fetch handler, and the handler has
//   to answer it from that cache rather than from the network it cannot reach.
//
//   tests/xlsx.test.mjs proves what is IN the workbook, with the library handed to it.
//
// None of them is the Tuesday this feature was moved on-origin for: the phone has been in
// a basement all day, the app was opened this morning, and the pay sheet is exported from
// the van. So this one opens the app on a real origin, waits for the service worker to
// take the page, TAKES THE NETWORK AWAY, and then presses export - through
// exportReports(), the production function, with nothing stubbed but the last inch where
// the file would land on a disk. What comes back is a .xlsx, and it is read here by the
// zip and XML readers in tests/exports-proof.lib.mjs, which are deliberately not SheetJS.
//
// It also asks, of that same file, the two questions nothing had asked of any produced
// workbook: whether a leading-zero phone number is still a phone number in the cell, and
// whether a date is still a date somebody can read rather than a serial.
//
// What this CANNOT say: anything about iOS, Files, Excel or Numbers. Headless Chromium
// offline is a browser with the network taken away, which is what a tunnel is; it is not
// an iPhone. Those are acceptance rows and are named as such.
//
// It serves the tree ITSELF and does not take SMOKE_URL, unlike its sibling browser
// suites, because the whole method is switching the origin off part way through and it
// cannot switch off a server somebody else is running. CHROME_PATH and PLAYWRIGHT_MODULE
// work as everywhere else.
//
// AND IT DOES NOT TRUST AN OFFLINE FLAG. Playwright's context.setOffline is the browser's
// own, and it does not reach requests a SERVICE WORKER makes: measured here first, on this
// tree - a page under an offline context fetched an uncached path through the worker's own
// fetch handler and got HTTP 200 back. Since every request this suite cares about goes
// through that handler, an offline flag alone would have proved nothing at all and looked
// exactly like a pass. So the HTTP server is SHUT DOWN, the flag is set as well, and the
// probe that says the network is gone is made through the same worker.

import { serve } from './serve.mjs';
import { verifyServedAssets, expectedShaFor } from './treecheck.mjs';
import { suite, check, same, given, report } from './runner.mjs';
import { workbookOf, tags, attr } from './exports-proof.lib.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const EXEC = process.env.CHROME_PATH || undefined;

const server = await serve(new URL('..', import.meta.url).pathname);
const BASE = server.url;

// Shut once, and the fact remembered: everything after it runs on a device whose origin
// does not answer. Node closes idle keep-alive connections on close(), so a page that
// went on using an open socket cannot quietly keep the origin alive.
let serving = true;
async function stopServing() {
    if (!serving) return;
    serving = false;
    await server.close();
}

// Whatever the ORIGIN handed the browser, hashed against the commit - the same guard
// every other browser suite in this repository opens with.
const SERVED_ROOT = new URL('..', import.meta.url).pathname;
const SERVED = await verifyServedAssets(BASE, SERVED_ROOT, expectedShaFor(SERVED_ROOT));
check('the origin served this commit, byte for byte',
    SERVED.ok, `${SERVED.checked} assets; ${SERVED.wrong.slice(0, 3).join(' | ')}`);

const browser = await chromium.launch(EXEC ? { executablePath: EXEC } : {});

// The crew this file exports.
//
// Two of the three are named the way a crew list on a phone actually gets typed: a man
// entered under his mobile number, once with the dashes and once without. Nobody in the
// office thinks of that as a spreadsheet question until the workbook lands and the second
// one reads 501234567 - the leading zero gone, because a viewer decided the cell was a
// number. It is the same fault that turns a date into 46264, and the same answer decides
// both: the cell has to leave here TYPED AS TEXT, and the only place that is visible is
// xl/worksheets/*.xml.
const WORKERS = [
    { id: 'w_01', name: '050-1234567', active: true, dailyRate: 400, hourlyRate: 50 },
    { id: 'w_02', name: '0501234567', active: true, dailyRate: 400, hourlyRate: 50 },
    { id: 'w_03', name: 'דוד כהן', active: true, dailyRate: 350, hourlyRate: 0 }
];

async function openInstalled() {
    const context = await browser.newContext();
    const page = await context.newPage();
    page.on('dialog', dialog => dialog.accept());
    await page.goto(`${BASE}/index.html`, { waitUntil: 'load' });

    // CONTROLLING, not merely registered. A worker that has installed but not taken the
    // page over answers nothing, and the offline load below would go to the network and
    // fail - which would look exactly like the bug this suite exists to catch.
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller),
        null, { timeout: 20000 });
    return page;
}

// ------------------------------------------------- the other half of the same promise
//
// Run FIRST, because the suite below switches the origin off for good.
//
// The CSV fallback is what the person gets when the library is genuinely not there, and
// after the move on-origin that means the build on the phone is incomplete rather than
// the signal being weak. tests/xlsx.test.mjs pins the sentence in Node. What it cannot
// show is that the fallback still WRITES FILES in a real browser with no network - the
// path a person actually meets it on - or that the sentence calls itself a fallback.
{
    suite('and if the library is not there at all, the CSVs still leave - as a fallback');

    const page = await openInstalled();
    await page.context().setOffline(true);

    await page.evaluate(workers => {
        State.schedule.workers = workers;
        State.schedule.places = [{ id: 'p_01', name: 'הרצליה', active: true }];
        State.save({ silent: true });
        workers.forEach(worker => State.commit(
            assignPlace(State.schedule, '2026-08-10', worker.id, 'actual', 'p_01')));
        REPORT_RANGE.from = '2026-08-01';
        REPORT_RANGE.to = '2026-08-31';
        REPORT_SECTION = 'workers';
        INVOICE_PLACE = null;
    }, WORKERS);

    const out = await page.evaluate(async () => {
        // A shelf that installed without the library: the tag is appended and answered
        // with an error, which is what a phone serving an app it only half has does. The
        // app's own loader, timeout and re-arm are untouched.
        const create = document.createElement.bind(document);
        document.createElement = tag => {
            const node = create(tag);
            if (String(tag).toLowerCase() === 'script') {
                setTimeout(() => { if (node.onerror) node.onerror(new Event('error')); }, 0);
            }
            return node;
        };

        const files = [];
        const realCreate = URL.createObjectURL.bind(URL);
        URL.createObjectURL = blob => { files.push(blob); return realCreate(blob); };
        const realClick = HTMLAnchorElement.prototype.click;
        HTMLAnchorElement.prototype.click = function () {
            files.names = (files.names || []).concat([this.download]);
            // Not pressed: a headless run has no download directory and the bytes are
            // already held above. What is being measured is that the app got this far.
        };

        window.__told = [];
        window.askTell = message => {
            window.__told.push(typeof message === 'string' ? message : JSON.stringify(message));
            return Promise.resolve();
        };
        window.askChoice = () => Promise.resolve('הבנתי');

        await exportReports();
        HTMLAnchorElement.prototype.click = realClick;

        // The BYTES, not blob.text(). The UTF-8 decode behind text() strips a leading
        // byte order mark by specification, so reading the file that way and then looking
        // for the BOM asks a question that can only ever be answered no - which is the
        // shape of assertion that fails for a reason nobody can act on. Excel needs those
        // three bytes at the front of the file or the Hebrew arrives as mojibake, so the
        // three bytes are what is read.
        const texts = [];
        const heads = [];
        for (const blob of files) {
            texts.push(await blob.text());
            heads.push([...new Uint8Array(await blob.slice(0, 3).arrayBuffer())]);
        }
        return { names: files.names || [], texts, heads, told: window.__told };
    });

    same('the three CSVs are still written, offline, and named for the range',
        out.names,
        ['farkad-payroll_2026-08-01_2026-08-31.csv',
            'farkad-invoice_2026-08-01_2026-08-31.csv',
            'farkad-detail_2026-08-01_2026-08-31.csv']);
    check('each begins with the three bytes Excel needs to read Hebrew rather than mojibake',
        out.heads.length === 3
            && out.heads.every(head => String(head) === String([0xef, 0xbb, 0xbf])),
        JSON.stringify(out.heads));
    check('and its rows end CRLF, which is the only line ending Excel splits a CSV on',
        out.texts.every(text => text.includes('\r\n') && !/[^\r]\n/.test(text)),
        JSON.stringify(out.texts.map(text => text.slice(0, 24))));
    check('and the numbers are in them',
        out.texts[0] && out.texts[0].includes('"דוד כהן"') && out.texts[0].includes('"350"'),
        String(out.texts[0]).split('\r\n')[3]);

    // The sentence has to say it is a fallback and not a workbook, or the person opens
    // three CSVs looking for the file their bookkeeper asked for.
    const said = out.told.join(' ');
    check('the person is told these are CSVs instead of Excel', said.includes('CSV')
        && said.includes('Excel'), JSON.stringify(out.told));
    check('and that the numbers are the same numbers', said.includes('המספרים זהים'),
        JSON.stringify(out.told));
    check('and it never calls what it produced a workbook',
        !said.includes('קובץ ה-Excel נמסר'), JSON.stringify(out.told));

    await page.context().close();
}

// ---------------------------------------------------------- the app, then no network
{
    suite('the app is installed, and then the network is taken away');

    const page = await openInstalled();

    // The library is in the shelf the worker filled at install, under the name
    // js/ui/reports.js points a <script> tag at.
    const cached = await page.evaluate(async () => {
        const keys = await caches.keys();
        const found = [];
        for (const key of keys) {
            const cache = await caches.open(key);
            (await cache.keys()).forEach(request => found.push(new URL(request.url).pathname));
        }
        return found;
    });
    check('the service worker precached the spreadsheet library',
        cached.some(path => path.endsWith('/vendor/xlsx-0.18.5.min.js')),
        JSON.stringify(cached.filter(path => path.includes('vendor'))));

    // And it is NOT in the page. A suite that found XLSX already defined would prove
    // nothing about the load, which is the half that needs a network or a cache.
    check('and nothing has loaded it into the page yet',
        await page.evaluate(() => typeof XLSX === 'undefined'));

    // THE TUNNEL, in both of the ways it has to be one.
    //
    // The offline flag is the browser's own and stops the PAGE reaching the wire. It does
    // not stop the SERVICE WORKER: its fetch handler answers an uncached same-origin path
    // by going to the network, and under an offline context that request still came back
    // HTTP 200 on this tree. Since every request an export makes goes through that
    // handler, the flag on its own would have proved nothing.
    //
    // So the origin is shut down as well, and from here the only place the library can
    // come from is the shelf the worker filled at install.
    await page.context().setOffline(true);
    await stopServing();

    // Proved rather than assumed, and proved THROUGH THE WORKER - a path this origin
    // really serves and the worker deliberately does not cache, so the answer can only
    // come off the wire.
    const reachable = await page.evaluate(async base =>
        fetch(`${base}/package.json?offline-probe=${Date.now()}`)
            .then(response => `HTTP ${response.status}`)
            .catch(error => `refused: ${error.name}`), BASE);
    given('the network really is gone, for the worker as well as for the page',
        reachable.startsWith('refused'), reachable);

    // Every request the page makes from here on, and whether it reached the wire. A
    // request the service worker answers never becomes a failure; one that goes past it
    // and finds no network does.
    const failures = [];
    page.on('requestfailed', request => failures.push({
        url: request.url(), why: String(request.failure() && request.failure().errorText)
    }));

    // The crew, one day each, and the report range around it - written through the model
    // the way the day screen writes it.
    await page.evaluate(workers => {
        State.schedule.workers = workers;
        State.schedule.places = [{ id: 'p_01', name: 'הרצליה', active: true }];
        State.save({ silent: true });
        workers.forEach(worker => State.commit(
            assignPlace(State.schedule, '2026-08-10', worker.id, 'actual', 'p_01')));
        REPORT_RANGE.from = '2026-08-01';
        REPORT_RANGE.to = '2026-08-31';
        REPORT_SECTION = 'workers';
        INVOICE_PLACE = null;
        showView('reports');
        render();
    }, WORKERS);

    // THE EXPORT, offline, through the production function.
    //
    // Nothing here loads the library, patches loadXlsx or builds a workbook: exportReports
    // does all of it. The one thing intercepted is the last inch - the anchor SheetJS
    // presses to put the file on a disk - because a headless browser has no Files app and
    // the bytes have to come back to Node to be read. They are taken at
    // URL.createObjectURL, which is where writeFile's own Blob passes, so what is read
    // below is the file the person would have received and not a re-encoding of it.
    const produced = await page.evaluate(async () => {
        const taken = [];
        const real = URL.createObjectURL.bind(URL);
        URL.createObjectURL = blob => { taken.push(blob); return real(blob); };
        // The press itself is held: a headless run has no Files app, the bytes are
        // already caught above, and a real download would only add a temp file. Everything
        // before it - the load, the workbook, the write - is the app's.
        const realClick = HTMLAnchorElement.prototype.click;
        HTMLAnchorElement.prototype.click = function () { taken.pressed = this.download; };
        window.__told = [];
        window.askTell = message => {
            window.__told.push(typeof message === 'string' ? message : JSON.stringify(message));
            return Promise.resolve();
        };
        // The hand-over dialog is a question, not part of the export; answered as the
        // person who is finished with it answers.
        window.askChoice = () => Promise.resolve('הבנתי');

        await exportReports();
        HTMLAnchorElement.prototype.click = realClick;

        const blob = taken[taken.length - 1];
        if (!blob) return { bytes: null, told: window.__told, type: null, count: taken.length };
        const buffer = await blob.arrayBuffer();
        let binary = '';
        new Uint8Array(buffer).forEach(byte => { binary += String.fromCharCode(byte); });
        return {
            bytes: btoa(binary), type: blob.type, count: taken.length,
            told: window.__told, pressed: taken.pressed || null,
            loaded: typeof XLSX !== 'undefined' ? String(XLSX.version) : null
        };
    });

    check('the library loaded with no network, out of the service worker\'s cache',
        produced.loaded !== null && produced.loaded !== undefined, String(produced.loaded));
    // NOTHING OF THIS ORIGIN went past the worker and off the device. Scoped to this
    // origin deliberately, and not narrowed to hide a failure: the one thing in this app
    // that is allowed off-origin is the Firebase SDK, imported by js/app.js AFTER local
    // boot and required to fail soft (CLAUDE.md, "nothing off this origin sits between a
    // person and their data"). Its failure here is that design working, arrives whenever
    // the import settles rather than when the export runs, and is not the export's.
    const ours = failures.filter(item => item.url.startsWith(BASE));
    check('nothing of this origin went past the service worker and off the device',
        ours.length === 0, JSON.stringify(ours.slice(0, 4)));
    check('and the spreadsheet library in particular never reached for the wire',
        !failures.some(item => item.url.includes('xlsx-0.18.5.min.js')),
        JSON.stringify(failures.map(item => item.url).slice(0, 4)));
    check('the person was NOT told the build was incomplete and the numbers came as CSV',
        !produced.told.some(message => message.includes('CSV')),
        JSON.stringify(produced.told));
    given('a file was produced', typeof produced.bytes === 'string' && produced.bytes.length > 0,
        `${produced.count} blob(s), told: ${JSON.stringify(produced.told)}`);

    const bytes = Buffer.from(produced.bytes, 'base64');
    check('and the app handed it over under a name a list reads in order',
        produced.pressed === 'farkad-reports_2026-08-01_2026-08-31.xlsx',
        String(produced.pressed));
    check('and it is a zip, the way every .xlsx is',
        bytes[0] === 0x50 && bytes[1] === 0x4b, bytes.subarray(0, 2).toString('latin1'));

    const book = workbookOf(bytes);
    same('with the three sheets the app appends, named in Hebrew',
        book.names, ['שכר', 'חיוב', 'פירוט']);

    // The direction, in the file, on every sheet - asked again here because this workbook
    // was built by a library loaded a different way, and "it works offline" is worth
    // nothing if what comes out is a different file.
    book.worksheets.forEach(part => {
        const views = tags(book.parts[part].toString('utf8'), 'sheetView');
        check(`${part} still says rightToLeft="1"`,
            views.length > 0 && views.every(view => attr(view, 'rightToLeft') === '1'),
            views.join(' '));
    });

    // ------------------------------------------------ the columns, in the order they read
    //
    // A right-to-left sheet reads its FIRST column on the right. So the order in the file
    // is the order a Hebrew reader meets: who, then what he did, then what he is owed.
    same('שכר opens on the man and closes on his money',
        [book.sheets['שכר'].values[0][0],
            book.sheets['שכר'].values[0][book.sheets['שכר'].values[0].length - 2]],
        ['עובד', 'לתשלום']);
    same('חיוב opens on the date and closes on the total',
        [book.sheets['חיוב'].values[0][0],
            book.sheets['חיוב'].values[0][book.sheets['חיוב'].values[0].length - 1]],
        ['תאריך', 'סה״כ']);
    same('פירוט opens on the date and closes on the day\'s pay',
        [book.sheets['פירוט'].values[0][0],
            book.sheets['פירוט'].values[0][book.sheets['פירוט'].values[0].length - 1]],
        ['תאריך', 'לתשלום ליום']);

    // ------------------------------------------------------------------ Hebrew, as Hebrew
    //
    // Read out of the shared strings and the worksheet parts, not out of a library's own
    // reading of them: a workbook whose Hebrew arrived as mojibake would still round-trip
    // through the writer that produced it.
    const payroll = book.sheets['שכר'].values;
    check('a Hebrew name is Hebrew in the file, not an escape and not mojibake',
        payroll.some(row => row[0] === 'דוד כהן'),
        JSON.stringify(payroll.map(row => row[0])));
    check('and the Hebrew column headings came through whole',
        payroll[0].includes('ימי נוכחות') && payroll[0].includes('נצבר'),
        JSON.stringify(payroll[0]));
    check('the site name reached the billing sheet in Hebrew',
        book.sheets['חיוב'].values[0].includes('הרצליה'),
        JSON.stringify(book.sheets['חיוב'].values[0]));

    // -------------------------------------------------------- a phone number is not a number
    //
    // Both spellings, and both from the cell rather than from the array they were built
    // from. `t` is the cell's OOXML type: SheetJS writes "str" for a string and nothing at
    // all for a number, which the reader in exports-proof.lib.mjs reports as 'number'. A
    // number-typed cell is where the leading zero goes, and it is invisible in the value.
    ['050-1234567', '0501234567'].forEach(written => {
        const at = payroll.findIndex(row => String(row[0]) === written);
        check(`«${written}» is in the workbook exactly as it was typed`, at > 0,
            JSON.stringify(payroll.map(row => row[0])));
        if (at > 0) {
            check(`and its cell is typed as text, so the leading zero cannot be dropped`,
                book.sheets['שכר'].types[at][0] === 'str',
                String(book.sheets['שכר'].types[at][0]));
            check(`and it carries no formula element`,
                book.sheets['שכר'].formulas[at][0] === null,
                String(book.sheets['שכר'].formulas[at][0]));
        }
    });

    // ---------------------------------------------------------------- a date stays a date
    //
    // The two sheets that carry one. A date written as a serial - 46264 for 2026-08-10 -
    // is a column nobody can read without knowing the epoch and the 1900 leap-year bug,
    // and a bookkeeper who sorts by it gets no warning that the label lies. Written as
    // text in ISO order it reads as a date and sorts as one.
    const invoiceDates = book.sheets['חיוב'].values.slice(1, -1);
    check('the billing sheet dates the day in the file, not a serial',
        invoiceDates.length > 0 && invoiceDates.every(row => row[0] === '2026-08-10'),
        JSON.stringify(invoiceDates.map(row => row[0])));
    check('and the cell is text, so no viewer may re-interpret it',
        book.sheets['חיוב'].types.slice(1, -1).every(row => row[0] === 'str'),
        JSON.stringify(book.sheets['חיוב'].types.slice(1, -1).map(row => row[0])));

    const detail = book.sheets['פירוט'];
    check('the detail sheet dates every worker-day the same way',
        detail.values.slice(1).every(row => row[0] === '2026-08-10'),
        JSON.stringify(detail.values.slice(1).map(row => row[0])));
    check('and its cells are text too',
        detail.types.slice(1).every(row => row[0] === 'str'),
        JSON.stringify(detail.types.slice(1).map(row => row[0])));
    check('with the Hebrew day name beside it, so the date is readable without counting',
        detail.values.slice(1).every(row => row[1] === 'שני'),
        JSON.stringify(detail.values.slice(1).map(row => row[1])));

    // ------------------------------------------------------ the pay sheet is still readable
    //
    // The arithmetic is pinned in tests/xlsx.test.mjs against a workbook built with the
    // library handed over. What is asked here is that the file built the hard way says the
    // same things: three men, a row each, the money as NUMBERS a column can total, and a
    // header that names them.
    same('every man on the crew has a row', payroll.length, 4);
    same('and the row reads as the screen does', payroll[3],
        ['דוד כהן', 1, 1, 0, 0, 0, 350, 350, 0, 350, '']);
    check('the money columns are numbers, not text that will not sum',
        [7, 8, 9].every(at => payroll.slice(1).every(row => typeof row[at] === 'number')),
        JSON.stringify(book.sheets['שכר'].types[1]));

    // The totals a person adds up: 400 + 400 + 350.
    const net = payroll[0].indexOf('לתשלום');
    same('and the לתשלום column adds up to what the three men are owed',
        payroll.slice(1).reduce((sum, row) => sum + row[net], 0), 1150);

    // The billing grid's own total row, which is the last row of the sheet.
    const invoiceTotals = book.sheets['חיוב'].values[book.sheets['חיוב'].values.length - 1];
    same('the billing sheet closes on its total: three worker-days on one site',
        invoiceTotals, ['סה״כ', 3, 3]);

    await page.context().close();
}

await browser.close();
await stopServing();
report();
