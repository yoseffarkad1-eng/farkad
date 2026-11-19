// «יום תשלום» - the payday desk: the moment before he pays, on one screen.
//
// The owner, 2026-11-19: real features that lift the app. His money pain is the one this app
// keeps answering piece by piece - periods nobody closed, deductions not taken, advances
// forgotten («מי חייב כסף», «שים לב», «סגירת שבוע», the close reminder). What did not exist is
// the moment BEFORE he pays: on Wednesday night or Thursday morning, with cash to fetch, he
// opened «דוחות», found each group's band at the bottom of its cards, and found out what
// would stop the close only when he pressed it. This is ONE dialog for that moment, opened
// from «מקדמות» beside «סגירת שבוע»:
//
//   «יום התשלום הבא»   one card per pay group - the weekly men's week, the fortnightly men's
//                      fortnight, a man a boundary cut short alone - with the payday's date
//                      and the three figures «דוחות» prints under that group, each man's own
//                      figure one tap away
//   «לפני שסוגרים»      what will stop or distort the close while there is still time, one
//                      sentence each, each with at most one button that only NAVIGATES
//   «לסגירה»            how many accounts «סגירת שבוע» would close now, who it holds and why
//   «אחרי הסגירה»       the two doors used after closing: the payslips and the closes on record
//
// IT IS A FRAME AROUND THE EXISTING TOOLS, NOT A PAYROLL OF ITS OWN (the owner refused a "new
// payroll system", ROADMAP: payroll-rc2):
//
//   - IT WORKS NO MONEY OUT. Every shekel is the answer of the function «דוחות» asks for the
//     same group on its default (the account view, v189):
//
//       a group's rows        payrollRowsOver over the group's period        js/ui/reports.js
//                             (what payrollRows draws for those men there)
//       «נצבר», ניכוי, «לתשלום» payrollBandTotals - the band the work table's footer, or
//                             «סיכום התקופה», prints under that group
//       the deduction's name  deductionColumnName
//       a man's figure        moneyOf(row).net - the sheet's «לתשלום» for him
//       to close now          «סגירת שבוע»'s own list (weeklyCloseRead), counted as the close
//                             reminder counts it (closeReminderCount)
//       an earlier period     owesWarnings / owesWarningWords - «שים לב»'s own finding
//
//     The one thing this file adds up is a COUNT (how many men a sentence names). A weekly
//     payday is never added to a fortnightly one: the sheet refuses to (payrollGroups,
//     reports.js) and so does this - two cards, and a sentence that says they are not added.
//   - IT WRITES NOTHING. No Store key, no field of the record, nothing queued, nothing synced;
//     it keeps no preference (tests/payday.test.mjs holds the whole disk byte for byte across
//     the reading, the opening, every door and the closing). What is open, and the last
//     reading, are memory, and a reload forgets them.
//   - IT CLOSES NOTHING AND OPENS NOTHING BY ITSELF. Its buttons only navigate - to the pay
//     sheet at a period, to the roster, to the day, to a man's advances, to «מקדמות» - or open
//     a screen that keeps its own rules: «סגירת שבוע» (which refuses a phone that is not
//     «מסונכרן בין המכשירים»), the payslips (which never says «נשלח»). Never «שולם», «נמסר»,
//     «שילמת» or «נשלח»: the app does not record wages handed over.
//
// THE GATE COMES WITH THE FUNCTIONS. With the carry shut, or on a record whose migration
// nobody approved (carryReportingEnabled false), the cards are the plain bands - exactly what
// the sheet shows then - the checks that are the new arithmetic (a phone that cannot close,
// an earlier period left open, an advance that needs a look) are not asked, and the two last
// sections are «מקדמות»'s own sentence that the balances must be checked first.
//
// WHAT IT COSTS, and why it is counted (tests/payday.test.mjs). The reading is the heaviest
// the money pages make - every man's account over his current period, «סגירת שבוע»'s list and
// «מי חייב כסף»'s board - so:
//
//   - it is ONE synchronous call inside the pay sheet's one reading (reportReadOnce: the gate
//     answered once, and on a record that carries the approval not planned at all) and inside
//     «סגירת שבוע»'s memory (weeklyCloseOnce: the ledger folded once per state of the record);
//   - it is never made inside a draw: «מקדמות» draws the button and reads NOTHING of this
//     file; the dialog paints «מחשב את החשבונות…» first and reads after the paint;
//   - it is KEPT under the record itself (owesKey, js/ui/owes.js: the write tick, today, both
//     gates and the record as text), so a second opening of a record that did not move reads
//     nothing, and a kept figure is never another record's;
//   - a record that moves under the open desk puts the placeholder over every figure at once
//     (never the old figures as current) and is read again once the draws have stopped for
//     PAYDAY_QUIET_MS - the close reminder's rule (closeReminderAfterRender).

