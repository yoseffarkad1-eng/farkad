// סיכום שנה - one calendar year on one screen, and the accountant's workbook of it. Opened
// from «סיכום חודש» (js/ui/monthsummary.js), one step out from the month on screen.
//
// WHAT A YEAR CAN SAY, AND WHAT IT CANNOT. A calendar year is never anybody's pay period
// (wholeAccountRange, js/ui/reports.js), so the sheet reads it the plain way under either
// gate: no carry, no walk, no deduction, no balance. That is what makes it cheap and it is
// what limits it. Honest over a year: attendance, pay units, double days, extra hours, the
// worker-site days per site, the Rima and «עובדי יוסף גבס» counts (the latter apart, in no
// sum), the advances HANDED OVER dated in the year, the cash handed back and the corrections
// dated in it (gate open), and «נצבר» - every day worked in the year at the rate stamped on
// that day. NOT honest, and so never said here: «לתשלום», «שולם», a deduction, a balance
// carried or left at 31/12. A pay period that crosses 1 January is split by its days - right
// for "worked", wrong if read as "paid" - and a CLOSED period's frozen wage is not used
// (frozenPeriodFor matches only the exact period), so where a day was corrected after its
// close the year reads the live record. The screen and the file say so before any figure.
//
// IT IS A READING, AND ONLY A READING. Nothing here commits, nothing here touches Store, and
// there is not a field on it: the two arrows change which year is READ, a month's row opens
// «סיכום חודש» on that month, and «📊 יצוא השנה» hands a workbook to the browser - which is
// not a write to anything a person recorded. tests/yearsummary.test.mjs holds every key on
// the disk byte for byte across all of it.
//
// AND IT PRICES NOTHING. Every figure is the answer of a function «סיכום חודש» and «דוחות»
// already ask, pointed at the year:
//
//   each month's row         monthSummaryRead('YYYY-MM')               js/ui/monthsummary.js
//   the year's own line      monthSummaryReadRange(year, 01/01..31/12) js/ui/monthsummary.js
//   the men                  payrollRows over the year, moneyOf         js/ui/reports.js
//   the sites                invoiceByDate, invoiceWithoutRima          js/model/money.js
//                            rimaReport                                 js/model/schema.js
//   עובדי יוסף גבס           yosefGevesReport                           js/model/schema.js
//   money as text            monthSummaryMoney -> moneyText             js/ui/monthsummary.js
//
// THE YEAR'S LINE IS NEVER THE TWELVE ROWS ADDED UP. payrollReport gives a man no wage at all
// for a range in which ONE worked day has no daily rate, and the band counts him as nothing:
// over the year he is out of the year's «נצבר» entirely, over the months only out of the one
// month that holds that day. So the line is read over the year, the men without a rate are
// named in the sheet's own sentence, and when the two differ one sentence says why.
//
// THE GATE COMES WITH THE FUNCTIONS. The whole reading is the pay sheet's one reading
// (reportReadOnce) inside the month summary's own scope (monthSummaryScope), so the gate is
// answered at most once and, on a record that carries the approval, not planned at all.

// ---------------------------------------------------------------- the words
//
// Every Hebrew string this file adds, in one block. PROPOSED, not approved: the owner has not
// read them. Pinned word for word in tests/yearsummary.test.mjs, so changing one is a decision.
const YEAR_SUMMARY_TEXT = Object.freeze({
    // The head of the screen, and the same words on the door in «סיכום חודש».
    title: year => `סיכום שנת ${year}`,
    entry: year => `סיכום שנת ${year}`,
    prev: 'שנה קודמת',
    next: 'שנה הבאה',
    // Painted the moment it opens, before a single figure is read.
    reading: 'מחשב את השנה…',
    empty: 'אין רישומים בשנה הזאת.',
    // The frame, always first - on the screen and on the workbook's first sheet.
    worked: 'נצבר לפי הרישום: כל יום עבודה בשנה, לפי השכר שנרשם ליום הזה. זה לא מה ששולם בפועל.',
    split: 'תקופת תשלום שעוברת את 1 בינואר מתחלקת כאן לפי הימים: כל יום נספר בשנה שבה עבדו בו.',
    inProgress: 'השנה עוד לא נגמרה. המספרים הם של מה שנרשם עד עכשיו.',
    figures: 'השנה במספרים',
    // The year's «מקדמות»: what was HANDED OVER in it - never a deduction.
    handedOver: 'מקדמות שניתנו',
    notSummed: 'הנצבר של השנה מחושב על כל השנה ולא מחיבור החודשים, ולכן הוא שונה כאן מחיבור החודשים.',
    months: 'חודש אחר חודש',
    monthsHint: 'לחיצה על חודש פותחת את סיכום החודש.',
    men: 'העובדים בשנה',
    sites: 'האתרים בשנה',
    // The months a site was worked in: «מרץ», or «ינואר–נובמבר».
    span: (first, last) => (first === last ? first : `${first}–${last}`),
    export: '📊 יצוא השנה',
    // The workbook's sheets after «סיכום», and the head of the months' first column.
    monthsSheet: 'חודשים',
    menSheet: 'עובדים',
    sitesSheet: 'אתרים',
    monthColumn: 'חודש'
});

