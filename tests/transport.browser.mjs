// הסעות as a picture (v174) in a real Chromium WITH A TOUCH SCREEN: the cars drawn from
// above, the men dragged to their seats by a finger - at two phone sizes, in both schemes,
// with the day record byte for byte what it was at the end.
//
//   CHROME_PATH=/opt/pw-browsers/chromium node tests/transport.browser.mjs
//
// The rules of a seat, the words, the driver's message, a day written by v171 and where
// everything is kept are measured in tests/transport.test.mjs. This is the part only a
// page can answer: that the car is drawn with the driver on the LEFT in a right-to-left
// page, that a finger can carry a man to a seat and to a car that was off the screen, that
// a swipe scrolls and moves nobody, that the app's own questions open over the panel, that
// the link to WhatsApp is a real link with the whole address on it, and that no seat is
// under 56px on the small phone.
//
// THE DRAGS ARE REAL TOUCHES. Every context has `hasTouch` and `isMobile`, and a drag is a
// touchStart / touchMove… / touchEnd sent through the DevTools protocol
// (Input.dispatchTouchEvent), which goes through Chromium's own input pipeline: gesture
// detection, `touch-action`, scrolling, pointer events of type "touch". The page is NOT
// handed synthetic PointerEvents. A counter on the document proves which path ran: the
// drags below must have produced touch-type pointer events and no mouse ones.
// WHAT THAT IS NOT: an iPhone or a Galaxy. Emulated touch in desktop Chromium does not
// have iOS Safari's long-press callout, its rubber-band scroll, or a home-screen app's
// gesture quirks. docs/releases.md (v174) says so first of all.
//
// WHATSAPP IS NEVER REACHED AND THE LINK IS NEVER FOLLOWED. The address and the target are
// read off the link; the tap that marks it has its navigation prevented by this file, so
// what is measured is the app's own handler. Every request the page makes is recorded,
// and none may be for WhatsApp or for anywhere else off this machine.
//
// THE SUMMARY OF THE DAY (v179) is measured here too: its one button on the screen, its
// dialog over the panel, the words in it against the cars AS THEY ARE DRAWN, the three
// ways out (the share sheet and wa.me are replaced by recorders - nothing is shared and
// nothing is opened), the picture, and that none of it moves a key on the disk.
//
// THE REPORT OF A PERIOD is measured here as well: its one button, the four ranges, the
// words in the field against THE PLANS AS THEY ARE STORED (read off localStorage and
// counted by this file's own hand), the same three ways out through the same recorders,
// the picture, the rectangles at both sizes and at 200% text, and that none of it moves a
// key on the disk.
//
// A VEHICLE TURNED OFF (the lasting switch) is measured here too, in an evening of its own:
// men carried into a car by a finger, its switch in the list tapped, what is said, the car
// gone from the day's cars and from the summary and the report, a reload, tomorrow's plan,
// the day before, the switch tapped again - and the two days' plans byte for byte what
// they were before it was ever turned off.
//
// TRANSPORT_SHOTS=<directory> also writes JPEGs (main-440-dark, summary-440-dark,
// report-440-dark, report-month-440-dark, dragging-440-dark, small-375-dark, main-440-light,
// nine-375-dark, report-375-light, vehicle-off-list-440-dark, vehicle-off-cars-440-dark) and
// the two pictures (summary-picture.png, report-picture.png). Synthetic names only - it is this file's own fixture.

import { chromium } from 'playwright';
import { join } from 'node:path';
import { writeFileSync } from 'node:fs';
import { serve } from './serve.mjs';
import { launchLocalBrowser } from './network-guard.mjs';
import { tapsAtAPersonsPace, aPersonsPause } from './pace.mjs';
import { verifyServedAssets, expectedShaFor } from './treecheck.mjs';
import { suite, check, same, given, report } from './runner.mjs';
import { censusOnly } from './census.mjs';

const root = new URL('..', import.meta.url).pathname;
const server = await serve(root);
const served = await verifyServedAssets(server.url, root, expectedShaFor(root));
check('the origin served this commit, byte for byte', served.ok,
    `${served.checked} assets; ${(served.wrong || []).slice(0, 3).join(' | ')}`);
const browser = await launchLocalBrowser(chromium, { executablePath: process.env.CHROME_PATH });
const SHOTS = process.env.TRANSPORT_SHOTS || '';

const DAY = '2026-11-10';       // a Tuesday
const DAY_KEY = `farkadTransport:day:${DAY}`;
const FSI = '⁨';
const RLI = '⁧';
const PDI = '⁩';
const named = name => `${FSI}${name}${PDI}`;
const car = name => `${RLI}${name}${PDI}`;
const bare = text => String(text || '').replace(/[⁦-⁩‎‏]/g, '');

// The pinned words this file reads off the glass (all of them are pinned, word for word,
// in tests/transport.test.mjs).
const ENTRY = 'הסעות – שיבוץ לרכבים';
const TITLE = 'הסעות';
const SWITCH_ON = 'הפעלת הסעות במכשיר הזה';
const SWITCH_OFF = 'כיבוי הסעות במכשיר הזה';
// MOVED in v186 (the gate of js/ui/transport-share.js opened): the switch's card said
// «פועל במכשיר הזה בלבד: לא מסונכרן, לא משותף עם הטלפונים האחרים, ולא נכלל בגיבוי.» That is
// no longer true of a signed-in phone, so the card says the sentence below on every phone.
const THIS_PHONE = 'מופעל בכל מכשיר בנפרד. במכשיר שמחובר לענן, השיבוץ ורשימת הרכבים משותפים עם הטלפונים האחרים שהפעילו הסעות. לא נכלל בגיבוי.';
const ADD = 'הוספת עובד';
const DRIVER = 'נהג';
const OUT_OF_CAR = 'הוצאה מהרכב';
const CANCEL = 'ביטול';
const ALL_SEATED = 'כל העובדים משובצים';
const SUMMARY = 'סיכום הסעות ליום';
const REPORT = 'דוח הסעות לתקופה';
const VEHICLES = ['טויוטה קורולה 2013', 'טויוטה קורולה 2016', 'BYD סיל U 2025', 'BYD אטו 3 2025', 'פולקסווגן 2018',
    'סוואנה 2010', 'ליפמוטור C10 2026'];

// SYNTHETIC. Invented men and invented numbers. Twelve with a site, on four sites in turn;
// יוסי has no phone; the thirteenth is marked נעדר.
const NAMES = ['אחמד', 'מוחמד', 'יוסי', 'סמיר', 'עלי', 'Ali Hassan', 'ראמי', 'דוד', 'עבד אל-רחמן', 'מחמוד', 'חאלד', 'נביל', 'זיאד'];
const PHONES = ['052-884-1930', '+972 54-123-4567', '', '0501112233', '0549998877', '0587654321', '0521000007',
    '0521000008', '0521000009', '0521000010', '0521000011', '0521000012', '0521000013'];
const WORKERS = NAMES.map((name, i) => ({ id: `w_${String(i + 1).padStart(2, '0')}`, name, active: true, dailyRate: 400, phone: PHONES[i] }));
const PLACES = [
    { id: 'p_01', name: 'הרצליה', active: true },
    { id: 'p_02', name: 'חיפה', active: true },
    { id: 'p_03', name: 'פרדסיה', active: true },
    { id: 'p_04', name: 'נתניה', active: true }
];
const ALL = WORKERS.slice(0, 12).map(worker => worker.id);

async function open(width, height, scheme) {
    // A PHONE: a touch screen and a mobile viewport. Without `hasTouch` Chromium has no
    // touch input to dispatch and every "drag" below would be a mouse.
    const context = await browser.newContext({ viewport: { width, height }, colorScheme: scheme, hasTouch: true, isMobile: true });
    const page = await context.newPage();
    // v194: this suite walks the screens and is not about double taps - its taps come at a
    // person's pace (tests/pace.mjs says why).
    tapsAtAPersonsPace(page);
    const errors = [];
    const away = [];
    page.on('pageerror', error => errors.push(error.message));
    // The app itself asks for the Firebase SDK after boot (js/app.js) and the network guard
    // refuses it, as it does in every browser suite: that one host, the "failed to load"
    // line the browser prints for it and the sync layer's report of it are the guard at
    // work. Anything ELSE asked for off this machine, or said on the console, is counted.
    const sdk = url => /^https:\/\/www\.gstatic\.com\/firebasejs\//.test(url);
    page.on('console', message => {
        if (message.type() !== 'error') return;
        const said = message.text();
        if (/ERR_BLOCKED_BY_CLIENT/.test(said) || /^Sync error: .*firebase-adapter\.js/.test(said)) return;
        errors.push(`console: ${said}`);
    });
    context.on('request', request => {
        const host = new URL(request.url()).hostname;
        if (!['127.0.0.1', 'localhost', '[::1]', ''].includes(host) && !sdk(request.url())) away.push(request.url());
    });
    await page.goto(`${server.url}/index.html`, { waitUntil: 'load' });
    await page.waitForTimeout(350);
    await page.evaluate(([workers, places, day]) => {
        todayStr = () => day;
        State.schedule.workers = workers;
        State.schedule.places = places;
        workers.slice(0, 12).forEach((worker, i) => assignPlace(State.schedule, day, worker.id, 'actual', places[i % places.length].id));
        markAbsent(State.schedule, day, workers[12].id, 'actual');
        State.save();
        State.date = day;
        showView('day');
        render();
    }, [WORKERS, PLACES, DAY]);
    await page.waitForTimeout(200);
    const cdp = await context.newCDPSession(page);
    return { page, context, cdp, errors, away };
}

const WA_BUTTON = 'button[onclick="showDayMessage()"]';
const visible = async (page, selector) => page.locator(selector).first().isVisible().catch(() => false);
const text = async (page, selector) => bare(await page.locator(selector).first().textContent());
const seat = (vehicle, n) => `#transportBody .transport-seat[data-vehicle="${vehicle}"][data-seat="${n}"]`;
const chip = id => `#transportChips .transport-chip[data-worker="${id}"]`;
const seated = id => `#transportBody .transport-seat[data-worker="${id}"]`;
const head = vehicle => `#transportBody [data-car="${vehicle}"] .transport-vehicle-name`;

// What is DRAWN in a car, read off the glass: seat 1 first, «-» for an empty seat.
const drawn = (page, vehicle) => page.evaluate(id => {
    const tiles = [...document.querySelectorAll(`#transportBody .transport-seat[data-vehicle="${id}"]`)]
        .sort((a, b) => Number(a.dataset.seat) - Number(b.dataset.seat));
    return tiles.length ? tiles.map(tile => tile.dataset.worker || '-').join(' ') : null;
}, vehicle);
// What is KEPT, read off the disk - not out of the page's memory.
const kept = page => page.evaluate(key => {
    const raw = localStorage.getItem(key);
    const trips = raw ? JSON.parse(raw).trips : {};
    return Object.keys(trips).sort().map(v => `${v}:${trips[v].driver || '-'}`
        + trips[v].passengers.map(id => ` ${id}@${trips[v].seats[id]}`).join('')).join(' | ');
}, DAY_KEY);
const tray = page => page.evaluate(() => [...document.querySelectorAll('#transportChips .transport-chip')].map(node => node.dataset.worker));
const scrollTop = page => page.evaluate(() => document.getElementById('transportBody').scrollTop);

// The record, and everything queued for the cloud, as bytes.
const recordBytes = page => page.evaluate(() => {
    const out = {};
    Object.keys(localStorage).sort().forEach(key => {
        if (key === 'scheduleData:v2' || (typeof FarkadSync !== 'undefined' && FarkadSync.isQueueKey && FarkadSync.isQueueKey(key))) {
            out[key] = localStorage.getItem(key);
        }
    });
    return JSON.stringify(out);
});

// ------------------------------------------------------------------ a finger

const at = (x, y) => [{ x: Math.round(x), y: Math.round(y), id: 1 }];
// (v194: a finger that comes down to carry a man does so at a person's pace after the last tap -
// tests/pace.mjs.)
const down = async (cdp, p) => { await aPersonsPause(); return cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(p.x, p.y) }); };
const up = cdp => cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
const abandon = cdp => cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
async function glide(cdp, page, from, to, steps = 12) {
    for (let i = 1; i <= steps; i += 1) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove',
            touchPoints: at(from.x + (to.x - from.x) * i / steps, from.y + (to.y - from.y) * i / steps) });
        await page.waitForTimeout(16);
    }
}
const centre = async (page, selector) => {
    const box = await page.locator(selector).first().boundingBox();
    if (!box) throw new Error(`nothing on the glass at ${selector}`);
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};
// Brought onto the glass the way a person brings it: the list scrolled until the thing is
// between the tray and the bottom edge's scroll zone; a waiting man slid into the tray's
// window. Done by setting scroll positions, not by a gesture - the gestures that scroll
// are measured on their own below.
async function show(page, selector, other) {
    const fits = await page.evaluate(([sel, also]) => {
        const body = document.getElementById('transportBody');
        const chips = document.getElementById('transportChips');
        const inTray = node => Boolean(node && node.closest('#transportTray'));
        const nodes = [sel, also].filter(Boolean).map(one => document.querySelector(one));
        nodes.filter(node => chips && chips.contains(node)).forEach(node => {
            const box = node.getBoundingClientRect();
            const frame = chips.getBoundingClientRect();
            if (box.left < frame.left + 4 || box.right > frame.right - 4) chips.scrollLeft += box.left - frame.left - 24;
        });
        const listed = nodes.filter(node => !inTray(node));
        if (listed.length === 0) return true;
        // Clear of the two strips where a resting finger scrolls the list (64px each).
        const top = document.getElementById('transportTray').getBoundingClientRect().bottom + 70;
        const bottom = body.getBoundingClientRect().bottom - 70;
        const span = () => [Math.min(...listed.map(node => node.getBoundingClientRect().top)),
            Math.max(...listed.map(node => node.getBoundingClientRect().bottom))];
        let [first, last] = span();
        if (first < top || last > bottom) body.scrollTop += first - top;
        [first, last] = span();
        // At the very end of the list there is nothing more to scroll: then it only has
        // to be on the glass.
        return last <= bottom + 0.5 && first >= top - 0.5 ? true : last <= body.getBoundingClientRect().bottom && first >= top - 70;
    }, [selector, other || null]);
    if (!fits) throw new Error(`${selector} and ${other} cannot both be put on the glass`);
    await page.waitForTimeout(40);
}
// One whole drag. `hold`: how long the finger rests before it moves - nothing for a man in
// the tray, longer than the app's 300ms for a man in a seat.
async function drag(cdp, page, fromSelector, toSelector, hold = 0) {
    await show(page, toSelector, fromSelector);
    const from = await centre(page, fromSelector);
    const to = await centre(page, toSelector);
    await down(cdp, from);
    if (hold) await lifts(page);
    await glide(cdp, page, from, to);
    await up(cdp);
    await page.waitForTimeout(80);
}
// A HOLD IS OVER WHEN THE MAN IS SEEN TO LIFT - which is what a person waits for, and is
// not a number of milliseconds on this machine's clock: with a fixed sleep a touchStart
// that the page got to 150ms late (other work shares the machine) was moved before the
// app's 300ms had passed, and the test had swiped where it meant to carry.
const HOLD = true;
const lifts = page => page.locator('#transportPanel .transport-ghost').waitFor({ state: 'attached', timeout: 5000 });

// The app's own question (js/ui/ask.js): its title, and its answers as a person sees them.
async function question(page) {
    await page.locator('#askModal').waitFor({ state: 'visible' });
    return { title: await text(page, '#askTitle'),
        choices: (await page.locator('#askChoices button').allTextContents()).map(bare) };
}
// By its whole words: «אחר» is also the end of «נוסע עם קבלן אחר».
const choose = (page, label) => page.locator('#askChoices').getByText(label, { exact: true }).tap();
async function answer(page, value) {
    await page.locator('#askModal').waitFor({ state: 'visible' });
    if (value !== undefined) await page.locator('#askInput').fill(value);
    await page.locator('#askOk').click();
}