// ================================================================== THE WORDS
//
// Every Hebrew string this file adds, in one block. PROPOSED, not approved: the owner has not
// read them. Pinned word for word in tests/payday.test.mjs, so changing one is a decision
// (CLAUDE.md, law 6). A name or a range handed to a template is already bidi-isolated by the
// caller.
const PAYDAY_TEXT = Object.freeze({
    // --- the way in (a button beside «סגירת שבוע» on «מקדמות») and the dialog's title
    entry: 'יום תשלום',
    title: 'יום תשלום',
    lead: 'כמה לשלם ביום התשלום הבא לפי מה שנרשם עד עכשיו, ומה כדאי לסדר לפני שסוגרים. '
        + 'המסך הזה רק מראה - שום דבר לא נרשם ממנו.',
    // --- «יום התשלום הבא»: one card per pay group
    next: 'יום התשלום הבא',
    none: 'עוד אין רישומים בתקופה הנוכחית.',
    heading: (day, date, cycle) => `${day} ${date} · ${cycle}`,
    today: 'היום, ',
    soFar: 'לפי מה שנרשם עד עכשיו. ימים ומקדמות שעוד לא נרשמו - לא נכללים.',
    fullDeduction: 'הסכום לתשלום הוא אחרי כל הניכוי שהדוח מציע. ניכוי קטן יותר בסגירה - יותר לתשלום, עד הנצבר.',
    ahead: dates => `כולל ימים שכבר נרשמו מראש: ${dates}.`,
    chosen: 'לחלק מהעובדים נבחר בדוח ניכוי אחר, והוא כלול כאן. «סגירת שבוע» מתחילה מהניכוי המלא.',
    bothGroups: 'ביום הזה משלמים לשתי הקבוצות. לכל קבוצה הסכום שלה - הם לא מחוברים כאן.',
    // --- «לפני שסוגרים»
    before: 'לפני שסוגרים',
    endsTodayOne: name => `החשבון של ${name} נגמר היום, והיום עוד לא נרשם לו.`,
    endsTodayMany: (count, names) => `החשבון של ${count} עובדים נגמר היום, והיום עוד לא נרשם להם: ${names}.`,
    toToday: 'לרישום היום',
    nothing: 'אין מה לסדר לפני הסגירה.',
    forgotten: 'מקדמה שניתנה ולא נרשמה לא תנוכה. רושמים אותה לפני שסוגרים.',
    // --- «לסגירה» and «אחרי הסגירה»
    toClose: 'לסגירה',
    after: 'אחרי הסגירה'
});

// The words this screen borrows, each beside the screen that owns it. Repeated here only
// where the owner builds them inline; tests/payday.test.mjs finds every one of them in its
// owner's source, so a word changed there and not here fails by name. The owners' CONSTANTS
// are not repeated at all - they are read where they are used: PAY_CYCLE_LABELS,
// OTHER_ACCOUNT_SHOW and HOURS_UNPRICED_NOTE (js/ui/reports.js), OWES_TEXT and OWES_REUSED
// (js/ui/owes.js), WEEKLY_CLOSE_TEXT (js/ui/weeklyclose.js), CLOSE_REMINDER_TEXT
// (js/ui/closereminder.js), MONTH_SUMMARY_TEXT (js/ui/monthsummary.js) and PAYSLIPS_TEXT
// (js/ui/payslips.js).
const PAYDAY_REUSED = Object.freeze({
    gross: 'נצבר',                                    // js/ui/reports.js, the sheet's column
    toPay: 'לתשלום',                                  // js/ui/reports.js, the sheet's column
    band: 'סה״כ לתשלום',                              // js/ui/reports.js, the band under a group
    oneMan: 'עובד אחד',                               // js/ui/reports.js, the band's count
    manyMen: 'עובדים',                                // js/ui/reports.js, the band's count
    byWorker: 'לפי עובד',                             // js/ui/reports.js, the section switch
    transition: 'תקופת מעבר: הימים שנשארו מהמחזור הקודם, לפני המעבר לתשלום שבועי.',
                                                     // js/ui/reports.js, the group's note
    roster: 'עובדים ואתרים',                          // index.html, the tab
    advances: 'מקדמות',                               // index.html, the tab
    close: 'סגור',                                    // index.html, the worker's card
    shekel: '₪',                                      // js/ui/reports.js, the card's currency
    unknown: '—'                                      // js/ui/reports.js, a wage it cannot price
});

// How long the draws must have stopped before a record that moved under the open desk is
// read again - the close reminder's own pause (CLOSE_REMINDER_QUIET_MS, js/ui/closereminder.js).
const PAYDAY_QUIET_MS = 1500;

// ================================================================== the reading (no DOM)
//
// Nothing below draws, writes the record or touches the Store. Every figure is an existing
// function's answer, and every sentence is a word of the block above or a borrowed one.

// THE PAY SHEET'S FUNCTIONS, ASKED ABOUT EVERYBODY. They read the report's worker filter off
// REPORT_WORKERS (payrollRowsOver keeps only the men it chooses), and a man narrowed to on
// «דוחות» this session must not narrow the desk. So for the length of this one synchronous
// step the filter is everybody, and it is put back in a finally, throw or no throw - the step
// monthSummaryScope takes (js/ui/monthsummary.js). REPORT_RANGE is never touched (every call
// below is handed its range) and REPORT_DEDUCTIONS is never touched either: a deduction
// somebody chose on the sheet this session is part of what the sheet says, and is read the
// way the sheet reads it.
function paydayScope(read) {
    const held = REPORT_WORKERS;
    REPORT_WORKERS = null;
    try {
        return read();
    } finally {
        REPORT_WORKERS = held;
    }
}

