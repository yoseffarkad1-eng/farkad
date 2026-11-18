// «תזכורת לסגירת חשבונות» - on the glass.
//
//   node tests/closereminder.browser.mjs [--shots <dir>]
//
// tests/closereminder.test.mjs holds the count, the days, the ✕, the switch, the keys and the
// cost in Node. This holds what only a screen can say, in a real Chromium with emulated touch,
// on the crew of tests/weeklyclose.seed.mjs (Friday 13 November 2026, noon: six men the pass
// would offer, one it holds, one it leaves out):
//
//   - the line comes up by itself after the start, in the banner area, saying how many - the
//     count «סגירת שבוע» itself offers;
//   - its button, tapped, opens «סגירת שבוע» at its title, with exactly those men to close;
//   - never under a dialog or a typed field: put up again while one is open it waits, and
//     comes when that ends;
//   - the ✕ puts it away until tomorrow - a reload keeps it away, the next morning it is back -
//     and writes one key and no other byte;
//   - the row in ⋯ ← «כללי», straight before «תזכורות בטלפון», shut when the sheet
//     opens; its switch turns the line off for this phone and on again;
//   - the floors at 320x568, 375x667 and 440x956, dark and light: 44px both ways for its two
//     buttons, 16px words, 4.5:1 on the ground painted under them, no sideways scroll, no
//     words past their button - and with «תצוגה גדולה» on, 18px, 7:1 and 52px.
//
// With --shots <dir> it also leaves six pictures (375x812, deviceScaleFactor 2, light and
// dark): the line on the day screen, «סגירת שבוע» after its button, and the row in ⋯. They
// assert nothing.
//
// NOT a real phone: emulated touch and Chromium's layout and fonts. Synthetic names only.

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { serve } from './serve.mjs';
import { launchLocalBrowser } from './network-guard.mjs';
import { verifyServedAssets, expectedShaFor } from './treecheck.mjs';
import { suite, check, same, given, report } from './runner.mjs';
import { WEEKLY_TODAY, WEEKLY_NOON, weeklySeedCrew, weeklySeedMoney } from './weeklyclose.seed.mjs';

const shotsAt = process.argv.indexOf('--shots');
const SHOTS = shotsAt !== -1 ? process.argv[shotsAt + 1] : null;

const root = new URL('..', import.meta.url).pathname;
const server = await serve(root);
check('the browser is served the named tree', (await verifyServedAssets(server.url, root, expectedShaFor(root))).ok);
const browser = await launchLocalBrowser(chromium, { executablePath: process.env.CHROME_PATH });
const errors = [];
given('the fixture\'s day is the one the counts below were worked out for', WEEKLY_TODAY === '2026-11-13');
const OFF_KEY = 'farkadCloseReminder:off';
const GONE_KEY = 'farkadCloseReminder:dismissed';
const SIX = 'יש 6 עובדים שהחשבון שלהם עוד לא נסגר';

async function phone(width, height, scheme, options = {}) {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, isMobile: true,
        hasTouch: true, colorScheme: scheme, serviceWorkers: 'block', timezoneId: 'Asia/Jerusalem', locale: 'he-IL' });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    if (options.large) {
        await page.addInitScript(() => { try { localStorage.setItem('farkadDisplay:large', '1'); } catch (error) { /* said by the app */ } });
    }
    await page.addInitScript(() => {
        const still = () => {
            if (document.getElementById('cr-still') || !document.head) return;
            const style = document.createElement('style');
            style.id = 'cr-still';
            style.textContent = '*, *::before, *::after { transition: none !important; animation: none !important; }';
            document.head.appendChild(style);
        };
        still();
        document.addEventListener('DOMContentLoaded', still);
    });
    await page.clock.install({ time: new Date(options.at || WEEKLY_NOON) });
    await page.goto(`${server.url}/index.html`, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof State !== 'undefined' && typeof render === 'function' && typeof closeReminderRefresh === 'function');
    await page.waitForTimeout(250);
    await page.evaluate(weeklySeedCrew);
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => typeof State !== 'undefined' && typeof render === 'function');
    await page.waitForTimeout(250);
    const wrote = await page.evaluate(weeklySeedMoney);
    given(`${width} ${scheme}: the approval and the closes by hand were written`, wrote.every(Boolean), JSON.stringify(wrote));
    // The other lines of the banner area are not this suite's, and are put away; the
    // reminder's own is left to come up by itself.
    await page.evaluate(() => {
        ['updateBanner', 'installBanner', 'whatsNewBanner'].forEach(id => {
            const node = document.getElementById(id);
            if (node) node.style.display = 'none';
        });
        showView('day');
        window.scrollTo(0, 0);
    });
    return { context, page };
}

