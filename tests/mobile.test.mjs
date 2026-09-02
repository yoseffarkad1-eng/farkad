// The mobile layout suite: the phone, measured.
//
//   node tests/mobile.test.mjs
//
// tests/shot.mjs takes a picture of a screen and asserts nothing, which is the right job
// for a picture and the wrong one for evidence. Everything this app needs to be true on a
// phone is a fact about rectangles - is the date still on screen, does the last man in
// the crew clear the bars, is that button 44 pixels, does the page scroll sideways - and
// every one of those is checked here, at four widths, in both colour schemes, with and
// without a home indicator, in portrait and landscape, and at twice the text size.
//
// A word on what this is not. Playwright drives a desktop Chromium with a phone-sized
// viewport. That is the right tool for layout arithmetic and it is NOT an iPhone: WebKit's
// dynamic toolbars, its rubber-band scrolling, its own idea of a safe area and iOS Dynamic
// Type are not emulated here, and nothing in this file should be read as coverage of a
// real device. The 200% pass below forces every computed font-size to twice its value,
// which genuinely changes what is rendered and is genuinely not Dynamic Type. See
// docs/iphone-acceptance.md, which lists what each suite in this repository runs on.

import { serve } from './serve.mjs';
import { verifyServedAssets, expectedShaFor } from './treecheck.mjs';
import { suite, check, given, report } from './runner.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const EXEC = process.env.CHROME_PATH || undefined;

const server = process.env.SMOKE_URL
    ? { url: process.env.SMOKE_URL, close: () => {} }
    : await serve(new URL('..', import.meta.url).pathname);
const BASE = server.url;

// Whatever the ORIGIN handed the browser, hashed against the commit.
//
// SMOKE_URL points this suite at a server somebody is already running. Nothing checked
// what that server served, so an origin rooted at another tree passed every check in this
// file and the count meant nothing. Each shell path is fetched and compared with the Git
// blob at the commit under test - which is also the honest answer to "which bytes did
// these numbers come from".
const SERVED_ROOT = new URL('..', import.meta.url).pathname;
const SERVED_SHA = expectedShaFor(SERVED_ROOT);
const SERVED = await verifyServedAssets(BASE, SERVED_ROOT, SERVED_SHA);
check('the origin served this commit, byte for byte',
    SERVED.ok, `${SERVED.checked} assets; ${SERVED.wrong.slice(0, 3).join(' | ')}`);

const browser = await chromium.launch(EXEC ? { executablePath: EXEC } : {});

// The four widths this app is actually opened on: the smallest phone still in use, the
// iPhone mini/SE, the ordinary iPhone, and the big one.
const WIDTHS = [320, 375, 390, 430];
const HEIGHTS = { 320: 568, 375: 667, 390: 844, 430: 932 };

// A crew of thirty, which is a real crew for this app and long enough that the end of the
// list is well past the fold.
const CREW = 30;

async function open({ width, height, scheme = 'light', touch = true, mode = 'workers' }) {
    const context = await browser.newContext({
        viewport: { width, height },
        deviceScaleFactor: 2,
        isMobile: touch,
        hasTouch: touch,
        colorScheme: scheme
    });
    const page = await context.newPage();
    page.on('dialog', dialog => dialog.accept());
    await page.goto(`${BASE}/index.html`, { waitUntil: 'load' });
    await page.waitForTimeout(300);

    await page.evaluate(([count, mode]) => {
        State.schedule.workers = Array.from({ length: count }, (unused, i) => ({
            id: `w_${String(i + 1).padStart(2, '0')}`,
            name: `עובד ${i + 1}`,
            active: true,
            dailyRate: 400,
            hourlyRate: 50
        }));
        State.schedule.places = Array.from({ length: 12 }, (unused, i) => ({
            id: `p_${i + 1}`, name: `אתר ${i + 1}`, active: true
        }));
        State.date = '2026-08-12';
        State.save();
        showView('day');
        // Somebody's evening, so the by-site view has cards with people on them: an empty
        // site card has no chips, and the chips are half of what this file measures.
        ['w_01', 'w_02', 'w_03', 'w_07', 'w_11', 'w_19', 'w_28'].forEach((id, i) => {
            assignPlace(State.schedule, '2026-08-12', id, 'actual', `p_${(i % 4) + 1}`);
        });
        markAbsent(State.schedule, '2026-08-12', 'w_05', 'actual');
        State.save();

        // By worker by default, which is the list most of this suite is about: the by-site
        // view is a grid of sites and has no row per man to reach the bottom of. The
        // suites that measure SIZES rather than reach switch it over - see below, and see
        // what that exclusion was quietly hiding.
        if (typeof setDayMode === 'function') setDayMode(mode);
        render();
    }, [CREW, mode]);
    await page.waitForTimeout(300);
    return page;
}

async function setInset(page, pixels) {
    await page.evaluate(value => {
        if (value) document.documentElement.style.setProperty('--safe-bottom', value + 'px');
        else document.documentElement.style.removeProperty('--safe-bottom');
        if (typeof scheduleBarMeasure === 'function') scheduleBarMeasure();
    }, pixels);
    await page.waitForTimeout(250);
}

// Everything a finger is meant to land on, and how big it is. The week grid is the one
// documented exception and only across: seven days plus the names have to fit the
// narrowest phone, so a column came out 42px rather than 44 - full height, and a mis-tap
// opens the wrong day's picker, which names the day before anything is recorded.
//
// There is no per-class floor here any more. This helper carried one for .week-cell, and a
// floor with an exemption in it is not a floor: it is a list of the controls that were
// allowed to be too small, written in the place a reader would look for the guarantee.
async function undersized(page) {
    return page.evaluate(() => {
        const out = [];
        document.querySelectorAll('button, [role="button"], a[href], input, select, textarea, .week-cell')
            .forEach(node => {
                if (node.offsetParent === null) return;
                if (node.getAttribute('aria-hidden') === 'true') return;
                const box = node.getBoundingClientRect();
                if (box.width === 0 || box.height === 0) return;
                if (box.width >= 44 && box.height >= 44) return;
                out.push({
                    cls: String(node.className).slice(0, 26),
                    text: (node.textContent || node.value || '').trim().slice(0, 12),
                    w: Math.round(box.width), h: Math.round(box.height)
                });
            });
        return out;
    });
}

// Text nobody should have to lean in for.
//
// Two floors, because one would be a lie. The week grid is seven columns of dates on a
// 320px screen and physically cannot carry the same size as a heading - so the grid has
// its own floor and everything else has the real one. What is NOT allowed is a floor
// nobody wrote down, which is how a 9px date and a 10.5px label ended up on the screen
// somebody reads at the end of a working day.
const TEXT_FLOOR = 14;
const GRID_FLOOR = 12;
const IN_GRID = '.week-table, .week-grid, .week-cell, .day-initial, .week-total, .corner';

async function unreadable(page, floor = TEXT_FLOOR, gridFloor = GRID_FLOOR, inGrid = IN_GRID) {
    return page.evaluate(([floorPx, gridPx, gridSel]) => {
        const out = [];
        document.querySelectorAll('body *').forEach(node => {
            if (node.offsetParent === null) return;
            if (node.getAttribute('aria-hidden') === 'true') return;
            // Only elements with text of their own: a wrapper inherits its size from
            // whatever is inside it and would be counted twice.
            const owns = [...node.childNodes]
                .some(child => child.nodeType === 3 && child.textContent.trim());
            if (!owns) return;

            const box = node.getBoundingClientRect();
            if (box.width === 0 || box.height === 0) return;

            const size = parseFloat(getComputedStyle(node).fontSize);

            // Deliberately hidden text keeps its place in the document for a screen
            // reader while the eye is given something else - the week's corner label has
            // no room on a narrow phone, and an absent cell is drawn as a dash by a
            // ::before rule. Nothing to read is not text too small to read.
            if (size === 0) return;

            // A marker is not a sentence. The diamond that distinguishes two sites
            // sharing a colour, the ✕ on a chip, the dash for an absence: they carry no
            // letters and no digits, and the words they sit beside are always spelled out
            // in full. Growing them would make the decoration compete with the name.
            // Anything with a letter or a number in it is text and is held to the floor.
            if (!/[\p{L}\p{N}]/u.test(node.textContent)) return;

            const limit = node.closest(gridSel) ? gridPx : floorPx;
            if (size + 0.01 >= limit) return;
            out.push({
                px: Math.round(size * 10) / 10,
                cls: String(node.className || node.tagName).slice(0, 24),
                text: node.textContent.trim().slice(0, 18)
            });
        });
        return out;
    }, [floor, gridFloor, inGrid]);
}

// Is this element the thing a tap at its own centre would hit?
async function reachable(page, selector, which = 0) {
    return page.evaluate(([sel, index]) => {
        const nodes = [...document.querySelectorAll(sel)].filter(node => node.offsetParent !== null);
        const node = index < 0 ? nodes[nodes.length + index] : nodes[index];
        if (!node) return { found: false };
        const box = node.getBoundingClientRect();
        const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
        return {
            found: true,
            text: (node.textContent || '').trim().slice(0, 16),
            onScreen: box.top >= -1 && box.bottom <= window.innerHeight + 1,
            hit: Boolean(hit) && (node === hit || node.contains(hit)),
            box: { top: Math.round(box.top), bottom: Math.round(box.bottom) }
        };
    }, [selector, which]);
}

// ---------------------------------------------------------------- the matrix

