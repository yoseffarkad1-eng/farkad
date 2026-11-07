// The seder to each worker (v167): one WhatsApp message per man, each with his own site
// and who is with him, opened one tap at a time.
//
// The owner, 2026-11-02: every night, after the seder, one action should reach each worker
// with where he works and with whom. Of the two ways offered he chose his own WhatsApp - a
// door per man, and one action that walks down the list - over a sending service, knowing
// what that costs: a personal WhatsApp cannot send by itself, so every message needs his
// own tap on send inside WhatsApp. That was fine. What he asked for in the same breath was
// that a man who is NOT working is not on the list at all, that Rima's men have nothing to
// do with it, and that the message is in Hebrew.
//
// So this file does three things and claims nothing it cannot know:
//
//   - THE LIST is the men with a site on the day being viewed, in the layer the day's
//     group message reads (State.layer, the same argument showDayMessage hands
//     dayMessage). Nobody marked נעדר, nobody on a הכל חופש day - that button writes נעדר
//     for everyone unrecorded - nobody with no site, and never Rima, who is a count on a
//     site and not a person. A man on two sites is one row with both.
//   - THE MESSAGE names the day and the date, his site or sites, and who else is on each
//     of them by name. Read off the record at the moment the list is drawn; nothing is
//     ever written back to it.
//   - THE RUN opens WhatsApp for the next chosen man INSIDE the person's tap: the address
//     is on a real link before the finger lands, because iOS opens nothing for a
//     navigation that does not come from a tap. When he comes back the next man is on the
//     same button. The app cannot see whether send was pressed in WhatsApp, so a man is
//     marked "opened in WhatsApp" and never "sent". A second tap in the moment after one
//     opens nobody (one tap, one man), and two men on the list with one number are each
//     told so before anything is opened.
//
// WHAT WAS OPENED, AND WHO WAS LEFT OUT, is this phone's own business: kept per date
// through Store under one key of its own, never in the record, never in the outbox, never
// in a backup or the rescue file (both carry named records only), never sent anywhere,
// and never shown against another date. It survives iOS killing the home-screen app while
// WhatsApp is in front - and if the list was open when that happened, the list comes back
// by itself, on the evening it was sending, with the next man ready.
//
// Entered from the WhatsApp dialog (#shareModal), under its green button: the day screen
// gets no new button - the owner had just said it has too many.