// A reload, as a person closing and opening the app: the line comes up after the paint.
async function reopen(page) {
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => typeof State !== 'undefined' && typeof render === 'function');
    await page.evaluate(() => {
        ['updateBanner', 'installBanner', 'whatsNewBanner'].forEach(id => {
            const node = document.getElementById(id);
            if (node) node.style.display = 'none';
        });
    });
}

const lineUp = page => page.evaluate(() => document.getElementById('closeReminderBanner').style.display !== 'none');
const lineWords = page => page.evaluate(() => {
    const node = document.getElementById('closeReminderLine');
    return node ? node.textContent : null;
});
const waitLine = (page, up = true, ms = 4000) => page.waitForFunction(want =>
    (document.getElementById('closeReminderBanner').style.display !== 'none') === want, up, { timeout: ms }).then(() => true, () => false);
const offered = page => page.evaluate(() => {
    const read = weeklyCloseRead(State.schedule, todayStr(), new Date().toISOString());
    return read.men.filter(man => !man.held).map(man => man.id);
});
const disk = (page, ...skip) => page.evaluate(keys => JSON.stringify(Object.keys(localStorage).sort()
    .filter(key => key !== 'farkad:openBuilds' && key.indexOf('farkad:writeTick') !== 0 && !keys.includes(key))
    .map(key => [key, localStorage.getItem(key)])), skip);
const tapOn = async (page, selector) => {
    const target = page.locator(selector).first();
    await target.scrollIntoViewIfNeeded();
    await page.waitForTimeout(120);
    await target.tap();
};

// THE RULER, in the page, for one scope: every visible word's size, weight and contrast on the
// ground painted under it; every control's rectangle; words past their control; the width.
function measureScope(selector) {
    const parse = text => {
        const m = /rgba?\(([^)]+)\)/.exec(text || '');
        if (!m) return null;
        const parts = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
        return [parts[0], parts[1], parts[2], parts.length > 3 ? parts[3] : 1];
    };
    const over = (top, under) => [0, 1, 2].map(i => top[i] * top[3] + under[i] * (1 - top[3])).concat([1]);
    const lum = c => [c[0], c[1], c[2]].map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; })
        .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
    const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)]; return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    const groundOf = node => {
        const layers = [];
        for (let at = node; at && at.nodeType === 1; at = at.parentElement) {
            const c = parse(getComputedStyle(at).backgroundColor);
            if (c && c[3] > 0) { layers.push(c); if (c[3] === 1) break; }
        }
        let ground = parse(getComputedStyle(document.body).backgroundColor) || [255, 255, 255, 1];
        if (ground[3] < 1) ground = over(ground, matchMedia('(prefers-color-scheme: dark)').matches ? [0, 0, 0, 1] : [255, 255, 255, 1]);
        layers.reverse().forEach(layer => { ground = over(layer, ground); });
        return ground;
    };
    const scope = document.querySelector(selector);
    const out = { shown: Boolean(scope && scope.getClientRects().length), words: [], targets: [], past: [],
        sideways: document.documentElement.scrollWidth - window.innerWidth };
    if (!out.shown) return out;
    const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
    for (let text = walker.nextNode(); text; text = walker.nextNode()) {
        if (!text.textContent.trim()) continue;
        const holder = text.parentElement;
        if (!holder.getClientRects().length) continue;
        const style = getComputedStyle(holder);
        const ink = parse(style.color);
        out.words.push({ text: text.textContent.trim().slice(0, 30), size: parseFloat(style.fontSize), weight: Number(style.fontWeight),
            contrast: Math.round(ratio(ink[3] < 1 ? over(ink, groundOf(holder)) : ink, groundOf(holder)) * 100) / 100 });
    }
    scope.querySelectorAll('button').forEach(node => {
        const box = node.getBoundingClientRect();
        out.targets.push({ id: node.id, width: Math.round(box.width * 10) / 10, height: Math.round(box.height * 10) / 10,
            inside: box.left >= -0.5 && box.right <= window.innerWidth + 0.5 });
        if (node.scrollWidth > node.clientWidth + 1) out.past.push(node.id);
    });
    return out;
}

