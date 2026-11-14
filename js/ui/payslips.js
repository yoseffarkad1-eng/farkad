// «תלוש לכל עובד»: on pay day, each man is told what he is getting - one WhatsApp message
// per man, opened one tap at a time. The seder's pattern (js/ui/seder.js), for pay.
//
// Until now this was done a man at a time: open his days from the sheet, press «שלח
// לעובד», choose him in WhatsApp's own list - thirty times, and the choosing of the chat
// was done by eye. Here the list is the men who have a row in the pay sheet for THEIR OWN
// period (a weekly man's week, a fortnightly man's fortnight - periodRangeFor), each with
// his «נותר לתשלום» large, and one tap on his own door opens WhatsApp on HIS number with
// HIS statement.
//
// THIS IS MONEY GOING TO A PERSON, so the file is built around four refusals:
//
//   - IT WORKS NOTHING OUT AND WORDS NOTHING. The text a man is sent is workerStatementText
//     (js/ui/reports.js) - the statement «שלח לעובד» already sends - byte for byte, read
//     with the report pointed at his period and put back (payslipsScope, the same step
//     js/ui/workercard.js takes). The figure on his row is the pay sheet's own «לתשלום»
//     cell for him, read off the table the sheet builds. A second wording of one man's
//     money would be a second surface, and this app has paid for those disagreeing.
//   - THE GATE COMES WITH THE FUNCTIONS. payrollRows, workerAccountFor and the statement
//     each ask carryReportingEnabled themselves, so on a record whose migration nobody has
//     approved the list and the message say what the sheet says there
//     (tests/approval.test.mjs). This file never asks the gate a question of its own.
//   - A NUMBER THE SHEET WOULD NOT SHOW IS NEVER SENT FROM HERE. The statement works its
//     last line out for itself, beside the sheet and not from it, so the two CAN differ.
//     One way is known on this build: an advance with a negative amount, which the form
//     refuses and an import or another phone can deliver - the sheet shows it and does not
//     net it, the statement sums it in (tests/payslips.test.mjs builds it). Each row
//     compares the figure in his text with the figure in his cell, as text - «—», an
//     unknown wage, against no figure at all in the text. Where they are not the same
//     the row says so, shows no door and no copy, and still shows the message - so the
//     person can see what is wrong and go and fix it. Nothing is guessed and nothing is
//     sent on a guess.
//   - THE DOOR NAMES ITS MAN. Every door is a real link, built before the finger lands,
//     with his normalised number and his text on it and his name written on it; a number
//     that is not plainly an Israeli mobile is no number (sederWaNumber), and two men on
//     the list with one number are each told so (the seder's own rule and words).
//
// A MAN WHOSE ACCOUNT «דורש בדיקה» CAN be opened: his row carries the sheet's own sentence
// (overpaymentWarning), and so does his message, which is the statement «שלח לעובד» sends
// today. Hiding his door would not stop that button, and a list with a man silently
// missing is worse than one that shows him with the warning on him.
//
// WHAT WAS OPENED is this phone's own business: one preference of its own through Store,
// per (period, man), never the record, the outbox, the cloud, a backup or the rescue file.
// The app cannot see whether send was pressed, so a man is «נפתח בוואטסאפ» - the seder's
// word - and never anything stronger. A message that has changed since it was opened (a
// day added, an advance recorded, his number corrected) stops being believed, and says so.
//
// Entered from «הפקת דוח» on the reports screen, on «לפי עובד» only - a fourth output of
// the sheet, not a button on any measured row, and nowhere in the day's WhatsApp dialog:
// that dialog is the seder, and this is pay.

