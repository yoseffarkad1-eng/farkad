// «מי חייב כסף», «שים לב» and «סגירות שנרשמו» - three READINGS of the money record.
//
// The owner, 2026-11-13: he loses money to a deduction that was not made and to an advance
// that is forgotten, and the first thing he wants to see is the men who owe. This file is
// the answer that writes nothing:
//
//   the board      on top of «מקדמות»: what is owed in all, and one row per man who owes
//   the warnings   «שים לב»: the same findings as sentences, on «מקדמות» and at the head
//                  of «דוחות» ← «לפי עובד», each unclosed account with one button that
//                  points the pay sheet at it
//   the closures   «סגירות שנרשמו»: every close already in the ledger, grouped by the
//                  moment and the phone that wrote it, leaving as text
//
// WHY THE BOARD EXISTS - THE TWO READINGS OF ONE DEBT. A period nobody closed is read by
// the pay sheet, from the next period on, as if the full possible deduction had come off
// that wage (advanceWalk, js/model/schema.js): 2,000 handed over, the period left open,
// and the next sheet opens on 0. The ledger never heard of that deduction: only a CLOSE
// writes one, so «מקדמות» goes on saying 2,000. Two screens, two answers, and nothing said
// they differ. THE BOARD SHOWS THE LEDGER'S FIGURE - what was really recorded - and NAMES
// the period that was left open, so that somebody can go and close it by hand. It closes
// nothing itself.
//
// IT IS A READING, AND ONLY A READING. No Store key, no field of the record, nothing
// queued, nothing synced: tests/owes.test.mjs holds the whole disk byte for byte across
// drawing all of it. What is open on the screen (OWES_PAGE) is memory and a reload
// forgets it.
//
// AND IT WORKS NO MONEY OUT. Every figure is the answer of the function the app already
// asks:
//
//   what a man owes        openAdvanceBalance                 js/model/schema.js
//                          (= workerAdvanceSummary(id).left, the figure of the list below
//                          it on the same page - tests/owes.test.mjs holds the two equal)
//   since when             advancesFor + advanceOutstanding   the oldest advance with money left
//   the last deduction     ledgerEntries, kind 'deducted'     js/model/ledger.js
//   the last repayment     ledgerEntries, kind 'repaid'
//   his periods            periodRangeFor / nextPeriodFor     js/dates.js
//   a period is closed     frozenPeriodFor                    js/model/schema.js
//   a period has a record  payrollReport's row                js/model/money.js
//                          (attendanceDays, absent, advances - reportOtherOpenAccounts' test)
//   what the sheet presumed advanceAccount(...).deducted      on that open period
//   his last work day      workerDaysReport                   js/model/money.js
//   a closed account       advanceAccount on the closed period: deducted, net, carriedOut
//
// The one sum made here is the total at the head of the board - the balances of the rows
// under it, added, the way workerAdvanceSummary adds a man's advances. "Periods without a
// deduction" is a COUNT of periods, not arithmetic.
//
// THE GATE COMES FIRST. openAdvanceBalance asks carryReportingEnabled(schedule) itself, so
// on a record whose migration nobody has approved the board says what the archive sentence
// and the worker's card say there - the sum that was handed over, under «מקדמות רשומות» -
// and NOTHING ELSE: no age, no last deduction, no period, no warning, no closures. Every
// one of those is the new arithmetic, and no surface may read it before somebody approves
// it (tests/approval.test.mjs).
//
// WHAT A READING COSTS, AND WHY IT IS COUNTED (v195, before it was served). The gate's
// question is not a lookup: carryReportingEnabled re-plans the migration, and the plan
// walks every man's account - for a man with a debt and NO daily rate, to its ceiling of
// four thousand fortnights, each of them a pay sheet of the whole crew (measured: seconds).
// So this file promises, and tests/owes.test.mjs counts:
//
//   - a reading plans the migration AT MOST ONCE, and NOT AT ALL on a record that carries
//     the approval (owesGateAnswer says why that is the gate's own answer);
//   - a reading asks each reader once: the pay sheet once per period, a man's closed
//     periods once per man (owesOnce);
//   - a draw of a record that has not moved since the last draw reads nothing: the
//     reading is kept under a key that IS the record (owesKey), so a kept figure can
//     never be a figure of another record;
//   - «דוחות» never waits for it: the row at its head is read after the page has painted
//     (renderOwesWarningsInto), and until then nothing is shown in its place.

