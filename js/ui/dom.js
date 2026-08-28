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
    return '\u200E-' + Math.round(value);
}

// Any amount that MIGHT be negative goes through here; positives pass untouched.
function bidiAmount(value) {
    return value < 0 ? minusAmount(Math.abs(value)) : String(value);
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
