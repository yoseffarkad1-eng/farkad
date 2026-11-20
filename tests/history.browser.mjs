// «מי עבד איפה» in a real Chromium, with touch.
//
//   node tests/history.browser.mjs            HISTORY_SHOTS=<dir> leaves pictures (asserts nothing)
//
// tests/history.test.mjs holds what the dialog READS, on devices in Node. What it cannot hold
// is the glass - and the glass is where this dialog can go wrong without one number moving:
//
//  17. THE DOOR: «איפה עבד», LAST on the finder's row, at 320, 375 and 440, both schemes,
//      with the large display and without; the found man's row measured with the door and
//      without it (the door is asked through typeof, so the same page is measured both
//      ways) and «מקדמות» on the same spot either way; a tap entering the dialog at its
//      title, on him, every site, «3 החודשים האחרונים»; the first tile on the glass.
//  18. THE CHOICES: each redraws the list and leaves the focus in the field it was made in;
//      each label over its field; the line that says the choice in words; «תאריכים אחרים»
//      filled with the dates read, its guard rails, an inverted pair and a start after today
//      refused in the reports' own words over the dialog.
//  19. A DAY: opened on the day screen; a double tap one navigation, nothing under the finger
//      pressed; and with «בניית סידור» at its first station the day asks first - «ביטול»
//      moves nothing, a yes leaves the journey by its own hand, «בניית סידור» brings it back,
//      and a double tap on a day answers nothing.
//  20. THE CHUNKS on a season: 200 at a time, the focus on the first new day, never past 600.
//  21. THE TEXT: the fold, the share sheet, the wa.me link with no share sheet (and a long
//      text never put in a link), the clipboard; nothing says «נשלח».
//  22. CLOSING: Escape, the backdrop and «סגור», each handing the focus to the finder's button
//      that stands NOW; the Tab trap; midEdit().
//  23. A RECORD MOVING UNDER IT: a commit and an adopted snapshot with 600 days drawn - the
//      days and the counts follow, the place and the focused day kept; a render of a record
//      that did not move changes no node.
//  24. THE BUDGET at 4x CPU, on a season seeded in the page; the numbers printed.
//  25. THE FLOORS on every phone, scheme and mode, and at doubled text; the chosen names.
//  26. NOTHING WRITTEN but the journey's own key on the person's own yes; no uncaught error.
//
// SYNTHETIC NAMES ONLY. NOT a real phone: Chromium with emulated touch.

import { chromium } from 'playwright';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { serve } from './serve.mjs';
import { launchLocalBrowser } from './network-guard.mjs';
import { verifyServedAssets, expectedShaFor } from './treecheck.mjs';
import { suite, check, same, given, report } from './runner.mjs';
import { censusOnly } from './census.mjs';
import { PHONES, SCHEMES, TODAY, SCREENS, openApp, measureInPage } from './screens.mjs';

const root = new URL('..', import.meta.url).pathname;
const server = await serve(root);
check('the browser is served the named tree', (await verifyServedAssets(server.url, root, expectedShaFor(root))).ok);
const browser = await launchLocalBrowser(chromium, { executablePath: process.env.CHROME_PATH });
const errors = [];
// The one error the test page itself makes (criterion 19 says why), and the list the midnight
// walk's pages hand theirs to - kept apart from every other page's, and read at the very end.
const BLOCKED_WORKER = "Cannot read properties of undefined (reading 'update')";
const midnightErrors = [];
const SHOTS = process.env.HISTORY_SHOTS || '';
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const plain = text => String(text).replace(/[⁦-⁩‎]/g, '');
// Without the service worker's census of open builds (tests/census.mjs says why).
const disk = page => page.evaluate(() => JSON.stringify(Object.keys(localStorage).sort()
    .filter(key => key !== 'farkad:openBuilds').map(key => [key, localStorage.getItem(key)])));
const record = page => page.evaluate(() => JSON.stringify(State.schedule));
// The keys whose bytes differ between two disk readings - added, removed or changed.
const moved = (then, now) => {
    const a = new Map(JSON.parse(then));
    const b = new Map(JSON.parse(now));
    return [...new Set([...a.keys(), ...b.keys()])].filter(name => a.get(name) !== b.get(name)).sort();
};
const isOpen = page => page.evaluate(() => document.getElementById('historyModal').style.display === 'flex');
const pause = (page, ms = 300) => page.waitForTimeout(ms);
// THE PAGE'S OWN ACCOUNT OF EVERY TAP. Put on each phone before any script of the app runs (the
// context's init script), so its listeners are the first on the window: they hear every press,
// release and click before anything of the page can stop one - what each came down on, in the
// order the page got them. They read and prevent nothing (passive). The way in (tapOpens, below)
// asks it what became of a tap that opened nothing.
const TAP_LOG = () => {
    window.__tapLog = [];
    const named = target => {
        const node = target && target.closest
            ? target.closest('button, a, input, select, textarea, label, [role="button"]') || target : target;
        if (!node || !node.nodeName) return String(node);
        if (node.id) return `#${node.id}`;
        if (node.dataset && node.dataset.findDoor) {
            const row = node.closest('[data-worker-id]');
            return `the ${node.dataset.findDoor} door of ${row ? row.dataset.workerId : '?'}`;
        }
        const kind = typeof node.className === 'string' ? node.className.trim().split(/\s+/)[0] : '';
        return node.nodeName.toLowerCase() + (kind ? `.${kind}` : '');
    };
    for (const type of ['pointerdown', 'pointerup', 'pointercancel', 'touchstart', 'touchend', 'touchcancel', 'click', 'contextmenu']) {
        window.addEventListener(type, event => window.__tapLog.push({ type, on: named(event.target), event }), { capture: true, passive: true });
    }
};
const phone = async (width, height, scheme, large, seeded = true, sink = errors) => {
    const opened = await openApp(browser, server.url, { width, height, scheme, large, seeded,
        before: context => context.addInitScript(TAP_LOG) });
    opened.page.on('pageerror', error => sink.push(error.message));
    return opened;
};
const home = page => page.evaluate(() => {
    if (document.getElementById('askModal').style.display === 'flex') askCancel();
    if (typeof closeHistory === 'function') closeHistory();
    if (typeof closeFind === 'function') closeFind();
    State.date = todayStr();
    showView('day');
    window.scrollTo(0, 0);
});
// The phone locked, the clock moved on, the phone unlocked - as the page sees it
// (tests/midnight.browser.mjs's own steps).
async function lockUntil(page, when) {
    await page.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
        document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.clock.setSystemTime(new Date(when));
    await page.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
        document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForTimeout(150);
}
// A TAP THAT OPENS A DIALOG - READ, NEVER PRESUMED. Round 1 tapped, waited 300 ms and tapped the
// next thing, so a tap that opened nothing came to light as the NEXT tap's thirty-second timeout,
// and ended the run: the verification of e90616d, at a load of 8-10 on four processors - one tap on
// «חיפוש עובד» in the floors' last cell opened no finder, and 69 checks were never made. Now:
//  - the page is let run what it has asked to do before the tap - two of its own frames and a task,
//    where a scroll's redraws and the bars' measuring fall - so that the finger comes down on the
//    screen as it stands, as a person's does;
//  - the dialog is waited for; once it is open, the tap has done its work;
//  - when it is not, the page's own account of the tap (TAP_LOG) says what became of it. A click
//    the page got, wherever it came down, and a touch something on the page prevented, are the
//    page's: a check fails, naming them, every dialog the tap opened instead is shut, and this one
//    is opened by code - so that the rest of the cell is still measured. A tap the page got no
//    click of, with nothing preventing one, is a touch the browser made nothing of (a loaded
//    machine): the app never had it, so it is taken again, as a person would take it, and said in
//    the log - and a third such tap in a row is a failure too.
// One tap lost fails one check, or none: it never ends the run. `judge` is where the outcome is
// told - the runner's check, or (the way in's own suite) a list.
const WAY_IN_WAIT = 5000;
async function tapOpens(page, selector, opened, what, byCode, judge) {
    const lost = [];
    let came = null;
    let thrown = '';
    for (let attempt = 1; attempt <= 3; attempt += 1) {
        await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(done, 0)))));
        const from = await page.evaluate(() => window.__tapLog.length);
        thrown = '';
        await page.locator(selector).tap().catch(error => { thrown = String(error.message).split('\n')[0]; });
        if (!thrown) {
            await page.waitForFunction(([from, opened]) => Boolean((0, eval)(opened)) || window.__tapLog.slice(from).some(tap => tap.type === 'click'),
                [from, opened], { timeout: WAY_IN_WAIT }).catch(() => null);
        }
        came = await page.evaluate(([from, opened]) => {
            const taps = window.__tapLog.slice(from);
            return { open: Boolean((0, eval)(opened)), taps: taps.map(tap => `${tap.type} on ${tap.on}`),
                clicked: taps.filter(tap => tap.type === 'click').map(tap => tap.on),
                prevented: taps.filter(tap => (tap.type === 'pointerdown' || tap.type === 'touchstart') && tap.event.defaultPrevented).map(tap => tap.type),
                up: [...document.querySelectorAll('.modal')].filter(node => node.style.display === 'flex').map(node => node.id) };
        }, [from, opened]);
        if (came.open || thrown || came.clicked.length || came.prevented.length) break;
        // No click, and nothing of the page in the way of one: the touch the browser made nothing of.
        lost.push(came.taps);
        console.log(`      ${what}: the page got no click of tap ${attempt} (${came.taps.join(', ') || 'nothing at all'})${attempt < 3 ? ' - it is taken again' : ''}`);
    }
    const told = lost.length ? `after ${lost.length} tap${lost.length === 1 ? '' : 's'} the page got no click of: ${JSON.stringify(lost)}` : '';
    const why = came.open ? '' : thrown ? `the tap itself failed: ${thrown}`
        : came.clicked.length ? `the page got a click on ${came.clicked.join(', ')} and opened nothing`
            : came.prevented.length ? `the touch was prevented (${came.prevented.join(', ')})` : 'three taps in a row and the page got no click of any';
    judge(`${what} opened under a finger's tap`, came.open,
        came.open ? told : `${why}; up: ${JSON.stringify(came.up)}; the tap: ${JSON.stringify(came.taps)}${told ? `; ${told}` : ''}`);
    if (came.open) return;
    // Whatever the tap opened instead is shut, and this one opened by code: the cell goes on.
    await page.evaluate(() => Object.keys(MODAL_CLOSERS).forEach(id => {
        const node = document.getElementById(id);
        if (node && node.style.display === 'flex') MODAL_CLOSERS[id]();
    }));
    await page.evaluate(byCode[0], byCode[1]);
}
// The finder, then «איפה עבד» on a man - by a finger, as a person goes: each tap read as above, and
// the next made no sooner than a person's pace after it (the page's own rule spends a press that
// comes down where the last one did less than WALK_BOUNCE_MS after it, js/ui/sheet.js).
async function throughTheDoor(page, workerId, judge = check) {
    await page.evaluate(() => { window.scrollTo(0, document.documentElement.scrollHeight); });
    const door = `#findList [data-worker-id="${workerId}"] [data-find-door="history"]`;
    await tapOpens(page, '#findEntry', `findIsOpen() && Boolean(document.querySelector('${door.replace(/'/g, "\\'")}'))`,
        `«חיפוש עובד» - the finder, with «איפה עבד» on ${workerId}`, [() => openFind(), null], judge);
    await pause(page, 350);
    await tapOpens(page, door, "document.getElementById('historyModal').style.display === 'flex'",
        `«איפה עבד» on ${workerId} - the dialog`, [id => findGo('history', id), workerId], judge);
    await pause(page, 350);
}
// A choice as a person makes it: the field is reached first - a tap on a select focuses it,
// and Playwright's selectOption alone does not - so that a redraw taking the focus away
// from it is seen.
const choose = async (page, id, value) => { await page.focus(`#${id}`); await page.selectOption(`#${id}`, value); await pause(page, 250); };
// What is on the glass, not what an attribute says: a rule of the layer can show a node its
// `hidden` asks to be shut (the fold's body did, before this suite first ran).
const painted = (page, id) => page.evaluate(id => document.getElementById(id).getClientRects().length > 0, id);