// ---------------------------------------------------------------- the words
//
// Every Hebrew string this file adds, in one block. PROPOSED, not approved: the owner saw
// pictures of a mock-up (2026-11-13), not these words on a phone. Pinned word for word in
// tests/owes.test.mjs, so changing one is a decision.
const OWES_TEXT = Object.freeze({
    // --- the board
    total: 'חוב פתוח של העובדים',
    board: 'מי חייב כסף',
    order: 'מהחוב הגדול לקטן',
    none: 'אף עובד לא חייב כסף כרגע.',
    oneOwes: 'עובד אחד חייב',
    manyOwe: count => `${count} עובדים חייבים`,
    oneAttention: 'אחד דורש טיפול',
    manyAttention: count => `${count} דורשים טיפול`,
    since: date => `מאז ${date}`,
    lastDeducted: date => `נוכה לאחרונה ${date}`,
    neverDeducted: 'הניכוי האחרון: אין',
    // --- the flags on a row
    quietWeeks: count => `${count} שבועות בלי ניכוי`,
    quietPeriods: count => `${count} תקופות בלי ניכוי`,
    idleWeek: 'לא עבד השבוע',
    idlePeriod: 'לא עבד בתקופה',
    unclosed: 'חשבון קודם לא נסגר',
    // --- the warnings
    attention: 'שים לב',
    oneThing: 'דבר אחד',
    things: count => `${count} דברים`,
    sinceAdvance: date => `המקדמה מ-${date}. מאז לא נוכה ולא הוחזר כלום.`,
    sinceMove: date => `התנועה האחרונה: ${date}. מאז לא נוכה ולא הוחזר כלום.`,
    idleWeekTitle: 'יש חוב ואין ימי עבודה השבוע',
    idlePeriodTitle: 'יש חוב ואין ימי עבודה בתקופה',
    offTitle: 'יש חוב והעובד כבוי',
    lastWork: date => `יום העבודה האחרון שלו: ${date}.`,
    neverWorked: 'אין לו ימי עבודה רשומים.',
    presumedWeek: amount => `הדוח הניח שנוכו ${amount} ₪ בשבוע הזה, אבל הניכוי לא נרשם במקדמות.`,
    presumedPeriod: amount => `הדוח הניח שנוכו ${amount} ₪ בתקופה הזאת, אבל הניכוי לא נרשם במקדמות.`,
    recorded: amount => `במקדמות רשום חוב של ${amount} ₪.`,
    oneMore: 'ועוד חשבון אחד שלא נסגר אחריו. סוגרים מהישן לחדש.',
    more: count => `ועוד ${count} חשבונות שלא נסגרו אחריו. סוגרים מהישן לחדש.`,
    // --- the closures
    closures: 'סגירות שנרשמו',
    closuresNone: 'עוד לא נרשמה אף סגירה.',
    closuresLimit: 'כאן רשומים רק חשבונות שנסגרו. מי שלא נסגר באותו יום לא רשום כאן - הוא מופיע ב«מי חייב כסף».',
    closure: date => `סגירה · ${date}`,
    backToClosures: 'חזרה לסגירות שנרשמו',
    oneAccount: 'חשבון אחד',
    accounts: count => `${count} חשבונות`,
    deductedTotal: amount => `נוכו ${amount} ₪`,
    thisPhone: 'בטלפון הזה',
    otherPhone: 'בטלפון אחר',
    noTime: 'בלי שעת רישום',
    who: 'עובד · תקופה',
    deducted: 'נוכה',
    remained: 'נשאר',
    sum: 'סה״כ',
    noWage: 'בלי שכר יומי',
    history: 'כל ניכוי כאן רשום גם בהיסטוריה של העובד בעמוד המקדמות שלו - ושם אפשר לרשום תיקון לצידו.',
    textLabel: 'הסגירה כטקסט'
});

// The words the readings borrow, each beside the screen that owns it. Repeated here only
// where the owner builds them inline; tests/owes.test.mjs finds every one of them in its
// owner's source, so a word changed there and not here fails by name. PAY_CYCLE_LABELS and
// OTHER_ACCOUNT_SHOW (js/ui/reports.js) are not repeated at all - they are read.
const OWES_REUSED = Object.freeze({
    advances: 'מקדמות',                    // js/ui/reports.js, the advances screen
    recorded: 'מקדמות רשומות',             // js/ui/roster.js, the archived row
    off: 'כבוי',                           // js/ui/reports.js, the advances list
    review: 'דורש בדיקה',                  // js/ui/reports.js, the advances list
    checkFirst: 'לפני רישום החזרים או קיזוז צריך לבדוק את יתרות המקדמות הקיימות.',   // js/ui/reports.js
    back: 'חזרה לכל העובדים',              // js/ui/reports.js, a man's advances
    toPay: 'לתשלום',                       // js/ui/reports.js, the sheet's column
    send: '💬 שלח בוואטסאפ',               // index.html, the day's message
    copy: 'העתק'                           // index.html, the day's message
});

// After how many of a man's own periods with no deduction and no repayment he is flagged.
// The owner's decision, 2026-11-13: two.
const OWES_QUIET_PERIODS = 2;
// A walk driven by dates on a record is a walk a damaged date could send forever
// (accountsBefore's own ceiling).
const OWES_WALK_CEILING = 4000;

// What is open inside «מקדמות»: null (the list), 'closures', or the key of one closure.
// Memory only.
let OWES_PAGE = null;
// Whether somebody opened «שים לב» at the head of «דוחות». Memory only: a redraw - an
// adopted snapshot, a chip - must not shut a row a person opened, and a reload starts shut.
let OWES_HEAD_OPEN = false;

// ---------------------------------------------------------------- the reading

// THE GATE'S ANSWER, WITHOUT THE PLAN WHERE THE PLAN CANNOT CHANGE IT.
//
// js/model/ledger.js:
//     carryReportingEnabled(schedule) = advanceCarryEnabled() && carryMigrationSettled(schedule)
//     carryMigrationSettled(schedule) = !plan.needed || carryMigrationApproved(schedule, plan)
// and carryMigrationApproved reads ONE thing of the plan, its id, which is the constant
// carryMigrationId() ("one name, for one decision"). So with the flag shut the answer is
// false, and on a record that CARRIES the approval it is true, whatever the plan would
// say - and the plan is the whole cost of the question. Only a record nobody approved
// has to be planned, and then the gate's own function is asked, once.
//
// It is the gate's rule read from the gate's own parts, not a second rule:
// tests/owes.test.mjs holds this equal to carryReportingEnabled on every fixture and
// seeded record, approved and not, flag open and shut, and pins the two lines above in
// the model's source so that a gate that changes fails here by name.
function owesGateAnswer(schedule, ask) {
    if (typeof advanceCarryEnabled === 'function' && typeof carryMigrationApproved === 'function'
        && typeof carryMigrationId === 'function') {
        if (advanceCarryEnabled() !== true) return false;
        if (carryMigrationApproved(schedule, { id: carryMigrationId() }) === true) return true;
    }
    return ask(schedule) === true;
}

