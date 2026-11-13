// כרטיס אתר - one SITE, on one screen: a calendar month of it, how many men stood on it
// each day, the month's counts, who worked there, and the month's summary for the client.
// The twin of «כרטיס עובד» (js/ui/workercard.js). Opened from the site's row on the crew
// screen, and from nowhere else.
//
// IT IS A READING, AND ONLY A READING. Nothing here commits, nothing here touches Store,
// and there is not a field on it that can be typed in: a day goes to that date on the day
// screen, a man goes to his own card, the two arrows change which month is READ, and the
// two doors hand the client's text to WhatsApp or the clipboard. tests/sitecard.test.mjs
// holds every key on the disk byte for byte across all of it.
//
// AND IT IS COUNTS. There is not a shekel on this card and no money function is asked
// anything: the client's invoice in this app is a count of worker-site days and carries no
// price, so neither does the card and neither does the text. No gate is read because
// nothing gated is read.
//
// EVERY COUNT IS THE REPORTS' OWN, asked of the function «לפי אתר» asks, pointed at the
// month and at this one site. They take their range as arguments, so - unlike the worker's
// card - the reports screen's own range is never touched:
//
//   ימי עובד־אתר, and each day's men   invoiceByDate -> invoiceReport   js/model/money.js
//   בלי עובדי רימא, his men per day     invoiceWithoutRima               js/model/money.js
//   עובדי רימא                          rimaReport                       js/model/schema.js
//   עובדי יוסף גבס                      yosefGevesReport                 js/model/schema.js
//
// What this file does for itself is COUNT what those returned: on how many dates one of
// his men stood here, the average of them, and each man's dates out of the invoice's own
// workerIds.
//
// THE CALENDAR IS THE WORKER CARD'S. Its month arithmetic and its columns - the app's
// week, six columns, the Saturday left out of the grid and listed under it when it holds
// a record - are asked of that file's own helpers (workerCardMonthSpan,
// workerCardMonthStep, workerCardWeekdays), which are globals like everything else here,
// and its words for the calendar are read from its block. Nothing in that file is changed.
//
// «עובדי יוסף גבס» IS ON THE CARD AND NOT IN THE CLIENT'S TEXT. The owner, 2026-11-10:
// "outside any account". It is his own count, so his card shows it, apart and under its
// own note; the text is the client's, and the one-client file leaves the list out, so the
// text does too (siteCardClientText never reads it - the suite holds that).

// ---------------------------------------------------------------- the words
//
// Every Hebrew string this file adds, in one block. PROPOSED, not approved: the owner has
// not read them. Pinned word for word in tests/sitecard.test.mjs, so changing one is a
// decision.
const SITE_CARD_TEXT = Object.freeze({
    // The control on the site's row, and the head of the card.
    title: 'כרטיס אתר',
    // The control's accessible name: these words, then the site's name.
    openFor: 'כרטיס אתר של',
    numbers: 'החודש במספרים',
    men: 'מי עבד באתר',
    // The two small marks inside a day, and the line under the grid that says what they
    // are. A letter and the count: «ר2» is two of Rima's men on this site that day.
    rimaMark: 'ר',
    yosefMark: 'י',
    legend: (rima, yosef) => `ר = ${rima} · י = ${yosef}`,
    // A month that is not over. The month summary's sentence, without its half about a
    // comparison - this card compares nothing.
    inProgress: 'החודש עוד לא נגמר. המספרים הם של מה שנרשם עד עכשיו.',
    // The one button that shows the client's text, and the name of the field it is in.
    client: 'סיכום החודש ללקוח'
});

