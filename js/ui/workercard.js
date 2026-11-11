// כרטיס עובד - one man, on one screen: who he is, what his open period stands at, what he
// owes, where he has been. Opened from his row on the crew screen.
//
// IT IS A READING, AND ONLY A READING. Nothing here commits, nothing here touches Store,
// and there is not a field or a switch on it: the two buttons under it go to the screens
// where a change is made, and make none themselves. tests/workercard.test.mjs holds the
// whole disk byte for byte across opening it for every man.
//
// AND IT WORKS NOTHING OUT. A card that added up a man's days for itself would be the
// fifth surface pricing one fortnight, and this app has already paid for the other four
// disagreeing (see workerAccountFor in js/ui/reports.js). So every figure on it is asked
// of the function the pay sheet asks:
//
//   the period            periodRangeFor                        js/dates.js
//   its row and its cells payrollRows -> payrollGroupTable      js/ui/reports.js
//                         (or financeLineText for a man with money and no days) -
//                         the card READS THE SHEET'S OWN CELLS, it does not format any
//   what explains the row moneyNotes                            js/ui/reports.js
//   what he owes now      openAdvanceBalance                    js/model/schema.js
//   his credit            workerAccountFor                      js/ui/reports.js
//   the movements         ledgerEntries / advanceHistory        js/model/ledger.js
//   where he worked       workerDaysReport                      js/model/money.js
//
// THE GATE COMES WITH THE FUNCTION. payrollRows, workerAccountFor and openAdvanceBalance
// each ask carryReportingEnabled(schedule) themselves, so on a record whose migration
// nobody has approved the card says what the sheet, the statement and the archive
// sentence say there - the arithmetic this build has always printed
// (tests/approval.test.mjs). The card asks that predicate itself for one thing only:
// which WORDS stand over what he owes, because before approval the figure is what was
// handed over and not what is left. (How often the predicate is really run during one
// reading is workerCardScope's business, below.)

// ---------------------------------------------------------------- the words
//
// Every Hebrew string this file adds, in one block. PROPOSED, not approved: the owner has
// not read them. Pinned word for word in tests/workercard.test.mjs, so changing one is a
// decision. Everything else on the card is a word some other screen already says, taken
// from where that screen keeps it (WORKER_CARD_REUSED, below) and never retyped into a
// sentence of its own.
const WORKER_CARD_TEXT = {
    // The control on the crew row, and the head of the card.
    title: 'כרטיס עובד',
    // The control's accessible name: these words, then the man's name.
    openFor: 'כרטיס עובד של',
    moves: 'תנועות אחרונות',
    noMoves: 'אין תנועות רשומות.',
    strip: '14 הימים האחרונים',
    month: 'ימים בכל אתר החודש',
    // --- the two doors under his phone number. Words on a button, never a sentence: the
    // app opens the dialler or his chat and claims nothing about what happened there.
    call: 'התקשר',
    whatsapp: 'וואטסאפ',
    // their accessible names: these words, then the man's name
    callFor: 'התקשר אל',
    whatsappFor: 'וואטסאפ אל',
    // --- the month, drawn as a calendar
    calendar: 'לוח החודש',
    months: ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
        'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'],
    prevMonth: 'חודש קודם',
    nextMonth: 'חודש הבא',
    thisMonth: 'חזרה לחודש הנוכחי',
    // over the count of days per site when the calendar is on another month - the month's
    // name stands beside it. On the current month the heading is `month`, above.
    monthOther: 'ימים בכל אתר',
    // the Saturdays of the month that hold a record: the calendar, like the week screen,
    // draws no Saturday column, and a day with a record is never left off the card
    saturdays: 'ימי שבת עם רישום',
    openDay: 'לחיצה על יום פותחת אותו במסך היום.'
};

// The words the card borrows, each beside the screen that owns it. They are repeated
// here rather than read off those screens because those screens build them inline;
// tests/workercard.test.mjs finds every one of them in its owner's source, so a word
// changed there and not here fails by name.
const WORKER_CARD_REUSED = {
    weekly: 'תשלום שבועי',                 // js/ui/roster.js, the crew row
    biweekly: 'תשלום כל שבועיים',          // js/ui/roster.js, the crew row
    noPhone: 'בלי טלפון',                  // js/ui/roster.js, the crew row
    inactive: 'לא פעיל',                   // js/ui/roster.js, the crew row
    recorded: 'מקדמות רשומות',             // js/ui/roster.js, the archived row
    dailyRate: 'שכר יומי',                 // js/ui/reports.js, the sheet's column
    hourlyRate: 'שכר לשעה נוספת',          // index.html, the worker form
    period: 'התקופה הנוכחית',              // js/ui/reports.js, the settlement
    nothing: 'אין רישומים בטווח הזה.',     // js/ui/reports.js, the sheet
    noDays: 'אין ימי עבודה בתקופה הזו.',   // js/ui/reports.js, the sheet
    advances: 'מקדמות',                    // js/ui/reports.js, the advances screen
    left: 'נשאר להחזיר',                   // js/ui/reports.js, the advances screen
    absent: 'נעדר',                        // js/ui/reports.js, the sheet's column
    report: 'שכר - לפי עובד',              // js/ui/reports.js, the sheet's heading
    badPhone: 'אין מספר טלפון תקין',       // js/ui/seder.js, the seder's row
    attended: 'נוכחות',                    // js/ui/reports.js, the sheet's column
    double: 'כפול',                        // js/ui/week.js, the week's cell
    extra: 'נוספות',                       // js/ui/week.js, the week's cell
    blank: 'ללא רישום',                    // js/ui/week.js, the day's detail
    marks: '\u25CF = יום כפול \u00B7 + = שעות נוספות \u00B7 \u2014 = נעדר'   // js/ui/week.js, under the grid
};

