// «הכל חופש» made safe, in a real Chromium with emulated touch.
//
//   node tests/holiday.browser.mjs
//
// The owner, 2026-11-11: "the place of «כולם בחופש» is dangerous, it can be pressed by
// mistake; and if possible, after I press it, let it ask me whether I am sure that all of
// them are on holiday." tests/holiday.test.mjs holds the record on devices in Node; this holds
// the glass:
//
//   THE PLACE. Measured on v190 (c33461b) before this was written, at 320, 375 and 440: the
//   button stood on the header's switch line 4px from the date (the date picker), 5px from
//   the count (the next man's sheet), 6px from the fold's button and 8px from «לפי אתרים».
//   Its first move put it at the end of the day, and its verifier (9281f87) swept the days:
//   at the end of a day it stands wherever the day's length puts it - as the day opens, on
//   the dock's edge on some lengths of every phone (0px from «מהיום הקודם»), and sideways 15px
//   from the last man's row. NOW IT IS ON NO SCREEN. The foot of the day ends with «עוד ⋯»
//   (the crew rows' own words), which writes nothing, and opens the day's menu: «הכל חופש» and
//   «סגור», a finger's width apart, held for DOUBLE_TAP_GUARD_MS, «הכל חופש» kept 48px from the
//   finger that opened it; «הכל חופש» goes straight on to the question. THE SWEEP, permanent:
//   every day of 1-16 men on 1-4 sites in both views, at 320x568, 375x667, 440x956, 667x375
//   and 568x320, the large display off and on, both schemes, as the day opens and scrolled to
//   its end - no control on the day reads «הכל חופש», and «עוד ⋯» is reached at the end of
//   every day, whole above the dock; and the menu, opened by a real tap on «עוד ⋯» at the top
//   and at the end of short and long days, holds «הכל חופש» 48px and more from every target a
//   finger can reach and from the finger, whole on the glass, held at first. «עוד ⋯» is where
//   the first move put the button: the last thing in the day, ending the foot row of «חיפוש
//   עובד» and «בדיקת היום», on a line of its own at the row's far end; the foot rule of
//   tests/mobile.test.mjs at the heights that suite uses still holds (under 500px of height it
//   shares the foot's own line). With no site at all, it stands under the setup card.
//
//   THE END OF EVERY DAY. Every day reaches its end. On the first move's first build (0cfee8b)
//   a day that ended 72 to about 110px below the glass could not: the header's collapse took
//   97px out of the page under the scroll and the header opened again, and the foot stayed
//   half under the dock. Forty-two days per phone, by the page and by a finger, at 320, 375,
//   440 and 440 at twice the text size. Before the day is scrolled, the foot of a short day can
//   stand across the dock's edge, as any last row does: a double tap there only opens the menu.
//
//   NOTHING LEAKS. The page's floor that every day reaches its end on is the DAY's: after a
//   day dragged to its end, a real tap on each tab opens that screen where v192 opens it -
//   the window's scroll or that screen's own end, the page not a pixel taller for the day's
//   class, a screen shorter than the glass at its top (its first build put the floor on <body>,
//   and every short screen opened 72px down) - at both of the verifier's phones, both schemes,
//   the large display off and on. (v194: round two's «every tab opens at its top» is taken
//   back - tests/scroll.browser.mjs 10b, v166's decision, stands.)
//
//   THE QUESTION. A real tap - through the menu - opens it: «בטוח שכולם בחופש?» and the day on a line of its own,
//   how many and that it is a day off without pay, every man it will mark by name in a list
//   that scrolls inside the dialog when it is long (thirty men: the answers still on the
//   glass), what is kept; «כן, כולם בחופש» the destructive kind, at 4.5:1 and more in both
//   schemes; «ביטול» focused; the confirming button 48px and more from where the finger was.
//   At twice the text size - the cascade doubled before the tap - it is taller than a 320 or
//   a 375 and opens AT ITS TOP, the question, the day and the count on the glass (0cfee8b
//   opened it 395-514px down, on «ביטול»), and a scroll that starts on the names reaches the
//   answers.
//
//   A DOUBLE TAP NEVER CONFIRMS. A real double tap on «עוד ⋯» leaves the menu open, held; a
//   real double tap on the menu's «הכל חופש» leaves the question open and nobody marked;
//   inside DOUBLE_TAP_GUARD_MS of its opening a tap on the confirming button, on «ביטול»,
//   beside the dialog, and Escape, all do nothing; after it, a tap where the finger was
//   confirms nothing.
//
//   AFTER IT. The undo bar says «חופש נרשם ל-8 עובדים»; ↶ pressed with a finger gives every
//   man his own day back - a day that existed byte for byte, a man who had none the empty
//   placeholder (tests/holiday.test.mjs says why) - and the day reads as it read before.
//   And the record of a confirmed holiday is v190's: the same crew on a second page, v190's
//   own markAllHoliday out of Git, the same days and the same operations queued.
//
//   A question that does not ask for any of this - every other question in the app - is
//   exactly what it was: no list, an ordinary button, pressed at once.
//
// NOT a real phone: Chromium's layout and emulated touch. Synthetic names throughout.

import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';
import { serve } from './serve.mjs';
import { launchLocalBrowser } from './network-guard.mjs';
import { verifyServedAssets, expectedShaFor } from './treecheck.mjs';
import { suite, check, same, given, report } from './runner.mjs';
import { censusOnly } from './census.mjs';

const root = new URL('..', import.meta.url).pathname;
const server = await serve(root);
check('the browser is served the named tree',
    (await verifyServedAssets(server.url, root, expectedShaFor(root))).ok);
const browser = await launchLocalBrowser(chromium, { executablePath: process.env.CHROME_PATH });
const errors = [];

// v190's own markAllHoliday, out of Git, for the record a confirmed holiday leaves.
const V190 = 'c33461b';
const GIT_ENV = Object.fromEntries(Object.entries(process.env).filter(([name]) => !/^GIT_/i.test(name)));
let V190_HOLIDAY = '';
try {
    const day = execFileSync('git', ['-C', root, 'show', `${V190}:js/ui/day.js`],
        { encoding: 'utf8', env: GIT_ENV, maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
    const at = day.indexOf('async function markAllHoliday() {');
    const end = day.indexOf('\n}\n', at);
    if (at !== -1 && end !== -1) V190_HOLIDAY = day.slice(at, end + 2);
} catch (error) { V190_HOLIDAY = ''; }

const TODAY = '2026-11-11';
const bare = text => String(text === null || text === undefined ? '' : text).replace(/[⁦-⁩‎]/g, '');

// The pinned words (tests/holiday.test.mjs pins them all; these are the ones read off the glass).
const TITLE = 'בטוח שכולם בחופש?\nיום רביעי 11/11/2026';
const MESSAGE = count => `ל-${count} העובדים בלי רישום יירשם יום חופש ללא שכר:`;
const OK = 'כן, כולם בחופש';
const KEPT = 'עבודה, היעדרויות וחשבונות סגורים יישמרו.';
const UNDO = count => `חופש נרשם ל-${count} עובדים`;
const ENTRY = 'הכל חופש';
const ENTRY_LABEL = 'רשום חופש לעובדים בלי רישום ביום הנבחר';
// Round two: the foot's door and its menu (the crew screen's own words; the label PROPOSED).
const MORE = 'עוד ⋯';
const MORE_LABEL = 'אפשרויות עבור יום רביעי 11/11/2026';
const MENU_TITLE = 'יום רביעי 11/11/2026';
const CLOSE = 'סגור';

const NAMES = ['אחמד', 'מוחמד עבד אל רחמן', 'יוסי', 'ח\'אלד', 'סאלח', 'נאסר', 'עודי', 'זיאד', 'מאהר', 'רגא',
    'עלי', 'כרם', 'סמיר', 'ג\'מאל', 'פאדי', 'האני', 'וליד', 'בשאר', 'תאמר', 'ראמי', 'שאדי', 'מוסא', 'עיסא', 'יונס',
    'אנואר', 'נביל', 'ג\'אבר', 'סלים', 'רפיק', 'כמאל'];

// A phone on Wednesday. The crew: w_01 and w_02 on sites, w_03 נעדר, w_04 put on a site and
// taken off again (an empty record with its rate stamp), w_12 no longer active; everyone
// else with nothing - with twelve men, w_04 to w_11 are the eight the question names.
async function phone(width, height, scheme = 'light', { crew = 12, sites = 4, mode = 'sites', inset = 0 } = {}) {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2,
        isMobile: true, hasTouch: true, colorScheme: scheme, serviceWorkers: 'block' });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(server.url);
    await page.waitForFunction(() => typeof markAllHoliday === 'function' && typeof State === 'object'
        && typeof askConfirm === 'function');
    await page.evaluate(([today, names, crew, sites, mode, inset]) => {
        todayStr = () => today;
        State.schedule.workers = names.slice(0, crew).map((name, at) => ({ id: `w_${String(at + 1).padStart(2, '0')}`,
            name, active: at !== 11, dailyRate: 400 + at }));
        State.schedule.places = ['הרצליה', 'חיפה', 'פרדסיה', 'אשדוד'].slice(0, sites).map((name, at) =>
            ({ id: `p_0${at + 1}`, name, active: true }));
        State.commitRoster();
        State.date = today;
        if (sites > 0) {
            State.commit(assignPlace(State.schedule, today, 'w_01', 'actual', 'p_01'));
            State.commit(assignPlace(State.schedule, today, 'w_02', 'actual', sites > 1 ? 'p_02' : 'p_01'));
            State.commit(assignPlace(State.schedule, today, 'w_04', 'actual', 'p_01'));
            State.commit(unassignPlace(State.schedule, today, 'w_04', 'actual', 'p_01'));
        }
        State.commit(markAbsent(State.schedule, today, 'w_03', 'actual'));
        hideUndo();
        if (inset) document.documentElement.style.setProperty('--safe-bottom', inset + 'px');
        showView('day');
        if (sites > 0) setDayMode(mode);
        render();
        const banner = document.getElementById('accountBanner');
        const putAway = banner && banner.style.display !== 'none' && banner.querySelector(':scope > .btn-icon');
        if (putAway) putAway.click();
        if (typeof scheduleBarMeasure === 'function') scheduleBarMeasure();
    }, [TODAY, NAMES, crew, sites, mode, inset]);
    await page.waitForTimeout(300);
    return page;
}

const toEnd = async page => {
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(250);
};
// Without the service worker's census of open builds (tests/census.mjs says why).
const disk = page => page.evaluate(() => JSON.stringify(Object.keys(localStorage).sort()
    .filter(key => key !== 'farkad:openBuilds').map(key => [key, localStorage.getItem(key)])));
const isOpen = page => page.evaluate(() => document.getElementById('askModal').style.display === 'flex');
const marked = page => page.evaluate(day => State.schedule.workers
    .filter(worker => isAbsent(State.schedule, day, worker.id, 'actual')).map(worker => worker.id), TODAY);