for (const width of WIDTHS) {
    for (const scheme of ['light', 'dark']) {
        for (const inset of [0, 34]) {
            const label = `${width}px ${scheme}${inset ? ' with a home indicator' : ''}`;
            suite(label);

            const page = await open({ width, height: HEIGHTS[width], scheme });
            await setInset(page, inset);

            // Nothing scrolls sideways. A page that does hides the end of every row.
            // Against clientWidth, not innerWidth: on an overflowing layout Chromium
            // widens the layout viewport to fit (shrink-to-fit), and doc <= inner then
            // passes on exactly the broken screens.
            const across = await page.evaluate(() => ({
                doc: document.documentElement.scrollWidth,
                client: document.documentElement.clientWidth
            }));
            check(`${label}: the page does not scroll sideways`,
                across.doc <= across.client + 1, JSON.stringify(across));

            const small = await undersized(page);
            check(`${label}: everything a finger lands on is a finger's size`,
                small.length === 0, JSON.stringify(small).slice(0, 200));

            const faint = await unreadable(page);
            check('and nothing on it is too small to read', faint.length === 0,
                JSON.stringify(faint.slice(0, 4)));

            // The date. It decides where every tap lands, so it is on screen at the top of
            // the list and still on screen at the bottom of it.
            const date = await page.evaluate(async () => {
                const header = document.querySelector('.day-header');
                const read = () => {
                    const box = header.getBoundingClientRect();
                    return {
                        top: Math.round(box.top),
                        bottom: Math.round(box.bottom),
                        text: header.textContent.includes('12/08/2026')
                    };
                };
                window.scrollTo(0, 0);
                await new Promise(done => setTimeout(done, 150));
                const atTop = read();
                window.scrollTo(0, document.body.scrollHeight);
                await new Promise(done => setTimeout(done, 250));
                const atBottom = read();
                return { atTop, atBottom, height: window.innerHeight };
            });
            check(`${label}: the date is on screen at the top of the list`,
                date.atTop.text && date.atTop.bottom > 0 && date.atTop.top < date.height,
                JSON.stringify(date.atTop));
            check(`${label}: and still on screen at the bottom of it`,
                date.atBottom.text && date.atBottom.bottom > 0
                && date.atBottom.top < date.height, JSON.stringify(date.atBottom));

            // A banner is the app telling somebody something. Sticky chrome must not sit
            // on top of it.
            const banner = await page.evaluate(async () => {
                const node = document.getElementById('offlineBanner');
                node.textContent = 'אין חיבור לאינטרנט';
                node.style.display = '';
                window.scrollTo(0, 0);
                await new Promise(done => setTimeout(done, 200));
                const box = node.getBoundingClientRect();
                const hit = document.elementFromPoint(box.left + box.width / 2, box.top + 4);
                return {
                    shown: box.height > 0,
                    covered: !(node === hit || node.contains(hit)),
                    by: hit ? String(hit.className || hit.tagName).slice(0, 30) : 'nothing'
                };
            });
            check(`${label}: a banner is not covered by anything sticky`,
                banner.shown && !banner.covered, JSON.stringify(banner));

            // The first, the middle and the last man in the crew: each scrolled to, each
            // clear of the bars, each the thing a tap at its centre lands on.
            for (const [where, index] of [['first', 0], ['middle', 14], ['last', -1]]) {
                const row = await page.evaluate(async at => {
                    const rows = [...document.querySelectorAll('#dayView .worker-list .wrow')]
                        .filter(node => node.offsetParent !== null);
                    const node = at < 0 ? rows[rows.length - 1] : rows[at];
                    if (!node) return { found: false, rows: rows.length };
                    node.scrollIntoView({ block: 'center' });
                    await new Promise(done => setTimeout(done, 200));

                    const box = node.getBoundingClientRect();
                    const hit = document.elementFromPoint(
                        box.left + box.width / 2, box.top + box.height / 2);
                    const bars = ['.tabs', '.day-actions']
                        .map(selector => document.querySelector(selector))
                        .filter(bar => bar && getComputedStyle(bar).position === 'fixed')
                        .map(bar => bar.getBoundingClientRect().top);
                    return {
                        found: true,
                        name: node.textContent.trim().slice(0, 12),
                        hit: node === hit || node.contains(hit),
                        clear: bars.length === 0 || box.bottom <= Math.min(...bars) + 1,
                        top: Math.round(box.top)
                    };
                }, index);
                check(`${label}: the ${where} man in the crew can be tapped`,
                    row.found && row.hit && row.clear, JSON.stringify(row));
            }

            // Every action along the bottom - the dock's two buttons and all four tabs.
            for (const [what, selector, which] of [
                ['the copy button', '.day-actions button', 0],
                ['the WhatsApp button', '.day-actions button', -1],
                ['the first tab', '.tabs .tab', 0],
                ['the last tab', '.tabs .tab', -1]
            ]) {
                await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
                await page.waitForTimeout(150);
                const found = await reachable(page, selector, which);
                check(`${label}: ${what} is on screen and can be pressed`,
                    found.found && found.onScreen && found.hit, JSON.stringify(found));
            }

            // Dark is not just a palette swap: text has to still be readable against
            // whatever it is on.
            if (scheme === 'dark') {
                const colours = await page.evaluate(() => {
                    const name = document.querySelector('#dayView .wrow-name');
                    if (!name) return { ratio: 0, missing: true };
                    const rgb = value => (value.match(/[\d.]+/g) || []).map(Number);
                    const lum = ([r, g, b]) => {
                        const channel = c => {
                            const v = c / 255;
                            return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
                        };
                        return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
                    };
                    const ink = rgb(getComputedStyle(name).color);
                    const paper = rgb(getComputedStyle(document.body).backgroundColor);
                    const high = Math.max(lum(ink), lum(paper));
                    const low = Math.min(lum(ink), lum(paper));
                    return { ratio: (high + 0.05) / (low + 0.05) };
                });
                check(`${label}: a worker's name is legible against the page`,
                    colours.ratio >= 4.5, colours.missing ? 'no worker row on screen'
                        : `${colours.ratio.toFixed(2)}:1`);
            }

            await page.context().close();
        }
    }
}

// ---------------------------------------------------------------- the list starts high
//
// The compact day (v93). On first open, with the account warning folded and both bottom
// bars in place, this many whole names are on the screen before anybody scrolls: six on
// the big phone, five on the ordinary one, three on the smallest. Each piece of chrome is
// held to the height the design promised it, so the count cannot drift back down one
// pixel at a time - the way the screen this replaces got to four.
// The heights are the design's own proof sizes, named here rather than taken from HEIGHTS:
// that table opens 320 at the SE's 568, where three whole rows do not exist on any layout
// (290px of chrome above the list leaves 141 under it). The SE is measured too, at the
// floor it can actually hold - one whole name where v91 had none at all.
for (const [width, height, atLeast] of [[430, 932, 6], [390, 844, 5], [320, 667, 3], [320, 568, 1]]) {
    const label = `${width}×${height}: the list starts high`;
    suite(label);

    const page = await open({ width, height });
    await setInset(page, 34);
    const m = await page.evaluate(async () => {
        window.scrollTo(0, 0);
        await new Promise(done => setTimeout(done, 200));
        const box = sel => {
            const node = document.querySelector(sel);
            return node ? Math.round(node.getBoundingClientRect().height) : null;
        };
        const banner = document.getElementById('accountBanner');
        const sum = banner.querySelector('.banner-sum');
        const dock = document.querySelector('.day-actions').getBoundingClientRect().top;
        const rows = [...document.querySelectorAll('#dayView .worker-list .wrow')]
            .map(node => node.getBoundingClientRect());
        return {
            bannerShown: banner.style.display !== 'none' && banner.getBoundingClientRect().height > 0,
            folded: Boolean(sum) && sum.getAttribute('aria-expanded') === 'false',
            topbar: box('.topbar'),
            banner: box('#accountBanner'),
            header: box('.day-header'),
            mode: box('.day-mode-row'),
            rows: rows.map(b => Math.round(b.height)),
            complete: rows.filter(b => b.bottom <= dock + 0.5).length
        };
    });
    // The warning is the block that follows the real clock rather than the seeded day;
    // the count below is only worth anything if it is measured WITH the warning up.
    given(`${label}: the account warning is on the screen, folded`,
        m.bannerShown && m.folded === true);
    check(`${label}: the strip above the day is 52px or less`, m.topbar <= 52, `${m.topbar}px`);
    check(`${label}: the folded warning is 56-64px`, m.banner >= 56 && m.banner <= 64, `${m.banner}px`);
    check(`${label}: the day header is 96-112px`, m.header >= 96 && m.header <= 112, `${m.header}px`);
    check(`${label}: the switcher row is 44-48px`, m.mode >= 44 && m.mode <= 48, `${m.mode}px`);
    check(`${label}: every worker row is 64-72px`,
        m.rows.length > 0 && m.rows.every(h => h >= 64 && h <= 72), JSON.stringify(m.rows.slice(0, 8)));
    check(`${label}: at least ${atLeast} whole names above the dock, unscrolled`,
        m.complete >= atLeast, `${m.complete} whole rows`);

    await page.context().close();
}

// ---------------------------------------------------------------- landscape

for (const width of WIDTHS) {
    const label = `${HEIGHTS[width]}x${width} landscape`;
    suite(label);

    const page = await open({ width: HEIGHTS[width], height: width });
    await setInset(page, 34);

    const across = await page.evaluate(() => ({
        doc: document.documentElement.scrollWidth,
        client: document.documentElement.clientWidth
    }));
    check(`${label}: the page does not scroll sideways`,
        across.doc <= across.client + 1, JSON.stringify(across));

    const small = await undersized(page);
    check(`${label}: everything a finger lands on is a finger's size`,
        small.length === 0, JSON.stringify(small).slice(0, 200));

    const faint = await unreadable(page);
    check('and nothing on it is too small to read', faint.length === 0,
        JSON.stringify(faint.slice(0, 4)));

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(200);
    const last = await reachable(page, '#dayView .worker-list .wrow', -1);
    check(`${label}: the last man in the crew is still reachable`,
        last.found && last.hit, JSON.stringify(last));

    // AND THE DATE IS STILL THERE, at the bottom of the list.
    //
    // The check above and this one pull against each other, which is the whole reason
    // this block is worth measuring. A pinned header keeps the date and can hold the last
    // row underneath it; an unpinned one frees the row and lets the date scroll away. The
    // second is the trade this app used to make, and it is the wrong one: the entry that
    // costs real money is a day recorded against the wrong date, and halfway down a list
    // of names nothing else says what day this is.
    //
    // So both are asked, in the same scrolled-to-the-bottom state, and the header
    // collapses to one row rather than choosing between them.
    const dateSeen = await page.evaluate(() => {
        const header = document.querySelector('.day-header');
        if (!header) return { found: false };
        const box = header.getBoundingClientRect();
        return {
            found: true,
            text: header.textContent.indexOf('12/08/2026') !== -1,
            top: Math.round(box.top),
            height: Math.round(box.height),
            onScreen: box.bottom > 0 && box.top < window.innerHeight
        };
    });
    check(`${label}: the date is still on screen at the bottom of the list`,
        dateSeen.found && dateSeen.text && dateSeen.onScreen,
        JSON.stringify(dateSeen));

    // What it costs, stated as a number rather than as "short". A header that creeps back
    // up is how the last row ends up underneath it again, and that regression is silent -
    // the row is still THERE, it is just not tappable.
    check(`${label}: and the pinned bar stays out of the crew's way`,
        dateSeen.height > 0 && dateSeen.height <= 80,
        `${dateSeen.height}px`);

    await page.context().close();
}