// The words this screen borrows that their owner builds inline, each beside the screen that
// owns it; tests/yearsummary.test.mjs finds every one of them in its owner's source. Everything
// the owner keeps as a constant - the month summary's two blocks, the Rima and יוסף גבס titles,
// totals and notes, «בלי עובדי רימא», the ledger's labels, the workbook's «סיכום» and its words,
// the hand-over dialog's two answers - is read from it and not repeated here.
//
// THE HAND-OVER SENTENCE IS THE EXPORT'S, LESS ITS LAST SENTENCE. exportReports ends it by
// pointing at «🖼️ שיתוף כתמונה» beside the export button, as the table that reads right
// everywhere. This dialog has no picture, and that button on «דוחות» draws the pay sheet of its
// own range, not the year - so the sentence that would send him looking for it is the one left
// out, here and in the refusal below (which loses its last clause for the same reason).
const YEAR_SUMMARY_REUSED = Object.freeze({
    payUnits: 'ימי שכר',                              // js/ui/reports.js, the sheet's column
    worker: 'עובד',                                   // js/ui/reports.js, the sheet's first column
    inactive: 'לא פעיל',                              // js/ui/day.js, a man switched off
    handedTitle: 'קובץ ה-Excel נמסר לשמירה',          // js/ui/reports.js, exportReports
    handed: ' נמסר לדפדפן — ',                        // js/ui/reports.js, exportReports
    files: 'פתח את "קבצים" וודא שהוא מופיע. ',        // js/ui/reports.js, exportReports
    direction: 'ב-Excel הטבלה נפתחת מימין לשמאל; תצוגה מקדימה ("קבצים", וואטסאפ, Numbers) ',
    directionEnd: 'עשויה להציג אותה משמאל לימין, עם אותם מספרים.',   // js/ui/reports.js
    csv: 'חלק מהאפליקציה חסר במכשיר, ולכן הקבצים יוצאו כ-CSV במקום Excel. ',   // exportReports
    csvEnd: 'המספרים זהים. רענן את הדף כדי להשלים את ההתקנה.',        // exportReports
    refusedTitle: 'ההורדה נחסמה',                     // js/ui/reports.js, downloadRefusedNotice
    refused: 'הדפדפן לא קיבל את ',
    refusedTook: 'כן התקבלו: ',
    refusedRecord: 'הרישום במכשיר לא השתנה. ',
    refusedAgain: 'נסה שוב; אם זה חוזר, ההורדות חסומות במכשיר הזה - בדוק את הגדרות ההורדה ',
    refusedWhere: 'בדפדפן',
    failedTitle: 'היצוא נכשל',                        // js/ui/reports.js, exportReports
    failed: 'קובץ ה-Excel לא נוצר. לא שינינו כלום. '  // js/ui/reports.js, exportReports
});

// Which year is on the screen, as a number, or null when it is shut. Memory only: a reload
// closes it, and nothing about it is kept anywhere.
let YEAR_SUMMARY_YEAR = null;
// The last reading, kept under the record itself (yearSummaryKey) so that a redraw of a record
// that did not move reads nothing, and a kept figure is never another record's. Memory only.
let YEAR_SUMMARY_KEPT = null;
// What is on the screen now: { year, key } of the reading drawn, or null while it reads.
let YEAR_SUMMARY_DRAWN = null;
// Which reading is wanted. A reading that was asked for and then overtaken - an arrow pressed
// again, the dialog shut - finds a newer turn and draws nothing.
let YEAR_SUMMARY_TURN = 0;

// ---------------------------------------------------------------- the calendar

function yearSummaryRange(year) {
    return { from: `${year}-01-01`, to: `${year}-12-31` };
}

function yearSummaryThisYear() {
    return Number(String(todayStr()).slice(0, 4));
}

function yearSummaryMonthKey(year, month) {
    return `${year}-${String(month).padStart(2, '0')}`;
}

// ---------------------------------------------------------------- the reading

// The year's numbers, as plain data. Called inside monthSummaryScope, which points the report's
// range wherever it is needed here and puts it back - and its filter, with no man left out -
// in a finally.
function yearSummaryRead(year) {
    const range = yearSummaryRange(year);
    const schedule = State.schedule;

    // The twelve months, each exactly what «סיכום חודש» reads for it.
    const months = [];
    for (let month = 1; month <= 12; month += 1) months.push(monthSummaryRead(yearSummaryMonthKey(year, month)));

    // The year's own line: the same functions asked over the whole year, never the rows added.
    const line = monthSummaryReadRange(String(year), range);

    // The men: the pay sheet's own rows over the year. A year is never anybody's period, so
    // this is the plain arithmetic (payrollRowsOver with no carry); «נצבר» and «מקדמות שניתנו»
    // are the very terms payrollBandTotals sums for the line above.
    REPORT_RANGE.from = range.from;
    REPORT_RANGE.to = range.to;
    const roster = {};
    (schedule.workers || []).forEach(worker => { if (worker) roster[String(worker.id)] = worker; });
    const men = payrollRows().map(row => {
        const money = moneyOf(row);
        const worker = roster[String(row.workerId)] || null;
        return {
            workerId: String(row.workerId),
            name: row.name,
            active: !(worker && worker.active === false),
            attendanceDays: row.attendanceDays,
            payUnits: row.payUnits,
            doubleDays: row.doubleDays,
            // Hours, not money: kept off the screen as binary float, the month summary's way.
            extraHours: monthSummaryRound(row.extraHours),
            gross: money.gross,
            // `|| 0`: nothing handed over is 0, not -0.
            handedOver: -money.netted || 0
        };
    });

    // The sites: the billing count (Rima's men included), his own men's share and Rima's, per
    // site, in the billing sheet's own order; the months a site was billed in, off its days.
    const invoice = invoiceByDate(schedule, range.from, range.to);
    const own = invoiceWithoutRima(schedule, range.from, range.to);
    const rima = rimaReport(schedule, range.from, range.to);
    const ownOf = {};
    own.places.forEach(place => { ownOf[String(place.placeId)] = place.workerDays; });
    const rimaOf = {};
    rima.places.forEach(place => { rimaOf[String(place.placeId)] = place.total; });
    const sites = invoice.places.map(place => {
        const dates = Object.keys(place.byDate).sort();
        return {
            placeId: String(place.placeId),
            name: place.name,
            billed: place.workerDays,
            own: ownOf[String(place.placeId)] || 0,
            rima: rimaOf[String(place.placeId)] || 0,
            first: dates.length > 0 ? dates[0].slice(0, 7) : null,
            last: dates.length > 0 ? dates[dates.length - 1].slice(0, 7) : null
        };
    });

    // «עובדי יוסף גבס»: its own list, in no figure above.
    const yosefReport = typeof yosefGevesReport === 'function'
        ? yosefGevesReport(schedule, range.from, range.to) : { places: [], total: 0 };
    const yosef = yosefReport.places.map(place => ({
        placeId: String(place.placeId), name: place.name, total: place.total }));

    // THE TWELVE ROWS' «נצבר» ADDED UP, only to say whether it is the year's - a month with no
    // known wage counts as nothing in it, as the band counts an unknown wage.
    const summed = agora(months.reduce((sum, month) => sum + (month.gross === null ? 0 : month.gross), 0));
    const today = todayStr();
    return {
        year,
        range,
        inProgress: !line.empty && today >= range.from && today < range.to,
        empty: line.empty,
        line,
        months,
        men,
        sites,
        yosef,
        notSummed: summed !== (line.gross === null ? 0 : line.gross)
    };
}

