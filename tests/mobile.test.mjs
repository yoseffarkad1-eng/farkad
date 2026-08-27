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

async function open({ width, height, scheme = 'light', touch = true }) {
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

    await page.evaluate(count => {
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
        // By worker, which is the list this suite is about: the by-site view is a grid of
        // sites and has no row per man to reach the bottom of.
        if (typeof setDayMode === 'function') setDayMode('workers');
        render();
    }, CREW);
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
            const across = await page.evaluate(() => ({
                doc: document.documentElement.scrollWidth,
                inner: window.innerWidth
            }));
            check(`${label}: the page does not scroll sideways`,
                across.doc <= across.inner + 1, JSON.stringify(across));

            const small = await undersized(page);
            check(`${label}: everything a finger lands on is a finger's size`,
                small.length === 0, JSON.stringify(small).slice(0, 200));

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
        doc: document.documentElement.scrollWidth, inner: window.innerWidth
    }));
    check(`${label}: the page does not scroll sideways`,
        across.doc <= across.inner + 1, JSON.stringify(across));

    const small = await undersized(page);
    check(`${label}: everything a finger lands on is a finger's size`,
        small.length === 0, JSON.stringify(small).slice(0, 200));

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
                inner: window.innerWidth
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

    const small = await undersized(page);
    check(`${width}px: every move button is a finger's size`,
        small.length === 0, JSON.stringify(small).slice(0, 200));

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
