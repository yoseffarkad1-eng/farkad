// Man after man off a site, at a person's pace - in a real Chromium with a touch screen, on a
// season of days, with the processor slowed four times.
//
//   node tests/removepace.browser.mjs
//
// The owner, from his phone: "when I take several workers off the seder one after another the
// app jumps, and if I force it to take two off, one of the two removals does not happen and
// things get mixed up - I wait about five seconds between them."
//
// Three faults were measured on v193, and this file is the check that would have caught each.
//
//   THE TAP THAT WAS DROPPED. A row's ✕ took no finger for 700 ms after the ✕ before it, on
//   one clock for every row, and the clock began again at every tap it dropped. Six taps 150
//   to 650 ms apart, the finger kept where the first ✕ was, took off ONE man, and nothing said
//   the other five had done nothing. A row's ✕ now ignores a press made less than 300 ms after
//   the press of the removal before it, and a press made before that removal was drawn - and
//   nothing else (rowRemoveTooSoon, js/ui/day.js).
//
//   THE JUMP. With a site's head scrolled off and the man tapped the first row showing under
//   the header, the page scrolled BACK by his row's height: everything above came down and
//   the man from under the header stood under the finger, where every other ✕ puts the man
//   below. A second tap in the same place took off a man who had not been on the screen
//   (keepDayAnchor, js/ui/day.js).
//
//   THE BAR UNDER THE FINGER. A man low on the screen taken off, the undo bar came up over the
//   place his ✕ had been, its own «בטל» and ✕ on the same side as the rows': the next tap there
//   landed on the bar's ✕ - the bar put away, the next man still on his site. A row's ✕ does
//   not leave the bar standing under the finger that pressed it (undoBarAwayFromPress,
//   js/ui/undo.js); the header's ↶ holds the step.
//
// Measured here, on a record of a season (thirty men, eight sites, more than 300 recorded
// days, advances and their entries) and with the processor slowed 4x by the browser:
//
//   - six men off one site, a tap every 400 ms, the finger kept in one place: six men, the
//     six that stood there in their order, no tap dropped, each off the page inside BOUND ms
//     of its press - before the next tap - the record on the disk without them;
//   - the same with each ✕ found again before its tap (a person aiming at named men), every
//     400 ms slowed and every 350 ms at full speed: exactly the men aimed at;
//   - a double tap 150 ms apart on one ✕: one man, at full speed and slowed;
//   - a ✕ pressed on another row while the removal before it is not drawn yet (the processor
//     slowed twenty times, 400 ms apart - no bounce): nobody - the press was aimed at a screen
//     that was no longer there; and once a removal is on the glass a ✕ on another row 350 ms
//     later is a tap, and 150 ms later is not;
//   - two removals 400 ms apart, then ↶: the bar and the arrow name the second man, and he
//     and only he comes back;
//   - the first row under the header taken off, at three phone sizes: the page does not move,
//     no row above him moves, the man below him is the one under the finger.
//   - a man low on the screen taken off, with names as long as real ones, at 320x568 and
//     390x844: the undo bar - which would stand over the place his ✕ was - is not put up, the
//     next man's ✕ is under the finger, a second tap there takes him off, and ↶ in the header
//     holds the step by name; a man high on the screen gets his bar as always.
//
// NOT a real phone: Chromium with emulated touch and a slowed processor is not his iPhone.
// The bound is this machine's, with room; what it holds is that a removal is on the glass
// well inside the pace it is tapped at.

import { chromium } from 'playwright';
import { serve } from './serve.mjs';
import { launchLocalBrowser } from './network-guard.mjs';
import { verifyServedAssets, expectedShaFor } from './treecheck.mjs';
import { suite, check, same, report } from './runner.mjs';

const root = new URL('..', import.meta.url).pathname;
const server = await serve(root);
check('the browser is served the named tree',
    (await verifyServedAssets(server.url, root, expectedShaFor(root))).ok);
const browser = await launchLocalBrowser(chromium, { executablePath: process.env.CHROME_PATH });
const errors = [];

// Each removal off the page within this long of its press, with the processor slowed 4x.
const BOUND = 400;
const SLOW = 4;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
// A measurement printed beside the checks it explains; it asserts nothing.
const note = (what, value) => console.log(`        ${what}: ${value}`);