// ONE READING, ONE PASS OF EACH READER. Every reader this file calls asks the gate for
// itself, asks the pay sheet of a period for itself (advanceWalk) and folds a man's closed
// periods for itself (frozenPeriodFor) - once per man and period it is asked about. Inside
// one synchronous step the record cannot change (workerCardScope, js/ui/workercard.js,
// says why at length), so for the length of `read` each of the three answers THIS schedule
// from what it already answered: the gate once, the pay sheet once per range, the closed
// periods once per man. A different schedule is never answered from memory, nobody
// changes what a reader hands back (they are read, never written to), and the real
// functions are put back, throw or no throw.
function owesOnce(schedule, read) {
    const real = { gate: carryReportingEnabled, sheet: payrollReport, closed: closedPeriods };
    let gate;
    const sheets = {};
    const closed = {};
    carryReportingEnabled = asked => {
        if (asked !== schedule) return real.gate(asked);
        if (gate === undefined) gate = owesGateAnswer(asked, real.gate);
        return gate;
    };
    payrollReport = function (asked, from, to) {
        if (asked !== schedule || arguments.length !== 3) return real.sheet.apply(this, arguments);
        const key = `${from}..${to}`;
        if (!Object.prototype.hasOwnProperty.call(sheets, key)) sheets[key] = real.sheet(asked, from, to);
        return sheets[key];
    };
    closedPeriods = function (asked, workerId) {
        if (asked !== schedule || arguments.length !== 2) return real.closed.apply(this, arguments);
        const key = `w:${workerId}`;
        if (!Object.prototype.hasOwnProperty.call(closed, key)) closed[key] = real.closed(asked, workerId);
        return closed[key];
    };
    try {
        return read();
    } finally {
        carryReportingEnabled = real.gate;
        payrollReport = real.sheet;
        closedPeriods = real.closed;
    }
}

// His periods that have ENDED, from the one holding `since` to the one before today's,
// oldest first.
function owesEndedPeriods(worker, since, today) {
    const out = [];
    let period = periodRangeFor(worker, since);
    for (let n = 0; period.to < today && n < OWES_WALK_CEILING; n += 1) {
        out.push({ from: period.from, to: period.to, cycle: period.cycle });
        const next = nextPeriodFor(worker, period.from);
        if (!next || next.from <= period.from) break;
        period = next;
    }
    return out;
}

// Everything the board says about one man who owes, beyond the amount. Called only with
// the gate open.
function owesFacts(schedule, worker, today, rowIn, entries) {
    const id = String(worker.id);
    const items = advancesFor(schedule, worker.id, '0000-01-01', '9999-12-31');
    const open = items.filter(item => advanceOutstanding(schedule, item.id).left > 0);
    const current = periodRangeFor(worker, today);
    const facts = {
        cycle: current.cycle,
        period: { from: current.from, to: current.to },
        since: open.length ? open[0].date : null,
        lastDeducted: null,
        lastRepaid: null,
        quiet: 0,
        unclosed: [],
        presumed: 0,
        idle: false,
        lastWork: null,
        review: typeof overpaidAdvances === 'function'
            && overpaidAdvances(schedule, worker.id).length > 0
    };

    // The movements that take a debt DOWN, by the day they are dated on. A deduction is
    // dated on its period's last day (recordPeriodClosed), so it falls inside the period
    // it belongs to. A deduction of nothing is not one.
    const mine = {};
    items.forEach(item => { mine[String(item.id)] = true; });
    const moves = [];
    entries.forEach(entry => {
        if (!mine[String(entry.advanceId)] || !(Number(entry.amount) > 0)) return;
        if (entry.kind !== 'deducted' && entry.kind !== 'repaid') return;
        const date = String(entry.date || '');
        moves.push(date);
        if (entry.kind === 'deducted' && (!facts.lastDeducted || date > facts.lastDeducted)) facts.lastDeducted = date;
        if (entry.kind === 'repaid' && (!facts.lastRepaid || date > facts.lastRepaid)) facts.lastRepaid = date;
    });

    if (facts.since) {
        const ended = owesEndedPeriods(worker, facts.since, today);
        // How many of his periods have ended, one after the other up to now, with nothing
        // taken and nothing handed back in them.
        for (let at = ended.length - 1; at >= 0; at -= 1) {
            const period = ended[at];
            if (moves.some(date => date >= period.from && date <= period.to)) break;
            facts.quiet += 1;
        }
        // The ended periods that hold a record and that nobody closed.
        facts.unclosed = ended.filter(period => {
            if (frozenPeriodFor(schedule, worker.id, period.from, period.to) !== undefined) return false;
            const row = rowIn(id, period.from, period.to);
            return Boolean(row) && (row.attendanceDays > 0 || row.absent > 0 || Number(row.advances) > 0);
        }).map(period => ({ from: period.from, to: period.to, cycle: period.cycle }));
        // What the sheet presumed came off his wage in the OLDEST of them - the one that
        // is closed first.
        if (facts.unclosed.length) {
            const oldest = facts.unclosed[0];
            const account = advanceAccount(schedule, worker.id, oldest.from, oldest.to);
            facts.presumed = account && Number(account.deducted) > 0 ? account.deducted : 0;
        }
    }

    // HE STOPPED WORKING. Not "no day yet this week" - on the first morning of a week that
    // is everybody: no day in his current period AND none in the seven days up to today.
    const now = rowIn(id, current.from, current.to);
    const weekBack = advanceDayStep(today, -6);
    const lately = rowIn(id, weekBack, today);
    facts.idle = !(now && now.attendanceDays > 0) && !(lately && lately.attendanceDays > 0);
    if (facts.idle) {
        const days = workerDaysReport(schedule, worker, '0000-01-01', today)
            .filter(day => !day.absent && Array.isArray(day.entries) && day.entries.length > 0);
        facts.lastWork = days.length ? days[days.length - 1].date : null;
    }
    return facts;
}

