// ---------------------------------------------------------------- the bottom of the screen
//
// Two bars float over the bottom of a phone: the tab bar, and on the day screen the
// copy/WhatsApp pair above it. Everything that scrolls has to clear BOTH, or the last
// worker in the list sits under them - visible, and impossible to tap, because the tap
// lands on the bar instead.
//
// Every version of this that wrote a number into the stylesheet was wrong somewhere. The
// bars are as tall as their contents, and the contents change: two lines of Hebrew on a
// narrow phone and one on a wide one, a longer copy label on a Sunday, a system font
// scaled up by somebody who needs it larger. 150px was right on the phone it was measured
// on and short by twenty on the next.
//
// So they are measured, and what is measured is published as two custom properties that
// the stylesheet adds up. Nothing here decides how much room to leave; it only reports
// how much the bars are actually taking.
function measureBottomBars() {
    // FIRST, because it decides how tall the bars below are about to be. body.day-tight
    // (further down this file) collapses the dock's phrases and the tab bar's words on a
    // screen that cannot hold the crew otherwise, and publishing the heights before that
    // decision would reserve room for a bar that is about to change size - the same
    // one-tick-stale reading scheduleBarMeasure exists to avoid. It publishes too, from
    // the layout it decided against; this call is what puts the chosen one on the page.
    fitDayList();
    publishBars();
}

// The four numbers, read off the page as it stands right now.
//
// IN THIS ORDER, and the order is the arithmetic. The dock is placed at `bottom:
// var(--nav-h)` and the undo bar at `calc(var(--bars-h) + 10px)`, so each one's position
// is a function of the properties written above it. Reading the dock before --nav-h has
// been brought up to date reads it where it USED to be, which is how a bar that had just
// changed height moved the room the page reserves by one whole tick - and, once the day
// could collapse under itself (fitDayList below), flipped the collapse on and off between
// two consistent-looking readings. Each read below forces the layout the write above it
// invalidated, so one pass down this list settles the whole chain.
function publishBars() {
    const root = document.documentElement;
    if (!root || !root.style) return;

    root.style.setProperty('--nav-h', barHeight(document.querySelector('.tabs')) + 'px');
    root.style.setProperty('--day-actions-h',
        barHeight(document.querySelector('.day-actions')) + 'px');
    // THE THIRD BAR. The undo bar floats above the other two - `bottom: calc(var(--bars-h)
    // + 10px)` - and until v104 nothing measured it, so the page reserved room for two
    // bars while three were covering it.
    //
    // Measured, at 320x667 with a home indicator and a crew of thirty: an undo label
    // carrying a long name («הרישום של <שם> נמחק») wraps to three lines, the bar stands
    // 107px tall with its top at y=379, and the last man's row runs 357-423. A tap at the
    // centre of that row hit the undo bar's own text - document.elementFromPoint returned
    // the bar, not the row. The row was on the screen and could not be pressed, which is
    // the exact failure the two measurements above exist to prevent, arriving by a third
    // door. On a wider phone the same label fits one line and the row clears the bar by a
    // single pixel, which is how it went unnoticed: it was never fixed, it was lucky.
    //
    // COVERAGE, not height. The bar carries its own 10px lift above the pair below it, so
    // its height alone under-reports what it is covering by exactly that lift - and the
    // lift is a stylesheet choice this file must not have a copy of. What is measured is
    // the strip of viewport from the bar's top edge to the bottom, which contains the
    // height, the lift and anything else the layout puts between them.
    root.style.setProperty('--undo-h', bottomCoverage(document.getElementById('undoBar')) + 'px');
    // The sticky strip at the top, measured for the same reason the bottom ones are:
    // the day header pins itself right under it, and a written-down height would be
    // wrong on the first phone with a different inset.
    root.style.setProperty('--topbar-h', stickyHeight(document.querySelector('.topbar')) + 'px');
}

// ---------------------------------------------------------------- the crowded day
//
// THE ONE CASE WHERE THE WHOLE SCREEN DOES NOT FIT, and what gives way when it does not.
//
// Measured on this build, 320x667, text at twice its size, a crew of thirty with long
// names: the strip above the day is 119px (the brand line and the sync chip take a second
// row at that size), the folded account warning 113, the day header 276 - 469px of chrome
// - and the dock and the tab bar cover 263 more. 469 + 263 = 732 against a 667px screen.
// Not "a short list": NO whole worker row on the first screen at all, at any of the four
// widths. The design board's 200% artboard (CD320Zoom) shows the ordinary layout with the
// crew on it and the note "everything reflows to height"; at a real 200% it does not, and
// this is the block that says so out loud instead of drawing it.
//
// So there is a second, smaller shape for the day, and body.day-tight turns it on. What it
// collapses is written in the stylesheet, in the order features/compact-shell/findings.md
// sets down: the selected date stays, the recording controls stay, the warning keeps its
// meaning and its action, the last worker stays reachable, and what goes is the SECOND
// COPY of a label a screen reader already has - the tab words, the dock's phrases, the
// words beside the undo arrows. Every one of them stays in the accessibility tree; none of
// them is display:none.
//
// THE DECISION IS MADE FROM THE LAYOUT WITH THE CLASS OFF, ALWAYS, and that is the whole
// reason this reads the way it does. The class SHRINKS the chrome it is measuring; asked
// again with the class on, the same page reports plenty of room, the class comes off, the
// chrome grows back, and the page flickers between two layouts for as long as anybody
// looks at it. A threshold with a gap in it would only make the flicker rarer. So the
// class is taken off, the natural page is measured, and the class is put back if the
// natural page still cannot hold the crew - all inside one frame, before any paint, so
// nothing is ever drawn in the intermediate state.
const TIGHT_ROWS = 2;