// THE READING: ONE synchronous call, in the house's nesting (weeklyCloseRead's): the pay
// sheet's one reading outside, «סגירת שבוע»'s memory inside it, and this file's scope inside
// that. A reading already open is the same reading. `today` is the local date the periods are
// counted from, `at` the moment the close's own planner is asked at.
function paydayFacts(today, at) {
    if (typeof reportReadOnce === 'function' && !reportReading()) return reportReadOnce(paydayFacts, this, arguments);
    const read = () => paydayScope(() => paydayRead(State.schedule, today, at));
    return typeof weeklyCloseOnce === 'function' ? weeklyCloseOnce(read) : read();
}

// The day after a local date.
function paydayNextDay(date) {
    const day = parseLocalDate(date);
    day.setDate(day.getDate() + 1);
    return toLocalDateStr(day);
}

function paydayShort(date) {
    return formatShortDate(parseLocalDate(date));
}

function paydayRange(from, to) {
    return dateRange(paydayShort(from), paydayShort(to));
}

// A man's place in the roster, for every list that names men: the sheet's own order.
function paydayRosterIndex(schedule) {
    const at = {};
    ((schedule && schedule.workers) || []).forEach((worker, index) => {
        if (worker && worker.id && !(String(worker.id) in at)) at[String(worker.id)] = index;
    });
    return id => (String(id) in at ? at[String(id)] : Number.MAX_SAFE_INTEGER);
}

// THE GROUPS, AS «דוחות» DRAWS THEM ON ITS DEFAULT. Every man is read over HIS period holding
// today (periodRangeFor - the account view's own question, reportSpanFor); the men who share a
// period are one group; and the groups stand in the sheet's order: created as the sheet meets
// them - the work table's rows in the roster's order, then the men with money and no day - and
// then weekly first, then by date (payrollAccountGroups, js/ui/reports.js). A group nobody has
// a row in is not drawn: there is nothing in it to pay.
function paydayGroupsOf(schedule, today, gate) {
    const spans = [];
    const spanOf = {};
    ((schedule && schedule.workers) || []).forEach(worker => {
        if (!worker || !worker.id) return;
        const period = periodRangeFor(worker, today);
        const cycle = period.cycle === 'weekly' ? 'weekly' : 'biweekly';
        const key = `${cycle}|${period.from}|${period.to}`;
        if (!spanOf[key]) {
            spanOf[key] = { key, cycle, from: period.from, to: period.to, ids: new Set(), rows: [] };
            spans.push(spanOf[key]);
        }
        spanOf[key].ids.add(String(worker.id));
    });
    // The rows «דוחות» draws for each group: the same call, over the same range, for the same men.
    spans.forEach(span => {
        span.rows = payrollRowsOver(span.from, span.to, gate, id => span.ids.has(String(id)));
    });
    const index = paydayRosterIndex(schedule);
    const all = spans.reduce((rows, span) => rows.concat(span.rows), [])
        .sort((a, b) => index(a.workerId) - index(b.workerId));
    const keyOf = row => `${row.payCycle === 'weekly' ? 'weekly' : 'biweekly'}|${row.spanFrom}|${row.spanTo}`;
    const order = [];
    all.filter(workRecordedIn).concat(all.filter(row => !workRecordedIn(row))).forEach(row => {
        const key = keyOf(row);
        if (order.indexOf(key) === -1 && spanOf[key]) order.push(key);
    });
    // Array.prototype.sort is stable: equal groups keep the order the sheet met them in.
    return order.map(key => spanOf[key]).sort((a, b) => (a.cycle === b.cycle
        ? (a.from < b.from ? -1 : a.from > b.from ? 1 : 0)
        : (a.cycle === 'weekly' ? -1 : 1)));
}

// The dates after today inside the group's period that already hold a day of work of one of
// its men - the evening's seder for tomorrow is written into tomorrow's day, so on Wednesday
// night Thursday is in the figure already, and the card says so.
function paydayAhead(schedule, span, today) {
    const out = [];
    for (let date = paydayNextDay(today), n = 0; date <= span.to && n < 31; date = paydayNextDay(date), n += 1) {
        const worked = [...span.ids].some(id => entriesFor(schedule, date, id, 'actual').length > 0);
        if (worked) out.push(date);
    }
    return out;
}