// How many movements. "The last few": enough to see what happened lately, few enough
// that the whole history stays where it is kept - on his advances screen, one tap away.
const WORKER_CARD_MOVES = 5;
// The strip is a fortnight, whatever his cycle: it is about where he was, not about pay.
const WORKER_CARD_STRIP_DAYS = 14;

// The marks inside a day of the calendar. The week screen's own three, with the meaning
// its own line under the grid gives them (WORKER_CARD_REUSED.marks) - there they are
// drawn by the stylesheet, here they are text, because a letter a far-sighted man is
// meant to read is not decoration.
const WORKER_CARD_MARKS = { double: '\u25CF', extra: '+', absent: '\u2014' };

// Whose card is open, or null. Memory only - a reload closes the card, and nothing
// about it is kept anywhere.
let WORKER_CARD_ID = null;
// Which month the calendar is on, 'YYYY-MM', or null for the month today is in. Memory
// only, like the card itself, and put back to null each time a card is opened.
let WORKER_CARD_MONTH = null;

// ---------------------------------------------------------------- the reading

// THE SHEET'S OWN FUNCTIONS, POINTED AT ONE MAN'S PERIOD.
//
// payrollRows, moneyOf, rateOf, moneyNotes and workerAccountFor all read the report's
// range and its worker filter off REPORT_RANGE and REPORT_WORKERS - they take no
// arguments, because the sheet is the only thing that has ever called them. The choice
// was to copy their arithmetic with a range parameter, or to ask them. Copying is how
// two surfaces come to disagree, so they are asked: the range is pointed at this man's
// period, they answer, and the range is put back - in one synchronous step with nothing
// drawn in between, and in a finally, so a throw cannot leave the reports screen on a
// range nobody chose. REPORT_DEDUCTIONS is left alone on purpose: a deduction somebody
// has already chosen for this period on the sheet is part of what the sheet says, and
// the card must say the same.
//
// AND THE GATE IS ASKED ONCE FOR THE WHOLE READING, by the gate's own function.
//
// Every one of those readers asks carryReportingEnabled(schedule) for itself - which is
// right, and is why the card cannot get ahead of an approval - and one card is five or
// six of them. The question is not cheap: it re-plans the migration, and the plan walks
// every man's accounts forward (for a man whose balance has not cleared, measured on
// this build, some four thousand fortnights; see planAdvanceCarry). Asked six times that
// was half a second on a desk and seconds on a phone, between a tap and a card. Inside
// this one synchronous step the record cannot change, so the answer cannot either: the
// first reader's answer, from the real function, is the answer the others are given, and
// the real function is put back in the same finally as the range. A different schedule
// is never answered from memory. tests/workercard.test.mjs holds that the function on
// the page afterwards is the one that was there before, throw or no throw.
function workerCardScope(workerId, period, read) {
    const held = { from: REPORT_RANGE.from, to: REPORT_RANGE.to, workers: REPORT_WORKERS };
    const ask = carryReportingEnabled;
    const asked = State.schedule;
    let answered = false;
    let answer = false;
    REPORT_RANGE.from = period.from;
    REPORT_RANGE.to = period.to;
    REPORT_WORKERS = new Set([String(workerId)]);
    carryReportingEnabled = schedule => {
        if (schedule !== asked) return ask(schedule);
        if (!answered) { answer = ask(schedule); answered = true; }
        return answer;
    };
    try {
        return read();
    } finally {
        carryReportingEnabled = ask;
        REPORT_RANGE.from = held.from;
        REPORT_RANGE.to = held.to;
        REPORT_WORKERS = held.workers;
    }
}

// His row of the pay sheet over his open period: the cells as the sheet prints them.
//
// `pay` is the work table's row, header by header - built by payrollGroupTable over the
// one row, exactly as the sheet builds it when the report is narrowed to him, and then
// READ, the way the phone's pay cards read it (renderReportCards). `finance` is the line
// the sheet writes instead for a man with money in the period and no day in it. One or
// the other or neither; never both, because payrollDisplaySplit is disjoint.
function workerCardPeriod(worker) {
    const row = payrollRows()
        .filter(item => String(item.workerId) === String(worker.id))[0] || null;
    // The one account reader, with its own gate: null unless the record may be read the
    // new way AND this range is his whole period - which it is by construction.
    const account = workerAccountFor(worker.id);
    const out = { pay: null, finance: null, notes: [], account };
    if (!row) return out;

    if (payrollDisplaySplit([row]).work.length === 0) {
        // The notes are already inside this line - financeLineText ends with them.
        out.finance = financeLineText(row, deductionColumnName([row]));
        return out;
    }
    const table = payrollGroupTable([row]).querySelector('table');
    const cells = table.querySelector('tbody tr').children;
    out.pay = [...table.querySelectorAll('thead th')].map((head, index) => ({
        label: head.textContent,
        value: cells[index] ? cells[index].textContent : ''
    })).slice(1);                           // the first cell is his name, which heads the card
    out.notes = moneyNotes(row);
    return out;
}

