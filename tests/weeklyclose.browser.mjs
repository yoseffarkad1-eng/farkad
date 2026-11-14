// «סגירת שבוע» - on the glass.
//
//   node tests/weeklyclose.browser.mjs
//
// tests/weeklyclose.test.mjs holds every figure, every refusal and the bytes the pass writes,
// in Node. This holds what only a screen can say, in a real Chromium at 320x568, 375x667 and
// 440x956, light and dark, with every font doubled, and with «תצוגה גדולה» on:
//
//   - the one button in «דוחות» ← «לפי עובד» (outside the pay sheet: never on paper) and on
//     top of «מקדמות», tapped for real, opens the dialog at its title;
//   - the list: every man in his own period, his pay group's edge, the field full (D2), a
//     tap opening him, a number typed with the keyboard moving his row and the foot;
//   - a man held for an older open period: his sentence, and v195's button landing on the
//     pay sheet narrowed to him at that period with the disk unmoved;
//   - the summary naming the men skipped; «סגור» written once for two taps; the result the
//     close's own page in «סגירות שנרשמו» with the man not closed named on it;
//   - a phone that is not synced: told at the top, and «סגור» writing nothing;
//   - the floors: 44px both ways for what a finger lands on, 16px for the field, 4.5:1 for
//     every word on the ground painted under it, no sideways scroll, no words past their
//     control - with every font doubled too; with the large display on, nothing under
//     18px, 7:1, and no target under 52px.
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
            if (document.getElementById('wc-still') || !document.head) return;
            const style = document.createElement('style');
            style.id = 'wc-still';
            style.textContent = '*, *::before, *::after { transition: none !important; animation: none !important; }';
            document.head.appendChild(style);
        };
        still();
        document.addEventListener('DOMContentLoaded', still);
    });
    await page.clock.install({ time: new Date(WEEKLY_NOON) });
    await page.goto(`${server.url}/index.html`, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof State !== 'undefined' && typeof render === 'function' && typeof openWeeklyClose === 'function');
    await page.waitForTimeout(250);
    await page.evaluate(weeklySeedCrew);
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => typeof State !== 'undefined' && typeof render === 'function');
    await page.waitForTimeout(250);
    const wrote = await page.evaluate(weeklySeedMoney);
    given(`${width} ${scheme}: the approval and the closes by hand were written`, wrote.every(Boolean), JSON.stringify(wrote));
    // Shared and quiet, by the test's word (the rule itself is tests/weeklyclose.test.mjs W6),
    // except where a test is about the phone that is not.
    if (options.synced !== false) await page.evaluate(() => { weeklyCloseShared = () => true; });
    await page.evaluate(() => {
        ['updateBanner', 'installBanner', 'whatsNewBanner'].forEach(id => {
            const node = document.getElementById(id);
            if (node) node.style.display = 'none';
        });
    });
    await toReports(page);
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

// THE RULER, in the page: every control's rectangle, every word's size and contrast against
// the ground really painted under it, the field, what runs past its control, the page's width.
function measureWeekly(selectors) {
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
        if (scope.matches('button')) controls.push(scope);
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
    check(`${label}: the field is 16px or more`, read.fields.every(size => size >= 16), read.fields.join());
    check(`${label}: no sideways scroll`, read.sideways <= 0, String(read.sideways));
    check(`${label}: nothing off the side of the glass`, read.wide.length === 0 && read.words.every(word => !word.off),
        read.wide.concat(read.words.filter(word => word.off).map(word => word.text)).slice(0, 3).join(' | '));
    check(`${label}: no words run past their control`, read.past.length === 0, read.past.slice(0, 3).join(' | '));
}

async function toReports(page) {
    await page.evaluate(() => {
        if (typeof closeWeeklyClose === 'function') closeWeeklyClose();
        OWES_HEAD_OPEN = false; OWES_PAGE = null; ADVANCE_WORKER = null;
        REPORT_RANGE.from = null; REPORT_RANGE.to = null; REPORT_PRESET = 'fortnight'; REPORT_RANGE_OPEN = false;
        REPORT_WORKERS = null; REPORT_SECTION = 'workers'; REPORT_CARD_GRID = true;
        showView('reports'); window.scrollTo(0, 0);
    });
    await page.waitForFunction(() => !document.querySelector('.owes-pending'));
}
const tap = async (page, selector, nth = 0) => {
    const target = page.locator(selector).nth(nth);
    await target.scrollIntoViewIfNeeded();
    await target.tap();
    // A deliberate finger: the next tap 400ms on (js/ui/sheet.js spends a press on the same
    // spot as the press before it under 300ms).
    await page.waitForTimeout(400);
};
const openedPass = async page => {
    await tap(page, '#reportsView .weekly-close-entry');
    await page.waitForFunction(() => WEEKLY_CLOSE && WEEKLY_CLOSE.read !== null);
    await page.waitForTimeout(100);
};
const DIALOG = ['#weeklyCloseModal .modal-content'];
const FLOOR = { target: 44, size: 16, ratio: 4.5 };
const LARGE = { target: 52, size: 18, ratio: 7, weight: 500 };