// THE FLOORS, on whatever the panel is showing: 44px both ways for everything a finger
// lands on and 56 for a seat on the small phone, 16px for every field, nothing running
// off the side (the tray's own row of men scrolls sideways by design and is the one
// exception), and no filled button at all.
async function floors(page, label, seatFloor) {
    const found = await page.evaluate(() => {
        const panel = document.getElementById('transportPanel');
        const seen = node => {
            const box = node.getBoundingClientRect();
            const style = getComputedStyle(node);
            return box.width > 0 && box.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
        };
        const targets = [...panel.querySelectorAll('button, a[href], select, summary, input, textarea')].filter(seen);
        const name = node => String(node.dataset.tk || node.id || node.textContent).slice(0, 24);
        const sizes = targets.map(node => ({ node, box: node.getBoundingClientRect() }));
        const small = sizes.filter(({ box }) => box.width < 43.5 || box.height < 43.5)
            .map(({ node, box }) => `${node.tagName} ${name(node)} ${Math.round(box.width)}x${Math.round(box.height)}`);
        const seats = sizes.filter(({ node }) => node.classList.contains('transport-seat'))
            .map(({ node, box }) => ({ key: name(node), w: box.width, h: box.height }));
        const fields = [...panel.querySelectorAll('select, input, textarea')].filter(seen)
            .filter(node => parseFloat(getComputedStyle(node).fontSize) < 16)
            .map(node => `${node.dataset.tk || node.id} ${getComputedStyle(node).fontSize}`);
        const body = document.getElementById('transportBody');
        const outside = targets.filter(node => !node.closest('#transportChips')).filter(node => {
            const box = node.getBoundingClientRect();
            return box.left < -0.5 || box.right > window.innerWidth + 0.5;
        }).map(name);
        // Filled = painted in the accent. The tonal look and WhatsApp's green are not it.
        const probe = document.createElement('span');
        probe.style.cssText = 'position:absolute;background:var(--accent)';
        panel.appendChild(probe);
        const accent = getComputedStyle(probe).backgroundColor;
        probe.remove();
        const filled = [...panel.querySelectorAll('button, a[href]')].filter(seen)
            .filter(node => getComputedStyle(node).backgroundColor === accent).map(name);
        return { count: targets.length, small, seats, fields, outside, filled,
            bodyFits: body.scrollWidth <= body.clientWidth + 1,
            pageFits: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1 };
    });
    given(`${label}: there is something on the panel to measure`, found.count > 0);
    check(`${label}: nothing a finger lands on is under 44px, either way`, found.small.length === 0, found.small.join(' | '));
    const low = found.seats.filter(one => one.w < seatFloor - 0.5 || one.h < seatFloor - 0.5);
    check(`${label}: every seat is at least ${seatFloor}px both ways`, found.seats.length > 0 && low.length === 0,
        low.map(one => `${one.key} ${Math.round(one.w)}x${Math.round(one.h)}`).join(' | '));
    check(`${label}: no field is under 16px`, found.fields.length === 0, found.fields.join(' | '));
    check(`${label}: the page does not scroll sideways and nothing runs off the side`,
        found.bodyFits && found.pageFits && found.outside.length === 0,
        JSON.stringify({ body: found.bodyFits, page: found.pageFits, outside: found.outside }));
    same(`${label}: no filled button - the picture is the thing`, found.filled, []);
    return found;
}

// ------------------------------------------------------------------ the summary of the day

// What the summary must say, WORKED OUT FROM THE GLASS and not from the plan: the cards
// in the order they are drawn, each car's tiles by seat number, a man's name and site off
// his tile's own label, the chips of the tray, the folded cards. The pinned words of
// tests/transport.test.mjs, put together by this file's own hand.
const summaryFromScreen = page => page.evaluate(() => {
    const strip = value => String(value || '').replace(/[\u2066-\u2069\u200e\u200f]/g, '');
    const who = node => {
        const [name, site] = strip(node.getAttribute('aria-label')).replace(/^נהג: /, '').split(' · ');
        return site ? `${name} – ${site}` : name;
    };
    const blocks = [[`סיכום הסעות ל${strip(document.getElementById('transportContext').textContent)}:`]];
    const empty = [];
    const home = [];
    let cars = 0;
    [...document.querySelectorAll('#transportBody [data-car]')].forEach(card => {
        const name = strip(card.querySelector('.transport-vehicle-name').textContent);
        const tiles = [...card.querySelectorAll('.transport-seat')].sort((a, b) => Number(a.dataset.seat) - Number(b.dataset.seat));
        if (tiles.length === 0) { home.push(name); return; }
        const taken = tiles.filter(tile => tile.dataset.worker);
        if (taken.length === 0) { empty.push(name); return; }
        cars += 1;
        const lines = [`רכב: ${name} – ${taken.length} מתוך ${tiles.length}`];
        lines.push(tiles[0].dataset.worker ? `נהג: ${who(tiles[0])}` : 'בלי נהג');
        const passengers = tiles.slice(1).filter(tile => tile.dataset.worker);
        if (passengers.length === 0) lines.push('בלי נוסעים.');
        else passengers.forEach(tile => lines.push(`- ${who(tile)}`));
        blocks.push(lines);
    });
    if (cars === 0) blocks.push(['אף עובד לא שובץ לרכב.']);
    const chips = [...document.querySelectorAll('#transportChips .transport-chip')];
    if (chips.length) blocks.push([`ממתינים לשיבוץ (${chips.length}):`].concat(chips.map(chip => `- ${who(chip)}`)));
    if (cars > 0 && empty.length) blocks.push([`רכבים ריקים: ${empty.join(', ')}`]);
    if (home.length) blocks.push([`רכבים שלא זמינים היום: ${home.join(', ')}`]);
    return blocks.map(block => block.join('\n')).join('\n\n');
});
const summaryField = page => page.evaluate(() => document.getElementById('transportSummaryText').value);
const summaryOpen = page => visible(page, '#transportSummaryModal');
// Every key on the disk by name, and the bytes of everything this feature keeps.
// The names without the service worker's census of open builds (tests/census.mjs says why).
const diskOf = page => page.evaluate(() => JSON.stringify([Object.keys(localStorage).sort().filter(key => key !== 'farkad:openBuilds'),
    Object.keys(localStorage).filter(key => /transport/i.test(key)).sort().map(key => [key, localStorage.getItem(key)])]));

async function summary(page, where) {
    suite(`${where}: the summary of the day - one button, the app's own dialog, three ways out, nothing written`);
    const record = await recordBytes(page);
    const disk = await diskOf(page);
    await censusOnly(check, page, JSON.parse(disk)[0]);
    const marks = await page.evaluate(() => [...document.querySelectorAll('#transportBody [data-car]')].map(card => card.dataset.mark || '-').join());

    same('one button on the screen, by its words', await page.locator('#transportPanel button', { hasText: SUMMARY }).evaluateAll(nodes => nodes.map(node => node.id)),
        ['transportSummaryOpen']);
    check('it is above the first car, under the tray', await page.evaluate(() => {
        const node = document.getElementById('transportSummaryOpen');
        const first = document.querySelector('#transportBody [data-car]');
        return Boolean(node.compareDocumentPosition(first) & Node.DOCUMENT_POSITION_FOLLOWING)
            && Boolean(document.getElementById('transportTray').compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING);
    }));
    same('and nowhere else in the app is there a way to it', await page.evaluate(word =>
        [...document.querySelectorAll('button, a, summary')].filter(node => node.textContent.includes(word) || /transportSummary|openTransportSummary/.test(node.getAttribute('onclick') || ''))
            .filter(node => !node.closest('#transportPanel') && !node.closest('#transportSummaryModal')).length, 'סיכום הסעות'), 0);
    await page.evaluate(() => { document.getElementById('transportBody').scrollTop = 0; });
    const size = await page.locator('#transportSummaryOpen').boundingBox();
    check('44px at least, both ways, and the width of the list', size.height >= 43.5 && size.width >= 200, JSON.stringify(size));

    await page.locator('#transportSummaryOpen').tap();
    await page.locator('#transportSummaryModal').waitFor({ state: 'visible' });
    same('it opens the app\'s own dialog: its title, the day, the label, and four worded buttons',
        [await text(page, '#transportSummaryTitle'), await text(page, '#transportSummaryContext'), await text(page, '#transportSummaryLabel'),
            (await page.locator('#transportSummaryModal .modal-actions button').allTextContents()).map(bare)],
        ['סיכום הסעות', 'יום שלישי 10/11/2026', 'תצוגה מקדימה של הסיכום', ['שליחה בוואטסאפ', 'העתקה', 'שיתוף כתמונה', 'סגירה']]);
    const shape = await page.evaluate(() => {
        const modal = document.getElementById('transportSummaryModal');
        const field = document.getElementById('transportSummaryText');
        const box = field.getBoundingClientRect();
        const content = modal.querySelector('.modal-content').getBoundingClientRect();
        const small = [...modal.querySelectorAll('button')].map(node => node.getBoundingClientRect())
            .filter(one => one.width < 43.5 || one.height < 43.5).length;
        return { onTop: document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2) === field,
            panelOpen: document.getElementById('transportPanel').classList.contains('open'),
            readOnly: field.readOnly, font: parseFloat(getComputedStyle(field).fontSize), small,
            inside: content.left >= -0.5 && content.right <= window.innerWidth + 0.5 && content.top >= -0.5 && content.bottom <= window.innerHeight + 0.5,
            pageFits: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
            native: [...modal.querySelectorAll('[onclick]')].map(node => node.getAttribute('onclick')).join() };
    });
    check('the dialog is OVER the panel, which stays open behind it', shape.onTop && shape.panelOpen, JSON.stringify(shape));
    check('the text is in a field nobody types in, at 16px or more', shape.readOnly && shape.font >= 16, JSON.stringify(shape));
    same('no button of it is under 44px either way', shape.small, 0);
    check('it is whole on the glass and the page does not scroll sideways', shape.inside && shape.pageFits, JSON.stringify(shape));

    const field = await summaryField(page);
    same('THE WORDS ARE THE PLAN ON THE SCREEN: every car as it is drawn, driver first, the men by their seats, who waits, what is empty, what stays home',
        bare(field).split('\n'), (await summaryFromScreen(page)).split('\n'));
    check('a vehicle\'s name is held right-to-left in it and a man\'s is isolated', field.includes(`${RLI}`) && field.includes(`${FSI}`)
        && field.split('\n').every(line => !line.startsWith(RLI)));

    // --- WhatsApp, by the day message's own door. The share sheet and window.open are
    // recorders here: nothing is shared and nothing is opened.
    await page.evaluate(() => {
        window.__shared = null;
        window.__opened = null;
        window.__realOpen = window.open;
        window.open = url => { window.__opened = url; return null; };
        navigator.share = data => { window.__shared = data; return Promise.reject(Object.assign(new Error('x'), { name: 'AbortError' })); };
    });
    await page.locator('#transportSummarySend').tap();
    await page.waitForTimeout(150);
    same('«שליחה בוואטסאפ» hands the share sheet the text and nothing else', await page.evaluate(() => window.__shared), { text: field });
    check('a share sheet backed out of is not a failure: the dialog stays, says nothing, and opens nothing',
        (await summaryOpen(page)) && (await text(page, '#transportSummaryStatus')) === '' && (await page.evaluate(() => window.__opened)) === null);
    await page.evaluate(() => { navigator.share = () => Promise.reject(new Error('boom')); });
    await page.locator('#transportSummarySend').tap();
    await page.waitForTimeout(150);
    check('a share sheet that fails keeps the summary on the glass and says to copy it',
        (await summaryOpen(page)) && (await text(page, '#transportSummaryStatus')).includes('העתק'), await text(page, '#transportSummaryStatus'));
    await page.evaluate(() => { navigator.share = data => { window.__shared = data; return Promise.resolve(); }; });
    await page.locator('#transportSummarySend').tap();
    await page.waitForTimeout(150);
    check('shared, the dialog steps aside and the screen is still there', !(await summaryOpen(page)) && (await visible(page, '#transportPanel')));

    await page.locator('#transportSummaryOpen').tap();
    await page.locator('#transportSummaryModal').waitFor({ state: 'visible' });
    same('opened again it starts with nothing said', await text(page, '#transportSummaryStatus'), '');
    await page.evaluate(() => { delete navigator.share; });
    await page.locator('#transportSummarySend').tap();
    await page.waitForTimeout(150);
    same('with no share sheet it is wa.me with the text and NO NUMBER - the person picks the chat',
        await page.evaluate(() => window.__opened), `https://wa.me/?text=${encodeURIComponent(field)}`);
    check('and the dialog steps aside', !(await summaryOpen(page)));

    // --- copy
    await page.locator('#transportSummaryOpen').tap();
    await page.locator('#transportSummaryModal').waitFor({ state: 'visible' });
    await page.evaluate(() => { window.__copied = null; navigator.clipboard.writeText = value => { window.__copied = value; return Promise.resolve(); }; });
    await page.locator('#transportSummaryCopy').tap();
    await page.waitForTimeout(150);
    same('«העתקה» puts the same text on the clipboard, and says it did', [await page.evaluate(() => window.__copied), await text(page, '#transportSummaryStatus')],
        [field, '✔️ הועתק']);
    await page.evaluate(() => { navigator.clipboard.writeText = () => Promise.reject(new Error('blocked')); document.__exec = document.execCommand; document.execCommand = () => false; });
    await page.locator('#transportSummaryCopy').tap();
    await page.waitForTimeout(150);
    check('a copy the browser refused is said to have been refused', (await text(page, '#transportSummaryStatus')).includes('נחסמה'), await text(page, '#transportSummaryStatus'));
    await page.evaluate(() => { document.execCommand = document.__exec; });

    // --- the picture: read off this dialog, drawn by the printout's own machinery.
    const picture = await page.evaluate(() => {
        const seen = [];
        const proto = CanvasRenderingContext2D.prototype;
        const real = proto.fillText;
        proto.fillText = function (value, ...rest) { seen.push(String(value)); return real.call(this, value, ...rest); };
        let out = null;
        try { out = printoutImage('transport'); } finally { proto.fillText = real; }
        if (!out) return null;
        return { name: out.name, type: out.blob.type, size: out.blob.size, width: out.width, height: out.height,
            rows: out.layout.rows.length, title: Boolean(out.layout.title), seen };
    });
    given('the picture was drawn', Boolean(picture));
    if (picture) {
        same('the picture is a PNG named for the day', [picture.name, picture.type, picture.size > 2000], ['farkad-הסעות-2026-11-10.png', 'image/png', true]);
        same('it has a title and one box for every block under it', [picture.title, picture.rows], [true, field.split('\n\n').length - 1]);
        same('and every word drawn in it is a word of the dialog, in the dialog\'s order - nothing added, nothing left out',
            bare(picture.seen.join(' ')), bare(field.split('\n').filter(Boolean).join(' ')));
    }
    await page.evaluate(() => {
        window.__file = null;
        navigator.canShare = () => true;
        navigator.share = data => { const file = data.files && data.files[0]; window.__file = file ? { name: file.name, type: file.type, size: file.size, text: data.text || null } : 'no file'; return Promise.resolve(); };
    });
    await page.locator('#transportSummaryPicture').tap();
    await page.waitForTimeout(150);
    const file = await page.evaluate(() => window.__file);
    check('«שיתוף כתמונה» hands the share sheet that file, inside the tap', Boolean(file) && file.name === 'farkad-הסעות-2026-11-10.png'
        && file.type === 'image/png' && file.size > 2000 && file.text === null, JSON.stringify(file));
    check('and the dialog stays for the next thing', await summaryOpen(page));
    await page.evaluate(() => { delete navigator.share; delete navigator.canShare; window.open = window.__realOpen; });

    // --- the way out, and what it all cost: nothing.
    await page.keyboard.press('Escape');
    check('Escape closes the dialog and NOT the screen behind it', !(await summaryOpen(page)) && (await visible(page, '#transportPanel')));
    same('with the dialog shut there is no picture to draw', await page.evaluate(() => printoutImage('transport')), null);
    await page.locator('#transportSummaryOpen').tap();
    await page.locator('#transportSummaryModal').waitFor({ state: 'visible' });
    await page.locator('#transportSummaryClose').tap();
    check('«סגירה» closes it too', !(await summaryOpen(page)) && (await visible(page, '#transportPanel')));

    same('NOTHING WAS WRITTEN: the same keys on the disk, and every transport key byte for byte', await diskOf(page), disk);
    same('the record and the queue are byte for byte what they were', await recordBytes(page), record);
    same('no car was marked «נפתח בוואטסאפ» by it, and nothing says «נשלח»', [await page.evaluate(() =>
        [...document.querySelectorAll('#transportBody [data-car]')].map(card => card.dataset.mark || '-').join()),
    /נשלח/.test(field + await page.locator('#transportSummaryModal').textContent())], [marks, false]);

    // --- a plan that changes while the dialog is open (another phone's snapshot redraws
    // the screen): the words follow the screen. Put back afterwards, seat for seat.
    await page.locator('#transportSummaryOpen').tap();
    await page.locator('#transportSummaryModal').waitFor({ state: 'visible' });
    const moved = await page.evaluate(day => {
        // A passenger, never the driver: a driver out of his seat takes his car's mark off
        // the disk with him, and putting him back would not put the mark back.
        const tile = [...document.querySelectorAll('#transportBody .transport-seat[data-worker]')].filter(one => one.dataset.seat !== '1').pop();
        const was = { id: tile.dataset.worker, vehicle: tile.dataset.vehicle, n: Number(tile.dataset.seat) };
        const home = [...document.querySelectorAll('#transportBody [data-car]')].find(card => !card.querySelector('.transport-seat[data-worker]') && card.querySelector('.transport-seat'));
        transportUnseat(day, was.id);
        if (home) transportSetAvailable(day, home.dataset.car, false);
        renderTransportIfOpen();
        return { was, home: home ? home.dataset.car : null };
    }, DAY);
    const after = await summaryField(page);
    check('the open dialog was brought up to date', after !== field && after.includes('ממתינים לשיבוץ (1):'), after.split('\n').slice(-4).join(' | '));
    same('and is again exactly what the screen shows', bare(after).split('\n'), (await summaryFromScreen(page)).split('\n'));
    await page.evaluate(([day, was, home]) => {
        if (home) transportSetAvailable(day, home, true);
        transportPlace(day, was.id, was.vehicle, was.n);
        renderTransportIfOpen();
    }, [DAY, moved.was, moved.home]);
    same('put back, it says what it said', await summaryField(page), field);
    await page.locator('#transportSummaryClose').tap();
}

