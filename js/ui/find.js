// חיפוש עובד - find a man from the day screen, and go to what is wanted about him.
//
// The question it answers is asked in the middle of something else: the day is on the
// screen, somebody rings, and what is wanted is one man - his card, his day, his advances.
// Until now that was: leave the day, open the crew, type in its search, find his row,
// press. This is one dialog over the day: type any part of his name (or of his number),
// and each man found carries the three doors beside his name.
//
// IT IS A FINDER AND NOTHING ELSE. It reads the roster, and every button on it goes to a
// screen that already exists, by that screen's own function:
//
//   «כרטיס עובד»      openWorkerCard        js/ui/workercard.js
//   the day's sheet   openAssignSheet       js/ui/sheet.js   - for the date ON SCREEN,
//                                           named on the button, never a date it chose
//   «מקדמות»          showWorkerAdvances    js/ui/reports.js
//
// It writes nothing: no commit, no preference, not even what was typed - the field is
// emptied when the dialog closes. tests/find.test.mjs holds the whole disk byte for byte.
//
// THE WAY IN is one worded button at the foot of the day's list, in the row «בדיקת היום»
// stands in and beside it (js/ui/day.js) - the foot of the day is no taller for it. Not on the day's header and not on its dock: both are measured to the
// pixel and the owner has said the day has enough buttons where the thumb works. The
// crew screen keeps its own search exactly as it was - its rows already carry the card.
//
// THE KEYBOARD. The dialog hangs from the top of the screen and gives up the keyboard's
// height (--kb-h, measured by js/ui/bars.js) from its own, so the field stays where it
// was typed into and the list scrolls in what is left above the keys - the lift the
// assign sheet takes, turned the other way up. The field is 16px, so iOS does not zoom.

// ================================================================== THE WORDS
//
// The strings this file ADDS, in one block. PROPOSED, not approved: the owner has not
// read them. Pinned word for word in tests/find.test.mjs.
const FIND_TEXT = Object.freeze({
    // the door to his day, when the day on screen is today
    sheetToday: 'שיבוץ להיום',
    // and when it is another day: «שיבוץ ליום חמישי 12/11» - the day is named, because a
    // sheet that opened on a date nobody read is how a man is recorded on the wrong one
    sheetDay: (day, date) => `שיבוץ ל${day} ${date}`,
    // each door read aloud: its words, then the man - «כרטיס עובד · אחמד»
    doorFor: (door, name) => `${door} · ${name}`
});

// The words it borrows, each beside the screen that owns it. Repeated here because those
// screens keep them inline; tests/find.test.mjs finds every one in its owner's source,
// so a word changed there and not here fails by name.
const FIND_REUSED = Object.freeze({
    title: 'חיפוש עובד',                             // index.html, the crew screen's search
    placeholder: 'חיפוש לפי שם, טלפון או זהות',      // index.html, the crew screen's search
    found: count => `נמצאו ${count} עובדים`,         // js/ui/roster.js, the crew screen's search
    none: 'לא נמצאו עובדים. נסה שם או מספר אחר.',    // js/ui/roster.js, the crew screen's search
    archived: count => `עובדים כבויים (${count})`,   // js/ui/roster.js, the crew's fold
    inactive: 'לא פעיל',                             // js/ui/roster.js, the crew row
    advances: 'מקדמות',                              // js/ui/reports.js, the advances screen
    clear: 'נקה',                                    // index.html, the crew screen's search
    close: 'סגור'                                    // index.html, every dialog
});

// ================================================================== the reading
//
// Pure: a roster and what was typed in, the men found out. No DOM, no storage, no clock.

// What is compared: letters and digits, the same whatever was typed around them.
//
// Lower case; the Hebrew points and the bidi marks taken out (a name pasted from WhatsApp
// carries both); a final letter read as the letter it is, so «אברהמ» typed in a hurry
// finds «אברהם»; quotes, geresh, dashes and dots read as nothing, so «גאבר» finds «ג'אבר»
// and «אבו-חסן» is found with or without its dash; runs of spaces one space.
//
// NOT DONE, on purpose: reading a Latin spelling as a Hebrew or Arabic name. «Ahmad»,
// «Ahmed» and «אחמד» are one man to a person and three strings to any rule short enough
// to trust, and a finder that guesses shows the wrong man first.
const FIND_FINALS = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };

