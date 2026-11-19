// «בדיקת הצוות» in a real Chromium with a touch screen.
//
//   node tests/crewcheck.browser.mjs
//   CREWCHECK_SHOTS=<directory> node tests/crewcheck.browser.mjs    also writes JPEGs (asserts nothing)
//
// tests/crewcheck.test.mjs holds every rule, every agreement and every word on devices in
// Node. What it cannot hold is the glass (features/crewcheck/contract.md, criteria 9-16):
//
//   - THE WAY IN is one button at the foot of the crew screen, after the sites, and nothing
//     that was there before it moved: every other node of the screen in the same rectangle
//     with the file and without it, at 320x568, 375x667 and 440x956, dark and light, with
//     «תצוגה גדולה» off and on; the page taller by the row and no more; the button a finger
//     tall with its words inside, clear of the tab bar at full scroll and pressable there;
//     520px at most where the screen has two columns; and with no men, not there at all.
//   - THE DIALOG is one of the app's own: entered at its title, shut by Escape, the backdrop
//     and «סגור» with the keyboard back on the button, Tab kept inside, midEdit() true while
//     it is open; and its words on the glass are the reading's, in order.
//   - EVERY DOOR lands where it says: the form on the field to mend, on the glass, «עוד
//     פרטים» open for a number; a man's row and a site's row brought to the middle, marked,
//     their card's button focused and never the switch; the crew search emptied without the
//     keys; a man gone meanwhile opening nothing.
//   - IT WRITES NOTHING - across opening, every door and closing; a double tap; AND THE SLOW
//     SECOND TAP: a touch 350, 500 and 650 ms after a door's chip, at the chip's own point,
//     on a «פעיל» switch found on the glass, and on the form's «שמור», turns nothing, leaves
//     the form open and changes no byte - while a touch 800 ms after, and a keyboard's Enter
//     inside the window, are let through.
//   - A COMMIT UNDER THE OPEN DIALOG redraws it in place.
//   - THE FLOORS on both of tests/screens.mjs's entries, at every phone, scheme and mode,
//     and at doubled text - between them every kind of line the dialog has.
//   - THE COST at four times slower, and NOT IN A DRAW, with a spy on the real page.
//
// SYNTHETIC NAMES AND NUMBERS ONLY. NOT A REAL PHONE: Chromium with emulated touch.

import { chromium } from 'playwright';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { serve } from './serve.mjs';
import { launchLocalBrowser } from './network-guard.mjs';
import { verifyServedAssets, expectedShaFor } from './treecheck.mjs';
import { suite, check, same, given, report } from './runner.mjs';
import { censusOnly } from './census.mjs';
import { openApp, SCREENS, PHONES, SCHEMES, walk, measure, LARGE_KEY } from './screens.mjs';

const root = new URL('..', import.meta.url).pathname;
const server = await serve(root);
const served = await verifyServedAssets(server.url, root, expectedShaFor(root));
check('the origin served this commit, byte for byte', served.ok,
    `${served.checked} assets; ${(served.wrong || []).slice(0, 3).join(' | ')}`);
const browser = await launchLocalBrowser(chromium, { executablePath: process.env.CHROME_PATH });
const SHOTS = process.env.CREWCHECK_SHOTS || '';
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const errors = [];
const dialogs = [];
const GUARD = 700;          // DOUBLE_TAP_GUARD_MS, js/ui/day.js
const NOW = '2026-11-19T18:30:00+02:00';    // a Thursday evening in Israel
const FSI = '⁨';
const PDI = '⁩';
const named = name => `${FSI}${name}${PDI}`;
const HOSTILE = '<img src=x onerror="window.__pwned=1">';
const ENTRY = 'בדיקת הצוות';

// THE CREW: every kind of man and site the check names, and enough regular men that the list
// scrolls - written through the model's own writers, fifty working days ending today.
const CREW = [
    ['w_01', 'דוגמה אחת', 400, 0, '0520000101'],
    ['w_02', 'דוגמה בלי שכר', 0, 0, '0520000102'],               // no daily rate
    ['w_03', 'דוגמה מספר שבור', 400, 0, '03-5551234'],          // a number that will not open
    ['w_04', 'דוגמה משותף', 400, 0, '0520000104'],              // one number on two rows
    ['w_05', 'דוגמה משותף שני', 400, 0, '052-000-0104'],
    ['w_06', 'דוגמה כפולה', 400, 0, '0520000106'],              // one name on two rows
    ['w_07', 'דוגמה כפולה', 400, 0, '0520000107'],
    ['w_08', 'דוגמה רחוקה', 400, 0, '0520000108'],              // no work in the last 25 working days
    ['w_09', 'דוגמה מחו"ל', 400, 0, '+44 7700 900123'],         // another country's number
    ['w_10', 'דוגמה בלי טלפון', 400, 0, ''],                    // no number, working these days
    ['w_11', 'דוגמה לפי שעה', 0, 50, '0520000111'],             // an hourly rate alone: days stamped with no daily one
    ['w_12', 'דוגמה חדשה', 400, 0, '0520000112'],               // no day of work at all
    ['w_13', 'דוגמה 13', 420, 0, '0520000113'], ['w_14', 'דוגמה 14', 430, 0, '0520000114'],
    ['w_15', 'דוגמה 15', 440, 0, '0520000115'], ['w_16', 'דוגמה 16', 450, 0, '0520000116'],
    ['w_17', 'דוגמה 17', 460, 0, '0520000117'], ['w_18', 'דוגמה 18', 470, 0, '0520000118'],
    ['w_19', HOSTILE, 0, 0, '0520000119'],                       // a name written as markup, with no rate
    ['w_20', 'דוגמה כבויה', 0, 0, '1234', false]                 // switched off: on no line
];
const SITES = [['p_1', 'אתר צפון'], ['p_2', 'אתר דרום'], ['p_3', 'אתר ישן'], ['p_4', 'אתר חדש']];

function seedInPage([crew, sites, days]) {
    const S = State.schedule;
    S.workers = crew.map(([id, name, dailyRate, hourlyRate, phone, active]) =>
        ({ id, name, active: active !== false, dailyRate, hourlyRate, phone, idNumber: '' }));
    S.places = sites.map(([id, name]) => ({ id, name, active: true }));
    const working = ['w_01', 'w_02', 'w_03', 'w_04', 'w_05', 'w_06', 'w_07', 'w_09', 'w_10', 'w_13', 'w_14', 'w_15', 'w_16', 'w_17', 'w_18', 'w_19'];
    days.forEach((date, at) => {
        working.forEach((id, i) => assignPlace(S, date, id, 'actual', i % 2 ? 'p_2' : 'p_1'));
        if (at < 10) assignPlace(S, date, 'w_08', 'actual', 'p_1');
        if (at < 6) assignPlace(S, date, 'w_20', 'actual', 'p_3');
        if (at >= days.length - 3) assignPlace(S, date, 'w_11', 'actual', 'p_2');
    });
    State.save();
    State.date = todayStr();
    showView('roster');
    render();
    window.scrollTo(0, 0);
}
// Fifty days of a working week - Sunday to Friday - ending on Thursday 19 November 2026.
const WORKDAYS = (() => {
    const out = [];
    for (let at = new Date(2026, 10, 19, 12); out.length < 50; at.setDate(at.getDate() - 1)) {
        if (at.getDay() === 6) continue;
        out.unshift(`${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`);
    }
    return out;
})();