// ------------------------------------------------------------------ the report of a period

// Two more days of plans for the week of DAY, as the screen would have kept them. Put on
// the disk by this file and taken off again by it: the evening's own account of what the
// feature wrote (three names) is taken after.
const STAGED = {
    '2026-11-08': { version: 1, unavailable: {}, status: {}, marks: {},
        trips: { tv_01: { driver: 'w_01', passengers: ['w_02'], seats: { w_02: 2 } }, tv_03: { driver: 'w_04', passengers: [], seats: {} } } },
    '2026-11-09': { version: 1, unavailable: { tv_03: true }, status: {}, marks: {},
        trips: { tv_01: { driver: 'w_04', passengers: ['w_01', 'w_03'], seats: { w_01: 4, w_03: 2 } }, tv_05: { driver: null, passengers: ['w_06'], seats: { w_06: 2 } } } }
};

// What the report must say, WORKED OUT FROM THE DISK by this file's own hand: every day
// key of the range parsed, a vehicle out when its stored trip has a man in it and the day
// does not keep it home, the vehicles' names and order off the stored list, the men's
// names off this file's own roster. The pinned words of tests/transport.test.mjs.
const reportFromDisk = (page, label, from, to, pruned) => page.evaluate(([label, from, to, workers, pruned]) => {
    const full = date => `${date.slice(8)}/${date.slice(5, 7)}/${date.slice(0, 4)}`;
    const count = n => (n === 1 ? 'יום אחד' : `${n} ימים`);
    const within = n => (n === 1 ? 'ביום אחד' : `ב-${n} ימים`);
    const vehicles = JSON.parse(localStorage.getItem('farkadTransport:settings')).vehicles.filter(v => v.active !== false);
    const rank = id => workers.findIndex(w => w.id === id);
    const nameOf = id => workers[rank(id)].name;
    const cars = vehicles.map(v => ({ id: v.id, name: v.name, days: 0, seats: 0, noDriver: 0, drivers: {} }));
    const men = {};
    let total = 0;
    let planned = 0;
    const start = new Date(Number(from.slice(0, 4)), Number(from.slice(5, 7)) - 1, Number(from.slice(8)), 12);
    const end = new Date(Number(to.slice(0, 4)), Number(to.slice(5, 7)) - 1, Number(to.slice(8)), 12);
    for (const at = new Date(start); at <= end; at.setDate(at.getDate() + 1)) {
        total += 1;
        const date = `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`;
        const raw = localStorage.getItem(`farkadTransport:day:${date}`);
        const day = raw ? JSON.parse(raw) : null;
        const sitting = trip => (trip.driver ? 1 : 0) + trip.passengers.length;
        if (!day || !Object.values(day.trips || {}).some(trip => sitting(trip) > 0)) continue;
        planned += 1;
        cars.forEach(car => {
            const trip = day.trips[car.id];
            if (!trip || (day.unavailable || {})[car.id] || sitting(trip) === 0) return;
            car.days += 1;
            car.seats += sitting(trip);
            if (!trip.driver) { car.noDriver += 1; return; }
            car.drivers[trip.driver] = (car.drivers[trip.driver] || 0) + 1;
            men[trip.driver] = men[trip.driver] || {};
            men[trip.driver][car.id] = (men[trip.driver][car.id] || 0) + 1;
        });
    }
    const said = [`ימים עם שיבוץ שמור במכשיר הזה: ${planned} מתוך ${total}`];
    if (total - planned > 0) said.push(total - planned === 1 ? 'ביום אחד אין שיבוץ שמור במכשיר הזה.' : `ב-${total - planned} ימים אין שיבוץ שמור במכשיר הזה.`);
    if (pruned) said.push(pruned);
    const blocks = [[`דוח הסעות – ${label}, ${full(from)} עד ${full(to)}:`], said];
    if (planned === 0) return blocks.map(block => block.join('\n')).join('\n\n');
    const most = (a, b) => b[1] - a[1] || rank(a[0]) - rank(b[0]);
    const out = cars.filter(car => car.days > 0);
    if (out.length === 0) blocks.push(['בימים עם שיבוץ אף רכב לא יצא עם עובדים.']);
    out.forEach(car => {
        const lines = [`רכב: ${car.name} – יצא ${within(car.days)}`];
        Object.entries(car.drivers).sort(most).forEach(([id, n]) => lines.push(`נהג: ${nameOf(id)} – ${count(n)}`));
        if (car.noDriver) lines.push(`בלי נהג – ${count(car.noDriver)}`);
        lines.push(`מושבים תפוסים: ${car.seats} בסך הכול, ${Math.round(car.seats / car.days * 10) / 10} בממוצע ליום`);
        blocks.push(lines);
    });
    const idle = cars.filter(car => car.days === 0);
    if (out.length && idle.length) blocks.push([`רכבים בלי עובדים בימים עם שיבוץ: ${idle.map(car => car.name).join(', ')}`]);
    const drivers = Object.keys(men).map(id => [id, Object.values(men[id]).reduce((a, b) => a + b, 0)]).sort(most);
    if (drivers.length) {
        blocks.push(['נהגים בתקופה:'].concat(drivers.map(([id, n]) =>
            `- ${nameOf(id)} – ${count(n)}: ${cars.filter(car => men[id][car.id]).map(car => `${car.name} (${men[id][car.id]})`).join(', ')}`)));
    }
    return blocks.map(block => block.join('\n')).join('\n\n');
}, [label, from, to, WORKERS, pruned || '']);
const reportField = page => page.evaluate(() => document.getElementById('transportReportText').value);
const reportOpen = page => visible(page, '#transportReportModal');
const pressed = page => page.evaluate(() => [...document.querySelectorAll('#transportReportRanges button')]
    .filter(node => node.getAttribute('aria-pressed') === 'true').map(node => node.dataset.range).join());

