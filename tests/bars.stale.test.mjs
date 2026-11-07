// The frame iOS pushed up (v167), decided in Node, with no browser.
//
//   node tests/bars.stale.test.mjs
//
// THE OWNER'S PHONE, 2 November 2026, 20:37: iPhone 16 Pro Max on the home screen, v165.
// The ⋯ report: window=440x894 visual=440x549 offsetTop=0 focus=body, the tab bar's
// rectangle at the bottom of the LAYOUT viewport (789-894). The screenshot, taken scrolled:
// the tab bar and the dock drawn 345px up, the day list running on beneath them, and the
// sticky date header missing from the top. It lasted until the app was closed.
//
// No browser on this machine can be made to produce that geometry: Chromium has no
// navigator.standalone, and no engine here can be made to push a layout viewport. So the
// decision is taken out of the browser. js/ui/bars.js is loaded, as it is, into a V8
// context whose window, document, navigator and clock are the readings a stuck iPhone
// reports, and the page's own functions are asked what they write. Where a layer lands on
// the glass is WebKit's rule, written once per harness below: a fixed layer is drawn at
// its layout-viewport position MINUS visualViewport.offsetTop, plus whatever the page
// translated it by. That rule is the premise of the fix, checked against the owner's
// screenshot below and against nothing else. NOTHING HERE HAS RUN ON AN IPHONE.
//
// The one thing the premise leaves open is where WebKit measures a client rectangle FROM:
// the layout viewport (the reading this file's first harness uses) or the visual viewport
// (one reading of LocalFrameView::documentToClientOffset). The last suite walks a whole
// stuck scroll under both, and the fix has to land everything on the glass under both.

import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { suite, check, same, given, report } from './runner.mjs';

const SOURCE = readFileSync(new URL('../js/ui/bars.js', import.meta.url), 'utf8');

const IW = 440, IH = 894, SHORT = 345, TABS_H = 105, DOCK_H = 69;
// A dialog anchored 12px down from the top of the layout viewport: the phone padding of a
// top-anchored .modal-content (the judge's probe used the same number).
const DIALOG_TOP = 12;

// A clock and a timer queue the page's setTimeout and requestAnimationFrame both go into.
// wait() moves the clock and runs what is due, again and again, because a timer that fires
// can book a frame (stirViewport's re-ask books scheduleBarMeasure, which books a frame).
function clockwork(start) {
    let clock = start;
    let next = 1;
    const timers = new Map();
    const book = (fn, ms) => { const id = next++; timers.set(id, { fn, at: clock + (ms || 0) }); return id; };
    const run = () => {
        for (let pass = 0; pass < 20; pass += 1) {
            const due = [...timers.entries()].filter(([, t]) => t.at <= clock).sort((a, b) => a[1].at - b[1].at);
            if (!due.length) return;
            due.forEach(([id]) => timers.delete(id));
            due.forEach(([, t]) => t.fn());
        }
    };
    return {
        now: () => clock,
        setTimeout: (fn, ms) => book(fn, ms),
        clearTimeout: id => { timers.delete(id); },
        requestAnimationFrame: fn => book(fn, 0),
        wait: ms => { clock += ms; run(); }
    };
}

function classSet() {
    const classes = new Set();
    return {
        classes,
        classList: {
            contains: name => classes.has(name),
            toggle: (name, on) => { if (on) classes.add(name); else classes.delete(name); return Boolean(on); },
            add: name => classes.add(name),
            remove: name => classes.delete(name)
        }
    };
}

function rootStyleMap() {
    const map = new Map();
    return {
        map,
        style: { setProperty: (k, v) => map.set(k, String(v)), getPropertyValue: k => map.get(k) || '' },
        px: k => parseFloat(map.get(k) || '0') || 0
    };
}

const matrixY = function (value) {
    const m = /matrix\(([^)]+)\)/.exec(String(value));
    const parts = m ? m[1].split(',').map(Number) : [1, 0, 0, 1, 0, 0];
    this.m41 = parts[4]; this.m42 = parts[5];
};