function owesNeedsAttention(row) {
    return row.quiet >= OWES_QUIET_PERIODS || row.idle === true || row.active === false
        || (row.unclosed || []).length > 0 || row.review === true;
}

// THE BOARD, as data. Pure: a schedule and a day in, a plain object out.
function owesRead(schedule, today) {
    return owesOnce(schedule, () => {
        const folded = carryReportingEnabled(schedule) === true;
        // The pay sheet of a range, asked once however many men are looked up in it
        // (owesOnce), and the ledger's entries, listed once for all of them.
        const rowIn = (workerId, from, to) => payrollReport(schedule, from, to)
            .filter(row => String(row.workerId) === String(workerId))[0] || null;
        const entries = folded ? ledgerEntries(schedule) : [];
        const rows = [];
        ((schedule && schedule.workers) || []).forEach(worker => {
            if (!worker || !worker.id) return;
            const open = openAdvanceBalance(schedule, worker.id);
            if (!open || !(open.total > 0)) return;
            const row = { workerId: String(worker.id), name: String(worker.name || ''),
                active: worker.active !== false, amount: open.total };
            if (folded) Object.assign(row, owesFacts(schedule, worker, today, rowIn, entries));
            rows.push(row);
        });
        // The largest debt first; the roster's order between equals.
        rows.sort((a, b) => b.amount - a.amount);
        return {
            folded,
            today,
            rows,
            total: agoraRound(rows.reduce((sum, row) => sum + row.amount, 0)),
            attention: folded ? rows.filter(owesNeedsAttention).length : 0
        };
    });
}

// THE WARNINGS, as data: the board's findings, one sentence each. The unclosed accounts
// first - they are why the two screens disagree - then the debts nothing has come off,
// then the men who are not working.
function owesWarnings(read) {
    const out = [];
    if (!read || !read.folded) return out;
    read.rows.forEach(row => {
        if (row.unclosed.length) out.push({ kind: 'unclosed', row, span: row.unclosed[0] });
    });
    read.rows.forEach(row => {
        if (row.quiet >= OWES_QUIET_PERIODS) out.push({ kind: 'quiet', row });
    });
    read.rows.forEach(row => {
        if (row.idle || row.active === false) out.push({ kind: 'idle', row });
    });
    return out;
}

// ---------------------------------------------------------------- the closures, as data

// Every close in the ledger, newest first. A close is the entries one press wrote: the
// payslip of the period (`closed`) and one `deducted` per advance it touched, all with one
// `at` and one `by` - so a group is "same moment, same phone". Nothing is stored for this;
// it is read off what is there.
function owesClosures(schedule) {
    return owesOnce(schedule, () => owesClosuresRead(schedule));
}

function owesClosuresRead(schedule) {
    const held = (schedule && schedule.ledger && schedule.ledger.advances) || {};
    const advances = (schedule && schedule.advances) || {};
    const groups = {};
    Object.keys(held).forEach(key => {
        const entry = held[key];
        if (!entry || (entry.kind !== 'closed' && entry.kind !== 'deducted') || !entry.periodFrom) return;
        const of = entry.advanceId ? advances[entry.advanceId] : null;
        const workerId = String(of ? of.workerId : (entry.workerId || ''));
        if (!workerId) return;
        const at = String(entry.at || '');
        const by = String(entry.by || '');
        const groupKey = `${at}|${by}`;
        const group = groups[groupKey] || (groups[groupKey] = { key: groupKey, at, by, items: {} });
        const itemKey = `${workerId}|${entry.periodFrom}`;
        if (!group.items[itemKey]) {
            group.items[itemKey] = { workerId, from: String(entry.periodFrom),
                to: entry.periodTo !== undefined ? String(entry.periodTo) : null };
        } else if (group.items[itemKey].to === null && entry.periodTo !== undefined) {
            group.items[itemKey].to = String(entry.periodTo);
        }
    });
    const workers = (schedule && schedule.workers) || [];
    return Object.keys(groups).map(key => {
        const group = groups[key];
        const items = Object.keys(group.items).map(itemKey => {
            const item = group.items[itemKey];
            const worker = workers.filter(one => one && String(one.id) === item.workerId)[0] || null;
            const to = item.to !== null ? item.to : periodRangeFor(worker, item.from).to;
            // The closed account, read by the pay sheet's own reader: on a closed period it
            // answers from the record - what came off the wage, what was left to pay, and
            // the balance the payslip states.
            const account = advanceAccount(schedule, item.workerId, item.from, to);
            return {
                workerId: item.workerId,
                name: worker ? String(worker.name || '') : item.workerId,
                from: item.from,
                to,
                deducted: account.deducted,
                net: account.net,
                remained: account.carriedOut
            };
        }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : (a.from < b.from ? -1 : 1)));
        const total = field => agoraRound(items.reduce((sum, item) => sum + (Number(item[field]) || 0), 0));
        return { key, at: group.at, by: group.by, items,
            totals: { deducted: total('deducted'), net: total('net'), remained: total('remained') } };
    }).sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : (a.key < b.key ? 1 : -1)));
}

// ---------------------------------------------------------------- how a thing is said

function owesDate(dateStr, today) {
    const parsed = parseLocalDate(dateStr);
    return String(dateStr).slice(0, 4) === String(today).slice(0, 4)
        ? formatShortDate(parsed) : formatFullDate(parsed);
}