// The season, written by the model's own functions: `big` men on the first site today.
function seedSeason([big, firstDay]) {
    const today = todayStr();
    State.schedule.workers = Array.from({ length: 30 }, (_, i) => ({ id: 'w_' + String(i + 1).padStart(2, '0'),
        name: 'דוגמה ' + (i + 1), active: i < 28, dailyRate: 380 + 10 * (i % 6), hourlyRate: 50 }));
    State.schedule.places = Array.from({ length: 8 }, (_, i) => ({ id: 'p_0' + (i + 1), name: 'אתר ' + (i + 1), active: true }));
    State.save();
    const active = State.schedule.workers.filter(worker => worker.active);
    const day = new Date(firstDay + 'T12:00:00');
    const last = new Date(today + 'T12:00:00');
    let at = 0; let days = 0;
    for (; day <= last; day.setDate(day.getDate() + 1), at += 1) {
        const date = toLocalDateStr(day);
        // Saturdays are skipped as the crew does - but never TODAY: on a Saturday the suite
        // seeded no day at all under the finger, and every check after it read an empty site
        // (the v196 gate, run on Saturday 2026-11-14). The day the phone stands on is seeded.
        if (day.getDay() === 6 && date !== today) continue;
        days += 1;
        active.forEach((worker, i) => {
            if (date === today) {
                if (i < big) assignPlace(State.schedule, date, worker.id, 'actual', 'p_01');
                else if (i < active.length - 2) assignPlace(State.schedule, date, worker.id, 'actual', 'p_0' + (2 + (i % 7)));
                return;
            }
            if ((i + at) % 11 === 0) { markAbsent(State.schedule, date, worker.id, 'actual'); return; }
            if ((i * 3 + at) % 17 === 0) return;
            assignPlace(State.schedule, date, worker.id, 'actual', 'p_0' + (((i + (at % 5)) % 8) + 1));
        });
        if (at % 2 === 0) setRimaCount(State.schedule, date, 'p_01', 3);
    }
    const back = n => { const d = new Date(today + 'T12:00:00'); d.setDate(d.getDate() - n); return toLocalDateStr(d); };
    [200, 150, 120, 90, 60, 45, 30, 17, 10, 3].forEach((ago, i) =>
        addAdvance(State.schedule, active[(i * 2) % active.length].id, back(ago), 300 + 100 * (i % 5), ''));
    State.save();
    return { days, bytes: JSON.stringify(State.schedule).length };
}

// A phone on the season, on today's day by sites, at rest. `slow` is the processor's rate.
async function phone(size, slow = 1, big = 14) {
    const context = await browser.newContext({ viewport: { width: size[0], height: size[1] }, deviceScaleFactor: 2,
        isMobile: true, hasTouch: true, serviceWorkers: 'block', timezoneId: 'Asia/Jerusalem' });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    const ready = () => page.waitForFunction(() => typeof State === 'object' && State.schedule && typeof render === 'function');
    await page.goto(server.url);
    await ready();
    const seeded = await page.evaluate(seedSeason, [big, '2025-11-16']);
    // Opened again, as a phone that has held the season for months is: the boot's own work done.
    await page.reload();
    await ready();
    await page.waitForTimeout(400);
    await page.evaluate(() => {
        State.date = todayStr(); showView('day'); setDayMode('sites'); render(); hideUndo();
        document.querySelectorAll('#accountBanner > .btn-icon, #whatsNewLine .btn-icon').forEach(node => { if (node.offsetParent) node.click(); });
        window.scrollTo(0, 0);
        // Every press on the presses' own clock, and every click on a ✕ with what it did: the
        // men on sites before it and after every listener of it, and when the page was done.
        const placed = () => { const day = (State.schedule.days[State.date] || {}).actual || {};
            return Object.keys(day).reduce((n, id) => n + ((day[id] && day[id].entries) || []).length, 0); };
        window.__downs = [];
        window.__taps = [];
        window.addEventListener('pointerdown', event => window.__downs.push(event.timeStamp), true);
        window.addEventListener('click', event => {
            const cross = event.target.closest && event.target.closest('.assign-row > .btn-icon');
            if (!cross) return;
            const tap = { label: cross.getAttribute('aria-label'), press: window.__downs[window.__downs.length - 1], before: placed(), after: null, done: null, shown: null };
            window.__taps.push(tap);
            const read = () => { if (tap.after === null) { tap.after = placed(); tap.done = performance.now(); } };
            window.addEventListener('click', read, { once: true });
            // A click the page's own rule spent (tapBefore, js/ui/sheet.js: the second tap of a
            // double tap on what slid under the finger) stops at the document and never comes
            // back up to the window: it is read in the turn after it, having reached no control.
            setTimeout(() => { window.removeEventListener('click', read); read(); }, 0);
            // And when the frame after it has been drawn.
            requestAnimationFrame(() => setTimeout(() => { tap.shown = performance.now(); }, 0));
        }, true);
    });
    const cdp = await context.newCDPSession(page);
    if (slow > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: slow });
    await page.waitForTimeout(300);
    return { context, page, cdp, seeded };
}

