// «האתר הקבוע» - where a man usually works, offered in the tray of the men not recorded.
//
// The seder is built in the evening for tomorrow, and most men go where they went
// yesterday: the same site for weeks, a few of them moving. Until this the two ways to
// say so were «מהיום הקודם», which copies the whole of the last day at once - its double
// days, its extra hours and its absences with it - and opening every man and choosing his
// site from all of them. This is the third: beside each man in «לא נרשמו» ONE chip, the
// site he is most likely at, and one tap puts him there for the day on screen.
//
// WHAT IT IS NOT. It is not a record and it is not a memory. Nothing is learned and
// nothing is kept: the suggestion is worked out from the record every time the day is
// drawn, by one pure function, and thrown away. Nothing is written until the chip is
// tapped - no man is ever placed by this file on its own.
//
// WHAT THE TAP DOES. Exactly what choosing that site in his sheet does, by the sheet's own
// function (sheetPickPlace, js/ui/sheet.js): a REGULAR day at that site - never a double
// day, never extra hours, whatever his last days were - one field path
// (days.<date>.<layer>.<man>), through the journal, with the step back on ↶ and the day
// kept where it was on the screen. This file calls no writer of its own; it names
// neither the journal nor the queue. tests/usual.test.mjs compares the whole disk of a
// phone that tapped the chip with one that picked the site in the sheet, byte for byte.
//
// THERE IS NO «ALL OF THEM» BUTTON, on purpose. It was asked for on one condition: that
// the day's existing batch could do it as it stands. It cannot. copyDayInto (js/ui/sheet.js)
// copies ONE earlier day into this one - every site of it, its rates and hours, its
// absences - and bulkAssign (js/ui/day.js) puts every man left on ONE site. Neither takes
// a list of «this man there»; a third batch would have been a new writer of the day, and
// this feature adds none.

// ------------------------------------------------------------------ every word
//
// PROPOSED, all three; pinned word for word in tests/usual.test.mjs. The arrow points the
// way the line is read: his name, then where he goes. The accessible name is the tray's
// own «שבץ את <X>» with the site added, the way the picker says «הוסף את <X> ל<Y>».
const USUAL_TEXT = Object.freeze({
    arrow: '←',
    aria: (worker, place) => `שבץ את ${isolate(worker)} ב${isolate(place)}`,
    note: 'האתר ליד השם הוא הצעה לפי הימים האחרונים. נגיעה בו משבצת.'
});

// ------------------------------------------------------------------ the rule
//
// PURE: a schedule, a date, a layer and a man in; a site's id, or null, out. Nothing
// kept, nothing changed, no clock, no screen. NEVER A GUESS - when the record does not
// say plainly where he is, there is no chip, and his name opens every site as before.
//
// Read: his working days - a day he has a site on and is not marked נעדר - among the
// USUAL_WINDOW_DAYS calendar days before the day on screen, the latest USUAL_LOOK of them.
//
//   1. None: no chip.
//   2. Two sites on the latest of them: no chip. Which of the two is tomorrow's is not
//      something the record knows.
//   3. Is he SETTLED where he was last? Either he was on that one site, and on it alone,
//      on USUAL_MAJORITY of his last USUAL_LOOK working days - or his last two working
//      days were both that one site and nothing else (he moved, and stayed).
//   4. Then that site - unless it has been archived or is gone from the list: no chip.
//
// So the chip is always the site he worked on LAST. A man four days on one site and
// yesterday on another gets none: one day elsewhere is a loan or a move, and the record
// cannot tell which. The first draft of the rule sent him back to the four-day site; on
// the seeded months it was right about half the time there, which is a guess, and the
// rule was tightened (tests/usual.test.mjs prints both).
const USUAL_WINDOW_DAYS = 14;
const USUAL_LOOK = 5;
const USUAL_MAJORITY = 4;

// The sites of one man on one day, each once, in the order his day holds them; [] when
// he did not work (no entry, or marked נעדר). The reading the day screen itself makes.
function usualSitesOn(schedule, date, workerId, layer) {
    if (isAbsent(schedule, date, workerId, layer)) return [];
    const seen = [];
    entriesFor(schedule, date, workerId, layer).forEach(entry => {
        const placeId = entry && entry.placeId;
        if (typeof placeId === 'string' && placeId && seen.indexOf(placeId) === -1) seen.push(placeId);
    });
    return seen;
}

