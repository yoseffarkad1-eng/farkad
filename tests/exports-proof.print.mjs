// The printed page and the picture beside it, proved against the artefacts they produce.
//
//   node tests/exports-proof.print.mjs
//   CHROME_PATH=/path/to/chromium node tests/exports-proof.print.mjs
//
// tests/print.test.mjs already prints real PDFs and reads them: print isolation, the
// client's report naming nobody, the warning that reaches the paper, no blank first page.
// tests/smoke.mjs already draws the fallback picture and samples its pixels. This suite
// asks the five questions neither of them asks, and asks each of them of the thing that
// actually leaves the phone:
//
//   1. THE FALLBACK IS AN IMAGE, and nothing in the app calls it a PDF. Read off the
//      first eight bytes of the blob, not off its MIME type - a Blob is whatever type
//      string it was constructed with.
//   2. A CANCELLED SHARE SHEET IS NOT A DOWNLOAD. Backing out of the iOS share sheet
//      rejects with AbortError; falling through to a download there hands the person a
//      file they just declined, and the next export is then the second copy of it.
//   3. A SECOND TAP INSIDE THE WAIT IS ONE OFFER, not two stacked dialogs - and after
//      the picture has gone out, exporting again produces exactly one more.
//   4. THE CLIENT'S PICTURE DISCLOSES NOTHING. print.test.mjs proves this of the PDF;
//      the picture is a second document, drawn by different code, and it goes out through
//      WhatsApp - which is the door the client's copy actually leaves by.
//   5. THE SENTENCE THAT EXPLAINS THE ROW. After a raise mid-period a total is no longer
//      days times the rate printed beside it, and the screen says so. Whether the paper
//      and the picture say it is measured here rather than read off a stylesheet.
//
// What this cannot say: how any of it looks to an eye on a real iPhone. The board's
// PrintAcceptance list is explicitly a manual step on a physical device and nothing here
// ticks any of it.

import { serve } from './serve.mjs';
import { verifyServedAssets, expectedShaFor } from './treecheck.mjs';
import { suite, check, same, given, report } from './runner.mjs';
import { readPdf, pageText } from './pdf.mjs';
import { readFileSync } from 'node:fs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const EXEC = process.env.CHROME_PATH || undefined;
const server = process.env.SMOKE_URL
    ? { url: process.env.SMOKE_URL, close: () => {} }
    : await serve(new URL('..', import.meta.url).pathname);
const BASE = server.url;

// WHATEVER THE ORIGIN HANDED THE BROWSER, HASHED AGAINST THE COMMIT - the same seam and
// the same instrument as tests/print.test.mjs beside it. SMOKE_URL points this suite at a
// server somebody else is running, and without this an origin rooted at another tree
// passes every check below and the count means nothing. tests/isolation.test.mjs and
// tests/blobs.test.mjs both refuse a suite that takes an override and checks nothing.
const SERVED_ROOT = new URL('..', import.meta.url).pathname;
const SERVED_SHA = expectedShaFor(SERVED_ROOT);
const SERVED = await verifyServedAssets(BASE, SERVED_ROOT, SERVED_SHA);
check('the origin served this commit, byte for byte',
    SERVED.ok, `${SERVED.checked} assets; ${SERVED.wrong.slice(0, 3).join(' | ')}`);
const browser = await chromium.launch(EXEC ? { executablePath: EXEC } : {});

const OFFER = 'ההדפסה לא נפתחה במסך הזה. לשתף את הטבלה כתמונה?';
const IMAGE = 'שיתוף כתמונה';

async function open(options = {}) {
    const { flags, ...contextOptions } = options;
    const context = await browser.newContext(contextOptions);
    const page = await context.newPage();
    if (flags) await page.addInitScript(held => { window.FARKAD_FLAG_OVERRIDES = held; }, flags);
    page.on('dialog', dialog => dialog.accept());
    await page.goto(`${BASE}/index.html`, { waitUntil: 'load' });
    await page.waitForTimeout(350);
    return page;
}