function owesSpanText(span) {
    return dateRange(formatShortDate(parseLocalDate(span.from)), formatShortDate(parseLocalDate(span.to)));
}

function owesMoney(value) {
    return `${moneyText(value)} ₪`;
}

function owesCountLine(read) {
    const parts = [read.rows.length === 1 ? OWES_TEXT.oneOwes : OWES_TEXT.manyOwe(read.rows.length)];
    if (read.attention === 1) parts.push(OWES_TEXT.oneAttention);
    else if (read.attention > 1) parts.push(OWES_TEXT.manyAttention(read.attention));
    return parts.join(' · ');
}

function owesQuietText(row) {
    return row.cycle === 'weekly' ? OWES_TEXT.quietWeeks(row.quiet) : OWES_TEXT.quietPeriods(row.quiet);
}

// The line under a man's name: his cycle, since when, the last deduction.
function owesRowLine(row, today) {
    const parts = [PAY_CYCLE_LABELS[row.cycle] || ''];
    if (row.since) parts.push(OWES_TEXT.since(owesDate(row.since, today)));
    parts.push(row.lastDeducted ? OWES_TEXT.lastDeducted(owesDate(row.lastDeducted, today))
        : OWES_TEXT.neverDeducted);
    return parts.filter(Boolean).join(' · ');
}

// The flags of a row: [words, look].
function owesFlags(row) {
    const flags = [];
    if (row.quiet >= OWES_QUIET_PERIODS) flags.push([owesQuietText(row), 'bad']);
    if (row.unclosed.length) flags.push([OWES_TEXT.unclosed, 'warn']);
    if (row.active === false) flags.push([OWES_REUSED.off, 'warn']);
    else if (row.idle) flags.push([row.cycle === 'weekly' ? OWES_TEXT.idleWeek : OWES_TEXT.idlePeriod, 'warn']);
    if (row.review) flags.push([OWES_REUSED.review, 'warn']);
    return flags;
}

// One warning in words: { title, lines[] }.
function owesWarningWords(warning, today) {
    const row = warning.row;
    const who = `${isolate(row.name)} · ${owesMoney(row.amount)}`;
    if (warning.kind === 'unclosed') {
        const lines = [];
        if (row.presumed > 0) {
            lines.push(warning.span.cycle === 'weekly' ? OWES_TEXT.presumedWeek(moneyText(row.presumed))
                : OWES_TEXT.presumedPeriod(moneyText(row.presumed)));
        }
        lines.push(OWES_TEXT.recorded(moneyText(row.amount)));
        const more = row.unclosed.length - 1;
        if (more === 1) lines.push(OWES_TEXT.oneMore);
        else if (more > 1) lines.push(OWES_TEXT.more(more));
        return { title: `${OWES_TEXT.unclosed}: ${owesSpanText(warning.span)} · ${isolate(row.name)}`, lines };
    }
    if (warning.kind === 'quiet') {
        const last = [row.lastDeducted, row.lastRepaid].filter(Boolean).sort().pop() || null;
        return { title: `${owesQuietText(row)}: ${who}`,
            lines: [last && last >= row.since ? OWES_TEXT.sinceMove(owesDate(last, today))
                : OWES_TEXT.sinceAdvance(owesDate(row.since, today))] };
    }
    const title = row.active === false ? OWES_TEXT.offTitle
        : (row.cycle === 'weekly' ? OWES_TEXT.idleWeekTitle : OWES_TEXT.idlePeriodTitle);
    const lines = [];
    if (row.idle) lines.push(row.lastWork ? OWES_TEXT.lastWork(owesDate(row.lastWork, today)) : OWES_TEXT.neverWorked);
    return { title: `${title}: ${who}`, lines };
}

// When a close was written, as this phone's calendar says it: { date, day, time }.
function owesClosureWhen(group) {
    const at = group.at ? new Date(group.at) : null;
    if (!at || Number.isNaN(at.getTime())) return { date: '', day: '', time: '' };
    return {
        date: formatFullDate(at),
        day: hebrewDayName(at),
        time: `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`
    };
}

function owesClosureTitle(group) {
    const when = owesClosureWhen(group);
    return OWES_TEXT.closure(when.date || OWES_TEXT.noTime);
}

function owesClosureMeta(group) {
    const when = owesClosureWhen(group);
    const mine = typeof syncDeviceId === 'function' && group.by !== '' && group.by === String(syncDeviceId());
    return [
        when.date ? `${when.day}, ${when.time}` : '',
        mine ? OWES_TEXT.thisPhone : OWES_TEXT.otherPhone,
        group.items.length === 1 ? OWES_TEXT.oneAccount : OWES_TEXT.accounts(group.items.length)
    ].filter(Boolean).join(' · ');
}

function owesClosureSummary(group) {
    return [
        group.items.length === 1 ? OWES_TEXT.oneAccount : OWES_TEXT.accounts(group.items.length),
        OWES_TEXT.deductedTotal(moneyText(group.totals.deducted)),
        `${OWES_REUSED.toPay} ${owesMoney(group.totals.net)}`
    ].join(' · ');
}

function owesNet(item) {
    return item.net === null || item.net === undefined ? OWES_TEXT.noWage : owesMoney(item.net);
}

// One close as text, for the two doors any composed text leaves by (js/ui/share.js).
function owesClosureText(group) {
    const three = (deducted, net, remained) =>
        `${OWES_TEXT.deducted} ${deducted} · ${OWES_REUSED.toPay} ${net} · ${OWES_TEXT.remained} ${remained}`;
    const lines = [owesClosureTitle(group), owesClosureMeta(group), ''];
    group.items.forEach(item => {
        lines.push(`${isolate(item.name)} · ${owesSpanText(item)}`);
        lines.push(three(owesMoney(item.deducted), owesNet(item), owesMoney(item.remained)));
    });
    lines.push('');
    lines.push(`${OWES_TEXT.sum}: ${three(owesMoney(group.totals.deducted), owesMoney(group.totals.net),
        owesMoney(group.totals.remained))}`);
    return lines.join('\n');
}

