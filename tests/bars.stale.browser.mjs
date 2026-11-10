// The frame iOS pushed up (v167), in a real Chromium: what the page decides and writes,
// given the numbers a stuck home-screen iPhone reports - and every fixed layer of the page
// counted, so none is left behind on the glass.
//
//   node tests/bars.stale.browser.mjs
//
// The owner's phone, 2 November 2026, 20:37: iPhone 16 Pro Max on the home screen, v165,
// window=440x894 visual=440x549 offsetTop=0 focus=body, both bars at the bottom of the
// LAYOUT viewport by their rectangles, and a screenshot - scrolled - with both of them
// drawn 345px up and the day list running on beneath them.
//
// WHAT THIS FILE CAN AND CANNOT SHOW. Chromium draws a fixed layer where its rectangle
// says; no browser here can be made to push a layout viewport. So the visual viewport is
// FAKED, before the app's scripts load (so watchBottomBars listens to the fake, as on a
// phone), navigator.standalone is said to be true, and where a layer lands on the glass is
// computed by WebKit's rule, written once in glass(): a fixed layer is drawn at its
// rectangle MINUS visualViewport.offsetTop. That rule is the premise of the fix, not
// something this browser does. NOTHING HERE HAS RUN ON AN IPHONE (docs/releases.md, v167).
// The rule itself, a whole scroll under both readings of WebKit's rectangles, and the
// decision one frame at a time, are in tests/bars.stale.test.mjs.

import { chromium } from 'playwright';
import { readFileSync, readdirSync } from 'node:fs';
import { serve } from './serve.mjs';
import { launchLocalBrowser } from './network-guard.mjs';
import { verifyServedAssets, expectedShaFor } from './treecheck.mjs';
import { suite, check, same, given, report } from './runner.mjs';

const root = new URL('..', import.meta.url).pathname;
const server = await serve(root);
const served = await verifyServedAssets(server.url, root, expectedShaFor(root));
check('the origin served this commit, byte for byte', served.ok,
    `${served.checked} assets; ${(served.wrong || []).slice(0, 3).join(' | ')}`);
const browser = await launchLocalBrowser(chromium, { executablePath: process.env.CHROME_PATH });

const IW = 440, IH = 894, SHORT = 345;
const errors = [];

async function openHome({ standalone = true } = {}) {
    const context = await browser.newContext({
        viewport: { width: IW, height: IH }, deviceScaleFactor: 2,
        isMobile: true, hasTouch: true, colorScheme: 'dark'
    });
    await context.addInitScript(homeScreen => {
        const fake = new EventTarget();
        const said = { height: null, width: null, scale: 1, offsetTop: 0, offsetLeft: 0 };
        const read = (key, real) => (said[key] === null ? real() : said[key]);
        Object.defineProperties(fake, {
            height: { get: () => read('height', () => window.innerHeight) },
            width: { get: () => read('width', () => window.innerWidth) },
            scale: { get: () => said.scale },
            offsetTop: { get: () => said.offsetTop },
            offsetLeft: { get: () => said.offsetLeft },
            pageTop: { get: () => window.scrollY + said.offsetTop },
            pageLeft: { get: () => window.scrollX + said.offsetLeft }
        });
        Object.defineProperty(window, 'visualViewport', { configurable: true, get: () => fake });
        // 'absent' stands for a browser that has no such property at all (Chrome, Android).
        Object.defineProperty(Navigator.prototype, 'standalone', {
            configurable: true, get: () => (homeScreen === 'absent' ? undefined : homeScreen) });
        // WebKit's VisualViewport::update: a size or scale change is a 'resize', an offset
        // change a 'scroll'; the rendering steps run resize before scroll.
        window.__vv = next => {
            const before = [fake.height, fake.width, fake.scale, fake.offsetTop, fake.offsetLeft];
            Object.assign(said, next);
            const after = [fake.height, fake.width, fake.scale, fake.offsetTop, fake.offsetLeft];
            if (before[0] !== after[0] || before[1] !== after[1] || before[2] !== after[2]) {
                fake.dispatchEvent(new Event('resize'));
            }
            if (before[3] !== after[3] || before[4] !== after[4]) fake.dispatchEvent(new Event('scroll'));
        };
        // The same change with NO event: a phone whose visualViewport 'scroll' never comes
        // (the one the window 'scroll' failsafe exists for).
        window.__vvSilent = next => { Object.assign(said, next); };
    }, standalone);
    const page = await context.newPage();
    page.on('dialog', dialog => { errors.push(`native dialog: ${dialog.type()}`); dialog.dismiss(); });
    page.on('pageerror', error => errors.push(String(error.message || error).slice(0, 200)));
    await page.goto(`${server.url}/index.html`, { waitUntil: 'load' });
    await page.waitForTimeout(300);
    await page.evaluate(() => {
        if (typeof weekPhoneMode !== 'undefined') weekPhoneMode = 'grid';
        todayStr = () => '2026-08-12';
        State.schedule.workers = Array.from({ length: 30 }, (unused, i) => ({
            id: `w_${String(i + 1).padStart(2, '0')}`, name: `עובד ${i + 1}`,
            active: true, dailyRate: 400, hourlyRate: 50 }));
        State.schedule.places = Array.from({ length: 12 }, (unused, i) => ({
            id: `p_${i + 1}`, name: `אתר ${i + 1}`, active: true }));
        State.date = '2026-08-12';
        State.save();
        showView('day');
        ['w_01', 'w_02', 'w_03', 'w_07', 'w_11', 'w_19', 'w_28'].forEach((id, i) => {
            assignPlace(State.schedule, '2026-08-12', id, 'actual', `p_${(i % 4) + 1}`);
        });
        State.save();
        if (typeof setDayMode === 'function') setDayMode('sites');
        render();
        // The phone's own home indicator: the tab bar is 105px tall there because of it.
        document.documentElement.style.setProperty('--safe-bottom', '34px');
        scheduleBarMeasure();
        // And once synchronously, so the first reading below cannot come before the queued one.
        if (typeof correctRaisedBars === 'function') correctRaisedBars();
        measureBottomBars();
    });
    await page.waitForTimeout(300);
    return page;
}

