// A compact DOM outline of each screen (class names, a text excerpt), so the mock-up CSS
// can be written against the real markup without reading every render function.
//   ONLY=roster,week-grid node dom.mjs
import { join } from 'node:path';
const ROOT = process.env.ROOT || '/home/yosef/farkad-design';
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null;
const DEPTH = Number(process.env.DEPTH || 5);
const { chromium } = await import(join(ROOT, 'node_modules/playwright/index.mjs'));
const { serve } = await import(join(ROOT, 'tests/serve.mjs'));
const server = await serve(ROOT);
const browser = await chromium.launch();
const context = await browser.newContext({
    viewport: { width: 440, height: 956 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true,
    colorScheme: 'dark', locale: 'he-IL', timezoneId: 'Asia/Jerusalem'
});
const page = await context.newPage();
page.on('pageerror', e => console.error('pageerror:', e.message));
await page.goto(`${server.url}/index.html`, { waitUntil: 'load' });
await new Promise(r => setTimeout(r, 400));
// the same fixture as shots.mjs, abbreviated
await page.evaluate(() => {
    const TODAY = '2026-11-05';
    todayStr = () => TODAY;
    const names = ['מוחמד', 'ח׳אלד', 'יוסי', 'עלי', 'אברהים', 'סאמר'];
    State.schedule.workers = names.map((name, i) => ({ id: 'w_' + String(i + 1).padStart(2, '0'), name, active: true, dailyRate: 450, hourlyRate: 50, phone: '051-100-4000' }));
    State.schedule.places = [{ id: 'p_01', name: 'הרצליה', active: true }, { id: 'p_02', name: 'פרדסיה', active: true }];
    assignPlace(State.schedule, TODAY, 'w_01', 'actual', 'p_01', RATE_NORMAL);
    assignPlace(State.schedule, TODAY, 'w_02', 'actual', 'p_01', RATE_DOUBLE);
    assignPlace(State.schedule, '2026-11-04', 'w_01', 'actual', 'p_02', RATE_NORMAL);
    markAbsent(State.schedule, TODAY, 'w_03', 'actual');
    setRimaCount(State.schedule, TODAY, 'p_01', 2);
    addAdvance(State.schedule, 'w_01', '2026-10-26', 500, 'מזומן');
    State.date = TODAY;
    State.save();
});
await page.reload({ waitUntil: 'load' });
await new Promise(r => setTimeout(r, 400));
await page.evaluate(() => { todayStr = () => '2026-11-05'; State.date = '2026-11-05'; render(); });

const SCREENS = {
    'roster': [() => { showView('roster'); render(); }, '#rosterView'],
    'worker-form': [() => { showView('roster'); render(); editWorker('w_01'); }, '.modal[style*="flex"], .modal:not([style*="none"])'],
    'reorder': [() => { showView('roster'); render(); openReorder(); }, '#reorderPanel, .reorder-panel, .reorder'],
    'week-grid': [() => { showView('week'); setWeekPhoneMode('grid'); }, '#weekView'],
    'week-days': [() => { showView('week'); setWeekPhoneMode('days'); }, '#weekView'],
    'reports-pay': [() => { REPORT_SECTION = 'workers'; REPORT_RANGE_OPEN = false; showView('reports'); render(); }, '#reportsView'],
    'reports-filters': [() => { REPORT_SECTION = 'workers'; REPORT_RANGE_OPEN = true; REPORT_PRESET = 'custom'; showView('reports'); render(); const wp = document.querySelector('.report-worker-picker'); if (wp) wp.open = true; }, '#reportsView'],
    'reports-invoice': [() => { REPORT_SECTION = 'sites'; INVOICE_PLACE = null; showView('reports'); render(); }, '#reportsView'],
    'worker-days': [() => { REPORT_SECTION = 'workers'; showView('reports'); render(); openWorkerDays('w_01'); }, '.modal[style*="flex"]'],
    'advances': [() => { ADVANCE_WORKER = null; showView('advances'); render(); }, '#advancesView'],
    'advances-worker': [() => { showView('advances'); showWorkerAdvances('w_01'); }, '#advancesView'],
    'settings': [() => { openSettings(); }, '#settingsPanel'],
    'sheet': [() => { showView('day'); setDayMode('workers'); render(); openAssignSheet('w_02'); }, '.sheet, .assign-sheet, #assignSheet'],
    'worker-picker': [() => { showView('day'); setDayMode('sites'); render(); openWorkerPicker('p_01'); }, '.modal[style*="flex"]'],
    'place-picker': [() => { showView('day'); setDayMode('sites'); render(); openPlacePicker('w_04'); }, '.modal[style*="flex"]'],
    'day-drawer': [() => { showView('day'); render(); openDayDrawer(); }, '.day-drawer'],
    'whatsapp': [() => { showView('day'); render(); showDayMessage(); }, '.modal[style*="flex"]'],
    'seder': [() => { showView('day'); render(); openSederList('2026-11-05'); }, '.modal[style*="flex"]'],
    'ask-confirm': [() => { askConfirm({ title: 'להעביר?', message: 'טקסט.', ok: 'לארכיון' }); }, '#askModal'],
    'undo-bar': [() => { showView('day'); setDayMode('workers'); render(); document.querySelector('.wrow .btn-icon').click(); }, '#undoBar'],
    'update-banner': [() => { showUpdateBanner({ postMessage() {} }); }, '#updateBanner'],
    'banners': [() => {}, '#storageBanner, #accountBanner, #recoveryBanner, #offlineBanner, #installBanner, #migrationBanner']
};

function outline(selector, depth) {
    const roots = Array.from(document.querySelectorAll(selector));
    const lines = [];
    const seen = new Map();
    function walk(node, level) {
        if (level > depth) return;
        const cls = node.className && typeof node.className === 'string' ? '.' + node.className.trim().split(/\s+/).join('.') : '';
        const id = node.id ? '#' + node.id : '';
        const own = Array.from(node.childNodes).filter(n => n.nodeType === 3).map(n => n.textContent.trim()).filter(Boolean).join(' ');
        const text = own || (node.children.length === 0 ? node.textContent.trim() : '');
        const style = node.getAttribute && node.getAttribute('style') ? ' [style]' : '';
        lines.push('  '.repeat(level) + node.tagName.toLowerCase() + id + cls + style + (text ? '  «' + text.slice(0, 40) + '»' : ''));
        const counts = new Map();
        for (const child of node.children) {
            const key = child.tagName + '|' + child.className;
            const n = (counts.get(key) || 0) + 1;
            counts.set(key, n);
            if (n > 2) { if (n === 3) lines.push('  '.repeat(level + 1) + '… more ' + child.tagName.toLowerCase() + (child.className ? '.' + String(child.className).split(' ')[0] : '')); continue; }
            walk(child, level + 1);
        }
    }
    roots.forEach(r => walk(r, 0));
    return lines.join('\n');
}

for (const [name, [setup, selector]] of Object.entries(SCREENS)) {
    if (ONLY && !ONLY.has(name)) continue;
    try {
        await page.evaluate(() => {
            const ask = document.getElementById('askModal');
            if (ask && ask.style.display === 'flex' && typeof askCancel === 'function') askCancel();
            document.querySelectorAll('.modal').forEach(m => { m.style.display = 'none'; });
            try { closeSettings(); } catch (e) {}
            try { closeDayDrawer(); } catch (e) {}
            try { closeAssignSheet(); } catch (e) {}
            try { closeReorder(); } catch (e) {}
        });
        await page.evaluate(setup);
        await new Promise(r => setTimeout(r, 350));
        const text = await page.evaluate(({ sel, d, src }) => {
            const fn = new Function('return ' + src)();
            return fn(sel, d);
        }, { sel: selector, d: DEPTH, src: outline.toString() }).catch(e => 'ERR ' + e.message);
        console.log(`\n===== ${name}  (${selector})\n${text}`);
    } catch (error) {
        console.log(`\n===== ${name} FAILED: ${error.message.split('\n')[0]}`);
    }
}
// expose outline to the page for evaluate
await browser.close();
await server.close();