// ---------------------------------------------------------------- one phone, rectangles
//                                                                   from the layout viewport
//
// The readings, the clock, and the two bottom bars as rectangles that move when the page
// translates them - which is all bars.js can see of them - plus a dialog anchored to the
// top of the layout viewport, which is drawn where the frame drop puts it. body.kbd-open
// HIDES both bars (css/app.css), and a hidden bar has no rectangle: the stub draws that
// too, because it is exactly where a decision taken off the bars' rectangles goes wrong.
function phone({ standalone = true } = {}) {
    const time = clockwork(100000);
    const vv = { height: IH, width: IW, scale: 1, offsetTop: 0, offsetLeft: 0, pageTop: 0,
        addEventListener() {}, removeEventListener() {} };
    const root = rootStyleMap();
    const { classes, classList } = classSet();
    const body = { classList, tagName: 'BODY' };
    const barDrop = () => (classes.has('bars-lowered') ? root.px('--bar-drop') : 0);
    const frameDrop = () => (classes.has('frame-lowered') ? root.px('--frame-drop') : 0);
    const keysUp = () => classes.has('kbd-open');
    const none = { top: 0, bottom: 0, height: 0, width: 0, left: 0, right: 0 };
    const bar = (name, height, under) => ({
        name, raise: 0,
        getBoundingClientRect() {
            if (keysUp()) return none;
            const bottom = IH - under() - this.raise + barDrop();
            return { top: bottom - height, bottom, height, width: IW, left: 0, right: IW };
        },
        getClientRects() { return keysUp() ? [] : [this.getBoundingClientRect()]; }
    });
    const tabs = bar('tabs', TABS_H, () => 0);
    const dock = bar('dock', DOCK_H, () => TABS_H);
    const nodes = { '.tabs': tabs, '.day-actions': dock };
    let active = body;
    const document = {
        body,
        documentElement: { style: root.style },
        get activeElement() { return active; },
        visibilityState: 'visible',
        querySelector: selector => nodes[selector] || null,
        querySelectorAll: selector => (nodes[selector] ? [nodes[selector]] : []),
        getElementById: () => null,
        addEventListener() {}
    };
    const sandbox = {
        window: null, document,
        navigator: standalone === 'absent' ? {} : { standalone },
        getComputedStyle: node => ({
            position: 'fixed',
            display: keysUp() ? 'none' : (node === tabs ? 'grid' : 'flex'),
            visibility: 'visible', top: 'auto', translate: 'none',
            transform: barDrop() ? `matrix(1, 0, 0, 1, 0, ${barDrop()})` : 'none'
        }),
        DOMMatrixReadOnly: matrixY,
        Date: { now: time.now },
        setTimeout: time.setTimeout,
        clearTimeout: time.clearTimeout,
        requestAnimationFrame: time.requestAnimationFrame,
        console
    };
    sandbox.window = { innerWidth: IW, innerHeight: IH, visualViewport: vv, addEventListener() {}, scrollY: 0 };
    const ctx = vm.createContext(sandbox);
    vm.runInContext(SOURCE, ctx, { filename: 'js/ui/bars.js' });
    const run = code => vm.runInContext(code, ctx, { filename: 'harness:bars' });
    return {
        vv, tabs, dock, classes, run,
        focus: node => { active = node || body; },
        wait: time.wait,
        stir: kind => run(`typeof stirViewport === 'function' && stirViewport(${JSON.stringify(kind)})`),
        // What a frame of the page runs: scheduleBarMeasure books one, and its frame is due now.
        measure: () => { run('scheduleBarMeasure()'); time.wait(0); },
        has: name => run(`typeof ${name} === 'function'`),
        // Where each layer is ON THE GLASS, by WebKit's rule.
        glassBottom: node => Math.round(node.getBoundingClientRect().bottom - vv.offsetTop),
        dialogTop: () => Math.round(DIALOG_TOP - vv.offsetTop + frameDrop()),
        lowered: () => classes.has('bars-lowered'),
        frameLowered: () => classes.has('frame-lowered'),
        report: () => run(`typeof barDropReport === 'function' ? barDropReport() : null`),
        seen: () => run(`typeof barSeenReport === 'function' ? barSeenReport() : null`)
    };
}

