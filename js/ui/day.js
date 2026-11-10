// The day screen. This is where the work happens.
//
// The manager writes tomorrow's seder in the evening and records what actually happened
// after work - both are one day at a time, never a week. So this screen shows one date,
// the sites running on it, and who was at each.
//
// The default view is BY SITE: a card per site with the people on it, which is how the
// owner thinks about the day - "who is at פרסדיה" - and how the seder is read out on
// WhatsApp. It was BY WORKER for a while, on the theory that the shape of the paper
// being copied from should be the shape of the screen; the paper is gone now and the
// question the screen is opened with is the site one.
//
// By worker, in roster order, is still there and is the better shape for going down a
// list making sure nobody was missed. Reading down a fixed list and reordering it under
// the reader loses their place, so that order never changes - what changes is how an
// unfilled row looks.
//
// Whichever is chosen is remembered: it is a way of working, not a per-visit decision.

const DAY_MODE_KEY = 'farkadDayMode';

let dayMode = Store.get(DAY_MODE_KEY) === 'workers' ? 'workers' : 'sites';

function setDayMode(mode) {
    dayMode = mode;
    Store.set(DAY_MODE_KEY, mode);
    render();
}

// ---------------------------------------------------------------- the header on scroll
//
// Above ON the header is one row; back below OFF it is two. Two numbers rather than one,
// because collapsing the header takes about fifty pixels out of the page and everything
// under it moves up by that much - with a single threshold the page can land back on the
// wrong side of it and toggle again on the next frame, which is a header that flickers
// while a thumb is trying to hit something. The gap between them is wider than the height
// the collapse removes.
const COMPACT_ON = 72;
const COMPACT_OFF = 12;

// THE STATE COMES FROM scrollY AND FROM NOTHING ELSE.
//
// v99 spent a whole round taking a viewport measurement out of the bottom bars: on a
// home-screen iPhone the two viewports can disagree with no resize event to say so, and
// the app read that disagreement as "a keyboard is up" and hid both bars until it was
// killed. A scroll position is not that kind of number - it is reported directly, it is
// never stale, and it comes back down. Nothing here reads a layout, measures a box, or
// asks the visual viewport anything; adding one would be re-opening that fault by
// another door. (dayAnchor, under renderDay, does measure boxes - for another question,
// and only on a render. Its comment says why that is not this fault.)
function readDayScroll() {
    if (typeof document === 'undefined' || !document.body) return;
    const body = document.body;
    const compact = body.classList.contains('day-compact');
    const y = typeof window.scrollY === 'number' ? window.scrollY
        : (document.documentElement ? document.documentElement.scrollTop : 0);
    // Idempotent on purpose: this runs on every scroll event, and a classList write per
    // frame is style work the list does not need. Only a crossing changes anything.
    if (!compact && y > COMPACT_ON) body.classList.add('day-compact');
    else if (compact && y < COMPACT_OFF) body.classList.remove('day-compact');
}

let dayScrollWatched = false;

function watchDayScroll() {
    if (dayScrollWatched || typeof window === 'undefined' || !window.addEventListener) return;
    dayScrollWatched = true;
    // passive: this listener never calls preventDefault, and saying so keeps the scroll
    // off the main thread's critical path on a phone.
    window.addEventListener('scroll', readDayScroll, { passive: true });
}

// THE SECOND TAP OF A DOUBLE TAP IS THE FIRST TAP AGAIN (v166).
//
// The day no longer jumps after a ✕ (renderDay keeps the rows where they were), so the man
// under the one taken off slides up into his row - under the finger - and a double tap, or
// a tap that bounced, took off two men of the same site: measured 120 ms and 400 ms apart
// at three phone sizes (tests/scroll.browser.mjs). The site's picker has the same trap
// without any sliding: «+ הוסף» turns into «✓ נמצא» in place, so the second tap took the
// man straight off again, the undo bar saying he was removed - the owner's own words, "I
// added him twice and he was deleted".
//
// Two more of the same, measured: the ✕ on a chip in «נעדרים», where the next man's chip
// slides into its place and a double tap cancelled two absences; and a site in the tray's
// place picker «לאן הלך», which also turns into its own opposite in place, so a double tap
// put the man on the site and took him off again, leaving him unplaced.
//
// So a row's ✕ that comes less than DOUBLE_TAP_GUARD_MS after the previous row ✕, a
// «נעדרים» ✕ after the previous one, and a picker row or a «לאן הלך» site tapped again
// within it, do NOTHING: no commit, no undo bar, no redraw.
// Measured from the previous activation whether or not that one was let through, so a
// burst of taps is one tap. 700 ms is longer than any double tap or bounce and shorter
// than seeing what the first tap did and deciding on a second man.
const DOUBLE_TAP_GUARD_MS = 700;
const lastTapAt = new Map();

// True when this activation of `key` is the second of a pair and is to be ignored.
function secondTapTooSoon(key) {
    const now = typeof performance !== 'undefined' && performance && typeof performance.now === 'function'
        ? performance.now() : Date.now();
    const last = lastTapAt.get(key);
    lastTapAt.set(key, now);
    return last !== undefined && now - last < DOUBLE_TAP_GUARD_MS;
}

// TRUE WHILE THE DAY IS BEING TAKEN DOWN TO BE DRAWN AGAIN (v166).
//
// The boxes on this screen that are saved on `change` - a site's Rima count, and until
// v167 the extra hours beside a rate (they live in the assign sheet now, which no render of
// the day takes down) - are saved when the person LEAVES them: "1" on its way to
// "12" is nothing anybody recorded. But Chromium (the Galaxy) fires `change` on a focused,
// edited box when the box is taken out of the page, and every render takes the whole day
// out: a snapshot from the other phone, a late echo of this phone's own count. Whatever
// was half-typed was committed by the redraw - the 1 of a 12, a clear while deleting to
// retype, an hour short - sent, billed or paid, and able to replace the other phone's
// count with nothing held. The iPhone simply drops the digits. Both do now: a box taken
// away by a redraw commits nothing, and the box drawn in its place shows what is stored.
let dayTearingDown = false;

// BUILT OFF THE PAGE, SWAPPED IN WHOLE, AND WHAT WAS ON THE SCREEN KEPT WHERE IT WAS (v166).
//
// This used to empty #dayView, append the header alone and then call readDayScroll, whose
// window.scrollY read forced a layout of a page one header tall. The browser clamped the
// scroll to 0 right there, and the compact header went with it. Every commit goes through
// here - a ✕, «בטל», ↶ and ↷, a man added from a site's picker, a site chosen in the tray,
// a rate, a Rima count - and so does every snapshot adopted from the other phone: every
// tap threw the person back to the top of the day, on his iPhone as everywhere. So:
//
//   1. dayAnchor notes where the rows on the screen are, on the page as it still is;
//   2. the whole day is built into a fragment, off the page - nothing has been taken away
//      while it is built, so nothing can be laid out short;
//   3. one swap puts it in, and that is the only moment the old day leaves;
//   4. keepDayAnchor scrolls by however far the first of those rows moved - which is
//      nothing, unless something above the screen grew or shrank (a man added to a site
//      higher up, by this phone or by the other one);
//   5. readDayScroll runs LAST, on the page the person will see.
//
// A new date is not kept: renderProgress sends it to the top on purpose, and dayAnchor
// sees the date change and keeps nothing. Not kept either, still: a Rima box that has the
// focus is a new element after any render, like everything else here.
function renderDay() {
    const root = document.getElementById('dayView');
    if (!root) return;

    pendingDayAnchor = null;
    const anchor = dayAnchor(root);
    const next = document.createDocumentFragment();
    buildDay(next);
    watchDayScroll();
    dayTearingDown = true;
    try {
        swapDay(root, next);
    } finally {
        dayTearingDown = false;
    }
    if (anchor) keepDayAnchor(root, anchor);
    // The day's check, when it is open over this day: it was read off the record that has
    // just been drawn again - a snapshot from another phone, most likely - and a man moved
    // under it must show as moved. It reads; it writes nothing (js/ui/daycheck.js).
    if (typeof renderDayCheckIfOpen === 'function') renderDayCheckIfOpen();
    // Asked again on every render, not only on scroll: a render can arrive with the page
    // already scrolled - coming back to the day from the week, a snapshot landing under a
    // scrolled list - and a header drawn full under a scrolled page is a header that
    // stays full until the next flick.
    readDayScroll();
}