// One card's facts: its heading, its period, the three figures as the band prints them, the
// count line, the lines that say what the figures are, and each man's figure.
function paydayCard(schedule, span, today, gate) {
    const rows = span.rows;
    const band = payrollBandTotals(rows);
    const label = deductionColumnName(rows);
    const work = rows.filter(workRecordedIn);
    const finance = rows.filter(row => !workRecordedIn(row));
    // WHETHER THE SHEET PRINTS THE BAND'S MONEY AT ALL. «סיכום התקופה» prints its three cells
    // whenever the group has a man with money and no day; the work table's footer prints «נצבר»
    // and «לתשלום» only when somebody on it has a daily rate (payrollGroupTable's anyRate). A
    // group the sheet cannot price shows «—» here too - unknown, which is not nought.
    const priced = finance.length > 0 || work.some(row => row.dailyRate > 0);
    const paid = rows.filter(row => row.amount !== null).length;
    const to = parseLocalDate(span.to);
    const R = PAYDAY_REUSED;
    const T = PAYDAY_TEXT;
    const heading = (span.to === today ? T.today : '')
        + T.heading(hebrewDayName(to), formatShortDate(to), PAY_CYCLE_LABELS[span.cycle] || '');
    // The sheet's note for a period a boundary cut short, said as the sheet says it - of the
    // first man it draws in the group (groupPeriodNote): his work row, else his money row.
    const first = (work.length ? work : finance)[0];
    const lines = [T.soFar];
    if (gate && band.taken > 0) lines.push(T.fullDeduction);
    const ahead = paydayAhead(schedule, span, today);
    if (ahead.length) lines.push(T.ahead(ahead.map(paydayShort).join(', ')));
    if (gate && typeof REPORT_DEDUCTIONS !== 'undefined'
        && rows.some(row => REPORT_DEDUCTIONS.has(reportDeductionKey(row.workerId, span.from, span.to)))) {
        lines.push(T.chosen);
    }
    return {
        key: span.key,
        cycle: span.cycle,
        from: span.from,
        to: span.to,
        transition: Boolean(first && first.periodIsTransition === true),
        today: span.to === today,
        heading,
        range: paydayRange(span.from, span.to),
        note: first && first.periodIsTransition === true ? R.transition : null,
        rows: rows.map(row => {
            const net = moneyOf(row).net;
            return { workerId: String(row.workerId), name: String(row.name === undefined || row.name === null ? '' : row.name),
                net, said: net === null ? R.unknown : bidiAmount(moneyText(net)) };
        }),
        gross: band.gross,
        taken: band.taken,
        net: band.net,
        label,
        paid,
        priced,
        figures: [
            { kind: 'gross', label: R.gross, value: priced ? moneyText(band.gross) : R.unknown },
            { kind: 'taken', label, value: band.taken === 0 ? '0' : minusAmount(band.taken) },
            { kind: 'pay', label: R.toPay, value: priced ? bidiAmount(moneyText(band.net)) : R.unknown }
        ],
        count: `${R.band} · ${countedIn(paid, R.oneMan, R.manyMen)}`,
        lines
    };
}

// «לפני שסוגרים»: each finding one sentence, in the contract's order, each with at most one
// door - and a door is DATA ({ words, go, args }), carried out by paydayGo below, so that a
// reading is a plain object that two readings can be compared by.
function paydayChecks(schedule, cards, spans, today, gate, close) {
    const checks = [];
    const index = paydayRosterIndex(schedule);
    const rows = cards.reduce((all, card, n) => all.concat(spans[n].rows), [])
        .sort((a, b) => index(a.workerId) - index(b.workerId));
    const names = list => list.map(row => isolate(row.name)).join(', ');

    // a. THIS PHONE CANNOT CLOSE NOW - «סגירת שבוע»'s own sentence, word for word, and no door:
    // what is missing is a signal or a write still on its way, not a screen. Only where there
    // is something to close.
    if (close && (close.count > 0 || cards.some(card => card.today)) && typeof weeklyCloseReadyWord === 'function') {
        const word = weeklyCloseReadyWord();
        if (word) checks.push({ kind: 'notReady', say: word, lines: [], door: null });
    }
    // b. AN EARLIER PERIOD LEFT OPEN WHILE HE OWED - «שים לב»'s own finding in its own words,
    // and v195's button, which points the pay sheet at that period. The board's reading of
    // this moment (kept by owes.js under the record itself) when `today` is today.
    if (gate && typeof owesWarnings === 'function') {
        const board = today === todayStr() ? owesReadNow() : owesRead(schedule, today);
        owesWarnings(board).filter(warning => warning.kind === 'unclosed').forEach(warning => {
            const words = owesWarningWords(warning, today);
            checks.push({ kind: 'unclosed', say: words.title, lines: words.lines.slice(),
                door: { words: `${OTHER_ACCOUNT_SHOW} ${owesSpanText(warning.span)}`, go: 'account',
                    args: [String(warning.row.workerId), warning.span.from, warning.span.to] } });
        });
    }
    // c. A WAGE THE SHEET CANNOT PRICE: a day of work with no daily rate.
    const unpriced = rows.filter(row => row.amount === null && row.attendanceDays > 0);
    if (unpriced.length && typeof MONTH_SUMMARY_TEXT === 'object') {
        checks.push({ kind: 'unpriced', say: MONTH_SUMMARY_TEXT.unpriced(unpriced.length, names(unpriced)), lines: [],
            door: { words: PAYDAY_REUSED.roster, go: 'roster', args: [] } });
    }
    // d. A PERIOD ENDS TODAY AND TODAY IS NOT RECORDED FOR HIM - «סגירת שבוע»'s own test
    // (weeklyCloseTodayRecorded), asked of the men who worked in a period that ends today and
    // is still open: the men the pass would hold («נגמרת היום»). One sentence for all of them.
    if (typeof weeklyCloseTodayRecorded === 'function') {
        const memo = {};
        const waiting = [];
        cards.forEach((card, n) => {
            if (!card.today) return;
            spans[n].rows.forEach(row => {
                if (!(row.attendanceDays > 0)) return;
                if (typeof frozenPeriodFor === 'function'
                    && frozenPeriodFor(schedule, row.workerId, card.from, card.to) !== undefined) return;
                if (!weeklyCloseTodayRecorded(schedule, row.workerId, today, memo)) waiting.push(row);
            });
        });
        waiting.sort((a, b) => index(a.workerId) - index(b.workerId));
        if (waiting.length) {
            checks.push({ kind: 'endsToday',
                say: waiting.length === 1 ? PAYDAY_TEXT.endsTodayOne(isolate(waiting[0].name))
                    : PAYDAY_TEXT.endsTodayMany(waiting.length, names(waiting)),
                lines: [], door: { words: PAYDAY_TEXT.toToday, go: 'day', args: [today] } });
        }
    }
    // e. AN ADVANCE THAT NEEDS A LOOK - the sheet's own sentence for an over-settled account,
    // and the way to his advances, where v201's «לסדר את המקדמה» is.
    if (gate && typeof overpaymentWarning === 'function') {
        rows.forEach(row => {
            const warning = overpaymentWarning(row.carry);
            if (!warning) return;
            checks.push({ kind: 'review', who: String(row.name), say: warning, lines: [],
                door: { words: OWES_TEXT.advancesOf(isolate(row.name)), go: 'advancesOf', args: [String(row.workerId)] } });
        });
    }
    // f. EXTRA HOURS WITH NO HOURLY RATE - the sheet's starred sentence, and the men.
    const hours = rows.filter(row => row.hoursUnpriced);
    if (hours.length && typeof HOURS_UNPRICED_NOTE === 'string') {
        checks.push({ kind: 'hoursUnpriced', say: HOURS_UNPRICED_NOTE, lines: [names(hours)],
            door: { words: PAYDAY_REUSED.roster, go: 'roster', args: [] } });
    }
    return checks;
}

