// טבלת האתרים (v208) in Chromium with touch: the switch «כולל עובדי רימא» / «ללא עובדי רימא»
// over the billing grid of «דוחות» ← «לפי אתר», and the date column that stays.
//
//   node tests/sitegrid.browser.mjs            (SITEGRID_SHOTS=<dir> also writes the pictures)
//
// What only a page can answer: the switch under a finger, the table as drawn against the
// readers' own answers in both states, the column still on the glass after a sideways
// scroll, the page not scrolling sideways, the floors on three phones in both schemes with
// and without «תצוגה גדולה» and at doubled text - and that the PAPER, the shared PICTURE and
// the WORKBOOK are what v207 (000dde8, out of Git, served beside this tree) hands over,
// whichever way the switch stands. The arithmetic is tests/sitegrid.test.mjs.
// SYNTHETIC NAMES ONLY. NOT a real phone.

import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { serve } from './serve.mjs';
import { launchLocalBrowser } from './network-guard.mjs';
import { verifyServedAssets, expectedShaFor } from './treecheck.mjs';
import { suite, check, same, report } from './runner.mjs';
import { readPdf, pageText } from './pdf.mjs';
import { openApp } from './screens.mjs';

const BASE = '000dde8730df4f3e088300e324dfecff8db21aae';         // v207, as served
const root = new URL('..', import.meta.url).pathname;
const server = await serve(root);
const served = await verifyServedAssets(server.url, root, expectedShaFor(root));
check('the origin served this commit, byte for byte', served.ok,
    `${served.checked} assets; ${(served.wrong || []).slice(0, 3).join(' | ')}`);

// v207's own tree, out of Git, served beside this one.
const baseDir = mkdtempSync(join(tmpdir(), 'sitegrid-base-'));
execFileSync('sh', ['-c', `git -C "${root}" archive ${BASE} | tar -x -C "${baseDir}"`]);
const baseServer = await serve(baseDir);
const browser = await launchLocalBrowser(chromium, { executablePath: process.env.CHROME_PATH });
const SHOTS = process.env.SITEGRID_SHOTS || '';
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const WITH = 'כולל עובדי רימא';
const WITHOUT = 'ללא עובדי רימא';
const SAYS_WITH = 'כל העובדים בכל אתר, כולל עובדי רימא - כמו בחיוב.';
const SAYS_WITHOUT = 'העובדים שלך בלבד, בלי עובדי רימא.';
const SITES = ['אלעד', 'נשר', 'אילון', 'חיפה - הנמל', 'עכו', 'טבריה', 'כרמיאל', 'נצרת עילית'];
const CREW = ['דוד כהן', 'עלי חסן', 'מוחמד אבו ראס', 'יוסי מזרחי', 'אחמד נסאר', 'סאמר חטיב', 'רון לוי', 'איברהים עודה',
    'מאיר ביטון', 'חאלד סלאמה', 'נועם פרץ', 'וליד זועבי', 'אבי דהן', 'ראמי חורי', 'שמעון אזולאי', 'עומר סעד'];

