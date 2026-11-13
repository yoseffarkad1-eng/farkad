// A double tap on every writer a tap opens is one tap - in a real Chromium with a touch screen.
//
//   node tests/doubletap.browser.mjs
//
// The review of the hotfix (R2, R3) found the trap v167 closed for the sheet a man's row opens
// still open everywhere else. A name in «לא נרשמו» opens «לאן הלך», a site's «+» opens its
// picker, the tally «נרשמו X מתוך Y» and a row of «לפי עובדים» open the sheet that walks the
// evening - and the second tap of a double tap, or a bounce, landed on whatever the surface had
// just put under the finger: a site, a «+ הוסף», a tile, and a rate-stamped day nobody chose was
// written and queued. And the walk itself: a site picked moves the sheet on to the next man
// with the same tiles in the same places, so a double tap placed two men, and «נעדר» twice
// marked two men away.
//
// Measured here, for each opener: the double tap at the reviewers' 150 ms, over phone sizes,
// site counts and the opener's height on the screen - nothing written, in memory, on the disk or
// in the queue, the surface still open on the right man; and in each layout the same double tap
// made again with the guard put aside between its two taps, which must write in at least one
// layout of the sweep - so the guard is shown stopping a write, not merely finding nothing under
// the finger. After the window a tap is a tap, with its own step on ↶; a keyboard's click acts
// at once; and what it costs, said plainly: a site meant inside a picker's window is ignored too
// (sheet.js says why that is the trade there - the picker stays on the same man).
//
// The second review of the hotfix found round one's answer for the walk was itself the worst
// fault: the walking sheet held for DOUBLE_TAP_GUARD_MS after every move swallowed a deliberate
// tap at a person's pace, and every later site went to the man before (BLOCKER). The walk is
// measured here at 320x568, 375x667 and 440x956: a tap every 350, 400, 600 and 800 ms gives each
// of four men his own site - the next man's card still sliding in under the faster ones - and a
// double tap 100, 150 and 250 ms apart, on the first man and on a man the walk has just moved
// to, places one; «נעדר» twice and «דלג» twice move it one man; a digit per man on a keyboard,
// back to back, places three; his own sheet takes a double tap on a site as one. And a guard
// covers the WRITING controls only: inside the window a surface's «סגור», its search box and
// «נקה» are taps (the second review: they were swallowed, the picker left open over the day).
//
// The third review of the hotfix found the walk's bounce still time alone: a quick tap on the OTHER
// site inside it was taken for the bounce of the tap before and shifted every later site by one
// man. A bounce is the same finger in the same place now (sameFingerAgain, js/ui/sheet.js), and
// north-south taps 150, 200 and 250 ms apart give each man his own site. And what no window can
// take back is pinned, so that it is seen: one tile tapped four times 200 ms apart is two double
// taps, two men placed.
//
// v194: A TAP FALLS THROUGH A SURFACE THAT JUST SHUT. All of the above is a surface coming up under
// a finger; the last section is the other half - a first tap that shuts a surface or redraws its
// control, and the second tap on what was underneath - held by one rule of the page's, with each
// sweep's control, and what that rule must never take.
//
// NOT a real phone: Chromium with emulated touch.

import { chromium } from 'playwright';
import { serve } from './serve.mjs';
import { launchLocalBrowser } from './network-guard.mjs';
import { verifyServedAssets, expectedShaFor } from './treecheck.mjs';
import { suite, check, same, given, report } from './runner.mjs';

const root = new URL('..', import.meta.url).pathname;
const server = await serve(root);
check('the browser is served the named tree',
    (await verifyServedAssets(server.url, root, expectedShaFor(root))).ok);
const browser = await launchLocalBrowser(chromium, { executablePath: process.env.CHROME_PATH });
const errors = [];

const DAY = '2026-11-11';
const NOW = '2026-11-11T18:00:00+02:00';
const GUARD = 700;    // DOUBLE_TAP_GUARD_MS, js/ui/day.js
const WALK_BOUNCE = 300;     // WALK_BOUNCE_MS, js/ui/sheet.js
const SIZES = [[320, 568], [375, 667], [390, 844], [440, 956]];
const SITE_NAMES = ['אתר צפון', 'אתר דרום', 'אתר מזרח', 'אתר מערב', 'אתר מרכז'];
const bare = text => String(text || '').replace(/[⁦-⁩‎]/g, '');

// A phone on Wednesday evening: fourteen men (synthetic names), `places` sites, two men already
// on the first site so that the site cards have rows. `mode` is the day screen's switch.
async function phone(size, places, mode = 'sites') {
    const context = await browser.newContext({ viewport: { width: size[0], height: size[1] }, deviceScaleFactor: 2,
        isMobile: true, hasTouch: true, timezoneId: 'Asia/Jerusalem' });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.clock.install({ time: new Date(NOW) });
    await page.goto(server.url);
    await page.waitForFunction(() => typeof State === 'object' && State.schedule && typeof openPlacePicker === 'function');
    await page.evaluate(([names, mode]) => {
        State.schedule.workers = Array.from({ length: 14 }, (_, i) =>
            ({ id: 'w_' + String(i + 1).padStart(2, '0'), name: 'דוגמה ' + (i + 1), active: true, dailyRate: 400 }));
        State.schedule.places = names.map((name, i) => ({ id: 'p_0' + (i + 1), name, active: true }));
        State.commitRoster();
        ['w_10', 'w_11'].forEach(id => State.commit(assignPlace(State.schedule, todayStr(), id, 'actual', 'p_01')));
        hideUndo(); showView('day'); setDayMode(mode); render();
        const banner = document.getElementById('accountBanner');
        const putAway = banner && banner.style.display !== 'none' && banner.querySelector(':scope > .btn-icon');
        if (putAway) putAway.click();
        // Every press the page sees, on the presses' own clock (their pointerdown timeStamps):
        // the gap that counts is the one the PAGE saw, not the one the driver meant.
        window.__downs = [];
        window.addEventListener('pointerdown', event => window.__downs.push(event.timeStamp), true);
    }, [SITE_NAMES.slice(0, places), mode]);
    await page.waitForTimeout(250);
    return { context, page };
}
// The gap the page saw between the last two presses.
const lastGap = page => page.evaluate(() => { const d = window.__downs; return d.length > 1 ? Math.round(d[d.length - 1] - d[d.length - 2]) : null; });

// The whole of what a tap could have written: the day in memory, the day on the disk, the queue.
const written = page => page.evaluate(day => JSON.stringify({
    memory: State.schedule.days[day] || null,
    disk: (JSON.parse(localStorage.getItem('scheduleData:v2') || '{}').days || {})[day] || null,
    queue: [...FarkadSync._outbox.entries()].map(([path, op]) => path + '@' + op.opId).sort()
}), DAY);
const shown = page => page.evaluate(() => [...document.querySelectorAll('.modal')]
    .filter(modal => modal.style.display && modal.style.display !== 'none').map(modal => modal.id));
// The button under a point, by its class and its words - or what is there if it is no button.
const under = (page, point) => page.evaluate(({ x, y }) => {
    const node = document.elementFromPoint(x, y);
    const hit = node && node.closest('button');
    return hit ? `${hit.className}|${hit.textContent.trim().slice(0, 24)}` : (node ? (node.id || node.className || node.tagName) : null);
}, point);
const sites = (page, id) => page.evaluate(([day, id]) => entriesFor(State.schedule, day, id, 'actual').map(entry => entry.placeId), [DAY, id]);
const undoSays = page => page.evaluate(() => { const bar = document.getElementById('undoBar');
    return bar && bar.style.display !== 'none' && bar.firstChild ? bar.firstChild.textContent : null; });