// The year, read once: the pay sheet's one reading around the month summary's own scope.
function yearSummaryFacts(year) {
    if (typeof reportReadOnce === 'function' && !reportReading()) return reportReadOnce(yearSummaryFacts, this, arguments);
    return monthSummaryScope(() => yearSummaryRead(year));
}

// The record, as the key a reading of it is kept under: the write tick, today, both gates and
// the record as text - owesKey's own (js/ui/owes.js), compared and never hashed.
function yearSummaryKey() {
    if (typeof owesKey === 'function') return owesKey(State.schedule, todayStr());
    return `${todayStr()}|${JSON.stringify(State.schedule)}`;
}

// The reading of this moment for `year`: the kept one when the record has not moved since it
// was made, a new one otherwise.
function yearSummaryFactsNow(year) {
    const key = yearSummaryKey();
    if (YEAR_SUMMARY_KEPT && YEAR_SUMMARY_KEPT.year === year && YEAR_SUMMARY_KEPT.key === key) {
        return { facts: YEAR_SUMMARY_KEPT.facts, key };
    }
    const facts = yearSummaryFacts(year);
    YEAR_SUMMARY_KEPT = { year, key, facts };
    return { facts, key };
}

// ---------------------------------------------------------------- the words of a reading
//
// One list for the screen and for the workbook, so neither can show a figure the other leaves
// out. Plain data: a label, the number as the reading has it, and the number as text.

function yearSummaryFrameLines(facts) {
    const T = YEAR_SUMMARY_TEXT;
    const lines = [T.worked, T.split];
    if (facts.inProgress) lines.push(T.inProgress);
    return lines;
}

function yearSummaryTiles(facts) {
    const line = facts.line;
    const M = MONTH_SUMMARY_TEXT;
    const R = MONTH_SUMMARY_REUSED;
    const count = (id, label, value) => ({ id, label, value, text: String(value), money: false });
    const money = (id, label, value) => ({ id, label, value, text: monthSummaryMoney(value), money: true });
    const tiles = [
        count('workingDays', M.workingDays, line.workingDays),
        count('attendance', R.attendance, line.attendance),
        count('men', M.men, line.men),
        count('siteDays', R.siteDaysTotal, line.siteDays)
    ];
    // His own men's share of the billing count, said only when Rima has one - the month's rule.
    if (line.ownSiteDays !== null) tiles.push(count('ownSiteDays', NO_RIMA_TITLE, line.ownSiteDays));
    tiles.push(count('rima', RIMA_TOTAL, line.rima ? line.rima.total : 0));
    tiles.push(money('gross', R.gross, line.gross));
    tiles.push(money('advances', YEAR_SUMMARY_TEXT.handedOver, line.advances));
    // With the gate shut or the migration unapproved these two are null, and not shown
    // (tests/approval.test.mjs is the rule); open, only where there is one.
    if (line.repaid !== null && line.repaid !== 0) tiles.push(money('repaid', LEDGER_KIND_LABELS.repaid, line.repaid));
    if (line.reversed !== null && line.reversed !== 0) tiles.push(money('reversed', LEDGER_KIND_LABELS.reversed, line.reversed));
    return tiles;
}

// «עובדי יוסף גבס», apart from every tile above and in none of them; null with no count.
function yearSummaryApart(facts) {
    if (!facts.line.yosef) return null;
    return { id: 'yosef', label: YOSEF_GEVES_TOTAL, value: facts.line.yosef.total,
        text: String(facts.line.yosef.total), note: YOSEF_GEVES_NOTE };
}

