// «תצוגה גדולה» - the large display. One switch, per phone, off until somebody turns it on.
//
// The owner, 2026-11-11: one of the three people who use this is 62 and far-sighted, and
// cannot read small text at the distance a phone is held. The other two see well, and
// their screens hold eleven names on purpose (tests/design.browser.mjs). So this is not a
// new default and not a third stylesheet of opinions: it is a mode ONE phone turns on.
//
// WHAT THIS FILE IS. The preference, the class, and the row in ⋯. Nothing else: every
// size, weight, colour and spacing the mode changes is in css/large.css, and every rule
// there is written under the class this file puts on <html>. With the class absent that
// sheet matches nothing, which is the whole of the guarantee that a phone with the mode
// off is the app it was.
//
// IT IS A PREFERENCE OF THIS PHONE AND NOTHING MORE. One key, through Store, beside the
// rides' switch and the day's view mode: never the record, never the outbox, never the
// cloud, never a backup, a restore point or the rescue file (tests/largetext.test.mjs).
// The value is the one byte '1'; anything else - absent, damaged, a disk that will not
// read - is OFF, and nothing is ever written over it or said about it. A lost phone loses
// the choice, and the choice is one tap.
//
// WHY IT LOADS IN THE HEAD, straight after js/store.js. The app had no earlier place where
// a phone's own state is applied: there is no theme switch, and every touch of
// localStorage is Store's (the boot sentinel in index.html is pinned to never touch it).
// So both load in <head>, after the four stylesheets: they run before a single element of
// the body exists - the top bar, the tab bar, the day - so nothing is ever painted small
// and then enlarged. (v191 first loaded them at the end of <body>, after the page's own
// markup, and a browser may paint what it has parsed: on every reload from the service
// worker the strip was drawn small for a frame and then jumped - v191's review. The ear
// beside them in index.html keeps what goes wrong with them for the sentinel.) It reads
// one key and writes none at load, and it calls nothing that is defined below it: the
// row in ⋯ is built at DOMContentLoaded, when js/ui/dom.js and the rides' own row - which
// this one stands before - are in the document.
//
// PROPOSED, NOT APPROVED WORD BY WORD (CLAUDE.md, law 6): the words below are in the
// style of the row above them («הסעות»), and tests/largetext.test.mjs pins every one.
const DISPLAY_LARGE_KEY = 'farkadDisplay:large';
const DISPLAY_LARGE_CLASS = 'display-large';
const DISPLAY_TEXT = Object.freeze({
    title: 'תצוגה גדולה',
    sub: 'אותיות וכפתורים גדולים יותר',
    lead: 'מגדיל את האותיות, המספרים והכפתורים בכל המסכים. פועל במכשיר הזה בלבד.',
    stateOn: 'מופעל במכשיר הזה',
    stateOff: 'כבוי',
    switchOn: 'הפעלת תצוגה גדולה במכשיר הזה',
    switchOff: 'כיבוי תצוגה גדולה במכשיר הזה'
});

let displayLargeOn = null;                    // the switch, once read
let displayHeardWorth = null;                 // what another window of this phone wrote
let displayFollowLater = null;                // the one wait for nobody to be typing

// Read once per session - and moved after that only by a tap here, or by another window
// of this phone (displayHeard, below). Exactly '1' is on; everything else is off.
function displayLarge() {
    if (displayLargeOn === null) {
        let raw = null;
        try { raw = Store.get(DISPLAY_LARGE_KEY); } catch (error) { raw = null; }
        displayLargeOn = raw === '1';
    }
    return displayLargeOn;
}

// The class on <html>, and nothing else. Safe to call at any time, any number of times.
function displayApply() {
    if (typeof document === 'undefined' || !document.documentElement) return false;
    const root = document.documentElement;
    if (!root.classList || !root.classList.toggle) return false;
    root.classList.toggle(DISPLAY_LARGE_CLASS, displayLarge());
    return true;
}