// ================================================================== the line, the button, the ✕
{
    suite('the line comes up by itself, says the count «סגירת שבוע» offers, and its button opens that dialog');
    const { context, page } = await phone(375, 667, 'light');
    await reopen(page);
    check('after a start the line comes up by itself, after the paint', await waitLine(page));
    const ids = await offered(page);
    same('«סגירת שבוע» offers six men today (the fixture says which)', ids.length, 6);
    same('and the line says six, in the owner\'s words', await lineWords(page), SIX);
    same('in the banner area above the day', await page.evaluate(() => {
        const line = document.getElementById('closeReminderBanner').getBoundingClientRect();
        const main = document.querySelector('main').getBoundingClientRect();
        return line.bottom <= main.top + 1;
    }), true);
    const before = await disk(page);
    await tapOn(page, '#closeReminderOpen');
    await page.waitForFunction(() => typeof WEEKLY_CLOSE !== 'undefined' && WEEKLY_CLOSE && WEEKLY_CLOSE.read, null, { timeout: 8000 });
    const opened = await page.evaluate(() => ({ shown: document.getElementById('weeklyCloseModal').style.display,
        focus: document.activeElement && document.activeElement.id,
        men: WEEKLY_CLOSE.read.men.filter(man => !man.held).map(man => man.id) }));
    same('tapped: «סגירת שבוע» is open at its title, with exactly the men the line counted', opened, { shown: 'flex', focus: 'weeklyCloseTitle', men: ids });
    same('and nothing was written by the tap or the looking', await disk(page), before);
    await page.evaluate(() => closeWeeklyClose());
    await page.waitForTimeout(200);

    suite('never under a dialog or a typed field: it waits, and comes when that ends');
    await page.evaluate(() => { closeReminderHide(); openFind(); closeReminderRefresh('return'); });
    await page.waitForTimeout(600);
    same('a dialog open: the line is not put up', await lineUp(page), false);
    await page.evaluate(() => closeFind());
    check('the dialog shut: it comes up by itself', await waitLine(page));
    await page.evaluate(() => { closeReminderHide(); showView('roster'); });
    await page.waitForTimeout(300);
    const field = await page.evaluate(() => {
        const input = [...document.querySelectorAll('#rosterView input')].find(node => node.offsetParent !== null && node.type !== 'file');
        if (!input) return null;
        input.focus();
        input.value = 'כ';
        return input.id || input.name || 'field';
    });
    given('there is a field to type in', field !== null);
    await page.evaluate(() => closeReminderRefresh('return'));
    await page.waitForTimeout(900);
    same('something typed in a field: the line is not put up', await lineUp(page), false);
    await page.evaluate(() => {
        const input = document.activeElement;
        input.value = '';
        input.blur();
    });
    check('the field left: it comes up by itself', await waitLine(page));
    await page.evaluate(() => showView('day'));
    await page.waitForTimeout(200);

    suite('the ✕: away until tomorrow, one key and no other byte');
    const bytes = await disk(page, GONE_KEY);
    await tapOn(page, '#closeReminderDismiss');
    await page.waitForTimeout(200);
    same('tapped: the line is down, today written down', [await lineUp(page), await page.evaluate(k => localStorage.getItem(k), GONE_KEY)], [false, WEEKLY_TODAY]);
    same('no other byte of the disk moved', await disk(page, GONE_KEY), bytes);
    await reopen(page);
    await page.waitForTimeout(1500);
    same('closed and opened the same day: still away', await lineUp(page), false);
    same('a draw takes nothing back up', await page.evaluate(() => { render(); return new Promise(done => setTimeout(() => done(document.getElementById('closeReminderBanner').style.display !== 'none'), 2500)); }), false);
    await context.close();

    const next = await phone(375, 667, 'light', { at: '2026-11-14T08:00:00+02:00' });
    await next.page.evaluate(k => localStorage.setItem(k, '2026-11-13'), GONE_KEY);
    await reopen(next.page);
    check('the next morning it is back', await waitLine(next.page));
    await next.context.close();
}

