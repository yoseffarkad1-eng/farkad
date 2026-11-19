// סיכום שנה in a real Chromium.
//
//   node tests/yearsummary.browser.mjs
//
// tests/yearsummary.test.mjs holds every figure against the functions it is read from, on
// devices in Node. What it cannot hold is the glass: that «סיכום חודש» carries the door, worded
// for the month on screen and worded again across a December/January step, 48px and its words
// inside it; that a tap shuts the month and opens the year entered at its heading, with
// «מחשב את השנה…» painted in a frame of its own before one figure is read; that the arrows walk
// the years and keep the focus; that a month's row opens «סיכום חודש» on that month at its
// heading; that the export hands the browser farkad-year_<YYYY>.xlsx with its sheets in order,
// or the CSV files where the library is missing, in the export's own sentences - and never
// points at a picture this dialog has not got, «שמירה חוזרת» asking the YEAR's export again;
// that Escape, the backdrop and «סגור» shut it and give the focus back, Tab stays inside it and
// midEdit() holds an update back while it is open; that a commit and a snapshot adopted under
// it are never read inside render() - the figures go at once and the year is read ONCE, 1.5 s
// after the last of three commits, the reader's place kept; that it fits 320x568, 375x667 and
// 440x956, dark and light, with and without «תצוגה גדולה», and at doubled text - no sideways
// scroll, nothing cut, every target 48px (52 with the mode), nothing under 16px (18 with it),
// 4.5:1 (7:1 with it); that a season is read inside its budget at 4x CPU and the workbook
// handed over inside its own; that the phone's disk is byte for byte what it was. NOT a real
// phone: emulated touch and Chromium's layout. Nobody far-sighted has looked at it.
//
// YEARSUMMARY_SHOTS=<folder> also saves JPEG pictures of it there (they assert nothing).

import { chromium } from 'playwright';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { serve } from './serve.mjs';
import { launchLocalBrowser } from './network-guard.mjs';
import { verifyServedAssets, expectedShaFor } from './treecheck.mjs';
import { suite, check, same, given, report } from './runner.mjs';
import { censusOnly } from './census.mjs';
import { measureInPage } from './screens.mjs';
import { tapsAtAPersonsPace } from './pace.mjs';

const root = new URL('..', import.meta.url).pathname;
const server = await serve(root);
check('the browser is served the named tree',
    (await verifyServedAssets(server.url, root, expectedShaFor(root))).ok);
const browser = await launchLocalBrowser(chromium, { executablePath: process.env.CHROME_PATH });
const errors = [];
const SHOTS = process.env.YEARSUMMARY_SHOTS || '';
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const TODAY = '2026-11-19';
const plain = text => String(text).replace(/[\u200e\u2066-\u2069]/g, '');
const brief = (rows, say) => rows.slice(0, 5).map(say).join(' | ') + (rows.length > 5 ? ` … +${rows.length - 5}` : '');

// A year of synthetic work: five men (one paid weekly, one with a single day in March that has
// no daily rate, one switched off in May), three sites (one with a long name), Rima on one,
// יוסף גבס on another, advances, cash handed back, the approval.
function seedYear(today) {
    todayStr = () => today;
    const iso = '2026-02-01T09:00:00.000Z';
    State.schedule.workers = [
        { id: 'w_01', name: 'דוגמה אלף', active: true, dailyRate: 400, hourlyRate: 60 },
        { id: 'w_02', name: 'דוגמה בית', active: true, dailyRate: 300, hourlyRate: 50, payCycles: '2026-01-02=weekly' },
        { id: 'w_03', name: 'דוגמה גימל עם שם ארוך במיוחד לבדיקת שבירה', active: true, dailyRate: 380, hourlyRate: 0 },
        { id: 'w_04', name: 'דוגמה דלת', active: true, dailyRate: 450, hourlyRate: 0 },
        { id: 'w_05', name: 'דוגמה הא', active: true, dailyRate: 350, hourlyRate: 0 }];
    State.schedule.places = [
        { id: 'p_01', name: 'אתר צפון', active: true },
        { id: 'p_02', name: 'אתר דרום', active: true },
        { id: 'p_03', name: 'מגדל המרכז עם שם ארוך מאוד לבדיקת שבירה', active: true }];
    State.commitRoster();
    const day = new Date(2026, 0, 1, 12);
    for (let at = 0; toLocalDateStr(day) <= today; day.setDate(day.getDate() + 1), at += 1) {
        const date = toLocalDateStr(day);
        if (day.getDay() === 6) continue;
        if (at % 3 !== 0) assignPlace(State.schedule, date, 'w_01', 'actual', 'p_01', at % 17 === 0 ? 'double' : undefined);
        if (at % 2 === 0) assignPlace(State.schedule, date, 'w_02', 'actual', 'p_02', at % 11 === 0 ? 'extra' : undefined, at % 11 === 0 ? 2 : undefined);
        if (at % 4 === 1) assignPlace(State.schedule, date, 'w_03', 'actual', 'p_03');
        if (at % 5 === 2 && date !== '2026-03-10') assignPlace(State.schedule, date, 'w_04', 'actual', 'p_01');
        if (date < '2026-05-01' && at % 3 === 1) assignPlace(State.schedule, date, 'w_05', 'actual', 'p_02');
        if (at % 6 === 0) setRimaCount(State.schedule, date, 'p_01', 2);
        if (at % 9 === 0) setYosefGevesCount(State.schedule, date, 'p_03', 3);
    }
    // ONE DAY WITH NO DAILY RATE, stamped that way.
    State.schedule.workers[3].dailyRate = 0;
    State.schedule.workers[3].hourlyRate = 40;
    assignPlace(State.schedule, '2026-03-10', 'w_04', 'actual', 'p_01');
    State.schedule.workers[3].dailyRate = 450;
    State.schedule.workers[3].hourlyRate = 0;
    State.schedule.workers[4].active = false;
    State.save();
    State.commitRoster();
    State.commitMany(recordNewAdvance(State.schedule, 'w_01', '2026-03-04', 1500, '', '2026-03-04T08:00:00Z', 'd_test', 'cash'));
    State.commitMany(recordNewAdvance(State.schedule, 'w_02', '2026-07-08', 250.5, '', '2026-07-08T08:00:00Z', 'd_test', 'cash'));
    State.commit(recordCarryApproval(State.schedule, planCarryMigration(State.schedule), iso, 'd_test'));
    const advance = advancesFor(State.schedule, 'w_01', '2026-03-01', '2026-03-31')[0];
    State.commit(recordAdvanceRepaid(State.schedule, advance.id, 300, '2026-03-20', '', '2026-03-20T10:00:00.000Z', 'd_test', 'cash'));
    showView('reports');
}