// ================================================================== THE WORDS
//
// EVERY HEBREW STRING THIS FEATURE ADDS, IN ONE BLOCK. PROPOSED, not approved: the owner
// has not read them. Pinned word for word in tests/payslips.test.mjs, so changing one is a
// decision. A name handed to a template is already bidi-isolated by the caller.
const PAYSLIPS_TEXT = Object.freeze({
    // --- the way in: a row of «הפקת דוח»
    entry: '💬 תלוש לכל עובד',

    // --- the list
    title: 'תלוש לכל עובד',
    // the one line before the first tap: what is sent. For which period is the lines
    // under it - each cycle with its own dates - and each man's row says his own again.
    lead: 'כל עובד מקבל את החשבון שלו לתקופה שלו: הימים, מה נצבר, המקדמות וכמה נותר לתשלום. '
        + 'וואטסאפ נפתח עם ההודעה מוכנה, ושם לוחצים על שליחה.',
    nobody: 'אין בתקופה הזו עובדים עם שורה בדוח השכר.',
    // the preview, on every row: the message is read before it is opened
    show: 'הצג הודעה',
    hide: 'הסתר הודעה',
    // read aloud: «הצג את ההודעה לאחמד», and the field's own name «ההודעה לאחמד»
    showFor: name => `הצג את ההודעה ל${name}`,
    messageFor: name => `ההודעה ל${name}`,
    // the figure in the message and the figure on the sheet are not the same
    differs: '⚠️ הסכום בהודעה אינו הסכום שבדוח השכר, ולכן ההודעה לא נפתחת מכאן. '
        + 'בדוק את החשבון של העובד בדוח.'
});

// The words the list borrows, each beside the screen that owns it. Repeated here because
// those screens build them inline; tests/payslips.test.mjs finds every one of them in its
// owner's source, so a word changed there and not here fails by name. The seder's words
// (נפתח בוואטסאפ, the door, the shared number, no number, the progress, the close) are
// not repeated at all: they are read off SEDER_TEXT where they are used.
const PAYSLIPS_REUSED = Object.freeze({
    payable: 'נותר לתשלום',                // js/ui/reports.js, the pay card and the statement
    sheetNet: 'לתשלום',                    // js/ui/reports.js, the sheet's column
    current: 'התקופה הנוכחית',             // js/ui/reports.js, the settlement
    previous: 'התקופה הקודמת',             // js/ui/reports.js, the settlement
    weekly: 'תשלום שבועי',                 // js/ui/roster.js, the crew row
    biweekly: 'תשלום כל שבועיים',          // js/ui/roster.js, the crew row
    copy: 'העתק'                           // index.html, the WhatsApp dialog
});

// ================================================================== the reading

// THE SHEET'S OWN FUNCTIONS, POINTED AT EACH MAN'S PERIOD - and put back.
//
// payrollRows, moneyOf, workerAccountFor and workerStatementText read the report's range
// and its worker filter off REPORT_RANGE and REPORT_WORKERS; they take no arguments. So
// they are asked the way js/ui/workercard.js asks them: the range is pointed, they answer,
// and the range and the filter go back in a finally, in one synchronous step with nothing
// drawn in between. REPORT_DEDUCTIONS is left alone on purpose - a deduction somebody has
// already chosen for this period on the sheet is part of what the sheet says.
//
// AND THE GATE IS ASKED ONCE FOR THE WHOLE LIST, by the gate's own function. Every reader
// asks carryReportingEnabled(schedule) for itself, and the question re-plans the migration
// (see workerCardScope: measured, up to a second on a record whose balances have not
// cleared). A list of thirty men is two hundred of those. Inside this one synchronous step
// the record cannot change, so the first reader's answer, from the real function, is the
// answer the others are given; the real function is put back in the same finally, and a
// different schedule is never answered from memory.
function payslipsScope(read) {
    const held = { from: REPORT_RANGE.from, to: REPORT_RANGE.to, workers: REPORT_WORKERS };
    const ask = carryReportingEnabled;
    const asked = State.schedule;
    let answered = false;
    let answer = false;
    carryReportingEnabled = schedule => {
        if (schedule !== asked) return ask(schedule);
        if (!answered) { answer = ask(schedule); answered = true; }
        return answer;
    };
    try {
        // And the reading is the pay sheet's own one reading (reportReadOnce, js/ui/reports.js,
        // v196): on a record that carries the approval the gate is answered without planning
        // the migration at all, and each range's sheet and each man's closed periods are
        // worked out once for the whole of it.
        return typeof reportReadOnce === 'function' ? reportReadOnce(read) : read();
    } finally {
        carryReportingEnabled = ask;
        REPORT_RANGE.from = held.from;
        REPORT_RANGE.to = held.to;
        REPORT_WORKERS = held.workers;
    }
}