async function periodReport(page, where, small) {
    suite(`${where}: the report of a period - one button, four ranges, the stored plans counted, three ways out, nothing written`);
    await page.evaluate(staged => {
        Object.keys(staged).forEach(date => localStorage.setItem(`farkadTransport:day:${date}`, JSON.stringify(staged[date])));
    }, STAGED);
    const record = await recordBytes(page);
    const disk = await diskOf(page);
    await censusOnly(check, page, JSON.parse(disk)[0]);
    given('three days of plans are on the disk for the week', (await page.evaluate(() =>
        Object.keys(localStorage).filter(key => key.startsWith('farkadTransport:day:')).sort().join())) ===
        'farkadTransport:day:2026-11-08,farkadTransport:day:2026-11-09,farkadTransport:day:2026-11-10');

    same('one button on the screen, by its words', await page.locator('#transportPanel button', { hasText: REPORT }).evaluateAll(nodes => nodes.map(node => node.id)),
        ['transportReportOpen']);
    check('it is under the last car and above the folded list of vehicles - not on the first screen, which is the cars\'', await page.evaluate(() => {
        const node = document.getElementById('transportReportOpen');
        const cars = [...document.querySelectorAll('#transportBody [data-car]')];
        const after = (a, b) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
        return after(cars[cars.length - 1], node) && after(node, document.getElementById('transportFleet'))
            && document.getElementById('transportSummaryOpen').nextElementSibling !== node;
    }));
    same('and nowhere else in the app is there a way to it', await page.evaluate(word =>
        [...document.querySelectorAll('button, a, summary')].filter(node => node.textContent.includes(word) || /transportReport|openTransportReport/.test(node.getAttribute('onclick') || ''))
            .filter(node => !node.closest('#transportPanel') && !node.closest('#transportReportModal')).length, 'דוח הסעות'), 0);
    await page.locator('#transportReportOpen').scrollIntoViewIfNeeded();
    const size = await page.locator('#transportReportOpen').boundingBox();
    check('44px at least, both ways, and the width of the list', size.height >= 43.5 && size.width >= 200, JSON.stringify(size));
    check('scrolled to, it is on the glass and under nothing', await page.evaluate(() => {
        const node = document.getElementById('transportReportOpen');
        const box = node.getBoundingClientRect();
        const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
        return hit === node || node.contains(hit);
    }));
    await floors(page, 'with the report\'s button on the panel', small ? 56 : 44);

    await page.locator('#transportReportOpen').tap();
    await page.locator('#transportReportModal').waitFor({ state: 'visible' });
    await page.waitForTimeout(300);
    same('it opens the app\'s own dialog: its title, the four ranges by the pay report\'s words, the label, and the summary\'s four buttons',
        [await text(page, '#transportReportTitle'), (await page.locator('#transportReportRanges button').allTextContents()).map(bare),
            await page.locator('#transportReportRanges').getAttribute('aria-label'), await text(page, '#transportReportLabel'),
            (await page.locator('#transportReportModal .modal-actions button').allTextContents()).map(bare)],
        ['דוח הסעות', ['השבוע', 'שבוע קודם', 'החודש', 'חודש שעבר'], 'בחירת תקופה', 'תצוגה מקדימה של הדוח',
            ['שליחה בוואטסאפ', 'העתקה', 'שיתוף כתמונה', 'סגירה']]);
    same('it opens on this week', await pressed(page), 'thisWeek');
    const shape = await page.evaluate(() => {
        const modal = document.getElementById('transportReportModal');
        const field = document.getElementById('transportReportText');
        const box = field.getBoundingClientRect();
        const content = modal.querySelector('.modal-content').getBoundingClientRect();
        const buttons = [...modal.querySelectorAll('button')];
        const boxes = buttons.map(node => node.getBoundingClientRect());
        const on = modal.querySelector('#transportReportRanges button[aria-pressed="true"]');
        const offButton = modal.querySelector('#transportReportRanges button[aria-pressed="false"]');
        const probe = document.createElement('span');
        probe.style.cssText = 'position:absolute;background:var(--accent)';
        modal.appendChild(probe);
        const accent = getComputedStyle(probe).backgroundColor;
        probe.remove();
        return { onTop: document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2) === field,
            panelOpen: document.getElementById('transportPanel').classList.contains('open'),
            readOnly: field.readOnly, font: parseFloat(getComputedStyle(field).fontSize),
            small: boxes.filter(one => one.width < 43.5 || one.height < 43.5).length,
            smallFont: buttons.filter(node => parseFloat(getComputedStyle(node).fontSize) < 16).length,
            reachable: buttons.every(node => { const b = node.getBoundingClientRect(); const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return hit === node || node.contains(hit); }),
            apart: boxes.every((a, i) => boxes.every((b, j) => i >= j || a.right <= b.left + 0.5 || b.right <= a.left + 0.5 || a.bottom <= b.top + 0.5 || b.bottom <= a.top + 0.5)),
            inside: content.left >= -0.5 && content.right <= window.innerWidth + 0.5 && content.top >= -0.5 && content.bottom <= window.innerHeight + 0.5,
            pageFits: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
            chosenDiffers: getComputedStyle(on).backgroundColor !== getComputedStyle(offButton).backgroundColor,
            chosenFilled: getComputedStyle(on).backgroundColor === accent };
    });
    check('the dialog is OVER the panel, which stays open behind it', shape.onTop && shape.panelOpen, JSON.stringify(shape));
    check('the text is in a field nobody types in, at 16px or more', shape.readOnly && shape.font >= 16, JSON.stringify(shape));
    same('no button of it - a range or a way out - is under 44px either way, or under 16px', [shape.small, shape.smallFont], [0, 0]);
    check('every button is on the glass, under no other, and no two overlap', shape.reachable && shape.apart, JSON.stringify(shape));
    check('it is whole on the glass and the page does not scroll sideways', shape.inside && shape.pageFits, JSON.stringify(shape));
    check('the chosen range is told from the others without a filled button', shape.chosenDiffers && !shape.chosenFilled, JSON.stringify(shape));

    const field = await reportField(page);
    const want = await reportFromDisk(page, 'השבוע', '2026-11-06', '2026-11-12');
    same('THE WORDS ARE THE PLANS ON THE DISK: three days of seven, each vehicle\'s days, drivers and seats, each driver\'s vehicles - counted again by this file',
        bare(field).split('\n'), want.split('\n'));
    check('and that is a report with something in it: a vehicle out on two days with two drivers, a driver in two vehicles, a day with nobody at the wheel, four days said to have no plan',
        want.includes('יצא ב-2 ימים') && want.includes('ב-4 ימים אין שיבוץ שמור במכשיר הזה.') && want.includes('נהגים בתקופה:')
        && /- סמיר – 2 ימים: [^\n]+ \(1\), [^\n]+ \(1\)/.test(want)
        && want.includes('בלי נהג – יום אחד'), want);
    check('a vehicle\'s name is held right-to-left in it, a man\'s is isolated, and no line begins with a vehicle', field.includes(`${RLI}`) && field.includes(`${FSI}`)
        && field.split('\n').every(line => !line.startsWith(RLI) && !/^[A-Za-z]/.test(line)));
    check('a day with no plan is never called a vehicle that stayed home', !/לא זמין|נשאר|בבית|לא יצא/.test(field));

    // --- the ranges
    await page.locator('#transportReportRanges button[data-range="thisMonth"]').tap();
    same('«החודש» is the pressed one, and the only one', await pressed(page), 'thisMonth');
    const month = await reportField(page);
    same('and the field is the month, counted off the same disk', bare(month).split('\n'),
        (await reportFromDisk(page, 'החודש', '2026-11-01', '2026-11-30')).split('\n'));
    await page.locator('#transportReportRanges button[data-range="lastWeek"]').tap();
    same('«שבוע קודם»: nothing was kept for it, and it says so for all seven days and names no vehicle',
        [await pressed(page), bare(await reportField(page)).split('\n')],
        ['lastWeek', ['דוח הסעות – שבוע קודם, 30/10/2026 עד 05/11/2026:', '', 'ימים עם שיבוץ שמור במכשיר הזה: 0 מתוך 7', 'ב-7 ימים אין שיבוץ שמור במכשיר הזה.']]);
    await page.locator('#transportReportRanges button[data-range="lastMonth"]').tap();
    same('«חודש שעבר» on the 10th says that its first five days are older than the store keeps',
        [await pressed(page), bare(await reportField(page)).split('\n')],
        ['lastMonth', (await reportFromDisk(page, 'חודש שעבר', '2026-10-01', '2026-10-31',
            'מתוכם 5 ימים לפני 06/10/2026: שיבוצים ישנים מ-35 ימים נמחקים מהמכשיר הזה.')).split('\n')]);
    await page.locator('#transportReportRanges button[data-range="thisWeek"]').tap();
    same('back on «השבוע» it says what it said', await reportField(page), field);

    // --- WhatsApp, by the day message's own door, through recorders.
    await page.evaluate(() => {
        window.__shared = null;
        window.__opened = null;
        window.__realOpen = window.open;
        window.open = url => { window.__opened = url; return null; };
        navigator.share = data => { window.__shared = data; return Promise.reject(Object.assign(new Error('x'), { name: 'AbortError' })); };
    });
    await page.locator('#transportReportSend').tap();
    await page.waitForTimeout(150);
    same('«שליחה בוואטסאפ» hands the share sheet the text and nothing else', await page.evaluate(() => window.__shared), { text: field });
    check('a share sheet backed out of is not a failure: the dialog stays, says nothing, and opens nothing',
        (await reportOpen(page)) && (await text(page, '#transportReportStatus')) === '' && (await page.evaluate(() => window.__opened)) === null);
    await page.evaluate(() => { navigator.share = () => Promise.reject(new Error('boom')); });
    await page.locator('#transportReportSend').tap();
    await page.waitForTimeout(150);
    check('a share sheet that fails keeps the report on the glass and says to copy it',
        (await reportOpen(page)) && (await text(page, '#transportReportStatus')).includes('העתק'), await text(page, '#transportReportStatus'));
    await page.locator('#transportReportRanges button[data-range="thisMonth"]').tap();
    same('choosing another range clears what was said about the last one', await text(page, '#transportReportStatus'), '');
    await page.locator('#transportReportRanges button[data-range="thisWeek"]').tap();
    await page.evaluate(() => { delete navigator.share; });
    await page.locator('#transportReportSend').tap();
    await page.waitForTimeout(150);
    same('with no share sheet it is wa.me with the text and NO NUMBER - the person picks the chat',
        await page.evaluate(() => window.__opened), `https://wa.me/?text=${encodeURIComponent(field)}`);
    check('and the dialog steps aside, the screen still there', !(await reportOpen(page)) && (await visible(page, '#transportPanel')));

    // --- copy
    await page.locator('#transportReportOpen').tap();
    await page.locator('#transportReportModal').waitFor({ state: 'visible' });
    same('opened again it is on this week, with nothing said', [await pressed(page), await text(page, '#transportReportStatus')], ['thisWeek', '']);
    await page.evaluate(() => { window.__copied = null; navigator.clipboard.writeText = value => { window.__copied = value; return Promise.resolve(); }; });
    await page.locator('#transportReportCopy').tap();
    await page.waitForTimeout(150);
    same('«העתקה» puts the same text on the clipboard, and says it did', [await page.evaluate(() => window.__copied), await text(page, '#transportReportStatus')],
        [field, '✔️ הועתק']);

    // --- the picture: read off this dialog, drawn by the printout's own machinery.
    const picture = await page.evaluate(() => {
        const seen = [];
        const proto = CanvasRenderingContext2D.prototype;
        const real = proto.fillText;
        proto.fillText = function (value, ...rest) { seen.push(String(value)); return real.call(this, value, ...rest); };
        let out = null;
        try { out = printoutImage('transport'); } finally { proto.fillText = real; }
        if (!out) return null;
        return { name: out.name, type: out.blob.type, size: out.blob.size, rows: out.layout.rows.length, title: Boolean(out.layout.title), seen };
    });
    given('the picture was drawn', Boolean(picture));
    if (picture) {
        same('the picture is a PNG named for the range', [picture.name, picture.type, picture.size > 2000],
            ['farkad-דוח-הסעות-2026-11-06_2026-11-12.png', 'image/png', true]);
        same('it has a title and one box for every block under it', [picture.title, picture.rows], [true, field.split('\n\n').length - 1]);
        same('and every word drawn in it is a word of the dialog, in the dialog\'s order - nothing added, nothing left out',
            bare(picture.seen.join(' ')), bare(field.split('\n').filter(Boolean).join(' ')));
    }
    await page.evaluate(() => {
        window.__file = null;
        navigator.canShare = () => true;
        navigator.share = data => { const file = data.files && data.files[0]; window.__file = file ? { name: file.name, type: file.type, size: file.size, text: data.text || null } : 'no file'; return Promise.resolve(); };
    });
    await page.locator('#transportReportRanges button[data-range="thisMonth"]').tap();
    await page.locator('#transportReportPicture').tap();
    await page.waitForTimeout(150);
    const file = await page.evaluate(() => window.__file);
    check('«שיתוף כתמונה» hands the share sheet that file, inside the tap, named for the range that is CHOSEN',
        Boolean(file) && file.name === 'farkad-דוח-הסעות-2026-11-01_2026-11-30.png' && file.type === 'image/png' && file.size > 2000 && file.text === null, JSON.stringify(file));
    check('and the dialog stays for the next thing', await reportOpen(page));
    await page.evaluate(() => { delete navigator.share; delete navigator.canShare; window.open = window.__realOpen; });
    await page.locator('#transportReportRanges button[data-range="thisWeek"]').tap();

    // --- a plan that changes while the dialog is open: the words follow the disk.
    const moved = await page.evaluate(day => {
        const tile = [...document.querySelectorAll('#transportBody .transport-seat[data-worker]')].filter(one => one.dataset.seat !== '1').pop();
        const was = { id: tile.dataset.worker, vehicle: tile.dataset.vehicle, n: Number(tile.dataset.seat) };
        transportUnseat(day, was.id);
        renderTransportIfOpen();
        return was;
    }, DAY);
    const after = await reportField(page);
    check('the open dialog was brought up to date: one seat fewer', after !== field, after);
    same('and is again exactly what the disk holds', bare(after).split('\n'), (await reportFromDisk(page, 'השבוע', '2026-11-06', '2026-11-12')).split('\n'));
    await page.evaluate(([day, was]) => { transportPlace(day, was.id, was.vehicle, was.n); renderTransportIfOpen(); }, [DAY, moved]);
    same('put back, it says what it said', await reportField(page), field);

    // --- 200% text: the words double and the boxes make room; nothing is cut or lost.
    const big = await page.evaluate(() => {
        const modal = document.getElementById('transportReportModal');
        const content = modal.querySelector('.modal-content');
        const touched = [...modal.querySelectorAll('*')].map(node => [node, parseFloat(getComputedStyle(node).fontSize)]);
        touched.forEach(([node, size]) => node.style.setProperty('font-size', `${size * 2}px`, 'important'));
        const buttons = [...modal.querySelectorAll('button')];
        const result = {
            clipped: buttons.filter(node => node.scrollWidth > node.clientWidth + 1 || node.scrollHeight > node.clientHeight + 1).map(node => node.textContent),
            small: buttons.filter(node => node.getBoundingClientRect().width < 43.5 || node.getBoundingClientRect().height < 43.5).length,
            sideways: content.scrollWidth > content.clientWidth + 1 || document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
            inside: content.getBoundingClientRect().left >= -0.5 && content.getBoundingClientRect().right <= window.innerWidth + 0.5,
            scrolls: content.scrollHeight <= content.clientHeight + 1 || /auto|scroll/.test(getComputedStyle(content).overflowY)
        };
        const close = document.getElementById('transportReportClose');
        close.scrollIntoView({ block: 'nearest' });
        const box = close.getBoundingClientRect();
        const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
        result.closeReached = (hit === close || close.contains(hit)) && box.top >= -0.5 && box.bottom <= window.innerHeight + 0.5;
        touched.forEach(([node]) => node.style.removeProperty('font-size'));
        content.scrollTop = 0;
        return result;
    });
    same('at 200% text no button\'s words are cut', big.clipped, []);
    check('nothing runs off the side, every button is still 44px, and «סגירה» can be scrolled to and touched',
        big.small === 0 && !big.sideways && big.inside && big.scrolls && big.closeReached, JSON.stringify(big));

    // --- the way out, and what it all cost: nothing.
    await page.keyboard.press('Escape');
    check('Escape closes the dialog and NOT the screen behind it', !(await reportOpen(page)) && (await visible(page, '#transportPanel')));
    same('with the dialog shut there is no picture to draw', await page.evaluate(() => printoutImage('transport')), null);
    await page.locator('#transportReportOpen').tap();
    await page.locator('#transportReportModal').waitFor({ state: 'visible' });
    await page.locator('#transportReportClose').tap();
    check('«סגירה» closes it too, and the keyboard is back on the button that opened it', !(await reportOpen(page))
        && (await page.evaluate(() => document.activeElement && document.activeElement.id)) === 'transportReportOpen');
    same('NOTHING WAS WRITTEN: the same keys on the disk, and every transport key byte for byte', await diskOf(page), disk);
    same('the record and the queue are byte for byte what they were', await recordBytes(page), record);
    check('nothing in it says «נשלח»', !/נשלח/.test(field + month + await page.locator('#transportReportModal').textContent()));

    // The summary of the day still draws ITS picture: the reader takes whichever is open.
    await page.locator('#transportSummaryOpen').tap();
    await page.locator('#transportSummaryModal').waitFor({ state: 'visible' });
    same('with the summary open, the picture is the summary\'s again', await page.evaluate(() => printoutImage('transport').name), 'farkad-הסעות-2026-11-10.png');
    await page.locator('#transportSummaryClose').tap();

    await page.evaluate(staged => { Object.keys(staged).forEach(date => localStorage.removeItem(`farkadTransport:day:${date}`)); }, STAGED);
}

async function shot(page, name) {
    if (!SHOTS) return;
    await page.screenshot({ path: join(SHOTS, `${name}.jpg`), type: 'jpeg', quality: 80 });
}