// A season: 40 men (16 weekly), 6 sites, every day but Saturday from 1/1 to today, about 85%
// on a site, doubles, extra hours, second sites, Rima on two sites, יוסף גבס on one, an advance
// every two to four weeks a man; the approval is the record's own entry (its plan is the gate's
// cost and not the year's - the approval reads its id and nothing else). The day screen, not
// «דוחות»: what is timed is the year.
function seedSeason(today) {
    todayStr = () => today;
    // «תזכורת לסגירת חשבונות» reads «סגירת שבוע»'s list once the draws stop, and on a Thursday a
    // week ends: that reading is timed by its own suite (tests/closereminder.test.mjs) and is not
    // the year's, so it is put out of the way on this page, in memory.
    if (typeof closeReminderAfterRender === 'function') closeReminderAfterRender = () => {};
    let a = 20261119 >>> 0;
    const rand = () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const pick = list => list[Math.floor(rand() * list.length)];
    State.schedule.places = [1, 2, 3, 4, 5, 6].map(n => ({ id: `p_${n}`, name: `אתר ${n}`, active: true }));
    State.schedule.workers = [];
    const days = [];
    for (const day = new Date(2026, 0, 1, 12); toLocalDateStr(day) <= today; day.setDate(day.getDate() + 1)) {
        if (day.getDay() !== 6) days.push(toLocalDateStr(day));
    }
    for (let n = 1; n <= 40; n += 1) {
        const id = `w_${String(n).padStart(2, '0')}`;
        State.schedule.workers.push(Object.assign({ id, name: `עובד ${n}`, active: true,
            dailyRate: pick([380, 420, 450, 500, 550, 610]), hourlyRate: pick([0, 0, 45, 50]) },
        n <= 16 ? { payCycles: '2026-01-02=weekly' } : {}));
        const home = `p_${1 + (n % 6)}`;
        days.forEach(date => {
            if (rand() > 0.85) return;
            const r = rand();
            if (r < 0.03) assignPlace(State.schedule, date, id, 'actual', home, 'double');
            else if (r < 0.08) assignPlace(State.schedule, date, id, 'actual', home, 'extra', 1 + Math.floor(rand() * 3));
            else assignPlace(State.schedule, date, id, 'actual', home);
            if (rand() < 0.05) assignPlace(State.schedule, date, id, 'actual', `p_${1 + ((n + 3) % 6)}`);
        });
        for (let at = Math.floor(rand() * 20); at < days.length; at += 12 + Math.floor(rand() * 12)) {
            addAdvance(State.schedule, id, days[at], pick([200, 300, 500, 800, 1000, 1500]), '');
        }
    }
    days.forEach(date => {
        if (rand() < 0.4) setRimaCount(State.schedule, date, 'p_1', 1 + Math.floor(rand() * 4));
        if (rand() < 0.3) setRimaCount(State.schedule, date, 'p_3', 1 + Math.floor(rand() * 3));
        if (rand() < 0.3) setYosefGevesCount(State.schedule, date, 'p_2', 1 + Math.floor(rand() * 5));
    });
    recordCarryApproval(State.schedule, { id: carryMigrationId(), rows: [] }, '2026-01-01T09:00:00.000Z', 'd_test');
    State.save();
    State.commitRoster();
    State.date = today;
    showView('day');
}

async function phone(width, height, scheme, options = {}) {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, isMobile: true,
        hasTouch: true, colorScheme: scheme, serviceWorkers: 'block', timezoneId: 'Asia/Jerusalem', locale: 'he-IL' });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    if (options.large) await page.addInitScript(() => { try { localStorage.setItem('farkadDisplay:large', '1'); } catch (e) { /* refused */ } });
    // STILL: a dialog fades in over 220ms; a reading taken on the way is the colour of a moment.
    await page.addInitScript(() => {
        const still = () => {
            if (document.getElementById('ysum-still') || !document.head) return;
            const style = document.createElement('style');
            style.id = 'ysum-still';
            style.textContent = '*, *::before, *::after { transition: none !important; animation: none !important; scroll-behavior: auto !important; }';
            document.head.appendChild(style);
        };
        still();
        document.addEventListener('DOMContentLoaded', still);
    });
    // The season is timed, and under Playwright's fixed fake time the page's own clocks are not
    // a measure of anything (performance.now() came back shorter for the whole than for a part
    // of it): that page runs on the real clock, its «today» pinned by todayStr like every other.
    if (!options.realClock) await page.clock.setFixedTime(`${TODAY}T10:00:00`);
    await page.goto(server.url);
    await page.waitForFunction(() => typeof openYearSummary === 'function' && typeof State === 'object');
    await page.evaluate(options.season ? seedSeason : seedYear, TODAY);
    await page.waitForTimeout(250);
    return page;
}

// Without the service worker's census of open builds (tests/census.mjs says why).
const disk = page => page.evaluate(() => JSON.stringify(Object.keys(localStorage).sort()
    .filter(key => key !== 'farkad:openBuilds').map(key => [key, localStorage.getItem(key)])));
const isOpen = (page, id) => page.evaluate(id => document.getElementById(id).style.display === 'flex', id);
const active = page => page.evaluate(() => document.activeElement.id || document.activeElement.getAttribute('data-ysum-month')
    || document.activeElement.tagName);
const readYear = page => page.waitForFunction(() => document.querySelector('#yearSummaryBody .msum-tile, #yearSummaryBody .empty-hint') !== null
    && document.getElementById('yearSummaryBody').getAttribute('aria-busy') !== 'true');
// The month from «הפקת דוח», as a person opens it, then the year from its door.
const openMonth = async page => {
    if (!(await page.locator('#reportsView .report-output-actions').evaluate(node => node.open))) {
        await page.locator('#reportsView .report-output-actions > summary').click();
    }
    await page.locator('#monthSummaryOpen').click();
    await page.waitForTimeout(80);
};
const openYear = async page => {
    await openMonth(page);
    await page.locator('#monthSummaryYear').click();
    await readYear(page);
    await page.waitForTimeout(60);
};
const shot = async (page, name) => {
    if (!SHOTS) return;
    await page.screenshot({ path: join(SHOTS, `${name}.jpg`), type: 'jpeg', quality: 80 });
};

