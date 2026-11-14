// «סגירת שבוע» - the week's accounts closed in one sitting, from one screen.
//
// The owner, 2026-11-13: he loses money to a deduction that was not made and to an advance
// that is forgotten, and he closes ALL AT ONCE, ONCE A WEEK. Until now a close was one
// button per man per period (renderPeriodClosure / closeAccountFor, js/ui/reports.js), and
// most periods were never closed: the pay sheet then PRESUMES the deduction (advanceWalk,
// js/model/schema.js) and the ledger never hears of it (js/ui/owes.js says why at length).
// This screen is that same button, pressed for every man of the week, after one look at
// all of them together.
//
// IT IS THE PER-MAN CLOSE, RUN FOR MANY MEN - not a second payroll and not a second
// arithmetic:
//
//   - THE ONE WRITER. Every entry is written by closePeriodChanges (js/model/ledger.js), the
//     function closeAccountFor calls, at ONE moment, and committed by ONE
//     saveFinancialAction (one State.commitMany, one journal batch). No new entry kind, no
//     new field, never a 'repaid' («העובד החזיר כסף» is cash, and cash for money the sheet
//     already took off a wage counts the same shekels twice). tests/weeklyclose.test.mjs
//     holds the record after a pass byte for byte equal to the same men closed one by one
//     through closeAccountFor.
//   - EVERY FIGURE IS THE MODEL'S. The wage, what he carried in, what he was handed, what can
//     come off (planPeriodClosure's own `deducted`), and for an amount typed what is left to
//     pay and what stays owed - advanceAccount's own two lines (net = gross - off,
//     carriedForward = balance - off), held equal to planPeriodClosure(..., x) and to the
//     per-man box's preview for every amount the suite tries.
//   - NOTHING IS WRITTEN BY LOOKING. The reading writes no key and no field; the choices are
//     memory, and a reload forgets them.
//
// WHAT IT REFUSES, each in one sentence on the man's own card, never by leaving him out:
//
//   - A PERIOD OF HIS BEHIND IT LEFT OPEN WHILE HE OWED (the owner's D5: old periods are
//     reviewed by hand, oldest first). A period that is still open while money he owed ran
//     through it is a period the sheet went on presuming deductions in; a later period
//     closed in front of it records deductions computed FROM that presumption, and a day
//     typed into the open one afterwards takes the same money off a second wage (measured:
//     2,610 recorded against a 2,000 advance - the design's finding L7). So this screen
//     never closes a later period while such an earlier one is open: it names the earlier
//     one and offers the one button v195 already has, which only NAVIGATES there. It closes
//     nothing old by itself.
//   - A PHONE THAT IS NOT «מסונכרן בין המכשירים» (D4). Two phones closing one account with
//     two amounts write one id in two shapes, and one of them is held aside for good. The
//     question is the permanent deletion's own (deletionBlockers, js/ui/roster.js), asked
//     before the summary and again as the first line of the write. It cannot make two
//     phones that are both synced and both pressing in the same seconds safe - only a rule
//     on the server can - which is why the rule the owner chose is also "one phone closes".
//   - A RECORD THAT MOVED SINCE IT WAS SHOWN. At the press the whole list is read again at
//     the moment of the write and every chosen man compared with what the screen showed -
//     the ledger's balance included. Any difference stops the WHOLE pass, writes nothing,
//     and shows the list again with the men who moved named.
//   - Every reason the per-man box refuses (planPeriodClosure: overpaid, overlap, clock,
//     unpriced), in that box's own words.
//
// WHAT IT COSTS, and why it is counted. The model's readers are pure and repeat themselves:
// every one of them sorts the whole ledger again (ledgerEntries), folds it again
// (foldLedger) and prices the whole crew's period again (payrollReport) - measured on a
// season of fourteen men, a pass of fourteen closes took ten seconds in Node, and the
// migration's plan another two. weeklyCloseOnce answers those questions once per state of
// the record for the length of one synchronous step, and forgets everything the moment the
// ledger is appended to; tests/weeklyclose.test.mjs holds every change built inside it
// equal to the same change built outside it.

// ================================================================== THE WORDS
//
// Every Hebrew string this screen adds, in one block. PROPOSED, not approved: the owner saw
// pictures of a mock-up (2026-11-13), not these words on a phone. Pinned word for word in
// tests/weeklyclose.test.mjs, so changing one is a decision. A name or a range handed to a
// template is already bidi-isolated by the caller.
const WEEKLY_CLOSE_TEXT = Object.freeze({
    entry: 'סגירת שבוע',
    title: 'סגירת שבוע',
    lead: 'כל עובד בתקופה שלו שנגמרה. הניכוי ממולא כמו בדוח - אפשר להקטין אותו, לבחור «בלי ניכוי», או לדלג על עובד.',
    step1: '1 · בדיקה',
    step2: '2 · סיכום',
    step3: '3 · נסגר',
    reading: 'מחשב את החשבונות…',
    nobody: 'אין עכשיו חשבונות לסגור.',
    stale: 'הרישום השתנה מאז שנפתח המסך. הכל ייבדק שוב כשתאשר.',
    // --- a man's row
    wage: 'שכר',
    deduct: 'ניכוי',
    remain: 'יישאר חוב',
    stateAll: 'הכל',
    statePart: 'חלק',
    stateNone: 'בלי ניכוי',
    stateNoWage: 'אין שכר',
    stateNoDebt: 'בלי מקדמות',
    stateSkipped: 'דילגת',
    stateHeld: 'לא ייסגר',
    // --- a man's card, opened
    wageDays: days => (days === 1 ? 'שכר התקופה · יום אחד' : `שכר התקופה · ${days} ימים`),
    carriedIn: 'יתרה מחשבון קודם',
    totalOwed: 'סה״כ חוב',
    allButton: amount => `הכל · ${amount}`,
    noneButton: 'בלי ניכוי',
    skipButton: 'דלג על העובד',
    unskipButton: 'בטל דילוג',
    skippedLine: 'לא ייסגר עכשיו. שום דבר שלו לא ישתנה.',
    badAmount: most => `כתוב סכום בספרות בין 0 ל-${most} ₪.`,
    changedHere: 'הנתונים שלו השתנו מאז שנפתח המסך. הסכום חזר למה שהדוח מציע - בדוק אותו.',
    // --- why a man is shown and cannot be closed here
    heldEndsToday: 'התקופה שלו נגמרת היום, והיום עוד לא נרשם לו. רשום את היום ואז סגור.',
    heldEarlier: dates => `חשבון קודם שלו לא נסגר (${dates}). סוגרים מהישן לחדש: סגור קודם את החשבון ההוא, ידנית.`,
    heldEarlierBehind: dates => `חשבון קודם שלו לא נסגר (${dates}), ותקופה מאוחרת יותר שלו כבר נסגרה. `
        + 'סגירה של החשבון ההוא עלולה לנכות את אותה מקדמה פעמיים - בדוק את עמוד המקדמות שלו לפני שסוגרים אותו.',
    heldOther: 'אי אפשר לסגור אותו כאן. סגור אותו מהחשבון שלו בדוח.',
    // --- the foot
    footDeduct: 'ינוכה',
    next: 'המשך לסיכום',
    back: 'חזרה',
    // --- the summary
    willClose: count => (count === 1 ? 'ייסגר חשבון אחד' : `ייסגרו ${count} חשבונות`),
    worker: 'עובד',
    zeroList: 'בלי ניכוי הפעם, והחוב עובר הלאה:',
    skippedList: 'לא נסגר עכשיו (דילגת):',
    heldList: 'לא נסגר עכשיו - צריך לבדוק קודם:',
    noneChosen: 'לא נבחר אף עובד לסגירה.',
    confirm: count => (count === 1 ? 'סגור חשבון אחד' : `סגור ${count} חשבונות`),
    saving: 'שומר…',
    // --- the phone is not the one to close from now
    notSynced: 'סוגרים חשבונות רק כשמופיע «מסונכרן בין המכשירים» - כך שני טלפונים לא יסגרו את אותו חשבון בסכומים שונים.',
    notSyncedPending: 'יש בטלפון הזה רישום שעוד לא נשלח או שמחכה לבדיקה ב-⋯, ולכן לא סוגרים ממנו חשבונות עד שיופיע «מסונכרן בין המכשירים».',
    noDisk: 'הטלפון הזה לא מצליח כרגע לשמור את הרישום, ולכן לא סוגרים ממנו חשבונות. לא נרשם דבר.',
    otherWindow: 'הרישום בטלפון הזה השתנה מחלון אחר של האפליקציה. לא נרשם דבר. סגור את המסך הזה, חכה רגע ופתח אותו שוב.',
    // --- the write did not happen
    movedNames: names => `השתנה אצל: ${names}.`,
    notWritten: 'לא נשמר דבר. נסה שוב, ואם זה חוזר - סגור כל עובד מהחשבון שלו בדוח.',
    tooMany: (count, most) => `זה יותר מדי רישומים לפעם אחת (${count}, ואפשר עד ${most}). דלג על חלק מהעובדים, סגור, ואז סגור את השאר.`,
    tooLarge: 'הרישום המשותף קרוב לגודל המרבי שהענן מקבל, ולכן לא נרשם דבר. צריך לטפל בזה לפני שסוגרים עוד חשבונות.',
    // --- on the closure's own page afterwards (js/ui/owes.js)
    notClosedHere: 'לא נסגרו בסגירה הזאת:'
});

