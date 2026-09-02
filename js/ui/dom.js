// Small DOM helpers. Everything here builds nodes and sets textContent rather than
// assembling HTML strings, so a worker or site named with a bracket is text and never
// markup - names are free text typed by a person and end up on screen everywhere.

// Somebody's name, or a site's, dropped into a Hebrew sentence without being reordered
// by it.
//
// The bidi algorithm decides direction per RUN, not per word, so a name that is not
// plain Hebrew - "Ali", "מוחמד 2", a site called "B7", a phone number - is a
// left-to-right run inside a right-to-left sentence, and it slides to wherever the
// algorithm puts it. In practice the name jumps across the verb: "הרישום של Ali 2 נמחק"
// renders with the number and the name on the wrong side of the words around them, and a
// sentence about deleting one man reads as though it is about another. On the undo bar
// that sentence is the only record of what just happened.
//
// U+2068 FIRST STRONG ISOLATE ... U+2069 POP DIRECTIONAL ISOLATE is exactly what <bdi>
// does, in a plain string - which is what these sentences are, all the way through
// offerUndo, askConfirm and every aria-label. Invisible, ignored by screen readers, and
// it travels through textContent unharmed.
function isolate(name) {
    const text = name === null || name === undefined ? '' : String(name);
    return `\u2068${text}\u2069`;
}

function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
}

function button(text, className, onClick, ariaLabel) {
    const node = document.createElement('button');
    node.type = 'button';
    if (className) node.className = className;
    node.textContent = text;
    if (ariaLabel) node.setAttribute('aria-label', ariaLabel);
    node.addEventListener('click', onClick);
    return node;
}

function emptyHint(text) {
    return el('p', 'empty-hint', text);
}

function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
}

const HEBREW_DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

// A minus sign in Hebrew text renders on the WRONG SIDE: the bidi algorithm resolves a
// leading hyphen to the paragraph direction, so "-500" lays out as "500-" and the worker
// reads it backwards on the one number that says money was already taken. The invisible
// left-to-right mark (U+200E) before the sign pins the whole token. Works in DOM text
// and in a WhatsApp message alike, which CSS direction cannot.
function minusAmount(value) {
    // The value as the record holds it, to the agora, NOT rounded to a shekel here. Six
    // surfaces show money and each of them used to round on its own, from the exact
    // value - so 250.5 taken printed as 251 on the screen while the net beside it was
    // computed from 250.5, and the row said 400 − 251 = 150. See moneyOf in
    // js/ui/reports.js: the rounding happens once, and this only draws what it produced.
    const at = Math.round(Number(value) * 100) / 100;
    return '\u200E-' + (Number.isInteger(at) ? at : at.toFixed(2).replace(/0$/, ''));
}

// Any amount that MIGHT be negative goes through here; positives pass untouched.
function bidiAmount(value) {
    return Number(value) < 0 ? minusAmount(Math.abs(Number(value))) : String(value);
}

// A leading plus has the same problem as the minus above - "+2" lays out as "2+" in
// Hebrew text - and the same cure. Not rounded: this one carries hours, not money.
function plusAmount(value) {
    return '\u200E+' + value;
}

// The navigation chevrons, as SVG. They used to be the characters ‹ and › in CSS
// pseudo-elements, and both are Bidi_Mirrored: inside an RTL button the renderer swaps
// the glyphs, so back pointed left and forward pointed right - the source read
// correctly and the pixels were backwards. A drawn path has no bidi class to mirror.
// Back points RIGHT and forward points LEFT, because time flows right-to-left here.
function chevronIcon(direction) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2.4');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', direction === 'back' ? 'M9 6l6 6-6 6' : 'M15 6l-6 6 6 6');
    svg.appendChild(path);
    return svg;
}

// The undo and redo arrows, as SVG, for the same reason as the chevrons above. The
// characters ↶ and ↷ are not Bidi_Mirrored, which here is the OPPOSITE problem: the
// renderer leaves them alone, so ↶ keeps its left-pointing head inside a calendar where
// back in time is RIGHT - the arrow on the undo button pointed the way the redo goes.
// And being emoji-adjacent codepoints, some platforms paint them as coloured glyphs that
// ignore the button's text colour entirely. A drawn path does neither.
// Undo curls back to the RIGHT, redo curls forward to the LEFT.
function stepIcon(direction) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2.4');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    // Two subpaths: the arrowhead, then the arc it rides on. The head sits at the END of
    // the time direction the button moves in - right for undo, left for redo.
    path.setAttribute('d', direction === 'undo'
        ? 'M15 14l5-5-5-5M20 9H9.5A5.5 5.5 0 0 0 4 14.5 5.5 5.5 0 0 0 9.5 20H13'
        : 'M9 14L4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5 5.5 5.5 0 0 1-5.5 5.5H11');
    svg.appendChild(path);
    return svg;
}

// The traditional one-letter weekday marks, for where a whole name cannot fit. NOT the
// first letter of the name - ראשון, שני, שלישי and רביעי would collapse into two
// indistinguishable letters. יום א׳ through שבת is how a Hebrew calendar abbreviates.
const HEBREW_DAY_LETTERS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];

function hebrewDayName(date) {
    return 'יום ' + HEBREW_DAY_NAMES[date.getDay()];
}

function formatFullDate(date) {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${day}/${month}/${date.getFullYear()}`;
}

function todayStr() {
    return toLocalDateStr(new Date());
}
