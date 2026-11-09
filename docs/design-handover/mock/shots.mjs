// Design-audit screenshots of every פרקד screen and dialog, with FIXTURE data only.
// Not a test: asserts nothing. Serves the clone the way tests/mobile.test.mjs does.
//
//   ROOT=~/farkad-design OUT=~/farkad-design-shots/before node shots.mjs
//   ONLY=day-sites,sheet SIZES=440 SCHEMES=dark node shots.mjs
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.env.ROOT || '/home/yosef/farkad-design';
const OUT = process.env.OUT || '/home/yosef/farkad-design-shots/before';
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null;
const SIZES = (process.env.SIZES || '440,375').split(',').map(tag => (
    tag === '440' ? { tag, w: 440, h: 956 } : tag === '375' ? { tag, w: 375, h: 667 } : { tag, w: 390, h: 844 }));
const SCHEMES = (process.env.SCHEMES || 'dark,light').split(',');

const { chromium } = await import(join(ROOT, 'node_modules/playwright/index.mjs'));
const { serve } = await import(join(ROOT, 'tests/serve.mjs'));

const server = await serve(ROOT);
const browser = await chromium.launch();

// ---------------------------------------------------------------- the fixture
// A crew of twelve plus one archived man, four sites, a fortnight of recorded days,
// Rima counts on two sites, three advances. Today is Thursday 2026-11-05.
function seed() {
    const TODAY = '2026-11-05';
    todayStr = () => TODAY;
    const names = ['מוחמד', 'ח׳אלד', 'יוסי', 'עלי', 'אברהים', 'סאמר', 'ראמי', 'דוד', 'פאדי', 'נאסר', 'אמיר', 'ווליד'];
    State.schedule.workers = names.map((name, i) => ({
        id: 'w_' + String(i + 1).padStart(2, '0'),
        name, active: true,
        dailyRate: [450, 400, 500, 400, 420, 380, 380, 450, 400, 420, 400, 380][i],
        hourlyRate: i === 3 ? 0 : 50 + (i % 3) * 5,
        phone: i === 4 ? '' : `05${(i % 5) + 1}-${String(100 + i * 11).slice(-3)}-${String(4000 + i * 123).slice(-4)}`
    }));
    State.schedule.workers.push({ id: 'w_13', name: 'שאדי', active: false, dailyRate: 380, hourlyRate: 45 });
    State.schedule.places = [
        { id: 'p_01', name: 'הרצליה', active: true },
        { id: 'p_02', name: 'פרדסיה', active: true },
        { id: 'p_03', name: 'כפר סבא', active: true },
        { id: 'p_04', name: 'נתניה', active: true }
    ];
    const sites = ['p_01', 'p_02', 'p_03', 'p_04'];
    // Fri 2026-10-23 .. Wed 2026-11-04: Sun-Thu everyone, Fridays half the crew, one
    // absence here and there, one double, one extra-hours day a week.
    const day = new Date(2026, 9, 23, 12);
    let k = 0;
    while (day < new Date(2026, 10, 5, 12)) {
        const date = toLocalDateStr(day);
        const dow = day.getDay();
        if (dow !== 6) {
            names.forEach((unused, i) => {
                const id = 'w_' + String(i + 1).padStart(2, '0');
                if (dow === 5 && i % 2) return;
                if ((i + k) % 9 === 4) { markAbsent(State.schedule, date, id, 'actual'); return; }
                const site = sites[(i + k) % 4];
                assignPlace(State.schedule, date, id, 'actual', site, RATE_NORMAL);
                if ((i + k) % 11 === 2) setRate(State.schedule, date, id, 'actual', site, RATE_DOUBLE, 0);
                if ((i + k) % 13 === 7) setRate(State.schedule, date, id, 'actual', site, RATE_EXTRA, 2);
            });
            if (dow === 1 || dow === 3) setRimaCount(State.schedule, date, 'p_01', 2 + (k % 2));
            if (dow === 2) setRimaCount(State.schedule, date, 'p_03', 1);
            k++;
        }
        day.setDate(day.getDate() + 1);
    }
    // Today: four sites with people, one man absent, two still unrecorded.
    const T = TODAY;
    assignPlace(State.schedule, T, 'w_01', 'actual', 'p_01', RATE_NORMAL);
    assignPlace(State.schedule, T, 'w_02', 'actual', 'p_01', RATE_DOUBLE);
    assignPlace(State.schedule, T, 'w_08', 'actual', 'p_01', RATE_NORMAL);
    assignPlace(State.schedule, T, 'w_03', 'actual', 'p_02', RATE_EXTRA, 2);
    assignPlace(State.schedule, T, 'w_09', 'actual', 'p_02', RATE_NORMAL);
    assignPlace(State.schedule, T, 'w_04', 'actual', 'p_03', RATE_NORMAL);
    assignPlace(State.schedule, T, 'w_10', 'actual', 'p_03', RATE_NORMAL);
    assignPlace(State.schedule, T, 'w_11', 'actual', 'p_03', RATE_NORMAL);
    assignPlace(State.schedule, T, 'w_12', 'actual', 'p_04', RATE_NORMAL);
    markAbsent(State.schedule, T, 'w_07', 'actual');
    setRimaCount(State.schedule, T, 'p_01', 3);
    setRimaCount(State.schedule, T, 'p_03', 2);
    addAdvance(State.schedule, 'w_01', '2026-10-26', 500, 'מזומן');
    addAdvance(State.schedule, 'w_03', '2026-11-02', 250, '');
    addAdvance(State.schedule, 'w_02', '2026-10-20', 300, '');
    State.date = TODAY;
    State.save();
}

