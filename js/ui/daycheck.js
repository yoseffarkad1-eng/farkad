// «בדיקת היום» - the day's check: what may have been FORGOTTEN, in one look, before the
// day goes out on WhatsApp.
//
// The day screen already says who has no record («לא נרשמו»), and on a roster where some
// men are not recorded every evening that tray is long every evening - so it stops being
// read, and the man who worked yesterday and was skipped today is one name among ten. What
// nothing on the screen says at all is a site's Rima count left empty, a day that will
// price at nothing, or overtime chosen with no hours typed. This file reads the day
// against the days before it and says only those things.
//
// IT WRITES NOTHING. No commit, no Store key, nothing to the record, the outbox, the
// cloud, a backup or the rescue file, and it never marks a day "checked": a mark would be
// a claim that somebody looked, and the app cannot know that. Every rule is a pure
// function of (schedule, date, layer, today) - no DOM, no clock, no storage - and
// tests/daycheck.test.mjs holds the whole disk byte for byte across it. A name or a site
// in the list only NAVIGATES: a man opens the assign sheet his name already opens on the
// day, a site is scrolled to. The check fixes nothing.
//
// IT IS BUILT NOT TO CRY WOLF, because a check that finds something every evening is the
// tray again. Every rule below was measured on seeded seasons of plausible days in which
// NOTHING was forgotten, and tightened until it was quiet there; tests/daycheck.test.mjs
// runs those seasons and holds the ceilings, and says what each rule cost in misses.
//
//   THE PREVIOUS WORKING DAY comes from the record, never from the calendar: the latest
//     date before the one on screen on which at least one man has a site. An empty Friday,
//     a Saturday, a holiday, a «הכל חופש» day (absences only) and a day holding only a Rima
//     count are not working days, and are stepped over. A previous working day more than
//     DAY_CHECK_STALE_DAYS calendar days back says nothing about this one, and then
//     nothing is compared at all.
//   "THE SAME AS LAST WEEK" is the one exception rules 1-3 share, and it is what keeps a
//     short Friday quiet: when the same weekday a week earlier was a working day, and the
//     thing was there on the working day before it and not on it, this week's repeat of
//     that is a habit and not a slip.
//   1. NOT RECORDED: an active man with no record on this day - no site and not «נעדר» -
//     who had a site on the previous working day. A man marked «נעדר» was answered; a man
//     who did not work the day before is not guessed at.
//   2. A SITE LEFT EMPTY is said only when it explains rule 1: an active site with men on
//     the previous working day and none on this one, AND at least one of those men still
//     with no record. Those men are named under the site and not again under rule 1. A
//     site whose men were all moved or marked «נעדר» was emptied on purpose - sites end -
//     and is not mentioned.
//   3. RIMA: an active site with a Rima count on the previous working day and none on this
//     one. Never on a date after today: tomorrow's seder is written tonight, and nobody
//     can count Rima's men for tomorrow.
//   4. A DAY THAT WILL NOT PRICE, read the way the pay report reads it (ratesForDay,
//     js/model/money.js): a man with a site and no daily rate; extra hours with no hourly
//     rate; and «שעות נוספות» chosen with no hours typed, which pays as a regular day.
//   5. FOR INFORMATION, under its own heading and never counted as something to check:
//     active men with no site for DAY_CHECK_AWAY_MIN..DAY_CHECK_AWAY_MAX working days in a
//     row, and this day's days that are not regular - two sites, a double day, extra
//     hours - on one line, to be confirmed.
//
// An archived man is never "forgotten" (rules 1, 2 and the first half of 5 read active men
// only); a deleted one is not on the roster and is nowhere. A man archived today who has a
// site today is still read by rule 4 and by the not-regular line: those are about the
// day's records, not about who is missing.
//
// Entered from ONE button at the foot of the day's list, under the two trays and above
// the dock - the header and the dock are measured to the pixel and were not touched.

