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
// The shortest an on-screen keyboard is. Named because two answers below are measured
// against it and a number written twice is a number that gets changed once.
const KEYBOARD_FLOOR = 150;

function keyboardHeight() {
    if (typeof window === 'undefined' || !window.visualViewport) return 0;
    if (!keyboardTarget()) return 0;
    // Pinch-zoom shrinks the visual viewport exactly like a keyboard does, and zoom is
    // deliberately allowed here: at 1.25x on a tall phone the difference already
    // clears the keyboard floor, and the bars would vanish under somebody's zoom.
    if (window.visualViewport.scale > 1.01) return 0;
    // offsetTop is deliberately NOT subtracted here, and IS subtracted by the drop
    // below. A keyboard covers the bottom of the visual viewport, so its height is the
    // difference between the two heights whatever the viewport has been scrolled to;
    // subtracting the scroll as well would read a real keyboard as shorter than it is
    // and, past the floor, as no keyboard at all.
    const covered = window.innerHeight - window.visualViewport.height;
    return covered > KEYBOARD_FLOOR ? Math.round(covered) : 0;
}

// ---------------------------------------------------------------- the bars put back on the bottom
//
// One screenshot from the owner's iPhone 16 Pro Max on v103: both bottom bars drawn
// about 387pt ABOVE the bottom of the screen, with a worker row and the storage notice
// showing in the strip underneath them. The stylesheet cannot produce that geometry -
// .tabs is bottom:0, .day-actions is bottom:var(--nav-h), and no ancestor of either is
// a containing block for fixed descendants. On iOS a `position: fixed` element is
// anchored to the VISUAL viewport, so when the visual viewport is reported short while
// nothing is covering the screen - the share sheet closed, the app brought back from
// the background, a keyboard dismissed with the page scrolled, a stale layout viewport
// - iOS paints both bars at the bottom of a viewport that is not where the screen ends.
//
// This is the residue v99 left, not a return of the v98 fault. v99 was right: a keyboard
// needs a focused editable, and the app stopped HIDING bars on a measurement alone. What
// v99 could not do is tell iOS where to paint a fixed element. So the app cannot stop
// it happening; it has to be correct anyway, and the only correction available is to
// move the bars back down by exactly the amount iOS lifted them.
//
// How far the bottom of the visual viewport sits above the bottom of the layout
// viewport, or 0. offsetTop is the visual viewport's own scroll INSIDE the layout
// viewport, so the bottom edge is offsetTop + height and both terms count.
function viewportShortfall() {
    if (typeof window === 'undefined' || !window.visualViewport) return 0;
    // Every browser without the API renders exactly what it rendered before this
    // existed, and a pinched page is left alone for the reason keyboardHeight gives.
    if (window.visualViewport.scale > 1.01) return 0;
    const gap = window.innerHeight
        - (window.visualViewport.height + (window.visualViewport.offsetTop || 0));
    return gap > 0 ? Math.round(gap) : 0;
}

// How far to lower the bars, or 0.
//
// A KEYBOARD IS ANSWERED BY HIDING, NEVER BY MOVING. The two are mutually exclusive by
// construction rather than by luck: this returns 0 whenever something a keyboard opens
// for has focus, which is the single condition v99 put the hiding behind. A bar lowered
// under a real keyboard is a bar under the keys, which is what hiding them is for.
//
// The floor is the keyboard's floor, and for the same reason: the browser's own chrome
// sliding in and out as the page scrolls is tens of pixels, and a bar that moves while
// a thumb is travelling to it is a missed target. Nothing here ever hides a bar, ever
// reads the page's scroll, and ever moves a bar for any reason but the viewport under
// it having moved first.
//
// The assumption this rests on, named rather than hidden: on a browser that anchors
// `fixed` to the LAYOUT viewport, this state - more than 150px short, nothing focused,
// not zoomed - is not producible. A keyboard there needs focus and closes on blur with
// a resize, and the URL bar's own shrink is far under the floor. If that is ever false
// somewhere, this function is the one line to delete.
function barDrop() {
    if (keyboardTarget()) return 0;
    const gap = viewportShortfall();
    return gap > KEYBOARD_FLOOR ? gap : 0;
}

// Publishes the drop as --bar-drop and marks the page while one stands. Separate from
// the measuring above for the reason applyKeyboardInset is: headless browsers do not
// strand a viewport, and a seam that asks questions of its own is not one a test can
// push a stranded viewport through.
//
// The class carries the rule, not a var() fallback on the transform: with no drop there
// is then no `transform` on any bar at all, so the ordinary case gains no stacking
// context, no compositing layer, and no containing block for fixed descendants - the
// last of which is the very thing that had to be ruled out of every ancestor before this
// fault could be understood.
function applyBarDrop(pixels) {
    const root = document.documentElement;
    if (!root || !root.style) return;
    const drop = Math.max(0, Math.round(pixels) || 0);

    root.style.setProperty('--bar-drop', drop + 'px');
    if (document.body && document.body.classList) {
        document.body.classList.toggle('bars-lowered', drop > 0);
    }
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
        // After the keyboard and before the measuring: the drop is 0 whenever the
        // keyboard is up, and it does not change any bar's HEIGHT - translateY moves a
        // rectangle without resizing it - so what measureBottomBars reads, and the room
        // the page reserves from it, are the same numbers either way. They now describe
        // where the bars are actually painted.
        applyBarDrop(barDrop());
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
        // Its 'scroll' event is deliberately NOT listened to. It fires for every frame of
        // a pinch being panned, measureBottomBars reads three rectangles, and a layout
        // read per frame of a pinch is a cost this file will not pay for a case the zoom
        // guard already answers with 0.
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
    // bars-lowered is asked for the same reason: the gap that lowered them can close
    // without a resize event on exactly the phone that opened it, and a drop that
    // outlives its measurement is the same failure as a class that outlives its keyboard.
    const recheck = () => {
        const marks = document.body && document.body.classList;
        if (marks && (marks.contains('kbd-open') || marks.contains('bars-lowered'))) {
            scheduleBarMeasure();
        }
    };
    window.addEventListener('touchstart', recheck, { capture: true, passive: true });
    window.addEventListener('scroll', recheck, { capture: true, passive: true });
    // A font that arrives late re-lays the bars out after everything else has settled.
    if (document.fonts && document.fonts.ready && document.fonts.ready.then) {
        document.fonts.ready.then(scheduleBarMeasure).catch(() => {});
    }
    measureBottomBars();
}
