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
// named in the sheet's own sentence - on the screen and in the file - and where such a man WAS
// priced in some month one sentence says why the year is smaller than its months. That is
// decided from the unpriced lists and never by adding the months' «נצבר» up: no shekel is added
// here, so no rounding of the agora can say it.
//
// A REDRAW NEVER READS. render() asks this file after every commit and every snapshot adopted
// from another phone, and the year costs about six of the month summary's readings: a record
// that moved under the open year has its figures MARKED at once as being read again - dimmed,
// busy, the export shut and «מחשב את השנה…» in the frame's own line under the thumb - so none of
// them stands as current, and they stay where they are, so the reader is not thrown to the top
// and can go on reading what was there; the year is read ONCE, after the draws have stopped for
// a moment - each draw starts the wait again - and drawn where he is (renderYearSummaryIfOpen).
// Before fix round 1 the figures were taken off: one snapshot from the foreman's phone emptied
// the dialog to a screen's height, which put the reader back at its top for a second and a half.
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
    // The frame, always first - on the screen and on the workbook's first sheet. A pay period
    // is «תקופת החשבון» on the reports' chip and in every sheet of the app, so it is «תקופת
    // חשבון» here too (fix round 1: «תקופת תשלום» was a term no other screen uses).
    worked: 'נצבר לפי הרישום: כל יום עבודה בשנה, לפי השכר שנרשם ליום הזה. זה לא מה ששולם בפועל.',
    split: 'תקופת חשבון שעוברת את 1 בינואר מתחלקת כאן לפי הימים: כל יום נספר בשנה שבה עבדו בו.',
    inProgress: 'השנה עוד לא נגמרה. המספרים הם של מה שנרשם עד עכשיו.',
    figures: 'השנה במספרים',
    // The year's «מקדמות»: what was HANDED OVER in it - never a deduction.
    handedOver: 'מקדמות שניתנו',
    // Beside a man's «מקדמות שניתנו», the part of it a «תיקון-היפוך» of the advance itself took
    // back - an advance typed as 1,500 for 150 and corrected by «תיקון טעות» - so the two can be
    // read together; never subtracted here (advanceReversalsFor, 'given': the model's own sum).
    handedOverReversed: 'מתוכן בוטלו בתיקון-היפוך',
    // Said only where a man the year leaves out of «נצבר» (one worked day with no daily rate) was
    // priced, and worked, in some month - decided from the unpriced lists, never from a sum - and
    // only under a «נצבר» that is a number. «אפילו יום עבודה אחד בלי» and not «אין לו ... אפילו
    // ביום אחד», which reads as a man who never had a rate (fix round 1).
    notSummed: 'עובד שיש לו אפילו יום עבודה אחד בלי שכר יומי לא נכלל בנצבר של כל השנה, ולכן הנצבר של השנה קטן מחיבור החודשים.',
    months: 'חודש אחר חודש',
    monthsHint: 'לחיצה על חודש פותחת את סיכום החודש.',
    // His own men's worker-site days where the figure stands alone - a month's row and the
    // «חודשים» column - in a year Rima has a count in: «בלי עובדי רימא» alone says without
    // whom, and not of what.
    ownDays: 'ימי עובד־אתר בלי עובדי רימא',
    men: 'העובדים בשנה',
    sites: 'האתרים בשנה',
    // The months a site was worked in: «מרץ», or «ינואר–נובמבר».
    span: (first, last) => (first === last ? first : `${first}–${last}`),
    export: '📊 יצוא השנה',
    // From the press until the file is handed over: the first export of a session waits for the
    // library, and a button that looked untouched was pressed twice and handed over two files.
    exporting: 'מכין את הקובץ…',
    // The workbook's sheets after «סיכום», and the head of the months' first column.
    monthsSheet: 'חודשים',
    menSheet: 'עובדים',
    sitesSheet: 'אתרים',
    monthColumn: 'חודש',
    // The head of the «עובדים» column that says who is switched off - so the name cell is the
    // name and nothing else, as in the reports' file, and a lookup by name finds him.
    stateColumn: 'מצב'
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
    active: 'פעיל',                                   // js/ui/roster.js, the crew row's switch
    // A month's row that is not over: the first words of what «סיכום חודש» says on it.
    monthInProgress: 'החודש עוד לא נגמר.',            // js/ui/monthsummary.js, MONTH_SUMMARY_TEXT.inProgress
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
// What is on the screen now: { year, key, empty } of the reading drawn, or null while it reads -
// or while what is drawn is a reading of a record that has moved since, marked as such.
let YEAR_SUMMARY_DRAWN = null;
// Which reading is wanted. A reading that was asked for and then overtaken - an arrow pressed
// again, the dialog shut - finds a newer turn and draws nothing.
let YEAR_SUMMARY_TURN = 0;
// How long the draws must have stopped before a record that moved under the open year is read
// again: «תזכורת לסגירת חשבונות»'s own rule (closeReminderAfterRender, js/ui/closereminder.js).
// Each draw starts the wait again, so three commits in a row cost ONE reading, after the last.
const YEAR_SUMMARY_QUIET_MS = 1500;
let YEAR_SUMMARY_WAIT = null;
// Where the reader is to be put once the year is drawn - the scroll and the month's row he
// left from - when «סיכום חודש»'s door brings him back to the year he left by a month's row.
// Memory only.
let YEAR_SUMMARY_PLACE = null;
// Where he was when a month's row took him out of the year, kept until the month's door brings
// him back to that same year (or the year is shut by its own way). Memory only.
let YEAR_SUMMARY_BACK = null;
// True from a press of «יצוא השנה» until the file is handed over: a second press meanwhile is
// nothing (the first export of a session waits for the library, and nothing on the glass said so).
let YEAR_SUMMARY_EXPORTING = false;

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
    const yearRows = payrollRows();
    // «מקדמות שניתנו» is what was RECORDED as handed over (advancesTotal under moneyOf). Where the
    // record may be read the new way - the very rule that shows «תיקון-היפוך» on the line - each
    // man also carries what a תיקון-היפוך of an advance itself took back in the year: the model's
    // own sum by the kind of the entry it corrects (advanceReversalsFor, 'given'). Said beside it,
    // never taken off it here.
    const reversals = line.reversed !== null && typeof advanceReversalsFor === 'function';
    const men = yearRows.map(row => {
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
            handedOver: -money.netted || 0,
            handedOverReversed: reversals
                ? advanceReversalsFor(schedule, row.workerId, range.from, range.to, 'given') : null
        };
    });

    // WHETHER THE MONTHS SAY MORE THAN THE YEAR, decided without adding a shekel: a man the year
    // cannot price who, in some month, worked and WAS priced - so that month's «נצבר» has him and
    // the year's has not. Each month's own rows, the sheet's (the one reading has already worked
    // out each month's sheet); no month's «נצבר» is read here, so no rounding can raise it.
    const unpricedIds = new Set(yearRows.filter(row => row.amount === null).map(row => String(row.workerId)));
    let notSummed = false;
    for (let month = 1; month <= 12 && unpricedIds.size > 0 && !notSummed; month += 1) {
        const span = monthSummaryRange(yearSummaryMonthKey(year, month));
        REPORT_RANGE.from = span.from;
        REPORT_RANGE.to = span.to;
        notSummed = payrollRows().some(row => unpricedIds.has(String(row.workerId))
            && row.attendanceDays > 0 && row.amount !== null);
    }

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

    const today = todayStr();
    return {
        year,
        range,
        // A year with records that has not ended - the one today is in, and one after it, which
        // «סיכום חודש»'s arrows reach (tomorrow's seder on 31 December is 1 January's record).
        // On its last day it reads whole, as December does on its own last day.
        inProgress: !line.empty && today < range.to,
        empty: line.empty,
        line,
        months,
        men,
        sites,
        yosef,
        // The men the year cannot price, as the sheet names them (the year line's own list).
        unpriced: line.unpriced.slice(),
        notSummed
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

// THE MONEY FIRST, then the counts. The year exists for its «נצבר» - the frame's first sentence
// is what that word means here - so it leads, with what was handed over beside it, each the
// width of the dialog and larger (`lead`); the sentences that belong to «נצבר» come straight
// after them, then the days. «עובדי יוסף גבס» is not among them at all: its count is its own
// table at the end and its own last sheet, in no other list (v183) - it was said twice, as a
// tile with its note here and again as that table (fix round 1).
function yearSummaryTiles(facts) {
    const line = facts.line;
    const M = MONTH_SUMMARY_TEXT;
    const R = MONTH_SUMMARY_REUSED;
    const count = (id, label, value) => ({ id, label, value, text: String(value), money: false, lead: false });
    const money = (id, label, value) => ({ id, label, value, text: monthSummaryMoney(value), money: true, lead: true });
    const tiles = [
        money('gross', R.gross, line.gross),
        money('advances', YEAR_SUMMARY_TEXT.handedOver, line.advances)
    ];
    // With the gate shut or the migration unapproved these two are null, and not shown
    // (tests/approval.test.mjs is the rule); open, only where there is one.
    if (line.repaid !== null && line.repaid !== 0) tiles.push(money('repaid', LEDGER_KIND_LABELS.repaid, line.repaid));
    if (line.reversed !== null && line.reversed !== 0) tiles.push(money('reversed', LEDGER_KIND_LABELS.reversed, line.reversed));
    tiles.push(
        count('workingDays', M.workingDays, line.workingDays),
        count('attendance', R.attendance, line.attendance),
        count('men', M.men, line.men),
        count('siteDays', R.siteDaysTotal, line.siteDays));
    // His own men's share of the billing count, said only when Rima has one - the month's rule.
    if (line.ownSiteDays !== null) tiles.push(count('ownSiteDays', NO_RIMA_TITLE, line.ownSiteDays));
    tiles.push(count('rima', RIMA_TOTAL, line.rima ? line.rima.total : 0));
    return tiles;
}

// The sentences that belong to «נצבר»: the men without a rate (the sheet's own), why the year is
// smaller than its months (this file's, only where it is), and the hours with no hourly rate
// (the sheet's own). The second only under a «נצבר» that is a number: when every man who worked
// has a day with no rate the year shows «—», and «smaller than its months» would be said of
// nothing - the first sentence is the reason for that «—» (fix round 1).
function yearSummaryNotes(facts) {
    const notes = [];
    if (facts.unpriced.length > 0) {
        notes.push({ id: 'unpriced', warn: true, text: MONTH_SUMMARY_TEXT.unpriced(facts.unpriced.length,
            facts.unpriced.map(name => isolate(name)).join(', ')) });
    }
    if (facts.notSummed && facts.line.gross !== null) {
        notes.push({ id: 'notSummed', warn: false, text: YEAR_SUMMARY_TEXT.notSummed });
    }
    if (facts.line.hoursUnpriced) notes.push({ id: 'hoursUnpriced', warn: true, text: MONTH_SUMMARY_REUSED.hoursUnpriced });
    return notes;
}

// What the months' bar counts, named where it stands alone (a month's row, the «חודשים» column):
// his own men's worker-site days - «ימי עובד־אתר בלי עובדי רימא» in a year Rima has a count in,
// and the billing count itself, «ימי עובד־אתר», in one that has none.
function yearSummaryOwnLabel(facts) {
    return facts.line.rima !== null ? YEAR_SUMMARY_TEXT.ownDays : SUMMARY_TEXT.siteDays;
}

function yearSummaryMonthName(key) {
    return MONTH_SUMMARY_TEXT.months[Number(String(key).slice(5, 7)) - 1] || '';
}

// The twelve rows, each as «סיכום חודש» has its month - and with what that month says beside its
// figures: that it is not over yet (its own rule, today inside it), the men its «נצבר» leaves
// out (its own sentence), and the corrections dated in it («תיקון-היפוך», its own line, where
// the record may be read that way and there is one).
function yearSummaryMonthRows(facts) {
    const today = todayStr();
    return facts.months.map(month => ({
        key: month.key,
        name: yearSummaryMonthName(month.key),
        empty: month.empty,
        own: month.ownSiteDays !== null ? month.ownSiteDays : month.siteDays,
        men: month.men,
        gross: month.gross,
        advances: month.advances,
        reversed: month.reversed !== null && month.reversed !== 0 ? month.reversed : null,
        inProgress: !month.empty && today >= month.range.from && today < month.range.to,
        unpriced: month.empty || month.unpriced.length === 0 ? null
            : MONTH_SUMMARY_TEXT.unpriced(month.unpriced.length, month.unpriced.map(name => isolate(name)).join(', '))
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
// the year today is in (nothing after it is recorded yet).
function yearSummaryFrame() {
    const year = YEAR_SUMMARY_YEAR;
    const say = (id, text) => { const node = document.getElementById(id); if (node && node.textContent !== text) node.textContent = text; };
    say('yearSummaryTitle', YEAR_SUMMARY_TEXT.title(year));
    say('yearSummaryYear', String(year));
    const next = document.getElementById('yearSummaryNext');
    if (next) next.hidden = year >= yearSummaryThisYear();
}

// The frame's one line of its own, in the foot that stays under the thumb (#yearSummaryStatus):
// «מחשב את השנה…» while a moved record is read again, «מכין את הקובץ…» while the file is made.
function yearSummarySay(text) {
    const node = typeof document !== 'undefined' ? document.getElementById('yearSummaryStatus') : null;
    if (node && node.textContent !== text) node.textContent = text;
}

// The line goes once what it said is over - and only that line, so the end of one never takes
// down the other's.
function yearSummaryUnsay(text) {
    const node = typeof document !== 'undefined' ? document.getElementById('yearSummaryStatus') : null;
    if (node && node.textContent === text) node.textContent = '';
}

// «יצוא השנה» can be pressed over a year that is read, holds something, is not being read again
// and is not already being made into a file - and over nothing else.
function yearSummaryExportState() {
    const node = typeof document !== 'undefined' ? document.getElementById('yearSummaryExport') : null;
    if (!node) return;
    node.disabled = YEAR_SUMMARY_EXPORTING || !YEAR_SUMMARY_DRAWN || YEAR_SUMMARY_DRAWN.empty === true;
}

// The range and one line: what is on the screen from the press until the figures are read - on
// opening, and on an arrow to another year. Nothing of another year, or of no year, to keep.
function yearSummaryPaintReading() {
    const body = yearSummaryBody();
    if (!body) return;
    const range = yearSummaryRange(YEAR_SUMMARY_YEAR);
    clear(body);
    body.classList.remove('ysum-stale');
    body.setAttribute('aria-busy', 'true');
    body.appendChild(el('p', 'msum-range', dateRange(formatFullDate(parseLocalDate(range.from)),
        formatFullDate(parseLocalDate(range.to)))));
    body.appendChild(el('p', 'ysum-reading', YEAR_SUMMARY_TEXT.reading));
}

// A RECORD THAT MOVED UNDER THE YEAR ON SCREEN: what is drawn stays drawn, exactly where it is -
// the reader keeps his place and his row, and the page does not shrink under him - and is marked
// at once as a reading being redone: dimmed (css/design.css), busy for a screen reader, the export
// shut, and «מחשב את השנה…» in the frame's own line, which stays under the thumb wherever he is
// in the year. None of it is shown as current; nothing of it is taken away.
function yearSummaryMarkStale() {
    const body = yearSummaryBody();
    if (!body) return;
    body.classList.add('ysum-stale');
    body.setAttribute('aria-busy', 'true');
    yearSummaryExportState();
    yearSummarySay(YEAR_SUMMARY_TEXT.reading);
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

function yearSummaryTileGrid(tiles, className) {
    const grid = el('div', className);
    tiles.forEach(item => {
        const tile = monthSummaryPair(item.label, item.text, 'msum-pair msum-tile');
        tile.setAttribute('data-figure', item.id);
        grid.appendChild(tile);
    });
    return grid;
}

function drawYearSummary(facts) {
    const body = yearSummaryBody();
    if (!body || YEAR_SUMMARY_YEAR === null) return;
    const T = YEAR_SUMMARY_TEXT;
    const M = MONTH_SUMMARY_TEXT;
    const R = MONTH_SUMMARY_REUSED;
    const Y = YEAR_SUMMARY_REUSED;
    // A month's row that had the focus has it again after a redraw. And when «סיכום חודש»'s door
    // brought him back to the year he left by a month's row (YEAR_SUMMARY_PLACE), that row takes
    // the focus from the heading it was given on the way in - unless he has put it somewhere else
    // since.
    const active = typeof document !== 'undefined' ? document.activeElement : null;
    const inBody = Boolean(active && body.contains && body.contains(active));
    const heading = typeof document !== 'undefined' ? document.getElementById('yearSummaryTitle') : null;
    const free = !active || active === document.body || (heading && active === heading);
    const focused = inBody && active.getAttribute ? active.getAttribute('data-ysum-month')
        : (free && YEAR_SUMMARY_PLACE ? YEAR_SUMMARY_PLACE.month : null);

    yearSummaryFrame();
    clear(body);
    body.classList.remove('ysum-stale');
    body.setAttribute('aria-busy', 'false');
    yearSummaryUnsay(T.reading);
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

    // 2. The year in figures: the money first and larger, «נצבר»'s own sentences straight under
    // it, then the days.
    const figures = monthSummaryBlock(T.figures);
    figures.classList.add('ysum-figures');
    const tiles = yearSummaryTiles(facts);
    figures.appendChild(yearSummaryTileGrid(tiles.filter(item => item.lead), 'msum-tiles ysum-lead'));
    yearSummaryNotes(facts).forEach(note => {
        figures.appendChild(el('p', note.warn ? 'hint hint-warn msum-warn' : 'msum-note ysum-notsummed', note.text));
    });
    figures.appendChild(yearSummaryTileGrid(tiles.filter(item => !item.lead), 'msum-tiles ysum-counts'));
    body.appendChild(figures);

    // 3. Month by month: each row one button into «סיכום חודש» on that month - and what a row
    // does said BEFORE the first of them, not after the twelfth.
    const months = monthSummaryBlock(T.months);
    months.classList.add('ysum-months');
    months.appendChild(el('p', 'msum-note ysum-months-hint', T.monthsHint));
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
            const pairs = [
                [M.men, String(row.men)],
                [R.gross, monthSummaryMoney(row.gross)],
                [T.handedOver, monthSummaryMoney(row.advances)]
            ];
            if (row.reversed !== null) pairs.push([LEDGER_KIND_LABELS.reversed, monthSummaryMoney(row.reversed)]);
            go.appendChild(yearSummaryPairs(pairs));
            // What «סיכום חודש» says beside the same figures, in its own words: a month not over
            // yet, and the men its «נצבר» leaves out.
            if (row.inProgress) go.appendChild(el('span', 'ysum-month-tag', Y.monthInProgress));
            if (row.unpriced) go.appendChild(el('span', 'ysum-month-tag ysum-month-warn', row.unpriced));
        }
        months.appendChild(go);
    });
    body.appendChild(months);

    // 4. Every man's year, label over value - never a wide table. A double day and an extra hour
    // are said where he has one, as «סיכום חודש» says them; a «—» is never left without its
    // reason, which follows the last man (the «עובדים» sheet's own note row, on the glass).
    if (facts.men.length > 0) {
        const men = monthSummaryBlock(T.men);
        men.classList.add('ysum-men');
        facts.men.forEach(man => {
            const row = el('div', 'ysum-man');
            const head = el('div', 'ysum-man-head');
            head.appendChild(el('span', 'ysum-man-name', man.name));
            if (!man.active) head.appendChild(el('span', 'ysum-inactive', Y.inactive));
            row.appendChild(head);
            const pairs = [[R.attendance, String(man.attendanceDays)], [Y.payUnits, String(man.payUnits)]];
            if (man.doubleDays > 0) pairs.push([R.doubles, String(man.doubleDays)]);
            if (man.extraHours > 0) pairs.push([R.extraHours, String(man.extraHours)]);
            pairs.push([R.gross, monthSummaryMoney(man.gross)], [T.handedOver, monthSummaryMoney(man.handedOver)]);
            if (man.handedOverReversed) pairs.push([T.handedOverReversed, monthSummaryMoney(man.handedOverReversed)]);
            row.appendChild(yearSummaryPairs(pairs));
            men.appendChild(row);
        });
        const unknown = facts.men.filter(man => man.gross === null).map(man => man.name);
        if (unknown.length > 0) {
            men.appendChild(el('p', 'hint hint-warn msum-warn ysum-men-warn',
                M.unpriced(unknown.length, unknown.map(name => isolate(name)).join(', '))));
        }
        body.appendChild(men);
    }

    // 5. Every site's year, then «עובדי יוסף גבס» in its own table, last. His own men's share and
    // Rima's are said on a site Rima has a count on - on any other they are its total and a 0.
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
            if (withRima && site.rima > 0) pairs.push([NO_RIMA_TITLE, String(site.own)], [SUMMARY_TEXT.rimaCount, String(site.rima)]);
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
// this is still the reading wanted. The reader stays where he is across the redraw: the body is
// emptied and filled again in one step, and that must not leave him at its top. One whom
// «סיכום חודש»'s door brought back is put where he left the year (YEAR_SUMMARY_PLACE).
function yearSummaryLoad(turn) {
    if (!yearSummaryIsOpen() || turn !== YEAR_SUMMARY_TURN) return;
    const year = YEAR_SUMMARY_YEAR;
    const modal = document.getElementById('yearSummaryModal');
    const content = modal ? modal.querySelector('.modal-content') : null;
    const top = content ? content.scrollTop : 0;
    const now = yearSummaryFactsNow(year);
    drawYearSummary(now.facts);
    YEAR_SUMMARY_DRAWN = { year, key: now.key, empty: now.facts.empty === true };
    yearSummaryExportState();
    if (content) content.scrollTop = YEAR_SUMMARY_PLACE ? YEAR_SUMMARY_PLACE.top : top;
    YEAR_SUMMARY_PLACE = null;
}

function yearSummaryReadSoon() {
    YEAR_SUMMARY_TURN += 1;
    const turn = YEAR_SUMMARY_TURN;
    yearSummaryLater(() => yearSummaryLoad(turn));
}

// A reading owed to a moved record is not owed any more: another year was asked for, or the
// dialog shut.
function yearSummaryStopWaiting() {
    if (YEAR_SUMMARY_WAIT !== null) clearTimeout(YEAR_SUMMARY_WAIT);
    YEAR_SUMMARY_WAIT = null;
}

// `place`, when given, is where the reader is put once the year is drawn: { top, month } - the
// way back through «סיכום חודש»'s door (openYearSummaryFromMonth). Without it, the top.
function openYearSummary(year, place) {
    const modal = typeof document !== 'undefined' ? document.getElementById('yearSummaryModal') : null;
    if (!modal) return false;
    const asked = Number(year);
    YEAR_SUMMARY_YEAR = Number.isInteger(asked) && asked >= 1000 && asked <= 9999 ? asked : yearSummaryThisYear();
    YEAR_SUMMARY_DRAWN = null;
    yearSummaryStopWaiting();
    YEAR_SUMMARY_PLACE = place && typeof place === 'object'
        ? { top: Number(place.top) || 0, month: place.month ? String(place.month) : null } : null;

    const say = (id, text) => { const node = document.getElementById(id); if (node) node.textContent = text; };
    say('yearSummaryPrev', YEAR_SUMMARY_TEXT.prev);
    say('yearSummaryNext', YEAR_SUMMARY_TEXT.next);
    say('yearSummaryExport', YEAR_SUMMARY_TEXT.export);
    say('yearSummaryClose', MONTH_SUMMARY_REUSED.close);
    say('yearSummaryStatus', '');
    yearSummaryFrame();
    yearSummaryExportState();
    yearSummaryPaintReading();

    modal.style.display = 'flex';
    const content = modal.querySelector('.modal-content');
    if (content) content.scrollTop = 0;
    yearSummaryReadSoon();
    return true;
}

// From «סיכום חודש»: that dialog shuts and this one opens on the year of its month. The dialogs'
// keeper of the focus (js/ui/modal.js) never sees a moment with no dialog open, so the focus it
// kept - what opened the month - is still what closing the year gives back; and because it does
// not see a NEW dialog either, the year's heading is given the focus here, by hand
// (siteCardGoMan's rule, js/ui/sitecard.js). A reader who left this same year by a month's row
// is put back where he was, on that row, once it is drawn - not at the top of twelve months.
function openYearSummaryFromMonth() {
    if (typeof monthSummaryIsOpen !== 'function' || !monthSummaryIsOpen()) return;
    const year = Number(String(MONTH_SUMMARY_KEY).slice(0, 4));
    const back = YEAR_SUMMARY_BACK && YEAR_SUMMARY_BACK.year === year ? YEAR_SUMMARY_BACK : null;
    YEAR_SUMMARY_BACK = null;
    closeMonthSummary();
    if (!openYearSummary(year, back)) return;
    const heading = document.getElementById('yearSummaryTitle');
    if (heading && heading.focus) heading.focus({ preventScroll: true });
}

function closeYearSummary() {
    YEAR_SUMMARY_YEAR = null;
    YEAR_SUMMARY_DRAWN = null;
    YEAR_SUMMARY_BACK = null;
    YEAR_SUMMARY_PLACE = null;
    yearSummaryStopWaiting();
    // Anything still on its way is for a dialog that is not there any more.
    YEAR_SUMMARY_TURN += 1;
    const modal = typeof document !== 'undefined' ? document.getElementById('yearSummaryModal') : null;
    if (modal) modal.style.display = 'none';
    // Its nodes go with it: a shut dialog has nothing on it to be found or read.
    const body = yearSummaryBody();
    if (body) {
        clear(body);
        body.classList.remove('ysum-stale');
        body.setAttribute('aria-busy', 'false');
    }
    yearSummaryUnsay(YEAR_SUMMARY_TEXT.reading);
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
    YEAR_SUMMARY_PLACE = null;
    yearSummaryStopWaiting();
    const next = document.getElementById('yearSummaryNext');
    const hadNext = next && document.activeElement === next;
    yearSummaryFrame();
    yearSummaryExportState();
    yearSummaryPaintReading();
    if (hadNext && next.hidden) {
        const back = document.getElementById('yearSummaryPrev');
        if (back && back.focus) back.focus({ preventScroll: true });
    }
    const modal = document.getElementById('yearSummaryModal');
    const content = modal ? modal.querySelector('.modal-content') : null;
    if (content) content.scrollTop = 0;
    yearSummaryReadSoon();
}

// A month's row: the year shuts and «סיכום חודש» opens on that month - its heading focused by
// hand, for the reason over openYearSummaryFromMonth. Where he was in the year is kept for the
// way back through that dialog's door.
function yearSummaryGoMonth(key) {
    if (!yearSummaryIsOpen() || typeof openMonthSummary !== 'function') return;
    const modal = document.getElementById('yearSummaryModal');
    const content = modal ? modal.querySelector('.modal-content') : null;
    const back = { year: YEAR_SUMMARY_YEAR, top: content ? content.scrollTop : 0, month: String(key) };
    closeYearSummary();
    YEAR_SUMMARY_BACK = back;
    openMonthSummary(key);
    const heading = document.getElementById('monthSummaryTitle');
    if (heading && heading.focus) heading.focus({ preventScroll: true });
}

// render() calls this (js/app.js) after every commit and every snapshot adopted from another
// phone, and it NEVER READS. Shut, it returns here at once. Open on a record that has not moved,
// nothing is drawn anew. Open on a record that moved: what is drawn is marked at once as being
// read again (yearSummaryMarkStale) - none of it stands as current, and none of it is taken off,
// so the reader is where he was - and the year is read again ONCE, when the draws have stopped
// for YEAR_SUMMARY_QUIET_MS (each draw starts the wait again), and drawn where he is.
function renderYearSummaryIfOpen() {
    if (!yearSummaryIsOpen()) return;
    if (YEAR_SUMMARY_WAIT === null) {
        // Nothing drawn yet: the reading on its way reads the record as it is when it runs.
        if (!YEAR_SUMMARY_DRAWN || YEAR_SUMMARY_DRAWN.key === yearSummaryKey()) return;
        YEAR_SUMMARY_DRAWN = null;
        yearSummaryMarkStale();
    } else {
        clearTimeout(YEAR_SUMMARY_WAIT);
    }
    YEAR_SUMMARY_TURN += 1;
    const turn = YEAR_SUMMARY_TURN;
    YEAR_SUMMARY_WAIT = setTimeout(() => {
        YEAR_SUMMARY_WAIT = null;
        yearSummaryLoad(turn);
    }, YEAR_SUMMARY_QUIET_MS);
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
    // A SENTENCE IN A CELL IS SET RIGHT TO LEFT BY ITS OWN MARKS, one U+200F at each end. Excel
    // takes a cell's direction from its first Hebrew letter and shows the marks as nothing; a
    // spreadsheet that lays every cell out left to right - LibreOffice 24.2 does, printed and
    // looked at on this very file - otherwise carries a sentence's closing stop to its right
    // edge, sends «⚠️ 1» from the head of the sentence it opens to its tail, and puts «לא פעיל»
    // before the name it follows. Only the cells that are sentences, or a name set into words,
    // carry them: a name, a number, a heading and a month stand bare, as in the reports' file.
    const said = text => `\u200F${text}\u200F`;
    const sheets = [];

    // «סיכום»: the frame, when it was made, the figures - the money first, as on the screen - and
    // the sentences that belong to «נצבר» right under it. «עובדי יוסף גבס» is not on it: it is the
    // last sheet's, and only its (v183).
    {
        const rows = [];
        const money = new Set();
        const add = row => { rows.push(row); return rows.length - 1; };
        add([T.title(facts.year)]);
        yearSummaryFrameLines(facts).forEach(text => add([said(text)]));
        add([`${SUMMARY_TEXT.made}: ${formatFullDate(parseLocalDate(todayStr()))}`]);
        add([]);
        // «נצבר»'s sentences in the rows right under it: the accountant reads this file without the
        // screen, and a wage the year cannot price does not stand without its reason.
        yearSummaryTiles(facts).forEach(tile => {
            const at = add([tile.label, known(tile.value)]);
            if (tile.money && typeof tile.value === 'number') money.add(`${at}:1`);
            if (tile.id === 'gross') yearSummaryNotes(facts).forEach(note => add([said(note.text)]));
        });
        sheets.push({ key: 'summary', name: SUMMARY_SHEET, rows,
            look: { money: (r, c) => money.has(`${r}:${c}`), cap: 40 }, table: false });
    }

    // «חודשים»: January first, as the rows on the screen. Where the record may be read the new
    // way and a correction is dated in the year, each month's «תיקון-היפוך» beside its «מקדמות
    // שניתנו», as «סיכום חודש» has it; and under the table, a month whose «נצבר» leaves a man out
    // says so in «סיכום חודש»'s own sentence - the file is read without the screen.
    {
        const reversals = facts.line.reversed !== null && facts.line.reversed !== 0;
        const head = [T.monthColumn, yearSummaryOwnLabel(facts), M.men, R.gross, T.handedOver]
            .concat(reversals ? [LEDGER_KIND_LABELS.reversed] : []);
        const rows = [head];
        const months = yearSummaryMonthRows(facts);
        months.forEach(row => {
            if (row.empty) { rows.push(head.map((cell, c) => (c === 0 ? row.name : '—'))); return; }
            rows.push([row.name, row.own, row.men, known(row.gross), row.advances]
                .concat(reversals ? [row.reversed !== null ? row.reversed : 0] : []));
        });
        const last = rows.length - 1;
        const marked = months.filter(row => row.unpriced);
        if (marked.length > 0) {
            rows.push([]);
            marked.forEach(row => rows.push([row.name, said(row.unpriced)]));
        }
        sheets.push({ key: 'months', name: T.monthsSheet, rows, table: true,
            look: { money: (r, c) => r > 0 && r <= last && (c === 3 || c === 4 || c === 5), filterTo: last } });
    }

    // «עובדים»: every man in the roster's order, the name cell his name and nothing else - as in
    // the reports' file, so a filter, a sort or a lookup by name finds him - and, where somebody
    // is switched off, a column of its own that says who («פעיל» / «לא פעיל», the crew row's own
    // words). Beside «מקדמות שניתנו», where any man has one, what a תיקון-היפוך of an advance took
    // back - the screen's own pair.
    {
        const reversals = facts.men.some(man => Boolean(man.handedOverReversed));
        const switchedOff = facts.men.some(man => !man.active);
        const rows = [[Y.worker, R.attendance, Y.payUnits, R.doubles, R.extraHours, R.gross, T.handedOver]
            .concat(reversals ? [T.handedOverReversed] : [], switchedOff ? [T.stateColumn] : [])];
        facts.men.forEach(man => {
            rows.push([man.name, man.attendanceDays, man.payUnits, man.doubleDays, man.extraHours, known(man.gross), man.handedOver]
                .concat(reversals ? [man.handedOverReversed || 0] : [], switchedOff ? [man.active ? Y.active : Y.inactive] : []));
        });
        const last = rows.length - 1;
        // No «—» stands without its reason: one row after the last man names every man whose wage
        // the year cannot price, in the sheet's own sentence.
        const unknown = facts.men.filter(man => man.gross === null).map(man => man.name);
        if (unknown.length > 0) {
            rows.push([said(MONTH_SUMMARY_TEXT.unpriced(unknown.length, unknown.map(name => isolate(name)).join(', ')))]);
        }
        sheets.push({ key: 'workers', name: T.menSheet, rows, table: true,
            look: { money: (r, c) => r > 0 && r <= last && (c === 5 || c === 6 || (reversals && c === 7)), filterTo: last } });
    }

    // «אתרים»: the billing count per site, his men's share and Rima's where Rima has a count -
    // Rima's under the overview's own word for it, «עובדי רימא» (SUMMARY_TEXT.rimaCount), and not
    // under the title of the Rima table - and the months it was billed in.
    {
        const withRima = facts.line.rima !== null;
        const head = [SUMMARY_TEXT.site, R.siteDaysTotal].concat(withRima ? [NO_RIMA_TITLE, SUMMARY_TEXT.rimaCount] : [], [T.monthsSheet]);
        const rows = [head];
        facts.sites.forEach(site => {
            rows.push([site.name, site.billed].concat(withRima ? [site.own, site.rima] : [], [yearSummarySpan(site)]));
        });
        const last = rows.length - 1;
        if (withRima) { rows.push([]); rows.push([said(M.rimaNote)]); }
        sheets.push({ key: 'sites', name: T.sitesSheet, rows, table: true, look: { filterTo: last } });
    }

    // «עובדי יוסף גבס», LAST and on its own (v183): in no figure of any other sheet.
    if (facts.yosef.length > 0) {
        const rows = [[SUMMARY_TEXT.site, YOSEF_GEVES_TITLE]];
        facts.yosef.forEach(place => rows.push([place.name, place.total]));
        const last = rows.length - 1;
        rows.push([YOSEF_GEVES_TOTAL, facts.line.yosef ? facts.line.yosef.total : 0]);
        rows.push([]);
        rows.push([said(YOSEF_GEVES_NOTE)]);
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
    if (!yearSummaryIsOpen() || YEAR_SUMMARY_EXPORTING) return;
    const year = YEAR_SUMMARY_YEAR;
    const facts = yearSummaryFactsNow(year).facts;
    if (!facts || facts.empty) return;
    const Y = YEAR_SUMMARY_REUSED;
    const sheets = yearSummarySheets(facts);
    const name = yearSummaryFileName(year);

    // FROM THE PRESS UNTIL THE FILE IS HANDED OVER the button is shut and the frame's line says the
    // file is being made: the first export of a session waits for the library, and a button that
    // looked untouched was pressed again and handed the browser a second file.
    YEAR_SUMMARY_EXPORTING = true;
    yearSummaryExportState();
    yearSummarySay(YEAR_SUMMARY_TEXT.exporting);
    let after = null;
    try {
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
            after = refused.length > 0
                ? () => Promise.resolve(askTell({
                    title: Y.refusedTitle,
                    message: Y.refused + list(refused) + '. '
                        + (handed.length > 0 ? Y.refusedTook + list(handed) + '. ' : '')
                        + Y.refusedRecord + Y.refusedAgain + Y.refusedWhere + '.'
                })).then(yearSummaryFocusExport)
                : () => Promise.resolve(askTell(Y.csv + Y.csvEnd)).then(yearSummaryFocusExport);
        } else {
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
                if (typeof askChoice === 'function') {
                    after = () => Promise.resolve(askChoice({
                        title: Y.handedTitle,
                        message: '\u2066' + name + '\u2069' + Y.handed + Y.files + Y.direction + Y.directionEnd,
                        choices: [EXPORT_CHOICE_DONE, EXPORT_CHOICE_AGAIN]
                    })).then(answer => {
                        if (answer === EXPORT_CHOICE_AGAIN) yearSummaryExport();
                        else yearSummaryFocusExport();
                    });
                }
            } catch (error) {
                console.error('Year export failed:', error);
                after = () => Promise.resolve(askTell({
                    title: Y.failedTitle,
                    message: Y.failed + '\u2066' + String((error && error.message) || error).slice(0, 160) + '\u2069'
                })).then(yearSummaryFocusExport);
            }
        }
    } finally {
        // Handed over (or refused, or failed): the button is the year's again, and the question
        // that follows asks over a dialog whose export can be pressed - «שמירה חוזרת» presses it.
        YEAR_SUMMARY_EXPORTING = false;
        yearSummaryExportState();
        yearSummaryUnsay(YEAR_SUMMARY_TEXT.exporting);
    }
    if (after) after();
}