// A SEASON, seeded in the page (tests/removepace.browser.mjs's way): 40 men, 6 sites, every
// day from 20 November 2025 to today but the Saturdays, Rima at p_1, יוסף גבס at p_2.
function seedSeason() {
    const today = todayStr();
    let seed = 20261119;
    const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    State.schedule.workers = Array.from({ length: 40 }, (_, i) => ({ id: 'w_' + String(i + 1).padStart(2, '0'),
        name: 'דוגמה ' + (i + 1), active: i < 39, dailyRate: 380 + 10 * (i % 6), hourlyRate: 50 }));
    State.schedule.places = Array.from({ length: 6 }, (_, i) => ({ id: 'p_' + (i + 1), name: 'אתר ' + (i + 1), active: i < 5 }));
    State.save();
    let days = 0;
    for (const day = new Date('2025-11-20T12:00:00'); toLocalDateStr(day) <= today; day.setDate(day.getDate() + 1)) {
        if (day.getDay() === 6) continue;
        const date = toLocalDateStr(day);
        days += 1;
        State.schedule.workers.forEach((worker, n) => {
            if (rand() > 0.85) return;
            if (rand() < 0.02) { markAbsent(State.schedule, date, worker.id, 'actual'); return; }
            const home = 'p_' + (1 + (n % 6));
            const r = rand();
            if (r < 0.03) assignPlace(State.schedule, date, worker.id, 'actual', home, 'double');
            else if (r < 0.08) assignPlace(State.schedule, date, worker.id, 'actual', home, 'extra', 2);
            else assignPlace(State.schedule, date, worker.id, 'actual', home);
            if (rand() < 0.05) assignPlace(State.schedule, date, worker.id, 'actual', 'p_' + (1 + ((n + 3) % 6)));
        });
        if (rand() < 0.4) setRimaCount(State.schedule, date, 'p_1', 2);
        if (rand() < 0.3) setYosefGevesCount(State.schedule, date, 'p_2', 2);
    }
    State.save();
    State.date = today;
    showView('day');
    return { days, bytes: JSON.stringify(State.schedule).length };
}

// Painted: the action, then the next frame, then the task after it - and what was drawn by
// then, so that a number is never the time of nothing: the checks of criterion 24 hold each
// step to the rows and the line it was meant to draw. `sync` is the action itself.
const timed = (page, code) => page.evaluate(code => new Promise(resolve => {
    const began = performance.now();
    (0, eval)(code);
    const sync = performance.now() - began;
    requestAnimationFrame(() => setTimeout(() => {
        const rows = [...document.querySelectorAll('#historyList .history-row')];
        resolve({ ms: Math.round(performance.now() - began), sync: Math.round(sync), rows: rows.length,
            first: rows.length ? rows[0].dataset.historyKey : '', open: document.getElementById('historyModal').style.display,
            line: document.getElementById('historyRangeNow').textContent.replace(/[\u2066-\u2069]/g, ''),
            labels: rows.slice(0, 40).map(row => row.getAttribute('aria-label').replace(/[\u2066-\u2069]/g, '')) });
    }, 0));
}), code);

// Twice the text size, the way tests/mobile.test.mjs makes it (doubleEveryFontSize): every
// font-size of every same-origin sheet said again at twice its value, last and important.
const doubleEveryFontSize = page => page.evaluate(() => {
    const out = [];
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
    out.unshift('html{font-size:32px !important;}');
    const style = document.createElement('style');
    style.id = 'ax2-cascade';
    style.textContent = out.join('\n');
    document.head.appendChild(style);
    return out.length;
});

const shot = async (page, name) => {
    if (!SHOTS) return;
    await page.screenshot({ path: join(SHOTS, `history-${name}.jpg`), type: 'jpeg', quality: 80 });
};

