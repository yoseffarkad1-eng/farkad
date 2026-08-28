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

// How much of the viewport the on-screen keyboard is covering, or 0.
//
// window.innerHeight is the layout viewport, which the iOS keyboard does not shrink -
// dvh and fixed elements are all sized against it and sit on happily under the keys.
// visualViewport.height is what is actually left to see through. A small difference is
// the browser's own chrome sliding around as the page scrolls, not a keyboard, and must
// not start hiding bars; no keyboard is shorter than 150px.
function keyboardHeight() {
    if (typeof window === 'undefined' || !window.visualViewport) return 0;
    const covered = window.innerHeight - window.visualViewport.height;
    return covered > 150 ? Math.round(covered) : 0;
}

// Publishes the keyboard's height as --kb-h and marks the page while one is open.
// Separate from the measuring above so a test can call it with a height of its own -
// headless browsers do not open keyboards.
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
    // A font that arrives late re-lays the bars out after everything else has settled.
    if (document.fonts && document.fonts.ready && document.fonts.ready.then) {
        document.fonts.ready.then(scheduleBarMeasure).catch(() => {});
    }
    measureBottomBars();
}