// WHERE THE ROWS ON THE SCREEN ARE, before a render takes them away: up to eight keyed
// nodes (data-anchor - a site's head, a man's row on it, its רימא box, the two trays, a
// row of the by-worker list) showing under the sticky header, top first, each with its top.
//
// This one DOES read a layout, and the rule above readDayScroll is not broken by it. It
// decides nothing about the bars, the keyboard or the header; it only says how far the
// page must scroll to put back what was already on it. It compares a node with ITSELF,
// before and after, in one coordinate space and inside one task, so two viewports that
// disagree (the v99 fault) cancel out of the difference. It reads the page while it is
// still whole - the opposite of the read that clamped the scroll. And it runs on a
// render only, never on scroll.
//
// Nothing to keep at the top of the page, or when the date changed: a new day starts at
// its top (renderProgress).
function dayAnchor(root) {
    if (!(window.scrollY > 0) || lastRenderedDate !== State.date) return null;
    const header = root.querySelector('.day-header');
    const floor = header ? header.getBoundingClientRect().bottom : 0;
    const seen = [];
    for (const node of root.querySelectorAll('[data-anchor]')) {
        const box = node.getBoundingClientRect();
        if (box.height === 0 || box.bottom <= floor) continue;
        if (box.top >= window.innerHeight) break;
        seen.push({ key: node.dataset.anchor, top: box.top });
        if (seen.length >= 8) break;
    }
    return seen.length ? seen : null;
}

// The first of them still on the page goes back to where it was. One that is gone - a
// man taken off by ✕, or by the other phone - is passed over, and the next one is held
// where IT was. Found through a map of the new nodes, not a selector built from the key,
// so no site or worker id ever has to be escaped into CSS.
function keepDayAnchor(root, anchor) {
    pendingDayAnchor = null;
    const now = new Map();
    root.querySelectorAll('[data-anchor]').forEach(node => {
        if (!now.has(node.dataset.anchor)) now.set(node.dataset.anchor, node);
    });
    for (const item of anchor) {
        const node = now.get(item.key);
        if (!node) continue;
        const box = node.getBoundingClientRect();
        if (box.height === 0) continue;
        const delta = box.top - item.top;
        if (Math.abs(delta) < 1) return;
        const want = window.scrollY + delta;
        window.scrollBy(0, delta);
        // Short of it: the page cannot scroll that far yet. The bottom bars are measured a
        // frame AFTER a render (js/ui/bars.js), and a bar that changed height changes how
        // far the page can scroll; settleDayAnchor finishes the job once they have been.
        if (Math.abs(window.scrollY - want) >= 1) pendingDayAnchor = { root, anchor, at: window.scrollY };
        return;
    }
}

// Set by keepDayAnchor when the page fell short; dropped by the next render, and by the
// person's own scroll in between (the page is no longer where it was left).
let pendingDayAnchor = null;

// Called by js/ui/bars.js once the bottom bars have been measured after a render.
function settleDayAnchor() {
    const pending = pendingDayAnchor;
    pendingDayAnchor = null;
    if (!pending || Math.abs(window.scrollY - pending.at) >= 1 || !document.contains(pending.root)) return;
    keepDayAnchor(pending.root, pending.anchor);
    pendingDayAnchor = null;
}

// replaceChildren where there is one (Safari and iOS 14, Chrome 86); before that the same
// two steps by hand. Either way nothing reads a layout between the old day going out and
// the new one coming in, so nothing is ever laid out short.
function swapDay(root, next) {
    if (typeof root.replaceChildren === 'function') {
        root.replaceChildren(next);
        return;
    }
    root.textContent = '';
    root.appendChild(next);
}

// The day itself, into `root` - a fragment, off the page (renderDay).
function buildDay(root) {
    root.appendChild(renderDayHeader());

    // The empty states carry the button that fixes them. Sending someone to another
    // screen to find it is how a first evening ends with a worker added, nothing on the
    // day screen, and no way to tell whether the app is broken or simply not set up.
    if (State.activeWorkers().length === 0) {
        const card = renderSetupCard(
            '👷',
            'ברוך הבא לפרקד',
            'הדבק את רשימת העובדים ואת רשימת האתרים - והאפליקציה מוכנה תוך חצי דקה.',
            '🚀 התחלה מהירה',
            openQuickStart
        );
        // The one-at-a-time door stays open for whoever prefers it.
        card.appendChild(button('+ הוסף עובד אחד', 'btn-secondary setup-alt',
            () => { showView('roster'); showAddWorkerModal(); }));
        root.appendChild(card);
        return;
    }
    if (State.activePlaces().length === 0) {
        root.appendChild(button('הכל חופש', 'btn-secondary day-holiday-action',
            markAllHoliday, 'רשום חופש לעובדים בלי רישום ביום הנבחר'));
        root.appendChild(renderSetupCard(
            '🏗️',
            'עוד אין אתרי עבודה',
            'העובדים כבר קיימים. חסרים האתרים - בלעדיהם אין לאן לשבץ אותם.',
            '+ הוסף אתר',
            () => { showView('roster'); showAddPlaceModal(); }
        ));
        return;
    }

    // The progress rides INSIDE the sticky header, on its tools row - beside undo and
    // redo, not under them. As a second sticky box it spent its scrolled life buried
    // under the header - same top, lower z - and a tap where the count appeared to be
    // landed on "יום הבא". One box cannot bury itself; and one row rather than two is
    // what keeps the header inside the 96-112px the list was promised above it.
    const tools = root.querySelector('.day-tools');
    // The bulk row is built first because its disclosure button lives on the tools row:
    // the fold used to be a 44px row of its own above the list, which on a 320px screen
    // was the difference between three whole names and two.
    const bulk = renderBulkRow();
    // The switcher joins the tools row rather than keeping a row of its own above the
    // list (v101). It costs the header the switcher's height and gives the crew back a
    // whole 48px row plus its margin - and, because the tools row is what compacts away
    // on scroll, it also stops being on the screen at all once the list is moving. That
    // is the right place for it: a way of working is chosen once, not consulted every row.
    if (typeof appendModeSwitch === 'function') appendModeSwitch(tools, bulk);
    tools.appendChild(renderProgress());
    root.appendChild(bulk);

    // «בדיקת היום» (js/ui/daycheck.js): one button at the FOOT of the list, in both views -
    // under the last thing read on the way down and above the dock that sends the day.
    // Not on the header and not on the dock: both are measured to the pixel, and the
    // owner has said the day has enough buttons where the thumb works.
    const check = () => { if (typeof dayCheckEntry === 'function') root.appendChild(dayCheckEntry()); };

    if (dayMode === 'workers') {
        root.appendChild(renderDayWorkerList());
        check();
        return;
    }

    const grid = el('div', 'site-grid');
    State.activePlaces().forEach(place => grid.appendChild(renderSiteCard(place)));
    root.appendChild(grid);
    root.appendChild(renderUnassignedTray(State.unrecorded()));
    root.appendChild(renderAbsentTray());
    const vehicles = renderVehicleTray();
    if (vehicles) root.appendChild(vehicles);
    check();
}

function renderSetupCard(glyph, title, text, label, onClick) {
    const card = el('div', 'setup-card');
    // A glyph the size of an icon, not an illustration: the card is a doorway with one
    // sentence and one button, and anything bigger upstages the button. Hidden from a
    // screen reader - the title says the same thing in words.
    const mark = el('div', 'setup-glyph', glyph);
    mark.setAttribute('aria-hidden', 'true');
    card.appendChild(mark);
    card.appendChild(el('h3', null, title));
    card.appendChild(el('p', null, text));
    card.appendChild(button(label, 'btn-add', onClick));
    return card;
}

// The sticky "now editing" line: which day, and how much of it is done. It stays pinned
// while the list scrolls, because the one input error that actually costs money is a
// day entered against the wrong date - and halfway down a list of names, nothing else
// on screen says what day this is.
let lastRenderedDate = null;