// One crew, eight sites, seventeen days. On 03/11: אלעד four of his and one of Rima's,
// נשר six of his, אילון three and two - the owner's own example.
function seedInPage([sites, crew]) {
    State.schedule.workers = crew.map((name, i) => (
        { id: `w_${String(i + 1).padStart(2, '0')}`, name, active: true, dailyRate: 400 + i * 10, hourlyRate: 50 }));
    State.schedule.places = sites.map((name, i) => ({ id: `p_${i + 1}`, name, active: true }));
    const w = n => `w_${String(n).padStart(2, '0')}`;
    const put = (date, from, to, site, rate) => { for (let n = from; n <= to; n += 1) assignPlace(State.schedule, date, w(n), 'actual', site, rate); };
    const d = n => `2026-11-${String(n).padStart(2, '0')}`;
    put(d(3), 1, 4, 'p_1'); put(d(3), 5, 10, 'p_2'); put(d(3), 11, 13, 'p_3');
    setRimaCount(State.schedule, d(3), 'p_1', 1); setRimaCount(State.schedule, d(3), 'p_3', 2);
    let turn = 0;
    for (let n = 1; n <= 17; n += 1) {
        if (n === 3 || n === 7 || n === 14) continue;            // 03 is set above; two Saturdays
        for (let m = 1; m <= 16; m += 1) {
            turn += 1;
            if (turn % 7 === 0) continue;
            assignPlace(State.schedule, d(n), w(m), 'actual', `p_${1 + ((m + n) % 8)}`, turn % 11 === 0 ? 'double' : undefined);
            if (turn % 13 === 0) assignPlace(State.schedule, d(n), w(m), 'actual', `p_${1 + ((m + n + 3) % 8)}`);
        }
        if (n % 2 === 0) setRimaCount(State.schedule, d(n), `p_${1 + (n % 8)}`, 1 + (n % 3));
    }
    setRimaCount(State.schedule, d(7), 'p_5', 2);                 // a day of Rima's men alone
    setYosefGevesCount(State.schedule, d(4), 'p_2', 3);           // and the list that is in no account
    State.save();
    REPORT_RANGE.from = d(1); REPORT_RANGE.to = d(17); REPORT_PRESET = 'custom'; REPORT_RANGE_OPEN = false;
    REPORT_SECTION = 'sites'; INVOICE_PLACE = null;
    showView('reports');
}

async function phone(url, options = {}) {
    const opened = await openApp(browser, url, Object.assign({ width: 375, height: 812, scheme: 'light', seeded: false }, options));
    await opened.page.evaluate(seedInPage, [SITES, CREW]);
    await opened.page.waitForTimeout(250);
    return opened;
}

// The grid as drawn: its headers, its rows (date first), its foot.
const drawn = page => page.evaluate(() => {
    const table = document.querySelector('#reportsView .client-grid-table');
    if (!table) return null;
    const text = cell => cell.textContent.replace(/[⁦-⁩]/g, '');
    const num = cell => (text(cell) === '' ? 0 : Number(text(cell)));
    return {
        state: document.querySelector('#reportsView .client-grid').dataset.rima,
        headers: [...table.querySelectorAll('thead th')].map(text),
        dates: [...table.querySelectorAll('tbody tr')].map(tr => tr.dataset.date),
        rows: [...table.querySelectorAll('tbody tr')].map(tr => [...tr.querySelectorAll('td')].map(num)),
        foot: [...table.querySelectorAll('tfoot td')].map(num),
        footWord: text(table.querySelector('tfoot th')),
        says: text(document.querySelector('#reportsView .client-grid-says')),
        pressed: [...document.querySelectorAll('#reportsView .client-grid-toggle button')].map(b => [text(b), b.getAttribute('aria-pressed')]),
        whole: text(document.querySelector('#reportsView .client-grid'))
    };
});
// The same grid asked of the readers.
const wanted = (page, withRima) => page.evaluate(withRima => {
    const all = invoiceByDate(State.schedule, REPORT_RANGE.from, REPORT_RANGE.to);
    const chosen = all.places.find(place => place.placeId === INVOICE_PLACE) || null;
    if (withRima) {
        const places = chosen ? [chosen] : all.places;
        const dates = chosen ? chosen.days.map(day => day.date) : all.dates;
        const rows = dates.map(date => { const c = places.map(place => all.countAt(place.placeId, date)); return c.concat([c.reduce((a, b) => a + b, 0)]); });
        return { names: places.map(place => place.name), dates, rows,
            foot: places.map(place => place.workerDays).concat([places.reduce((sum, place) => sum + place.workerDays, 0)]) };
    }
    const own = invoiceWithoutRima(State.schedule, REPORT_RANGE.from, REPORT_RANGE.to, chosen ? chosen.placeId : null);
    return { names: own.places.map(place => place.name), dates: own.dates,
        rows: own.dates.map(date => own.places.map(place => own.countAt(place.placeId, date)).concat([own.dayTotal(date)])),
        foot: own.places.map(place => place.workerDays).concat([own.total]) };
}, withRima);
const disk = page => page.evaluate(() => JSON.stringify(Object.keys(localStorage).sort().map(key => [key, localStorage.getItem(key)])));
const tapChoice = async (page, words) => {
    const button = page.locator('#reportsView .client-grid-toggle button', { hasText: words });
    await button.scrollIntoViewIfNeeded();
    await button.tap();
    await page.waitForTimeout(120);
};
const agrees = (got, want) => JSON.stringify([got.headers.slice(1, -1), got.dates, got.rows, got.foot])
    === JSON.stringify([want.names, want.dates, want.rows, want.foot]);