function displaySetLarge(on) {
    // Where the switch is on the glass now: it is where the finger is.
    const anchor = displayAnchor();
    displayLargeOn = Boolean(on);
    // Optional: a preference never reclaims a restore point to make room for itself, and
    // never raises "the disk is full" (js/store.js). A disk that refuses it costs the
    // choice at the next opening and nothing else; the screen is large now either way.
    if (displayLargeOn) Store.setVerified(DISPLAY_LARGE_KEY, '1', { optional: true });
    else Store.remove(DISPLAY_LARGE_KEY);
    displayRedraw();
    displayKeepUnder(anchor);
}

// Every bar is a different height now, and the page's room for them is MEASURED
// (js/ui/bars.js, law 8) - so it is measured again, and the screen drawn again on it.
function displayRedraw() {
    displayApply();
    displayRenderSwitch();
    if (typeof render === 'function') render();
    if (typeof scheduleBarMeasure === 'function') scheduleBarMeasure();
}

// THE SWITCH STAYS UNDER THE FINGER. Everything above the row in ⋯ changes size with the
// tap that pressed it, and the sheet kept its scroll: on the 320px phone the switch went
// from y 434 to 852, off a 568px screen, the confirmation with it, and the row that came
// up under the finger was «תזכורות בטלפון» - a second tap 'to undo' opened the reminders
// (v191's review). So the sheet is scrolled by exactly what the switch moved, and then,
// if the switch or its state line is still past an edge of the sheet, by what brings
// them back. Once now, and once more after the bars are measured again.
function displayAnchor() {
    if (typeof document === 'undefined' || !document.getElementById) return null;
    const toggle = document.getElementById('displayLargeSwitch');
    if (!toggle || !toggle.getClientRects || toggle.getClientRects().length === 0) return null;
    let scroller = null;
    for (let at = toggle.parentElement; at && at !== document.body; at = at.parentElement) {
        const style = getComputedStyle(at);
        if (/auto|scroll/.test(style.overflowY) && at.scrollHeight > at.clientHeight) { scroller = at; break; }
    }
    return { toggle, scroller, top: toggle.getBoundingClientRect().top };
}

function displayKeepUnder(anchor) {
    if (!anchor) return;
    const settle = () => {
        if (!anchor.toggle.isConnected || anchor.toggle.getClientRects().length === 0) return;
        const by = delta => {
            if (!delta) return;
            if (anchor.scroller) anchor.scroller.scrollTop += delta;
            else window.scrollBy(0, delta);
        };
        by(anchor.toggle.getBoundingClientRect().top - anchor.top);
        const view = anchor.scroller ? anchor.scroller.getBoundingClientRect() : { top: 0, bottom: window.innerHeight };
        const top = Math.max(view.top, 0);
        const bottom = Math.min(view.bottom, window.innerHeight);
        const switchBox = anchor.toggle.getBoundingClientRect();
        if (switchBox.bottom > bottom) by(switchBox.bottom - bottom + 8);
        const state = document.getElementById('displayLargeState');
        const stateTop = state ? state.getBoundingClientRect().top : switchBox.top;
        if (stateTop < top) by(stateTop - top - 8);
    };
    settle();
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => requestAnimationFrame(settle));
}

// ANOTHER WINDOW OF THIS PHONE. The choice is the phone's, and the app can be open in two
// windows on one phone - the installed app and a tab - sharing one disk. Read once per
// session, a second window kept the size it opened with, and its row in ⋯ then said the
// opposite of what the phone held: «כבוי» and «הפעלת…» on a phone that was on (v191's
// review). A 'storage' event is how one window hears another write the key; this window
// then follows what the phone holds - at the first moment nobody is typing here and no
// dialog is open (midEdit, js/ui/offline.js), never under a finger - and its row says so.
function displayHeard(event) {
    if (!event || (event.key !== DISPLAY_LARGE_KEY && event.key !== null)) return;
    displayHeardWorth = event.key === null ? null : event.newValue;
    if (displayFollowLater === null) displayFollow();
}

function displayFollow() {
    displayFollowLater = null;
    const held = displayHeardWorth === '1';
    if (held === displayLarge()) return;
    if (typeof midEdit === 'function' && midEdit()) {
        if (displayFollowLater === null) displayFollowLater = setTimeout(displayFollow, 500);
        return;
    }
    displayLargeOn = held;
    // What this window wrote earlier in the session is not what the phone holds now.
    if (typeof Store !== 'undefined' && Store && typeof Store.forget === 'function') Store.forget(DISPLAY_LARGE_KEY);
    displayRedraw();
}