// The words the card borrows, each beside the screen that owns it. Repeated here only
// where the owner builds them inline; tests/sitecard.test.mjs finds every one of them in
// its owner's source, so a word changed there and not here fails by name. The reports'
// constants (RIMA_TITLE, RIMA_TOTAL, RIMA_NOTE, NO_RIMA_TITLE, NO_RIMA_TOTAL,
// YOSEF_GEVES_TOTAL, YOSEF_GEVES_NOTE), the worker
// card's calendar words and the month summary's «ימי עבודה», «ממוצע עובדים ליום עבודה» and
// «אין רישומים בחודש הזה.» are not repeated at all - they are read from their blocks.
const SITE_CARD_REUSED = Object.freeze({
    active: 'פעיל',                       // js/ui/roster.js, the crew row's switch
    inactive: 'לא פעיל',                  // js/ui/roster.js, the site's row
    rima: 'רימא',                         // js/ui/day.js, the site's Rima box
    yosef: 'יוסף גבס',                    // js/ui/day.js, the box beside it (YOSEF_GEVES_LABEL)
    oneMan: 'עובד אחד',                   // js/ui/reports.js, countedIn
    manyMen: 'עובדים',                    // js/ui/reports.js, countedIn
    noDays: 'אין ימי עבודה בתקופה הזו.',  // js/ui/reports.js, the sheet
    billing: 'חיוב -',                    // js/ui/reports.js, the client's page: «חיוב - <אתר>»
    send: '💬 שלח בוואטסאפ',              // index.html, the day's message
    copy: 'העתק',                         // index.html, the day's message
    close: 'סגור'                         // index.html, the worker's card
});

// Whose card is open, and on which month ('YYYY-MM'); both null when it is shut. Memory
// only - a reload closes the card, and nothing about it is kept anywhere.
let SITE_CARD_ID = null;
let SITE_CARD_MONTH = null;

// ---------------------------------------------------------------- the reading

function siteCardPlace(placeId) {
    return (State.schedule.places || []).find(place => String(place.id) === String(placeId)) || null;
}

function siteCardMonthName(key) {
    const span = workerCardMonthSpan(key);
    return `${WORKER_CARD_TEXT.months[span.month]} ${span.year}`;
}

// «3 עובדים», «עובד אחד» - countedIn's own two forms.
function siteCardMen(count) {
    return countedIn(count, SITE_CARD_REUSED.oneMan, SITE_CARD_REUSED.manyMen);
}

// The invoice grid's own date cell: weekday and dd/mm, the year on the line above
// (renderInvoiceTable, js/ui/reports.js).
function siteCardWhen(date) {
    const parsed = parseLocalDate(date);
    return `${HEBREW_DAY_NAMES[parsed.getDay()]} ${formatShortDate(parsed)}`;
}

// One day of the site, as the calendar says it. `men` is HIS men on the site that date
// (the invoice without Rima), `rima` and `yosef` the two counts typed for it, `billed`
// what the client's invoice counts for the day. `said` is the cell read aloud.
function siteCardDay(date, counts, today) {
    const parsed = parseLocalDate(date);
    const cell = {
        date,
        number: parsed.getDate(),
        weekday: parsed.getDay(),
        today: date === today,
        men: counts.men,
        rima: counts.rima,
        yosef: counts.yosef,
        billed: counts.billed
    };
    const said = [];
    if (cell.men > 0) said.push(siteCardMen(cell.men));
    if (cell.rima > 0) said.push(`${SITE_CARD_REUSED.rima} ${cell.rima}`);
    if (cell.yosef > 0) said.push(`${SITE_CARD_REUSED.yosef} ${cell.yosef}`);
    if (said.length === 0) said.push(WORKER_CARD_REUSED.blank);
    cell.said = `${hebrewDayName(parsed)} ${formatFullDate(parsed)} · ${said.join(' · ')}`;
    return cell;
}

