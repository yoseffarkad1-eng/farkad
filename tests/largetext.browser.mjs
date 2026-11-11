// «תצוגה גדולה» - the large display (v191) - in a real Chromium, on every screen.
//
//   node tests/largetext.browser.mjs
//
// The owner, 2026-11-11: one of the three people who use this is 62 and far-sighted. The
// mode is a switch in ⋯, per phone (js/ui/display.js), and every rule of it is in
// css/large.css under one class. What is held here is what that man would otherwise find
// out by not being able to read something, and what the other two would find out by their
// screens having moved:
//
//   WITH THE MODE ON, on both phones (375x667, 440x956) and in both schemes, on EVERY
//   screen and dialog in tests/screens.mjs - the same list tests/readability.audit.mjs
//   walks - measured on every visible text node, drawn word and field:
//     - nothing under 18px, no field under 18px;
//     - nothing lighter than 500;
//     - no text that runs to a second line set tighter than 1.4;
//     - every text at 7:1 or better against the ground really painted under it (a
//       disabled control is the one thing allowed to step back, and still holds 3:1);
//     - everything a finger lands on 52px in both dimensions;
//     - the page exactly as wide as the phone, nothing off the side that cannot be
//       scrolled to inside its own container, nothing cut;
//     - the bars MEASURED: the page's room for the tab bar and the dock is their real
//       height, and the last row of the day comes clear of the dock;
//   and the things that matter are larger than the floor: a name, a sum, a button's words.
//
//   WITH THE MODE OFF, the app is what it was: every screen measured twice - once as
//   served, once with css/large.css answered by an empty file - and the two readings are
//   the same, node for node; and a pinned sample of v189's own sizes still reads as pinned.
//   And the app's OWN floors hold for everybody on every screen, in both schemes: every
//   text at 4.5:1, every target 44px both ways, every field 16px (three screens were under
//   them before v191 and are repaired in css/design.css).
//
//   THE SWITCH: a row of «כללי» straight before «הסעות», shut; its words; on and off without a reload, the
//   bars measured again each time; a reload keeps it, and the class is on <html> before
//   the first screen is drawn; the one key it writes, and nothing else on the disk moved.
//
//   WITH THE PHONE'S OWN LARGE TEXT ON TOP (the cascade doubled, as tests/mobile.test.mjs
//   does it): the five main screens still do not scroll sideways.
//
//   PAPER AND THE PICTURE: the week laid out for print with the mode on is, box for box, the
//   week without it; the shared picture of the week, of both reports and of the rides'
//   summary is the same PNG, byte for byte, with the mode on and off.
//
// LARGETEXT_SHOTS=<dir> also writes the JPEG pairs (440x956, dark, mode off / on).
// Chromium with emulated touch. NOT a real phone, and nobody far-sighted has looked at it.
import { chromium } from 'playwright';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { serve } from './serve.mjs';
import { launchLocalBrowser } from './network-guard.mjs';
import { verifyServedAssets, expectedShaFor } from './treecheck.mjs';
import { suite, check, same, given, report } from './runner.mjs';
import { PHONES, SCHEMES, LARGE_KEY, SCREENS, openApp, walk, measure, sampleInPage } from './screens.mjs';
import { censusOnly } from './census.mjs';

const root = new URL('..', import.meta.url).pathname;
const server = await serve(root);
const served = await verifyServedAssets(server.url, root, expectedShaFor(root));
check('the origin served this commit, byte for byte', served.ok,
    `${served.checked} assets; ${(served.wrong || []).slice(0, 3).join(' | ')}`);
const browser = await launchLocalBrowser(chromium, { executablePath: process.env.CHROME_PATH });
const SHOTS = process.env.LARGETEXT_SHOTS || '';
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

// THE PINNED WORDS (tests/largetext.test.mjs pins them against js/ui/display.js itself).
const TITLE = 'תצוגה גדולה';
const SUB = 'אותיות וכפתורים גדולים יותר';
const LEAD = 'מגדיל את האותיות, המספרים והכפתורים בכל המסכים. פועל במכשיר הזה בלבד.';
const TURN_ON = 'הפעלת תצוגה גדולה במכשיר הזה';
const TURN_OFF = 'כיבוי תצוגה גדולה במכשיר הזה';
const IS_ON = 'מופעל במכשיר הזה';
const IS_OFF = 'כבוי';

const brief = (rows, say) => rows.slice(0, 6).map(say).join(' | ') + (rows.length > 6 ? ` … +${rows.length - 6}` : '');
const text = t => `${t.size}px w${t.weight} ${t.contrast}:1 «${t.words}» ${t.where}`;

// A DAY OF THE MONTH on the worker's card and the site's card: the one exception to 52 both
// ways (css/large.css says why). Held to exactly what it is instead: a share of the card,
// never under the app's own 44, and 62 and taller - and never over its neighbour.
const CAL_DAY = /\b(wcard|scard)-cal-day\b/;

// A dialog opens with its title on the glass (v191's review: the migration's questions
// opened at 320 with only «החלטה» of theirs showing, the dialog scrolled down to its first
// button). Asked of every .modal of the walk, as it was opened.
const titleOnGlass = (page, scope) => page.evaluate(selectors => {
    const root = document.querySelector(selectors[0]);
    if (!root || !root.classList.contains('modal')) return null;
    const content = root.querySelector('.modal-content');
    const title = content && content.querySelector('h2, h3');
    if (!title || !title.getClientRects().length) return null;
    const t = title.getBoundingClientRect();
    const c = content.getBoundingClientRect();
    const top = Math.max(c.top, 0);
    const bottom = Math.min(c.bottom, window.innerHeight);
    return { ok: t.top >= top - 1 && t.bottom <= bottom + 1, title: [Math.round(t.top), Math.round(t.bottom)],
        box: [Math.round(top), Math.round(bottom)], scrollTop: Math.round(content.scrollTop) };
}, scope);

// A FLOOR NEVER LOWERS (v191's review): with the class toggled off and on again in place,
// every control's min-height and min-width is at least what the sheets give it without
// the mode - the `!important` floor of 52 had taken the message box from 120 to 52, a day
// of the month from 62, the crew's buttons from 64 wide.
const floorsNeverLower = page => page.evaluate(() => {
    const root = document.documentElement;
    const nodes = [...document.querySelectorAll('button, summary, select, input, textarea, a, label')]
        .filter(node => node.getClientRects().length > 0);
    const read = () => nodes.map(node => { const cs = getComputedStyle(node); return [parseFloat(cs.minHeight) || 0, parseFloat(cs.minWidth) || 0]; });
    const on = read();
    root.classList.remove('display-large');
    const off = read();
    root.classList.add('display-large');
    const name = node => node.tagName.toLowerCase() + (node.id ? '#' + node.id : '')
        + (typeof node.className === 'string' && node.className.trim() ? '.' + node.className.trim().split(/\s+/).join('.') : '');
    const lowered = [];
    nodes.forEach((node, i) => {
        if (on[i][0] + 0.5 < off[i][0]) lowered.push(`min-height ${off[i][0]} -> ${on[i][0]} ${name(node)}`);
        if (on[i][1] + 0.5 < off[i][1]) lowered.push(`min-width ${off[i][1]} -> ${on[i][1]} ${name(node)}`);
    });
    return [...new Set(lowered)];
});