// What he owes now, and under which words.
//
// openAdvanceBalance is the figure this app puts in front of somebody before a man is put
// away, and it carries its own gate: the fold - less cash handed back, less what came off
// his wage, less his credit - once the record may be read that way, and before that the
// sum of what was handed over, which is all a record nobody has approved can honestly
// say. The words follow the figure: «נשאר להחזיר» is a claim about what is left and is
// only made when the figure is one; before approval it is «מקדמות רשומות», the crew
// screen's words for an amount on a date with nothing marking it settled.
function workerCardOwed(worker) {
    const open = openAdvanceBalance(State.schedule, worker.id);
    const folded = carryReportingEnabled(State.schedule) === true;
    return {
        label: folded ? WORKER_CARD_REUSED.left : WORKER_CARD_REUSED.recorded,
        amount: `${moneyText(open ? open.total : 0)} ₪`
    };
}

// His credit, in the two phrases v180 named it by and under the conditions the statement
// and the sheet print it (workerStatementText, moneyNotes): what he opened the period in
// credit, and what he goes on in credit. Nothing for nearly everybody.
function workerCardCredit(account) {
    const lines = [];
    if (!account) return lines;
    if (account.creditIn > 0) {
        lines.push({ label: ADVANCE_CREDIT_FROM_BEFORE,
            amount: `${moneyText(account.creditIn)} ₪` });
    }
    if (account.gross !== null && account.creditForward > 0) {
        lines.push({ label: ADVANCE_CREDIT_LABEL,
            amount: `${moneyText(account.creditForward)} ₪` });
    }
    return lines;
}

// The last few movements of his advances, newest first.
//
// The ledger's entries that concern him, chosen and ordered the way his full history
// chooses and orders them (renderWorkerLedger) - and beside them any advance that has no
// origin entry yet. That second half is not decoration: an advance recorded in this
// session with the ledger writer shut lives only in schedule.advances until the next
// boot mirrors it, and a card that listed the ledger alone would leave out the money
// handed over this evening, which is the movement most likely to be asked about.
function workerCardMoves(worker) {
    const id = String(worker.id);
    let entries = [];
    const seen = [];
    if (typeof ledgerEntries === 'function' && typeof advanceHistory === 'function') {
        ledgerEntries(State.schedule).forEach(entry => {
            if (String(entry.workerId || '') !== id) return;
            if (seen.indexOf(String(entry.advanceId)) === -1) seen.push(String(entry.advanceId));
        });
        seen.forEach(advance => {
            entries = entries.concat(advanceHistory(State.schedule, advance));
        });
    }
    advancesFor(State.schedule, worker.id, '0000-01-01', '9999-12-31').forEach(item => {
        const mirrored = typeof advanceHasOrigin === 'function'
            && advanceHasOrigin(State.schedule, item.id);
        if (mirrored) return;
        entries.push({ id: String(item.id), kind: 'given', date: item.date, amount: item.amount });
    });

    entries.sort((a, b) => {
        const at = String(a.at || a.date || '');
        const bt = String(b.at || b.date || '');
        if (at !== bt) return at < bt ? -1 : 1;
        return String(a.id) < String(b.id) ? -1 : 1;
    });

    return entries.slice(-WORKER_CARD_MOVES).reverse().map(entry => {
        const parsed = parseLocalDate(entry.date);
        const amount = Number(entry.amount);
        return {
            label: LEDGER_KIND_LABELS[entry.kind] || String(entry.kind || ''),
            date: parsed ? formatFullDate(parsed) : '',
            // A cancellation states no amount, and then none is shown - the same rule
            // his full history draws by.
            amount: entry.amount !== undefined && isFinite(amount)
                ? `${bidiAmount(moneyText(amount))} ₪` : ''
        };
    });
}

// Where he was: the last fourteen days one by one, and this calendar month site by site.
//
// Both are read off workerDaysReport - the list his own statement is written from - so a
// day is on the strip exactly when it is on the statement, absences included. ONE map of
// site names for the whole card, over the one span that covers both halves: a site that
// left the list is named «אתר שאינו ברשימה N» by its place in a span, and two spans on
// one card could give one site two names.
function workerCardPlaces(worker, today, labels) {
    const stripFrom = shiftDate(today, -(WORKER_CARD_STRIP_DAYS - 1));
    const here = workerCardMonthSpan(today.slice(0, 7));
    const monthFrom = here.from;
    const monthTo = here.to;
    const sitesOf = day => {
        const ids = [];
        (day.entries || []).forEach(entry => {
            const id = String(entry.placeId);
            if (ids.indexOf(id) === -1) ids.push(id);
        });
        return ids;
    };

    const recorded = {};
    workerDaysReport(State.schedule, worker, stripFrom, today)
        .forEach(day => { recorded[day.date] = day; });
    const strip = [];
    for (let back = 0; back < WORKER_CARD_STRIP_DAYS; back += 1) {
        const date = shiftDate(today, -back);
        const parsed = parseLocalDate(date);
        const day = recorded[date];
        strip.push({
            date,
            when: `${HEBREW_DAY_LETTERS[parsed.getDay()]} ${formatShortDate(parsed)}`,
            absent: Boolean(day && day.absent),
            sites: day && !day.absent
                ? sitesOf(day).map(id => ({ id, name: placeLabelFrom(labels, id) })) : []
        });
    }

    // A day at two sites is a day at each of them - which is what "how many days was he
    // at this site" asks - so the counts can add up to more than his days of attendance.
    const counts = {};
    const order = [];
    workerDaysReport(State.schedule, worker, monthFrom, monthTo)
        .filter(day => !day.absent)
        .forEach(day => sitesOf(day).forEach(id => {
            if (counts[id] === undefined) { counts[id] = 0; order.push(id); }
            counts[id] += 1;
        }));
    const month = order
        .map(id => ({ id, name: placeLabelFrom(labels, id), days: counts[id] }))
        .sort((a, b) => b.days - a.days);

    return { strip, month };
}