function pin() {
    todayStr = () => '2026-11-05';
    State.date = '2026-11-05';
    render();
}

// Everything a screen may have left open, closed - without touching the record.
function resetUi() {
    const ask = document.getElementById('askModal');
    if (ask && ask.style.display === 'flex' && typeof askCancel === 'function') askCancel();
    document.querySelectorAll('.modal').forEach(m => { m.style.display = 'none'; });
    try { if (typeof closeSettings === 'function') closeSettings(); } catch (e) {}
    try { if (typeof closeDayDrawer === 'function') closeDayDrawer(); } catch (e) {}
    try { if (typeof closeAssignSheet === 'function') closeAssignSheet(); } catch (e) {}
    try { if (typeof closeReorder === 'function') closeReorder(); } catch (e) {}
    ['updateBanner', 'undoBar'].forEach(id => { const n = document.getElementById(id); if (n) n.style.display = 'none'; });
    document.body.classList.remove('day-compact');
    window.scrollTo(0, 0);
}

// name, setup (page side), options { fullPage, wait, post (page side), fresh }
const SCREENS = [
    ['day-sites', () => { showView('day'); setDayMode('sites'); render(); }],
    ['day-sites-complete', () => { State.date = '2026-11-04'; showView('day'); setDayMode('sites'); render(); }, { post: () => { State.date = '2026-11-05'; } }],
    ['day-workers', () => { showView('day'); setDayMode('workers'); render(); }],
    ['day-compact', () => { showView('day'); setDayMode('workers'); render(); window.scrollTo(0, 320); }, { wait: 700 }],
    // A day with the crew on it and nothing recorded yet: where the copy button shows.
    ['day-empty', () => { State.date = '2026-11-06'; showView('day'); setDayMode('workers'); render(); }, { post: () => { State.date = '2026-11-05'; } }],
    // The ⋯ sheet of the G2 mock-up; skipped on a page without the mock.
    ['day-more', () => { showView('day'); setDayMode('workers'); render(); const m = document.querySelector('.day-more'); if (!m) return 'skip'; m.click(); }, { post: () => { if (typeof closeDayMore === 'function') closeDayMore(); } }],
    ['day-bulk', () => { showView('day'); setDayMode('workers'); bulkOpen = true; render(); }, { post: () => { bulkOpen = false; } }],
    ['day-drawer', () => { showView('day'); setDayMode('workers'); render(); openDayDrawer(); }, { wait: 600 }],
    ['sheet', () => { showView('day'); setDayMode('workers'); render(); openAssignSheet('w_03'); }],
    ['sheet-empty', () => { showView('day'); setDayMode('workers'); render(); openAssignSheet('w_06'); }],
    ['worker-picker', () => { showView('day'); setDayMode('sites'); render(); openWorkerPicker('p_01'); }],
    ['place-picker', () => { showView('day'); setDayMode('sites'); render(); openPlacePicker('w_06'); }],
    ['undo-bar', () => { showView('day'); setDayMode('workers'); render(); document.querySelector('.wrow .btn-icon').click(); }, { post: () => { if (typeof runUndo === 'function') runUndo(); } }],
    ['update-banner', () => { showView('day'); setDayMode('workers'); render(); showUpdateBanner({ postMessage() {} }); }],
    ['week-grid', () => { showView('week'); setWeekPhoneMode('grid'); }],
    ['week-days', () => { showView('week'); setWeekPhoneMode('days'); }, { fullPage: true }],
    ['roster', () => { showView('roster'); render(); }, { fullPage: true }],
    ['worker-form', () => { showView('roster'); render(); editWorker('w_01'); }],
    ['worker-form-new', () => { showView('roster'); render(); showAddWorkerModal(); }],
    ['reorder', () => { showView('roster'); render(); openReorder(); }],
    ['advances', () => { ADVANCE_WORKER = null; showView('advances'); render(); }, { fullPage: true }],
    ['advances-worker', () => { showView('advances'); showWorkerAdvances('w_01'); }, { fullPage: true, post: () => { ADVANCE_WORKER = null; } }],
    ['reports-pay', () => { REPORT_SECTION = 'workers'; REPORT_RANGE_OPEN = false; showView('reports'); render(); }, { fullPage: true }],
    ['reports-pay-table', () => { REPORT_SECTION = 'workers'; REPORT_CARD_GRID = false; showView('reports'); render(); }, { fullPage: true, post: () => { REPORT_CARD_GRID = true; } }],
    ['reports-filters', () => {
        REPORT_SECTION = 'workers'; REPORT_RANGE_OPEN = true; REPORT_PRESET = 'custom'; showView('reports'); render();
        const wp = document.querySelector('.report-worker-picker'); if (wp) wp.open = true;
        const oa = document.querySelector('.report-output-actions'); if (oa) oa.open = true;
    }, { post: () => { REPORT_RANGE_OPEN = false; REPORT_PRESET = 'fortnight'; } }],
    ['reports-invoice', () => { REPORT_SECTION = 'sites'; INVOICE_PLACE = null; showView('reports'); render(); }, { fullPage: true }],
    ['worker-days', () => { REPORT_SECTION = 'workers'; showView('reports'); render(); openWorkerDays('w_01'); }],
    ['settings', () => { openSettings(); }],
    ['settings-2', () => { openSettings(); document.querySelector('.settings-body').scrollTop = 760; }],
    ['settings-3', () => { openSettings(); document.querySelector('.settings-body').scrollTop = 1700; }],
    ['whatsapp', () => { showView('day'); render(); showDayMessage(); }],
    ['seder', () => { showView('day'); render(); openSederList('2026-11-05'); }],
    ['ask-confirm', () => { askConfirm({ title: 'להעביר את מוחמד לארכיון?', message: 'הוא לא יופיע יותר ברשימת היום. הרישומים שלו נשמרים.', ok: 'לארכיון' }); }],
    ['ask-text', () => { askText({ title: 'שם האתר', value: 'הרצליה', ok: 'שמור' }); }],
    ['ask-choice', () => { askChoice({ title: 'לצאת מסידור העובדים?', message: 'יש שינויים שלא נשמרו.', choices: ['לשמור ולצאת', 'לצאת בלי לשמור', 'להישאר'] }); }],
    // G3: the ⋯ sheets of the other screens, the pay-day feature (visual mock), offline.
    ['roster-more', () => { showView('roster'); render(); const m = document.querySelector('#rosterView .day-more'); if (!m) return 'skip'; m.click(); }, { post: () => { if (typeof closeDayMore === 'function') closeDayMore(); } }],
    ['week-more', () => { showView('week'); setWeekPhoneMode('grid'); const m = document.querySelector('#weekView .day-more'); if (!m) return 'skip'; m.click(); }, { post: () => { if (typeof closeDayMore === 'function') closeDayMore(); } }],
    ['payday-entry', () => { if (typeof mockPayday !== 'function') return 'skip'; ADVANCE_WORKER = null; showView('advances'); render(); mockPayday('entry'); }],
    ['payday-weekly', () => { if (typeof mockPayday !== 'function') return 'skip'; ADVANCE_WORKER = null; showView('advances'); render(); mockPayday('weekly'); }, { fullPage: true }],
    ['payday-confirm', () => {
        if (typeof mockPayday !== 'function') return 'skip';
        ADVANCE_WORKER = null; showView('advances'); render(); mockPayday('weekly');
        askConfirm({ title: 'לסגור ולשלם ל־4 עובדים?', message: 'לתשלום עכשיו: 7,570 ₪. קיזוז מקדמות: 1,800 ₪. חוב של 3,200 ₪ נשאר אצלם ועובר לתקופה הבאה.', ok: 'שילמתי, סגור', footer: 'סגירה היא סופית - אי אפשר לבטל אותה, רק לרשום תיקון לצידה.' });
    }],
    ['payday-paid', () => { if (typeof mockPayday !== 'function') return 'skip'; ADVANCE_WORKER = null; showView('advances'); render(); mockPayday('paid'); }, { fullPage: true }],
    ['offline', () => { showView('day'); setDayMode('workers'); render(); }, { offline: true, wait: 900 }],
    // The empty app: a fresh device, nothing recorded.
    ['empty-day', () => { showView('day'); render(); }, { fresh: true }],
    ['empty-roster', () => { showView('roster'); render(); }, { fresh: true }],
    ['empty-week', () => { showView('week'); render(); }, { fresh: true }],
    ['empty-advances', () => { showView('advances'); render(); }, { fresh: true }],
    ['empty-reports', () => { showView('reports'); render(); }, { fresh: true }]
];