// The rows of the first site as they stand: each man's id and the centre of his ✕.
const crosses = page => page.evaluate(() => [...document.querySelector('#dayView .site-card').querySelectorAll('.assign-row')].map(row => {
    const box = row.querySelector(':scope > .btn-icon').getBoundingClientRect();
    return { id: row.dataset.anchor.split(':')[2], x: box.left + box.width / 2, y: box.top + box.height / 2 };
}));
const onSite = page => page.evaluate(() => workersAtPlace(State.schedule, State.date, 'p_01', State.layer));
// The men of `order` no longer on the first site, in their order.
const gone = async (p, order) => { const left = new Set(await onSite(p.page)); return order.filter(id => !left.has(id)); };
const onDisk = page => page.evaluate(() => { const day = (JSON.parse(localStorage.getItem('scheduleData:v2')).days[todayStr()] || {}).actual || {};
    return Object.keys(day).filter(id => ((day[id] && day[id].entries) || []).some(entry => entry.placeId === 'p_01')).sort(); });
const taps = page => page.evaluate(() => window.__taps.map(tap => ({ ...tap })));
const gaps = page => page.evaluate(() => window.__downs.slice(1).map((stamp, i) => Math.round(stamp - window.__downs[i])));
const undoSays = page => page.evaluate(() => { const bar = document.getElementById('undoBar');
    return { bar: bar && bar.style.display !== 'none' && bar.firstChild ? bar.firstChild.textContent.replace(/[⁦-⁩‎]/g, '') : null,
        arrow: document.getElementById('undoBtn').getAttribute('aria-label').replace(/[⁦-⁩‎]/g, '') }; });

// A finger does not wait for the page: the tap is sent and not awaited.
function tapNow(cdp, point) {
    const at = [{ x: Math.round(point.x), y: Math.round(point.y) }];
    cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at }).catch(() => {});
    cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }).catch(() => {});
}
// `count` taps `pace` ms apart; `aim(i)` answers the point of the i-th (asked shortly before it is due).
async function tapAtPace(p, count, pace, aim) {
    const t0 = Date.now();
    for (let i = 0; i < count; i += 1) {
        const early = t0 + i * pace - 100 - Date.now();
        if (early > 0) await sleep(early);
        const point = await aim(i);
        const wait = t0 + i * pace - Date.now();
        if (wait > 0) await sleep(wait);
        if (point) tapNow(p.cdp, point);
    }
    await sleep(1200);
    await p.page.waitForFunction(count => window.__taps.length >= count && window.__taps.every(tap => tap.after !== null), count, { timeout: 30000 }).catch(() => {});
}

suite('the season these are measured on');
{
    const p = await phone([390, 844]);
    check('more than 300 recorded days, thirty men, eight sites', p.seeded.days > 300, JSON.stringify(p.seeded));
    note('the record', `${p.seeded.days} days, ${Math.round(p.seeded.bytes / 1024)} KB`);
    same('fourteen men stand on the first site', (await onSite(p.page)).length, 14);
    await p.context.close();
}

// THE MACHINE IS PART OF THIS MEASUREMENT, and it is said rather than hidden. A press made before
// the removal before it was drawn is dropped ON PURPOSE (the suite further down), and slowed four
// times on a machine that is busy with something else a frame can take longer than the pace. So a
// run is judged only when the page drew every removal before the next press came down - which the
// page itself timed - and a run where it did not is made again on a fresh phone, twice at most; a
// third such run is a failure, never a pass (the same rule as tests/scroll.browser.mjs's pairs).
async function judged(count, pace, aimOf, body) {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
        const p = await phone([390, 844], SLOW);
        const order = await onSite(p.page);
        const start = await crosses(p.page);
        await tapAtPace(p, count, pace, aimOf(p, order, start));
        await sleep(600);
        const seen = await taps(p.page);
        const downs = await p.page.evaluate(() => window.__downs.slice());
        const paced = await gaps(p.page);
        const drawn = seen.map(tap => (tap.shown === null ? '-' : Math.round(tap.shown - tap.press))).join(' ');
        const inTime = seen.length === count && downs.length === count && paced.every(gap => gap >= 300)
            && seen.every((tap, i) => i === count - 1 || (tap.shown !== null && tap.shown < downs[i + 1]));
        if (!inTime && attempt < 3) {
            note(`attempt ${attempt} is not judged: the machine drew a removal later than the next press (press to frame, ms)`, drawn);
            await p.context.close();
            continue;
        }
        note('the gaps the page saw between the presses, ms', paced.join(' '));
        note('press to the frame drawn, ms', drawn);
        check(`the page saw ${count} presses 300 ms or more apart, and drew each removal before the next press`, inTime, `attempt ${attempt}: gaps ${paced.join(' ')}; frames ${drawn}`);
        await body(p, order, seen);
        await p.context.close();
        return;
    }
}