// «לסגירה»: «סגירת שבוע»'s own list at this moment - the men it would offer, counted as the
// close reminder counts them, and the men it holds with the sentence it says for each. null
// where nothing may be closed at all (its gate: the record nobody approved, the carry shut).
function paydayClose(schedule, today, at, gate) {
    if (!gate || typeof weeklyCloseRead !== 'function') return null;
    const read = weeklyCloseRead(schedule, today, at);
    if (!read || read.gate !== true) return null;
    const count = typeof closeReminderCount === 'function' ? closeReminderCount(read)
        : read.men.filter(man => man && !man.held).length;
    const held = read.men.filter(man => man && man.held).map(man => ({ id: String(man.id), name: String(man.name),
        why: typeof weeklyCloseHeldText === 'function' ? weeklyCloseHeldText(man) : '' }));
    const said = count > 0 && typeof CLOSE_REMINDER_TEXT === 'object' ? CLOSE_REMINDER_TEXT.line(count) : WEEKLY_CLOSE_TEXT.nobody;
    return { count, held, say: said,
        door: count > 0 || held.length > 0
            ? { words: typeof CLOSE_REMINDER_TEXT === 'object' ? CLOSE_REMINDER_TEXT.open : WEEKLY_CLOSE_TEXT.entry, go: 'weeklyClose', args: [] }
            : null };
}

function paydayRead(schedule, today, at) {
    const gate = carryReportingEnabled(schedule) === true;
    const facts = { gate, today, groups: [], checks: [], nothing: false, forgotten: null, close: null, after: null };
    if (!schedule || typeof payrollRowsOver !== 'function') return facts;
    const spans = paydayGroupsOf(schedule, today, gate);
    const cards = spans.map(span => paydayCard(schedule, span, today, gate));
    // Two cards whose payday is one date: under the second, the sentence that they are not added.
    cards.forEach((card, n) => {
        if (cards.slice(0, n).some(before => before.to === card.to)) card.lines.push(PAYDAY_TEXT.bothGroups);
    });
    facts.groups = cards;
    facts.close = paydayClose(schedule, today, at, gate);
    facts.checks = paydayChecks(schedule, cards, spans, today, gate, facts.close);
    facts.nothing = facts.checks.length === 0;
    // h. THE FORGOTTEN ADVANCE: always last, and not a finding - an advance nobody typed cannot
    // be found, so the desk says so at the one moment it still matters.
    facts.forgotten = { say: PAYDAY_TEXT.forgotten, door: { words: PAYDAY_REUSED.advances, go: 'advances', args: [] } };
    if (facts.close) {
        const after = [];
        if (typeof PAYSLIPS_TEXT === 'object') {
            after.push({ words: PAYSLIPS_TEXT.entry, go: 'payslips', args: [cards.some(card => card.today) ? 'current' : 'previous'] });
        }
        if (typeof owesAnyClosure === 'function' && owesAnyClosure(schedule)) {
            after.push({ words: OWES_TEXT.closures, go: 'closures', args: [] });
        }
        facts.after = after;
    }
    return facts;
}

