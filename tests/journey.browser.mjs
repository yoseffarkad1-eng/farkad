// בניית סידור - the seder's journey - in a real Chromium, on a phone with a touch screen.
//
//   node tests/journey.browser.mjs
//
// What the journey READS, and the one preference it keeps, are measured in
// tests/journey.test.mjs. This is the part only a page can answer - the journey walked
// end to end by a finger, at 440x956 and 375x667, dark and light:
//
//   - the way in: one row in the WhatsApp dialog, after the seder's and הסעות's, and
//     (second pass) ONE button at the foot of the day's list, above «בדיקת היום», that
//     names the day it opens on - or, with a journey he left, where he is in it; the
//     header, the dock and the rows above it where they were;
//   - second pass, the rest: at station 1 the dock is two lines with «מהיום הקודם»
//     between «יציאה» and the way onward, and «שליחה לוואטסאפ» put away; the rides' bar
//     silent when nothing is left; a driver whose message was opened named again among
//     the workers at station 5; the rides' summary read in its own dialog before it leaves;
//   - station 1 is the day screen itself, on TOMORROW: the journey's row rides in the
//     day's own dock, js/ui/bars.js measures the dock with it, a man placed by the day's
//     own picker moves the counter, and the day's own arrows move the journey's date;
//   - station 2: the journey's own check, and js/ui/daycheck.js's when it is there (stood
//     in for here, including one that throws); findings never block;
//   - station 3: the הסעות screen with the journey's bar inside it; men seated by REAL
//     touch drags (Input.dispatchTouchEvent), the bar following the picture; the screen's
//     own «חזרה» is one station back;
//   - station 4: the last look says what was built - the day's message and the rides'
//     summary by their own builders, and the cars as they were DRAWN at station 3;
//   - station 5: nothing preselected; a door per driver that goes to wa.me with his
//     number and his message (answered by a route here - WhatsApp is never reached); the
//     seder's list and the day's message opening OVER the panel; the summary through
//     recorders; finishing with nothing more sent;
//   - a reload at every station, back at that station for that date; a journey left on
//     purpose not coming back by itself;
//   - a phone with הסעות off: the station skipped with its one sentence, and never
//     turned on;
//   - a man taken off his site after he was seated: counted on the bar, marked on his
//     card, named in the last look, the strip saying something is left;
//   - tomorrow across midnight, across both of Israel's clock changes, and past an empty
//     Saturday - on a real clock in Asia/Jerusalem, not a stood-in todayStr;
//   - the floors on every station: 44px both ways, no field under 16px, nothing off the
//     side, the way onward on the glass and under nothing - and again at 200% text.
//
// The clock is Playwright's, installed before the app loads and left running: the app
// reads its own todayStr() off it, so a reload boots on the same evening.
//
// JOURNEY_SHOTS=<directory> also writes a JPEG of each station (440x956, dark). Synthetic
// names only - they are this file's own fixture. NOT a real phone.

import { chromium } from 'playwright';
import { join } from 'node:path';
import { serve } from './serve.mjs';
import { launchLocalBrowser } from './network-guard.mjs';
import { verifyServedAssets, expectedShaFor } from './treecheck.mjs';
import { suite, check, same, given, report } from './runner.mjs';
import { censusOnly } from './census.mjs';

const root = new URL('..', import.meta.url).pathname;
const server = await serve(root);
const served = await verifyServedAssets(server.url, root, expectedShaFor(root));
check('the origin served this commit, byte for byte', served.ok,
    `${served.checked} assets; ${(served.wrong || []).slice(0, 3).join(' | ')}`);
const browser = await launchLocalBrowser(chromium, { executablePath: process.env.CHROME_PATH });
const SHOTS = process.env.JOURNEY_SHOTS || '';

const EVENING = '2026-11-10T19:30:00+02:00';    // a Tuesday evening in Israel
const TODAY = '2026-11-10';
const DAY = '2026-11-11';                       // the Wednesday he builds for
const AFTER = '2026-11-12';
const KEY = 'farkadSederJourney';
const RIDES = `farkadTransport:day:${DAY}`;
const FSI = '⁨';
const RLI = '⁧';
const PDI = '⁩';
const named = name => `${FSI}${name}${PDI}`;
const car = name => `${RLI}${name}${PDI}`;
const bare = text => String(text || '').replace(/[⁦-⁩‎‏]/g, '');

// The pinned words this file reads off the glass (pinned word for word in
// tests/journey.test.mjs, tests/transport.test.mjs and tests/seder.test.mjs).
const ENTRY = 'בניית סידור';
const STATIONS = ['שיבוץ לאתרים', 'בדיקה', 'הסעות', 'מבט אחרון', 'שליחה'];
const RIDE_OFF = 'הסעות כבויות במכשיר הזה, ולכן השלב הזה מדולג. מפעילים אותן בהגדרות ← כללי ← הסעות.';
const ALL_SEATED = 'כל העובדים משובצים';
const OPENED = 'נפתח בוואטסאפ';

// SYNTHETIC. Invented men and invented numbers. For DAY: eight with a site on three sites,
// one marked נעדר, four with nothing yet; נתניה with nobody. יוסי has no phone.
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
const siteOf = i => PLACES[i % 3];

async function open(width, height, scheme, options = {}) {
    const context = await browser.newContext({ viewport: { width, height }, colorScheme: scheme, hasTouch: true,
        isMobile: true, timezoneId: 'Asia/Jerusalem', locale: 'he-IL' });
    const page = await context.newPage();
    const errors = [];
    const away = [];
    const asked = [];
    page.on('pageerror', error => errors.push(error.message));
    const sdk = url => /^https:\/\/www\.gstatic\.com\/firebasejs\//.test(url);
    page.on('console', message => {
        if (message.type() !== 'error') return;
        const said = message.text();
        if (/ERR_BLOCKED_BY_CLIENT/.test(said) || /^Sync error: .*firebase-adapter\.js/.test(said)) return;
        errors.push(`console: ${said}`);
    });
    // WhatsApp, answered here and nowhere else: fulfilling the route sends nothing anywhere.
    await context.route('https://wa.me/**', route => {
        asked.push(route.request().url());
        return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>wa</title>' });
    });
    context.on('request', request => {
        const host = new URL(request.url()).hostname;
        if (!['127.0.0.1', 'localhost', '[::1]', '', 'wa.me'].includes(host) && !sdk(request.url())) away.push(request.url());
    });
    await page.clock.install({ time: new Date(options.at || EVENING) });
    await page.goto(`${server.url}/index.html`, { waitUntil: 'load' });
    await page.waitForTimeout(350);
    await page.evaluate(([workers, places, day, rides, seed, before]) => {
        State.schedule.workers = workers;
        State.schedule.places = places;
        if (seed) {
            workers.slice(0, 8).forEach((worker, i) => assignPlace(State.schedule, day, worker.id, 'actual', places[i % 3].id));
            markAbsent(State.schedule, day, workers[12].id, 'actual');
        }
        (before || []).forEach(([date, worker, place]) => assignPlace(State.schedule, date, worker, 'actual', place));
        State.save();
        State.date = todayStr();
        showView('day');
        render();
        if (rides) transportSetEnabled(true);
    }, [WORKERS, PLACES, DAY, options.rides !== false, options.seed !== false, options.before || []]);
    await page.waitForTimeout(200);
    const cdp = await context.newCDPSession(page);
    return { page, context, cdp, errors, away, asked };
}

const WA_BUTTON = 'button[onclick="showDayMessage()"]';
// The journey's row in the day's dock. Since the second pass #journeyDock itself has no
// box of its own (display: contents - css/design.css says why), so "is the row on the
// glass" is asked of its first line.
const DOCK_ROW = '#journeyDock .journey-dock-top';
const DAY_ENTRY = 'בניית סידור ליום רביעי 11/11/2026';
const visible = async (page, selector) => page.locator(selector).first().isVisible().catch(() => false);
const text = async (page, selector) => bare(await page.locator(selector).first().textContent());
const station = page => page.evaluate(() => journeyStation());
const keptOf = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY);
const strip = (page, host) => page.evaluate(sel => [...document.querySelectorAll(`${sel} .journey-pip`)]
    .map(node => node.dataset.state), host);
const seat = (vehicle, n) => `#transportBody .transport-seat[data-vehicle="${vehicle}"][data-seat="${n}"]`;
const chip = id => `#transportChips .transport-chip[data-worker="${id}"]`;
const drawn = (page, vehicle) => page.evaluate(id => [...document.querySelectorAll(`#transportBody .transport-seat[data-vehicle="${id}"]`)]
    .sort((a, b) => Number(a.dataset.seat) - Number(b.dataset.seat)).map(tile => tile.dataset.worker || '-').join(' '), vehicle);

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
// Every key on the disk but the journey's own.
// And without the service worker's census of open builds (tests/census.mjs says why).
const diskBut = (page, ...skip) => page.evaluate(keys => JSON.stringify(Object.keys(localStorage).sort()
    .filter(key => !keys.includes(key) && key !== 'farkad:openBuilds').map(key => [key, localStorage.getItem(key)])), skip);

async function start(page) {
    await page.locator(WA_BUTTON).tap();
    await page.locator('#journeyEntry').tap();
    await page.waitForTimeout(150);
}
// Brought onto the glass the way a person brings it - the list scrolled until the thing is
// in the middle - and then tapped. Left to itself Playwright scrolls a thing to an EDGE,
// which on the day screen is under the sticky header or the dock, and the header folding
// as the page moves (js/ui/day.js) shifts everything under its second try.
async function tapOnDay(page, locator) {
    await locator.evaluate(node => node.scrollIntoView({ block: 'center' }));
    await page.waitForTimeout(250);
    await locator.tap();
}
// Onward by the one filled button, a tap at a time, until the station is reached.
async function walkTo(page, target) {
    for (let guard = 0; guard < 6 && await station(page) < target; guard += 1) {
        await page.locator('#journeyNext').tap();
        await page.waitForTimeout(150);
    }
}

// ------------------------------------------------------------------ a finger

const at = (x, y) => [{ x: Math.round(x), y: Math.round(y), id: 1 }];
const centre = async (page, selector) => {
    const box = await page.locator(selector).first().boundingBox();
    if (!box) throw new Error(`nothing on the glass at ${selector}`);
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};
// One whole drag of a waiting man onto a seat: a real touch sequence, Chromium's own
// gesture detection deciding what it was.
async function drag(cdp, page, fromSelector, toSelector) {
    const from = await centre(page, fromSelector);
    const to = await centre(page, toSelector);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(from.x, from.y) });
    for (let i = 1; i <= 12; i += 1) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove',
            touchPoints: at(from.x + (to.x - from.x) * i / 12, from.y + (to.y - from.y) * i / 12) });
        await page.waitForTimeout(16);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(120);
}

