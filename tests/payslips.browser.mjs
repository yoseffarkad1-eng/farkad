// «תלוש לכל עובד» in a real Chromium, on a touched phone: the one way in, inside «הפקת דוח»;
// the list; the message read before it is opened; the tap that opens WhatsApp on ONE man's
// number with HIS statement; the copy for a man with no number; a row that is held; a
// reload in the middle of a run; the rectangles a finger lands on.
//
//   node tests/payslips.browser.mjs
//
// Whose text, whose figure, whose number, the gates and where the marks are kept are
// measured on devices in tests/payslips.test.mjs. This is the part only a page can answer:
// the tap has to BE the person's tap (iOS opens nothing for a navigation that is not), the
// address it asks for has to be on the link before the finger lands, the figure on a row
// has to be the figure the pay sheet shows ON THE SCREEN for that man, and a man of
// sixty-two has to be able to read all of it.
//
// WhatsApp itself is never reached. wa.me is answered by a route on this browser's own
// context with a page of nothing, and the address the tap asked for is what is read.
// Synthetic names throughout.

import { chromium } from 'playwright';
import { join } from 'node:path';
import { serve } from './serve.mjs';
import { launchLocalBrowser } from './network-guard.mjs';
import { verifyServedAssets, expectedShaFor } from './treecheck.mjs';
import { suite, check, same, given, report } from './runner.mjs';

const root = new URL('..', import.meta.url).pathname;
const server = await serve(root);
const served = await verifyServedAssets(server.url, root, expectedShaFor(root));
check('the origin served this commit, byte for byte', served.ok,
    `${served.checked} assets; ${(served.wrong || []).slice(0, 3).join(' | ')}`);
const browser = await launchLocalBrowser(chromium, { executablePath: process.env.CHROME_PATH });
const SHOTS = process.env.PAYSLIPS_SCREENSHOT_DIR || '';

const TODAY = '2026-11-10';     // a Tuesday: the weekly men's week is 06/11 - 12/11
const KEY = 'farkadPayslipsProgress';
const FSI = '⁨';
const PDI = '⁩';
const named = name => `${FSI}${name}${PDI}`;
const plain = text => String(text || '').replace(/[‎‏‪-‮⁦-⁩]/g, '').replace(/\s*\*$/, '').trim();

// The pinned words - this feature's own, and the ones it borrows.
const ENTRY = '💬 תלוש לכל עובד';
const TITLE = 'תלוש לכל עובד';
const LEAD = 'כל עובד מקבל את החשבון שלו לתקופה שלו: הימים, מה נצבר, המקדמות וכמה נותר לתשלום. '
    + 'וואטסאפ נפתח עם ההודעה מוכנה, ושם לוחצים על שליחה.';
const SHOW = 'הצג הודעה';
const HIDE = 'הסתר הודעה';
const DIFFERS = '⚠️ הסכום בהודעה אינו הסכום שבדוח השכר, ולכן ההודעה לא נפתחת מכאן. בדוק את החשבון של העובד בדוח.';
const OPENED = '✓ נפתח בוואטסאפ';
const NO_PHONE = 'אין מספר טלפון תקין';
const go = name => `💬 פתח בוואטסאפ: ${named(name)}`;
const progress = (done, total) => `נפתחו ${done} מתוך ${total}`;

