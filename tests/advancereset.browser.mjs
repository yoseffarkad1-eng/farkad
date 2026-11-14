// «איפוס מקדמות» - on the glass.
//
//   node tests/advancereset.browser.mjs
//
// tests/advancereset.test.mjs holds every figure, every refusal and the bytes the tool writes,
// in Node. This holds what only a screen can say, in a real Chromium at 320x568, 375x667 and
// 440x956, light and dark, with every font doubled, and with «תצוגה גדולה» on:
//
//   - THE ONE WAY IN: a row of ⋯ that is shut when the sheet opens; tapped open, its one
//     button puts the sheet away and opens the dialog at its title. No control on the day,
//     on «דוחות» or on «מקדמות» says «איפוס מקדמות» - not even with somebody owing.
//   - the check: the strong line about the backup with the backup's own button, every man
//     with his periods and his amount, a man skipped; the summary from its top; nothing
//     written by any of the looking.
//   - the whole pass for real: «אפס» asks the app's own question (the destructive kind, the
//     names), two taps write once, the result page, and «מקדמות» afterwards saying
//     «אף עובד לא חייב כסף כרגע.»; «סגירות שנרשמו» has it as one close.
//   - a phone that is not synced: told at the top, and nothing written.
//   - the floors: 44px both ways for what a finger lands on, 16px, 4.5:1 for every word on
//     the ground painted under it, no sideways scroll, no words past their control - with
//     every font doubled too; with the large display on, nothing under 18px, 7:1, no word
//     lighter than 500, and no target under 52px.
//
// NOT a real phone: emulated touch and Chromium's layout and fonts. Synthetic names only.

import { chromium } from 'playwright';
import { serve } from './serve.mjs';
import { launchLocalBrowser } from './network-guard.mjs';
import { verifyServedAssets, expectedShaFor } from './treecheck.mjs';
import { suite, check, same, given, report } from './runner.mjs';
import { WEEKLY_TODAY, WEEKLY_NOON, weeklySeedCrew, weeklySeedMoney } from './weeklyclose.seed.mjs';

const root = new URL('..', import.meta.url).pathname;
const server = await serve(root);
check('the browser is served the named tree', (await verifyServedAssets(server.url, root, expectedShaFor(root))).ok);
const browser = await launchLocalBrowser(chromium, { executablePath: process.env.CHROME_PATH });
const errors = [];
given('the fixture\'s day is the one the words below were worked out for', WEEKLY_TODAY === '2026-11-13');
const plain = text => String(text).replace(/[‎‏⁦-⁩]/g, '').replace(/\s+/g, ' ').trim();
const j = value => JSON.stringify(value);

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
            if (document.getElementById('ar-still') || !document.head) return;
            const style = document.createElement('style');
            style.id = 'ar-still';
            style.textContent = '*, *::before, *::after { transition: none !important; animation: none !important; }';
            document.head.appendChild(style);
        };
        still();
        document.addEventListener('DOMContentLoaded', still);
    });
    await page.clock.install({ time: new Date(WEEKLY_NOON) });
    await page.goto(`${server.url}/index.html`, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof State !== 'undefined' && typeof render === 'function' && typeof openAdvanceReset === 'function');
    await page.waitForTimeout(250);
    await page.evaluate(weeklySeedCrew);
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => typeof State !== 'undefined' && typeof render === 'function');
    await page.waitForTimeout(250);
    const wrote = await page.evaluate(weeklySeedMoney);
    given(`${width} ${scheme}: the approval and the closes by hand were written`, wrote.every(Boolean), j(wrote));
    if (options.synced !== false) await page.evaluate(() => { weeklyCloseShared = () => true; });
    await page.evaluate(() => {
        ['updateBanner', 'installBanner', 'whatsNewBanner'].forEach(id => {
            const node = document.getElementById(id);
            if (node) node.style.display = 'none';
        });
        showView('day'); window.scrollTo(0, 0);
    });
    return page;
}

const disk = page => page.evaluate(() => JSON.stringify(Object.keys(localStorage).sort()
    .filter(key => key !== 'farkad:openBuilds').map(key => [key, localStorage.getItem(key)])));

const doubleEveryFont = page => page.evaluate(() => {
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
    style.textContent = out.join('\n');
    document.head.appendChild(style);
});