// The screens whose pictures are asked for, by the name they are saved under.
const PICTURES = { 'day - by worker': 'day', 'rides - the cars and the tray': 'rides', 'reports - by worker': 'reports',
    'advances - list': 'advances', 'settings - every row open': 'settings', 'journey 1 - the day with its row': 'journey' };

// ============================================================ the mode ON: every screen
for (const [width, height] of PHONES) {
    for (const scheme of SCHEMES) {
        const label = `${width}x${height} ${scheme}`;
        const { context, page, errors } = await openApp(browser, server.url, { width, height, scheme, large: true });
        suite(`${label}, large display ON: every screen`);
        given('the class is on <html>', await page.evaluate(() => document.documentElement.classList.contains('display-large')));
        let walked = 0;
        await walk(page, async (screen, failed) => {
            walked += 1;
            const name = `${label}: ${screen.name}`;
            if (failed) { check(`${name} opened`, false, failed); return; }
            const read = await measure(page, screen.scope);
            const live = read.texts.filter(t => !t.off);
            given(`${name}: there is something on it to measure`, read.texts.length > 0, String(read.texts.length));
            const small = live.filter(t => t.size < 18);
            check(`${name}: no text under 18px`, small.length === 0, brief(small, text));
            const thin = live.filter(t => t.weight < 500);
            check(`${name}: no text lighter than 500`, thin.length === 0, brief(thin, text));
            const tight = live.filter(t => t.lines > 1 && t.lineHeight !== null && t.lineHeight < 1.4);
            check(`${name}: no wrapped text tighter than 1.4`, tight.length === 0, brief(tight, t => `${t.lineHeight} ${text(t)}`));
            const weak = live.filter(t => t.contrast !== null && t.contrast < 7);
            check(`${name}: every text at 7:1 or better`, weak.length === 0, brief(weak, t => `${t.ink} on ${t.ground} ${text(t)}`));
            const gone = read.texts.filter(t => t.off && t.contrast !== null && t.contrast < 3);
            check(`${name}: a disabled control still holds 3:1`, gone.length === 0, brief(gone, text));
            const fields = read.texts.filter(t => t.kind === 'field' && t.size < 18);
            check(`${name}: no field under 18px`, fields.length === 0, brief(fields, text));
            const fingers = read.targets.filter(t => !CAL_DAY.test(t.where) && (t.w < 51.5 || t.h < 51.5));
            check(`${name}: every target 52px both ways`, fingers.length === 0, brief(fingers, t => `${t.w}x${t.h} «${t.words}» ${t.where}`));
            const days = read.targets.filter(t => CAL_DAY.test(t.where) && (t.w < 43.5 || t.h < 61.5));
            check(`${name}: a day of the month: its share of the card, 44px wide and 62 tall at the least`, days.length === 0,
                brief(days, t => `${t.w}x${t.h} «${t.words}» ${t.where}`));
            check(`${name}: no two controls lie over each other`, read.overlaps.length === 0,
                brief(read.overlaps, o => `${o.by} «${o.words}» ${o.where}`));
            check(`${name}: no control's words run past its edge`, read.spills.length === 0,
                brief(read.spills, o => `${o.by} «${o.words}» ${o.where}`));
            const lowered = await floorsNeverLower(page);
            check(`${name}: no control is smaller with the mode than without it (a floor never lowers)`, lowered.length === 0, lowered.slice(0, 4).join(' | '));
            const title = await titleOnGlass(page, screen.scope);
            if (title) check(`${name}: the dialog opens with its title on the glass`, title.ok, JSON.stringify(title));
            same(`${name}: the page is as wide as the phone`, read.page.scrollWidth, width);
            check(`${name}: nothing off the side`, read.offside.length === 0, brief(read.offside, o => `${o.left}..${o.right} ${o.where}`));
            check(`${name}: nothing cut`, read.cut.length === 0, brief(read.cut, c => `${c.by} «${c.words}» ${c.where}`));
            check(`${name}: nothing out of reach - what is past the edge of a dialog or a panel scrolls inside it`,
                read.unreachable.length === 0, brief(read.unreachable, u => `${u.top}..${u.bottom} «${u.words}» ${u.where}`));
            if (SHOTS && width === 440 && scheme === 'dark' && PICTURES[screen.name]) {
                await page.screenshot({ path: join(SHOTS, `${PICTURES[screen.name]}-on.jpg`), type: 'jpeg', quality: 80 });
            }
        });
        same(`${label}: every screen of the list was walked`, walked, SCREENS.length);

        suite(`${label}, large display ON: the bars are measured, and what matters is larger than the floor`);
        const bars = await page.evaluate(async () => {
            State.date = todayStr(); showView('day'); setDayMode('workers');
            await new Promise(done => setTimeout(done, 350));
            const px = name => parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name));
            const tabs = document.querySelector('.tabs').getBoundingClientRect();
            const dock = document.querySelector('.day-actions').getBoundingClientRect();
            window.scrollTo(0, document.documentElement.scrollHeight);
            await new Promise(done => setTimeout(done, 350));
            const rows = [...document.querySelectorAll('#dayView .wrow')];
            const last = rows[rows.length - 1].getBoundingClientRect();
            const dockNow = document.querySelector('.day-actions').getBoundingClientRect();
            const foot = document.querySelector('.daycheck-entry');
            const footBox = foot ? foot.getBoundingClientRect() : last;
            window.scrollTo(0, 0);
            await new Promise(done => setTimeout(done, 250));
            const head = document.querySelector('.day-header').getBoundingClientRect();
            const first = rows[0].getBoundingClientRect();
            return { nav: px('--nav-h'), tabs: tabs.height, dockVar: px('--day-actions-h'), dock: dock.height,
                lastBottom: Math.max(last.bottom, footBox.bottom), dockTop: dockNow.top, headBottom: head.bottom, firstTop: first.top,
                tabsBottom: tabs.bottom, height: window.innerHeight, rowsOnGlass: rows.filter(r => {
                    const b = r.getBoundingClientRect(); return b.top >= head.bottom - 1 && b.bottom <= dockNow.top + 1; }).length };
        });
        check(`${label}: --nav-h is the tab bar's real height`, Math.abs(bars.nav - bars.tabs) <= 1, `${bars.nav} / ${bars.tabs}`);
        check(`${label}: --day-actions-h is the dock's real height`, Math.abs(bars.dockVar - bars.dock) <= 1, `${bars.dockVar} / ${bars.dock}`);
        check(`${label}: the tab bar ends on the glass`, bars.tabsBottom <= bars.height + 1, `${bars.tabsBottom} / ${bars.height}`);
        check(`${label}: scrolled to its end, the day's last row and the check under it clear the dock`,
            bars.lastBottom <= bars.dockTop + 1, `${bars.lastBottom} / dock at ${bars.dockTop}`);
        check(`${label}: at the top, the first row starts under the day's header`, bars.firstTop >= bars.headBottom - 1,
            `${bars.firstTop} / header ends ${bars.headBottom}`);
        // Three whole rows on the 375 and 440 phones; on the 320x568 one, two (three with the
        // mode off: the price of the mode, paid on the smallest phone - v191's review found
        // ONE there, the day's count on a line of its own under the steps).
        const rows = width <= 320 ? 2 : 3;
        check(`${label}: and there is still a day to read between them - at least ${rows} whole rows`, bars.rowsOnGlass >= rows, String(bars.rowsOnGlass));

        // THE SEDER'S FIRST STATION (v191's review): the journey's row stands in the day's
        // own dock. At 320x568 the dock lay 29px over the day's header, the count «נרשמו …
        // מתוך …» was cut in half and nothing of the day was on the glass. Held at the top
        // of the station: the header and the dock do not meet, the count is whole between
        // them, and the day starts on the glass - and from 375 up its first site and that
        // site's first man are both whole.
        const station = await page.evaluate(async () => {
            State.date = todayStr(); showView('day'); setDayMode('sites');
            // At its first station: the walk left a journey at its fifth, and the entry
            // brings him back to where he left it.
            journeyStart();
            journeyGo(1);
            window.scrollTo(0, 0);
            await new Promise(done => setTimeout(done, 450));
            window.scrollTo(0, 0);
            await new Promise(done => setTimeout(done, 250));
            const head = document.querySelector('.day-header').getBoundingClientRect();
            const dock = document.querySelector('.day-actions').getBoundingClientRect();
            const count = document.querySelector('.day-header .now-count').getBoundingClientRect();
            const whole = node => { const b = node.getBoundingClientRect(); return b.top >= head.bottom - 1 && b.bottom <= dock.top + 1; };
            const site = document.querySelector('#dayView .site-card');
            const head1 = site && site.querySelector('.site-head');
            const man = site && site.querySelector('.assign-row');
            const out = { head: [Math.round(head.top), Math.round(head.bottom)], dock: [Math.round(dock.top), Math.round(dock.bottom)],
                count: [Math.round(count.top), Math.round(count.bottom)], inJourney: document.body.classList.contains('journey-day'),
                started: head1 ? head1.getBoundingClientRect().top >= head.bottom - 1 && head1.getBoundingClientRect().top < dock.top - 24 : false,
                site: head1 ? whole(head1) : false, man: man ? whole(man) : false };
            journeyLeave();
            State.date = todayStr(); showView('day'); setDayMode('workers');
            await new Promise(done => setTimeout(done, 200));
            return out;
        });
        given(`${label}: the station is open`, station.inJourney, JSON.stringify(station));
        check(`${label}: the seder's first station: the header and the dock do not meet`, station.head[1] <= station.dock[0] + 1, JSON.stringify(station));
        check(`${label}: and the day's count is whole above the dock`, station.count[1] <= station.dock[0] + 1 && station.count[0] >= 0, JSON.stringify(station));
        check(`${label}: and the day starts on the glass between them`, station.started, JSON.stringify(station));
        if (width > 320) check(`${label}: and its first site and that site's first man are both whole`, station.site && station.man, JSON.stringify(station));

        // The other four screens: scrolled to its end, the last words of each stand clear of
        // the tab bar - the page's room for the bar is the bar's measured height.
        const ends = await page.evaluate(async () => {
            const out = {};
            for (const view of ['week', 'roster', 'advances', 'reports']) {
                if (view === 'advances') showWorkerAdvances(null); else showView(view);
                await new Promise(done => setTimeout(done, 300));
                window.scrollTo(0, document.documentElement.scrollHeight);
                await new Promise(done => setTimeout(done, 250));
                const tabs = document.querySelector('.tabs').getBoundingClientRect();
                const section = document.getElementById(view + 'View');
                const range = document.createRange();
                const walker = document.createTreeWalker(section, NodeFilter.SHOW_TEXT);
                let deepest = 0;
                for (let node = walker.nextNode(); node; node = walker.nextNode()) {
                    if (!node.nodeValue.trim() || !node.parentElement.checkVisibility({ checkVisibilityCSS: true })) continue;
                    range.selectNodeContents(node);
                    const rect = range.getBoundingClientRect();
                    if (rect.width > 0 && rect.height > 0) deepest = Math.max(deepest, rect.bottom);
                }
                out[view] = [Math.round(deepest), Math.round(tabs.top), Math.abs(parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--nav-h')) - tabs.height) <= 1];
                window.scrollTo(0, 0);
            }
            showView('day');
            await new Promise(done => setTimeout(done, 250));
            return out;
        });
        for (const view of Object.keys(ends)) {
            check(`${label}: ${view}: scrolled to its end, its last words clear the tab bar, and the bar is measured`,
                ends[view][0] > 0 && ends[view][0] <= ends[view][1] + 1 && ends[view][2], JSON.stringify(ends[view]));
        }

        const sizes = await page.evaluate(async () => {
            const size = sel => { const n = document.querySelector(sel); return n ? parseFloat(getComputedStyle(n).fontSize) : null; };
            const weight = sel => { const n = document.querySelector(sel); return n ? Number(getComputedStyle(n).fontWeight) : null; };
            const out = { name: size('#dayView .wrow-name'), dock: size('.day-actions .btn-success'), tab: size('.tab') };
            showWorkerAdvances(null);
            await new Promise(done => setTimeout(done, 250));
            out.debtName = size('.advance-worker-card strong');
            out.debt = size('.advance-worker-card:not(.advance-worker-zero) span');
            out.debtWeight = weight('.advance-worker-card:not(.advance-worker-zero) span');
            REPORT_SECTION = 'workers'; REPORT_CARD_GRID = true; showView('reports');
            await new Promise(done => setTimeout(done, 250));
            out.pay = size('.report-tile-value');
            out.payWeight = weight('.report-tile-value');
            out.payName = size('.report-tile-name');
            showView('day');
            return out;
        });
        check(`${label}: a man's name on the day is 22px or more`, sizes.name >= 22, String(sizes.name));
        check(`${label}: the dock's button and a tab's word are 20px / 18px or more`, sizes.dock >= 20 && sizes.tab >= 18, `${sizes.dock} ${sizes.tab}`);
        check(`${label}: a debt is larger than the name beside it, and heavy`, sizes.debt > sizes.debtName && sizes.debtWeight >= 700,
            JSON.stringify(sizes));
        check(`${label}: the pay on a tile is the largest thing on it, and heavy`, sizes.pay > sizes.payName && sizes.payWeight >= 700,
            JSON.stringify(sizes));
        // An absent man's cell on the week is the dash alone (v191's review: a copy of the
        // cell's own size beat app.css's `font-size: 0`, and every one read «—נעדר»).
        const absent = await page.evaluate(async () => {
            State.date = todayStr(); showView('week'); setWeekPhoneMode('grid');
            await new Promise(done => setTimeout(done, 300));
            const cells = [...document.querySelectorAll('#weekView td.cell-absent')];
            const out = { cells: cells.length, sizes: [...new Set(cells.map(cell => getComputedStyle(cell).fontSize))],
                dash: cells.length ? parseFloat(getComputedStyle(cells[0], '::before').fontSize) : null };
            showView('day');
            await new Promise(done => setTimeout(done, 200));
            return out;
        });
        given(`${label}: the week has absent men`, absent.cells > 0, JSON.stringify(absent));
        same(`${label}: an absent man's cell hides its word, as without the mode`, absent.sizes, ['0px']);
        check(`${label}: and its dash is 18px`, absent.dash >= 18, JSON.stringify(absent));
        check(`${label}: nothing threw`, errors.length === 0, errors.slice(0, 3).join(' | '));
        await context.close();
    }
}

