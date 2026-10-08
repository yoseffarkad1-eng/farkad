import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { serve } from './serve.mjs';
import { launchLocalBrowser } from './network-guard.mjs';
import { verifyServedAssets, expectedShaFor } from './treecheck.mjs';
import { readPdf, pageText } from './pdf.mjs';
import { suite, check, same, report } from './runner.mjs';

const root = new URL('..', import.meta.url).pathname;
const server = await serve(root);
check('period-note browser uses the named tree',
    (await verifyServedAssets(server.url, root, expectedShaFor(root))).ok);
const browser = await launchLocalBrowser(chromium, { executablePath: process.env.CHROME_PATH });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const warning = 'הטווח שנבחר אינו תקופת התשלום של העובדים האלה, ולכן זאת תצוגה של ימים ולא '
    + 'חשבון לתשלום: אין כאן יתרה מועברת ואי אפשר לסגור מכאן.';
const short = 'תצוגת ימים בלבד · לא לסגירת חשבון';
const notes = page.locator('.report-period-note');
const text = notes.first().locator('.report-period-note-text');
const details = notes.first().getByRole('button', { name: 'פרטים', exact: true });
const close = notes.first().getByRole('button', { name: 'סגירת ההסבר על תקופת התשלום' });
const snapshot = () => page.evaluate(() => JSON.stringify({
    record: State.schedule, sheets: reportSheets(), image: readReportPrintout(),
    // The service worker updates its open-build heartbeat asynchronously, independently
    // of any UI click. It is not a data or preference write made by the dismissal.
    local: Object.entries(localStorage).filter(([key]) => key !== 'farkad:openBuilds'),
    session: Object.entries(sessionStorage)
}));
async function seed() {
    await page.evaluate(() => {
        todayStr = () => '2026-10-03';
        State.schedule = emptySchedule();
        State.schedule.workers = [
            { id: 'w_week', name: 'עובד שבועי לבדיקה', active: true, dailyRate: 450, payCycles: '2026-09-04=weekly' },
            { id: 'w_two', name: 'עובד דו שבועי לבדיקה', active: true, dailyRate: 500 },
            { id: 'w_missing', name: 'עובד ללא שכר לבדיקה', active: true }
        ];
        State.schedule.places = [{ id: 'p_one', name: 'אתר בדיקה', active: true }];
        State.schedule.workers.forEach(w => assignPlace(State.schedule, '2026-10-02', w.id, 'actual', 'p_one'));
        State.schedule.days['2026-10-02'].actual.w_week.entries[0].extraHours = 2;
        REPORT_RANGE.from = '2026-10-01'; REPORT_RANGE.to = '2026-10-31';
        REPORT_WORKERS = null; REPORT_SECTION = 'workers'; REPORT_CARD_GRID = true;
        REPORT_PERIOD_NOTES_CLOSED.clear();
        showView('reports');
    });
}
try {
    await page.goto(server.url);
    await seed();
    suite('dismissal changes only the screen, not wages or exported explanations');
    same('each mismatched cycle has its own note', await notes.count(), 2);
    same('the persistent clarification is exact', await notes.first().locator('.report-period-note-label').textContent(), short);
    same('the original explanation is preserved verbatim', await text.textContent(), warning);
    check('new context starts with the explanation open', await text.isVisible());
    const before = await snapshot();
    await close.click();
    check('close hides only the long explanation', !(await text.isVisible()));
    check('the small clarification stays visible', await notes.first().locator('.report-period-note-label').isVisible());
    same('closing returns keyboard focus to details', await details.evaluate(n => n === document.activeElement), true);
    same('details announces the collapsed state', await details.getAttribute('aria-expanded'), 'false');
    check('closing one group leaves the other open', await notes.last().locator('.report-period-note-text').isVisible());
    same('record, balances, workbook, image notes and storage are unchanged', await snapshot(), before);
    await details.press('Enter');
    check('keyboard activation reopens the explanation', await text.isVisible());
    same('details announces the expanded state', await details.getAttribute('aria-expanded'), 'true');
    await close.click();
    await page.evaluate(() => { showView('day'); showView('reports'); });
    check('ordinary navigation preserves this session dismissal', !(await text.isVisible()));
    await page.evaluate(() => { REPORT_CARD_GRID = false; render(); });
    check('changing report layout preserves dismissal', !(await text.isVisible()));

    suite('report redraw preserves keyboard focus without reviving removed controls');
    const focusBefore = await snapshot();
    for (const cycle of ['weekly', 'biweekly']) {
        const note = notes.filter({ has: page.locator(`#report-period-note-${cycle}`) });
        const detailButton = note.getByRole('button', { name: 'פרטים', exact: true });
        const closeButton = note.getByRole('button', { name: 'סגירת ההסבר על תקופת התשלום' });
        if (await closeButton.isVisible()) await closeButton.click();
        await detailButton.focus();
        await page.evaluate(() => render());
        check(`${cycle}: collapsed Details retains focus after ordinary render`,
            await detailButton.evaluate(n => n === document.activeElement));
        await detailButton.press('Enter');
        await page.evaluate(() => renderReports());
        check(`${cycle}: expanded Details retains focus after report redraw`,
            await detailButton.evaluate(n => n === document.activeElement));
        await closeButton.focus();
        await page.evaluate(() => render());
        check(`${cycle}: Close retains focus after ordinary render`,
            await closeButton.evaluate(n => n === document.activeElement));
        await closeButton.press('Enter');
    }
    same('focus restoration leaves record, workbook, image and storage unchanged', await snapshot(), focusBefore);
    const activeSectionFocused = () => page.locator('.report-section-toggle [aria-pressed="true"]')
        .evaluate(n => n === document.activeElement);
    await details.focus();
    await page.evaluate(() => { REPORT_WORKERS = new Set(['w_two']); render(); });
    check('removing the focused cycle falls back to the active report section', await activeSectionFocused());
    await page.evaluate(() => { REPORT_WORKERS = new Set(['w_week']); render(); });
    await close.focus();
    await page.evaluate(() => { REPORT_RANGE.from = '2026-10-02'; REPORT_RANGE.to = '2026-10-08'; render(); });
    same('a complete period removes the mismatch control', await notes.count(), 0);
    check('a removed Close falls back to the active report section', await activeSectionFocused());
    await page.evaluate(() => { REPORT_RANGE.from = '2026-10-01'; REPORT_RANGE.to = '2026-10-31'; render(); });
    await close.focus();
    await page.evaluate(() => { REPORT_PERIOD_NOTES_CLOSED.add('weekly'); render(); });
    check('a newly hidden Close falls back to its visible Details', await details.evaluate(n => n === document.activeElement));
    await details.focus();
    await page.evaluate(() => { REPORT_SECTION = 'sites'; render(); });
    check('an offscreen payroll control falls back to the visible invoice section', await activeSectionFocused());
    await page.locator('#tab-reports').focus();
    await page.evaluate(() => renderReports());
    check('a report redraw does not steal focus from outside the report',
        await page.locator('#tab-reports').evaluate(n => n === document.activeElement));
    await page.evaluate(() => { REPORT_SECTION = 'workers'; REPORT_WORKERS = null; render(); });
    await close.click();

    suite('changed context always explains the mismatch again');
    for (const [label, change] of [
        ['period', () => { REPORT_RANGE.to = '2026-10-30'; }],
        ['return to an old period', () => { REPORT_RANGE.to = '2026-10-31'; }],
        ['worker selection', () => { REPORT_WORKERS = new Set(['w_week']); }],
        ['return to all workers', () => { REPORT_WORKERS = null; }],
        ['cycle history, even when this month is unchanged', () => { State.worker('w_week').payCycles += ';2026-11-06=biweekly'; }],
        ['worker roster', () => { State.worker('w_week').name = 'שם בדיקה חדש'; }]
    ]) {
        await page.evaluate(change);
        await page.evaluate(() => render());
        check(`${label}: explanation restored`, await text.isVisible());
        await close.click();
    }
    await page.evaluate(() => { REPORT_WORKERS = new Set(); render(); REPORT_WORKERS = null; render(); });
    check('an empty selection also clears the old dismissal', await text.isVisible());
    await close.click();
    await page.reload();
    await seed();
    check('a new page session does not remember the dismissal', await text.isVisible());

    suite('warnings about missing wages, save/sync and closure stay visible');
    const missing = page.getByText(/עובדים בלי שכר יומי, ולכן הסכום למטה חסר אותם/);
    const hours = page.getByText('* שעות נוספות בלי שכר שעה - לא נכללו בסכום.', { exact: true });
    check('the fixture really has both wage warnings', await missing.isVisible() && await hours.isVisible());
    await page.evaluate(() => { State.saveFailed = true; updateSyncNotice(); });
    const saveNotice = await page.locator('#storageNotice').textContent();
    await close.click();
    check('missing wages remain visible after closing the note', await missing.isVisible());
    check('unpriced hours remain visible after closing the note', await hours.isVisible());
    same('save failure remains unchanged', await page.locator('#storageNotice').textContent(), saveNotice);
    check('save failure is still displayed', await page.locator('#storageNotice').isVisible());
    await page.evaluate(() => { State.saveFailed = false; FarkadSync.setStatus('error', new Error('test sync failure')); });
    const syncNotice = await page.locator('#storageNotice').textContent();
    await details.click(); await close.click();
    same('sync failure remains unchanged', await page.locator('#storageNotice').textContent(), syncNotice);
    check('the mismatched range still has no closure controls',
        await page.evaluate(() => renderPeriodClosure(State.worker('w_week')) === null));
    await page.evaluate(() => openWorkerSettlement('w_missing'));
    check('missing wages still block account approval with an explanation', await page.getByText('אי אפשר לאשר את החשבון כרגע. בדוק שהשכר והיתרות הושלמו.', { exact: true }).isVisible());
    await page.evaluate(() => {
        closeWorkerDays(); FarkadSync.setStatus('off');
        REPORT_RANGE.from = '2026-10-01'; REPORT_RANGE.to = '2026-10-31'; render();
    });

    suite('Hebrew RTL at 320/390px, normal and doubled text');
    for (const width of [320, 390]) for (const scale of [1, 2]) {
        await page.setViewportSize({ width, height: 844 });
        await page.evaluate(() => render());
        if (await text.isVisible()) await close.click();
        if (scale === 2) await page.evaluate(() => {
            const sizes = [...document.querySelectorAll('#reportsView, #reportsView *')]
                .map(n => [n, parseFloat(getComputedStyle(n).fontSize)]);
            sizes.forEach(([n, size]) => { n.style.fontSize = `${size * 2}px`; });
        });
        for (const open of [true, false]) {
            if (open) await details.click(); else await close.click();
            const geometry = await notes.first().evaluate(n => ({
                rtl: getComputedStyle(n).direction === 'rtl',
                overflow: document.documentElement.scrollWidth > innerWidth + 1,
                clipped: [...n.querySelectorAll('span, p, button')].filter(e => e.getClientRects().length)
                    .some(e => e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1),
                small: [...n.querySelectorAll('button')].filter(e => e.getClientRects().length)
                    .some(e => { const r = e.getBoundingClientRect(); return r.width < 44 || r.height < 44; })
            }));
            check(`${width}px/${scale}x/${open ? 'open' : 'closed'}: RTL, no clipping/overflow, 44px targets`,
                geometry.rtl && !geometry.overflow && !geometry.clipped && !geometry.small, JSON.stringify(geometry));
            if (process.env.REPORTS_SCREENSHOT_DIR) {
                mkdirSync(process.env.REPORTS_SCREENSHOT_DIR, { recursive: true });
                await notes.first().screenshot({ path: `${process.env.REPORTS_SCREENSHOT_DIR}/period-${width}-${scale}-${open}.png` });
            }
        }
    }
    await page.evaluate(() => render());
    suite('dismissed text remains complete in the real PDF and PNG');
    await page.emulateMedia({ media: 'print' });
    check('print shows the full dismissed explanation', await text.isVisible());
    check('print hides the small label and both controls', !(await notes.first().locator('.report-period-note-head').isVisible()));
    const pdfBytes = await page.pdf({ format: 'A4' });
    const paper = readPdf(pdfBytes).pages.map(pageText).join('\n');
    const says = phrase => paper.includes(phrase) || paper.includes([...phrase].reverse().join(''));
    // The RTL paragraph wraps at different words on paper; match its meaningful clauses
    // within text runs rather than requiring a phrase to stay on one visual line.
    check('the actual PDF explains the mismatch, missing carry and closure restriction',
        says('הטווח שנבחר אינו תקופת התשלום') && says('יתרה מועברת') && says('אי אפשר לסגור מכאן'));
    check('the actual PDF contains neither details nor close controls', !says('פרטים') && !paper.includes('×'));
    await page.emulateMedia({ media: 'screen' });
    check('printing does not reopen the explanation on screen', !(await text.isVisible()));
    const image = await page.evaluate(async () => {
        const proto = CanvasRenderingContext2D.prototype, original = proto.fillText, words = [];
        proto.fillText = function (value, ...args) { words.push(String(value)); return original.call(this, value, ...args); };
        let out;
        try { out = printoutImage('report'); } finally { proto.fillText = original; }
        return { words, bytes: [...new Uint8Array(await out.blob.arrayBuffer())] };
    });
    same('image export produces genuine PNG bytes', image.bytes.slice(0, 8), [137, 80, 78, 71, 13, 10, 26, 10]);
    check('canvas draws the complete original explanation', image.words.join(' ').replace(/\s+/g, ' ').includes(warning));
    check('canvas draws neither controls nor the compact screen label', !image.words.some(w => w.includes('פרטים') || w.includes('×') || w.includes(short)));
    if (process.env.REPORTS_SCREENSHOT_DIR) {
        writeFileSync(`${process.env.REPORTS_SCREENSHOT_DIR}/period-note.pdf`, pdfBytes);
        writeFileSync(`${process.env.REPORTS_SCREENSHOT_DIR}/period-note-export.png`, Buffer.from(image.bytes));
    }
    check('no uncaught browser errors', errors.length === 0, JSON.stringify(errors));
} finally { await browser.close(); await server.close(); }
report();