{
    suite('1. the switch and the grid, as the page opens');
    const { context, page, errors } = await phone(server.url);
    const before = await disk(page);
    const first = await drawn(page);
    check('one grid under «לפי אתר»', Boolean(first));
    same('two choices, in his words, «כולל» pressed', first.pressed, [[WITH, 'true'], [WITHOUT, 'false']]);
    same('the line under them says what is shown', first.says, SAYS_WITH);
    same('headed תאריך … סה״כ יומי, footed in the invoice\'s own word',
        [first.headers[0], first.headers[first.headers.length - 1], first.footWord], ['תאריך', 'סה״כ יומי', 'סה״כ ימי עובד־אתר']);
    check('«כולל»: every cell, day total and site total is invoiceByDate\'s', agrees(first, await wanted(page, true)), JSON.stringify(first.rows.slice(0, 2)));
    const at = first.dates.indexOf('2026-11-03');
    same('03/11 with Rima\'s men: אלעד 5, נשר 6, אילון 5', first.rows[at].slice(0, 3), [5, 6, 5]);
    check('seventeen days asked, the worked ones shown - 07/11 too, a day of Rima\'s men alone',
        first.dates.includes('2026-11-07') && !first.dates.includes('2026-11-14'), first.dates.join(' '));
    if (SHOTS) await page.locator('#reportsView .client-grid').screenshot({ path: join(SHOTS, '1-with-rima-375-light.png') });

    suite('2. a real tap on «ללא עובדי רימא»');
    await tapChoice(page, WITHOUT);
    const second = await drawn(page);
    same('the other choice is pressed, and it holds the focus', [second.pressed, await page.evaluate(() => document.activeElement.textContent)],
        [[[WITH, 'false'], [WITHOUT, 'true']], WITHOUT]);
    same('the line says so', second.says, SAYS_WITHOUT);
    check('«ללא»: every cell, day total and site total is invoiceWithoutRima\'s', agrees(second, await wanted(page, false)), JSON.stringify(second.rows.slice(0, 2)));
    same('03/11 without: אלעד 4, נשר 6, אילון 3', second.rows[at].slice(0, 3), [4, 6, 3]);
    same('the same dates and the same sites in both states', [second.dates, second.headers], [first.dates, first.headers]);
    check('07/11 is still a row, at nothing', second.rows[second.dates.indexOf('2026-11-07')].every(n => n === 0));
    check('the totals moved', second.foot[second.foot.length - 1] < first.foot[first.foot.length - 1],
        `${second.foot[second.foot.length - 1]} / ${first.foot[first.foot.length - 1]}`);
    if (SHOTS) await page.locator('#reportsView .client-grid').screenshot({ path: join(SHOTS, '2-without-rima-375-light.png') });
    await tapChoice(page, WITH);
    check('and back', agrees(await drawn(page), await wanted(page, true)));

    suite('3. counts and nothing else');
    for (const words of [WITH, WITHOUT]) {
        await tapChoice(page, words);
        const now = await drawn(page);
        check(`${words}: no man's name in the grid`, CREW.every(name => !now.whole.includes(name)));
        check(`${words}: no shekel, no rate`, !/₪|ש״ח|שכר|מקדמ/.test(now.whole), now.whole.slice(0, 80));
    }
    await tapChoice(page, WITH);

    suite('4. the rest of the page is where it was');
    const rest = await page.evaluate(() => ({
        norima: (n => (n ? getComputedStyle(n).display : 'absent'))(document.querySelector('#reportsView .report-norima')),
        norimaTable: Boolean(document.querySelector('#reportsView .report-norima table.report-table.norima-table')),
        rima: (n => (n ? getComputedStyle(n).display : 'absent'))(document.querySelector('#reportsView .report-rima')),
        yosef: (n => (n ? getComputedStyle(n).display : 'absent'))(document.querySelector('#reportsView .report-yosefgeves')),
        bars: document.querySelectorAll('#reportsView .invoice-bars .invoice-bar, #reportsView .invoice-bars [class*="invoice-bar-name"]').length > 0,
        paperGrid: (n => (n ? getComputedStyle(n).display : 'absent'))(document.querySelector('#reportsView .invoice-grid')),
        inGrid: document.querySelectorAll('#reportsView .client-grid table.report-table').length
    }));
    same('«בלי עובדי רימא»\'s own section: in the document, put away on the screen', [rest.norima, rest.norimaTable], ['none', true]);
    check('«רישום לרימא» and «עובדי יוסף גבס» are drawn as before', rest.rima !== 'none' && rest.rima !== 'absent' && rest.yosef !== 'none' && rest.yosef !== 'absent', JSON.stringify(rest));
    check('the bars are there, the paper\'s grid still hidden on the screen', rest.bars && rest.paperGrid === 'none', JSON.stringify(rest));
    same('no .report-table inside the new block', rest.inGrid, 0);

    suite('5. free ranges and one client\'s site, both states');
    for (const [from, to, placeId, what] of [['2026-11-01', '2026-11-10', null, 'ten days'], ['2026-11-01', '2026-11-17', null, 'seventeen days'],
        ['2026-11-05', '2026-11-05', null, 'one day'], ['2026-11-01', '2026-11-17', 'p_1', 'אלעד alone'], ['2026-11-01', '2026-11-17', 'p_5', 'עכו alone']]) {
        for (const withRima of [true, false]) {
            await page.evaluate(([from, to, placeId, withRima]) => {
                REPORT_RANGE.from = from; REPORT_RANGE.to = to; INVOICE_PLACE = placeId; SITE_GRID_WITH_RIMA = withRima; render();
            }, [from, to, placeId, withRima]);
            await page.waitForTimeout(80);
            const got = await drawn(page);
            const want = await wanted(page, withRima);
            check(`${what}, ${withRima ? WITH : WITHOUT}: the grid is the reader's`, got && agrees(got, want) && got.state === (withRima ? 'with' : 'without'),
                got ? JSON.stringify([got.headers, got.dates.length]) : 'no grid');
            if (placeId) check(`${what}: one site's column and only its days`, got.headers.length === 3 && got.dates.length === want.dates.length);
        }
    }
    // A press of the switch with a client chosen keeps the client.
    await page.evaluate(() => { REPORT_RANGE.from = '2026-11-01'; REPORT_RANGE.to = '2026-11-17'; INVOICE_PLACE = 'p_1'; SITE_GRID_WITH_RIMA = true; render(); });
    await tapChoice(page, WITHOUT);
    const narrowed = await drawn(page);
    same('the switch pressed with אלעד chosen: still אלעד alone', narrowed.headers, ['תאריך', 'אלעד', 'סה״כ יומי']);
    check('and its figures invoiceWithoutRima\'s for that site', agrees(narrowed, await wanted(page, false)));
    await page.evaluate(() => { INVOICE_PLACE = null; SITE_GRID_WITH_RIMA = true; render(); });
    // An empty range has no grid and no switch.
    await page.evaluate(() => { REPORT_RANGE.from = '2026-09-01'; REPORT_RANGE.to = '2026-09-05'; render(); });
    same('a range with nothing in it: no switch, no grid', await page.evaluate(() => document.querySelectorAll('#reportsView .client-grid').length), 0);
    await page.evaluate(() => { REPORT_RANGE.from = '2026-11-01'; REPORT_RANGE.to = '2026-11-17'; render(); });

    suite('6. nothing was written');
    same('the disk, key for key, after every tap and range above', await disk(page), before);
    same('no page errors', errors, []);
    await context.close();
}