// ---------------------------------------------------------------- text at 200%
//
// WHAT THIS DOES, AND WHAT IT IS NOT.
//
// It used to set document.documentElement.style.fontSize = '32px' and call that 200%.
// Measured before and after that line, on this app:
//
//   day header 17px -> 17px      tab 14px -> 14px
//   button     14px -> 14px      body 17px -> 17px
//
// Nothing moved. This stylesheet is written in fixed pixels - deliberately, and there are
// seven `rem` in the whole file - so the root font size is a number almost nothing reads.
// The suite was therefore drawing the app at its ordinary size and reporting it as
// doubled text: not a weak test, a test of nothing, printing four green lines a person
// would have relied on.
//
// The replacement for that was to read every element's computed size and set it back
// doubled as an INLINE STYLE. That was measurably better and still not true, and the way
// it failed is worth writing down because it is the same shape as the first failure.
//
// js/app.js redraws the whole visible view on every change - deliberately; its own comment
// says redrawing is cheaper in bugs than tracking which nodes need patching - so showView()
// and render() REPLACE the nodes the inline styles were written on. css/app.css declares
// 169 font sizes in px and no rem at all, and every one of those rules re-imposes its fixed
// size on each freshly created element. Measured on this app at 390px, after the four
// showView() calls this block performs: 14 of 121 visible text nodes were still doubled and
// 107 were byte-identical to a run with no scaling at all. The 14 survivors were the static
// shell in index.html - body, .tabs, .day-actions, the sheet frame - which is precisely and
// only the set the old four-selector guard sampled. The guard stayed green while 88% of the
// screen was at ordinary size, and .day-header passed it by inheriting from a doubled body
// rather than by being scaled.
//
// So the CASCADE is rewritten instead of the nodes. Every font-size rule in every same-
// origin stylesheet is re-emitted at twice its value with !important, in one <style> tag
// appended last. Nothing is attached to any element, so a node that does not exist yet is
// covered the instant it is created - which is the whole property the previous two
// mechanisms lacked. Measured the same way afterwards: 121 of 121, an exact bijection with
// the unscaled buckets.
//
// Rejected, with the numbers, so nobody re-tries them: `body { zoom: 2 }` moves no computed
// font-size at all (17 -> 17) and corrupts the measurement this block is built on -
// scrollWidth went 390 -> 461 against an unchanged clientWidth, so every "still fits across"
// check would fail spuriously. A MutationObserver compounds through inheritance: a node
// inserted under an already-doubled ancestor reads the inherited 34 and doubles that, and
// .day-header lands at 68px.
//
// It is still not iOS Dynamic Type. Chromium cannot model that, and the list is specific:
// Dynamic Type is not a uniform multiplier - each UIFont.TextStyle has its own non-linear
// curve and some clamp - `-webkit-text-size-adjust: 100%` in css/app.css is a WebKit opt-out
// with no Chromium equivalent in play, SF's optical variants change advance widths across
// the 20pt boundary while Chromium substitutes a different family entirely, and Safari has
// its own minimum font size and font-boosting heuristics. VoiceOver is not modelled at all:
// focus order under the rotor, the announcement of RTL Hebrew mixed with LTR digits, and
// whether the dock is reachable are not rendering questions. What this proves is that the
// layout survives text at twice the size. Dynamic Type at AX2 and VoiceOver on a real phone
// stay physical checks, and docs/iphone-acceptance.md says so.
const doubleEveryFontSize = page => page.evaluate(() => {
    const out = [];
    let seen = 0;
    const walk = (rules, wrap) => {
        for (const rule of rules) {
            // Branch on TYPE, not on the presence of .cssRules: CSS Nesting gives an
            // ordinary style rule one too, and testing for it swallows the whole file and
            // emits nothing. 4 is @media, 12 is @supports, 1 is a style rule.
            if (rule.type === 4 || rule.type === 12) {
                const head = rule.type === 4
                    ? `@media ${rule.media.mediaText}` : `@supports ${rule.conditionText}`;
                walk(rule.cssRules, text => wrap(`${head}{${text}}`));
                continue;
            }
            if (rule.type !== 1 || !rule.style) continue;
            const raw = rule.style.getPropertyValue('font-size');
            if (!raw) continue;
            seen += 1;
            // pt appears only inside @media print, which this suite never renders.
            if (!/^[\d.]+px$/.test(raw.trim())) continue;
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
    // Last, and !important: it competes with rules of identical specificity from the very
    // sheet it was generated from.
    style.textContent = out.join('\n');
    document.head.appendChild(style);
    return { seen, emitted: out.length };
});

// SAMPLED ON NODES THE APP BUILDS, not on the shell it was served with.
//
// The old sampler read .day-header, .tab, body and a dock button. Three of those are static
// elements of index.html that keep an inline style for the life of the page, and the fourth
// has no font-size rule of its own and inherits from the third. It was structurally
// incapable of failing: it would have stayed green if the mechanism were reduced to setting
// one size on <body>.
//
// These four are created by renderDay() and openAssignSheet(), every one of them has its
// own px rule in css/app.css, and none of them exists in index.html.
const REBUILT = ['.wrow-name', '.wrow .tag',
    '#assignSheet .sheet-foot button', '#assignSheet .sheet-body button'];

const sampleSizes = page => page.evaluate(list => {
    const at = selector => {
        const node = document.querySelector(selector);
        return node ? parseFloat(getComputedStyle(node).fontSize) : null;
    };
    const out = { header: at('.day-header'), tab: at('.tab'), body: at('body'),
        button: at('.day-actions button') };
    list.forEach(selector => { out[selector] = at(selector); });
    return out;
}, REBUILT);

// The sheet has to be open for its two nodes to exist at all, in the baseline as well as
// afterwards - comparing a null against a number is how a sampler reports success for a
// node it never found.
const withSheetOpen = async (page, work) => {
    await page.evaluate(async () => {
        openAssignSheet('w_01');
        await new Promise(done => setTimeout(done, 350));
    });
    const out = await work();
    await page.evaluate(async () => {
        if (typeof closeAssignSheet === 'function') closeAssignSheet();
        await new Promise(done => setTimeout(done, 250));
    });
    return out;
};

for (const width of WIDTHS) {
    const label = `${width}px at 200% text`;
    suite(label);

    const page = await open({ width, height: HEIGHTS[width] });
    const before = await withSheetOpen(page, () => sampleSizes(page));
    const touched = await doubleEveryFontSize(page);
    await page.waitForTimeout(300);

    // AFTER THE APP HAS REDRAWN ITSELF, which is the state every check below runs in.
    // Sampling here rather than at the moment of scaling is the whole repair: the previous
    // mechanism was at its most effective in the instant it was applied and had stopped
    // working by the first showView().
    await page.evaluate(async () => {
        for (const view of ['day', 'week', 'roster', 'reports']) {
            showView(view);
            await new Promise(done => setTimeout(done, 150));
        }
        showView('day');
        render();
        await new Promise(done => setTimeout(done, 150));
    });
    const after = await withSheetOpen(page, () => sampleSizes(page));

    // THE MECHANISM ITSELF, asserted first. Everything below is worthless if the text did
    // not actually grow, and that is exactly the state this suite was in - twice.
    const measured = Object.keys(before).filter(key => before[key] !== null);
    const grew = measured.filter(key =>
        after[key] !== null && after[key] >= before[key] * 2 - 0.5);
    check(`${label}: the text really is twice the size, measured`,
        touched.emitted > 1 && grew.length === measured.length,
        JSON.stringify({ touched, before, after }));
    // AND ON THE NODES THE APP REBUILT. Named separately, because those are the ones the
    // last two mechanisms lost and the guard could not see.
    const rebuilt = REBUILT.filter(selector =>
        before[selector] !== null && after[selector] !== null
        && after[selector] >= before[selector] * 2 - 0.5);
    check(`${label}: including every node the app rebuilt after the scaling`,
        rebuilt.length === REBUILT.length,
        JSON.stringify(REBUILT.map(selector =>
            [selector, before[selector], after[selector]])));

    const views = await page.evaluate(async () => {
        const out = {};
        for (const view of ['day', 'week', 'roster', 'reports']) {
            showView(view);
            await new Promise(done => setTimeout(done, 250));
            out[view] = {
                doc: document.documentElement.scrollWidth,
                inner: document.documentElement.clientWidth
            };
        }
        showView('day');
        return out;
    });
    Object.keys(views).forEach(view => {
        check(`${label}: the ${view} screen still fits across`,
            views[view].doc <= views[view].inner + 1, JSON.stringify(views[view]));
    });

    const date = await page.evaluate(() =>
        document.querySelector('.day-header').textContent.includes('12/08/2026'));
    check(`${label}: the date is still on the header`, date === true);

    // NOTHING ESSENTIAL DISAPPEARS. Text at twice the size that pushes a control out of
    // the layout, or clips a number to nothing, is the failure this is for - a screen
    // that fits across while having lost the button is not a screen that survived.
    const alive = await page.evaluate(() => {
        const shown = selector => {
            const node = document.querySelector(selector);
            if (!node) return null;
            const box = node.getBoundingClientRect();
            return box.width > 0 && box.height > 0 && getComputedStyle(node).visibility !== 'hidden';
        };
        return {
            tabs: [...document.querySelectorAll('.tab')].filter(node => {
                const box = node.getBoundingClientRect();
                return box.width > 0 && box.height > 0;
            }).length,
            dock: shown('.day-actions'),
            whatsapp: shown('.day-actions .btn-success'),
            settings: shown('#settingsBtn') !== false,
            rows: document.querySelectorAll('.worker-row, .wrow').length
        };
    });
    check(`${label}: every tab is still on the bar`, alive.tabs >= 4, JSON.stringify(alive));
    check(`${label}: the day's dock and its send button are still there`,
        alive.dock === true && alive.whatsapp === true, JSON.stringify(alive));
    check(`${label}: and the crew is still listed`, alive.rows > 0, JSON.stringify(alive));

    // The bottom bars still clear each other, which is what decides whether the last
    // worker in the list can be reached at all.
    const bars = await page.evaluate(() => {
        const dock = document.querySelector('.day-actions');
        // .tabs, not .tabbar - which exists nowhere in this repo, so `bars` was null at
        // every width and the check below it was vacuously true in all eight runs.
        const nav = document.querySelector('.tabs');
        if (!dock || !nav) return null;
        return {
            dock: Math.round(dock.getBoundingClientRect().bottom),
            nav: Math.round(nav.getBoundingClientRect().top),
            viewport: Math.round(window.innerHeight)
        };
    });
    check(`${label}: the dock still sits above the nav bar rather than under it`,
        bars === null || bars.dock <= bars.nav + 2, JSON.stringify(bars));

    // AND A SHEET, which is the control most likely to be pushed off a short screen.
    const sheet = await page.evaluate(async () => {
        openAssignSheet('w_01');
        await new Promise(done => setTimeout(done, 350));
        const content = document.querySelector('#assignSheet .sheet-content');
        const foot = document.querySelector('#assignSheet .sheet-foot');
        if (!content || !foot) return null;
        const box = content.getBoundingClientRect();
        const footBox = foot.getBoundingClientRect();
        return {
            shown: box.width > 0 && box.height > 0,
            footInside: footBox.bottom <= window.innerHeight + 2,
            height: Math.round(box.height),
            viewport: Math.round(window.innerHeight)
        };
    });
    check(`${label}: the assign sheet opens and its buttons are on the screen`,
        sheet !== null && sheet.shown && sheet.footInside, JSON.stringify(sheet));

    await page.context().close();
}

// ---------------------------------------------------------------- the other screens

for (const width of [320, 390]) {
    suite(`${width}px: the assignment sheet with a dozen sites`);

    const page = await open({ width, height: HEIGHTS[width] });
    await setInset(page, 34);
    await page.evaluate(() => openAssignSheet('w_01'));
    await page.waitForTimeout(350);

    const sheet = await page.evaluate(async () => {
        const content = document.querySelector('#assignSheet .sheet-content');
        const body = document.querySelector('#assignSheet .sheet-body');
        const head = document.querySelector('#assignSheet .sheet-head');
        const foot = document.querySelector('#assignSheet .sheet-foot');
        const read = () => ({
            head: Math.round(head.getBoundingClientRect().top),
            foot: Math.round(foot.getBoundingClientRect().bottom),
            name: head.textContent
        });
        const before = read();
        body.scrollTop = body.scrollHeight;
        await new Promise(done => setTimeout(done, 250));
        return {
            before,
            after: read(),
            inside: content.getBoundingClientRect().bottom <= window.innerHeight + 1,
            // The FOOT's box runs to the bottom edge on purpose - it is a bottom sheet -
            // and what has to clear the home indicator is what somebody presses. So the
            // buttons are measured, not the box they sit in.
            indicator: [...foot.querySelectorAll('button')]
                .every(node => node.getBoundingClientRect().bottom <= window.innerHeight - 34 + 1),
            across: document.documentElement.scrollWidth <= window.innerWidth + 1
        };
    });

    check(`${width}px: the sheet ends inside the screen`, sheet.inside === true,
        JSON.stringify(sheet));
    check(`${width}px: the name stays put while the sites scroll`,
        sheet.after.head === sheet.before.head, JSON.stringify(sheet));
    check(`${width}px: and so does the way out`,
        sheet.after.foot === sheet.before.foot, JSON.stringify(sheet));
    check(`${width}px: the sheet's foot clears the home indicator`,
        sheet.indicator === true, JSON.stringify(sheet));
    check(`${width}px: and it does not widen the page`, sheet.across === true,
        JSON.stringify(sheet));

    const small = await undersized(page);
    check(`${width}px: every control on the sheet is a finger's size`,
        small.length === 0, JSON.stringify(small).slice(0, 200));

    const faint = await unreadable(page);
    check('and nothing on it is too small to read', faint.length === 0,
        JSON.stringify(faint.slice(0, 4)));

    await page.context().close();
}

// ---------------------------------------------------------------- the keyboard

// Typing hours into שעות נוספות opens the keyboard over the bottom third of the screen,
// and neither dvh nor a fixed overlay shrinks for it - without the measured --kb-h the
// sheet's foot sits under the keys, visible and unpressable. Headless Chromium never
// opens a keyboard, so the height is handed to the same function the visualViewport
// listener feeds (js/ui/bars.js); everything downstream of that number is the code a
// phone runs.
for (const width of [320, 390]) {
    suite(`${width}px: the sheet with the keyboard up`);

    const page = await open({ width, height: HEIGHTS[width] });
    await setInset(page, 34);
    await page.evaluate(() => {
        State.commit(assignPlace(State.schedule, State.date, 'w_01', State.layer,
            'p_1', RATE_NORMAL));
        openAssignSheet('w_01');
    });
    await page.waitForTimeout(350);
    // The rate whose hours field is the one thing on this sheet a keyboard opens for.
    await page.locator('.sheet-rate-row').getByText('שעות נוספות').click();
    await page.waitForTimeout(250);

    const KB = 291;    // an iOS Hebrew keyboard with its accessory row, measured once
    const state = await page.evaluate(kb => {
        const hours = document.querySelector('.rate-hours');
        if (hours) hours.focus();
        applyKeyboardInset(kb);
        measureBottomBars();

        const visualBottom = window.innerHeight - kb;
        const buttons = [...document.querySelectorAll('#assignSheet .sheet-foot button')];
        const bars = ['.tabs', '.day-actions'].map(selector => {
            const node = document.querySelector(selector);
            return node ? getComputedStyle(node).display : 'gone';
        });
        const root = getComputedStyle(document.documentElement);
        return {
            buttons: buttons.length,
            lowest: Math.max(...buttons.map(node =>
                Math.round(node.getBoundingClientRect().bottom))),
            visualBottom,
            bars,
            navVar: root.getPropertyValue('--nav-h').trim(),
            kbVar: root.getPropertyValue('--kb-h').trim()
        };
    }, KB);

    check(`${width}px: the sheet's foot sits above the keyboard`,
        state.buttons > 0 && state.lowest <= state.visualBottom + 1, JSON.stringify(state));
    check(`${width}px: both bottom bars are gone from under it`,
        state.bars.every(display => display === 'none' || display === 'gone'),
        JSON.stringify(state.bars));
    check(`${width}px: hidden bars measure 0, so nothing reserves room for them`,
        state.navVar === '0px', state.navVar);
    check(`${width}px: the measured keyboard is published for the stylesheet`,
        state.kbVar === `${KB}px`, state.kbVar);

    // The keyboard closes; the same path puts everything back.
    const after = await page.evaluate(() => {
        applyKeyboardInset(0);
        measureBottomBars();
        return {
            tabs: getComputedStyle(document.querySelector('.tabs')).display,
            kbVar: getComputedStyle(document.documentElement)
                .getPropertyValue('--kb-h').trim()
        };
    });
    check(`${width}px: and everything comes back when it closes`,
        after.tabs !== 'none' && after.kbVar === '0px', JSON.stringify(after));

    await page.context().close();
}

for (const width of [320, 390]) {
    suite(`${width}px: הגדרות וכלים`);

    const page = await open({ width, height: HEIGHTS[width] });
    await page.click('#settingsBtn');
    await page.waitForTimeout(300);

    const panel = await page.evaluate(() => {
        const node = document.getElementById('settingsPanel');
        const box = node.getBoundingClientRect();
        return {
            open: node.classList.contains('open'),
            inside: box.left >= -1 && box.right <= window.innerWidth + 1,
            across: document.documentElement.scrollWidth <= window.innerWidth + 1,
            text: node.textContent.includes('גיבוי')
        };
    });
    check(`${width}px: it opens`, panel.open === true, JSON.stringify(panel));
    check(`${width}px: inside the screen`, panel.inside === true, JSON.stringify(panel));
    check(`${width}px: without widening the page`, panel.across === true, JSON.stringify(panel));
    check(`${width}px: with the backup on it`, panel.text === true);

    const small = await undersized(page);
    check(`${width}px: every control on it is a finger's size`,
        small.length === 0, JSON.stringify(small).slice(0, 200));

    const faint = await unreadable(page);
    check('and nothing on it is too small to read', faint.length === 0,
        JSON.stringify(faint.slice(0, 4)));

    // The ask dialog is where the permanent decisions are typed; its buttons must meet
    // the same floor as everything else.
    // Fire-and-forget: returning askConfirm's promise would make evaluate wait for a
    // click that never comes.
    await page.evaluate(() => { askConfirm({ title: 'בדיקה', message: 'בדיקה', ok: 'אישור' }); });
    await page.waitForTimeout(150);
    const askSmall = await undersized(page);
    check(`${width}px: every control on the ask dialog is a finger's size`,
      askSmall.length === 0, JSON.stringify(askSmall));
    await page.evaluate(() => askCancel());
    await page.waitForTimeout(100);

    await page.context().close();
}

for (const width of [320, 390]) {
    suite(`${width}px: the worker's own screen`);

    const page = await open({ width, height: HEIGHTS[width] });

    // The crew list with a man under the archive fold: the restore button is the one
    // control this wave adds to a row, and it is measured where it is tapped. The text
    // floor is not run against this view - the roster badges predate this suite and
    // carry their own size.
    await page.evaluate(() => {
        State.schedule.workers[29].active = false;
        State.commit(addAdvance(State.schedule, 'w_30', '2026-08-10', 200, ''));
        State.save({ silent: true });
        showView('roster');
        render();
        document.querySelector('#workerList .roster-archive').open = true;
    });
    await page.waitForTimeout(250);

    const restore = await page.evaluate(() => {
        const node = document.querySelector('.roster-archive .roster-restore');
        if (!node) return { found: false };
        const box = node.getBoundingClientRect();
        return { found: true, w: Math.round(box.width), h: Math.round(box.height) };
    });
    check(`${width}px: the restore on an archived row is a finger's size`,
        restore.found && restore.w >= 44 && restore.h >= 44, JSON.stringify(restore));

    const listSmall = await undersized(page);
    check(`${width}px: every control on the crew list is a finger's size`,
        listSmall.length === 0, JSON.stringify(listSmall).slice(0, 200));

    // The form itself, opened over the day view, with everything it can carry on
    // screen at once: the history block, the folded details opened, and the
    // shared-number hint raised by typing a number somebody already has.
    await page.evaluate(() => {
        showView('day');
        State.schedule.workers[1].phone = '052-884-1930';
        State.save({ silent: true });
        editWorker('w_01');
        document.getElementById('workerFormMore').open = true;
    });
    await page.fill('#workerFormPhone', '052-884-1930');
    await page.waitForTimeout(200);

    const form = await page.evaluate(() => {
        const hint = document.getElementById('workerFormPhoneHint');
        const history = document.getElementById('workerFormHistory');
        return {
            hint: hint.style.display !== 'none',
            hintPx: parseFloat(getComputedStyle(hint).fontSize),
            history: history.style.display !== 'none',
            phonePx: parseFloat(getComputedStyle(
                document.getElementById('workerFormPhone')).fontSize)
        };
    });
    check(`${width}px: the history block and the typed-number hint are both on screen`,
        form.hint && form.history, JSON.stringify(form));
    check(`${width}px: the phone field holds the 16px zoom threshold`,
        form.phonePx >= 16, JSON.stringify(form));

    const formSmall = await undersized(page);
    check(`${width}px: every control on the open form is a finger's size`,
        formSmall.length === 0, JSON.stringify(formSmall).slice(0, 200));

    const faint = await unreadable(page);
    check('and nothing on it is too small to read', faint.length === 0,
        JSON.stringify(faint.slice(0, 4)));

    await page.context().close();
}

for (const width of [320, 390]) {
    suite(`${width}px: reorder mode`);

    const page = await open({ width, height: HEIGHTS[width] });
    await page.evaluate(() => { showView('roster'); render(); });
    await page.waitForTimeout(250);
    await page.getByRole('button', { name: '↕ סדר מחדש' }).click();
    await page.waitForTimeout(300);

    const rows = await page.locator('#reorderList .reorder-row').count();
    check(`${width}px: the whole crew is in the draft`, rows === CREW, String(rows));

    const across = await page.evaluate(() => ({
        doc: document.documentElement.scrollWidth, inner: window.innerWidth
    }));
    check(`${width}px: it does not widen the page`, across.doc <= across.inner + 1,
        JSON.stringify(across));

    // The mode is a panel over the WHOLE screen now, the settings sheet's cut: the
    // sites panel and the tab bar are not half-visible invitations beside an unsaved
    // draft, and nothing pokes out past either edge.
    const cover = await page.evaluate(() => {
        const box = document.getElementById('reorderPanel').getBoundingClientRect();
        const tabs = document.querySelector('.tabs');
        const low = document.elementFromPoint(window.innerWidth / 2, window.innerHeight - 6);
        return {
            full: box.left <= 0 && box.top <= 0
                && box.right >= window.innerWidth - 0.5
                && box.bottom >= window.innerHeight - 0.5,
            overTabs: !tabs || !tabs.contains(low),
            across: document.documentElement.scrollWidth <= window.innerWidth + 1
        };
    });
    check(`${width}px: the panel covers the screen, tab bar included`,
        cover.full && cover.overTabs && cover.across, JSON.stringify(cover));

    // A crew of thirty is taller than any phone, so this mode is only usable if the list
    // scrolls. It did not: touch-action: none was set on the whole ROW, and in this mode
    // the rows are the screen - a finger anywhere on the list was a finger the browser had
    // been told not to pan with. Reported from a real iPhone, invisible to every
    // assertion here, and invisible to a mouse.
    const panning = await page.evaluate(() => {
        const blocked = node => {
            const value = getComputedStyle(node).touchAction;
            return value === 'none' || value === 'pan-x' || value === 'pinch-zoom';
        };
        const rows = [...document.querySelectorAll('#reorderList .reorder-row')];
        return {
            rows: rows.filter(blocked).length,
            handles: [...document.querySelectorAll('.reorder-handle')].filter(blocked).length,
            ancestors: (() => {
                let node = rows[0], n = 0;
                while (node && node !== document.documentElement) {
                    if (blocked(node) && !node.classList.contains('reorder-handle')) n += 1;
                    node = node.parentElement;
                }
                return n;
            })()
        };
    });
    check(`${width}px: a finger on the list can still scroll it`,
        panning.rows === 0 && panning.ancestors === 0, JSON.stringify(panning));
    check(`${width}px: and the handle still owns the drag`, panning.handles > 0,
        JSON.stringify(panning));

    // The list scrolls inside the panel now, between the fixed head and the fixed
    // foot - so the last man is reached by scrolling the panel's own box, and he must
    // land ABOVE the foot rather than behind it.
    const reach = await page.evaluate(async () => {
        const box = document.getElementById('reorderScroll');
        box.scrollTop = box.scrollHeight;
        await new Promise(done => setTimeout(done, 200));
        const last = [...document.querySelectorAll('#reorderList .reorder-row')].pop();
        const foot = document.querySelector('.reorder-foot');
        return {
            lastVisible: last.getBoundingClientRect().bottom <= foot.getBoundingClientRect().top + 1,
            footVisible: foot.getBoundingClientRect().bottom <= window.innerHeight + 1
        };
    });
    check(`${width}px: the last man and the save button can both be reached`,
        reach.lastVisible && reach.footVisible, JSON.stringify(reach));

    // The home indicator. The foot carries the same max(8px, safe-bottom) the tab bar
    // does, and what has to clear the strip is what somebody presses - the buttons are
    // measured, not the box they sit in.
    await setInset(page, 34);
    const indicator = await page.evaluate(() => ({
        buttons: [...document.querySelectorAll('.reorder-foot button')].length,
        clear: [...document.querySelectorAll('.reorder-foot button')]
            .every(node => node.getBoundingClientRect().bottom <= window.innerHeight - 34 + 1)
    }));
    check(`${width}px: the save buttons clear the home indicator`,
        indicator.buttons > 0 && indicator.clear, JSON.stringify(indicator));
    await setInset(page, 0);

    const small = await undersized(page);
    check(`${width}px: every move button is a finger's size`,
        small.length === 0, JSON.stringify(small).slice(0, 200));

    const faint = await unreadable(page);
    check('and nothing on it is too small to read', faint.length === 0,
        JSON.stringify(faint.slice(0, 4)));

    const name = await page.evaluate(() => {
        const first = document.querySelector('#reorderList .reorder-row .reorder-name');
        return {
            wrapped: first.getBoundingClientRect().height,
            text: first.textContent.trim().slice(0, 20)
        };
    });
    check(`${width}px: a name and its position fit on two lines, not five`,
        name.wrapped < 70, JSON.stringify(name));

    await page.context().close();
}

// ---------------------------------------------------------------- the other half of the day
//
// The fixture opened the by-WORKER list and nothing else, for a reason that was true as
// far as it went: the by-site view is a grid of cards and has no row per man, so the
// reachability questions this file was built around do not apply to it.
//
// The sizes do. Half the day screen - the view somebody uses to fix one site's evening -
// had never been rendered by a layout assertion at all, and the smallest target in the
// whole application was sitting in it: the ✕ that takes a man off a site, 31px wide,
// because the stylesheet sets a minimum HEIGHT on it and no minimum width. A 44px-tall
// button 31px wide passes a floor written in one dimension and fails a thumb.
//
// Undoable, all of it - every removal here goes through editWithUndo. The risk was never
// that the tap could not be taken back. It is that it is easy to make by accident, and a
// man of sixty-two holding a phone in one hand at the end of a day on a site should not
// have to aim.
for (const width of WIDTHS) {
    suite(`${width}px: the day, by site`);

    const page = await open({ width, height: HEIGHTS[width], mode: 'sites' });
    await setInset(page, 34);

    const cards = await page.evaluate(() =>
        document.querySelectorAll('.site-card, .chip-main, .chip-side').length);
    given('the by-site view actually drew its cards and chips', cards > 0);

    const small = await undersized(page);
    check('every control is at least a finger wide and tall', small.length === 0,
        JSON.stringify(small.slice(0, 5)));

    const faint = await unreadable(page);
    check('and nothing on it is too small to read', faint.length === 0,
        JSON.stringify(faint.slice(0, 5)));

    const wide = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        client: document.documentElement.clientWidth
    }));
    check('and the page does not run off the side',
        wide.scroll <= wide.client + 1, JSON.stringify(wide));

    // The one that removes something is the one to be surest about.
    const remove = await page.evaluate(() => {
        const node = [...document.querySelectorAll('.chip-side')]
            .find(item => item.textContent.trim() === '✕');
        if (!node) return null;
        const box = node.getBoundingClientRect();
        return { w: Math.round(box.width), h: Math.round(box.height) };
    });
    check('the button that takes a man off a site is there to be measured', Boolean(remove));
    if (remove) {
        // Deliberately MORE than the floor, and asserted at the number rather than at the
        // floor - the first version of this check asked for 44, which the general rule
        // already gives it, so removing the extra room changed nothing and nothing went
        // red. An intention no test can tell apart from its absence is not protected.
        //
        // It is the only control on this screen that takes something away, it sits beside
        // the one that opens the worker, and the two are told apart by aim.
        check('and the one that removes gets more room than the rest',
            remove.w >= 52 && remove.h >= 44, JSON.stringify(remove));
    }

    await page.context().close();
}