// What the running account still needs, checked every time the app is opened.
//
// Deliberately NOT a push notification. An installed web app on an iPhone cannot
// schedule a local one - there is no API for it - and the alternative is a push server,
// which means a reminder that silently stops the day that server does. Everything below
// is answerable from data already on the device, and it is on the first screen, which is
// where the person already is every evening.
function renderAccountBanner() {
    const banner = document.getElementById('accountBanner');
    if (!banner) return;

    // Hidden AND forgotten, the same pair showStorageBanner keeps: the memo below must
    // not turn the next genuine appearance into silence.
    const hide = () => { banner.style.display = 'none'; delete banner.dataset.drawn; };

    if (State.activeWorkers().length === 0 || State.activePlaces().length === 0) {
        hide();
        return;
    }

    const today = todayStr();
    const start = accountStart(parseLocalDate(today));
    const from = toLocalDateStr(start);
    const end = new Date(start);
    end.setDate(start.getDate() + 13);

    const notes = [];

    // Working days already gone by in this account with nothing on them at all. Saturday
    // is the rest day and today is still being worked on, so neither counts.
    const blank = [];
    for (let offset = 0; offset < 14; offset++) {
        const date = new Date(start);
        date.setDate(start.getDate() + offset);
        if (date.getDay() === 6) continue;

        const value = toLocalDateStr(date);
        if (value >= today) continue;
        if (!anyRecordOn(value)) blank.push(formatShortDate(date));
    }
    if (blank.length > 0) {
        notes.push(blank.length === 1
            ? `יום עבודה אחד בחשבון הנוכחי בלי אף רישום: ${blank[0]}`
            : `${blank.length} ימי עבודה בחשבון הנוכחי בלי אף רישום: ${blank.join(', ')}`);
    }

    // The last two days before settlement, when a correction is still cheap.
    const daysLeft = Math.round((end - parseLocalDate(today)) / 86400000);
    const closing = daysLeft >= 0 && daysLeft <= 2
        ? (daysLeft === 0 ? 'היום' : daysLeft === 1 ? 'מחר' : 'בעוד יומיים')
        : null;
    if (closing) {
        notes.push(`החשבון נסגר ${closing} - בדוק את השכר ושמור קובץ גיבוי.`);
    }

    if (notes.length === 0) { hide(); return; }

    // Dismissed for today, and back tomorrow if it still applies. A notice that cannot
    // be put away is read once and then looked past for good - and this one has to keep
    // working on the day it actually matters.
    const text = notes.join(' · ');
    if (Store.get(ACCOUNT_BANNER_KEY) === todayStr() + '|' + text) {
        hide();
        return;
    }

    // REBUILT ONLY WHEN WHAT IT SAYS HAS CHANGED. clear() and eight appendChilds inside
    // an aria-live region is eight announcements, and render() runs on every tap:
    // measured at 24 mutations across three renders that changed nothing at all. This
    // banner is a financial warning and it earns being heard once, not once per name.
    // Keyed on the fold's posture too, because that is the other thing that changes what
    // is drawn here - and the ✕ hides without forgetting, so a dismissal stays dismissed.
    const drawn = `${text}|${accountOpen}`;
    if (banner.dataset.drawn === drawn && banner.style.display !== 'none') return;
    banner.dataset.drawn = drawn;

    clear(banner);
    // Folded by default: one strong line, the report door and ✕ - a 60px row, not the
    // four lines of prose that used to stand between the top of the screen and the
    // day. The prose is still here, one tap down, and still in the DOM for the checks
    // that read it: a financial warning is never made smaller by hiding what it says,
    // only by saying the short form first.
    banner.classList.add('banner-fold');
    banner.classList.toggle('banner-open', accountOpen);
    const sum = button('', 'banner-sum', () => {
        accountOpen = !accountOpen;
        renderAccountBanner();
    });
    sum.setAttribute('aria-expanded', String(accountOpen));
    sum.setAttribute('aria-controls', 'accountBannerFull');
    const glyph = el('span', 'banner-glyph', '⚠️');
    glyph.setAttribute('aria-hidden', 'true');
    sum.appendChild(glyph);
    sum.appendChild(el('strong', 'banner-summary', accountSummary(blank.length, closing)));
    // The shared back chevron, turned by CSS: down when folded, up when open.
    sum.appendChild(chevronIcon('back'));
    banner.appendChild(sum);
    banner.appendChild(button('לדוחות', 'btn-secondary banner-go', () => showView('reports')));
    banner.appendChild(button('✕', 'btn-icon', () => {
        Store.set(ACCOUNT_BANNER_KEY, todayStr() + '|' + text);
        banner.style.display = 'none';
    }, 'הסתר להיום'));

    const full = el('div', 'banner-full');
    full.id = 'accountBannerFull';
    full.appendChild(el('p', 'banner-text', text));
    const acts = el('div', 'banner-acts');
    acts.appendChild(button('לדוחות', 'btn-secondary', () => showView('reports')));
    // The sentence says "שמור קובץ גיבוי"; this is the same door Settings opens, under
    // the fold's own shorter name - the Settings button's exact label is pinned to that
    // button, and a second element wearing it is two answers to one locator.
    acts.appendChild(button('💾 שמירת גיבוי', 'btn-secondary', () => exportBackup()));
    full.appendChild(acts);
    banner.appendChild(full);
    banner.style.display = '';
}

// Open or folded is a session posture, like the bulk row's: a fresh open starts folded,
// and a render in between (every tap on the list is one) keeps whatever was chosen.
let accountOpen = false;

// The fold's one line. "עדיין פתוח" is the day's state, not an accusation, and "בחשבון
// שנסגר מחר" keeps the deadline on the same line as the debt; the full sentences, with
// the dates, are the text under it.
function accountSummary(blankCount, closing) {
    const open = blankCount === 0 ? ''
        : blankCount === 1 ? 'יום אחד עדיין פתוח' : `${blankCount} ימים עדיין פתוחים`;
    if (open && closing) return `${open} בחשבון שנסגר ${closing}`;
    if (open) return `${open} בחשבון הנוכחי`;
    return `החשבון נסגר ${closing} - בדוק את השכר`;
}

// What was dismissed, and for which day and which message: a NEW warning on the same day
// still gets through, because "two more days missing" is not the notice already waved
// away this morning.
const ACCOUNT_BANNER_KEY = 'farkadAccountNotice';

function anyRecordOn(date) {
    return State.schedule.workers.some(worker =>
        isAbsent(State.schedule, date, worker.id, State.layer) ||
        entriesFor(State.schedule, date, worker.id, State.layer).length > 0);
}

function renderProgress() {
    const workers = State.activeWorkers();
    const left = State.unrecorded().length;
    const done = workers.length - left;
    const date = parseLocalDate(State.date);

    const wrap = el('div', left === 0 ? 'progress progress-done' : 'progress');

    const line = el('div', 'progress-line');
    // Inside the header the date is already on the row above; this copy exists for
    // the ANNOUNCEMENT - the live region reads the whole line, and a count with no
    // day attached answers the wrong question out loud. The stylesheet hides it.
    const now = el('strong', 'now-editing');
    now.textContent = `${hebrewDayName(date)} · ${formatShortDate(date)}`;
    line.appendChild(now);
    // The verb carries the count: "19 מתוך 30" alone reads as a position in a list,
    // and this number is the day's one health figure. A finished day gets the word,
    // not a bigger number - הכל נרשם is the state a manager is scrolling for.
    if (left === 0) {
        line.appendChild(el('span', 'now-count', '✓ הכל נרשם'));
    } else {
        // The count IS the way forward. It used to sit beside a separate המשך button,
        // and the two together were a row the 320px header could not spare; one tap on
        // the number that says how much is left opens the next man who is.
        const count = `נרשמו ${done} מתוך ${workers.length}`;
        line.appendChild(button(count, 'now-count', () => {
            const next = State.unrecorded()[0];
            if (next) openAssignSheet(next.id);
        }, `${count} - המשך אל הבא שטרם נרשם`));
    }
    // Announced politely on change - the day switch and the climbing count are the two
    // things a person not looking at the screen most needs to hear.

    wrap.appendChild(line);

    // OUTSIDE the line, and that is the whole point of these five lines.
    //
    // «הרישום מושבת» used to be the last child of .progress-line - and .progress-line is
    // the element the compact header (v101) and the landscape bar both clip to one pixel
    // once the list is moving. So the moment somebody scrolled, the only thing on the
    // screen saying that this phone is refusing to record anything went away, and the
    // banner that explains WHY had scrolled off the top a moment earlier. A day's work
    // could be tapped in against a screen that looked ordinary.
    //
    // A folded warning is a warning that can be opened again. A clipped one is not. The
    // account notice folds because a person can unfold it; this is not that kind of
    // notice, so it sits on .progress, which survives both states, and the stylesheet
    // keeps it visible in each of them.
    if (typeof farkadWritesBlocked === 'function' && farkadWritesBlocked()) {
        wrap.appendChild(el('span', 'progress-blocked', 'הרישום מושבת'));
    }

    // ANNOUNCED FROM A NODE THAT IS NOT REBUILT.
    //
    // The role="status" and aria-live used to go on `line` - a node built from scratch,
    // filled, and only then inserted, so it was a different node on every render: three
    // distinct .progress-line nodes across three ordinary edits, measured. index.html
    // states the rule about the panel beside the reorder list - "the list is redrawn on
    // every move and a live region that is destroyed and rebuilt is a live region that
    // announces nothing" - and this was the same mistake one screen over, on the region
    // the design leans on hardest: the day switch and the climbing count, which are the
    // two things a person not looking at the screen most needs to hear, and the
    // הרישום מושבת badge, which is the only text anywhere saying writing is held.
    //
    // #dayLive is in index.html and outlives every render. The words are READ OFF the
    // line rather than composed a second time: the line is the visible answer and the
    // two may not drift apart - which is also why the badge is appended above this and
    // not below it. sayOnce (js/sync/status.js) is the guard the storage banner has
    // always had: writing the same sentence again is a change, to a live region.
    sayOnce(document.getElementById('dayLive'), [...line.children, wrap.querySelector('.progress-blocked')]
        .filter(Boolean).map(node => (node.textContent || '').trim()).filter(Boolean).join(' · '));


    const bar = el('div', 'progress-bar');
    const fill = el('div', 'progress-fill');
    fill.style.width = workers.length ? `${Math.round((done / workers.length) * 100)}%` : '0%';
    bar.appendChild(fill);
    wrap.appendChild(bar);

    // Changing day snaps the list back to the top and blinks the date line once - the
    // eye is pulled to WHERE it is about to type. No dialog; a mis-step costs one tap
    // back, not a confirmation on every step.
    if (lastRenderedDate !== null && lastRenderedDate !== State.date) {
        window.scrollTo({ top: 0 });
        wrap.classList.add('now-flash');
    }
    lastRenderedDate = State.date;

    return wrap;
}