// THE RULER, in the page (tests/weeklyclose.browser.mjs's own, for the same dialog frame).
function measure(selectors) {
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
        let ground = matchMedia('(prefers-color-scheme: dark)').matches ? [0, 0, 0, 1] : [255, 255, 255, 1];
        layers.reverse().forEach(layer => { ground = over(layer, ground); });
        return ground;
    };
    const drawn = node => node.getClientRects().length > 0 && node.checkVisibility();
    const scopes = selectors.map(selector => [...document.querySelectorAll(selector)]).flat().filter(drawn);
    const out = { scopes: scopes.length, targets: [], words: [], fields: [], past: [], wide: [],
        sideways: document.documentElement.scrollWidth - window.innerWidth };
    const seen = new Set();
    scopes.forEach(scope => {
        const controls = [...scope.querySelectorAll('button, input, summary, a')];
        if (scope.matches('button, summary')) controls.push(scope);
        controls.forEach(node => {
            if (seen.has(node) || !drawn(node)) return;
            seen.add(node);
            const box = node.getBoundingClientRect();
            out.targets.push({ what: (node.textContent || node.tagName).trim().slice(0, 30), w: Math.round(box.width * 10) / 10, h: Math.round(box.height * 10) / 10 });
            if (node.tagName === 'INPUT') out.fields.push(parseFloat(getComputedStyle(node).fontSize));
            if (box.right > window.innerWidth + 0.5 || box.left < -0.5) out.wide.push((node.textContent || '').trim().slice(0, 30));
            if (node.tagName === 'INPUT') return;
            const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
            for (let text = walker.nextNode(); text; text = walker.nextNode()) {
                if (!text.nodeValue.trim()) continue;
                const range = document.createRange();
                range.selectNodeContents(text);
                for (const piece of range.getClientRects()) {
                    const by = Math.max(box.left - piece.left, piece.right - box.right);
                    if (by > 1) out.past.push(`${text.nodeValue.trim().slice(0, 24)} by ${Math.round(by)}`);
                }
            }
        });
        const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
        for (let text = walker.nextNode(); text; text = walker.nextNode()) {
            const parent = text.parentElement;
            if (!text.nodeValue.trim() || !parent || !drawn(parent)) continue;
            const range = document.createRange();
            range.selectNodeContents(text);
            const rects = [...range.getClientRects()];
            if (!rects.length) continue;
            const cs = getComputedStyle(parent);
            const ink = parse(cs.color);
            const ground = groundOf(parent);
            out.words.push({ text: text.nodeValue.trim().slice(0, 24), size: parseFloat(cs.fontSize), weight: Number(cs.fontWeight),
                ratio: Math.round(ratio(over(ink, ground), ground) * 100) / 100,
                off: rects.some(rect => rect.right > window.innerWidth + 0.5 || rect.left < -0.5) });
        }
    });
    return out;
}

function holdFloors(label, read, floor) {
    given(`${label}: something is on the page to measure`, read.scopes > 0 && read.words.length > 0);
    const small = read.targets.filter(target => target.w < floor.target || target.h < floor.target);
    check(`${label}: everything a finger lands on is ${floor.target}px both ways (${read.targets.length} controls)`,
        small.length === 0, small.slice(0, 3).map(target => `${target.what} ${target.w}x${target.h}`).join(' | '));
    const tiny = read.words.filter(word => word.size < floor.size);
    check(`${label}: no word under ${floor.size}px (${read.words.length} pieces of text)`, tiny.length === 0,
        tiny.slice(0, 3).map(word => `${word.text} ${word.size}`).join(' | '));
    const faint = read.words.filter(word => word.ratio < floor.ratio);
    check(`${label}: every word at ${floor.ratio}:1 or more on the ground under it`, faint.length === 0,
        faint.slice(0, 3).map(word => `${word.text} ${word.ratio}`).join(' | '));
    if (floor.weight) {
        const light = read.words.filter(word => word.weight < floor.weight);
        check(`${label}: no word lighter than ${floor.weight}`, light.length === 0, light.slice(0, 3).map(word => `${word.text} ${word.weight}`).join(' | '));
    }
    check(`${label}: no sideways scroll`, read.sideways <= 0, String(read.sideways));
    check(`${label}: nothing off the side of the glass`, read.wide.length === 0 && read.words.every(word => !word.off),
        read.wide.concat(read.words.filter(word => word.off).map(word => word.text)).slice(0, 3).join(' | '));
    check(`${label}: no words run past their control`, read.past.length === 0, read.past.slice(0, 3).join(' | '));
}

