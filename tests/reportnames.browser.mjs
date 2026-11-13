// The names, the groups and one word on «דוחות» ← «לפי עובד» - on the glass.
//
//   node tests/reportnames.browser.mjs
//
// THE OWNER, 2026-11-11, on v190: "can the names show more and be clearer, maybe in another
// colour, so I don't search much for the name" - and - "no need to write the dates for the
// workers who are paid weekly; שבוע or דו שבועי is enough, told apart by colours".
// tests/reportnames.test.mjs holds the words, the keys and every figure in Node. This holds
// what only a screen can say, in a real Chromium at 320x568, 375x667 and 440x956, light and
// dark, and with every font doubled:
//
//   - each group's heading on the glass is its cycle's word and nothing else, in its group's
//     ink beside its group's edge; the dates are off the glass and ON the paper and in the
//     picture, which say exactly what v190 said;
//   - a man's name is the first thing on his card: the topmost text, the heaviest, larger
//     than every figure but the amount to pay (still the largest), in his group's ink, at 7:1
//     and more on the card and on the card pressed; the longest names the suites seed wrap
//     at 320 and are never cut;
//   - the two groups are two colours a person tells apart at a glance: far apart under the
//     three colour-blindnesses, one warm and one cool (never red against green), and neither
//     edge a site's colour;
//   - «תצוגה מפורטת» wears the same edge and the same ink; the way to each group too, its
//     words inside each button - with two groups and with three (v192: a man whose cycle
//     changes inside the period has a group of his own);
//   - on an explicit range the heading is the word and the amber sentence says the rest;
//   - the preview under «כמה לקזז מהשכר הפעם?» says «יישאר חוב פתוח», typed into for real;
//   - 44px targets, no sideways scroll, and the phone's disk byte for byte what it was.
//
// NOT a real phone: emulated touch and Chromium's layout and fonts. Synthetic names only.

import { chromium } from 'playwright';
import { serve } from './serve.mjs';
import { launchLocalBrowser } from './network-guard.mjs';
import { verifyServedAssets, expectedShaFor } from './treecheck.mjs';
import { readPdf, pageText } from './pdf.mjs';
import { suite, check, same, given, report } from './runner.mjs';
import { censusOnly } from './census.mjs';

const root = new URL('..', import.meta.url).pathname;
const server = await serve(root);
check('the browser is served the named tree',
    (await verifyServedAssets(server.url, root, expectedShaFor(root))).ok);
const browser = await launchLocalBrowser(chromium, { executablePath: process.env.CHROME_PATH });
const errors = [];
const TODAY = '2026-11-11';
const plain = text => String(text).replace(/[‎‏⁦-⁩]/g, '').replace(/\s+/g, ' ').trim();

// The longest names seeded anywhere in the suites (tests/reportsclarity.browser.mjs,
// tests/find.browser.mjs, tests/payslips.browser.mjs, tests/reports.browser.mjs,
// tests/week.browser.mjs), one group each way.
const LONGEST = ['דוגמה הא עם שם ארוך במיוחד לבדיקת הרוחב', 'דוגמה עם שם ארוך במיוחד לבדיקה של שורה',
    'דוגמה גימל עם שם ארוך במיוחד לבדיקה', 'עובד עם שם ארוך במיוחד לבדיקה',
    'מוחמד עם שם ארוך מאוד לבדיקה', 'מוחמד עבד אלרחמן אבו מחאמיד'];

function seed(today, longest) {
    todayStr = () => today;
    const W = '2026-08-07=weekly';
    State.schedule = emptySchedule();
    State.schedule.workers = [
        { id: 'w_wa', name: 'כרם נסאר', active: true, dailyRate: 450, hourlyRate: 50, payCycles: W },
        { id: 'w_ba', name: 'סאלח מנסור', active: true, dailyRate: 500, hourlyRate: 0 },
        { id: 'w_wb', name: 'נאסר עודה', active: true, dailyRate: 400, hourlyRate: 0, payCycles: W },
        { id: 'w_wc', name: 'זיאד חלבי', active: true, dailyRate: 420, hourlyRate: 0, payCycles: W },
        { id: 'w_bb', name: 'עודי חסן', active: true, dailyRate: 480, hourlyRate: 0 },
        // Money and no day: his line is the money's section, under its own heading.
        { id: 'w_bc', name: 'רגא', active: true, dailyRate: 470, hourlyRate: 0 }
    ].concat(longest.map((name, at) => ({ id: `w_long${at}`, name, active: true, dailyRate: 410,
        hourlyRate: 0, payCycles: at % 2 ? undefined : W })));
    State.schedule.places = [{ id: 'p_01', name: 'הרצליה', active: true }];
    const work = (id, date, rate, hours) => assignPlace(State.schedule, date, id, 'actual', 'p_01', rate || 'normal', hours);
    ['2026-11-01', '2026-11-02', '2026-11-08'].forEach(date => work('w_wa', date));
    work('w_wa', '2026-11-09', 'double');
    work('w_wa', '2026-11-10', 'extra', 2);
    addAdvance(State.schedule, 'w_wa', '2026-11-09', 500, '');
    ['2026-11-08', '2026-11-10'].forEach(date => work('w_wb', date));
    work('w_wc', '2026-11-02');
    work('w_ba', '2026-11-01'); work('w_ba', '2026-11-09');
    work('w_bb', '2026-11-02', 'double');
    addAdvance(State.schedule, 'w_bc', '2026-11-04', 250, '');
    longest.forEach((name, at) => work(`w_long${at}`, '2026-11-09'));
    const plan = planCarryMigration(State.schedule);
    if (plan.needed) recordCarryApproval(State.schedule, plan, '2026-10-29T09:00:00.000Z', 'd_test');
    State.save({ silent: true });
    REPORT_RANGE.from = null; REPORT_RANGE.to = null; REPORT_PRESET = 'fortnight';
    REPORT_WORKERS = null; REPORT_SECTION = 'workers'; REPORT_CARD_GRID = true; REPORT_RANGE_OPEN = false;
    REPORT_DEDUCTIONS.clear();
    showView('reports');
}