try {
    // ============================================================ 17. the door
    const rows = [];
    for (const [width, height] of PHONES) {
        for (const scheme of SCHEMES) {
            for (const large of [false, true]) {
                const tag = `${width}x${height} ${scheme}${large ? ', large display' : ''}`;
                suite(`17. the door - ${tag}`);
                const { context, page } = await phone(width, height, scheme, large);
                await home(page);
                await page.evaluate(() => openFind());
                await pause(page);
                const measureRow = () => page.evaluate(() => {
                    const row = document.querySelector('#findList [data-worker-id="w02"]');
                    const top = row.getBoundingClientRect().top;
                    const advances = row.querySelector('[data-find-door="advances"]').getBoundingClientRect();
                    const door = row.querySelector('[data-find-door="history"]');
                    const box = door ? door.getBoundingClientRect() : null;
                    return { row: Math.round(row.getBoundingClientRect().height),
                        advances: [Math.round(advances.left), Math.round(advances.top - top)],
                        door: door ? { w: box.width, h: box.height, words: door.textContent, label: plainText(door.getAttribute('aria-label')),
                            cut: door.scrollWidth > door.clientWidth + 1 || box.right > innerWidth + 1 || box.left < -1,
                            last: door === row.querySelector('.find-doors').lastElementChild } : null };
                    function plainText(text) { return String(text).replace(/[⁦-⁩]/g, ''); }
                });
                const withDoor = await measureRow();
                await page.evaluate(() => { window.__openHistory = openHistory; window.openHistory = undefined; renderFind(); });
                const without = await measureRow();
                await page.evaluate(() => { window.openHistory = window.__openHistory; renderFind(); });
                rows.push([tag, without.row, withDoor.row]);
                console.log(`      ${tag}: the found man's row ${without.row}px without the door, ${withDoor.row}px with it (${withDoor.row - without.row >= 0 ? '+' : ''}${withDoor.row - without.row})`);
                check(`${tag}: the door is the last on his row, «איפה עבד», named for him, its words whole`,
                    withDoor.door && withDoor.door.last && withDoor.door.words === 'איפה עבד'
                    && withDoor.door.label === 'איפה עבד · עלי חסן' && !withDoor.door.cut, JSON.stringify(withDoor.door));
                check(`${tag}: and a finger's size - ${large ? '52 x 52' : '48 tall, 44 wide'} at the least`,
                    large ? withDoor.door.w >= 51.5 && withDoor.door.h >= 51.5 : withDoor.door.w >= 44 && withDoor.door.h >= 47.5,
                    `${withDoor.door.w}x${withDoor.door.h}`);
                same(`${tag}: «מקדמות» stands on the same spot with the door and without it`, withDoor.advances, without.advances);
                check(`${tag}: the door costs his row at most one more line of doors${width === 320 && !large ? ' - here nothing' : ''}`,
                    width === 320 && !large ? withDoor.row === without.row : withDoor.row - without.row <= 80, `${without.row} -> ${withDoor.row}`);
                same(`${tag}: and without the file's door the row has its three, as on the base`,
                    await page.evaluate(() => { window.openHistory = undefined; renderFind();
                        const words = [...document.querySelectorAll('#findList [data-worker-id="w02"] .find-door')].map(node => node.textContent);
                        window.openHistory = window.__openHistory; renderFind(); return words; }),
                    ['כרטיס עובד', 'שיבוץ להיום', 'מקדמות']);
                if (SHOTS && ((width === 375 && height === 667) || width === 440) && scheme === 'light' && !large) {
                    await page.evaluate(() => { document.getElementById('findList').scrollTop = 0; });
                    await shot(page, `finder-${width}x${height}-with-door`);
                    await page.evaluate(() => { window.openHistory = undefined; renderFind(); document.getElementById('findList').scrollTop = 0; });
                    await shot(page, `finder-${width}x${height}-without-door`);
                    await page.evaluate(() => { window.openHistory = window.__openHistory; renderFind(); });
                }
                // A tap opens it - read as every way in is (tapOpens): a tap that opened nothing fails a check
                // here, and the cell is still measured, where it threw at the tiles below and ended the run.
                await tapOpens(page, '#findList [data-worker-id="w02"] [data-find-door="history"]',
                    "document.getElementById('historyModal').style.display === 'flex'", `${tag}: «איפה עבד» on w02 - the dialog`,
                    [id => findGo('history', id), 'w02'], check);
                await pause(page, 400);
                same(`${tag}: a tap shuts the finder and opens the dialog on him, every site, «3 החודשים האחרונים», entered at its title`,
                    await page.evaluate(() => [document.getElementById('findModal').style.display, document.getElementById('historyModal').style.display,
                        document.activeElement.id, HISTORY.workerId, HISTORY.placeId, HISTORY.range]),
                    ['none', 'flex', 'historyTitle', 'w02', null, 'last3']);
                const tiles = await page.evaluate(() => {
                    const scroll = document.getElementById('historyScroll').getBoundingClientRect();
                    const glass = Math.min(scroll.bottom, innerHeight);
                    const all = [...document.querySelectorAll('#historyTotals .history-tile')].map(node => node.getBoundingClientRect());
                    return { count: all.length, first: all[0].bottom <= glass + 1, whole: all.every(box => box.bottom <= glass + 1),
                        firstBottom: Math.round(all[0].bottom), lastBottom: Math.round(all[all.length - 1].bottom), glass: Math.round(glass),
                        columns: all.filter(box => Math.abs(box.top - all[0].top) < 1).length };
                });
                console.log(`      ${tag}: the tiles - ${tiles.count}, ${tiles.columns} a line; the first ends at ${tiles.firstBottom}, the last at ${tiles.lastBottom}, the glass at ${tiles.glass}`);
                if (!(width === 320 && large)) check(`${tag}: as it opens, the first tile is on the glass`, tiles.first, JSON.stringify(tiles));
                if ((width === 375 && !large) || width === 440) check(`${tag}: and the whole block of tiles`, tiles.whole, JSON.stringify(tiles));
                // MOVED ON PURPOSE (fix round 1): a track is never narrower than a five-figure count in
                // the figure's size and the tile's padding (css/design.css), so with the large display
                // three to a line at 375 left a count of a year of forty men less than its padding -
                // there it is two. Elsewhere, as before.
                same(`${tag}: two tiles a line at 320, three from 375 - and two at 375 with the large display - by the grid alone`,
                    tiles.columns, width === 320 || (width === 375 && large) ? 2 : 3);
                // And 375x667 as it opens: the owner's question of what the first glass holds (the review
                // of round 1 - no day on it at 375 and 320).
                if (SHOTS && ((width === 440 && scheme === 'dark' && !large) || (width === 320 && large && scheme === 'dark')
                    || (width === 375 && scheme === 'light' && !large))) {
                    await shot(page, `${width}x${height}-${scheme}${large ? '-large' : ''}-one-man`);
                }
                await context.close();
            }
        }
    }
    console.log('      the found man\'s row (without the door -> with it):');
    rows.forEach(([tag, without, withDoor]) => console.log(`        ${tag.padEnd(34)} ${String(without).padStart(4)} -> ${String(withDoor).padStart(4)}`));

    // ============================================================ 18, 19, 21: one phone
    {
        const { context, page } = await phone(375, 667, 'light', false);
        await home(page);
        const before = await disk(page);
        await censusOnly(check, page, before);
        const kept = await record(page);

        suite('18. the choices: the list follows, the focus stays, the line says the choice whole');
        await throughTheDoor(page, 'w02');
        given('it is open on עלי חסן', await isOpen(page));
        // Read as words: the isolates and the word joiner out, and the no-break spaces that hold the
        // range as one word (historyRangeWhole) read as the spaces they are drawn as - criterion
        // 25 holds them.
        const line = () => page.evaluate(() => document.getElementById('historyRangeNow').textContent.replace(/[⁦-⁩\u2060]/g, '').replace(/\u00a0/g, ' '));
        same('the line under the three fields says the man, every site and the dates read', await line(),
            'עלי חסן · כל האתרים · 01/09/2026 - 10/11/2026');
        same('each label stands over its field', await page.evaluate(() => ['historyMan', 'historySite', 'historyRange'].map(id => {
            const field = document.getElementById(id).getBoundingClientRect();
            const label = document.getElementById(`${id}Label`).getBoundingClientRect();
            return label.bottom <= field.top + 1 && label.width > 0;
        })), [true, true, true]);
        const firstRows = () => page.evaluate(() => [...document.querySelectorAll('#historyList .history-row')].slice(0, 3)
            .map(row => row.dataset.historyKey));
        const one = await firstRows();
        await choose(page, 'historyMan', '');
        same('«כל העובדים»: the list is everyone\'s now, and the focus is in the field it was chosen in',
            [await page.evaluate(() => document.activeElement.id), (await firstRows()).some(key => !key.endsWith(':w02')),
                await page.evaluate(() => document.querySelectorAll('#historyList .history-name').length > 0), await line()],
            ['historyMan', true, true, 'כל העובדים · כל האתרים · 01/09/2026 - 10/11/2026']);
        await choose(page, 'historySite', 'p3');
        same('a site: its days only, the focus kept, the line naming it', [await page.evaluate(() => document.activeElement.id),
            // The name, not the tag's whole text: past ten sites the tag carries the day screen's
            // diamond before it (js/ui/sitecolor.js), and this seed's ids give p3 one.
            await page.evaluate(() => { const tags = [...document.querySelectorAll('#historyList .history-row .tag-place')];
                return tags.length > 0 && tags.every(tag => tag.querySelector('.site-name').textContent === 'רמת גן'); }),
            await line()], ['historySite', true, 'כל העובדים · רמת גן · 01/09/2026 - 10/11/2026']);
        await choose(page, 'historyRange', 'thisMonth');
        same('a range: the focus kept, the line saying the dates', [await page.evaluate(() => document.activeElement.id), await line()],
            ['historyRange', 'כל העובדים · רמת גן · 01/11/2026 - 10/11/2026']);
        await choose(page, 'historySite', '');
        await choose(page, 'historyMan', 'w02');
        await choose(page, 'historyRange', 'last3');
        same('and back to him and the range it opened on, the same days as when it opened', await firstRows(), one);
        await choose(page, 'historyRange', 'custom');
        const fields = await page.evaluate(() => {
            const from = document.getElementById('historyFrom');
            const to = document.getElementById('historyTo');
            return { shown: document.getElementById('historyDates').getClientRects().length > 0, from: from.value, to: to.value, fromMax: from.max, toMin: to.min,
                toMax: to.max, size: parseFloat(getComputedStyle(from).fontSize), high: Math.round(from.getBoundingClientRect().height) };
        });
        same('«תאריכים אחרים» shows two fields filled with the dates the range before it read - never a day after today',
            [fields.shown, fields.from, fields.to, fields.fromMax, fields.toMin, fields.toMax], [true, '2026-09-01', TODAY, TODAY, '2026-09-01', TODAY]);
        check('16px, so iOS does not zoom, and 48px tall', fields.size >= 16 && fields.high >= 48, JSON.stringify(fields));
        await page.fill('#historyTo', '2026-11-05');
        await page.dispatchEvent('#historyTo', 'change');
        await pause(page);
        same('a new end is read, and the line says it', await line(), 'עלי חסן · כל האתרים · 01/09/2026 - 05/11/2026');
        await page.fill('#historyFrom', '2026-11-08');
        await page.dispatchEvent('#historyFrom', 'change');
        await pause(page);
        const refused = () => page.evaluate(() => [document.getElementById('askModal').style.display, document.getElementById('historyModal').style.display,
            document.getElementById('askTitle').textContent, document.getElementById('askMessage').textContent,
            document.getElementById('historyFrom').value, document.getElementById('historyTo').value]);
        same('a start after the end is refused in the reports\' own words, over the dialog, and the field put back', await refused(),
            ['flex', 'flex', 'הטווח הפוך', 'תאריך ההתחלה מאוחר מתאריך הסיום, ולכן הוא לא שונה. בחר קודם את תאריך ההתחלה ואז את הסיום.',
                '2026-09-01', '2026-11-05']);
        await page.locator('#askOk').tap();
        await pause(page);
        await page.fill('#historyTo', '2026-11-30');
        await page.dispatchEvent('#historyTo', 'change');
        await pause(page);
        same('an end after today is read as today, and written back', [await page.evaluate(() => document.getElementById('historyTo').value), await line()],
            [TODAY, 'עלי חסן · כל האתרים · 01/09/2026 - 10/11/2026']);
        await page.fill('#historyFrom', '2026-11-20');
        await page.dispatchEvent('#historyFrom', 'change');
        await pause(page);
        same('and a start after today is refused the same way', await refused(),
            ['flex', 'flex', 'הטווח הפוך', 'תאריך ההתחלה מאוחר מתאריך הסיום, ולכן הוא לא שונה. בחר קודם את תאריך ההתחלה ואז את הסיום.',
                '2026-09-01', TODAY]);
        await page.locator('#askOk').tap();
        await pause(page);
        await choose(page, 'historyRange', 'thisMonth');
        same('another range puts the two date fields away - off the glass, not only by their attribute', await painted(page, 'historyDates'), false);

        suite('21. the text: shown first, then the share sheet, the link or the clipboard; nothing says «נשלח»');
        await page.evaluate(() => {
            window.__built = 0;
            const real = historyText;
            window.historyText = function () { window.__built += 1; return real.apply(this, arguments); };
            window.__shared = [];
            window.__opened = [];
            window.__copied = [];
            Object.defineProperty(navigator, 'share', { configurable: true, value: data => { window.__shared.push(data.text); return Promise.resolve(); } });
            Object.defineProperty(navigator, 'clipboard', { configurable: true,
                value: { writeText: text => { window.__copied.push(text); return Promise.resolve(); } } });
            window.open = (...args) => { window.__opened.push(args); return null; };
        });
        same('the fold is shut: no text, the doors inside it out of reach', await page.evaluate(() => [
            document.getElementById('historyFoldLabel').getAttribute('aria-expanded'), document.getElementById('historyFoldBody').hidden,
            ['historyFoldBody', 'historyText', 'historySend', 'historyCopy'].map(id => document.getElementById(id).getClientRects().length),
            document.getElementById('historyText').value, window.__built]), ['false', true, [0, 0, 0, 0], '', 0]);
        // A DOUBLE TAP on the fold opens it, once: its button stays the same node, which the page's
        // own rule leaves to the surface (js/ui/sheet.js), and the second tap used to shut it again.
        // A person scrolls to the button first, and so does this check - and the point it taps is
        // checked to BE the button. Aimed by its rectangle as the dialog stood (fix round 1's run
        // on 71e8303), both taps came down under the scroll box's edge, on the dialog's own padding:
        // the button's middle was at 644 and the box ended at 638, so the check read «shut» on round
        // 1 and on the repair alike and said nothing about either.
        await page.evaluate(() => document.getElementById('historyFoldLabel').scrollIntoView({ block: 'center' }));
        await pause(page, 150);
        const foldAt = await page.evaluate(() => {
            const fold = document.getElementById('historyFoldLabel');
            const box = fold.getBoundingClientRect();
            const x = box.left + box.width / 2;
            const y = box.top + box.height / 2;
            return { x, y, hit: document.elementFromPoint(x, y) === fold };
        });
        check('the point the double tap comes down on is the fold\'s button, on the glass', foldAt.hit, JSON.stringify(foldAt));
        await page.touchscreen.tap(foldAt.x, foldAt.y);
        await page.waitForTimeout(90);
        await page.touchscreen.tap(foldAt.x, foldAt.y);
        await pause(page);
        same('a double tap on «הרשימה כטקסט» opens the fold and leaves it open - one tap, not two',
            await page.evaluate(() => [document.getElementById('historyFoldLabel').getAttribute('aria-expanded'), HISTORY.textOpen,
                document.getElementById('historyFoldBody').getClientRects().length > 0]), ['true', true, true]);
        // Where it did not (round 1 shut it again), one more tap opens it, so that the walk below is
        // still made and says what it finds.
        if (!(await painted(page, 'historyFoldBody'))) { await page.locator('#historyFoldLabel').tap(); await pause(page); }
        same('opened, the field holds the text the facts hold, built at that moment',
            await page.evaluate(() => [document.getElementById('historyFoldLabel').getAttribute('aria-expanded'),
                document.getElementById('historyText').value === historyText(historyFacts()), window.__built > 0,
                document.getElementById('historyText').value.split('\n')[0].replace(/[⁦-⁩]/g, '')]),
            ['true', true, true, '📄 עלי חסן · כל האתרים']);
        await page.locator('#historySend').tap();
        await pause(page);
        same('«💬 שלח בוואטסאפ» hands that text to the share sheet, and the dialog stays',
            await page.evaluate(() => [window.__shared.length, window.__shared[0] === document.getElementById('historyText').value,
                document.getElementById('historyModal').style.display]), [1, true, 'flex']);
        await page.evaluate(() => { Object.defineProperty(navigator, 'share', { configurable: true, value: undefined }); });
        await page.locator('#historySend').tap();
        await pause(page);
        same('with no share sheet, a short text opens the wa.me link once, with the text in it',
            await page.evaluate(() => [window.__opened.length, window.__opened[0][0] === `https://wa.me/?text=${encodeURIComponent(document.getElementById('historyText').value)}`,
                encodeURIComponent(document.getElementById('historyText').value).length <= 8000]), [1, true, true]);
        await choose(page, 'historyMan', '');
        await choose(page, 'historyRange', 'thisYear');
        await page.locator('#historySend').tap();
        await pause(page);
        const refusal = () => page.evaluate(() => {
            const field = document.getElementById('historyText');
            const status = document.getElementById('historyStatus');
            const box = status.getBoundingClientRect();
            const scroll = document.getElementById('historyScroll').getBoundingClientRect();
            return [window.__opened.length, encodeURIComponent(field.value).length > 8000, document.activeElement === field,
                field.selectionStart === 0 && field.selectionEnd === field.value.length, status.textContent,
                box.height > 0 && box.top >= scroll.top - 1 && box.bottom <= Math.min(scroll.bottom, innerHeight) + 1,
                parseFloat(getComputedStyle(status).fontSize) >= 16];
        });
        const refusedLine = [1, true, true, true, '⚠️ הרשימה ארוכה מדי לקישור של וואטסאפ - השתמש בהעתק ושלח ידנית', true, true];
        same('a long one - a year of everyone - is put in no link: the field selected, the line saying to copy it ON THE GLASS, at 16px',
            await refusal(), refusedLine);
        // Not a sentence that goes by itself: it stays until the next door, choice or fold.
        await page.clock.fastForward(7000);
        await pause(page, 100);
        same('and seven seconds later it is still there, on the glass', await refusal(), refusedLine);
        await page.locator('#historyCopy').tap();
        await pause(page);
        same('«העתק» puts the text on the clipboard and says so, at the dialog\'s 16px; the dialog stays', await page.evaluate(() => [window.__copied.length,
            window.__copied[0] === document.getElementById('historyText').value, document.getElementById('historyStatus').textContent,
            parseFloat(getComputedStyle(document.getElementById('historyStatus')).fontSize),
            document.getElementById('historyModal').style.display]), [1, true, '✔️ הועתק', 16, 'flex']);
        check('nothing on the dialog says «נשלח»', await page.evaluate(() => document.getElementById('historyModal').textContent.indexOf('נשלח') === -1
            && document.getElementById('historyText').value.indexOf('נשלח') === -1));
        await page.locator('#historyFoldLabel').tap();
        await pause(page);
        same('shut again, the text is let go', await page.evaluate(() => [document.getElementById('historyFoldBody').hidden,
            document.getElementById('historyText').value]), [true, '']);

        suite('19. a day opens on the day screen; a double tap is one navigation');
        await choose(page, 'historyMan', 'w02');
        await choose(page, 'historyRange', 'last3');
        const target = await page.evaluate(() => {
            const row = document.querySelectorAll('#historyList .history-row')[1];
            row.scrollIntoView({ block: 'center' });
            const box = row.getBoundingClientRect();
            return { date: row.dataset.date, key: row.dataset.historyKey, x: box.left + box.width / 2, y: box.top + box.height / 2 };
        });
        await pause(page, 150);
        const atRest = await disk(page);
        await page.touchscreen.tap(target.x, target.y);
        await page.waitForTimeout(90);
        await page.touchscreen.tap(target.x, target.y);
        await pause(page, 500);
        same('a double tap on a day: the dialog shut, the day screen on that date - once, and nothing under the finger pressed',
            await page.evaluate(() => [document.getElementById('historyModal').style.display, currentView, State.date,
                [...document.querySelectorAll('.modal')].filter(node => node.style.display === 'flex').map(node => node.id),
                document.getElementById('assignSheet').style.display === 'flex']),
            ['none', 'day', target.date, [], false]);
        check('and nothing was written by it', await disk(page) === atRest);

        suite('19. with «בניית סידור» at its first station, a day asks first');
        await home(page);
        await page.evaluate(() => journeyStart());
        await pause(page, 400);
        const journey = await page.evaluate(() => [journeyStation(), journeyDate(), State.date]);
        given('a journey for tomorrow is open at its first station, the day screen on its date', journey[0] === 1 && journey[1] === journey[2],
            JSON.stringify(journey));
        const evening = await disk(page);
        const key = await page.evaluate(() => localStorage.getItem('farkadSederJourney'));
        await throughTheDoor(page, 'w02');
        given('the dialog opened from the finder at the day\'s foot', await isOpen(page));
        const asking = await page.evaluate(() => {
            const row = document.querySelectorAll('#historyList .history-row')[0];
            const box = row.getBoundingClientRect();
            return { date: row.dataset.date, key: row.dataset.historyKey, x: box.left + box.width / 2, y: box.top + box.height / 2 };
        });
        await page.touchscreen.tap(asking.x, asking.y);
        await pause(page, 400);
        const named = date => { const [y, m, d] = date.split('-').map(Number); const at = new Date(y, m - 1, d, 12);
            return `יום ${['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'][at.getDay()]} ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`; };
        same('the tap asks, over the dialog, in the block\'s words - the day and the journey\'s day named',
            await page.evaluate(() => [document.getElementById('askModal').style.display, document.getElementById('historyModal').style.display,
                document.getElementById('askTitle').textContent, document.getElementById('askMessage').textContent,
                document.getElementById('askOk').textContent, document.getElementById('askCancel').textContent]),
            ['flex', 'flex', 'לצאת מבניית הסידור?',
                `כדי לפתוח את ${named(asking.date)} צריך לצאת מבניית הסידור ל${named(journey[1])}. אפשר לחזור אליה אחר כך מ«בניית סידור».`,
                'צא ופתח את היום', 'ביטול']);
        await page.locator('#askCancel').tap();
        await pause(page, 400);
        same('«ביטול»: the dialog open, the focus back on that day, the journey, its key and the date as they were',
            [await page.evaluate(() => [document.getElementById('askModal').style.display, document.getElementById('historyModal').style.display,
                document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.historyKey : null,
                journeyStation(), journeyDate(), State.date, localStorage.getItem('farkadSederJourney')]), await disk(page) === evening],
            [['none', 'flex', asking.key, 1, journey[1], journey[2], key], true]);
        // The page runs on Playwright's clock (tests/screens.mjs), so the time is the page's.
        const yesAt = await page.evaluate(() => Date.now());
        await page.touchscreen.tap(asking.x, asking.y);
        await pause(page, 400);
        await page.locator('#askOk').tap();
        await pause(page, 500);
        const left = await page.evaluate(() => [currentView, State.date, journeyStation(), document.getElementById('historyModal').style.display,
            document.body.classList.contains('journey-on'), JSON.parse(localStorage.getItem('farkadSederJourney'))]);
        same('a yes: the day screen on that day, no journey drawn, the dialog shut', left.slice(0, 5), ['day', asking.date, 0, 'none', false]);
        const was = JSON.parse(key);
        same('and the journey\'s key as its «יציאה» leaves it - the same date and station, shut, a fresh time',
            [left[5].version, left[5].date, left[5].station, left[5].open, left[5].at >= yesAt], [was.version, was.date, was.station, false, true]);
        same('the one key that moved is the journey\'s', moved(evening, await disk(page)), ['farkadSederJourney']);
        await page.locator('#journeyDockBtn').tap();
        await pause(page, 500);
        same('«בניית סידור» in the dock brings the journey back, on ITS date and station',
            await page.evaluate(() => [journeyStation(), journeyDate(), State.date]), [1, journey[1], journey[1]]);
        const again = await disk(page);
        await throughTheDoor(page, 'w02');
        await page.touchscreen.tap(asking.x, asking.y);
        await page.waitForTimeout(90);
        await page.touchscreen.tap(asking.x, asking.y);
        await pause(page, 500);
        same('a real double tap on a day with the journey open opens the question and answers NOTHING',
            [await page.evaluate(() => [document.getElementById('askModal').style.display, document.getElementById('historyModal').style.display,
                journeyStation(), journeyDate()]), await disk(page) === again],
            [['flex', 'flex', 1, journey[1]], true]);
        await page.evaluate(() => { askCancel(); });
        await pause(page);
        await page.evaluate(() => { closeHistory(); journeyLeave(); });
        await pause(page);

        suite('26. nothing written on this phone but the journey\'s own key');
        check('the record in memory is the record it was', await record(page) === kept);
        same('and on the disk every key but the journey\'s holds the bytes it held', moved(before, await disk(page))
            .filter(name => name !== 'farkadSederJourney'), []);
        await context.close();
    }

    // ============================================================ 19. across midnight
    // The day's follow waits for every open dialog (js/app.js). Left open overnight, a row of the
    // old today tapped in the morning opens the day he tapped: the close's own follow, a moment
    // later in the same turn, does not take it from him (dayChosenByHand - a day chosen by hand, as
    // the site card's day is, the review of the hotfix, R1). Shut by its «סגור» instead, no day is
    // chosen and the day follows to the morning, as it always did.
    {
        suite('19. left open across midnight: a day of the old today, tapped in the morning, is the day he gets');
        for (const how of ['a row of the old today', 'its «סגור»']) {
            const { context, page } = await phone(375, 667, 'light', false, true, midnightErrors);
            await home(page);
            await throughTheDoor(page, 'w02');
            given(`${how}: it is open on the evening of ${TODAY}`, await isOpen(page)
                && await page.evaluate(today => State.date === today, TODAY));
            // THE TEST PAGE'S OWN FAULT, SET APART. tests/screens.mjs blocks the service worker, so
            // the registration js/ui/offline.js keeps for the phone's return never came, and its
            // listener reads `update` of nothing on the return made here (tests/midnight.browser.mjs
            // allows the worker and never meets it). What the return raised is read IN THE PAGE,
            // where it is thrown, and must be that one message. And whatever these two pages raise,
            // whenever Playwright hands it over - one came after a window of 100 ms had closed on a
            // loaded machine (the run on ef85afe), and one more after the page's own count, as the
            // walk left (the run on e96492a) - goes to a list of their own, held at the very end to
            // that one message: never to the list every other page is held to nothing by.
            await page.evaluate(() => { window.__raised = []; window.addEventListener('error', event => window.__raised.push(String(event.message))); });
            await lockUntil(page, '2026-11-11T07:10:00+02:00');
            await pause(page, 100);
            const raised = await page.evaluate(() => window.__raised);
            check(`${how}: the return raised nothing but the blocked worker's own read of a registration that never came`,
                raised.every(message => message.endsWith(BLOCKED_WORKER)), JSON.stringify(raised));
            same(`${how}: unlocked in the morning with it open, the day under it is still the evening's`,
                await page.evaluate(() => [todayStr(), State.date, document.getElementById('historyModal').style.display]),
                ['2026-11-11', TODAY, 'flex']);
            if (how === 'a row of the old today') {
                await page.locator(`#historyList [data-history-key="row:${TODAY}:w02"]`).tap();
                await pause(page, 400);
                same(`${how}: tapped, the day screen is on ${TODAY}, the dialog shut - and stays there`,
                    await page.evaluate(() => [currentView, State.date, document.getElementById('historyModal').style.display]),
                    ['day', TODAY, 'none']);
            } else {
                await page.locator('#historyClose').tap();
                await pause(page, 400);
                same(`${how}: shut by it, the day follows to the morning`, await page.evaluate(() => [currentView, State.date]),
                    ['day', '2026-11-11']);
            }
            await context.close();
        }
    }

    // ============================================================ 20, 23, 22: a season
    {
        const { context, page } = await phone(375, 667, 'dark', false, false);
        const seeded = await page.evaluate(seedSeason);
        console.log(`      the season: ${seeded.days} days, ${Math.round(seeded.bytes / 1024)} KiB`);
        await pause(page, 400);
        suite('20. the chunks, on a season: 200 at a time, the focus on the first new day, never past 600');
        await throughTheDoor(page, 'w_05');
        await choose(page, 'historyMan', '');
        await choose(page, 'historyRange', 'thisYear');
        const total = await page.evaluate(() => historyFacts().rows.length);
        given('a year of everyone is many more days than the screen draws', total > 1500, String(total));
        const drawn = () => page.evaluate(() => [document.querySelectorAll('#historyList .history-row').length,
            [...document.querySelectorAll('#historyList .history-foot > *')].map(node => node.textContent)]);
        same('the first draw: 200 days, how many of how many, and «הצג עוד 200»', await drawn(),
            [200, ['לחיצה על יום פותחת אותו במסך היום.', `מוצגות 200 שורות מתוך ${total}.`, 'הצג עוד 200']]);
        const firstNew = await page.evaluate(() => { const facts = historyFacts(); return `row:${facts.rows[200].date}:${facts.rows[200].workerId}`; });
        await page.locator('#historyList .history-more').tap();
        await pause(page, 500);
        same('«הצג עוד»: 200 more under them, the focus on the first new day', [await drawn(),
            await page.evaluate(() => document.activeElement.dataset.historyKey)],
        [[400, ['לחיצה על יום פותחת אותו במסך היום.', `מוצגות 400 שורות מתוך ${total}.`, 'הצג עוד 200']], firstNew]);
        await page.locator('#historyList .history-more').tap();
        await pause(page, 500);
        // MOVED ON PURPOSE (fix round 1): «בחר תקופה קצרה יותר» - the label of the select it means -
        // for «בחר טווח קצר יותר» (tests/history.test.mjs pins the same sentence).
        same('at 600 there is no «הצג עוד» - the line says to narrow it', await drawn(),
            [600, ['לחיצה על יום פותחת אותו במסך היום.',
                `מוצגות 600 השורות החדשות ביותר מתוך ${total}. כדי לראות את השאר, בחר תקופה קצרה יותר, אתר או עובד.`]]);
        same('and the document holds exactly the days drawn', await page.evaluate(() => document.querySelectorAll('[data-history-key^="row:"]').length), 600);

        suite('23. a record moving under the open dialog, with 600 days drawn');
        const place = await page.evaluate(() => {
            const scroll = document.getElementById('historyScroll');
            const row = document.querySelectorAll('#historyList .history-row')[300];
            row.focus({ preventScroll: true });
            scroll.scrollTop = row.offsetTop - 120;
            return { top: scroll.scrollTop, key: row.dataset.historyKey };
        });
        const tilesNow = () => page.evaluate(() => [...document.querySelectorAll('#historyTotals .history-tile-value')].map(node => node.textContent));
        const counts0 = await tilesNow();
        // What the commit builds: the list's own children added, read by an observer.
        await page.evaluate(() => {
            window.__listBuilt = [];
            window.__watch = new MutationObserver(list => list.forEach(change => change.addedNodes.forEach(node =>
                window.__listBuilt.push(node.dataset && node.dataset.historyKey ? node.dataset.historyKey.split(':').slice(0, 1).concat(node.dataset.historyKey.split(':').slice(2)).join(':') : node.className))));
            window.__watch.observe(document.getElementById('historyList'), { childList: true });
        });
        await page.evaluate(() => State.commit(assignPlace(State.schedule, todayStr(), 'w_01', 'actual', 'p_4', 'double')));
        await pause(page, 600);
        const builtByCommit = await page.evaluate(() => { window.__watch.disconnect(); return window.__listBuilt; });
        same('a commit that moves one day builds that day again - not the 600 drawn', builtByCommit.filter(what => what.indexOf('row:') === 0), ['row:w_01']);
        check('and nothing else but its month\'s heading and the foot, where a count they say moved',
            builtByCommit.every(what => what === 'row:w_01' || what === 'history-month' || what === 'history-foot'), JSON.stringify(builtByCommit));
        const afterCommit = await page.evaluate(() => [document.getElementById('historyScroll').scrollTop,
            document.activeElement.dataset.historyKey, document.querySelectorAll('#historyList .history-row').length,
            [...document.querySelectorAll('#historyList .history-row')].find(row => row.dataset.historyKey === `row:${todayStr()}:w_01`).getAttribute('aria-label')]);
        same('a commit: the place kept, the focused day found again, 600 days still drawn', afterCommit.slice(0, 3), [place.top, place.key, 600]);
        check('and the day and the counts follow the record', afterCommit[3].indexOf('אתר 4') !== -1 && afterCommit[3].indexOf('יום כפול') !== -1
            && JSON.stringify(await tilesNow()) !== JSON.stringify(counts0), afterCommit[3]);
        await page.evaluate(() => {
            const raw = JSON.parse(JSON.stringify(State.schedule));
            raw.updatedAt = new Date(Date.now() + 1000).toISOString();
            raw.updatedBy = 'other-device';
            markAbsent(raw, todayStr(), 'w_02', 'actual');
            FarkadSync.receive(raw);
        });
        await pause(page, 600);
        same('an adopted snapshot from another phone: the same, and the day it changed reads as it now is',
            await page.evaluate(() => [document.getElementById('historyScroll').scrollTop, document.activeElement.dataset.historyKey,
                [...document.querySelectorAll('#historyList .history-row')].find(row => row.dataset.historyKey === `row:${todayStr()}:w_02`)
                    .getAttribute('aria-label').endsWith('נעדר')]), [place.top, place.key, true]);
        // A MOVE NO COUNT SEES, ON THE FOCUSED DAY ITSELF. A day moved to another site at the same rate
        // changes no tile, no month's count and no number of rows - the list is drawn again only
        // because the rows themselves are part of what a draw compares - and when it is the focused
        // day, its node is built anew and the focus is put back on it by its key. Neither was moved
        // by anything above: each of those moves moved a count, and none touched the focused day.
        const plainDay = skip => page.evaluate(skip => {
            const facts = historyFacts();
            const drawn = new Set([...document.querySelectorAll('#historyList .history-row')].map(row => row.dataset.historyKey));
            const fit = facts.rows.filter(row => row.kind === 'normal' && row.hours === 0 && row.sites.length === 1
                && row.date !== todayStr() && drawn.has(`row:${row.date}:${row.workerId}`) && `row:${row.date}:${row.workerId}` !== skip);
            const row = fit[Math.floor(fit.length / 2)];
            const site = Number(row.sites[0].id.slice(2));
            return { key: `row:${row.date}:${row.workerId}`, date: row.date, workerId: row.workerId, from: row.sites[0].id,
                to: 'p_' + ((site % 5) + 1) };
        }, skip || '');
        const sameRate = await plainDay();
        const nowAt = await page.evaluate(key => {
            const node = [...document.querySelectorAll('#historyList .history-row')].find(row => row.dataset.historyKey === key);
            node.focus({ preventScroll: true });
            window.__movedNode = node;
            return document.getElementById('historyScroll').scrollTop;
        }, sameRate.key);
        const counts1 = await tilesNow();
        await page.evaluate(day => State.commit(setWorkerDay(State.schedule, day.date, day.workerId, 'actual', { entries: [makeEntry(day.to)] })), sameRate);
        await pause(page, 600);
        const afterMove = await page.evaluate(day => {
            const node = [...document.querySelectorAll('#historyList .history-row')].find(row => row.dataset.historyKey === day.key);
            return [document.activeElement === node, node !== window.__movedNode, document.activeElement.dataset.historyKey,
                node.querySelector('.tag-place .site-name').textContent, document.getElementById('historyScroll').scrollTop,
                document.querySelectorAll('#historyList .history-row').length];
        }, sameRate);
        const siteName = id => `אתר ${id.slice(2)}`;
        same('a commit moving the FOCUSED day to another site at the same rate: no count moves, the day is drawn anew saying where he was, the focus back on it, the place kept',
            [JSON.stringify(await tilesNow()) === JSON.stringify(counts1)].concat(afterMove),
            [true, true, true, sameRate.key, siteName(sameRate.to), nowAt, 600]);
        // Another day than the focused one: the commit's edit of that one is still this phone's
        // own, unsent, and a snapshot adopted under it is rebased under that edit, as it must be.
        const otherDay = await plainDay(sameRate.key);
        await page.evaluate(day => {
            const raw = JSON.parse(JSON.stringify(State.schedule));
            raw.updatedAt = new Date(Date.now() + 2000).toISOString();
            raw.updatedBy = 'other-device';
            setWorkerDay(raw, day.date, day.workerId, 'actual', { entries: [makeEntry(day.to)] });
            FarkadSync.receive(raw);
        }, otherDay);
        await pause(page, 600);
        same('an adopted snapshot moving another drawn day the same way: no count moves, and that day says where he was now',
            [JSON.stringify(await tilesNow()) === JSON.stringify(counts1), await page.evaluate(key =>
                [...document.querySelectorAll('#historyList .history-row')].find(row => row.dataset.historyKey === key)
                    .querySelector('.tag-place .site-name').textContent, otherDay.key),
                await page.evaluate(() => document.activeElement.dataset.historyKey)],
            [true, siteName(otherDay.to), sameRate.key]);
        const quiet = await page.evaluate(() => new Promise(resolve => {
            let seen = 0;
            const watch = new MutationObserver(list => { seen += list.length; });
            watch.observe(document.getElementById('historyModal'), { childList: true, attributes: true, characterData: true, subtree: true });
            render();
            setTimeout(() => { watch.disconnect(); resolve(seen); }, 120);
        }));
        same('a render() on a record that did not move changes no node of the dialog', quiet, 0);

        suite('22. closing - after those redraws: the focus goes to the finder\'s button that stands now');
        same('midEdit() is true while it is open', await page.evaluate(() => midEdit()), true);
        await page.evaluate(() => { document.getElementById('historyTitle').focus(); });
        await page.keyboard.press('Shift+Tab');
        same('Shift+Tab from the title goes round to the last control - «הצג עוד», or the last day', await page.evaluate(() =>
            [document.getElementById('historyModal').contains(document.activeElement), document.activeElement.dataset.historyKey]),
        [true, (await page.evaluate(() => { const rows = document.querySelectorAll('#historyList .history-row'); return rows[rows.length - 1].dataset.historyKey; }))]);
        await page.evaluate(() => { document.getElementById('historyTitle').focus(); });
        const walk = [];
        for (let step = 0; step < 6; step += 1) {
            await page.keyboard.press('Tab');
            walk.push(await page.evaluate(() => document.activeElement.id || document.activeElement.dataset.historyKey.slice(0, 4)));
        }
        same('Tab walks the head, the choices, the fold, then the days - and stays inside', walk,
            ['historyClose', 'historyMan', 'historySite', 'historyRange', 'historyFoldLabel', 'row:']);
        const oldEntry = await page.evaluate(() => { window.__entry = document.getElementById('findEntry'); render(); return window.__entry !== document.getElementById('findEntry'); });
        given('a render replaced the day - and the finder\'s button with it', oldEntry);
        await page.keyboard.press('Escape');
        await pause(page, 300);
        same('Escape shuts it, and the focus is on the finder\'s button that stands now - never on nothing',
            await page.evaluate(() => [document.getElementById('historyModal').style.display, document.activeElement === document.getElementById('findEntry'),
                document.activeElement === document.body, midEdit()]), ['none', true, false, false]);
        await throughTheDoor(page, 'w_05');
        await page.evaluate(() => render());
        await page.mouse.click(3, 420);
        await pause(page, 300);
        same('a tap on the backdrop shuts it the same way', await page.evaluate(() => [document.getElementById('historyModal').style.display,
            document.activeElement === document.getElementById('findEntry')]), ['none', true]);
        await throughTheDoor(page, 'w_05');
        await page.evaluate(() => render());
        await page.locator('#historyClose').tap();
        await pause(page, 300);
        same('and so does its «סגור»', await page.evaluate(() => [document.getElementById('historyModal').style.display,
            document.activeElement === document.getElementById('findEntry')]), ['none', true]);
        await context.close();
    }

    // ============================================================ 24. the budget at 4x
    {
        suite('24. the budget, at 4x CPU, on a season seeded in the page');
        const { context, page } = await phone(375, 667, 'dark', false, false);
        await page.evaluate(seedSeason);
        await pause(page, 400);
        await page.evaluate(() => { window.scrollTo(0, document.documentElement.scrollHeight); openFind(); });
        await pause(page, 400);
        const cdp = await context.newCDPSession(page);
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
        const taken = {};
        taken.tap = await timed(page, "document.querySelector('#findList [data-worker-id=\"w_05\"] [data-find-door=\"history\"]').click()");
        await pause(page, 400);
        const pick = (id, value) => `(() => { const field = document.getElementById('${id}'); field.value = '${value}'; field.dispatchEvent(new Event('change', { bubbles: true })); })()`;
        taken.everyone = await timed(page, pick('historyMan', ''));
        await pause(page, 400);
        taken.year = await timed(page, pick('historyRange', 'thisYear'));
        await pause(page, 400);
        taken.more = await timed(page, "historyMore()");
        await pause(page, 400);
        await page.evaluate(() => historyMore());
        await pause(page, 400);
        const scrolled = await page.evaluate(() => { const scroll = document.getElementById('historyScroll'); scroll.scrollTop = 4000; return scroll.scrollTop; });
        // A double at p_4: the seed never gives him one there, so the record certainly moves.
        taken.commit = await timed(page, "State.commit(assignPlace(State.schedule, todayStr(), 'w_01', 'actual', 'p_4', 'double'))");
        await pause(page, 400);
        const keptAfterCommit = await page.evaluate(() => document.getElementById('historyScroll').scrollTop);
        taken.snapshot = await timed(page, `(() => { const raw = JSON.parse(JSON.stringify(State.schedule));
            raw.updatedAt = new Date(Date.now() + 1000).toISOString(); raw.updatedBy = 'other-device';
            markAbsent(raw, todayStr(), 'w_02', 'actual'); FarkadSync.receive(raw); })()`);
        await pause(page, 400);
        const keptAfterSnapshot = await page.evaluate(() => [document.getElementById('historyScroll').scrollTop,
            document.querySelectorAll('#historyList .history-row').length]);
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
        const ms = Object.fromEntries(Object.entries(taken).map(([name, one]) => [name, one.ms]));
        console.log(`      at 4x: the door ${ms.tap} ms, «כל העובדים» ${ms.everyone} ms, «השנה» ${ms.year} ms, «הצג עוד» ${ms.more} ms, a commit under 600 days ${ms.commit} ms, an adopted snapshot ${ms.snapshot} ms`);
        console.log(`      of which the action itself: ${Object.entries(taken).map(([name, one]) => `${name} ${one.sync}`).join(', ')} ms`);
        // EACH NUMBER IS THE TIME OF THE WORK IT NAMES: what was on the glass when it was taken.
        const year = `01/01/${TODAY.slice(0, 4)}`;
        same('each step drew what it is timed for: him, everyone, the year, 200 more, the commit\'s day, the snapshot\'s day', [
            [taken.tap.open, taken.tap.first.endsWith(':w_05'), taken.tap.line.startsWith('דוגמה 5 · כל האתרים')],
            [taken.everyone.rows, taken.everyone.labels.some(label => label.indexOf('דוגמה 5') === -1), taken.everyone.line.startsWith('כל העובדים · כל האתרים')],
            [taken.year.rows, taken.year.line.indexOf(year) !== -1],
            [taken.more.rows],
            [taken.commit.rows, taken.commit.labels.some(label => label.indexOf('דוגמה 1 · ') !== -1 && label.indexOf('אתר 4') !== -1
                && label.indexOf('יום כפול') !== -1)],
            [taken.snapshot.rows, taken.snapshot.labels.some(label => label.indexOf('דוגמה 2 · ') !== -1 && label.endsWith('נעדר'))]
        ], [['flex', true, true], [200, true, true], [200, true], [400], [600, true], [600, true]]);
        check('(a) a tap on «איפה עבד» paints the dialog on him inside 600 ms', ms.tap <= 600, `${ms.tap} ms`);
        check('(b) «כל העובדים», then «השנה», each painted inside 600 ms', ms.everyone <= 600 && ms.year <= 600,
            `${ms.everyone} / ${ms.year} ms`);
        check('«הצג עוד» paints 200 more inside 300 ms', ms.more <= 300, `${ms.more} ms`);
        check('a commit and an adopted snapshot under 600 days drawn, each painted inside 600 ms', ms.commit <= 600 && ms.snapshot <= 600,
            `${ms.commit} / ${ms.snapshot} ms`);
        same('with the place kept through both, and 600 days still drawn', [keptAfterCommit, keptAfterSnapshot], [scrolled, [scrolled, 600]]);
        await context.close();
    }

    // ============================================================ 25. a season's counts, whole in their tiles
    // At twice the text a tile of round 1 stayed 96px and its figure 48px: «9037» ran 34px into the
    // tile beside it, which painted over its first digit - «ימי נוכחות 037» (the review of round
    // 1). The ruler below never saw it: a tile is not a control and nothing hides its overflow, so a
    // count painted over is neither cut nor spilled. So here, on a season of forty men - four and
    // five figures under «השנה» and «מתחילת הרישום» - every figure is held inside its own tile's
    // padding, at every phone, with the text as it is, with the large display and at twice the
    // text; and the figures of one line of tiles stand on one line, whatever their labels wrap to.
    for (const [width, height] of PHONES) {
        suite(`25. a season's counts, whole in their tiles - ${width}x${height}`);
        const { context, page } = await phone(width, height, 'light', false, false);
        await page.evaluate(seedSeason);
        await page.evaluate(() => { openHistory(null); });
        await pause(page, 300);
        for (const mode of ['as it is', 'large display', 'text doubled']) {
            if (mode === 'large display') await page.evaluate(() => document.documentElement.classList.add('display-large'));
            if (mode === 'text doubled') {
                await page.evaluate(() => document.documentElement.classList.remove('display-large'));
                given(`${width}x${height}: the cascade is doubled`, await doubleEveryFontSize(page) > 100);
            }
            for (const range of ['thisYear', 'all']) {
                await page.evaluate(range => { const field = document.getElementById('historyRange'); field.value = range;
                    field.dispatchEvent(new Event('change', { bubbles: true })); }, range);
                await pause(page, 200);
                const read = await page.evaluate(() => {
                    const tiles = [...document.querySelectorAll('#historyTotals .history-tile')];
                    const first = tiles[0].getBoundingClientRect();
                    return { columns: tiles.filter(tile => Math.abs(tile.getBoundingClientRect().top - first.top) < 1).length,
                        tiles: tiles.map(tile => {
                            const box = tile.getBoundingClientRect();
                            const cs = getComputedStyle(tile);
                            const value = tile.querySelector('.history-tile-value');
                            const range = document.createRange();
                            range.selectNodeContents(value);
                            const words = range.getBoundingClientRect();
                            return { value: value.textContent, top: Math.round(box.top), bottom: Math.round(words.bottom),
                                inside: words.left >= box.left + parseFloat(cs.paddingLeft) - 1 && words.right <= box.right - parseFloat(cs.paddingRight) + 1 };
                        }) };
                });
                const lines = {};
                read.tiles.forEach(tile => { (lines[tile.top] = lines[tile.top] || []).push(tile.bottom); });
                const longest = Math.max(...read.tiles.map(tile => tile.value.length));
                console.log(`      ${width}x${height}, ${mode}, ${range}: ${read.columns} a line; ${read.tiles.map(tile => tile.value).join(' / ')}`);
                check(`${width}x${height}, ${mode}, ${range}: every figure - up to ${longest} digits - inside its own tile`,
                    longest >= 4 && read.tiles.every(tile => tile.inside), JSON.stringify(read.tiles.filter(tile => !tile.inside)));
                check(`${width}x${height}, ${mode}, ${range}: and the figures of one line of tiles on one line`,
                    Object.values(lines).every(bottoms => Math.max(...bottoms) - Math.min(...bottoms) <= 1), JSON.stringify(lines));
            }
        }
        if (SHOTS && width === 375) await shot(page, `375x667-light-doubled-season-tiles`);
        await context.close();
    }

    // ============================================================ 25. the floors
    // Fix round 1 added the four views the ruler had never seen: a day at two sites, with no site
    // and under one of them (the two-sites sentence, «2 אתרים»); a list longer than one chunk (how
    // many of how many, «הצג עוד»); and the line under the text's doors, which is empty - and so
    // not drawn - in every other view: here it holds the refusal, which stays until the next door.
    const FLOOR_VIEWS = [
        ['one man, every site', [['historyMan', 'w02']]],
        ['one man at a site, a day at two', [['historyMan', 'w02'], ['historySite', 'p2'], ['historyRange', 'last3']]],
        ['everyone at p1, with Rima', [['historyMan', ''], ['historySite', 'p1'], ['historyRange', 'thisMonth']]],
        ['everyone at p2, with יוסף גבס', [['historyMan', ''], ['historySite', 'p2'], ['historyRange', 'thisMonth']]],
        ['everyone, more than one chunk', [['historyMan', ''], ['historySite', ''], ['historyRange', 'last3']]],
        ['the text, refused for a link', [['historyMan', ''], ['historySite', ''], ['historyRange', 'last3']], true, 'refuse'],
        ['two dates and the text', [['historyMan', 'w02'], ['historySite', ''], ['historyRange', 'custom']], true],
        ['the chosen names', [['historyMan', 'w99'], ['historySite', 'p1'], ['historyRange', 'last3']]]
    ];
    const cells = [];
    PHONES.forEach(([width, height]) => SCHEMES.forEach(scheme => [false, true].forEach(large => cells.push([width, height, scheme, large, false]))));
    cells.push([320, 568, 'light', false, true], [375, 667, 'dark', false, true]);
    for (const [width, height, scheme, large, doubled] of cells) {
        const tag = `${width}x${height} ${scheme}${large ? ', large display' : ''}${doubled ? ', text doubled' : ''}`;
        suite(`25. the floors - ${tag}`);
        const { context, page } = await phone(width, height, scheme, large);
        // THE CHOSEN NAMES: a man turned off with the longest name of the probes, and the
        // seed's first site archived - in memory only, put back before the phone is shut.
        await page.evaluate(() => {
            State.schedule.workers.push({ id: 'w99', name: 'עבד אל-רחמן אבו חוסיין', active: false });
            State.schedule.places.find(place => place.id === 'p1').active = false;
            // THE CRITIC'S DAY on עלי חסן: 3 extra hours at תל אביב - רוטשילד, first, and a double at
            // פתח תקווה - and September and October before the seed's first day for the crew, so that
            // «כל העובדים» over three months is more than one chunk of 200. In memory only, too.
            setWorkerDay(State.schedule, '2026-11-04', 'w02', 'actual', { entries: [makeEntry('p2', 'extra', 3), makeEntry('p5', 'double')] });
            for (const day = new Date(2026, 8, 1, 12); toLocalDateStr(day) < '2026-10-23'; day.setDate(day.getDate() + 1)) {
                if (day.getDay() === 6) continue;
                State.schedule.workers.slice(0, 11).forEach((worker, i) => assignPlace(State.schedule, toLocalDateStr(day), worker.id, 'actual', 'p' + (2 + (i % 4))));
            }
            render();
        });
        if (doubled) given(`${tag}: the cascade is doubled`, await doubleEveryFontSize(page) > 100);
        await home(page);
        await throughTheDoor(page, 'w02');
        given(`${tag}: it is open`, await isOpen(page));
        for (const [name, choices, fold, then] of FLOOR_VIEWS) {
            for (const [id, value] of choices) await page.evaluate(([id, value]) => { const field = document.getElementById(id);
                field.value = value; field.dispatchEvent(new Event('change', { bubbles: true })); }, [id, value]);
            if (fold && await page.evaluate(() => document.getElementById('historyFoldBody').hidden)) await page.evaluate(() => historyToggleText());
            if (!fold && await page.evaluate(() => !document.getElementById('historyFoldBody').hidden)) await page.evaluate(() => historyToggleText());
            await page.evaluate(() => { document.getElementById('historyScroll').scrollTop = 0; });
            if (then === 'refuse') {
                await page.evaluate(() => { Object.defineProperty(navigator, 'share', { configurable: true, value: undefined }); historySend(); });
            }
            await pause(page, 250);
            // The picture as it opens - its top - before the last control is scrolled to.
            if (SHOTS && !doubled && ((width === 440 && scheme === 'dark' && !large) || (width === 320 && large && scheme === 'dark'))) {
                await shot(page, `${width}x${height}-${scheme}${large ? '-large' : ''}-${name.replace(/[^a-z0-9]+/gi, '-')}`);
            }
            const read = await page.evaluate(measureInPage, ['#historyModal']);
            const live = read.texts.filter(t => !t.off);
            const floor = large ? 18 : 16;
            // A marker is not a sentence (tests/mobile.test.mjs's rule, word for word in spirit):
            // the diamond that tells two sites of one colour apart once there are more than
            // ten carries no letter and no digit, and stands beside the name spelled out in
            // full - it is the day screen's own mark at the day screen's own size. Anything
            // with a letter or a number in it is held to the floor.
            const small = live.filter(t => /[\p{L}\p{N}]/u.test(t.words) && t.size < floor - 0.01);
            check(`${tag} · ${name}: no word under ${floor}px`, small.length === 0, JSON.stringify(small.slice(0, 3)));
            if (large) {
                const thin = live.filter(t => t.weight < 500);
                check(`${tag} · ${name}: no text lighter than 500`, thin.length === 0, JSON.stringify(thin.slice(0, 3)));
            }
            const need = large ? 7 : 4.5;
            const weak = live.filter(t => t.contrast !== null && t.contrast < need);
            check(`${tag} · ${name}: every word at ${need}:1 on the ground really painted under it`, weak.length === 0,
                JSON.stringify(weak.slice(0, 3).map(t => `${t.ink} on ${t.ground} «${t.words}»`)));
            const target = large ? 51.5 : 43.5;
            const fingers = read.targets.filter(t => t.w < target || t.h < target);
            check(`${tag} · ${name}: every target ${large ? 52 : 44}px both ways`, fingers.length === 0,
                JSON.stringify(fingers.slice(0, 3)));
            check(`${tag} · ${name}: no two controls over each other, no words past their control`, read.overlaps.length === 0 && read.spills.length === 0,
                JSON.stringify([read.overlaps.slice(0, 2), read.spills.slice(0, 2)]));
            check(`${tag} · ${name}: nothing off the side, nothing cut, nothing out of reach, no sideways scroll`,
                read.offside.length === 0 && read.cut.length === 0 && read.unreachable.length === 0 && read.page.scrollWidth <= width,
                JSON.stringify([read.offside.slice(0, 2), read.cut.slice(0, 2), read.unreachable.slice(0, 2), read.page.scrollWidth]));
            const last = await page.evaluate(() => {
                const all = [...document.querySelectorAll('#historyModal button, #historyModal select, #historyModal input, #historyModal textarea')]
                    .filter(node => node.getClientRects().length > 0);
                const node = all[all.length - 1];
                node.scrollIntoView({ block: 'end' });
                const box = node.getBoundingClientRect();
                const scroll = document.getElementById('historyScroll').getBoundingClientRect();
                return { ok: box.bottom <= Math.min(scroll.bottom, innerHeight) + 1 && box.top >= scroll.top - 1, what: node.id || node.dataset.historyKey || node.className };
            });
            check(`${tag} · ${name}: the last control can be brought onto the glass`, last.ok, JSON.stringify(last));
            // THE RANGE IS A BOX OF ITS OWN: a line that wraps breaks before its dates and never
            // between them - broken after the dash, a right-to-left line drew «… · - 01/11/2026» over
            // «10/11/2026» (440px, everyone at «הרצליה - מגדל הים») - and where twice the text makes
            // the range itself wider than a line, it breaks after its dash and nowhere else: round 1
            // glued the whole range into one word and the line's overflow-wrap broke it inside a date,
            // «01/09/2026 - 10/11/» over «2026», at 320, 375 and 440 (the review of round 1).
            const dates = await page.evaluate(() => {
                // The range's own box - or, on a build that has none, the line itself (so that this
                // reads, and fails, on round 1's bytes too).
                const node = (document.querySelector('#historyRangeNow .history-now-range') || document.getElementById('historyRangeNow')).firstChild;
                const text = node.textContent;
                const lineOf = (start, end) => { const range = document.createRange(); range.setStart(node, start); range.setEnd(node, end);
                    return [...new Set([...range.getClientRects()].filter(rect => rect.width > 0).map(rect => Math.round(rect.top)))]; };
                const at = [...text.matchAll(/\d\d\/\d\d\/\d{4}/g)].map(found => found.index);
                const dash = text.indexOf('-');
                return { dates: at.map(start => lineOf(start, start + 10)), dash: lineOf(dash, dash + 1) };
            });
            check(`${tag} · ${name}: no date of the line is split across two lines, and its dash stays with the first date`,
                dates.dates.length === 2 && dates.dates.every(tops => tops.length === 1) && dates.dash.length === 1
                && Math.abs(dates.dash[0] - dates.dates[0][0]) <= 2, JSON.stringify(dates));
            if (!doubled) {
                check(`${tag} · ${name}: the line's two dates stand on one line`, dates.dates.length === 2
                    && Math.abs(dates.dates[0][0] - dates.dates[1][0]) <= 2, JSON.stringify(dates));
            }
            if (name === 'one man, every site') {
                const rows = await page.evaluate(() => {
                    const all = [...document.querySelectorAll('#historyList .history-row')];
                    const critic = all.find(row => row.dataset.historyKey === 'row:2026-11-04:w02');
                    const box = node => node.getBoundingClientRect();
                    const tags = [...critic.querySelectorAll('.tag-place')].map(box);
                    const kind = box(critic.querySelector('.history-kind'));
                    const hours = box(critic.querySelector('.history-hours'));
                    return { tags: tags.length, kindBelow: tags.every(tag => kind.top >= tag.bottom - 1),
                        hoursBeside: Math.abs(hours.top - kind.top) <= 4,
                        shapes: [...new Set(all.map(row => box(row.querySelector('.history-day')).top >= box(row.querySelector('.history-when')).bottom - 2
                            ? 'under' : 'beside'))], rows: all.length };
                });
                // THE DAY'S KIND IS THE DAY'S: at two sites the tags have a line of their own and the
                // kind and the hours stand under both, never beside the second only - where «יום כפול
                // +3 ש׳» read as פתח תקווה's, and the hours were worked at תל אביב (the review of round 1).
                same(`${tag}: a day at two sites - both sites, and under them the day's kind with its hours, beside neither alone`,
                    [rows.tags, rows.kindBelow, rows.hoursBeside], [2, true, true]);
                // ONE SHAPE: every day of his has its day beside its date, or every one under it - a
                // short weekday and a long one no longer break differently (they zigzagged at 375).
                same(`${tag}: and every row of his has one shape, its day ${rows.shapes[0] || ''} the date (${rows.rows} rows)`,
                    rows.shapes.length, 1);
            }
            if (name === 'everyone, more than one chunk') {
                const foot = await page.evaluate(() => [...document.querySelectorAll('#historyList .history-foot > *')].map(node => node.textContent));
                check(`${tag}: more days than one chunk - the line that says how many of how many, and «הצג עוד 200», both measured above`,
                    foot.length === 3 && /^מוצגות 200 שורות מתוך \d+\.$/.test(foot[1]) && foot[2] === 'הצג עוד 200', JSON.stringify(foot));
            }
            if (name === 'the text, refused for a link') {
                same(`${tag}: the line under the doors holds the refusal, measured above`, await page.evaluate(() =>
                    [document.getElementById('historyStatus').textContent, document.getElementById('historyStatus').getClientRects().length > 0]),
                ['⚠️ הרשימה ארוכה מדי לקישור של וואטסאפ - השתמש בהעתק ושלח ידנית', true]);
            }
            if (name === 'everyone at p1, with Rima') {
                same(`${tag}: p1 this month draws Rima's two lines and their note`, await page.evaluate(() =>
                    [...document.querySelectorAll('#historyTotals .history-pair')].map(pair => pair.dataset.figure)), ['billed', 'own', 'rima']);
            }
            if (name === 'everyone at p2, with יוסף גבס') {
                same(`${tag}: p2 this month draws «עובדי יוסף גבס» apart, with its note`, await page.evaluate(() =>
                    [...document.querySelectorAll('#historyTotals .history-pair-apart')].map(pair => [pair.dataset.figure, pair.querySelectorAll('.history-pair-note').length])),
                [['yosef', 1]]);
            }
            if (name === 'the chosen names') {
                const names = await page.evaluate(() => {
                    const line = document.getElementById('historyRangeNow');
                    const text = line.textContent.replace(/[⁦-⁩]/g, '');
                    const fit = id => {
                        const select = document.getElementById(id);
                        const cs = getComputedStyle(select);
                        const canvas = document.createElement('canvas').getContext('2d');
                        canvas.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
                        const words = select.selectedOptions[0].textContent.replace(/[⁦-⁩]/g, '');
                        const need = Math.ceil(canvas.measureText(words).width);
                        const room = Math.floor(select.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)) - 20;
                        return { words, need, room, fits: need <= room };
                    };
                    return { text, whole: text.indexOf('עבד אל-רחמן אבו חוסיין') !== -1 && text.indexOf('הרצליה - מגדל הים') !== -1,
                        cut: line.scrollWidth > line.clientWidth + 1, lines: Math.round(line.getBoundingClientRect().height / parseFloat(getComputedStyle(line).lineHeight || 20)),
                        man: fit('historyMan'), site: fit('historySite') };
                });
                console.log(`      ${tag}: «${names.man.words}» needs ${names.man.need}px of ${names.man.room}; «${names.site.words}» ${names.site.need}px of ${names.site.room}`);
                check(`${tag}: the line under the fields holds both chosen names whole, wrapped and never cut`, names.whole && !names.cut, JSON.stringify(names));
                if (!doubled && (width !== 320 || !large)) {
                    check(`${tag}: and each chosen name fits its closed select`, names.man.fits && names.site.fits, JSON.stringify([names.man, names.site]));
                }
            }
        }
        await page.evaluate(() => { closeHistory(); });
        await context.close();
    }

    // ============================================================ the way in, when a tap goes astray
    // What the verification of e90616d met under load, made on purpose (tapOpens says why). First a
    // touch the page never gets - the first tap on «חיפוש עובד» sent nowhere, the way a loaded
    // browser made nothing of one - and then a click the page gets and does nothing with: a listener
    // that swallows it at the window, after the page's own account of it. Round 1's way in met each
    // with a thirty-second timeout on the next tap, thrown out of the run.
    {
        suite('the way in: a tap the page never got is taken again, a click it got and did nothing with fails one check - and neither ends the run');
        const { context, page } = await phone(375, 667, 'light', false);
        await home(page);
        const atRest = await disk(page);
        const proto = Object.getPrototypeOf(page.locator('html'));
        const realTap = proto.tap;
        let lose = 1;
        proto.tap = async function (...args) {
            if (lose > 0 && String(this).includes('#findEntry')) { lose -= 1; return undefined; }
            return realTap.apply(this, args);
        };
        const heard = [];
        let threw = '';
        try {
            await throughTheDoor(page, 'w02', (name, pass, detail) => heard.push([name, Boolean(pass), detail]));
        } catch (error) {
            threw = String(error.message).split('\n')[0];
        } finally {
            proto.tap = realTap;
        }
        same('a touch the page never got: the tap taken again, the dialog open on him, nothing failed and nothing thrown',
            [threw, lose, await isOpen(page), await page.evaluate(() => HISTORY.workerId), heard.map(([, pass]) => pass)],
            ['', 0, true, 'w02', [true, true]]);
        check('and the finder\'s tap says it came after one the page got no click of', heard.length > 0
            && heard[0][2] === 'after 1 tap the page got no click of: [[]]', JSON.stringify(heard));
        await home(page);
        await pause(page, 400);
        await page.evaluate(() => window.addEventListener('click', event => { event.stopImmediatePropagation(); event.preventDefault(); },
            { capture: true, once: true }));
        const judged = [];
        threw = '';
        try {
            await throughTheDoor(page, 'w02', (name, pass, detail) => judged.push([name, Boolean(pass), detail]));
        } catch (error) {
            threw = String(error.message).split('\n')[0];
        }
        same('a click the page got and did nothing with: one check failed - the finder\'s - never a tap taken again, and the run goes on into the dialog',
            [threw, judged.map(([, pass]) => pass), await isOpen(page), await page.evaluate(() => HISTORY.workerId)], ['', [false, true], true, 'w02']);
        check('and that failure names the click and where it came down', judged.length > 0
            && judged[0][2].startsWith('the page got a click on #findEntry and opened nothing;'), JSON.stringify(judged));
        check('and nothing was written by either', await disk(page) === atRest);
        await context.close();
    }

    // ============================================================ the screens' list
    {
        suite('the four entries of tests/screens.mjs open what they say');
        const { context, page } = await phone(375, 667, 'light', false);
        for (const name of ['find - where one man worked', 'find - a site and everyone, with Rima', 'find - a site and everyone, with יוסף גבס',
            'find - two dates and the text']) {
            const screen = SCREENS.find(one => one.name === name);
            given(`«${name}» is on the list`, Boolean(screen));
            await screen.open(page);
            const state = await page.evaluate(() => [document.getElementById('historyModal').style.display, HISTORY.workerId, HISTORY.placeId, HISTORY.range,
                HISTORY.textOpen, [...document.querySelectorAll('#historyTotals .history-pair')].map(pair => pair.dataset.figure)]);
            const want = { 'find - where one man worked': ['flex', 'w02', null, 'last3', false, []],
                'find - a site and everyone, with Rima': ['flex', null, 'p1', 'thisMonth', false, ['billed', 'own', 'rima']],
                'find - a site and everyone, with יוסף גבס': ['flex', null, 'p2', 'thisMonth', false, ['billed', 'yosef']],
                'find - two dates and the text': ['flex', 'w02', null, 'custom', true, []] }[name];
            same(`«${name}»: opened through the finder's door, on what it names - ${want[5].length ? 'its block drawn' : 'no block'}`, state, want);
            await screen.close(page);
            await pause(page, 150);
        }
        await context.close();
    }

    suite('26. and nothing threw');
    check('no uncaught browser errors', errors.length === 0, JSON.stringify(errors.slice(0, 5)));
    // The midnight walk's two pages (criterion 19): nothing but the test page's own blocked worker,
    // however late it was handed over.
    check('and the midnight walk\'s pages raised nothing but the blocked worker\'s own read of a registration that never came',
        midnightErrors.every(message => message === BLOCKED_WORKER), JSON.stringify(midnightErrors));
} finally {
    await browser.close();
    await server.close();
}

report();
