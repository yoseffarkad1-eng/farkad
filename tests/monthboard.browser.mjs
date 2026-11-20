// «לוח חודשי» - the crew's month on one board - in a real Chromium, emulated touch.
//
//   node tests/monthboard.browser.mjs
//
// What tests/monthboard.test.mjs cannot see, because it is about pixels, paper and time:
//
//   1. THE DOOR in the week grid's corner, at 320x568, 375x667 and 440x956, dark and light,
//      «תצוגה גדולה» off and on: 44px both ways (52 with the mode), its words whole inside
//      it, and the grid's header row no taller than with the door taken away.
//   2. THE GRID IS THE GRID PLUS ONE NODE: with the door, #weekView is the same document as
//      without it but the door; and the week's picture reads the same.
//   3. THE BOARD: opened by a tap on the month of the week on screen, at its title, today's
//      column on the glass, the names pinned while the grid scrolls in its own box, no
//      sideways page; the arrows, «החודש», the filter and «חזרה לטבלת השבוע» doing what they
//      say; the tab left and come back to on its grid.
//   4. THE WAYS OUT: a cell and a date open their day; a name opens his card at its title,
//      Escape shuts it and the focus is back on his name.
//   5. THE FLOORS, measured by the ruler of tests/screens.mjs on the board and the one-site
//      board at every phone, scheme and mode, and at doubled text: every target - the cells,
//      the dates, the names, the list - 44px both ways (52), no letter under 14px (18), every
//      text 4.5:1 (7:1) on the ground really painted under it, the list 16px (20), no page
//      scrolled sideways.
//   6. PAPER: a real PDF (tests/pdf.mjs) - A4 landscape, every name, the title with and
//      without a site, a Saturday column only where something is recorded, every weekday;
//      the site's own men («בלי עובדי רימא», screen only since v167) not on it; the door not
//      on the week's paper.
//   7. THE PICTURE: printoutImage('month') within 4,096px a side, every name and every
//      block's letters written at the place its layout claims, and sampled there off the PNG.
//   8. THE BUDGETS: the board drawn on a 40-man month in 250ms (1,000 at 4x CPU), its picture
//      in 2,000ms at 4x.
//   9. NOTHING WRITTEN: every key on the disk byte for byte across opening, the arrows, the
//      filter, print (window.print stood in for) and the picture (the share sheet stood in
//      for); no uncaught error.
//
// MONTHBOARD_SHOTS=<dir> also writes the pictures (440x956 dark, 320x568 with the mode, the
// PDF and the PNG). Chromium with emulated touch. NOT a real phone, and the paper was not
// printed on a printer.
import { chromium } from 'playwright';
import { join } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { serve } from './serve.mjs';
import { launchLocalBrowser } from './network-guard.mjs';
import { verifyServedAssets, expectedShaFor } from './treecheck.mjs';
import { suite, check, same, given, report } from './runner.mjs';
import { censusOnly } from './census.mjs';
import { readPdf, pageText } from './pdf.mjs';
import { PHONES, SCHEMES, TODAY, openApp, measureInPage } from './screens.mjs';
import { tapsAtAPersonsPace } from './pace.mjs';

const root = new URL('..', import.meta.url).pathname;
const server = await serve(root);
const served = await verifyServedAssets(server.url, root, expectedShaFor(root));
check('the browser is served the named tree', served.ok, `${served.checked} assets; ${(served.wrong || []).slice(0, 3).join(' | ')}`);
const browser = await launchLocalBrowser(chromium, { executablePath: process.env.CHROME_PATH });
const SHOTS = process.env.MONTHBOARD_SHOTS || '';
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const errors = [];

const DOOR = 'לוח חודשי';
const brief = (rows, say) => rows.slice(0, 4).map(say).join(' | ') + (rows.length > 4 ? ` … +${rows.length - 4}` : '');
const plain = text => String(text).replace(/[‎⁦-⁩]/g, '');
// A PDF carries Hebrew in the order it is drawn: a run read right to left comes out reversed.
const reversed = text => [...text].reverse().join('');
const onPaper = (text, words) => text.includes(words) || text.includes(reversed(words));

async function phone(width, height, scheme, large = false, seeded = true) {
    const opened = await openApp(browser, server.url, { width, height, scheme, large, seeded });
    opened.page.on('pageerror', error => errors.push(`${width}x${height} ${scheme}: ${error.message}`));
    tapsAtAPersonsPace(opened.page);
    return opened;
}

// The week's grid on the week of today, read: the corner's door and the header row.
const gridDoor = page => page.evaluate(async () => {
    const wait = ms => new Promise(done => setTimeout(done, ms));
    State.date = todayStr(); showView('week'); setWeekPhoneMode('grid');
    await wait(250);
    const door = document.getElementById('monthBoardDoor');
    if (!door) return { door: null };
    const box = door.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(door);
    const pieces = [...range.getClientRects()].filter(r => r.width > 0);
    const inside = pieces.every(r => r.left >= box.left - 1 && r.right <= box.right + 1 && r.top >= box.top - 1 && r.bottom <= box.bottom + 1);
    // Words are broken only between words: every line holds whole words.
    const lines = [...new Set(pieces.map(r => Math.round(r.top)))].length;
    const head = document.querySelector('.week-table thead tr').getBoundingClientRect().height;
    const keep = monthBoardDoor;
    window.monthBoardDoor = undefined;
    render();
    await wait(150);
    const bare = document.querySelector('.week-table thead tr').getBoundingClientRect().height;
    window.monthBoardDoor = keep;
    render();
    await wait(150);
    return { door: [Math.round(box.width * 10) / 10, Math.round(box.height * 10) / 10], words: door.textContent, inside, lines,
        head, bare, corner: door.closest('th') ? door.closest('th').classList.contains('corner') : false,
        cls: door.className, size: parseFloat(getComputedStyle(door).fontSize) };
});

// The board's floors, by the ruler (tests/screens.mjs) and by the board's own rectangles.
const boardFloors = page => page.evaluate(measure => {
    const read = (0, eval)(`(${measure})`)(['#weekView']);
    const rect = node => node.getBoundingClientRect();
    const cells = [...document.querySelectorAll('#weekView .month-board-table td.week-cell')].map(rect);
    const days = [...document.querySelectorAll('#weekView .month-board-day')].map(rect);
    const names = [...document.querySelectorAll('#weekView .month-board-who')].map(rect);
    const select = document.getElementById('monthBoardPlace');
    return { read, cells: cells.map(r => [r.width, r.height]), days: days.map(r => [r.width, r.height]),
        names: names.map(r => [r.width, r.height]), select: select ? [rect(select).height, parseFloat(getComputedStyle(select).fontSize)] : null,
        page: [document.documentElement.scrollWidth, document.documentElement.clientWidth] };
}, measureInPage.toString());