// ================================================================== the row in ⋯
{
    suite('the row in ⋯ ← «כללי»: in its place, shut on opening, and its switch');
    const { context, page } = await phone(375, 667, 'dark');
    await reopen(page);
    given('the line is up', await waitLine(page));
    await tapOn(page, '#settingsBtn');
    await page.waitForTimeout(250);
    const titles = await page.evaluate(() => [...document.querySelectorAll('#settingsDailySection > .settings-group h3, #settingsDailySection > details.settings-group h3')]
        .map(node => node.textContent.trim()));
    same('the cards of «כללי», in order', titles, ['ענן וסנכרון', 'תזכורת לסגירת חשבונות', 'תזכורות בטלפון', 'תצוגה גדולה', 'הסעות']);
    same('the row is shut when the sheet opens', await page.evaluate(() => document.getElementById('closeReminderCard').open), false);
    await tapOn(page, '#closeReminderCard > summary');
    await page.waitForTimeout(200);
    same('opened by a tap: its lead, its state, its switch', await page.evaluate(() => [document.getElementById('closeReminderCard').open,
        document.getElementById('closeReminderState').textContent, document.getElementById('closeReminderSwitch').textContent]),
    [true, 'מופעלת במכשיר הזה', 'כיבוי התזכורת במכשיר הזה']);
    const bytes = await disk(page, OFF_KEY);
    const where = () => page.evaluate(() => { const r = document.getElementById('closeReminderSwitch').getBoundingClientRect(); return [r.width, r.height, Math.round(r.top)]; });
    await page.locator('#closeReminderSwitch').scrollIntoViewIfNeeded();
    await page.waitForTimeout(120);
    const pressedAt = await where();
    await page.locator('#closeReminderSwitch').tap();
    await page.waitForTimeout(200);
    same('off: one byte, the line down, the row says so', await page.evaluate(k => [localStorage.getItem(k),
        document.getElementById('closeReminderBanner').style.display, document.getElementById('closeReminderState').textContent,
        document.getElementById('closeReminderSwitch').textContent], OFF_KEY), ['1', 'none', 'כבויה במכשיר הזה', 'הפעלת התזכורת במכשיר הזה']);
    same('no other byte of the disk moved', await disk(page, OFF_KEY), bytes);
    const box = await where();
    check('the switch is 44px both ways and still under the finger: the line going down moved nothing in the sheet',
        box[0] >= 44 && box[1] >= 44 && box[2] === pressedAt[2], JSON.stringify([pressedAt, box]));
    await page.evaluate(() => closeSettings());
    await reopen(page);
    await page.waitForTimeout(1500);
    same('closed and opened: still off, no line', await lineUp(page), false);
    await page.evaluate(() => openSettings());
    await page.evaluate(() => { document.getElementById('closeReminderCard').open = true; });
    await tapOn(page, '#closeReminderSwitch');
    await page.waitForTimeout(200);
    same('on again: the key is gone', await page.evaluate(k => localStorage.getItem(k), OFF_KEY), null);
    await page.evaluate(() => closeSettings());
    check('and the line comes back', await waitLine(page));
    same('with the same words', await lineWords(page), SIX);
    same('nothing else on the disk moved by all of it', await disk(page, OFF_KEY), bytes);
    await context.close();
}