// A figure as text with the marks that only steer its layout taken off: the bidi marks
// the app pins a minus with, and the * the sheet puts on a wage that leaves unpriced hours
// out. What is left is the number as it is written, and two of those are compared as text.
function payslipsBare(text) {
    return String(text === undefined || text === null ? '' : text)
        .replace(/[‎‏‪-‮⁦-⁩]/g, '')
        .replace(/\s*\*$/, '')
        .trim();
}

// The pay sheet's «לתשלום» for this row, AS THE SHEET PRINTS IT.
//
// A man on the work table: the cell of the table the sheet builds for him
// (payrollGroupTable over the one row - what the sheet draws when it is narrowed to him),
// READ, the way the phone's pay cards read it (renderReportCards), and «—» where the sheet
// has no such column, which is that card's own step. A man with money in the period and
// no day in it is not on that table; his figure is the third expression of the line the
// sheet writes for him instead (financeLineText), letter for letter.
function payslipsSheetFigure(row) {
    if (payrollDisplaySplit([row]).work.length === 0) {
        const money = moneyOf(row);
        return money.net === null ? '—' : bidiAmount(moneyText(money.net));
    }
    const table = payrollGroupTable([row]).querySelector('table');
    const heads = [...table.querySelectorAll('thead th')].map(head => head.textContent);
    const cells = table.querySelector('tbody tr').children;
    const at = heads.indexOf(PAYSLIPS_REUSED.sheetNet);
    return (at < 0 || !cells[at] ? '' : cells[at].textContent) || '—';
}

// The figure his message states: what stands after «נותר לתשלום: » on its own line, or
// «—» when the message has no such line (a man with no rate - an unknown wage is not a
// number, and the message does not pretend to one). Nothing a person types can begin a
// line of the statement: his name follows «📄 », a site follows «• », a reason «  · ».
function payslipsTextFigure(text) {
    const prefix = `${PAYSLIPS_REUSED.payable}: `;
    const lines = String(text).split('\n').filter(line => line.indexOf(prefix) === 0);
    return lines.length === 0 ? '—' : lines[lines.length - 1].slice(prefix.length);
}

// 'current' or 'previous': which of a man's periods the list is about. The same two the
// settlement offers, found the same way - the period that holds today, or the one that
// ends the day before it begins.
function payslipsPeriodOf(worker, which, today) {
    const current = periodRangeFor(worker, today);
    return which === 'previous' ? periodRangeFor(worker, shiftDate(current.from, -1)) : current;
}

function payslipsPeriodKey(period) {
    return `${period.from}~${period.to}`;
}