// The words this screen borrows, each beside the screen that owns it. Repeated here because
// those screens build them inline; tests/weeklyclose.test.mjs finds every one of them in its
// owner's source, so a word changed there and not here fails by name. PAY_CYCLE_LABELS,
// OTHER_ACCOUNT_SHOW, NO_DAILY_RATE_NOTE, CLOSURE_CLOCK_BEHIND, ADVANCE_CREDIT_FROM_BEFORE and
// LEDGER_KIND_LABELS
// (js/ui/reports.js) and OWES_TEXT.sum (js/ui/owes.js) are read, not repeated.
const WEEKLY_CLOSE_REUSED = Object.freeze({
    toPay: 'לתשלום',                                          // js/ui/reports.js, the sheet's column
    givenHere: 'מקדמות בתקופה',                               // js/ui/reports.js, the days dialog
    field: 'כמה לקזז מהשכר הפעם?',                            // js/ui/reports.js, the account's close
    preview: (net, left) => `לתשלום לעובד: ${net} ₪ · יישאר חוב פתוח: ${left} ₪`,
                                                             // js/ui/reports.js, the account's close
    final: 'סגירה היא סופית - אי אפשר לבטל אותה, רק לרשום תיקון לצידה.',
                                                             // js/ui/reports.js, the account's close
    changed: 'החשבון השתנה בזמן האישור. לא נשמר ניכוי. בדוק את הסכומים ואשר שוב.',
                                                             // js/ui/reports.js, the account's close
    overpaid: 'יש עודף בהחזרי המקדמות של העובד הזה. אי אפשר לסגור חשבון שלא מסתדר - '
        + 'תקן קודם, ואז סגור.',                              // js/ui/reports.js, the account's close
    overlap: 'התקופה הזאת חופפת לתקופה שכבר נסגרה לעובד הזה. סגירה שנייה על אותם ימים '
        + 'תנכה את אותה מקדמה פעמיים - לכן היא חסומה. בדוק את מחזור התשלום של העובד '
        + 'ואת התקופות שכבר נסגרו לו.',                       // js/ui/reports.js, the account's close
    gateShut: 'לפני רישום החזרים או קיזוז צריך לבדוק את יתרות המקדמות הקיימות.'
                                                             // js/ui/reports.js, the advances page
});

// ================================================================== the limits

// A second press inside this window does nothing (the payslips' and the batch's idiom).
const WEEKLY_CLOSE_TAP_GUARD_MS = 1500;
// The shared record's size after the close, in UTF-8 bytes of its JSON: three quarters of
// the cloud document's 1 MiB, the figure the design named (the batch branch's own reason).
const WEEKLY_CLOSE_RECORD_LIMIT = 768 * 1024;
// A walk driven by dates on a record is a walk a damaged date could send forever.
const WEEKLY_CLOSE_WALK_CEILING = 4000;

function weeklyCloseCents(value) {
    return Math.round((Number(value) || 0) * 100);
}

// The UTF-8 length of a string, counted (a Node device has no TextEncoder).
function weeklyCloseBytes(text) {
    const value = String(text);
    let bytes = 0;
    for (let i = 0; i < value.length; i += 1) {
        const code = value.charCodeAt(i);
        if (code < 0x80) bytes += 1;
        else if (code < 0x800) bytes += 2;
        else if (code >= 0xD800 && code <= 0xDBFF && i + 1 < value.length) {
            const next = value.charCodeAt(i + 1);
            if (next >= 0xDC00 && next <= 0xDFFF) { bytes += 4; i += 1; } else bytes += 3;
        } else bytes += 3;
    }
    return bytes;
}

// ================================================================== one step, each answer once
//
// FOR THE LENGTH OF ONE SYNCHRONOUS STEP the record cannot change except through the
// writer, so each of the model's repeated questions is answered once per STATE of the
// record:
//
//   ledgerEntries / foldLedger   the ledger sorted and folded         (js/model/ledger.js)
//   advanceHistory               one advance's entries, in that order (js/model/ledger.js)
//   payrollReport                the crew's sheet of one range        (js/model/money.js)
//   closedPeriods                a man's closed periods               (js/model/ledger.js)
//   carryReportingEnabled        the gate, by owesGateAnswer          (js/ui/owes.js)
//   planCarryMigration           planned only when the record does NOT carry the approval:
//                                carryMigrationApproved reads nothing of a plan but its id,
//                                which is the constant carryMigrationId(), so on an approved
//                                record no caller can tell the stub from the plan
//
// THE STATE OF THE RECORD is the schedule object, its ledger map, its map of advances and a
// counter that the one appender moves on every call. The ledger is append-only (iron law 1)
// and appendLedgerEntry is the only place an entry is added to a live record
// (js/model/ledger.js), so whatever the writer does is a new state and every answer is asked
// again; State.rollback replaces the schedule object, which is a new state too. A copy of the
// record a reader builds for itself (outstandingWithout) is a schedule object of its own and
// is answered for itself. Answers are handed back as the readers hand them - nobody writes
// to them - except the two lists, which are handed out as copies, because a caller that
// sorted one in place would reorder it for the next.
//
// tests/weeklyclose.test.mjs holds every change a pass builds inside this equal, byte for
// byte, to the same change built with no memory at all.
//
// `memo: false` keeps only the gate and the plan (the write's own commit runs that way:
// render() may be called from inside a commit, and the pay sheet decorates its rows).
function weeklyCloseOnce(work, options) {
    const memo = !(options && options.memo === false);
    const real = {
        entries: ledgerEntries, fold: foldLedger, history: advanceHistory, append: appendLedgerEntry,
        sheet: payrollReport, closed: closedPeriods, gate: carryReportingEnabled, plan: planCarryMigration
    };
    let moved = 0;
    const slots = new WeakMap();
    const now = schedule => {
        if (!schedule || typeof schedule !== 'object') return null;
        const held = (schedule.ledger && schedule.ledger.advances) || null;
        const legacy = schedule.advances || null;
        let slot = slots.get(schedule);
        if (!slot || slot.held !== held || slot.legacy !== legacy || slot.moved !== moved) {
            slot = { held, legacy, moved, entries: null, fold: null, history: null,
                sheets: new Map(), closed: new Map(), gate: undefined };
            slots.set(schedule, slot);
        }
        return slot;
    };
    const approved = schedule => typeof carryMigrationApproved === 'function' && typeof carryMigrationId === 'function'
        && carryMigrationApproved(schedule, { id: carryMigrationId() }) === true;
    appendLedgerEntry = function () {
        moved += 1;
        try { return real.append.apply(this, arguments); } finally { moved += 1; }
    };
    planCarryMigration = function (schedule) {
        if (arguments.length === 1 && approved(schedule)) return { id: carryMigrationId(), rows: [], needed: false };
        return real.plan.apply(this, arguments);
    };
    carryReportingEnabled = function (schedule) {
        const slot = arguments.length === 1 ? now(schedule) : null;
        if (!slot) return real.gate.apply(this, arguments);
        if (slot.gate === undefined) slot.gate = owesGateAnswer(schedule, real.gate);
        return slot.gate;
    };
    if (memo) {
        const entriesOf = slot => {
            if (!slot.entries) slot.entries = real.entries(slot.of);
            return slot.entries;
        };
        ledgerEntries = function (schedule) {
            const slot = arguments.length === 1 ? now(schedule) : null;
            if (!slot) return real.entries.apply(this, arguments);
            slot.of = schedule;
            return entriesOf(slot).slice();
        };
        foldLedger = function (schedule) {
            const slot = arguments.length === 1 ? now(schedule) : null;
            if (!slot) return real.fold.apply(this, arguments);
            if (!slot.fold) slot.fold = real.fold(schedule);
            return slot.fold;
        };
        // advanceHistory is ledgerEntries filtered to one advance, in the same order: the
        // whole ledger grouped once, in that order.
        advanceHistory = function (schedule, advanceId) {
            const slot = arguments.length === 2 ? now(schedule) : null;
            if (!slot) return real.history.apply(this, arguments);
            if (!slot.history) {
                slot.of = schedule;
                slot.history = new Map();
                entriesOf(slot).forEach(entry => {
                    const key = String(entry.advanceId);
                    if (!slot.history.has(key)) slot.history.set(key, []);
                    slot.history.get(key).push(entry);
                });
            }
            return (slot.history.get(String(advanceId)) || []).slice();
        };
        payrollReport = function (schedule, from, to) {
            const slot = arguments.length === 3 ? now(schedule) : null;
            if (!slot) return real.sheet.apply(this, arguments);
            const key = `${from}..${to}`;
            if (!slot.sheets.has(key)) slot.sheets.set(key, real.sheet(schedule, from, to));
            return slot.sheets.get(key);
        };
        closedPeriods = function (schedule, workerId) {
            const slot = arguments.length === 2 ? now(schedule) : null;
            if (!slot) return real.closed.apply(this, arguments);
            const key = String(workerId);
            if (!slot.closed.has(key)) slot.closed.set(key, real.closed(schedule, workerId));
            return slot.closed.get(key);
        };
    }
    try {
        return work();
    } finally {
        ledgerEntries = real.entries;
        foldLedger = real.fold;
        advanceHistory = real.history;
        appendLedgerEntry = real.append;
        payrollReport = real.sheet;
        closedPeriods = real.closed;
        carryReportingEnabled = real.gate;
        planCarryMigration = real.plan;
    }
}