function findFold(text) {
    return String(text === undefined || text === null ? '' : text)
        .toLocaleLowerCase()
        .replace(/[\u0591-\u05C7\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, '')
        .replace(/[ךםןףץ]/g, letter => FIND_FINALS[letter])
        .replace(/['"`\u05F3\u05F4\u2018\u2019\u201C\u201D.\-\u05BE_]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

// A number however it was written, digit for digit - Arabic-Indic digits are digits, as
// they are to the seder (sederWaNumber).
function findAsciiDigits(text) {
    return String(text === undefined || text === null ? '' : text)
        .replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 0x0660))
        .replace(/[۰-۹]/g, digit => String(digit.charCodeAt(0) - 0x06F0));
}

function findDigits(text) {
    return findAsciiDigits(text).replace(/[^0-9]/g, '');
}

// One way of writing a number: the international prefix is the trunk zero written
// another way, so +972 52..., 00972 52... and 052... are compared as 052...
function findLocalNumber(digits) {
    return digits.replace(/^00/, '').replace(/^9720?/, '0');
}

// Is this man what was typed? EVERY word typed has to be found in him - in any part of
// his name, or in his phone number or his identity number - so «כהן יוסי» finds «יוסי
// כהן», and a second word narrows the list instead of widening it. A number is compared
// digit to digit: 0528841930, 052-884-1930 and +972 52 884 1930 are one number here, as
// they are everywhere else in this app. Only a word that is nothing but a number is
// looked for among the numbers: «ב2» is part of a name.
function findMatches(worker, query) {
    const words = findFold(query).split(' ').filter(Boolean);
    if (words.length === 0) return true;
    const name = findFold(worker && worker.name);
    const numbers = [findDigits(worker && worker.phone), findDigits(worker && worker.idNumber)]
        .filter(Boolean);
    return words.every(word => {
        if (name.indexOf(word) !== -1) return true;
        const numeric = findAsciiDigits(word);
        if (!/^\+?[\d()]+$/.test(numeric)) return false;
        const digits = findDigits(numeric);
        if (!digits) return false;
        const local = findLocalNumber(digits);
        return numbers.some(number => number.indexOf(digits) !== -1
            || findLocalNumber(number).indexOf(local) !== -1);
    });
}

// The men found, in the order every other screen reads the crew in: the ones on the
// daily list first, the ones turned off after them in a group of their own - found, and
// never mixed in with the men a day can be given to.
function findRead(schedule, query) {
    const workers = ((schedule && schedule.workers) || []).filter(Boolean)
        .filter(worker => findMatches(worker, query));
    const active = workers.filter(worker => worker.active !== false);
    const archived = workers.filter(worker => worker.active === false);
    return { active, archived, total: active.length + archived.length };
}

// ================================================================== the dialog

function findParts() {
    const get = id => document.getElementById(id);
    return { modal: get('findModal'), title: get('findTitle'), input: get('findInput'),
        clear: get('findClear'), close: get('findClose'), status: get('findStatus'), list: get('findList') };
}

// The one way in: a button, which js/ui/day.js puts first in the row at the day's foot.
function findEntry() {
    const entry = button(FIND_REUSED.title, 'btn-secondary find-entry', () => openFind());
    entry.id = 'findEntry';
    entry.setAttribute('aria-haspopup', 'dialog');
    return entry;
}

function findIsOpen() {
    const modal = document.getElementById('findModal');
    return Boolean(modal && modal.style.display === 'flex');
}

// The door to his day says which day: the one on the screen behind the dialog.
function findSheetLabel() {
    const date = State.date;
    if (date === todayStr()) return FIND_TEXT.sheetToday;
    const parsed = parseLocalDate(date);
    return FIND_TEXT.sheetDay(hebrewDayName(parsed), formatShortDate(parsed));
}

function findRowNode(worker, sheetLabel) {
    const row = el('div', worker.active === false ? 'find-row find-row-off' : 'find-row');
    row.dataset.workerId = worker.id;
    const who = el('div', 'find-who');
    who.appendChild(el('strong', 'find-name', worker.name));
    if (worker.active === false) who.appendChild(el('span', 'badge', FIND_REUSED.inactive));
    row.appendChild(who);

    const doors = el('div', 'find-doors');
    const door = (what, words) => {
        const node = button(words, `btn-secondary find-door find-door-${what}`,
            () => findGo(what, worker.id), FIND_TEXT.doorFor(words, isolate(worker.name)));
        node.dataset.findDoor = what;
        doors.appendChild(node);
    };
    if (typeof openWorkerCard === 'function') door('card', WORKER_CARD_TEXT.title);
    // A day is given to a man on the daily list. A man who was turned off has his card
    // and his advances here; putting him back to work is the crew screen's switch.
    if (worker.active !== false) door('sheet', sheetLabel);
    door('advances', FIND_REUSED.advances);
    row.appendChild(doors);
    return row;
}

function renderFind() {
    const parts = findParts();
    if (!parts.list || !parts.input) return;
    const query = parts.input.value || '';
    const typed = findFold(query) !== '';
    const found = findRead(State.schedule, query);

    if (parts.clear) parts.clear.hidden = query === '';
    if (parts.status) {
        // Said only once something was typed, as the crew screen's own search does.
        parts.status.hidden = !typed;
        parts.status.textContent = typed ? FIND_REUSED.found(found.total) : '';
    }

    clear(parts.list);
    if (found.total === 0) {
        parts.list.appendChild(emptyHint(FIND_REUSED.none));
        return;
    }
    const sheetLabel = findSheetLabel();
    found.active.forEach(worker => parts.list.appendChild(findRowNode(worker, sheetLabel)));
    if (found.archived.length > 0) {
        parts.list.appendChild(el('h4', 'find-group', FIND_REUSED.archived(found.archived.length)));
        found.archived.forEach(worker => parts.list.appendChild(findRowNode(worker, sheetLabel)));
    }
}

function openFind() {
    const parts = findParts();
    if (!parts.modal || !parts.input || !parts.list) return false;
    if (parts.title) parts.title.textContent = FIND_REUSED.title;
    parts.input.placeholder = FIND_REUSED.placeholder;
    parts.input.value = '';
    if (parts.clear) parts.clear.textContent = FIND_REUSED.clear;
    if (parts.close) parts.close.textContent = FIND_REUSED.close;
    renderFind();
    parts.list.scrollTop = 0;
    parts.modal.style.display = 'flex';
    // The field takes the keyboard at once, inside the tap that opened the dialog - it
    // is a finder, and iOS raises the keys only for a focus that comes from a tap.
    // Forced into effect first: an element that was display:none a line ago cannot focus.
    void parts.modal.offsetHeight;
    if (parts.input.focus) parts.input.focus({ preventScroll: true });
    return true;
}

function closeFind() {
    const parts = findParts();
    if (!parts.modal || parts.modal.style.display !== 'flex') return;
    parts.modal.style.display = 'none';
    // What was typed is not kept, anywhere: the next opening starts empty.
    if (parts.input) parts.input.value = '';
    // THE WAY BACK, as «בדיקת היום» takes it (closeDayCheck): js/ui/modal.js gives the
    // focus back to the button that opened the dialog, but the day is drawn again from
    // nothing whenever the record changes under it, and that button is then off the page.
    // Once that has had its turn, and only if nothing else took the focus, the button
    // standing there now takes it. Focus only, never a scroll.
    setTimeout(() => {
        const active = document.activeElement;
        const lost = !active || active === document.body || parts.modal.contains(active);
        const entry = document.getElementById('findEntry');
        const open = [...document.querySelectorAll('.modal')].some(node => node.style.display === 'flex');
        if (lost && entry && !open) entry.focus({ preventScroll: true });
    }, 0);
}

function clearFind() {
    const parts = findParts();
    if (!parts.input) return;
    parts.input.value = '';
    renderFind();
    if (parts.input.focus) parts.input.focus({ preventScroll: true });
}

// render() calls this (js/app.js): a man added, renamed or turned off on another phone
// while the finder is open is found, or not found, as the record now has him. What was
// typed and where the list was scrolled to stay.
function renderFindIfOpen() {
    if (!findIsOpen()) return;
    const list = document.getElementById('findList');
    const at = list ? list.scrollTop : 0;
    // A door that had the focus is drawn again; the one for the same man takes it back.
    const active = document.activeElement;
    const held = active && active.dataset && active.dataset.findDoor && list && list.contains(active)
        ? [active.closest('.find-row').dataset.workerId, active.dataset.findDoor] : null;
    renderFind();
    if (list) list.scrollTop = at;
    if (held) {
        const again = [...list.querySelectorAll('.find-door')].filter(node =>
            node.dataset.findDoor === held[1] && node.closest('.find-row').dataset.workerId === held[0])[0];
        if (again) again.focus({ preventScroll: true });
    }
}

// The three doors. Each closes the finder and hands the man to the screen that owns what
// was asked for; none of them changes anything itself.
function findGo(what, workerId) {
    const worker = State.worker(workerId);
    closeFind();
    // He left the record between the list being drawn and the tap: nothing opens.
    if (!worker) return;
    if (what === 'advances') {
        showWorkerAdvances(worker.id);
        return;
    }
    if (what === 'sheet') {
        // The day's own sheet for him, opened the way «בדיקת היום» opens it for a name.
        if (worker.active !== false && typeof openAssignSheet === 'function') {
            openAssignSheet(worker.id, { stay: true });
        }
        return;
    }
    if (typeof openWorkerCard !== 'function') return;
    openWorkerCard(worker.id);
    // One dialog shut and the next opened in the same step, so js/ui/modal.js never saw
    // the page without a dialog and does not enter this one for itself: the card is
    // entered at its heading here, as it is from the crew row.
    const title = document.getElementById('workerCardTitle');
    if (title && title.focus) title.focus({ preventScroll: true });
}