// The crew:
//   אלף    fortnightly, 450 a day, seven days, 1,500 handed over       050-0000001
//   בית    weekly, 400 a day, two days in his week                     +972 52-000-0002
//   גימל   a long name, no rate, one day                               054-0000003
//   דלת    fortnightly, 380 a day, two days - and NO phone
//   הא     weekly, 420 a day, one day - on בית's number
//   וו     nothing recorded at all                                     not listed
async function phone(width, height, scheme, extra) {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2,
        isMobile: true, hasTouch: true, colorScheme: scheme, timezoneId: 'Asia/Jerusalem',
        serviceWorkers: 'block' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const asked = [];
    await context.route('https://wa.me/**', route => {
        asked.push(route.request().url());
        return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>wa</title>' });
    });
    // The app's own clock, so that a reload boots on the same day; it runs on from there.
    await page.clock.install({ time: new Date(`${TODAY}T10:00:00+02:00`) });
    await page.goto(`${server.url}/index.html`, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof openPayslips === 'function' && typeof State === 'object');
    await page.evaluate(negative => {
        State.schedule.workers = [
            { id: 'w_01', name: 'דוגמה אלף', active: true, dailyRate: 450, hourlyRate: 60, phone: '050-0000001' },
            { id: 'w_02', name: 'דוגמה בית', active: true, dailyRate: 400, phone: '+972 52-000-0002',
                payCycles: '2026-10-02=weekly' },
            { id: 'w_03', name: 'דוגמה גימל עם שם ארוך במיוחד לבדיקה', active: true, phone: '054-0000003' },
            { id: 'w_04', name: 'דוגמה דלת', active: true, dailyRate: 380, phone: '' },
            { id: 'w_05', name: 'דוגמה הא', active: true, dailyRate: 420, phone: '0520000002',
                payCycles: '2026-10-02=weekly' },
            { id: 'w_06', name: 'דוגמה וו', active: true, dailyRate: 400, phone: '0500000006' }];
        State.schedule.places = [
            { id: 'p_01', name: 'אתר צפון', active: true },
            { id: 'p_02', name: 'מגדל המרכז עם שם ארוך', active: true }];
        State.commitRoster();
        ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-08', '2026-11-09']
            .forEach((date, at) => State.commit(assignPlace(State.schedule, date, 'w_01', 'actual',
                at % 2 ? 'p_02' : 'p_01')));
        ['2026-11-08', '2026-11-09'].forEach(date =>
            State.commit(assignPlace(State.schedule, date, 'w_02', 'actual', 'p_01')));
        State.commit(assignPlace(State.schedule, '2026-11-09', 'w_03', 'actual', 'p_02'));
        ['2026-11-03', '2026-11-04'].forEach(date =>
            State.commit(assignPlace(State.schedule, date, 'w_04', 'actual', 'p_01')));
        State.commit(assignPlace(State.schedule, '2026-11-09', 'w_05', 'actual', 'p_01'));
        State.commit(addAdvance(State.schedule, 'w_01', '2026-11-02', 1500, ''));
        // A week earlier, for the period before: בית worked one day of it.
        State.commit(assignPlace(State.schedule, '2026-11-02', 'w_02', 'actual', 'p_01'));
        if (negative) {
            // The amount the form refuses and the wire does not - see tests/payslips.test.mjs.
            State.schedule.advances.a_neg = { id: 'a_neg', workerId: 'w_05', date: '2026-11-09', amount: -300, note: '' };
            State.save();
        }
        showView('reports');
    }, Boolean(extra && extra.negative));
    await page.waitForTimeout(200);
    return { page, context, errors, asked };
}

const openMenu = async page => {
    if (!(await page.locator('.report-output-actions').evaluate(node => node.open))) {
        await page.locator('.report-output-actions > summary').click();
    }
};
const openList = async page => {
    await openMenu(page);
    await page.locator('#payslipsEntry').click();
    await page.waitForTimeout(150);
};
const guardOf = page => page.evaluate(() => PAYSLIPS_TAP_GUARD_MS);

// The tap that opens WhatsApp, and the address it asked for (see tests/seder.browser.mjs
// for why the address is waited for). The moment after the tap is waited out.
async function tapToWhatsApp(page, context, locator) {
    const [popup] = await Promise.all([context.waitForEvent('page'), locator.tap()]);
    await popup.waitForLoadState('domcontentloaded').catch(() => {});
    await popup.waitForURL(address => !['', 'about:blank'].includes(address.href), { timeout: 5000 }).catch(() => {});
    const url = popup.url();
    await popup.close();
    await page.bringToFront();
    await page.clock.runFor(300 + await guardOf(page));
    await page.waitForTimeout(150);
    return url;
}

// What the list shows, row by row.
const rowsOf = page => page.evaluate(() => [...document.querySelectorAll('#payslipsList .payslips-row')].map(row => ({
    id: row.dataset.workerId,
    name: row.querySelector('.payslips-name').textContent,
    when: row.querySelector('.payslips-when').textContent,
    figure: row.querySelector('.payslips-value').textContent,
    currency: Boolean(row.querySelector('.payslips-currency')),
    door: row.querySelector('a.payslips-door') ? row.querySelector('a.payslips-door').href : null,
    doorText: row.querySelector('a.payslips-door') ? row.querySelector('a.payslips-door').textContent : null,
    copy: Boolean(row.querySelector('.payslips-copy')),
    state: [...row.querySelectorAll('.payslips-state')].map(node => node.textContent),
    warn: [...row.querySelectorAll('.payslips-warn')].map(node => node.textContent)
})));

// The statement «שלח לעובד» would send this man for this range, and the figure the pay
// sheet DRAWS for him on the screen - with the whole crew on it, as the owner sees it.
const sheetOn = (page, id, from, to) => page.evaluate(([id, from, to]) => {
    const held = [REPORT_RANGE.from, REPORT_RANGE.to, REPORT_WORKERS, REPORT_PRESET];
    REPORT_RANGE.from = from; REPORT_RANGE.to = to; REPORT_WORKERS = null; REPORT_PRESET = 'custom';
    renderReports();
    const tile = document.querySelector(`#reportsView .report-worker-tile[data-report-worker-id="${id}"] .report-tile-value`);
    const out = { statement: workerStatementText(id), tile: tile ? tile.textContent : null };
    REPORT_RANGE.from = held[0]; REPORT_RANGE.to = held[1]; REPORT_WORKERS = held[2]; REPORT_PRESET = held[3];
    renderReports();
    return out;
}, [id, from, to]);