// ================================================================== the reading (pure)
//
// Nothing below writes the DOM, the record or a Store key. Each function is handed the
// schedule it reads.

// TODAY IS RECORDED FOR HIM: today is a working day on the record, and the day's own check
// («בדיקת היום», js/ui/daycheck.js) does not name him as possibly forgotten. Marking him
// absent counts as recorded. (The batch branch's rule, unchanged.)
function weeklyCloseTodayRecorded(schedule, workerId, today, memo) {
    const held = memo || {};
    if (held.today !== today || held.schedule !== schedule) {
        held.today = today;
        held.schedule = schedule;
        held.working = typeof dayCheckIsWorkingDay === 'function' && dayCheckIsWorkingDay(schedule, today, 'actual');
        held.read = held.working ? dayCheckRead(schedule, today, 'actual', today) : null;
    }
    if (!held.working) return false;
    return !held.read.check.some(finding => (finding.kind === 'forgot' || finding.kind === 'emptySite')
        && (finding.workers || []).some(worker => String(worker.id) === String(workerId)));
}

// HIS LAST FINISHED PERIOD - his own cycle, never a period that ends after today. The period
// holding today when it ends today and today is recorded for him (held otherwise: a day
// typed after a close is in nobody's account); else the one before it.
function weeklyCloseTarget(schedule, worker, today, memo) {
    const current = periodRangeFor(worker, today);
    if (current.to < today) return { period: current, todayHeld: false };
    if (current.to === today) {
        return { period: current, todayHeld: !weeklyCloseTodayRecorded(schedule, worker.id, today, memo) };
    }
    return { period: periodRangeFor(worker, shiftDate(current.from, -1)), todayHeld: false };
}

// THE OLDEST PERIOD OF HIS, BEFORE `from`, THAT IS STILL OPEN AND THAT A DEBT RAN THROUGH:
// he came into it owing, or in credit, or something was handed over or back in it. That is
// a period the sheet presumes a deduction in that nobody recorded, and a later close made
// in front of it is computed from that presumption (finding L7). Periods with no money in
// them are not asked about: nothing can be taken twice through them.
//
// His periods are walked the way advancePositionInto walks them (accountsBefore and
// advanceWalk, each handing the next where he stands), so each period's figures are
// advanceAccount's own. Answers { from, to, behindClosed, position } or null - `position`
// is where he stands as `from` opens, which the caller hands to the target's own walk.
function weeklyCloseEarlier(schedule, workerId, from) {
    const periods = accountsBefore(schedule, workerId, from);
    let position = 0;
    let open = null;
    let closedAfter = false;
    for (let n = 0; n < periods.length && n < WEEKLY_CLOSE_WALK_CEILING; n += 1) {
        const period = periods[n];
        const walk = advanceWalk(schedule, workerId, period.from, period.to, position);
        position = walk.position;
        if (walk.closed) {
            if (open) closedAfter = true;
            continue;
        }
        const money = walk.carriedIn > 0 || walk.creditIn > 0 || walk.given > 0 || walk.repaid > 0
            || walk.reversed !== 0;
        if (money && !open) open = { from: period.from, to: period.to };
    }
    return { earlier: open ? Object.assign(open, { behindClosed: closedAfter }) : null, position };
}

// The planner's reasons, in the order this screen says them.
const WEEKLY_CLOSE_PLAN_REASONS = ['overpaid', 'overlap', 'clock', 'unpriced', 'deduction'];

// ONE MAN, READ. Everything his row and his card say, and everything the write will hold
// him to (`sig`). null when he has no account in his last finished period at all, or it is
// already closed.
function weeklyCloseMan(schedule, worker, today, at, memo) {
    const id = String(worker.id);
    const target = weeklyCloseTarget(schedule, worker, today, memo);
    const period = target.period;
    if (frozenPeriodFor(schedule, id, period.from, period.to) !== undefined) return null;
    const row = payrollReport(schedule, period.from, period.to)
        .filter(item => String(item.workerId) === id)[0] || null;
    const back = weeklyCloseEarlier(schedule, id, period.from);
    const account = advanceWalk(schedule, id, period.from, period.to, back.position);
    const recorded = Boolean(row) && (row.attendanceDays > 0 || row.absent > 0 || Number(row.advances) > 0);
    const money = account.carriedIn > 0 || account.creditIn > 0 || account.given > 0 || account.repaid > 0;
    if (!recorded && !money) return null;
    const open = openAdvanceBalance(schedule, id);
    const man = {
        id,
        name: worker.name === undefined || worker.name === null ? '' : String(worker.name),
        active: worker.active !== false,
        cycle: period.cycle,
        from: period.from,
        to: period.to,
        days: row ? row.attendanceDays : 0,
        gross: account.gross,
        carriedIn: account.carriedIn,
        creditIn: account.creditIn,
        given: account.given,
        repaid: account.repaid,
        // advanceAccount's own line: what he owes before anything comes off this wage.
        balance: agoraRound(account.carriedForward + account.deducted),
        max: 0,
        ledgerLeft: open ? open.total : 0,
        held: null
    };
    if (target.todayHeld) man.held = { kind: 'endsToday' };
    else if (back.earlier) {
        man.held = { kind: back.earlier.behindClosed ? 'earlierBehind' : 'earlier',
            from: back.earlier.from, to: back.earlier.to };
    } else {
        // The per-man box's own question, at the moment the write will ask it.
        const plan = planPeriodClosure(schedule, id, period.from, period.to, at);
        if (!plan.canClose) {
            const reason = WEEKLY_CLOSE_PLAN_REASONS.filter(one => plan.reasons.indexOf(one) !== -1)[0] || 'other';
            man.held = { kind: reason };
        } else {
            man.max = plan.deducted;
            man.gross = plan.gross;
        }
    }
    man.sig = JSON.stringify([man.name, man.active, man.cycle, man.from, man.to, man.days, man.gross,
        man.carriedIn, man.creditIn, man.given, man.repaid, man.balance, man.max, man.ledgerLeft, man.held]);
    return man;
}