// A phone, opened on the crew screen of this record. `days`: how many of the fifty are
// written (fewer than 25 is a record the long-idle rules do not run on yet).
async function phone(width, height, scheme = 'dark', options = {}) {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
        colorScheme: scheme, serviceWorkers: 'block', timezoneId: 'Asia/Jerusalem', locale: 'he-IL' });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(`${width}x${height}: ${error.message}`));
    page.on('dialog', dialog => { dialogs.push(dialog.message()); dialog.dismiss().catch(() => {}); });
    await page.addInitScript(([key, on]) => { try { if (on) localStorage.setItem(key, '1'); } catch (error) { /* said by the app */ } },
        [LARGE_KEY, Boolean(options.large)]);
    await page.clock.install({ time: new Date(NOW) });
    await page.goto(`${server.url}/index.html`, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof State !== 'undefined' && typeof openCrewCheck === 'function');
    await page.waitForTimeout(300);
    await page.evaluate(seedInPage, [CREW, SITES, WORKDAYS.slice(WORKDAYS.length - (options.days || WORKDAYS.length))]);
    await page.waitForTimeout(250);
    // Every press the page sees, on the presses' own clock: the gap that counts is the one the
    // PAGE saw, not the one the driver meant.
    await page.evaluate(() => {
        window.__downs = [];
        window.addEventListener('pointerdown', event => window.__downs.push(event.timeStamp), true);
    });
    return { context, page };
}

const disk = page => page.evaluate(() => {
    const out = {};
    // Without the service worker's census of open builds (tests/census.mjs says why).
    Object.keys(localStorage).sort().filter(key => key !== 'farkad:openBuilds').forEach(key => { out[key] = localStorage.getItem(key); });
    return JSON.stringify(out);
});
const record = page => page.evaluate(() => JSON.stringify(State.schedule));
const isOpen = page => page.evaluate(() => crewCheckIsOpen());
const pause = (page, ms = 220) => page.waitForTimeout(ms);
const brief = (list, say) => list.slice(0, 4).map(say).join(' | ') + (list.length > 4 ? ` (+${list.length - 4})` : '');

async function stop(...contexts) {
    for (const context of contexts) await context.close();
    await browser.close();
    await server.close();
    report();
}

// ================================================================== 10. the way in

// Every node of the crew screen but the row and what is in it, by its place in the page
// (not on the glass), and the page's height.
const layout = page => page.evaluate(() => {
    const host = document.getElementById('crewCheckFoot');
    const nodes = [...document.querySelectorAll('#rosterView *')].filter(node => !host.contains(node) && node.getClientRects().length > 0);
    return { boxes: nodes.map(node => { const b = node.getBoundingClientRect();
        return `${node.tagName}.${node.className}|${Math.round(b.left)},${Math.round(b.top + scrollY)},${Math.round(b.width)},${Math.round(b.height)}`; }),
    height: document.documentElement.scrollHeight };
});
const withoutTheFile = page => page.evaluate(() => {
    window.__entryFn = renderCrewCheckEntry;
    renderCrewCheckEntry = undefined;
    const host = document.getElementById('crewCheckFoot');
    host.textContent = '';
    host.hidden = true;
    render();
});
const withTheFileAgain = page => page.evaluate(() => { renderCrewCheckEntry = window.__entryFn; render(); window.scrollTo(0, 0); });

for (const [width, height] of PHONES) for (const scheme of SCHEMES) for (const large of [false, true]) {
    const label = `${width}x${height} ${scheme}${large ? ' large' : ''}`;
    suite(`10. the way in, ${label}: one button after the sites, and nothing before it moved`);
    const { context, page } = await phone(width, height, scheme, { large });
    const there = await page.evaluate(() => {
        const host = document.getElementById('crewCheckFoot');
        const entry = document.getElementById('crewCheckEntry');
        return { inHost: Boolean(entry) && entry.parentElement === host, words: entry ? entry.textContent : null,
            afterSites: host.previousElementSibling && host.previousElementSibling.classList.contains('roster-columns'),
            last: document.getElementById('rosterView').lastElementChild === host, hidden: host.hidden,
            buttons: [...document.querySelectorAll('#rosterView button')].filter(b => b.textContent.trim() === 'בדיקת הצוות').length };
    });
    same(`${label}: the button is in its row, after the sites, the last thing on the screen`,
        [there.inHost, there.words, there.afterSites, there.last, there.hidden, there.buttons], [true, ENTRY, true, true, false, 1]);
    const withIt = await layout(page);
    const button = await page.evaluate(async () => {
        const entry = document.getElementById('crewCheckEntry');
        const box = entry.getBoundingClientRect();
        const range = document.createRange();
        range.selectNodeContents(entry);
        const lines = new Set([...range.getClientRects()].map(r => Math.round(r.top))).size;
        window.scrollTo(0, document.documentElement.scrollHeight);
        await new Promise(done => setTimeout(done, 200));
        const now = entry.getBoundingClientRect();
        const tabs = document.querySelector('.tabs').getBoundingClientRect();
        const hit = document.elementFromPoint(now.left + now.width / 2, now.top + now.height / 2);
        window.scrollTo(0, 0);
        return { w: box.width, h: box.height, lines, inside: entry.scrollWidth <= entry.clientWidth + 1,
            font: parseFloat(getComputedStyle(entry).fontSize), clear: now.bottom <= tabs.top + 0.5, pressable: hit === entry || entry.contains(hit) };
    });
    check(`${label}: a finger tall - ${large ? 52 : 48}px - its words on one line and inside it`,
        button.h >= (large ? 51.5 : 47.5) && button.w >= 44 && button.lines === 1 && button.inside, JSON.stringify(button));
    same(`${label}: its words ${large ? 20 : 16}px`, button.font, large ? 20 : 16);
    check(`${label}: at full scroll it stands wholly above the tab bar, and a press there is a press on it`,
        button.clear && button.pressable, JSON.stringify(button));
    await withoutTheFile(page);
    await pause(page);
    const without = await layout(page);
    const moved = withIt.boxes.filter((box, at) => box !== without.boxes[at]);
    same(`${label}: without the file, every other node of the crew screen is where it was`,
        [withIt.boxes.length === without.boxes.length, moved.slice(0, 3)], [true, []]);
    check(`${label}: the page is taller by the row and no more`, withIt.height > without.height && withIt.height - without.height <= 80,
        `${without.height} -> ${withIt.height}`);
    await withTheFileAgain(page);
    if (SHOTS && width === 440 && scheme === 'dark' && !large) {
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        await page.screenshot({ path: join(SHOTS, 'crew-foot-440-dark.jpg'), type: 'jpeg', quality: 80 });
    }
    await context.close();
}