// The commonest day of all: the whole crew in one place. That day is ONE tap - the
// site's chip writes every unrecorded worker into it at once. It never touches anyone
// already recorded, and the undo bar takes the whole thing back in one press, so a
// mis-tap costs nothing. Hidden when it could not help (fewer than two people left).
// On a phone the chips fold behind one 44px row. Eight sites of chips stood 268px tall on
// a 320px screen - the third-largest thing on it, above a list it pushed entirely below
// the dock - for a shortcut most evenings never touch.
//
// Open or closed is remembered for the session in a variable, not in storage: it is a
// posture, not a setting, and a fresh open starts compact.
let bulkOpen = false;

function renderBulkRow() {
    const remaining = State.unrecorded();
    if (remaining.length < 2) return el('span');

    const row = el('div', bulkOpen ? 'bulk-row' : 'bulk-row bulk-closed');
    row.id = 'bulkRow';
    // The disclosure control is on the header's tools row (bulkToggle, below): this row
    // is the chips alone, and folded it costs the list nothing at all.

    // Closed is display:none, never out of the DOM. The chips' behaviour is pinned by
    // tests that drive them with element.click(), and a hidden button still clicks - only
    // the layout cost is gone. Above 700px the toggle is what hides instead, and the row
    // reads exactly as it always has.
    const body = el('div', 'bulk-body');
    body.appendChild(el('span', 'bulk-label', `כל ה-${remaining.length} שנותרו ב:`));

    State.activePlaces().forEach(place => {
        const chip = button('', 'bulk-chip', () => bulkAssign(place));
        appendSiteName(chip, place.id, place.name);
        paintSite(chip, place.id);
        body.appendChild(chip);
    });
    row.appendChild(body);

    return row;
}

// The disclosure button, on the tools row beside the switcher: a checklist glyph and the count, labelled
// in full for a screen reader. Only the class changes on tap - no render() - so the list
// under it does not rebuild and the scroll position stays where the thumb left it.
function bulkToggle(row) {
    const remaining = State.unrecorded().length;
    const toggle = button('', 'btn-secondary bulk-toggle', () => {
        bulkOpen = !bulkOpen;
        row.classList.toggle('bulk-closed', !bulkOpen);
        toggle.setAttribute('aria-expanded', String(bulkOpen));
    }, `פעולות מרוכזות (${remaining})`);
    toggle.setAttribute('aria-expanded', String(bulkOpen));
    toggle.setAttribute('aria-controls', 'bulkRow');
    toggle.appendChild(bulkIcon());
    toggle.appendChild(el('span', 'bulk-count', String(remaining)));
    return toggle;
}

// Three ticked lines - drawn, like every other glyph on the header, so it takes the
// button's colour and no platform paints it as a coloured emoji.
function bulkIcon() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.9');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M4 6l1.5 1.5L8 5M11 6.5h9M4 12l1.5 1.5L8 11M11 12.5h9M4 18l1.5 1.5L8 17M11 18.5h9');
    svg.appendChild(path);
    return svg;
}

function bulkAssign(place) {
    const workers = State.unrecorded();
    if (workers.length === 0) return;

    const date = State.date;
    const changes = workers.map(worker =>
        assignPlace(State.schedule, date, worker.id, 'actual', place.id, RATE_NORMAL));
    // Kept in the journal by the disk guard, it is an edit all the same, and the step
    // behind it is not the last one - see editWithUndo.
    if (!State.commitMany(changes)) {
        if (State.lastCommitKept) hideUndo();
        return;
    }

    offerUndo(`${workers.length} עובדים נרשמו ב${isolate(place.name)}`, () => {
        State.commitMany(workers.map(worker =>
            clearWorkerDay(State.schedule, date, worker.id, 'actual')));
    });
}

// ---------------------------------------------------------------- days drawer
//
// Behind the ☰: the account fortnight as the owner runs it, not calendar weeks. An
// account is fourteen days, Friday through Thursday twice - twelve worked, Saturdays
// left out entirely, because a rest day in a list of working days is a row somebody
// taps by mistake. The running account is shown whole, first working Friday down to
// its last Thursday, with the account before it underneath for late corrections. A
// jump-to-today on top, full day names throughout.

// THE SAME KEYBOARD CONTRACT AS EVERY OTHER DIALOG IN THE APP.
//
// This was the one that had only half of it. Escape closed it and nothing else was true:
// focus never entered, so pressing ☰ moved a reader nowhere and the next Tab went to the
// tab bar BEHIND the panel that had just opened; Tab was not held, so it walked out into
// the day list; and closing returned the keyboard to <body> rather than to the ☰.
//
// settingsPanel and reorderPanel are not .modal elements either, and both do this by
// hand. The two pieces that matter are already written once, in js/ui/modal.js, so this
// borrows them rather than growing a third copy: focus enters at the heading (a reader is
// told where it has arrived before it is read twenty-four dates), and trapTab keeps it
// there. The other half - a CLOSED drawer being genuinely absent rather than parked off
// the edge - is in css/app.css, on .day-drawer, and says so there.
let drawerOpener = null;

function openDayDrawer() {
    // Remembered BEFORE the drawer can take focus off it. document.activeElement after a
    // real tap is the ☰ on a desktop and <body> on iOS, which is why there is a fallback
    // rather than a stored node: the way back has to exist either way.
    drawerOpener = document.activeElement;

    renderDayDrawer();
    ['dayDrawer', 'dayDrawerBack', 'dayDrawerWrap'].forEach(id =>
        document.getElementById(id).classList.add('drawer-open'));
    document.addEventListener('keydown', drawerKeydown);

    const drawer = document.getElementById('dayDrawer');
    const title = document.getElementById('dayDrawerTitle');
    // The class has to be IN EFFECT before the focus call: a visibility:hidden element
    // cannot take focus, and the style has only been asked for, not computed. Reading a
    // layout property forces that, and it is one read on a tap.
    if (drawer) void drawer.offsetHeight;
    // preventScroll for the same reason the modal helper gives: the heading is at the top
    // and a focus that scrolls the panel is the bug, not the fix.
    if (title && title.focus) title.focus({ preventScroll: true });
}

function closeDayDrawer() {
    ['dayDrawer', 'dayDrawerBack', 'dayDrawerWrap'].forEach(id =>
        document.getElementById(id).classList.remove('drawer-open'));
    document.removeEventListener('keydown', drawerKeydown);

    const opener = (drawerOpener && document.contains(drawerOpener))
        ? drawerOpener : document.querySelector('.day-nav .drawer-btn');
    drawerOpener = null;
    if (opener && opener.focus) opener.focus();
}

function drawerKeydown(event) {
    if (event.key === 'Escape') { event.preventDefault(); closeDayDrawer(); return; }
    if (event.key !== 'Tab') return;
    const drawer = document.getElementById('dayDrawer');
    if (drawer && typeof trapTab === 'function') trapTab(event, drawer);
}

function renderDayDrawer() {
    const list = document.getElementById('dayDrawerList');
    if (!list) return;
    clear(list);

    const today = todayStr();

    // Straight back to today, from wherever the record-fixing wandered off to.
    const back = button(`חזרה להיום · ${formatShortDate(parseLocalDate(today))}`,
        'btn-secondary drawer-today', () => {
            closeDayDrawer();
            hideUndo();
            State.date = today;
            render();
        });
    list.appendChild(back);

    const currentStart = accountStart(parseLocalDate(today));
    drawerWeek(list, 'החשבון הנוכחי', currentStart, today);
    const previousStart = new Date(currentStart);
    previousStart.setDate(currentStart.getDate() - 14);
    drawerWeek(list, 'החשבון הקודם', previousStart, today);
}