// The opener brought to `fraction` of the screen's height, and its centre.
async function aim(page, find, fraction) {
    const point = await page.evaluate(([find, fraction]) => {
        const node = (0, eval)(find)();
        if (!node) return null;
        window.scrollTo(0, window.scrollY + node.getBoundingClientRect().top - window.innerHeight * fraction);
        return true;
    }, [find, fraction]);
    if (!point) return null;
    await page.waitForTimeout(250);
    return page.evaluate(find => {
        const box = (0, eval)(find)().getBoundingClientRect();
        return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
    }, find);
}

// Two taps at one point, the second starting `gap` ms after the first started (or at once, when
// the first took longer), by the touch screen. Returns what was under the finger when the second
// came down. `between`, when given, runs between the two.
async function doubleTap(page, point, gap, between) {
    const started = Date.now();
    await page.touchscreen.tap(point.x, point.y);
    const wait = started + gap - Date.now();
    if (wait > 0) await page.waitForTimeout(wait);
    if (between) await between();
    const hit = await under(page, point);
    await page.touchscreen.tap(point.x, point.y);
    await page.waitForTimeout(250);
    return hit;
}

// What puts each surface's guard aside - its deadline, and for the sheet the walk's bounce too
// (MOVED ON PURPOSE, the second review of the hotfix: the walking sheet opened by a tap is held
// by the bounce from its opener's press, WALK_BOUNCE_MS, not by a deadline) - and its own closer
// (js/ui/sheet.js).
// MOVED ON PURPOSE (v194): the page's own rule now spends the second tap of each of these too -
// the same finger again on a control that was not there (tapBefore, js/ui/sheet.js) - so the
// control puts that aside as well; a surface's own guard is still what is measured as shipped.
const UNGUARD = { placePickerModal: 'placePickerGuardUntil = 0; tapBefore = null', workerPickerModal: 'workerPickerGuardUntil = 0; tapBefore = null',
    assignSheet: 'sheetGuardUntil = 0; sheetBounceFrom = null; tapBefore = null' };
const CLOSER = { placePickerModal: 'closePlacePicker()', workerPickerModal: 'closeWorkerPicker()', assignSheet: 'closeAssignSheet()' };
const run = (page, code) => page.evaluate(code => (0, eval)(code), code);

// ================================================================== the three openers
const NAME = name => `() => [...document.querySelectorAll('#dayView .tray-pending .chip-main')].find(node => node.textContent === '${name}')`;
const OPENERS = [
    {
        what: 'the first name in «לא נרשמו», opening «לאן הלך»', mode: 'sites', surface: 'placePickerModal',
        find: NAME('דוגמה 1'), fractions: [0.3, 0.6]
    },
    {
        what: 'a name further down «לא נרשמו», opening «לאן הלך»', mode: 'sites', surface: 'placePickerModal',
        find: NAME('דוגמה 6'), fractions: [0.3, 0.6]
    },
    {
        what: 'a site\'s «+», opening its picker', mode: 'sites', surface: 'workerPickerModal',
        find: "() => document.querySelectorAll('#dayView .site-card .site-head-btn')[Math.min(3, document.querySelectorAll('#dayView .site-card .site-head-btn').length - 1)]", fractions: [0.5, 0.7]
    },
    {
        what: 'a row of «לפי עובדים», opening the sheet', mode: 'workers', surface: 'assignSheet',
        find: "() => document.querySelectorAll('#dayView .wrow-main')[3]", fractions: [0.5, 0.7]
    },
    {
        what: 'the tally «נרשמו X מתוך Y», opening the sheet', mode: 'sites', surface: 'assignSheet',
        find: "() => document.querySelector('#dayView .now-count')", fractions: [0.3]
    }
];

// In every layout the double tap is made twice: as the build has it, and - the control - with
// the surface's deadline put back to 0 between the two taps, which is the build before the
// guard. The first must write nothing anywhere; the second must write somewhere, or the sweep
// never put a writer under the finger and proves nothing. (What elementFromPoint reports is
// printed too, but it is not the measure: a touch that lands in a gap is moved by the browser
// onto the nearest button.)
// MOVED ON PURPOSE (the second review of the hotfix): a guard covers the WRITING controls only,
// so where the opened surface puts its own «סגור» under the finger, the second tap is a tap on
// «סגור» and shuts it - nothing written, which is what was always measured. Each layout counts as
// one tap when nothing is written and the surface is open, or shut by its own «סגור».
const CLOSE_BUTTON = { placePickerModal: '#placePickerModal button[onclick="closePlacePicker()"]',
    workerPickerModal: '#workerPickerModal button[onclick="closeWorkerPicker()"]', assignSheet: '#assignSheet .sheet-actions button:last-child' };
for (const opener of OPENERS) {
    suite(`a double tap on ${opener.what}: one tap - nothing written, the surface open or shut by its own «סגור»`);
    const hits = [], unguarded = [];
    let runs = 0, clean = 0, shutByClose = 0;
    // The surface's window: the walking sheet's is its bounce, measured from the opener's press.
    const window_ = opener.surface === 'assignSheet' ? WALK_BOUNCE : GUARD;
    for (const size of SIZES) for (const places of [2, 5]) for (const fraction of opener.fractions) for (let attempt = 0; attempt < 3; attempt++) {
        const { context, page } = await phone(size, places, opener.mode);
        const point = await aim(page, opener.find, fraction);
        if (!point) { await context.close(); break; }
        await page.evaluate(selector => {
            window.__closeTapped = 0;
            document.addEventListener('click', event => { if (event.target.closest && event.target.closest(selector)) window.__closeTapped++; }, true);
        }, CLOSE_BUTTON[opener.surface]);
        const before = await written(page);
        const hit = await doubleTap(page, point, 150);
        // A pair the page saw as far apart as the window is not a double tap: made again.
        const seen = await lastGap(page);
        if (!(seen < window_) && attempt < 2) {
            console.log(`  ${size.join('x')} ${places} sites at ${fraction}: the page saw the presses ${seen} ms apart - made again in a fresh page`);
            await context.close();
            continue;
        }
        runs++;
        hits.push(hit);
        const open = await shown(page);
        const closeTapped = await page.evaluate(() => window.__closeTapped);
        const nothing = (await written(page)) === before;
        if (nothing && open.length === 1 && open[0] === opener.surface) clean++;
        else if (nothing && open.length === 0 && closeTapped === 1) { clean++; shutByClose++; }
        else console.log(`  ${size.join('x')} ${places} sites at ${fraction}: under the second tap ${hit}, open ${open.join(',')}`);
        // The control, on the same page: the surface shut, the moment waited out, the same
        // double tap with the guard put aside between its two taps.
        await run(page, CLOSER[opener.surface]);
        await page.waitForTimeout(GUARD + 100);
        const again = await aim(page, opener.find, fraction);
        if (again) {
            const was = await written(page);
            const landed = await doubleTap(page, again, 150, () => run(page, UNGUARD[opener.surface]));
            if ((await written(page)) !== was) unguarded.push(`${size.join('x')} ${places} sites at ${fraction} (${landed})`);
        }
        await context.close();
        break;
    }
    given(`${opener.what}: the sweep ran`, runs >= 8, String(runs));
    same(`${opener.what}: in every one of ${runs} layouts the day, the disk and the queue are what they were, the surface open or shut by its own «סגור»`, clean, runs);
    if (shutByClose) console.log(`  (${shutByClose} of ${runs} layouts put its «סגור» under the second tap, which shut it)`);
    check(`${opener.what}: and with the guard put aside between the two taps, the second tap wrote in at least one of them`,
        unguarded.length > 0, unguarded.join(' / ') || hits.join(' / '));
}