// ------------------------------------------------------------------ the three phones, both schemes
for (const [width, height] of [[320, 568], [375, 667], [440, 956]]) {
    for (const scheme of ['light', 'dark']) {
        const label = `${width} ${scheme}`;
        suite(`${width}x${height} ${scheme}: the button, the list, a man opened, the summary`);
        const page = await phone(width, height, scheme);
        const before = await disk(page);
        const entry = await page.evaluate(() => {
            const view = document.getElementById('reportsView');
            const button = view.querySelector('.weekly-close-entry');
            return { words: button.textContent, inSheet: view.querySelectorAll('.report .weekly-close-entry').length,
                above: button.getBoundingClientRect().bottom <= view.querySelector('.report-payroll').getBoundingClientRect().top + 1 };
        });
        same(`${label}: one button in «דוחות», above the pay sheet and outside it`, [entry.words, entry.inSheet, entry.above], ['סגירת שבוע', 0, true]);
        holdFloors(`${label} the button`, await page.evaluate(measureWeekly, ['#reportsView .weekly-close-entry']), FLOOR);
        await openedPass(page);
        const list = await page.evaluate(() => ({
            focus: document.activeElement && document.activeElement.id,
            groups: [...document.querySelectorAll('#weeklyCloseBody .weekly-close-group')].map(node => node.textContent.replace(/[⁦-⁩]/g, '').trim()),
            men: [...document.querySelectorAll('#weeklyCloseBody .weekly-close-card')].map(card => [card.dataset.worker, card.dataset.cycle,
                card.querySelector('.weekly-close-chip').textContent]),
            edge: getComputedStyle(document.querySelector('#weeklyCloseBody .weekly-close-card[data-cycle="weekly"]')).borderInlineStartColor
                !== getComputedStyle(document.querySelector('#weeklyCloseBody .weekly-close-card[data-cycle="biweekly"]')).borderInlineStartColor,
            totals: [...document.querySelectorAll('#weeklyCloseTotals b')].map(node => node.textContent.replace(/[⁦-⁩]/g, '')),
            status: document.getElementById('weeklyCloseStatus').hidden
        }));
        same(`${label}: opened at its title`, list.focus, 'weeklyCloseTitle');
        same(`${label}: the fortnight that opened first, then the week`, list.groups, ['דו־שבועי · 30/10 - 12/11', 'שבועי · 06/11 - 12/11']);
        same(`${label}: every man in his own group, the field full or the reason he is held`, list.men, [
            ['w_r', 'biweekly', 'הכל'], ['w_j', 'biweekly', 'אין שכר'], ['w_w', 'biweekly', 'בלי מקדמות'],
            ['w_m', 'weekly', 'הכל'], ['w_s', 'weekly', 'הכל'], ['w_y', 'weekly', 'הכל'], ['w_a', 'weekly', 'בלי מקדמות'], ['w_k', 'weekly', 'לא ייסגר']]);
        check(`${label}: the two groups' edges are told apart`, list.edge);
        same(`${label}: synced, nothing said at the top`, list.status, true);
        holdFloors(`${label} the list`, await page.evaluate(measureWeekly, DIALOG), FLOOR);

        // A man opened by a tap, the keyboard's number moving his row and the foot.
        await tap(page, '#weeklyCloseBody .weekly-close-card[data-worker="w_m"] .weekly-close-row');
        const input = page.locator('#weeklyCloseBody .weekly-close-opened .weekly-close-input');
        same(`${label}: his field, full: all his wage could take of the 2,500 he owes`, await input.inputValue(), '2400');
        await input.fill('1000');
        const typed = await page.evaluate(() => ({
            chip: document.querySelector('.weekly-close-card[data-worker="w_m"] .weekly-close-chip').textContent,
            preview: document.querySelector('.weekly-close-card[data-worker="w_m"] .weekly-close-preview').textContent,
            foot: [...document.querySelectorAll('#weeklyCloseTotals b')].map(node => node.textContent),
            size: parseFloat(getComputedStyle(document.querySelector('.weekly-close-input')).fontSize),
            mode: document.querySelector('.weekly-close-input').inputMode
        }));
        same(`${label}: «חלק», his preview, the foot moved`, [typed.chip, plain(typed.preview), typed.foot.length], ['חלק', 'לתשלום לעובד: 1400 ₪ · יישאר חוב פתוח: 1500 ₪', 3]);
        check(`${label}: the field is 16px and up and asks for a number`, typed.size >= 16 && typed.mode === 'decimal', `${typed.size} ${typed.mode}`);
        check(`${label}: the foot is the first page's totals less 1,500 deducted`, typed.foot[0] !== list.totals[0], j([typed.foot, list.totals]));
        holdFloors(`${label} a man opened`, await page.evaluate(measureWeekly, DIALOG), FLOOR);

        // Skip one, go to the summary.
        await tap(page, '#weeklyCloseBody .weekly-close-card[data-worker="w_y"] .weekly-close-row');
        await tap(page, '#weeklyCloseBody .weekly-close-card[data-worker="w_y"] .weekly-close-skip');
        await tap(page, '#weeklyCloseGo');
        const summary = await page.evaluate(() => ({
            step: WEEKLY_CLOSE.step, top: document.querySelector('#weeklyCloseModal .modal-content').scrollTop,
            named: [...document.querySelectorAll('#weeklyCloseBody .weekly-close-named')].map(node => node.textContent.replace(/[⁦-⁩]/g, '')),
            go: document.getElementById('weeklyCloseGo').textContent
        }));
        same(`${label}: the summary, from its top`, [summary.step, summary.top], [2, 0]);
        same(`${label}: it names the man left owing with nothing taken, the man skipped and the man held`, summary.named, [
            'בלי ניכוי הפעם, והחוב עובר הלאה:ג\'מאל בשארה · יישאר חוב 3000 ₪',
            'לא נסגר עכשיו (דילגת):יוסף נסאר · סה״כ חוב 1000 ₪',
            'לא נסגר עכשיו - צריך לבדוק קודם:כרים סלאמה · חשבון קודם שלו לא נסגר (30/10 - 05/11). סוגרים מהישן לחדש: סגור קודם את החשבון ההוא, ידנית.']);
        same(`${label}: «סגור» says how many`, summary.go, 'סגור 6 חשבונות');
        holdFloors(`${label} the summary`, await page.evaluate(measureWeekly, DIALOG), FLOOR);
        check(`${label}: nothing written by any of it`, (await disk(page)) === before);
        await page.close();
    }
}