function drawerWeek(list, title, start, today) {
    list.appendChild(el('h4', 'drawer-week-title', title));
    const workers = State.activeWorkers();

    for (let offset = 0; offset < 14; offset++) {
        const date = new Date(start);
        date.setDate(start.getDate() + offset);
        if (date.getDay() === 6) continue;   // Saturday is not a working row

        const value = toLocalDateStr(date);
        const done = workers.filter(worker =>
            isAbsent(State.schedule, value, worker.id, 'actual') ||
            entriesFor(State.schedule, value, worker.id, 'actual').length > 0).length;

        const status = workers.length === 0 || done === 0 ? 'dd-none'
            : done < workers.length ? 'dd-part' : 'dd-full';

        const row = button('', `drawer-day ${status}`, () => {
            closeDayDrawer();
            hideUndo();
            State.date = value;
            render();
        });
        if (value === State.date) row.classList.add('dd-on');

        const name = el('span', 'dd-name', hebrewDayName(date));
        if (value === today) name.appendChild(el('span', 'badge dd-today', 'היום'));
        row.appendChild(name);
        row.appendChild(el('span', 'dd-date', formatShortDate(date)));

        const countText = workers.length === 0 ? ''
            : done === workers.length ? `✓ ${done}/${workers.length}`
                : `${done}/${workers.length}`;
        row.appendChild(el('span', 'dd-count', countText));

        list.appendChild(row);
    }
}

function renderDayWorkerList() {
    const list = el('div', 'worker-list');

    State.workersForDay(State.date, State.layer).forEach(worker => {
        const absent = isAbsent(State.schedule, State.date, worker.id, State.layer);
        const entries = entriesFor(State.schedule, State.date, worker.id, State.layer);
        const empty = !absent && entries.length === 0;

        const row = el('div', empty ? 'wrow wrow-empty' : absent ? 'wrow wrow-absent' : 'wrow');
        row.dataset.anchor = 'w:' + worker.id;

        // The whole row is the target. On a phone a name-sized tap area is a miss
        // waiting to happen, and this row gets tapped thirty times an evening.
        const main = document.createElement('button');
        main.type = 'button';
        main.className = 'wrow-main';
        main.addEventListener('click', () => openAssignSheet(worker.id));

        const nameCell = el('span', 'wrow-name', worker.name);
        if (worker.active === false) nameCell.appendChild(el('span', 'badge', 'לא פעיל'));
        main.appendChild(nameCell);

        const value = el('span', 'wrow-value');
        if (absent) {
            value.appendChild(el('span', 'tag tag-absent', 'נעדר'));
        } else if (entries.length === 0) {
            value.appendChild(el('span', 'tag tag-empty', 'טרם נרשם'));
        } else {
            const labels = placeLabelsIn(State.schedule);
            entries.forEach(entry => {
                const tag = el('span', 'tag tag-place');
                appendSiteName(tag, entry.placeId, placeLabelFrom(labels, entry.placeId));
                paintSite(tag, entry.placeId);

                const rate = entryRate(entry);
                if (rate === RATE_DOUBLE) tag.appendChild(el('span', 'tag-rate', 'כפול'));
                else if (rate === RATE_EXTRA) {
                    const hours = entryExtraHours(entry);
                    tag.appendChild(el('span', 'tag-rate', hours ? plusAmount(hours) : 'נוספות'));
                }
                value.appendChild(tag);
            });
        }
        main.appendChild(value);
        row.appendChild(main);

        if (!empty) {
            row.appendChild(button('✕', 'btn-icon', () => {
                // The second tap of a double tap is the first one again (secondTapTooSoon).
                if (secondTapTooSoon('row-remove')) return;
                // One tap on one row out of twelve, on a phone, at night. It will be the
                // wrong row sometimes, so it is undoable rather than guarded by a dialog.
                editWithUndo(worker.id, `הרישום של ${isolate(worker.name)} נמחק`,
                    () => clearWorkerDay(State.schedule, State.date, worker.id, State.layer));
            }, `נקה את ${isolate(worker.name)}`));
        }

        list.appendChild(row);
    });

    return list;
}

// Two rows, not four. The list is what this screen is FOR, and every centimetre of
// chrome above it is a centimetre of scrolling before the first name.
function renderDayHeader() {
    const header = el('div', 'day-header');
    const date = parseLocalDate(State.date);

    const nav = el('div', 'day-nav');

    // The ☰ sits in the header, not on the progress bar: the header exists on an empty
    // app too, and a door that is only there once you have furniture is a door nobody
    // finds. First child, so it holds the start corner on every visit.
    nav.appendChild(button('☰', 'btn-icon drawer-btn', openDayDrawer, 'בחר יום'));

    // Time flows right-to-left on an RTL calendar, so back points RIGHT and forward
    // points LEFT - drawn as SVG (chevronIcon), because the characters ‹ › are
    // Bidi_Mirrored and rendered backwards inside these RTL buttons.
    //
    // "קודם" and not "יום קודם": the word יום appeared three times on this one line, and
    // the two copies on the buttons were costing the day name sixty pixels it did not
    // have. The full wording stays as the label a screen reader announces.
    //
    // The word is in a span of its own, like the words beside the undo arrows: on the
    // narrowest phone, and on any screen the day has had to collapse on (body.day-tight),
    // the stylesheet drops the two words and keeps the chevrons, which hands the date back
    // eighty pixels of a three-hundred-pixel row. Measured at 320: the pair of pills took
    // 116px of the 304 the row has and the date had 127 - the two ways of LEAVING this day
    // were as big as the day itself. The aria-labels below carry the full sentence either
    // way, so nothing a screen reader says changes.
    const back = button('', 'btn-secondary btn-nav nav-back', () => stepDay(-1), 'יום קודם');
    back.appendChild(chevronIcon('back'));
    back.appendChild(el('span', 'nav-word', 'קודם'));
    nav.appendChild(back);

    // The title IS the date picker. A second full-width input row said the same date
    // twice - once as 12/08 and once as the browser's 08/12, which read as a bug.
    const label = document.createElement('button');
    label.type = 'button';
    label.className = 'day-label';
    label.setAttribute('aria-label', 'בחר תאריך');
    label.appendChild(el('strong', null, hebrewDayName(date)));
    label.appendChild(el('span', 'day-date', formatFullDate(date)));
    label.addEventListener('click', () => openDayPicker());
    nav.appendChild(label);

    const fwd = button('', 'btn-secondary btn-nav nav-fwd', () => stepDay(1), 'יום הבא');
    fwd.appendChild(el('span', 'nav-word', 'הבא'));
    fwd.appendChild(chevronIcon('fwd'));
    nav.appendChild(fwd);
    header.appendChild(nav);

    const picker = document.createElement('input');
    picker.type = 'date';
    picker.id = 'dayPicker';
    picker.className = 'day-picker-input';
    picker.value = State.date;
    picker.setAttribute('aria-hidden', 'true');
    picker.tabIndex = -1;
    picker.addEventListener('change', () => {
        // hideUndo like every other way of leaving the day: the armed undo restores
        // into the day it was made on, and firing it while another day is on screen
        // reads as "undo is broken" while it silently rewrites the day just left.
        if (picker.value) { hideUndo(); State.date = picker.value; render(); }
    });
    header.appendChild(picker);

    const tools = el('div', 'day-tools');

    // One step back, and one forward again, always in the same corner. The undo bar says
    // what happened at the moment it happens; these are for the mistake noticed a name or
    // two later. Both are labelled: a bare ↶ on a phone header is a symbol people guess
    // at, and the guess is not worth making over a day's pay.
    //
    // They sit on the tools row rather than beside the date, because six controls on one
    // line left the day name about sixty pixels to render "יום ראשון" in - and an
    // unbreakable Hebrew word does not fold, it spills sideways across whatever is next
    // to it. The row above is now only the date and the two ways to move it.
    const steps = el('div', 'day-steps');

    // The arrows are drawn (stepIcon in dom.js), not the characters ↶ ↷: those keep
    // their left/right heads regardless of direction, so the undo arrow pointed the way
    // redo goes on this right-to-left calendar. The WORDS stay beside them.
    // The WORDS are in a span of their own: on the narrowest phone, on a day that is not
    // today, "היום" joins this row and the count beside it would have to give way - so
    // there, and only there, the stylesheet keeps the arrows and drops the words. The
    // aria-labels carry the full sentence either way.
    const undoBtn = button('', 'btn-secondary step-btn', runUndo, 'אין מה לבטל');
    undoBtn.id = 'undoBtn';
    undoBtn.disabled = true;
    undoBtn.appendChild(stepIcon('undo'));
    undoBtn.appendChild(el('span', 'step-word', 'בטל'));
    steps.appendChild(undoBtn);

    // A thin wall between them: undo and redo are opposites, and a redo mis-tap right
    // after an undo tap re-makes the exact mistake the undo was for. Six pixels of gap
    // is not a decision; a drawn line is.
    const wall = el('span', 'bar-div');
    wall.setAttribute('aria-hidden', 'true');
    steps.appendChild(wall);

    const redoBtn = button('', 'btn-secondary step-btn', runRedo, 'אין מה לבצע שוב');
    redoBtn.id = 'redoBtn';
    redoBtn.disabled = true;
    redoBtn.appendChild(stepIcon('redo'));
    redoBtn.appendChild(el('span', 'step-word', 'שוב'));
    steps.appendChild(redoBtn);

    // "היום" joins them rather than standing alone: on a phone the mode toggle takes the
    // full width of its line, so a button after it costs a whole third row of chrome
    // above the list - and this screen is the list.
    if (State.date !== todayStr()) {
        steps.appendChild(button('היום', 'btn-secondary btn-today', () => {
            hideUndo(); State.date = todayStr(); render();
        }));
    }
    tools.appendChild(steps);

    header.appendChild(tools);
    return header;
}