const tap = async (page, selector, nth = 0) => {
    const target = page.locator(selector).nth(nth);
    await target.scrollIntoViewIfNeeded();
    await target.tap();
    await page.waitForTimeout(400);
};
// The one way in: ⋯, the row, its button.
const openTool = async page => {
    await tap(page, '#settingsBtn');
    await page.locator('#settingsFoldAdvanceReset').waitFor({ state: 'attached' });
    await tap(page, '#settingsFoldAdvanceReset > summary');
    await tap(page, '#settingsFoldAdvanceReset .advance-reset-entry');
    await page.waitForFunction(() => ADVANCE_RESET && ADVANCE_RESET.read !== null);
    await page.waitForTimeout(100);
};
const DIALOG = ['#advanceResetModal .modal-content'];
const FLOOR = { target: 44, size: 16, ratio: 4.5 };
const LARGE = { target: 52, size: 18, ratio: 7, weight: 500 };
const MEN = ['w_m', 'w_s', 'w_y', 'w_k', 'w_r', 'w_j'];

// ------------------------------------------------------------------ the one way in
{
    suite('375 light: the one way in is a shut row of ⋯; no other screen offers it');
    const page = await phone(375, 667, 'light');
    const elsewhere = await page.evaluate(async () => {
        const says = () => [...document.querySelectorAll('button, a, summary')]
            .filter(node => node.checkVisibility() && !node.closest('#settingsPanel, #advanceResetModal')
                && /איפוס מקדמות/.test(node.textContent)).length;
        const out = {};
        showView('day'); await new Promise(done => setTimeout(done, 300)); out.day = says();
        REPORT_SECTION = 'workers'; showView('reports'); await new Promise(done => setTimeout(done, 600)); out.reports = says();
        showWorkerAdvances(null); await new Promise(done => setTimeout(done, 600)); out.advances = says();
        out.owing = owesRead(State.schedule, todayStr()).rows.length;
        showView('day');
        return out;
    });
    same('not on the day, «דוחות» or «מקדמות» - with men owing', [elsewhere.day, elsewhere.reports, elsewhere.advances, elsewhere.owing > 0],
        [0, 0, 0, true]);
    await tap(page, '#settingsBtn');
    same('the row is shut when ⋯ opens', await page.evaluate(() => document.getElementById('settingsFoldAdvanceReset').open), false);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    const before = await disk(page);
    await openTool(page);
    const opened = await page.evaluate(() => ({ sheet: document.getElementById('settingsPanel').classList.contains('open'),
        dialog: document.getElementById('advanceResetModal').style.display, focus: document.activeElement && document.activeElement.id,
        top: document.getElementById('advanceResetTitle').getBoundingClientRect().top >= 0 }));
    same('its button puts ⋯ away and opens the dialog at its title', opened, { sheet: false, dialog: 'flex', focus: 'advanceResetTitle', top: true });
    check('and nothing is written by opening it', (await disk(page)) === before);
    await page.close();
}