// The share sheet, the download and window.print, all recorded rather than performed.
// `share` decides what the sheet does: 'ok', 'abort' (the person backed out) or 'fail'.
async function instrument(page) {
    await page.evaluate(() => {
        window.__printCalls = 0;
        window.print = () => { window.__printCalls += 1; };
        window.__shared = [];
        window.__clicks = [];
        window.__shareMode = 'ok';
        HTMLAnchorElement.prototype.click = function () {
            window.__clicks.push({ href: String(this.href), download: String(this.download) });
        };
        Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
        Object.defineProperty(navigator, 'share', {
            configurable: true,
            value: async data => {
                const files = (data && data.files) || [];
                const first = files[0];
                // The BYTES, kept, so the artefact can be opened rather than described.
                const head = first
                    ? [...new Uint8Array(await first.slice(0, 8).arrayBuffer())] : null;
                window.__shared.push({
                    title: data && data.title,
                    name: first ? first.name : null,
                    type: first ? first.type : null,
                    size: first ? first.size : 0,
                    head
                });
                if (window.__shareMode === 'abort') {
                    throw Object.assign(new Error('cancelled'), { name: 'AbortError' });
                }
                if (window.__shareMode === 'fail') throw new Error('no');
            }
        });
    });
}

const readOffer = page => page.evaluate(() => ({
    shown: document.getElementById('askModal').style.display === 'flex',
    message: document.getElementById('askMessage').textContent,
    dialogs: document.querySelectorAll('#askModal').length,
    choices: [...document.querySelectorAll('#askChoices button')]
        .filter(node => node.offsetParent !== null).map(node => node.textContent),
    printed: window.__printCalls
}));

const choose = (page, label) => page.evaluate(text => {
    const found = [...document.querySelectorAll('#askChoices button')]
        .find(node => node.textContent === text);
    if (!found) return false;
    found.click();
    return true;
}, label);

async function seedReport(page) {
    await page.evaluate(() => {
        State.schedule.workers = [
            { id: 'w_01', name: 'דוד', active: true, dailyRate: 400, hourlyRate: 50 },
            { id: 'w_02', name: 'שרה', active: true, dailyRate: 350, hourlyRate: 0 }
        ];
        State.schedule.places = [{ id: 'p_01', name: 'הרצליה', active: true }];
        ['2026-08-10', '2026-08-11', '2026-08-12'].forEach(date => {
            assignPlace(State.schedule, date, 'w_01', 'actual', 'p_01');
            assignPlace(State.schedule, date, 'w_02', 'actual', 'p_01');
        });
        State.save();
        showView('reports');
        REPORT_RANGE.from = '2026-08-01';
        REPORT_RANGE.to = '2026-08-31';
        if (typeof REPORT_SECTION !== 'undefined') REPORT_SECTION = 'workers';
        render();
    });
    await page.waitForTimeout(400);
}

// ---------------------------------------------------------------- 1. it is an image
{
    suite('the fallback is an image, and nothing in the app calls it a PDF');

    const page = await open();
    await seedReport(page);
    await instrument(page);

    const drawn = await page.evaluate(async () => {
        const out = printoutImage('report');
        if (!out) return { drew: false };
        const head = [...new Uint8Array(await out.blob.slice(0, 8).arrayBuffer())];
        return { drew: true, name: out.name, type: out.blob.type, size: out.blob.size, head };
    });
    given('the picture was drawn', drawn.drew === true, JSON.stringify(drawn));
    // ‰PNG\r\n\x1a\n - the file's own signature, not the type the Blob was built with.
    same('its first eight bytes are the PNG signature',
        drawn.head, [137, 80, 78, 71, 13, 10, 26, 10]);
    same('the blob calls itself image/png', drawn.type, 'image/png');
    check('and it is named .png', /\.png$/.test(String(drawn.name)), String(drawn.name));
    check('with bytes in it', drawn.size > 2000, String(drawn.size));

    // The file that goes out through the share sheet is that same picture.
    await page.locator('#reportsView').getByRole('button', { name: /הדפסה/ }).click();
    await page.waitForTimeout(2000);
    const offer = await readOffer(page);
    given('the offer is on screen', offer.shown && offer.message === OFFER,
        JSON.stringify(offer));
    await choose(page, IMAGE);
    await page.waitForTimeout(600);
    const shared = await page.evaluate(() => window.__shared);
    same('one file was handed to the share sheet', shared.length, 1);
    same('a PNG, by its signature', shared[0].head, [137, 80, 78, 71, 13, 10, 26, 10]);
    check('named .png, not .pdf', /\.png$/.test(String(shared[0].name)), String(shared[0].name));

    // AND NOT CALLED A PDF ANYWHERE A PERSON READS. The word appears in this repository
    // only in comments and in a CSS note; a string is what reaches a person.
    const quoted = /'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g;
    const named = [];
    ['js/ui/printout.js', 'js/ui/reports.js', 'js/ui/week.js', 'js/ui/share.js']
        .forEach(file => {
            const code = readFileSync(new URL('../' + file, import.meta.url), 'utf8');
            // Comments out first, so the reasoning above a line is not read as a string
            // the app shows.
            const stripped = code.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
            let found;
            while ((found = quoted.exec(stripped)) !== null) {
                const text = found[1] || found[2] || found[3] || '';
                if (/pdf/i.test(text)) named.push({ file, text });
            }
        });
    check('no string the app shows calls the picture, or anything else, a PDF',
        named.length === 0, JSON.stringify(named));

    await page.context().close();
}