suite('10. two columns: the row spans both and the button is 520px at most');
{
    const context = await browser.newContext({ viewport: { width: 1100, height: 800 }, colorScheme: 'light', serviceWorkers: 'block',
        timezoneId: 'Asia/Jerusalem', locale: 'he-IL' });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(`1100: ${error.message}`));
    await page.clock.install({ time: new Date(NOW) });
    await page.goto(`${server.url}/index.html`, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof openCrewCheck === 'function');
    await page.evaluate(seedInPage, [CREW, SITES, WORKDAYS]);
    await pause(page, 300);
    const wide = await page.evaluate(() => {
        const entry = document.getElementById('crewCheckEntry').getBoundingClientRect();
        const row = document.getElementById('crewCheckFoot').getBoundingClientRect();
        const columns = document.querySelector('#rosterView .roster-columns').getBoundingClientRect();
        return { w: entry.width, row: row.width, columns: columns.width };
    });
    check('the button is no wider than 520px', wide.w <= 520.5 && wide.w >= 400, JSON.stringify(wide));
    check('in a row the width of both columns', Math.abs(wide.row - wide.columns) <= 1, JSON.stringify(wide));
    await context.close();
}

suite('10. a crew with nobody on it: no button, and the three that start a crew, exactly');
{
    const { context, page } = await phone(375, 667, 'dark');
    const empty = await page.evaluate(async () => {
        State.schedule.workers = [];
        State.schedule.places = [];
        render();
        await new Promise(done => setTimeout(done, 150));
        return { hidden: document.getElementById('crewCheckFoot').hidden,
            shown: getComputedStyle(document.getElementById('crewCheckFoot')).display,
            buttons: [...document.querySelectorAll('#rosterView button')].filter(node => node.offsetParent !== null).map(node => node.textContent.trim()) };
    });
    same('the row is hidden and takes no room', [empty.hidden, empty.shown], [true, 'none']);
    same('what starts a crew stays - add a man, paste a list, add a site', empty.buttons, ['+ הוסף עובד', '📋 הדבק רשימה', '+ הוסף אתר']);
    await context.close();
}

// ================================================================== 11. the dialog

// What the dialog says, as drawn: its frame's words, and its list - each line as its class and
// words, each finding as its sentence, its chips (words, label, button or not) and its note.
const reading = page => page.evaluate(() => ({
    title: document.getElementById('crewCheckTitle').textContent,
    context: document.getElementById('crewCheckContext').textContent,
    lead: document.getElementById('crewCheckLead').textContent,
    close: document.getElementById('crewCheckClose').textContent,
    list: [...document.getElementById('crewCheckList').children].map(node => (node.tagName === 'SECTION'
        ? { head: node.querySelector('.daycheck-head').textContent, findings: [...node.querySelectorAll('.daycheck-finding')].map(finding => ({
            kind: finding.dataset.kind, say: finding.querySelector('.daycheck-say').textContent,
            chips: [...finding.querySelectorAll('.daycheck-chips > *')].map(chip => [chip.textContent, chip.getAttribute('aria-label'), chip.tagName === 'BUTTON']),
            note: finding.querySelector('.crewcheck-note') ? finding.querySelector('.crewcheck-note').textContent : null })) }
        : { line: node.className, words: node.textContent }))
}));
// The same, as the flat list says it should be drawn.
const expected = page => page.evaluate(() => {
    const flat = crewCheckFindings(crewCheckRead(State.schedule, todayStr(), State.layer), todayStr());
    const read = crewCheckRead(State.schedule, todayStr(), State.layer);
    const list = [];
    if (read.since === null) list.push({ line: 'crewcheck-note', words: CREW_CHECK_TEXT.tooFew(CREW_CHECK_IDLE_DAYS) });
    if (!flat.some(f => f.tier === 'check')) list.push({ line: 'daycheck-clean', words: CREW_CHECK_TEXT.clean });
    [['check', CREW_CHECK_REUSED.headCheck], ['info', CREW_CHECK_REUSED.headInfo]].forEach(([tier, head]) => {
        const mine = flat.filter(f => f.tier === tier);
        if (mine.length) list.push({ head, findings: mine.map(f => ({ kind: f.kind, say: f.say, chips: f.chips.map(c => [c.text, c.aria, true]), note: f.note })) });
    });
    return list;
});
const focusId = page => page.evaluate(() => document.activeElement && (document.activeElement.id || document.activeElement.dataset.crewcheckFocus || document.activeElement.className));
async function tapEntry(page) {
    await page.locator('#crewCheckEntry').scrollIntoViewIfNeeded();
    await page.locator('#crewCheckEntry').tap();
    await pause(page, 260);
}

const main = await phone(440, 956, 'dark');
const page = main.page;
const diskBefore = await disk(page);
await censusOnly(check, page, diskBefore);
const recordBefore = await record(page);
const switches = () => page.evaluate(() => JSON.stringify(State.schedule.workers.map(w => [w.id, w.active])));
const switchesBefore = await switches();

{
    suite('11. the dialog, 440x956: entered at its title, its words the reading\'s, in order');
    await tapEntry(page);
    check('a tap on the button opens it', await isOpen(page));
    same('the keyboard is on its title', await focusId(page), 'crewCheckTitle');
    same('no other dialog opened with it', await page.evaluate(() => [...document.querySelectorAll('.modal')]
        .filter(modal => modal.style.display === 'flex').map(modal => modal.id)), ['crewCheckModal']);
    same('midEdit() is true while it is open - an update waits for it', await page.evaluate(() => midEdit()), true);
    const read = await reading(page);
    same('its title, the line under it, the lead and its one button',
        [read.title, read.context, read.lead, read.close],
        ['בדיקת הצוות', 'יום חמישי 19/11/2026 · עובדים פעילים: 19 · אתרים פעילים: 4',
            'הבדיקה רק מראה מה כדאי לבדוק. היא לא משנה ולא שומרת דבר.', 'סגור']);
    same('the list, line by line, is the flat list drawn', read.list, await expected(page));
    same('every kind, in the order the contract gives them', read.list.flatMap(group => (group.findings || []).map(f => f.kind)),
        ['noRate', 'badPhone', 'sharedPhone', 'sameName', 'idle', 'idleSites', 'otherPhone', 'noPhone', 'zeroStamped', 'never', 'neverSites']);
    same('the idle man and his note, as the dialog says them', read.list[0].findings.find(f => f.kind === 'idle'),
        { kind: 'idle', say: 'לא עבד ב-25 ימי העבודה האחרונים (מאז 22/10), ועדיין פעיל:',
            chips: [[`${named('דוגמה רחוקה')} · 04/10`, `${named('דוגמה רחוקה')} · 04/10 - הצג את ${named('דוגמה רחוקה')} ברשימת העובדים`, true]],
            note: 'אם מכבים עובד בכפתור «פעיל»: הימים שכבר נרשמו יישמרו, והעובד לא יופיע ברשימה היומית.' });
    same('a name written as markup is drawn as its letters', await page.evaluate(() => [document.querySelectorAll('#crewCheckModal img').length,
        typeof window.__pwned]), [0, 'undefined']);
    same('it has no field to type in: there is nothing to save in it', await page.evaluate(() =>
        document.querySelectorAll('#crewCheckModal input, #crewCheckModal select, #crewCheckModal textarea').length), 0);
    if (SHOTS) await page.screenshot({ path: join(SHOTS, 'dialog-440-dark.jpg'), type: 'jpeg', quality: 80 });

    suite('11. Tab stays inside; Escape, «סגור» and the backdrop shut it, the keyboard back on the button');
    const inside = [];
    for (let i = 0; i < 40; i += 1) {
        await page.keyboard.press('Tab');
        inside.push(await page.evaluate(() => document.getElementById('crewCheckModal').contains(document.activeElement)));
    }
    check('forty Tabs, past the last control and round again, never leave the dialog', inside.every(Boolean));
    await page.keyboard.press('Shift+Tab');
    check('nor does Shift+Tab', await page.evaluate(() => document.getElementById('crewCheckModal').contains(document.activeElement)));
    await page.keyboard.press('Escape');
    await pause(page);
    same('Escape shuts it, and the keyboard is on «בדיקת הצוות»', [await isOpen(page), await focusId(page)], [false, 'crewCheckEntry']);
    same('midEdit() is false once it is shut', await page.evaluate(() => midEdit()), false);
    await tapEntry(page);
    await page.locator('#crewCheckClose').tap();
    await pause(page);
    same('«סגור» shuts it, the keyboard back on the button', [await isOpen(page), await focusId(page)], [false, 'crewCheckEntry']);
    await tapEntry(page);
    await page.mouse.click(4, 4);
    await pause(page);
    same('and so does the backdrop, like every dialog of the app', [await isOpen(page), await focusId(page)], [false, 'crewCheckEntry']);
}

