// «לוח חודשי» - the whole crew's month on one board.
//
// The week tab shows one week of the crew, a man's card one man's month, «סיכום חודש» counts
// a month - and nothing showed THE CREW'S MONTH: who worked where on every day of it. That is
// the owner's and the accountant's attendance sheet: the one read at the month's end, and the
// one a man's dispute about his days is settled with. Narrowed to one site it is who worked
// there, day by day, with the site's counts at its foot - the numbers «לפי אתר» counts, cell
// for cell. IT NAMES EVERY MAN, so it is not paper for a client: the app's client paper names
// nobody (css/app.css, body.client-scoped), and whether a client is shown the crew's names is
// the owner's to decide.
//
// A THIRD MODE OF THE WEEK TAB, NOT A DIALOG. Paper never shows a dialog (css/app.css hides
// everything but the screen's own section in print), and the A4 landscape page and the
// shared picture are this board's reason to exist: on a phone it is a scroller, four or five
// days across, and that is said rather than hidden. Its door is the week grid's corner cell,
// the one place on the week that had the room (it costs the header row nothing).
//
// IT IS A READING, AND ONLY A READING. Nothing here commits, touches Store or writes a key:
// the month and the site chosen are memory (MONTH_BOARD_KEY, MONTH_BOARD_PLACE), lost on
// leaving the tab - showView('week') puts the week back on its grid. A cell, a date and a
// name NAVIGATE, the way the week's cell does; nothing on the board edits anything.
// tests/monthboard.test.mjs holds every key on the disk byte for byte across all of it.
//
// AND IT PRICES NOTHING. It counts people, and every count is one the app already makes:
//
//   the month                   monthSummaryRange                      js/ui/monthsummary.js
//   who is a row                weekWorkers, over the month            js/ui/week.js
//   a cell                      renderWeekCell's rule, line for line   js/ui/week.js
//   a man's «נוכחות»            the dates with an entry and no
//                               absence - payrollReport's attendanceDays js/model/money.js
//   «סה"כ עובדים»               the week's own foot rule               js/ui/week.js
//   רישום לרימא, עובדי יוסף גבס  rimaReport, yosefGevesReport           js/model/schema.js
//   one site's own, its billed  invoiceWithoutRima, invoiceByDate      js/model/money.js
//   a Saturday                  anyRecordOnRestDay                     js/ui/day.js
//
// THE PICTURE IS READ OFF THIS BOARD'S DOM (readMonthPrintout), never off the record - the
// rule js/ui/printout.js is built on - and planned here (planMonthPrintout), the 'transport'
// precedent: printout.js only asks for the two by name.
//
// Classic script on the global scope. It runs nothing at load: js/ui/week.js asks for its
// door through typeof when the grid is drawn, and calls renderMonthBoard only in the mode
// the door sets. Every function it borrows - week.js, sitecolor.js, workercard.js,
// monthsummary.js, reports.js, day.js and printout.js - is called only when it draws.

// ---------------------------------------------------------------- the words
//
// Every Hebrew string this file adds, in one block. PROPOSED, not approved: the owner has
// not read them. Pinned word for word in tests/monthboard.test.mjs, so changing one is a
// decision (law 6).
const MONTH_BOARD_TEXT = Object.freeze({
    // The door in the grid's corner, and the first words of the board's title.
    door: 'לוח חודשי',
    // The board's heading, the paper's h1 and the picture's title. `site` comes isolated.
    title: (month, year, site) => site ? `לוח חודשי · ${month} ${year} · ${site}` : `לוח חודשי · ${month} ${year}`,
    // The label of the site filter.
    filter: 'אתר',
    // A man's name button, as a screen reader names it: his name and his month's attendance.
    // «ימי נוכחות» and «יום נוכחות אחד» are the statement's own (js/ui/reports.js).
    rowName: (name, total) => total === 1 ? `${name} · יום נוכחות אחד` : `${name} · ${total} ימי נוכחות`,
    // The same on a board narrowed to one site, where the number is his days AT THAT SITE -
    // not his attendance, which counts every site. «נוכחות» is the pay sheet's word for his
    // whole month, and the paper a man's dispute about his days is settled with may not use
    // one word for two counts (the review of v206).
    rowNameAtSite: (name, total) => total === 1 ? `${name} · יום אחד באתר` : `${name} · ${total} ימים באתר`,
    // The last column's head on a board narrowed to one site - on the screen, on paper and in
    // the picture, which read it off the board. On every board it is the pay sheet's «נוכחות».
    siteTotal: 'ימים באתר',
    // After the title on paper and in the picture of a month that is not over: the day they
    // were made, so the days after it read as not yet, not as nobody. `date` comes isolated.
    asOf: date => `נכון ל־${date}`,
    // The picture's file, as the share sheet shows it: the door's two words and the month.
    file: key => `farkad-לוח-חודשי-${key}.png`
});

// The words this board borrows from screens that already say them inline. Repeated here
// only because their owners build them as literals; tests/monthboard.test.mjs finds every
// one of them in its owner's source, so a word changed there and not here fails by name.
// The month's name, «חודש קודם» / «חודש הבא», the empty month and the Rima note are read
// from MONTH_SUMMARY_TEXT, and the Rima, יוסף גבס and billing titles from js/ui/reports.js's
// constants - at the moment the board is drawn, never at load.
const MONTH_BOARD_REUSED = Object.freeze({
    corner: 'עובדים / ימים',                                         // js/ui/week.js, the grid's corner
    inactive: 'לא פעיל',                                             // js/ui/week.js, the name's badge
    men: 'סה"כ עובדים',                                              // js/ui/week.js, the totals row
    back: 'חזרה לטבלת השבוע',                                        // js/ui/week.js, the days' way back
    print: '🖨️ הדפסה',                                               // js/ui/week.js, the header
    share: '🖼️ שיתוף כתמונה',                                         // js/ui/week.js, the header
    marks: '● = יום כפול · + = שעות נוספות · — = נעדר', // js/ui/week.js, under the grid
    tap: 'לחיצה על תא פותחת את היום לעריכה.',                         // js/ui/week.js, under the grid
    absent: 'נעדר',                                                  // js/ui/week.js, the cell
    double: 'כפול',                                                  // js/ui/week.js, the cell
    extra: 'נוספות',                                                 // js/ui/week.js, the cell
    attendance: 'נוכחות',                                            // js/ui/reports.js, the pay sheet's column
    thisMonth: 'החודש',                                              // js/ui/reports.js, the range chip
    allSites: 'כל האתרים'                                            // js/ui/reports.js, the billing filter
});

// ---------------------------------------------------------------- memory
//
// Which month is on the board, as 'YYYY-MM', and which site it is narrowed to (null: every
// site). Memory only, like the week's own mode: nothing about them is kept anywhere, and an
// update's reload lands on the week's grid.
let MONTH_BOARD_KEY = null;
let MONTH_BOARD_PLACE = null;

// ---------------------------------------------------------------- the reading

function monthBoardIsKey(key) {
    return typeof key === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(key);
}

// Every date of the month, first to last, by the phone's own calendar.
function monthBoardMonthDates(range) {
    const out = [];
    const at = parseLocalDate(range.from);
    for (let date = range.from; date <= range.to; ) {
        out.push(date);
        at.setDate(at.getDate() + 1);
        date = toLocalDateStr(at);
    }
    return out;
}