async function phone(width, height, scheme) {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2,
        isMobile: true, hasTouch: true, colorScheme: scheme, serviceWorkers: 'block' });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.clock.setFixedTime(`${TODAY}T10:00:00`);
    await page.goto(server.url);
    await page.waitForFunction(() => typeof renderReports === 'function' && typeof State === 'object');
    await page.evaluate(`(${seed})(${JSON.stringify(TODAY)}, ${JSON.stringify(LONGEST)})`);
    await page.waitForTimeout(250);
    return page;
}

// Without the service worker's census of open builds (tests/census.mjs says why).
const disk = page => page.evaluate(() => JSON.stringify(Object.keys(localStorage).sort()
    .filter(key => key !== 'farkad:openBuilds').map(key => [key, localStorage.getItem(key)])));

// EVERY font doubled, the pseudo-elements' too: tests/mobile.test.mjs's mechanism - each
// stylesheet rule that sets a size in px, doubled and appended last and !important, and the
// root at 32px - because a heading's count (::after) is drawn by a rule no inline style
// reaches. An inline-style doubling passed while the heading widened the page to 369 in 320.
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

// ------------------------------------------------------------------ colour arithmetic
const rgb = text => (String(text).match(/[\d.]+/g) || []).slice(0, 3).map(Number);
const lin = c => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const luminance = c => { const [r, g, b] = rgb(c).map(lin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ratio = (a, b) => { const x = luminance(a); const y = luminance(b);
    return Math.round(((Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)) * 100) / 100; };
// The three dichromacies at full severity (Machado, Oliveira and Fernandes 2009), on linear light.
const DICHROMACY = {
    protan: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
    deutan: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]],
    tritan: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.303900]]
};
const lab = (c, kind) => {
    let v = rgb(c).map(lin);
    if (kind) v = DICHROMACY[kind].map(row => Math.min(1, Math.max(0, row[0] * v[0] + row[1] * v[1] + row[2] * v[2])));
    const [r, g, b] = v;
    const f = t => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
    const X = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047);
    const Y = f(0.2126 * r + 0.7152 * g + 0.0722 * b);
    const Z = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
    return [116 * Y - 16, 500 * (X - Y), 200 * (Y - Z)];
};
// CIEDE2000.
function deltaE([L1, a1, b1], [L2, a2, b2]) {
    const rad = d => d * Math.PI / 180; const deg = r => r * 180 / Math.PI;
    const Cb = (Math.hypot(a1, b1) + Math.hypot(a2, b2)) / 2;
    const G = 0.5 * (1 - Math.sqrt(Cb ** 7 / (Cb ** 7 + 25 ** 7)));
    const p1 = (1 + G) * a1; const p2 = (1 + G) * a2;
    const C1 = Math.hypot(p1, b1); const C2 = Math.hypot(p2, b2);
    const hue = (b, a) => { const h = deg(Math.atan2(b, a)); return h < 0 ? h + 360 : h; };
    const h1 = hue(b1, p1); const h2 = hue(b2, p2);
    let dh = h2 - h1;
    if (C1 * C2 === 0) dh = 0; else if (dh > 180) dh -= 360; else if (dh < -180) dh += 360;
    const dL = L2 - L1; const dC = C2 - C1; const dH = 2 * Math.sqrt(C1 * C2) * Math.sin(rad(dh / 2));
    const Lm = (L1 + L2) / 2; const Cm = (C1 + C2) / 2;
    let hm = h1 + h2;
    if (C1 * C2 !== 0) hm = Math.abs(h1 - h2) > 180 ? (h1 + h2 < 360 ? (h1 + h2 + 360) / 2 : (h1 + h2 - 360) / 2) : (h1 + h2) / 2;
    const T = 1 - 0.17 * Math.cos(rad(hm - 30)) + 0.24 * Math.cos(rad(2 * hm)) + 0.32 * Math.cos(rad(3 * hm + 6)) - 0.20 * Math.cos(rad(4 * hm - 63));
    const Rc = 2 * Math.sqrt(Cm ** 7 / (Cm ** 7 + 25 ** 7));
    const Rt = -Math.sin(rad(2 * 30 * Math.exp(-(((hm - 275) / 25) ** 2)))) * Rc;
    const Sl = 1 + 0.015 * (Lm - 50) ** 2 / Math.sqrt(20 + (Lm - 50) ** 2);
    const Sc = 1 + 0.045 * Cm; const Sh = 1 + 0.015 * Cm * T;
    return Math.sqrt((dL / Sl) ** 2 + (dC / Sc) ** 2 + (dH / Sh) ** 2 + Rt * (dC / Sc) * (dH / Sh));
}
const apart = (a, b) => Object.fromEntries(['normal', 'protan', 'deutan', 'tritan'].map(kind =>
    [kind, Math.round(deltaE(lab(a, kind === 'normal' ? null : kind), lab(b, kind === 'normal' ? null : kind)) * 10) / 10]));