// ================================================================== THE WORDS
//
// EVERY HEBREW STRING THIS FEATURE SHOWS, AND NOTHING ELSE, IN ONE BLOCK. Proposed, not
// approved word by word: the owner corrects them. Hebrew strings are product decisions
// (CLAUDE.md, law 6) - tests/daycheck.test.mjs pins every one, word for word, and changing
// one here moves the pinned line there in the same commit. The words that already existed
// are taken as they are: «נרשמו» and «לא נרשמו» (the day), «רימא», «שכר יומי» and «שכר
// שעה» (the pay sheet), «יום כפול» (RATE_LABELS, read from there and not repeated here),
// «שעות נוספות», «2 אתרים» (the badge on a man's row), «ש׳» (the day's message), «סגור».
// A name in a template is already bidi-isolated by the caller. Nothing here is ever sent
// anywhere: the dialog is on the screen only, so its Rima line is in no WhatsApp text.
const DAY_CHECK_TEXT = Object.freeze({
    // --- the way in, at the foot of the day's list
    entry: 'בדיקת היום',

    // --- the dialog
    title: 'בדיקת היום',
    // under the title, after the day and its date: «יום ראשון 08/11/2026 · בהשוואה ליום חמישי 05/11»
    compared: previous => `בהשוואה ל${previous}`,
    noPrevious: 'אין יום עבודה קרוב להשוות אליו.',
    lead: 'הבדיקה רק מראה מה כדאי לבדוק. היא לא משנה ולא שומרת דבר.',
    clean: '✓ לא נמצא דבר שנראה שנשכח.',
    headCheck: 'כדאי לבדוק',
    headInfo: 'לידיעה',
    close: 'סגור',

    // --- what a name or a site in the list does, read aloud
    goWorker: name => `פתח את הרישום של ${name}`,
    goSite: name => `הצג את האתר ${name}`,

    // --- כדאי לבדוק
    // «עבדו ביום חמישי 05/11 ועדיין לא נרשמו:» and then the names
    forgot: (count, previous) => (count === 1
        ? `עבד ב${previous} ועדיין לא נרשם:`
        : `עבדו ב${previous} ועדיין לא נרשמו:`),
    // «בהרצליה אין אף עובד. עבדו שם ביום חמישי 05/11 ועדיין לא נרשמו:»
    emptySite: (site, count, previous) => (count === 1
        ? `ב${site} אין אף עובד. עבד שם ב${previous} ועדיין לא נרשם:`
        : `ב${site} אין אף עובד. עבדו שם ב${previous} ועדיין לא נרשמו:`),
    // «רימא: היה רישום ביום חמישי 05/11, ואין רישום ביום הזה:» and then the sites
    rima: previous => `רימא: היה רישום ב${previous}, ואין רישום ביום הזה:`,
    noDaily: 'בלי שכר יומי - היום הזה לא יחושב בשכר:',
    noHourly: 'שעות נוספות בלי שכר שעה - לא ייכללו בסכום:',
    extraNoHours: 'שעות נוספות בלי מספר שעות - ישולם יום רגיל:',

    // --- לידיעה
    away: 'פעילים שלא עבדו שבוע עבודה או יותר:',
    // on a man's chip: «אחמד · 6 ימים»
    awayDays: (name, days) => `${name} · ${days} ימים`,
    // one line for every day that is not a regular one; what is not regular about it is on
    // the man's chip: «יוסי · 2 אתרים · ‎+2 ש׳», «סמיר · יום כפול»
    unusual: 'לא יום רגיל - לאישור:',
    sites: count => `${count} אתרים`,
    hours: amount => `${amount} ש׳`
});

// ================================================================== the rules
//
// Pure, all of it: (schedule, date, layer, today) in, a plain object out. Nothing below
// this line and above "the screen" touches the DOM, Store, State or the clock.

// A previous working day further back than this says nothing about the day on screen: a
// fortnight is one account.
const DAY_CHECK_STALE_DAYS = 14;
// "Has not worked" is said from the fifth working day in a row - a working week - and no
// longer after the twelfth: past that it is not news, it is a question about the roster.
// From the third day, as it was first written, it spoke on one seeded evening in two.
const DAY_CHECK_AWAY_MIN = 5;
const DAY_CHECK_AWAY_MAX = 12;