// ------------------------------------------------- 2. a cancelled sheet is not a download
{
    suite('backing out of the share sheet leaves nothing behind, and the next export is one file');

    const page = await open();
    await seedReport(page);
    await instrument(page);
    await page.evaluate(() => { window.__shareMode = 'abort'; });

    await page.locator('#reportsView').getByRole('button', { name: /הדפסה/ }).click();
    await page.waitForTimeout(2000);
    given('the offer is on screen', (await readOffer(page)).shown, '');
    await choose(page, IMAGE);
    await page.waitForTimeout(700);

    let state = await page.evaluate(() => ({ shared: window.__shared, clicks: window.__clicks }));
    same('the sheet was offered the picture once', state.shared.length, 1);
    check('and backing out did not fall through to a download',
        state.clicks.length === 0, JSON.stringify(state.clicks));
    check('nor to a message saying there is no way out',
        (await page.evaluate(() => document.getElementById('askModal').style.display)) !== 'flex',
        '');

    // The person tries again, and the sheet takes it this time. ONE more file, not two.
    await page.evaluate(() => { window.__shareMode = 'ok'; });
    await page.locator('#reportsView').getByRole('button', { name: /הדפסה/ }).click();
    await page.waitForTimeout(2000);
    await choose(page, IMAGE);
    await page.waitForTimeout(700);
    state = await page.evaluate(() => ({ shared: window.__shared, clicks: window.__clicks }));
    same('the second attempt hands over exactly one more', state.shared.length, 2);
    same('and still nothing was downloaded behind it', state.clicks.length, 0);
    same('the two files carry the same name, being the same table',
        state.shared[0].name, state.shared[1].name);

    // A share that FAILS is a different thing from one that was cancelled: there the
    // download IS the next door, and it must open.
    await page.evaluate(() => { window.__shareMode = 'fail'; });
    await page.locator('#reportsView').getByRole('button', { name: /הדפסה/ }).click();
    await page.waitForTimeout(2000);
    await choose(page, IMAGE);
    await page.waitForTimeout(700);
    state = await page.evaluate(() => ({ shared: window.__shared, clicks: window.__clicks }));
    same('a sheet that refused the picture falls through to a download', state.clicks.length, 1);
    check('of the same picture, by name',
        state.clicks[0].download === state.shared[0].name, JSON.stringify(state.clicks));

    await page.context().close();
}

// ---------------------------------------------------- 3. a second tap inside the wait
{
    suite('a second tap while nothing is happening is one offer, not two');

    const page = await open();
    await seedReport(page);
    await instrument(page);

    const button = page.locator('#reportsView').getByRole('button', { name: /הדפסה/ });
    await button.click();
    await page.waitForTimeout(300);
    await button.click();
    await page.waitForTimeout(2200);

    const offer = await readOffer(page);
    check('print was called once, not twice', offer.printed === 1, JSON.stringify(offer));
    check('and one dialog is on screen, offering the two answers',
        offer.shown && JSON.stringify(offer.choices) === JSON.stringify([IMAGE, 'ביטול']),
        JSON.stringify(offer));

    await choose(page, 'ביטול');
    await page.waitForTimeout(300);
    const after = await page.evaluate(() => ({
        shown: document.getElementById('askModal').style.display === 'flex',
        shared: window.__shared.length, clicks: window.__clicks.length
    }));
    same('saying no writes nothing and leaves nothing on screen',
        [after.shown, after.shared, after.clicks], [false, 0, 0]);

    await page.context().close();
}

