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
// another door.
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

function renderDay() {
    const root = document.getElementById('dayView');
    if (!root) return;

    root.innerHTML = '';
    root.appendChild(renderDayHeader());
    watchDayScroll();
    // Asked again on every render, not only on scroll: a render can arrive with the page
    // already scrolled - coming back to the day from the week, a snapshot landing under a
    // scrolled list - and a header drawn full under a scrolled page is a header that
    // stays full until the next flick.
    readDayScroll();

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

    if (dayMode === 'workers') {
        root.appendChild(renderDayWorkerList());
        return;
    }

    const grid = el('div', 'site-grid');
    State.activePlaces().forEach(place => grid.appendChild(renderSiteCard(place)));
    root.appendChild(grid);
    root.appendChild(renderUnassignedTray(State.unrecorded()));
    root.appendChild(renderAbsentTray());
    const vehicles = renderVehicleTray();
    if (vehicles) root.appendChild(vehicles);
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

    if (State.activeWorkers().length === 0 || State.activePlaces().length === 0) {
        banner.style.display = 'none';
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

    if (notes.length === 0) { banner.style.display = 'none'; return; }

    // Dismissed for today, and back tomorrow if it still applies. A notice that cannot
    // be put away is read once and then looked past for good - and this one has to keep
    // working on the day it actually matters.
    const text = notes.join(' · ');
    if (Store.get(ACCOUNT_BANNER_KEY) === todayStr() + '|' + text) {
        banner.style.display = 'none';
        return;
    }

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
    line.setAttribute('role', 'status');
    line.setAttribute('aria-live', 'polite');

    if (typeof farkadWritesBlocked === 'function' && farkadWritesBlocked()) {
        line.appendChild(el('span', 'progress-blocked', 'הרישום מושבת'));
    }

    wrap.appendChild(line);

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
    if (!State.commitMany(changes)) return;

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

function openDayDrawer() {
    renderDayDrawer();
    ['dayDrawer', 'dayDrawerBack', 'dayDrawerWrap'].forEach(id =>
        document.getElementById(id).classList.add('drawer-open'));
    document.addEventListener('keydown', drawerKeydown);
}

function closeDayDrawer() {
    ['dayDrawer', 'dayDrawerBack', 'dayDrawerWrap'].forEach(id =>
        document.getElementById(id).classList.remove('drawer-open'));
    document.removeEventListener('keydown', drawerKeydown);
}

function drawerKeydown(event) {
    if (event.key === 'Escape') { event.preventDefault(); closeDayDrawer(); }
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

        const row = el('div', empty ? 'wrow wrow-empty' : 'wrow');

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
    const back = button('קודם', 'btn-secondary btn-nav nav-back', () => stepDay(-1), 'יום קודם');
    back.insertBefore(chevronIcon('back'), back.firstChild);
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

    const fwd = button('הבא', 'btn-secondary btn-nav nav-fwd', () => stepDay(1), 'יום הבא');
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
function anyRecordOnRestDay(date) {
    const layers = Object.keys((State.schedule.days && State.schedule.days[date]) || {});
    return State.schedule.workers.some(worker => layers.some(layer =>
        isAbsent(State.schedule, date, worker.id, layer) ||
        entriesFor(State.schedule, date, worker.id, layer).length > 0));
}

function renderUnrecordedBanner(unrecorded) {
    const banner = el('div', 'banner banner-warn');
    banner.textContent = `⚠️ ${unrecorded.length} עובדים לא נרשמו ביום הזה`;
    return banner;
}

function renderSiteCard(place) {
    const card = el('div', 'site-card');
    const workerIds = workersAtPlace(State.schedule, State.date, place.id, State.layer);

    // By-site view: here the card IS one site, so there is no ambiguity in colouring its
    // heading - and it keeps the same identity the badges use in the list.
    const head = el('div', 'site-head site-head-color');
    const title = el('h3');
    appendSiteName(title, place.id, place.name);
    head.appendChild(title);

    // The count and the two things done to a card, on the head itself. They used to be a
    // footer row under the list, and a row per card is five rows on a screen that shows
    // five cards - room the list wanted more than the labels did. The labels go with the
    // row: a glyph is the whole button now, so the accessible name is the ONLY thing that
    // says what it does, and there are four of these cards on the screen at once - it has
    // to say which site as well.
    const tools = el('div', 'site-head-tools');
    tools.appendChild(el('span', 'site-count', String(workerIds.length)));

    tools.appendChild(button('＋', 'btn-icon site-head-btn',
        () => openWorkerPicker(place.id),
        `הוסף עובד ל${isolate(place.name)}`));

    // The seder for THIS gate. It goes to the man driving there, who needs to know who is
    // with him tomorrow and cannot act on the other four sites - and sending him all of
    // them is how somebody reads the wrong line and turns up at the wrong place.
    //
    // Only once there is somebody to name: a message saying an empty site is empty is a
    // message nobody sends.
    if (workerIds.length > 0) {
        tools.appendChild(button('💬', 'btn-icon site-head-btn',
            () => showDayMessage(place.id),
            `שלח את סידור ${isolate(place.name)} בלבד`));
    }

    head.appendChild(tools);
    paintSite(head, place.id);
    card.appendChild(head);

    const list = el('div', 'site-list');
    if (workerIds.length === 0) {
        list.appendChild(el('p', 'site-empty', 'אין עובדים באתר הזה.'));
    } else {
        workerIds.forEach(workerId => list.appendChild(renderAssignmentRow(place, workerId)));
    }
    card.appendChild(list);

    return card;
}

function renderAssignmentRow(place, workerId) {
    const worker = State.worker(workerId);
    const entries = entriesFor(State.schedule, State.date, workerId, State.layer);
    const entry = entries.find(e => e.placeId === place.id);

    const row = el('div', 'assign-row');

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
    row.appendChild(name);

    // The record is what pay is calculated from, so the rate sits on the row itself
    // rather than behind a dialog nobody will open thirty times an evening.
    row.appendChild(renderRateControl(place.id, workerId, entry));

    row.appendChild(button('✕', 'btn-icon', () => {
        editWithUndo(workerId, `${isolate(worker ? worker.name : '')} הוסר מ${isolate(place.name)}`,
            () => unassignPlace(State.schedule, State.date, workerId, State.layer, place.id));
    }, `הסר את ${isolate(worker ? worker.name : '')} מ${isolate(place.name)}`));

    return row;
}

function renderRateControl(placeId, workerId, entry) {
    const wrap = el('span', 'rate-control');

    const select = document.createElement('select');
    select.className = 'rate-select';
    RATES.forEach(rate => {
        const option = document.createElement('option');
        option.value = rate;
        option.textContent = RATE_LABELS[rate];
        select.appendChild(option);
    });
    select.value = entryRate(entry);
    select.addEventListener('change', () => {
        const hours = select.value === RATE_EXTRA ? entryExtraHours(entry) : 0;
        State.commit(setRate(State.schedule, State.date, workerId, State.layer, placeId, select.value, hours));
    });
    wrap.appendChild(select);

    if (entryRate(entry) === RATE_EXTRA) {
        const hours = document.createElement('input');
        hours.type = 'number';
        hours.className = 'rate-hours';
        hours.min = '0';
        hours.step = '0.5';
        hours.dir = 'ltr';
        hours.value = entryExtraHours(entry) || '';
        hours.placeholder = 'ש׳';
        hours.setAttribute('aria-label', 'שעות נוספות');
        hours.addEventListener('change', () => {
            State.commit(setRate(State.schedule, State.date, workerId, State.layer, placeId, RATE_EXTRA, hours.value));
        });
        wrap.appendChild(hours);
    }

    return wrap;
}

// Everyone with nothing recorded today, as tappable chips. This tray is the safety net
// against the failure that costs real money: forgetting someone entirely.
function renderUnassignedTray(unrecorded) {
    const tray = el('div', 'tray');
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

// The vehicles, on the evenings where one of them did not go out.
//
// They all went out is the ordinary day and is what the pay sheet assumes, so this tray
// exists for the exception - and shows every vehicle rather than only the ones staying
// behind, because a list of what did NOT happen is a list nobody can check against the
// yard. Green for went out, and one tap to say otherwise.
//
// Returns null when there are no vehicles at all: an empty tray on the busiest screen in
// the app is a row of nothing to read every evening.
function renderVehicleTray() {
    // The feature is retired; see vehiclesEnabled in js/model/schema.js. The tray is the
    // busiest screen in the app and every chip on it writes a day record, so it is not
    // drawn at all rather than drawn and made inert.
    if (!vehiclesEnabled()) return null;

    const vehicles = (State.schedule.vehicles || []).filter(item => item.active !== false);
    if (vehicles.length === 0) return null;

    const off = (State.schedule.days[State.date] || {}).vehiclesOff || [];
    const tray = el('div', 'tray');
    tray.appendChild(el('h4', null, 'רכבים'));

    const chips = el('div', 'chips');
    vehicles.forEach(vehicle => {
        const out = !off.includes(vehicle.id);
        const chip = el('div', out ? 'chip chip-vehicle' : 'chip chip-vehicle chip-absent');
        chip.appendChild(button(
            `${vehicle.name} · ${out ? 'יצא' : 'לא יצא'}`,
            'chip-main',
            () => {
                // offerUndo rather than editWithUndo: that one snapshots a WORKER's day
                // and puts it back, and a vehicle is not a worker - handing it an id no
                // worker has would take a snapshot of nothing and restore it over
                // somebody. The way back here is simply the same switch thrown again.
                const date = State.date;
                if (!State.commit(setVehicleOut(State.schedule, date, vehicle.id, !out))) return;
                render();
                offerUndo(
                    out ? `${isolate(vehicle.name)} סומן כלא יצא`
                        : `${isolate(vehicle.name)} סומן כיצא`,
                    () => State.commit(setVehicleOut(State.schedule, date, vehicle.id, out)),
                    () => State.commit(setVehicleOut(State.schedule, date, vehicle.id, !out)));
            },
            out
                ? `סמן ש${isolate(vehicle.name)} לא יצא היום`
                : `סמן ש${isolate(vehicle.name)} יצא היום`));
        chips.appendChild(chip);
    });

    tray.appendChild(chips);
    return tray;
}

function renderAbsentTray() {
    const absent = State.absentToday();
    const tray = el('div', 'tray');
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
            editWithUndo(worker.id, `ההיעדרות של ${isolate(worker.name)} בוטלה`,
                () => clearWorkerDay(State.schedule, State.date, worker.id, State.layer));
        }, `בטל היעדרות של ${isolate(worker.name)}`));
        chips.appendChild(chip);
    });
    tray.appendChild(chips);
    return tray;
}