// ---------------------------------------------------------------- the week as a grid
//
// The third screen this matrix had never measured. It is visited below to check that the
// day dock stays behind on it, and that is all that has ever been asked of it - so the
// smallest text in the whole application lived here undisturbed: 9px dates in the header,
// a 10.5px label on the totals row, 11.5px totals under it.
//
// Seven columns of dates on a 320px phone genuinely cannot carry the same size as a
// heading, which is why the floor here is its own and lower. What it cannot be is unwritten.
for (const width of WIDTHS) {
    suite(`${width}px: the week`);

    const page = await open({ width, height: HEIGHTS[width] });
    await setInset(page, 34);
    await page.click('#tab-week');
    await page.waitForTimeout(400);

    const drawn = await page.evaluate(() => ({
        cells: document.querySelectorAll('.week-cell').length,
        filled: document.querySelectorAll('.cell-filled').length
    }));
    given('the week drew its grid, with somebody in it', drawn.cells > 0 && drawn.filled > 0);

    const faint = await unreadable(page);
    check('nothing in the grid is too small to read', faint.length === 0,
        JSON.stringify(faint.slice(0, 5)));

    // 48 x 48, at every width, with nothing exempted.
    //
    // Seven columns at 44px is 308px on its own and a 320px screen offers 296, so the week
    // and the names cannot BOTH be on screen at once on the smallest phone. That was read
    // for a long time as "then the cells are 32px there", and this check was written to
    // expect 32 - which is a test agreeing with the defect it exists to find. What does not
    // fit on the screen fits in a box that scrolls; the cells are the same size everywhere
    // and the week is reached by pushing it, with the names pinned so the row stays legible.
    //
    // THE PITCH IS 48, NOT 44. 44 is the floor every control in the app is held to and it
    // is still the floor here (`undersized`, below, asks for it with no exemption). The
    // week grid is asked for more because it is the one screen made of nothing but tap
    // targets, edge to edge, with no gap between them: a finger that lands 3px over on a
    // chip lands on padding, and on this grid it lands on the next man's day. The design
    // settled on 88px of names and seven 48px days - 424px, which is what a 430px phone
    // can show whole - and this check was written to 44 before that, which is how a 45px
    // column at 430 passed for a round. Pinned at the pitch, deliberately: a pitch a test
    // cannot tell from the floor is not protected.
    const cells = await page.evaluate(() => {
        const boxes = [...document.querySelectorAll('.week-cell')]
            .map(node => node.getBoundingClientRect());
        return { min: Math.round(Math.min(...boxes.map(b => b.width))),
            height: Math.round(Math.min(...boxes.map(b => b.height))) };
    });
    check(`a cell on a ${width}px screen is at the 48px pitch in both directions`,
        cells.min >= 48 && cells.height >= 48, JSON.stringify(cells));

    // Widths, not just a minimum: a pitch met by one column and missed by six would pass
    // the check above if the minimum were taken per-column. It is taken across every cell
    // in the grid, so this is the count that proves the whole week is tappable.
    const grid = await page.evaluate(() => {
        const boxes = [...document.querySelectorAll('.week-cell')]
            .map(node => node.getBoundingClientRect());
        return { total: boxes.length,
            ok: boxes.filter(b => b.width >= 48 && b.height >= 48).length };
    });
    check('and so is every other cell in the grid', grid.total > 0 && grid.ok === grid.total,
        JSON.stringify(grid));

    // WHERE THE WEEK FITS AND WHERE IT SCROLLS, pinned per width rather than left to the
    // arithmetic. 88 + 7 x 48 is 424: a 430px phone shows the whole week without a push,
    // and every narrower phone shows the names and as many days as it has room for, with
    // the rest one push away. The first half is the one that had no test - the box at 430
    // was 406px wide, 12px of page padding each side, and 424 does not go into 406; the
    // columns came out 45px because that is what 406 divides into, and nothing asked
    // whether the seven were the size the design said. Measured against the box's own
    // rectangle: a day whose right edge is past the box's is a day that is not on the
    // screen, whatever scrollWidth says.
    const fit = await page.evaluate(() => {
        const box = document.querySelector('#weekView .table-scroll');
        const edge = box.getBoundingClientRect();
        const row = document.querySelector('.week-table tbody tr');
        const days = [...row.querySelectorAll('.week-cell')].map(node => node.getBoundingClientRect());
        return {
            days: days.length,
            shown: days.filter(b => b.left >= edge.left - 0.5 && b.right <= edge.right + 0.5).length,
            boxClient: box.clientWidth,
            boxScroll: box.scrollWidth,
            screen: document.documentElement.clientWidth
        };
    });
    if (width >= 430) {
        check('a 430px phone shows all seven days at the pitch, with nothing to push',
            fit.days === 7 && fit.shown === 7 && fit.boxScroll <= fit.boxClient + 1,
            JSON.stringify(fit));
    } else {
        // Strictly wider than its box, not "at least": on these phones the week MUST
        // scroll, because the alternative is columns narrower than the pitch.
        check(`a ${width}px phone keeps the names and scrolls the days under them`,
            fit.days === 7 && fit.shown < 7 && fit.shown >= 4 && fit.boxScroll > fit.boxClient,
            JSON.stringify(fit));
    }

    // No exemption on this side either: .week-cell is in the helper's selector and no
    // longer filtered out of its answer.
    const small = await undersized(page);
    check('every control on the screen is big enough to tap', small.length === 0,
        JSON.stringify(small.slice(0, 4)));

    // Two adjacent cells in a row must not overlap, or a 44px target is 44px of somebody
    // else's day. Measured on the first body row, in the order the DOM has them.
    const overlap = await page.evaluate(() => {
        const row = document.querySelector('.week-table tbody tr');
        if (!row) return { rows: 0, bad: [] };
        const boxes = [...row.querySelectorAll('.week-cell')]
            .map(node => node.getBoundingClientRect());
        const bad = [];
        for (let i = 1; i < boxes.length; i += 1) {
            const a = boxes[i - 1], b = boxes[i];
            // RTL: the later cell sits to the LEFT of the earlier one, so the test is on
            // the gap between them whichever way round they are drawn.
            const gap = Math.min(a.left, b.left) + Math.min(a.width, b.width)
                <= Math.max(a.left, b.left) + 0.5;
            if (!gap) bad.push({ i, a: Math.round(a.left), b: Math.round(b.left) });
        }
        return { rows: boxes.length, bad };
    });
    check('and no two days in a row overlap each other',
        overlap.rows === 7 && overlap.bad.length === 0, JSON.stringify(overlap));

    // The RTL order, on the screen and in the DOM: the first day of the week is the
    // RIGHTMOST cell, because that is what "first" means in Hebrew. A grid that reads
    // left-to-right names the wrong day under every finger.
    const rtl = await page.evaluate(() => {
        const row = document.querySelector('.week-table tbody tr');
        const boxes = [...row.querySelectorAll('.week-cell')]
            .map(node => node.getBoundingClientRect().left);
        let descending = true;
        for (let i = 1; i < boxes.length; i += 1) if (boxes[i] >= boxes[i - 1]) descending = false;
        return { descending, first: Math.round(boxes[0]), last: Math.round(boxes[boxes.length - 1]) };
    });
    check('the first day of the week is the rightmost cell', rtl.descending, JSON.stringify(rtl));

    // The page does not scroll sideways - the box does. That distinction is the whole of
    // the fix: a page wider than the screen pushes the ⋯ and the nav bar off the edge.
    const wide = await page.evaluate(() => {
        const box = document.querySelector('#weekView .table-scroll');
        return {
            scroll: document.documentElement.scrollWidth,
            client: document.documentElement.clientWidth,
            bodyScroll: document.body.scrollWidth,
            boxScroll: box.scrollWidth,
            boxClient: box.clientWidth
        };
    });
    check('the page itself does not scroll sideways',
        wide.scroll <= wide.client + 1 && wide.bodyScroll <= wide.client + 1,
        JSON.stringify(wide));
    check('the week scrolls inside its own box instead',
        wide.boxScroll >= wide.boxClient, JSON.stringify(wide));

    // The names stay put while the days move under them. Pushed to the end of the strip,
    // the name column must still be at the reading edge of the box.
    const pinned = await page.evaluate(async () => {
        const box = document.querySelector('#weekView .table-scroll');
        const name = document.querySelector('.week-table tbody .name-cell');
        const before = name.getBoundingClientRect();
        box.scrollLeft = -box.scrollWidth;          // RTL scrolls negative in this engine
        box.scrollLeft = box.scrollLeft || box.scrollWidth;
        await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
        const after = name.getBoundingClientRect();
        const edge = box.getBoundingClientRect();
        return {
            moved: Math.round(Math.abs(after.left - before.left)),
            visible: after.right > edge.left + 1 && after.left < edge.right - 1,
            width: Math.round(after.width)
        };
    });
    check('the names stay pinned while the week scrolls under them',
        pinned.visible && pinned.width > 0, JSON.stringify(pinned));

    await page.context().close();
}