// The tap that opens WhatsApp, and the address it asked for (tests/seder.browser.mjs says
// why the address is waited for).
async function tapToWhatsApp(page, context, locator) {
    const [popup] = await Promise.all([context.waitForEvent('page'), locator.tap()]);
    await popup.waitForLoadState('domcontentloaded').catch(() => {});
    await popup.waitForURL(address => !['', 'about:blank'].includes(address.href), { timeout: 5000 }).catch(() => {});
    const url = popup.url();
    await popup.close();
    await page.bringToFront();
    await page.waitForTimeout(1800);
    return url;
}

// THE FLOORS, on whatever of the journey is showing: everything a finger lands on 44px
// both ways, no field under 16px, nothing off the side, no sideways scroll, exactly one
// filled button and that one the way onward, on the glass and under nothing.
async function floors(page, label) {
    const found = await page.evaluate(() => {
        // The dock WITH the journey's row in it is the journey's at station 1: the row's
        // children and the day's own copy button are one line of it.
        const roots = [document.getElementById('journeyDock') ? '.day-actions' : null, '#journeyRide', '#journeyPanel']
            .filter(Boolean).map(sel => document.querySelector(sel)).filter(Boolean)
            .filter(node => { const box = node.getBoundingClientRect(); return box.width > 0 && box.height > 0; });
        const seen = node => {
            const box = node.getBoundingClientRect();
            const style = getComputedStyle(node);
            return box.width > 0 && box.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
        };
        const name = node => String(node.id || node.dataset.jk || node.textContent).slice(0, 24);
        const targets = roots.flatMap(node => [...node.querySelectorAll('button, a[href], select, summary, input, textarea')]).filter(seen);
        const small = targets.map(node => ({ node, box: node.getBoundingClientRect() }))
            .filter(({ box }) => box.width < 43.5 || box.height < 43.5)
            .map(({ node, box }) => `${name(node)} ${Math.round(box.width)}x${Math.round(box.height)}`);
        const fields = roots.flatMap(node => [...node.querySelectorAll('select, input, textarea')]).filter(seen)
            .filter(node => parseFloat(getComputedStyle(node).fontSize) < 16).map(name);
        const texts = roots.flatMap(node => [...node.querySelectorAll('p, span, strong, h2, h3, h4, li, a, button')]).filter(seen)
            .filter(node => [...node.childNodes].some(child => child.nodeType === 3 && child.textContent.trim()))
            .filter(node => parseFloat(getComputedStyle(node).fontSize) < 14).map(name);
        const outside = roots.flatMap(node => [node, ...node.querySelectorAll('*')]).filter(seen).filter(node => {
            const box = node.getBoundingClientRect();
            return box.left < -0.5 || box.right > window.innerWidth + 0.5;
        }).map(name);
        const probe = document.createElement('span');
        probe.style.cssText = 'position:absolute;background:var(--accent)';
        document.body.appendChild(probe);
        const accent = getComputedStyle(probe).backgroundColor;
        probe.remove();
        const filled = targets.filter(node => getComputedStyle(node).backgroundColor === accent).map(node => node.id);
        const next = document.getElementById('journeyNext');
        const box = next ? next.getBoundingClientRect() : null;
        const top = box ? document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2) : null;
        const panelBody = document.getElementById('journeyBody');
        return { count: targets.length, small, fields, texts, outside, filled,
            nexts: document.querySelectorAll('#journeyNext').length,
            nextOnGlass: Boolean(box) && box.top >= 0 && box.bottom <= window.innerHeight + 0.5,
            nextOnTop: Boolean(top) && (top === next || next.contains(top)),
            bodyFits: !panelBody || panelBody.scrollWidth <= panelBody.clientWidth + 1,
            pageFits: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1 };
    });
    given(`${label}: there is something of the journey on the glass to measure`, found.count > 0);
    check(`${label}: nothing a finger lands on is under 44px, either way`, found.small.length === 0, found.small.join(' | '));
    check(`${label}: no field is under 16px and no text under 14`, found.fields.length === 0 && found.texts.length === 0,
        JSON.stringify({ fields: found.fields, texts: found.texts }));
    check(`${label}: the page does not scroll sideways and nothing runs off the side`,
        found.bodyFits && found.pageFits && found.outside.length === 0,
        JSON.stringify({ body: found.bodyFits, page: found.pageFits, outside: found.outside.slice(0, 4) }));
    same(`${label}: one filled button - the way onward - and one of it on the page`, [found.filled, found.nexts], [['journeyNext'], 1]);
    check(`${label}: the way onward is on the glass and under nothing`, found.nextOnGlass && found.nextOnTop,
        JSON.stringify({ glass: found.nextOnGlass, top: found.nextOnTop }));
    return found;
}

// The same floors for one of the app's dialogs opened over a station.
async function floorsOf(page, selector, label) {
    const found = await page.evaluate(sel => {
        const root = document.querySelector(sel);
        const seen = node => { const box = node.getBoundingClientRect(); return box.width > 0 && box.height > 0; };
        const targets = [...root.querySelectorAll('button, a[href]')].filter(seen);
        return { count: targets.length,
            small: targets.map(node => node.getBoundingClientRect()).filter(box => box.width < 43.5 || box.height < 43.5).length,
            fields: [...root.querySelectorAll('textarea, input')].filter(seen).filter(node => parseFloat(getComputedStyle(node).fontSize) < 16).length,
            outside: [...root.querySelectorAll('.modal-content, .modal-content *')].filter(seen)
                .filter(node => { const box = node.getBoundingClientRect(); return box.left < -0.5 || box.right > window.innerWidth + 0.5; }).length,
            page: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1 };
    }, selector);
    same(`${label}: 44px targets, 16px field, nothing off the side`,
        [found.count > 0, found.small, found.fields, found.outside, found.page], [true, 0, 0, 0, true]);
}