{
    suite('11. a record of fewer than 25 working days: the too-few line first, then the list');
    const short = await phone(375, 667, 'light', { days: 20 });
    await tapEntry(short.page);
    const read = await reading(short.page);
    same('the first line says the long-idle rules have not run', read.list[0],
        { line: 'crewcheck-note', words: 'עדיין אין 25 ימי עבודה רשומים, ולכן לא נבדקו עובדים ואתרים בלי עבודה זמן רב.' });
    same('and the rest is the flat list, with no idle man or site in it', read.list, await expected(short.page));
    check('no idle line at all', !JSON.stringify(read.list).includes('"idle'));
    await short.context.close();
}

// ================================================================== 12. every door

const chip = (kind, id, site) => page.locator(`#crewCheckList [data-crewcheck-focus="${kind}:${site ? 'p' : 'w'}:${id}"]`);
async function openFresh() {
    await page.evaluate(() => { if (crewCheckIsOpen()) closeCrewCheck(); window.scrollTo(0, 0); openCrewCheck(); });
    await pause(page, 120);
}
// Where a row landed: on the glass between the top bar and the tab bar, marked, and what has
// the keyboard.
const landing = (rowSelector, key, id) => page.evaluate(([rowSelector, key, id]) => {
    const row = [...document.querySelectorAll(rowSelector)].find(node => node.dataset[key] === id);
    if (!row) return null;
    const box = row.getBoundingClientRect();
    const top = document.querySelector('.topbar');
    const topBottom = top && /fixed|sticky/.test(getComputedStyle(top).position) ? top.getBoundingClientRect().bottom : 0;
    const tabs = document.querySelector('.tabs').getBoundingClientRect();
    const active = document.activeElement;
    return { onGlass: box.top >= topBottom - 1 && box.bottom <= tabs.top + 1, marked: row.classList.contains('crewcheck-here'),
        focus: active && row.contains(active) ? active.className : (active ? active.id || active.className : null),
        onSwitch: Boolean(active && active.closest && active.closest('.worker-active-toggle')), open: crewCheckIsOpen() };
}, [rowSelector, key, id]);

{
    suite('12. a form door: the form «עריכת עובד» for his row, the field he came to mend focused and on the glass');
    const forms = [['noRate', 'w_02', 'workerFormDaily', 'דוגמה בלי שכר'], ['badPhone', 'w_03', 'workerFormPhone', 'דוגמה מספר שבור'],
        ['sharedPhone', 'w_05', 'workerFormPhone', 'דוגמה משותף שני'], ['sameName', 'w_07', 'workerFormName', 'דוגמה כפולה'],
        ['otherPhone', 'w_09', 'workerFormPhone', 'דוגמה מחו"ל'], ['noPhone', 'w_10', 'workerFormPhone', 'דוגמה בלי טלפון']];
    for (const [kind, id, field, name] of forms) {
        await openFresh();
        await chip(kind, id).tap();
        await pause(page, 250);
        const form = await page.evaluate(field => {
            const modal = document.getElementById('workerFormModal');
            const box = document.getElementById(field).getBoundingClientRect();
            return { shown: modal.style.display, title: document.getElementById('workerFormTitle').textContent,
                name: document.getElementById('workerFormName').value, focus: document.activeElement.id,
                onGlass: box.top >= 0 && box.bottom <= innerHeight && box.height > 0, more: document.getElementById('workerFormMore').open,
                check: crewCheckIsOpen() };
        }, field);
        same(`${kind}: the check shut, the form open for ${name}, «${field}» focused and on the glass`,
            [form.check, form.shown, form.title, form.name, form.focus, form.onGlass], [false, 'flex', 'עריכת עובד', name, field, true]);
        if (field === 'workerFormPhone') check(`${kind}: «עוד פרטים» open, where the number is`, form.more);
        await page.waitForTimeout(GUARD);
        await page.locator('#workerFormModal button[onclick="closeWorkerForm()"]').tap();
        await pause(page);
        same(`${kind}: «ביטול» shuts the form and the keyboard comes back to the button`,
            [await page.evaluate(() => document.getElementById('workerFormModal').style.display), await focusId(page)], ['none', 'crewCheckEntry']);
    }
    check('the man with no number had the fold shut by the form itself - the door opened it', await page.evaluate(() => {
        editWorker('w_10'); const shut = !document.getElementById('workerFormMore').open; closeWorkerForm(); return shut; }));

    suite('12. a row door: one task after the dialog shut, his row in the middle, marked, «כרטיס עובד» focused - never the switch');
    await page.evaluate(() => {
        window.__landSaw = [];
        const real = crewCheckLandRow;
        window.crewCheckLandRow = function () { window.__landSaw.push(crewCheckIsOpen()); return real.apply(this, arguments); };
        const realSite = crewCheckLandSite;
        window.crewCheckLandSite = function () { window.__landSaw.push(crewCheckIsOpen()); return realSite.apply(this, arguments); };
    });
    for (const [kind, id] of [['idle', 'w_08'], ['never', 'w_12'], ['zeroStamped', 'w_11']]) {
        await openFresh();
        const before = await page.evaluate(() => window.scrollY);
        await chip(kind, id).tap();
        await pause(page, 300);
        const at = await landing('#workerList .roster-row', 'workerId', id);
        same(`${kind}: landed with the dialog shut, on the glass, marked, on his card's button`,
            [at && at.open, at && at.onGlass, at && at.marked, at && at.focus, at && at.onSwitch],
            [false, true, true, 'btn-secondary worker-card-open', false]);
        check(`${kind}: the page really moved to get there`, Math.abs(await page.evaluate(() => window.scrollY) - before) > 40);
        if (SHOTS && kind === 'idle') await page.screenshot({ path: join(SHOTS, 'landed-row-440-dark.jpg'), type: 'jpeg', quality: 80 });
    }
    same('each landing ran in a task of its own, the dialog already shut', await page.evaluate(() => window.__landSaw), [false, false, false]);
    await page.waitForTimeout(2600);
    same('and the mark is gone after a moment', await page.evaluate(() => document.querySelectorAll('.crewcheck-here').length), 0);

    suite('12. a site door: the site\'s row in the middle, marked, «כרטיס אתר» focused');
    for (const [kind, id] of [['idleSites', 'p_3'], ['neverSites', 'p_4']]) {
        await openFresh();
        await chip(kind, id, true).tap();
        await pause(page, 300);
        const at = await landing('#placeList .roster-row', 'placeId', id);
        same(`${kind}: landed with the dialog shut, on the glass, marked, on its card's button`,
            [at && at.open, at && at.onGlass, at && at.marked, at && at.focus], [false, true, true, 'btn-secondary site-card-open']);
    }

    suite('12. words in the crew search that hide him: emptied without the keys, and landed');
    await page.evaluate(() => {
        const field = document.getElementById('rosterWorkerSearch');
        field.value = 'דוגמה 13';
        field.dispatchEvent(new Event('input', { bubbles: true }));
        field.blur();
    });
    await pause(page);
    given('the search hides him', await page.evaluate(() => ![...document.querySelectorAll('#workerList .roster-row')].some(row => row.dataset.workerId === 'w_08')));
    await openFresh();
    await chip('idle', 'w_08').tap();
    await pause(page, 300);
    const searched = await page.evaluate(() => ({ value: document.getElementById('rosterWorkerSearch').value,
        focused: document.activeElement === document.getElementById('rosterWorkerSearch') }));
    same('the field is empty and does not have the keyboard', searched, { value: '', focused: false });
    const at = await landing('#workerList .roster-row', 'workerId', 'w_08');
    same('and he is landed on', [at && at.onGlass, at && at.marked, at && at.focus], [true, true, 'btn-secondary worker-card-open']);

    suite('12. a man gone from the record when his chip is pressed: nothing opens');
    await openFresh();
    await page.evaluate(() => { window.__gone = State.schedule.workers.find(w => w.id === 'w_12');
        State.schedule.workers = State.schedule.workers.filter(w => w.id !== 'w_12'); window.scrollTo(0, 0); });
    await chip('never', 'w_12').tap();
    await pause(page, 300);
    same('the check shut, no form, no row marked, the page where it was', await page.evaluate(() => [crewCheckIsOpen(),
        document.getElementById('workerFormModal').style.display === 'flex', document.querySelectorAll('.crewcheck-here').length, window.scrollY]),
    [false, false, 0, 0]);
    await page.evaluate(() => { State.schedule.workers.splice(11, 0, window.__gone); render(); });
}

