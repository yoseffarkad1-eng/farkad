// Small DOM helpers. Everything here builds nodes and sets textContent rather than
// assembling HTML strings, so a worker or site named with a bracket is text and never
// markup - names are free text typed by a person and end up on screen everywhere.

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