// ---------------------------------------------------------------- the month, as a calendar

// 'YYYY-MM' to its first and last day.
function workerCardMonthSpan(key) {
    const year = Number(key.slice(0, 4));
    const month = Number(key.slice(5, 7)) - 1;
    return {
        year, month,
        from: toLocalDateStr(new Date(year, month, 1, 12)),
        to: toLocalDateStr(new Date(year, month + 1, 0, 12))
    };
}

function workerCardMonthStep(key, months) {
    const span = workerCardMonthSpan(key);
    return toLocalDateStr(new Date(span.year, span.month + months, 1, 12)).slice(0, 7);
}

// The month the calendar is on: the one somebody stepped to, or the one today is in.
function workerCardMonthKey(today) {
    return /^\d{4}-\d{2}$/.test(String(WORKER_CARD_MONTH)) ? WORKER_CARD_MONTH : today.slice(0, 7);
}

// THE COLUMNS ARE THE WEEK SCREEN'S, AND THEY ARE ASKED, NOT WRITTEN DOWN.
//
// This app's week does not open on Sunday: it opens on the Friday a pay week opens on
// (snapToWeekStart, js/dates.js), and the week screen draws its seven days from there
// with the Saturday left out (renderWeek: "Saturday is hidden here only"). The calendar
// is that screen stacked - each of its rows is one row of that grid for this man, and
// one pay week - so its columns are found the same way: the day the app's week starts
// on, then the six that follow, without the Saturday.
//
// A SATURDAY WITH A RECORD IS STILL ON THE CARD. The week screen can afford to hide the
// column because the day screen shows the day; a card that left a worked Saturday out
// would be a month that quietly says less than was done. Those days are listed under the
// grid, each one a way into its day like any cell (WORKER_CARD_TEXT.saturdays).
function workerCardWeekdays() {
    const first = snapToWeekStart(parseLocalDate(todayStr())).getDay();
    const days = [];
    for (let step = 0; step < 7; step += 1) {
        const day = (first + step) % 7;
        if (day !== 6) days.push(day);
    }
    return days;
}

// One day of his, as the calendar says it: where he was, in the order his day holds the
// sites, each with the letter and the mark the week's cell gives it - or that he was
// absent, or nothing. `day` is that date's line of workerDaysReport, the list his own
// statement is written from; undefined when the record holds nothing for him.
//
// `said` is the cell read aloud, built the way the week's cell builds its own label
// (renderWeekCell): the day, then each site by name with the word for its rate.
function workerCardDay(date, day, labels, today) {
    const parsed = parseLocalDate(date);
    const cell = {
        date,
        number: parsed.getDate(),
        weekday: parsed.getDay(),
        today: date === today,
        absent: Boolean(day && day.absent),
        sites: []
    };
    const said = [];
    if (cell.absent) said.push(WORKER_CARD_REUSED.absent);
    else if (day) {
        (day.entries || []).forEach(entry => {
            const id = String(entry.placeId);
            const name = placeLabelFrom(labels, id);
            const rate = entryRate(entry);
            const site = { id, name, initial: siteInitial(name), mark: '', word: '' };
            if (rate === RATE_DOUBLE) {
                site.mark = 'double';
                site.word = WORKER_CARD_REUSED.double;
            } else if (rate === RATE_EXTRA) {
                const hours = entryExtraHours(entry);
                site.mark = 'extra';
                site.word = hours ? plusAmount(hours) : WORKER_CARD_REUSED.extra;
            }
            said.push(site.word ? `${isolate(name)} ${site.word}` : isolate(name));
            cell.sites.push(site);
        });
    }
    if (said.length === 0) said.push(WORKER_CARD_REUSED.blank);
    cell.said = `${hebrewDayName(parsed)} ${formatFullDate(parsed)} · ${said.join(' · ')}`;
    return cell;
}