// ================================================================== THE WORDS
//
// EVERY HEBREW STRING THIS FEATURE SHOWS OR SENDS, AND NOTHING ELSE, IN ONE BLOCK. The
// owner approved them on 2026-11-07, shown the list and a man's message, and in the same
// answer took out the line that told a man alone on a site «אין עובדים נוספים» (below).
// Hebrew strings are product decisions (CLAUDE.md, law 6): tests/seder.test.mjs pins every
// one of them, word for word, and changing one here moves the pinned line there, in the
// same commit. A name in a template is already bidi-isolated by the caller; the day name
// and the date come from js/ui/dom.js.
const SEDER_TEXT = Object.freeze({
    // --- the way in: a button in the WhatsApp dialog, under «💬 שלח בוואטסאפ»
    entry: '👷 לכל עובד בנפרד',

    // --- the list
    title: 'סידור לכל עובד',
    // under the title, after the day and the date: «יום חמישי 05/11/2026 · 6 עובדים»
    count: n => (n === 1 ? 'עובד אחד' : `${n} עובדים`),
    lead: 'כל עובד מקבל הודעה משלו: איפה הוא עובד ועם מי. וואטסאפ נפתח עם ההודעה מוכנה, ושם לוחצים על שליחה.',
    nobody: 'אין ביום הזה עובדים עם אתר עבודה.',
    noPhone: 'אין מספר טלפון תקין',
    // two men on this list with one number - both messages open in that one chat. The
    // roster's own word for it («מספר משותף», js/ui/roster.js), and who the other man is:
    // «⚠️ מספר משותף עם ח'אלד»
    shared: names => `⚠️ מספר משותף עם ${names}`,
    opened: '✓ נפתח בוואטסאפ',
    changed: '⚠️ השתנה מאז שנפתח - כדאי לפתוח שוב',
    // the door on each row, read aloud (the door itself is a drawn speech bubble)
    openOne: name => `פתח בוואטסאפ את ההודעה ל${name}`,
    // the run's button: «💬 פתח בוואטסאפ: אחמד»
    go: name => `💬 פתח בוואטסאפ: ${name}`,
    progress: (done, total) => `נפתחו ${done} מתוך ${total}`,
    allDone: '✓ כל ההודעות שנבחרו נפתחו בוואטסאפ',
    noneChosen: 'לא נבחר אף עובד',
    close: 'סגור',
    notKept: '⚠️ הסימונים לא נשמרו במכשיר - אם האפליקציה תיסגר, הם יאבדו.',

    // --- the message each man receives
    //   שלום אחמד,
    //   סידור עבודה ליום חמישי 05/11/2026:
    //
    //   📍 הרצליה
    //   👷 איתך: מוחמד, יוסי
    //
    //   📍 פרדסיה
    // A site where he is the only one of the owner's men has its site line and nothing
    // under it. There used to be «👷 איתך: אין עובדים נוספים» there, and the owner took it
    // out (2026-11-07): Rima's men can be on that site, and "nobody else" would be a claim
    // the record itself contradicts.
    hello: name => `שלום ${name},`,
    heading: (day, date) => `סידור עבודה ל${day} ${date}:`,
    site: name => `📍 ${name}`,
    with: names => `👷 איתך: ${names}`
});

// ================================================================== the list

// Everyone with a site on `date`, in roster order, each once.
//
// Built the way dayMessage builds the group message - active sites, and on each of them
// workersAtPlace in the layer it is handed - so a man is on this list exactly when he is
// under a site in the group message. workersAtPlace is what leaves out the man marked
// נעדר. Rima never appears: her count is keyed by site, not by worker, and is not read here.
function sederCrew(schedule, date, layer) {
    const places = ((schedule && schedule.places) || [])
        .filter(place => place && place.active !== false);
    const atPlace = new Map(places.map(place =>
        [place.id, { place, ids: workersAtPlace(schedule, date, place.id, layer) }]));
    const workers = (schedule && schedule.workers) || [];
    const nameOf = id => {
        const worker = workers.find(one => one && one.id === id);
        return worker ? worker.name : id;
    };

    const rows = workers.filter(Boolean).map(worker => {
        const seen = new Set();
        // The order his own day holds them in: the first site he was put on comes first.
        const sites = entriesFor(schedule, date, worker.id, layer)
            .map(entry => entry && entry.placeId)
            .filter(placeId => {
                if (seen.has(placeId) || !atPlace.has(placeId)) return false;
                seen.add(placeId);
                return atPlace.get(placeId).ids.includes(worker.id);
            })
            .map(placeId => ({
                placeId,
                name: atPlace.get(placeId).place.name,
                others: atPlace.get(placeId).ids.filter(id => id !== worker.id).map(nameOf)
            }));
        return { workerId: worker.id, name: worker.name, number: sederWaNumber(worker.phone), sites };
    }).filter(row => row.sites.length > 0);

    // Two men on this list with one number - the same man entered twice, a number copied
    // onto the wrong row, or two brothers on one phone - have both their messages opened in
    // one chat, and the man whose phone it is not gets nothing while his row says ✓. Each of
    // the two names the other, and neither is dropped or unticked: whether both messages go
    // there is the owner's to decide, and the list's job is that he decides it knowing.
    // Compared as the digits wa.me is handed, so 052-884-1930 and +972 52 884 1930 are one
    // number; a man with no usable number shares nothing. Only men on this list: a number
    // shared with a man who is not working tonight still gets one message, and the roster
    // already badges it («מספר משותף», js/ui/roster.js).
    rows.forEach(row => {
        row.sharedWith = row.number
            ? rows.filter(other => other !== row && other.number === row.number).map(other => other.name)
            : [];
    });
    return rows;
}