// The unit the day is counted in: one worker's row where there is one, and otherwise the
// row that carries the date - which is one 44px target at whatever size the text is set
// to, and is the thing the by-site view has instead of a list of names.
function dayRowUnit() {
    const row = document.querySelector('#dayView .worker-list .wrow');
    if (row) {
        const height = row.getBoundingClientRect().height;
        if (height > 0) return height;
    }
    const nav = document.querySelector('.day-nav');
    const bar = nav ? nav.getBoundingClientRect().height : 0;
    return bar > 0 ? bar : 0;
}

// How much of the FIRST screen is left for the crew: from where the list begins down to
// whatever is covering the bottom of the viewport.
//
// The list's top is taken in DOCUMENT coordinates - its rectangle plus the scroll - so the
// answer is the same whether this is asked before anybody has scrolled or halfway down the
// list. Reading the rectangle alone would report a scrolled page as having acres of room,
// which is exactly the page that has none.
function firstScreenRoom() {
    const first = document.querySelector('#dayView .worker-list .wrow')
        || document.querySelector('#dayView .site-grid .site-card')
        || document.querySelector('#dayView .setup-card');
    if (!first) return null;

    const scrolled = typeof window.scrollY === 'number' ? window.scrollY
        : (document.documentElement ? document.documentElement.scrollTop : 0);
    const top = first.getBoundingClientRect().top + scrolled;

    // The deepest of the two, not their sum: they overlap, and bottomCoverage already
    // answers "how far up from the bottom edge does this one reach".
    //
    // THE UNDO BAR IS DELIBERATELY NOT HERE, and it is the tallest of the three - 266px at
    // 320 with a long name on it, measured. It is also gone twelve seconds later. Counting
    // it made every ✕ on a worker's row take the words off the tab bar for twelve seconds
    // and then put them back, which is churn a person watches rather than room a person
    // gets. What the undo bar covers is already paid for, and paid for the right way: it
    // is measured into --undo-h above and the page's own bottom padding clears it (see
    // .app in the stylesheet), so the last worker stays reachable underneath it without
    // the whole shell changing shape around him.
    const covered = Math.max(
        bottomCoverage(document.querySelector('.tabs')),
        bottomCoverage(document.querySelector('.day-actions')));

    return window.innerHeight - top - covered;
}

function fitDayList() {
    const body = document.body;
    if (!body || !body.classList || typeof window === 'undefined') return;

    // Another screen is up. The answer for the day screen is the last one measured on the
    // day screen; re-deciding it from the reports view would take the class off over a
    // page that has no crew on it and hand it back the moment the day came round again.
    const view = document.getElementById('dayView');
    if (!view || typeof getComputedStyle !== 'function') return;
    if (getComputedStyle(view).display === 'none') return;

    const was = body.classList.contains('day-tight');
    body.classList.remove('day-tight');
    // The bars are a different size without the class, and the dock is placed off a
    // property that says how tall the tab bar is. Publishing here is what makes the two
    // reads below read the natural page rather than the natural bars sitting at the
    // collapsed page's offsets.
    publishBars();

    // Both reads force the layout the removal above invalidated, which is the point: what
    // is being measured is the page as it would be drawn WITHOUT the class.
    const room = firstScreenRoom();
    const unit = dayRowUnit();

    // Nothing to measure - the day is drawn but empty, or the list has no height yet.
    // The last answer stands rather than being replaced by a guess.
    if (room === null || unit <= 0) {
        body.classList.toggle('day-tight', was);
        return;
    }

    body.classList.toggle('day-tight', room < TIGHT_ROWS * unit);
}

// Sticky occupies its strip while stuck; barHeight below deliberately counts only
// `fixed`, so the top bar gets its own reading.
function stickyHeight(node) {
    if (!node || typeof getComputedStyle !== 'function') return 0;
    const style = getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden') return 0;
    if (style.position !== 'sticky' && style.position !== 'fixed') return 0;
    const box = node.getBoundingClientRect();
    return Math.max(0, Math.round(box.height));
}

