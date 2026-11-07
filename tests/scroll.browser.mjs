// The day screen keeps its place (v166): what a person was looking at stays where it was
// through every operation that redraws the day, and what is MEANT to move still moves.
//
//   node tests/scroll.browser.mjs            (WITH_WEBKIT=1 adds Playwright's WebKit)
//
// THE JUMP. Every commit on the day screen - a ✕, «בטל» on the undo bar, ↶ and ↷, a man
// added from a site's picker, a site chosen for a man in the tray, a rate, a Rima count -
// and every snapshot adopted from the other phone goes through render(), and renderDay
// used to empty #dayView, append the header alone and then ask window.scrollY
// (readDayScroll). That question forced a layout of a page one header tall, the browser
// clamped the scroll to 0, and the compact header went with it: every tap threw the owner
// back to the top of the day. He saw it on every tap, on his iPhone.
//
// Measured here at three phone sizes, dark, at 3x, with touch: the page does not move,
// the rows the person could see stay where they were, renderDay's own read never sees a
// clamped scroll, and every site's count on screen is the record's - in memory and on the
// disk - after every operation. And what must still move does: a new date starts at the
// top of the day, and the header still compacts and comes back.
//
// Not measured anywhere: a real iPhone. Playwright's WebKit is not iOS Safari - no
// keyboard, no visual viewport that shrinks under it, no rubber band.
//
// THE SECOND TAP. With the page held still, the man below a ✕ slides up under the finger,
// and in a site's picker «+ הוסף» turns into «✓ נמצא» under it. A double tap - 120 ms,
// 400 ms - took off two men of one site, and added a man and took him straight off again
// ("I added him twice and he was deleted"). Inside 700 ms (DOUBLE_TAP_GUARD_MS, js/ui/day.js)
// the second tap is the first one again and does nothing; at 900 ms it is a decision of its
// own and does what its button says. The same for a site in the tray's «לאן הלך» and the ✕
// on a chip in «נעדרים». And coming back to the day from the week keeps the
// window where it was - pinned on purpose: the top it used to land on was the clamp's doing.

import { chromium, webkit } from 'playwright';
import { launchLocalBrowser } from './network-guard.mjs';
import { serve } from './serve.mjs';
import { expectedShaFor, verifyServedAssets } from './treecheck.mjs';
import { suite, check, same, given, report } from './runner.mjs';

const root = new URL('..', import.meta.url).pathname;
const server = await serve(root);
const served = await verifyServedAssets(server.url, root, expectedShaFor(root));
check('the origin served this commit, byte for byte', served.ok,
    `${served.checked} assets; ${(served.wrong || []).slice(0, 3).join(' | ')}`);

const engines = [['chromium', await launchLocalBrowser(chromium, { executablePath: process.env.CHROME_PATH })]];
if (process.env.WITH_WEBKIT === '1') engines.push(['webkit', await webkit.launch()]);

// A Thursday, the owner's eight sites in roster order and who is on each: a long card,
// empty cards, a card with one man, one man nobody has placed yet (the tray) and four who
// were away (the tray under it - which also leaves the page room to scroll below the
// first tray). Every card carries its רימא box; חולון already holds a count.
const DATE = '2026-11-05';
const SITES = [
    ['p1', 'פרדסיה', ['דוד לוי', 'משה כהן']],
    ['p2', 'תל אביב', ['יוסי מזרחי', 'אבי פרץ', 'רון ביטון', 'עמית דהן', 'אלי אברהם', 'שי פרידמן', 'נועם חדד', 'עומר עזרא']],
    ['p3', 'גדרה', []],
    ['p4', 'חולון', ['יונתן גבאי', 'איתי שלום', 'אורי עמר', 'גיל חזן']],
    ['p5', 'רמת גן', []],
    ['p6', 'נשר', ['בני אוחיון']],
    ['p7', 'אשקלון', []],
    ['p8', 'אשדוד', []]];
const SPARE = 'עובד נוסף';
const AWAY = ['חיים לוי', 'מאיר כהן', 'שלמה פרץ', 'אהרון דהן'];
const RIMA = { p4: 2 };
const bare = text => String(text || '').replace(/[⁦-⁩]/g, '');

async function open(browser, width, height, mode = 'sites', away = AWAY) {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 3,
        isMobile: true, hasTouch: true, colorScheme: 'dark', serviceWorkers: 'block' });
    await context.route('**/*', route => {
        const url = new URL(route.request().url());
        return ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
            || ['data:', 'blob:', 'about:'].includes(url.protocol) ? route.continue() : route.abort();
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    // Console errors are kept too, for the cases below that ask for none during one step.
    page.__console = [];
    page.on('console', message => { if (message.type() === 'error') page.__console.push(message.text()); });
    await page.goto(server.url, { waitUntil: 'load' });
    await page.evaluate(([sites, spare, away, rima, date, mode]) => {
        todayStr = () => date;
        const workers = [], plan = [];
        sites.forEach(([placeId, , names]) => names.forEach(name => {
            const id = 'w' + String(workers.length + 1).padStart(2, '0');
            workers.push({ id, name, active: true, dailyRate: 400 });
            plan.push([id, placeId]);
        }));
        workers.push({ id: 'w' + String(workers.length + 1).padStart(2, '0'), name: spare, active: true, dailyRate: 400 });
        const absent = away.map(name => {
            const id = 'w' + String(workers.length + 1).padStart(2, '0');
            workers.push({ id, name, active: true, dailyRate: 400 });
            return id;
        });
        State.schedule.workers = workers;
        State.schedule.places = sites.map(([id, name]) => ({ id, name, active: true }));
        State.date = date;
        plan.forEach(([workerId, placeId]) => assignPlace(State.schedule, date, workerId, 'actual', placeId));
        absent.forEach(workerId => markAbsent(State.schedule, date, workerId, 'actual'));
        Object.keys(rima).forEach(placeId => setRimaCount(State.schedule, date, placeId, rima[placeId]));
        State.save();
        showView('day'); setDayMode(mode); render();
        // The account notice sits above the day; put away, so the page under it is the day.
        const banner = document.getElementById('accountBanner');
        const putAway = banner && banner.style.display !== 'none' && banner.querySelector(':scope > .btn-icon');
        if (putAway) putAway.click();

        // What renderDay's own scroll read sees - the white-box half of the checks below.
        const read = window.readDayScroll;
        window.__seen = [];
        window.readDayScroll = function () { window.__seen.push(Math.round(scrollY)); return read.apply(this, arguments); };
        window.__idOf = name => (State.schedule.workers.find(worker => worker.name === name) || {}).id;
        window.__nameOf = node => (node && node.firstChild ? node.firstChild.textContent.trim() : null);
        window.__card = site => [...document.querySelectorAll('#dayView .site-card')]
            .find(card => card.querySelector('.site-name').textContent === site) || null;
        window.__row = (site, name) => {
            const card = __card(site);
            return card ? [...card.querySelectorAll('.assign-row')]
                .find(row => __nameOf(row.querySelector('.assign-name')) === name) || null : null;
        };
        window.__wrow = name => [...document.querySelectorAll('#dayView .wrow')]
            .find(row => __nameOf(row.querySelector('.wrow-name')) === name) || null;
        window.__rima = site => { const card = __card(site); return card ? card.querySelector('.rima-input') : null; };
        // Every click the page dispatches, on the page's own clock - the one the double-tap
        // guard reads (secondTapTooSoon, js/ui/day.js).
        window.__clicks = [];
        document.addEventListener('click', () => window.__clicks.push(performance.now()), true);
        // Everything a person reads on the day, by what it IS rather than by where it is:
        // each site's head, each man's row, each רימא box, each row of the by-worker list.
        // Visible under the sticky header only, unless asked for all of them.
        window.__marks = all => {
            const floor = document.querySelector('#dayView .day-header').getBoundingClientRect().bottom;
            const seen = [];
            const add = (id, node) => {
                if (!node) return;
                const box = node.getBoundingClientRect();
                if (box.height > 0 && (all || (box.bottom > floor + 1 && box.top < innerHeight))) {
                    seen.push({ id, top: Math.round(box.top) });
                }
            };
            document.querySelectorAll('#dayView .site-card').forEach(card => {
                const site = card.querySelector('.site-name').textContent;
                add(site, card.querySelector('.site-head'));
                card.querySelectorAll('.assign-row').forEach(row =>
                    add(`${site} · ${__nameOf(row.querySelector('.assign-name'))}`, row));
                add(`${site} · רימא`, card.querySelector('.rima-field'));
            });
            document.querySelectorAll('#dayView .wrow').forEach(row => add(__nameOf(row.querySelector('.wrow-name')), row));
            return seen;
        };
    }, [SITES, SPARE, away, RIMA, DATE, mode]);
    await frames(page);
    return { context, page, errors };
}

const frames = page => page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
const settle = (page, ms = 60) => page.evaluate(ms => new Promise(done =>
    setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(done)), ms)), ms);