// ================================================================== 13. nothing written

{
    suite('13. after every door, every key on the disk holds the bytes it held');
    same('the whole of localStorage, byte for byte', await disk(page), diskBefore);
    same('the record in memory', await record(page), recordBefore);
    same('no switch turned', await switches(), switchesBefore);
}

// Two taps: the chip, then `target` (a point, or a function of the page giving one) `gap` ms
// after the chip's press, on the presses' own clock. Made again when the page saw a gap too
// far from the one asked for. Returns what was under the second finger and the gap seen.
async function twoTaps(chipLocator, target, gap) {
    for (let attempt = 0; attempt < 4; attempt += 1) {
        await openFresh();
        await page.evaluate(() => { window.__downs.length = 0; });
        await chipLocator.scrollIntoViewIfNeeded();
        await pause(page, 60);
        const box = await chipLocator.boundingBox();
        const at = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
        const started = Date.now();
        await page.touchscreen.tap(at.x, at.y);
        const point = typeof target === 'function' ? await target(at) : (target || at);
        if (!point) return { missing: true };
        const wait = started + gap - Date.now();
        if (wait > 0) await page.waitForTimeout(wait);
        const under = await page.evaluate(({ x, y }) => { const node = document.elementFromPoint(x, y);
            const hit = node && node.closest('button'); return hit ? `${hit.className}|${hit.textContent.trim().slice(0, 20)}` : (node ? node.id || node.className : null); }, point);
        await page.touchscreen.tap(point.x, point.y);
        await pause(page, 250);
        const seen = await page.evaluate(() => { const d = window.__downs; return d.length > 1 ? Math.round(d[d.length - 1] - d[d.length - 2]) : null; });
        if (seen !== null && Math.abs(seen - gap) <= 120 && (gap < GUARD ? seen < GUARD - 10 : seen > GUARD + 10)) return { under, seen };
        await page.evaluate(() => { if (document.getElementById('askModal').style.display === 'flex') askCancel(); });
        await page.evaluate(() => { [...document.querySelectorAll('.modal')].forEach(m => { if (m.style.display === 'flex' && MODAL_CLOSERS[m.id]) MODAL_CLOSERS[m.id](); }); });
        await pause(page, 150);
    }
    return { failed: true };
}
// Back to the crew screen with nothing open, between two trials.
async function settle() {
    await page.evaluate(() => {
        if (document.getElementById('askModal').style.display === 'flex') askCancel();
        [...document.querySelectorAll('.modal')].forEach(m => { if (m.style.display === 'flex' && MODAL_CLOSERS[m.id]) MODAL_CLOSERS[m.id](); });
        window.scrollTo(0, 0);
    });
    await pause(page, 760);
}
// The centre of a «פעיל» switch on the glass, found with elementFromPoint - his own, or another man's.
const switchOnGlass = (whose, mine) => page.evaluate(([whose, mine]) => {
    const tabs = document.querySelector('.tabs').getBoundingClientRect();
    const all = [...document.querySelectorAll('#workerList .worker-active-toggle')];
    const pick = all.filter(node => {
        const row = node.closest('.roster-row');
        if ((whose === 'his') !== (row.dataset.workerId === mine)) return false;
        const b = node.getBoundingClientRect();
        const x = b.left + b.width / 2; const y = b.top + b.height / 2;
        if (y < 70 || y > tabs.top - 4) return false;
        const hit = document.elementFromPoint(x, y);
        return hit && hit.closest('.worker-active-toggle') === node;
    })[0];
    if (!pick) return null;
    const b = pick.getBoundingClientRect();
    return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
}, [whose, mine]);
const saveOnGlass = () => page.evaluate(() => {
    const save = document.querySelector('#workerFormModal button[onclick="saveWorkerForm()"]');
    save.scrollIntoView({ block: 'center' });
    const b = save.getBoundingClientRect();
    const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
    return hit === save ? { x: b.left + b.width / 2, y: b.top + b.height / 2 } : null;
});