function holdFloors(label, floors, large) {
    const target = large ? 51.5 : 43.5;
    const letter = large ? 18 : 14;
    const ratio = large ? 7 : 4.5;
    const live = floors.read.texts.filter(t => !t.off);
    given(`${label}: the board is drawn, with its grid`, floors.cells.length > 20 && floors.days.length > 10, `${floors.cells.length} cells`);
    const small = floors.read.targets.filter(t => t.w < target || t.h < target);
    check(`${label}: every control ${large ? 52 : 44}px both ways (the ruler)`, small.length === 0, brief(small, t => `${t.w}x${t.h} «${t.words}» ${t.where}`));
    const tiny = [['cells', floors.cells], ['dates', floors.days], ['names', floors.names]]
        .flatMap(([what, boxes]) => boxes.filter(([w, h]) => w < target || h < target).map(box => `${what} ${box.map(Math.round).join('x')}`));
    check(`${label}: every cell, every date and every name ${large ? 52 : 44}px both ways`, tiny.length === 0, tiny.slice(0, 4).join(' | '));
    const faint = live.filter(t => /[\p{L}\p{N}]/u.test(t.words) && t.size < letter);
    check(`${label}: no letter or digit under ${letter}px`, faint.length === 0, brief(faint, t => `${t.size}px «${t.words}» ${t.where}`));
    const weak = live.filter(t => t.contrast !== null && t.contrast < ratio);
    check(`${label}: every text ${ratio}:1 on the ground painted under it`, weak.length === 0, brief(weak, t => `${t.contrast} ${t.ink}/${t.ground} «${t.words}» ${t.where}`));
    check(`${label}: the site list is ${large ? 20 : 16}px or more and ${large ? 52 : 44}px tall`,
        floors.select && floors.select[1] >= (large ? 20 : 16) && floors.select[0] >= target, JSON.stringify(floors.select));
    check(`${label}: no control lies over another, no words past their control`, floors.read.overlaps.length === 0 && floors.read.spills.length === 0,
        brief(floors.read.overlaps.concat(floors.read.spills), o => `${o.by} «${o.words}» ${o.where}`));
    check(`${label}: the page does not scroll sideways (the grid does, in its box)`, floors.page[0] <= floors.page[1] && floors.read.offside.length === 0,
        `${floors.page.join('/')} ${brief(floors.read.offside, o => `${o.left}..${o.right} ${o.where}`)}`);
}

// ============================================================ 1. the door, and the floors
for (const [width, height] of PHONES) {
    for (const scheme of SCHEMES) {
        for (const large of [false, true]) {
            const label = `${width}x${height} ${scheme}${large ? ', large display' : ''}`;
            suite(`${label}: the door in the week's corner, and the board's floors`);
            const { context, page } = await phone(width, height, scheme, large);
            given(`${label}: the mode is ${large ? 'on' : 'off'}`, await page.evaluate(() => document.documentElement.classList.contains('display-large')) === large);
            const door = await gridDoor(page);
            given(`${label}: the door is in the grid's corner`, Boolean(door.door) && door.corner, JSON.stringify(door));
            const floor = large ? 52 : 44;
            check(`${label}: the door is ${floor}px or more both ways`, door.door[0] >= floor - 0.5 && door.door[1] >= floor - 0.5, JSON.stringify(door.door));
            same(`${label}: its words, whole and inside it`, [door.words, door.inside], [DOOR, true]);
            check(`${label}: on at most two lines, a word to a line at the most`, door.lines <= 2, String(door.lines));
            check(`${label}: and the header row is no taller than without it`, door.head <= door.bare + 0.01, `${door.head} / ${door.bare}`);
            // Into the board by the door itself, as a finger does it.
            await page.locator('#monthBoardDoor').tap();
            await page.waitForTimeout(350);
            const opened = await page.evaluate(() => ({ title: document.getElementById('monthBoardTitle') ? document.getElementById('monthBoardTitle').textContent : null,
                focus: document.activeElement ? document.activeElement.id : null }));
            same(`${label}: a tap opens the board on this month, entered at its title`, opened, { title: 'לוח חודשי · נובמבר 2026', focus: 'monthBoardTitle' });
            // Opened on today's column, with no day standing half under the pinned names: at
            // the foot its count read as the end of the label beside it, «סה"כ עובדים1» (the
            // review of v206).
            same(`${label}: no day stands half under the names as it opens - nor its count beside a label of the foot`,
                await page.evaluate(() => {
                    const names = document.querySelector('.month-board-corner').getBoundingClientRect();
                    return [...document.querySelectorAll('.month-board-table thead th[data-date]')].map(th => th.getBoundingClientRect())
                        .filter(r => r.left < names.left - 0.5 && r.right > names.left + 0.5)
                        .map(r => `${Math.round(r.left)}..${Math.round(r.right)} across ${Math.round(names.left)}`);
                }), []);
            holdFloors(`${label}, every site`, await boardFloors(page), large);
            await page.evaluate(() => openMonthBoard(null, 'p1'));
            await page.waitForTimeout(300);
            holdFloors(`${label}, one site`, await boardFloors(page), large);
            // OFF THIS MONTH «החודש» ends the site's row: the header is no taller for it, and
            // it holds the floors with everything else. On a row of its own it cost the 320
            // phone with the mode the one man its first screen holds (the review of v206).
            // Both read after the same settle: the buttons' glyphs are put in after a draw, and
            // with the mode «שיתוף כתמונה» on two lines grows its row by a pixel when they are.
            await page.evaluate(() => openMonthBoard(null, null));
            await page.waitForTimeout(300);
            const headOn = await page.evaluate(() => document.querySelector('.month-board-head').getBoundingClientRect().height);
            await page.evaluate(() => openMonthBoard('2026-10', null));
            await page.waitForTimeout(300);
            const headOff = await page.evaluate(() => ({ height: document.querySelector('.month-board-head').getBoundingClientRect().height,
                home: document.querySelector('[data-month-board="home"]') ? document.querySelector('[data-month-board="home"]').getBoundingClientRect().top : null,
                site: document.getElementById('monthBoardPlace').getBoundingClientRect().top }));
            check(`${label}: off this month «החודש» stands in the site's row, and the board's header is no taller for it`,
                headOff.home !== null && Math.abs(headOff.home - headOff.site) <= 8 && headOff.height <= headOn + 0.5, JSON.stringify({ headOn, headOff }));
            holdFloors(`${label}, October (with «החודש»)`, await boardFloors(page), large);
            if (SHOTS && ((width === 440 && scheme === 'dark' && !large) || (width === 320 && large && scheme === 'light'))) {
                await page.evaluate(() => openMonthBoard(null, null));
                await page.waitForTimeout(300);
                await page.screenshot({ path: join(SHOTS, `board-${width}x${height}-${scheme}${large ? '-large' : ''}.jpg`), type: 'jpeg', quality: 85 });
                await page.screenshot({ path: join(SHOTS, `board-${width}x${height}-${scheme}${large ? '-large' : ''}-full.jpg`), type: 'jpeg', quality: 85, fullPage: true });
            }
            await context.close();
        }
    }
}

// ============================================================ 1b. the door on a phone on its side, and wider
//
// Wider than 700px the week's cells keep 6px of padding, not the phone's 3: the door reached
// only 2px into it and the header row was 53px against 49.9 without it (the review of v206).
// tests/mobile.test.mjs's landscape phones, and a desktop.
for (const [width, height] of [[568, 320], [667, 375], [844, 390], [932, 430], [1280, 800]]) {
    for (const large of [false, true]) {
        const label = `${width}x${height} light${large ? ', large display' : ''}`;
        suite(`${label}: the door in the week's corner, wider than a phone held upright`);
        const { context, page } = await phone(width, height, 'light', large);
        const door = await gridDoor(page);
        given(`${label}: the door is in the grid's corner`, Boolean(door.door) && door.corner, JSON.stringify(door));
        const floor = large ? 52 : 44;
        check(`${label}: the door is ${floor}px or more both ways`, door.door[0] >= floor - 0.5 && door.door[1] >= floor - 0.5, JSON.stringify(door.door));
        same(`${label}: its words, whole and inside it`, [door.words, door.inside], [DOOR, true]);
        check(`${label}: and the header row is no taller than without it`, door.head <= door.bare + 0.01, `${door.head} / ${door.bare}`);
        await context.close();
    }
}