// The sentences under the figures: the men without a rate (the sheet's own), the hours with no
// hourly rate (the sheet's own), and why the months do not add up to the year (this file's).
function yearSummaryNotes(facts) {
    const line = facts.line;
    const notes = [];
    if (line.unpriced.length > 0) {
        notes.push({ id: 'unpriced', warn: true, text: MONTH_SUMMARY_TEXT.unpriced(line.unpriced.length,
            line.unpriced.map(name => isolate(name)).join(', ')) });
    }
    if (line.hoursUnpriced) notes.push({ id: 'hoursUnpriced', warn: true, text: MONTH_SUMMARY_REUSED.hoursUnpriced });
    if (facts.notSummed) notes.push({ id: 'notSummed', warn: false, text: YEAR_SUMMARY_TEXT.notSummed });
    return notes;
}

// What the months' bar counts: his own men's worker-site days - «בלי עובדי רימא» in a year
// Rima has a count in, which is exactly the billing count in one that has none.
function yearSummaryOwnLabel(facts) {
    return facts.line.rima !== null ? NO_RIMA_TITLE : SUMMARY_TEXT.siteDays;
}

function yearSummaryMonthName(key) {
    return MONTH_SUMMARY_TEXT.months[Number(String(key).slice(5, 7)) - 1] || '';
}

// The twelve rows, each as «סיכום חודש» has its month.
function yearSummaryMonthRows(facts) {
    return facts.months.map(month => ({
        key: month.key,
        name: yearSummaryMonthName(month.key),
        empty: month.empty,
        own: month.ownSiteDays !== null ? month.ownSiteDays : month.siteDays,
        men: month.men,
        gross: month.gross,
        advances: month.advances
    }));
}

// A site's months, named.
function yearSummarySpan(site) {
    if (!site.first || !site.last) return '';
    return YEAR_SUMMARY_TEXT.span(yearSummaryMonthName(site.first), yearSummaryMonthName(site.last));
}

// ---------------------------------------------------------------- the drawing
//
// textContent only, like every other screen: a name is text. Sizes come from the stylesheet
// (css/design.css, beside the month summary's block); nothing here sets a height or a font, so
// the text may grow and every row wraps. The look is the month summary's where it fits.

function yearSummaryBody() {
    return typeof document !== 'undefined' ? document.getElementById('yearSummaryBody') : null;
}

// The frame's words for the year on screen, and its two arrows: the next one is not there on
// the year today is in (nothing after it is recorded yet), and the export waits for a reading.
function yearSummaryFrame(facts) {
    const year = YEAR_SUMMARY_YEAR;
    const say = (id, text) => { const node = document.getElementById(id); if (node && node.textContent !== text) node.textContent = text; };
    say('yearSummaryTitle', YEAR_SUMMARY_TEXT.title(year));
    say('yearSummaryYear', String(year));
    const next = document.getElementById('yearSummaryNext');
    if (next) next.hidden = year >= yearSummaryThisYear();
    const exported = document.getElementById('yearSummaryExport');
    if (exported) exported.disabled = !facts || facts.empty;
}

// The range and one line: what is on the screen from the press until the figures are read.
function yearSummaryPaintReading() {
    const body = yearSummaryBody();
    if (!body) return;
    const range = yearSummaryRange(YEAR_SUMMARY_YEAR);
    clear(body);
    body.setAttribute('aria-busy', 'true');
    body.appendChild(el('p', 'msum-range', dateRange(formatFullDate(parseLocalDate(range.from)),
        formatFullDate(parseLocalDate(range.to)))));
    body.appendChild(el('p', 'ysum-reading', YEAR_SUMMARY_TEXT.reading));
}

function yearSummaryPairs(pairs) {
    const box = el('span', 'ysum-pairs');
    pairs.forEach(([label, value]) => {
        const pair = el('span', 'ysum-pair');
        pair.appendChild(el('span', 'ysum-pair-label', label));
        pair.appendChild(el('strong', 'ysum-pair-value', value));
        box.appendChild(pair);
    });
    return box;
}