const said = p => JSON.stringify({ ot: p.vv.offsetTop, vh: p.vv.height, report: p.report() });

// ---------------------------------------------------------------- the pure rule
suite('the frame iOS pushed up: the rule, one frame of readings at a time');
{
    const p = phone();
    const exists = p.has('staleInset');
    check('there is a rule that can be asked without a browser (staleInset)', exists, '');
    if (exists) {
        const base = { ih: IH, iw: IW, vh: IH, vw: IW, scale: 1, ot: 0, ol: 0, standalone: true,
            inputView: false, settled: true, armed: false, rectGap: 0 };
        const rows = [
            ['healthy (earlier on 2 Nov: visual 440x894)', {}, false, 0],
            ['STUCK at the top of the page (the 20:37 report)', { vh: 549 }, true, 0],
            ['STUCK scrolled past the slack (the 20:37 screenshot)', { vh: 549, ot: 345 }, true, 345],
            ['STUCK 120px into a scroll down', { vh: 549, ot: 120 }, true, 120],
            ['STUCK, rubber-band above the top', { vh: 549, ot: -20 }, true, 0],
            ['a real keyboard: a text field focused', { vh: 549, ot: 345, inputView: true }, false, 0],
            ['the rate select\'s wheel up', { vh: 600, ot: 294, inputView: true }, false, 0],
            ['the day picker (input type=date) up', { vh: 600, ot: 100, inputView: true }, false, 0],
            ['a hardware keyboard\'s shortcut bar', { vh: 840 }, false, 0],
            ['pinch zoom 1.25x, panned', { vh: 715, vw: 352, scale: 1.25, ot: 120, ol: 40 }, false, 0],
            ['pinch zoom 1.008x - the width gives it away', { vh: 600, vw: 436.5, scale: 1.008, ot: 30 }, false, 0],
            ['the keyboard closing: 80ms after the field let go', { vh: 650, ot: 200, settled: false }, false, 0],
            ['an Android install: navigator.standalone absent', { vh: 549, ot: 200, standalone: undefined }, false, 0],
            ['Safari in a tab: navigator.standalone false', { vh: 549, ot: 345, standalone: false }, false, 0],
            ['a launch glitch: visual viewport near nothing', { vh: 40 }, false, 0],
            ['rotation in progress: the widths disagree', { ih: 440, iw: 956, vh: 400, vw: 440, settled: false }, false, 0],
            ['a missing reading is not a whole viewport (no width)', { vh: 549, ot: 345, vw: undefined }, false, 0],
            ['v116\'s model: the RECTANGLE raised 387, offsetTop 0', { vh: 507, rectGap: 387 }, true, 387],
            ['both models at once, 120 each: 120, never 240', { vh: 549, ot: 120, rectGap: 120 }, true, 120],
            ['never more than the shortfall', { vh: 549, ot: 400 }, true, 345],
            ['armed already: a stir does not take the correction away', { vh: 549, ot: 345, settled: false, armed: true }, true, 345],
            // The judge's second amendment: a field tapped INSIDE the frame the arming holds
            // on the glass - the picker's search box - must not take the arming away, or
            // the dialog it is in jumps 345px up the moment the keys come.
            ['armed already: a text field focused over it keeps it', { vh: 549, ot: 345, inputView: true, armed: true }, true, 345],
            ['armed already, a field focused, and the viewport whole again: off', { vh: IH, ot: 0, inputView: true, armed: true }, false, 0],
            ['armed already, a field focused, and a pinch: off', { vh: 600, vw: 352, scale: 1.25, ot: 120, inputView: true, armed: true }, false, 0]
        ];
        for (const [what, over, armed, drop] of rows) {
            const verdict = JSON.parse(p.run(`JSON.stringify(staleInset(${JSON.stringify({ ...base, ...over })}))`));
            check(`${what}: ${armed ? `armed, drop ${drop}` : 'left alone'}`,
                verdict.armed === armed && verdict.drop === drop, JSON.stringify(verdict));
        }
    }
}