// ============================================================ 2. the grid with the door
{
    suite('375x667: the week grid is the grid of before, plus the door - and its picture is the same');
    const { context, page } = await phone(375, 667, 'light');
    // THE NAMES' COLUMN IS STILL CALLED «עובדים / ימים» by a screen reader: the corner's words
    // stay in the document beside the door, clipped to a pixel - removed, the column was
    // announced as «לוח חודשי» (the review of v206).
    const cdp = await page.context().newCDPSession(page);
    const corner = async () => {
        const { nodes } = await cdp.send('Accessibility.getFullAXTree');
        const byId = new Map(nodes.map(node => [node.nodeId, node]));
        const first = nodes.find(node => node.role && node.role.value === 'columnheader' && !node.ignored);
        const inside = [];
        const walk = id => (byId.get(id) && byId.get(id).childIds || []).forEach(child => { if (byId.has(child)) { inside.push(byId.get(child)); walk(child); } });
        if (first) walk(first.nodeId);
        return { name: first && first.name ? first.name.value : null,
            buttons: inside.filter(node => node.role && node.role.value === 'button' && !node.ignored).map(node => node.name && node.name.value) };
    };
    await page.evaluate(() => { State.date = todayStr(); showView('week'); setWeekPhoneMode('grid'); });
    await page.waitForTimeout(300);
    const spoken = await corner();
    await page.evaluate(() => { window.__door = monthBoardDoor; window.monthBoardDoor = undefined; render(); });
    await page.waitForTimeout(300);
    const spokenBare = await corner();
    await page.evaluate(() => { window.monthBoardDoor = window.__door; render(); });
    await page.waitForTimeout(300);
    given('without the door, the names\' column is «עובדים / ימים»', spokenBare.name === 'עובדים / ימים', JSON.stringify(spokenBare));
    check('with the door it is still named by «עובדים / ימים», and the door is a button inside it', String(spoken.name).includes('עובדים / ימים')
        && spoken.buttons.length === 1 && spoken.buttons[0] === DOOR, JSON.stringify(spoken));
    const read = await page.evaluate(async () => {
        const wait = ms => new Promise(done => setTimeout(done, ms));
        State.date = todayStr(); showView('week'); setWeekPhoneMode('grid');
        await wait(300);
        const view = document.getElementById('weekView');
        const door = document.getElementById('monthBoardDoor');
        const withDoor = { nodes: view.querySelectorAll('*').length, html: view.innerHTML, door: door ? door.outerHTML : '',
            picture: JSON.stringify(readWeekPrintout()) };
        const keep = monthBoardDoor;
        window.monthBoardDoor = undefined;
        render();
        await wait(300);
        const bare = { nodes: view.querySelectorAll('*').length, html: view.innerHTML, picture: JSON.stringify(readWeekPrintout()) };
        window.monthBoardDoor = keep;
        render();
        await wait(200);
        return { withDoor, bare };
    });
    same('the grid has exactly one node more with the door', read.withDoor.nodes, read.bare.nodes + 1);
    check('and that node is the door', /id="monthBoardDoor"/.test(read.withDoor.door) && read.withDoor.door.includes(DOOR), read.withDoor.door.slice(0, 120));
    check('and every other node is the same, byte for byte', read.withDoor.html.replace(read.withDoor.door, '') === read.bare.html,
        `${read.withDoor.html.length} / ${read.bare.html.length}`);
    same('the week\'s picture reads the same with the door as without it', read.withDoor.picture, read.bare.picture);
    await context.close();
}