suite(`man after man, the finger kept in one place, a tap every 400 ms, the processor slowed ${SLOW}x`);
await judged(6, 400, (p, order, start) => () => start[0], async (p, order, seen) => {
    same('six taps reached a ✕', seen.length, 6);
    same('no tap was dropped: each took a man off', seen.map(tap => tap.after === tap.before - 1), [true, true, true, true, true, true]);
    same('the six men gone are the six that stood there, in their order', (await gone(p, order)), order.slice(0, 6));
    const took = seen.map(tap => Math.round(tap.done - tap.press));
    note(`press to the row off the page, ms (bound ${BOUND})`, took.join(' '));
    check(`each man is off the page inside ${BOUND} ms of his press`, took.every(ms => ms >= 0 && ms < BOUND), took.join(' '));
    same('and the disk holds the site without them', await onDisk(p.page), order.slice(6).sort());
    same('↶ names the last of them', (await undoSays(p.page)).bar, `דוגמה 6 הוסר מאתר 1`);
});

suite(`named men, each ✕ found again before its tap, every 400 ms, the processor slowed ${SLOW}x`);
// Not neighbours, and not top to bottom: the second, the fifth, the third, the ninth, the first.
const NAMED = [1, 4, 2, 8, 0];
await judged(NAMED.length, 400, (p, order) => async i => (await crosses(p.page)).find(row => row.id === order[NAMED[i]]) || null, async (p, order, seen) => {
    same('five taps reached a ✕', seen.length, 5);
    same('exactly the men aimed at are gone', (await gone(p, order)), NAMED.slice().sort((a, b) => a - b).map(i => order[i]));
    same('each tap took its man off', seen.map(tap => tap.after === tap.before - 1), [true, true, true, true, true]);
});

suite('named men every 350 ms, at full speed');
{
    const p = await phone([390, 844]);
    const order = await onSite(p.page);
    await tapAtPace(p, NAMED.length, 350, async i => (await crosses(p.page)).find(row => row.id === order[NAMED[i]]) || null);
    const paced = await gaps(p.page);
    check('the page saw the presses 300 ms or more apart', paced.length === 4 && paced.every(gap => gap >= 300), paced.join(' '));
    same('exactly the men aimed at are gone', (await gone(p, order)), NAMED.slice().sort((a, b) => a - b).map(i => order[i]));
    await p.context.close();
}

for (const slow of [1, SLOW]) {
    suite(`a double tap on one ✕, 150 ms apart, the processor ${slow > 1 ? `slowed ${slow}x` : 'at full speed'}`);
    const p = await phone([390, 844], slow);
    const order = await onSite(p.page);
    const first = (await crosses(p.page))[0];
    await tapAtPace(p, 2, 150, () => first);
    const paced = await gaps(p.page);
    check('the page saw the two presses less than 300 ms apart', paced.length === 1 && paced[0] < 300, paced.join(' '));
    same('one man is gone, the one tapped', (await gone(p, order)), [order[0]]);
    same('and the bar names him', (await undoSays(p.page)).bar, 'דוגמה 1 הוסר מאתר 1');
    // And the tap after the pair is a tap: the man now under the finger.
    await sleep(400);
    tapNow(p.cdp, first);
    await sleep(900);
    same('a tap 400 ms later takes off the man now under the finger', (await gone(p, order)), order.slice(0, 2));
    await p.context.close();
}

suite('a ✕ pressed before the removal before it is drawn takes nobody off');
{
    // Slowed twenty times the first removal is still being written and drawn when the second
    // press is made, 400 ms later - no bounce - three rows down: by the time it is heard the
    // man who stood there has come up a row and another man stands under the finger.
    const p = await phone([390, 844], 20);
    const order = await onSite(p.page);
    const rows = await crosses(p.page);
    await tapAtPace(p, 2, 400, i => rows[i === 0 ? 0 : 3]);
    await sleep(3000);
    const seen = await taps(p.page);
    const downs = await p.page.evaluate(() => window.__downs.slice());
    check('the second press was made before the first removal was drawn, and not as a bounce',
        seen.length === 2 && downs[1] - downs[0] >= 300 && seen[0].shown > downs[1], JSON.stringify([downs, seen.map(tap => tap.shown)]));
    same('one man is gone, the first one tapped', (await gone(p, order)), [order[0]]);
    await p.context.close();
}