// THE WHOLE LIST, at one moment: every man whose last finished period is open and holds
// anything, grouped by his period - oldest first, weekly before fortnightly - in the
// roster's order inside a group. `gate` false: the record nobody approved, or this build's
// writer shut - no figure at all (tests/approval.test.mjs).
//
// THE TWO SCOPES AGREE (v197). The pay sheet's one reading (reportReadOnce, js/ui/reports.js,
// v196) is opened OUTSIDE this pass's own (weeklyCloseOnce), so the gate this list is read
// under is the one «דוחות» and «מקדמות» are drawn under - answered once, kept under the
// record itself between draws - and weeklyCloseOnce, inside it, still forgets every answer
// the moment the ledger is appended to. The reading writes nothing, so nothing is appended
// inside it; the WRITE (weeklyCloseWrite) is never inside reportReadOnce, whose answers do
// not know an append - it calls this, which closes the reading before a byte is written.
// A reading already open (owesClosures under a draw of «מקדמות») is the same reading.
function weeklyCloseRead(schedule, today, at) {
    const read = () => weeklyCloseReadIn(schedule, today, at);
    return typeof reportReadOnce === 'function' ? reportReadOnce(read) : read();
}

function weeklyCloseReadIn(schedule, today, at) {
    return weeklyCloseOnce(() => {
        if (!financialWritingEnabled(schedule)) return { gate: false, today, at, men: [], groups: [] };
        const memo = {};
        const men = ((schedule && schedule.workers) || [])
            .filter(worker => worker && worker.id)
            .map(worker => weeklyCloseMan(schedule, worker, today, at, memo))
            .filter(Boolean);
        const groups = [];
        men.forEach(man => {
            const key = `${man.from}|${man.to}|${man.cycle}`;
            let group = groups.filter(one => one.key === key)[0];
            if (!group) {
                group = { key, from: man.from, to: man.to, cycle: man.cycle, men: [] };
                groups.push(group);
            }
            group.men.push(man);
        });
        groups.sort((a, b) => (a.from !== b.from ? (a.from < b.from ? -1 : 1)
            : a.cycle === b.cycle ? 0 : (a.cycle === 'weekly' ? -1 : 1)));
        return { gate: true, today, at, men, groups };
    });
}

// What his row and his card say for an amount chosen: advanceAccount's own two lines with
// that amount as the deduction.
function weeklyCloseFigures(man, x) {
    return {
        deducted: agoraRound(x),
        net: man.gross === null ? null : agoraRound(man.gross - x),
        left: agoraRound(man.balance - x)
    };
}

// AN AMOUNT AS IT WAS TYPED. Trimmed; Arabic-Indic and Persian digits read as digits (the
// per-man box's own conversion); digits, then at most one '.' with at most two after it.
// Nothing else. Between 0 and the most the sheet can take.
function weeklyCloseParse(text, max) {
    const western = String(text === undefined || text === null ? '' : text).trim()
        .replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 0x0660))
        .replace(/[۰-۹]/g, digit => String(digit.charCodeAt(0) - 0x06F0))
        .replace(/٫/g, '.');
    if (!/^\d+(\.\d{0,2})?$/.test(western)) return { ok: false, value: null };
    const value = agoraRound(Number(western));
    if (!Number.isFinite(value) || value < 0 || weeklyCloseCents(value) > weeklyCloseCents(max)) {
        return { ok: false, value };
    }
    return { ok: true, value };
}

// ================================================================== may this phone close now

// THE PERMANENT DELETION'S OWN QUESTION (deletionBlockers, js/ui/roster.js), word for word:
// a cloud is connected and has spoken, the record is in the ordering protocol, the line
// honestly reads synced - nothing pending, held, contested or blocked - and the browser has
// a signal. tests/weeklyclose.test.mjs holds roster.js to the same expression.
function weeklyCloseShared() {
    const sync = typeof FarkadSync !== 'undefined' ? FarkadSync : null;
    return Boolean(sync && sync.adapter && sync._heardFromCloud
        && Number.isInteger(sync._revision) && sync._revision >= 1
        && sync.status === 'synced' && sync.honestStatusFor('synced') === 'synced'
        && (typeof navigator === 'undefined' || navigator.onLine !== false));
}

// Why this window may not close an account now - one sentence - or null when it may.
function weeklyCloseReadyWord() {
    if (typeof Store === 'undefined' || !Store.available) return WEEKLY_CLOSE_TEXT.noDisk;
    if (!weeklyCloseShared()) {
        // Something ON THIS PHONE is the reason - a write not sent, one held for a person,
        // a record it cannot read - or simply not there yet (connecting, offline, no cloud).
        const sync = typeof FarkadSync !== 'undefined' ? FarkadSync : null;
        const owed = Boolean(sync && sync.adapter) && ((typeof sync.pendingCount === 'function' && sync.pendingCount() > 0)
            || (typeof sync.holdingContested === 'function' && sync.holdingContested() === true));
        const blocked = typeof farkadWritesBlocked === 'function' && farkadWritesBlocked();
        return owed || blocked ? WEEKLY_CLOSE_TEXT.notSyncedPending : WEEKLY_CLOSE_TEXT.notSynced;
    }
    if (!State.stillCurrent()) return WEEKLY_CLOSE_TEXT.otherWindow;
    return null;
}

// ================================================================== the write

// THE ONE SYNCHRONOUS BLOCK. `picks` = [{ man, x }], every man as the screen showed him.
// Nothing in here awaits anything: what is compared is what is written.
//
// Answers { notReady } | { moved: [ids] } | { failure } | { saved, at, by, closed: [ids] }.
function weeklyCloseWrite(picks) {
    const at = new Date().toISOString();
    const by = syncDeviceId();
    const result = { at, by, notReady: null, moved: [], failure: null, saved: false, closed: [] };
    const notReady = weeklyCloseReadyWord();
    if (notReady) { result.notReady = notReady; return result; }

    // The whole list again, at the moment of the write, and every chosen man compared with
    // what was shown - his period, his figures, what can come off, the ledger's balance.
    const now = weeklyCloseRead(State.schedule, todayStr(), at);
    picks.forEach(pick => {
        const again = now.men.filter(man => man.id === pick.man.id)[0];
        if (!again || again.sig !== pick.man.sig || again.held) result.moved.push(pick.man.id);
    });
    if (!now.gate) result.moved = picks.map(pick => pick.man.id);
    if (result.moved.length > 0) return result;

    let built = [];
    let failure = null;
    // NO REDRAW INSIDE THE COMMIT. State.commitMany draws the whole app when it has written
    // (render, js/app.js) - here the page under the dialog, which is «דוחות» or «מקדמות», and
    // which this pass leaves the moment the commit returns for the close's own page. On a
    // season of days that draw of «דוחות» was most of the press: measured in Chromium with
    // the processor slowed 4x, 11 of the write's 13 seconds. So for the length of the commit
    // the draw is held, and the page is drawn ONCE afterwards by whoever answers the press
    // (weeklyCloseAfter: the close's page, or render() itself on every other road).
    const realRender = typeof render === 'function' ? render : null;
    if (realRender) render = () => {};
    try {
    result.saved = weeklyCloseOnce(() => saveFinancialAction(() => {
        try {
            weeklyCloseOnce(() => {
                for (const pick of picks) {
                    const made = closePeriodChanges(State.schedule, pick.man.id, pick.man.from, pick.man.to,
                        at, by, pick.x);
                    const artifacts = made.filter(change => change && change.value && change.value.kind === 'closed');
                    const deductions = made.filter(change => change && change.value && change.value.kind === 'deducted');
                    const taken = agoraRound(deductions.reduce((sum, change) => sum + (Number(change.value.amount) || 0), 0));
                    const figures = weeklyCloseFigures(pick.man, pick.x);
                    // Exactly the per-man close the screen showed: one frozen payslip, the
                    // wage shown, the amount chosen and nothing else beside it, the balance
                    // shown carried.
                    if (artifacts.length !== 1 || artifacts.length + deductions.length !== made.length
                        || artifacts[0].value.gross !== pick.man.gross
                        || weeklyCloseCents(taken) !== weeklyCloseCents(pick.x)
                        || weeklyCloseCents(artifacts[0].value.balanceAfter) !== weeklyCloseCents(figures.left)) {
                        failure = { kind: 'build', id: pick.man.id };
                        return;
                    }
                    made.forEach(change => built.push(change));
                }
            });
        } catch (error) {
            failure = { kind: 'threw', message: String((error && error.message) || error) };
        }
        if (!failure && built.length + 1 > MAX_PATHS_PER_WRITE) failure = { kind: 'tooMany', count: built.length };
        if (!failure && weeklyCloseBytes(JSON.stringify(State.schedule)) > WEEKLY_CLOSE_RECORD_LIMIT) {
            failure = { kind: 'tooLarge' };
        }
        if (failure) {
            // Memory back to what the disk and the journal hold: the entries the writer
            // appended as it went are gone with it, and nothing was journalled.
            State.rollback();
            built = [];
            return [];
        }
        return built;
    }), { memo: false });
    } finally {
        if (realRender) render = realRender;
    }
    result.failure = failure;
    if (failure || !result.saved) return result;
    // READ BACK, never assumed: a man is closed when his period reads closed under this
    // write's own moment.
    result.closed = picks.filter(pick => {
        const artifact = periodArtifactFor(State.schedule, pick.man.id, pick.man.from);
        return artifact && artifact.at === at && artifact.by === by;
    }).map(pick => pick.man.id);
    return result;
}