const scrolled = page => page.evaluate(() => Math.round(scrollY));
const compact = page => page.evaluate(() => document.body.classList.contains('day-compact'));
const view = page => page.evaluate(() => ({ y: Math.round(scrollY), marks: __marks(true),
    compact: document.body.classList.contains('day-compact'), seen: __seen.slice() }));
const at = (marks, id) => { const mark = marks.find(one => one.id === id); return mark ? mark.top : null; };

// The day's men whose record changed since `was`, each with the site(s) he had before.
const dayRecord = page => page.evaluate(() => JSON.stringify(State.schedule.days[State.date].actual));
const changedSince = (page, was) => page.evaluate(was => {
    const a = JSON.parse(was), b = State.schedule.days[State.date].actual;
    return Object.keys({ ...a, ...b }).filter(id => JSON.stringify(a[id]) !== JSON.stringify(b[id]))
        .map(id => `${State.worker(id).name} (${(a[id] && a[id].entries || []).map(entry => State.place(entry.placeId).name).join(',')})`)
        .sort();
}, was);
// What the undo bar says, without the bidi marks; null when it is not showing.
const undoSays = page => page.evaluate(() => {
    const bar = document.getElementById('undoBar');
    return bar && bar.style.display !== 'none' && bar.firstChild
        ? bar.firstChild.textContent.replace(/[⁦-⁩]/g, '') : null;
});
// One man in an open site picker: what his button says, and whether the record holds him
// at that site - in memory and read back from the disk.
const pickedAt = (page, name, placeId) => page.evaluate(([name, placeId]) => {
    const id = __idOf(name);
    const button = document.querySelector(`#workerPickerList .picker-row[data-worker-id="${id}"] button`);
    const disk = JSON.parse(Store.get('scheduleData:v2'));
    return { button: button ? button.textContent : null, pressed: button ? button.getAttribute('aria-pressed') : null,
        live: workersAtPlace(State.schedule, State.date, placeId, 'actual').includes(id),
        disk: workersAtPlace(disk, State.date, placeId, 'actual').includes(id) };
}, [name, placeId]);
const pickerButton = name => `() => [...document.querySelectorAll('#workerPickerList .picker-row')]
    .find(row => row.querySelector('.picker-name').firstChild.textContent.trim() === '${name}').querySelector('button')`;

// The node a page-side expression names, brought to a fraction of the screen's height.
// Three passes, because compacting the header moves everything under it.
async function bring(page, find, fraction) {
    for (let pass = 0; pass < 3; pass++) {
        await page.evaluate(([find, fraction]) => {
            const node = (0, eval)(find)();
            if (node) window.scrollTo(0, Math.max(0, scrollY + node.getBoundingClientRect().top - innerHeight * fraction));
        }, [find, fraction]);
        await frames(page);
    }
}

// A finger on the middle of what the expression names. Null, and no tap, if it is gone.
async function tap(page, find) {
    const point = await page.evaluate(find => {
        const node = (0, eval)(find)();
        if (!node) return null;
        const box = node.getBoundingClientRect();
        return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
    }, find);
    if (point) await page.touchscreen.tap(point.x, point.y);
    return point;
}

// The first thing the person could see under the header BEFORE that is still on the page
// AFTER, and where it is now - the honest question when something above the screen grew
// or shrank, which is when the page MUST move by exactly that much.
function held(before, after, gone = []) {
    const first = before.marks.find(mark => !gone.includes(mark.id) && at(after.marks, mark.id) !== null);
    return first ? { id: first.id, was: first.top, now: at(after.marks, first.id) } : { id: null, was: null, now: null };
}

// Where the page HAD to scroll to keep a row in place, to within a pixel: the distance is
// fractional at 3x and a scroll offset is not, so a row put back can land a rounding away.
// Where nothing should move at all, the checks are exact.
function kept(name, mark) {
    check(name, mark.id !== null && mark.now !== null && Math.abs(mark.now - mark.was) <= 1,
        JSON.stringify(mark));
}