// Everything the card says about one site in one month, as plain data, and nothing drawn.
// Split from the drawing so that the suite can hold each figure against the reports'
// without a browser - and so that what is on the screen, and what leaves as text, cannot
// be anything this did not return.
function siteCardFacts(placeId, key) {
    const place = siteCardPlace(placeId);
    if (!place) return null;
    const id = String(place.id);
    const schedule = State.schedule;
    const today = todayStr();
    const month = /^\d{4}-\d{2}$/.test(String(key)) ? String(key) : today.slice(0, 7);
    const span = workerCardMonthSpan(month);

    // The four reports, each asked once, each narrowed to this site by its own argument -
    // the narrowing the client's page and the client's file take (scopedExportPlace).
    const invoice = invoiceByDate(schedule, span.from, span.to);
    const row = invoice.places.find(item => String(item.placeId) === id) || null;
    const own = invoiceWithoutRima(schedule, span.from, span.to, id);
    const rima = rimaReport(schedule, span.from, span.to, id);
    const yosef = yosefGevesReport(schedule, span.from, span.to, id);

    const billedOn = date => (row && row.byDate[date]) || 0;
    const columns = workerCardWeekdays();
    const weeks = [];
    const saturdays = [];
    let line = null;
    let workingDays = 0;
    for (let date = span.from; date <= span.to; date = shiftDate(date, 1)) {
        const cell = siteCardDay(date, {
            men: own.countAt(id, date),
            rima: rima.countAt(id, date),
            yosef: yosef.countAt(id, date),
            billed: billedOn(date)
        }, today);
        // A working day of the site is a date one of HIS men stood on it. A date the
        // invoice bills only for Rima's men is on the invoice and is not one of these -
        // the month summary's own rule (monthSummaryRead).
        if (cell.men > 0) workingDays += 1;
        const column = columns.indexOf(cell.weekday);
        if (column === -1) {
            // A Saturday with anything on it is never left off the card.
            if (cell.men > 0 || cell.rima > 0 || cell.yosef > 0) saturdays.push(cell);
            continue;
        }
        if (line === null || column === 0) {
            line = columns.map(() => null);
            weeks.push(line);
        }
        line[column] = cell;
    }

    // WHO WORKED THERE: the invoice's own workerIds, each man counted once per date. By
    // days, the roster's order kept among equals (sort is stable).
    const perMan = {};
    (row ? row.days : []).forEach(day => day.workerIds.forEach(worker => {
        perMan[String(worker)] = (perMan[String(worker)] || 0) + 1;
    }));
    const men = (schedule.workers || [])
        .filter(worker => perMan[String(worker.id)] > 0)
        .map(worker => ({ id: String(worker.id), name: worker.name, days: perMan[String(worker.id)] }))
        .sort((a, b) => b.days - a.days);

    const hasRima = rima.places.length > 0;
    const hasYosef = yosef.places.length > 0;
    const facts = {
        id,
        name: place.name,
        active: place.active !== false,
        status: place.active !== false ? SITE_CARD_REUSED.active : SITE_CARD_REUSED.inactive,
        key: month,
        month: siteCardMonthName(month),
        current: month === today.slice(0, 7),
        range: { from: span.from, to: span.to,
            text: dateRange(formatFullDate(parseLocalDate(span.from)),
                formatFullDate(parseLocalDate(span.to))) },
        // Nothing of any kind on this site in this month.
        empty: !row && !hasYosef,
        inProgress: (Boolean(row) || hasYosef) && today >= span.from && today < span.to,
        calendar: {
            columns: columns.map(day => HEBREW_DAY_LETTERS[day]),
            weeks,
            saturdays
        },
        // The month's counts, each under the label its own report prints it by.
        siteDays: row ? row.workerDays : 0,
        own: hasRima ? own.total : null,
        rima: hasRima ? rima.total : null,
        yosef: hasYosef ? yosef.total : null,
        workingDays,
        average: workingDays > 0 ? Math.round((own.total / workingDays) * 10) / 10 : null,
        men,
        // What the client is billed day by day - the invoice's own days of this site -
        // and, beside it, the Rima table the client's page prints under the invoice.
        billed: (row ? row.days : []).map(day => ({ date: day.date, count: day.count })),
        rimaDays: hasRima
            ? rima.dates.map(date => ({ date, count: rima.countAt(id, date) })) : []
    };
    facts.numbers = siteCardNumbers(facts);
    facts.text = siteCardClientText(facts);
    return facts;
}