// The site's letters ON THIS BOARD: siteInitial's one letter, and the first TWO letters or
// digits of the name where two sites of the board share that letter - on black-and-white
// paper the colour is gone, and «ה» for two sites would be one site. A rule of this board
// only: siteInitial (js/ui/sitecolor.js) is untouched, and the week keeps its one letter.
function monthBoardLetters(name, count) {
    const found = String(name || '').match(/[\p{L}\p{N}]/gu) || [];
    return found.slice(0, count).join('');
}

// EVERY SITE OF THE BOARD ITS OWN LETTERS, written onto the legend's entries in place.
//   1. siteInitial's one letter;
//   2. where two sites share it, the first two letters of each (above);
//   3. where two STILL read alike - the app's own way of naming a site, «city - project»,
//      gives «תל אביב - רוטשילד» and «תל אביב - דיזנגוף» both «תל» - each its first letter
//      and the first one where its name parts from the other's: «תר», «תד». A pair already
//      on the board is passed over for the next letter of the name, and a name that never
//      parts from the other's (the same site entered twice) is numbered, in the legend's order.
// Two sites with one mark would be one site on black-and-white paper (the review of v206).
function monthBoardLegendLetters(legend) {
    const alike = () => {
        const count = new Map();
        legend.forEach(site => count.set(site.letters, (count.get(site.letters) || 0) + 1));
        return legend.filter(site => site.letters && count.get(site.letters) > 1);
    };
    alike().forEach(site => { site.letters = monthBoardLetters(site.name, 2); });
    const still = alike();
    if (still.length === 0) return;
    const chars = site => String(site.name || '').match(/[\p{L}\p{N}]/gu) || [];
    const common = (a, b) => { let n = 0; while (n < a.length && n < b.length && a[n] === b[n]) n += 1; return n; };
    const taken = new Set(legend.filter(site => !still.includes(site)).map(site => site.letters));
    const chosen = new Map();
    still.forEach(site => {
        const own = chars(site);
        const rivals = still.filter(other => other !== site && other.letters === site.letters);
        let letters = '';
        for (let at = Math.max(1, ...rivals.map(other => common(own, chars(other)))); at < own.length && !letters; at += 1) {
            if (!taken.has(own[0] + own[at])) letters = own[0] + own[at];
        }
        // A name that ends where the other's goes on («הרצליה», «הרצליה פיתוח») keeps its two
        // letters, and the other is the one that moves.
        letters = letters || site.letters;
        taken.add(letters);
        chosen.set(site, letters);
    });
    chosen.forEach((letters, site) => { site.letters = letters; });
    const counted = new Map();
    alike().forEach(site => {
        const n = (counted.get(site.letters) || 0) + 1;
        counted.set(site.letters, n);
        site.letters = `${site.letters}${n}`;
    });
}

// A man's entries on a date as the board draws them: the week cell's rule (nothing when he
// is absent), narrowed to the one site when one is chosen.
function monthBoardEntries(schedule, date, workerId, layer, only) {
    if (isAbsent(schedule, date, workerId, layer)) return [];
    const entries = entriesFor(schedule, date, workerId, layer);
    return only === null ? entries : entries.filter(entry => String(entry.placeId) === only);
}