// ---------------------------------------------------------------- the page's own decision
suite('the frame iOS pushed up: what the page writes, on a stuck home-screen iPhone');
{
    // The fixture against the evidence, before anything is asked of the page: the 20:37
    // report's rectangles at offsetTop 0, and - by the glass rule - the screenshot's
    // pixels at offsetTop 345 (tab bar 444-549 and dock 375-444 on the glass: a 921x2000
    // image of a 440x956pt screen, the web view starting 62pt below its top).
    const evidence = phone();
    evidence.vv.height = IH - SHORT;
    given('the 20:37 report: tab bar rectangle 789-894 with visual 440x549 and offsetTop 0',
        Math.round(evidence.tabs.getBoundingClientRect().top) === 789
        && Math.round(evidence.tabs.getBoundingClientRect().bottom) === 894,
        JSON.stringify(evidence.tabs.getBoundingClientRect()));
    evidence.vv.offsetTop = SHORT;
    given('with offsetTop at the shortfall the glass rule draws the bars where the screenshot has them',
        evidence.glassBottom(evidence.tabs) === 549 && evidence.glassBottom(evidence.dock) === 444,
        JSON.stringify([evidence.glassBottom(evidence.tabs), evidence.glassBottom(evidence.dock)]));

    const p = phone();
    p.measure();
    given('healthy: nothing lowered', !p.lowered() && p.glassBottom(p.tabs) === IH, said(p));

    // The keyboard went down and the visual viewport did not come back.
    p.vv.height = IH - SHORT;
    p.stir('focusout');
    p.measure();
    check('the moment the field lets go, nothing is moved: a keyboard going down gets time to say so',
        !p.lowered() && !p.frameLowered(), said(p));
    p.wait(700);
    p.measure();
    check('settled at the top of the page: still nothing moved - the bars ARE on the bottom there',
        !p.lowered() && !p.frameLowered() && p.glassBottom(p.tabs) === IH, said(p));
    check('but the rule has armed, so the scroll that comes next is followed',
        /stale=yes/.test(String(p.report())), said(p));

    p.vv.offsetTop = 120; p.vv.pageTop = 120;
    p.measure();
    check('120px into a scroll down, the tab bar is on the bottom of the glass',
        p.lowered() && p.glassBottom(p.tabs) === IH, JSON.stringify({ glass: p.glassBottom(p.tabs), r: p.report() }));
    check('and the dock sits on the tab bar, not 120px above it',
        p.glassBottom(p.dock) === IH - TABS_H, String(p.glassBottom(p.dock)));
    check('and the rest of the frame comes down with them: a top-anchored dialog starts where it would',
        p.frameLowered() && p.dialogTop() === DIALOG_TOP, String(p.dialogTop()));

    p.vv.offsetTop = SHORT; p.vv.pageTop = 1400;
    p.measure();
    check('scrolled past the slack (the 20:37 screenshot): both bars on the bottom of the glass',
        p.glassBottom(p.tabs) === IH && p.glassBottom(p.dock) === IH - TABS_H,
        JSON.stringify([p.glassBottom(p.tabs), p.glassBottom(p.dock)]));
    p.measure(); p.measure();
    check('asked again and again, the correction does not accumulate',
        p.glassBottom(p.tabs) === IH && p.dialogTop() === DIALOG_TOP,
        JSON.stringify([p.glassBottom(p.tabs), p.dialogTop()]));

    // A stir while armed - a touch on a button, the undo bar - does not take it away.
    p.stir('focusin');
    p.measure();
    check('a stir while armed keeps the bars where they belong', p.glassBottom(p.tabs) === IH,
        String(p.glassBottom(p.tabs)));

    // A REAL keyboard over the armed frame, measured the way the page measures it: the keys
    // hide both bars (kbd-open), so for as long as they are up the tab bar has no rectangle.
    p.focus({ tagName: 'INPUT', type: 'search', id: 'workerPickerSearch' });
    p.stir('focusin');
    p.measure();
    check('a text field focused over the armed frame: the keys hide the bars, as they always have',
        p.classes.has('kbd-open'), said(p));
    check('and the frame stays where it was: the dialog the field is in does not jump 345px up the glass',
        p.frameLowered() && p.dialogTop() === DIALOG_TOP && /stale=yes/.test(String(p.report())),
        JSON.stringify({ dialogTop: p.dialogTop(), r: p.report() }));
    p.focus(null);
    p.stir('focusout');
    p.measure();
    check('let go: the bars are back on the bottom of the glass at once - nothing to settle, it never let go',
        !p.classes.has('kbd-open') && p.lowered() && p.glassBottom(p.tabs) === IH && p.dialogTop() === DIALOG_TOP,
        JSON.stringify({ glass: p.glassBottom(p.tabs), dialogTop: p.dialogTop(), r: p.report() }));

    // The state clears by itself: the visual viewport whole, offsetTop 0.
    p.vv.height = IH; p.vv.offsetTop = 0; p.vv.pageTop = 0;
    p.measure();
    check('the viewport whole again: off in the same frame, no settling',
        !p.lowered() && !p.frameLowered() && p.glassBottom(p.tabs) === IH, said(p));
    const told = String(p.report());
    check('and the ⋯ report says what it did this session: the most it moved, how often it armed, why it is off',
        /^now=0px max=345px stale=no times=1 why=whole frame=0px header=0px$/.test(told), JSON.stringify(told));
    // The judge's fourth amendment: the rectangle's own gap, beside offsetTop. 0 here is the
    // layout-viewport reading; the visual-viewport one reports the gap at offsetTop's size.
    same('and what the frame did while it stood short and still: the shortfall, offsetTop reaching it, the furthest scroll, no gap in the bar\'s rectangle',
        p.seen(), 'short=345 offsetTop=345 pageTop=1400 rectGap=0');
}