async function evening(width, height, scheme) {
    const where = `${width}x${height} ${scheme}`;
    const small = width <= 375;
    const seatFloor = small ? 56 : 44;
    const { page, context, cdp, errors, away } = await open(width, height, scheme);

    // ------------------------------------------------------------ off by default
    suite(`${where}: off until this phone turns it on`);
    await page.locator(WA_BUTTON).click();
    await page.locator('#shareModal').waitFor({ state: 'visible' });
    check('the WhatsApp dialog has the seder\'s row', await visible(page, '#sederEntry'));
    same('and no entry for transport', await page.locator('#transportEntry').count(), 0);
    await page.keyboard.press('Escape');
    same('nothing of it is on the disk', await page.evaluate(() =>
        Object.keys(localStorage).filter(key => /transport/i.test(key))), []);
    same('and the day screen has no control of it',
        await page.locator('#dayView [id^="transport"], #dayView [class*="transport"]').count(), 0);
    same('nor is there a summary button, or a summary, anywhere', [await page.locator('#transportSummaryOpen').count(),
        await page.evaluate(() => openTransportSummary()), await visible(page, '#transportSummaryModal')], [0, false, false]);
    same('nor a report button, or a report', [await page.locator('#transportReportOpen').count(),
        await page.evaluate(() => openTransportReport()), await visible(page, '#transportReportModal'),
        await page.evaluate(() => transportReportText('thisWeek', '2026-11-10'))], [0, false, false, '']);

    // ------------------------------------------------------------ the switch, in ⋯
    suite(`${where}: the switch in ⋯`);
    await page.locator('#settingsBtn').click();
    await page.locator('#transportSwitchCard').scrollIntoViewIfNeeded();
    check('the card is the last row of «כללי»', await page.evaluate(() => {
        const card = document.getElementById('transportSwitchCard');
        const section = document.getElementById('settingsDailySection');
        return Boolean(card && section && section.lastElementChild === card
            && card.tagName === 'DETAILS' && !card.closest('#settingsHelpCards'));
    }));
    same('shut until it is tapped', await page.evaluate(() => document.getElementById('transportSwitchCard').open), false);
    await page.locator('#transportSwitchCard > summary').click();
    check('it says each phone turns it on for itself, shared where signed in, not in a backup',
        (await text(page, '#transportSwitchCard')).includes(THIS_PHONE));
    same('its button offers to turn it on', await text(page, '#transportSwitch'), SWITCH_ON);
    const switchBox = await page.locator('#transportSwitch').boundingBox();
    check('a finger wide and tall', switchBox && switchBox.width >= 44 && switchBox.height >= 44, JSON.stringify(switchBox));
    await page.locator('#transportSwitch').click();
    same('turned on, it offers to turn it off', await text(page, '#transportSwitch'), SWITCH_OFF);
    same('and the preference is on this phone\'s disk', await page.evaluate(() => localStorage.getItem('farkadTransport:enabled')), '1');
    await page.evaluate(() => closeSettings());

    // ------------------------------------------------------------ the one entry
    suite(`${where}: one entry, in the WhatsApp dialog`);
    const before = await recordBytes(page);
    given('the record is on the disk', before.includes('scheduleData:v2'));
    await page.locator(WA_BUTTON).click();
    await page.locator('#shareModal').waitFor({ state: 'visible' });
    same('the entry is there, by its word', await text(page, '#transportEntry'), ENTRY);
    check('directly under the seder\'s row', await page.evaluate(() =>
        document.getElementById('sederEntry').nextElementSibling === document.getElementById('transportEntry')));
    const entryBox = await page.locator('#transportEntry').boundingBox();
    check('a finger tall, and the width of the dialog\'s row', entryBox && entryBox.height >= 44 && entryBox.width >= 200,
        JSON.stringify(entryBox));
    await page.locator('#transportEntry').click();
    await page.locator('#transportPanel.open').waitFor({ state: 'visible' });
    await page.waitForTimeout(80);
    check('the WhatsApp dialog stepped aside', !(await visible(page, '#shareModal')));
    same('the panel is entered at its heading', await page.evaluate(() => document.activeElement && document.activeElement.id), 'transportTitle');
    same('which is the feature\'s name', await text(page, '#transportTitle'), TITLE);
    same('with the day it is about', await text(page, '#transportContext'), 'יום שלישי 10/11/2026');
    check('it covers the screen', await page.evaluate(() => {
        const box = document.getElementById('transportPanel').getBoundingClientRect();
        return box.top <= 0 && box.left <= 0 && box.right >= window.innerWidth && box.bottom >= window.innerHeight;
    }));
    check('it is still the settings-panel layer: fixed, hidden on paper, lowered with a stuck frame by that class',
        await page.evaluate(() => document.getElementById('transportPanel').classList.contains('settings-panel')
            && getComputedStyle(document.getElementById('transportPanel')).position === 'fixed'));
    check('opening it wrote nothing', await page.evaluate(key => localStorage.getItem(key) === null
        && localStorage.getItem('farkadTransport:settings') === null, DAY_KEY));

    // ------------------------------------------------------------ the picture
    suite(`${where}: one screen - the tray, and each car drawn from above`);
    same('there are no tabs', await page.locator('#transportPanel [role="tab"], #transportTabs').count(), 0);
    same('the tray counts the men who work today and have no seat', await text(page, '#transportTrayTitle'), 'ממתינים לשיבוץ (12)');
    same('one chip each, in roster order - and not the man marked נעדר', await tray(page), ALL);
    same('a chip is the man\'s name', await page.locator('#transportChips .transport-chip-name').allTextContents(), NAMES.slice(0, 12));
    check('with his site\'s own fixed colour as a dot, and no other colour', await page.evaluate(() => {
        const chips = [...document.querySelectorAll('#transportChips .transport-chip')];
        return chips.every((node, i) => node.style.getPropertyValue('--seat-site') === `var(--site-${(i % 4) + 1})`
            && getComputedStyle(node.querySelector('.transport-dot')).backgroundColor !== getComputedStyle(node).backgroundColor);
    }));
    check('how it is done is said while nobody is seated', (await text(page, '#transportHint')).startsWith('גוררים עובד אל מושב'));
    same('a card for each of the seven vehicles, by the owner\'s names', await page.locator('#transportBody [data-car] .transport-vehicle-name').allTextContents(), VEHICLES);
    same('each with its rows: five-seaters 2 and 3, the nine-seater 2-2-2-3', await page.evaluate(() =>
        [...document.querySelectorAll('#transportBody [data-car]')].map(card =>
            [...card.querySelectorAll('.transport-seat-row')].map(row => row.children.length).join('-'))),
    ['2-3', '2-3', '2-3', '2-3', '2-2-2-3', '2-3', '2-3']);
    same('every empty seat says «הוספת עובד», and the driver\'s says «נהג»', await page.evaluate(() => {
        const tiles = [...document.querySelectorAll('#transportBody .transport-seat')];
        const words = seat => [...new Set(tiles.filter(tile => (tile.dataset.seat === '1') === seat).map(tile => tile.textContent))];
        return [tiles.length, words(true), words(false)];
    }), [39, [DRIVER], [ADD]]);
    // THE DRIVER IS ON THE LEFT OF THE CAR, in a right-to-left page. Israel drives on the
    // right; a drawing mirrored by the page's direction would put him on the wrong side.
    const sides = await page.evaluate(() => {
        const box = sel => document.querySelector(sel).getBoundingClientRect();
        const rows = id => [...document.querySelectorAll(`#transportBody [data-car="${id}"] .transport-seat-row`)]
            .map(row => [...row.children].sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left).map(tile => Number(tile.dataset.seat)));
        const one = box('#transportBody [data-car="tv_01"] .transport-seat[data-seat="1"]');
        const glass = box('#transportBody [data-car="tv_01"] .transport-windscreen');
        const shell = box('#transportBody [data-car="tv_01"] .transport-car-body');
        return { page: getComputedStyle(document.documentElement).direction,
            car: getComputedStyle(document.querySelector('#transportBody .transport-car')).direction,
            five: rows('tv_01'), nine: rows('tv_05'),
            wheel: Boolean(document.querySelector('#transportBody [data-car="tv_01"] .transport-seat[data-seat="1"] svg.transport-glyph-wheel')),
            wheels: document.querySelectorAll('#transportBody .transport-seat svg.transport-glyph-wheel').length,
            leftHalf: one.left + one.width / 2 < shell.left + shell.width / 2,
            glassOnTop: glass.bottom <= one.top && glass.top >= shell.top,
            noPictures: document.querySelectorAll('#transportPanel img, #transportPanel image').length === 0 };
    });
    same('the page reads right to left and the car does not', [sides.page, sides.car], ['rtl', 'ltr']);
    same('a five-seater, as it lies on the glass from left to right: the driver first; behind, seats 5, 4, 3', sides.five, [[1, 2], [5, 4, 3]]);
    same('the nine-seater: driver and one; two; two; three', sides.nine, [[1, 2], [4, 3], [6, 5], [9, 8, 7]]);
    check('the driver\'s seat is in the LEFT half of the car, under the windscreen, and carries the drawn steering wheel - it alone',
        sides.leftHalf && sides.glassOnTop && sides.wheel && sides.wheels === 7, JSON.stringify(sides));
    check('drawn with shapes: no image anywhere on the panel', sides.noPictures);
    // The whole nine-seater, inside its outline, inside the screen.
    await show(page, seat('tv_05', 5));
    const van = await page.evaluate(() => {
        const shell = document.querySelector('#transportBody [data-car="tv_05"] .transport-car-body').getBoundingClientRect();
        const tiles = [...document.querySelectorAll('#transportBody .transport-seat[data-vehicle="tv_05"]')].map(tile => tile.getBoundingClientRect());
        return { count: tiles.length, inside: tiles.every(box => box.left >= shell.left && box.right <= shell.right && box.top >= shell.top && box.bottom <= shell.bottom),
            onGlass: shell.left >= 0 && shell.right <= window.innerWidth,
            least: Math.floor(Math.min(...tiles.map(box => Math.min(box.width, box.height)))) };
    });
    check(`all nine tiles of the nine-seater fit inside its outline, on the screen, none under ${seatFloor}px`,
        van.count === 9 && van.inside && van.onGlass && van.least >= seatFloor, JSON.stringify(van));
    await page.evaluate(() => { document.getElementById('transportBody').scrollTop = 0; });
    // SUNLIGHT: the outline and the seats' borders at 3:1 or better against what they are
    // drawn on, an empty seat's words at 4.5:1.
    const contrast = await page.evaluate(() => {
        const rgb = value => (value.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
        const lum = value => { const [r, g, b] = rgb(value).map(c => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
        const ratio = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
        const card = getComputedStyle(document.querySelector('#transportBody [data-car="tv_01"]')).backgroundColor;
        const shell = getComputedStyle(document.querySelector('#transportBody .transport-car-body'));
        const empty = getComputedStyle(document.querySelector('#transportBody .transport-seat-empty'));
        return { outline: ratio(shell.borderTopColor, card), seatBorder: ratio(empty.borderTopColor, shell.backgroundColor),
            emptyWords: ratio(empty.color, shell.backgroundColor) };
    });
    check('the car\'s outline and an empty seat\'s border are 3:1 or better on their ground; the words on it 4.5:1',
        contrast.outline >= 3 && contrast.seatBorder >= 3 && contrast.emptyWords >= 4.5, JSON.stringify(contrast));
    await floors(page, 'the empty picture', seatFloor);
    same('opening it and looking wrote nothing to the day', await page.evaluate(key => localStorage.getItem(key), DAY_KEY), null);

    // ------------------------------------------------------------ dragging
    suite(`${where}: a man is carried to a seat by a finger`);
    // Which input path the page actually saw, counted on the document in the capture phase.
    await page.evaluate(() => {
        window.__seen = { touch: 0, mouse: 0, native: 0 };
        document.addEventListener('pointerdown', event => { window.__seen[event.pointerType === 'touch' ? 'touch' : 'mouse'] += 1; }, true);
        document.addEventListener('dragstart', () => { window.__seen.native += 1; }, true);
    });
    // The first drag, stopped in the air.
    await show(page, seat('tv_01', 3));
    const from = await centre(page, chip('w_02'));
    const to = await centre(page, seat('tv_01', 3));
    await down(cdp, from);
    await glide(cdp, page, from, to);
    const air = await page.evaluate(() => {
        const ghost = document.querySelector('#transportPanel .transport-ghost');
        const over = [...document.querySelectorAll('#transportBody .transport-over')];
        return { ghost: ghost ? ghost.textContent : null, position: ghost ? getComputedStyle(ghost).position : null,
            pointer: ghost ? getComputedStyle(ghost).pointerEvents : null,
            over: over.map(node => `${node.dataset.vehicle}:${node.dataset.seat}`),
            fixedLayers: [...document.querySelectorAll('#transportPanel *')].filter(node => getComputedStyle(node).position === 'fixed').length,
            selection: String(getSelection()) };
    });
    same('a copy of the man floats under the finger, and the seat under it is lit', [air.ghost, air.over], ['מוחמד', ['tv_01:3']]);
    check('the copy is no new fixed layer, takes no touches, and nothing was selected',
        air.position === 'absolute' && air.pointer === 'none' && air.fixedLayers === 0 && air.selection === '', JSON.stringify(air));
    same('nothing is changed while he is in the air', await kept(page), '');
    if (SHOTS && width === 440 && scheme === 'dark') await shot(page, 'dragging-440-dark');
    await up(cdp);
    await page.waitForTimeout(80);
    same('released on an empty seat, he sits there', [await drawn(page, 'tv_01'), await kept(page)], ['- - w_02 - -', 'tv_01:- w_02@3']);
    check('the copy is gone and nothing is lit', (await page.locator('.transport-ghost, .transport-over, .transport-lifted').count()) === 0);
    same('he has left the tray', [await text(page, '#transportTrayTitle'), (await tray(page)).includes('w_02')], ['ממתינים לשיבוץ (11)', false]);
    check('the seat shows his name and his site\'s colour, and its accessible name is the whole of both', await page.evaluate(sel => {
        const tile = document.querySelector(sel);
        return tile.querySelector('.transport-seat-name').textContent === 'מוחמד' && tile.style.getPropertyValue('--seat-site') === 'var(--site-2)'
            && tile.getAttribute('aria-label') === 'מוחמד · חיפה' && getComputedStyle(tile).boxShadow !== 'none';
    }, seated('w_02')));
    const nameContrast = await page.evaluate(sel => {
        const rgb = value => (value.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
        const lum = value => { const [r, g, b] = rgb(value).map(c => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
        const style = getComputedStyle(document.querySelector(sel));
        const [hi, lo] = [lum(style.color), lum(style.backgroundColor)].sort((x, y) => y - x);
        const [bhi, blo] = [lum(style.borderTopColor), lum(style.backgroundColor)].sort((x, y) => y - x);
        return { name: (hi + 0.05) / (lo + 0.05), border: (bhi + 0.05) / (blo + 0.05) };
    }, seated('w_02'));
    check('a name is 7:1 or better on its seat, and the seat\'s border 3:1', nameContrast.name >= 7 && nameContrast.border >= 3, JSON.stringify(nameContrast));
    check('the hint is gone once somebody is seated', (await page.locator('#transportHint').count()) === 0);
    same('passengers and nobody at the wheel: one calm line, and no door to WhatsApp',
        [await text(page, '[data-car="tv_01"] .transport-card-line'), await page.locator('[data-car="tv_01"] a').count(), await text(page, '[data-car="tv_01"] .transport-occupancy')],
        ['בלי נהג', 0, '1 מתוך 5']);

    await drag(cdp, page, chip('w_01'), seat('tv_01', 1));
    same('dropped on the driver\'s seat, he is the driver - nobody is asked whether he may',
        [await drawn(page, 'tv_01'), await kept(page), await page.locator(seated('w_01')).getAttribute('aria-label')],
        ['w_01 - w_02 - -', 'tv_01:w_01 w_02@3', `נהג: ${named('אחמד')} · הרצליה`]);
    const message = [`שלום ${named('אחמד')},`, 'הסעה ליום שלישי 10/11/2026:', `רכב: ${car('טויוטה קורולה 2013')}`, 'נוסעים (1):',
        `- ${named('מוחמד')} – ${named('חיפה')}`, `יעדים: ${named('הרצליה')}, ${named('חיפה')}`].join('\n');
    const link = page.locator('a[data-wa="tv_01"]');
    same('and the door to WhatsApp appears: a real link with the whole address on it, opened in its own tab',
        [await link.getAttribute('href'), await link.getAttribute('target'), await link.getAttribute('rel'), await text(page, 'a[data-wa="tv_01"]')],
        [`https://wa.me/972528841930?text=${encodeURIComponent(message)}`, '_blank', 'noopener noreferrer', 'פתיחה בוואטסאפ']);
    check('it is WhatsApp\'s green - the only thing on the panel that is', await page.evaluate(() => {
        const probe = document.createElement('span');
        probe.style.cssText = 'position:absolute;background:var(--wa)';
        document.body.appendChild(probe);
        const wa = getComputedStyle(probe).backgroundColor;
        probe.remove();
        const green = [...document.querySelectorAll('#transportPanel *')].filter(node => getComputedStyle(node).backgroundColor === wa);
        return green.length === 1 && green[0].matches('a[data-wa="tv_01"]');
    }));
    check('the line about the missing driver is gone', (await page.locator('[data-car="tv_01"] .transport-card-line').count()) === 0);

    await drag(cdp, page, chip('w_03'), seat('tv_01', 3));
    same('a waiting man dropped on a TAKEN seat takes it, and the man who sat there is back in the tray',
        [await drawn(page, 'tv_01'), (await tray(page)).slice(0, 2), await kept(page)],
        ['w_01 - w_03 - -', ['w_02', 'w_04'], 'tv_01:w_01 w_03@3']);

    await drag(cdp, page, seated('w_03'), seat('tv_02', 1), HOLD);
    same('a seated man, held and carried, goes from one car to another',
        [await drawn(page, 'tv_01'), await drawn(page, 'tv_02'), await kept(page)],
        ['w_01 - - - -', 'w_03 - - - -', 'tv_01:w_01 | tv_02:w_03']);
    same('his car\'s driver has no number: said, and no link', [await page.locator('[data-car="tv_02"]').getAttribute('data-mark'),
        await text(page, '[data-car="tv_02"] .transport-mark'), await page.locator('[data-car="tv_02"] a').count()],
    ['nophone', 'אין מספר טלפון תקין', 0]);
    await drag(cdp, page, chip('w_04'), seat('tv_01', 4));
    await drag(cdp, page, seated('w_04'), seat('tv_01', 1), HOLD);
    same('a seated man dropped on a TAKEN seat changes places with the man in it - here the passenger becomes the driver, and the driver takes his seat',
        [await drawn(page, 'tv_01'), await kept(page)], ['w_04 - - w_01 -', 'tv_01:w_04 w_01@4 | tv_02:w_03']);
    await drag(cdp, page, seated('w_01'), seat('tv_02', 2), HOLD);
    same('and a seated man is carried from a rear seat of one car to the front of the next',
        [await drawn(page, 'tv_01'), await drawn(page, 'tv_02'), await kept(page)],
        ['w_04 - - - -', 'w_03 w_01 - - -', 'tv_01:w_04 | tv_02:w_03 w_01@2']);
    same('and the door now opens the new driver\'s chat', (await page.locator('a[data-wa="tv_01"]').getAttribute('href')).split('?')[0], 'https://wa.me/972501112233');

    await show(page, seated('w_01'));
    const lifted = await centre(page, seated('w_01'));
    const trayPoint = await centre(page, '#transportTrayTitle');
    await down(cdp, lifted);
    await lifts(page);
    check('a finger resting on a seated man lifts him: the copy is there before it moves',
        (await page.locator('.transport-ghost').count()) === 1 && (await page.locator(`${seated('w_01')}.transport-lifted`).count()) === 1);
    await glide(cdp, page, lifted, trayPoint);
    check('over the tray, the tray is lit', await page.evaluate(() => document.getElementById('transportTray').classList.contains('transport-over')));
    await up(cdp);
    await page.waitForTimeout(80);
    same('dropped on the tray, he is out of the car and waiting',
        [await drawn(page, 'tv_02'), (await tray(page))[0], await kept(page)], ['w_03 - - - -', 'w_01', 'tv_01:w_04 | tv_02:w_03']);

    const steady = [await kept(page), await tray(page)];
    await drag(cdp, page, chip('w_01'), head('tv_01'));
    same('a waiting man released outside any seat: nothing changes', [await kept(page), await tray(page)], steady);
    await drag(cdp, page, seated('w_04'), head('tv_02'), HOLD);
    same('a seated man released outside any seat: nothing changes', [await kept(page), await tray(page), await drawn(page, 'tv_01')], [...steady, 'w_04 - - - -']);
    check('and neither opened a question', !(await visible(page, '#askModal')));

    // The browser takes the gesture away in mid-air (a call, the app sent to the background).
    await show(page, seat('tv_01', 2));
    const c1 = await centre(page, chip('w_01'));
    const c2 = await centre(page, seat('tv_01', 2));
    await down(cdp, c1);
    await glide(cdp, page, c1, c2);
    given('a man is in the air over a seat', (await page.locator('.transport-ghost').count()) === 1
        && (await page.locator(`${seat('tv_01', 2)}.transport-over`).count()) === 1);
    await abandon(cdp);
    await page.waitForTimeout(80);
    same('pointercancel in mid-drag puts everything back: nobody moved', [await kept(page), await tray(page)], steady);
    check('and nothing of the drag is left on the page', (await page.locator('.transport-ghost, .transport-over, .transport-lifted').count()) === 0
        && !(await page.evaluate(() => document.getElementById('transportPanel').classList.contains('transport-dragging'))));
    await drag(cdp, page, chip('w_01'), seat('tv_01', 2));
    same('and the next drag works as if nothing had happened', await drawn(page, 'tv_01'), 'w_04 w_01 - - -');

    // ------------------------------------------------------------ a swipe is a scroll
    suite(`${where}: an ordinary swipe scrolls, and moves nobody`);
    const planBefore = [await kept(page), await tray(page)];
    await page.evaluate(() => { document.getElementById('transportBody').scrollTop = 0; });
    const swipeFrom = await centre(page, head('tv_02'));
    await down(cdp, swipeFrom);
    await glide(cdp, page, swipeFrom, { x: swipeFrom.x, y: swipeFrom.y - 220 });
    await up(cdp);
    await page.waitForTimeout(250);
    const afterBackground = await scrollTop(page);
    check('a vertical swipe that starts on a card\'s background scrolls the list', afterBackground > 100, String(afterBackground));
    same('and moves nobody', [await kept(page), await tray(page)], planBefore);
    check('the tray stayed at the top while the cars went under it', await page.evaluate(() => {
        const tray = document.getElementById('transportTray').getBoundingClientRect();
        const body = document.getElementById('transportBody').getBoundingClientRect();
        const first = document.querySelector('#transportBody [data-car="tv_01"]').getBoundingClientRect();
        return Math.abs(tray.top - body.top) < 1 && first.top < tray.bottom
            && document.elementFromPoint(tray.left + tray.width / 2, tray.top + 10).closest('#transportTray') !== null;
    }));
    // The swipe that starts ON A SEATED MAN - the commonest swipe on a filled car. Without
    // the hold this would lift him and drop him on whatever seat the finger left over.
    await page.evaluate(() => { document.getElementById('transportBody').scrollTop = 0; });
    const onMan = await centre(page, seated('w_04'));
    await down(cdp, onMan);
    await glide(cdp, page, onMan, { x: onMan.x, y: onMan.y - 220 });
    const midSwipe = await page.locator('.transport-ghost').count();
    await up(cdp);
    await page.waitForTimeout(250);
    check('a quick vertical swipe that starts on a seated man ALSO scrolls the list', (await scrollTop(page)) > 100, String(await scrollTop(page)));
    same('lifts nobody, and moves nobody', [midSwipe, await kept(page), await tray(page)], [0, ...planBefore]);
    check('and opened no question', !(await visible(page, '#askModal')));
    await page.evaluate(() => { document.getElementById('transportBody').scrollTop = 0; });
    // The tray itself, slid sideways by a level swipe on its men.
    const slideFrom = await centre(page, chip('w_05'));
    const slidBefore = await page.evaluate(() => document.getElementById('transportChips').scrollLeft);
    given('the tray holds more men than fit across', await page.evaluate(() => {
        const chips = document.getElementById('transportChips');
        return chips.scrollWidth > chips.clientWidth + 40;
    }));
    await down(cdp, slideFrom);
    await glide(cdp, page, slideFrom, { x: slideFrom.x + 160, y: slideFrom.y + 4 });
    const midSlide = await page.locator('.transport-ghost').count();
    await up(cdp);
    await page.waitForTimeout(500);
    const slidAfter = await page.evaluate(() => document.getElementById('transportChips').scrollLeft);
    check('a level swipe on the waiting men slides the tray sideways', Math.abs(slidAfter - slidBefore) > 100, `${slidBefore} -> ${slidAfter}`);
    same('lifts nobody, picks nobody, moves nobody',
        [midSlide, await page.locator('#transportChips [aria-pressed="true"]').count(), await kept(page), await tray(page)], [0, 0, ...planBefore]);
    check('the page itself did not move sideways', await page.evaluate(() => window.scrollX === 0 && document.getElementById('transportBody').scrollLeft === 0));
    await page.evaluate(() => { document.getElementById('transportChips').scrollLeft = 0; });

    // ------------------------------------------------------------ carried past the edge
    suite(`${where}: carried to the bottom edge, the list scrolls to a car that was off the screen`);
    await page.evaluate(() => { document.getElementById('transportBody').scrollTop = 0; });
    const far = seat('tv_06', 4);
    const farBefore = await page.locator(far).boundingBox();
    given('the sixth car is below the screen to begin with', farBefore.y > height, JSON.stringify(farBefore));
    const start = await centre(page, chip('w_02'));
    const edge = { x: width / 2, y: height - 14 };
    await down(cdp, start);
    await glide(cdp, page, start, edge, 16);
    let reached = false;
    for (let i = 0; i < 400 && !reached; i += 1) {
        // The finger rests at the edge; the page is what moves. A touchMove at the same
        // point keeps the gesture alive the way a real finger's jitter does.
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: at(edge.x + (i % 2), edge.y) });
        await page.waitForTimeout(16);
        const box = await page.locator(far).boundingBox();
        reached = box.y + box.height < height - 90;
    }
    const scrolledTo = await scrollTop(page);
    check('holding him near the bottom edge scrolled the list by itself', reached && scrolledTo > 300, String(scrolledTo));
    // Out of the edge's zone first, as a finger does when it sees the car arrive - the
    // list is still moving while the finger is in it.
    const calm = { x: width / 2, y: height - 130 };
    await glide(cdp, page, edge, calm, 4);
    await page.waitForTimeout(60);
    const settled = await scrollTop(page);
    await page.waitForTimeout(150);
    check('away from the edge it stops', (await scrollTop(page)) === settled);
    const landing = await centre(page, far);
    await glide(cdp, page, calm, landing, 8);
    same('the seat that scrolled under the finger is the one that is lit',
        await page.locator('#transportBody .transport-over').evaluateAll(nodes => nodes.map(node => `${node.dataset.vehicle}:${node.dataset.seat}`)), ['tv_06:4']);
    await up(cdp);
    await page.waitForTimeout(80);
    same('and he is dropped on a car that was off the screen when he was picked up', [await drawn(page, 'tv_06'), (await kept(page)).split(' | ').pop()],
        ['- - - w_02 -', 'tv_06:- w_02@4']);
    // And back up: held just under the tray, the list scrolls the other way.
    const backFrom = await centre(page, seated('w_02'));
    const trayBottom = await page.evaluate(() => document.getElementById('transportTray').getBoundingClientRect().bottom);
    const under = { x: width / 2, y: trayBottom + 12 };
    await down(cdp, backFrom);
    await lifts(page);
    await glide(cdp, page, backFrom, under, 12);
    for (let i = 0; i < 400 && (await scrollTop(page)) > 0; i += 1) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: at(under.x + (i % 2), under.y) });
        await page.waitForTimeout(16);
    }
    same('held just under the tray, the list scrolls back to its top', await scrollTop(page), 0);
    const rest = { x: width / 2, y: trayBottom + 100 };
    await glide(cdp, page, under, rest, 4);
    const home = await centre(page, seat('tv_01', 5));
    await glide(cdp, page, rest, home, 8);
    await up(cdp);
    await page.waitForTimeout(80);
    same('and he is carried from the sixth car to the first', [await drawn(page, 'tv_01'), await drawn(page, 'tv_06')], ['w_04 w_01 - - w_02', '- - - - -']);
    same('every drag above was a finger: touch-type pointer events, not one mouse, not one native drag',
        await page.evaluate(() => [window.__seen.touch > 15, window.__seen.mouse, window.__seen.native]), [true, 0, 0]);

    // ------------------------------------------------------------ a mouse
    // The evening is sometimes done at a desk. A mouse has no scroll to mistake a drag
    // for, so it lifts a seated man at once - and, unlike a finger, it ALWAYS clicks after
    // its release: that click must not open the question of the seat it was released on.
    suite(`${where}: a mouse carries a man too, and its release is not a tap`);
    const byMouse = async (fromSelector, toSelector) => {
        await show(page, toSelector, fromSelector);
        const a = await centre(page, fromSelector);
        const b = await centre(page, toSelector);
        await page.mouse.move(a.x, a.y);
        await page.mouse.down();
        await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 6 });
        await page.mouse.move(b.x, b.y, { steps: 6 });
        await page.mouse.up();
        await page.waitForTimeout(80);
    };
    const beforeMouse = [await kept(page), await tray(page)];
    await byMouse(chip('w_08'), seat('tv_02', 2));
    same('dragged by a mouse onto an empty seat, he sits there - and no question opens',
        [await drawn(page, 'tv_02'), await visible(page, '#askModal')], ['w_03 w_08 - - -', false]);
    await byMouse(seated('w_08'), seat('tv_02', 3));
    same('a seated man is lifted by a mouse at once, with no hold', [await drawn(page, 'tv_02'), await visible(page, '#askModal')], ['w_03 - w_08 - -', false]);
    await byMouse(seated('w_08'), '#transportTrayTitle');
    same('and dropped on the tray he is back where he was', [await kept(page), await tray(page), await visible(page, '#askModal')], [...beforeMouse, false]);
    await page.waitForTimeout(450);

    // ------------------------------------------------------------ taps
    suite(`${where}: without dragging - touch a man and then a seat, or touch the seat`);
    await page.locator(chip('w_05')).tap();
    same('a touched man shows as picked up', [await page.locator(chip('w_05')).getAttribute('aria-pressed'), await text(page, '#transportLive')],
        ['true', 'עלי נבחר. נוגעים במושב.']);
    same('and nothing is changed yet', await drawn(page, 'tv_01'), 'w_04 w_01 - - w_02');
    await page.locator(seat('tv_01', 3)).tap();
    same('a touch on a seat puts him there', [await drawn(page, 'tv_01'), await text(page, '#transportLive'), await page.locator('#transportChips [aria-pressed="true"]').count()],
        ['w_04 w_01 w_05 - w_02', 'עלי שובץ בטויוטה קורולה 2013', 0]);
    check('and no question was asked', !(await visible(page, '#askModal')));
    await page.locator(chip('w_06')).tap();
    await page.locator(chip('w_06')).tap();
    same('a second touch on the same man puts him down again', await page.locator('#transportChips [aria-pressed="true"]').count(), 0);
    await page.locator(chip('w_06')).tap();
    await page.keyboard.press('Escape');
    check('Escape puts him down too, and does not close the panel',
        (await page.locator('#transportChips [aria-pressed="true"]').count()) === 0 && (await visible(page, '#transportPanel.open')));
    await page.locator(chip('w_06')).tap();
    await page.locator(seated('w_05')).tap();
    same('a picked man touched onto a TAKEN seat takes it, and the other waits',
        [await drawn(page, 'tv_01'), (await tray(page)).includes('w_05')], ['w_04 w_01 w_06 - w_02', true]);

    await page.locator(seat('tv_01', 4)).tap();
    const who = await question(page);
    check('a touch on an empty seat opens the app\'s own question OVER the panel', await page.evaluate(() => {
        const button = document.querySelector('#askChoices button').getBoundingClientRect();
        return document.elementFromPoint(button.left + button.width / 2, button.top + button.height / 2).closest('#askModal') !== null;
    }));
    same('asking who sits here, and listing the men still waiting - each with his site - and a way out',
        [who.title, who.choices.slice(0, 3), who.choices.slice(-1), who.choices.length],
        ['מי יושב כאן?', ['עלי · הרצליה', 'ראמי · פרדסיה', 'דוד · נתניה'], [CANCEL], (await tray(page)).length + 1]);
    await choose(page, 'ראמי · פרדסיה');
    await page.waitForTimeout(60);
    same('the man chosen sits there', [await drawn(page, 'tv_01'), await visible(page, '#askModal')], ['w_04 w_01 w_06 w_07 w_02', false]);
    await show(page, seat('tv_03', 1));
    await page.locator(seat('tv_03', 1)).tap();
    same('the driver\'s seat asks who drives that car', (await question(page)).title, 'מי נוהג בBYD סיל U 2025?');
    await page.keyboard.press('Escape');
    check('Escape answers the question and NOT the panel behind it, and nobody is seated',
        !(await visible(page, '#askModal')) && (await visible(page, '#transportPanel.open')) && (await drawn(page, 'tv_03')) === '- - - - -');
    await page.locator(seat('tv_03', 1)).tap();
    await question(page);
    await choose(page, CANCEL);
    same('and so does «ביטול»', [await visible(page, '#askModal'), await drawn(page, 'tv_03')], [false, '- - - - -']);

    await show(page, seated('w_07'));
    await page.locator(seated('w_07')).tap();
    same('a touch on a taken seat offers one thing - out of the car', await question(page), { title: 'ראמי', choices: [OUT_OF_CAR, CANCEL] });
    await choose(page, OUT_OF_CAR);
    await page.waitForTimeout(60);
    same('and he is back in the tray', [await drawn(page, 'tv_01'), (await tray(page)).includes('w_07'), await text(page, '#transportLive')],
        ['w_04 w_01 w_06 - w_02', true, 'ראמי חזר לממתינים']);
    await floors(page, 'a car with men in it', seatFloor);

    // ------------------------------------------------------------ the door, tapped
    suite(`${where}: the driver's message - opened, and not believed once it changes`);
    const door = page.locator('a[data-wa="tv_01"]');
    same('nothing is marked yet', await page.locator('[data-car="tv_01"]').getAttribute('data-mark'), 'none');
    // The tap, with its navigation prevented HERE: what is measured is the app's own mark.
    await page.evaluate(() => document.querySelector('a[data-wa="tv_01"]')
        .addEventListener('click', event => event.preventDefault(), { capture: true }));
    await door.tap();
    await page.waitForTimeout(1750);
    same('a tap on the link marks it opened - never sent',
        [await page.locator('[data-car="tv_01"]').getAttribute('data-mark'), await text(page, '[data-car="tv_01"] .transport-mark')],
        ['opened', 'נפתח בוואטסאפ']);
    check('the link is still there to open again, and no «sent» step exists anywhere',
        (await page.locator('a[data-wa="tv_01"]').count()) === 1 && (await page.locator('#transportPanel [data-sent]').count()) === 0);
    await page.locator(chip('w_07')).tap();
    await page.locator(seat('tv_01', 4)).tap();
    same('one more man in that car is a different message: the mark is no longer believed',
        [await page.locator('[data-car="tv_01"]').getAttribute('data-mark'), await page.locator('[data-car="tv_01"] .transport-mark').count()], ['none', 0]);
    check('and the link carries the new message', decodeURIComponent((await page.locator('a[data-wa="tv_01"]').getAttribute('href')).split('text=')[1])
        .includes(`- ${named('ראמי')} – ${named('פרדסיה')}`));

    // ------------------------------------------------------------ a vehicle that stays home
    suite(`${where}: a vehicle that does not go out today`);
    await page.evaluate(() => { document.getElementById('transportBody').scrollTop = 0; });
    const waitingBefore = (await tray(page)).length;
    same('a car going out says so', [await text(page, '[data-avail="tv_01"]'), await page.locator('[data-avail="tv_01"]').getAttribute('aria-pressed')], ['זמין היום', 'true']);
    await page.locator('[data-avail="tv_01"]').tap();
    same('kept home, its card folds to one line', [await page.locator('[data-car="tv_01"] .transport-car').count(),
        await text(page, '[data-avail="tv_01"]'), await page.locator('[data-avail="tv_01"]').getAttribute('aria-pressed')], [0, 'לא זמין היום', 'false']);
    const foldedBox = await page.locator('[data-car="tv_01"]').boundingBox();
    check('a single line tall', foldedBox.height < 90, JSON.stringify(foldedBox));
    const afterFold = await tray(page);
    same('and its five men are waiting again - on the disk as well',
        [afterFold.length - waitingBefore, ['w_01', 'w_02', 'w_04', 'w_06', 'w_07'].filter(id => !afterFold.includes(id)), await kept(page)],
        [5, [], 'tv_02:w_03']);
    await page.locator('[data-avail="tv_01"]').tap();
    same('going out again, it is drawn again, empty', await drawn(page, 'tv_01'), '- - - - -');

    // ------------------------------------------------------------ not with us
    suite(`${where}: a man who does not ride with us`);
    await page.locator(chip('w_12')).evaluate(node => node.scrollIntoView({ inline: 'center', block: 'nearest' }));
    await page.locator(chip('w_12')).tap();
    await page.locator('#transportNotRiding').tap();
    same('a man touched, then the quiet control: it asks how he gets there', await question(page),
        { title: 'איך נביל מגיע', choices: ['רכב פרטי', 'נוסע עם קבלן אחר', 'אחר', CANCEL] });
    await choose(page, 'רכב פרטי');
    await page.waitForTimeout(60);
    same('he leaves the tray, and is counted on one folded line at the bottom',
        [(await tray(page)).includes('w_12'), await text(page, '#transportAway > summary'), await page.evaluate(() => document.getElementById('transportAway').open)],
        [false, 'לא בהסעה שלנו (1)', false]);
    await page.evaluate(() => { document.getElementById('transportChips').scrollLeft = 0; });
    // MOVED ON PURPOSE (v194): a person's pace. The quiet control stands under where the
    // question's answer was, and a tap there less than 300 ms after the answer is that tap
    // again (the page's rule, js/ui/sheet.js) - the driver's came 60 ms later.
    await page.waitForTimeout(350);
    await page.locator('#transportNotRiding').tap();
    const whoAway = await question(page);
    same('the control alone asks who first', [whoAway.title, whoAway.choices.includes('נביל · נתניה'), whoAway.choices[0]],
        ['מי לא נוסע בהסעה שלנו?', false, 'אחמד · הרצליה']);
    await choose(page, 'חאלד · פרדסיה');
    await page.waitForTimeout(60);
    await choose(page, 'נוסע עם קבלן אחר');
    await page.waitForTimeout(60);
    // And by carrying: a man dropped on the control.
    await drag(cdp, page, chip('w_10'), '#transportNotRiding');
    same('a man DROPPED on the control is asked about too', (await question(page)).title, 'איך מחמוד מגיע');
    await choose(page, 'אחר');
    await page.waitForTimeout(60);
    same('three men, three statuses, kept', [await text(page, '#transportAway > summary'),
        await page.evaluate(key => JSON.parse(localStorage.getItem(key)).status, DAY_KEY)],
    ['לא בהסעה שלנו (3)', { w_12: 'private', w_11: 'contractor', w_10: 'other' }]);
    await page.locator('#transportAway > summary').scrollIntoViewIfNeeded();
    await page.locator('#transportAway > summary').tap();
    same('opened, the line names each and how he gets there', (await page.locator('#transportAway [data-away]').allTextContents()).map(bare),
        ['מחמודאחרהחזרה להסעה', 'חאלדנוסע עם קבלן אחרהחזרה להסעה', 'נבילרכב פרטיהחזרה להסעה']);
    await floors(page, 'the folded line, open', seatFloor);
    await page.locator('#transportAway [data-away="w_11"] button').tap();
    same('brought back, he is waiting again, and the line stays open for the next', [(await tray(page)).includes('w_11'),
        await text(page, '#transportAway > summary'), await page.evaluate(() => document.getElementById('transportAway').open)], [true, 'לא בהסעה שלנו (2)', true]);

    // ------------------------------------------------------------ the nine-seater, full
    suite(`${where}: the nine-seater filled, and a seat with nobody left to put in it`);
    await page.evaluate(day => {
        ['w_10', 'w_12'].forEach(id => transportSetStatus(day, id, null));
        const order = ['w_01', 'w_02', 'w_04', 'w_05', 'w_06', 'w_07', 'w_08', 'w_09', 'w_10'];
        order.forEach((id, i) => transportPlace(day, id, 'tv_05', i + 1));
        transportPlace(day, 'w_11', 'tv_02', 2);
        transportPlace(day, 'w_12', 'tv_02', 3);
        renderTransportIfOpen();
    }, DAY);
    await show(page, seat('tv_05', 5));
    same('nine men, one on each seat of the nine-seater', [await drawn(page, 'tv_05'), await text(page, '[data-car="tv_05"] .transport-occupancy')],
        ['w_01 w_02 w_04 w_05 w_06 w_07 w_08 w_09 w_10', '9 מתוך 9']);
    const names = await page.evaluate(() => [...document.querySelectorAll('#transportBody .transport-seat[data-vehicle="tv_05"]')].map(tile => {
        const label = tile.querySelector('.transport-seat-name');
        const box = label.getBoundingClientRect();
        const frame = tile.getBoundingClientRect();
        return { name: label.textContent, lines: Math.round(box.height / parseFloat(getComputedStyle(label).lineHeight)),
            inside: box.left >= frame.left - 0.5 && box.right <= frame.right + 0.5 && box.width > 20,
            said: tile.getAttribute('aria-label').replace(/[⁦-⁩]/g, '').includes(label.textContent) };
    }));
    check('every name is drawn inside its seat, on one or two lines, and is whole in the seat\'s accessible name',
        names.length === 9 && names.every(one => one.inside && one.lines >= 1 && one.lines <= 2 && one.said), JSON.stringify(names.filter(one => !(one.inside && one.lines <= 2 && one.said))));
    await floors(page, 'the nine-seater, full', seatFloor);
    same('with everybody seated the tray says so, in one line, and offers no man', [await text(page, '#transportTrayTitle'),
        await page.locator('#transportChips').count(), await page.locator('#transportNotRiding').count()], [ALL_SEATED, 0, 0]);
    // NO TAP DOES NOTHING. An empty seat with nobody left to put in it answers in a sentence.
    await show(page, seat('tv_03', 2));
    await page.locator(seat('tv_03', 2)).tap();
    await page.locator('#askModal').waitFor({ state: 'visible' });
    same('an empty seat touched with nobody waiting SAYS why nothing happens', await text(page, '#askTitle'), ALL_SEATED);
    await page.locator('#askOk').tap();
    check('and that is all it does', !(await visible(page, '#askModal')) && (await drawn(page, 'tv_03')) === '- - - - -');

    // ------------------------------------------------------------ the list of vehicles
    suite(`${where}: the list of vehicles - setup, one folded row at the bottom`);
    check('«רכבים» is the last thing on the screen, and shut', await page.evaluate(() => {
        const fleet = document.getElementById('transportFleet');
        return fleet.parentNode.lastElementChild === fleet && fleet.open === false && fleet.querySelector('summary').textContent === 'רכבים';
    }));
    await page.locator('#transportFleet > summary').scrollIntoViewIfNeeded();
    await page.locator('#transportFleet > summary').tap();
    same('opened, it lists the seven with their seats', (await page.locator('#transportFleet .transport-fleet-item > .transport-row').allTextContents()).map(bare),
        VEHICLES.map((name, i) => `${name}${i === 4 ? 9 : 5} מושבים`));
    await page.locator('#transportAddVehicle').tap();
    await page.locator('#askModal').waitFor({ state: 'visible' });
    await page.locator('#askOk').click();
    check('a vehicle with no name is not added: the question stays, with the reason',
        (await visible(page, '#askModal')) && (await text(page, '#askError')) === 'צריך לכתוב שם');
    await answer(page, 'מיניבוס לבדיקה');
    await page.locator('#askInput').waitFor({ state: 'visible' });
    await page.locator('#askInput').fill('1');
    await page.locator('#askOk').click();
    same('a seat count that is not one is refused, with the reason', await text(page, '#askError'), 'מספר בין 2 ל-20');
    await answer(page, '7');
    const addedId = await page.evaluate(() => transportSettings().vehicles.slice(-1)[0].id);
    check('a vehicle is added, with an id of this feature\'s own, and the list stays open', /^tv_/.test(addedId)
        && await page.evaluate(() => document.getElementById('transportFleet').open));
    same('and is drawn at once: two in front, then rows of three', await page.evaluate(id =>
        [...document.querySelectorAll(`#transportBody [data-car="${id}"] .transport-seat-row`)].map(row => row.children.length), addedId), [2, 3, 2]);
    await show(page, seat(addedId, 7));
    await floors(page, 'a seven-seater', seatFloor);
    await page.locator(`#transportFleet [data-vehicle="${addedId}"] summary`).scrollIntoViewIfNeeded();
    await page.locator(`#transportFleet [data-vehicle="${addedId}"] summary`).tap();
    await floors(page, 'the list, with a vehicle\'s tools open', seatFloor);
    await page.locator(`#transportPanel [data-tk="rename:${addedId}"]`).tap();
    await answer(page, 'מיניבוס');
    same('it is renamed, on its card too', await text(page, `[data-car="${addedId}"] .transport-vehicle-name`), 'מיניבוס');
    await page.locator(`#transportFleet [data-vehicle="${addedId}"] summary`).tap();
    await page.locator(`#transportPanel [data-tk="retire:${addedId}"]`).tap();
    await page.locator('#askModal').waitFor({ state: 'visible' });
    same('retiring asks first, and no longer speaks of versions', await text(page, '#askMessage'), 'הרכב לא יופיע עוד בשיבוץ.');
    await answer(page);
    same('and retired: it leaves the screen', await page.locator('#transportBody [data-car]').count(), 7);

    // ------------------------------------------------------------ the summary of the day
    await summary(page, where);

    // ------------------------------------------------------------ the report of a period
    await periodReport(page, where, small);

    // ------------------------------------------------------------ the record, and the way out
    suite(`${where}: the record is untouched, and the way out`);
    same('the day record and everything queued for the cloud are byte for byte what they were',
        await recordBytes(page), before);
    same('everything it wrote is under its own three names', await page.evaluate(() =>
        Object.keys(localStorage).filter(key => /transport/i.test(key)).sort()),
    ['farkadTransport:day:2026-11-10', 'farkadTransport:enabled', 'farkadTransport:settings']);
    const planAtEnd = await kept(page);
    await page.keyboard.press('Escape');
    check('Escape closes the panel', !(await visible(page, '#transportPanel')));
    check('and the keyboard is back on the button the evening started from', await page.evaluate(selector =>
        document.activeElement === document.querySelector(selector), WA_BUTTON));
    same('nothing was asked of WhatsApp, or of anywhere else off this machine', away, []);

    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(400);
    await page.evaluate(day => { todayStr = () => day; State.date = day; render(); }, DAY);
    await page.locator(WA_BUTTON).click();
    await page.locator('#transportEntry').click();
    await page.locator('#transportPanel.open').waitFor({ state: 'visible' });
    same('after a reload it is still on, and the plan is drawn as it was left',
        [await kept(page), await drawn(page, 'tv_05'), await drawn(page, 'tv_02'), await text(page, '#transportTrayTitle')],
        [planAtEnd, 'w_01 w_02 w_04 w_05 w_06 w_07 w_08 w_09 w_10', 'w_03 w_11 w_12 - -', ALL_SEATED]);
    check('the two folded lines are shut again at every opening', await page.evaluate(() => document.getElementById('transportFleet').open === false));
    await page.locator('#transportClose').tap();
    check('the back button closes it too', !(await visible(page, '#transportPanel')));

    await page.locator('#settingsBtn').click();
    await page.locator('#transportSwitchCard > summary').click();
    await page.locator('#transportSwitch').click();
    await page.evaluate(() => closeSettings());
    same('turned off in ⋯, the entry is gone from the WhatsApp dialog', await page.locator('#transportEntry').count(), 0);
    same('and the summary cannot be opened by any road', [await page.evaluate(() => openTransportSummary()),
        await page.evaluate(() => transportSummaryText('2026-11-10')), await visible(page, '#transportSummaryModal')], [false, '', false]);
    same('nor the report', [await page.evaluate(() => openTransportReport()),
        await page.evaluate(() => transportReportText('thisWeek', '2026-11-10')), await visible(page, '#transportReportModal')], [false, '', false]);
    check('and the plans stay on the disk for when it is turned on again', await page.evaluate(() =>
        localStorage.getItem('farkadTransport:enabled') === null && localStorage.getItem('farkadTransport:day:2026-11-10') !== null));
    same('the record is still what it was', await recordBytes(page), before);

    same('no page error and no console error', errors, []);
    same('and still no request off this machine', away, []);
    await context.close();
}