// EVERYTHING THE LIST SAYS, as plain data and nothing drawn - so the suite can hold each
// man's text and figure against the statement and the sheet without a browser, and so
// that what is on the screen cannot be anything this did not return.
//
//   rows     one per man WITH A ROW ON THE PAY SHEET for his own period, in roster order:
//            { workerId, name, number, period, range, cycle, text, figure, known, agrees,
//              review, sharedWith }
//   periods  the distinct periods the men of this record are in, each with how many of
//            the listed men it holds - the dates said before the first tap
function payslipsFacts(which) {
    // One reading for the whole of it - the pay sheet's (reportReadOnce, js/ui/reports.js).
    if (typeof reportReadOnce === 'function' && !reportReading()) return reportReadOnce(payslipsFacts, this, arguments);
    const mode = which === 'previous' ? 'previous' : 'current';
    const today = todayStr();
    const workers = ((State.schedule && State.schedule.workers) || [])
        .filter(worker => worker && isSafeId(String(worker.id)));

    // The men, by period. Two cycles on one record are two ranges; a cycle changed inside
    // a fortnight is a third. Each range is asked of the sheet once, narrowed to its men.
    const groups = [];
    const groupOf = Object.create(null);
    workers.forEach(worker => {
        const period = payslipsPeriodOf(worker, mode, today);
        const key = payslipsPeriodKey(period);
        if (!groupOf[key]) {
            groupOf[key] = { key, from: period.from, to: period.to, cycles: [], ids: [], listed: 0 };
            groups.push(groupOf[key]);
        }
        if (groupOf[key].cycles.indexOf(period.cycle) === -1) groupOf[key].cycles.push(period.cycle);
        groupOf[key].ids.push(String(worker.id));
    });

    const found = Object.create(null);
    payslipsScope(() => {
        groups.forEach(group => {
            REPORT_RANGE.from = group.from;
            REPORT_RANGE.to = group.to;
            REPORT_WORKERS = new Set(group.ids);
            payrollRows().forEach(row => {
                const id = String(row.workerId);
                // The sheet's own reading of whose period this is, held against ours: a
                // row the sheet files under another period is not this list's to send.
                if (group.ids.indexOf(id) === -1
                    || row.periodFrom !== group.from || row.periodTo !== group.to) return;
                const text = workerStatementText(row.workerId);
                if (!text) return;
                const figure = payslipsSheetFigure(row);
                found[id] = {
                    text,
                    figure,
                    known: payslipsBare(figure) !== '—',
                    agrees: payslipsBare(figure) === payslipsBare(payslipsTextFigure(text)),
                    // The sheet's own sentence for an account that needs a person, from
                    // the account the sheet read - null with the gate shut, like there.
                    review: overpaymentWarning(row.carry || null),
                    cycle: row.payCycle,
                    key: group.key,
                    from: group.from,
                    to: group.to
                };
                group.listed += 1;
            });
        });
    });

    const rows = workers.filter(worker => found[String(worker.id)]).map(worker => {
        const mine = found[String(worker.id)];
        return {
            workerId: String(worker.id),
            name: worker.name,
            number: sederWaNumber(worker.phone),
            period: { key: mine.key, from: mine.from, to: mine.to },
            // One left-to-right run, so the earlier date is on the left (dateRange).
            range: dateRange(formatFullDate(parseLocalDate(mine.from)),
                formatFullDate(parseLocalDate(mine.to))),
            cycle: mine.cycle === 'weekly' ? PAYSLIPS_REUSED.weekly : PAYSLIPS_REUSED.biweekly,
            text: mine.text,
            figure: mine.figure,
            known: mine.known,
            agrees: mine.agrees,
            review: mine.review
        };
    });
    // Two men on this list with one number - the seder's rule, and here it is two men's
    // PAY in one chat. Each names the other; neither is dropped. Compared as the digits
    // wa.me is handed; a man with no usable number shares nothing.
    rows.forEach(row => {
        row.sharedWith = row.number
            ? rows.filter(other => other !== row && other.number === row.number).map(other => other.name)
            : [];
    });

    return {
        which: mode,
        rows,
        periods: groups.filter(group => group.listed > 0 || rows.length === 0).map(group => ({
            key: group.key,
            from: group.from,
            to: group.to,
            listed: group.listed,
            cycle: group.cycles.map(cycle => (cycle === 'weekly'
                ? PAYSLIPS_REUSED.weekly : PAYSLIPS_REUSED.biweekly)).join(' · '),
            range: dateRange(formatFullDate(parseLocalDate(group.from)),
                formatFullDate(parseLocalDate(group.to)))
        }))
    };
}

function payslipsUrl(row) {
    return sederUrl(row.number, row.text);
}

// ================================================================== the marks
//
// One key:
//   { periods: { "2026-11-06~2026-11-12": { opened: { w_01: { at, sig } }, at } },
//     open: { at, which } }
// `periods` is who was opened in WhatsApp, per period, with the fingerprint of the number
// and the words he was opened with; `open` is whether the list was on screen when the app
// was last touched and which of the two periods it was on - what a reload brings back.
//
// A PREFERENCE, NOT A RECORD - the seder's reasoning, word for word (js/ui/seder.js): not
// a byte of it is in the schedule, so nothing that carries the schedule can carry it;
// written OPTIONAL, so a full disk never spends a restore point on it; a write the disk
// refused is held for this session and the list says the marks were not kept; and a value
// that will not read is read as nobody opened, and the next mark writes over it.
const PAYSLIPS_PROGRESS_KEY = 'farkadPayslipsProgress';
// A dozen periods by the last one touched - three months of weeks. Older ones fall off.
const PAYSLIPS_KEEP_PERIODS = 12;
// How long after the last touch a list left open is brought back by a reload: long enough
// to send a message and come back, short enough that tomorrow's app does not open on it.
const PAYSLIPS_RESUME_MS = 20 * 60 * 1000;

let payslipsMemory = null;
let payslipsKept = true;