// The two ways of looking at one day, and the bulk fold's disclosure button, on the
// header's tools row.
//
// They had a row of their own above the list until v101. The reason for that was real -
// on the header the pair wrapped to a second line at 320px, and the whole pinned block
// paid for the extra line on every scroll - so this is not a free move: the stylesheet
// lets the tools row WRAP at 320 rather than shrink a segment below the 44px floor, and
// the header is measured in that state by tests/mobile.test.mjs. Even wrapped it is
// cheaper than the separate row was, because the tools row exists either way.
//
// Appended rather than returned: the tools row is built by renderDayHeader and the bulk
// row it points at is built after it, so there is one caller and it is renderDay.
function appendModeSwitch(tools, bulkRow) {
    if (!tools) return;
    // A line of their own inside the wrapping row, and a real element rather than a
    // flex-basis trick. Asking the pair to claim a line by refusing to be narrower than
    // its own labels works until the labels are bigger than the phone: at 200% text on a
    // 320px screen that pushed the whole page six pixels sideways, which the mobile suite
    // measures at exactly that size. A wrapper takes the line by being one item, and what
    // is inside it is free to shrink.
    const line = el('div', 'day-switch');
    const modes = el('div', 'layer-toggle mode-toggle mode-quiet');
    modes.appendChild(modeButton('workers', 'לפי עובדים'));
    modes.appendChild(modeButton('sites', 'לפי אתרים'));
    line.appendChild(modes);
    line.appendChild(button('הכל חופש', 'btn-secondary day-holiday-action',
        markAllHoliday, 'רשום חופש לעובדים בלי רישום ביום הנבחר'));
    if (bulkRow && bulkRow.classList && bulkRow.classList.contains('bulk-row')) {
        line.appendChild(bulkToggle(bulkRow));
    }
    tools.appendChild(line);
}

function openDayPicker() {
    const picker = document.getElementById('dayPicker');
    if (!picker) return;
    // showPicker needs a user gesture and is missing from older browsers; focusing the
    // input is the fallback that still opens something everywhere.
    try { picker.showPicker(); } catch (error) { picker.focus(); picker.click(); }
}

function modeButton(mode, text) {
    const btn = button(text, dayMode === mode ? 'layer-on' : 'layer-off', () => setDayMode(mode));
    btn.setAttribute('aria-pressed', dayMode === mode ? 'true' : 'false');
    btn.setAttribute('aria-label', text);
    if (text.startsWith('לפי ')) {
        btn.textContent = '';
        btn.appendChild(el('span', 'mode-prefix', 'לפי '));
        btn.appendChild(el('span', null, text.slice(4)));
    }
    return btn;
}

// One tap of הבא from a Friday used to land on «יום שבת», while the drawer skips
// Saturday as "not a working row", the blank-days count skips it and the week grid
// shades it as rest - the arrows were the one place the rest day was a stop. So an EMPTY
// Saturday is stepped over, in both directions. A Saturday with anything recorded on it
// is landed on: that is somebody's pay, and it must stay one tap away and never be
// hidden. Nothing else skips - the picker, the drawer, «היום», the midnight follow and
// State.date itself all still show a Saturday when asked for one, so an empty Saturday
// can be opened on purpose to record the work that was done on it.
function stepDay(days) {
    hideUndo();
    const date = parseLocalDate(State.date);
    date.setDate(date.getDate() + days);
    if (date.getDay() === 6 && !anyRecordOnRestDay(toLocalDateStr(date))) {
        date.setDate(date.getDate() + (days < 0 ? -1 : 1));
    }
    State.date = toLocalDateStr(date);
    render();
}

// Anything at all on the day: an entry or an absence, for ANY worker on the roster -
// an archived man's Saturday is still his Saturday - in ANY layer the record carries.
// The wider net than anyRecordOn is deliberate: the cost of stepping over a Saturday that
// held something is a day of pay nobody can reach with the arrows, and a planned-layer
// entry from an older document is still something.
//
// And a Rima count (v166), on any site, the archived ones included. It is keyed by SITE,
// not by worker, so the walk below never meets one - and a Saturday holding only Rima's
// men is a day billed to the client.
function anyRecordOnRestDay(date) {
    const day = (State.schedule.days && State.schedule.days[date]) || {};
    if (Object.keys(isPlainObject(day.rima) ? day.rima : {})
        .some(placeId => rimaCount(State.schedule, date, placeId) > 0)) return true;
    const layers = Object.keys(day);
    return State.schedule.workers.some(worker => layers.some(layer =>
        isAbsent(State.schedule, date, worker.id, layer) ||
        entriesFor(State.schedule, date, worker.id, layer).length > 0));
}

// Draw the two site actions so their shape does not depend on emoji fonts.
function siteActionIcon(add) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.8');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', add ? 'M12 5v14M5 12h14' : 'M5 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-6 3V6a2 2 0 0 1 2-2Z M7 9h10M7 13h6');
    svg.appendChild(path);
    return svg;
}

function renderSiteCard(place) {
    const card = el('div', 'site-card');
    const workerIds = workersAtPlace(State.schedule, State.date, place.id, State.layer);
    if (workerIds.length === 0) card.classList.add('site-card-empty');

    // By-site view: here the card IS one site, so there is no ambiguity in colouring its
    // heading - and it keeps the same identity the badges use in the list.
    const head = el('div', 'site-head site-head-color');
    head.dataset.anchor = 'head:' + place.id;
    const title = el('h3');
    appendSiteName(title, place.id, place.name);
    if (workerIds.length === 0) title.appendChild(el('span', 'site-empty', 'אין עובדים באתר הזה.'));
    head.appendChild(title);

    // The count and the two things done to a card, on the head itself. They used to be a
    // footer row under the list, and a row per card is five rows on a screen that shows
    // five cards - room the list wanted more than the labels did. The labels go with the
    // row: a glyph is the whole button now, so the accessible name is the ONLY thing that
    // says what it does, and there are four of these cards on the screen at once - it has
    // to say which site as well.
    const tools = el('div', 'site-head-tools');
    const count = el('span', 'site-count', String(workerIds.length));
    count.setAttribute('aria-label', `${workerIds.length} עובדים באתר`);
    tools.appendChild(count);

    const add = button('', 'btn-icon site-head-btn',
        () => openWorkerPicker(place.id),
        `הוסף עובד ל${isolate(place.name)}`);
    add.appendChild(siteActionIcon(true));
    tools.appendChild(add);

    // The seder for THIS gate. It goes to the man driving there, who needs to know who is
    // with him tomorrow and cannot act on the other four sites - and sending him all of
    // them is how somebody reads the wrong line and turns up at the wrong place.
    //
    // Only once there is somebody to name: a message saying an empty site is empty is a
    // message nobody sends.
    if (workerIds.length > 0) {
        const share = button('', 'btn-icon site-head-btn',
            () => showDayMessage(place.id),
            `שלח את סידור ${isolate(place.name)} בלבד`);
        share.appendChild(siteActionIcon(false));
        tools.appendChild(share);
    }

    head.appendChild(tools);
    paintSite(head, place.id);
    card.appendChild(head);

    const list = el('div', 'site-list');
    if (workerIds.length > 0) {
        workerIds.forEach(workerId => list.appendChild(renderAssignmentRow(place, workerId)));
        card.appendChild(list);
    }

    // On every card, the empty ones included: Rima's men can be on a site that has none
    // of the owner's that day, and that day is billed all the same.
    card.appendChild(renderRimaField(place));

    return card;
}

