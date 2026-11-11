// סיכום חודש - one calendar month on one screen: the work, the two counts, the men, the
// money, and how the month stands against the one before it. Opened from the reports
// screen's «הפקת דוח» menu. Today the owner assembles this in his head from three reports.
//
// IT IS A READING, AND ONLY A READING. Nothing here commits, nothing here touches Store,
// and there is not a field on it: the two arrows change which month is READ, the two
// doors hand the same words to WhatsApp or the clipboard, and that is all a finger can
// do. tests/monthsummary.test.mjs holds every key on the disk byte for byte across it.
//
// AND IT PRICES NOTHING. A summary that added up a month's wages for itself would be one
// more surface pricing the same days, and this app has paid for surfaces disagreeing
// (see workerAccountFor in js/ui/reports.js). Every figure is asked of the function the
// reports screen asks, pointed at the month - the range «החודש» / «חודש שעבר» already
// puts that screen on:
//
//   the pay sheet's rows      payrollRows -> payrollReport          js/ui/reports.js, js/model/money.js
//   נצבר, מקדמות              payrollBandTotals, deductionColumnName  js/ui/reports.js
//   ימי עובד־אתר per site     invoiceByDate -> invoiceReport        js/model/money.js
//   בלי עובדי רימא            invoiceWithoutRima                    js/model/money.js
//   רישום לרימא               rimaReport                            js/model/schema.js
//   עובדי יוסף גבס            yosefGevesReport                      js/model/schema.js
//   הוחזר במזומן, תיקון-היפוך  advanceRepaymentsFor, advanceReversalsFor  js/model/schema.js
//
// What this file does for itself is COUNT what those functions returned - how many rows
// have a day in them, which three are longest, on how many dates somebody worked, which
// date had the most men - and subtract one month's number from another's. No rate is
// multiplied here and no shekel is added to another outside payrollBandTotals.
//
// THE GATE COMES WITH THE FUNCTION. payrollRows and deductionColumnName ask
// carryReportingEnabled(schedule) themselves; a month is never somebody's whole account
// (wholeAccountRange), so the sheet reads a month the plain way under either answer and
// so does this. The one figure this file gates by its own hand is the cash handed back:
// on the reports side that figure exists only inside an account, which exists only once
// the record may be read the new way - so before an approval it is not shown here either
// (tests/approval.test.mjs is the rule; tests/monthsummary.test.mjs holds this to it).

// ---------------------------------------------------------------- the words
//
// Every Hebrew string this file adds, in one block. PROPOSED, not approved: the owner has
// not read them. Pinned word for word in tests/monthsummary.test.mjs, so changing one is
// a decision.
const MONTH_SUMMARY_TEXT = Object.freeze({
    // The entry in «הפקת דוח», and the head of the screen.
    title: 'סיכום חודש',
    months: Object.freeze(['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
        'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר']),
    prev: 'חודש קודם',
    next: 'חודש הבא',
    empty: 'אין רישומים בחודש הזה.',
    // A month that is not over: the range is the whole month, as «החודש» is on the
    // reports screen, so what it holds is what was recorded so far.
    inProgress: 'החודש עוד לא נגמר. המספרים הם של מה שנרשם עד עכשיו, וההשוואה היא מול חודש שלם.',
    workingDays: 'ימי עבודה',
    average: 'ממוצע עובדים ליום עבודה',
    busiest: 'היום העמוס ביותר',
    men: 'עובדים שעבדו',
    top: 'הכי הרבה ימים',
    // The Rima table's own note says «בחיוב שלמעלה» - above it. Here the billing count
    // is not above, so the same sentence without the one word of place.
    rimaNote: 'עובדי רימא בלבד. אינם נכללים בשכר. בחיוב כל אחד מהם נספר כיום עובד־אתר אחד.',
    // The sheet's own sentence for a wage it cannot price, without «למטה».
    unpriced: (count, names) => `⚠️ ${count} עובדים בלי שכר יומי, ולכן הסכום חסר אותם: ${names}. `
        + 'הוסף להם שכר במסך "עובדים ואתרים".',
    // The comparison, always in words and digits - an arrow alone is a colour alone.
    more: (by, month) => `↑ ${by} יותר מ${month}`,
    less: (by, month) => `↓ ${by} פחות מ${month}`,
    same: month => `כמו ב${month}`,
    noCompare: month => `אין רישומים ב${month}, ולכן אין השוואה.`,
    asText: 'הסיכום כטקסט'
});