// ---------------------------------------------------------------- drawing

function owesAnyAdvance(schedule) {
    return Object.keys((schedule && schedule.advances) || {}).length > 0;
}

function owesAnyClosure(schedule) {
    const held = (schedule && schedule.ledger && schedule.ledger.advances) || {};
    return Object.keys(held).some(key => held[key]
        && (held[key].kind === 'closed' || held[key].kind === 'deducted') && held[key].periodFrom);
}

// THE KEY A READING IS KEPT UNDER IS THE RECORD ITSELF.
//
// A draw of «מקדמות» or «דוחות» happens at every chip, every dialog shut and every adopted
// snapshot, and most of them are of a record that did not move. So the last reading is
// kept - and the only thing that can make a kept figure wrong is a key that does not move
// when the record does (the site-label map of js/ui/reports.js was keyed on two counts
// once; tests/labelcache.test.mjs is what that cost). This key cannot fail that way:
//
//   - the record, WHOLE, as text: an advance, a close, a day, a rate, a name, the approval
//     itself - whatever changed, by whichever door (a commit, ↶, an adopted snapshot, a
//     restore), the text is different. It is compared, never hashed.
//   - the write tick (js/store.js), which only goes forward: a record that left and came
//     back equal is still read again.
//   - today, because every period is counted from it; and what this build does with the
//     money - both gates - because the reading is a different one under each.
//
// The tick alone would not do: it is best effort by its own account, and does not move on
// a disk that refuses the counter. Writing the record out costs a millisecond or a few;
// the reading it saves costs fifty times that.
let OWES_KEPT = null;

// The one thing this file has to do with the Store: it READS the counter. It writes no key.
function owesTick() {
    return typeof Store === 'object' && Store ? Store.tick : 0;
}

function owesKey(schedule, today) {
    return [
        String(owesTick()),
        String(today),
        typeof advanceCarryEnabled === 'function' && advanceCarryEnabled() === true ? 'carry' : 'no-carry',
        typeof ledgerWritesEnabled === 'function' && ledgerWritesEnabled() === true ? 'writes' : 'no-writes',
        JSON.stringify(schedule)
    ].join('|');
}

// The kept reading if it is of this record at this moment, or null. Never a reading of
// anything else.
function owesKeptNow() {
    if (!OWES_KEPT) return null;
    return OWES_KEPT.key === owesKey(State.schedule, todayStr()) ? OWES_KEPT.read : null;
}

// The read of this moment: the kept one when the record has not moved since it was made,
// a new one otherwise - so a redraw after any change of the record reads the record again.
function owesReadNow() {
    const today = todayStr();
    const key = owesKey(State.schedule, today);
    if (OWES_KEPT && OWES_KEPT.key === key) return OWES_KEPT.read;
    const read = owesRead(State.schedule, today);
    OWES_KEPT = { key, read };
    return read;
}

// The board and its warnings on top of «מקדמות». Called by renderAdvances
// (js/ui/reports.js) under the page's heading.
function renderOwesInto(root) {
    const box = el('section', 'owes');
    // No advance on the record at all: nobody can owe. The record is read - and with it
    // the gate, whose question may re-plan the migration - only if there is an advance, or
    // a closure to offer.
    const read = owesAnyAdvance(State.schedule) || owesAnyClosure(State.schedule) ? owesReadNow() : null;
    if (!read || read.rows.length === 0) {
        box.appendChild(el('p', 'owes-none', OWES_TEXT.none));
        root.appendChild(box);
        if (read) owesAppendClosuresEntry(root, read.folded);
        return;
    }
    const total = el('div', 'owes-total');
    total.appendChild(el('span', 'owes-total-label', read.folded ? OWES_TEXT.total : OWES_REUSED.recorded));
    total.appendChild(el('strong', 'owes-total-amount', owesMoney(read.total)));
    total.appendChild(el('p', 'owes-total-count', owesCountLine(read)));
    box.appendChild(total);
    if (!read.folded) box.appendChild(el('p', 'hint hint-warn owes-legacy', OWES_REUSED.checkFirst));

    const head = el('div', 'owes-head');
    head.appendChild(el('h3', null, OWES_TEXT.board));
    head.appendChild(el('span', 'owes-order', OWES_TEXT.order));
    box.appendChild(head);
    const list = el('div', 'owes-list');
    read.rows.forEach(row => list.appendChild(owesRowNode(row, read)));
    box.appendChild(list);
    // Under the board, open: the rows above carry the flags, these are the same findings
    // in sentences, each unclosed account with its one button.
    const warnings = owesWarningsNode(read, true);
    if (warnings) box.appendChild(warnings);
    root.appendChild(box);
    owesAppendClosuresEntry(root, read.folded);
}

function owesRowNode(row, read) {
    // No accessible name of its own: the row is read as what is written on it - his name,
    // what he owes, the line, the flags - and it opens his advances.
    const card = button('', 'owes-row btn-secondary', () => showWorkerAdvances(row.workerId));
    card.dataset.worker = row.workerId;
    if (read.folded && row.cycle) card.dataset.cycle = row.cycle;
    const top = el('span', 'owes-row-top');
    top.appendChild(el('strong', 'owes-name', row.name));
    top.appendChild(el('span', 'owes-amount', owesMoney(row.amount)));
    card.appendChild(top);
    if (!read.folded) return card;
    card.appendChild(el('span', 'owes-line', owesRowLine(row, read.today)));
    const flags = owesFlags(row);
    if (flags.length) {
        const chips = el('span', 'owes-flags');
        flags.forEach(([words, look]) => chips.appendChild(el('span', `owes-flag owes-flag-${look}`, words)));
        card.appendChild(chips);
    }
    return card;
}