const sleep = ms => new Promise(r => setTimeout(r, ms));

// MOCK=/path/to.css injects a stylesheet AFTER the app's own, on every page this
// script opens: the "after" of a proposal, rendered without touching the clone.
const MOCKS = process.env.MOCK ? process.env.MOCK.split(',') : [];
// MOCKJS=/path/to.js runs a script after the stylesheets: the DOM moves a CSS-only
// mock-up cannot make (mock-g2.js). It hooks render() so every later screen carries them.
const MOCKJS = process.env.MOCKJS ? process.env.MOCKJS.split(',') : [];
async function mock(page) {
    for (const path of MOCKS) await page.addStyleTag({ path });
    for (const path of MOCKJS) await page.addScriptTag({ path });
    if (MOCKS.length || MOCKJS.length) await page.evaluate(() => { if (typeof render === 'function') render(); });
}

async function openApp(context, fresh) {
    const page = await context.newPage();
    page.on('dialog', d => d.accept());
    page.on('pageerror', e => console.error('  pageerror:', e.message));
    await page.goto(`${server.url}/index.html`, { waitUntil: 'load' });
    await sleep(400);
    if (fresh) {
        await page.evaluate(() => { todayStr = () => '2026-11-05'; render(); });
        await mock(page);
        return page;
    }
    await page.evaluate(seed);
    // Boot again from the disk, like a real phone: the ledger mirror and every
    // boot-time check run over the fixture.
    await page.reload({ waitUntil: 'load' });
    await sleep(400);
    await page.evaluate(pin);
    await mock(page);
    await sleep(300);
    return page;
}