const FORTNIGHT = ['2026-10-30', '2026-11-12'];
const WEEK = ['2026-11-06', '2026-11-12'];
const PERIOD_OF = { w_01: FORTNIGHT, w_02: WEEK, w_03: FORTNIGHT, w_04: FORTNIGHT, w_05: WEEK };

// ------------------------------------------------------------------ the way in
{
    suite('one way in: a row of «הפקת דוח» on «לפי עובד», and nowhere else');
    const { page, context, errors } = await phone(440, 956, 'dark');

    const disk = await page.evaluate(() => JSON.stringify(Object.keys(localStorage).sort().map(key => [key, localStorage[key]])));
    const record = await page.evaluate(() => JSON.stringify(State.schedule));

    check('the menu is shut and the entry is not on the screen until it is opened',
        !(await page.locator('#payslipsEntry').isVisible()));
    const toolbar = await page.evaluate(() => [...document.querySelectorAll('#reportsView .reports-toolbar > *')]
        .map(node => node.className));
    same('the toolbar holds what it held: the heading and the one menu', toolbar, ['reports-heading', 'report-output-actions']);
    await openMenu(page);
    // «סיכום חודש» (js/ui/monthsummary.js, v187) is the menu's other added row and is not
    // this suite's: the three that were there, and this one last of all.
    same('the menu\'s rows: the three that were there, then this one',
        await page.locator('.report-output-actions button:visible:not(#monthSummaryOpen)').allTextContents().then(texts => texts.map(text => text.trim())),
        ['🖨️ הדפסה', '🖼️ שיתוף כתמונה', '📊 יצוא', ENTRY]);
    same('and it is the last row of the menu',
        await page.locator('.report-output-actions button:visible').last().getAttribute('id'), 'payslipsEntry');
    const entry = await page.evaluate(() => {
        const node = document.getElementById('payslipsEntry');
        const box = node.getBoundingClientRect();
        return { w: box.width, h: box.height, font: parseFloat(getComputedStyle(node).fontSize),
            inside: box.left >= 0 && box.right <= innerWidth + 1 && box.bottom <= innerHeight,
            sideways: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1 };
    });
    check('it is a thumb\'s worth both ways, 16px, on the glass, and the page does not scroll sideways',
        entry.w >= 44 && entry.h >= 44 && entry.font >= 16 && entry.inside && !entry.sideways, JSON.stringify(entry));
    if (SHOTS) await page.screenshot({ path: join(SHOTS, 'entry-440-dark.jpg'), type: 'jpeg', quality: 82 });

    // (The open menu lies over the switch below it, as it always has: shut it first.)
    await page.locator('.report-output-actions > summary').click();
    await page.locator('.report-section-toggle button').nth(1).tap();
    await openMenu(page);
    same('under «לפי אתר» the menu is the three it was, with no row of this file',
        [await page.locator('.report-output-actions button:visible:not(#monthSummaryOpen)').count(), await page.locator('#payslipsEntry:visible').count()], [3, 0]);
    await page.locator('.report-output-actions > summary').click();
    await page.locator('.report-section-toggle button').nth(0).tap();

    // NOT in the day's WhatsApp dialog, and not on the day.
    await page.evaluate(() => { State.date = '2026-11-09'; showView('day'); showDayMessage(); });
    await page.waitForTimeout(150);
    const share = await page.evaluate(() => ({
        open: document.getElementById('shareModal').style.display,
        rows: [...document.querySelectorAll('#shareModal .modal-actions > *')].map(node => node.textContent.trim()),
        any: /תלוש/.test(document.getElementById('shareModal').textContent),
        day: /תלוש/.test(document.getElementById('dayView') ? document.getElementById('dayView').textContent : '')
    }));
    given('the day\'s WhatsApp dialog is open', share.open === 'flex', JSON.stringify(share.rows));
    check('the day\'s WhatsApp dialog offers the seder and nothing about pay',
        !share.any && !share.day && share.rows.some(text => text.includes('לכל עובד בנפרד')), JSON.stringify(share.rows));
    await page.evaluate(() => { closeShareModal(); showView('reports'); });

    // THE LIST, entered by the tap.
    await openList(page);
    const opened = await page.evaluate(() => ({
        display: document.getElementById('payslipsModal').style.display,
        title: document.getElementById('payslipsTitle').textContent,
        focus: document.activeElement.id,
        menu: document.querySelector('.report-output-actions').open,
        lead: document.getElementById('payslipsLead').textContent,
        which: [...document.querySelectorAll('#payslipsWhich button')].map(node => [node.textContent, node.getAttribute('aria-pressed')]),
        periods: [...document.querySelectorAll('#payslipsContext .payslips-period')].map(node => node.textContent),
        status: document.getElementById('payslipsStatus').textContent
    }));
    same('the tap opens the list, entered at its heading, the menu shut behind it',
        [opened.display, opened.title, opened.focus, opened.menu], ['flex', TITLE, 'payslipsTitle', false]);
    same('before the first tap: what is sent', opened.lead, LEAD);
    same('and for which period - each cycle, its dates, its men', opened.periods.map(plain),
        ['30/10/2026 - 12/11/2026תשלום כל שבועיים · 3 עובדים', '06/11/2026 - 12/11/2026תשלום שבועי · 2 עובדים']);
    same('on the current period, the settlement\'s two words', opened.which,
        [['התקופה הנוכחית', 'true'], ['התקופה הקודמת', 'false']]);

    const rows = await rowsOf(page);
    same('the five men with a row on the sheet, in roster order - the sixth is not there',
        rows.map(row => row.id), ['w_01', 'w_02', 'w_03', 'w_04', 'w_05']);
    same('each under his own dates', rows.map(row => plain(row.when)),
        ['30/10/2026 - 12/11/2026', '06/11/2026 - 12/11/2026', '30/10/2026 - 12/11/2026',
            '30/10/2026 - 12/11/2026', '06/11/2026 - 12/11/2026']);

    // EACH FIGURE IS THE ONE THE PAY SHEET DRAWS, and each door carries the statement.
    const sheets = {};
    for (const row of rows) sheets[row.id] = await sheetOn(page, row.id, ...PERIOD_OF[row.id]);
    same('the figure on each row is the pay sheet\'s tile for that man over his own period',
        rows.map(row => row.figure), rows.map(row => sheets[row.id].tile));
    same('seven days at 450 less 1,500; two at 400; unknown; two at 380; one at 420',
        rows.map(row => plain(row.figure)), ['1650', '800', '—', '760', '420']);
    same('₪ stands beside a number and not beside an unknown wage', rows.map(row => row.currency),
        [true, true, false, true, true]);
    same('and the number each man\'s text states is that figure',
        rows.map(row => { const line = sheets[row.id].statement.split('\n').filter(text => text.indexOf('נותר לתשלום: ') === 0).pop();
            return line ? plain(line.slice(13)) : '—'; }),
        rows.map(row => plain(row.figure)));
    same('each door: wa.me, HIS number, HIS statement - and no door for the man with no number',
        rows.map(row => row.door),
        [`https://wa.me/972500000001?text=${encodeURIComponent(sheets.w_01.statement)}`,
            `https://wa.me/972520000002?text=${encodeURIComponent(sheets.w_02.statement)}`,
            `https://wa.me/972540000003?text=${encodeURIComponent(sheets.w_03.statement)}`,
            null,
            `https://wa.me/972520000002?text=${encodeURIComponent(sheets.w_05.statement)}`]);
    same('each door is worded with its man', rows.map(row => row.doorText),
        [go('דוגמה אלף'), go('דוגמה בית'), go('דוגמה גימל עם שם ארוך במיוחד לבדיקה'), null, go('דוגמה הא')]);
    same('the man with no number is told so and offered «העתק»; the two on one number are each told',
        rows.map(row => [row.copy, row.warn]),
        [[false, []], [false, [`⚠️ מספר משותף עם ${named('דוגמה הא')}`]], [false, []], [true, [NO_PHONE]],
            [false, [`⚠️ מספר משותף עם ${named('דוגמה בית')}`]]]);
    same('nothing is opened yet', opened.status, progress(0, 4));
    if (SHOTS) await page.screenshot({ path: join(SHOTS, 'list-440-dark.jpg'), type: 'jpeg', quality: 82 });

    // READING IT WROTE ONE KEY: the list being open, and nothing else anywhere.
    const after = await page.evaluate(() => JSON.stringify(Object.keys(localStorage).sort()
        .filter(key => key !== 'farkadPayslipsProgress').map(key => [key, localStorage[key]])));
    same('opening the list left every other key on the disk byte for byte', after, disk);
    same('and the record in memory', await page.evaluate(() => JSON.stringify(State.schedule)), record);
    same('the one key it wrote says the list is open, and holds nobody',
        await page.evaluate(key => { const kept = JSON.parse(localStorage[key]);
            return [Object.keys(kept).sort(), Object.keys(kept.periods).length, kept.open.which]; }, KEY),
        [['open', 'periods'], 0, 'current']);

    // ---------------------------------------------------------------- the preview
    suite('the message is read before it is opened');
    same('no message is unfolded until it is asked for', await page.locator('#payslipsList textarea').count(), 0);
    await page.locator('.payslips-row[data-worker-id="w_01"] .payslips-show').tap();
    const preview = await page.evaluate(() => {
        const box = document.querySelector('#payslipsList textarea');
        const show = document.querySelector('.payslips-row[data-worker-id="w_01"] .payslips-show');
        return { value: box.value, readOnly: box.readOnly, font: parseFloat(getComputedStyle(box).fontSize),
            row: box.closest('.payslips-row').dataset.workerId, label: box.getAttribute('aria-label'),
            show: show.textContent, expanded: show.getAttribute('aria-expanded'), focus: document.activeElement === show,
            count: document.querySelectorAll('#payslipsList textarea').length,
            inside: box.getBoundingClientRect().right <= innerWidth && box.getBoundingClientRect().left >= 0 };
    });
    same('the tap unfolds HIS statement, whole, in his own row', [preview.value, preview.row, preview.count],
        [sheets.w_01.statement, 'w_01', 1]);
    check('it names him, his dates and the figure on his row',
        preview.value.split('\n')[0] === `📄 ${named('דוגמה אלף')} - 30/10/2026 עד 12/11/2026`
        && plain(preview.value.split('\n').filter(line => line.indexOf('נותר לתשלום: ') === 0)[0]) === 'נותר לתשלום: 1650',
        preview.value.split('\n')[0]);
    same('read-only, 16px or more so the phone does not zoom, on the glass, named for him',
        [preview.readOnly, preview.font >= 16, preview.inside, preview.label],
        [true, true, true, `ההודעה ל${named('דוגמה אלף')}`]);
    same('the button now folds it, and kept the focus through the redraw',
        [preview.show, preview.expanded, preview.focus], [HIDE, 'true', true]);
    if (SHOTS) await page.screenshot({ path: join(SHOTS, 'preview-440-dark.jpg'), type: 'jpeg', quality: 82 });
    await page.locator('.payslips-row[data-worker-id="w_02"] .payslips-show').tap();
    same('another man\'s replaces it: one message on the screen at a time',
        await page.evaluate(() => [...document.querySelectorAll('#payslipsList textarea')]
            .map(box => [box.closest('.payslips-row').dataset.workerId, box.value])),
        [['w_02', sheets.w_02.statement]]);
    await page.locator('.payslips-row[data-worker-id="w_02"] .payslips-show').tap();
    same('and it folds away again', [await page.locator('#payslipsList textarea').count(),
        await page.locator('.payslips-row[data-worker-id="w_02"] .payslips-show').textContent()], [0, SHOW]);
    same('reading opened nobody', await page.locator('#payslipsStatus').textContent(), progress(0, 4));

    // ---------------------------------------------------------------- the tap
    suite('one tap opens WhatsApp on one man\'s number with his statement');
    const asked = [];
    context.on('page', popup => asked.push(popup));
    const url = await tapToWhatsApp(page, context, page.locator('.payslips-row[data-worker-id="w_01"] a.payslips-door'));
    same('the address the tap asked for: his number, his statement',
        url, `https://wa.me/972500000001?text=${encodeURIComponent(sheets.w_01.statement)}`);
    same('one window was opened', asked.length, 1);
    const marked = await rowsOf(page);
    same('he is marked «נפתח בוואטסאפ» - never more than that - and nobody else is',
        marked.map(row => row.state), [[OPENED], [], [], [], []]);
    same('the count moves', await page.locator('#payslipsStatus').textContent(), progress(1, 4));
    check('nothing on the list says «נשלח»', !/נשלח/.test(await page.locator('#payslipsModal').textContent()));
    check('his door is still there: opening him again is the person\'s choice', marked[0].door !== null);

    // TWO TAPS IN A ROW: the second, on another man's door, opens nobody and marks nobody.
    const [first] = await Promise.all([context.waitForEvent('page'),
        page.locator('.payslips-row[data-worker-id="w_02"] a.payslips-door').tap()]);
    await page.bringToFront();
    const before = asked.length;
    await page.locator('.payslips-row[data-worker-id="w_03"] a.payslips-door').tap();
    await page.waitForTimeout(400);
    same('a second tap in the moment after the first opens no second window', asked.length, before);
    await first.waitForURL(address => !['', 'about:blank'].includes(address.href), { timeout: 5000 }).catch(() => {});
    same('the first went to the man it was on', first.url(),
        `https://wa.me/972520000002?text=${encodeURIComponent(sheets.w_02.statement)}`);
    await first.close();
    await page.bringToFront();
    await page.clock.runFor(300 + await guardOf(page));
    await page.waitForTimeout(150);
    same('and only he was marked', (await rowsOf(page)).map(row => row.state), [[OPENED], [OPENED], [], [], []]);
    same('two of four', await page.locator('#payslipsStatus').textContent(), progress(2, 4));

    // ---------------------------------------------------------------- the copy
    suite('a man with no number: his statement is copied, and the list says what happened');
    await page.evaluate(() => {
        window.__copied = [];
        Object.defineProperty(navigator, 'clipboard', { configurable: true,
            value: { writeText: text => { window.__copied.push(text); return Promise.resolve(); } } });
    });
    const d4 = await sheetOn(page, 'w_04', ...FORTNIGHT);
    await page.locator('.payslips-row[data-worker-id="w_04"] .payslips-copy').tap();
    await page.waitForTimeout(150);
    same('«העתק» copies HIS statement', await page.evaluate(() => window.__copied), [d4.statement]);
    same('unfolds it, so it can be selected by hand where the clipboard is refused',
        await page.evaluate(() => [...document.querySelectorAll('#payslipsList textarea')]
            .map(box => [box.closest('.payslips-row').dataset.workerId, box.value === window.__copied[0]])),
        [['w_04', true]]);
    same('and says so, in the day message\'s own words', await page.locator('#payslipsSaid').textContent(), '✔️ הועתק');
    same('a copy is not an opening: he is not marked, and the count does not move',
        [(await rowsOf(page))[3].state, await page.locator('#payslipsStatus').textContent(), asked.length],
        [[], progress(2, 4), before]);

    // ---------------------------------------------------------------- a snapshot under it
    suite('a day recorded on another phone moves the row, the link and the mark');
    // What another phone's edit does on this one: the record moves and render() runs.
    await page.evaluate(() => { State.commit(assignPlace(State.schedule, '2026-11-10', 'w_01', 'actual', 'p_01')); render(); });
    await page.waitForTimeout(100);
    const moved = (await rowsOf(page))[0];
    same('his figure is the new one', plain(moved.figure), '2100');
    same('his link carries the new statement', decodeURIComponent(moved.door).split('\n').filter(line => line.indexOf('נותר לתשלום: ') === 0), ['נותר לתשלום: 2100']);
    same('and the mark is no longer believed, in the seder\'s words', [moved.state, moved.warn],
        [[], ['⚠️ השתנה מאז שנפתח - כדאי לפתוח שוב']]);
    same('one of four again', await page.locator('#payslipsStatus').textContent(), progress(1, 4));

    // ---------------------------------------------------------------- the period before
    suite('«התקופה הקודמת»: other dates, other men, other marks');
    await page.locator('#payslipsWhich button').nth(1).tap();
    await page.waitForTimeout(100);
    const prior = await rowsOf(page);
    const priorSheet = await sheetOn(page, 'w_02', '2026-10-30', '2026-11-05');
    same('the weekly man\'s week before, and only him', prior.map(row => [row.id, plain(row.when), plain(row.figure), row.state]),
        [['w_02', '30/10/2026 - 05/11/2026', '400', []]]);
    same('his door carries THAT week\'s statement', prior[0].door,
        `https://wa.me/972520000002?text=${encodeURIComponent(priorSheet.statement)}`);
    same('said above the list', (await page.locator('#payslipsContext .payslips-period').allTextContents()).map(plain),
        ['30/10/2026 - 05/11/2026תשלום שבועי · עובד אחד']);
    await page.locator('#payslipsWhich button').nth(0).tap();

    // ---------------------------------------------------------------- a reload mid-run
    suite('a reload in the middle of a run brings the list back, with its marks');
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => typeof openPayslips === 'function' && document.getElementById('payslipsModal').style.display === 'flex',
        null, { timeout: 8000 }).catch(() => {});
    const back = await page.evaluate(() => ({
        display: document.getElementById('payslipsModal').style.display,
        reports: document.getElementById('reportsView').offsetParent !== null,
        which: [...document.querySelectorAll('#payslipsWhich button')].map(node => node.getAttribute('aria-pressed'))
    }));
    same('the list is back, over the reports screen, on the period it was on',
        [back.display, back.reports, back.which], ['flex', true, ['true', 'false']]);
    same('the man opened before the reload is still marked; the one whose message moved still says so',
        (await rowsOf(page)).map(row => [row.state, row.warn.filter(text => text.indexOf('השתנה') !== -1).length]),
        [[[], 1], [[OPENED], 0], [[], 0], [[], 0], [[], 0]]);

    // ESCAPE closes it, hands the keyboard back, and a reload then does NOT bring it back.
    await openMenuAndBack(page);
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => typeof openPayslips === 'function' && typeof State === 'object');
    await page.waitForTimeout(400);
    same('closed on purpose, it is not brought back by a reload',
        await page.evaluate(() => document.getElementById('payslipsModal').style.display === 'flex'), false);
    check('while the marks are kept', await page.evaluate(key => Object.keys(JSON.parse(localStorage[key]).periods).length >= 2, KEY));

    check('nothing threw', errors.length === 0, errors.join(' | '));
    await context.close();
}