// Each site's number on the screen against the record in memory AND the record read back
// from the disk; each רימא box against the same two (a box being typed in is skipped -
// what it shows then is the person's, not the record's).
async function screenAgrees(page) {
    return page.evaluate(date => {
        const disk = JSON.parse(Store.get('scheduleData:v2') || 'null');
        const wrong = [];
        document.querySelectorAll('#dayView .site-card').forEach(card => {
            const name = card.querySelector('.site-name').textContent;
            const place = State.schedule.places.find(one => one.name === name);
            const shown = Number(card.querySelector('.site-count').textContent);
            const record = workersAtPlace(State.schedule, date, place.id, 'actual').length;
            const saved = disk ? workersAtPlace(disk, date, place.id, 'actual').length : NaN;
            if (shown !== record || shown !== saved) wrong.push(`${name}: shown ${shown}, record ${record}, disk ${saved}`);
            const box = card.querySelector('.rima-input');
            if (box && box !== document.activeElement) {
                const typed = box.value === '' ? 0 : Number(box.value);
                const stored = rimaCount(State.schedule, date, place.id);
                const onDisk = disk ? rimaCount(disk, date, place.id) : NaN;
                if (typed !== stored || typed !== onDisk) wrong.push(`${name} רימא: shown ${typed}, record ${stored}, disk ${onDisk}`);
            }
        });
        return wrong;
    }, DATE);
}

// The double-tap guard's window, DOUBLE_TAP_GUARD_MS in js/ui/day.js.
const WINDOW = 700;
class OutOfWindow extends Error {}

// A case built on two taps at one point, `gap` ms apart. The guard decides by the PAGE's
// clock, and on a loaded machine the page can see two taps sent 400 ms apart more than
// 700 ms apart, or two sent 900 ms apart closer than that - so the gap the page saw is
// measured, and a case is judged only on a pair the page saw on the intended side of the
// window. A pair that landed on the other side is tried again in a fresh page, twice at
// most, and a third such pair is a failure, never a pass.
async function pairScenario(browser, tag, name, size, gap, body) {
    const inside = gap < WINDOW;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
        const { context, page, errors } = await open(browser, size[0], size[1]);
        const pair = async find => {
            await page.evaluate(() => { window.__clicks.length = 0; });
            const point = await tap(page, find);
            await page.waitForTimeout(gap);
            await page.touchscreen.tap(point.x, point.y);
            await settle(page, 250);
            const clicks = await page.evaluate(() => window.__clicks.slice());
            const seen = clicks.length === 2 ? Math.round(clicks[1] - clicks[0]) : null;
            const ok = seen !== null && (inside ? seen < WINDOW : seen >= WINDOW);
            if (!ok && attempt < 3) throw new OutOfWindow(String(seen));
            check(`${tag}: ${name}: the page saw the two taps ${inside ? 'inside' : 'outside'} the ${WINDOW} ms window`, ok,
                `sent ${gap} ms apart, seen ${seen} ms apart${attempt > 1 ? `, attempt ${attempt}` : ''}`);
            return point;
        };
        try {
            await body(page, pair);
        } catch (error) {
            if (error instanceof OutOfWindow) { await context.close(); continue; }
            check(`${tag}: ${name} ran to its end`, false, String(error && error.message || error).split('\n')[0]);
        }
        same(`${tag}: ${name}: no page error`, errors, []);
        await context.close();
        return;
    }
}

// One case in its own fresh page. A case that throws is a failed check with its reason,
// never a run that stops without a count.
async function scenario(browser, tag, name, size, body, mode, away) {
    const { context, page, errors } = await open(browser, size[0], size[1], mode, away);
    try {
        await body(page);
    } catch (error) {
        check(`${tag}: ${name} ran to its end`, false, String(error && error.message || error).split('\n')[0]);
    }
    same(`${tag}: ${name}: no page error`, errors, []);
    await context.close();
}