const records = page => page.evaluate(day => Object.fromEntries(State.schedule.workers.map(worker => {
    const record = workerDay(State.schedule, day, worker.id, 'actual');
    return [worker.id, record ? JSON.stringify(record) : null];
})), TODAY);
const entryBox = page => page.locator('#dayMoreEntry').boundingBox();
const centre = box => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 });
// What the MENU was the moment it opened, written down by an observer then (the dialog goes
// from shut to shown), not read a round trip later - a busy machine would read the hold over.
const watchMenu = page => page.evaluate(() => {
    window.__menu = null;
    const modal = document.getElementById('askModal');
    const seen = new MutationObserver(() => {
        if (modal.style.display !== 'flex' || window.__menu) return;
        const answers = [...document.querySelectorAll('#askChoices button')];
        window.__menu = { title: document.getElementById('askTitle').textContent, answers: answers.map(node => node.textContent),
            disabled: answers.map(node => node.disabled), focus: document.activeElement && document.activeElement.textContent };
        seen.disconnect();
    });
    seen.observe(modal, { attributes: true, attributeFilter: ['style'] });
});
// And what the QUESTION was the moment it opened. It opens in the same dialog, never shut
// between the two (askChoice's `next`), so what is watched is its title being written.
const watchQuestion = page => page.evaluate(() => {
    window.__opened = null;
    const title = document.getElementById('askTitle');
    const ok = document.getElementById('askOk');
    const seen = new MutationObserver(() => {
        if (window.__opened || !title.textContent.startsWith('בטוח שכולם בחופש?')) return;
        window.__opened = { disabled: ok.disabled, focus: document.activeElement && document.activeElement.id,
            shown: document.getElementById('askModal').style.display };
        seen.disconnect();
    });
    seen.observe(title, { childList: true, characterData: true, subtree: true });
});
// The menu opened by a finger on «עוד ⋯» where it stands now; the point it was.
async function openMenuByTap(page) {
    await watchMenu(page);
    const at = centre(await entryBox(page));
    await page.touchscreen.tap(at.x, at.y);
    await page.waitForTimeout(60);
    return at;
}
// Until the menu's hold is over («הכל חופש» can be pressed).
const menuHoldOver = page => page.waitForFunction(() => {
    const first = document.querySelector('#askChoices button');
    return Boolean(first) && !first.disabled;
}, null, { timeout: 5000 });
// The menu's «הכל חופש», wherever askChoiceAway arranged it: the first answer in the document.
const menuHolidayBox = page => page.locator('#askChoices button').first().boundingBox();
// The question opened the way a finger opens it now: the day scrolled to its end, «עוד ⋯»
// tapped, the menu's hold waited out, «הכל חופש» tapped. Answers the point of that last tap -
// the finger the question's confirming button is kept from.
async function openByTap(page) {
    await toEnd(page);
    await openMenuByTap(page);
    await menuHoldOver(page);
    await watchQuestion(page);
    const at = centre(await menuHolidayBox(page));
    await page.touchscreen.tap(at.x, at.y);
    await page.waitForTimeout(60);
    return at;
}
// Until the hold is over (the confirming button can be pressed again).
const holdOver = page => page.waitForFunction(() => !document.getElementById('askOk').disabled, null, { timeout: 5000 });

// THE SWEEP'S DAY, drawn and read in the page in one go: the crew, the sites and the view, nobody
// recorded; as the day opens (the page at its top) and scrolled to its end. Is any control
// outside a dialog «הכל חופש» - its words, or v116's accessible name? Where is «עוד ⋯», can a
// finger reach it, and what is it near?
const SWEEP_DAY = async ([today, names, crew, sites, mode]) => {
    const frames = () => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
    todayStr = () => today;
    State.schedule.workers = names.slice(0, crew).map((name, at) => ({ id: `w_${String(at + 1).padStart(2, '0')}`,
        name, active: true, dailyRate: 400 }));
    State.schedule.places = ['הרצליה', 'חיפה', 'פרדסיה', 'אשדוד'].slice(0, sites).map((name, at) =>
        ({ id: `p_0${at + 1}`, name, active: true }));
    State.commitRoster();
    State.date = today;
    hideUndo();
    showView('day');
    setDayMode(mode);
    render();
    const banner = document.getElementById('accountBanner');
    const putAway = banner && banner.style.display !== 'none' && banner.querySelector(':scope > .btn-icon');
    if (putAway) putAway.click();
    window.scrollTo(0, 0);
    await frames();
    const read = () => {
        const holiday = [...document.querySelectorAll('button, [role="button"], a[href], summary')]
            .filter(node => !node.closest('.modal') && (node.textContent.includes('הכל חופש')
                || node.getAttribute('aria-label') === 'רשום חופש לעובדים בלי רישום ביום הנבחר'));
        const more = document.getElementById('dayMoreEntry');
        const box = more ? more.getBoundingClientRect() : null;
        const dock = document.querySelector('.day-actions').getBoundingClientRect();
        const hit = box ? document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2) : null;
        return { holiday: holiday.map(node => node.id || node.textContent.trim().slice(0, 20)),
            old: Boolean(document.getElementById('dayHolidayEntry')), more: Boolean(more),
            top: box ? Math.round(box.top) : null, bottom: box ? Math.round(box.bottom) : null, dock: Math.round(dock.top),
            glass: Boolean(box) && box.bottom > 0 && box.top < innerHeight,
            reach: Boolean(hit) && (hit === more || more.contains(hit)),
            y: Math.round(scrollY), end: document.documentElement.scrollHeight - innerHeight,
            compact: document.body.classList.contains('day-compact') };
    };
    const top = read();
    // THE BARS ARE ASKED AGAIN AT EVERY TURN, BECAUSE THE PAGE ASKS THEM AGAIN BY A TIMER. The
    // tab bar drops its words on a day the screen cannot hold (body.day-tight, fitDayList in
    // js/ui/bars.js), decided when the bars are measured: after a render, and once more 640 ms
    // after the app started or the viewport was last stirred (stirViewport) - not when the
    // header compacts. On a day the compact header makes room for (667x375, four men by worker:
    // the one found), that later measurement gives the words back, the tab bar is 4px taller (59
    // to 63) and the page 13px longer (its end 168, then 181). This sweep reaches its fourth day
    // about 640 ms into each fresh page, so the timer fired in the middle of that day: when it
    // fell between the last scroll and the read, the page read 13px short of an end that had
    // just moved (y 168, end 181 - once in a whole run of the suite on this build; on the first
    // candidate, 01c2a3b, with nothing but its own sweep, 35 of 60 fresh pages in a probe that
    // ran the first four days alone). So each turn asks for that measurement itself and then
    // waits for it: the day read is the day as it comes to rest (0 of 60 on the same probe, and
    // nothing moved 900 ms later), and the timer finds nothing to change. What the app does is
    // unchanged and said in docs/releases.md (v194): such a day, scrolled to its end by hand in
    // the first 640 ms, grows 13px under the window when the measurement comes.
    for (let turn = 0; turn < 4; turn++) {
        window.scrollTo(0, document.documentElement.scrollHeight);
        if (typeof scheduleBarMeasure === 'function') scheduleBarMeasure();
        await frames();
    }
    const end = read();
    return { top, end };
};

// THE MENU, as it stands the moment after a finger opened it: its words, its answers, and
// «הכל חופש» against every target a finger can reach while it is up (a 4px grid of the page's
// own hit test over each, so a control behind the backdrop counts for nothing) and against the
// finger. `x, y` is where the finger was.
const MENU_SURVEY = ([x, y]) => {
    const modal = document.getElementById('askModal');
    const answers = [...document.querySelectorAll('#askChoices button')];
    const holiday = answers.find(node => node.textContent === 'הכל חופש');
    if (!holiday) return { open: modal.style.display, answers: answers.map(node => node.textContent) };
    const vw = innerWidth;
    const vh = innerHeight;
    const reach = node => {
        const b = node.getBoundingClientRect();
        const x0 = Math.max(0, b.left), x1 = Math.min(vw, b.right), y0 = Math.max(0, b.top), y1 = Math.min(vh, b.bottom);
        if (x1 - x0 < 1 || y1 - y0 < 1) return null;
        let found = null;
        for (let py = y0 + 0.5; py < y1; py += 4) for (let px = x0 + 0.5; px < x1; px += 4) {
            const hit = document.elementFromPoint(px, py);
            if (!hit || !(hit === node || node.contains(hit))) continue;
            found = found || { left: px, right: px, top: py, bottom: py };
            found.left = Math.min(found.left, px); found.right = Math.max(found.right, px);
            found.top = Math.min(found.top, py); found.bottom = Math.max(found.bottom, py);
        }
        return found ? { left: found.left - 0.5, right: found.right + 0.5, top: found.top - 0.5, bottom: found.bottom + 0.5 } : null;
    };
    const gap = (a, b) => Math.hypot(Math.max(0, Math.max(a.left, b.left) - Math.min(a.right, b.right)),
        Math.max(0, Math.max(a.top, b.top) - Math.min(a.bottom, b.bottom)));
    const box = holiday.getBoundingClientRect();
    const others = [...document.querySelectorAll('button, input, select, textarea, a[href], [role="button"], summary')]
        .filter(node => node !== holiday && !holiday.contains(node) && node.getClientRects().length > 0)
        .map(node => ({ node, at: reach(node) })).filter(item => item.at)
        .map(item => ({ name: item.node.id || item.node.textContent.trim().slice(0, 20), gap: Math.round(gap(box, item.at)) }))
        .sort((a, b) => a.gap - b.gap);
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    return {
        open: modal.style.display, title: document.getElementById('askTitle').textContent,
        answers: answers.map(node => node.textContent), aria: holiday.getAttribute('aria-label'),
        reachable: others.map(item => item.name), nearest: others.length ? others[0] : null,
        finger: Math.round(Math.hypot(Math.max(box.left - x, 0, x - box.right), Math.max(box.top - y, 0, y - box.bottom))),
        whole: box.top >= 0 && box.bottom <= vh && box.left >= 0 && box.right <= vw,
        hit: Boolean(hit) && (hit === holiday || holiday.contains(hit)),
        w: Math.round(box.width), h: Math.round(box.height), font: parseFloat(getComputedStyle(holiday).fontSize),
        cut: holiday.scrollWidth > holiday.clientWidth + 1
    };
};

// Twice the text size, the way tests/mobile.test.mjs makes it (doubleEveryFontSize, and the
// long comment over it says why nothing less is the real thing): every font-size rule of
// every stylesheet re-emitted at twice its value, !important, in one <style> appended last -
// so a node drawn AFTER it, the question included, is drawn doubled. Done BEFORE the tap: the
// first build of this suite doubled the dialog's own nodes after it had opened and focused at
// the ordinary size, and missed that at twice the size it opened scrolled down past its
// question (the verifier, on 0cfee8b: 421-514px down at 320x568, 395 at 375x667).
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

// A day of a given length on a page that is already open: the crew, the sites and the view
// put under it, nobody recorded (the day «הכל חופש» is for), and the page at its top. Answers
// how far below the glass the day ends with the header full - its natural end.
const dayOfLength = (page, crew, sites, mode) => page.evaluate(async ([today, names, crew, sites, mode]) => {
    todayStr = () => today;
    State.schedule.workers = names.slice(0, crew).map((name, at) => ({ id: `w_${String(at + 1).padStart(2, '0')}`,
        name, active: true, dailyRate: 400 }));
    State.schedule.places = ['הרצליה', 'חיפה', 'פרדסיה', 'אשדוד'].slice(0, sites).map((name, at) =>
        ({ id: `p_0${at + 1}`, name, active: true }));
    State.commitRoster();
    State.date = today;
    hideUndo();
    showView('day');
    setDayMode(mode);
    render();
    const banner = document.getElementById('accountBanner');
    const putAway = banner && banner.style.display !== 'none' && banner.querySelector(':scope > .btn-icon');
    if (putAway) putAway.click();
    if (typeof scheduleBarMeasure === 'function') scheduleBarMeasure();
    window.scrollTo(0, 0);
    await new Promise(done => setTimeout(done, 220));
    return { end: document.documentElement.scrollHeight - document.documentElement.clientHeight,
        full: !document.body.classList.contains('day-compact') };
}, [TODAY, NAMES, crew, sites, mode]);