// EVERYTHING THE BOARD SAYS, AS PLAIN DATA, and nothing drawn - so the suite can hold each
// count against the report it is the count of, without a browser, and so the screen, the
// paper and the picture cannot show anything this did not return. Reads the record, the
// month's calendar and the `today` todayStr() answers; writes nothing.
function monthBoardFacts(key, placeId) {
    const T = MONTH_BOARD_TEXT;
    const R = MONTH_BOARD_REUSED;
    const schedule = State.schedule;
    const layer = State.layer;
    const today = todayStr();
    const month = monthBoardIsKey(key) ? key : monthSummaryKeyOf(today);
    const range = monthSummaryRange(month);
    const only = placeId === null || placeId === undefined || placeId === '' ? null : String(placeId);
    // ONE MAP OF NAMES for the whole board: the week cell's own (placeLabelsIn over the whole
    // record), so a site is called the same in its cells, the legend, the filter and the
    // title - one site with two names on one sheet is the fault js/model/schema.js describes.
    const labels = placeLabelsIn(schedule);
    const nameOf = id => placeLabelFrom(labels, id);
    const all = monthBoardMonthDates(range);
    // The invoice of the month, asked once: its sites are the filter's, and one site's
    // billed row is its count.
    const invoice = invoiceByDate(schedule, range.from, range.to);

    // THE COLUMNS. A Saturday is a column only when something was recorded on it: the week
    // never draws Saturday, and an honest month cannot drop a worked one. Every board: any
    // record in any layer, the two counts included (the day screen's own rule). One site:
    // his men there, or a count typed for that site.
    const saturday = date => parseLocalDate(date).getDay() === 6;
    const siteRecordOn = date => schedule.workers.some(worker =>
            monthBoardEntries(schedule, date, worker.id, layer, only).length > 0)
        || rimaCount(schedule, date, only) > 0
        || (typeof yosefGevesCount === 'function' && yosefGevesCount(schedule, date, only) > 0);
    const dates = all.filter(date => !saturday(date)
        || (only === null ? anyRecordOnRestDay(date) : siteRecordOn(date)))
        .map(date => ({ date, saturday: saturday(date) }));
    const drawn = dates.map(day => day.date);

    // THE ROWS. Every board: the week's own rule over the month - every active man, and a
    // man who is not active only where he has a record in it - in the roster's order. One
    // site: the men with an entry there, active or not, in the same order.
    const men = only === null
        ? weekWorkers(all)
        : schedule.workers.filter(worker => all.some(date =>
            monthBoardEntries(schedule, date, worker.id, layer, only).length > 0));

    const used = new Map();
    const rows = men.map(worker => {
        let total = 0;
        const cells = drawn.map(date => {
            const absent = only === null && isAbsent(schedule, date, worker.id, layer);
            const lines = monthBoardEntries(schedule, date, worker.id, layer, only).map(entry => {
                const id = String(entry.placeId);
                const rate = entryRate(entry);
                const hours = entryExtraHours(entry);
                // The cell's own words for a rate (renderWeekCell): «כפול», the hours as
                // «+2.5», or «נוספות» when none were typed.
                const word = rate === RATE_DOUBLE ? R.double
                    : rate === RATE_EXTRA ? (hours ? plusAmount(hours) : R.extra) : '';
                used.set(id, true);
                return { placeId: id, name: nameOf(entry.placeId), mark: siteMark(entry.placeId),
                    initial: '', double: rate === RATE_DOUBLE, extra: rate === RATE_EXTRA, hours, word };
            });
            if (!absent && lines.length > 0) total += 1;
            return { date, absent, lines };
        });
        return { workerId: String(worker.id), name: worker.name, active: worker.active !== false, cells, total };
    });

    // THE LEGEND: the sites drawn on the board, in the order every surface draws them (the
    // roster's, then a site the roster has not got). Two of them sharing a first letter are
    // both given two letters, here and everywhere the letter is drawn - and two that still
    // read alike, the letters where their names part (monthBoardLegendLetters).
    const legend = [...labels.keys()].filter(id => used.has(id))
        .concat([...used.keys()].filter(id => !labels.has(id)))
        .map(id => ({ placeId: id, name: nameOf(id), mark: siteMark(id), letters: siteInitial(nameOf(id)) }));
    monthBoardLegendLetters(legend);
    const lettersOf = new Map(legend.map(site => [site.placeId, site.letters]));
    rows.forEach(row => row.cells.forEach(cell => cell.lines.forEach(line => {
        line.initial = lettersOf.get(line.placeId) || '';
    })));

    // THE FOOT. Each row a count some report already makes, over the same days.
    const foot = [];
    const notes = [];
    const byDate = count => Object.fromEntries(drawn.map(date => [date, count(date)]));
    const sum = counts => Object.values(counts).reduce((total, n) => total + n, 0);
    const yosefReport = typeof yosefGevesReport === 'function'
        ? yosefGevesReport(schedule, range.from, range.to, only) : null;
    if (only === null) {
        // «סה"כ עובדים»: the week's foot rule - the men of these rows on a site that day,
        // each once however many sites he stood on.
        const counts = byDate(date => men.filter(worker =>
            !isAbsent(schedule, date, worker.id, layer)
            && entriesFor(schedule, date, worker.id, layer).length > 0).length);
        foot.push({ kind: 'men', label: R.men, byDate: counts, total: sum(counts) });
        // The two counts, each apart and each in no total: neither is in the men above.
        const rima = rimaReport(schedule, range.from, range.to);
        if (rima.total > 0) {
            foot.push({ kind: 'rima', label: RIMA_TITLE, byDate: byDate(date => rima.dayTotal(date)), total: rima.total });
            notes.push({ kind: 'rima', text: MONTH_SUMMARY_TEXT.rimaNote });
        }
        if (yosefReport && yosefReport.total > 0) {
            foot.push({ kind: 'yosef', label: YOSEF_GEVES_TITLE, byDate: byDate(date => yosefReport.dayTotal(date)), total: yosefReport.total });
            notes.push({ kind: 'yosef', text: YOSEF_GEVES_NOTE });
        }
    } else {
        // ONE SITE: the invoice's own three rows for it - his men, Rima's, and what is billed,
        // which is the first two added, cell by cell (tests/monthboard.test.mjs). The first two
        // only when Rima stood there this month: without her the billed row says it alone.
        const billedRow = invoice.places.find(row => String(row.placeId) === only);
        const rima = rimaReport(schedule, range.from, range.to, only);
        if (rima.total > 0) {
            const own = invoiceWithoutRima(schedule, range.from, range.to, only);
            foot.push({ kind: 'own', label: NO_RIMA_TITLE, byDate: byDate(date => own.countAt(only, date)), total: own.total });
            foot.push({ kind: 'rima', label: RIMA_TITLE, byDate: byDate(date => rima.countAt(only, date)), total: rima.total });
            notes.push({ kind: 'rima', text: MONTH_SUMMARY_TEXT.rimaNote });
        }
        foot.push({ kind: 'billed', label: NO_RIMA_TOTAL, byDate: byDate(date => invoice.countAt(only, date)),
            total: billedRow ? billedRow.workerDays : 0 });
        // «עובדי יוסף גבס» last, in no total: not in pay and not billed (v183).
        if (yosefReport && yosefReport.total > 0) {
            foot.push({ kind: 'yosef', label: YOSEF_GEVES_TITLE, byDate: byDate(date => yosefReport.countAt(only, date)), total: yosefReport.total });
            notes.push({ kind: 'yosef', text: YOSEF_GEVES_NOTE });
        }
    }

    // WHAT LEAVES THE PHONE. «בלי עובדי רימא» is the owner's figure, on the screen and in the
    // workbook only - his ruling (v167, «شاشة وإكسل بس»): paper and the picture are what gets
    // handed on, and css/app.css keeps .report-norima off the reports' paper the same way. So
    // the 'own' row is the one row the paper and the picture never carry: css/app.css hides it
    // by its kind, and readMonthPrintout leaves it out by its kind.
    foot.forEach(row => { row.paper = row.kind !== 'own'; });

    // THE FILTER'S SITES: every site with a billed day in the month, in the invoice's order -
    // and the site chosen, if this month billed nothing there, so the box says what the board
    // shows instead of a site it is not.
    const sites = invoice.places.map(row => ({ id: String(row.placeId), name: nameOf(row.placeId) }));
    if (only !== null && !sites.some(site => site.id === only)) sites.push({ id: only, name: nameOf(only) });

    const [year, number] = month.split('-').map(Number);
    const place = only === null ? null : { id: only, name: nameOf(only) };
    const recorded = rows.some(row => row.cells.some(cell => cell.absent || cell.lines.length > 0));
    const thisMonth = month === monthSummaryKeyOf(today);
    const title = T.title(MONTH_SUMMARY_TEXT.months[number - 1], year, place ? isolate(place.name) : '');
    // A month that is not over goes on paper and into the picture with the day they were
    // made: tomorrow's men are already on the record the evening before, and the days after
    // it are not yet - not days nobody worked. A month that is over says only its name.
    const asOf = range.to >= today ? today : null;
    // THE COLUMN THE BOARD OPENS ON, on this month: today's - and on a Saturday nothing was
    // recorded on, which is no column, the last day before it that is one, not the 1st: a
    // Saturday is the day off on which a month gets read, and the 28th's reader would have
    // had to swipe back through four weeks to reach where he was.
    const anchor = !thisMonth ? null
        : drawn.includes(today) ? today
        : drawn.filter(date => date < today).pop() || drawn[0] || null;
    return {
        key: month,
        from: range.from,
        to: range.to,
        name: monthSummaryName(month),
        title,
        asOf,
        paperTitle: asOf ? `${title} · ${T.asOf(isolateLtr(formatFullDate(parseLocalDate(asOf))))}` : title,
        // The last column: his «נוכחות» on every board; on one site's, his days there.
        totalHead: only === null ? R.attendance : T.siteTotal,
        thisMonth,
        today: drawn.includes(today) ? today : null,
        anchor,
        place,
        sites,
        dates,
        rows,
        foot,
        notes,
        legend,
        empty: !recorded && foot.every(row => !(row.total > 0))
    };
}

// ---------------------------------------------------------------- the drawing
//
// textContent only, like every other screen. Sizes are the stylesheets': the board's block
// in css/design.css (screen), its paper in css/app.css, and css/large.css says both again
// for «תצוגה גדולה».

// One cell, BUILT THE WAY renderWeekCell BUILDS ONE (js/ui/week.js): the same classes, the
// same site block with the same children, the same rate words, the same spoken label - so
// design.css's week letter block and large.css's copy of it draw the board's cell exactly as
// they draw the week's (tests/monthboard.test.mjs compares the two node for node). Three
// differences, on purpose: the letters are this board's (two where two sites share one),
// each block says which site it is (data-place, which the picture reads), and the cell is
// out of the Tab order - a month is a thousand cells, and the date above each one is the
// button a keyboard reaches its day by.
function monthBoardCell(row, cell) {
    const R = MONTH_BOARD_REUSED;
    const node = el('td', 'week-cell');
    if (parseLocalDate(cell.date).getDay() === 6) node.classList.add('col-rest');
    const said = [];
    if (cell.absent) {
        node.classList.add('cell-absent');
        node.textContent = R.absent;
        said.push(R.absent);
    } else if (cell.lines.length > 0) {
        node.classList.add('cell-filled');
        cell.lines.forEach(line => {
            const block = el('div', 'cell-line tag tag-place');
            if (line.initial) block.dataset.initial = line.initial;
            block.dataset.place = line.placeId;
            appendSiteName(block, line.placeId, line.name);
            paintSite(block, line.placeId);
            if (line.double) {
                block.classList.add('cell-double');
                block.appendChild(el('span', 'tag-rate', line.word));
            } else if (line.extra) {
                block.classList.add('cell-extra');
                block.appendChild(el('span', 'tag-rate', line.word));
            }
            said.push(line.word ? `${isolate(line.name)} ${line.word}` : isolate(line.name));
            node.appendChild(block);
        });
    }
    node.tabIndex = -1;
    node.setAttribute('role', 'button');
    const parsed = parseLocalDate(cell.date);
    const who = `${isolate(row.name)} · ${hebrewDayName(parsed)} ${formatFullDate(parsed)}`;
    node.setAttribute('aria-label', said.length ? `${who} · ${said.join(' · ')}` : who);
    node.dataset.date = cell.date;
    return node;
}