try {
  for (const [engine, browser] of engines) {
    for (const size of [[440, 894], [390, 844], [375, 667]]) {
        const tag = `${engine} ${size[0]}x${size[1]}`;
        suite(`${tag}: an operation on the day leaves the list where the thumb left it`);

        // 1. ✕ on a row with its card's head under the sticky header; then «בטל» on the bar.
        await scenario(browser, tag, '✕ under the header, then «בטל»', size, async page => {
            await bring(page, `() => __card('תל אביב').querySelector('.site-head')`, 0.27);
            const before = await view(page);
            given(`${tag}: scrolled into the list, the header compact`, before.y > 72 && before.compact,
                JSON.stringify([before.y, before.compact]));
            await page.evaluate(() => { __seen = []; });
            const finger = await tap(page, `() => __row('תל אביב', 'אבי פרץ').querySelector(':scope > .btn-icon')`);
            await settle(page);
            const after = await view(page);
            check(`${tag}: ✕ took that man off that site`, await page.evaluate(() => !__row('תל אביב', 'אבי פרץ')
                && !workersAtPlace(State.schedule, State.date, 'p2', 'actual').includes(__idOf('אבי פרץ'))));
            same(`${tag}: ✕ leaves the page where it was`, after.y, before.y);
            same(`${tag}: the card's head and the man above stay where they were`,
                [at(after.marks, 'תל אביב'), at(after.marks, 'תל אביב · יוסי מזרחי')],
                [at(before.marks, 'תל אביב'), at(before.marks, 'תל אביב · יוסי מזרחי')]);
            check(`${tag}: renderDay read the scroll the person left, never a clamped one`,
                after.seen.length > 0 && after.seen.every(value => value === before.y), JSON.stringify([after.seen, before.y]));
            check(`${tag}: the header stays compact`, after.compact);
            same(`${tag}: after ✕ every count on screen is the record's, in memory and on disk`, await screenAgrees(page), []);
            const under = await page.evaluate(([x, y]) => {
                const card = (document.elementFromPoint(x, y) || document.body).closest('.site-card');
                return card ? card.querySelector('.site-name').textContent : null;
            }, [finger.x, finger.y]);
            same(`${tag}: what is under the finger now is still תל אביב`, under, 'תל אביב');

            await tap(page, `() => document.querySelector('#undoBar .btn-secondary')`);
            await settle(page);
            const undone = await view(page);
            check(`${tag}: «בטל» put him back`, await page.evaluate(() => Boolean(__row('תל אביב', 'אבי פרץ'))));
            same(`${tag}: «בטל» leaves the page where it was`, undone.y, before.y);
            same(`${tag}: and he is back in his own row, where it was`,
                at(undone.marks, 'תל אביב · אבי פרץ'), at(before.marks, 'תל אביב · אבי פרץ'));
            same(`${tag}: after «בטל» every count on screen is the record's`, await screenAgrees(page), []);
        });

        // 2. The header's ↶ and ↷. They are on the tools row, which the compact header
        //    hides, so they are reached with the page a little way down and the header full.
        await scenario(browser, tag, 'the header\'s ↶ and ↷', size, async page => {
            await page.evaluate(() => window.scrollTo(0, 50));
            await frames(page);
            const before = await view(page);
            given(`${tag}: a little way down, the header full`, before.y === 50 && !before.compact, JSON.stringify([before.y, before.compact]));
            await tap(page, `() => __row('פרדסיה', 'משה כהן').querySelector(':scope > .btn-icon')`);
            await settle(page);
            const removed = await view(page);
            check(`${tag}: ✕ took him off`, await page.evaluate(() => !__row('פרדסיה', 'משה כהן')));
            same(`${tag}: ✕ a little way down leaves the page where it was`, removed.y, 50);
            same(`${tag}: and פרדסיה's head where it was`, at(removed.marks, 'פרדסיה'), at(before.marks, 'פרדסיה'));
            await tap(page, `() => document.getElementById('undoBtn')`);
            await settle(page);
            const undone = await view(page);
            check(`${tag}: the header's ↶ put him back`, await page.evaluate(() => Boolean(__row('פרדסיה', 'משה כהן'))));
            same(`${tag}: ↶ leaves the page where it was`, undone.y, 50);
            same(`${tag}: and his row where it was`, at(undone.marks, 'פרדסיה · משה כהן'), at(before.marks, 'פרדסיה · משה כהן'));
            same(`${tag}: after ↶ every count on screen is the record's`, await screenAgrees(page), []);
            await tap(page, `() => document.getElementById('redoBtn')`);
            await settle(page);
            const redone = await view(page);
            check(`${tag}: ↷ took him off again`, await page.evaluate(() => !__row('פרדסיה', 'משה כהן')));
            same(`${tag}: ↷ leaves the page where it was`, redone.y, 50);
            same(`${tag}: after ↷ every count on screen is the record's`, await screenAgrees(page), []);
        });

        // 3. ✕ deep in the list: the last man of a card low on the screen, and a card's
        //    only man (the card turns empty under the finger). Then a reload: the disk.
        await scenario(browser, tag, '✕ deep in the list', size, async page => {
            await bring(page, `() => __row('חולון', 'גיל חזן')`, 0.6);
            const before = await view(page);
            await tap(page, `() => __row('חולון', 'גיל חזן').querySelector(':scope > .btn-icon')`);
            await settle(page);
            const after = await view(page);
            check(`${tag}: ✕ low on the screen took him off`, await page.evaluate(() => !__row('חולון', 'גיל חזן')));
            same(`${tag}: ✕ low on the screen leaves the page where it was`, after.y, before.y);
            same(`${tag}: the man above him stays where he was`, at(after.marks, 'חולון · אורי עמר'), at(before.marks, 'חולון · אורי עמר'));
            same(`${tag}: after ✕ low on the screen every count is the record's`, await screenAgrees(page), []);

            // A second ✕ is a second decision, made after the first was seen - not inside the
            // 700 ms in which a ✕ is taken for the first one again (DOUBLE_TAP_GUARD_MS).
            await page.waitForTimeout(800);
            await bring(page, `() => __row('נשר', 'בני אוחיון')`, 0.5);
            const lone = await view(page);
            await tap(page, `() => __row('נשר', 'בני אוחיון').querySelector(':scope > .btn-icon')`);
            await settle(page);
            const empty = await view(page);
            check(`${tag}: the card's only man is off it, and the card says it is empty`, await page.evaluate(() =>
                !__row('נשר', 'בני אוחיון') && __card('נשר').classList.contains('site-card-empty')));
            same(`${tag}: emptying a card leaves the page where it was`, empty.y, lone.y);
            same(`${tag}: and its head where it was`, at(empty.marks, 'נשר'), at(lone.marks, 'נשר'));
            same(`${tag}: after emptying a card every count is the record's`, await screenAgrees(page), []);

            await page.reload({ waitUntil: 'load' });
            await page.evaluate(date => { todayStr = () => date; State.date = date; showView('day'); render(); }, DATE);
            await frames(page);
            same(`${tag}: after a reload the screen and the disk agree`, await screenAgrees(page), []);
            same(`${tag}: and חולון counts 3, נשר 0`, await page.evaluate(() => ['חולון', 'נשר'].map(site =>
                [...document.querySelectorAll('#dayView .site-card')].find(card => card.querySelector('.site-name').textContent === site)
                    .querySelector('.site-count').textContent)), ['3', '0']);
        });

        // 4. ＋ on a site's head, «+ הוסף» in its picker, «סגור».
        await scenario(browser, tag, 'the site\'s picker', size, async page => {
            await bring(page, `() => __card('חולון').querySelector('.site-head')`, 0.45);
            const before = await view(page);
            await tap(page, `() => __card('חולון').querySelector('.site-head-btn')`);
            await settle(page);
            check(`${tag}: the picker is open`, await page.evaluate(() => document.getElementById('workerPickerModal').style.display === 'flex'));
            await tap(page, `() => [...document.querySelectorAll('#workerPickerList .picker-row')]
                .find(row => row.querySelector('.picker-name').firstChild.textContent.trim() === '${SPARE}').querySelector('button')`);
            await settle(page);
            same(`${tag}: «+ הוסף» leaves the list behind the picker where it was`, await scrolled(page), before.y);
            await tap(page, `() => document.querySelector('#workerPickerModal button[onclick="closeWorkerPicker()"]')`);
            await settle(page);
            const after = await view(page);
            same(`${tag}: «סגור» leaves the list where it was`, after.y, before.y);
            same(`${tag}: and חולון's head where it was`, at(after.marks, 'חולון'), at(before.marks, 'חולון'));
            same(`${tag}: the man added is on חולון exactly once`, await page.evaluate(spare =>
                [...__card('חולון').querySelectorAll('.assign-name')].filter(node => __nameOf(node) === spare).length, SPARE), 1);
            same(`${tag}: after the picker every count is the record's`, await screenAgrees(page), []);
        });

        // 5. The tray: a man nobody placed, a site chosen for him in the place picker - a
        //    card far ABOVE the screen grows by his row, so the page must move by exactly that.
        await scenario(browser, tag, 'a site chosen for a man in the tray', size, async page => {
            await bring(page, `() => document.querySelector('#dayView .tray-pending')`, 0.55);
            const before = await view(page);
            before.marks = await page.evaluate(() => __marks(false));
            await tap(page, `() => document.querySelector('#dayView .tray-pending .chip-main')`);
            await settle(page);
            check(`${tag}: the place picker is open`, await page.evaluate(() => document.getElementById('placePickerModal').style.display === 'flex'));
            await tap(page, `() => [...document.querySelectorAll('#placePickerList .place-btn')].find(node => node.textContent.includes('פרדסיה'))`);
            await settle(page);
            const chosen = await view(page);
            check(`${tag}: he is on פרדסיה`, await page.evaluate(spare => workersAtPlace(State.schedule, State.date, 'p1', 'actual')
                .includes(__idOf(spare)), SPARE));
            const mark = held(before, chosen);
            kept(`${tag}: what was on screen stays where it was`, mark);
            await tap(page, `() => document.querySelector('#placePickerModal button[onclick="closePlacePicker()"]')`);
            await settle(page);
            const closed = await view(page);
            kept(`${tag}: and after «סגור» too`, { id: mark.id, was: mark.was, now: at(closed.marks, mark.id) });
            same(`${tag}: after the place picker every count is the record's`, await screenAgrees(page), []);
        });

        // 6. A rate chosen on a row - the select still focused when the redraw takes it away.
        await scenario(browser, tag, 'a rate', size, async page => {
            await bring(page, `() => __row('תל אביב', 'רון ביטון')`, 0.45);
            const before = await view(page);
            await page.evaluate(() => {
                const select = __row('תל אביב', 'רון ביטון').querySelector('select');
                select.focus({ preventScroll: true });
                select.value = 'double';
                select.dispatchEvent(new Event('input', { bubbles: true }));
                select.dispatchEvent(new Event('change', { bubbles: true }));
            });
            await settle(page);
            const after = await view(page);
            same(`${tag}: the rate is on the record`, await page.evaluate(() =>
                entryRate(entriesFor(State.schedule, State.date, __idOf('רון ביטון'), 'actual')[0])), 'double');
            same(`${tag}: a rate leaves the page where it was`, after.y, before.y);
            same(`${tag}: and the row where it was`, at(after.marks, 'תל אביב · רון ביטון'), at(before.marks, 'תל אביב · רון ביטון'));
            same(`${tag}: after a rate every count is the record's`, await screenAgrees(page), []);
        });

        // 7. A Rima count typed and saved mid-page; then one typed and the next site's box
        //    tapped - the count is saved on the way, the redraw takes both boxes away, and
        //    the blur hands the focus to the next site's new box (renderRimaField).
        await scenario(browser, tag, 'a Rima count', size, async page => {
            await bring(page, `() => __rima('נשר')`, 0.45);
            const before = await view(page);
            await tap(page, `() => __rima('נשר')`);
            await page.keyboard.type('3');
            await page.evaluate(() => document.activeElement.blur());
            await settle(page);
            const saved = await view(page);
            same(`${tag}: the count is on the record and on the disk`, await page.evaluate(() => [rimaCount(State.schedule, State.date, 'p6'),
                rimaCount(JSON.parse(Store.get('scheduleData:v2')), State.date, 'p6')]), [3, 3]);
            same(`${tag}: saving a count leaves the page where it was`, saved.y, before.y);
            same(`${tag}: and its box where it was`, at(saved.marks, 'נשר · רימא'), at(before.marks, 'נשר · רימא'));
            check(`${tag}: the header stays compact`, saved.compact);
            same(`${tag}: after a count every number on screen is the record's`, await screenAgrees(page), []);

            await bring(page, `() => __rima('חולון')`, 0.3);
            const typing = await view(page);
            await tap(page, `() => __rima('חולון')`);
            await page.keyboard.press('End');
            await page.keyboard.press('Backspace');
            await page.keyboard.type('4');
            await tap(page, `() => __rima('רמת גן')`);
            await settle(page, 150);
            const handed = await view(page);
            same(`${tag}: חולון's count was saved on the way`, await page.evaluate(() => rimaCount(State.schedule, State.date, 'p4')), 4);
            const focus = await page.evaluate(() => {
                const node = document.activeElement;
                return { box: Boolean(node && node.classList.contains('rima-input')), live: Boolean(node && node.isConnected),
                    said: node && node.getAttribute ? node.getAttribute('aria-label') : null };
            });
            check(`${tag}: the box tapped has the focus`, focus.box && focus.live && bare(focus.said) === 'רימא ברמת גן', JSON.stringify(focus));
            same(`${tag}: the hand-off leaves the page where it was`, handed.y, typing.y);
            same(`${tag}: and the box tapped where it was`, at(handed.marks, 'רמת גן · רימא'), at(typing.marks, 'רמת גן · רימא'));
            await page.keyboard.type('1');
            await page.evaluate(() => document.activeElement.blur());
            await settle(page);
            same(`${tag}: what is typed next is רמת גן's`, await page.evaluate(() => rimaCount(State.schedule, State.date, 'p5')), 1);
            same(`${tag}: and the page is still where it was`, await scrolled(page), typing.y);
            same(`${tag}: after the hand-off every number on screen is the record's`, await screenAgrees(page), []);
        });

        // 8. A snapshot from the other phone, adopted while scrolled - no tap at all.
        for (const [name, shape] of [['nothing on screen changed', 'same'],
            ['a man added on a card above the screen', 'above'], ['a row on screen removed', 'removed']]) {
            await scenario(browser, tag, `a snapshot: ${name}`, size, async page => {
                await bring(page, `() => __row('תל אביב', 'שי פרידמן')`, 0.5);
                const before = await view(page);
                before.marks = await page.evaluate(() => __marks(false));
                await page.evaluate(([shape, spare, date]) => {
                    const raw = JSON.parse(JSON.stringify(State.schedule));
                    raw.updatedAt = new Date(Date.now() + 1000).toISOString();
                    raw.updatedBy = 'other-device';
                    if (shape === 'above') assignPlace(raw, date, __idOf(spare), 'actual', 'p1');
                    if (shape === 'removed') unassignPlace(raw, date, __idOf('אלי אברהם'), 'actual', 'p2');
                    FarkadSync.receive(raw);
                }, [shape, SPARE, DATE]);
                await settle(page);
                const after = await view(page);
                const adopted = await page.evaluate(([shape, spare]) => shape === 'above'
                    ? workersAtPlace(State.schedule, State.date, 'p1', 'actual').includes(__idOf(spare))
                    : shape === 'removed' ? !__row('תל אביב', 'אלי אברהם') : true, [shape, SPARE]);
                check(`${tag}: the snapshot (${name}) was adopted`, adopted);
                kept(`${tag}: the snapshot (${name}) keeps what was on screen where it was`,
                    held(before, after, ['תל אביב · אלי אברהם']));
                if (shape === 'same') same(`${tag}: and the page did not move at all`, after.y, before.y);
                same(`${tag}: after the snapshot (${name}) every count is the record's`, await screenAgrees(page), []);
            });
        }

        // 9. A dialog closed gives the focus back WITHOUT scrolling (js/ui/modal.js). On an
        //    iPhone a tap focuses nothing, so where the focus goes back to can be ⚙ - which
        //    closeSettings() focused - in the top bar, scrolled off the screen.
        await scenario(browser, tag, 'the focus given back after ⚙', size, async page => {
            await page.evaluate(() => {
                document.addEventListener('mousedown', event => { if (!event.target.closest('.modal')) event.preventDefault(); }, true);
                openSettings(); closeSettings();
            });
            given(`${tag}: ⚙ holds the focus`, await page.evaluate(() => document.activeElement === document.getElementById('settingsBtn')));
            await bring(page, `() => __card('חולון').querySelector('.site-head')`, 0.45);
            const before = await view(page);
            await tap(page, `() => __card('חולון').querySelector('.site-head-btn')`);
            await settle(page);
            await tap(page, `() => document.querySelector('#workerPickerModal button[onclick="closeWorkerPicker()"]')`);
            await settle(page);
            const after = await view(page);
            same(`${tag}: opening and closing a site's picker leaves the list where it was`, after.y, before.y);
            same(`${tag}: and the focus went back to ⚙ all the same`, await page.evaluate(() =>
                document.activeElement === document.getElementById('settingsBtn')), true);
        });

        // 10. What must still move: the header compacts and comes back, and a new date
        //     starts at the top of its day.
        await scenario(browser, tag, 'the header and a new date', size, async page => {
            same(`${tag}: at the top the header is full`, [await scrolled(page), await compact(page)], [0, false]);
            await page.evaluate(() => window.scrollTo(0, 400));
            await settle(page);
            check(`${tag}: scrolled down, it compacts`, await compact(page));
            await page.evaluate(() => window.scrollTo(0, 0));
            await settle(page);
            check(`${tag}: back at the top, it is full again`, !(await compact(page)));
            await bring(page, `() => __card('חולון').querySelector('.site-head')`, 0.4);
            check(`${tag}: deep in the day, compact`, (await scrolled(page)) > 72 && await compact(page));
            await tap(page, `() => document.querySelector('#dayView .day-header .nav-fwd')`);
            await settle(page, 120);
            same(`${tag}: «הבא» opens the next day, at its top, with the header full`,
                [await page.evaluate(() => State.date), await scrolled(page), await compact(page)], ['2026-11-06', 0, false]);
        });

        // 10b. The week tab and back: the window stays where it was - it does not land at the
        //     top. Before v166 it always did, but only because emptying the day clamped the
        //     scroll; nothing decided it. Pinned now, so that it is decided.
        await scenario(browser, tag, 'the week tab and back', size, async page => {
            await bring(page, `() => __card('חולון').querySelector('.site-head')`, 0.4);
            const day = await scrolled(page);
            await tap(page, `() => document.getElementById('tab-week')`);
            await settle(page, 150);
            const week = await scrolled(page);
            check(`${tag}: the week is on the screen`, await page.evaluate(() =>
                document.getElementById('weekView').style.display !== 'none' && document.getElementById('dayView').style.display === 'none'));
            await tap(page, `() => document.getElementById('tab-day')`);
            await settle(page, 150);
            const back = { y: await scrolled(page), compact: await compact(page) };
            check(`${tag}: back on the day from the week, the window stays where it was, not at the top`,
                back.y === week && back.y > 72 && back.compact, JSON.stringify({ day, week, back }));
            same(`${tag}: on the same date`, await page.evaluate(() => State.date), DATE);
        });

        // 11. The by-worker list: ✕ clears a man's day and his row stays, emptied.
        await scenario(browser, tag, 'by worker', size, async page => {
            await bring(page, `() => __wrow('רון ביטון')`, 0.45);
            const before = await view(page);
            await tap(page, `() => __wrow('רון ביטון').querySelector(':scope > .btn-icon')`);
            await settle(page);
            const after = await view(page);
            same(`${tag}: by worker, ✕ cleared his day and his row says so`, await page.evaluate(() =>
                [entriesFor(State.schedule, State.date, __idOf('רון ביטון'), 'actual').length,
                    __wrow('רון ביטון').classList.contains('wrow-empty')]), [0, true]);
            same(`${tag}: by worker, ✕ leaves the page where it was`, after.y, before.y);
            same(`${tag}: and his row and the one above where they were`,
                [at(after.marks, 'רון ביטון'), at(after.marks, 'אבי פרץ')], [at(before.marks, 'רון ביטון'), at(before.marks, 'אבי פרץ')]);
        }, 'workers');

        // 12. A double tap on one ✕, 120 ms and 400 ms apart: the man below has slid up under
        //     the finger, and the second tap is the first one again. Then the same two taps
        //     900 ms apart: the second is a decision of its own.
        for (const gap of [120, 400, 900]) {
            const twice = gap < 700;
            await pairScenario(browser, tag, `two taps on ✕ ${gap} ms apart`, size, gap, async (page, pair) => {
                await bring(page, `() => __card('תל אביב').querySelector('.site-head')`, 0.27);
                const was = await dayRecord(page);
                await pair(`() => __row('תל אביב', 'אבי פרץ').querySelector(':scope > .btn-icon')`);
                const off = await changedSince(page, was);
                if (twice) {
                    same(`${tag}: two taps on ✕ ${gap} ms apart take off exactly the man tapped`, off, ['אבי פרץ (תל אביב)']);
                    same(`${tag}: and the undo bar names him (${gap} ms)`, await undoSays(page), 'אבי פרץ הוסר מתל אביב');
                } else {
                    same(`${tag}: a second tap ${gap} ms later takes off the man now under the finger`, off,
                        ['אבי פרץ (תל אביב)', 'רון ביטון (תל אביב)']);
                    same(`${tag}: and the undo bar names him (${gap} ms)`, await undoSays(page), 'רון ביטון הוסר מתל אביב');
                }
                same(`${tag}: after two taps ${gap} ms apart every count is the record's`, await screenAgrees(page), []);
            });
        }

        // 13. «+ הוסף» in a site's picker tapped twice: inside 700 ms he stays added - the
        //     button, memory and the disk agree; at 900 ms the second tap takes him off, as
        //     «✓ נמצא» says it will.
        for (const gap of [120, 400, 900]) {
            const twice = gap < 700;
            await pairScenario(browser, tag, `«+ הוסף» tapped twice ${gap} ms apart`, size, gap, async (page, pair) => {
                await bring(page, `() => __card('חולון').querySelector('.site-head')`, 0.45);
                await tap(page, `() => __card('חולון').querySelector('.site-head-btn')`);
                await settle(page);
                given(`${tag}: the picker is open, offering to add him`, (await pickedAt(page, SPARE, 'p4')).button === '+ הוסף',
                    JSON.stringify(await pickedAt(page, SPARE, 'p4')));
                await pair(pickerButton(SPARE));
                if (twice) {
                    same(`${tag}: «+ הוסף» twice ${gap} ms apart leaves him added - the button, memory and the disk`,
                        await pickedAt(page, SPARE, 'p4'), { button: '✓ נמצא', pressed: 'true', live: true, disk: true });
                    same(`${tag}: and the undo bar says he was added (${gap} ms)`, await undoSays(page), `${SPARE} נוסף לחולון`);
                } else {
                    same(`${tag}: a second tap ${gap} ms later takes him off, as «✓ נמצא» says`,
                        await pickedAt(page, SPARE, 'p4'), { button: '+ הוסף', pressed: 'false', live: false, disk: false });
                    same(`${tag}: and the undo bar says he was taken off (${gap} ms)`, await undoSays(page), `${SPARE} הוסר מחולון`);
                }
                await tap(page, `() => document.querySelector('#workerPickerModal button[onclick="closeWorkerPicker()"]')`);
                await settle(page);
                same(`${tag}: after «+ הוסף» twice ${gap} ms apart every count is the record's`, await screenAgrees(page), []);
            });
        }

        // 13b. The tray's place picker «לאן הלך», a site tapped twice for the man: it turns
        //     into its own opposite in place, like the site's picker. Inside 700 ms he stays
        //     placed; at 900 ms the second tap takes the site away again, as its ✓ says.
        for (const gap of [120, 400, 900]) {
            const twice = gap < 700;
            await pairScenario(browser, tag, `a site in «לאן הלך» tapped twice ${gap} ms apart`, size, gap, async (page, pair) => {
                await bring(page, `() => document.querySelector('#dayView .tray-pending')`, 0.55);
                await tap(page, `() => document.querySelector('#dayView .tray-pending .chip-main')`);
                await settle(page);
                const site = `() => [...document.querySelectorAll('#placePickerList .place-btn')].find(node => node.textContent.includes('פרדסיה'))`;
                const placed = () => page.evaluate(([spare, find]) => {
                    const id = __idOf(spare), node = (0, eval)(find)();
                    const disk = JSON.parse(Store.get('scheduleData:v2'));
                    return { pressed: node ? node.getAttribute('aria-pressed') : null,
                        live: workersAtPlace(State.schedule, State.date, 'p1', 'actual').includes(id),
                        disk: workersAtPlace(disk, State.date, 'p1', 'actual').includes(id) };
                }, [SPARE, site]);
                given(`${tag}: «לאן הלך» is open for him, פרדסיה not chosen`, (await placed()).pressed === 'false', JSON.stringify(await placed()));
                await pair(site);
                same(twice ? `${tag}: a site in «לאן הלך» tapped twice ${gap} ms apart leaves him there - the button, memory and the disk`
                    : `${tag}: a second tap on the site ${gap} ms later takes it away again, as its ✓ says`,
                    await placed(), twice ? { pressed: 'true', live: true, disk: true } : { pressed: 'false', live: false, disk: false });
                await tap(page, `() => document.querySelector('#placePickerModal button[onclick="closePlacePicker()"]')`);
                await settle(page);
                same(`${tag}: after «לאן הלך» twice ${gap} ms apart every count is the record's`, await screenAgrees(page), []);
            });
        }

        // 13c. The ✕ on a chip in «נעדרים»: the next man's chip slides into its place, under
        //     the finger - measured: two taps cancelled two absences. Inside 700 ms the second
        //     is the first again; at 900 ms it cancels the next man's absence, as a tap should.
        for (const gap of [120, 400, 900]) {
            const twice = gap < 700;
            await pairScenario(browser, tag, `two taps on a «נעדרים» ✕ ${gap} ms apart`, size, gap, async (page, pair) => {
                await bring(page, `() => document.querySelector('#dayView .tray-absent')`, 0.45);
                const was = await dayRecord(page);
                await pair(`() => document.querySelector('#dayView .tray-absent .chip .chip-side')`);
                const off = await changedSince(page, was);
                if (twice) {
                    same(`${tag}: two taps on a «נעדרים» ✕ ${gap} ms apart cancel exactly the absence tapped`, off, ['חיים לוי ()']);
                    same(`${tag}: and the undo bar names him (${gap} ms, «נעדרים»)`, await undoSays(page), 'ההיעדרות של חיים לוי בוטלה');
                } else {
                    same(`${tag}: a second tap on «נעדרים» ${gap} ms later cancels the next man's absence`, off, ['חיים לוי ()', 'מאיר כהן ()']);
                    same(`${tag}: and the undo bar names him (${gap} ms, «נעדרים»)`, await undoSays(page), 'ההיעדרות של מאיר כהן בוטלה');
                }
                same(`${tag}: after two taps on «נעדרים» ${gap} ms apart every count is the record's`, await screenAgrees(page), []);
            });
        }

        // 14. A render that arrives while a box on the day has the focus. The swap takes the
        //     focused box out of the page, and Chromium fires its `change` and its blur right
        //     there - inside renderDay. A `change` that committed would render INSIDE the
        //     render (a first draft of this fix threw NotFoundError from replaceChildren that
        //     way, on a tree without dayTearingDown) and would record digits nobody finished
        //     typing. So: no exception, no console error, no commit but the one made, and
        //     exactly the record change that render brought - in memory and on the disk.
        // Focused by a finger; or, with the assign sheet open over the day, the way
        // tests/smoke.mjs reaches the hours box behind it - by focus alone.
        const reach = (page, find, finger) => finger ? tap(page, find)
            : page.evaluate(find => (0, eval)(find)().focus({ preventScroll: true }), find);
        const FOCUSED = [
            ['a Rima box holding typed digits', async (page, finger) => {
                await bring(page, `() => __rima('חולון')`, 0.4);
                await reach(page, `() => __rima('חולון')`, finger);
                await page.keyboard.press('End');
                await page.keyboard.press('Backspace');
                await page.keyboard.type('7');
            }],
            ['the hours box beside a rate, holding typed hours', async (page, finger) => {
                await page.evaluate(() => {
                    State.commit(setRate(State.schedule, State.date, __idOf('אורי עמר'), 'actual', 'p4', RATE_EXTRA, 2));
                });
                await settle(page);
                await bring(page, `() => __row('חולון', 'אורי עמר')`, 0.4);
                await reach(page, `() => __row('חולון', 'אורי עמר').querySelector('.rate-hours')`, finger);
                await page.keyboard.press('End');
                await page.keyboard.press('Backspace');
                await page.keyboard.type('5');
            }],
            ['a focused rate select', async (page, finger) => {
                await bring(page, `() => __row('חולון', 'אורי עמר')`, 0.4);
                await page.evaluate(() => __row('חולון', 'אורי עמר').querySelector('select').focus({ preventScroll: true }));
            }]];
        // [what arrives, the commits it makes itself, the change it brings, before, what]
        const ARRIVING = [
            ['a commit elsewhere', 1, [SPARE], null,
                `spare => State.commit(assignPlace(State.schedule, State.date, __idOf(spare), 'actual', 'p1'))`],
            ['an adopted snapshot', 0, [SPARE], null, `spare => { const raw = JSON.parse(JSON.stringify(State.schedule));
                raw.updatedAt = new Date(Date.now() + 1000).toISOString(); raw.updatedBy = 'other-device';
                assignPlace(raw, State.date, __idOf(spare), 'actual', 'p1'); FarkadSync.receive(raw); }`],
            // tests/smoke.mjs's own steps, where the first draft threw: the sheet open, the
            // day's box behind it holding digits, the sheet closed - a render and no commit.
            ['the assign sheet closing', 0, [], `spare => openAssignSheet(__idOf(spare))`, `spare => closeAssignSheet()`]];
        for (const [focused, focus] of FOCUSED) {
            for (const [arriving, commits, brings, prepare, act] of ARRIVING) {
                await scenario(browser, tag, `${arriving} under ${focused}`, size, async page => {
                    if (prepare) {
                        await page.evaluate(([prepare, spare]) => (0, eval)(prepare)(spare), [prepare, SPARE]);
                        await settle(page);
                    }
                    await focus(page, !prepare);
                    const before = await page.evaluate(() => ({ day: JSON.stringify(State.schedule.days[State.date]),
                        focused: Boolean(document.activeElement && document.activeElement.closest('#dayView')),
                        rima: rimaCount(State.schedule, State.date, 'p4'),
                        hours: entryExtraHours(entriesFor(State.schedule, State.date, __idOf('אורי עמר'), 'actual')[0]) }));
                    given(`${tag}: ${focused} has the focus`, before.focused, JSON.stringify(before.focused));
                    page.__console.length = 0;
                    const ran = await page.evaluate(([act, spare]) => {
                        let count = 0;
                        const commit = State.commit, many = State.commitMany;
                        State.commit = function () { count += 1; return commit.apply(this, arguments); };
                        State.commitMany = function () { count += 1; return many.apply(this, arguments); };
                        try { (0, eval)(act)(spare); return { threw: null, count }; }
                        catch (error) { return { threw: String(error && error.message || error), count }; }
                        finally { State.commit = commit; State.commitMany = many; }
                    }, [act, SPARE]);
                    await settle(page, 200);
                    const after = await page.evaluate(([was, spare]) => {
                        const a = JSON.parse(was), b = State.schedule.days[State.date];
                        const disk = JSON.parse(Store.get('scheduleData:v2')).days[State.date];
                        const layer = (x, name) => (x && x[name]) || {};
                        const changed = [];
                        Object.keys({ ...layer(a, 'actual'), ...layer(b, 'actual') }).forEach(id => {
                            if (JSON.stringify(layer(a, 'actual')[id]) !== JSON.stringify(layer(b, 'actual')[id])) changed.push(State.worker(id).name);
                        });
                        if (JSON.stringify(layer(a, 'rima')) !== JSON.stringify(layer(b, 'rima'))) changed.push('רימא');
                        if (JSON.stringify(layer(a, 'plan')) !== JSON.stringify(layer(b, 'plan'))) changed.push('plan');
                        return { changed: changed.sort(), diskAgrees: JSON.stringify(disk) === JSON.stringify(b),
                            spareAt: workersAtPlace(State.schedule, State.date, 'p1', 'actual').includes(__idOf(spare)),
                            rima: rimaCount(State.schedule, State.date, 'p4'),
                            hours: entryExtraHours(entriesFor(State.schedule, State.date, __idOf('אורי עמר'), 'actual')[0]) };
                    }, [before.day, SPARE]);
                    same(`${tag}: ${arriving} under ${focused}: nothing threw`, ran.threw, null);
                    same(`${tag}: ${arriving} under ${focused}: no console error`, page.__console, []);
                    same(`${tag}: ${arriving} under ${focused}: no commit but the one made`, ran.count, commits);
                    same(`${tag}: ${arriving} under ${focused}: exactly the change it brought`, after.changed, brings);
                    check(`${tag}: ${arriving} under ${focused}: the typed digits recorded nothing - memory and disk agree`,
                        after.diskAgrees && after.rima === before.rima && after.hours === before.hours,
                        JSON.stringify({ before: [before.rima, before.hours], after }));
                    if (brings.length) check(`${tag}: ${arriving} under ${focused}: and what it brought is kept`, after.spareAt);
                });
            }
        }

        // 15. The end of the page, where nothing can be held whole: nobody away, so the tray
        //     of men not yet placed is the last thing on the day; the page scrolled to its
        //     bottom; the last man in it placed on a site far above. The card grows by his
        //     row and the tray shrinks by as much, and the browser cannot scroll past the
        //     bottom - but the bottom bars, measured a frame after the render, give some of
        //     it back, and settleDayAnchor takes that. What is left is less than a row.
        await scenario(browser, tag, 'the last man in the tray, at the end of the page', size, async page => {
            await bring(page, `() => document.querySelector('#dayView .tray-pending')`, 0.55);
            const before = await view(page);
            before.marks = await page.evaluate(() => __marks(false));
            const row = await page.evaluate(() => Math.round(document.querySelector('#dayView .assign-row').getBoundingClientRect().height));
            await tap(page, `() => document.querySelector('#dayView .tray-pending .chip-main')`);
            await settle(page);
            await tap(page, `() => [...document.querySelectorAll('#placePickerList .place-btn')].find(node => node.textContent.includes('פרדסיה'))`);
            await settle(page, 300);
            const after = await view(page);
            const mark = held(before, after);
            check(`${tag}: at the end of the page what was on screen moves by less than one row (${row} px)`,
                mark.id !== null && Math.abs(mark.now - mark.was) < row, JSON.stringify({ mark, row, y: [before.y, after.y] }));
            same(`${tag}: and every count is the record's`, await screenAgrees(page), []);
        }, 'sites', []);
    }
  }
} finally {
    for (const [, browser] of engines) await browser.close();
    server.close();
}
report();