// ================================================================== after the window
suite('after the window a tap is a tap - and inside it, a site meant on purpose is ignored too');
{
    const { context, page } = await phone([390, 844], 2);
    await page.locator('#dayView .tray-pending .chip-main', { hasText: 'דוגמה 3' }).tap();
    await page.waitForTimeout(150);
    const before = await written(page);
    await page.locator('#placePickerList .place-btn', { hasText: 'אתר דרום' }).tap();
    await page.waitForTimeout(150);
    same('«לאן הלך»: a site tapped 150 ms after it opened does nothing - the window is time, not place', await written(page), before);
    await page.waitForTimeout(GUARD);
    await page.locator('#placePickerList .place-btn', { hasText: 'אתר דרום' }).tap();
    await page.waitForTimeout(150);
    same('«לאן הלך»: the window over, the site is his', await sites(page, 'w_03'), ['p_02']);
    same('with its own step on ↶', bare(await undoSays(page)), 'דוגמה 3 נרשם באתר דרום');
    await page.locator('#placePickerModal button[onclick="closePlacePicker()"]').tap();
    await page.waitForTimeout(100);
    same('and «סגור» closes it', await shown(page), []);
    await context.close();
}
{
    const { context, page } = await phone([390, 844], 2);
    await page.locator('#dayView .site-card .site-head-btn').first().tap();
    await page.waitForTimeout(GUARD + 100);
    await page.locator('#workerPickerList .picker-row[data-worker-id="w_04"] button').tap();
    await page.waitForTimeout(150);
    same('a site\'s picker: the window over, «+ הוסף» adds him', await sites(page, 'w_04'), ['p_01']);
    same('with its own step on ↶', bare(await undoSays(page)), 'דוגמה 4 נוסף לאתר צפון');
    await context.close();
}
{
    // A keyboard's click is never a bounce: Enter on a site inside the window acts at once.
    const { context, page } = await phone([390, 844], 2);
    await page.locator('#dayView .tray-pending .chip-main', { hasText: 'דוגמה 5' }).tap();
    await page.waitForTimeout(100);
    await page.locator('#placePickerList .place-btn', { hasText: 'אתר צפון' }).focus();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(150);
    same('«לאן הלך»: Enter on a site inside the window places him', await sites(page, 'w_05'), ['p_01']);
    await context.close();
}

// ================================================================== the sheet that walks
// THE WALK NEVER SWALLOWS A DELIBERATE TAP (the second review of the hotfix, BLOCKER). Round one
// held the walking sheet for DOUBLE_TAP_GUARD_MS after every move, and at a person's pace a
// deliberate tap fell inside that window, did nothing and said nothing, and every later site
// went to the man before the one it was meant for. The walk's guard is now a BOUNCE of
// WALK_BOUNCE_MS (300) from the press of the tap that last moved the sheet, on the presses' own
// clock (js/ui/sheet.js). Measured here at three phones: a tap every 350, 400, 600 and 800 ms -
// each man of four given his own site, the finger coming back to the same place on the glass for
// each, the next man's card still sliding in (.sheet-swap) under the faster ones - and a double
// tap 100, 150 and 250 ms apart, on the first man and on a man the walk has just moved to: one
// man placed. The gap that counts is the one the PAGE saw between the two presses (their
// pointerdown timeStamps); a pair the driver sent further apart than meant is made again in a
// fresh page, and a pace pair the page saw closer than WALK_BOUNCE_MS would be a wrong test.
const WALK_SIZES = [[320, 568], [375, 667], [440, 956]];
const MEANT = ['p_01', 'p_02', 'p_01', 'p_02'];

// The tally opens the walk on the first man; the centres of the two sites' tiles, at rest.
// `slide`: the advance's slide (.sheet-swap, css/app.css) forced to run. As shipped it does not:
// css/readability.css sets the sheet's entrance on every .modal-content, later in the cascade
// (js/ui/sheet.js says so) - so the walk is measured both as it is and as it would be.
async function walk(size, slide = false) {
    const { context, page } = await phone(size, 2);
    if (slide) await page.addStyleTag({ content: '#assignSheet .sheet-content.sheet-swap { animation: sheetSwap .6s ease-out 1 !important; }' });
    // (phone() records every press in window.__downs.)
    await page.evaluate(() => {
        window.__sliding = () => [...document.querySelectorAll('#assignSheet .sheet-content')]
            .some(node => node.getAnimations().some(animation => animation.playState === 'running'));
    });
    await page.locator('#dayView .now-count').tap();
    await page.waitForTimeout(500);
    const tiles = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('#assignSheetBody .sheet-place')].map((tile, at) => {
        const box = tile.getBoundingClientRect();
        return ['p_0' + (at + 1), { x: box.left + box.width / 2, y: box.top + box.height / 2 }];
    })));
    return { context, page, tiles };
}
// Taps at points, each starting at least `gap` ms after the start of the one before it (as near
// as the driver allows: a tap that took longer than the gap is followed at once). `look`, when
// given, reads the page before each tap, and the tap's start is taken after it.
async function tapsAt(page, points, gap, look) {
    let started = 0;
    for (let at = 0; at < points.length; at++) {
        if (at > 0) {
            const wait = started + gap - Date.now();
            if (wait > 0) await page.waitForTimeout(wait);
        }
        if (look) await look(at);
        started = Date.now();
        await page.touchscreen.tap(points[at].x, points[at].y);
    }
}
const downGaps = page => page.evaluate(() => window.__downs.slice(1).map((stamp, at) => Math.round(stamp - window.__downs[at])));
const titleOf = async page => bare(await page.locator('#assignSheetTitle').textContent());

suite('the sheet that walks the evening, at a person\'s pace: every man is given his own site');
// A run is judged only if the PAGE saw the pace: every pair of presses at least WALK_BOUNCE ms
// apart by their own timeStamps. On a loaded machine the driver's press can be stamped late,
// and a pair it sent 400 ms apart was seen 280 ms apart - a bounce, rightly - so such a run is
// made again in a fresh page, and a third such try fails.
for (const size of WALK_SIZES) for (const pace of [350, 400, 600, 800]) for (const slide of [false, true]) for (let attempt = 1; attempt <= 3; attempt++) {
    const { context, page, tiles } = await walk(size, slide);
    given(`${size.join('x')}: the walk opened on the first man with both sites drawn`, Boolean(tiles.p_01 && tiles.p_02)
        && (await titleOf(page)) === 'דוגמה 1', JSON.stringify(tiles));
    const before = await page.evaluate(() => [...FarkadSync._outbox.keys()]);
    await page.evaluate(() => { window.__downs.length = 0; });
    const titles = [], sliding = [];
    await tapsAt(page, MEANT.map(id => tiles[id]), pace, async () => {
        titles.push(await titleOf(page));
        sliding.push(await page.evaluate(() => window.__sliding()));
    });
    await page.waitForTimeout(400);
    const gaps = await downGaps(page);
    const tag = `${size.join('x')}, a tap every ${pace} ms${slide ? ', the next man\'s card sliding in' : ''}`;
    const paced = gaps.length === 3 && gaps.every(gap => gap >= WALK_BOUNCE);
    if (!paced && attempt < 3) {
        console.log(`  ${tag}: the page saw the presses ${gaps.join(',')} ms apart - made again in a fresh page`);
        await context.close();
        continue;
    }
    check(`${tag}: the page saw every pair of presses at least ${WALK_BOUNCE} ms apart`, paced, gaps.join(','));
    same(`${tag}: each tap came down on the man meant for it`, titles, ['דוגמה 1', 'דוגמה 2', 'דוגמה 3', 'דוגמה 4']);
    same(`${tag}: and every man has his own site`, [await sites(page, 'w_01'), await sites(page, 'w_02'), await sites(page, 'w_03'), await sites(page, 'w_04')],
        [['p_01'], ['p_02'], ['p_01'], ['p_02']]);
    same(`${tag}: one path queued for each of the four, and for nobody else`, (await page.evaluate(() => [...FarkadSync._outbox.keys()].sort()))
        .filter(path => !before.includes(path)), ['w_01', 'w_02', 'w_03', 'w_04'].map(id => `days.${DAY}.actual.${id}`));
    same(`${tag}: the walk is on the fifth man`, await titleOf(page), 'דוגמה 5');
    if (slide && pace < 600) check(`${tag}: the card was still sliding in under the taps after the first`, sliding.slice(1).every(Boolean), sliding.join(','));
    await context.close();
    break;
}

