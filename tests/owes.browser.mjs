// «מי חייב כסף», «שים לב» and «סגירות שנרשמו» - on the glass.
//
//   node tests/owes.browser.mjs
//
// tests/owes.test.mjs holds every figure to its source function and every word, in Node.
// This holds what only a screen can say, in a real Chromium at 320x568, 375x667 and
// 440x956, light and dark, with every font doubled, and with «תצוגה גדולה» on:
//
//   - the board is the first thing on «מקדמות» under its heading, above the list it never
//     replaced; its total is the sum of its rows; each row's amount is the figure the list
//     under it shows for that man; largest debt first; a man who owes nothing is not on it;
//   - «שים לב» stands open under the board, and is ONE shut row at the head of «דוחות» ←
//     «לפי עובד» that a real tap opens; it is not on «לפי אתר», and not on paper;
//   - the one button, tapped for real, lands on the pay sheet narrowed to that man and
//     pointed at the period he was not closed in - with his open account on the glass and
//     the closing button reachable - and the phone's disk byte for byte what it was;
//   - a row of the board, tapped, opens that man's advances;
//   - «סגירות שנרשמו»: the way in, the list newest first, one close with each account's
//     figures equal to the closed period's own, and its text leaving by the two doors -
//     the share sheet, wa.me where there is none, the clipboard - through recorders;
//   - the floors: 44px both ways for everything a finger lands on, 16px for the field,
//     4.5:1 for every word against the ground painted under it, no sideways scroll, no
//     words past their control - and the same with every font doubled; with the large
//     display on, nothing under 18px and no target under 52px.
//
//   - «דוחות» does not wait for the row at its head: on a record that moved it is read
//     after the page has painted, nothing stands in its place meanwhile but its room, a
//     draw that was replaced reads nothing, and after a write the row and the board say
//     the record as it is - never the figure of before.
//
// NOT a real phone: emulated touch and Chromium's layout and fonts. Synthetic names only.

import { chromium } from 'playwright';
import { serve } from './serve.mjs';
import { launchLocalBrowser } from './network-guard.mjs';
import { verifyServedAssets, expectedShaFor } from './treecheck.mjs';
import { suite, check, same, given, report } from './runner.mjs';
import { OWES_TODAY, OWES_NOON, owesSeedCrew, owesSeedMoney } from './owes.seed.mjs';

const root = new URL('..', import.meta.url).pathname;
const server = await serve(root);
check('the browser is served the named tree',
    (await verifyServedAssets(server.url, root, expectedShaFor(root))).ok);
const browser = await launchLocalBrowser(chromium, { executablePath: process.env.CHROME_PATH });
const errors = [];
// Every date and count pinned below was worked out for this Thursday.
given('the fixture\'s day is the one the words below were worked out for', OWES_TODAY === '2026-11-12');
const plain = text => String(text).replace(/[‎‏⁦-⁩]/g, '').replace(/\s+/g, ' ').trim();

async function phone(width, height, scheme, options = {}) {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, isMobile: true,
        hasTouch: true, colorScheme: scheme, serviceWorkers: 'block', timezoneId: 'Asia/Jerusalem', locale: 'he-IL' });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await context.route('https://wa.me/**', route =>
        route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>wa</title>' }));
    if (options.large) {
        await page.addInitScript(() => { try { localStorage.setItem('farkadDisplay:large', '1'); } catch (error) { /* said by the app */ } });
    }
    if (options.before) await options.before(page);
    await page.clock.install({ time: new Date(OWES_NOON) });
    await page.goto(`${server.url}/index.html`, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof State !== 'undefined' && typeof render === 'function' && typeof owesRead === 'function');
    await page.waitForTimeout(250);
    await page.evaluate(owesSeedCrew);
    // RELOADED: the boot mirror (js/state.js) is what writes each advance's origin entry.
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => typeof State !== 'undefined' && typeof render === 'function');
    await page.waitForTimeout(250);
    const wrote = await page.evaluate(owesSeedMoney);
    given(`${width} ${scheme}: the approval, the repayment and the three closes were written`, wrote.every(Boolean), JSON.stringify(wrote));
    await page.evaluate(() => {
        ['updateBanner', 'installBanner', 'whatsNewBanner'].forEach(id => {
            const node = document.getElementById(id);
            if (node) node.style.display = 'none';
        });
        showWorkerAdvances(null);
        window.scrollTo(0, 0);
    });
    await page.waitForTimeout(250);
    return page;
}

// Without the service worker's census of open builds (tests/census.mjs says why).
const disk = page => page.evaluate(() => JSON.stringify(Object.keys(localStorage).sort()
    .filter(key => key !== 'farkad:openBuilds').map(key => [key, localStorage.getItem(key)])));