// Closed by Escape after being opened from the menu: the keyboard goes back to «הפקת דוח».
async function openMenuAndBack(page) {
    await page.evaluate(() => closePayslips());
    await openList(page);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
    const state = await page.evaluate(() => ({
        display: document.getElementById('payslipsModal').style.display,
        focus: document.activeElement.tagName + '.' + (document.activeElement.parentElement || {}).className,
        open: JSON.parse(localStorage.farkadPayslipsProgress).open
    }));
    same('Escape closes the list and gives the keyboard back to «הפקת דוח»',
        [state.display, state.focus, state.open], ['none', 'SUMMARY.report-output-actions', null]);
}

// ------------------------------------------------------------------ a held row
{
    suite('a row whose text and sheet state two figures has no door, on the screen');
    const { page, context, errors } = await phone(375, 667, 'dark', { negative: true });
    await openList(page);
    const rows = await rowsOf(page);
    const held = rows.filter(row => row.id === 'w_05')[0];
    const sheet = await sheetOn(page, 'w_05', ...WEEK);
    given('the sheet shows 420 and his statement states 720',
        plain(sheet.tile) === '420' && sheet.statement.split('\n').pop() === 'נותר לתשלום: 720',
        `${sheet.tile} | ${sheet.statement.split('\n').pop()}`);
    same('he is shown the SHEET\'s figure, the sentence, and no way to send it',
        [plain(held.figure), held.door, held.copy, held.warn[0]], ['420', null, false, DIFFERS]);
    same('the men beside him keep their doors, and he is not counted',
        [rows.filter(row => row.door).map(row => row.id), await page.locator('#payslipsStatus').textContent()],
        [['w_01', 'w_02', 'w_03'], progress(0, 3)]);
    await page.locator('.payslips-row[data-worker-id="w_05"] .payslips-show').tap();
    same('the message can still be read, so the person can see what is wrong',
        await page.locator('#payslipsList textarea').inputValue(), sheet.statement);
    const box = await page.evaluate(() => {
        const node = document.querySelector('.payslips-row[data-worker-id="w_05"] .payslips-warn');
        const at = node.getBoundingClientRect();
        const style = getComputedStyle(node);
        return { font: parseFloat(style.fontSize), inside: at.left >= 0 && at.right <= innerWidth + 1,
            cut: node.scrollWidth > node.clientWidth + 1 };
    });
    check('the sentence is 16px or more, whole, on the small phone', box.font >= 16 && box.inside && !box.cut, JSON.stringify(box));
    if (SHOTS) await page.screenshot({ path: join(SHOTS, 'held-375-dark.jpg'), type: 'jpeg', quality: 82 });
    check('nothing threw', errors.length === 0, errors.join(' | '));
    await context.close();
}