// ============================================================ the mode OFF: the app as it was
//
// Two readings of every screen with the mode off: the tree as served, and the same tree
// with css/large.css answered by an EMPTY stylesheet (answered, not refused: a sheet that
// fails to load raises the boot banner, which is a different page). If any rule of that
// file reached a phone without the class, the two readings would differ.
//
// And on the reading as served, THE APP'S OWN FLOORS, for everybody: every text at 4.5:1
// (the palette's own floor; a disabled control steps back and is not held to it), every
// target 44px both ways and every field 16px (law 9). v191 found three screens under them
// - the chosen day of «ימים» at 2.2:1 in the dark scheme, the undo bar's ✕ at 1.6:1 dark and
// 1.9:1 light, «עוד פרטים» 39px tall on the wide phone - and repaired them in
// css/design.css; this is the check that would have caught each, on every screen of the walk.
const appFloors = (read, name) => {
    const live = read.texts.filter(t => !t.off);
    const faint = live.filter(t => t.contrast !== null && t.contrast < 4.5);
    check(`${name}: every text at 4.5:1 or better (the palette's own floor)`, faint.length === 0,
        brief(faint, t => `${t.ink} on ${t.ground} ${text(t)}`));
    const fingers = read.targets.filter(t => t.w < 43.5 || t.h < 43.5);
    check(`${name}: every target 44px both ways (law 9)`, fingers.length === 0, brief(fingers, t => `${t.w}x${t.h} «${t.words}» ${t.where}`));
    const fields = read.texts.filter(t => t.kind === 'field' && t.size < 16);
    check(`${name}: no field under 16px (law 9)`, fields.length === 0, brief(fields, text));
};
{
    const fingerprint = read => JSON.stringify({
        texts: read.texts.map(t => [t.words, t.where, t.size, t.weight, t.lineHeight, t.ink, t.ground, t.lines]),
        targets: read.targets.map(t => [t.where, t.w, t.h]), width: read.page.scrollWidth });
    for (const [width, height] of PHONES) {
        suite(`${width}x${height}, large display OFF: css/large.css changes nothing`);
        const readings = [];
        for (const empty of [false, true]) {
            const { context, page, errors } = await openApp(browser, server.url, { width, height, scheme: 'dark', large: false,
                before: empty ? async ctx => ctx.route('**/css/large.css', route =>
                    route.fulfill({ status: 200, contentType: 'text/css', body: '/* the large display, taken away */' })) : null });
            given(`the class is not on <html>${empty ? ' (empty sheet)' : ''}`,
                await page.evaluate(() => !document.documentElement.classList.contains('display-large')));
            if (empty) given('and the sheet really was taken away', await page.evaluate(() =>
                [...document.styleSheets].some(sheet => /large\.css/.test(sheet.href || '') && sheet.cssRules.length === 0)));
            const seen = {};
            await walk(page, async (screen, failed) => {
                const read = failed ? null : await measure(page, screen.scope);
                seen[screen.name] = failed ? `NOT OPENED: ${failed}` : fingerprint(read);
                if (!empty && read) appFloors(read, `${width}x${height} dark, mode off: ${screen.name}`);
                if (!empty && SHOTS && width === 440 && PICTURES[screen.name]) {
                    await page.screenshot({ path: join(SHOTS, `${PICTURES[screen.name]}-off.jpg`), type: 'jpeg', quality: 80 });
                }
            });
            readings.push(seen);
            check(`nothing threw${empty ? ' (empty sheet)' : ''}`, errors.length === 0, errors.slice(0, 3).join(' | '));
            await context.close();
        }
        for (const screen of SCREENS) {
            given(`${screen.name}: opened in both readings`, !/^NOT OPENED/.test(readings[0][screen.name]) && !/^NOT OPENED/.test(readings[1][screen.name]),
                readings[0][screen.name].slice(0, 80));
            const a = JSON.parse(/^NOT/.test(readings[0][screen.name]) ? '{"texts":[],"targets":[]}' : readings[0][screen.name]);
            const b = JSON.parse(/^NOT/.test(readings[1][screen.name]) ? '{"texts":[],"targets":[]}' : readings[1][screen.name]);
            const moved = a.texts.filter((t, i) => JSON.stringify(t) !== JSON.stringify(b.texts[i])).slice(0, 3);
            check(`${width}: ${screen.name}: every text node is the size, weight, colour and place it is without the sheet`,
                readings[0][screen.name] === readings[1][screen.name], `${a.texts.length}/${b.texts.length} texts; ${JSON.stringify(moved)}`);
        }
    }

}