// His month: every day of it in rows of the app's week, the Saturdays that hold a record,
// the days per site and the two totals.
//
// One reading of workerDaysReport over the month - the reading the count per site has
// always been made from - so a day is in the grid exactly when it is counted under it.
// The two totals are counted the way the sheet counts its «נוכחות» and «נעדר» columns:
// a date with a site on it is one day of attendance however many sites and whatever its
// rate, and a date marked absent is one absence.
function workerCardCalendar(worker, today, key, labels) {
    const span = workerCardMonthSpan(key);
    const recorded = {};
    workerDaysReport(State.schedule, worker, span.from, span.to)
        .forEach(day => { recorded[day.date] = day; });

    const columns = workerCardWeekdays();
    const weeks = [];
    const saturdays = [];
    const counts = {};
    const order = [];
    let attended = 0;
    let absent = 0;
    let row = null;
    for (let date = span.from; date <= span.to; date = shiftDate(date, 1)) {
        const cell = workerCardDay(date, recorded[date], labels, today);
        if (cell.absent) absent += 1;
        else if (cell.sites.length > 0) {
            attended += 1;
            const seen = [];
            cell.sites.forEach(site => {
                if (seen.indexOf(site.id) !== -1) return;
                seen.push(site.id);
                if (counts[site.id] === undefined) { counts[site.id] = 0; order.push(site); }
                counts[site.id] += 1;
            });
        }
        const column = columns.indexOf(cell.weekday);
        if (column === -1) {
            if (cell.absent || cell.sites.length > 0) saturdays.push(cell);
            continue;
        }
        // A new row at the first column, and for the month's first days wherever they fall.
        if (row === null || column === 0) {
            row = columns.map(() => null);
            weeks.push(row);
        }
        row[column] = cell;
    }

    return {
        key,
        label: `${WORKER_CARD_TEXT.months[span.month]} ${span.year}`,
        current: key === today.slice(0, 7),
        columns: columns.map(day => HEBREW_DAY_LETTERS[day]),
        weeks,
        saturdays,
        sites: order.map(site => ({ id: site.id, name: site.name, days: counts[site.id] }))
            .sort((a, b) => b.days - a.days),
        attended,
        absent
    };
}

// The two doors under his number, or null when there is no number worth opening.
//
// The seder's own reading of a phone number (sederWaNumber, js/ui/seder.js), and its
// rule with it: only a number that is plainly an Israeli mobile, and never a guess - a
// guessed number is a stranger's phone ringing. The dialler is handed the same digits
// WhatsApp is, in the international form both understand.
function workerCardContact(phone) {
    const number = phone && typeof sederWaNumber === 'function' ? sederWaNumber(phone) : '';
    return number ? { tel: `tel:+${number}`, whatsapp: `https://wa.me/${number}` } : null;
}

// Everything the card says, as plain data, and nothing drawn. Split from the drawing so
// that the suite can hold each figure against the sheet's without a browser - and so
// that what is on the screen cannot be anything this did not return.
function workerCardFacts(workerId) {
    const worker = State.worker(workerId);
    if (!worker) return null;
    const today = todayStr();
    const period = periodRangeFor(worker, today);
    // Everything about money, in the one step - see workerCardScope.
    const money = workerCardScope(worker.id, period, () => {
        const reading = workerCardPeriod(worker);
        return {
            reading,
            owed: workerCardOwed(worker),
            credit: workerCardCredit(reading.account)
        };
    });
    const reading = money.reading;
    // ONE map of site names for everything on the card, over the one span that covers
    // the strip, this month and the month the calendar is on (see workerCardPlaces).
    const shown = workerCardMonthKey(today);
    const spans = [workerCardMonthSpan(today.slice(0, 7)), workerCardMonthSpan(shown)];
    const stripFrom = shiftDate(today, -(WORKER_CARD_STRIP_DAYS - 1));
    const labels = placeLabelsIn(State.schedule,
        [stripFrom, spans[0].from, spans[1].from].sort()[0],
        [today, spans[0].to, spans[1].to].sort()[2]);
    const places = workerCardPlaces(worker, today, labels);
    return {
        id: String(worker.id),
        name: worker.name,
        active: worker.active !== false,
        phone: worker.phone ? String(worker.phone) : '',
        contact: workerCardContact(worker.phone),
        cycle: period.cycle === 'weekly' ? WORKER_CARD_REUSED.weekly : WORKER_CARD_REUSED.biweekly,
        // The roster's rates today - what a day recorded from now on is stamped with.
        // What the days already recorded were paid at is in the period's own cells.
        dailyRate: worker.dailyRate ? String(worker.dailyRate) : '',
        hourlyRate: worker.hourlyRate ? String(worker.hourlyRate) : '',
        period: {
            from: period.from,
            to: period.to,
            // One left-to-right run, so the earlier date is on the left (dateRange).
            range: dateRange(formatFullDate(parseLocalDate(period.from)),
                formatFullDate(parseLocalDate(period.to)))
        },
        pay: reading.pay,
        finance: reading.finance,
        notes: reading.notes,
        owed: money.owed,
        credit: money.credit,
        moves: workerCardMoves(worker),
        strip: places.strip,
        month: places.month,
        calendar: workerCardCalendar(worker, today, shown, labels)
    };
}

// ---------------------------------------------------------------- the drawing
//
// textContent only, like every other screen: a name is text. No input, no select, no
// switch - the only things a finger can land on are the three buttons in the frame
// (index.html), and they are not rebuilt by a redraw, so a snapshot arriving from another
// phone while the card is open moves the figures and leaves the focus where it was.

function workerCardBlock(title, aside) {
    const block = el('section', 'wcard-block');
    const head = el('h4', 'wcard-head', title);
    if (aside) head.appendChild(el('span', 'wcard-aside', aside));
    block.appendChild(head);
    return block;
}

function workerCardPair(label, value, className) {
    const pair = el('div', className || 'wcard-pair');
    pair.appendChild(el('span', 'wcard-label', label));
    pair.appendChild(el('strong', 'wcard-value', value));
    return pair;
}

function workerCardSite(site) {
    const chip = el('span', 'wcard-site');
    paintSite(chip, site.id);
    return appendSiteName(chip, site.id, site.name);
}