suite('once a removal is on the glass, a ✕ on another row is a tap');
{
    const p = await phone([390, 844]);
    const order = await onSite(p.page);
    const rows = await crosses(p.page);
    // The seventh man, then the third: above him, so nothing has moved under the second tap.
    await tapAtPace(p, 2, 350, i => rows[i === 0 ? 6 : 2]);
    same('two men on two rows, 350 ms apart, are both taken off', (await gone(p, order)).sort(), [order[2], order[6]].sort());
    // And at once is not: 150 ms after a removal a ✕ anywhere is the finger of before.
    const now = await crosses(p.page);
    await sleep(500);
    await p.page.evaluate(() => { window.__taps.length = 0; });
    await tapAtPace(p, 2, 150, i => now[i === 0 ? 5 : 1]);
    same('150 ms apart on two rows, only the first is taken off', (await gone(p, order)).sort(), [order[2], order[6], now[5].id].sort());
    await p.context.close();
}

suite('two removals 400 ms apart, then ↶');
{
    const p = await phone([390, 844]);
    const order = await onSite(p.page);
    const first = (await crosses(p.page))[0];
    await tapAtPace(p, 2, 400, () => first);
    same('two men are gone', (await gone(p, order)), order.slice(0, 2));
    const says = await undoSays(p.page);
    same('the bar names the second', says.bar, 'דוגמה 2 הוסר מאתר 1');
    same('and so does the arrow', says.arrow, 'בטל: דוגמה 2 הוסר מאתר 1');
    await p.page.evaluate(() => document.getElementById('undoBtn').click());
    await sleep(300);
    same('↶ brings back the second, and only him', (await gone(p, order)), [order[0]]);
    await p.context.close();
}

suite('a click with no finger acts at once');
{
    const p = await phone([390, 844]);
    const order = await onSite(p.page);
    await p.page.evaluate(() => {
        document.querySelector('#dayView .site-card .assign-row > .btn-icon').click();
        document.querySelector('#dayView .site-card .assign-row > .btn-icon').click();
    });
    await sleep(200);
    same('two clicks from code, back to back, take off two men', (await gone(p, order)), order.slice(0, 2));
    await p.context.close();
}

for (const size of [[320, 568], [375, 667], [440, 956]]) {
    suite(`${size[0]}x${size[1]}: the first row under the header is taken off, and nothing jumps`);
    const p = await phone(size);
    const order = await onSite(p.page);
    // The site's head scrolled off, the fourth man's row one pixel under the header's foot:
    // the man above him is wholly hidden, so he is the first thing showing.
    const aim = await p.page.evaluate(async () => {
        const rows = () => [...document.querySelector('#dayView .site-card').querySelectorAll('.assign-row')];
        const floor = () => document.querySelector('#dayView .day-header').getBoundingClientRect().bottom;
        window.scrollTo(0, 200);
        await new Promise(done => setTimeout(done, 350));
        window.scrollBy(0, rows()[3].getBoundingClientRect().top - floor() + 1);
        await new Promise(done => setTimeout(done, 350));
        const box = rows()[3].querySelector(':scope > .btn-icon').getBoundingClientRect();
        window.__tops = () => { const out = {}; rows().forEach(row => { out[row.dataset.anchor.split(':')[2]] = Math.round(row.getBoundingClientRect().top); }); return out; };
        return { x: box.left + box.width / 2, y: box.top + box.height / 2, y0: Math.round(scrollY), tops: window.__tops(), floor: Math.round(floor()),
            aboveHidden: rows()[2].getBoundingClientRect().bottom <= floor(), pitch: Math.round(rows()[4].getBoundingClientRect().top - rows()[3].getBoundingClientRect().top) };
    });
    check('the man above him is wholly under the header, and his own ✕ is on the glass', aim.aboveHidden && aim.y > aim.floor, JSON.stringify(aim));
    await p.page.touchscreen.tap(aim.x, aim.y);
    await sleep(500);
    const after = await p.page.evaluate(({ x, y }) => { const node = document.elementFromPoint(x, y); const row = node && node.closest('.assign-row');
        return { y: Math.round(scrollY), tops: window.__tops(), under: row ? row.dataset.anchor.split(':')[2] : null, cross: Boolean(node && node.closest('.assign-row > .btn-icon')) }; }, aim);
    same('he is off the site', (await onSite(p.page)).includes(order[3]), false);
    same('the page did not scroll', after.y, aim.y0);
    same('the men above him are where they were', [0, 1, 2].map(i => after.tops[order[i]]), [0, 1, 2].map(i => aim.tops[order[i]]));
    same('the man below him came up into his row', after.tops[order[4]], aim.tops[order[3]]);
    same('and every man below came up by one row', [5, 6, 7].map(i => after.tops[order[i]]), [5, 6, 7].map(i => aim.tops[order[i]] - aim.pitch));
    same('the ✕ under the finger is the man below him - not the man from under the header', [after.under, after.cross], [order[4], true]);
    await p.context.close();
}