// The lines of the numbers block, in the order they are read. `apart` marks the count that
// is in no account, which the drawing sets off from the rest.
function siteCardNumbers(facts) {
    const lines = [{ id: 'siteDays', label: NO_RIMA_TOTAL, value: String(facts.siteDays) }];
    if (facts.own !== null) lines.push({ id: 'own', label: NO_RIMA_TITLE, value: String(facts.own) });
    if (facts.rima !== null) {
        lines.push({ id: 'rima', label: RIMA_TOTAL, value: String(facts.rima), note: RIMA_NOTE });
    }
    lines.push({ id: 'workingDays', label: MONTH_SUMMARY_TEXT.workingDays, value: String(facts.workingDays) });
    lines.push({ id: 'average', label: MONTH_SUMMARY_TEXT.average,
        value: facts.average === null ? '—' : String(facts.average) });
    if (facts.yosef !== null) {
        lines.push({ id: 'yosef', label: YOSEF_GEVES_TOTAL, value: String(facts.yosef),
            note: YOSEF_GEVES_NOTE, apart: true });
    }
    return lines;
}

// THE MONTH FOR THE CLIENT, as plain Hebrew.
//
// It is the client's printed page in words (renderInvoiceTable, with one site chosen):
// «חיוב - <האתר>», the period, a line per date the invoice bills with the invoice's own
// count for it, said as men («3 עובדים», «עובד אחד») - Rima's men counted in, because that is what is billed (the owner's
// ruling, 2026-11-01) - and the invoice's own total line. Then, only when the month has a
// Rima count on this site, the table that page prints under the invoice: «רישום לרימא»,
// its dates, its total and its note, word for word - «בחיוב שלמעלה» is true here too, the
// billing is the list above it. «בלי עובדי רימא» is not on the client's paper and is not
// here. «עובדי יוסף גבס» is in no account of the client's and is not here: this function
// reads nothing about it. And no shekel: the invoice carries no price, and none is made up.
function siteCardClientText(facts) {
    const lines = [`${SITE_CARD_REUSED.billing} ${isolate(facts.name)}`,
        `${facts.month} · ${facts.range.text}`, ''];
    if (facts.billed.length === 0) {
        lines.push(MONTH_SUMMARY_TEXT.empty);
        return lines.join('\n');
    }
    facts.billed.forEach(day => lines.push(`${siteCardWhen(day.date)}: ${siteCardMen(day.count)}`));
    lines.push(`${NO_RIMA_TOTAL}: ${facts.siteDays}`);
    if (facts.rimaDays.length > 0) {
        lines.push('', RIMA_TITLE);
        facts.rimaDays.forEach(day => lines.push(`${siteCardWhen(day.date)}: ${siteCardMen(day.count)}`));
        lines.push(`${RIMA_TOTAL}: ${facts.rima}`, RIMA_NOTE);
    }
    return lines.join('\n');
}

// ---------------------------------------------------------------- the drawing
//
// textContent only, like every other screen: a name is text. Sizes come from the
// stylesheet's block (css/design.css, the end of the file); nothing here sets a height or
// a font, so the text may grow and every row wraps. The arrows, the client's field and
// the doors are in the frame (index.html) and are not rebuilt by a redraw; the days and
// the men are, so each carries a key and the one drawn under the same key takes the focus
// back - the worker card's own step, for a snapshot arriving while the card is open.

function siteCardBlock(title) {
    const block = el('section', 'scard-block');
    block.appendChild(el('h4', 'scard-head', title));
    return block;
}