// ---------------------------------------------------------------- the pay card
//
// Below 700px each payroll row is a card, and the card leads with נותר לתשלום: the net
// first at the hero size, the four counts it is checked against on one labelled row
// under it. All of that is flex order over the same table cells, so what is asserted
// here is geometry - which box is highest - plus the one class the stylesheet needs.
for (const width of [320, 390]) {
    suite(`${width}px: the pay card leads with the net`);

    const page = await open({ width, height: HEIGHTS[width] });
    await page.evaluate(() => {
        // A double day and an advance, so every one of the four labelled counts is a
        // column the table actually grew.
        assignPlace(State.schedule, '2026-08-10', 'w_01', 'actual', 'p_1');
        assignPlace(State.schedule, '2026-08-11', 'w_01', 'actual', 'p_1', RATE_DOUBLE);
        State.commit(addAdvance(State.schedule, 'w_01', '2026-08-11', 100, ''));
        REPORT_RANGE.from = '2026-08-01';
        REPORT_RANGE.to = '2026-08-31';
        showView('reports');
        render();
    });
    await page.waitForTimeout(300);

    const card = await page.evaluate(() => {
        const tr = document.querySelector('.report-payroll tbody tr');
        const net = tr ? tr.querySelector('td.cell-net') : null;
        if (!net) return { present: false };
        const style = getComputedStyle(net);
        const metricTops = ['ימי נוכחות', 'ימי שכר', 'מתוכם כפולים', 'מקדמות']
            .map(label => tr.querySelector(`td[data-label="${label}"]`))
            .filter(Boolean)
            .map(node => Math.round(node.getBoundingClientRect().top));
        return {
            present: true,
            netTop: Math.round(net.getBoundingClientRect().top),
            otherTops: [...tr.querySelectorAll('td')].filter(td => td !== net)
                .map(td => Math.round(td.getBoundingClientRect().top)),
            size: style.fontSize,
            weight: style.fontWeight,
            label: getComputedStyle(net, '::before').content,
            metricTops,
            across: document.documentElement.scrollWidth <= window.innerWidth + 1
        };
    });

    check(`${width}px: the net cell carries the class the stylesheet leads with`,
        card.present === true, JSON.stringify(card));
    check(`${width}px: and it is the first thing on the card`,
        card.present && card.otherTops.every(top => card.netTop < top),
        JSON.stringify({ net: card.netTop, others: card.otherTops }));
    check(`${width}px: at the hero size the ramp names`,
        card.size === '36px' && Number(card.weight) >= 800,
        JSON.stringify({ size: card.size, weight: card.weight }));
    check(`${width}px: under the card's own name for the number`,
        String(card.label).includes('נותר לתשלום'), JSON.stringify(card.label));
    check(`${width}px: the four counts share one labelled row beneath it`,
        card.metricTops.length === 4 && new Set(card.metricTops).size === 1,
        JSON.stringify(card.metricTops));
    check(`${width}px: and the card does not widen the page`,
        card.across === true);

    await page.context().close();
}