// ------------------------------------------------------------------ a vehicle turned off
//
// The owner, 2026-11-10: "sometimes cars break down... like I have workers whom I turn off
// from the list and turn back on in the צוות page". The switch is the roster's, word for
// word, beside each vehicle in «רכבים». Tomorrow's plan is put on the disk by the functions
// a drag calls (it is not the day on the screen); everything done to the day on the screen
// is a finger.
const NEXT = '2026-11-11';
const PREV = '2026-11-09';
const NEXT_KEY = `farkadTransport:day:${NEXT}`;
const SETTINGS_KEY = 'farkadTransport:settings';
const SWITCH_IS_ON = 'פעיל';
const SWITCH_IS_OFF = 'כבוי';
const onoff = id => `#transportFleet [data-onoff="${id}"]`;

async function openOn(page, date) {
    if (await visible(page, '#transportPanel')) await page.locator('#transportClose').tap();
    await page.evaluate(day => { State.date = day; render(); }, date);
    await page.locator(WA_BUTTON).click();
    await page.locator('#transportEntry').click();
    await page.locator('#transportPanel.open').waitFor({ state: 'visible' });
    await page.waitForTimeout(80);
}
async function openFleet(page) {
    if (await page.evaluate(() => document.getElementById('transportFleet').open)) return;
    await page.locator('#transportFleet > summary').scrollIntoViewIfNeeded();
    await page.locator('#transportFleet > summary').tap();
}
async function summaryWords(page) {
    await page.evaluate(() => { document.getElementById('transportBody').scrollTop = 0; });
    await page.locator('#transportSummaryOpen').tap();
    await page.locator('#transportSummaryModal').waitFor({ state: 'visible' });
    const words = await page.locator('#transportSummaryText').inputValue();
    await page.locator('#transportSummaryClose').tap();
    return words;
}
async function reportWords(page) {
    await page.locator('#transportReportOpen').scrollIntoViewIfNeeded();
    await page.locator('#transportReportOpen').tap();
    await page.locator('#transportReportModal').waitFor({ state: 'visible' });
    const words = await page.locator('#transportReportText').inputValue();
    await page.locator('#transportReportClose').tap();
    return words;
}

