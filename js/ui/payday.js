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
    // The last line of the desk, quiet (fix round 1): the dialog opens on the figures it is
    // for. Above the cards it took six lines at 320 with «תצוגה גדולה» and pushed the first
    // «לתשלום» off the first screen.
    lead: 'המסך הזה רק מראה - שום דבר לא נרשם ממנו.',
    // --- «יום התשלום הבא»: one card per pay group
    next: 'יום התשלום הבא',
    none: 'עוד אין רישומים בתקופה הנוכחית.',
    heading: (day, date, cycle) => `${day} ${date} · ${cycle}`,
    today: 'היום, ',
    // Said once, under the cards (fix round 1) - not once a card.
    soFar: 'לפי מה שנרשם עד עכשיו. ימים ומקדמות שעוד לא נרשמו - לא נכללים.',
    fullDeduction: 'הסכום לתשלום הוא אחרי כל הניכוי שהדוח מציע. ניכוי קטן יותר בסגירה - יותר לתשלום, עד הנצבר.',
    ahead: dates => `כולל ימים שכבר נרשמו מראש: ${dates}.`,
    chosen: 'לחלק מהעובדים נבחר בדוח ניכוי אחר, והוא כלול כאן. «סגירת שבוע» מתחילה מהניכוי המלא.',
    // A man whose period is already closed: the sheet's own sentence for him («החשבון נסגר ולא
    // ישתנה», js/ui/reports.js), with his name in it - and plural throughout.
    closedOne: name => `החשבון של ${name} נסגר ולא ישתנה.`,
    closedMany: (count, names) => `החשבונות של ${count} עובדים נסגרו ולא ישתנו: ${names}.`,
    // Two cards or more whose payday is one date - under the last of them, once.
    sameDay: count => (count === 2
        ? 'ביום הזה משלמים לשתי הקבוצות. לכל קבוצה הסכום שלה - שני הסכומים לא מחוברים כאן.'
        : `ביום הזה משלמים ל-${count} קבוצות. לכל קבוצה הסכום שלה - הסכומים לא מחוברים כאן.`),
    // --- «לפני שסוגרים»
    before: 'לפני שסוגרים',
    // One man with no daily rate: the sheet's sentence for many (MONTH_SUMMARY_TEXT.unpriced,
    // js/ui/monthsummary.js) said of one - it reads «1 עובדים … אותם … להם» for him.
    unpricedOne: name => `⚠️ עובד אחד בלי שכר יומי, ולכן הסכום חסר אותו: ${name}. הוסף לו שכר במסך "עובדים ואתרים".`,
    // Built on «סגירת שבוע»'s own sentence for the same fact (WEEKLY_CLOSE_TEXT.heldEndsToday,
    // «התקופה שלו נגמרת היום, והיום עוד לא נרשם לו.»), with the name in it - and plural throughout.
    endsTodayOne: name => `התקופה של ${name} נגמרת היום, והיום עוד לא נרשם לו.`,
    endsTodayMany: (count, names) => `התקופות של ${count} עובדים נגמרות היום, והיום עוד לא נרשם להם: ${names}.`,
    toToday: 'לרישום היום',
    nothing: 'אין מה לסדר לפני הסגירה.',
    forgotten: 'מקדמה שניתנה ולא נרשמה לא תנוכה. רושמים אותה לפני שסוגרים.',
    // --- «לסגירה» and «אחרי הסגירה»
    toClose: 'לסגירה',
    // The men «סגירת שבוע» holds because today is not recorded for them, and whom «לפני
    // שסוגרים» already names (check d): counted here once, never their sentence again a man.
    heldToday: count => (count === 1 ? 'עובד אחד לא ייסגר עד שיירשם לו היום.'
        : `${count} עובדים לא ייסגרו עד שיירשם להם היום.`),
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
    total: 'סה״כ',                                    // js/ui/reports.js, that band where nobody has a rate
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
    // The sheet's note for a period a boundary cut short (groupPeriodNote) - of the first man it
    // draws in the group: his work row, else his money row. ONLY for a stub that WEEKLY pay
    // follows: the sentence names the move to weekly pay, and of a man going back to the
    // fortnight it would be untrue - there the period's dates stand alone.
    const first = (work.length ? work : finance)[0];
    const firstWorker = first ? ((schedule && schedule.workers) || [])
        .filter(worker => worker && String(worker.id) === String(first.workerId))[0] || null : null;
    const toWeekly = Boolean(first && first.periodIsTransition === true
        && periodRangeFor(firstWorker, paydayNextDay(span.to)).cycle === 'weekly');
    // WHAT THE DEDUCTION IN THE BAND IS, man by man (fix round 1). An OPEN account with
    // nothing chosen for it carries the most the sheet proposes - a smaller deduction at the
    // close leaves more to pay. A CLOSED account carries what its close recorded, and nothing
    // lies ahead of it: the sheet says of him «החשבון נסגר ולא ישתנה». An open account with a
    // deduction chosen on «דוחות» this session carries that choice (payrollRowsOver reads it;
    // for a closed one it changes nothing). So the full-deduction sentence is said only when
    // EVERY man something comes off is an open account at the full proposal.
    const open = row => Boolean(row.carry) && !row.carry.closed;
    const chosen = row => gate && open(row) && typeof REPORT_DEDUCTIONS !== 'undefined' && REPORT_DEDUCTIONS
        && REPORT_DEDUCTIONS.has(reportDeductionKey(row.workerId, span.from, span.to));
    const deducting = rows.filter(row => moneyOf(row).netted < 0);
    const closed = rows.filter(row => Boolean(row.carry) && row.carry.closed === true);
    const lines = [];
    if (gate && band.taken > 0 && deducting.length > 0 && deducting.every(row => open(row) && !chosen(row))) {
        lines.push(T.fullDeduction);
    }
    const ahead = paydayAhead(schedule, span, today);
    if (ahead.length) lines.push(T.ahead(ahead.map(paydayShort).join(', ')));
    if (rows.some(chosen)) lines.push(T.chosen);
    if (closed.length === 1) lines.push(T.closedOne(isolate(closed[0].name)));
    else if (closed.length > 1) lines.push(T.closedMany(closed.length, closed.map(row => isolate(row.name)).join(', ')));
    return {
        key: span.key,
        cycle: span.cycle,
        from: span.from,
        to: span.to,
        transition: Boolean(first && first.periodIsTransition === true),
        toWeekly,
        today: span.to === today,
        heading,
        range: paydayRange(span.from, span.to),
        note: toWeekly ? R.transition : null,
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
        // The band's first cell, as the sheet prints it: a group nobody can price has no total
        // to count men into, and the work table's footer then says «סה״כ» alone.
        count: priced ? `${R.band} · ${countedIn(paid, R.oneMan, R.manyMen)}` : R.total,
        lines
    };
}