{
    suite('13. a double tap on a door is one tap: the second press is the page\'s to spend');
    for (const [kind, id] of [['idle', 'w_08'], ['noRate', 'w_02']]) {
        const done = await twoTaps(chip(kind, id), null, 120);
        check(`${kind}: the two presses were a double tap`, !done.failed && done.seen < 300, JSON.stringify(done));
        same(`${kind}: no byte moved and no switch turned`, [await disk(page), await switches()], [diskBefore, switchesBefore]);
        if (kind === 'noRate') same('and the form is still open', await page.evaluate(() => document.getElementById('workerFormModal').style.display), 'flex');
        await settle();
    }

    suite('13. THE SLOW SECOND TAP: 350, 500 and 650 ms after a door\'s chip, nothing turns, the form stays open, no byte moves');
    const trials = [];
    for (const gap of [350, 500, 650]) {
        trials.push(['row', 'the chip\'s own point', gap, () => twoTaps(chip('idle', 'w_08'), null, gap)]);
        trials.push(['row', 'his own «פעיל»', gap, () => twoTaps(chip('idle', 'w_08'), async () => { await pause(page, 60); return switchOnGlass('his', 'w_08'); }, gap)]);
        trials.push(['row', 'another man\'s «פעיל»', gap, () => twoTaps(chip('idle', 'w_08'), async () => { await pause(page, 60); return switchOnGlass('other', 'w_08'); }, gap)]);
        trials.push(['site', 'the chip\'s own point', gap, () => twoTaps(chip('idleSites', 'p_3', true), null, gap)]);
        trials.push(['site', 'a man\'s «פעיל» on the glass', gap, () => twoTaps(chip('idleSites', 'p_3', true), async () => { await pause(page, 60); return switchOnGlass('other', ''); }, gap)]);
        trials.push(['form', 'the chip\'s own point', gap, () => twoTaps(chip('noRate', 'w_02'), null, gap)]);
        trials.push(['form', 'the form\'s «שמור»', gap, () => twoTaps(chip('noRate', 'w_02'), async () => { await pause(page, 30); return saveOnGlass(); }, gap)]);
    }
    for (const [door, where, gap, make] of trials) {
        const done = await make();
        const name = `${door} door, ${gap} ms, on ${where}`;
        if (done.missing) { check(`${name}: there was such a point on the glass`, false); await settle(); continue; }
        check(`${name}: the page saw the second press inside the hold`, !done.failed, JSON.stringify(done));
        if (where.includes('«פעיל»')) check(`${name}: what was under the finger was a switch`, /worker-active-toggle/.test(done.under || ''), String(done.under));
        if (where.includes('«שמור»')) check(`${name}: what was under the finger was «שמור»`, /שמור/.test(done.under || ''), String(done.under));
        same(`${name}: no switch turned and no byte moved`, [await switches(), await disk(page)], [switchesBefore, diskBefore]);
        if (door === 'form') same(`${name}: the form is still open`, await page.evaluate(() => document.getElementById('workerFormModal').style.display), 'flex');
        await settle();
    }
    same('after all of it, the record in memory', await record(page), recordBefore);
}

{
    suite('13. the hold is a window, not a lock: 800 ms after the chip a switch turns, and a keyboard\'s Enter inside it too');
    const late = await twoTaps(chip('idle', 'w_08'), async () => { await pause(page, 60); return switchOnGlass('his', 'w_08'); }, GUARD + 100);
    check('the page saw the second press after the hold', !late.failed && !late.missing && late.seen > GUARD, JSON.stringify(late));
    same('his switch turned: he is switched off', await page.evaluate(() => State.worker('w_08').active), false);
    await settle();
    await page.evaluate(() => { State.worker('w_08').active = true; State.commitRoster(); render(); });
    await pause(page);
    given('and the block put him back', await page.evaluate(() => State.worker('w_08').active === true));
    await openFresh();
    await chip('idle', 'w_08').tap();
    await pause(page, 120);
    const keyed = await page.evaluate(() => {
        const row = [...document.querySelectorAll('#workerList .roster-row')].find(node => node.dataset.workerId === 'w_08');
        const toggle = row.querySelector('.worker-active-toggle');
        toggle.focus();
        return document.activeElement === toggle;
    });
    given('his switch has the keyboard, inside the hold', keyed);
    await page.keyboard.press('Enter');
    await pause(page, 300);
    same('Enter turns it: a keyboard is never held', await page.evaluate(() => State.worker('w_08').active), false);
    await page.evaluate(() => { State.worker('w_08').active = true; State.commitRoster(); render(); });
    await settle();
}

// ================================================================== 14. a commit under the open dialog

{
    suite('14. a roster changed under the open dialog: the line gone, the scroll kept, the chip that had the keyboard keeps it');
    await openFresh();
    const before = await page.evaluate(() => {
        const content = document.querySelector('#crewCheckModal .modal-content');
        content.scrollTop = Math.round((content.scrollHeight - content.clientHeight) / 2);
        const chip = [...document.querySelectorAll('#crewCheckList [data-crewcheck-focus]')].find(node => node.dataset.crewcheckFocus === 'noPhone:w:w_10');
        chip.focus({ preventScroll: true });
        return { top: content.scrollTop, max: content.scrollHeight - content.clientHeight };
    });
    given('the dialog scrolls, and was scrolled', before.top > 20, JSON.stringify(before));
    // What a snapshot from another phone does: the roster changes and the screen is drawn again.
    await page.evaluate(() => { State.worker('w_03').phone = '0520000103'; State.commitRoster(); render(); });
    await pause(page);
    const after = await page.evaluate(() => ({ open: crewCheckIsOpen(), kinds: [...document.querySelectorAll('#crewCheckList .daycheck-finding')].map(node => node.dataset.kind),
        top: document.querySelector('#crewCheckModal .modal-content').scrollTop, focus: document.activeElement.dataset.crewcheckFocus }));
    same('a number mended on another phone: still open, the line gone', [after.open, after.kinds.includes('badPhone')], [true, false]);
    check('the scroll kept', Math.abs(after.top - before.top) <= 1, `${before.top} -> ${after.top}`);
    same('the chip that had the keyboard has it again', after.focus, 'noPhone:w:w_10');
    await page.evaluate(() => { State.worker('w_08').active = false; State.commitRoster(); render(); });
    await pause(page);
    const off = await page.evaluate(() => [...document.querySelectorAll('#crewCheckList .daycheck-finding')].map(node => node.dataset.kind));
    same('a man switched off there: his idle line gone too', off.includes('idle'), false);
    await page.evaluate(() => { State.worker('w_08').active = true; State.worker('w_03').phone = '03-5551234'; State.commitRoster(); closeCrewCheck(); render(); });
    await pause(page);
}

// ================================================================== 9. not in a draw, on the real page

{
    suite('9. on the real page: draws with the dialog shut read nothing, and once each while it is open');
    const counted = await page.evaluate(() => {
        window.__reads = 0;
        const real = crewCheckRead;
        window.crewCheckRead = function () { window.__reads += 1; return real.apply(this, arguments); };
        showView('roster');
        const entry = document.getElementById('crewCheckEntry');
        for (let k = 0; k < 10; k += 1) render();
        const shut = window.__reads;
        const same = document.getElementById('crewCheckEntry') === entry;
        openCrewCheck();
        const opened = window.__reads;
        for (let k = 0; k < 3; k += 1) render();
        const drawn = window.__reads;
        closeCrewCheck();
        const kept = State.schedule.workers;
        State.schedule.workers = [];
        render();
        const nobody = document.getElementById('crewCheckFoot').hidden;
        State.schedule.workers = kept;
        render();
        window.crewCheckRead = real;
        return { shut, same, opened, drawn, nobody, shown: !document.getElementById('crewCheckFoot').hidden };
    });
    same('ten draws shut: no reading; the button the same node; one reading to open, one a draw open; hidden with nobody',
        counted, { shut: 0, same: true, opened: 1, drawn: 4, nobody: true, shown: true });
}