suite('the sheet that walks the evening: a double tap places one man');
for (const size of WALK_SIZES) for (const gap of [100, 150, 250]) for (const where of ['the first man', 'a man the walk has just moved to']) {
    const tag = `${size.join('x')}, ${gap} ms, ${where}`;
    let done = false;
    for (let attempt = 0; attempt < 4 && !done; attempt++) {
        const { context, page, tiles } = await walk(size);
        if (where !== 'the first man') {
            // One man placed at a deliberate pace first: the double tap lands on the walk's move.
            await page.touchscreen.tap(tiles.p_02.x, tiles.p_02.y);
            await page.waitForTimeout(500);
        }
        const first = where === 'the first man' ? 'w_01' : 'w_02';
        const next = where === 'the first man' ? 'w_02' : 'w_03';
        const before = await page.evaluate(() => [...FarkadSync._outbox.keys()]);
        await page.evaluate(() => { window.__downs.length = 0; });
        await tapsAt(page, [tiles.p_01, tiles.p_01], gap);
        await page.waitForTimeout(400);
        const [seen] = await downGaps(page);
        if (!(seen < WALK_BOUNCE)) {
            console.log(`  ${tag}: the page saw the presses ${seen} ms apart - made again in a fresh page`);
            await context.close();
            continue;
        }
        done = true;
        same(`${tag}: the man tapped is on the site, and the next man is not`, [await sites(page, first), await sites(page, next)], [['p_01'], []]);
        same(`${tag}: one path queued, his`, (await page.evaluate(() => [...FarkadSync._outbox.keys()].sort()))
            .filter(path => !before.includes(path)), [`days.${DAY}.actual.${first}`]);
        same(`${tag}: the walk is on the next man, waiting for him`, await titleOf(page), where === 'the first man' ? 'דוגמה 2' : 'דוגמה 3');
        same(`${tag}: ↶ holds the step of the man tapped`, bare(await undoSays(page)), `${where === 'the first man' ? 'דוגמה 1' : 'דוגמה 2'} נרשם באתר צפון`);
        // And the next man's own tap, after the bounce: his.
        await page.waitForTimeout(150);
        await page.touchscreen.tap(tiles.p_02.x, tiles.p_02.y);
        await page.waitForTimeout(200);
        same(`${tag}: the next tap after it is the next man's`, await sites(page, next), ['p_02']);
        await context.close();
    }
    given(`${tag}: a double tap the page saw under ${WALK_BOUNCE} ms apart was made`, done);
}
// «נעדר» twice and «דלג» twice, 150 ms apart - judged, like the sweep above, only on a pair the
// page saw under WALK_BOUNCE ms apart; one the driver's lag pushed past it is made again.
for (let attempt = 1; attempt <= 3; attempt++) {
    const { context, page } = await phone([390, 844], 2);
    await page.evaluate(() => openAssignSheet('w_01'));
    await page.waitForTimeout(200);
    const away = page.locator('#assignSheetFoot .sheet-actions button', { hasText: 'נעדר' }).first();
    const box = await away.boundingBox();
    const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const hit = await doubleTap(page, point, 150);
    const seen = await lastGap(page);
    if (!(seen < WALK_BOUNCE) && attempt < 3) {
        console.log(`  «נעדר» twice: the page saw the presses ${seen} ms apart - made again in a fresh page`);
        await context.close();
        continue;
    }
    check(`«נעדר» twice: the page saw the two presses under ${WALK_BOUNCE} ms apart`, seen < WALK_BOUNCE, String(seen));
    check('«נעדר» twice: the second tap came down on the next man\'s «נעדר»', /נעדר/.test(hit), hit);
    same('«נעדר» twice: the first man is away and the next man is not',
        await page.evaluate(day => [isAbsent(State.schedule, day, 'w_01', 'actual'), isAbsent(State.schedule, day, 'w_02', 'actual')], DAY), [true, false]);
    same('and the sheet is on the next man', bare(await page.locator('#assignSheetTitle').textContent()), 'דוגמה 2');
    await context.close();
    break;
}
for (let attempt = 1; attempt <= 3; attempt++) {
    // «דלג» twice: one man skipped.
    const { context, page } = await phone([390, 844], 2);
    await page.evaluate(() => openAssignSheet('w_01'));
    await page.waitForTimeout(200);
    const box = await page.locator('#assignSheetFoot .sheet-fwd').boundingBox();
    await doubleTap(page, { x: box.x + box.width / 2, y: box.y + box.height / 2 }, 150);
    const seen = await lastGap(page);
    if (!(seen < WALK_BOUNCE) && attempt < 3) {
        console.log(`  «דלג» twice: the page saw the presses ${seen} ms apart - made again in a fresh page`);
        await context.close();
        continue;
    }
    check(`«דלג» twice: the page saw the two presses under ${WALK_BOUNCE} ms apart`, seen < WALK_BOUNCE, String(seen));
    same('«דלג» twice: the walk skips one man, not two', bare(await page.locator('#assignSheetTitle').textContent()), 'דוגמה 2');
    await context.close();
    break;
}
{
    // The evening's run on a keyboard: a digit per man, back to back, nothing waited for.
    const { context, page } = await phone([440, 956], 2);
    await page.evaluate(() => openAssignSheet('w_01'));
    await page.waitForTimeout(200);
    for (const key of ['1', '2', '1']) await page.keyboard.press(key);
    await page.waitForTimeout(200);
    same('a digit per man, back to back: three men placed, each on his own site',
        [await sites(page, 'w_01'), await sites(page, 'w_02'), await sites(page, 'w_03')], [['p_01'], ['p_02'], ['p_01']]);
    same('and the sheet on the fourth', bare(await page.locator('#assignSheetTitle').textContent()), 'דוגמה 4');
    await context.close();
}
{
    // Opened by code, the walk takes a finger at once, as it always did; opened from a man's
    // row it is guarded as v167 made it.
    const { context, page } = await phone([390, 844], 2);
    await page.evaluate(() => openAssignSheet('w_01'));
    await page.waitForTimeout(100);
    await page.locator('#assignSheetBody .sheet-place', { hasText: 'אתר דרום' }).tap();
    await page.waitForTimeout(150);
    same('opened by code, a tile 100 ms later is a tap', await sites(page, 'w_01'), ['p_02']);
    await page.evaluate(() => closeAssignSheet());
    await page.waitForTimeout(100);
    await page.locator('#dayView .assign-row .assign-main', { hasText: 'דוגמה 10' }).first().tap();
    await page.waitForTimeout(100);
    const before = await written(page);
    await page.locator('#assignSheetBody .sheet-place', { hasText: 'אתר דרום' }).tap();
    await page.waitForTimeout(150);
    same('opened from a man\'s row, a tile 100 ms later does nothing', await written(page), before);
    await context.close();
}