// ------------------------------------------------------------------ the rectangles
for (const [width, height, scheme, scale] of [[375, 667, 'light', 1], [375, 667, 'dark', 1],
    [440, 956, 'light', 1], [440, 956, 'dark', 1], [375, 667, 'dark', 2], [440, 956, 'light', 2]]) {
    const tag = `${width}x${height} ${scheme}${scale === 2 ? ' 200% text' : ''}`;
    suite(`rectangles - ${tag}`);
    const { page, context, errors } = await phone(width, height, scheme);
    await openList(page);
    // A message unfolded and a man marked, so every kind of thing a row can hold is drawn.
    await page.evaluate(() => {
        payslipsMarkOpened(payslipsFacts('current').rows[0]);
        payslipsPreview = 'w_04';
        renderPayslips();
    });
    if (scale === 2) {
        // Text zoom, not geometric zoom: the words double and the boxes have to make room.
        await page.evaluate(() => {
            [...document.querySelectorAll('#payslipsModal *')].map(node => [node, parseFloat(getComputedStyle(node).fontSize)])
                .forEach(([node, size]) => node.style.setProperty('font-size', `${size * 2}px`, 'important'));
        });
    }
    const measure = () => page.evaluate(() => {
        // Contrast of a text colour on the ground it stands on, by the WCAG formula.
        const parse = text => (text.match(/[\d.]+/g) || []).map(Number);
        const lum = ([r, g, b]) => [r, g, b].map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); })
            .reduce((sum, v, at) => sum + v * [0.2126, 0.7152, 0.0722][at], 0);
        const ratio = node => {
            let ground = node;
            let back = [0, 0, 0, 0];
            while (ground && back[3] === 0) {
                back = parse(getComputedStyle(ground).backgroundColor);
                if (back.length === 3) back.push(1);
                ground = ground.parentElement;
            }
            const a = lum(parse(getComputedStyle(node).color));
            const b = lum(back);
            return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
        };
        const modal = document.getElementById('payslipsModal');
        const content = modal.querySelector('.modal-content');
        const box = content.getBoundingClientRect();
        const shown = node => node.getBoundingClientRect().width > 0 && !node.hidden;
        const targets = [...content.querySelectorAll('button, a')].filter(shown);
        const texts = [...content.querySelectorAll('*')].filter(node => shown(node)
            && [...node.childNodes].some(child => child.nodeType === 3 && child.textContent.trim() !== ''));
        return {
            page: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
            sideways: content.scrollWidth <= content.clientWidth + 1,
            onGlass: box.left >= 0 && box.right <= innerWidth + 1 && box.top >= 0 && box.bottom <= innerHeight + 1,
            spill: [...content.querySelectorAll('*')].filter(shown).filter(node => {
                const at = node.getBoundingClientRect();
                return at.left < box.left - 1 || at.right > box.right + 1;
            }).map(node => node.className || node.tagName),
            cut: [...content.querySelectorAll('.payslips-name, .payslips-door, .payslips-warn, .payslips-show, .payslips-copy, .payslips-value, .payslips-period, h3')]
                .filter(node => node.scrollWidth > node.clientWidth + 1).map(node => node.className),
            small: targets.filter(node => { const at = node.getBoundingClientRect(); return at.width < 44 || at.height < 44; })
                .map(node => `${node.className} ${Math.round(node.getBoundingClientRect().width)}x${Math.round(node.getBoundingClientRect().height)}`),
            short: targets.filter(node => node.getBoundingClientRect().height < 48).map(node => node.className),
            targets: targets.length,
            tiny: texts.filter(node => parseFloat(getComputedStyle(node).fontSize) < 16)
                .map(node => `${node.className || node.tagName} ${getComputedStyle(node).fontSize}`),
            fields: [...content.querySelectorAll('input, select, textarea')].map(node => parseFloat(getComputedStyle(node).fontSize)),
            name: parseFloat(getComputedStyle(content.querySelector('.payslips-name')).fontSize),
            value: parseFloat(getComputedStyle(content.querySelector('.payslips-value')).fontSize),
            weight: Number(getComputedStyle(content.querySelector('.payslips-value')).fontWeight),
            faint: texts.map(node => [node.className || node.tagName, ratio(node)]).filter(([, r]) => r < 4.5)
                .map(([name, r]) => `${name} ${r.toFixed(2)}`),
            rtl: getComputedStyle(content).direction,
            close: (() => { const at = document.getElementById('payslipsClose').getBoundingClientRect();
                return at.bottom <= innerHeight + 1 && at.top >= box.top && at.bottom <= box.bottom + 1; })()
        };
    });
    const top = await measure();
    check(`${tag}: the list is wholly on the glass and the page does not scroll sideways`, top.onGlass && top.page, JSON.stringify(top));
    check(`${tag}: nothing in it reaches past its edge or is cut`, top.sideways && top.spill.length === 0 && top.cut.length === 0,
        JSON.stringify([top.spill.slice(0, 5), top.cut]));
    check(`${tag}: every control is 44px both ways and 48px tall - doors, previews, copy, the two periods, close`,
        top.small.length === 0 && top.short.length === 0 && top.targets >= 12, JSON.stringify([top.small, top.short, top.targets]));
    check(`${tag}: no text on it is under 16px; a name is 18px or more and the figure the largest, and heavy`,
        top.tiny.length === 0 && top.name >= 18 * scale && top.value >= 28 * scale && top.weight >= 700,
        JSON.stringify([top.tiny, top.name, top.value, top.weight]));
    check(`${tag}: the unfolded message is a field of 16px or more`, top.fields.length === 1 && top.fields[0] >= 16, JSON.stringify(top.fields));
    check(`${tag}: every piece of text stands at 4.5:1 or better on its ground`, top.faint.length === 0, JSON.stringify(top.faint));
    same(`${tag}: it reads right to left`, top.rtl, 'rtl');
    check(`${tag}: «סגור» is on the glass, at the foot of the list`, top.close, JSON.stringify(top));
    await page.evaluate(() => { const content = document.querySelector('#payslipsModal .modal-content'); content.scrollTop = content.scrollHeight; });
    await page.waitForTimeout(100);
    const foot = await measure();
    check(`${tag}: scrolled to its end, the same holds and «סגור» is still under the thumb`,
        foot.close && foot.sideways && foot.small.length === 0 && foot.spill.length === 0, JSON.stringify([foot.small, foot.spill]));
    const last = await page.evaluate(() => {
        const rows = [...document.querySelectorAll('#payslipsList .payslips-row')];
        const door = rows[rows.length - 1].querySelector('a.payslips-door').getBoundingClientRect();
        const close = document.querySelector('.payslips-foot').getBoundingClientRect();
        return door.bottom <= close.top + 1;
    });
    check(`${tag}: the last man's door stands clear above the foot`, last);
    if (SHOTS && scale === 2 && width === 375) {
        await page.evaluate(() => { document.querySelector('#payslipsModal .modal-content').scrollTop = 0; });
        await page.screenshot({ path: join(SHOTS, 'list-375-dark-200pct.jpg'), type: 'jpeg', quality: 82 });
        await page.evaluate(() => document.querySelector('.payslips-row[data-worker-id="w_02"]').scrollIntoView());
        await page.screenshot({ path: join(SHOTS, 'row-375-dark-200pct.jpg'), type: 'jpeg', quality: 82 });
    }
    if (SHOTS && scale === 1 && width === 375) {
        await page.evaluate(() => document.querySelector('.payslips-row[data-worker-id="w_01"]').scrollIntoView());
        await page.screenshot({ path: join(SHOTS, `rows-375-${scheme}.jpg`), type: 'jpeg', quality: 82 });
    }
    if (SHOTS && scale === 1 && width === 440 && scheme === 'dark') {
        await page.screenshot({ path: join(SHOTS, 'list-foot-440-dark.jpg'), type: 'jpeg', quality: 82 });
    }
    check(`${tag}: nothing threw`, errors.length === 0, errors.join(' | '));
    await context.close();
}

await browser.close();
await server.close();
report();