// The picture at the head of the row: a small letter beside a large one. Drawn here, in
// the box and with the stroke every other row's picture has (js/ui/icons.js, card()).
function displayCardIcon() {
    const NS = 'http://www.w3.org/2000/svg';
    const box = document.createElement('span');
    box.className = 'settings-card-icon';
    box.setAttribute('aria-hidden', 'true');
    const svg = document.createElementNS(NS, 'svg');
    [['viewBox', '0 0 24 24'], ['width', '24'], ['height', '24'], ['fill', 'none'], ['stroke', 'currentColor'],
        ['stroke-width', '1.8'], ['stroke-linecap', 'round'], ['stroke-linejoin', 'round']]
        .forEach(([name, value]) => svg.setAttribute(name, value));
    ['M2.5 19 6 10l3.5 9', 'M3.7 16h4.6', 'M11.5 19 16.5 5l5 14', 'M13.3 14h6.4'].forEach(d => {
        const path = document.createElementNS(NS, 'path');
        path.setAttribute('d', d);
        svg.appendChild(path);
    });
    box.appendChild(svg);
    return box;
}

// The row in ⋯: in «כללי», straight BEFORE «הסעות» - the other thing a phone turns on for
// itself - so that the rides' row is still the last of its section, where its own suite
// pins it (tests/transport.browser.mjs). The same thing as every other row of that sheet
// (v172): a <details> whose <summary> is the card head, shut when the sheet opens, opened
// by a tap and by nothing else. Built here because every word on it is one of the words
// above.
function displayInstallSwitch() {
    if (typeof document === 'undefined' || !document.getElementById) return;
    const host = document.getElementById('settingsDailySection');
    if (!host || document.getElementById('displayLargeCard')) return;
    if (typeof el !== 'function' || typeof button !== 'function') return;
    const T = DISPLAY_TEXT;
    const card = el('details', 'settings-group settings-fold display-switch');
    card.id = 'displayLargeCard';
    const head = el('summary', 'settings-card-head');
    head.appendChild(displayCardIcon());
    const titles = el('div');
    titles.appendChild(el('h3', null, T.title));
    titles.appendChild(el('p', 'hint', T.sub));
    head.appendChild(titles);
    card.appendChild(head);
    const body = el('div', 'settings-fold-body');
    const lead = el('p', 'hint', T.lead);
    lead.id = 'displayLargeLead';
    body.appendChild(lead);
    const state = el('p', 'hint settings-status');
    state.id = 'displayLargeState';
    body.appendChild(state);
    const toggle = button('', 'btn-secondary', () => displaySetLarge(!displayLarge()));
    toggle.id = 'displayLargeSwitch';
    body.appendChild(toggle);
    card.appendChild(body);
    // Before the rides' row where there is one; at the end of the section where there is
    // not (that file did not load, or built nothing).
    const rides = document.getElementById('transportSwitchCard');
    if (rides && rides.parentNode === host) host.insertBefore(card, rides);
    else host.appendChild(card);
    displayRenderSwitch();
}

function displayRenderSwitch() {
    if (typeof document === 'undefined' || !document.getElementById) return;
    const toggle = document.getElementById('displayLargeSwitch');
    const state = document.getElementById('displayLargeState');
    if (!toggle || !state) return;
    const on = displayLarge();
    toggle.textContent = on ? DISPLAY_TEXT.switchOff : DISPLAY_TEXT.switchOn;
    toggle.setAttribute('aria-pressed', on ? 'true' : 'false');
    state.textContent = on ? DISPLAY_TEXT.stateOn : DISPLAY_TEXT.stateOff;
}

// At load: the class, from the one preference. Never allowed to throw into the boot - a
// preference that cannot be read is a phone with the mode off, not an app that does not
// start. The row waits for the document.
try {
    displayApply();
    if (typeof document !== 'undefined' && document.addEventListener) {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', displayInstallSwitch);
        else displayInstallSwitch();
    }
    if (typeof window !== 'undefined' && window.addEventListener) window.addEventListener('storage', displayHeard);
} catch (error) {
    if (typeof console !== 'undefined' && console.warn) console.warn('display: not applied', error);
}
