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
    //
    // Where the stylesheet put the bar, NOT where a drop moved it (correctRaisedBars
    // below). The drop puts a bar back where the frame says it is; read with the drop in
    // it, a lowered tab bar covered nothing, the crowded day lost its collapse and the
    // undo bar its room - on the one phone that was already in trouble.
    return Math.max(0, Math.round(window.innerHeight - (box.top - translatedBy(node, style))));
}

// How far a transform has moved this element down the screen, or 0. The bars carry no
// transform of their own; the only one they ever get is the drop below.
function translatedBy(node, style) {
    const value = (style || getComputedStyle(node)).transform;
    if (!value || value === 'none' || typeof DOMMatrixReadOnly !== 'function') return 0;
    try { return new DOMMatrixReadOnly(value).m42 || 0; } catch (error) { return 0; }
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

// ---------------------------------------------------------------- the frame iOS pushed up
//
// THE OWNER'S PHONE, 2 November 2026, 20:37: iPhone 16 Pro Max, home screen, v165. The tab
// bar and the dock drawn a third of the way up the screen with the day list running on
// underneath them, and the ⋯ report copied in the same state:
//     window=440x894  visual=440x549 scale=1.00 offsetTop=0 pageTop=0  focus=body
//     bar.tabs=fixed top=789 bottom=894
// Nothing focused, nothing zoomed, and a visual viewport 345px short - a keyboard's height
// - with no keyboard under it. It lasts until the app is closed.
//
// WHAT iOS DOES WITH THAT. A fixed bar is laid out in the LAYOUT viewport (innerHeight)
// and reports its rectangle there, which is why the report has it at the bottom. WebKit
// moves the layout viewport only when the visual viewport runs into one of its edges (it
// is PUSHED - r208213). With the visual viewport stuck at keyboard height, the first 345px
// of every scroll down slide the visual viewport down inside a layout viewport that stays
// put - offsetTop goes 0 to 345 - and only then does it push the layout viewport along.
// Everything fixed is drawn at its rectangle MINUS offsetTop: at the top of the page,
// where the ⋯ report is copied, the bars are at the real bottom; scrolled, they ride 345px
// up, which is the screenshot. The sticky date header is missing from the top of that
// screenshot for the same reason.
//
// WHY v116 NEVER FIRED. It looked for the raise in the bar's rectangle (innerHeight minus
// rect.bottom). WebKit never puts it there - and v116's other guard subtracted offsetTop,
// so where the bars WERE raised it found no gap at all. Its test raised the bars with a
// stylesheet rule, the one shape a phone never produces.
//
// THE CORRECTION IS offsetTop: moved down by it, a bar drawn at rect - offsetTop lands on
// the glass's own bottom. The bar's own rectangle still counts when it says more (a bar
// whose rectangle is raised is raised - v116's case), never the two added together. It is
// taken only while staleInset below says the frame is stuck, and it comes off, with no
// settling, the moment that stops being true - above all when the visual viewport is
// whole again, which arrives as a visualViewport 'resize'.
//
// IT CANNOT PUSH A HEALTHY BAR OFF THE GLASS. The amount is never more than the shortfall
// and never more than offsetTop (or the rectangle's own gap). Drawn at rect - offsetTop
// (WebKit), the bar lands exactly on the bottom; drawn at the visual viewport's bottom
// (what features/bars-raised assumed), it lands at most on it. With a whole viewport, or
// at the top of the page, the amount is 0.
const STALE_FLOOR = 150;        // the keyboard floor keyboardHeight uses
const STALE_CEILING = 0.7;      // of innerHeight - more is a launch or resume glitch
const STALE_SETTLE_MS = 600;    // longer than a keyboard takes to go down and say so

// Everything an <input> can be that iOS raises NOTHING over the page for. The rest - the
// keys, the wheels, the date picker - shorten the visual viewport for a real reason.
const NO_INPUT_VIEW = new Set(['button', 'submit', 'reset', 'checkbox', 'radio', 'range',
    'image', 'hidden']);

// Whether what has focus raises an input view. WIDER than keyboardTarget(), on purpose:
// that one decides HIDING the bars and leaves a select out so the bars ride above its
// wheel; this one decides whether a short viewport may be called stale, and under a
// wheel it is not.
function inputViewTarget() {
    if (typeof document === 'undefined') return false;
    const node = document.activeElement;
    if (!node || node === document.body || node === document.documentElement) return false;
    if (node.isContentEditable) return true;
    if (node.tagName === 'TEXTAREA' || node.tagName === 'SELECT') return true;
    if (node.tagName === 'INPUT') return !NO_INPUT_VIEW.has(String(node.type || 'text').toLowerCase());
    return false;
}

// THE DECISION, as a function of one frame's readings and nothing else. Every number here
// is one the page reads; the tests hand it the readings no headless browser produces.
//   r.ih, r.iw          innerHeight / innerWidth - the layout viewport
//   r.vh, r.vw, r.scale visualViewport height / width / scale
//   r.ot, r.ol          visualViewport offsetTop / offsetLeft
//   r.standalone        navigator.standalone - true only on an iPhone's home screen
//   r.inputView         inputViewTarget()
//   r.settled           nothing has stirred the viewport for STALE_SETTLE_MS
//   r.armed             what the last decision was: settling and a focused input view
//                       hold a stale frame back from being corrected, neither takes a
//                       correction away
//   r.rectGap           innerHeight minus the tab bar's bottom, the drop taken back out
function staleInset(r) {
    const short = r.ih - r.vh;
    const why = [];
    // display-mode is not enough: an installed Android app shares it, and Chrome draws a
    // fixed bar where its rectangle says.
    if (r.standalone !== true) why.push('not-home-screen');
    // A pinch shortens the visual viewport exactly like a keyboard, and moves offsetTop
    // while it pans. A near-1 scale still gives itself away in the width.
    if (!(Math.abs(r.scale - 1) <= 0.01 && Math.abs(r.iw - r.vw) <= 1 && Math.abs(r.ol) <= 1)) {
        why.push('zoomed');
    }
    if (!(short >= STALE_FLOOR)) why.push('whole');
    else if (!(short <= STALE_CEILING * r.ih)) why.push('implausible');
    // A field focused is a reason for the visual viewport to be short, so it blocks the
    // ARMING. It does not take an arming away (the v167 judge's second amendment): the
    // field is inside the frame the arming holds on the glass - the picker's search box,
    // a dialog's name field - and taking the drop off when it is tapped lifts that dialog
    // offsetTop up the glass under the person's finger, and holds it there until the keys
    // have gone and the settling time has passed (r2/focus.armed.mjs: 12, -333, -333, 12).
    if (r.inputView && !r.armed) why.push('input-view');
    if (why.length) return { armed: false, drop: 0, why: why.join(',') };
    if (!r.armed && !r.settled) return { armed: false, drop: 0, why: 'settling' };
    const amount = Math.max(Number(r.ot) || 0, Number(r.rectGap) || 0);
    return { armed: true, drop: Math.round(Math.max(0, Math.min(short, amount))), why: '-' };
}

let staleArmed = false;
let staleWhy = 'not-measured';
let staleArmings = 0;
let viewportStirredAt = 0;
let viewportStirredBy = 'boot';
let staleTimer = 0;
let barDropNow = 0;
let barDropMax = 0;
// WHAT PUT THE PHONE IN THIS STATE is the one question the 2 November report could not
// answer. So the last thing that raised an input view and let go of it is kept - by its
// SHAPE, tag and type and id and class, never its value - and frozen beside whatever last
// stirred the viewport at each moment the frame is found stuck; the last of them stands.
// In memory only.
let inputViewLeft = '';
let inputViewLeftAt = 0;
let staleTrigger = '-';
// WHETHER THE MODEL ABOVE IS THE PHONE'S. The drop is offsetTop, and offsetTop is the one
// number nobody has yet seen move on the owner's phone: every ⋯ report is copied at the
// top of the page, where it is 0 under this model and under the other. So the largest
// shortfall, the largest offsetTop and the furthest scroll seen while the frame stood
// short and still - nothing focused that raises an input view - are kept for the session,
// whether or not the rule armed. A report after a stuck evening that says the page
// scrolled 2000px while offsetTop never left 0 says the drop has nothing to follow, and
// that the fix is the wrong one; offsetTop at the shortfall says it is the right one.
//
// And beside them the largest gap between the tab bar's rectangle and the bottom of the
// layout viewport, the drop taken back out (the judge's fourth amendment). It says where
// this phone measures a rectangle FROM, which nobody has seen either: 0 is the layout
// viewport, the size of offsetTop is the visual viewport. The header's amount turns on it
// (headerDropFor, below), and so does the reading of every bar.* line in the report.
let seenShort = 0;
let seenOffsetTop = 0;
let seenPageTop = 0;
let seenRectGap = 0;

function noteShortFrame(short, offsetTop, pageTop, rectGap) {
    if (short > seenShort) seenShort = Math.round(short);
    if (offsetTop > seenOffsetTop) seenOffsetTop = Math.round(offsetTop);
    if (pageTop > seenPageTop) seenPageTop = Math.round(pageTop);
    if (rectGap > seenRectGap) seenRectGap = Math.round(rectGap);
}

// Two reads and no layout: whether the visual viewport is short of the layout viewport by
// a keyboard's height right now. For the failsafe below, which must stay cheap.
function viewportShortNow() {
    const viewport = typeof window !== 'undefined' ? window.visualViewport : null;
    return Boolean(viewport) && window.innerHeight - viewport.height >= STALE_FLOOR;
}

// Something that can move the visual viewport, or raise or lower an input view, just
// happened. A stuck phone sends nothing afterwards, so the question is asked again from
// here when the settling time is up, not left to an event that will never come.
function stirViewport(kind) {
    viewportStirredAt = Date.now();
    viewportStirredBy = kind || 'other';
    if (typeof setTimeout !== 'function') return;
    if (staleTimer) clearTimeout(staleTimer);
    staleTimer = setTimeout(() => {
        staleTimer = 0;
        scheduleBarMeasure();
    }, STALE_SETTLE_MS + 40);
}

function noteInputViewLeft(event) {
    const node = event && event.target;
    if (!node || !node.tagName) return;
    const tag = node.tagName;
    const type = tag === 'INPUT' ? String(node.type || 'text').toLowerCase() : '';
    const raises = node.isContentEditable || tag === 'TEXTAREA' || tag === 'SELECT'
        || (tag === 'INPUT' && !NO_INPUT_VIEW.has(type));
    if (!raises) return;
    inputViewLeft = tag + (type ? `[${type}]` : '') + (node.id ? `#${node.id}` : '')
        + (node.className ? '.' + String(node.className).trim().split(/\s+/).join('.') : '');
    inputViewLeftAt = Date.now();
}

function applyBarDrop(pixels) {
    const root = document.documentElement;
    const drop = Math.max(0, Math.round(pixels) || 0);
    const value = drop + 'px';
    if (root.style.getPropertyValue('--bar-drop') !== value) {
        root.style.setProperty('--bar-drop', value);
    }
    document.body.classList.toggle('bars-lowered', drop > 0);
    barDropNow = drop;
    if (drop > barDropMax) barDropMax = drop;
}

function correctRaisedBars() {
    if (typeof window === 'undefined' || !document.body) return;
    // A hidden page is not on the glass; what iOS lays it out at for the app switcher is
    // nobody's screen. Whatever stands, stands until the page is visible again.
    if (document.visibilityState === 'hidden') return;
    const viewport = window.visualViewport;
    const settled = Date.now() - viewportStirredAt >= STALE_SETTLE_MS;
    const inputView = inputViewTarget();
    const offsetTop = viewport ? Number(viewport.offsetTop) || 0 : 0;
    const tabs = document.querySelector('.tabs');
    // Only a bar that floats over the bottom is in the frame; on a wide screen the tabs
    // sit in the header and there is nothing to lower.
    const fixedBar = Boolean(viewport && tabs && getComputedStyle(tabs).position === 'fixed');
    const drawn = fixedBar && barHeight(tabs) > 0;
    // A bar the keys are hiding is still in the frame - body.kbd-open hides both bars (the
    // stylesheet) - it only has no rectangle to read. Called "not floating" for that, the
    // arming went the moment a field was tapped, and with it the drop holding the dialog
    // the field is in on the glass: the half of the second amendment the rule alone
    // cannot see, because the rule is never told the bars are hidden.
    const underKeys = fixedBar && !drawn && document.body.classList.contains('kbd-open');
    // innerHeight minus the tab bar's bottom, the drop taken back out: 0 where rectangles
    // are measured from the layout viewport, offsetTop where they are measured from the
    // visual one, the raise itself in v116's model. Nothing at all without a box.
    const rectGap = drawn
        ? window.innerHeight - (tabs.getBoundingClientRect().bottom - translatedBy(tabs))
        : null;
    if (rectGap !== null && offsetTop >= 1) rectsFromGlass = Math.abs(rectGap - offsetTop) <= 1;
    if (viewport && settled && !inputView
        && window.innerHeight - viewport.height >= STALE_FLOOR) {
        noteShortFrame(window.innerHeight - viewport.height, offsetTop,
            Number(viewport.pageTop) || 0, rectGap === null ? 0 : rectGap);
    }
    if (!drawn && !underKeys) {
        staleArmed = false;
        staleWhy = viewport ? 'no-floating-bar' : 'no-visual-viewport';
        applyBarDrop(0);
        applyFrameDrop(0, 0);
        return;
    }
    const verdict = staleInset({
        ih: window.innerHeight, iw: window.innerWidth,
        vh: viewport.height, vw: viewport.width, scale: viewport.scale,
        ot: viewport.offsetTop, ol: viewport.offsetLeft,
        standalone: typeof navigator !== 'undefined' ? navigator.standalone : undefined,
        inputView,
        settled,
        armed: staleArmed,
        rectGap: rectGap === null ? 0 : rectGap
    });
    if (verdict.armed && !staleArmed) {
        staleArmings += 1;
        const recent = inputViewLeft && Date.now() - inputViewLeftAt < 30000;
        staleTrigger = viewportStirredBy + (recent ? ' after ' + inputViewLeft : '');
    }
    staleArmed = verdict.armed;
    staleWhy = verdict.why;
    applyBarDrop(verdict.drop);
    // The rest of the frame moves by offsetTop alone - no rectangle term: v116's case is a
    // raised BAR, and nothing says a dialog was raised with it.
    const frame = verdict.armed
        ? Math.max(0, Math.min(offsetTop, window.innerHeight - viewport.height))
        : 0;
    applyFrameDrop(frame, frame ? headerDropFor(frame, rectGap) : 0);
}

// ---------------------------------------------------------------- the rest of the frame
//
// THE BARS ARE NOT THE ONLY THING iOS PUSHED. Every layer fixed to the layout viewport is
// drawn offsetTop above where it belongs: the assign sheet, opened from a row half way
// down the list, ends a third of the way up the glass with the list live underneath it -
// a tap below the sheet lands on a row's ✕, not on the backdrop; a dialog anchored to the
// top of a phone starts above the glass with its title; the ⋯ panel, the drawer of days
// and the reorder panel the same. They are moved by the same offsetTop as the bars, by
// the same rule and at the same moment (the stylesheet: body.frame-lowered).
//
// THE DATE HEADER IS STICKY, NOT FIXED, so it is pinned only once the page has scrolled
// past it - and then it is pinned to the top of a layout viewport that is offsetTop above
// the glass, which is why it is missing from the top of the 20:37 screenshot. Where it
// would be with a whole viewport is max(where it is drawn, its pin); the difference is the
// amount, and it is between 0 (not pinned yet: it scrolls with the page, as it should)
// and offsetTop (pinned).
let frameDropNow = 0;
let headerDropNow = 0;
// Whether this phone measures rectangles from the VISUAL viewport, as the tab bar last said
// while it had a box and offsetTop was not 0 (at 0 the two readings agree). For the one
// moment the tab bar cannot say: the keys are up and it is hidden.
let rectsFromGlass = false;

function headerDropFor(offsetTop, tabsGap) {
    const header = document.querySelector('#dayView .day-header');
    if (!header || typeof getComputedStyle !== 'function') return 0;
    const style = getComputedStyle(header);
    if (style.position !== 'sticky' || style.display === 'none') return 0;
    // Another screen is up: the day's header has no box, and nothing to move.
    if (!header.getClientRects().length) return 0;
    const pin = parseFloat(style.top) || 0;
    const top = header.getBoundingClientRect().top - translatePropertyY(style);
    // WHERE IT IS DRAWN, whichever viewport the rectangle is measured from (the v167
    // judge's first amendment). The header's rectangle is in the tab bar's coordinates and
    // the tab bar's gap says which they are: none, and the rectangle is the layout
    // viewport's, so the header is drawn offsetTop above it; offsetTop, and it is the visual
    // viewport's, so the header is drawn where it says. Read as if it were always the first,
    // the header ended up its own distance down the page off the glass under the second
    // (r2/header.world.mjs: 60px or 120px). tests/bars.stale.test.mjs walks both.
    const gap = tabsGap === null || tabsGap === undefined ? (rectsFromGlass ? offsetTop : 0) : tabsGap;
    const shift = Math.max(0, Math.min(offsetTop, gap));
    const glassTop = top - offsetTop + shift;
    return Math.max(0, Math.min(offsetTop, pin - glassTop));
}

// The `translate` property's vertical part. It is a separate property from transform -
// the stylesheet below uses it so as not to replace the drawer's or a sheet's own
// transform - and getComputedStyle reports it separately.
function translatePropertyY(style) {
    const value = style && style.translate;
    if (!value || value === 'none') return 0;
    const parts = String(value).trim().split(/\s+/);
    return parts.length > 1 ? (parseFloat(parts[1]) || 0) : 0;
}

function applyFrameDrop(frame, header) {
    const root = document.documentElement;
    const f = Math.max(0, Math.round(frame) || 0);
    const h = Math.max(0, Math.round(header) || 0);
    if (root.style.getPropertyValue('--frame-drop') !== f + 'px') root.style.setProperty('--frame-drop', f + 'px');
    if (root.style.getPropertyValue('--header-drop') !== h + 'px') root.style.setProperty('--header-drop', h + 'px');
    document.body.classList.toggle('frame-lowered', f > 0 || h > 0);
    frameDropNow = f;
    headerDropNow = h;
}

// For the ⋯ report, which can only be copied at the top of the page - where the drop is
// 0 whether or not it has been working. So it says what it has DONE this session as well.
function barDropReport() {
    return `now=${barDropNow}px max=${barDropMax}px stale=${staleArmed ? 'yes' : 'no'}`
        + ` times=${staleArmings} why=${staleWhy} frame=${frameDropNow}px header=${headerDropNow}px`;
}

function barTriggerReport() {
    return staleTrigger;
}

function barSeenReport() {
    return `short=${seenShort} offsetTop=${seenOffsetTop} pageTop=${seenPageTop} rectGap=${seenRectGap}`;
}

// Only the drop, without measuring the bars again. For the moments that move offsetTop
// and nothing else - the visual viewport sliding inside the layout viewport, a scroll of
// the page while the bars are lowered - where a whole measurement every frame is style
// work the list does not need.
let dropQueued = false;
function scheduleBarDrop() {
    if (dropQueued || barsQueued) return;
    dropQueued = true;
    const run = () => {
        dropQueued = false;
        correctRaisedBars();
    };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
    else setTimeout(run, 0);
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
        correctRaisedBars();
        measureBottomBars();
        // The day list's place, finished now that the page knows how far it can scroll.
        if (typeof settleDayAnchor === 'function') settleDayAnchor();
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

    // Every event below that can change what the viewport is doing also STIRS it
    // (stirViewport, above): a frame found short is not called stuck until nothing has
    // stirred it for STALE_SETTLE_MS, and the re-ask at the end of that time is booked
    // by the stir itself - a stuck phone sends no event to ask it.
    const stirred = (kind, then) => () => { stirViewport(kind); then(); };
    window.addEventListener('resize', stirred('resize', scheduleBarMeasure));
    window.addEventListener('orientationchange', stirred('orientation', scheduleBarMeasure));
    if (window.visualViewport && window.visualViewport.addEventListener) {
        window.visualViewport.addEventListener('resize', stirred('viewport', scheduleBarMeasure));
    }
    // keyboardHeight reads what has focus, so a focus change is a measurement too - and
    // it is the one that brings the bars back when the keyboard leaves WITHOUT a resize
    // event, which on a home-screen iPhone is most of the ways it leaves. focusin and
    // focusout bubble; focus and blur do not, and a listener here would never hear them.
    document.addEventListener('focusin', stirred('focusin', scheduleBarMeasure));
    document.addEventListener('focusout', event => {
        noteInputViewLeft(event);
        stirViewport('focusout');
        scheduleBarMeasureAfterFrame();
    });
    // Backgrounded with the keyboard up and brought back without it; restored from the
    // back-forward cache. Neither sends a resize, and both once left the class standing.
    document.addEventListener('visibilitychange', stirred('resume', scheduleBarMeasure));
    window.addEventListener('pageshow', stirred('pageshow', scheduleBarMeasure));
    // The failsafe. If kbd-open is standing when the person next touches or scrolls the
    // page, the measurement is asked again; a class the viewport still justifies costs
    // one re-measure, a stale one comes off at the first touch instead of at the next
    // launch. When no class stands, nothing is armed and the viewport is whole, this is
    // two classList reads, one flag and two numbers, and nothing else - no layout is read.
    // A standing DROP is asked about too, but only the drop: on the stuck phone it stands
    // for the whole of every scroll, and a whole measurement per frame of it is jank. So
    // is an ARMED rule with nothing lowered yet - the top of the page, where offsetTop is
    // 0 - because the scroll that starts the drop may be the only event that ever comes;
    // and so is a short viewport the rule has not armed for, so that what the frame did
    // while it stood is in the ⋯ report (noteShortFrame) whichever way the rule decided.
    const recheck = () => {
        if (!document.body) return;
        if (document.body.classList.contains('kbd-open')) scheduleBarMeasure();
        else if (document.body.classList.contains('bars-lowered') || staleArmed
            || viewportShortNow()) scheduleBarDrop();
    };
    window.addEventListener('touchstart', recheck, { capture: true, passive: true });
    window.addEventListener('scroll', recheck, { capture: true, passive: true });
    // The VISUAL viewport moving inside the layout viewport, which the listener above
    // cannot see: offsetTop changing, and nothing on window. On the stuck phone that is
    // EXACTLY the motion the drop has to follow - the first 345px of every scroll - so
    // the drop is asked on every one of these, unconditionally. Gating it on a class, as
    // this comment once said it was, would leave the drop nothing to arm it. A standing
    // keyboard is measured whole, as before.
    if (window.visualViewport && window.visualViewport.addEventListener) {
        window.visualViewport.addEventListener('scroll', () => {
            if (document.body && document.body.classList.contains('kbd-open')) scheduleBarMeasure();
            else scheduleBarDrop();
        });
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
    // The page can START inside a stuck frame: the update reload (js/ui/offline.js) runs
    // in the same web view, and a reload does not clear what iOS is holding. Nothing will
    // stir a page that boots into it, so boot stirs it once.
    stirViewport('boot');
    measureBottomBars();
}