// A BOUNCE IS THE SAME FINGER IN THE SAME PLACE (the third review of the hotfix). Round two's
// bounce was time alone: a quick tap on the OTHER site, less than WALK_BOUNCE_MS after the move,
// was taken for the bounce of the one before, did nothing, and every site after it went to the man
// before (on c2d315c, north-south-north-south 150-250 ms apart left אמיר and בסאם on the north site
// and nobody else). A press on another control is a tap, whatever its time. Judged only on presses
// the page saw under WALK_BOUNCE ms apart - the case the rule is for.
suite('the sheet that walks the evening: a quick tap on another site is never a bounce');
for (const size of WALK_SIZES) for (const gap of [150, 200, 250]) for (let attempt = 1; attempt <= 3; attempt++) {
    const { context, page, tiles } = await walk(size);
    const before = await page.evaluate(() => [...FarkadSync._outbox.keys()]);
    await page.evaluate(() => { window.__downs.length = 0; });
    const titles = [];
    await tapsAt(page, MEANT.map(id => tiles[id]), gap, async () => titles.push(await titleOf(page)));
    await page.waitForTimeout(400);
    const gaps = await downGaps(page);
    const tag = `${size.join('x')}, the other site every ${gap} ms`;
    const quick = gaps.length === 3 && gaps.every(seen => seen < WALK_BOUNCE);
    if (!quick && attempt < 3) {
        console.log(`  ${tag}: the page saw the presses ${gaps.join(',')} ms apart - made again in a fresh page`);
        await context.close();
        continue;
    }
    check(`${tag}: the page saw every pair of presses under ${WALK_BOUNCE} ms apart`, quick, gaps.join(','));
    same(`${tag}: each tap came down on the man meant for it`, titles, ['דוגמה 1', 'דוגמה 2', 'דוגמה 3', 'דוגמה 4']);
    same(`${tag}: and every man has his own site`, [await sites(page, 'w_01'), await sites(page, 'w_02'), await sites(page, 'w_03'), await sites(page, 'w_04')],
        [['p_01'], ['p_02'], ['p_01'], ['p_02']]);
    same(`${tag}: one path queued for each of the four`, (await page.evaluate(() => [...FarkadSync._outbox.keys()].sort()))
        .filter(path => !before.includes(path)), ['w_01', 'w_02', 'w_03', 'w_04'].map(id => `days.${DAY}.actual.${id}`));
    await context.close();
    break;
}
// WHAT NO WINDOW CAN TAKE BACK, said plainly (the third review of the hotfix). Four taps on ONE
// tile 200 ms apart, meant for four men, are - on the presses' own clock and on the glass - two of
// the very double taps the walk must take as one man each: the second and the fourth do nothing,
// two men are placed, and the sheet's title names the third, who is waiting. (The reviewers'
// "300 ms" double tap reaches the page 329-332 ms apart, inside the pace that must place every
// man; a deliberate pace is measured above.)
suite('what it costs, said plainly: one tile tapped four times 200 ms apart is two double taps');
for (let attempt = 1; attempt <= 3; attempt++) {
    const { context, page, tiles } = await walk([375, 667]);
    await page.evaluate(() => { window.__downs.length = 0; });
    await tapsAt(page, [tiles.p_01, tiles.p_01, tiles.p_01, tiles.p_01], 200);
    await page.waitForTimeout(400);
    const gaps = await downGaps(page);
    const quick = gaps.length === 3 && gaps.every(seen => seen < WALK_BOUNCE) && gaps[0] + gaps[1] >= WALK_BOUNCE;
    if (!quick && attempt < 3) {
        console.log(`  four taps on one tile: the page saw the presses ${gaps.join(',')} ms apart - made again in a fresh page`);
        await context.close();
        continue;
    }
    check('four taps on one tile: the page saw each pair under the bounce, and the first and third past it', quick, gaps.join(','));
    same('four taps on one tile: the first and the third place a man each, and the second and fourth nothing',
        [await sites(page, 'w_01'), await sites(page, 'w_02'), await sites(page, 'w_03'), await sites(page, 'w_04')], [['p_01'], ['p_01'], [], []]);
    same('and the sheet\'s title names the man it is waiting for', await titleOf(page), 'דוגמה 3');
    await context.close();
    break;
}
// ================================================================== what the guard leaves alone
// A GUARD COVERS THE WRITING CONTROLS ONLY (the second review of the hotfix): inside the window
// a surface's own «סגור», its search box and «נקה» are taps, while its writers are still held.
suite('inside the window: «סגור», the search box and «נקה» are taps; the writers are still held');
{
    // Each control tapped in a fresh opening, and the surface's deadline read at that tap: it
    // was still running.
    const inWindow = page => page.evaluate(() => typeof workerPickerGuardUntil !== 'undefined' && sheetClock() < workerPickerGuardUntil);
    const openPicker = async page => { await page.locator('#dayView .site-card .site-head-btn').first().tap(); await page.waitForTimeout(150); };
    const shut = async page => { await page.evaluate(() => closeWorkerPicker()); await page.waitForTimeout(GUARD); };
    const { context, page } = await phone([390, 844], 2);
    await openPicker(page);
    const before = await written(page);
    await page.locator('#workerPickerList .picker-row[data-worker-id="w_04"] button').tap();
    const held = await inWindow(page);
    await page.waitForTimeout(100);
    same('a site\'s picker inside its window: «+ הוסף» is still held', [held, await written(page)], [true, before]);
    await shut(page);
    await openPicker(page);
    await page.locator('#workerPickerSearch').tap();
    const searchHeld = await inWindow(page);
    await page.keyboard.type('13');
    await page.waitForTimeout(100);
    same('its search box, tapped inside the window, takes the finger and the typing',
        [searchHeld, await page.evaluate(() => document.activeElement.id), await page.locator('#workerPickerSearch').inputValue(),
            await page.evaluate(() => document.querySelectorAll('#workerPickerList .picker-row').length)], [true, 'workerPickerSearch', '13', 1]);
    await shut(page);
    await openPicker(page);
    await page.evaluate(() => { document.getElementById('workerPickerSearch').value = '13'; renderWorkerPicker(); });
    await page.locator('#workerPickerClear').tap();
    const clearHeld = await inWindow(page);
    await page.waitForTimeout(100);
    same('«נקה», tapped inside the window, empties it', [clearHeld, await page.locator('#workerPickerSearch').inputValue(),
        await page.evaluate(() => document.querySelectorAll('#workerPickerList .picker-row').length)], [true, '', 14]);
    await shut(page);
    await openPicker(page);
    // Read before the tap: closing the picker ends its window.
    const closeHeld = await inWindow(page);
    await page.locator('#workerPickerModal button[onclick="closeWorkerPicker()"]').tap();
    await page.waitForTimeout(100);
    same('and «סגור», tapped inside the window, closes it', [closeHeld, await shown(page)], [true, []]);
    same('nothing was written by any of it', await written(page), before);
    await context.close();
}
{
    const { context, page } = await phone([390, 844], 2);
    await page.locator('#dayView .tray-pending .chip-main', { hasText: 'דוגמה 3' }).tap();
    await page.waitForTimeout(200);
    // Read before the tap: closing ends the window.
    const held = await page.evaluate(() => typeof placePickerGuardUntil !== 'undefined' && sheetClock() < placePickerGuardUntil);
    await page.locator('#placePickerModal button[onclick="closePlacePicker()"]').tap();
    await page.waitForTimeout(100);
    same('«לאן הלך»: «סגור» tapped inside its window closes it', [held, await shown(page)], [true, []]);
    await context.close();
}
{
    const { context, page } = await phone([390, 844], 2);
    await page.locator('#dayView .assign-row .assign-main', { hasText: 'דוגמה 10' }).first().tap();
    await page.waitForTimeout(200);
    const held = await page.evaluate(() => sheetClock() < sheetGuardUntil);
    await page.locator('#assignSheetFoot .sheet-actions button', { hasText: 'סגור' }).tap();
    await page.waitForTimeout(100);
    same('his sheet: «סגור» tapped inside its window closes it', [held, await shown(page)], [true, []]);
    await context.close();
}