function drawWorkerCard() {
    const body = document.getElementById('workerCardBody');
    const title = document.getElementById('workerCardTitle');
    if (!body || !title) return;
    const facts = WORKER_CARD_ID === null ? null : workerCardFacts(WORKER_CARD_ID);
    // He left the record while the card was open - deleted on another phone. A card
    // about nobody closes; it does not keep showing a man who is not there.
    if (!facts) { closeWorkerCard(); return; }
    // WHAT THE FINGER OR THE KEYBOARD WAS ON, kept across the redraw. The body is built
    // again from nothing - by a step of the calendar, and by any snapshot another phone
    // sends while the card is open - and the control that had the focus is then no longer
    // on the page. Each control in the body carries a key; the one drawn under the same
    // key takes the focus back, without a scroll.
    const active = document.activeElement;
    const held = active && active.dataset && body.contains && body.contains(active)
        ? active.dataset.wcardKey : '';

    title.textContent = `${WORKER_CARD_TEXT.title} · ${facts.name}`;
    clear(body);

    // Who he is: the crew row's own line, in the crew row's own words.
    const who = el('div', 'wcard-who');
    if (!facts.active) who.appendChild(el('span', 'badge', WORKER_CARD_REUSED.inactive));
    const contact = el('div', 'wcard-line');
    if (facts.phone) {
        contact.appendChild(el('span', null, '📞 '));
        contact.appendChild(ltr(facts.phone));
        // A number is written and no door can be made of it: said, in the seder's words
        // for exactly that, so the missing buttons are not a puzzle.
        if (!facts.contact) contact.appendChild(el('span', 'wcard-bad-phone', ` · ${WORKER_CARD_REUSED.badPhone}`));
    } else {
        contact.appendChild(el('span', null, WORKER_CARD_REUSED.noPhone));
    }
    who.appendChild(contact);
    who.appendChild(el('div', 'wcard-line', facts.cycle));
    const rates = el('div', 'wcard-line');
    rates.appendChild(el('span', null, `${WORKER_CARD_REUSED.dailyRate}: `));
    rates.appendChild(facts.dailyRate ? ltr(facts.dailyRate) : el('span', null, '—'));
    if (facts.hourlyRate) {
        rates.appendChild(el('span', null, ` · ${WORKER_CARD_REUSED.hourlyRate}: `));
        rates.appendChild(ltr(facts.hourlyRate));
    }
    who.appendChild(rates);
    body.appendChild(who);

    // CALL HIM, OR OPEN HIS CHAT. Two real links, so the phone opens the dialler or
    // WhatsApp inside the person's own tap (iOS opens nothing for a navigation that does
    // not come from one). Only when the number is one the seder would use: a man with no
    // number, or one that cannot be read, has the words above and no dead button.
    if (facts.contact) {
        const doors = el('div', 'wcard-contact');
        const call = el('a', 'btn-secondary wcard-door wcard-call', WORKER_CARD_TEXT.call);
        call.href = facts.contact.tel;
        call.setAttribute('aria-label', `${WORKER_CARD_TEXT.callFor} ${isolate(facts.name)}`);
        call.dataset.wcardKey = 'call';
        doors.appendChild(call);
        const chat = el('a', 'btn-success wcard-door wcard-whatsapp', WORKER_CARD_TEXT.whatsapp);
        chat.href = facts.contact.whatsapp;
        chat.target = '_blank';
        chat.rel = 'noopener noreferrer';
        chat.setAttribute('aria-label', `${WORKER_CARD_TEXT.whatsappFor} ${isolate(facts.name)}`);
        chat.dataset.wcardKey = 'whatsapp';
        doors.appendChild(chat);
        body.appendChild(doors);
    }

    // His open period, as the pay sheet has it.
    const period = workerCardBlock(WORKER_CARD_REUSED.period, facts.period.range);
    if (facts.pay) {
        const grid = el('div', 'wcard-figures');
        // A zero is blank on the sheet so the eye lands on what matters in a table of
        // thirty men; alone on a card a blank reads as missing, so it is drawn as the 0
        // it is - the same step the sheet's own phone cards take.
        facts.pay.forEach(cell => grid.appendChild(workerCardPair(cell.label, cell.value || '0')));
        period.appendChild(grid);
        facts.notes.forEach(note => period.appendChild(el('p', 'hint hint-money wcard-note', note)));
    } else if (facts.finance) {
        period.appendChild(el('p', 'hint hint-money wcard-note', WORKER_CARD_REUSED.noDays));
        period.appendChild(el('p', 'wcard-finance', facts.finance));
    } else {
        period.appendChild(emptyHint(WORKER_CARD_REUSED.nothing));
    }
    body.appendChild(period);

    // His advances: what stands now, then what moved lately.
    const money = workerCardBlock(WORKER_CARD_REUSED.advances);
    money.appendChild(workerCardPair(facts.owed.label, facts.owed.amount, 'wcard-pair wcard-owed'));
    facts.credit.forEach(line => money.appendChild(
        workerCardPair(line.label, line.amount, 'wcard-pair wcard-owed')));
    money.appendChild(el('h5', 'wcard-sub', WORKER_CARD_TEXT.moves));
    if (facts.moves.length === 0) money.appendChild(emptyHint(WORKER_CARD_TEXT.noMoves));
    facts.moves.forEach(move => {
        const row = el('div', 'wcard-move');
        const what = el('div', 'wcard-move-what');
        what.appendChild(el('strong', null, move.label));
        if (move.date) what.appendChild(el('span', 'wcard-move-date', move.date));
        row.appendChild(what);
        row.appendChild(el('div', 'wcard-move-amount', move.amount));
        money.appendChild(row);
    });
    body.appendChild(money);

    // His month as a calendar, and under it the same month counted.
    body.appendChild(workerCardCalendarBlock(facts.calendar));
    const month = workerCardBlock(facts.calendar.current ? WORKER_CARD_TEXT.month : WORKER_CARD_TEXT.monthOther,
        facts.calendar.current ? '' : facts.calendar.label);
    if (facts.calendar.sites.length === 0) month.appendChild(emptyHint(WORKER_CARD_REUSED.noDays));
    const sites = el('div', 'wcard-month');
    facts.calendar.sites.forEach(site => {
        const row = el('div', 'wcard-month-row');
        row.appendChild(workerCardSite(site));
        row.appendChild(el('strong', 'wcard-month-days', String(site.days)));
        sites.appendChild(row);
    });
    if (facts.calendar.sites.length > 0) month.appendChild(sites);
    const totals = el('div', 'wcard-month-totals');
    totals.appendChild(workerCardPair(WORKER_CARD_REUSED.attended, String(facts.calendar.attended)));
    totals.appendChild(workerCardPair(WORKER_CARD_REUSED.absent, String(facts.calendar.absent)));
    month.appendChild(totals);
    body.appendChild(month);

    // Where he was, day by day in words. Today first: the question is usually about this week.
    const strip = workerCardBlock(WORKER_CARD_TEXT.strip);
    const days = el('div', 'wcard-strip');
    facts.strip.forEach(day => {
        const cell = el('div', 'wcard-day');
        cell.appendChild(el('span', 'wcard-day-when', day.when));
        const where = el('span', 'wcard-day-where');
        if (day.absent) where.appendChild(el('span', 'wcard-day-absent', WORKER_CARD_REUSED.absent));
        else if (day.sites.length === 0) where.appendChild(el('span', 'wcard-day-none', '—'));
        else day.sites.forEach(site => where.appendChild(workerCardSite(site)));
        cell.appendChild(where);
        days.appendChild(cell);
    });
    strip.appendChild(days);
    body.appendChild(strip);

    if (held) {
        const again = [...body.querySelectorAll('a, button')]
            .filter(node => node.dataset && node.dataset.wcardKey === held)[0];
        if (again && again.focus) again.focus({ preventScroll: true });
    }
}