function drawYearSummary(facts) {
    const body = yearSummaryBody();
    if (!body || YEAR_SUMMARY_YEAR === null) return;
    const T = YEAR_SUMMARY_TEXT;
    const M = MONTH_SUMMARY_TEXT;
    const R = MONTH_SUMMARY_REUSED;
    const Y = YEAR_SUMMARY_REUSED;
    // A month's row that had the focus has it again after a redraw.
    const active = typeof document !== 'undefined' ? document.activeElement : null;
    const focused = active && body.contains && body.contains(active) && active.getAttribute
        ? active.getAttribute('data-ysum-month') : null;

    yearSummaryFrame(facts);
    clear(body);
    body.setAttribute('aria-busy', 'false');
    body.appendChild(el('p', 'msum-range', dateRange(formatFullDate(parseLocalDate(facts.range.from)),
        formatFullDate(parseLocalDate(facts.range.to)))));
    if (facts.empty) {
        body.appendChild(emptyHint(T.empty));
        return;
    }

    // 1. The frame, before any figure.
    const frame = el('div', 'ysum-frame');
    yearSummaryFrameLines(facts).forEach((text, at) => {
        frame.appendChild(el('p', at === 0 ? 'ysum-frame-line ysum-frame-lead' : 'ysum-frame-line', text));
    });
    body.appendChild(frame);

    // 2. The year in figures.
    const figures = monthSummaryBlock(T.figures);
    figures.classList.add('ysum-figures');
    const tiles = el('div', 'msum-tiles');
    yearSummaryTiles(facts).forEach(item => {
        const tile = monthSummaryPair(item.label, item.text, 'msum-pair msum-tile');
        tile.setAttribute('data-figure', item.id);
        tiles.appendChild(tile);
    });
    figures.appendChild(tiles);
    const apart = yearSummaryApart(facts);
    if (apart) {
        const box = el('div', 'ysum-apart');
        const tile = monthSummaryPair(apart.label, apart.text, 'msum-pair msum-tile');
        tile.setAttribute('data-figure', apart.id);
        box.appendChild(tile);
        box.appendChild(el('p', 'msum-note', apart.note));
        figures.appendChild(box);
    }
    yearSummaryNotes(facts).forEach(note => {
        figures.appendChild(el('p', note.warn ? 'hint hint-warn msum-warn' : 'msum-note ysum-notsummed', note.text));
    });
    body.appendChild(figures);

    // 3. Month by month: each row one button into «סיכום חודש» on that month.
    const months = monthSummaryBlock(T.months);
    months.classList.add('ysum-months');
    const rows = yearSummaryMonthRows(facts);
    const label = yearSummaryOwnLabel(facts);
    const most = rows.reduce((max, row) => (row.empty ? max : Math.max(max, row.own)), 0);
    rows.forEach(row => {
        const go = button('', 'btn-secondary ysum-month', () => yearSummaryGoMonth(row.key));
        go.setAttribute('data-ysum-month', row.key);
        const head = el('span', 'ysum-month-head');
        head.appendChild(el('span', 'ysum-month-name', row.name));
        go.appendChild(head);
        if (row.empty) {
            head.appendChild(el('span', 'ysum-month-empty', '—'));
        } else {
            const own = el('span', 'ysum-month-own');
            own.appendChild(el('span', 'ysum-bar-label', label));
            own.appendChild(el('strong', 'ysum-bar-count', String(row.own)));
            head.appendChild(own);
            const track = el('span', 'msum-bar-track ysum-bar-track');
            const fill = el('span', 'ysum-bar-fill');
            fill.style.width = `${most > 0 && row.own > 0 ? Math.max(2, Math.round((row.own / most) * 100)) : 0}%`;
            track.appendChild(fill);
            go.appendChild(track);
            go.appendChild(yearSummaryPairs([
                [M.men, String(row.men)],
                [R.gross, monthSummaryMoney(row.gross)],
                [T.handedOver, monthSummaryMoney(row.advances)]
            ]));
        }
        months.appendChild(go);
    });
    months.appendChild(el('p', 'msum-note', T.monthsHint));
    body.appendChild(months);

    // 4. Every man's year, label over value - never a wide table.
    if (facts.men.length > 0) {
        const men = monthSummaryBlock(T.men);
        men.classList.add('ysum-men');
        facts.men.forEach(man => {
            const row = el('div', 'ysum-man');
            const head = el('div', 'ysum-man-head');
            head.appendChild(el('span', 'ysum-man-name', man.name));
            if (!man.active) head.appendChild(el('span', 'ysum-inactive', Y.inactive));
            row.appendChild(head);
            row.appendChild(yearSummaryPairs([
                [R.attendance, String(man.attendanceDays)],
                [Y.payUnits, String(man.payUnits)],
                [R.doubles, String(man.doubleDays)],
                [R.extraHours, String(man.extraHours)],
                [R.gross, monthSummaryMoney(man.gross)],
                [T.handedOver, monthSummaryMoney(man.handedOver)]
            ]));
            men.appendChild(row);
        });
        body.appendChild(men);
    }

    // 5. Every site's year, then «עובדי יוסף גבס» in its own table, last.
    const withRima = facts.line.rima !== null;
    if (facts.sites.length > 0) {
        const sites = monthSummaryBlock(T.sites);
        sites.classList.add('ysum-sites');
        facts.sites.forEach(site => {
            const row = el('div', 'ysum-site');
            const head = el('div', 'ysum-site-head');
            head.appendChild(monthSummarySiteName({ id: site.placeId, name: site.name }));
            head.appendChild(el('span', 'ysum-span', yearSummarySpan(site)));
            row.appendChild(head);
            const pairs = [[R.siteDaysTotal, String(site.billed)]];
            if (withRima) pairs.push([NO_RIMA_TITLE, String(site.own)], [RIMA_TITLE, String(site.rima)]);
            row.appendChild(yearSummaryPairs(pairs));
            sites.appendChild(row);
        });
        if (withRima) sites.appendChild(el('p', 'msum-note', M.rimaNote));
        body.appendChild(sites);
    }
    if (facts.yosef.length > 0) {
        body.appendChild(monthSummaryCountBlock(YOSEF_GEVES_TITLE, {
            sites: facts.yosef.map(place => ({ id: place.placeId, name: place.name, count: place.total })),
            total: facts.line.yosef ? facts.line.yosef.total : 0
        }, YOSEF_GEVES_TOTAL, YOSEF_GEVES_NOTE, 'ysum-yosefgeves'));
    }

    if (focused) {
        const again = body.querySelector ? [...body.querySelectorAll('.ysum-month')]
            .filter(node => node.getAttribute('data-ysum-month') === focused)[0] : null;
        if (again && again.focus) again.focus({ preventScroll: true });
    }
}

// ---------------------------------------------------------------- the frame