function payslipsParse(raw) {
    const out = { periods: Object.create(null), open: null };
    let parsed = null;
    try {
        parsed = raw ? JSON.parse(raw) : null;
    } catch (error) {
        parsed = null;
    }
    if (!isPlainObject(parsed)) return out;
    if (isPlainObject(parsed.periods)) {
        Object.keys(parsed.periods).forEach(key => {
            const period = parsed.periods[key];
            const dates = key.split('~');
            if (dates.length !== 2 || !isRealDate(dates[0]) || !isRealDate(dates[1])
                || dates[0] > dates[1] || !isPlainObject(period)) return;
            const kept = { opened: Object.create(null), at: isFiniteNumber(period.at) ? period.at : 0 };
            if (isPlainObject(period.opened)) {
                Object.keys(period.opened).forEach(id => {
                    const mark = period.opened[id];
                    if (isSafeId(id) && isPlainObject(mark) && typeof mark.sig === 'string'
                        && isFiniteNumber(mark.at)) kept.opened[id] = { at: mark.at, sig: mark.sig };
                });
            }
            out.periods[key] = kept;
        });
    }
    if (isPlainObject(parsed.open) && isFiniteNumber(parsed.open.at)
        && (parsed.open.which === 'current' || parsed.open.which === 'previous')) {
        out.open = { at: parsed.open.at, which: parsed.open.which };
    }
    return out;
}

function payslipsAll() {
    if (!payslipsMemory) payslipsMemory = payslipsParse(Store.get(PAYSLIPS_PROGRESS_KEY));
    return payslipsMemory;
}

// Down to the latest PAYSLIPS_KEEP_PERIODS, then onto the disk. Answers whether it reached
// the disk; this session holds it either way.
function payslipsSave() {
    const all = payslipsAll();
    Object.keys(all.periods)
        .sort((a, b) => (all.periods[b].at - all.periods[a].at) || (a < b ? 1 : a > b ? -1 : 0))
        .slice(PAYSLIPS_KEEP_PERIODS)
        .forEach(key => { delete all.periods[key]; });
    payslipsKept = Store.set(PAYSLIPS_PROGRESS_KEY, JSON.stringify(all), { optional: true }) === true;
    return payslipsKept;
}

function payslipsProgressKept() {
    return payslipsKept;
}

// What a mark is checked against: the number and the words he was opened with - the
// seder's own fingerprint. A day added after his message was opened, an advance recorded,
// his number corrected: a different fingerprint, and the mark stops being believed.
function payslipsSig(row) {
    return sederSig({ number: row.number }, row.text);
}

function payslipsMarkOpened(row) {
    if (!row || !isSafeId(row.workerId) || !row.period || !row.number) return false;
    const all = payslipsAll();
    const key = row.period.key;
    if (!Object.prototype.hasOwnProperty.call(all.periods, key)) {
        all.periods[key] = { opened: Object.create(null), at: 0 };
    }
    const now = Date.now();
    all.periods[key].at = now;
    all.periods[key].opened[row.workerId] = { at: now, sig: payslipsSig(row) };
    if (all.open) all.open.at = now;
    return payslipsSave();
}

// 'differs' (the message and the sheet do not say one figure - nothing is opened from
// here), 'nophone', 'opened', 'changed' (opened, and the message has moved since), or ''.
function payslipsState(row) {
    if (!row.agrees) return 'differs';
    if (!row.number) return 'nophone';
    const all = payslipsAll();
    const period = Object.prototype.hasOwnProperty.call(all.periods, row.period.key)
        ? all.periods[row.period.key] : null;
    const mark = period ? period.opened[row.workerId] : null;
    if (!mark) return '';
    return mark.sig === payslipsSig(row) ? 'opened' : 'changed';
}

// How many can be opened at all, and how many of those are - with the message as it is now.
function payslipsRun(rows) {
    const reachable = rows.filter(row => row.number && row.agrees);
    return {
        total: reachable.length,
        done: reachable.filter(row => payslipsState(row) === 'opened').length
    };
}

function payslipsSetListOpen(open, which) {
    const all = payslipsAll();
    all.open = open ? { at: Date.now(), which: which === 'previous' ? 'previous' : 'current' } : null;
    return payslipsSave();
}

// 'current' / 'previous' when the list was on screen within the last PAYSLIPS_RESUME_MS,
// or null.
function payslipsResumeWhich(now) {
    const open = payslipsAll().open;
    if (!open) return null;
    const since = now - open.at;
    return since >= 0 && since <= PAYSLIPS_RESUME_MS ? open.which : null;
}