// What one day shows inside its cell: the number of his men, large, in a block of the
// site's own colour; under it the two small marks. Hidden from a screen reader - the
// cell's name says it in words.
function siteCardDayMarks(cell) {
    const marks = el('span', 'scard-cal-marks');
    marks.setAttribute('aria-hidden', 'true');
    if (cell.men > 0) {
        marks.appendChild(paintSite(el('span', 'scard-cal-men', String(cell.men)), SITE_CARD_ID));
    }
    if (cell.rima > 0) {
        marks.appendChild(el('span', 'scard-cal-count scard-cal-rima', `${SITE_CARD_TEXT.rimaMark}${cell.rima}`));
    }
    if (cell.yosef > 0) {
        marks.appendChild(el('span', 'scard-cal-count scard-cal-yosef', `${SITE_CARD_TEXT.yosefMark}${cell.yosef}`));
    }
    return marks;
}

// One day, as a button: it goes to that date on the day screen and does nothing else.
function siteCardDayButton(cell, className, label) {
    const day = button('', className, () => siteCardGoDay(cell.date), cell.said);
    day.dataset.scardKey = `day:${cell.date}`;
    day.dataset.date = cell.date;
    if (cell.today) day.setAttribute('aria-current', 'date');
    day.appendChild(el('span', 'scard-cal-number', label));
    day.appendChild(siteCardDayMarks(cell));
    return day;
}

function drawSiteCard() {
    const body = document.getElementById('siteCardBody');
    const who = document.getElementById('siteCardWho');
    const month = document.getElementById('siteCardMonth');
    if (!body || !who || !month) return;
    const facts = SITE_CARD_ID === null ? null : siteCardFacts(SITE_CARD_ID, SITE_CARD_MONTH);
    // The site left the record while the card was open. A card about nothing closes.
    if (!facts) { closeSiteCard(); return; }
    const T = SITE_CARD_TEXT;
    const active = document.activeElement;
    const held = active && active.dataset && body.contains && body.contains(active)
        ? active.dataset.scardKey : '';

    // The site in its fixed colour - painted by the one function every screen paints a
    // site with - and whether it is in use.
    clear(who);
    const tag = el('strong', 'scard-name');
    appendSiteName(tag, facts.id, facts.name);
    paintSite(tag, facts.id);
    who.appendChild(tag);
    who.appendChild(el('span', facts.active ? 'scard-status' : 'badge scard-status', facts.status));

    month.textContent = facts.month;
    const home = document.getElementById('siteCardHome');
    if (home) home.hidden = facts.current;
    const field = document.getElementById('siteCardText');
    if (field && field.value !== facts.text) field.value = facts.text;

    clear(body);
    if (facts.inProgress) body.appendChild(el('p', 'scard-note scard-progress', T.inProgress));

    // THE MONTH AS A CALENDAR.
    const calendar = siteCardBlock(WORKER_CARD_TEXT.calendar);
    calendar.classList.add('scard-cal');
    const grid = el('div', `scard-cal-grid scard-cal-cols-${facts.calendar.columns.length}`);
    facts.calendar.columns.forEach(letter => grid.appendChild(el('span', 'scard-cal-head', letter)));
    facts.calendar.weeks.forEach(week => week.forEach(cell => {
        if (!cell) { grid.appendChild(el('span', 'scard-cal-gap')); return; }
        grid.appendChild(siteCardDayButton(cell, 'scard-cal-day', String(cell.number)));
    }));
    calendar.appendChild(grid);
    if (facts.calendar.saturdays.length > 0) {
        calendar.appendChild(el('h5', 'scard-sub', WORKER_CARD_TEXT.saturdays));
        const list = el('div', 'scard-cal-saturdays');
        facts.calendar.saturdays.forEach(cell => list.appendChild(siteCardDayButton(cell,
            'btn-secondary scard-cal-saturday', formatShortDate(parseLocalDate(cell.date)))));
        calendar.appendChild(list);
    }
    calendar.appendChild(el('p', 'scard-note', T.legend(SITE_CARD_REUSED.rima, SITE_CARD_REUSED.yosef)));
    calendar.appendChild(el('p', 'scard-note', WORKER_CARD_TEXT.openDay));
    body.appendChild(calendar);

    // THE NUMBERS.
    const numbers = siteCardBlock(T.numbers);
    numbers.classList.add('scard-numbers');
    if (facts.empty) numbers.appendChild(emptyHint(MONTH_SUMMARY_TEXT.empty));
    else facts.numbers.forEach(line => {
        const pair = el('div', line.apart ? 'scard-pair scard-apart' : 'scard-pair');
        pair.setAttribute('data-figure', line.id);
        pair.appendChild(el('span', 'scard-label', line.label));
        pair.appendChild(el('strong', 'scard-value', line.value));
        if (line.note) pair.appendChild(el('p', 'scard-note scard-pair-note', line.note));
        numbers.appendChild(pair);
    });
    body.appendChild(numbers);

    // WHO WORKED THERE. Each man is a way into his own card.
    const men = siteCardBlock(T.men);
    men.classList.add('scard-men');
    if (facts.men.length === 0) men.appendChild(emptyHint(SITE_CARD_REUSED.noDays));
    facts.men.forEach(man => {
        const row = button('', 'btn-secondary scard-man', () => siteCardGoMan(man.id),
            `${WORKER_CARD_TEXT.openFor} ${isolate(man.name)} · ${man.days}`);
        row.dataset.scardKey = `man:${man.id}`;
        row.dataset.workerId = man.id;
        row.setAttribute('aria-haspopup', 'dialog');
        row.appendChild(el('span', 'scard-man-name', man.name));
        row.appendChild(el('strong', 'scard-man-days', String(man.days)));
        men.appendChild(row);
    });
    body.appendChild(men);

    if (held) {
        const again = [...body.querySelectorAll('button')]
            .filter(node => node.dataset && node.dataset.scardKey === held)[0];
        if (again && again.focus) again.focus({ preventScroll: true });
    }
}