// One man's message. Every name isolated, the way the group message isolates them: a Latin
// or mixed name at the start of a line turns the whole line round, and inside a sentence it
// carries the punctuation to the wrong side of itself.
function sederMessage(row, date) {
    const parsed = parseLocalDate(date);
    const lines = [SEDER_TEXT.hello(isolate(row.name)),
        SEDER_TEXT.heading(hebrewDayName(parsed), formatFullDate(parsed))];
    row.sites.forEach(site => {
        lines.push('', SEDER_TEXT.site(isolate(site.name)));
        // Nobody else of the owner's on this site: the site line alone, and no claim about
        // who else is there (see SEDER_TEXT).
        if (site.others.length > 0) lines.push(SEDER_TEXT.with(site.others.map(isolate).join(', ')));
    });
    return lines.join('\n');
}

// The number wa.me is handed, or '' when there is none worth handing it.
//
// Digits only, and only when the number is plainly an Israeli mobile: 05X-XXX-XXXX becomes
// 9725X-XXX-XXXX, and +972 / 972 / 00972 - with or without the trunk zero somebody copied
// out of a contact card, "+972 (0)52-..." - is kept as 9725... Anything else - too short,
// too long, two numbers in one field, a landline, another country - is NOT A USABLE
// NUMBER, said on the row, and never guessed at: a guessed number opens a chat with a
// stranger, with a man's name and his site in it. Arabic-Indic digits are digits.
function sederWaNumber(phone) {
    let digits = String(phone === undefined || phone === null ? '' : phone)
        .replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x0660))
        .replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 0x06F0))
        .replace(/[^0-9]/g, '');
    if (digits.startsWith('00')) digits = digits.slice(2);
    if (/^05\d{8}$/.test(digits)) return '972' + digits.slice(1);
    const international = digits.match(/^9720?(5\d{8})$/);
    return international ? '972' + international[1] : '';
}

function sederUrl(number, text) {
    return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}

// ================================================================== the progress
//
// One key, a map by date:
//   { "2026-11-05": { opened: { w_01: { at, sig } }, off: { w_02: true }, at, open } }
// `opened` is who was opened in WhatsApp and the fingerprint of what he was opened with;
// `off` is who was left out of the run; `at` is when the evening was last touched and
// `open` whether its list was on screen then - the two that decide whether a reload brings
// the list back.
//
// A PREFERENCE, NOT A RECORD. Not a byte of it is in the schedule, so nothing that carries
// the schedule - the outbox, the cloud, a backup, a restore point - can carry it, and the
// rescue file takes named records only (js/recovery.js). Written OPTIONAL: on a full disk
// this must never spend a restore point to make room for itself, which is what a required
// write does. A write the disk refused is still held for this session, and the list says
// the marks were not kept. A value that will not read is read as nothing opened and nobody
// left out, and the next choice writes over it: unlike the record, nobody's work is in it.
const SEDER_PROGRESS_KEY = 'farkadSederProgress';
// A fortnight of evenings, by the last one touched. Older ones fall off.
const SEDER_KEEP_DATES = 14;
// How long after the last touch a list left open is brought back by a reload: long enough
// to send a message and come back, short enough that the next morning's app does not open
// on last night's list.
const SEDER_RESUME_MS = 20 * 60 * 1000;

let sederMemory = null;
let sederKept = true;

function sederEmptyDay() {
    return { opened: Object.create(null), off: Object.create(null), at: 0, open: false };
}