function monthBoardHeader(facts) {
    const T = MONTH_BOARD_TEXT;
    const R = MONTH_BOARD_REUSED;
    const head = el('div', 'month-board-head');

    const back = button(R.back, 'btn-secondary month-board-back', monthBoardBack);
    back.dataset.monthBoard = 'back';
    head.appendChild(back);

    const title = el('h2', 'month-board-title', facts.title);
    title.id = 'monthBoardTitle';
    title.tabIndex = -1;
    head.appendChild(title);

    // The month is said once, in the title above: an arrow keeps the focus after its step, and
    // each arrow is DESCRIBED BY the title, so a screen reader landing back on the new arrow
    // says the month it went to - the job «סיכום חודש»'s live month line does in its dialog.
    // THE TWO ARROWS ARE THE ROW, on every month: nothing is ever drawn between them, so the
    // second «חודש קודם» lands where the first one did.
    const steps = el('div', 'month-board-steps');
    const prev = button(MONTH_SUMMARY_TEXT.prev, 'btn-secondary btn-nav nav-back month-board-step', () => monthBoardStep(-1));
    prev.insertBefore(chevronIcon('back'), prev.firstChild);
    prev.dataset.monthBoard = 'prev';
    prev.setAttribute('aria-describedby', 'monthBoardTitle');
    steps.appendChild(prev);
    const next = button(MONTH_SUMMARY_TEXT.next, 'btn-secondary btn-nav nav-fwd month-board-step', () => monthBoardStep(1));
    next.appendChild(chevronIcon('fwd'));
    next.dataset.monthBoard = 'next';
    next.setAttribute('aria-describedby', 'monthBoardTitle');
    steps.appendChild(next);
    head.appendChild(steps);

    // The filter: a native list, the phone's own picker - one finger, no drawn menu.
    const filter = el('label', 'month-board-filter');
    filter.appendChild(el('span', 'month-board-filter-word', T.filter));
    const select = el('select', 'month-board-select');
    select.id = 'monthBoardPlace';
    const all = el('option', null, R.allSites);
    all.value = '';
    select.appendChild(all);
    facts.sites.forEach(site => {
        const option = el('option', null, site.name);
        option.value = site.id;
        select.appendChild(option);
    });
    select.value = facts.place ? facts.place.id : '';
    select.addEventListener('change', () => monthBoardChoosePlace(select.value));
    filter.setAttribute('for', 'monthBoardPlace');
    filter.appendChild(select);
    head.appendChild(filter);
    // «החודש», only off this month - on it, the chip would be a button that does nothing - at
    // the END OF THE SITE'S ROW, which shortens the list beside it and moves nothing else.
    // Never between the arrows: drawn there it took the inner third of each the moment the
    // board left this month, and a second «חודש קודם» at a person's pace landed on it and went
    // back to this month. Nor on a row of its own under them, the worker card's way: that row
    // cost the 320px phone with «תצוגה גדולה» the one man its first screen holds, on the
    // month-end board of last month (the review of v206, measured).
    if (!facts.thisMonth) {
        const home = button(R.thisMonth, 'btn-secondary month-board-home', monthBoardHome);
        home.dataset.monthBoard = 'home';
        head.appendChild(home);
    }

    // Paper and the picture, when there is a board to put on them - the week's own two
    // words, and the week's rule for a week with nobody on it.
    if (!facts.empty) {
        const out = el('div', 'month-board-out');
        const print = button(R.print, 'btn-secondary month-board-print', monthBoardPrint);
        print.dataset.monthBoard = 'print';
        out.appendChild(print);
        const share = button(R.share, 'btn-secondary month-board-share', monthBoardShare);
        share.dataset.monthBoard = 'share';
        out.appendChild(share);
        head.appendChild(out);
    }
    return head;
}

function monthBoardTable(facts) {
    const R = MONTH_BOARD_REUSED;
    const table = el('table', 'month-board-table');

    const head = el('thead');
    const headRow = el('tr');
    const corner = el('th', 'corner month-board-corner');
    corner.appendChild(el('span', 'name-clip', R.corner));
    headRow.appendChild(corner);
    facts.dates.forEach(day => {
        const parsed = parseLocalDate(day.date);
        const th = el('th', 'month-board-date');
        th.dataset.date = day.date;
        if (day.saturday) th.classList.add('month-board-saturday');
        // The date is the keyboard's way into its day (the cells are out of the Tab order),
        // and a finger's: it opens the day, as a cell under it does.
        const go = button('', 'month-board-day', () => monthBoardOpenDay(day.date),
            `${hebrewDayName(parsed)} ${formatFullDate(parsed)}`);
        go.appendChild(el('span', 'month-board-letter', HEBREW_DAY_LETTERS[parsed.getDay()]));
        go.appendChild(el('span', 'month-board-dd', String(parsed.getDate()).padStart(2, '0')));
        if (day.date === facts.today) go.setAttribute('aria-current', 'date');
        th.appendChild(go);
        headRow.appendChild(th);
    });
    headRow.appendChild(el('th', 'month-board-total-head', facts.totalHead));
    head.appendChild(headRow);
    table.appendChild(head);

    const body = el('tbody');
    facts.rows.forEach(row => {
        const tr = el('tr');
        tr.dataset.workerId = row.workerId;
        const name = el('td', 'month-board-name');
        // His name opens his card - the month as a calendar, his days, his money: the board
        // counts, the card explains. Its spoken name is the button's whole name (a label
        // replaces what a button holds), so it says what the button shows: his name, «לא
        // פעיל» when he is not, and the number in the last column under that column's word.
        const said = row.active ? isolate(row.name) : `${isolate(row.name)} · ${R.inactive}`;
        const who = button('', 'month-board-who', () => monthBoardOpenCard(row.workerId),
            facts.place ? MONTH_BOARD_TEXT.rowNameAtSite(said, row.total) : MONTH_BOARD_TEXT.rowName(said, row.total));
        who.title = row.name;
        who.appendChild(el('span', 'month-board-who-name', row.name));
        // Said plainly, the week's reason: a name in a month he worked and a name on the
        // roster today are two statements.
        if (!row.active) who.appendChild(el('span', 'badge month-board-badge', R.inactive));
        name.appendChild(who);
        tr.appendChild(name);
        row.cells.forEach(cell => tr.appendChild(monthBoardCell(row, cell)));
        tr.appendChild(el('td', 'month-board-total', String(row.total)));
        body.appendChild(tr);
    });
    table.appendChild(body);

    const foot = el('tfoot');
    facts.foot.forEach(line => {
        const tr = el('tr', `month-board-foot month-board-foot-${line.kind}`);
        tr.dataset.kind = line.kind;
        const label = el('td', 'month-board-foot-label');
        label.appendChild(el('span', 'name-clip', line.label));
        tr.appendChild(label);
        facts.dates.forEach(day => {
            const count = line.byDate[day.date] || 0;
            tr.appendChild(el('td', 'month-board-count', count > 0 ? String(count) : ''));
        });
        tr.appendChild(el('td', 'month-board-total', line.total === null ? '' : String(line.total)));
        foot.appendChild(tr);
    });
    table.appendChild(foot);

    // ONE pair of listeners for the whole grid rather than one per cell: a month is a
    // thousand cells, and every one of them does the same thing with its own date.
    const open = event => {
        const cell = event.target && event.target.closest ? event.target.closest('td.week-cell[data-date]') : null;
        if (cell && body.contains(cell)) return cell;
        return null;
    };
    body.addEventListener('click', event => {
        const cell = open(event);
        if (cell) monthBoardOpenDay(cell.dataset.date);
    });
    body.addEventListener('keydown', event => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        const cell = open(event);
        if (!cell) return;
        event.preventDefault();
        monthBoardOpenDay(cell.dataset.date);
    });
    return table;
}