// HOW MANY OF RIMA'S MEN were on this site today (v166) - the other company's workers,
// counted and never named. See the רימא section of js/model/schema.js.
//
// A number field and nothing else: no free text, so nothing but a count can be written.
// Sized for 1-10, which is what a site sees; 10 is a guide, not a cap, and the model's
// cap (RIMA_MAX) is what refuses a three-digit typo. An empty field or 0 clears the count.
//
// Saved on `change` - when the field is left or Enter is pressed - not on every key, the
// same as the extra-hours box in the assign sheet: "1" on its way to "12" is not a count
// anybody recorded.
function renderRimaField(place) {
    const date = State.date;
    const stored = rimaCount(State.schedule, date, place.id);

    const row = el('label', 'rima-field');
    row.dataset.anchor = 'rima:' + place.id;
    row.appendChild(el('span', 'rima-label', 'רימא'));

    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'rima-input';
    input.inputMode = 'numeric';
    input.min = '0';
    input.max = String(RIMA_MAX);
    input.step = '1';
    input.dir = 'ltr';
    input.placeholder = '0';
    input.value = stored > 0 ? String(stored) : '';
    // Named with the site, like every other control on a card: there are ten of these
    // on the screen at once.
    input.setAttribute('aria-label', `רימא ב${isolate(place.name)}`);
    input.dataset.placeId = place.id;

    // Set by a commit of this box that stood; read by the blur that follows it (below).
    let stood = false;
    input.addEventListener('change', () => {
        // Taken away by a redraw, not left by the person - see dayTearingDown.
        if (dayTearingDown) return;
        const text = String(input.value || '').trim();
        // badInput is how a number field says "something was typed that is not a
        // number" - its value is then '' and would otherwise read as a clear.
        const bad = Boolean(input.validity && input.validity.badInput);
        const next = bad ? NaN : (text === '' ? 0 : (/^\d+$/.test(text) ? Number(text) : NaN));
        if (next === rimaCount(State.schedule, date, place.id)) return;
        const change = Number.isNaN(next)
            ? { refused: true, reason: RIMA_REFUSED }
            : setRimaCount(State.schedule, date, place.id, next);
        // A refusal, or a commit with nowhere durable to live, puts the field back to
        // what the record says - the screen never shows a count the record does not hold.
        // A count the disk guard KEPT in the journal - another window of this app wrote
        // the same site first - did not stand, but it is an edit all the same, and ↶ is
        // forgotten for it exactly as for one that stood (below).
        if (!State.commit(change)) {
            if (State.lastCommitKept) hideUndo();
            render();
            return;
        }
        // THE HEADER'S ↶ HOLDS THE STEP BEFORE THIS ONE. A count offers no undo of its own,
        // so after one stood ↶ was still armed with whatever went before - a man put on a
        // site, often on a card off the screen - and pressed to take the count back it took
        // back HIS day instead, pay and all, and queued that for the cloud. So a count that
        // stands forgets the step behind it, the way leaving the day does.
        hideUndo();
        stood = true;
    });
    // FROM ONE SITE'S BOX STRAIGHT TO THE NEXT. `change` fires while the focus is on its way
    // there, the commit above redraws every card, and the box the finger landed on is gone
    // before it can take the focus - the keyboard drops and the tap is lost. The blur that
    // follows still names where the focus was going; when that was another site's Rima box,
    // that site's new box takes it. Focus only, never a value: what a box shows is either
    // typed by the person or stored.
    input.addEventListener('blur', event => {
        const going = event.relatedTarget;
        const redrawn = stood;
        stood = false;
        if (!redrawn || !going || going.isConnected || !going.classList
            || !going.classList.contains('rima-input')) return;
        const replacement = [...document.querySelectorAll('.rima-input')]
            .find(node => node.dataset.placeId === going.dataset.placeId);
        if (replacement) replacement.focus({ preventScroll: true });
    });
    row.appendChild(input);
    return row;
}

// A MAN'S ROW ON A SITE (v167): his name, the ✕, and a word only when his day there is not
// regular.
//
// It used to carry the rate <select> as well, «רגיל» on every row of every card - a column
// of the same word read thirty times an evening to find the one day that was not - and the
// hours box beside it for overtime. The owner approved this shape on 2026-11-04 («إيه، هيك
// منيح»), and with it where the kind is chosen now: the NAME opens the assign sheet for
// that man (openAssignSheet with stay - it stays on him, js/ui/sheet.js), whose chips
// «רגיל» / «שעות נוספות» / «יום כפול» and hours box were there already, each step undoable.
//
// The tag is the rate's own label (RATE_LABELS, js/model/schema.js), word for word: no new
// word was made for it. The row keeps its place key (row:<site>:<man>, see renderDay) and
// the ✕ its double-tap guard. The by-worker list is a row of its own
// (renderDayWorkerList) and is not touched.
function renderAssignmentRow(place, workerId) {
    const worker = State.worker(workerId);
    const entries = entriesFor(State.schedule, State.date, workerId, State.layer);
    const entry = entries.find(e => e.placeId === place.id);
    const rate = entryRate(entry);

    const row = el('div', 'assign-row');
    row.dataset.anchor = 'row:' + place.id + ':' + workerId;

    const name = el('span', 'assign-name', worker ? worker.name : workerId);
    // A worker at two sites today is normal here, not an error - but it has to be visible,
    // because it changes what the row means.
    if (entries.length > 1) {
        const other = entries.find(e => e.placeId !== place.id);
        const otherPlace = other && State.place(other.placeId);
        const badge = el('span', 'badge badge-split', '2 אתרים');
        if (otherPlace) badge.title = `גם: ${otherPlace.name}`;
        name.appendChild(badge);
    }
    // Only a day that is not regular is worded. A tag on every row would be the column of
    // «רגיל» this replaced.
    if (rate !== RATE_NORMAL) name.appendChild(el('span', 'assign-rate', RATE_LABELS[rate]));

    // The whole name is the target, 44px tall at the least (css/app.css) and as wide as the
    // row leaves it, the tag inside it. Its accessible name says the man, the site and the
    // rate, regular or not: an eye is told a regular day by the missing tag, a screen reader
    // is not. Shaped like the ✕ beside it (הסר את <X> מ<Y>), both names isolated.
    if (worker) {
        const main = button('', 'assign-main', () => openAssignSheet(workerId, { stay: true }),
            `${isolate(worker.name)} ב${isolate(place.name)} · ${RATE_LABELS[rate]}`);
        main.appendChild(name);
        row.appendChild(main);
    } else {
        row.appendChild(name);
    }

    row.appendChild(button('✕', 'btn-icon', () => {
        // The man below slides up into this row; a second tap inside DOUBLE_TAP_GUARD_MS
        // would take HIM off. It is the first tap again (secondTapTooSoon).
        if (secondTapTooSoon('row-remove')) return;
        editWithUndo(workerId, `${isolate(worker ? worker.name : '')} הוסר מ${isolate(place.name)}`,
            () => unassignPlace(State.schedule, State.date, workerId, State.layer, place.id));
    }, `הסר את ${isolate(worker ? worker.name : '')} מ${isolate(place.name)}`));

    return row;
}

// Everyone with nothing recorded today, as tappable chips. This tray is the safety net
// against the failure that costs real money: forgetting someone entirely.
function renderUnassignedTray(unrecorded) {
    const tray = el('div', unrecorded.length ? 'tray tray-pending' : 'tray tray-complete tray-is-empty');
    tray.dataset.anchor = 'tray:unrecorded';
    // The count rides on the header: this tray is the day's debt, and how deep it is
    // should not take a chip-by-chip count to know. An empty tray keeps the bare word -
    // the line under it already says "nobody" in words, and (0) next to that is noise.
    tray.appendChild(el('h4', null,
        unrecorded.length > 0 ? `לא נרשמו (${unrecorded.length})` : 'לא נרשמו'));

    if (unrecorded.length === 0) {
        tray.appendChild(el('p', 'tray-empty', '✔️ כל העובדים טופלו.'));
        return tray;
    }

    const chips = el('div', 'chips');
    unrecorded.forEach(worker => {
        const chip = el('div', 'chip');
        chip.appendChild(button(worker.name, 'chip-main', () => openPlacePicker(worker.id), `שבץ את ${isolate(worker.name)}`));
        chip.appendChild(button('נעדר', 'chip-side', () => {
            State.commit(markAbsent(State.schedule, State.date, worker.id, State.layer));
        }, `סמן את ${isolate(worker.name)} כנעדר`));
        chips.appendChild(chip);
    });
    tray.appendChild(chips);
    return tray;
}