// Read leniently, validated strictly: a date that is not a date, an id that could land on
// a prototype, a mark without its fingerprint - each is dropped on its own, into maps with
// no prototype at all.
function sederParse(raw) {
    const out = Object.create(null);
    let parsed = null;
    try {
        parsed = raw ? JSON.parse(raw) : null;
    } catch (error) {
        parsed = null;
    }
    if (!isPlainObject(parsed)) return out;
    Object.keys(parsed).forEach(date => {
        const day = parsed[date];
        if (!isRealDate(date) || !isPlainObject(day)) return;
        const kept = sederEmptyDay();
        if (isPlainObject(day.opened)) {
            Object.keys(day.opened).forEach(id => {
                const mark = day.opened[id];
                if (isSafeId(id) && isPlainObject(mark) && typeof mark.sig === 'string'
                    && isFiniteNumber(mark.at)) kept.opened[id] = { at: mark.at, sig: mark.sig };
            });
        }
        if (isPlainObject(day.off)) {
            Object.keys(day.off).forEach(id => {
                if (isSafeId(id) && day.off[id] === true) kept.off[id] = true;
            });
        }
        kept.at = isFiniteNumber(day.at) ? day.at : 0;
        kept.open = day.open === true;
        out[date] = kept;
    });
    return out;
}

function sederAll() {
    if (!sederMemory) sederMemory = sederParse(Store.get(SEDER_PROGRESS_KEY));
    return sederMemory;
}

function sederDay(date) {
    const all = sederAll();
    return Object.prototype.hasOwnProperty.call(all, date) ? all[date] : null;
}

function sederTouch(date) {
    const all = sederAll();
    if (!Object.prototype.hasOwnProperty.call(all, date)) all[date] = sederEmptyDay();
    all[date].at = Date.now();
    return all[date];
}

// Down to the latest SEDER_KEEP_DATES evenings, then onto the disk. Answers whether it
// reached the disk; this session holds it either way.
function sederSave() {
    const all = sederAll();
    Object.keys(all)
        .sort((a, b) => (all[b].at - all[a].at) || (a < b ? 1 : a > b ? -1 : 0))
        .slice(SEDER_KEEP_DATES)
        .forEach(date => { delete all[date]; });
    sederKept = Store.set(SEDER_PROGRESS_KEY, JSON.stringify(all), { optional: true }) === true;
    return sederKept;
}

function sederProgressKept() {
    return sederKept;
}

function sederIsOn(date, workerId) {
    const day = sederDay(date);
    return !(day && day.off[workerId] === true);
}

function sederSetOn(date, workerId, on) {
    if (!isRealDate(date) || !isSafeId(workerId)) return false;
    const day = sederTouch(date);
    if (on) delete day.off[workerId];
    else day.off[workerId] = true;
    return sederSave();
}