// ================================================================== the screen
//
// One dialog (#weeklyCloseModal, index.html), two pages: «בדיקה» - every man of the week
// with his field - and «סיכום» - what will be written, and BY NAME who closes with nothing
// taken, who was skipped and who could not be closed. The third, «נסגר», is the close's
// own page in «סגירות שנרשמו» (js/ui/owes.js). Memory only: a reload forgets all of it.

let WEEKLY_CLOSE = null;
let weeklyCloseLastTap = 0;
let weeklyCloseBusy = false;
let weeklyCloseWriting = false;
// What the closure page says about the men a pass did not close: { key, names }, memory.
let WEEKLY_CLOSE_LAST = null;

function weeklyCloseParts() {
    const get = id => document.getElementById(id);
    return { modal: get('weeklyCloseModal'), title: get('weeklyCloseTitle'), meta: get('weeklyCloseMeta'),
        steps: get('weeklyCloseSteps'), status: get('weeklyCloseStatus'), body: get('weeklyCloseBody'),
        totals: get('weeklyCloseTotals'), go: get('weeklyCloseGo'), back: get('weeklyCloseBack') };
}

function weeklyCloseIsOpen() {
    const parts = weeklyCloseParts();
    return Boolean(WEEKLY_CLOSE && parts.modal && parts.modal.style.display === 'flex');
}

function weeklyCloseMoney(value) {
    return `${moneyText(value)} ₪`;
}

function weeklyCloseDates(from, to) {
    return dateRange(formatShortDate(parseLocalDate(from)), formatShortDate(parseLocalDate(to)));
}

// WHETHER THIS RECORD MAY BE CLOSED AT ALL: financialWritingEnabled, the per-man box's own
// gate - asked through owesGateAnswer, so that on a record that carries the approval it costs
// nothing, and kept under the record itself (owesKey, js/ui/owes.js) so that the plan a record
// nobody approved needs is made once and not at every draw of «דוחות» and «מקדמות».
let WEEKLY_CLOSE_GATE = null;
function weeklyCloseGateNow() {
    if (typeof ledgerWritesEnabled !== 'function' || ledgerWritesEnabled() !== true) return false;
    const key = owesKey(State.schedule, todayStr());
    if (WEEKLY_CLOSE_GATE && WEEKLY_CLOSE_GATE.key === key) return WEEKLY_CLOSE_GATE.open;
    const open = owesGateAnswer(State.schedule, carryReportingEnabled) === true;
    WEEKLY_CLOSE_GATE = { key, open };
    return open;
}

// The one button, in the report (renderReports) and on top of «מקדמות» (renderOwesInto).
// Not on a build or a record that cannot write a close.
function weeklyCloseEntryButton() {
    if (!weeklyCloseGateNow()) return null;
    return button(WEEKLY_CLOSE_TEXT.entry, 'btn-secondary weekly-close-entry', () => openWeeklyClose());
}

// What the record was when the list was read: compared on render() to say «השתנה».
function weeklyCloseRecordKey() {
    return `${typeof Store === 'object' && Store ? Store.tick : 0}|${todayStr()}|${JSON.stringify(State.schedule)}`;
}

function openWeeklyClose() {
    const parts = weeklyCloseParts();
    if (!parts.modal) return false;
    WEEKLY_CLOSE = { step: 1, read: null, choices: {}, open: null, moved: [], stale: false, key: null,
        saving: false, error: null };
    parts.modal.style.display = 'flex';
    renderWeeklyClose();
    void parts.modal.offsetHeight;
    if (parts.title && parts.title.focus) parts.title.focus({ preventScroll: true });
    // Read after the dialog has painted «מחשב את החשבונות…».
    const read = () => { if (WEEKLY_CLOSE && !WEEKLY_CLOSE.read) weeklyCloseLoad([]); };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => setTimeout(read, 0));
    else read();
    return true;
}

function closeWeeklyClose() {
    // Not while the write is on its way: the person is told what it came to.
    if (WEEKLY_CLOSE && WEEKLY_CLOSE.saving) return;
    const parts = weeklyCloseParts();
    if (parts.modal) parts.modal.style.display = 'none';
    WEEKLY_CLOSE = null;
}

// (Re)reads the list. `moved` names men whose amount goes back to the sheet's proposal;
// every other man keeps the choice made for him, as long as he reads as he did.
function weeklyCloseLoad(moved) {
    if (!WEEKLY_CLOSE) return;
    const before = WEEKLY_CLOSE.read;
    const read = weeklyCloseRead(State.schedule, todayStr(), new Date().toISOString());
    const choices = {};
    read.men.forEach(man => {
        const had = WEEKLY_CLOSE.choices[man.id];
        const was = before ? before.men.filter(one => one.id === man.id)[0] : null;
        if (had && was && was.sig === man.sig && moved.indexOf(man.id) === -1) choices[man.id] = had;
        else choices[man.id] = { text: String(man.max), skip: false };
    });
    WEEKLY_CLOSE.read = read;
    WEEKLY_CLOSE.choices = choices;
    WEEKLY_CLOSE.moved = moved.slice();
    WEEKLY_CLOSE.stale = false;
    WEEKLY_CLOSE.key = weeklyCloseRecordKey();
    renderWeeklyClose();
}

// render() asks this (js/app.js): a record that moved under the screen raises one line, and
// nothing typed is lost - everything is compared again at the press.
function renderWeeklyCloseIfOpen() {
    if (!weeklyCloseIsOpen() || weeklyCloseWriting || !WEEKLY_CLOSE.read) return;
    if (!WEEKLY_CLOSE.stale && weeklyCloseRecordKey() !== WEEKLY_CLOSE.key) {
        WEEKLY_CLOSE.stale = true;
        weeklyCloseSay();
    }
}

// A man's choice, read: { skip, ok, x }.
function weeklyCloseChoice(man) {
    const choice = (WEEKLY_CLOSE && WEEKLY_CLOSE.choices[man.id]) || { text: String(man.max), skip: false };
    if (man.held) return { skip: true, held: true, ok: true, x: 0 };
    if (choice.skip) return { skip: true, ok: true, x: 0 };
    const parsed = weeklyCloseParse(choice.text, man.max);
    return { skip: false, ok: parsed.ok, x: parsed.ok ? parsed.value : 0 };
}

// The word on his row: all, part, none, no wage, skipped, held.
function weeklyCloseState(man, choice) {
    if (man.held) return ['held', WEEKLY_CLOSE_TEXT.stateHeld];
    if (choice.skip) return ['skipped', WEEKLY_CLOSE_TEXT.stateSkipped];
    // Nothing can come off: he owes nothing, or there is no wage to take it from.
    if (!(man.max > 0)) {
        return man.balance > 0 ? ['nowage', WEEKLY_CLOSE_TEXT.stateNoWage] : ['nodebt', WEEKLY_CLOSE_TEXT.stateNoDebt];
    }
    if (!choice.ok) return ['bad', WEEKLY_CLOSE_TEXT.statePart];
    if (weeklyCloseCents(choice.x) === 0) return ['none', WEEKLY_CLOSE_TEXT.stateNone];
    if (weeklyCloseCents(choice.x) === weeklyCloseCents(man.max)) return ['all', WEEKLY_CLOSE_TEXT.stateAll];
    return ['part', WEEKLY_CLOSE_TEXT.statePart];
}