// «שים לב». `open` is whether it stands open (on «מקדמות») or is one row that opens in
// place (on «דוחות», where the page is the pay sheet's). null when there is nothing to say.
function owesWarningsNode(read, open, chosen) {
    const warnings = owesWarnings(read).filter(warning => !chosen || chosen(warning.row.workerId));
    if (!warnings.length) return null;
    const fold = el('details', 'owes-warnings');
    fold.open = open === true;
    const summary = el('summary', 'owes-warnings-head');
    summary.appendChild(el('strong', null, OWES_TEXT.attention));
    summary.appendChild(el('span', 'owes-warnings-count',
        warnings.length === 1 ? OWES_TEXT.oneThing : OWES_TEXT.things(warnings.length)));
    fold.appendChild(summary);
    warnings.forEach(warning => {
        const words = owesWarningWords(warning, read.today);
        const item = el('div', `owes-warning owes-warning-${warning.kind}`);
        item.dataset.worker = warning.row.workerId;
        item.appendChild(el('strong', 'owes-warning-title', words.title));
        words.lines.forEach(line => item.appendChild(el('p', 'owes-warning-line', line)));
        if (warning.kind === 'unclosed') {
            item.appendChild(button(`${OTHER_ACCOUNT_SHOW} ${owesSpanText(warning.span)}`, 'btn-secondary owes-show',
                () => owesShowAccount(warning.row.workerId, warning.span)));
        }
        fold.appendChild(item);
    });
    return fold;
}

// At the head of «דוחות» ← «לפי עובד» (renderReports, js/ui/reports.js): the same
// findings, shut until asked for, and only for the men the report is showing. Outside the
// report's own section, so the paper, the picture and the file never carry it.
//
// THE PAGE DOES NOT WAIT FOR IT. The row is one line above a pay sheet somebody came to
// read, and whether it is there at all - and the count on it - is the whole reading. So:
//
//   - the record has not moved since the last reading: the row is drawn now, from it;
//   - it has moved: the pay sheet is drawn and painted first, and the record is read
//     after (owesAfterPaint). Until then NOTHING stands in the row's place but the room
//     the row last took (.owes-pending - no word and no figure of the reading before, so
//     nothing stale is ever shown as current, and the sheet under it does not jump when
//     the row arrives);
//   - the draw was replaced meanwhile (another chip, an adopted snapshot): its place is
//     gone from the page and nothing is read for it - the draw that replaced it asks for
//     itself.
//
// Where there is no frame to wait for (the suites' devices in Node) it is read in place.
let OWES_HEAD_ROOM = 0;

function owesAfterPaint(work) {
    let done = false;
    const run = () => { if (!done) { done = true; work(); } };
    // After the frame that paints the page, not in it. The timer beside it is for a page
    // that is given no frame (a window behind another): late, never lost.
    requestAnimationFrame(() => setTimeout(run, 0));
    setTimeout(run, 400);
}

function renderOwesWarningsInto(root) {
    if (!owesAnyAdvance(State.schedule)) return;
    const node = read => {
        const fold = owesWarningsNode(read, OWES_HEAD_OPEN, id => reportWorkerChosen(id));
        if (fold) {
            fold.addEventListener('toggle', () => {
                OWES_HEAD_OPEN = fold.open === true;
                // Opened or shut, the row stands at another height: that is the room now.
                if (fold.isConnected) OWES_HEAD_ROOM = fold.getBoundingClientRect().height;
            });
        }
        return fold;
    };
    const kept = owesKeptNow();
    if (kept || typeof requestAnimationFrame !== 'function') {
        const fold = node(kept || owesReadNow());
        if (fold) root.appendChild(fold);
        // The room it takes, measured after the frame that lays the page out anyway (never
        // in the draw, which would force a layout of the whole sheet): drawn here from the
        // kept reading, the row is still what the NEXT late reading keeps room for - or the
        // sheet would jump up by its height and back when that reading arrives.
        if (typeof requestAnimationFrame === 'function') {
            owesAfterPaint(() => {
                if (!fold) OWES_HEAD_ROOM = 0;
                else if (fold.isConnected) OWES_HEAD_ROOM = fold.getBoundingClientRect().height;
            });
        }
        return;
    }
    // The row's margins are the place's own (css/design.css), so the two collapse against
    // their neighbours alike; the height is the row's as it last stood. No row last time:
    // no room, and the place takes none.
    const place = el('div', 'owes-pending');
    place.setAttribute('aria-hidden', 'true');
    if (OWES_HEAD_ROOM > 0) place.style.minHeight = `${OWES_HEAD_ROOM}px`;
    else place.hidden = true;
    root.appendChild(place);
    owesAfterPaint(() => {
        if (!place.isConnected) return;
        const fold = node(owesReadNow());
        if (fold) place.replaceWith(fold); else place.remove();
        // The height the row stands at, for the next time it is read late.
        OWES_HEAD_ROOM = fold ? fold.getBoundingClientRect().height : 0;
    });
}

// THE ONE BUTTON, AND IT ONLY NAVIGATES: the pay sheet, narrowed to this man, pointed at
// the period he was not closed in - where the existing closing button is. Nothing is
// closed or written from here.
function owesShowAccount(workerId, span) {
    OWES_PAGE = null;
    REPORT_SECTION = 'workers';
    REPORT_WORKERS = new Set([String(workerId)]);
    if (typeof currentView !== 'undefined' && currentView !== 'reports') showView('reports');
    showOtherAccount({ from: span.from, to: span.to });
}