// ------------------------------------------------------------------ the whole pass, for real
{
    suite('375 light: two taps of «סגור» write once, and the close\'s own page names who was not closed');
    const page = await phone(375, 667, 'light');
    await openedPass(page);
    await tap(page, '#weeklyCloseBody .weekly-close-card[data-worker="w_y"] .weekly-close-row');
    await tap(page, '#weeklyCloseBody .weekly-close-card[data-worker="w_y"] .weekly-close-skip');
    await tap(page, '#weeklyCloseGo');
    const go = page.locator('#weeklyCloseGo');
    await go.tap();
    await go.tap({ force: true, timeout: 2000 }).catch(() => {});
    await page.waitForFunction(() => !weeklyCloseBusy && OWES_PAGE !== null, null, { timeout: 60000 });
    await page.waitForTimeout(300);
    const after = await page.evaluate(() => {
        const at = WEEKLY_CLOSE_LAST.key.split('|')[0];
        const entries = Object.values(State.schedule.ledger.advances).filter(entry => entry.at === at);
        return { view: currentView, open: document.getElementById('weeklyCloseModal').style.display,
            closed: entries.filter(entry => entry.kind === 'closed').map(entry => entry.workerId).sort(),
            heading: document.querySelector('#advancesView h2').textContent,
            page: document.getElementById('advancesView').textContent.replace(/[⁦-⁩]/g, ''),
            again: weeklyCloseRead(State.schedule, todayStr(), new Date().toISOString()).men.map(man => man.id) };
    });
    same('the dialog is gone and «מקדמות» shows the close', [after.view, after.open], ['advances', 'none']);
    same('six closed at one moment, once', after.closed, ['w_a', 'w_j', 'w_m', 'w_r', 'w_s', 'w_w']);
    check('the close\'s page names the two not closed in it', after.page.indexOf('לא נסגרו בסגירה הזאת:יוסף נסאר, כרים סלאמה') !== -1, after.page.slice(0, 400));
    same('and only they are left to close', after.again.sort(), ['w_k', 'w_y']);
    holdFloors('375 light the result', await page.evaluate(measureWeekly, ['#advancesView .owes-closure']), FLOOR);
    await page.close();
}