function drawMonthBoard(facts) {
    const R = MONTH_BOARD_REUSED;
    const board = el('section', 'month-board');
    board.dataset.key = facts.key;
    if (facts.place) board.dataset.place = facts.place.id;
    board.setAttribute('aria-labelledby', 'monthBoardTitle');
    board.appendChild(monthBoardHeader(facts));
    // Paper's heading (css/app.css shows it there and nowhere else), which the picture reads
    // too; the screen's is above. A month that is not over says the day it was made.
    board.appendChild(el('h1', 'month-print-title', facts.paperTitle));

    if (facts.empty) {
        board.appendChild(emptyHint(MONTH_SUMMARY_TEXT.empty));
        return board;
    }

    // The week's own strip and box: the grid scrolls sideways INSIDE its box with the names
    // pinned, the page never does, and the box's edge fades where it is cut (css/app.css).
    const strip = el('div', 'week-strip month-board-strip');
    const scroller = el('div', 'table-scroll month-board-scroll');
    scroller.appendChild(monthBoardTable(facts));
    strip.appendChild(scroller);
    board.appendChild(strip);

    const legend = el('div', 'month-board-legend');
    facts.legend.forEach(site => {
        const chip = el('span', 'tag tag-place month-board-key');
        chip.dataset.place = site.placeId;
        chip.appendChild(el('span', 'month-board-key-letters', site.letters));
        appendSiteName(chip, site.placeId, site.name);
        paintSite(chip, site.placeId);
        legend.appendChild(chip);
    });
    board.appendChild(legend);
    board.appendChild(el('p', 'month-board-marks', R.marks));
    facts.notes.forEach(note => board.appendChild(el('p', `month-board-note month-board-note-${note.kind}`, note.text)));
    // A hint, so not on paper (css/app.css hides .hint there): paper has no finger.
    board.appendChild(el('p', 'hint month-board-hint', R.tap));
    return board;
}

// WHERE THE READER WAS, read off the board on screen before it is cleared. render() rebuilds
// #weekView on every commit and on every record adopted from another phone, and a board that
// went back to its first column and the top of the page under a man reading the 23rd would
// have moved under his finger for nothing he did: the grid's sideways place, the page's
// place and the control the keyboard was on are put back after the redraw.
function monthBoardHeld(root) {
    const board = root && root.querySelector ? root.querySelector('.month-board') : null;
    if (!board) return null;
    const scroller = board.querySelector('.month-board-scroll');
    const active = typeof document !== 'undefined' ? document.activeElement : null;
    let focus = null;
    if (active && active !== board && board.contains(active)) {
        const row = active.closest('tr[data-worker-id]');
        const cell = active.closest('td.week-cell[data-date]');
        const date = active.closest('th[data-date]');
        if (active.dataset && active.dataset.monthBoard) focus = { control: active.dataset.monthBoard };
        else if (active.id) focus = { id: active.id };
        else if (cell && row) focus = { worker: row.dataset.workerId, date: cell.dataset.date };
        else if (date) focus = { date: date.dataset.date };
        else if (row) focus = { worker: row.dataset.workerId };
    }
    return {
        key: board.dataset.key,
        place: board.dataset.place || null,
        left: scroller ? scroller.scrollLeft : null,
        top: typeof window !== 'undefined' && typeof window.scrollY === 'number' ? window.scrollY : null,
        focus
    };
}

// The place put back - or, for a board that was not on screen a moment ago (the door, a new
// month, a new site), the grid opened on today's column when the board is on this month (on
// a Saturday that is no column, the day before it: facts.anchor) and on its first date
// otherwise.
function monthBoardPutBack(board, facts, held) {
    const scroller = board.querySelector('.month-board-scroll');
    const place = facts.place ? facts.place.id : null;
    const same = Boolean(held) && held.key === facts.key && held.place === place;
    if (scroller && typeof scroller.getBoundingClientRect === 'function') {
        const th = facts.anchor ? scroller.querySelector(`th[data-date="${facts.anchor}"]`) : null;
        if (same && held.left !== null) {
            scroller.scrollLeft = held.left;
        } else if (th) {
            // The days are read in what the pinned names leave of the box: on the left of
            // them in a right-to-left page, on the right in the other.
            const corner = scroller.querySelector('.month-board-corner');
            const box = scroller.getBoundingClientRect();
            const names = corner ? corner.getBoundingClientRect().width : 0;
            const rtl = getComputedStyle(scroller).direction === 'rtl';
            const middle = rtl ? (box.left + box.right - names) / 2 : (box.left + names + box.right) / 2;
            const column = th.getBoundingClientRect();
            scroller.scrollLeft += (column.left + column.width / 2) - middle;
            monthBoardWholeAtNames(scroller, rtl);
        } else {
            scroller.scrollLeft = 0;
        }
    }
    if (held && held.top !== null && typeof window.scrollTo === 'function' && Math.abs(window.scrollY - held.top) > 0.5) {
        window.scrollTo(window.scrollX, held.top);
    }
    if (!held || !held.focus) return;
    const want = held.focus;
    const node = want.control ? board.querySelector(`[data-month-board="${want.control}"]`)
        : want.id ? document.getElementById(want.id)
        : want.worker && want.date ? board.querySelector(`tr[data-worker-id="${want.worker}"] td.week-cell[data-date="${want.date}"]`)
        : want.date ? board.querySelector(`th[data-date="${want.date}"] .month-board-day`)
        : board.querySelector(`tr[data-worker-id="${want.worker}"] .month-board-who`);
    if (node && typeof node.focus === 'function' && board.contains(node)) node.focus({ preventScroll: true });
}

// NO DAY HALF UNDER THE NAMES. Centred on today, the grid could leave a column standing half
// under the pinned names - and at the foot its count then read as the end of the label
// beside it: «סה"כ עובדים1», «רישום לרימא3» (the review of v206). The grid is moved by less
// than half a column, whichever way is shorter, so the column at the names' edge is either
// all on the glass or all under the names. Only at an opening: a place kept across a
// redraw is the reader's own and is put back exactly.
function monthBoardWholeAtNames(scroller, rtl) {
    const corner = scroller.querySelector('.month-board-corner');
    if (!corner) return;
    const names = corner.getBoundingClientRect();
    const edge = rtl ? names.left : names.right;
    const cut = [...scroller.querySelectorAll('thead th[data-date]')].map(th => th.getBoundingClientRect())
        .find(column => column.left < edge - 0.5 && column.right > edge + 0.5);
    if (!cut) return;
    const toRight = cut.right - edge;
    const toLeft = cut.left - edge;
    scroller.scrollLeft += Math.abs(toRight) <= Math.abs(toLeft) ? toRight : toLeft;
}