// ============================================================ 3. and 4. the board, its ways in and out
{
    suite('375x667 light: the board - opening, the grid in its box, the arrows, «החודש», the filter, the way back');
    const { context, page } = await phone(375, 667, 'light');
    const disk = () => page.evaluate(() => {
        const out = {};
        Object.keys(localStorage).sort().filter(name => name !== 'farkad:openBuilds').forEach(name => { out[name] = localStorage.getItem(name); });
        return JSON.stringify(out);
    });
    const before = await disk();
    await page.evaluate(() => { State.date = todayStr(); showView('week'); setWeekPhoneMode('grid'); window.scrollTo(0, 0); });
    await page.waitForTimeout(250);
    await page.locator('#monthBoardDoor').tap();
    await page.waitForTimeout(350);
    const glass = await page.evaluate(today => {
        const box = document.querySelector('.month-board-scroll').getBoundingClientRect();
        const names = document.querySelector('.month-board-corner').getBoundingClientRect();
        const day = document.querySelector(`.month-board-table th[data-date="${today}"]`).getBoundingClientRect();
        return { mode: weekPhoneMode, grid: Boolean(document.querySelector('#weekView .week-table')),
            today: day.left >= box.left - 1 && day.right <= names.left + 1, day: [Math.round(day.left), Math.round(day.right)],
            area: [Math.round(box.left), Math.round(names.left)], current: document.querySelector('.month-board-day[aria-current="date"]') !== null,
            page: document.documentElement.scrollWidth <= document.documentElement.clientWidth };
    }, TODAY);
    same('the board is drawn in the week\'s place', [glass.mode, glass.grid], ['month', false]);
    check('today\'s column is on the glass, clear of the names', glass.today && glass.current, JSON.stringify(glass));
    check('the page does not scroll sideways', glass.page);
    const pinned = await page.evaluate(async () => {
        const box = document.querySelector('.month-board-scroll');
        const name = document.querySelector('.month-board-table tbody .month-board-name');
        const first = document.querySelector('.month-board-table tbody td.week-cell');
        const before = [name.getBoundingClientRect().right, first.getBoundingClientRect().left];
        box.scrollLeft = -box.scrollWidth;
        await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
        const after = [name.getBoundingClientRect().right, first.getBoundingClientRect().left];
        const edge = box.getBoundingClientRect();
        return { moved: Math.abs(after[1] - before[1]) > 40, nameStill: Math.abs(after[0] - before[0]) <= 1, atEdge: Math.abs(after[0] - edge.right) <= 2,
            scrolls: box.scrollWidth > box.clientWidth, page: document.documentElement.scrollWidth <= document.documentElement.clientWidth };
    });
    check('the grid scrolls inside its own box, and the names stay pinned at its edge', pinned.scrolls && pinned.moved && pinned.nameStill && pinned.atEdge && pinned.page,
        JSON.stringify(pinned));

    const title = () => page.evaluate(() => document.getElementById('monthBoardTitle').textContent);
    const focused = () => page.evaluate(() => (document.activeElement && (document.activeElement.dataset.monthBoard || document.activeElement.id)) || '');
    await page.locator('[data-month-board="prev"]').tap();
    await page.waitForTimeout(250);
    same('«חודש קודם»: October, the focus kept on the arrow, and «החודש» offered', [await title(), await focused(),
        await page.locator('[data-month-board="home"]').count()], ['לוח חודשי · אוקטובר 2026', 'prev', 1]);
    same('the arrow it kept is described by the title: where the focus lands, the month it went to is said',
        await page.evaluate(() => {
            const arrow = document.activeElement;
            const by = document.getElementById(arrow.getAttribute('aria-describedby') || '');
            return [arrow.dataset.monthBoard, by ? by.textContent : null];
        }), ['prev', 'לוח חודשי · אוקטובר 2026']);
    await page.locator('[data-month-board="home"]').tap();
    await page.waitForTimeout(250);
    same('«החודש»: back on November, the chip gone and the focus on the title', [await title(), await focused(),
        await page.locator('[data-month-board="home"]').count()], ['לוח חודשי · נובמבר 2026', 'monthBoardTitle', 0]);
    await page.locator('[data-month-board="next"]').tap();
    await page.waitForTimeout(250);
    const december = await page.evaluate(() => ({ title: document.getElementById('monthBoardTitle').textContent,
        empty: (document.querySelector('.month-board .empty-hint') || {}).textContent || '', grid: document.querySelectorAll('.month-board-table').length,
        out: document.querySelectorAll('.month-board-print, .month-board-share').length, said: MONTH_SUMMARY_TEXT.empty }));
    same('«חודש הבא»: December, nobody on it - the month summary\'s sentence, its header, no grid and nothing to print',
        [december.title, december.empty, december.grid, december.out], ['לוח חודשי · דצמבר 2026', december.said, 0, 0]);
    await page.locator('[data-month-board="home"]').tap();
    await page.waitForTimeout(400);
    // TWO STEPS AT A PERSON'S PACE, THE THUMB WHERE IT WAS. The arrows stand still when the
    // board leaves this month: «החודש» drawn between them took the inner third of each, and a
    // second «חודש קודם» landed on it and went back to this month (the review of v206).
    const arrowsAt = () => page.evaluate(() => ['prev', 'next'].map(name => {
        const r = document.querySelector(`[data-month-board="${name}"]`).getBoundingClientRect();
        return [r.left, r.top, r.width, r.height].map(n => Math.round(n * 10) / 10);
    }));
    const onThisMonth = await arrowsAt();
    const twice = async (which, share) => {
        const [left, top, w, h] = (await arrowsAt())[which === 'prev' ? 0 : 1];
        await page.touchscreen.tap(left + w * share, top + h / 2);
        await page.waitForTimeout(450);
        await page.touchscreen.tap(left + w * share, top + h / 2);
        await page.waitForTimeout(350);
        return title();
    };
    // In a right-to-left row «חודש קודם» is the right one, and its side toward the other its left.
    // Each pair starts on this month and the board is put back there by openMonthBoard, not by
    // «החודש»: a pair that went wrong may have left the board where there is no «החודש».
    same('«חודש קודם» twice at a person\'s pace, on the side of it toward «חודש הבא»: two months back, September',
        await twice('prev', 0.15), 'לוח חודשי · ספטמבר 2026');
    await page.evaluate(() => openMonthBoard('2026-10', null));
    await page.waitForTimeout(300);
    same('off this month the two arrows stand exactly where they stood on it', await arrowsAt(), onThisMonth);
    await page.evaluate(() => openMonthBoard(null, null));
    await page.waitForTimeout(400);
    same('«חודש הבא» twice the same way: two months on, January', await twice('next', 0.85), 'לוח חודשי · ינואר 2027');
    await page.evaluate(() => openMonthBoard(null, null));
    await page.waitForTimeout(250);
    await page.locator('#monthBoardPlace').selectOption('p1');
    await page.waitForTimeout(300);
    const site = await page.evaluate(() => {
        const plainIn = text => String(text).replace(/[\u200E\u2066-\u2069]/g, '');
        return { title: plainIn(document.getElementById('monthBoardTitle').textContent),
            foot: [...document.querySelectorAll('.month-board-table tfoot tr')].map(tr => tr.dataset.kind),
            rows: document.querySelectorAll('.month-board-table tbody tr').length,
            sites: [...document.querySelectorAll('.month-board-table tbody td.week-cell .cell-line')].every(line => line.dataset.place === 'p1'),
            focus: document.activeElement.id };
    });
    same('the filter narrows the board to the site: its name in the title, its blocks only, the invoice\'s three rows at the foot',
        [site.title, site.sites, site.foot, site.focus], ['לוח חודשי · נובמבר 2026 · הרצליה - מגדל הים', true, ['own', 'rima', 'billed'], 'monthBoardPlace']);
    check('and only the men who stood there', site.rows > 0 && site.rows < 14, String(site.rows));
    await page.locator('#monthBoardPlace').selectOption('');
    await page.waitForTimeout(300);
    same('«כל האתרים» puts every site back', await page.evaluate(() => [MONTH_BOARD_PLACE,
        [...document.querySelectorAll('.month-board-table tfoot tr')].map(tr => tr.dataset.kind)]), [null, ['men', 'rima', 'yosef']]);

    // A Saturday nothing was recorded on is no column, and on one the board opens on the
    // Friday before it - not on the 1st, four weeks of swiping away. todayStr() answers the
    // 14th for ONE synchronous opening (no timer can run inside it), and the real clock is
    // back, and the board drawn again by it, before anything else happens.
    const saturday = await page.evaluate(() => {
        const real = window.todayStr;
        window.todayStr = () => '2026-11-14';
        try {
            openMonthBoard(null, null);
            const box = document.querySelector('.month-board-scroll').getBoundingClientRect();
            const names = document.querySelector('.month-board-corner').getBoundingClientRect();
            const seen = date => {
                const th = document.querySelector(`.month-board-table th[data-date="${date}"]`).getBoundingClientRect();
                return th.left >= box.left - 1 && th.right <= names.left + 1;
            };
            return { column: document.querySelectorAll('.month-board-table th[data-date="2026-11-14"]').length,
                friday: seen('2026-11-13'), first: seen('2026-11-01') };
        } finally {
            window.todayStr = real;
        }
    });
    same('on a Saturday nothing was recorded on - no column - the board opens on the Friday before it, not on the 1st',
        [saturday.column, saturday.friday, saturday.first], [0, true, false]);
    await page.evaluate(() => { openMonthBoard(null, null); });
    await page.waitForTimeout(250);
    // A month not over goes on paper and into the picture with the day they were made - the
    // days after it are not yet, not nobody's (the review of v206); the screen marks today.
    same('this month\'s paper and picture say the day they were made; the screen\'s title does not', await page.evaluate(() => [
        readMonthPrintout().title.replace(/[⁦-⁩]/g, ''), document.getElementById('monthBoardTitle').textContent,
        getComputedStyle(document.querySelector('.month-print-title')).display]),
    ['לוח חודשי · נובמבר 2026 · נכון ל־10/11/2026', 'לוח חודשי · נובמבר 2026', 'none']);

    // Print, with the sheet stood in for; the picture, with the share sheet stood in for.
    await page.evaluate(() => {
        window.__printed = 0;
        window.print = () => { window.__printed += 1; window.dispatchEvent(new Event('beforeprint')); };
        window.__shared = [];
        navigator.canShare = () => true;
        navigator.share = data => { window.__shared.push(data.files[0].name); return Promise.resolve(); };
    });
    await page.locator('.month-board-print').tap();
    await page.waitForTimeout(1800);
    await page.locator('.month-board-share').tap();
    await page.waitForTimeout(400);
    same('«🖨️ הדפסה» prints, with nothing offered over it; «🖼️ שיתוף כתמונה» hands the month\'s picture to the share sheet',
        await page.evaluate(() => [window.__printed, document.getElementById('askModal').style.display === 'flex', window.__shared]),
        [1, false, ['farkad-לוח-חודשי-2026-11.png']]);
    same('NOTHING WRITTEN: every key on the disk, byte for byte, across opening, the arrows, the filter, print and the picture', await disk(), before);
    await censusOnly(check, page, before);

    suite('375x667 light: the ways out - a cell, a date, a name; Escape, and the focus');
    // Brought clear of the pinned names first: a finger aims at a cell it can see.
    const reveal = selector => page.evaluate(sel => {
        const node = document.querySelector(sel);
        const box = document.querySelector('.month-board-scroll');
        const names = document.querySelector('.month-board-corner').getBoundingClientRect();
        const r = node.getBoundingClientRect();
        box.scrollLeft += (r.left + r.width / 2) - (box.getBoundingClientRect().left + names.left) / 2;
        node.scrollIntoView({ block: 'center', inline: 'nearest' });
    }, selector);
    await reveal('.month-board-table tbody tr:first-child td.week-cell[data-date="2026-11-04"]');
    await page.waitForTimeout(150);
    await page.locator('.month-board-table tbody tr:first-child td.week-cell[data-date="2026-11-04"]').tap();
    await page.waitForTimeout(300);
    same('a cell opens its day: the day screen, on that date', await page.evaluate(() => [currentView, State.date]), ['day', '2026-11-04']);
    await page.evaluate(() => openMonthBoard(null, null));
    await page.waitForTimeout(300);
    await reveal('.month-board-table th[data-date="2026-11-02"]');
    await page.waitForTimeout(150);
    await page.locator('.month-board-table th[data-date="2026-11-02"] .month-board-day').tap();
    await page.waitForTimeout(300);
    same('a date opens its day', await page.evaluate(() => [currentView, State.date]), ['day', '2026-11-02']);
    await page.evaluate(() => openMonthBoard(null, null));
    await page.waitForTimeout(300);
    const who = await page.evaluate(() => document.querySelector('.month-board-table tbody tr[data-worker-id="w02"] .month-board-who').getAttribute('aria-label'));
    await page.locator('.month-board-table tbody tr[data-worker-id="w02"] .month-board-who').tap();
    await page.waitForTimeout(400);
    const card = await page.evaluate(() => ({ open: document.getElementById('workerCardModal').style.display, focus: document.activeElement.id,
        title: document.getElementById('workerCardTitle').textContent }));
    same('a name opens his card, entered at its title', [card.open, card.focus], ['flex', 'workerCardTitle']);
    check('the card is his', plain(card.title).includes('עלי חסן') && plain(who).startsWith('עלי חסן · '), `${card.title} / ${who}`);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    same('Escape shuts the card, and the focus is back on his name on the board', await page.evaluate(() => [
        document.getElementById('workerCardModal').style.display, document.activeElement.classList.contains('month-board-who'),
        document.activeElement.closest('tr') ? document.activeElement.closest('tr').dataset.workerId : null, weekPhoneMode]),
    ['none', true, 'w02', 'month']);
    // HIS CARD ON THE BOARD'S MONTH: a man's dispute about October is read on October - the
    // card opened on the month today is in (the review of v206).
    await page.evaluate(() => openMonthBoard('2026-10', null));
    await page.waitForTimeout(300);
    await page.locator('.month-board-table tbody tr[data-worker-id="w02"] .month-board-who').tap();
    await page.waitForTimeout(400);
    same('a name on October\'s board opens his card on October, entered at its title', await page.evaluate(() => [
        WORKER_CARD_MONTH, (document.querySelector('#workerCardBody .wcard-cal-label') || {}).textContent || null, document.activeElement.id]),
    ['2026-10', 'אוקטובר 2026', 'workerCardTitle']);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    same('Escape: the card shut and its month forgotten, the focus back on his name on October\'s board', await page.evaluate(() => [
        document.getElementById('workerCardModal').style.display, WORKER_CARD_MONTH, document.activeElement.classList.contains('month-board-who'),
        MONTH_BOARD_KEY]), ['none', null, true, '2026-10']);
    await page.locator('[data-month-board="back"]').tap();
    await page.waitForTimeout(300);
    same('«חזרה לטבלת השבוע»: the week\'s grid, the focus on the door', await page.evaluate(() => [weekPhoneMode,
        Boolean(document.querySelector('#weekView .week-table')), document.activeElement.id]), ['grid', true, 'monthBoardDoor']);
    await page.locator('#monthBoardDoor').tap();
    await page.waitForTimeout(300);
    await page.locator('#tab-day').tap();
    await page.waitForTimeout(250);
    await page.locator('#tab-week').tap();
    await page.waitForTimeout(300);
    same('the tab left and come back to shows the grid, not the board', await page.evaluate(() => [weekPhoneMode,
        Boolean(document.querySelector('#weekView .week-table')), Boolean(document.querySelector('#weekView .month-board'))]), ['grid', true, false]);
    await context.close();
}