// ---------------------------------------------------------------- the frame

function siteCardIsOpen() {
    const modal = typeof document !== 'undefined' ? document.getElementById('siteCardModal') : null;
    return Boolean(modal && modal.style.display === 'flex' && SITE_CARD_ID !== null);
}

function openSiteCard(placeId) {
    const place = siteCardPlace(placeId);
    const modal = document.getElementById('siteCardModal');
    if (!place || !modal) return;
    SITE_CARD_ID = String(place.id);
    SITE_CARD_MONTH = todayStr().slice(0, 7);

    const T = SITE_CARD_TEXT;
    const R = SITE_CARD_REUSED;
    const say = (id, text) => { const node = document.getElementById(id); if (node) node.textContent = text; };
    say('siteCardTitle', T.title);
    say('siteCardPrev', WORKER_CARD_TEXT.prevMonth);
    say('siteCardNext', WORKER_CARD_TEXT.nextMonth);
    say('siteCardHome', WORKER_CARD_TEXT.thisMonth);
    say('siteCardClientOpen', T.client);
    say('siteCardSend', R.send);
    say('siteCardCopy', R.copy);
    say('siteCardClose', R.close);
    say('siteCardStatus', '');
    const field = document.getElementById('siteCardText');
    if (field) field.setAttribute('aria-label', T.client);
    siteCardShowClient(false);

    drawSiteCard();
    if (SITE_CARD_ID === null) return;
    modal.style.display = 'flex';
    const content = modal.querySelector('.modal-content');
    if (content) content.scrollTop = 0;
}

function closeSiteCard() {
    SITE_CARD_ID = null;
    SITE_CARD_MONTH = null;
    const modal = document.getElementById('siteCardModal');
    if (modal) modal.style.display = 'none';
}