async function vehicleOff(width, height, scheme) {
    const where = `${width}x${height} ${scheme}`;
    const seatFloor = width <= 375 ? 56 : 44;
    const { page, context, cdp, errors, away } = await open(width, height, scheme);
    const others = ALL.filter(id => id !== 'w_03' && id !== 'w_04');

    suite(`${where}: a vehicle turned off - men in it tonight and in tomorrow's plan`);
    await page.evaluate(([ids, places, next]) => {
        ids.forEach((id, i) => assignPlace(State.schedule, next, id, 'actual', places[i % places.length].id));
        State.save();
        transportSetEnabled(true);
        transportPlace(next, 'w_05', 'tv_02', 1);
        transportPlace(next, 'w_06', 'tv_02', 3);
        transportPlace(next, 'w_07', 'tv_01', 1);
    }, [ALL, PLACES, NEXT]);
    const before = await recordBytes(page);
    await page.evaluate(() => {
        window.__pointers = { touch: 0, mouse: 0 };
        // On the panel: the way in to it is the day screen's own buttons, which are not this suite's.
        document.getElementById('transportPanel').addEventListener('pointerdown', event => {
            window.__pointers[event.pointerType] = (window.__pointers[event.pointerType] || 0) + 1;
        }, true);
    });
    await openOn(page, DAY);
    // BY A FINGER: two men into קורולה 2016, one into קורולה 2013.
    await drag(cdp, page, chip('w_01'), seat('tv_02', 1));
    await drag(cdp, page, chip('w_02'), seat('tv_02', 4));
    await drag(cdp, page, chip('w_03'), seat('tv_01', 1));
    // THE FINGER COMES TO REST BEFORE THE NEXT TAP. `drag` lifts the finger while it is
    // still moving, and this Chromium takes that for a fling: the next touch is then the
    // touch that stops the fling, and is NOT turned into a click (measured here - the
    // touchstart and touchend arrive, the click does not; with a rest before the lift it
    // does). So one more man is carried and put DOWN before he is let go. Whether a real
    // phone eats a tap that follows a flicked release is not known from this machine.
    {
        await show(page, seat('tv_01', 2), chip('w_04'));
        const from = await centre(page, chip('w_04'));
        const to = await centre(page, seat('tv_01', 2));
        await down(cdp, from);
        await glide(cdp, page, from, to);
        await page.waitForTimeout(250);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: at(to.x, to.y) });
        await page.waitForTimeout(100);
        await up(cdp);
        await page.waitForTimeout(80);
    }
    given('the evening is staged by real touches: two men in the car that will be turned off, two in another',
        (await drawn(page, 'tv_02')) === 'w_01 - - w_02 -' && (await drawn(page, 'tv_01')) === 'w_03 w_04 - - -'
        && await page.evaluate(() => window.__pointers.touch >= 4 && window.__pointers.mouse === 0),
        `${await drawn(page, 'tv_02')} | ${await drawn(page, 'tv_01')}`);
    const dayBytes = () => page.evaluate(keys => keys.map(key => localStorage.getItem(key)), [DAY_KEY, NEXT_KEY]);
    const days = await dayBytes();
    given('both days are on the disk, each with men in that car, and the list has not been written yet',
        days.every(raw => raw && /"tv_02"/.test(raw)) && await page.evaluate(key => localStorage.getItem(key) === null, SETTINGS_KEY));

    await openFleet(page);
    same('every vehicle in «רכבים» has its switch beside its name, and it says «פעיל»',
        (await page.locator('#transportFleet .transport-onoff').allTextContents()).map(bare), VEHICLES.map(() => SWITCH_IS_ON));
    same('it is a switch to a screen reader, on, said with the roster\'s own words for a worker',
        await page.evaluate(selector => { const node = document.querySelector(selector); return [node.getAttribute('role'), node.getAttribute('aria-checked'), node.getAttribute('aria-label')]; }, onoff('tv_02')),
        ['switch', 'true', `הסתר זמנית את ${car('טויוטה קורולה 2016')}`]);
    same('the rows of the list still read as they did: the name and the seats', (await page.locator('#transportFleet .transport-fleet-item > .transport-row').allTextContents()).map(bare),
        VEHICLES.map((name, i) => `${name}${i === 4 ? 9 : 5} מושבים`));
    await floors(page, 'the list of vehicles, each with its switch', seatFloor);

    // ONE TAP.
    await page.locator(onoff('tv_02')).scrollIntoViewIfNeeded();
    await page.locator(onoff('tv_02')).tap();
    await page.locator('#askModal').waitFor({ state: 'visible' });
    same('HE IS TOLD, in the app\'s own dialog: which vehicle, and how many men went back to wait',
        [await text(page, '#askTitle'), await text(page, '#askMessage')],
        ['הרכב כבוי: טויוטה קורולה 2016', '2 עובדים שישבו בו חזרו לממתינים.']);
    check('it only says: there is one button on it, and nothing to decide', !(await visible(page, '#askCancel')));
    await page.locator('#askOk').tap();
    await page.waitForTimeout(120);
    same('the car is not among the day\'s cars any more: six are drawn', [await page.locator('#transportBody [data-car]').count(),
        await page.locator('#transportBody [data-car="tv_02"]').count()], [6, 0]);
    same('and its two men are back in the tray, with everybody who was waiting', await tray(page), others);
    same('the other car is as it was', await drawn(page, 'tv_01'), 'w_03 w_04 - - -');
    same('NO DAY WAS REWRITTEN: tonight\'s plan and tomorrow\'s are byte for byte what they were', await dayBytes(), days);
    same('what was written is the list: that vehicle, off from the day on the screen',
        await page.evaluate(key => JSON.parse(localStorage.getItem(key)).vehicles.map(v => ('off' in v ? v.off : 'on')), SETTINGS_KEY),
        ['on', DAY, 'on', 'on', 'on', 'on', 'on']);

    same('IN THE LIST it has left the six and stands in a group of its own, under everything else, saying since when', [
        await page.locator('#transportFleet > .transport-fleet-item').count(),
        await text(page, '#transportFleetOff > h4'),
        await text(page, '#transportFleetOff [data-vehicle="tv_02"] > .transport-row'),
        await text(page, '#transportFleetOff .transport-off-from'),
        await page.evaluate(() => { const fleet = document.getElementById('transportFleet'); return fleet.lastElementChild.id === 'transportFleetOff' && fleet.open; })],
    [6, 'רכבים כבויים (1)', 'טויוטה קורולה 20165 מושבים', 'כבוי החל מ-10/11/2026', true]);
    same('its switch says «כבוי», is off to a screen reader, and offers to turn it on - in the roster\'s words',
        await page.evaluate(selector => { const node = document.querySelector(selector); return [node.textContent, node.getAttribute('aria-checked'), node.getAttribute('aria-label')]; }, onoff('tv_02')),
        [SWITCH_IS_OFF, 'false', `הפעל את ${car('טויוטה קורולה 2016')}`]);
    check('the keyboard is on that switch, where it now stands', await page.evaluate(() =>
        Boolean(document.activeElement && document.activeElement.dataset.tk === 'onoff:tv_02')));
    await floors(page, 'the list with a vehicle off', seatFloor);
    same('nothing runs off the side of the off group', await page.evaluate(() => {
        const group = document.getElementById('transportFleetOff').getBoundingClientRect();
        return group.left >= 0 && group.right <= window.innerWidth;
    }), true);
    if (SHOTS && width === 440 && scheme === 'dark') {
        await page.locator('#transportFleetOff').scrollIntoViewIfNeeded();
        await page.waitForTimeout(100);
        await shot(page, 'vehicle-off-list-440-dark');
        await page.evaluate(() => { document.getElementById('transportBody').scrollTop = 0; });
        await page.waitForTimeout(100);
        await shot(page, 'vehicle-off-cars-440-dark');
    }

    // The summary of the day and the report of a period: the words in the field.
    const told = await summaryWords(page);
    check('the summary of the day does not name it at all - it is not a car today, not empty, and not «kept home today»',
        !told.includes('קורולה 2016') && !told.split('\n').some(line => line.startsWith('רכבים שלא זמינים היום')));
    check('and counts its men among the waiting', told.includes('ממתינים לשיבוץ (10):')
        && told.includes(`- ${named('אחמד')} – ${named('הרצליה')}`) && told.includes(`- ${named('מוחמד')} – ${named('חיפה')}`), told);
    check('no driver is offered a message for it', (await page.locator('#transportBody [data-wa="tv_02"]').count()) === 0);
    const period = await reportWords(page);
    check('the report of this week does not count it on either day: both are from the day it is off from',
        !period.includes('קורולה 2016') && period.includes(`רכב: ${car('טויוטה קורולה 2013')} – יצא ב-2 ימים`), period);
    same('and reading those two changed no day', await dayBytes(), days);

    // A reload.
    suite(`${where}: a vehicle turned off - after a reload, tomorrow, the day before, and on again`);
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(400);
    await page.evaluate(day => { todayStr = () => day; }, DAY);
    await openOn(page, DAY);
    same('after a reload it is still off: six cars, its men waiting', [await page.locator('#transportBody [data-car]').count(),
        await page.locator('#transportBody [data-car="tv_02"]').count(), await tray(page)], [6, 0, others]);

    // Tomorrow's plan, which had men in it.
    await openOn(page, NEXT);
    same('TOMORROW: the car is not drawn, and the two men its plan seats are waiting', [
        await page.locator('#transportBody [data-car="tv_02"]').count(), await drawn(page, 'tv_01'),
        (await tray(page)).filter(id => id === 'w_05' || id === 'w_06')], [0, 'w_07 - - - -', ['w_05', 'w_06']]);
    same('and opening tomorrow rewrote neither day', await dayBytes(), days);

    // The day before the day it is off from: history.
    await openOn(page, PREV);
    same('THE DAY BEFORE it was turned off still draws it, with the other six', [await page.locator('#transportBody [data-car]').count(),
        await page.locator('#transportBody [data-car="tv_02"]').count()], [7, 1]);
    await openFleet(page);
    same('while the list, on that day too, says it is off and since when',
        [await text(page, onoff('tv_02')), await text(page, '#transportFleetOff .transport-off-from')], [SWITCH_IS_OFF, 'כבוי החל מ-10/11/2026']);

    // ON AGAIN, from tomorrow's screen: one tap, and nothing is asked or said.
    await openOn(page, NEXT);
    await openFleet(page);
    await page.locator(onoff('tv_02')).scrollIntoViewIfNeeded();
    await page.locator(onoff('tv_02')).tap();
    await page.waitForTimeout(150);
    check('one tap turns it on again, with no question', !(await visible(page, '#askModal'))
        && (await text(page, onoff('tv_02'))) === SWITCH_IS_ON && (await page.locator('#transportFleetOff').count()) === 0);
    same('the list on the disk has no trace of the switch', await page.evaluate(key => /"off"/.test(localStorage.getItem(key)), SETTINGS_KEY), false);
    same('tomorrow\'s men are in their seats again', [await drawn(page, 'tv_02'),
        (await tray(page)).filter(id => id === 'w_05' || id === 'w_06')], ['w_05 - w_06 - -', []]);
    await openOn(page, DAY);
    same('and so are tonight\'s - the driver at the wheel, the other behind him', [await drawn(page, 'tv_02'), await tray(page)],
        ['w_01 - - w_02 -', others.filter(id => id !== 'w_01' && id !== 'w_02')]);
    same('THE ROUND TRIP: both days are byte for byte what they were before it was ever turned off', await dayBytes(), days);
    const toldAgain = await summaryWords(page);
    check('the summary has the car back, with its driver and its man',
        toldAgain.includes(`רכב: ${car('טויוטה קורולה 2016')} – 2 מתוך 5`) && toldAgain.includes(`נהג: ${named('אחמד')} – ${named('הרצליה')}`), toldAgain);
    const periodAgain = await reportWords(page);
    check('and the report counts it on both days', periodAgain.includes(`רכב: ${car('טויוטה קורולה 2016')} – יצא ב-2 ימים`), periodAgain);

    // A vehicle with nobody in it: off in one tap and nothing to tell.
    await openFleet(page);
    await page.locator(onoff('tv_06')).scrollIntoViewIfNeeded();
    await page.locator(onoff('tv_06')).tap();
    await page.waitForTimeout(150);
    check('a vehicle with nobody in it is turned off by one tap and nothing is said', !(await visible(page, '#askModal'))
        && (await page.locator('#transportBody [data-car="tv_06"]').count()) === 0 && (await text(page, onoff('tv_06'))) === SWITCH_IS_OFF);
    // «זמין היום» is what it was for a vehicle that is on.
    await page.locator('#transportBody [data-avail="tv_07"]').scrollIntoViewIfNeeded();
    await page.locator('#transportBody [data-avail="tv_07"]').tap();
    same('«לא זמין היום» still folds a vehicle that is on, for that day, and the summary\'s line is that vehicle alone',
        [await text(page, '#transportBody [data-avail="tv_07"]'),
            (await summaryWords(page)).split('\n').filter(line => line.startsWith('רכבים שלא זמינים היום'))],
        ['לא זמין היום', [`רכבים שלא זמינים היום: ${car('ליפמוטור C10 2026')}`]]);
    // Every one of them off: the screen says so, and where they are turned on.
    await page.evaluate(day => { transportSettings().vehicles.forEach(v => transportSetVehicleOff(v.id, day)); renderTransport(); }, DAY);
    same('with every vehicle off the screen says so, in the roster\'s sentence, on the day and in the list',
        (await page.locator('#transportBody .empty-hint').allTextContents()).map(bare),
        ['כל הרכבים כבויים כרגע. אפשר להפעיל אותם בכפתור ליד השם.', 'כל הרכבים כבויים כרגע. אפשר להפעיל אותם בכפתור ליד השם.']);

    suite(`${where}: a vehicle turned off - the record, and what was written`);
    same('the day record and everything queued for the cloud are byte for byte what they were', await recordBytes(page), before);
    same('everything written is under this feature\'s own names: the switch, the list and the two days',
        await page.evaluate(() => Object.keys(localStorage).filter(key => /transport/i.test(key)).sort()),
        ['farkadTransport:day:2026-11-10', 'farkadTransport:day:2026-11-11', 'farkadTransport:enabled', 'farkadTransport:settings']);
    same('no page error and no console error', errors, []);
    same('and no request off this machine', away, []);
    await context.close();
}

