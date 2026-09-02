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
    const root = document.documentElement;
    if (!root || !root.style) return;

    root.style.setProperty('--nav-h', barHeight(document.querySelector('.tabs')) + 'px');
    root.style.setProperty('--day-actions-h',
        barHeight(document.querySelector('.day-actions')) + 'px');
    // The sticky strip at the top, measured for the same reason the bottom ones are:
    // the day header pins itself right under it, and a written-down height would be
    // wrong on the first phone with a different inset.
    root.style.setProperty('--topbar-h', stickyHeight(document.querySelector('.topbar')) + 'px');
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
    // A font that arrives late re-lays the bars out after everything else has settled.
    if (document.fonts && document.fonts.ready && document.fonts.ready.then) {
        document.fonts.ready.then(scheduleBarMeasure).catch(() => {});
    }
    measureBottomBars();
}