// js/ui/week.js calls this, in the month mode, in place of the week's header, its phone
// panel and its table - on every width; the week's mode is what says the board is on. It
// clears the week's section itself, after reading where the reader was.
function renderMonthBoard(root) {
    if (!monthBoardIsKey(MONTH_BOARD_KEY)) MONTH_BOARD_KEY = monthSummaryKeyOf(todayStr());
    const held = monthBoardHeld(root);
    clear(root);
    root.classList.toggle('week-phone-grid', false);
    const facts = monthBoardFacts(MONTH_BOARD_KEY, MONTH_BOARD_PLACE);
    const board = drawMonthBoard(facts);
    root.appendChild(board);
    monthBoardPutBack(board, facts, held);
    return board;
}

// ---------------------------------------------------------------- the ways in and out

// THE DOOR: the week grid's corner cell, asked for by js/ui/week.js through typeof. It had
// the room - the corner is 67 to 136px wide and its row 50 to 63px tall on the measured
// phones - so a 44px button (52 with «תצוגה גדולה») costs the header row nothing, where one
// more row of buttons over the grid cost the 62-year-old's small phone one of its two rows.
function monthBoardDoor() {
    const door = button(MONTH_BOARD_TEXT.door, 'btn-secondary month-board-door', monthBoardFromWeek);
    door.id = 'monthBoardDoor';
    return door;
}

// From the week on screen: this month when the week holds today, else the month MOST of the
// week is in - the month of its fourth day of seven, its Monday - so the board opens on the
// month he was looking at. A week from Friday the 30th of October to Thursday the 5th of
// November is a November week (five of its six working days), and the month of its Friday
// opened a board without any of them (the review of v206).
function monthBoardFromWeek() {
    const dates = weekDates();
    const today = todayStr();
    MONTH_BOARD_KEY = monthSummaryKeyOf(dates.includes(today) ? today : dates[Math.floor(dates.length / 2)]);
    MONTH_BOARD_PLACE = null;
    setWeekPhoneMode('month');
    monthBoardToTop();
}

// For «מה חדש» and the other readings: the week tab on the board of `key` ('YYYY-MM', null
// for this month), narrowed to `placeId` (null for every site), entered at its title. False
// when there was no board to show (no crew, or a reorder draft that has to be answered
// before the tab may change).
//
// THE CALLER SHUTS ITS OWN DIALOG FIRST AND CALLS THIS ONE TASK LATER (setTimeout(go, 0), the
// rule whatsNewGo keeps in js/ui/whatsnew.js). The board is not a .modal, and js/ui/modal.js
// gives the focus back to the shut dialog's opener at the microtask checkpoint after the block
// that shut it - which, in the same task as this call, would take it off the board's title.
// It does not defer by itself: the door in the week's corner calls straight through, and must
// focus at once.
function openMonthBoard(key, placeId) {
    showView('week');
    if (typeof currentView !== 'undefined' && currentView !== 'week') return false;
    MONTH_BOARD_KEY = monthBoardIsKey(key) ? key : monthSummaryKeyOf(todayStr());
    MONTH_BOARD_PLACE = placeId === null || placeId === undefined || placeId === '' ? null : String(placeId);
    setWeekPhoneMode('month');
    monthBoardToTop();
    return Boolean(document.getElementById('monthBoardTitle'));
}

// The top of the board in view: its title has just taken the focus, without a scroll.
function monthBoardToTop() {
    if (typeof window !== 'undefined' && typeof window.scrollTo === 'function') window.scrollTo(0, 0);
}

function monthBoardBack() {
    setWeekPhoneMode('grid');
}

// A step of the board redraws it, and the control that was pressed takes the focus back -
// it can be pressed again - or, when it is gone (the chip of this month, on this month),
// the title does.
function monthBoardRedraw(focus) {
    renderWeek();
    const target = document.querySelector(`#weekView [data-month-board="${focus}"]`)
        || document.getElementById('monthBoardTitle');
    if (target && typeof target.focus === 'function') target.focus({ preventScroll: true });
}

function monthBoardStep(months) {
    MONTH_BOARD_KEY = monthSummaryShift(monthBoardIsKey(MONTH_BOARD_KEY) ? MONTH_BOARD_KEY : monthSummaryKeyOf(todayStr()), months);
    monthBoardRedraw(months < 0 ? 'prev' : 'next');
}

function monthBoardHome() {
    MONTH_BOARD_KEY = monthSummaryKeyOf(todayStr());
    monthBoardRedraw('home');
}

function monthBoardChoosePlace(value) {
    MONTH_BOARD_PLACE = value === null || value === undefined || value === '' ? null : String(value);
    renderWeek();
    const select = document.getElementById('monthBoardPlace');
    if (select && typeof select.focus === 'function') select.focus({ preventScroll: true });
}

// A date or a cell: the day screen on that date - a day chosen by hand, so a follow still
// owed from midnight is settled by it (dayChosenByHand, js/app.js), as the week's cell does.
function monthBoardOpenDay(date) {
    if (!isRealDate(date)) return;
    State.date = date;
    if (typeof dayChosenByHand === 'function') dayChosenByHand();
    showView('day');
}

// His card ON THE BOARD'S MONTH. The card opens on the month today is in - its calendar and
// «ימים בכל אתר» - and a man's dispute about October is read on October: off this month the
// card is put on the board's month, the place its own «חודש קודם» would put it, and drawn
// again (the review of v206). The month is the card's own memory (WORKER_CARD_MONTH,
// js/ui/workercard.js), forgotten when it shuts; nothing is written.
function monthBoardOpenCard(workerId) {
    if (typeof openWorkerCard !== 'function') return;
    openWorkerCard(workerId);
    const key = MONTH_BOARD_KEY;
    if (!monthBoardIsKey(key) || key === monthSummaryKeyOf(todayStr())) return;
    if (typeof WORKER_CARD_MONTH === 'undefined' || typeof renderWorkerCardIfOpen !== 'function') return;
    WORKER_CARD_MONTH = key;
    renderWorkerCardIfOpen();
}

function monthBoardPrint() {
    printWithFallback('month');
}

function monthBoardShare() {
    sharePrintout('month');
}

// ---------------------------------------------------------------- the picture