// ================================================================== the screen

// Which of the two periods the open list is on, and whose message is unfolded (one at a
// time, or nobody's). Memory only.
let payslipsWhich = 'current';
let payslipsPreview = null;

function payslipsParts() {
    const get = id => document.getElementById(id);
    return { modal: get('payslipsModal'), title: get('payslipsTitle'), which: get('payslipsWhich'),
        context: get('payslipsContext'), lead: get('payslipsLead'), note: get('payslipsNote'),
        list: get('payslipsList'), status: get('payslipsStatus'), said: get('payslipsSaid'),
        close: get('payslipsClose') };
}

function payslipsIsOpen() {
    const modal = document.getElementById('payslipsModal');
    return Boolean(modal && modal.style.display === 'flex');
}

function openPayslips(which) {
    const parts = payslipsParts();
    if (!parts.modal || !parts.list) return false;
    payslipsWhich = which === 'previous' ? 'previous' : 'current';
    payslipsPreview = null;
    payslipsSetListOpen(true, payslipsWhich);
    renderPayslips();
    parts.modal.style.display = 'flex';
    const content = parts.modal.querySelector('.modal-content');
    if (content) content.scrollTop = 0;
    // Entered at its heading, like every dialog that has one (js/ui/modal.js). Forced into
    // effect first: an element that was display:none a line ago cannot take focus until
    // its style is computed.
    void parts.modal.offsetHeight;
    if (parts.title && parts.title.focus) parts.title.focus({ preventScroll: true });
    return true;
}

function closePayslips() {
    const parts = payslipsParts();
    if (parts.modal) parts.modal.style.display = 'none';
    payslipsPreview = null;
    // Closed on purpose, so a reload does not bring it back.
    payslipsSetListOpen(false);
}

// render() calls this (js/app.js): a day or an advance arriving from another phone while
// the list is open must move the man's figure, his message and the link that carries it.
function renderPayslipsIfOpen() {
    if (!payslipsIsOpen()) return;
    const content = document.querySelector('#payslipsModal .modal-content');
    const at = content ? content.scrollTop : 0;
    renderPayslips();
    if (content) content.scrollTop = at;
}

function renderPayslips() {
    const parts = payslipsParts();
    if (!parts.list) return;
    const facts = payslipsFacts(payslipsWhich);
    // Every row is rebuilt; the control that had the keyboard gets it back.
    const focused = document.activeElement && document.activeElement.dataset
        ? document.activeElement.dataset.payslipsFocus : null;

    parts.title.textContent = PAYSLIPS_TEXT.title;
    parts.lead.textContent = PAYSLIPS_TEXT.lead;
    parts.close.textContent = SEDER_TEXT.close;
    parts.note.textContent = SEDER_TEXT.notKept;
    parts.note.hidden = payslipsKept;

    // Which period. The settlement's own two words, as the two-state switch every other
    // either-or on this app is.
    clear(parts.which);
    [['current', PAYSLIPS_REUSED.current], ['previous', PAYSLIPS_REUSED.previous]].forEach(([key, label]) => {
        const on = facts.which === key;
        const chip = button(label, on ? 'chip-on' : 'chip-off', () => {
            if (payslipsWhich === key) return;
            payslipsWhich = key;
            payslipsPreview = null;
            payslipsSetListOpen(true, key);
            renderPayslips();
        });
        chip.setAttribute('aria-pressed', on ? 'true' : 'false');
        chip.dataset.payslipsFocus = `which:${key}`;
        parts.which.appendChild(chip);
    });

    // For which period: each cycle's dates and how many of the listed men are in it.
    clear(parts.context);
    facts.periods.forEach(period => {
        const line = el('p', 'payslips-period');
        line.appendChild(el('strong', 'payslips-period-range', period.range));
        line.appendChild(el('span', 'payslips-period-who',
            `${period.cycle} · ${SEDER_TEXT.count(period.listed)}`));
        parts.context.appendChild(line);
    });

    clear(parts.list);
    if (facts.rows.length === 0) {
        parts.list.appendChild(el('p', 'empty-hint payslips-nobody', PAYSLIPS_TEXT.nobody));
    }
    if (payslipsPreview !== null && !facts.rows.some(row => row.workerId === payslipsPreview)) {
        payslipsPreview = null;
    }
    facts.rows.forEach(row => parts.list.appendChild(payslipsRowNode(row)));

    const run = payslipsRun(facts.rows);
    const said = run.total === 0 ? '' : SEDER_TEXT.progress(run.done, run.total);
    // A live region written only when its sentence changes, from a node never rebuilt.
    if (typeof sayOnce === 'function') sayOnce(parts.status, said);
    else if (parts.status.textContent !== said) parts.status.textContent = said;

    // Found by comparing the values, never by a selector built from an id.
    if (focused) {
        const again = [...parts.modal.querySelectorAll('[data-payslips-focus]')]
            .find(node => node.dataset.payslipsFocus === focused);
        if (again && again !== document.activeElement) again.focus({ preventScroll: true });
    }
}