// tests/mobile.test.mjs says why the cascade is doubled rather than each node.
const doubleEveryFontSize = page => page.evaluate(() => {
    const out = [];
    const walk = (rules, wrap) => {
        for (const rule of rules) {
            if (rule.type === 4 || rule.type === 12) {
                const head = rule.type === 4 ? `@media ${rule.media.mediaText}` : `@supports ${rule.conditionText}`;
                walk(rule.cssRules, said => wrap(`${head}{${said}}`));
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
        if (rules) walk(rules, said => out.push(said));
    }
    out.unshift('html{font-size:32px !important;}');
    const style = document.createElement('style');
    style.textContent = out.join('\n');
    document.head.appendChild(style);
    return out.length;
});

const shot = async (page, name) => {
    if (!SHOTS) return;
    await page.waitForTimeout(200);
    await page.screenshot({ path: join(SHOTS, `${name}.jpg`), type: 'jpeg', quality: 80 });
};

// ================================================================== the whole journey, four phones

for (const [width, height, scheme] of [[440, 956, 'dark'], [375, 667, 'dark'], [440, 956, 'light'], [375, 667, 'light']]) {
    const where = `${width}x${height} ${scheme}`;
    const shots = width === 440 && scheme === 'dark';
    const { page, context, cdp, errors, away, asked } = await open(width, height, scheme);

    // ------------------------------------------------------------ the way in
    suite(`${where}: the way in`);
    same('the app booted on the evening the clock says', await page.evaluate(() => [todayStr(), State.date]), [TODAY, TODAY]);
    const dockBefore = await page.evaluate(() => {
        const dock = document.querySelector('.day-actions');
        return { kids: [...dock.children].map(node => node.tagName + ':' + (node.id || node.className)),
            height: Math.round(dock.getBoundingClientRect().height),
            journey: document.querySelectorAll('.app [id^="journey"], #transportPanel [id^="journey"]').length,
            panel: getComputedStyle(document.getElementById('journeyPanel')).display };
    });
    same('before a journey the day\'s dock holds its own two buttons and nothing else', dockBefore.kids.length, 2);
    // MOVED, second pass: «nothing of the journey is on the day screen» (0) -> exactly one
    // thing, the button at the foot of the list.
    same('and the one thing of the journey on the day screen is the button at the list\'s foot',
        [await page.evaluate(() => [...document.querySelectorAll('.app [id^="journey"]')].map(node => node.id)), dockBefore.panel],
        [['journeyDayEntry'], 'none']);
    const foot = await page.evaluate(() => {
        const entry = document.getElementById('journeyDayEntry');
        const row = entry.parentNode;
        const box = entry.getBoundingClientRect();
        const list = document.getElementById('dayView').getBoundingClientRect();
        const above = [...document.querySelectorAll('#dayView .tray, #dayView .site-grid')].map(node => node.getBoundingClientRect().bottom);
        const names = [...document.querySelectorAll('#dayView .wrow, #dayView .chip-main')].map(node => node.getBoundingClientRect().bottom);
        const style = getComputedStyle(entry);
        const under = row.nextElementSibling;
        return { text: entry.textContent, resume: entry.dataset.resume, w: box.width, h: box.height, list: list.width,
            next: row.nextElementSibling && row.nextElementSibling.querySelector('#dayCheckEntry') ? 'dayCheckEntry' : null,
            // v188: that row holds «חיפוש עובד» first and «בדיקת היום» beside it, one line, whole
            // under the journey's row and touching nothing of it.
            footIds: under ? [...under.querySelectorAll('button')].map(node => node.id) : [],
            footClear: under ? [...under.querySelectorAll('button')].every(node => { const b = node.getBoundingClientRect(); return b.top >= box.bottom - 0.5 && b.height >= 47.5 && b.width >= 44; }) : false,
            footOneLine: under ? new Set([...under.querySelectorAll('button')].map(node => Math.round(node.getBoundingClientRect().top))).size === 1 : false,
            footTall: under ? Math.round(under.getBoundingClientRect().height) : 0,
            last: row.nextElementSibling === document.getElementById('dayView').lastElementChild,
            under: Math.max(...above, ...names) <= box.top + 0.5, font: parseFloat(style.fontSize),
            inDayView: document.getElementById('dayView').contains(entry),
            header: document.querySelector('#dayView .day-header').contains(entry), dock: document.querySelector('.day-actions').contains(entry) };
    });
    same('it names the day it will open on', [bare(foot.text), foot.resume], [DAY_ENTRY, '0']);
    check('it is at the FOOT of the list: under every site, tray and name, straight above «בדיקת היום», which is still last',
        foot.inDayView && foot.under && foot.next === 'dayCheckEntry' && foot.last, JSON.stringify(foot));
    check('not on the header and not on the dock', !foot.header && !foot.dock);
    same('the row under it is the day\'s own foot: «חיפוש עובד» then «בדיקת היום», in one line, whole and clear of it',
        [foot.footIds, foot.footClear, foot.footOneLine], [['findEntry', 'dayCheckEntry'], true, true]);
    check('and that row is one button tall - the journey\'s row is the only height the foot gained', foot.footTall <= 56, String(foot.footTall));
    check('the width of the list, 48px or more, in 16px words or larger', foot.w >= foot.list - 1 && foot.h >= 47.5 && foot.font >= 16,
        JSON.stringify({ w: foot.w, list: foot.list, h: foot.h, font: foot.font }));
    await page.locator(WA_BUTTON).tap();
    const entries = await page.evaluate(() => [...document.querySelectorAll('#shareModal .modal-actions > *')]
        .map(node => node.id).filter(id => ['sederEntry', 'transportEntry', 'journeyEntry'].includes(id)));
    same('one entry, in the WhatsApp dialog, after the seder\'s and הסעות\'s', entries, ['sederEntry', 'transportEntry', 'journeyEntry']);
    same('worded', await text(page, '#journeyEntry'), ENTRY);
    const entryBox = await page.locator('#journeyEntry').boundingBox();
    check('44px, the whole row', entryBox.height >= 43.5 && entryBox.width > width / 2, JSON.stringify(entryBox));
    const record0 = await recordBytes(page);

    // ------------------------------------------------------------ station 1
    suite(`${where}: station 1 - the day screen itself, on tomorrow`);
    await page.locator('#journeyEntry').tap();
    await page.waitForTimeout(200);
    same('the dialog stepped aside and the journey is at its first station', [await visible(page, '#shareModal'), await station(page)], [false, 1]);
    same('for TOMORROW - and the day screen is on that date', await page.evaluate(() => [journeyDate(), State.date]), [DAY, DAY]);
    same('which its own header says', await text(page, '#dayView .day-date'), '11/11/2026');
    same('kept: the date, the station, and that it is on the screen',
        await page.evaluate(key => { const k = JSON.parse(localStorage.getItem(key)); return [k.version, k.date, k.station, k.open]; }, KEY),
        [1, DAY, 1, true]);
    same('starting it wrote nothing to the record and queued nothing', await recordBytes(page), record0);
    same('the strip: here, and four ahead', await strip(page, '#journeyDock'), ['now', 'todo', 'todo', 'todo', 'todo']);
    same('named for a screen reader', await page.locator('#journeyDock .journey-strip').getAttribute('aria-label'), `שלב 1 מתוך 5 · ${STATIONS[0]}`);
    same('the counter', await text(page, '#journeyCount'), 'שובצו: 8 · לא נרשמו: 4 · נעדרים: 1');
    same('the way onward names the next station', await text(page, '#journeyNext'), `המשך: ${STATIONS[1]}`);
    // WHO is not recorded: the counter is a button while anybody is, and it names them.
    await page.locator('#journeyCount').tap();
    await page.locator('#askModal').waitFor({ state: 'visible' });
    same('touched, the counter names the men not recorded yet - the active ones, in roster order',
        [await text(page, '#askTitle'), await text(page, '#askMessage')], ['לא נרשמו: 4', 'עבד אל-רחמן, מחמוד, חאלד, נביל']);
    await page.locator('#askOk').tap();
    await page.waitForTimeout(120);
    same('and that told him and changed nothing', [await station(page), await recordBytes(page)], [1, record0]);
    const dock = await page.evaluate(() => {
        const node = document.querySelector('.day-actions');
        const own = [...node.querySelectorAll(':scope > button')].map(one => {
            const box = one.getBoundingClientRect();
            const top = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
            return { w: Math.round(box.width), h: Math.round(box.height), top: top === one || one.contains(top) };
        });
        const box = node.getBoundingClientRect();
        const tabs = document.querySelector('.tabs').getBoundingClientRect();
        return { own, height: Math.round(box.height), position: getComputedStyle(node).position,
            published: Math.round(parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--day-actions-h'))),
            onTabs: Math.abs(box.bottom - tabs.top) < 1.5, row: document.getElementById('journeyDock').parentNode === node };
    });
    check('the row is INSIDE the day\'s own dock - no bar of its own', dock.row && dock.position === 'fixed');
    // MOVED, second pass: «the dock's own two buttons are still there» -> the WhatsApp
    // button is put away at this station (sending is the fifth) and the copy button stays.
    same('of the dock\'s own two buttons «שליחה לוואטסאפ» is put away and «מהיום הקודם» is there, whole, 44px and under nothing',
        dock.own.map(one => one.h >= 44 && one.w >= 44 && one.top), [false, true]);
    const lines = await page.evaluate(() => {
        const tops = sel => { const box = document.querySelector(sel).getBoundingClientRect(); return [Math.round(box.top), Math.round(box.left), Math.round(box.right)]; };
        const leave = tops('#journeyDock .journey-quiet');
        const copy = tops('#copyDayBtn');
        const next = tops('#journeyNext');
        return { oneLine: Math.abs(leave[0] - copy[0]) <= 1 && Math.abs(copy[0] - next[0]) <= 1,
            // right to left: «יציאה», the copy button, the way onward
            order: leave[1] >= copy[2] - 1 && copy[1] >= next[2] - 1,
            wa: getComputedStyle(document.querySelector('.day-actions .btn-success')).display,
            copy: document.getElementById('copyDayBtn').parentNode === document.querySelector('.day-actions') };
    });
    same('the copy button sits in one line between «יציאה» and the way onward - and was not moved in the document',
        lines, { oneLine: true, order: true, wa: 'none', copy: true });
    // 198px was what v184's three lines took on the small phone (docs/releases.md, v184).
    check('the dock is two lines now: lower than v184\'s three', dock.height <= 160, String(dock.height));
    same('js/ui/bars.js measured the dock as it now stands', dock.published, dock.height);
    check('and it still sits exactly on the tab bar', dock.onTabs);
    check('taller than it was, by the row', dock.height > dockBefore.height, `${dockBefore.height} -> ${dock.height}`);
    // The room the page keeps under the list is the measured dock: the last thing on the
    // day can be scrolled clear of it.
    const clear = await page.evaluate(() => {
        window.scrollTo(0, document.documentElement.scrollHeight);
        const last = [...document.querySelectorAll('#dayView .tray, #dayView .wrow')].pop();
        const out = { last: last.getBoundingClientRect().bottom, dock: document.querySelector('.day-actions').getBoundingClientRect().top };
        window.scrollTo(0, 0);
        return out;
    });
    check('the last thing on the day scrolls clear of the taller dock', clear.last <= clear.dock + 0.5, JSON.stringify(clear));
    await page.waitForTimeout(120);
    await floors(page, 'station 1');
    if (shots) await shot(page, 'station-1-day');

    // A man placed by the day's own picker, by a finger.
    const queued = await page.evaluate(() => FarkadSync.pendingCount());
    await tapOnDay(page, page.locator('#dayView .tray .chip-main', { hasText: 'מחמוד' }));
    await page.locator('#placePickerList button', { hasText: 'נתניה' }).tap();
    await page.locator('#placePickerModal button[onclick="closePlacePicker()"]').tap();
    await page.waitForTimeout(150);
    same('a man placed through the day\'s own picker moves the counter', await text(page, '#journeyCount'), 'שובצו: 9 · לא נרשמו: 3 · נעדרים: 1');
    same('the record has him, written by the day\'s own code on the journey\'s date',
        await page.evaluate(day => JSON.parse(localStorage.getItem('scheduleData:v2')).days[day].actual.w_10.entries.map(e => e.placeId), DAY), ['p_04']);
    check('as one ordinary edit in the queue', await page.evaluate(() => FarkadSync.pendingCount()) === queued + 1);

    // The date is the day screen's to change, and the journey follows it.
    await page.locator('#dayView .nav-fwd').tap();
    await page.waitForTimeout(150);
    same('the day\'s own arrow moves the journey\'s date', [await page.evaluate(() => [State.date, journeyDate()]), (await keptOf(page)).date],
        [[AFTER, AFTER], AFTER]);
    same('and the counter is that day\'s', await text(page, '#journeyCount'), 'שובצו: 0 · לא נרשמו: 13');
    await page.locator('#dayView .nav-back').tap();
    await page.waitForTimeout(150);
    same('and back', await page.evaluate(() => [State.date, journeyDate()]), [DAY, DAY]);

    // Another tab: the journey's row leaves with the day's dock and comes back with it.
    await page.locator('#tab-week').tap();
    await page.waitForTimeout(120);
    same('on another tab the dock is away, the row with it', [await visible(page, DOCK_ROW), await station(page)], [false, 1]);
    await page.locator('#tab-day').tap();
    await page.waitForTimeout(120);
    same('and back on the day it is there', await visible(page, DOCK_ROW), true);

    // ------------------------------------------------------------ station 2
    suite(`${where}: station 2 - the check, which never blocks`);
    await page.locator('#journeyNext').tap();
    await page.waitForTimeout(200);
    same('the panel, at the check', [await station(page), await visible(page, '#journeyPanel'), await text(page, '#journeyStation')], [2, true, STATIONS[1]]);
    same('titled, and for which day', [await text(page, '#journeyTitle'), await text(page, '#journeyContext')],
        ['בניית סידור', 'סידור ליום רביעי 11/11/2026']);
    same('the dock row is gone with the station', await page.locator('#journeyDock').count(), 0);
    same('the strip: the first station still has men not recorded', await strip(page, '#journeyStripSlot'), ['open', 'now', 'todo', 'todo', 'todo']);
    // THE REAL DAY CHECK (js/ui/daycheck.js), drawn by its own door. This day has no
    // working day before it to compare with, so it has nothing under «כדאי לבדוק» and says
    // its calm line - and the three men nobody recorded, whom it cannot know about, are
    // said by the journey above it.
    given('the day\'s own check is on this build', await page.evaluate(() => typeof renderDayCheckInto === 'function' && typeof dayCheckFindings === 'function'));
    same('the day\'s own check is drawn, for the journey\'s date, with its calm line',
        [await page.locator('#journeyCheck #journeyCheckReal').count(), (await page.locator('#journeyCheckReal .daycheck-clean').allTextContents()).map(bare),
            await page.evaluate(() => dayCheckFindings(journeyDate()).filter(one => one.tier === 'check').length)],
        [1, ['✓ לא נמצא דבר שנראה שנשכח.'], 0]);
    same('and above it the journey names the men not recorded whom that check does not',
        [(await page.locator('#journeyCheck > .journey-warn').allTextContents()).map(bare), await page.locator('#journeyCheck').getAttribute('data-count')],
        [['לא נרשמו (3): עבד אל-רחמן, חאלד, נביל'], '1']);
    await floors(page, 'station 2');
    if (shots) await shot(page, 'station-2-check');

    await page.locator('#journeyBack').tap();
    await page.waitForTimeout(150);
    same('«חזרה» is the day screen again, with the row in its dock', [await station(page), await visible(page, '#journeyPanel'), await visible(page, DOCK_ROW)], [1, false, true]);
    await page.locator('#journeyNext').tap();
    await page.waitForTimeout(150);

    // THE CONTRACT, held with the real check put aside and stood in for. Both of its doors
    // are global function declarations: they cannot be deleted, so each case ASSIGNS what
    // it needs to both names - the one it is about and the one the journey would otherwise
    // prefer - and the real pair is put back at the end.
    await page.evaluate(() => { window.__realCheck = [window.renderDayCheckInto, window.dayCheckFindings]; });
    const OWN = ['לא נרשמו (3): עבד אל-רחמן, חאלד, נביל'];
    await page.evaluate(() => { window.renderDayCheckInto = undefined; window.dayCheckFindings = undefined; render(); });
    same('with no day check on the build at all, the journey\'s own reading',
        [(await page.locator('#journeyCheck .journey-warn').allTextContents()).map(bare), await page.locator('#journeyCheckReal').count(),
            await page.locator('#journeyCheck').getAttribute('data-count')],
        [OWN, 0, '1']);
    await page.evaluate(() => {
        window.renderDayCheckInto = undefined;
        window.dayCheckFindings = date => [{ kind: 'outside', tier: 'check', text: `בדיקה חיצונית ${date}`, workers: [] },
            { kind: 'fyi', tier: 'info', text: 'לידיעה בלבד', workers: [] }];
        render();
    });
    same('findings from a day check that cannot draw are shown as its sentences, after the journey\'s own line - and only «כדאי לבדוק» is counted',
        [(await page.locator('#journeyCheck .journey-warn').allTextContents()).map(bare), await page.locator('#journeyCheck').getAttribute('data-count')],
        [[OWN[0], `בדיקה חיצונית ${DAY}`, 'לידיעה בלבד'], '2']);
    await page.evaluate(() => {
        window.dayCheckFindings = date => [{ kind: 'outside', tier: 'check', text: `בדיקה חיצונית ${date}`,
            workers: [{ id: 'w_11', name: 'חאלד' }] }];
        window.renderDayCheckInto = (host, date) => { host.appendChild(el('p', 'from-daycheck', `צויר ${date}`)); return 1; };
        render();
    });
    same('a day check that draws is the one drawn, and a man it names is not said a second time by the journey',
        [await text(page, '#journeyCheckReal .from-daycheck'), (await page.locator('#journeyCheck > .journey-warn').allTextContents()).map(bare),
            await page.locator('#journeyCheck').getAttribute('data-count')],
        [`צויר ${DAY}`, ['לא נרשמו (2): עבד אל-רחמן, נביל'], '2']);
    check('with findings on the page the way onward is as open as it was',
        await page.locator('#journeyNext').isEnabled() && await text(page, '#journeyNext') === `המשך: ${STATIONS[2]}`);
    await page.evaluate(() => {
        window.renderDayCheckInto = () => { throw new Error('daycheck: boom'); };
        window.dayCheckFindings = () => { throw new Error('daycheck: boom too'); };
        render();
    });
    same('a day check that throws both ways costs him nothing: the journey\'s own reading stands in',
        [(await page.locator('#journeyCheck .journey-warn').allTextContents()).map(bare), await station(page)], [OWN, 2]);
    await page.evaluate(() => { [window.renderDayCheckInto, window.dayCheckFindings] = window.__realCheck; render(); });
    same('and with the real pair back, the real check is drawn again', await page.locator('#journeyCheckReal .daycheck-clean').count(), 1);

    // ------------------------------------------------------------ station 3
    suite(`${where}: station 3 - the הסעות screen, with the journey's bar in it`);
    const beforeRides = await recordBytes(page);
    await page.locator('#journeyNext').tap();
    await page.waitForTimeout(250);
    same('the הסעות screen itself, for the journey\'s date',
        [await station(page), await page.locator('#transportPanel').evaluate(node => node.classList.contains('open')),
            await text(page, '#transportContext'), await visible(page, '#journeyPanel')],
        [3, true, 'יום רביעי 11/11/2026', false]);
    check('the journey\'s bar is inside its panel, above the list',
        await page.evaluate(() => { const bar = document.getElementById('journeyRide'); return Boolean(bar) && bar.parentNode.id === 'transportPanel' && bar.nextElementSibling.id === 'transportBody' && getComputedStyle(bar).position === 'static'; }));
    same('the men with a site are waiting in its tray, as on any evening',
        await page.evaluate(() => [...document.querySelectorAll('#transportChips .transport-chip')].map(node => node.dataset.worker)),
        ['w_01', 'w_02', 'w_03', 'w_04', 'w_05', 'w_06', 'w_07', 'w_08', 'w_10']);
    same('and the bar counts them', await text(page, '#journeyRideStatus'), 'בלי מושב: 9');
    same('the strip', await strip(page, '#journeyRide'), ['open', 'done', 'now', 'todo', 'todo']);
    await floors(page, 'station 3');

    // Seated by a finger: two real drags, then a touch on a man and a touch on a seat.
    await drag(cdp, page, chip('w_01'), seat('tv_01', 1));
    await drag(cdp, page, chip('w_02'), seat('tv_01', 2));
    same('two men dragged to their seats are drawn there', await drawn(page, 'tv_01'), 'w_01 w_02 - - -');
    same('and the bar follows the picture', await text(page, '#journeyRideStatus'), 'בלי מושב: 7');
    // Past the moment in which the click that ends a drag is not a tap (js/ui/transport.js).
    await page.waitForTimeout(500);
    // AND PAST THE BROWSER'S OWN GESTURE. Chromium makes no click out of a tap that lands
    // while the scroll a drag set going is still settling - the tap only stops it - and on a
    // loaded machine that outlasted the 500ms: the chip below got its pointerdown and
    // pointerup and no click, three runs in a row (2026-11-11, load average 5). A first touch
    // on the screen's heading, which does nothing, takes that for it.
    await page.locator('#transportTitle').tap();
    await page.waitForTimeout(200);
    await page.locator(chip('w_03')).tap();
    await page.locator(seat('tv_01', 3)).tap();
    await page.waitForTimeout(120);
    same('a man touched and then a seat touched', [await drawn(page, 'tv_01'), await text(page, '#journeyRideStatus')], ['w_01 w_02 w_03 - -', 'בלי מושב: 6']);
    // The rest by the screen's own function - the engine a drag ends in.
    await page.evaluate(day => {
        transportPlace(day, 'w_05', 'tv_02', 2);
        transportPlace(day, 'w_06', 'tv_02', 3);
        transportPlace(day, 'w_07', 'tv_03', 2);
        renderTransport();
    }, DAY);
    same('passengers with nobody at the wheel are counted by vehicle', await text(page, '#journeyRideStatus'), 'בלי מושב: 3 · רכבים בלי נהג: 2');
    await page.evaluate(day => {
        transportPlace(day, 'w_04', 'tv_02', 1);
        transportPlace(day, 'w_08', 'tv_03', 1);
        transportPlace(day, 'w_10', 'tv_03', 3);
        renderTransport();
    }, DAY);
    // MOVED, second pass: the bar said «כל העובדים משובצים» under the tray that says it.
    same('everybody seated, a driver in every car: the screen says so ONCE, and the journey\'s bar says nothing',
        [await text(page, '#journeyRideStatus'), await text(page, '#transportTrayTitle'),
            (await page.locator('#transportPanel').textContent()).split(ALL_SEATED).length - 1], ['', ALL_SEATED, 1]);
    same('its node is still there for the next thing left, and the way onward with it',
        [await page.locator('#journeyRideStatus').count(), await visible(page, '#journeyRide #journeyNext')], [1, true]);
    const cars = [await drawn(page, 'tv_01'), await drawn(page, 'tv_02'), await drawn(page, 'tv_03')];
    same('three cars, as drawn', cars, ['w_01 w_02 w_03 - -', 'w_04 w_05 w_06 - -', 'w_08 w_07 w_10 - -']);
    same('the seats are the הסעות screen\'s own record, not the day\'s', await recordBytes(page), beforeRides);
    await floors(page, 'station 3, seated');
    if (shots) await shot(page, 'station-3-rides');

    // The screen's own «חזרה» is one station back; the plan is where it was left.
    await page.locator('#transportClose').tap();
    await page.waitForTimeout(200);
    same('the screen\'s own «חזרה» is the check again', [await station(page), await visible(page, '#journeyPanel'),
        await page.locator('#transportPanel').evaluate(node => node.classList.contains('open')), await page.locator('#journeyRide').count()],
        [2, true, false, 0]);
    await page.locator('#journeyNext').tap();
    await page.waitForTimeout(250);
    same('and onward again the cars are as they were', [await station(page), await drawn(page, 'tv_02')], [3, 'w_04 w_05 w_06 - -']);

    // ------------------------------------------------------------ station 4
    suite(`${where}: station 4 - the last look says what was built`);
    const diskBefore = await diskBut(page, KEY);
    await censusOnly(check, page, diskBefore, [KEY]);
    await page.locator('#journeyNext').tap();
    await page.waitForTimeout(250);
    same('the panel, at the last look, the הסעות screen shut behind it',
        [await station(page), await text(page, '#journeyStation'), await page.locator('#transportPanel').evaluate(node => node.classList.contains('open'))],
        [4, STATIONS[3], false]);
    same('the strip: men still not recorded behind him, the rides done', await strip(page, '#journeyStripSlot'), ['open', 'done', 'done', 'now', 'todo']);
    const blocksOf = id => page.evaluate(sel => [...document.querySelectorAll(`${sel} .journey-block`)]
        .map(block => [...block.children].map(line => line.textContent)), id);
    const siteBlocks = await blocksOf('#journeyLookSites');
    same('each site and its men - worked out by hand from the day as it was built',
        siteBlocks.map(block => block.map(bare)), [
            ['📍 הרצליה', '• אחמד', '• סמיר', '• ראמי'],
            ['📍 חיפה', '• מוחמד', '• עלי', '• דוד'],
            ['📍 פרדסיה', '• יוסי', '• Ali Hassan'],
            ['📍 נתניה', '• מחמוד'],
            ['🚫 נעדרים: זיאד']
        ]);
    same('which is the day\'s own message, line for line, under its heading',
        siteBlocks, await page.evaluate(() => dayMessage(journeyDate(), State.layer).split(/\n{2,}/).slice(1).map(block => block.split('\n'))));
    same('the men not recorded - who are simply missing from a message - are said above it',
        (await page.locator('#journeyLookSites .journey-warn').allTextContents()).map(bare), ['לא נרשמו (3): עבד אל-רחמן, חאלד, נביל']);
    const rideBlocks = await blocksOf('#journeyLookRides');
    same('each vehicle, its driver and its riders - worked out by hand from the cars AS DRAWN at station 3',
        rideBlocks.map(block => block.map(bare)), [
            ['רכב: טויוטה קורולה 2013 – 3 מתוך 5', 'נהג: אחמד – הרצליה', '- מוחמד – חיפה', '- יוסי – פרדסיה'],
            ['רכב: טויוטה קורולה 2016 – 3 מתוך 5', 'נהג: סמיר – הרצליה', '- עלי – חיפה', '- Ali Hassan – פרדסיה'],
            ['רכב: BYD סיל U 2025 – 3 מתוך 5', 'נהג: דוד – חיפה', '- ראמי – הרצליה', '- מחמוד – נתניה'],
            ['רכבים ריקים: BYD אטו 3 2025, פולקסווגן 2018, סוואנה 2010, ליפמוטור C10 2026']
        ]);
    same('which is the rides\' own summary, block for block, under its heading',
        rideBlocks, await page.evaluate(() => transportSummaryText(journeyDate()).split(/\n{2,}/).slice(1).map(block => block.split('\n'))));
    check('a vehicle\'s name keeps its right-to-left isolate here too', rideBlocks[2][0].includes(car('BYD סיל U 2025')), rideBlocks[2][0]);
    same('it only reads: nothing on the page to type in, tick or tap',
        await page.locator('#journeyBody').locator('button, a, input, select, textarea, [contenteditable]').count(), 0);
    same('and reading it moved no key on the disk', await diskBut(page, KEY), diskBefore);
    await floors(page, 'station 4');
    if (shots) await shot(page, 'station-4-last-look');

    // ------------------------------------------------------------ station 5
    suite(`${where}: station 5 - he chooses what is sent`);
    await page.locator('#journeyNext').tap();
    await page.waitForTimeout(250);
    same('the panel, at the sending', [await station(page), await text(page, '#journeyStation')], [5, STATIONS[4]]);
    same('three groups, the drivers first', await page.evaluate(() => [...document.querySelectorAll('#journeyBody .journey-send')].map(node => node.id)),
        ['journeySendDrivers', 'journeySendWorkers', 'journeySendAll']);
    same('their headings', (await page.locator('#journeyBody .journey-send h4').allTextContents()).map(bare), ['הודעות לנהגים', 'הודעה לכל עובד', 'הודעה כללית']);
    same('nothing is ticked, pressed or marked for him',
        await page.evaluate(() => [document.querySelectorAll('#journeyPanel input').length,
            document.querySelectorAll('#journeyPanel [aria-pressed="true"], #journeyPanel [aria-checked="true"]').length,
            [...document.querySelectorAll('#journeyPanel [data-mark]')].map(node => node.dataset.mark).join(' ')]),
        [0, 0, 'none none none']);
    same('arriving here opened nothing and moved no key', [asked.length, await diskBut(page, KEY)], [0, diskBefore]);
    same('the way onward is «סיום», open before anything is sent', [await text(page, '#journeyNext'), await page.locator('#journeyNext').isEnabled()], ['סיום', true]);
    same('a row per vehicle with a man at the wheel: the driver, and under him the vehicle',
        await page.evaluate(() => [...document.querySelectorAll('#journeySendDrivers .journey-send-row')]
            .map(row => [row.dataset.vehicle, row.querySelector('strong').textContent, row.querySelector('.journey-send-sub').textContent].join(' | '))),
        ['tv_01 | אחמד | טויוטה קורולה 2013', 'tv_02 | סמיר | טויוטה קורולה 2016', 'tv_03 | דוד | BYD סיל U 2025']);
    const message = [`שלום ${named('אחמד')},`, 'הסעה ליום רביעי 11/11/2026:', `רכב: ${car('טויוטה קורולה 2013')}`, 'נוסעים (2):',
        `- ${named('מוחמד')} – ${named('חיפה')}`, `- ${named('יוסי')} – ${named('פרדסיה')}`,
        `יעדים: ${named('הרצליה')}, ${named('חיפה')}, ${named('פרדסיה')}`].join('\n');
    const door = page.locator('#journeySendDrivers a[data-wa="tv_01"]');
    same('his door is a real link to HIS chat with HIS message, before the finger lands',
        [await door.getAttribute('href'), await door.getAttribute('target'), bare(await door.textContent())],
        [`https://wa.me/972528841930?text=${encodeURIComponent(message)}`, '_blank', 'פתיחה בוואטסאפ']);
    await floors(page, 'station 5');
    if (shots) await shot(page, 'station-5-sending');

    same('before any driver is opened nobody is named again among the workers',
        await page.locator('#journeySendWorkers .journey-send-driver').count(), 0);
    const recordAtSend = await recordBytes(page);
    const opened = await tapToWhatsApp(page, context, door);
    same('his own tap goes to wa.me, to the driver\'s number, with that message',
        [opened, asked.length], [`https://wa.me/972528841930?text=${encodeURIComponent(message)}`, 1]);
    same('and his row then says what the vehicle\'s own card says - opened, never sent',
        [await page.locator('#journeySendDrivers [data-vehicle="tv_01"]').getAttribute('data-mark'),
            (await page.locator('#journeySendDrivers [data-vehicle="tv_01"] .transport-badge').allTextContents()).map(bare),
            await page.locator('#journeySendDrivers [data-mark="opened"]').count()],
        ['opened', [OPENED], 1]);
    same('the mark is the הסעות screen\'s own, in its own key', await page.evaluate(key => Object.keys(JSON.parse(localStorage.getItem(key)).marks), RIDES), ['tv_01']);
    check('no word on the station says anything was sent', !/נשלח/.test(await page.locator('#journeyPanel').textContent()));
    // He is a man with a site too, so the seder to each worker holds a message for him.
    same('the driver who was opened is named again in the workers\' group: his name, the group he was opened in, the same mark',
        await page.evaluate(() => [...document.querySelectorAll('#journeySendWorkers .journey-send-driver')].map(row =>
            [row.dataset.worker, row.querySelector('strong').textContent, row.querySelector('.journey-send-sub').textContent,
                row.querySelector('.transport-badge').textContent.replace(/[\u2066-\u2069]/g, '')].join(' | '))),
        ['w_01 | אחמד | הודעות לנהגים | נפתח בוואטסאפ']);
    check('above the button that opens the list', await page.evaluate(() => {
        const row = document.querySelector('#journeySendWorkers .journey-send-driver').getBoundingClientRect();
        return row.bottom <= document.getElementById('journeySederOpen').getBoundingClientRect().top + 0.5;
    }));

    // The seder to each worker: the existing list, OVER the panel.
    await page.locator('#journeySederOpen').tap();
    await page.waitForTimeout(200);
    const over = selector => page.evaluate(sel => {
        const node = document.querySelector(sel);
        const box = node.getBoundingClientRect();
        const top = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
        return Boolean(top) && (top === node || node.contains(top));
    }, selector);
    same('the seder\'s own list opens over the station, for the journey\'s date',
        [await visible(page, '#sederModal'), await over('#sederClose'), await text(page, '#sederContext'),
            await page.locator('#sederList .seder-row').count()],
        [true, true, 'יום רביעי 11/11/2026 · 9 עובדים', 9]);
    check('and he is still on that list: named, never skipped',
        (await page.locator('#sederList .seder-row').allTextContents()).some(row => row.includes('אחמד')));
    await page.locator('#sederClose').tap();
    await page.waitForTimeout(150);
    same('closed, he is where he was', [await visible(page, '#sederModal'), await station(page), await visible(page, '#journeyPanel')], [false, 5, true]);

    // The day's message: its own dialog, over the panel.
    await page.locator('#journeyDayMessage').tap();
    await page.waitForTimeout(200);
    same('the day\'s message opens in its own dialog over the station, for the journey\'s date',
        [await visible(page, '#shareModal'), await over('#shareModal .btn-success'), await text(page, '#shareContext'),
            await page.locator('#shareText').inputValue() === await page.evaluate(day => dayMessage(day, State.layer), DAY)],
        [true, true, 'כל האתרים · 11/11/2026', true]);
    await page.locator('#shareModal button[onclick="closeShareModal()"]').tap();
    await page.waitForTimeout(150);

    // The rides' summary. MOVED, second pass: the button went straight to the share sheet;
    // it now opens the summary's OWN dialog (v179) for the journey's date, to be read
    // first, and the words leave by that dialog's doors - recorders here.
    await page.evaluate(() => {
        window.__realOpen = window.open;
        window.open = url => { window.__opened = url; return null; };
        navigator.share = data => { window.__shared = data; return Promise.resolve(); };
    });
    const diskAtSummary = await diskBut(page);
    await page.locator('#journeySummary').tap();
    await page.waitForTimeout(200);
    const summary = await page.evaluate(day => transportSummaryText(day), DAY);
    same('the rides\' summary opens in its own dialog over the station, for the journey\'s date, with the הסעות screen still shut',
        [await visible(page, '#transportSummaryModal'), await over('#transportSummarySend'), await text(page, '#transportSummaryContext'),
            await page.locator('#transportSummaryText').inputValue() === summary,
            await page.locator('#transportPanel').evaluate(node => node.classList.contains('open'))],
        [true, true, 'יום רביעי 11/11/2026', true, false]);
    same('opening it sent nothing anywhere and wrote no key',
        [await page.evaluate(() => [window.__shared === undefined, window.__opened === undefined]), await diskBut(page)],
        [[true, true], diskAtSummary]);
    await page.locator('#transportSummarySend').tap();
    await page.waitForTimeout(150);
    same('its own send button gives the share sheet the text', await page.evaluate(() => window.__shared), { text: summary });
    await page.evaluate(() => { delete navigator.share; if (document.getElementById('transportSummaryModal').style.display === 'flex') closeTransportSummary(); });
    await page.locator('#journeySummary').tap();
    await page.waitForTimeout(150);
    await page.locator('#transportSummarySend').tap();
    await page.waitForTimeout(150);
    same('and with no share sheet it goes to wa.me with the text and NO NUMBER - he picks the chat',
        await page.evaluate(() => window.__opened), `https://wa.me/?text=${encodeURIComponent(summary)}`);
    await page.evaluate(() => { window.open = window.__realOpen; if (document.getElementById('transportSummaryModal').style.display === 'flex') closeTransportSummary(); });
    await page.locator('#journeySummary').tap();
    await page.waitForTimeout(150);
    await floorsOf(page, '#transportSummaryModal', 'the summary\'s dialog over station 5');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
    same('Escape shuts the dialog and leaves him at the sending, the journey still on the screen',
        [await visible(page, '#transportSummaryModal'), await station(page), await visible(page, '#journeyPanel')], [false, 5, true]);
    same('none of the sending touched the record or queued anything', await recordBytes(page), recordAtSend);

    // Finished, with two of three drivers never opened: that is his choice.
    await page.locator('#journeyNext').tap();
    await page.waitForTimeout(250);
    same('«סיום» ends it whether or not everything was sent: no panel, no row, nothing kept',
        [await station(page), await visible(page, '#journeyPanel'), await page.locator('#journeyDock').count(),
            await page.evaluate(key => localStorage.getItem(key), KEY),
            await page.evaluate(() => document.body.classList.contains('journey-on') || document.body.classList.contains('journey-day'))],
        [0, false, 0, null, false]);
    same('and the day screen is back on TODAY', [await page.evaluate(() => State.date), await text(page, '#dayView .day-date')], [TODAY, '10/11/2026']);
    same('the day\'s dock is its own two buttons again, at the height it had',
        await page.evaluate(() => { const dock = document.querySelector('.day-actions'); return [dock.children.length, Math.round(dock.getBoundingClientRect().height)]; }),
        [2, dockBefore.height]);
    same('«שליחה לוואטסאפ» is back with it, and the button at the foot offers a new journey',
        [await visible(page, WA_BUTTON), bare(await page.locator('#journeyDayEntry').textContent())], [true, DAY_ENTRY]);
    same('what he built is all still there: the day, the seats and the one mark',
        await page.evaluate(([day, key]) => [Object.keys(JSON.parse(localStorage.getItem('scheduleData:v2')).days[day].actual).length,
            Object.keys(JSON.parse(localStorage.getItem(key)).trips).length, Object.keys(JSON.parse(localStorage.getItem(key)).marks).length], [DAY, RIDES]),
        [10, 3, 1]);
    same('nothing went wrong on the page', errors, []);
    same('and nothing was asked for off this machine but the one chat he opened', [away, asked.length], [[], 1]);
    await context.close();
}

// ================================================================== the button at the foot of the day

for (const [width, height, scheme] of [[440, 956, 'dark'], [375, 667, 'light']]) {
    const { page, context, errors, asked } = await open(width, height, scheme);
    suite(`${width}x${height} ${scheme}: the journey from the foot of the day's list`);
    const record = await recordBytes(page);
    const disk = await diskBut(page);
    const header = await page.evaluate(() => { const box = document.querySelector('#dayView .day-header').getBoundingClientRect(); return [Math.round(box.top), Math.round(box.height)]; });
    await tapOnDay(page, page.locator('#journeyDayEntry'));
    await page.waitForTimeout(200);
    same('one tap on it is the journey at its first station, for the day it named', [await station(page), await page.evaluate(() => [journeyDate(), State.date])], [1, [DAY, DAY]]);
    same('started from here it wrote its own key and nothing else', [await recordBytes(page), await diskBut(page, KEY)], [record, disk]);
    same('with the journey\'s row in the dock the button at the foot is not drawn - one way onward, not two',
        [await page.locator('#journeyDayEntry').count(), await visible(page, DOCK_ROW), await page.locator('#dayCheckEntry').count()], [0, true, 1]);
    await walkTo(page, 4);
    await page.locator('#journeyLeave').tap();
    await page.waitForTimeout(200);
    given('he left at the last look', await station(page) === 0 && (await keptOf(page)).station === 4);
    same('left in the middle, the same button says where he is',
        [bare(await page.locator('#journeyDayEntry').textContent()), await page.locator('#journeyDayEntry').getAttribute('data-resume')],
        ['המשך בניית הסידור · שלב 4 מתוך 5', '1']);
    if (width === 440 && SHOTS) {
        await page.locator('#journeyDayEntry').evaluate(node => node.scrollIntoView({ block: 'center' }));
        await shot(page, 'day-foot-continue');
    }
    await tapOnDay(page, page.locator('#journeyDayEntry'));
    await page.waitForTimeout(200);
    same('and a tap continues it there', [await station(page), await text(page, '#journeyStation')], [4, STATIONS[3]]);
    await page.locator('#journeyLeave').tap();
    await page.waitForTimeout(150);
    await page.clock.fastForward('03:10:00');
    await page.evaluate(() => render());
    await page.waitForTimeout(150);
    same('three hours on it offers a new journey again', bare(await page.locator('#journeyDayEntry').textContent()), DAY_ENTRY);
    // The by-worker view of the day has the same foot.
    await page.evaluate(() => { State.date = todayStr(); setDayMode('workers'); });
    await page.waitForTimeout(200);
    // v188: the row under the journey's holds «חיפוש עובד» and then «בדיקת היום» (js/ui/day.js).
    same('the by-worker view ends in the same two rows, in the same order: the journey\'s, then find and the check',
        await page.evaluate(() => [...document.getElementById('dayView').children].slice(-2).map(row => [...row.querySelectorAll('button')].map(node => node.id))),
        [['journeyDayEntry'], ['findEntry', 'dayCheckEntry']]);
    await page.evaluate(() => { setDayMode('sites'); window.scrollTo(0, 0); });
    await page.waitForTimeout(250);
    same('the day\'s header is where it was, the size it was', await page.evaluate(() => { const box = document.querySelector('#dayView .day-header').getBoundingClientRect(); return [Math.round(box.top), Math.round(box.height)]; }), header);
    // At doubled text the words wrap inside the button; nothing runs off the side.
    given('the cascade was doubled', await doubleEveryFontSize(page) > 100);
    await page.evaluate(() => render());
    await page.waitForTimeout(300);
    const big = await page.evaluate(() => {
        const entry = document.getElementById('journeyDayEntry');
        const box = entry.getBoundingClientRect();
        return { inside: box.left >= -0.5 && box.right <= window.innerWidth + 0.5, tall: box.height >= 47.5,
            whole: entry.scrollWidth <= entry.clientWidth + 1 && entry.scrollHeight <= entry.clientHeight + 1,
            page: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1 };
    });
    same('at 200% the button holds all its words, inside the screen, and the page does not scroll sideways',
        big, { inside: true, tall: true, whole: true, page: true });
    same('nothing went wrong on the page, and WhatsApp was never opened', [errors, asked.length], [[], 0]);
    await context.close();
}

// ================================================================== a short screen keeps its last man

// THE GUARANTEE THIS BUTTON MUST NOT COST (tests/mobile.test.mjs): with the list scrolled
// to its end the last man is on the glass and a tap reaches him. On a phone turned
// sideways, and on a 320x568 one, there is not room under him for a second button - so
// there the button is not drawn, and the row in the WhatsApp dialog is the way in.
for (const [width, height] of [[568, 320], [844, 390], [320, 568]]) {
    const { page, context, errors } = await open(width, height, 'dark');
    suite(`${width}x${height}: no room at the foot - the button is not drawn, and the last man is still reachable`);
    same('the button is not on the glass, and «בדיקת היום» is',
        [await visible(page, '#journeyDayEntry'), await visible(page, '#dayCheckEntry')], [false, true]);
    // Asked the way tests/mobile.test.mjs asks it: the by-worker list, scrolled to its end.
    await page.evaluate(() => setDayMode('workers'));
    await page.waitForTimeout(250);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(250);
    const last = await page.evaluate(() => {
        const rows = [...document.querySelectorAll('#dayView .worker-list .wrow')].filter(node => node.offsetParent !== null);
        const node = rows[rows.length - 1];
        const box = node.getBoundingClientRect();
        const top = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
        return { hit: Boolean(top) && (top === node || node.contains(top)), top: Math.round(box.top), bottom: Math.round(box.bottom),
            under: top ? (top.id || top.className) : null };
    });
    check('with the list at its end the last man is on the glass, under nothing', last.hit, JSON.stringify(last));
    await page.evaluate(() => { setDayMode('sites'); window.scrollTo(0, 0); });
    await page.waitForTimeout(250);
    await start(page);
    same('the row in the WhatsApp dialog still starts the journey', [await station(page), await page.evaluate(() => journeyDate())], [1, DAY]);
    same('nothing went wrong on the page', errors, []);
    await context.close();
}

// ================================================================== a reload at every station

{
    const { page, context, errors, asked } = await open(440, 956, 'dark');
    suite('the app closed in the middle: back at the same station, for the same date');
    await page.evaluate(day => {
        transportPlace(day, 'w_01', 'tv_01', 1);
        transportPlace(day, 'w_02', 'tv_01', 2);
    }, DAY);
    await start(page);
    const seen = {
        1: async () => [await visible(page, DOCK_ROW), await text(page, '#journeyCount')],
        2: async () => [await visible(page, '#journeyPanel'), await text(page, '#journeyStation')],
        3: async () => [await page.locator('#transportPanel').evaluate(node => node.classList.contains('open')), await text(page, '#journeyRideStatus')],
        4: async () => [await visible(page, '#journeyPanel'), await text(page, '#journeyStation')],
        5: async () => [await visible(page, '#journeyPanel'), await text(page, '#journeyStation')]
    };
    const expected = { 1: [true, 'שובצו: 8 · לא נרשמו: 4 · נעדרים: 1'], 2: [true, STATIONS[1]], 3: [true, 'בלי מושב: 6'],
        4: [true, STATIONS[3]], 5: [true, STATIONS[4]] };
    for (const n of [1, 2, 3, 4, 5]) {
        await walkTo(page, n);
        given(`station ${n} is where he is`, await station(page) === n);
        await page.reload({ waitUntil: 'load' });
        await page.waitForTimeout(600);
        same(`station ${n}: after a reload he is at it, on its date, the day screen with it`,
            [await station(page), await page.evaluate(() => [journeyDate(), State.date, todayStr()])], [n, [DAY, DAY, TODAY]]);
        same(`station ${n}: and its screen is the one in front`, await seen[n](), expected[n]);
        same(`station ${n}: exactly one way onward on the page`, await page.locator('#journeyNext').count(), 1);
    }
    same('no reload opened WhatsApp - only a tap does that', asked.length, 0);

    // The seder's list, open over the last station when the app went away.
    await page.locator('#journeySederOpen').tap();
    await page.waitForTimeout(150);
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(600);
    same('the seder\'s list left open over the last station comes back over it',
        [await station(page), await visible(page, '#journeyPanel'), await visible(page, '#sederModal'), await text(page, '#sederContext')],
        [5, true, true, 'יום רביעי 11/11/2026 · 8 עובדים']);
    await page.locator('#sederClose').tap();
    await page.waitForTimeout(150);

    suite('left on purpose: the place is kept, and a reload does not bring it back');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
    same('Escape on the panel is «יציאה»', [await station(page), await visible(page, '#journeyPanel')], [0, false]);
    same('the place is kept, as left', await page.evaluate(key => { const k = JSON.parse(localStorage.getItem(key)); return [k.station, k.date, k.open]; }, KEY), [5, DAY, false]);
    same('and the day stays the one he was building, said by its own header', [await page.evaluate(() => State.date), await text(page, '#dayView .day-date')], [DAY, '11/11/2026']);
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(600);
    same('a reload opens on today, with no journey on the screen',
        [await station(page), await page.evaluate(() => State.date), await visible(page, '#journeyPanel'), await page.locator('#journeyDock').count()],
        [0, TODAY, false, 0]);
    await start(page);
    same('the entry continues it: the same station, the same date', [await station(page), await page.evaluate(() => journeyDate()), await text(page, '#journeyStation')],
        [5, DAY, STATIONS[4]]);
    await page.locator('#journeyLeave').tap();
    await page.waitForTimeout(150);
    same('«יציאה» does the same', await station(page), 0);

    // Three hours on, it is not the journey he is in the middle of.
    await page.clock.fastForward('03:10:00');
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(600);
    await start(page);
    same('left longer than three hours, the entry starts a new one: tomorrow, the first station',
        [await station(page), await page.evaluate(() => journeyDate())], [1, DAY]);

    // A preference that will not read. Left first: a journey on the screen writes its
    // place again as the page goes away, which would put a readable one back.
    await page.locator('#journeyDock .journey-quiet').tap();
    await page.evaluate(key => localStorage.setItem(key, '{"version":1,"date":"2026-11-11","stat'), KEY);
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(600);
    same('a damaged preference is no journey: the app opens on the day as it always does',
        [await station(page), await page.evaluate(() => State.date), await page.locator('#dayView .day-header').count()], [0, TODAY, 1]);
    await start(page);
    same('and the entry starts one fresh', [await station(page), await page.evaluate(() => journeyDate())], [1, DAY]);
    same('nothing went wrong on the page', errors, []);
    await context.close();
}

// ================================================================== the real day check, inside the journey

for (const [width, height] of [[440, 956], [375, 667]]) {
    // The evening he builds on was itself a working day: עבד אל-רחמן and אחמד were at
    // הרצליה. Tomorrow אחמד is placed and עבד אל-רחמן is not - the man the check exists for.
    const { page, context, errors } = await open(width, height, 'dark', { before: [[TODAY, 'w_09', 'p_01'], [TODAY, 'w_01', 'p_01']] });
    suite(`${width}x${height}: station 2 against the real day check`);
    await start(page);
    await walkTo(page, 2);
    same('the journey\'s date is the day on screen at this station - the day the check\'s names open',
        await page.evaluate(() => [journeyDate(), State.date]), [DAY, DAY]);
    const findings = await page.evaluate(() => dayCheckFindings(journeyDate()).map(one => [one.kind, one.tier, one.text.replace(/[⁦-⁩]/g, '')]));
    same('the check itself: one man forgotten since the last working day', findings.filter(one => one[1] === 'check'),
        [['forgot', 'check', 'עבד ביום שלישי 10/11 ועדיין לא נרשם: עבד אל-רחמן']]);
    same('a forgotten man shows, in the check\'s own words and under its own heading',
        [(await page.locator('#journeyCheckReal .daycheck-check .daycheck-head').allTextContents()).map(bare),
            (await page.locator('#journeyCheckReal .daycheck-check .daycheck-say').allTextContents()).map(bare),
            (await page.locator('#journeyCheckReal .daycheck-check .daycheck-man').allTextContents()).map(bare),
            await page.locator('#journeyCheckReal .daycheck-clean').count()],
        [['כדאי לבדוק'], ['עבד ביום שלישי 10/11 ועדיין לא נרשם:'], ['עבד אל-רחמן'], 0]);
    same('the journey adds the men not recorded whom the check does not name - and him not a second time',
        (await page.locator('#journeyCheck > .journey-warn').allTextContents()).map(bare), ['לא נרשמו (3): מחמוד, חאלד, נביל']);
    const said = bare(await page.locator('#journeyCheck').textContent());
    same('so every man not recorded is named on the station exactly once',
        ['עבד אל-רחמן', 'מחמוד', 'חאלד', 'נביל'].map(name => said.split(name).length - 1), [1, 1, 1, 1]);
    same('what there is to look at: the journey\'s line and the check\'s one finding',
        await page.locator('#journeyCheck').getAttribute('data-count'), '2');
    check('none of which blocks: the way onward is open', await page.locator('#journeyNext').isEnabled());
    await floors(page, 'real check: station 2 with findings');
    if (width === 440) await shot(page, 'station-2-real-check');

    // His name is a way to the day screen: one station back, with his sheet open on it.
    const record = await recordBytes(page);
    await page.locator('#journeyCheckReal .daycheck-man').tap();
    await page.waitForTimeout(300);
    const sheet = await page.evaluate(() => {
        const node = document.getElementById('assignSheet');
        const box = node.querySelector('.sheet-content').getBoundingClientRect();
        const top = document.elementFromPoint(box.left + box.width / 2, box.top + 24);
        return { open: node.style.display === 'flex', title: document.getElementById('assignSheetTitle').textContent,
            onTop: Boolean(top) && node.contains(top), panel: document.getElementById('journeyPanel').classList.contains('open') };
    });
    same('touched, his name goes to the day screen and opens HIS sheet there, in front of everything',
        [await station(page), sheet.open, sheet.onTop, sheet.panel, bare(sheet.title).includes('עבד אל-רחמן'), await page.evaluate(() => State.date)],
        [1, true, true, false, true, DAY]);
    same('which so far changed nothing', await recordBytes(page), record);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
    same('the sheet shut, the journey\'s row is in the day\'s dock', [await page.evaluate(() => document.getElementById('assignSheet').style.display), await visible(page, DOCK_ROW)], ['none', true]);

    // The day put right - by the day's own writers - and the check is calm.
    await page.evaluate(day => {
        ['w_09', 'w_10', 'w_11', 'w_12'].forEach(id => State.commit(assignPlace(State.schedule, day, id, State.layer, 'p_04')));
    }, DAY);
    await page.waitForTimeout(150);
    same('with everybody placed the counter says so', await text(page, '#journeyCount'), 'שובצו: 12 · נעדרים: 1');
    await walkTo(page, 2);
    same('a clean day: the check\'s calm line, nothing of the journey\'s above it, nothing to look at',
        [(await page.locator('#journeyCheckReal .daycheck-clean').allTextContents()).map(bare), await page.locator('#journeyCheck .journey-warn').count(),
            await page.locator('#journeyCheckReal .daycheck-check').count(), await page.locator('#journeyCheck').getAttribute('data-count'),
            await strip(page, '#journeyStripSlot')],
        [['✓ לא נמצא דבר שנראה שנשכח.'], 0, 0, '0', ['done', 'now', 'todo', 'todo', 'todo']]);
    await floors(page, 'real check: station 2, clean');
    await page.locator('#journeyNext').tap();
    await page.waitForTimeout(250);
    same('and onward is the rides', await station(page), 3);
    same('nothing went wrong on the page', errors, []);
    await context.close();
}

// ================================================================== a phone with הסעות off

for (const [width, height] of [[375, 667], [440, 956]]) {
    const { page, context, errors } = await open(width, height, 'dark', { rides: false });
    suite(`${width}x${height}: a phone that did not turn הסעות on`);
    given('הסעות is off on this phone', await page.evaluate(() => [transportEnabled(), localStorage.getItem('farkadTransport:enabled')]).then(v => v[0] === false && v[1] === null));
    await page.locator(WA_BUTTON).tap();
    same('the dialog has the seder\'s row and the journey\'s, and none for הסעות',
        await page.evaluate(() => [...document.querySelectorAll('#shareModal .modal-actions > *')].map(node => node.id).filter(id => /Entry$/.test(id))), ['sederEntry', 'journeyEntry']);
    await page.locator('#journeyEntry').tap();
    await page.waitForTimeout(150);
    same('the strip marks the third station as skipped from the start', await strip(page, '#journeyDock'), ['now', 'todo', 'skipped', 'todo', 'todo']);
    same('and says so to a screen reader', await page.locator('#journeyDock .journey-pip[data-station="3"]').getAttribute('aria-label'), 'הסעות: מדולג');
    await floors(page, 'off: station 1');
    await page.locator('#journeyNext').tap();
    await page.waitForTimeout(150);
    same('the check hands over to the last look, and says why in one sentence',
        [await text(page, '#journeyNext'), (await page.locator('#journeyBody .journey-ride-off').allTextContents()).map(bare)],
        [`המשך: ${STATIONS[3]}`, [RIDE_OFF]]);
    await floors(page, 'off: station 2');
    await page.locator('#journeyNext').tap();
    await page.waitForTimeout(150);
    same('the last look, with the sentence where the vehicles would be',
        [await station(page), await strip(page, '#journeyStripSlot'), (await page.locator('#journeyLookRides .journey-ride-off').allTextContents()).map(bare),
            await page.locator('#journeyLookRides .journey-block').count(), await page.locator('#transportPanel').evaluate(node => node.classList.contains('open'))],
        [4, ['open', 'done', 'skipped', 'now', 'todo'], [RIDE_OFF], 0, false]);
    check('the sites are still all there', await page.locator('#journeyLookSites .journey-block').count() === 4);
    await floors(page, 'off: station 4');
    await page.locator('#journeyBack').tap();
    await page.waitForTimeout(150);
    same('«חזרה» from the last look is the check', await station(page), 2);
    await walkTo(page, 5);
    same('at the sending the drivers\' group says the same sentence and offers no door and no summary',
        [(await page.locator('#journeySendDrivers .journey-ride-off').allTextContents()).map(bare), await page.locator('#journeyPanel a[href]').count(),
            await page.locator('#journeySummary').count(), await page.locator('#journeySederOpen').count(), await page.locator('#journeyDayMessage').count()],
        [[RIDE_OFF], 0, 0, 1, 1]);
    await floors(page, 'off: station 5');
    await page.locator('#journeyNext').tap();
    await page.waitForTimeout(150);
    same('the whole journey did not turn הסעות on, and wrote no key of it',
        await page.evaluate(() => [transportEnabled(), Object.keys(localStorage).filter(key => key.startsWith('farkadTransport:')).length,
            document.getElementById('transportEntry') === null, journeyStation()]), [false, 0, true, 0]);
    same('nothing went wrong on the page', errors, []);
    await context.close();
}

// ================================================================== the day changed under the plan

{
    const { page, context, errors } = await open(440, 956, 'dark');
    suite('a man changed after he was given a seat is shown, never silently repaired');
    await page.evaluate(day => {
        [['w_01', 'tv_01', 1], ['w_02', 'tv_01', 2], ['w_03', 'tv_01', 3], ['w_04', 'tv_02', 1], ['w_05', 'tv_02', 2],
            ['w_06', 'tv_02', 3], ['w_08', 'tv_03', 1], ['w_07', 'tv_03', 2]].forEach(([w, v, n]) => transportPlace(day, w, v, n));
    }, DAY);
    await start(page);
    await walkTo(page, 5);
    // The driver of the second car is opened in WhatsApp, with the plan as it stands.
    await page.evaluate(() => document.querySelector('#journeySendDrivers a[data-wa="tv_02"]')
        .addEventListener('click', event => event.preventDefault(), { capture: true }));
    await page.locator('#journeySendDrivers a[data-wa="tv_02"]').tap();
    await page.waitForTimeout(1750);
    given('the second car\'s message is marked opened', await page.locator('#journeySendDrivers [data-vehicle="tv_02"]').getAttribute('data-mark') === 'opened');
    const hrefBefore = await page.locator('#journeySendDrivers a[data-wa="tv_02"]').getAttribute('href');
    const plan = await page.evaluate(key => JSON.stringify(JSON.parse(localStorage.getItem(key)).trips), RIDES);

    // All the way back, by the journey's own steps: 5 -> 4 -> the הסעות screen -> 2 -> 1.
    await page.locator('#journeyBack').tap();
    await page.waitForTimeout(150);
    await page.locator('#journeyBack').tap();
    await page.waitForTimeout(250);
    same('back from the last look is the הסעות screen', [await station(page), await page.locator('#transportPanel').evaluate(node => node.classList.contains('open'))], [3, true]);
    await page.locator('#transportClose').tap();
    await page.waitForTimeout(200);
    await page.locator('#journeyBack').tap();
    await page.waitForTimeout(200);
    same('and back again is the day screen', [await station(page), await visible(page, DOCK_ROW)], [1, true]);

    // עלי - a passenger of the second car - is taken off חיפה by the day's own ✕, and put
    // on נתניה by the day's own picker; ראמי - a passenger of the third - is taken off his
    // site and left with none.
    const offSite = async name => {
        await tapOnDay(page, page.locator('#dayView .assign-row', { hasText: name }).locator('button.btn-icon'));
        await page.waitForTimeout(800);
    };
    await offSite('עלי');
    await tapOnDay(page, page.locator('#dayView .tray .chip-main', { hasText: 'עלי' }));
    await page.locator('#placePickerList button', { hasText: 'נתניה' }).tap();
    await page.locator('#placePickerModal button[onclick="closePlacePicker()"]').tap();
    await offSite('ראמי');
    same('the counter is the day\'s again', await text(page, '#journeyCount'), 'שובצו: 7 · לא נרשמו: 5 · נעדרים: 1');
    same('nothing touched the plan: both men are in the seats they were given',
        await page.evaluate(key => JSON.stringify(JSON.parse(localStorage.getItem(key)).trips), RIDES), plan);

    await walkTo(page, 3);
    same('the bar counts the man who sits with no site', await text(page, '#journeyRideStatus'), 'יושבים ברכב בלי אתר: 1');
    same('his seat is marked and his card says why, in the screen\'s own words',
        [await page.locator(`${seat('tv_03', 2)}.transport-seat-attn`).count(), (await page.locator('[data-car="tv_03"] .transport-card-line').allTextContents()).map(bare)],
        [1, ['ראמי משובץ ברכב אבל אין לו אתר ברישום היום']]);
    same('the man moved to another site sits where he sat', await drawn(page, 'tv_02'), 'w_04 w_05 w_06 - -');
    await page.locator('#journeyNext').tap();
    await page.waitForTimeout(250);
    same('the last look names the man with no site, above the vehicles',
        (await page.locator('#journeyLookRides .journey-warn').allTextContents()).map(bare), ['ראמי משובץ ברכב אבל אין לו אתר ברישום היום']);
    const lines = (await page.locator('#journeyLookRides .journey-block p').allTextContents()).map(bare);
    check('shows him in his seat with no site invented for him', lines.includes('- ראמי') && !lines.some(line => /ראמי –/.test(line)), lines.join(' / '));
    check('and the moved man at the site he was moved to', lines.includes('- עלי – נתניה') && !lines.includes('- עלי – חיפה'), lines.join(' / '));
    same('the strip says the rides have something left', await strip(page, '#journeyStripSlot'), ['open', 'done', 'open', 'now', 'todo']);
    await page.locator('#journeyNext').tap();
    await page.waitForTimeout(250);
    same('at the sending, the message that was opened is not the message there is now: its mark is not believed',
        [await page.locator('#journeySendDrivers [data-vehicle="tv_02"]').getAttribute('data-mark'),
            await page.locator('#journeySendDrivers [data-vehicle="tv_02"] .transport-badge').count()], ['none', 0]);
    const hrefAfter = await page.locator('#journeySendDrivers a[data-wa="tv_02"]').getAttribute('href');
    check('and the door carries the new site', hrefAfter !== hrefBefore && decodeURIComponent(hrefAfter).includes(`- ${named('עלי')} – ${named('נתניה')}`), decodeURIComponent(hrefAfter));
    same('nothing went wrong on the page', errors, []);
    await shot(page, 'changed-after-seating-station-5');
    await context.close();
}

// ================================================================== tomorrow, on a real clock

{
    const { page, context, errors } = await open(440, 956, 'dark', { at: '2026-11-10T23:58:00+02:00', seed: false });
    suite('tomorrow is tomorrow by the local calendar - across midnight');
    same('two minutes before midnight', await page.evaluate(() => [todayStr(), journeyDefaultDate(todayStr())]), [TODAY, DAY]);
    await start(page);
    same('the journey opens on tomorrow', await page.evaluate(() => [journeyDate(), State.date]), [DAY, DAY]);
    await page.clock.fastForward('05:00');
    same('five minutes later the calendar has moved and the journey has not',
        await page.evaluate(() => [todayStr(), journeyDate(), State.date, journeyStation()]), [DAY, DAY, DAY, 1]);
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(600);
    same('a reload after midnight is the same journey, for the same date - which is now today',
        await page.evaluate(() => [todayStr(), journeyDate(), State.date, journeyStation()]), [DAY, DAY, DAY, 1]);
    await page.locator('#journeyDock .journey-quiet').tap();
    await page.waitForTimeout(150);
    await page.clock.fastForward('03:10:00');
    await start(page);
    same('a new journey, started in the small hours, is for the day after', await page.evaluate(() => [todayStr(), journeyDate()]), [DAY, AFTER]);
    await walkTo(page, 2);
    await page.locator('#journeyLeave').tap();

    suite('tomorrow across both of Israel\'s clock changes, and past an empty Saturday');
    const tomorrowAt = async instant => {
        await page.clock.setSystemTime(new Date(instant));
        return page.evaluate(() => [todayStr(), journeyDefaultDate(todayStr())]);
    };
    // 2026-10-25 02:00 becomes 01:00: the night has twenty-five hours and 01:30 comes twice.
    same('the Saturday night the clocks go back', await tomorrowAt('2026-10-24T23:30:00+03:00'), ['2026-10-24', '2026-10-25']);
    same('01:30 on the long night, the first time', await tomorrowAt('2026-10-25T01:30:00+03:00'), ['2026-10-25', '2026-10-26']);
    same('and 01:30 the second time', await tomorrowAt('2026-10-25T01:30:00+02:00'), ['2026-10-25', '2026-10-26']);
    same('the last minute of that day', await tomorrowAt('2026-10-25T23:59:00+02:00'), ['2026-10-25', '2026-10-26']);
    // 2026-03-27 02:00 becomes 03:00: the night has twenty-three hours.
    same('the Thursday night before the clocks go forward', await tomorrowAt('2026-03-26T23:30:00+02:00'), ['2026-03-26', '2026-03-27']);
    same('the first minute after the hour that does not exist - a Friday: past the empty Saturday',
        await tomorrowAt('2026-03-27T03:00:00+03:00'), ['2026-03-27', '2026-03-29']);
    // The day's own rule for a Saturday (stepDay, js/ui/day.js), asked of the real day screen.
    same('a Friday evening builds for Sunday', await tomorrowAt('2026-11-13T19:00:00+02:00'), ['2026-11-13', '2026-11-15']);
    same('a Saturday evening builds for Sunday too', await tomorrowAt('2026-11-14T19:00:00+02:00'), ['2026-11-14', '2026-11-15']);
    await page.evaluate(() => { State.commit(assignPlace(State.schedule, '2026-11-14', 'w_01', 'actual', 'p_01')); });
    same('a Saturday that already holds work is opened, as the day\'s arrows open it',
        await tomorrowAt('2026-11-13T19:00:00+02:00'), ['2026-11-13', '2026-11-14']);
    same('the end of a year', await tomorrowAt('2026-12-31T22:00:00+02:00'), ['2026-12-31', '2027-01-01']);
    same('nothing went wrong on the page', errors, []);
    await context.close();
}

// ================================================================== text at twice its size

for (const [width, height] of [[440, 956], [375, 667]]) {
    const { page, context, errors } = await open(width, height, 'dark');
    suite(`${width}x${height}: every station with the text at 200%`);
    await page.evaluate(day => {
        [['w_01', 'tv_01', 1], ['w_02', 'tv_01', 2], ['w_04', 'tv_02', 2]].forEach(([w, v, n]) => transportPlace(day, w, v, n));
    }, DAY);
    await start(page);
    given('the cascade was doubled', await doubleEveryFontSize(page) > 100);
    await page.evaluate(() => render());
    await page.waitForTimeout(300);
    for (const n of [1, 2, 3, 4, 5]) {
        await walkTo(page, n);
        await page.waitForTimeout(250);
        given(`station ${n} at 200%`, await station(page) === n);
        await floors(page, `200% station ${n}`);
        if (n === 1) {
            const dock = await page.evaluate(() => {
                const node = document.querySelector('.day-actions');
                return { height: Math.round(node.getBoundingClientRect().height),
                    published: Math.round(parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--day-actions-h'))) };
            });
            same('the dock is measured as it stands, whatever its words came to', dock.published, dock.height);
        }
        if (n !== 1 && n !== 3) {
            const fits = await page.evaluate(() => {
                const body = document.getElementById('journeyBody');
                const foot = document.getElementById('journeyFoot').getBoundingClientRect();
                return { room: body.clientHeight, foot: foot.bottom <= window.innerHeight + 0.5 };
            });
            check(`station ${n}: the list keeps room above a foot that stays on the glass`, fits.room >= 120 && fits.foot, JSON.stringify(fits));
        }
    }
    // The keyboard: the journey has no field of its own, and its row leaves with the day's
    // dock when the day's own field brings the keys up (css/app.css, body.kbd-open).
    await page.locator('#journeyNext').tap();
    await page.waitForTimeout(150);
    await start(page);
    given('a new journey is at the day screen', await station(page) === 1);
    await page.evaluate(() => document.body.classList.add('kbd-open'));
    same('with the keys up the row is away with the dock it rides in', await visible(page, DOCK_ROW), false);
    await page.evaluate(() => document.body.classList.remove('kbd-open'));
    same('and back with it', await visible(page, DOCK_ROW), true);
    same('nothing went wrong on the page', errors, []);
    await context.close();
}

await browser.close();
await server.close();
report();