// The same floors in the light scheme, where the undo bar's ✕ was 1.9:1.
for (const [width, height] of PHONES) {
    suite(`${width}x${height} light, large display OFF: the app's own floors on every screen`);
    const { context, page, errors } = await openApp(browser, server.url, { width, height, scheme: 'light', large: false });
    let walked = 0;
    await walk(page, async (screen, failed) => {
        walked += 1;
        if (failed) { check(`${width} light: ${screen.name} opened`, false, failed); return; }
        appFloors(await measure(page, screen.scope), `${width}x${height} light, mode off: ${screen.name}`);
    });
    same(`${width} light: every screen of the list was walked`, walked, SCREENS.length);
    check(`${width} light: nothing threw`, errors.length === 0, errors.slice(0, 3).join(' | '));
    await context.close();
}

// THE BASE'S OWN NUMBERS: v189's, read off the tree of commit 0790d3f (git archive) on
// 2026-11-11 by sampleInPage (tests/screens.mjs), and written out, so that a later change
// which moves one for everybody fails against a number a person can read: `size/weight` of
// the words, and the height of a row and a bar, at 440x956. Every one of them was also
// v186's (9846d7f) but the reports' card, which v189 rebuilt to tell the account (a man's
// name 19/750 then, his «נותר לתשלום» 30/800, a label 16/400).
const BASE = { body: '18/400', tab: '15/700', wrowName: '19/700', wrowTag: '16/650', wrow: 56, dayLabel: '20/800', dayDate: '14/400',
    dock: '14/800', tabs: 63, topbar: 52, siteName: '18/700', assignName: '20/700', rima: '15/600', rimaInput: '16/400',
    weekName: '14/700', weekCell: 48, weekLetter: '13px', rosterName: '19/750', rosterMeta: '16/400',
    advanceName: '19/500', advanceSum: '20/800', advanceRow: 58,
    tileName: '21/800', tileValue: '32/800', tileLabel: '16/600', seat: '16/700', seatEmpty: '15/700', chip: '16/700', seatBox: 66,
    settingsRow: 60, settingsTitle: '17/700', settingsHint: '14/400' };
{
    suite('440x956 dark, large display OFF: a pinned sample of v189\'s own sizes');
    const { context, page } = await openApp(browser, server.url, { width: 440, height: 956, scheme: 'dark', large: false });
    same('they are what v189 drew', await page.evaluate(sampleInPage), BASE);
    await context.close();

    suite('440x956 dark, large display ON: the same sample, and every one of them larger');
    const on = await openApp(browser, server.url, { width: 440, height: 956, scheme: 'dark', large: true });
    const large = await on.page.evaluate(sampleInPage);
    const num = value => typeof value === 'number' ? value : parseFloat(value);
    const notLarger = Object.keys(BASE).filter(key => !(num(large[key]) > num(BASE[key])));
    same('no size, row or bar of the sample stayed as it was or shrank', notLarger, []);
    const lighter = Object.keys(BASE).filter(key => typeof BASE[key] === 'string' && BASE[key].includes('/')
        && Number(String(large[key]).split('/')[1]) < Number(BASE[key].split('/')[1]));
    same('and no weight went down', lighter, []);
    await on.context.close();
}