{
    suite('above the card breakpoint the pay sheet is still a table');

    // The print suite depends on the table staying a table, and an A4 page is about
    // 794px wide - so at desktop width the same DOM must lay out as rows and columns.
    const page = await open({ width: 900, height: 800, touch: false });
    await page.evaluate(() => {
        assignPlace(State.schedule, '2026-08-10', 'w_01', 'actual', 'p_1');
        State.commit(addAdvance(State.schedule, 'w_01', '2026-08-11', 100, ''));
        REPORT_RANGE.from = '2026-08-01';
        REPORT_RANGE.to = '2026-08-31';
        showView('reports');
        render();
    });
    await page.waitForTimeout(300);

    const table = await page.evaluate(() => ({
        row: getComputedStyle(document.querySelector('.report-payroll tbody tr')).display,
        head: getComputedStyle(document.querySelector('.report-payroll thead')).display,
        net: document.querySelectorAll('.report-payroll tbody td.cell-net').length
    }));
    check('a row is a table row again', table.row === 'table-row', table.row);
    check('the headings are back over the columns', table.head !== 'none', table.head);
    check('and the class rides along doing nothing', table.net > 0, String(table.net));

    await page.context().close();
}

// ---------------------------------------------------------------- the dock

for (const width of [320, 390]) {
    suite(`${width}px: the day dock belongs to the day`);

    const page = await open({ width, height: HEIGHTS[width] });
    await setInset(page, 34);

    for (const view of ['day', 'week', 'roster', 'reports']) {
        const dock = await page.evaluate(async name => {
            showView(name);
            await new Promise(done => setTimeout(done, 250));
            const node = document.querySelector('.day-actions');
            const style = getComputedStyle(node);
            const box = node.getBoundingClientRect();
            return {
                shown: style.display !== 'none' && box.height > 0,
                height: Math.round(box.height),
                navVar: getComputedStyle(document.documentElement)
                    .getPropertyValue('--day-actions-h').trim()
            };
        }, view);

        if (view === 'day') {
            check(`${width}px: the dock is on the day screen`, dock.shown === true,
                JSON.stringify(dock));
            check(`${width}px: and it is one measured 64px dock`, dock.height >= 64,
                JSON.stringify(dock));
        } else {
            check(`${width}px: the dock is gone on the ${view} screen`, dock.shown === false,
                JSON.stringify(dock));
            check(`${width}px: and the page stops reserving room for it on ${view}`,
                dock.navVar === '0px', JSON.stringify(dock));
        }
    }

    await page.context().close();
}