// ============================================================ the place kept across a redraw
{
    suite('375x667 dark: a redraw keeps the reader\'s place - a commit, then a record adopted from another phone');
    const { context, page } = await phone(375, 667, 'dark');
    await page.evaluate(() => openMonthBoard(null, null));
    await page.waitForTimeout(300);
    const place = () => page.evaluate(() => ({ left: document.querySelector('.month-board-scroll').scrollLeft, top: window.scrollY,
        key: MONTH_BOARD_KEY, site: MONTH_BOARD_PLACE, focus: document.activeElement && document.activeElement.closest('td.week-cell')
            ? `${document.activeElement.closest('tr').dataset.workerId} ${document.activeElement.dataset.date}` : '' }));
    // Pushed toward the month's first days, the page down to the foot, the keyboard on a cell.
    await page.evaluate(() => {
        const box = document.querySelector('.month-board-scroll');
        box.scrollLeft = Math.round(-box.scrollWidth / 3);
        window.scrollTo(0, Math.round(document.documentElement.scrollHeight / 3));
        document.querySelector('.month-board-table tbody tr[data-worker-id="w03"] td.week-cell[data-date="2026-11-05"]').focus({ preventScroll: true });
    });
    await page.waitForTimeout(200);
    const before = await place();
    given('the board was pushed sideways and the page down', before.left < -20 && before.top > 20, JSON.stringify(before));
    await page.evaluate(() => State.commit(setRimaCount(State.schedule, '2026-11-09', 'p3', 2)));
    await page.waitForTimeout(250);
    const committed = await place();
    check('a commit redraws the board and leaves the grid, the page and the keyboard where they were',
        Math.abs(committed.left - before.left) <= 1 && Math.abs(committed.top - before.top) <= 1 && committed.focus === before.focus
        && committed.key === before.key && committed.site === before.site, JSON.stringify({ before, committed }));
    same('and the board does show what was committed: Rima on the 9th, in its own column', await page.evaluate(() => {
        const at = [...document.querySelectorAll('.month-board-table thead th[data-date]')].findIndex(th => th.dataset.date === '2026-11-09');
        const row = document.querySelector('.month-board-table tfoot tr[data-kind="rima"]');
        return row && at >= 0 ? row.children[at + 1].textContent : null;
    }), String(await page.evaluate(() => rimaReport(State.schedule, '2026-11-01', '2026-11-30').dayTotal('2026-11-09'))));
    await page.evaluate(() => {
        const raw = JSON.parse(JSON.stringify(State.schedule));
        raw.updatedAt = new Date(Date.now() + 1000).toISOString();
        raw.updatedBy = 'other-device';
        assignPlace(raw, '2026-11-09', 'w14', 'actual', 'p2');
        FarkadSync.receive(raw);
    });
    await page.waitForTimeout(400);
    const adopted = await place();
    check('a record adopted from another phone redraws it and leaves everything where it was',
        Math.abs(adopted.left - before.left) <= 1 && Math.abs(adopted.top - before.top) <= 1 && adopted.focus === before.focus
        && adopted.key === before.key && adopted.site === before.site, JSON.stringify({ before, adopted }));
    check('and the board shows the man the other phone placed', await page.evaluate(() =>
        entriesFor(State.schedule, '2026-11-09', 'w14', 'actual').length === 1
        && document.querySelector('.month-board-table tbody tr[data-worker-id="w14"] td.week-cell[data-date="2026-11-09"] .cell-line') !== null));
    await page.locator('[data-month-board="prev"]').tap();
    await page.waitForTimeout(300);
    same('a new month opens at its first date, beside the names', await page.evaluate(() => {
        const box = document.querySelector('.month-board-scroll');
        const first = document.querySelector('.month-board-table thead th[data-date]').getBoundingClientRect();
        const names = document.querySelector('.month-board-corner').getBoundingClientRect();
        return [box.scrollLeft, Math.abs(first.right - names.left) <= 1];
    }), [0, true]);

    suite('375x667 dark: a dialog shut, and the board opened a task later, ends at the board\'s title');
    // Opened from its own button on the crew screen, which holds the focus: the opener modal.js
    // gives the focus back to when the dialog shuts.
    await page.evaluate(() => {
        showView('roster');
        const opener = [...document.querySelectorAll('#rosterView .worker-card-open')][1];
        opener.focus();
        opener.click();
    });
    await page.waitForTimeout(300);
    given('a dialog is open, opened from a button that holds the focus', await page.evaluate(() =>
        document.getElementById('workerCardModal').style.display === 'flex'));
    await page.evaluate(() => new Promise(done => {
        closeWorkerCard();
        setTimeout(() => { openMonthBoard('2026-10', null); setTimeout(done, 50); }, 0);
    }));
    await page.waitForTimeout(200);
    same('the focus ends on the board\'s title, not on the shut dialog\'s opener', await page.evaluate(() => [document.activeElement.id,
        MONTH_BOARD_KEY, weekPhoneMode, currentView]), ['monthBoardTitle', '2026-10', 'month', 'week']);
    await context.close();
}