// ================================================================== a tap falls through a surface that just shut
// A TAP FALLS THROUGH A SURFACE THAT JUST SHUT (v194; docs/releases.md, v192, STILL WRONG). Every
// guard above is a surface that has just come UP under a finger. A first tap that SHUTS one - or
// redraws the control it hit - left the second tap of the double tap to whatever was underneath:
// another man's ✕ under the walking sheet's last tile, «מהיום הקודם» under the sheet's «סגור»,
// and in a man's own sheet, past its opening window, «נעדר» twice, a site twice, «שעות נוספות» and
// then «יום כפול». The page's own rule (js/ui/sheet.js, tapBefore): the same finger again, in the
// same place, on a control that was not there at the press before, is spent.
//
// Each case is made twice in every layout, as the sweeps above are: as the build has it, and - the
// control - with the rule's memory emptied between the two taps (`tapBefore = null`), which is the
// build before it and must write in at least one layout, so each sweep is shown stopping a write.
// And then what the rule must never take: a tap somewhere else at once, and a tap in the same
// place a deliberate moment later.
const FORGET = "typeof tapBefore !== 'undefined' && (tapBefore = null)";
// Every man's day but the last man's, in memory and on the disk.
const others = page => page.evaluate(day => { const strip = days => { const copy = JSON.parse(JSON.stringify((days || {})[day] || {}));
    Object.values(copy).forEach(layer => { if (layer && typeof layer === 'object') delete layer.w_14; }); return copy; };
    return JSON.stringify([strip(State.schedule.days), strip(JSON.parse(localStorage.getItem('scheduleData:v2') || '{}').days)]); }, DAY);

// (a) The walking sheet on the LAST waiting man: his tile places him, the sheet shuts, and the
// day's rows are under the finger. Thirteen men on two sites, one waiting; the sheet is opened on
// him, a tile is found whose width covers the rows' ✕ column, and the day is scrolled until a ✕
// stands exactly under that point.
async function lastMan(size) {
    const { context, page } = await phone(size, 5);
    await page.evaluate(day => {
        State.schedule.workers.slice(0, 13).forEach((worker, at) => {
            if (entriesFor(State.schedule, day, worker.id, 'actual').length) return;
            State.commit(assignPlace(State.schedule, day, worker.id, 'actual', at % 2 ? 'p_02' : 'p_01'));
        });
        hideUndo(); render();
    }, DAY);
    const open = () => page.evaluate(() => { openAssignSheet('w_14'); });
    await open();
    await page.waitForTimeout(350);
    // The ✕ column of the day's rows, and the tile over it.
    const point = await page.evaluate(() => {
        const cross = [...document.querySelectorAll('#dayView .assign-row > .btn-icon')];
        if (!cross.length) return null;
        const column = cross[0].getBoundingClientRect();
        const x = column.left + column.width / 2;
        // The topmost such tile: the undo bar comes up at the foot of the screen, in the same column.
        const tile = [...document.querySelectorAll('#assignSheetBody .sheet-place')].map(node => node.getBoundingClientRect())
            .filter(box => box.left + 6 < x && box.right - 6 > x).sort((a, b) => a.top - b.top)[0];
        return tile ? { x, y: tile.top + tile.height / 2 } : null;
    });
    if (!point) { await context.close(); return null; }
    await page.evaluate(() => closeAssignSheet());
    await page.waitForTimeout(100);
    // A ✕ the page can bring under the point, and the man it would take off.
    const victim = await page.evaluate(y => {
        const most = document.documentElement.scrollHeight - window.innerHeight;
        const node = [...document.querySelectorAll('#dayView .assign-row > .btn-icon')].find(cross => {
            const box = cross.getBoundingClientRect();
            const to = window.scrollY + box.top + box.height / 2 - y;
            return to >= 0 && to <= most;
        });
        if (!node) return null;
        const box = node.getBoundingClientRect();
        window.scrollTo(0, window.scrollY + box.top + box.height / 2 - y);
        return node.getAttribute('aria-label');
    }, point.y);
    if (!victim) { await context.close(); return null; }
    await page.waitForTimeout(250);
    await page.evaluate(() => hideUndo());
    await open();
    await page.waitForTimeout(GUARD + 100);
    return { context, page, point, victim };
}
suite('the walking sheet\'s last man: the tile places him, the sheet shuts, and the second tap takes nobody off his site');
{
    const unguarded = [];
    let runs = 0, clean = 0;
    for (const size of WALK_SIZES) for (const forget of [false, true]) for (let attempt = 0; attempt < 3; attempt++) {
        const made = await lastMan(size);
        if (!made) break;
        const { context, page, point } = made;
        const before = await others(page);
        const hit = await doubleTap(page, point, 150, forget ? () => run(page, FORGET) : null);
        const seen = await lastGap(page);
        if (!(seen < WALK_BOUNCE) && attempt < 2) { await context.close(); continue; }
        const untouched = (await others(page)) === before;
        if (forget) {
            if (!untouched) unguarded.push(`${size.join('x')} (${hit}; ${bare(await undoSays(page))})`);
        } else {
            runs++;
            const fine = untouched && (await sites(page, 'w_14')).length === 1 && (await shown(page)).length === 0
                && /^דוגמה 14 נרשם ב/.test(bare(await undoSays(page)));
            if (fine) clean++;
            else console.log(`  ${size.join('x')}: under the second tap ${hit}; ↶ says ${bare(await undoSays(page))}`);
            if (size[0] === 375) check('375x667: the second tap came down on a row\'s ✕', /btn-icon\|✕/.test(hit), hit);
        }
        await context.close();
        break;
    }
    given('the sweep ran at three phones', runs === WALK_SIZES.length, String(runs));
    same('in every layout the last man is on his site with his step on ↶, every other man is where he was, and the sheet is shut', clean, runs);
    check('and with the rule\'s memory emptied between the two taps, the second tap took a man off his site in at least one of them',
        unguarded.length > 0, unguarded.join(' / '));
}