// a. THIS PHONE CANNOT CLOSE NOW - «סגירת שבוע»'s own sentence, word for word, and no door:
// what is missing is a signal or a write still on its way, not a screen. Only where there is
// something to close. IT IS THE PHONE'S STATE AT THIS MOMENT - its link to the cloud, a write
// still on its way, another window - and none of that is in the record or in the key a
// reading is kept under (fix round 1: a desk read while synced said nothing after the signal
// dropped, and one read offline kept saying so once it was back). So it is asked again every
// time the desk is drawn (paydayLive), as «סגירת שבוע» asks it every time it speaks
// (weeklyCloseSay, js/ui/weeklyclose.js), and never kept.
function paydayReadyCheck(close, cards) {
    if (!close || !(close.count > 0 || cards.some(card => card.today)) || typeof weeklyCloseReadyWord !== 'function') return null;
    const word = weeklyCloseReadyWord();
    return word ? { kind: 'notReady', say: word, lines: [], door: null } : null;
}

// Nothing to sort: no finding at all - h is not a finding - and nobody «סגירת שבוע» would hold
// (fix round 1: never said while «לסגירה» names a man who will not close).
function paydayNothing(checks, close) {
    return !checks.some(check => check.kind !== 'forgotten') && !(close && close.held.length > 0);
}

// A kept reading as it is to be drawn NOW: check a asked again, and the sentence that there is
// nothing to sort said again after it. Everything else is the reading's.
function paydayLive(facts) {
    const rest = facts.checks.filter(check => check.kind !== 'notReady');
    const ready = paydayReadyCheck(facts.close, facts.groups);
    const checks = ready ? [ready].concat(rest) : rest;
    return Object.assign({}, facts, { checks, nothing: paydayNothing(checks, facts.close) });
}