// ============================================================ 5. doubled text
for (const [width, height] of [[320, 568], [375, 667]]) {
    suite(`${width}x${height} light, every font size doubled: the board still fits, and every target holds`);
    const { context, page } = await phone(width, height, 'light');
    await page.evaluate(() => {
        // tests/mobile.test.mjs's cascade rewrite, which survives the board's redraws: every
        // font-size of every sheet said again at twice its size, last and important.
        const out = ['html{font-size:32px !important;}'];
        const walk = (rules, wrap) => {
            for (const rule of rules) {
                if (rule.type === 4 || rule.type === 12) {
                    const head = rule.type === 4 ? `@media ${rule.media.mediaText}` : `@supports ${rule.conditionText}`;
                    walk(rule.cssRules, text => wrap(`${head}{${text}}`));
                    continue;
                }
                if (rule.type !== 1 || !rule.style) continue;
                const raw = rule.style.getPropertyValue('font-size');
                if (!raw || !/^[\d.]+px$/.test(raw.trim())) continue;
                wrap(`${rule.selectorText}{font-size:${parseFloat(raw) * 2}px !important;}`);
            }
        };
        for (const sheet of document.styleSheets) {
            let rules = null;
            try { rules = sheet.cssRules; } catch (error) { rules = null; }
            if (rules) walk(rules, text => out.push(text));
        }
        const style = document.createElement('style');
        style.textContent = out.join('\n');
        document.head.appendChild(style);
    });
    // The page's own width with the week's grid, at the same doubled size: the top bar's sync
    // sentence alone runs past a 320px phone at twice the size, board or no board, and that is
    // not this screen's to answer for. The board must add nothing to it.
    const gridWidth = await page.evaluate(async () => {
        showView('week'); setWeekPhoneMode('grid'); window.scrollTo(0, 0);
        await new Promise(done => setTimeout(done, 300));
        return document.documentElement.scrollWidth;
    });
    // THE DOOR AT TWICE THE SIZE, on the week's own grid: «חודשי» is wider than the corner,
    // and breaks inside the door rather than run out of it over the first day (the review of
    // v206 measured it 15px past the door's edge at 320).
    const door = await page.evaluate(measure => {
        const node = document.getElementById('monthBoardDoor');
        const box = node.getBoundingClientRect();
        const range = document.createRange();
        range.selectNodeContents(node);
        const out = [...range.getClientRects()].filter(r => r.width > 0)
            .filter(r => r.left < box.left - 1 || r.right > box.right + 1 || r.top < box.top - 1 || r.bottom > box.bottom + 1)
            .map(r => `${Math.round(r.left)}..${Math.round(r.right)} in ${Math.round(box.left)}..${Math.round(box.right)}`);
        const read = (0, eval)(`(${measure})`)(['#weekView .week-table thead']);
        return { size: parseFloat(getComputedStyle(node).fontSize), out,
            ruler: read.spills.concat(read.overlaps).filter(one => /monthBoardDoor/.test(one.where)).map(one => `${one.by} ${one.where}`) };
    }, measureInPage.toString());
    check(`${width}: on the week's grid the door's words stay inside it at twice the size (${door.size}px)`,
        door.size >= 27 && door.out.length === 0 && door.ruler.length === 0, JSON.stringify(door));
    await page.evaluate(() => openMonthBoard(null, null));
    await page.waitForTimeout(400);
    await page.evaluate(() => window.scrollTo(0, 0));
    const floors = await boardFloors(page);
    const title = await page.evaluate(() => parseFloat(getComputedStyle(document.getElementById('monthBoardTitle')).fontSize));
    check(`${width}: the text really is doubled (the title ${title}px)`, title >= 35, String(title));
    const past = await page.evaluate(() => {
        const vw = document.documentElement.clientWidth;
        return [...document.querySelectorAll('#weekView *')].filter(node => !node.closest('.month-board-scroll'))
            .filter(node => { const r = node.getBoundingClientRect(); return r.width > 0 && (r.right > vw + 1 || r.left < -1); })
            .map(node => `${node.tagName.toLowerCase()}.${String(node.className).split(' ')[0]} ${Math.round(node.getBoundingClientRect().left)}..${Math.round(node.getBoundingClientRect().right)}`);
    });
    same(`${width}: nothing of the board reaches past the phone's edges (the grid scrolls in its own box)`, past.slice(0, 4), []);
    // No word of the grid runs out of its own cell: at twice the size «עובדים» ran 28px out of
    // the corner over the first day's letter (the review of v206) - and the ruler's own check
    // reads only a control's words.
    const outOfCell = await page.evaluate(() => {
        const out = [];
        document.querySelectorAll('#weekView .month-board-table th, #weekView .month-board-table td').forEach(cell => {
            const box = cell.getBoundingClientRect();
            const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
            for (let text = walker.nextNode(); text; text = walker.nextNode()) {
                if (!text.textContent.trim()) continue;
                const range = document.createRange();
                range.selectNodeContents(text);
                [...range.getClientRects()].filter(r => r.width > 0 && r.height > 0)
                    .filter(r => r.left < box.left - 1 || r.right > box.right + 1)
                    .forEach(r => out.push(`${cell.className.split(' ')[0]} «${text.textContent.trim().slice(0, 12)}» ${Math.round(r.left)}..${Math.round(r.right)} in ${Math.round(box.left)}..${Math.round(box.right)}`));
            }
        });
        return out;
    });
    same(`${width}: no word of the grid runs out of its own cell - the corner's over the first day, a label's, a name's`, outOfCell.slice(0, 4), []);
    check(`${width}: and the board makes the page no wider than the week's grid does (${floors.page[0]} / ${gridWidth})`,
        floors.page[0] <= gridWidth && await page.evaluate(() => window.scrollX) === 0, `${floors.page[0]} / ${gridWidth}`);
    const small = floors.read.targets.filter(t => t.w < 43.5 || t.h < 43.5);
    const tiny = [['cells', floors.cells], ['dates', floors.days], ['names', floors.names]]
        .flatMap(([what, boxes]) => boxes.filter(([w, h]) => w < 43.5 || h < 43.5).map(box => `${what} ${box.map(Math.round).join('x')}`));
    check(`${width}: every target still 44px both ways - the controls, the cells, the dates, the names`, small.length === 0 && tiny.length === 0,
        brief(small, t => `${t.w}x${t.h} «${t.words}»`) + tiny.slice(0, 3).join(' | '));
    // And off this month, «החודש» at the end of the site's row at twice the size.
    await page.evaluate(() => { openMonthBoard('2026-10', null); window.scrollTo(0, 0); });
    await page.waitForTimeout(400);
    const october = await boardFloors(page);
    const octoberSmall = october.read.targets.filter(t => t.w < 43.5 || t.h < 43.5);
    check(`${width}: October's board at twice the size - «החודש» there, every control 44px both ways, nothing over another, no words past their control`,
        await page.evaluate(() => Boolean(document.querySelector('[data-month-board="home"]'))) && octoberSmall.length === 0
        && october.read.overlaps.length === 0 && october.read.spills.length === 0,
        brief(octoberSmall.concat(october.read.overlaps, october.read.spills), t => `${t.w || ''}x${t.h || ''} ${t.by || ''} «${t.words}» ${t.where || ''}`));
    check(`${width}: and it makes the page no wider than the week's grid does`, october.page[0] <= gridWidth, `${october.page[0]} / ${gridWidth}`);
    await context.close();
}