function weeklyCloseTotals() {
    const out = { count: 0, deducted: 0, net: 0, left: 0, bad: [] };
    if (!WEEKLY_CLOSE || !WEEKLY_CLOSE.read) return out;
    WEEKLY_CLOSE.read.men.forEach(man => {
        const choice = weeklyCloseChoice(man);
        if (choice.skip) return;
        if (!choice.ok) { out.bad.push(man); return; }
        const figures = weeklyCloseFigures(man, choice.x);
        out.count += 1;
        out.deducted = agoraRound(out.deducted + figures.deducted);
        out.net = agoraRound(out.net + (figures.net || 0));
        out.left = agoraRound(out.left + figures.left);
    });
    return out;
}

function weeklyCloseSay() {
    const parts = weeklyCloseParts();
    if (!parts.status || !WEEKLY_CLOSE) return;
    const lines = [];
    if (!WEEKLY_CLOSE.read) lines.push(WEEKLY_CLOSE_TEXT.reading);
    else if (WEEKLY_CLOSE.read.gate) {
        const notReady = weeklyCloseReadyWord();
        if (notReady) lines.push(notReady);
        if (WEEKLY_CLOSE.error) lines.push(WEEKLY_CLOSE.error);
        if (WEEKLY_CLOSE.stale) lines.push(WEEKLY_CLOSE_TEXT.stale);
    }
    if (WEEKLY_CLOSE.saving) lines.push(WEEKLY_CLOSE_TEXT.saving);
    parts.status.textContent = lines.join(' ');
    parts.status.hidden = lines.length === 0;
    parts.status.classList.toggle('weekly-close-refused', Boolean(WEEKLY_CLOSE.read && WEEKLY_CLOSE.read.gate
        && weeklyCloseReadyWord()));
}

function renderWeeklyClose() {
    const parts = weeklyCloseParts();
    if (!parts.body || !WEEKLY_CLOSE) return;
    parts.title.textContent = WEEKLY_CLOSE_TEXT.title;
    const today = parseLocalDate(todayStr());
    parts.meta.textContent = `${hebrewDayName(today)} ${formatFullDate(today)}`;
    clear(parts.steps);
    [WEEKLY_CLOSE_TEXT.step1, WEEKLY_CLOSE_TEXT.step2, WEEKLY_CLOSE_TEXT.step3].forEach((words, index) => {
        const chip = el('span', `weekly-close-step${index + 1 === WEEKLY_CLOSE.step ? ' weekly-close-step-on' : ''}`, words);
        if (index + 1 === WEEKLY_CLOSE.step) chip.setAttribute('aria-current', 'step');
        parts.steps.appendChild(chip);
    });
    clear(parts.body);
    weeklyCloseSay();
    if (WEEKLY_CLOSE.read && !WEEKLY_CLOSE.read.gate) {
        parts.body.appendChild(el('p', 'hint hint-warn', WEEKLY_CLOSE_REUSED.gateShut));
    } else if (WEEKLY_CLOSE.read && WEEKLY_CLOSE.step === 1) {
        weeklyCloseDrawList(parts.body);
    } else if (WEEKLY_CLOSE.read && WEEKLY_CLOSE.step === 2) {
        weeklyCloseDrawSummary(parts.body);
    }
    weeklyCloseDrawFoot();
}

function weeklyCloseGroupTitle(group) {
    const node = el('h4', 'weekly-close-group');
    node.dataset.cycle = group.cycle;
    node.appendChild(el('strong', null, PAY_CYCLE_LABELS[group.cycle] || ''));
    node.appendChild(document.createTextNode(` · ${weeklyCloseDates(group.from, group.to)}`));
    return node;
}

function weeklyCloseDrawList(body) {
    const read = WEEKLY_CLOSE.read;
    body.appendChild(el('p', 'weekly-close-lead', WEEKLY_CLOSE_TEXT.lead));
    if (!read.men.length) { body.appendChild(emptyHint(WEEKLY_CLOSE_TEXT.nobody)); return; }
    read.groups.forEach(group => {
        const box = el('section', 'weekly-close-groupbox');
        box.dataset.cycle = group.cycle;
        box.appendChild(weeklyCloseGroupTitle(group));
        group.men.forEach(man => box.appendChild(weeklyCloseCard(man)));
        body.appendChild(box);
    });
}

// The four figures of a row: [label, value, class].
function weeklyCloseFourFigures(man, choice) {
    const figures = choice.skip || !choice.ok ? null : weeklyCloseFigures(man, choice.x);
    const dash = '—';
    return [
        [WEEKLY_CLOSE_TEXT.wage, man.gross === null ? dash : moneyText(man.gross), 'wage'],
        [WEEKLY_CLOSE_TEXT.deduct, figures ? moneyText(figures.deducted) : dash, 'deduct'],
        [WEEKLY_CLOSE_REUSED.toPay, figures && figures.net !== null ? moneyText(figures.net) : dash, 'pay'],
        [WEEKLY_CLOSE_TEXT.remain, figures ? moneyText(figures.left) : moneyText(man.balance), 'remain']
    ];
}

function weeklyCloseCard(man) {
    const choice = weeklyCloseChoice(man);
    const [state, word] = weeklyCloseState(man, choice);
    const opened = WEEKLY_CLOSE.open === man.id && !man.held;
    const card = el('div', `weekly-close-card weekly-close-${state}${opened ? ' weekly-close-opened' : ''}`);
    card.dataset.worker = man.id;
    card.dataset.cycle = man.cycle;
    // The row: his name, the word, the four figures. Pressed, it opens his card in place.
    // A man who cannot be closed here has nothing to open: his row is words, not a button.
    const row = man.held ? el('div', 'weekly-close-row') : button('', 'weekly-close-row', () => {
        WEEKLY_CLOSE.open = WEEKLY_CLOSE.open === man.id ? null : man.id;
        renderWeeklyClose();
        const again = document.querySelector(`.weekly-close-card[data-worker="${man.id}"] .weekly-close-row`);
        if (again && again.focus) again.focus({ preventScroll: true });
    });
    if (!man.held) row.setAttribute('aria-expanded', opened ? 'true' : 'false');
    const top = el('span', 'weekly-close-row-top');
    top.appendChild(el('strong', 'weekly-close-name', man.name));
    top.appendChild(el('span', `weekly-close-chip weekly-close-chip-${state}`, word));
    row.appendChild(top);
    if (!man.held) {
        const four = el('span', 'weekly-close-four');
        weeklyCloseFourFigures(man, choice).forEach(([label, value, kind]) => {
            const cell = el('span', `weekly-close-cell weekly-close-cell-${kind}`);
            cell.appendChild(el('small', null, label));
            cell.appendChild(el('b', null, value));
            four.appendChild(cell);
        });
        row.appendChild(four);
    }
    card.appendChild(row);
    if (WEEKLY_CLOSE.moved.indexOf(man.id) !== -1) card.appendChild(el('p', 'hint hint-warn', WEEKLY_CLOSE_TEXT.changedHere));
    if (man.held) { weeklyCloseHeld(card, man); return card; }
    if (opened) weeklyCloseOpened(card, man, choice);
    return card;
}

function weeklyCloseHeldText(man) {
    const held = man.held;
    const dates = held.from ? weeklyCloseDates(held.from, held.to) : '';
    switch (held.kind) {
    case 'endsToday': return WEEKLY_CLOSE_TEXT.heldEndsToday;
    case 'earlier': return WEEKLY_CLOSE_TEXT.heldEarlier(dates);
    case 'earlierBehind': return WEEKLY_CLOSE_TEXT.heldEarlierBehind(dates);
    case 'overpaid': return WEEKLY_CLOSE_REUSED.overpaid;
    case 'overlap': return WEEKLY_CLOSE_REUSED.overlap;
    case 'clock': return CLOSURE_CLOCK_BEHIND;
    case 'unpriced': return `${NO_DAILY_RATE_NOTE}.`;
    default: return WEEKLY_CLOSE_TEXT.heldOther;
    }
}