const frames = page => page.evaluate(() => new Promise(done =>
    requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(done)))));
const settleMs = 800;   // longer than the 600ms the rule waits before it calls a frame stuck

// Where each layer is ON THE GLASS, by WebKit's rule: rectangle minus offsetTop.
const glass = page => page.evaluate(() => {
    const ot = window.visualViewport.offsetTop;
    const one = selector => {
        const node = document.querySelector(selector);
        if (!node) return null;
        const style = getComputedStyle(node);
        const box = node.getBoundingClientRect();
        return { position: style.position, display: style.display,
            top: Math.round(box.top - ot), bottom: Math.round(box.bottom - ot),
            h: Math.round(box.height) };
    };
    const rootStyle = getComputedStyle(document.documentElement);
    const sheet = document.querySelector('#assignSheet .sheet-content');
    const sheetBox = sheet && sheet.offsetParent !== null ? sheet.getBoundingClientRect() : null;
    let shownDialog = null;
    document.querySelectorAll('.modal:not(.sheet)').forEach(node => {
        if (getComputedStyle(node).display !== 'none') shownDialog = node.querySelector('.modal-content');
    });
    const dialogBox = shownDialog ? shownDialog.getBoundingClientRect() : null;
    return {
        ih: innerHeight, ot,
        tabs: one('.tabs'), dock: one('.day-actions'), undo: one('#undoBar'),
        header: one('#dayView .day-header'),
        pending: one('#pushReminderPending'),
        sheetBottom: sheetBox ? Math.round(sheetBox.bottom - ot) : null,
        dialog: shownDialog ? shownDialog.parentElement.id : null,
        dialogTop: dialogBox ? Math.round(dialogBox.top - ot) : null,
        dialogBottom: dialogBox ? Math.round(dialogBox.bottom - ot) : null,
        lowered: document.body.classList.contains('bars-lowered'),
        frame: document.body.classList.contains('frame-lowered'),
        kbd: document.body.classList.contains('kbd-open'),
        tight: document.body.classList.contains('day-tight'),
        nav: rootStyle.getPropertyValue('--nav-h').trim(),
        dockH: rootStyle.getPropertyValue('--day-actions-h').trim(),
        undoH: rootStyle.getPropertyValue('--undo-h').trim(),
        active: document.activeElement ? document.activeElement.tagName
            + (document.activeElement.type ? ':' + document.activeElement.type : '') : 'none'
    };
});

// THE CLAIM, in one place. A bar that floats (fixed, drawn) sits on the bottom of the
// glass: the tab bar's bottom on the glass's bottom, the dock's bottom on the tab bar's top.
const floatingRight = s => {
    const floats = b => b && b.position === 'fixed' && b.display !== 'none';
    const tabsOk = !floats(s.tabs) || Math.abs(s.tabs.bottom - s.ih) <= 1;
    const under = floats(s.tabs) ? s.tabs.top : s.ih;
    const dockOk = !floats(s.dock) || Math.abs(s.dock.bottom - under) <= 1;
    return tabsOk && dockOk;
};
const bothFloat = s => s.tabs.position === 'fixed' && s.dock.position === 'fixed'
    && s.tabs.display !== 'none' && s.dock.display !== 'none';