// ------------------------------------------------------------------ three phones, both schemes
for (const [width, height] of [[320, 568], [375, 667], [440, 956]]) {
    for (const scheme of ['light', 'dark']) {
        const label = `${width} ${scheme}`;
        suite(`${width}x${height} ${scheme}: the row, the check, a man skipped, the summary`);
        const page = await phone(width, height, scheme);
        const before = await disk(page);
        await tap(page, '#settingsBtn');
        await tap(page, '#settingsFoldAdvanceReset > summary');
        // The row's head is ⋯'s own (its hint is the sheet's 14px, held by
        // tests/settings-order.browser.mjs); what is measured here is what the row adds.
        holdFloors(`${label} the row's button in ⋯`, await page.evaluate(measure, ['#settingsFoldAdvanceReset .advance-reset-entry']), FLOOR);
        await tap(page, '#settingsFoldAdvanceReset .advance-reset-entry');
        await page.waitForFunction(() => ADVANCE_RESET && ADVANCE_RESET.read !== null);
        const list = await page.evaluate(() => ({
            backup: document.querySelector('#advanceResetBody .advance-reset-backup-line').textContent,
            backupButton: document.querySelector('#advanceResetBody .advance-reset-backup-button').textContent,
            backupFirst: document.querySelector('#advanceResetBody').firstElementChild.classList.contains('advance-reset-backup'),
            men: [...document.querySelectorAll('#advanceResetBody .advance-reset-card')].map(card => card.dataset.worker),
            foot: [...document.querySelectorAll('#advanceResetTotals b')].map(node => node.textContent.replace(/[⁦-⁩]/g, '')),
            status: document.getElementById('advanceResetStatus').hidden
        }));
        same(`${label}: the backup line first, with the backup's own button`, [list.backupFirst, list.backup, list.backupButton],
            [true, 'לפני שממשיכים - שמור קובץ גיבוי. אחרי האישור אי אפשר לבטל, רק לרשום תיקון לצד כל רישום.', '💾 שמור קובץ גיבוי']);
        same(`${label}: every man with an advance, in the roster's order`, list.men, MEN);
        same(`${label}: synced, nothing said at the top`, list.status, true);
        holdFloors(`${label} the check`, await page.evaluate(measure, DIALOG), FLOOR);
        await tap(page, '#advanceResetBody .advance-reset-card[data-worker="w_y"] .advance-reset-skip');
        const skipped = await page.evaluate(() => document.querySelector('.advance-reset-card[data-worker="w_y"] .weekly-close-chip').textContent);
        same(`${label}: a man skipped says so`, skipped, 'דילגת');
        await tap(page, '#advanceResetGo');
        const summary = await page.evaluate(() => ({ step: ADVANCE_RESET.step, top: document.querySelector('#advanceResetModal .modal-content').scrollTop,
            named: [...document.querySelectorAll('#advanceResetBody .weekly-close-named')].map(node => node.textContent.replace(/[⁦-⁩]/g, '')),
            go: document.getElementById('advanceResetGo').textContent }));
        same(`${label}: the summary from its top`, [summary.step, summary.top], [2, 0]);
        same(`${label}: it names the man skipped`, summary.named, ['לא יאופס עכשיו (דילגת):יוסף נסאר']);
        same(`${label}: «אפס» says how many`, summary.go, 'אפס 5 עובדים');
        holdFloors(`${label} the summary`, await page.evaluate(measure, DIALOG), FLOOR);
        check(`${label}: nothing written by any of it`, (await disk(page)) === before);
        await page.close();
    }
}

// ------------------------------------------------------------------ the whole pass, for real
{
    suite('375 light: «אפס» asks, two taps write once, and «מקדמות» then says nobody owes');
    const page = await phone(375, 667, 'light');
    await openTool(page);
    await tap(page, '#advanceResetGo');
    const go = page.locator('#advanceResetGo');
    await go.tap();
    await page.waitForFunction(() => document.getElementById('askModal').style.display === 'flex');
    await page.waitForTimeout(200);
    const asked = await page.evaluate(() => ({ title: document.getElementById('askTitle').textContent,
        message: document.getElementById('askMessage').textContent.replace(/[⁦-⁩]/g, ''),
        names: [...document.querySelectorAll('#askList li')].map(node => node.textContent),
        danger: document.getElementById('askOk').classList.contains('btn-danger'), focus: document.activeElement.id }));
    same('the app\'s own question: the destructive kind, the focus on «ביטול», the six names', [asked.title, asked.danger, asked.focus, asked.names.length],
        ['לאפס את המקדמות?', true, 'askCancel', 6]);
    holdFloors('375 light the question', await page.evaluate(measure, ['#askModal .modal-content']), FLOOR);
    const entries = () => page.evaluate(() => Object.keys(State.schedule.ledger.advances).length);
    const count = await entries();
    await page.locator('#askOk').tap();
    // A second press while the first is on its way (not a tap at its place: once the pass is
    // done the button is gone, and a tap there lands on the dialog's backdrop, which shuts it).
    await page.evaluate(() => { advanceResetGo(); advanceResetGo(); });
    await page.waitForFunction(() => ADVANCE_RESET && ADVANCE_RESET.step === 3 && !advanceResetBusy, null, { timeout: 60000 })
        .catch(async error => { console.log(await page.evaluate(() => JSON.stringify({ step: ADVANCE_RESET && ADVANCE_RESET.step,
            status: document.getElementById('advanceResetStatus').textContent, busy: advanceResetBusy,
            ask: document.getElementById('askModal').style.display }))); throw error; });
    await page.waitForTimeout(300);
    const after = await page.evaluate(() => ({
        owed: State.schedule.workers.map(w => { const o = openAdvanceBalance(State.schedule, w.id); return o ? o.total : 0; }),
        added: Object.values(State.schedule.ledger.advances).filter(e => e.note === 'איפוס - הוחזר מחוץ לאפליקציה')
            .map(e => State.schedule.advances[e.advanceId].workerId).sort(),
        body: document.getElementById('advanceResetBody').textContent.replace(/[⁦-⁩]/g, ''),
        again: advanceResetRead(State.schedule, todayStr()).men.length
    }));
    same('everybody at zero on the ledger', after.owed, [0, 0, 0, 0, 0, 0, 0, 0]);
    // מחמוד's two advances are two repayments; everybody else had one advance.
    same('one repayment per advance with money left - written once', after.added, ['w_j', 'w_k', 'w_m', 'w_m', 'w_r', 'w_s', 'w_y']);
    check('more entries than before, once', (await entries()) > count);
    check('the result says the board\'s own sentence', after.body.indexOf('אף עובד לא חייב כסף כרגע.') !== -1, after.body.slice(0, 300));
    same('nothing left for the tool', after.again, 0);
    holdFloors('375 light the result', await page.evaluate(measure, DIALOG), FLOOR);
    await tap(page, '#advanceResetBody .advance-reset-closures');
    const closure = await page.evaluate(() => ({ view: currentView, h2: document.querySelector('#advancesView h2').textContent }));
    same('«סגירות שנרשמו» opens on the pass, as one close', [closure.view, closure.h2.indexOf('סגירה · ') === 0], ['advances', true]);
    await page.evaluate(() => { OWES_PAGE = null; showWorkerAdvances(null); window.scrollTo(0, 0); });
    await page.waitForTimeout(400);
    const board = await page.evaluate(() => document.querySelector('#advancesView .owes-none') && document.querySelector('#advancesView .owes-none').textContent);
    same('«מקדמות» says nobody owes', board, 'אף עובד לא חייב כסף כרגע.');
    await page.close();
}