// How much of the bottom of the viewport this element is covering, or 0.
//
// A bar that is not fixed is not covering anything - on a wide screen the tabs sit in the
// header and take part in the flow like everything else, and counting them there would
// leave a strip of empty page under every screen.
function barHeight(node) {
    if (!node || typeof getComputedStyle !== 'function') return 0;

    const style = getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden') return 0;
    if (style.position !== 'fixed') return 0;

    const box = node.getBoundingClientRect();
    // The measured height already contains the safe-area padding the bar carries, so the
    // stylesheet must not add env(safe-area-inset-bottom) on top of it again.
    return Math.max(0, Math.round(box.height));
}

// How much of the bottom of the viewport this element covers, from its top edge down -
// its own height plus whatever the stylesheet lifted it by. 0 when it is not there.
//
// barHeight above answers a different question and both are needed: a bar sitting ON the
// bottom edge covers exactly its height, and one floating above other bars covers more
// than its height. Asking the height question about a floating bar is how the undo bar
// went unmeasured for four builds.
function bottomCoverage(node) {
    if (!node || typeof getComputedStyle !== 'function') return 0;
    if (typeof window === 'undefined') return 0;

    const style = getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden') return 0;
    if (style.position !== 'fixed') return 0;

    const box = node.getBoundingClientRect();
    if (box.height === 0) return 0;
    // Against innerHeight, which is the layout viewport a fixed element is placed in.
    // visualViewport.height is what the keyboard and a pinch leave visible, and reading it
    // here would make the room the page reserves swing with a gesture - the v99 fault.
    return Math.max(0, Math.round(window.innerHeight - box.top));
}

// The input types a phone opens a keyboard for. Everything else an <input> can be - a
// checkbox, a file picker, a date wheel, a button - takes focus without raising keys.
// An unknown type reads back as 'text', which is what the browser renders it as.
const KEYBOARD_INPUT_TYPES = new Set(['text', 'search', 'tel', 'url', 'email', 'password', 'number']);

// Whether what has focus right now is something a keyboard opens for.
//
// A select is not: iOS raises a picker for it, not keys. A button is not. The body is
// not. Only a text-like input, a textarea, or a contenteditable can have a keyboard
// under it - and so only while one of those is focused can the page be under a keyboard.
function keyboardTarget() {
    if (typeof document === 'undefined') return false;
    const node = document.activeElement;
    if (!node || node === document.body) return false;
    if (node.isContentEditable) return true;
    if (node.tagName === 'TEXTAREA') return true;
    if (node.tagName === 'INPUT') {
        return KEYBOARD_INPUT_TYPES.has(String(node.type || 'text').toLowerCase());
    }
    return false;
}

// How much of the viewport the on-screen keyboard is covering, or 0.
//
// window.innerHeight is the layout viewport, which the iOS keyboard does not shrink -
// dvh and fixed elements are all sized against it and sit on happily under the keys.
// visualViewport.height is what is actually left to see through. A small difference is
// the browser's own chrome sliding around as the page scrolls, not a keyboard, and must
// not start hiding bars; no keyboard is shorter than 150px.
//
// A KEYBOARD NEEDS A FOCUSED EDITABLE. The two heights disagree on a home-screen iPhone
// for reasons that are not a keyboard and that end without a resize event: the share
// sheet or the print sheet over the page, the app backgrounded and brought back, the
// keyboard dismissed with the page scrolled, a layout viewport gone stale. On v98 any
// of those cleared the floor, the bars were hidden, and nothing measured again until a
// resize that never came - the person's day screen ran to the bottom edge with neither
// bar on it, and only killing the app brought them back. So the difference is read only
// while something a keyboard opens for has focus; with nothing editable focused there
// is no keyboard, whatever the numbers say, and the answer is 0.
function keyboardHeight() {
    if (typeof window === 'undefined' || !window.visualViewport) return 0;
    if (!keyboardTarget()) return 0;
    // Pinch-zoom shrinks the visual viewport exactly like a keyboard does, and zoom is
    // deliberately allowed here: at 1.25x on a tall phone the difference already
    // clears the keyboard floor, and the bars would vanish under somebody's zoom.
    if (window.visualViewport.scale > 1.01) return 0;
    const covered = window.innerHeight - window.visualViewport.height;
    return covered > 150 ? Math.round(covered) : 0;
}