try {
    const page = await phone(440, 956, 'dark');
    tapsAtAPersonsPace(page);
    const before = await disk(page);
    await censusOnly(check, page, before);
    const record = await page.evaluate(() => JSON.stringify(State.schedule));
    given('the record on this phone may be read the new way, as the owner\'s may',
        await page.evaluate(() => carryReportingEnabled(State.schedule)) === true);

    // ------------------------------------------------------------ 12. the door
    suite('the door: in «סיכום חודש», worded for the month on screen');
    await openMonth(page);
    same('«סיכום חודש» on November carries «סיכום שנת 2026»', [await page.locator('#monthSummaryMonth').innerText(),
        await page.locator('#monthSummaryYear').innerText(), await page.locator('#monthSummaryYear').isVisible()],
    ['נובמבר 2026', 'סיכום שנת 2026', true]);
    for (let n = 0; n < 10; n += 1) await page.locator('#monthSummaryPrev').click();
    same('on January it still says 2026', [await page.locator('#monthSummaryMonth').innerText(),
        await page.locator('#monthSummaryYear').innerText()], ['ינואר 2026', 'סיכום שנת 2026']);
    await page.locator('#monthSummaryPrev').click();
    same('one step back is December of 2025, and the door says 2025 - on an empty month as well',
        [await page.locator('#monthSummaryMonth').innerText(), await page.locator('#monthSummaryYear').innerText(),
            await page.locator('#monthSummaryBody .empty-hint').count()], ['דצמבר 2025', 'סיכום שנת 2025', 1]);
    await page.locator('#monthSummaryNext').click();
    same('and forward again, 2026', await page.locator('#monthSummaryYear').innerText(), 'סיכום שנת 2026');
    for (let n = 0; n < 10; n += 1) await page.locator('#monthSummaryNext').click();
    const door = await page.evaluate(() => {
        const node = document.getElementById('monthSummaryYear');
        const box = node.getBoundingClientRect();
        const range = document.createRange();
        range.selectNodeContents(node);
        const words = [...range.getClientRects()];
        return { w: box.width, h: box.height, inside: words.every(r => r.left >= box.left - 1 && r.right <= box.right + 1
            && r.top >= box.top - 1 && r.bottom <= box.bottom + 1), size: parseFloat(getComputedStyle(node).fontSize) };
    });
    check('the door is 48px both ways and its words are inside it', door.w >= 48 && door.h >= 48 && door.inside && door.size >= 16,
        JSON.stringify(door));
    await shot(page, '01-month-door-440-dark');

    // A tap: the month shuts, the year opens at its heading, and «מחשב את השנה…» is painted in
    // a frame of its own before a single figure is read.
    await page.evaluate(() => {
        window.__frames = 0;
        window.__firstRead = null;
        const count = () => { window.__frames += 1; if (window.__frames < 600) requestAnimationFrame(count); };
        document.getElementById('monthSummaryYear').addEventListener('click', () => {
            window.__frames = 0; requestAnimationFrame(count);
        }, { capture: true, once: true });
        const real = yearSummaryFacts;
        window.__realYearFacts = real;
        yearSummaryFacts = function () {
            if (window.__firstRead === null) {
                const body = document.getElementById('yearSummaryBody');
                window.__firstRead = { frames: window.__frames, open: document.getElementById('yearSummaryModal').style.display,
                    month: document.getElementById('monthSummaryModal').style.display, reading: body.textContent,
                    tiles: body.querySelectorAll('.msum-tile').length, focus: document.activeElement.id };
            }
            return real.apply(this, arguments);
        };
    });
    await page.locator('#monthSummaryYear').tap();
    await readYear(page);
    const first = await page.evaluate(() => { yearSummaryFacts = window.__realYearFacts; return window.__firstRead; });
    same('the tap shut the month and opened the year', [first.month, first.open], ['none', 'flex']);
    check('«מחשב את השנה…» was on the glass, alone, and a frame went by before anything was read',
        first.frames >= 1 && first.reading.indexOf('מחשב את השנה…') !== -1 && first.tiles === 0, JSON.stringify(first));
    same('it is entered at its heading', [first.focus, await active(page)], ['yearSummaryTitle', 'yearSummaryTitle']);
    same('on the year of the month', [await page.locator('#yearSummaryTitle').innerText(), await page.locator('#yearSummaryYear').innerText(),
        await page.locator('#yearSummaryNext').isVisible()], ['סיכום שנת 2026', '2026', false]);
    same('the report\'s own range and filter were not touched', await page.evaluate(() => [REPORT_WORKERS,
        REPORT_RANGE.from === defaultPayrollRange().from]), [null, true]);
    await shot(page, '02-year-top-440-dark');

    // ------------------------------------------------------------ what it says, in order
    suite('the year on the glass, in its order');
    const facts = await page.evaluate(() => yearSummaryFacts(2026));
    const tiles = await page.evaluate(() => yearSummaryTiles(yearSummaryFacts(2026)).map(t => [t.label, t.text]));
    same('the tiles are the reading\'s, label over value', await page.locator('#yearSummaryBody .ysum-figures .msum-tiles .msum-tile')
        .evaluateAll(nodes => nodes.map(node => [node.children[0].textContent, node.children[1].textContent])), tiles);
    same('the order of the sections: the frame, the figures, the months, the men, the sites, and יוסף גבס last',
        await page.evaluate(() => [...document.getElementById('yearSummaryBody').children].map(node => node.className)),
        ['msum-range', 'ysum-frame', 'msum-block ysum-figures', 'msum-block ysum-months', 'msum-block ysum-men',
            'msum-block ysum-sites', 'msum-block ysum-yosefgeves']);
    same('twelve months, January first, each one button', await page.locator('#yearSummaryBody button.ysum-month')
        .evaluateAll(nodes => nodes.map(node => node.getAttribute('data-ysum-month'))),
    ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'].map(m => `2026-${m}`));
    same('the man with one day without a rate is named, and the year says why its rows do not add up',
        [plain(await page.locator('#yearSummaryBody .ysum-figures .msum-warn').first().innerText()),
            await page.locator('#yearSummaryBody .ysum-notsummed').innerText(), facts.notSummed],
        ['⚠️ 1 עובדים בלי שכר יומי, ולכן הסכום חסר אותם: דוגמה דלת. הוסף להם שכר במסך "עובדים ואתרים".',
            'עובד שיש לו אפילו יום עבודה אחד בלי שכר יומי לא נכלל בנצבר של כל השנה, ולכן הנצבר של השנה קטן מחיבור החודשים.', true]);
    same('the men in the roster\'s order, the one switched off said so', await page.locator('#yearSummaryBody .ysum-man')
        .evaluateAll(nodes => nodes.map(node => [node.querySelector('.ysum-man-name').textContent,
            (node.querySelector('.ysum-inactive') || { textContent: '' }).textContent])),
    [['דוגמה אלף', ''], ['דוגמה בית', ''], ['דוגמה גימל עם שם ארוך במיוחד לבדיקת שבירה', ''], ['דוגמה דלת', ''], ['דוגמה הא', 'לא פעיל']]);
    // Each bar in the one accent, and its number written beside it - never a site's colour.
    const bars = await page.evaluate(() => {
        const accent = getComputedStyle(document.querySelector('#yearSummaryBody .ysum-bar-fill')).backgroundColor;
        const probe = document.createElement('span');
        probe.style.color = 'var(--accent)';
        document.body.appendChild(probe);
        const want = getComputedStyle(probe).color;
        probe.remove();
        return { fills: [...document.querySelectorAll('#yearSummaryBody .ysum-bar-fill')].map(n => getComputedStyle(n).backgroundColor),
            accent, want, counts: document.querySelectorAll('#yearSummaryBody .ysum-bar-count').length };
    });
    check('every month\'s bar is the accent, one hue, with its number beside it', bars.fills.length > 6
        && bars.fills.every(fill => fill === bars.want) && bars.counts === bars.fills.length, JSON.stringify(bars).slice(0, 200));
    same('nothing on it can be typed into', await page.evaluate(() =>
        document.querySelectorAll('#yearSummaryModal input, #yearSummaryModal select, #yearSummaryModal textarea, #yearSummaryModal [contenteditable]').length), 0);
    check('and no word of a payslip: no «לתשלום», no deduction, no balance',
        !/לתשלום|נוכה מהשכר|יתרת|החשבון נסגר/.test(await page.locator('#yearSummaryModal').innerText()));
    for (const [name, top] of [['03-year-months-440-dark', 900], ['04-year-men-sites-440-dark', 2200], ['05-year-end-440-dark', 99999]]) {
        await page.evaluate(at => { document.querySelector('#yearSummaryModal .modal-content').scrollTop = at; }, top);
        await shot(page, name);
    }
    await page.evaluate(() => { document.querySelector('#yearSummaryModal .modal-content').scrollTop = 0; });

    // ------------------------------------------------------------ 15. keyboard, backdrop, focus
    suite('Escape, the backdrop, «סגור», Tab and the focus');
    await page.locator('#yearSummaryTitle').focus();
    const order = [];
    for (let n = 0; n < 16; n += 1) {
        await page.keyboard.press('Tab');
        order.push(await active(page));
    }
    same('while it is open midEdit() says so: an update waits for it (js/ui/offline.js)', await page.evaluate(() => midEdit()), true);
    same('Tab walks the arrow, the twelve months, the export and «סגור», and comes round inside the dialog (no next year on 2026)',
        order, ['yearSummaryPrev'].concat(['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'].map(m => `2026-${m}`),
            ['yearSummaryExport', 'yearSummaryClose', 'yearSummaryPrev']));
    await page.keyboard.press('Escape');
    check('Escape closes it', !(await isOpen(page, 'yearSummaryModal')));
    same('and it forgets which year it was', await page.evaluate(() => YEAR_SUMMARY_YEAR), null);
    await page.waitForTimeout(80);
    same('the focus is given back to what opened «סיכום חודש» - the reports\' menu', await page.evaluate(() =>
        [document.activeElement.tagName, document.activeElement.parentElement.className]), ['SUMMARY', 'report-output-actions']);
    await openYear(page);
    await page.mouse.click(4, 4);
    await page.waitForTimeout(60);
    check('a tap on the backdrop closes it', !(await isOpen(page, 'yearSummaryModal')));
    same('and shut, midEdit() lets an update through again', await page.evaluate(() => midEdit()), false);
    await openYear(page);
    await page.locator('#yearSummaryClose').click();
    await page.waitForTimeout(80);
    check('and so does «סגור», the focus given back', !(await isOpen(page, 'yearSummaryModal'))
        && await page.evaluate(() => document.activeElement.tagName === 'SUMMARY'));

    // ------------------------------------------------------------ 13. the arrows, a month's row
    suite('the arrows walk the years and keep the focus; a month\'s row opens that month');
    await openYear(page);
    await page.locator('#yearSummaryPrev').click();
    await readYear(page);
    same('one back is 2025, which has nothing: one sentence, the focus still on the arrow, the next one there',
        [await page.locator('#yearSummaryYear').innerText(), await page.locator('#yearSummaryBody .empty-hint').innerText(),
            await page.locator('#yearSummaryBody .msum-tile, #yearSummaryBody .ysum-month').count(), await active(page),
            await page.locator('#yearSummaryNext').isVisible(), await page.locator('#yearSummaryExport').isDisabled()],
        ['2025', 'אין רישומים בשנה הזאת.', 0, 'yearSummaryPrev', true, true]);
    await page.locator('#yearSummaryPrev').click();
    await readYear(page);
    await page.locator('#yearSummaryNext').click();
    await readYear(page);
    same('back to 2024 and forward to 2025: the focus stays on the arrow pressed', [await page.locator('#yearSummaryYear').innerText(),
        await active(page)], ['2025', 'yearSummaryNext']);
    await page.locator('#yearSummaryNext').click();
    await readYear(page);
    same('forward to 2026, where there is no next year: its focus goes to the other arrow, not to nowhere',
        [await page.locator('#yearSummaryYear').innerText(), await page.locator('#yearSummaryNext').isVisible(), await active(page),
            await page.locator('#yearSummaryBody .ysum-month').count()], ['2026', false, 'yearSummaryPrev', 12]);
    // Where he is when he leaves by March's row: the row in the middle of the glass.
    const marchTop = await page.evaluate(() => {
        document.querySelector('#yearSummaryBody .ysum-month[data-ysum-month="2026-03"]').scrollIntoView({ block: 'center' });
        return document.querySelector('#yearSummaryModal .modal-content').scrollTop;
    });
    given('March\'s row is below the first screen, so there is a place to come back to', marchTop > 200, String(marchTop));
    await page.locator('#yearSummaryBody .ysum-month[data-ysum-month="2026-03"]').click();
    await page.waitForTimeout(80);
    same('March\'s row: the year shuts and «סיכום חודש» opens on March, at its heading', [await isOpen(page, 'yearSummaryModal'),
        await isOpen(page, 'monthSummaryModal'), await page.locator('#monthSummaryMonth').innerText(), await active(page),
        await page.locator('#monthSummaryYear').innerText()], [false, true, 'מרץ 2026', 'monthSummaryTitle', 'סיכום שנת 2026']);
    const march = await page.evaluate(() => monthSummaryFacts('2026-03'));
    same('and what it says of March is what the year\'s row said', march.money.gross, facts.months[2].gross);
    // THE WAY BACK (fix round 1): the month's own door puts him where he left the year - the same
    // place in it, on the same month's row - and not at the top of twelve months again.
    await page.locator('#monthSummaryYear').click();
    await readYear(page);
    await page.waitForTimeout(60);
    same('the month\'s door brings him back to where he left the year, on the row he left by', [
        Math.abs(await page.evaluate(() => document.querySelector('#yearSummaryModal .modal-content').scrollTop) - marchTop) <= 1,
        await active(page)], [true, '2026-03']);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(80);
    await openYear(page);
    same('opened another way, the year is at its top again', [await page.evaluate(() =>
        document.querySelector('#yearSummaryModal .modal-content').scrollTop), await active(page)], [0, 'yearSummaryTitle']);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(80);

    // ------------------------------------------------------------ 14. the export
    suite('the export: the workbook handed to the browser, or the CSV files, in the export\'s own words');
    await openYear(page);
    await page.evaluate(() => loadXlsx());
    given('the library is the shipped one, from this origin', await page.evaluate(() => typeof XLSX === 'object' && XLSX.version === '0.18.5'));
    await page.evaluate(() => {
        window.__written = [];
        XLSX.writeFile = (wb, name) => {
            const bytes = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
            window.__written.push({ name, sheets: wb.SheetNames.slice(), rtl: Boolean(wb.Workbook && wb.Workbook.Views[0].RTL), size: bytes.byteLength || bytes.length });
        };
    });
    await page.locator('#yearSummaryExport').click();
    await page.waitForFunction(() => window.__written.length === 1 && document.getElementById('askModal').style.display === 'flex');
    same('farkad-year_2026.xlsx, its five sheets in order, right to left', await page.evaluate(() =>
        [window.__written[0].name, window.__written[0].sheets, window.__written[0].rtl]),
    ['farkad-year_2026.xlsx', ['סיכום', 'חודשים', 'עובדים', 'אתרים', 'עובדי יוסף גבס'], true]);
    same('handed to the browser in the export\'s own words, and never «נשמר»', [await page.locator('#askTitle').innerText(),
        plain(await page.locator('#askMessage').innerText()), await page.locator('#askChoices button').allTextContents()],
    ['קובץ ה-Excel נמסר לשמירה', 'farkad-year_2026.xlsx נמסר לדפדפן — פתח את "קבצים" וודא שהוא מופיע. ב-Excel הטבלה נפתחת מימין לשמאל; '
        + 'תצוגה מקדימה ("קבצים", וואטסאפ, Numbers) עשויה להציג אותה משמאל לימין, עם אותם מספרים.', ['הבנתי', 'שמירה חוזרת']]);
    check('and not one word of it points at a picture this dialog has not got',
        (await page.locator('#askModal').innerText()).indexOf('שיתוף כתמונה') === -1);
    await shot(page, '06-export-handed-440-dark');
    await page.evaluate(() => {
        window.__again = { year: 0, reports: 0 };
        const year = yearSummaryExport;
        const reports = exportReports;
        yearSummaryExport = function () { window.__again.year += 1; return year.apply(this, arguments); };
        exportReports = function () { window.__again.reports += 1; return reports.apply(this, arguments); };
    });
    await page.locator('#askChoices button', { hasText: 'שמירה חוזרת' }).click();
    await page.waitForFunction(() => window.__written.length === 2 && document.getElementById('askModal').style.display === 'flex');
    same('«שמירה חוזרת» is the year\'s export again - never the reports\' - and the same file', await page.evaluate(() =>
        [window.__again, window.__written[1].name]), [{ year: 1, reports: 0 }, 'farkad-year_2026.xlsx']);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    same('Escape shuts the question and exports nothing', [await isOpen(page, 'askModal'), await isOpen(page, 'yearSummaryModal'),
        await page.evaluate(() => window.__written.length)], [false, true, 2]);
    await page.locator('#yearSummaryExport').click();
    await page.waitForFunction(() => window.__written.length === 3 && document.getElementById('askModal').style.display === 'flex');
    await page.mouse.click(4, 4);
    await page.waitForTimeout(300);
    same('a tap beside the question shuts it and exports nothing either', [await isOpen(page, 'askModal'),
        await isOpen(page, 'yearSummaryModal'), await page.evaluate(() => window.__written.length)], [false, true, 3]);
    await page.locator('#yearSummaryExport').click();
    await page.waitForFunction(() => window.__written.length === 4 && document.getElementById('askModal').style.display === 'flex');
    // The spy counts every call of the year's export since «שמירה חוזרת»: that one, and the two
    // presses of the button above (the button calls the same global) - three; «הבנתי» adds none.
    const asked = await page.evaluate(() => Object.assign({}, window.__again));
    await page.locator('#askChoices button', { hasText: 'הבנתי' }).click();
    await page.waitForTimeout(60);
    same('«הבנתי» shuts the question, the year still open, the focus back on the export, and nothing more written',
        [await isOpen(page, 'askModal'), await isOpen(page, 'yearSummaryModal'), await active(page),
            await page.evaluate(() => [window.__written.length, window.__again]), asked],
        [false, true, 'yearSummaryExport', [4, { year: 3, reports: 0 }], { year: 3, reports: 0 }]);
    // The library missing: CSV files, through a recorder, and the export's own sentence for it.
    await page.evaluate(() => {
        window.__xlsx = XLSX;
        XLSX = undefined;
        window.__loadXlsx = loadXlsx;
        loadXlsx = () => Promise.resolve(false);
        window.__downloadCsv = downloadCsv;
        window.__csv = [];
        downloadCsv = (rows, name) => { window.__csv.push([name, rows[0][0]]); return true; };
    });
    await page.locator('#yearSummaryExport').click();
    await page.waitForFunction(() => window.__csv.length > 0 && document.getElementById('askModal').style.display === 'flex');
    same('one CSV a sheet, named in Latin, each beginning as its sheet does', await page.evaluate(() => window.__csv), [
        ['farkad-year-summary_2026.csv', 'סיכום שנת 2026'], ['farkad-year-months_2026.csv', 'חודש'],
        ['farkad-year-workers_2026.csv', 'עובד'], ['farkad-year-sites_2026.csv', 'אתר'], ['farkad-year-yosef-geves_2026.csv', 'אתר']]);
    same('and the sentence the export says in that case', await page.locator('#askMessage').innerText(),
        'חלק מהאפליקציה חסר במכשיר, ולכן הקבצים יוצאו כ-CSV במקום Excel. המספרים זהים. רענן את הדף כדי להשלים את ההתקנה.');
    await page.keyboard.press('Escape');
    await page.evaluate(() => { XLSX = window.__xlsx; loadXlsx = window.__loadXlsx; downloadCsv = window.__downloadCsv; });
    await page.waitForTimeout(60);
    // A FIRST EXPORT PRESSED TWICE (fix round 1): the library 600 ms on its way, and a second
    // press 150 ms after the first - a finger on the button, and the button's own function - is
    // nothing: ONE file, the button shut and the frame's line saying so meanwhile.
    await page.evaluate(() => {
        window.__written = [];
        window.__realLoad = loadXlsx;
        loadXlsx = () => new Promise(done => setTimeout(() => done(window.__realLoad()), 600));
    });
    const exportAt = await page.locator('#yearSummaryExport').boundingBox();
    await page.locator('#yearSummaryExport').click();
    await page.waitForTimeout(150);
    const during = await page.evaluate(() => ({ shut: document.getElementById('yearSummaryExport').disabled,
        line: document.getElementById('yearSummaryStatus').textContent }));
    await page.mouse.click(exportAt.x + exportAt.width / 2, exportAt.y + exportAt.height / 2);
    await page.evaluate(() => { yearSummaryExport(); });
    await page.waitForFunction(() => document.getElementById('askModal').style.display === 'flex', null, { timeout: 10000 });
    await page.waitForTimeout(400);
    same('pressed twice while the library is on its way: «מכין את הקובץ…» and the button shut meanwhile, and ONE file',
        [during, await page.evaluate(() => window.__written.map(one => one.name))],
        [{ shut: true, line: 'מכין את הקובץ…' }, ['farkad-year_2026.xlsx']]);
    await page.keyboard.press('Escape');
    await page.evaluate(() => { loadXlsx = window.__realLoad; });
    await page.waitForTimeout(80);
    same('and once it is handed over, the button is the year\'s again and the line is gone', await page.evaluate(() =>
        [document.getElementById('yearSummaryExport').disabled, document.getElementById('yearSummaryStatus').textContent]), [false, '']);
    await page.locator('#yearSummaryClose').click();
    await page.waitForTimeout(80);

    // ------------------------------------------------------------ 18. it wrote nothing
    suite('a reading: the disk is byte for byte what it was');
    same('every key, across the door, the arrows, a month\'s row, the export and every way out', await disk(page), before);
    same('and the record in memory', await page.evaluate(() => JSON.stringify(State.schedule)), record);

    // ------------------------------------------------------------ 16. a change under it
    suite('a change under it: nothing read inside render(), the figures gone at once, ONE reading after the draws stop');
    await openYear(page);
    const content = '#yearSummaryModal .modal-content';
    const attendance = () => page.locator('#yearSummaryBody .msum-tile[data-figure="attendance"] .msum-value').innerText();
    const was = Number(await attendance());
    await page.evaluate(sel => { document.querySelector(sel).scrollTop = 600; }, content);
    await page.evaluate(() => {
        window.__reads = { read: 0, range: 0, inRender: 0 };
        const read = yearSummaryRead;
        const range = monthSummaryReadRange;
        const draw = render;
        let drawing = false;
        yearSummaryRead = function () { window.__reads.read += 1; if (drawing) window.__reads.inRender += 1; return read.apply(this, arguments); };
        monthSummaryReadRange = function () { window.__reads.range += 1; if (drawing) window.__reads.inRender += 1; return range.apply(this, arguments); };
        render = function () { drawing = true; try { return draw.apply(this, arguments); } finally { drawing = false; } };
    });
    // A record that did not move first: render() twice draws nothing new - no mark, no line, the
    // figures where they are (fix round 1: no check of the glass held this).
    await page.evaluate(() => { render(); render(); });
    same('render() over a record that did not move: the figures stay, unmarked, and nothing is read', await page.evaluate(() => ({
        tiles: document.querySelectorAll('#yearSummaryBody .msum-tile').length > 0,
        stale: document.getElementById('yearSummaryBody').classList.contains('ysum-stale'),
        reading: document.querySelectorAll('#yearSummaryBody .ysum-reading').length,
        status: document.getElementById('yearSummaryStatus').textContent, reads: Object.assign({}, window.__reads) })),
    { tiles: true, stale: false, reading: 0, status: '', reads: { read: 0, range: 0, inRender: 0 } });
    // THE READER'S PLACE, sampled every 40 ms from the first commit until the year is read again:
    // the figures used to be taken off at once, the dialog shrank to one screen, and he was put
    // at its top for a second and a half (fix round 1).
    await page.evaluate(sel => {
        window.__place = [];
        const c = document.querySelector(sel);
        const tick = () => {
            window.__place.push({ top: Math.round(c.scrollTop),
                tiles: document.querySelectorAll('#yearSummaryBody .msum-tile').length,
                stale: document.getElementById('yearSummaryBody').classList.contains('ysum-stale') });
            if (window.__place.length < 200) window.__placeTimer = setTimeout(tick, 40);
        };
        tick();
    }, content);
    // Three commits 500 ms apart, each a Saturday nobody worked.
    const placeholder = () => page.evaluate(() => ({ tiles: document.querySelectorAll('#yearSummaryBody .msum-tile').length,
        stale: document.getElementById('yearSummaryBody').classList.contains('ysum-stale'),
        busy: document.getElementById('yearSummaryBody').getAttribute('aria-busy'),
        status: document.getElementById('yearSummaryStatus').textContent,
        exportShut: document.getElementById('yearSummaryExport').disabled,
        reading: document.querySelectorAll('#yearSummaryBody .ysum-reading').length,
        reads: Object.assign({}, window.__reads) }));
    const seen = [];
    for (const [at, date] of [[0, '2026-11-14'], [1, '2026-11-07'], [2, '2026-10-31']]) {
        if (at > 0) await page.waitForTimeout(500);
        await page.evaluate(date => State.commit(assignPlace(State.schedule, date, 'w_03', 'actual', 'p_02')), date);
        seen.push(await placeholder());
    }
    const afterLast = Date.now();
    same('each commit\'s render() read nothing, and from the first the figures stayed where they were, marked as being read again',
        seen.map(one => [one.tiles > 0, one.stale, one.busy, one.status, one.exportShut, one.reading, one.reads]),
        seen.map(() => [true, true, 'true', 'מחשב את השנה…', true, 0, { read: 0, range: 0, inRender: 0 }]));
    await page.waitForTimeout(1000);
    const midway = await placeholder();
    same('a second after the last commit: still nothing read, still marked', [midway.tiles > 0, midway.stale, midway.reads.read], [true, true, 0]);
    await page.waitForFunction(() => document.querySelector('#yearSummaryBody .msum-tile') !== null
        && !document.getElementById('yearSummaryBody').classList.contains('ysum-stale'), null, { timeout: 10000 });
    const after = await page.evaluate(() => Object.assign({}, window.__reads));
    const waited = Date.now() - afterLast;
    same('then ONE reading, none of it inside render()', [after.read, after.inRender], [1, 0]);
    check('and it came only once the draws had stopped for 1.5 s', waited >= 1400, `${waited} ms after the last commit`);
    same('the three days are on it, the reader is where he was, and the year is current again', [Number(await attendance()),
        await page.evaluate(sel => document.querySelector(sel).scrollTop, content), await placeholder().then(one =>
            [one.stale, one.busy, one.status, one.exportShut])], [was + 3, 600, [false, 'false', '', false]]);
    const place = await page.evaluate(() => { clearTimeout(window.__placeTimer); return window.__place; });
    check('and at no moment of the wait was he anywhere but where he was, nor the figures off the glass',
        place.length > 40 && place.every(one => one.top === 600 && one.tiles > 0),
        JSON.stringify(place.filter(one => one.top !== 600 || one.tiles === 0).slice(0, 4)));

    // A snapshot adopted from another phone: the same rule.
    await page.evaluate(() => { window.__reads = { read: 0, range: 0, inRender: 0 }; });
    await page.evaluate(() => {
        const raw = JSON.parse(JSON.stringify(State.schedule));
        raw.updatedAt = new Date(Date.now() + 1000).toISOString();
        raw.updatedBy = 'other-device';
        assignPlace(raw, '2026-10-24', 'w_03', 'actual', 'p_02');
        FarkadSync.receive(raw);
    });
    const adopted = await placeholder();
    same('a snapshot adopted under it: the figures stay, marked at once, nothing read inside the draw', [adopted.tiles > 0, adopted.stale,
        adopted.status, adopted.reads], [true, true, 'מחשב את השנה…', { read: 0, range: 0, inRender: 0 }]);
    await page.waitForFunction(() => document.querySelector('#yearSummaryBody .msum-tile') !== null
        && !document.getElementById('yearSummaryBody').classList.contains('ysum-stale'), null, { timeout: 10000 });
    same('then ONE reading with the other phone\'s day on it, the place kept', [await page.evaluate(() => window.__reads.read),
        await page.evaluate(() => window.__reads.inRender), Number(await attendance()),
        await page.evaluate(sel => document.querySelector(sel).scrollTop, content)], [1, 0, was + 4, 600]);
    await page.context().close();

    // ------------------------------------------------------------ 17. the phones
    for (const [width, height] of [[320, 568], [375, 667], [440, 956]]) {
        for (const scheme of ['dark', 'light']) {
            for (const large of [false, true]) {
                const tag = `${width}x${height} ${scheme}${large ? ', «תצוגה גדולה»' : ''}`;
                suite(`the glass - ${tag}`);
                const glass = await phone(width, height, scheme, { large });
                given(`${tag}: the mode is ${large ? 'on' : 'off'}`, await glass.evaluate(() =>
                    document.documentElement.classList.contains('display-large')) === large);
                await openMonth(glass);
                const doorBox = await glass.locator('#monthSummaryYear').boundingBox();
                const floor = large ? 51.5 : 47.5;
                check(`${tag}: the door ${large ? 52 : 48}px both ways`, doorBox.width >= floor && doorBox.height >= floor, JSON.stringify(doorBox));
                // ON THE MONTH'S FIRST SCREEN (fix round 1): it stood after the whole month, 2 to 5.5
                // screens down, and nobody told the year was in «סיכום חודש» found it.
                same(`${tag}: the door is on «סיכום חודש»'s first screen, as it opens`, await glass.evaluate(() => {
                    const content = document.querySelector('#monthSummaryModal .modal-content');
                    const c = content.getBoundingClientRect();
                    const r = document.getElementById('monthSummaryYear').getBoundingClientRect();
                    return { scrollTop: content.scrollTop, on: r.top >= Math.max(c.top, 0) - 1 && r.bottom <= Math.min(c.bottom, innerHeight) + 1 };
                }), { scrollTop: 0, on: true });
                await glass.locator('#monthSummaryYear').click();
                await readYear(glass);
                // THE FOOT UNDER THE THUMB (fix round 1): the export and «סגור» were the last row of the
                // longest dialog of the app, 9 to 16 screens down, with a 12px strip of backdrop the
                // only other way out.
                const footAt = async () => glass.evaluate(() => {
                    const c = document.querySelector('#yearSummaryModal .modal-content').getBoundingClientRect();
                    return ['yearSummaryExport', 'yearSummaryClose'].map(id => {
                        const r = document.getElementById(id).getBoundingClientRect();
                        return r.height > 0 && r.top >= Math.max(c.top, 0) - 1 && r.bottom <= Math.min(c.bottom, innerHeight) + 1;
                    });
                });
                const footTop = await footAt();
                const screens = await glass.evaluate(() => {
                    const content = document.querySelector('#yearSummaryModal .modal-content');
                    content.scrollTop = Math.round(content.scrollHeight / 2);
                    return Math.round(content.scrollHeight / content.clientHeight * 10) / 10;
                });
                await glass.waitForTimeout(40);
                const footMiddle = await footAt();
                await glass.evaluate(() => { const content = document.querySelector('#yearSummaryModal .modal-content'); content.scrollTop = content.scrollHeight; });
                await glass.waitForTimeout(40);
                const footEnd = await footAt();
                await glass.evaluate(() => { document.querySelector('#yearSummaryModal .modal-content').scrollTop = 0; });
                await glass.waitForTimeout(40);
                same(`${tag}: «יצוא השנה» and «סגור» on the glass at the first screen, the middle and the last (${screens} screens)`,
                    [footTop, footMiddle, footEnd], [[true, true], [true, true], [true, true]]);
                const names = await glass.evaluate(() => [...document.querySelectorAll('#yearSummaryBody .ysum-man')].map(row => {
                    const name = getComputedStyle(row.querySelector('.ysum-man-name'));
                    const values = [...row.querySelectorAll('.ysum-pair-value')].map(node => getComputedStyle(node));
                    return { name: row.querySelector('.ysum-man-name').textContent.slice(0, 12), weight: Number(name.fontWeight),
                        size: parseFloat(name.fontSize), values: Math.max(...values.map(v => Number(v.fontWeight))),
                        valueSize: Math.max(...values.map(v => parseFloat(v.fontSize))) };
                }));
                check(`${tag}: a man's name is the heaviest thing on his row, and as large as his largest figure`, names.length === 5
                    && names.every(one => one.weight > one.values && one.size >= one.valueSize), JSON.stringify(names[0]));
                const read = await glass.evaluate(measureInPage, ['#yearSummaryModal']);
                const live = read.texts.filter(t => !t.off);
                const small = live.filter(t => t.size < (large ? 18 : 16));
                check(`${tag}: no text under ${large ? 18 : 16}px`, small.length === 0, brief(small, t => `${t.size}px «${t.words}» ${t.where}`));
                const weak = live.filter(t => t.contrast !== null && t.contrast < (large ? 7 : 4.5));
                check(`${tag}: every text at ${large ? '7' : '4.5'}:1`, weak.length === 0, brief(weak, t => `${t.contrast} ${t.ink}/${t.ground} «${t.words}» ${t.where}`));
                if (large) {
                    const thin = live.filter(t => t.weight < 500);
                    check(`${tag}: nothing lighter than 500`, thin.length === 0, brief(thin, t => `${t.weight} «${t.words}» ${t.where}`));
                    const tight = live.filter(t => t.lines > 1 && t.lineHeight !== null && t.lineHeight < 1.4);
                    check(`${tag}: no wrapped text tighter than 1.4`, tight.length === 0, brief(tight, t => `${t.lineHeight} «${t.words}» ${t.where}`));
                }
                const fingers = read.targets.filter(t => t.w < floor || t.h < floor);
                check(`${tag}: every target ${large ? 52 : 48}px both ways`, fingers.length === 0, brief(fingers, t => `${t.w}x${t.h} «${t.words}» ${t.where}`));
                check(`${tag}: no two controls lie over each other, no words past their control`,
                    read.overlaps.length === 0 && read.spills.length === 0, brief(read.overlaps.concat(read.spills), o => `${o.by} «${o.words}» ${o.where}`));
                check(`${tag}: nothing cut, nothing off the side, nothing out of reach`,
                    read.cut.length === 0 && read.offside.length === 0 && read.unreachable.length === 0,
                    brief(read.cut.concat(read.offside, read.unreachable), o => JSON.stringify(o)));
                const box = await glass.evaluate(() => {
                    const content = document.querySelector('#yearSummaryModal .modal-content');
                    const title = document.getElementById('yearSummaryTitle').getBoundingClientRect();
                    const c = content.getBoundingClientRect();
                    return { page: document.documentElement.scrollWidth <= innerWidth + 1, sideways: content.scrollWidth <= content.clientWidth + 1,
                        inside: c.left >= 0 && c.right <= innerWidth + 1, title: title.top >= Math.max(c.top, 0) - 1 && title.bottom <= innerHeight + 1 };
                });
                check(`${tag}: neither the page nor the dialog scrolls sideways, and it opens at its title`,
                    box.page && box.sideways && box.inside && box.title, JSON.stringify(box));
                const reach = await glass.evaluate(() => {
                    const close = document.getElementById('yearSummaryClose');
                    close.scrollIntoView({ block: 'end' });
                    const at = close.getBoundingClientRect();
                    return at.bottom <= innerHeight + 1 && at.top >= 0;
                });
                check(`${tag}: «סגור» can be scrolled to and is then on the glass`, reach);
                if (width === 440 && scheme === 'dark' && !large) {
                    await glass.evaluate(() => { document.querySelector('#yearSummaryModal .modal-content').scrollTop = 0; });
                    await shot(glass, '07-year-440-dark');
                }
                if (width === 320 && large) {
                    await glass.evaluate(() => { document.querySelector('#yearSummaryModal .modal-content').scrollTop = 0; });
                    await shot(glass, `08-year-320-${scheme}-large-top`);
                    await glass.evaluate(() => { document.querySelector('#yearSummaryModal .modal-content').scrollTop = 1400; });
                    await shot(glass, `09-year-320-${scheme}-large-months`);
                }
                await glass.context().close();
            }
        }
    }

    // ------------------------------------------------------------ doubled text
    for (const [width, height] of [[375, 667], [320, 568]]) {
        const tag = `${width}x${height} at doubled text`;
        suite(`the glass - ${tag}`);
        const glass = await phone(width, height, 'dark');
        await openYear(glass);
        // Per node: the dialog does not redraw under the test, so doubling each node's own
        // computed size is the phone's large text on this screen.
        await glass.evaluate(() => {
            const sizes = [...document.querySelectorAll('#yearSummaryModal *')].map(node => [node, parseFloat(getComputedStyle(node).fontSize)]);
            sizes.forEach(([node, size]) => node.style.setProperty('font-size', `${size * 2}px`, 'important'));
        });
        await glass.waitForTimeout(60);
        const read = await glass.evaluate(measureInPage, ['#yearSummaryModal']);
        const box = await glass.evaluate(() => {
            const content = document.querySelector('#yearSummaryModal .modal-content');
            return { page: document.documentElement.scrollWidth <= innerWidth + 1, sideways: content.scrollWidth <= content.clientWidth + 1 };
        });
        check(`${tag}: no sideways scroll`, box.page && box.sideways && read.offside.length === 0, JSON.stringify([box, read.offside.slice(0, 3)]));
        check(`${tag}: nothing cut and no words past their control`, read.cut.length === 0 && read.spills.length === 0,
            brief(read.cut.concat(read.spills), o => JSON.stringify(o)));
        const reach = await glass.evaluate(() => {
            const close = document.getElementById('yearSummaryClose');
            close.scrollIntoView({ block: 'end' });
            const at = close.getBoundingClientRect();
            return at.bottom <= innerHeight + 1 && at.top >= 0;
        });
        check(`${tag}: the last button can still be reached`, reach);
        if (width === 375) {
            await glass.evaluate(() => { document.querySelector('#yearSummaryModal .modal-content').scrollTop = 0; });
            await shot(glass, '10-year-375-dark-doubled-text');
        }
        await glass.context().close();
    }

    // ------------------------------------------------------------ a figure is never broken inside its digits
    // THE SEASON AT DOUBLED TEXT (fix round 1): forty men over the year - a seven-figure «נצבר» -
    // with every size of the dialog doubled, on three phones, with and without «תצוגה גדולה». A run
    // of digits may go onto a line of its own, never be cut in two, where it fits a line of its
    // own - «4788515 ₪» was drawn «4788» over «515». One that is wider than the whole line its box
    // gives it (a seven-figure «נצבר» at 60px on the 320px phone) can only be broken or leave the
    // glass, and is broken: such runs are named in the detail and counted, never passed as fitting.
    for (const [width, height] of [[320, 568], [375, 667], [440, 956]]) {
        for (const large of [false, true]) {
            const tag = `${width}x${height}, a season at doubled text${large ? ', «תצוגה גדולה»' : ''}`;
            suite(`the figures whole - ${tag}`);
            const glass = await phone(width, height, 'dark', { season: true, large });
            await glass.evaluate(() => openYearSummary(2026));
            await readYear(glass);
            await glass.evaluate(() => {
                const sizes = [...document.querySelectorAll('#yearSummaryModal *')].map(node => [node, parseFloat(getComputedStyle(node).fontSize)]);
                sizes.forEach(([node, size]) => node.style.setProperty('font-size', `${size * 2}px`, 'important'));
            });
            await glass.waitForTimeout(80);
            const runs = await glass.evaluate(() => {
                const out = { measured: 0, broken: [], tooWide: [] };
                document.querySelectorAll('#yearSummaryBody .msum-value, #yearSummaryBody .ysum-pair-value, #yearSummaryBody .ysum-bar-count, #yearSummaryBody .msum-count')
                    .forEach(node => {
                        const text = node.firstChild;
                        if (!text || text.nodeType !== 3) return;
                        const digits = /\d{2,}/g;
                        for (let m = digits.exec(text.nodeValue); m; m = digits.exec(text.nodeValue)) {
                            const range = document.createRange();
                            range.setStart(text, m.index);
                            range.setEnd(text, m.index + m[0].length);
                            const lines = new Set([...range.getClientRects()].filter(r => r.width > 0.5).map(r => Math.round(r.top)));
                            out.measured += 1;
                            if (lines.size <= 1) continue;
                            // Its own width unbroken, in its own type, against the line its box gives it.
                            const probe = document.createElement('span');
                            probe.textContent = m[0];
                            probe.style.cssText = 'position: absolute; visibility: hidden; white-space: nowrap;';
                            node.appendChild(probe);
                            const natural = probe.getBoundingClientRect().width;
                            probe.remove();
                            // THE ROOM IS THE DIALOG'S, not the box the figure happens to be in: the
                            // widest line its place could have - the body's width less every padding
                            // and border between the two. Two tiles to a row where one would hold the
                            // figure is the fault itself (fix round 1: «4788» over «515» at 440).
                            const flat = at => { const cs = getComputedStyle(at); return parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight)
                                + parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth); };
                            const body = document.getElementById('yearSummaryBody');
                            let room = body.clientWidth - parseFloat(getComputedStyle(body).paddingLeft) - parseFloat(getComputedStyle(body).paddingRight);
                            for (let at = node; at && at !== body; at = at.parentElement) room -= flat(at);
                            const one = { figure: node.textContent, lines: lines.size, natural: Math.round(natural), room: Math.round(room) };
                            (natural <= room + 1 ? out.broken : out.tooWide).push(one);
                        }
                    });
                return out;
            });
            given(`${tag}: the season's figures were measured`, runs.measured > 100, String(runs.measured));
            check(`${tag}: no figure is broken inside its digits where it fits a line of its own`
                + (runs.tooWide.length ? ` (wider than any line here, and so broken: ${runs.tooWide.map(one => `${one.figure} ${one.natural}/${one.room}px`).join(', ')})` : ''),
            runs.broken.length === 0, JSON.stringify(runs.broken.slice(0, 4)));
            const box = await glass.evaluate(() => {
                const content = document.querySelector('#yearSummaryModal .modal-content');
                return { page: document.documentElement.scrollWidth <= innerWidth + 1, sideways: content.scrollWidth <= content.clientWidth + 1 };
            });
            check(`${tag}: and nothing scrolls sideways for it`, box.page && box.sideways, JSON.stringify(box));
            if (width === 440 && !large) {
                await glass.evaluate(() => { document.querySelector('#yearSummaryModal .modal-content').scrollTop = 0; });
                await shot(glass, '11-year-440-season-doubled-text');
            }
            await glass.context().close();
        }
    }

    // ------------------------------------------------------------ 18. the budget
    {
        suite('the budget: a season read at 4x CPU, the frame first, and the workbook handed over');
        const season = await phone(440, 956, 'dark', { season: true, realClock: true });
        given('a season: 40 men over the year', await season.evaluate(() => State.schedule.workers.length === 40
            && Object.keys(State.schedule.days).length > 250), await season.evaluate(() => Object.keys(State.schedule.days).length));
        const cdp = await season.context().newCDPSession(season);
        await season.evaluate(() => openMonthSummary());
        await season.waitForTimeout(200);
        await season.evaluate(() => {
            window.__frames = 0;
            window.__firstRead = null;
            const count = () => { window.__frames += 1; if (window.__frames < 600) requestAnimationFrame(count); };
            document.getElementById('monthSummaryYear').addEventListener('click', () => {
                window.__tapped = performance.now(); window.__frames = 0; requestAnimationFrame(count);
            }, { capture: true, once: true });
            const real = yearSummaryFacts;
            window.__depth = 0;
            yearSummaryFacts = function () {
                if (window.__firstRead === null) {
                    const body = document.getElementById('yearSummaryBody');
                    window.__firstRead = { frames: window.__frames, reading: body.textContent.indexOf('מחשב את השנה…') !== -1,
                        tiles: body.querySelectorAll('.msum-tile').length };
                }
                // The reading's own time: the outermost call (reportReadOnce calls back in once).
                const outer = window.__depth === 0;
                window.__depth += 1;
                const began = performance.now();
                try { return real.apply(this, arguments); } finally {
                    window.__depth -= 1;
                    if (outer) window.__readMs = performance.now() - began;
                }
            };
        });
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
        const pressed = Date.now();
        await season.locator('#monthSummaryYear').click();
        await season.waitForFunction(() => document.querySelector('#yearSummaryBody .msum-tile') !== null, null, { timeout: 30000 });
        const outside = Date.now() - pressed;
        const took = await season.evaluate(() => ({ ms: performance.now() - window.__tapped, first: window.__firstRead,
            read: window.__readMs, men: document.querySelectorAll('#yearSummaryBody .ysum-man').length }));
        given('the page\'s clock is a clock: the whole is not shorter than its part', took.ms >= took.read,
            `${took.ms.toFixed(0)} < ${took.read.toFixed(0)}`);
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
        console.log(`  the season's year on the glass ${took.ms.toFixed(0)} ms after the tap, at 4x CPU (the reading itself`
            + ` ${took.read.toFixed(0)} ms; ${outside} ms seen from outside the page; ${took.men} men drawn; budget 3000)`);
        given('the year that was timed is the season\'s: forty men drawn', took.men === 40, String(took.men));
        check('the frame painted «מחשב את השנה…» and nothing was read before it', took.first && took.first.frames >= 1
            && took.first.reading && took.first.tiles === 0, JSON.stringify(took.first));
        check('a season\'s year on the glass within 3 s of the tap, at 4x CPU', took.ms <= 3000 && outside <= 3000,
            `${took.ms.toFixed(0)} ms, ${outside} ms from outside`);

        await season.evaluate(() => loadXlsx());
        await season.evaluate(() => {
            window.__written = [];
            XLSX.writeFile = (wb, name) => {
                const bytes = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
                window.__written.push({ name, at: performance.now(), size: bytes.byteLength || bytes.length });
            };
            document.getElementById('yearSummaryExport').addEventListener('click', () => { window.__pressed = performance.now(); },
                { capture: true, once: true });
        });
        await season.locator('#yearSummaryExport').click();
        await season.waitForFunction(() => window.__written.length === 1, null, { timeout: 30000 });
        const built = await season.evaluate(() => ({ ms: window.__written[0].at - window.__pressed, size: window.__written[0].size,
            name: window.__written[0].name }));
        console.log(`  the season's workbook built and handed over in ${built.ms.toFixed(0)} ms (${built.size} bytes; budget 1500)`);
        check('the season\'s workbook built and handed over within 1.5 s', built.ms <= 1500 && built.name === 'farkad-year_2026.xlsx',
            JSON.stringify(built));
        await season.context().close();
    }

    suite('the browser');
    check('no uncaught browser errors', errors.length === 0, JSON.stringify(errors));
} finally {
    await browser.close();
    await server.close();
}

report();