// ============================================================ paper, the picture and the budgets: a season
//
// Forty men over October 2026, with Latin names so a PDF's text can be read without its
// Hebrew drawn in reverse: work most weekdays, doubles, extra hours, absences, two archived
// men who worked, a Saturday (the 3rd) worked, a Saturday (the 10th) with only a Rima count,
// Rima on Alpha, יוסף גבס on Bravo, and Alpha and Atlas sharing «A». Runs in the page.
function season(men) {
    let a = 20261019;
    const rand = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    State.schedule.workers = Array.from({ length: men }, (_, i) => ({ id: `w_${i + 1}`, name: `Worker ${String(i + 1).padStart(2, '0')}`,
        active: i < men - 2, dailyRate: 400, hourlyRate: 50 }));
    State.schedule.places = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Atlas'].map((name, i) => ({ id: `p_${i + 1}`, name, active: true }));
    State.schedule.days = {};
    for (let d = 1; d <= 31; d += 1) {
        const date = `2026-10-${String(d).padStart(2, '0')}`;
        const saturday = new Date(2026, 9, d, 12).getDay() === 6;
        State.schedule.workers.forEach(worker => {
            if (saturday && !(date === '2026-10-03' && Number(worker.id.slice(2)) % 5 === 0)) return;
            const roll = rand();
            if (roll < 0.12) return;
            if (roll < 0.18) { markAbsent(State.schedule, date, worker.id, 'actual'); return; }
            const site = `p_${1 + Math.floor(rand() * 6)}`;
            const band = rand();
            assignPlace(State.schedule, date, worker.id, 'actual', site, band < 0.1 ? RATE_DOUBLE : band < 0.18 ? RATE_EXTRA : undefined,
                band >= 0.1 && band < 0.18 ? 2 : undefined);
            if (roll > 0.95) assignPlace(State.schedule, date, worker.id, 'actual', site === 'p_1' ? 'p_6' : 'p_1');
        });
        if (!saturday && rand() < 0.5) setRimaCount(State.schedule, date, 'p_1', 2);
        if (!saturday && rand() < 0.3) setYosefGevesCount(State.schedule, date, 'p_2', 1);
    }
    setRimaCount(State.schedule, '2026-10-10', 'p_1', 3);
    State.save();
    State.date = '2026-10-14';
}

{
    suite('paper: a real PDF of the board - A4 landscape, every name once, the title, the Saturdays, the pages');
    const { context, page } = await phone(390, 844, 'light', false, false);
    const printed = async (men, place) => {
        await page.evaluate(season, men);
        await page.evaluate(id => openMonthBoard('2026-10', id), place);
        await page.waitForTimeout(400);
        const want = await page.evaluate(() => ({ dates: [...document.querySelectorAll('.month-board-table thead th[data-date]')].map(th => th.dataset.date),
            names: [...document.querySelectorAll('.month-board-table tbody .month-board-who-name')].map(node => node.textContent) }));
        const buffer = await page.pdf({ preferCSSPageSize: true, printBackground: true });
        if (SHOTS && men === 40) writeFileSync(join(SHOTS, `board${place ? '-site' : ''}.pdf`), buffer);
        const pdf = readPdf(buffer);
        return { want, pdf, pages: pdf.pages.map(pageText), text: pdf.pages.map(pageText).join('\n') };
    };
    // The header read off the paper itself: each date column is its day's letter and its day.
    const columnsOf = text => [...new Set([...text.matchAll(/׳([א-ת])(\d{2})|([א-ת])׳(\d{2})/g)].map(m => `${m[1] || m[3]}${m[2] || m[4]}`))];
    // The title as the page's own first line - what is drawn first, the h1, and everything on
    // its line: not any place on the sheet a word happens to be (the legend names every site,
    // and the review of v206 found a title check satisfied by it).
    const titleLine = run => {
        const first = run.pdf.pages[0] && run.pdf.pages[0].texts[0];
        return first ? run.pdf.pages[0].texts.filter(t => Math.abs(t.y - first.y) < 2).map(t => t.text).join('') : '';
    };
    const count = (text, words) => text.split(words).length - 1;
    const pages = {};
    for (const men of [12, 25, 40]) {
        const run = await printed(men, null);
        pages[men] = run.pdf.pages.length;
        check(`${men} men: every page is A4 landscape`, run.pdf.pages.length > 0
            && run.pdf.pages.every(p => p.width > p.height && Math.abs(p.width - 842) < 3 && Math.abs(p.height - 595) < 3),
            JSON.stringify(run.pdf.pages.map(p => [Math.round(p.width), Math.round(p.height)])));
        same(`${men} men: every name on the paper exactly once - no man left out, none cut across two pages`,
            run.want.names.filter(name => count(run.text, name) !== 1), []);
        same(`${men} men: the dates' header row on every page`, run.pages.map(text => columnsOf(text).length), run.pages.map(() => run.want.dates.length));
        check(`${men} men: nothing is printed off the edge of a page`, run.pdf.pages.every(p => p.texts.every(t => t.x >= 0 && t.x <= p.width && t.y >= 0 && t.y <= p.height)));
        if (men === 40) {
            check('the title is on it: «לוח חודשי · אוקטובר 2026»', onPaper(run.text, 'לוח חודשי') && onPaper(run.text, 'אוקטובר') && run.text.includes('2026'),
                run.text.slice(0, 80));
            check('it is the page\'s first line, which names no site - and carries no date: October is over', onPaper(titleLine(run), 'לוח חודשי')
                && onPaper(titleLine(run), 'אוקטובר') && !titleLine(run).includes('Alpha') && !onPaper(titleLine(run), 'נכון ל'), titleLine(run));
            same('the date columns on the paper: every weekday, and of the five Saturdays only the 3rd (worked) and the 10th (only Rima)',
                columnsOf(run.text).filter(c => c.startsWith('ש')), ['ש03', 'ש10']);
            same('and the paper has every column the board has', columnsOf(run.text).length, run.want.dates.length);
            check('the board\'s own controls are not on the paper', !onPaper(run.text, 'חזרה לטבלת השבוע') && !onPaper(run.text, 'חודש קודם')
                && !onPaper(run.text, 'לחיצה על תא'));
        }
    }
    console.log(`        pages of A4 landscape: 12 men ${pages[12]}, 25 men ${pages[25]}, 40 men ${pages[40]}`);
    same('a small crew is one page', pages[12], 1);
    check('a larger one runs on to further pages as it needs them, never fewer for more men', pages[25] >= pages[12] && pages[40] >= pages[25],
        JSON.stringify(pages));
    const one = await printed(40, 'p_1');
    check('one site: its name in the title - the page\'s first line itself, not the legend under the grid',
        onPaper(titleLine(one), 'לוח חודשי') && titleLine(one).includes('Alpha'), titleLine(one));
    same('one site: every man who stood there is on it, once', one.want.names.filter(name => count(one.text, name) !== 1), []);
    check('one site: «רישום לרימא» and «סה״כ ימי עובד־אתר» are on the paper, «בלי עובדי רימא» is not',
        onPaper(one.text, 'רישום לרימא') && onPaper(one.text, 'ימי עובד') && !onPaper(one.text, 'בלי עובדי רימא'));
    await page.emulateMedia({ media: 'print' });
    const paper = await page.evaluate(() => ({ head: getComputedStyle(document.querySelector('.month-board-head')).display,
        h1: getComputedStyle(document.querySelector('.month-print-title')).display, legend: getComputedStyle(document.querySelector('.month-board-legend')).display,
        letter: getComputedStyle(document.querySelector('.month-board-table td.week-cell .cell-line'), '::before').content,
        own: getComputedStyle(document.querySelector('.month-board-table tr[data-kind="own"]')).display,
        repeat: getComputedStyle(document.querySelector('.month-board-table thead')).display,
        rows: [...new Set([...document.querySelectorAll('.month-board-table tbody tr')].map(tr => getComputedStyle(tr).breakInside))] }));
    same('on paper: no controls, the title, the legend, no «בלי עובדי רימא», the dates repeated on every page, no row broken',
        [paper.head, paper.h1, paper.legend, paper.own, paper.repeat, paper.rows], ['none', 'block', 'flex', 'none', 'table-header-group', ['avoid']]);
    check('and a block on paper writes its site\'s letters in it (the screen\'s are css/design.css\'s, which paper does not read)',
        /^"[^"]{1,3}"$/.test(paper.letter), paper.letter);
    // Back to no emulation at all: a media of 'screen' would print the next PDF as the screen.
    await page.emulateMedia({ media: null });
    await page.evaluate(() => { showView('week'); setWeekFromDate('2026-10-14'); setWeekPhoneMode('grid'); });
    await page.waitForTimeout(300);
    const week = readPdf(await page.pdf({ preferCSSPageSize: true, printBackground: true }));
    const weekText = week.pages.map(pageText).join('\n');
    check('the week\'s own paper does not carry the door, and keeps its corner\'s words', !onPaper(weekText, DOOR) && onPaper(weekText, 'עובדים / ימים'),
        weekText.slice(0, 80));
    await context.close();
}