suite('the frame iOS pushed up: a real keyboard over a frame that is not armed yet');
{
    const q = phone();
    q.measure();
    // The keys come up over a short frame nobody has called stuck: the input view is a
    // reason for the visual viewport to be short, and it blocks the arming.
    q.focus({ tagName: 'INPUT', type: 'text', id: 'workerFormName' });
    q.stir('focusin');
    q.vv.height = IH - SHORT; q.vv.offsetTop = 200; q.vv.pageTop = 600;
    q.wait(700);
    q.measure();
    check('a text field focused, the visual viewport short by the keys: nothing is moved',
        q.classes.has('kbd-open') && !q.lowered() && !q.frameLowered()
        && /stale=no .*why=input-view/.test(String(q.report())), said(q));
    // The field lets go and the viewport STAYS short: the stuck keyboard.
    q.focus(null);
    q.stir('focusout');
    q.measure();
    check('the moment it lets go, still nothing: a keyboard going down gets time to say so',
        !q.classes.has('kbd-open') && !q.lowered() && !q.frameLowered()
        && /why=settling/.test(String(q.report())), said(q));
    q.wait(700);
    check('and when the frame has stood short and still, the booked re-ask brings both bars to the glass',
        q.lowered() && q.glassBottom(q.tabs) === IH && q.glassBottom(q.dock) === IH - TABS_H
        && q.dialogTop() === DIALOG_TOP, said(q));
}