// ================================================================== «מה חדש»'s landing, for the integrator

{
    suite('the landing «מה חדש» is handed: the button brought to the middle and given the keyboard, never pressed');
    await page.evaluate(() => { showView('day'); window.scrollTo(0, 0); });
    await pause(page);
    const landed = await page.evaluate(async () => {
        showView('roster');
        await new Promise(done => setTimeout(done, 0));
        const went = crewCheckFocusEntry();
        const box = document.getElementById('crewCheckEntry').getBoundingClientRect();
        return { went, focus: document.activeElement.id, onGlass: box.top >= 0 && box.bottom <= innerHeight, open: crewCheckIsOpen() };
    });
    same('on the crew screen, focused, on the glass, the dialog not opened', landed, { went: true, focus: 'crewCheckEntry', onGlass: true, open: false });
    same('and with nobody on the crew it says it could not', await page.evaluate(() => { const kept = State.schedule.workers;
        State.schedule.workers = []; render(); const went = crewCheckFocusEntry(); State.schedule.workers = kept; render(); return went; }), false);
}

{
    suite('13. and at the end, nothing this suite did but its own deliberate writes moved the disk');
    // The two deliberate blocks above wrote the roster back as it was; the record is the same.
    same('the record in memory is the record it opened with', JSON.parse(await record(page)).workers, JSON.parse(recordBefore).workers);
}
await main.context.close();

// ================================================================== 15. the floors, on tests/screens.mjs's two entries

const MINE = screen => screen.name.startsWith('crew - «בדיקת הצוות»');
suite('15. tests/screens.mjs walks the dialog twice, straight after the crew\'s reorder panel');
{
    const at = SCREENS.findIndex(screen => screen.name === 'crew - reorder');
    same('its two entries, in their place', SCREENS.slice(at + 1, at + 3).map(screen => [screen.name, screen.scope]),
        [['crew - «בדיקת הצוות», calm', ['#crewCheckModal']], ['crew - «בדיקת הצוות», with findings', ['#crewCheckModal']]]);
}
const words = t => `${t.size}px/${t.weight} ${t.contrast} «${t.words}» ${t.where}`;
const seenKinds = new Set();
let seenNote = false;
for (const [width, height] of PHONES) for (const scheme of SCHEMES) for (const large of [false, true]) {
    const label = `${width}x${height} ${scheme}${large ? ' large' : ''}`;
    suite(`15. the floors, ${label}: both entries`);
    const { context, page: p, errors: pageErrors } = await openApp(browser, server.url, { width, height, scheme, large });
    await walk(p, async (screen, failed) => {
        const name = `${label}: ${screen.name}`;
        if (failed) { check(`${name} opened`, false, failed); return; }
        const read = await measure(p, screen.scope);
        const live = read.texts.filter(t => !t.off);
        given(`${name}: there is something on it to measure`, live.length > 10, String(live.length));
        const kinds = await p.evaluate(() => ({ kinds: [...document.querySelectorAll('#crewCheckList .daycheck-finding')].map(node => node.dataset.kind),
            note: document.querySelectorAll('#crewCheckList .crewcheck-note').length }));
        kinds.kinds.forEach(kind => seenKinds.add(kind));
        if (kinds.note > 0) seenNote = true;
        const small = live.filter(t => t.size < (large ? 18 : 14));
        check(`${name}: no letter under ${large ? 18 : 14}px`, small.length === 0, brief(small, words));
        if (large) {
            const thin = live.filter(t => t.weight < 500);
            check(`${name}: nothing lighter than 500`, thin.length === 0, brief(thin, words));
        }
        const weak = live.filter(t => t.contrast !== null && t.contrast < (large ? 7 : 4.5));
        check(`${name}: every word at ${large ? 7 : 4.5}:1 on the ground really painted`, weak.length === 0, brief(weak, words));
        const fingers = read.targets.filter(t => t.w < (large ? 51.5 : 43.5) || t.h < (large ? 51.5 : 43.5));
        check(`${name}: every target ${large ? 52 : 44}px both ways`, fingers.length === 0, brief(fingers, t => `${t.w}x${t.h} «${t.words}» ${t.where}`));
        same(`${name}: no sideways scroll`, read.page.scrollWidth, width);
        check(`${name}: nothing off the side, cut, over another control or past its edge`,
            read.offside.length + read.cut.length + read.overlaps.length + read.spills.length === 0,
            brief([...read.offside, ...read.cut, ...read.overlaps, ...read.spills], o => `${o.by || ''} «${o.words || ''}» ${o.where}`));
        check(`${name}: nothing out of reach - the dialog scrolls`, read.unreachable.length === 0, brief(read.unreachable, u => `«${u.words}» ${u.where}`));
        const end = await p.evaluate(async () => {
            const content = document.querySelector('#crewCheckModal .modal-content');
            content.scrollTop = content.scrollHeight;
            await new Promise(done => setTimeout(done, 80));
            const close = document.getElementById('crewCheckClose').getBoundingClientRect();
            const chips = [...document.querySelectorAll('#crewCheckList .daycheck-go')];
            const last = chips[chips.length - 1].getBoundingClientRect();
            const hit = document.elementFromPoint(close.left + close.width / 2, close.top + close.height / 2);
            const top = document.getElementById('crewCheckTitle').getBoundingClientRect();
            content.scrollTop = 0;
            return { close: close.bottom <= innerHeight + 1 && hit === document.getElementById('crewCheckClose'),
                last: last.bottom <= close.top + 1 && last.top >= 0 };
        });
        same(`${name}: at the end of the list the last chip and «סגור» are on the glass and pressable`, end, { close: true, last: true });
        if (SHOTS && width === 320 && scheme === 'dark' && large && screen.name.endsWith('with findings')) {
            await p.screenshot({ path: join(SHOTS, 'dialog-320-large-dark.jpg'), type: 'jpeg', quality: 80 });
        }
        if (SHOTS && width === 440 && scheme === 'dark' && !large && screen.name.endsWith('with findings')) {
            await p.screenshot({ path: join(SHOTS, 'dialog-with-findings-440-dark.jpg'), type: 'jpeg', quality: 80 });
        }
    }, MINE);
    pageErrors.forEach(message => errors.push(`${label}: ${message}`));
    await context.close();
}
same('between the two entries every kind of line and the quiet note is on the glass, measured',
    [[...seenKinds].sort(), seenNote], [['badPhone', 'idle', 'idleSites', 'never', 'neverSites', 'noPhone', 'noRate', 'otherPhone', 'sameName',
        'sharedPhone', 'zeroStamped'], true]);