// EVERY font doubled, the pseudo-elements' too - tests/mobile.test.mjs's mechanism.
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

// THE RULER. Runs in the page, over everything this file draws that is on the page now:
// every control's rectangle, every word's size and its contrast against the ground really
// painted under it, the field's size, what runs past its control, and the page's width.
function measureOwes() {
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
    // On the glass: laid out, and not inside a row that is shut (a shut <details> keeps its
    // content's boxes and hides them).
    const drawn = node => node.getClientRects().length > 0 && node.checkVisibility();
    const scopes = [...document.querySelectorAll('.owes, .owes-warnings, .owes-closures, .owes-closure, .owes-closures-entry')]
        .filter(drawn);
    const out = { scopes: scopes.length, targets: [], words: [], fields: [], past: [], wide: [],
        sideways: document.documentElement.scrollWidth - window.innerWidth };
    const seen = new Set();
    scopes.forEach(scope => {
        const controls = [...scope.querySelectorAll('button, summary, textarea, a')];
        if (scope.matches('button')) controls.push(scope);
        controls.forEach(node => {
            if (seen.has(node) || !drawn(node)) return;
            seen.add(node);
            const box = node.getBoundingClientRect();
            out.targets.push({ what: (node.textContent || node.tagName).trim().slice(0, 30), w: Math.round(box.width * 10) / 10, h: Math.round(box.height * 10) / 10 });
            if (node.tagName === 'TEXTAREA') out.fields.push(parseFloat(getComputedStyle(node).fontSize));
            if (box.right > window.innerWidth + 0.5 || box.left < -0.5) out.wide.push((node.textContent || '').trim().slice(0, 30));
            if (node.tagName === 'TEXTAREA') return;
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
            if (!text.nodeValue.trim() || !parent || parent.tagName === 'TEXTAREA' || !drawn(parent)) continue;
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

// One reading held to the floors. `floor` is { target, size, ratio }.
function holdFloors(label, read, floor) {
    given(`${label}: something of the readings is on the page`, read.scopes > 0 && read.words.length > 0);
    const small = read.targets.filter(target => target.w < floor.target || target.h < floor.target);
    check(`${label}: everything a finger lands on is ${floor.target}px both ways (${read.targets.length} controls)`,
        small.length === 0, small.slice(0, 3).map(target => `${target.what} ${target.w}x${target.h}`).join(' | '));
    const tiny = read.words.filter(word => word.size < floor.size);
    check(`${label}: no word under ${floor.size}px (${read.words.length} pieces of text)`, tiny.length === 0,
        tiny.slice(0, 3).map(word => `${word.text} ${word.size}`).join(' | '));
    const faint = read.words.filter(word => word.ratio < floor.ratio);
    check(`${label}: every word at ${floor.ratio}:1 or more on the ground under it`, faint.length === 0,
        faint.slice(0, 3).map(word => `${word.text} ${word.ratio}`).join(' | '));
    check(`${label}: a field is 16px or more`, read.fields.every(size => size >= 16), read.fields.join());
    check(`${label}: no sideways scroll`, read.sideways <= 0, String(read.sideways));
    check(`${label}: nothing off the side of the glass`, read.wide.length === 0 && read.words.every(word => !word.off),
        read.wide.concat(read.words.filter(word => word.off).map(word => word.text)).slice(0, 3).join(' | '));
    check(`${label}: no words run past their control`, read.past.length === 0, read.past.slice(0, 3).join(' | '));
}

const toList = page => page.evaluate(() => { OWES_PAGE = null; REPORT_WORKERS = null; showWorkerAdvances(null); window.scrollTo(0, 0); });
// The row at the head of «דוחות» is read AFTER the page has painted when the record moved
// since the last reading (renderOwesWarningsInto, js/ui/owes.js). So every look at that
// page here waits until nothing is pending - there, or absent, the row is then final.
const settled = page => page.waitForFunction(() => !document.querySelector('.owes-pending'));
const toReports = async page => {
    await page.evaluate(() => {
        OWES_HEAD_OPEN = false;
        REPORT_RANGE.from = null; REPORT_RANGE.to = null; REPORT_PRESET = 'fortnight'; REPORT_RANGE_OPEN = false;
        REPORT_WORKERS = null; REPORT_SECTION = 'workers'; REPORT_CARD_GRID = true;
        showView('reports'); window.scrollTo(0, 0);
    });
    await settled(page);
};
const tap = async (page, selector, nth = 0) => {
    const target = page.locator(selector).nth(nth);
    await target.scrollIntoViewIfNeeded();
    await target.tap();
    // A deliberate finger: the next tap 400ms on. Since v194 the page spends a press on the
    // same spot as the press before it, under 300ms, on another control (js/ui/sheet.js) -
    // and «חזרה לסגירות שנרשמו» and «חזרה לכל העובדים» are on the same spot, one after the other.
    await page.waitForTimeout(400);
    await settled(page);
};

const FLOOR = { target: 44, size: 16, ratio: 4.5 };

// ------------------------------------------------------------------ the three phones, both schemes
for (const [width, height] of [[320, 568], [375, 667], [440, 956]]) {
    for (const scheme of ['light', 'dark']) {
        const label = `${width} ${scheme}`;
        suite(`${width}x${height} ${scheme}: the board, the warnings, the closures`);
        const page = await phone(width, height, scheme);
        const before = await disk(page);

        // ---- the board on «מקדמות»
        const board = await page.evaluate(() => {
            const view = document.getElementById('advancesView');
            const kids = [...view.children];
            const text = node => node.textContent.replace(/[⁦-⁩]/g, '').trim();
            const rows = [...view.querySelectorAll('.owes-row')].map(row => ({
                id: row.dataset.worker, name: text(row.querySelector('.owes-name')), amount: text(row.querySelector('.owes-amount')),
                line: text(row.querySelector('.owes-line')), flags: [...row.querySelectorAll('.owes-flag')].map(text), cycle: row.dataset.cycle }));
            return {
                order: kids.slice(0, 2).map(node => node.className || node.tagName),
                boardTop: view.querySelector('.owes').getBoundingClientRect().top,
                searchTop: view.querySelector('input[type="search"]').getBoundingClientRect().top,
                total: text(view.querySelector('.owes-total-amount')), count: text(view.querySelector('.owes-total-count')),
                rows,
                sources: rows.map(row => `${moneyText(workerAdvanceSummary(row.id).left)} ₪`),
                ledger: rows.map(row => `${moneyText(openAdvanceBalance(State.schedule, row.id).total)} ₪`),
                sum: `${moneyText(rows.reduce((all, row) => all + workerAdvanceSummary(row.id).left, 0))} ₪`,
                list: [...view.querySelectorAll('.advance-worker-card')].map(card => text(card)),
                warningsOpen: [...view.querySelectorAll('.owes-warnings')].map(fold => fold.open),
                warnings: [...view.querySelectorAll('.owes-warning-title')].map(text),
                afterBoard: view.querySelector('.owes-warnings').getBoundingClientRect().top > view.querySelector('.owes-list').getBoundingClientRect().bottom - 1
            };
        });
        same(`${label}: the board is the first thing under the heading`, board.order, ['H2', 'owes']);
        check(`${label}: and above the search and the list`, board.boardTop < board.searchTop);
        same(`${label}: six men owe, the largest debt first`, board.rows.map(row => [row.name, row.amount]), [
            ['ראמי עודה', '3950 ₪'], ['ג\'מאל בשארה', '3000 ₪'], ['סאמר ח\'ורי', '2400 ₪'],
            ['מחמוד עיסא', '2000 ₪'], ['אחמד זועבי', '1200 ₪'], ['יוסף נסאר', '1000 ₪']]);
        same(`${label}: each amount is the figure the list under it is built from`, board.rows.map(row => row.amount), board.sources);
        same(`${label}: and the ledger's own balance`, board.rows.map(row => row.amount), board.ledger);
        same(`${label}: the total is the sum of its rows`, [board.total, board.count], [board.sum, '6 עובדים חייבים · 3 דורשים טיפול']);
        same(`${label}: the list under it says the same six figures, and the man who gave it all back owes nothing`,
            board.list.filter(text => !/^(כרם|נאסר)/.test(text)).sort(),
            ['אחמד זועבי1200 ₪ נשארו', 'ג\'מאל בשארה3000 ₪ נשארו', 'וליד מנסור0 ₪ נשארו', 'יוסף נסאר1000 ₪ נשארו',
                'מחמוד עיסא2000 ₪ נשארו', 'סאמר ח\'ורי2400 ₪ נשארו', 'ראמי עודה3950 ₪ נשארו'].sort());
        same(`${label}: the lines`, board.rows.map(row => row.line), [
            'דו־שבועי · מאז 21/10 · נוכה לאחרונה 29/10', 'שבועי · מאז 09/10 · הניכוי האחרון: אין',
            'שבועי · מאז 16/10 · הניכוי האחרון: אין', 'שבועי · מאז 27/10 · נוכה לאחרונה 29/10',
            'דו־שבועי · מאז 03/11 · הניכוי האחרון: אין', 'שבועי · מאז 08/11 · הניכוי האחרון: אין']);
        same(`${label}: the flags`, board.rows.map(row => row.flags), [
            [], ['4 שבועות בלי ניכוי', 'חשבון קודם לא נסגר', 'לא עבד השבוע'], ['3 שבועות בלי ניכוי', 'חשבון קודם לא נסגר'],
            ['חשבון קודם לא נסגר'], [], []]);
        same(`${label}: each row keyed for its pay group's colour`, board.rows.map(row => row.cycle),
            ['biweekly', 'weekly', 'weekly', 'weekly', 'biweekly', 'weekly']);
        same(`${label}: «שים לב» stands open, under the board`, [board.warningsOpen, board.afterBoard], [[true], true]);
        same(`${label}: six things, the unclosed accounts first`, board.warnings.map(plain), [
            'חשבון קודם לא נסגר: 09/10 - 15/10 · ג\'מאל בשארה', 'חשבון קודם לא נסגר: 16/10 - 22/10 · סאמר ח\'ורי',
            'חשבון קודם לא נסגר: 30/10 - 05/11 · מחמוד עיסא', '4 שבועות בלי ניכוי: ג\'מאל בשארה · 3000 ₪',
            '3 שבועות בלי ניכוי: סאמר ח\'ורי · 2400 ₪', 'יש חוב ואין ימי עבודה השבוע: ג\'מאל בשארה · 3000 ₪']);
        holdFloors(`${label} «מקדמות»`, await page.evaluate(measureOwes), FLOOR);

        // ---- a row opens that man's advances
        await tap(page, '.owes-row[data-worker="w_s"]');
        same(`${label}: a row, tapped, opens that man's advances`,
            await page.evaluate(() => [currentView, ADVANCE_WORKER, document.querySelector('#advancesView h2').textContent]),
            ['advances', 'w_s', 'מקדמות · סאמר ח\'ורי']);
        await toList(page);

        // ---- the one button, from «מקדמות»
        await tap(page, '.owes-warning[data-worker="w_m"] .owes-show');
        const landed = await page.evaluate(() => ({
            view: currentView, range: [REPORT_RANGE.from, REPORT_RANGE.to], workers: [...REPORT_WORKERS], section: REPORT_SECTION,
            rows: payrollRows().map(row => [row.workerId, row.spanFrom, row.spanTo, Boolean(row.carry && row.carry.closed)]),
            names: [...document.querySelectorAll('#reportsView .report-payroll:not(.report-offscreen) tbody tr td:first-child')].map(cell => cell.textContent.replace(/[⁦-⁩]/g, '').trim()),
            visible: document.getElementById('reportsView').getClientRects().length > 0
        }));
        same(`${label}: the button lands on the pay sheet, on «לפי עובד», narrowed to him, pointed at the week he was not closed in`,
            [landed.view, landed.visible, landed.section, landed.workers, landed.range],
            ['reports', true, 'workers', ['w_m'], ['2026-10-30', '2026-11-05']]);
        same(`${label}: where his one row is that open account`, landed.rows, [['w_m', '2026-10-30', '2026-11-05', false]]);
        check(`${label}: with his name on the glass`, landed.names.length === 1 && landed.names[0].includes('מחמוד עיסא'), landed.names.join());
        check(`${label}: and nothing was written by going there`, (await disk(page)) === before);

        // ---- «שים לב» at the head of «דוחות»
        await toReports(page);
        const head = await page.evaluate(() => {
            const view = document.getElementById('reportsView');
            const fold = view.querySelector('.owes-warnings');
            return { folds: view.querySelectorAll('.owes-warnings').length, open: fold.open,
                summary: fold.querySelector('summary').textContent.replace(/\s+/g, ' ').trim(),
                inSheet: view.querySelectorAll('.report .owes-warnings').length,
                above: fold.getBoundingClientRect().bottom <= view.querySelector('.report-payroll').getBoundingClientRect().top + 1,
                shown: [...fold.querySelectorAll('.owes-warning')].filter(node => node.checkVisibility()).length };
        });
        same(`${label}: at the head of «דוחות» it is one shut row, above the sheet and outside it`,
            [head.folds, head.open, head.inSheet, head.above, head.shown], [1, false, 0, true, 0]);
        check(`${label}: saying how many things`, /^שים לב\s*6 דברים$/.test(head.summary), head.summary);
        holdFloors(`${label} «דוחות», shut`, await page.evaluate(measureOwes), FLOOR);
        await tap(page, '#reportsView .owes-warnings summary');
        same(`${label}: a tap opens it in place: the same six`, await page.evaluate(() => {
            const fold = document.querySelector('#reportsView .owes-warnings');
            return [fold.open, [...fold.querySelectorAll('.owes-warning')].filter(node => node.checkVisibility()).length];
        }), [true, 6]);
        holdFloors(`${label} «דוחות», open`, await page.evaluate(measureOwes), FLOOR);
        await page.evaluate(() => render());
        await settled(page);
        same(`${label}: a redraw does not shut what a person opened`, await page.evaluate(() => document.querySelector('#reportsView .owes-warnings').open), true);
        await tap(page, '#reportsView .owes-warning[data-worker="w_j"] .owes-show');
        same(`${label}: its button too: his oldest open week, him alone`,
            await page.evaluate(() => [currentView, REPORT_RANGE.from, REPORT_RANGE.to, [...REPORT_WORKERS]]),
            ['reports', '2026-10-09', '2026-10-15', ['w_j']]);
        same(`${label}: narrowed to him, the row at the head speaks of him only`, await page.evaluate(() =>
            [...document.querySelectorAll('#reportsView .owes-warning')].map(node => node.dataset.worker).filter((id, at, all) => all.indexOf(id) === at)), ['w_j']);
        await toReports(page);
        await page.evaluate(() => { REPORT_SECTION = 'sites'; render(); });
        await settled(page);
        same(`${label}: on «לפי אתר» it is not drawn`, await page.evaluate(() => document.querySelectorAll('#reportsView .owes-warnings').length), 0);
        await toReports(page);

        // ---- the closures
        await toList(page);
        await tap(page, '.owes-closures-entry');
        const list = await page.evaluate(() => ({
            page: OWES_PAGE, heading: document.querySelector('#advancesView h2').textContent,
            cards: [...document.querySelectorAll('.owes-closure-card')].map(card => [...card.children].map(node => node.textContent.replace(/[⁦-⁩]/g, ''))),
            board: document.querySelectorAll('#advancesView .owes').length
        }));
        same(`${label}: the way in opens the list of closes, newest first, and the board is not on it`, list, {
            page: 'closures', heading: 'סגירות שנרשמו', cards: [
                ['יום חמישי 05/11/2026', 'חשבון אחד · נוכו 0 ₪ · לתשלום 2250 ₪'],
                ['יום חמישי 29/10/2026', '4 חשבונות · נוכו 2600 ₪ · לתשלום 9170 ₪'],
                ['יום חמישי 22/10/2026', '2 חשבונות · נוכו 0 ₪ · לתשלום 4400 ₪']], board: 0 });
        holdFloors(`${label} the closes`, await page.evaluate(measureOwes), FLOOR);

        await tap(page, '.owes-closure-card', 1);
        const one = await page.evaluate(() => {
            const text = node => node.textContent.replace(/[⁦-⁩]/g, '');
            const group = owesClosures(State.schedule).filter(item => item.key === OWES_PAGE)[0];
            return {
                heading: document.querySelector('#advancesView h2').textContent, meta: text(document.querySelector('.owes-closure-meta')),
                rows: [...document.querySelectorAll('.owes-closure-row')].map(row => [text(row.querySelector('.owes-name'))]
                    .concat([...row.querySelectorAll('.owes-figure b')].map(text))),
                sources: group.items.map(item => {
                    const account = advanceAccount(State.schedule, item.workerId, item.from, item.to);
                    return [item.name, `${moneyText(account.deducted)} ₪`, `${moneyText(account.net)} ₪`, `${moneyText(account.carriedOut)} ₪`, account.closed];
                }),
                field: document.getElementById('owesClosureText').value, text: owesClosureText(group),
                readOnly: document.getElementById('owesClosureText').readOnly
            };
        });
        same(`${label}: one close: its heading, when and on which phone`, [one.heading, one.meta],
            ['סגירה · 29/10/2026', 'יום חמישי, 17:40 · בטלפון הזה · 4 חשבונות']);
        same(`${label}: its four accounts and the sum`, one.rows, [
            ['כרם נסאר', '0 ₪', '1800 ₪', '0 ₪'], ['מחמוד עיסא', '600 ₪', '1800 ₪', '2000 ₪'],
            ['נאסר עודה', '0 ₪', '1720 ₪', '0 ₪'], ['ראמי עודה', '2000 ₪', '3850 ₪', '3950 ₪'],
            ['סה״כ', '2600 ₪', '9170 ₪', '5950 ₪']]);
        same(`${label}: each account is the closed period's own figures`, one.rows.slice(0, 4),
            one.sources.map(source => source.slice(0, 4)));
        check(`${label}: and each of those periods is closed`, one.sources.every(source => source[4] === true));
        same(`${label}: the field holds the text, and cannot be typed into`, [one.field === one.text, one.readOnly], [true, true]);
        holdFloors(`${label} one close`, await page.evaluate(measureOwes), FLOOR);

        // The two doors, through recorders. The share sheet where the phone has one.
        await page.evaluate(() => {
            window.__shared = []; window.__opened = []; window.__copied = [];
            Object.defineProperty(navigator, 'share', { configurable: true, value: data => { window.__shared.push(data.text); return Promise.resolve(); } });
            window.open = (url, target, features) => { window.__opened.push([url, target, features]); return null; };
            Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: text => { window.__copied.push(text); return Promise.resolve(); } } });
        });
        await tap(page, '.owes-doors button', 0);
        same(`${label}: «שלח בוואטסאפ» hands the share sheet exactly the text`, await page.evaluate(() => [window.__shared.length, window.__shared[0] === document.getElementById('owesClosureText').value, window.__opened.length]), [1, true, 0]);
        await page.evaluate(() => { Object.defineProperty(navigator, 'share', { configurable: true, value: undefined }); });
        await tap(page, '.owes-doors button', 0);
        same(`${label}: with no share sheet it opens wa.me with the text and no number`, await page.evaluate(() => {
            const [url, target, features] = window.__opened[0] || [];
            return [window.__opened.length, url === `https://wa.me/?text=${encodeURIComponent(document.getElementById('owesClosureText').value)}`, target, features];
        }), [1, true, '_blank', 'noopener,noreferrer']);
        await tap(page, '.owes-doors button', 1);
        same(`${label}: «העתק» puts exactly the text on the clipboard and says so`, await page.evaluate(() =>
            [window.__copied.length, window.__copied[0] === document.getElementById('owesClosureText').value, document.getElementById('owesClosureStatus').textContent]),
        [1, true, '✔️ הועתק']);
        check(`${label}: the page is still the close`, await page.evaluate(() => document.querySelectorAll('.owes-closure').length === 1));

        await tap(page, '.owes-closure > button');
        same(`${label}: back to the list of closes`, await page.evaluate(() => [OWES_PAGE, document.querySelectorAll('.owes-closure-card').length]), ['closures', 3]);
        await tap(page, '.owes-closures > button');
        same(`${label}: and back to everybody`, await page.evaluate(() => [OWES_PAGE, document.querySelectorAll('#advancesView .owes-row').length]), [null, 6]);

        // ---- paper
        await toReports(page);
        await page.emulateMedia({ media: 'print' });
        same(`${label}: on paper «שים לב» is not there`, await page.evaluate(() =>
            [...document.querySelectorAll('.owes-warnings')].filter(node => getComputedStyle(node).display !== 'none').length), 0);
        await page.emulateMedia({ media: 'screen' });

        check(`${label}: after all of it the phone's disk is byte for byte what it was`, (await disk(page)) === before);

        // ---- every font doubled
        await doubleEveryFont(page);
        await toList(page);
        await page.waitForTimeout(200);
        const doubled = await page.evaluate(measureOwes);
        check(`${label}, text doubled, «מקדמות»: no sideways scroll, nothing off the glass, no words past their control`,
            doubled.sideways <= 0 && doubled.wide.length === 0 && doubled.past.length === 0 && doubled.words.every(word => !word.off),
            JSON.stringify([doubled.sideways, doubled.wide.slice(0, 2), doubled.past.slice(0, 2), doubled.words.filter(word => word.off).slice(0, 2)]));
        await page.evaluate(() => owesOpenPage(owesClosures(State.schedule)[1].key));
        await page.waitForTimeout(200);
        const doubledClose = await page.evaluate(measureOwes);
        check(`${label}, text doubled, one close: the same`,
            doubledClose.sideways <= 0 && doubledClose.wide.length === 0 && doubledClose.past.length === 0 && doubledClose.words.every(word => !word.off),
            JSON.stringify([doubledClose.sideways, doubledClose.wide.slice(0, 2), doubledClose.past.slice(0, 2), doubledClose.words.filter(word => word.off).slice(0, 2)]));
        await toReports(page);
        await page.evaluate(() => { document.querySelector('#reportsView .owes-warnings').open = true; });
        const doubledHead = await page.evaluate(measureOwes);
        check(`${label}, text doubled, «דוחות»: the same`,
            doubledHead.sideways <= 0 && doubledHead.wide.length === 0 && doubledHead.past.length === 0 && doubledHead.words.every(word => !word.off),
            JSON.stringify([doubledHead.sideways, doubledHead.wide.slice(0, 2), doubledHead.past.slice(0, 2)]));
        await page.context().close();
    }
}

// ------------------------------------------------------------------ «תצוגה גדולה»
for (const [width, height] of [[320, 568], [375, 667]]) {
    for (const scheme of ['light', 'dark']) {
        const label = `${width} ${scheme}, large display`;
        suite(`${width}x${height} ${scheme}, «תצוגה גדולה» on`);
        const page = await phone(width, height, scheme, { large: true });
        given(`${label}: the mode is on`, await page.evaluate(() => document.documentElement.classList.contains('display-large')));
        const LARGE = { target: 52, size: 18, ratio: 7 };
        holdFloors(`${label} «מקדמות»`, await page.evaluate(measureOwes), LARGE);
        await page.evaluate(() => owesOpenPage('closures'));
        await page.waitForTimeout(200);
        holdFloors(`${label} the closes`, await page.evaluate(measureOwes), LARGE);
        await page.evaluate(() => owesOpenPage(owesClosures(State.schedule)[1].key));
        await page.waitForTimeout(200);
        const close = await page.evaluate(measureOwes);
        holdFloors(`${label} one close`, close, LARGE);
        check(`${label}: the field is 20px`, close.fields.every(size => size >= 20), close.fields.join());
        await toReports(page);
        await page.evaluate(() => { document.querySelector('#reportsView .owes-warnings').open = true; });
        await page.waitForTimeout(200);
        holdFloors(`${label} «דוחות»`, await page.evaluate(measureOwes), LARGE);
        await page.context().close();
    }
}

// ------------------------------------------------------------------ nobody owes
{
    suite('a phone on which nobody owes');
    const context = await browser.newContext({ viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, isMobile: true,
        hasTouch: true, colorScheme: 'light', serviceWorkers: 'block', timezoneId: 'Asia/Jerusalem', locale: 'he-IL' });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.clock.install({ time: new Date(OWES_NOON) });
    await page.goto(`${server.url}/index.html`, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof State !== 'undefined' && typeof render === 'function' && typeof owesRead === 'function');
    await page.evaluate(() => {
        State.schedule = emptySchedule();
        State.schedule.workers = [{ id: 'w_1', name: 'דוד כהן', active: true, dailyRate: 400, hourlyRate: 0 },
            { id: 'w_2', name: 'עלי חסן', active: true, dailyRate: 400, hourlyRate: 0 }];
        State.schedule.places = [{ id: 'p_1', name: 'חיפה', active: true }];
        State.save({ silent: true });
        showWorkerAdvances(null);
    });
    await page.waitForTimeout(200);
    same('one quiet sentence, and no board, no warning, no way into closures', await page.evaluate(() => {
        const view = document.getElementById('advancesView');
        return [[...view.querySelectorAll('.owes-none')].map(node => node.textContent), view.querySelectorAll('.owes-row, .owes-total, .owes-warnings, .owes-closures-entry').length,
            view.querySelectorAll('.advance-worker-card').length];
    }), [['אף עובד לא חייב כסף כרגע.'], 0, 2]);
    const quiet = await page.evaluate(measureOwes);
    check('readable: 16px or more, 4.5:1 or more', quiet.words.every(word => word.size >= 16 && word.ratio >= 4.5), JSON.stringify(quiet.words));
    await page.evaluate(() => showView('reports'));
    await settled(page);
    same('and nothing at the head of «דוחות»', await page.evaluate(() => document.querySelectorAll('#reportsView .owes-warnings').length), 0);
    await context.close();
}

// ------------------------------------------------------------------ the page does not wait
//
// The cost, repaired before v195 was served. The reading behind the row is the whole board
// (every man who owes, every one of his periods), and «דוחות» is a pay sheet somebody came
// to read: it is drawn and painted first. What is held: WHEN the record is read, that
// nothing of the reading before stands in the row's place meanwhile, that the sheet does
// not jump when the row arrives, and that after a real write the figures are the record's.
{
    suite('«דוחות» does not wait for the row at its head, and no figure outlives its record');
    const page = await phone(375, 667, 'light');
    await toReports(page);
    await page.evaluate(() => {
        window.__reads = []; window.__frames = 0;
        const real = owesRead;
        owesRead = function () { window.__reads.push(window.__frames); return real.apply(this, arguments); };
    });
    const look = () => {
        const view = document.getElementById('reportsView');
        const place = view.querySelector('.owes-pending');
        const fold = view.querySelector('.owes-warnings');
        return { reads: window.__reads.length, rows: view.querySelectorAll('.owes-warnings').length,
            pending: view.querySelectorAll('.owes-pending').length,
            placeWords: place ? place.textContent : null,
            summary: fold ? fold.querySelector('summary').textContent.replace(/\s+/g, ' ').trim() : null,
            sheetTop: Math.round(view.querySelector('.report-payroll').getBoundingClientRect().top + window.scrollY) };
    };
    const rest = await page.evaluate(look);
    given('at rest the row is there, shut, saying six things', rest.rows === 1 && rest.pending === 0 && /6 דברים$/.test(rest.summary), JSON.stringify(rest));

    // The record has not moved: the row is drawn IN the draw, from the kept reading.
    const again = await page.evaluate(look => { window.__reads = []; renderReports(); return (0, eval)(`(${look})`)(); }, look.toString());
    same('a redraw of a record that did not move: the row is there at once, and nothing was read',
        [again.reads, again.rows, again.pending, again.summary, again.sheetTop], [0, 1, 0, rest.summary, rest.sheetTop]);

    // A REAL WRITE: the whole 2,400 handed back by a man with a week left open and five
    // weeks without a deduction. State.commit redraws the page; it is then drawn once more
    // by hand in the same step, so the first draw's place is gone before its turn comes.
    const moved = await page.evaluate(look => {
        const id = advancesFor(State.schedule, 'w_s', '0000-01-01', '9999-12-31')[0].id;
        window.__reads = []; window.__frames = 0;
        requestAnimationFrame(() => { window.__frames += 1; });
        const wrote = State.commit(recordAdvanceRepaid(State.schedule, id, 2400, '2026-11-12', '', '2026-11-12T10:00:00.000Z', syncDeviceId(), 'cash')) !== false;
        renderReports();
        return Object.assign({ wrote }, (0, eval)(`(${look})`)());
    }, look.toString());
    given('the repayment was written', moved.wrote === true);
    same('in the draw after a write: nothing was read, and no row - only its place', [moved.reads, moved.rows, moved.pending], [0, 0, 1]);
    same('the place says nothing: no word and no figure of the reading before', moved.placeWords, '');
    same('and keeps the row\'s room, so the sheet is where it was', moved.sheetTop, rest.sheetTop);
    await settled(page);
    const after = await page.evaluate(look);
    const fresh = await page.evaluate(() => {
        const read = owesWarnings(owesKeptNow());
        return { kept: owesKeptNow() !== null, things: read.length, words: OWES_TEXT.attention + (read.length === 1 ? OWES_TEXT.oneThing : OWES_TEXT.things(read.length)), his: read.filter(one => one.row.workerId === 'w_s').length,
            frames: window.__reads.slice() };
    });
    same('then the record was read ONCE - the draw that was replaced read nothing', after.reads, 1);
    check('after a frame had been given to the page, not in the draw', fresh.frames.length === 1 && fresh.frames[0] >= 1, JSON.stringify(fresh.frames));
    given('the record now warns of fewer things, none of them his', fresh.kept && fresh.things > 0 && fresh.things < 6 && fresh.his === 0, JSON.stringify(fresh));
    same('the row says the record as it is now', [after.rows, after.pending, after.summary.replace(/\s/g, '')], [1, 0, fresh.words.replace(/\s/g, '')]);
    same('and the sheet did not move when it arrived', after.sheetTop, rest.sheetTop);
    same('opened, no warning is about the man who paid', await page.evaluate(() => {
        const fold = document.querySelector('#reportsView .owes-warnings');
        fold.open = true;
        return [...fold.querySelectorAll('.owes-warning')].filter(node => node.dataset.worker === 'w_s').length;
    }), 0);

    // And «מקדמות», drawn next: the same reading - nothing read again - and the board
    // without him, its total the list's figures.
    await toList(page);
    const board = await page.evaluate(() => {
        const view = document.getElementById('advancesView');
        const sum = State.schedule.workers.reduce((all, worker) => all + workerAdvanceSummary(worker.id).left, 0);
        return { reads: window.__reads.length, men: [...view.querySelectorAll('.owes-row')].map(row => row.dataset.worker),
            total: view.querySelector('.owes-total-amount').textContent, said: owesMoney(sum) };
    });
    same('«מקדמות» after it: drawn from the same reading', board.reads, 1);
    check('the man who paid is off the board', board.men.length === 5 && !board.men.includes('w_s'), board.men.join());
    same('and the total is what the list under it adds up to', board.total, board.said);
    await page.context().close();
}

suite('the run');
same('no page threw', errors, []);

await browser.close();
await server.close();
report();