function dayCheckSide(schedule, date, layer) {
    const day = schedule && schedule.days && schedule.days[date];
    const side = day && day[layer];
    return side && typeof side === 'object' ? side : null;
}

// A site that day: an entry, and not marked absent. The reading workersAtPlace makes.
function dayCheckHasSite(schedule, date, workerId, layer) {
    const side = dayCheckSide(schedule, date, layer);
    const record = side && Object.prototype.hasOwnProperty.call(side, workerId) ? side[workerId] : null;
    return Boolean(record && !record.absent && Array.isArray(record.entries) && record.entries.length > 0);
}

// No site and no absence: nothing was said about him.
function dayCheckUnrecorded(schedule, date, workerId, layer) {
    return !isAbsent(schedule, date, workerId, layer)
        && entriesFor(schedule, date, workerId, layer).length === 0;
}

// A WORKING DAY: at least one man has a site on it. Any man the record holds - an archived
// man's day is still a day that was worked. Absences alone, or a Rima count alone, are not.
function dayCheckIsWorkingDay(schedule, date, layer) {
    const side = dayCheckSide(schedule, date, layer);
    return Boolean(side) && Object.keys(side).some(id => dayCheckHasSite(schedule, date, id, layer));
}

// The working days BEFORE `date`, latest first, at most `limit` of them.
function dayCheckWorkingDaysBefore(schedule, date, layer, limit) {
    const out = [];
    const dates = Object.keys((schedule && schedule.days) || {})
        .filter(day => isRealDate(day) && day < date)
        .sort();
    for (let at = dates.length - 1; at >= 0 && out.length < limit; at -= 1) {
        if (dayCheckIsWorkingDay(schedule, dates[at], layer)) out.push(dates[at]);
    }
    return out;
}

function dayCheckGapDays(from, to) {
    return Math.round((parseLocalDate(to) - parseLocalDate(from)) / 86400000);
}

// The day this one is compared with, or null: the latest working day before it, when that
// is no more than DAY_CHECK_STALE_DAYS calendar days back.
function dayCheckPrevious(schedule, date, layer) {
    const previous = dayCheckWorkingDaysBefore(schedule, date, layer, 1)[0] || null;
    if (!previous || dayCheckGapDays(previous, date) > DAY_CHECK_STALE_DAYS) return null;
    return previous;
}

function dayCheckShiftDate(date, days) {
    const parsed = parseLocalDate(date);
    parsed.setDate(parsed.getDate() + days);
    return toLocalDateStr(parsed);
}