const brief = s => JSON.stringify({ ot: s.ot, tabs: s.tabs && [s.tabs.position, s.tabs.top, s.tabs.bottom],
    dock: s.dock && [s.dock.position, s.dock.top, s.dock.bottom], lowered: s.lowered, frame: s.frame,
    kbd: s.kbd, active: s.active });

// ================================================================ block 1: the three bars
{
    suite('the frame iOS pushed up: the bars stay on the bottom of the glass');
    const page = await openHome();
    const healthy = await glass(page);
    given('healthy: whole viewport, both bars floating on the bottom, nothing moved',
        bothFloat(healthy) && floatingRight(healthy) && !healthy.lowered && !healthy.frame, brief(healthy));

    // The 20:37 reading: 345px short, nothing focused, at the top of the page.
    await page.evaluate(short => window.__vv({ height: innerHeight - short }), SHORT);
    await page.waitForTimeout(settleMs);
    let s = await glass(page);
    check('at the top of the page the stuck frame moves nothing (the 20:37 report: offsetTop 0)',
        bothFloat(s) && floatingRight(s) && !s.lowered && !s.frame, brief(s));

    // 120px into a scroll down: the visual viewport slides inside the layout viewport.
    await page.evaluate(() => window.__vv({ offsetTop: 120 }));
    await frames(page);
    s = await glass(page);
    check('120px into a scroll down, both bars are still on the bottom of the glass',
        bothFloat(s) && floatingRight(s), brief(s));

    // Past the slack: the 20:37 screenshot. v165 draws the tab bar's bottom at 549.
    await page.evaluate(short => window.__vv({ offsetTop: short }), SHORT);
    await frames(page);
    s = await glass(page);
    check('scrolled past the slack (the 20:37 screenshot), both bars are on the bottom of the glass',
        bothFloat(s) && floatingRight(s), brief(s));

    // Asked again and again - every touch and every frame of a scroll asks - it does not add up.
    await page.evaluate(() => { scheduleBarMeasure(); });
    await frames(page);
    await page.evaluate(() => { scheduleBarMeasure(); });
    await frames(page);
    s = await glass(page);
    check('asked again, the correction does not accumulate', floatingRight(s), brief(s));

    // The room the page keeps is reckoned in the frame, not off a moved bar.
    check('the room the page reserves is the healthy one: --nav-h, --day-actions-h, --undo-h, day-tight',
        s.nav === healthy.nav && s.dockH === healthy.dockH && s.undoH === healthy.undoH
        && s.tight === healthy.tight,
        JSON.stringify({ now: [s.nav, s.dockH, s.undoH, s.tight],
            healthy: [healthy.nav, healthy.dockH, healthy.undoH, healthy.tight] }));

    // The undo bar floats above the pair, lifted 10px; it goes down with them.
    await page.evaluate(() => offerUndo('בדיקה', () => {}));
    await frames(page);
    await page.waitForTimeout(100);
    s = await glass(page);
    const undoWant = s.ih - (parseFloat(s.nav) + parseFloat(s.dockH)) - 10;
    check('the undo bar is lowered with them: just above the dock on the glass',
        s.undo && s.undo.display !== 'none' && Math.abs(s.undo.bottom - undoWant) <= 1,
        JSON.stringify({ undo: s.undo, want: undoWant }));
    check('and the room kept for it is the healthy one (coverage read without the drop)',
        s.undoH !== '0px' && Math.abs(parseFloat(s.undoH) - (s.ih - (undoWant - s.undo.h))) <= 1,
        JSON.stringify({ undoH: s.undoH, undo: s.undo }));
    await page.evaluate(() => { if (typeof dismissUndoBar === 'function') dismissUndoBar(); });
    await frames(page);

    // Back up to the top: offsetTop returns to 0 and the correction with it.
    await page.evaluate(() => window.__vv({ offsetTop: 0 }));
    await frames(page);
    s = await glass(page);
    check('scrolled back to the top, nothing is moved', floatingRight(s) && !s.lowered && !s.frame, brief(s));

    // Armed at the top with nothing lowered, and offsetTop moves with NO visualViewport
    // event - only the page's own scroll. The failsafe has to ask while ARMED, not only
    // while a drop stands, or this phone is left with the bars mid-screen.
    await page.evaluate(() => {
        window.__vvSilent({ offsetTop: 200 });
        window.dispatchEvent(new Event('scroll'));
    });
    await frames(page);
    s = await glass(page);
    check('armed at the top, a scroll with no visualViewport event still brings the drop',
        bothFloat(s) && floatingRight(s) && s.lowered, brief(s));
    await page.evaluate(() => {
        window.__vvSilent({ offsetTop: 0 });
        window.dispatchEvent(new Event('scroll'));
    });
    await frames(page);
    s = await glass(page);
    check('and back at the top by the same road, nothing is moved', floatingRight(s) && !s.lowered, brief(s));

    // The state clears by itself: the visual viewport whole again, offsetTop 0.
    await page.evaluate(() => window.__vv({ height: null, offsetTop: 0 }));
    await frames(page);
    s = await glass(page);
    check('the viewport whole again: the rule lets go in the same frame, nothing waits',
        !s.lowered && !s.frame && floatingRight(s) && bothFloat(s), brief(s));

    // A REAL keyboard over a frame nobody has called stuck: the same short numbers, with a
    // text field focused. The bars hide (v99), and the input view blocks the arming.
    await page.evaluate(short => {
        showAddWorkerModal();
        document.getElementById('workerFormName').focus();
        window.__vv({ height: innerHeight - short, offsetTop: short });
    }, SHORT);
    await page.waitForTimeout(settleMs);
    s = await glass(page);
    check('a real keyboard (a text field focused) is not corrected: kbd-open hides the bars, nothing is moved',
        s.kbd && !s.lowered && !s.frame && s.tabs.display === 'none', brief(s));

    // The field lets go and the viewport STAYS short: the stuck keyboard. Settling first.
    // Asked in the same task as the blur, by the page's own decision and the same
    // measuring path a frame would run: no frame timing in it, so a slow headless engine
    // cannot let the settling time run out before the question is asked.
    const letGo = await page.evaluate(() => {
        document.getElementById('workerFormName').blur();
        closeWorkerForm();
        applyKeyboardInset(keyboardHeight());
        if (typeof correctRaisedBars === 'function') correctRaisedBars();
        measureBottomBars();
        return {
            lowered: document.body.classList.contains('bars-lowered'),
            frame: document.body.classList.contains('frame-lowered'),
            kbd: document.body.classList.contains('kbd-open'),
            tabs: getComputedStyle(document.querySelector('.tabs')).display };
    });
    check('the moment the field lets go, nothing is moved yet - a keyboard going down gets time to say so',
        !letGo.kbd && !letGo.lowered && !letGo.frame && letGo.tabs !== 'none',
        JSON.stringify(letGo));
    await page.waitForTimeout(settleMs);
    s = await glass(page);
    check('and when the viewport has stood short and still, both bars come down to the bottom',
        !s.kbd && s.lowered && bothFloat(s) && floatingRight(s), brief(s));

    // Healed for good before the report is read.
    await page.evaluate(() => window.__vv({ height: null, offsetTop: 0 }));
    await frames(page);
    s = await glass(page);
    check('and whole again, it is gone again', !s.lowered && !s.frame && floatingRight(s), brief(s));

    // The ⋯ report: copied at the top, where the drop is 0 - it says what it DID.
    const text = await page.evaluate(async () => {
        openSettings();
        // v172: מידע טכני is a row that is shut when the sheet opens; the row, then the button.
        const fold = document.querySelector('#diagnosticGroup > summary');
        if (fold) fold.click();
        const toggle = document.getElementById('diagnosticToggle');
        if (toggle) toggle.click();
        await new Promise(done => setTimeout(done, 1300));
        const field = document.getElementById('diagnosticText');
        const value = field ? field.value : '';
        if (typeof closeSettings === 'function') closeSettings();
        return value;
    });
    const lines = Object.fromEntries(text.split('\n').filter(l => l.indexOf('=') !== -1)
        .map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
    check('the ⋯ report says how far it moved the bars this session, that it armed twice, and that it is off now',
        /^now=0px max=345px stale=no times=2 why=whole frame=0px header=0px$/.test(lines['bar.drop'] || '')
        && lines['body.bars-lowered'] === 'no',
        JSON.stringify([lines['bar.drop'], lines['body.bars-lowered'], lines['bar.trigger']]));
    check('and what let go of an input view before the frame was last found stuck',
        /^focus(out|in) after INPUT\[text\]#workerFormName/.test(lines['bar.trigger'] || ''),
        JSON.stringify(lines['bar.trigger']));
    check('and what the frame did while it stood short: the shortfall, offsetTop reaching it, no gap in the bar\'s rectangle',
        /^short=345 offsetTop=345 pageTop=\d+ rectGap=0$/.test(lines['bar.seen'] || ''),
        JSON.stringify(lines['bar.seen']));
    check('and the raw flag the rule reads, beside isStandalone()\'s answer',
        lines['ios.standalone'] === 'true', JSON.stringify(lines['ios.standalone']));
    check('the pinned rectangle lines keep their shape',
        /^(fixed|static|sticky|absolute) top=-?\d+ bottom=-?\d+ h=\d+$/.test(lines['bar.tabs'] || '')
        && /^(fixed|static|sticky|absolute) top=-?\d+ bottom=-?\d+ h=\d+$/.test(lines['bar.dock'] || ''),
        JSON.stringify([lines['bar.tabs'], lines['bar.dock']]));
    await page.context().close();

    // ---- what must NOT be corrected, each its own fresh phone
    suite('the frame iOS pushed up: what is not a stuck frame');
    const cases = [
        // v167: the day has no rate select any more (the declutter), so this is the probe.
        ['a picker wheel: a select focused', { height: IH - 300, offsetTop: 294 }, 'select'],
        ['the day picker (input type=date) focused', { height: IH - 300, offsetTop: 100 }, 'date'],
        ['a pinch: 1.25x, panned', { height: 715, width: 352, scale: 1.25, offsetTop: 120, offsetLeft: 40 }, null],
        ['a pinch too small to see in the scale (1.008x) - the width gives it away',
            { height: 600, width: 436.5, scale: 1.008, offsetTop: 30 }, null],
        ['a launch glitch: the visual viewport near nothing', { height: 40, offsetTop: 0 }, null]
    ];
    for (const [what, viewport, focus] of cases) {
        const p = await openHome();
        await p.evaluate(([v, focus]) => {
            if (focus === 'select') {
                const pick = document.querySelector('.rate-select') || (() => {
                    const probe = document.createElement('select');
                    probe.appendChild(document.createElement('option'));
                    document.body.appendChild(probe);
                    return probe;
                })();
                pick.focus();
            }
            if (focus === 'date') {
                const picker = document.getElementById('dayPicker');
                picker.style.pointerEvents = 'auto';
                picker.focus();
            }
            window.__vv(v);
        }, [viewport, focus]);
        await p.waitForTimeout(settleMs);
        await p.evaluate(() => scheduleBarMeasure());
        await frames(p);
        const r = await glass(p);
        check(`${what}: nothing is lowered`, !r.lowered && !r.frame, brief(r));
        await p.context().close();
    }
    for (const [what, standalone] of [['an Android install or a browser tab (navigator.standalone undefined)', 'absent'],
        ['Safari in a tab (navigator.standalone false)', false]]) {
        const p = await openHome({ standalone });
        await p.evaluate(short => window.__vv({ height: innerHeight - short, offsetTop: short }), SHORT);
        await p.waitForTimeout(settleMs);
        await p.evaluate(() => scheduleBarMeasure());
        await frames(p);
        const r = await glass(p);
        check(`${what}: the same numbers are left alone`, !r.lowered && !r.frame, brief(r));
        // ... and are still WRITTEN DOWN: what the frame did is the evidence a later
        // build needs, whether or not this one acted on it.
        const seen = await p.evaluate(() => [typeof barSeenReport === 'function' ? barSeenReport() : null,
            String(navigator.standalone)]);
        check(`${what}: the ⋯ report still records the short frame and the raw flag`,
            /^short=345 offsetTop=345 pageTop=\d+ rectGap=\d+$/.test(seen[0] || '')
            && seen[1] === (standalone === 'absent' ? 'undefined' : String(standalone)),
            JSON.stringify(seen));
        await p.context().close();
    }

    // The other reading of WebKit: client rectangles relative to the VISUAL viewport. Then
    // a pushed bar's own rectangle says it is raised by offsetTop too - and the two must not
    // be added. Modelled with a stylesheet raise equal to offsetTop; on the glass the bar is
    // where its rectangle says (no subtraction in this model).
    suite('the frame iOS pushed up: the other coordinate model is not double-counted');
    {
        const p = await openHome();
        await p.evaluate(short => window.__vv({ height: innerHeight - short }), SHORT);
        await p.waitForTimeout(settleMs);
        await p.addStyleTag({ content: '.tabs { bottom: 120px !important; }'
            + ' .day-actions { bottom: calc(var(--nav-h) + 120px) !important; }' });
        await p.evaluate(() => window.__vv({ offsetTop: 120 }));
        await frames(p);
        const r = await p.evaluate(() => {
            const box = document.querySelector('.tabs').getBoundingClientRect();
            return { bottom: Math.round(box.bottom), ih: innerHeight,
                lowered: document.body.classList.contains('bars-lowered') };
        });
        check('raise in the rectangle AND in offsetTop (120 each): lowered by 120, not 240',
            r.lowered && Math.abs(r.bottom - r.ih) <= 1, JSON.stringify(r));
        await p.context().close();
    }
}

// ================================================================ block 2: the whole frame
{
    suite('the frame iOS pushed up: sheets, dialogs and the date header come down too');
    const page = await openHome();
    // Scrolled for real, so the date header is pinned at the top of the layout viewport.
    await page.evaluate(() => window.scrollTo(0, 900));
    await page.evaluate(short => window.__vv({ height: innerHeight - short }), SHORT);
    await page.waitForTimeout(settleMs);
    await page.evaluate(short => window.__vv({ offsetTop: short }), SHORT);
    await frames(page);
    let s = await glass(page);
    given('stuck and scrolled past the slack', s.ot === SHORT, brief(s));
    check('stuck and scrolled past the slack, the bars are lowered onto the glass',
        s.lowered && bothFloat(s) && floatingRight(s), brief(s));
    check('the date header is on the top of the glass (v165: 345px above it)',
        s.header && Math.abs(s.header.top) <= 1, JSON.stringify(s.header));

    // The assign sheet, opened from a row in the middle of the list.
    await page.evaluate(() => {
        State.commit(assignPlace(State.schedule, State.date, 'w_04', State.layer, 'p_1', RATE_NORMAL));
        openAssignSheet('w_04');
    });
    await page.waitForTimeout(400);
    s = await glass(page);
    check('the assign sheet ends on the bottom of the glass, with no live list under it',
        s.sheetBottom !== null && Math.abs(s.sheetBottom - s.ih) <= 1, JSON.stringify({ sheetBottom: s.sheetBottom, ot: s.ot }));
    await page.evaluate(() => closeAssignSheet());
    await page.waitForTimeout(200);

    // A dialog anchored to the top on a phone, with buttons only (askConfirm focuses its
    // OK button - not an input view).
    await page.evaluate(() => { askConfirm({ title: 'בדיקה', message: 'בדיקה' }); });
    await page.waitForTimeout(300);
    s = await glass(page);
    check('a top-anchored dialog starts on the glass, not above it',
        s.dialogTop !== null && s.dialogTop >= 0,
        JSON.stringify({ dialog: s.dialog, dialogTop: s.dialogTop, ot: s.ot, active: s.active }));
    await page.evaluate(() => askCancel());
    await page.waitForTimeout(200);

    // v167's own dialog: the seder to each worker, opened over the stuck frame.
    await page.evaluate(() => { openSederList(State.date); });
    await page.waitForTimeout(300);
    s = await glass(page);
    check('the seder list (v167) opens whole on the glass: its top below the glass\'s top, its foot above the bottom',
        s.dialog === 'sederModal' && s.dialogTop >= 0 && s.dialogBottom <= s.ih + 1,
        JSON.stringify({ dialog: s.dialog, dialogTop: s.dialogTop, dialogBottom: s.dialogBottom, ot: s.ot }));
    await page.evaluate(() => closeSederList());
    await page.waitForTimeout(200);

    // THE JUDGE'S SECOND AMENDMENT, in the page: the worker picker open over the armed
    // frame, and its search box tapped. A real keyboard comes up over it - kbd-open hides
    // the bars, so the tab bar has no rectangle - and the dialog must stay where it is.
    await page.evaluate(() => { openWorkerPicker('p_1'); });
    await page.waitForTimeout(300);
    const before = await glass(page);
    await page.evaluate(() => { document.getElementById('workerPickerSearch').focus(); });
    await frames(page);
    await page.waitForTimeout(100);
    const typing = await glass(page);
    await page.evaluate(() => { document.getElementById('workerPickerSearch').blur(); });
    await frames(page);
    await page.waitForTimeout(100);
    const after = await glass(page);
    await page.waitForTimeout(settleMs);
    const later = await glass(page);
    given('the picker was open, and the keys really came up over it',
        before.dialog === 'workerPickerModal' && typing.kbd && typing.tabs.display === 'none',
        JSON.stringify({ before: before.dialog, kbd: typing.kbd, tabs: typing.tabs && typing.tabs.display }));
    same('the picker\'s top on the glass: open, typing, let go, settled - it never moves',
        [before.dialogTop, typing.dialogTop, after.dialogTop, later.dialogTop],
        [before.dialogTop, before.dialogTop, before.dialogTop, before.dialogTop]);
    check('and it is on the glass, not above it', before.dialogTop >= 0,
        JSON.stringify({ dialogTop: before.dialogTop, ot: before.ot }));
    check('and once the keys are gone the bars are back on the bottom of the glass',
        !after.kbd && bothFloat(after) && floatingRight(after), brief(after));
    await page.evaluate(() => closeWorkerPicker());
    await page.waitForTimeout(200);

    // The tenth layer that v165 had and the first design missed (the judge's third
    // amendment): the reminder banner, fixed to the top of the screen (css/readability.css).
    await page.evaluate(() => { document.getElementById('pushReminderPending').hidden = false; });
    await frames(page);
    s = await glass(page);
    check('the reminder banner (.push-reminder-pending) is at the top of the glass, not 345px above it',
        s.pending && s.pending.display !== 'none' && Math.abs(s.pending.top) <= 1,
        JSON.stringify({ pending: s.pending, ot: s.ot }));
    await page.evaluate(() => { document.getElementById('pushReminderPending').hidden = true; });

    // Mid-slack with the header not yet pinned: it scrolls with the page, as it would.
    await page.evaluate(() => { window.scrollTo(0, 0); window.__vv({ offsetTop: 30 }); });
    await frames(page);
    const free = await page.evaluate(() => {
        const header = document.querySelector('#dayView .day-header');
        const translate = getComputedStyle(header).translate;
        const box = header.getBoundingClientRect();
        return { top: Math.round(box.top), translate };
    });
    check('mid-slack, a header that is not pinned yet is not moved (it scrolls with the page)',
        free.translate === 'none' || /^0px( 0px)?$/.test(free.translate), JSON.stringify(free));
    await page.context().close();
}

// ================================================================ block 3: every fixed layer
//
// A fixed layer the drop does not know about is drawn 345px up the stuck glass, whatever the
// others do - and the first design missed one (the reminder banner). So nothing here names
// the layers: every element whose computed position is fixed is FOUND, three ways, and each
// one must be moved by the stuck frame's offsetTop, exactly once. A new fixed layer that is
// not in css/app.css's lists fails here, by name, before it reaches a phone.
{
    suite('the frame iOS pushed up: every fixed layer on the page comes down, exactly once');
    const page = await openHome();
    await page.evaluate(() => window.scrollTo(0, 900));
    await page.evaluate(short => window.__vv({ height: innerHeight - short }), SHORT);
    await page.waitForTimeout(settleMs);
    await page.evaluate(short => window.__vv({ offsetTop: short }), SHORT);
    await frames(page);
    const census = await page.evaluate(() => {
        const name = node => node.tagName.toLowerCase() + (node.id ? `#${node.id}` : '')
            + (node.classList.length ? '.' + [...node.classList].join('.') : '');
        // The vertical part of what this element's own transform and translate move it by.
        // The transform as COMPUTED, through the typed object model: getComputedStyle
        // resolves a transform against the element's box, and for an element with no box -
        // the undo bar between offers - it says `none` however far the drop would move it.
        // The `translate` property it reports as computed either way.
        const typedY = node => {
            try {
                const value = node.computedStyleMap().get('transform');
                return value && typeof value.toMatrix === 'function' ? value.toMatrix().m42 : null;
            } catch (error) {
                return null;
            }
        };
        const own = (node, pseudo) => {
            const style = getComputedStyle(node, pseudo);
            let y = 0;
            const typed = pseudo || typeof node.computedStyleMap !== 'function' ? null : typedY(node);
            if (typed !== null) y += typed;
            else if (style.transform && style.transform !== 'none') y += new DOMMatrixReadOnly(style.transform).m42;
            if (style.translate && style.translate !== 'none') {
                const parts = style.translate.trim().split(/\s+/);
                if (parts.length > 1) y += parseFloat(parts[1]) || 0;
            }
            return y;
        };
        // The element and every ancestor: a layer moved by its own drop AND by a moved
        // ancestor's is drawn twice as far down as it should be.
        // A pseudo-element's host is the first of its ancestors.
        const total = (node, pseudo) => {
            let y = pseudo ? own(node, pseudo) + own(node) : own(node);
            for (let up = node.parentElement; up; up = up.parentElement) y += own(up);
            return y;
        };
        const layers = [];
        document.querySelectorAll('*').forEach(node => {
            if (getComputedStyle(node).position === 'fixed') layers.push({ node, pseudo: null, label: name(node) });
            ['::before', '::after'].forEach(pseudo => {
                const style = getComputedStyle(node, pseudo);
                if (style.content !== 'none' && style.position === 'fixed') {
                    layers.push({ node, pseudo, label: name(node) + pseudo });
                }
            });
        });
        // What the drop contributes is read as the difference with it and without it, in
        // one task: a layer that slides on its own transform (the drawer, a sheet) keeps
        // that part in both readings.
        const withDrop = layers.map(layer => total(layer.node, layer.pseudo));
        const lifted = ['bars-lowered', 'frame-lowered'].filter(c => document.body.classList.contains(c));
        lifted.forEach(c => document.body.classList.remove(c));
        const withoutDrop = layers.map(layer => total(layer.node, layer.pseudo));
        lifted.forEach(c => document.body.classList.add(c));
        // The stylesheet's own list: every rule that makes something fixed at this width,
        // so a layer that only exists while it is open is not missed for being closed now.
        const rules = [];
        const walk = (list, media) => {
            [...list].forEach(rule => {
                if (rule.media && rule.conditionText !== undefined) {
                    if (window.matchMedia(rule.conditionText).matches) walk(rule.cssRules, rule.conditionText);
                    return;
                }
                if (rule.cssRules && rule.cssRules.length && !rule.selectorText) { walk(rule.cssRules, media); return; }
                if (rule.style && rule.style.position === 'fixed' && rule.selectorText) {
                    rules.push({ selector: rule.selectorText, media: media || '',
                        matched: document.querySelectorAll(rule.selectorText).length });
                }
            });
        };
        [...document.styleSheets].forEach(sheet => {
            let list = null;
            try { list = sheet.cssRules; } catch (error) { list = null; }
            if (list) walk(list, '');
        });
        return {
            ot: window.visualViewport.offsetTop,
            frame: document.body.classList.contains('frame-lowered'),
            lowered: document.body.classList.contains('bars-lowered'),
            sheets: document.styleSheets.length,
            layers: layers.map((layer, i) => ({ label: layer.label,
                moved: Math.round(withDrop[i] - withoutDrop[i]) })),
            rules
        };
    });
    given('stuck and scrolled past the slack', census.ot === SHORT, String(census.ot));
    check('the drop is standing: the bars lowered and the frame with them',
        census.frame && census.lowered, JSON.stringify({ frame: census.frame, lowered: census.lowered }));
    given('the page has fixed layers to count, and stylesheets to read', census.layers.length >= 9 && census.sheets >= 2,
        JSON.stringify({ layers: census.layers.length, sheets: census.sheets }));
    const wrong = census.layers.filter(layer => layer.moved !== SHORT);
    check(`every element whose computed position is fixed is moved by offsetTop (${SHORT}px), exactly once`,
        wrong.length === 0,
        wrong.length ? JSON.stringify(wrong) : census.layers.map(layer => layer.label).join(' | '));
    // Each of the layers the first design and the judge named, by name, so the census above
    // cannot pass by having lost them.
    const kinds = ['nav.tabs', 'div.day-actions', '#undoBar', '#settingsPanel', '#reorderPanel', '#assignSheet',
        '#askModal', '#workerPickerModal', '#sederModal', '#dayDrawerBack', '#dayDrawerWrap', '#pushReminderPending'];
    const missing = kinds.filter(kind => !census.layers.some(layer => layer.label.indexOf(kind) !== -1));
    check('and the census found the bars, the overlays, the seder list and the reminder banner among them',
        missing.length === 0, missing.join(', '));
    const unseen = census.rules.filter(rule => rule.matched === 0);
    check('every stylesheet rule that makes something fixed at this width has an element in the page to measure',
        census.rules.length > 0 && unseen.length === 0,
        unseen.length ? JSON.stringify(unseen) : census.rules.map(rule => rule.selector).join(' | '));
    await page.context().close();

    // The third way a layer becomes fixed: a script that sets it. None does today, and one
    // that did would make a layer no stylesheet rule above names.
    const sources = ['index.html'].concat(...['js', 'js/ui', 'js/model', 'js/sync'].map(dir =>
        readdirSync(new URL(`../${dir}/`, import.meta.url)).filter(file => file.endsWith('.js')).map(file => `${dir}/${file}`)));
    const strip = text => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '')
        .split('\n').map(line => line.replace(/(^|[^:'"\\])\/\/.*$/, '$1')).join('\n');
    const inline = sources.filter(file => {
        const text = strip(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'));
        return /position\s*(?:=|:)\s*['"`]?\s*fixed\b/.test(text)
            || /setProperty\(\s*['"`]position['"`]\s*,\s*['"`]fixed/.test(text);
    });
    given('the scan reached the page and its scripts', sources.length > 30 && sources.indexOf('js/ui/bars.js') !== -1,
        String(sources.length));
    check('and no script or inline style makes a layer fixed behind the stylesheet\'s back',
        inline.length === 0, inline.join(', '));
}

same('no page errors and no native dialog, on any phone above', errors, []);
await browser.close();
await server.close();
report();