// A finger: drags up the middle of the screen through the browser's own touch input, until
// the page stops at its end (or six strokes). Answers where it stopped.
async function fingerToEnd(page, cdp, width, height) {
    for (let stroke = 0; stroke < 6; stroke++) {
        const at = await page.evaluate(() => [Math.round(scrollY), document.documentElement.scrollHeight - innerHeight]);
        if (stroke > 0 && at[0] >= at[1] - 1) break;
        const x = Math.round(width / 2);
        let y = Math.round(height * 0.75);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
        for (let step = 0; step < 12; step++) {
            y -= Math.round(height * 0.045);
            await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] });
            await page.waitForTimeout(16);
        }
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await page.waitForTimeout(420);
    }
    return page.evaluate(() => ({ y: Math.round(scrollY), end: document.documentElement.scrollHeight - innerHeight,
        compact: document.body.classList.contains('day-compact') }));
}

// Where the page rests and what is near «עוד ⋯» there.
const AT_REST = () => {
    const entry = document.getElementById('dayMoreEntry');
    const box = entry.getBoundingClientRect();
    const dock = document.querySelector('.day-actions').getBoundingClientRect();
    const gap = (a, b) => Math.hypot(Math.max(0, Math.max(a.left, b.left) - Math.min(a.right, b.right)),
        Math.max(0, Math.max(a.top, b.top) - Math.min(a.bottom, b.bottom)));
    const near = [...document.querySelectorAll('button, input, select, textarea, a[href], [role="button"], summary')]
        .filter(node => node !== entry && node.checkVisibility() && !node.closest('.modal') && node.getAttribute('aria-hidden') !== 'true')
        .map(node => ({ id: node.id, name: node.id || (node.getAttribute('aria-label') || node.textContent || '').trim().slice(0, 20),
            at: node.getBoundingClientRect() }))
        .filter(item => item.at.width > 0 && item.at.height > 0 && item.at.bottom > 0 && item.at.top < innerHeight)
        .map(item => ({ id: item.id, name: item.name, gap: Math.round(gap(box, item.at)) }));
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    const others = near.filter(item => item.id !== 'findEntry' && item.id !== 'dayCheckEntry').sort((a, b) => a.gap - b.gap);
    return {
        y: Math.round(scrollY), end: document.documentElement.scrollHeight - document.documentElement.clientHeight,
        compact: document.body.classList.contains('day-compact'),
        hit: Boolean(hit) && (hit === entry || entry.contains(hit)), dock: Math.round(dock.top - box.bottom),
        others: others.length ? others[0].gap : Infinity, nearest: others.slice(0, 2).map(item => `${item.name}:${item.gap}`),
        footTwo: Math.min(...near.filter(item => item.id === 'findEntry' || item.id === 'dayCheckEntry').map(item => item.gap))
    };
};

// What is near «עוד ⋯», on the glass, where it rests. Every control a finger can land
// on, the fixed bars included, that is on the screen at all.
const SURVEY = () => {
    const entry = document.getElementById('dayMoreEntry');
    const box = entry.getBoundingClientRect();
    const gap = (a, b) => Math.hypot(Math.max(0, Math.max(a.left, b.left) - Math.min(a.right, b.right)),
        Math.max(0, Math.max(a.top, b.top) - Math.min(a.bottom, b.bottom)));
    const named = node => node.id || (node.getAttribute('aria-label') || node.textContent || '').trim().slice(0, 20)
        || String(node.className).slice(0, 20);
    const controls = [...document.querySelectorAll('button, input, select, textarea, a[href], [role="button"], summary')]
        .filter(node => node !== entry && !entry.contains(node) && node.checkVisibility()
            && !node.closest('.modal') && node.getAttribute('aria-hidden') !== 'true')
        .map(node => ({ node, at: node.getBoundingClientRect() }))
        .filter(item => item.at.width > 0 && item.at.height > 0 && item.at.bottom > 0 && item.at.top < innerHeight)
        .map(item => ({ name: named(item.node), id: item.node.id, gap: Math.round(gap(box, item.at)),
            overlaps: !(item.at.right <= box.left || item.at.left >= box.right || item.at.bottom <= box.top || item.at.top >= box.bottom) }))
        .sort((a, b) => a.gap - b.gap);
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    const foot = entry.parentElement;
    const find = document.getElementById('findEntry').getBoundingClientRect();
    const check = document.getElementById('dayCheckEntry').getBoundingClientRect();
    const dock = document.querySelector('.day-actions').getBoundingClientRect();
    const header = document.querySelector('#dayView .day-header');
    const list = document.getElementById('dayView').getBoundingClientRect();
    return {
        w: Math.round(box.width), h: Math.round(box.height), font: parseFloat(getComputedStyle(entry).fontSize),
        text: entry.textContent, label: entry.getAttribute('aria-label'),
        hit: Boolean(hit) && (hit === entry || entry.contains(hit)),
        overlapping: controls.filter(item => item.overlaps).map(item => item.name),
        nearest: controls.slice(0, 4).map(item => `${item.name}:${item.gap}`),
        others: Math.min(...controls.filter(item => item.id !== 'findEntry' && item.id !== 'dayCheckEntry').map(item => item.gap)),
        footTwo: Math.min(...controls.filter(item => item.id === 'findEntry' || item.id === 'dayCheckEntry').map(item => item.gap)),
        below: Math.round(box.top - Math.max(find.bottom, check.bottom)),
        ownLine: box.top >= Math.max(find.bottom, check.bottom) + 23.5,
        sameLine: Math.abs(box.top - check.top) <= 1 && Math.abs(box.top - find.top) <= 1,
        atEnd: Math.abs(box.left - list.left) <= 1.5,
        narrow: box.width < list.width / 2,
        aboveDock: box.bottom <= dock.top + 1,
        inHeader: header.contains(entry), inDock: document.querySelector('.day-actions').contains(entry),
        lastInDay: document.getElementById('dayView').lastElementChild === foot && foot.lastElementChild === entry,
        order: [...foot.children].map(node => node.id),
        sideways: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
    };
};