// The door: a button in «סיכום חודש»'s own frame (index.html), shown and worded for the year of
// the month on screen each time that dialog is drawn (drawMonthSummary asks, through typeof). A
// build without this file leaves it hidden.
function yearSummaryEntryLabel(monthKey) {
    const door = typeof document !== 'undefined' ? document.getElementById('monthSummaryYear') : null;
    if (!door) return;
    const year = Number(String(monthKey || '').slice(0, 4));
    if (!Number.isInteger(year) || year < 1000) { door.hidden = true; return; }
    const words = YEAR_SUMMARY_TEXT.entry(year);
    if (door.textContent !== words) door.textContent = words;
    door.hidden = false;
}

function yearSummaryIsOpen() {
    const modal = typeof document !== 'undefined' ? document.getElementById('yearSummaryModal') : null;
    return Boolean(modal && modal.style.display === 'flex' && YEAR_SUMMARY_YEAR !== null);
}

// After the frame that paints «מחשב את השנה…», not in it. The timer beside it is for a page
// given no frame (a window behind another): late, never lost. Where there is no frame at all
// (the suites' devices in Node) it is read in place.
function yearSummaryLater(work) {
    if (typeof requestAnimationFrame !== 'function') { work(); return; }
    let done = false;
    const run = () => { if (!done) { done = true; work(); } };
    requestAnimationFrame(() => setTimeout(run, 0));
    setTimeout(run, 400);
}

// Reads the year on screen - or takes the kept reading of this very record - and draws it, if
// this is still the reading wanted. `keep` holds the place the reader had scrolled to.
function yearSummaryLoad(turn, keep) {
    if (!yearSummaryIsOpen() || turn !== YEAR_SUMMARY_TURN) return;
    const year = YEAR_SUMMARY_YEAR;
    const modal = document.getElementById('yearSummaryModal');
    const content = modal ? modal.querySelector('.modal-content') : null;
    const at = content ? content.scrollTop : 0;
    const now = yearSummaryFactsNow(year);
    drawYearSummary(now.facts);
    YEAR_SUMMARY_DRAWN = { year, key: now.key };
    if (keep && content) content.scrollTop = at;
}

function yearSummaryReadSoon(keep) {
    YEAR_SUMMARY_TURN += 1;
    const turn = YEAR_SUMMARY_TURN;
    yearSummaryLater(() => yearSummaryLoad(turn, keep));
}

function openYearSummary(year) {
    const modal = typeof document !== 'undefined' ? document.getElementById('yearSummaryModal') : null;
    if (!modal) return false;
    const asked = Number(year);
    YEAR_SUMMARY_YEAR = Number.isInteger(asked) && asked >= 1000 && asked <= 9999 ? asked : yearSummaryThisYear();
    YEAR_SUMMARY_DRAWN = null;

    const say = (id, text) => { const node = document.getElementById(id); if (node) node.textContent = text; };
    say('yearSummaryPrev', YEAR_SUMMARY_TEXT.prev);
    say('yearSummaryNext', YEAR_SUMMARY_TEXT.next);
    say('yearSummaryExport', YEAR_SUMMARY_TEXT.export);
    say('yearSummaryClose', MONTH_SUMMARY_REUSED.close);
    say('yearSummaryStatus', '');
    yearSummaryFrame(null);
    yearSummaryPaintReading();

    modal.style.display = 'flex';
    const content = modal.querySelector('.modal-content');
    if (content) content.scrollTop = 0;
    yearSummaryReadSoon(false);
    return true;
}

// From «סיכום חודש»: that dialog shuts and this one opens on the year of its month. The dialogs'
// keeper of the focus (js/ui/modal.js) never sees a moment with no dialog open, so the focus it
// kept - what opened the month - is still what closing the year gives back; and because it does
// not see a NEW dialog either, the year's heading is given the focus here, by hand
// (siteCardGoMan's rule, js/ui/sitecard.js).
function openYearSummaryFromMonth() {
    if (typeof monthSummaryIsOpen !== 'function' || !monthSummaryIsOpen()) return;
    const year = Number(String(MONTH_SUMMARY_KEY).slice(0, 4));
    closeMonthSummary();
    if (!openYearSummary(year)) return;
    const heading = document.getElementById('yearSummaryTitle');
    if (heading && heading.focus) heading.focus({ preventScroll: true });
}

function closeYearSummary() {
    YEAR_SUMMARY_YEAR = null;
    YEAR_SUMMARY_DRAWN = null;
    // Anything still on its way is for a dialog that is not there any more.
    YEAR_SUMMARY_TURN += 1;
    const modal = typeof document !== 'undefined' ? document.getElementById('yearSummaryModal') : null;
    if (modal) modal.style.display = 'none';
    // Its nodes go with it: a shut dialog has nothing on it to be found or read.
    const body = yearSummaryBody();
    if (body) clear(body);
    // The focus goes back to what had it (js/ui/modal.js) - what opened «סיכום חודש», the
    // reports' menu. A redraw of the reports screen while the dialogs were open replaced that
    // node, and then the focus would be left on nothing; the trigger there now takes it.
    setTimeout(() => {
        if (yearSummaryIsOpen() || (typeof monthSummaryIsOpen === 'function' && monthSummaryIsOpen())) return;
        const now = document.activeElement;
        if (now && now !== document.body && !(modal && modal.contains && modal.contains(now))) return;
        const trigger = document.querySelector('#reportsView .report-output-actions > summary');
        if (trigger && trigger.offsetParent !== null) trigger.focus({ preventScroll: true });
    }, 0);
}