// -------------------------------------------- 4. the client's picture discloses nothing
{
    suite('the picture of the client\'s report names no worker and no wage');

    const page = await open();
    await page.evaluate(() => {
        State.schedule.workers = [
            { id: 'w_01', name: 'זהבצחוקי', active: true, dailyRate: 777, hourlyRate: 55 },
            { id: 'w_02', name: 'קרמבולה', active: true, dailyRate: 888, hourlyRate: 60 }
        ];
        State.schedule.places = [{ id: 'p_01', name: 'הרצליה', active: true }];
        ['2026-08-10', '2026-08-11'].forEach(date => {
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
    await page.waitForTimeout(400);

    // EVERY STRING THE DRAWING PUTS ON THE CANVAS, recorded at fillText - which is the
    // only place ink becomes words. Sampling pixels could not answer this question.
    const drawn = await page.evaluate(() => {
        const proto = CanvasRenderingContext2D.prototype;
        const real = proto.fillText;
        const words = [];
        proto.fillText = function (text, ...rest) {
            words.push(String(text));
            return real.call(this, text, ...rest);
        };
        let out = null;
        try { out = printoutImage('report'); } finally { proto.fillText = real; }
        return { name: out ? out.name : null, words };
    });
    given('the client\'s picture was drawn', drawn.words.length > 0, JSON.stringify(drawn));

    const whole = drawn.words.join('\n');
    check('it is the billing report', whole.includes('חיוב') || whole.includes('לפי אתר'),
        JSON.stringify(drawn.words.slice(0, 6)));
    check('and it names no worker',
        !whole.includes('זהבצחוקי') && !whole.includes('קרמבולה'), JSON.stringify(drawn.words));
    check('nor a daily rate', !whole.includes('777') && !whole.includes('888'), '');
    check('nor an advance', !whole.includes('512'), '');
    check('nor the words a pay sheet totals with',
        !whole.includes('לתשלום') && !whole.includes('נצבר'), JSON.stringify(drawn.words));

    await page.context().close();
}

// ------------------------------- 5. the sentence that says why the row does not multiply
//
// A day is paid at the rate it was RECORDED at. Raise a man's rate and the fortnight's
// total is no longer his days times the rate in the column beside them - and the screen
// says so, in js/ui/reports.js: «בתקופה הזו השתנה השכר היומי של ...». That sentence is a
// plain .hint. css/app.css hides .hint in print and lifts only .hint-warn and .hint-money
// back out; js/ui/printout.js reads only those same two classes into the picture. So the
// two documents that leave the phone are measured here against the screen that explains
// them.
{
    suite('a raise mid-period: the screen explains the row, and the paper and the picture');

    const page = await open();
    await page.evaluate(() => {
        State.schedule.workers = [{ id: 'w_01', name: 'דוד', active: true, dailyRate: 400 }];
        State.schedule.places = [{ id: 'p_01', name: 'הרצליה', active: true }];
        ['2026-08-10', '2026-08-11', '2026-08-12'].forEach(date =>
            assignPlace(State.schedule, date, 'w_01', 'actual', 'p_01'));
        // The raise, after the days were recorded: the days keep the rate they were
        // worked at, and the roster now shows another one.
        State.worker('w_01').dailyRate = 900;
        State.save();
        showView('reports');
        REPORT_RANGE.from = '2026-08-01';
        REPORT_RANGE.to = '2026-08-31';
        if (typeof REPORT_SECTION !== 'undefined') REPORT_SECTION = 'workers';
        render();
    });
    await page.waitForTimeout(400);

    const screen = await page.evaluate(() => document.getElementById('reportsView').textContent);
    given('the row cannot be checked by multiplying: 3 days, 900 in the column, 1200 paid',
        screen.includes('900') && screen.includes('1200'), screen.replace(/\s+/g, ' ').slice(0, 200));
    check('the screen says why', screen.includes('השתנה השכר היומי'),
        screen.replace(/\s+/g, ' ').slice(0, 300));

    const buffer = await page.pdf({ format: 'A4', printBackground: true });
    const pdf = readPdf(buffer);
    const reversed = text => text.split('').reverse().join('');
    const says = (text, phrase) => text.includes(phrase) || text.includes(reversed(phrase));
    const paper = pdf.pages.map(pageText).join('\n');
    given('the print produced a real PDF', buffer.length > 2000, `${buffer.length} bytes`);
    given('and the row is on it', says(paper, '1200'), paper.replace(/\s+/g, ' ').slice(0, 200));
    check('and the paper says why too', says(paper, 'השתנה השכר היומי'),
        paper.replace(/\s+/g, ' ').slice(0, 300));

    const words = await page.evaluate(() => {
        const proto = CanvasRenderingContext2D.prototype;
        const real = proto.fillText;
        const out = [];
        proto.fillText = function (text, ...rest) {
            out.push(String(text));
            return real.call(this, text, ...rest);
        };
        try { printoutImage('report'); } finally { proto.fillText = real; }
        return out;
    });
    check('and so does the picture that goes out through WhatsApp',
        words.join('\n').includes('השתנה השכר היומי'), JSON.stringify(words));

    await page.context().close();
}

await browser.close();
server.close();
report();