function payslipsRowNode(row) {
    const state = payslipsState(row);
    const node = el('div', `payslips-row${state === 'differs' ? ' payslips-row-differs' : ''}`);
    node.dataset.workerId = row.workerId;

    const head = el('div', 'payslips-head');
    const who = el('div', 'payslips-who');
    who.appendChild(el('strong', 'payslips-name', row.name));
    who.appendChild(el('span', 'payslips-when', row.range));
    who.appendChild(el('span', 'payslips-cycle', row.cycle));
    head.appendChild(who);
    // The figure, large: the sheet's own cell, and its unit only beside a number.
    const amount = el('div', 'payslips-amount');
    amount.appendChild(el('span', 'payslips-amount-label', PAYSLIPS_REUSED.payable));
    const figure = el('span', 'payslips-figure');
    figure.appendChild(el('strong', 'payslips-value', row.figure));
    if (row.known) figure.appendChild(el('span', 'payslips-currency', '₪'));
    amount.appendChild(figure);
    head.appendChild(amount);
    node.appendChild(head);

    // What stands on him, each in the words its owner says it in.
    if (row.review) node.appendChild(el('p', 'payslips-warn', row.review));
    const said = { differs: PAYSLIPS_TEXT.differs, nophone: SEDER_TEXT.noPhone,
        opened: SEDER_TEXT.opened, changed: SEDER_TEXT.changed }[state];
    if (said) node.appendChild(el('p', state === 'opened' ? 'payslips-state' : 'payslips-warn', said));
    if (row.sharedWith.length > 0) {
        node.appendChild(el('p', 'payslips-warn', SEDER_TEXT.shared(row.sharedWith.map(isolate).join(', '))));
    }

    const open = payslipsPreview === row.workerId;
    const actions = el('div', 'payslips-actions');
    const show = button(open ? PAYSLIPS_TEXT.hide : PAYSLIPS_TEXT.show, 'btn-secondary payslips-show', () => {
        payslipsPreview = open ? null : row.workerId;
        renderPayslips();
    }, PAYSLIPS_TEXT.showFor(isolate(row.name)));
    show.setAttribute('aria-expanded', open ? 'true' : 'false');
    show.dataset.payslipsFocus = `show:${row.workerId}`;
    actions.appendChild(show);

    // His message, read before it is opened. A read-only field, like the day message's:
    // it can be selected by hand where the clipboard is refused.
    let box = null;
    if (open) {
        box = document.createElement('textarea');
        box.className = 'payslips-text';
        box.readOnly = true;
        box.value = row.text;
        box.rows = Math.min(18, row.text.split('\n').length + 1);
        box.setAttribute('aria-label', PAYSLIPS_TEXT.messageFor(isolate(row.name)));
        box.dataset.payslipsFocus = `text:${row.workerId}`;
    }

    if (state === 'differs') {
        // No door and no copy: see the head of this file.
    } else if (row.number) {
        actions.appendChild(payslipsDoor(row));
    } else {
        // No number worth handing wa.me: his message is copied instead, by the day
        // message's own copier, which says what really happened to the clipboard.
        const copy = button(PAYSLIPS_REUSED.copy, 'btn-secondary payslips-copy', () => {
            if (payslipsPreview !== row.workerId) {
                payslipsPreview = row.workerId;
                renderPayslips();
            }
            const field = [...document.querySelectorAll('#payslipsList .payslips-text')][0];
            if (field) copyTextOut(field, payslipsParts().said);
        });
        copy.dataset.payslipsFocus = `copy:${row.workerId}`;
        actions.appendChild(copy);
    }
    node.appendChild(actions);
    if (box) node.appendChild(box);
    return node;
}