// ------------------------------------------------------------------ what the page shows
const glass = page => page.evaluate(() => {
    // How far a control's words are drawn past its own edge (0: they are inside it).
    const wordsPast = node => {
        const box = node.getBoundingClientRect();
        let past = 0;
        const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
        for (let text = walker.nextNode(); text; text = walker.nextNode()) {
            if (!text.nodeValue.trim()) continue;
            const range = document.createRange();
            range.selectNodeContents(text);
            for (const piece of range.getClientRects()) past = Math.max(past, box.left - piece.left, piece.right - box.right);
        }
        return Math.round(past * 10) / 10;
    };
    const opaque = node => {
        for (let at = node; at; at = at.parentElement) {
            const colour = getComputedStyle(at).backgroundColor;
            const alpha = (colour.match(/[\d.]+/g) || [])[3];
            if (colour !== 'transparent' && (alpha === undefined || Number(alpha) > 0.95)) return colour;
        }
        return getComputedStyle(document.body).backgroundColor;
    };
    const box = node => { const r = node.getBoundingClientRect(); return { top: r.top, left: r.left, right: r.right, width: r.width, height: r.height }; };
    const textNodes = tile => [...tile.querySelectorAll('*')].filter(node => [...node.childNodes]
        .some(kid => kid.nodeType === 3 && kid.textContent.trim()) && node.getBoundingClientRect().height > 0);
    const rootStyle = getComputedStyle(document.documentElement);
    return {
        paper: getComputedStyle(document.body).backgroundColor,
        surface2: (() => { const probe = document.createElement('div'); probe.style.color = 'var(--surface-2)';
            document.body.appendChild(probe); const c = getComputedStyle(probe).color; probe.remove(); return c; })(),
        sites: Array.from({ length: 10 }, (_, at) => {
            const probe = document.createElement('div'); probe.style.color = `var(--site-${at + 1})`;
            document.body.appendChild(probe); const c = getComputedStyle(probe).color; probe.remove(); return c;
        }),
        tokens: ['--group-weekly-ink', '--group-weekly-mark', '--group-biweekly-ink', '--group-biweekly-mark']
            .map(name => rootStyle.getPropertyValue(name).trim()),
        headings: [...document.querySelectorAll('#reportsView .report-payroll h3.report-group[id]')].map(node => {
            const style = getComputedStyle(node);
            return { cycle: node.getAttribute('data-cycle'), shown: node.innerText.trim(), text: node.textContent,
                color: style.color, ground: opaque(node), size: parseFloat(style.fontSize), weight: Number(style.fontWeight),
                edge: style.borderInlineStartColor, edgeWidth: parseFloat(style.borderInlineStartWidth),
                hiddenDates: [...node.querySelectorAll('.report-group-when')].map(part => getComputedStyle(part).display) };
        }),
        others: [...document.querySelectorAll('#reportsView .report-payroll h3.report-group:not([id])')].map(node =>
            [node.textContent, getComputedStyle(node).color, parseFloat(getComputedStyle(node).borderInlineStartWidth)]),
        inks: ['--ink', '--ink-3'].map(name => { const probe = document.createElement('div'); probe.style.color = `var(${name})`;
            document.body.appendChild(probe); const c = getComputedStyle(probe).color; probe.remove(); return c; }),
        tiles: [...document.querySelectorAll('#reportsView .report-worker-tile')].filter(tile => tile.getBoundingClientRect().height > 0).map(tile => {
            const name = tile.querySelector('.report-tile-name');
            const style = getComputedStyle(name);
            const tileStyle = getComputedStyle(tile);
            const others = textNodes(tile).filter(node => node !== name && !name.contains(node));
            const value = tile.querySelector('.report-tile-value');
            return {
                id: tile.getAttribute('data-report-worker-id'),
                cycle: tile.closest('.report-payroll-group').getAttribute('data-cycle'),
                name: name.textContent, shown: name.innerText.replace(/\s+/g, ' ').trim(),
                color: style.color, ground: opaque(name), size: parseFloat(style.fontSize), weight: Number(style.fontWeight),
                lineHeight: parseFloat(style.lineHeight), height: name.getBoundingClientRect().height,
                cut: style.textOverflow === 'ellipsis' || style.whiteSpace === 'nowrap' || name.scrollWidth > name.clientWidth + 1
                    || name.scrollHeight > name.clientHeight + 1,
                top: box(name).top, othersTop: Math.min(...others.map(node => node.getBoundingClientRect().top)),
                othersMaxWeight: Math.max(...others.map(node => Number(getComputedStyle(node).fontWeight))),
                othersBelowPayable: Math.max(...others.filter(node => node !== value && !value.contains(node))
                    .map(node => parseFloat(getComputedStyle(node).fontSize))),
                payable: parseFloat(getComputedStyle(value).fontSize),
                figureColours: [...new Set([...tile.querySelectorAll('.report-tile-metric strong, .report-tile-line-number, .report-tile-value')]
                    .map(node => getComputedStyle(node).color))],
                edge: tileStyle.borderInlineStartColor, edgeWidth: parseFloat(tileStyle.borderInlineStartWidth),
                cardGround: tileStyle.backgroundColor, fits: tile.scrollWidth <= tile.clientWidth + 1
            };
        }),
        jumps: [...document.querySelectorAll('#reportsView .report-cycle-nav button')].map(node => {
            const style = getComputedStyle(node);
            const r = node.getBoundingClientRect();
            return { cycle: node.getAttribute('data-cycle'), text: node.textContent, color: style.color, ground: opaque(node),
                edge: style.borderInlineStartColor, w: r.width, h: r.height, past: wordsPast(node) };
        }),
        small: [...document.querySelectorAll('#reportsView button, #reportsView input, #reportsView summary')]
            .filter(node => node.offsetParent !== null)
            .filter(node => { const r = node.getBoundingClientRect(); return r.width < 44 || r.height < 44; })
            .map(node => node.textContent.slice(0, 24)),
        across: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1
    };
});