// Everything the check has to say about `date`:
//   { date, previous, check: [finding], info: [finding] }
// A finding is { kind, workers: [{ id, name, ... }], place?: { id, name },
// places?: [{ id, name }] } - names and ids only; the words are put on by dayCheckSentence
// and dayCheckChipText.
function dayCheckRead(schedule, date, layer, today) {
    const result = { date, previous: null, check: [], info: [] };
    if (!schedule || !isRealDate(date)) return result;
    const workers = (schedule.workers || []).filter(Boolean);
    const places = (schedule.places || []).filter(place => place && place.active !== false);
    const active = workers.filter(worker => worker.active !== false);
    const who = worker => ({ id: worker.id, name: worker.name });

    const previous = dayCheckPrevious(schedule, date, layer);
    result.previous = previous;

    // "The same as last week": the same weekday a week earlier was a working day, and the
    // thing asked about was there on the working day before it and not on it.
    const weekAgo = dayCheckShiftDate(date, -7);
    const beforeWeekAgo = dayCheckIsWorkingDay(schedule, weekAgo, layer)
        ? (dayCheckWorkingDaysBefore(schedule, weekAgo, layer, 1)[0] || null) : null;
    const sameLastWeek = had => Boolean(beforeWeekAgo) && had(beforeWeekAgo) && !had(weekAgo);

    // ---- 1 and 2: the men of the previous working day with nothing said about them
    const named = new Set();
    if (previous) {
        const missing = active.filter(worker => dayCheckUnrecorded(schedule, date, worker.id, layer)
            && dayCheckHasSite(schedule, previous, worker.id, layer)
            && !sameLastWeek(day => dayCheckHasSite(schedule, day, worker.id, layer)));
        const missingIds = new Set(missing.map(worker => worker.id));

        places.forEach(place => {
            if (workersAtPlace(schedule, date, place.id, layer).length > 0) return;
            const men = workersAtPlace(schedule, previous, place.id, layer)
                .filter(id => missingIds.has(id) && !named.has(id));
            if (men.length === 0) return;
            men.forEach(id => named.add(id));
            result.check.push({ kind: 'emptySite', place: { id: place.id, name: place.name },
                workers: missing.filter(worker => men.includes(worker.id)).map(who) });
        });

        const rest = missing.filter(worker => !named.has(worker.id));
        rest.forEach(worker => named.add(worker.id));
        if (rest.length > 0) result.check.push({ kind: 'forgot', workers: rest.map(who) });
    }

    // ---- 3: Rima. Not for a date after today, and not with nothing to compare with.
    if (previous && isRealDate(today) && date <= today) {
        const sites = places.filter(place => rimaCount(schedule, date, place.id) === 0
            && rimaCount(schedule, previous, place.id) > 0
            && !sameLastWeek(day => rimaCount(schedule, day, place.id) > 0));
        if (sites.length > 0) {
            result.check.push({ kind: 'rima', workers: [],
                places: sites.map(place => ({ id: place.id, name: place.name })) });
        }
    }

    // ---- 4 and the days that are not regular: every man the roster holds with a site on
    // this day, archived or not - these are about the day's records, not about who is missing
    const noDaily = [];
    const noHourly = [];
    const extraNoHours = [];
    const unusual = [];
    workers.forEach(worker => {
        if (!dayCheckHasSite(schedule, date, worker.id, layer)) return;
        const entries = entriesFor(schedule, date, worker.id, layer);
        const hours = entries.reduce((sum, entry) => sum + entryExtraHours(entry), 0);
        const rates = entries.map(entryRate);
        const sites = new Set(entries.map(entry => entry && entry.placeId)).size;

        if (hours === 0 && rates.includes(RATE_EXTRA)) extraNoHours.push(who(worker));
        if (sites > 1 || rates.includes(RATE_DOUBLE) || hours > 0) {
            unusual.push({ id: worker.id, name: worker.name, sites,
                double: rates.includes(RATE_DOUBLE), hours });
        }

        // The pay report reads the 'actual' layer and no other (ratesForDay); so does this.
        if (layer !== 'actual') return;
        const pay = ratesForDay(schedule, date, worker.id, worker);
        // The report's own order: a day with no daily rate is not priced at all, and its
        // hours are not looked at.
        if (pay.daily <= 0) noDaily.push(who(worker));
        else if (hours > 0 && pay.hourly <= 0) noHourly.push(who(worker));
    });
    if (extraNoHours.length > 0) result.check.push({ kind: 'extraNoHours', workers: extraNoHours });
    if (noDaily.length > 0) result.check.push({ kind: 'noDaily', workers: noDaily });
    if (noHourly.length > 0) result.check.push({ kind: 'noHourly', workers: noHourly });

    // ---- 5: active men with no site for a working week or more in a row
    if (previous) {
        const back = dayCheckWorkingDaysBefore(schedule, date, layer, DAY_CHECK_AWAY_MAX + 1);
        const todayWorked = dayCheckIsWorkingDay(schedule, date, layer);
        const away = [];
        active.forEach(worker => {
            if (named.has(worker.id) || dayCheckHasSite(schedule, date, worker.id, layer)) return;
            const last = back.findIndex(day => dayCheckHasSite(schedule, day, worker.id, layer));
            // No site anywhere in the window: never worked, or away longer than is news.
            if (last === -1) return;
            const days = last + (todayWorked ? 1 : 0);
            if (days >= DAY_CHECK_AWAY_MIN && days <= DAY_CHECK_AWAY_MAX) {
                away.push({ id: worker.id, name: worker.name, days });
            }
        });
        if (away.length > 0) result.info.push({ kind: 'away', workers: away });
    }
    if (unusual.length > 0) result.info.push({ kind: 'unusual', workers: unusual });

    return result;
}