{
    suite('the picture: within 4,096px, every name and every block\'s letters where the layout says');
    const { context, page } = await phone(390, 844, 'light', false, false);
    await page.evaluate(season, 40);
    await page.evaluate(() => openMonthBoard('2026-10', null));
    await page.waitForTimeout(400);
    const picture = await page.evaluate(async () => {
        const said = [];
        const native = CanvasRenderingContext2D.prototype.fillText;
        CanvasRenderingContext2D.prototype.fillText = function (text, x, y, ...rest) {
            const at = this.getTransform().transformPoint(new DOMPoint(x, y));
            said.push({ text: String(text), x: at.x, y: at.y, color: this.fillStyle });
            return native.call(this, text, x, y, ...rest);
        };
        let made;
        try { made = printoutImage('month'); } finally { CanvasRenderingContext2D.prototype.fillText = native; }
        const spec = readMonthPrintout();
        const url = URL.createObjectURL(made.blob);
        const img = await new Promise((ok, no) => { const node = new Image(); node.onload = () => ok(node); node.onerror = no; node.src = url; });
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const pixel = (x, y) => [...ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data].slice(0, 3);
        const inBox = (point, box) => point.x >= box.x - 1 && point.x <= box.x + box.w + 1 && point.y >= box.y - 1 && point.y <= box.y + box.h + 1;
        const dark = box => { const data = ctx.getImageData(box.x, box.y, Math.max(1, box.w), Math.max(1, box.h)).data; let n = 0;
            for (let i = 0; i < data.length; i += 4) if (data[i] + data[i + 1] + data[i + 2] < 300) n += 1; return n; };
        const white = box => { const data = ctx.getImageData(box.x, box.y, Math.max(1, box.w), Math.max(1, box.h)).data; let n = 0;
            for (let i = 0; i < data.length; i += 4) if (data[i] > 235 && data[i + 1] > 235 && data[i + 2] > 235) n += 1; return n; };
        const rows = made.layout.rows.slice(0, spec.rows.length);
        // Each man's name: written inside his own row, near the right edge, and there is ink there.
        const names = spec.rows.map((row, i) => {
            const at = said.filter(one => one.text === row.name);
            const box = rows[i];
            const point = at[0];
            const ink = point ? dark({ x: Math.round(point.x - 40), y: Math.round(point.y - 8), w: 38, h: 16 }) : 0;
            return { name: row.name, written: at.length, inRow: point ? inBox(point, box) : false, right: point ? point.x > made.width * 0.8 : false, ink };
        });
        // Each block: its colour at its edge, white letters inside it, and its letters written inside it.
        const blocks = [];
        let k = 0;
        spec.rows.forEach(row => row.cells.forEach(cell => cell.lines.forEach(line => {
            const box = made.layout.chips[k];
            k += 1;
            const words = `${line.mark}${line.initial}`;
            const at = said.filter(one => one.text === words && inBox(one, box));
            const wants = line.color.match(/\d+/g).slice(0, 3).map(Number);
            const got = pixel(box.x + 2, box.y + box.h / 2);
            blocks.push({ words, written: at.length > 0, colour: got.every((v, i) => Math.abs(v - wants[i]) <= 3), white: white(box) > 4 });
        })));
        return { width: made.width, height: made.height, rows: made.layout.rows.length, men: spec.rows.length, foot: spec.foot.length,
            chips: made.layout.chips.length, legend: spec.legend.length, names, blocks, title: dark(made.layout.title), file: made.name };
    });
    check('within 4,096px a side', Math.max(picture.width, picture.height) <= 4096 && picture.width > 1000, `${picture.width}x${picture.height}`);
    same('a row in the layout for every man and every foot row', picture.rows, picture.men + picture.foot);
    same('a block in the layout for every block of the board and every legend swatch', picture.chips, picture.blocks.length + picture.legend);
    same('every man\'s name written once, inside his own row, at the right edge, in ink', picture.names.filter(n => !(n.written >= 1 && n.inRow && n.right && n.ink > 5)), []);
    same('every block in its site\'s colour, with its letters written inside it in white',
        picture.blocks.filter(b => !(b.written && b.colour && b.white)).slice(0, 3), []);
    check('and the title has ink in it', picture.title > 50, String(picture.title));
    same('the file is named for the month', picture.file, 'farkad-לוח-חודשי-2026-10.png');
    const sitePicture = await page.evaluate(() => {
        openMonthBoard('2026-10', 'p_1');
        const said = [];
        const native = CanvasRenderingContext2D.prototype.fillText;
        CanvasRenderingContext2D.prototype.fillText = function (text, ...rest) { said.push(String(text)); return native.call(this, text, ...rest); };
        try { printoutImage('month'); } finally { CanvasRenderingContext2D.prototype.fillText = native; }
        return { said, own: document.querySelectorAll('.month-board-table tr[data-kind="own"]').length, labels: [NO_RIMA_TITLE, RIMA_TITLE, NO_RIMA_TOTAL] };
    });
    given('the one-site board has its own men\'s row on the screen', sitePicture.own === 1);
    same('the one-site picture draws «רישום לרימא» and «סה״כ ימי עובד־אתר» once each, and «בלי עובדי רימא» never',
        sitePicture.labels.map(label => sitePicture.said.filter(text => text === label).length), [0, 1, 1]);
    await page.evaluate(() => openMonthBoard('2026-10', null));
    await page.waitForTimeout(300);
    if (SHOTS) {
        const png = await page.evaluate(async () => { const out = printoutImage('month');
            return new Promise(ok => { const r = new FileReader(); r.onload = () => ok(r.result.split(',')[1]); r.readAsDataURL(out.blob); }); });
        writeFileSync(join(SHOTS, 'board-picture.png'), Buffer.from(png, 'base64'));
    }

    suite('the budgets: the board on a 40-man month, and its picture');
    const time = async () => page.evaluate(() => {
        const runs = [];
        for (let n = 0; n < 3; n += 1) { const t0 = performance.now(); render(); runs.push(performance.now() - t0); }
        const t1 = performance.now();
        const made = printoutImage('month');
        return { draw: runs.sort((a, b) => a - b)[1], picture: performance.now() - t1, side: Math.max(made.width, made.height),
            cells: document.querySelectorAll('.month-board-table td.week-cell').length };
    });
    const fast = await time();
    given('the board on screen is the season\'s: forty men by October\'s 26 weekdays and two Saturdays', fast.cells === 40 * 28, String(fast.cells));
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    const slow = await time();
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    console.log(`        the board drawn: ${fast.draw.toFixed(0)} ms, ${slow.draw.toFixed(0)} ms at 4x; its picture ${slow.picture.toFixed(0)} ms at 4x (${slow.side}px)`);
    check(`the board drawn in ${fast.draw.toFixed(0)} ms - 250 at the most`, fast.draw <= 250, String(fast.draw));
    check(`and in ${slow.draw.toFixed(0)} ms at 4x CPU - 1,000 at the most`, slow.draw <= 1000, String(slow.draw));
    check(`its picture in ${slow.picture.toFixed(0)} ms at 4x CPU - 2,000 at the most - within 4,096px`, slow.picture <= 2000 && slow.side <= 4096, `${slow.picture} ${slow.side}`);
    await context.close();
}

check('no uncaught error on any page', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
server.close();
report();