// The board as drawn: its title, the dates, each man with every block his cells hold (the
// site, its letters, its mark and the colour the screen computed for it), the totals, the
// foot rows, the legend and the notes - read off the DOM, as js/ui/printout.js reads the
// week. Null when the board is not on screen, or holds no grid.
function readMonthPrintout() {
    const root = document.getElementById('weekView');
    const board = root ? root.querySelector('.month-board') : null;
    const table = board ? board.querySelector('.month-board-table') : null;
    if (!table) return null;
    const text = node => printoutText(node);
    const days = [...table.querySelectorAll('thead th[data-date]')].map(th => ({
        date: th.dataset.date,
        letter: text(th.querySelector('.month-board-letter')),
        day: text(th.querySelector('.month-board-dd')),
        saturday: th.classList.contains('month-board-saturday')
    }));
    const rows = [...table.querySelectorAll('tbody tr')].map(tr => ({
        workerId: tr.dataset.workerId,
        name: text(tr.querySelector('.month-board-who-name')),
        badge: text(tr.querySelector('.month-board-badge')),
        cells: [...tr.querySelectorAll('td.week-cell')].map(td => ({
            date: td.dataset.date,
            absent: td.classList.contains('cell-absent'),
            lines: [...td.querySelectorAll('.cell-line')].map(line => ({
                placeId: line.dataset.place,
                initial: line.dataset.initial || '',
                mark: text(line.querySelector('.site-mark')),
                double: line.classList.contains('cell-double'),
                extra: line.classList.contains('cell-extra'),
                // The colour the screen computed for THIS block: paintSite wrote it, the scheme
                // resolved it. Read, not recomputed - the week's own rule.
                color: getComputedStyle(line).backgroundColor
            }))
        })),
        total: text(tr.querySelector('.month-board-total'))
    }));
    // NOT the site's own men («בלי עובדי רימא»): the owner's figure, screen and workbook only
    // since v167 («شاشة وإكسل بس») - the paper and the picture are what gets handed on. Left out
    // by its KIND, as readReportPrintout leaves .report-norima out by name; css/app.css keeps it
    // off the paper by the same kind.
    const foot = [...table.querySelectorAll('tfoot tr')]
        .filter(tr => tr.dataset.kind !== 'own')
        .map(tr => ({
            kind: tr.dataset.kind,
            label: text(tr.querySelector('.month-board-foot-label')),
            counts: [...tr.querySelectorAll('.month-board-count')].map(text),
            total: text(tr.querySelector('.month-board-total'))
        }));
    const legend = [...board.querySelectorAll('.month-board-legend .month-board-key')].map(chip => ({
        placeId: chip.dataset.place,
        letters: text(chip.querySelector('.month-board-key-letters')),
        mark: text(chip.querySelector('.site-mark')),
        name: text(chip.querySelector('.site-name')),
        color: getComputedStyle(chip).backgroundColor
    }));
    const notes = [...board.querySelectorAll('.month-board-marks, .month-board-note')].map(text).filter(Boolean);
    return {
        title: text(board.querySelector('.month-print-title')),
        name: MONTH_BOARD_TEXT.file(board.dataset.key),
        corner: text(table.querySelector('.month-board-corner')),
        totalLabel: text(table.querySelector('.month-board-total-head')),
        days,
        rows,
        foot,
        legend,
        notes
    };
}