// «יום חמישי 05/11» - the day's name and its short date, the way the copy button names a day.
function dayCheckDayLabel(date) {
    const parsed = parseLocalDate(date);
    return `${hebrewDayName(parsed)} ${formatShortDate(parsed)}`;
}

// The sentence a finding is introduced by. Pure: the words above and the two dates.
function dayCheckSentence(finding, previous) {
    const before = previous ? dayCheckDayLabel(previous) : '';
    if (finding.kind === 'forgot') return DAY_CHECK_TEXT.forgot(finding.workers.length, before);
    if (finding.kind === 'emptySite') {
        return DAY_CHECK_TEXT.emptySite(isolate(finding.place.name), finding.workers.length, before);
    }
    if (finding.kind === 'rima') return DAY_CHECK_TEXT.rima(before);
    return DAY_CHECK_TEXT[finding.kind];
}

// What a man's chip says: his name, and what the finding is about him when it has more to
// say - «אחמד · 6 ימים», «יוסי · 2 אתרים · ‎+2 ש׳», «סמיר · יום כפול».
function dayCheckChipText(finding, worker) {
    if (finding.kind === 'away') return DAY_CHECK_TEXT.awayDays(isolate(worker.name), worker.days);
    if (finding.kind === 'unusual') {
        const notes = [];
        if (worker.sites > 1) notes.push(DAY_CHECK_TEXT.sites(worker.sites));
        if (worker.double) notes.push(RATE_LABELS[RATE_DOUBLE]);
        if (worker.hours > 0) notes.push(DAY_CHECK_TEXT.hours(plusAmount(worker.hours)));
        return [isolate(worker.name)].concat(notes).join(' · ');
    }
    return worker.name;
}

// The line under the title.
function dayCheckContext(date, previous) {
    const parsed = parseLocalDate(date);
    const day = `${hebrewDayName(parsed)} ${formatFullDate(parsed)}`;
    return previous ? `${day} · ${DAY_CHECK_TEXT.compared(dayCheckDayLabel(previous))}`
        : `${day} · ${DAY_CHECK_TEXT.noPrevious}`;
}

// ================================================================== the screen

function dayCheckParts() {
    const get = id => document.getElementById(id);
    return { modal: get('dayCheckModal'), title: get('dayCheckTitle'), context: get('dayCheckContext'),
        list: get('dayCheckList'), lead: get('dayCheckLead'), close: get('dayCheckClose') };
}

// The one way in, built for the foot of the day's list (js/ui/day.js). Here rather than
// in index.html because its label is one of the words above.
function dayCheckEntry() {
    const row = el('div', 'daycheck-row');
    const entry = button(DAY_CHECK_TEXT.entry, 'btn-secondary daycheck-entry', () => openDayCheck());
    entry.id = 'dayCheckEntry';
    row.appendChild(entry);
    return row;
}

function dayCheckIsOpen() {
    const modal = document.getElementById('dayCheckModal');
    return Boolean(modal && modal.style.display === 'flex');
}

function openDayCheck() {
    const parts = dayCheckParts();
    if (!parts.modal || !parts.list) return false;
    renderDayCheck();
    parts.modal.style.display = 'flex';
    // Entered at its heading, like every dialog that has one (js/ui/modal.js). Forced into
    // effect first: an element that was display:none a line ago cannot take focus.
    void parts.modal.offsetHeight;
    if (parts.title && parts.title.focus) parts.title.focus({ preventScroll: true });
    return true;
}

function closeDayCheck() {
    const modal = document.getElementById('dayCheckModal');
    if (!modal || modal.style.display !== 'flex') return;
    modal.style.display = 'none';
    // THE WAY BACK. js/ui/modal.js gives the focus back to the button that opened the
    // dialog - but the day is drawn again from nothing whenever the record changes under
    // an open dialog, and the button it remembers is then no longer on the page: the
    // keyboard would be left on <body>. So, once that has had its turn, and only if nothing
    // else took the focus (the sheet a name opens, the site a site scrolls to), the button
    // that stands there now takes it. Focus only, never a scroll.
    setTimeout(() => {
        // "Nothing" is <body> - or a chip of the dialog that has just been hidden, which a
        // browser goes on calling the active element until it next lays the page out.
        const active = document.activeElement;
        const lost = !active || active === document.body || modal.contains(active);
        const entry = document.getElementById('dayCheckEntry');
        const open = [...document.querySelectorAll('.modal')].some(node => node.style.display === 'flex');
        if (lost && entry && !open) entry.focus({ preventScroll: true });
    }, 0);
}