// ============================================================ the switch
{
    suite('the switch: a row of «כללי», straight before «הסעות», shut, in the words of its neighbour');
    const { context, page, errors } = await openApp(browser, server.url, { width: 440, height: 956, scheme: 'dark', large: false,
        before: ctx => ctx.addInitScript(() => {
            // Is the class there when the FIRST screen is drawn? Asked of the document itself,
            // at the moment the day's section first gets a child. The whole document is watched
            // from before it is parsed: a watcher put on the section once it exists can be put
            // there after the parser has already run the scripts that fill it, and then it
            // hears nothing (it did, once, on a busy machine).
            window.__firstDraw = [];
            new MutationObserver((list, observer) => {
                if (!list.some(change => change.target && change.target.id === 'dayView' && change.addedNodes.length)) return;
                window.__firstDraw.push(document.documentElement.classList.contains('display-large'));
                observer.disconnect();
            }).observe(document, { childList: true, subtree: true });
            // And every FRAME, from the first the browser runs: is the class there in each
            // one in which the tab bar already exists? A frame is what gets painted, and the
            // tab bar and the top bar are in the page's own markup - v191's review saw them
            // painted small for a frame, the scripts at the end of <body> not yet run.
            window.__frames = [];
            const frame = () => {
                if (document.querySelector('.tabs')) window.__frames.push(document.documentElement.classList.contains('display-large'));
                if (window.__frames.length < 4) requestAnimationFrame(frame);
            };
            requestAnimationFrame(frame);
        }) });
    // Every key but the mode's own - and the service worker's census of open builds, by
    // name (tests/census.mjs says why; censusOnly below holds that it is the only other).
    const disk = () => page.evaluate(key => {
        const out = {};
        Object.keys(localStorage).sort().filter(name => name !== 'farkad:openBuilds')
            .forEach(name => { if (name !== key) out[name] = localStorage.getItem(name); });
        return JSON.stringify(out);
    }, LARGE_KEY);
    await page.evaluate(() => { showView('day'); openSettings(); });
    await page.waitForTimeout(300);
    const row = await page.evaluate(() => {
        const cards = [...document.querySelectorAll('#settingsDailySection .settings-group')];
        const card = document.getElementById('displayLargeCard');
        const at = cards.indexOf(card);
        return { last: cards[cards.length - 1].id, after: at > 0 && cards[at - 1].id, before: cards[at + 1] && cards[at + 1].id,
            tag: card.tagName, open: card.open, title: card.querySelector('summary h3').textContent, sub: card.querySelector('summary .hint').textContent,
            lead: document.getElementById('displayLargeLead').textContent, state: document.getElementById('displayLargeState').textContent,
            button: document.getElementById('displayLargeSwitch').textContent, pressed: document.getElementById('displayLargeSwitch').getAttribute('aria-pressed'),
            picture: Boolean(card.querySelector('summary .settings-card-icon svg')) };
    });
    same('it stands between the reminders and «הסעות», which is still the last row of «כללי»; a row like the others, shut, with its picture',
        [row.after, row.before, row.last, row.tag, row.open, row.picture],
        ['settingsFoldReminders', 'transportSwitchCard', 'transportSwitchCard', 'DETAILS', false, true]);
    same('its words', [row.title, row.sub, row.lead, row.state, row.button, row.pressed], [TITLE, SUB, LEAD, IS_OFF, TURN_ON, 'false']);

    suite('the switch: on without a reload - the class, the sizes, the bars measured again');
    const before = await disk();
    await censusOnly(check, page, before, [LARGE_KEY]);
    const record = await page.evaluate(() => JSON.stringify(State.schedule));
    const barsOff = await page.evaluate(() => ({ nav: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--nav-h')),
        tabs: document.querySelector('.tabs').getBoundingClientRect().height }));
    await page.locator('#displayLargeCard > summary').click();
    await page.locator('#displayLargeSwitch').click();
    await page.waitForTimeout(500);
    const on = await page.evaluate(key => ({ cls: document.documentElement.classList.contains('display-large'), key: localStorage.getItem(key),
        state: document.getElementById('displayLargeState').textContent, button: document.getElementById('displayLargeSwitch').textContent,
        pressed: document.getElementById('displayLargeSwitch').getAttribute('aria-pressed'), rowOpen: document.getElementById('displayLargeCard').open,
        sheetOpen: document.getElementById('settingsPanel').classList.contains('open'),
        focus: document.activeElement && document.activeElement.id,
        nav: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--nav-h')),
        tabs: document.querySelector('.tabs').getBoundingClientRect().height,
        tab: parseFloat(getComputedStyle(document.querySelector('.tab')).fontSize) }), LARGE_KEY);
    same('the class is on <html> and the one key is the one byte', [on.cls, on.key], [true, '1']);
    same('the row says so, and offers the way back', [on.state, on.button, on.pressed], [IS_ON, TURN_OFF, 'true']);
    same('the sheet and the row are still open, and the focus is still on the switch', [on.sheetOpen, on.rowOpen, on.focus], [true, true, 'displayLargeSwitch']);
    check('the tab bar grew', on.tabs > barsOff.tabs && on.tab >= 18, `${barsOff.tabs} -> ${on.tabs}, ${on.tab}px`);
    check('and the page\'s room for it was measured again, to its new height', Math.abs(on.nav - on.tabs) <= 1, `${on.nav} / ${on.tabs}`);
    same('every other key on the disk is byte for byte what it was', await disk(), before);
    same('and so is the record', await page.evaluate(() => JSON.stringify(State.schedule)), record);

    suite('the switch: a reload keeps it, and no screen is drawn small first');
    // A slow phone: every frame the browser can paint while it parses is a chance to paint
    // the bars small, and four times slower makes more of them.
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => typeof State !== 'undefined' && typeof render === 'function');
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    await page.waitForTimeout(400);
    const kept = await page.evaluate(() => ({ cls: document.documentElement.classList.contains('display-large'), first: window.__firstDraw,
        frames: window.__frames, tab: parseFloat(getComputedStyle(document.querySelector('.tab')).fontSize) }));
    same('still on after the reload', kept.cls, true);
    same('the class was already on <html> when the day was first drawn', kept.first, [true]);
    check('and in the first frame painted with the tab bar in it, and in every one after', kept.frames.length > 0 && kept.frames.every(Boolean),
        JSON.stringify(kept.frames));
    check('and the screen is large', kept.tab >= 18, String(kept.tab));

    suite('the switch: off again - the key is gone and the app is the size it was');
    await page.evaluate(() => { openSettings(); });
    await page.waitForTimeout(300);
    same('the row is shut again at every opening of the sheet, on or off', await page.evaluate(() => document.getElementById('displayLargeCard').open), false);
    await page.locator('#displayLargeCard > summary').click();
    const beforeOff = await disk();
    await page.locator('#displayLargeSwitch').click();
    await page.waitForTimeout(500);
    const off = await page.evaluate(key => ({ cls: document.documentElement.classList.contains('display-large'), key: localStorage.getItem(key),
        state: document.getElementById('displayLargeState').textContent, button: document.getElementById('displayLargeSwitch').textContent,
        nav: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--nav-h')),
        tabs: document.querySelector('.tabs').getBoundingClientRect().height }), LARGE_KEY);
    same('no class, no key', [off.cls, off.key], [false, null]);
    same('the row says so', [off.state, off.button], [IS_OFF, TURN_ON]);
    same('the tab bar is the height it was, and measured so', [off.tabs, Math.abs(off.nav - off.tabs) <= 1], [barsOff.tabs, true]);
    same('every other key on the disk is byte for byte what it was before the tap', await disk(), beforeOff);
    await page.evaluate(() => closeSettings());
    same('and the sample reads exactly as v189 drew it', await page.evaluate(sampleInPage), BASE);
    check('nothing threw', errors.length === 0, errors.slice(0, 3).join(' | '));
    await context.close();
}