suite('the frame iOS pushed up: a field tapped inside a dialog the frame holds on the glass');
{
    // The judge's probe (r2/focus.armed.mjs), on this file's harness, which also lets the
    // keys hide the bars. Stuck and scrolled, armed, the worker picker open mid-list; the
    // person taps its search box, types, and lets go. Where is the dialog's top?
    //   v165: -333 throughout. Option A as first written: 12, -333, -333, 12.
    const d = phone();
    d.vv.height = IH - SHORT;
    d.stir('focusout');
    d.wait(700);
    d.vv.offsetTop = SHORT; d.vv.pageTop = 1400;
    d.measure();
    const tops = [d.dialogTop()];
    d.stir('focusin');
    d.focus({ tagName: 'INPUT', type: 'search', id: 'workerPickerSearch' });
    d.measure();
    tops.push(d.dialogTop());
    d.focus(null);
    d.stir('focusout');
    d.wait(100);
    d.measure();
    tops.push(d.dialogTop());
    d.wait(600);
    d.measure();
    tops.push(d.dialogTop());
    same('armed, search tapped, keyboard dismissed, 700ms later: the dialog\'s top stays 12px down the glass',
        tops, [DIALOG_TOP, DIALOG_TOP, DIALOG_TOP, DIALOG_TOP]);
}

suite('the frame iOS pushed up: the same readings, not on an iPhone\'s home screen');
for (const [what, standalone] of [['Safari in a tab', false], ['an Android install', 'absent']]) {
    const p = phone({ standalone });
    p.vv.height = IH - SHORT;
    p.stir('focusout');
    p.wait(700);
    p.vv.offsetTop = SHORT;
    p.measure();
    check(`${what}: nothing is moved`, !p.lowered() && !p.frameLowered(), said(p));
    // ... and what the frame did is still WRITTEN DOWN: it is the evidence a later build
    // needs, whether or not this one acted on it.
    check(`${what}: the short frame is still recorded for the ⋯ report`,
        /^short=345 offsetTop=345 pageTop=\d+ rectGap=\d+$/.test(String(p.seen())), String(p.seen()));
}

// ---------------------------------------------------------------- a whole stuck scroll,
//                                                                   under both rect origins
//
// The push model, as a scroll: P is where the visual viewport's top is in the document, L
// the layout viewport's. The visual viewport is SHORT px shorter, so the layout viewport
// moves only when the visual one runs into one of its edges (WebKit r208213): offsetTop =
// P - L slides from 0 to SHORT over the first SHORT px of a scroll down, and back to 0 over
// the first SHORT px of a scroll up.
//
// The day header is sticky at top 0 against the LAYOUT viewport, HF px down the document.
// With a whole viewport it would be at max(HF - P, 0) on the glass; that is the target.
// Every layer is drawn at its layout-viewport position - offsetTop + its translation; its
// client RECTANGLE is that same position, less offsetTop again when rectangles are measured
// from the visual viewport. The judge's first amendment exists because the header's amount
// was taken off the rectangle as if it were always the first kind (r2/header.world.mjs:
// 60px or 120px off - its own distance down the page - under the second).
function world(origin, HF) {
    const time = clockwork(100000);
    const s = { P: 0, L: 0 };
    const vv = { height: IH - SHORT, width: IW, scale: 1, offsetLeft: 0,
        get offsetTop() { return s.P - s.L; }, get pageTop() { return s.P; },
        addEventListener() {}, removeEventListener() {} };
    const root = rootStyleMap();
    const { classes, classList } = classSet();
    const body = { classList, tagName: 'BODY' };
    const barDrop = () => (classes.has('bars-lowered') ? root.px('--bar-drop') : 0);
    const headerDrop = () => (classes.has('frame-lowered') ? root.px('--header-drop') : 0);
    const fromGlass = () => (origin === 'visual' ? s.P - s.L : 0);
    const HH = 104;
    const tabs = {
        getBoundingClientRect() { const b = IH - fromGlass() + barDrop(); return { top: b - TABS_H, bottom: b, height: TABS_H }; },
        getClientRects() { return [this.getBoundingClientRect()]; }
    };
    const pinnedAt = () => Math.max(HF - s.L, 0);
    const header = {
        getBoundingClientRect() { const t = pinnedAt() - fromGlass() + headerDrop(); return { top: t, bottom: t + HH, height: HH }; },
        getClientRects() { return [this.getBoundingClientRect()]; }
    };
    const nodes = { '.tabs': tabs, '#dayView .day-header': header };
    const document = {
        body, documentElement: { style: root.style }, activeElement: body, visibilityState: 'visible',
        querySelector: q => nodes[q] || null, querySelectorAll: q => (nodes[q] ? [nodes[q]] : []),
        getElementById: () => null, addEventListener() {}
    };
    const sandbox = {
        window: null, document, navigator: { standalone: true },
        getComputedStyle: node => (node === header
            ? { position: 'sticky', display: 'block', visibility: 'visible', top: '0px',
                translate: headerDrop() ? `0px ${headerDrop()}px` : 'none', transform: 'none' }
            : { position: 'fixed', display: 'grid', visibility: 'visible', top: 'auto', translate: 'none',
                transform: barDrop() ? `matrix(1, 0, 0, 1, 0, ${barDrop()})` : 'none' }),
        DOMMatrixReadOnly: matrixY,
        Date: { now: time.now }, setTimeout: time.setTimeout, clearTimeout: time.clearTimeout,
        requestAnimationFrame: time.requestAnimationFrame, console
    };
    sandbox.window = { innerWidth: IW, innerHeight: IH, visualViewport: vv, addEventListener() {},
        get scrollY() { return origin === 'visual' ? s.P : s.L; } };
    const ctx = vm.createContext(sandbox);
    vm.runInContext(SOURCE, ctx, { filename: 'js/ui/bars.js' });
    const run = code => vm.runInContext(code, ctx, { filename: 'harness:world' });
    const scrollTo = P => {
        s.P = P;
        if (P < s.L) s.L = P;
        if (P > s.L + SHORT) s.L = P - SHORT;
    };
    return {
        s, run, wait: time.wait, scrollTo,
        glassTabsBottom: () => IH - (s.P - s.L) + barDrop(),
        glassHeaderTop: () => pinnedAt() - (s.P - s.L) + headerDrop(),
        seen: () => run(`typeof barSeenReport === 'function' ? barSeenReport() : null`)
    };
}