// Names as long as real ones: the bar's sentence wraps, and the bar stands taller.
const LONG = ['מוחמד אבו ראס חוסיין', 'עבד אל רחמן זועבי', "סאמר ח'טיב אבו נאדר", 'איברהים עודה סלאמה'];
for (const size of [[320, 568], [390, 844]]) {
    suite(`${size[0]}x${size[1]}: a man low on the screen is taken off, and the undo bar is not put up under the finger`);
    const p = await phone(size);
    const aim = await p.page.evaluate(async names => {
        State.schedule.workers.forEach((worker, i) => { worker.name = names[i % names.length] + ' ' + (i + 1); });
        State.schedule.places.forEach((place, i) => { place.name = 'הרצליה - מגדל הים ' + (i + 1); });
        State.commitRoster(); render(); hideUndo();
        const rows = () => [...document.querySelector('#dayView .site-card').querySelectorAll('.assign-row')];
        window.scrollTo(0, 200);
        await new Promise(done => setTimeout(done, 350));
        window.scrollBy(0, rows()[1].getBoundingClientRect().top - document.querySelector('#dayView .day-header').getBoundingClientRect().bottom - 6);
        await new Promise(done => setTimeout(done, 350));
        // Every ✕ a finger can reach: on the glass and not under the dock.
        const reach = rows().map((row, i) => { const cross = row.querySelector(':scope > .btn-icon'); const box = cross.getBoundingClientRect();
            const x = box.left + box.width / 2, y = box.top + box.height / 2; const hit = document.elementFromPoint(x, y);
            return { i, id: row.dataset.anchor.split(':')[2], x, y, ok: Boolean(hit) && cross.contains(hit) }; }).filter(row => row.ok);
        return { high: reach[0], low: reach[reach.length - 1], order: rows().map(row => row.dataset.anchor.split(':')[2]) };
    }, LONG);
    const nameOf = id => p.page.evaluate(id => State.worker(id).name, id);
    const barNow = () => p.page.evaluate(({ x, y }) => { const bar = document.getElementById('undoBar'); const node = document.elementFromPoint(x, y);
        const row = node && node.closest('.assign-row'); const arrow = document.getElementById('undoBtn');
        return { up: bar.style.display !== 'none', under: row && node.closest('.assign-row > .btn-icon') ? row.dataset.anchor.split(':')[2] : (bar.contains(node) ? 'the bar' : null),
            arrow: arrow.getAttribute('aria-label').replace(/[⁦-⁩‎]/g, ''), dim: arrow.disabled }; }, aim.low);
    await p.page.touchscreen.tap(aim.low.x, aim.low.y);
    await sleep(450);
    const after = await barNow();
    // Where the bar WOULD stand, asked of the page: put up for one reading and put away again.
    const would = await p.page.evaluate(({ x, y }) => { const bar = document.getElementById('undoBar'); bar.style.display = '';
        const box = bar.getBoundingClientRect(); const node = document.elementFromPoint(x, y); const over = bar.contains(node); bar.style.display = 'none';
        return { over, top: Math.round(box.top), bottom: Math.round(box.bottom) }; }, aim.low);
    check('the bar, had it come up, would stand over the place his ✕ was', would.over, JSON.stringify([would, Math.round(aim.low.y)]));
    same('he is off the site', (await onSite(p.page)).includes(aim.low.id), false);
    same('the bar is not up', after.up, false);
    same('the ✕ under the finger is the next man\'s', after.under, aim.order[aim.low.i + 1]);
    same('the header\'s ↶ holds the step, by his name', [after.dim, after.arrow], [false, `בטל: ${await nameOf(aim.low.id)} הוסר מהרצליה - מגדל הים 1`]);
    await p.page.touchscreen.tap(aim.low.x, aim.low.y);
    await sleep(450);
    same('a second tap in the same place takes off the next man', (await gone(p, aim.order)), [aim.order[aim.low.i], aim.order[aim.low.i + 1]]);
    same('and the bar is still not up', (await barNow()).up, false);
    // Higher on the screen nothing changed: the bar comes up and names him.
    await sleep(400);
    await p.page.touchscreen.tap(aim.high.x, aim.high.y);
    await sleep(450);
    const top = await p.page.evaluate(() => { const bar = document.getElementById('undoBar');
        return { up: bar.style.display !== 'none', says: bar.firstChild ? bar.firstChild.textContent.replace(/[⁦-⁩‎]/g, '') : null }; });
    same('a man high on the screen taken off: the bar comes up and names him', [top.up, top.says], [true, `${await nameOf(aim.high.id)} הוסר מהרצליה - מגדל הים 1`]);
    await p.context.close();
}