// The pictures, when asked for: an evening half done, put there by the functions the drags
// call (the drags themselves are measured above; this only poses for the camera). Three
// vehicles kept home so that a five-seater and the nine-seater are on one screen.
async function pictures() {
    for (const [width, height, scheme, name, full] of [[440, 956, 'dark', 'main-440-dark', false], [440, 956, 'light', 'main-440-light', false],
        [375, 667, 'dark', 'small-375-dark', false], [375, 667, 'dark', 'nine-375-dark', true]]) {
        const { page, context } = await open(width, height, scheme);
        await page.evaluate(([day, fill]) => {
            transportSetEnabled(true);
            ['tv_02', 'tv_03', 'tv_04'].forEach(id => transportSetAvailable(day, id, false));
            [['w_01', 'tv_01', 1], ['w_02', 'tv_01', 2], ['w_05', 'tv_01', 4], ['w_04', 'tv_05', 1], ['w_06', 'tv_05', 2], ['w_09', 'tv_05', 5]]
                .forEach(([id, vehicle, n]) => transportPlace(day, id, vehicle, n));
            if (fill) {
                ['w_03', 'w_07', 'w_08', 'w_10', 'w_11', 'w_12'].forEach((id, i) => transportPlace(day, id, 'tv_05', [3, 4, 6, 7, 8, 9][i]));
            }
            openTransport(day);
        }, [DAY, full]);
        await page.waitForTimeout(150);
        if (full) await show(page, seat('tv_05', 5));
        await shot(page, name);
        // The summary's dialog and its picture, once: over the first of these screens.
        if (name === 'main-440-dark') {
            await page.locator('#transportSummaryOpen').tap();
            await page.locator('#transportSummaryModal').waitFor({ state: 'visible' });
            await page.waitForTimeout(400);     // the dialog's 220ms way in
            await shot(page, 'summary-440-dark');
            const png = await page.evaluate(async () => {
                const out = printoutImage('transport');
                return new Promise(done => { const reader = new FileReader(); reader.onload = () => done(reader.result.split(',')[1]); reader.readAsDataURL(out.blob); });
            });
            writeFileSync(join(SHOTS, 'summary-picture.png'), Buffer.from(png, 'base64'));
            await page.locator('#transportSummaryClose').tap();
        }
        // The report of a period, over a week this file stages: on the big dark phone, and
        // once on the small light one.
        if (name === 'main-440-dark' || name === 'main-440-light') {
            const dark = name === 'main-440-dark';
            await page.evaluate(staged => {
                Object.keys(staged).forEach(date => localStorage.setItem(`farkadTransport:day:${date}`, JSON.stringify(staged[date])));
            }, STAGED);
            await page.locator('#transportReportOpen').tap();
            await page.locator('#transportReportModal').waitFor({ state: 'visible' });
            await page.waitForTimeout(400);
            if (dark) {
                await shot(page, 'report-440-dark');
                const png = await page.evaluate(async () => {
                    const out = printoutImage('transport');
                    return new Promise(done => { const reader = new FileReader(); reader.onload = () => done(reader.result.split(',')[1]); reader.readAsDataURL(out.blob); });
                });
                writeFileSync(join(SHOTS, 'report-picture.png'), Buffer.from(png, 'base64'));
                await page.locator('#transportReportRanges button[data-range="lastMonth"]').tap();
                await page.waitForTimeout(100);
                await shot(page, 'report-month-440-dark');
            } else {
                await page.setViewportSize({ width: 375, height: 667 });
                await page.waitForTimeout(200);
                await shot(page, 'report-375-light');
            }
        }
        await context.close();
    }
}

for (const [width, height] of [[440, 956], [375, 667]]) {
    for (const scheme of ['dark', 'light']) await evening(width, height, scheme);
}
for (const [width, height] of [[440, 956], [375, 667]]) {
    for (const scheme of ['dark', 'light']) await vehicleOff(width, height, scheme);
}
if (SHOTS) await pictures();

await browser.close();
await server.close();
report();