// The door for a man «סגירת שבוע» holds, by why it holds him: the way to what stops him.
function paydayHeldDoor(man, today) {
    const account = (from, to) => ({ words: `${OTHER_ACCOUNT_SHOW} ${owesSpanText({ from, to })}`, go: 'account',
        args: [man.id, from, to] });
    switch (man.kind) {
    case 'endsToday': return { words: PAYDAY_TEXT.toToday, go: 'day', args: [today] };
    case 'unpriced': return { words: PAYDAY_REUSED.roster, go: 'roster', args: [] };
    case 'overpaid': return { words: OWES_TEXT.advancesOf(isolate(man.name)), go: 'advancesOf', args: [man.id] };
    // An earlier period: v195's button to it. Anything else «סגירת שבוע» sends to the man's own
    // close in the pay sheet («סגור אותו מהחשבון שלו בדוח»): his account at the period it holds.
    default: return account(man.from, man.to);
    }
}

// Whether a check above already says why «סגירת שבוע» holds this man - the same man, for the
// same reason (and, for an earlier period, the same period).
function paydayHeldSaid(man, checks) {
    const said = (kind, test) => checks.some(check => check.kind === kind && test(check));
    switch (man.kind) {
    case 'endsToday': return said('endsToday', check => check.workers.indexOf(man.id) !== -1);
    case 'earlier':
    case 'earlierBehind': return said('unclosed', check => check.workerId === man.id && check.from === man.from && check.to === man.to);
    case 'unpriced': return said('unpriced', check => check.workers.indexOf(man.id) !== -1);
    case 'overpaid': return said('review', check => check.workerId === man.id);
    default: return false;
    }
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
    const ids = list => list.map(row => String(row.workerId));

    // a.
    const ready = paydayReadyCheck(close, cards);
    if (ready) checks.push(ready);
    // b. AN EARLIER PERIOD LEFT OPEN WHILE HE OWED - «שים לב»'s own finding in its own words,
    // and v195's button, which points the pay sheet at that period. The board's reading of
    // this moment (kept by owes.js under the record itself) when `today` is today.
    if (gate && typeof owesWarnings === 'function') {
        const board = today === todayStr() ? owesReadNow() : owesRead(schedule, today);
        owesWarnings(board).filter(warning => warning.kind === 'unclosed').forEach(warning => {
            const words = owesWarningWords(warning, today);
            checks.push({ kind: 'unclosed', workerId: String(warning.row.workerId), from: warning.span.from, to: warning.span.to,
                say: words.title, lines: words.lines.slice(),
                door: { words: `${OTHER_ACCOUNT_SHOW} ${owesSpanText(warning.span)}`, go: 'account',
                    args: [String(warning.row.workerId), warning.span.from, warning.span.to] } });
        });
    }
    // c. A WAGE THE SHEET CANNOT PRICE: a day of work with no daily rate. One man is said as
    // one man (fix round 1); more, in the sheet's own sentence.
    const unpriced = rows.filter(row => row.amount === null && row.attendanceDays > 0);
    const unpricedSay = unpriced.length === 1 ? PAYDAY_TEXT.unpricedOne(isolate(unpriced[0].name))
        : unpriced.length > 1 && typeof MONTH_SUMMARY_TEXT === 'object' ? MONTH_SUMMARY_TEXT.unpriced(unpriced.length, names(unpriced)) : null;
    if (unpricedSay) {
        checks.push({ kind: 'unpriced', workers: ids(unpriced), say: unpricedSay, lines: [],
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
            checks.push({ kind: 'endsToday', workers: ids(waiting),
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
            checks.push({ kind: 'review', workerId: String(row.workerId), who: String(row.name), say: warning, lines: [],
                door: { words: OWES_TEXT.advancesOf(isolate(row.name)), go: 'advancesOf', args: [String(row.workerId)] } });
        });
    }
    // f. EXTRA HOURS WITH NO HOURLY RATE - the sheet's sentence, and the men. WITHOUT its leading
    // «* »: on the sheet the star points at the starred amount, and the desk stars no figure.
    const hours = rows.filter(row => row.hoursUnpriced);
    if (hours.length && typeof HOURS_UNPRICED_NOTE === 'string') {
        checks.push({ kind: 'hoursUnpriced', workers: ids(hours), say: HOURS_UNPRICED_NOTE.replace(/^\*\s*/, ''), lines: [names(hours)],
            door: { words: PAYDAY_REUSED.roster, go: 'roster', args: [] } });
    }
    // g. WHAT «סגירת שבוע» WOULD HOLD THAT NOTHING ABOVE NAMES (fix round 1). The checks above
    // read the current period; «סגירת שבוע» reads each man's LAST FINISHED one - so a man who
    // handed an advance back in full inside a fortnight nobody closed (he owes nothing, and «שים
    // לב» is silent) is held for that earlier period, and a man with no daily rate who has no
    // day this period is held as unpriced, while the checks said nothing. Each such man, in
    // «סגירת שבוע»'s own sentence for him, with the door to what stops him.
    if (close) {
        close.held.forEach(man => {
            if (paydayHeldSaid(man, checks)) return;
            checks.push({ kind: 'held', workerId: man.id, held: man.kind, say: `${isolate(man.name)} · ${man.why}`, lines: [],
                door: paydayHeldDoor(man, today) });
        });
    }
    // h. THE FORGOTTEN ADVANCE: always last, and not a finding - an advance nobody typed cannot be
    // found, so the desk says so at the one moment it still matters. Never what makes «אין מה
    // לסדר» false (paydayNothing).
    checks.push({ kind: 'forgotten', say: PAYDAY_TEXT.forgotten, lines: [],
        door: { words: PAYDAY_REUSED.advances, go: 'advances', args: [] } });
    return checks;
}

// «לסגירה»: «סגירת שבוע»'s own list at this moment - the men it would offer, counted as the
// close reminder counts them, and the men it holds with the sentence it says for each, why it
// holds him (`kind`) and the period that is about (the earlier one it names, else his own). null
// where nothing may be closed at all (its gate: the record nobody approved, the carry shut).
function paydayClose(schedule, today, at, gate) {
    if (!gate || typeof weeklyCloseRead !== 'function') return null;
    const read = weeklyCloseRead(schedule, today, at);
    if (!read || read.gate !== true) return null;
    const count = typeof closeReminderCount === 'function' ? closeReminderCount(read)
        : read.men.filter(man => man && !man.held).length;
    const held = read.men.filter(man => man && man.held).map(man => ({ id: String(man.id), name: String(man.name),
        why: typeof weeklyCloseHeldText === 'function' ? weeklyCloseHeldText(man) : '',
        kind: String(man.held.kind),
        from: man.held.from || man.from,
        to: man.held.to || man.to }));
    // The owner's sentence for how many will close; with nobody to close and nobody held,
    // «סגירת שבוע»'s own. With nobody to close and men held, no sentence: the section says who
    // and why, and «אין עכשיו חשבונות לסגור» right above a list of men reads as nobody at all.
    const said = count > 0 && typeof CLOSE_REMINDER_TEXT === 'object' ? CLOSE_REMINDER_TEXT.line(count)
        : held.length ? null : WEEKLY_CLOSE_TEXT.nobody;
    return { count, held, say: said,
        door: count > 0 || held.length > 0
            ? { words: typeof CLOSE_REMINDER_TEXT === 'object' ? CLOSE_REMINDER_TEXT.open : WEEKLY_CLOSE_TEXT.entry, go: 'weeklyClose', args: [] }
            : null };
}

// Two cards or more whose payday is one date: under the LAST of them, once, that they are not
// added - in words that hold for two and for three (a man back on the fortnight has a stub of
// his own that ends with it).
function paydaySameDay(cards) {
    const byDate = {};
    cards.forEach(card => { (byDate[card.to] = byDate[card.to] || []).push(card); });
    Object.keys(byDate).forEach(date => {
        const same = byDate[date];
        if (same.length > 1) same[same.length - 1].lines.push(PAYDAY_TEXT.sameDay(same.length));
    });
}

function paydayRead(schedule, today, at) {
    const gate = carryReportingEnabled(schedule) === true;
    const facts = { gate, today, groups: [], checks: [], nothing: false, close: null, after: null };
    if (!schedule || typeof payrollRowsOver !== 'function') return facts;
    const spans = paydayGroupsOf(schedule, today, gate);
    const cards = spans.map(span => paydayCard(schedule, span, today, gate));
    paydaySameDay(cards);
    facts.groups = cards;
    facts.close = paydayClose(schedule, today, at, gate);
    facts.checks = paydayChecks(schedule, cards, spans, today, gate, facts.close);
    facts.nothing = paydayNothing(facts.checks, facts.close);
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
// record that moved, waiting for the draws to stop), the wait, which cards' «לפי עובד» are
// unfolded, check a's sentence as it was last drawn (`ready`), the control the keyboard was on
// when the body was taken away (`focus`), and the watch on the sync line (`watch`). Memory only.
let PAYDAY = null;

// The key a reading is kept under: owes.js's own (closeReminderKey's rule, js/ui/closereminder.js)
// - the write tick, today, both gates and the record as text - AND the deductions chosen on
// «דוחות» this session (fix round 1). A choice there («בחירת קיזוז מהשכר» … «הצג בדוח») moves the
// sheet's figure (payrollRowsOver reads REPORT_DEDUCTIONS) and nothing the record's key knows of:
// the desk read before it showed the full deduction after it, 200 ₪ from what the sheet said.
function paydayKey() {
    const today = todayStr();
    const record = typeof owesKey === 'function' ? owesKey(State.schedule, today)
        : `${typeof Store === 'object' && Store ? Store.tick : 0}|${today}|${JSON.stringify(State.schedule)}`;
    const chosen = typeof REPORT_DEDUCTIONS !== 'undefined' && REPORT_DEDUCTIONS && typeof REPORT_DEDUCTIONS.entries === 'function'
        ? JSON.stringify([...REPORT_DEDUCTIONS.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))) : '[]';
    return `${record}|${chosen}`;
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
    paydayUnwatch();
    PAYDAY = { open: true, state: 'reading', wait: null, folds: new Set(), ready: null, focus: null, watch: null };
    if (parts.title) parts.title.textContent = PAYDAY_TEXT.title;
    if (parts.close) parts.close.textContent = PAYDAY_REUSED.close;
    // A record that did not move since the last reading is drawn from it, reading nothing -
    // check a asked again (paydayLive).
    const kept = PAYDAY_KEPT && PAYDAY_KEPT.key === paydayKey() ? PAYDAY_KEPT.facts : null;
    if (kept) {
        PAYDAY.state = 'shown';
        paydayDraw(paydayLive(kept));
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
    paydayWatch();
    if (!kept) paydayLater(() => paydayShowRead(false));
    return true;
}

// THE SYNC LINE, WATCHED WHILE THE DESK IS OPEN (fix round 1). Check a is the phone's state -
// the signal on a building site comes and goes - and a status changes the line under the board
// (#storageNotice, js/sync/status.js) without a render(). So while the desk is open it follows
// that line the way the sync chip does (watchSyncNotice, js/app.js): a change there asks
// renderPaydayIfOpen, which draws again only when check a now says something else. Nothing
// is watched while the desk is shut.
function paydayWatch() {
    if (!PAYDAY || typeof MutationObserver !== 'function' || typeof document === 'undefined' || !document.getElementById) return;
    const notice = document.getElementById('storageNotice');
    if (!notice) return;
    PAYDAY.watch = new MutationObserver(() => renderPaydayIfOpen());
    PAYDAY.watch.observe(notice, { childList: true, characterData: true, subtree: true });
}

function paydayUnwatch() {
    if (PAYDAY && PAYDAY.watch) PAYDAY.watch.disconnect();
    if (PAYDAY) PAYDAY.watch = null;
}

// `leaving`: a door is taking the person somewhere else, and the focus goes where it goes.
function closePayday(leaving) {
    const parts = paydayParts();
    if (PAYDAY && PAYDAY.wait) clearTimeout(PAYDAY.wait);
    paydayUnwatch();
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
    // The control the keyboard is on is about to be drawn again as a new node (fix round 1: it
    // fell to <body>, outside the dialog). Found again by what it is, or the title.
    const focus = paydayFocusKey(parts.body);
    const held = PAYDAY.focus;
    PAYDAY.focus = null;
    PAYDAY.state = 'shown';
    paydayDraw(paydayLive(facts));
    if (parts.body && parts.body.style) parts.body.style.minHeight = '';
    if (keepScroll && content) content.scrollTop = at;
    paydayRefocus(parts, focus !== null ? focus : held);
}

// What has the keyboard inside the desk's body, said so that the same control can be found
// after the body is drawn again: its key (a fold by its card, a door by where it goes), '' for
// anything else in the body, null when the keyboard is not in the body at all.
function paydayFocusKey(body) {
    const active = typeof document !== 'undefined' ? document.activeElement : null;
    if (!active || !body || typeof body.contains !== 'function' || !body.contains(active)) return null;
    return (active.dataset && active.dataset.focus) || '';
}

// The keyboard back on the control with that key, or on the title when it is gone. Nothing
// when it was not in the body (`key` null): the title and «סגור» are the frame's, never drawn again.
function paydayRefocus(parts, key) {
    if (key === null || key === undefined || !parts.body) return;
    const found = key && parts.body.querySelectorAll
        ? [...parts.body.querySelectorAll('.payday-fold, .payday-door')].filter(node => node.dataset && node.dataset.focus === key)[0] : null;
    const target = found || parts.title;
    if (target && target.focus) target.focus({ preventScroll: true });
}

// render() asks this (js/app.js), and so does the sync line while the desk is open. A record
// that did not move draws nothing new - unless check a, which is the phone's state and not the
// record's, now says something else: then the kept reading is drawn again, the scroll and the
// keyboard where they were. One that moved puts the placeholder over every figure at once - a
// figure of the record before is never shown as current - and is read again once the draws have
// stopped for PAYDAY_QUIET_MS, with the dialog left where it was scrolled to. A new calendar day
// is a record that moved: today is in the key.
function renderPaydayIfOpen() {
    if (!paydayIsOpen() || PAYDAY.state === 'reading') return;
    const key = paydayKey();
    if (PAYDAY_KEPT && PAYDAY_KEPT.key === key) {
        if (PAYDAY.state === 'stale') {
            if (PAYDAY.wait) clearTimeout(PAYDAY.wait);
            PAYDAY.wait = null;
            paydayShowRead(true);
            return;
        }
        const ready = paydayReadyCheck(PAYDAY_KEPT.facts.close, PAYDAY_KEPT.facts.groups);
        if ((ready ? ready.say : null) !== PAYDAY.ready) paydayShowRead(true);
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
// body keeps the height it had, so the dialog is not thrown back to its top meanwhile, and the
// sentence STICKS TO THE TOP OF WHAT IS ON THE GLASS (fix round 1: drawn at the body's top, it
// stood 1,144px above the visible part of a desk scrolled down to «לפני שסוגרים», and the
// dialog read as an empty white box for as long as the commits kept coming). The keyboard, if
// it was on a control of the body, waits on the title meanwhile and goes back after the read.
function paydayPlaceholder(hold) {
    const parts = paydayParts();
    if (!parts.body) return;
    const height = hold && parts.body.getBoundingClientRect ? parts.body.getBoundingClientRect().height : 0;
    if (hold && PAYDAY) {
        const focus = paydayFocusKey(parts.body);
        if (focus !== null) {
            PAYDAY.focus = focus;
            if (parts.title && parts.title.focus) parts.title.focus({ preventScroll: true });
        }
    }
    clear(parts.body);
    const said = el('p', hold ? 'payday-reading payday-reading-held' : 'payday-reading',
        typeof WEEKLY_CLOSE_TEXT === 'object' ? WEEKLY_CLOSE_TEXT.reading : '');
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

// A door, with the key it is found again by after the body is drawn again (paydayRefocus).
function paydayDoorButton(door, key) {
    const node = button(door.words, 'btn-secondary payday-door', () => paydayGo(door));
    node.dataset.focus = key;
    return node;
}

// The band's first cell, drawn so that its count never breaks from its word: «סה״כ לתשלום · 3»
// over «עובדים» was a line about another number (fix round 1). The text is the sheet's own,
// character for character; only the count and its word are kept on one line.
function paydayCountNode(count) {
    const node = el('p', 'payday-count');
    const at = count.lastIndexOf(' · ');
    if (at === -1) { node.textContent = count; return node; }
    node.appendChild(el('span', null, count.slice(0, at + 3)));
    node.appendChild(el('span', 'payday-count-n', count.slice(at + 3)));
    return node;
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
    node.appendChild(paydayCountNode(card.count));
    card.lines.forEach(line => node.appendChild(el('p', 'payday-card-line', line)));
    // «לפי עובד»: a button and not a <details>, because the dialogs' Tab trap (js/ui/modal.js)
    // knows buttons and fields (monthsummary.js's reason). Unfolded in place: the button stays
    // the same node under the finger and the keyboard. Its name says WHICH group's men it
    // unfolds (fix round 1: two cards, two buttons of one name) - its words, then the group's
    // cycle and dates - and the open one is marked on the glass (css/design.css).
    const id = `paydayMen${at}`;
    const open = Boolean(PAYDAY && PAYDAY.folds.has(card.key));
    const fold = button(PAYDAY_REUSED.byWorker, 'btn-secondary payday-fold', () => {
        const list = document.getElementById(id);
        if (!list || !PAYDAY) return;
        const show = list.hidden === true;
        list.hidden = !show;
        fold.setAttribute('aria-expanded', show ? 'true' : 'false');
        if (show) PAYDAY.folds.add(card.key); else PAYDAY.folds.delete(card.key);
    }, `${PAYDAY_REUSED.byWorker} · ${PAY_CYCLE_LABELS[card.cycle] || ''} · ${card.range}`);
    fold.setAttribute('aria-expanded', open ? 'true' : 'false');
    fold.setAttribute('aria-controls', id);
    fold.dataset.focus = `fold|${card.key}`;
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
    if (check.door) {
        node.appendChild(paydayDoorButton(check.door,
            `check|${check.kind}|${check.workerId || ''}|${check.door.go}|${JSON.stringify(check.door.args || [])}`));
    }
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
    // Check a as drawn now, so that a change of the phone's state is seen (renderPaydayIfOpen).
    const ready = facts.checks.filter(check => check.kind === 'notReady')[0];
    if (PAYDAY) PAYDAY.ready = ready ? ready.say : null;

    // The cards first: the dialog opens on «לתשלום» (fix round 1), and what qualifies every
    // figure is said once, under them.
    const next = paydaySection('next', T.next);
    if (!facts.groups.length) next.appendChild(el('p', 'payday-none', T.none));
    facts.groups.forEach((card, at) => next.appendChild(paydayCardNode(card, at)));
    if (facts.groups.length) next.appendChild(el('p', 'payday-sofar', T.soFar));
    parts.body.appendChild(next);

    const before = paydaySection('before', T.before);
    facts.checks.filter(check => check.kind !== 'forgotten').forEach(check => before.appendChild(paydayCheckNode(check)));
    if (facts.nothing) before.appendChild(el('p', 'payday-nothing', T.nothing));
    // h, last and quiet - drawn as a check, in the look of a note.
    facts.checks.filter(check => check.kind === 'forgotten').forEach(check => before.appendChild(paydayCheckNode(check)));
    parts.body.appendChild(before);

    if (!facts.close) {
        // The record may not be read the new way: no count, no closes, «מקדמות»'s own sentence.
        parts.body.appendChild(el('p', 'hint hint-warn payday-gate', OWES_REUSED.checkFirst));
        parts.body.appendChild(el('p', 'payday-lead', T.lead));
        return;
    }
    // «לסגירה», said ONCE A REASON (fix round 1: on a Thursday morning before today was typed,
    // check d's sentence came back once a man - thirteen times - in a red list, under «אין עכשיו
    // חשבונות לסגור»). The men check d already names are counted in one line, in the warning's
    // look: today not typed yet is the routine of the morning, not a fault. Every other man
    // «סגירת שבוע» holds is a line of his own, in its own words, as before.
    const close = paydaySection('close', T.toClose);
    if (facts.close.say) close.appendChild(el('p', 'payday-close-say', facts.close.say));
    const named = facts.checks.filter(check => check.kind === 'endsToday').reduce((all, check) => all.concat(check.workers), []);
    const today = facts.close.held.filter(man => man.kind === 'endsToday' && named.indexOf(man.id) !== -1);
    const others = facts.close.held.filter(man => today.indexOf(man) === -1);
    if (today.length) close.appendChild(el('p', 'payday-held-today', T.heldToday(today.length)));
    if (others.length) {
        const held = el('div', 'payday-held');
        held.appendChild(el('strong', 'payday-held-head', WEEKLY_CLOSE_TEXT.stateHeld));
        others.forEach(man => {
            const line = el('p', 'payday-held-man');
            line.dataset.worker = man.id;
            line.textContent = man.why ? `${isolate(man.name)} · ${man.why}` : isolate(man.name);
            held.appendChild(line);
        });
        close.appendChild(held);
    }
    if (facts.close.door) close.appendChild(paydayDoorButton(facts.close.door, `close|${facts.close.door.go}`));
    parts.body.appendChild(close);

    if (facts.after && facts.after.length) {
        const after = paydaySection('after', T.after);
        const doors = el('div', 'payday-doors');
        facts.after.forEach(door => doors.appendChild(paydayDoorButton(door, `after|${door.go}`)));
        after.appendChild(doors);
        parts.body.appendChild(after);
    }
    // What the desk is, last and quiet: it shows, and nothing is recorded from it.
    parts.body.appendChild(el('p', 'payday-lead', T.lead));
}

// ================================================================== the doors
//
// EVERY DOOR CLOSES THE DESK FIRST, then calls the target's own opener - and WHEN depends on
// what the target is. js/ui/modal.js gives the keyboard back to the desk's opener from a
// MutationObserver, at the microtask checkpoint after the whole block that shut the last dialog:
//
//   - a target that is a DIALOG («סגירת שבוע», «תלוש לכל עובד») is opened in the SAME task and
//     its title focused by hand: modal.js never sees a moment with no dialog open, so it neither
//     enters the new one nor forgets the button the desk was opened from (siteCardGoMan's note,
//     js/ui/sitecard.js);
//   - a target that is anything else - a view, a page of «מקדמות» - runs ONE TASK LATER, after
//     that checkpoint (whatsNewGo's rule, js/ui/whatsnew.js), so that whatever the target
//     focuses keeps the focus and nothing is left on a node of the shut desk.
//
// None writes anything; the payslips write only what their own opener writes.
function paydayGo(door) {
    if (!door) return false;
    const args = door.args || [];
    closePayday(true);
    if (door.go === 'weeklyClose' || door.go === 'payslips') return paydayOpenDialog(door.go, args);
    setTimeout(() => paydayGoView(door.go, args), 0);
    return true;
}

function paydayOpenDialog(go, args) {
    const titled = id => {
        const heading = document.getElementById(id);
        if (heading && heading.focus) heading.focus({ preventScroll: true });
    };
    if (go === 'weeklyClose') {
        if (typeof openWeeklyClose === 'function' && openWeeklyClose()) titled('weeklyCloseTitle');
        return true;
    }
    if (typeof openPayslips === 'function' && openPayslips(args[0])) titled('payslipsTitle');
    return true;
}

// h's door lands where an advance is recorded (fix round 1). On a desk opened from «מקדמות» it
// was a «סגור» under another name: the page stayed at its top and the keyboard fell to <body>.
// Now «מקדמות»'s list of men - under its line «בחר עובד כדי להוסיף מקדמה…» and its search - is
// brought onto the glass (centred, as «מה חדש» brings its places: clear of the fixed bars), and
// the keyboard is put on the first man: never on the search field, which would raise a phone's
// keyboard over the very list it searches. Nothing is pressed and nothing is written.
function paydayToAdvanceList() {
    if (typeof document === 'undefined' || !document.getElementById) return;
    const root = document.getElementById('advancesView');
    const first = root && root.querySelector ? root.querySelector('.advance-workers .advance-worker-card') : null;
    if (!first) return;
    const search = root.querySelector('input[type="search"]');
    const place = search || first;
    if (place.scrollIntoView) place.scrollIntoView({ block: 'center', behavior: 'instant' });
    if (first.focus) first.focus({ preventScroll: true });
}

function paydayGoView(go, args) {
    switch (go) {
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
        paydayToAdvanceList();
        return true;
    case 'closures':
        owesOpenPage('closures');
        return true;
    default:
        return false;
    }
}