// ---------------------------------------------------------------- the closures, drawn

// The way into «סגירות שנרשמו»: drawn when there is a closure on the record AND the record
// may be read the new way - `folded`, the answer the reading above it already has, so the
// gate is not asked a second time for a button.
function owesAppendClosuresEntry(root, folded) {
    if (folded !== true || !owesAnyClosure(State.schedule)) return;
    root.appendChild(button(OWES_TEXT.closures, 'btn-secondary owes-closures-entry', () => owesOpenPage('closures')));
}

function owesOpenPage(page) {
    OWES_PAGE = page;
    ADVANCE_WORKER = null;
    const root = document.getElementById('advancesView');
    if (root) clear(root);
    if (typeof currentView !== 'undefined' && currentView !== 'advances') showView('advances');
    else render();
    if (typeof window !== 'undefined' && typeof window.scrollTo === 'function') window.scrollTo(0, 0);
}

// Asked by renderAdvances before it draws the list: true when a page of this file was
// drawn instead. With the gate shut there is no such page - a closure is the new
// arithmetic.
function renderOwesPage(root) {
    if (OWES_PAGE === null) return false;
    // Somebody asked for a man's advances from another screen: his page wins.
    if (ADVANCE_WORKER) { OWES_PAGE = null; return false; }
    // The gate, by the reading of this moment - kept from the board this page was opened
    // from, unless the record moved since.
    if (typeof carryReportingEnabled !== 'function' || owesReadNow().folded !== true) {
        OWES_PAGE = null;
        return false;
    }
    const groups = owesClosures(State.schedule);
    const group = OWES_PAGE === 'closures' ? null : groups.filter(one => one.key === OWES_PAGE)[0] || null;
    if (group) { owesDrawClosure(root, group); return true; }
    OWES_PAGE = 'closures';
    owesDrawClosures(root, groups);
    return true;
}

function owesDrawClosures(root, groups) {
    const page = el('section', 'owes-closures');
    page.appendChild(button(OWES_REUSED.back, 'btn-secondary', () => owesOpenPage(null)));
    page.appendChild(el('h2', null, OWES_TEXT.closures));
    page.appendChild(el('p', 'hint', OWES_TEXT.closuresLimit));
    if (!groups.length) page.appendChild(emptyHint(OWES_TEXT.closuresNone));
    const list = el('div', 'owes-closure-list');
    groups.forEach(group => {
        const when = owesClosureWhen(group);
        const card = button('', 'owes-closure-card btn-secondary', () => owesOpenPage(group.key));
        card.dataset.closure = group.key;
        card.appendChild(el('strong', null, when.date ? `${when.day} ${when.date}` : OWES_TEXT.noTime));
        card.appendChild(el('span', null, owesClosureSummary(group)));
        list.appendChild(card);
    });
    page.appendChild(list);
    root.appendChild(page);
}

function owesDrawClosure(root, group) {
    const page = el('section', 'owes-closure');
    page.appendChild(button(OWES_TEXT.backToClosures, 'btn-secondary', () => owesOpenPage('closures')));
    page.appendChild(el('h2', null, owesClosureTitle(group)));
    page.appendChild(el('p', 'owes-closure-meta', owesClosureMeta(group)));

    const figures = (deducted, net, remained) => {
        const row = el('div', 'owes-figures');
        [[OWES_TEXT.deducted, deducted], [OWES_REUSED.toPay, net], [OWES_TEXT.remained, remained]]
            .forEach(([label, value]) => {
                const cell = el('span', 'owes-figure');
                cell.appendChild(el('small', null, label));
                cell.appendChild(el('b', null, value));
                row.appendChild(cell);
            });
        return row;
    };
    const list = el('div', 'owes-closure-rows');
    list.setAttribute('aria-label', OWES_TEXT.who);
    group.items.forEach(item => {
        const row = el('div', 'owes-closure-row');
        row.dataset.worker = item.workerId;
        row.appendChild(el('strong', 'owes-name', item.name));
        row.appendChild(el('span', 'owes-line', owesSpanText(item)));
        row.appendChild(figures(owesMoney(item.deducted), owesNet(item), owesMoney(item.remained)));
        list.appendChild(row);
    });
    const sum = el('div', 'owes-closure-row owes-closure-sum');
    sum.appendChild(el('strong', 'owes-name', OWES_TEXT.sum));
    sum.appendChild(figures(owesMoney(group.totals.deducted), owesMoney(group.totals.net),
        owesMoney(group.totals.remained)));
    list.appendChild(sum);
    page.appendChild(list);
    page.appendChild(el('p', 'hint', OWES_TEXT.history));

    // The text and its two doors. A read-only field, because copyTextOut selects what it
    // copies and a person may want to read what is about to leave.
    const field = document.createElement('textarea');
    field.id = 'owesClosureText';
    field.readOnly = true;
    field.rows = Math.min(14, 5 + group.items.length * 2);
    field.value = owesClosureText(group);
    field.setAttribute('aria-label', OWES_TEXT.textLabel);
    page.appendChild(field);
    const status = el('span', 'share-status');
    status.id = 'owesClosureStatus';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    const doors = el('div', 'finance-actions owes-doors');
    doors.appendChild(button(OWES_REUSED.send, 'btn-success', () =>
        shareTextOut(field.value, status, () => { setTimeout(() => { status.textContent = ''; }, 4000); })));
    doors.appendChild(button(OWES_REUSED.copy, 'btn-secondary', () => copyTextOut(field, status)));
    page.appendChild(doors);
    page.appendChild(status);
    root.appendChild(page);
}