for (const size of SIZES) {
    for (const scheme of SCHEMES) {
        const dir = join(OUT, `${size.tag}-${scheme}`);
        mkdirSync(dir, { recursive: true });
        const context = await browser.newContext({
            viewport: { width: size.w, height: size.h },
            deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: scheme,
            locale: 'he-IL', timezoneId: 'Asia/Jerusalem'
        });
        const page = await openApp(context, false);
        let freshPage = null;
        for (const [name, setup, options = {}] of SCREENS) {
            if (ONLY && !ONLY.has(name)) continue;
            let target = page;
            if (options.fresh) {
                if (!freshPage) {
                    const freshContext = await browser.newContext({
                        viewport: { width: size.w, height: size.h },
                        deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: scheme,
                        locale: 'he-IL', timezoneId: 'Asia/Jerusalem'
                    });
                    freshPage = await openApp(freshContext, true);
                }
                target = freshPage;
            }
            try {
                await target.evaluate(resetUi);
                await sleep(150);
                const flag = await target.evaluate(setup);
                if (flag === 'skip') { console.log(`${size.tag}-${scheme} ${name} skipped`); continue; }
                // A real loss of network, so the app's own offline handling paints its banner.
                if (options.offline) await target.context().setOffline(true);
                await sleep(options.wait || 450);
                await target.screenshot({ path: join(dir, `${name}.png`), fullPage: Boolean(options.fullPage) });
                if (options.offline) { await target.context().setOffline(false); await sleep(300); }
                if (options.post) await target.evaluate(options.post);
                console.log(`${size.tag}-${scheme} ${name}`);
            } catch (error) {
                console.error(`${size.tag}-${scheme} ${name} FAILED: ${error.message.split('\n')[0]}`);
            }
        }
        await context.close();
        if (freshPage) await freshPage.context().close();
    }
}

await browser.close();
await server.close();