// ONE TAP, ONE MAN - the seder's rule (js/ui/seder.js), and here a second chat opened by
// a second tap would be another man's pay behind the first. For PAYSLIPS_TAP_GUARD_MS
// after a door is used every door on the list does nothing: no navigation, no mark.
const PAYSLIPS_TAP_GUARD_MS = 1500;
let payslipsLastTap = 0;

function payslipsGuarded(now) {
    const since = now - payslipsLastTap;
    // A clock put back is no reason to refuse taps for as long as it went back.
    return payslipsLastTap > 0 && since >= 0 && since < PAYSLIPS_TAP_GUARD_MS;
}

function payslipsAfterGuard() {
    const left = PAYSLIPS_TAP_GUARD_MS - (Date.now() - payslipsLastTap);
    if (left > 0 && left <= PAYSLIPS_TAP_GUARD_MS) setTimeout(payslipsAfterGuard, left + 20);
    else renderPayslipsIfOpen();
}

// A real link with the whole address already on it, so the tap IS the navigation (iOS
// opens nothing for a navigation that does not come from a tap). HIS number, HIS text,
// and HIS NAME written on the door. Marking him happens inside the same tap; the list is
// redrawn only when the moment after it is over, because the link being followed must not
// be rewritten under the finger.
function payslipsDoor(row) {
    const door = document.createElement('a');
    door.className = 'payslips-door';
    door.href = payslipsUrl(row);
    door.target = '_blank';
    door.rel = 'noopener noreferrer';
    door.textContent = SEDER_TEXT.go(isolate(row.name));
    door.dataset.payslipsFocus = `door:${row.workerId}`;
    door.addEventListener('click', event => {
        const now = Date.now();
        if (payslipsGuarded(now)) {
            event.preventDefault();
            return;
        }
        payslipsLastTap = now;
        payslipsMarkOpened(row);
        setTimeout(payslipsAfterGuard, PAYSLIPS_TAP_GUARD_MS);
    });
    return door;
}

// Back from WhatsApp, the list is brought up to date - the marks, and anything another
// phone recorded meanwhile.
function payslipsWatch() {
    if (typeof document === 'undefined' || !document.addEventListener) return;
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') renderPayslipsIfOpen();
    });
}

// The list was open when the app went away - iOS kills a home-screen app in the
// background, and WhatsApp in front is exactly when. Called once, after the boot has drawn
// (js/app.js). Not over another dialog the boot opened, and not when a reminder is what
// opened the app.
function resumePayslipsRun() {
    try {
        if (typeof location !== 'undefined'
            && new URL(location.href).searchParams.has('farkad-reminder')) return false;
    } catch (error) {
        return false;
    }
    if ([...document.querySelectorAll('.modal')].some(modal => modal.style.display === 'flex')) return false;
    const which = payslipsResumeWhich(Date.now());
    if (!which) return false;
    // On the screen it was opened from, on the section its entry lives on.
    REPORT_SECTION = 'workers';
    if (typeof showView === 'function') showView('reports');
    return openPayslips(which);
}

// The way in: one more row of «הפקת דוח», asked for by renderReportActions
// (js/ui/reports.js) each time that menu is built. On «לפי עובד» only - under «לפי אתר»
// the outputs are a client's, and a client's menu has no business offering the crew's pay.
function payslipsEntryButton() {
    if (REPORT_SECTION !== 'workers') return null;
    const entry = button(PAYSLIPS_TEXT.entry, 'btn-secondary payslips-entry', () => {
        // The menu shuts and its trigger takes the focus first, so that closing the list
        // gives the keyboard back to «הפקת דוח» - a thing on the screen - and not to this
        // row, which is inside a menu that is no longer open.
        const menu = entry.closest ? entry.closest('details') : null;
        const trigger = menu ? menu.querySelector('summary') : null;
        if (menu) menu.open = false;
        if (trigger && trigger.focus) trigger.focus({ preventScroll: true });
        openPayslips('current');
    });
    entry.id = 'payslipsEntry';
    return entry;
}

payslipsWatch();