// Called by every render of the day (js/ui/day.js): a snapshot from another phone that
// moved a man must move him here too. Always the day on screen - it is the only day the
// dialog is ever about.
function renderDayCheckIfOpen() {
    if (dayCheckIsOpen()) renderDayCheck();
}

// ------------------------------------------------------------------ the two doors
//
// THE CHECK, FOR ANY SCREEN THAT WANTS IT. The dialog above is drawn through these two and
// through nothing else, so a second screen that embeds the check shows the same findings
// in the same words - there is one implementation.
//
//   dayCheckFindings(date)              -> [finding], [] when nothing was found
//   renderDayCheckInto(container, date) -> the number of findings it drew
//
// `date` is a YYYY-MM-DD; anything else means the day on screen. Both READ - the live
// schedule, the layer the day screen reads, and today's date - and write nothing.

// What the check says about `date` on the record as it is now, as a flat list: what to
// check first, then what is for information. Each finding is
//   { kind, tier: 'check' | 'info', text, say, chips: [{ text, workerId? | placeId? }],
//     workers, places }
// where `say` is its sentence, `chips` the names under it, and `text` the two as one plain
// line - «עבד ביום חמישי 05/11 ועדיין לא נרשם: סמיר».
function dayCheckFindings(date) {
    const day = isRealDate(date) ? date : State.date;
    const read = dayCheckRead(State.schedule, day, State.layer, todayStr());
    const out = [];
    [['check', read.check], ['info', read.info]].forEach(([tier, findings]) => {
        findings.forEach(finding => {
            const places = finding.place ? [finding.place] : (finding.places || []);
            const chips = places.map(place => ({ text: place.name, placeId: place.id }))
                .concat(finding.workers.map(worker => ({ text: dayCheckChipText(finding, worker), workerId: worker.id })));
            const say = dayCheckSentence(finding, read.previous);
            out.push({ kind: finding.kind, tier, say, chips,
                text: `${say} ${chips.map(chip => isolate(chip.text)).join(', ')}`,
                workers: finding.workers, places });
        });
    });
    return out;
}

// The same list the dialog shows, drawn into `container` (which is emptied first): the
// calm line when nothing under «כדאי לבדוק» was found, then the two groups. Returns how
// many findings it drew, of both kinds - 0 is a container holding the calm line alone.
//
// A name NAVIGATES only when `date` is the day on screen: the assign sheet and the site
// cards are that day's, and a chip that opened them for another date would open the wrong
// day's record. For any other date the names are drawn as names, with nothing to press.
function renderDayCheckInto(container, date) {
    if (!container) return 0;
    const day = isRealDate(date) ? date : State.date;
    const live = day === State.date;
    const findings = dayCheckFindings(day);
    // The list is rebuilt; the chip that had the keyboard gets it back.
    const focused = document.activeElement && document.activeElement.dataset
        && container.contains(document.activeElement) ? document.activeElement.dataset.daycheckFocus : null;

    clear(container);
    // The calm line is about what may have been forgotten, and is said whenever nothing
    // of that kind was found - with the «לידיעה» lines under it when there are any.
    if (!findings.some(finding => finding.tier === 'check')) {
        container.appendChild(el('p', 'daycheck-clean', DAY_CHECK_TEXT.clean));
    }
    [['check', DAY_CHECK_TEXT.headCheck, 'daycheck-group daycheck-check'],
        ['info', DAY_CHECK_TEXT.headInfo, 'daycheck-group daycheck-info']].forEach(([tier, head, className]) => {
        const mine = findings.filter(finding => finding.tier === tier);
        if (mine.length === 0) return;
        const group = el('section', className);
        group.appendChild(el('h4', 'daycheck-head', head));
        mine.forEach(finding => group.appendChild(dayCheckFindingNode(finding, live)));
        container.appendChild(group);
    });

    // Found by comparing the values, never by a selector built from an id (js/ui/seder.js).
    if (focused) {
        const again = [...container.querySelectorAll('[data-daycheck-focus]')]
            .find(node => node.dataset.daycheckFocus === focused);
        if (again && again !== document.activeElement) again.focus({ preventScroll: true });
    }
    return findings.length;
}