// One year back or forward. The arrows are in the frame and are not redrawn, so the focus stays
// on the one that was pressed - except the next one on the year today is in, which is not
// there: its focus goes to the other arrow rather than to nowhere.
function yearSummaryStep(years) {
    if (!yearSummaryIsOpen()) return;
    const by = Math.trunc(Number(years) || 0);
    if (by === 0) return;
    if (by > 0 && YEAR_SUMMARY_YEAR >= yearSummaryThisYear()) return;
    YEAR_SUMMARY_YEAR += by;
    YEAR_SUMMARY_DRAWN = null;
    const next = document.getElementById('yearSummaryNext');
    const hadNext = next && document.activeElement === next;
    yearSummaryFrame(null);
    yearSummaryPaintReading();
    if (hadNext && next.hidden) {
        const back = document.getElementById('yearSummaryPrev');
        if (back && back.focus) back.focus({ preventScroll: true });
    }
    const modal = document.getElementById('yearSummaryModal');
    const content = modal ? modal.querySelector('.modal-content') : null;
    if (content) content.scrollTop = 0;
    yearSummaryReadSoon(false);
}

// A month's row: the year shuts and «סיכום חודש» opens on that month - its heading focused by
// hand, for the reason over openYearSummaryFromMonth.
function yearSummaryGoMonth(key) {
    if (!yearSummaryIsOpen() || typeof openMonthSummary !== 'function') return;
    closeYearSummary();
    openMonthSummary(key);
    const heading = document.getElementById('monthSummaryTitle');
    if (heading && heading.focus) heading.focus({ preventScroll: true });
}

// render() calls this (js/app.js): a snapshot adopted from another phone while the year is open
// must move its figures. Read again only when the record moved - after the frame, the place the
// reader had scrolled to kept.
function renderYearSummaryIfOpen() {
    if (!yearSummaryIsOpen() || !YEAR_SUMMARY_DRAWN) return;
    if (YEAR_SUMMARY_DRAWN.key === yearSummaryKey()) return;
    YEAR_SUMMARY_DRAWN = Object.assign({}, YEAR_SUMMARY_DRAWN, { key: null });
    yearSummaryReadSoon(true);
}

// ---------------------------------------------------------------- the workbook
//
// The same reading, as the accountant's file: «סיכום» first - the frame and the figures - then
// the months, the men, the sites, and «עובדי יוסף גבס» last, on its own. Numbers are numbers,
// money in the workbook's own money format (v202, js/ui/reports.js); a figure the screen says
// «—» for is «—» here too.

// The sheets, as rows and the cells of each that are money. Plain data, for the file, for its
// CSV fallback and for the suite.
function yearSummarySheets(facts) {
    const T = YEAR_SUMMARY_TEXT;
    const M = MONTH_SUMMARY_TEXT;
    const R = MONTH_SUMMARY_REUSED;
    const Y = YEAR_SUMMARY_REUSED;
    const known = value => (value === null || value === undefined ? '—' : value);
    const sheets = [];

    // «סיכום»: the frame, when it was made, the figures, the sentences, and the list apart.
    {
        const rows = [];
        const money = new Set();
        const add = row => { rows.push(row); return rows.length - 1; };
        add([T.title(facts.year)]);
        yearSummaryFrameLines(facts).forEach(text => add([text]));
        add([`${SUMMARY_TEXT.made}: ${formatFullDate(parseLocalDate(todayStr()))}`]);
        add([]);
        yearSummaryTiles(facts).forEach(tile => {
            const at = add([tile.label, known(tile.value)]);
            if (tile.money && typeof tile.value === 'number') money.add(`${at}:1`);
        });
        yearSummaryNotes(facts).forEach(note => add([note.text]));
        const apart = yearSummaryApart(facts);
        if (apart) {
            add([]);
            add([apart.label, apart.value]);
            add([apart.note]);
        }
        sheets.push({ key: 'summary', name: SUMMARY_SHEET, rows,
            look: { money: (r, c) => money.has(`${r}:${c}`), cap: 40 }, table: false });
    }

    // «חודשים»: January first, as the rows on the screen.
    {
        const rows = [[T.monthColumn, yearSummaryOwnLabel(facts), M.men, R.gross, T.handedOver]];
        yearSummaryMonthRows(facts).forEach(row => {
            rows.push(row.empty ? [row.name, '—', '—', '—', '—']
                : [row.name, row.own, row.men, known(row.gross), row.advances]);
        });
        sheets.push({ key: 'months', name: T.monthsSheet, rows, table: true,
            look: { money: (r, c) => r > 0 && (c === 3 || c === 4), filterTo: rows.length - 1 } });
    }

    // «עובדים»: every man in the roster's order; a man switched off says so beside his name.
    {
        const rows = [[Y.worker, R.attendance, Y.payUnits, R.doubles, R.extraHours, R.gross, T.handedOver]];
        facts.men.forEach(man => {
            rows.push([man.active ? man.name : `${man.name} · ${Y.inactive}`, man.attendanceDays, man.payUnits,
                man.doubleDays, man.extraHours, known(man.gross), man.handedOver]);
        });
        sheets.push({ key: 'workers', name: T.menSheet, rows, table: true,
            look: { money: (r, c) => r > 0 && (c === 5 || c === 6), filterTo: rows.length - 1 } });
    }

    // «אתרים»: the billing count per site, his men's share and Rima's where Rima has a count,
    // and the months it was billed in.
    {
        const withRima = facts.line.rima !== null;
        const head = [SUMMARY_TEXT.site, R.siteDaysTotal].concat(withRima ? [NO_RIMA_TITLE, RIMA_TITLE] : [], [T.monthsSheet]);
        const rows = [head];
        facts.sites.forEach(site => {
            rows.push([site.name, site.billed].concat(withRima ? [site.own, site.rima] : [], [yearSummarySpan(site)]));
        });
        const last = rows.length - 1;
        if (withRima) { rows.push([]); rows.push([M.rimaNote]); }
        sheets.push({ key: 'sites', name: T.sitesSheet, rows, table: true, look: { filterTo: last } });
    }

    // «עובדי יוסף גבס», LAST and on its own (v183): in no figure of any other sheet.
    if (facts.yosef.length > 0) {
        const rows = [[SUMMARY_TEXT.site, YOSEF_GEVES_TITLE]];
        facts.yosef.forEach(place => rows.push([place.name, place.total]));
        const last = rows.length - 1;
        rows.push([YOSEF_GEVES_TOTAL, facts.line.yosef ? facts.line.yosef.total : 0]);
        rows.push([]);
        rows.push([YOSEF_GEVES_NOTE]);
        sheets.push({ key: 'yosef-geves', name: YOSEF_GEVES_SHEET, rows, table: true, look: { filterTo: last } });
    }
    return sheets;
}

