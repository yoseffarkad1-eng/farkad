// A colour per site.
//
// The point is speed of recognition, not decoration: reading down twelve names at
// midnight, the colour says "same site" before the word is read. So the colour has to be
// a property of the SITE and nothing else - fixed for as long as the site exists, never
// reassigned because the list was re-sorted, a site was archived, or a new one was added.
// A colour that moves is worse than no colour, because it is quietly wrong.
//
// It is therefore derived from the site's id, which is issued once and never reused.
//
// Two rules that follow from what the colour is for:
//   - the name is always written out in full; colour narrows the search, text confirms it
//   - the colour never means a state. Red is not a problem and green is not "done" here.
//     Those live in their own places (טרם נרשם stays yellow, absent stays grey).

const SITE_COLOR_COUNT = 10;

// Past ten, added colours are variations of ones already used, and telling them apart at
// night - or with any degree of colour blindness - stops working. So the palette repeats
// and the second lap is marked with a diamond instead.
const SITE_CYCLE_MARK = '◆';

function siteColorSlot(placeId) {
    const match = /^p_(\d+)$/.exec(String(placeId || ''));
    // Ids are sequential, so this hands out the palette in creation order. Anything with
    // an unexpected id still gets a stable colour rather than none.
    const n = match ? Number(match[1]) - 1 : hashString(String(placeId));
    const index = ((n % SITE_COLOR_COUNT) + SITE_COLOR_COUNT) % SITE_COLOR_COUNT;
    return { index, cycle: Math.floor(Math.max(n, 0) / SITE_COLOR_COUNT) };
}

function hashString(value) {
    let hash = 0;
    for (let i = 0; i < value.length; i++) {
        hash = (hash * 31 + value.charCodeAt(i)) % 100000;
    }
    return hash;
}

function siteColorVar(placeId) {
    return `var(--site-${siteColorSlot(placeId).index + 1})`;
}

// Every place the colour is used goes through here, so a site cannot end up one colour in
// the list and another in the sheet.
function paintSite(node, placeId) {
    node.style.background = siteColorVar(placeId);
    node.style.color = '#fff';
    node.style.borderColor = siteColorVar(placeId);
    return node;
}

// The diamond is only shown once the palette has actually wrapped. Marking the first ten
// would be noise - there is nothing yet for them to be confused with.
function siteMark(placeId) {
    return siteColorSlot(placeId).cycle > 0 ? SITE_CYCLE_MARK : '';
}

function appendSiteName(node, placeId, name, markClass) {
    const mark = siteMark(placeId);
    if (mark) node.appendChild(el('span', markClass || 'site-mark', mark));
    node.appendChild(el('span', 'site-name', name));
    return node;
}