// What a mark is checked against: the number and the words he was opened with. A seder
// changed after his message went out - he was moved, a man joined his site, his number was
// corrected - is a different fingerprint, and the mark stops being believed.
function sederSig(row, text) {
    const said = `${row.number}\n${text}`;
    let hash = 0x811c9dc5;
    for (let at = 0; at < said.length; at += 1) {
        hash ^= said.charCodeAt(at);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash.toString(16).padStart(8, '0');
}

function sederMarkOpened(date, row, text) {
    if (!isRealDate(date) || !row || !isSafeId(row.workerId)) return false;
    const day = sederTouch(date);
    day.opened[row.workerId] = { at: day.at, sig: sederSig(row, text) };
    return sederSave();
}

// 'nophone', 'opened', 'changed' (opened, and the seder has moved since), or ''.
function sederState(date, row) {
    if (!row.number) return 'nophone';
    const day = sederDay(date);
    const mark = day ? day.opened[row.workerId] : null;
    if (!mark) return '';
    return mark.sig === sederSig(row, sederMessage(row, date)) ? 'opened' : 'changed';
}

// Where the run stands: how many can be reached at all, how many are chosen, how many of
// those are opened with the seder as it is now, and who is next - the first chosen man,
// in list order, who is not.
function sederRun(rows, date) {
    const reachable = rows.filter(row => row.number);
    const chosen = reachable.filter(row => sederIsOn(date, row.workerId));
    const done = chosen.filter(row => sederState(date, row) === 'opened');
    return {
        reachable: reachable.length,
        total: chosen.length,
        done: done.length,
        next: chosen.find(row => sederState(date, row) !== 'opened') || null
    };
}

function sederSetListOpen(date, open) {
    if (!isRealDate(date)) return false;
    sederTouch(date).open = Boolean(open);
    return sederSave();
}

// The evening whose list was on screen within the last SEDER_RESUME_MS, or null.
function sederResumeDate(now) {
    const all = sederAll();
    const recent = Object.keys(all).filter(date => all[date].open
        && now - all[date].at >= 0 && now - all[date].at <= SEDER_RESUME_MS);
    recent.sort((a, b) => all[b].at - all[a].at);
    return recent[0] || null;
}

// ================================================================== the screen

// The evening the open list is about. Fixed when it opens: the list is a dialog, and the
// day behind it cannot move while it is up.
let sederListDate = null;

function sederParts() {
    const get = id => document.getElementById(id);
    return { modal: get('sederModal'), title: get('sederTitle'), context: get('sederContext'),
        lead: get('sederLead'), note: get('sederNote'), list: get('sederList'),
        status: get('sederStatus'), go: get('sederGo'), close: get('sederClose') };
}

function openSederList(date) {
    const parts = sederParts();
    if (!parts.modal || !parts.list) return false;
    sederListDate = isRealDate(date) ? date : State.date;
    sederSetListOpen(sederListDate, true);
    // One dialog at a time: the WhatsApp dialog this was entered from steps aside.
    if (typeof closeShareModal === 'function') closeShareModal();
    renderSederList();
    parts.modal.style.display = 'flex';
    // Entered at its heading, like every dialog that has one (js/ui/modal.js). Forced into
    // effect first: an element that was display:none a line ago cannot take focus until its
    // style is computed.
    void parts.modal.offsetHeight;
    if (parts.title && parts.title.focus) parts.title.focus({ preventScroll: true });
    return true;
}

function closeSederList() {
    const parts = sederParts();
    if (parts.modal) parts.modal.style.display = 'none';
    // Closed on purpose, so a reload does not bring it back.
    if (sederListDate) sederSetListOpen(sederListDate, false);
    sederListDate = null;
}

function renderSederIfOpen() {
    const modal = document.getElementById('sederModal');
    if (!modal || modal.style.display !== 'flex' || !sederListDate) return;
    renderSederList();
}

function renderSederList() {
    const parts = sederParts();
    if (!parts.list) return;
    const date = sederListDate || State.date;
    const parsed = parseLocalDate(date);
    const rows = sederCrew(State.schedule, date, State.layer);
    // Every row and the run are rebuilt; the control that had the keyboard gets it back.
    const focused = document.activeElement && document.activeElement.dataset
        ? document.activeElement.dataset.sederFocus : null;

    parts.title.textContent = SEDER_TEXT.title;
    parts.context.textContent =
        `${hebrewDayName(parsed)} ${formatFullDate(parsed)} · ${SEDER_TEXT.count(rows.length)}`;
    parts.lead.textContent = SEDER_TEXT.lead;
    parts.close.textContent = SEDER_TEXT.close;
    parts.note.textContent = SEDER_TEXT.notKept;
    parts.note.hidden = sederKept;

    clear(parts.list);
    if (rows.length === 0) parts.list.appendChild(el('p', 'empty-hint seder-nobody', SEDER_TEXT.nobody));
    rows.forEach(row => parts.list.appendChild(sederRowNode(row, date)));

    const run = sederRun(rows, date);
    const said = run.total === 0 ? (run.reachable > 0 ? SEDER_TEXT.noneChosen : '')
        : run.next ? SEDER_TEXT.progress(run.done, run.total) : SEDER_TEXT.allDone;
    // A live region that is only written when its sentence changes, from a node that is
    // never rebuilt - see sayOnce in js/sync/status.js and #dayLive in index.html.
    if (typeof sayOnce === 'function') sayOnce(parts.status, said);
    else if (parts.status.textContent !== said) parts.status.textContent = said;

    // In the moment after the run's button opened a man it keeps him, whatever redraws the
    // list meanwhile - see "one tap, one man" below.
    const next = sederHeld(rows, date, Date.now()) || run.next;
    clear(parts.go);
    if (next) {
        const go = sederDoor(next, date, 'seder-go', 'go');
        go.textContent = SEDER_TEXT.go(isolate(next.name));
        parts.go.appendChild(go);
    }

    // Found by comparing the values, never by a selector built from an id: a name is free
    // text, and a selector it breaks is a render that throws.
    if (focused) {
        const again = [...parts.modal.querySelectorAll('[data-seder-focus]')]
            .find(node => node.dataset.sederFocus === focused);
        if (again && again !== document.activeElement) again.focus({ preventScroll: true });
    }
}

function sederRowNode(row, date) {
    const state = sederState(date, row);
    const on = row.number ? sederIsOn(date, row.workerId) : false;
    const node = el('div', 'seder-row'
        + (row.number && !on ? ' seder-row-off' : '')
        + (state === 'nophone' ? ' seder-row-nophone' : ''));
    node.dataset.workerId = row.workerId;

    // The whole row is the tick's label: a name is a bigger target than a box.
    const pick = el(row.number ? 'label' : 'div', 'seder-pick');
    if (row.number) {
        const box = document.createElement('input');
        box.type = 'checkbox';
        box.className = 'seder-check';
        box.checked = on;
        box.dataset.sederFocus = `pick:${row.workerId}`;
        box.addEventListener('change', () => {
            sederSetOn(date, row.workerId, box.checked);
            renderSederList();
        });
        pick.appendChild(box);
    } else {
        const gap = el('span', 'seder-check-gap');
        gap.setAttribute('aria-hidden', 'true');
        pick.appendChild(gap);
    }

    const who = el('span', 'seder-who');
    who.appendChild(el('strong', 'seder-name', row.name));
    who.appendChild(el('span', 'seder-sites', row.sites.map(site => isolate(site.name)).join(' · ')));
    const said = { nophone: SEDER_TEXT.noPhone, opened: SEDER_TEXT.opened, changed: SEDER_TEXT.changed }[state];
    if (said) who.appendChild(el('span', state === 'opened' ? 'seder-state' : 'seder-state seder-state-warn', said));
    if (row.sharedWith && row.sharedWith.length > 0) {
        who.appendChild(el('span', 'seder-shared', SEDER_TEXT.shared(row.sharedWith.map(isolate).join(', '))));
    }
    pick.appendChild(who);
    node.appendChild(pick);

    // His own door, whether or not he is in the run: opening one man again - after a
    // change, or one the run left out - is the person's choice to make.
    if (row.number) {
        const door = sederDoor(row, date, 'seder-one', `one:${row.workerId}`);
        door.setAttribute('aria-label', SEDER_TEXT.openOne(isolate(row.name)));
        door.appendChild(typeof siteActionIcon === 'function' ? siteActionIcon(false) : el('span', null, '💬'));
        node.appendChild(door);
    }
    return node;
}

// ONE TAP, ONE MAN. A tap on a door is WhatsApp being opened, and a phone takes a moment to
// get there. A second tap in that moment - a habit (he taps twice in a row: css/app.css),
// or because the first seemed to do nothing - used to land on the run's button already
// redrawn for the next man: two chats opened, only one of them in front, the one he saw
// sent and the other left an unsent draft behind it, while both rows said ✓ and the run
// went on to a third man - nothing on the list pointed back at the man who got nothing
// (the v167 review, measured in Chromium and WebKit). So for SEDER_TAP_GUARD_MS after a
// door is used:
//   - every door on the list does nothing - no navigation, no mark. The second tap is
//     refused, not redirected, whichever door it lands on;
//   - the run's button keeps the man it has just opened, whatever redraws the list in that
//     moment (the person back at once, a snapshot from another phone), and names the next
//     man only once the moment is over.
// Nobody comes back from sending a message sooner than that, and a phone that has not left
// for WhatsApp by then is not going to.
const SEDER_TAP_GUARD_MS = 1500;
// The last door used: { at, date, workerId, run }. This session's alone - a reload starts
// with nothing held, and none of it is written anywhere.
let sederLastTap = null;

function sederGuarded(now) {
    if (!sederLastTap) return false;
    const since = now - sederLastTap.at;
    // A clock put back is no reason to refuse taps for as long as it went back.
    return since >= 0 && since < SEDER_TAP_GUARD_MS;
}

// The man the run's button keeps while the moment lasts, when it was the run's button that
// opened him - or null, and the run names whoever is next.
function sederHeld(rows, date, now) {
    if (!sederGuarded(now) || !sederLastTap.run || sederLastTap.date !== date) return null;
    return rows.find(row => row.workerId === sederLastTap.workerId && row.number) || null;
}

// The redraw that moves the run on once the moment is over. A timer that fires a little
// early waits again, rather than redrawing with the man still held and leaving him there.
function sederAfterGuard() {
    const left = sederLastTap ? SEDER_TAP_GUARD_MS - (Date.now() - sederLastTap.at) : 0;
    if (left > 0 && left <= SEDER_TAP_GUARD_MS) setTimeout(sederAfterGuard, left + 20);
    else renderSederIfOpen();
}

// A real link with the whole address already on it, so the tap IS the navigation. Marking
// him happens inside the same tap; nothing on the list is redrawn by it until the moment
// after it is over (above), because the link being followed must not be rewritten under
// the finger.
function sederDoor(row, date, className, focusKey) {
    const text = sederMessage(row, date);
    const door = document.createElement('a');
    door.className = className;
    door.href = sederUrl(row.number, text);
    door.target = '_blank';
    door.rel = 'noopener noreferrer';
    door.dataset.sederFocus = focusKey;
    door.addEventListener('click', event => {
        const now = Date.now();
        if (sederGuarded(now)) {
            event.preventDefault();
            return;
        }
        sederLastTap = { at: now, date, workerId: row.workerId, run: focusKey === 'go' };
        sederMarkOpened(date, row, text);
        setTimeout(sederAfterGuard, SEDER_TAP_GUARD_MS);
    });
    return door;
}

// Back from WhatsApp, the screen is brought up to date - the marks, the next man, and any
// change another phone made to the seder meanwhile.
function sederWatch() {
    if (typeof document === 'undefined' || !document.addEventListener) return;
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') renderSederIfOpen();
    });
}