// The words this screen borrows, each beside the screen that owns it. Repeated here only
// where the owner builds them inline; tests/monthsummary.test.mjs finds every one of them
// in its owner's source, so a word changed there and not here fails by name. The Rima and
// יוסף גבס titles, totals and note, «בלי עובדי רימא» and the ledger's two labels are not
// repeated at all - they are constants of js/ui/reports.js and are read from it.
const MONTH_SUMMARY_REUSED = Object.freeze({
    attendance: 'ימי נוכחות',                         // js/ui/reports.js, the statement
    siteDays: 'ימי עובד־אתר לפי אתר',                  // js/ui/reports.js, the billing bars
    siteDaysTotal: 'סה״כ ימי עובד־אתר',               // js/ui/reports.js, the billing total
    doubles: 'כפולים',                                // js/ui/reports.js, the sheet's column
    extraHours: 'שעות נוספות',                        // js/ui/reports.js, the sheet's column
    gross: 'נצבר',                                    // js/ui/reports.js, the sheet's column
    hoursUnpriced: '* שעות נוספות בלי שכר שעה - לא נכללו בסכום.',   // js/ui/reports.js
    oneMan: 'עובד אחד',                               // js/ui/reports.js, countedIn
    manyMen: 'עובדים',                                // js/ui/reports.js, countedIn
    send: '💬 שלח בוואטסאפ',                          // index.html, the day's message
    copy: 'העתק',                                     // index.html, the day's message
    close: 'סגור'                                     // index.html, the worker's card
});

// How many names stand under «הכי הרבה ימים».
const MONTH_SUMMARY_TOP = 3;

// Which month is on the screen, as 'YYYY-MM', or null when it is shut. Memory only: a
// reload closes it, and nothing about it is kept anywhere.
let MONTH_SUMMARY_KEY = null;

// ---------------------------------------------------------------- the calendar
//
// Local noon, like every other date this app builds: a month is its first day to its
// last by the phone's own calendar, and a clock change inside it moves neither.

function monthSummaryKeyOf(dateStr) {
    return String(dateStr).slice(0, 7);
}

function monthSummaryShift(key, months) {
    const [year, month] = String(key).split('-').map(Number);
    return monthSummaryKeyOf(toLocalDateStr(new Date(year, month - 1 + months, 1, 12)));
}

function monthSummaryRange(key) {
    const [year, month] = String(key).split('-').map(Number);
    return {
        from: toLocalDateStr(new Date(year, month - 1, 1, 12)),
        // Day 0 of the next month is the last day of this one (setMonthRange's own step).
        to: toLocalDateStr(new Date(year, month, 0, 12))
    };
}

function monthSummaryName(key, bare) {
    const [year, month] = String(key).split('-').map(Number);
    const name = MONTH_SUMMARY_TEXT.months[month - 1] || '';
    return bare ? name : `${name} ${year}`;
}

// ---------------------------------------------------------------- the reading