// The workbook, sheet by sheet. `xlsx` is the library. With `plain` every sheet is written as
// its rows and nothing else - what a fault in the look falls back to (v202's rule: the look
// never costs the file).
function yearSummaryWorkbook(xlsx, sheets, plain) {
    const wb = xlsx.utils.book_new();
    // The direction, said once for every sheet - see exportReports.
    wb.Workbook = { Views: [{ RTL: true }] };
    const titles = [];
    sheets.forEach(sheet => {
        const ws = xlsx.utils.aoa_to_sheet(sheet.rows);
        if (!plain) {
            dressSheet(ws, sheet.rows, sheet.look);
            if (sheet.table) titles.push(sheet.name);
        }
        xlsx.utils.book_append_sheet(wb, ws, sheet.name);
    });
    if (!plain && titles.length > 0) {
        wb.Workbook.Names = titles.map(name => ({
            Name: '_xlnm.Print_Titles', Sheet: wb.SheetNames.indexOf(name), Ref: `'${name}'!$1:$1`
        }));
    }
    return wb;
}

// The file's name: Latin from its first letter to its extension, so a list that runs right to
// left never reorders it (exportReports says why).
function yearSummaryFileName(year) {
    return `farkad-year_${year}.xlsx`;
}

// Back on the export when a dialog asked over this one has shut (js/ui/ask.js hands the focus
// to nobody, and this one is still open).
function yearSummaryFocusExport() {
    const node = typeof document !== 'undefined' ? document.getElementById('yearSummaryExport') : null;
    if (node && yearSummaryIsOpen() && node.focus) node.focus({ preventScroll: true });
}

async function yearSummaryExport() {
    if (!yearSummaryIsOpen()) return;
    const year = YEAR_SUMMARY_YEAR;
    const facts = yearSummaryFactsNow(year).facts;
    if (!facts || facts.empty) return;
    const Y = YEAR_SUMMARY_REUSED;
    const sheets = yearSummarySheets(facts);
    const name = yearSummaryFileName(year);

    await loadXlsx();

    // THE LIBRARY IS IN THE SHELL, so reaching here means this phone's build is incomplete -
    // exportReports' own case and its own sentence. The same rows leave as CSV files, one per
    // sheet, and what is said afterwards is what the browser took.
    if (typeof XLSX === 'undefined') {
        const handed = [];
        const refused = [];
        sheets.forEach(sheet => {
            const file = `farkad-year-${sheet.key}_${year}.csv`;
            (downloadCsv(sheet.rows, file) ? handed : refused).push(file);
        });
        const list = names => names.map(file => '\u2066' + file + '\u2069').join(', ');
        if (refused.length > 0) {
            Promise.resolve(askTell({
                title: Y.refusedTitle,
                message: Y.refused + list(refused) + '. '
                    + (handed.length > 0 ? Y.refusedTook + list(handed) + '. ' : '')
                    + Y.refusedRecord + Y.refusedAgain + Y.refusedWhere + '.'
            })).then(yearSummaryFocusExport);
            return;
        }
        Promise.resolve(askTell(Y.csv + Y.csvEnd)).then(yearSummaryFocusExport);
        return;
    }

    try {
        let wb;
        try {
            wb = yearSummaryWorkbook(XLSX, sheets, false);
        } catch (lookError) {
            console.error('Year workbook look failed; writing it plain:', lookError);
            wb = yearSummaryWorkbook(XLSX, sheets, true);
        }
        XLSX.writeFile(wb, name);
        // HANDED TO THE BROWSER, never «נשמר»: the app cannot see the Files app (exportReports).
        if (typeof askChoice !== 'function') return;
        Promise.resolve(askChoice({
            title: Y.handedTitle,
            message: '\u2066' + name + '\u2069' + Y.handed + Y.files + Y.direction + Y.directionEnd,
            choices: [EXPORT_CHOICE_DONE, EXPORT_CHOICE_AGAIN]
        })).then(answer => {
            if (answer === EXPORT_CHOICE_AGAIN) yearSummaryExport();
            else yearSummaryFocusExport();
        });
    } catch (error) {
        console.error('Year export failed:', error);
        Promise.resolve(askTell({
            title: Y.failedTitle,
            message: Y.failed + '\u2066' + String((error && error.message) || error).slice(0, 160) + '\u2069'
        })).then(yearSummaryFocusExport);
    }
}