// The list was open when the app went away - iOS kills a home-screen app in the background
// whenever it likes, and WhatsApp in front is exactly when. Called once, after the boot has
// drawn (js/app.js). Not over another dialog the boot opened, and not when a reminder is
// what opened the app: that tap is going to today, and it wins.
function resumeSederRun() {
    try {
        if (typeof location !== 'undefined'
            && new URL(location.href).searchParams.has('farkad-reminder')) return false;
    } catch (error) {
        return false;
    }
    if ([...document.querySelectorAll('.modal')].some(modal => modal.style.display === 'flex')) return false;
    const date = sederResumeDate(Date.now());
    if (!date) return false;
    State.date = date;
    if (typeof render === 'function') render();
    return openSederList(date);
}

// The way in, added to the WhatsApp dialog under its green button. Built here rather than
// written into index.html because its label is one of the words above.
function sederInstallEntry() {
    if (typeof document === 'undefined' || !document.querySelector) return;
    const actions = document.querySelector('#shareModal .modal-actions');
    if (!actions || document.getElementById('sederEntry')) return;
    const entry = button(SEDER_TEXT.entry, 'btn-secondary seder-entry', () => openSederList(State.date));
    entry.id = 'sederEntry';
    const send = actions.querySelector('.btn-success');
    actions.insertBefore(entry, send ? send.nextSibling : actions.firstChild);
}

sederInstallEntry();
sederWatch();