// The dialog: its frame's words, and the list through the door above.
function renderDayCheck() {
    const parts = dayCheckParts();
    if (!parts.list) return;
    parts.title.textContent = DAY_CHECK_TEXT.title;
    parts.context.textContent = dayCheckContext(State.date,
        dayCheckPrevious(State.schedule, State.date, State.layer));
    parts.lead.textContent = DAY_CHECK_TEXT.lead;
    parts.close.textContent = DAY_CHECK_TEXT.close;
    renderDayCheckInto(parts.list, State.date);
}

function dayCheckFindingNode(finding, live) {
    const node = el('div', 'daycheck-finding');
    node.dataset.kind = finding.kind;
    node.appendChild(el('p', 'daycheck-say', finding.say));
    const chips = el('div', 'daycheck-chips');
    finding.chips.forEach(chip => chips.appendChild(chip.placeId !== undefined
        ? dayCheckSiteChip(finding, chip, live) : dayCheckWorkerChip(finding, chip, live)));
    node.appendChild(chips);
    return node;
}

// A man: the assign sheet his name already opens on the day, staying on him. Read aloud,
// a chip that says more than his name says that first: «עלי · יום כפול - פתח את הרישום של עלי».
function dayCheckWorkerChip(finding, chip, live) {
    const worker = finding.workers.find(one => one.id === chip.workerId);
    if (!live) return el('span', 'daycheck-plain', chip.text);
    const go = DAY_CHECK_TEXT.goWorker(isolate(worker.name));
    const node = button(chip.text, 'btn-secondary daycheck-go daycheck-man',
        () => dayCheckGoWorker(worker.id), chip.text === worker.name ? go : `${chip.text} - ${go}`);
    node.dataset.daycheckFocus = `${finding.kind}:w:${worker.id}`;
    return node;
}

// A site: scrolled to, when its card is on the screen (the day, in the by-site view). In
// the by-worker view, or on another screen, there is no card to show, and the name is a
// name and not a button - changing the view for him would write a preference, and this
// writes nothing.
function dayCheckSiteChip(finding, chip, live) {
    if (!live || !dayCheckSiteNode(chip.placeId)) return el('span', 'daycheck-site daycheck-plain', chip.text);
    const node = button(chip.text, 'btn-secondary daycheck-go daycheck-site',
        () => dayCheckGoSite(chip.placeId), DAY_CHECK_TEXT.goSite(isolate(chip.text)));
    node.dataset.daycheckFocus = `${finding.kind}:p:${chip.placeId}`;
    return node;
}

// The head of a site's card on the day, when it is on the screen - found by comparing its
// key: an id is never put into a selector.
function dayCheckSiteNode(placeId) {
    return [...document.querySelectorAll('#dayView [data-anchor]')]
        .find(node => node.dataset.anchor === 'head:' + placeId && node.offsetParent !== null) || null;
}

// closeDayCheck does nothing when the dialog is not what the chip was drawn in.
function dayCheckGoWorker(workerId) {
    closeDayCheck();
    if (State.worker(workerId) && typeof openAssignSheet === 'function') {
        openAssignSheet(workerId, { stay: true });
    }
}

// After the dialog has closed and given the focus back (js/ui/modal.js does that in a
// microtask): the card is brought to the middle of the screen, clear of the pinned header
// and the dock, and its first control takes the keyboard.
function dayCheckGoSite(placeId) {
    closeDayCheck();
    setTimeout(() => {
        const head = dayCheckSiteNode(placeId);
        if (!head) return;
        const card = head.closest('.site-card') || head;
        card.scrollIntoView({ block: 'center' });
        const first = head.querySelector('button');
        if (first) first.focus({ preventScroll: true });
    }, 0);
}