{
    suite('320 light: a phone that is not synced is told at the top, and nothing is written');
    const page = await phone(320, 568, 'light', { synced: false });
    const before = await disk(page);
    await openTool(page);
    const status = await page.evaluate(() => ({ hidden: document.getElementById('advanceResetStatus').hidden,
        text: document.getElementById('advanceResetStatus').textContent }));
    same('the weekly close\'s sentence, at the top', [status.hidden, status.text],
        [false, 'סוגרים חשבונות רק כשמופיע «מסונכרן בין המכשירים» - כך שני טלפונים לא יסגרו את אותו חשבון בסכומים שונים.']);
    await tap(page, '#advanceResetGo');
    await tap(page, '#advanceResetGo');
    await page.waitForTimeout(300);
    check('no question asked', await page.evaluate(() => document.getElementById('askModal').style.display !== 'flex'));
    check('and nothing written', (await disk(page)) === before);
    holdFloors('320 light not synced', await page.evaluate(measure, DIALOG), FLOOR);
    await page.close();
}

// ------------------------------------------------------------------ doubled text, the large display
for (const [width, height, scheme] of [[320, 568, 'light'], [440, 956, 'dark']]) {
    suite(`${width} ${scheme}, every font doubled: the check, the summary`);
    const page = await phone(width, height, scheme);
    await doubleEveryFont(page);
    await openTool(page);
    holdFloors(`${width} doubled the check`, await page.evaluate(measure, DIALOG), FLOOR);
    await tap(page, '#advanceResetGo');
    holdFloors(`${width} doubled the summary`, await page.evaluate(measure, DIALOG), FLOOR);
    await page.close();
}
for (const [width, height, scheme] of [[320, 568, 'dark'], [375, 667, 'light']]) {
    suite(`${width} ${scheme}, «תצוגה גדולה»: nothing under 18px, 7:1, 52px`);
    const page = await phone(width, height, scheme, { large: true });
    check(`${width} the mode is on`, await page.evaluate(() => document.documentElement.classList.contains('display-large')));
    await openTool(page);
    holdFloors(`${width} large the check`, await page.evaluate(measure, DIALOG), LARGE);
    await tap(page, '#advanceResetGo');
    holdFloors(`${width} large the summary`, await page.evaluate(measure, DIALOG), LARGE);
    await page.evaluate(async () => {
        askConfirm = () => Promise.resolve(true);
        await advanceResetGo();
    });
    await page.waitForFunction(() => ADVANCE_RESET && ADVANCE_RESET.step === 3, null, { timeout: 60000 });
    holdFloors(`${width} large the result`, await page.evaluate(measure, DIALOG), LARGE);
    await page.close();
}

suite('no page error anywhere');
check('no script error on any page', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
await server.close();
report();