{
    suite('375 light: the held man\'s button only navigates; «מקדמות» has the same entry');
    const page = await phone(375, 667, 'light');
    const before = await disk(page);
    await openedPass(page);
    const card = await page.evaluate(() => document.querySelector('.weekly-close-card[data-worker="w_k"]').textContent.replace(/[⁦-⁩]/g, ''));
    check('his card says why, with the dates', card.indexOf('חשבון קודם שלו לא נסגר (30/10 - 05/11)') !== -1, card);
    await tap(page, '.weekly-close-card[data-worker="w_k"] .weekly-close-show');
    const landed = await page.evaluate(() => ({ open: document.getElementById('weeklyCloseModal').style.display, view: currentView,
        range: [REPORT_RANGE.from, REPORT_RANGE.to], workers: [...REPORT_WORKERS] }));
    same('the dialog shut, the pay sheet narrowed to him at that week', landed, { open: 'none', view: 'reports',
        range: ['2026-10-30', '2026-11-05'], workers: ['w_k'] });
    check('and nothing was written', (await disk(page)) === before);
    await page.evaluate(() => { REPORT_WORKERS = null; showWorkerAdvances(null); window.scrollTo(0, 0); });
    await page.waitForTimeout(200);
    await tap(page, '#advancesView .weekly-close-entry');
    await page.waitForFunction(() => WEEKLY_CLOSE && WEEKLY_CLOSE.read !== null);
    same('the same pass opens from «מקדמות»', await page.evaluate(() => WEEKLY_CLOSE.read.men.length), 8);
    holdFloors('375 light «מקדמות» with the button', await page.evaluate(measureWeekly, ['#advancesView .weekly-close-entry']), FLOOR);
    await page.close();
}

{
    suite('320 light: a phone that is not synced is told at the top, and «סגור» writes nothing');
    const page = await phone(320, 568, 'light', { synced: false });
    const before = await disk(page);
    await openedPass(page);
    const status = await page.evaluate(() => ({ hidden: document.getElementById('weeklyCloseStatus').hidden,
        text: document.getElementById('weeklyCloseStatus').textContent,
        top: document.getElementById('weeklyCloseStatus').getBoundingClientRect().top < document.getElementById('weeklyCloseBody').getBoundingClientRect().top }));
    same('the sentence, above the list', [status.hidden, status.text, status.top],
        [false, 'סוגרים חשבונות רק כשמופיע «מסונכרן בין המכשירים» - כך שני טלפונים לא יסגרו את אותו חשבון בסכומים שונים.', true]);
    await tap(page, '#weeklyCloseGo');
    await tap(page, '#weeklyCloseGo');
    await page.waitForTimeout(300);
    check('«סגור» wrote nothing', (await disk(page)) === before);
    holdFloors('320 light not synced', await page.evaluate(measureWeekly, DIALOG), FLOOR);
    await page.close();
}

// ------------------------------------------------------------------ doubled text, the large display
for (const [width, height, scheme] of [[320, 568, 'light'], [440, 956, 'dark']]) {
    suite(`${width} ${scheme}, every font doubled: the list, a man opened, the summary`);
    const page = await phone(width, height, scheme);
    await doubleEveryFont(page);
    await openedPass(page);
    holdFloors(`${width} doubled the list`, await page.evaluate(measureWeekly, DIALOG), FLOOR);
    await tap(page, '#weeklyCloseBody .weekly-close-card[data-worker="w_s"] .weekly-close-row');
    holdFloors(`${width} doubled a man opened`, await page.evaluate(measureWeekly, DIALOG), FLOOR);
    await tap(page, '#weeklyCloseGo');
    holdFloors(`${width} doubled the summary`, await page.evaluate(measureWeekly, DIALOG), FLOOR);
    await page.close();
}
for (const [width, height, scheme] of [[320, 568, 'dark'], [375, 667, 'light']]) {
    suite(`${width} ${scheme}, «תצוגה גדולה»: nothing under 18px, 7:1, 52px`);
    const page = await phone(width, height, scheme, { large: true });
    check(`${width} the mode is on`, await page.evaluate(() => document.documentElement.classList.contains('display-large')));
    holdFloors(`${width} large the button`, await page.evaluate(measureWeekly, ['#reportsView .weekly-close-entry']), LARGE);
    await openedPass(page);
    holdFloors(`${width} large the list`, await page.evaluate(measureWeekly, DIALOG), LARGE);
    await tap(page, '#weeklyCloseBody .weekly-close-card[data-worker="w_r"] .weekly-close-row');
    holdFloors(`${width} large a man opened`, await page.evaluate(measureWeekly, DIALOG), LARGE);
    await tap(page, '#weeklyCloseGo');
    holdFloors(`${width} large the summary`, await page.evaluate(measureWeekly, DIALOG), LARGE);
    await page.close();
}