function weeklyCloseHeld(card, man) {
    card.appendChild(el('p', 'weekly-close-held', weeklyCloseHeldText(man)));
    if (man.held.kind === 'earlier' || man.held.kind === 'earlierBehind') {
        // v195's one button: it only NAVIGATES - the pay sheet narrowed to him, pointed at
        // that period, where the per-man close is. Nothing is closed from here.
        const span = { from: man.held.from, to: man.held.to };
        card.appendChild(button(`${OTHER_ACCOUNT_SHOW} ${weeklyCloseDates(span.from, span.to)}`,
            'btn-secondary weekly-close-show', () => {
                closeWeeklyClose();
                owesShowAccount(man.id, span);
            }));
    }
}

function weeklyCloseOpened(card, man, choice) {
    const box = el('div', 'weekly-close-detail');
    const line = (label, value) => {
        const row = el('div', 'weekly-close-line');
        row.appendChild(el('span', null, label));
        row.appendChild(el('b', null, value));
        box.appendChild(row);
    };
    line(WEEKLY_CLOSE_TEXT.wageDays(man.days), man.gross === null ? NO_DAILY_RATE_NOTE : weeklyCloseMoney(man.gross));
    line(WEEKLY_CLOSE_TEXT.carriedIn, weeklyCloseMoney(man.carriedIn));
    if (man.creditIn > 0) line(ADVANCE_CREDIT_FROM_BEFORE, weeklyCloseMoney(man.creditIn));
    line(WEEKLY_CLOSE_REUSED.givenHere, weeklyCloseMoney(man.given));
    if (man.repaid > 0) line(LEDGER_KIND_LABELS.repaid, weeklyCloseMoney(man.repaid));
    line(WEEKLY_CLOSE_TEXT.totalOwed, weeklyCloseMoney(man.balance));
    card.appendChild(box);
    if (choice.skip) {
        card.appendChild(el('p', 'weekly-close-skipped', WEEKLY_CLOSE_TEXT.skippedLine));
        card.appendChild(button(WEEKLY_CLOSE_TEXT.unskipButton, 'btn-secondary weekly-close-unskip', () => {
            WEEKLY_CLOSE.choices[man.id].skip = false; renderWeeklyClose();
        }));
        return;
    }
    const label = el('label', 'field-label weekly-close-label', WEEKLY_CLOSE_REUSED.field);
    const input = document.createElement('input');
    input.type = 'text';
    input.inputMode = 'decimal';
    input.dir = 'ltr';
    input.className = 'weekly-close-input';
    input.value = WEEKLY_CLOSE.choices[man.id].text;
    input.setAttribute('aria-label', `${WEEKLY_CLOSE_REUSED.field} ${man.name}`);
    label.appendChild(input);
    card.appendChild(label);
    const preview = el('p', 'finance-preview weekly-close-preview');
    preview.setAttribute('role', 'status');
    const error = el('p', 'field-error weekly-close-error');
    const paint = () => {
        const now = weeklyCloseChoice(man);
        if (now.ok) {
            const figures = weeklyCloseFigures(man, now.x);
            preview.textContent = WEEKLY_CLOSE_REUSED.preview(moneyText(figures.net === null ? 0 : figures.net),
                moneyText(figures.left));
            error.textContent = '';
        } else {
            preview.textContent = '';
            error.textContent = WEEKLY_CLOSE_TEXT.badAmount(moneyText(man.max));
        }
        // The row above and the foot move with the field, without redrawing the field.
        const [state, word] = weeklyCloseState(man, now);
        card.className = `weekly-close-card weekly-close-${state} weekly-close-opened`;
        const chip = card.querySelector('.weekly-close-chip');
        if (chip) { chip.className = `weekly-close-chip weekly-close-chip-${state}`; chip.textContent = word; }
        const cells = card.querySelectorAll('.weekly-close-cell b');
        weeklyCloseFourFigures(man, now).forEach(([, value], index) => { if (cells[index]) cells[index].textContent = value; });
        weeklyCloseDrawFoot();
    };
    input.addEventListener('input', () => { WEEKLY_CLOSE.choices[man.id].text = input.value; paint(); });
    card.appendChild(preview);
    card.appendChild(error);
    const set = text => { WEEKLY_CLOSE.choices[man.id].text = text; renderWeeklyClose(); };
    const actions = el('div', 'weekly-close-actions');
    actions.appendChild(button(WEEKLY_CLOSE_TEXT.allButton(moneyText(man.max)), 'btn-secondary weekly-close-all',
        () => set(String(man.max))));
    actions.appendChild(button(WEEKLY_CLOSE_TEXT.noneButton, 'btn-secondary weekly-close-none', () => set('0')));
    actions.appendChild(button(WEEKLY_CLOSE_TEXT.skipButton, 'btn-secondary weekly-close-skip', () => {
        WEEKLY_CLOSE.choices[man.id].skip = true; renderWeeklyClose();
    }));
    card.appendChild(actions);
    paint();
}

// THE FOOT STICKS ONLY WHERE THERE IS ROOM. On a short phone with the text doubled, the
// three totals and the two buttons are most of the dialog's height: stuck to its bottom they
// covered every row, and no man could be opened (measured at 320x568). Where the foot would
// take more than two fifths of the dialog it stands at the end of it instead, and the page
// scrolls to it like everything else.
function weeklyCloseFootFit() {
    if (typeof document === 'undefined' || typeof document.querySelector !== 'function') return;
    const content = document.querySelector('#weeklyCloseModal .modal-content');
    const foot = document.querySelector('#weeklyCloseModal .weekly-close-foot');
    if (!content || !foot || typeof foot.getBoundingClientRect !== 'function' || !foot.classList) return;
    foot.classList.remove('weekly-close-foot-loose');
    const room = Number(content.clientHeight) || 0;
    foot.classList.toggle('weekly-close-foot-loose', room > 0 && foot.getBoundingClientRect().height > room * 0.4);
}
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('resize', () => { if (weeklyCloseIsOpen()) weeklyCloseFootFit(); });
}

function weeklyCloseDrawFoot() {
    const parts = weeklyCloseParts();
    if (!parts.totals || !WEEKLY_CLOSE) return;
    clear(parts.totals);
    const read = WEEKLY_CLOSE.read;
    const totals = weeklyCloseTotals();
    const showing = read && read.gate && read.men.length > 0;
    parts.totals.hidden = !showing;
    if (showing) {
        [[WEEKLY_CLOSE_TEXT.footDeduct, totals.deducted], [WEEKLY_CLOSE_REUSED.toPay, totals.net],
            [WEEKLY_CLOSE_TEXT.remain, totals.left]].forEach(([label, value]) => {
            const cell = el('span', 'weekly-close-total');
            cell.appendChild(el('small', null, label));
            cell.appendChild(el('b', null, weeklyCloseMoney(value)));
            parts.totals.appendChild(cell);
        });
    }
    parts.back.textContent = WEEKLY_CLOSE_TEXT.back;
    if (WEEKLY_CLOSE.step === 1) {
        parts.go.textContent = WEEKLY_CLOSE_TEXT.next;
        parts.go.hidden = !showing;
        parts.go.disabled = WEEKLY_CLOSE.saving;
    } else {
        parts.go.textContent = WEEKLY_CLOSE_TEXT.confirm(totals.count);
        parts.go.hidden = totals.count === 0;
        parts.go.disabled = WEEKLY_CLOSE.saving;
    }
    weeklyCloseFootFit();
}