// (b) The sheet's «סגור» over «מהיום הקודם»: the day's dock is under the sheet's foot. Yesterday
// has a record and today has men waiting, so the dock's button copies a day.
async function overCopy(size) {
    const { context, page } = await phone(size, 2);
    await page.evaluate(() => {
        ['w_01', 'w_02', 'w_03'].forEach(id => State.commit(assignPlace(State.schedule, '2026-11-10', id, 'actual', 'p_02')));
        hideUndo(); render();
    });
    await page.evaluate(() => { openAssignSheet('w_10', { stay: true }); });
    await page.waitForTimeout(GUARD + 150);
    // A point inside both «סגור» and the dock's copy button, when the two overlap.
    const point = await page.evaluate(() => {
        const close = document.querySelector('#assignSheetFoot .sheet-close').getBoundingClientRect();
        const copy = document.getElementById('copyDayBtn').getBoundingClientRect();
        const left = Math.max(close.left, copy.left) + 4, right = Math.min(close.right, copy.right) - 4;
        const top = Math.max(close.top, copy.top) + 4, bottom = Math.min(close.bottom, copy.bottom) - 4;
        return left < right && top < bottom ? { x: (left + right) / 2, y: (top + bottom) / 2 } : null;
    });
    return { context, page, point };
}
suite('the sheet\'s «סגור» over «מהיום הקודם»: the sheet shuts, and no day is copied');
{
    const unguarded = [], skipped = [];
    let runs = 0, clean = 0;
    for (const size of [[320, 568], [375, 667], [390, 844], [440, 956]]) for (const forget of [false, true]) for (let attempt = 0; attempt < 3; attempt++) {
        const { context, page, point } = await overCopy(size);
        if (!point) { skipped.push(size.join('x')); await context.close(); break; }
        const before = await written(page);
        const hit = await doubleTap(page, point, 150, forget ? () => run(page, FORGET) : null);
        const seen = await lastGap(page);
        if (!(seen < WALK_BOUNCE) && attempt < 2) { await context.close(); continue; }
        const nothing = (await written(page)) === before;
        if (forget) { if (!nothing) unguarded.push(`${size.join('x')} (${hit})`); }
        else {
            runs++;
            if (nothing && (await shown(page)).length === 0) clean++;
            else console.log(`  ${size.join('x')}: under the second tap ${hit}`);
        }
        await context.close();
        break;
    }
    if (skipped.length) console.log(`  («סגור» does not stand over the copy button at ${[...new Set(skipped)].join(', ')})`);
    given('«סגור» stands over the copy button on at least two phones', runs >= 2, String(runs));
    same('in every one of them the sheet is shut and the day, the disk and the queue are what they were', clean, runs);
    check('and with the rule\'s memory emptied between the two taps, the second tap copied the previous day in at least one of them',
        unguarded.length > 0, unguarded.join(' / '));
}

// (c) A man's own sheet, its opening window over: a control that turns into its opposite under
// the finger, or moves another one there.
async function ownSheet(size) {
    const { context, page } = await phone(size, 3);
    await page.locator('#dayView .assign-row .assign-main', { hasText: 'דוגמה 10' }).first().tap();
    await page.waitForTimeout(GUARD + 150);
    return { context, page };
}
const centre = async locator => { const box = await locator.boundingBox(); return { x: box.x + box.width / 2, y: box.y + box.height / 2 }; };
const OWN = [
    {
        what: '«נעדר»', find: page => page.locator('#assignSheetFoot .sheet-actions button', { hasText: 'נעדר' }).first(),
        after: page => page.evaluate(day => [isAbsent(State.schedule, day, 'w_10', 'actual'), entriesFor(State.schedule, day, 'w_10', 'actual').length], DAY),
        expected: [true, 0], says: 'he is away, once', undo: 'דוגמה 10 נרשם כנעדר', control: true
    },
    {
        what: 'a second site', find: page => page.locator('#assignSheetBody .sheet-place', { hasText: 'אתר דרום' }),
        after: page => sites(page, 'w_10'), expected: ['p_01', 'p_02'], says: 'he has it, once', undo: 'דוגמה 10 נרשם באתר דרום', control: true
    },
    {
        what: 'his own site', find: page => page.locator('#assignSheetBody .sheet-place', { hasText: 'אתר צפון' }),
        after: page => sites(page, 'w_10'), expected: [], says: 'it is taken off, once', undo: 'דוגמה 10 הוסר מאתר צפון'
    }
];
suite('a man\'s own sheet, after its opening window: a double tap on a control that turns into its opposite is one tap');
for (const own of OWN) {
    const unguarded = [];
    for (const size of WALK_SIZES) {
        const tag = `${size.join('x')}, ${own.what}`;
        for (const forget of [false, true]) for (let attempt = 0; attempt < 3; attempt++) {
            const { context, page } = await ownSheet(size);
            const point = await centre(own.find(page));
            const hit = await doubleTap(page, point, 150, forget ? () => run(page, FORGET) : null);
            const seen = await lastGap(page);
            if (!(seen < WALK_BOUNCE) && attempt < 2) { await context.close(); continue; }
            if (forget) {
                if (JSON.stringify(await own.after(page)) !== JSON.stringify(own.expected)) unguarded.push(`${size.join('x')} (${hit})`);
            } else {
                same(`${tag}: ${own.says}`, await own.after(page), own.expected);
                same(`${tag}: ↶ holds that step`, bare(await undoSays(page)), own.undo);
                same(`${tag}: and the sheet is still his`, [await shown(page), bare(await page.locator('#assignSheetTitle').textContent())], [['assignSheet'], 'דוגמה 10']);
            }
            await context.close();
            break;
        }
    }
    if (own.control) check(`${own.what}: with the rule's memory emptied between the two taps, the second tap undid the first in at least one layout`,
        unguarded.length > 0, unguarded.join(' / '));
}
suite('a man\'s own sheet: «שעות נוספות» draws the row again, and the second tap is never «יום כפול»');
{
    // The row is drawn again with the hours box in it, and its buttons move: the finger is swept
    // across «שעות נוספות» so that wherever «יום כפול» comes to stand, one point is under it.
    const unguarded = [];
    let runs = 0, clean = 0;
    const rateOf = page => page.evaluate(day => entryRate(entriesFor(State.schedule, day, 'w_10', 'actual')[0]), DAY);
    for (const size of WALK_SIZES) for (const part of [0.15, 0.5, 0.85]) for (const forget of [false, true]) for (let attempt = 0; attempt < 3; attempt++) {
        const { context, page } = await ownSheet(size);
        const box = await page.locator('#assignSheetBody .sheet-rate-row button', { hasText: 'שעות נוספות' }).boundingBox();
        const point = { x: box.x + box.width * part, y: box.y + box.height / 2 };
        const hit = await doubleTap(page, point, 150, forget ? () => run(page, FORGET) : null);
        const seen = await lastGap(page);
        if (!(seen < WALK_BOUNCE) && attempt < 2) { await context.close(); continue; }
        const rate = await rateOf(page);
        if (forget) { if (rate !== 'extra') unguarded.push(`${size.join('x')} at ${part} (${hit} -> ${rate})`); }
        else {
            runs++;
            if (rate === 'extra') clean++;
            else console.log(`  ${size.join('x')} at ${part}: under the second tap ${hit}, the day is ${rate}`);
        }
        await context.close();
        break;
    }
    given('the sweep ran', runs === WALK_SIZES.length * 3, String(runs));
    same('in every layout the day is «שעות נוספות»', clean, runs);
    check('and with the rule\'s memory emptied between the two taps, the second tap made it another kind of day in at least one of them',
        unguarded.length > 0, unguarded.join(' / '));
}