// ---------------------------------------------------------------------------- the two trays
//
// THE SAME CLOCK STOOD ON THE TRAYS (trayTapTooSoon, js/ui/day.js): the ✕ of «נעדרים», «נעדר»
// and the usual-site chip took no finger for 700 ms after the last write on either tray, from
// the last tap whether or not it was let through - so absences cancelled one after another, or
// men marked absent one after another, at a person's pace, were one man however many taps
// (with the rule taken out this section is red on exactly those lines). The same act again on
// the next man is now judged as a row's ✕ is: 300 ms from the last press let through, and not
// before the write before it was drawn. And ONLY the same act: a control of another kind that
// comes up under the finger is held for the whole 700 ms, as it has been since v190 - a man
// nobody touched is not marked absent and nobody's absence is cancelled by a finger that meant
// something else. The usual chip, man after man and double tapped, is tests/usual.browser.mjs.
const AWAY_SIDE = `#dayView .tray-absent .chip .chip-side`;
const WAIT_SIDE = `#dayView .tray-pending .chip > .chip-side`;
// Today restaged: eight of the men on the other sites absent, eight more with nothing recorded.
async function trays(slow = 1) {
    const p = await phone([390, 844], 1);
    await p.page.evaluate(() => {
        const today = todayStr();
        const elsewhere = State.schedule.workers.filter(worker => worker.active
            && !workersAtPlace(State.schedule, today, 'p_01', 'actual').includes(worker.id)
            && entriesFor(State.schedule, today, worker.id, 'actual').length > 0);
        elsewhere.slice(0, 8).forEach(worker => { clearWorkerDay(State.schedule, today, worker.id, 'actual'); markAbsent(State.schedule, today, worker.id, 'actual'); });
        elsewhere.slice(8, 14).forEach(worker => clearWorkerDay(State.schedule, today, worker.id, 'actual'));
        State.save(); render(); hideUndo();
        window.__writes = [];
        window.addEventListener('click', event => {
            const side = event.target.closest && event.target.closest('.tray .chip-side');
            if (!side) return;
            const tap = { label: side.getAttribute('aria-label'), press: window.__downs[window.__downs.length - 1], shown: null };
            window.__writes.push(tap);
            requestAnimationFrame(() => setTimeout(() => { tap.shown = performance.now(); }, 0));
        }, true);
    });
    if (slow > 1) await p.cdp.send('Emulation.setCPUThrottlingRate', { rate: slow });
    await sleep(300);
    return p;
}
const awayNow = page => page.evaluate(() => State.absentToday().map(worker => worker.id));
const waitingNow = page => page.evaluate(() => State.unrecorded().map(worker => worker.id));
// The first control `selector` finds, brought to a third of the way down the glass (clear of the
// undo bar), and its centre.
async function firstOf(page, selector, bring) {
    return page.evaluate(async ([selector, bring]) => {
        const find = () => document.querySelector(selector);
        if (bring) {
            for (let pass = 0; pass < 3; pass += 1) {
                window.scrollTo(0, Math.max(0, scrollY + find().getBoundingClientRect().top - innerHeight * 0.33));
                await new Promise(done => setTimeout(done, 120));
            }
        }
        const node = find();
        if (!node) return null;
        const box = node.getBoundingClientRect();
        return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
    }, [selector, bring]);
}
// `count` taps on the first `selector` as it stands at each tap, `pace` ms apart; judged only when
// the page saw every press 300 ms or more after the one before and drew each write before the
// next press (the rule of `judged`, above): made again on a fresh phone twice at most.
async function trayPace(what, selector, count, pace, slow, body) {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
        const p = await trays(slow);
        const before = { away: await awayNow(p.page), waiting: await waitingNow(p.page) };
        await firstOf(p.page, selector, true);
        await sleep(500);
        await p.page.evaluate(() => { window.__downs.length = 0; });
        const t0 = Date.now();
        for (let i = 0; i < count; i += 1) {
            const early = t0 + i * pace - 100 - Date.now();
            if (early > 0) await sleep(early);
            const point = await firstOf(p.page, selector, false);
            const wait = t0 + i * pace - Date.now();
            if (wait > 0) await sleep(wait);
            if (point) tapNow(p.cdp, point);
        }
        await sleep(slow > 1 ? 2500 : 1200);
        const downs = await p.page.evaluate(() => window.__downs.slice());
        const seen = await p.page.evaluate(() => window.__writes.map(tap => ({ ...tap })));
        const paced = downs.slice(1).map((stamp, i) => Math.round(stamp - downs[i]));
        const inTime = downs.length === count && seen.length === count && paced.every(gap => gap >= 300)
            && seen.every((tap, i) => i === count - 1 || (tap.shown !== null && tap.shown < downs[i + 1]));
        if (!inTime && attempt < 3) {
            note(`attempt ${attempt} is not judged: a press under 300 ms after the last, or a write drawn later than the next press`, paced.join(' '));
            await p.context.close();
            continue;
        }
        note('the gaps the page saw between the presses, ms', paced.join(' '));
        check(`${what}: the page saw ${count} presses 300 ms or more apart, each write drawn before the next press`, inTime, `attempt ${attempt}: gaps ${paced.join(' ')}`);
        await body(p, before);
        await p.context.close();
        return;
    }
}