// ------------------------------------------------------------------ what a press costs
//
// Fourteen men on a season of days (May to November), every earlier period closed by hand
// - a 600 KB record - with the processor slowed four times, the way tests/removepace
// slows it. The day is pinned by todayStr and NOT by Playwright's clock: its timers made
// every reading here twice what the glass shows. Printed, and held under bounds with room.
{
    suite('the cost: fourteen men on a season of days, the processor slowed 4x');
    const context = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true,
        hasTouch: true, serviceWorkers: 'block', timezoneId: 'Asia/Jerusalem', locale: 'he-IL' });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    const pinned = () => { todayStr = () => '2026-11-13'; };
    await page.goto(`${server.url}/index.html`, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof State !== 'undefined' && typeof openWeeklyClose === 'function');
    await page.evaluate(pinned);
    const bytes = await page.evaluate(() => {
        const add = (date, n) => { const [y, m, d] = date.split('-').map(Number); return toLocalDateStr(new Date(y, m - 1, d + n, 12)); };
        State.schedule = emptySchedule();
        State.schedule.places = [{ id: 'p1', name: 'אתר צפון', active: true }];
        for (let i = 0; i < 14; i += 1) {
            State.schedule.workers.push(Object.assign({ id: `w${i}`, name: `עובד ${i + 1}`, active: true, dailyRate: 400 + i * 10, hourlyRate: 0 },
                i < 9 ? { payCycles: '2026-05-01=weekly' } : {}));
        }
        for (let date = '2026-05-01'; date <= '2026-11-12'; date = add(date, 1)) {
            const dow = parseLocalDate(date).getDay();
            if (dow === 6) continue;
            State.schedule.workers.forEach(w => assignPlace(State.schedule, date, w.id, 'actual', 'p1'));
            if (dow === 1) State.schedule.workers.forEach((w, i) => { if (i % 2 === 0) recordNewAdvance(State.schedule, w.id, date, 500, '', `${date}T07:00:00.000Z`, 'd_seed', 'cash'); });
        }
        recordCarryApproval(State.schedule, planCarryMigration(State.schedule), '2026-05-01T00:00:00.000Z', 'd_seed');
        weeklyCloseOnce(() => State.schedule.workers.forEach(w => accountsBefore(State.schedule, w.id, '2026-11-06')
            .forEach(p => closePeriodChanges(State.schedule, w.id, p.from, p.to, `${add(p.to, 1)}T16:00:00.000Z`, 'd_seed'))));
        State.save({ silent: true });
        return JSON.stringify(State.schedule).length;
    });
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => typeof State !== 'undefined' && typeof openWeeklyClose === 'function');
    await page.evaluate(pinned);
    await page.evaluate(() => { weeklyCloseShared = () => true; showView('reports'); });
    await page.waitForTimeout(800);
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    let started = Date.now();
    await page.evaluate(async () => {
        openWeeklyClose();
        while (!(WEEKLY_CLOSE && WEEKLY_CLOSE.read)) await new Promise(done => setTimeout(done, 5));
    });
    const openMs = Date.now() - started;
    const closable = await page.evaluate(() => WEEKLY_CLOSE.read.men.filter(man => !man.held).length);
    await page.evaluate(() => weeklyCloseGo());
    started = Date.now();
    const landed = await page.evaluate(async () => {
        await weeklyCloseGo();
        while (OWES_PAGE === null) await new Promise(done => setTimeout(done, 5));
        await new Promise(done => requestAnimationFrame(() => setTimeout(done, 0)));
        return document.querySelector('#advancesView h2').textContent.replace(/[⁦-⁩]/g, '');
    });
    const pressMs = Date.now() - started;
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    console.log(`        record ${bytes} bytes; the list read and drawn ${openMs} ms; «סגור» to the close's page drawn ${pressMs} ms (4x)`);
    // The close is titled by the moment it was written - this machine's own clock here.
    same('fourteen men to close, and the press lands on the close', [closable, landed.indexOf('סגירה · ') === 0], [14, true]);
    check('the list is read and drawn inside 4 s', openMs < 4000, `${openMs} ms`);
    check('«סגור» lands on the close\'s page inside 15 s', pressMs < 15000, `${pressMs} ms`);
    await context.close();
}

suite('no page error anywhere');
check('no script error on any page', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
await server.close();
report();

function j(value) { return JSON.stringify(value); }