// What one day of the calendar shows inside its cell: a block in the site's own colour
// with the site's letter (and, past ten sites, the diamond every other screen puts on
// the second lap of the palette), the week's mark for a doubled day or extra hours - or
// the week's dash for an absence. Hidden from a screen reader: the cell's name says it
// in words.
function workerCardDayMarks(cell) {
    const marks = el('span', 'wcard-cal-marks');
    marks.setAttribute('aria-hidden', 'true');
    if (cell.absent) {
        marks.appendChild(el('span', 'wcard-cal-absent', WORKER_CARD_MARKS.absent));
        return marks;
    }
    cell.sites.forEach(site => {
        const block = el('span', 'wcard-cal-site',
            siteMark(site.id) + site.initial + (site.mark ? WORKER_CARD_MARKS[site.mark] : ''));
        paintSite(block, site.id);
        if (site.mark) block.classList.add(`wcard-cal-${site.mark}`);
        marks.appendChild(block);
    });
    return marks;
}

// One day, as a button: it goes to that date on the day screen and does nothing else.
function workerCardDayButton(cell, className) {
    const day = button('', className, () => workerCardGoDay(cell.date), cell.said);
    day.dataset.wcardKey = `day:${cell.date}`;
    day.dataset.date = cell.date;
    if (cell.today) day.setAttribute('aria-current', 'date');
    return day;
}

function workerCardCalendarBlock(calendar) {
    const block = workerCardBlock(WORKER_CARD_TEXT.calendar);
    block.classList.add('wcard-cal');

    // The month and the two steps. The earlier month is the first of the two, as the
    // week screen has its «שבוע קודם».
    const nav = el('div', 'wcard-cal-nav');
    const back = button(WORKER_CARD_TEXT.prevMonth, 'btn-secondary wcard-cal-step', () => workerCardStepMonth(-1));
    back.dataset.wcardKey = 'month-back';
    nav.appendChild(back);
    const label = el('strong', 'wcard-cal-label', calendar.label);
    label.setAttribute('aria-live', 'polite');
    nav.appendChild(label);
    const forward = button(WORKER_CARD_TEXT.nextMonth, 'btn-secondary wcard-cal-step', () => workerCardStepMonth(1));
    forward.dataset.wcardKey = 'month-forward';
    nav.appendChild(forward);
    block.appendChild(nav);
    if (!calendar.current) {
        const home = button(WORKER_CARD_TEXT.thisMonth, 'btn-secondary wcard-cal-home', () => workerCardStepMonth(0));
        home.dataset.wcardKey = 'month-home';
        block.appendChild(home);
    }

    const grid = el('div', `wcard-cal-grid wcard-cal-cols-${calendar.columns.length}`);
    calendar.columns.forEach(letter => grid.appendChild(el('span', 'wcard-cal-head', letter)));
    calendar.weeks.forEach(week => week.forEach(cell => {
        if (!cell) { grid.appendChild(el('span', 'wcard-cal-gap')); return; }
        const day = workerCardDayButton(cell, 'wcard-cal-day');
        day.appendChild(el('span', 'wcard-cal-number', String(cell.number)));
        day.appendChild(workerCardDayMarks(cell));
        grid.appendChild(day);
    }));
    block.appendChild(grid);

    if (calendar.saturdays.length > 0) {
        block.appendChild(el('h5', 'wcard-sub', WORKER_CARD_TEXT.saturdays));
        const list = el('div', 'wcard-cal-saturdays');
        calendar.saturdays.forEach(cell => {
            const day = workerCardDayButton(cell, 'btn-secondary wcard-cal-saturday');
            day.appendChild(el('span', 'wcard-cal-number', formatShortDate(parseLocalDate(cell.date))));
            day.appendChild(workerCardDayMarks(cell));
            list.appendChild(day);
        });
        block.appendChild(list);
    }

    block.appendChild(el('p', 'wcard-cal-note', WORKER_CARD_REUSED.marks));
    block.appendChild(el('p', 'hint wcard-cal-hint', WORKER_CARD_TEXT.openDay));
    return block;
}