// The board, planned on js/ui/printout.js's paper: right to left, the names at the right
// edge and «נוכחות» at the left, every day a column, every block a rounded square in its
// site's colour with its letters in white and the day's mark - the white dot of a doubled day
// or the plus of extra hours - beside them, «—» for an absence. Sizes in CSS pixels; the
// caller scales the bitmap within PRINTOUT_MAX_SIDE. `layout` names, in order, the title,
// the header band, every man's row then every foot row, and every cell's block then every
// legend swatch - so a suite can sample the PNG where the drawing says a thing is.
function planMonthPrintout(spec, probe, family) {
    const PAD = 20;
    const TITLE_H = 34;
    const HEAD_H = 44;
    const ROW_MIN = 30;
    const FOOT_MIN = 28;
    const CHIP_H = 18;
    const CHIP_GAP = 3;
    const LEGEND_H = 28;
    const NOTE_LINE = 20;
    const NAME_FONT = printoutFont(600, 14, family);
    const BADGE_FONT = printoutFont(500, 12, family);
    const FOOT_FONT = printoutFont(700, 13, family);
    const LETTER_FONT = printoutFont(800, 12, family);
    const LEGEND_FONT = printoutFont(500, 14, family);
    const NOTE_FONT = printoutFont(500, 13, family);
    const measure = (font, words) => { probe.font = font; return probe.measureText(words || '').width; };
    const lettersOf = line => `${line.mark || ''}${line.initial || line.letters || ''}`;

    const widest = Math.max(0,
        ...spec.rows.map(row => measure(NAME_FONT, row.name)),
        ...spec.foot.map(row => measure(FOOT_FONT, row.label)),
        measure(printoutFont(600, 12, family), spec.corner));
    const NAME_W = Math.max(140, Math.min(240, Math.ceil(widest) + 20));
    probe.font = NAME_FONT;
    const names = spec.rows.map(row => printoutWrap(probe, row.name, NAME_W - 16));
    probe.font = FOOT_FONT;
    const footLabels = spec.foot.map(row => printoutWrap(probe, row.label, NAME_W - 16));
    const TOTAL_W = Math.max(60, Math.ceil(measure(FOOT_FONT, spec.totalLabel)) + 20);
    const chipWidth = line => Math.max(CHIP_H,
        Math.ceil(measure(LETTER_FONT, lettersOf(line))) + (line.double || line.extra ? 9 : 0) + 8);
    let widestChip = CHIP_H;
    spec.rows.forEach(row => row.cells.forEach(cell => cell.lines.forEach(line => {
        widestChip = Math.max(widestChip, chipWidth(line));
    })));
    const DAY_W = Math.max(32, widestChip + 8);
    const columns = Math.max(spec.days.length, 1);

    const rowHeights = spec.rows.map((row, r) => Math.max(ROW_MIN,
        10 + names[r].length * 18 + (row.badge ? 16 : 0),
        ...row.cells.map(cell => 8 + cell.lines.length * (CHIP_H + CHIP_GAP) - CHIP_GAP)));
    const footHeights = spec.foot.map((row, r) => Math.max(FOOT_MIN, 10 + footLabels[r].length * 17));

    const width = PAD * 2 + NAME_W + DAY_W * columns + TOTAL_W;
    const inner = width - PAD * 2;
    const swatchOf = item => Math.max(CHIP_H + 4, Math.ceil(measure(LETTER_FONT, lettersOf(item))) + 10);
    const legendWidth = spec.legend.map(item => swatchOf(item) + 6 + Math.ceil(measure(LEGEND_FONT, item.name)) + 18);
    let legendLines = 0;
    if (spec.legend.length > 0) {
        let used = 0;
        legendLines = 1;
        legendWidth.forEach(w => {
            if (used > 0 && used + w > inner) { legendLines += 1; used = 0; }
            used += w;
        });
    }
    probe.font = NOTE_FONT;
    const noteLines = spec.notes.map(note => printoutWrap(probe, note, inner));
    const noteCount = noteLines.reduce((total, lines) => total + lines.length, 0);

    const tableTop = PAD + TITLE_H + 10;
    const bodyTop = tableTop + HEAD_H;
    const bodyHeight = rowHeights.reduce((total, h) => total + h, 0);
    const footTop = bodyTop + bodyHeight;
    const tableBottom = footTop + footHeights.reduce((total, h) => total + h, 0);
    const legendTop = tableBottom + 14;
    const notesTop = legendTop + legendLines * LEGEND_H + (legendLines ? 8 : 0);
    const height = notesTop + noteCount * NOTE_LINE + PAD;

    // One block: its colour, its letters in white, and the day's mark beside them.
    const chip = (ctx, line, x, y, w) => {
        ctx.fillStyle = line.color;
        printoutRoundRect(ctx, x, y, w, CHIP_H, 5);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = LETTER_FONT;
        ctx.textAlign = 'center';
        const marked = line.double || line.extra;
        const letters = lettersOf(line);
        const lettersAt = marked ? x + w - 4 - measure(LETTER_FONT, letters) / 2 : x + w / 2;
        ctx.font = LETTER_FONT;
        ctx.fillText(letters, lettersAt, y + CHIP_H / 2 + 1);
        if (line.double) {
            ctx.beginPath();
            ctx.arc(x + 7, y + CHIP_H / 2, 2.5, 0, Math.PI * 2);
            ctx.fill();
        } else if (line.extra) {
            ctx.font = printoutFont(800, 12, family);
            ctx.fillText('+', x + 7, y + CHIP_H / 2 + 1);
        }
    };

    const draw = ctx => {
        const paper = PRINTOUT_PAPER;
        const right = width - PAD;
        const left = PAD;
        const layout = { title: null, header: null, rows: [], chips: [] };
        const colLeft = index => right - NAME_W - DAY_W * (index + 1);
        const totalLeft = right - NAME_W - DAY_W * columns - TOTAL_W;

        ctx.fillStyle = paper.ink;
        ctx.font = printoutFont(700, 20, family);
        ctx.textAlign = 'right';
        ctx.fillText(printoutFit(ctx, spec.title, inner), right, PAD + TITLE_H / 2);
        layout.title = { x: left, y: PAD, w: inner, h: TITLE_H };

        // The header band, and a Saturday's column shaded down the grid.
        ctx.fillStyle = paper.band;
        ctx.fillRect(left, tableTop, inner, HEAD_H);
        spec.days.forEach((day, index) => {
            if (!day.saturday) return;
            ctx.save();
            ctx.globalAlpha = 0.65;
            ctx.fillStyle = paper.band;
            ctx.fillRect(colLeft(index), bodyTop, DAY_W, bodyHeight);
            ctx.restore();
        });
        layout.header = { x: left, y: tableTop, w: inner, h: HEAD_H };
        ctx.textAlign = 'center';
        spec.days.forEach((day, index) => {
            const centre = colLeft(index) + DAY_W / 2;
            ctx.fillStyle = paper.ink2;
            ctx.font = printoutFont(600, 13, family);
            ctx.fillText(day.letter, centre, tableTop + 15);
            ctx.fillStyle = paper.ink;
            ctx.font = printoutFont(700, 12, family);
            ctx.fillText(day.day, centre, tableTop + 31);
        });
        ctx.fillStyle = paper.ink2;
        ctx.font = printoutFont(700, 13, family);
        ctx.fillText(printoutFit(ctx, spec.totalLabel, TOTAL_W - 8), totalLeft + TOTAL_W / 2, tableTop + HEAD_H / 2);
        ctx.textAlign = 'right';
        ctx.font = printoutFont(600, 12, family);
        ctx.fillText(printoutFit(ctx, spec.corner, NAME_W - 16), right - 8, tableTop + HEAD_H / 2);

        // The men.
        let y = bodyTop;
        const cellChips = [];
        spec.rows.forEach((row, rowIndex) => {
            const h = rowHeights[rowIndex];
            layout.rows.push({ x: left, y, w: inner, h });
            ctx.fillStyle = paper.ink;
            ctx.textAlign = 'right';
            ctx.font = NAME_FONT;
            const nameHeight = names[rowIndex].length * 18 + (row.badge ? 16 : 0);
            let nameY = y + (h - nameHeight) / 2 + 9;
            names[rowIndex].forEach(line => {
                ctx.font = NAME_FONT;
                ctx.fillText(printoutFit(ctx, line, NAME_W - 16), right - 8, nameY);
                nameY += 18;
            });
            if (row.badge) {
                ctx.fillStyle = paper.ink3;
                ctx.font = BADGE_FONT;
                ctx.fillText(row.badge, right - 8, nameY);
            }
            row.cells.forEach((cell, index) => {
                const x0 = colLeft(index);
                const centre = x0 + DAY_W / 2;
                if (cell.absent) {
                    ctx.fillStyle = paper.ink3;
                    ctx.font = printoutFont(500, 14, family);
                    ctx.textAlign = 'center';
                    ctx.fillText('—', centre, y + h / 2);
                    return;
                }
                const stack = cell.lines.length * (CHIP_H + CHIP_GAP) - CHIP_GAP;
                let cy = y + (h - stack) / 2;
                cell.lines.forEach(line => {
                    const w = chipWidth(line);
                    const cx = centre - w / 2;
                    chip(ctx, line, cx, cy, w);
                    cellChips.push({ x: cx, y: cy, w, h: CHIP_H, color: line.color });
                    cy += CHIP_H + CHIP_GAP;
                });
            });
            ctx.fillStyle = paper.ink;
            ctx.font = printoutFont(800, 14, family);
            ctx.textAlign = 'center';
            ctx.fillText(row.total, totalLeft + TOTAL_W / 2, y + h / 2);
            printoutLine(ctx, left, y + h + 0.5, right, y + h + 0.5, paper.lineSoft, 1);
            y += h;
        });

        // The foot: each row on the band, its label, its count per day and its own total.
        spec.foot.forEach((row, rowIndex) => {
            const h = footHeights[rowIndex];
            layout.rows.push({ x: left, y, w: inner, h });
            ctx.fillStyle = paper.band;
            ctx.fillRect(left, y, inner, h);
            ctx.fillStyle = paper.ink;
            ctx.textAlign = 'right';
            ctx.font = FOOT_FONT;
            let labelY = y + (h - footLabels[rowIndex].length * 17) / 2 + 9;
            footLabels[rowIndex].forEach(line => {
                ctx.fillText(printoutFit(ctx, line, NAME_W - 16), right - 8, labelY);
                labelY += 17;
            });
            ctx.textAlign = 'center';
            row.counts.forEach((count, index) => {
                if (!count) return;
                ctx.font = FOOT_FONT;
                ctx.fillText(count, colLeft(index) + DAY_W / 2, y + h / 2);
            });
            ctx.font = printoutFont(800, 14, family);
            ctx.fillText(row.total, totalLeft + TOTAL_W / 2, y + h / 2);
            printoutLine(ctx, left, y + 0.5, right, y + 0.5, paper.line, 1);
            y += h;
        });

        // The grid's lines, over everything, so the bands do not swallow them.
        printoutLine(ctx, left + 0.5, tableTop, left + 0.5, tableBottom, paper.line, 1);
        printoutLine(ctx, right - 0.5, tableTop, right - 0.5, tableBottom, paper.line, 1);
        printoutLine(ctx, right - NAME_W + 0.5, tableTop, right - NAME_W + 0.5, tableBottom, paper.line, 1);
        spec.days.forEach((day, index) => {
            const x = colLeft(index) + 0.5;
            printoutLine(ctx, x, tableTop, x, tableBottom, paper.line, 1);
        });
        printoutLine(ctx, left, tableTop + 0.5, right, tableTop + 0.5, paper.line, 1);
        printoutLine(ctx, left, bodyTop + 0.5, right, bodyTop + 0.5, paper.line, 1);
        if (spec.foot.length) printoutLine(ctx, left, footTop + 0.5, right, footTop + 0.5, paper.ink, 1.5);
        printoutLine(ctx, left, tableBottom - 0.5, right, tableBottom - 0.5, paper.line, 1);

        // The legend: each site's block with its letters, and its name, from the right.
        const legendChips = [];
        let lx = right;
        let ly = legendTop;
        spec.legend.forEach((item, index) => {
            const w = legendWidth[index];
            if (lx < right && lx - w < left) { lx = right; ly += LEGEND_H; }
            const swatch = swatchOf(item);
            const sy = ly + (LEGEND_H - CHIP_H) / 2;
            chip(ctx, { color: item.color, mark: item.mark, letters: item.letters }, lx - swatch, sy, swatch);
            legendChips.push({ x: lx - swatch, y: sy, w: swatch, h: CHIP_H, color: item.color });
            ctx.fillStyle = paper.ink;
            ctx.font = LEGEND_FONT;
            ctx.textAlign = 'right';
            ctx.fillText(item.name, lx - swatch - 6, ly + LEGEND_H / 2);
            lx -= w;
        });
        layout.chips = cellChips.concat(legendChips);

        let ny = notesTop;
        ctx.fillStyle = paper.ink3;
        ctx.font = NOTE_FONT;
        ctx.textAlign = 'right';
        noteLines.forEach(lines => lines.forEach(line => {
            ctx.fillText(line, right, ny + NOTE_LINE / 2);
            ny += NOTE_LINE;
        }));
        return layout;
    };

    return { width, height, draw };
}