// Publishes the keyboard's height as --kb-h and marks the page while one is open.
// Separate from the measuring above so a test can call it with a height of its own -
// headless browsers do not open keyboards. The focus gate lives in keyboardHeight, not
// here, for the same reason: this is the seam, and a seam that asks questions of its
// own is not one a test can push a keyboard through.
//
// kbd-open HIDES the two bottom bars (see the stylesheet) rather than this file doing
// arithmetic around them: hidden bars measure 0 on the very next measureBottomBars call,
// so the room the page reserves for them collapses on its own - which is the point of
// measuring the bars instead of writing their sizes down.
function applyKeyboardInset(pixels) {
    const root = document.documentElement;
    if (!root || !root.style) return;
    const height = Math.max(0, Math.round(pixels) || 0);

    root.style.setProperty('--kb-h', height + 'px');
    if (document.body && document.body.classList) {
        document.body.classList.toggle('kbd-open', height > 0);
    }
}

// Measured after the layout that changed, not during it: a read in the middle of a render
// returns the sizes from before the render, which is how the day screen came to reserve
// room for a bar that had just been hidden.
let barsQueued = false;
function scheduleBarMeasure() {
    if (barsQueued) return;
    barsQueued = true;
    // The keyboard first: whether the bars are hidden under it changes what measuring
    // them is about to find.
    const run = () => {
        barsQueued = false;
        applyKeyboardInset(keyboardHeight());
        measureBottomBars();
    };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
    else setTimeout(run, 0);
}

// One frame later than scheduleBarMeasure. iOS moves the viewport a frame after a field
// lets go of focus; a measurement taken in the frame of the blur itself can read the
// keyboard still there, and then nothing asks again.
function scheduleBarMeasureAfterFrame() {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(scheduleBarMeasure);
    else setTimeout(scheduleBarMeasure, 0);
}

// The bars move for reasons that have nothing to do with a render: the phone is turned,
// the keyboard opens over the page, the browser's own chrome slides away as the page
// scrolls. visualViewport reports the last two; nothing else does.
function watchBottomBars() {
    if (typeof window === 'undefined' || !window.addEventListener) return;

    window.addEventListener('resize', scheduleBarMeasure);
    window.addEventListener('orientationchange', scheduleBarMeasure);
    if (window.visualViewport && window.visualViewport.addEventListener) {
        window.visualViewport.addEventListener('resize', scheduleBarMeasure);
    }
    // keyboardHeight reads what has focus, so a focus change is a measurement too - and
    // it is the one that brings the bars back when the keyboard leaves WITHOUT a resize
    // event, which on a home-screen iPhone is most of the ways it leaves. focusin and
    // focusout bubble; focus and blur do not, and a listener here would never hear them.
    document.addEventListener('focusin', scheduleBarMeasure);
    document.addEventListener('focusout', scheduleBarMeasureAfterFrame);
    // Backgrounded with the keyboard up and brought back without it; restored from the
    // back-forward cache. Neither sends a resize, and both once left the class standing.
    document.addEventListener('visibilitychange', scheduleBarMeasure);
    window.addEventListener('pageshow', scheduleBarMeasure);
    // The failsafe. If kbd-open is standing when the person next touches or scrolls the
    // page, the measurement is asked again; a class the viewport still justifies costs
    // one re-measure, a stale one comes off at the first touch instead of at the next
    // launch. When the class is not standing this is one classList read and nothing else.
    const recheck = () => {
        if (document.body && document.body.classList.contains('kbd-open')) scheduleBarMeasure();
    };
    window.addEventListener('touchstart', recheck, { capture: true, passive: true });
    window.addEventListener('scroll', recheck, { capture: true, passive: true });
    // The VISUAL viewport moving on its own, which the listener above cannot see. On a
    // home-screen iPhone the visual viewport slides inside a layout viewport that has not
    // moved - the keyboard going down with the page scrolled, a zoomed page panned - and
    // that motion fires 'scroll' HERE and nothing on window. Same failsafe shape as the
    // pair above and for the same reason: when the class is not standing this listener
    // reads one classList entry and returns.
    if (window.visualViewport && window.visualViewport.addEventListener) {
        window.visualViewport.addEventListener('scroll', recheck);
    }
    // The undo bar is shown, refilled and hidden by js/ui/undo.js without any of the
    // events above: offerUndo writes a label into it and clears style.display, and twelve
    // seconds later a timer puts it back. Some of those paths are followed by a render
    // (which measures) and some are not, and which is which is not this file's business
    // to know. So the element itself is watched: its label decides its height, and its
    // height decides how much room the list has to leave under it.
    const undoBar = document.getElementById('undoBar');
    if (undoBar && typeof MutationObserver === 'function') {
        new MutationObserver(scheduleBarMeasure).observe(undoBar, {
            attributes: true, attributeFilter: ['style', 'class', 'hidden'],
            childList: true, subtree: true, characterData: true
        });
    }
    // A font that arrives late re-lays the bars out after everything else has settled.
    if (document.fonts && document.fonts.ready && document.fonts.ready.then) {
        document.fonts.ready.then(scheduleBarMeasure).catch(() => {});
    }
    measureBottomBars();
}