// ============================================================ the switch stays under the finger
//
// v191's review, on the 320px phone: the tap that turns the mode on makes everything above
// the row larger, and the sheet kept its scroll - the switch went from y 434 to 852, off a
// 568px screen with its confirmation, and «תזכורות בטלפון» came up under the finger; a
// second tap "to undo" opened the reminders. Through «מה חדש»'s «הראה לי» the whole row
// left the glass. Held on the two small phones, both ways in: after the tap, and after the
// tap back, the switch is where the finger is and the line that says the state is on the
// glass with it.
for (const [width, height] of [[320, 568], [375, 667]]) {
    for (const way of ['from ⋯, the switch just come into view', 'through «מה חדש», «הראה לי»']) {
        suite(`${width}x${height}, the switch ${way}: it stays under the finger, both ways`);
        const { context, page, errors } = await openApp(browser, server.url, { width, height, scheme: 'dark', large: false });
        if (way.startsWith('from')) {
            await page.evaluate(() => { showView('day'); openSettings(); });
            await page.waitForTimeout(300);
            await page.locator('#displayLargeCard > summary').click();
            // The row scrolled until its switch is just on the glass, at the foot of the sheet.
            await page.evaluate(() => {
                const toggle = document.getElementById('displayLargeSwitch');
                const body = document.querySelector('#settingsPanel .settings-body');
                const box = toggle.getBoundingClientRect();
                body.scrollTop += box.bottom - Math.min(body.getBoundingClientRect().bottom, window.innerHeight) + 2;
            });
        } else {
            await page.evaluate(() => whatsNewGo('display'));
        }
        await page.waitForTimeout(300);
        const where = () => page.evaluate(() => {
            const r = id => { const b = document.getElementById(id).getBoundingClientRect(); return [Math.round(b.top), Math.round(b.bottom), Math.round(b.left), Math.round(b.right)]; };
            return { toggle: r('displayLargeSwitch'), state: r('displayLargeState'), height: window.innerHeight,
                cls: document.documentElement.classList.contains('display-large'), words: document.getElementById('displayLargeState').textContent };
        });
        const onGlass = at => at.toggle[0] >= 0 && at.toggle[1] <= at.height + 1 && at.state[0] >= 0 && at.state[1] <= at.height + 1;
        const start = await where();
        given('the switch is on the glass before the tap', start.toggle[0] >= 0 && start.toggle[1] <= start.height + 1, JSON.stringify(start));
        for (const [n, wanted] of [[1, IS_ON], [2, IS_OFF]]) {
            const before = await where();
            const finger = { x: (before.toggle[2] + before.toggle[3]) / 2, y: Math.min((before.toggle[0] + before.toggle[1]) / 2, before.height - 4) };
            await page.touchscreen.tap(finger.x, finger.y);
            await page.waitForTimeout(500);
            const after = await where();
            same(`tap ${n}: it did what it says`, after.words, wanted);
            check(`tap ${n}: the switch is still under the finger`, after.toggle[0] <= finger.y && after.toggle[1] >= finger.y
                && after.toggle[2] <= finger.x && after.toggle[3] >= finger.x, JSON.stringify({ finger, before: before.toggle, after: after.toggle }));
            check(`tap ${n}: and the switch and its state are on the glass`, onGlass(after), JSON.stringify(after));
        }
        check('nothing threw', errors.length === 0, errors.slice(0, 3).join(' | '));
        await context.close();
    }
}