// ================================================================== memory
//
// { key, facts }: the last reading, under the record it was read from (owesKey). Never a
// figure of another record: a key that does not match is not read from.
let PAYDAY_KEPT = null;
// The open desk: whether it is open, what it shows ('reading' - the placeholder, a reading on
// its way after the paint; 'shown' - the facts of PAYDAY_KEPT; 'stale' - the placeholder over a
// record that moved, waiting for the draws to stop), the wait, and which cards' «לפי עובד» are
// unfolded. Memory only.
let PAYDAY = null;

// The key a reading is kept under: owes.js's own (closeReminderKey's rule, js/ui/closereminder.js).
function paydayKey() {
    const today = todayStr();
    if (typeof owesKey === 'function') return owesKey(State.schedule, today);
    return `${typeof Store === 'object' && Store ? Store.tick : 0}|${today}|${JSON.stringify(State.schedule)}`;
}

function paydayParts() {
    const get = id => (typeof document !== 'undefined' && document.getElementById ? document.getElementById(id) : null);
    return { modal: get('paydayModal'), title: get('paydayTitle'), body: get('paydayBody'), close: get('paydayClose') };
}

function paydayIsOpen() {
    const parts = paydayParts();
    return Boolean(PAYDAY && PAYDAY.open && parts.modal && parts.modal.style.display === 'flex');
}

// The reading of this moment, kept under the record.
function paydayReadNow() {
    const key = paydayKey();
    if (PAYDAY_KEPT && PAYDAY_KEPT.key === key) return PAYDAY_KEPT.facts;
    const facts = paydayFacts(todayStr(), new Date().toISOString());
    PAYDAY_KEPT = { key, facts };
    return facts;
}

// THE BUTTON, on «מקדמות» beside «סגירת שבוע» (renderOwesInto, js/ui/owes.js). It reads
// nothing: a draw of «מקדמות» costs what it cost before this file.
function paydayEntryButton() {
    if (typeof button !== 'function') return null;
    const entry = button(PAYDAY_TEXT.entry, 'btn-secondary payday-entry', () => {
        // The button holds the keyboard while the dialog is open, so that closing it gives the
        // focus back here (js/ui/modal.js): a tap on a phone focuses nothing by itself.
        if (entry.focus) entry.focus({ preventScroll: true });
        openPayday();
    });
    entry.id = 'paydayEntry';
    return entry;
}

function openPayday() {
    const parts = paydayParts();
    if (!parts.modal || !parts.body) return false;
    if (PAYDAY && PAYDAY.wait) clearTimeout(PAYDAY.wait);
    PAYDAY = { open: true, state: 'reading', wait: null, folds: new Set() };
    if (parts.title) parts.title.textContent = PAYDAY_TEXT.title;
    if (parts.close) parts.close.textContent = PAYDAY_REUSED.close;
    // A record that did not move since the last reading is drawn from it, reading nothing.
    const kept = PAYDAY_KEPT && PAYDAY_KEPT.key === paydayKey() ? PAYDAY_KEPT.facts : null;
    if (kept) {
        PAYDAY.state = 'shown';
        paydayDraw(kept);
    } else {
        paydayPlaceholder(false);
    }
    parts.modal.style.display = 'flex';
    const content = parts.modal.querySelector ? parts.modal.querySelector('.modal-content') : null;
    if (content) content.scrollTop = 0;
    // Entered at its heading, like every dialog that has one (js/ui/modal.js); forced into
    // effect first, because an element that was display:none a line ago cannot take focus.
    void parts.modal.offsetHeight;
    if (parts.title && parts.title.focus) parts.title.focus({ preventScroll: true });
    if (!kept) paydayLater(() => paydayShowRead(false));
    return true;
}

// `leaving`: a door is taking the person somewhere else, and the focus goes where it goes.
function closePayday(leaving) {
    const parts = paydayParts();
    if (PAYDAY && PAYDAY.wait) clearTimeout(PAYDAY.wait);
    const was = Boolean(PAYDAY && PAYDAY.open);
    PAYDAY = null;
    if (parts.modal) parts.modal.style.display = 'none';
    if (parts.body) clear(parts.body);
    // The keyboard goes back to the button the desk was opened from, even when «מקדמות» was
    // drawn again underneath meanwhile and it is a new node.
    if (was && leaving !== true && typeof document !== 'undefined' && document.getElementById) {
        const entry = document.getElementById('paydayEntry');
        if (entry && entry.focus) entry.focus({ preventScroll: true });
    }
}

// After the frame that paints «מחשב את החשבונות…», never in it (owesAfterPaint, js/ui/owes.js,
// with its timer for a window given no frame). Where there is no frame at all - the suites'
// devices in Node - it is read in place.
function paydayLater(work) {
    if (typeof requestAnimationFrame !== 'function' || typeof owesAfterPaint !== 'function') { work(); return; }
    owesAfterPaint(work);
}

