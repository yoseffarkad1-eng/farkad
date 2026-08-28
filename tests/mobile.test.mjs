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
// viewport. That is the right tool for layout arithmetic and it is NOT an iPhone: Safari's
// dynamic toolbars, its rubber-band scrolling and its own idea of a safe area are not
// emulated here, and nothing in this file should be read as coverage of a real device.

import { serve } from './serve.mjs';
import { suite, check, given, report } from './runner.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const EXEC = process.env.CHROME_PATH || undefined;

const server = process.env.SMOKE_URL
    ? { url: process.env.SMOKE_URL, close: () => {} }
    : await serve(new URL('..', import.meta.url).pathname);
const BASE = server.url;
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
// narrowest phone, so a column is 42px rather than 44 - full height, and a mis-tap opens
// the wrong day's picker, which names the day before anything is recorded.
async function undersized(page) {
    return page.evaluate(() => {
        const out = [];
        document.querySelectorAll('button, [role="button"], a[href], input, select, textarea, .week-cell')
            .forEach(node => {
                if (node.offsetParent === null) return;
                if (node.getAttribute('aria-hidden') === 'true') return;
                const box = node.getBoundingClientRect();
                if (box.width === 0 || box.height === 0) return;
                const floor = node.classList.contains('week-cell') ? 40 : 44;
                if (box.width >= floor && box.height >= 44) return;
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

    await page.context().close();
}

// ---------------------------------------------------------------- text at 200%

for (const width of WIDTHS) {
    const label = `${width}px at 200% text`;
    suite(label);

    const page = await open({ width, height: HEIGHTS[width] });
    await page.evaluate(() => { document.documentElement.style.fontSize = '32px'; });
    await page.waitForTimeout(300);

    const views = await page.evaluate(async () => {
        const out = {};
        for (const view of ['day', 'week', 'roster', 'reports']) {
            showView(view);
            await new Promise(done => setTimeout(done, 200));
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
    suite(`${width}px: reorder mode`);

    const page = await open({ width, height: HEIGHTS[width] });
    await page.evaluate(() => { showView('roster'); render(); });
    await page.waitForTimeout(250);
    await page.getByRole('button', { name: '↕ סדר מחדש' }).click();
    await page.waitForTimeout(300);

    const rows = await page.locator('#workerList .reorder-row').count();
    check(`${width}px: the whole crew is in the draft`, rows === CREW, String(rows));

    const across = await page.evaluate(() => ({
        doc: document.documentElement.scrollWidth, inner: window.innerWidth
    }));
    check(`${width}px: it does not widen the page`, across.doc <= across.inner + 1,
        JSON.stringify(across));

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
        const rows = [...document.querySelectorAll('#workerList .reorder-row')];
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

    const reach = await page.evaluate(async () => {
        window.scrollTo(0, document.documentElement.scrollHeight);
        await new Promise(done => setTimeout(done, 200));
        const last = [...document.querySelectorAll('#workerList .reorder-row')].pop();
        const foot = document.querySelector('.reorder-foot');
        return {
            lastVisible: last.getBoundingClientRect().bottom <= window.innerHeight + 1,
            footVisible: !foot || foot.getBoundingClientRect().bottom <= window.innerHeight + 1
        };
    });
    check(`${width}px: the last man and the save button can both be reached`,
        reach.lastVisible && reach.footVisible, JSON.stringify(reach));

    const small = await undersized(page);
    check(`${width}px: every move button is a finger's size`,
        small.length === 0, JSON.stringify(small).slice(0, 200));

    const faint = await unreadable(page);
    check('and nothing on it is too small to read', faint.length === 0,
        JSON.stringify(faint.slice(0, 4)));

    const name = await page.evaluate(() => {
        const first = document.querySelector('#workerList .reorder-row .reorder-name');
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

    // What a cell can actually be, rather than a floor that cannot be met.
    //
    // Seven columns at 44px is 308px on its own, and a 320px screen offers 296 once the
    // page's own padding is out - so on the smallest phone this app runs on, a week with a
    // column of names beside it CANNOT have thumb-sized cells. The app's answer is to show
    // the whole week anyway, because a screen that shows Thursday is not a week; the cell
    // is a shortcut to that day and the day screen has its own arrows and picker. A cell
    // hit by mistake opens a day and changes nothing.
    //
    // So the assertion is the truth at each width: from 375 up a cell is a target, at 320
    // it is a thing to read, and either way nothing may be narrower than the grid it is in.
    const cells = await page.evaluate(() => {
        const boxes = [...document.querySelectorAll('.week-cell')]
            .map(node => node.getBoundingClientRect());
        return { min: Math.round(Math.min(...boxes.map(b => b.width))),
            height: Math.round(Math.min(...boxes.map(b => b.height))) };
    });
    // The arithmetic, per width, measured rather than assumed: the name column is 70px and
    // whatever the page's padding leaves is divided by seven. 320 gives 32, 375 and 390
    // give about 42, and only 430 clears 44. Two pixels could be taken from the names to
    // buy the middle sizes their 44th - and are not: on this screen the name is what a
    // person is looking for, the cell is a shortcut to a day, and a cell hit by mistake
    // opens a day and changes nothing.
    const floor = width >= 430 ? 44 : (width >= 375 ? 40 : 30);
    check(`a cell on a ${width}px screen is at least ${floor}px across`,
        cells.min >= floor && cells.height >= 44, JSON.stringify({ ...cells, floor }));

    const small = await undersized(page);
    check('every OTHER control on the screen is big enough to tap',
        small.filter(item => !item.cls.includes('week-cell')).length === 0,
        JSON.stringify(small.filter(item => !item.cls.includes('week-cell')).slice(0, 4)));

    const wide = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        client: document.documentElement.clientWidth,
        table: Math.round(document.querySelector('.week-table').getBoundingClientRect().width)
    }));
    check('and seven days plus the names fit across the phone',
        wide.scroll <= wide.client + 1, JSON.stringify(wide));

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

await browser.close();
server.close();
report();