suite('the frame iOS pushed up: a whole stuck scroll, whichever viewport rectangles are measured from');
for (const origin of ['layout', 'visual']) {
    for (const HF of [60, 120]) {
        const w = world(origin, HF);
        w.run("typeof stirViewport === 'function' && stirViewport('focusout')");
        w.wait(700);
        w.run('correctRaisedBars()');
        const path = [];
        for (let P = 0; P <= 1500; P += 5) path.push(P);
        for (let P = 1500; P >= 0; P -= 5) path.push(P);
        for (let P = 0; P <= 600; P += 5) path.push(P);
        let worstBar = { error: 0 };
        let worstHeader = { error: 0 };
        for (const P of path) {
            w.scrollTo(P);
            w.run('correctRaisedBars()');
            const bar = Math.abs(w.glassTabsBottom() - IH);
            const ideal = Math.max(HF - P, 0);
            const head = Math.abs(w.glassHeaderTop() - ideal);
            if (bar > worstBar.error) worstBar = { error: bar, P, offsetTop: w.s.P - w.s.L };
            if (head > worstHeader.error) {
                worstHeader = { error: head, P, offsetTop: w.s.P - w.s.L, drawn: w.glassHeaderTop(), ideal };
            }
        }
        check(`rectangles from the ${origin} viewport, header ${HF}px down: the tab bar on the bottom of the glass all the way (worst error 0)`,
            worstBar.error === 0, JSON.stringify(worstBar));
        check(`rectangles from the ${origin} viewport, header ${HF}px down: the date header where a whole viewport would put it all the way (worst error 0)`,
            worstHeader.error === 0, JSON.stringify(worstHeader));
        // The fourth amendment: the gap the report keeps says which of the two this phone is.
        same(`rectangles from the ${origin} viewport, header ${HF}px down: the ⋯ report's rectGap says which`,
            w.seen(), `short=${SHORT} offsetTop=${SHORT} pageTop=1500 rectGap=${origin === 'visual' ? SHORT : 0}`);
    }
}

report();