// ---------------------------------------------------------------- the folded bulk row
//
// The bulk chips were 268px of convenience on a 320px screen - the third-largest thing
// on it - and the price was the screen's whole point: at 320×667 the first worker's
// name started BELOW the dock, so an evening began with a scroll past a shortcut. On a
// phone the chips now fold behind one 44px disclosure row; this suite is the receipt.
{
    suite('320×667: the folded bulk row buys the list back');

    const page = await open({ width: 320, height: 667 });

    // The account banner is the one block above the header that follows the real
    // clock, not the seeded day - dismiss it the way a person would, so the numbers
    // below measure the day chrome and nothing else.
    await page.evaluate(async () => {
        const banner = document.getElementById('accountBanner');
        const dismiss = banner && [...banner.querySelectorAll('button')]
            .find(b => b.textContent === '✕');
        if (dismiss) dismiss.click();
        window.scrollTo(0, 0);
        await new Promise(done => setTimeout(done, 200));
    });

    // Asked before anything is measured. Without it, a build where the fold is missing
    // does not FAIL this suite - it throws out of page.evaluate on a null, stopping the
    // run and naming neither the control nor the reason. A test that crashes instead of
    // failing is the one kind that teaches nobody anything.
    given('the day screen has a bulk row with a disclosure control on it',
        await page.evaluate(() => Boolean(document.querySelector('.bulk-toggle')
            && document.querySelector('.bulk-chip'))));

    const folded = await page.evaluate(() => {
        const box = sel => {
            const node = document.querySelector(sel);
            if (!node) return null;
            const b = node.getBoundingClientRect();
            return { top: Math.round(b.top), bottom: Math.round(b.bottom), h: Math.round(b.height), w: Math.round(b.width) };
        };
        return {
            row: box('.bulk-row'),
            toggle: box('.bulk-toggle'),
            firstRow: box('.wrow'),
            dock: box('.day-actions'),
            chipShown: document.querySelector('.bulk-chip').offsetParent !== null,
            expanded: document.querySelector('.bulk-toggle').getAttribute('aria-expanded'),
            // The button is a glyph and a number; its full name is what a screen reader
            // gets, and what this reads.
            label: document.querySelector('.bulk-toggle').getAttribute('aria-label')
        };
    });
    check('the folded control is still a finger target, both ways',
        folded.toggle.h >= 44 && folded.toggle.w >= 44, JSON.stringify(folded.toggle));
    // v93: the control moved onto the switcher row, so the folded row is not on the page
    // at all - the 44px it used to cost went to the list.
    check('and the folded row itself costs the list nothing', folded.row.h === 0,
        JSON.stringify(folded.row));
    check('it says what it is holding, and how many',
        folded.label.includes('פעולות מרוכזות') && folded.label.includes(String(CREW - 8)),
        folded.label);
    check('the chips are folded away, and say so to a screen reader',
        folded.chipShown === false && folded.expanded === 'false', JSON.stringify(folded));
    // The point of the whole exercise: a worker's name, whole, above the dock,
    // before anybody scrolls.
    check('the first worker row now fits above the dock unscrolled',
        folded.firstRow.bottom <= folded.dock.top,
        `first row ${JSON.stringify(folded.firstRow)} vs dock ${JSON.stringify(folded.dock)}`);

    // One tap opens it, and everything that was always there is there.
    await page.locator('.bulk-toggle').click();
    await page.waitForTimeout(150);
    const open1 = await page.evaluate(() => ({
        chipShown: document.querySelector('.bulk-chip').offsetParent !== null,
        expanded: document.querySelector('.bulk-toggle').getAttribute('aria-expanded'),
        label: document.querySelector('.bulk-label').textContent,
        chips: document.querySelectorAll('.bulk-row .bulk-chip').length
    }));
    check('one tap unfolds the chips',
        open1.chipShown === true && open1.expanded === 'true', JSON.stringify(open1));
    check('with the exact row that was always there',
        open1.label === `כל ה-${CREW - 8} שנותרו ב:` && open1.chips === 12,
        JSON.stringify(open1));

    // And the choice is a session posture: a re-render keeps it, a second tap ends it.
    await page.evaluate(async () => {
        render();
        await new Promise(done => setTimeout(done, 200));
    });
    check('a re-render remembers the open state', await page.evaluate(() =>
        document.querySelector('.bulk-chip').offsetParent !== null));
    await page.locator('.bulk-toggle').click();
    await page.waitForTimeout(150);
    check('and a second tap folds it back', await page.evaluate(() =>
        document.querySelector('.bulk-chip').offsetParent === null &&
        document.querySelector('.bulk-toggle').getAttribute('aria-expanded') === 'false'));

    await page.context().close();
}


// ---------------------------------------------------------------- a name that ate the week
//
// The 44x44 floor holds for an ordinary roster. Reproduced with a real one:
//
//   viewport 320   scroll box 296   name column 305   day cells visible 0 of 7
//   375 / 390 / 430                                            2 / 2 / 3 of 7
//
// with a name a crew on this site actually has. The week table is laid out `auto` so the
// day columns can hold their floor, and auto layout sizes a column to its widest content
// - so one long name took the pinned first column wider than the box it lives in, and the
// grid had nothing left to show. overflow and text-overflow on the cell do not help:
// they clip what is drawn, after the column has been made wide enough not to clip.
//
// Both scripts, because this crew writes in both.
const LONG_NAMES = [
    ['Hebrew', 'מוחמד עבד אל רחמן מחאמיד שם ארוך מאוד'],
    ['Arabic', 'محمد عبد الرحمن محاميد اسم طويل جدا']
];

for (const [script, longName] of LONG_NAMES) {
    for (const width of WIDTHS) {
        suite(`${width}px: the week with a very long ${script} name`);

        const page = await open({ width, height: HEIGHTS[width] });
        await setInset(page, 34);
        await page.evaluate(name => {
            State.schedule.workers[0].name = name;
            State.schedule.workers[1].name = name + ' 2';
            State.save();
        }, longName);
        await page.click('#tab-week');
        await page.waitForTimeout(400);

        const box = await page.evaluate(() => {
            const wrap = document.querySelector('#weekView .table-scroll');
            const edge = wrap.getBoundingClientRect();
            const nameCell = document.querySelector('.week-table tbody .name-cell');
            const cells = [...document.querySelectorAll('.week-table tbody tr:first-child .week-cell')];
            // A day cell is VISIBLE when the whole of it is inside the box - a 44px target
            // half under the pinned names is not a target.
            const visible = cells.filter(cell => {
                const at = cell.getBoundingClientRect();
                return at.width >= 44 && at.height >= 44
                    && at.left >= edge.left - 0.5 && at.right <= edge.right + 0.5;
            });
            return {
                boxWidth: Math.round(edge.width),
                nameWidth: Math.round(nameCell.getBoundingClientRect().width),
                cells: cells.length,
                visible: visible.length,
                narrowest: Math.round(Math.min(...cells.map(c => c.getBoundingClientRect().width))),
                title: nameCell.querySelector('.name-clip').getAttribute('title'),
                label: nameCell.getAttribute('aria-label'),
                page: document.documentElement.scrollWidth,
                client: document.documentElement.clientWidth
            };
        });

        check(`${width}px: the name column does not take the whole box`,
            box.nameWidth < box.boxWidth / 2, JSON.stringify(box));
        check(`${width}px: at least one whole day is on the screen before any scrolling`,
            box.visible >= 1, JSON.stringify(box));
        check(`${width}px: and every day is still a 44px target`,
            box.narrowest >= 44 && box.cells === 7, JSON.stringify(box));
        check(`${width}px: the page itself still does not scroll sideways`,
            box.page <= box.client + 1, JSON.stringify(box));
        check(`${width}px: the whole name is still there for a reader`,
            box.title === longName && box.label === longName,
            JSON.stringify({ title: box.title, label: box.label }));

        // AND SCROLLING REACHES ALL SEVEN. A day that cannot be reached at all is a day
        // that is not in the week, however wide its cell is.
        const reached = await page.evaluate(async () => {
            const wrap = document.querySelector('#weekView .table-scroll');
            const cells = [...document.querySelectorAll('.week-table tbody tr:first-child .week-cell')];
            const seen = new Set();
            const look = () => {
                const edge = wrap.getBoundingClientRect();
                cells.forEach((cell, at) => {
                    const rect = cell.getBoundingClientRect();
                    if (rect.left >= edge.left - 0.5 && rect.right <= edge.right + 0.5) seen.add(at);
                });
            };
            look();
            // RTL scrolls negative in this engine; push to both ends and look on the way.
            for (const to of [-wrap.scrollWidth, wrap.scrollWidth, 0]) {
                wrap.scrollLeft = to;
                await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
                look();
            }
            return { seen: seen.size, of: cells.length };
        });
        check(`${width}px: scrolling reaches every one of the seven days`,
            reached.seen === reached.of, JSON.stringify(reached));

        // The name still belongs to its row, which is the whole reason the column is
        // pinned in the first place.
        const rowed = await page.evaluate(() => {
            const row = document.querySelector('.week-table tbody tr');
            const nameCell = row.querySelector('.name-cell');
            const dayCell = row.querySelector('.week-cell');
            const a = nameCell.getBoundingClientRect();
            const b = dayCell.getBoundingClientRect();
            return { sameRow: Math.abs(a.top - b.top) < 2, parent: nameCell.parentElement === row };
        });
        check(`${width}px: the name is still on the same row as its days`,
            rowed.sameRow && rowed.parent, JSON.stringify(rowed));

        await page.context().close();
    }
}