// ============================================================ two windows of one phone
//
// The installed app and a tab, on one disk (v191's review): read once per session, a
// second window kept the size it opened with, and its row then said the opposite of what
// the phone held. Two pages of one context share one localStorage and hear each other's
// writes as 'storage' events, as two windows do.
{
    suite('two windows of one phone: the other window follows, when nobody is typing in it, and its row says what the phone holds');
    const { context, page: a, errors } = await openApp(browser, server.url, { width: 375, height: 667, scheme: 'dark', large: false });
    const b = await context.newPage();
    const errorsB = [];
    b.on('pageerror', error => errorsB.push(error.message));
    await b.goto(`${server.url}/index.html`, { waitUntil: 'load' });
    await b.waitForFunction(() => typeof State !== 'undefined' && typeof render === 'function');
    await b.waitForTimeout(400);
    const state = page => page.evaluate(() => ({ cls: document.documentElement.classList.contains('display-large'),
        state: document.getElementById('displayLargeState').textContent, button: document.getElementById('displayLargeSwitch').textContent }));
    same('both windows start small', [(await state(a)).cls, (await state(b)).cls], [false, false]);
    await a.evaluate(() => { showView('day'); openSettings(); document.getElementById('displayLargeCard').open = true; });
    await a.waitForTimeout(200);
    await a.locator('#displayLargeSwitch').click();
    await b.waitForFunction(() => document.documentElement.classList.contains('display-large'), null, { timeout: 4000 }).catch(() => {});
    same('turned on in one: the other is large too, and its row says on', await state(b), { cls: true, state: IS_ON, button: TURN_OFF });
    // Somebody is typing in the second window: it is not moved under him.
    const typing = await b.evaluate(async () => {
        showView('day');
        openQuickStart();
        await new Promise(done => setTimeout(done, 300));
        const field = document.querySelector('#quickModal textarea, #quickModal input');
        if (field) { field.focus(); field.value = 'דוד כהן'; }
        return Boolean(field) && document.getElementById('quickModal').style.display === 'flex';
    });
    given('the second window has a dialog open with words typed in it', typing);
    await a.locator('#displayLargeSwitch').click();
    await a.waitForTimeout(1200);
    same('turned off in the first while the second is mid-edit: the second is not moved under him', await b.evaluate(() => document.documentElement.classList.contains('display-large')), true);
    await b.evaluate(() => closeQuickStart());
    await b.waitForFunction(() => !document.documentElement.classList.contains('display-large'), null, { timeout: 4000 }).catch(() => {});
    same('and once the dialog is shut, it follows', await state(b), { cls: false, state: IS_OFF, button: TURN_ON });
    same('the first one is off, as it was told', await state(a), { cls: false, state: IS_OFF, button: TURN_ON });
    check('nothing threw in either window', errors.length === 0 && errorsB.length === 0, errors.concat(errorsB).slice(0, 3).join(' | '));
    await context.close();
}

// ============================================================ the migration's questions, on the small phone
//
// v191's review: at 320x568 with the mode on, the dialog opened scrolled to its first
// button with only «החלטה» of its title showing; opened a second time it began where it
// had last been read to. With the mode on it is entered at its title, at its top, both
// times (js/ui/migration.js). The walk holds the first opening of every dialog; this is
// the second.
{
    suite('320x568, the mode on: the migration\'s questions open at their title, the first time and the second');
    const { context, page, errors } = await openApp(browser, server.url, { width: 320, height: 568, scheme: 'dark', large: true });
    const open = () => page.evaluate(async () => {
        const unknown = value => `"${value}" אינו שם של מקום קיים - יש להחליט ידנית.`;
        const both = 'הרצליה - מגדל הים + תל אביב - רוטשילד';
        State.migrationIssues = [
            { kind: 'unknown-place', index: 1, value: both, date: '2026-11-03', workerId: 'w01', workerName: 'דוד כהן',
                suggestion: { separator: '+', parts: ['הרצליה - מגדל הים', 'תל אביב - רוטשילד'], placeIds: ['p1', 'p2'] }, message: unknown(both) },
            { kind: 'unknown-place', index: 7, value: 'נתניה/פ"ת', date: '2026-11-04', workerId: 'w02', workerName: 'עלי חסן', suggestion: null, message: unknown('נתניה/פ"ת') }
        ];
        renderMigration();
        openMigrationModal();
        await new Promise(done => setTimeout(done, 300));
        const content = document.querySelector('#migrationModal .modal-content');
        const title = content.querySelector('h3').getBoundingClientRect();
        const box = content.getBoundingClientRect();
        return { scrollTop: Math.round(content.scrollTop), title: [Math.round(title.top), Math.round(title.bottom)], box: [Math.round(box.top), Math.round(box.bottom)],
            whole: title.top >= Math.max(box.top, 0) - 1 && title.bottom <= Math.min(box.bottom, window.innerHeight) + 1,
            focus: document.activeElement === content.querySelector('h3') };
    });
    const first = await open();
    same('the first time: at its top, the title whole, and the keyboard at the title', [first.scrollTop, first.whole, first.focus], [0, true, true]);
    // Read to its foot, and shut by its own button.
    await page.evaluate(() => { const content = document.querySelector('#migrationModal .modal-content'); content.scrollTop = content.scrollHeight; closeMigrationModal(); });
    await page.waitForTimeout(200);
    const second = await open();
    same('the second time: at its top again, the title whole', [second.scrollTop, second.whole], [0, true]);
    await page.evaluate(() => { closeMigrationModal(); State.migrationIssues = []; renderMigration(); });
    check('nothing threw', errors.length === 0, errors.slice(0, 3).join(' | '));
    await context.close();
}