try {
    // ============================================================== the place
    //
    // «עוד ⋯» stands where the first move put «הכל חופש» (css/design.css): the last thing in the
    // day, ending the foot row, on a line of its own at the row's far end. It writes nothing;
    // what is held of it here is that it is there to be found and that nothing on the day
    // says «הכל חופש» any more. Where «הכל חופש» itself stands - in the menu - is the sweep's.
    for (const [width, height, scheme] of [[320, 568, 'light'], [375, 667, 'dark'], [440, 956, 'light'], [440, 956, 'dark']]) {
        for (const mode of ['sites', 'workers']) {
            const tag = `${width}x${height} ${scheme}, ${mode === 'sites' ? 'by site' : 'by worker'}`;
            suite(`the place - ${tag}`);
            const page = await phone(width, height, scheme, { mode });
            const header = await page.evaluate(() => [...document.querySelectorAll('#dayView .day-header button')]
                .filter(node => node.checkVisibility()).map(node => node.getAttribute('aria-label') || node.textContent.trim()));
            check(`${tag}: the header, full at the top of the day, has no «הכל חופש» and no «עוד ⋯»`,
                header.length >= 8 && !header.includes(ENTRY_LABEL) && !header.includes(ENTRY) && !header.includes(MORE_LABEL), JSON.stringify(header));
            await toEnd(page);
            const at = await page.evaluate(SURVEY);
            same(`${tag}: one worded button, «עוד ⋯», named for the day, and it opens a dialog`,
                [at.text, at.label, await page.locator('#dayMoreEntry').getAttribute('aria-haspopup')], [MORE, MORE_LABEL, 'dialog']);
            same(`${tag}: and no control on the day says «הכל חופש» - not its words, not v116's accessible name`,
                await page.evaluate(([entry, label]) => [...document.querySelectorAll('button, [role="button"], a[href], summary')]
                    .filter(node => !node.closest('.modal') && (node.textContent.includes(entry) || node.getAttribute('aria-label') === label))
                    .map(node => node.id || node.textContent.trim()), [ENTRY, ENTRY_LABEL]), []);
            check(`${tag}: the last thing in the day, ending the row of «חיפוש עובד» and «בדיקת היום»; not on the header, not on the dock`,
                at.lastInDay && !at.inHeader && !at.inDock
                && JSON.stringify(at.order) === JSON.stringify(['findEntry', 'dayCheckEntry', 'dayMoreEntry']), JSON.stringify(at));
            // 580px tall and less (320x568): no break and its margins - the row's own wrap, 8px
            // under the two - because they cost the last man his place (the foot rule, below).
            const near = height <= 580 ? 8 : 24;
            check(`${tag}: under those two - ${near}px and more - at the row's far end, and no wider than half of it`,
                (height <= 580 ? at.below >= 7.5 && !at.sameLine : at.ownLine) && at.atEnd && at.narrow, JSON.stringify(at));
            check(`${tag}: where it rests, nothing overlaps it, a tap at its centre reaches it, and it stands whole above the dock`,
                at.overlapping.length === 0 && at.hit && at.aboveDock, JSON.stringify(at));
            check(`${tag}: ${near}px and more from «חיפוש עובד» and «בדיקת היום»`, at.footTwo >= near, JSON.stringify(at.nearest));
            check(`${tag}: 48px high, wider than 44, words of 16px, and the day does not scroll sideways`,
                at.h >= 48 && at.w >= 44 && at.font >= 16 && !at.sideways, JSON.stringify(at));
            await page.context().close();
        }
    }

    // Where the whole day is barely longer than the glass, the end of the day is reached with
    // the header still full: «עוד ⋯» is reached there too, whole above the dock.
    suite('a small crew: the end of the day reached with the header still full');
    for (const [width, height, scheme] of [[440, 956, 'light'], [440, 956, 'dark']]) {
        const page = await phone(width, height, scheme, { crew: 3, sites: 1 });
        await toEnd(page);
        const full = await page.evaluate(() => !document.body.classList.contains('day-compact')
            && [...document.querySelectorAll('#dayView .mode-toggle button')].every(node => node.checkVisibility()));
        given(`${width}x${height} ${scheme}: the header is full at the end of this day`, full);
        const at = await page.evaluate(SURVEY);
        check(`${width}x${height} ${scheme}: nothing overlaps «עוד ⋯», a tap at its centre reaches it, whole above the dock`,
            at.overlapping.length === 0 && at.hit && at.aboveDock, JSON.stringify(at.nearest));
        await page.context().close();
    }

    // ============================================================== the end of every day
    //
    // Every length of day, scrolled to its end - by the page, and by a finger - rests at its
    // end, and «עוד ⋯» rests where the place above says it does. The header's collapse takes
    // 97px out of the page (107-190 at twice the text size) and its two thresholds are 60px
    // apart (js/ui/day.js). On v190, a day that ended 72 to about 110px below the glass could
    // not be scrolled to its end: the header compacted, the page lost the 97px under the
    // scroll, the browser pulled it back to 0-11 and the header opened again - three times in
    // one drag - and the foot stayed behind the dock: «בדיקת היום» 17px under it at 440 on 2
    // sites and 5 men, and on the first build of this place «הכל חופש» half under it, 0px from
    // «מהיום הקודם» (the verifier's sweep of 0cfee8b: 18 such days at 440x956, 12 at 375x667, 12
    // at 320x568). The sections above measured a long day and one short one, neither of them
    // in that band. Here one page per phone, and the crew, the sites and the view changed
    // under it: every day from one man on one site to ten men on three, both views.
    // Twice the text size at 440, where days still fall in the band: on a 375 the doubled chrome
    // alone puts the end of every day further down than the band reaches.
    for (const [width, height, doubled] of [[320, 568, false], [375, 667, false], [440, 956, false], [440, 956, true]]) {
        const tag = `${width}x${height}${doubled ? ' 200% text' : ''}`;
        suite(`the end of every day is reached, whatever its length - ${tag}`);
        const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2,
            isMobile: true, hasTouch: true, colorScheme: 'light', serviceWorkers: 'block' });
        const page = await context.newPage();
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(server.url);
        await page.waitForFunction(() => typeof markAllHoliday === 'function' && typeof State === 'object');
        if (doubled) given(`${tag}: the cascade is doubled`, await doubleEveryFontSize(page) > 100);
        const cdp = await context.newCDPSession(page);
        // A finger: a drag up the middle of the screen, through the browser's own touch input.
        const drag = async () => {
            const x = Math.round(width / 2);
            let y = Math.round(height * 0.62);
            await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
            for (let step = 0; step < 10; step++) {
                y -= 22;
                await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] });
                await page.waitForTimeout(16);
            }
            await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
            await page.waitForTimeout(260);
        };
        // What the collapse takes out of this page, and the two thresholds. The floor is read as
        // what it does - how far a page of one man can be scrolled while the header is compact -
        // and not off a stylesheet: it is the day's own section's (css/app.css), not <body>'s.
        await dayOfLength(page, 1, 1, 'sites');
        const band = await page.evaluate(() => {
            const header = document.querySelector('#dayView .day-header');
            const full = header.getBoundingClientRect().height;
            document.body.classList.add('day-compact');
            const compact = header.getBoundingClientRect().height;
            const floor = document.documentElement.scrollHeight - innerHeight;
            const onBody = getComputedStyle(document.body).minHeight;
            document.body.classList.remove('day-compact');
            return { on: COMPACT_ON, off: COMPACT_OFF, collapse: Math.round(full - compact), floor: Math.round(floor), onBody };
        });
        // The band: a day whose end is further down than COMPACT_ON and nearer than COMPACT_OFF
        // and the collapse. It exists while the collapse is wider than the gap between the two.
        const banding = band.collapse > band.on - band.off;
        // The mechanism, read directly: while compact the page is the screen and COMPACT_ON
        // more, so no collapse can pull the scroll back under COMPACT_OFF.
        check(`${tag}: while the header is compact the page is never shorter than the screen and ${band.on}px - and <body> itself is given no floor`,
            band.floor >= band.on && (band.onBody === '0px' || band.onBody === 'auto'), JSON.stringify(band));
        const near = height <= 580 ? 8 : 24;
        const inBand = [];
        const failed = [];
        let days = 0;
        for (const sites of [1, 2, 3]) for (const crew of [1, 2, 3, 4, 6, 8, 10]) for (const mode of ['sites', 'workers']) {
            days += 1;
            const day = `${sites} site${sites > 1 ? 's' : ''}, ${crew} m${crew > 1 ? 'en' : 'an'} ${mode === 'sites' ? 'by site' : 'by worker'}`;
            const top = await dayOfLength(page, crew, sites, mode);
            const banded = top.end > band.on && top.end <= band.off + band.collapse;
            if (banded) inBand.push(`${day} (${top.end}px)`);
            await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
            await page.waitForTimeout(220);
            await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
            await page.waitForTimeout(220);
            const rest = await page.evaluate(AT_REST);
            const reached = rest.end <= 0 || Math.abs(rest.y - rest.end) <= 1;
            // «עוד ⋯» writes nothing: it is held to being there - reached, whole above the dock, on
            // its own line under the two. «הכל חופש», in its menu, is the sweep's (below).
            const placed = rest.hit && rest.dock >= 0 && rest.footTwo >= near;
            if (!reached || (top.end > band.on && !rest.compact) || !placed) failed.push({ day, top: top.end, ...rest });
            // A finger, on every day the band holds - where the header flickered.
            if (banded) {
                await page.evaluate(() => {
                    window.scrollTo(0, 0);
                    window.__flips = 0;
                    if (window.__flipWatch) window.__flipWatch.disconnect();
                    let was = document.body.classList.contains('day-compact');
                    window.__flipWatch = new MutationObserver(() => {
                        const now = document.body.classList.contains('day-compact');
                        if (now !== was) { window.__flips += 1; was = now; }
                    });
                    window.__flipWatch.observe(document.body, { attributes: true, attributeFilter: ['class'] });
                });
                await page.waitForTimeout(220);
                await page.evaluate(() => { window.__flips = 0; });
                for (let stroke = 0; stroke < 3; stroke++) await drag();
                const byFinger = await page.evaluate(AT_REST);
                const flips = await page.evaluate(() => { window.__flipWatch.disconnect(); return window.__flips; });
                if (Math.abs(byFinger.y - byFinger.end) > 1 || !byFinger.compact || flips !== 1
                    || !(byFinger.hit && byFinger.dock >= 0)) {
                    failed.push({ day, byFinger: true, flips, top: top.end, ...byFinger });
                }
            }
        }
        // Where there is a band, this sweep must have drawn days in it - or it proves nothing
        // about the days that were out of reach.
        if (banding) {
            given(`${tag}: days in the band were drawn (their end ${band.on + 1}-${band.off + band.collapse}px below the glass)`,
                inBand.length >= 1, inBand.join('; '));
        }
        check(`${tag}: ${days} days, each scrolled to its end, rests at its end - the header compact on every day that ends more than ${band.on}px down - and a finger's drags on the band's days end there too, the header compacting ONCE`,
            failed.length === 0, JSON.stringify(failed.slice(0, 3)));
        check(`${tag}: and there «עוד ⋯» is whole above the dock, a tap at its centre reaches it, ${near}px and more under «חיפוש עובד» and «בדיקת היום»`,
            failed.filter(item => !item.hit || item.dock < 0 || item.footTwo < near).length === 0, JSON.stringify(failed.slice(0, 2)));
        await context.close();
    }

    // ============================================================== nothing leaks
    //
    // THE COMPACT DAY'S FLOOR IS THE DAY'S. Its first build put it on <body>, and nothing took
    // `day-compact` off <body> when another screen was opened: after a day dragged to its end, a
    // real tap on «דוחות», «שבוע» or «מקדמות» opened that screen 72px down, the top bar wholly
    // above the glass (the verifier, 9281f87, 375x667, both schemes).
    //
    // MOVED ON PURPOSE (v194, the port onto v192). Round two also made every tab open its screen
    // at its top (showView scrolled the window), and held that here. It is taken back: the five
    // screens share the window's one scroll, v166 DECIDED that the week tab and back leave the
    // window where it was and tests/scroll.browser.mjs pins it (10b) - a day left for the week
    // and come back to is found where it was left. So another screen opens where v192 opens it:
    // the window's scroll as it was, clamped by the browser to that screen's own length and by
    // nothing of the day's. Measured against v192 itself (ae6e1a0) on 48 sequences - 375x667,
    // 320x568 and 440x956, both schemes, the large display off and on, 16 and 30 men, the day at
    // 90 and at 400 - the scroll and the top bar's place on «שבוע», «צוות», «מקדמות», «דוחות» and
    // «היום» again are the same number on both, every one.
    //
    // What is held: a finger drags the day to its end, then a real tap on each tab - <body> has no
    // floor, the page is not a pixel taller for `day-compact` being on <body> (the class put on
    // and taken off, the page's height read both ways), the scroll is what it was before the tap
    // or that screen's own end, whichever is less, and a screen shorter than the glass is at its
    // top with its top bar and ⚙ whole on it - and «היום» again is where the day was left, and a
    // finger still takes it to its end.
    const TABS = { week: 'שבוע', roster: 'צוות', advances: 'מקדמות', reports: 'דוחות' };
    for (const [width, height] of [[375, 667], [320, 568]]) for (const scheme of ['light', 'dark']) for (const large of [false, true]) {
        const tag = `${width}x${height} ${scheme}, the large display ${large ? 'on' : 'off'}`;
        suite(`nothing leaks: after a day dragged to its end, no other screen is a pixel taller or further down for it - ${tag}`);
        const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2,
            isMobile: true, hasTouch: true, colorScheme: scheme, serviceWorkers: 'block' });
        if (large) await context.addInitScript(() => { try { localStorage.setItem('farkadDisplay:large', '1'); } catch (error) { /* the mode stays off */ } });
        const page = await context.newPage();
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(server.url);
        await page.waitForFunction(() => typeof markAllHoliday === 'function' && typeof State === 'object');
        given(`${tag}: the large display is ${large ? 'on' : 'off'}`,
            await page.evaluate(() => document.documentElement.classList.contains('display-large')) === large);
        const cdp = await context.newCDPSession(page);
        for (const [crew, sites, mode] of [[3, 3, 'sites'], [3, 3, 'workers'], [8, 1, 'sites']]) {
            const day = `${crew} men on ${sites} sites ${mode === 'sites' ? 'by site' : 'by worker'}`;
            await dayOfLength(page, crew, sites, mode);
            const end = await fingerToEnd(page, cdp, width, height);
            given(`${tag}, ${day}: a finger took the day to its end, the header compact`,
                end.compact && Math.abs(end.y - end.end) <= 1 && end.y > 72, JSON.stringify(end));
            const opened = [];
            let before = end.y;
            for (const [tab, name] of Object.entries(TABS)) {
                await page.locator('#tab-' + tab).tap();
                await page.waitForTimeout(350);
                const at = await page.evaluate(tab => {
                    const bar = document.querySelector('.topbar').getBoundingClientRect();
                    const settings = document.getElementById('settingsBtn').getBoundingClientRect();
                    const root = document.documentElement, body = document.body;
                    // The page's height with the day's class on <body> and off it.
                    const was = body.classList.contains('day-compact');
                    body.classList.add('day-compact'); const on = root.scrollHeight;
                    body.classList.remove('day-compact'); const off = root.scrollHeight;
                    body.classList.toggle('day-compact', was);
                    return { tab, y: Math.round(scrollY), bar: [Math.round(bar.top), Math.round(bar.bottom)],
                        settings: settings.top >= 0 && settings.bottom <= innerHeight,
                        shown: document.getElementById(tab + 'View').style.display !== 'none',
                        taller: on - off, most: Math.max(0, off - innerHeight),
                        floor: getComputedStyle(body).minHeight };
                }, tab);
                const where = Math.min(before, at.most);
                if (!(at.shown && Math.abs(at.y - where) <= 1 && at.taller === 0 && (at.floor === '0px' || at.floor === 'auto')
                    && (at.most > 0 || (at.y === 0 && at.bar[0] >= 0 && at.settings)))) {
                    opened.push({ name, before, ...at });
                }
                before = at.y;
            }
            check(`${tag}, ${day}: a real tap on «שבוע», «צוות», «מקדמות» and «דוחות» - each opens where the window was or at its own end, not a pixel taller for the day's class, and a screen shorter than the glass at its top with the top bar and ⚙ whole on it`,
                opened.length === 0, JSON.stringify(opened));
            await page.locator('#tab-day').tap();
            await page.waitForTimeout(350);
            const back = await page.evaluate(() => ({ y: Math.round(scrollY), compact: document.body.classList.contains('day-compact'),
                most: Math.max(0, document.documentElement.scrollHeight - innerHeight) }));
            check(`${tag}, ${day}: and «היום» again is where the window was, its header compact exactly when it is past the threshold`,
                Math.abs(back.y - Math.min(before, back.most)) <= 1 && (back.y > 72 ? back.compact : true), JSON.stringify({ before, ...back }));
            // And the day still reaches its end: the floor is still under it while it is the screen.
            const again = await fingerToEnd(page, cdp, width, height);
            check(`${tag}, ${day}: and a finger takes it to its end again, the header compact`,
                again.compact && Math.abs(again.y - again.end) <= 1 && again.y > 72, JSON.stringify(again));
        }
        await context.close();
    }

    // ============================================================== the sweep
    //
    // WHERE «הכל חופש» IS, ON EVERY DAY. The verifier's sweep of the first move, made permanent:
    // every day of 1 to 16 men on 1 to 4 sites in both views, at 320x568, 375x667, 440x956,
    // 667x375 and 568x320, the large display off and on, both schemes - as the day opens (the
    // page at its top) and scrolled to its end. On the first move (420cec5, round one on v191)
    // 420 of these 2,560 days had «הכל חופש» on the glass within 48px of the dock or across its
    // edge as the day opened, and every one had a control nearer than 48px at its end (11 to 31px:
    // find and the check, the last man sideways, the dock sideways). Now no control on the day
    // says «הכל חופש» on any day in either place, and «עוד ⋯» - which writes nothing - is reached
    // at the end of every day, whole above the dock. Where it opens on the dock's edge (counted,
    // in the detail), a finger there gets the menu. Then the menu, opened by a real tap on «עוד ⋯»
    // where it stands - at the top and at the end of a short day, of the first day it opens on
    // the dock's edge, and of a long one - holds «הכל חופש» 48px and more from every target a
    // finger can reach while it is up and from that finger, whole on the glass, a tap at its
    // centre reaching it, disabled as it opens with the focus on «סגור», and its words whole.
    for (const [width, height] of [[320, 568], [375, 667], [440, 956], [667, 375], [568, 320]]) {
        for (const large of [false, true]) for (const scheme of ['light', 'dark']) {
            const tag = `${width}x${height} ${scheme}, the large display ${large ? 'on' : 'off'}`;
            suite(`the sweep: «הכל חופש» on no day, «עוד ⋯» at the end of every day, the menu clear of everything - ${tag}`);
            const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2,
                isMobile: true, hasTouch: true, colorScheme: scheme, serviceWorkers: 'block' });
            if (large) await context.addInitScript(() => { try { localStorage.setItem('farkadDisplay:large', '1'); } catch (error) { /* the mode stays off */ } });
            const page = await context.newPage();
            page.on('pageerror', error => errors.push(error.message));
            await page.goto(server.url);
            await page.waitForFunction(() => typeof openDayMore === 'function' && typeof State === 'object');
            given(`${tag}: the large display is ${large ? 'on' : 'off'}`,
                await page.evaluate(() => document.documentElement.classList.contains('display-large')) === large);
            const said = [];
            const unreached = [];
            const onEdge = [];
            let days = 0;
            for (const mode of ['workers', 'sites']) for (let sites = 1; sites <= 4; sites++) for (let crew = 1; crew <= 16; crew++) {
                days += 1;
                const day = `${crew} on ${sites} ${mode === 'sites' ? 'by site' : 'by worker'}`;
                const read = await page.evaluate(SWEEP_DAY, [TODAY, NAMES, crew, sites, mode]);
                if (read.top.holiday.length || read.end.holiday.length || read.top.old || read.end.old) {
                    said.push({ day, top: read.top.holiday, end: read.end.holiday });
                }
                const end = read.end;
                if (!end.more || !end.reach || end.bottom > end.dock || Math.abs(end.y - end.end) > 1) unreached.push({ day, ...end });
                if (read.top.more && read.top.glass && read.top.reach && read.top.bottom > read.top.dock - 48) onEdge.push({ crew, sites, mode });
            }
            same(`${tag}: ${days} days, as each opens and at its end - no control on the day says «הכל חופש»`, said, []);
            check(`${tag}: at the end of every one, «עוד ⋯» is reached by a tap at its centre, whole above the dock, the page at its end`,
                unreached.length === 0,
                unreached.length ? JSON.stringify(unreached.slice(0, 2)) : `«עוד ⋯» opens on the dock's edge on ${onEdge.length} of ${days} (a tap there opens the menu)`);

            // The menu, from where «עוד ⋯» stands: at the top of the day, then at its end.
            const menuDays = [{ crew: 1, sites: 1, mode: 'workers' }, onEdge[0], { crew: 16, sites: 4, mode: 'sites' }].filter(Boolean);
            const near = [];
            let opened = 0;
            const before = [];
            for (const one of menuDays) {
                await page.evaluate(SWEEP_DAY, [TODAY, NAMES, one.crew, one.sites, one.mode]);
                const disk = await page.evaluate(() => localStorage.getItem('scheduleData:v2'));
                for (const where of ['top', 'end']) {
                    await page.evaluate(async where => {
                        const frames = () => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
                        for (let turn = 0; turn < 4; turn++) {
                            window.scrollTo(0, where === 'top' ? 0 : document.documentElement.scrollHeight);
                            await frames();
                        }
                    }, where);
                    const reachable = await page.evaluate(() => {
                        const more = document.getElementById('dayMoreEntry');
                        const box = more.getBoundingClientRect();
                        const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
                        return Boolean(hit) && (hit === more || more.contains(hit));
                    });
                    if (!reachable) continue;
                    const finger = await openMenuByTap(page);
                    const menu = await page.evaluate(MENU_SURVEY, [finger.x, finger.y]);
                    const first = await page.evaluate(() => window.__menu);
                    opened += 1;
                    const label = `${one.crew} on ${one.sites} ${one.mode === 'sites' ? 'by site' : 'by worker'}, at its ${where}`;
                    const fine = menu.open === 'flex' && menu.title === MENU_TITLE && JSON.stringify(menu.answers) === JSON.stringify([ENTRY, CLOSE])
                        && menu.aria === ENTRY_LABEL && menu.nearest && menu.nearest.gap >= 48 && menu.finger >= 48 && menu.whole && menu.hit
                        && !menu.cut && menu.h >= (large ? 52 : 44) && menu.w >= 44 && menu.font >= (large ? 20 : 16)
                        && first && JSON.stringify(first.disabled) === '[true,false]' && first.focus === CLOSE;
                    if (!fine) near.push({ label, menu, first });
                    await page.evaluate(() => askClose(null));
                    await page.waitForTimeout(40);
                }
                before.push([disk, await page.evaluate(() => localStorage.getItem('scheduleData:v2'))]);
            }
            check(`${tag}: the menu, opened by a real tap on «עוד ⋯» ${opened} times - the day its title, «הכל חופש» (v116's accessible name) then «סגור»; «הכל חופש» 48px and more from every target a finger can reach and from the finger, whole on the glass, reached at its centre, its words whole; held as it opens, the focus on «סגור»`,
                opened >= menuDays.length && near.length === 0, JSON.stringify(near.slice(0, 2)));
            check(`${tag}: and shut, nothing was written`, before.every(([was, now]) => was === now));
            await context.close();
        }
    }

    // ============================================================== on its way there
    //
    // Before the day is scrolled - at its top, as it opens - the foot of a short day can stand
    // across the dock's edge, as the last row of any day does: «עוד ⋯» with it (the verifier's
    // own day, 2 sites and 3 men by site at 440: 817-865 against a dock at 828). It writes
    // nothing. What a finger that comes down on it there gets is held here: the menu and
    // nothing else - held, on «סגור», its «הכל חופש» away from that finger - and a double tap
    // that opens no question and marks nobody.
    suite('at the top of a short day, where the foot stands across the dock\'s edge: a double tap there only opens the menu');
    {
        const context = await browser.newContext({ viewport: { width: 440, height: 956 }, deviceScaleFactor: 2,
            isMobile: true, hasTouch: true, colorScheme: 'light', serviceWorkers: 'block' });
        const page = await context.newPage();
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(server.url);
        await page.waitForFunction(() => typeof openDayMore === 'function' && typeof State === 'object');
        await dayOfLength(page, 3, 2, 'sites');
        const before = await disk(page);
        const at = await page.evaluate(() => {
            const box = document.getElementById('dayMoreEntry').getBoundingClientRect();
            const dock = document.querySelector('.day-actions').getBoundingClientRect();
            return { y: Math.round(scrollY), top: box.top, bottom: box.bottom, x: box.left + box.width / 2, dock: dock.top };
        });
        given('440x956, 2 sites, 3 men by site, at the top: «עוד ⋯» stands across the dock\'s edge',
            at.y === 0 && at.top < at.dock - 6 && at.bottom > at.dock, JSON.stringify(at));
        const finger = { x: at.x, y: (at.top + at.dock) / 2 };
        await watchMenu(page);
        await page.touchscreen.tap(finger.x, finger.y);
        await page.waitForTimeout(110);
        await page.touchscreen.tap(finger.x, finger.y);
        await page.waitForTimeout(150);
        const menu = await page.evaluate(MENU_SURVEY, [finger.x, finger.y]);
        const first = await page.evaluate(() => window.__menu);
        const marked = await page.evaluate(() => State.schedule.workers.filter(worker => isAbsent(State.schedule, State.date, worker.id, 'actual')).length);
        check('a double tap on what shows of it above the dock opens the menu - held, on «סגור» - and no question, and marks nobody',
            menu.open === 'flex' && menu.title === MENU_TITLE && Boolean(first) && JSON.stringify(first.disabled) === '[true,false]'
            && first.focus === CLOSE && marked === 0, JSON.stringify({ menu, first, marked }));
        check('its «הכל חופש» is 48px and more from that finger', menu.finger >= 48, `${menu.finger}px`);
        await menuHoldOver(page);
        await page.locator('#askChoices button', { hasText: CLOSE }).tap();
        await page.waitForTimeout(150);
        check('«סגור»: closed, and every key on the disk holds the bytes it held', !(await isOpen(page)) && await disk(page) === before);
        await context.close();
    }

    // ============================================================== the foot rule
    suite('the foot rule at the heights tests/mobile.test.mjs uses: thirty men by worker, the day scrolled to its end');
    for (const [width, height, inset] of [[320, 568, 0], [375, 667, 0], [390, 844, 0], [430, 932, 34],
        [568, 320, 34], [667, 375, 34], [844, 390, 34], [932, 430, 34]]) {
        const tag = `${width}x${height}${inset ? ' with a home indicator' : ''}`;
        const page = await phone(width, height, 'light', { crew: 30, mode: 'workers', inset });
        await toEnd(page);
        const at = await page.evaluate(() => {
            const rows = [...document.querySelectorAll('#dayView .worker-list .wrow-main')].filter(node => node.offsetParent !== null);
            const last = rows[rows.length - 1].getBoundingClientRect();
            const hitLast = document.elementFromPoint(last.left + last.width / 2, last.top + last.height / 2);
            const entry = document.getElementById('dayMoreEntry');
            const box = entry.getBoundingClientRect();
            const hitEntry = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
            const check = document.getElementById('dayCheckEntry').getBoundingClientRect();
            const foot = entry.parentElement.getBoundingClientRect();
            const dock = document.querySelector('.day-actions').getBoundingClientRect();
            const gap = b => Math.hypot(Math.max(0, Math.max(box.left, b.left) - Math.min(box.right, b.right)),
                Math.max(0, Math.max(box.top, b.top) - Math.min(box.bottom, b.bottom)));
            const others = [...document.querySelectorAll('button, input, select, a[href]')]
                .filter(node => node !== entry && !['findEntry', 'dayCheckEntry'].includes(node.id) && node.checkVisibility()
                    && !node.closest('.modal'))
                .map(node => node.getBoundingClientRect()).filter(b => b.width > 0 && b.bottom > 0 && b.top < innerHeight);
            return { last: rows[rows.length - 1].contains(hitLast), entry: entry === hitEntry || entry.contains(hitEntry),
                sameLine: Math.abs(box.top - check.top) <= 1, foot: Math.round(foot.height),
                gapToCheck: Math.round(check.left - box.right), aboveDock: box.bottom <= dock.top + 1,
                nearestOther: Math.round(Math.min(...others.map(gap))) };
        });
        check(`${tag}: the last man is still reachable, and so is «עוד ⋯», whole above the dock`,
            at.last && at.entry && at.aboveDock, JSON.stringify(at));
        if (height <= 500) {
            check(`${tag}: too short for one more line, it shares the foot's own line - the foot no taller than one button - 24px from «בדיקת היום»`,
                at.sameLine && at.foot <= 56 && at.gapToCheck >= 24, JSON.stringify(at));
            // Sideways the foot is the line straight under the list, as find and the check are,
            // so the nearest other control to «עוד ⋯» is the last row, the foot's own 14px margin
            // away - no room to give it more (the last man, above). It writes nothing: «הכל חופש»,
            // which it opens, is the one held 48px from everything (the sweep).
            check(`${tag}: nothing else overlaps it or comes nearer than the foot's own 14px margin`,
                at.nearestOther >= 13.5, JSON.stringify(at));
        } else if (height <= 580) {
            check(`${tag}: no break and none of its margins: under the two by the row's own wrap, the foot two buttons and one gap`,
                !at.sameLine && at.foot <= 48 + 8 + 48 + 1, JSON.stringify(at));
        } else {
            check(`${tag}: a line of its own`, !at.sameLine && at.foot > 100, JSON.stringify(at));
        }
        await page.context().close();
    }

    // The case tests/mobile.test.mjs caught (its transitions at 320): a home indicator and the
    // undo bar up, three lines of a long name tall - the bar the page makes room under - and
    // the day scrolled to its end. The last man must be the thing a tap at his centre reaches.
    suite('the foot rule with the undo bar up and a home indicator');
    for (const [width, height] of [[320, 568], [375, 667], [390, 844]]) {
        const page = await phone(width, height, 'light', { crew: 30, mode: 'workers', inset: 34 });
        await page.evaluate(() => offerUndo('הרישום של עובד עם שם ארוך מאוד נמחק מהאתר הראשי ומהיום הזה', () => {}));
        await page.waitForTimeout(400);
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(250);
        const at = await page.evaluate(() => {
            const rows = [...document.querySelectorAll('#dayView .worker-list .wrow-main')].filter(node => node.offsetParent !== null);
            const node = rows[rows.length - 1];
            const box = node.getBoundingClientRect();
            const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
            const header = document.querySelector('#dayView .day-header').getBoundingClientRect();
            const undo = document.getElementById('undoBar');
            return { hit: node.contains(hit), by: hit ? String(hit.className || hit.tagName).slice(0, 20) : null,
                row: [Math.round(box.top), Math.round(box.bottom)], header: Math.round(header.bottom),
                room: Math.round(box.top + box.height / 2 - header.bottom),
                undo: undo.style.display !== 'none' && undo.getBoundingClientRect().height > 60 };
        });
        given(`${width}x${height}: the undo bar is up, and tall`, at.undo, JSON.stringify(at));
        // With room to spare. The line of its own and its margins left his centre 1.5px INSIDE
        // the header in tests/mobile.test.mjs (red), and on this page no room at all; the
        // row's own wrap leaves him 16px at 320x568 - thin, and measured.
        check(`${width}x${height}: the last man is the thing a tap at his centre reaches, his centre 8px and more under the header`,
            at.hit && at.room >= 8, JSON.stringify(at));
        await page.context().close();
    }

    suite('with no site at all, «עוד ⋯» stands under the setup card');
    {
        const page = await phone(375, 667, 'light', { sites: 0 });
        const at = await page.evaluate(() => {
            const entry = document.getElementById('dayMoreEntry');
            const card = document.querySelector('#dayView .setup-card');
            const box = entry.getBoundingClientRect();
            const list = document.getElementById('dayView').getBoundingClientRect();
            return { card: Boolean(card), under: card ? box.top - card.getBoundingClientRect().bottom : null,
                header: document.querySelector('#dayView .day-header').contains(entry),
                atEnd: Math.abs(box.left - list.left) <= 1.5, h: box.height, font: parseFloat(getComputedStyle(entry).fontSize),
                last: document.getElementById('dayView').lastElementChild.contains(entry) };
        });
        check('under the card, 16px and more below it, at the end side, the last thing on the screen, 48px and 16px',
            at.card && at.under >= 16 && !at.header && at.atEnd && at.last && at.h >= 48 && at.font >= 16, JSON.stringify(at));
        const finger = await openMenuByTap(page);
        const menu = await page.evaluate(MENU_SURVEY, [finger.x, finger.y]);
        check('a tap there opens the same menu - the day, «הכל חופש» then «סגור», «הכל חופש» 48px and more from the finger and from «סגור»',
            menu.title === MENU_TITLE && JSON.stringify(menu.answers) === JSON.stringify([ENTRY, CLOSE]) && menu.finger >= 48
            && Boolean(menu.nearest) && menu.nearest.gap >= 48, JSON.stringify(menu));
        await menuHoldOver(page);
        await watchQuestion(page);
        await page.locator('#askChoices button').first().tap();
        await page.waitForTimeout(100);
        same('and «הכל חופש» in it asks the same question', bare(await page.locator('#askTitle').textContent()), TITLE);
        await holdOver(page);
        await page.locator('#askCancel').tap();
        await page.context().close();
    }

    // ============================================================== the question
    for (const [width, height, scheme] of [[375, 667, 'light'], [440, 956, 'dark'], [320, 568, 'dark']]) {
        const tag = `${width}x${height} ${scheme}`;
        suite(`the question - ${tag}`);
        const page = await phone(width, height, scheme);
        const before = await disk(page);
        await censusOnly(check, page, before);
        const finger = await openByTap(page);
        const q = await page.evaluate(([x, y]) => {
            const content = document.querySelector('#askModal .modal-content').getBoundingClientRect();
            const title = document.getElementById('askTitle');
            const ok = document.getElementById('askOk');
            const cancel = document.getElementById('askCancel');
            const box = ok.getBoundingClientRect();
            const style = getComputedStyle(ok);
            const rgb = value => (value.match(/[\d.]+/g) || []).map(Number);
            const lum = ([r, g, b]) => [r, g, b].map(c => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; })
                .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
            const ink = lum(rgb(style.color));
            const ground = lum(rgb(style.backgroundColor));
            const list = document.getElementById('askList');
            const items = [...list.querySelectorAll('li')];
            return {
                open: document.getElementById('askModal').style.display, title: title.textContent,
                twoLines: getComputedStyle(title).whiteSpace === 'pre-line'
                    && title.getBoundingClientRect().height >= 1.8 * parseFloat(getComputedStyle(title).lineHeight),
                message: document.getElementById('askMessage').textContent,
                names: items.map(item => item.textContent), listShown: list.checkVisibility(),
                nameFont: Math.min(...items.map(item => parseFloat(getComputedStyle(item).fontSize))),
                messageFont: parseFloat(getComputedStyle(document.getElementById('askMessage')).fontSize),
                footer: document.getElementById('askFooter').textContent, footerShown: document.getElementById('askFooter').checkVisibility(),
                ok: ok.textContent, danger: ok.classList.contains('btn-danger'),
                disabled: window.__opened && window.__opened.disabled,
                cancel: cancel.textContent, focus: window.__opened && window.__opened.focus,
                contrast: (Math.max(ink, ground) + 0.05) / (Math.min(ink, ground) + 0.05),
                away: Math.hypot(Math.max(box.left - x, 0, x - box.right), Math.max(box.top - y, 0, y - box.bottom)),
                small: [ok, cancel].map(node => node.getBoundingClientRect()).filter(at => at.width < 44 || at.height < 44).length,
                onGlass: content.top >= 0 && content.bottom <= innerHeight + 1 && content.left >= 0 && content.right <= innerWidth + 1,
                answersOnGlass: [ok, cancel].every(node => node.getBoundingClientRect().bottom <= innerHeight),
                sideways: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
            };
        }, [finger.x, finger.y]);
        same(`${tag}: a real tap opens it, asking his question with the day on a line of its own`,
            [q.open, bare(q.title), q.twoLines], ['flex', TITLE, true]);
        same(`${tag}: how many, and that it is a day off without pay`, bare(q.message), MESSAGE(8));
        same(`${tag}: every man it will mark, by name, in the roster's order - and nobody else`,
            q.names, NAMES.slice(3, 11));
        check(`${tag}: the names are read at 18px, the sentence at 16px`, q.listShown && q.nameFont >= 18 && q.messageFont >= 16,
            JSON.stringify([q.nameFont, q.messageFont]));
        same(`${tag}: what is kept, under the answers`, [bare(q.footer), q.footerShown], [KEPT, true]);
        same(`${tag}: «כן, כולם בחופש» is the destructive kind, held at first; «ביטול» has the focus`,
            [bare(q.ok), q.danger, q.disabled, bare(q.cancel), q.focus], [OK, true, true, 'ביטול', 'askCancel']);
        check(`${tag}: its words at 4.5:1 and more on it`, q.contrast >= 4.5, q.contrast.toFixed(2));
        check(`${tag}: the confirming button is 48px and more from where the finger was`, q.away >= 48, `${Math.round(q.away)}px`);
        check(`${tag}: both answers 44px and more, the dialog wholly on the glass, nothing sideways`,
            q.small === 0 && q.onGlass && q.answersOnGlass && !q.sideways, JSON.stringify(q));
        await holdOver(page);
        await page.locator('#askCancel').tap();
        await page.waitForTimeout(150);
        same(`${tag}: «ביטול» after the hold closes it, and nothing is marked`, [await isOpen(page), await marked(page)], [false, ['w_03']]);
        check(`${tag}: every key on the disk holds the bytes it held before the question`, await disk(page) === before);
        same(`${tag}: and no ↶ is offered for it`, await page.evaluate(() => document.getElementById('undoBtn').disabled), true);
        await page.context().close();
    }

    suite('thirty men: the list scrolls inside the dialog, and the answers stay on the glass');
    for (const [width, height] of [[320, 568], [375, 667], [440, 956]]) {
        const page = await phone(width, height, 'light', { crew: 30 });
        await openByTap(page);
        const at = await page.evaluate(() => {
            const list = document.getElementById('askList');
            return { items: list.querySelectorAll('li').length, scrolls: list.scrollHeight > list.clientHeight + 1,
                answers: ['askOk', 'askCancel'].every(id => { const box = document.getElementById(id).getBoundingClientRect();
                    return box.top >= 0 && box.bottom <= innerHeight; }),
                content: document.querySelector('#askModal .modal-content').scrollHeight
                    <= document.querySelector('#askModal .modal-content').clientHeight + 1 };
        });
        check(`${width}x${height}: twenty-six names, in a list that scrolls by itself; both answers on the glass and the dialog not scrolled to reach them`,
            at.items === 26 && at.scrolls && at.answers && at.content, JSON.stringify(at));
        await holdOver(page);
        await page.locator('#askCancel').tap();
        await page.context().close();
    }

    // TWICE THE TEXT SIZE, doubled BEFORE the tap (doubleEveryFontSize above): the button at
    // the end of the day, then the question it opens. Taller than the screen there with the
    // men named, the dialog scrolls - and it must open at its top, the question, the day and
    // the count on the glass. On 0cfee8b it opened 421 to 514px down at 320x568 and 395 at
    // 375x667, on «ביטול» and the last names: focusing «ביטול» scrolled it.
    for (const [width, height, scheme, crew] of [[320, 568, 'light', 5], [320, 568, 'light', 12], [320, 568, 'dark', 30],
        [375, 667, 'dark', 5], [375, 667, 'light', 12], [375, 667, 'light', 30], [440, 956, 'light', 12]]) {
        // w_04 on is unrecorded (phone() above), and w_12 is no longer active.
        const named = crew < 12 ? crew - 3 : crew - 4;
        const tag = `${width}x${height} ${scheme} 200% text, ${named} named`;
        suite(`at twice the text size - ${tag}`);
        const page = await phone(width, height, scheme, { crew, mode: 'workers' });
        const before = await disk(page);
        given(`${tag}: the cascade is doubled before anything is tapped`, await doubleEveryFontSize(page) > 100);
        await page.evaluate(() => render());
        await page.waitForTimeout(250);
        await toEnd(page);
        const way = await page.evaluate(() => {
            const entry = document.getElementById('dayMoreEntry');
            const box = entry.getBoundingClientRect();
            const dock = document.querySelector('.day-actions').getBoundingClientRect();
            const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
            return { w: Math.round(box.width), h: Math.round(box.height), font: parseFloat(getComputedStyle(entry).fontSize),
                inside: box.left >= 0 && box.right <= innerWidth + 1, cut: entry.scrollWidth > entry.clientWidth + 1,
                aboveDock: box.bottom <= dock.top + 1, hit: Boolean(hit) && (hit === entry || entry.contains(hit)),
                sideways: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1 };
        });
        check(`${tag}: «עוד ⋯» is doubled, whole, 44px and more, above the dock where the day rests, and the day does not scroll sideways`,
            way.font >= 32 && way.w >= 44 && way.h >= 44 && way.inside && !way.cut && way.aboveDock && way.hit && !way.sideways,
            JSON.stringify(way));
        // What the dialog was the moment it opened, and a beat later.
        await page.evaluate(() => {
            // The question opens in the menu's own dialog, never shut between the two: what is
            // watched is its title being written, not the dialog being shown.
            window.__top = null;
            const modal = document.getElementById('askModal');
            const title = document.getElementById('askTitle');
            const seen = new MutationObserver(() => {
                if (window.__top !== null || !title.textContent.startsWith('בטוח שכולם בחופש?')) return;
                window.__top = modal.querySelector('.modal-content').scrollTop;
                seen.disconnect();
            });
            seen.observe(title, { childList: true, characterData: true, subtree: true });
        });
        const finger = await openByTap(page);
        await page.waitForTimeout(120);
        const q = await page.evaluate(([x, y]) => {
            const content = document.querySelector('#askModal .modal-content');
            const box = content.getBoundingClientRect();
            const glass = { top: Math.max(box.top, 0), bottom: Math.min(box.bottom, innerHeight) };
            const whole = node => { const at = node.getBoundingClientRect(); return at.height > 0 && at.top >= glass.top - 1 && at.bottom <= glass.bottom + 1; };
            const first = document.querySelector('#askList li');
            const ok = document.getElementById('askOk').getBoundingClientRect();
            const spill = [...content.querySelectorAll('*')].filter(node => {
                const at = node.getBoundingClientRect();
                return at.width > 0 && (at.left < box.left - 1 || at.right > box.right + 1);
            }).map(node => node.id || node.tagName);
            return {
                atOpen: window.__top, now: content.scrollTop, scrolls: content.scrollHeight > content.clientHeight + 1,
                font: parseFloat(getComputedStyle(document.getElementById('askTitle')).fontSize),
                title: whole(document.getElementById('askTitle')), message: whole(document.getElementById('askMessage')),
                firstName: Boolean(first) && first.getBoundingClientRect().top < glass.bottom - 20,
                focus: document.activeElement && document.activeElement.id,
                onGlass: box.left >= 0 && box.right <= innerWidth + 1 && box.top >= 0,
                sideways: content.scrollWidth > content.clientWidth + 1
                    || document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
                spill, away: Math.hypot(Math.max(ok.left - x, 0, x - ok.right), Math.max(ok.top - y, 0, y - ok.bottom))
            };
        }, [finger.x, finger.y]);
        check(`${tag}: it opens at its top - as it opens and after - «בטוח שכולם בחופש?» and the day, the count, and the first name on the glass, the words doubled`,
            q.atOpen === 0 && q.now === 0 && q.title && q.message && q.firstName && q.font >= 30, JSON.stringify(q));
        check(`${tag}: «ביטול» has the focus all the same, and the confirming button is 48px and more from the finger`,
            q.focus === 'askCancel' && q.away >= 48, JSON.stringify([q.focus, Math.round(q.away)]));
        check(`${tag}: on the glass, nothing in it spills or scrolls sideways`, q.onGlass && !q.sideways && q.spill.length === 0,
            JSON.stringify(q));
        // The answers are a scroll away, and the scroll can start ON the names: the list hands
        // the finger on to the dialog at its last name (a wheel stands for it here - the same
        // chaining, one input Chromium drives exactly).
        await holdOver(page);
        const pageBefore = await page.evaluate(() => Math.round(scrollY));
        const list = await page.locator('#askList').boundingBox();
        await page.mouse.move(list.x + list.width / 2, list.y + Math.min(list.height / 2, 30));
        // Turned until both answers are on the glass, or forty turns: twenty-six names at
        // twice the size are some 1,500px of list before the dialog moves at all.
        const bothOnGlass = () => page.evaluate(() => {
            const box = document.querySelector('#askModal .modal-content').getBoundingClientRect();
            return ['askOk', 'askCancel'].every(id => {
                const at = document.getElementById(id).getBoundingClientRect();
                return at.top >= Math.max(box.top, 0) - 1 && at.bottom <= Math.min(box.bottom, innerHeight) + 1;
            });
        });
        for (let turn = 0; turn < 40 && !(await bothOnGlass()); turn++) {
            await page.mouse.wheel(0, 120);
            await page.waitForTimeout(140);
        }
        await page.waitForTimeout(250);
        const answers = await page.evaluate(() => {
            const content = document.querySelector('#askModal .modal-content');
            const box = content.getBoundingClientRect();
            const glass = { top: Math.max(box.top, 0), bottom: Math.min(box.bottom, innerHeight) };
            const at = id => document.getElementById(id).getBoundingClientRect();
            return { ok: ['askOk', 'askCancel'].every(id => at(id).top >= glass.top - 1 && at(id).bottom <= glass.bottom + 1),
                small: ['askOk', 'askCancel'].filter(id => at(id).width < 44 || at(id).height < 44).length,
                list: getComputedStyle(document.getElementById('askList')).overscrollBehaviorY,
                content: getComputedStyle(content).overscrollBehaviorY, page: Math.round(scrollY) };
        });
        check(`${tag}: a scroll that starts on the names reaches both answers - 44px and more - and the day behind does not move`,
            answers.ok && answers.small === 0 && answers.list === 'auto' && answers.content === 'contain' && answers.page === pageBefore,
            JSON.stringify(answers));
        await page.locator('#askCancel').tap();
        await page.waitForTimeout(150);
        same(`${tag}: «ביטול» closes it, nobody marked`, [await isOpen(page), await marked(page)], [false, ['w_03']]);
        check(`${tag}: every key on the disk holds the bytes it held before`, await disk(page) === before);
        await page.context().close();
    }

    // ============================================================== a double tap
    for (const [width, height, scheme] of [[320, 568, 'light'], [375, 667, 'light'], [440, 956, 'dark']]) {
        const tag = `${width}x${height} ${scheme}`;
        suite(`a double tap never confirms - ${tag}`);
        const page = await phone(width, height, scheme);
        const before = await disk(page);
        await toEnd(page);
        const at = centre(await entryBox(page));
        await page.evaluate(() => {
            window.__taps = [];
            // (v194: on the window - the page's own rule stops a spent press at the document.)
            window.addEventListener('pointerdown', () => window.__taps.push(performance.now()), true);
        });
        // A real double tap on «עוד ⋯»: the second tap lands on the menu that has just come up.
        await page.touchscreen.tap(at.x, at.y);
        await page.waitForTimeout(110);
        await page.touchscreen.tap(at.x, at.y);
        await page.waitForTimeout(150);
        const taps = await page.evaluate(() => window.__taps);
        given(`${tag}: the two taps were a double tap (two touches, under 600ms apart)`,
            taps.length === 2 && taps[1] - taps[0] < 600, JSON.stringify(taps));
        same(`${tag}: a real double tap on «עוד ⋯» leaves the menu open - no question - and nobody marked`,
            [await isOpen(page), bare(await page.locator('#askTitle').textContent()), await marked(page)], [true, MENU_TITLE, ['w_03']]);
        // And a real double tap on the menu's «הכל חופש», once its hold is over: the second tap
        // lands on the question that has just come up in the same dialog.
        await menuHoldOver(page);
        const onMenu = centre(await menuHolidayBox(page));
        await page.evaluate(() => { window.__taps = []; });
        await page.touchscreen.tap(onMenu.x, onMenu.y);
        await page.waitForTimeout(110);
        await page.touchscreen.tap(onMenu.x, onMenu.y);
        await page.waitForTimeout(150);
        const again = await page.evaluate(() => window.__taps);
        given(`${tag}: those two were a double tap too`, again.length === 2 && again[1] - again[0] < 600, JSON.stringify(again));
        same(`${tag}: a real double tap on the menu's «הכל חופש» leaves the question open and nobody marked`,
            [await isOpen(page), bare(await page.locator('#askTitle').textContent()), await marked(page)], [true, TITLE, ['w_03']]);
        check(`${tag}: and the disk is byte for byte what it was`, await disk(page) === before);
        // After the hold: a finger where the last one was confirms nothing.
        await holdOver(page);
        await page.touchscreen.tap(onMenu.x, onMenu.y);
        await page.waitForTimeout(200);
        same(`${tag}: after the hold, a tap where the finger was confirms nothing`, await marked(page), ['w_03']);
        if (await isOpen(page)) await page.locator('#askCancel').tap();
        await page.waitForTimeout(100);

        // Inside the hold, every way of answering - in the same task the question opens in
        // (askConfirm draws it before markAllHoliday first waits), so this is no race
        // against the machine's speed.
        const inside = await page.evaluate(() => {
            markAllHoliday();
            const modal = document.getElementById('askModal');
            const ok = document.getElementById('askOk');
            const opened = modal.style.display;
            askCancel();
            const afterCancel = modal.style.display;
            ok.click();
            askAccept();
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
            modal.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
            modal.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
            return { opened, afterCancel, open: modal.style.display, held: ok.disabled };
        });
        same(`${tag}: inside DOUBLE_TAP_GUARD_MS «ביטול», the confirming button, Escape and a tap beside the dialog do nothing`,
            [inside.opened, inside.afterCancel, inside.open, inside.held, await marked(page)], ['flex', 'flex', 'flex', true, ['w_03']]);
        await holdOver(page);
        await page.locator('#askCancel').tap();
        await page.waitForTimeout(100);

        // The MENU inside its own hold, the same way: in the task it opens in, «סגור», «הכל חופש»
        // (disabled), Escape and a tap beside it - none of them answers it.
        const menuInside = await page.evaluate(() => {
            openDayMore();
            const modal = document.getElementById('askModal');
            const answers = [...document.querySelectorAll('#askChoices button')];
            const opened = modal.style.display;
            answers[answers.length - 1].click();
            answers[0].click();
            askCancel();
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
            modal.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
            modal.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
            return { opened, open: modal.style.display, title: document.getElementById('askTitle').textContent,
                held: answers[0].disabled, focus: document.activeElement === answers[answers.length - 1] };
        });
        same(`${tag}: inside the menu's hold «סגור», «הכל חופש», Escape and a tap beside it do nothing - the focus on «סגור»`,
            [menuInside.opened, menuInside.open, menuInside.title, menuInside.held, menuInside.focus, await marked(page)],
            ['flex', 'flex', MENU_TITLE, true, true, ['w_03']]);
        await menuHoldOver(page);
        await page.locator('#askChoices button', { hasText: CLOSE }).tap();
        await page.waitForTimeout(100);
        same(`${tag}: after it, «סגור» shuts the menu and nothing is asked`, [await isOpen(page), await marked(page)], [false, ['w_03']]);

        // And a real finger on the confirming button inside it, through the browser's own input.
        await openByTap(page);
        const okBox = await page.locator('#askOk').boundingBox();
        await page.touchscreen.tap(okBox.x + okBox.width / 2, okBox.y + okBox.height / 2);
        const stillHeld = await page.evaluate(() => document.getElementById('askOk').disabled);
        if (stillHeld) {
            await page.waitForTimeout(40);
            same(`${tag}: a finger on «כן, כולם בחופש» inside it presses nothing`, [await isOpen(page), await marked(page)], [true, ['w_03']]);
        } else {
            console.log(`  SKIP  ${tag}: the finger on the confirming button arrived after the hold (a slow machine) - not measured`);
        }
        await holdOver(page);
        if (await isOpen(page)) await page.locator('#askCancel').tap();
        await page.waitForTimeout(100);
        check(`${tag}: after all of it the disk is byte for byte what it was`, await disk(page) === before);
        await page.context().close();
    }

    // ============================================================== confirmed, and ↶
    suite('confirmed: the record is v190\'s, and ↶ gives every man his own day back');
    {
        given('v190\'s markAllHoliday is in this repository', V190_HOLIDAY.length > 0
            && V190_HOLIDAY.indexOf('לרשום חופש ל-') !== -1, V190);
        const page = await phone(375, 667, 'light');
        const old = await phone(375, 667, 'light');
        await old.evaluate(code => (0, eval)(code), V190_HOLIDAY);
        const oldOps = () => old.evaluate(() => FarkadSync.physicalOperations().slice().sort((a, b) => a.seq - b.seq)
            .map(op => [op.seq, op.path, JSON.stringify(op.value)]));
        const newOps = () => page.evaluate(() => FarkadSync.physicalOperations().slice().sort((a, b) => a.seq - b.seq)
            .map(op => [op.seq, op.path, JSON.stringify(op.value)]));
        same('the two pages start from the same day', await records(page), await records(old));
        given('and the second page runs v190\'s holiday', await old.evaluate(() => !/HOLIDAY_TEXT/.test(String(markAllHoliday))));
        const since = [Math.max(0, ...(await oldOps()).map(op => op[0])), Math.max(0, ...(await newOps()).map(op => op[0]))];
        const before = await records(page);
        const reading = await page.evaluate(() => [State.unrecorded().map(worker => worker.id),
            document.querySelector('#dayView .progress-line').textContent,
            [...document.querySelectorAll('#dayView .tray-pending .chip-main')].map(node => node.textContent)]);

        await old.evaluate(() => { markAllHoliday(); });
        await old.waitForTimeout(100);
        await old.locator('#askOk').click();
        await old.waitForTimeout(250);
        await openByTap(page);
        await holdOver(page);
        await page.locator('#askOk').tap();
        await page.waitForTimeout(300);
        same('confirmed, the eight men named are on holiday, and only they',
            await marked(page), ['w_03'].concat(NAMES.slice(3, 11).map((name, at) => `w_${String(at + 4).padStart(2, '0')}`)).sort());
        same('every man\'s day is v190\'s', await records(page), await records(old));
        same('the whole day, in memory and on the disk, is v190\'s', await page.evaluate(day => [JSON.stringify(State.schedule.days[day]),
            JSON.stringify(JSON.parse(localStorage.getItem('scheduleData:v2')).days[day])], TODAY),
        await old.evaluate(day => [JSON.stringify(State.schedule.days[day]),
            JSON.stringify(JSON.parse(localStorage.getItem('scheduleData:v2')).days[day])], TODAY));
        same('the same operations queued - path, value, order', (await newOps()).filter(op => op[0] > since[1]).map(op => op.slice(1)),
            (await oldOps()).filter(op => op[0] > since[0]).map(op => op.slice(1)));
        await old.context().close();

        same('the undo bar says what was done, and so does ↶', await page.evaluate(() => [
            document.getElementById('undoBar').firstChild.textContent, document.getElementById('undoBtn').getAttribute('aria-label')]),
        [UNDO(8), `בטל: ${UNDO(8)}`]);
        await page.locator('#undoBar').getByRole('button', { name: 'בטל', exact: true }).tap();
        await page.waitForTimeout(300);
        const after = await records(page);
        const named = NAMES.slice(3, 11).map((name, at) => `w_${String(at + 4).padStart(2, '0')}`);
        same('↶ with a finger: every man who had a day gets it back byte for byte, the holiday\'s men and the rest',
            Object.keys(before).filter(id => before[id] !== null).map(id => after[id]),
            Object.keys(before).filter(id => before[id] !== null).map(id => before[id]));
        same('every man of the holiday who had none, the empty placeholder',
            named.filter(id => before[id] === null).map(id => after[id]),
            named.filter(id => before[id] === null).map(() => '{"entries":[]}'));
        same('and a man it never named still has none', Object.keys(before).filter(id => before[id] === null && !named.includes(id))
            .map(id => [id, after[id]]), [['w_12', null]]);
        same('the day reads as it read before: the same men unrecorded, the same count, the same names waiting',
            await page.evaluate(() => [State.unrecorded().map(worker => worker.id),
                document.querySelector('#dayView .progress-line').textContent,
                [...document.querySelectorAll('#dayView .tray-pending .chip-main')].map(node => node.textContent)]), reading);
        same('the disk holds what memory holds', await page.evaluate(day => JSON.stringify(JSON.parse(localStorage.getItem('scheduleData:v2')).days[day]), TODAY),
            await page.evaluate(day => JSON.stringify(State.schedule.days[day]), TODAY));
        same('nothing is left to step back, and nothing forward', await page.evaluate(() =>
            [document.getElementById('undoBtn').disabled, document.getElementById('redoBtn').disabled]), [true, true]);
        await page.context().close();
    }

    // ============================================================== every other question
    suite('every other question in the app is what it was');
    {
        const page = await phone(375, 667, 'light');
        await openByTap(page);
        await holdOver(page);
        await page.locator('#askCancel').tap();
        await page.waitForTimeout(100);
        const plain = await page.evaluate(() => {
            let answer = 'pending';
            askConfirm({ title: 'שאלה', message: 'משפט', ok: 'אישור' }).then(value => { answer = value; });
            const ok = document.getElementById('askOk');
            const shown = { list: document.getElementById('askList').checkVisibility(), items: document.getElementById('askList').children.length,
                danger: ok.classList.contains('btn-danger'), disabled: ok.disabled, focus: document.activeElement === ok,
                order: ok.parentElement.className, footer: document.getElementById('askFooter').checkVisibility() };
            ok.click();
            return new Promise(resolve => setTimeout(() => resolve({ ...shown, answer,
                open: document.getElementById('askModal').style.display }), 0));
        });
        same('no list, an ordinary button that has the focus, the usual order, no footer - and pressed at once, it answers',
            plain, { list: false, items: 0, danger: false, disabled: false, focus: true, order: 'modal-actions', footer: false,
                answer: true, open: 'none' });
        const cancel = await page.evaluate(() => {
            let answer = 'pending';
            askConfirm({ title: 'שאלה', message: 'משפט' }).then(value => { answer = value; });
            askCancel();
            return new Promise(resolve => setTimeout(() => resolve(answer), 0));
        });
        same('and «ביטול» answers at once too', cancel, false);
        // EVERY OTHER MENU, the same: askChoice's new settings (apart, hold, from, a choice's
        // next) are the day's menu's alone. A menu that does not ask for them - the crew's
        // «עוד ⋯», the reorder's exit question - is exactly what it was.
        const menu = await page.evaluate(() => {
            let answer = 'pending';
            askChoice({ title: 'אתר', choices: ['שינוי שם האתר', 'הסתר', 'סגור'] }).then(value => { answer = value; });
            const box = document.getElementById('askChoices');
            const answers = [...box.querySelectorAll('button')];
            const at = answers.map(node => node.getBoundingClientRect());
            const shown = { classes: box.className, disabled: answers.map(node => node.disabled), focus: document.activeElement === answers[0],
                aria: answers.map(node => node.getAttribute('aria-label')), gap: Math.round(at[1].top - at[0].bottom) };
            answers[1].click();
            return new Promise(resolve => setTimeout(() => resolve({ ...shown, answer, open: document.getElementById('askModal').style.display }), 0));
        });
        same('no class of its own, nothing held, the first answer focused, the answers 22px apart as ever - and pressed at once, it answers',
            menu, { classes: 'modal-actions ask-choices', disabled: [false, false, false], focus: true, aria: [null, null, null],
                gap: 22, answer: 'הסתר', open: 'none' });
        const dismissed = await page.evaluate(() => {
            let answer = 'pending';
            askChoice({ title: 'אתר', choices: ['שינוי שם האתר', 'סגור'] }).then(value => { answer = value; });
            askCancel();
            return new Promise(resolve => setTimeout(() => resolve(answer), 0));
        });
        same('and dismissed, it answers at once too', dismissed, null);
        await page.context().close();
    }

    suite('and nothing threw');
    check('no uncaught browser errors', errors.length === 0, JSON.stringify(errors));
} finally {
    await browser.close();
    await server.close();
}
report();