// His working days before `date`, latest first: [{ date, sites: [placeId] }].
function usualWorkingDays(schedule, date, layer, workerId) {
    const out = [];
    if (!schedule || !isRealDate(date)) return out;
    for (let back = 1; back <= USUAL_WINDOW_DAYS && out.length < USUAL_LOOK; back += 1) {
        const day = addDays(date, -back);
        if (!day) break;
        const sites = usualSitesOn(schedule, day, workerId, layer);
        if (sites.length > 0) out.push({ date: day, sites });
    }
    return out;
}

function usualSiteFor(schedule, date, layer, workerId) {
    const days = usualWorkingDays(schedule, date, layer, workerId);
    if (days.length === 0 || days[0].sites.length !== 1) return null;
    const last = days[0].sites[0];
    const alone = day => day.sites.length === 1 && day.sites[0] === last;
    const settled = days.filter(alone).length >= USUAL_MAJORITY
        || (days.length >= 2 && alone(days[1]));
    if (!settled) return null;
    const place = ((schedule && schedule.places) || []).find(one => one && one.id === last);
    return place && place.active !== false ? last : null;
}

// ------------------------------------------------------------------ the tray
//
// Two doors, both called by renderUnassignedTray (js/ui/day.js) and by nothing else: the
// chip into one man's row, and the one sentence over the rows when any man has a chip.

// How many chips the tray being built has - counted between the first chip and the note,
// inside one render, so the note is said exactly when there is something it is about.
let usualDrawn = 0;

function usualChipInto(chip, worker) {
    if (!chip || !worker) return null;
    // The day the tray is drawn for: the chip is a suggestion for that day, and its tap
    // writes into that day (usualAssign).
    const at = { date: State.date, layer: State.layer };
    const placeId = usualSiteFor(State.schedule, at.date, at.layer, worker.id);
    const place = placeId ? State.place(placeId) : null;
    if (!place) return null;

    const offer = button('', 'chip-usual', () => usualAssign(worker.id, place.id, at),
        USUAL_TEXT.aria(worker.name, place.name));
    const arrow = el('span', 'chip-usual-arrow', USUAL_TEXT.arrow);
    arrow.setAttribute('aria-hidden', 'true');
    offer.appendChild(arrow);
    appendSiteName(offer, place.id, place.name);
    // The site's fixed colour, handed to the stylesheet as a property: css/design.css
    // repaints every button of the tray, and an inline background would lose to it.
    offer.style.setProperty('--usual-site', siteColorVar(place.id));
    offer.dataset.workerId = worker.id;
    offer.dataset.placeId = place.id;
    chip.classList.add('chip-has-usual');
    chip.appendChild(offer);
    usualDrawn += 1;
    return offer;
}

function usualNoteInto(tray, chips) {
    const drawn = usualDrawn;
    usualDrawn = 0;
    if (!tray || drawn === 0) return null;
    const note = el('p', 'usual-note', USUAL_TEXT.note);
    tray.appendChild(note);
    if (chips && chips.classList) chips.classList.add('chips-usual');
    return note;
}

// ------------------------------------------------------------------ the tap
//
// ONE TAP IS ONE MAN. The man placed leaves the tray and the next man's row slides up
// under the finger: his own chip where this one was, or - when he has none - his «נעדר»
// or his name, or, when this was the last man waiting, a ✕ of «נעדרים» below. The second
// tap of a double tap, or a bounce, would place HIM, mark him absent, or cancel another
// man's absence. So the chip reads the trays' one clock (trayTapTooSoon, js/ui/day.js):
// it starts it, and nothing on either tray does anything for DOUBLE_TAP_GUARD_MS after -
// except the next man's own chip, tapped WALK_BOUNCE_MS or more after this one's press and
// once this placement is drawn: chip after chip at a person's pace is a man per tap (v194).
//
// AND THE RECORD IS ASKED AGAIN AT THE TAP. The chip was drawn from the record as it was;
// a tap acts on the record as it is. A man who has a record by now, a site archived since,
// a suggestion that is no longer this one - nothing is written, and the day is drawn again
// so that the screen says what is true.
//
// On the day the chip was drawn for (`at`): asked again of THAT day, and written into it,
// whatever State.date says by the time of the tap - as every surface on the day screen
// writes (editWithUndo, js/ui/undo.js). Left out, the day on screen.
function usualAssign(workerId, placeId, at) {
    if (trayTapTooSoon(true, 'usual')) return false;
    const day = at && at.date ? at : { date: State.date, layer: State.layer };
    const worker = State.worker(workerId);
    const place = State.place(placeId);
    const waiting = Boolean(worker) && unrecordedOn(day.date, day.layer).some(one => one.id === workerId);
    if (!waiting || !place
        || usualSiteFor(State.schedule, day.date, day.layer, workerId) !== placeId) {
        render();
        return false;
    }
    return sheetPickPlace(worker, place, day);
}