try {
    const SIZES = [[320, 568], [375, 667], [440, 956]];
    for (const [width, height] of SIZES) {
        for (const scheme of ['light', 'dark']) {
            const label = `${width}x${height} ${scheme}`;
            const page = await phone(width, height, scheme);
            given(`${label}: the seeded page drew its cards`, await page.locator('.report-worker-tile').count() === 4 + LONGEST.length,
                String(await page.locator('.report-worker-tile').count()));
            const before = await disk(page);
            await censusOnly(check, page, before);
            const seen = await glass(page);
            const ink = { weekly: seen.headings[0].color, biweekly: seen.headings[1].color };
            const mark = { weekly: seen.headings[0].edge, biweekly: seen.headings[1].edge };

            suite(`${label}: each group is its cycle's word on the glass, in its own colour`);
            same('two headings, weekly first, each its cycle\'s word and nothing else',
                seen.headings.map(head => [head.cycle, head.shown]), [['weekly', 'שבועי'], ['biweekly', 'דו־שבועי']]);
            same('their dates are in them and off the glass', seen.headings.map(head => head.hiddenDates), [['none'], ['none']]);
            same('the heading\'s text, which the paper and the picture read, keeps them',
                seen.headings.map(head => plain(head.text)), ['שבועי · 06/11/2026 - 12/11/2026', 'דו־שבועי · 30/10/2026 - 12/11/2026']);
            check('each word in its group\'s ink at 7:1 and more on what is behind it',
                seen.headings.every(head => ratio(head.color, head.ground) >= 7), JSON.stringify(seen.headings.map(head => ratio(head.color, head.ground))));
            check('beside its group\'s edge, 6px and more, at 3:1 and more on the page',
                seen.headings.every(head => head.edgeWidth >= 6 && ratio(head.edge, seen.paper) >= 3),
                JSON.stringify(seen.headings.map(head => [head.edgeWidth, ratio(head.edge, seen.paper)])));
            check('the words at 22px and more, heavy', seen.headings.every(head => head.size >= 22 && head.weight >= 800),
                JSON.stringify(seen.headings.map(head => [head.size, head.weight])));
            same('the colours are the stylesheet\'s two groups', [ink.weekly !== ink.biweekly, mark.weekly !== mark.biweekly], [true, true]);
            check('no other heading wears a group\'s colour or edge', seen.others.length > 0
                && seen.others.every(([, colour, edge]) => colour !== ink.weekly && colour !== ink.biweekly && edge < 1),
                JSON.stringify(seen.others));

            suite(`${label}: the two colours are told apart at a glance, by every eye`);
            const inks = apart(ink.weekly, ink.biweekly);
            const marks = apart(mark.weekly, mark.biweekly);
            check('the two inks stay far apart (ΔE2000 30 and more) to normal, protan, deutan and tritan eyes',
                Object.values(inks).every(value => value >= 30), JSON.stringify(inks));
            check('and so do the two edges', Object.values(marks).every(value => value >= 30), JSON.stringify(marks));
            const warmth = colour => lab(colour)[2];
            check('one warm and one cool - told apart on the blue-yellow axis the common colour-blind eye keeps, never red against green',
                warmth(ink.weekly) > 10 && warmth(ink.biweekly) < -10 && warmth(mark.weekly) > 10 && warmth(mark.biweekly) < -10,
                JSON.stringify([ink, mark].map(pair => [warmth(pair.weekly), warmth(pair.biweekly)].map(Math.round))));
            const nearestSite = colour => Math.min(...seen.sites.map(site => deltaE(lab(colour), lab(site))));
            check('no edge is a site\'s colour: each is ΔE2000 15 and more from all ten (js/ui/sitecolor.js)',
                [mark.weekly, mark.biweekly].every(colour => nearestSite(colour) >= 15),
                JSON.stringify([mark.weekly, mark.biweekly].map(colour => Math.round(nearestSite(colour)))));
            check('and no ink is one either', [ink.weekly, ink.biweekly].every(colour => seen.sites.indexOf(colour) === -1
                && nearestSite(colour) >= 5), JSON.stringify([ink.weekly, ink.biweekly].map(colour => Math.round(nearestSite(colour)))));

            suite(`${label}: a man's name is the first thing on his card`);
            given('both groups have cards', ['weekly', 'biweekly'].every(cycle => seen.tiles.some(tile => tile.cycle === cycle)));
            same('every name is in its group\'s ink', seen.tiles.filter(tile => tile.color !== ink[tile.cycle]).map(tile => tile.id), []);
            same('and every card carries its group\'s edge, 8px, on the side the name starts',
                seen.tiles.filter(tile => tile.edge !== mark[tile.cycle] || tile.edgeWidth < 8).map(tile => [tile.id, tile.edge, tile.edgeWidth]), []);
            check('every name at 7:1 and more on its card', seen.tiles.every(tile => ratio(tile.color, tile.ground) >= 7),
                JSON.stringify(seen.tiles.map(tile => ratio(tile.color, tile.ground))));
            check('and on the card pressed (the tonal ground)', seen.tiles.every(tile => ratio(tile.color, seen.surface2) >= 7),
                JSON.stringify([...new Set(seen.tiles.map(tile => ratio(tile.color, seen.surface2)))]));
            check('the edge at 3:1 and more on the card and on the page', seen.tiles.every(tile =>
                ratio(tile.edge, tile.cardGround) >= 3 && ratio(tile.edge, seen.paper) >= 3));
            check('larger than before (21px) and heavier (800): 26px, 900', seen.tiles.every(tile => tile.size >= 26 && tile.weight >= 900),
                JSON.stringify([...new Set(seen.tiles.map(tile => `${tile.size}/${tile.weight}`))]));
            check('the topmost text on the card', seen.tiles.every(tile => tile.top < tile.othersTop));
            check('the heaviest', seen.tiles.every(tile => tile.weight > tile.othersMaxWeight),
                JSON.stringify(seen.tiles.map(tile => tile.othersMaxWeight)));
            check('larger than every figure on it but the amount to pay', seen.tiles.every(tile => tile.size > tile.othersBelowPayable),
                JSON.stringify(seen.tiles.map(tile => [tile.size, tile.othersBelowPayable])));
            check('and the amount to pay is still the largest type on the card', seen.tiles.every(tile => tile.payable > tile.size),
                JSON.stringify(seen.tiles.map(tile => tile.payable)));
            // Ink, or ink-3 for a quiet nought (v181) - never a group's colour.
            check('the only words on the card in his group\'s colour: every figure is ink', seen.tiles.every(tile =>
                tile.figureColours.length > 0 && tile.figureColours.every(colour => seen.inks.indexOf(colour) !== -1)
                && seen.inks.indexOf(tile.color) === -1),
                JSON.stringify(seen.tiles.map(tile => tile.figureColours)));

            suite(`${label}: the longest names in the suites wrap - none is cut`);
            const long = seen.tiles.filter(tile => LONGEST.indexOf(tile.name) !== -1);
            same('all six are on the page', long.length, LONGEST.length);
            same('none is cut, clipped or ellipsised', seen.tiles.filter(tile => tile.cut).map(tile => tile.name), []);
            same('each is drawn whole', long.filter(tile => tile.shown !== tile.name).map(tile => tile.name), []);
            if (width === 320) {
                check('at 320 the longest wraps onto more lines rather than shrinking', long.filter(tile => tile.name === LONGEST[0])
                    .every(tile => tile.height >= 2 * tile.lineHeight - 1 && tile.size >= 26), JSON.stringify(long.map(tile => [tile.height, tile.lineHeight])));
            }
            check('every card holds its text', seen.tiles.every(tile => tile.fits));

            suite(`${label}: the way to each group, the targets, the page`);
            same('each button above the groups wears its group\'s edge and ink', seen.jumps.map(jump =>
                [jump.cycle, jump.edge === mark[jump.cycle], jump.color === ink[jump.cycle]]), [['weekly', true, true], ['biweekly', true, true]]);
            check('at 7:1 on its own ground, and 44px both ways', seen.jumps.every(jump => ratio(jump.color, jump.ground) >= 7
                && jump.w >= 44 && jump.h >= 44), JSON.stringify(seen.jumps.map(jump => [ratio(jump.color, jump.ground), jump.w, jump.h])));
            // v192's verification: the edge took 5px from the words, and at 320 «דו־שבועי · 2»
            // ran past its button. The padding beside the edge gives them back.
            check('and the words of each lie inside it', seen.jumps.every(jump => jump.past <= 1),
                JSON.stringify(seen.jumps.map(jump => [jump.cycle, jump.past])));
            same('every button, input and fold of the page is 44px both ways', seen.small, []);
            check('nothing scrolls sideways', seen.across);

            suite(`${label}: «תצוגה מפורטת» wears the same edge and the same ink`);
            await page.locator('.report-layout-toggle').click();
            const rows = await page.evaluate(() => [...document.querySelectorAll('#reportsView .report-payroll-group tbody tr')]
                .filter(tr => tr.getBoundingClientRect().height > 0).map(tr => {
                    const link = tr.querySelector('.link-cell');
                    const style = getComputedStyle(link);
                    return { cycle: tr.closest('.report-payroll-group').getAttribute('data-cycle'), edge: getComputedStyle(tr).borderInlineStartColor,
                        edgeWidth: parseFloat(getComputedStyle(tr).borderInlineStartWidth), color: style.color, size: parseFloat(style.fontSize),
                        weight: Number(style.fontWeight), cut: style.textOverflow === 'ellipsis' || link.scrollWidth > link.clientWidth + 1,
                        underlined: style.textDecorationLine.includes('underline') };
                }));
            given('the rows are on the glass', rows.length === 4 + LONGEST.length, String(rows.length));
            same('each row\'s edge and name are its group\'s, the name still a link',
                rows.filter(row => row.edge !== mark[row.cycle] || row.edgeWidth < 8 || row.color !== ink[row.cycle] || !row.underlined).length, 0);
            check('the name at 22px and more, heavy, and never cut', rows.every(row => row.size >= 22 && row.weight >= 900 && !row.cut),
                JSON.stringify(rows.map(row => [row.size, row.weight, row.cut])));
            check('nothing scrolls sideways', await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1));
            await page.locator('.report-layout-toggle').click();

            if (scheme === 'dark' && width === 320) {
                suite(`${label}: with every font doubled`);
                await doubleEveryFont(page);
                await page.waitForTimeout(200);
                given('the fonts did double: the names and the headings\' counts', await page.evaluate(() =>
                    parseFloat(getComputedStyle(document.querySelector('.report-tile-name')).fontSize) >= 52
                    && parseFloat(getComputedStyle(document.querySelector('#reportsView h3.report-group[id]'), '::after').fontSize) >= 32));
                const big = await page.evaluate(() => ({ across: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
                    cut: [...document.querySelectorAll('.report-tile-name, #reportsView h3.report-group[id]')]
                        .filter(node => node.scrollWidth > node.clientWidth + 1 || node.scrollHeight > node.clientHeight + 1).map(node => node.textContent),
                    cards: [...document.querySelectorAll('.report-worker-tile')].every(tile => tile.scrollWidth <= tile.clientWidth + 1) }));
                check('the page does not scroll sideways', big.across, JSON.stringify(big));
                same('no name and no heading is cut', big.cut, []);
                check('every card holds its text', big.cards);
                // And a heading with no dates in it at all - an explicit range; a crew paid
                // fortnightly - which v189's dated heading never wrapped for: its word and its
                // count have to share a line or wrap, and a heading that cannot wrap widens
                // the page (tests/mobile.test.mjs, 320px at 200%: 369 in 320).
                await page.evaluate(() => { REPORT_PRESET = 'custom'; render(); });
                await page.waitForTimeout(150);
                const typed = await page.evaluate(() => ({
                    undated: [...document.querySelectorAll('#reportsView h3.report-group[id]')].map(node =>
                        [node.getAttribute('data-cycle'), node.classList.contains('report-group-dated')]),
                    heads: [...document.querySelectorAll('#reportsView h3.report-group[id]')].map(node =>
                        [node.scrollWidth, node.clientWidth, getComputedStyle(node, '::after').content]),
                    wraps: [...document.querySelectorAll('#reportsView h3.report-group[id]')].map(node => getComputedStyle(node).flexWrap),
                    across: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1
                        && [...document.querySelectorAll('#reportsView h3.report-group[id]')]
                            .every(node => node.scrollWidth <= node.clientWidth + 1),
                    width: document.documentElement.scrollWidth }));
                same('a heading with no dates may wrap as well as one with them', typed.wraps, ['wrap', 'wrap']);
                given('on an explicit range the headings carry no dates', JSON.stringify(typed.undated)
                    === JSON.stringify([['weekly', false], ['biweekly', false]]), JSON.stringify(typed.undated));
                check('and with no dates to wrap they still do not widen the page', typed.across, JSON.stringify(typed));
                await page.evaluate(() => { REPORT_PRESET = 'fortnight'; render(); });
            }
            same(`${label}: the phone's disk is byte for byte what it was`, await disk(page), before);
            await page.context().close();
        }
    }

    suite('a crew paid fortnightly at 320px with every font doubled: the heading wraps, the page keeps its width');
    {
        // tests/mobile.test.mjs's own phone: thirty men, none weekly, eight with a day on
        // 12/08/2026 - so the page has one group and its heading carries no dates to wrap for.
        // Without the heading's wrap this measured 369 in 320 there.
        const context = await browser.newContext({ viewport: { width: 320, height: 568 }, deviceScaleFactor: 2,
            isMobile: true, hasTouch: true, colorScheme: 'light' });
        const page = await context.newPage();
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(`${server.url}/index.html`, { waitUntil: 'load' });
        await page.waitForTimeout(300);
        await page.evaluate(() => {
            todayStr = () => '2026-08-12';
            State.schedule.workers = Array.from({ length: 30 }, (unused, at) => ({ id: `w_${String(at + 1).padStart(2, '0')}`,
                name: `עובד ${at + 1}`, active: true, dailyRate: 400, hourlyRate: 50 }));
            State.schedule.places = Array.from({ length: 12 }, (unused, at) => ({ id: `p_${at + 1}`, name: `אתר ${at + 1}`, active: true }));
            State.date = '2026-08-12';
            State.save();
            ['w_01', 'w_02', 'w_03', 'w_07', 'w_11', 'w_19', 'w_28'].forEach((id, at) =>
                assignPlace(State.schedule, '2026-08-12', id, 'actual', `p_${(at % 4) + 1}`));
            markAbsent(State.schedule, '2026-08-12', 'w_05', 'actual');
            State.save();
            render();
        });
        await page.waitForTimeout(300);
        await doubleEveryFont(page);
        await page.waitForTimeout(300);
        const seen = await page.evaluate(async () => {
            showView('reports');
            await new Promise(done => setTimeout(done, 300));
            return {
                heads: [...document.querySelectorAll('#reportsView h3.report-group[id]')].map(node => ({
                    cycle: node.getAttribute('data-cycle'), text: node.textContent, count: getComputedStyle(node, '::after').content,
                    size: parseFloat(getComputedStyle(node).fontSize), wrap: getComputedStyle(node).flexWrap,
                    fits: node.scrollWidth <= node.clientWidth + 1 })),
                doc: document.documentElement.scrollWidth, inner: document.documentElement.clientWidth };
        });
        given('one group, «דו־שבועי», its count doubled beside it', seen.heads.length === 1
            && seen.heads[0].cycle === 'biweekly' && seen.heads[0].text === 'דו־שבועי' && seen.heads[0].size >= 48,
            JSON.stringify(seen.heads));
        // THE MECHANISM, measured as well as its effect: whether the word and its count share a
        // line at doubled text depends on the widths the glyphs are drawn at - measured 369 in
        // 320 in a fresh Chromium (tests/mobile.test.mjs) and fitting in this one, warm from
        // the pages above - and a phone's font is neither. A heading that may wrap never
        // widens the page, whatever the font.
        same('the heading may wrap', seen.heads.map(head => head.wrap), ['wrap']);
        check('the heading holds its word and its count', seen.heads.every(head => head.fits), JSON.stringify(seen.heads));
        check('and the page does not scroll sideways', seen.doc <= seen.inner + 1, JSON.stringify(seen));
        await context.close();
    }

    // THREE GROUPS (v192's verification). A man whose pay cycle changes inside the fortnight
    // has a group of his own for the part before it (v189), so the row above the groups holds
    // three buttons - and at 320 each was 45px wide with a 6px edge: «שבועי» was cut to «שבוע»
    // and both «דו־שבועי» ran 28px past their buttons. With three, the buttons take a line of
    // their own, and the padding beside the edge gives the words the room they had before it.
    suite('three groups on a 320px and a 375px phone: every button\'s words inside it');
    for (const [width, height] of [[320, 568], [375, 667]]) {
        for (const scheme of ['light', 'dark']) {
            const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2,
                isMobile: true, hasTouch: true, colorScheme: scheme, serviceWorkers: 'block' });
            const page = await context.newPage();
            page.on('pageerror', error => errors.push(error.message));
            await page.clock.setFixedTime('2026-11-04T10:00:00');
            await page.goto(server.url);
            await page.waitForFunction(() => typeof renderReports === 'function' && typeof State === 'object');
            await page.evaluate(() => {
                todayStr = () => '2026-11-04';
                State.schedule = emptySchedule();
                State.schedule.workers = [
                    { id: 'w_wa', name: 'כרם נסאר', active: true, dailyRate: 450, hourlyRate: 0, payCycles: '2026-08-07=weekly' },
                    { id: 'w_ba', name: 'סאלח מנסור', active: true, dailyRate: 500, hourlyRate: 0 },
                    { id: 'w_cut', name: 'ג׳מאל', active: true, dailyRate: 440, hourlyRate: 0, payCycles: '2026-11-06=weekly' }];
                State.schedule.places = [{ id: 'p_01', name: 'הרצליה', active: true }];
                const work = (id, date) => assignPlace(State.schedule, date, id, 'actual', 'p_01', 'normal');
                work('w_wa', '2026-11-02'); work('w_ba', '2026-11-02'); work('w_cut', '2026-11-02'); work('w_cut', '2026-11-03');
                State.save({ silent: true });
                REPORT_RANGE.from = null; REPORT_RANGE.to = null; REPORT_PRESET = 'fortnight';
                REPORT_WORKERS = null; REPORT_SECTION = 'workers'; REPORT_CARD_GRID = true; REPORT_RANGE_OPEN = false;
                REPORT_DEDUCTIONS.clear();
                showView('reports');
            });
            await page.waitForTimeout(300);
            const seen = await glass(page);
            const label = `${width}x${height} ${scheme}`;
            given(`${label}: three groups, and a button for each`, seen.jumps.length === 3,
                JSON.stringify(seen.jumps.map(jump => plain(jump.text))));
            check(`${label}: every button's words lie inside it`, seen.jumps.every(jump => jump.past <= 1),
                JSON.stringify(seen.jumps.map(jump => [plain(jump.text), jump.past, Math.round(jump.w)])));
            check(`${label}: and every button is 44px both ways`, seen.jumps.every(jump => jump.w >= 44 && jump.h >= 44),
                JSON.stringify(seen.jumps.map(jump => [Math.round(jump.w), Math.round(jump.h)])));
            check(`${label}: nothing scrolls sideways`, seen.across);
            await context.close();
        }
    }

    suite('an explicit range: the word, the colour, and the amber sentence under it');
    {
        const page = await phone(375, 667, 'light');
        await page.evaluate(() => { REPORT_PRESET = 'custom'; render(); });
        const facts = await page.evaluate(() => ({
            heads: [...document.querySelectorAll('#reportsView .report-payroll h3.report-group[id]')].map(node =>
                [node.textContent, node.innerText.trim(), node.getAttribute('data-cycle')]),
            warn: [...document.querySelectorAll('#reportsView .report-payroll .hint-warn')]
                .filter(node => node.offsetParent !== null).map(node => node.textContent),
            range: document.querySelector('.range-current').textContent }));
        same('each heading is the word alone, in the DOM as on the glass, keyed for its colour', facts.heads,
            [['שבועי', 'שבועי', 'weekly'], ['דו־שבועי', 'דו־שבועי', 'biweekly']]);
        check('the weekly men, looked at over a fortnight, are told so on the glass', facts.warn.some(text =>
            text === 'הטווח שנבחר אינו תקופת התשלום של העובדים האלה, ולכן זאת תצוגה של ימים ולא '
            + 'חשבון לתשלום: אין כאן יתרה מועברת ואי אפשר לסגור מכאן.'), JSON.stringify(facts.warn));
        same('and the range is the one on the picker', plain(facts.range), '30/10/2026 - 12/11/2026');
        await page.context().close();
    }

    suite('the paper, the picture and the file still say which period is which');
    {
        const page = await phone(390, 844, 'light');
        const picture = await page.evaluate(() => readReportPrintout());
        same('the picture titles each table with its group\'s word AND its dates, read off the heading',
            picture.groups.slice(0, 2).map(group => plain(group.groupTitle)),
            ['שבועי · 06/11/2026 - 12/11/2026', 'דו־שבועי · 30/10/2026 - 12/11/2026']);
        await page.emulateMedia({ media: 'print' });
        const paper = await page.evaluate(() => ({
            heads: [...document.querySelectorAll('#reportsView .report-payroll h3.report-group[id]')].map(node => node.innerText),
            cards: [...document.querySelectorAll('.report-worker-tile')].filter(node => node.getBoundingClientRect().height > 0).length }));
        same('on paper each heading says its dates', paper.heads.map(plain),
            ['שבועי · 06/11/2026 - 12/11/2026', 'דו־שבועי · 30/10/2026 - 12/11/2026']);
        same('and paper carries no card', paper.cards, 0);
        await page.emulateMedia({ media: null });
        const pdf = readPdf(await page.pdf({ format: 'A4', printBackground: true })).pages.map(pageText).join('\n');
        const reversed = text => [...text].reverse().join('');
        check('a real printout carries the week\'s first day, which only the weekly heading prints',
            pdf.includes('06/11/2026') || pdf.includes(reversed('06/11/2026')), pdf.slice(0, 300));
        const sheets = await page.evaluate(() => reportSheets());
        const at = sheets.payroll[0].indexOf('מחזור תשלום');
        same('the file names each weekly man\'s week, as v190\'s did', sheets.payroll.filter(row => row[0] === 'כרם נסאר')
            .map(row => row[at]), ['שבועי · 06/11/2026 עד 12/11/2026']);
        await page.context().close();
    }

    suite('the preview under «כמה לקזז מהשכר הפעם?» says «יישאר חוב פתוח», typed into');
    {
        const page = await phone(390, 844, 'light');
        const before = await disk(page);
        await page.locator('[data-report-worker-id="w_wa"]').click();
        const closure = page.locator('#workerDaysBody .period-closure');
        given('the closing block is offered for his week', await closure.count() === 1);
        await closure.locator('input').fill('300');
        // His week: 08/11, the double 09/11 and the extra-hours day 10/11 (2 hours at 50):
        // 4 x 450 + 100 = 1,900 earned; 500 taken; 300 chosen: 1,600 to him, 200 still owed.
        same('the preview, word for word (PROPOSED)', plain(await closure.locator('.finance-preview').innerText()),
            'לתשלום לעובד: 1600 ₪ · יישאר חוב פתוח: 200 ₪');
        check('no Arabic letter in it', !/\p{Script=Arabic}/u.test(await closure.locator('.finance-preview').innerText()));
        await page.evaluate(() => closeWorkerDays());
        same('typing a figure wrote nothing', await disk(page), before);
        await page.context().close();
    }

    check('no uncaught browser errors', errors.length === 0, JSON.stringify(errors));
} finally { await browser.close(); await server.close(); }
report();