// ================================================================== the floors
for (const [width, height] of [[320, 568], [375, 667], [440, 956]]) {
    for (const scheme of ['dark', 'light']) {
        for (const large of [false, true]) {
            suite(`the floors at ${width}x${height} ${scheme}${large ? ', «תצוגה גדולה» on' : ''}`);
            const { context, page } = await phone(width, height, scheme, { large });
            await reopen(page);
            given('the line is up', await waitLine(page));
            const m = await page.evaluate(measureScope, '#closeReminderBanner');
            const minSize = large ? 18 : 16;
            const minTarget = large ? 52 : 44;
            const minContrast = large ? 7 : 4.5;
            const small = m.words.filter(word => word.size < minSize);
            check(`every word ${minSize}px or more`, m.words.length >= 3 && small.length === 0, JSON.stringify(small.length ? small : m.words.length));
            if (large) {
                const light = m.words.filter(word => word.weight < 500);
                check('no word lighter than 500', light.length === 0, JSON.stringify(light));
            }
            const faint = m.words.filter(word => word.contrast < minContrast);
            check(`every word at ${minContrast}:1 on the ground painted under it`, faint.length === 0, JSON.stringify(faint));
            const tiny = m.targets.filter(t => t.width < minTarget || t.height < minTarget);
            check(`both buttons ${minTarget}px or more in both dimensions`, m.targets.length === 2 && tiny.length === 0, JSON.stringify(m.targets));
            check('both on the glass, no words past their button', m.targets.every(t => t.inside) && m.past.length === 0, JSON.stringify([m.targets, m.past]));
            same('no sideways scroll', m.sideways <= 0, true);
            same('the words are the line\'s', await lineWords(page), SIX);
            await context.close();
        }
    }
}

// ================================================================== the pictures
if (SHOTS) {
    mkdirSync(SHOTS, { recursive: true });
    for (const scheme of ['light', 'dark']) {
        const { context, page } = await phone(375, 812, scheme);
        await reopen(page);
        // The dialog as a synced phone sees it (its refusal of one that is not is its own suite's).
        await page.evaluate(() => { weeklyCloseShared = () => true; });
        await waitLine(page);
        await page.waitForTimeout(300);
        await page.screenshot({ path: join(SHOTS, `1-line-on-day-${scheme}.png`) });
        await tapOn(page, '#closeReminderOpen');
        await page.waitForFunction(() => typeof WEEKLY_CLOSE !== 'undefined' && WEEKLY_CLOSE && WEEKLY_CLOSE.read, null, { timeout: 8000 });
        await page.waitForTimeout(400);
        await page.screenshot({ path: join(SHOTS, `2-after-button-${scheme}.png`) });
        await page.evaluate(() => closeWeeklyClose());
        await page.evaluate(() => openSettings());
        await page.waitForTimeout(200);
        await page.evaluate(() => {
            const card = document.getElementById('closeReminderCard');
            card.open = true;
            card.scrollIntoView({ block: 'center' });
        });
        await page.waitForTimeout(300);
        await page.screenshot({ path: join(SHOTS, `3-settings-row-${scheme}.png`) });
        await context.close();
    }
    console.log(`  pictures in ${SHOTS}`);
}

same('nothing went wrong on any page', errors, []);
await browser.close();
await server.close();
report();