// ------------------------------------------------- long names, big text, every width
//
// This block used to set document.documentElement.style.fontSize = '32px' and call it
// doubled text. Measured: root 16 -> 32, body 17 -> 17, .name-cell 14 -> 14, .week-cell
// 13 -> 13, scrollWidth 320 -> 320. Three green lines about a screen at its ordinary size.
// It now uses the same cascade rewrite as the block above, which is the only mechanism in
// this file that survives a rerender.
//
// The names are the two scripts this crew is actually named in, at the length a real one
// reaches: Hebrew with a triple patronymic, and Arabic with the definite article and a
// nisba. Both are read right-to-left and both are long enough to take the whole width of a
// phone on their own, which is the point - the sticky name column is what decides whether
// any day is reachable at all.
for (const width of WIDTHS) {
    for (const [script, naming] of [
        ['Hebrew', at => 'מוחמד עבד אל רחמן מחאמיד ' + (at + 1)],
        ['Arabic', at => 'عبد الرحمن محمد الأحمدي الشمالي ' + (at + 1)]
    ]) {
        const label = `${width}px, a long ${script} name at 200% text`;
        suite(label);

        const page = await open({ width, height: HEIGHTS[width] });
        await setInset(page, 34);
        await page.evaluate(source => {
            const name = eval(`(${source})`);
            State.schedule.workers.forEach((worker, at) => { worker.name = name(at); });
            State.save();
            render();
        }, naming.toString());
        await doubleEveryFontSize(page);
        await page.waitForTimeout(200);

        // THE WEEK GRID, which is where the name column and the days compete.
        await page.click('#tab-week');
        await page.waitForTimeout(400);

        const grid = await page.evaluate(() => {
            const wrap = document.querySelector('#weekView .table-scroll');
            const row = document.querySelector('.week-table tbody tr:first-child');
            const cells = [...row.querySelectorAll('.week-cell')];
            const nameOf = row.querySelector('.name-cell') || row.firstElementChild;
            // THE STRIP THE DAYS ACTUALLY GET, which is the box MINUS the pinned name
            // column. Measuring against the box counted a cell scrolled underneath the
            // sticky name as being on the screen - it is behind it, and nobody can read
            // it there.
            const strip = () => {
                const at = wrap.getBoundingClientRect();
                const name = nameOf ? nameOf.getBoundingClientRect() : null;
                if (!name || name.width === 0) return { left: at.left, right: at.right };
                // The name column sits at the reading edge. In RTL that is the right.
                return name.left >= (at.left + at.right) / 2
                    ? { left: at.left, right: name.left }
                    : { left: name.right, right: at.right };
            };
            const wholeIn = (cell, edge) => {
                const at = cell.getBoundingClientRect();
                return at.width >= 44 && at.height >= 44
                    && at.left >= edge.left - 0.5 && at.right <= edge.right + 0.5;
            };
            const visible = cells.filter(cell => wholeIn(cell, strip()));
            // Every day reachable by scrolling the box sideways, which is what the design
            // trades the width for.
            //
            // MEASURED BY WHERE THE CELL ENDS UP, not by how wide it is. This used to set
            // scrollLeft and then count cells whose width was at least 44 - a fact about
            // the stylesheet, true at every scroll position and true whether the box
            // scrolled or not. A grid pinned solid would have reported all seven
            // reachable. And it pushed one way only: this engine scrolls RTL negative, so
            // `scrollLeft = scrollWidth` moved nothing at all.
            //
            // Swept, not sampled at the two ends. A finger stops wherever it likes, so a
            // day that is whole only at some offset in the middle IS reachable - and the
            // suite has to visit the middle to say so.
            const seen = new Set();
            const look = () => {
                const edge = strip();
                cells.forEach((cell, index) => { if (wholeIn(cell, edge)) seen.add(index); });
            };
            const span = wrap.scrollWidth - wrap.clientWidth;
            const steps = 24;
            for (let step = 0; step <= steps; step += 1) {
                const to = Math.round((span * step) / steps);
                wrap.scrollLeft = -to;    // RTL scrolls negative in this engine
                look();
                wrap.scrollLeft = to;     // and positive in engines that do not
                look();
            }
            wrap.scrollLeft = 0;
            look();
            const reachable = { length: seen.size };
            const nameCell = row.querySelector('.name-cell') || row.firstElementChild;
            const clip = nameCell ? nameCell.querySelector('.name-clip') : null;
            return {
                rows: document.querySelectorAll('.week-table tbody tr').length,
                days: cells.length,
                visible: visible.length,
                reachable: reachable.length,
                nameWidth: nameCell ? Math.round(nameCell.getBoundingClientRect().width) : null,
                clipped: clip ? getComputedStyle(clip).textOverflow : null,
                titled: clip ? String(clip.getAttribute('title') || '').length > 0 : false,
                labelled: nameCell
                    ? String(nameCell.getAttribute('aria-label')
                        || (nameCell.textContent || '')).length > 0 : false,
                page: document.documentElement.scrollWidth,
                client: document.documentElement.clientWidth,
                size: parseFloat(getComputedStyle(
                    document.querySelector('.week-cell') || document.body).fontSize)
            };
        });

        check(`${label}: the whole crew is still drawn`, grid.rows === CREW,
            JSON.stringify(grid));
        check(`${label}: the text really is doubled here too`, grid.size >= 24,
            `${grid.size}px`);
        // A WHOLE 44x44 DAY, before anything is scrolled. Below that the column has taken
        // the screen and the grid is a name list.
        check(`${label}: a full day cell is on the screen before any scrolling`,
            grid.visible >= 1, JSON.stringify(grid));
        check(`${label}: and all seven days can be reached by scrolling`,
            grid.reachable === grid.days && grid.days === 7,
            JSON.stringify(grid));
        check(`${label}: the name column is bounded rather than taking the width`,
            grid.nameWidth !== null && grid.nameWidth <= Math.round(width * 0.45),
            `${grid.nameWidth}px of ${width}px`);
        check(`${label}: the name is clipped rather than wrapped away`,
            grid.clipped === 'ellipsis', String(grid.clipped));
        check(`${label}: and the whole name is still available to a reader`,
            grid.titled === true && grid.labelled === true, JSON.stringify(grid));
        check(`${label}: the page still does not scroll sideways`,
            grid.page <= grid.client + 1, JSON.stringify(grid));

        // THE DAY SCREEN, the sheet, and the last worker in the list - the three places a
        // control gets pushed off a short screen at this size.
        const day = await page.evaluate(async () => {
            showView('day');
            await new Promise(done => setTimeout(done, 250));
            const rows = [...document.querySelectorAll('.wrow')];
            const last = rows[rows.length - 1];
            const dock = document.querySelector('.day-actions');
            const nav = document.querySelector('.tabs');
            // SCROLLED TO THE END FIRST. The last man in a crew of thirty is far below the
            // fold at the top of the list, so asking where he is before scrolling asks
            // about a row nobody has reached yet.
            window.scrollTo(0, document.documentElement.scrollHeight);
            await new Promise(done => setTimeout(done, 150));
            const box = last ? last.getBoundingClientRect() : null;
            return {
                rows: rows.length,
                lastReachable: Boolean(box) && box.height >= 44,
                // CLEAR OF THE DOCK, which is what the question was. As written it read
                // `box.top < dock.top + box.height` - satisfied by a row whose whole
                // height is UNDER the dock - and then nothing asserted it, so the day
                // screen's one bar-collision fact was computed at four widths, in both
                // orientations, and thrown away.
                lastAbove: Boolean(box) && Boolean(dock)
                    && box.bottom <= dock.getBoundingClientRect().top + 1,
                dockTop: Boolean(dock) ? Math.round(dock.getBoundingClientRect().top) : null,
                lastBottom: box ? Math.round(box.bottom) : null,
                dockAboveNav: Boolean(dock) && Boolean(nav)
                    && dock.getBoundingClientRect().bottom
                        <= nav.getBoundingClientRect().top + 2,
                tabs: [...document.querySelectorAll('.tab')].filter(node =>
                    node.getBoundingClientRect().width >= 44).length
            };
        });
        check(`${label}: every worker has a row and the last one is a real target`,
            day.rows === CREW && day.lastReachable === true, JSON.stringify(day));
        check(`${label}: and the last row clears the dock rather than sitting under it`,
            day.lastAbove === true, JSON.stringify(day));
        check(`${label}: the dock still clears the nav bar`,
            day.dockAboveNav === true, JSON.stringify(day));
        check(`${label}: and every tab is still tappable`, day.tabs >= 4,
            JSON.stringify(day));

        // A KEYBOARD-SIZED VIEWPORT, which is what a phone actually gives the sheet.
        const sheet = await page.evaluate(async () => {
            openAssignSheet(State.schedule.workers[State.schedule.workers.length - 1].id);
            await new Promise(done => setTimeout(done, 350));
            const content = document.querySelector('#assignSheet .sheet-content');
            const foot = document.querySelector('#assignSheet .sheet-foot');
            if (!content || !foot) return null;
            const buttons = [...document.querySelectorAll('#assignSheet button')]
                .filter(node => {
                    const box = node.getBoundingClientRect();
                    return box.width > 0 && box.height > 0;
                });
            return {
                shown: content.getBoundingClientRect().height > 0,
                footInside: foot.getBoundingClientRect().bottom <= window.innerHeight + 2,
                buttons: buttons.length,
                smallest: buttons.length
                    ? Math.round(Math.min(...buttons.map(node =>
                        Math.min(node.getBoundingClientRect().width,
                            node.getBoundingClientRect().height))))
                    : 0,
                size: parseFloat(getComputedStyle(
                    document.querySelector('#assignSheet .sheet-body button')
                    || document.body).fontSize)
            };
        });
        check(`${label}: the sheet opens for the last worker with its buttons on screen`,
            sheet !== null && sheet.shown && sheet.footInside, JSON.stringify(sheet));
        check(`${label}: the sheet's own text is doubled too`,
            sheet !== null && sheet.size >= 24, JSON.stringify(sheet));
        // 44px IN EITHER DIMENSION, iron law 9, at twice the text size - which is where a
        // button is likeliest to be squeezed. The number was measured here from the
        // beginning and never asked about.
        check(`${label}: and no button in it has been squeezed below 44px`,
            sheet !== null && sheet.buttons > 0 && sheet.smallest >= 44,
            JSON.stringify(sheet));

        // The keyboard takes the bottom half. The foot has to stay reachable.
        await page.setViewportSize({ width, height: Math.round(HEIGHTS[width] * 0.55) });
        await page.waitForTimeout(300);
        const keyboard = await page.evaluate(() => {
            const foot = document.querySelector('#assignSheet .sheet-foot');
            const sheetNode = document.querySelector('#assignSheet');
            if (!foot || !sheetNode) return null;
            return {
                open: sheetNode.getBoundingClientRect().height > 0,
                reachable: foot.getBoundingClientRect().top < window.innerHeight,
                page: document.documentElement.scrollWidth,
                client: document.documentElement.clientWidth
            };
        });
        check(`${label}: with the keyboard up the sheet's foot is still reachable`,
            keyboard !== null && keyboard.open && keyboard.reachable,
            JSON.stringify(keyboard));
        check(`${label}: and nothing has started scrolling sideways`,
            keyboard !== null && keyboard.page <= keyboard.client + 1,
            JSON.stringify(keyboard));

        await page.context().close();
    }
}

await browser.close();
server.close();
report();