// ============================================================ with the phone's own large text on top
//
// tests/mobile.test.mjs says why the cascade is doubled rather than each node, and what
// this is NOT (it is not iOS Dynamic Type). Here it is doubled over the large display:
// 40px words on a 375px phone. Nothing about that is comfortable; what is held is that the
// main screens still do not scroll sideways and nothing leaves the side of the glass.
const doubleEveryFontSize = page => page.evaluate(() => {
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
// On the 375 and the 440 phone. Not on the 320 one the review added: there 36-44px words
// leave the day's date and the tab bar up to 17px wider than the phone (measured), and that
// is said in docs/releases.md (v191, «Known not covered») rather than held here.
for (const [width, height] of PHONES.filter(([width]) => width >= 375)) {
    suite(`${width}x${height}, large display ON and the text doubled on top: the main screens`);
    const { context, page, errors } = await openApp(browser, server.url, { width, height, scheme: 'dark', large: true });
    const size = () => page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.wrow-name, .assign-name')).fontSize));
    await page.evaluate(() => { showView('day'); setDayMode('workers'); });
    await page.waitForTimeout(250);
    const base = await size();
    given('the cascade was doubled', await doubleEveryFontSize(page) > 300);
    await page.evaluate(() => { render(); if (typeof scheduleBarMeasure === 'function') scheduleBarMeasure(); });
    await page.waitForTimeout(400);
    const doubled = await size();
    given('a name the app draws really is twice the large size', doubled === base * 2, `${base} -> ${doubled}`);
    const MAIN = ['day - by site', 'day - by worker', 'week - grid', 'crew', 'advances - list', 'reports - by worker'];
    await walk(page, async (screen, failed) => {
        if (failed) { check(`${width}: ${screen.name} opened at twice the large size`, false, failed); return; }
        const read = await measure(page, screen.scope);
        same(`${width}: ${screen.name}: the page is still as wide as the phone`, read.page.scrollWidth, width);
        check(`${width}: ${screen.name}: nothing off the side`, read.offside.length === 0, brief(read.offside, o => `${o.left}..${o.right} ${o.where}`));
    }, screen => MAIN.includes(screen.name));
    check(`${width}: nothing threw`, errors.length === 0, errors.slice(0, 3).join(' | '));
    await context.close();
}

// ============================================================ paper
//
// css/large.css is `@media screen` from its first brace to its last. Proved on a real
// page laid out for print: the week, printed with the mode on, is box for box the week
// printed without it. (tests/print.test.mjs, unchanged, holds the PDF itself.)
{
    suite('paper: the week printed with the large display ON is the week printed without it');
    const pdf = async large => {
        const context = await browser.newContext({ viewport: { width: 1100, height: 800 }, timezoneId: 'Asia/Jerusalem', locale: 'he-IL', serviceWorkers: 'block' });
        const page = await context.newPage();
        await page.addInitScript(([key, on]) => { try { if (on) localStorage.setItem(key, '1'); else localStorage.removeItem(key); } catch (error) { /* no disk */ } }, [LARGE_KEY, large]);
        await page.clock.install({ time: new Date('2026-11-10T19:30:00+02:00') });
        await page.goto(`${server.url}/index.html`, { waitUntil: 'load' });
        await page.waitForFunction(() => typeof State !== 'undefined' && typeof render === 'function');
        await page.evaluate(() => {
            State.schedule.workers = ['דוד כהן', 'עלי חסן', 'מוחמד אבו ראס'].map((name, i) => ({ id: 'w' + i, name, active: true, dailyRate: 400 }));
            State.schedule.places = [{ id: 'p1', name: 'הרצליה', active: true }, { id: 'p2', name: 'רמת גן', active: true }];
            ['2026-11-08', '2026-11-09', '2026-11-10'].forEach((date, d) => State.schedule.workers.forEach((worker, i) =>
                assignPlace(State.schedule, date, worker.id, 'actual', 'p' + (((i + d) % 2) + 1))));
            State.save();
            State.date = '2026-11-10';
            showView('week');
        });
        await page.waitForTimeout(300);
        const cls = await page.evaluate(() => document.documentElement.classList.contains('display-large'));
        await page.emulateMedia({ media: 'print' });
        const paper = await page.evaluate(() => [...document.querySelectorAll('#weekView *')].filter(node => node.getClientRects().length).map(node => {
            const cs = getComputedStyle(node);
            const r = node.getBoundingClientRect();
            return [node.tagName, cs.fontSize, cs.fontWeight, cs.lineHeight, cs.color, cs.backgroundColor, Math.round(r.width), Math.round(r.height)].join(' ');
        }));
        const bytes = await page.pdf({ format: 'A4', landscape: true, printBackground: true });
        await context.close();
        return { cls, paper, pages: (bytes.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length, size: bytes.length };
    };
    const plain = await pdf(false);
    const large = await pdf(true);
    given('the second one really had the mode on, and the first did not', large.cls === true && plain.cls === false);
    given('there is a week on the paper', plain.paper.length > 30, String(plain.paper.length));
    const moved = plain.paper.filter((line, i) => line !== large.paper[i]).slice(0, 4);
    same('every box of the printed week has the size, weight, colour and rectangle it has without the mode', moved, []);
    same('the same number of boxes, the same number of pages', [large.paper.length, large.pages], [plain.paper.length, plain.pages]);
    check('and the PDF is the same size to within a stamp', Math.abs(large.size - plain.size) < 2048, `${plain.size} / ${large.size}`);
}

// ============================================================ the shared picture
//
// The table as a picture (js/ui/printout.js) is drawn on a canvas of its own, in its own
// sizes, from the WORDS and the site colours it reads off the document - never from how
// large the document draws them. Held on the bytes: the week, the report and the rides'
// summary, each drawn with the mode off and with it on, are the same PNG.
{
    suite('the shared picture: the same PNG with the large display ON and OFF');
    const pictures = async large => {
        const { context, page, errors } = await openApp(browser, server.url, { width: 440, height: 956, scheme: 'dark', large });
        const out = await page.evaluate(async () => {
            const wait = ms => new Promise(done => setTimeout(done, ms));
            const print = async kind => {
                const made = printoutImage(kind);
                if (!made) return null;
                const bytes = new Uint8Array(await made.blob.arrayBuffer());
                const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
                return [made.width, made.height, bytes.length, [...digest].map(b => b.toString(16).padStart(2, '0')).join('')];
            };
            const seen = { large: document.documentElement.classList.contains('display-large') };
            State.date = todayStr(); showView('week'); setWeekPhoneMode('grid');
            await wait(300);
            seen.week = await print('week');
            REPORT_SECTION = 'workers'; REPORT_CARD_GRID = true; showView('reports');
            await wait(300);
            seen.report = await print('report');
            REPORT_SECTION = 'sites'; showView('reports');
            await wait(300);
            seen.sites = await print('report');
            showView('day'); openTransport(State.date); openTransportSummary();
            await wait(300);
            seen.rides = await print('transport');
            return seen;
        });
        await context.close();
        return { out, errors };
    };
    const plain = await pictures(false);
    const large = await pictures(true);
    given('one phone had the mode on and the other did not', plain.out.large === false && large.out.large === true);
    for (const kind of ['week', 'report', 'sites', 'rides']) {
        given(`${kind}: a picture was drawn`, Boolean(plain.out[kind]) && plain.out[kind][2] > 2000, JSON.stringify(plain.out[kind]));
        same(`${kind}: the same width, height, length and SHA-256`, large.out[kind], plain.out[kind]);
    }
    check('nothing threw', plain.errors.length === 0 && large.errors.length === 0, plain.errors.concat(large.errors).slice(0, 3).join(' | '));
}

await browser.close();
server.close();
report();