// render() calls this (js/app.js): a snapshot adopted from another phone while the card is
// open must move its counts. The place the reader had scrolled to is kept.
function renderSiteCardIfOpen() {
    if (!siteCardIsOpen()) return;
    const modal = document.getElementById('siteCardModal');
    const content = modal.querySelector('.modal-content');
    const at = content ? content.scrollTop : 0;
    drawSiteCard();
    if (content) content.scrollTop = at;
}

// One month back, one forward, or (0) home to the month today is in. Only the month in
// memory moves. The arrows are in the frame, so the focus stays on the one that was
// pressed; «חזרה לחודש הנוכחי» hides itself on the month it goes to, and the focus it held
// goes to the first of the two arrows rather than to nowhere.
function siteCardStep(months) {
    if (!siteCardIsOpen()) return;
    const today = todayStr().slice(0, 7);
    SITE_CARD_MONTH = months === 0 ? today : workerCardMonthStep(SITE_CARD_MONTH, months);
    drawSiteCard();
    if (months === 0) {
        const back = document.getElementById('siteCardPrev');
        if (back && back.focus) back.focus({ preventScroll: true });
    }
}

// A day of the calendar NAVIGATES: the card closes and the day screen opens on that date -
// what a day of the worker's card does, a follow still owed from midnight settled by his
// choice as it is there (dayChosenByHand, js/app.js). The date on screen is a choice in
// memory; nothing is recorded by looking at a day.
function siteCardGoDay(date) {
    if (!siteCardIsOpen() || !isRealDate(date)) return;
    closeSiteCard();
    State.date = date;
    if (typeof dayChosenByHand === 'function') dayChosenByHand();
    showView('day');
}

// A man goes to HIS card, on the month this card was on. This card closes first: two
// cards one over the other is a stack somebody has to climb back out of. The dialogs'
// keeper of the focus (js/ui/modal.js) never sees a moment with no dialog open, so the
// focus it kept - the site's row on the crew screen - is still what closing his card
// returns to; and because it does not see a NEW dialog either, his card's heading is
// given the focus here, by hand.
function siteCardGoMan(workerId) {
    if (!siteCardIsOpen() || typeof openWorkerCard !== 'function') return;
    const month = SITE_CARD_MONTH;
    closeSiteCard();
    openWorkerCard(workerId);
    if (month !== todayStr().slice(0, 7) && typeof drawWorkerCard === 'function') {
        WORKER_CARD_MONTH = month;
        drawWorkerCard();
    }
    const heading = document.getElementById('workerCardTitle');
    if (heading && heading.focus) heading.focus({ preventScroll: true });
}

// The client's text, folded away until asked for: a button and not a <details>, because
// the dialogs' Tab trap (js/ui/modal.js) knows buttons and fields. The two doors are
// inside the fold, so the text cannot leave before it has been shown.
function siteCardShowClient(show) {
    const fold = document.getElementById('siteCardClient');
    const toggle = document.getElementById('siteCardClientOpen');
    if (fold) fold.hidden = !show;
    if (toggle) toggle.setAttribute('aria-expanded', show ? 'true' : 'false');
}

function siteCardToggleClient() {
    if (!siteCardIsOpen()) return;
    const fold = document.getElementById('siteCardClient');
    if (fold) siteCardShowClient(fold.hidden === true);
}

function siteCardClientShown() {
    const fold = document.getElementById('siteCardClient');
    return Boolean(siteCardIsOpen() && fold && fold.hidden !== true);
}

// The two doors any composed text leaves by (js/ui/share.js). The card stays open behind
// the share sheet: it is a screen being read, not a message being written. Neither door
// answers while the field is folded away.
function siteCardSend() {
    if (!siteCardClientShown()) return;
    const field = document.getElementById('siteCardText');
    const status = document.getElementById('siteCardStatus');
    shareTextOut(field.value, status, () => { setTimeout(() => { status.textContent = ''; }, 4000); });
}

function siteCardCopy() {
    if (!siteCardClientShown()) return;
    copyTextOut(document.getElementById('siteCardText'), document.getElementById('siteCardStatus'));
}