// The reading, then the drawing, for the desk that is still open. `keepScroll`: a re-read under
// an open desk leaves the dialog where it was scrolled to. NOT CAUGHT: a reading that throws is
// a programming error, and the app has one place to put those - the crash banner
// (watchForCrashes, js/app.js) - rather than a dialog that says «מחשב» for ever in silence.
function paydayShowRead(keepScroll) {
    if (!paydayIsOpen()) return;
    const parts = paydayParts();
    const content = parts.modal.querySelector ? parts.modal.querySelector('.modal-content') : null;
    const at = content ? content.scrollTop : 0;
    const facts = paydayReadNow();
    if (!paydayIsOpen()) return;
    PAYDAY.state = 'shown';
    paydayDraw(facts);
    if (parts.body && parts.body.style) parts.body.style.minHeight = '';
    if (keepScroll && content) content.scrollTop = at;
}

// render() asks this (js/app.js). A record that did not move draws nothing new. One that moved
// puts the placeholder over every figure at once - a figure of the record before is never
// shown as current - and is read again once the draws have stopped for PAYDAY_QUIET_MS, with
// the dialog left where it was scrolled to. A new calendar day is a record that moved: today
// is in the key.
function renderPaydayIfOpen() {
    if (!paydayIsOpen() || PAYDAY.state === 'reading') return;
    const key = paydayKey();
    if (PAYDAY_KEPT && PAYDAY_KEPT.key === key) {
        if (PAYDAY.state === 'stale') {
            if (PAYDAY.wait) clearTimeout(PAYDAY.wait);
            PAYDAY.wait = null;
            paydayShowRead(true);
        }
        return;
    }
    if (PAYDAY.state !== 'stale') {
        PAYDAY.state = 'stale';
        paydayPlaceholder(true);
    }
    if (PAYDAY.wait) clearTimeout(PAYDAY.wait);
    PAYDAY.wait = setTimeout(() => {
        if (!PAYDAY) return;
        PAYDAY.wait = null;
        paydayShowRead(true);
    }, PAYDAY_QUIET_MS);
}

// ================================================================== drawing
//
// One dialog (#paydayModal, index.html): the title and «סגור» are the frame's; everything else
// is drawn into #paydayBody from the facts above and from nothing else.

// «מחשב את החשבונות…» in the body's place. `hold`: a record moved under the open desk - the
// body keeps the height it had, so the dialog is not thrown back to its top meanwhile.
function paydayPlaceholder(hold) {
    const parts = paydayParts();
    if (!parts.body) return;
    const height = hold && parts.body.getBoundingClientRect ? parts.body.getBoundingClientRect().height : 0;
    clear(parts.body);
    const said = el('p', 'payday-reading', typeof WEEKLY_CLOSE_TEXT === 'object' ? WEEKLY_CLOSE_TEXT.reading : '');
    said.setAttribute('role', 'status');
    parts.body.appendChild(said);
    if (parts.body.style) parts.body.style.minHeight = height > 0 ? `${height}px` : '';
}

function paydayAmount(value, kind) {
    const amount = el('span', `payday-amount payday-amount-${kind}`);
    amount.appendChild(el('b', 'payday-value', value));
    if (value !== PAYDAY_REUSED.unknown) amount.appendChild(el('span', 'payday-currency', PAYDAY_REUSED.shekel));
    return amount;
}

function paydayDoorButton(door) {
    return button(door.words, 'btn-secondary payday-door', () => paydayGo(door));
}

// One card: the payday, the period, the three figures label over value - «לתשלום» last and
// largest - the band's count, the lines that say what the figures are, and the fold.
function paydayCardNode(card, at) {
    const node = el('article', 'payday-card');
    node.dataset.cycle = card.cycle;
    node.dataset.group = card.key;
    node.appendChild(el('h5', 'payday-card-head', card.heading));
    node.appendChild(el('p', 'payday-card-range', card.range));
    if (card.note) node.appendChild(el('p', 'payday-card-note', card.note));
    const figures = el('div', 'payday-figures');
    card.figures.forEach(figure => {
        const cell = el('span', `payday-figure payday-figure-${figure.kind}`);
        cell.appendChild(el('small', 'payday-figure-label', figure.label));
        cell.appendChild(paydayAmount(figure.value, figure.kind));
        figures.appendChild(cell);
    });
    node.appendChild(figures);
    node.appendChild(el('p', 'payday-count', card.count));
    card.lines.forEach(line => node.appendChild(el('p', 'payday-card-line', line)));
    // «לפי עובד»: a button and not a <details>, because the dialogs' Tab trap (js/ui/modal.js)
    // knows buttons and fields (monthsummary.js's reason). Unfolded in place: the button stays
    // the same node under the finger and the keyboard.
    const id = `paydayMen${at}`;
    const open = Boolean(PAYDAY && PAYDAY.folds.has(card.key));
    const fold = button(PAYDAY_REUSED.byWorker, 'btn-secondary payday-fold', () => {
        const list = document.getElementById(id);
        if (!list || !PAYDAY) return;
        const show = list.hidden === true;
        list.hidden = !show;
        fold.setAttribute('aria-expanded', show ? 'true' : 'false');
        if (show) PAYDAY.folds.add(card.key); else PAYDAY.folds.delete(card.key);
    });
    fold.setAttribute('aria-expanded', open ? 'true' : 'false');
    fold.setAttribute('aria-controls', id);
    node.appendChild(fold);
    const list = el('div', 'payday-men');
    list.id = id;
    list.hidden = !open;
    card.rows.forEach(row => {
        const man = el('div', 'payday-man');
        man.dataset.worker = row.workerId;
        man.appendChild(el('span', 'payday-man-name', row.name));
        man.appendChild(paydayAmount(row.said, 'man'));
        list.appendChild(man);
    });
    node.appendChild(list);
    return node;
}