// EVERY SURFACE THAT SHUTS, asked nothing: the rule names none of them. Each is opened by the
// app's own function, its own way out is double tapped, and the clicks that reach the page are
// counted - one, the way out's.
suite('every surface that shuts: a double tap on its way out is one click on the page');
{
    const SURFACES = [
        { what: 'the app\'s question (askConfirm), «ביטול»', open: "void askConfirm({ title: 'בדיקה', message: 'בדיקה' })", out: '#askModal button' },
        { what: 'the WhatsApp dialog', open: 'showDayMessage()', out: '#shareModal button[onclick="closeShareModal()"]' },
        { what: '«חיפוש עובד»', open: 'openFind()', out: '#findModal button[onclick="closeFind()"]' },
        { what: '«בדיקת היום»', open: 'openDayCheck()', out: '#dayCheckModal button[onclick="closeDayCheck()"]' },
        { what: '«כרטיס עובד»', open: "openWorkerCard('w_10')", out: '#workerCardModal button[onclick="closeWorkerCard()"]' },
        { what: '«כרטיס אתר»', open: "openSiteCard('p_01')", out: '#siteCardModal button[onclick="closeSiteCard()"]' },
        { what: '«לאן הלך»', open: "openPlacePicker('w_01')", out: '#placePickerModal button[onclick="closePlacePicker()"]' },
        { what: 'a site\'s picker', open: "openWorkerPicker('p_01')", out: '#workerPickerModal button[onclick="closeWorkerPicker()"]' },
        { what: 'the ⋯ sheet', open: 'openSettings()', out: '#settingsPanel button[onclick="closeSettings()"]' },
        { what: 'the day drawer', open: 'openDayDrawer()', out: '#dayDrawer button[onclick="closeDayDrawer()"]' }
    ];
    for (const surface of SURFACES) for (let attempt = 0; attempt < 3; attempt++) {
        const { context, page } = await phone([375, 667], 2);
        await run(page, surface.open);
        await page.waitForTimeout(GUARD + 150);
        const out = page.locator(surface.out).filter({ visible: true }).last();
        given(`${surface.what}: its way out is on the screen`, await out.count() === 1);
        await out.scrollIntoViewIfNeeded();
        await page.waitForTimeout(100);
        const point = await centre(out);
        await page.evaluate(() => { window.__clicks = []; document.addEventListener('click', event => {
            const hit = event.target.closest && event.target.closest('button, a, input, label');
            window.__clicks.push(hit ? (hit.id || hit.textContent.trim().slice(0, 16)) : event.target.tagName); }); });
        const before = await written(page);
        const hit = await doubleTap(page, point, 150);
        const seen = await lastGap(page);
        if (!(seen < WALK_BOUNCE) && attempt < 2) { await context.close(); continue; }
        const clicks = await page.evaluate(() => window.__clicks);
        same(`${surface.what}: one click reached the page (under the second tap: ${hit})`, clicks.length, 1);
        same(`${surface.what}: and nothing was written`, await written(page), before);
        await context.close();
        break;
    }
}

// WHAT THE RULE NEVER TAKES.
suite('a deliberate second tap is a tap: somewhere else at once, or in the same place a moment later');
for (let attempt = 0; attempt < 3; attempt++) {
    // The sheet shut by «סגור», and 150 ms later a ✕ of a row somewhere else on the screen.
    const { context, page } = await phone([375, 667], 2);
    await page.evaluate(() => { openAssignSheet('w_10', { stay: true }); });
    await page.waitForTimeout(GUARD + 150);
    const close = await centre(page.locator('#assignSheetFoot .sheet-close'));
    const cross = await page.evaluate(() => {
        const box = [...document.querySelectorAll('#dayView .assign-row')].find(row => /דוגמה 11/.test(row.textContent)).querySelector(':scope > .btn-icon').getBoundingClientRect();
        return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
    });
    given('the ✕ is nowhere near «סגור»', Math.abs(cross.y - close.y) > 60, JSON.stringify([close, cross]));
    const started = Date.now();
    await page.touchscreen.tap(close.x, close.y);
    const wait = started + 150 - Date.now();
    if (wait > 0) await page.waitForTimeout(wait);
    await page.touchscreen.tap(cross.x, cross.y);
    await page.waitForTimeout(250);
    const seen = await lastGap(page);
    if (!(seen < WALK_BOUNCE) && attempt < 2) { await context.close(); continue; }
    check('the page saw the two presses under the bounce apart', seen < WALK_BOUNCE, String(seen));
    same('«סגור», and at once a ✕ elsewhere: the sheet is shut and the man is off his site', [await shown(page), await sites(page, 'w_11')], [[], []]);
    same('with his own step on ↶', bare(await undoSays(page)), 'דוגמה 11 הוסר מאתר צפון');
    await context.close();
    break;
}
for (const pace of [350, 450]) for (let attempt = 0; attempt < 3; attempt++) {
    // The same place, a deliberate moment later: «סגור» over the copy button, then the copy.
    const { context, page, point } = await overCopy([375, 667]);
    given('«סגור» stands over the copy button at 375x667', Boolean(point));
    const before = await written(page);
    await doubleTap(page, point, pace);
    const seen = await lastGap(page);
    if (!(seen >= WALK_BOUNCE) && attempt < 2) { await context.close(); continue; }
    check(`${pace} ms: the page saw the two presses at least the bounce apart`, seen >= WALK_BOUNCE, String(seen));
    check(`«סגור», and ${pace} ms later the button that was under it: the previous day is copied`, (await written(page)) !== before);
    same(`${pace} ms: three men, each from yesterday`, [await sites(page, 'w_01'), await sites(page, 'w_02'), await sites(page, 'w_03')], [['p_02'], ['p_02'], ['p_02']]);
    await context.close();
    break;
}
for (let attempt = 0; attempt < 3; attempt++) {
    // The same control, drawn again as it was: the day's arrow, twice, is two days.
    const { context, page } = await phone([375, 667], 2);
    const arrow = await centre(page.locator('#dayView .nav-fwd, .nav-fwd').filter({ visible: true }).first());
    const from = await page.evaluate(() => State.date);
    await doubleTap(page, arrow, 150);
    const seen = await lastGap(page);
    if (!(seen < WALK_BOUNCE) && attempt < 2) { await context.close(); continue; }
    check('the page saw the two presses under the bounce apart', seen < WALK_BOUNCE, String(seen));
    same('«יום הבא» twice, 150 ms apart: two days on, as it always was', await page.evaluate(() => State.date), from === DAY ? '2026-11-13' : null);
    await context.close();
    break;
}
{
    // A text box: the second tap of a double tap is the box's own (it selects a word).
    const { context, page } = await phone([375, 667], 2);
    await page.evaluate(() => { openWorkerPicker('p_01'); document.getElementById('workerPickerSearch').value = 'דוגמה'; });
    await page.waitForTimeout(GUARD + 150);
    await page.evaluate(() => { window.__boxClicks = 0; document.getElementById('workerPickerSearch').addEventListener('click', () => window.__boxClicks++); });
    await doubleTap(page, await centre(page.locator('#workerPickerSearch')), 150);
    same('a search box tapped twice takes both taps', await page.evaluate(() => window.__boxClicks), 2);
    await context.close();
}

suite('nothing broke on the way');
same('no page error on any phone', errors.join(' | '), '');

await browser.close();
await server.close();
report();