// THE SHEET'S OWN FUNCTIONS, POINTED AT A MONTH. They read the report's range and its
// worker filter off REPORT_RANGE and REPORT_WORKERS; inside this one step the range is
// pointed at each month in turn with no man left out, they answer, and both are put back
// in a finally - the step js/ui/workercard.js takes, for the reason written there.
//
// The gate is asked ONCE for the whole reading - both months - by the gate's own
// function, and the real function is put back with the range. The question re-plans the
// migration and is not cheap; inside one synchronous step the record cannot change, so
// its answer cannot either. A different schedule is never answered from memory.
function monthSummaryScope(read) {
    const held = { from: REPORT_RANGE.from, to: REPORT_RANGE.to, workers: REPORT_WORKERS };
    const ask = carryReportingEnabled;
    const asked = State.schedule;
    let answered = false;
    let answer = false;
    REPORT_WORKERS = null;
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

// Hours, not money: 3.5 and 1.25 are added, and binary float is kept off the screen.
function monthSummaryRound(value) {
    return Math.round((Number(value) || 0) * 100) / 100;
}

// One month's numbers, as plain data. Nothing compared, nothing worded. Called inside
// monthSummaryScope, which is what puts the report's range back afterwards.
function monthSummaryRead(key) {
    const range = monthSummaryRange(key);
    const schedule = State.schedule;
    REPORT_RANGE.from = range.from;
    REPORT_RANGE.to = range.to;

    const sheet = (() => {
        const rows = payrollRows();
        const carry = carryReportingEnabled(schedule) === true;
        // Cash handed back and corrections dated in the month, by the two functions an
        // account is built from - and only where the record may be read that way.
        let repaid = null;
        let reversed = null;
        if (carry && typeof advanceRepaymentsFor === 'function') {
            repaid = 0;
            reversed = 0;
            (schedule.workers || []).forEach(worker => {
                repaid += advanceRepaymentsFor(schedule, worker.id, range.from, range.to);
                reversed += advanceReversalsFor(schedule, worker.id, range.from, range.to);
            });
            repaid = agora(repaid);
            reversed = agora(reversed);
        }
        return { rows, band: payrollBandTotals(rows), label: deductionColumnName(rows),
            repaid, reversed };
    })();

    const rows = sheet.rows;
    const worked = rows.filter(row => row.attendanceDays > 0);
    const attendance = worked.reduce((sum, row) => sum + row.attendanceDays, 0);
    const doubled = rows.filter(row => row.doubleDays > 0);
    // The wage is a number only when somebody's days could be priced. Every man without
    // a rate is «—», which is not zero - the sheet's own rule (financeLineText).
    const priced = worked.length === 0 || worked.some(row => row.amount !== null);

    const invoice = invoiceByDate(schedule, range.from, range.to);
    const own = invoiceWithoutRima(schedule, range.from, range.to);
    const rima = rimaReport(schedule, range.from, range.to);
    const yosef = typeof yosefGevesReport === 'function'
        ? yosefGevesReport(schedule, range.from, range.to) : { places: [], total: 0 };

    // A working day is a date one of HIS men was on a site. A date the invoice bills
    // only for Rima's men is on the invoice and is not one of these.
    const workingDates = own.dates.filter(date => own.dayTotal(date) > 0);
    // The men on a date, each once however many sites he stood on: the invoice's own
    // workerIds, gathered per date.
    const menOn = {};
    invoice.places.forEach(place => place.days.forEach(day => {
        if (!menOn[day.date]) menOn[day.date] = new Set();
        day.workerIds.forEach(id => menOn[day.date].add(String(id)));
    }));
    let busiest = null;
    workingDates.forEach(date => {
        const men = menOn[date] ? menOn[date].size : 0;
        // The earliest of equals: dates arrive in order and only a larger one replaces.
        if (!busiest || men > busiest.men) busiest = { date, men };
    });

    // By days, the roster's order kept among equals (sort is stable).
    const sites = invoice.places
        .map(place => ({ id: String(place.placeId), name: place.name, days: place.workerDays }))
        .sort((a, b) => b.days - a.days);
    const countOf = report => report.places.length === 0 ? null : {
        sites: report.places.map(place => ({ id: String(place.placeId), name: place.name, count: place.total })),
        total: report.total
    };

    return {
        key,
        range,
        empty: rows.length === 0 && invoice.places.length === 0 && yosef.places.length === 0
            && !(sheet.repaid > 0) && !(sheet.reversed > 0),
        attendance,
        workingDays: workingDates.length,
        average: workingDates.length > 0
            ? Math.round((attendance / workingDates.length) * 10) / 10 : null,
        busiest,
        sites,
        siteDays: invoice.total,
        // His own men's share of the billing count, said only when Rima has one.
        ownSiteDays: rima.places.length > 0 ? own.total : null,
        rima: countOf(rima),
        yosef: countOf(yosef),
        men: worked.length,
        top: worked.slice().sort((a, b) => b.attendanceDays - a.attendanceDays)
            .slice(0, MONTH_SUMMARY_TOP).map(row => ({ name: row.name, days: row.attendanceDays })),
        doubleDays: doubled.reduce((sum, row) => sum + row.doubleDays, 0),
        doubleMen: doubled.length,
        extraHours: monthSummaryRound(rows.reduce((sum, row) => sum + (row.extraHours || 0), 0)),
        gross: priced ? sheet.band.gross : null,
        advancesLabel: sheet.label,
        advances: sheet.band.taken,
        repaid: sheet.repaid,
        reversed: sheet.reversed,
        unpriced: rows.filter(row => row.amount === null).map(row => row.name),
        hoursUnpriced: rows.some(row => row.hoursUnpriced)
    };
}

// «↑ 12 יותר מאוקטובר», or null where one side is not a number.
function monthSummaryDelta(now, before, monthName, money) {
    if (now === null || before === null || now === undefined || before === undefined) return null;
    const by = money ? agora(now - before) : monthSummaryRound(now - before);
    if (by === 0) return { dir: 'same', by: 0, text: MONTH_SUMMARY_TEXT.same(monthName) };
    const size = money ? `${moneyText(Math.abs(by))} ₪` : String(Math.abs(by));
    return by > 0
        ? { dir: 'up', by, text: MONTH_SUMMARY_TEXT.more(size, monthName) }
        : { dir: 'down', by, text: MONTH_SUMMARY_TEXT.less(size, monthName) };
}

function monthSummaryMoney(value) {
    return value === null ? '—' : `${bidiAmount(moneyText(value))} ₪`;
}

// Everything the screen says, as plain data, and nothing drawn - so the suite can hold
// each figure against the report's without a browser, and so that what is on the screen
// and what leaves as text cannot be anything this did not return.
function monthSummaryFacts(key) {
    const beforeKey = monthSummaryShift(key, -1);
    const [now, before] = monthSummaryScope(() => [monthSummaryRead(key), monthSummaryRead(beforeKey)]);
    const beforeName = monthSummaryName(beforeKey, true);
    const today = todayStr();
    const T = MONTH_SUMMARY_TEXT;
    const R = MONTH_SUMMARY_REUSED;
    const delta = (a, b, money) => before.empty ? null : monthSummaryDelta(a, b, beforeName, money);

    const facts = {
        key,
        name: monthSummaryName(key),
        range: { from: now.range.from, to: now.range.to,
            text: dateRange(formatFullDate(parseLocalDate(now.range.from)),
                formatFullDate(parseLocalDate(now.range.to))) },
        empty: now.empty,
        inProgress: !now.empty && today >= now.range.from && today < now.range.to,
        compare: now.empty ? null : (before.empty ? T.noCompare(beforeName) : null),
        // The four numbers the month is known by, each with its step from last month.
        headline: [
            { id: 'attendance', label: R.attendance, value: now.attendance,
                text: String(now.attendance), delta: delta(now.attendance, before.attendance) },
            { id: 'workingDays', label: T.workingDays, value: now.workingDays,
                text: String(now.workingDays), delta: delta(now.workingDays, before.workingDays) },
            { id: 'gross', label: R.gross, value: now.gross,
                text: monthSummaryMoney(now.gross), delta: delta(now.gross, before.gross, true) },
            { id: 'rima', label: RIMA_TOTAL, value: now.rima ? now.rima.total : 0,
                text: String(now.rima ? now.rima.total : 0),
                delta: delta(now.rima ? now.rima.total : 0, before.rima ? before.rima.total : 0) }
        ],
        work: {
            sites: now.sites,
            total: now.siteDays,
            own: now.ownSiteDays,
            average: now.average,
            busiest: now.busiest ? (() => {
                const parsed = parseLocalDate(now.busiest.date);
                return { date: now.busiest.date, men: now.busiest.men,
                    when: `${hebrewDayName(parsed)} ${formatShortDate(parsed)}` };
            })() : null
        },
        rima: now.rima,
        yosef: now.yosef,
        men: { count: now.men, top: now.top, doubleDays: now.doubleDays,
            doubleMen: now.doubleMen, extraHours: now.extraHours },
        money: {
            gross: now.gross,
            advancesLabel: now.advancesLabel,
            advances: now.advances,
            repaid: now.repaid,
            reversed: now.reversed,
            unpriced: now.unpriced.length > 0
                ? T.unpriced(now.unpriced.length, now.unpriced.map(name => isolate(name)).join(', '))
                : null,
            hoursUnpriced: now.hoursUnpriced ? R.hoursUnpriced : null
        }
    };
    facts.text = monthSummaryText(facts);
    return facts;
}

// The men of a count: «3 עובדים», «עובד אחד» - countedIn's own two forms.
function monthSummaryMen(count) {
    return countedIn(count, MONTH_SUMMARY_REUSED.oneMan, MONTH_SUMMARY_REUSED.manyMen);
}

// The lines of the money block, in the order they are read. One list for the screen and
// for the text, so neither can show a line the other leaves out.
function monthSummaryMoneyLines(money) {
    const lines = [
        { label: MONTH_SUMMARY_REUSED.gross, value: monthSummaryMoney(money.gross) },
        { label: money.advancesLabel, value: monthSummaryMoney(money.advances) }
    ];
    if (money.repaid !== null) {
        lines.push({ label: LEDGER_KIND_LABELS.repaid, value: monthSummaryMoney(money.repaid) });
    }
    // Only when there is one: a correction is rare, and a line of 0 beside the cash
    // handed back reads as though something was corrected.
    if (money.reversed !== null && money.reversed !== 0) {
        lines.push({ label: LEDGER_KIND_LABELS.reversed, value: monthSummaryMoney(money.reversed) });
    }
    return lines;
}

// The same summary as plain Hebrew, for WhatsApp and the clipboard. It is the OWNER'S own
// reading and goes where he sends it - so, unlike the day's message to the crew (which
// carries no Rima by his decision of 2026-11-02), it names the Rima count: the month's
// billing does not add up without it.
function monthSummaryText(facts) {
    const T = MONTH_SUMMARY_TEXT;
    const R = MONTH_SUMMARY_REUSED;
    const lines = [`📊 ${T.title} · ${facts.name}`, facts.range.text];
    if (facts.empty) return lines.concat(['', T.empty]).join('\n');
    if (facts.inProgress) lines.push(T.inProgress);

    lines.push('');
    facts.headline.forEach(item => {
        lines.push(`${item.label}: ${item.text}${item.delta ? ` · ${item.delta.text}` : ''}`);
    });
    if (facts.compare) lines.push(facts.compare);
    if (facts.work.average !== null) lines.push(`${T.average}: ${facts.work.average}`);
    if (facts.work.busiest) {
        lines.push(`${T.busiest}: ${facts.work.busiest.when} · ${monthSummaryMen(facts.work.busiest.men)}`);
    }

    if (facts.work.sites.length > 0) {
        lines.push('', R.siteDays);
        facts.work.sites.forEach(site => lines.push(`• ${isolate(site.name)}: ${site.days}`));
        lines.push(`${R.siteDaysTotal}: ${facts.work.total}`);
        if (facts.work.own !== null) lines.push(`${NO_RIMA_TITLE}: ${facts.work.own}`);
    }
    if (facts.rima) {
        lines.push('', RIMA_TITLE);
        facts.rima.sites.forEach(site => lines.push(`• ${isolate(site.name)}: ${site.count}`));
        lines.push(`${RIMA_TOTAL}: ${facts.rima.total}`, T.rimaNote);
    }
    if (facts.yosef) {
        lines.push('', YOSEF_GEVES_TITLE);
        facts.yosef.sites.forEach(site => lines.push(`• ${isolate(site.name)}: ${site.count}`));
        lines.push(`${YOSEF_GEVES_TOTAL}: ${facts.yosef.total}`, YOSEF_GEVES_NOTE);
    }

    lines.push('', `${T.men}: ${facts.men.count}`);
    if (facts.men.top.length > 0) {
        lines.push(`${T.top}:`);
        facts.men.top.forEach(man => lines.push(`• ${isolate(man.name)}: ${man.days}`));
    }
    if (facts.men.doubleDays > 0) {
        lines.push(`${R.doubles}: ${facts.men.doubleDays} · ${monthSummaryMen(facts.men.doubleMen)}`);
    }
    if (facts.men.extraHours > 0) lines.push(`${R.extraHours}: ${facts.men.extraHours}`);

    lines.push('');
    monthSummaryMoneyLines(facts.money).forEach(line => lines.push(`${line.label}: ${line.value}`));
    if (facts.money.unpriced) lines.push(facts.money.unpriced);
    if (facts.money.hoursUnpriced) lines.push(facts.money.hoursUnpriced);
    return lines.join('\n');
}

// ---------------------------------------------------------------- the drawing
//
// textContent only, like every other screen: a name is text. Sizes come from the
// stylesheet's block (css/design.css, the end of the file); nothing here sets a height
// or a font, so the text may grow and every row wraps.

function monthSummaryBlock(title) {
    const block = el('section', 'msum-block');
    if (title) block.appendChild(el('h4', 'msum-head', title));
    return block;
}

function monthSummaryPair(label, value, className) {
    const pair = el('div', className || 'msum-pair');
    pair.appendChild(el('span', 'msum-label', label));
    pair.appendChild(el('strong', 'msum-value', value));
    return pair;
}

// A site in its own colour: the swatch carries it, the name beside it is ordinary ink -
// a name written IN a site's colour on a dark phone in the sun is the one that is lost.
function monthSummarySiteName(site) {
    const name = el('span', 'msum-site');
    name.appendChild(paintSite(el('span', 'msum-swatch'), site.id));
    return appendSiteName(name, site.id, site.name);
}

// One count per site, then its total and the one line saying what it is and is not in.
function monthSummaryCountBlock(title, count, totalLabel, note, className) {
    const block = monthSummaryBlock(title);
    block.classList.add(className);
    count.sites.forEach(site => {
        const row = el('div', 'msum-row');
        row.appendChild(monthSummarySiteName(site));
        row.appendChild(el('strong', 'msum-count', String(site.count)));
        block.appendChild(row);
    });
    block.appendChild(monthSummaryPair(totalLabel, String(count.total), 'msum-pair msum-total'));
    block.appendChild(el('p', 'msum-note', note));
    return block;
}

function drawMonthSummary() {
    const body = document.getElementById('monthSummaryBody');
    const month = document.getElementById('monthSummaryMonth');
    const field = document.getElementById('monthSummaryText');
    if (!body || !month || MONTH_SUMMARY_KEY === null) return;
    const T = MONTH_SUMMARY_TEXT;
    const R = MONTH_SUMMARY_REUSED;
    const facts = monthSummaryFacts(MONTH_SUMMARY_KEY);

    month.textContent = facts.name;
    if (field && field.value !== facts.text) field.value = facts.text;
    clear(body);
    body.appendChild(el('p', 'msum-range', facts.range.text));

    if (facts.empty) {
        body.appendChild(emptyHint(T.empty));
        return;
    }
    if (facts.inProgress) body.appendChild(el('p', 'msum-note msum-progress', T.inProgress));

    // The four numbers, each with its step from last month in words.
    const tiles = el('div', 'msum-tiles');
    facts.headline.forEach(item => {
        const tile = monthSummaryPair(item.label, item.text, 'msum-pair msum-tile');
        tile.setAttribute('data-figure', item.id);
        if (item.delta) {
            const step = el('span', `msum-delta msum-${item.delta.dir}`, item.delta.text);
            tile.appendChild(step);
        }
        tiles.appendChild(tile);
    });
    body.appendChild(tiles);
    if (facts.compare) body.appendChild(el('p', 'msum-note msum-compare', facts.compare));

    // The work: each site a bar in its own colour, the number large beside it.
    const work = monthSummaryBlock(R.siteDays);
    work.classList.add('msum-work');
    const most = facts.work.sites.reduce((max, site) => Math.max(max, site.days), 0);
    facts.work.sites.forEach(site => {
        const row = el('div', 'msum-bar-row');
        row.appendChild(monthSummarySiteName(site));
        const line = el('div', 'msum-bar-line');
        const track = el('span', 'msum-bar-track');
        const fill = el('span', 'msum-bar-fill');
        fill.style.width = `${most > 0 ? Math.max(2, Math.round((site.days / most) * 100)) : 0}%`;
        fill.style.background = siteColorVar(site.id);
        track.appendChild(fill);
        line.appendChild(track);
        line.appendChild(el('strong', 'msum-count msum-bar-count', String(site.days)));
        row.appendChild(line);
        work.appendChild(row);
    });
    if (facts.work.sites.length > 0) {
        work.appendChild(monthSummaryPair(R.siteDaysTotal, String(facts.work.total), 'msum-pair msum-total'));
        if (facts.work.own !== null) {
            work.appendChild(monthSummaryPair(NO_RIMA_TITLE, String(facts.work.own), 'msum-pair msum-total msum-own'));
        }
    }
    if (facts.work.average !== null) {
        work.appendChild(monthSummaryPair(T.average, String(facts.work.average), 'msum-pair msum-line'));
    }
    if (facts.work.busiest) {
        work.appendChild(monthSummaryPair(T.busiest,
            `${facts.work.busiest.when} · ${monthSummaryMen(facts.work.busiest.men)}`, 'msum-pair msum-line'));
    }
    body.appendChild(work);

    // The two counts, each apart and under its own name.
    if (facts.rima) {
        body.appendChild(monthSummaryCountBlock(RIMA_TITLE, facts.rima, RIMA_TOTAL, T.rimaNote, 'msum-rima'));
    }
    if (facts.yosef) {
        body.appendChild(monthSummaryCountBlock(YOSEF_GEVES_TITLE, facts.yosef, YOSEF_GEVES_TOTAL,
            YOSEF_GEVES_NOTE, 'msum-yosefgeves'));
    }

    // The men.
    const men = monthSummaryBlock(null);
    men.classList.add('msum-men');
    men.appendChild(monthSummaryPair(T.men, String(facts.men.count), 'msum-pair msum-line msum-lead'));
    if (facts.men.top.length > 0) {
        men.appendChild(el('h5', 'msum-sub', T.top));
        facts.men.top.forEach(man => {
            const row = el('div', 'msum-row');
            row.appendChild(el('span', 'msum-man', man.name));
            row.appendChild(el('strong', 'msum-count', String(man.days)));
            men.appendChild(row);
        });
    }
    if (facts.men.doubleDays > 0) {
        men.appendChild(monthSummaryPair(R.doubles,
            `${facts.men.doubleDays} · ${monthSummaryMen(facts.men.doubleMen)}`, 'msum-pair msum-line'));
    }
    if (facts.men.extraHours > 0) {
        men.appendChild(monthSummaryPair(R.extraHours, String(facts.men.extraHours), 'msum-pair msum-line'));
    }
    body.appendChild(men);

    // The money, in the sheet's own words.
    const money = monthSummaryBlock(null);
    money.classList.add('msum-money');
    monthSummaryMoneyLines(facts.money).forEach(line => {
        money.appendChild(monthSummaryPair(line.label, line.value, 'msum-pair msum-line'));
    });
    if (facts.money.unpriced) money.appendChild(el('p', 'hint hint-warn msum-warn', facts.money.unpriced));
    if (facts.money.hoursUnpriced) money.appendChild(el('p', 'hint hint-warn msum-warn', facts.money.hoursUnpriced));
    body.appendChild(money);
}

// ---------------------------------------------------------------- the frame

// The way in: one row of the «הפקת דוח» menu, asked for by renderReportActions through
// typeof. Inside the menu because the menu is shut until asked for - it adds nothing to
// the toolbar's row, the switch or the range chips, whose places are measured.
function monthSummaryEntry() {
    const entry = button(MONTH_SUMMARY_TEXT.title, 'btn-secondary month-summary-entry', () => {
        // The menu shuts behind the dialog, and the focus is left on the menu's own
        // trigger - a button inside a shut menu cannot take the focus back afterwards.
        const menu = entry.closest ? entry.closest('details') : null;
        const trigger = menu ? menu.querySelector('summary') : null;
        if (menu) menu.open = false;
        if (trigger) trigger.focus({ preventScroll: true });
        openMonthSummary();
    });
    entry.id = 'monthSummaryOpen';
    return entry;
}

function monthSummaryIsOpen() {
    const modal = typeof document !== 'undefined' ? document.getElementById('monthSummaryModal') : null;
    return Boolean(modal && modal.style.display === 'flex' && MONTH_SUMMARY_KEY !== null);
}

function openMonthSummary(key) {
    const modal = document.getElementById('monthSummaryModal');
    if (!modal) return;
    MONTH_SUMMARY_KEY = key || monthSummaryKeyOf(todayStr());

    const T = MONTH_SUMMARY_TEXT;
    const R = MONTH_SUMMARY_REUSED;
    const say = (id, text) => { const node = document.getElementById(id); if (node) node.textContent = text; };
    say('monthSummaryTitle', T.title);
    say('monthSummaryPrev', T.prev);
    say('monthSummaryNext', T.next);
    say('monthSummaryFoldLabel', T.asText);
    say('monthSummarySend', R.send);
    say('monthSummaryCopy', R.copy);
    say('monthSummaryClose', R.close);
    say('monthSummaryStatus', '');
    const field = document.getElementById('monthSummaryText');
    if (field) field.setAttribute('aria-label', T.asText);
    monthSummaryShowText(false);

    drawMonthSummary();
    modal.style.display = 'flex';
    const content = modal.querySelector('.modal-content');
    if (content) content.scrollTop = 0;
}

function closeMonthSummary() {
    MONTH_SUMMARY_KEY = null;
    const modal = document.getElementById('monthSummaryModal');
    if (modal) modal.style.display = 'none';
    // The focus goes back to what had it (js/ui/modal.js) - the menu's trigger. A redraw
    // of the reports screen while the summary was open replaced that node, and then the
    // focus would be left on nothing; the trigger that is there now takes it instead.
    setTimeout(() => {
        if (monthSummaryIsOpen()) return;
        const active = document.activeElement;
        // Something outside the summary has it: leave it there. A button of the shut
        // dialog still "has" it for a moment, until the browser lets go of a hidden node.
        if (active && active !== document.body && !(modal && modal.contains(active))) return;
        const trigger = document.querySelector('#reportsView .report-output-actions > summary');
        if (trigger && trigger.offsetParent !== null) trigger.focus({ preventScroll: true });
    }, 0);
}

// The summary's words as a field, folded away until asked for: a button and not a
// <details>, because the dialogs' Tab trap (js/ui/modal.js) knows buttons and fields.
function monthSummaryShowText(show) {
    const field = document.getElementById('monthSummaryText');
    const toggle = document.getElementById('monthSummaryFoldLabel');
    if (field) field.hidden = !show;
    if (toggle) toggle.setAttribute('aria-expanded', show ? 'true' : 'false');
}

function monthSummaryToggleText() {
    const field = document.getElementById('monthSummaryText');
    if (field) monthSummaryShowText(field.hidden === true);
}

// One month back or forward. The arrows are in the frame and are not redrawn, so the
// focus stays on the one that was pressed and it can be pressed again.
function monthSummaryStep(months) {
    if (!monthSummaryIsOpen()) return;
    MONTH_SUMMARY_KEY = monthSummaryShift(MONTH_SUMMARY_KEY, months);
    drawMonthSummary();
    const modal = document.getElementById('monthSummaryModal');
    const content = modal ? modal.querySelector('.modal-content') : null;
    if (content) content.scrollTop = 0;
}

// render() calls this (js/app.js): a snapshot adopted from another phone while the
// summary is open must move its figures. The place the reader had scrolled to is kept.
function renderMonthSummaryIfOpen() {
    if (!monthSummaryIsOpen()) return;
    const modal = document.getElementById('monthSummaryModal');
    const content = modal.querySelector('.modal-content');
    const at = content ? content.scrollTop : 0;
    drawMonthSummary();
    if (content) content.scrollTop = at;
}

// The two doors any composed text leaves by (js/ui/share.js). The dialog stays open
// behind the share sheet: it is a screen being read, not a message being written.
function monthSummarySend() {
    if (!monthSummaryIsOpen()) return;
    const field = document.getElementById('monthSummaryText');
    const status = document.getElementById('monthSummaryStatus');
    // Both doors call this when the text has left; the line they wrote is taken down
    // after a moment, since this dialog does not close behind them.
    shareTextOut(field.value, status, () => { setTimeout(() => { status.textContent = ''; }, 4000); });
}

function monthSummaryCopy() {
    if (!monthSummaryIsOpen()) return;
    // The field has to be on the screen to be selected - the copy's last resort is the
    // person's own long press on it.
    monthSummaryShowText(true);
    copyTextOut(document.getElementById('monthSummaryText'), document.getElementById('monthSummaryStatus'));
}