function paydayCheckNode(check) {
    const node = el('div', `payday-check payday-check-${check.kind}`);
    if (check.who) node.appendChild(el('strong', 'payday-check-who', check.who));
    node.appendChild(el(check.kind === 'unclosed' ? 'strong' : 'p', 'payday-check-say', check.say));
    (check.lines || []).forEach(line => node.appendChild(el('p', 'payday-check-line', line)));
    if (check.door) node.appendChild(paydayDoorButton(check.door));
    return node;
}

function paydaySection(name, title) {
    const section = el('section', `payday-section payday-${name}`);
    section.appendChild(el('h4', 'payday-section-head', title));
    return section;
}

function paydayDraw(facts) {
    const parts = paydayParts();
    if (!parts.body) return;
    const T = PAYDAY_TEXT;
    clear(parts.body);
    parts.body.appendChild(el('p', 'payday-lead', T.lead));

    const next = paydaySection('next', T.next);
    if (!facts.groups.length) next.appendChild(el('p', 'payday-none', T.none));
    facts.groups.forEach((card, at) => next.appendChild(paydayCardNode(card, at)));
    parts.body.appendChild(next);

    const before = paydaySection('before', T.before);
    facts.checks.forEach(check => before.appendChild(paydayCheckNode(check)));
    if (facts.nothing) before.appendChild(el('p', 'payday-nothing', T.nothing));
    if (facts.forgotten) {
        const quiet = el('div', 'payday-check payday-check-forgotten');
        quiet.appendChild(el('p', 'payday-check-say', facts.forgotten.say));
        quiet.appendChild(paydayDoorButton(facts.forgotten.door));
        before.appendChild(quiet);
    }
    parts.body.appendChild(before);

    if (!facts.close) {
        // The record may not be read the new way: no count, no closes, «מקדמות»'s own sentence.
        parts.body.appendChild(el('p', 'hint hint-warn payday-gate', OWES_REUSED.checkFirst));
        return;
    }
    const close = paydaySection('close', T.toClose);
    close.appendChild(el('p', 'payday-close-say', facts.close.say));
    if (facts.close.held.length) {
        const held = el('div', 'payday-held');
        held.appendChild(el('strong', 'payday-held-head', WEEKLY_CLOSE_TEXT.stateHeld));
        facts.close.held.forEach(man => {
            const line = el('p', 'payday-held-man');
            line.dataset.worker = man.id;
            line.textContent = man.why ? `${isolate(man.name)} · ${man.why}` : isolate(man.name);
            held.appendChild(line);
        });
        close.appendChild(held);
    }
    if (facts.close.door) close.appendChild(paydayDoorButton(facts.close.door));
    parts.body.appendChild(close);

    if (facts.after && facts.after.length) {
        const after = paydaySection('after', T.after);
        const doors = el('div', 'payday-doors');
        facts.after.forEach(door => doors.appendChild(paydayDoorButton(door)));
        after.appendChild(doors);
        parts.body.appendChild(after);
    }
}

// ================================================================== the doors
//
// EVERY DOOR CLOSES THE DESK FIRST, then calls the target's own opener - the screen it opens
// keeps its own rules, and a dialog it opens is entered at its title, by hand: js/ui/modal.js
// sees no moment with no dialog open between the two, so it neither enters the new one nor
// forgets the button the desk was opened from (siteCardGoMan's note, js/ui/sitecard.js). None
// writes anything; the payslips write only what their own opener writes.
function paydayGo(door) {
    if (!door) return false;
    const args = door.args || [];
    const titled = id => {
        const heading = document.getElementById(id);
        if (heading && heading.focus) heading.focus({ preventScroll: true });
    };
    closePayday(true);
    switch (door.go) {
    case 'account':
        owesShowAccount(args[0], { from: args[1], to: args[2] });
        return true;
    case 'roster':
        showView('roster');
        return true;
    case 'day':
        State.date = args[0];
        if (typeof dayChosenByHand === 'function') dayChosenByHand();
        showView('day');
        return true;
    case 'advancesOf':
        showWorkerAdvances(args[0]);
        return true;
    case 'advances':
        OWES_PAGE = null;
        ADVANCE_WORKER = null;
        showView('advances');
        return true;
    case 'weeklyClose':
        if (typeof openWeeklyClose === 'function' && openWeeklyClose()) titled('weeklyCloseTitle');
        return true;
    case 'payslips':
        if (typeof openPayslips === 'function' && openPayslips(args[0])) titled('payslipsTitle');
        return true;
    case 'closures':
        owesOpenPage('closures');
        return true;
    default:
        return false;
    }
}