// A step of the calendar: one month back, one forward, or (0) home to the month today
// is in. Only the month in memory moves; the card is drawn again and nothing else is.
function workerCardStepMonth(months) {
    const today = todayStr();
    WORKER_CARD_MONTH = months === 0 ? null : workerCardMonthStep(workerCardMonthKey(today), months);
    if (WORKER_CARD_MONTH === today.slice(0, 7)) WORKER_CARD_MONTH = null;
    const stepped = document.activeElement;
    const key = stepped && stepped.dataset ? stepped.dataset.wcardKey : '';
    drawWorkerCard();
    // «חזרה לחודש הנוכחי» is not drawn on the month it goes to: the focus it held goes to
    // the first of the two steps rather than to nowhere.
    if (key === 'month-home') {
        const back = [...document.querySelectorAll('#workerCardBody .wcard-cal-step')][0];
        if (back && back.focus) back.focus({ preventScroll: true });
    }
}

// A day of the calendar NAVIGATES: the card closes and the day screen opens on that
// date - what a cell of the week screen does, in the week screen's own two steps. The
// date on screen is a choice in memory; nothing is recorded by looking at a day.
function workerCardGoDay(date) {
    if (!isRealDate(date)) return;
    closeWorkerCard();
    State.date = date;
    showView('day');
}

// ---------------------------------------------------------------- the frame

function openWorkerCard(workerId) {
    const worker = State.worker(workerId);
    const modal = document.getElementById('workerCardModal');
    if (!worker || !modal) return;
    WORKER_CARD_ID = String(worker.id);
    WORKER_CARD_MONTH = null;

    // The two ways out, named after the screens they open - the sheet's own heading and
    // the advances tab's own word - so the button and the screen it lands on agree.
    const report = document.getElementById('workerCardReport');
    if (report) report.textContent = WORKER_CARD_REUSED.report;
    const advances = document.getElementById('workerCardAdvances');
    if (advances) advances.textContent = WORKER_CARD_REUSED.advances;

    drawWorkerCard();
    if (WORKER_CARD_ID === null) return;
    modal.style.display = 'flex';
    // Read from the top: the dialog is entered at its heading (js/ui/modal.js), and the
    // scroll position is set rather than left wherever the last man's card was.
    const content = modal.querySelector('.modal-content');
    if (content) content.scrollTop = 0;
}

function closeWorkerCard() {
    WORKER_CARD_ID = null;
    WORKER_CARD_MONTH = null;
    const modal = document.getElementById('workerCardModal');
    if (modal) modal.style.display = 'none';
}

// render() calls this (js/app.js): a snapshot adopted from another phone while the card
// is open must move its figures, or the card is a record that quietly says something
// different from what was done. The place the reader had scrolled to is kept.
function renderWorkerCardIfOpen() {
    const modal = document.getElementById('workerCardModal');
    if (!modal || modal.style.display !== 'flex' || WORKER_CARD_ID === null) return;
    const content = modal.querySelector('.modal-content');
    const at = content ? content.scrollTop : 0;
    drawWorkerCard();
    if (content) content.scrollTop = at;
}

// The two buttons that leave the card. They NAVIGATE and do nothing else: the report is
// pointed at his period and narrowed to him - the same four assignments the advances
// screen's «קיזוז מהשכר» makes on its way to the sheet - and the advances screen is
// opened on him by its own function. The report's range and filter are what the person
// would have set by hand; they are in memory, like every other choice on that screen.
function workerCardGo(where) {
    const worker = WORKER_CARD_ID === null ? null : State.worker(WORKER_CARD_ID);
    closeWorkerCard();
    if (!worker) return;
    if (where === 'advances') {
        showWorkerAdvances(worker.id);
        return;
    }
    const period = periodRangeFor(worker, todayStr());
    REPORT_RANGE.from = period.from;
    REPORT_RANGE.to = period.to;
    REPORT_WORKERS = new Set([String(worker.id)]);
    REPORT_SECTION = 'workers';
    REPORT_PRESET = 'custom';
    showView('reports');
}