function weeklyCloseDrawSummary(body) {
    const read = WEEKLY_CLOSE.read;
    const totals = weeklyCloseTotals();
    const closing = [];
    const zero = [];
    const skipped = [];
    const held = [];
    read.men.forEach(man => {
        const choice = weeklyCloseChoice(man);
        if (man.held) held.push(man);
        else if (choice.skip) skipped.push(man);
        else {
            closing.push({ man, x: choice.x });
            // Named only where a debt is left standing: a man who owes nothing loses nothing.
            if (weeklyCloseCents(choice.x) === 0 && man.balance > 0) zero.push(man);
        }
    });
    const table = el('div', 'weekly-close-summary');
    table.appendChild(el('h4', null, totals.count ? WEEKLY_CLOSE_TEXT.willClose(totals.count) : WEEKLY_CLOSE_TEXT.noneChosen));
    if (closing.length) {
        const grid = el('div', 'weekly-close-table');
        const head = el('div', 'weekly-close-tr weekly-close-th');
        [WEEKLY_CLOSE_TEXT.worker, WEEKLY_CLOSE_TEXT.deduct, WEEKLY_CLOSE_REUSED.toPay, WEEKLY_CLOSE_TEXT.remain]
            .forEach(words => head.appendChild(el('span', null, words)));
        grid.appendChild(head);
        closing.forEach(({ man, x }) => {
            const figures = weeklyCloseFigures(man, x);
            const tr = el('div', 'weekly-close-tr');
            tr.dataset.worker = man.id;
            tr.dataset.cycle = man.cycle;
            tr.appendChild(el('strong', null, man.name));
            tr.appendChild(el('span', null, moneyText(figures.deducted)));
            tr.appendChild(el('span', null, figures.net === null ? '—' : moneyText(figures.net)));
            tr.appendChild(el('span', null, moneyText(figures.left)));
            grid.appendChild(tr);
        });
        const sum = el('div', 'weekly-close-tr weekly-close-sum');
        sum.appendChild(el('strong', null, OWES_TEXT.sum));
        sum.appendChild(el('span', null, moneyText(totals.deducted)));
        sum.appendChild(el('span', null, moneyText(totals.net)));
        sum.appendChild(el('span', null, moneyText(totals.left)));
        grid.appendChild(sum);
        table.appendChild(grid);
    }
    body.appendChild(table);
    const named = (cls, title, men, line) => {
        if (!men.length) return;
        const box = el('div', `weekly-close-named ${cls}`);
        box.appendChild(el('strong', null, title));
        men.forEach(man => box.appendChild(el('p', null, line(man))));
        body.appendChild(box);
    };
    named('weekly-close-named-zero', WEEKLY_CLOSE_TEXT.zeroList, zero,
        man => `${isolate(man.name)} · ${WEEKLY_CLOSE_TEXT.remain} ${weeklyCloseMoney(man.balance)}`);
    named('weekly-close-named-skipped', WEEKLY_CLOSE_TEXT.skippedList, skipped,
        man => `${isolate(man.name)} · ${WEEKLY_CLOSE_TEXT.totalOwed} ${weeklyCloseMoney(man.balance)}`);
    named('weekly-close-named-held', WEEKLY_CLOSE_TEXT.heldList, held,
        man => `${isolate(man.name)} · ${weeklyCloseHeldText(man)}`);
    if (totals.count) body.appendChild(el('p', 'hint weekly-close-final', WEEKLY_CLOSE_REUSED.final));
}

function weeklyCloseGuarded(now) {
    const since = now - weeklyCloseLastTap;
    return weeklyCloseLastTap > 0 && since >= 0 && since < WEEKLY_CLOSE_TAP_GUARD_MS;
}

// «המשך לסיכום» / «סגור N חשבונות».
async function weeklyCloseGo() {
    if (!WEEKLY_CLOSE || !WEEKLY_CLOSE.read || weeklyCloseBusy || WEEKLY_CLOSE.saving) return;
    if (WEEKLY_CLOSE.step === 1) {
        const totals = weeklyCloseTotals();
        if (totals.bad.length) {
            WEEKLY_CLOSE.open = totals.bad[0].id;
            renderWeeklyClose();
            const field = document.querySelector('.weekly-close-opened .weekly-close-input');
            if (field && field.focus) field.focus();
            return;
        }
        WEEKLY_CLOSE.step = 2;
        WEEKLY_CLOSE.error = null;
        renderWeeklyClose();
        const content = document.querySelector('#weeklyCloseModal .modal-content');
        if (content) content.scrollTop = 0;
        return;
    }
    const now = Date.now();
    if (weeklyCloseGuarded(now)) return;
    weeklyCloseLastTap = now;
    const notReady = weeklyCloseReadyWord();
    if (notReady) { WEEKLY_CLOSE.error = null; renderWeeklyClose(); return; }
    const picks = WEEKLY_CLOSE.read.men.map(man => ({ man, choice: weeklyCloseChoice(man) }))
        .filter(pick => !pick.choice.skip && pick.choice.ok).map(pick => ({ man: pick.man, x: pick.choice.x }));
    if (!picks.length) return;
    weeklyCloseBusy = true;
    WEEKLY_CLOSE.saving = true;
    weeklyCloseDrawFoot();
    weeklyCloseSay();
    try {
        // One frame for «שומר…» to be drawn before the synchronous step holds the screen.
        await new Promise(resolve => {
            const later = () => setTimeout(resolve, 0);
            if (typeof requestAnimationFrame === 'function') requestAnimationFrame(later); else later();
        });
        let result;
        weeklyCloseWriting = true;
        try { result = weeklyCloseWrite(picks); } finally { weeklyCloseWriting = false; }
        weeklyCloseAfter(result, picks);
    } finally {
        weeklyCloseBusy = false;
        if (WEEKLY_CLOSE) { WEEKLY_CLOSE.saving = false; weeklyCloseDrawFoot(); weeklyCloseSay(); }
    }
}

function weeklyCloseAfter(result, picks) {
    // The page under the dialog, drawn once now that a commit was tried (weeklyCloseWrite holds
    // the draw for its length): a commit refused or taken back may have said so in the app's
    // own banners. On success the close's own page is the draw; a stop before the commit
    // changed nothing to draw.
    const tried = !result.notReady && !result.moved.length;
    if (tried && (result.failure || !result.saved || !WEEKLY_CLOSE) && typeof render === 'function') render();
    if (!WEEKLY_CLOSE) return;
    if (result.notReady) { WEEKLY_CLOSE.error = null; renderWeeklyClose(); return; }
    if (result.moved.length) {
        const names = result.moved.map(id => {
            const man = picks.filter(pick => pick.man.id === id)[0];
            return isolate(man ? man.man.name : id);
        }).join(', ');
        WEEKLY_CLOSE.step = 1;
        weeklyCloseLoad(result.moved);
        WEEKLY_CLOSE.error = `${WEEKLY_CLOSE_REUSED.changed} ${WEEKLY_CLOSE_TEXT.movedNames(names)}`;
        renderWeeklyClose();
        return;
    }
    if (result.failure) {
        WEEKLY_CLOSE.error = result.failure.kind === 'tooMany'
            ? WEEKLY_CLOSE_TEXT.tooMany(result.failure.count, MAX_PATHS_PER_WRITE - 1)
            : result.failure.kind === 'tooLarge' ? WEEKLY_CLOSE_TEXT.tooLarge : WEEKLY_CLOSE_TEXT.notWritten;
        renderWeeklyClose();
        return;
    }
    if (!result.saved) {
        // saveFinancialAction refused, and said so itself (its gate), or State refused the
        // commit and said so in its banner.
        WEEKLY_CLOSE.error = WEEKLY_CLOSE_TEXT.notWritten;
        renderWeeklyClose();
        return;
    }
    // «3 · נסגר»: the close's own page in «סגירות שנרשמו», with the men it did not close
    // named on it.
    const key = `${result.at}|${result.by}`;
    const notClosed = WEEKLY_CLOSE.read.men.filter(man => result.closed.indexOf(man.id) === -1).map(man => man.name);
    WEEKLY_CLOSE_LAST = { key, names: notClosed };
    WEEKLY_CLOSE.saving = false;
    closeWeeklyClose();
    owesOpenPage(key);
}

// Asked by owesDrawClosure (js/ui/owes.js): the men the pass that wrote this close did not
// close, by name. Memory only - for the close this phone just made, until a reload.
function weeklyCloseNotClosedNode(groupKey) {
    if (!WEEKLY_CLOSE_LAST || WEEKLY_CLOSE_LAST.key !== groupKey || !WEEKLY_CLOSE_LAST.names.length) return null;
    const box = el('div', 'weekly-close-named weekly-close-named-skipped');
    box.appendChild(el('strong', null, WEEKLY_CLOSE_TEXT.notClosedHere));
    box.appendChild(el('p', null, WEEKLY_CLOSE_LAST.names.map(name => isolate(name)).join(', ')));
    return box;
}

function weeklyCloseBack() {
    if (!WEEKLY_CLOSE || WEEKLY_CLOSE.saving) return;
    if (WEEKLY_CLOSE.step === 2) {
        WEEKLY_CLOSE.step = 1;
        WEEKLY_CLOSE.error = null;
        renderWeeklyClose();
        return;
    }
    closeWeeklyClose();
}