{
    suite('7. the date stays while the sites scroll; the page never scrolls sideways');
    for (const [width, height, large] of [[375, 812, false], [320, 568, true]]) {
        const { context, page } = await phone(server.url, { width, height, large });
        const tag = `${width}x${height}${large ? ' large' : ''}`;
        await page.locator('#reportsView .client-grid').scrollIntoViewIfNeeded();
        const read = () => page.evaluate(() => {
            const wrap = document.querySelector('#reportsView .client-grid-scroll');
            const box = wrap.getBoundingClientRect();
            const date = wrap.querySelector('tbody tr .client-grid-date').getBoundingClientRect();
            const head = wrap.querySelector('thead .client-grid-date').getBoundingClientRect();
            const cells = [...wrap.querySelectorAll('tbody tr:first-child td')].map(td => Math.round(td.getBoundingClientRect().left));
            return { scrollLeft: wrap.scrollLeft, room: wrap.scrollWidth - wrap.clientWidth, box: [box.left, box.right], date: [date.left, date.right],
                head: [head.left, head.right], cells, page: [document.documentElement.scrollWidth, window.innerWidth, window.scrollX],
                top: document.elementFromPoint(date.left + date.width / 2, date.top + date.height / 2).closest('.client-grid-date') !== null };
        });
        const start = await read();
        check(`${tag}: eight sites are wider than the phone, inside the grid's own box`, start.room > 40, JSON.stringify(start.room));
        check(`${tag}: the date column at the inline start (the right, in Hebrew)`, Math.abs(start.date[1] - start.box[1]) <= 2, JSON.stringify(start));
        // The scroll is set, not dragged: what is claimed is where the column stands once
        // the box has scrolled, and a finger's drag has not been tried on a real phone.
        await page.evaluate(() => { const wrap = document.querySelector('#reportsView .client-grid-scroll'); wrap.scrollLeft = -Math.min(150, wrap.scrollWidth - wrap.clientWidth); });
        await page.waitForTimeout(120);
        const moved = await read();
        check(`${tag}: the sites moved`, Math.abs(moved.scrollLeft) >= 20 && moved.cells[0] !== start.cells[0], JSON.stringify([moved.scrollLeft, moved.cells[0], start.cells[0]]));
        check(`${tag}: the date column is where it was, on top of the cells under it`,
            Math.abs(moved.date[1] - start.date[1]) <= 1 && Math.abs(moved.head[1] - start.head[1]) <= 1 && moved.top, JSON.stringify(moved));
        if (SHOTS && !large) await page.locator('#reportsView .client-grid').screenshot({ path: join(SHOTS, '3-scrolled-sideways-date-stays-375-light.png') });
        await page.evaluate(() => { const wrap = document.querySelector('#reportsView .client-grid-scroll'); wrap.scrollLeft = -(wrap.scrollWidth - wrap.clientWidth); });
        await page.waitForTimeout(80);
        const end = await read();
        check(`${tag}: at the far end the day's total is on the glass beside the date`,
            end.cells[end.cells.length - 1] >= end.box[0] - 1 && Math.abs(end.date[1] - start.date[1]) <= 1, JSON.stringify(end));
        check(`${tag}: the page itself has no sideways scroll`, end.page[0] <= end.page[1] + 1 && end.page[2] === 0, JSON.stringify(end.page));
        if (SHOTS && large) {
            await page.evaluate(() => { document.querySelector('#reportsView .client-grid-scroll').scrollLeft = 0; });
            await page.evaluate(() => { const top = document.querySelector('#reportsView .client-grid-toggle').getBoundingClientRect().top;
                const bar = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--topbar-h')) || 0; window.scrollBy(0, top - bar - 70); });
            await page.waitForTimeout(120);
            await page.screenshot({ path: join(SHOTS, '4-320-large-display.png') });
        }
        await context.close();
    }
}

{
    suite('8. the floors: three phones, both schemes, with and without «תצוגה גדולה», and doubled text');
    const lum = ([r, g, b]) => { const f = v => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
    const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
    for (const [width, height] of [[320, 568], [375, 667], [440, 956]]) {
        for (const scheme of ['light', 'dark']) {
            for (const large of [false, true]) {
                for (const doubled of [false, true]) {
                    if (doubled && scheme === 'dark') continue;
                    const { context, page } = await phone(server.url, { width, height, scheme, large });
                    if (doubled) {
                        await page.evaluate(() => {
                            const out = [];
                            const walk = rules => { for (const rule of rules) {
                                if (rule.cssRules && rule.type !== 1) { walk(rule.cssRules); continue; }
                                if (rule.type !== 1 || !rule.style) continue;
                                const raw = rule.style.getPropertyValue('font-size');
                                if (raw && /^[\d.]+px$/.test(raw.trim())) out.push(`${rule.selectorText}{font-size:${parseFloat(raw) * 2}px !important}`);
                            } };
                            for (const sheet of document.styleSheets) { try { walk(sheet.cssRules); } catch (error) { /* cross-origin */ } }
                            const style = document.createElement('style'); style.textContent = out.join('\n'); document.head.appendChild(style);
                        });
                        await page.waitForTimeout(150);
                    }
                    const tag = `${width}x${height} ${scheme}${large ? ' large' : ''}${doubled ? ' 2x' : ''}`;
                    for (const withRima of [true, false]) {
                        await page.evaluate(withRima => { SITE_GRID_WITH_RIMA = withRima; render(); }, withRima);
                        await page.waitForTimeout(60);
                        const seen = await page.evaluate(() => {
                            const rgb = text => (text.match(/[\d.]+/g) || []).slice(0, 4).map(Number);
                            const ground = node => { for (let at = node; at; at = at.parentElement) { const c = rgb(getComputedStyle(at).backgroundColor); if (c.length === 3 || c[3] > 0.99) return c.slice(0, 3); } return [255, 255, 255]; };
                            const block = document.querySelector('#reportsView .client-grid');
                            const buttons = [...block.querySelectorAll('.client-grid-toggle button')].map(b => b.getBoundingClientRect());
                            const texts = [...block.querySelectorAll('button, p, th, td')].filter(n => n.textContent.trim() !== '');
                            return {
                                buttons: buttons.map(r => [Math.round(r.left), Math.round(r.right), Math.round(r.width), Math.round(r.height)]),
                                overlap: buttons[0].left < buttons[1].right - 0.5 && buttons[1].left < buttons[0].right - 0.5
                                    && buttons[0].top < buttons[1].bottom - 0.5 && buttons[1].top < buttons[0].bottom - 0.5,
                                spill: [...block.querySelectorAll('.client-grid-toggle button')].some(b => b.scrollWidth > b.clientWidth + 1 || b.scrollHeight > b.clientHeight + 1),
                                sizes: texts.map(n => parseFloat(getComputedStyle(n).fontSize)),
                                weights: texts.map(n => Number(getComputedStyle(n).fontWeight)),
                                colours: texts.map(n => [rgb(getComputedStyle(n).color).slice(0, 3), ground(n)]),
                                block: [block.getBoundingClientRect().left, block.getBoundingClientRect().right, window.innerWidth],
                                page: [document.documentElement.scrollWidth, window.innerWidth]
                            };
                        });
                        const floor = large ? 52 : 44;
                        const small = (large ? 18 : 14) * (doubled ? 2 : 1);
                        const need = large ? 7 : 4.5;
                        const worst = Math.min(...seen.colours.map(([ink, ground]) => ratio(ink, ground)));
                        const ok = seen.buttons.every(b => b[2] >= floor && b[3] >= floor) && !seen.overlap && !seen.spill
                            && Math.min(...seen.sizes) >= small && (!large || Math.min(...seen.weights) >= 500) && worst >= need
                            && seen.block[0] >= -0.5 && seen.block[1] <= seen.block[2] + 0.5 && seen.page[0] <= seen.page[1] + 1;
                        check(`${tag}, ${withRima ? WITH : WITHOUT}: two targets of ${floor}px, apart, their words inside; nothing under ${small}px; ${need}:1; inside the page`, ok,
                            JSON.stringify({ buttons: seen.buttons, overlap: seen.overlap, spill: seen.spill, min: Math.min(...seen.sizes), weight: Math.min(...seen.weights),
                                worst: Number(worst.toFixed(2)), block: seen.block, page: seen.page }));
                    }
                    await context.close();
                }
            }
        }
    }
}

{
    suite('9. the paper, the picture and the workbook are v207\'s, whichever way the switch stands');
    // What leaves the phone, read on one page: the printed PDF's text, the picture's
    // reading and its PNG, and every sheet of the workbook.
    const leaves = async (page, state) => {
        if (state) await page.evaluate(withRima => { SITE_GRID_WITH_RIMA = withRima; render(); }, state === 'with');
        await page.waitForTimeout(120);
        const picture = await page.evaluate(async () => {
            const spec = readReportPrintout();
            const made = printoutImage('report');
            const bytes = new Uint8Array(await made.blob.arrayBuffer());
            const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
            return { spec: JSON.stringify(spec), png: [made.width, made.height, bytes.length, [...digest].map(b => b.toString(16).padStart(2, '0')).join('')] };
        });
        const book = await page.evaluate(async () => {
            if (!(await loadXlsx())) return null;
            let captured = null;
            const write = XLSX.writeFile;
            XLSX.writeFile = (wb, name) => { captured = { bytes: XLSX.write(wb, { type: 'array', bookType: 'xlsx' }), name }; };
            try { await exportReports(); } finally { XLSX.writeFile = write; }
            if (!captured) return null;
            const back = XLSX.read(captured.bytes, { type: 'array' });
            return JSON.stringify({ name: captured.name, sheets: back.SheetNames.map(name => [name, XLSX.utils.sheet_to_json(back.Sheets[name], { header: 1, blankrows: true })]) });
        });
        await page.keyboard.press('Escape');
        await page.waitForTimeout(150);
        const pdf = readPdf(await page.pdf({ format: 'A4', printBackground: true }));
        const printed = await (async () => {
            await page.emulateMedia({ media: 'print' });
            const out = await page.evaluate(() => ({
                grid: (n => (n ? getComputedStyle(n).display : 'absent'))(document.querySelector('#reportsView .client-grid')),
                norima: (n => (n ? getComputedStyle(n).display : 'absent'))(document.querySelector('#reportsView .report-norima')),
                paper: (n => (n ? getComputedStyle(n).display : 'absent'))(document.querySelector('#reportsView .invoice-grid'))
            }));
            await page.emulateMedia({ media: null });
            return out;
        })();
        return { picture, book, pages: pdf.pages.length, text: pdf.pages.map(pageText).join('\n---\n'), printed };
    };
    for (const placeId of [null, 'p_1']) {
        const what = placeId ? 'one client\'s site' : 'every site';
        const base = await phone(baseServer.url, { width: 440, height: 956 });
        await base.page.evaluate(placeId => { INVOICE_PLACE = placeId; render(); }, placeId);
        check(`${what}: the base is v207, and has no switch`, await base.page.evaluate(() => APP_VERSION === 'v207' && !document.querySelector('.client-grid')));
        const was = await leaves(base.page, null);
        await base.context.close();
        const here = await phone(server.url, { width: 440, height: 956 });
        await here.page.evaluate(placeId => { INVOICE_PLACE = placeId; render(); }, placeId);
        for (const state of ['with', 'without']) {
            const now = await leaves(here.page, state);
            same(`${what}, ${state}: the printed pages, word for word`, [now.pages, now.text], [was.pages, was.text]);
            same(`${what}, ${state}: what the picture reads`, now.picture.spec, was.picture.spec);
            same(`${what}, ${state}: the picture itself - width, height, length, SHA-256`, now.picture.png, was.picture.png);
            same(`${what}, ${state}: the workbook, every sheet and cell`, now.book, was.book);
            same(`${what}, ${state}: on paper the switch and its grid are gone, «בלי עובדי רימא» too, the paper's grid shown`,
                [now.printed.grid, now.printed.norima, now.printed.paper !== 'none' && now.printed.paper !== 'absent'], ['none', 'none', true]);
            check(`${what}, ${state}: the paper never says «${WITHOUT}» or «${WITH}»`,
                ![WITH, WITHOUT].some(words => now.text.includes(words) || now.text.includes(words.split('').reverse().join(''))));
        }
        check(`${what}: the picture and the book were really made`, was.picture.png[2] > 5000 && Boolean(was.book), JSON.stringify(was.picture.png));
        same(`${what}: no page errors`, here.errors, []);
        await here.context.close();
    }
}

await browser.close();
await server.close();
await baseServer.close();
rmSync(baseDir, { recursive: true, force: true });
report();