// Twice the text size, the way tests/mobile.test.mjs makes it: every font-size of the cascade
// doubled, so a redraw keeps it.
const doubleEveryFontSize = target => target.evaluate(() => {
    const out = [];
    const walkRules = (rules, wrap) => {
        for (const rule of rules) {
            if (rule.type === 4 || rule.type === 12) {
                const head = rule.type === 4 ? `@media ${rule.media.mediaText}` : `@supports ${rule.conditionText}`;
                walkRules(rule.cssRules, said => wrap(`${head}{${said}}`));
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
        if (rules) walkRules(rules, said => out.push(said));
    }
    const style = document.createElement('style');
    style.id = 'ax2-cascade';
    style.textContent = out.join('\n');
    document.head.appendChild(style);
    return out.length;
});
for (const [width, height] of PHONES) {
    const label = `${width}x${height}, the text doubled`;
    suite(`15. ${label}: the button and both entries still fit the phone`);
    const { context, page: p, errors: pageErrors } = await openApp(browser, server.url, { width, height, scheme: 'dark' });
    given(`${label}: the cascade was doubled`, await doubleEveryFontSize(p) > 100);
    await p.evaluate(() => { showView('roster'); window.scrollTo(0, document.documentElement.scrollHeight); });
    await pause(p, 300);
    const foot = await p.evaluate(() => {
        const entry = document.getElementById('crewCheckEntry');
        const b = entry.getBoundingClientRect();
        return { inside: entry.scrollWidth <= entry.clientWidth + 1 && b.right <= innerWidth + 1 && b.left >= -1,
            wide: document.documentElement.scrollWidth, size: parseFloat(getComputedStyle(entry).fontSize) };
    });
    same(`${label}: the button's words inside it at 32px, and no sideways scroll`, [foot.inside, foot.wide, foot.size], [true, width, 32]);
    await walk(p, async (screen, failed) => {
        const name = `${label}: ${screen.name}`;
        if (failed) { check(`${name} opened`, false, failed); return; }
        const read = await measure(p, screen.scope);
        same(`${name}: no sideways scroll`, read.page.scrollWidth, width);
        check(`${name}: nothing off the side or cut`, read.offside.length + read.cut.length === 0,
            brief([...read.offside, ...read.cut], o => `${o.by || ''} «${o.words || ''}» ${o.where}`));
        check(`${name}: nothing out of reach`, read.unreachable.length === 0, brief(read.unreachable, u => `«${u.words}» ${u.where}`));
    }, MINE);
    pageErrors.forEach(message => errors.push(`${label}: ${message}`));
    await context.close();
}

// ================================================================== the cost at four times slower

{
    suite('the cost: the reading of a year\'s record, and a tap to the dialog painted, at 4x CPU');
    const context = await browser.newContext({ viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
        colorScheme: 'dark', serviceWorkers: 'block', timezoneId: 'Asia/Jerusalem', locale: 'he-IL' });
    const p = await context.newPage();
    p.on('pageerror', error => errors.push(`cost: ${error.message}`));
    await p.goto(`${server.url}/index.html`, { waitUntil: 'load' });
    await p.waitForFunction(() => typeof openCrewCheck === 'function');
    // The time-season record (40 men, 6 sites, 2026-01-01..11-19 without Saturdays), built in
    // the page by the model's writers with tests/crewcheck.test.mjs's own generator.
    await p.evaluate(() => {
        todayStr = () => '2026-11-19';
        let a = 20261119 >>> 0;
        const rand = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
        const pick = list => list[Math.floor(rand() * list.length)];
        const S = State.schedule;
        S.places = [1, 2, 3, 4, 5, 6].map(n => ({ id: `p_${n}`, name: `אתר ${n}`, active: true }));
        S.workers = [];
        const days = [];
        for (let at = new Date(2026, 0, 1, 12); at <= new Date(2026, 10, 19, 12); at.setDate(at.getDate() + 1)) if (at.getDay() !== 6) days.push(toLocalDateStr(at));
        for (let n = 1; n <= 40; n += 1) {
            const id = `w_${String(n).padStart(2, '0')}`;
            S.workers.push(Object.assign({ id, name: `עובד ${n}`, active: true, dailyRate: pick([380, 420, 450, 500, 550, 610, 650]),
                hourlyRate: pick([0, 0, 45, 50]), phone: `05200${String(10000 + n)}`, idNumber: '' }, n <= 16 ? { payCycles: '2026-01-02=weekly' } : {}));
            const home = `p_${1 + (n % 6)}`;
            days.forEach(date => {
                if (rand() > 0.85) return;
                if (rand() < 0.02) { markAbsent(S, date, id, 'actual'); return; }
                const r = rand();
                if (r < 0.03) assignPlace(S, date, id, 'actual', home, 'double');
                else if (r < 0.08) assignPlace(S, date, id, 'actual', home, 'extra', 1 + Math.floor(rand() * 3));
                else assignPlace(S, date, id, 'actual', home, 'normal');
                if (rand() < 0.05) assignPlace(S, date, id, 'actual', `p_${1 + ((n + 3) % 6)}`, 'normal');
            });
        }
        days.forEach(date => {
            if (rand() < 0.4) setRimaCount(S, date, 'p_1', 1 + Math.floor(rand() * 4));
            if (rand() < 0.3) setRimaCount(S, date, 'p_3', 1 + Math.floor(rand() * 3));
            if (rand() < 0.3) setYosefGevesCount(S, date, 'p_2', 1 + Math.floor(rand() * 5));
        });
        showView('roster');
        render();
    });
    given('the record is the time-season record', await p.evaluate(() => Object.keys(State.schedule.days).length === 277 && State.schedule.workers.length === 40));
    const cdp = await context.newCDPSession(p);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    const runs = await p.evaluate(() => {
        const out = [];
        for (let k = 0; k < 15; k += 1) { const t = performance.now(); crewCheckRead(State.schedule, todayStr(), State.layer); out.push(performance.now() - t); }
        return out.sort((x, y) => x - y);
    });
    console.log(`  (one reading at 4x: median ${runs[7].toFixed(1)} ms, max ${runs[14].toFixed(1)} ms of 15)`);
    check('one reading: at most 60 ms, the median of 15', runs[7] <= 60, runs[7].toFixed(1));
    await p.evaluate(() => {
        const entry = document.getElementById('crewCheckEntry');
        window.__painted = null;
        entry.addEventListener('pointerdown', event => { window.__pressed = event.timeStamp; }, { capture: true, once: true });
        entry.addEventListener('click', () => requestAnimationFrame(() => requestAnimationFrame(() => {
            window.__painted = performance.now() - window.__pressed; })), { once: true });
    });
    await p.locator('#crewCheckEntry').scrollIntoViewIfNeeded();
    await p.locator('#crewCheckEntry').tap();
    await p.waitForFunction(() => window.__painted !== null, null, { timeout: 10000 });
    const painted = await p.evaluate(() => window.__painted);
    console.log(`  (a tap to the dialog painted with its list, at 4x: ${painted.toFixed(0)} ms)`);
    check('a tap to the dialog painted with its list: at most 300 ms', painted <= 300 && await p.evaluate(() => crewCheckIsOpen()), painted.toFixed(0));
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    await context.close();
}

suite('16. nothing threw, and no browser dialog was ever opened');
same('no uncaught error', errors, []);
same('no alert, confirm or prompt', dialogs, []);

await browser.close();
await server.close();
report();