// Explicit departures. Missing records are shown as missing and never priced.
function renderVehicleTray() {
    if (!vehiclesEnabled()) return null;
    const vehicles = (State.schedule.vehicles || []).filter(item => item.active !== false);
    if (!vehicles.length) return null;
    const runs = (State.schedule.days[State.date] || {}).vehicleRuns || {};
    const tray = el('div', 'tray');
    tray.appendChild(el('h4', null, 'רכבים — נרשמים בנפרד'));
    const missing = vehicles.filter(vehicle => !runs[vehicle.id]);
    if (missing.length) tray.appendChild(el('p', 'hint',
        `${missing.length} רכבים טרם נרשמו היום ולא נכללו בתשלום.`));
    const chips = el('div', 'chips');
    vehicles.forEach(vehicle => {
        const run = runs[vehicle.id];
        const status = !run ? 'טרם נרשם' : run.out ? 'יצא' : 'לא יצא';
        const chip = el('div', run && run.out ? 'chip chip-vehicle' : 'chip chip-vehicle chip-absent');
        chip.appendChild(button(`${vehicle.name} · ${status}`, 'chip-main',
            () => editVehicleDeparture(vehicle.id), `רישום נסיעה של ${isolate(vehicle.name)}`));
        if (run && run.out) {
            const labels = placeLabelsIn(State.schedule, State.date, State.date);
            chip.appendChild(el('span', 'hint', run.siteIds.map(id => placeLabelFrom(labels, id)).join(' · ')));
        }
        chips.appendChild(chip);
    });
    tray.appendChild(chips);
    return tray;
}

async function editVehicleDeparture(vehicleId) {
    if (!vehiclesEnabled() || farkadWritesBlocked()) return;
    const date = State.date;
    const vehicle = (State.schedule.vehicles || []).find(item => item.id === vehicleId && item.active !== false);
    if (!vehicle) return;
    const old = ((State.schedule.days[date] || {}).vehicleRuns || {})[vehicleId] || null;
    const baseline = JSON.stringify(old);
    const rosterBaseline = JSON.stringify(vehicle);
    const owner = State.worker(old && old.out ? old.ownerId : vehicle.ownerId);
    if (vehicleDateClosed(State.schedule, old && old.out ? old.ownerId : vehicle.ownerId, date)) {
        await askTell('החשבון לתאריך הזה נסגר. אי אפשר לשנות בו רישום רכב.');
        return;
    }
    const selected = new Set(old && old.out ? old.siteIds : []);
    let out = old ? old.out : true;
    let failed = false;
    // A failed durable commit reopens with the draft intact. No "saved" or undo
    // is offered until commit returns true. The selected date is captured once.
    for (;;) {
        const pending = askConfirm({ title: `${vehicle.name} · ${date}`,
            message: (failed ? 'השמירה לא הושלמה. הבחירה נשמרה בחלון; נסה שוב. ' : '')
                + `${old && old.out ? old.amount : vehicleRateOn(vehicle, date)} ₪ פעם אחת ביום לבעל הרכב: ${owner ? owner.name : 'בעל הרכב'}. `
                + 'גם ביום כפול וגם בנסיעה למספר אתרים.', ok: 'שמירת רישום הרכב' });
        const parts = askElements();
        if (!parts.choices) return;
        parts.choices.style.display = '';
        const departure = document.createElement('input');
        departure.type = 'checkbox'; departure.checked = out;
        const stateLabel = el('label', 'vehicle-option');
        stateLabel.appendChild(departure); stateLabel.appendChild(el('span', null, 'הרכב יצא לעבודה'));
        departure.onchange = () => { out = departure.checked; };
        parts.choices.appendChild(stateLabel);
        const places = (State.schedule.places || []).filter(p => p.active !== false || selected.has(p.id));
        places.forEach(place => {
            const label = el('label', 'vehicle-option');
            const input = document.createElement('input'); input.type = 'checkbox'; input.checked = selected.has(place.id);
            input.onchange = () => { if (input.checked) selected.add(place.id); else selected.delete(place.id); };
            label.appendChild(input); label.appendChild(el('span', null, place.name));
            parts.choices.appendChild(label);
        });
        if (!await pending) return;
        if (farkadWritesBlocked()) return;
        const current = ((State.schedule.days[date] || {}).vehicleRuns || {})[vehicleId] || null;
        const currentVehicle = (State.schedule.vehicles || []).find(item => item.id === vehicleId);
        if (JSON.stringify(current) !== baseline || JSON.stringify(currentVehicle) !== rosterBaseline) {
            await askTell('רישום הרכב השתנה בזמן שהחלון היה פתוח. פתח אותו שוב כדי לבדוק את העדכון.');
            return;
        }
        if (out && selected.size === 0) {
            await askTell('בחר לפחות אתר אחד שאליו הרכב יצא.');
            continue;
        }
        const change = setVehicleOut(State.schedule, date, vehicleId, out, [...selected]);
        if (!change.path) { await askTell('הרכב אינו זמין לרישום. בדוק את רשימת הרכבים.'); return; }
        if (!State.commit(change)) { failed = true; continue; }
        const saved = JSON.parse(JSON.stringify(change.value));
        render();
        const restore = value => {
            const now = ((State.schedule.days[date] || {}).vehicleRuns || {})[vehicleId] || null;
            const expected = value === old ? saved : old;
            if (JSON.stringify(now) !== JSON.stringify(expected)
                || vehicleDateClosed(State.schedule, (now || saved).ownerId, date)) return false;
            State.schedule.days[date].vehicleRuns[vehicleId] = value;
            return State.commit({ path: change.path, value });
        };
        offerUndo(`${vehicle.name} — רישום הרכב נשמר`, () => restore(old), () => restore(saved));
        return;
    }
}

function renderAbsentTray() {
    const absent = State.absentToday();
    const tray = el('div', absent.length ? 'tray tray-absent' : 'tray tray-absent tray-is-empty');
    tray.dataset.anchor = 'tray:absent';
    // Same rule as the tray above: a count when there is anyone to count.
    tray.appendChild(el('h4', null,
        absent.length > 0 ? `נעדרים (${absent.length})` : 'נעדרים'));

    if (absent.length === 0) {
        tray.appendChild(el('p', 'tray-empty', 'אין נעדרים.'));
        return tray;
    }

    const chips = el('div', 'chips');
    absent.forEach(worker => {
        const chip = el('div', 'chip chip-absent');
        chip.appendChild(el('span', 'chip-main', worker.name));
        chip.appendChild(button('✕', 'chip-side', () => {
            // The next man's chip slides into this one's place, under the finger: a second
            // tap inside DOUBLE_TAP_GUARD_MS is this one again (secondTapTooSoon).
            if (secondTapTooSoon('absent-remove')) return;
            editWithUndo(worker.id, `ההיעדרות של ${isolate(worker.name)} בוטלה`,
                () => clearWorkerDay(State.schedule, State.date, worker.id, State.layer));
        }, `בטל היעדרות של ${isolate(worker.name)}`));
        chips.appendChild(chip);
    });
    tray.appendChild(chips);
    return tray;
}

// Holiday fills only missing records. The date and crew are captured before confirmation;
// records are re-read afterwards so another phone's work is never replaced by this action.
async function markAllHoliday() {
    const date = State.date;
    const ids = State.activeWorkers().map(worker => worker.id);
    const missing = id => {
        if (vehicleDateClosed(State.schedule, id, date)) return false;
        const record = workerDay(State.schedule, date, id, 'actual');
        return !record || (!record.absent && !(record.entries || []).length);
    };
    const count = ids.filter(missing).length;
    if (!count) {
        await askTell('לכל העובדים כבר יש רישום ביום הזה. שום רישום לא שונה.');
        return false;
    }
    const yes = await askConfirm({
        title: `הכל חופש · ${formatFullDate(parseLocalDate(date))}`,
        message: `לרשום חופש ל-${count} עובדים בלי רישום? חופש ללא שכר. עבודה, היעדרויות וחשבונות סגורים יישמרו.`,
        ok: 'רשום חופש'
    });
    if (!yes) return false;
    const changes = ids.filter(id => State.worker(id) && State.worker(id).active !== false && missing(id))
        .map(id => markAbsent(State.schedule, date, id, 'actual'));
    if (!changes.length) return false;
    return State.commitMany(changes);
}