for (const [pace, slow] of [[350, 1], [400, SLOW]]) {
    const speed = slow > 1 ? `the processor slowed ${slow}x` : 'at full speed';
    suite(`absences cancelled one after another, a tap every ${pace} ms, ${speed}`);
    await trayPace('«נעדרים» ✕', AWAY_SIDE, 6, pace, slow, async (p, before) => {
        same('eight men were absent', before.away.length, 8);
        const away = await awayNow(p.page);
        same('six taps cancelled six absences - no tap dropped', before.away.length - away.length, 6);
        same('each of the six is waiting again, and nobody else moved', (await waitingNow(p.page)).sort(),
            before.waiting.concat(before.away.filter(id => !away.includes(id))).sort());
    });
    suite(`men marked absent one after another, a tap every ${pace} ms, ${speed}`);
    await trayPace('«נעדר»', WAIT_SIDE, 5, pace, slow, async (p, before) => {
        const waiting = await waitingNow(p.page);
        same('five taps marked five men absent - no tap dropped', before.waiting.length - waiting.length, 5);
        same('the five are the first five that waited, and nobody else moved', (await awayNow(p.page)).sort(),
            before.away.concat(before.waiting.slice(0, 5)).sort());
    });
}

suite('a double tap on a ✕ of «נעדרים», 150 ms apart, is one man; the tap after it is a tap');
for (let attempt = 1; attempt <= 3; attempt += 1) {
    const p = await trays();
    const before = await awayNow(p.page);
    const point = await firstOf(p.page, AWAY_SIDE, true);
    await sleep(500);
    await p.page.evaluate(() => { window.__downs.length = 0; });
    tapNow(p.cdp, point);
    await sleep(150);
    tapNow(p.cdp, point);
    await sleep(700);
    const paced = await gaps(p.page);
    if (!(paced.length === 1 && paced[0] < 300) && attempt < 3) { await p.context.close(); continue; }
    check('the page saw the two presses less than 300 ms apart', paced.length === 1 && paced[0] < 300, paced.join(' '));
    same('one absence is cancelled, the first man\'s', (await awayNow(p.page)), before.slice(1));
    tapNow(p.cdp, await firstOf(p.page, AWAY_SIDE, false));
    await sleep(700);
    same('a tap after the pair cancels the next man\'s', (await awayNow(p.page)), before.slice(2));
    await p.context.close();
    break;
}

suite('another kind of control under the finger is held as it was: 400 ms after «נעדר», a ✕ of «נעדרים» cancels nothing');
{
    const p = await trays();
    const before = { away: await awayNow(p.page), waiting: await waitingNow(p.page) };
    const mark = await firstOf(p.page, WAIT_SIDE, true);
    await sleep(500);
    await p.page.evaluate(() => { window.__downs.length = 0; });
    tapNow(p.cdp, mark);
    await sleep(300);
    const cancel = await firstOf(p.page, AWAY_SIDE, false);
    await sleep(100);
    tapNow(p.cdp, cancel);
    await sleep(500);
    const paced = await gaps(p.page);
    const hit = await p.page.evaluate(() => window.__writes.map(tap => tap.label.replace(/[⁦-⁩‎]/g, '').split(' ')[0]));
    check('the second press came 300 to 700 ms after the first, on a ✕ of «נעדרים»', paced.length === 1 && paced[0] >= 300 && paced[0] < 700 && hit.length === 2 && hit[1] === 'בטל',
        JSON.stringify([paced, hit]));
    same('the first man waiting is absent, and no absence was cancelled', (await awayNow(p.page)).sort(), before.away.concat(before.waiting[0]).sort());
    // And 700 ms on it is a tap, as it always was.
    await sleep(800);
    tapNow(p.cdp, await firstOf(p.page, AWAY_SIDE, false));
    await sleep(500);
    same('after the window the ✕ cancels one absence', (await awayNow(p.page)).length, before.away.length);
    await p.context.close();
}

same('no page error', errors, []);
await browser.close();
await server.close();
report();
